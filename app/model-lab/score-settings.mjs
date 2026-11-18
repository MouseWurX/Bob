// How speed settings are scored (method doc Addendum 48, Nov 18 2026; asked for by the owner).
// Pure functions: no files, no card, no clock. The runner's results go in, a table of gates and scores comes out.
//
// 1. Gates (fail = out, whatever the speed): no real spill, needle found at every depth, small answer drift, no aborts.
// 2. Measures as ratios against stock llama.cpp on the same brain, context and prompt (above 1 = better).
// 3. One score per kind of job: a weighted geometric mean of the ratios, so a weak spot can't hide behind one big number.
//    1.00 = stock llama.cpp; 1.30 = 30% better for that job.

export const GATES = { realSpillMB: 150, kldMax: 0.01, sameTopMin: 0.95 };
export const WEIGHTS = {
  chat: { W: 0.45, F: 0.20, R: 0.10, B: 0.15, H: 0.05, L: 0.05 },
  longDocs: { F: 0.35, R: 0.30, W: 0.15, B: 0.10, H: 0.05, L: 0.05 },
  codingAgent: { W: 0.30, F: 0.25, R: 0.20, B: 0.15, H: 0.05, L: 0.05 }
};
export const HEADROOM_MIB = 512;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// s: { realSpillMB, needles: {found, of}, kld, sameTop, aborts, failedPrompts }. Unknown values don't fail a gate,
// but are listed so nobody mistakes "not measured" for "passed".
export function gates(s = {}) {
  const fails = [], unknown = [];
  const check = (v, bad, why, name) => { if (num(v) === null) unknown.push(name); else if (bad(v)) fails.push(why); };
  check(s.realSpillMB, (v) => v >= GATES.realSpillMB, `real spill ${s.realSpillMB} MB`, 'spill');
  if (s.needles && num(s.needles.of)) { if (s.needles.found < s.needles.of) fails.push(`needle ${s.needles.found} of ${s.needles.of}`); } else unknown.push('needle');
  check(s.kld, (v) => v > GATES.kldMax, `answer drift ${s.kld}`, 'kld');
  check(s.sameTop, (v) => v < GATES.sameTopMin, `same top word ${s.sameTop}`, 'sameTop');
  if ((s.aborts || 0) > 0 || (s.failedPrompts || 0) > 0) fails.push('aborted or failed prompts');
  return { pass: fails.length === 0, fails, unknown };
}

// ours / stock: { read, write, firstS, loadS, freeMiB, busyKeep } (busyKeep = busy speed / clean speed, 0..1).
export function measures(ours = {}, stock = {}) {
  const ratio = (a, b) => (num(a) && num(b) ? a / b : null);
  return {
    R: ratio(ours.read, stock.read),
    W: ratio(ours.write, stock.write),
    F: ratio(stock.firstS, ours.firstS),
    L: ratio(stock.loadS, ours.loadS),
    H: num(ours.freeMiB) === null ? null : Math.min(1, Math.max(0.01, ours.freeMiB / HEADROOM_MIB)),
    B: num(ours.busyKeep) === null ? null : ours.busyKeep / (num(stock.busyKeep) || 1)
  };
}

// Weighted geometric mean over the measures that exist; the weights of missing ones are spread over the rest, and
// the result says which were missing.
export function score(m, weights) {
  let logSum = 0, wSum = 0; const missing = [];
  for (const [k, w] of Object.entries(weights)) {
    if (num(m[k]) === null || m[k] <= 0) { missing.push(k); continue; }
    logSum += w * Math.log(m[k]); wSum += w;
  }
  return { score: wSum ? Math.round(Math.exp(logSum / wSum) * 100) / 100 : null, missing };
}

export function scoreAll(ours, stock, gateFacts) {
  const g = gates(gateFacts), m = measures(ours, stock);
  const out = { gates: g, measures: m };
  for (const [job, w] of Object.entries(WEIGHTS)) out[job] = g.pass ? score(m, w) : { score: null, missing: [], out: true };
  return out;
}
