// 1.5.138: the live view of Bob's brain, shared by the pop-out window (public/mind.js) and the "Bob's thinking"
// section of Now running (public/layout.js, docked). It draws the header (what Bob is doing, which brains he holds),
// the log (his thinking as it streams, moots, brain loads and swaps, every tool step, the notes he keeps), and runs
// Follow along and Clear. Light by design: it listens to /api/events?mind=1 only while connect() is on, Bob passes his
// thinking along only while someone listens (server.js mindClients), and nothing here is saved.
import { esc, brainsLine, toolLine, thinkLabel } from './mind-lines.js';

export const MAX_LINES = 400, MAX_THINK = 20000;
// 1.5.149 Order: 'time' (newest at the bottom, the default), 'newest' (newest at the top), 'who' (grouped by who was
// thinking: Bob first, then his copies, each group in time order). Remembered per window of Bob (bob-mind-order).
export const ORDERS = ['time', 'newest', 'who'];
export const cleanOrder = (v) => (ORDERS.includes(v) ? v : 'time');
const STATE = { idle: 'Quiet', thinking: 'Thinking', waking: 'Waking up', loading: 'Loading a brain', waiting: 'Waiting for your OK', painting: 'Making a picture or sound', working: 'Working' };

// els: { log, now, brains, follow, clear, order }. `now`, `brains` and `order` (a <select>) may be missing.
export function createMindView(els) {
  const { log, now: nowEl, brains: brainsEl, follow: followBtn, clear: clearBtn, order: orderEl } = els;
  const copies = {}; // the copy names from the hat lines (Bobcat, Robert...), so a 💭 box names them the same way
  let follow = true, thinkEl = null, answering = new Set(), status = null, brains = null, es = null;
  let order = 'time', who = 'bob'; // who: whose turn the next plain line belongs to (the last think-start), for the "Bob, then his copies" order
  try { order = cleanOrder(localStorage.getItem('bob-mind-order')); } catch {}
  const WHO_RANK = { bob: 0, reviewer: 1, tinker: 2, ledger: 3, scout: 4, painter: 5, eyes: 6 };
  const place = (el) => { el.dataset.who = who; el.style.order = order === 'who' ? String(WHO_RANK[who] ?? 9) : ''; };

  const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function keepDown() { if (follow) log.scrollTop = order === 'newest' ? 0 : log.scrollHeight; } // the newest line is at the top in that order
  // Newest at the top puts new lines first in the page (no column-reverse: its scrolling starts at the wrong end).
  const put = (el) => (order === 'newest' ? log.prepend(el) : log.append(el));
  const oldest = () => (order === 'newest' ? log.lastElementChild : log.firstElementChild);
  function trim() { while (log.childElementCount > MAX_LINES) oldest().remove(); }
  function line(html, cls = '') {
    thinkEl = null; // the next thinking starts a new block under this line
    const el = document.createElement('div');
    el.className = `mind-line ${cls}`;
    el.innerHTML = `<span class="t">${time()}</span>${html}`;
    place(el);
    put(el); trim(); keepDown();
    return el;
  }

  // One block per brain call; the text grows as the thinking arrives. Very long thinking keeps its newest part.
  function thinkBlock(ev) {
    thinkEl = document.createElement('div');
    thinkEl.className = 'mind-think';
    thinkEl.innerHTML = `<div class="who">${esc(thinkLabel(ev, copies))}</div><div class="text"></div>`;
    who = ev.who || 'bob'; place(thinkEl);
    put(thinkEl); trim(); keepDown();
    return thinkEl;
  }
  function think(ev) {
    const el = thinkEl || thinkBlock(ev);
    const t = el.querySelector('.text');
    let s = t.textContent + ev.text;
    if (s.length > MAX_THINK) s = '…' + s.slice(-MAX_THINK);
    t.textContent = s; // thinking is shown as text, never as HTML
    keepDown();
  }

  function drawHead() {
    const s = status?.state || 'idle';
    if (nowEl) nowEl.textContent = `${STATE[s] || s}${status?.detail ? `: ${status.detail}` : ''}`;
    if (brainsEl) brainsEl.textContent = brains ? brainsLine(brains) : '';
  }
  let soon = null;
  function refreshBrains() {
    if (!brainsEl) return;
    clearTimeout(soon);
    soon = setTimeout(async () => { try { brains = await (await fetch('/api/brain')).json(); drawHead(); } catch {} }, 250);
  }

  function onEvent(ev) {
    switch (ev.type) {
      case 'status': status = ev; drawHead(); refreshBrains(); return;
      case 'brain': refreshBrains(); return;
      case 'start': who = 'bob'; line('New message', 'mind-turn'); return;
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

  // Listening starts and stops with connect()/disconnect(): the window listens while it's open, the dock while it's shown.
  function connect() {
    if (es) return;
    es = new EventSource('/api/events?mind=1');
    es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch (e) { console.error(e); } };
    es.onerror = () => { if (nowEl) nowEl.textContent = 'Bob\'s brain isn\'t answering. Retrying...'; };
    refreshBrains();
  }
  function disconnect() { if (es) { es.close(); es = null; } }

  function setFollow(on) {
    follow = on;
    if (followBtn) { followBtn.setAttribute('aria-checked', String(follow)); const st = followBtn.querySelector('.st'); if (st) st.textContent = follow ? 'On' : 'Off'; }
    keepDown();
  }
  followBtn?.addEventListener('click', () => setFollow(!follow));
  // Scrolling up to read stops following; scrolling back to the bottom starts it again.
  log.addEventListener('scroll', () => {
    const atEnd = order === 'newest' ? log.scrollTop < 24 : log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    if (atEnd !== follow) setFollow(atEnd);
  });
  // Order: the lines stay in the page in the order they came; CSS turns the column round (newest) or groups it (who).
  function setOrder(v) {
    const next = cleanOrder(v);
    if ((next === 'newest') !== (order === 'newest')) log.append(...[...log.children].reverse()); // turn the page order round
    order = next;
    try { localStorage.setItem('bob-mind-order', order); } catch {}
    log.classList.toggle('newest-first', order === 'newest');
    log.classList.toggle('by-who', order === 'who');
    for (const el of log.children) el.style.order = order === 'who' ? String(WHO_RANK[el.dataset.who] ?? 9) : '';
    log.setAttribute('aria-label', order === 'newest' ? 'Bob\'s thinking, newest at the top' : order === 'who' ? 'Bob\'s thinking, grouped by who was thinking' : 'Bob\'s thinking, newest at the bottom');
    if (orderEl) orderEl.value = order;
    keepDown();
  }
  orderEl?.addEventListener('change', () => setOrder(orderEl.value));
  { const o = order; order = 'time'; setOrder(o); } // apply the remembered order to the empty log and the <select>
  const clear = () => { log.replaceChildren(); thinkEl = null; };
  clearBtn?.addEventListener('click', clear);

  return { onEvent, refreshBrains, connect, disconnect, clear, setFollow, setOrder, order: () => order, listening: () => Boolean(es) };
}
