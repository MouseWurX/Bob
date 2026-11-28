// The graphics card's throttle reasons (Nov 26, the owner: every test run logs them beside temperature and clocks, and
// GUPPI adjusts for them to help the system). nvidia-smi gives a bit mask of why the driver is holding the clocks down.
// Used two ways:
//   - GUPPI calibrates this PC logs them with each try, and a hard one (the card's own thermal or power brake) stops
//     the try like 90 C does;
//   - while GUPPI drives, he reads them at most every 10 s before a reply. When the card is slowed for heat or by the
//     power brake, he steps back to the chat step and takes no bigger reading step (the biggest bursts of work on the
//     card); once they've stayed clear for a minute he carries on as before. The power cap under load and an idle card
//     are normal and change nothing. Same words: only the reading step changes, as with any of his switches.
// NVIDIA cards only (nvidia-smi); elsewhere nothing is read and nothing changes.
import { execFile } from 'node:child_process';
import { IN_TEST } from './recycle.js';

// nvidia-smi's clocks_event_reasons (clocks_throttle_reasons before driver 535) bits
export const THROTTLE_BITS = [
  [0x1, 'idle', 'idle'], [0x2, 'apps', 'application clocks'], [0x4, 'power-cap', 'power cap'], [0x8, 'hw-slowdown', 'hardware slowdown'],
  [0x10, 'sync-boost', 'sync boost'], [0x20, 'sw-thermal', 'driver thermal slowdown'], [0x40, 'hw-thermal', 'hardware thermal slowdown'],
  [0x80, 'power-brake', 'hardware power brake'], [0x100, 'display-clock', 'display clock']
];
export const HOT = ['sw-thermal', 'hw-thermal', 'hw-slowdown', 'power-brake']; // GUPPI backs off for these
export const HARD = ['hw-thermal', 'hw-slowdown', 'power-brake']; // these stop a calibration try at once
export const READ_EVERY_MS = 10e3;
export const CLEAR_MS = 60e3;

// "0x0000000000000024" (or a number) -> { mask, ids, names, hot, hard }, or null when nothing was read
export function parseThrottle(out) {
  const t = String(out ?? '').split(/\r?\n/).find((l) => l.trim())?.trim() || '';
  if (!t || /N\/A|not supported/i.test(t)) return null;
  const mask = /^0x/i.test(t) ? parseInt(t, 16) : Number(t);
  if (!Number.isFinite(mask)) return null;
  const on = THROTTLE_BITS.filter(([b]) => (mask & b) !== 0);
  const ids = on.map(([, id]) => id);
  return { mask, ids, names: on.map(([, , n]) => n), hot: ids.some((i) => HOT.includes(i)), hard: ids.some((i) => HARD.includes(i)) };
}
function smi(args) {
  if (IN_TEST) return Promise.resolve(null); // tests never reach the real nvidia-smi
  return new Promise((resolve) => { try { execFile('nvidia-smi', args, { timeout: 3000, windowsHide: true }, (err, out) => resolve(err ? null : String(out))); } catch { resolve(null); } });
}
// the newer field name first, the older one on drivers before 535
export async function readThrottle(run = smi) {
  for (const f of ['clocks_event_reasons.active', 'clocks_throttle_reasons.active']) {
    const r = parseThrottle(await run([`--query-gpu=${f}`, '--format=csv,noheader,nounits']));
    if (r) return r;
  }
  return null;
}

// GUPPI's live state: { hot, since, clearSince, why }. reading: parseThrottle's answer (null: unknown, no change).
// Hot as soon as a heat or brake reason shows; clear again only after CLEAR_MS with none.
export function heatStep(st, reading, now) {
  const s = st || { hot: false, since: 0, clearSince: 0, why: '' };
  if (!reading) return s;
  if (reading.hot) return { hot: true, since: s.hot ? s.since : now, clearSince: 0, why: reading.names.filter((_, i) => HOT.includes(reading.ids[i])).join(', ') };
  if (!s.hot) return s;
  const clearSince = s.clearSince || now;
  return now - clearSince >= CLEAR_MS ? { hot: false, since: 0, clearSince: 0, why: '' } : { ...s, clearSince };
}
