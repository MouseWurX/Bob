// "Try from here" (Settings, How Bob works, 💬 Chat extras). Off unless turned on.
// ⑂ Try from here under a message copies the chat up to and including that message into a new chat, and opens it.
// The original chat stays exactly as it was. The copy keeps the older part and its summary (they came before), and
// the pins up to that message. If you pick one of your own messages, it goes in the box of the new chat instead, so
// you can change it before sending; pick one of Bob's and the new chat ends with his answer.
import { readChat, readOlder, readSummary, writeChat, writeOlder, writeSummary, chatTitle, said } from './chats.js';
import { readPins, copyPins } from './pins.js';

export const tryOn = (cfg) => cfg?.tryFromHere === true;
export const newChatId = (now = Date.now()) => `chat-${now}`;

// msgs: the chat as Bob holds it now (brain.session(id)). Returns { id, text } (text: your words to send again, if the
// pick was your own message) or { error }.
export function tryFromHere(cfg, fromId, msgs, msgId, { now = Date.now() } = {}) {
  const list = Array.isArray(msgs) && msgs.length ? msgs : readChat(cfg, fromId);
  const at = list.findIndex((m) => m && m.id === msgId && (m.role === 'user' || m.role === 'assistant'));
  if (at < 0) return { error: 'That message isn\'t in this chat\'s saved part any more.' };
  const mine = list[at].role === 'user';
  // Your own message: the copy stops just before it and it waits in the box. Bob's: the copy ends with it.
  const cut = JSON.parse(JSON.stringify(list.slice(0, mine ? at : at + 1)));
  for (const m of cut) { delete m.versions; delete m.images; }
  const id = newChatId(now);
  const older = readOlder(cfg, fromId);
  const title = chatTitle([...older, ...list]);
  if (cut.length && !cut.some((m) => m.chatTitle)) { const first = cut.find((m) => m.role === 'user') || cut[0]; first.chatTitle = `${title.slice(0, 60)} (tried from here)`; }
  if (older.length) writeOlder(cfg, id, older);
  const sum = readSummary(cfg, fromId);
  if (sum) writeSummary(cfg, id, sum);
  if (cut.length) writeChat(cfg, id, cut);
  const kept = new Set([...older, ...cut].map((m) => m.id).filter(Boolean));
  if (readPins(cfg, fromId).length) copyPins(cfg, fromId, id, kept);
  return { id, text: mine ? said(list[at]) : '', empty: !cut.length && !older.length };
}
