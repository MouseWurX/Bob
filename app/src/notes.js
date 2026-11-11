// Quick notes (Settings, How Bob works: "Let Bob take quick notes"; off unless the user turns it on).
//
// "Note: ring the vet on Friday" in any chat, from the window, the phone app, Discord DMs or Telegram, and Bob writes
// it down straight away with the date and time. He can list them, find them by a word or #tag, and take one away.
//   - One plain Markdown file, inn\quick-notes.md, one line per note, oldest first. Open it in any text editor;
//     Settings has a button for it. Bob's search box finds notes too.
//   - Nothing is deleted for good: a note Bob takes away goes to inn\archive\quick-notes-removed.md first.
//   - No service, no internet, nothing runs in the background. Off = Bob doesn't see the tool at all.
import fs from 'node:fs';
import path from 'node:path';

export const notesOn = (cfg) => cfg?.quickNotes === true;
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

export function addNote(cfg, text, { now = new Date() } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);
  if (!clean) throw new Error('There was nothing to note down.');
  const file = ensureNotesFile(cfg);
  const before = fs.readFileSync(file, 'utf8');
  fs.appendFileSync(file, `${before.endsWith('\n') ? '' : '\n'}- ${stamp(cfg, now)} · ${clean}\n`);
  return loadNotes(cfg).length;
}

const terms = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
export function findNotes(cfg, q) {
  const ts = terms(q);
  return loadNotes(cfg).filter((x) => ts.every((w) => x.text.toLowerCase().includes(w)));
}

// Takes note n out of the file, after copying it to the removed-notes file. `check` must be part of its words, so a
// list that changed since Bob last read it can't take the wrong note.
export function removeNote(cfg, n, check = '', { now = new Date() } = {}) {
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
  fs.writeFileSync(notesFile(cfg), kept.join('\n'));
  return hit;
}

const listed = (xs) => xs.map((x) => `${x.n}. ${x.text}`).join('\n');

export function notesTool(brain) {
  const cfg = brain.cfg;
  return {
    schema: fn('take_note', 'Quick notes: add one the moment {{USER}} says "note", "jot down" or "write down", in their words, without asking. Also list, find (by word or #tag) or remove.', {
      action: str('add, list, find or remove', { enum: ['add', 'list', 'find', 'remove'] }),
      text: str('add: the note in {{USER}}\'s words (keep #tags). find: words or a #tag. remove: a few words of the note.'),
      number: { type: 'integer', description: 'remove: its number from list or find.' }
    }, ['action']),
    async run({ action, text, number }) {
      if (!notesOn(cfg)) return 'Quick notes are off. They\'re in Settings, How Bob works: "Let Bob take quick notes".';
      if (action === 'add') { const n = addNote(cfg, text); return `Noted (note ${n}).`; }
      if (action === 'find') { const xs = findNotes(cfg, text); return xs.length ? listed(xs.slice(-30)) : `No notes have "${text}" in them.`; }
      if (action === 'remove') { const x = removeNote(cfg, number, text); return `Took note ${x.n} away ("${x.text}"). It's kept in the removed-notes file, in case.`; }
      const all = loadNotes(cfg);
      return all.length ? `${all.length} notes, newest last:\n${listed(all.slice(-20))}` : 'No notes yet.';
    },
    summary: ({ action, text, number }) => action === 'add' ? `note: ${String(text || '').slice(0, 80)}` : action === 'remove' ? `take away note ${number}` : action === 'find' ? `find notes: ${text}` : 'list notes'
  };
}
