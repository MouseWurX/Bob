// Monitoring log (Nov 16, the owner: "close the loop locally inside of Bob ... just send the info to a file locally for
// debugging", "could it actually be in plain txt?"). Off until "Monitoring log" is on (Settings, This replicant matrix).
// Each turn is one trace, the OpenTelemetry way: a root span for the turn, a child span for every engine request and
// every tool call, each with a trace id, a span id, its parent, a start, an end and a status. Nothing leaves this
// replicant matrix: the spans go to plain text files in <data>/monitoring-log/, one block per turn, readable in Notepad.
// The spans keep the OpenTelemetry shape (ids, parent, start/end, status, attributes) so an OTLP export could be added
// later without a redesign; there is none now.
// - What a span holds: names (the tool, the brain), times, ok/error/declined/stopped, sizes (characters, tokens) and
//   the kind of an error (its code or class). Never prompts, answers, thinking, tool inputs or results, error wording,
//   file paths, web addresses, keys, e-mail or another Bob's name. Brain names lose any folder in front of them.
// - Rolling files: the live file is bob-monitoring.txt. When the next turn would push it past its share (a tenth of
//   the limit, 1 to 100 MB), it is renamed with the date and time and a new one starts. The oldest renamed files go
//   when all of them pass the limit (1 GB to start; 100 MB to 10 GB). A turn is written in one go, so it is never split
//   across two files.
// - The last 20 turns are also kept in memory for the timeline in Settings. A log that can't be written never breaks a
//   turn: every function here catches its own errors.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { turnNow, turnTag, STOP_WHY } from './turn-log.js';

export const SIZES_MB = [100, 250, 500, 1024, 2048, 5120, 10240];
export const DEFAULT_MB = 1024;
export const LIVE_FILE = 'bob-monitoring.txt';
export const RECENT = 20;
export const MAX_SPANS = 400; // a turn with more steps than this keeps the first 400 and says how many were left out
const MB = 1024 * 1024;

export function cleanTraceLog(v) {
  const mb = Number(v?.maxMB);
  return { on: v?.on === true, maxMB: SIZES_MB.includes(mb) ? mb : DEFAULT_MB };
}
export const traceOn = (cfg) => cleanTraceLog(cfg?.traceLog).on;
export const traceDir = (cfg) => path.join(cfg?.dataDir || cfg?.innDir || '.', 'monitoring-log');
// One file's share of the limit: a tenth, at least 1 MB and at most 100 MB.
export const fileCap = (maxMB) => Math.min(100 * MB, Math.max(MB, Math.floor((maxMB * MB) / 10)));
export const sizeLabel = (mb) => (mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`);

const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');

// A brain or tool name, with nothing in front of it: "C:\\models\\qwen.gguf" -> "qwen". Never a folder.
export function safeName(s) {
  const last = String(s ?? '').split(/[\\/]/).pop().replace(/\.gguf$/i, '');
  return last.replace(/[^\w.:+-]/g, '_').slice(0, 60) || '?';
}
// The kind of an error, never its words (they can hold paths, addresses or chat text).
export function errorKind(e) {
  const code = String(e?.code ?? '');
  if (/^[\w-]{1,30}$/.test(code)) return code;
  const name = String(e?.name ?? '');
  return /^[A-Za-z]{1,30}$/.test(name) ? name : 'Error';
}
// A tool's answer as a status: the same reading as the tool record (tool-record.js entryOf).
export function toolStatus(text) {
  const t = String(text ?? '');
  if (/^The user said no|said no to this/i.test(t)) return 'declined';
  return /^Error:|^Not run:/.test(t) ? 'error' : 'ok';
}

// Only these attributes are kept, and only as short names or numbers.
const KEEP = { lane: 'name', why: 'name', model: 'name', error: 'name', tokens: 'num', ctx: 'num', tokPerSec: 'num', chars: 'num', steps: 'num' };
export function cleanAttrs(a = {}) {
  const out = {};
  for (const [k, v] of Object.entries(a || {})) {
    if (!(k in KEEP) || v === undefined || v === null || v === '') continue;
    if (KEEP[k] === 'num') { const n = Number(v); if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n * 10) / 10; }
    else out[k] = safeName(v);
  }
  return out;
}

export class TurnTrace {
  constructor({ id, lane = 'talk', now = Date.now } = {}) {
    this.now = now;
    this.traceId = hex(16);
    this.turn = turnTag(id) || hex(4);
    this.root = { traceId: this.traceId, spanId: hex(8), parentId: '', kind: 'turn', name: 'turn', start: now(), end: 0, status: 'ok', attrs: cleanAttrs({ lane }) };
    this.spans = [];
    this.dropped = 0;
  }
  // A child span. Returns { end(status, attrs) }; ending twice does nothing.
  start(kind, name, attrs = {}) {
    const span = { traceId: this.traceId, spanId: hex(8), parentId: this.root.spanId, kind, name: safeName(name), start: this.now(), end: 0, status: 'ok', attrs: cleanAttrs(attrs) };
    if (this.spans.length < MAX_SPANS) this.spans.push(span); else this.dropped++;
    return { span, end: (status = 'ok', more = {}) => { if (span.end) return; span.end = this.now(); span.status = status; Object.assign(span.attrs, cleanAttrs(more)); } };
  }
  finish({ why = 'done', ms, error = null } = {}) {
    if (this.root.end) return this;
    if (error && why === 'error') this.root.attrs.error = errorKind(error);
    this.root.end = Number.isFinite(ms) ? this.root.start + ms : this.now();
    this.root.status = why === 'done' || why === 'handed' ? 'ok' : why === 'stop' || why === 'parked' || why === 'stop-after' ? 'stopped' : 'error';
    this.root.attrs.why = safeName(why);
    for (const s of this.spans) if (!s.end) { s.end = this.root.end; s.status = 'unfinished'; }
    return this;
  }
}

// Starts a turn's trace when the log is on (brain-turns.js puts it on the turn's store).
export function startTurnTrace(cfg, { id, lane = 'talk', guest = false, now } = {}) {
  try { return traceOn(cfg) ? new TurnTrace({ id, lane: guest ? 'guest' : lane, now }) : null; } catch { return null; }
}
export const traceNow = () => turnNow()?.trace || null;

// Runs fn as one span of the turn running now; with no trace (log off, or outside a turn) it just runs fn.
// after(result, span) gives the attributes and, optionally, the status ({ status, ...attrs }).
export async function traced(kind, name, fn, after = () => ({}), { signal, trace = traceNow() } = {}) {
  if (!trace) return fn();
  let s = null;
  try { s = trace.start(kind, name); } catch { return fn(); }
  try {
    const r = await fn();
    try { const { status = 'ok', ...attrs } = after(r, s.span) || {}; s.end(status, attrs); } catch { s.end('ok'); }
    return r;
  } catch (e) {
    try { s.end(signal?.aborted ? 'stopped' : 'error', { error: errorKind(e) }); } catch {}
    throw e;
  }
}

// An engine reply's sizes: the engine's own numbers for this reply (speed-stats.js), only if they came after the span
// started, and how many characters came back.
export function engineAttrs(st, span, reply) {
  const out = { chars: String(reply?.content ?? '').length };
  if (st && span && Number(st.at) >= span.start) Object.assign(out, { tokens: st.used, ctx: st.ctx, tokPerSec: st.tokPerSec });
  return out;
}

// ---------- plain text ----------
const pad2 = (n) => String(n).padStart(2, '0');
function clock(t, timeZone, withDay = false) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    const hms = `${parts.hour}:${parts.minute}:${parts.second}`;
    return withDay ? `${parts.year}-${parts.month}-${parts.day} ${hms}` : `${hms}.${String(new Date(t).getMilliseconds()).padStart(3, '0')}`;
  } catch { const d = new Date(t); return withDay ? d.toISOString().slice(0, 19).replace('T', ' ') : d.toISOString().slice(11, 23); }
}
export const secs = (ms) => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} s`;
const num = (n) => Math.round(n).toLocaleString('en-US');
function extras(s) {
  const a = s.attrs || {}, out = [];
  if (a.tokens) out.push(a.ctx ? `${num(a.tokens)} of ${num(a.ctx)} tokens` : `${num(a.tokens)} tokens`);
  if (a.tokPerSec) out.push(`${a.tokPerSec} tok/s`);
  if (a.chars) out.push(`${num(a.chars)} chars`);
  if (a.error) out.push(`error kind: ${a.error}`);
  return out.join(' · ');
}
// One block per turn: a header line, then one line per span, indented under it, in the order they started.
export function renderTurn(t, { timeZone } = {}) {
  const r = t.root, spans = [...t.spans].sort((a, b) => a.start - b.start);
  const counts = {};
  for (const s of spans) counts[s.kind] = (counts[s.kind] || 0) + 1;
  const errs = spans.filter((s) => s.status === 'error' || s.status === 'refused').length;
  const what = Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') || 'no steps';
  const why = STOP_WHY[r.attrs.why] || r.attrs.why || '';
  const lines = [`=== Turn ${t.turn} · ${clock(r.start, timeZone, true)} · ${r.attrs.lane || 'talk'} · ${why} · ${secs(r.end - r.start)} · ${what}${errs ? ` · ${errs} error${errs === 1 ? '' : 's'}` : ''}${r.attrs.error ? ` · error kind: ${r.attrs.error}` : ''} · trace ${t.traceId}`];
  for (const s of spans) {
    const x = extras(s);
    lines.push(`  ${clock(s.start, timeZone)}  +${secs(s.start - r.start).padStart(8)}  ${s.kind.padEnd(6)}  ${s.name.padEnd(28)}  ${secs(s.end - s.start).padStart(8)}  ${s.status.padEnd(8)}${x ? `  ${x}` : ''}`.trimEnd());
  }
  if (t.dropped) lines.push(`  (${t.dropped} more steps not written: a turn keeps its first ${MAX_SPANS})`);
  return lines.join('\n') + '\n\n';
}
export const HEADER = '# Bob monitoring log. One block per turn: when, how long and how each step went. Names, times, status and sizes only.\n# Columns: start time, time since the turn started, kind, name, how long, status, sizes.\n\n';

// ---------- the files ----------
// The renamed (rolled) files, oldest first.
export function rolledFiles(cfg, { fsApi = fs } = {}) {
  const dir = traceDir(cfg);
  try { return fsApi.readdirSync(dir).filter((f) => /^bob-monitoring-\d{8}-\d{6}(-\d+)?\.txt$/.test(f)).sort().map((f) => path.join(dir, f)); } catch { return []; }
}
const stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`; };

// Adds one turn's block, rolling the live file first if it would pass its share, then trims the oldest.
export function writeBlock(cfg, text, { fsApi = fs, now = Date.now() } = {}) {
  try {
    const { maxMB } = cleanTraceLog(cfg?.traceLog);
    const dir = traceDir(cfg), live = path.join(dir, LIVE_FILE);
    fsApi.mkdirSync(dir, { recursive: true });
    let size = 0;
    try { size = fsApi.statSync(live).size; } catch {}
    const bytes = Buffer.byteLength(text);
    if (size > 0 && size + bytes > fileCap(maxMB)) {
      let to = path.join(dir, `bob-monitoring-${stamp(now)}.txt`);
      for (let i = 2; fsApi.existsSync(to); i++) to = path.join(dir, `bob-monitoring-${stamp(now)}-${i}.txt`);
      fsApi.renameSync(live, to);
      size = 0;
    }
    fsApi.appendFileSync(live, size === 0 ? HEADER + text : text);
    trimOld(cfg, { fsApi });
    return true;
  } catch { return false; }
}
// The oldest rolled files go until everything fits in the limit. The live file is never removed.
export function trimOld(cfg, { fsApi = fs } = {}) {
  const limit = cleanTraceLog(cfg?.traceLog).maxMB * MB;
  const live = path.join(traceDir(cfg), LIVE_FILE);
  const size = (f) => { try { return fsApi.statSync(f).size; } catch { return 0; } };
  const rolled = rolledFiles(cfg, { fsApi });
  let total = size(live) + rolled.reduce((n, f) => n + size(f), 0);
  const gone = [];
  while (total > limit && rolled.length) { const f = rolled.shift(); total -= size(f); try { fsApi.rmSync(f, { force: true }); gone.push(f); } catch {} }
  return gone;
}

const recent = [];
// The end of a turn: closes the trace, keeps it for the timeline and writes its block. Returns the text, or ''.
export function finishTurnTrace(cfg, trace, { why, ms, error } = {}, { fsApi = fs, keep = recent } = {}) {
  if (!trace) return '';
  try {
    trace.finish({ why, ms, error });
    keep.unshift(trace);
    keep.length = Math.min(keep.length, RECENT);
    const text = renderTurn(trace, { timeZone: cfg?.timeZone });
    return writeBlock(cfg, text, { fsApi }) ? text : '';
  } catch { return ''; }
}

// For Settings: the last turns as plain data (no ids beyond the turn's tag), newest first.
export function recentView(keep = recent) {
  return keep.map((t) => ({
    turn: t.turn, at: t.root.start, ms: t.root.end - t.root.start, lane: t.root.attrs.lane || 'talk', why: STOP_WHY[t.root.attrs.why] || t.root.attrs.why || '', status: t.root.status,
    spans: [...t.spans].sort((a, b) => a.start - b.start).map((s) => ({ kind: s.kind, name: s.name, from: s.start - t.root.start, ms: s.end - s.start, status: s.status, about: extras(s) })),
    dropped: t.dropped
  }));
}
export const forgetRecent = (keep = recent) => { keep.length = 0; };

// How much is on disk, for Settings.
export function logFiles(cfg, { fsApi = fs } = {}) {
  const live = path.join(traceDir(cfg), LIVE_FILE);
  const files = [...rolledFiles(cfg, { fsApi }), ...(fsApi.existsSync(live) ? [live] : [])];
  let bytes = 0;
  for (const f of files) { try { bytes += fsApi.statSync(f).size; } catch {} }
  return { files: files.length, bytes };
}
// The end of the live file, for "Show the log" (a tab of plain text; works from a phone too).
export function logTail(cfg, maxBytes = 256 * 1024, { fsApi = fs } = {}) {
  const live = path.join(traceDir(cfg), LIVE_FILE);
  try {
    const size = fsApi.statSync(live).size;
    if (size <= maxBytes) return fsApi.readFileSync(live, 'utf8');
    const fd = fsApi.openSync(live, 'r');
    try { const buf = Buffer.alloc(maxBytes); fsApi.readSync(fd, buf, 0, maxBytes, size - maxBytes); const t = buf.toString('utf8'); const at = t.indexOf('\n=== '); return `(showing the last ${Math.round(maxBytes / 1024)} KB; the whole file is ${LIVE_FILE} in the monitoring-log folder)\n\n` + (at >= 0 ? t.slice(at + 1) : t); }
    finally { fsApi.closeSync(fd); }
  } catch { return ''; }
}
// "Delete the log files": the live file and every rolled one. The switch stays as it is.
export function deleteLog(cfg, { fsApi = fs } = {}) {
  let n = 0;
  for (const f of [...rolledFiles(cfg, { fsApi }), path.join(traceDir(cfg), LIVE_FILE)]) { try { if (fsApi.existsSync(f)) { fsApi.rmSync(f, { force: true }); n++; } } catch {} }
  forgetRecent();
  return n;
}
