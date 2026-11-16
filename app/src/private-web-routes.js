// Settings, Connections, "Private web" in Bob's API (src/private-web.js). Off unless turned on.
// GET /api/private-web: the switch, "try other sources", the route and whether routing works here.
// POST: { on }, { otherSources }, { route } (an address, or '' to clear), or { test: true } (one request through the
// route; only when you press Test). From this computer only. The route address never goes in the log.
// Returns false when the request is not this one, so server.js keeps looking.
import { saveSettings } from './config.js';
import { cleanPrivateWeb, routeOk, routeKind, routeName, testRoute } from './private-web.js';

export function privateWebView(cfg) {
  const pw = cleanPrivateWeb(cfg?.privateWeb);
  const desktop = Boolean(globalThis.bobRoute?.fetch);
  return { ...pw, kind: routeKind(pw.route), desktop, browser: Boolean(globalThis.bobBrowser) };
}

export async function privateWebRoute({ req, res, p, isLocal, cfg, body, send, log = () => {}, routed }) {
  if (p !== '/api/private-web') return false;
  if (!isLocal) return send(res, 403, { error: 'Private web is set on this replicant matrix itself.' });
  if (req.method === 'GET') return send(res, 200, privateWebView(cfg));
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const b = await body(req).catch(() => ({}));
  const now = cleanPrivateWeb(cfg.privateWeb);
  const next = { ...now };
  if (typeof b?.on === 'boolean') next.on = b.on;
  if (typeof b?.otherSources === 'boolean') next.otherSources = b.otherSources;
  if (typeof b?.route === 'string') {
    const r = b.route.trim();
    if (r && !routeOk(r)) return send(res, 400, { error: 'That isn\'t an address I can use. Like socks5://127.0.0.1:9050 (Tor) or http://127.0.0.1:8080.' });
    next.route = r;
  }
  saveSettings(cfg, { privateWeb: cleanPrivateWeb(next) });
  if (typeof b?.on === 'boolean') log('settings', `Private web ${b.on ? 'on' : 'off'}`);
  const kindSaid = routeName(cleanPrivateWeb(next).route); // its kind only, never the address
  if (typeof b?.route === 'string') log('settings', `Private web route: ${kindSaid}`);
  if (b?.test === true) {
    const t = await testRoute(cfg, routed ? { routed } : {});
    log('settings', `Private web route tested: ${t.ok ? 'works' : 'did not work'}`);
    return send(res, 200, { ...privateWebView(cfg), test: t });
  }
  return send(res, 200, privateWebView(cfg));
}
