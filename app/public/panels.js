// 1.5.210: panels you build yourself. Bob starts with none: the chat has the whole window, and everything that used
// to sit in Now running stays in the Now running drawer (the status line under the typing box opens it).
// Each Now running section is a module. Put any of them in the left or the right panel ("Put in" on its title line),
// and give each panel a state: Expanded, Collapsed (a thin strip of names; press one to open the panel) or Hidden.
// A panel with no modules never shows. While a panel is hidden, or on a phone (no room beside the chat), its modules
// sit in Now running instead, so nothing is ever out of reach. Remembered in this window only (localStorage bob-panels), like the rest of
// the layout. Display only: nothing here talks to the brain, and a module only polls while it can be seen.
import { DEFAULT_ORDER, SECTION_NAME } from './now-sections.js';

export const SIDES = ['left', 'right'];
export const STATES = ['expanded', 'collapsed', 'hidden'];
export const STATE_NAME = { expanded: 'Expanded', collapsed: 'Collapsed', hidden: 'Hidden' };
export const SIDE_NAME = { left: 'Left panel', right: 'Right panel' };
export const KEY = 'bob-panels';

// Both panels empty and hidden: what a new install starts with.
export const empty = () => ({ left: { state: 'hidden', mods: [] }, right: { state: 'hidden', mods: [] } });

// A saved value (JSON text or an object) made safe: unknown modules and states dropped, a module in one place only.
export function readPanels(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const out = empty(), seen = new Set();
  if (!v || typeof v !== 'object') return out;
  for (const side of SIDES) {
    const p = v[side];
    if (!p || typeof p !== 'object') continue;
    if (STATES.includes(p.state)) out[side].state = p.state;
    for (const id of Array.isArray(p.mods) ? p.mods : []) if (DEFAULT_ORDER.includes(id) && !seen.has(id)) { seen.add(id); out[side].mods.push(id); }
  }
  return out;
}

// Where a module is: 'left', 'right' or '' (the Now running drawer).
export const whereIs = (p, id) => SIDES.find((s) => p[s].mods.includes(id)) || '';

// Put a module in a panel ('' = back to the drawer). The first module in a hidden panel opens it, so the pick shows.
export function place(p, id, side) {
  const out = readPanels(p);
  if (!DEFAULT_ORDER.includes(id)) return out;
  for (const s of SIDES) out[s].mods = out[s].mods.filter((m) => m !== id);
  if (SIDES.includes(side)) {
    out[side].mods.push(id);
    if (out[side].mods.length === 1 && out[side].state === 'hidden') out[side].state = 'expanded';
  }
  return out;
}

export function setState(p, side, state) {
  const out = readPanels(p);
  if (SIDES.includes(side) && STATES.includes(state)) out[side].state = state;
  return out;
}

// What shows on screen for a panel: nothing without modules or when hidden.
export const showing = (p, side, phone = false) => (!phone && p[side].mods.length && p[side].state !== 'hidden' ? p[side].state : 'none');
// A module can be seen (so it may poll) when its panel is expanded. Collapsed panels show names only.
export const visibleIn = (p, id, phone = false) => { const s = whereIs(p, id); return Boolean(s) && showing(p, s, phone) === 'expanded'; };
export const PHONE_MAX = 640;

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

export function createPanels({ changed = () => {} } = {}) {
  const drawer = $('nowSections'), body = document.body, say = $('panelSay');
  const box = { left: $('panelLeft'), right: $('panelRight') };
  if (!drawer || !box.left || !box.right) return { visible: () => false, where: () => '' };
  let p = readPanels(store.get(KEY));
  const phone = () => window.innerWidth <= PHONE_MAX;
  const sec = (id) => document.querySelector(`section[data-sec="${id}"]`);

  // "Put in" on every module's title line: Now running, Left panel or Right panel.
  for (const id of DEFAULT_ORDER) {
    const head = sec(id)?.querySelector('.now-sec');
    if (!head || head.querySelector('.put-in')) continue;
    const label = document.createElement('label');
    label.className = 'put-in';
    label.innerHTML = `<span class="sr-only">Put ${SECTION_NAME[id]} in</span><select data-putin="${id}" title="Where ${SECTION_NAME[id]} shows: in Now running, or in a panel of its own beside the chat"><option value="">Now running</option><option value="left">Left panel</option><option value="right">Right panel</option></select>`;
    head.append(label);
  }

  function headHtml(side) {
    const st = p[side].state;
    return `<div class="panel-head"><strong>${SIDE_NAME[side]}</strong><span class="ctx-fill"></span>
      <span class="panel-states" role="radiogroup" aria-label="${SIDE_NAME[side]}">${STATES.map((s) => `<button type="button" class="mini" role="radio" aria-checked="${s === st}" data-pstate="${s}" data-side="${side}">${STATE_NAME[s]}</button>`).join('')}</span></div>`;
  }

  function draw() {
    for (const side of SIDES) {
      const el = box[side], show = showing(p, side, phone());
      el.hidden = show === 'none';
      el.dataset.state = show;
      body.classList.toggle(`panel-${side}`, show !== 'none');
      body.classList.toggle(`panel-${side}-collapsed`, show === 'collapsed');
      let head = el.querySelector(':scope > .panel-head');
      if (head) head.remove();
      el.insertAdjacentHTML('afterbegin', headHtml(side));
      let strip = el.querySelector(':scope > .panel-strip');
      if (!strip) { strip = document.createElement('div'); strip.className = 'panel-strip'; el.append(strip); }
      strip.innerHTML = p[side].mods.map((id) => `<button type="button" class="mini" data-popen="${side}">${SECTION_NAME[id]}</button>`).join('');
      strip.hidden = show !== 'collapsed';
      let mods = el.querySelector(':scope > .panel-mods');
      if (!mods) { mods = document.createElement('div'); mods.className = 'panel-mods'; el.append(mods); }
      if (show !== 'none') for (const id of p[side].mods) { const s = sec(id); if (s && s.parentElement !== mods) mods.append(s); }
      mods.hidden = show !== 'expanded';
    }
    // Modules that left a panel go back into Now running, in their usual order.
    for (const id of DEFAULT_ORDER) { const s = sec(id), w = whereIs(p, id); if (s && (!w || showing(p, w, phone()) === 'none') && s.parentElement !== drawer) drawer.append(s); }
    for (const sel of document.querySelectorAll('[data-putin]')) sel.value = whereIs(p, sel.dataset.putin);
    // The panels row in Now running: always there, so a hidden panel can always be brought back.
    const row = $('panelRow');
    if (row) row.innerHTML = SIDES.map((side) => `<span class="panel-row-side"><span>${SIDE_NAME[side]}${p[side].mods.length ? ` (${p[side].mods.length})` : ' (empty)'}:</span> ${STATES.map((s) => `<button type="button" class="mini" aria-pressed="${p[side].state === s}" data-pstate="${s}" data-side="${side}">${STATE_NAME[s]}</button>`).join('')}</span>`).join('');
    changed();
  }

  function save(next, words) { p = next; store.set(KEY, JSON.stringify(p)); draw(); if (say && words) say.textContent = words; }

  document.addEventListener('change', (e) => {
    const sel = e.target.closest?.('[data-putin]');
    if (!sel) return;
    const id = sel.dataset.putin, side = sel.value;
    save(place(p, id, side), `${SECTION_NAME[id]} is ${side ? `in the ${SIDE_NAME[side].toLowerCase()}` : 'back in Now running'}.`);
    sel.focus();
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-pstate], [data-popen]');
    if (!b) return;
    if (b.dataset.popen) { save(setState(p, b.dataset.popen, 'expanded'), `${SIDE_NAME[b.dataset.popen]} expanded.`); return; }
    const side = b.dataset.side, st = b.dataset.pstate;
    save(setState(p, side, st), `${SIDE_NAME[side]}: ${STATE_NAME[st].toLowerCase()}.${!p[side].mods.length ? ' It shows once a module is in it.' : ''}`);
  });
  let wasPhone = phone();
  window.addEventListener('resize', () => { if (phone() !== wasPhone) { wasPhone = phone(); draw(); } });
  draw();
  // 1.5.216: bring a module into view in its panel (a collapsed panel expands); false when it lives in Now running or
  // its panel can't show (hidden, or a phone), so the caller shows it in Now running instead.
  function open(id) {
    const side = whereIs(p, id);
    if (!side || phone() || p[side].state === 'hidden') return false;
    if (p[side].state === 'collapsed') save(setState(p, side, 'expanded'), `${SIDE_NAME[side]} expanded.`);
    return true;
  }
  return { visible: (id) => visibleIn(p, id, phone()), where: (id) => whereIs(p, id), get: () => readPanels(p), open };
}
