// Errors and retries (reliability items 193-207). Always on: these are fixes, so there is no switch.
// Nothing here adds words to the brain's start-of-job prompt. A note to the brain is one line inside a tool result,
// and only when a check fires.
//
//   backoffMs / jitter    wait a little longer each retry, with a bit of randomness (194)
//   engineFailKind        which engine failures are worth another go: dropped, busy (503), out of memory (195)
//   carryOnTokens         a retry after a drop-out doesn't show the words already on screen twice (193)
//   toolErrorText         a tool's error in plain words with what to try next, from the error's own code (198)
//   ToolStrikes           three failures of the same tool in a job: it's set aside, and Bob offers to fix it after (200)
//   rootCause / causeLine the first error, not the last wrapper, in the logbook (207)
//   ErrorTally            error lines counted per tool per day, so a tool that breaks after an update shows up (206)
//   sideJob               memory, notes and how-tos never break the reply; each failure is one logbook line (204)
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------------------------------------------
// 194: waits that grow, with a bit of randomness so two Bobs (or two jobs) don't knock at the same moment.
// ---------------------------------------------------------------------------------------------------------------
// attempt 0 waits base/2..base, attempt 1 base..2*base, and so on, up to max.
export function backoffMs(attempt, { base = 1000, max = 30000, rand = Math.random } = {}) {
  const d = Math.min(max, base * 2 ** Math.max(0, Number(attempt) || 0));
  return Math.max(0, Math.round(d / 2 + rand() * (d / 2)));
}
// A fixed wait, give or take a quarter.
export const jitter = (ms, rand = Math.random) => Math.max(0, Math.round(Number(ms || 0) * (0.75 + rand() * 0.5)));

// ---------------------------------------------------------------------------------------------------------------
// 207: the real cause. fetch() says "fetch failed" and hides ECONNREFUSED in e.cause; wrappers hide the first error.
// ---------------------------------------------------------------------------------------------------------------
export function rootCause(e) {
  let cur = e;
  const seen = new Set();
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const next = cur.cause ?? (Array.isArray(cur.errors) && cur.errors.length ? cur.errors[0] : undefined);
    if (next === undefined || next === null) break;
    if (typeof next !== 'object') return { message: String(next) };
    cur = next;
  }
  return cur;
}
const words = (x) => [x?.code, x?.message].filter(Boolean).map(String).join(' ').trim();
// "fetch failed (first error: ECONNREFUSED connect ECONNREFUSED 127.0.0.1:8080)", or just the message.
export function causeLine(e) {
  const top = String(e?.message ?? e ?? '').trim();
  const root = rootCause(e);
  if (!root || root === e) return top;
  const r = words(root);
  if (!r || top.includes(r)) return top;
  return `${top} (first error: ${r.slice(0, 200)})`;
}

// ---------------------------------------------------------------------------------------------------------------
// 195: which engine failures a second try can fix.
//   dropped  the engine stopped answering mid-reply (connection reset, it closed): load it again
//   memory   it ran out of memory: let it go and load it again (the next items lower the size)
//   busy     503 or "loading model": it is there but not ready; wait a little and ask again, no reload
// ---------------------------------------------------------------------------------------------------------------
const BUSY = /\b(?:503|429)\b|service unavailable|too many requests|server (?:is )?busy|no (?:free |available )?slots? (?:is )?(?:available|free)|slot unavailable|loading model|model is (?:still )?loading|still loading/i;
const MEMORY = /out of memory|\bOOM\b|failed to allocate|cudaMalloc|ErrorOutOfDeviceMemory|OutOfDeviceMemory|insufficient memory|not enough memory|alloc(?:ation)? failed|unable to allocate/i;
const DROPPED = /ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|fetch failed|terminated|other side closed|stopped mid-answer|UND_ERR_SOCKET|connection (?:was )?(?:reset|closed|lost)/i;
export function engineFailKind(e) {
  const root = rootCause(e);
  const all = `${e?.message || e || ''} ${words(root)} ${e?.status || ''}`;
  if (Number(e?.status) === 503 || Number(e?.status) === 429 || BUSY.test(all)) return 'busy';
  if (MEMORY.test(all)) return 'memory';
  if (DROPPED.test(all)) return 'dropped';
  return '';
}

// ---------------------------------------------------------------------------------------------------------------
// 193: after a drop-out the words already shown stay; the retry's words that repeat them are held back, and only
// what's new is shown. If the retry goes another way, the words that differ are taken back first (token-undo).
// ---------------------------------------------------------------------------------------------------------------
export function carryOnTokens(shown, onToken, onUndo) {
  const have = String(shown || '');
  let said = '', parted = false;
  const push = (t) => { if (t) onToken?.(t); };
  const part = () => {
    parted = true;
    let k = 0;
    while (k < said.length && k < have.length && said[k] === have[k]) k++;
    if (have.length - k > 0) onUndo?.(have.length - k);
    push(said.slice(k));
  };
  return {
    onToken(t) {
      if (parted) return push(t);
      said += String(t ?? '');
      if (have.startsWith(said)) return; // still saying what's on screen
      if (said.startsWith(have)) { parted = true; return push(said.slice(have.length)); }
      part();
    },
    // The retry ended before it caught up: what's left on screen past its words is taken back.
    finish() { if (!parted && have.length > said.length) { parted = true; onUndo?.(have.length - said.length); } },
    get parted() { return parted; }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 198: a tool's error in plain words, with what to try next, from the error's own code (never guessed from the
// words afterwards). A tool can also throw toolError(plain, next) itself.
// ---------------------------------------------------------------------------------------------------------------
export function toolError(plain, next = '', { code = '', transient = false } = {}) {
  return Object.assign(new Error(plain), { plain, next, code, transient });
}
const name = (p) => (p ? `"${String(p).slice(0, 200)}"` : '');
const CODES = {
  ENOENT: (p) => [`${p ? `${name(p)} isn't there` : 'that file or folder isn\'t there'}`, 'check the name and folder with list_files, then try once more'],
  EACCES: (p) => [`Bob isn't allowed to open ${name(p) || 'that'}`, 'use a file or folder Bob can reach, or ask the user to allow it'],
  EPERM: (p) => [`Bob isn't allowed to change ${name(p) || 'that'}`, 'use a file or folder Bob can reach, or ask the user to allow it'],
  EISDIR: (p) => [`${name(p) || 'that'} is a folder, not a file`, 'name a file inside it'],
  ENOTDIR: (p) => [`part of ${name(p) || 'that path'} is a file, not a folder`, 'check the path with list_files'],
  EEXIST: (p) => [`${name(p) || 'that'} is already there`, 'pick another name, or ask whether to replace it'],
  ENOTEMPTY: (p) => [`${name(p) || 'that folder'} isn't empty`, 'say what to do with what is in it'],
  ENOSPC: () => ['the disk is full', 'tell the user; nothing more can be saved until some space is freed'],
  EBUSY: (p) => [`${name(p) || 'that file'} is in use by another program`, 'ask the user to close it, then try once more'],
  EROFS: (p) => [`${name(p) || 'that place'} can only be read`, 'save it somewhere else'],
  ENAMETOOLONG: () => ['that name or path is too long', 'use a shorter name'],
  ETIMEDOUT: () => ['it took too long to answer', 'try once more, or another way'],
  ECONNREFUSED: () => ['nothing answered at that address', 'check the program or site is running'],
  ECONNRESET: () => ['the connection dropped', 'try once more'],
  ENOTFOUND: () => ['that address couldn\'t be found', 'check the address, or the internet connection'],
  EAI_AGAIN: () => ['that address couldn\'t be looked up just now', 'try once more in a moment'],
  ENETUNREACH: () => ['the network can\'t be reached', 'check the internet connection'],
  EHOSTUNREACH: () => ['that computer can\'t be reached', 'check it is on and on the network']
};
const TRANSIENT_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'EBUSY']);
// { text, hinted, code, transient }. hinted: the text already says what to try next.
export function toolErrorText(e) {
  if (e?.plain) return { text: `Error: ${String(e.plain).replace(/\.\s*$/, '')}.${e.next ? ` Next: ${String(e.next).replace(/\.\s*$/, '')}.` : ''}`, hinted: Boolean(e.next), code: e.code || 'tool', transient: Boolean(e.transient) };
  const root = rootCause(e) || e;
  const code = String(root?.code || e?.code || (root?.name === 'TimeoutError' || e?.name === 'TimeoutError' ? 'ETIMEDOUT' : '') || '');
  const make = CODES[code];
  if (!make) return { text: `Error: ${e?.message ?? e}`, hinted: false, code, transient: false };
  const [what, next] = make(root?.path || e?.path || root?.hostname || '');
  return { text: `Error: ${what}. Next: ${next}.`, hinted: true, code, transient: TRANSIENT_CODES.has(code) };
}

// ---------------------------------------------------------------------------------------------------------------
// 200: three strikes (the owner's rule, Nov 12): the same tool failing three times in a row in one job is set aside for
// the rest of it. A success clears its count. After the job, Bob offers once to look at it harder and fix it.
export const STRIKES = 3;
// ---------------------------------------------------------------------------------------------------------------
const NEVER_STRUCK = new Set(['use_tools', 'ask_user', 'show_plan', 'ask_together', 'offer_setup']);
export class ToolStrikes {
  constructor() { this.fails = new Map(); this.off = new Set(); this.last = new Map(); }
  blocked(tool) { return this.off.has(tool); }
  lastError(tool) { return this.last.get(tool) || ''; }
  // Returns how many times in a row it has now failed (0 after a success).
  record(tool, ok, text = '') {
    if (NEVER_STRUCK.has(tool)) return 0;
    if (ok) { this.fails.delete(tool); return 0; }
    this.last.set(tool, String(text || '').replace(/^Error:\s*/, '').replace(/\s+/g, ' ').slice(0, 160));
    const n = (this.fails.get(tool) || 0) + 1;
    this.fails.set(tool, n);
    if (n >= STRIKES) this.off.add(tool);
    return n;
  }
}
export const STRIKE_NOTE = (tool, who) => ` (${tool} has failed three times in this job, so it's set aside now: try one other way, or tell ${who} plainly what's in the way.)`;
export const STRUCK_OUT = (tool, who, last = '') => `Error: not run. ${tool} failed three times in this job${last ? ` (last time: ${last})` : ''}, so it isn't tried again. Use another way, or tell ${who} what failed.`;
// After the job: one line under the answer, offering to look at the tools set aside. Only when one was.
export function fixOffer(tools) {
  const list = [...new Set(tools)].filter(Boolean).slice(0, 4);
  if (!list.length) return '';
  const names = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  const it = list.length === 1 ? 'it' : 'them';
  return `🔧 ${names} kept failing on this job, so I set ${it} aside. Want me to look at ${it} harder and try to fix ${it}?`;
}

// ---------------------------------------------------------------------------------------------------------------
// 206: error lines counted per tool per day (dataDir/tool-errors.json, the last 30 days). Counts only, never words.
// ---------------------------------------------------------------------------------------------------------------
export const TALLY_DAYS = 30;
const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export class ErrorTally {
  constructor(file, { now = Date.now, saveMs = 5000 } = {}) {
    this.file = file; this.now = now; this.saveMs = saveMs; this.timer = null;
    this.days = {};
    try { const j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); if (j && typeof j.days === 'object') this.days = j.days; } catch {}
  }
  add(tool, n = 1) {
    if (!tool) return;
    const d = dayOf(this.now());
    const row = (this.days[d] ||= {});
    row[tool] = (row[tool] || 0) + n;
    const keep = Object.keys(this.days).sort().slice(-TALLY_DAYS);
    for (const k of Object.keys(this.days)) if (!keep.includes(k)) delete this.days[k];
    this.later();
  }
  later() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.save(); }, this.saveMs);
    this.timer.unref?.();
  }
  save() {
    if (!this.file) return;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); const t = `${this.file}.tmp`; fs.writeFileSync(t, JSON.stringify({ v: 1, days: this.days })); fs.renameSync(t, this.file); } catch {}
  }
  today() { return { ...(this.days[dayOf(this.now())] || {}) }; }
  // The usual day for this tool: the average over the days before today that are on record (up to 7).
  usual(tool) {
    const t = dayOf(this.now());
    const before = Object.keys(this.days).filter((d) => d < t).sort().slice(-7);
    if (!before.length) return 0;
    return before.reduce((s, d) => s + (this.days[d][tool] || 0), 0) / before.length;
  }
  // Tools failing more than usual today: at least 3 errors and at least three times their usual day.
  unusual() {
    return Object.entries(this.today()).map(([tool, n]) => ({ tool, n, usual: Math.round(this.usual(tool) * 10) / 10 }))
      .filter((x) => x.n >= 3 && x.n >= 3 * x.usual).sort((a, b) => b.n - a.n);
  }
  // For the Health page: [{ tool, n, usual }] for today, most first.
  view() { return Object.entries(this.today()).map(([tool, n]) => ({ tool, n, usual: Math.round(this.usual(tool) * 10) / 10 })).sort((a, b) => b.n - a.n); }
}

// ---------------------------------------------------------------------------------------------------------------
// 204: a side job (memory, notes, how-tos, recall) never breaks the reply. A failure is one logbook line.
// ---------------------------------------------------------------------------------------------------------------
export function sideJob(log, what, fn, fallback = undefined) {
  const said = (e) => { try { log?.('side', `${what} didn't work: ${causeLine(e).slice(0, 200)}`); } catch {} return fallback; };
  try {
    const r = fn();
    return r && typeof r.then === 'function' ? r.catch(said) : r;
  } catch (e) { return said(e); }
}

// ---------------------------------------------------------------------------------------------------------------
// 197: before an action is tried again, look whether it half-happened after all.
//   write_file / save_spreadsheet: the file is there with what was sent -> done, no second go
//   media tools: a new file in the output folders since it started -> done, shown, no second go
// Returns { done: true, why, files? } or { done: false }.
// ---------------------------------------------------------------------------------------------------------------
const MEDIA_EXT = /\.(?:png|jpe?g|webp|bmp|gif|mp4|webm|mov|avi|mkv|wav|mp3|ogg|flac|m4a)$/i;
export function halfDone(tool, args = {}, startedAt = 0, { outputDirs = [] } = {}) {
  try {
    if (tool === 'write_file' && args?.path) {
      const body = fs.readFileSync(String(args.path));
      if (body.equals(Buffer.from(String(args.content ?? '')))) return { done: true, why: `${path.basename(String(args.path))} is there with what was written`, files: [String(args.path)] };
      return { done: false };
    }
    if (['make_image', 'make_video', 'make_music', 'make_sound'].includes(tool)) {
      const fresh = [];
      for (const d of outputDirs) {
        let names = [];
        try { names = fs.readdirSync(d); } catch { continue; }
        for (const n of names) {
          if (!MEDIA_EXT.test(n)) continue;
          const f = path.join(d, n);
          try { const st = fs.statSync(f); if (st.isFile() && st.size > 0 && st.mtimeMs >= startedAt) fresh.push({ f, t: st.mtimeMs }); } catch {}
        }
      }
      if (fresh.length) return { done: true, why: `${fresh.length} new file${fresh.length === 1 ? '' : 's'} came out after all`, files: fresh.sort((a, b) => a.t - b.t).map((x) => x.f).slice(-4) };
    }
  } catch {}
  return { done: false };
}

// A wait that a Stop ends at once.
export const pause = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new Error('Stopped.'));
  const t = setTimeout(() => { signal?.removeEventListener?.('abort', stop); resolve(); }, Math.max(0, ms));
  const stop = () => { clearTimeout(t); reject(new Error('Stopped.')); };
  signal?.addEventListener?.('abort', stop, { once: true });
});
