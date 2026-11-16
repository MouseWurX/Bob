// Settings, Connections, "Search API keys" in Bob's API (src/web-search.js). Every service off unless turned on.
// GET /api/search-backup: each service's switch, cap and count, the order, and whether a key is saved (never the key).
// POST: a switch, the order, a cap, a key (saved locked with Bob's other keys, from this computer only), or a Test.
// Returns false when the request is not this one, so server.js keeps looking.
import { saveSettings } from './config.js';
import { saveKey } from './secret-box.js';
import { SERVICES, cleanSearchBackup, searchBackupView, testService } from './web-search.js';

export async function searchBackupRoute({ req, res, p, isLocal, cfg, body, send, log = () => {}, get = (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout(20000) }) }) {
  if (p !== '/api/search-backup') return false;
  if (!isLocal) return send(res, 403, { error: 'The backup search is set on this replicant matrix itself.' });
  if (req.method === 'GET') return send(res, 200, searchBackupView(cfg));
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const b = await body(req).catch(() => ({}));
  const now = cleanSearchBackup(cfg.searchBackup);
  const next = { ...now, caps: { ...now.caps }, use: { ...now.use } };
  if (b?.use && SERVICES[b.use.id] && typeof b.use.on === 'boolean') next.use[b.use.id] = b.use.on;
  if (Array.isArray(b?.order)) next.order = b.order;
  if (b?.cap && SERVICES[b.cap.id] && Number.isFinite(Number(b.cap.value))) next.caps[b.cap.id] = Number(b.cap.value);
  saveSettings(cfg, { searchBackup: cleanSearchBackup(next) });
  const id = String(b?.service || '');
  if (SERVICES[id] && (typeof b?.key === 'string' || b?.forget === true)) {
    const v = b.forget === true ? '' : String(b.key).trim();
    if (!b.forget && !v) return send(res, 400, { error: 'Paste the key first.' });
    if (v.length > 400 || /\s/.test(v)) return send(res, 400, { error: 'That doesn\'t look like a key: one line, no spaces.' });
    try { saveKey(cfg, SERVICES[id].key, v); } catch (e) { return send(res, 409, { error: e.code === 'BOX_STUCK' ? e.message : 'Couldn\'t save the key.' }); }
    log('settings', `${SERVICES[id].name} key ${v ? 'saved (locked)' : 'removed'}`); // never the key itself
  }
  if (SERVICES[b?.test]) {
    const t = await testService(cfg, b.test, { get });
    log('settings', `${SERVICES[b.test].name} search key tested: ${t.ok ? 'works' : 'did not work'}`);
    return send(res, 200, { ...searchBackupView(cfg), test: { id: b.test, ...t } });
  }
  return send(res, 200, searchBackupView(cfg));
}
