// "Keep the last 20 Settings changes" (Settings, This replicant matrix, 🩺 Health and history). Off unless turned on.
// While it's on, every change to Bob's settings is kept in inn\bob\settings-undo.json: when, which settings, what they
// were and what they became. "Put it back" sets those settings to what they were. Bob's own bookkeeping (which brains
// were downloaded, that the welcome was seen) isn't listed.
import fs from 'node:fs';
import path from 'node:path';
import { HARNESS_LABELS } from './harness.js';

export const undoOn = (cfg) => cfg?.settingsUndo === true;
export const undoFile = (cfg) => path.join(cfg.dataDir, 'settings-undo.json');
export const UNDO_MAX = 20;
// Kept by Bob himself, not changed by a person in Settings.
const BOOKKEEPING = new Set(['catalogAddedGot', 'saveDirsUsed', 'wantsAsked', 'setupDone', 'sessionBy', 'string', 'activeModels', 'catalogAdded']);

const LABELS = {
  ...HARNESS_LABELS,
  webSearch: 'Let Bob search the web', oneBrain: 'One brain', autostart: 'Launch Bob on start-up', tray: 'Keep Bob in the tray', session: 'Session',
  models: 'Which brain does what', llamacpp: 'Engine settings', tts: 'Voice', style: 'Theme and look', housekeeping: 'Housekeeping', hands: 'Hands',
  checkins: 'Check-ins', language: 'Language', promptMenu: 'Pull up saved prompts with /', chatPresets: 'Assistant presets for chats', quickNotes: 'Let Bob take quick notes',
  docTools: 'Read and search my documents', memoryRecall: 'Remember only what fits', howtos: 'Let Bob learn how-tos', chatRedo: 'Show Try again and Edit in the chat',
  lockSecrets: 'Lock my keys and passwords', personality: 'Personality', look: 'Bob\'s look', catName: 'Bob\'s cat', brainCtx: 'How much each brain keeps in mind'
};
export const labelFor = (k) => LABELS[k] || k;

const short = (v) => {
  if (v === undefined) return '(not set)';
  if (v === true) return 'on';
  if (v === false) return 'off';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
};

const read = (cfg) => { try { const v = JSON.parse(fs.readFileSync(undoFile(cfg), 'utf8').replace(/^﻿/, '')); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (cfg, list) => { fs.mkdirSync(path.dirname(undoFile(cfg)), { recursive: true }); const t = undoFile(cfg) + '.tmp'; fs.writeFileSync(t, JSON.stringify(list, null, 1)); fs.renameSync(t, undoFile(cfg)); };

// One change, as config.js tells it: before and after hold the same keys.
export function record(cfg, before, after, { now = Date.now(), quiet = false } = {}) {
  if (!undoOn(cfg) || quiet) return null;
  const keys = Object.keys(after || {}).filter((k) => !BOOKKEEPING.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (!keys.length) return null;
  const entry = { id: Math.random().toString(36).slice(2, 10), at: now, keys: Object.fromEntries(keys.map((k) => [k, { before: before[k] === undefined ? null : before[k], after: after[k] === undefined ? null : after[k] }])) };
  const list = read(cfg);
  // Typing in a box saves on each change: the same settings changed again within a minute fold into one line.
  const last = list[list.length - 1];
  if (last && now - last.at < 60_000 && Object.keys(last.keys).join() === keys.join()) {
    for (const k of keys) last.keys[k].after = entry.keys[k].after;
    last.at = now;
    if (keys.every((k) => JSON.stringify(last.keys[k].before) === JSON.stringify(last.keys[k].after))) list.pop();
  } else list.push(entry);
  try { write(cfg, list.slice(-UNDO_MAX)); } catch {}
  return entry;
}

export function undoView(cfg) {
  return { on: undoOn(cfg), list: read(cfg).slice().reverse().map((e) => ({ id: e.id, at: e.at, changes: Object.entries(e.keys).map(([k, v]) => ({ key: k, label: labelFor(k), was: short(v.before ?? undefined), now: short(v.after ?? undefined) })) })) };
}

// "Put it back": those settings go back to what they were. The line leaves the list; the putting back isn't listed.
export function putBack(cfg, id, replace) {
  const list = read(cfg);
  const e = list.find((x) => x.id === String(id || ''));
  if (!e) return { ok: false, why: 'That change isn\'t on the list any more.' };
  const patch = {};
  for (const [k, v] of Object.entries(e.keys)) if (v.before !== null) patch[k] = v.before;
  quietOnce = true;
  try { if (Object.keys(patch).length) replace(cfg, patch); } finally { quietOnce = false; }
  try { write(cfg, list.filter((x) => x !== e)); } catch {}
  return { ok: true, keys: Object.keys(e.keys).map(labelFor) };
}

export function clearUndo(cfg) { try { fs.rmSync(undoFile(cfg), { force: true }); } catch {} }

// Hooked to config.js's watchSettings while Bob runs.
let quietOnce = false;
export const undoWatcher = (cfg) => (before, after) => record(cfg, before, after, { quiet: quietOnce });
