// 1.5.138: the order of the sections in Now running (Tasks, Bob-Net, Downloads, Memory, Bob's thinking). Drag a
// section by its grip, or use the grip's Move up / Move down, and the order is remembered in this window
// (localStorage bob-now-order). Kept apart from layout.js so the tests can check it.
export const DEFAULT_ORDER = ['tasks', 'net', 'downloads', 'memory', 'graph', 'mind'];
export const SECTION_NAME = { tasks: 'Tasks', net: 'Bob-Net', downloads: 'Downloads', memory: 'Memory', graph: 'Resource use over time', mind: 'Bob\'s thinking' };

// A saved order (a comma list or an array) made safe: unknown ids dropped, missing ones added at the end in their
// usual place, so a section added in a later version still shows up.
export function applyOrder(saved) {
  const list = Array.isArray(saved) ? saved : String(saved || '').split(',');
  const out = list.map((s) => String(s).trim()).filter((s, i, a) => DEFAULT_ORDER.includes(s) && a.indexOf(s) === i);
  for (const id of DEFAULT_ORDER) if (!out.includes(id)) out.push(id);
  return out;
}

// The order after moving one section a step up (dir -1) or down (dir 1); unchanged at the ends.
export function moveId(order, id, dir) {
  const i = order.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order.slice();
  const out = order.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// The order after dropping `id` in front of `before` (null: at the end).
export function dropBefore(order, id, before) {
  const out = order.filter((x) => x !== id);
  const at = before == null ? out.length : out.indexOf(before);
  out.splice(at < 0 ? out.length : at, 0, id);
  return out;
}
