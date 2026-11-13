// 🫥 Amnesia mode (Settings, How Bob works, 💬 Chat extras: "Amnesia mode"; off unless turned on).
// While Amnesia mode is on Bob works as usual: he reads and writes his memory, takes the notes he needs, fills in
// Topics. When you turn it off, he forgets everything from that stretch. How: turning it on copies what he keeps
// (below) to inn\bob\amnesia\before; turning it off puts those copies back and deletes anything that wasn't there.
//   chats      every chat file (a chat started in the stretch goes, an older chat loses what was added)
//   notes      his memory (and its change list), his how-tos, About you, quick notes, the notice board, Topics, memory matching, the logbook,
//              what his hands did and the Sunday digest
// What he made (pictures, files, code) stays where it is, unless "Delete them too" is picked: then the files he
// made in the stretch go, but never a file he only changed (an edit to your file stays your file).
// Reminders and scheduled jobs set in the stretch stay: they're things you asked to happen later.
// The mode survives a restart (inn\bob\amnesia\state.json) and can turn itself off after a set time.
import fs from 'node:fs';
import path from 'node:path';
import { sessionDir } from './chats.js';

export const amnesiaOffered = (cfg) => cfg?.amnesiaOffer === true;
export const AMNESIA_AUTO = [[0, 'Never'], [60, '1 hour'], [240, '4 hours'], [1440, '1 day']];
export const cleanAmnesiaAuto = (v) => (AMNESIA_AUTO.some(([m]) => m === Number(v)) ? Number(v) : 0);
export const amnesiaDeleteMade = (cfg) => cfg?.amnesiaMade === 'delete';

const home = (cfg) => path.join(cfg.dataDir, 'amnesia');
const stateFile = (cfg) => path.join(home(cfg), 'state.json');
const beforeDir = (cfg) => path.join(home(cfg), 'before');

// The single files that hold his notes. Each is [name in the copy, real path].
export function noteFiles(cfg) {
  const own = cfg.profileDir || cfg.dataDir;
  return [
    ['bob-memory.md', cfg.memoryFile || path.join(cfg.innDir, 'bob-memory.md')],
    ['memory-changes.jsonl', path.join(cfg.innDir, 'memory-changes.jsonl')],
    ['howtos.json', path.join(cfg.dataDir, 'howtos.json')],
    ['about-me.md', path.join(cfg.dataDir, 'about-me.md')],
    ['quick-notes.md', path.join(cfg.innDir, 'quick-notes.md')],
    ['notice-board.md', cfg.noticeBoard || path.join(cfg.innDir, 'notice-board.md')],
    ['logbook.md', cfg.logbook || path.join(cfg.innDir, 'logbook.md')],
    ['topics.json', path.join(own, 'topics.json')],
    ['memory-vectors.json', path.join(cfg.dataDir, 'memory-vectors.json')],
    ['hands-journal.json', path.join(cfg.dataDir, 'hands-journal.json')],
    ['digest.json', path.join(cfg.dataDir, 'digest.json')]
  ];
}

export function amnesiaState(cfg) {
  try { const s = JSON.parse(fs.readFileSync(stateFile(cfg), 'utf8')); return s && s.on === true && Number(s.since) > 0 ? { on: true, since: Number(s.since), autoOff: Number(s.autoOff) || 0 } : { on: false }; } catch { return { on: false }; }
}

const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const n of fs.readdirSync(from)) { const a = path.join(from, n), b = path.join(to, n); if (fs.statSync(a).isFile()) fs.copyFileSync(a, b); } };

// Turn it on. Copies what he keeps first; if that fails, the mode doesn't start.
export function startAmnesia(cfg, { now = Date.now() } = {}) {
  if (amnesiaState(cfg).on) return { ok: true, already: true, ...amnesiaState(cfg) };
  const dir = beforeDir(cfg);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });
  const had = [];
  for (const [name, real] of noteFiles(cfg)) if (fs.existsSync(real)) { fs.copyFileSync(real, path.join(dir, 'notes', name)); had.push(name); }
  const chats = sessionDir(cfg);
  if (fs.existsSync(chats)) copyDir(chats, path.join(dir, 'chats'));
  else fs.mkdirSync(path.join(dir, 'chats'), { recursive: true });
  const minutes = cleanAmnesiaAuto(cfg.amnesiaAutoOff);
  const state = { on: true, since: now, autoOff: minutes ? now + minutes * 60e3 : 0, had };
  fs.writeFileSync(stateFile(cfg), JSON.stringify(state));
  return { ok: true, on: true, since: now, autoOff: state.autoOff };
}

// What turning it off would forget, counted for the box that asks first.
export function amnesiaCount(cfg, made = null) {
  const s = amnesiaState(cfg);
  if (!s.on) return { on: false };
  const dir = beforeDir(cfg);
  let chats = 0, messages = 0;
  const chatsNow = sessionDir(cfg);
  const read = (f) => { try { const v = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(v) ? v : []; } catch { return null; } }; // null: locked or unreadable
  try {
    // A message counts when neither part of its chat (recent or older) had it before: messages that only moved from
    // the recent part to the older part aren't new.
    const stems = new Set(fs.readdirSync(chatsNow).filter((n) => /^[a-zA-Z0-9-]+(\.older)?\.json$/.test(n)).map((n) => n.replace(/(\.older)?\.json$/, '')));
    for (const stem of stems) {
      const was = new Set([...(read(path.join(dir, 'chats', stem + '.json')) || []), ...(read(path.join(dir, 'chats', stem + '.older.json')) || [])].map((m) => m.id).filter(Boolean));
      const now = [...(read(path.join(chatsNow, stem + '.json')) || []), ...(read(path.join(chatsNow, stem + '.older.json')) || [])];
      const added = now.filter((m) => (m.role === 'user' || m.role === 'assistant') && !(m.id && was.has(m.id))).length;
      if (added) { messages += added; chats++; }
    }
  } catch {}
  const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length; } catch { return 0; } };
  const real = Object.fromEntries(noteFiles(cfg));
  const grew = (name) => Math.max(0, lines(real[name]) - lines(path.join(dir, 'notes', name)));
  let topics = 0;
  try { const was = new Set((JSON.parse(fs.readFileSync(path.join(dir, 'notes', 'topics.json'), 'utf8')).topics || []).map((t) => t.id)); topics = (JSON.parse(fs.readFileSync(real['topics.json'], 'utf8')).topics || []).filter((t) => !was.has(t.id)).length; }
  catch { try { topics = (JSON.parse(fs.readFileSync(real['topics.json'], 'utf8')).topics || []).length; } catch {} }
  const madeList = madeSince(cfg, made, s.since);
  return { on: true, since: s.since, autoOff: s.autoOff, chats, messages, memory: grew('bob-memory.md'), notes: grew('quick-notes.md') + grew('notice-board.md') + grew('about-me.md'), topics, made: madeList.length };
}

// Files Bob made in the stretch that "Delete them too" may delete: only new files, never one he changed.
const CHANGERS = new Set(['edit_file', 'office_edit', 'strip_metadata']);
export function madeSince(cfg, made, since) {
  let list = [];
  try { list = made?.load?.() || []; } catch {}
  return list.filter((x) => (Number(x.at) || 0) >= since && !CHANGERS.has(x.tool) && x.path && (() => {
    try { const st = fs.statSync(x.path); return st.isFile() && (!st.birthtimeMs || st.birthtimeMs >= since - 2000); } catch { return false; }
  })());
}

// Turn it off: put the copies back. busy: Bob is working (a job or a turn), so it waits.
export function endAmnesia(cfg, { brain = null, made = null, deleteMade = amnesiaDeleteMade(cfg) } = {}) {
  const s = amnesiaState(cfg);
  if (!s.on) return { ok: true, on: false };
  if (brain && (brain.turns?.size || (brain.queue || []).some((j) => j.state !== 'done'))) return { error: 'Bob is still working. Let him finish, or press Stop, then turn Amnesia mode off.' };
  const dir = beforeDir(cfg);
  const count = amnesiaCount(cfg, made);
  // Notes: back as they were; a file that wasn't there goes.
  for (const [name, real] of noteFiles(cfg)) {
    const copy = path.join(dir, 'notes', name);
    if (fs.existsSync(copy)) { fs.mkdirSync(path.dirname(real), { recursive: true }); fs.copyFileSync(copy, real); }
    else fs.rmSync(real, { force: true });
  }
  // Chats: the folder goes back to the copy.
  const chats = sessionDir(cfg), was = path.join(dir, 'chats');
  fs.mkdirSync(chats, { recursive: true });
  const keep = new Set(fs.existsSync(was) ? fs.readdirSync(was) : []);
  for (const n of fs.readdirSync(chats)) { const f = path.join(chats, n); if (!keep.has(n) && fs.statSync(f).isFile()) fs.rmSync(f, { force: true }); }
  if (fs.existsSync(was)) copyDir(was, chats);
  // What he made, only when asked.
  let madeGone = 0;
  if (deleteMade) {
    const gone = madeSince(cfg, made, s.since);
    for (const x of gone) { try { fs.rmSync(x.path, { force: true }); madeGone++; } catch {} }
    try { const paths = new Set(gone.map((x) => x.path)); made?.save?.(made.load().filter((x) => !paths.has(x.path))); } catch {}
  }
  // Bob's working memory of the chats goes too, so nothing is read from it again.
  try { brain?.sessions?.clear?.(); brain?.memProject?.clear?.(); } catch {}
  fs.rmSync(home(cfg), { recursive: true, force: true });
  return { ok: true, on: false, forgot: { ...count, madeGone } };
}

// Called once a minute: turns the mode off when its set time has passed. Returns true when it did.
export function amnesiaTick(cfg, opts, now = Date.now()) {
  const s = amnesiaState(cfg);
  if (!s.on || !s.autoOff || now < s.autoOff) return false;
  return endAmnesia(cfg, opts).ok === true;
}
