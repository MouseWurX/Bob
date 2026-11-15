// Does a big brain's expert map carry over to its cut? (13 Nov, the owner: "would analysing the neurons of 120b suggest where we
// can for the 38b?") Both brains read the same lessons with trace-read.mjs. The cut kept some of the big brain's experts per
// layer (a keep list from reap-calibrate: keep[layer] = the big brain's expert ids, in the cut's order), so every expert the
// big brain leans on for a target either was removed or has a known number in the cut. This compares the two lift maps:
//   suggested = the big brain's leaning experts that survive in the cut (its guess for the cut)
//   confirmed = suggested AND the cut's own trace leans on them too  -> the only ones offered as the cut's dials
// node trace-carryover.mjs --big <120B lift.json> --small <38B lift.json> --map <keep-NN.json> [--out <folder>]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dialTrials } from './trace-read.mjs';

// keep[l][i] = big id of the cut's expert i in layer l  ->  per layer Map(bigId -> cutIndex)
export const cutIndex = (keep) => (keep || []).map((ids) => (Array.isArray(ids) ? new Map(ids.map((b, i) => [b, i])) : null));

export function carryover(big, small, keep, side = 'up') {
  const idx = cutIndex(keep), report = {}, confirmedLift = {};
  for (const [t, layers] of Object.entries(big.lift || {})) {
    let suggested = 0, survived = 0, confirmed = 0, cutOwn = 0;
    confirmedLift[t] = (layers || []).map((x, l) => {
      const map = idx[l], own = small.lift?.[t]?.[l]?.[side] || [];
      const ownSet = new Set(own.map((y) => y.expert)); cutOwn += own.length;
      const keepUp = [];
      for (const y of x?.[side] || []) {
        suggested++;
        if (!map || !map.has(y.expert)) continue; // removed by the cut
        survived++; const ci = map.get(y.expert);
        if (ownSet.has(ci)) { confirmed++; keepUp.push({ expert: ci, lift: own.find((z) => z.expert === ci).lift, from_big: y.expert }); }
      }
      return { [side]: keepUp };
    });
    report[t] = { suggested, survived_cut: survived, confirmed, cut_own: cutOwn, carry: survived ? Math.round((confirmed / survived) * 100) / 100 : null };
  }
  return { report, confirmedLift };
}

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1]]] : acc), []));
  if (!a.big || !a.small || !a.map) { console.error('node trace-carryover.mjs --big <lift.json> --small <lift.json> --map <keep.json> [--out <folder>]'); process.exit(1); }
  const rd = (f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
  // --map hf:<repo>:<path> reads a public keep list from Hugging Face (the 38B's keep-32-v2.json sits beside its GGUF)
  const keepJson = /^hf:/.test(a.map) ? await (async () => { const [, repo, file] = a.map.split(':'); const r = await fetch(`https://huggingface.co/${repo}/resolve/main/${file}`); if (!r.ok) throw new Error(`keep list ${a.map}: ${r.status}`); return r.json(); })() : rd(a.map);
  const big = rd(a.big), small = rd(a.small), keep = keepJson.keep;
  const out = path.resolve(a.out || path.dirname(path.resolve(a.small))); fs.mkdirSync(out, { recursive: true });
  const up = carryover(big, small, keep, 'up'), down = carryover(big, small, keep, 'down');
  const merged = Object.fromEntries(Object.keys(up.confirmedLift).map((t) => [t, up.confirmedLift[t].map((x, l) => ({ up: x.up, down: down.confirmedLift[t][l].down }))]));
  fs.writeFileSync(path.join(out, 'carryover.json'), JSON.stringify({ up: up.report, down: down.report }, null, 1));
  fs.writeFileSync(path.join(out, 'dials-confirmed.json'), JSON.stringify(dialTrials(merged), null, 1));
  const rows = Object.entries(up.report).map(([t, r]) => `| ${t} | ${r.suggested} | ${r.survived_cut} | ${r.confirmed} | ${r.carry ?? '-'} |`);
  fs.writeFileSync(path.join(out, 'carryover.md'), ['# Does the big brain\'s map carry over to the cut?', '', 'Leaning-up experts per target, summed over layers. carry = confirmed / survived (1 = the big map predicts the cut perfectly).', '', '| target | big brain suggests | survive the cut | the cut confirms | carry |', '|---|---|---|---|---|', ...rows, '', 'Only confirmed experts go into dials-confirmed.json (for expert-sweep.mjs --dials-file on the cut).', ''].join('\n'));
  console.log(`carryover written to ${out}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.message); process.exit(1); });
