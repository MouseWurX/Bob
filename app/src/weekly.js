// "Weekly stats" (Settings, This replicant matrix, 🩺 Health and history). Off unless turned on.
// While it's on, Bob counts, per day: chats he answered in, jobs (replies) he did, words he wrote, and how long his
// brain spent working on them, per brain. Only numbers are kept (inn\bob\weekly.json, the last 8 weeks); never what
// was said, never which chat. The "What Bob did this week" page shows the last 7 days beside the 7 before.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const weeklyOn = (cfg) => cfg?.weeklyReport === true;
export const weeklyFile = (cfg) => path.join(cfg.dataDir, 'weekly.json');
export const KEEP_DAYS = 56;

const dayOf = (t, timeZone) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); } catch { return new Date(t).toISOString().slice(0, 10); } };
const words = (s) => (String(s || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
// A chat is counted once a day by a short one-way tag, so the file never says which chat it was.
const tag = (id, day) => crypto.createHash('sha1').update(`${day}:${id}`).digest('hex').slice(0, 8);

export class Weekly {
  constructor(cfg, { now = () => Date.now() } = {}) { this.cfg = cfg; this.now = now; this.live = new Map(); this.data = null; this.dirty = false; }
  load() { if (!this.data) { try { this.data = JSON.parse(fs.readFileSync(weeklyFile(this.cfg), 'utf8').replace(/^﻿/, '')); } catch {} if (!this.data?.days) this.data = { days: {} }; } return this.data; }
  save() {
    if (!this.dirty) return;
    const d = this.load();
    const keep = dayOf(this.now() - KEEP_DAYS * 864e5, this.cfg.timeZone);
    for (const k of Object.keys(d.days)) if (k < keep) delete d.days[k];
    try { fs.mkdirSync(path.dirname(weeklyFile(this.cfg)), { recursive: true }); const t = weeklyFile(this.cfg) + '.tmp'; fs.writeFileSync(t, JSON.stringify(d)); fs.renameSync(t, weeklyFile(this.cfg)); this.dirty = false; } catch {}
  }

  // Every event Bob sends to the chat page passes here (server.js broadcast). Cheap: a few counters.
  // brainNow: the brain that answered (the engine's current one), read when the reply is done.
  watch(ev, brainNow = () => '') {
    if (!weeklyOn(this.cfg) || !ev || !ev.turnId) return;
    if (ev.type === 'start') { this.live.set(ev.turnId, { at: this.now(), session: String(ev.sessionId || ''), words: 0 }); if (this.live.size > 50) this.live.delete(this.live.keys().next().value); return; }
    const t = this.live.get(ev.turnId);
    if (!t) return;
    if (ev.type === 'token') { t.words += words(ev.text); return; }
    if (ev.type !== 'done') return;
    this.live.delete(ev.turnId);
    const day = dayOf(this.now(), this.cfg.timeZone);
    const d = this.load();
    const row = (d.days[day] ||= { chats: [], jobs: 0, words: 0, secs: 0, brains: {} });
    const chat = tag(t.session, day);
    if (!row.chats.includes(chat)) row.chats.push(chat);
    const secs = Math.max(0, Math.round((this.now() - t.at) / 1000));
    row.jobs++; row.words += t.words; row.secs += secs;
    const brain = String(brainNow() || 'unknown').slice(0, 100);
    const b = (row.brains[brain] ||= { jobs: 0, words: 0, secs: 0 });
    b.jobs++; b.words += t.words; b.secs += secs;
    this.dirty = true;
    this.save();
  }

  // The page: this week (the last 7 days, today included) and the 7 days before, with per-brain rows.
  view(nameOf = (x) => x) {
    const d = this.load();
    const sum = (from, to) => {
      const out = { chats: 0, jobs: 0, words: 0, secs: 0, days: 0, brains: {} };
      for (let i = from; i < to; i++) {
        const r = d.days[dayOf(this.now() - i * 864e5, this.cfg.timeZone)];
        if (!r) continue;
        out.days++; out.chats += r.chats.length; out.jobs += r.jobs; out.words += r.words; out.secs += r.secs;
        for (const [m, b] of Object.entries(r.brains || {})) { const x = (out.brains[m] ||= { name: nameOf(m), jobs: 0, words: 0, secs: 0 }); x.jobs += b.jobs; x.words += b.words; x.secs += b.secs; }
      }
      out.brains = Object.values(out.brains).sort((a, b) => b.secs - a.secs);
      return out;
    };
    return { on: weeklyOn(this.cfg), week: sum(0, 7), before: sum(7, 14), since: Object.keys(d.days).sort()[0] || '' };
  }

  clear() { this.data = { days: {} }; this.live.clear(); try { fs.rmSync(weeklyFile(this.cfg), { force: true }); } catch {} }
}
