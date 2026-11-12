// Carry on on another Bob (item 140, 2026-11-11). Move a chat to another of your Bobs and keep going there.
//
// Sending (this replicant matrix's window, or the Android app): the chat's words go to the other Bob through his
// door, the same signed-in Bob-Net door every other Bob-to-Bob call uses (Tailscale only, his passcode or the key
// pairing swapped). Only what you and Bob said travels: no tool calls, files, pictures or memory.
// Receiving: only with "Take chats from my other Bobs" on (off unless you turn it on). The chat lands in Past chats
// as a new chat, tagged "from another of your Bobs", and the window says so. The original stays where it was.
// A chat from the phone keeps the phone's chat id (phone-xxxx), so the phone carries on the same chat with this Bob.
import crypto from 'node:crypto';
import { chatFile, writeChat, writeOlder, stampMessages } from './chats.js';
import fs from 'node:fs';

export const CARRY_MAX = 200; // messages taken over
export const CARRY_CHARS = 6000; // per message
export const carryInOn = (cfg) => cfg?.carryIn === true;
export const CARRY_OFF = 'That Bob isn\'t taking chats from your other Bobs. On that replicant matrix: Settings, Bob-Net, Take chats from my other Bobs.';

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);

// What travels: { role, content } for what you and Bob said, oldest first, the last CARRY_MAX.
export function carryMessages(msgs) {
  return [].concat(msgs || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && !m.tool_calls)
    .map((m) => ({ role: m.role, content: clean(m.role === 'user' && m.text != null ? m.text : m.content, CARRY_CHARS).trim() }))
    .filter((m) => m.content)
    .slice(-CARRY_MAX);
}

// The id the chat gets on the receiving Bob: the phone's own chat id when it came from the phone, otherwise a new one.
export function carryId(sessionId, fromPhone, rand = () => crypto.randomBytes(4).toString('hex')) {
  const s = String(sessionId || '');
  if (fromPhone && /^phone-[a-z0-9]{1,16}$/.test(s)) return s;
  return `carried-${rand()}`;
}

// Receiving end: checks the switch and the shape, then writes the chat. Returns { code, ...answer }.
export function receiveCarry(cfg, b, { fromPhone = false, now = Date.now, rand } = {}) {
  if (!carryInOn(cfg)) return { code: 409, error: CARRY_OFF, off: true };
  const msgs = carryMessages(b?.msgs);
  if (!msgs.length) return { code: 400, error: 'That chat is empty.' };
  const from = clean(b?.from, 40).replace(/[<>"'`]/g, '').trim() || (fromPhone ? 'your phone' : 'another of your Bobs');
  const title = clean(b?.title, 70).replace(/\s+/g, ' ').trim() || 'A carried-over chat';
  const id = carryId(b?.sessionId, fromPhone, rand);
  const at = now();
  const out = stampMessages(msgs.map((m, i) => ({ ...m, at: at - (msgs.length - i) })), at);
  out[0].chatTitle = title;
  out[0].from = 'bob-net';
  out[0].fromBob = from;
  // The recent part Bob reads every turn holds the last 40, like any chat; the rest goes to the older file.
  const keep = out.slice(-40), older = out.slice(0, -40);
  if (older.length) { keep[0] = { ...keep[0], chatTitle: title, from: 'bob-net', fromBob: from }; }
  fs.mkdirSync(chatFile(cfg, id).replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  writeOlder(cfg, id, older.map((m) => ({ id: m.id, at: m.at, role: m.role, content: m.content, ...(m.chatTitle ? { chatTitle: m.chatTitle, from: m.from } : {}) })));
  writeChat(cfg, id, keep);
  return { code: 200, ok: true, id, title, messages: msgs.length, from };
}

// Sending end, from this replicant matrix: reads the chat and hands it to the other Bob.
// `lenders` is brain.lenders (src/share-brains.js): it knows your Bobs and signs the call in.
export async function sendCarry({ lenders, msgs, title, from, address }) {
  const bob = (lenders?.bobs?.() || []).find((x) => x.address === address);
  if (!bob) return { error: 'That Bob isn\'t on your Bob-Net list.' };
  const words = carryMessages(msgs);
  if (!words.length) return { error: 'This chat is empty, so there\'s nothing to carry over.' };
  let r;
  try { r = await lenders.call(bob, '/api/bob-net/carry', { method: 'POST', body: { from, title, msgs: words }, timeout: 15000 }); }
  catch (e) { return { error: `Couldn't reach ${bob.name}: ${e.message}` }; }
  const j = await r.json().catch(() => ({}));
  if (r.status === 404) return { error: `${bob.name} is an older Bob that can't take chats yet. Update him first.` };
  if (j?.off || r.status === 409) return { error: CARRY_OFF.replace('That Bob', bob.name) };
  if (!j?.ok) return { error: j?.error || `${bob.name} didn't take it.` };
  return { ok: true, to: bob.name, id: j.id, messages: j.messages };
}
