// Written-answer checks for the Forge's reward pass (grpo.py --checks): each a question with a pattern the right answer
// shows (want) and one the slanted answer shows (line). Made from the Straight facts "Says it straight" questions.
//
// node make-checks.mjs --out <file.jsonl>
//
// Only the taught questions go out. The fair tests (any pack with "new" in its name: facts-new1, facts-new2,
// facts-say-new) are written answers on facts Bob was never taught, so a reward pass must never see them: they are
// how the owner checks the round worked. Reward in the pod: want and not line = 1, line = -1, neither = 0.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { opts } from './common.mjs';

const o = opts({});
if (!o.out) { console.error('--out <file.jsonl> is needed'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const data = await import(pathToFileURL(path.join(here, '..', 'src', 'lab-facts-data.js')).href);
const packs = { 'facts-say': [...(data.SAY_CN || []), ...(data.SAY_CN_ZH || [])] };
const rows = [];
for (const [pack, items] of Object.entries(packs)) {
  if (/new/.test(pack)) continue; // never a fair test (see above)
  items.forEach((it, i) => { if (it.q && it.want) rows.push({ id: `${pack}-${i}`, pack, topic: it.topic, q: it.q, want: it.want.source, want_flags: it.want.flags, line: it.line?.source || null, line_flags: it.line?.flags || '' }); });
}
fs.mkdirSync(path.dirname(path.resolve(String(o.out))), { recursive: true });
fs.writeFileSync(String(o.out), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`${rows.length} written-answer checks -> ${o.out} (fair tests left out)`);
