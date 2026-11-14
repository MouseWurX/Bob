// 1.5.213 (the owner, on a laptop: "wont let me set up bob net, still options that you can't enable, tick boxes that
// wont work"): a switch Bob turns down snapped back with its reason printed far below, out of sight. The reason now
// sits right under the switch that was pressed, read out by screen readers, until the next change.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function sayRefused(box, selector, text) {
  if (!box || !selector || !text) return;
  const input = box.querySelector(selector);
  const at = input?.closest('label') || input;
  if (!at) return;
  at.insertAdjacentHTML('afterend', `<p class="refused" role="alert">${esc(text)}</p>`);
}
// The switch a change event came from, as a selector that finds it again after the box is drawn anew.
export function switchSelector(el) {
  const k = el && [...el.attributes].map((a) => a.name).find((n) => n.startsWith('data-'));
  return k ? `[${k}]` : '';
}
