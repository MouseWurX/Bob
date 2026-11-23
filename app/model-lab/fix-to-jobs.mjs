// Fix list -> jobs (16 Nov 2026; the owner chose "Yes, as real jobs": the lessons Opus marked fix or repair are done
// again for real through do-jobs, not rewritten by the old lesson writer, which made up web results). Each to-fix row
// ({ id, set, family, source, line, faults }) points at a lesson; only that lesson's first request is kept. Its old
// answer, tool results and Opus's note are never copied, so nothing of the faulty lesson steers the new run.
//
// node fix-to-jobs.mjs --fix <to-fix.jsonl>[,<more>] --root <folder the sources are relative to> --to <jobs.jsonl>
//      [--skip <jobs.jsonl>[,<more>]] [--private <words file>] [--home <folder> --user <name> --host <name>] (the last three for tests)
// Private words: <install>/bob-model-lab/private-words.txt (scrub-data's list: "word", "word => stand-in", "keep: word")
// and --private, both on the Lab PC only, never in the repository. A request holding one of them, the Lab PC's user name
// or its name is left out (only the count is printed, never the words). The Lab PC's home folder becomes C:\Users\you
// (bob-kit neutralizer); e-mail addresses, home-network addresses, other people's folders and keys get scrub-data's
// stand-ins. A request with a picture in it is left out (no picture here). --skip: requests already in those job files
// (run 3's own list) are not repeated. 16 Nov: the jobs come out mixed, one of each kind in turn, so a run that stops
// early (its hours or its search budget) has still done some of every kind.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { opts, readJsonl, AGENT } from './common.mjs';
import { neutralizer } from './bob-kit.mjs';
import { scrubber, scrubValue, findLeaks, privateWordsFrom, splitKeep } from './scrub-data.mjs';

const o = opts({});
const fail = (why) => { console.log(`FAIL: ${why}`); process.exit(1); };
const lists = String(o.fix || '').split(',').map((x) => x.trim()).filter(Boolean);
if (!lists.length) fail('--fix <to-fix.jsonl> is needed');
for (const f of lists) if (!fs.existsSync(f)) fail(`no fix list ${f}`);
if (!o.root || !fs.existsSync(String(o.root))) fail('--root <folder the sources are relative to> is needed');
if (!o.to) fail('--to <jobs.jsonl> is needed');
const root = String(o.root);
const neutral = neutralizer({ ...(o.home ? { home: String(o.home) } : {}), ...(o.user ? { user: String(o.user) } : {}) });
if (o.private && !fs.existsSync(String(o.private))) fail(`no --private file ${o.private}`);
const own = { user: typeof o.user === 'string' ? o.user : (() => { try { return os.userInfo().username; } catch { return ''; } })(), host: typeof o.host === 'string' ? o.host : os.hostname() };
const words = splitKeep(privateWordsFrom({ wordsFile: o.private ? String(o.private) : '', agentDir: o.home ? '' : AGENT })); // a test (--home) never reads the Lab PC's list
const stand = scrubber({ ...own, ...words }); // every rule, for the stand-ins
const mine = scrubber({ ...own, ...words }); mine.rules = mine.rules.filter((r) => ['the user name', 'the PC name', 'private words'].includes(r.what));
const isMine = (t) => findLeaks(t, mine).length > 0;
const skipText = new Set();
for (const f of String(o.skip || '').split(',').map((x) => x.trim()).filter(Boolean)) { if (!fs.existsSync(f)) fail(`no --skip file ${f}`); for (const r of readJsonl(f)) if (typeof r?.text === 'string') skipText.add(r.text.toLowerCase().replace(/\s+/g, ' ').trim()); }

const lines = new Map(); // source file -> its lines (read once)
const lessonAt = (src, n) => {
  const f = path.resolve(root, src);
  if (!lines.has(f)) lines.set(f, fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n') : null);
  const all = lines.get(f);
  if (!all) return { why: 'source file missing' };
  const l = all[Number(n) - 1];
  if (!l || !l.trim()) return { why: 'no such line' };
  try { return { item: JSON.parse(l) }; } catch { return { why: 'line is not JSON' }; }
};
const requestOf = (item) => {
  const u = (Array.isArray(item?.messages) ? item.messages : []).find((m) => m && m.role === 'user');
  const c = u ? u.content : item?.text ?? item?.ask ?? item?.question ?? item?.prompt;
  if (typeof c === 'string') return { text: c };
  if (Array.isArray(c)) {
    if (c.some((p) => p && /image/.test(String(p.type || '')))) return { picture: true };
    return { text: c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('\n') };
  }
  return { text: '' };
};

const tally = { rows: 0, written: 0, missing: 0, empty: 0, picture: 0, private: 0, same: 0, skipped: 0, standins: 0 };
const seen = new Set(), out = [];
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
for (const f of lists) for (const r of readJsonl(f)) {
  tally.rows++;
  const got = lessonAt(String(r.source || ''), r.line);
  if (!got.item) { tally.missing++; continue; }
  const q = requestOf(got.item);
  if (q.picture) { tally.picture++; continue; }
  const plain = neutral(String(q.text || '').trim());
  if (!plain) { tally.empty++; continue; }
  if (isMine(plain)) { tally.private++; continue; }
  const text = scrubValue(plain, stand);
  if (text !== plain) tally.standins++;
  if (skipText.has(norm(text)) || skipText.has(norm(plain))) { tally.skipped++; continue; }
  if (seen.has(norm(text))) { tally.same++; continue; }
  seen.add(norm(text));
  const job = String(r.set || '').replace(/^bench__/, '').split('__')[0].replace(/^lessons-/, '') || 'fix';
  out.push({ id: `fx-${crypto.createHash('md5').update(String(r.id || `${r.source}#${r.line}`)).digest('hex').slice(0, 10)}`, job, text, from: { id: neutral(String(r.id || '')), family: r.family || '', verdict: r.verdict || '', faults: r.faults || '' } });
}
// one of each kind in turn (kinds in the order first met), each kind keeping its own order
const kinds = new Map(); for (const x of out) { if (!kinds.has(x.job)) kinds.set(x.job, []); kinds.get(x.job).push(x); }
const mixed = []; for (let i = 0; mixed.length < out.length; i++) for (const list of kinds.values()) if (i < list.length) mixed.push(list[i]);
fs.mkdirSync(path.dirname(path.resolve(String(o.to))), { recursive: true });
fs.writeFileSync(String(o.to), mixed.map((x) => JSON.stringify(x)).join('\n') + (mixed.length ? '\n' : ''));
tally.written = mixed.length;
console.log(`${tally.rows} to-fix rows: ${tally.written} jobs written to ${o.to} (${kinds.size} kinds, mixed). Left out: ${tally.missing} lesson not found, ${tally.empty} no request, ${tally.picture} with a picture, ${tally.private} holding something private of this PC's, ${tally.skipped} already in --skip, ${tally.same} the same request again. ${tally.standins} got stand-ins (e-mail addresses, addresses, folders). Private words in use: ${words.words.length}.`);
