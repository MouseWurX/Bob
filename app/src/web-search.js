// web_search (tools.js) and its backup search with a key (Nov 16 2026; off unless you turn it on).
//
// The free pages come first, as before: DuckDuckGo's plain page, then Mojeek's. Some days a search page turns a
// computer away with a robot check (DuckDuckGo's "anomaly" page, answered with HTTP 202; Mojeek's "Captcha" page).
// Bob never tries to get round those. He says the pages are blocking this computer, and, when you've set up a
// service in Settings, Connections, "Search API keys" (each one off until you turn it on, with your own key: Bob
// ships none), asks it instead and says which one answered.
//
// Services, in the order Settings shows them (privacy first, then free amount):
//   Marginalia (free for non-commercial use, key by email), Brave Search API (about 1,000 a month on its $5 credit,
//   needs a card, asks for public credit), Mojeek API (a free start, then pay as you go, card needed), Tavily (1,000 a
//   month free, no card; the Lab uses it for lesson runs), Firecrawl (keyless: no key and no sign-up, a small daily
//   allowance per internet address that Firecrawl doesn't publish, so Bob keeps to 50 a day and 1,500 a month, and a
//   429 or limit answer rests it for the rest of the day; never retried another way).
// Only the search words and the "when" filter go to the service: never your name, a path or a file.
// Each service has a monthly count with a cap (its free amount unless you raise it). At the cap Bob stops asking it
// and says so, so a card is never charged unless you raise the cap yourself.
// Keys are kept with Bob's other keys (secret-box.js, locked), never shown, logged or sent anywhere else.
import fs from 'node:fs';
import path from 'node:path';
import { parseDdg, parseMojeek, resultLines } from './page-text.js';
import { keyValue } from './secret-box.js';

export const SERVICES = {
  marginalia: { name: 'Marginalia', key: 'MARGINALIA_API_KEY', free: 1000, dates: false, signup: 'https://about.marginalia-search.com/article/api/', note: 'Free for non-commercial use: ask for a key by email. Small independent index, no tracking.' },
  brave: { name: 'Brave Search', key: 'BRAVE_SEARCH_API_KEY', free: 1000, dates: true, signup: 'https://brave.com/search/api/', note: 'About 1,000 searches a month on its free $5 credit. Needs a card, and asks for public credit to Brave.' },
  mojeek: { name: 'Mojeek', key: 'MOJEEK_API_KEY', free: 1000, dates: true, signup: 'https://www.mojeek.com/services/search/web-search-api/', note: 'Its own index, no tracking. A free start, then about £2 per 1,000. Needs a card.' },
  tavily: { name: 'Tavily', key: 'TAVILY_API_KEY', free: 1000, dates: true, signup: 'https://www.tavily.com/', note: '1,000 a month free, no card. Made for AI agents; the Lab uses it for lesson runs.' },
  firecrawl: { name: 'Firecrawl', key: '', keyless: true, free: 1500, perDay: 50, dates: true, signup: 'https://www.firecrawl.dev/', note: 'No key needed: a small free allowance each day for this internet address. I keep to 50 a day, and stop for the day if it says no.' }
};
export const ORDER = ['marginalia', 'brave', 'mojeek', 'tavily', 'firecrawl'];
export const MAX_CAP = 100000;
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Bob/0.1' };
const DDG_DATE = { day: 'd', week: 'w', month: 'm', year: 'y' };
const BRAVE_DATE = { day: 'pd', week: 'pw', month: 'pm', year: 'py' };
const FIRECRAWL_DATE = { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m', year: 'qdr:y' };

// Settings, tidied: { use, order, caps }. use: which services are switched on (all off to start). A key never lives
// here (keys.json, secret-box.js). cfg.searchBackup.keys is the Lab kit's way in for a run (model-lab/bob-kit.mjs
// sets use and keys from its own locked file); it is never saved.
export function cleanSearchBackup(x) {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const use = {};
  for (const k of ORDER) use[k] = o.use?.[k] === true;
  const order = [...new Set([].concat(o.order || []).filter((k) => ORDER.includes(k)))];
  for (const k of ORDER) if (!order.includes(k)) order.push(k);
  const caps = {};
  for (const k of ORDER) { const n = Math.round(Number(o.caps?.[k])); caps[k] = Number.isFinite(n) && n >= 0 ? Math.min(MAX_CAP, n) : SERVICES[k].free; }
  return { use, order, caps };
}
export const backupOn = (cfg) => ORDER.some((k) => cfg?.searchBackup?.use?.[k] === true);
// The key for a service: one handed in for this run (the Lab), else the saved key (or the environment), else ''.
// A keyless service (Firecrawl) has no key: it answers 'keyless' so it counts as ready.
export function keyFor(cfg, id, { key = keyValue } = {}) {
  if (SERVICES[id]?.keyless) return 'keyless';
  const given = cfg?.searchBackup?.keys?.[id];
  if (typeof given === 'string' && given.trim()) return given.trim();
  try { return String(key(SERVICES[id].key) || '').trim(); } catch { return ''; }
}

// ---------- the monthly count ----------
const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const countFile = (cfg) => (cfg?.dataDir ? path.join(cfg.dataDir, 'search-backup-count.json') : '');
export function counts(cfg, now = Date.now()) {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(countFile(cfg), 'utf8')); } catch {}
  const ok = c && c.month === monthOf(now) && c.used && typeof c.used === 'object';
  const out = ok ? c : { month: monthOf(now), used: {} };
  // The day's count and rest (for services with a daily allowance) start again each day.
  if (out.day !== dayOf(now) || !out.today || typeof out.today !== 'object') { out.day = dayOf(now); out.today = {}; out.resting = {}; }
  if (!out.resting || typeof out.resting !== 'object') out.resting = {};
  return out;
}
function saveCounts(cfg, c) {
  const f = countFile(cfg);
  if (f) { try { fs.writeFileSync(f, JSON.stringify(c)); } catch {} }
}
function countOne(cfg, id, now) {
  const c = counts(cfg, now);
  c.used[id] = (Number(c.used[id]) || 0) + 1;
  c.today[id] = (Number(c.today[id]) || 0) + 1;
  saveCounts(cfg, c);
  return c.used[id];
}
// A service that said "too many" (429 or a limit answer) rests until tomorrow. Bob never tries it another way.
function restToday(cfg, id, now) { const c = counts(cfg, now); c.resting[id] = true; saveCounts(cfg, c); }
// Why a service can't be asked now ('' when it can): at its monthly cap, at its daily allowance, or resting.
function heldBack(cfg, s, id, now) {
  const c = counts(cfg, now);
  if ((Number(c.used[id]) || 0) >= s.caps[id]) return `${SERVICES[id].name} is at its monthly cap (${s.caps[id]})`;
  if (c.resting[id]) return `${SERVICES[id].name} said it had enough for today`;
  if (SERVICES[id].perDay && (Number(c.today[id]) || 0) >= SERVICES[id].perDay) return `${SERVICES[id].name} is at its ${SERVICES[id].perDay} a day`;
  return '';
}

// ---------- block pages ----------
// DuckDuckGo's robot check: HTTP 202 and its anomaly page. Mojeek's: a page titled Captcha. A 403 or 429 counts too.
export function blockedPage(status, html = '') {
  const h = String(html || '').slice(0, 20000);
  if (status === 403 || status === 429) return true;
  if (status === 202 && /anomaly/i.test(h)) return true;
  return /anomaly-modal|bots use DuckDuckGo too|<title>[^<]*captcha[^<]*<\/title>/i.test(h);
}

// ---------- the services ----------
// get(url, opts): a fetch (tools.js fetchRetry, or the tests' fake). Each returns [{ title, url, snippet }].
const short = (s, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const listOf = (arr, map, max) => [].concat(arr || []).map(map).filter((r) => /^https?:\/\//.test(r.url)).slice(0, max);
export const ASK = {
  async marginalia(get, { query, key, max }) {
    const r = await get(`https://api2.marginalia-search.com/search?query=${encodeURIComponent(query)}&count=${max}`, { headers: { 'API-Key': key, accept: 'application/json' } });
    if (!r.ok) throw new Error(`answered ${r.status}`);
    const j = await r.json();
    return listOf(j?.results, (x) => ({ title: short(x?.title, 200), url: String(x?.url || ''), snippet: short(x?.description) }), max);
  },
  async brave(get, { query, when, key, max }) {
    const r = await get(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}${BRAVE_DATE[when] ? `&freshness=${BRAVE_DATE[when]}` : ''}`, { headers: { 'X-Subscription-Token': key, accept: 'application/json' } });
    if (!r.ok) throw new Error(`answered ${r.status}`);
    const j = await r.json();
    const bare = (t) => String(t || '').replace(/<[^>]+>/g, ''); // Brave marks the matching words in bold
    return listOf(j?.web?.results, (x) => ({ title: short(bare(x?.title), 200), url: String(x?.url || ''), snippet: short(bare(x?.description)) }), max);
  },
  async mojeek(get, { query, when, key, max }) {
    const since = { day: 'day', month: 'month', year: 'year' }[when];
    const r = await get(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}&fmt=json&t=${max}&api_key=${encodeURIComponent(key)}${since ? `&since=${since}` : ''}`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`answered ${r.status}`);
    const j = await r.json();
    if (j?.response?.status && j.response.status !== 'OK') throw new Error(short(j.response.status, 120));
    return listOf(j?.response?.results, (x) => ({ title: short(x?.title, 200), url: String(x?.url || ''), snippet: short(x?.desc) }), max);
  },
  async tavily(get, { query, when, key, max }) {
    const r = await get('https://api.tavily.com/search', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ query, max_results: max, search_depth: 'basic', ...(when ? { time_range: when } : {}) }) });
    if (!r.ok) throw new Error(`answered ${r.status}`);
    const j = await r.json();
    return listOf(j?.results, (x) => ({ title: short(x?.title, 200), url: String(x?.url || ''), snippet: short(x?.content) }), max);
  },
  // Firecrawl's keyless search: only the words (and the date filter) go out. No key, no cookie, no referrer.
  async firecrawl(get, { query, when, max }) {
    const r = await get('https://api.firecrawl.dev/v2/search', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, referrerPolicy: 'no-referrer', credentials: 'omit', once: true, body: JSON.stringify({ query, limit: max, ...(FIRECRAWL_DATE[when] ? { tbs: FIRECRAWL_DATE[when] } : {}) }) });
    const j = await r.json().catch(() => null);
    if (r.status === 429 || (!r.ok && /limit|quota|too many/i.test(String(j?.error || '')))) { const e = new Error('said it had enough for today'); e.limit = true; throw e; }
    if (!r.ok) throw new Error(`answered ${r.status}`);
    if (j && j.success === false) { const e = new Error(short(j.error || 'said no', 120)); e.limit = /limit|quota|too many/i.test(String(j.error || '')); throw e; }
    const web = Array.isArray(j?.data) ? j.data : j?.data?.web;
    return listOf(web, (x) => ({ title: short(x?.title || x?.metadata?.title, 200), url: String(x?.url || ''), snippet: short(x?.description || x?.metadata?.description) }), max);
  }
};

// A key, a status or a long answer never goes in what Bob says back.
const plainErr = (e, key) => short(String(e?.message || e).split(key || '\u0000').join('…'), 120);

// ---------- web_search ----------
// get(url, opts) does the fetching. Returns the text web_search gives the brain.
export async function webSearch({ query, when }, { cfg = {}, get, signal, now = Date.now, key } = {}) {
  const w = String(when || '').toLowerCase();
  const df = DDG_DATE[w];
  const q = String(query || '').trim();
  if (!q) return 'Give me some words to search for.';
  let list = [], why = '', blocked = [];
  try {
    const res = await get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q) + (df ? `&df=${df}` : ''), { headers: UA });
    const html = res.status === 200 || res.status === 202 || res.status === 403 || res.status === 429 ? await res.text().catch(() => '') : '';
    if (blockedPage(res.status, html)) { blocked.push('DuckDuckGo'); why = 'DuckDuckGo showed its robot check'; }
    else if (res.ok) list = parseDdg(html); else why = `DuckDuckGo answered ${res.status}`;
  } catch (e) { if (signal?.aborted) throw e; why = e.name === 'TimeoutError' ? 'DuckDuckGo took too long' : `DuckDuckGo: ${e.message}`; }
  if (list.length) return resultLines(list);
  try {
    const res = await get('https://www.mojeek.com/search?q=' + encodeURIComponent(q), { headers: UA });
    const html = await res.text().catch(() => '');
    if (blockedPage(res.status, html)) blocked.push('Mojeek');
    else if (res.ok) list = parseMojeek(html);
  } catch (e) { if (signal?.aborted) throw e; }
  if (list.length) return `(From Mojeek: ${why || 'DuckDuckGo found nothing'}${df ? '; no date filter there' : ''}.)\n${resultLines(list)}`;

  // The backup with a key, only when it's on: the services in your order that have a key and are under their cap.
  const tried = [];
  if (backupOn(cfg)) {
    const s = cleanSearchBackup(cfg.searchBackup);
    for (const id of s.order) {
      if (!s.use[id]) continue;
      const k = keyFor(cfg, id, key ? { key } : {});
      if (!k) continue;
      const held = heldBack(cfg, s, id, now());
      if (held) { tried.push(held); continue; }
      countOne(cfg, id, now()); // counted when asked, whatever comes back: that's how the services count too
      try {
        const got = await ASK[id](get, { query: q, when: w, key: k, max: 8 });
        if (got.length) {
          const lead = blocked.length ? `the search pages are blocking this computer (${blocked.join(', ')})` : why || 'the free search pages found nothing';
          return `(From ${SERVICES[id].name}, the backup search${SERVICES[id].keyless ? ' (no key)' : ' with your key'}: ${lead}${w && !SERVICES[id].dates ? '; no date filter there' : ''}.)\n${resultLines(got)}`;
        }
        tried.push(`${SERVICES[id].name} found nothing`);
      } catch (e) { if (signal?.aborted) throw e; if (e?.limit) restToday(cfg, id, now()); tried.push(`${SERVICES[id].name} ${plainErr(e, k)}`); }
    }
  }
  if (blocked.length) {
    const backup = backupOn(cfg)
      ? (tried.length ? ` The backup search didn't help: ${tried.join('; ')}.` : ' The search service you turned on has no key yet: Settings, Connections, Search API keys.')
      : ' A search service with your own key can stand in: Settings, Connections, Search API keys (each off unless you turn it on).';
    return `The search pages are blocking this computer right now (${blocked.join(' and ')} showed a robot check). I don't get round those.${backup} fetch_page still works for a link you already have.`;
  }
  return `No results (or the search pages changed). Try different words.${tried.length ? ` The backup search: ${tried.join('; ')}.` : ''}`;
}

// What Settings shows: never a key, only whether one is there, the count and the cap.
export function searchBackupView(cfg, now = Date.now(), { key } = {}) {
  const s = cleanSearchBackup(cfg?.searchBackup);
  const c = counts(cfg, now);
  return { order: s.order, month: c.month, services: s.order.map((id) => ({ id, name: SERVICES[id].name, note: SERVICES[id].note, signup: SERVICES[id].signup, free: SERVICES[id].free, on: s.use[id], cap: s.caps[id], used: Number(c.used[id]) || 0, today: Number(c.today[id]) || 0, perDay: SERVICES[id].perDay || 0, resting: Boolean(c.resting[id]), keyless: Boolean(SERVICES[id].keyless), hasKey: Boolean(keyFor(cfg, id, key ? { key } : {})) })) };
}

// Test (Settings): one real search with that service's key, counted like any other. { ok, says }.
export async function testService(cfg, id, { get, now = Date.now, key } = {}) {
  if (!SERVICES[id]) return { ok: false, says: 'No such service.' };
  const k = keyFor(cfg, id, key ? { key } : {});
  if (!k) return { ok: false, says: `Paste a ${SERVICES[id].name} key first.` };
  const s = cleanSearchBackup(cfg?.searchBackup);
  const held = heldBack(cfg, s, id, now());
  if (held) return { ok: false, says: `${held}. ${/monthly cap/.test(held) ? 'Raise the cap to test it.' : 'Try again tomorrow.'}` };
  countOne(cfg, id, now());
  try {
    const got = await ASK[id](get, { query: 'Bob test search', when: '', key: k, max: 3 });
    return got.length ? { ok: true, says: `It works: ${SERVICES[id].name} answered with ${got.length} result${got.length === 1 ? '' : 's'}, the first "${short(got[0].title, 60)}".` } : { ok: true, says: `${SERVICES[id].name} answered, with no results for the test words.${SERVICES[id].keyless ? '' : ' The key works.'}` };
  } catch (e) { if (e?.limit) restToday(cfg, id, now()); return { ok: false, says: `${SERVICES[id].name} ${plainErr(e, k)}.${SERVICES[id].keyless ? '' : ' Check the key.'}` }; }
}
