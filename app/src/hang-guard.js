// Timeouts and hangs (reliability list items 208-217, Nov 12). Small pieces the engine, the loop and the window share.
// Always on: these are fixes, not features. Nothing here adds words to what the brain reads; the checks run in code.
//
//   208 firstWordMs     how long a reply may take to send its first word, from the chat's length and the brain's speed
//   210/211 replyEnd    did the reply end properly, run out of room ("length"), or stop early (no end mark)?
//   213 trackChild      programs a job started; after Stop, anything still running a few seconds later is forced
//   214 startWatchdog   a helper thread that notices when Bob's own server stops answering, and says so when he's back
//   215 timersFor       every timer a turn starts goes in the turn's bag and is cleared when the turn ends
//   215 raceTimeout     a "wait at most this long" that clears its timer when the wait ends early
//   216 loadDeadline    a load past twice its usual time is stopped and tried once more
//   217 awakeTimeout    a card's time-out that doesn't count time the PC spent asleep
import { Worker } from 'node:worker_threads';

// ---------------------------------------------------------------------------------------------------------------
// 208: the first word
// ---------------------------------------------------------------------------------------------------------------
// Reading speeds (tokens a second) used until the engine has said how fast this brain reads. Low on purpose: a guess
// that's too slow only waits longer, one that's too fast would stop a reply that was fine.
export const READ_GUESS = { card: 150, cpu: 15 };
export const FIRST_WORD_MIN_MS = 3 * 60_000; // never less than 3 minutes
export const FIRST_WORD_MAX_MS = 30 * 60_000; // never more than 30
// promptTokens: about how many tokens the brain has to read; readPerSec: this brain's measured reading speed (0 when
// not known yet); cpu: running on the processor; spread: over other Bobs' cards (Wi-Fi), which doubles it.
export function firstWordMs({ promptTokens = 0, readPerSec = 0, cpu = false, spread = false, seconds = 0 } = {}) {
  if (seconds > 0) return Math.round(seconds * 1000); // llamacpp.firstWordSeconds in config.json
  const speed = readPerSec > 0 ? readPerSec : cpu ? READ_GUESS.cpu : READ_GUESS.card;
  const reading = (Math.max(0, promptTokens) / speed) * 1000;
  const ms = Math.min(FIRST_WORD_MAX_MS, Math.max(FIRST_WORD_MIN_MS, 60_000 + reading * 3));
  return Math.round(ms * (spread ? 2 : 1));
}
// The engine's own figure for how fast it read, smoothed so one odd reply doesn't swing it. Only long reads count
// (a short one is mostly start-up time, and a cached one isn't reading at all).
export function learnReadSpeed(old, timings) {
  const n = Number(timings?.prompt_n) || 0, per = Number(timings?.prompt_per_second) || 0;
  if (n < 256 || !(per > 0) || !Number.isFinite(per)) return old || 0;
  return old > 0 ? Math.round(old * 0.7 + per * 0.3) : Math.round(per);
}

// ---------------------------------------------------------------------------------------------------------------
// 210, 211: how a reply ended
// ---------------------------------------------------------------------------------------------------------------
// done: the stream's end mark ([DONE] for llama-server, done: true for Ollama) came; finish: the engine's own reason
// ('stop', 'tool_calls', 'length'...). Returns 'ok', 'length' (ran out of room, so the end is missing) or 'early'
// (the stream stopped with neither, so the reply may be half of what was meant).
export function replyEnd({ done = false, finish = '' } = {}) {
  if (finish === 'length') return 'length';
  if (done || finish) return 'ok';
  return 'early';
}
// The one line handed back instead of running a tool call that was cut off part way (210). Only when it happens.
export const CUT_CALL = (name) => `(Not run: your reply hit the length limit and this ${name || 'tool'} call was cut off part way. Send it again, shorter; split big text into smaller pieces.)`;
// What the person sees under a reply that stopped at the length limit (never sent to the brain).
export const CUT_REPLY_NOTE = 'This answer hit the length limit and stopped there. Say "go on" for the rest.';
export const EARLY_END = 'terminated: the reply stopped before its end mark';

// ---------------------------------------------------------------------------------------------------------------
// 212: every network call has a deadline
// ---------------------------------------------------------------------------------------------------------------
// A signal that ends with the caller's (if any) or after ms, whichever comes first.
export function deadline(signal, ms) {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}
// For downloads, where the whole thing may rightly take hours: no bytes for ms means the line went dead. Call poke()
// on every chunk and done() at the end. signal ends with the caller's or when the line goes quiet.
export const QUIET_DOWNLOAD_MS = 2 * 60_000;
export function quietGuard(signal, ms = QUIET_DOWNLOAD_MS) {
  const c = new AbortController();
  let t = null;
  const poke = () => { clearTimeout(t); t = setTimeout(() => c.abort(new Error(`nothing came for ${Math.round(ms / 1000)} seconds`)), ms); t.unref?.(); };
  poke();
  return { signal: signal ? AbortSignal.any([signal, c.signal]) : c.signal, poke, done: () => clearTimeout(t), quiet: () => c.signal.aborted };
}

// ---------------------------------------------------------------------------------------------------------------
// 213: Stop really stops
// ---------------------------------------------------------------------------------------------------------------
const live = new Set();
// child: a ChildProcess; signal: the job's signal; name: for the log line. Returns the child.
export function trackChild(child, signal, name = 'a program') {
  if (!child || !signal || child.exitCode !== null) return child;
  const e = { child, signal, name };
  live.add(e);
  const drop = () => live.delete(e);
  child.once?.('exit', drop);
  child.once?.('error', drop);
  return child;
}
const running = (c) => c && c.exitCode === null && c.signalCode == null;
// Programs whose job was stopped but which are still running.
export function survivors() { for (const e of live) if (!running(e.child)) live.delete(e); return [...live].filter((e) => e.signal.aborted); }
// After Stop: wait a moment, then force whatever a stopped job left running. kill: platform.js killTree. Returns the
// names forced. engine (optional): { busy(): bool, reset(): Promise } for an engine still working on a stopped reply.
export async function afterStop({ waitMs = 4000, kill, log = () => {}, engine = null, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  await sleep(waitMs);
  const forced = [];
  for (const e of survivors()) {
    try { kill?.(e.child); } catch {}
    live.delete(e);
    forced.push(e.name);
  }
  if (forced.length) log('stop', `${forced.join(', ')} still running ${Math.round(waitMs / 1000)} s after Stop; forced to end`);
  if (engine?.busy?.()) {
    log('stop', `the engine was still busy with a stopped reply ${Math.round(waitMs / 1000)} s after Stop; restarting it`);
    try { await engine.reset(); } catch {}
    forced.push('the engine');
  }
  return forced;
}
export function _resetTracked() { live.clear(); } // tests only

// ---------------------------------------------------------------------------------------------------------------
// 215: timers are tidied up
// ---------------------------------------------------------------------------------------------------------------
const bags = new WeakMap();
export class TimerBag {
  constructor() { this.timers = new Set(); this.closed = false; }
  set(fn, ms) {
    if (this.closed) return null;
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    t.unref?.();
    this.timers.add(t);
    return t;
  }
  clear(t) { if (t) { clearTimeout(t); this.timers.delete(t); } }
  // Ends the bag: every timer still waiting is cleared. Returns how many were.
  close() { const n = this.timers.size; for (const t of this.timers) { if (typeof t?.clear === 'function') t.clear(); else clearTimeout(t); } this.timers.clear(); this.closed = true; return n; }
}
// The bag for one turn, found by its signal (made on first use).
export function timersFor(signal) {
  if (!signal) return new TimerBag();
  let b = bags.get(signal);
  if (!b) { b = new TimerBag(); bags.set(signal, b); }
  return b;
}
// Waits for p, or ms at most (then resolves with fallback). The timer goes as soon as either happens.
export function raceTimeout(p, ms, fallback = null) {
  let t;
  return Promise.race([Promise.resolve(p).finally(() => clearTimeout(t)), new Promise((r) => { t = setTimeout(() => r(fallback), ms); })]);
}

// ---------------------------------------------------------------------------------------------------------------
// 216: long loads
// ---------------------------------------------------------------------------------------------------------------
// usual: this brain's last load time in seconds (0 when never loaded); most: the hard limit (loadTimeoutSeconds).
// Returns { soft, hard } in seconds: past soft the load is stopped and tried once more; hard is the limit after that.
export function loadDeadline(usual, most = 300) {
  const hard = Math.max(30, Number(most) || 300);
  const u = Number(usual) || 0;
  if (!(u > 0)) return { soft: hard, hard };
  return { soft: Math.min(hard, Math.max(30, Math.round(u * 2), Math.round(u + 20))), hard };
}

// ---------------------------------------------------------------------------------------------------------------
// 217: card time-outs don't count sleep
// ---------------------------------------------------------------------------------------------------------------
// A tick that comes much later than asked means the PC was asleep (or Bob was frozen): only one tick's worth counts.
export const AWAKE_TICK_MS = 5000;
export function awakeTimeout(fn, ms, { tick = AWAKE_TICK_MS, now = () => Date.now(), bag = null } = {}) {
  let spent = 0, last = now(), done = false;
  const slack = tick * 3;
  const iv = setInterval(() => {
    const t = now(), gap = t - last;
    last = t;
    spent += gap > slack ? tick : Math.max(0, gap);
    if (spent >= ms && !done) { handle.clear(); fn(); }
  }, tick);
  iv.unref?.();
  const handle = { clear: () => { done = true; clearInterval(iv); }, spent: () => spent };
  if (bag && !bag.closed) { const t = { clear: handle.clear }; bag.timers.add(t); const c = handle.clear; handle.clear = () => { c(); bag.timers.delete(t); }; } // closed with the turn
  return handle;
}

// ---------------------------------------------------------------------------------------------------------------
// 214: a watchdog for Bob himself
// ---------------------------------------------------------------------------------------------------------------
// Bob's server runs in Bob.exe's own process, so a stuck server can't notice itself. A small helper thread holds the
// time of the last beat; the server beats every 2 s. No beat for stuckMs: the helper writes one line in the logbook.
// When beats come back, onBack({ secs }) runs on the server, which says so in the window and offers a restart.
const WATCH_CODE = `
const { workerData, parentPort } = require('node:worker_threads');
const fs = require('node:fs');
const beat = new BigInt64Array(workerData.buf);
let stuckAt = 0;
setInterval(() => {
  const now = Date.now(), last = Number(Atomics.load(beat, 0));
  if (!stuckAt && now - last >= workerData.stuckMs) {
    stuckAt = last;
    const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: workerData.timeZone, dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date());
    try { fs.appendFileSync(workerData.logbook, '- ' + stamp + ' | watchdog | Bob\\'s server hasn\\'t answered for ' + Math.round((now - last) / 1000) + ' s\\n'); } catch {}
  } else if (stuckAt && last > stuckAt) {
    parentPort.postMessage({ secs: Math.round((last - stuckAt) / 1000) });
    stuckAt = 0;
  }
}, workerData.checkMs);
`;
export function startWatchdog({ logbook, timeZone, onBack = () => {}, stuckMs = 60_000, beatMs = 2000, checkMs = 5000, WorkerImpl = Worker } = {}) {
  const buf = new SharedArrayBuffer(8);
  const beat = new BigInt64Array(buf);
  const stamp = () => Atomics.store(beat, 0, BigInt(Date.now()));
  stamp();
  let worker = null;
  try {
    worker = new WorkerImpl(WATCH_CODE, { eval: true, workerData: { buf, logbook, timeZone, stuckMs, checkMs } });
    worker.unref?.();
    worker.on?.('message', (m) => { try { onBack(m); } catch {} });
    worker.on?.('error', () => {});
  } catch { worker = null; }
  const iv = setInterval(stamp, beatMs);
  iv.unref?.();
  return { stop: () => { clearInterval(iv); try { worker?.terminate(); } catch {} }, stamp };
}
export const frozeLine = (secs) => `I froze for about ${secs < 120 ? `${secs} seconds` : `${Math.round(secs / 60)} minutes`} and didn't answer the window. I'm back now; if anything looks stuck, restart me.`;
