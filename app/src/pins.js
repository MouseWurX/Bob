// "Pin messages" (Settings, How Bob works, 💬 Chat extras). Off unless turned on.
// 📌 Pin under a message keeps it in Bob's mind for that chat, however long the chat gets. Bob reads the last 40
// messages of a chat every turn; older ones are summed up. A pinned message that has scrolled out of those 40 goes in
// word for word, in the note before the newest message. Pins live beside the chat (inn\bob\sessions\<id>.pins.json),
// so they are backed up and deleted with it. Up to 12 pins a chat, each up to 2,000 characters.
import fs from 'node:fs';
import path from 'node:path';
import { sessionDir, safeId, said } from './chats.js';

export const pinsOn = (cfg) => cfg?.pinMessages === true;
export const pinsFile = (cfg, id) => path.join(sessionDir(cfg), safeId(id) + '.pins.json');
export const MAX_PINS = 12;
export const PIN_CHARS = 2000;

export function readPins(cfg, id) {
  try { const v = JSON.parse(fs.readFileSync(pinsFile(cfg, id), 'utf8').replace(/^﻿/, '')); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writePins(cfg, id, list) {
  const f = pinsFile(cfg, id);
  if (!list.length) { fs.rmSync(f, { force: true }); return list; }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(list, null, 1));
  fs.renameSync(f + '.tmp', f);
  return list;
}

// msgs: the chat's messages as Bob keeps them (src/chats.js). Pins by message id, in the chat's order.
export function pin(cfg, id, msgs, msgId) {
  const list = readPins(cfg, id);
  if (list.some((p) => p.id === msgId)) return { ok: true, pins: list };
  if (list.length >= MAX_PINS) return { ok: false, why: `A chat can have ${MAX_PINS} pins. Unpin one first.` };
  const m = (msgs || []).find((x) => x && x.id === msgId && (x.role === 'user' || x.role === 'assistant'));
  if (!m) return { ok: false, why: 'That message isn\'t in this chat\'s saved part any more.' };
  const text = said(m).trim();
  if (!text) return { ok: false, why: 'That message has no words to keep.' };
  list.push({ id: m.id, role: m.role, at: m.at || Date.now(), text: text.slice(0, PIN_CHARS) });
  list.sort((a, b) => (a.at || 0) - (b.at || 0));
  return { ok: true, pins: writePins(cfg, id, list) };
}
export function unpin(cfg, id, msgId) { return { ok: true, pins: writePins(cfg, id, readPins(cfg, id).filter((p) => p.id !== msgId)) }; }

// The note part: only pins that aren't among the messages Bob reads anyway. who: what Bob calls the user.
export function pinsPrompt(cfg, id, msgs = [], who = 'the user') {
  if (!pinsOn(cfg) || !id) return '';
  const inView = new Set((msgs || []).map((m) => m && m.id).filter(Boolean));
  const out = readPins(cfg, id).filter((p) => !inView.has(p.id));
  if (!out.length) return '';
  return `Pinned in this chat (${who} asked you to keep these in mind, word for word):\n${out.map((p) => `- ${p.role === 'user' ? who : 'You'}: ${p.text.replace(/\s+/g, ' ')}`).join('\n')}`;
}

export const copyPins = (cfg, from, to, keepIds) => writePins(cfg, to, readPins(cfg, from).filter((p) => keepIds.has(p.id)));
