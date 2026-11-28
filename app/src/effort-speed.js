// How much longer each Effort level takes than Minimus (Low), for a brain family (16 Nov 2026, the owner's plan).
// The numbers come from the job benchmark (PR #285): the same jobs at each level, on one brain of the family, with
// the time per job divided by Minimus's. They are measured only once a family is chosen (the tentative pick is the
// current default, stock Qwen), so the table starts empty and the Effort button shows no speed until it has one.
// Each entry: { level: times as long as Minimus }, e.g. 'qwen3.5': { medium: 1.4, high: 2.2, extreme: 6 }.
import { familyOf } from './model-family.js';

export const EFFORT_SPEED = {};

// The speeds for the main brain's family, or null when that family hasn't been measured.
export function effortSpeed(model, table = EFFORT_SPEED) {
  const family = familyOf(model);
  const t = family && table[family];
  if (!t) return null;
  const out = { family, low: 1 };
  for (const k of ['medium', 'high', 'extreme']) if (Number(t[k]) > 0) out[k] = Math.round(Number(t[k]) * 10) / 10;
  return out;
}
