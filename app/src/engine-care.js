// Engine and memory care (reliability list, items 218-228). Always on: these are fixes, not features.
// Every check runs in code. Nothing here adds words to what the brain reads; what the person sees is a one-line
// note in the chat, and only when a check fires.
//
//   218 A crashed engine restarts by itself, at most 3 times in 10 minutes, then Bob says plainly what's wrong.
//   219 Before each turn the engine's health is checked (one small /health request); a running but silent engine
//       is named in the logbook and started fresh.
//   220 Card memory is read right before a load (the real free memory then, not a guess from start-up).
//   221 A load that fails for memory is tried once more with a smaller chat memory, and the chat says so.
//   222 The last engine settings that started each brain are kept; after a failed start, Bob goes back to them once.
//   223 One engine start at a time: two jobs that both find the brain missing load it once.
//   224 The port is checked free before starting; another is picked if something else holds it.
//   225 A slow engine is spotted (words per second far under this brain's usual) and loaded fresh before the next job.
//   226 The engine's own error line (out of memory, bad file, unknown setting) becomes the plain reason shown.
//   227 A brain file's size (and checksum, when it changed since its download) is checked before it loads.
//   228 A brain that writes its tool calls as text 3 replies in a row gets its family's chat template.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';

const MB = 1024 ** 2, GB = 1024 ** 3;

// Small JSON files, written whole to a temp file and swapped in, so a crash never leaves half a file.
export function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return fallback; } }
export function writeJson(file, value) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); const t = `${file}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(value, null, 1)); fs.renameSync(t, file); return true; } catch { return false; }
}

// ---------- 218 Crash budget ----------
export const CRASH_LIMIT = 3;
export const CRASH_WINDOW_MS = 10 * 60_000;
export class CrashBudget {
  constructor({ limit = CRASH_LIMIT, windowMs = CRASH_WINDOW_MS, now = () => Date.now() } = {}) { this.limit = limit; this.windowMs = windowMs; this.now = now; this.times = {}; }
  recent(model) { const t = this.now(); return (this.times[model] = (this.times[model] || []).filter((x) => t - x < this.windowMs)); }
  note(model) { this.recent(model).push(this.now()); return this.times[model].length; }
  spent(model) { return this.recent(model).length >= this.limit; }
  // When the oldest crash in the window leaves it, so a restart is allowed again (ms from now, 0 = now).
  waitMs(model) { const r = this.recent(model); return r.length >= this.limit ? Math.max(0, r[0] + this.windowMs - this.now()) : 0; }
}
export const crashHoldLine = (label, n, reason, mins) => `My engine crashed ${n} times in ${Math.round(CRASH_WINDOW_MS / 60000)} minutes running the ${label}${reason ? ` (${reason})` : ''}, so I've stopped restarting it for now. I'll try it again in about ${Math.max(1, mins)} min. A smaller brain or a shorter chat memory usually helps if it keeps happening.`;

// ---------- 226 The engine's own error, in plain words ----------
const PLAIN = [
  [/out of memory|cudaMalloc failed|failed to allocate|ErrorOutOfDeviceMemory|unable to allocate|alloc.*(buffer|memory).*fail|not enough memory/i, 'there wasn\'t enough free memory for it'],
  [/unknown model architecture/i, 'this engine is too old for this brain (update the Brain Engine)'],
  [/invalid magic|failed to read magic|not a gguf|gguf_init_from_file.*failed|failed to load model|tensor .* data is not within the file bounds|corrupted|unexpectedly reached end of file/i, 'the brain file looks damaged or unfinished'],
  [/(couldn't|could not|failed to) bind|address already in use|EADDRINUSE/i, 'something else is using its port'],
  [/(unknown|invalid|unrecognized) (argument|option)[:\s]+(\S+)/i, (m) => `the engine didn't accept a setting (${m[3].replace(/['"`]/g, '')})`],
  [/no CUDA-capable device|CUDA driver version is insufficient|cudaGetDeviceCount|ggml_cuda_init: failed/i, 'the graphics card driver didn\'t answer (an update or a restart of the PC may fix it)'],
  [/vk::|vulkan.*(error|fail)/i, 'the graphics card (Vulkan) refused to start it'],
  [/chat template|jinja/i, 'its chat template didn\'t work'],
  [/(file|path).*(not found|no such file)|No such file or directory/i, 'a file it needs is missing']
];
export function plainEngineError(text) {
  const s = String(text || '');
  for (const [re, say] of PLAIN) { const m = s.match(re); if (m) return typeof say === 'function' ? say(m) : say; }
  return '';
}
export const memoryFailure = (text) => PLAIN[0][0].test(String(text || ''));

// ---------- 220/221 Memory ----------
export const MIN_SHRINK_CTX = 8192;
// The next smaller chat memory to try: half, in whole thousands, never under 8K. null: nothing smaller to try.
export function shrinkCtx(ctx) {
  const c = Number(ctx) || 0;
  if (c <= MIN_SHRINK_CTX) return null;
  return Math.max(MIN_SHRINK_CTX, Math.floor(c / 2 / 1024) * 1024);
}
// Whether a brain fits the memory free right now. cardFreeMB: the card's real free memory (null: no reading, then
// nothing is decided). kvFor(ctx): its chat memory at a size. Returns { ok, needGB, haveGB, fitsCtx } where fitsCtx is
// the biggest smaller size that would fit (or null).
export const RAM_KEEP = 2 * GB;
export function memCheck({ fileBytes, kvFor = () => 0, ctx, cardFreeMB, ramFreeBytes = 0, cardOnly = false }) {
  if (!(fileBytes > 0) || !Number.isFinite(cardFreeMB)) return { ok: true, unknown: true };
  const have = cardFreeMB * MB + (cardOnly ? 0 : Math.max(0, ramFreeBytes - RAM_KEEP));
  const need = (c) => fileBytes + (Number(kvFor(c)) || 0) + 0.5 * GB;
  const gb = (b) => Math.round((b / GB) * 10) / 10;
  if (need(ctx) <= have) return { ok: true, needGB: gb(need(ctx)), haveGB: gb(have) };
  let c = ctx, fitsCtx = null;
  while ((c = shrinkCtx(c))) { if (need(c) <= have) { fitsCtx = c; break; } }
  return { ok: false, needGB: gb(need(ctx)), haveGB: gb(have), fitsCtx };
}
export const noRoomLine = (label, needGB, haveGB) => `There isn't enough free memory to load the ${label} right now: it needs about ${needGB} GB and about ${haveGB} GB is free (card and RAM). Closing a big program, or picking a smaller brain, will make room.`;
export const shrinkLine = (label, from, to) => `My memory was too full for the ${label} at ${Math.round(from / 1024)}K, so I loaded it with a ${Math.round(to / 1024)}K chat memory. Long chats get trimmed sooner until Bob restarts.`;

// ---------- 222 Last good settings ----------
// Port and the lent-card list change from run to run; everything else is the brain's own settings.
export function settingsOnly(args = []) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (['--port', '--rpc'].includes(args[i])) { i++; continue; }
    out.push(args[i]);
  }
  return out;
}
export const sameSettings = (a, b) => JSON.stringify(settingsOnly(a)) === JSON.stringify(settingsOnly(b));
// The flags that differ, for the logbook: "added --spec-type draft-mtp; dropped --flash-attn".
export function settingsDiff(now = [], good = []) {
  const flags = (a) => { const m = new Map(); a = settingsOnly(a); for (let i = 0; i < a.length; i++) if (/^-/.test(a[i])) m.set(a[i], a[i + 1] && !/^-/.test(a[i + 1]) ? a[i + 1] : ''); return m; };
  const n = flags(now), g = flags(good), parts = [];
  for (const [k, v] of n) if (!g.has(k)) parts.push(`added ${k}${v ? ` ${v}` : ''}`); else if (g.get(k) !== v) parts.push(`${k} ${g.get(k)} -> ${v}`);
  for (const k of g.keys()) if (!n.has(k)) parts.push(`dropped ${k}`);
  return parts.join('; ');
}
export const lastGoodLine = (label, when) => `The ${label} wouldn't start with its newest engine settings, so I started it with the ones that worked last time${when ? ` (${when})` : ''}.`;

// ---------- 224 Port ----------
export function portFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen({ port, host, exclusive: true }, () => s.close(() => resolve(true)));
  });
}
// The port to start on: the usual one when it's free, else the first free one of a few spare ones (every third, so
// the second server's and the memory search's own ports next to it stay clear). null: none free.
export async function pickPort(port, { avoid = [], isFree = portFree, tries = 6 } = {}) {
  if (await isFree(port)) return port;
  for (let k = 1; k <= tries; k++) {
    const p = port + 7 + k * 3;
    if (!avoid.includes(p) && (await isFree(p))) return p;
  }
  return null;
}

// ---------- 225 Slow engine ----------
export const SLOW_SHARE = 0.4;  // under 40% of the usual speed
export const SLOW_MIN_SAMPLES = 5;
export const SLOW_MIN_TOKENS = 64;
export const SLOW_IN_A_ROW = 2;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
// Speeds are kept per brain, per place (card or processor, chat memory size) and per how much the chat held,
// because a long chat is slower by nature.
export const speedKey = ({ model, cpu, ctx }) => `${model}|${cpu ? 'cpu' : 'card'}|${ctx || 0}`;
export const speedBucket = (promptTokens) => Math.max(0, Math.floor(Math.log2(Math.max(1, (Number(promptTokens) || 0) / 2048))));
export class SpeedWatch {
  constructor(data = {}) { this.data = data && typeof data === 'object' ? data : {}; this.row = {}; }
  // One reply's speed. Returns { slow, usual, now } when this reply makes it slow enough times in a row, else null.
  add(key, bucket, tps, outTokens) {
    if (!(tps > 0) || !((Number(outTokens) || 0) >= SLOW_MIN_TOKENS)) return null;
    const k = `${key}#${bucket}`;
    const list = (this.data[k] ||= []);
    const usual = list.length >= SLOW_MIN_SAMPLES ? median(list) : 0;
    const slow = usual > 0 && tps < usual * SLOW_SHARE;
    this.row[k] = slow ? (this.row[k] || 0) + 1 : 0;
    if (!slow) { list.push(Math.round(tps * 10) / 10); if (list.length > 20) list.splice(0, list.length - 20); } // a slow reply doesn't drag the usual down
    if (slow && this.row[k] >= SLOW_IN_A_ROW) { this.row[k] = 0; return { slow: true, usual: Math.round(usual), now: Math.round(tps) }; }
    return null;
  }
}
export const slowLine = (label, now, usual) => `The ${label} was answering at about ${now} words a second, well under its usual ${usual}. I'll load it fresh before the next job; that usually fixes it.`;

// ---------- 227 Brain files ----------
export const brainFilesPath = (cfg) => path.join(cfg.dataDir, 'brain-files.json');
// models.js calls this after a download passes its size and checksum check.
export function recordBrainFile(cfg, file, { bytes, sha256 }) {
  if (!/\.gguf$/i.test(file) || !cfg?.dataDir) return;
  const all = readJson(brainFilesPath(cfg), {});
  let mtimeMs = 0;
  try { mtimeMs = Math.round(fs.statSync(file).mtimeMs); } catch {}
  all[path.resolve(file)] = { bytes, ...(/^[0-9a-f]{64}$/.test(sha256 || '') ? { sha256 } : {}), mtimeMs, at: new Date().toISOString() };
  writeJson(brainFilesPath(cfg), all);
}
export async function sha256Of(file) {
  const h = crypto.createHash('sha256');
  for await (const c of fs.createReadStream(file)) h.update(c);
  return h.digest('hex');
}
// Returns '' when the file is fine, else the plain reason. hash lets tests count or skip the slow part.
export async function checkBrainFile(cfg, file, { hash = sha256Of, log = () => {} } = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return ''; } // a missing file is reported by the load itself, as before
  // Only files Bob downloaded and checked have a record; others are left to the engine (226 names a bad one).
  const all = readJson(brainFilesPath(cfg), {});
  const key = path.resolve(file), rec = all[key];
  if (!rec) return '';
  // Every GGUF file starts with the letters GGUF; anything else is unfinished or not a brain at all.
  try {
    const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
    if (st.size < 4 || b.toString('latin1') !== 'GGUF') return 'the brain file doesn\'t start like a brain file, so it\'s damaged or unfinished. Download it again from Get models';
  } catch { return ''; }
  if (rec.bytes && st.size !== rec.bytes) return `the brain file is the wrong size (${(st.size / 1e9).toFixed(2)} GB, it was ${(rec.bytes / 1e9).toFixed(2)} GB when downloaded), so it's damaged. Download it again from Get models`;
  if (Math.round(st.mtimeMs) !== rec.mtimeMs && rec.sha256) {
    log(`${path.basename(file)} changed since its download; checking its checksum once before loading`);
    let got = '';
    try { got = await hash(file); } catch { return ''; }
    if (got !== rec.sha256) return 'the brain file changed since its download and its checksum no longer matches, so it\'s damaged. Download it again from Get models';
    all[key] = { ...rec, mtimeMs: Math.round(st.mtimeMs) };
    writeJson(brainFilesPath(cfg), all);
  }
  return '';
}

// ---------- 228 Tool calls written as text ----------
export const TEXT_CALLS_IN_A_ROW = 3;
export class TextCallWatch {
  constructor() { this.row = {}; }
  // Only replies that were offered tools count. rescued: the call came as text. real: a proper tool call.
  // Returns true on the reply that makes it TEXT_CALLS_IN_A_ROW in a row.
  note(model, { offered, rescued, real }) {
    if (!offered) return false;
    if (real) { this.row[model] = 0; return false; }
    if (!rescued) return false;
    this.row[model] = (this.row[model] || 0) + 1;
    if (this.row[model] >= TEXT_CALLS_IN_A_ROW) { this.row[model] = 0; return true; }
    return false;
  }
}
export const templateLine = (label) => `The ${label} kept writing its tool calls as plain text, so I'm loading it with its family's chat template before the next job.`;
