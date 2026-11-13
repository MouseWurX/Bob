// The surgery data rule for answers saved before tool-score and experts-test marked their own (13 Nov 2026): stamps
// "condition" (and evidence:true with --evidence) into every answer row of the *.jsonl files in a folder. A row that
// already says its condition keeps it. New runs don't need this: they write it themselves (answerTags in common.mjs).
// node stamp-condition.mjs --dir <folder> --condition "stock" | "keep75-n8" [--evidence] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { opts } from './common.mjs';

const o = opts({});
if (!o.dir || !(o.condition || o.evidence)) { console.error('--dir <folder> and --condition <what it was made under> (or --evidence) are needed'); process.exit(1); }
const dir = String(o.dir), cond = o.condition ? String(o.condition).trim() : '';
let files = 0, stamped = 0, kept = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
  const p = path.join(dir, f);
  const lines = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n');
  let changed = false;
  const out = lines.map((line) => {
    if (!line.trim()) return line;
    let r; try { r = JSON.parse(line); } catch { return line; }
    if (!r || typeof r !== 'object' || Array.isArray(r)) return line;
    let c = false;
    if (cond) { if (r.condition === undefined || r.condition === null || r.condition === '') { r.condition = cond; c = true; } else kept++; }
    if (o.evidence && r.evidence !== true) { r.evidence = true; c = true; }
    if (c) { stamped++; changed = true; return JSON.stringify(r); }
    return line;
  });
  if (changed && !o.dry) { const tmp = `${p}.stamping`; fs.writeFileSync(tmp, out.join('\n')); fs.renameSync(tmp, p); }
  files++;
}
console.log(`${files} files, ${stamped} rows stamped${o.dry ? ' (dry run, nothing written)' : ''}, ${kept} kept their own condition`);
