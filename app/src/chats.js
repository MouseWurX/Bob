// Bob's saved chats on disk (inn\bob\sessions). Each chat has up to three files:
//   <id>.json          the recent part Bob reads every turn (the last 40 messages)
//   <id>.older.json    everything older, kept word for word (it used to be dropped silently)
//   <id>.summary.json  Bob's rolling summary of the older part: decisions, facts, to-dos
// Messages carry a short id and a time, so topics and search can point back at them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson as vaultRead, writeJson as vaultWrite } from './vault.js';

export const sessionDir = (cfg) => path.join(cfg.dataDir, 'sessions');
export const safeId = (id) => String(id || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
export const chatFile = (cfg, id) => path.join(sessionDir(cfg), safeId(id) + '.json');
export const olderFile = (cfg, id) => path.join(sessionDir(cfg), safeId(id) + '.older.json');
export const summaryFile = (cfg, id) => path.join(sessionDir(cfg), safeId(id) + '.summary.json');
export const chatFiles = (cfg, id) => [chatFile(cfg, id), olderFile(cfg, id), summaryFile(cfg, id)].filter((f) => fs.existsSync(f));

// 🔒 Through the vault (src/vault.js): plain files read as before, locked ones only once the passcode was typed.
const readJson = (f, d) => vaultRead(f, d);
const writeJson = (cfg, f, v) => vaultWrite(cfg, f, v);

export const newMsgId = () => crypto.randomBytes(4).toString('hex');
// Every user and assistant message gets an id and a time (older chats get them the first time they're saved).
export function stampMessages(msgs, now = Date.now()) {
  for (const m of msgs) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (!m.id) m.id = newMsgId();
    if (!m.at) m.at = now;
  }
  return msgs;
}

export const readChat = (cfg, id) => readJson(chatFile(cfg, id), []);
export const readOlder = (cfg, id) => readJson(olderFile(cfg, id), []);
export const readSummary = (cfg, id) => readJson(summaryFile(cfg, id), null);
export const writeChat = (cfg, id, msgs) => writeJson(cfg, chatFile(cfg, id), msgs);
export const writeOlder = (cfg, id, msgs) => (msgs.length ? writeJson(cfg, olderFile(cfg, id), msgs) : fs.rmSync(olderFile(cfg, id), { force: true }));
export const writeSummary = (cfg, id, s) => writeJson(cfg, summaryFile(cfg, id), s);

// What the user and Bob said (no tool calls or tool results), shortened, for summaries and search.
export const spoken = (msgs) => msgs.filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.tool_calls && (m.text ?? m.content));
export const said = (m) => String(m.role === 'user' && m.text != null ? m.text : m.content || '');

// Messages trimmed off the recent part go to the older file instead of being lost.
export function keepOlder(cfg, id, dropped) {
  const keep = spoken(dropped).map((m) => ({ id: m.id, at: m.at, role: m.role, content: said(m).slice(0, 6000), ...(m.media?.length ? { media: m.media } : {}) }));
  if (!keep.length) return;
  writeOlder(cfg, id, [...readOlder(cfg, id), ...keep].slice(-5000));
}

// Every message of a chat, oldest first (the older part, then the recent part).
export const wholeChat = (cfg, id) => [...readOlder(cfg, id), ...readChat(cfg, id)];

export function chatIds(cfg) {
  try { return fs.readdirSync(sessionDir(cfg)).filter((f) => /^[a-zA-Z0-9-]+\.json$/.test(f)).map((f) => f.slice(0, -5)); } catch { return []; }
}

export function lastTouched(cfg, id) {
  const msgs = readChat(cfg, id);
  const at = Math.max(0, ...msgs.map((m) => m.at || 0));
  if (at) return at;
  try { return fs.statSync(chatFile(cfg, id)).mtimeMs; } catch { return 0; }
}

export function chatTitle(msgs) {
  const first = spoken(msgs).find((m) => m.role === 'user');
  return first ? said(first).replace(/\s+/g, ' ').trim().slice(0, 70) : '(empty chat)';
}

export function chatInfo(cfg, id, pins = []) {
  const all = wholeChat(cfg, id);
  const bytes = chatFiles(cfg, id).reduce((n, f) => n + fs.statSync(f).size, 0);
  const sum = readSummary(cfg, id);
  return { id, title: chatTitle(all), messages: spoken(all).length, lastTouched: lastTouched(cfg, id), bytes, summary: sum?.summary || '', pinned: pins.includes(id) };
}
