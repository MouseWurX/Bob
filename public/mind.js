// 1.5.53: "Bob's thinking", a small window that stays on top and shows what's going on in Bob's brain, live:
// which brain is working (on the graphics card or the processor), his thinking as it streams, moots, brain
// loads and swaps, every tool step and the notes he keeps. Opened from the chat page (💭 Bob's thinking).
// Light by design: Bob only passes his thinking along while a window like this is open (server.js mindClients),
// in small batches, and nothing here is saved. Closing the window stops all of it.
import { applySavedStyle } from './themes.js';
import { esc, brainsLine, toolLine, thinkLabel } from './mind-lines.js';
applySavedStyle();

const $ = (id) => document.getElementById(id);
const log = $('mindLog'), nowEl = $('mindNow'), brainsEl = $('mindBrains'), followBtn = $('mindFollow');
const MAX_LINES = 400, MAX_THINK = 20000;
const STATE = { idle: 'Quiet', thinking: 'Thinking', waking: 'Waking up', loading: 'Loading a brain', waiting: 'Waiting for your OK', painting: 'Making a picture or sound', working: 'Working' };

const copies = {}; // the copy names from the hat lines (Bobcat, Robert...), so a 💭 box names them the same way
let follow = true, thinkEl = null, answering = new Set(), status = null, brains = null;

const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function keepDown() { if (follow) log.scrollTop = log.scrollHeight; }
function trim() { while (log.childElementCount > MAX_LINES) log.firstElementChild.remove(); }
function line(html, cls = '') {
  thinkEl = null; // the next thinking starts a new block under this line
  const el = document.createElement('div');
  el.className = `mind-line ${cls}`;
  el.innerHTML = `<span class="t">${time()}</span>${html}`;
  log.append(el); trim(); keepDown();
  return el;
}

// One block per brain call; the text grows as the thinking arrives. Very long thinking keeps its newest part.
function thinkBlock(ev) {
  thinkEl = document.createElement('div');
  thinkEl.className = 'mind-think';
  thinkEl.innerHTML = `<div class="who">${esc(thinkLabel(ev, copies))}</div><div class="text"></div>`;
  log.append(thinkEl); trim(); keepDown();
  return thinkEl;
}
function think(ev) {
  const el = thinkEl || thinkBlock(ev);
  const t = el.querySelector('.text');
  let s = t.textContent + ev.text;
  if (s.length > MAX_THINK) s = '…' + s.slice(-MAX_THINK);
  t.textContent = s;
  keepDown();
}

function drawHead() {
  const s = status?.state || 'idle';
  nowEl.textContent = `${STATE[s] || s}${status?.detail ? `: ${status.detail}` : ''}`;
  brainsEl.textContent = brains ? brainsLine(brains) : '';
}
let soon = null;
function refreshBrains() {
  clearTimeout(soon);
  soon = setTimeout(async () => { try { brains = await (await fetch('/api/brain')).json(); drawHead(); } catch {} }, 250);
}

function onEvent(ev) {
  switch (ev.type) {
    case 'status': status = ev; drawHead(); refreshBrains(); return;
    case 'brain': refreshBrains(); return;
    case 'start': line('New message', 'mind-turn'); return;
    case 'think-start': thinkBlock(ev); return;
    case 'think': think(ev); return;
    case 'token':
      if (ev.turnId && !answering.has(ev.turnId) && String(ev.text || '').trim()) { answering.add(ev.turnId); line('✍ Writing the answer in the chat'); }
      return;
    case 'hat':
      if (ev.copy) copies[ev.hat] = ev.copy;
      if (ev.hat === 'reviewer') { if (!ev.quiet) line(`🛰 Moot: Bob calls in ${esc(ev.copy || 'his reviewer')}, his reviewer, for a second look`, 'mind-moot'); }
      else line(ev.copy ? `↪ Bob hands this to ${esc(ev.copy)}, his ${esc(ev.label)} copy` : `↪ Bob switches to ${esc(ev.label)}`);
      return;
    case 'announce': line(`${/🛰/.test(ev.text || '') ? '' : '📣 '}${esc(ev.text)}`, /🛰/.test(ev.text || '') ? 'mind-moot' : ''); return;
    case 'tool': { const t = toolLine(ev); if (t) line(esc(t[0]), t[1]); return; } // steps in monospace, notes not
    case 'approval': line(`✋ Waiting for your OK: ${esc(ev.text)}`); return;
    case 'correction': case 'error': line(`⚠ ${esc(ev.text)}`, 'mind-err'); return;
    case 'done': if (ev.turnId) answering.delete(ev.turnId); line('✓ Done'); return;
  }
}

function connect() {
  const es = new EventSource('/api/events?mind=1');
  es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch (e) { console.error(e); } };
  es.onerror = () => { nowEl.textContent = 'Bob\'s brain isn\'t answering. Retrying...'; };
}

followBtn.onclick = () => {
  follow = !follow;
  followBtn.setAttribute('aria-checked', String(follow));
  followBtn.querySelector('.st').textContent = follow ? 'On' : 'Off';
  keepDown();
};
// Scrolling up to read stops following; scrolling back to the bottom starts it again.
log.addEventListener('scroll', () => {
  const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
  if (atEnd !== follow) followBtn.click();
});
$('mindClear').onclick = () => { log.replaceChildren(); thinkEl = null; };

connect();
refreshBrains();
