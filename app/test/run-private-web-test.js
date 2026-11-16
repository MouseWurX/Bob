// Private web (Nov 16, src/private-web.js): other sources when a page blocks Bob, private mode, the browser window's
// throwaway profile, and the route through your own proxy or Tor. Every fetch here is a fake: nothing goes online.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { cleanPrivateWeb, cleanLink, privateOpts, webGet, pageBlock, sameFactsQuery, routeName, testRoute, PRIVATE_HEADERS } from '../src/private-web.js';
import { webSearch } from '../src/web-search.js';
import { buildTools } from '../src/tools.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';

const require = createRequire(import.meta.url);
const { isTracker, siteKey } = require('../electron/tracker-list.cjs');
const { chromiumRule } = require('../electron/web-route.cjs');

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-privweb-'));

// ---------- settings ----------
{
  const d = cleanPrivateWeb(undefined);
  check('off, no route and other sources on to start', d.on === false && d.route === '' && d.otherSources === true);
  check('a route must be an address: socks5, socks5h, http or https', cleanPrivateWeb({ route: 'socks5://127.0.0.1:9050' }).route === 'socks5://127.0.0.1:9050' && cleanPrivateWeb({ route: 'http://127.0.0.1:8080/' }).route === 'http://127.0.0.1:8080' && cleanPrivateWeb({ route: 'socks5h://localhost:9150' }).route === 'socks5h://localhost:9150');
  check('…anything else is dropped', ['ftp://x:1', 'rm -rf /', 'http://user:pass@x:1', 'socks5://127.0.0.1:9050/path', 'javascript:alert(1)'].every((r) => cleanPrivateWeb({ route: r }).route === ''));
  check('on only when true', cleanPrivateWeb({ on: 'yes' }).on === false && cleanPrivateWeb({ on: true }).on === true);
  check('it is a setting Bob saves, tidied', SETTING_KEYS.includes('privateWeb') && SETTING_KEYS.at(-1) === 'apuHoldbackGB' && mergeSettings({}, { privateWeb: { on: true, route: 'nope', extra: 1 } }).privateWeb.route === '' && !('extra' in mergeSettings({}, { privateWeb: { on: true, extra: 1 } }).privateWeb));
  check('a log names the route by kind only, never the address', routeName('socks5://198.51.100.7:9050') === 'a SOCKS route (like Tor)' && !routeName('http://198.51.100.7:8080').includes('198.51'));
}

// ---------- links and headers ----------
{
  const c = cleanLink('https://ex.example/a?utm_source=x&id=7&fbclid=abc&gclid=1&q=keep#top');
  check('tracking bits come off a link; the rest stays', c === 'https://ex.example/a?id=7&q=keep#top', c);
  check('…a link with only tracking bits ends clean', cleanLink('https://ex.example/a?utm_medium=mail') === 'https://ex.example/a');
  check('…a link that is not http(s) is left alone', cleanLink('mailto:a@b.example?utm_source=x') === 'mailto:a@b.example?utm_source=x');
  const o = privateOpts({ headers: { Cookie: 'a=1', Referer: 'https://x.example', 'user-agent': 'Bob' } });
  check('private requests: no cookie, no Referer, Sec-GPC and a plain language', !o.headers.Cookie && !o.headers.Referer && o.headers['sec-gpc'] === '1' && o.headers['accept-language'] === 'en' && o.headers['user-agent'] === 'Bob' && o.referrerPolicy === 'no-referrer' && o.credentials === 'omit');
}

// ---------- webGet: private headers and the route, failing closed ----------
{
  const sent = [];
  const direct = async (url, opts, impl) => { sent.push({ url: String(url), opts, via: impl ? 'route' : 'direct' }); return impl ? impl(url, opts) : { ok: true, status: 200 }; };
  await webGet({ privateWeb: { on: true } }, 'https://a.example', { headers: {} }, direct);
  check('Private web on: its headers on every request', sent[0].opts.headers['sec-gpc'] === '1' && sent[0].via === 'direct');
  sent.length = 0;
  await webGet({}, 'https://a.example', { headers: { x: 1 } }, direct);
  check('Private web off: requests as before', !sent[0].opts.headers['sec-gpc']);
  sent.length = 0;
  const routed = { fetch: async (url, opts, route) => ({ ok: true, status: 200, route }) };
  const r = await webGet({ privateWeb: { route: 'socks5://127.0.0.1:9050' } }, 'https://a.example', {}, direct, { routed });
  check('with a route set, the request goes through it', sent[0].via === 'route' && r.route === 'socks5://127.0.0.1:9050');
  sent.length = 0;
  const down = { fetch: async () => { throw new TypeError('fetch failed'); } };
  const e1 = await webGet({ privateWeb: { route: 'socks5://127.0.0.1:9050' } }, 'https://a.example', {}, direct, { routed: down }).then(() => null, (e) => e);
  check('the route is down: it stops and says so, never going direct', e1?.route === true && /didn't answer, so I stopped instead of going direct/.test(e1.message) && sent.every((x) => x.via === 'route') && !e1.message.includes('127.0.0.1'));
  sent.length = 0;
  const prev = globalThis.bobRoute; delete globalThis.bobRoute;
  const e2 = await webGet({ privateWeb: { route: 'socks5://127.0.0.1:9050' } }, 'https://a.example', {}, direct).then(() => null, (e) => e);
  check('no way to route here (not the desktop app): stops, never direct', e2?.route === true && sent.length === 0 && /desktop app/.test(e2.message));
  globalThis.bobRoute = prev;
  const t = await testRoute({ privateWeb: { route: 'socks5://127.0.0.1:9050' } }, { routed: { fetch: async () => ({ ok: true, status: 200, json: async () => ({ IsTor: true, IP: '203.0.113.9' }) }) } });
  check('Test shows the address the internet sees', t.ok && /203\.0\.113\.9, a Tor address/.test(t.says));
  check('…and needs a route first', /Put a route in the box first/.test((await testRoute({})).says));
}

// ---------- blocked pages ----------
check('a Cloudflare check, a captcha or a 403/429 is seen as a block', pageBlock(403, '<title>Just a moment...</title>') === 'a Cloudflare check' && pageBlock(200, '<html><title>Verify you are human</title>') === 'a robot check' && pageBlock(429, '') === 'too many visits (429)' && pageBlock(200, '<p>Hello</p>') === '');
check('the same facts are looked for by the link\'s own words, without that site', sameFactsQuery('https://news.example.com/2026/11/big-river-flood-warning.html?utm_source=x') === 'big river flood warning -site:news.example.com');

// ---------- fetch_page: skip and try other sources ----------
const html = (body) => new Response(`<html><body><article><p>${body}</p></article></body></html>`, { headers: { 'content-type': 'text/html' } });
const LONG = 'The river rose two metres overnight and the town opened its shelters. '.repeat(8);
function fakeNet({ other = 'ok', archive = 'none' } = {}) {
  const seen = [];
  const f = async (u, opts = {}) => {
    const url = String(u); seen.push({ url, opts });
    if (url.startsWith('https://blocked.example/')) return new Response('<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>', { status: 403, headers: { 'content-type': 'text/html' } });
    if (url.startsWith('https://html.duckduckgo.com/')) return new Response('<a rel="nofollow" class="result__a" href="https://blocked.example/x">Same site</a> <a class="result__snippet">s</a><a rel="nofollow" class="result__a" href="https://other.example/flood">Other</a> <a class="result__snippet">s</a><a rel="nofollow" class="result__a" href="https://third.example/flood">Third</a> <a class="result__snippet">s</a>', { headers: { 'content-type': 'text/html' } });
    if (url.startsWith('https://other.example/')) return other === 'ok' ? html(LONG) : new Response('<title>Attention Required</title>', { status: 403, headers: { 'content-type': 'text/html' } });
    if (url.startsWith('https://third.example/')) return html(LONG);
    if (url.startsWith('https://archive.org/wayback/available')) return new Response(JSON.stringify(archive === 'there' ? { archived_snapshots: { closest: { available: true, url: 'http://web.archive.org/web/2026/https://blocked.example/big-river-flood' } } } : { archived_snapshots: {} }), { headers: { 'content-type': 'application/json' } });
    if (url.startsWith('https://web.archive.org/')) return html('Archived: ' + LONG);
    return new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } });
  };
  return { f, seen };
}
const baseCfg = (pw) => ({ agentDir: tmp, innDir: tmp, dataDir: tmp, settingsFile: path.join(tmp, 's.json'), readRoots: [], readOnlyRoots: [], userName: 'Sam', projects: {}, webSearch: true, timeZone: 'UTC', privateWeb: pw });
const realFetch = globalThis.fetch;
{
  const n = fakeNet(); globalThis.fetch = n.f;
  const tools = buildTools(baseCfg({}));
  const out = await tools.fetch_page.run({ url: 'https://blocked.example/big-river-flood' }, { signal: new AbortController().signal, job: { id: 'j1' } });
  check('a blocked page: Bob says so and reads the same facts from another site', /blocked\.example turned me away \(a Cloudflare check\), and I don't get past those\. So I read the same facts from other\.example instead/.test(out) && /river rose two metres/.test(out), out.slice(0, 300));
  check('…the blocked site is asked once, never another way', n.seen.filter((x) => x.url.startsWith('https://blocked.example/big')).length === 1 && n.seen.filter((x) => x.url.startsWith('https://blocked.example/')).every((x) => /Bob\/0\.1/.test(x.opts.headers?.['user-agent'] || '')));
  check('…a search result on the same blocked site is skipped', !n.seen.some((x) => x.url === 'https://blocked.example/x'));
  n.seen.length = 0;
  const again = await tools.fetch_page.run({ url: 'https://blocked.example/big-river-flood' }, { signal: new AbortController().signal, job: { id: 'j1' } });
  check('…and for the rest of the job it is not asked again', !n.seen.some((x) => x.url.startsWith('https://blocked.example/')) && /other\.example/.test(again));
}
{
  const n = fakeNet({ other: 'blocked', archive: 'there' }); globalThis.fetch = n.f;
  const out = await buildTools(baseCfg({})).fetch_page.run({ url: 'https://blocked.example/big-river-flood' }, { signal: new AbortController().signal, job: { id: 'j2' } });
  check('the next source blocked too: an Internet Archive copy that is already there', /the Internet Archive's copy instead: https:\/\/web\.archive\.org\//.test(out) && /Skipped: other\.example \(also turned me away\)/.test(out), out.slice(0, 400));
  check('…Bob only reads an existing copy, never asks it to save one', !n.seen.some((x) => /web\.archive\.org\/save/.test(x.url)));
}
{
  const n = fakeNet({ other: 'blocked' }); globalThis.fetch = async (u, o) => (String(u).startsWith('https://third.example/') ? new Response('<title>Access denied</title>', { status: 403, headers: { 'content-type': 'text/html' } }) : n.f(u, o));
  const out = await buildTools(baseCfg({})).fetch_page.run({ url: 'https://blocked.example/big-river-flood' }, { signal: new AbortController().signal, job: { id: 'j3' } });
  check('every source blocked: an honest answer, at most 3 tried, no loop', /I tried other\.example \(also turned me away\); the Internet Archive \(no copy there\); third\.example \(also turned me away\)\. Try web_search/.test(out), out);
}
{
  const n = fakeNet(); globalThis.fetch = n.f;
  const out = await buildTools(baseCfg({ otherSources: false })).fetch_page.run({ url: 'https://blocked.example/big-river-flood' }, { signal: new AbortController().signal, job: { id: 'j4' } });
  check('"Try other sources" off: Bob just says the site turned him away', /turned me away \(a Cloudflare check\), and I don't get past those\. Try web_search/.test(out) && n.seen.length === 1);
}
{
  const n = fakeNet(); globalThis.fetch = n.f;
  await buildTools(baseCfg({ on: true })).fetch_page.run({ url: 'https://other.example/flood?utm_source=news&id=3' }, { signal: new AbortController().signal, job: { id: 'j5' } });
  const s = n.seen[0];
  check('Private web on: the link loses its tracking bits, and no cookie or Referer goes', s.url === 'https://other.example/flood?id=3' && s.opts.headers['sec-gpc'] === '1' && !s.opts.headers.cookie && s.opts.referrerPolicy === 'no-referrer', JSON.stringify(s));
}
globalThis.fetch = realFetch;

// ---------- web_search: services first with Private web on ----------
{
  const seen = [];
  const get = async (url, opts = {}) => { seen.push(url); if (url === 'https://api.firecrawl.dev/v2/search') return { ok: true, status: 200, json: async () => ({ success: true, data: { web: [{ url: 'https://f.example/a', title: 'Fire', description: 'd' }] } }) }; return { ok: true, status: 200, text: async () => '<a rel="nofollow" class="result__a" href="https://d.example/">D</a>', headers: { get: () => null } }; };
  const cfg = { dataDir: fs.mkdtempSync(path.join(tmp, 'ws-')), privateWeb: { on: true }, searchBackup: { use: { firecrawl: true } } };
  const out = await webSearch({ query: 'x' }, { cfg, get, key: () => '' });
  check('Private web on: the services you turned on go first, the free pages last', seen[0] === 'https://api.firecrawl.dev/v2/search' && !seen.some((u) => /duckduckgo/.test(u)) && /first because Private web is on/.test(out), JSON.stringify(seen));
  seen.length = 0;
  await webSearch({ query: 'x' }, { cfg: { ...cfg, privateWeb: {} }, get, key: () => '' });
  check('…off: the free pages first, as before', /duckduckgo/.test(seen[0]));
}

// ---------- the browser window ----------
{
  check('known trackers are blocked, with every address under them', isTracker('https://www.google-analytics.com/g/collect') && isTracker('https://stats.g.doubleclick.net/x') && isTracker('https://connect.facebook.net/en_US/fbevents.js') && !isTracker('https://www.wikipedia.org/') && !isTracker('https://facebook.com/'));
  check('a site for cookies is the page\'s own name', siteKey('news.bbc.co.uk') === 'bbc.co.uk' && siteKey('a.b.example.com') === 'example.com' && siteKey('127.0.0.1') === '127.0.0.1');
  check('the route is handed to Chromium as written (socks5h as socks5)', chromiumRule('socks5h://127.0.0.1:9050') === 'socks5://127.0.0.1:9050');
  const bw = read('electron/browser-window.cjs'), wr = read('electron/web-route.cjs');
  check('private: a throwaway profile (no persist:), trackers blocked, third-party cookies refused, WebRTC kept to the route', /'bob-browser-private'/.test(bw) && !/persist:bob-browser-private/.test(bw) && /isTracker\(d\.url\)/.test(bw) && /delete h\.Cookie/.test(bw) && /set-cookie/.test(bw) && /setWebRTCIPHandlingPolicy\?\.\('disable_non_proxied_udp'\)/.test(bw));
  check('…emptied when the window closes', /if \(opened\.on\) \{ const p = session\.fromPartition\('bob-browser-private'\); p\.clearStorageData\(\)/.test(bw));
  check('the route session fails closed: fixed servers, no DIRECT, its own throwaway session', /mode: 'fixed_servers', proxyRules: want, proxyBypassRules: ''/.test(wr) && !/DIRECT/.test(wr) && /fromPartition\('bob-web-route'\)/.test(wr) && /credentials: 'omit'/.test(wr));
  check('the browser never fakes its look', !/setUserAgent|userAgent:/.test(bw));
  check('the Browser hand passes the settings and cleans the link', /drv\(\)\.setPrivacy\?\.\(\{ on: pw\.on, route: pw\.route \}\)/.test(read('src/hands-browser.js')) && /cleanLink\(String\(args\.url/.test(read('src/hands-browser.js')));
}

// ---------- only Bob's web tools; Gaming mode and the rest untouched ----------
{
  const src = ['src/gaming.js', 'src/bob-net.js', 'src/downloads.js', 'src/lab-routes.js'].filter((f) => fs.existsSync(new URL(`../${f}`, import.meta.url)));
  check('Gaming mode, Bob-Net, downloads and the Lab never read Private web', src.every((f) => !/privateWeb|private-web/.test(read(f))));
  const a = mergeSettings({ gamingMode: true }, { privateWeb: { on: true, route: 'socks5://127.0.0.1:9050' } }), b = mergeSettings({ gamingMode: true }, { privateWeb: { on: false } });
  const strip = (x) => { const y = { ...x }; delete y.privateWeb; return JSON.stringify(y); };
  check('the rest of the settings are byte-for-byte the same with it on or off', strip(a) === strip(b));
  const routes = read('src/private-web-routes.js');
  const logLines = routes.split('\n').filter((l) => /log\(/.test(l)).map((l) => l.replace(/routeName\([^)]*\)\)?/g, ''));
  check('Settings: this computer only, and the log never holds the address', /if \(!isLocal\) return send\(res, 403/.test(routes) && /routeName\(/.test(routes) && logLines.every((l) => !/\$\{[^}]*\broute\b[^}]*\}/.test(l)));
}

// ---------- Settings, Help ----------
{
  const help = read('public/help-content.js'), cellar = read('public/cellar.js'), map = read('public/settings-map.js'), ui = read('public/private-web.js');
  check('its own Settings panel beside Search API keys', /\['privweb', '🕶 Private web'/.test(cellar) && /'adv-search', 'adv-privweb'/.test(map) && /mountPrivateWeb\(dlg\.querySelector\('\.private-web-box'\)\)/.test(cellar));
  check('…with the switch, other sources, the route box, Save, Test and a link to Search API keys', /data-pw-on/.test(ui) && /data-pw-other/.test(ui) && /<label for="pw-route-box">/.test(ui) && /data-pw-test/.test(ui) && /data-pw-keys/.test(ui));
  check('Help page, three FAQs and six glossary words', /id: 'settings-privweb'/.test(help) && ['faq-vpn-games', 'faq-tor-blocked', 'faq-captcha'].every((f) => help.includes(`id: '${f}'`)) && ['Private web', 'Proxy', 'Tor', 'VPN (virtual private network)', 'Tracker', 'Fingerprint (browser)'].every((w) => help.includes(`<dt>${w}</dt>`)));
  check('never built: captcha solving, fake fingerprints, rotating proxies', !/captcha-?solv|2captcha|anticaptcha|puppeteer-extra|stealth|rotate.?prox/i.test(read('src/private-web.js') + read('electron/browser-window.cjs') + read('electron/web-route.cjs')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
