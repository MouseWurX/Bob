// Fade old messages, Clear chat and 🫥 Amnesia mode in the chat (src/fade-chat.js, src/amnesia.js on the server).
//   - With fading on, a line at the top of the chat says how many messages faded, with Show them and 🧹 Clear chat.
//     Every 20 seconds a turn past its time dims for a moment, then the chat redraws without it.
//   - Clear chat asks first, in a box with "Delete it for good" (unticked). Also in Settings and Find anything.
//   - With "Offer Amnesia mode" on, 🫥 Amnesia sits beside Web search. While it's on: a banner at the top of the chat,
//     a purple edge on the box you type in, and the button reads On. Turning it off shows what he'll forget first.
// Nothing here adds to what the brain reads.
import { esc } from './rich.js';

const get = (u) => fetch(u).then((r) => r.json());
const post = (u, d) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(d) }).then(async (r) => { const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || 'That didn\'t work.'); return data; });
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export function fadeWords(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m && m % 1440 === 0) { const d = m / 1440; return d % 7 === 0 && d < 28 ? plural(d / 7, 'week') : plural(d, 'day'); }
  if (m >= 60) { const h = Math.floor(m / 60), r = m % 60; return `${plural(h, 'hour')}${r ? ` ${r} min` : ''}`; }
  return `${m} min`;
}

// A small box that asks first. Resolves with { ok, ticked } once a button is pressed (Esc = no).
export function askBox({ title, text, list = [], tick = null, yes, no, danger = true }) {
  return new Promise((done) => {
    const d = document.createElement('dialog');
    d.className = 'fade-ask';
    d.setAttribute('aria-labelledby', 'fadeAskTitle');
    d.innerHTML = `<form method="dialog"><h3 id="fadeAskTitle">${esc(title)}</h3><p>${esc(text)}</p>
      ${list.length ? `<ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${tick ? `<label class="fade-tick"><input type="checkbox" ${tick.on ? 'checked' : ''}><span>${esc(tick.label)}<small>${esc(tick.note || '')}</small></span></label>` : ''}
      <div class="fade-row"><button type="submit" value="no" autofocus>${esc(no)}</button><button type="submit" value="yes" class="${danger ? 'danger' : ''}">${esc(yes)}</button></div></form>`;
    document.body.append(d);
    d.addEventListener('close', () => { const ok = d.returnValue === 'yes'; const ticked = Boolean(d.querySelector('.fade-tick input')?.checked); d.remove(); done({ ok, ticked }); });
    d.showModal();
  });
}

// app: { log, session(), busy(), reload(), note(text, kind), input }
export function createFadeChat(app) {
  let st = { fade: { on: false, minutes: 60, mode: 'hide' }, faded: 0, clearedAt: 0, amnesia: { on: false, offered: false } };
  let showAll = false;
  let fading = false;
  // One redraw at a time: a click and the server's event can both ask, and two at once would draw the chat twice.
  let drawing = null, again = false;
  function reload() {
    if (drawing) { again = true; return drawing; }
    drawing = (async () => { try { do { again = false; await app.reload(); } while (again); } finally { drawing = null; } })();
    return drawing;
  }

  // ---- 🫥 the button beside Web search
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'amnesiaBtn'; btn.className = 'brain-switch amnesia-btn'; btn.setAttribute('role', 'switch'); btn.hidden = true;
  btn.innerHTML = '<span class="lbl">🫥 Amnesia</span><span class="st">Off</span>';
  btn.title = 'Amnesia mode: when you turn it off, Bob forgets everything from while it was on';
  const web = document.getElementById('webBtn');
  if (web) web.after(btn); else document.getElementById('effort')?.append(btn);
  btn.addEventListener('click', () => (st.amnesia.on ? amnesiaOff() : amnesiaOn()));

  function drawAmnesia() {
    const a = st.amnesia || {};
    btn.hidden = !(a.offered || a.on);
    btn.setAttribute('aria-checked', a.on ? 'true' : 'false');
    btn.querySelector('.st').textContent = a.on ? 'On' : 'Off';
    document.body.classList.toggle('amnesia-on', Boolean(a.on));
  }

  // ---- The line (and the banner) at the top of the chat
  function drawTop() {
    const log = app.log;
    log.querySelectorAll(':scope > .fade-line, :scope > .amnesia-bar').forEach((e) => e.remove());
    const a = st.amnesia || {};
    if (a.on) {
      const bar = document.createElement('div');
      bar.className = 'amnesia-bar'; bar.setAttribute('role', 'status');
      bar.innerHTML = `<span class="amn-ic" aria-hidden="true">🫥</span><span class="amn-t"><b>Amnesia mode is on</b> since ${esc(clock(a.since))}. Bob is working as usual. When you turn it off, he forgets all of it.${a.autoOff ? ` It turns off by itself at ${esc(clock(a.autoOff))}.` : ''}</span><button type="button">Turn off and forget</button>`;
      bar.querySelector('button').onclick = () => amnesiaOff();
      log.prepend(bar);
    }
    const f = st.fade || {};
    const gone = !showAll && st.faded > 0;
    if (!f.on && !gone && !showAll) return;
    const line = document.createElement('div');
    line.className = 'fade-line'; line.setAttribute('role', 'status');
    const what = showAll ? 'Showing faded messages too' : gone ? `${plural(st.faded, 'older message')} ${f.on && f.mode === 'delete' ? 'faded away' : 'faded into memory'}` : 'Nothing has faded yet';
    line.innerHTML = `<span class="hg" aria-hidden="true">⌛</span><span>${esc(what)}</span>${f.on ? `<span class="fade-after">· after ${esc(fadeWords(f.minutes))}</span>` : ''}
      ${gone || showAll ? `<button type="button" class="plain" data-fade="show">${showAll ? 'Hide them again' : 'Show them'}</button>` : ''}<button type="button" data-fade="clear">🧹 Clear chat</button>`;
    line.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fade]');
      if (!b) return;
      if (b.dataset.fade === 'show') { showAll = !showAll; reload(); }
      if (b.dataset.fade === 'clear') clearChat();
    });
    const after = log.querySelector(':scope > .amnesia-bar');
    if (after) after.after(line); else log.prepend(line);
  }

  async function refresh() {
    try { st = await get('/api/fade?session=' + encodeURIComponent(app.session())); } catch { return; }
    drawAmnesia(); drawTop();
  }

  // ---- Clear chat
  async function clearChat() {
    if (app.busy()) { app.note('Bob is still on this chat. Wait until he has finished, or press Stop.'); return; }
    const r = await askBox({
      title: 'Clear this chat?', text: 'Every message leaves the chat. Bob still remembers it, and Topics and search still find it.',
      tick: { on: false, label: 'Delete it for good', note: 'For privacy: gone from disk, Topics and search. Can\'t be undone. His notes and memory stay.' },
      yes: 'Clear chat', no: 'Keep it'
    });
    if (!r.ok) return;
    try { await post('/api/chat/clear', { sessionId: app.session(), forGood: r.ticked }); }
    catch (e) { app.note(e.message, 'error'); return; }
    showAll = false;
    await reload();
    app.note(r.ticked ? 'Chat cleared and deleted for good.' : 'Chat cleared. Bob still remembers it; Topics has it in full.');
  }

  // ---- Amnesia mode
  async function amnesiaOn() {
    try { st.amnesia = await post('/api/amnesia', { on: true }); } catch (e) { app.note(e.message, 'error'); return; }
    drawAmnesia(); drawTop();
  }
  async function amnesiaOff() {
    let a = st.amnesia;
    try { a = await get('/api/amnesia'); } catch {}
    if (!a.on) { st.amnesia = a; drawAmnesia(); drawTop(); return; }
    const list = [`${plural(a.chats || 0, 'chat')}, ${plural(a.messages || 0, 'message')} and his thinking`, plural(a.notes || 0, 'note'), plural(a.memory || 0, 'memory line'), plural(a.topics || 0, 'topic')];
    const r = await askBox({
      title: 'Turn off Amnesia mode?', text: `Bob forgets everything since ${clock(a.since)}:`, list,
      tick: { on: Boolean(a.deleteMade), label: 'Also delete what he made', note: a.made ? `${plural(a.made, 'new file')}. Unticked: they stay where they are. Files he only changed always stay.` : 'Nothing new so far. Files he only changed always stay.' },
      yes: 'Forget it all', no: 'Keep it on'
    });
    if (!r.ok) return;
    try { st.amnesia = await post('/api/amnesia', { on: false, deleteMade: r.ticked }); }
    catch (e) { app.note(e.message, 'error'); return; }
    await reload();
    app.note('Amnesia mode is off. Bob has forgotten that stretch.');
  }

  // ---- Fading as you watch: a turn past its time dims, then the chat redraws without it.
  function tick() {
    const f = st.fade || {};
    const log = app.log;
    const now = Date.now();
    for (const el of log.querySelectorAll('.msg:not([data-at])')) el.dataset.at = String(now); // said in this window just now
    if (!f.on || showAll || fading || app.busy()) return;
    const cut = now - f.minutes * 60e3;
    const old = [...log.querySelectorAll('.msg[data-at]')].filter((el) => Number(el.dataset.at) < cut);
    if (!old.length) return;
    fading = true;
    old.forEach((el) => el.classList.add('fading-out'));
    setTimeout(async () => { fading = false; if (!app.busy()) await reload(); }, document.body.classList.contains('still') ? 0 : 1500);
  }
  setInterval(tick, 20000);

  return {
    get showAll() { return showAll; },
    refresh,
    clearChat,
    // After the chat is drawn (loadHistory): the line and banner go on top.
    drawn() { refresh(); },
    // A new or another chat: start with faded messages hidden again.
    moved() { showAll = false; },
    // Server events: something faded, a chat was cleared, Amnesia mode changed.
    onEvent(ev) {
      if (ev.type === 'chat-faded' || (ev.type === 'chat-cleared' && ev.sessionId === app.session())) { if (!app.busy()) reload(); else refresh(); return true; }
      if (ev.type === 'amnesia-on' || ev.type === 'amnesia-off') { if (ev.type === 'amnesia-off' && !app.busy()) reload(); else refresh(); return true; }
      return false;
    }
  };
}
