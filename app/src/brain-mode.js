// 1.5.2: keep Bob light. The chat page has a "Free memory when Bob is idle" switch:
//   wake   (default) switch on, "Free memory when Bob is idle": nothing stays on the graphics card while Bob is idle. Typing loads his
//          small brain (the one that answers chat) and it's let go after the idle time in Settings (5 minutes).
//   always switch off (or Advanced: Never): the small brain stays loaded so replies start at once.
// Either way, big brains (coding, deep thinking, review, pictures, video) load only for their job and are let go
// right after it. In the Coding and Deep thought sessions the chat brain IS a big brain, so switching off doesn't
// hold it there; it gets a short grace (2 minutes) for a follow-up question, then goes.
import { currentSession, modelFor, sessionBrains } from './sessions.js';

export const BRAIN_MODES = ['wake', 'always'];
export const BIG_SESSIONS = ['coding'];
export const BIG_GRACE_MS = 2 * 60_000;

// One setting, two places: the chat page switch "Free memory when Bob is idle" (on = wake) and the Advanced row
// "Free memory after Bob has been quiet for" (its Never = always). An old "-1" keep-alive also means always.
export function brainMode(cfg) { return cfg?.brainMode === 'always' || String(cfg?.ollamaKeepAlive) === '-1' ? 'always' : 'wake'; }

// Ollama names may carry ":latest".
export function sameModel(a, b) {
  if (!a || !b) return false;
  const n = (x) => (String(x).includes(':') ? String(x) : `${x}:latest`);
  return n(a) === n(b);
}

// The brain that answers when you type, in the current session.
export function chatBrain(cfg) { return modelFor(cfg, 'bob'); }

export function bigSession(cfg) { return BIG_SESSIONS.includes(currentSession(cfg).id); }

// Whether Bob keeps his chat brain loaded between jobs.
export function holdsChatBrain(cfg) { return brainMode(cfg) === 'always' && !bigSession(cfg); }

// Every brain Bob himself uses (picked in Equip Bob or for a session). Anything else loaded in Ollama
// (Open WebUI, another app) is not Bob's, so he never unloads it or counts it.
export function bobsBrains(cfg) {
  const names = [...Object.values(cfg?.models || {}), ...Object.values(sessionBrains(cfg || {}))].filter((x) => typeof x === 'string' && x);
  return [...new Set(names)];
}
export function isBobs(cfg, name) { return bobsBrains(cfg).some((m) => sameModel(m, name)); }

// The keep-alive setting in words, for the status label: "5 minutes", "1 hour", or null for never.
// The idle time to show in Settings: always a real time (no Never since 1.5.3; the chat-page switch off keeps him loaded).
export function keepTime(cfg) { const k = String(cfg?.ollamaKeepAlive ?? '5m'); return /^\d+[smh]$/.test(k) ? k : '5m'; }
export function sleepAfterText(cfg) {
  const ms = keepMs(cfg);
  return ms === Infinity ? null : msText(ms);
}
// 1.5.3: finer choices (1, 2, 2½, 5, 10, 15, 30 minutes, 1 hour). 2½ minutes is stored as "150s" (Ollama's format).
function keepMs(cfg) {
  const k = String(cfg?.ollamaKeepAlive ?? '5m');
  if (k === '-1') return Infinity;
  const m = k.match(/^(\d+)([smh])$/);
  return m ? Number(m[1]) * { s: 1000, m: 60000, h: 3600000 }[m[2]] : 300000;
}
export function msText(ms) {
  if (ms % 3600000 === 0) { const h = ms / 3600000; return `${h} hour${h === 1 ? '' : 's'}`; }
  if (ms % 30000 === 0 && ms >= 60000) { const whole = Math.floor(ms / 60000), half = ms % 60000 ? '½' : ''; return `${whole}${half} minute${whole === 1 && !half ? '' : 's'}`; }
  const s = Math.round(ms / 1000); return `${s} second${s === 1 ? '' : 's'}`;
}
// Big brains (the chat brain in Coding and Deep thought) get 2 minutes for a follow-up, or less if the setting is shorter.
export function bigGraceMs(cfg) { return Math.min(BIG_GRACE_MS, keepMs(cfg)); }
