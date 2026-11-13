// The doors for 🗓 Everyday helpers (everyday.js, receipts.js, profiles.js). Only from this replicant matrix: a phone
// or another Bob never reads the spending sheet or the list of people.
//   GET  /api/everyday/today                 the today card (only with "Today card" on)
//   GET  /api/everyday/focus                 the focus timer now
//   POST /api/everyday/focus {minutes}|{stop} start or stop it (only with "Focus timer" on)
//   GET  /api/everyday/spending              the spending sheet and its totals
//   POST /api/everyday/spending {remove}     take a line off
//   GET  /api/everyday/spending.csv          a plain copy, saved by your click
//   GET  /api/everyday/profiles              the people
//   POST /api/everyday/profiles {add, passcode} | {remove}
//   POST /api/everyday/seen {dot}            the window wasn't looked at when something came in (dot: true), or now is (false)
import { todayCard } from './everyday.js';
import { receiptsOn, loadSheet, removeRow, totals, toCsv } from './receipts.js';
import { schedulesFor } from './hands-schedules.js';
import { checkinsFor } from './checkins.js';

// The tray dot (item 150): the window says when something came in while nobody was looking at it (public/app.js ping).
export function trayDot(cfg, on) {
  try { globalThis.bobWindow?.apply({ dot: cfg.trayDot === true && on === true }); } catch {}
}

export async function everydayRoute({ req, res, p, isLocal, cfg, brain, focus, profiles, body, send, fetchImpl = globalThis.fetch }) {
  if (!p.startsWith('/api/everyday/')) return false;
  if (!isLocal) { send(res, 403, { error: 'Everyday helpers only open on this replicant matrix itself.' }); return true; }
  const get = req.method === 'GET', post = req.method === 'POST';
  try {
    if (get && p === '/api/everyday/today') {
      if (cfg.todayCard !== true) { send(res, 200, { off: true }); return true; }
      const card = await todayCard(cfg, {
        schedules: () => { try { return schedulesFor(brain).list(); } catch { return []; } },
        checkin: () => { try { return checkinsFor(brain).view().last; } catch { return null; } },
        fetchImpl
      });
      send(res, 200, card); return true;
    }
    if (p === '/api/everyday/focus') {
      if (get) { send(res, 200, focus.view()); return true; }
      if (post) {
        const b = await body(req);
        if (b.stop === true) { focus.finish(false); brain.log('settings', 'focus timer: stopped early (your click)'); send(res, 200, focus.view()); return true; }
        if (cfg.focusTimer !== true) { send(res, 400, { error: 'The focus timer is off. It\'s in Settings, 🗓 Everyday helpers.' }); return true; }
        const r = focus.start(b.minutes);
        if (r.error) { send(res, 400, r); return true; }
        brain.log('settings', `focus timer: ${r.minutes} minutes (your click)`);
        send(res, 200, r); return true;
      }
    }
    if (get && p === '/api/everyday/spending') {
      const rows = loadSheet(cfg);
      send(res, 200, { on: receiptsOn(cfg), rows: rows.slice(0, 500), count: rows.length, ...totals(rows) }); return true;
    }
    if (post && p === '/api/everyday/spending') {
      const b = await body(req);
      const r = removeRow(cfg, String(b.remove || ''));
      if (r.error) { send(res, 400, r); return true; }
      brain.log('settings', 'spending sheet: a line taken off (your click)');
      send(res, 200, r); return true;
    }
    if (get && p === '/api/everyday/spending.csv') {
      const csv = toCsv(loadSheet(cfg));
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="spending.csv"', 'cache-control': 'no-store' });
      res.end('﻿' + csv); return true;
    }
    if (p === '/api/everyday/profiles') {
      if (get) { send(res, 200, profiles.view()); return true; }
      if (post) {
        const b = await body(req);
        const r = typeof b.add === 'string' ? profiles.add(b.add, b.passcode) : typeof b.remove === 'string' ? profiles.remove(b.remove) : { error: 'Nothing to do.' };
        if (r.error) { send(res, 400, r); return true; }
        send(res, 200, r.view); return true;
      }
    }
    if (post && p === '/api/everyday/seen') { const b = await body(req); trayDot(cfg, b.dot === true); send(res, 200, { ok: true }); return true; }
  } catch (e) {
    send(res, e.code === 'VAULT_LOCKED' ? 401 : 500, { error: e.message }); return true;
  }
  return false;
}
