// 16 Nov 2026: jobs-matrix.mjs and do-jobs' --effort, --solo-effort, --lora-scale, --scenes-only, --search-cache,
// --search-cap and --search-ledger (the owner: test the distilled A3B "both before and after our effort changes"; "if our
// changes to the effort settings for a single brain makes it fail more we will not proceed with that part of the update").
// A fake llama-server is the brain. The test worlds are written once and every variant starts from them; each variant
// asks at its own effort, every ask says how much of the add-on to use, a query one variant already searched is answered
// from the shared cache, and the Tavily searches go into another copy's ledger.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs matrix '));
const KEY = 'tvly-FAKE0123456789abcdef';
const call = (name, args) => ({ choices: [{ message: { role: 'assistant', content: '', reasoning_content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { completion_tokens: 9, prompt_tokens: 900 } });
const say = (t) => ({ choices: [{ message: { role: 'assistant', content: t, reasoning_content: '' } }], usage: { completion_tokens: 5, prompt_tokens: 900 } });
let sceneAsks = 0; const loras = []; const thinks = []; let reviews = 0;
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/props')) { res.end(JSON.stringify({ chat_template: '' })); return; }
  if (req.url.startsWith('/tavily/')) { req.resume(); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(req.url.includes('usage') ? {} : { results: [{ title: 'ok', url: 'https://example.com', content: 'ok' }] })); return; }
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
    const j = JSON.parse(b || '{}'); const msgs = j.messages || [];
    loras.push(JSON.stringify(j.lora ?? null));
    res.setHeader('content-type', 'application/json');
    if (/^You set up a test computer/.test(String(msgs[0]?.content || ''))) { sceneAsks++; res.end(JSON.stringify(say(JSON.stringify({ files: [{ path: 'Documents\\note.txt', content: 'buy plums' }], folders: [], board: [], memory: [] })))); return; }
    thinks.push(j.chat_template_kwargs?.enable_thinking);
    const all = msgs.map((m) => String(m.content || '')).join('\n');
    if (/Review your own work|Start with exactly "Looks right\."/.test(all) && msgs.at(-1)?.role !== 'tool') { reviews++; res.end(JSON.stringify(say('Looks right.'))); return; }
    const ask = String(msgs.find((m) => m.role === 'user')?.content || '');
    const names = (j.tools || []).map((t) => t.function?.name);
    const tools = msgs.filter((m) => m.role === 'tool').length;
    if (/plums/.test(ask) && !tools) res.end(JSON.stringify(names.includes('web_search') ? call('web_search', { query: 'plum season' }) : call('use_tools', { group: 'web' })));
    else if (/plums/.test(ask) && tools === 1 && !names.includes('web_search')) res.end(JSON.stringify(call('web_search', { query: 'plum season' })));
    else res.end(JSON.stringify(say('Plums are in season in late summer.')));
  });
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${srv.address().port}`;
const jobs = path.join(tmp, 'ideas.jsonl');
fs.writeFileSync(jobs, [{ id: 'p1', job: 'web', text: 'when are plums in season?' }, { id: 'p2', job: 'chat', text: 'say hello' }].map((x) => JSON.stringify(x)).join('\n') + '\n');
// free search pages answer nothing here; Tavily's own address answers one result (the backup search)
const offline = path.join(tmp, 'offline.mjs');
fs.writeFileSync(offline, "const real = globalThis.fetch;\nglobalThis.fetch = async (u, o) => { const s = String(u?.url ?? u); if (/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(s)) return real(u, o); if (/api\\.tavily\\.com\\/search/.test(s)) return new Response(JSON.stringify({ results: [{ title: 'Plums', url: 'https://example.com/plums', content: 'Late summer.' }] }), { status: 200, headers: { 'content-type': 'application/json' } }); return new Response('', { status: 200, headers: { 'content-type': 'text/html' } }); };\n");
const ledger = path.join(tmp, 'other copy', 'tavily-searches.json'); fs.mkdirSync(path.dirname(ledger), { recursive: true }); fs.writeFileSync(ledger, JSON.stringify({ used: 100 }));
const cache = path.join(tmp, 'search-cache.jsonl');
const run = (script, args) => new Promise((ok) => {
  const ch = spawn(process.execPath, ['--import', pathToFileURL(offline).href, script, ...args], { cwd: path.join(app, 'model-lab'), env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import ${pathToFileURL(offline).href}`.trim(), LAB_API_KEY: 'k', LAB_URL: '', LAB_TAVILY_KEY: KEY, LAB_TAVILY_URL: `${url}/tavily` } });
  let log = ''; ch.stdout.on('data', (d) => (log += d)); ch.stderr.on('data', (d) => (log += d));
  const t = setTimeout(() => { ch.kill(); ok({ code: -1, log }); }, 240000); ch.on('exit', (code) => { clearTimeout(t); ok({ code, log }); });
});
const common = ['--url', url, '--bob', app, '--out', tmp, '--jobs', jobs, '--parallel', '1', '--search-gap', '0', '--lora-scale', '1', '--search', 'tavily', '--search-month', '1500', '--search-ledger', ledger, '--search-cache', cache];
const VARS = 'before=--effort low;after=--effort high --solo-effort;stock=--effort low --lora-scale 0';

const bad1 = await run('jobs-matrix.mjs', ['--prefix', 'm', '--variants', 'a b=--effort low', ...common, '--preflight']);
check('a variant name with a space stops pre-flight', bad1.code === 1 && /PRE-FLIGHT FAIL: variant name "a b"/.test(bad1.log), bad1.log.slice(-200));
const bad2 = await run('jobs-matrix.mjs', ['--prefix', 'm', '--variants', 'a=--dir x', ...common, '--preflight']);
check('a variant that names its own folder stops pre-flight', bad2.code === 1 && /sets --dir/.test(bad2.log), bad2.log.slice(-200));
const bad3 = await run('do-jobs.mjs', [...common, '--dir', 'x', '--effort', 'huge', '--preflight']);
check('do-jobs: an unknown --effort stops pre-flight', bad3.code === 1 && /--effort huge: one of low, medium, high, extreme/.test(bad3.log), bad3.log.slice(-200));
const bad4 = await run('do-jobs.mjs', [...common, '--dir', 'x', '--scenes-only', '--preflight']);
check('do-jobs: --scenes-only without --scene make stops pre-flight', bad4.code === 1 && /--scenes-only needs --scene make/.test(bad4.log), bad4.log.slice(-200));
const pf = await run('jobs-matrix.mjs', ['--prefix', 'm', '--variants', VARS, ...common, '--search-cap', '30', '--preflight']);
check('only the first variant spends a search on the key check and the probe', (pf.log.match(/Tavily key works/g) || []).length === 1 && (pf.log.match(/checked by the first run of this matrix/g) || []).length === 2, pf.log.slice(-300));
check('pre-flight runs for every variant, each at its own effort, and passes', pf.code === 0 && /pre-flight OK: every variant/.test(pf.log) && /\[after\] pre-flight: every job is asked at Effort high, with Effort on one brain switched on/.test(pf.log) && /\[before\] pre-flight: every job is asked at Effort low \(Effort on one brain off\)/.test(pf.log) && /10 Tavily searches each/.test(pf.log), pf.log.slice(-600));
const ledgerBefore = JSON.parse(fs.readFileSync(ledger, 'utf8')).used;
const r = await run('jobs-matrix.mjs', ['--prefix', 'm', '--variants', VARS, ...common, '--search-cap', '30', '--stagger', '4']);
// --cap-go-on: this run's own cap used up, the jobs still run and Bob says his backup is at its cap; --leave-out-kinds
const jobsGo = path.join(tmp, 'ideas-go.jsonl');
fs.writeFileSync(jobsGo, [{ id: 'q1', job: 'web', text: 'search the web for plum facts' }, { id: 'q2', job: 'chat', text: 'when are plums in season?' }, { id: 'q3', job: 'chat', text: 'say hello' }].map((x) => JSON.stringify(x)).join('\n') + '\n');
const goArgs = common.filter((x, i, a) => x !== '--search-cache' && a[i - 1] !== '--search-cache');
const go = await run('do-jobs.mjs', [...goArgs.map((x) => (x === jobs ? jobsGo : x)), '--dir', 'go', '--search-cap', '1', '--cap-go-on', '--leave-out-kinds', 'web']);
const asksBefore = sceneAsks;
const noCache = goArgs.filter((x, i, arr) => !/^--search/.test(x) && !/^--search/.test(arr[i - 1] || ''));
const again = await run('jobs-matrix.mjs', ['--prefix', 'm2', '--variants', 'x=--effort medium --solo-effort', ...noCache, '--scenes-from', 'm-scenes']);
const preScenes = await run('jobs-matrix.mjs', ['--prefix', 'm4', '--variants', 'x=--effort low', ...noCache, '--scenes-from', 'm-scenes', '--preflight']);
const missingScenes = await run('jobs-matrix.mjs', ['--prefix', 'm3', '--variants', 'x=--effort low', ...noCache, '--scenes-from', 'nope-scenes']);
srv.close();
const rows = (v) => { const f = path.join(tmp, `m-${v}`, 'runs.jsonl'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []; };
const [b, a, s] = ['before', 'after', 'stock'].map(rows);
{ const x = rows('x').length ? rows('x') : (fs.existsSync(path.join(tmp, 'm2-x', 'runs.jsonl')) ? fs.readFileSync(path.join(tmp, 'm2-x', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  check('--scenes-from reuses an earlier matrix\'s worlds: none are written again, every run starts from them', again.code === 0 && sceneAsks === asksBefore && x.length === 2 && x.every((y) => y.scene?.made === 'reused' && y.effort === 'medium'), `${sceneAsks - asksBefore} new scene asks; ${again.log.slice(-300)}`);
  check('--scenes-from: the pre-flight counts the worlds the run will read, not the empty run folder', preScenes.code === 0 && /scenes reuse: 2 of 2 jobs already have one/.test(preScenes.log), preScenes.log.slice(-400));
  check('--scenes-from a folder with no worlds stops before any job', missingScenes.code === 1 && /PRE-FLIGHT FAIL: --scenes-from nope-scenes/.test(missingScenes.log), missingScenes.log.slice(-200)); }
check('the matrix ran and every variant did both jobs', r.code === 0 && b.length === 2 && a.length === 2 && s.length === 2 && /jobs matrix m done: before exit 0, after exit 0, stock exit 0/.test(r.log), r.log.slice(-800));
check('the test worlds are written once (one ask per job) and every variant starts from them', sceneAsks === 2 && [...b, ...a, ...s].every((x) => x.scene?.made === 'reused' && x.scene.files.length === 1), `${sceneAsks} scene asks; ${JSON.stringify([...b, ...a, ...s].map((x) => x.scene?.made))}`);
check('each run records its effort, one-brain switch and add-on scale', b.every((x) => x.effort === 'low' && x.solo_effort === false && x.lora_scale === 1) && a.every((x) => x.effort === 'high' && x.solo_effort === true && x.lora_scale === 1) && s.every((x) => x.lora_scale === 0), JSON.stringify([...b, ...a, ...s].map((x) => [x.effort, x.solo_effort, x.lora_scale])));
check('every ask tells the server how much of the add-on to use (1 for the add-on, 0 for the plain brain)', loras.every((l) => l === '[{"id":0,"scale":1}]' || l === '[{"id":0,"scale":0}]') && loras.includes('[{"id":0,"scale":0}]'), [...new Set(loras)].join(' '));
check('one brain at High runs Bob\'s own review of the work (the "after" runs only)', reviews >= 1 && a.some((x) => x.asks > b.find((y) => y.id === x.id).asks), `reviews ${reviews}; asks before ${b.map((x) => x.asks)} after ${a.map((x) => x.asks)}`);
{ const searches = [...b, ...a, ...s].flatMap((x) => x.steps.flatMap((st) => st.calls)).filter((c) => c.name === 'web_search');
  const cached = searches.filter((c) => c.cached).length;
  const used = JSON.parse(fs.readFileSync(ledger, 'utf8')).used - ledgerBefore;
  check('the same query in a second variant is answered from the shared cache with the same real result', searches.length >= 3 && cached >= 1 && searches.every((c) => /Late summer/.test(c.result || "")), `${searches.length} searches, ${cached} cached; ${searches.map((c) => (c.result || '').slice(0, 400)).join(' | ')}`);
  check("the Tavily searches are counted in the other copy's ledger (key checks plus searches not from the cache)", used >= 3 && used <= 3 + 3 + (searches.length - cached), `ledger went up by ${used}`);
  check("the summary says how many came from the cache", /answered from the shared cache/.test(fs.readFileSync(path.join(tmp, 'm-after', 'summary.md'), 'utf8'))); }
check("a search that found nothing is never cached, even inside Bob's outside-text lines", !fs.existsSync(cache) || !/No results \(or the search pages changed\)/.test(fs.readFileSync(cache, 'utf8')));
check('the key never shows in anything printed or saved', ![r.log, pf.log, ...['before', 'after', 'stock'].map((v) => fs.readFileSync(path.join(tmp, `m-${v}`, 'runs.jsonl'), 'utf8')), fs.existsSync(cache) ? fs.readFileSync(cache, 'utf8') : ''].some((x) => x.includes(KEY)));
{ const g = fs.existsSync(path.join(tmp, 'go', 'runs.jsonl')) ? fs.readFileSync(path.join(tmp, 'go', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  const q2 = g.find((x) => x.id === 'q2');
  check('--leave-out-kinds web: the web job is not run, and pre-flight says so', !g.some((x) => x.id === 'q1') && /1 job\(s\) of kind web left out/.test(go.log), go.log.slice(-300));
  check("--cap-go-on: with this run's one search used by the key check, the jobs still run and Bob says his backup is at its cap", g.length === 2 && q2?.search_capped === true && /at its monthly cap/.test(JSON.stringify(q2.steps)) && !/no new job starts/.test(go.log), go.log.slice(-1500) + String(JSON.stringify(q2?.steps?.flatMap((st) => st.calls)) || '').slice(0, 600)); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
