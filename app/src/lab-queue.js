// The Lab's job queue (Nov 11): line up challenges, a size ladder and fNRI scans to run one after another, overnight.
// Each entry is the same request the page's own Start button sends, kept in <lab>/queue.json, and it starts only when
// the Lab is free, Gaming is off and Bob isn't answering anyone. Bob's own brain is unloaded for each one, which the
// owner agreed to by queueing it. A job that can't start (the brain was deleted, the disk is full) is marked with why,
// and the queue moves on. Nothing runs that the owner didn't add.
import path from 'node:path';
import { readJson, writeJson } from './lab-jobs.js';
import { gaming } from './sessions.js';

export const QUEUE_KINDS = ['challenge', 'ladder', 'watch'];
export const QUEUE_MAX = 30;
export const TICK_MS = 20e3;
const clip = (s, n = 120) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);

export class LabQueue {
  // starters: { challenge(body), ladder(body), watch(body) } -> what the start call returns ({ started } or { needUnload }).
  // busy(): true while Bob is answering someone (the queue waits).
  // idle(): true once Bob has been quiet a while (entries added with idle: true wait for it, like the engine-update check).
  constructor(lab, { starters = {}, busy = () => false, idle = () => true, onTick = null } = {}) {
    this.lab = lab; this.starters = starters; this.busy = busy; this.idle = idle; this.onTick = onTick;
    this.file = path.join(lab.cfg.dataDir, 'lab', 'queue.json');
    const saved = readJson(this.file, {});
    this.items = Array.isArray(saved.items) ? saved.items : [];
    this.paused = saved.paused === true;
    for (const x of this.items) if (x.state === 'running') { x.state = 'done'; x.note = 'Bob closed while it ran; its report says how far it got.'; }
    this.timer = null;
  }
  save() { writeJson(this.file, { items: this.items.slice(-QUEUE_MAX * 2), paused: this.paused }); }
  view() { return { paused: this.paused, items: this.items.map(({ body, ...x }) => x) }; }

  add({ kind, body = {}, label = '', idle = false } = {}) {
    if (!QUEUE_KINDS.includes(kind)) throw new Error('That kind of job can\'t go in the queue.');
    if (this.items.filter((x) => x.state === 'waiting').length >= QUEUE_MAX) throw new Error(`The queue holds up to ${QUEUE_MAX} jobs. Let some run first.`);
    const clean = JSON.parse(JSON.stringify(body || {}));
    delete clean.unload;
    const id = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    this.items.push({ id, kind, label: clip(label) || kind, state: 'waiting', at: Date.now(), ...(idle ? { idle: true } : {}), body: clean });
    this.save();
    this.lab.broadcast({ type: 'lab-queue', queue: this.view() });
    return this.view();
  }
  remove(id) { this.items = this.items.filter((x) => x.id !== id || x.state === 'running'); this.save(); return this.view(); }
  clearDone() { this.items = this.items.filter((x) => x.state === 'waiting' || x.state === 'running'); this.save(); return this.view(); }
  move(id, by) {
    const i = this.items.findIndex((x) => x.id === id), j = i + (by < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= this.items.length || this.items[j].state !== 'waiting' || this.items[i].state !== 'waiting') return this.view();
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
    this.save(); return this.view();
  }
  pause(on) { this.paused = on === true; this.save(); this.lab.broadcast({ type: 'lab-queue', queue: this.view() }); return this.view(); }

  // One look: finish the running entry when its job ended, then start the next one when everything is quiet.
  async tick() {
    const run = this.items.find((x) => x.state === 'running');
    if (run) {
      if (this.lab.job && this.lab.job.run?.id === run.runId) return 'running';
      const r = this.lab.runs.find((x) => x.id === run.runId);
      run.state = r?.state === 'done' ? 'done' : 'failed';
      if (r && r.state !== 'done') run.note = clip(r.error || r.state, 200);
      this.save();
      this.lab.broadcast({ type: 'lab-queue', queue: this.view() });
    }
    if (this.paused || this.lab.job || gaming(this.lab.cfg) || this.busy()) return 'wait';
    const next = this.items.find((x) => x.state === 'waiting');
    if (!next) return 'empty';
    if (next.idle && !this.idle()) return 'wait';
    next.state = 'running'; next.started = Date.now(); this.save();
    try {
      const out = await this.starters[next.kind]({ ...next.body, unload: true });
      if (!out?.started) throw new Error(out?.error || 'It didn\'t start.');
      next.runId = out.started.id;
    } catch (e) { next.state = 'failed'; next.note = clip(e.message, 200); }
    this.save();
    this.lab.broadcast({ type: 'lab-queue', queue: this.view() });
    return next.state;
  }
  start() { if (!this.timer) { this.timer = setInterval(() => { this.tick().then(() => this.onTick?.()).catch(() => {}); }, TICK_MS); this.timer.unref?.(); } }
  stop() { clearInterval(this.timer); this.timer = null; }
}
