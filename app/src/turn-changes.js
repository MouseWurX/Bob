// What one turn changed, so Undo can take the whole turn back (reliability item 238), and a log of every change to
// Bob's memory file, so a wrong memory can be traced to the turn that wrote it (item 237). Always on; nothing here
// reaches the brain.
//
// While a tool runs for a turn (brain.runTool), the turn is known to every save under it (AsyncLocalStorage). The first
// time a turn changes a file, what the file held is kept in inn\bob\turn-changes\<turn>.json (up to 2 MB a file, 20 MB
// a turn). Undo puts every file back the way it was before the turn, newest change first, but only a file that still
// holds what the turn left in it: anything changed since is left alone and named. A file the turn made is moved to
// inn\bob\backups\undone, never deleted. Records go after a week.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { saveJson, readSaved, watchSaves } from './saving.js';

export const turnScope = new AsyncLocalStorage();
export const MAX_FILE = 2 * 1024 * 1024;
export const MAX_TURN = 20 * 1024 * 1024;
export const KEEP_MS = 7 * 864e5;
const dirOf = (cfg) => path.join(cfg.dataDir, 'turn-changes');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const turnKey = (sessionId, askId) => crypto.createHash('sha1').update(`${sessionId}\n${askId}`).digest('hex').slice(0, 20);
const recFile = (cfg, sessionId, askId) => path.join(dirOf(cfg), `${turnKey(sessionId, askId)}.json`);

// Run fn as part of a turn. scope: { cfg, sessionId, askId, jobId, tool }. Guest turns (another Bob, Telegram,
// Discord) aren't recorded: their chat isn't kept here.
export function inTurn(scope, fn) {
  if (!scope?.cfg || !scope.sessionId || !scope.askId) return fn();
  return turnScope.run(scope, fn);
}
export const currentTurn = () => turnScope.getStore() || null;

// Before a file changes inside a turn: keep what it held (once per file per turn).
export function beforeChange(file) {
  const t = currentTurn();
  if (!t) return;
  const f = path.resolve(String(file));
  if (f.startsWith(path.resolve(dirOf(t.cfg))) || path.basename(f) === 'memory-changes.jsonl') return; // its own records, and the memory log (a log isn't undone)
  const rf = recFile(t.cfg, t.sessionId, t.askId);
  const rec = readSaved(rf, null) || { sessionId: t.sessionId, askId: t.askId, jobId: t.jobId || null, at: Date.now(), bytes: 0, files: [] };
  t.pending = (t.pending || new Set()).add(f);
  if (rec.files.some((x) => x.file === f)) return;
  let entry = { file: f, existed: false, tool: t.tool || '' };
  try {
    const st = fs.statSync(f);
    if (st.isFile()) {
      entry.existed = true;
      if (st.size > MAX_FILE || rec.bytes + st.size > MAX_TURN) entry.tooBig = true;
      else { // what it held, in a file of its own beside the record (the record stays small)
        const b = fs.readFileSync(f);
        entry.blob = `${path.basename(rf, '.json')}-${rec.files.length}.bin`;
        fs.mkdirSync(dirOf(t.cfg), { recursive: true });
        fs.writeFileSync(path.join(dirOf(t.cfg), entry.blob), b);
        rec.bytes += b.length;
      }
    }
  } catch {}
  rec.files.push(entry);
  try { saveJson(rf, rec, 0); } catch {}
}
// After the turn's tool is done: note what each changed file holds now, so Undo can tell if it was changed again.
export function afterChanges(t = currentTurn()) {
  if (!t?.pending?.size) return 0;
  const rf = recFile(t.cfg, t.sessionId, t.askId);
  const rec = readSaved(rf, null);
  if (!rec) return 0;
  for (const e of rec.files) if (t.pending.has(e.file)) { try { e.after = hash(fs.readFileSync(e.file)); } catch { e.after = null; } }
  t.pending.clear();
  try { saveJson(rf, rec, 0); } catch {}
  return rec.files.length;
}
// After a save inside a turn: what the file holds now, so Undo can tell whether someone changed it since.
export function afterChange(file) {
  const t = currentTurn();
  if (!t?.pending) return;
  const f = path.resolve(String(file));
  if (!t.pending.has(f)) return;
  const rf = recFile(t.cfg, t.sessionId, t.askId);
  const rec = readSaved(rf, null);
  const e = rec?.files.find((x) => x.file === f);
  if (!e) return;
  try { e.after = hash(fs.readFileSync(f)); } catch { e.after = null; }
  try { saveJson(rf, rec, 0); } catch {}
}
watchSaves({ before: beforeChange, after: afterChange }); // every saveFile (saving.js) inside a turn

export function turnChanges(cfg, sessionId, askId) {
  const rec = readSaved(recFile(cfg, sessionId, askId), null);
  return rec ? rec.files.map((e) => ({ file: e.file, existed: e.existed, undoable: !e.tooBig })) : [];
}
// The asks in a chat whose turn changed something (for the … menu).
export function changedTurns(cfg, sessionId) {
  const out = [];
  try {
    for (const n of fs.readdirSync(dirOf(cfg))) {
      if (!n.endsWith('.json')) continue;
      const r = readSaved(path.join(dirOf(cfg), n), null);
      if (r?.sessionId === sessionId && r.files?.length) out.push(r.askId);
    }
  } catch {}
  return out;
}

// Undo a whole turn: { restored: [files], skipped: [{ file, why }] }.
export function undoTurn(cfg, sessionId, askId) {
  const rf = recFile(cfg, sessionId, askId);
  const rec = readSaved(rf, null);
  if (!rec?.files?.length) return { error: 'There is nothing to undo for that message (or it\'s more than a week old).' };
  const restored = [], skipped = [];
  for (const e of [...rec.files].reverse()) {
    if (e.tooBig) { skipped.push({ file: e.file, why: 'too big to keep a copy of' }); continue; }
    let now = null;
    try { now = fs.readFileSync(e.file); } catch {}
    const nowHash = now ? hash(now) : null;
    if (e.after !== undefined && nowHash !== e.after) { skipped.push({ file: e.file, why: 'changed since' }); continue; }
    try {
      if (e.existed) { saveFileRaw(e.file, fs.readFileSync(path.join(dirOf(cfg), e.blob))); restored.push(e.file); }
      else if (now) {
        const to = path.join(cfg.dataDir, 'backups', 'undone', `${Date.now()}-${path.basename(e.file)}`);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        try { fs.renameSync(e.file, to); } catch { fs.copyFileSync(e.file, to); fs.rmSync(e.file, { force: true }); }
        restored.push(e.file);
      }
    } catch (err) { skipped.push({ file: e.file, why: String(err.message || err).slice(0, 80) }); }
  }
  fs.rmSync(rf, { force: true });
  for (const e of rec.files) if (e.blob) fs.rmSync(path.join(dirOf(cfg), e.blob), { force: true });
  return { restored, skipped };
}
// The plain line under the chat after Undo changes.
export function undoLine(r) {
  const n = r.restored.length, base = (f) => path.basename(f);
  const put = n ? `Put back ${n === 1 ? base(r.restored[0]) : `${n} files`} the way ${n === 1 ? 'it was' : 'they were'} before that message.` : 'Nothing needed putting back.';
  const left = r.skipped.length ? ` Left as ${r.skipped.length === 1 ? 'it is' : 'they are'}: ${r.skipped.slice(0, 4).map((x) => `${base(x.file)} (${x.why})`).join(', ')}${r.skipped.length > 4 ? '…' : ''}.` : '';
  return put + left;
}
// Undo itself isn't a turn: write without a record.
function saveFileRaw(file, buf) { turnScope.exit(() => saveJsonFree(file, buf)); }
function saveJsonFree(file, buf) {
  const tmp = `${file}.${process.pid}-undo.bob-tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, buf);
  try { fs.renameSync(tmp, file); } catch { fs.copyFileSync(tmp, file); fs.rmSync(tmp, { force: true }); }
}

export function pruneTurns(cfg, { now = Date.now(), keepMs = KEEP_MS } = {}) {
  let n = 0;
  try { for (const x of fs.readdirSync(dirOf(cfg))) { const f = path.join(dirOf(cfg), x); if (now - fs.statSync(f).mtimeMs > keepMs) { fs.rmSync(f, { force: true }); if (x.endsWith('.json')) n++; } } } catch {}
  return n;
}

// ---------- 237 Memory changes ----------
// One line per change to the memory file: when, which chat and message, which tool (or "you" from Settings, or
// "housekeeping"), and the lines that went and came. Kept beside the memory file (so a profile has its own), locked
// on disk when "Lock my chats and memory" is on, newest 500 changes.
export const memLogFile = (cfg) => path.join(cfg.memoryFile ? path.dirname(cfg.memoryFile) : cfg.innDir, 'memory-changes.jsonl');
export const MEMLOG_KEEP = 500;
const lines = (t) => String(t || '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
export function memoryDiff(before, after) {
  const a = lines(before), b = lines(after);
  const left = new Map(); for (const l of a) left.set(l, (left.get(l) || 0) + 1);
  const added = [];
  for (const l of b) { const n = left.get(l) || 0; if (n) left.set(l, n - 1); else added.push(l); }
  const removed = [...left].flatMap(([l, n]) => Array(n).fill(l));
  return { added, removed };
}
export function logMemoryChange(cfg, before, after, { who = '', io } = {}) {
  const { added, removed } = memoryDiff(before, after);
  if (!added.length && !removed.length) return null;
  const t = currentTurn();
  const entry = { at: new Date().toISOString(), by: who || (t ? t.tool || 'a tool' : 'Bob'), ...(t ? { chat: t.sessionId, ask: t.askId, job: t.jobId || undefined } : {}), added: added.slice(0, 20), removed: removed.slice(0, 20) };
  try { io.append(memLogFile(cfg), `${JSON.stringify(entry)}\n`); } catch {}
  try {
    const f = memLogFile(cfg);
    if (fs.statSync(f).size > 1024 * 1024) { const keep = io.read(f).split('\n').filter(Boolean).slice(-MEMLOG_KEEP); io.write(f, `${keep.join('\n')}\n`); }
  } catch {}
  return entry;
}
export function readMemoryLog(cfg, read) {
  try { return read(memLogFile(cfg)).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}
