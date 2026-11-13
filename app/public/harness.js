// Settings for harness items 62 to 72 (src/harness.js). Three panels, each loading its own data:
//   adv-health  🩺 Health and history      (This replicant matrix): Health page, Catch crashes, Safe start, Settings undo, weekly counts
//   adv-quiet   🌙 Quiet hours and shortcut (How Bob works): Quiet hours, A shortcut from anywhere
//   adv-chatx   💬 Chat extras              (How Bob works): Try from here, Pin messages, Guest chats, chat places,
//                                           ⌛ Fade old messages and Clear chat, 🫥 Amnesia mode (fade-chat.js)
// Every switch is off unless you turn it on, and every choice can be made before its switch is on.
import { esc } from './rich.js';
import { openHealth, openWeekly, openCrashReport } from './harness-pages.js';
import { fadeWords } from './fade-chat.js';

const get = (u) => fetch(u).then((r) => r.json());
const post = (u, d) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(d) }).then(async (r) => { const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'That didn\'t save.'); return data; });

// The words on the switches: Help (public/help-content.js) explains each by these names.
export const LABELS = {
  crashCatcher: ['Catch crashes', 'Off unless you turn it on. When Bob or his engine crashes, he saves a short report: when, his version, the system, the engine\'s last lines and the logbook\'s last lines, with chat, notes and memory lines left out. At the next start he offers it. It stays on this replicant matrix.'],
  safeStart: ['Offer a safe start after two crashes', 'Off unless you turn it on. If Bob doesn\'t close properly twice in a row, he offers to switch every opt-in switch off, so a bad switch can\'t lock you out. What was on is saved first, and Put my switches back turns those on again.'],
  settingsUndo: ['Keep the last 20 Settings changes', 'Off unless you turn it on. Each change to Settings is listed here with Put it back, which sets it to what it was.'],
  weeklyReport: ['Count what Bob did each week', 'Off unless you turn it on. Bob counts chats, replies, the words he wrote and how long each brain worked. Only numbers, never what was said. Open the page any time; on Mondays the chat says it\'s ready.'],
  quietHours: ['Quiet hours', 'Off unless you turn it on. Between these times: no pop-up notifications, no sounds, and check-ins wait until the quiet hours end. Reminders still show in the chat; one you said is urgent still pops up and speaks.'],
  globalAsk: ['A shortcut from anywhere', 'Off unless you turn it on. The key opens a small ask box on top of any app. Enter asks, Esc puts it away, Open in Bob carries on in his window. Only in Bob\'s own window on Windows, Mac and Linux, not in a browser or the Android app.'],
  tryFromHere: ['Try from here', 'Off unless you turn it on. ⑂ Try from here under a message copies the chat up to that message into a new chat, so you can take it another way. The original stays as it was.'],
  pinMessages: ['Pin messages', 'Off unless you turn it on. 📌 Pin under a message keeps it in Bob\'s mind for that chat, however long the chat gets. Up to 12 a chat.'],
  guestChat: ['Guest chats', 'Off unless you turn it on. 👤 Guest chat, beside New chat, starts a chat where nothing is saved and Bob neither reads nor writes his memory.'],
  fadeChat: ['Fade old messages', 'Off unless you turn it on. Your message, Bob\'s thinking and his reply slip off the chat after the time you pick, so the chat stays short.'],
  amnesiaOffer: ['Offer Amnesia mode', 'Off unless you turn it on. Puts 🫥 Amnesia beside Web search. While it\'s on, Bob works as usual and keeps the notes he needs. When you turn it off, he forgets everything from that stretch: chats, thinking, notes, memory lines and Topics.'],
  chatPlaces: ['Each chat keeps its place in the engine', 'Off unless you turn it on. Switching chats saves the engine\'s reading of the old chat to disk, so going back is quick instead of reading it all again. Bob\'s built-in engine only; not brains that see pictures. Up to 4 chats and 8 GB.']
};

const sw = (key, on) => `<label class="switch srow-switch"><input type="checkbox" data-hx="${key}" ${on ? 'checked' : ''}><span><strong>${esc(LABELS[key][0])}</strong><br><span class="muted">${esc(LABELS[key][1])}</span></span></label>`;
const when = (t) => new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const gb = (b) => `${Math.round((Number(b) || 0) / 1e8) / 10} GB`;

export function harnessHtml(part, v, crashes = []) {
  if (!v) return '<p class="muted">Loading...</p>';
  if (part === 'health') {
    return `<p><button type="button" data-hx-open="health">🩺 Open the Health page</button> <span class="muted">Engine, brain, card memory, disk, Bob-Net and the last errors, each with a fix button.</span></p>
      ${sw('crashCatcher', v.crashCatcher)}
      <div class="srow"><strong>Crash reports</strong> ${crashes.length ? `<ul class="tlist">${crashes.map((r) => `<li>${esc(r.summary || r.id)} <button type="button" class="mini" data-hx-report="${esc(r.id)}">Show</button> <button type="button" class="mini" data-hx-delreport="${esc(r.id)}">Delete</button></li>`).join('')}</ul><button type="button" class="link" data-hx-clear="crashes">Delete them all</button>` : '<span class="muted">None saved.</span>'}</div>
      ${sw('safeStart', v.safeStart)}
      <p><button type="button" data-hx-putback>Put my switches back</button> <span class="muted">After a safe start: the switches it turned off go on again.</span></p>
      ${sw('settingsUndo', v.settingsUndo)}
      <div class="srow"><strong>Last Settings changes</strong> ${v.undo?.list?.length ? `<ul class="tlist undo-list">${v.undo.list.map((e) => `<li><span class="muted">${esc(when(e.at))}</span> ${e.changes.map((c) => `${esc(c.label)}: ${esc(c.was)} → ${esc(c.now)}`).join('; ')} <button type="button" class="mini" data-hx-undo="${esc(e.id)}">Put it back</button></li>`).join('')}</ul><button type="button" class="link" data-hx-clear="undo">Clear the list</button>` : '<span class="muted">Nothing yet.</span>'}</div>
      ${sw('weeklyReport', v.weeklyReport)}
      <p><button type="button" data-hx-open="weekly">📅 What Bob did this week</button> <button type="button" class="link" data-hx-clear="weekly">Clear the counts</button></p>
      <p class="muted" data-hx-msg role="status"></p>`;
  }
  if (part === 'quiet') {
    const q = v.quietHours || {}, g = v.globalAsk || {};
    return `${sw('quietHours', q.on)}
      <div class="srow"><label class="pick"><strong>From</strong> <input type="time" data-hx-time="from" value="${esc(q.from || '22:00')}"></label> <label class="pick"><strong>To</strong> <input type="time" data-hx-time="to" value="${esc(q.to || '07:00')}"></label>${v.quiet?.quiet ? ' <span class="muted">(quiet now)</span>' : ''}</div>
      ${sw('globalAsk', g.on)}
      <div class="srow"><label class="pick"><strong>The key</strong> <select data-hx-key aria-label="The key for the ask box">${(v.askKeys || []).map((k) => `<option value="${esc(k.key)}" ${k.key === g.key ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}</select></label> <span class="muted">On a Mac, Ctrl is ⌘. If another app already uses the key, pick another.</span></div>
      <p class="muted" data-hx-msg role="status"></p>`;
  }
  const f = v.fadeChat || { on: false, minutes: 60, mode: 'hide' };
  const unit = f.minutes % 1440 === 0 ? 1440 : f.minutes % 60 === 0 ? 60 : 1;
  const radio = (name, val, now, label, note) => `<label class="radio"><input type="radio" name="${name}" value="${val}" data-hx-radio="${name}" ${now === val ? 'checked' : ''}><span>${esc(label)}<small>${esc(note)}</small></span></label>`;
  const fade = `<div class="fade-set" id="fade-old">
    ${sw('fadeChat', f.on).replace('data-hx="fadeChat"', 'data-hx-fade="on"')}
    <div class="srow"><strong id="fadeAfterLbl">Fade after</strong>
      <div class="pick-row" role="group" aria-labelledby="fadeAfterLbl"><input type="number" min="1" max="${unit === 1440 ? 365 : unit === 60 ? 8760 : 525600}" value="${f.minutes / unit}" data-hx-fade="num" aria-label="How long"> <select data-hx-fade="unit" aria-label="Minutes, hours or days"><option value="1" ${unit === 1 ? 'selected' : ''}>minutes</option><option value="60" ${unit === 60 ? 'selected' : ''}>hours</option><option value="1440" ${unit === 1440 ? 'selected' : ''}>days</option></select></div>
      <div class="pick-row">${(v.fadePicks || []).map((q) => `<button type="button" class="chip" data-hx-fadepick="${q.minutes}" aria-pressed="${q.minutes === f.minutes}">${esc(q.label)}</button>`).join('')}</div></div>
    <div class="srow" role="radiogroup" aria-label="When they fade"><strong>When they fade</strong>
      ${radio('fadeMode', 'hide', f.mode, 'Hide them', 'Bob still remembers. Topics and search still find them.')}
      ${radio('fadeMode', 'delete', f.mode, 'Delete them for good', 'For privacy: the words are gone from disk, Topics and search. His notes and memory stay.')}</div>
    <p><button type="button" data-hx-clearchat>🧹 Clear this chat</button> <span class="muted">Asks first. Also at the top of the chat and in Find anything.</span></p>
  </div>`;
  const amnesia = `<div class="fade-set" id="amnesia-mode">
    ${sw('amnesiaOffer', v.amnesiaOffer)}
    <div class="srow" role="radiogroup" aria-label="Things he made while it was on"><strong>Things he made while it was on</strong>
      ${radio('amnesiaMade', 'keep', v.amnesiaMade || 'keep', 'Keep them', 'Pictures, files and code he made stay where they are.')}
      ${radio('amnesiaMade', 'delete', v.amnesiaMade || 'keep', 'Delete them too', 'New files he made in that stretch go as well. A file he only changed always stays.')}</div>
    <div class="srow"><label class="pick"><strong>Turn it off by itself after</strong> <select data-hx-amnesiaauto aria-label="Turn Amnesia mode off by itself after">${(v.amnesiaAuto || []).map((q) => `<option value="${q.minutes}" ${q.minutes === (v.amnesiaAutoOff || 0) ? 'selected' : ''}>${esc(q.label)}</option>`).join('')}</select></label></div>
  </div>`;
  return `${fade}${amnesia}${sw('tryFromHere', v.tryFromHere)}${sw('pinMessages', v.pinMessages)}${sw('guestChat', v.guestChat)}${sw('chatPlaces', v.chatPlaces)}
    <p class="muted">Saved chat places: ${v.places?.count || 0}, ${gb(v.places?.bytes)}. <button type="button" class="link" data-hx-clear="places">Clear them</button></p>
    <p class="muted" data-hx-msg role="status"></p>`;
}

export function mountHarness(box) {
  if (!box || box.dataset.mounted) return;
  box.dataset.mounted = '1';
  const part = box.dataset.part || 'chats';
  let v = null, crashes = [];
  const draw = (msg = '') => { box.innerHTML = harnessHtml(part, v, crashes); const m = box.querySelector('[data-hx-msg]'); if (m) m.textContent = msg; };
  const load = async (msg) => {
    try { v = await get('/api/harness'); if (part === 'health') crashes = (await get('/api/crash')).all || []; draw(msg); }
    catch { box.innerHTML = '<p class="muted">Couldn\'t load these settings.</p>'; }
  };
  const say = (t) => { const m = box.querySelector('[data-hx-msg]'); if (m) m.textContent = t; };
  const save = async (patch, msg) => {
    try { v = { ...v, ...(await post('/api/harness', { patch })) }; draw(msg); window.dispatchEvent(new CustomEvent('bob-harness', { detail: v })); }
    catch (e) { await load(); say(e.message); }
  };
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.hx) {
      const k = t.dataset.hx;
      if (k === 'quietHours') return save({ quietHours: { ...v.quietHours, on: t.checked } }, t.checked ? `On: quiet from ${v.quietHours.from} to ${v.quietHours.to}.` : 'Off.');
      if (k === 'globalAsk') return save({ globalAsk: { ...v.globalAsk, on: t.checked } }, t.checked ? 'On. Try the key now (in Bob\'s own window only).' : 'Off. The key is free again.');
      return save({ [k]: t.checked }, t.checked ? 'On.' : 'Off.');
    }
    if (t.dataset.hxTime) return save({ quietHours: { ...v.quietHours, [t.dataset.hxTime]: t.value } }, 'Saved.');
    if (t.matches('[data-hx-key]')) return save({ globalAsk: { ...v.globalAsk, key: t.value } }, 'Saved.');
    // ⌛ Fade old messages: every value saves while the switch is off too.
    const f = v.fadeChat || {};
    if (t.dataset.hxFade === 'on') return save({ fadeChat: { ...f, on: t.checked } }, t.checked ? `On: messages fade after ${fadeWords(f.minutes)}.` : 'Off. Nothing fades; what already faded comes back with Show them.');
    if (t.dataset.hxFade === 'num' || t.dataset.hxFade === 'unit') {
      const n = Number(box.querySelector('[data-hx-fade="num"]').value), u = Number(box.querySelector('[data-hx-fade="unit"]').value);
      if (!(n >= 1)) return say('Pick 1 or more.');
      return save({ fadeChat: { ...f, minutes: Math.round(n * u) } }, `Saved: after ${fadeWords(Math.round(n * u))}.`);
    }
    if (t.dataset.hxRadio === 'fadeMode') return save({ fadeChat: { ...f, mode: t.value } }, t.value === 'delete' ? 'Saved: faded messages are deleted for good.' : 'Saved: faded messages are only hidden.');
    if (t.dataset.hxRadio === 'amnesiaMade') return save({ amnesiaMade: t.value }, 'Saved.');
    if (t.matches('[data-hx-amnesiaauto]')) return save({ amnesiaAutoOff: Number(t.value) }, 'Saved. It counts from when Amnesia mode is turned on.');
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.hxOpen === 'health') return openHealth();
    if (b.dataset.hxOpen === 'weekly') return openWeekly();
    if (b.dataset.hxReport) return openCrashReport(b.dataset.hxReport);
    if (b.dataset.hxFadepick) { const m = Number(b.dataset.hxFadepick); return save({ fadeChat: { ...(v.fadeChat || {}), minutes: m } }, `Saved: after ${fadeWords(m)}.`); }
    if (b.dataset.hxClearchat !== undefined) return window.dispatchEvent(new CustomEvent('bob-clear-chat'));
    try {
      if (b.dataset.hxDelreport) { await post('/api/crash', { remove: b.dataset.hxDelreport }); return load('Deleted.'); }
      if (b.dataset.hxClear) { await post('/api/harness/clear', { what: b.dataset.hxClear }); return load('Cleared.'); }
      if (b.dataset.hxUndo) { const r = await post('/api/settings-undo', { id: b.dataset.hxUndo }); window.dispatchEvent(new CustomEvent('bob-harness', { detail: null })); return load(`Put back: ${r.keys.join(', ')}. Some changes show after Settings is opened again.`); }
      if (b.dataset.hxPutback !== undefined) { const r = await post('/api/crash', { safeStart: 'back' }); return load(r.count ? `Put back ${r.count} switch${r.count === 1 ? '' : 'es'}.` : 'Nothing to put back: no safe start is saved.'); }
    } catch (err) { say(err.message); }
  });
  load();
}
