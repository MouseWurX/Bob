// Quick notes (Settings, How Bob works: "Quick notes"; off unless the user turns it on).
//
// "Note: ring the vet on Friday" in any chat, from the window, the phone app, Discord DMs or Telegram, and Bob writes
// it down straight away with the date and time. He can list them, find them by a word or #tag, and take one away.
//   - One plain Markdown file, inn\quick-notes.md, one line per note, oldest first. Open it in any text editor;
//     Settings has a button for it. Bob's search box finds notes too.
//   - Nothing is deleted for good: a note Bob takes away goes to inn\archive\quick-notes-removed.md first.
//   - No service, no internet, nothing runs in the background. Off = Bob doesn't see the tool at all.
//
// "Auto notes" (smartNotes, under quick notes; off unless the user turns it on as well):
//   - he notes on his own what a chat shows is worth keeping (a decision, a number, a plan, a name, a link, an idea),
//     says "📝 Noted: ..." in his reply every time, and his notes end in "(noticed by Bob)";
//   - a note without a #tag gets the project or topic the chat is on, e.g. #Starfall;
//   - a note that says much the same as an earlier one replaces it (the old wording goes to the removed-notes file);
//   - the notes that fit a message (up to 3) are put in front of him, so he brings them up without being asked.
import fs from 'node:fs';
import path from 'node:path';
import { saveFile, oneWriter } from './saving.js'; // items 229 and 231
import { beforeChange, afterChange } from './turn-changes.js';
import { overlap, words } from './topics.js';

export const notesOn = (cfg) => cfg?.quickNotes === true;
export const smartNotesOn = (cfg) => notesOn(cfg) && cfg?.smartNotes === true;
export const NOTICED = '(noticed by Bob)';
export const SAME_AS = 0.8; // word overlap at which a new note replaces an old one
export const FIT = 0.4; // word overlap at which a note fits a message
export const notesFile = (cfg) => path.join(cfg.innDir, 'quick-notes.md');
export const removedFile = (cfg) => path.join(cfg.archiveDir || path.join(cfg.innDir, 'archive'), 'quick-notes-removed.md');
export const MAX_NOTE = 2000;
const HEAD = '# Quick notes\n\nOne note per line, oldest first. You can edit this file; keep each note on one line starting with "- ".\n\n';

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

// The notes, oldest first: { n, line, text }.
export function loadNotes(cfg) {
  let raw = '';
  try { raw = fs.readFileSync(notesFile(cfg), 'utf8'); } catch { return []; }
  return raw.replace(/\r\n/g, '\n').split('\n').filter((l) => /^- \S/.test(l)).map((line, i) => ({ n: i + 1, line, text: line.slice(2) }));
}

// "2026-11-10 22:15" in the user's own time zone.
export function stamp(cfg, now = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  } catch { return now.toISOString().slice(0, 16).replace('T', ' '); }
}

// Makes the notes file if it isn't there yet, so "Open my notes" always has something to open.
export function ensureNotesFile(cfg) {
  const file = notesFile(cfg);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, HEAD);
  return file;
}

// #Tag from a project or topic name: "Starfall" -> #Starfall, "Moon Garden" -> #MoonGarden.
export const tagFor = (name) => { const t = String(name || '').replace(/[^\p{L}\p{N}]+/gu, ''); return t ? `#${t.slice(0, 30)}` : ''; };
const noteWords = (t) => String(t).replace(/^\d{4}-\d\d-\d\d \d\d:\d\d · /, '').replace(/\(noticed by Bob\)/g, '').replace(/#[\p{L}\p{N}_-]+/gu, ' ');

// The earlier note that says much the same thing, if any (both ways: neither is much more than the other).
export function sameNote(cfg, text) {
  const w = words(noteWords(text));
  if (w.size < 2) return null;
  return loadNotes(cfg).reverse().find((x) => { const o = words(noteWords(x.text)); return o.size >= 2 && overlap(noteWords(text), noteWords(x.text)) >= SAME_AS && Math.min(w.size, o.size) / Math.max(w.size, o.size) >= 0.6; }) || null;
}

// Adds a note; returns { n, replaced } (replaced = the old note it took the place of, or null).
// tag: added when the note has no #tag of its own. noticed: Bob noted it on his own. merge: replace a near-copy.
// Item 231: one writer at a time (another Bob on the same folder waits its turn).
export const addNote = (cfg, text, opts) => oneWriter(notesFile(cfg), () => addNoteNow(cfg, text, opts));
function addNoteNow(cfg, text, { now = new Date(), tag = '', noticed = false, merge = false } = {}) {
  let clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);
  if (!clean) throw new Error('There was nothing to note down.');
  if (tag && !/#[\p{L}\p{N}]/u.test(clean)) clean += ` ${tag}`;
  if (noticed) clean += ` ${NOTICED}`;
  const file = ensureNotesFile(cfg);
  const old = merge ? sameNote(cfg, clean) : null;
  const line = `- ${stamp(cfg, now)} · ${clean}`;
  if (old) {
    const arch = removedFile(cfg);
    fs.mkdirSync(path.dirname(arch), { recursive: true });
    fs.appendFileSync(arch, `- replaced ${stamp(cfg, now)}: ${old.text}\n`);
    const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
    let seen = 0;
    saveFile(file, raw.map((l) => (/^- \S/.test(l) && ++seen === old.n ? line : l)).join('\n'));
    return { n: old.n, replaced: old };
  }
  const before = fs.readFileSync(file, 'utf8');
  beforeChange(file); // item 238: Undo of the turn takes the note back out
  fs.appendFileSync(file, `${before.endsWith('\n') ? '' : '\n'}${line}\n`);
  afterChange(file);
  return { n: loadNotes(cfg).length, replaced: null };
}

// The notes that fit a message, best first (by shared words, or a #tag or project named in it).
export function fittingNotes(cfg, text, { project = '', k = 3 } = {}) {
  const said = String(text || '');
  if (words(said).size < 1) return [];
  const ptag = tagFor(project).toLowerCase();
  return loadNotes(cfg).map((x) => {
    const tags = (x.text.match(/#[\p{L}\p{N}_-]+/gu) || []).map((t) => t.toLowerCase());
    let sc = overlap(said, noteWords(x.text));
    const low = ` ${said.toLowerCase()} `;
    if (tags.some((t) => low.includes(t) || (t.length > 4 && low.includes(t.slice(1))))) sc += 0.5; // a #tag (or its word) named in the message
    if (ptag && tags.includes(ptag)) sc += 0.1;
    return { x, sc };
  }).filter((r) => r.sc >= FIT).sort((a, b) => b.sc - a.sc || b.x.n - a.x.n).slice(0, k).map((r) => r.x);
}

export function notesPrompt(cfg, text, { project = '' } = {}) {
  if (!smartNotesOn(cfg)) return '';
  const xs = fittingNotes(cfg, text, { project });
  return xs.length ? `From the user's quick notes (bring these up if they help; the numbers are for notice_board unnote):\n${xs.map((x) => `- ${x.n}. ${x.text}`).join('\n')}` : '';
}

const terms = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
export function findNotes(cfg, q) {
  const ts = terms(q);
  return loadNotes(cfg).filter((x) => ts.every((w) => x.text.toLowerCase().includes(w)));
}

// Takes note n out of the file, after copying it to the removed-notes file. `check` must be part of its words, so a
// list that changed since Bob last read it can't take the wrong note.
export const removeNote = (cfg, n, check, opts) => oneWriter(notesFile(cfg), () => removeNoteNow(cfg, n, check, opts));
function removeNoteNow(cfg, n, check = '', { now = new Date() } = {}) {
  const all = loadNotes(cfg);
  const hit = all.find((x) => x.n === Number(n));
  if (!hit) throw new Error(`There's no note number ${n}. List the notes first.`);
  if (check && !hit.text.toLowerCase().includes(String(check).toLowerCase().trim())) throw new Error(`Note ${n} now says "${hit.text}", not that. List the notes again.`);
  const arch = removedFile(cfg);
  fs.mkdirSync(path.dirname(arch), { recursive: true });
  fs.appendFileSync(arch, `- removed ${stamp(cfg, now)}: ${hit.text}\n`);
  const raw = fs.readFileSync(notesFile(cfg), 'utf8').replace(/\r\n/g, '\n').split('\n');
  let seen = 0;
  const kept = raw.filter((l) => !(/^- \S/.test(l) && ++seen === hit.n));
  saveFile(notesFile(cfg), kept.join('\n'));
  return hit;
}

const listed = (xs) => xs.map((x) => `${x.n}. ${x.text}`).join('\n');

const SCHEMA_BASE = 'Quick notes: add one the moment {{USER}} says "note", "jot down" or "write down", in their words, without asking. Also list, find (by word or #tag) or remove.';
const SCHEMA_SMART = ' Also add a note yourself, with noticed true, when the chat shows something {{USER}} will want later: a decision, a number, a date, a plan, a name, a link, an idea of theirs. One short line each, only what\'s worth keeping (not small talk, not what\'s already noted, never passwords or keys). A lasting fact about {{USER}} themselves goes to remember instead. Each time, end your reply with "📝 Noted: <the note>".';

export function notesTool(brain) {
  const cfg = brain.cfg;
  return {
    get schema() {
      const smart = smartNotesOn(cfg);
      return fn('take_note', SCHEMA_BASE + (smart ? SCHEMA_SMART : ''), {
        action: str('add, list, find or remove', { enum: ['add', 'list', 'find', 'remove'] }),
        text: str('add: the note in {{USER}}\'s words (keep #tags). find: words or a #tag. remove: a few words of the note.'),
        number: { type: 'integer', description: 'remove: its number from list or find.' },
        ...(smart ? { noticed: { type: 'boolean', description: 'add: true when you noted it on your own, not because {{USER}} asked.' } } : {})
      }, ['action']);
    },
    async run({ action, text, number, noticed }) {
      if (!notesOn(cfg)) return 'Quick notes are off. They\'re in Settings, How Bob works: "Quick notes".';
      if (action === 'add') {
        const smart = smartNotesOn(cfg);
        const own = smart && (noticed === true || noticed === 'true');
        const r = addNote(cfg, text, smart ? { tag: tagFor(brain.notesProject || ''), noticed: own, merge: true } : {});
        const said = loadNotes(cfg).find((x) => x.n === r.n)?.text || '';
        if (r.replaced) return `Noted (note ${r.n}, in place of the older note that said much the same: "${r.replaced.text}").${own ? ` Now end your reply with "📝 Noted: ${said.replace(/^\S+ \S+ · /, '').replace(` ${NOTICED}`, '')}".` : ''}`;
        return `Noted (note ${r.n}).${own ? ` Now end your reply with "📝 Noted: ${said.replace(/^\S+ \S+ · /, '').replace(` ${NOTICED}`, '')}".` : ''}`;
      }
      if (action === 'find') { const xs = findNotes(cfg, text); return xs.length ? listed(xs.slice(-30)) : `No notes have "${text}" in them.`; }
      if (action === 'remove') { const x = removeNote(cfg, number, text); return `Took note ${x.n} away ("${x.text}"). It's kept in the removed-notes file, in case.`; }
      const all = loadNotes(cfg);
      return all.length ? `${all.length} notes, newest last:\n${listed(all.slice(-20))}` : 'No notes yet.';
    },
    summary: ({ action, text, number, noticed }) => action === 'add' ? `${noticed ? 'noticed and noted' : 'note'}: ${String(text || '').slice(0, 80)}` : action === 'remove' ? `take away note ${number}` : action === 'find' ? `find notes: ${text}` : 'list notes'
  };
}

// Nov 14 (the owner: "bob has so many ways to take notes, are they redundant?"): quick notes ride on the notice board
// tool instead of being a tool of their own. take_note and notice_board both said "jot down", and the to-do check
// (verify.js) only counted notice_board, so one note could land in both files. Now there is one tool for "write it
// down": add/done/write are the to-do list (notice-board.md), note/notes/unnote are quick notes (quick-notes.md, same
// file, same Settings button, same search). With quick notes off the board looks exactly as before.
export const NOTE_ACTIONS = { note: 'add', notes: 'list', unnote: 'remove' };
const BOARD_NOTES = ' With quick notes: note = write down what {{USER}} says "note", "jot down" or "write down" about, in their words, at once (not a to-do); notes = list them, or find by words or a #tag in content; unnote = take one away (number, and a few of its words in content).';
const SMART_BOARD = ' Also note things yourself (action note, noticed true) when the chat shows something {{USER}} will want later: a decision, a number, a date, a plan, a name, a link, an idea of theirs. One short line each, only what\'s worth keeping (not small talk, not what\'s already noted, never passwords or keys). A lasting fact about {{USER}} themselves goes to remember instead. Each time, end your reply with "📝 Noted: <the note>".';

export function withNotes(board, brain) {
  const cfg = brain.cfg;
  const notes = notesTool(brain);
  return {
    ...board,
    get schema() {
      const base = board.schema;
      if (!notesOn(cfg)) return base;
      const s = JSON.parse(JSON.stringify(base));
      const f = s.function, props = f.parameters.properties;
      f.description += BOARD_NOTES + (smartNotesOn(cfg) ? SMART_BOARD : '');
      props.action = { ...props.action, description: 'read, add, done, write, note, notes or unnote', enum: [...(props.action.enum || []), ...Object.keys(NOTE_ACTIONS)] };
      props.content = { ...props.content, description: `${props.content.description} note: the note (keep #tags). notes: words or a #tag to find, or empty for all. unnote: a few words of it.` };
      props.number = { type: 'integer', description: 'unnote: its number from notes.' };
      if (smartNotesOn(cfg)) props.noticed = { type: 'boolean', description: 'note: true when you noted it on your own, not because {{USER}} asked.' };
      return s;
    },
    async run(args = {}, ctx) {
      const act = NOTE_ACTIONS[args.action];
      if (!act) return board.run(args, ctx);
      const text = args.content ?? args.text;
      // notes with words in content is a find; with none, the list.
      return notes.run({ action: act === 'list' && String(text || '').trim() ? 'find' : act, text, number: args.number, noticed: args.noticed });
    },
    summary: (args = {}) => (NOTE_ACTIONS[args.action] ? notes.summary({ action: NOTE_ACTIONS[args.action] === 'list' && args.content ? 'find' : NOTE_ACTIONS[args.action], text: args.content ?? args.text, number: args.number, noticed: args.noticed }) : board.summary(args))
  };
}
