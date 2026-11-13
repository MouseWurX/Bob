// 1.5.211 The Discord group's own chat (src/room-gate.js), in Topics > Past chats. Read-only: the group's requests and
// Bob's replies, kept apart from your own chats. A request waiting for your OK has Accept and Decline. Only on this PC.
import { esc } from './rich.js';

const when = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const STATE = { waiting: 'Waiting for your OK', accepted: 'Accepted', working: 'Bob is on it', done: 'Answered', failed: 'Didn\'t work', declined: 'Declined' };

export function createRoomChat({ api }) {
  let data = null, msg = '';

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
    if (l.kind === 'bob') return `<li class="room-bob"><span class="muted">Bob, ${esc(when(l.at))}:</span> ${esc(l.text) || '<span class="muted">(no words)</span>'}${l.files ? ` <span class="tag">${l.files} file${l.files === 1 ? '' : 's'}</span>` : ''}</li>`;
    const waiting = l.state === 'waiting';
    const btns = waiting ? `<span class="row"><button type="button" class="mini" data-roomok="${esc(l.id)}">Accept</button><button type="button" class="mini" data-roomno="${esc(l.id)}">Decline</button></span>` : '';
    return `<li class="room-ask${waiting ? ' waiting' : ''}"><span class="muted">${esc(l.name)}, ${esc(when(l.at))}:</span> ${esc(l.text)} <span class="tag">${esc(STATE[l.state] || l.state)}${l.auto ? ' (auto)' : ''}</span>${btns}</li>`;
  }

  async function html() {
    const d = data || await load();
    if (!d) return '<p class="muted">The Discord chat isn\'t ready.</p><button type="button" class="mini" data-roomback>Back</button>';
    return `<div class="room-chat"><div class="row"><button type="button" class="mini" data-roomback>← Past chats</button><h3>💬 Discord group</h3></div>
      <p class="muted">${d.autoAccept ? 'Auto-accept is on: requests run without waiting for you.' : 'Each request waits here for your OK. Nothing runs until you accept it.'} Turn Auto-accept on or off in Settings, Discord.</p>
      ${msg ? `<p class="have" role="status">${esc(msg)}</p>` : ''}
      <ol class="room-lines" aria-label="Discord group chat">${d.lines.map((l) => lineHtml(l, d.lines)).join('') || '<li class="muted">Nothing yet.</li>'}</ol>
      ${d.lines.some((l) => l.state !== 'waiting') ? '<button type="button" class="mini" data-roomclear>Empty this chat (waiting requests stay)</button>' : ''}</div>`;
  }

  // A click inside the room view or on its row. Returns 'open' | 'back' | 'redraw' | null.
  async function click(b) {
    msg = '';
    if ('openroom' in b.dataset) { data = null; return 'open'; }
    if ('roomback' in b.dataset) return 'back';
    const id = b.dataset.roomok || b.dataset.roomno;
    try {
      if (id) { data = await api('/api/rooms/discord', { id, ok: Boolean(b.dataset.roomok) }); msg = b.dataset.roomok ? 'Accepted. Bob is on it.' : 'Declined.'; return 'redraw'; }
      if ('roomclear' in b.dataset) { data = await api('/api/rooms/discord', { clear: true }); msg = 'Emptied.'; return 'redraw'; }
    } catch (e) { msg = e.message; data = null; return 'redraw'; }
    return null;
  }

  return { rowHtml, html, click };
}
