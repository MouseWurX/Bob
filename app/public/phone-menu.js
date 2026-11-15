// Nov 15 (the owner: "the menu for the phone is horrible", look, size and finding things): on a phone, one menu.
// The Bob button in the bottom bar (and Bob's cube) opens a sheet from the bottom: what Bob is doing, the quick
// switches, Find anything, the pages and the set-up tools as big tiles, then Read aloud, Alerts, Listen and Session.
// Every tile and switch presses the very button it stands for, so nothing behaves differently from the wide layout.
// Display only: nothing here talks to the brain, changes a job or adds a word to what Bob reads.
import { esc } from './util.js';

const $ = (id) => document.getElementById(id);

// [button id, label] - shown only when that button exists and isn't hidden (Lab off hides Lab, and so on).
export const GO_TO = [['chatBtn', 'Chat'], ['tasksBtn', 'Tasks'], ['topicsBtn', 'Topics'], ['madeBtn', 'Made'], ['adventureBtn', 'Adventure'], ['journeyBtn', 'Journey'], ['gamesBtn', 'Games'], ['labBtn', 'Lab']];
export const SET_UP = [['cellarBtn', 'Get models'], ['dlBtn', 'Downloads'], ['tidyBtn', 'Tidy up'], ['shelfBtn', 'References'], ['settingsBtn', 'Settings'], ['styleBtn', 'Style'], ['helpBtn', 'Help'], ['usersBtn', 'Users']];
// The quick switches from the brain label's panel: [button id, short name].
export const QUICK = [['brainFree', 'Free memory'], ['handsBtn', '✋ Hands'], ['freeBtn', '🔓 Autonomy'], ['screenBtn', '🖥 Screen'], ['mindBtn', '💭 Thinking']];
// Toggles that live in the left menu: [button id, label].
export const TOGGLES = [['speak', 'Read aloud'], ['notify', 'Alerts'], ['ear', 'Listen for "Hey Bob"']];

// A pure builder, so tests can give it made-up buttons. btn(id) -> { hidden, icon (svg html), on, st, badge } or null.
export function phoneMenuHtml({ btn, said = '', brain = '', fill = '', session = null }) {
  const shown = (list) => list.map(([id, label]) => ({ id, label, b: btn(id) })).filter((x) => x.b && !x.b.hidden);
  const tile = ({ id, label, b }) => `<button type="button" class="pm-tile${b.on ? ' on' : ''}" data-press="${esc(id)}"${b.on ? ' aria-current="page"' : ''}>${b.icon || ''}<span>${esc(label)}</span>${b.badge ? `<span class="pm-badge">${esc(b.badge)}</span>` : ''}</button>`;
  const chip = ({ id, label, b }) => `<button type="button" class="pm-chip${b.on ? ' on' : ''}" data-press="${esc(id)}" aria-pressed="${b.on ? 'true' : 'false'}">${esc(label)}${b.st ? ` <i>${esc(b.st)}</i>` : ''}</button>`;
  const row = ({ id, label, b }) => `<button type="button" class="pm-row" data-press="${esc(id)}" role="switch" aria-checked="${b.on ? 'true' : 'false'}">${b.icon || ''}<span>${esc(label)}</span><b class="pm-sw" aria-hidden="true"></b></button>`;
  const sub = [brain, fill].filter(Boolean).join(' · ');
  return `<div class="pm-grab" aria-hidden="true"></div>
    <div class="pm-status"><span class="pm-cube" aria-hidden="true"></span><p role="status"><b>${esc(said || 'Bob')}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</p><button type="button" class="pm-close" data-close aria-label="Close the menu">✕</button></div>
    <div class="pm-chips" role="group" aria-label="Quick switches">${shown(QUICK).map(chip).join('')}</div>
    ${btn('findBtn') ? `<button type="button" class="pm-find" data-press="findBtn">${btn('findBtn').icon || ''}<span>Find pages, settings, Help and chats</span></button>` : ''}
    <h3 class="pm-head" id="pm-go">Go to</h3><div class="pm-grid" role="group" aria-labelledby="pm-go">${shown(GO_TO).map(tile).join('')}</div>
    <h3 class="pm-head" id="pm-set">Set up</h3><div class="pm-grid" role="group" aria-labelledby="pm-set">${shown(SET_UP).map(tile).join('')}</div>
    <div class="pm-rows">${shown(TOGGLES).map(row).join('')}${session?.options?.length ? `
      <div class="pm-session" role="radiogroup" aria-label="Session"><span>Session</span><span class="pm-seg">${session.options.map((o) => `<button type="button" role="radio" data-session="${esc(o.value)}" aria-checked="${o.value === session.value ? 'true' : 'false'}">${esc(o.label)}</button>`).join('')}</span></div>` : ''}
    </div>`;
}

// What the builder needs from a real button: is it there and shown, its icon, is it on, its small state word, its badge.
function readBtn(id) {
  const el = $(id);
  if (!el) return null;
  const pressed = el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true' || el.classList.contains('on');
  const badge = el.querySelector('.badge');
  return {
    hidden: el.hidden,
    icon: el.querySelector('svg.ico')?.outerHTML || '',
    on: pressed,
    st: el.querySelector('.st')?.hidden === false ? el.querySelector('.st').textContent.trim() : '',
    badge: badge && !badge.hidden ? badge.textContent.trim() : ''
  };
}

// opener: the bottom bar's Bob button. isPhone(): narrow window. getSession()/pickSession(v): the Session picker.
export function createPhoneMenu({ opener, isPhone, getSession = () => null, pickSession = () => {} }) {
  const sheet = document.createElement('div');
  sheet.id = 'phoneMenu'; sheet.className = 'phone-menu'; sheet.hidden = true;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Bob\'s menu');
  const scrim = document.createElement('div');
  scrim.className = 'phone-menu-scrim'; scrim.hidden = true;
  document.body.append(scrim, sheet);
  let back = null;

  const isOpen = () => !sheet.hidden;
  function draw() {
    const keep = document.activeElement?.dataset?.press || document.activeElement?.dataset?.session || '';
    sheet.innerHTML = phoneMenuHtml({
      btn: readBtn,
      said: ($('status')?.textContent || '').trim(),
      brain: ($('brainPillText')?.textContent || '').trim(),
      fill: $('chatFill') && !$('chatFill').hidden ? ($('chatFillText')?.textContent || '').trim() : '',
      session: getSession()
    });
    if (keep) sheet.querySelector(`[data-press="${CSS.escape(keep)}"], [data-session="${CSS.escape(keep)}"]`)?.focus();
  }
  function place() {
    const bar = $('bottomBar');
    const h = bar && bar.offsetParent ? bar.offsetHeight : 0;
    sheet.style.bottom = `${h}px`;
    sheet.style.maxHeight = `${Math.max(240, window.innerHeight - h - 56)}px`; // a strip of chat stays above it: tap there to close
    scrim.style.bottom = sheet.style.bottom;
  }
  function open(on = true) {
    if (on && !isPhone()) return false;
    if (on === isOpen()) return true;
    sheet.hidden = scrim.hidden = !on;
    opener?.setAttribute('aria-expanded', String(on));
    document.body.classList.toggle('phone-menu-open', on);
    if (on) { back = document.activeElement; place(); draw(); sheet.querySelector('.pm-tile.on, .pm-tile, [data-close]')?.focus(); }
    else if (back?.isConnected) back.focus();
    return true;
  }
  const toggle = () => open(!isOpen());

  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { open(false); return; }
    const s = e.target.closest('[data-session]');
    if (s) { pickSession(s.dataset.session); setTimeout(draw, 50); return; }
    const p = e.target.closest('[data-press]');
    if (!p) return;
    const id = p.dataset.press, target = $(id);
    if (!target) return;
    // Pages and tools: close first, then go there. Switches and toggles stay open so you can see what changed.
    // 🔓 Autonomy asks first in the brain label's panel, so the sheet makes way for that question.
    const stay = p.classList.contains('pm-chip') || p.classList.contains('pm-row');
    if (!stay || id === 'freeBtn') open(false);
    target.click();
    if (stay && isOpen()) setTimeout(draw, 300);
  });
  scrim.addEventListener('click', () => open(false));
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { e.preventDefault(); open(false); return; }
    if (e.key !== 'Tab') return;
    // Keep Tab inside the sheet while it's open.
    const f = [...sheet.querySelectorAll('button')].filter((b) => !b.disabled);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  // Widening the window past phone size puts it away, so the wide layout never has it in the way.
  window.addEventListener('resize', () => { if (isOpen()) { if (!isPhone()) open(false); else place(); } });
  return { open, toggle, isOpen, draw };
}
