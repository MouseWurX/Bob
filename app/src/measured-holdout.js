// Nov 27, the owner asked of the test-results database: "will doing this make guppi better? Is it a certainty?" Not
// by itself. This is the check that proves it or doesn't: leave one PC out of the database, let GUPPI start from the
// rest (the baseline) as he would on that PC, and score his pick with that PC's own measured speeds, against GUPPI
// starting with nothing (his built-in table). Measured numbers only; a PC needs at least two steps measured for a brain.
//   node src/measured-holdout.js [--data <Bob data folder>]   (the seed, plus that folder's own rows)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAll, readSeed, speedsFor } from './measured-db.js';
import { loadStepBySpeed, CHAT_STEP } from './conductor.js';

export const pcKey = (pc = {}) => `${pc.card || '?'} ${Math.round((pc.cardMiB || 0) / 512) / 2} GB card, ${Math.round((pc.ramMB || 0) / 1024)} GB RAM${pc.apu ? ', built-in graphics' : ''}`;
const JOB = { readTok: 16384, outTok: 300 };
const jobS = (sp, step) => (sp?.read?.[step] > 0 && sp?.write?.[step] > 0 ? JOB.readTok / sp.read[step] + JOB.outTok / sp.write[step] : null);
const r1 = (n) => Math.round(n * 10) / 10;

// -> [{ pc, brain, cache, truth, without: { step, s }, with: { step, s, from } | null, gainS, errPct }] and a summary
export function holdout(rows, { cache = true, ctx = 32768, kv = 'q8_0' } = {}) {
  const out = [];
  const pcs = new Map();
  for (const r of rows) { const k = pcKey(r.pc); if (!pcs.has(k)) pcs.set(k, r.pc); }
  for (const [k, pc] of pcs) {
    const mine = rows.filter((r) => pcKey(r.pc) === k), rest = rows.filter((r) => pcKey(r.pc) !== k);
    for (const file of [...new Set(mine.map((r) => r.brain.file))]) {
      const be = Math.max(0, ...mine.filter((r) => r.brain.file === file).map((r) => r.be || 0));
      const truth = speedsFor(mine, { file, pc, be, cache, ctx, kv });
      const steps = truth ? Object.keys(truth.write).map(Number).filter((s) => jobS(truth, s)).sort((a, b) => a - b) : [];
      if (steps.length < 2) continue;
      const chat = steps.includes(CHAT_STEP) ? CHAT_STEP : steps[0], max = steps[steps.length - 1];
      const base = speedsFor(rest, { file, pc, be, cache, ctx, kv });
      const pick = (sp) => loadStepBySpeed({ speeds: sp, chat, max, ...JOB }).step;
      const without = { step: pick(null) }; without.s = r1(jobS(truth, without.step));
      const best = steps.reduce((a, s) => (jobS(truth, s) < jobS(truth, a) ? s : a), steps[0]);
      let withB = null, errPct = null;
      if (base) {
        withB = { step: pick(base), from: base.from.level }; withB.s = r1(jobS(truth, withB.step));
        const errs = steps.flatMap((s) => [['read', s], ['write', s]]).filter(([w, s]) => base[w][s] > 0).map(([w, s]) => Math.abs(base[w][s] - truth[w][s]) / truth[w][s]);
        errPct = errs.length ? Math.round((100 * errs.reduce((a, b) => a + b, 0)) / errs.length) : null;
      }
      out.push({ pc: k, brain: file, cache, steps, best: { step: best, s: r1(jobS(truth, best)) }, without, with: withB, gainS: withB ? r1(without.s - withB.s) : null, errPct });
    }
  }
  const tested = out.filter((x) => x.with);
  const summary = !out.length ? 'No PC in the database has two or more steps measured for a brain, so nothing can be checked yet.'
    : !tested.length ? `${out.length} brain${out.length === 1 ? '' : 's'} on ${new Set(out.map((x) => x.pc)).size} PC${out.length === 1 ? '' : 's'} could be checked, but no other PC has the same brain measured, so the baseline has nothing to offer them yet. Unproven in our lab, as we have yet to test.`
    : `${tested.length} held-out checks: the baseline made GUPPI's pick faster in ${tested.filter((x) => x.gainS > 0).length}, the same in ${tested.filter((x) => x.gainS === 0).length}, slower in ${tested.filter((x) => x.gainS < 0).length}.`;
  return { checks: out, summary };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf('--data');
  const rows = i > 0 ? readAll({ dataDir: process.argv[i + 1] }) : readSeed();
  for (const cache of [true, false]) {
    const { checks, summary } = holdout(rows, { cache });
    console.log(`\n## ${cache ? 'With the copy cache' : 'Without the copy cache'}\n${summary}`);
    for (const c of checks) console.log(`- ${c.pc}, ${c.brain}: best step ${c.best.step} (${c.best.s} s). Without the baseline: step ${c.without.step} (${c.without.s} s). ${c.with ? `With it (${c.with.from}): step ${c.with.step} (${c.with.s} s), ${c.gainS > 0 ? `${c.gainS} s faster` : c.gainS < 0 ? `${-c.gainS} s slower` : 'the same'}; its speeds were ${c.errPct}% off this PC's on average.` : 'No other PC has this brain measured.'}`);
  }
}
