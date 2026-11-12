// Bob's panel: chat, approvals, status, taskbar badge, read-aloud, and the brain-swap machine.
import { drawBob, setLook } from './bob-sprite.js';
import { applyStyle, applySavedStyle } from './themes.js';
applySavedStyle();
import { startI18n, followSaved } from './i18n.js';
startI18n();
import { startSwap, sceneLabel } from './brain-swap.js';
import { createVoice } from './voice.js';
import { createCellar } from './cellar.js';
import { watchLock } from './lock-settings.js';
import { CHANNEL as SETTINGS_CHANNEL, WINDOW_NAME, WINDOW_SIZE, settingsUrl, wantsWindow, accept as acceptSettings } from './settings-link.js';
import { createShelf, uploadRef, fixSideways } from './shelf.js';
import { summary, size } from './progress.js';
import { createTasks, createDownloads, makeSortable, neighbour, taskRow } from './lists.js';
import { createLayout } from './layout.js';
import { esc, render, renderRich } from './rich.js';
import { createTopics } from './topics.js';
import { createTidy } from './tidy.js';
import { createLab } from './lab.js'; // 1.5.141 Computer Science Lab
import { CHANNEL as LAB_CHANNEL, WINDOW_NAME as LAB_WINDOW_NAME, WINDOW_SIZE as LAB_WINDOW_SIZE, LAB_URL, labWantsWindow, accept as labAccept } from './lab-link.js'; // the Lab's own window
import { createAdventure } from './adventure.js';
import { createGames } from './games.js';
import { createHelp } from './help.js';
import { handsApproval, togetherApproval, onHandsEvent } from './hands.js';
import { planApproval } from './plan-card.js';
import { createBrainBar } from './brain-bar.js';
import { createHandsSwitch } from './hands-switch.js';
import { installTips } from './tips.js';
import { createWebSwitch } from './web-switch.js';
import { createQuickSwitches } from './quick-switches.js'; // Autonomy and Screen use buttons
import { createRentSwitch } from './rent-switch.js'; // 1.5.127 rented brains
import { createGameLock } from './game-lock.js';
import { quarantineCard, quarantineResult, createQuarantineBanner } from './quarantine.js';
import { createEffort } from './effort.js';
import { createPresetPicker } from './presets.js'; // Assistant presets for chats
import { createCatAntics } from './cat-antics.js';
import { createBubbles } from './say-bubbles.js';
import { createBobLife } from './bob-life.js';
import { createViewer, outCard, fillPeeks } from './viewer.js';
import { songListHtml, wireSongs } from './song-player.js';
import { moreBar } from './more-bar.js';
import { createPromptMenu } from './prompts.js'; // saved prompts: the / menu in the message box
import { diagramHtml, saveRowsHtml, setupSaveAs, watchSaveAs } from './save-as.js';
import './math-core.js'; // Show maths as formulas: KaTeX, loaded only while the switch is on
import { installShortcuts, listHtml as shortcutListHtml } from './shortcuts.js';

// Settings opens in its own window on a computer (minimise, maximise, close). The main window keeps
// its left menu and Now running; what changes over there comes back on a BroadcastChannel (settings-link.js).
const settingsChan = 'BroadcastChannel' in window ? new BroadcastChannel(SETTINGS_CHANNEL) : null;
let settingsWin = null;
function openSettingsWindow(jump) {
  if (!wantsWindow({ hasChannel: Boolean(settingsChan), coarse: matchMedia('(pointer: coarse)').matches, standalone: matchMedia('(display-mode: standalone)').matches, width: window.innerWidth })) return false;
  try {
    if (settingsWin && !settingsWin.closed) settingsChan.postMessage({ from: 'main', name: 'bob-goto', detail: jump || '' });
    else settingsWin = window.open(settingsUrl(jump), WINDOW_NAME, WINDOW_SIZE);
    settingsWin?.focus();
  } catch { settingsWin = null; }
  return Boolean(settingsWin);
}
const cellar = createCellar({ popOut: openSettingsWindow });
const api = async (url, data) => {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
};
const tasks = createTasks({ post: (u, d) => post(u, d) });
const downloads = createDownloads({ api, post: (u, d) => post(u, d) });
installTips();
watchLock(); // 🔒 Passcode lock: back to the lock screen once Bob locks
const layout = createLayout({ post: (u, d) => post(u, d), openTasks: () => tasks.open(), openDownloads: () => downloads.open() });

const $ = (id) => document.getElementById(id);
const log = $('log'), input = $('input'), sendBtn = $('send'), stopBtn = $('stop'), statusEl = $('status');
const brainBar = createBrainBar({ post: (u, d) => post(u, d), note: (t, k) => note(t, k) });
const handsSwitch = createHandsSwitch({ note: (t, k) => note(t, k) });
const quickSwitches = createQuickSwitches({ note: (t, k) => note(t, k) });
const webSwitch = createWebSwitch({ note: (t, k) => note(t, k) });
const rentSwitch = createRentSwitch({ note: (t, k) => note(t, k) });
const gameLock = createGameLock({ note: (t, k) => note(t, k) }); // 1.5.41 the 🎮 Gaming button
const qBanner = createQuarantineBanner({ note: (t, k) => note(t, k) });
const effort = createEffort();
const bubbles = createBubbles();
const catAntics = createCatAntics({ onAntic: () => life.react('cat'), sleepy: () => life.dozing, bubbles });
const viewer = createViewer({ post: (u, d) => post(u, d), note: (t, k) => note(t, k) });
// 1.5.95: diagrams get drawn and the Save as rows work, anywhere in the chat (save-as.js).
setupSaveAs({ offer: (ev) => onEvent(ev), note: (t, k) => note(t, k), made: (items) => viewer.made(items) });
watchSaveAs(log);
const bobCanvas = $('bob'), bobCtx = bobCanvas.getContext('2d');
bobCtx.imageSmoothingEnabled = false;

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};
let sessionId = store.get('bob-session', 'main');
const presetPicker = createPresetPicker({ note: (t, k) => note(t, k), effort, session: () => sessionId });
let speakOn = store.get('bob-speak', '0') === '1';
let busy = false;
const replies = new Map(); // turnId -> { el, text } of the reply being streamed (two can run at once in an Art session)
const running = new Set();  // turnIds of jobs running now
let talkingUntil = 0;
let swapStop = null, swapEl = null;
let lastModel = null;

// ---------- Bob's face ----------
// Idle life: he breathes (a one-pixel rise every couple of seconds) and blinks every 2.5 to 6 seconds,
// sometimes twice. 1.5.53: little habits and reactions on top (public/bob-life.js), and a prop by his picture.
// Animations off (Style page) keeps him still but still lets him talk. About 12 frames a second, and the picture
// is only repainted when something changed.
const life = createBobLife();
const propEl = $('bobProp');
let blink = false;
(function blinker() {
  const twice = Math.random() < 0.25;
  blink = true;
  setTimeout(() => { blink = false; if (twice) setTimeout(() => { blink = true; setTimeout(() => { blink = false; }, 120); }, 160); }, 140);
  setTimeout(blinker, 2500 + Math.random() * 3500);
})();
let lastFrame = '', lastProp = '';
(function animate() {
  const now = Date.now();
  const still = document.body.classList.contains('still');
  life.setStill(still);
  const f = life.frame(now);
  const talk = now < talkingUntil && Math.floor(now / 140) % 2 === 0;
  const rise = !still && !talk && !f.shut && Math.floor(now / 1100) % 2 === 1 ? 1 : 0;
  const shut = !still && (blink || f.shut);
  const key = `${shut}${talk}${rise}${f.look}${f.wink}${f.dx}${f.dy}${f.head.toFixed(3)}`;
  if (key !== lastFrame) { // only repaint when something changed
    lastFrame = key;
    bobCtx.clearRect(0, 0, 56, 56);
    bobCtx.save();
    bobCtx.translate(f.dx * 2, (f.dy - rise) * 2);
    drawBob(bobCtx, 56, { blink: shut, talk, look: f.look, wink: f.wink, head: f.head });
    bobCtx.restore();
  }
  const prop = `${f.prop}|${f.propClass}`;
  if (propEl && prop !== lastProp) {
    lastProp = prop;
    propEl.textContent = f.prop;
    propEl.className = `bob-prop${f.prop ? ` p-${f.propClass}` : ''}`;
    propEl.hidden = !f.prop;
  }
  setTimeout(animate, document.hidden ? 1000 : 80);
})();
// Two brains loaded at once (from the brain readings): a bigger head. Back to one: normal again.
window.addEventListener('bob-brain-status', (e) => { const n = (e.detail?.models || []).filter((m) => m?.name).length; life.brains(n); });
// A dozing Bob wakes when you come back to the window.
let lifePoked = 0;
const wakeBob = () => { const t = Date.now(); if (t - lifePoked > 2000) { lifePoked = t; life.poke(); } };
for (const ev of ['pointermove', 'keydown', 'focus']) window.addEventListener(ev, wakeBob, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeBob(); });

// ---------- Rendering ----------
// Follow along at the bottom, unless you've scrolled up to read: then new words don't pull you down, and a round
// button at the bottom middle takes you back (with three dots that breathe slowly while Bob is still working).
let stick = true;
const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
const toBottom = $('toBottom');
function drawToBottom() {
  toBottom.hidden = stick || nearBottom();
  toBottom.classList.toggle('working', !toBottom.hidden && busy);
  toBottom.setAttribute('aria-label', toBottom.classList.contains('working') ? 'Bob is still working. Go to the newest message' : 'Go to the newest message');
}
function scrollDown(force = false) {
  if (force) stick = true;
  if (stick) log.scrollTop = log.scrollHeight;
  drawToBottom();
}
function goBottom() {
  stick = true;
  log.scrollTo({ top: log.scrollHeight, behavior: document.body.classList.contains('still') ? 'auto' : 'smooth' });
  drawToBottom();
}
log.addEventListener('scroll', () => { stick = nearBottom(); drawToBottom(); }, { passive: true });
toBottom.addEventListener('click', () => { goBottom(); $('input')?.focus({ preventScroll: true }); });
window.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'End' && !toBottom.hidden) { e.preventDefault(); goBottom(); } });
function add(cls, html) {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  log.appendChild(el);
  scrollDown();
  return el;
}
const waitLines = new Map(); // 1.5.97: wait id -> its ⏳ line
function note(text, kind = '') { return add(`note ${kind}`, esc(text)); }
// 1.5.91 the Set it up card (the words were signed off by the settings thread; the phone app has the same card).
function setupOfferHtml(ev) {
  const gbs = (n) => (n >= 1 ? `${(+n).toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.max(1, Math.round(n * 1000))} MB`);
  const after = ev.carryOn ? ' Then I carry on with what you asked.' : '';
  if (ev.kind === 'switch') return `<strong>"${esc(ev.name)}" is off</strong><span>It lets me ${esc(ev.what)}.${ev.privacy ? ' ' + esc(ev.privacy) : ''}${ev.free ? ' "Let Bob work without asking" is on, so it won\'t ask before each step.' : ev.name.startsWith('Let Bob use Hands') ? ' I still ask before every step.' : ''}${ev.folders ? ' Then tick the folders I may use in Settings, Hands.' : ''}${esc(after)} You can switch it off again in ${esc(ev.where)}.</span><div class="row"><button type="button" class="get">Switch it on</button><button type="button" class="link">Not now</button></div>`;
  if (ev.kind === 'equip') return `<strong>I can't ${esc(ev.say)} yet</strong><span>${esc(ev.model?.name || '')} is already on this replicant matrix, it just isn't in its slot.${esc(after)}</span><div class="row"><button type="button" class="get">Use it</button><button type="button" class="link">Not now</button></div>`;
  const items = (ev.items || []).map((i) => `<li>${esc(i.name)} <span class="muted">· ${gbs(i.sizeGB)}${i.engine ? ' · program' : ''}${i.license ? ` · ${esc(i.license)}` : ''}</span></li>`).join('');
  return `<strong>I can't ${esc(ev.say)} yet</strong><span>I need ${esc(ev.what)} first. ${ev.need === 'ffmpeg' ? 'One press gets it and sets it up.' : 'One press gets it, sets it up and puts it in its slot.'}${esc(after)}</span><ul>${items}</ul><span class="muted">About ${esc(ev.size)} in all${ev.freeGB != null ? `, ${ev.freeGB} GB free` : ''}. One time only.${ev.note ? ' ' + esc(ev.note) : ''}</span>${ev.short ? `<span class="error">Not enough free disk: free up ${ev.short} GB first, then ask me again.</span>` : ''}<div class="row"><button type="button" class="get">Set it up (about ${esc(ev.size)})</button><button type="button" class="link">Not now</button></div>`;
}

// 1.5.127 Rented brains: the Hire it card. Says what it costs, how long it takes to start, and exactly what leaves this replicant matrix.
function rentOfferHtml(ev) {
  const r = ev.rental || {};
  const start = ev.startMinutes ? ` It takes about ${ev.startMinutes} minute${ev.startMinutes === 1 ? '' : 's'} to start${r.kind === 'machine' ? ', and those minutes are billed too' : ''}.` : '';
  const leaves = `What leaves this replicant matrix: this chat, the files you attached to it, my instructions and what I remember about you, to ${esc(r.service || 'the service')}${r.plain ? ' (over a plain, unencrypted connection to the hired machine)' : ''}. Their privacy policy covers it there.`;
  const after = ev.carryOn ? ' Then I run your request there; my tools still run here, with the usual OK cards.' : ' Then your next messages run there.';
  const multi = (r.cards || 1) > 1 ? `<span class="error"><strong>⚠️ This machine has ${r.cards} cards at once</strong> (${esc(r.cardsText || '')}): it costs about ${r.cards} times as much an hour as one card, busy or not.</span>` : '';
  return `<strong>Hire ${esc(r.name || 'the rented brain')}?</strong><span>${esc(ev.why || '')} ${esc(r.model || '')} on ${esc(r.service || '')}: ${esc(ev.price || '')}.${start}${esc(after)}</span>${multi}<span class="muted">${leaves}</span>${ev.blocked ? `<span class="error">${esc(ev.blocked)}</span>` : ''}<div class="row"><button type="button" class="get"${ev.blocked ? ' disabled title="Fix the line above first"' : ''}>Hire it (${esc(ev.est || 'a few cents')})</button><button type="button" class="link">Not now</button></div>`;
}

function ensureReply(ev) {
  const k = ev?.turnId || '-';
  if (!replies.has(k)) replies.set(k, { el: add('msg bob', ''), text: '', media: [] });
  return replies.get(k);
}
// 1.5.11: a reply's pictures, sounds and clips live in the same bubble as its words (as history shows them), so
// the words arriving later never wipe them and an image-only bubble never collapses to an empty box.
// 1.5.41: while the words stream in, the cards already there stay as they are (not drawn again), so a song that's
// playing keeps playing and a picture doesn't flicker. The cards sit in .reply-media (display: contents).
function drawReply(r) {
  const words = render(r.text.replace(/^\s+/, '').replace(/\s+$/, ''));
  const key = r.media.map((m) => m.url).join('\n');
  const keep = key && r.mediaKey === key ? r.el.querySelector(':scope > .reply-media') : null;
  r.mediaKey = key;
  if (!keep) { r.el.innerHTML = words + (r.media.length ? `<div class="reply-media">${mediaHtml(r.media)}</div>` : ''); if (r.media.length) fillPeeks(r.el); return; }
  const tpl = document.createElement('template');
  tpl.innerHTML = words;
  for (const c of [...r.el.childNodes]) if (c !== keep) c.remove();
  r.el.insertBefore(tpl.content, keep);
}
function addMedia(ev, type) {
  const r = ensureReply(ev);
  const item = { type, url: ev.url, name: decodeURIComponent(String(ev.url).split('/').pop() || ''), ...(ev.song?.title ? { title: ev.song.title, sound: ev.song.sound } : {}), ...(type === 'diagram' ? { title: ev.title || '', ...(ev.format ? { format: ev.format } : {}) } : {}) };
  r.media.push(item); drawReply(r); scrollDown();
  if (type !== 'diagram') viewer.made([{ ...item, kind: type }]); // the side panel shows it too, if it's open
  return r;
}
// Files he saved (documents, spreadsheets, copies, zips) and things called up with show_made: cards in the same bubble.
function addMade(ev) {
  const r = ensureReply(ev);
  const fresh = (ev.items || []).filter((x) => x?.url && !r.media.some((m) => m.url === x.url));
  if (fresh.length) { r.media.push(...fresh.map((x) => ({ type: 'file', kind: x.kind, url: x.url, name: x.name, path: x.path }))); drawReply(r); scrollDown(); }
  viewer.made(ev.items, { show: ev.show === true });
}
function endReply(ev) { replies.delete(ev?.turnId || '-'); }

// ---------- Status, badge, notifications ----------
const STATUS_TEXT = {
  idle: 'Coffee in hand. Ready when you are.',
  thinking: 'Thinking...',
  loading: 'Swapping brains...',
  busy: 'Working...',
  painting: 'Pixel is painting...',
  waiting: 'Needs your OK'
};
// ---------- Sessions: which brains Bob keeps loaded. Bob may suggest one; only the user switches. ----------
const sessionSel = $('sessionSel');
let autoSession = true; // 1.5.41 "Let Bob pick the session" (Settings), on unless switched off
let curSession = null, pickedBy = 'you'; // 1.5.41: "Coding (picked by Bob)" when Bob picked it
function drawSessions(list, cur, by) {
  if (list) sessionSel.innerHTML = list.map((x) => `<option value="${esc(x.id)}" title="${esc(x.what)}" data-label="${esc(x.icon + ' ' + x.label)}">${x.icon} ${esc(x.label)}</option>`).join('');
  if (cur) curSession = cur;
  if (by) pickedBy = by;
  for (const o of sessionSel.options) o.textContent = `${o.dataset.label || o.textContent}${curSession && o.value === curSession.id && pickedBy === 'bob' && autoSession ? ' (picked by Bob)' : ''}`;
  if (curSession) { sessionSel.value = curSession.id; sessionSel.title = `${curSession.label} session: ${curSession.what}${autoSession ? ' Bob picks the session himself; you can still pick one here.' : ''}`; effort.lock(curSession.effortLow === true); }
}
window.addEventListener('bob-auto-session', (e) => { autoSession = e.detail?.autoSession !== false; drawSessions(); });
async function switchSession(id) {
  const r = await post('/api/settings', { session: id });
  if (!r.ok) { note(r.data.error || 'Couldn\'t switch session.', 'error'); return; }
  drawSessions(null, r.data.session, 'you');
}
sessionSel.onchange = () => switchSession(sessionSel.value);

function setStatus(s) {
  if (s.session && sessionSel.value !== s.session.id) drawSessions(null, s.session);
  statusEl.className = `status ${s.state}`;
  // The line under his name is the short state word; the work details (Painting with Maestro: loading...) go in
  // Bob's thinking (mind-view.js logs each new one), and the full line is on the tooltip. Word bubbles are only for
  // personality lines (the cat's antics), never for status, so nothing shows twice.
  const said = STATUS_TEXT[s.state] || s.detail || s.state;
  statusEl.textContent = said;
  statusEl.title = s.detail ? `${said} ${s.detail}` : said;
  catAntics.idle(s.state === 'idle');
  life.state(s.state);
  document.title = s.state === 'idle' ? 'Bob' : `Bob · ${STATUS_TEXT[s.state] || s.state}`;
  if (s.state === 'loading') showSwap(s.from || lastModel || 'old', s.model || 'new', s.mode);
  else hideSwap();
  if (s.model) lastModel = s.model;
  layout.status(s);
}
function badge(on) {
  try { if (on) navigator.setAppBadge && navigator.setAppBadge(); else navigator.clearAppBadge && navigator.clearAppBadge(); } catch {}
}
function ping(title, body) {
  if (!document.hidden) return;
  badge(true);
  try { if ('Notification' in window && Notification.permission === 'granted' && store.get('bob-alerts', '1') === '1') new Notification(title, { body, icon: '/icons/bob-192.png' }); } catch {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) badge(false); });

function showSwap(from, to, mode = 'swap') {
  if (swapEl) return;
  swapEl = document.createElement('div');
  swapEl.className = 'note announce';
  const c = document.createElement('canvas');
  c.style.cssText = 'width:100%;max-width:480px;image-rendering:pixelated;display:block;margin:0 auto';
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', sceneLabel(mode));
  swapEl.appendChild(c);
  // 1.5.21: if Bob's newest post is something he made, the animation goes above it, so the creation stays in view.
  const last = log.lastElementChild;
  if (last?.classList.contains('bob') && last.querySelector('.out-card')) log.insertBefore(swapEl, last);
  else log.appendChild(swapEl);
  scrollDown();
  swapStop = startSwap(c, { from, to, mode });
}
function hideSwap() {
  if (swapStop) swapStop();
  if (swapEl) swapEl.remove();
  swapStop = null; swapEl = null;
}

// ---------- Read aloud ----------
// Bob's own voice (Piper, from the cellar) when he has one; otherwise the Windows voices.
let ownVoice = false;
const sayQueue = [];
let saying = false;
async function sayNext() {
  if (saying || !sayQueue.length) return;
  saying = true;
  const text = sayQueue.shift();
  try {
    const r = await fetch('/api/speak', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ text }) });
    if (!r.ok) throw new Error('no voice');
    const url = URL.createObjectURL(await r.blob());
    const a = new Audio(url);
    talkingUntil = Date.now() + 60000;
    await new Promise((res) => { a.onended = res; a.onerror = res; a.play().catch(res); });
    URL.revokeObjectURL(url);
  } catch { ownVoice = false; browserSpeak(text); }
  talkingUntil = 0;
  saying = false;
  sayNext();
}
let winVoiceName = '';
window.addEventListener('bob-voice', (e) => { winVoiceName = e.detail?.windowsVoice || ''; });
function browserSpeak(text) {
  if (!('speechSynthesis' in window)) return;
  const plain = text.replace(/```[\s\S]*?```/g, ' (code) ').replace(/[*_`#>]/g, '').replace(/https?:\/\/\S+/g, 'a link').slice(0, 800);
  const u = new SpeechSynthesisUtterance(plain);
  // 1.5.33: the Windows voice picked in Settings, by name; otherwise Bob's own pick (an English male voice if there is one).
  const all = speechSynthesis.getVoices();
  const v = (winVoiceName && all.find((x) => x.name === winVoiceName)) || all.find((x) => /en-(CA|US|GB)/.test(x.lang) && /male|david|guy|george|ryan/i.test(x.name));
  if (v) u.voice = v;
  u.rate = 1.02;
  u.onstart = () => { talkingUntil = Date.now() + 60000; };
  u.onend = () => { talkingUntil = 0; };
  speechSynthesis.speak(u);
}
// Read aloud skips stage directions like *yawns* and just says the words.
const sayAside = (t) => String(t).replace(/\*[^*]+\*\s*/g, '').trim();
function speak(text) {
  if (!speakOn || !text) return;
  if (ownVoice) { sayQueue.push(text); sayNext(); } else browserSpeak(text);
}
const speakBtn = $('speak');
// Toggles show their state in words, not just a colour.
function setToggle(btn, on, title) {
  btn.setAttribute('aria-pressed', String(on));
  const st = btn.querySelector('.st'); if (st) st.textContent = on ? 'On' : 'Off';
  if (title) btn.title = title;
}
const syncSpeak = () => setToggle(speakBtn, speakOn, speakOn ? 'Bob reads his replies aloud (click to stop)' : 'Bob reads his replies aloud');
speakBtn.onclick = () => { speakOn = !speakOn; store.set('bob-speak', speakOn ? '1' : '0'); if (!speakOn) { sayQueue.length = 0; try { speechSynthesis.cancel(); } catch {} } syncSpeak(); };
syncSpeak();

const notifyBtn = $('notify');
const syncNotify = () => setToggle(notifyBtn, 'Notification' in window && Notification.permission === 'granted' && store.get('bob-alerts', '1') === '1');
notifyBtn.onclick = async () => {
  if (!('Notification' in window)) return note('This window can\'t show notifications.');
  if (Notification.permission === 'granted') {
    const on = store.get('bob-alerts', '1') !== '1';
    store.set('bob-alerts', on ? '1' : '0'); syncNotify();
    return note(on ? 'Alerts on: Bob will tap you on the shoulder when he needs you.' : 'Alerts off.');
  }
  const p = await Notification.requestPermission();
  store.set('bob-alerts', '1'); syncNotify();
  note(p === 'granted' ? 'Bob will tap you on the shoulder when he needs you.' : 'Notifications are blocked for this window.');
};
syncNotify();

$('cellarBtn').onclick = () => cellar.open('shop', 'roles');
$('settingsBtn').onclick = () => cellar.open('settings');
// Saved prompts: "/" at the start of the message box (off unless turned on in Settings, How Bob works).
createPromptMenu(input, { openSettings: () => cellar.open('settings', null, { jump: 'adv-prompts' }) });
// 1.5.141: the Bob-Net heading in Now running opens Settings at Bob-Net (advanced shown, the section open).
$('nowNetHead')?.addEventListener('click', () => cellar.open('settings', null, { jump: 'adv-bobnet' }));
// What the Settings window changed: pass its announcements on, press the two voice buttons for it, and read the
// look and theme again.
settingsChan?.addEventListener('message', (e) => {
  const m = acceptSettings(e.data); if (!m) return;
  if (m.kind === 'press') { $(m.id)?.click(); return; }
  if (m.kind === 'event') { (m.name === 'bob-door' ? document : window).dispatchEvent(new CustomEvent(m.name, { detail: m.detail })); return; }
  fetch('/api/settings').then((r) => r.json()).then((st) => { setLook(st.look); applyStyle(st.style); applyMath(st.mathView === true, true); shortcutsOn = st.shortcuts === true; }).catch(() => {});
});
// Settings, Get models and Style are pages in the main area: Chat or New chat goes back to the chat.
for (const id of ['chatBtn', 'newchat']) $(id).addEventListener('click', () => { if ($('cellar').open) $('cellar').close(); });
$('styleBtn').onclick = () => cellar.open('shop', 'style');
$('tasksBtn').onclick = () => tasks.open();
$('dlBtn').onclick = () => downloads.open();
function countBadge(btn, n) { const b = btn.querySelector('.badge'); if (!b) return; b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); }
const topicsPage = createTopics({ api, openChat: (id, msgId) => openChat(id, msgId) });
const tidyPage = createTidy({ api, onCount: (n) => countBadge($('tidyBtn'), n) });
$('topicsBtn').onclick = () => topicsPage.open();
$('tidyBtn').onclick = () => tidyPage.open();
// 1.5.141: 🧪 Lab in the left pane while Show the Computer Science Lab is on (1.5.172: on unless switched off).
// The Lab's "take me there" buttons: Get models, Settings (Engines), the chat.
const labGo = (where) => {
  labPage.close();
  if (where === 'models') $('cellarBtn').click();
  else if (where === 'engines') cellar.open('settings', null, { jump: 'adv-engines' });
  else if (where === 'chat') $('input')?.focus();
  try { window.focus(); } catch {}
};
const labPage = createLab({ api, note: (t) => note(t), go: labGo });
// On a computer the Lab opens in its own window, like Settings; on a phone or tablet it stays a page here.
const labChan = 'BroadcastChannel' in window ? new BroadcastChannel(LAB_CHANNEL) : null;
let labWin = null;
function openLabWindow() {
  if (!labWantsWindow({ hasChannel: Boolean(labChan), coarse: matchMedia('(pointer: coarse)').matches, standalone: matchMedia('(display-mode: standalone)').matches, width: window.innerWidth })) return false;
  try { if (!labWin || labWin.closed) labWin = window.open(LAB_URL, LAB_WINDOW_NAME, LAB_WINDOW_SIZE); labWin?.focus(); } catch { labWin = null; }
  return Boolean(labWin);
}
labChan?.addEventListener('message', (e) => { const m = labAccept(e.data); if (m?.kind === 'go') labGo(m.where); else if (m?.kind === 'note') note(m.text); });
$('labBtn').onclick = () => { if (!openLabWindow()) labPage.open(); };
const showLab = (on) => { $('labBtn').hidden = !on; };
window.addEventListener('bob-lab-switch', (e) => showLab(e.detail?.on === true));
fetch('/api/settings').then((r) => r.json()).then((st) => { showLab(st.computerLab !== false); if (st.language) followSaved(st.language); }).catch(() => {});
const adventurePage = createAdventure({ api }); // 1.5.117 🎲 Adventure
$('adventureBtn').onclick = () => adventurePage.open();
const gamesPage = createGames({ api }); // 1.5.121 🧩 Games
$('gamesBtn').onclick = () => gamesPage.open();
const helpPage = createHelp();
$('helpBtn').onclick = () => helpPage.open();
window.addEventListener('bob-tidy', () => tidyPage.open());
// "Ask Bob what he thinks" (Equip Bob, Attributes): puts the question in the chat and sends it.
window.addEventListener('bob-ask', (e) => { const t = String(e.detail || '').slice(0, 300); if (!t) return; $('input').value = t; $('composer').requestSubmit(); });
// Click Bob (or press Enter on him) to open Equip Bob.
bobCanvas.tabIndex = 0;
bobCanvas.setAttribute('role', 'button');
bobCanvas.title = 'Equip Bob: his models, attributes and look';
bobCanvas.setAttribute('aria-label', 'Bob. Open Equip Bob');
bobCanvas.addEventListener('click', () => cellar.open('shop', 'roles'));
bobCanvas.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cellar.open('shop', 'roles'); } });
// A past chat from Topics or search: switch to it and show its recent part (older parts are summed up).
async function openChat(id, msgId) {
  if (busy) { note('Bob is busy in this chat. Open the other one when he has finished.'); return; }
  sessionId = id;
  store.set('bob-session', sessionId);
  log.innerHTML = ''; stick = true;
  presetPicker.load();
  await loadHistory(40);
  const el = msgId && log.querySelector(`[data-mid="${CSS.escape(msgId)}"]`);
  if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2500); }
  else if (msgId) note('That message is in the older part of this chat, which Bob keeps summed up. The Topics page shows it in full.');
}
async function loadHistory(n = 20) {
  try {
    const h = await (await fetch('/api/history?session=' + encodeURIComponent(sessionId))).json();
    for (const m of h.slice(-n)) {
      if (m.forgotten) { if (m.role === 'user') note(m.content); continue; }
      // A reply with no words and nothing made shows only its note, never an empty bubble.
      if (m.role !== 'user' && !String(m.content || '').trim() && !m.media?.length) { if (m.correction) note(m.correction, 'error'); continue; }
      const el = decorate(add(m.role === 'user' ? 'msg you' : 'msg bob', m.role === 'user' ? esc(m.content) + picsHtml(m.pics) : render(m.content) + mediaHtml(m.media)), m.content, m.media);
      if (m.id) el.dataset.mid = m.id;
      if (m.role !== 'user') bubbleMedia.set(el, m.media || []);
      if (m.edited) markEdited(el, m.was, m.editedBy);
      if (m.versions?.length) markVersions(el, m.versions);
      if (m.correction) note(m.correction, 'error');
    }
  } catch {}
  drawRedo();
}
$('newchat').onclick = () => {
  if (busy) return;
  sessionId = 'chat-' + Date.now();
  store.set('bob-session', sessionId);
  log.innerHTML = ''; stick = true;
  presetPicker.load({ apply: false });
  note('New conversation. Bob still remembers what\'s in his memory file and on your to-do list.');
};

// ---------- Downloads and installs: always visible, even with the cellar closed ----------
const dlbar = $('dlbar');
let dlSeen = null;
const liveDl = new Map(); // id -> latest progress of each download running now (one or two)
function showDownload(ev) {
  const over = ['done', 'failed', 'cancelled', 'paused', 'retrying'].includes(ev.phase);
  if (dlSeen !== ev.id && !over && !liveDl.has(ev.id)) {
    dlSeen = ev.id;
    note(`${ev.kind === 'engine' ? 'Installing' : 'Fetching'} ${ev.name}. The bar above the chat and the Now running panel show how it's going; Downloads has pause and resume. Keep chatting.`);
  }
  if (over) {
    if (liveDl.delete(ev.id) || dlSeen === ev.id) {
      if (dlSeen === ev.id) dlSeen = null;
      if (ev.phase === 'done') note(`${ev.name} is ready${ev.total ? ` (${size(ev.total)})` : ''}.${ev.queue?.length ? ' Starting the next one.' : ''}`);
      else if (ev.phase === 'paused') note(`${ev.name} is paused. Resume it in Downloads.`);
      else note(`${ev.name}: ${ev.error || ev.phase}`, ev.phase === 'failed' ? 'error' : '');
    }
  } else liveDl.set(ev.id, ev);
  const live = [...liveDl.values()];
  dlbar.hidden = !live.length;
  if (!live.length) return;
  const total = live.reduce((t, x) => t + (x.total || 0), 0), done = live.reduce((t, x) => t + (x.done || 0), 0);
  const counting = live.every((x) => x.phase === 'downloading' && x.total);
  const pct = counting && total ? Math.min(100, Math.round((done / total) * 100)) : null;
  const meter = dlbar.querySelector('.meter');
  meter.classList.toggle('moving', pct == null);
  meter.querySelector('i').style.width = pct == null ? '100%' : pct + '%';
  const rate = live.reduce((t, x) => t + (x.phase === 'downloading' ? x.rate || 0 : 0), 0);
  dlbar.querySelector('.dlbar-text').textContent = (live.length === 1 ? summary(live[0]) : `${live.length} downloads${pct != null ? ` ${pct}%` : ''}`) + (rate ? ` · ${size(rate)}/s` : '');
}
dlbar.onclick = () => downloads.open();
dlbar.title = 'Open Downloads: pause, resume, reorder';
function drawDownloadsBadge(items) { countBadge($('dlBtn'), items.filter((d) => ['queued', 'downloading'].includes(d.state)).length); }

// 1.5.53: "Bob's thinking" (public/mind.html): a small window on top. Bob.exe opens it as its own window; in a
// browser it opens as a pop-up. Pressing the button again brings the open one to the front.
// 1.5.138: with "Show here" on in Now running, the button goes to the docked thinking instead (Pop out is there).
$('mindBtn')?.addEventListener('click', () => {
  if (layout.mindDocked()) return layout.showMind();
  const w = window.open('/mind.html', 'bob-mind', 'popup,width=380,height=480');
  try { w?.focus(); } catch {}
});
const mindTitle = (docked) => {
  const b = $('mindBtn'); if (!b) return;
  b.dataset.tip = docked ? 'Bob\'s thinking is in Now running (its section is open). Press to go to it; Pop out there opens the small window too.' : 'Opens a small always-on-top window showing Bob\'s thinking, which brain is working, moots and every step. Nothing runs for it while it\'s closed. To keep it in Now running instead, press [+] on its section there.';
};
mindTitle(layout.mindDocked());
window.addEventListener('bob-mind-dock', (e) => mindTitle(e.detail.docked));

// ---------- Events from the brain ----------
let brainSoon = null;
const shownCards = new Set(); // approval card ids already on this page
function onEvent(ev) {
  if (ev.type === 'brain' || ev.type === 'status') { clearTimeout(brainSoon); brainSoon = setTimeout(() => brainBar.refresh(), 250); }
  if (ev.type === 'brain') return;
  if (ev.type === 'status') return setStatus(ev);
  if (ev.sessionId && ev.sessionId !== sessionId && ev.type !== 'reminder') return;
  if (ev.type === 'more-pictures' || ev.type === 'more-pictures-done') return more.handle(ev);
  if (ev.type === 'hands') handsSwitch.update(ev.settings);
  if (ev.type === 'hands') quickSwitches.update(ev.settings); // Autonomy and Screen use
  if (ev.type === 'quarantine') return qBanner.update(ev.active);
  if (['lending', 'borrow', 'away', 'pair-done', 'queue'].includes(ev.type)) layout.net(); // 1.5.123: the Bob-Net party in Now running
  if (quarantineResult(ev)) return;
  if (onHandsEvent(ev, { add, scrollDown, note })) return;
  switch (ev.type) {
    case 'queue':
      drawQueue(ev.jobs || []);
      return;
    case 'session':
      drawSessions(null, ev.session, ev.pickedBy);
      // 1.5.41: Bob's own switch for a job already has its line in the chat; going quiet has one line of its own.
      if (ev.by === 'bob') return;
      note(ev.line || `${ev.session.icon} ${ev.session.label} session. ${ev.session.what}`);
      return;
    case 'suggest': {
      const el = add('suggest', `<span>${esc(ev.why)}</span><button type="button">${esc('Switch to ' + ev.label)}</button><button type="button" class="link">No thanks</button>`);
      const [yes, no] = el.querySelectorAll('button');
      yes.onclick = () => { el.remove(); switchSession(ev.id); };
      no.onclick = () => el.remove();
      return;
    }
    case 'howto-offer': { // 1.5.79: one card after a job that worked. Nothing is kept until Save how-to is pressed.
      const steps = (ev.steps || []).map((x, i) => `<li>${esc(x)}</li>`).join('');
      const el = add('suggest howto-card', `<div><strong>📒 That worked. Keep the steps as a how-to?</strong> <span class="muted">Next time you ask for something like this, I'll follow them.</span>
        <label class="howto-name">Name <input maxlength="60" value="${esc(ev.name || '')}" aria-label="How-to name"></label>
        <ol class="howto-steps">${steps}</ol></div><div class="howto-actions"><button type="button">Save how-to</button><button type="button" class="link">Not now</button></div>`);
      const [yes, no] = el.querySelectorAll('button');
      const answer = async (save) => {
        yes.disabled = no.disabled = true;
        try {
          const r = await api('/api/howtos/answer', { id: ev.id, save, name: el.querySelector('input')?.value || '' });
          el.remove();
          if (!r.ok) note(r.why || 'That card is too old now.', 'error');
          else if (save && r.saved) { window.dispatchEvent(new CustomEvent('bob-howto-saved')); } if (r.ok && save && r.saved) note(`Saved the how-to "${r.saved.name}". You can change or delete it in Settings, 🧰 Tools and how-tos Bob made.`);
        } catch (e) { yes.disabled = no.disabled = false; note(e.message, 'error'); }
      };
      yes.onclick = () => answer(true);
      no.onclick = () => answer(false);
      return;
    }
    case 'offer-download': { // 1.5.37: a job needs a model that isn't here yet. Nothing downloads until this is pressed.
      const sz = ev.sizeGB ? `about ${ev.sizeGB} GB, ` : '';
      const el = add('suggest', `<span>${esc(ev.why === 'music' ? 'Music needs its models first' : 'This needs a model first')}: ${esc(ev.name)} (${esc(sz)}one time only). You can watch it in Downloads.</span><button type="button">${esc(ev.why === 'music' ? 'Download the music models' : 'Download it')}</button><button type="button" class="link">Not now</button>`);
      const [yes, no] = el.querySelectorAll('button');
      yes.onclick = async () => {
        yes.disabled = true;
        // 1.5.38: the message that asked waits in Tasks and runs by itself when the download is done (even after a restart).
        try { await api('/api/models/download', { id: ev.id, ...(ev.jobId ? { thenJob: ev.jobId } : {}) }); el.remove(); note(ev.jobId ? `Downloading the ${ev.name}. Progress is in Downloads. Your ${ev.why === 'music' ? 'song' : 'request'} waits in Tasks, and I'll make it as soon as the download is done.` : `Downloading the ${ev.name}. Progress is in Downloads. Ask me for the ${ev.why === 'music' ? 'song' : 'job'} again when it's done.`); }
        catch (e) { yes.disabled = false; note(e.message, 'error'); }
      };
      no.onclick = () => el.remove();
      return;
    }
    case 'pair-ask': { // 1.5.97: another of your Bobs pressed Pair. Nothing is swapped until Yes is pressed here.
      if (document.querySelector(`[data-pair-card="${CSS.escape(ev.id)}"]`)) return;
      const el = add('setup-offer pair-card', `<strong>🤝 ${esc(ev.name)} wants to join your Bob-Net</strong><span>${esc(ev.name)}'s screen should show the number <strong>${esc(ev.number)}</strong>. If it does, press <strong>Yes, pair us</strong>; if not, press <strong>No</strong>. This Bob and ${esc(ev.name)} swap passcodes so each can reach the other. Nothing else switches on.${ev.already ? ' It\'s already on your list; this updates it.' : ''}</span><div class="row"><button type="button" class="get">Yes, pair us</button><button type="button" class="link">No</button></div>`);
      el.dataset.pairCard = ev.id;
      const [yes, no] = el.querySelectorAll('button');
      const answer = async (ok) => {
        yes.disabled = no.disabled = true;
        try { const r = await api('/api/bob-net/answer', { id: ev.id, yes: ok }); el.remove(); if (!r.ok) note(r.why || 'That card is too old now.', 'error'); else if (ok) note(`Pairing with ${ev.name}…`); }
        catch (e) { yes.disabled = no.disabled = false; note(e.message, 'error'); }
      };
      yes.onclick = () => answer(true);
      no.onclick = () => answer(false);
      scrollDown();
      return;
    }
    case 'pair-gone': document.querySelector(`[data-pair-card="${CSS.escape(String(ev.id || ''))}"]`)?.remove(); return;
    case 'pair-done': window.dispatchEvent(new CustomEvent('bob-pair-done')); note(ev.by ? `${esc(ev.by)} introduced ${esc(ev.name)}: paired${ev.both ? ', both ways' : ', one way for now'}. ${esc(ev.name)} is under My other Bobs.` : ev.both ? `Paired with ${ev.name}. You're on each other's list under My other Bobs.` : ev.asker ? `Paired with ${ev.name}, one way: this Bob can use ${ev.name}, but not the other way round yet. Turn on "Let my other replicant matrices in" here, then pair again.` : `Paired with ${ev.name}, one way: ${ev.name} can use this Bob, but not the other way round yet. Turn on "Let my other replicant matrices in" on ${ev.name}, then pair again.`); return;
    case 'offer-setup': { // 1.5.91: something a job needs isn't set up (or is switched off). Nothing changes until a button is pressed.
      const el = add('setup-offer', setupOfferHtml(ev));
      const [yes, no] = el.querySelectorAll('button');
      const answer = async (ok) => {
        yes.disabled = no.disabled = true;
        try {
          const r = await api('/api/setup/answer', { id: ev.id, yes: ok });
          el.remove();
          if (!r.ok) note(r.why || 'That card is too old now. Ask me again.', 'error');
          else if (r.done === 'download') note(`Getting ${r.names.join(' and ')} (about ${r.size}). Progress is in Downloads.${ev.carryOn ? ' Your request waits in Tasks, and I carry on by myself as soon as it\'s in.' : ''}`);
          else if (r.done === 'equip') note(ev.carryOn ? 'Done, it\'s in its slot. Carrying on with your request.' : 'Done, it\'s in its slot.');
          else if (r.done === 'switch') note(ev.carryOn ? `Switched on "${ev.name}". Carrying on with your request.` : `Switched on "${ev.name}". You can switch it off again in ${ev.where}.`);
        } catch (e) { yes.disabled = no.disabled = false; note(e.message, 'error'); }
      };
      yes.onclick = () => answer(true);
      no.onclick = () => answer(false);
      if (ev.short) yes.disabled = true;
      scrollDown();
      return;
    }
    case 'equipped': // 1.5.91: a download finished and Bob put it in its slot himself
      if (Array.isArray(ev.items) && ev.items.length) note(`Put in its slot: ${[...new Set(ev.items.map((i) => i.value))].join(', ')}.`);
      return;
    case 'waiting-line': { // 1.5.97: one muted ⏳ line per wait, updated in place (it isn't a card: nothing to answer)
      const el = waitLines.get(ev.id);
      if (el) el.textContent = ev.text;
      else waitLines.set(ev.id, note(ev.text, 'wait'));
      scrollDown();
      return;
    }
    case 'waiting-line-done': { // 1.5.111: the wait is over, so the ⏳ line goes
      waitLines.get(ev.id)?.remove();
      waitLines.delete(ev.id);
      return;
    }
    case 'busy-note': // 1.5.37: your message waits behind a picture, song or clip; Bob says so at once
      note(ev.text, 'announce');
      scrollDown();
      return;
    case 'start':
      endReply(ev);
      running.add(ev.turnId);
      setBusy(true);
      return;
    case 'download':
      cellar.onDownload(ev);
      showDownload(ev);
      downloads.tick(ev);
      layout.tick(ev);
      return;
    case 'downloads':
      downloads.update(ev.items || []);
      layout.downloads(ev.items || []);
      drawDownloadsBadge(ev.items || []);
      return;
    case 'token': {
      if (!replies.has(ev.turnId || '-') && !ev.text.trim()) break;
      const r = ensureReply(ev);
      r.text += ev.text;
      drawReply(r);
      talkingUntil = Date.now() + 400;
      scrollDown();
      break;
    }
    case 'announce':
      endReply(ev);
      note(ev.text, 'announce');
      speak(ev.text);
      break;
    case 'hat':
      endReply(ev);
      // 1.5.49: the reviewer is the moot, said plainly; other copies take a job over.
      if (ev.hat === 'reviewer' && ev.quiet) break; // its brain loads first, and that line says the moot
      if (ev.hat === 'reviewer') add('note hat moot', `🛰 Moot: Bob calls in ${esc(ev.copy || 'his reviewer')}, his reviewer, for a second look`);
      else add('note hat', ev.copy ? `Bob hands this to ${esc(ev.copy)}, his ${esc(ev.label)} copy` : `Bob switches to ${esc(ev.label)}`);
      break;
    case 'offer-rent': { // 1.5.127 Rented brains: the Hire it card. Nothing is hired until it's pressed.
      const el = add('setup-offer rent-card', rentOfferHtml(ev));
      const [yes, no] = el.querySelectorAll('button');
      const answer = async (ok) => {
        yes.disabled = no.disabled = true;
        try {
          const r = await api('/api/rent/answer', { id: ev.id, yes: ok });
          el.remove();
          if (!r.ok) note(r.why || 'That card is too old now. Ask me again.', 'error');
          else if (r.done === 'hired') note(r.carryOn ? `Hired ${r.name}. Running your request there now; the tools still run here.` : `Hired ${r.name} for your next messages.`);
          else if (r.done === 'none' && r.carryOn) note('Not hired. Doing it here instead.');
        } catch (e) { yes.disabled = no.disabled = false; note(e.message, 'error'); }
      };
      yes.onclick = () => answer(true);
      no.onclick = () => answer(false);
      if (ev.blocked) yes.disabled = true;
      scrollDown();
      return;
    }
    case 'rent': // 1.5.127 Rented brains: what the hired brain is doing and what it has cost so far (src/rental.js)
      if (ev.action === 'thinking') { endReply(ev); add('note borrow', `🏗 Rented brain: ${esc(ev.rental)}${ev.service ? ` on ${esc(ev.service)}` : ''} thinks this one. The tools still run here.`); }
      else if (ev.action === 'back') { endReply(ev); add('note borrow', `🏗 ${esc(ev.rental)} couldn't take it (${esc(ev.why || '')}), so Bob thinks this one himself.`); }
      else if (ev.action === 'start') add('note borrow', `🏗 Started a rented machine on ${esc(ev.service)} for ${esc(ev.rental)}. It stops when the job is done, or after ${ev.minutes} minutes whatever happens.`);
      else if (ev.action === 'used') add('note borrow muted', `🏗 ${esc(ev.rental)}: about ${esc(ev.usd)} so far this job; ${esc(ev.monthUsd)} this month.`);
      else if (ev.action === 'stop') add('note borrow', ev.stopped ? `🏗 Stopped the rented machine (${esc(ev.service)}) after ${ev.minutes} min, ${esc(ev.usd)}: ${esc(ev.why)}.` : `🏗 I couldn't stop the rented machine on ${esc(ev.service)} (${esc(ev.machine || '')}). Please stop it on their website so it doesn't keep billing.`);
      else if (ev.action === 'warn') add('note borrow', `🏗 ${esc(ev.text)}`);
      else if (ev.action === 'leftover') add('note borrow', `🏗 ${ev.machines.length === 1 ? 'A rented machine is' : `${ev.machines.length} rented machines are`} still running from before: ${ev.machines.map((m) => `${esc(m.service)} ${esc(m.id)}${m.perHour ? ` (about $${(+m.perHour).toFixed(2)} an hour)` : ''}`).join(', ')}. Stop them in Settings, Online services, Rented brains.`);
      else if (ev.action === 'slot') { rentSwitch.update(ev.rental); window.dispatchEvent(new CustomEvent('bob-rent-slot', { detail: { rental: ev.rental } })); }
      break;
    case 'borrow': // 1.5.55 Share brains: another of your Bobs thinks this reply (src/share-brains.js)
      endReply(ev);
      if (ev.action === 'start') add('note borrow', `📡 Borrowed brain: ${esc(ev.name)}${ev.brain ? ` (${esc(ev.brain)})` : ''} thinks this one. The tools still run here.`);
      else add('note borrow', `📡 ${esc(ev.name)} ${ev.why === 'too slow' ? 'didn\'t answer in time' : ev.partial ? 'dropped out mid-answer' : 'couldn\'t take it'}, so Bob thinks this one himself.`);
      break;
    case 'away': // 1.5.72 Share jobs: this whole job runs on another of your Bobs (src/share-jobs.js)
      endReply(ev);
      if (ev.action === 'start') add('note borrow', `📡 Sent to ${esc(ev.name)}: ${ev.why === 'cant' ? `I can't ${esc(ev.what)} on this replicant matrix, and ${esc(ev.name)} can` : ev.why === 'gaming' ? `I'd have to wait while you game, and ${esc(ev.name)} is free` : `I'm busy, and ${esc(ev.name)} can ${esc(ev.what)} now`}. OK cards and finished files come back here.`);
      else add('note borrow', `📡 ${esc(ev.name)} ${esc(ev.why || 'couldn\'t take it')}, so I'll do this one here.`);
      break;
    case 'tool':
      if (!/^hat:/.test(ev.summary) && ev.name !== 'edit_my_message') note(`· ${ev.summary}`); // an edit shows as "edited" on the message itself
      endReply(ev);
      break;
    case 'house': { // 1.5.34: "Used your house style: 30 seconds · Change" (House style on Equip Bob)
      const el = add('note house', `${esc(ev.text)} · <button type="button" class="link" data-house="${esc(ev.group || '')}">Change</button>`);
      el.querySelector('[data-house]')?.addEventListener('click', () => cellar.open('shop', 'roles', { house: ev.group }));
      break;
    }
    case 'image': { addMedia(ev, 'image'); ping('Bob finished a picture', ev.file || ''); break; }
    case 'audio': { addMedia(ev, 'audio'); ping('Bob finished a sound', ev.file || ''); break; }
    case 'video': { addMedia(ev, 'video'); ping('Bob finished a clip', ev.file || ''); break; }
    case 'diagram': { addMedia(ev, 'diagram'); break; } // 1.5.95 drawn by save-as.js
    case 'made': { addMade(ev); break; }
    case 'approval': {
      // 1.5.206: a page that connects is handed the cards still waiting; one it already shows isn't added twice.
      if (ev.id && shownCards.has(ev.id)) break;
      if (ev.id) shownCards.add(ev.id);
      endReply(ev);
      // The reviewer asks whether to quarantine Bob (quarantine.js, opt-in).
      if (quarantineCard(ev, { add, answer: (q) => post('/api/approve', { id: ev.id, allow: q }) })) { ping('Bob\'s reviewer needs you', ev.text); layout.needsYou(); break; }
      // 1.5.78: Bob's plan for a big job, with its OKs on the same card (plan-card.js).
      if (planApproval(ev, { add, answer: (allow, items, note) => post('/api/approve', { id: ev.id, allow, items, note }) })) { ping('Bob has a plan for you to check', ev.text); layout.needsYou(); break; }
      // 1.5.41: every OK a job needs, on one card (hands.js togetherApproval).
      if (togetherApproval(ev, { add, answer: (allow, items) => post('/api/approve', { id: ev.id, allow, items }) })) { ping('Bob needs your OK', `${ev.together.length} things for one job`); layout.needsYou(); break; }
      // Hands cards: rows to tick (files) or the exact command (run).
      if (handsApproval(ev, { add, answer: (allow, rows) => post('/api/approve', { id: ev.id, allow, rows }) })) { ping('Bob needs your OK', ev.text); layout.needsYou(); break; }
      const diff = ev.diff ? `<pre class="diff"><code>${esc(ev.diff)}</code></pre>` : '';
      const all = ev.allowAll ? '<button class="all">Allow the rest of this job</button>' : '';
      const card = add('approval', `<p><strong>Bob wants to:</strong> ${esc(ev.text)}</p>${diff}<div class="row"><button class="yes">Allow</button>${all}<button class="no">Deny</button></div>`);
      const answer = async (allow) => {
        card.querySelector('.row').outerHTML = `<div class="done">${allow === 'all' ? 'Allowed for the rest of this job' : allow ? 'Allowed' : 'Denied'}</div>`;
        await post('/api/approve', { id: ev.id, allow });
      };
      card.querySelector('.yes').onclick = () => answer(true);
      card.querySelector('.no').onclick = () => answer(false);
      if (ev.allowAll) card.querySelector('.all').onclick = () => answer('all');
      ping('Bob needs your OK', ev.text);
      layout.needsYou();
      break;
    }
    case 'tidy': {
      // Housekeeping found old things (at most once a day, only when it's on). Nothing goes without a click.
      countBadge($('tidyBtn'), ev.count);
      const el = add('suggest', `<span>Housekeeping: ${ev.count} old thing${ev.count === 1 ? '' : 's'} haven't come up in a while${ev.bytes > 1e6 ? ` (${Math.round(ev.bytes / 1e6)} MB)` : ''}. Nothing goes without your OK.</span><button type="button" data-t="look">Have a look</button><button type="button" class="link" data-t="later">Later</button>`);
      for (const b of el.querySelectorAll('button')) b.onclick = () => { el.remove(); if (b.dataset.t === 'look') tidyPage.open(); };
      break;
    }
    case 'lab': labPage.update(ev.run); break;
    case 'lab-queue': labPage.queueUpdate?.(ev.queue); break; // Nov 11: the Lab's job queue
    case 'lab-recheck': note(ev.text); break; // Nov 11: a brain slipped after an engine update // 1.5.141 (the Lab's own window reads these itself)
    case 'lab-full': labPage.fullUpdate(ev.full); break; // Bring in a full-size brain
    case 'lab-diffusion': document.dispatchEvent(new CustomEvent('lab-diffusion', { detail: ev.now })); break; // Playground: Diffusion brains, live
    case 'lab-done': note(ev.ok ? `🧪 The Lab finished ${ev.name}${ev.score != null ? `: ${ev.score} out of 100 on the Lab test` : ''}. Open the Lab to see the report.` : `🧪 The Lab stopped on ${ev.name}: ${ev.error}`); break;
    case 'tidy-done':
      topicsPage.refresh();
      if (ev.error) note(`Housekeeping stopped: ${ev.error}`, 'error');
      else note(`Housekeeping: ${[ev.summaries && `summed up ${ev.summaries} chat${ev.summaries === 1 ? '' : 's'}`, ev.topics && `filed ${ev.topics} chat${ev.topics === 1 ? '' : 's'} under topics`, ev.auto && `tidied ${ev.auto} thing${ev.auto === 1 ? '' : 's'}`, ev.ask && `${ev.ask} thing${ev.ask === 1 ? '' : 's'} to look at in Tidy up`].filter(Boolean).join(', ') || 'nothing to do'}.${ev.error ? '' : ''}`);
      if (ev.ask != null) countBadge($('tidyBtn'), ev.ask);
      break;
    case 'reminder':
      add('approval', `<p><strong>Reminder:</strong> ${esc(ev.text)}</p><div class="done">${esc(ev.local || '')}</div>`);
      speak('Reminder: ' + ev.text);
      badge(true);
      try { if ('Notification' in window && Notification.permission === 'granted' && store.get('bob-alerts', '1') === '1') new Notification('Bob: reminder', { body: ev.text, icon: '/icons/bob-192.png', requireInteraction: true }); } catch {}
      break;
    case 'checkin': {
      // 1.5.78 Check-ins: only sent when something needs you (src/checkins.js). Nothing is changed by it.
      const items = ev.items || [];
      add('approval', `<p><strong>Check-in:</strong> ${items.length} thing${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} you.</p><ul>${items.map((i) => `<li><strong>${esc(i.title)}</strong>${i.detail ? ` <span class="muted">${esc(i.detail)}</span>` : ''}</li>`).join('')}</ul><div class="done">${esc(ev.at ? new Date(ev.at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')}</div>`); // same style as Settings, Check-ins
      badge(true);
      try { if ('Notification' in window && Notification.permission === 'granted' && store.get('bob-alerts', '1') === '1') new Notification('Bob: check-in', { body: items.map((i) => i.title).join('\n').slice(0, 300), icon: '/icons/bob-192.png' }); } catch {}
      break;
    }
    case 'error':
      endReply(ev);
      life.react('oops');
      note(ev.text, 'error');
      break;
    case 'said': { // Let Bob fix his own messages: the id of what he just said, so the bubble can be found if he changes it
      const r = replies.get(ev.turnId || '-');
      if (r && ev.id) { r.el.dataset.mid = `${r.el.dataset.mid ? `${r.el.dataset.mid} ` : ''}${ev.id}`; liveWords.set(r.el, r.text); bubbleMedia.set(r.el, r.media); }
      return;
    }
    case 'edited': editedMsg(ev); return;
    case 'msg-edited': editedMsg(ev); return; // you changed Bob's words with the ... menu (msg-menu.js), here or in another window
    case 'asked': { // Try again and Edit: the id of the message you sent, so Edit can find it in the saved chat
      const bub = jobBubbles.get(ev.turnId);
      if (bub && ev.id) { bub.dataset.mid = ev.id; drawRedo(); }
      return;
    }
    case 'rewound': // Try again or Edit pressed in another window of this chat: draw it again from the saved chat
      if (!redoing && ev.id !== redoneId) { log.innerHTML = ''; stick = true; loadHistory(40); }
      redoneId = '';
      return;
    case 'correction':
      // The app's own check, under Bob's reply: he said he did something on the PC and no action ran.
      endReply(ev);
      note(ev.text, 'error');
      break;
    case 'gaming-lock': // 1.5.41: changed by the button in another window, or by picking another session
      gameLock.update(ev.on);
      return;
    case 'adventure': window.dispatchEvent(new CustomEvent('bob-adventure', { detail: ev })); return; // 1.5.117: the Adventure page draws it
    case 'games': window.dispatchEvent(new CustomEvent('bob-games', { detail: ev })); return; // 1.5.121: the Games page draws it
    case 'aside': {
      // Gaming-session sleepy aside (public/sleepy.js): scripted, not part of the reply, not saved in the chat.
      const rep = ev.turnId && replies.get(ev.turnId);
      if (rep) rep.aside = ev.text;
      else if (!ev.turnId) { add('msg bob aside-msg', `<div class="aside">${renderRich(ev.text).html}</div>`); speak(sayAside(ev.text)); }
      break;
    }
    case 'done': {
      const rep = replies.get(ev.turnId || '-');
      const finished = rep?.text;
      // Never leave an empty Bob bubble (nothing said, nothing made).
      if (rep && !String(finished || '').trim() && !rep.media?.length && !rep.el.querySelector('img, video, audio, .out-card')) rep.el.remove();
      else if (rep) decorate(rep.el, finished || '');
      const aside = rep?.el.isConnected && String(finished || '').trim() ? rep.aside : '';
      if (aside) { const a = document.createElement('div'); a.className = 'aside'; a.innerHTML = renderRich(aside).html; rep.el.insertBefore(a, rep.el.querySelector(':scope > .msg-tools')); }
      endReply(ev);
      running.delete(ev.turnId);
      setBusy(running.size > 0);
      if (rep?.media?.length) life.react('proud'); else if (finished) life.react('done');
      if (finished) { speak(finished); if (aside) speak(sayAside(aside)); ping('Bob replied', finished.slice(0, 120)); }
      break;
    }
  }
}

function connect() {
  const es = new EventSource('/api/events');
  es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch (e) { console.error(e); } };
  let dropped = false;
  es.onerror = () => { dropped = true; statusEl.textContent = 'Bob\'s brain isn\'t answering. Retrying...'; statusEl.className = 'status waiting'; };
  // Back after a gap: anything Bob made meanwhile is in his saved replies, so show what this window missed.
  es.onopen = () => { if (dropped) { dropped = false; catchUpMedia(); } };
}
async function catchUpMedia() {
  try {
    const h = await (await fetch('/api/history?session=' + encodeURIComponent(sessionId))).json();
    const seen = new Set([...log.querySelectorAll('img[src], video[src], audio[src]')].map((el) => el.getAttribute('src')).concat([...log.querySelectorAll('[data-view-url]')].map((el) => el.dataset.viewUrl), [...log.querySelectorAll('[data-diagram]')].map((el) => el.dataset.diagram)));
    const missed = h.slice(-6).filter((m) => m.role === 'assistant').flatMap((m) => m.media || []).filter((m) => !seen.has(m.url));
    if (missed.length) { add('msg bob', mediaHtml(missed)); scrollDown(); }
  } catch {}
}

// ---------- Sending ----------
async function post(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}
function setBusy(b) {
  busy = b;
  stopBtn.hidden = !b;
  drawToBottom(); // the dots on the go-to-bottom button
  drawRedo(); // Try again and Edit hide while Bob is busy
}

// ---------- The queue: what's waiting, what's running, what failed ----------
// A short strip above the message box (open tasks only); the Tasks button shows the full list.
const STATE_LABEL = { waiting: 'queued', working: 'in progress', rented: 'rented', done: 'completed', failed: 'failed', cancelled: 'cancelled', interrupted: 'interrupted' };
let lastJobs = [];
const qbox = $('queue');
function drawQueue(jobs) {
  lastJobs = jobs;
  tasks.update(jobs);
  layout.jobs(jobs);
  const open = jobs.filter((j) => j.state === 'waiting' || j.state === 'working');
  countBadge($('tasksBtn'), open.length);
  for (const j of jobs) {
    const tag = jobBubbles.get(j.id)?.querySelector('.qtag');
    if (tag) { const st = j.status || STATE_LABEL[j.state] || j.state; tag.textContent = (j.gaming ? j.gaming.tag : st === 'delegated' && j.delegatedTo ? `${j.delegatedTo.sent ? 'sent' : 'delegated'} to ${j.delegatedTo.copy}` : st) + (j.effort && j.effort !== 'low' ? ` · ${j.effort[0].toUpperCase()}${j.effort.slice(1)} effort` : ''); tag.className = `qtag ${j.state}`; }
  }
  const show = jobs.filter((j) => j.state === 'waiting' || j.state === 'working' || ((j.state === 'failed' || j.state === 'interrupted') && Date.now() - j.at < 3600e3));
  qbox.hidden = !show.length;
  if (!show.length) return;
  const waiting = show.filter((j) => j.state === 'waiting').length;
  qbox.innerHTML = `<div class="q-head">Tasks${waiting ? ` · ${waiting} waiting (drag to change the order)` : ''} · <button type="button" class="link" data-alltasks>See all</button></div><ol class="tlist">${show.map((j) => taskRow(j, { movable: j.state === 'waiting', full: false })).join('')}</ol>`;
}
qbox.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if ('alltasks' in b.dataset) return tasks.open();
  const id = b.closest('[data-id]')?.dataset.id, t = b.dataset.t;
  if (!id || !t) return;
  if (t === 'up' || t === 'down') {
    const before = neighbour(lastJobs.filter((j) => j.state === 'waiting').map((j) => j.id), id, t === 'up' ? -1 : 1);
    if (before !== undefined) post('/api/queue/move', { id, before });
  } else post(`/api/queue/${t}`, { id });
});
makeSortable(qbox, (id, before) => post('/api/queue/move', { id, before }));
// ---------- Pictures attached to the next message ----------
let pending = []; // [{ id, name, url, kind }]
const tray = $('tray');
function drawTray() {
  tray.hidden = !pending.length;
  tray.innerHTML = pending.map((r, i) => `
    <div class="pic" data-i="${i}">
      <img src="${esc(r.url)}" alt="">
      <span class="pic-name">${esc(r.name)}</span>
      ${r.kind === 'chat' ? `<span class="keep"><input maxlength="60" placeholder="Name to keep it" aria-label="Name for References"><select aria-label="Kind"><option value="character">Character</option><option value="scene">Scene</option><option value="style">Style</option><option value="object">Object</option></select><button type="button" data-act="keep">Save to References</button></span>` : ''}
      <button type="button" class="icon" data-act="drop" title="Remove">✕</button>
    </div>`).join('');
  for (const el of tray.querySelectorAll('.pic')) {
    const r = pending[Number(el.dataset.i)];
    el.querySelector('[data-act=drop]').onclick = () => { pending = pending.filter((x) => x !== r); drawTray(); };
    const keep = el.querySelector('[data-act=keep]');
    if (keep) keep.onclick = async () => {
      const name = el.querySelector('.keep input').value.trim();
      if (!name) { el.querySelector('.keep input').focus(); return; }
      try { Object.assign(r, await shelf.keep(r, name, el.querySelector('.keep select').value)); drawTray(); }
      catch (err) { note(err.message, 'error'); }
    };
  }
}
function attachRef(r) {
  if (pending.some((x) => x.id === r.id)) return;
  if (pending.length >= 4) { note('Four pictures per message is the limit.', 'error'); return; }
  pending.push(r);
  drawTray();
  input.focus();
}
async function attachFiles(files) {
  for (const f of [...files].filter((x) => /^image\/(png|jpeg|webp)$/.test(x.type))) {
    try { attachRef(await uploadRef(f, { kind: 'chat' })); } catch (err) { note(err.message, 'error'); }
  }
}
const shelf = createShelf({ onUse: attachRef });
// Old phone photos saved on their side get an upright copy, once, so picture edits see them the right way up.
setTimeout(() => fixSideways().then(({ fixed, kept }) => {
  if (!fixed) return; // nothing to fix: no note
  const n = `${fixed} reference picture${fixed === 1 ? '' : 's'}`;
  note(kept ? `Turned ${n} upright. The originals are kept next to them in References (named "-original").` : `Turned ${n} upright. The originals are in the Recycle Bin.`);
}).catch(() => {}), 4000);
$('shelfBtn').onclick = () => shelf.open();
$('attach').onclick = () => $('attachFile').click();
$('attachFile').onchange = (e) => { attachFiles(e.target.files); e.target.value = ''; };
input.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); attachFiles(files); }
});
document.addEventListener('dragover', (e) => { if (!$('shelf').open) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if ($('shelf').open) return;
  e.preventDefault();
  attachFiles(e.dataTransfer?.files || []);
});
// What Bob made in a reply (saved with it, so it's back after a reload): pictures, clips and sounds.
// Each one is a card with a preview (a thumbnail, the player, or the first lines); a click opens the side panel.
function mediaHtml(media) {
  if (!media?.length) return '';
  const items = media.map((m) => ({ ...m, kind: m.kind || (m.type === 'file' ? 'file' : m.type) }));
  // 1.5.21: two or more pictures or clips sit in a grid sized to fit the window, so all of them show without scrolling.
  const visual = items.filter((m) => m.kind === 'image' || m.kind === 'video');
  // 1.5.41: songs and sounds get the song player; two or more sit in a list that plays one after another.
  const songs = items.filter((m) => m.kind === 'audio' && m.url);
  const diagrams = items.filter((m) => m.kind === 'diagram').map(diagramHtml).join(''); // 1.5.95
  const rest = items.filter((m) => !visual.includes(m) && !songs.includes(m) && m.kind !== 'diagram').map(outCard).join('');
  const sounds = songs.length ? songListHtml(songs) : '';
  const saveRows = saveRowsHtml(items); // 1.5.95: Save as, under everything Bob made
  if (visual.length < 2) return diagrams + visual.map(outCard).join('') + sounds + rest + saveRows;
  const cols = Math.ceil(Math.sqrt(visual.length)), rows = Math.ceil(visual.length / cols);
  const grid = `<div class="media-grid" style="--cols:${cols};--rows:${rows}">${visual.map(outCard).join('')}</div>`;
  return diagrams + grid + sounds + rest + saveRows;
}
// ---------- Copy buttons and file cards (right-click and Ctrl+C often don't get through remote desktop) ----------
const rawText = new WeakMap();
// Let Bob fix his own messages (Settings, How Bob works; src/edit-own.js): the words and things made of each bubble,
// so a message he changes later is drawn again in place, with "edited" under it.
const liveWords = new WeakMap(), bubbleMedia = new WeakMap();
function markEdited(el, was, by) {
  el.querySelector(':scope > .edited-note')?.remove();
  const box = document.createElement('div');
  box.className = 'edited-note';
  const who = by === 'you' && el.classList.contains('bob') ? 'You changed Bob\'s words here' : `${el.classList.contains('you') ? 'You' : 'Bob'} changed this message`;
  box.innerHTML = `<button type="button" class="link mini" aria-expanded="false" title="${who}. Press to see what it said first.">edited</button><div class="edited-was muted" hidden><strong>First said:</strong> ${esc(was || '')}</div>`;
  const b = box.querySelector('button'), w = box.querySelector('.edited-was');
  b.onclick = () => { w.hidden = !w.hidden; b.setAttribute('aria-expanded', String(!w.hidden)); };
  el.insertBefore(box, el.querySelector(':scope > .msg-tools'));
}
function editedMsg(ev) {
  const el = ev.id && log.querySelector(`[data-mid~="${CSS.escape(ev.id)}"]`);
  if (!el) return; // in the older part of the chat, or another chat: the saved chat has the new words
  const live = [...replies.values()].find((r) => r.el === el);
  const old = live ? live.text : rawText.get(el) ?? liveWords.get(el) ?? '';
  const one = !/\s/.test(el.dataset.mid.trim());
  const text = ev.before && old.includes(ev.before) ? old.replace(ev.before, ev.text) : one ? ev.text : null;
  if (text == null) return; // two of his messages share this bubble and the old words weren't found: a reload shows it right
  const media = live ? live.media : bubbleMedia.get(el) || [];
  if (live) { live.text = text; live.mediaKey = null; drawReply(live); }
  else {
    el.innerHTML = render(text) + (media.length ? `<div class="reply-media">${mediaHtml(media)}</div>` : '');
    if (media.length) fillPeeks(el);
    rawText.delete(el); liveWords.set(el, text);
    decorate(el, text, media);
  }
  markEdited(el, ev.was, ev.by);
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2500);
}
// ---------- Try again and Edit (Settings, How Bob works; src/redo.js). Off unless you turn it on. ----------
// Try again is in the ... menu of Bob's latest answer; Edit in the ... menu of each of your messages Bob has saved. Either one takes back what
// came after, keeps it under your message as an earlier version, and sends your message (again). Hidden while Bob is busy.
let redoOnNow = false, redoing = false, redoneId = '';
const lastYou = () => [...log.querySelectorAll(':scope > .msg.you')].pop() || null;
// Where Try again goes: Bob's latest answer, or your latest message while it has none. It's in that message's ... menu.
function redoTarget() {
  const you = lastYou();
  if (!you?.dataset.mid) return null;
  let answer = null;
  for (let n = you.nextElementSibling; n; n = n.nextElementSibling) if (n.matches('.msg.bob:not(.aside-msg)')) answer = n;
  return answer || you;
}
// Try again and Edit live in the ... menu, built fresh each time it opens; an open one shuts when Bob gets busy.
function drawRedo() { if (busy || redoing || !redoOnNow) window.dispatchEvent(new Event('bob-msg-menu-close')); }
function versionsHtml(list) {
  const cut = (t) => { const x = String(t || ''); return esc(x.length > 1500 ? x.slice(0, 1500) + '…' : x); };
  return list.slice().reverse().map((v, i) => `<li><span class="muted">${i === 0 ? 'Latest earlier version' : `${i + 1} versions back`}${v.at ? ` · ${esc(new Date(v.at).toLocaleString())}` : ''}</span><div><strong>You:</strong> ${cut(v.text)}</div>${(v.said || []).map((m) => `<div><strong>${m.role === 'user' ? 'You' : 'Bob'}:</strong> ${cut(m.content) || (m.media?.length ? `<em>${m.media.length} thing${m.media.length === 1 ? '' : 's'} made</em>` : '')}</div>`).join('') || '<div class="muted">No answer yet.</div>'}</li>`).join('');
}
function markVersions(el, list) {
  el.querySelector(':scope > .versions-note')?.remove();
  if (!list?.length) return;
  const box = document.createElement('div');
  box.className = 'versions-note';
  box.innerHTML = `<button type="button" class="link mini" aria-expanded="false" title="What was here before Try again or Edit. Press to see it.">${list.length === 1 ? '1 earlier version' : `${list.length} earlier versions`}</button><ol class="versions-list muted" hidden>${versionsHtml(list)}</ol>`;
  const b = box.querySelector('button'), w = box.querySelector('ol');
  b.onclick = () => { w.hidden = !w.hidden; b.setAttribute('aria-expanded', String(!w.hidden)); };
  el.insertBefore(box, el.querySelector(':scope > .msg-tools'));
}
// Take back and send again. text: the new words (Edit), or none (Try again).
async function redoSend(id, text) {
  if (busy || redoing) { note('Bob is still on this chat. Wait until he has finished, or press Stop first.'); return; }
  redoing = true; drawRedo();
  try {
    const r = await post('/api/chat/redo', { sessionId, ...(id ? { id } : {}), ...(text != null ? { text } : {}) }).catch(() => ({ ok: false, data: { error: 'Can\'t reach Bob\'s brain. Is it running?' } }));
    if (!r.ok) { note(r.data.error || 'Something went wrong.', 'error'); return; }
    redoneId = r.data.id;
    log.innerHTML = ''; stick = true;
    await loadHistory(40);
    const bubble = log.querySelector(`.msg.you[data-mid="${CSS.escape(r.data.id)}"]`);
    const level = effort.get();
    const s = await post('/api/chat', { sessionId, text: r.data.text, redo: r.data.edited ? 'edit' : 'again', effort: level, ...(rentSwitch.on() ? { rent: true } : {}) }).catch(() => ({ ok: false, data: { error: 'Can\'t reach Bob\'s brain. Is it running?' } }));
    if (!s.ok) { note(s.data.error || 'Something went wrong.', 'error'); return; }
    if (bubble) { jobBubbles.set(s.data.jobId, bubble); bubble.insertAdjacentHTML('beforeend', `<span class="qtag">${s.data.ahead ? `queued, ${s.data.ahead} ahead` : 'queued'}</span>`); }
    life.react('heard');
    if (lastJobs.some((j) => j.id === s.data.jobId && j.state !== 'waiting')) drawQueue(lastJobs);
  } finally { redoing = false; drawRedo(); scrollDown(); }
}
// Edit in place: a box with your words, Send again and Cancel. Esc cancels, Enter sends (Shift+Enter for a new line).
function editInPlace(el) {
  if (el.querySelector(':scope > .edit-box')) return;
  const was = rawText.get(el) || '';
  const later = el !== lastYou() || [...log.querySelectorAll(':scope > .msg.bob')].some((b) => el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const box = document.createElement('form');
  box.className = 'edit-box';
  box.innerHTML = `<label class="sr-only" for="edit-${el.dataset.mid}">Your message</label><textarea id="edit-${el.dataset.mid}" rows="3">${esc(was)}</textarea>${later ? '<span class="muted">Bob answers from here. What came after this message is kept under it as an earlier version.</span>' : ''}<div class="row"><button type="submit">Send again</button><button type="button" class="link" data-edit-cancel>Cancel</button></div>`;
  el.classList.add('editing');
  el.appendChild(box);
  const t = box.querySelector('textarea');
  t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  const close = () => { box.remove(); el.classList.remove('editing'); };
  box.querySelector('[data-edit-cancel]').onclick = close;
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); box.requestSubmit(); }
  });
  box.onsubmit = (e) => {
    e.preventDefault();
    const text = t.value.trim();
    if (!text) { t.focus(); return; }
    if (text === was.trim()) { close(); return; }
    close();
    redoSend(el.dataset.mid, text);
  };
}
window.addEventListener('bob-chat-redo', (e) => { redoOnNow = e.detail === true; drawRedo(); });

// ---------- The ... menu on a message (src/msg-menu.js) ----------
// A small ... at the top right of a message, shown while the mouse is over it (always on a touch screen, and while it
// has keyboard focus). Copy is always there. Edit and Delete follow "Show Try again, Edit and Delete in the chat"
// (Settings, How Bob works): Edit on your message changes it and sends it again (editInPlace above); Edit on Bob's
// changes his words without sending anything; Delete takes yours out with Bob's answer to it, or just his answer.
// Not while Bob is on this chat.
const msgMenu = (() => {
  let open = null; // { msg, btn, box }
  const singleId = (msg) => { const id = (msg.dataset.mid || '').trim(); return id && !/\s/.test(id) ? id : ''; };
  function close(focus = false) {
    if (!open) return;
    open.box.remove(); open.btn.setAttribute('aria-expanded', 'false'); open.msg.classList.remove('menu-open');
    if (focus) open.btn.focus();
    open = null;
  }
  function items(msg) {
    const you = msg.classList.contains('you');
    const id = you ? (msg.dataset.mid || '').trim() : singleId(msg);
    const on = redoOnNow && id && !msg.classList.contains('aside-msg');
    const wait = busy || redoing;
    const why = 'Bob is still on this chat. Wait until he has finished.';
    const list = [];
    if (on && msg === redoTarget()) list.push(['redo', 'Try again', wait ? why : 'Get a new answer to your last message', wait]);
    if (on) list.push([you ? 'edit-msg' : 'edit-bob', 'Edit', wait ? why : you ? 'Change what you said and send it again' : 'Change Bob\'s words. Nothing is sent.', wait]);
    list.push(['copy-msg', 'Copy', 'Copy this message']);
    if (on) list.push(['del-msg', 'Delete', wait ? why : you ? 'Delete this message and Bob\'s answer to it' : 'Delete this answer', wait]);
    return list;
  }
  function draw(box, list) {
    box.innerHTML = list.map(([k, label, tip, off]) => `<button type="button" role="menuitem" data-m="${k}" title="${esc(tip)}"${off ? ' aria-disabled="true"' : ''}>${esc(label)}</button>`).join('');
    box.querySelector('button')?.focus();
  }
  function toggle(msg, btn) {
    if (open?.msg === msg) return close(true);
    close();
    const box = document.createElement('div');
    box.className = 'msg-menu'; box.setAttribute('role', 'menu'); box.setAttribute('aria-label', 'Message menu');
    msg.appendChild(box);
    open = { msg, btn, box };
    btn.setAttribute('aria-expanded', 'true'); msg.classList.add('menu-open');
    draw(box, items(msg));
    box.scrollIntoView?.({ block: 'nearest' });
  }
  async function pick(msg, b) {
    if (b.getAttribute('aria-disabled') === 'true') { note('Bob is still on this chat. Wait until he has finished, or press Stop first.'); return; }
    const k = b.dataset.m, btn = open?.btn;
    if (k === 'copy-msg') { close(true); return copyText(copyWords(msg), btn); }
    if (k === 'redo') { close(); return redoSend(null, null); }
    if (k === 'edit-msg') { close(); return editInPlace(msg); }
    if (k === 'edit-bob') { close(); return editBob(msg); }
    if (k === 'del-msg') { // asked in the menu itself, never a pop-up box
      const you = msg.classList.contains('you');
      open.box.innerHTML = `<p class="msg-menu-ask">${you ? 'Delete this message and Bob\'s answer to it?' : 'Delete this answer?'}${msg.querySelector('img, video, audio, .out-card') ? ' What he made stays in its folder.' : ''}</p><button type="button" role="menuitem" data-m="del-yes" class="danger">Delete</button><button type="button" role="menuitem" data-m="del-no">Keep it</button>`;
      open.box.querySelector('[data-m="del-no"]').focus();
      return;
    }
    if (k === 'del-no') return close(true);
    if (k === 'del-yes') { close(); return deleteMsg(msg); }
  }
  async function deleteMsg(msg) {
    const you = msg.classList.contains('you');
    const ids = you ? [(msg.dataset.mid || '').trim()] : (msg.dataset.mid || '').trim().split(/\s+/).filter(Boolean);
    for (const id of ids) {
      redoneId = id; // the saved chat is redrawn here by hand, not again when the other windows are told
      const r = await post('/api/chat/msg-delete', { sessionId, id }).catch(() => ({ ok: false, data: { error: 'Can\'t reach Bob\'s brain. Is it running?' } }));
      if (!r.ok) { redoneId = ''; note(r.data.error || 'Something went wrong.', 'error'); return; }
    }
    const gone = [msg];
    if (you) for (let n = msg.nextElementSibling; n && !n.matches('.msg.you'); n = n.nextElementSibling) if (n.matches('.msg.bob')) gone.push(n);
    for (const el of gone) el.remove();
    drawRedo();
  }
  // Change Bob's words in place: a box with them, Save and Cancel. Esc cancels, Enter saves (Shift+Enter for a new line).
  function editBob(el) {
    if (el.querySelector(':scope > .edit-box')) return;
    const id = singleId(el);
    const live = [...replies.values()].find((r) => r.el === el);
    const was = live ? live.text : rawText.get(el) ?? liveWords.get(el) ?? '';
    const box = document.createElement('form');
    box.className = 'edit-box';
    box.innerHTML = `<label class="sr-only" for="editb-${esc(id)}">Bob's words</label><textarea id="editb-${esc(id)}" rows="5">${esc(was)}</textarea><span class="muted">Nothing is sent. Bob reads the new words from now on, and the chat shows the message as edited.</span><div class="row"><button type="submit">Save</button><button type="button" class="link" data-edit-cancel>Cancel</button></div>`;
    el.classList.add('editing');
    el.appendChild(box);
    const t = box.querySelector('textarea');
    t.focus(); t.setSelectionRange(t.value.length, t.value.length);
    const close = () => { box.remove(); el.classList.remove('editing'); };
    box.querySelector('[data-edit-cancel]').onclick = close;
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); box.requestSubmit(); }
    });
    box.onsubmit = async (e) => {
      e.preventDefault();
      const text = t.value.trim();
      if (!text) { note('A message can\'t be changed to nothing. Use Delete to take it out instead.'); t.focus(); return; }
      if (text === String(was).trim()) { close(); return; }
      const r = await post('/api/chat/msg-edit', { sessionId, id, text }).catch(() => ({ ok: false, data: { error: 'Can\'t reach Bob\'s brain. Is it running?' } }));
      if (!r.ok) { note(r.data.error || 'Something went wrong.', 'error'); return; }
      close();
      editedMsg({ id, text: r.data.text, before: was, was: r.data.was, by: 'you' });
    };
  }
  // A press inside the menu can swap its buttons (Delete asks first), so a button that's gone counts as inside.
  document.addEventListener('click', (e) => { if (open && e.target.isConnected && !open.msg.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => {
    if (!open || !open.box.contains(document.activeElement)) return;
    const all = [...open.box.querySelectorAll('button')];
    const at = all.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); all[(at + 1) % all.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[(at - 1 + all.length) % all.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); all[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); all[all.length - 1]?.focus(); }
    else if (e.key === 'Tab') close();
  });
  window.addEventListener('bob-msg-menu-close', () => close());
  return { toggle, pick, close };
})();

function decorate(el, text, media = []) {
  if (!el || el.querySelector(':scope > .msg-tools')) return el;
  rawText.set(el, text || '');
  const { files } = renderRich(text || '');
  const made = (media || []).map((m) => m.url).filter((u) => typeof u === 'string' && u.startsWith('/images/'));
  for (const v of el.querySelectorAll('img[src^="/images/"], audio[src^="/images/"], video[src^="/images/"]')) made.push(v.getAttribute('src'));
  const links = [...el.querySelectorAll('a[href^="http"]')].length;
  const tools = document.createElement('div');
  tools.className = 'msg-tools';
  el.appendChild(tools); // Try again, Edit, Copy and Delete are in the ... menu (msgMenu below)
  el.insertAdjacentHTML('beforeend', '<button type="button" class="msg-more" data-msg-more aria-haspopup="menu" aria-expanded="false" aria-label="Message menu: Try again, Edit, Copy, Delete" title="Try again, Edit, Copy, Delete">…</button>');
  fillPeeks(el);
  const want = [...new Set([...files, ...made])];
  if (want.length && el.classList.contains('bob')) {
    api('/api/file/info', { paths: want }).then((list) => {
      const shown = new Set([...el.querySelectorAll('img[src], audio[src], video[src]')].map((x) => x.getAttribute('src')).concat([...el.querySelectorAll('[data-view-url]')].map((x) => x.dataset.viewUrl)));
      // A painted picture already in the message is the same file as /api/file?path=...; match by name too.
      const shownNames = new Set([...shown].filter((u) => u.startsWith('/images/')).map((u) => decodeURIComponent(u.slice(8))));
      // Every file he mentions gets the same card as things he made: a preview, and View opens the side panel.
      const html = list.filter((f) => f.ok && !shown.has(f.url) && !shownNames.has(f.name)).map((f) => outCard({ ...f, kind: f.kind === 'text' ? 'document' : f.kind, mention: f.mention })).join('');
      if (html) { const box = document.createElement('div'); box.className = 'file-cards'; box.innerHTML = html; el.insertBefore(box, tools); fillPeeks(box); }
      for (const a of el.querySelectorAll('a.file-link')) { const f = list.find((x) => x.mention === a.dataset.file); if (!f?.ok) a.classList.add('gone'), a.title = f?.missing ? 'Not there any more' : 'Outside the folders Bob may open'; }
    }).catch(() => {});
  }
  return el;
}
// A message with formulas copies as the brain wrote it (the LaTeX), which pastes cleanly anywhere.
const copyWords = (msg) => (msg.querySelector('.katex') ? rawText.get(msg) : '') || plainText(msg) || rawText.get(msg) || '';
function plainText(el) {
  const c = el.cloneNode(true);
  for (const x of c.querySelectorAll('.msg-tools, .mini, .file-cards, .qtag, .msg-more, .msg-menu')) x.remove();
  return c.innerText.trim();
}
async function copyText(text, btn) {
  let ok = false;
  try { ok = (await post('/api/clipboard', { text })).data.ok === true; } catch {}
  if (!ok) { try { await navigator.clipboard.writeText(text); ok = true; } catch {} }
  if (!ok) {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch {} t.remove();
  }
  if (btn) { const was = btn.textContent; btn.textContent = ok ? 'Copied' : 'Couldn\'t copy'; btn.classList.add('done'); setTimeout(() => { btn.textContent = was; btn.classList.remove('done'); }, 1400); }
  return ok;
}
log.addEventListener('click', async (e) => {
  const b = e.target.closest('button, a.file-link');
  if (!b || !log.contains(b)) return;
  const msg = b.closest('.msg');
  if ('msgMore' in b.dataset) return msgMenu.toggle(msg, b);
  if (b.closest('.msg-menu')) return msgMenu.pick(msg, b);
  if ('redo' in b.dataset) return redoSend(null, null);
  if ('editMsg' in b.dataset) return editInPlace(msg);
  if ('copyMsg' in b.dataset) return copyText(copyWords(msg), b);
  if ('copyLinks' in b.dataset) return copyText([...new Set([...msg.querySelectorAll('a[href^="http"]')].map((a) => a.href))].join('\n'), b);
  if ('copyCode' in b.dataset) return copyText(b.parentElement.querySelector('code')?.textContent || '', b);
  if (b.dataset.copyLink) return copyText(b.dataset.copyLink, b);
  if (b.dataset.copyPath) return copyText(b.dataset.copyPath, b);
  const which = b.dataset.open ?? b.dataset.reveal ?? b.dataset.file;
  if (which != null) {
    e.preventDefault();
    const r = await post('/api/open', { path: which, reveal: b.dataset.reveal != null });
    if (!r.ok) note(r.data.error || 'Couldn\'t open that.', 'error');
  }
});

// A picture Bob made whose file won't load: say where it is, with Show in folder, instead of a broken box.
log.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName !== 'IMG' || !img.closest('.msg.bob') || img.dataset.failed) return;
  const src = img.getAttribute('src') || '';
  if (!src.startsWith('/images/')) return;
  img.dataset.failed = '1';
  const name = decodeURIComponent(src.slice(8).split('?')[0]);
  const box = document.createElement('div');
  box.className = 'file-card img-missing';
  box.innerHTML = `<span>The picture didn't load. It's saved as ${esc(name)}.</span> <span class="file-tools"><button type="button" class="mini" data-reveal="${esc(src)}">Show in folder</button></span>`;
  img.replaceWith(box);
  // Copy path, the same as on file cards, once the server says where the file is.
  api('/api/file/info', { paths: [src] }).then(([f]) => {
    if (f?.path) box.querySelector('.file-tools').insertAdjacentHTML('beforeend', `<button type="button" class="mini" data-copy-path="${esc(f.path)}">Copy path</button>`);
  }).catch(() => {});
}, true);

function picsHtml(pics) {
  return pics?.length ? `<div class="pics">${pics.map((p) => `<img src="${esc(p.url)}" alt="${esc(p.name)}" title="${esc(p.name)}">`).join('')}</div>` : '';
}

// Every message is its own job in Bob's queue: send as many as you like, none get dropped.
const jobBubbles = new Map();
wireSongs(); // 1.5.41 the song player's clicks, keys and dragging
const more = moreBar({ composer: $('composer'), post, focus: () => $('input').focus() });
$('composer').onsubmit = async (e) => {
  e.preventDefault();
  const text = input.value.trim() || (pending.length ? 'Have a look at this.' : '');
  if (!text) return;
  const pics = pending;
  stick = true; // sending takes you to the bottom
  const bubble = add('msg you', esc(text) + picsHtml(pics) + '<span class="qtag">sending...</span>');
  decorate(bubble, text);
  input.value = '';
  pending = [];
  drawTray();
  const level = effort.get();
  const r = await post('/api/chat', { sessionId, text, refs: pics.map((p) => p.id), effort: level, ...(rentSwitch.on() ? { rent: true } : {}) }).catch(() => ({ ok: false, data: { error: 'Can\'t reach Bob\'s brain. Is it running?' } }));
  const tag = bubble.querySelector('.qtag');
  if (!r.ok) { tag.textContent = 'not sent'; tag.classList.add('bad'); note(r.data.error || 'Something went wrong.', 'error'); return; }
  jobBubbles.set(r.data.jobId, bubble);
  life.react('heard');
  tag.textContent = (r.data.ahead ? `queued, ${r.data.ahead} ahead` : 'queued') + (level === 'low' ? '' : ` · ${level[0].toUpperCase()}${level.slice(1)} effort`);
  if (lastJobs.some((j) => j.id === r.data.jobId && j.state !== 'waiting')) drawQueue(lastJobs); // it may already have run
};
// Keep Bob light: typing wakes the small brain (Wake when I type), so it's ready by the time you press Send.
input.addEventListener('input', () => { if (input.value.trim()) brainBar.typing(); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); }
});
stopBtn.onclick = () => post('/api/stop', {});

// ---------- Quick chips ----------
for (const b of document.querySelectorAll('#chips button')) {
  b.onclick = () => {
    if (b.dataset.say) { input.value = b.dataset.say; $('composer').requestSubmit(); }
    else { input.value = b.dataset.fill; input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  };
}

// ---------- Voice ----------
const micBtn = $('mic'), earBtn = $('ear');
micBtn.addEventListener('click', () => brainBar.typing());
let wakeOn = store.get('bob-wake', '0') === '1';
const voice = createVoice({
  transcribe: async (wav) => {
    const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'content-type': 'audio/wav', 'x-bob': '1' }, body: wav });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Speech service error');
    return j.text || '';
  },
  onText: (text) => {
    input.value = text;
    $('composer').requestSubmit();
  },
  onState: (state, msg) => {
    micBtn.classList.toggle('on', state === 'ptt' || state === 'armed');
    micBtn.classList.toggle('busy', state === 'transcribing');
    if (state === 'armed') { talkingUntil = Date.now() + 300; statusEl.textContent = 'Listening...'; }
    if (msg) note(msg, 'error');
  },
  isQuiet: () => saying || ('speechSynthesis' in window && speechSynthesis.speaking)
});
micBtn.onclick = () => voice.push().catch((e) => note('I can\'t use the microphone: ' + e.message, 'error'));
const syncEar = () => setToggle(earBtn, wakeOn, wakeOn ? 'Listening for "Hey Bob" (click to stop)' : 'Listen for "Hey Bob" while this window is open');
earBtn.onclick = async () => {
  wakeOn = !wakeOn;
  store.set('bob-wake', wakeOn ? '1' : '0');
  syncEar();
  try { await voice.setWake(wakeOn); if (wakeOn) note('Listening for "Hey Bob" while this window is open.'); }
  catch (e) { wakeOn = false; syncEar(); note('I can\'t use the microphone: ' + e.message, 'error'); }
};
syncEar();
if (wakeOn) voice.setWake(true).catch(() => { wakeOn = false; syncEar(); });

// ---------- What this PC can do: hide what Bob can't ----------
async function applyCaps() {
  try {
    const c = await (await fetch('/api/capabilities')).json();
    ownVoice = Boolean(c.voice);
    $('mic').hidden = !c.hearing;
    $('ear').hidden = !c.hearing;
    if (!c.hearing && wakeOn) { voice.setWake(false); }
  } catch {}
}
window.addEventListener('bob-caps', applyCaps);

// ---------- "Do you want me to:" (public/wants.js), offered once in the chat to a Bob that was set up before it existed ----------
function offerWants() {
  const el = add('suggest', `<span>New in the first-time setup: a short "Do you want me to:" list with the things I can do that stay off until you say so, like quick notes, reading your documents and fixing my own messages. Nothing changes unless you tick it.</span><button type="button" data-w="show">Show me the list</button><button type="button" class="link" data-w="no">Not now</button>`);
  for (const b of el.querySelectorAll('button')) b.onclick = async () => {
    el.remove();
    await post('/api/settings', { wantsAsked: true }).catch(() => {});
    if (b.dataset.w === 'show') cellar.open('welcome', null, { jump: 'wants' });
    else note('OK. It\'s in Settings, Run first-time setup, whenever you want it.');
  };
}

// ---------- Start ----------
// ---------- Show maths as formulas (Settings, Bob himself; off unless you turn it on) ----------
// KaTeX is loaded from Bob's own files the first time it's needed. redraw: the switch changed, so the chat is drawn again.
async function applyMath(on, redraw = false) {
  if (on === BobMath.isOn()) return;
  if (on) { try { await BobMath.load('/vendor/katex/'); } catch { note('Formulas couldn\'t be drawn: Bob\'s maths files are missing. They show as written.', 'error'); return; } }
  BobMath.setOn(on);
  if (redraw && !busy && log.querySelector('.msg')) { log.innerHTML = ''; await loadHistory(40); }
}

// ---------- Keyboard shortcuts (shortcuts.js; the extra ones while Settings, Bob himself, Keyboard shortcuts is on) ----------
let shortcutsOn = false;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
function showShortcuts() {
  let dlg = $('keysDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'keysDlg'; dlg.className = 'keys-dlg'; dlg.setAttribute('aria-label', 'Keyboard shortcuts');
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-keys-close]')) dlg.close(); });
  }
  dlg.innerHTML = `<h3>Keyboard shortcuts</h3>${shortcutListHtml({ mac: isMac, on: shortcutsOn })}<p><button type="button" class="big" data-keys-close>Close</button></p>`;
  if (!dlg.open) dlg.showModal();
}
window.addEventListener('bob-shortcuts', showShortcuts);
window.addEventListener('bob-display', (e) => { const d = e.detail || {}; if ('shortcuts' in d) shortcutsOn = d.shortcuts === true; if ('mathView' in d) applyMath(d.mathView === true, true); }); // Help, Keyboard shortcuts: Show the list
installShortcuts({
  doc: document,
  isOn: () => shortcutsOn,
  ctx: () => {
    const a = document.activeElement;
    return { mac: isMac, typing: Boolean(a?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')), inInput: a === input, empty: !input.value, busy, dialog: Boolean(document.querySelector('dialog[open]')) };
  },
  act: (id) => {
    if (id === 'newChat') { if (busy) return false; if ($('cellar').open) $('cellar').close(); $('newchat').click(); input.focus(); }
    else if (id === 'stop') { if (stopBtn.hidden) return false; stopBtn.click(); }
    else if (id === 'search') topicsPage.open();
    else if (id === 'session') { sessionSel.focus(); try { sessionSel.showPicker(); } catch {} }
    else if (id === 'focus') input.focus();
    else if (id === 'lastMsg') {
      const mine = [...log.querySelectorAll('.msg.you')].pop();
      const t = mine && (rawText.get(mine) ?? plainText(mine));
      if (!t) return false;
      input.value = t; input.setSelectionRange(t.length, t.length);
    } else if (id === 'copyReply') {
      const his = [...log.querySelectorAll('.msg.bob')].pop();
      if (!his) return false;
      copyText(copyWords(his)).then((ok) => note(ok ? 'Copied Bob\'s last reply.' : 'Couldn\'t copy. Use the Copy button under the reply.'));
    } else if (id === 'settings') $('settingsBtn').click();
    else if (id === 'list') showShortcuts();
    return true;
  }
});

async function start() {
  try { const st = await (await fetch('/api/settings')).json(); shortcutsOn = st.shortcuts === true; await applyMath(st.mathView === true); } catch {}
  await loadHistory(20);
  let cat = 'Patches';
  try { cat = (await (await fetch('/api/settings')).json()).catName || cat; } catch {}
  if (!log.children.length) note(`Welcome to The Idle Process. Coffee's on, VRAM's mostly free, ${cat} is ignoring us. What are we building?`);
  try {
    const s = await (await fetch('/api/status')).json();
    setStatus(s);
    if (s.state === 'idle') life.react('hello');
    if (s.version) $('ver').textContent = `Bob ${s.version.label}`;
    rentSwitch.update(s.rented || ''); // 1.5.127: the 🏗 switch shows only with a rented brain in its slot
    if (s.busy) setBusy(true);
    if (!s.ollama) note('I can\'t reach my engine (' + (s.engine || 'Ollama') + ') right now. Is it running? (The AI Toggle shortcut turns Ollama on.)', 'error');
  } catch {}
  try {
    const st = await (await fetch('/api/settings')).json(); winVoiceName = st.tts?.windowsVoice || ''; setLook(st.look); applyStyle(st.style); autoSession = st.autoSession !== false; redoOnNow = st.chatRedo !== false; drawRedo(); drawSessions(st.sessions, st.session, st.sessionBy);
    // Opt-in: look at GitHub (and the source folder) and tell the user about a newer Bob. Never updates by itself.
    if (st.setupDone && !st.wantsAsked) offerWants(); // once, for Bobs set up before the Welcome had "Do you want me to:"
    if (st.updates?.autoCheck) { const c = await (await fetch('/api/update/check')).json(); if (c.newer) note(`A newer Bob (${c.available.label}) is out${c.from === 'github' ? ' on GitHub' : ''}. Settings, This replicant matrix and updates, Check for updates.`); }
  } catch {}
  try { drawQueue(await (await fetch('/api/queue')).json()); } catch {}
  try { const d = await (await fetch('/api/downloads')).json(); downloads.update(d); layout.downloads(d); drawDownloadsBadge(d); for (const x of d) if (x.state === 'downloading') showDownload({ ...x, phase: 'downloading' }); } catch {}
  window.addEventListener('bob-downloads', () => downloads.open());
  connect();
  input.focus();
  applyCaps();
  cellar.firstRun();
}
start();

// ---------- Tell Bob someone is here (typing, clicking), at most every 20 s, so an update waits ----------
let lastPoke = 0;
function poke() { if (Date.now() - lastPoke < 20e3) return; lastPoke = Date.now(); post('/api/activity', {}).catch(() => {}); }
document.addEventListener('pointerdown', poke, true);
document.addEventListener('keydown', poke, true);

// ---------- Update ready: ask right here in the chat (no waiting for a quiet moment) ----------
let updWatch = null, updAsked = false;
function watchUpdateReady() {
  clearTimeout(updWatch);
  fetch('/api/update/status').then((r) => r.json()).then((st) => {
    if (st?.error) return note(`Update: ${st.error}`, 'error');
    if (st?.manual) return note(`The new Bob (${st.version}) is downloaded and checked. ${st.log || ''}`);
    if (st?.ready && !updAsked) { updAsked = true; return askRestart(st); }
    if (!st?.done) updWatch = setTimeout(watchUpdateReady, 3000);
  }).catch(() => { updWatch = setTimeout(watchUpdateReady, 5000); });
}
async function askRestart(st) {
  const busyWith = [running.size ? 'a task' : '', liveDl.size ? 'a download' : ''].filter(Boolean).join(' and ');
  // 1.5.38: only promise to pick up where he left off when that switch is on.
  let pickUp = false;
  if (busyWith) { try { pickUp = (await (await fetch('/api/settings')).json()).resumeJobs === true; } catch {} }
  const after = pickUp ? 'if I restart now, I pick up where I left off when I open again.' : 'if I restart now, it stops and waits in Tasks or Downloads for you to start it again. (Turn on "Pick up where Bob left off after a restart" in Settings, How Bob works, and I\'ll carry on by myself.)';
  const el = add('suggest', `<span>The new Bob (${esc(st.version || 'update')}) is ready.${busyWith ? ` I'm working on ${esc(busyWith)}; ${esc(after)}` : ''}</span>
    <button type="button" data-r="now">${busyWith ? 'Restart anyway' : 'Restart Bob now'}</button>${busyWith ? '<button type="button" data-r="done">Wait until I\'m done</button>' : ''}<button type="button" class="link" data-r="later">Later</button>`);
  for (const b of el.querySelectorAll('button')) b.onclick = async () => {
    if (b.dataset.r === 'later') { el.remove(); note(st.mode === 'github' ? 'OK. Press "Restart Bob now" whenever you like: it\'s on the top line of Settings, This replicant matrix and updates.' : 'OK. The new Bob takes over the next time Bob starts, or press Restart in the update window.'); return; }
    const r = await post('/api/update/restart', { when: b.dataset.r });
    el.remove();
    note(r.ok ? (b.dataset.r === 'done' ? 'I\'ll restart as soon as I\'ve finished.' : 'Restarting...') : (r.data.error || 'The update window didn\'t answer.'), r.ok ? '' : 'error');
  };
}
window.addEventListener('bob-update-started', () => { updAsked = false; watchUpdateReady(); });
