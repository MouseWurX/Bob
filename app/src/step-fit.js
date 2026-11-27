// Nov 27 (the laptop's GUPPI probe, 6 GB RTX 3060): Inkling 2 Mini Q2 at a 32K chat memory and the usual 512-token
// reading step asked for 7.4 GB of working memory on the card (the engine's compute buffer), more than the whole card,
// wherever its weights went: -ngl 0 still took 5.56 GB and spilled 2.7 GB into slow shared memory, and the fit said
// "with only dense weights in device memory there is still a total deficit of 6033 MiB". That working memory grows with
// the reading step (-ub), so the lever is a smaller step. GUPPI's calibration found this (PR #361); this is the same
// fix for Bob's own loads, off unless "Fit my working memory to the card" is on (Settings, Speed & memory).
//
// After a load, the engine's own lines say what it put on each card: the card's free memory before the load, the
// brain's part, the chat memory and the working memory. When they add up to more than the card had (keeping
// STEP_FIT_MARGIN_MIB spare), and the working memory is what's crowding it, the step is cut to the biggest power of two
// that fits, the brain loads again at it, and the step is remembered for that brain. Only when the step is already at
// STEP_FIT_MIN_UB and still doesn't fit does the chat memory halve (never under STEP_FIT_MIN_CTX). Pure functions, so
// the tests pass the engine's words in.
export const STEP_FIT_MARGIN_MIB = 512; // the same spare room GUPPI keeps on the card (conductor.js SPILL_MARGIN_MIB)
export const STEP_FIT_MIN_UB = 64; // under this, long prompts read too slowly to be worth it
export const STEP_FIT_MIN_CTX = 16384; // a fresh Bob chat is ~6K tokens (instructions and tools)
export const STEP_FIT_BIG_MIB = 1024; // working memory under this isn't what fills a card: the fit moves the weights
export const STEP_FIT_TRIES = 3; // loads again at most this many times for one load
export const DEFAULT_UB = 512; // llama-server's own step when none is given
export const stepFitOn = (cfg) => cfg?.smallStepFit === true;

// Graphics cards only: CUDA, ROCm/HIP, Vulkan, SYCL. Not "CUDA_Host" (pinned RAM) and not Metal (a Mac's memory is
// shared, so nothing spills there; the device is named MTL0).
const DEV = '((?:CUDA|ROCm|HIP|Vulkan|SYCL)\\d+)';
const sumBy = (log, re) => {
  const out = {};
  for (const m of String(log || '').matchAll(re)) out[m[1]] = (out[m[1]] || 0) + (Number(m[2]) || 0);
  return out;
};
// What the engine said about each card: { CUDA0: { free, model, kv, compute } } in MiB. A load said again later (the fit
// tries several placements before the real one) counts only from the last "using device" line on.
export function cardUse(log) {
  let text = String(log || '').replace(/\r\n/g, '\n');
  const lastUse = text.lastIndexOf('using device ');
  const freeAt = {};
  for (const m of text.matchAll(new RegExp(`using device ${DEV} \\(.*?\\) - (\\d+) MiB free`, 'g'))) freeAt[m[1]] = Number(m[2]);
  if (lastUse > 0) text = text.slice(text.lastIndexOf('\n', lastUse) + 1);
  const model = sumBy(text, new RegExp(`${DEV} model buffer size\\s*=\\s*([\\d.]+) MiB`, 'g'));
  const kv = sumBy(text, new RegExp(`${DEV} (?:KV|RS) buffer size\\s*=\\s*([\\d.]+) MiB`, 'g'));
  const compute = sumBy(text, new RegExp(`${DEV} compute buffer size\\s*=\\s*([\\d.]+) MiB`, 'g'));
  // a load that ran out while reserving its working memory: the size it asked for is the working memory
  for (const m of text.matchAll(/allocating ([\d.]+) MiB on device (\d+): \w+ failed: out of memory/g)) { const d = `CUDA${m[2]}`; compute[d] = Math.max(compute[d] || 0, Number(m[1]) || 0); }
  const out = {};
  for (const d of new Set([...Object.keys(freeAt), ...Object.keys(compute)])) out[d] = { free: freeAt[d] ?? null, model: model[d] || 0, kv: kv[d] || 0, compute: compute[d] || 0 };
  return out;
}
// The fit's own word when moving every expert to RAM still leaves the card short ("total deficit of N MiB"). That is
// counted against the fit's own target ("free memory target of 1024 MiB"), so the part of it over our margin is taken off.
export function fitDeficitMiB(log, { margin = STEP_FIT_MARGIN_MIB } = {}) {
  const text = String(log || '');
  const all = [...text.matchAll(/still a total deficit of (\d+) MiB/g)];
  if (!all.length) return 0;
  const target = [...text.matchAll(/free memory target of (\d+) MiB/g)].map((m) => Number(m[1]) || 0).at(-1) || margin;
  return Math.max(0, (Number(all.at(-1)[1]) || 0) - Math.max(0, target - margin));
}
export function ubOf(args = []) {
  for (let i = args.length - 2; i >= 0; i--) if (['-ub', '--ubatch-size'].includes(args[i])) return Number(args[i + 1]) || DEFAULT_UB;
  return DEFAULT_UB;
}
// The card that is shortest, and by how much (MiB), with the working memory on it.
export function shortest(log, { margin = STEP_FIT_MARGIN_MIB } = {}) {
  let best = null;
  for (const [dev, u] of Object.entries(cardUse(log))) {
    if (!(u.compute > 0)) continue;
    const short = u.free != null ? u.model + u.kv + u.compute + margin - u.free : 0;
    if (!best || short > best.short) best = { dev, short: Math.max(0, Math.round(short)), compute: u.compute, free: u.free };
  }
  const deficit = fitDeficitMiB(log);
  if (deficit > 0 && best && deficit > best.short) best = { ...best, short: deficit, fromFit: true };
  return best;
}
// The plan: { ub, ctx, why } or null when nothing should change.
export function stepFitPlan({ log = '', ub = DEFAULT_UB, ctx = 0, minUb = STEP_FIT_MIN_UB, minCtx = STEP_FIT_MIN_CTX } = {}) {
  const s = shortest(log);
  if (!s || !(s.short > 0) || s.compute < STEP_FIT_BIG_MIB) return null;
  const want = s.compute - s.short; // the working memory that would fit
  let next = ub;
  while (next > minUb && s.compute * (next / ub) > want) next = Math.max(minUb, Math.floor(next / 2));
  if (next < ub && s.compute * (next / ub) <= want) return { ub: next, ctx, why: `the working memory was ${Math.round(s.compute)} MiB at step ${ub} on ${s.dev}, ${s.short} MiB more than the card had` };
  // the step at its floor and still short: a smaller chat memory too
  const half = ctx >= minCtx * 2 ? ctx / 2 : 0;
  if (half) return { ub: next, ctx: half, why: `the working memory was ${Math.round(s.compute)} MiB at step ${ub} on ${s.dev}, ${s.short} MiB more than the card had, even at step ${next}` };
  if (next < ub) return { ub: next, ctx, why: `the working memory was ${Math.round(s.compute)} MiB at step ${ub} on ${s.dev}, ${s.short} MiB more than the card had; step ${next} is the smallest I go` };
  return null;
}
// Swap the step in a load line: -ub set to the new step, and -b never under it.
export function withStep(args, ub) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (['-ub', '--ubatch-size'].includes(args[i])) { i++; continue; }
    out.push(args[i]);
  }
  const bi = out.findIndex((a) => ['-b', '--batch-size'].includes(a));
  if (bi >= 0 && Number(out[bi + 1]) < ub) out[bi + 1] = String(ub);
  out.push('-ub', String(ub));
  return out;
}
export const stepFitLine = (label, ub, ctx, wasCtx) => `The ${label}'s working memory didn't fit the graphics card at the usual reading step, so I read in smaller steps now (${ub} tokens at a time${ctx && wasCtx && ctx < wasCtx ? `, and a ${Math.round(ctx / 1024)}K chat memory` : ''}). Long prompts read slower, but nothing spills into slow shared memory.`;
