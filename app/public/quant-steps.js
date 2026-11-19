// Nov 19 2026 (the owner: "With larger moe models we can go to q2 or q1.25, I think having the quantization level is a
// big one up we could have. As long as perplexity doesnt drift, +/-3 or +/-5 should be checked for answer quality").
// A quant level (quantization level) is how tightly a brain's file is packed: Q4 is Bob's usual, Q3, Q2 and the 1-bit
// class (IQ1, TQ1) are smaller and a little less sharp. Pure functions, no DOM, so the tests can run them.
//
// The rules, all in code:
//   - Brains under 35B stay at their usual file (Q4 or better). Only brains of 35B and up get the menu.
//   - A lower level is a catalogue entry of its own with quantOf (or squeezedOf) naming the usual one, pinned files
//     like any other, and quantCheck: { drift, jobs, report } from the Calibrate thread's checks.
//       drift: how much worse its perplexity is than the usual file, in percent, on the worst split (null: not checked).
//       jobs:  the real-jobs check, 'pass' or 'fail' (null: not run).
//   - Within 3%: passes. 3 to 5%: offered as a smaller option only once it also passed real jobs. Over 5%, or failed
//     real jobs: never offered. Not checked yet: hidden unless "Show quant levels not checked yet" is on.
//   - The usual file is always the default. A lower level is never Bob's pick: you choose it.
//   - The whole menu is off unless Settings, Brains, "Pick a quant level for big brains" is on.

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
    : { verdict: 'needs-jobs', why: `${pct} perplexity drift: needs the real-jobs check before I offer it.` };
  return { verdict: 'fail', why: `Failed: ${pct} perplexity drift, over ${DRIFT_MAX}%.` };
}

const OFFERED = new Set(['pass', 'smaller']);
const LABEL = { pass: 'passed', smaller: 'smaller option', 'needs-jobs': 'not checked on real jobs yet', untested: 'not checked yet' };

// The quant levels a brain's row can switch between: the usual file first, then each lower level that may be shown,
// biggest first. [] when the menu is off, the brain is under 35B, or nothing but the usual file would show.
// options: { on: setting quantPicker, untested: setting quantUntested }
// -> [{ id, quant, sizeGB, verdict, why, usual, label, entry }]
export function stepChoices(entry, models = [], { on = false, untested = false } = {}) {
  if (on !== true || !entry) return [];
  const parentId = stepParent(entry);
  const usual = parentId ? (models || []).find((m) => m.id === parentId) : entry;
  if (!usual || !(Number(usual.params) >= QUANT_MIN_PARAMS)) return [];
  const steps = (models || []).filter((m) => m.id !== usual.id && stepParent(m) === usual.id && m.files?.length)
    .map((m) => ({ m, ...quantGate(m.quantCheck) }))
    .filter((s) => OFFERED.has(s.verdict) || (untested === true && (s.verdict === 'untested' || s.verdict === 'needs-jobs')) || s.m.id === entry.id)
    .sort((a, b) => (Number(b.m.sizeGB) || 0) - (Number(a.m.sizeGB) || 0));
  if (!steps.length) return [];
  const row = (m, verdict, why, isUsual) => {
    const q = quantName(m) || (isUsual ? 'usual' : '?');
    const size = m.sizeGB != null ? `${m.sizeGB} GB` : '';
    const note = isUsual ? 'usual' : LABEL[verdict] || verdict;
    return { id: m.id, quant: q, sizeGB: m.sizeGB ?? null, verdict, why, usual: isUsual, entry: m, label: [q, size].filter(Boolean).join(' · ') + ` (${note})` };
  };
  return [row(usual, 'pass', 'The usual file: what I use unless you pick another.', true), ...steps.map((s) => row(s.m, s.verdict, s.why, false))];
}
