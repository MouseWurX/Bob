// Your Bobs on the phone (item 141, 2026-11-11). A short reading of how this Bob is doing, for the Android app's
// "Your Bobs" page and its home-screen widget: up or busy, the brain he has loaded, the graphics card's heat and
// memory, the jobs running or waiting, and the next reminder.
// Only with "Let my phone see how I'm doing" on (off unless you turn it on), and only through the signed-in door
// (Tailscale, your phone's key), or on this replicant matrix itself. Nothing is kept or sent anywhere else, and the
// card is read at most every 20 seconds (nvidia-smi, about 50 ms). No card reading in tests.
import { execFile } from 'node:child_process';
import { IN_TEST } from './recycle.js';

export const glanceOn = (cfg) => cfg?.phoneGlance === true;
export const GLANCE_OFF = 'This Bob isn\'t sharing how he\'s doing. On that replicant matrix: Settings, Bob-Net, Let my phone see how I\'m doing.';
export const CARD_EVERY_MS = 20e3;

const KIND = { chat: 'Chat', picture: 'Picture', pictures: 'Picture', video: 'Clip', clip: 'Clip', music: 'Song', song: 'Song', sfx: 'Sound', sound: 'Sound', code: 'Code', hands: 'Job on this replicant matrix', office: 'Document', research: 'Research' };

// The card, from nvidia-smi: { name, tempC, usedMB, totalMB, busyPct }, or null (no NVIDIA card, or not readable).
export function parseCard(out) {
  const line = String(out || '').split(/\r?\n/).find((l) => l.trim());
  if (!line) return null;
  const [name, temp, used, total, busy] = line.split(',').map((x) => x.trim());
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  if (!name || n(total) == null) return null;
  return { name: name.slice(0, 60), tempC: n(temp), usedMB: n(used), totalMB: n(total), busyPct: n(busy) };
}

function smi() {
  if (IN_TEST) return Promise.resolve(null); // tests never reach the real nvidia-smi
  return new Promise((resolve) => {
    try { execFile('nvidia-smi', ['--query-gpu=name,temperature.gpu,memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'], { timeout: 3000, windowsHide: true }, (err, out) => resolve(err ? null : String(out))); }
    catch { resolve(null); }
  });
}

// One card reading every 20 s at most, shared by every phone that asks.
export function cardReader({ run = smi, now = Date.now } = {}) {
  let last = null, at = 0, pending = null;
  return async () => {
    if (at && now() - at < CARD_EVERY_MS) return last;
    if (!pending) pending = run().then((o) => { last = parseCard(o); at = now(); return last; }).catch(() => null).finally(() => { pending = null; });
    return pending;
  };
}

// The reading itself. `brain` is the running Brain; `reminders` is the list in reminders.json.
export function glanceView(brain, { cfg = brain?.cfg || {}, card = null, loaded = [], reminders = [], version = '', name = '', gaming = false, now = Date.now } = {}) {
  const jobs = (brain?.queue || []).filter((j) => j && (j.state === 'working' || j.state === 'waiting'))
    .slice(0, 8)
    .map((j) => ({ what: `${KIND[j.kind] || 'Job'}${j.guest ? ` for ${String(j.guest.from || 'another Bob').slice(0, 30)}` : ''}${j.text ? `: ${String(j.text).replace(/\s+/g, ' ').slice(0, 60)}` : ''}`, state: j.state }));
  const next = [].concat(reminders || []).filter((r) => r && r.at > now()).sort((a, b) => a.at - b.at)[0];
  return {
    ok: true, name: String(name || '').slice(0, 40), version,
    busy: (brain?.turns?.size || 0) > 0 || jobs.some((j) => j.state === 'working'),
    gaming: gaming === true,
    brain: loaded.map((m) => (brain?.brainLabel ? brain.brainLabel(m?.name || m) : String(m?.name || m))).filter(Boolean).slice(0, 3).join(', '),
    card: card || null,
    jobs,
    nextReminder: next ? { text: String(next.text || '').slice(0, 200), local: String(next.local || ''), at: next.at } : null,
    at: now(),
    glanceOn: glanceOn(cfg)
  };
}
