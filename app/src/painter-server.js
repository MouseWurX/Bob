// Keeps Bob's picture model loaded between pictures (1.6). Runs stable-diffusion.cpp's sd-server.exe, which loads
// the model once and then paints on request, instead of sd-cli.exe, which loads it from disk for every picture.
//
// What the rest of Bob can count on:
//   status()           -> { state, kind, vramBytes, since, lastError, restarts, via }  (a remembered summary, for show)
//   ready(kind)        -> true only if the process is alive AND sd-server itself says the right model is loaded (a real probe)
//   ensureReady(kind)  -> resolves once ready(kind) would say true; rejects with err.code (see CODES)
//   paint(kind, args)  -> { file, name, via: 'server' | 'cli', checked: true }; the file has been checked
//   unload(reason)     -> resolves once sd-server has exited and its graphics memory is gone
//   yieldFor(model, { bytes }) -> let go of the card unless that brain fits next to the painter right now
//   'state' event      -> the status() object, on every change
//
// Failures are not accepted quietly: a crash mid-picture restarts sd-server once and paints again; if that fails too,
// that picture is made with sd-cli. sd-server missing, too old (no /sdcpp/v1 API) or switched off in config
// (painter.sdcpp.server = false) means every picture uses sd-cli, as before 1.6.
//
// Idle: after each picture the painter gets the same short grace as Bob's big brains (2 minutes, or the idle time in
// Settings if that is shorter), then lets go. "Always on" never holds it. Its own setting override, for testing only:
// painter.sdcpp.keepLoadedSeconds.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { paint as paintCli, modelArgs, sizeFor, framesFor, checkOutput, stepsFor } from './painter.js';
import { bigGraceMs } from './brain-mode.js';
import { paintFlags, pictureFitFailed } from './tuning.js';
import { freeMemNow } from './platform.js';

export const CODES = ['painter_unavailable', 'painter_load_failed', 'painter_timeout', 'stopped'];
export const STATES = ['off', 'loading', 'ready', 'busy', 'error', 'unavailable'];
const GiB = 1024 ** 3;
const HEADROOM = 1 * GiB; // kept free on the card when the painter and a brain share it
const RAM_HEADROOM = 4 * GiB; // and in system memory, for Windows and the apps you have open

function fail(code, message, extra = {}) { return Object.assign(new Error(message), { code, ...extra }); }
const sleep = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

// A free port on this PC, so another program on Bob's usual port can never block the painter.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

// nvidia-smi ships with the NVIDIA driver. Both helpers answer null when it isn't there (unknown, not zero).
function smi(args) {
  return new Promise((resolve) => {
    try { execFile('nvidia-smi', args, { timeout: 3000, windowsHide: true }, (err, out) => resolve(err ? null : String(out))); }
    catch { resolve(null); }
  });
}
export async function vramOfPid(pid) {
  const out = await smi(['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits']);
  if (out == null) return null;
  const row = out.split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim())).find(([p]) => Number(p) === pid);
  return row ? Number(row[1]) * 1048576 : 0;
}
export async function freeVram() {
  const out = await smi(['--query-gpu=memory.free', '--format=csv,noheader,nounits']);
  const mb = out == null ? NaN : Number(out.split(/\r?\n/)[0]);
  return Number.isFinite(mb) ? mb * 1048576 : null;
}

// When Bob closes, every sd-server he started closes too (one hook for all painters).
const LIVE = new Set();
process.on('exit', () => { for (const p of LIVE) { try { p.child && p.child.kill(); } catch {} } });

export class PainterServer extends EventEmitter {
  // opts (tests): fetchImpl, vramOf(pid), freeVram(), now()
  constructor(cfg, opts = {}) {
    super();
    this.cfg = cfg;
    this.fetch = opts.fetchImpl || ((...a) => fetch(...a));
    this.vramOf = opts.vramOf || vramOfPid;
    this.freeVram = opts.freeVram || freeVram;
    this.freeRam = opts.freeRam || (() => freeMemNow());
    this.now = opts.now || (() => Date.now());
    this.log = opts.log || (() => {});
    this.child = null;
    this.url = null;
    this.sig = null;          // which model set is loaded (the exact start-up arguments)
    this.kind = null;
    this.loading = null;      // the promise of a load in progress, so two callers never start two servers
    this.jobs = 0;            // pictures in progress
    this.restarts = 0;
    this.lastError = null;
    this.noApi = null;        // set when this sd-server build has no /sdcpp/v1 API: path + file time
    this.vramBytes = 0;
    this._state = 'off';
    this.since = this.now();
    this.idleTimer = null;
    LIVE.add(this);
  }

  get s() { return this.cfg.painter?.sdcpp || {}; }

  // sd-server.exe sits next to sd-cli.exe in stable-diffusion.cpp's Windows zips. painter.sdcpp.serverExe overrides it.
  serverExe() {
    const s = this.s;
    if (s.server === false) return null;
    if (s.serverExe) return fs.existsSync(s.serverExe) ? s.serverExe : null;
    if (!s.exe) return null;
    const dir = path.dirname(s.exe);
    for (const n of ['sd-server.exe', 'sd-server']) { const p = path.join(dir, n); if (fs.existsSync(p)) return p; }
    return null;
  }

  // True when pictures can go through sd-server at all (else they use sd-cli).
  available() {
    const exe = this.serverExe();
    if (!exe) return false;
    if (this.noApi && this.noApi === this.exeStamp(exe)) return false;
    return true;
  }
  exeStamp(exe) { try { return `${exe}|${fs.statSync(exe).mtimeMs}`; } catch { return exe; } }

  setState(state, extra = {}) {
    if (extra.kind !== undefined) this.kind = extra.kind;
    if (extra.error !== undefined) this.lastError = extra.error;
    if (state !== this._state) { this._state = state; this.since = this.now(); }
    this.emit('state', this.status());
  }

  status() {
    const state = !this.available() && this._state === 'off' ? 'unavailable' : this._state;
    return { state, kind: this.kind, vramBytes: this.vramBytes, since: this.since, lastError: this.lastError, restarts: this.restarts, via: this.available() ? 'server' : 'cli' };
  }

  alive() { return Boolean(this.child && this.child.exitCode === null && this.child.signalCode === null); }

  // Everything sd-server is started with. The model set and the memory-saving flags; picture settings go per request.
  buildArgs(kind, port) {
    const s = this.s;
    const spec = s[kind];
    if (!spec) throw fail('painter_unavailable', `No ${kind} model is set for the painter.`);
    const flags = paintFlags(this.cfg, kind, spec);
    this.fitUsed = flags.fit;
    const extra = flags.extra.filter((a) => a !== '-M' && a !== 'vid_gen');
    return [
      ...(s.serverPreArgs || []),
      ...modelArgs(spec),
      ...extra,
      ...(flags.clipOnCpu ? ['--clip-on-cpu'] : []),
      ...(s.serverArgs || []),
      '--listen-ip', '127.0.0.1', '--listen-port', String(port)
    ];
  }
  signature(kind) { const s = this.s; const spec = s[kind] || {}; const f = paintFlags(this.cfg, kind, spec); return JSON.stringify([this.serverExe(), kind, spec, f.extra, f.clipOnCpu, s.serverArgs]); }

  async getJson(p, { timeout = 3000, signal } = {}) {
    const t = AbortSignal.timeout(timeout);
    const res = await this.fetch(this.url + p, { signal: signal ? AbortSignal.any([t, signal]) : t });
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, body };
  }

  // sd-server's own word on the model: 'ready' | 'loading' | 'empty' | 'error' | 'noapi' | 'down'.
  async probe() {
    if (!this.alive() || !this.url) return { state: 'down' };
    try {
      const r = await this.getJson('/sdcpp/v1/models/status');
      if (r.status === 404) return { state: 'noapi' };
      if (r.status === 503) return { state: 'loading' };
      return { state: r.body?.state || (r.ok ? 'ready' : 'down'), error: r.body?.error || null };
    } catch { return { state: 'down' }; }
  }

  // The real check: process alive, sd-server says loaded, and it's the model set this kind needs.
  async ready(kind) {
    if (!this.alive() || (kind && this.sig !== this.signature(kind))) return false;
    return (await this.probe()).state === 'ready';
  }

  async health() {
    if (!this.available()) return { ok: false, detail: 'sd-server not available; pictures use sd-cli' };
    if (!this.alive()) return { ok: true, detail: 'not loaded' };
    const p = await this.probe();
    return { ok: p.state === 'ready' || p.state === 'loading', detail: `${this.kind || '?'}: ${p.state}${p.error ? ` (${p.error})` : ''}` };
  }

  ensureReady(kind, { signal } = {}) {
    if (this.loading) return this.loading.then(() => (this.sig === this.signature(kind) ? undefined : this.ensureReady(kind, { signal })));
    this.loading = (async () => {
      if (await this.ready(kind)) return;
      await this.load(kind, { signal });
    })().finally(() => { this.loading = null; });
    return this.loading;
  }

  async load(kind, { signal } = {}) {
    if (!this.available()) throw fail('painter_unavailable', 'sd-server is not available.');
    const exe = this.serverExe();
    await this.stopProcess();
    await this.killLeftover();
    const port = await freePort();
    const args = this.buildArgs(kind, port);
    this.sig = this.signature(kind);
    this.url = `http://127.0.0.1:${port}`;
    this.setState('loading', { kind, error: null });
    try { fs.writeFileSync(path.join(this.cfg.dataDir, 'sd-server-args.txt'), [exe, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ') + '\n'); } catch {}
    let log = '';
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    this.childLog = () => log;
    const onData = (d) => {
      const t = d.toString();
      log = (log + t).slice(-6000);
      const m = [...t.matchAll(/(\d+)\/(\d+)\s*-/g)].at(-1);
      if (m && this.onProgress) this.onProgress(Number(m[1]), Number(m[2]));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const spawnErr = new Promise((_, reject) => child.once('error', (e) => reject(fail('painter_load_failed', `Couldn't start sd-server (${e.message}).`))));
    spawnErr.catch(() => {});
    child.once('exit', (code) => {
      if (this.child !== child) return;
      // Died on its own (not unloaded by Bob): forget it; the next picture starts it again.
      this.child = null; this.sig = null; this.vramBytes = 0;
      this.setState(this.jobs ? 'error' : 'off', { error: `sd-server stopped (code ${code}). ${log.slice(-300)}` });
    });
    try { fs.writeFileSync(this.pidFile(), String(child.pid)); } catch {}
    const deadline = this.now() + (this.s.loadTimeoutSeconds || 300) * 1000;
    try {
      for (;;) {
        if (signal?.aborted) throw fail('stopped', 'Stopped.');
        if (!this.alive()) {
          await Promise.race([spawnErr, sleep(50)]);
          throw fail('painter_load_failed', `sd-server stopped while loading the ${kind} model. Last output: ${log.slice(-500)}`);
        }
        const p = await this.probe();
        if (p.state === 'ready') break;
        if (p.state === 'noapi') {
          this.noApi = this.exeStamp(exe);
          throw fail('painter_unavailable', 'This sd-server build is too old (no /sdcpp/v1 API); pictures will use sd-cli.');
        }
        if (p.state === 'error') throw fail('painter_load_failed', `sd-server couldn't load the ${kind} model: ${p.error || log.slice(-300)}`);
        if (p.state === 'empty' && this.now() - this.since > 15000) {
          throw fail('painter_load_failed', `sd-server started without the ${kind} model loaded. Last output: ${log.slice(-300)}`);
        }
        if (this.now() > deadline) throw fail('painter_timeout', `The ${kind} model took too long to load.`);
        await sleep(400, signal);
      }
    } catch (e) {
      await this.stopProcess();
      this.setState(e.code === 'painter_unavailable' ? 'off' : 'error', { error: e.message });
      this.log('painter', `sd-server: ${e.message}`);
      throw e;
    }
    this.vramBytes = (await this.vramOf(child.pid)) || 0;
    this.setState('ready', { kind });
    this.log('painter', `sd-server ready with the ${kind} model`);
  }

  pidFile() { return path.join(this.cfg.dataDir || '.', 'sd-server.pid'); }

  // An sd-server left over from a crash of Bob would hold memory: stop it, but only if it really is sd-server.
  async killLeftover() {
    let pid;
    try { pid = Number(fs.readFileSync(this.pidFile(), 'utf8')); } catch { return; }
    try { fs.unlinkSync(this.pidFile()); } catch {}
    if (!pid || pid === process.pid) return;
    const name = await new Promise((resolve) => {
      if (process.platform === 'win32') {
        // The full command line (not just the image name), so a renamed exe or node running the test mock still matches.
        const ps = `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`;
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, out) => {
          if (!err && String(out).trim()) return resolve(String(out));
          execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 3000 }, (e2, o2) => resolve(e2 ? '' : String(o2)));
        });
      } else {
        // Linux: /proc. A Mac has no /proc, so ask ps for that one process's command line.
        try { resolve(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')); } catch {
          execFile('ps', ['-o', 'command=', '-p', String(pid)], { timeout: 3000 }, (e, o) => resolve(e ? '' : String(o)));
        }
      }
    });
    if (!/sd-server|mock-sd-server/i.test(name)) return;
    try { process.kill(pid); } catch { return; }
    for (let i = 0; i < 25; i++) { try { process.kill(pid, 0); } catch { return; } await sleep(200); }
  }

  // Stops the process and waits until it has really gone (killed hard after 8 s), then until the card shows its memory free.
  async stopProcess() {
    const c = this.child;
    this.child = null; this.sig = null;
    if (!c) return;
    try { fs.unlinkSync(this.pidFile()); } catch {}
    if (c.exitCode !== null || c.signalCode !== null) return;
    const gone = new Promise((r) => c.once('exit', r));
    try { c.kill(); } catch {}
    const soft = await Promise.race([gone.then(() => true), sleep(8000).then(() => false)]);
    if (!soft) {
      if (process.platform === 'win32') await new Promise((r) => execFile('taskkill', ['/PID', String(c.pid), '/T', '/F'], { windowsHide: true }, () => r()));
      else { try { c.kill('SIGKILL'); } catch {} }
      await Promise.race([gone, sleep(4000)]);
    }
    // The driver can take a moment to hand the memory back after the process ends.
    for (let i = 0; i < 20; i++) {
      const v = await this.vramOf(c.pid);
      if (!v) break;
      await sleep(250);
    }
    this.vramBytes = 0;
  }

  // Let go of the picture model. Waits for a picture in progress unless force (Stop everything).
  async unload(reason = 'asked', { force = false } = {}) {
    clearTimeout(this.idleTimer);
    if (this.loading && !force) await this.loading.catch(() => {});
    while (this.jobs > 0 && !force) await sleep(200);
    if (!this.child) { if (this._state !== 'off') this.setState('off'); return []; }
    const kind = this.kind;
    await this.stopProcess();
    this.setState('off');
    this.log('painter', `let go of the ${kind} model (${reason})`);
    return [`painter:${kind}`];
  }

  // Called before a brain loads. The painter stays only if that brain fits next to it right now (measured, with
  // 1 GB to spare); when nothing can be measured, it lets go, which is what Bob always did before 1.6.
  async yieldFor(model, { bytes } = {}) {
    if (!this.child) return [];
    while (this.jobs > 0) await sleep(200);
    if (Number(bytes) > 0) {
      const free = await this.freeVram();
      // Both have to fit: the card, and system memory too (the painter's weights wait in RAM with --offload-to-cpu,
      // and a brain that doesn't fit the card spills into RAM). Otherwise the two fight and both slow right down.
      const ram = Number(this.freeRam()) || 0;
      if (free != null && free - HEADROOM >= bytes && ram - RAM_HEADROOM >= bytes) { this.log('painter', `staying loaded: ${model} fits next to it`); return []; }
    }
    return this.unload(`making room for ${model || 'a brain'}`);
  }

  // How long the painter stays loaded after a picture.
  graceMs() {
    const k = Number(this.s.keepLoadedSeconds);
    return Number.isFinite(k) && k >= 0 ? k * 1000 : bigGraceMs(this.cfg);
  }
  armIdle() {
    clearTimeout(this.idleTimer);
    const ms = this.graceMs();
    this.idleTimer = setTimeout(() => { if (!this.jobs && !this.loading) this.unload('idle').catch(() => {}); }, ms);
    this.idleTimer.unref?.();
  }

  // The request body for sd-server's native API: the same numbers the sd-cli route uses.
  requestFor(kind, { prompt, negative, width, height, seconds, image, strength, refs }) {
    const s = this.s, spec = s[kind];
    const video = kind === 'video';
    const flags = paintFlags(this.cfg, kind, spec);
    const { W, H } = sizeFor(kind, { width: width || flags.size, height: height || flags.size });
    const b64 = (f) => fs.readFileSync(f).toString('base64');
    const extra = flags.extra;
    const neg = negative ? String(negative).slice(0, 1000) : spec.negative || '';
    const sample = {
      sample_steps: stepsFor(spec, kind),
      guidance: { txt_cfg: spec.cfg ?? (video ? 3.5 : 1.0) }
    };
    if (spec.sampler) sample.sample_method = spec.sampler;
    if (video ? spec.flowShift !== 0 : spec.flowShift) sample.flow_shift = spec.flowShift || 3.0;
    const body = {
      prompt: String(prompt).slice(0, 2000), negative_prompt: neg,
      width: W, height: H, seed: Math.floor(Math.random() * 2 ** 31),
      sample_params: sample,
      vae_tiling_params: { enabled: extra.includes('--vae-tiling') },
      preview: 'none'
    };
    if (video) {
      body.video_frames = framesFor(spec, seconds);
      if (spec.fps) body.fps = spec.fps;
      if (image) body.init_image = b64(image);
      body.output_format = s.videoFormat || 'webm';
    } else {
      body.batch_count = 1;
      body.output_format = 'png';
      if (image) { body.init_image = b64(image); body.strength = Math.min(0.95, Math.max(0.1, Number(strength) || 0.6)); }
      const r = (refs || []).slice(0, 4);
      if (r.length) body.ref_images = r.map(b64);
    }
    return body;
  }

  // One picture through sd-server. Throws with err.code; err.crashed when sd-server died or hung during it.
  async paintOnce(kind, args, { signal, onProgress }) {
    await this.ensureReady(kind, { signal });
    const video = kind === 'video';
    const body = this.requestFor(kind, args);
    this.setState('busy', { kind });
    this.onProgress = onProgress;
    const sub = await this.fetch(`${this.url}/sdcpp/v1/${video ? 'vid_gen' : 'img_gen'}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
    }).catch((e) => { throw fail('painter_load_failed', `sd-server didn't take the job (${e.message}).`, { crashed: !this.alive() }); });
    let job = null;
    try { job = await sub.json(); } catch {}
    if (sub.status === 429) throw fail('painter_load_failed', 'sd-server is busy.', { busy: true });
    if (!sub.ok || !job?.id) throw fail('painter_load_failed', `sd-server refused the job (${sub.status}): ${JSON.stringify(job?.error || job).slice(0, 300)}`);
    const timeoutAt = this.now() + (this.s.timeoutSeconds || (video ? 1800 : 300)) * 1000;
    let misses = 0;
    const cancel = async () => { try { await this.fetch(`${this.url}/sdcpp/v1/jobs/${job.id}/cancel`, { method: 'POST', signal: AbortSignal.timeout(3000) }); } catch {} };
    for (;;) {
      if (signal?.aborted) {
        await cancel();
        // A cancelled job should say so within a few seconds; if sd-server doesn't, it's stuck: stop it.
        let done = false;
        for (let i = 0; i < 20 && !done; i++) { await sleep(250); try { const r = await this.getJson(`/sdcpp/v1/jobs/${job.id}`); done = ['cancelled', 'failed', 'completed'].includes(r.body?.status); } catch {} }
        if (!done) await this.stopProcess();
        throw fail('stopped', 'Stopped.');
      }
      if (this.now() > timeoutAt) { await cancel(); await this.stopProcess(); throw fail('painter_timeout', `The ${video ? 'clip' : 'picture'} took too long.`); }
      if (!this.alive()) throw fail('painter_load_failed', `sd-server stopped in the middle of the ${video ? 'clip' : 'picture'}. ${this.childLog?.().slice(-300) || ''}`, { crashed: true });
      let r;
      try { r = await this.getJson(`/sdcpp/v1/jobs/${job.id}`); misses = 0; }
      catch {
        // Alive but not answering for 30 s: hung. Stop it so it can be started fresh.
        if (++misses > 60) { await this.stopProcess(); throw fail('painter_load_failed', 'sd-server stopped answering.', { crashed: true }); }
        await sleep(500, signal); continue;
      }
      const j = r.body || {};
      if (r.status === 404 || r.status === 410) throw fail('painter_load_failed', 'sd-server lost the job.', { crashed: true });
      if (j.preview?.step && j.preview?.total_steps && onProgress) onProgress(j.preview.step, j.preview.total_steps);
      if (j.status === 'completed') return this.save(kind, j.result || {});
      if (j.status === 'failed') throw fail('painter_load_failed', `sd-server couldn't make it: ${j.error?.message || 'unknown error'}`);
      if (j.status === 'cancelled') throw fail('stopped', 'Stopped.');
      await sleep(500, signal);
    }
  }

  save(kind, result) {
    const video = kind === 'video';
    const b64 = video ? result.b64_json : result.images?.[0]?.b64_json;
    if (!b64) throw fail('painter_load_failed', 'sd-server finished but sent no file.');
    const ext = video ? (result.output_format || this.s.videoFormat || 'webm') : 'png';
    const name = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const file = path.join(this.cfg.painterDir, name);
    fs.mkdirSync(this.cfg.painterDir, { recursive: true });
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    const check = checkOutput(file, kind);
    if (!check.ok) { try { fs.unlinkSync(file); } catch {} throw fail('painter_load_failed', `sd-server finished but ${check.why}.`); }
    return { file, name, via: 'server', checked: true };
  }

  // The painter's front door. sd-server first; one restart if it crashes or won't load; sd-cli for that picture if
  // it still fails. Only Stop, or sd-cli failing too, reaches the caller.
  async paint(kind, args, { signal, onProgress } = {}) {
    clearTimeout(this.idleTimer);
    this.jobs++;
    try {
      if (this.available()) {
        let lastErr = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const out = await this.paintOnce(kind, args, { signal, onProgress });
            this.setState('ready', { kind, error: null });
            return out;
          } catch (e) {
            if (e.code === 'stopped' || signal?.aborted) { if (this.alive()) this.setState('ready'); throw fail('stopped', 'Stopped.'); }
            lastErr = e;
            this.log('painter', `sd-server: ${e.message}`);
            // 1.5.24: a matched card setting that failed goes back to the small-card settings for the retry.
            if (this.fitUsed && this.fitUsed !== 'safe' && !e.busy) { pictureFitFailed(); this.log('painter', 'going back to the small-card picture settings until Bob restarts'); }
            if (e.code === 'painter_unavailable' || e.code === 'painter_timeout') break;
            if (e.busy) { await sleep(2000, signal); continue; }
            // Crashed, hung or refused: start fresh once.
            this.restarts++;
            await this.stopProcess();
            this.setState('off', { error: e.message });
          }
        }
        if (lastErr?.code === 'painter_timeout') throw lastErr;
        this.log('painter', `using sd-cli for this ${kind === 'video' ? 'clip' : 'picture'} (${lastErr?.message || 'sd-server unavailable'})`);
        await this.stopProcess();
        if (this._state !== 'off') this.setState('off');
      }
      this.onProgress = null;
      try { return await paintCli(this.cfg, kind, args, { signal, onProgress }); }
      catch (e) { if (signal?.aborted) throw fail('stopped', 'Stopped.'); throw e; }
    } finally {
      this.jobs--;
      this.onProgress = null;
      if (this.alive()) this.armIdle();
    }
  }
}
