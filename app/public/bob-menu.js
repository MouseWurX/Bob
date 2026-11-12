// 1.5.207 The small menu on Bob's picture (the owner's pick): what Bob is doing, the brain that is loaded, and
// doors to Settings, Brains, Style and Get models.
// bobMenuHtml is a pure builder (tests give it made-up status); createBobMenu wires one picture to it.
import { esc } from './util.js';

// The brains loaded right now, by the names the owner knows them by. names = { "<model>": "Label" }.
export function loadedLine(status, names = {}) {
  const list = (status?.loaded || []).map((m) => names[m.name] || m.name).filter(Boolean);
  if (!list.length) return 'No brain loaded. I load one when you ask me something.';
  return `${list.length === 1 ? 'Brain loaded' : 'Brains loaded'}: ${list.join(', ')}`;
}

export function bobMenuHtml(status, { said = '', names = {} } = {}) {
  const doing = said || status?.detail || 'Getting the fire going...';
  const door = (id, icon, label, what) => `<button type="button" role="menuitem" class="bob-menu-item" data-bobmenu="${id}"><span aria-hidden="true">${icon}</span> <strong>${esc(label)}</strong><br><span class="muted">${esc(what)}</span></button>`;
  return `<p class="bob-menu-now" role="status"><strong>${esc(doing)}</strong><br><span class="muted">${esc(status ? loadedLine(status, names) : 'Checking which brain is loaded…')}</span></p>
    ${door('brains', '🧠', 'Brains', 'Which brain does what, Set up and Calibrate')}
    ${door('style', '🎨', 'Style', 'My look, colours and animations')}
    ${door('models', '📚', 'Get models', 'The catalogue and every model shop')}`;
}

// anchor: Bob's picture. doors: { brains(), style(), models() }. getStatus(): the latest status, names(): labels.
export function createBobMenu({ anchor, doors, getStatus, getNames, saidNow }) {
  const box = document.createElement('div');
  box.className = 'bob-menu';
  box.id = 'bobMenu';
  box.setAttribute('role', 'menu');
  box.setAttribute('aria-label', 'Bob');
  box.hidden = true;
  document.body.appendChild(box); // on the page itself, so the folding menu can't cut it off
  anchor.setAttribute('aria-haspopup', 'menu');
  anchor.setAttribute('aria-expanded', 'false');
  let names = {};
  const draw = (status) => { box.innerHTML = bobMenuHtml(status, { said: saidNow?.() || '', names }); };
  const close = (back = false) => { if (box.hidden) return; box.hidden = true; anchor.setAttribute('aria-expanded', 'false'); if (back) anchor.focus(); };
  const open = async () => {
    draw(null);
    const r = anchor.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.round(r.left))}px`;
    box.style.top = `${Math.round(r.bottom + 6)}px`;
    box.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    box.querySelector('button')?.focus();
    const [status, got] = await Promise.all([getStatus().catch(() => ({ loaded: [] })), getNames().catch(() => names)]);
    names = got || names;
    if (box.hidden) return;
    const at = [...box.querySelectorAll('button')].indexOf(document.activeElement);
    draw(status);
    if (at >= 0) box.querySelectorAll('button')[at]?.focus();
  };
  const toggle = () => (box.hidden ? open() : close(true));
  anchor.addEventListener('click', toggle);
  anchor.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-bobmenu]'); if (!b) return; close(); doors[b.dataset.bobmenu]?.(); });
  box.addEventListener('keydown', (e) => {
    const items = [...box.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!box.hidden && !box.contains(e.target) && e.target !== anchor) close(); });
  return { open, close, toggle };
}
