// Facts first (src/facts-first.js) and the free search pages' manners (src/web-search.js), 16 Nov 2026.
// The owner's go after the 800-job read: Bob stated small facts from memory (free-plan limits, authors, causes, dates)
// that no search backed, skipped files he was given, and asked before looking in Documents. Bob's loop now makes him
// note what he remembers, look it up, answer from the source and say where the two differ; read what he was given
// first; spread side-by-side searches over the services the user set up; and keep to the free pages' manners.
// Whole jobs run through Bob's real loop with a scripted brain. Every fetch and search here is a fake: nothing goes
// online and nothing reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { askKind, localAsk, readFirstAsk, factsFirstFor, cleanFactsFirst, saysUnchecked, asksBack, UNCHECKED_CORRECTION } from '../src/facts-first.js';
import { webSearch, resetPacing, robotsAllows, pacing, FREE_PER_ANSWER, busy } from '../src/web-search.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + String(extra).slice(0, 700) : ''}`); };
const text = (m) => String(m?.content ?? '');
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bob facts first '));

// ---------- what kind of ask ----------
{
  const facts = ["What is Tavily's free plan limit?", 'Who wrote the book Dune?', 'When did Firefox 140 come out?', 'Why did the Tacoma Narrows bridge collapse?', 'Do you know who founded Mojeek?', 'How many searches does Brave give free each month?'];
  const not = ['hi there', 'thanks!', 'What do you think of my idea?', 'Write a poem about cats', 'Fix the bug in C:\\code\\app.js', 'What does notes.txt say about the meeting?', 'What is in my documents about taxes?', '2+2?', 'Why did you do that?', 'How do I bake bread?', 'Can you help me plan my week?'];
  check('questions of fact are seen as facts', facts.every((q) => askKind(q) === 'fact'), facts.filter((q) => askKind(q) !== 'fact').join(' | '));
  check('chat, making things, questions about Bob and about local files are not', not.every((q) => askKind(q) === ''), not.filter((q) => askKind(q)).join(' | '));
  check('a file named in the ask is "named"; "my documents" is "vague"; a plain question is neither', localAsk('Read C:\\Users\\you\\notes.txt')?.named && localAsk('Summarise report.docx')?.named && localAsk('what is in my documents about the pond')?.vague && localAsk('Who wrote Dune?') === null);
  check('making a new file isn\'t "given" a file to read first; reading or using one is', readFirstAsk('save my shopping list (oat milk, bread) to shopping.txt') === null && readFirstAsk('Write a note in todo.md') === null && readFirstAsk('Write a summary of report.docx')?.named && readFirstAsk('What does notes.txt say?')?.named);
  const cfgOf = (factsFirst) => ({ factsFirst });
  const at = (cfg, effort, q = 'Who wrote the book Dune?', searchReady = true) => factsFirstFor(cfg, { effort }, q, { searchReady });
  check('off by default (Nov 28: everything new starts off), at every level', !at({}, 'high') && !at({}, 'extreme') && !at({}, 'low') && !at({}, 'medium'));
  check('"Magnus and Maximus" turns it on there, not at Minimus or Medius', at(cfgOf('high'), 'high') && at(cfgOf('high'), 'extreme') && !at(cfgOf('high'), 'low') && !at(cfgOf('high'), 'medium'));
  check('"Every level" turns it on at Minimus and Medius too', at(cfgOf('all'), 'low') && at(cfgOf('all'), 'medium'));
  check('"Off" turns it off everywhere', !at(cfgOf('off'), 'high') && !at(cfgOf('off'), 'extreme'));
  check('only when a web search can run', !at({}, 'high', 'Who wrote the book Dune?', false));
  check('never for chat or a local file, nor for a guest or a side job', !at({}, 'high', 'hello Bob') && !at({}, 'high', 'What does notes.txt say?') && !factsFirstFor({}, { effort: 'high', guest: { from: 'x' } }, 'Who wrote Dune?', { searchReady: true }) && !factsFirstFor({}, { effort: 'high', side: true }, 'Who wrote Dune?', { searchReady: true }));
  check('the setting is tidied: anything odd is the default', cleanFactsFirst('nonsense') === 'off' && cleanFactsFirst('high') === 'high' && cleanFactsFirst('all') === 'all' && cleanFactsFirst('off') === 'off');
  check('settings Bob saves: Facts first and Read what you were given', SETTING_KEYS.includes('factsFirst') && SETTING_KEYS.includes('readFirst'));
  const m = mergeSettings({}, { factsFirst: 'wrong', readFirst: 'x' });
  check('...tidied when saved (an odd value is the default; read-first stays off unless true)', m.factsFirst === 'off' && m.readFirst === false && mergeSettings({}, { readFirst: true }).readFirst === true, JSON.stringify(m));
  check('an answer that already says it is unchecked is seen', saysUnchecked('This is from memory (not checked).') && !saysUnchecked('Tavily gives 1,000 a month.'));
  check('a question back is seen as one', asksBack('Which file do you mean?') && !asksBack('The file says 3.'));
}

// ---------- robots.txt ----------
{
  // The rules the real sites had on 16 Nov 2026 (read once by hand for this test): duckduckgo.com disallows /html,
  // html.duckduckgo.com allows everything, and www.mojeek.com disallows /search for every bot.
  check('html.duckduckgo.com: its search page is open', robotsAllows('User-agent: *\nAllow: /\n', '/html/?q=tall+tower'));
  check('duckduckgo.com: /html is closed', !robotsAllows('User-agent: *\nDisallow: /lite\nDisallow: /html\nDisallow: /*?\nAllow: /?*\n', '/html/?q=x'));
  check('www.mojeek.com: /search is closed', !robotsAllows('User-agent: *\nDisallow: /search\nDisallow: /url\n', '/search?q=x'));
  check('the longest rule wins, Allow wins a tie, $ ends the path', robotsAllows('User-agent: *\nDisallow: /a\nAllow: /a/b\n', '/a/b/c') && !robotsAllows('User-agent: *\nDisallow: /a\nAllow: /a/b\n', '/a/c') && robotsAllows('User-agent: *\nDisallow: /x\nAllow: /x\n', '/x') && !robotsAllows('User-agent: *\nDisallow: /*.pdf$\n', '/f.pdf') && robotsAllows('User-agent: *\nDisallow: /*.pdf$\n', '/f.pdf?x'));
  check('a group for Bob wins over *', robotsAllows('User-agent: *\nDisallow: /\n\nUser-agent: Bob\nAllow: /\n', '/search') && !robotsAllows('User-agent: *\nAllow: /\n\nUser-agent: bob\nDisallow: /search\n', '/search?q=1'));
  check('an empty Disallow allows all', robotsAllows('User-agent: *\nDisallow:\n', '/anything'));
}

// ---------- the free pages' manners ----------
const DDG_OK = '<a rel="nofollow" class="result__a" href="https://example.org/one">One</a> <a class="result__snippet" href="x">first hit</a>';
const DDG_BLOCK = '<html><body><div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div></body></html>';
const resp = (status, body, { json = false, headers = {} } = {}) => ({ status, ok: status >= 200 && status < 300, text: async () => (json ? JSON.stringify(body) : body), json: async () => body, headers: { get: (k) => headers[String(k).toLowerCase()] ?? null } });
function net({ ddg = () => resp(200, DDG_OK), mojRobots = 'User-agent: *\nDisallow: /search\n', ddgRobots = () => resp(200, 'User-agent: *\nAllow: /\n'), svcWait = 0 } = {}) {
  const sent = [];
  const get = async (url, opts = {}) => {
    sent.push(url);
    if (url === 'https://html.duckduckgo.com/robots.txt') return ddgRobots();
    if (url === 'https://www.mojeek.com/robots.txt') return resp(200, mojRobots);
    if (url.startsWith('https://html.duckduckgo.com/')) return ddg();
    if (url.startsWith('https://www.mojeek.com/search') && !/api_key=/.test(url)) return resp(200, '');
    if (svcWait) await new Promise((ok) => setTimeout(ok, svcWait)); // a service that takes a moment, so searches overlap
    if (url === 'https://api.tavily.com/search') return resp(200, { results: [{ url: 'https://t.example/a', title: 'Tav', content: 'from tavily' }] }, { json: true });
    if (url.startsWith('https://api.search.brave.com/')) return resp(200, { web: { results: [{ url: 'https://b.example/a', title: 'Brave', description: 'from brave' }] } }, { json: true });
    if (url === 'https://api.firecrawl.dev/v2/search') return resp(200, { success: true, data: { web: [{ url: 'https://f.example/a', title: 'Fire', description: 'from firecrawl' }] } }, { json: true });
    return resp(404, '');
  };
  return { get, sent };
}
let dn = 0;
const dataDir = () => fs.mkdtempSync(path.join(tmpRoot, `d${dn++}-`));
const noSaved = () => '';
{
  const waits = [];
  let clock = 1_000_000;
  resetPacing({ wait: async (ms) => { waits.push(ms); clock += ms; }, rand: () => 0.5 });
  const w = net();
  const turn = {};
  const now = () => clock;
  const a = await webSearch({ query: 'one' }, { cfg: {}, get: w.get, now, key: noSaved, turn });
  const b = await webSearch({ query: 'two' }, { cfg: {}, get: w.get, now, key: noSaved, turn });
  check('the first free search goes at once, the next waits 5 to 10 seconds (here 7.5)', /1\. One/.test(a) && /1\. One/.test(b) && waits.length === 1 && waits[0] === 7500, JSON.stringify(waits));
  check('robots.txt is read once, not before every search', w.sent.filter((u) => /robots\.txt$/.test(u)).length === 1, JSON.stringify(w.sent));
  check('each free search counts toward this answer\'s share', turn.freeSearches === 2);
  turn.freeSearches = FREE_PER_ANSWER;
  const c = await webSearch({ query: 'three' }, { cfg: {}, get: w.get, now, key: noSaved, turn });
  check(`after ${FREE_PER_ANSWER} free-page searches in one answer, no more (and it says why)`, /used my 6 free-page searches/.test(c) && !w.sent.some((u) => /q=three/.test(u)), c);
}
{
  let clock = 5_000_000;
  resetPacing({ wait: async (ms) => { clock += ms; }, rand: () => 0 });
  const w = net({ ddg: () => resp(429, 'slow down', { headers: { 'retry-after': '120' } }) });
  const now = () => clock;
  const a = await webSearch({ query: 'busy' }, { cfg: {}, get: w.get, now, key: noSaved, turn: {} });
  const sentBefore = w.sent.length;
  clock += 60_000;
  const b = await webSearch({ query: 'busy again' }, { cfg: {}, get: w.get, now, key: noSaved, turn: {} });
  check('a "slow down" (429) rests DuckDuckGo: the next search a minute later doesn\'t knock', !w.sent.slice(sentBefore).some((u) => /duckduckgo\.com\/html/.test(u)) && /asked me to slow down/.test(b), `${a} || ${b}`);
  check('Mojeek\'s free page is skipped: its robots.txt says no, and Bob says so', !w.sent.some((u) => /mojeek\.com\/search/.test(u)) && /robots\.txt asks bots not to use that page/.test(b), b);
  clock += 3 * 60_000;
  const c = await webSearch({ query: 'later' }, { cfg: {}, get: w.get, now, key: noSaved, turn: {} });
  check('...and DuckDuckGo is asked again once the rest is over, with a longer rest after another 429', w.sent.some((u) => /q=later/.test(u)) && pacing.backoff.get('html.duckduckgo.com') === 4 * 60_000, `${c} ${pacing.backoff.get('html.duckduckgo.com')}`);
}
{
  let clock = 9_000_000;
  resetPacing({ wait: async (ms) => { clock += ms; }, rand: () => 0 });
  const w = net({ ddg: () => resp(202, DDG_BLOCK) });
  const now = () => clock;
  const cfg = { dataDir: dataDir(), searchBackup: { use: { tavily: true }, keys: { tavily: 'tvly-TEST-not-a-real-key' } } };
  const a = await webSearch({ query: 'blocked' }, { cfg, get: w.get, now, key: noSaved, turn: {} });
  const b = await webSearch({ query: 'blocked again' }, { cfg, get: w.get, now, key: noSaved, turn: {} });
  check('a robot check: never got round, the next source (your service) answers', /From Tavily/.test(a), a);
  check('...and the blocked page rests: the next search doesn\'t ask it again', w.sent.filter((u) => /duckduckgo\.com\/html/.test(u)).length === 1 && /From Tavily/.test(b), JSON.stringify(w.sent));
}
{
  resetPacing({ wait: async () => {} });
  const w = net({ ddgRobots: () => resp(503, '') });
  const out = await webSearch({ query: 'server trouble' }, { cfg: {}, get: w.get, key: noSaved, turn: {} });
  check('a robots.txt that can\'t be read (503): that page is left alone for now (RFC 9309)', !w.sent.some((u) => /duckduckgo\.com\/html/.test(u)) && /robots\.txt/.test(out), out);
}
{ // side by side: each search takes a different service the user set up
  resetPacing({ wait: async () => {} });
  const w = net({ svcWait: 20 });
  const cfg = { dataDir: dataDir(), searchBackup: { use: { tavily: true, brave: true, firecrawl: true }, keys: { tavily: 'tvly-TEST', brave: 'brave-TEST' } } };
  const outs = await Promise.all(['a', 'b', 'c'].map((q) => webSearch({ query: `side ${q}` }, { cfg, get: w.get, key: noSaved, turn: {} })));
  const who = outs.map((o) => (/From (\w+)/.exec(o) || [])[1] || (/1\. One/.test(o) ? 'DuckDuckGo' : '?'));
  check('three searches at once: the first takes the free page, the others each a different service', who[0] === 'DuckDuckGo' && new Set(who.slice(1)).size === 2 && who.slice(1).every((x) => ['Brave', 'Tavily', 'Firecrawl'].includes(x)), JSON.stringify(who));
  check('...said as "side by side with your other searches"', outs.slice(1).every((o) => /side by side with your other searches/.test(o)), outs.join(' || '));
  check('...and no service is left marked busy', busy.size === 0);
  const capped = { dataDir: dataDir(), searchBackup: { use: { tavily: true, brave: true }, caps: { tavily: 0 }, keys: { tavily: 'tvly-TEST', brave: 'brave-TEST' } } };
  const outs2 = await Promise.all(['d', 'e', 'f'].map((q) => webSearch({ query: `cap ${q}` }, { cfg: capped, get: w.get, key: noSaved, turn: {} })));
  check('a service at its monthly cap is never asked, side by side or not', !w.sent.some((u, i) => i > 0 && u === 'https://api.tavily.com/search' && false) && !outs2.some((o) => /From Tavily/.test(o)), outs2.join(' || '));
}
check('web_search hands the job record in (for the share per answer)', /turn: ctx\.ledger \? ctx : null/.test(read('src/tools.js')));

// ---------- whole jobs through Bob's real loop ----------
// A scripted brain, by what the loop's hidden notes ask. mode:
//  'memory'   answers facts from memory unless sent to search (the 800-job habit)
//  'good'     searches after noting what it remembers
//  'blocked'  like 'memory', but every search comes back blocked
//  'askfirst' asks which file before looking (ask_user), then reads
//  'answerfirst' answers about the named file without reading it, then reads
//  'which'    asks back in words which file, before looking
function scripted(mode, notesPath, log) {
  return async (o) => {
    const msgs = o.messages || [];
    const tools = new Set((o.tools || []).map((t) => t.function?.name));
    const lastUser = msgs.findLastIndex((m) => m.role === 'user');
    const after = msgs.slice(lastUser + 1);
    const notes = after.filter((m) => m.role === 'system').map(text).join('\n');
    const ranNames = after.filter((m) => m.role === 'tool').map((m) => m.tool_name);
    const said = (content, calls) => { if (content) o.onToken?.(content); log.push({ tools: tools.size, content, calls: (calls || []).map((c) => c.function.name) }); return { role: 'assistant', content, ...(calls ? { tool_calls: calls } : {}) }; };
    const call = (name, args, words = '') => said(words, [{ function: { name, arguments: args } }]);
    if (/^## Conversation so far/.test(text(msgs[1]))) return said('Looks right.');
    // Facts first, the quiet step
    if (/Facts first\. This is a question of fact/.test(notes) && !/Facts first, checking/.test(notes)) return said('From memory (not checked): Tavily\'s free plan is 500 searches a month.');
    if (/^Max effort, planning|^Improve the plan/m.test(notes) && !/Max effort, step/.test(notes)) return said('1. Look up the free plan\n2. Answer from the source');
    const found = after.filter((m) => m.role === 'tool').map(text).join('\n');
    const fileSays = /blue heron[^\n"]*/i.exec(found)?.[0];
    if (notesPath) {
      if (fileSays) return said(`Your notes say "${fileSays}".`);
      if (!ranNames.length && !/Read it with your tools first|Look first|^Not run: (?:read|look)/m.test(notes + after.filter((m) => m.role === 'tool').map(text).join('\n'))) {
        if (mode === 'askfirst') return call('ask_user', { question: 'Which file do you mean?', choices: ['notes.txt', 'Something else'] });
        if (mode === 'answerfirst') return said('Your notes say the hint is "red fox".');
        if (mode === 'which') return said('Which file do you mean?');
      }
      if (tools.has('read_file') && /\.txt/.test(notesPath)) return call('read_file', { path: notesPath }, 'Reading it.');
      return said('I could not read it.');
    }
    if (ranNames.includes('web_search')) {
      if (/blocked|robot check/i.test(found)) return said('Tavily\'s free plan is 500 searches a month.');
      return said('Tavily\'s pricing page says the free plan is 1,000 searches a month, no card needed (source: tavily.com). I remembered 500, but the page says 1,000, so 1,000 it is.');
    }
    if (!tools.size) return said('Tavily\'s free plan is 500 searches a month.');
    if (mode === 'good' || /without looking it up/.test(notes)) return said('', [{ function: { name: 'web_search', arguments: { query: 'Tavily free plan searches per month' } } }, { function: { name: 'web_search', arguments: { query: 'Tavily pricing free credits' } } }]);
    return said('Tavily\'s free plan is 500 searches a month.');
  };
}
const runJob = async ({ effort = 'high', mode = 'memory', ask = 'How many searches a month does Tavily\'s free plan give?', extra = {}, file = false } = {}) => {
  const tmp = fs.mkdtempSync(path.join(tmpRoot, 'job '));
  const inn = path.join(tmp, 'inn'), dd = path.join(inn, 'bob'), docs = path.join(inn, 'Documents'); fs.mkdirSync(dd, { recursive: true }); fs.mkdirSync(docs, { recursive: true });
  const notes = path.join(docs, 'notes.txt');
  fs.writeFileSync(notes, 'Shopping: milk, eggs\nPassword hint: blue heron by the pond\n');
  const brain = new Brain({ agentDir: tmp, innDir: inn, dataDir: dd, settingsFile: path.join(dd, 'settings.json'), readRoots: [inn], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
    // Nov 28: both start off in the app; these jobs test them switched on.
    models: { bob: 'qwen3.6-35b-a3b' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', webSearch: true, soloEffort: true, factsFirst: 'high', readFirst: true, ...extra }, () => {});
  clearInterval(brain.reminderTimer);
  brain.ensureModel = async () => {}; brain.fitCtx = async (m, c) => c || 32768; brain.recall = async () => '';
  const said = [], logs = [], ran = [];
  const realLog = brain.log.bind(brain); brain.log = (k, t) => { logs.push(`${k}: ${t}`); try { realLog(k, t); } catch {} };
  const realTool = brain.runTool.bind(brain);
  brain.runTool = async (name, args, ...rest) => {
    if (name === 'web_search') { const t = mode === 'blocked' ? 'The search pages are blocking this computer right now (DuckDuckGo showed a robot check). I don\'t get round those.' : '1. Tavily pricing\n   https://tavily.com/pricing\n   Free: 1,000 API credits a month, no credit card.'; ran.push({ name, args, text: t }); return { text: t }; }
    const r = await realTool(name, args, ...rest); ran.push({ name, args, text: String(r?.text ?? r ?? '').slice(0, 300) }); return r;
  };
  brain.engine = { chat: scripted(mode, file ? notes : null, said), isLoaded: async () => true, loaded: async () => [], unloadAll: async () => [], unload: async () => [] };
  const evs = [];
  const q = typeof ask === 'function' ? ask(notes, docs) : ask;
  let error = '';
  try { await brain.run('s1', q, (e) => evs.push(e), new AbortController().signal, [], { id: 'j1', effort, state: 'running' }); } catch (e) { error = e.stack || e.message; }
  const all = brain.session('s1');
  const shown = all.filter((m) => m.role === 'assistant' && !m.tool_calls?.length && !m.step && !m.moot && text(m).trim());
  const tokens = evs.filter((e) => e.type === 'token').map((e) => e.text).join('');
  fs.rmSync(tmp, { recursive: true, force: true });
  return { error, all, shown, ran, said, logs, evs, tokens };
};

for (const [effort, name] of [['high', 'Magnus'], ['extreme', 'Maximus']]) {
  const r = await runJob({ effort, mode: 'memory' });
  check(`${name}: the job finishes with no error`, !r.error, r.error);
  const quiet = r.said.find((s) => /^From memory \(not checked\)/.test(s.content));
  check(`${name}: he first notes what he remembers, with no tools offered`, quiet && quiet.tools === 0, JSON.stringify(r.said.slice(0, 3)));
  check(`${name}: ...and that note never reaches the chat (it's hidden, for comparing)`, !/From memory \(not checked\)/.test(r.tokens) && r.all.some((m) => m.role === 'system' && m.hidden && /What you wrote from memory, before looking:[\s\S]*500 searches/.test(text(m))), r.tokens.slice(0, 300));
  check(`${name}: an answer from memory is sent back to search first, and he searches`, r.logs.some((l) => /sent back to search first/.test(l)) && r.ran.some((c) => c.name === 'web_search'), r.logs.filter((l) => /facts/.test(l)).join(' / '));
  check(`${name}: one shown answer, from the source, saying where memory and source differ`, r.shown.length === 1 && /1,000/.test(text(r.shown[0])) && /I remembered 500, but/.test(text(r.shown[0])), JSON.stringify(r.shown.map(text)));
  check(`${name}: the chat says Facts first is on`, r.evs.some((e) => e.type === 'announce' && /Facts first/.test(e.text)));
  check(`${name}: no "not checked" note when a source was read`, !r.shown.some((m) => m.correction === UNCHECKED_CORRECTION));
  check(`${name}: the record for the rentals says recalled, looked, sourced, nudged`, r.logs.some((l) => /"recalled":true,"looked":true,"sourced":true,"nudged":true/.test(l)), r.logs.filter((l) => /facts/.test(l)).join(' / '));
}
{
  const r = await runJob({ effort: 'high', mode: 'good' });
  check('a brain that searches by itself isn\'t sent back, and its searches run side by side', !r.logs.some((l) => /sent back to search first/.test(l)) && r.ran.filter((c) => c.name === 'web_search').length === 2 && r.logs.some((l) => /look-ups side by side: web_search, web_search/.test(l)), r.logs.filter((l) => /facts|side by side/.test(l)).join(' / '));
  check('...and its one answer is from the source', r.shown.length === 1 && /1,000/.test(text(r.shown[0])), JSON.stringify(r.shown.map(text)));
}
{
  const r = await runJob({ effort: 'low', mode: 'memory' });
  check('Minimus by default: no Facts first (the quick level stays quick)', !r.said.some((s) => /^From memory/.test(s.content)) && !r.logs.some((l) => /facts/.test(l)) && r.shown.length === 1, r.logs.filter((l) => /facts/.test(l)).join(' / '));
  const r2 = await runJob({ effort: 'low', mode: 'memory', extra: { factsFirst: 'all' } });
  check('Minimus with "Every level": he notes, searches and answers from the source', r2.said.some((s) => /^From memory/.test(s.content)) && r2.ran.some((c) => c.name === 'web_search') && r2.shown.length === 1 && /1,000/.test(text(r2.shown[0])), JSON.stringify(r2.shown.map(text)) + r2.logs.filter((l) => /facts/.test(l)).join(' / '));
  const r3 = await runJob({ effort: 'medium', mode: 'memory', extra: { factsFirst: 'all', soloEffort: false } });
  check('Medius with "Every level", without Effort on one brain: the same', r3.ran.some((c) => c.name === 'web_search') && r3.shown.length === 1 && /1,000/.test(text(r3.shown[0])), r3.error || JSON.stringify(r3.shown.map(text)));
  const r4 = await runJob({ effort: 'high', mode: 'memory', extra: { factsFirst: 'off' } });
  check('"Off": Magnus answers as before', !r4.said.some((s) => /^From memory/.test(s.content)) && !r4.logs.some((l) => /search first/.test(l)), r4.logs.filter((l) => /facts/.test(l)).join(' / '));
  const r5 = await runJob({ effort: 'high', mode: 'memory', extra: { webSearch: false } });
  check('web search off: no Facts first (there\'s nothing to check with)', !r5.said.some((s) => /^From memory/.test(s.content)) && !r5.logs.some((l) => /facts/.test(l)));
  const r6 = await runJob({ effort: 'high', mode: 'memory', ask: 'hi Bob, how are you?' });
  check('chat at Magnus: no Facts first', !r6.said.some((s) => /^From memory/.test(s.content)));
}
{
  const r = await runJob({ effort: 'high', mode: 'blocked' });
  check('every search blocked: the answer gets the plain "not checked" note from the app', r.shown.length >= 1 && r.all.some((m) => m.correction === UNCHECKED_CORRECTION) && r.evs.some((e) => e.type === 'correction' && e.text === UNCHECKED_CORRECTION), JSON.stringify(r.shown.map((m) => [text(m), m.correction])));
}
// Read what you were given
{
  const r = await runJob({ effort: 'low', mode: 'askfirst', file: true, ask: (notes) => `What does ${notes} say about the password hint?` });
  check('a question card before reading the named file goes back once, then he reads it', r.ran.some((c) => c.name === 'read_file') && !r.ran.some((c) => c.name === 'ask_user') && r.logs.some((l) => /read first: a question card/.test(l)), JSON.stringify(r.ran.map((c) => c.name)) + r.logs.filter((l) => /read first/.test(l)).join('/'));
  check('...and the one answer holds what the file says', r.shown.length === 1 && /blue heron/.test(text(r.shown[0])), JSON.stringify(r.shown.map(text)));
  const r2 = await runJob({ effort: 'low', mode: 'answerfirst', file: true, ask: (notes) => `What does ${notes} say about the password hint?` });
  check('an answer about the named file without reading it is sent back; the read answer replaces it', r2.logs.some((l) => /answered before reading the file/.test(l)) && r2.shown.length === 1 && /blue heron/.test(text(r2.shown[0])) && !/red fox/.test(text(r2.shown[0])), JSON.stringify(r2.shown.map(text)));
  const r3 = await runJob({ effort: 'low', mode: 'which', file: true, ask: 'What do my notes say about the password hint?' });
  check('"which file?" before looking in the folders: sent to look first, and he finds it', r3.logs.some((l) => /answered before looking in the folders/.test(l)) && r3.ran.some((c) => c.name === 'read_file') && r3.shown.length === 1 && /blue heron/.test(text(r3.shown[0])), JSON.stringify(r3.shown.map(text)) + r3.logs.filter((l) => /read first/.test(l)).join('/'));
  const r4 = await runJob({ effort: 'low', mode: 'answerfirst', file: true, ask: (notes) => `What does ${notes} say about the password hint?`, extra: { readFirst: false } });
  check('Read what you were given switched off: as before', !r4.logs.some((l) => /read first/.test(l)));
}
check('Help: a page in Bob\'s voice, glossary entries and an FAQ', /id: 'facts-first'/.test(read('public/help-content.js')) && /<dt>Facts first<\/dt>/.test(read('public/help-content.js')) && /id: 'faq-facts-first'/.test(read('public/help-content.js')) && /<dt>robots\.txt<\/dt>/.test(read('public/help-content.js')));
check('the Settings route saves and shows both', /typeof b\.factsFirst === 'string'/.test(read('src/server.js')) && /typeof b\.readFirst === 'boolean'/.test(read('src/server.js')) && /factsFirst: cleanFactsFirst\(cfg\.factsFirst\), readFirst: cfg\.readFirst === true/.test(read('src/server.js')));
check('Settings: Facts first and Read what you were given, in How Bob works', /data-set="factsFirst"/.test(read('public/cellar-pages.js')) && /sswitch\('readFirst'/.test(read('public/cellar-pages.js')));

fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
