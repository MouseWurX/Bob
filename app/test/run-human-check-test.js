// "Let me finish robot checks" (Nov 18, src/human-check.js): a check a person can finish goes to the person at this
// computer on a card, opens in Bob's window for them, and Bob carries on once it's gone. He never does it himself.
// Every fetch, card and browser window here is a fake: nothing goes online, nothing opens.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanPrivateWeb } from '../src/private-web.js';
import { whyNot, handOver, personHere, finishedHere, forgetJobs, PERSON_KINDS, MAX_ASKS } from '../src/human-check.js';
import { buildTools } from '../src/tools.js';
import { browserTools, ROBOT_CHECK_LINE } from '../src/hands-browser.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-humancheck-'));

const CHECK_PAGE = '<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>';
const LONG = 'The river rose two metres overnight and the town opened its shelters. '.repeat(8);
const PAGE = `<html><body><article><p>${LONG}</p></article></body></html>`;

// A fake window: shows the check until `solveAfter` looks, then the page. Records everything Bob asked of it.
function fakeWindow({ solveAfter = 2, closeAfter = Infinity, page = PAGE } = {}) {
  const w = { opened: [], looks: 0, acted: [], focused: 0, privacy: null, open: true };
  w.driver = {
    setPrivacy: (p) => { w.privacy = p; },
    async open(url) { w.opened.push(url); w.open = true; return { url, title: 't' }; },
    focus() { w.focused++; },
    isOpen: () => w.open && w.looks < closeAfter,
    async html() { w.looks++; return w.looks > solveAfter ? page : CHECK_PAGE; },
    async snapshot() { return { url: w.opened.at(-1), title: 't', text: w.looks > solveAfter ? LONG : 'Just a moment', items: [{ n: 1, role: 'checkbox', name: 'I am human' }] }; },
    async act(a) { w.acted.push(a); return { did: 'clicked' }; },
    close() { w.open = false; }
  };
  return w;
}
// A fake brain: answers the card with `answer` (true, false, or 'never' = no answer until the card's wait ends).
function fakeBrain(answer = true) {
  const b = { cards: [], logs: [] };
  b.approve = (need, emit, signal) => { b.cards.push(need); if (answer !== 'never') return Promise.resolve(answer); return new Promise((r) => signal.addEventListener('abort', () => r(false), { once: true })); };
  b.log = (k, t) => b.logs.push(`${k}: ${t}`);
  return b;
}
const cfgWith = (pw) => ({ agentDir: tmp, innDir: tmp, dataDir: tmp, settingsFile: path.join(tmp, 's.json'), readRoots: [], readOnlyRoots: [], userName: 'Sam', projects: {}, webSearch: true, timeZone: 'UTC', privateWeb: pw });
const ctxFor = (brain, id, more = {}) => { const said = []; return { said, ctx: { brain, emit: (e) => said.push(e), signal: new AbortController().signal, job: { id }, sessionId: 'chat-1', ...more } }; };
const fast = { pollMs: 1, wait: async () => {} };

// ---------- the setting ----------
check('off to start', cleanPrivateWeb(undefined).humanCheck === false && cleanPrivateWeb({ humanCheck: 'yes' }).humanCheck === false && cleanPrivateWeb({ humanCheck: true }).humanCheck === true);
check('only checks a person can finish go over, never a flat block or "too many visits"', PERSON_KINDS.includes('a robot check') && PERSON_KINDS.includes('a Cloudflare check') && !PERSON_KINDS.includes('a block (403)') && !PERSON_KINDS.includes('too many visits (429)'));

// ---------- who gets asked ----------
{
  const brain = fakeBrain();
  const ok = { brain, emit: () => {}, sessionId: 'chat-1' };
  check('the person in Bob\'s own chat can be asked', personHere(ok));
  check('…never Discord, Telegram, a guest, another app, a rental, the Lab or a scheduled job', [
    { ...ok, sessionId: 'discord-123' }, { ...ok, sessionId: 'discord-dm' }, { ...ok, sessionId: 'telegram' }, { ...ok, sessionId: 'guest-abc' },
    { ...ok, via: 'Claude Code' }, { ...ok, job: { guest: { from: 'Discord' } } }, { ...ok, job: { rent: true } }, { ...ok, lab: true }, { ...ok, job: { scheduled: true } }
  ].every((c) => !personHere(c)));
  const w = fakeWindow();
  const cfg = cfgWith({ humanCheck: true });
  check('the switch off: nothing is handed over', whyNot(cfgWith({}), ok, 'a robot check', 'https://a.example/', { driver: w.driver }) === 'the switch is off');
  check('no browser window (Android, the brain on its own): nothing is handed over', whyNot(cfg, ok, 'a robot check', 'https://a.example/', { driver: null }) === 'no browser window here');
  check('a 403 is skipped, not handed over', whyNot(cfg, ok, 'a block (403)', 'https://a.example/', { driver: w.driver }) === 'not a check a person can finish');
}

// ---------- the hand-over itself ----------
{
  forgetJobs();
  const w = fakeWindow({ solveAfter: 2 });
  const brain = fakeBrain(true);
  const { ctx, said } = ctxFor(brain, 'h1');
  const cfg = cfgWith({ humanCheck: true, on: true });
  const got = await handOver(cfg, ctx, { url: 'https://checked.example/page', why: 'a Cloudflare check', driver: w.driver, ...fast });
  check('a card asks first, naming the site and the check', brain.cards.length === 1 && /checked\.example wants a person to finish a Cloudflare check/.test(brain.cards[0].text) && brain.cards[0].button === 'Open it');
  check('…then the page opens in Bob\'s window, in front, in Private web\'s profile', w.opened[0] === 'https://checked.example/page' && w.focused === 1 && w.privacy?.on === true);
  check('…Bob says it is open and that he is not touching it', said.some((e) => e.type === 'announce' && /Finish the check there/.test(e.text) && /not touching it/.test(e.text)));
  check('…he waits until the check is gone, then reads the page', got.text === LONG && /<article>/.test(got.html) && w.looks === 3);
  check('…and never clicks, types or presses anything on it', w.acted.length === 0);
  check('the site counts as finished for the rest of the job', finishedHere(ctx, 'https://checked.example/other'));
}
{
  forgetJobs();
  const w = fakeWindow();
  const brain = fakeBrain(false);
  const { ctx } = ctxFor(brain, 'h2');
  const got = await handOver(cfgWith({ humanCheck: true }), ctx, { url: 'https://checked.example/', why: 'a robot check', driver: w.driver, ...fast });
  check('No on the card: nothing opens, and the site is skipped', got.skipped === 'you said no on the card' && w.opened.length === 0);
}
{
  forgetJobs();
  const w = fakeWindow();
  const brain = fakeBrain('never');
  const { ctx } = ctxFor(brain, 'h3');
  const got = await handOver(cfgWith({ humanCheck: true }), ctx, { url: 'https://checked.example/', why: 'a robot check', driver: w.driver, askMs: 5, ...fast });
  check('no answer on the card: it stops waiting on its own and skips', got.skipped === 'nobody answered the card' && w.opened.length === 0);
}
{
  forgetJobs();
  const w = fakeWindow({ solveAfter: Infinity });
  const { ctx } = ctxFor(fakeBrain(true), 'h4');
  let t = 0;
  const got = await handOver(cfgWith({ humanCheck: true }), ctx, { url: 'https://checked.example/', why: 'a robot check', driver: w.driver, waitMs: 10, pollMs: 1, wait: async () => {}, now: () => (t += 3) });
  check('not finished in time: he skips it (and never touches the check)', /wasn't finished/.test(got.skipped || '') && w.acted.length === 0);
}
{
  forgetJobs();
  const w = fakeWindow({ solveAfter: Infinity, closeAfter: 1 });
  const { ctx } = ctxFor(fakeBrain(true), 'h5');
  const got = await handOver(cfgWith({ humanCheck: true }), ctx, { url: 'https://checked.example/', why: 'a robot check', driver: w.driver, ...fast });
  check('closing the window means skip it', got.skipped === 'the browser window was closed');
}
{
  forgetJobs();
  const w = fakeWindow();
  const brain = fakeBrain(false);
  const { ctx } = ctxFor(brain, 'h6');
  const cfg = cfgWith({ humanCheck: true });
  await handOver(cfg, ctx, { url: 'https://one.example/', why: 'a robot check', driver: w.driver, ...fast });
  check('one card a site a job', whyNot(cfg, ctx, 'a robot check', 'https://one.example/x', { driver: w.driver }) === 'already handed over in this job');
  for (const s of ['two', 'three']) await handOver(cfg, ctx, { url: `https://${s}.example/`, why: 'a robot check', driver: w.driver, ...fast });
  check(`at most ${MAX_ASKS} cards a job`, /already 3 this job/.test(whyNot(cfg, ctx, 'a robot check', 'https://four.example/', { driver: w.driver })));
}

// ---------- fetch_page and web_search ----------
const realFetch = globalThis.fetch, realBrowser = globalThis.bobBrowser;
function net() {
  const seen = [];
  globalThis.fetch = async (u) => {
    const url = String(u); seen.push(url);
    if (url.startsWith('https://checked.example/')) return new Response(CHECK_PAGE, { status: 403, headers: { 'content-type': 'text/html' } });
    if (url.startsWith('https://html.duckduckgo.com/')) return new Response('<html>anomaly-modal challenge</html>', { status: 202, headers: { 'content-type': 'text/html' } });
    if (url.startsWith('https://www.mojeek.com/')) return new Response('<html><title>Captcha</title></html>', { status: 403, headers: { 'content-type': 'text/html' } });
    return new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } });
  };
  return seen;
}
{
  forgetJobs();
  net();
  const w = fakeWindow({ solveAfter: 1 });
  globalThis.bobBrowser = w.driver;
  const brain = fakeBrain(true);
  const tools = buildTools(cfgWith({ humanCheck: true, otherSources: false }));
  const { ctx } = ctxFor(brain, 'f1');
  const out = await tools.fetch_page.run({ url: 'https://checked.example/flood' }, ctx);
  check('fetch_page: the check goes to you, and Bob reads the page after', /you did, so here is the page/.test(out) && out.includes('The river rose'), out.slice(0, 200));
  const looked = brain.cards.length;
  const again = await tools.fetch_page.run({ url: 'https://checked.example/other-page' }, ctx);
  check('…the same site later in the job: read through the same window, no second card', brain.cards.length === looked && /Read through my browser window/.test(again));
}
{
  forgetJobs();
  net();
  const w = fakeWindow();
  globalThis.bobBrowser = w.driver;
  const brain = fakeBrain(true);
  const out = await buildTools(cfgWith({ otherSources: false })).fetch_page.run({ url: 'https://checked.example/flood' }, ctxFor(brain, 'f2').ctx);
  check('fetch_page with the switch off: no card, no window, skipped as before', brain.cards.length === 0 && w.opened.length === 0 && /turned me away/.test(out));
}
{
  forgetJobs();
  net();
  const w = fakeWindow();
  globalThis.bobBrowser = w.driver;
  const brain = fakeBrain(true);
  const out = await buildTools(cfgWith({ humanCheck: true, otherSources: false })).fetch_page.run({ url: 'https://checked.example/flood' }, ctxFor(brain, 'f3', { sessionId: 'discord-42' }).ctx);
  check('fetch_page for Discord: never handed over, skipped', brain.cards.length === 0 && w.opened.length === 0 && /turned me away/.test(out));
}
{
  forgetJobs();
  net();
  const ddg = '<html><body><a rel="nofollow" class="result__a" href="https://river.example/a">River news</a> <a class="result__snippet">The river rose.</a></body></html>';
  const w = fakeWindow({ solveAfter: 1, page: ddg });
  globalThis.bobBrowser = w.driver;
  const brain = fakeBrain(true);
  const tools = buildTools(cfgWith({ humanCheck: true }));
  const { ctx } = ctxFor(brain, 's1');
  const out = await tools.web_search.run({ query: 'river flood' }, ctx);
  check('web_search: both search pages blocked, so the first one\'s check goes to you, then the results', brain.cards.length === 1 && /DuckDuckGo asked for a person to finish its robot check, and you did/.test(out) && out.includes('https://river.example/a'), out.slice(0, 300));
  check('…the search words only go to the search page itself', w.opened[0].startsWith('https://html.duckduckgo.com/html/?q=river%20flood'));
  const again = await tools.web_search.run({ query: 'river levels' }, ctx);
  check('…a second search in the job reads through the same window, no second card', brain.cards.length === 1 && again.includes('https://river.example/a'));
}
{
  forgetJobs();
  net();
  const w = fakeWindow();
  globalThis.bobBrowser = w.driver;
  const brain = fakeBrain(false);
  const out = await buildTools(cfgWith({ humanCheck: true })).web_search.run({ query: 'river flood' }, ctxFor(brain, 's2').ctx);
  check('web_search: No on the card says so, and still never gets round the check', /I didn't hand you the check: you said no on the card/.test(out) && /I don't get round those/.test(out) && w.opened.length === 0);
}

// ---------- Bob's own browser never does a check ----------
{
  const w = fakeWindow({ solveAfter: Infinity });
  const brain = { cfg: cfgWith({}), log: () => {} };
  brain.cfg.hands = { enabled: true, browser: { on: true } };
  const t = browserTools(brain, { driver: w.driver });
  await t.browser_read.run({}, { emit: () => {} }).catch(() => {});
  const err = await t.browser_act.check({ action: 'click', n: 1 }, {}).then(() => null, (e) => e);
  check('browser_act on a robot check: refused, whatever the brain asks', err && err.message === ROBOT_CHECK_LINE && w.acted.length === 0, err?.message);
  const scroll = await t.browser_act.check({ action: 'scroll' }, {}).then(() => 'ok', (e) => e.message);
  check('…scrolling and reading still work', scroll === 'ok', scroll);
}
globalThis.fetch = realFetch;
if (realBrowser) globalThis.bobBrowser = realBrowser; else delete globalThis.bobBrowser;

// ---------- Settings, Help and words ----------
{
  const ui = read('public/private-web.js');
  check('Settings: a "Let me finish robot checks" switch on the Private web panel, described for screen readers', /data-pw-human/.test(ui) && /Let me finish robot checks/.test(ui) && /aria-describedby="pw-human-help"/.test(ui));
  const help = read('public/help-content.js');
  check('Help, the FAQ and a glossary entry in Bob\'s voice', /<strong>Let me finish robot checks<\/strong> \(off to start/.test(help) && /id: 'faq-finish-check'/.test(help) && /<dt>Robot check \(captcha\)<\/dt>/.test(help));
  check('the window says it never acts on a check', /Bob never acts on a check/.test(read('electron/browser-window.cjs')));
  check('Settings search finds it', /captcha robot check/.test(read('public/settings-map.js')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
