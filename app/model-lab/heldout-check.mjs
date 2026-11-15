// The held-out check after training (15 Nov 2026, the owner's plan): the clean held-out tool lessons (the ones the sort
// kept; they never train, lesson-ledger --check --never keeps them out) become a tool-score set, so the newly trained Bob
// and stock Qwen3.6-35B-A3B answer the very same turns and are scored side by side.
//
//   node heldout-check.mjs --from <folder with lessons.jsonl + toolsets.json> [--verdicts <verdicts.jsonl>] --out <folder>
//     [--stock <stock gguf>] [--trained <trained gguf>]
//
// --verdicts: rows {idea|id, verdict}; only verdict "keep" goes in (fix, repair and discard rows were wrong answers, so
// agreeing with them would score nothing). Without it, every lesson in --from is taken as already clean.
// Out: <out>/lessons.jsonl (each lesson stamped split: "holdout", so tool-score scores it whatever its id), toolsets.json,
// and HELDOUT.md with the exact tool-score command for both brains. Nothing is run or downloaded here.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { notForTraining } from './common.mjs';

export function heldoutSet(lessons, verdicts = null) {
  const keep = verdicts ? new Set(verdicts.filter((v) => String(v.verdict).toLowerCase() === 'keep').map((v) => String(v.idea ?? v.id))) : null;
  const out = [], dropped = { not_kept: 0, no_assistant: 0, not_for_training: 0 };
  for (const [i, l] of lessons.entries()) {
    const id = String(l.idea ?? l.id ?? `h${i}`);
    if (keep && !keep.has(id)) { dropped.not_kept++; continue; }
    if (!l.messages?.some((m) => m.role === 'assistant')) { dropped.no_assistant++; continue; }
    if (notForTraining(l)) { dropped.not_for_training++; continue; } // dial or surgery answers are never a right answer either
    out.push({ ...l, idea: id, split: 'holdout' });
  }
  return { lessons: out, dropped };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { opts, readJsonl } = await import('./common.mjs');
  const o = opts({});
  if (!o.from || !o.out) { console.error('--from <folder> --out <folder> are needed'); process.exit(1); }
  const src = String(o.from), out = String(o.out);
  if (!fs.existsSync(path.join(src, 'toolsets.json'))) { console.error(`no toolsets.json in ${src}: tool-score needs the tools each lesson was offered`); process.exit(1); }
  const { lessons, dropped } = heldoutSet(readJsonl(path.join(src, 'lessons.jsonl')), o.verdicts ? readJsonl(String(o.verdicts)) : null);
  if (!lessons.length) { console.error('no clean held-out lessons: nothing to score'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'lessons.jsonl'), lessons.map((l) => JSON.stringify(l)).join('\n') + '\n');
  fs.copyFileSync(path.join(src, 'toolsets.json'), path.join(out, 'toolsets.json'));
  const q = (v) => `"${String(v).replace(/"/g, '')}"`;
  const cmd = `node tool-score.mjs --lessons ${q(path.resolve(out))} --tools live --models "stock=${o.stock || '<stock Qwen3.6-35B-A3B gguf>'},trained=${o.trained || '<trained Bob gguf>'}"`;
  fs.writeFileSync(path.join(out, 'HELDOUT.md'), `# Held-out check\n\n${lessons.length} clean held-out lessons (dropped: ${dropped.not_kept} not kept, ${dropped.no_assistant} with no answer, ${dropped.not_for_training} dial or surgery).\n\nThese never train. After training, score both brains on the same turns:\n\n    ${cmd}\n\nOn a rented card, serve each brain in turn and use --url with --models "stock=served" and "trained=served".\nThe trained Bob should match or beat stock Qwen on right tool, right inputs and rightly no tool.\n`);
  console.log(`${lessons.length} held-out lessons -> ${out} (dropped ${JSON.stringify(dropped)})\n${cmd}`);
}
