#!/usr/bin/env node
// Add or update the benchmark block of a brain card (<file>.bob.json beside a GGUF), on the PC after the home tests.
//   node bob-card.mjs out/bobs/28Bob/28Bob-Q4_K_M.gguf --date 2026-11-08 --report <public url> --score Coding=69 --score Tools=65 \
//        --baseline "Qwen3.6 35B-A3B" --base Coding=92 --base Tools=67 [--what "one sentence"] [--jobs bob,deep,...]
// Scores are percent numbers with short labels, at most 8. The card holds no paths, host names or people.
import fs from 'node:fs';
const args = process.argv.slice(2); const gguf = args.shift();
if (!gguf || !fs.existsSync(gguf)) { console.error('give the GGUF file'); process.exit(1); }
const cardPath = gguf.replace(/\.gguf$/i, '.bob.json');
const card = fs.existsSync(cardPath) ? JSON.parse(fs.readFileSync(cardPath, 'utf8')) : { card: 1 };
const st = fs.statSync(gguf); card.file = gguf.split(/[\\/]/).pop(); card.bytes = st.size;
const bench = card.benchmark || {}; const scores = bench.scores || {}; const base = (bench.baseline && bench.baseline.scores) || {};
let baselineName = bench.baseline && bench.baseline.name;
const pair = (s, into) => { const m = /^([^=]+)=(-?[\d.]+)$/.exec(s); if (!m) throw new Error(`bad score ${s}`); into[m[1].trim()] = Number(m[2]); };
for (let i = 0; i < args.length; i += 2) {
  const k = args[i], v = args[i + 1];
  if (k === '--date') bench.date = v; else if (k === '--report') bench.report = v;
  else if (k === '--score') pair(v, scores); else if (k === '--base') pair(v, base); else if (k === '--baseline') baselineName = v;
  else if (k === '--what') card.what = v; else if (k === '--jobs') card.jobs = v.split(',').filter(Boolean);
  else if (k === '--published') card.published = v; else throw new Error(`unknown ${k}`);
}
if (Object.keys(scores).length > 8) throw new Error('at most 8 scores');
bench.scores = scores; if (baselineName) bench.baseline = { name: baselineName, scores: base };
if (!bench.date) bench.date = new Date().toISOString().slice(0, 10);
card.benchmark = bench;
for (const v of Object.values(card)) if (typeof v === 'string' && /[A-Za-z]:\\|\/home\/|\/Users\//.test(v)) throw new Error('a path crept into the card');
fs.writeFileSync(cardPath, JSON.stringify(card, null, 1) + '\n');
console.log(`${cardPath}: benchmark block ${Object.keys(scores).length} scores`);
