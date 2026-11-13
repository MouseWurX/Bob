// The chat page's side of harness items 62 to 72 (src/harness.js). All of it is off unless switched on in Settings.
//   - Catch crashes / Safe start: at start, a card in the chat with the report (Show, Delete) or the safe start offer.
//   - Quiet hours: quietNow() tells the chat page not to pop up or speak (an urgent reminder still does).
//   - Pin messages and Try from here: 📌 Pin and ⑂ Try from here under each saved message.
//   - Guest chats: 👤 Guest chat beside New chat, and a line saying nothing in it is saved.
//   - Count what Bob did each week: on Mondays, a line in the chat with the page.
//   - The ask box's Open in Bob: shows the ask box's chat here.
import { esc } from './rich.js';
import { openHealth, openWeekly, openCrashReport } from './harness-pages.js';

const get = (u) => fetch(u).then((r) => r.json());
const post = (u, d) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(d) }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
export const isGuest = (id) => /^guest-[a-zA-Z0-9-]{1,60}$/.test(String(id || ''));
export const GUEST_LINE = 'Guest chat: nothing here is saved, and I don\'t read or write my memory. It\'s gone when you leave it or I close.';

// Monday of this week, as YYYY-MM-DD (the weekly line shows once a week).
export function weekKey(now = new Date()) { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); }

let quiet = false;
export const quietNow = () => quiet;

// app: { log, add, note, session(), open(id), start(id, line), input, openSettings(jump) }
export function createHarnessChat(app) {
  let v = {};
  let pins = { id: '', list: [] };
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, x) => { try { localStorage.setItem(k, x); } catch {} } };

  async function refresh() {
    try { v = await get('/api/harness'); } catch { v = {}; }
    quiet = Boolean(v.quiet?.quiet);
    guestBtn.hidden = v.guestChat !== true;
    await loadPins();
    decorateAll();
  }

  // ---- Quiet hours: asked once a minute (cheap), so the times apply without a reload.
  setInterval(() => { get('/api/quiet').then((q) => { quiet = Boolean(q.quiet); }).catch(() => {}); }, 60_000);

  // ---- Catch crashes and Safe start: once, when the page opens.
  async function crashCard() {
    let c;
    try { c = await get('/api/crash'); } catch { return; }
    if (c.safeStart) {
      const el = app.add('approval', `<p><strong>I've closed unexpectedly ${c.streak} times in a row.</strong> Start safe? I'd switch every opt-in switch off (${c.safeStart.count} are on now), so a bad one can't get in the way. I save what was on first, and Put my switches back (Settings, This replicant matrix, 🩺 Health and history) turns them on again.</p><div class="row"><button type="button" data-safe="go">Switch them off</button> <button type="button" class="link" data-safe="no">Not now</button></div>`);
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-safe]');
        if (!b) return;
        const r = await post('/api/crash', { safeStart: b.dataset.safe });
        el.querySelector('.row').innerHTML = `<span class="muted">${esc(b.dataset.safe === 'go' ? (r.ok ? `Done: ${r.data.count} switch${r.data.count === 1 ? '' : 'es'} off. Restart me if anything still misbehaves.` : r.data.error || 'That didn\'t work.') : 'Left as they are.')}</span>`;
      });
    }
    if (c.reports?.length) {
      const r0 = c.reports[0];
      const el = app.add('approval', `<p><strong>${esc(r0.summary || 'I crashed last time.')}</strong> I saved a short report (no chat words in it). It stays here unless you share it.</p><div class="row"><button type="button" data-crash="show">Show it</button> <button type="button" class="link" data-crash="health">Open the Health page</button> <button type="button" class="link" data-crash="ok">OK</button></div>`);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-crash]');
        if (!b) return;
        if (b.dataset.crash === 'show') openCrashReport(r0.id);
        if (b.dataset.crash === 'health') openHealth();
        post('/api/crash', { seen: c.reports.map((r) => r.id) });
        if (b.dataset.crash === 'ok') el.remove();
      });
    }
  }

  // ---- Count what Bob did each week: a line on Mondays (once a week).
  function weeklyLine() {
    if (v.weeklyReport !== true || new Date().getDay() !== 1 || store.get('bob-weekly-seen') === weekKey()) return;
    store.set('bob-weekly-seen', weekKey());
    const el = app.add('note', `Your week with me is counted. <button type="button" class="link" data-weekly>📅 What Bob did this week</button>`);
    el.querySelector('[data-weekly]').onclick = () => openWeekly();
  }

  // ---- Pin messages and Try from here: buttons under each message Bob has saved (they carry data-mid).
  async function loadPins() {
    const id = app.session();
    if (v.pinMessages !== true || isGuest(id)) { pins = { id, list: [] }; return; }
    try { pins = { id, list: (await get('/api/pins?session=' + encodeURIComponent(id))).pins || [] }; } catch { pins = { id, list: [] }; }
  }
  function decorate(el) {
    const tools = el.querySelector(':scope > .msg-tools');
    if (!tools || !el.dataset.mid) return;
    tools.querySelectorAll('[data-hx-pin], [data-hx-try]').forEach((b) => b.remove());
    const guest = isGuest(app.session());
    const pinned = pins.list.some((p) => p.id === el.dataset.mid);
    el.classList.toggle('pinned', pinned);
    if (v.pinMessages === true && !guest) tools.insertAdjacentHTML('beforeend', `<button type="button" class="mini" data-hx-pin="${pinned ? 'off' : 'on'}" title="${pinned ? 'Let Bob forget this one when the chat gets long' : 'Keep this message in Bob\'s mind for this chat, however long it gets'}">${pinned ? '📌 Unpin' : '📌 Pin'}</button>`);
    if (v.tryFromHere === true && !guest) tools.insertAdjacentHTML('beforeend', '<button type="button" class="mini" data-hx-try title="Copy this chat up to here into a new chat and take it another way. This one stays as it is.">⑂ Try from here</button>');
  }
  function decorateAll() { for (const el of app.log.querySelectorAll(':scope > .msg[data-mid]')) decorate(el); }
  new MutationObserver((list) => {
    if (v.pinMessages !== true && v.tryFromHere !== true) return;
    for (const m of list) {
      if (m.type === 'attributes' && m.target.matches?.('.msg[data-mid]')) decorate(m.target);
      for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches('.msg') && n.dataset.mid) decorate(n);
    }
  }).observe(app.log, { childList: true, attributes: true, attributeFilter: ['data-mid'], subtree: true });

  app.log.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-hx-pin], [data-hx-try]');
    if (!b) return;
    const el = b.closest('.msg[data-mid]');
    if (!el) return;
    const sessionId = app.session();
    b.disabled = true;
    if (b.dataset.hxPin) {
      const r = await post('/api/pins', { sessionId, id: el.dataset.mid, pin: b.dataset.hxPin === 'on' });
      if (!r.ok) { app.note(r.data.error || 'That didn\'t work.', 'error'); b.disabled = false; return; }
      pins = { id: sessionId, list: r.data.pins || [] };
      decorate(el);
      return;
    }
    const r = await post('/api/chat/try', { sessionId, id: el.dataset.mid });
    b.disabled = false;
    if (!r.ok) { app.note(r.data.error || 'That didn\'t work.', 'error'); return; }
    await app.open(r.data.id);
    app.note('A copy of the chat up to that message. The original is still in Past chats as it was.');
    if (r.data.text) { app.input.value = r.data.text; app.input.focus(); app.input.dispatchEvent(new Event('input')); }
  });

  // ---- Guest chats: a button beside New chat while the switch is on.
  const newBtn = document.getElementById('newchat');
  const guestBtn = document.createElement('button');
  guestBtn.type = 'button'; guestBtn.id = 'guestchat'; guestBtn.className = 'nav-item'; guestBtn.hidden = true;
  guestBtn.title = 'A chat where nothing is saved and Bob doesn\'t read or write his memory';
  guestBtn.setAttribute('aria-label', 'Guest chat');
  guestBtn.innerHTML = '<span class="ico" aria-hidden="true">👤</span><span class="lbl">Guest chat</span><span class="short" aria-hidden="true">Guest</span>';
  newBtn?.insertAdjacentElement('afterend', guestBtn);
  guestBtn.onclick = async () => {
    const r = await post('/api/guest', { start: true });
    if (!r.ok) { app.note(r.data.error || 'That didn\'t work.', 'error'); return; }
    if (app.start(r.data.id, GUEST_LINE) === false) return;
  };
  // Leaving a guest chat (New chat, another chat): Bob lets go of it.
  let last = app.session();
  function moved(now) {
    if (isGuest(last) && last !== now && !/^guest-net-/.test(last)) post('/api/guest', { end: last }); // Nov 13: a Bob-Net icon's chat stays while Bob is open (net-overlay.js)
    last = now;
    loadPins().then(decorateAll);
  }

  // ---- The ask box's Open in Bob (public/ask.js), and Settings changing these switches.
  window.addEventListener('storage', (e) => {
    if (e.key !== 'bob-open-chat' || !e.newValue) return;
    try { const m = JSON.parse(e.newValue); if (m?.id && Date.now() - (m.at || 0) < 60_000) app.open(String(m.id)); } catch {}
  });
  window.addEventListener('bob-harness', () => refresh());
  window.addEventListener('bob-harness-go', (e) => app.openSettings(String(e.detail || '')));

  refresh().then(() => { crashCard(); weeklyLine(); if (isGuest(app.session())) app.note(GUEST_LINE); });
  return { moved, quietNow, refresh };
}
