// 1.5.156 Computer Science Lab, part 3: the Playground's quantization ladder. "How small can this brain get before it
// gets worse?" A small full-size brain is made into six running files, Q8 down to Q2, and each is measured the same
// way: size on disk, the Lab test (score and words a second) and how surprised it is by ordinary English (perplexity,
// from llama-perplexity, lower is better). Then the same question can be asked of every size, side by side.
// Everything runs here, free; disk is the only cost, shown before it's spent, and Delete all takes it back.
import fs from 'node:fs';
import path from 'node:path';
import { HELP } from '../public/help-content.js';

export const LADDER = [
  { type: 'Q8_0', label: 'Q8', share: 0.53 },
  { type: 'Q6_K', label: 'Q6', share: 0.41 },
  { type: 'Q5_K_M', label: 'Q5', share: 0.36 },
  { type: 'Q4_K_M', label: 'Q4', share: 0.3 },
  { type: 'Q3_K_M', label: 'Q3', share: 0.25 },
  { type: 'Q2_K', label: 'Q2', share: 0.2 }
];
export const LADDER_TYPES = LADDER.map((x) => x.type);
export const PLAY_MAX_GB = 9; // full-size files up to this: a 4B brain in F16 is about 8 GB
export const VERDICTS = [[0.02, 'same quality'], [0.08, 'a little worse'], [0.25, 'noticeably worse'], [Infinity, 'falls apart']];

// The text the ladder measures with: my own Help, as plain words. The first part tunes the small files (the importance
// measurement), the second part is what each size is scored on, so no size is marked on text it was tuned with.
export function ladderTexts(help = HELP) {
  const plain = help.map((h) => String(h.html).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\$\{[^}]*\}/g, ' ')).join('\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return { tune: plain.slice(0, 40000), score: plain.slice(40000, 52000) };
}

// How much disk the ladder takes for a full-size brain of `gb`: every rung plus the importance file.
export const ladderDiskGB = (gb) => Math.round((LADDER.reduce((a, x) => a + gb * x.share, 0) + 0.1) * 10) / 10;

// The final perplexity llama-perplexity prints: "Final estimate: PPL = 8.1234 +/- 0.05". null if it isn't there.
export function readPerplexity(text) {
  const m = String(text || '').match(/Final estimate:\s*PPL\s*=\s*([0-9.]+)/i) || String(text || '').match(/\bPPL\s*=\s*([0-9.]+)/);
  return m ? Number(m[1]) : null;
}

// The table: each rung's surprise next to the biggest rung's (shown as 1.00 x), with my verdict in words.
export function ladderTable(rungs) {
  const base = rungs.find((r) => r.ppl)?.ppl || null;
  const top = rungs.find((r) => r.score !== null && r.score !== undefined)?.score ?? null;
  return rungs.map((r) => {
    const rel = base && r.ppl ? Math.round((r.ppl / base) * 100) / 100 : null;
    const v = rel === null ? '' : VERDICTS.find(([lim]) => rel - 1 <= lim)[1];
    const drop = top !== null && r.score !== null && r.score !== undefined ? r.score - top : null;
    return { type: r.type, label: LADDER.find((x) => x.type === r.type)?.label || r.type, sizeGB: r.sizeGB ?? null, score: r.score ?? null, tps: r.tps ?? null, ppl: r.ppl ?? null, rel, verdict: v, scoreDrop: drop };
  });
}

// My line under the table: where quality starts to slip, and the smallest size that's still fine.
export function ladderSaw(rows) {
  const ok = rows.filter((r) => r.rel !== null && r.rel - 1 <= 0.08);
  const slip = rows.find((r) => r.rel !== null && r.rel - 1 > 0.08);
  if (!ok.length) return '';
  const small = ok[ok.length - 1], big = rows[0];
  const saved = big?.sizeGB && small.sizeGB ? Math.round((1 - small.sizeGB / big.sizeGB) * 100) : 0;
  return `${small.label} is the smallest size here that's still close to ${big.label}${saved > 0 ? `, and it's ${saved}% smaller` : ''}.${slip ? ` From ${slip.label} down it starts to slip: ask them all the same question below and read where.` : ' Even the smallest size held up on this brain.'}`;
}

export const playDir = (labDirPath) => path.join(labDirPath, 'playground');
export function readLadders(dir) {
  let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
  return names.map((n) => { try { return { id: n, ...JSON.parse(fs.readFileSync(path.join(dir, n, 'ladder.json'), 'utf8')) }; } catch { return null; } }).filter((x) => x?.brain);
}
