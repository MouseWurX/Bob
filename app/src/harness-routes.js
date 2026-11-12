// The routes for harness items 62 to 72 (src/harness.js lists them). Changing a switch only works on this replicant
// matrix; reading works from a paired phone too, like the rest of Settings.
//   GET  /api/harness                    the switches, the Settings undo list, chat places used, quiet now
//   POST /api/harness { patch }          change switches (harness keys only)
//   POST /api/harness/clear { what }     'undo' | 'weekly' | 'places' | 'crashes'
//   GET  /api/crash                      what the chat offers at start (reports, safe start)
//   GET  /api/crash/report?id=           one report's text
//   POST /api/crash { seen } | { remove } | { safeStart: 'go' | 'back' }
//   POST /api/settings-undo { id }       Put it back
//   GET  /api/health   POST /api/health { fix }
//   GET  /api/quiet    GET /api/weekly
//   GET  /api/pins?session=   POST /api/pins { sessionId, id, pin }
//   POST /api/chat/try { sessionId, id }
//   POST /api/guest { start: true } | { end: id }
import fs from 'node:fs';
import { HARNESS_KEYS, harnessView } from './harness.js';
import { crashOffer, listReports, readReport, deleteReport, markSeen, applySafeStart, undoSafeStart, reportsDir } from './crash-catch.js';
import { undoView, putBack, clearUndo } from './settings-undo.js';
import { healthChecks, SERVER_FIXES } from './health.js';
import { quietView } from './quiet-hours.js';
import { placesUsed, clearPlaces } from './chat-places.js';
import { pinsOn, readPins, pin, unpin } from './pins.js';
import { tryOn, tryFromHere } from './try-from-here.js';
import { guestOn, isGuestId, GUEST_PREFIX } from './guest-chat.js';
import { safeId } from './chats.js';

export async function harnessRoute(ctx) {
  const { req, res, p, url, isLocal, cfg, brain, body, send, saveSettings, replaceSettings, weekly, crashState, probes = async () => ({}), applyShortcut = () => {} } = ctx;
  const POST = req.method === 'POST', GET = req.method === 'GET';
  const local = () => { if (isLocal) return true; send(res, 403, { error: 'Only on this replicant matrix itself.' }); return false; };
  const read = async () => { try { return await body(req); } catch { return {}; } };
  const log = (t) => { try { brain.log('settings', t); } catch {} };

  if (p === '/api/harness' && GET) { send(res, 200, { ...harnessView(cfg), undo: undoView(cfg), places: placesUsed(cfg), quiet: quietView(cfg), crashes: listReports(cfg).length }); return true; }
  if (p === '/api/harness' && POST) {
    if (!local()) return true;
    const b = await read();
    const patch = {};
    for (const k of HARNESS_KEYS) if (b.patch && k in b.patch) patch[k] = b.patch[k];
    if (!Object.keys(patch).length) { send(res, 400, { error: 'Nothing to change.' }); return true; }
    saveSettings(cfg, patch);
    log(`${Object.keys(patch).join(', ')}: changed (your click)`);
    if ('globalAsk' in patch) { try { applyShortcut(cfg.globalAsk); } catch {} }
    if (patch.chatPlaces === false) clearPlaces(cfg); // their saved readings go; they can be a few GB
    send(res, 200, { ...harnessView(cfg), undo: undoView(cfg), places: placesUsed(cfg), quiet: quietView(cfg), crashes: listReports(cfg).length });
    return true;
  }
  if (p === '/api/harness/show' && POST) { if (!local()) return true; try { globalThis.bobShow?.(); } catch {} send(res, 200, { ok: true }); return true; } // the ask box's Open in Bob
  if (p === '/api/harness/clear' && POST) {
    if (!local()) return true;
    const { what } = await read();
    if (what === 'undo') clearUndo(cfg);
    else if (what === 'weekly') weekly?.clear();
    else if (what === 'places') clearPlaces(cfg);
    else if (what === 'crashes') { try { fs.rmSync(reportsDir(cfg), { recursive: true, force: true }); } catch {} }
    else { send(res, 400, { error: 'Clear what?' }); return true; }
    log(`cleared: ${what}`);
    send(res, 200, { ok: true, undo: undoView(cfg), places: placesUsed(cfg), crashes: listReports(cfg).length });
    return true;
  }

  // ---- Catch crashes and Safe start
  if (p === '/api/crash' && GET) { send(res, 200, { ...crashOffer(cfg, crashState), all: listReports(cfg) }); return true; }
  if (p === '/api/crash/report' && GET) {
    const t = readReport(cfg, url.searchParams.get('id'));
    if (t == null) send(res, 404, { error: 'That report is gone.' }); else { markSeen(cfg, [url.searchParams.get('id')]); send(res, 200, { text: t }); }
    return true;
  }
  if (p === '/api/crash' && POST) {
    const b = await read();
    if (b.seen) { markSeen(cfg, [].concat(b.seen).map(String).slice(0, 20)); send(res, 200, crashOffer(cfg, crashState)); return true; }
    if (!local()) return true;
    if (b.remove) { deleteReport(cfg, String(b.remove)); send(res, 200, { ...crashOffer(cfg, crashState), all: listReports(cfg) }); return true; }
    if (b.safeStart === 'go') {
      const r = applySafeStart(cfg, saveSettings);
      if (crashState) crashState.safeDone = true;
      log(`safe start: ${r.count} opt-in switch${r.count === 1 ? '' : 'es'} off (your click)`);
      send(res, 200, { ok: true, ...r }); return true;
    }
    if (b.safeStart === 'back') {
      const r = undoSafeStart(cfg, replaceSettings);
      log(`safe start: ${r.count} switch${r.count === 1 ? '' : 'es'} put back (your click)`);
      send(res, 200, { ok: true, ...r }); return true;
    }
    if (b.safeStart === 'no') { if (crashState) crashState.safeDone = true; send(res, 200, { ok: true }); return true; }
    send(res, 400, { error: 'Nothing to do.' }); return true;
  }

  // ---- Undo for Settings
  if (p === '/api/settings-undo' && POST) {
    if (!local()) return true;
    const { id } = await read();
    const r = putBack(cfg, id, replaceSettings);
    if (r.ok) log(`put back: ${r.keys.join(', ')} (your click)`);
    send(res, r.ok ? 200 : 404, { ...r, undo: undoView(cfg) });
    return true;
  }

  // ---- The Health page
  if (p === '/api/health' && GET) { send(res, 200, healthChecks({ ...(await probes()), crashes: listReports(cfg).filter((r) => !r.seen).length })); return true; }
  if (p === '/api/health' && POST) {
    if (!local()) return true;
    const { fix } = await read();
    if (!SERVER_FIXES.includes(fix)) { send(res, 400, { error: 'That isn\'t a fix I know.' }); return true; }
    if (fix === 'wake') brain.wake('health page').catch(() => {});
    if (fix === 'free-card') {
      if (brain.turns?.size) { send(res, 409, { error: 'I\'m working on something. Let it finish, or press Stop, then try again.' }); return true; }
      await brain.engine?.unloadAll?.().catch(() => {});
      brain.broadcast?.({ type: 'brain' });
    }
    log(`health page: ${fix} (your click)`);
    send(res, 200, { ok: true, ...healthChecks({ ...(await probes()), crashes: listReports(cfg).filter((r) => !r.seen).length }) });
    return true;
  }

  if (p === '/api/quiet' && GET) { send(res, 200, quietView(cfg)); return true; }
  if (p === '/api/weekly' && GET) { send(res, 200, weekly ? weekly.view(ctx.nameOf) : { on: false }); return true; }

  // ---- Pin messages
  if (p === '/api/pins' && GET) { const id = safeId(url.searchParams.get('session')); send(res, 200, { on: pinsOn(cfg), pins: id && !isGuestId(id) ? readPins(cfg, id) : [] }); return true; }
  if (p === '/api/pins' && POST) {
    const b = await read();
    const id = safeId(b.sessionId);
    if (!pinsOn(cfg)) { send(res, 409, { error: 'Pin messages is off. Switch it on in Settings, How Bob works, 💬 Chat extras.' }); return true; }
    if (!id || isGuestId(id)) { send(res, 400, { error: 'Nothing is kept from a guest chat, pins included.' }); return true; }
    const r = b.pin === false ? unpin(cfg, id, String(b.id || '')) : pin(cfg, id, brain.session(id), String(b.id || ''));
    send(res, r.ok ? 200 : 400, r.ok ? { pins: r.pins } : { error: r.why });
    return true;
  }

  // ---- Try from here
  if (p === '/api/chat/try' && POST) {
    const b = await read();
    if (!tryOn(cfg)) { send(res, 409, { error: 'Try from here is off. Switch it on in Settings, How Bob works, 💬 Chat extras.' }); return true; }
    const from = safeId(b.sessionId);
    if (!from || isGuestId(from)) { send(res, 400, { error: 'A guest chat isn\'t saved, so it can\'t be copied.' }); return true; }
    const r = tryFromHere(cfg, from, brain.session(from), String(b.id || ''));
    if (r.error) { send(res, 400, r); return true; }
    brain.log('chats', 'tried a chat from a message (a copy; the original is kept)');
    send(res, 200, r);
    return true;
  }

  // ---- Guest chats
  if (p === '/api/guest' && POST) {
    const b = await read();
    if (b.end) { const id = String(b.end); if (isGuestId(id)) brain.forgetGuest?.(id); send(res, 200, { ok: true }); return true; }
    if (!guestOn(cfg)) { send(res, 409, { error: 'Guest chats are off. Switch them on in Settings, How Bob works, 💬 Chat extras.' }); return true; }
    const id = `${GUEST_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    brain.log('chats', 'a guest chat started (nothing from it is saved)');
    send(res, 200, { id });
    return true;
  }
  return false;
}
