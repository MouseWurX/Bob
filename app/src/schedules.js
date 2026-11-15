// Bob's own schedules: "every Monday at 9:00 back up a project", "every 2 hours tidy Downloads".
// They live in inn\bob\schedules.json and Bob runs them himself while he is open. Nothing is
// scheduled by default, and a new schedule starts switched off until it is turned on.
//
//   const s = new Schedules(cfg);
//   s.add({ name, job, when })       -> the new entry (enabled: false unless { enabled: true } is passed)
//   s.list()                         -> every entry, each with nextDue (ISO, or '' when it won't run again)
//   s.update(id, patch) / s.remove(id)
//   s.due(now)                       -> entries whose time has come (empty while the Schedules hand is off)
//   s.markRan(id, { at, ok, note })  -> records the run; the next time is worked out from then
//
// "when" is in the PC's local time:
//   { type: 'once',     date: '2026-11-09', at: '09:00' }
//   { type: 'daily',    at: '09:00' }
//   { type: 'weekly',   days: [1, 4], at: '09:00' }     (0 = Sunday ... 6 = Saturday)
//   { type: 'interval', everyMinutes: 120 }             (at least 5 minutes)
//
// Missed runs (Bob was closed, the PC was asleep) catch up once: the entry is due once, and after it
// runs the next time is counted from the run, so a week away gives one catch-up, not seven.
//
// "job" is whatever Bob should do when it is due ({ kind: 'files', ... }, { kind: 'run', ... }). This
// module only keeps time; running the job, and asking before each action, is the brain's work.
//
// Windows Task Scheduler is a separate opt-in (installer\bob-schedule.ps1): it only wakes Bob, hidden,
// when a schedule is due and Bob isn't open. setWindowsTask(cfg, true/false) adds or removes it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { appDir } from './config.js';

export const TASK_FOLDER = '\\';
export const TASK_NAME = 'Bob schedules';
export const MAX_SCHEDULES = 100;
export const MIN_INTERVAL = 5;
const TYPES = ['once', 'daily', 'weekly', 'interval'];
const DAY = 24 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');
const parseAt = (at) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(at || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return { h: +m[1], m: +m[2] };
};
const parseDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '').trim());
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3]);
  return t.getMonth() === +m[2] - 1 && t.getDate() === +m[3] ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null;
};
const toMs = (v) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : v ? Date.parse(v) : NaN);

// Checks and tidies a "when". Throws with a plain-English reason.
export function cleanWhen(w) {
  if (!w || typeof w !== 'object') throw new Error('Say when it should run.');
  const type = String(w.type || '').toLowerCase();
  if (!TYPES.includes(type)) throw new Error('When should be once, daily, weekly or every so many minutes.');
  if (type === 'interval') {
    const every = Math.round(Number(w.everyMinutes));
    if (!Number.isFinite(every) || every < MIN_INTERVAL) throw new Error(`Every so many minutes needs at least ${MIN_INTERVAL} minutes.`);
    if (every > 60 * 24 * 31) throw new Error('Every so many minutes can be at most 31 days.');
    return { type, everyMinutes: every };
  }
  const at = parseAt(w.at);
  if (!at) throw new Error('The time should look like 09:00 (24-hour).');
  const out = { type, at: `${pad(at.h)}:${pad(at.m)}` };
  if (type === 'once') {
    if (!parseDate(w.date)) throw new Error('The date should look like 2026-11-09.');
    out.date = String(w.date).trim();
  }
  if (type === 'weekly') {
    const days = [...new Set((Array.isArray(w.days) ? w.days : [w.days]).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
    if (!days.length) throw new Error('Pick at least one day of the week.');
    out.days = days;
  }
  return out;
}

// The first time strictly after `afterMs` that this "when" fires (local time), or null if never.
export function nextAfter(when, afterMs, { anchorMs = afterMs } = {}) {
  if (when.type === 'interval') {
    // Counted from the anchor (the last run, or when it was switched on); a missed stretch fires once.
    // If that is already past, it is simply overdue and due (once) now.
    return anchorMs + when.everyMinutes * 60000;
  }
  const { h, m } = parseAt(when.at);
  if (when.type === 'once') {
    const d = parseDate(when.date);
    const t = new Date(d.y, d.mo, d.d, h, m).getTime();
    return t > afterMs ? t : null;
  }
  const start = new Date(afterMs);
  for (let i = 0; i <= 8; i++) {
    // new Date(y, m, d + i, h, m) stays on local wall-clock time across daylight-saving changes.
    const t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, h, m);
    if (t.getTime() <= afterMs) continue;
    if (when.type === 'weekly' && !when.days.includes(t.getDay())) continue;
    return t.getTime();
  }
  return null;
}

// In plain English, for the list and the approval card.
export function describe(when) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (when.type === 'interval') {
    const e = when.everyMinutes;
    if (e % (60 * 24) === 0) return `every ${e / 1440 === 1 ? 'day' : `${e / 1440} days`}`;
    if (e % 60 === 0) return `every ${e / 60 === 1 ? 'hour' : `${e / 60} hours`}`;
    return `every ${e} minutes`;
  }
  if (when.type === 'once') return `once, on ${when.date} at ${when.at}`;
  if (when.type === 'daily') return `every day at ${when.at}`;
  const ds = when.days.length === 7 ? 'every day' : when.days.join() === '1,2,3,4,5' ? 'every weekday' : `every ${when.days.map((d) => days[d]).join(', ').replace(/, ([^,]*)$/, ' and $1')}`;
  return `${ds} at ${when.at}`;
}

export class Schedules {
  // isOn: the Schedules hand's own switch AND the global "Stop everything" (the caller decides both).
  // Off by default: until the caller says otherwise nothing is ever due.
  constructor(cfg, { isOn = () => false, now = () => Date.now(), log = null } = {}) {
    this.cfg = cfg;
    this.file = path.join(cfg.dataDir, 'schedules.json');
    this.isOn = isOn;
    this.now = now;
    this.log = log || ((kind, text) => this.#logbook(kind, text));
    this.running = new Set();
  }

  #logbook(kind, text) {
    if (!this.cfg.logbook) return;
    try {
      const d = new Date(this.now());
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (!fs.existsSync(this.cfg.logbook)) fs.writeFileSync(this.cfg.logbook, "# Bob's logbook\n\nEverything Bob did, newest at the bottom.\n\n");
      fs.appendFileSync(this.cfg.logbook, `- ${stamp} | ${kind} | ${String(text).replace(/\s+/g, ' ').slice(0, 200)}\n`);
    } catch { /* logging never breaks a schedule */ }
  }

  #read() {
    let raw;
    try { raw = fs.readFileSync(this.file, 'utf8'); } catch { return []; }
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j?.schedules) ? j.schedules.filter((e) => e && e.id && e.when) : [];
    } catch {
      // A broken file is kept to one side (never deleted) and Bob starts with an empty list.
      try { fs.renameSync(this.file, `${this.file}.broken-${Date.now()}`); } catch {}
      this.log('schedules', 'schedules.json could not be read; kept a copy and started an empty list');
      return [];
    }
  }

  #write(list) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const now = this.now();
    // nextDue is saved too, so the opt-in Windows task can tell whether to wake Bob without running him.
    const out = { version: 1, schedules: list.map((e) => ({ ...e, nextDue: this.#nextIso(e, now) })) };
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
    fs.renameSync(tmp, this.file);
  }

  #next(e, now) {
    if (!e.enabled || e.done) return null;
    const anchor = toMs(e.lastRun) || toMs(e.enabledAt) || toMs(e.createdAt) || now;
    // The first fire time after the last run (or after it was switched on). If that is in the past it was
    // missed, and it stays due (once) until it runs.
    return nextAfter(e.when, anchor, { anchorMs: anchor });
  }

  #nextIso(e, now) {
    const t = this.#next(e, now);
    return t == null ? '' : new Date(t).toISOString();
  }

  list() {
    const now = this.now();
    return this.#read().map((e) => ({ ...e, nextDue: this.#nextIso(e, now), says: describe(e.when) }));
  }

  get(id) { return this.list().find((e) => e.id === id) || null; }

  add({ name, job, when, enabled = false } = {}) {
    const list = this.#read();
    if (list.length >= MAX_SCHEDULES) throw new Error(`Bob keeps at most ${MAX_SCHEDULES} schedules. Remove one first.`);
    const nm = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!nm) throw new Error('Give the schedule a name.');
    if (!job || typeof job !== 'object' || Array.isArray(job)) throw new Error('Say what Bob should do.');
    const now = new Date(this.now()).toISOString();
    const e = { id: crypto.randomUUID().slice(0, 8), name: nm, job, when: cleanWhen(when), enabled: Boolean(enabled), createdAt: now, enabledAt: enabled ? now : '', lastRun: '', lastResult: null, runs: 0 };
    list.push(e);
    this.#write(list);
    this.log('schedules', `added "${nm}" (${describe(e.when)})${e.enabled ? ', switched on' : ', switched off'}`);
    return this.get(e.id);
  }

  update(id, patch = {}) {
    const list = this.#read();
    const e = list.find((x) => x.id === id);
    if (!e) throw new Error('That schedule is gone.');
    const now = new Date(this.now()).toISOString();
    if (patch.name != null) {
      const nm = String(patch.name).replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!nm) throw new Error('Give the schedule a name.');
      e.name = nm;
    }
    if (patch.job != null) {
      if (typeof patch.job !== 'object' || Array.isArray(patch.job)) throw new Error('Say what Bob should do.');
      e.job = patch.job;
    }
    if (patch.when != null) {
      e.when = cleanWhen(patch.when);
      // A new time starts fresh from now: no catch-up for times under the old rule.
      e.enabledAt = now; e.lastRun = ''; e.done = false;
    }
    if (patch.enabled != null && Boolean(patch.enabled) !== Boolean(e.enabled)) {
      e.enabled = Boolean(patch.enabled);
      // Switching on counts from now, so turning an old schedule back on doesn't fire a catch-up at once.
      if (e.enabled) { e.enabledAt = now; e.lastRun = ''; e.done = false; }
    }
    this.#write(list);
    this.log('schedules', `changed "${e.name}" (${describe(e.when)}, ${e.enabled ? 'on' : 'off'})`);
    return this.get(id);
  }

  remove(id) {
    const list = this.#read();
    const e = list.find((x) => x.id === id);
    if (!e) return false;
    this.#write(list.filter((x) => x.id !== id));
    this.running.delete(id);
    this.log('schedules', `removed "${e.name}"`);
    return true;
  }

  // Entries whose time has come, oldest first. Each is due once however many times it was missed.
  // One that is still running (taken with start(), not yet markRan) isn't handed out again.
  due(now = this.now()) {
    if (!this.isOn()) return [];
    const t = toMs(now);
    return this.#read()
      .map((e) => ({ e, at: this.#next(e, t) }))
      .filter(({ e, at }) => at != null && at <= t && !this.running.has(e.id))
      .sort((a, b) => a.at - b.at)
      .map(({ e, at }) => ({ ...e, dueAt: new Date(at).toISOString(), late: t - at > 60000, says: describe(e.when) }));
  }

  // The caller takes an entry before it runs it, so a slow job isn't started twice by the next tick.
  start(id) {
    if (this.running.has(id)) return false;
    this.running.add(id);
    return true;
  }

  markRan(id, { at = this.now(), ok = true, note = '' } = {}) {
    this.running.delete(id);
    const list = this.#read();
    const e = list.find((x) => x.id === id);
    if (!e) return null;
    e.lastRun = new Date(toMs(at)).toISOString();
    e.lastResult = { ok: Boolean(ok), note: String(note || '').slice(0, 300), at: e.lastRun };
    e.runs = (e.runs || 0) + 1;
    if (e.when.type === 'once') { e.done = true; e.enabled = false; }
    this.#write(list);
    this.log('schedules', `ran "${e.name}": ${ok ? 'done' : 'did not finish'}${note ? ` (${note})` : ''}`);
    return this.get(id);
  }

  // The soonest upcoming run, for "Next: Monday 09:00" in the window and the tick timer.
  nextRun(now = this.now()) {
    const t = toMs(now);
    let best = null;
    for (const e of this.#read()) {
      const at = this.#next(e, t);
      if (at != null && (!best || at < best.at)) best = { id: e.id, name: e.name, at };
    }
    return best && { ...best, at: new Date(best.at).toISOString() };
  }
}

// Ticks once a minute (and straight away, for catch-ups after start-up) and hands each due entry to
// run(entry). run must ask before each action, exactly as a chat request would.
// hold(): true while due entries should wait (👥 another user is in); they stay due and run once it's false again.
export function startTicker(schedules, run, { everyMs = 60000, hold = () => false } = {}) {
  let stopped = false;
  const tick = async () => {
    if (stopped || hold()) return;
    for (const e of schedules.due()) {
      if (!schedules.start(e.id)) continue;
      Promise.resolve()
        .then(() => run(e))
        .then((r) => schedules.markRan(e.id, { ok: r?.ok !== false, note: r?.note || '' }))
        .catch((err) => schedules.markRan(e.id, { ok: false, note: err?.message || String(err) }));
    }
  };
  const timer = setInterval(tick, everyMs);
  timer.unref?.();
  setTimeout(tick, 1000).unref?.();
  return { stop() { stopped = true; clearInterval(timer); }, tick };
}

// --- Windows Task Scheduler (opt-in, separate switch) ---------------------------------------------

export function taskArgs(cfg, on, env = process.env) {
  const script = path.join(appDir, 'installer', 'bob-schedule.ps1');
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-Action', on ? 'Add' : 'Remove'];
  if (on) {
    const exe = env.BOB_APP_DIR ? path.join(env.BOB_APP_DIR, 'Bob.exe') : '';
    if (!exe || !fs.existsSync(exe)) throw new Error('Waking Bob on a schedule needs the installed Bob.exe (not Bob running from source).');
    args.push('-BobExe', exe, '-Data', cfg.dataDir, '-Port', String(cfg.port || 7777));
  }
  return { script, args };
}

// Adds (on) or removes (off) the per-user "Bob schedules" task. No admin: it runs as you, only while
// you're signed in. Resolves { ok, out } with the script's last line.
export function setWindowsTask(cfg, on, { spawnImpl = spawn, env = process.env } = {}) {
  if (process.platform !== 'win32' && spawnImpl === spawn) return Promise.reject(new Error('The Windows task works on Windows.'));
  const { script, args } = taskArgs(cfg, on, env);
  if (!fs.existsSync(script)) return Promise.reject(new Error('installer\\bob-schedule.ps1 is missing.'));
  return new Promise((resolve, reject) => {
    let out = '';
    const ps = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawnImpl(ps, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('exit', (code) => {
      const last = out.trim().split(/\r?\n/).pop() || '';
      code === 0 ? resolve({ ok: true, out: last }) : reject(new Error(last || `The task script stopped (code ${code}).`));
    });
  });
}

// Remove Bob calls this so the task never outlives Bob. Fire and forget; a missing task is fine.
export function removeTaskCommand(env = process.env) {
  const exe = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'schtasks.exe');
  return [exe, ['/Delete', '/TN', `${TASK_FOLDER}${TASK_NAME}`, '/F']];
}
