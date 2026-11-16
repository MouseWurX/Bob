// Private web (Settings, Connections, 🕶 Private web). Off unless you turn it on. Nov 16 2026, PRIVATE-WEB-PLAN.md.
//
// It only changes how Bob's own web tools reach the internet: web_search, fetch_page and Bob's browser window.
// Never Gaming mode, the Lab, Bob-Net, model downloads, updates or cloud helpers.
//
//   on            Private web: keyed search services first (they only get the search words), no cookie or Referer,
//                 Sec-GPC: 1 and a plain Accept-Language, tracking bits taken off links, and Bob's browser window in
//                 a throwaway profile that blocks known trackers and third-party cookies.
//   route         Your own proxy or Tor, like socks5://127.0.0.1:9050 or http://127.0.0.1:8080. Bob doesn't install,
//                 run or pick one. When it's set, his web tools go only through it: if it's down they stop and say so
//                 (fails closed), never quietly going direct.
//   otherSources  When a page turns Bob away (a block, a robot check), he skips it and reads the same facts from up
//                 to 3 other sources: another search result, then a copy the Internet Archive already holds.
//
// Never, whatever the setting: rotating proxies, faked or random fingerprints, solving captchas, or retrying a blocked
// site another way. A blocked source is skipped and named, never beaten.

export const PRIVATE_HEADERS = { 'accept-language': 'en', 'sec-gpc': '1' };
const ROUTE_RX = /^(socks5h?|socks5|socks4|http|https):\/\/(\[[0-9a-f:]+\]|[a-z0-9.-]+)(:\d{1,5})?\/?$/i;

// Settings, tidied: { on, route, otherSources }. Off and no route to start; other sources on.
export function cleanPrivateWeb(x) {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const route = typeof o.route === 'string' && ROUTE_RX.test(o.route.trim()) ? o.route.trim().replace(/\/$/, '') : '';
  return { on: o.on === true, route, otherSources: o.otherSources !== false };
}
export const routeOk = (s) => ROUTE_RX.test(String(s || '').trim());
export const routeKind = (route) => (/^socks/i.test(route || '') ? 'socks' : route ? 'http' : '');
// What a log or a shared row may say about a route: its kind only, never the address.
export const routeName = (route) => (!route ? 'none' : routeKind(route) === 'socks' ? 'a SOCKS route (like Tor)' : 'an HTTP proxy');

// ---------- clean links ----------
// Tracking bits come off a link before Bob opens it (Private web on). Only names known to be trackers.
const TRACK = /^(utm_[a-z_]+|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|yclid|twclid|ttclid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|oly_anon_id|oly_enc_id|vero_id|vero_conv|li_fat_id|rb_clickid|s_cid|_ga|_gl|srsltid)$/i;
export function cleanLink(url) {
  let u;
  try { u = new URL(String(url)); } catch { return String(url); }
  if (!/^https?:$/.test(u.protocol)) return String(url);
  for (const k of [...u.searchParams.keys()]) if (TRACK.test(k)) u.searchParams.delete(k);
  if (/^#?(utm_|xtor=)/i.test(u.hash)) u.hash = '';
  return u.toString().replace(/\?$/, '').replace(/\?#/, '#');
}

// ---------- requests ----------
// opts for a web request with Private web on: no cookie, no Referer, Sec-GPC and a plain language. Node's fetch never
// sends cookies of its own; this also takes off any a caller passed.
export function privateOpts(opts = {}) {
  const headers = {};
  for (const [k, v] of Object.entries(opts.headers || {})) if (!/^(cookie|referer|referrer)$/i.test(k)) headers[k] = v;
  return { ...opts, headers: { ...headers, ...PRIVATE_HEADERS }, referrerPolicy: 'no-referrer', credentials: 'omit' };
}

// The routed fetch: globalThis.bobRoute (electron/web-route.cjs) in the desktop app; elsewhere undici's ProxyAgent
// for an http(s) proxy when undici is there. Neither: null, and the request stops (fails closed).
let undiciTry = null;
async function plainProxy(route) {
  if (routeKind(route) !== 'http') return null;
  undiciTry ??= import('undici').catch(() => null);
  const u = await undiciTry;
  if (!u?.ProxyAgent) return null;
  const agent = new u.ProxyAgent(route);
  return { fetch: (url, opts) => u.fetch(url, { ...opts, dispatcher: agent }) };
}
export async function routedFetcher(route, { routed = globalThis.bobRoute } = {}) {
  if (!route) return null;
  if (routed?.fetch) return { fetch: (url, opts) => routed.fetch(String(url), opts, route) };
  return plainProxy(route);
}

// Every web request from web_search and fetch_page comes through here.
// direct(url, opts, fetchImpl?) is tools.js fetchRetry (with its one retry); routed requests get it too, through the route.
export async function webGet(cfg, url, opts, direct, { routed } = {}) {
  const pw = cleanPrivateWeb(cfg?.privateWeb);
  const o = pw.on ? privateOpts(opts) : opts;
  if (!pw.route) return direct(url, o);
  const via = await routedFetcher(pw.route, routed ? { routed } : {});
  if (!via) {
    const e = new Error(routeKind(pw.route) === 'socks' ? 'A SOCKS route (like Tor) works in the Bob desktop app for now, so I stopped instead of going direct. Settings, Connections, Private web.' : 'Your proxy route works in the Bob desktop app for now, so I stopped instead of going direct. Settings, Connections, Private web.');
    e.route = true; throw e;
  }
  try { return await direct(url, o, via.fetch); }
  catch (e) {
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') throw e;
    const err = new Error(`Your route (${routeName(pw.route)}) didn't answer, so I stopped instead of going direct. Check that it's running, or clear it in Settings, Connections, Private web.`);
    err.route = true; throw err;
  }
}

// Test (Settings): one request through the route, and the address the internet sees. Only when you press it.
export const ROUTE_TEST_URL = 'https://check.torproject.org/api/ip';
export async function testRoute(cfg, { routed, timeoutMs = 20000 } = {}) {
  const pw = cleanPrivateWeb(cfg?.privateWeb);
  if (!pw.route) return { ok: false, says: 'Put a route in the box first, like socks5://127.0.0.1:9050 for Tor.' };
  const via = await routedFetcher(pw.route, routed ? { routed } : {});
  if (!via) return { ok: false, says: routeKind(pw.route) === 'socks' ? 'SOCKS (Tor) works in the Bob desktop app for now.' : 'A proxy route works in the Bob desktop app for now.' };
  try {
    const r = await via.fetch(ROUTE_TEST_URL, privateOpts({ headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) }));
    if (!r.ok) return { ok: false, says: `The route answered, but the check page said ${r.status}.` };
    const j = await r.json().catch(() => ({}));
    const ip = String(j?.IP || '').slice(0, 64);
    return { ok: true, says: `It works. The internet sees ${ip || 'an address'}${j?.IsTor === true ? ', a Tor address' : ''}.` };
  } catch (e) {
    return { ok: false, says: `The route didn't answer (${String(e?.message || e).slice(0, 80)}). Check that it's running.` };
  }
}

// ---------- blocked pages ----------
// A page that turns Bob away: 401/403/429, or a Cloudflare / "checking your browser" / captcha page.
export function pageBlock(status, html = '') {
  const h = String(html || '').slice(0, 30000);
  if (status === 401 || status === 403 || status === 429) {
    if (/cf-chl|cloudflare|just a moment/i.test(h)) return 'a Cloudflare check';
    if (/captcha/i.test(h)) return 'a robot check';
    return status === 429 ? 'too many visits (429)' : `a block (${status})`;
  }
  if (/<title>\s*(just a moment|attention required|access denied)[^<]*<\/title>|cf-chl-|challenge-platform/i.test(h)) return 'a Cloudflare check';
  if (/<title>[^<]*(captcha|are you a robot|verify you are human)[^<]*<\/title>|g-recaptcha|h-captcha|hcaptcha\.com\/1\/api/i.test(h)) return 'a robot check';
  if (/checking your browser before accessing/i.test(h)) return 'a "checking your browser" page';
  return '';
}
export const siteOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

// Sites that blocked Bob in this job: skipped for the rest of it, so he never keeps knocking.
const blockedByJob = new Map(); // job -> Map(site -> why)
export function noteBlocked(job, url, why) {
  const k = job || 'no-job';
  if (!blockedByJob.has(k)) { blockedByJob.set(k, new Map()); if (blockedByJob.size > 200) blockedByJob.delete(blockedByJob.keys().next().value); }
  blockedByJob.get(k).set(siteOf(url), why);
}
export const blockedWhy = (job, url) => blockedByJob.get(job || 'no-job')?.get(siteOf(url)) || '';

// Words to look for the same facts with: the link's own path words (never a query string), and -site: for the
// blocked site.
export function sameFactsQuery(url) {
  let u; try { u = new URL(url); } catch { return ''; }
  const words = decodeURIComponent(u.pathname).replace(/\.(html?|php|aspx?)$/i, '').split(/[/_\-.+]+/).filter((w) => /[a-z]/i.test(w) && w.length > 1 && !/^(index|www|amp|en|us|article|articles|news|story|p|post|posts|blog|wiki)$/i.test(w) && !/^[0-9a-f]{12,}$/i.test(w)).slice(-8);
  if (!words.length) return '';
  return `${words.join(' ')} -site:${siteOf(url)}`;
}
// The Internet Archive's copy, only if one is already there (never asks it to save one).
export const ARCHIVE_ASK = (url) => `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
export const MAX_OTHER_SOURCES = 3;
