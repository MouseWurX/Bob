// Card health (14 Nov 2026, the owner: "if its always the same card type freezing up change to a different card type").
// Every rent's start-up is logged in out/forge/startup-log.jsonl: { at, gpu, dc, ok, why }. A card type that froze at
// start-up (the pod never answered) twice in the last 7 days, with no good start since, goes to the back of the list,
// and a type that froze in this run isn't asked for again in this run. The caps and the owner's typed yes don't
// change: a retry is the same rental, under the same caps, counted from the first rent.
import fs from 'node:fs';
import path from 'node:path';

export const STARTUP_LOG = 'startup-log.jsonl';
export const FREEZES_TO_AVOID = 2, AVOID_DAYS = 7;

export function readStartups(file) {
  let text = ''; try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  return text.replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.gpu);
}
export function recordStartup(file, { gpu, dc = null, ok, why = '', at = Date.now() }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ at: new Date(at).toISOString(), gpu: String(gpu || 'unknown'), dc: dc || null, ok: Boolean(ok), why: String(why).slice(0, 200) }) + '\n');
}
// Card types to avoid: FREEZES_TO_AVOID freezes in AVOID_DAYS, counted only after that type's last good start.
export function freezingCards(rows, { now = Date.now(), days = AVOID_DAYS, min = FREEZES_TO_AVOID } = {}) {
  const since = now - days * 864e5, by = new Map();
  for (const r of rows) {
    const t = Date.parse(r.at); if (!(t >= since)) continue;
    const s = by.get(r.gpu) || { freezes: 0 };
    if (r.ok) s.freezes = 0; else s.freezes++;
    by.set(r.gpu, s);
  }
  return new Set([...by].filter(([, s]) => s.freezes >= min).map(([g]) => g));
}
// The order to ask for cards in: types frozen in this run are left out; types that keep freezing go last. If every
// wanted type froze in this run, the list is empty and the rent stops (nothing more is rented).
export function orderCards(cards, { avoidNow = new Set(), freezing = new Set() } = {}) {
  const left = cards.filter((c) => !avoidNow.has(c));
  return [...left.filter((c) => !freezing.has(c)), ...left.filter((c) => freezing.has(c))];
}
// The start-up record in words, per card type and data centre, for the log and the Lab.
export function startupSummary(rows) {
  const by = new Map();
  for (const r of rows) { const k = `${r.gpu} @ ${r.dc || 'anywhere'}`; const s = by.get(k) || { ok: 0, froze: 0 }; if (r.ok) s.ok++; else s.froze++; by.set(k, s); }
  return [...by].sort((a, b) => b[1].froze - a[1].froze).map(([k, s]) => `${k}: ${s.ok} started, ${s.froze} froze`);
}
