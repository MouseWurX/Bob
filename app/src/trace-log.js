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
// - Written as it happens (Nov 16, the owner: "this wont be saved in ram until you hit the button will it?"): a turn's
//   header goes to disk when it starts and each step's line when that step ends, straight to the file with no buffer,
//   so a crash loses at most the step running then. The 20 turns in Settings are only a copy of what's on disk.
// - Rolling files: the live file is bob-monitoring.txt. When a turn starts and the file is past its share (a tenth of
//   the limit, 1 to 100 MB), it is renamed with the date and time and a new one starts, but only when no other turn is
//   still being written, so a turn is never split across two files. The oldest renamed files go when all of them pass
//   the limit (1 GB to start; 100 MB to 10 GB).
// - "Include details" (Nov 16, the owner: "it's insufficient as i need to debug the data itself"; off unless turned on,
//   and only while the log is on): each step also gets its real data under its line, for debugging Bob's own runs: a
//   tool's inputs and result, the brain's answer and the message it was answering, the error's words, and the turn's
//   ask and final answer. Keys, tokens and passcodes are still hidden (secret-patterns.js), inputs named like a
//   password or key are hidden, and e-mail tools keep their data out, as in the tool record. Nothing for another Bob's
//   or a chat app's jobs (other people's words), and nothing in Gaming mode. Same files, same size limit; Delete clears
//   it. The log is .txt on purpose: lesson tools only read .jsonl/.json/.csv/.parquet and also skip this folder
//   (model-lab/common.mjs notMonitoringLog), and nothing here is ever uploaded.
// - Nothing goes by age, ever: only the size limit removes files (Nov 16, the owner: "won't the details get deleted
//   from it if it isnt hit within a certain amount of time?"). Housekeeping doesn't touch this folder either. To keep
//   something past the size limit, Keep puts it in monitoring-log/kept/: one turn from the timeline (Keep this turn,
//   added to kept-turns.txt) or the whole live file (Keep the current file). Kept files are never rolled, trimmed or
//   removed by "Delete the log files"; only "Delete kept" removes them. They don't count toward the limit.
// - The last 20 turns are also kept in memory for the timeline in Settings. A log that can't be written never breaks a
//   turn: every function here catches its own errors.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { turnNow, turnTag, STOP_WHY } from './turn-log.js';
import { SECRET_KEY, knownSecrets, hideSecrets } from './secret-patterns.js';

export const SIZES_MB = [100, 250, 500, 1024, 2048, 5120, 10240];
export const DEFAULT_MB = 1024;
export const LIVE_FILE = 'bob-monitoring.txt';
export const RECENT = 20;
export const DETAIL_MAX = 20000; // characters per detail (a tool's result, an answer); the rest is cut and counted
export const NO_DETAIL_TOOLS = new Set(['read_email', 'manage_email']); // as in the tool record (tool-record.js NOT_KEPT)
export const MAX_SPANS = 400; // a turn with more steps than this keeps the first 400 and says how many were left out
const MB = 1024 * 1024;

export function cleanTraceLog(v) {
  const mb = Number(v?.maxMB);
  return { on: v?.on === true, maxMB: SIZES_MB.includes(mb) ? mb : DEFAULT_MB, details: v?.details === true };
}
export const traceOn = (cfg) => cleanTraceLog(cfg?.traceLog).on;
// Gaming mode is the light session (sessions.js gaming()); written out here so this file needs no other Bob file.
export const gamingNow = (cfg) => cfg?.session === 'light';
export const detailsOn = (cfg, lane = 'talk') => { const t = cleanTraceLog(cfg?.traceLog); return t.on && t.details && lane !== 'guest' && !gamingNow(cfg); };

// ---------- details ----------
// A tool's inputs as text, with any input named like a password, token or key hidden.
export function hideKeyed(v, depth = 0) {
  if (depth > 8) return '[deep]';
  if (Array.isArray(v)) return v.map((x) => hideKeyed(x, depth + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) && x != null && x !== '' ? '[hidden]' : hideKeyed(x, depth + 1)]));
  return v;
}
export function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') { try { const o = JSON.parse(v); if (o && typeof o === 'object') return JSON.stringify(hideKeyed(o)); } catch {} return v; }
  try { return JSON.stringify(hideKeyed(v)); } catch { return String(v); }
}
export function clipDetail(t, max = DETAIL_MAX) {
  const s = String(t ?? '');
  return s.length > max ? `${s.slice(0, max)}… (${(s.length - max).toLocaleString('en-US')} more characters)` : s;
}
// The brain's reply as text: its words, then any tool calls it asked for.
export function replyText(r) {
  const calls = (r?.tool_calls || []).map((c) => `${c.function?.name || '?'} ${asText(c.function?.arguments ?? {})}`);
  return [String(r?.content ?? '').trim(), ...calls.map((c) => `-> ${c}`)].filter(Boolean).join('\n');
}
// The newest message the brain was answering (the whole prompt would repeat the chat every step).
export function lastAsked(messages) {
  const m = (messages || []).at(-1);
  if (!m) return '';
  const c = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((p) => p?.text || (p?.type ? `[${p.type}]` : '')).join(' ') : '';
  return `${m.role || '?'}${m.name ? ` (${m.name})` : ''}: ${c}`;
}
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
  constructor({ id, lane = 'talk', now = Date.now, details = false, secrets = [], cfg = null, sink = null } = {}) {
    this.now = now;
    this.cfg = cfg; // for Gaming mode, checked at every step
    this.sink = sink; // (text, { head, end }): writes to disk as each step ends (startTurnTrace); none in tests that only render
    this.details = Boolean(details); // "Include details": only then does any span keep data
    this.secrets = secrets;
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
    return { span, end: (status = 'ok', more = {}, detail = null) => { if (span.end) return; span.end = this.now(); span.status = status; Object.assign(span.attrs, cleanAttrs(more)); if (this.details && gamingNow(this.cfg)) this.details = false; this.keep(span, detail); this.emit(spanText(this, span)); } };
  }
  // Straight to disk (no waiting for the end of the turn), so a crash loses at most the step running then.
  emit(text, opts = {}) { try { if (this.sink && text) this.sink(text, opts, this); } catch {} }
  // The turn's first lines, written when it starts.
  begin(ask = '') { this.keep(this.root, { ask }); this.emit(headText(this), { head: true }); }
  // Details for a span (or the turn): { label: text }. Kept only with "Include details" on, keys hidden, each one cut.
  keep(span, detail) {
    if (!this.details || !detail || NO_DETAIL_TOOLS.has(span.name)) return;
    const d = {};
    for (const [k, v] of Object.entries(detail)) { const t = asText(v); if (t.trim()) d[String(k).replace(/\W/g, '').slice(0, 12)] = clipDetail(hideSecrets(t, this.secrets)); }
    if (Object.keys(d).length) span.detail = { ...(span.detail || {}), ...d };
  }
  finish({ why = 'done', ms, error = null, answer = '' } = {}) {
    if (this.root.end) return this;
    if (this.details && gamingNow(this.cfg)) this.details = false;
    if (error && why === 'error') this.root.attrs.error = errorKind(error);
    this.keep(this.root, { answer, error: error && why === 'error' ? error.message : '' });
    this.root.end = Number.isFinite(ms) ? this.root.start + ms : this.now();
    this.root.status = why === 'done' || why === 'handed' ? 'ok' : why === 'stop' || why === 'parked' || why === 'stop-after' ? 'stopped' : 'error';
    this.root.attrs.why = safeName(why);
    for (const s of this.spans) if (!s.end) { s.end = this.root.end; s.status = 'unfinished'; this.emit(spanText(this, s)); }
    this.emit(endText(this), { end: true });
    return this;
  }
}

// Starts a turn's trace when the log is on (brain-turns.js puts it on the turn's store).
// The turn's header (and, with details, its ask) goes to disk now; each step follows as it ends.
export function startTurnTrace(cfg, { id, lane = 'talk', guest = false, ask = '', now, env = process.env, fsApi = fs } = {}) {
  try {
    if (!traceOn(cfg)) return null;
    const l = guest ? 'guest' : lane, details = detailsOn(cfg, l);
    const t = new TurnTrace({ id, lane: l, now, details, secrets: details ? knownSecrets(cfg, env) : [], cfg, sink: (text, o, tr) => writeLines(cfg, text, { ...o, trace: tr, fsApi }) });
    t.begin(ask);
    return t;
  } catch { return null; }
}
export const traceNow = () => turnNow()?.trace || null;

// Runs fn as one span of the turn running now; with no trace (log off, or outside a turn) it just runs fn.
// after(result, span) gives the attributes and, optionally, the status ({ status, ...attrs }).
export async function traced(kind, name, fn, after = () => ({}), { signal, trace = traceNow(), before = null } = {}) {
  if (!trace) return fn();
  let s = null;
  try { s = trace.start(kind, name); } catch { return fn(); }
  try {
    const r = await fn();
    try { const { status = 'ok', detail = null, ...attrs } = after(r, s.span) || {}; s.end(status, attrs, detail); } catch { s.end('ok'); }
    return r;
  } catch (e) {
    try { s.end(signal?.aborted ? 'stopped' : 'error', { error: errorKind(e) }, { ...(before || {}), error: e?.message || String(e) }); } catch {}
    throw e;
  }
}

// An engine reply's sizes: the engine's own numbers for this reply (speed-stats.js), only if they came after the span
// started, and how many characters came back. With details on: the message it answered and its reply.
export function engineAttrs(st, span, reply, messages) {
  const out = { chars: String(reply?.content ?? '').length, detail: { asked: lastAsked(messages), reply: replyText(reply) } };
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
// The turn tag at the end of a step line, only while two turns are being written at once (so lines can be told apart).
const tagIf = (t) => (openTurns.size > 1 ? `  [turn ${t.turn}]` : '');
// One block per turn: a header line when it starts, one line per step as it ends (indented, details under it), and an
// end line with how it went. A turn with no end line was still running when Bob stopped.
export function headText(t) {
  const r = t.root, tz = t.cfg?.timeZone;
  return [`=== Turn ${t.turn} · ${clock(r.start, tz, true)} · ${r.attrs.lane || 'talk'} · trace ${t.traceId}`, ...detailLines({ ask: r.detail?.ask }, '    ')].join('\n') + '\n';
}
export function spanText(t, s) {
  const x = extras(s), r = t.root;
  return [`  ${clock(s.start, t.cfg?.timeZone)}  +${secs(s.start - r.start).padStart(8)}  ${s.kind.padEnd(6)}  ${s.name.padEnd(28)}  ${secs(s.end - s.start).padStart(8)}  ${s.status.padEnd(8)}${x ? `  ${x}` : ''}${tagIf(t)}`.trimEnd(), ...detailLines(s.detail, '      ')].join('\n') + '\n';
}
export function endText(t) {
  const r = t.root, spans = t.spans;
  const counts = {};
  for (const s of spans) counts[s.kind] = (counts[s.kind] || 0) + 1;
  const errs = spans.filter((s) => s.status === 'error' || s.status === 'refused').length;
  const what = Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') || 'no steps';
  const why = STOP_WHY[r.attrs.why] || r.attrs.why || '';
  return [...detailLines({ answer: r.detail?.answer, error: r.detail?.error }, '    '),
    ...(t.dropped ? [`  (${t.dropped} more steps not written: a turn keeps its first ${MAX_SPANS})`] : []),
    `--- Turn ${t.turn} ended · ${why} · ${secs(r.end - r.start)} · ${what}${errs ? ` · ${errs} error${errs === 1 ? '' : 's'}` : ''}${r.attrs.error ? ` · error kind: ${r.attrs.error}` : ''}`].join('\n') + '\n\n';
}
// The whole block at once (Keep this turn, and tests): the same lines, steps in the order they started.
export function renderTurn(t, { timeZone } = {}) {
  const v = { ...t, cfg: { ...(t.cfg || {}), timeZone: timeZone ?? t.cfg?.timeZone } };
  const was = new Set(openTurns); openTurns.clear(); // no turn tags in a block written on its own
  try { return headText(v) + [...t.spans].sort((a, b) => a.start - b.start).map((s) => spanText(v, s)).join('') + endText(v); }
  finally { for (const x of was) openTurns.add(x); }
}
// Details under a line: "label | text", each line of the text indented the same way, so a block stays readable.
export function detailLines(detail, indent) {
  const out = [];
  for (const [k, v] of Object.entries(detail || {})) {
    if (!v) continue;
    String(v).replace(/\r\n/g, '\n').split('\n').forEach((line, i) => out.push(`${indent}${(i ? '' : k).padEnd(7)}| ${line}`.trimEnd()));
  }
  return out;
}
export const HEADER = '# Bob monitoring log. One block per turn: when, how long and how each step went, written as each step ends.\n# Step columns: start time, time since the turn started, kind, name, how long, status, sizes. Lines with | under a step are its details.\n\n';

// ---------- the files ----------
// The renamed (rolled) files, oldest first.
export function rolledFiles(cfg, { fsApi = fs } = {}) {
  const dir = traceDir(cfg);
  try { return fsApi.readdirSync(dir).filter((f) => /^bob-monitoring-\d{8}-\d{6}(-\d+)?\.txt$/.test(f)).sort().map((f) => path.join(dir, f)); } catch { return []; }
}
const stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`; };

// The turns being written now. A file only rolls when a turn starts and none is open, so a turn is never split.
export const openTurns = new Set();
// Adds lines to the live file at once (no buffer). A turn's head may roll the file first, if it is past its share and
// no other turn is still being written; a turn's end trims the oldest files.
export function writeLines(cfg, text, { head = false, end = false, trace = null, fsApi = fs, now = Date.now() } = {}) {
  try {
    if (!traceOn(cfg)) { if (trace) openTurns.delete(trace); return false; } // turned off mid-turn: nothing more is written
    if (head && trace) openTurns.delete(trace);
    const ok = writeBlock(cfg, text, { fsApi, now, roll: head && openTurns.size === 0, trim: end });
    if (head && trace) openTurns.add(trace);
    if (end && trace) openTurns.delete(trace);
    return ok;
  } catch { return false; }
}
// Adds text to the live file; with roll, it first rolls the file if this would pass its share. With trim, the oldest go.
export function writeBlock(cfg, text, { fsApi = fs, now = Date.now(), roll = true, trim = true } = {}) {
  try {
    const { maxMB } = cleanTraceLog(cfg?.traceLog);
    const dir = traceDir(cfg), live = path.join(dir, LIVE_FILE);
    fsApi.mkdirSync(dir, { recursive: true });
    let size = 0;
    try { size = fsApi.statSync(live).size; } catch {}
    const bytes = Buffer.byteLength(text);
    if (roll && size > 0 && size + bytes > fileCap(maxMB)) {
      let to = path.join(dir, `bob-monitoring-${stamp(now)}.txt`);
      for (let i = 2; fsApi.existsSync(to); i++) to = path.join(dir, `bob-monitoring-${stamp(now)}-${i}.txt`);
      fsApi.renameSync(live, to);
      size = 0;
    }
    fsApi.appendFileSync(live, size === 0 ? HEADER + text : text);
    if (trim) trimOld(cfg, { fsApi });
    return true;
  } catch { return false; }
}
// The oldest rolled files go until everything fits in the limit. The live file and kept/ are never removed.
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
// The end of a turn: closes the trace (its last lines go to disk) and keeps a copy for the timeline in Settings.
// Returns the whole block as text, or ''.
export function finishTurnTrace(cfg, trace, { why, ms, error, answer } = {}, { keep = recent } = {}) {
  if (!trace) return '';
  try {
    trace.finish({ why, ms, error, answer });
    keep.unshift(trace);
    keep.length = Math.min(keep.length, RECENT);
    return renderTurn(trace, { timeZone: cfg?.timeZone });
  } catch { return ''; }
}

// For Settings: the last turns as plain data (no ids beyond the turn's tag), newest first.
export function recentView(keep = recent) {
  return keep.map((t) => ({
    turn: t.turn, kept: Boolean(t.kept), at: t.root.start, ms: t.root.end - t.root.start, lane: t.root.attrs.lane || 'talk', why: STOP_WHY[t.root.attrs.why] || t.root.attrs.why || '', status: t.root.status,
    spans: [...t.spans].sort((a, b) => a.start - b.start).map((s) => ({ kind: s.kind, name: s.name, from: s.start - t.root.start, ms: s.end - s.start, status: s.status, about: extras(s), ...(s.detail ? { detail: s.detail } : {}) })),
    ...(t.root.detail ? { detail: t.root.detail } : {}),
    dropped: t.dropped
  }));
}
export const forgetRecent = (keep = recent) => { keep.length = 0; };

// How much is on disk, for Settings.
export function logFiles(cfg, { fsApi = fs } = {}) {
  const live = path.join(traceDir(cfg), LIVE_FILE);
  const files = [...rolledFiles(cfg, { fsApi }), ...(fsApi.existsSync(live) ? [live] : [])];
  const kept = keptFiles(cfg, { fsApi });
  const sum = (list) => list.reduce((n, f) => { try { return n + fsApi.statSync(f).size; } catch { return n; } }, 0);
  return { files: files.length, bytes: sum(files), keptFiles: kept.length, keptBytes: sum(kept) };
}

// ---------- kept: never rolled or trimmed ----------
export const KEPT_TURNS = 'kept-turns.txt';
export const keptDir = (cfg) => path.join(traceDir(cfg), 'kept');
export function keptFiles(cfg, { fsApi = fs } = {}) {
  const dir = keptDir(cfg);
  try { return fsApi.readdirSync(dir).filter((f) => /^(kept-turns|bob-monitoring-kept-\d{8}-\d{6}(-\d+)?)\.txt$/.test(f)).sort().map((f) => path.join(dir, f)); } catch { return []; }
}
// Keep this turn: its block (details too, if it had them) goes to kept/kept-turns.txt. Only turns still in the timeline.
export function keepTurn(cfg, tag, { fsApi = fs, keep = recent } = {}) {
  try {
    const t = keep.find((x) => x.turn === String(tag || ''));
    if (!t) return false;
    if (t.kept) return true;
    const f = path.join(keptDir(cfg), KEPT_TURNS);
    fsApi.mkdirSync(keptDir(cfg), { recursive: true });
    fsApi.appendFileSync(f, (fsApi.existsSync(f) ? '' : HEADER.replace('# Bob monitoring log.', '# Bob monitoring log, turns you kept (never rolled or trimmed).')) + renderTurn(t, { timeZone: cfg?.timeZone }));
    t.kept = true;
    return true;
  } catch { return false; }
}
// Keep the current file: the live file moves to kept/ as it is, and the next turn starts a new one.
export function keepLiveFile(cfg, { fsApi = fs, now = Date.now() } = {}) {
  try {
    const live = path.join(traceDir(cfg), LIVE_FILE);
    if (!fsApi.existsSync(live)) return '';
    fsApi.mkdirSync(keptDir(cfg), { recursive: true });
    let to = path.join(keptDir(cfg), `bob-monitoring-kept-${stamp(now)}.txt`);
    for (let i = 2; fsApi.existsSync(to); i++) to = path.join(keptDir(cfg), `bob-monitoring-kept-${stamp(now)}-${i}.txt`);
    fsApi.renameSync(live, to);
    return path.basename(to);
  } catch { return ''; }
}
export function deleteKept(cfg, { fsApi = fs, keep = recent } = {}) {
  let n = 0;
  for (const f of keptFiles(cfg, { fsApi })) { try { fsApi.rmSync(f, { force: true }); n++; } catch {} }
  for (const t of keep) t.kept = false;
  return n;
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
// "Delete the log files": the live file and every rolled one, never the kept ones. The switch stays as it is.
export function deleteLog(cfg, { fsApi = fs } = {}) {
  let n = 0;
  for (const f of [...rolledFiles(cfg, { fsApi }), path.join(traceDir(cfg), LIVE_FILE)]) { try { if (fsApi.existsSync(f)) { fsApi.rmSync(f, { force: true }); n++; } } catch {} }
  forgetRecent();
  return n;
}
