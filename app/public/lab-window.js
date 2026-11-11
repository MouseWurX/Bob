// The Computer Science Lab in its own window (public/lab.html). It draws the same Lab the main window shows on a
// phone, reads the Lab's progress from the server itself, and asks the main window (over a BroadcastChannel) to open
// Get models, Settings or the chat. Nothing here talks to the internet.
import { applySavedStyle } from './themes.js';
import { installTips } from './tips.js';
import { createLab } from './lab.js';
import { CHANNEL, message } from './lab-link.js';

applySavedStyle();
installTips();

const chan = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
const tell = (name, detail) => { try { chan?.postMessage(message(name, detail)); } catch {} };

const api = async (url, data) => {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
};

// A short line at the bottom of this window, and the same note in the main window.
const noteEl = document.getElementById('lab-note');
let noteTimer = 0;
const note = (text) => { noteEl.textContent = String(text || ''); clearTimeout(noteTimer); noteTimer = setTimeout(() => { noteEl.textContent = ''; }, 8000); tell('note', String(text || '')); };

const lab = createLab({ api, note, go: (where) => tell('go', where), page: true });
const dlg = document.getElementById('lab');
// The window's own buttons close it; Esc doesn't. If the page closes itself, the Lab comes straight back.
dlg.addEventListener('cancel', (e) => e.preventDefault());
dlg.addEventListener('close', () => lab.open());

// The Lab's progress, straight from the server: jobs, a full-size brain coming in, a diffusion brain writing.
function connect() {
  const es = new EventSource('/api/events');
  es.onmessage = (m) => {
    let ev; try { ev = JSON.parse(m.data); } catch { return; }
    if (ev.type === 'lab') lab.update(ev.run);
    else if (ev.type === 'lab-full') lab.fullUpdate(ev.full);
    else if (ev.type === 'lab-diffusion') document.dispatchEvent(new CustomEvent('lab-diffusion', { detail: ev.now }));
  };
}

lab.open();
connect();
