// 1.5.7: the Effort control above the chat box. Low (quick, the default), Medium (1.5.12: one big brain), High (Bob calls a moot: a big brain drafts
// and his reviewer copy checks it), Extreme (the reviewer also checks each code change; slowest).
// 1.5.41: one button, "Effort Low ▾", opens the four choices; picking one folds them away again.
// It goes back to Low each time Bob starts, so the big brains never load because of a choice made last week.
const $ = (id) => document.getElementById(id);
const KEY = 'bob-effort';
export const HINTS = {
  low: 'A quick answer, without thinking it over first. Nothing extra loads.',
  medium: 'One big brain thinks it through on the graphics card. No second check. Takes a little longer.',
  high: 'A big brain drafts the answer, then the Review brain checks it. Slower. Big brains are freed afterwards.',
  extreme: 'Like High, and for code the Review brain also checks the research and the plan before anything changes. Slowest: every check swaps brains (about 20 seconds each).'
};
const LEVELS = Object.keys(HINTS);
// 1.5.23: the Gaming session keeps Effort on Low; the other levels are greyed out with this hint.
export const GAMING_HINT = 'Gaming keeps the graphics card free. Switch session to use more effort.';

export function createEffort() {
  const box = $('effort');
  const btns = [...box.querySelectorAll('[data-effort]')];
  const toggle = $('effortBtn'), choices = $('effortChoices'), nowEl = $('effortNow');
  const isOpen = () => Boolean(choices && !choices.hidden);
  function open(on, focus = true) {
    if (!choices) return;
    if (on && locked) return; // Gaming: Effort stays on Low, the button says so
    choices.hidden = !on; toggle?.setAttribute('aria-expanded', String(on));
    const arrow = $('effortArrow'); if (arrow) arrow.textContent = on ? '▴' : '▾';
    if (on && focus) btns.find((b) => b.getAttribute('aria-checked') === 'true')?.focus();
    if (!on && focus) toggle?.focus();
  }
  if (toggle) toggle.onclick = () => open(!isOpen());
  document.addEventListener('click', (e) => { if (isOpen() && !box.contains(e.target)) open(false, false); });
  let level = 'low';
  let locked = false;
  try { const v = sessionStorage.getItem(KEY); if (LEVELS.includes(v)) level = v; } catch {}
  function draw() {
    const now = locked ? 'low' : level;
    for (const b of btns) {
      const on = b.dataset.effort === now;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
      const off = locked && b.dataset.effort !== 'low';
      b.disabled = off; b.dataset.tip = off ? GAMING_HINT : HINTS[b.dataset.effort]; // 1.5.56: in the bubble, not under the row
    }
    // 1.5.56: only the Gaming lock stays written out; what each level does is in the bubble on the Effort button.
    const hint = $('effortHint'); hint.textContent = locked ? GAMING_HINT : `Effort ${level}: ${HINTS[level]}`; hint.classList.toggle('sr-only', !locked);
    box.dataset.level = now;
    if (nowEl) nowEl.textContent = `${btns.find((b) => b.dataset.effort === now)?.querySelector('b')?.textContent || now}${locked ? ' · locked in Gaming' : ''}`;
    if (toggle) { toggle.disabled = locked; toggle.dataset.tip = locked ? GAMING_HINT : HINTS[level]; }
    if (locked && isOpen()) open(false, false);
  }
  function set(v, focus = false) {
    if (!LEVELS.includes(v) || (locked && v !== 'low')) return;
    level = v;
    try { sessionStorage.setItem(KEY, v); } catch {}
    draw();
    if (focus) btns.find((b) => b.dataset.effort === v)?.focus();
  }
  for (const b of btns) b.onclick = () => { set(b.dataset.effort); open(false); };
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); open(false); return; }
    if (!isOpen() || !choices.contains(e.target)) return;
    // Arrows move between the four choices; Enter (or Space) picks the one with focus.
    const usable = btns.filter((b) => !b.disabled);
    const i = Math.max(0, usable.indexOf(document.activeElement));
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); usable[Math.min(usable.length - 1, i + 1)]?.focus(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); usable[Math.max(0, i - 1)]?.focus(); }
  });
  draw();
  // Gaming session on: Effort stays on Low. Off again: the level picked before comes back.
  function lock(on) { locked = Boolean(on); draw(); }
  return { get: () => (locked ? 'low' : level), set, lock, locked: () => locked, open };
}
