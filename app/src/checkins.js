// Check-ins (Settings, Show advanced settings, 🔔 Check-ins): on a schedule you pick, Bob looks over his own
// state and only taps you on the shoulder when something needs you. Off unless you turn it on.
//
// Two kinds of checks:
//   - built-in ones (downloads, tasks, schedules, disk space): plain code, no brain at all, so they cost nothing.
//   - your own lines ("did the build finish?"): the small brain reads what Bob can see (his tasks, downloads,
//     schedules and logbook since the last check-in) and says which lines need you. It never uses tools or
//     changes anything. It runs on the processor (a second llama-server beside the main brain on Bob's own
//     engine, so nothing is swapped out), only while Bob is idle, never in the Gaming session (those lines wait
//     until Gaming ends), and the brain is let go again afterwards if it wasn't loaded before.
//
// It keeps time with the same clock as Schedules (src/schedules.js nextAfter), so a missed check-in (Bob closed,
// PC asleep) catches up once, not once per missed day. Nothing here needs the Schedules Hand: a check-in only looks.
// The same issue isn't announced twice in a row unless a day has passed. State: inn\bob\checkins.json.
import fs from 'node:fs';
import path from 'node:path';
import { cleanWhen, nextAfter, describe } from './schedules.js';
import { checkinSettings, cleanCheckins, CHECKS, LOW_DISK_GB } from './checkin-settings.js';
import { saveSettings } from './config.js';
import { sessionBrains, gaming } from './sessions.js';
import { brainMode } from './brain-mode.js';
import { parseJson } from './util.js';

export { CHECKS, cleanCheckins, checkinSettings };
export const STALL_MS = 15 * 60e3; // a download that hasn't moved for 15 minutes "stopped moving"
export const RENOTIFY_MS = 20 * 3600e3; // the same issue again only after most of a day
export const OWN_WAIT_MS = 6 * 3600e3; // your own lines wait for an idle, non-Gaming moment this long at most
const LOG_LINES = 80;

export function whenOf(s) {
  if (s.how === 'hours') return cleanWhen({ type: 'interval', everyMinutes: s.hours * 60 });
  if (s.how === 'weekdays') return cleanWhen({ type: 'weekly', days: [1, 2, 3, 4, 5], at: s.at });
  return cleanWhen({ type: 'daily', at: s.at });
}
export const says = (s) => describe(whenOf(s));

const short = (t, n = 80) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const gb = (b) => Math.round(b / 1e8) / 10;
const sentence = (t) => { const x = String(t || '').trim(); return !x || /[.!?…]$/.test(x) ? x : `${x}.`; };

export { parseJson };

export class CheckIns {
  constructor(brain, { now = () => Date.now(), statfs = (p) => fs.statfsSync(p) } = {}) {
    this.brain = brain;
    this.cfg = brain.cfg;
    this.now = now;
    this.statfs = statfs;
    this.file = path.join(this.cfg.dataDir, 'checkins.json');
    this.seen = new Map(); // download id -> { done, at }: when its byte count last moved
    this.working = false;
  }

  get settings() { return checkinSettings(this.cfg); }

  state() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) || {}; } catch { return {}; } }
  saveState(st) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(st, null, 2));
      fs.renameSync(tmp, this.file);
    } catch { /* a check-in never breaks Bob */ }
  }
  log(text) { try { this.brain.log?.('check-in', text); } catch {} }

  // Your settings change: switching on (or a new time) counts from now, so it doesn't fire a catch-up at once.
  change(patch = {}) {
    const before = this.settings;
    const next = cleanCheckins({ ...before, ...patch, checks: { ...before.checks, ...(patch.checks || {}) } });
    saveSettings(this.cfg, { checkins: next });
    const timing = ['enabled', 'how', 'at', 'hours'].some((k) => before[k] !== next[k]);
    if (timing && next.enabled) this.saveState({ ...this.state(), enabledAt: new Date(this.now()).toISOString(), ownWaiting: null });
    if (before.enabled !== next.enabled) this.log(next.enabled ? `check-ins on (${says(next)})` : 'check-ins off');
    return this.view();
  }

  nextDue(st = this.state()) {
    const s = this.settings;
    if (!s.enabled) return null;
    let anchor = Date.parse(st.lastRun || '') || Date.parse(st.enabledAt || '');
    if (!anchor) { anchor = this.now(); this.saveState({ ...st, enabledAt: new Date(anchor).toISOString() }); } // on with no start time yet: count from now, once
    return nextAfter(whenOf(s), anchor, { anchorMs: anchor });
  }

  view() {
    const st = this.state(), s = this.settings, next = this.nextDue(st);
    return { ...s, says: says(s), next: next ? new Date(next).toISOString() : '', last: st.last || null, ownWaiting: Boolean(st.ownWaiting), checkLabels: Object.fromEntries(Object.entries(CHECKS).map(([k, v]) => [k, v.label])), smallBrain: this.brainName(sessionBrains(this.cfg).small) };
  }

  // The catalog's display name ("Gemma 4 E4B"), not the engine tag ("gemma4:e4b").
  brainName(id) {
    if (!id) return '';
    const m = (this.brain.shop?.catalog?.models || []).find((x) => x.id === id || (x.ollama && (x.ollama === id || x.ollama === `${id}:latest` || `${x.ollama}:latest` === id)));
    return m?.name || id;
  }

  // Bob is free: nothing being answered, nothing working or waiting its turn, no OK card open.
  idle() {
    const b = this.brain;
    return !b.turns?.size && !(b.queue || []).some((j) => j.state === 'working' || j.state === 'waiting') && !b.approvals?.size;
  }
  canThink() { return !gaming(this.cfg) && this.idle(); }

  // Downloads are watched every minute (cheap), so "stopped moving" can be told at check-in time.
  watchDownloads() {
    const t = this.now(), live = new Set();
    for (const d of this.brain.shop?.downloadsView?.() || []) {
      if (d.state !== 'downloading') continue;
      live.add(d.id);
      const was = this.seen.get(d.id);
      if (!was || was.done !== d.done) this.seen.set(d.id, { done: d.done, at: t });
    }
    for (const id of [...this.seen.keys()]) if (!live.has(id)) this.seen.delete(id);
  }

  // The built-in checks. Each finding: { key, title, detail }. The key says "the same issue" for not repeating.
  builtIn(since) {
    const s = this.settings, out = [], t = this.now(), b = this.brain;
    if (s.checks.downloads) {
      for (const d of b.shop?.downloadsView?.() || []) {
        if (d.state === 'failed') out.push({ key: `dl-failed:${d.id}`, title: `Download failed: ${short(d.name || d.id, 60)}`, detail: `${sentence(short(d.error || 'It stopped with an error.', 160))} Downloads has Try again.` });
        else if (d.state === 'downloading') {
          const w = this.seen.get(d.id);
          if (w && t - w.at >= STALL_MS) out.push({ key: `dl-stuck:${d.id}`, title: `Download stopped moving: ${short(d.name || d.id, 60)}`, detail: `No progress for ${Math.round((t - w.at) / 60e3)} minutes. Pausing and resuming it in Downloads often gets it going again.` });
        }
      }
    }
    if (s.checks.tasks) {
      const n = b.approvals?.size || 0;
      if (n) out.push({ key: 'ok-waiting', title: `${n} OK card${n === 1 ? '' : 's'} waiting for you`, detail: 'A job is paused until you answer it in the chat.' });
      for (const j of b.queue || []) {
        const at = j.doneAt || j.at || 0;
        if (at < since) continue;
        if (j.state === 'failed') out.push({ key: `task-failed:${j.id}`, title: `Task didn't finish: ${short(j.text, 60)}`, detail: `${sentence(short(j.error || 'It stopped with an error.', 160))} Tasks has Try again.` });
        else if (j.state === 'interrupted') out.push({ key: `task-cut:${j.id}`, title: `Task was cut short: ${short(j.text, 60)}`, detail: 'It stopped when Bob closed. Tasks has Try again.' });
      }
    }
    if (s.checks.schedules) {
      for (const e of b.schedules?.list?.() || []) {
        const r = e.lastResult;
        if (r && r.ok === false && Date.parse(r.at || '') >= since) out.push({ key: `sched:${e.id}:${r.at}`, title: `Scheduled job didn't run: ${short(e.name, 60)}`, detail: sentence(short(r.note || '', 160)) });
      }
    }
    if (s.checks.disk) {
      try {
        const st = this.statfs(this.cfg.agentDir || this.cfg.dataDir);
        const free = st.bavail * st.bsize;
        if (free < LOW_DISK_GB * 1e9) out.push({ key: 'disk-low', title: `Only ${gb(free)} GB free on my drive`, detail: 'Downloads and new pictures need room. Tidy up, or delete a model in Get models, On this replicant matrix.' });
      } catch { /* can't read the drive: say nothing rather than guess */ }
    }
    return out;
  }

  // What Bob can see, for the small brain to answer your own lines from. Nothing from outside this PC.
  facts(since, found) {
    const b = this.brain, tm = (x) => new Date(x).toLocaleString();
    const tasks = (b.queue || []).filter((j) => (j.doneAt || j.at || 0) >= since - 864e5).slice(-30).map((j) => `- ${j.state}: ${short(j.text, 100)}${j.error ? ` (${short(j.error, 80)})` : ''} [${tm(j.doneAt || j.at || 0)}]`);
    const dls = (b.shop?.downloadsView?.() || []).slice(-15).map((d) => `- ${d.state}: ${short(d.name || d.id, 60)}${d.total ? ` (${Math.round((d.done / d.total) * 100)}%)` : ''}${d.error ? ` (${short(d.error, 80)})` : ''}`);
    const sch = (b.schedules?.list?.() || []).slice(0, 20).map((e) => `- "${short(e.name, 50)}" (${e.says}), ${e.enabled ? 'on' : 'off'}${e.lastResult ? `, last run ${e.lastResult.ok ? 'started' : 'did not run'} ${tm(e.lastResult.at)}` : ', not run yet'}`);
    let log = [];
    try {
      const lines = fs.readFileSync(this.cfg.logbook, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('- '));
      log = lines.slice(-LOG_LINES).map((l) => short(l, 200));
    } catch {}
    return [`Now: ${tm(this.now())}. Last check-in: ${since ? tm(since) : 'never'}.`,
      `Found by the built-in checks:\n${found.length ? found.map((f) => `- ${f.title}`).join('\n') : '- nothing'}`,
      `Tasks (newest last):\n${tasks.join('\n') || '- none'}`,
      `Downloads:\n${dls.join('\n') || '- none'}`,
      `Schedules:\n${sch.join('\n') || '- none'}`,
      `Logbook, newest last (date, time | kind | what happened):\n${log.join('\n') || '- empty'}`].join('\n\n').slice(-9000);
  }

  // Your own lines, answered by the small brain on the processor. Returns { results, model } or { skipped }.
  async own(since, found) {
    const s = this.settings;
    if (!s.own.length) return { results: [] };
    const model = sessionBrains(this.cfg).small;
    if (!model) return { skipped: 'No small brain is picked (Settings, Brains), so I couldn\'t read your own checks.' };
    const eng = this.brain.engine;
    const opts = { cpu: true, ...(this.cfg.engine === 'ollama' ? {} : { beside: true }) };
    const was = await eng.isLoaded?.(model, opts).catch(() => false);
    const user = this.cfg.userName || 'the user';
    const prompt = `${user} asked Bob to keep an eye on the checks below. Using ONLY the facts that follow (Bob's tasks, downloads, schedules and logbook), say for each check whether it needs ${user}'s attention now.
"needs": true when the facts show a problem, something stuck or failed, or something that should have happened and didn't. false when the facts show it's fine. "unsure" when the facts don't say.
Answer as JSON only: {"checks":[{"n":1,"needs":true,"why":"one short sentence"}]}

CHECKS:
${s.own.map((l, i) => `${i + 1}. ${l}`).join('\n')}

FACTS:
${this.facts(since, found)}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120e3);
    timer.unref?.();
    try {
      const reply = await eng.chat({ model, ...opts, think: false, signal: ac.signal, messages: [{ role: 'system', content: 'You are a careful checker. Answer with JSON only, no other text.' }, { role: 'user', content: prompt }] });
      const j = parseJson(reply?.content);
      const list = Array.isArray(j?.checks) ? j.checks : [];
      return {
        model,
        results: s.own.map((line, i) => {
          const r = list.find((x) => Number(x?.n) === i + 1) || list[i] || {};
          const needs = r.needs === true || r.needs === 'true' ? true : r.needs === false || r.needs === 'false' ? false : 'unsure';
          return { line, needs, why: short(r.why || (needs === 'unsure' ? 'I couldn\'t tell from what I can see.' : ''), 200) };
        })
      };
    } catch (e) {
      return { skipped: `I couldn't read your own checks this time (${short(e.message, 100)}).` };
    } finally {
      clearTimeout(timer);
      // Lightweight rule: a brain loaded just for this goes again straight away (unless "Free memory when Bob is idle" is off).
      if (!was && brainMode(this.cfg) !== 'always') await eng.unload?.(model, opts).catch(() => {});
    }
  }

  // One check-in. force: "Check in now" (always reports back; still never thinks in Gaming).
  async run({ force = false, ownOnly = false } = {}) {
    if (this.working) return { busy: true };
    this.working = true;
    try {
      const st = this.state(), t = this.now();
      const since = Date.parse(st.last?.at || '') || (t - 864e5);
      const found = ownOnly ? (st.last?.found || []) : this.builtIn(since);
      const last = { at: new Date(t).toISOString(), found, own: [], ownNote: '' };
      let ownWaiting = null;
      if (this.settings.own.length) {
        if (this.canThink() || (force && !gaming(this.cfg))) {
          const r = await this.own(since, found);
          if (r.skipped) last.ownNote = r.skipped; else last.own = r.results;
        } else {
          ownWaiting = st.ownWaiting || new Date(t).toISOString();
          last.ownNote = gaming(this.cfg) ? 'Your own checks wait until the Gaming session ends.' : 'Your own checks wait until I\'m not busy.';
        }
      }
      const needs = [...found, ...last.own.filter((o) => o.needs === true).map((o) => ({ key: `own:${o.line}`, title: o.line, detail: o.why }))];
      last.needs = needs;
      // Tell only about what's new, or the same again after most of a day.
      const told = st.told || { keys: [], at: '' };
      const fresh = needs.filter((n) => !told.keys.includes(n.key));
      const again = needs.length && t - (Date.parse(told.at || '') || 0) >= RENOTIFY_MS;
      const tell = needs.length > 0 && (force || fresh.length > 0 || again);
      const next = { ...st, last, ownWaiting, ...(ownOnly ? {} : { lastRun: last.at }), told: tell ? { keys: needs.map((n) => n.key), at: last.at } : { keys: told.keys.filter((k) => needs.some((n) => n.key === k)), at: told.at } };
      this.saveState(next);
      this.log(needs.length ? `${needs.length} thing${needs.length === 1 ? '' : 's'} need${needs.length === 1 ? 's' : ''} you: ${needs.map((n) => n.title).join('; ')}` : `all fine${last.ownNote ? ` (${last.ownNote})` : ''}`);
      if (tell) this.brain.broadcast?.({ type: 'checkin', items: needs.map(({ title, detail }) => ({ title, detail })), at: last.at, local: new Date(t).toLocaleString() });
      return { ...last, told: tell };
    } finally { this.working = false; }
  }

  // Once a minute: watch downloads, and run a check-in when it's due (or your own lines once Bob's free).
  async tick() {
    if (!this.settings.enabled) { this.seen.clear(); return null; }
    this.watchDownloads();
    if (this.working) return null;
    const st = this.state(), due = this.nextDue(st);
    if (due != null && due <= this.now()) return this.run();
    if (st.ownWaiting) {
      if (this.now() - (Date.parse(st.ownWaiting) || 0) > OWN_WAIT_MS) { this.saveState({ ...st, ownWaiting: null, last: { ...st.last, ownNote: 'Your own checks were skipped this time: I was busy or in the Gaming session for hours.' } }); return null; }
      if (this.canThink()) return this.run({ ownOnly: true });
    }
    return null;
  }
}

export function checkinsFor(brain) {
  if (!brain.checkins) brain.checkins = new CheckIns(brain);
  return brain.checkins;
}

export function startCheckins(brain, { everyMs = 60000 } = {}) {
  const c = checkinsFor(brain);
  const tick = () => c.tick().catch((e) => c.log(`stopped: ${e.message}`));
  const timer = setInterval(tick, everyMs);
  timer.unref?.();
  setTimeout(tick, 5000).unref?.();
  return { stop() { clearInterval(timer); }, tick };
}

// GET /api/checkins -> the settings, next time and last result. POST { enabled, how, at, hours, checks, own } | { runNow }.
// Changes only from the PC itself (your other devices can look).
export async function checkinsRoute({ req, p, isLocal, brain, body, send, res }) {
  if (p !== '/api/checkins') return false;
  const c = checkinsFor(brain);
  if (req.method === 'GET') { send(res, 200, c.view()); return true; }
  if (!isLocal) { send(res, 403, { error: 'Check-ins can only be changed on this replicant matrix itself.' }); return true; }
  const b = await body(req);
  try {
    if (b.runNow) { const r = await c.run({ force: true }); send(res, 200, { ...c.view(), ran: r }); return true; }
    const patch = {};
    for (const k of ['enabled', 'how', 'at', 'hours', 'own', 'checks']) if (k in b) patch[k] = b[k];
    send(res, 200, c.change(patch));
  } catch (e) { send(res, 409, { error: e.message }); }
  return true;
}
