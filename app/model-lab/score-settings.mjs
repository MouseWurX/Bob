// How speed settings are scored (method doc Addendum 48, revised Nov 18 2026 after the owner's review).
// Pure functions: no files, no card, no clock.
//
// Score on job time, gate on robustness. No weights to tune:
// - Job time = first word + L / writing speed, with L fixed per use (chat 300, agent 600, long-form 2,000 tokens).
// - A use that spans several context sizes gets ONE blended job time (a weighted sum of the per-size job times),
//   scored against stock llama.cpp's blended job time once (not an average of per-size ratios).
// - Gates are hard limits. Each comes back pass, fail or "not measured"; only all-pass settings get a score, and
//   "not measured" is never shown as failed.

export const ANSWER = { chat: 300, agent: 600, longForm: 2000 };
// Share of each use's jobs at each context size (the per-use blend). Sizes a use never reaches are left out.
export const BLEND = {
  chat: { short: 0.6, '32K': 0.4 },
  agent: { '32K': 0.6, '128K': 0.4 },
  longForm: { '128K': 0.5, '256K': 0.5 }
};
export const GATES = {
  realSpillMB: 150, // shared rise minus every pinned CUDA_Host compute buffer
  meanKld: 0.01, // MEAN KL divergence against an f16 cache (not the 99th percentile: q8_0's is 0.03)
  sameTop: 0.95, // same top word as the f16 cache
  busyLoss: 0.25, // a busy desktop may cost at most 25% of job time
  freeCardMiB: 512, // card memory left after load (a 256 MB margin is where a real spill starts)
  loadS: 15 // seconds from start to ready, for a 35B brain (5.3 to 7.4 s warm, 12.6 to 14 s cold)
};

export function jobTime(firstS, writeTps, answer) {
  return Number.isFinite(firstS) && writeTps > 0 ? firstS + answer / writeTps : null;
}

// Per-use job time from per-size {firstS, write}. Null if any size in the blend is missing (no silent re-weighting).
export function blendedJobTime(bySize, use) {
  let t = 0;
  for (const [size, w] of Object.entries(BLEND[use])) {
    const s = bySize?.[size]; const j = s ? jobTime(s.firstS, s.write, ANSWER[use]) : null;
    if (j === null) return null;
    t += w * j;
  }
  return t;
}

// facts: { realSpillMB, needles: {found, of}, meanKld, sameTop, aborts, busyLoss, freeCardMiB, loadS, kldRuns }
const statusOf = (v, ok) => (typeof v === 'number' && Number.isFinite(v) ? (ok(v) ? 'pass' : 'fail') : 'not measured');
export function gates(f = {}) {
  const g = {
    spill: statusOf(f.realSpillMB, (v) => v < GATES.realSpillMB),
    needle: f.needles && f.needles.of > 0 ? (f.needles.found === f.needles.of ? 'pass' : 'fail') : 'not measured',
    meanKld: statusOf(f.meanKld, (v) => v <= GATES.meanKld),
    sameTop: statusOf(f.sameTop, (v) => v >= GATES.sameTop),
    noAborts: statusOf(f.aborts, (v) => v === 0),
    busy: statusOf(f.busyLoss, (v) => v <= GATES.busyLoss),
    freeCard: statusOf(f.freeCardMiB, (v) => v >= GATES.freeCardMiB),
    load: statusOf(f.loadS, (v) => v <= GATES.loadS)
  };
  const vals = Object.values(g);
  const status = vals.includes('fail') ? 'fail' : vals.includes('not measured') ? 'not measured' : 'pass';
  // A quality value from a single perplexity run is marked, so a knife-edge pass isn't read as firm.
  const singleRun = (f.kldRuns || 0) < 2 && (g.meanKld === 'pass' || g.sameTop === 'pass');
  return { status, gates: g, singleRun };
}

// Score = stock's blended job time / ours x 100 (100 = stock; 250 = two and a half times faster). Only for settings
// whose gates all pass; a gap within `noisePct` of the next one is reported as a tie, not a win.
export function scoreUse(ours, stock, use, facts) {
  const g = gates(facts);
  const mine = blendedJobTime(ours, use), base = blendedJobTime(stock, use);
  if (g.status !== 'pass' || mine === null || base === null) return { score: null, jobS: mine, gates: g };
  return { score: Math.round((base / mine) * 100), jobS: Math.round(mine * 10) / 10, gates: g };
}

export function rank(rows, noisePct = 3) {
  const r = rows.filter((x) => x.jobS !== null && x.score !== null).sort((a, b) => a.jobS - b.jobS);
  return r.map((x, i) => ({ ...x, tieWithBest: i > 0 && (x.jobS - r[0].jobS) / r[0].jobS * 100 <= noisePct }));
}
