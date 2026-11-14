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

// tools (1.5.210 Lamplight): [{ id, icon, label, st? }] - the menu buttons the Lamplight layout moves in here.
// Each one presses the same button it stands for (data-bobtool = that button's id). session: { options, value }.
// users (👥 Users on): { on, current, currentName, ownerName } - one "Switch user" line under Get models, saying who's
// signed in. It opens the Switch user page (users-switch.js). Off: nothing shows.
export function usersPart(users) {
  if (!users?.on) return '';
  const who = (users.current || 'main') === 'main' ? users.ownerName || 'Owner' : users.currentName || 'a user';
  return `<button type="button" role="menuitem" class="bob-menu-item" data-bobmenu="users"><span aria-hidden="true">👥</span> <strong>Switch user</strong><br><span class="muted">Signed in: ${esc(who)}</span></button>`;
}
export function bobMenuHtml(status, { said = '', names = {}, tools = [], session = null, users = null } = {}) {
  const doing = said || status?.detail || 'Getting the fire going...';
  const door = (id, icon, label, what) => `<button type="button" role="menuitem" class="bob-menu-item" data-bobmenu="${id}"><span aria-hidden="true">${icon}</span> <strong>${esc(label)}</strong><br><span class="muted">${esc(what)}</span></button>`;
  return `<p class="bob-menu-now" role="status"><strong>${esc(doing)}</strong><br><span class="muted">${esc(status ? loadedLine(status, names) : 'Checking which brain is loaded…')}</span></p>
    ${door('brains', '🧠', 'Brains', 'Which brain does what, Set up and Calibrate')}
    ${door('style', '🎨', 'Style', 'My look, colours and animations')}
    ${door('models', '📚', 'Get models', 'The catalogue and every model shop')}
    ${usersPart(users)}${tools.length ? `
    <div class="bob-menu-tools" role="group" aria-label="More of my menu">${tools.map((t) => `<button type="button" role="menuitem" class="bob-menu-tool" data-bobtool="${esc(t.id)}"><span aria-hidden="true">${t.icon}</span> ${esc(t.label)}${t.st ? ` <span class="muted">${esc(t.st)}</span>` : ''}</button>`).join('')}</div>` : ''}${session && session.options.length ? `
    <label class="bob-menu-session">Session <select data-bobsession aria-label="Session">${session.options.map((o) => `<option value="${esc(o.value)}"${o.value === session.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>` : ''}`;
}

// anchor: Bob's picture. doors: { brains(), style(), models() }. getStatus(): the latest status, names(): labels.
export function createBobMenu({ anchor, doors, getStatus, getNames, saidNow, getTools = () => [], getSession = () => null, pickTool = () => {}, pickSession = () => {}, getUsers = () => null }) {
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
  const draw = (status) => { box.innerHTML = bobMenuHtml(status, { said: saidNow?.() || '', names, tools: getTools(), session: getSession(), users: getUsers() }); };
  const close = (back = false) => { if (box.hidden) return; box.hidden = true; anchor.setAttribute('aria-expanded', 'false'); if (back) (at || anchor).focus(); };
  let at = anchor;
  const open = async (from) => {
    at = from instanceof Element ? from : anchor;
    draw(null);
    const r = at.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.round(r.left))}px`;
    box.style.top = `${Math.round(r.bottom + 6)}px`;
    box.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    box.querySelector('button')?.focus();
    const [status, got] = await Promise.all([getStatus().catch(() => ({ loaded: [] })), getNames().catch(() => names)]);
    names = got || names;
    if (box.hidden) return;
    const focused = [...box.querySelectorAll('button, select')].indexOf(document.activeElement);
    draw(status);
    if (focused >= 0) box.querySelectorAll('button, select')[focused]?.focus();
  };
  const toggle = (from) => (box.hidden ? open(from) : close(true));
  anchor.addEventListener('click', () => toggle());
  anchor.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  box.addEventListener('click', (e) => {
    const t = e.target.closest('[data-bobtool]');
    if (t) { close(); pickTool(t.dataset.bobtool); return; }
    const b = e.target.closest('[data-bobmenu]'); if (!b) return; close(); doors[b.dataset.bobmenu]?.();
  });
  box.addEventListener('change', (e) => { if (e.target.matches('[data-bobsession]')) pickSession(e.target.value); });
  box.addEventListener('keydown', (e) => {
    const items = [...box.querySelectorAll('button, select')], i = items.indexOf(document.activeElement);
    if (document.activeElement?.tagName === 'SELECT' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!box.hidden && !box.contains(e.target) && e.target !== anchor && e.target !== at && !at?.contains?.(e.target)) close(); });
  return { open, close, toggle };
}
