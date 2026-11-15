// 1.5.211 The room gate: what other people ask Bob for in a group (Discord today; any bot that lets other people in
// uses the same gate) waits here for the owner's OK. Nothing runs until it's accepted, and it stays until it's accepted
// or declined, through restarts too. "Auto-accept" (off unless switched on) skips the wait.
//
// It's also the room's own chat: every request and every reply, kept in its own file (rooms/<room>.json in Bob's data
// folder), never in the chats folder. So the owner's chats, memory, notes, search and summaries never read it, and it
// never reads them. The owner reads it in Topics > Chats > the room's chat, where the Accept and Decline buttons are.
//
// It never pops anything up and never sends anything: while the owner is gaming it's a quiet count, nothing more.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_WAITING = 30; // requests waiting for an OK, in one room
export const MAX_PER_PERSON = 3; // of those, from one person
export const MAX_HEARD = 300; // 1.5.228 channel talk kept with Show the whole channel on (the rest of the chat is never pushed out by it)
export const MAX_LOG = 400; // lines the room's chat keeps (the oldest go first)
const MAX_TEXT = 4000;

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, n);

export class RoomGate {
  // room: 'discord'. dir: where the file lives (Bob's data folder + rooms). now: for tests.
  constructor({ room, dir, now = Date.now, log = () => {} }) {
    if (!/^[a-z]{2,20}$/.test(room)) throw new Error('bad room name');
    this.room = room;
    this.file = dir ? path.join(dir, 'rooms', `${room}.json`) : null; // no dir: kept in memory only (tests)
    this.now = now;
    this.log = log;
    this.data = this.read();
  }

  read() {
    if (!this.file) return { lines: [] };
    try {
      const d = JSON.parse(String(fs.readFileSync(this.file, 'utf8')).replace(/^﻿/, ''));
      return { lines: Array.isArray(d.lines) ? d.lines.filter((l) => l && typeof l.id === 'string') : [] };
    } catch { return { lines: [] }; }
  }

  save() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { this.log(`couldn't save the ${this.room} chat: ${e.message}`); }
  }

  trim() {
    // Waiting requests are never trimmed away: they stay until answered.
    while (this.data.lines.length > MAX_LOG) {
      const i = this.data.lines.findIndex((l) => l.state !== 'waiting');
      if (i < 0) break;
      this.data.lines.splice(i, 1);
    }
  }

  waiting() { return this.data.lines.filter((l) => l.kind === 'ask' && l.state === 'waiting'); }
  get(id) { return this.data.lines.find((l) => l.id === id) || null; }

  // A request from someone in the room. Returns the line, or { refused: why } when the room is too full.
  // auto: Auto-accept is on, so it's accepted straight away (still kept in the room's chat).
  ask({ who, name, where, whereName = '', text, type, ref = {} }, { auto = false } = {}) {
    const w = this.waiting();
    if (!auto && w.length >= MAX_WAITING) return { refused: 'full' };
    if (!auto && w.filter((l) => l.who === String(who)).length >= MAX_PER_PERSON) return { refused: 'person' };
    const line = {
      id: crypto.randomUUID(), kind: 'ask', at: this.now(), who: clean(who, 40), name: clean(name, 40) || 'someone',
      where: clean(where, 80), whereName: clean(whereName, 100), text: clean(text, MAX_TEXT), type: clean(type, 20), ref,
      state: auto ? 'accepted' : 'waiting', ...(auto ? { auto: true, answeredAt: this.now() } : {})
    };
    this.data.lines.push(line);
    this.trim();
    this.save();
    return line;
  }

  // The owner's Accept (ok true) or Decline (ok false). Only a waiting request can be answered, once.
  answer(id, ok) {
    const line = this.get(String(id || ''));
    if (!line || line.kind !== 'ask') return { error: 'not found' };
    if (line.state !== 'waiting') return { error: `already ${line.state}`, line };
    line.state = ok ? 'accepted' : 'declined';
    line.answeredAt = this.now();
    this.save();
    return { line };
  }

  // The job of an accepted request ran: its id, and later Bob's reply, go next to it.
  started(id, jobId) { const l = this.get(id); if (l) { l.jobId = jobId; l.state = 'working'; this.save(); } }
  reply(id, text, { failed = false, files = 0 } = {}) {
    const l = this.get(id);
    if (l) { l.state = failed ? 'failed' : 'done'; l.doneAt = this.now(); }
    this.data.lines.push({ id: crypto.randomUUID(), kind: 'bob', at: this.now(), to: id, text: clean(text, MAX_TEXT), files, ...(failed ? { failed: true } : {}) });
    this.trim();
    this.save();
  }

  // 1.5.228 Something you typed on a channel's page and Bob posted there for you. Kept on that channel's page.
  said({ where, whereName = '', text }) {
    const line = { id: crypto.randomUUID(), kind: 'me', at: this.now(), where: clean(where, 80), whereName: clean(whereName, 100), text: clean(text, MAX_TEXT) };
    this.data.lines.push(line);
    this.trim();
    this.save();
    return line;
  }

  // 1.5.228 "Show the whole channel" (off unless switched on): someone's message in a listed channel that didn't call
  // Bob, kept so the channel's page reads like the channel. At most MAX_HEARD of them; the oldest go first.
  heard({ who, name, where, whereName = '', text }) {
    const line = { id: crypto.randomUUID(), kind: 'heard', at: this.now(), who: clean(who, 40), name: clean(name, 40) || 'someone', where: clean(where, 80), whereName: clean(whereName, 100), text: clean(text, MAX_TEXT) };
    this.data.lines.push(line);
    const heard = this.data.lines.filter((l) => l.kind === 'heard');
    if (heard.length > MAX_HEARD) { const drop = new Set(heard.slice(0, heard.length - MAX_HEARD)); this.data.lines = this.data.lines.filter((l) => !drop.has(l)); }
    this.trim();
    this.save();
    return line;
  }
  // The switch went off: the channel talk goes, requests, replies and what you said stay.
  forgetHeard() { const n = this.data.lines.length; this.data.lines = this.data.lines.filter((l) => l.kind !== 'heard'); if (this.data.lines.length !== n) this.save(); }

  // For the room's chat page: lines oldest first, plus how many wait for an OK.
  view() { return { room: this.room, waiting: this.waiting().length, lines: this.data.lines.map(({ ref, ...l }) => l) }; }

  // Empty the room's chat (requests still waiting stay).
  clear() { this.data.lines = this.waiting(); this.save(); }
}
