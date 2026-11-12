// Memory, three more switches (Nov 11 list, items 87 to 89). Each is off unless the user turns it on, in Settings,
// Speed & memory, next to "Remember only what fits". Nothing here starts a program or sends anything anywhere: the
// memory file stays one plain text file, and these only add small tags to its lines.
//
//  87 "Note where each memory came from" (memorySources): every new memory line gets [from: <chat id>], the chat it
//     was learned in. Settings lists the memories with the chat each came from: Open the chat, or Forget this one.
//  88 "Let memories run out" (memoryExpiry): "remember this for the week" saves the line with [until: YYYY-MM-DD].
//     Once that day has passed, Bob stops reading it and the housekeeper takes it out (the old file goes to the
//     Recycle Bin first, as with every memory tidy).
//  89 "Keep project memories to their project" (memoryWhere, works with Remember only what fits): a memory in a
//     project's bank only comes back while Bob works on that project: the chat names it, or a tool touches a file in
//     that project's folder (or its repository's code copy). Off, a chat on no project can match every bank.
import path from 'node:path';
import { isInside } from './config.js';
import { recallOn, lineKey, factText, projectOf } from './recall.js';

export const sourcesOn = (cfg) => cfg?.memorySources === true;
export const expiryOn = (cfg) => cfg?.memoryExpiry === true;
export const whereOn = (cfg) => cfg?.memoryWhere === true && recallOn(cfg);

const FROM_TAG = /\[from:\s*([^\]]+)\]/i;
const UNTIL_TAG = /\[until:\s*(\d{4}-\d{2}-\d{2})\]/i;
export const fromOf = (line) => { const m = String(line).match(FROM_TAG); return m ? m[1].trim() : ''; };
export const untilOf = (line) => { const m = String(line).match(UNTIL_TAG); return m ? m[1] : ''; };
export const cleanChatId = (id) => String(id || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);

// ---- 87: where each memory came from ----
export function fromTag(cfg, chatId) {
  const id = cleanChatId(chatId);
  return sourcesOn(cfg) && id ? ` [from: ${id}]` : '';
}

// ---- 88: memories that run out ----
const DAY = 86400e3;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const atNoon = (d) => Date.parse(`${d}T12:00:00Z`);
// keep: "today", "day", "week", "month", "N days", "N weeks", or a date (YYYY-MM-DD). The memory is read up to and
// including the day returned. '' means keep it for good (anything unclear, or a day that has already gone).
export function keepUntil(keep, today) {
  const k = String(keep || '').trim().toLowerCase();
  if (!k || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return '';
  const base = atNoon(today);
  if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
    const t = atNoon(k);
    return Number.isFinite(t) && t >= base && t - base <= 2 * 366 * DAY ? k : '';
  }
  const n = k.match(/^(\d{1,3})\s*(day|days|week|weeks|month|months)$/);
  const days = { today: 0, day: 1, tomorrow: 1, week: 7, weekend: 3, month: 30, year: 365 }[k.replace(/^(a|one|the|this)\s+/, '')]
    ?? (n ? Number(n[1]) * (n[2].startsWith('week') ? 7 : n[2].startsWith('month') ? 30 : 1) : null);
  if (days == null || days > 731) return '';
  return ymd(base + days * DAY);
}
export function untilTag(cfg, keep, today) {
  if (!expiryOn(cfg)) return '';
  const d = keepUntil(keep, today);
  return d ? ` [until: ${d}]` : '';
}
export const expired = (line, today) => { const u = untilOf(line); return Boolean(u) && u < today; };

// The memory file without the lines whose day has passed. gone: those lines (for the logbook and the count).
export function dropExpired(text, today) {
  const gone = [];
  const kept = String(text || '').split('\n').filter((l) => (expired(l, today) ? (gone.push(l), false) : true));
  return { text: kept.join('\n'), gone };
}

// The whole memory file as Bob reads it when Remember only what fits is off: run-out lines left out (while that
// switch is on) and the [from: ...] tags taken off (they're for the user, not for Bob).
export function memoryForPrompt(text, cfg, today) {
  let t = String(text || '');
  if (expiryOn(cfg) && today) t = dropExpired(t, today).text;
  return t.replace(/\s*\[from:\s*[^\]]*\]/gi, '');
}

// ---- Settings: the list of memories, each with where it came from ----
// chatTitle(id) -> { title, gone } or null. Newest first, at most `max` lines.
export function memorySources(text, { chatTitle = () => null, today = '', max = 300 } = {}) {
  const rows = [];
  for (const raw of String(text || '').split('\n')) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const t = factText(raw.replace(FROM_TAG, '').replace(UNTIL_TAG, ''));
    if (t.length <= 3) continue;
    const from = fromOf(raw);
    const until = untilOf(raw);
    const c = from ? chatTitle(from) : null;
    rows.push({ key: lineKey(raw), text: t.slice(0, 300), project: projectOf(raw), from, title: c?.title || '', chatGone: Boolean(from && (!c || c.gone)), until, expired: Boolean(today && until && until < today) });
  }
  return rows.reverse().slice(0, max);
}

// The memory file without the line(s) with this key (Settings, Forget this one). n: how many went.
export function forgetLine(text, key) {
  let n = 0;
  const kept = String(text || '').split('\n').filter((l) => {
    if (!l.trim() || /^\s*#/.test(l) || lineKey(l) !== key) return true;
    n++;
    return false;
  });
  return { text: kept.join('\n'), n };
}

// ---- 89: project memories only where Bob works on that project ----
// The project whose folder holds this file (the deepest one, so a project inside another wins), or ''.
export function projectOfPath(cfg, file) {
  if (!file || !path.isAbsolute(String(file))) return '';
  let best = '', len = -1;
  for (const [name, dir] of Object.entries(cfg?.projects || {})) {
    if (typeof dir !== 'string' || !dir) continue;
    if (isInside(dir, String(file)) && dir.length > len) { best = name; len = dir.length; }
  }
  return best;
}

// Full paths named in a tool call's inputs (path, file, folder, repository and the like, one level deep).
export function pathsInArgs(args) {
  const out = [];
  const look = (v) => { if (typeof v === 'string' && v.length < 1024 && (path.isAbsolute(v) || /^[A-Za-z]:[\\/]/.test(v))) out.push(v); };
  for (const v of Object.values(args && typeof args === 'object' ? args : {})) {
    if (Array.isArray(v)) v.slice(0, 20).forEach(look);
    else if (v && typeof v === 'object') Object.values(v).slice(0, 20).forEach(look);
    else look(v);
  }
  return out.slice(0, 20);
}

// The project a tool call worked in, from the paths in its inputs ('' when none, or more than one project).
export function projectOfCall(cfg, args) {
  const found = new Set(pathsInArgs(args).map((p) => projectOfPath(cfg, p)).filter(Boolean));
  return found.size === 1 ? [...found][0] : '';
}
