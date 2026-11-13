// Try again and Edit in the chat (Settings, How Bob works: "Try again, Edit and Delete"; Delete is in msg-menu.js). On unless you turn
// it off (the owner's call, Nov 11 2026: an exception to opt-in, like the Lab button; nothing runs by itself).
//
//   - Try again, under Bob's latest answer: his answer to your last message is taken back and he answers it afresh.
//   - Edit, under one of your messages: you change what you said and send it again. Bob answers from there, so what
//     came after that message in the chat is taken back.
// Nothing is thrown away: what was taken back (your words then, and everything said after them) is kept with your
// message as an earlier version, the last KEEP_VERSIONS of them, and the chat shows them under it.
// Only the recent part of the chat (the part Bob reads every turn) can be changed, and only while no job of that chat
// is waiting or running.
import { said, newMsgId } from './chats.js';

export const redoOn = (cfg) => cfg?.chatRedo !== false;
export const KEEP_VERSIONS = 5;
export const MAX_TEXT = 20000;
const KEEP_SAID = 40, KEEP_CHARS = 6000;

// The hidden line the brain gets on a Try again (the chat shows only your message, once).
export const REDO_NOTE = 'The user pressed Try again: answer their message above afresh. Don\'t mention an earlier answer unless they ask.';
export const EDIT_NOTE = 'The user edited their message above and sent it again: answer it as it reads now.';

const isUser = (m) => m?.role === 'user' && !m.forgotten;
// What the user saw after a message (no tool steps, no hidden notes): kept with the version.
const spokenAfter = (list) => list
  .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.hidden && !m.tool_calls?.length && (String(said(m)).trim() || m.media?.length || m.correction))
  .slice(0, KEEP_SAID)
  .map((m) => ({ role: m.role, content: String(said(m) || m.correction || '').slice(0, KEEP_CHARS), ...(m.media?.length ? { media: m.media.slice(0, 24) } : {}) }));

// The change itself, on the recent part of a chat. Returns { msg, text, edited } or { error }.
//   rewind(msgs)                       Try again: the latest message of yours stays, everything after it goes.
//   rewind(msgs, { id, text })         Edit: that message of yours gets the new words, everything after it goes.
//   rewind(msgs, { last: true, text }) Edit your latest message (the phone app, which has no message ids).
export function rewind(msgs, args = {}, now = Date.now()) {
  if (!Array.isArray(msgs)) return { error: 'There is nothing in this chat yet.' };
  const editing = typeof args.text === 'string';
  let at = -1;
  if (editing && args.id) at = msgs.findIndex((m) => isUser(m) && m.id === String(args.id));
  else for (let i = msgs.length - 1; i >= 0; i--) if (isUser(msgs[i])) { at = i; break; }
  if (at < 0) return { error: editing && args.id ? 'That message is in the older part of this chat, which Bob keeps summed up. Only the recent part can be edited.' : 'There is no message of yours in this chat to answer again.' };
  const msg = msgs[at];
  const before = String(said(msg));
  const text = editing ? String(args.text).replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT) : before;
  if (!text.trim()) return { error: editing ? 'A message can\'t be sent empty. Type what you want to say.' : 'That message has no words to answer again.' };
  if (editing && text === before.trim()) return { error: 'That message already says that. Change the words, or press Try again for a new answer.' };
  const tail = msgs.slice(at + 1);
  const version = { at: msg.edited || msg.at || now, text: before, said: spokenAfter(tail) };
  msg.versions = [...(Array.isArray(msg.versions) ? msg.versions : []), version].slice(-KEEP_VERSIONS);
  msgs.splice(at + 1);
  if (editing) {
    // Pictures you attached stay attached: their description (after your words) is kept, your words are swapped.
    const rest = String(msg.content || '');
    const extra = msg.refs?.length && msg.text != null && rest.startsWith(msg.text) ? rest.slice(msg.text.length) : '';
    if (msg.was == null) msg.was = before;
    msg.content = text + extra;
    if (extra) msg.text = text; else delete msg.text;
    msg.edited = now;
    msg.edits = (msg.edits || 0) + 1;
  }
  if (!msg.id) msg.id = newMsgId();
  if (!msg.at) msg.at = now;
  return { msg, text, edited: editing };
}

// Can this chat be changed right now? Not while one of its jobs waits or runs (its answer would land on the old chat).
export function chatBusy(brain, sessionId) {
  if ([...(brain.turns?.values?.() || [])].some((t) => t.sessionId === sessionId)) return true;
  return (brain.queue || []).some((j) => j.sessionId === sessionId && ['waiting', 'working'].includes(j.state));
}
export const BUSY_LINE = 'Bob is still on this chat. Wait until he has finished, or press Stop first.';

// The whole step, as the server runs it: check, change, save. The window then sends the message with redo: true.
export function redo(brain, sessionId, args = {}) {
  if (!redoOn(brain.cfg)) return { error: '"Try again, Edit and Delete" is off (Settings, How Bob works).' };
  if (chatBusy(brain, sessionId)) return { error: BUSY_LINE };
  const msgs = brain.session(sessionId);
  const r = rewind(msgs, args);
  if (r.error) return r;
  brain.saveSession(sessionId);
  brain.log?.('chat', r.edited ? `edited message ${r.msg.id} and sent it again` : `Try again on ${r.msg.id}`);
  brain.broadcast?.({ type: 'rewound', sessionId, id: r.msg.id });
  return { ok: true, id: r.msg.id, text: r.text, refs: r.msg.refs || [], edited: r.edited };
}
