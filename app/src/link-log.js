// The link log (Brain Engine patch 0008). When Bobs pool their cards, the engine on both ends says what the link
// carried and where the time went: "[link] ..." lines every ten seconds the link is busy, and SCUT's own counters as
// "[scut] ...". Bob keeps every one of those lines in bob-net-link.log in his data folder (about 1 MB, then the older
// half moves to bob-net-link.log.1), and puts the short ones in the logbook under bob-net: which link each card is on
// (SCUT, or the usual one and why), and at most one summary a minute. Nothing here goes to the brain: it's a file and
// the logbook only. SCUT also says each time it retunes itself ("[scut] tuned: ..."), and those go to both as well.
// Older engines only say "[scut] SCUT on ..." or why it stayed off; those are kept the same way.
import fs from 'node:fs';
import path from 'node:path';

export const LINK_LOG = 'bob-net-link.log';
export const LINK_LOG_MAX = 1e6;
const SAY_MS = 60000;
const TAG = /\[(link|scut)\]\s*(.*)$/;
const pad = (n) => String(n).padStart(2, '0');
// Local time, the way the logbook writes it.
export const stamp = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

// One line of engine output: { kind: 'link' | 'scut', text } or null.
export function linkLine(line) {
  const m = String(line || '').replace(/\x1b\[[0-9;]*m/g, '').match(TAG);
  return m && m[2].trim() ? { kind: m[1], text: m[2].trim().slice(0, 1200) } : null;
}
// Which link, and why: said once in the logbook each time it's set up.
export const isSetup = (text) => /connected over|SCUT on\b|SCUT stays off|SCUT is off|staying on TCP|usual link|^tuned: |self-tuning is on/i.test(text);
// The ten-second summary's first line (not its "by command" or SCUT detail lines).
export const isSummary = (text) => /\d s( \(closing\))?: \d+ messages/.test(text);

// The last lines of the link log, newest last, for "Link log" in Settings. '' when there is none yet.
export function tailLinkLog(cfg, lines = 120) {
  if (!cfg?.dataDir) return '';
  const file = path.join(cfg.dataDir, LINK_LOG);
  let text = '';
  for (const f of [`${file}.1`, file]) { try { text += fs.readFileSync(f, 'utf8'); } catch {} }
  return text.replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean).slice(-Math.max(1, Math.min(500, Number(lines) || 120))).join('\n');
}

export class LinkLog {
  // who: 'borrowed card' (this Bob's engine, talking to a lent card) or 'lent card' (this Bob's card server).
  constructor(cfg, { who = 'borrowed card', log = () => {}, now = Date.now, max = LINK_LOG_MAX } = {}) {
    Object.assign(this, { who, log, now, max });
    this.file = cfg?.dataDir ? path.join(cfg.dataDir, LINK_LOG) : '';
    this.rest = ''; this.said = 0; this.setups = new Map(); this.lines = 0;
  }

  // A chunk of the engine's output, as it comes.
  feed(chunk) {
    const parts = (this.rest + String(chunk)).split(/\r?\n/);
    this.rest = parts.pop().slice(-4000);
    for (const p of parts) { const l = linkLine(p); if (l) this.take(l); }
  }

  take({ kind, text }) {
    const t = this.now();
    this.lines++;
    if (this.file) {
      try {
        try { if (fs.statSync(this.file).size > this.max) fs.renameSync(this.file, `${this.file}.1`); } catch {}
        fs.appendFileSync(this.file, `${stamp(t)} ${this.who} [${kind}] ${text}\n`);
      } catch {}
    }
    let say = false;
    if (isSetup(text)) { say = !(t - (this.setups.get(text) || -SAY_MS) < SAY_MS); if (say) this.setups.set(text, t); }
    else if (kind === 'link' && isSummary(text)) { say = this.said === 0 || t - this.said >= SAY_MS; if (say) this.said = t; }
    if (this.setups.size > 50) this.setups.clear();
    if (say) { try { this.log('bob-net', `${this.who} link: ${text.slice(0, 400)}`); } catch {} }
  }
}
