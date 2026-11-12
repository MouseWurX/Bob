// ✏️ "Let Bob check spelling" (Settings, How Bob works, 🧰 More tools; off by default). Offline.
// check_spelling reads a document Bob wrote (or any text file, or text in the chat) and lists words that aren't in
// an English word list, with suggestions, plus a few plain grammar slips: a word twice ("the the"), "a" or "an" in
// the wrong place, "could of", a sentence that starts small, a lone "i", a missing space after a comma. It never
// changes the file: Bob shows what it found, and fixes it with edit_file only if you ask.
// The word list (274,000 English words, British and American spellings, MIT licence) comes once from the npm
// registry when the user presses Get the word list (about 1 MB, sha256-checked) and is kept in Bob's engine folder.
// Names, words with capitals or digits, web addresses, e-mail addresses and code-like words are left alone.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { untgz } from './tgz.js';
import { isDoc, docText } from './doc-text.js';
import { insideAny } from './config.js';
import { isSensitive } from './tools.js';

export const WORD_LIST = {
  version: '4.1.0',
  url: 'https://registry.npmjs.org/word-list/-/word-list-4.1.0.tgz',
  sha256: 'c0cd6e2a112392204960e9998d79347a8ae1571dab5e3fdbfa685ef5977faedb',
  license: 'MIT'
};
export const MAX_TEXT = 2_000_000;
const MAX_ISSUES = 80;
export const wordListFile = (cfg) => path.join(cfg.agentDir, `word-list-${WORD_LIST.version}`, 'words.txt');
export const hasWordList = (cfg) => Boolean(cfg?.agentDir) && fs.existsSync(wordListFile(cfg));

export async function getWordList(cfg, { fetchImpl = fetch, signal } = {}) {
  if (hasWordList(cfg)) return wordListFile(cfg);
  const res = await fetchImpl(WORD_LIST.url, { signal, headers: { 'user-agent': 'Bob' } });
  if (!res.ok) throw new Error(`The word list download failed (${res.status}). Press Get the word list again.`);
  if (res.url && new URL(res.url).hostname !== 'registry.npmjs.org') throw new Error('The word list download was sent somewhere I don\'t trust. Stopped.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 20 * 1024 * 1024) throw new Error('The word list download is far bigger than it should be. Stopped.');
  if (crypto.createHash('sha256').update(buf).digest('hex') !== WORD_LIST.sha256) throw new Error('The word list came through damaged (checksum didn\'t match). Press Get the word list again.');
  const files = untgz(buf, new Set(['words.txt', 'license']));
  if (!files.get('words.txt')) throw new Error('The word list download had no words in it.');
  const dir = path.dirname(wordListFile(cfg));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'LICENSE.txt'), files.get('license') || 'MIT, word-list by Sindre Sorhus');
  fs.writeFileSync(wordListFile(cfg), files.get('words.txt'));
  dict = null;
  return wordListFile(cfg);
}

let dict = null, dictFile = '';
export function loadWords(cfg, read = (f) => fs.readFileSync(f, 'utf8')) {
  const f = wordListFile(cfg);
  if (dict && dictFile === f) return dict;
  dict = new Set(read(f).replace(/\r/g, '').split('\n').map((w) => w.trim().toLowerCase()).filter(Boolean));
  for (const w of SMALL) dict.add(w);
  dictFile = f;
  return dict;
}
// One-letter words and everyday short forms the list leaves out.
const SMALL = ['a', 'i', 'o', 'ok', 'okay', 'tv', 'pc', 'id', 'vs', 'etc', 'eg', 'ie', 'am', 'pm', 'email', 'emails', 'online', 'offline', 'website', 'websites', 'login', 'app', 'apps', 'wifi', 'smartphone', 'laptop', 'laptops', 'username', 'password', 'passwords', 'setup', 'checkbox', 'dropdown', 'toolbar', 'popup', 'blog', 'blogs', 'podcast', 'podcasts', 'selfie', 'emoji', 'emojis', 'hashtag', 'download', 'downloads', 'upload', 'uploads', 'inbox', 'chatbot', 'ebook', 'ebooks'];
const CONTRACTED = new Set(["won't", "can't", "shan't", "ain't", "y'all", "o'clock", "ma'am", "let's"]);

// Edits one letter away (delete, swap, change, add), only those in the list. Same first letter first.
export function suggest(word, words, max = 3) {
  const w = word.toLowerCase(), abc = 'abcdefghijklmnopqrstuvwxyz', out = new Set();
  for (let i = 0; i <= w.length; i++) {
    if (i < w.length) out.add(w.slice(0, i) + w.slice(i + 1));
    if (i < w.length - 1) out.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
    for (const c of abc) { if (i < w.length) out.add(w.slice(0, i) + c + w.slice(i + 1)); out.add(w.slice(0, i) + c + w.slice(i)); }
  }
  const hits = [...out].filter((x) => x !== w && words.has(x));
  return hits.sort((a, b) => (b[0] === w[0]) - (a[0] === w[0]) || Math.abs(a.length - w.length) - Math.abs(b.length - w.length)).slice(0, max);
}

const VOWEL_SOUND_EXCEPT = /^(uni|use|usu|uti|eu|ewe|one|once|ubiq|ufo|uk\b|us\b)/i; // "a university", "a one-off"
const SILENT_H = /^(hour|honest|honou?r|heir|herb)/i; // "an hour" (herb: American)
export function grammarIssues(line) {
  const out = [];
  const say = (at, what, fix) => out.push({ at, what, fix });
  for (const m of line.matchAll(/\b(\w+)\s+\1\b/gi)) if (!/^(that|had|is|do|bye|no|yes|ha|very|so|knock|tut|bla|blah|chop|cha|ding|dong)$/i.test(m[1])) say(m.index, `"${m[0]}": the same word twice`, m[1]);
  for (const m of line.matchAll(/\b(a|an)\s+([a-z][\w'-]*)/gi)) {
    const art = m[1].toLowerCase(), next = m[2];
    if (/^\d/.test(next) || next.length < 2 || /^[A-Z]{2,}$/.test(next)) continue;
    const vowel = (/^[aeiou]/i.test(next) && !VOWEL_SOUND_EXCEPT.test(next)) || SILENT_H.test(next);
    if (art === 'a' && vowel) say(m.index, `"${m[0]}": "an" goes before a vowel sound`, `an ${next}`);
    if (art === 'an' && !vowel) say(m.index, `"${m[0]}": "a" goes before a consonant sound`, `a ${next}`);
  }
  for (const m of line.matchAll(/\b(could|would|should|must|might)\s+of\b/gi)) say(m.index, `"${m[0]}": should be "${m[1]} have"`, `${m[1]} have`);
  for (const m of line.matchAll(/\balot\b/gi)) say(m.index, '"alot" is two words', 'a lot');
  for (const m of line.matchAll(/(^|[^\w'])i(?=[\s,.!?;:]|'m|'ll|'ve|'d)/g)) say(m.index + m[1].length, 'a lone "i" is a capital I', 'I');
  for (const m of line.matchAll(/[.!?]\s+([a-z])\w*/g)) if (!/(e\.g|i\.e|etc|vs|approx|incl|no)\.\s+$/i.test(line.slice(Math.max(0, m.index - 6), m.index + 2))) say(m.index + m[0].indexOf(m[1]), 'a sentence starts with a small letter', m[1].toUpperCase());
  for (const m of line.matchAll(/[a-z],(?=[a-z])/gi)) say(m.index + 1, 'no space after a comma', ', ');
  for (const m of line.matchAll(/\S {2,}(?=\S)/g)) say(m.index + 1, 'two spaces between words', ' ');
  return out;
}

// Code, addresses, names and numbers are skipped; the rest is looked up.
export function checkText(text, words, { allow = [] } = {}) {
  const ok = new Set(allow.map((w) => String(w).toLowerCase()));
  const issues = [];
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let inCode = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { inCode = !inCode; return; }
    if (inCode || issues.length >= MAX_ISSUES) return;
    const plain = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length)).replace(/\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\w+/g, (m) => ' '.repeat(m.length));
    if (words) {
      for (const m of plain.matchAll(/[A-Za-z][A-Za-z'’-]*[A-Za-z]|\b[A-Za-z]\b/g)) {
        let w = m[0].replace(/’/g, "'");
        if (/[A-Z]/.test(w.slice(1)) || /[_\d]/.test(w)) continue; // camelCase, ALLCAPS, code
        if (/^[A-Z]/.test(w) && !/(^|[.!?]\s+)$/.test(plain.slice(0, m.index).replace(/^\s*[-*#>\d.]+\s*/, ''))) continue; // a name mid-sentence
        const low = w.toLowerCase();
        if (ok.has(low) || CONTRACTED.has(low)) continue;
        const parts = low.includes('-') ? low.split('-') : [low];
        const bad = parts.filter((p) => {
          const base = p.replace(/'(s|d|m|ll|re|ve)$/, '').replace(/n't$/, '');
          return base && !words.has(base) && !words.has(p.replace(/'/g, '')) && !ok.has(base);
        });
        for (const b of bad) issues.push({ line: i + 1, word: b, what: `"${b}" isn't in the word list`, fix: suggest(b.replace(/'.*$/, ''), words).join(', ') });
      }
    }
    for (const g of grammarIssues(plain)) issues.push({ line: i + 1, word: '', what: g.what, fix: g.fix });
  });
  return issues.slice(0, MAX_ISSUES);
}

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export function spellTool(cfg, on = () => true) {
  return {
    schema: fn('check_spelling', 'Check spelling and simple grammar in a document or text, offline. Lists what it finds; it doesn\'t change anything.', {
      file: { type: 'string', description: 'Full path to a text, Markdown, Word, OpenDocument, RTF or PDF file. Or give text.' },
      text: { type: 'string', description: 'Or: the words to check.' },
      allow: { type: 'array', items: { type: 'string' }, description: 'Optional: words that are right (names, made-up words).' }
    }, []),
    async run({ file, text, allow }) {
      if (!on()) return 'Checking spelling is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob check spelling".';
      let words = null;
      if (hasWordList(cfg)) words = loadWords(cfg);
      let body = text;
      if (file) {
        const f = path.resolve(String(file));
        if (!path.isAbsolute(String(file))) return 'Give the full path to the file.';
        if (!insideAny(cfg.readRoots || [], f)) return `I'm not allowed to read ${f}.`;
        if (isSensitive(cfg, f)) return 'That file holds keys or passwords, so it stays off-limits to me.';
        body = isDoc(f) ? docText(f) : fs.readFileSync(f, 'utf8');
      }
      if (!body || !String(body).trim()) return 'There were no words to check.';
      const issues = checkText(String(body).slice(0, MAX_TEXT), words, { allow: Array.isArray(allow) ? allow : [] });
      const head = words ? '' : 'The word list isn\'t here yet (Settings, How Bob works, 🧰 More tools: Get the word list), so only grammar was checked.\n';
      if (!issues.length) return `${head}No slips found${words ? '' : ' in the grammar'}.`;
      return `${head}${issues.length}${issues.length >= MAX_ISSUES ? '+' : ''} thing${issues.length === 1 ? '' : 's'} to look at:\n${issues.map((x) => `line ${x.line}: ${x.what}${x.fix ? ` (maybe: ${x.fix})` : ''}`).join('\n')}\nA word that's a name or a term the user uses may be right. Change the file only if the user asks.`;
    },
    summary: ({ file }) => `spelling: ${file ? path.basename(String(file)) : 'text'}`
  };
}
