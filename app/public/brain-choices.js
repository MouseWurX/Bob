// Nov 18 2026 (the owner: "it should all be unified"): one rule for which brains a thinking job can use, shared by the
// Brains page, the plain list, the Senses panel and the catalogue. Pure functions, no DOM, so the tests can run them.
//   made:  the brain's maker (or Bob's list) says it was made for the job. Only these are ever ★ Recommended.
//   ok:    you may pick it for the job. Any brain you have that chats can take any thinking job ("i want to select any
//          brain i want"), except two that need something a brain either has or hasn't: Gaming (only brains timed on a
//          busy processor, the owner's rule) and Seeing pictures (it has to see).
import { canDo } from './fit.js';

export const STRICT_JOBS = new Set(['gaming', 'eyes']);
const BRAIN_CATS = ['chat', 'coding', 'vision'];

// Can it chat for Bob at all? Bob's list says by its category; a brain he doesn't know, by what its engine said.
export function chats({ entry, caps } = {}) {
  if (entry) return entry.own === true || BRAIN_CATS.includes(entry.category);
  const c = caps || [];
  return !c.length || c.includes('completion');
}

export function takesJob(slotId, k = {}) {
  const made = canDo(slotId, k);
  if (made || STRICT_JOBS.has(slotId)) return { ok: made, made };
  return { ok: chats(k), made: false };
}

// The brains on this computer a job can use, in one order everywhere: the one in the job now, then the ones made for
// the job, then the rest by name. Hidden: Active off in the catalogue, and the naughty list while its switch is off.
// options = Model roles' llm list ([{ value, label, caps }]); entryOf = (value) => catalogue entry or null.
// -> [{ value, label, entry, made }]
export function brainChoices(slotId, { options = [], entryOf = () => null, current = '', isActive = () => true, naughtyOn = false } = {}) {
  const out = [];
  for (const o of options || []) {
    const entry = entryOf(o.value);
    const t = takesJob(slotId, { entry, name: o.value, caps: o.caps });
    const mine = o.value === current;
    if (!mine && !t.ok) continue;
    if (!mine && entry?.naughty === true && !naughtyOn) continue;
    if (!mine && !isActive({ entry, value: o.value, installed: true })) continue;
    out.push({ value: o.value, label: o.label || entry?.name || o.value, entry, made: t.made });
  }
  // The brain in the job now always shows, even when its file isn't here (any more), so the menu never shows another
  // brain as if it were the one picked.
  if (current && !out.some((c) => c.value === current)) { const entry = entryOf(current); out.push({ value: current, label: `${entry?.name || current} (not on this replicant matrix)`, entry, made: true, missing: true }); }
  const rank = (c) => (c.value === current ? 0 : c.made ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || String(a.label).localeCompare(String(b.label)));
}

// The menu itself, the same on every page: <option>s, with brains not made for the job marked so, never hidden.
export function choiceOptions(list, current = '', esc = (s) => String(s)) {
  return list.map((c) => `<option value="${esc(c.value)}"${c.value === current ? ' selected' : ''}>${esc(c.label)}${c.made ? '' : ' (not made for this job)'}</option>`).join('');
}
