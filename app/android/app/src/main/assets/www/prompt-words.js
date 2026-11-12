// Made by android/tools/make-shared.mjs from public/prompt-words.js. Don't edit.
(function () {
// Saved prompts: the words part, shared by Bob's window and Bob for Android (android/tools/make-shared.mjs copies
// this file word for word into the phone app as a plain script, so it must never import anything).
//
// A saved prompt is { id, name, text }. In the message box, "/" at the start of a line opens the menu; what follows
// the "/" narrows it down. Picking one puts its words in the box, never sends them.
// Blanks are words in curly brackets, like {file} or {who}. A few fill themselves in: {date}, {time} and {day}.
// The rest are selected one at a time so typing replaces them; Tab goes to the next blank.

const MAX_PROMPTS = 200;
const MAX_NAME = 60;
const MAX_TEXT = 8000;

// Blanks Bob fills in himself, from this device's clock.
const AUTO_BLANKS = ['date', 'time', 'day'];

// A few to start with, offered on an empty list (never added without a click).
const STARTERS = [
  { name: 'Sum it up', text: 'Sum up {file} in five short points.' },
  { name: 'Explain simply', text: 'Explain {topic} in plain words, as if I\'m new to it.' },
  { name: 'Check my writing', text: 'Fix the spelling and grammar in this, and keep my wording:\n\n{text}' },
  { name: 'Plan my day', text: 'It\'s {day} {date}. Help me plan the rest of today around: {tasks}' }
];

const BLANK = /\{([A-Za-z][\w -]{0,30})\}/g;

const oneLine = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// A prompt as it may be saved, or null when it has no words.
function cleanPrompt(p) {
  if (!p || typeof p !== 'object') return null;
  const text = String(p.text ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, MAX_TEXT);
  if (!text) return null;
  const name = oneLine(p.name, MAX_NAME) || oneLine(text, 40);
  const id = /^[\w-]{1,40}$/.test(String(p.id || '')) ? String(p.id) : '';
  return { id, name, text };
}

// A new id that isn't taken yet.
function newId(list = [], now = Date.now(), rand = Math.random) {
  const taken = new Set(list.map((p) => p.id));
  let id;
  do id = 'p' + now.toString(36) + Math.floor(rand() * 1296).toString(36).padStart(2, '0'); while (taken.has(id));
  return id;
}

// Adds a prompt, or changes the one with the same id. Returns the new list, or { error }.
function savePrompt(list, p, opts = {}) {
  const c = cleanPrompt(p);
  if (!c) return { error: 'A prompt needs some words.' };
  const out = (Array.isArray(list) ? list : []).slice();
  const i = c.id ? out.findIndex((x) => x.id === c.id) : -1;
  if (i >= 0) { out[i] = c; return { list: out, prompt: c }; }
  if (out.length >= MAX_PROMPTS) return { error: `That's ${MAX_PROMPTS} prompts already. Delete one first.` };
  c.id = newId(out, opts.now, opts.rand);
  out.push(c);
  return { list: out, prompt: c };
}

const deletePrompt = (list, id) => (Array.isArray(list) ? list : []).filter((p) => p.id !== id);

// Moves a prompt up (-1) or down (+1) the list.
function movePrompt(list, id, by) {
  const out = (Array.isArray(list) ? list : []).slice();
  const i = out.findIndex((p) => p.id === id), j = i + (by < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// A whole list read from disk or storage: bad entries dropped, ids made unique.
function cleanList(raw) {
  const out = [], seen = new Set();
  for (const p of Array.isArray(raw) ? raw : []) {
    const c = cleanPrompt(p);
    if (!c) continue;
    if (!c.id || seen.has(c.id)) c.id = newId(out, Date.now() + out.length);
    seen.add(c.id);
    out.push(c);
    if (out.length >= MAX_PROMPTS) break;
  }
  return out;
}

// The "/" being typed: { query, start, end } when the caret sits in "/words" at the start of a line, else null.
// start..end is the part that a picked prompt replaces (the "/" and what follows it, up to the caret).
function slashQuery(value, caret = String(value ?? '').length) {
  const v = String(value ?? '');
  const lineStart = v.lastIndexOf('\n', caret - 1) + 1;
  const before = v.slice(lineStart, caret);
  const m = /^\/([^\s/][^\n]{0,59})?$/.exec(before);
  if (!m) return null;
  return { query: m[1] || '', start: lineStart, end: caret };
}

// The prompts that fit what's typed after "/": names that start with it first, then names with a word that
// starts with it, then names or words that hold it anywhere.
function matchPrompts(list, query = '', max = 8) {
  const q = String(query).toLowerCase().trim();
  const all = Array.isArray(list) ? list : [];
  if (!q) return all.slice(0, max);
  const scored = [];
  all.forEach((p, i) => {
    const name = p.name.toLowerCase(), text = p.text.toLowerCase();
    const score = name.startsWith(q) ? 0 : name.split(/\W+/).some((w) => w.startsWith(q)) ? 1 : name.includes(q) ? 2 : text.includes(q) ? 3 : -1;
    if (score >= 0) scored.push([score, i, p]);
  });
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, max).map((s) => s[2]);
}

// The blanks a prompt has, in order, each once: ['file', 'who'] (auto blanks left out).
function blanksOf(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(BLANK)) {
    const k = m[1].trim();
    if (!AUTO_BLANKS.includes(k.toLowerCase()) && !out.includes(k)) out.push(k);
  }
  return out;
}

// The prompt's words with {date}, {time} and {day} filled in from `now` (this device's clock and language).
function fillAuto(text, now = new Date(), locale = undefined) {
  const fmt = (o) => { try { return now.toLocaleString(locale, o); } catch { return now.toLocaleString('en', o); } };
  const vals = {
    date: fmt({ year: 'numeric', month: 'long', day: 'numeric' }),
    time: fmt({ hour: 'numeric', minute: '2-digit' }),
    day: fmt({ weekday: 'long' })
  };
  return String(text ?? '').replace(BLANK, (all, k) => vals[k.trim().toLowerCase()] ?? all);
}

// The next blank at or after `from` (wrapping round to the start): { start, end, name }, or null when none is left.
function nextBlank(value, from = 0) {
  const all = [...String(value ?? '').matchAll(BLANK)]
    .map((m) => ({ start: m.index, end: m.index + m[0].length, name: m[1].trim() }))
    .filter((b) => !AUTO_BLANKS.includes(b.name.toLowerCase()));
  return all.find((b) => b.start >= from) || all[0] || null;
}

// Puts a picked prompt in the box: the "/query" goes, the prompt's words (auto blanks filled) go in its place.
// Returns { value, select: [start, end] } where select is the first blank to type over (or the end of the words).
function insertPrompt(value, q, prompt, now = new Date(), locale = undefined) {
  const v = String(value ?? '');
  const words = fillAuto(prompt.text, now, locale);
  const before = v.slice(0, q.start), after = v.slice(q.end);
  const out = before + words + after;
  const b = nextBlank(out, before.length);
  const inWords = b && b.start >= before.length && b.end <= before.length + words.length;
  return { value: out, select: inWords ? [b.start, b.end] : [before.length + words.length, before.length + words.length], blank: inWords ? b.name : '' };
}

// Is this blank asking for a file? ({file}, {document}, {path}, {picture} and the like.)
const isFileBlank = (name) => /^(file|files|document|doc|path|picture|photo|image|spreadsheet|pdf)( ?name)?$/i.test(String(name || '').trim());

globalThis.BobPrompts = { MAX_PROMPTS, MAX_NAME, MAX_TEXT, AUTO_BLANKS, STARTERS, cleanPrompt, newId, savePrompt, deletePrompt, movePrompt, cleanList, slashQuery, matchPrompts, blanksOf, fillAuto, nextBlank, insertPrompt, isFileBlank };
})();
