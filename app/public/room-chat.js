// 1.5.211 The Discord group's own chat (src/room-gate.js), in Topics > Past chats. Read-only: the group's requests and
// Bob's replies, kept apart from your own chats. A request waiting for your OK has Accept and Decline. Only on this PC.
import { esc } from './rich.js';

const when = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const STATE = { waiting: 'Waiting for your OK', accepted: 'Accepted', working: 'Bob is on it', done: 'Answered', failed: 'Didn\'t work', declined: 'Declined' };

// 1.5.228: each Discord channel is its own page, with a tab for each; Bob's replies sit on their request's page. Each
// channel on Bob's list has a page, and a box at the bottom to talk there through Bob (two-way, not only a record).
// Pages: [{ id, name, waiting, lines }], the newest talk first. Pure, for tests.
export function roomPages(lines = [], channels = []) {
  const byId = new Map(lines.filter((l) => l.kind === 'ask').map((l) => [l.id, l]));
  const pages = new Map();
  const page = (id) => { if (!pages.has(id)) pages.set(id, { id, name: '', waiting: 0, last: 0, lines: [], listed: false }); return pages.get(id); };
  for (const c of channels) { const p = page(String(c.id)); p.listed = true; if (c.name) p.name = c.name; } // 1.5.228 a page for every listed channel
  for (const l of lines) {
    const ask = l.kind === 'ask' ? l : l.kind === 'me' ? l : byId.get(l.to); // 'me': what you said there through Bob
    const p = page(String(ask?.where || 'other'));
    if (ask?.whereName) p.name = ask.whereName;
    if (l.kind === 'ask' && l.state === 'waiting') p.waiting++;
    p.last = Math.max(p.last, l.at || 0);
    p.lines.push(l);
  }
  for (const p of pages.values()) p.name = p.name ? `#${p.name}` : p.id === 'other' ? 'Other' : `Channel …${p.id.slice(-4)}`;
  return [...pages.values()].sort((a, b) => (b.waiting > 0) - (a.waiting > 0) || b.last - a.last);
}

export function createRoomChat({ api }) {
  let data = null, msg = '', page = '', draft = '';

  async function load() {
    try { data = await api('/api/rooms/discord'); } catch { data = null; }
    return data;
  }

  // The row at the top of Past chats. Nothing when Discord isn't set up and the chat is empty.
  async function rowHtml() {
    const d = await load();
    if (!d || (!d.on && !d.lines.length)) return '';
    const n = d.waiting;
    return `<ol class="chat-list room-row"><li data-room="discord"><div><strong>💬 Discord group</strong> <span class="tag">${n ? `${n} waiting for your OK` : 'its own chat'}</span>
      <div class="muted">What people ask Bob in your Discord server, and his replies. Kept apart from your chats and memory.</div></div>
      <span class="row"><button type="button" class="mini" data-openroom>Open</button></span></li></ol>`;
  }

  function lineHtml(l, all) {
    if (l.kind === 'me') return `<li class="room-me"><span class="muted">You, through Bob, ${esc(when(l.at))}:</span> ${esc(l.text)}</li>`;
    if (l.kind === 'bob') return `<li class="room-bob"><span class="muted">Bob, ${esc(when(l.at))}:</span> ${esc(l.text) || '<span class="muted">(no words)</span>'}${l.files ? ` <span class="tag">${l.files} file${l.files === 1 ? '' : 's'}</span>` : ''}</li>`;
    const waiting = l.state === 'waiting';
    const btns = waiting ? `<span class="row"><button type="button" class="mini" data-roomok="${esc(l.id)}">Accept</button><button type="button" class="mini" data-roomno="${esc(l.id)}">Decline</button></span>` : '';
    return `<li class="room-ask${waiting ? ' waiting' : ''}"><span class="muted">${esc(l.name)}, ${esc(when(l.at))}:</span> ${esc(l.text)} <span class="tag">${esc(STATE[l.state] || l.state)}${l.auto ? ' (auto)' : ''}</span>${btns}</li>`;
  }

  async function html() {
    const d = data || await load();
    if (!d) return '<p class="muted">The Discord chat isn\'t ready.</p><button type="button" class="mini" data-roomback>Back</button>';
    const pages = roomPages(d.lines, d.channels || []);
    const cur = pages.find((p) => p.id === page) || pages[0];
    if (cur) page = cur.id;
    const tabs = pages.length > 1 ? `<div class="tabs room-tabs" role="tablist" aria-label="Discord channels">${pages.map((p) => `<button type="button" role="tab" data-roomtab="${esc(p.id)}" aria-selected="${p === cur}">${esc(p.name)}${p.waiting ? ` <span class="count">${p.waiting}</span>` : ''}</button>`).join('')}</div>` : '';
    return `<div class="room-chat"><div class="row"><button type="button" class="mini" data-roomback>← Past chats</button><h3>💬 Discord${cur ? ` · ${esc(cur.name)}` : ''}</h3></div>
      <p class="muted">${d.autoAccept ? 'Auto-accept is on: requests run without waiting for you.' : 'Each request waits here for your OK. Nothing runs until you accept it.'} Turn Auto-accept on or off in Settings, Discord.</p>
      ${tabs}
      ${msg ? `<p class="have" role="status">${esc(msg)}</p>` : ''}
      <ol class="room-lines" aria-label="${esc(cur ? `Discord ${cur.name}` : 'Discord group chat')}">${(cur?.lines || []).map((l) => lineHtml(l)).join('') || '<li class="muted">Nothing yet. Only messages that call Bob, in the channels on his list, show here.</li>'}</ol>
      ${cur?.listed ? `<div class="room-say"><label class="muted" for="room-say-text">Say something in ${esc(cur.name)} as Bob${d.connected ? '' : ' (I\'m not connected right now)'}</label>
        <div class="row"><textarea id="room-say-text" rows="2" maxlength="3800" data-roomdraft placeholder="Type here. Nobody gets pinged.">${esc(draft)}</textarea><button type="button" class="mini" data-roomsay="${esc(cur.id)}"${d.connected ? '' : ' disabled'}>Send</button></div></div>` : ''}
      ${d.lines.some((l) => l.state !== 'waiting') ? '<button type="button" class="mini" data-roomclear>Empty this chat (waiting requests stay)</button>' : ''}</div>`;
  }

  // A click inside the room view or on its row. Returns 'open' | 'back' | 'redraw' | null.
  async function click(b) {
    msg = '';
    if ('openroom' in b.dataset) { data = null; return 'open'; }
    if ('roomback' in b.dataset) return 'back';
    if (b.dataset.roomtab) { page = b.dataset.roomtab; draft = ''; return 'redraw'; }
    if (b.dataset.roomsay) {
      const box = b.closest('.room-say')?.querySelector('textarea');
      draft = box?.value || '';
      if (!draft.trim()) { msg = 'Type something first.'; return 'redraw'; }
      try { data = await api('/api/rooms/discord', { say: { where: b.dataset.roomsay, text: draft } }); draft = ''; msg = 'Sent.'; } catch (e) { msg = e.message; }
      return 'redraw';
    }
    const id = b.dataset.roomok || b.dataset.roomno;
    try {
      if (id) { data = await api('/api/rooms/discord', { id, ok: Boolean(b.dataset.roomok) }); msg = b.dataset.roomok ? 'Accepted. Bob is on it.' : 'Declined.'; return 'redraw'; }
      if ('roomclear' in b.dataset) { data = await api('/api/rooms/discord', { clear: true }); msg = 'Emptied.'; return 'redraw'; }
    } catch (e) { msg = e.message; data = null; return 'redraw'; }
    return null;
  }

  // Opening it from the Discord icon (Bob-Net icons): fresh, on the page with something waiting.
  const fresh = () => { data = null; page = ''; msg = ''; draft = ''; };
  return { rowHtml, html, click, fresh };
}
