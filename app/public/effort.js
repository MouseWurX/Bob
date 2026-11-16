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
// 16 Nov 2026 (solo-effort.js): with "Effort on one brain" on, the same four buttons change how the main brain works.
// Extreme is called Max there (the owner's word). The level saved is still 'extreme'.
export const SOLO_HINTS = {
  low: 'Thinking off for everything. The quickest.',
  medium: 'Thinks to plan, then does the steps without thinking.',
  high: 'Like Medium, then checks his own work and improves it once, or says what he isn\'t happy with.',
  extreme: 'Thinks throughout. Plans small jobs, checks the plan, does each job on its own, then checks the whole. Slowest.'
};
const SOLO_SMALL = { low: 'Quick', medium: 'Plans', high: 'Checked', extreme: 'Slowest' };
export const levelName = (v, solo = false) => (v === 'extreme' ? (solo ? 'Max' : 'Extreme') : `${v[0].toUpperCase()}${v.slice(1)}`);
const LEVELS = Object.keys(HINTS);
// 1.5.23: the Gaming session keeps Effort on Low; the other levels are greyed out with this hint.
export const GAMING_HINT = 'Gaming keeps the graphics card free. Switch session to use more effort.';

export function createEffort() {
  const box = $('effort');
  const btns = [...box.querySelectorAll('[data-effort]')];
  const toggle = $('effortBtn'), choices = $('effortChoices'), nowEl = $('effortNow');
  const isOpen = () => Boolean(choices && !choices.hidden);
  const home = choices?.parentElement; // .effort-pick, where the choices live when folded
  function open(on, focus = true) {
    if (!choices) return;
    if (on && locked) return; // Gaming: Effort stays on Low, the button says so
    choices.hidden = !on; toggle?.setAttribute('aria-expanded', String(on));
    // Nov 15: on a phone the Effort row scrolls sideways, which hid the choices (the box clipped them). They float above the button instead.
    choices.style.cssText = '';
    if (choices.parentElement !== home) home.appendChild(choices);
    if (on && toggle && getComputedStyle(box).overflowX !== 'visible') {
      document.body.appendChild(choices); // out of the row, so nothing in the chat sits on top of it
      const r = toggle.getBoundingClientRect();
      Object.assign(choices.style, { position: 'fixed', left: `${Math.max(8, Math.round(r.left))}px`, bottom: `${Math.round(innerHeight - r.top + 6)}px`, maxWidth: `${innerWidth - 16}px`, flexWrap: 'wrap' });
    }
    const arrow = $('effortArrow'); if (arrow) arrow.textContent = on ? '▴' : '▾';
    if (on && focus) btns.find((b) => b.getAttribute('aria-checked') === 'true')?.focus();
    if (!on && focus) toggle?.focus();
  }
  if (toggle) toggle.onclick = () => open(!isOpen());
  document.addEventListener('click', (e) => { if (isOpen() && !box.contains(e.target) && !choices.contains(e.target)) open(false, false); });
  let level = 'low';
  let locked = false;
  let solo = false; // "Effort on one brain"
  const hints = () => (solo ? SOLO_HINTS : HINTS);
  const plain = Object.fromEntries(btns.map((b) => [b.dataset.effort, { name: b.querySelector('b')?.textContent || '', small: b.querySelector('small')?.textContent || '' }]));
  try { const v = sessionStorage.getItem(KEY); if (LEVELS.includes(v)) level = v; } catch {}
  function draw() {
    const now = locked ? 'low' : level;
    for (const b of btns) {
      const v = b.dataset.effort, nm = b.querySelector('b'), sm = b.querySelector('small');
      if (nm) nm.textContent = solo ? levelName(v, true) : plain[v].name;
      if (sm) sm.textContent = solo ? SOLO_SMALL[v] : plain[v].small;
      const on = v === now;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
      const off = locked && b.dataset.effort !== 'low';
      b.disabled = off; b.dataset.tip = off ? GAMING_HINT : hints()[b.dataset.effort]; // 1.5.56: in the bubble, not under the row
    }
    // 1.5.56: only the Gaming lock stays written out; what each level does is in the bubble on the Effort button.
    const hint = $('effortHint'); hint.textContent = locked ? GAMING_HINT : `Effort ${levelName(level, solo)}: ${hints()[level]}`; hint.classList.toggle('sr-only', !locked);
    box.dataset.level = now;
    if (nowEl) nowEl.textContent = `${btns.find((b) => b.dataset.effort === now)?.querySelector('b')?.textContent || now}${locked ? ' · locked in Gaming' : ''}`;
    if (toggle) { toggle.disabled = locked; toggle.dataset.tip = locked ? GAMING_HINT : hints()[level]; }
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
  const keys = (e) => {
    if (e.key === 'Escape' && isOpen()) { e.preventDefault(); open(false); return; }
    if (!isOpen() || !choices.contains(e.target)) return;
    // Arrows move between the four choices; Enter (or Space) picks the one with focus.
    const usable = btns.filter((b) => !b.disabled);
    const i = Math.max(0, usable.indexOf(document.activeElement));
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); usable[Math.min(usable.length - 1, i + 1)]?.focus(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); usable[Math.max(0, i - 1)]?.focus(); }
  };
  box.addEventListener('keydown', keys);
  choices?.addEventListener('keydown', (e) => { if (!box.contains(choices)) keys(e); }); // floated out of the row on a phone
  draw();
  // Gaming session on: Effort stays on Low. Off again: the level picked before comes back.
  function lock(on) { locked = Boolean(on); draw(); }
  function setSolo(on) { if (solo === Boolean(on)) return; solo = Boolean(on); draw(); }
  addEventListener('bob-solo-effort', (e) => setSolo(e.detail === true));
  return { get: () => (locked ? 'low' : level), set, lock, locked: () => locked, open, solo: setSolo, name: (v) => levelName(v, solo) };
}
