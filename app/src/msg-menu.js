// The "..." menu on a chat message (the window's chat): Copy, Edit and Delete.
//
// It sits at the top right of a message and shows when the mouse is over it (always, on a touch screen). Copy is there
// for every message. Edit and Delete follow "Try again, Edit and Delete" (Settings, How Bob works;
// on unless you turn it off, the owner's call, like Try again in redo.js):
//   - Edit on your message: change what you said and send it again (redo.js; what came after is kept as a version).
//   - Edit on Bob's message: change his words, and nothing is sent. Bob reads the new words from then on, so you can fix
//     a wrong fact he'd otherwise build on. The chat shows "edited", and pressing it shows what he said first.
//   - Delete on your message: your message and Bob's answer to it go (everything up to your next message), so Bob is
//     never left with an answer to a question that isn't there.
//   - Delete on Bob's message: only that answer goes. A step where he also used a tool keeps the tool part (without it
//     the brain can't read the chat) and loses only the words.
// Pictures, songs and files Bob made stay in their folder; only the chat loses them. Only the recent part of the chat
// (the part Bob reads every turn) can be changed, and only while no job of that chat is waiting or running.
import { redoOn, chatBusy, BUSY_LINE } from './redo.js';

export const MAX_TEXT = 20000;
const squash = (s) => String(s ?? '').replace(/\r\n/g, '\n');
const OFF = '"Try again, Edit and Delete" is off (Settings, How Bob works).';
const OLDER = 'That message is in the older part of this chat, which Bob keeps summed up. Only the recent part can be changed.';

// Change the words of one of Bob's messages. Returns { msg, before, after } or { error }.
export function changeBob(msgs, args = {}, now = Date.now()) {
  if (!Array.isArray(msgs)) return { error: 'There is nothing in this chat yet.' };
  const msg = msgs.find((m) => m?.role === 'assistant' && m.id && m.id === String(args.id || ''));
  if (!msg) return { error: OLDER };
  const before = squash(msg.content);
  const after = squash(args.text).trim().slice(0, MAX_TEXT);
  if (!after) return { error: 'A message can\'t be changed to nothing. Press Delete to take it out instead.' };
  if (after === before.trim()) return { error: 'That message already says that. Nothing changed.' };
  if (msg.was == null) msg.was = before;
  msg.content = after;
  msg.edited = now;
  msg.edits = (msg.edits || 0) + 1;
  msg.editedBy = 'you';
  if (!msg.at) msg.at = now;
  return { msg, before, after };
}

// Take a message out of the chat. Returns { removed: [ids], role } or { error }.
export function removeMsg(msgs, args = {}) {
  if (!Array.isArray(msgs)) return { error: 'There is nothing in this chat yet.' };
  const id = String(args.id || '');
  const at = id ? msgs.findIndex((m) => (m?.role === 'user' || m?.role === 'assistant') && m.id === id) : -1;
  if (at < 0) return { error: OLDER };
  const msg = msgs[at];
  if (msg.role === 'user') {
    let end = at + 1;
    while (end < msgs.length && msgs[end]?.role !== 'user') end++;
    const gone = msgs.splice(at, end - at);
    return { role: 'user', removed: gone.map((m) => m.id).filter(Boolean) };
  }
  if (msg.tool_calls?.length) {
    // The tool call and its result have to stay together, or the brain can't read the chat. Only his words go.
    msg.content = '';
    delete msg.media; delete msg.was; delete msg.edited; delete msg.edits; delete msg.editedBy;
    return { role: 'assistant', removed: [id] };
  }
  msgs.splice(at, 1);
  return { role: 'assistant', removed: [id] };
}

// The whole step, as the server runs it: check, change, save, tell the other windows of this chat.
//   action 'edit'   { id, text }  Bob's message gets new words (your own messages use /api/chat/redo).
//   action 'delete' { id }        the message goes (yours: with Bob's answer to it).
export function msgMenu(brain, sessionId, action, args = {}) {
  if (!redoOn(brain.cfg)) return { error: OFF };
  if (chatBusy(brain, sessionId)) return { error: BUSY_LINE };
  const msgs = brain.session(sessionId);
  if (action === 'edit') {
    const r = changeBob(msgs, args);
    if (r.error) return r;
    brain.saveSession(sessionId);
    brain.log?.('chat', `you edited Bob's message ${r.msg.id}`);
    // Its own event name: Discord and Telegram act on 'edited' (Bob fixing a message he sent there), this one is the window's.
    brain.broadcast?.({ type: 'msg-edited', sessionId, id: r.msg.id, text: r.after, before: r.before, was: r.msg.was, edits: r.msg.edits, by: 'you' });
    return { ok: true, id: r.msg.id, text: r.after, was: r.msg.was };
  }
  if (action === 'delete') {
    const r = removeMsg(msgs, args);
    if (r.error) return r;
    brain.saveSession(sessionId);
    brain.log?.('chat', `deleted ${r.role === 'user' ? 'your message and Bob\'s answer' : 'Bob\'s message'} (${r.removed.length} gone)`);
    brain.broadcast?.({ type: 'rewound', sessionId, id: String(args.id || '') });
    return { ok: true, removed: r.removed };
  }
  return { error: 'Say edit or delete.' };
}
