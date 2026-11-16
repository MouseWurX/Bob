// Do jobs (15 Nov 2026, the owner: "so instead of having it make lessons, do we just get it to do things?"). A served brain
// works as Bob's brain on real requests, through Bob's whole turn loop (his prompt, his tool set for the brain's family,
// his loop helps, step thinking), and every run is kept in full: the thinking, each call, each result, the answer.
// Tools run for real in a throwaway folder per job (bob-kit runReal: nothing outside it is touched) and web_search /
// fetch_page go to the real web. There are no stand-ins: a tool that would act on the real computer or an account is
// not offered (NOT_HERE), and ask_user gets the first choice as the pick. Nobody writes or rewrites a run: Opus reads them all, clean runs
// become lessons as they ran, the rest are study material and never train.
//
// node do-jobs.mjs --url <server> --bob <Bob app folder> --jobs <ideas.jsonl>[,<more.jsonl>] --dir <name>
//      [--never <file>[,<file>]] [--parallel 2] [--count N] [--hours H] [--max 4096] [--job-minutes 10] [--want-shapes 4]
//      [--preflight] [--slot-ctx N] [--scene make|reuse] [--scenes <scenes.jsonl>[,...]] [--office <soffice>]
//      [--search-probe] [--search-gap 2] [--search tavily] [--search-month N]
// Jobs: one per line, {id, text, setup?: [{path, content}]} (the lesson writer's ideas files work as they are; only the
// request and its starting files are used, never an old answer). --never: held-out / test files; a job whose request
// matches one of theirs is never run. Runs go to <out>/<dir>/runs.jsonl (one row per job, picked up again after a stop).
// 16 Nov (the owner: "it was supposed to have files for every job it could do and ask for"): each job gets its own test
// world. --scene make: the served brain first writes the job's scene (scenes.mjs: the files, folders, board lists and
// memory the request takes for granted), saved to <dir>/scenes.jsonl; --scene reuse: only scenes already saved (in
// <dir> or --scenes files) are used, so two brains start from the very same world. Folders outside the home (C:\Temp,
// /home/user/...) are mirrored in the throwaway folder. Bob's Hands that would act on the real PC are off, so his prompt
// says what this Bob can really do, and everything the brain sees is neutralised (no Lab PC folder or temp names).
// --search-probe: pre-flight runs Bob's web_search once and fails when the free search pages answer nothing (the Lab PC
// was bot-blocked on 16 Nov); during a run, 5 searches in a row with no results stop it, so a rental isn't spent on
// jobs whose searches all fail. --search-gap: seconds between searches (default 2), so the pages aren't flooded.
// --search tavily (the owner, 16 Nov: "Use Tavily ... for making lessons"): the Lab's own Tavily key (lab-keys.mjs, saved
// encrypted on the Lab PC) is checked in pre-flight with one search and handed to each job's Bob as his backup search
// (Bob's own web-search.js: the free pages first, Tavily only when they're blocked or find nothing; cfg.searchBackup.keys
// is the in-memory way in, never saved). The key stays in this process's memory: every line printed and every row saved
// is scrubbed for it.
// --search-month N (16 Nov, a longer run after run 3; Tavily's free plan is 1,000 searches a month): every Tavily search
// the Lab makes (its key checks, and each one a job's Bob makes, read back from his own count) is counted in
// <out>/tavily-searches-<year-month>.json. Each job's Bob starts from that count with his cap at N - 10, so he says so
// himself at the cap; and no new job starts once fewer than 10 are left (by that count or Tavily's own usage page). The
// jobs not started stay in the queue for the next run (runs.jsonl picks up where it stopped).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { opts, locate, appendJsonl, readJsonl } from './common.mjs';
import { loadBob } from './bob-kit.mjs';
import { makeScene, plantScene, sceneCache } from './scenes.mjs';
import { labKey, scrubber, tavilyCheck, tavilyUsage } from './lab-keys.mjs';

const o = opts({ parallel: 2, max: 4096, 'job-minutes': 10, hours: 0, 'search-gap': 2 });
const L = locate(o);
const url = String(o.url || process.env.LAB_URL || '');
const dir = path.join(L.out, String(o.dir || 'do-jobs'));
fs.mkdirSync(dir, { recursive: true });
const F = { runs: path.join(dir, 'runs.jsonl'), summary: path.join(dir, 'summary.md'), scenes: path.join(dir, 'scenes.jsonl') };
let scrub = (t) => t; // set once a key is opened: nothing printed or saved can hold it
const say = (...a) => console.log(...a.map((x) => scrub(String(x))));
const save = (file, row) => appendJsonl(file, JSON.parse(scrub(JSON.stringify(row))));
// a search that found nothing, or Bob's line for search pages showing a robot check (web-search.js, 16 Nov)
const BLOCKED = /^(?:No results \(or the search pages changed\)|The search pages are blocking this computer)/;
const fail = (why) => { console.log(scrub(`PRE-FLIGHT FAIL: ${why}`)); process.exit(1); };

// ---- the jobs: requests only, held-out ones left out ----
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const files = String(o.jobs || '').split(',').map((x) => x.trim()).filter(Boolean);
if (!files.length) fail('--jobs <ideas.jsonl> is needed');
for (const f of files) if (!fs.existsSync(f)) fail(`no jobs file ${f}`);
const never = new Set();
// a --never entry may be a folder: every .jsonl file in it and below counts
const jsonlIn = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsonlIn(path.join(p, e.name)) : /\.jsonl$/i.test(e.name) ? [path.join(p, e.name)] : [])) : [p]);
const neverFiles = [];
for (const f of String(o.never || '').split(',').map((x) => x.trim()).filter(Boolean)) { if (!fs.existsSync(f)) fail(`no --never file or folder ${f}`); neverFiles.push(...jsonlIn(f)); }
if (o.never && !neverFiles.length) fail(`--never ${o.never} holds no .jsonl files`);
for (const f of neverFiles) {
  for (const r of readJsonl(f)) for (const t of [r.text, r.question, r.prompt, r.ask, (r.messages || []).find((m) => m.role === 'user')?.content]) if (typeof t === 'string' && t.trim()) never.add(norm(t));
}
let jobs = files.flatMap((f) => readJsonl(f)).filter((j) => j && typeof j.text === 'string' && j.text.trim()).map((j, i) => ({ id: String(j.id || `job-${i}`), job: j.job || '', text: j.text, setup: Array.isArray(j.setup) ? j.setup : [], ...(j.from && typeof j.from === 'object' ? { from: j.from } : {}) }));
const held = jobs.filter((j) => never.has(norm(j.text)));
jobs = jobs.filter((j) => !never.has(norm(j.text)));
const seen = new Set(); jobs = jobs.filter((j) => (seen.has(j.id) ? false : seen.add(j.id)));
const done = new Set(readJsonl(F.runs).map((r) => r.id));
const queue = jobs.filter((j) => !done.has(j.id)).slice(0, Number(o.count || 1e9));
say(`pre-flight: jobs file(s) ${files.join(', ')}: ${jobs.length + held.length} rows`);
if (o.never) say(`pre-flight: ${held.length} held-out request(s) left out (--never: ${neverFiles.length} file(s), ${never.size} requests known)`);
say(`pre-flight: ${done.size} already run in this folder, ${queue.length} to go`);
const sceneMode = String(o.scene || '').toLowerCase();
if (sceneMode && !['make', 'reuse'].includes(sceneMode)) fail(`--scene ${o.scene}: use make or reuse`);
const sceneFiles = [F.scenes, ...String(o.scenes || '').split(',').map((x) => x.trim()).filter(Boolean)];
for (const f of sceneFiles.slice(1)) if (!fs.existsSync(f)) fail(`no --scenes file ${f}`);
const scenes = sceneCache(sceneFiles);
if (sceneMode) {
  const have = queue.filter((j) => scenes.get(j.id, j.text)).length;
  say(`pre-flight: scenes ${sceneMode}: ${have} of ${queue.length} jobs already have one${sceneMode === 'make' ? ', the rest are written by the brain first' : ', the rest start with an empty home'}`);
}
if (o.office && !fs.existsSync(String(o.office))) fail(`no LibreOffice at --office ${o.office}`);
// The Hands this test Bob has on: those that work inside the throwaway folder. Run, Schedules, Apps, Browser, Make
// tools, MCP and Packs would act on the real PC or need what this home hasn't got, so they're off (Bob offers to switch
// them on, as he would); Office only with --office (LibreOffice).
const HANDS_HERE = ['files', 'sort', 'security', ...(o.office ? ['office'] : [])];
const kitOpts = { world: true, makers: false, docs: true, hands: HANDS_HERE, office: o.office ? String(o.office) : '' };
const searchWith = String(o.search || '').toLowerCase();
let searchKey = '';
const SEARCH_SPARE = 10; // left over in the month for the next pre-flight
const monthly = Number(o['search-month']) > 0 ? Number(o['search-month']) : Infinity;
if (o['search-month'] !== undefined && !(Number(o['search-month']) > 0)) fail(`--search-month ${o['search-month']}: give the searches a month allows`);
const ledger = path.join(L.out, `tavily-searches-${new Date().toISOString().slice(0, 7)}.json`);
const ledgerUsed = () => { try { return Number(JSON.parse(fs.readFileSync(ledger, 'utf8')).used) || 0; } catch { return 0; } };
let searchLeft = Infinity, searches = 0, budgetStop = false;
let webSearches = 0;
const counted = (n = 1) => { if (!(n > 0)) return; searches += n; if (searchWith) { try { fs.writeFileSync(ledger, JSON.stringify({ used: ledgerUsed() + n, at: new Date().toISOString() })); } catch {} } };
const searchesLeft = () => Math.min(searchLeft - searches, monthly - SEARCH_SPARE - ledgerUsed());
if (searchWith) {
  if (searchWith !== 'tavily') fail(`--search ${o.search}: only tavily is known`);
  const got = labKey('tavily');
  if (!got.key) fail(got.why);
  searchKey = got.key; scrub = scrubber(searchKey);
  const c = await tavilyCheck(searchKey); counted();
  if (!c.ok) fail(c.status === 401 || c.status === 403 ? `Tavily refused the saved key (error ${c.status}): save it again with "Save Tavily key for the Lab.cmd"` : `the Tavily key couldn't be checked (${c.status ? `error ${c.status}` : c.why})`);
  say(`pre-flight: Tavily key works (${got.from === 'env' ? 'from LAB_TAVILY_KEY' : 'the saved one'}; 1 search used, ${c.results} result)`);
  const u = await tavilyUsage(searchKey);
  if (u.ok) { searchLeft = Math.max(0, u.limit - u.used - SEARCH_SPARE); say(`pre-flight: Tavily's usage page: ${u.used} of ${u.limit} searches used this month`); }
  else say(`pre-flight: Tavily's usage page didn't say (${u.why}); the Lab's own count is used`);
  if (Number.isFinite(monthly)) say(`pre-flight: the Lab has made ${ledgerUsed()} of its ${monthly} searches this month (--search-month)`);
  const left = searchesLeft();
  if (Number.isFinite(left)) { say(`pre-flight: this run may make about ${Math.max(0, left)} more web searches`); if (left <= 0) fail('no web searches are left this month: a search job could not finish'); }
  else say('pre-flight: no search budget (--search-month): only 5 failed searches in a row stop the run');
}
// The backup search as Bob's settings hold it (off on every Bob unless its owner turns it on), the key handed in for
// this run only. His count file in this job's home starts at the Lab's count for the month, so his own cap counts the
// Lab's whole month; the function returned says how many Tavily searches he made since it was last asked.
const month = () => new Date().toISOString().slice(0, 7);
function keyedSearch(kit) {
  if (!searchKey) return () => 0;
  kit.cfg.searchBackup = { use: { tavily: true }, order: ['tavily'], ...(Number.isFinite(monthly) ? { caps: { tavily: Math.max(0, monthly - SEARCH_SPARE) } } : {}), keys: { tavily: searchKey } };
  const f = path.join(kit.cfg.dataDir, 'search-backup-count.json');
  let seen = ledgerUsed();
  try { fs.writeFileSync(f, JSON.stringify({ month: month(), used: { tavily: seen } })); } catch {}
  return () => { let now = seen; try { const c = JSON.parse(fs.readFileSync(f, 'utf8')); if (c.month === month()) now = Number(c.used?.tavily) || 0; } catch {} const d = Math.max(0, now - seen); seen = now; return d; };
}

const probe = await loadBob(L.bob, kitOpts);
const probeUsed = keyedSearch(probe);
say(`Bob's tools from ${L.bob}: ${probe.bobSrc?.version || '?'}${probe.bobSrc?.commit ? ` (${probe.bobSrc.commit})` : ''}; tool shape ${probe.toolShapes ?? '?'}`);
if (o['want-shapes'] !== undefined && String(probe.toolShapes) !== String(o['want-shapes'])) fail(`Bob's tools are shape ${probe.toolShapes ?? '?'}, not ${o['want-shapes']}`);
if (o['search-probe']) {
  let r = '';
  // 16 Nov: the second argument is the tool's context (Bob's tools take { signal }); without it the probe failed on npc
  try { const got = await probe.brain.tools.web_search.run({ query: 'weather forecast Paris' }, { signal: AbortSignal.timeout(90000) }); r = String(typeof got === 'string' ? got : got?.text ?? ''); } catch (e) { r = `Error: ${e.message || e}`; }
  counted(probeUsed());
  if (!r.trim() || BLOCKED.test(r) || /^Error/.test(r)) { probe.done(); fail(`web search from this PC gets nothing (${probe.neutral(r).slice(0, 120) || 'empty'}): the search pages may be blocking it, and every search job would teach a failed search`); }
  say('pre-flight: web search answers');
}
probe.done();
if (!queue.length && !o.preflight) { say('nothing to run'); process.exit(0); }
if (o.preflight) { say('pre-flight OK'); process.exit(0); }
if (!url) fail('--url <llama-server> is needed');

const bobUrl = (f) => pathToFileURL(path.join(L.bob, 'src', f)).href;
const { textCalls, LlamaCpp } = await import(bobUrl('llamacpp.js'));
const { checkArgs } = await import(bobUrl('loop-help.js'));
const { MID_SYSTEM_REFUSED, foldSystem } = await import(bobUrl('system-notes.js'));
const auth = process.env.LAB_API_KEY ? { authorization: `Bearer ${process.env.LAB_API_KEY}` } : {};
const today = new Date().toISOString().slice(0, 10);
// The scene writer: the served brain, thinking off, cool, JSON only (llama-server's json_object grammar when it has it)
let jsonMode = true;
async function sceneChat(messages) {
  const body = { cache_prompt: true, messages, max_tokens: 6000, stream: false, chat_template_kwargs: { enable_thinking: false }, temperature: 0.3, top_p: 0.8, top_k: 20, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) };
  const r = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify(body) });
  if (!r.ok) { const full = await r.text(); if (jsonMode && /response_format|json_object|grammar/i.test(full)) { jsonMode = false; return sceneChat(messages); } throw new Error(`llama-server ${r.status}: ${full.slice(0, 200)}`); }
  return String((await r.json()).choices?.[0]?.message?.content || '');
}
async function sceneFor(j) {
  const had = scenes.get(j.id, j.text);
  if (had) return { scene: had.scene, problems: had.problems || [], made: 'reused' };
  if (sceneMode !== 'make') return { scene: null, problems: [], made: 'none' };
  const got = await makeScene(j.text, sceneChat, { today });
  const row = { id: j.id, text: j.text, scene: got.scene, problems: got.problems, ok: got.ok, by: process.env.LAB_MODEL_NAME || 'served', at: new Date().toISOString() };
  scenes.put(row); save(F.scenes, row);
  return { scene: got.scene, problems: got.problems, made: 'new' };
}
// 16 Nov: the PC's IP was bot-blocked and every web_search came back with Bob's "No results" line
let lastSearch = 0, noResultsInRow = 0, searchStop = false;
async function searchTurn() { const gap = Number(o['search-gap']) * 1000; for (;;) { const w = lastSearch + gap - Date.now(); if (w <= 0) break; await wait(w); } lastSearch = Date.now(); }
const ctxSize = Number(o['slot-ctx'] || o.ctx || 32768);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let strict = null;
const strictTemplate = async () => {
  if (strict === null) { try { strict = MID_SYSTEM_REFUSED.test(String((await (await fetch(`${url}/props`, { headers: auth })).json())?.chat_template || '')); } catch { strict = false; } }
  return strict;
};
// Bob's own answers (no outside effect) and the tools that run for real in the throwaway folder or on the web
// neutralise every string inside a value (not its JSON text: a swapped-in Windows path would break the escapes)
// 16 Nov: a file link in the chat carries its path URL-encoded (/api/file?path=C%3A%5CUsers%5C...), which the plain
// swap missed and the owner's folder name reached a run: those are decoded, neutralised and encoded again.
const neutralText = (kit, t) => kit.neutral(t).replace(/([?&]path=)([^&"'\s)]+)/g, (m, k, p) => { try { return k + encodeURIComponent(kit.neutral(decodeURIComponent(p))); } catch { return m; } });
const deepNeutral = (kit, v) => (typeof v === 'string' ? neutralText(kit, v) : Array.isArray(v) ? v.map((x) => deepNeutral(kit, x)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepNeutral(kit, x)])) : v);
process.setMaxListeners(Math.max(process.getMaxListeners(), 200)); // each job's Bob adds its own exit hooks
const OWN = new Set(['use_tools', 'bob_help', 'offer_setup', 'pick_session', 'show_plan', 'ask_together']);
// 15 Nov (owner: "everything was supposed to run for real", "stand ins need to give real results"): every tool Bob
// offers here runs for real, inside this job's throwaway home (or against public web records), and its real answer or
// real error goes back. Tools that would act on the real computer or on someone's accounts, or need an app this test
// home doesn't have, are not offered at all, so this Bob simply hasn't got them (as a Bob with those Hands off).
// 16 Nov: the Hands those belong to are off in this Bob too (HANDS_HERE), so his prompt doesn't offer them either.
// make_image, make_video, make_music and make_sound stay: the painter isn't set up here (bob-kit makers: false), and
// Bob's own answer for that ("can't make pictures yet") is what any Bob without one gets.
export const NOT_HERE = new Set(['run_command', 'run_recipe', 'open_app', 'app_look', 'app_act', 'browser_open', 'browser_read', 'browser_act',
  'schedule_job', 'change_schedule', 'security_check', 'defender_scan', 'make_tool', 'use_my_tool', 'my_tools', 'use_pack_tool', 'pack_job', 'pack_tools',
  'mcp_use', 'work_on_repo', 'hire_brain', 'ask_cloud', 'ask_specialist', 'edit_my_message', 'discord_mod', 'manage_email', 'read_email', 'read_calendar',
  'watch_page', 'call_api', 'meeting_notes', 'make_3d_model', 'make_3d_part', 'workshop_run',
  'save_reference']); // save_reference: the Lab copy of Bob has no reference shelf set up, so it would fail where real Bob works
const NOT_SET_UP = new Set(['make_image', 'make_video', 'make_music', 'make_sound']);

async function runJob(j) {
  const kit = await loadBob(L.bob, kitOpts);
  const tavilyUsed = keyedSearch(kit);
  const brain = kit.brain;
  for (const n of NOT_HERE) delete brain.tools[n];
  brain.cfg.loopHelpOff = false; brain.cfg.toolHelp = true;
  const steps = []; const missing = new Set(); let real = 0, asks = 0;
  // the job's own starting files (an ideas row's setup), then its scene
  const start = plantScene(kit, { files: j.setup.filter((f) => f && typeof f.path === 'string').map((f) => ({ path: f.path, content: String(f.content ?? '') })) }, { day: today });
  let sc = { scene: null, problems: [], made: 'none' };
  try { sc = await sceneFor(j); } catch (e) { sc.problems = [`scene not made: ${String(e.message || e).slice(0, 200)}`]; }
  const put = plantScene(kit, sc.scene, { day: today });
  const planted = [...new Set([...start.files, ...put.files])];
  const scene = { made: sc.made, files: put.files, folders: put.folders, board: put.board, memory: put.memory, skipped: [...start.skipped, ...put.skipped], problems: sc.problems };
  // 15 Nov (Opus read of the first trial): the runner used to replace Bob's runTool, so his own step record, checks,
  // retries and "already open" rules never ran and his closing check nudged "only 0 tool steps ran" after real steps.
  // Now Bob's own runTool runs every call; only the paths are moved into this job's throwaway home first, and every
  // card is answered OK (as a person tapping it), every ask_user gets its first choice.
  const bobRunTool = brain.runTool.bind(brain);
  const who = () => brain.cfg.userName || 'the user';
  brain.approve = async () => true;
  brain.askUser = async ({ question, choices } = {}) => {
    const list = [...new Set([].concat(choices || []).map((c) => String(c ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
    if (!String(question || '').trim() || list.length < 2) throw new Error('ask_user needs a question and at least 2 choices.');
    return `${who()} picked: ${list[0]}`;
  };
  brain.runTool = async (name, args, ctx) => {
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
    args = args || {};
    const tool = brain.tools[name];
    const params = tool?.schema?.function?.parameters;
    const call = { name, args: deepNeutral(kit, args), complete: params ? !checkArgs(params, args).problems.length : true };
    call.kind = !tool ? 'none' : OWN.has(name) ? 'bob' : name === 'ask_user' ? 'pick' : NOT_SET_UP.has(name) ? 'setup' : 'real';
    if (!tool) missing.add(name); else if (call.kind === 'real') real++;
    (steps.at(-1)?.calls || steps).push(call);
    const { args: a, bad } = kit.sandboxArgs(args);
    let res;
    if (name === 'web_search' && !bad) { await searchTurn(); webSearches++; }
    try {
      res = bad ? { text: `Error: ${kit.neutral(bad)} is outside the folders Bob may use here` }
        : await Promise.race([bobRunTool(name, a, ctx), wait(120000).then(() => ({ text: `Error: ${name} took too long` }))]);
    } catch (e) { if (ctx?.signal?.aborted) throw e; res = { text: `Error: ${String(e?.message || e)}` }; }
    const t = typeof res === 'string' ? res : typeof res?.text === 'string' ? res.text : JSON.stringify(res ?? '');
    if (name === 'web_search' && !bad) { counted(tavilyUsed()); noResultsInRow = BLOCKED.test(t) ? noResultsInRow + 1 : 0; if (noResultsInRow >= 5) searchStop = true; }
    call.result = kit.neutral(t).slice(0, 6000);
    return { ...(res && typeof res === 'object' ? res : {}), text: kit.neutral(t) || '(no result)' };
  };
  brain.ensureModel = async () => {}; brain.fitCtx = async () => ctxSize; brain.recall = async () => '';
  brain.engine = {
    async chat(q) {
      asks++;
      // 16 Nov: the brain sees only neutral names (Bob's prompt and tool list hold the throwaway folder's real paths)
      const out = deepNeutral(kit, q.messages);
      const msgs = (await strictTemplate()) ? foldSystem(out) : out;
      const think = q.think === undefined ? true : Boolean(q.think);
      const body = { cache_prompt: true, messages: LlamaCpp.toOpenAI(msgs), ...(q.tools?.length ? { tools: deepNeutral(kit, q.tools) } : {}), max_tokens: Number(o.max), stream: false,
        chat_template_kwargs: { enable_thinking: think }, temperature: q.tools?.length ? 0.6 : 0.7, top_p: 0.8, top_k: 20 };
      const t0 = Date.now();
      const r = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify(body), signal: q.signal });
      if (!r.ok) {
        const full = await r.text();
        if (!strict && MID_SYSTEM_REFUSED.test(full)) { strict = true; asks--; return this.chat(q); }
        throw new Error(`llama-server ${r.status}: ${full.slice(0, 300)}`);
      }
      const res = await r.json(); const m = res.choices?.[0]?.message || {};
      steps.push({ think, thinking: kit.neutral(String(m.reasoning_content || '')), content: kit.neutral(String(m.content || '')), calls: [], secs: (Date.now() - t0) / 1000, tokens: res.usage?.completion_tokens ?? null, prompt_tokens: res.usage?.prompt_tokens ?? null, finish: res.choices?.[0]?.finish_reason || '' });
      const calls = (m.tool_calls || []).map((c) => { let a = {}, raw; try { a = JSON.parse(c.function?.arguments || '{}'); } catch { raw = c.function?.arguments; } return { function: { name: c.function?.name, arguments: a, ...(raw !== undefined ? { raw } : {}) } }; });
      if (!calls.length && q.tools?.length) { const tc = textCalls(m.content || '', new Set(q.tools.map((x) => x.function?.name))); if (tc) return { role: 'assistant', content: tc.text, tool_calls: tc.calls }; }
      return { role: 'assistant', content: m.content || '', tool_calls: calls.length ? calls : undefined };
    },
    unloadAll: async () => [], loaded: async () => [], unload: async () => [], isLoaded: async () => true
  };
  const t0 = Date.now(); const session = `job-${j.id}`; let error = '';
  try {
    const { jobId } = brain.enqueue(session, j.text);
    const until = Date.now() + Number(o['job-minutes']) * 60000;
    for (;;) { const s = brain.queue.find((x) => x.id === jobId); if (!s || ['done', 'failed', 'interrupted', 'cancelled'].includes(s.state)) { if (s && s.state !== 'done') error = `${s.state}: ${String(s.error || '')}`; break; } if (Date.now() > until) { error = 'took too long'; try { brain.cancel?.(jobId); } catch {} break; } await wait(200); }
  } catch (e) { error = String(e.message || e); }
  const said = brain.session(session).filter((m) => m.role === 'assistant' && !m.tool_calls?.length).map((m) => String(m.content || '')).join(' ').trim();
  const row = {
    id: j.id, job: j.job, text: j.text, ...(j.from ? { from: j.from } : {}), planted, scene, said: kit.neutral(said), steps, asks, real, standins: [], missing: [...missing],
    secs: (Date.now() - t0) / 1000, ...(error ? { error: kit.neutral(error).slice(0, 400) } : {}),
    family: 'qwen', tool_shapes: kit.toolShapes, bob_src: kit.bobSrc, brain: process.env.LAB_MODEL_NAME || 'served', at: new Date().toISOString(),
    messages: deepNeutral(kit, brain.session(session))
  };
  kit.done();
  return row;
}

// ---- run, a few at a time (the owner: "dont drown it with a bunch of parallel runs") ----
const stopAt = Number(o.hours) > 0 ? Date.now() + Number(o.hours) * 3600000 : Infinity;
let next = 0, ran = 0;
async function worker() {
  while (next < queue.length && Date.now() < stopAt) {
    const j = queue[next++];
    let row;
    try { row = await runJob(j); } catch (e) { row = { id: j.id, job: j.job, text: j.text, error: String(e.message || e).slice(0, 400), steps: [], at: new Date().toISOString() }; }
    save(F.runs, row); ran++;
    say(`${String(ran).padStart(3)} ${row.error ? 'ERR ' : row.said ? 'done' : 'no words'} ${row.id} ${String(row.text).slice(0, 60)} -> ${(row.steps || []).flatMap((s) => s.calls || []).map((c) => c.name).join(',') || 'no tool'} (${row.asks || 0} steps, ${(row.secs || 0).toFixed(0)} s${row.standins?.length ? `, stand-ins: ${row.standins.join(',')}` : ''})`);
    if (/ECONNREFUSED|fetch failed/.test(row.error || '')) { say('the brain is gone (connection refused): stopping'); next = queue.length; }
    if (searchStop && next < queue.length) { say('5 web searches in a row found nothing (the search pages may be blocking this PC): stopping, so no more of the rental goes on jobs whose searches fail'); next = queue.length; }
    if (!budgetStop && searchesLeft() <= 0 && next < queue.length) { budgetStop = true; say(`${searches} Tavily searches made: this month's search budget is used, so no new job starts; ${queue.length - next} wait for the next run`); next = queue.length; }
  }
}
await Promise.all(Array.from({ length: Math.max(1, Number(o.parallel)) }, worker));
const all = readJsonl(F.runs);
const n = all.length, by = (f) => all.filter(f).length;
const lines = [`# Do jobs: ${path.basename(dir)}`, '', `${n} runs. Answered in words: ${by((r) => r.said)}. Errors: ${by((r) => r.error)}. Called a tool this test Bob hasn't got: ${by((r) => r.missing?.length)}. With a scene: ${by((r) => r.scene?.files?.length || r.scene?.folders?.length || r.scene?.board || r.scene?.memory)}. Every run is read by Opus before any is kept.${searchStop ? ' Stopped early: web search found nothing 5 times in a row.' : ''}${budgetStop ? " Stopped early: this month's search budget was used." : ''}`, '', `Web searches this run: ${webSearches}; Tavily searches (the backup, and key checks): ${searches}${Number.isFinite(searchesLeft()) ? ` (about ${Math.max(0, searchesLeft())} left this month)` : ''}. Jobs not started: ${Math.max(0, queue.length - ran)}.`];
fs.writeFileSync(F.summary, scrub(lines.join('\n') + '\n'));
say(`\n${lines.slice(2).join('\n')}\nRuns: ${F.runs}`);
process.exit(0);
