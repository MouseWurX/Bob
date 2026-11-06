// Bob's own engine: runs llama.cpp's llama-server.exe himself, one model at a time.
// Same interface as the Ollama client, so the brain doesn't care which engine is in use.
// Models are found by Ollama name in Ollama's model folder (no duplicate downloads), or set by path in config.
import { replyStats } from './speed-stats.js';
import fs from 'node:fs';
import { commandLineOf } from './util.js';
import { saveNameOf, idFolderFile } from './models.js';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile, spawnSync } from 'node:child_process';
import { tidySchema } from './toolbox.js';
import { templateFor, samplingFor } from './model-family.js';
import { gaming, LONG_CODER } from './sessions.js';
import { gamingCard, decideCard, readCard, CARD_BUSY_PCT, CARD_MIN_FREE_MB } from './gaming-card.js';
import { tuning, cpuPlan, startDir, startFile, promptHash, tidyStarts } from './tuning.js';
import { exeName } from './platform.js';
import { Embedder } from './embedder.js';
import { ggufInfo } from './gguf.js';

// 1.5.19: the context a brain gets when nothing else picks one. 32K fits a 26B brain on a 16 GB card.

// 1.5.29: some brains write their tool calls as text instead of real calls on Bob's engine:
//   qwen2.5-coder: a bare {"name": ..., "arguments": {...}} (sometimes in ```json fences or <tool_call> tags);
//   gpt-oss: Harmony tokens, "<|channel|>commentary to=functions.NAME ... <|message|>{...}<|call|>".
// When there is no real call and the text is one of these, naming a tool Bob offered, it becomes a real call.
export const TEXT_CALL_START = /^(\{|```|<tool_call>|<\|)/;
const parseJson = (t) => { try { return JSON.parse(t); } catch { return undefined; } };
export function cleanHarmony(text) {
  const final = String(text).match(/<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|(?:end|return)\|>|$)/);
  if (final) return final[1].trim();
  return String(text).replace(/<\|start\|>assistant/g, '').replace(/<\|channel\|>analysis<\|message\|>[\s\S]*?<\|end\|>/g, '').replace(/<\|[a-z]+\|>/g, '').trim();
}
export function textCalls(content, names) {
  const text = String(content || '').trim();
  if (!text) return null;
  const calls = [];
  const add = (name, args) => {
    if (!names.has(name)) return;
    const a = typeof args === 'string' ? parseJson(args) : args;
    calls.push({ function: { name, arguments: a && typeof a === 'object' ? a : {} } });
  };
  // gpt-oss (Harmony)
  for (const m of text.matchAll(/to=functions\.([\w.-]+)[^<]*?(?:<\|constrain\|>\s*\w+\s*)?<\|message\|>([\s\S]*?)(?:<\|call\|>|<\|end\|>|$)/g)) add(m[1], m[2].trim());
  if (calls.length) return { calls, text: '' };
  // <tool_call>{...}</tool_call>, possibly several
  for (const m of text.matchAll(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g)) { const o = parseJson(m[1]); if (o?.name) add(o.name, o.arguments ?? o.parameters ?? {}); }
  if (calls.length) return { calls, text: '' };
  // A lone JSON object (or a list of them), maybe in ```json fences
  const body = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const o = parseJson(body);
  for (const c of Array.isArray(o) ? o : [o]) if (c && typeof c === 'object' && typeof c.name === 'string') add(c.name, c.arguments ?? c.parameters ?? {});
  return calls.length ? { calls, text: '' } : null;
}
const samePath = (a, b) => Boolean(a && b) && path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
export const DEFAULT_CTX = 32768;
// 1.5.19: Medium thinks, but only this long (tokens of thinking), then it is asked to answer.
export const THINK_BUDGET = { medium: 1536 };
// 1.5.68: the always-thinking Coding copy (Qwen3.6) gets a budget at every effort too. On the PC it once thought for
// 10 minutes (about 45K tokens) on a small hand-off without answering; in the race every task finished in under
// 6,400 tokens. Medium keeps its shorter budget above.
export const LONG_THINK_BUDGET = 12288;
// And every request has a ceiling on how much it may write (thinking plus answer), so no single reply runs forever.
export const MAX_REPLY_TOKENS = 32768;
export function thinkBudget(model, think) {
  if (think === false) return 0;
  return THINK_BUDGET[think] || (LONG_CODER.test(String(model || '')) ? LONG_THINK_BUDGET : 0);
}

// How long a brain may sit unused in memory: the shared setting ollamaKeepAlive ("10m", "30m", "1h", or "-1" for never).
// Both engines use it: Ollama through keep_alive, Bob's own engine through the idle check below (1.5.2).
export function keepAliveMs(cfg) {
  const k = String(cfg?.ollamaKeepAlive ?? '5m');
  if (k === '-1') return Infinity;
  const m = k.match(/^(\d+)([smh])$/);
  return m ? Number(m[1]) * { s: 1000, m: 60000, h: 3600000 }[m[2]] : 300000;
}

// 1.5.51 "second brain beside big jobs": Bob's engine can run a second llama-server beside the main one. It holds a
// quick chat reply's small brain while a big job keeps the main brain on the card, and (opt-in) the reviewer for a moot.
// Where it goes (E4B belongs on the graphics card when it has room): on
// the graphics card when the card has room for it as well (and isn't busy), otherwise on the processor, where it never
// sees the card (CUDA_VISIBLE_DEVICES=-1). Never in Gaming. Below normal priority, half the cores, and let go as soon as
// nothing needs it. A call goes to it when its options carry beside: true.
export const BESIDE = 'beside';
export function besideThreads(cpus = os.cpus()) {
  const logical = cpus.length || 2;
  const pairs = /AMD|Intel/i.test(String(cpus[0]?.model || '')) && logical % 2 === 0 && logical >= 4;
  return Math.max(2, Math.floor((pairs ? logical / 2 : logical) / 2));
}

// 1.5.52 / 1.5.61: the mid-chat system note fold lives in system-notes.js, so Ollama uses it too.
import { MID_SYSTEM_REFUSED, foldSystem } from './system-notes.js';
export { MID_SYSTEM_REFUSED, foldSystem };

// 1.5.35 (a function since 1.5.72, so the housekeeper can find the embedding file too): see catalogFile below.
export function catalogFileFor(cfg, id) {
  if (!/^[\w.:/-]+$/.test(id)) return null;
  try {
    const cat = JSON.parse(fs.readFileSync(cfg.catalogFile || new URL('../catalog.json', import.meta.url), 'utf8'));
    const e = cat.models.find((m) => m.id === id) || cat.models.find((m) => m.ollama && (m.ollama === id || `${m.ollama}:latest` === id || m.ollama === `${id}:latest`));
    const f = e?.files?.find((x) => x.role === 'gguf');
    if (!f) return null;
    const root = cfg.bobModelsDir || path.join(cfg.agentDir, 'models', 'bob');
    let dirs = [e.category];
    try { dirs = [e.category, ...fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)]; } catch {}
    // Its own folder first; an older Bob may have filed it under another one (for example chat instead of coding).
    const find = (x) => { const name = saveNameOf(x); return dirs.map((dir) => path.join(root, dir, name)).find((p) => fs.existsSync(p) && !fs.existsSync(p + '.part')) || idFolderFile(cfg, e, x); };
    const file = find(f);
    if (!file) return null;
    // 1.5.56: a brain that sees pictures has a second file, its picture reader (mmproj), saved under its own name.
    const pj = e.files.find((x) => x.role === 'mmproj');
    const mmproj = pj ? find(pj) : null;
    return mmproj ? { gguf: file, mmproj } : { gguf: file };
  } catch { return null; }
}

export class LlamaCpp {
  // Read fresh each time, so speed settings changed in the app apply to the next brain load.
  get lc() { return this.cfg.llamacpp || {}; }

  constructor(cfg, { role = 'main' } = {}) {
    this.cfg = cfg;
    this.role = role;
    this.tag = role === BESIDE ? '-beside' : '';
    this.port = role === BESIDE ? (this.lc.besidePort || (this.lc.port || 8091) + 1) : (this.lc.port || 8091);
    this.url = `http://127.0.0.1:${this.port}`;
    this.child = null;
    this.current = null;
    this.now = () => Date.now();
    this.lastUse = this.now();
    this.active = 0; // chats running right now
    this.isBusy = () => false; // the brain sets this: a turn or a queued job that is working
    this.holdModel = () => null; // the brain sets this: the model "Always on" keeps loaded (never idle-unloaded)
    // Unload the brain once it has been idle longer than the keep-alive, so a quiet Bob gives the graphics card back.
    this.idleTimer = setInterval(() => { this.idleTick().catch(() => {}); }, 60_000);
    this.idleTimer.unref?.();
    this.timesFile = path.join(cfg.dataDir, `load-times-llamacpp${this.tag}.json`);
    try { this.loadTimes = JSON.parse(fs.readFileSync(this.timesFile, 'utf8')); } catch { this.loadTimes = {}; }
    const stop = () => { try { this.child && this.child.kill(); } catch {} };
    process.on('exit', stop);
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(0); });
  }

  // The second server, made the first time something asks for it. Only the main engine has one.
  besideServer() {
    if (this.role === BESIDE) return this;
    if (!this.beside) {
      this.beside = new LlamaCpp(this.cfg, { role: BESIDE });
      this.beside.log = (k, t) => this.log?.(k, t);
      this.beside.resolve = (m) => this.resolve(m); // same model files (tests replace resolve on the main engine)
      this.beside.catalogFile = (id) => this.catalogFile(id);
      this.beside.main = this; // so a card reader set on the main engine (tests) also counts for the second server
      // 1.5.53: the brain hears when a second brain joins or leaves (chat page: second-brain events, Bob's head grows).
      this.beside.changed = (ev) => { try { this.onBeside?.(ev); } catch {} };
    }
    return this.beside;
  }
  // 1.5.51: 'whole' (on the graphics card) or 'none' (processor only) for a brain on the second server. The card is
  // used only when it's not busy and has room for the brain, its chat memory and the usual 1.5 GB to spare.
  async besidePlace(model, ctx) {
    const b = this.role === BESIDE ? this : this.besideServer();
    if (gaming(this.cfg) || this.lc.besideOnCard === false) return 'none';
    let mb = 0;
    try { mb = fs.statSync(this.resolve(model).gguf).size / 1048576; } catch { return 'none'; }
    const card = await (b.cardReaders?.card || this.cardReaders?.card || this.main?.cardReaders?.card || readCard)().catch(() => null);
    if (!card) return 'none';
    const need = mb * 1.15 + Math.min(ctx || this.lc.ctx || DEFAULT_CTX, 131072) * 60 / 1024 + CARD_MIN_FREE_MB;
    const place = card.util < CARD_BUSY_PCT && card.freeMB >= need ? 'whole' : 'none';
    b.placed = { model, place, at: Date.now() };
    return place;
  }

  // Where a call goes: beside: true sends it to the second server (made on demand), always on the processor.
  route(opts) { return opts?.beside && this.role !== BESIDE ? this.besideServer() : null; }
  besideLoaded() { return Boolean(this.beside?.current && this.beside.child && this.beside.child.exitCode === null); }
  // Let go of the second server's brain. Returns the names unloaded.
  async dropBeside() {
    if (!this.beside?.current) { await this.beside?.stopServer?.(); return []; }
    const was = this.beside.current;
    await this.beside.stopServer();
    return [was];
  }

  // 1.5.35: also by Ollama name (like "gpt-oss:20b"): when Bob's own pinned copy of that model is downloaded, his engine
  // uses it instead of Ollama's copy. Measured: Ollama's gpt-oss blob has no chat template and got 2 of 25 tool jobs
  // right on llama.cpp; the official file got 25 of 25.
  catalogFile(id) { return catalogFileFor(this.cfg, id); }

  // 1.5.87: the longest context a model was made for, from its GGUF header, so nothing asks for more (null: unknown).
  async maxCtx(model) {
    try { return ggufInfo(this.resolve(model).gguf)?.ctxTrain || null; } catch { return null; }
  }

  // Ollama name -> GGUF file (+ vision projector), by reading Ollama's manifest.
  resolve(model) {
    const override = this.lc.models?.[model];
    if (override && typeof override !== 'string') return override;
    // 1.5.74: an Equip from before 1.5.74 saved only the file path, which dropped the picture reader (mmproj). When
    // that path is Bob's own copy of a catalogue model, use the full copy (with its picture reader) instead.
    if (override) { const own = this.catalogFile(model); return own && samePath(own.gguf, override) ? own : { gguf: override }; }
    // 1.5.25: a Get models id (like "qwen3-4b") that was downloaded but never picked in a slot: its file in Bob's models folder.
    const own = this.catalogFile(model);
    if (own) return own;
    const dir = this.lc.ollamaModelsDir || path.join(this.cfg.agentDir, 'models');
    let [name, tag = 'latest'] = model.split(':');
    const parts = name.includes('/') ? name.split('/') : ['library', name];
    const manifest = path.join(dir, 'manifests', 'registry.ollama.ai', ...parts, tag);
    let m;
    try { m = JSON.parse(fs.readFileSync(manifest, 'utf8')); } catch { throw new Error(`I can't find the model files for ${model} (looked in ${manifest}).`); }
    const blob = (type) => {
      const layer = (m.layers || []).find((l) => l.mediaType === `application/vnd.ollama.image.${type}`);
      return layer ? path.join(dir, 'blobs', layer.digest.replace(':', '-')) : null;
    };
    const gguf = blob('model');
    if (!gguf) throw new Error(`${model} has no model file in its manifest.`);
    return { gguf, mmproj: blob('projector') };
  }

  async health() {
    try { return (await fetch(this.url + '/health', { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
  }

  // 1.5.49: what loading this brain does to the ones already loaded. Bob's own engine holds one brain at a time,
  // so a different brain always swaps the current one out (the picture engine is separate and isn't touched).
  // 1.5.51: beside: true loads it on the second server, so the main brain stays (an add).
  async loadPlan(model, opts = {}) {
    const all = await this.loaded();
    const now = all.map((m) => m.name);
    if (this.route(opts)) {
      const main = all.filter((m) => !m.beside).map((m) => m.name);
      const besideNow = all.filter((m) => m.beside && m.name !== model).map((m) => m.name);
      const onCard = (await this.besidePlace(model, opts.ctx)) === 'whole';
      return { before: now, drop: besideNow, keep: main, single: false, beside: true, onCard };
    }
    const mainNow = all.filter((m) => !m.beside).map((m) => m.name);
    return { before: now, drop: mainNow.filter((n) => n !== model), keep: [], single: true };
  }

  async loaded() {
    const side = this.role !== BESIDE && this.beside ? (await this.beside.loaded()).map((m) => ({ ...m, beside: true, onCard: this.beside.currentCard === 'whole', ...(this.beside.currentCard === 'whole' ? {} : { vram: 0, split: true }) })) : [];
    if (!(this.current && this.child && this.child.exitCode === null)) return side;
    let size = 0;
    try { size = fs.statSync(this.resolve(this.current).gguf).size; } catch {}
    const vram = this.role === BESIDE && this.currentCard !== 'whole' ? 0 : await this.vramOf(this.child.pid);
    // Without a per-process figure from nvidia-smi, how the model splits between card and RAM is unknown.
    return [{ name: this.current, own: Boolean(this.currentOwn), size, vram, split: vram > 0, ctx: this.currentCtx || this.lc.ctx || DEFAULT_CTX }, ...side];
  }

  // Graphics memory llama-server holds, in bytes, from nvidia-smi (ships with the NVIDIA driver). 0 when unknown.
  vramOf(pid) {
    return new Promise((resolve) => {
      try {
        execFile('nvidia-smi', ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'], { timeout: 3000, windowsHide: true }, (err, out) => {
          if (err) return resolve(0);
          const row = String(out).split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim())).find(([p]) => Number(p) === pid);
          resolve(row && Number(row[1]) > 0 ? Number(row[1]) * 1048576 : 0);
        });
      } catch { resolve(0); }
    });
  }

  // Called every minute: stop llama-server once nothing has used it for longer than the keep-alive.
  // The next chat loads the brain again, as after a restart. Returns true when it unloaded.
  async idleTick() {
    if (!this.child || this.child.exitCode !== null || this.active > 0) return false;
    let busy = false;
    try { busy = Boolean(this.isBusy()); } catch {}
    if (busy) { this.lastUse = this.now(); return false; }
    // 1.5.32: Gaming on Automatic: when the right use of the card has changed (a game started or stopped using it, or the
    // processor filled up), stop the brain. The next chat loads it the new way (about a second for the Gaming brain).
    if (this.currentCard && gaming(this.cfg) && gamingCard(this.cfg) === 'auto') {
      const now = await this.gamingCardPlan(this.current);
      if (now !== this.currentCard && this.active === 0) { this.cardFlip = { from: this.currentCard, to: now, at: this.now() }; await this.stopServer(); return true; }
    }
    let hold = null;
    try { hold = this.holdModel(); } catch {}
    if (hold && hold === this.current) { this.lastUse = this.now(); return false; }
    if (this.now() - this.lastUse <= keepAliveMs(this.cfg)) return false;
    this.idleUnloaded = this.current;
    await this.stopServer();
    return true;
  }

  // 1.5.32: 'none', 'borrow' or 'whole' for the Gaming brain (see gaming-card.js). Tests replace readCard / readCpu.
  async gamingCardPlan(model) {
    let brainMB = 0;
    try { brainMB = Math.round(fs.statSync(this.resolve(model).gguf).size / 1048576); } catch {}
    return decideCard(this.cfg, { brainMB, ...(this.cardReaders ? { read: this.cardReaders } : {}) });
  }

  // ctx: the session's context size. A different size means restarting llama-server with it.
  // cpu (1.5.12, Low effort on the processor): the same model on the card is a different load, and the other way round.
  async isLoaded(model, { ctx, cpu = false, beside = false } = {}) {
    const b = this.route({ beside });
    if (b) return b.isLoaded(model, { ctx, cpu: true });
    return this.current === model && (!ctx || this.currentCtx === ctx) && Boolean(this.currentCpu) === Boolean(cpu) && this.child && this.child.exitCode === null && (await this.health());
  }

  // --fit came in with newer llama.cpp builds; older ones would refuse to start with it.
  fitOn() {
    if (typeof this.lc.fit === 'boolean') return this.lc.fit;
    return this.buildNo() >= 12000; // 1.5.91: the same marker lookup as the load flag
  }

  // The llama-server Bob starts: the one set by hand, or the one in his engine folder.
  exePath() { return this.lc.exe || path.join(this.cfg.agentDir, 'llama.cpp', exeName('llama-server')); }
  // llama.cpp build number (0 when unknown). 1.5.91: the marker next to the exe first (the bundled engine and an
  // engine set by hand carry their own), then the one in Bob's engine folder.
  buildNo() {
    for (const dir of [path.dirname(this.exePath()), path.join(this.cfg.agentDir, 'llama.cpp')]) {
      try { const n = Number(String(JSON.parse(fs.readFileSync(path.join(dir, 'bob-llamacpp.json'), 'utf8')).version).replace(/^b/, '')); if (n) return n; } catch {}
    }
    return 0;
  }
  // 1.5.91: with no marker, ask the engine itself once (its --help) which load flag it knows. Only a real
  // llama-server is asked; anything else, or no answer within 5 s, counts as unknown.
  loadFlag() {
    const n = this.buildNo();
    if (n) return n >= 12032 ? 'load-mode' : 'no-mmap';
    const exe = this.exePath();
    if (this._loadFlag && this._loadFlag.exe === exe) return this._loadFlag.flag; // asked once per exe
    let flag = null;
    if (/llama-server/i.test(path.basename(exe)) && fs.existsSync(exe)) {
      try {
        const r = spawnSync(exe, ['--help'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
        const text = `${r.stdout || ''}${r.stderr || ''}`;
        flag = /--load-mode\b/.test(text) ? 'load-mode' : /--no-mmap\b/.test(text) ? 'no-mmap' : null;
      } catch {}
    }
    this._loadFlag = { exe, flag };
    return flag;
  }

  // 1.5.90: no memory-mapping when some of the brain is placed in RAM on the card route (see buildArgs).
  readsWhole(args, cpu) {
    if (cpu || this.lc.loadMode === 'mmap') return false;
    if (args.some((a) => ['--mmap', '--no-mmap', '--load-mode', '-lm'].includes(a))) return false; // set by hand
    return args.some((a) => ['--fit', '--n-cpu-moe', '-ncmoe', '--cpu-moe', '-ot', '--override-tensor'].includes(a));
  }
  // --load-mode is in the builds Bob ships (b12032, the one tested); older builds only know --no-mmap.
  // 1.5.91: when the build can't be told, no flag at all (b12032 refuses --no-mmap, so a guess can stop the engine).
  noMmapArgs() { const f = this.loadFlag(); return f === 'load-mode' ? ['--load-mode', 'none'] : f === 'no-mmap' ? ['--no-mmap'] : []; }

  // A model can see pictures when it has a vision projector (mmproj) and vision isn't switched off.
  async hasVision(model) {
    try { return Boolean(this.resolve(model).mmproj) && this.lc.vision !== false; } catch { return false; }
  }

  // Whether llama.cpp's --fit places the layers: on the card, unless a placement is pinned by hand or fit is off.
  fitsItself(args, cpu) {
    const pinned = args.some((a) => ['--n-cpu-moe', '-ncmoe', '--cpu-moe', '-ot', '--override-tensor', '--fit'].includes(a));
    return !pinned && !cpu && this.fitOn();
  }

  // Layers on the card, when set outright: none on the processor, or a number set by hand (gpuLayers).
  // 1.5.32: card 'whole' (Gaming, Automatic, processor at full load) puts the whole small brain on the card.
  layerArgs(cpu, card) {
    if (cpu && card === 'whole') return ['-ngl', '999'];
    if (cpu) return ['-ngl', '0'];
    return Number.isInteger(this.lc.gpuLayers) ? ['-ngl', String(this.lc.gpuLayers)] : [];
  }

  // Everything llama-server is started with, in one place so it can be tested.
  buildArgs(model, { ctx, cpu = false, card } = {}) {
    if (this.role === BESIDE) cpu = true;
    const lc = this.lc;
    const { gguf, mmproj, args: modelArgs } = this.resolve(model);
    const num = (v, flag) => (Number.isInteger(v) && v > 0 ? [flag, String(v)] : []);
    const args = [
      ...(lc.preArgs || []),
      '-m', gguf, '--host', '127.0.0.1', '--port', String(this.port),
      // 1.5.19: 32K by default (131072 spilled a 26B brain past a 16 GB card into system RAM and crawled at 5 tok/s).
      '-c', String(ctx || lc.ctx || DEFAULT_CTX), ...this.layerArgs(cpu, card), '--jinja',
      ...(mmproj && lc.vision !== false ? ['--mmproj', mmproj] : []),
      ...(lc.args || ['-fa', 'on', '-ctk', 'q8_0', '-ctv', 'q8_0']),
      ...(this.role === BESIDE ? ['-t', String(besideThreads())] : cpu && cpuPlan(this.cfg) ? ['-t', String(cpuPlan(this.cfg).threads), ...(cpuPlan(this.cfg).range ? ['--cpu-range', cpuPlan(this.cfg).range] : [])] : num(lc.threads, '-t')),
      ...num(lc.batch, '-b'), ...num(lc.ubatch, '-ub'),
      // 1.5.24 "Get Bob ready while you type": on the processor, his reading of the instructions is kept on disk.
      ...(cpu && tuning(this.cfg).readyWhileTyping ? ['--slot-save-path', startDir(this.cfg)] : []),
      ...(modelArgs || lc.modelArgs?.[model] || []),
      // Mixture-of-experts models: keep this many layers' experts in system RAM so the rest fits the card.
      ...(Number.isInteger(lc.nCpuMoe?.[model]) ? ['--n-cpu-moe', String(lc.nCpuMoe[model])] : [])
    ];
    // --fit: llama.cpp places layers to fit the card's free memory right now (other apps included), which
    // beat a fixed --n-cpu-moe on a 16 GB card. Used unless a placement is pinned by hand or fit is off.
    // 1.5.19: with --fit there is no -ngl, because a set -ngl stops fit from trimming (it then overfilled the card).
    // Without fit, every layer goes on the card as before.
    if (this.fitsItself(args, cpu)) args.push('--fit', 'on');
    else if (!args.includes('-ngl')) args.push('-ngl', '999');
    // When part of the brain stays in RAM (fit, or experts kept on the processor), read it all in at load instead of
    // letting Windows page it in during the first request. PC test 2026-11-04 (Qwen3.6, --fit, 128K): first reply
    // 27 s -> 1.4 s and RAM 21 -> 12 GB, for about 10 s more load. llamacpp.loadMode "mmap" keeps the old way.
    if (this.readsWhole(args, cpu)) args.push(...this.noMmapArgs());
    // 1.5.19: one conversation at a time, so it gets the whole context (more slots split it into small pieces).
    if (!args.some((a) => ['-np', '--parallel'].includes(a))) args.push('-np', '1');
    args.push(...this.templateArgs(model, gguf, args));
    // Speculative decoding: a small "draft" model guesses ahead and the big one checks, often 1.5-2x faster.
    const d = lc.draft;
    if (d?.model && d.model !== model && d.enabled !== false && !cpu) {
      // A file path (a .gguf, or a draft blob inside Ollama's models folder) or an Ollama model name.
      const draft = path.isAbsolute(d.model) || /\.gguf$/i.test(d.model) ? d.model : this.resolve(d.model).gguf;
      args.push('-md', draft, ...num(d.max ?? 16, '--draft-max'), ...num(d.min ?? 1, '--draft-min'), '-ngld', String(d.ngld ?? 99));
    }
    return args;
  }

  // 1.5.32: a brain file with no chat template of its own gets its family's (model-family.js), so tool calls keep
  // the format the brain was trained on instead of llama.cpp's generic ChatML fallback.
  templateArgs(model, gguf, args = []) {
    if (args.some((a) => ['--chat-template', '--chat-template-file'].includes(a))) return [];
    try { const t = templateFor(this.lc, model, gguf); return t ? ['--chat-template-file', t] : []; } catch { return []; }
  }

  // 1.5.32: the family's recommended sampling for this request ({} = llama-server's own defaults).
  sampling(model, { tools, think } = {}) {
    let gguf = null;
    try { gguf = this.resolve(model).gguf; } catch {} // no file found: the family comes from the name alone
    try { return samplingFor(this.lc, model, gguf, { tools, think }); } catch { return {}; }
  }

  // ---------- Get Bob ready while you type (1.5.24) ----------
  async slotAction(action, filename) {
    const res = await fetch(`${this.url}/slots/0?action=${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename }), signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`slot ${action}: ${res.status}`);
  }

  // Loads the saved reading for this brain, if there is one. Pictures-capable brains can't save one (llama-server).
  async restoreStart(model, ctx) {
    const name = startFile(model, ctx || this.lc.ctx || DEFAULT_CTX);
    const file = path.join(startDir(this.cfg), name);
    if (!fs.existsSync(file) || (await this.hasVision(model))) return false;
    try {
      await this.slotAction('restore', name);
      this.primedHash = JSON.parse(fs.readFileSync(file.replace(/\.bin$/, '.json'), 'utf8')).hash || null;
      return true;
    } catch { this.primedHash = null; return false; }
  }

  // Reads the instructions (system prompt and tools) now, so the next message only has to read itself.
  // The reply is one word, thrown away; llama-server keeps the reading for the next request. On the processor the
  // reading is also saved to disk. Returns 'ready' (already read), 'read' or 'saved'.
  async prime(model, { ctx, cpu = false, messages, tools } = {}) {
    if (this.current !== model || !this.child || this.child.exitCode !== null) return null;
    const hash = promptHash(messages, tools);
    if (this.primedHash === hash) return 'ready';
    this.active++;
    try {
      const res = await fetch(this.url + '/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages: [...LlamaCpp.toOpenAI(messages), { role: 'user', content: '.' }], tools: tools?.length ? tools : undefined, max_tokens: 1, stream: false, cache_prompt: true, chat_template_kwargs: { enable_thinking: false } }),
        signal: AbortSignal.timeout(600000)
      });
      if (!res.ok) throw new Error(`llama-server returned ${res.status}`);
      await res.text();
      this.primedHash = hash;
      if (!cpu || !tuning(this.cfg).readyWhileTyping || (await this.hasVision(model))) return 'read';
      const name = startFile(model, ctx || this.lc.ctx || DEFAULT_CTX);
      await this.slotAction('save', name);
      try { fs.writeFileSync(path.join(startDir(this.cfg), name.replace(/\.bin$/, '.json')), JSON.stringify({ hash, model, ctx, saved: new Date().toISOString() })); } catch {}
      tidyStarts(startDir(this.cfg), model, name);
      return 'saved';
    } finally { this.active--; this.lastUse = this.now(); }
  }

  async estimateLoad(model, opts) {
    const b = this.route(opts);
    if (b) return b.estimateLoad(model);
    if (this.loadTimes[model]) return Math.round(this.loadTimes[model]);
    try {
      const gb = fs.statSync(this.resolve(model).gguf).size / 1e9;
      return Math.max(5, Math.round(gb * 0.9));
    } catch { return 15; }
  }

  // Lets go of one brain (Bob's own engine holds one at a time). Returns the names unloaded.
  // 1.5.51: beside: true only the second server's; otherwise the main one's (the second server is let go by dropBeside).
  async unload(model, opts) {
    if (this.route(opts)) return this.beside?.current === model ? this.dropBeside() : [];
    if (!this.current || this.current !== model) return [];
    await this.stopServer();
    return [model];
  }

  // Counts as use, so the idle clock starts again (someone is typing).
  touch(model, opts) { const b = this.route(opts); if (b) return b.touch(); this.lastUse = this.now(); }

  // 1.5.40: make room on the graphics card. A brain running on the processor stays (Art keeps chatting on it while a
  // picture paints); one on the card goes.
  async unloadGpu() {
    const side = this.beside?.currentCard === 'whole' ? await this.dropBeside() : []; // 1.5.51: the second server only if it sits on the card
    if (this.current && this.currentCpu && !['whole', 'borrow'].includes(this.currentCard)) return side;
    const was = this.current;
    await this.stopServer();
    return [...(was ? [was] : []), ...side];
  }

  // 1.5.72: the Memory slot's embedding model, on its own small server (src/embedder.js). Same call as Ollama's.
  embedder() {
    if (this.role === BESIDE) return this.main.embedder();
    return (this.embedServer ||= new Embedder(this.cfg, { resolve: (m) => this.catalogFile(m), port: this.lc.embedPort || this.port + 2 }));
  }
  async embed(model, input) { return this.embedder().embed(model, input); }

  async unloadAll() {
    const was = this.current;
    if (this.role !== BESIDE) this.embedServer?.stop();
    const side = this.role !== BESIDE ? await this.dropBeside() : [];
    await this.stopServer();
    return [...(was ? [was] : []), ...side];
  }

  async stopServer() {
    const c = this.child;
    if (this.role === BESIDE && this.current) this.changed?.({ action: 'leave', model: this.current });
    this.child = null;
    this.current = null;
    this.currentCtx = null;
    this.currentCpu = false;
    this.currentCard = null;
    if (!c || c.exitCode !== null) return;
    await new Promise((r) => { c.once('exit', r); c.kill(); setTimeout(r, 5000); });
  }

  async preload(model, signal, { ctx, cpu = false, beside = false } = {}) {
    const b = this.route({ beside });
    if (b) return b.preload(model, signal, { ctx, cpu: true });
    if (this.role === BESIDE) cpu = true;
    const t0 = Date.now();
    this.lastUse = this.now();
    // 1.5.32: in the Gaming session the "Gaming: graphics card" switch decides how much of the card the brain may use.
    // 1.5.51: the second server: the place picked for the load line (if fresh), or a new look at the card.
    const fresh = this.placed && this.placed.model === model && Date.now() - this.placed.at < 60000 ? this.placed.place : null;
    const card = this.role === BESIDE ? (fresh || (await this.besidePlace(model, ctx))) : cpu && gaming(this.cfg) ? await this.gamingCardPlan(model) : null;
    this.placed = null;
    const args = this.buildArgs(model, { ctx, cpu, card });
    await this.stopServer();
    // A llama-server left over from a crash would hold the port: stop it first.
    const pidFile = path.join(this.cfg.dataDir, `llama-server${this.tag}.pid`);
    try {
      const old = Number(fs.readFileSync(pidFile, 'utf8'));
      fs.rmSync(pidFile, { force: true });
      if (old && old !== process.pid && /llama-server/i.test(await commandLineOf(old))) { process.kill(old, 'SIGTERM'); await new Promise((r) => setTimeout(r, 800)); }
    } catch {}
    const exe = this.exePath();
    // The exact command, so speed settings can be checked (e.g. that the draft model really went in).
    try { fs.writeFileSync(path.join(this.cfg.dataDir, `llama-server${this.tag}-args.txt`), [exe, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ') + '\n'); } catch {}
    let log = '';
    if (args.includes('--slot-save-path')) { try { fs.mkdirSync(startDir(this.cfg), { recursive: true }); } catch {} }
    const env = card === 'none' ? { ...process.env, CUDA_VISIBLE_DEVICES: '-1' } : process.env; // 'none': llama.cpp can't see the card at all
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    // 1.5.24 "Let games go first": on the processor, the engine yields to games (below normal priority).
    if (this.role === BESIDE || (cpu && cpuPlan(this.cfg)?.lowPriority)) { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {} }
    child.stdout.on('data', (d) => { log = (log + d).slice(-4000); });
    child.stderr.on('data', (d) => { log = (log + d).slice(-4000); });
    const started = new Promise((_, reject) => {
      child.once('error', (e) => reject(new Error(`Couldn't start llama-server (${e.message}). Check llamacpp.exe in config.json.`)));
      child.once('exit', (code) => reject(new Error(`llama-server stopped while loading ${model} (code ${code}). Last output: ${log.slice(-600)}`)));
    });
    this.child = child;
    this.current = model;
    this.currentCtx = ctx || null;
    this.currentCpu = Boolean(cpu);
    this.currentCard = card;
    // 1.5.35: picked by its Ollama name but running from Bob's own copy: say so (Now running) and log it once per model.
    this.currentOwn = model.includes(':') && !this.lc.models?.[model] && Boolean(this.catalogFile(model));
    if (this.currentOwn && !(this.ownLogged ||= new Set()).has(model)) { this.ownLogged.add(model); try { this.log?.('engine', `${model}: running from Bob's own copy (${path.basename(this.catalogFile(model).gguf)}) instead of Ollama's`); } catch {} }
    try { fs.writeFileSync(pidFile, String(child.pid)); } catch {}
    const deadline = Date.now() + (this.lc.loadTimeoutSeconds || 300) * 1000;
    const ready = (async () => {
      while (Date.now() < deadline) {
        if (signal?.aborted) throw new Error('Stopped.');
        if (await this.health()) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`${model} took too long to load.`);
    })();
    try {
      await Promise.race([ready, started]);
    } catch (e) {
      await this.stopServer();
      throw e;
    }
    started.catch(() => {}); // later exits are handled by isLoaded()
    this.primedHash = null;
    // A saved reading of this brain's instructions comes back in about a second instead of being read again.
    if (cpu && tuning(this.cfg).readyWhileTyping) await this.restoreStart(model, ctx);
    const secs = (Date.now() - t0) / 1000;
    this.loadTimes[model] = secs;
    if (this.role === BESIDE) this.changed?.({ action: 'join', model, where: card === 'whole' ? 'card' : 'processor' });
    try { fs.writeFileSync(this.timesFile, JSON.stringify(this.loadTimes, null, 2)); } catch {}
    return secs;
  }

  // Bob's history uses Ollama's message shape; llama-server speaks the OpenAI shape.
  static toOpenAI(messages) {
    const out = [];
    let pending = [];
    let n = 0;
    for (const m of messages) {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        pending = m.tool_calls.map((c) => ({ id: `call_${++n}`, name: c.function?.name }));
        out.push({
          role: 'assistant', content: m.content || '',
          tool_calls: m.tool_calls.map((c, i) => ({
            id: pending[i].id, type: 'function',
            function: { name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments || {}) }
          }))
        });
      } else if (m.role === 'tool') {
        const i = pending.findIndex((p) => p.name === m.tool_name);
        const id = i >= 0 ? pending.splice(i, 1)[0].id : `call_${++n}`;
        out.push({ role: 'tool', tool_call_id: id, content: m.content });
      } else {
        // Pictures go as OpenAI image parts (llama-server needs the model's mmproj file for these).
        out.push(m.images?.length
          ? { role: m.role, content: [{ type: 'text', text: m.content || '' }, ...m.images.map((b) => ({ type: 'image_url', image_url: { url: `data:image/${b.startsWith('iVBOR') ? 'png' : b.startsWith('/9j') ? 'jpeg' : 'webp'};base64,${b}` } }))] }
          : { role: m.role, content: m.content || '' });
      }
    }
    return out;
  }

  async chat(opts) {
    const b = this.route(opts);
    if (b) return b.chat({ ...opts, beside: false, cpu: true });
    this.active++;
    this.lastUse = this.now();
    try { return await this.chatOnce(opts); } finally { this.active--; this.lastUse = this.now(); }
  }

  // 1.5.19: Medium has a thinking budget (1.5.68: so does Qwen3.6 at every effort, see thinkBudget). Once the brain has thought that long, the request stops and is asked again
  // with thinking off and a note to answer now (llama-server keeps the prompt cached, so the retry starts quickly).
  async chatOnce(opts) {
    const budget = thinkBudget(opts.model, opts.think);
    if (!budget) return this.chatStream(opts);
    const stop = new AbortController();
    const onAbort = () => stop.abort();
    opts.signal?.addEventListener?.('abort', onAbort);
    try {
      return await this.chatStream({ ...opts, signal: stop.signal, budget, onOver: () => { stop.over = true; stop.abort(); } });
    } catch (e) {
      if (opts.signal?.aborted || !stop.over) throw e;
      const messages = [...opts.messages, { role: 'system', content: 'Thinking time is up. Answer now, using what you have worked out so far.' }];
      return this.chatStream({ ...opts, messages, think: false });
    } finally { opts.signal?.removeEventListener?.('abort', onAbort); }
  }

  async chatStream({ model, messages, tools, signal, onToken, onThink, think, budget, onOver }) {
    // 1.5.52: a brain whose template refused a mid-chat system note gets them folded in from then on (foldSystem).
    this.noMidSystem ||= new Set();
    // 1.5.60: ask the loaded brain's chat template up front, so a template that refuses mid-chat system notes is
    // folded from the very first request (the retry below stays as a second line of defence).
    this.templateRead ||= new Set();
    if (!this.templateRead.has(model)) {
      this.templateRead.add(model);
      try {
        const props = await (await fetch(this.url + '/props', { signal: AbortSignal.timeout(3000) })).json();
        if (MID_SYSTEM_REFUSED.test(String(props?.chat_template || ''))) {
          this.noMidSystem.add(model);
          this.log?.('engine', `${model}: its chat template only takes a system message first, so Bob's notes go in as user notes`);
        }
      } catch {}
    }
    if (this.noMidSystem.has(model)) messages = foldSystem(messages);
    const res = await this.post(model, messages, tools, signal, think);
    if (!res.ok) {
      // 1.5.60: the template's refusal sits deep in a long error (after the template source), so look at all of it.
      const full = await res.text();
      const text = full.slice(0, 300);
      if (!this.noMidSystem.has(model) && MID_SYSTEM_REFUSED.test(full)) {
        this.noMidSystem.add(model);
        this.log?.('engine', `${model}: its chat template only takes a system message first, so Bob's notes go in as user notes from now on`);
        return this.chatStream({ model, messages, tools, signal, onToken, onThink, think, budget, onOver });
      }
      if (MID_SYSTEM_REFUSED.test(full)) this.log?.('engine', `${model}: refused a system message even after folding (roles ${(messages || []).map((m) => (m.role || '?')[0]).join('')}, ${full.length} chars of error)`);
      throw new Error(`llama-server returned ${res.status}: ${text}`);
    }
    return this.readStream(res, { model, messages, tools, signal, onToken, onThink, think, budget, onOver });
  }

  post(model, messages, tools, signal, think) {
    return fetch(this.url + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: LlamaCpp.toOpenAI(messages), tools: tools && tools.length ? tidySchema(tools) : undefined, stream: true, max_tokens: MAX_REPLY_TOKENS, // 1.5.26: no empty enums (llama.cpp rejects them)
        ...this.sampling(model, { tools: !!tools?.length, think }),
        // 1.5.16: a quick reply asks the chat template to skip thinking (templates that don't know the switch ignore it).
        ...(think === false ? { chat_template_kwargs: { enable_thinking: false } } : {}) }),
      signal
    });
  }

  async readStream(res, { model, messages, tools, signal, onToken, onThink, think, budget, onOver }) {
    let content = '';
    let held = null; // null: not decided yet; false: streaming normally; a string: held back
    let thought = 0;
    const calls = [];
    let buf = '';
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        const ev = parseJson(data);
        if (!ev) continue; // a cut or odd line from the server: skip it rather than lose the whole reply
        if (ev.error) throw new Error('llama-server: ' + (ev.error.message || JSON.stringify(ev.error)));
        // 1.5.30: llama-server puts the reply's timings on its last chunk; kept for Now running.
        if (ev.timings) this.lastStats = replyStats({ model: this.current || model, messages, promptTokens: (ev.timings.prompt_n || 0) + (ev.timings.cache_n || 0), outTokens: ev.timings.predicted_n, tokPerSec: ev.timings.predicted_per_second, ctx: this.currentCtx || this.lc.ctx || DEFAULT_CTX }) || this.lastStats;
        const d = ev.choices?.[0]?.delta || {};
        if (budget && d.reasoning_content && ++thought > budget && !content) onOver(); // stop.over marks it, so real errors aren't retried
        if (d.reasoning_content && onThink) onThink(d.reasoning_content); // 1.5.53: only while the thinking window is open
        if (d.content) {
          content += d.content;
          // 1.5.29: a reply that starts like a tool call written as text is held back until the end, so a rescued
          // call (textCalls below) never shows up in the chat as raw JSON.
          if (!tools?.length) onToken && onToken(d.content);
          else if (held === null) { if (content.trim()) { if (TEXT_CALL_START.test(content.trimStart())) held = content; else { held = false; onToken && onToken(content); } } }
          else if (held === false) onToken && onToken(d.content);
          else held += d.content;
        }
        for (const tc of d.tool_calls || []) {
          const i = tc.index ?? calls.length;
          calls[i] = calls[i] || { name: '', args: '' };
          if (tc.function?.name) calls[i].name += tc.function.name;
          if (tc.function?.arguments) calls[i].args += tc.function.arguments;
        }
      }
    }
    const tool_calls = calls.filter(Boolean).map((c) => {
      let args = {};
      try { args = c.args ? JSON.parse(c.args) : {}; } catch { args = {}; }
      return { function: { name: c.name, arguments: args } };
    });
    if (!tool_calls.length && tools?.length) {
      const names = new Set(tools.map((t) => t.function?.name).filter(Boolean));
      const rescued = textCalls(content, names);
      if (rescued) return { role: 'assistant', content: rescued.text, tool_calls: rescued.calls };
    }
    if (held) onToken && onToken(cleanHarmony(held)); // it wasn't a call after all: show it now
    if (held && /<\|(channel|message|start|end)\|>/.test(content)) content = cleanHarmony(content);
    return { role: 'assistant', content, tool_calls: tool_calls.length ? tool_calls : undefined };
  }
}
