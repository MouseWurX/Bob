// Settings in its own window (public/settings.html). It draws the same Settings page the main window used to
// show, and tells the main window what changed over a BroadcastChannel, so the chat, the left menu and Now running
// keep up without a reload. Nothing here talks to the internet.
import { applySavedStyle } from './themes.js';
import { startI18n } from './i18n.js';
import { createCellar } from './cellar.js';
import { watchLock } from './lock-settings.js';
import { createHelp } from './help.js';
import { installTips } from './tips.js';
import { CHANNEL, RELAY, jumpFromHash, message } from './settings-link.js';
import { applyReading } from './everyday.js';

applySavedStyle();
startI18n();
installTips();
watchLock(); // 🔒 back to the lock screen once Bob locks
// 🗓 Text size and the easier-to-read font apply here too, and follow a change made on this page.
let reading = {};
fetch('/api/settings').then((r) => r.json()).then((st) => { reading = { textSize: st.textSize, readableFont: st.readableFont }; applyReading(reading); }).catch(() => {});
window.addEventListener('bob-display', (e) => { const d = e.detail || {}; if ('textSize' in d || 'readableFont' in d) { reading = { ...reading, ...d }; applyReading(reading); } });

const chan = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
const tell = (name, detail) => { try { chan?.postMessage(message(name, detail)); } catch {} };

// What the Settings page announces in its own window goes to the main window too.
for (const name of RELAY) {
  const target = name === 'bob-door' ? document : window;
  target.addEventListener(name, (e) => tell(name, e.detail));
}

// "Listen for Hey Bob" and "Read replies aloud" live in the main window: the stand-in buttons pass the press on.
const read = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
for (const [id, key] of [['ear', 'bob-wake'], ['speak', 'bob-speak']]) {
  const b = document.getElementById(id);
  b.setAttribute('aria-pressed', String(read(key)));
  b.addEventListener('click', () => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); tell('bob-press', { id }); });
}

const cellar = createCellar();
createHelp();
const dlg = document.getElementById('cellar');
const open = () => { const jump = jumpFromHash(location.hash); return cellar.open('settings', null, jump ? { jump } : {}); };

// A change or a press in here may have changed Bob's look, theme or switches: the main window reads them again.
let timer = 0;
const changed = () => { clearTimeout(timer); timer = setTimeout(() => tell('bob-changed'), 600); };
dlg.addEventListener('change', changed);
dlg.addEventListener('click', changed);
window.addEventListener('pagehide', () => tell('bob-changed'));

// The window's own buttons close it; Esc and the page's Back don't. If the page closes itself (first-time setup
// finishing, say), Settings comes straight back.
dlg.addEventListener('cancel', (e) => e.preventDefault());
dlg.addEventListener('close', () => open());
window.addEventListener('hashchange', open);
// The main window asks this one to go to a section (the Bob-Net heading in Now running, a card's link).
chan?.addEventListener('message', (e) => { const m = e.data || {}; if (m.from === 'main' && m.name === 'bob-goto') { location.hash = m.detail ? '#' + encodeURIComponent(m.detail) : ''; if (!m.detail) open(); window.focus(); } });

open();
