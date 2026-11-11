// "Quiet hours" (Settings, How Bob works, 🌙 Quiet hours and shortcut). Off unless turned on.
// Between the two times: no pop-up notifications, no sounds or reading aloud of reminders, and check-ins wait until
// the quiet hours end. Reminders still show in the chat. A reminder marked urgent ("urgent: true" when you say it's
// urgent) still pops up and speaks. Times are this replicant matrix's own clock (or Bob's time zone, if one is set).
import { cleanHarness } from './harness.js';

const minutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

// The minute of the day in Bob's time zone (config timeZone), or the computer's own.
export function minuteOfDay(now = new Date(), timeZone = undefined) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value), m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
  } catch {}
  return now.getHours() * 60 + now.getMinutes();
}

// True inside the quiet hours. From 22:00 to 07:00 runs over midnight; the same time twice means all day.
export function isQuiet(cfg = {}, now = new Date()) {
  const q = cleanHarness('quietHours', cfg.quietHours);
  if (!q.on) return false;
  const t = minuteOfDay(now, cfg.timeZone), a = minutes(q.from), b = minutes(q.to);
  if (a === b) return true;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

// What the chat page asks once a minute (GET /api/quiet).
export const quietView = (cfg, now = new Date()) => { const q = cleanHarness('quietHours', cfg.quietHours); return { on: q.on, from: q.from, to: q.to, quiet: isQuiet(cfg, now) }; };
