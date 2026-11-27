// GUPPI calibrates this PC (Settings, Engine tuning, under "Let the Conductor drive"; nothing runs until the button is
// pressed). The owner (Nov 23): GUPPI must fit whatever machine he is on "without destroying it" and correct on the
// fly; prevent spill up front (the card less 512 MB, RAM never under 512 MB) but ride the edge; his job is speed plus a
// safety net, so he has to beat "Let Bob pick". So one press measures this PC for one brain, safely:
//   1. Bob's pick: the brain as Bob loads it without GUPPI (Bob's reading step, no expert copy cache). The yardstick.
//   2. GUPPI's way at each reading step he may use (the chat step, 4096, 6144; on built-in graphics at most 2048): the
//      copy cache filled to the card around that step, the way GUPPI loads it. Smallest step first; the first step
//      that leaves the card under its 512 MB margin, spills into shared memory, pushes free RAM under the floor or
//      doesn't start is the edge, and nothing bigger is tried.
//   Each try waits for the card to cool first (back within 3 C of where it started, 35 s to 5 min), logs the card's
//   temperature and clocks, reads one long prompt and writes one short answer three times, and is stopped at once if
//   the card gets too hot or the RAM too low.
// The result is this PC's profile (<data>/conductor/pc-profile.json): per brain, the biggest safe step (GUPPI never
// goes past it, here or after a restart), the speeds he measured (seeded into his speeds file, so his load step is
// picked from real numbers from the first reply), and whether he beat Bob's pick by at least 5% on a typical job. When
// he didn't, GUPPI keeps Bob's own step and adds no copy cache for that brain: the same as Let Bob pick. A profile made
// on another card, another amount of RAM or another Brain Engine build isn't used, and the logbook says so.
// Brain Engine on Windows and Linux with a graphics card (temperatures and clocks need an NVIDIA card; built-in
// graphics are measured by free RAM). Not on a Mac (plain llama.cpp, where GUPPI doesn't drive) or the Android app.
// Nothing is downloaded and nothing leaves this computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { IN_TEST } from './recycle.js';
import { startServer } from './lab-test.js';
import { readJson, writeJson, makeRoom, runJob, pageLog, chatOnce } from './lab-jobs.js';
import { readCardUse, busyByOther } from './card-busy.js';
import { gaming } from './sessions.js';
import { CAL_CTX, CAL_PROMPT, CAL_LONG } from './brain-calibrate.js';
import { readingChoice } from './engine-extras.js';
import { CHAT_STEP, READ_STEP, BIG_STEP, SPILL_MARGIN_MIB, COND_CACHE_MIB, condCacheWanted, fillEnv, APU_MAX_STEP, APU_FLOOR, LOAD_PICK_MARGIN } from './conductor.js';
import { ggufInfo } from './gguf.js';
import { cardGB } from './tuning.js';
import { profileFile, readProfile, saveProfile, pcNow, pcChanged, seedSpeeds } from './guppi-profile.js';
import { OS } from './platform.js';
import { readThrottle } from './guppi-heat.js';
import { append as measuredAdd, rowFromTry } from './measured-db.js';

export const RAM_FLOOR_MIB = 512; // free RAM never under this (the owner's floor); built-in graphics: APU_FLOOR (1.5 GB)
export const HEAT_STOP_C = 90; // a graphics card this hot stops the try (built-in graphics: 95, the Legion Go's line)
export const APU_HEAT_STOP_C = 95;
export const COOL = { aboveIdle: 3, minS: 35, maxS: 300, everyS: 5 }; // the Go's measured rule, used everywhere
export const ROUNDS = 3; // reads and writes per try; the median counts
export const JOB = { readTok: 16384, outTok: 300 }; // the typical job a step is judged on (GUPPI's own default read)
export const BEAT_MARGIN = LOAD_PICK_MARGIN; // GUPPI has to beat Bob's pick by this much (5%)
export const WATCH_MS = 1000;
const round1 = (n) => Math.round(n * 10) / 10;
const MiB = 2 ** 20;
export { profileFile, readProfile, pcNow, pcChanged, profileFor, seedSpeeds, speedsFile } from './guppi-profile.js';

// ---- the card's health: nvidia-smi, one line ----
const num = (s) => { const n = Number(String(s ?? '').trim()); return Number.isFinite(n) ? n : null; };
export const HEALTH_QUERY = ['--query-gpu=name,temperature.gpu,clocks.sm,clocks.mem,power.draw,memory.free,memory.total', '--format=csv,noheader,nounits'];
// -> { gpu, tempC, smMHz, memMHz, powerW, freeMiB, totalMiB } (unknowns null), or null when nothing was read
export function parseHealth(out) {
  const line = String(out || '').split(/\r?\n/).find((l) => l.trim());
  if (!line) return null;
  const [gpu, t, sm, mem, pw, fr, tot] = line.split(',').map((x) => x.trim());
  const h = { gpu: gpu || '', tempC: num(t), smMHz: num(sm), memMHz: num(mem), powerW: num(pw), freeMiB: num(fr), totalMiB: num(tot) };
  return h.tempC == null && h.freeMiB == null ? null : h;
}
function smi(args) {
  if (IN_TEST) return Promise.resolve(null); // tests never reach the real nvidia-smi
  return new Promise((resolve) => { try { execFile('nvidia-smi', args, { timeout: 3000, windowsHide: true }, (err, out) => resolve(err ? null : String(out))); } catch { resolve(null); } });
}
export const readHealth = async (run = smi) => parseHealth(await run(HEALTH_QUERY));
// Windows: the card's use of shared (ordinary) memory, MiB, or null. A rise means the card spilled.
const SHARED_PS = "$ErrorActionPreference='SilentlyContinue'; [math]::Round(((Get-Counter '\\GPU Adapter Memory(*)\\Shared Usage').CounterSamples | Measure-Object -Property CookedValue -Sum).Sum/1MB)";
// Nov 27, the laptop: the sum over every adapter counted the built-in graphics and other programs too (a 1 GB "spill"
// with 1.6 GB of the card still free). Now only the trial engine's own shared use counts, by its process id.
const procShared = (pid) => `$ErrorActionPreference='SilentlyContinue'; [math]::Round(((Get-Counter '\\GPU Process Memory(pid_${Number(pid)}_*)\\Shared Usage').CounterSamples | Measure-Object -Property CookedValue -Sum).Sum/1MB)`;
function winSharedOf(pid) {
  if (IN_TEST || process.platform !== 'win32' || !(Number(pid) > 0)) return Promise.resolve(null);
  return new Promise((resolve) => { try { execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', procShared(pid)], { timeout: 8000, windowsHide: true }, (err, out) => resolve(err ? null : num(out))); } catch { resolve(null); } });
}
function winShared() {
  if (IN_TEST || process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => { try { execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SHARED_PS], { timeout: 8000, windowsHide: true }, (err, out) => resolve(err ? null : num(out))); } catch { resolve(null); } });
}
// The pinned staging buffer the engine makes on the processor side for a step (about step/8 MiB plus 80) shows up as
// shared memory too, and isn't a spill (Calibrate, Nov 17). Anything past that plus the 512 MB margin is.
export const spillLimitMiB = (step) => SPILL_MARGIN_MIB + Math.ceil(Math.max(512, Number(step) || 512) / 8) + 80;

// ---- the plan ----
// The steps to try. bobStep: Bob's own reading step (0 = llama-server's 512). chat: GUPPI's chat step (Bob's step, or
// 512). cache: GUPPI adds the copy cache for this brain (a brain of experts bigger than the card, Brain Engine 39+).
// -> [{ id, step, cache, label }]: Bob's pick first, then GUPPI's steps, smallest first.
export function guppiTries({ bobStep = 0, cache = false, apu = false } = {}) {
  const chat = bobStep > 0 ? bobStep : 512;
  const out = [{ id: 'bob', step: chat, cache: false, label: `Bob's pick: reading step ${chat}, no copy cache` }];
  if (!cache) return out; // no copy cache: GUPPI keeps Bob's step and doesn't switch, so there is nothing else to time
  const steps = [...new Set([chat, READ_STEP, BIG_STEP])].filter((s) => s >= chat && !(apu && s > APU_MAX_STEP)).sort((a, b) => a - b);
  for (const s of steps) out.push({ id: `g${s}`, step: s, cache: true, label: `GUPPI: reading step ${s} with the copy cache filled to the card` });
  return out;
}
// llama-server flags and environment for a try. beNo: the Brain Engine build.
export const FIT_DEFAULT_MIB = 1024; // llama.cpp's own --fit-target
export const ROOM_EXTRA_MIB = 256;
// fitTargetMiB: room the engine's own fit leaves free on the card, when the first try showed its default leaves too
// little (the laptop, Nov 27: Bob's pick left 266 MB free on the 6 GB card)
export const WDDM_FROM_BE = 38; // GGML_CUDA_WDDM_BUDGET (patch 0068)
export function tryArgs(t, { beNo = 0, fitTargetMiB = 0, wddm = false } = {}) {
  const extra = t.step > 512 ? ['-b', String(t.step), '-ub', String(t.step)] : [];
  if (fitTargetMiB > 0) extra.push('--fit-target', String(fitTargetMiB));
  const base = wddm ? { GGML_CUDA_WDDM_BUDGET: '1' } : {};
  if (!t.cache) return { extra, env: Object.keys(base).length ? base : null };
  extra.push('--moe-cache-mib', String(COND_CACHE_MIB));
  const env = { ...base, ...fillEnv({ cacheMiB: COND_CACHE_MIB, beNo, env: {}, step: t.step }) };
  return { extra, env: Object.keys(env).length ? env : null };
}

// What stops a try at once, or '' to carry on. s: { freeMiB, ramMiB, tempC, sharedRiseMiB }, step: the try's step.
export function tripWhy(s = {}, { apu = false, step = 0, card = true } = {}) {
  const floor = apu ? APU_FLOOR / MiB : RAM_FLOOR_MIB;
  const heat = apu ? APU_HEAT_STOP_C : HEAT_STOP_C;
  if (Number.isFinite(s.tempC) && s.tempC >= heat) return `heat: the card reached ${s.tempC} C (stop at ${heat} C)`;
  // Nov 27 (the laptop: hardware slowdown with the power cap at 67 C): the driver slowing the card is logged with the
  // try, not a stop. Laptops do it all the time and it protects the card itself; only the temperature line stops a try.
  if (Number.isFinite(s.ramMiB) && s.ramMiB < floor) return `ram: free RAM fell to ${Math.round(s.ramMiB)} MB, under the ${Math.round(floor)} MB floor`;
  if (card && !apu && Number.isFinite(s.freeMiB) && s.freeMiB < SPILL_MARGIN_MIB) return `card: only ${Math.round(s.freeMiB)} MB left free on the card, under the ${SPILL_MARGIN_MIB} MB margin`;
  if (Number.isFinite(s.sharedRiseMiB) && s.sharedRiseMiB > spillLimitMiB(step)) return `spill: the card spilled about ${Math.round(s.sharedRiseMiB)} MB into shared memory`;
  return '';
}

const median = (xs) => { const a = xs.filter((x) => Number.isFinite(x) && x > 0).sort((p, q) => p - q); if (!a.length) return 0; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
export const jobSeconds = (r, { readTok = JOB.readTok, outTok = JOB.outTok } = {}) => (r?.readTps > 0 && r?.tps > 0 ? readTok / r.readTps + outTok / r.tps : Infinity);

// The verdict from the rows that ran. -> { cap, guppiStep, speeds: { read, write }, bobS, guppiS, beatsBob, keepBob, why }
//   cap: the biggest step that ran safely (0 when no GUPPI step did); speeds only from GUPPI's own way (copy cache)
export function guppiVerdict(rows = [], { readTok = JOB.readTok, outTok = JOB.outTok, margin = BEAT_MARGIN } = {}) {
  const ok = (r) => !r.failed && !r.trip && r.tps > 0 && r.readTps > 0;
  const bob = rows.find((r) => r.id === 'bob');
  const g = rows.filter((r) => r.id !== 'bob' && ok(r));
  const cap = g.length ? Math.max(...g.map((r) => r.step)) : 0;
  const speeds = { read: {}, write: {} };
  for (const r of g) { speeds.read[r.step] = r.readTps; speeds.write[r.step] = r.tps; }
  const best = g.slice().sort((a, b) => jobSeconds(a, { readTok, outTok }) - jobSeconds(b, { readTok, outTok }))[0] || null;
  const bobS = bob && ok(bob) ? jobSeconds(bob, { readTok, outTok }) : Infinity;
  const guppiS = best ? jobSeconds(best, { readTok, outTok }) : Infinity;
  const s1 = (x) => (Number.isFinite(x) ? round1(x) : null);
  const job = `a ${readTok.toLocaleString('en')}-token read and ${outTok} tokens written`;
  const edge = rows.find((r) => r.id !== 'bob' && (r.trip || r.failed));
  const edgeWhy = edge ? ` Step ${edge.step} was the edge (${edge.trip || edge.failed}), so GUPPI never goes past ${cap || 'Bob\'s step'} here.` : '';
  let beatsBob = false, why;
  if (!rows.some((r) => r.id !== 'bob')) why = 'No copy cache for this brain here, so GUPPI keeps Bob\'s own step and doesn\'t switch: the same as Let Bob pick.';
  else if (!best) why = `None of GUPPI's steps ran safely here, so he keeps Bob's own step for this brain.${edgeWhy}`;
  else if (!Number.isFinite(bobS)) { beatsBob = true; why = `Bob's pick didn't run here (${bob?.trip || bob?.failed || 'no speed'}); GUPPI at step ${best.step} did: about ${s1(guppiS)} s for ${job}.${edgeWhy}`; }
  else if (guppiS < bobS * (1 - margin)) { beatsBob = true; why = `GUPPI at step ${best.step} beat Bob's pick: about ${s1(guppiS)} s against ${s1(bobS)} s for ${job} (reading ${best.readTps} against ${bob.readTps} tokens a second, writing ${best.tps} against ${bob.tps}).${edgeWhy}`; }
  else why = `GUPPI didn't beat Bob's pick by ${Math.round(margin * 100)}% here (about ${s1(guppiS)} s against ${s1(bobS)} s for ${job}), so for this brain he keeps Bob's own step and adds no copy cache: the same as Let Bob pick.${edgeWhy}`;
  return { cap, guppiStep: beatsBob && best ? best.step : 0, speeds, bobS: s1(bobS), guppiS: s1(guppiS), beatsBob, keepBob: !beatsBob, why };
}

// Why GUPPI can't calibrate here, or ''.
export function guppiCalLock(lab, model, { osKey = OS } = {}) {
  if (osKey === 'mac') return 'GUPPI drives my own engine on Windows and Linux. A Mac runs plain llama.cpp, so there is nothing for him to calibrate there.';
  if (lab.cfg.engine !== 'llamacpp') return 'Calibrating GUPPI needs my built-in engine.';
  if (!model) return 'Pick a brain to calibrate first.';
  if (!lab.tools().server.found) return 'The engine\'s program isn\'t on this computer yet.';
  if (!lab.brain?.engine?.resolve) return 'I can\'t find my engine right now.';
  try { if (!lab.brain.engine.resolve(model)?.gguf) return 'I can\'t find this brain\'s file.'; } catch { return 'I can\'t find this brain\'s file.'; }
  return '';
}

// ---- the job ----
// fx (tests swap any of these): serve, chat, health, card, ram (free MiB), shared (MiB or null), sleep(ms), watchMs
export async function startGuppiCalibrate(lab, { model = '', name = '', unload = false, osKey = OS } = {}) {
  if (lab.job) throw new Error('I\'m already busy with a Lab job. Wait for it, or stop it.');
  if (gaming(lab.cfg)) throw new Error('Gaming is on, so calibrating waits. Switch the session to Normal to run it.');
  const lock = guppiCalLock(lab, model, { osKey });
  if (lock) throw new Error(lock);
  const eng = lab.brain.engine;
  const fxs = lab.guppiFns || {};
  const card = fxs.card || (() => readCardUse(undefined, undefined, { ownPids: eng.ownPids?.() || null }));
  // another program holding the card: no calibration (its numbers would be wrong, and the card could fill)
  const before = await card().catch(() => null);
  if (busyByOther(before) && (before.others || []).length) throw new Error(`Another program is using the graphics card (${before.others.map((o) => o.name).slice(0, 2).join(', ')}), so calibrating waits. Close it and press again.`);
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const beNo = Number(eng.beNo?.() || eng.buildNo?.() || 0) || 0;
  const gguf = eng.resolve(model).gguf;
  const info = ggufInfo(gguf) || {};
  let fileBytes = 0; try { fileBytes = fs.statSync(gguf).size; } catch {}
  const apu = lab.cfg.sharedGraphics === true;
  const bobStep = readingChoice(lab.cfg, { recent: eng.recentPrompts, model }).steps || 0;
  const cache = !apu && beNo >= 39 && condCacheWanted({ experts: info.experts || 0, fileBytes, cardBytes: cardGB(lab.cfg) * 2 ** 30 });
  const tries = guppiTries({ bobStep, cache, apu });
  const log = pageLog(lab.cfg, 'guppi-calibrate');
  const exe = lab.tools().server.path;
  const fx = {
    serve: (o) => startServer({ exe, log, ...o }), chat: chatOnce, health: () => readHealth(), throttle: () => readThrottle(), card,
    ram: () => (eng.freeRam ? eng.freeRam() : os.freemem()) / MiB, shared: winShared, sharedOf: winSharedOf,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)), watchMs: WATCH_MS, ...fxs
  };
  const show = name || model;
  const steps = [['pc', 'Measure this PC: card, RAM, temperature'], ...tries.map((t) => [t.id, t.label]), ['save', 'Save this PC\'s profile for GUPPI']];
  return runJob(lab, { kind: 'guppi-calibrate', name: `GUPPI calibrates this PC: ${show}`, from: model, fromName: show, steps }, async (r, { set, signal, progress }) => {
    let done = 0; const total = steps.length;
    const tick = () => progress((100 * ++done) / total);
    set('pc', 'running');
    const h0 = await fx.health().catch(() => null);
    const pc = { ...pcNow(lab.cfg, { beNo, osKey }), gpu: h0?.gpu || '', cardMiB: h0?.totalMiB ?? before?.totalMB ?? null, idleC: h0?.tempC ?? null, idleSmMHz: h0?.smMHz ?? null, idleThrottle: (await Promise.resolve(fx.throttle?.()).catch(() => null))?.ids || null, freeRamMiB: Math.round(await fx.ram()) };
    log(`GUPPI calibrate: ${show}, ${JSON.stringify(pc)}, tries ${tries.map((t) => t.id).join(' ')}`);
    set('pc', 'done'); tick();
    const rows = [];
    let edge = false, hot = false, refText = null;
    let fitTargetMiB = 0, roomTries = 0, wddm = false, srvMem = '';
    for (let ti = 0; ti < tries.length; ti++) {
      const t = tries[ti];
      if (signal.aborted) throw new Error('Stopped.');
      if (edge || hot) { rows.push({ id: t.id, step: t.step, cache: t.cache, failed: hot ? 'Skipped: the card got too hot.' : 'Skipped: past the edge found at a smaller step.' }); set(t.id, 'failed'); tick(); continue; }
      set(t.id, 'running');
      const row = { id: t.id, step: t.step, cache: t.cache };
      // cool down first (the owner: speed runs start cool, with temperature and clocks logged)
      const cool = await coolDown(fx, { idleC: pc.idleC, signal });
      row.cool = cool;
      const sharedBase = await fx.shared().catch(() => null);
      const { extra, env } = tryArgs(t, { beNo, fitTargetMiB, wddm });
      let srv = null, trip = '';
      const samples = [];
      const sample = async () => {
        const own = srv?.pid && fx.sharedOf ? await Promise.resolve(fx.sharedOf(srv.pid)).catch(() => null) : null;
        const [h, c, ram, sh, th] = await Promise.all([fx.health().catch(() => null), fx.card().catch(() => null), Promise.resolve(fx.ram()).catch(() => null), Number.isFinite(own) ? own + (sharedBase || 0) : fx.shared().catch(() => null), Promise.resolve(fx.throttle?.()).catch(() => null)]);
        const s = { tempC: h?.tempC ?? null, smMHz: h?.smMHz ?? null, memMHz: h?.memMHz ?? null, powerW: h?.powerW ?? null, freeMiB: c?.freeMB ?? h?.freeMiB ?? null, ramMiB: Number.isFinite(ram) ? ram : null, sharedRiseMiB: Number.isFinite(sh) && Number.isFinite(sharedBase) ? sh - sharedBase : null, throttle: th || null };
        samples.push(s);
        const why = tripWhy(s, { apu, step: t.step, card: Boolean(srv) });
        if (why && !trip) { trip = why; try { srv?.stop(); } catch {} }
        return why;
      };
      let timer = null;
      try {
        srv = await fx.serve({ gguf, ctx: CAL_CTX, signal, cpuOk: false, extra, ...(env ? { env } : {}) });
        if (fx.watchMs > 0) timer = setInterval(() => { sample().catch(() => {}); }, fx.watchMs);
        if (await sample()) throw Object.assign(new Error('trip'), { trip: true });
        const reads = [], writes = [], firsts = [], readNs = [];
        for (let i = 0; i < ROUNDS; i++) {
          const long = await fx.chat(srv.url, [{ role: 'user', content: CAL_LONG }], { maxTokens: 24, signal });
          if (await sample()) throw Object.assign(new Error('trip'), { trip: true });
          const short = await fx.chat(srv.url, [{ role: 'user', content: CAL_PROMPT }], { maxTokens: 200, signal });
          if (await sample()) throw Object.assign(new Error('trip'), { trip: true });
          readNs.push(Number(long.timings?.prompt_n) || 0); reads.push(Number(long.timings?.prompt_per_second) || 0); firsts.push(long.timings?.prompt_ms ? long.timings.prompt_ms / 1000 : 0); writes.push(Number(short.timings?.predicted_per_second) || 0);
          if (i === 0) { if (refText == null) refText = short.text; else row.sameWords = short.text === refText; }
        }
        Object.assign(row, { readTps: round1(median(reads)), tps: round1(median(writes)), firstWordS: round1(median(firsts)), readN: median(readNs) || null });
        if (!(row.tps > 0)) row.failed = 'It answered, but gave no speed.';
      } catch (e) {
        if (signal.aborted) throw e;
        if (!trip) row.failed = 'Didn\'t start: too much for this PC this way.';
      } finally { if (timer) clearInterval(timer); try { srvMem = srv?.memLog?.() || ''; } catch {} try { srv?.stop(); } catch {} }
      if (trip) row.trip = trip;
      Object.assign(row, heatOf(samples));
      // Nov 27, the laptop: the engine's own fit (its default 1 GB target) left only 266 MB free. Then the same try
      // runs once more with the fit told to leave the shortfall too (and a little over), and later tries keep that.
      // Nov 27, the laptop again: raising the fit's room alone changed nothing (266 MB free and 2.75 GB spilled each
      // time), so a retry now also counts the spill as overshoot and, on Windows, has the engine plan by Windows' own
      // budget for the card (GGML_CUDA_WDDM_BUDGET, Lamplight 38+), which the card's free figure there can overstate.
      const short = Number.isFinite(row.minFreeMiB) ? Math.max(0, SPILL_MARGIN_MIB - row.minFreeMiB) : 0;
      const over = Number.isFinite(row.spillMiB) ? Math.max(0, row.spillMiB - spillLimitMiB(t.step) + SPILL_MARGIN_MIB) : 0;
      if (/^(card|spill):/.test(row.trip || '') && roomTries < 2 && (short > 0 || over > 0 || (osKey === 'windows' && !wddm))) {
        roomTries++;
        fitTargetMiB = (fitTargetMiB || FIT_DEFAULT_MIB) + short + over + ROOM_EXTRA_MIB;
        if (osKey === 'windows' && beNo >= WDDM_FROM_BE) wddm = true;
        if (srvMem) log(`GUPPI calibrate: ${t.id}, how the engine placed it: ${srvMem.split('\n').slice(-12).join(' | ')}`);
        log(`GUPPI calibrate: ${t.id} ${row.trip}, so it runs again with the fit leaving ${fitTargetMiB} MiB${wddm ? ' and the engine planning by Windows\' budget for the card' : ''}`);
        ti--; continue;
      }
      if (fitTargetMiB) row.fitTargetMiB = fitTargetMiB;
      if (wddm) row.wddmBudget = true;
      if (row.trip?.startsWith('heat')) hot = true;
      else if (t.id !== 'bob' && (row.trip || row.failed)) edge = true; // the edge: nothing bigger
      log(`GUPPI calibrate: ${t.id} ${JSON.stringify(row)}`);
      rows.push(row);
      // Nov 27: every try goes into the test-results database, measured speeds or the reason it didn't fit
      const bad = row.trip || row.failed;
      measuredAdd(lab.cfg, rowFromTry({ at: lab.now(), source: 'guppi-calibrate', gguf, fileBytes, pc, be: beNo || null, extra, env, ctx: CAL_CTX, promptN: row.readN, result: bad ? {} : { readTps: row.readTps, writeTps: row.tps, firstWordS: row.firstWordS, peakC: row.peakC, smMHz: row.smMedMHz, throttle: row.throttle }, fit: bad ? { ok: false, why: bad } : { ok: true } }));
      set(t.id, row.failed || row.trip ? 'failed' : 'done'); tick();
    }
    set('save', 'running');
    const v = guppiVerdict(rows);
    const rec = { name: show, at: lab.now(), when: new Date(lab.now()).toISOString().slice(0, 10), bobStep, cache, ctx: CAL_CTX, rows, ...v, ...(fitTargetMiB ? { fitTargetMiB } : {}), ...(wddm ? { wddmBudget: true } : {}) };
    const prof = readProfile(lab.cfg);
    const keep = prof && !pcChanged(prof.pc, pc) ? prof.brains : {}; // another PC's profile starts over
    const next = { v: 1, at: lab.now(), pc, brains: { ...keep, [model]: rec } };
    saveProfile(lab.cfg, next);
    if (Object.keys(v.speeds.write).length && beNo) seedSpeeds(lab.cfg, model, v.speeds, beNo);
    try { eng.guppiReload?.(); } catch {} // the running engine reads the new profile and speeds at its next load
    set('save', 'done'); tick();
    return { guppi: rec, saw: `${show}: ${v.why}` };
  });
}

// Wait for the card to cool: at least COOL.minS, then until it's within COOL.aboveIdle of where it started, at most
// COOL.maxS. -> { waitedS, startC, cool } (cool: null when the temperature can't be read)
export async function coolDown(fx, { idleC = null, signal, rule = COOL } = {}) {
  let waited = 0;
  const step = async (s) => { if (signal?.aborted) throw new Error('Stopped.'); await fx.sleep(s * 1000); waited += s; };
  await step(rule.minS);
  let t = (await fx.health().catch(() => null))?.tempC ?? null;
  if (!Number.isFinite(idleC) || !Number.isFinite(t)) return { waitedS: waited, startC: t, cool: null };
  while (t > idleC + rule.aboveIdle && waited < rule.maxS) { await step(rule.everyS); t = (await fx.health().catch(() => null))?.tempC ?? t; }
  return { waitedS: waited, startC: t, cool: t <= idleC + rule.aboveIdle };
}
// peak temperature, median and lowest clock, lowest free card memory and RAM, the most spilled, over a try's samples
export function heatOf(samples = []) {
  const vals = (k) => samples.map((s) => s[k]).filter((x) => Number.isFinite(x));
  const max = (k) => (vals(k).length ? Math.max(...vals(k)) : null), min = (k) => (vals(k).length ? Math.min(...vals(k)) : null);
  return { peakC: max('tempC'), smMedMHz: vals('smMHz').length ? median(vals('smMHz')) : null, smMinMHz: min('smMHz'), minFreeMiB: min('freeMiB'), minRamMiB: min('ramMiB') == null ? null : Math.round(min('ramMiB')), spillMiB: max('sharedRiseMiB'), throttle: [...new Set(samples.flatMap((s) => s.throttle?.ids || []))].filter((i) => i !== 'idle') };
}

// For Settings: this PC's profile, short, and the job while it runs.
export function guppiCalView(cfg, lab, now) {
  const p = readProfile(cfg);
  const brains = p ? Object.entries(p.brains).slice(0, 32).map(([model, b]) => ({ model, name: b.name || model, when: b.when || '', cap: b.cap || 0, beatsBob: b.beatsBob === true, why: b.why || '', rows: (b.rows || []).map(({ id, step, cache, readTps, tps, firstWordS, failed, trip, peakC, smMedMHz, minFreeMiB, sameWords, throttle }) => ({ id, step, cache, readTps, tps, firstWordS, failed, trip, peakC, smMedMHz, minFreeMiB, sameWords, throttle })) })) : [];
  const run = lab?.job?.run?.kind === 'guppi-calibrate' ? lab.runView(lab.job.run) : null;
  return { brains, stale: p && now ? pcChanged(p.pc, now) : '', gpu: p?.pc?.gpu || '', run };
}
export function forgetProfile(cfg, eng) {
  const f = profileFile(cfg);
  try { if (f) fs.rmSync(f, { force: true }); } catch {}
  try { eng?.guppiReload?.(); } catch {}
  return { forgotten: true };
}
