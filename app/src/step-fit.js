// Nov 27 (the laptop's GUPPI probe, 6 GB RTX 3060): Inkling 2 Mini Q2 at a 32K chat memory and the usual 512-token
// reading step asked for 7.4 GB of working memory on the card (the engine's compute buffer), more than the whole card,
// wherever its weights went: -ngl 0 still took 5.56 GB and spilled 2.7 GB into slow shared memory, and the fit said
// "with only dense weights in device memory there is still a total deficit of 6033 MiB". That working memory grows with
// the reading step (-ub), so the lever is a smaller step. GUPPI's calibration found this (PR #361); this is the same
// fix for Bob's own loads, off unless "GUPPI fits his working memory to the card" is on (Settings, Speed & memory).
//
// After a load, the engine's own lines say what it put on each card: the card's free memory before the load, the
// brain's part, the chat memory and the working memory. When they add up to more than the card had (keeping
// STEP_FIT_MARGIN_MIB spare), and the working memory is what's crowding it, the step is cut to the biggest power of two
// that fits, and the step is remembered for that brain. GUPPI's way (the owner, Nov 27: no reloads): the fit's plan is read
// before the weights load and the brain opens at a step that fits; a brain that loaded short anyway switches to the
// smaller step in place (Brain Engine's POST /context), and from there GUPPI raises the step only while there's room.
// Only when the step is already at STEP_FIT_MIN_UB and still doesn't fit does the chat memory halve (never under
// STEP_FIT_MIN_CTX). Pure functions, so the tests pass the engine's words in.
export const STEP_FIT_MARGIN_MIB = 512; // the same spare room GUPPI keeps on the card (conductor.js SPILL_MARGIN_MIB)
export const STEP_FIT_MIN_UB = 64; // under this, long prompts read too slowly to be worth it
export const STEP_FIT_MIN_CTX = 16384; // a fresh Bob chat is ~6K tokens (instructions and tools)
export const STEP_FIT_BIG_MIB = 1024; // working memory under this isn't what fills a card: the fit moves the weights
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
// The plan: { ub, ctx, why, perUbMiB } or null when nothing should change. perUbMiB: working memory per token of step,
// so GUPPI knows how far the step can grow again once the brain is in.
export function planFrom({ dev = 'the card', compute = 0, short = 0, ub = DEFAULT_UB, ctx = 0, minUb = STEP_FIT_MIN_UB, minCtx = STEP_FIT_MIN_CTX } = {}) {
  if (!(short > 0) || compute < STEP_FIT_BIG_MIB) return null;
  const want = compute - short; // the working memory that would fit
  const perUbMiB = Math.round((compute / ub) * 100) / 100;
  let next = ub;
  while (next > minUb && compute * (next / ub) > want) next = Math.max(minUb, Math.floor(next / 2));
  const said = `the working memory was ${Math.round(compute)} MiB at step ${ub} on ${dev}, ${Math.round(short)} MiB more than the card had`;
  if (next < ub && compute * (next / ub) <= want) return { ub: next, ctx, perUbMiB, why: said };
  // the step at its floor and still short: a smaller chat memory too
  const half = ctx >= minCtx * 2 ? ctx / 2 : 0;
  if (half) return { ub: next, ctx: half, perUbMiB, why: `${said}, even at step ${next}` };
  if (next < ub) return { ub: next, ctx, perUbMiB, why: `${said}; step ${next} is the smallest I go` };
  return null;
}
export function stepFitPlan({ log = '', ub = DEFAULT_UB, ctx = 0, minUb, minCtx } = {}) {
  const s = shortest(log);
  return s ? planFrom({ ...s, ub, ctx, minUb, minCtx }) : null;
}
// the owner (Nov 27): "open it up at a smaller step", no reload. The engine's fit prints its plan within about a second,
// before a single weight is read: a memory line per card (total = free + (self = model + context + compute) + other)
// and, when moving every expert to RAM still isn't enough, "still a total deficit of N MiB". Read from those, GUPPI
// stops that start at once and opens the brain at a step that fits. null until the fit has said it can't.
const BREAKDOWN = /\|\s*-\s*((?:CUDA|ROCm|HIP|Vulkan|SYCL)\d+)[^|]*\|\s*\d+\s*=\s*\d+\s*\+\s*\(\s*\d+\s*=\s*[\d.]+\s*\+\s*[\d.]+\s*\+\s*([\d.]+)\s*\)/g;
export function fitPlanEarly({ log = '', ub = DEFAULT_UB, ctx = 0 } = {}) {
  const text = String(log || '');
  const at = text.search(/still a total deficit of \d+ MiB/);
  if (at < 0) return null;
  const lines = [...text.slice(0, at).matchAll(BREAKDOWN)];
  if (!lines.length) return null;
  const last = lines.at(-1);
  return planFrom({ dev: last[1], compute: Number(last[2]) || 0, short: fitDeficitMiB(text.slice(0, text.indexOf('\n', at) < 0 ? text.length : text.indexOf('\n', at))), ub, ctx });
}
// How far GUPPI may raise the step again for a long read: the room the fit leaves over our margin, at the brain's own
// working memory per token of step. GUPPI still steps back the moment the engine says the card is short.
export const STEP_FIT_GROW_MIB = 512;
export function growCap({ ub = DEFAULT_UB, perUbMiB = 0, roomMiB = STEP_FIT_GROW_MIB } = {}) {
  if (!(perUbMiB > 0)) return ub;
  let cap = ub;
  while ((cap * 2 - ub) * perUbMiB <= roomMiB) cap *= 2;
  return cap;
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
