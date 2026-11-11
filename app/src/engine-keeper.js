// 1.5.184 Keep engines up to date (Settings > Engines, on unless switched off: the owner's call, Nov 10 2026).
// Bob checks his thinking engines when he starts and about once a day after that, and updates them by himself:
// Brain Engine whenever its release has a new file (a rebuilt Brain Engine keeps its name, so the checksum tells),
// and his own llama.cpp only when it's older than the build this Bob was tested with (never past it, never back
// from a newer build you picked). Only engines with a build Bob names are kept up to date this way; the others
// (pictures, hearing, voices, helpers) follow their projects' newest releases, so they stay on what you have until
// you press Check for updates. An update never happens while a brain is loaded on that engine, while Bob is
// working, or while the Lab or a download is busy: he waits and tries again. The download goes through the usual
// Downloads list, the old build is kept for Go back, and Bob says so in chat.
// Everything outside (GitHub, the loaded brains, the downloads, the chat) comes in as functions, so tests use fakes.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINES, engineFor, installedMarker, brainsEngineNow, sharedDir, TESTED_LLAMA, brainEnginePin, brainEngineStale } from './engines.js';

export const KEEPER_ENGINES = ['brainengine', 'llamacpp'];
export const FIRST_CHECK_MS = 2 * 60e3; // after start, so the window is open and the first brain has loaded
export const DAY_MS = 23 * 3600e3; // "about daily": a little under a day, so a PC on at the same time each day still checks
export const TICK_MS = 60 * 60e3; // look once an hour whether a check is due
export const WAIT_MS = 10 * 60e3; // while an update waits for the engine to be free
// 1.5.196: Brain Engine goes with Bob. Its first look is right after start, before the first brain loads on it.
export const WITH_BOB_MS = 5e3;

export const keeperOn = (cfg) => cfg?.engineUpdates?.auto !== false;
export const cleanEngineUpdates = (v) => ({ auto: v?.auto !== false });

// llama.cpp release names are b<number>; an older number is an older build. Anything else can't be compared.
export const buildNumber = (tag) => { const m = /^b(\d+)$/.exec(String(tag || '')); return m ? Number(m[1]) : NaN; };

// Which engines Bob may keep up to date on this replicant matrix: his own copy (in his folder, with his marker),
// one with a build for this replicant matrix, and one that can be swapped (so Go back works).
export function keeperCandidates(cfg) {
  return KEEPER_ENGINES.map((id) => engineFor(ENGINES.find((x) => x.id === id))).filter((e) => {
    if (!e || e.unavailable || sharedDir(e) || e.install || e.found?.(cfg)) return false;
    if (!cfg?.agentDir || !fs.existsSync(path.join(cfg.agentDir, e.dir, e.exe))) return false;
    return Boolean(installedMarker(cfg, e)?.version);
  });
}

// Is a newer build due for this engine? check(id) is latestEngine (GitHub, by checksum) for Brain Engine.
// llama.cpp only moves up to the tested build, with no GitHub question at all.
export async function dueUpdate(cfg, e, { check, tested = TESTED_LLAMA } = {}) {
  const mark = installedMarker(cfg, e);
  if (e.id === 'llamacpp') {
    const have = buildNumber(mark?.version), want = buildNumber(tested);
    return Number.isFinite(have) && Number.isFinite(want) && have < want ? { id: e.id, from: mark.version, to: tested, rebuilt: false } : null;
  }
  const r = await check(e.id);
  return r?.newer ? { id: e.id, from: r.installed || mark?.version || '', to: r.latest, rebuilt: Boolean(r.rebuilt) } : null;
}

export class EngineKeeper {
  // deps: check(id) -> latestEngine result; loaded() -> brains in memory now; busy() -> '' or why Bob is busy;
  // queue(id) -> puts 'engine:<id>' on the Downloads list; download(id) -> that entry ({ state, error }) or null;
  // say(text) -> a line in chat; now(); setTimer(fn, ms) / clearTimer(t).
  constructor(cfg, deps = {}) {
    this.cfg = cfg;
    this.d = { now: () => Date.now(), setTimer: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; }, clearTimer: (t) => clearTimeout(t), loaded: async () => [], busy: () => '', say: () => {}, ...deps };
    this.file = path.join(cfg.agentDir || '.', 'engine-updates.json');
    this.state = this.read();
    this.pending = new Map(); // id -> { from, to, rebuilt, queued, saidWait }
    this.timer = null;
    this.running = false;
  }
  read() { try { const s = JSON.parse(fs.readFileSync(this.file, 'utf8')); return { lastCheck: Number(s.lastCheck) || 0, lastError: String(s.lastError || '') }; } catch { return { lastCheck: 0, lastError: '' }; } }
  write() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2)); } catch {} }
  // The first look after start always asks ("checks on start"); after that, about once a day.
  start() { this.schedule(FIRST_CHECK_MS, true); this.d.setTimer(() => this.withBob().catch(() => {}), WITH_BOB_MS); return this; }

  // 1.5.196 (the owner, Nov 10: "it should update with Bob himself, not standalone"; FNRI on the PC found Bob on a new
  // version with the old engine). Brain Engine updates with Bob: when the build here (its own marker) isn't the one this
  // Bob names (package.json bob.brainEngine), the named build comes along at the next start, whatever the Keep engines
  // up to date switch says, the same way Bob's own files do. GitHub is asked once, only to make sure the file there
  // differs from the one here (so a release rebuilt ahead of this Bob isn't fetched again and again).
  // It no longer follows the newest Brain Engine on its own; the daily check is for llama.cpp.
  async withBob() {
    const pin = this.d.pin === undefined ? brainEnginePin() : this.d.pin;
    if (!pin || this.pending.has('brainengine')) return null;
    const e = keeperCandidates(this.cfg).find((x) => x.id === 'brainengine');
    const mark = e && installedMarker(this.cfg, e);
    if (!brainEngineStale(mark, pin)) return null;
    let r = null;
    try { r = await this.d.check('brainengine'); } catch (err) { this.state.lastError = `Brain Engine: ${err.message}`.slice(0, 300); this.write(); return null; }
    if (!r || (r.print && r.print === mark.print && r.latest === mark.version)) return null;
    this.pending.set('brainengine', { from: mark.version, to: r.latest || pin.tag, rebuilt: r.latest === mark.version, withBob: true, queued: false, saidWait: false });
    await this.tick({ bob: true });
    return this.pending.get('brainengine') || null;
  }
  stop() { if (this.timer) this.d.clearTimer(this.timer); this.timer = null; }
  schedule(ms, force = false) { this.stop(); this.timer = this.d.setTimer(() => { this.tick({ force }).catch(() => {}).finally(() => this.schedule(this.pending.size ? WAIT_MS : TICK_MS)); }, ms); }
  view() { return { auto: keeperOn(this.cfg), lastCheck: this.state.lastCheck ? new Date(this.state.lastCheck).toISOString() : '', lastError: this.state.lastError, waiting: [...this.pending.entries()].map(([id, p]) => ({ id, to: p.to, queued: Boolean(p.queued) })) }; }

  // Why an engine can't be swapped right now ('' = it can).
  async whyWait(id) {
    const busy = this.d.busy(id);
    if (busy) return busy;
    const runs = this.cfg.engine !== 'ollama' && brainsEngineNow(this.cfg) === id;
    if (runs) { let loaded = []; try { loaded = await this.d.loaded(); } catch {} if (loaded.length) return 'a brain is loaded on it'; }
    return '';
  }

  // One look: a check if one is due (or forced), then any update that's waiting and free to go.
  async tick({ force = false } = {}) {
    if (this.running) return this.view();
    this.running = true;
    try {
      this.follow();
      if (!keeperOn(this.cfg)) { for (const [id, p] of this.pending) if (!p.withBob) this.pending.delete(id); } // Brain Engine with Bob still goes
      else if (force || this.d.now() - this.state.lastCheck >= DAY_MS) await this.check();
      for (const [id, p] of this.pending) {
        if (p.queued) continue;
        const why = await this.whyWait(id);
        if (why) {
          if (!p.saidWait) { p.saidWait = true; this.d.say(`${nameOf(id)} has ${p.rebuilt ? 'a rebuilt build' : `a newer build (${p.to})`}. I'll update it once ${why === 'a brain is loaded on it' ? 'no brain is loaded on it' : `I'm free (${why})`}.`); }
          continue;
        }
        try { await this.d.queue(id); p.queued = true; this.d.say(`Updating ${nameOf(id)} to ${p.withBob ? 'the build that goes with this Bob' : p.rebuilt ? `a rebuilt ${p.to}` : p.to}. It downloads beside the one you have, and Go back in Settings, Engines puts the old one back.`); }
        catch (err) { this.pending.delete(id); this.d.say(`I couldn't start the ${nameOf(id)} update: ${err.message}`); }
      }
      return this.view();
    } finally { this.running = false; }
  }

  async check() {
    this.state.lastCheck = this.d.now(); this.state.lastError = '';
    const pin = this.d.pin === undefined ? brainEnginePin() : this.d.pin;
    for (const e of keeperCandidates(this.cfg)) {
      if (this.pending.has(e.id)) continue;
      if (e.id === 'brainengine' && pin) continue; // 1.5.196: Brain Engine goes with Bob (withBob), not on its own
      try { const due = await dueUpdate(this.cfg, e, { check: this.d.check, tested: this.d.tested ?? TESTED_LLAMA }); if (due) this.pending.set(e.id, { ...due, queued: false, saidWait: false }); }
      catch (err) { this.state.lastError = `${e.name}: ${err.message}`.slice(0, 300); }
    }
    this.write();
  }

  // Updates on the Downloads list: say how they went once they finish.
  follow() {
    for (const [id, p] of this.pending) {
      if (!p.queued) continue;
      const dl = this.d.download?.(id);
      if (!dl || ['queued', 'downloading'].includes(dl.state)) continue;
      this.pending.delete(id);
      if (dl.state === 'done') this.d.say(`${nameOf(id)} is up to date (${p.rebuilt ? `rebuilt ${p.to}` : p.to}). I use it the next time a brain loads. If it gives trouble, Go back in Settings, Engines puts the old one back.`);
      else if (dl.state === 'failed') this.d.say(`The ${nameOf(id)} update didn't work (${dl.error || 'no reason given'}), so I kept the one you have. I'll try again tomorrow.`);
    }
  }
}

const nameOf = (id) => ENGINES.find((x) => x.id === id)?.name || id;
