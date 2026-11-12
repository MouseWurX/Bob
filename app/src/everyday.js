// Everyday helpers (items 143 to 150 of "100 more ways to make Bob better"). Every switch here is off unless you
// turn it on, and nothing here leaves this replicant matrix except the weather, which only asks open-meteo.com about
// the place you typed (and only while "Show the weather" has a place in it).
//
//   143 Text size            textSize      100 (%) unless moved: the chat, the message box and Settings get bigger or smaller
//   144 Easier-to-read font  readableFont  off: a plainer font with more space between letters, words and lines
//   145 Profiles             profilesOn    off: see profiles.js (each person's own chats and memory, locked)
//   146 Today card           todayCard     off: weather, reminders, schedules and the last check-in, once a day
//   147 Focus timer          focusTimer    off: the ⏱ Focus button; Bob holds his taps on the shoulder until it ends
//   148 Receipts             receipts      off: see receipts.js (snap a receipt, it goes on a locked spending sheet)
//   149 Tour after update    updateTour    off: three cards for a new version's new switches, each with Turn on
//   150 Tray dot             trayDot       off: a dot on the tray icon when a job is done or something needs you
//
// Pure parts (cleaning, the focus timer, the today card, the tour) take fakes for the clock and the network, so the
// tests never touch the real computer or the internet.
import fs from 'node:fs';
import path from 'node:path';

// The reminders file (tools.js keeps it); read here directly so config.js can import this file without a loop.
const loadReminders = (cfg) => { try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'reminders.json'), 'utf8')); } catch { return []; } };

export const TEXT_SIZE = { min: 80, max: 160, step: 10, start: 100 };
export const FOCUS_MINUTES = [15, 25, 45, 60];
export const MAX_FOCUS = 240;
export const PLACE_MAX = 60;

export const EVERYDAY_SWITCHES = ['readableFont', 'profilesOn', 'todayCard', 'focusTimer', 'receipts', 'updateTour', 'trayDot'];

export function cleanTextSize(v) {
  const n = Math.round(Number(v) / TEXT_SIZE.step) * TEXT_SIZE.step;
  return Number.isFinite(n) ? Math.min(TEXT_SIZE.max, Math.max(TEXT_SIZE.min, n)) : TEXT_SIZE.start;
}
// A town or city, as typed. Letters, numbers, spaces and a little punctuation; nothing else goes to the weather service.
export const cleanPlace = (v) => String(v ?? '').replace(/[^\p{L}\p{N} ,.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, PLACE_MAX);

// What /api/settings sends for these (the window applies text size and font straight away).
export function everydayView(cfg = {}) {
  return {
    textSize: cleanTextSize(cfg.textSize ?? TEXT_SIZE.start),
    readableFont: cfg.readableFont === true,
    profilesOn: cfg.profilesOn === true,
    todayCard: cfg.todayCard === true,
    todayPlace: cleanPlace(cfg.todayPlace),
    focusTimer: cfg.focusTimer === true,
    receipts: cfg.receipts === true,
    updateTour: cfg.updateTour === true,
    tourSeen: typeof cfg.tourSeen === 'string' ? cfg.tourSeen : '',
    trayDot: cfg.trayDot === true
  };
}

// POST /api/settings: the keys this file owns. `save` is config.js saveSettings. Fills `out` with what was saved.
export function everydaySettings(cfg, b = {}, save, out = {}) {
  const patch = {};
  for (const k of EVERYDAY_SWITCHES) if (typeof b[k] === 'boolean') patch[k] = b[k];
  if ('textSize' in b) patch.textSize = cleanTextSize(b.textSize);
  if ('todayPlace' in b) patch.todayPlace = cleanPlace(b.todayPlace);
  if (typeof b.tourSeen === 'string') patch.tourSeen = b.tourSeen.slice(0, 20);
  if (!Object.keys(patch).length) return out;
  save(cfg, patch);
  const v = everydayView(cfg);
  for (const k of Object.keys(patch)) out[k] = v[k];
  return out;
}

// ---------------------------------------------------------------- 147 the focus timer
// While it runs Bob keeps his taps on the shoulder to himself: check-ins, reminders, housekeeping and the Lab's
// "done" lines wait, and so do announcements. Replies to what you ask still come straight away. When it ends he says
// how long it was and what happened meanwhile, then hands over what waited, in order.
export const FOCUS_HOLDS = new Set(['checkin', 'reminder', 'tidy', 'announce', 'lab-done']);

export class Focus {
  constructor({ now = () => Date.now(), send = () => {} } = {}) { this.now = now; this.send = send; this.run = null; }
  get on() { return Boolean(this.run); }
  view() {
    if (!this.run) return { on: false };
    return { on: true, minutes: this.run.minutes, until: new Date(this.run.until).toISOString(), leftSeconds: Math.max(0, Math.round((this.run.until - this.now()) / 1000)), held: this.run.held.length };
  }
  start(minutes) {
    const m = Math.round(Number(minutes));
    if (!Number.isFinite(m) || m < 1 || m > MAX_FOCUS) return { error: `Pick 1 to ${MAX_FOCUS} minutes.` };
    if (this.run) this.finish(false);
    const t = this.now();
    this.run = { minutes: m, started: t, until: t + m * 60000, held: [], jobs: 0 };
    return this.view();
  }
  // Returns true when the event should wait (it's kept, not lost). Counts finished replies too.
  hold(ev) {
    if (!this.run || !ev) return false;
    if (ev.type === 'done') { this.run.jobs++; return false; }
    if (!FOCUS_HOLDS.has(ev.type)) return false;
    if (this.run.held.length < 200) this.run.held.push(ev);
    return true;
  }
  // Called every few seconds: ends the timer when its time is up.
  tick() { if (this.run && this.now() >= this.run.until) return this.finish(true); return null; }
  finish(full = false) {
    const r = this.run; if (!r) return null;
    this.run = null;
    const mins = Math.max(0, Math.round((Math.min(this.now(), r.until) - r.started) / 60000));
    const summary = focusSummary({ minutes: mins, planned: r.minutes, full, jobs: r.jobs, held: r.held });
    this.send({ type: 'focus-done', text: summary, minutes: mins, full, held: r.held.length, jobs: r.jobs });
    for (const ev of r.held) this.send(ev);
    return summary;
  }
}

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export function focusSummary({ minutes = 0, planned = 0, full = true, jobs = 0, held = [] } = {}) {
  const kinds = { checkin: ['check-in'], reminder: ['reminder'], tidy: ['housekeeping note'], announce: ['message from me'], 'lab-done': ['Lab result'] };
  const counts = {};
  for (const ev of held) counts[ev.type] = (counts[ev.type] || 0) + 1;
  const waited = Object.entries(counts).map(([k, n]) => plural(n, kinds[k]?.[0] || 'note'));
  const first = full ? `⏱ Focus done: ${plural(minutes, 'minute')}. Nicely held.` : `⏱ Focus stopped after ${plural(minutes, 'minute')} of ${planned}.`;
  const did = jobs ? ` I finished ${plural(jobs, 'reply', 'replies')} meanwhile.` : '';
  const wait = waited.length ? ` While you worked, ${waited.join(', ')} waited; ${held.length === 1 ? 'it\'s' : 'they\'re'} just below.` : ' Nothing needed you while you worked.';
  return first + did + wait;
}

// ---------------------------------------------------------------- 146 the today card
// Weather (only with a place typed), reminders due today, schedules that run today, and what the last check-in found.
// fetchImpl is passed in so tests never go online. A weather failure only leaves the weather out.
export const WEATHER_WORDS = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'foggy', 48: 'foggy', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'showers', 81: 'showers', 82: 'heavy showers', 85: 'snow showers', 86: 'snow showers', 95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'thunderstorms with hail' };
const placeCache = new Map();

export async function weatherFor(place, { fetchImpl = globalThis.fetch, timeoutMs = 6000 } = {}) {
  const name = cleanPlace(place);
  if (!name || !fetchImpl) return null;
  const get = async (url) => { const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  let at = placeCache.get(name.toLowerCase());
  if (!at) {
    const g = await get(`https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&name=${encodeURIComponent(name)}`);
    const hit = g?.results?.[0];
    if (!hit) return { place: name, error: 'I couldn\'t find that place.' };
    at = { lat: Number(hit.latitude), lon: Number(hit.longitude), label: [hit.name, hit.admin1, hit.country_code].filter(Boolean).join(', ') };
    placeCache.set(name.toLowerCase(), at);
  }
  const f = await get(`https://api.open-meteo.com/v1/forecast?latitude=${at.lat.toFixed(3)}&longitude=${at.lon.toFixed(3)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`);
  const d = f?.daily || {};
  const n = (k) => (Array.isArray(d[k]) && Number.isFinite(Number(d[k][0])) ? Math.round(Number(d[k][0])) : null);
  return { place: at.label, sky: WEATHER_WORDS[n('weather_code')] || '', high: n('temperature_2m_max'), low: n('temperature_2m_min'), rain: n('precipitation_probability_max'), unit: f?.daily_units?.temperature_2m_max || '°C' };
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export async function todayCard(cfg, { now = () => Date.now(), reminders = () => loadReminders(cfg), schedules = () => [], checkin = () => null, fetchImpl = globalThis.fetch } = {}) {
  const t = new Date(now());
  const rem = (reminders() || []).filter((r) => r && Number.isFinite(Number(r.at)) && sameDay(new Date(Number(r.at)), t))
    .sort((a, b) => a.at - b.at).map((r) => ({ text: String(r.text || '').slice(0, 200), at: new Date(Number(r.at)).toISOString() }));
  const sch = (schedules() || []).filter((e) => e?.enabled && e.nextDue && sameDay(new Date(e.nextDue), t))
    .map((e) => ({ name: String(e.name || '').slice(0, 80), at: e.nextDue }));
  const last = checkin();
  const found = Array.isArray(last?.found) ? last.found.map((f) => String(f?.title || f || '').slice(0, 120)).filter(Boolean).slice(0, 5) : [];
  let weather = null;
  const place = cleanPlace(cfg.todayPlace);
  if (place) { try { weather = await weatherFor(place, { fetchImpl }); } catch (e) { weather = { place, error: `The weather service didn't answer (${String(e.message || e).slice(0, 60)}).` }; } }
  return { date: t.toISOString(), weather, reminders: rem, schedules: sch, checkin: last?.at ? { at: last.at, found } : null };
}

// ---------------------------------------------------------------- 149 the tour after an update
// For each version, the new switches worth showing (keys of public/wants.js WANTS, at most three). A version with
// none shows nothing. A version is shown once: tourSeen remembers the last one shown.
export const WHATS_NEW = {
  '1.5.207': ['todayCard', 'focusTimer', 'receipts']
};
const parts = (v) => String(v || '').split('.').map((x) => parseInt(x, 10) || 0);
export function newer(a, b) { const x = parts(a), y = parts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
// The keys to show for this version, or [] (switch off, this version or a newer one already seen, or nothing new).
export function tourFor(cfg = {}, version = '') {
  if (cfg.updateTour !== true) return [];
  const seen = typeof cfg.tourSeen === 'string' ? cfg.tourSeen : '';
  if (seen && !newer(version, seen)) return [];
  return (WHATS_NEW[version] || []).slice(0, 3);
}
