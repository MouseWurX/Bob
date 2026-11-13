// The privacy scrub for anything that leaves the PC (Hugging Face, a release zip, a shared folder): it swaps the
// owner's details for stand-ins, then checks the result again and refuses (exit 2) when anything is left.
// 12 Nov: the first public lesson scrub only caught the user name inside "C:\Users\<name>", so the bare name in folder
// listings ("Users\n<name>\nDesktop") and file names got through, and in saved odds a name came out split over two
// tokens. This catches all three:
// - the user name and any private word anywhere (case does not matter), with JSON escapes like \n read as gaps;
// - the PC's name in host places (\\pc\, pc.local, pc:7777, //pc/, @pc); a long PC name anywhere;
// - any Users\<someone> or /home/<someone> folder, LAN and Tailscale addresses, e-mail addresses, keys and tokens;
// - names spread over odds tokens: the tokens are joined, the hit is put back as the stand-in, and the other choices
//   at those steps are dropped (they can hold the rest of the name).
// Private words come from --words / --words-file (one per line, "word => stand-in" to pick the stand-in, "keep: word"
// for an ordinary word that holds a private one and must stay) and from
// <install>/bob-model-lab/private-words.txt when it exists. They are never written into the repository.
//
// node scrub-data.mjs --in <folder> --out <new folder>    scrub a copy, then check it (the --in folder is never changed)
// node scrub-data.mjs --in <folder> --check               check only
//      [--user <name>] [--host <name>] (default: this computer's) [--words "a,b"] [--words-file <file>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Before a word: the start, anything not a letter or digit, or a JSON escape (\n, \t, \r) written out as text.
const START = '(?<=^|[^A-Za-z0-9]|\\\\[ntr])', END = '(?=$|[^A-Za-z0-9])';
const LAN = [192, 168].join('\\.'), LAN_TO = [192, 168, 0, 10].join('.'); // in pieces, so the repo's own address check skips them
const MAIL_TO = ['you', 'example.com'].join('@');

// The rules, in order. `terms` = [{ word, to, host? }].
export function scrubber({ user = '', host = '', words = [], keep = [] } = {}) {
  const rules = [];
  const add = (re, to, what) => rules.push({ re, to, what });
  // any user folder, whoever's: Users\x, Users/x, /home/x (not the stand-ins themselves)
  // 12 Nov (later): "users\\n- …" or a listing "Users\\n13. Windows" is a written-out line break after the word, not a folder;
// a "name" that is just the escape letter (n, t, r) followed by a non-letter is never taken as someone's folder
const notStandIn = '(?![ntr]?(?:you|Public|Default|runner|user)\\b)(?![ntr](?:[^A-Za-z]|$))([^\\\\/\\s"\'`<>|:*?\\n]+)';
  add(new RegExp(`((?:^|[^A-Za-z])Users(?:\\\\\\\\|\\\\|/)+)${notStandIn}`, 'gi'), '$1you', 'user folders');
  add(new RegExp(`(/home/+)${notStandIn}`, 'g'), '$1you', 'user folders');
  const terms = [];
  if (user && user.length > 1) terms.push({ word: user, to: 'you', what: 'the user name' });
  for (const w of words) {
    const [word, to] = String(w).split('=>').map((x) => x.trim());
    if (word && word.length > 1) terms.push({ word, to: to || 'private', what: 'private words' });
  }
  // longest first, so "name-drive" goes before "name"
  for (const t of terms.sort((a, b) => b.word.length - a.word.length)) {
    // four letters or more: anywhere, even inside a longer word; shorter: only as a word of its own
    // ...except inside the ordinary words given as `keep` ("hinged" for a user called "hinge")
    const spare = keep.filter((k) => k.toLowerCase().includes(t.word.toLowerCase())).map((k) => {
      const i = k.toLowerCase().indexOf(t.word.toLowerCase()), pre = k.slice(0, i), post = k.slice(i + t.word.length);
      return `${pre ? `(?<!${esc(pre)})` : ''}${esc(t.word)}${post ? `(?!${esc(post)})` : ''}`;
    });
    const core = spare.length ? `(?:${spare.join('|')})` : esc(t.word);
    add(new RegExp(t.word.length >= 4 ? core : `${START}${core}${END}`, 'gi'), t.to, t.what);
  }
  if (host && host.length > 1) {
    const h = esc(host);
    add(new RegExp(`(\\\\\\\\|//|@)${h}(?=$|[^A-Za-z0-9-])`, 'gi'), '$1my-pc', 'the PC name');
    add(new RegExp(`${START}${h}(?=\\.(?:local|lan|home|[\\w-]+\\.ts\\.net)\\b|:\\d)`, 'gi'), 'my-pc', 'the PC name');
    if (host.length >= 6) add(new RegExp(esc(host), 'gi'), 'my-pc', 'the PC name');
  }
  add(new RegExp(`\\b${LAN}\\.\\d{1,3}\\.\\d{1,3}\\b`, 'g'), LAN_TO, 'home-network addresses');
  add(/\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/g, '100.64.0.1', 'Tailscale addresses');
  add(/\b[\w.+-]+@[\w-]+\.[a-z][\w.-]*\b/gi, (m) => (m === MAIL_TO ? m : MAIL_TO), 'e-mail addresses');
  add(/\b(?:sk|hf|ghp|gho|github_pat|xox[abp]|AKIA|AIza|rpa)_?[A-Za-z0-9_-]{16,}\b/g, '[key removed]', 'keys and tokens');
  const words4 = terms.filter((t) => t.word.length >= 4 && !keep.some((k) => k.toLowerCase().includes(t.word.toLowerCase()))).map((t) => t.word.toLowerCase());
  return { rules, words4, counts: {} };
}

function scrubText(s, sc) {
  let t = s;
  for (const r of sc.rules) {
    r.re.lastIndex = 0;
    const n = (t.match(r.re) || []).length;
    if (!n) continue;
        t = t.replace(r.re, r.to);
    sc.counts[r.what] = (sc.counts[r.what] || 0) + n;
  }
  return t;
}

// odds look like [{ t, p, top: [{ t, p }] }] (Bob's) or [{ token, logprob, top_logprobs: [...] }] (the server's)
const isTokens = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && (typeof x.t === 'string' || typeof x.token === 'string'));
const tokOf = (x) => (typeof x.t === 'string' ? 't' : 'token');
const topOf = (x) => (Array.isArray(x.top) ? 'top' : Array.isArray(x.top_logprobs) ? 'top_logprobs' : null);

function scrubTokens(arr, sc) {
  const toks = arr.map((x) => ({ ...x }));
  for (let guard = 0; guard < 1000; guard++) {
    const joined = toks.map((x) => x[tokOf(x)]).join('');
    let hit = null, to = '';
    for (const r of sc.rules) {
      r.re.lastIndex = 0;
      const m = new RegExp(r.re.source, r.re.flags.replace('g', '')).exec(joined);
      if (m && (!hit || m.index < hit.index)) { hit = m; to = m[0].replace(new RegExp(r.re.source, r.re.flags.replace('g', '')), r.to); hit.what = r.what; }
    }
    if (!hit) break;
    const a = hit.index, b = a + hit[0].length;
    let pos = 0, i = -1, j = -1, si = 0;
    toks.forEach((x, k) => { const len = x[tokOf(x)].length; if (i < 0 && a < pos + len) { i = k; si = pos; } if (j < 0 && b <= pos + len) j = k; pos += len; });
    if (i < 0) break;
    if (j < 0) j = toks.length - 1;
    const endJ = toks.slice(0, j + 1).reduce((n, x) => n + x[tokOf(x)].length, 0);
    const before = joined.slice(si, a), after = joined.slice(b, endJ);
    if (to === hit[0]) break; // a stand-in that is already in place
    for (let k = i; k <= j; k++) { toks[k][tokOf(toks[k])] = k === i ? before + to + after : ''; const tp = topOf(toks[k]); if (tp) toks[k][tp] = []; }
    sc.counts[hit.what + ' (spread over odds)'] = (sc.counts[hit.what + ' (spread over odds)'] || 0) + 1;
  }
  return toks.map((x) => scrubValue(x, sc));
}

export function scrubValue(v, sc) {
  if (typeof v === 'string') return scrubText(v, sc);
  if (isTokens(v)) return scrubTokens(v, sc);
  if (Array.isArray(v)) return v.map((x) => scrubValue(x, sc));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [scrubText(k, sc), scrubValue(x, sc)]));
  return v;
}

// What would still be changed, i.e. what is left. Also joins odds tokens and, for words of four letters or more,
// looks through the joined text with every gap and mark taken out. Names are shown masked ("s***a").
const mask = (w) => (w.length <= 2 ? '**' : w[0] + '*'.repeat(w.length - 2) + w.at(-1));
export function findLeaks(v, sc, where = '') {
  const out = [];
  const testText = (s, at) => {
    for (const r of sc.rules) {
      const re = new RegExp(r.re.source, r.re.flags.replace('g', ''));
      const m = re.exec(s);
      if (m && m[0].replace(re, r.to) !== m[0]) out.push(`${at}: ${r.what} (${mask(m[0].trim())})`);
    }
  };
  const walk = (x, at) => {
    if (typeof x === 'string') return testText(x, at);
    if (isTokens(x)) {
      const joined = x.map((t) => t[tokOf(t)]).join('');
      testText(joined, `${at} (odds joined)`);
      const flat = joined.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const w of sc.words4) if (flat.includes(w.replace(/[^a-z0-9]/g, ''))) out.push(`${at} (odds joined, gaps taken out): ${mask(w)}`);
    }
    if (Array.isArray(x)) return x.forEach((y, k) => walk(y, `${at}[${k}]`));
    if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) { testText(k, `${at}.${k} (key)`); walk(y, `${at}.${k}`); }
  };
  walk(v, where);
  return [...new Set(out)];
}

// ---- files ----
const BINARY = /\.(png|jpe?g|webp|gif|ico|gguf|safetensors|bin|zip|gz|tgz|parquet|arrow|mp3|ogg|wav)$/i;
const walkDir = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkDir(path.join(d, e.name)) : [path.join(d, e.name)]));
export function scrubFile(text, name, sc) {
  const t = text.replace(/\r\n/g, '\n');
  if (/\.jsonl$/i.test(name)) return t.split('\n').map((l) => { if (!l.trim()) return l; try { return JSON.stringify(scrubValue(JSON.parse(l), sc)); } catch { return scrubText(l, sc); } }).join('\n');
  if (/\.json$/i.test(name)) { try { return JSON.stringify(scrubValue(JSON.parse(t), sc)); } catch { return scrubText(t, sc); } }
  return scrubText(t, sc);
}
export function leaksInFile(text, name, sc) {
  const t = text.replace(/\r\n/g, '\n');
  const rows = /\.jsonl$/i.test(name) ? t.split('\n').map((l, i) => [l, `${name}:${i + 1}`]) : [[t, name]];
  const out = [];
  for (const [s, at] of rows) {
    if (!s.trim()) continue;
    let v = s; if (/\.jsonl?$/i.test(name)) { try { v = JSON.parse(s); } catch {} }
    out.push(...findLeaks(v, sc, at));
    if (typeof v !== 'string') out.push(...findLeaks(s, sc, `${at} (as written)`));
  }
  return out;
}
// Scrub a folder into a new one, then check the new one. Returns { counts, leaks, files, skipped }.
export function scrubFolder(from, to, sc) {
  if (to) {
    const rf = path.resolve(from), rt = path.resolve(to);
    if (rt === rf || rt.startsWith(rf + path.sep)) throw new Error('the scrubbed copy must be outside the folder it comes from');
  }
  const files = walkDir(from), skipped = [], leaks = [];
  for (const f of files) {
    const rel = path.relative(from, f), relClean = rel.split(path.sep).map((p) => scrubText(p, sc)).join(path.sep);
    if (BINARY.test(f)) { skipped.push(rel); if (to) { fs.mkdirSync(path.dirname(path.join(to, relClean)), { recursive: true }); fs.copyFileSync(f, path.join(to, relClean)); } continue; }
    const text = fs.readFileSync(f, 'utf8');
    if (to) { fs.mkdirSync(path.dirname(path.join(to, relClean)), { recursive: true }); fs.writeFileSync(path.join(to, relClean), scrubFile(text, rel, sc)); }
  }
  const check = to || from, before = { ...sc.counts };
  for (const f of walkDir(check)) {
    const rel = path.relative(check, f);
    leaks.push(...findLeaks(rel.split(path.sep).join('/'), sc, `(file name) ${rel}`));
    if (!BINARY.test(f)) leaks.push(...leaksInFile(fs.readFileSync(f, 'utf8'), rel, sc));
  }
  sc.counts = before;
  return { counts: sc.counts, leaks, files: files.length, skipped };
}

// "keep: word" lines in the words file are ordinary words that hold a private one and must stay ("keep: hinged").
export const splitKeep = (list) => ({ words: list.filter((w) => !/^keep:/i.test(w)), keep: list.filter((w) => /^keep:/i.test(w)).map((w) => w.replace(/^keep:\s*/i, '')) });
export function privateWordsFrom({ words = '', wordsFile = '', agentDir = '' } = {}) {
  const list = String(words || '').split(',').map((w) => w.trim()).filter(Boolean);
  const files = [wordsFile, agentDir && path.join(agentDir, 'bob-model-lab', 'private-words.txt')].filter(Boolean);
  for (const f of files) { try { list.push(...fs.readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean)); } catch {} }
  return list;
}

// ---- command line ----
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { opts, AGENT } = await import('./common.mjs');
  const o = opts({});
  if (!o.in || (!o.out && !o.check)) { console.error('--in <folder> and --out <new folder> (or --check) are needed'); process.exit(1); }
  const sc = scrubber({
    user: typeof o.user === 'string' ? o.user : (() => { try { return os.userInfo().username; } catch { return ''; } })(),
    host: typeof o.host === 'string' ? o.host : os.hostname(),
    ...splitKeep(privateWordsFrom({ words: o.words, wordsFile: o['words-file'], agentDir: AGENT }))
  });
  let r;
  try { r = scrubFolder(String(o.in), o.check ? null : String(o.out), sc); } catch (e) { console.error(e.message); process.exit(1); }
  console.log(`${r.files} files${r.skipped.length ? ` (${r.skipped.length} not text, copied as they are: ${r.skipped.slice(0, 5).join(', ')})` : ''}`);
  for (const [k, v] of Object.entries(r.counts)) console.log(`  changed: ${k} x${v}`);
  if (r.leaks.length) { console.error(`STILL PRIVATE, do not publish (${r.leaks.length}):\n${r.leaks.slice(0, 40).join('\n')}`); process.exit(2); }
  console.log('Checked again: nothing private left.');
}
