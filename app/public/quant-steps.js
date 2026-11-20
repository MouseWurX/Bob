// Nov 19 2026 (the owner: "With larger moe models we can go to q2 or q1.25, I think having the quantization level is a
// big one up we could have. As long as perplexity doesnt drift, +/-3 or +/-5 should be checked for answer quality").
// A quant level (quantization level) is how tightly a brain's file is packed: Q4 is Bob's usual, Q3, Q2 and the 1-bit
// class (IQ1, TQ1) are smaller and a little less sharp. Pure functions, no DOM, so the tests can run them.
//
// Nov 20 2026 (the owner: "I think that quality should be a choice the user makes. We can recommend and give our test
// results but we cant control their actions."). The rules, all in code:
//   - Every brain with a lower level gets the menu, whatever its size, and every level is listed. Nothing is hidden.
//   - A lower level is a catalogue entry of its own with quantOf (or squeezedOf) naming the usual one, pinned files
//     like any other, and quantCheck: { drift, jobs, report } from the Calibrate thread's checks.
//       drift: how much worse its perplexity is than the usual file, in percent, on the worst split (null: not checked).
//       jobs:  the real-jobs check, 'pass' or 'fail' (null: not run).
//   - Each level says how it did and whether Bob recommends it. Recommended: a brain of 35B or more, within 3%, or 3 to
//     5% plus a passed real-jobs check. Over 5%, a failed real-jobs check, not checked yet, or a brain under 35B: listed
//     with the reason, not recommended. The choice is yours.
//   - The usual file is always the default. A lower level is never Bob's pick: you choose it.
//   - The whole menu is off unless Settings, Brains, "Pick a quant level" is on.

import { quantOf } from './place.js';

export const QUANT_MIN_PARAMS = 35;
export const DRIFT_PASS = 3;
export const DRIFT_MAX = 5;

// The quant level a file is packed at ("Q3_K_XL"), the same reading as the catalogue's Size line.
export const quantName = (m) => quantOf(m);

// The usual entry a lower level belongs to (its id), or ''.
export const stepParent = (m) => String(m?.quantOf || m?.squeezedOf || '');
// A pure quant step: listed only under its usual brain, never on its own in the catalogue.
export const isQuantStep = (m) => Boolean(m?.quantOf);

// One step's verdict from its check. -> { verdict, why }
//   verdict: 'pass' | 'smaller' | 'needs-jobs' | 'fail' | 'untested'
export function quantGate(check) {
  const d = Number(check?.drift);
  if (check?.drift == null || !Number.isFinite(d)) return { verdict: 'untested', why: 'Not checked yet.' };
  const off = Math.abs(d), pct = `${Math.round(off * 10) / 10}%`;
  if (check.jobs === 'fail') return { verdict: 'fail', why: `Failed the real-jobs check (${pct} perplexity drift).` };
  if (off <= DRIFT_PASS) return { verdict: 'pass', why: `Passed: ${pct} perplexity drift, within ${DRIFT_PASS}%.` };
  if (off <= DRIFT_MAX) return check.jobs === 'pass'
    ? { verdict: 'smaller', why: `Smaller option: ${pct} perplexity drift, and it passed the real-jobs check.` }
    : { verdict: 'needs-jobs', why: `${pct} perplexity drift: I recommend it only once it passes the real-jobs check.` };
  return { verdict: 'fail', why: `Failed: ${pct} perplexity drift, over ${DRIFT_MAX}%.` };
}

const RECOMMENDED = new Set(['pass', 'smaller']);
const LABEL = { pass: 'passed', smaller: 'smaller option', 'needs-jobs': 'not checked on real jobs yet', untested: 'not checked yet', fail: 'failed my check' };

// The quant levels a brain's row can switch between: the usual file first, then every lower level, biggest first,
// each with its result and whether I recommend it. [] when the menu is off or the brain has no lower level.
// options: { on: setting quantPicker }
// -> [{ id, quant, sizeGB, verdict, why, usual, recommended, label, entry }]
export function stepChoices(entry, models = [], { on = false } = {}) {
  if (on !== true || !entry) return [];
  const parentId = stepParent(entry);
  const usual = parentId ? (models || []).find((m) => m.id === parentId) : entry;
  if (!usual) return [];
  const big = Number(usual.params) >= QUANT_MIN_PARAMS;
  const steps = (models || []).filter((m) => m.id !== usual.id && stepParent(m) === usual.id && m.files?.length)
    .map((m) => ({ m, ...quantGate(m.quantCheck) }))
    .sort((a, b) => (Number(b.m.sizeGB) || 0) - (Number(a.m.sizeGB) || 0));
  if (!steps.length) return [];
  const row = (m, verdict, why, isUsual) => {
    const q = quantName(m) || (isUsual ? 'usual' : '?');
    const size = m.sizeGB != null ? `${m.sizeGB} GB` : '';
    const recommended = isUsual || (big && RECOMMENDED.has(verdict));
    const small = !isUsual && !big ? ` Brains under ${QUANT_MIN_PARAMS}B usually lose more below Q4, so I don't recommend it.` : '';
    const note = isUsual ? 'usual' : `${LABEL[verdict] || verdict}${recommended ? '' : ', not recommended'}`;
    return { id: m.id, quant: q, sizeGB: m.sizeGB ?? null, verdict, why: why + small, usual: isUsual, recommended, entry: m, label: [q, size].filter(Boolean).join(' · ') + ` (${note})` };
  };
  return [row(usual, 'pass', 'The usual file: what I use unless you pick another.', true), ...steps.map((s) => row(s.m, s.verdict, s.why, false))];
}
