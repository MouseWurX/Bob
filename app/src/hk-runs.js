// Nov 15 (the owner): "when he does housekeeping it would be a task that appears in his job queue". Each time the
// housekeeper asks a brain something while Bob is idle (summing up older chat, sorting Topics), that round shows in
// Tasks and Now running as one task: In progress while it thinks, then Completed, Stopped (you came back) or Failed.
// They are kept apart from Bob's real job list (brain.queue): nothing that picks, resumes or waits on jobs ever sees
// them, so a housekeeping round can never block a message, run twice, or keep the housekeeper from seeing Bob idle.
// Only rounds that asked a brain are listed, so the 5-minute idle check never fills the list with "nothing to do".
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const HK_KIND = 'housekeeping';
export const HK_TEXT = 'Housekeeping: summing up older chats and sorting Topics while you were away';
export const HK_STOPPED = 'Stopped: you came back, so I let go of the brain. I pick it up next time I\'m idle.';
const KEEP_MS = 7 * 864e5, KEEP_MAX = 30;

// The brain housekeeping asks: its own job's pick (Settings, Brains, 🧹 Housekeeping), else the main brain. With One
// brain on, the main brain does it like every other job.
export function hkModel(cfg) {
  const m = cfg?.models || {};
  return (cfg?.oneBrain === true ? '' : m.housekeeping) || m.bob || '';
}

export class HkRuns {
  constructor(file, { now = () => Date.now(), changed = () => {} } = {}) {
    this.file = file; this.now = now; this.changed = changed; this.list = this.load();
  }
  load() {
    let l = [];
    try { l = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '')); } catch {}
    if (!Array.isArray(l)) l = [];
    l = l.filter((r) => r && typeof r === 'object' && r.id && r.state);
    // Bob was closed partway through a round: it's over (the next idle round starts fresh), never picked up again.
    for (const r of l) if (r.state === 'working') Object.assign(r, { state: 'cancelled', error: 'Bob was closed partway through. I pick it up next time I\'m idle.', doneAt: r.startedAt || r.at });
    return l;
  }
  save() {
    const old = this.now() - KEEP_MS;
    this.list = this.list.filter((r) => r.state === 'working' || (r.doneAt || r.at) >= old).slice(-KEEP_MAX);
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.list)); } catch {}
    this.changed();
  }
  get current() { return this.list.find((r) => r.state === 'working') || null; }
  start(model) {
    if (this.current) return this.current;
    const at = this.now();
    const r = { id: `hk-${crypto.randomUUID()}`, kind: HK_KIND, sessionId: '', text: HK_TEXT, state: 'working', at, startedAt: at, model: String(model || '') };
    this.list.push(r);
    this.save();
    return r;
  }
  // did: { summaries, topics, error }, stopped: the user came back (or pressed Stop).
  finish(did = {}, { stopped = false } = {}) {
    const r = this.current;
    if (!r) return null;
    const bits = [did.summaries && `${did.summaries} chat${did.summaries === 1 ? '' : 's'} summed up`, did.topics && `Topics sorted in ${did.topics} chat${did.topics === 1 ? '' : 's'}`].filter(Boolean);
    r.doneAt = this.now();
    if (stopped) Object.assign(r, { state: 'cancelled', error: bits.length ? `${HK_STOPPED} Done before that: ${bits.join(', ')}.` : HK_STOPPED });
    else if (did.error && !bits.length) Object.assign(r, { state: 'failed', error: `The brain said no: ${String(did.error).slice(0, 160)}` });
    else Object.assign(r, { state: 'done', done: bits.join(', ') || 'Nothing needed changing' });
    this.save();
    return r;
  }
  // Remove (✕): a finished round leaves the list; a running one is stopped first (stop is the housekeeper's pause).
  remove(id, stop) {
    const r = this.list.find((x) => x.id === id);
    if (!r) return false;
    if (r.state === 'working') { stop?.(); this.finish({}, { stopped: true }); }
    this.list = this.list.filter((x) => x.id !== id);
    this.save();
    return true;
  }
  cancel(id, stop) {
    const r = this.list.find((x) => x.id === id && x.state === 'working');
    if (!r) return false;
    stop?.(); this.finish({}, { stopped: true });
    return true;
  }
  clearFinished() { this.list = this.list.filter((r) => r.state === 'working' || r.state === 'failed'); this.save(); }
  // The same shape as brain.queueView() rows, for Tasks, Now running and the status line.
  view() {
    return this.list.map((r) => ({ id: r.id, sessionId: '', kind: HK_KIND, text: r.done ? `Housekeeping: ${r.done}` : r.text, state: r.state, status: r.state === 'working' ? 'in progress' : r.state === 'done' ? 'completed' : r.state, at: r.at, startedAt: r.startedAt, doneAt: r.doneAt, error: r.error, pics: 0, delegatedTo: null, steps: [], effort: 'low', housekeeping: true, model: r.model || '' }));
  }
}
