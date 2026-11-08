// Apply Thoth's five kept refusals to a lesson set, on the PC, after the teacher run.
// Reads a lessons.jsonl, and for any lesson whose USER prompt or the teacher's ANSWER matches one
// of the five kept categories (kept-refusals.json), replaces the answer with that category's
// in-voice refusal (reasoning dropped, think=false). Everything else passes through untouched.
//
//   node filter-refusals.mjs --in out/lessons-thoth-test/lessons.jsonl --config kept-refusals.json
//     [--out <path>]      default: <in>.filtered.jsonl
//     [--flagged <path>]  default: <in>.flagged.jsonl   (the originals that were swapped, for review)
//
// Broad on purpose: a false positive just turns a harmless lesson into an in-voice "no", which is safe.
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const inPath = arg('in'); if (!inPath) { console.error('need --in <lessons.jsonl>'); process.exit(1); }
const cfgPath = arg('config', new URL('./kept-refusals.json', import.meta.url).pathname);
const outPath = arg('out', inPath.replace(/\.jsonl$/, '') + '.filtered.jsonl');
const flagPath = arg('flagged', inPath.replace(/\.jsonl$/, '') + '.flagged.jsonl');

const cats = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).categories
  .sort((a, b) => a.priority - b.priority)
  .map((c) => ({ ...c, re: c.patterns.map((p) => new RegExp(p, 'i')) }));

const textOf = (m) => Array.isArray(m?.content)
  ? m.content.map((p) => (typeof p === 'string' ? p : p.text || '')).join(' ')
  : String(m?.content || '');

const lines = fs.readFileSync(inPath, 'utf8').split('\n').filter((l) => l.trim());
const out = [], flagged = [], counts = {};
for (const line of lines) {
  const l = JSON.parse(line);
  const user = textOf(l.messages.find((m) => m.role === 'user'));
  const answer = l.messages.filter((m) => m.role === 'assistant').map((m) => textOf(m) + ' ' + (m.reasoning || '')).join(' ');
  const hay = (user + ' ' + answer);
  const hit = cats.find((c) => c.re.some((r) => r.test(hay)));
  if (!hit) { out.push(line); continue; }
  counts[hit.name] = (counts[hit.name] || 0) + 1;
  flagged.push(JSON.stringify({ idea: l.idea, job: l.job, category: hit.name, user, original: l.messages }));
  const userMsg = l.messages.find((m) => m.role === 'user');
  out.push(JSON.stringify({ idea: l.idea, job: l.job, think: false, thoth_refusal: hit.name,
    messages: [{ role: 'user', content: userMsg.content }, { role: 'assistant', content: hit.refusal }] }));
}
fs.writeFileSync(outPath, out.join('\n') + '\n');
fs.writeFileSync(flagPath, flagged.join('\n') + (flagged.length ? '\n' : ''));
console.log(`in ${lines.length} lessons -> ${outPath}`);
console.log(`swapped ${flagged.length} into in-voice refusals (originals in ${flagPath}):`);
for (const c of cats) if (counts[c.name]) console.log(`  ${c.name}: ${counts[c.name]}`);
console.log('Review the flagged file by eye: anything swapped that should have been answered, loosen that category; anything answered that should have been refused, tighten it.');
