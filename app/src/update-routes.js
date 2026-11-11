// Updates and Remove Bob in Bob's API: check for an update, its status, restart, start it, quit, and uninstall.
// Split out of server.js; same rules as before (changes only on this computer).
import { checkAll, startAny, updateStatus, requestRestart } from './update.js';
import { plan as uninstallPlan, startUninstall } from './uninstall.js';
import { autostartOn, setAutostart } from './autostart.js';

// Returns true when it answered the request, so server.js stops looking. The send and serveFile it is handed
// return true too, so `return send(...)` here means answered.
export async function updateRoute({ req, res, p, isLocal, cfg, brain, shop, body, send }) {
  if (req.method === 'GET' && p === '/api/update/check') return send(res, 200, await checkAll());
  if (req.method === 'GET' && p === '/api/update/status') return send(res, 200, updateStatus(cfg) || {});
  if (req.method === 'POST' && p === '/api/update/restart') {
    if (!isLocal) return send(res, 403, { error: 'Only on this replicant matrix itself.' });
    const { when } = await body(req);
    try { return send(res, 200, requestRestart(cfg, when, { isBusy: () => brain.turns.size > 0 || brain.queue.some((j) => j.state === 'waiting') || Boolean(shop.job) })); } catch (e) { return send(res, 409, { error: e.message }); }
  }
  // "Remove Bob" (Settings): only on the PC itself, after the window's confirm.
  if (req.method === 'GET' && p === '/api/uninstall') { const pl = uninstallPlan(cfg); return send(res, 200, { canRun: pl.canRun, why: pl.why, app: pl.app, inn: pl.inn, models: pl.models }); }
  if (req.method === 'POST' && p === '/api/uninstall') {
    if (!isLocal) return send(res, 403, { error: 'Only on this replicant matrix itself.' });
    const { confirm, notes, models } = await body(req);
    if (confirm !== 'remove') return send(res, 400, { error: 'Confirm first.' });
    try {
      if (autostartOn()) await setAutostart(cfg, false); // take the login item away before the program goes
      const r = startUninstall(cfg, { notes: notes === true, models: models === true });
      brain.log('settings', `removing Bob (notes ${notes === true}, models ${models === true})`);
      brain.broadcast({ type: 'announce', text: 'Packing up. A small window finishes removing me once I have closed. It was a pleasure.' });
      send(res, 200, r);
      setTimeout(() => (globalThis.bobQuit ? globalThis.bobQuit() : process.exit(0)), 1500);
      return true;
    } catch (e) { return send(res, 409, { error: e.message }); }
  }
  if (req.method === 'POST' && (p === '/api/update/start' || p === '/api/quit')) {
    if (!isLocal) return send(res, 403, { error: 'Only on this replicant matrix itself.' });
    if (p === '/api/quit') { brain.log('settings', 'closing for an update'); brain.broadcast({ type: 'announce', text: 'Closing for a moment to switch to the new Bob. Back in a few seconds.' }); send(res, 200, { ok: true }); setTimeout(() => (globalThis.bobQuit ? globalThis.bobQuit() : process.exit(0)), 300); return true; }
    try { const r = await startAny(cfg); brain.log('settings', `update started (${r.via}): ${r.from.label} -> ${r.to?.label}`); return send(res, 200, r); }
    catch (e) { return send(res, 409, { error: e.message }); }
  }
  return false;
}
