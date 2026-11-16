// web_search's block pages and the backup search with a key (Nov 16, src/web-search.js). Every fetch here is a fake:
// nothing goes online, and the keys are made-up test strings, never real ones.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webSearch, blockedPage, cleanSearchBackup, searchBackupView, counts, keyFor, testService, SERVICES, ORDER } from '../src/web-search.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-websearch-'));

const DDG_OK = '<a rel="nofollow" class="result__a" href="https://example.org/one">One</a> <a class="result__snippet" href="x">first hit</a>';
const DDG_BLOCK = '<html><body><div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div></body></html>';
const MOJ_BLOCK = '<html><head><title>Mojeek - Captcha</title></head><body>prove you are human</body></html>';
const resp = (status, body, json = false) => ({ status, ok: status >= 200 && status < 300, text: async () => (json ? JSON.stringify(body) : body), json: async () => body, headers: { get: () => null } });

// A fake internet: the free pages answer as told, the services answer with one result each and record what was sent.
function net({ ddg = [200, DDG_OK], moj = [200, ''], svc = {} } = {}) {
  const sent = [];
  const get = async (url, opts = {}) => {
    sent.push({ url, opts });
    if (url.startsWith('https://html.duckduckgo.com/')) return resp(ddg[0], ddg[1]);
    if (url.startsWith('https://www.mojeek.com/search') && !/api_key=/.test(url)) return resp(moj[0], moj[1]);
    if (url.startsWith('https://api2.marginalia-search.com/')) return svc.marginalia ? resp(...svc.marginalia) : resp(200, { results: [{ url: 'https://m.example/a', title: 'Marg', description: 'from marginalia' }] }, true);
    if (url.startsWith('https://api.search.brave.com/')) return svc.brave ? resp(...svc.brave) : resp(200, { web: { results: [{ url: 'https://b.example/a', title: 'Brave <b>hit</b>', description: 'from <strong>brave</strong>' }] } }, true);
    if (/api_key=/.test(url)) return svc.mojeek ? resp(...svc.mojeek) : resp(200, { response: { status: 'OK', results: [{ url: 'https://mj.example/a', title: 'Moj', desc: 'from mojeek api' }] } }, true);
    if (url === 'https://api.tavily.com/search') return svc.tavily ? resp(...svc.tavily) : resp(200, { results: [{ url: 'https://t.example/a', title: 'Tav', content: 'from tavily' }] }, true);
    return resp(404, '');
  };
  return { get, sent };
}
let n = 0;
const cfgWith = (sb, keys = {}) => ({ dataDir: fs.mkdtempSync(path.join(tmp, `d${n++}-`)), searchBackup: { ...sb, keys } });
const noSaved = () => ''; // no saved keys or environment keys in these tests

// ---------- the free pages, as before ----------
{
  const w = net();
  const out = await webSearch({ query: 'tall tower' }, { cfg: {}, get: w.get, key: noSaved });
  check('DuckDuckGo first, as before', /1\. One\n   https:\/\/example\.org\/one/.test(out) && w.sent.length === 1);
}
check('a robot check is seen for what it is', blockedPage(202, DDG_BLOCK) && blockedPage(200, MOJ_BLOCK) && blockedPage(403, '') && !blockedPage(200, DDG_OK) && !blockedPage(202, 'ok'));
{
  const w = net({ ddg: [202, DDG_BLOCK], moj: [200, MOJ_BLOCK] });
  const out = await webSearch({ query: 'x' }, { cfg: {}, get: w.get, key: noSaved });
  check('both pages blocked: says so, not "No results"', /blocking this computer/.test(out) && /DuckDuckGo and Mojeek/.test(out) && !/No results/.test(out), out);
  check('…and points to Search API keys, each off', /Settings, Connections, Search API keys \(each off unless you turn it on\)/.test(out), out);
  check('…and never goes to a service with the backup off', w.sent.every((s) => /duckduckgo|www\.mojeek\.com\/search\?q=/.test(s.url) && !/api_key/.test(s.url)));
}
{
  const w = net({ ddg: [202, DDG_BLOCK], moj: [200, MOJ_BLOCK] });
  const out = await webSearch({ query: 'x' }, { cfg: cfgWith({ use: { tavily: true } }), get: w.get, key: noSaved });
  check('a service on with no key: says where to add one', /has no key yet: Settings, Connections, Search API keys/.test(out), out);
  const w2 = net({ ddg: [202, DDG_BLOCK], moj: [200, MOJ_BLOCK] });
  const off = await webSearch({ query: 'x' }, { cfg: cfgWith({}, { tavily: 't-test' }), get: w2.get, key: () => 'saved-test' });
  check('a key alone does nothing while its service is off', !w2.sent.some((x) => x.url === 'https://api.tavily.com/search') && /each off unless you turn it on/.test(off), off);
}

// ---------- the backup with a key ----------
{
  const cfg = cfgWith({ use: { tavily: true } }, { tavily: 'tvly-test-not-real' });
  const w = net({ ddg: [202, DDG_BLOCK], moj: [200, MOJ_BLOCK] });
  const out = await webSearch({ query: 'llama.cpp releases', when: 'week' }, { cfg, get: w.get, key: noSaved });
  check('a blocked page falls through to the service with a key', /^\(From Tavily, the backup search with your key: the search pages are blocking this computer \(DuckDuckGo, Mojeek\)\.\)/.test(out) && /https:\/\/t\.example\/a/.test(out), out);
  const t = w.sent.find((s) => s.url === 'https://api.tavily.com/search');
  const body = JSON.parse(t.opts.body);
  check('only the search words and "when" go, at the basic depth', JSON.stringify(Object.keys(body).sort()) === JSON.stringify(['max_results', 'query', 'search_depth', 'time_range']) && body.query === 'llama.cpp releases' && body.time_range === 'week' && body.search_depth === 'basic');
  check('the key goes in the header, never in what Bob says', t.opts.headers.authorization === 'Bearer tvly-test-not-real' && !out.includes('tvly-test-not-real'));
  check('it is counted for the month', counts(cfg).used.tavily === 1);
}
{
  const cfg = cfgWith({ use: { marginalia: true, brave: true, mojeek: true, tavily: true } }, { marginalia: 'm-test', brave: 'b-test', mojeek: 'mj-test', tavily: 't-test' });
  const w = net({ ddg: [200, ''], moj: [200, ''] });
  const out = await webSearch({ query: 'q' }, { cfg, get: w.get, key: noSaved });
  check('nothing found on the free pages also asks the backup, first in the order', /^\(From Marginalia/.test(out) && /the free search pages found nothing|DuckDuckGo/.test(out), out);
  const m = w.sent.find((s) => s.url.startsWith('https://api2.marginalia-search.com/'));
  check('Marginalia: the key in its API-Key header', m.opts.headers['API-Key'] === 'm-test' && !m.url.includes('m-test'));
}
{
  const cfg = cfgWith({ use: { brave: true, tavily: true }, order: ['brave', 'tavily'] }, { brave: 'b-test', tavily: 't-test' });
  const w = net({ ddg: [202, DDG_BLOCK], moj: [200, MOJ_BLOCK] });
  const out = await webSearch({ query: 'news', when: 'day' }, { cfg, get: w.get, key: noSaved });
  const b = w.sent.find((s) => s.url.startsWith('https://api.search.brave.com/'));
  check('your order is kept, and Brave gets its freshness word', /^\(From Brave Search/.test(out) && /freshness=pd/.test(b.url) && b.opts.headers['X-Subscription-Token'] === 'b-test' && /Brave hit/.test(out) && !/<b>/.test(out), out);
}
{
  const cfg = cfgWith({ use: { mojeek: true }, order: ['mojeek'] }, { mojeek: 'mj-test' });
  const w = net({ ddg: [202, DDG_BLOCK], moj: [200, MOJ_BLOCK] });
  const out = await webSearch({ query: 'q', when: 'month' }, { cfg, get: w.get, key: noSaved });
  const u = w.sent.find((s) => /api_key=/.test(s.url)).url;
  check('Mojeek API: json, since, and its results', /^\(From Mojeek, the backup/.test(out) && /fmt=json/.test(u) && /since=month/.test(u) && /from mojeek api/.test(out), out);
}
{
  const cfg = cfgWith({ use: { marginalia: true, tavily: true }, order: ['marginalia', 'tavily'] }, { marginalia: 'm-test', tavily: 't-test' });
  const w = net({ ddg: [202, DDG_BLOCK], moj: [200, MOJ_BLOCK], svc: { marginalia: [503, {}, true] } });
  const out = await webSearch({ query: 'q', when: 'year' }, { cfg, get: w.get, key: noSaved });
  check('one service failing goes on to the next', /^\(From Tavily/.test(out), out);
}
{
  const cfg = cfgWith({ use: { marginalia: true }, order: ['marginalia'] }, { marginalia: 'm-test' });
  const w = net({ ddg: [202, DDG_BLOCK], moj: [200, MOJ_BLOCK] });
  const out = await webSearch({ query: 'q', when: 'week' }, { cfg, get: w.get, key: noSaved });
  check('a service with no date filter says so', /no date filter there/.test(out), out);
}
{
  const cfg = cfgWith({ use: { tavily: true }, order: ['tavily'], caps: { tavily: 2 } }, { tavily: 't-test' });
  const w = net({ ddg: [202, DDG_BLOCK], moj: [200, MOJ_BLOCK] });
  for (let i = 0; i < 2; i++) await webSearch({ query: 'q' }, { cfg, get: w.get, key: noSaved });
  const asked = w.sent.filter((s) => s.url === 'https://api.tavily.com/search').length;
  const out = await webSearch({ query: 'q' }, { cfg, get: w.get, key: noSaved });
  check('at the monthly cap it stops asking and says so', asked === 2 && w.sent.filter((s) => s.url === 'https://api.tavily.com/search').length === 2 && /Tavily is at its monthly cap \(2\)/.test(out), out);
  check('…and a new month starts the count again', counts(cfg, Date.UTC(2099, 0, 5)).used.tavily === undefined);
}
{
  const leak = 'secret-key-abc123';
  const cfg = cfgWith({ use: { brave: true }, order: ['brave'] }, { brave: leak });
  const get = async (url) => { if (url.startsWith('https://api.search.brave.com/')) throw new Error(`bad token ${leak}`); return resp(202, DDG_BLOCK); };
  const out = await webSearch({ query: 'q' }, { cfg, get, key: noSaved });
  check('an error that repeats the key never shows it', !out.includes(leak) && /Brave Search bad token/.test(out), out);
}

// ---------- Test (Settings) ----------
{
  const cfg = cfgWith({ use: { tavily: true }, caps: { tavily: 1 } }, { tavily: 't-test' });
  const w = net();
  const t = await testService(cfg, 'tavily', { get: w.get, key: noSaved });
  check('Test runs one real search with the key and says it works', t.ok && /It works: Tavily answered with 1 result/.test(t.says) && counts(cfg).used.tavily === 1, JSON.stringify(t));
  const again = await testService(cfg, 'tavily', { get: w.get, key: noSaved });
  check('…a test counts, so at the cap it says so instead', !again.ok && /monthly cap \(1\)/.test(again.says));
  check('…with no key it asks for one', /Paste a Brave Search key first/.test((await testService(cfgWith({}), 'brave', { get: w.get, key: noSaved })).says));
  const bad = await testService(cfgWith({}, { brave: 'b-test' }), 'brave', { get: async () => resp(401, {}, true), key: noSaved });
  check('…a wrong key says check it', !bad.ok && /answered 401\. Check the key\./.test(bad.says));
}

// ---------- settings ----------
{
  const c = cleanSearchBackup({ use: { tavily: 'yes', brave: true, nope: true }, order: ['tavily', 'nope', 'tavily'], caps: { brave: -3, mojeek: 5e9, tavily: '50' }, keys: { tavily: 'x' } });
  check('settings tidy: every service off unless true, known services only, every service listed', c.use.tavily === false && c.use.brave === true && !('nope' in c.use) && Object.keys(c.use).length === ORDER.length && c.order[0] === 'tavily' && c.order.length === ORDER.length && !c.order.includes('nope'));
  check('every service starts off', Object.values(cleanSearchBackup(undefined).use).every((x) => x === false));
  check('…caps are whole numbers in range, the free amount by default', c.caps.brave === SERVICES.brave.free && c.caps.mojeek === 100000 && c.caps.tavily === 50 && c.caps.marginalia === 1000);
  check('…and a key handed in is never kept in the settings', !('keys' in c));
  const merged = mergeSettings({}, { searchBackup: { use: { tavily: true }, keys: { tavily: 'x' } } });
  check('saving settings drops a key too', merged.searchBackup.use.tavily === true && !('keys' in merged.searchBackup), JSON.stringify(merged.searchBackup));
  check('it is a setting Bob saves', SETTING_KEYS.includes('searchBackup') && SETTING_KEYS.at(-1) === 'apuHoldbackGB');
  const v = searchBackupView(cfgWith({ use: { tavily: true } }, { tavily: 't-test' }), Date.now(), { key: noSaved });
  check('Settings sees "key saved" and the switch, never the key', v.services.find((s) => s.id === 'tavily').hasKey === true && v.services.find((s) => s.id === 'tavily').on === true && v.services.find((s) => s.id === 'brave').hasKey === false && !JSON.stringify(v).includes('t-test'));
  check('no key ships with Bob', ORDER.every((id) => !keyFor({}, id, { key: noSaved })) && !/tvly-[A-Za-z0-9]{8}|BSA[A-Za-z0-9]{20}/.test(read('src/web-search.js')));
  check('a key handed in for a run (the Lab kit) wins, else the saved one', keyFor({ searchBackup: { keys: { tavily: 'run' } } }, 'tavily', { key: () => 'saved' }) === 'run' && keyFor({}, 'tavily', { key: () => 'saved' }) === 'saved');
}
{
  const help = read('public/help-content.js'), cellar = read('public/cellar.js'), ui = read('public/search-backup.js'), routes = read('src/search-backup-routes.js');
  check('Help: a page, an FAQ and a glossary entry', /id: 'settings-search'/.test(help) && /id: 'faq-search-blocked'/.test(help) && /<dt>Backup search<\/dt>/.test(help));
  check('…with the platforms', /Works on Windows, Mac and Linux\. The Android app doesn't have it yet\./.test(help));
  const map = read('public/settings-map.js');
  check('its own Settings page, Search API keys, in the map under Connections', /\['search', '🔎 Search API keys'/.test(cellar) && /mountSearchBackup\(dlg\.querySelector\('\.search-backup-box'\)\)/.test(cellar) && /\['Connections', \[[^\]]*'adv-search'/.test(map) && /topics: \['adv-online', 'adv-search'/.test(map));
  check('each service has its switch, sign-up link, key box, Test, cap and count', /data-sb-use/.test(ui) && /Get a key<\/a>/.test(ui) && /data-sb-test/.test(ui) && /data-sb-cap/.test(ui) && /used this month/.test(ui));
  check('the key box is a password box', /type="password"[^>]*data-sb-keybox/.test(ui));
  check('the route is for this computer only and logs no key', /if \(!isLocal\) return send\(res, 403/.test(routes) && /log\('settings', `\$\{SERVICES\[id\]\.name\} key \$\{v \? 'saved \(locked\)' : 'removed'\}`\)/.test(routes));
  check('web_search uses it', /webSearch\(\{ query, when \}, \{ cfg, signal, get: /.test(read('src/tools.js')));
  check('backups carry the search keys (locked)', ['MARGINALIA_API_KEY', 'BRAVE_SEARCH_API_KEY', 'MOJEEK_API_KEY', 'TAVILY_API_KEY'].every((k) => read('src/backup.js').includes(`'${k}'`)));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
