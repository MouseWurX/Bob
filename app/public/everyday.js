// 🗓 Everyday helpers in the window (src/everyday.js, src/receipts.js, src/profiles.js). All off by default.
//   applyReading(st)   text size and the easier-to-read font, on the chat and Settings (both windows call it)
//   startEveryday(..)  the main window: the today card, the tour after an update, the ⏱ Focus button, the tray dot
//   mountEveryday(box) Settings, 🗓 Everyday helpers: the place for the weather, the spending sheet, the people
import { esc } from './util.js';
import { WANTS, wantPatch } from './wants.js';

export const TEXT_MIN = 80, TEXT_MAX = 160, TEXT_STEP = 10;
export const FOCUS_CHOICES = [15, 25, 45, 60];

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

// ---------------------------------------------------------------- 143 and 144
export function readingCss(st = {}) {
  const n = Math.min(TEXT_MAX, Math.max(TEXT_MIN, Math.round((Number(st.textSize) || 100) / TEXT_STEP) * TEXT_STEP));
  return { zoom: n / 100, readable: st.readableFont === true };
}
export function applyReading(st = {}, root = globalThis.document?.documentElement) {
  if (!root) return;
  const r = readingCss(st);
  root.style.setProperty('--text-zoom', String(r.zoom));
  root.classList.toggle('readable-font', r.readable);
}

// ---------------------------------------------------------------- 146 the today card
const timeOf = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
export function todayHtml(c = {}) {
  const d = new Date(c.date || Date.now());
  const day = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const w = c.weather;
  const weather = !w ? '' : w.error ? `<li>🌤 ${esc(w.place)}: ${esc(w.error)}</li>`
    : `<li>🌤 ${esc(w.place)}: ${esc(w.sky || 'weather')}${w.high != null ? `, high ${w.high}${esc(w.unit)}` : ''}${w.low != null ? `, low ${w.low}${esc(w.unit)}` : ''}${w.rain != null ? `, ${w.rain}% chance of rain` : ''}.</li>`;
  const rem = (c.reminders || []).map((r) => `<li>⏰ ${esc(timeOf(r.at))}: ${esc(r.text)}</li>`).join('');
  const sch = (c.schedules || []).map((s) => `<li>🗓 ${esc(timeOf(s.at))}: ${esc(s.name)} (scheduled job)</li>`).join('');
  const ck = c.checkin ? `<li>🔔 Last check-in (${esc(timeOf(c.checkin.at))}): ${c.checkin.found.length ? esc(c.checkin.found.join('; ')) : 'all fine'}.</li>` : '';
  const body = weather + rem + sch + ck;
  return `<p><strong>Today, ${esc(day)}</strong></p><ul class="today-list">${body || '<li>Nothing on today\'s list. A clear run.</li>'}</ul><div class="done"><button type="button" class="link" data-today="hide">Hide</button></div>`;
}

// ---------------------------------------------------------------- 149 the tour after an update
export function tourCards(keys = []) {
  return keys.map((k) => WANTS.find((w) => w.key === k)).filter(Boolean).slice(0, 3);
}
export function tourHtml(version, cards, settings = {}) {
  return `<p><strong>New in Bob ${esc(version)}</strong>: ${cards.length === 1 ? 'one switch' : `${cards.length} switches`} you might like. Each stays off unless you turn it on.</p>
    <div class="tour-cards">${cards.map((w) => `<div class="tour-card"><strong>${esc(w.label)}</strong><span class="muted">${esc(w.note)}</span>
      <button type="button" data-tour="${esc(w.key)}" ${settings[w.key] === true ? 'disabled' : ''}>${settings[w.key] === true ? 'On' : 'Turn on'}</button></div>`).join('')}</div>
    <div class="done"><button type="button" class="link" data-tour-done>Got it</button></div>`;
}

// ---------------------------------------------------------------- the main window
export function startEveryday({ add, note, settings = {}, version = '', store = globalThis.localStorage } = {}) {
  const $ = (id) => document.getElementById(id);
  let st = settings;

  // 146: once a day, the first time Bob's window opens.
  const today = new Date().toDateString();
  let shown = ''; try { shown = store?.getItem('bob-today-shown') || ''; } catch {}
  if (st.todayCard === true && shown !== today) {
    try { store?.setItem('bob-today-shown', today); } catch {}
    api('/api/everyday/today').then((c) => {
      if (c.off) return;
      const el = add('approval today-card', todayHtml(c));
      el.querySelector('[data-today="hide"]')?.addEventListener('click', () => el.remove());
    }).catch(() => {});
  }

  // 149: three cards for the new switches, once per version.
  if (st.updateTour === true && version && st.tourSeen !== version) {
    const cards = tourCards(TOUR[version] || []);
    if (cards.length) {
      const el = add('approval tour', tourHtml(version, cards, st));
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.tour) { const r = await api('/api/settings', wantPatch(b.dataset.tour, true)).catch((x) => ({ error: x.message })); b.disabled = true; b.textContent = r.error ? 'Couldn\'t' : 'On'; if (!r.error) st[b.dataset.tour] = true; return; }
        if ('tourDone' in b.dataset) el.remove();
      });
    }
    api('/api/settings', { tourSeen: version }).catch(() => {});
  }

  // 147: the ⏱ Focus button beside Effort.
  const btn = $('focusBtn'), stEl = $('focusBtnSt');
  let ticker = null, menu = null;
  const draw = (f) => {
    if (!btn) return;
    const pick = btn.parentElement; if (pick) pick.hidden = st.focusTimer !== true && !f?.on;
    btn.setAttribute('aria-checked', String(Boolean(f?.on)));
    clearInterval(ticker); ticker = null;
    if (f?.on) {
      const until = Date.parse(f.until);
      const tick = () => { const left = Math.max(0, Math.round((until - Date.now()) / 60000)); if (stEl) stEl.textContent = `${left} min`; };
      tick(); ticker = setInterval(tick, 15000);
    } else if (stEl) stEl.textContent = 'Off';
  };
  const closeMenu = () => { menu?.remove(); menu = null; btn?.setAttribute('aria-expanded', 'false'); };
  btn?.addEventListener('click', async () => {
    if (menu) return closeMenu();
    const f = await api('/api/everyday/focus').catch(() => ({ on: false }));
    if (f.on) { draw(await api('/api/everyday/focus', { stop: true }).catch(() => ({ on: false }))); return; }
    menu = document.createElement('span');
    menu.className = 'effort-choices focus-choices';
    menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'Focus for how long');
    menu.innerHTML = FOCUS_CHOICES.map((m) => `<button type="button" data-focus="${m}"><b>${m}</b><small>min</small></button>`).join('');
    btn.parentElement.appendChild(menu); btn.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
    menu.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-focus]'); if (!b) return;
      closeMenu();
      try { const r = await api('/api/everyday/focus', { minutes: Number(b.dataset.focus) }); draw(r); note(`⏱ Focus on for ${r.minutes} minutes. I'll keep my taps on the shoulder to myself until it ends.`); } catch (x) { note(x.message, 'error'); }
    });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) closeMenu(); });
  draw(st.focusNow);

  // 150: the tray dot. Something came in while nobody looked: dot on. Looked at again: dot off.
  const seen = (dot) => { if (st.trayDot === true) api('/api/everyday/seen', { dot }).catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) seen(false); });
  window.addEventListener('focus', () => seen(false));

  return {
    // The window's ping() calls this when it would tap you on the shoulder.
    pinged() { if (document.hidden || !document.hasFocus()) seen(true); },
    // focus-done: the summary line, then the held events come through as usual.
    event(ev) { if (ev.type === 'focus-done') { draw({ on: false }); add('approval focus-done', `<p>${esc(ev.text)}</p>`); this.pinged(); return true; } return false; },
    // Settings changed (here or in the Settings window): text size, font and whether the ⏱ Focus button shows.
    settings(next) { st = { ...st, ...next }; applyReading(st); draw(next.focusNow || null); }
  };
}

// The tour's lists, in step with src/everyday.js WHATS_NEW (a test keeps them the same).
export const TOUR = { '1.5.207': ['todayCard', 'focusTimer', 'receipts'] };

// ---------------------------------------------------------------- Settings, 🗓 Everyday helpers
const money = (n) => Number(n).toFixed(2);
export function sheetHtml(s = {}) {
  const rows = s.rows || [];
  const cats = Object.entries(s.byCat || {});
  return `<div class="spend-sum"><strong>This month (${esc(s.month || '')})</strong>: ${cats.length ? cats.map(([k, v]) => `${esc(k)} ${money(v)}`).join(' · ') : 'nothing yet'}</div>
    ${rows.length ? `<table class="spend-table"><thead><tr><th>Date</th><th>Shop</th><th>Total</th><th>Category</th><th>Note</th><th><span class="sr-only">Delete</span></th></tr></thead><tbody>${rows.slice(0, 100).map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.shop)}</td><td>${money(r.total)} ${esc(r.currency)}</td><td>${esc(r.category)}</td><td>${esc(r.note)}</td><td><button type="button" class="mini" data-spenddel="${esc(r.id)}" aria-label="Delete ${esc(r.shop)} ${esc(r.date)}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No receipts yet. Attach a photo of one in the chat and say "add this receipt".</p>'}
    <p><a class="mini button" href="/api/everyday/spending.csv" download="spending.csv">Save as a spreadsheet (CSV)</a> <span class="muted">${s.count || 0} line${s.count === 1 ? '' : 's'}. The copy you save is plain; the sheet in Bob stays locked.</span></p>`;
}
export function peopleHtml(v = {}) {
  const list = v.list || [];
  const mine = v.current && v.current !== 'main';
  const owner = !v.ownerLocked ? '<p class="muted">Your own chats and memory aren\'t private from users until you turn on 🔒 <strong>Passcode lock</strong> with <strong>Lock my chats and memory</strong> (This replicant matrix).</p>' : '';
  const who = mine ? `<p class="muted">In now: ${esc(v.currentName || 'a user')}. Only the owner can add or remove people.</p>` : '';
  const own = mine ? `<div class="row people-own"><strong>Your passcode:</strong> ${v.currentPasscode ? 'on, your things are locked.' : 'off, anyone who switches to you can see your things.'}
      <label>${v.currentPasscode ? 'Passcode' : 'New passcode'} <input data-owncode type="password" autocomplete="${v.currentPasscode ? 'current-password' : 'new-password'}" style="width:10em"></label>
      <button type="button" ${v.currentPasscode ? 'data-owncodeoff>Take it off' : 'data-owncodeon>Set it'}</button></div>` : '';
  return `${owner}${who}${own}<ul class="people-list">${list.map((p) => `<li>👤 ${esc(p.name)} <span class="muted">${p.passcode ? '🔒 passcode' : 'no passcode'}</span> <button type="button" class="mini" data-persondel="${esc(p.id)}">Remove</button></li>`).join('') || '<li class="muted">Nobody else yet.</li>'}</ul>
    <div class="row people-add"><label>Name <input data-personname maxlength="30" style="width:10em"></label> <label>Passcode (optional) <input data-personcode type="password" autocomplete="new-password" style="width:10em"></label> <button type="button" data-personadd>＋ Add a person</button></div>
    <p class="muted">Pick a person with <strong>👥 Switch user</strong> in the menu (or on the lock screen). Each sees only their own chats, memory and email. With a passcode, their things are locked; forget it and they're gone for good. Without one, they're kept apart, not private.</p>`;
}

export function mountEveryday(box, { settings = {}, flash = () => {} } = {}) {
  if (!box) return;
  const sheet = box.querySelector('.spend-box'), people = box.querySelector('.people-box');
  const drawSheet = () => sheet && api('/api/everyday/spending').then((s) => { sheet.innerHTML = sheetHtml(s); }).catch((e) => { sheet.innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
  const drawPeople = () => people && api('/api/everyday/profiles').then((v) => { people.innerHTML = peopleHtml(v); }).catch((e) => { people.innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
  drawSheet(); drawPeople();
  if (box.dataset.everyday) return; // drawn again: the listeners below are already on it
  box.dataset.everyday = '1';
  let armed = '';
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.spenddel) { if (armed !== b.dataset.spenddel) { armed = b.dataset.spenddel; b.textContent = 'Sure?'; return; } await api('/api/everyday/spending', { remove: b.dataset.spenddel }); armed = ''; drawSheet(); return; }
      if (b.dataset.persondel) { if (armed !== b.dataset.persondel) { armed = b.dataset.persondel; b.textContent = 'Remove them and their chats?'; return; } await api('/api/everyday/profiles', { remove: b.dataset.persondel }); armed = ''; drawPeople(); flash(people, 'Removed, with their chats and memory.'); return; }
      if ('personadd' in b.dataset) {
        const name = box.querySelector('[data-personname]')?.value || '', passcode = box.querySelector('[data-personcode]')?.value || '';
        await api('/api/everyday/profiles', { add: name, passcode }); drawPeople(); flash(people, 'Added. They pick their name with 👥 Switch user.'); return;
      }
      if ('owncodeon' in b.dataset || 'owncodeoff' in b.dataset) {
        const code = box.querySelector('[data-owncode]')?.value || '', on = 'owncodeon' in b.dataset;
        await api('/api/everyday/profiles', on ? { setCode: code } : { clearCode: code }); drawPeople(); flash(people, on ? 'Passcode set. Your things are locked now.' : 'Passcode off. Your things are plain now.'); return;
      }
    } catch (x) { flash(b, x.message); }
  });
  box.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.todayplace !== undefined) { const r = await api('/api/settings', { todayPlace: el.value }).catch((x) => ({ error: x.message })); if (!r.error) { el.value = r.todayPlace ?? el.value; settings.todayPlace = el.value; } flash(el, r.error || (el.value ? 'Saved. Only this place name goes to open-meteo.com, once a day.' : 'No weather on the card.')); }
  });
}
