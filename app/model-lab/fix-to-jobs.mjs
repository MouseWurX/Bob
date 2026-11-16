// Fix list -> jobs (16 Nov 2026; the owner chose "Yes, as real jobs": the lessons Opus marked fix or repair are done
// again for real through do-jobs, not rewritten by the old lesson writer, which made up web results). Each to-fix row
// ({ id, set, family, source, line, faults }) points at a lesson; only that lesson's first request is kept. Its old
// answer, tool results and Opus's note are never copied, so nothing of the faulty lesson steers the new run.
//
// node fix-to-jobs.mjs --fix <to-fix.jsonl>[,<more>] --root <folder the sources are relative to> --to <jobs.jsonl>
//      [--private <words file>] [--home <folder> --user <name>] (the last two for tests: the Lab PC's own by default)
// --private: a file on the Lab PC (never in the repository), one word or name per line; a request holding any of them
// is left out (only the count is printed, never the words). The Lab PC's home folder and user name become C:\Users\you
// and "you" in every request (bob-kit neutralizer), and a request with a picture in it is left out (no picture here).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { opts, readJsonl } from './common.mjs';
import { neutralizer } from './bob-kit.mjs';

const o = opts({});
const fail = (why) => { console.log(`FAIL: ${why}`); process.exit(1); };
const lists = String(o.fix || '').split(',').map((x) => x.trim()).filter(Boolean);
if (!lists.length) fail('--fix <to-fix.jsonl> is needed');
for (const f of lists) if (!fs.existsSync(f)) fail(`no fix list ${f}`);
if (!o.root || !fs.existsSync(String(o.root))) fail('--root <folder the sources are relative to> is needed');
if (!o.to) fail('--to <jobs.jsonl> is needed');
const root = String(o.root);
const neutral = neutralizer({ ...(o.home ? { home: String(o.home) } : {}), ...(o.user ? { user: String(o.user) } : {}) });
let privateWords = [];
if (o.private) {
  if (!fs.existsSync(String(o.private))) fail(`no --private file ${o.private}`);
  privateWords = fs.readFileSync(String(o.private), 'utf8').replace(/\r\n?/g, '\n').split('\n').map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 3);
}
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const privateRx = privateWords.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${privateWords.map(esc).join('|')})`, 'iu') : null;

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

const tally = { rows: 0, written: 0, missing: 0, empty: 0, picture: 0, private: 0, same: 0 };
const seen = new Set(), out = [];
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
for (const f of lists) for (const r of readJsonl(f)) {
  tally.rows++;
  const got = lessonAt(String(r.source || ''), r.line);
  if (!got.item) { tally.missing++; continue; }
  const q = requestOf(got.item);
  if (q.picture) { tally.picture++; continue; }
  const text = neutral(String(q.text || '').trim());
  if (!text) { tally.empty++; continue; }
  if (privateRx && privateRx.test(text)) { tally.private++; continue; }
  if (seen.has(norm(text))) { tally.same++; continue; }
  seen.add(norm(text));
  const job = String(r.set || '').replace(/^bench__/, '').split('__')[0].replace(/^lessons-/, '') || 'fix';
  out.push({ id: `fx-${crypto.createHash('md5').update(String(r.id || `${r.source}#${r.line}`)).digest('hex').slice(0, 10)}`, job, text, from: { id: neutral(String(r.id || '')), family: r.family || '', verdict: r.verdict || '', faults: r.faults || '' } });
}
fs.mkdirSync(path.dirname(path.resolve(String(o.to))), { recursive: true });
fs.writeFileSync(String(o.to), out.map((x) => JSON.stringify(x)).join('\n') + (out.length ? '\n' : ''));
tally.written = out.length;
console.log(`${tally.rows} to-fix rows: ${tally.written} jobs written to ${o.to}. Left out: ${tally.missing} lesson not found, ${tally.empty} no request, ${tally.picture} with a picture, ${tally.private} holding a private word, ${tally.same} the same request again.`);
