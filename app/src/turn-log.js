// Testing and watching (reliability items 241-250, Nov 12). Always on, because they only count and label: nothing
// here reaches the brain, and nothing here holds chat words.
//   247 One id per turn in every log line: a turn runs inside inTurn(), and Brain.log() adds " | turn ab12cd34" to
//       every line written while it runs (the engine's lines too), so one turn can be pulled out of the logbook.
//   249 A "why did it stop" line for every ended turn (done, Stop, steps, time, repeats, error...), in the logbook and
//       on the job (job.stopWhy), so Tasks and a help bundle can show it.
//   246 The loop's numbers per release: steps, retries, corrections and time per job, kept per Bob version, so a
//       release that gets worse shows up on the Health page.
//   250 A weekly reliability line on the Health page: jobs finished, failed, corrected and retried in the last 7 days,
//       with the tool that failed most named.
// Kept in <data>/loop-stats.json: numbers, tool names and versions only (never what was said, never which chat).
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();
// store: { id, asks, ctx } (ctx: the turn's tool context, set by runOn, so the end of the turn can read its ledger).
export const inTurn = (store, fn) => als.run(store, fn);
export const turnNow = () => als.getStore() || null;
export const turnTag = (id) => String(id || '').replace(/[^\w]/g, '').slice(0, 8);
// The logbook line's tail: "| turn ab12cd34". Lines outside a turn (settings, start-up) have none.
export const turnField = (store = turnNow()) => (store?.id ? ` | turn ${turnTag(store.id)}` : '');
// All lines of one turn, from the logbook text.
export const turnLines = (logText, id) => String(logText || '').replace(/\r\n/g, '\n').split('\n').filter((l) => l.endsWith(` | turn ${turnTag(id)}`));

// ---------- 249: why a turn stopped ----------
export const STOP_WHY = {
  done: 'answered',
  stop: 'Stop was pressed',
  parked: 'Gaming took the card; the job waits',
  steps: 'ran out of steps',
  repeats: 'the same call came three times',
  time: "the job's time limit was used up",
  'stop-after': '"Stop after this step" was pressed',
  error: 'an error',
  busy: 'the graphics card was busy',
  handed: 'handed to another session or brain',
  // The safety net's wrap-ups (loop-guard.js, items 154-161).
  calls: 'the calls-per-turn limit was reached',
  stale: 'rounds kept finding nothing new',
  errors: 'every call kept failing',
  cycle: 'it went back and forth with nothing changing'
};
// Pure: what ended a turn. ctx.endWhy is set by the loop for steps/time/stop-after; ctx.repeatStop by #57.
export function endWhy({ ok = false, aborted = false, parked = false, error = null, ctx = null, switched = false } = {}) {
  if (parked) return 'parked';
  if (aborted) return 'stop';
  if (error) return error.code === 'card_busy' ? 'busy' : 'error';
  if (switched) return 'handed';
  if (ctx?.repeatStop) return 'repeats';
  if (ctx?.endWhy && STOP_WHY[ctx.endWhy]) return ctx.endWhy;
  if (ctx?.wrapped && STOP_WHY[ctx.wrapped]) return ctx.wrapped;
  return ok ? 'done' : 'error';
}
// The logbook line: no words from the chat, only the reason, the counts and the time.
export function whyLine(why, { steps = 0, retries = 0, corrections = 0, ms = 0, error = '' } = {}) {
  const secs = Math.max(0, Math.round((Number(ms) || 0) / 100) / 10);
  const errNote = why === 'error' && error ? ` (${String(error).replace(/\s+/g, ' ').slice(0, 120)})` : '';
  return `turn ended: ${STOP_WHY[why] || why}${errNote}; ${steps} step${steps === 1 ? '' : 's'}, ${retries} retr${retries === 1 ? 'y' : 'ies'}, ${corrections} correction${corrections === 1 ? '' : 's'}, ${secs} s`;
}

// What one turn did, from its ledger and counts. Tool names only.
export function turnSummary({ why, ms = 0, asks = 0, corrections = 0, ledger = null } = {}) {
  const steps = (ledger?.steps || []);
  const retries = steps.filter((s) => s.kind === 'retry').length + (Number(ledger?.nudged) || 0);
  const toolErrors = {};
  for (const a of ledger?.actions || []) if (a && a.ok === false && a.text !== 'declined') toolErrors[String(a.name).slice(0, 60)] = (toolErrors[String(a.name).slice(0, 60)] || 0) + 1;
  return { why, ms: Math.max(0, Math.round(Number(ms) || 0)), steps: Math.max(0, Number(asks) || 0), retries, corrections: Math.max(0, Number(corrections) || 0), toolErrors };
}

// ---------- 246 and 250: the numbers, per release and per day ----------
export const STATS_FILE = 'loop-stats.json';
export const KEEP_DAYS = 56;
export const KEEP_RELEASES = 12;
export const MIN_JOBS_TO_COMPARE = 20; // fewer jobs than this on either side: too few to say a release got worse
export const WORSE_BY = 1.5; // half again as many failures, corrections or retries per job counts as worse
const blank = () => ({ jobs: 0, finished: 0, failed: 0, stopped: 0, corrected: 0, retried: 0, steps: 0, retries: 0, corrections: 0, ms: 0, tools: {} });
const dayOf = (t, timeZone) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); } catch { return new Date(t).toISOString().slice(0, 10); } };
const isNum = (x) => Number.isFinite(Number(x)) && Number(x) >= 0;

function add(row, s) {
  row.jobs++;
  if (s.why === 'done') row.finished++;
  else if (s.why === 'stop' || s.why === 'parked' || s.why === 'stop-after') row.stopped++;
  else if (s.why === 'error' || s.why === 'busy' || s.why === 'repeats' || s.why === 'steps') row.failed++;
  else row.finished++; // time, handed: it answered
  if (s.corrections) row.corrected++;
  if (s.retries) row.retried++;
  row.steps += s.steps; row.retries += s.retries; row.corrections += s.corrections; row.ms += s.ms;
  for (const [t, n] of Object.entries(s.toolErrors || {})) row.tools[t] = (row.tools[t] || 0) + n;
}

// A row read from disk: only known numeric fields survive, so a bad file can't break the Health page.
function cleanRow(r) {
  const out = blank();
  if (!r || typeof r !== 'object') return out;
  for (const k of Object.keys(out)) if (k !== 'tools' && isNum(r[k])) out[k] = Number(r[k]);
  if (r.tools && typeof r.tools === 'object') for (const [t, n] of Object.entries(r.tools).slice(0, 200)) if (isNum(n)) out.tools[String(t).slice(0, 60)] = Number(n);
  return out;
}

export class LoopStats {
  constructor(cfg, { now = () => Date.now(), version = '' } = {}) { this.cfg = cfg; this.now = now; this.version = String(version || ''); this.data = null; }
  get file() { return path.join(this.cfg.dataDir || '.', STATS_FILE); }
  load() {
    if (this.data) return this.data;
    let d = null;
    try { d = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '')); } catch {}
    this.data = { v: 1, days: {}, releases: {}, order: [] };
    if (d && typeof d === 'object') {
      for (const [k, r] of Object.entries(d.days || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) this.data.days[k] = cleanRow(r);
      for (const [k, r] of Object.entries(d.releases || {})) if (/^[\w.-]{1,30}$/.test(k)) this.data.releases[k] = cleanRow(r);
      this.data.order = (Array.isArray(d.order) ? d.order : []).filter((k) => this.data.releases[k]);
    }
    return this.data;
  }
  save() {
    const d = this.load();
    const keep = dayOf(this.now() - KEEP_DAYS * 864e5, this.cfg.timeZone);
    for (const k of Object.keys(d.days)) if (k < keep) delete d.days[k];
    while (d.order.length > KEEP_RELEASES) delete d.releases[d.order.shift()];
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); const t = `${this.file}.part`; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, this.file); } catch {}
  }
  // One ended turn (turnSummary). A guest's job from another Bob counts too: it's this Bob's loop that ran.
  record(s) {
    if (!s || !s.why) return;
    const d = this.load();
    add((d.days[dayOf(this.now(), this.cfg.timeZone)] ||= blank()), s);
    if (this.version) {
      if (!d.releases[this.version]) { d.releases[this.version] = blank(); d.order = [...d.order.filter((v) => v !== this.version), this.version]; }
      add(d.releases[this.version], s);
    }
    this.save();
  }
  // 250: the last 7 days, today included.
  week() {
    const d = this.load();
    const out = blank();
    for (let i = 0; i < 7; i++) {
      const r = d.days[dayOf(this.now() - i * 864e5, this.cfg.timeZone)];
      if (!r) continue;
      for (const k of Object.keys(out)) if (k !== 'tools') out[k] += r[k];
      for (const [t, n] of Object.entries(r.tools)) out.tools[t] = (out.tools[t] || 0) + n;
    }
    return out;
  }
  // 246: this release and the one before it (the last release this Bob ran).
  releases() {
    const d = this.load();
    const now = this.version && d.releases[this.version] ? this.version : d.order.at(-1);
    const before = d.order.filter((v) => v !== now).at(-1);
    return { now: now ? { version: now, ...d.releases[now] } : null, before: before ? { version: before, ...d.releases[before] } : null };
  }
  clear() { this.data = { v: 1, days: {}, releases: {}, order: [] }; try { fs.rmSync(this.file, { force: true }); } catch {} }
}

const per = (r, k) => (r?.jobs ? r[k] / r.jobs : 0);
const one = (x) => (Math.round(x * 10) / 10).toString();
export function worstTool(tools = {}) {
  const top = Object.entries(tools || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return top && top[1] > 0 ? { name: top[0], errors: top[1] } : null;
}
// 246: which numbers got worse from one release to the next. Only with enough jobs on both sides.
export function worseThan(now, before) {
  if (!now || !before || now.jobs < MIN_JOBS_TO_COMPARE || before.jobs < MIN_JOBS_TO_COMPARE) return [];
  const out = [];
  for (const [k, label] of [['failed', 'failed jobs'], ['corrections', 'corrections'], ['retries', 'retries'], ['steps', 'steps']]) {
    const a = per(now, k), b = per(before, k);
    if (a > 0 && a >= Math.max(b * WORSE_BY, b + (k === 'steps' ? 1 : 0.05))) out.push(`${label} per job ${one(b)} to ${one(a)}`);
  }
  return out;
}

// The Health page's line (health.js). week: LoopStats.week(); rel: LoopStats.releases().
export function reliabilityCheck(week, rel = {}) {
  if (!week || !week.jobs) return { id: 'reliability', label: 'This week', level: 'info', says: 'No jobs in the last 7 days yet, so nothing to count.' };
  const worst = worstTool(week.tools);
  const lines = [];
  const bad = worseThan(rel.now, rel.before);
  if (rel.now?.jobs) lines.push(`Version ${rel.now.version}: ${one(per(rel.now, 'steps'))} steps, ${one(per(rel.now, 'retries'))} retries and ${one(per(rel.now, 'corrections'))} corrections per job, ${one(per(rel.now, 'ms') / 1000)} s each (${rel.now.jobs} job${rel.now.jobs === 1 ? '' : 's'}).`);
  if (rel.before?.jobs) lines.push(`Version ${rel.before.version}: ${one(per(rel.before, 'steps'))} steps, ${one(per(rel.before, 'retries'))} retries and ${one(per(rel.before, 'corrections'))} corrections per job (${rel.before.jobs} job${rel.before.jobs === 1 ? '' : 's'}).`);
  const failedShare = week.failed / week.jobs;
  const level = bad.length || failedShare >= 0.25 ? 'warn' : 'ok';
  const says = `In the last 7 days: ${week.finished} job${week.finished === 1 ? '' : 's'} finished, ${week.failed} failed, ${week.corrected} corrected, ${week.retried} retried${week.stopped ? `, ${week.stopped} stopped by you` : ''}.${worst ? ` The tool that failed most: ${worst.name} (${worst.errors} time${worst.errors === 1 ? '' : 's'}).` : ' No tool failed.'}${bad.length ? ` Worse since the last version: ${bad.join(', ')}.` : ''}`;
  return { id: 'reliability', label: 'This week', level, says, ...(lines.length ? { lines } : {}), ...(level === 'warn' ? { fix: { id: 'go:help-bundle', label: 'Save a help bundle' } } : {}) };
}
