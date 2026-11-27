// Settings, Online services, "No internet" in Bob's API (src/no-internet.js). Off unless turned on.
// GET /api/no-internet: the switch, its ticks, the allowed sites, and what stops while it's on.
// POST: { on }, { home }, { bobNet }, { add: 'site' }, { remove: 'site' } or { allow: [...] }. From this computer only:
// a phone or another Bob can't switch it off. Only site names are kept, and the logbook says what changed, never which
// sites.
import { saveSettings } from './config.js';
import { noInternetOf, cleanSite, STOPS, KEEPS, NO_INTERNET_PATH } from './no-internet.js';

export const noInternetView = (cfg) => ({ ...noInternetOf(cfg), stops: STOPS, keeps: KEEPS });

export async function noInternetRoute({ req, res, p, isLocal, cfg, body, send, log = () => {}, changed = () => {} }) {
  if (p !== NO_INTERNET_PATH) return false;
  if (!isLocal) return send(res, 403, { error: 'No internet is set on this replicant matrix itself.' });
  if (req.method === 'GET') return send(res, 200, noInternetView(cfg));
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const b = await body(req).catch(() => ({}));
  const next = noInternetOf(cfg);
  for (const k of ['on', 'home', 'bobNet']) if (typeof b?.[k] === 'boolean') next[k] = b[k];
  if (Array.isArray(b?.allow)) next.allow = b.allow;
  if (typeof b?.add === 'string') {
    const s = cleanSite(b.add);
    if (!s) return send(res, 400, { error: 'That isn\'t a site name I can use. Like example.com (it allows everything under it too).' });
    next.allow = [...next.allow, s];
  }
  if (typeof b?.remove === 'string') { const s = cleanSite(b.remove); next.allow = next.allow.filter((a) => a !== s); }
  saveSettings(cfg, { noInternet: next });
  if (typeof b?.on === 'boolean') log('settings', `No internet ${b.on ? 'on' : 'off'}`);
  if (typeof b?.home === 'boolean') log('settings', `No internet: home network ${b.home ? 'allowed' : 'stopped'}`);
  if (typeof b?.bobNet === 'boolean') log('settings', `No internet: your own Bobs ${b.bobNet ? 'allowed' : 'stopped'}`);
  if (b?.add || b?.remove || b?.allow) log('settings', `No internet: allowed list changed (${noInternetOf(cfg).allow.length} sites)`);
  try { changed(noInternetOf(cfg)); } catch {}
  return send(res, 200, noInternetView(cfg));
}
