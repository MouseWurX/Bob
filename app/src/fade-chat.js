// "Fade old messages" and "Clear chat" (Settings, How Bob works, 💬 Chat extras). Fading is off unless turned on.
// After the time you pick, each turn (your message, Bob's thinking and his reply) slips off the chat, so the chat
// stays short. You pick what fading does:
//   hide    the turn only leaves the chat on screen. Bob still has it, Topics and search still find it.
//   delete  the turn is deleted from the chat's files on disk and its links come out of Topics. His notes, memory
//           lines and the summary of a chat's older part stay (the owner, Nov 13: fading never scrubs his notes).
// Clear chat empties the chat on screen now (hide), or deletes the whole chat for good when you tick the box.
// Settings live in settings.json: cfg.fadeChat = { on, minutes, mode }. Each chat's "cleared at" time sits in
// inn\bob\sessions-cleared.json (beside the chats folder, ids and times only), so a cleared chat stays clear after a restart and on the phone.
import fs from 'node:fs';
import path from 'node:path';
import { sessionDir, safeId, readOlder, writeOlder, chatFiles, summaryFile } from './chats.js';

export const FADE_MIN = 1;                 // 1 minute
export const FADE_MAX = 60 * 24 * 365;     // a year
export const FADE_DEFAULT = { on: false, minutes: 60, mode: 'hide' };
// The quick picks under "Fade after", in minutes.
export const FADE_PICKS = [[5, '5 min'], [30, '30 min'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week'], [43200, '30 days']];

export function cleanFade(v) {
  const f = v && typeof v === 'object' ? v : {};
  const n = Math.round(Number(f.minutes));
  return {
    on: f.on === true,
    minutes: Number.isFinite(n) ? Math.min(FADE_MAX, Math.max(FADE_MIN, n)) : FADE_DEFAULT.minutes,
    mode: f.mode === 'delete' ? 'delete' : 'hide'
  };
}
export const fadeOf = (cfg) => cleanFade(cfg?.fadeChat);

// How long, in plain words: 90 -> "1 hour 30 min", 1440 -> "1 day".
export function fadeWords(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m % 1440 === 0) { const d = m / 1440; return d % 7 === 0 && d < 28 ? `${d / 7} week${d === 7 ? '' : 's'}` : `${d} day${d === 1 ? '' : 's'}`; }
  if (m >= 60) { const h = Math.floor(m / 60), r = m % 60; return `${h} hour${h === 1 ? '' : 's'}${r ? ` ${r} min` : ''}`; }
  return `${m} min`;
}

// ---- Cleared chats
const clearedFile = (cfg) => sessionDir(cfg) + '-cleared.json'; // beside the chats folder, so nothing reads it as a chat
export function readCleared(cfg) {
  try { const v = JSON.parse(fs.readFileSync(clearedFile(cfg), 'utf8').replace(/^﻿/, '')); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function writeCleared(cfg, map) {
  const f = clearedFile(cfg);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(map));
  fs.renameSync(f + '.tmp', f);
}
export const clearedAt = (cfg, id) => Number(readCleared(cfg)[safeId(id)]) || 0;
export function markCleared(cfg, id, at = Date.now()) { const m = readCleared(cfg); m[safeId(id)] = at; writeCleared(cfg, m); return at; }
export function forgetCleared(cfg, id) { const m = readCleared(cfg); if (safeId(id) in m) { delete m[safeId(id)]; writeCleared(cfg, m); } }

// ---- Turns
// A turn is one of your messages and everything after it up to your next one (thinking, tool steps, replies).
// It fades as one, by the time of its newest message, so a reply never goes before its question.
export function turnsOf(msgs) {
  const turns = [];
  let cur = null;
  for (const m of msgs) {
    if (m.role === 'user' || !cur) { cur = { msgs: [], at: 0 }; turns.push(cur); }
    cur.msgs.push(m);
    cur.at = Math.max(cur.at, Number(m.at) || 0);
  }
  return turns;
}

// The time before which a turn is gone from view: the later of "cleared at" and the fade cut-off.
export function hiddenBefore(cfg, id, now = Date.now()) {
  const f = fadeOf(cfg);
  return Math.max(clearedAt(cfg, id), f.on ? now - f.minutes * 60e3 : 0);
}

// What the chat shows: the history (brain.history) without faded or cleared turns. A turn with no time (an old
// chat from before times were kept) counts as old only once the chat was cleared.
export function visibleHistory(cfg, id, list, now = Date.now()) {
  const before = hiddenBefore(cfg, id, now);
  if (!before) return { list, faded: 0 };
  const keep = [];
  let faded = 0;
  for (const t of turnsOf(list)) {
    const old = t.at ? t.at < before : clearedAt(cfg, id) > 0;
    if (old) faded += t.msgs.length; else keep.push(...t.msgs);
  }
  return { list: keep, faded };
}

// ---- Delete mode: turns past the time go from the chat's files.
// msgs: the chat's recent part as Bob holds it (changed in place). Returns the ids that went.
export function dropOldTurns(msgs, before) {
  const gone = new Set();
  if (!before) return gone;
  const turns = turnsOf(msgs);
  const keep = [];
  for (const t of turns) {
    if (t.at && t.at < before) { for (const m of t.msgs) if (m.id) gone.add(m.id); }
    else keep.push(...t.msgs);
  }
  if (keep.length !== msgs.length) msgs.splice(0, msgs.length, ...keep);
  while (msgs.length && msgs[0].role !== 'user') { const m = msgs.shift(); if (m.id) gone.add(m.id); } // never start mid-turn
  return gone;
}

// One chat's sweep in delete mode. brain: holds the chat (session/saveSession) and its topics (housekeeper.topics).
export function sweepChat(cfg, brain, id, now = Date.now()) {
  const f = fadeOf(cfg);
  if (!f.on || f.mode !== 'delete') return 0;
  const before = now - f.minutes * 60e3;
  const msgs = brain.session(id);
  const gone = dropOldTurns(msgs, before);
  if (gone.size) brain.saveSession(id);
  // The older part: kept word for word, one message each, so it goes by its own time.
  const older = readOlder(cfg, id);
  if (older.length) {
    const keep = older.filter((m) => !(Number(m.at) && Number(m.at) < before));
    for (const m of older) if (!keep.includes(m) && m.id) gone.add(m.id);
    if (keep.length !== older.length) {
      writeOlder(cfg, id, keep);
      if (!keep.length) fs.rmSync(summaryFile(cfg, id), { force: true }); // nothing left to sum up
    }
  }
  if (gone.size) { try { brain.housekeeper?.topics?.dropMessages(id, gone); } catch {} }
  return gone.size;
}

// Every saved chat, unless Bob is working in it right now. Returns how many messages went.
export function sweepAll(cfg, brain, ids, now = Date.now()) {
  const busy = new Set([...(brain.turns?.values?.() || [])].map((t) => t?.sessionId).filter(Boolean));
  let n = 0;
  for (const id of ids) { if (busy.has(id)) continue; try { n += sweepChat(cfg, brain, id, now); } catch {} }
  return n;
}

// ---- Clear chat
// forGood false: the chat empties on screen from now on (hide). forGood true: the chat's files go from disk and its
// links come out of Topics. Not while Bob is working in that chat.
export function clearChat(cfg, brain, id, { forGood = false, now = Date.now() } = {}) {
  const sid = safeId(id);
  if (!sid) return { error: 'Which chat? Send its id as sessionId, like { "sessionId": "main" }.' };
  if ([...(brain.turns?.values?.() || [])].some((t) => t?.sessionId === sid) || (brain.queue || []).some((j) => j.sessionId === sid && j.state !== 'done')) return { error: 'Bob is still on this chat. Wait until he has finished, or press Stop.' };
  if (!forGood) { markCleared(cfg, sid, now); return { ok: true, forGood: false }; }
  for (const f of chatFiles(cfg, sid)) fs.rmSync(f, { force: true });
  try { brain.sessions?.delete?.(sid); } catch {}
  try { brain.housekeeper?.topics?.dropMessages(sid); } catch {}
  forgetCleared(cfg, sid);
  return { ok: true, forGood: true };
}
