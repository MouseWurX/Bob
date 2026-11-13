// Straight facts from the command line (Nov 12 2026), for brains the Lab can't load and long overnight runs.
//
//   node straight-facts.mjs probe --url http://127.0.0.1:8080 [--packs facts-cn,facts-zh,facts-watch,facts-fair,facts-say] [--out out/facts] [--label gptoss120b]
//        Runs the Straight facts packs against any running llama-server and saves every question, answer and the top-5
//        odds to <out>/answers-<label>-<time>.jsonl, plus a scores line per pack.
//   node straight-facts.mjs scan --lessons <lessons.jsonl>[,<more.jsonl>]
//        Which of your lessons touch the topics (word search, no brain), with the first words of each answer.
//   node straight-facts.mjs rescore --log <answers.jsonl> --out <folder> [--packs facts-say] [--all]
//        Turns another brain's saved answers into lessons, so the Forge's teacher pass scores them with our own Qwen.
//   node straight-facts.mjs lessons --out <folder> [--round 2]
//        Writes a sourced Straight facts lesson set (round 1 = set A, round 2 = set C) to a folder.
//   node straight-facts.mjs mix --rounds 1 --general out/lessons --general-count 1500 --repeat 3 --out out/lessons-facts-r1
//        The Forge's training mix for teaching the full brain before a cut (plans/fact-fix-r1.json and r2): the fact lessons
//        of those rounds, repeated, plus a seeded sample of your general lessons so nothing else drifts.
import fs from 'node:fs';
import path from 'node:path';
import { opts, stamp, appendJsonl } from './common.mjs';
import { runExtraPack } from '../src/lab-packs.js';
import { FACT_PACK_IDS, scanLessons, answersToLessons, writeFactLessons, mixLessons } from '../src/lab-facts.js';

const cmd = process.argv[2];
const o = opts({ out: path.join('out', 'facts') });
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

if (cmd === 'probe') {
  // From the Forge's benchmark the pod's URL and key come in LAB_URL and LAB_API_KEY: every request carries the key.
  if (!o.url && process.env.LAB_URL) o.url = process.env.LAB_URL;
  if (process.env.LAB_API_KEY) { const f = globalThis.fetch; globalThis.fetch = (u, init = {}) => f(u, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${process.env.LAB_API_KEY}` } }); }
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
  console.log(`written ${writeFactLessons(String(o.out), Number(o.round) || 1)}`);
} else if (cmd === 'mix') {
  const r = mixLessons({ rounds: list(o.rounds || '1').map(Number), general: o.general ? String(o.general) : null, generalCount: Number(o['general-count'] ?? 1500), repeat: Number(o.repeat ?? 3), seed: Number(o.seed ?? 1), out: String(o.out) });
  console.log(`${r.facts} fact lessons and ${r.general} general lessons written to ${r.file}`);
} else {
  console.error('Use: probe | scan | rescore | lessons | mix (see the top of this file)');
  process.exit(1);
}
