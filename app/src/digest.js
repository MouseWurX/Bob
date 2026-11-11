// "A Sunday digest" (Settings, How Bob works; Nov 11 list, item 93; off unless the user turns it on).
//
// Once a week, on Sunday from 9 in the morning (or the next time Bob is open, up to Tuesday), Bob writes one short
// note: the chats of the week, the reminders that went off, and what he noticed (his own notes and the new things he
// remembered). It's plain code reading Bob's own files: no brain is loaded, nothing goes online, and it never runs
// a tool. The note is shown in the chat (and on the phone app, from the Bob it came from) and saved as a Markdown file
// in inn\digests, one per week. Settings has "Make this week's digest now".
import fs from 'node:fs';
import path from 'node:path';
import { readText } from './vault.js';
import { chatIds, chatInfo } from './chats.js';
import { loadNotes, NOTICED } from './notes.js';

export const digestOn = (cfg) => cfg?.weeklyDigest === true;
export const digestDir = (cfg) => path.join(cfg.innDir, 'digests');
const DAY = 86400e3;
export const LIMITS = { chats: 12, reminders: 12, notes: 10, memories: 10 };

// The user's local date and time parts for a moment (their time zone from config, else this computer's).
export function localParts(cfg, ms) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: cfg?.timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), dow };
}
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// Which Sunday's digest is due right now, or '' if none: from Sunday 9 am until the end of Tuesday, once per week.
export function dueSunday(cfg, now, last = '') {
  const { date, hour, dow } = localParts(cfg, now);
  if (dow < 0 || dow > 2 || (dow === 0 && hour < 9)) return '';
  const sunday = addDays(date, -dow);
  return sunday === last ? '' : sunday;
}

// What went into the week: from the Monday before that Sunday to the Sunday itself (dates are the user's local days).
// chats: [{ title, lastTouched }]; tidied: [{ title, to }]; log: the logbook's lines; notes: [{ text }]; memory: the
// memory file. Returns { title, lines, text } with text as Markdown.
export function makeDigest({ sunday, chats = [], tidied = [], log = [], notes = [], memory = '', dayOf = (ms) => new Date(ms).toISOString().slice(0, 10) }) {
  const from = addDays(sunday, -6);
  const inWeek = (d) => Boolean(d) && d >= from && d <= sunday;
  const seen = new Set();
  const chatRows = [...chats.map((c) => ({ t: c.title, d: dayOf(c.lastTouched || 0) })), ...tidied.map((c) => ({ t: c.title, d: dayOf(c.to || 0) }))]
    .filter((c) => c.t && c.t !== '(empty chat)' && inWeek(c.d) && !seen.has(c.t) && seen.add(c.t))
    .sort((a, b) => (a.d < b.d ? 1 : -1));
  const reminders = log.map((l) => String(l).match(/^- (\d{4}-\d{2}-\d{2})[^|]*\| reminder \| (.+)$/)).filter((m) => m && inWeek(m[1])).map((m) => m[2].trim());
  const noticed = notes.map((n) => String(n.text || '')).filter((t) => t.includes(NOTICED) && inWeek(t.slice(0, 10)))
    .map((t) => t.replace(/^\d{4}-\d\d-\d\d \d\d:\d\d · /, '').replace(NOTICED, '').trim());
  const learned = String(memory).split('\n').map((l) => l.match(/^\s*-\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\)/)).filter((m) => m && inWeek(m[2])).map((m) => m[1].trim());
  const list = (rows, max) => rows.slice(0, max).map((r) => `- ${r}`).concat(rows.length > max ? [`- and ${rows.length - max} more`] : []);
  const title = `Week of ${from} to ${sunday}`;
  const parts = [
    `# ${title}`,
    '',
    `## Chats (${chatRows.length})`,
    ...(chatRows.length ? list(chatRows.map((c) => c.t), LIMITS.chats) : ['- None this week.']),
    '',
    `## Reminders that went off (${reminders.length})`,
    ...(reminders.length ? list(reminders, LIMITS.reminders) : ['- None.']),
    '',
    `## Things I noticed (${noticed.length + learned.length})`,
    ...(noticed.length || learned.length ? [...list(noticed, LIMITS.notes), ...list(learned.map((m) => `Remembered: ${m}`), LIMITS.memories)] : ['- Nothing new.'])
  ];
  return { title, sunday, counts: { chats: chatRows.length, reminders: reminders.length, noticed: noticed.length + learned.length }, text: parts.join('\n') + '\n' };
}

export class Digest {
  constructor(cfg, { hk = null, broadcast = () => {}, now = () => Date.now() } = {}) {
    this.cfg = cfg; this.hk = hk; this.broadcast = broadcast; this.now = now;
    this.stateFile = path.join(cfg.dataDir, 'digest.json');
  }
  state() { try { return JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) || {}; } catch { return {}; } }
  // Gather the week from Bob's own files and write the note. sunday: the week's Sunday (default: the latest one).
  build(sunday = '') {
    const cfg = this.cfg;
    const { date, dow } = localParts(cfg, this.now());
    const sun = sunday || addDays(date, -dow);
    const chats = [];
    for (const id of chatIds(cfg).slice(0, 400)) { try { chats.push(chatInfo(cfg, id)); } catch {} }
    let log = [];
    try { log = fs.readFileSync(cfg.logbook, 'utf8').replace(/\r\n/g, '\n').split('\n').slice(-5000); } catch {}
    let memory = '';
    try { memory = readText(cfg.memoryFile); } catch {}
    const d = makeDigest({ sunday: sun, chats, tidied: this.hk?.summaries?.() || [], log, notes: loadNotes(cfg), memory, dayOf: (ms) => localParts(cfg, ms).date });
    const file = path.join(digestDir(cfg), `digest-${sun}.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, d.text);
    return { ...d, file };
  }
  // Called every few minutes (housekeeping): makes and shows the digest when one is due. Returns it, or null.
  check() {
    if (!digestOn(this.cfg)) return null;
    const st = this.state();
    const sunday = dueSunday(this.cfg, this.now(), st.last || '');
    if (!sunday) return null;
    const d = this.build(sunday);
    try { fs.mkdirSync(path.dirname(this.stateFile), { recursive: true }); fs.writeFileSync(this.stateFile, JSON.stringify({ last: sunday, at: this.now() })); } catch {}
    this.show(d);
    return d;
  }
  show(d) { this.broadcast({ type: 'digest', title: d.title, text: d.text, file: d.file, counts: d.counts }); }
}
