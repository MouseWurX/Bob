// Direction prep (27 Nov 2026, the owner: "can we continue with dials and also do mit's direction edit simultaneously?"). After
// MIT CSAIL's weight-space programming, which found a direction in a small brain's stream and took it out. Writes the two sets
// of texts the pod's direction step (run.sh, llama-cvector-generator --method mean) contrasts: pos = the start of answers that
// ran out of room, neg = the start of answers that finished, each with the chat around it as the brain saw it, cut to the same
// number of words so the two sides line up token for token. Parts: all, and the halves a and b (how steady the direction is).
// Reads a loop-sweep progress.json (its find answers, PRACTICE problems only, never the held-out jobs). Writes nothing to a brain.
// SURGERY RECORD ONLY: these texts are measuring sticks, never lessons, odds or preference pairs.
//
// node direction-prep.mjs --progress <progress.json> --out <folder> [--words 400] [--pairs 40]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// one line per text for llama-cvector-generator: it turns "\n" back into a new line
export const oneLine = (t) => String(t).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n');

export function chatText(row, words) {
  const q = row.messages?.[0]?.content || '';
  const think = String(row.reply?.reasoning_content || '').split(/\s+/).filter(Boolean).slice(0, words).join(' ');
  return `<|im_start|>user\n${q}<|im_end|>\n<|im_start|>assistant\n<think>\n${think}`;
}

// cut = ran out of room (finish 'length' or flagged cut/loop with the most tokens); finished = stopped by itself and right
export function pickPairs(rows, { words = 400, pairs = 40 } = {}) {
  const long = (r) => String(r.reply?.reasoning_content || '').split(/\s+/).filter(Boolean).length >= words;
  const cut = rows.filter((r) => (r.cut ?? r.loop) && long(r));
  const fin = rows.filter((r) => !(r.cut ?? r.loop) && r.ok && long(r));
  const n = Math.min(pairs, cut.length, fin.length);
  return { pos: cut.slice(0, n).map((r) => chatText(r, words)), neg: fin.slice(0, n).map((r) => chatText(r, words)), cut: cut.length, finished: fin.length, n };
}

async function main() {
  const o = {}; const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { o[a[i].slice(2)] = a[i + 1]; i++; }
  if (!o.progress || !o.out) { console.error('node direction-prep.mjs --progress <progress.json> --out <folder> [--words 400] [--pairs 40]'); process.exit(1); }
  const prog = JSON.parse(fs.readFileSync(o.progress, 'utf8'));
  const rows = prog.found || [];
  const p = pickPairs(rows, { words: Number(o.words || 400), pairs: Number(o.pairs || 40) });
  if (p.n < 16) { console.error(`only ${p.n} pairs (cut ${p.cut}, finished and right ${p.finished}): too few for a steady direction`); process.exit(1); }
  const out = path.resolve(o.out); fs.mkdirSync(out, { recursive: true });
  const h = Math.floor(p.n / 2);
  const put = (part, pos, neg) => { fs.writeFileSync(path.join(out, `pos-${part}.txt`), pos.map(oneLine).join('\n') + '\n'); fs.writeFileSync(path.join(out, `neg-${part}.txt`), neg.map(oneLine).join('\n') + '\n'); };
  put('all', p.pos, p.neg); put('a', p.pos.slice(0, h), p.neg.slice(0, h)); put('b', p.pos.slice(h, 2 * h), p.neg.slice(h, 2 * h));
  fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify({ from: path.basename(o.progress), pairs: p.n, words: Number(o.words || 400), cut_available: p.cut, finished_available: p.finished, pos: 'start of answers that ran out of room', neg: 'start of answers that finished and were right' }, null, 1));
  console.log(`direction texts: ${p.n} pairs (of ${p.cut} cut, ${p.finished} finished and right) in ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.message || e); process.exit(1); });
