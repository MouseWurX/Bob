// Straight facts from the command line (Nov 12 2026), for brains the Lab can't load and long overnight runs.
//
//   node straight-facts.mjs probe --url http://127.0.0.1:8080 [--packs facts-cn,facts-zh,facts-watch,facts-fair,facts-say] [--out out/facts] [--label gptoss120b]
//        Runs the Straight facts packs against any running llama-server and saves every question, answer and the top-5
//        odds to <out>/answers-<label>-<time>.jsonl, plus a scores line per pack.
//   node straight-facts.mjs scan --lessons <lessons.jsonl>[,<more.jsonl>]
//        Which of your lessons touch the topics (word search, no brain), with the first words of each answer.
//   node straight-facts.mjs rescore --log <answers.jsonl> --out <folder> [--packs facts-say] [--all]
//        Turns another brain's saved answers into lessons, so the Forge's teacher pass scores them with our own Qwen.
//   node straight-facts.mjs lessons --out <folder>
//        Writes the sourced Straight facts lesson set (lessons.jsonl + toolsets.json) to a folder.
import fs from 'node:fs';
import path from 'node:path';
import { opts, stamp, appendJsonl } from './common.mjs';
import { runExtraPack } from '../src/lab-packs.js';
import { FACT_PACK_IDS, scanLessons, answersToLessons, writeFactLessons } from '../src/lab-facts.js';

const cmd = process.argv[2];
const o = opts({ out: path.join('out', 'facts') });
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

if (cmd === 'probe') {
  if (!o.url) { console.error('--url http://host:port of a running llama-server is needed'); process.exit(1); }
  const packs = o.packs ? list(o.packs) : FACT_PACK_IDS;
  fs.mkdirSync(o.out, { recursive: true });
  const file = path.join(String(o.out), `answers-${String(o.label || 'brain').replace(/[^\w.-]/g, '_')}-${stamp()}.jsonl`);
  for (const id of packs) {
    const res = await runExtraPack(String(o.url).replace(/\/$/, ''), id, { log: (x) => appendJsonl(file, { pack: id, ...x }), onStep: (d, t) => process.stdout.write(`\r${id} ${d}/${t}   `) });
    process.stdout.write('\n');
    appendJsonl(file, { pack: id, score: res.score, right: res.right, of: res.of, tps: res.tps });
    console.log(`${id}: ${res.right} of ${res.of} (${res.score}%)`);
  }
  console.log(`saved ${file}`);
} else if (cmd === 'scan') {
  const files = list(o.lessons);
  if (!files.length) { console.error('--lessons <lessons.jsonl> is needed'); process.exit(1); }
  const r = scanLessons(files);
  console.log(`${r.lessons} lessons read`);
  for (const [k, t] of Object.entries(r.topics)) if (t.count) {
    console.log(`\n${k}: ${t.count} lessons`);
    for (const h of t.hits) console.log(`  ${h.file} #${h.idea}${h.dodged ? ' (dodged)' : ''}: ${h.answer.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
} else if (cmd === 'rescore') {
  if (!o.log) { console.error('--log <answers.jsonl> is needed'); process.exit(1); }
  const r = answersToLessons(String(o.log), String(o.out), { packs: o.packs ? list(o.packs) : null, onlyRight: !o.all });
  console.log(`${r.lessons} lessons written to ${r.file}. Add the folder to the plan's extra_lessons; the teacher pass scores them.`);
} else if (cmd === 'lessons') {
  console.log(`written ${writeFactLessons(String(o.out))}`);
} else {
  console.error('Use: probe | scan | rescore | lessons (see the top of this file)');
  process.exit(1);
}
