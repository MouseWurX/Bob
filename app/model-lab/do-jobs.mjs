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
//      [--search-probe] [--search-gap 2] [--search tavily] [--search-month N] [--search-cap N [--search-group <name>]]
//      [--family qwen|gpt-oss]
//      [--search-ledger <file>] [--effort low|medium|high|extreme] [--solo-effort] [--lora-scale N] [--scenes-only]
//      [--no-selftest] [--world-stop off] [--search-stop off]
//      [--search-cache <file>] [--cap-go-on] [--leave-out-kinds web,...]
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
// jobs not started stay in the queue for the next run (runs.jsonl picks up where it stopped). --search-cap N (the owner,
// 16 Nov: "big brain search cap to 800"): this start of the run makes at most N Tavily searches of its own, its key
// check included, whatever the month has left; each job's Bob gets his cap from what's left of it too. --search-group
// <name>: the cap is shared by every run given that name this month (run 3 and the 800 jobs on one rental), counted in
// <out>/tavily-searches-<year-month>-<name>.json.
// --family gpt-oss (16 Nov, the owner: "let's try a rental with gpt-oss and see how it performs"): the served brain is a
// GPT-OSS one. Bob's loop then uses that family's own tool set (tool-sets.js: its list_folder/search_files wording, two
// helpers left out, a group stays one message), asks for thinking the GPT-OSS way (model-family.js thinkKwargs: a tool
// step is reasoning low, planning and the answer its own medium) with its own sampling, and the runs are stamped
// family gpt-oss. The scene writer asks for reasoning low. Default: qwen, as before.
// --effort / --solo-effort (16 Nov, the owner: test the distilled A3B "both before and after our effort changes"; "if our
// changes to the effort settings for a single brain makes it fail more we will not proceed with that part of the update"):
// every job is asked at this Effort (default low, as before), and --solo-effort turns on Effort on one brain
// (solo-effort.js, PR #279) for this Bob. Each row records both, so one brain's runs compare before and after.
// --search-ledger <file>: the month's ledger of another Lab copy on this PC (two copies share one month's searches).
// --lora-scale N: every ask to the brain says how much of the server's add-on (llama-server --lora, id 0) to use: 0 is the
// plain brain, 1 the add-on, so one server answers both (each slot changes over as asked).
// --scenes-only: only write the test worlds (--scene make) for the jobs to go, save them, and stop; runs at several
// efforts then start from the very same worlds (--scene reuse --scenes <that folder>/scenes.jsonl).
// --search-cache <file>: a web_search query already answered (with results) by any run sharing this file gets the same
// real result again, so several runs of the same jobs spend Tavily searches once per query, not once per run.
// --cap-go-on (the owner, 16 Nov: "small brain keeps 100" searches): once --search-cap is used, jobs still start; Bob's
// own backup cap stops his Tavily searches there and he says so himself (each row: search_capped). The month's budget
// still stops new jobs. --leave-out-kinds web: jobs of those kinds (the ideas' "job" field) are not run.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { opts, locate, appendJsonl, readJsonl } from './common.mjs';
import { loadBob } from './bob-kit.mjs';
import { makeScene, plantScene, sceneCache, fillNamed } from './scenes.mjs';
import { harnessFaults, namedFiles, namedFolders, TYPED_CHOICE, FAULTS } from './harness-faults.mjs';
import { png as pngFile, pdf as pdfFile } from './scene-files.mjs';
import { labKey, scrubber, tavilyCheck, tavilyUsage } from './lab-keys.mjs';
import { fitMail, sortCardAnswer } from './mail-world.mjs';
import { officeAfter } from './office-jobs.mjs';
import { buildBytes } from './office-files.mjs';

const o = opts({ parallel: 2, max: 4096, 'job-minutes': 10, hours: 0, 'search-gap': 2 });
const L = locate(o);
const url = String(o.url || process.env.LAB_URL || '');
const dir = path.join(L.out, String(o.dir || 'do-jobs'));
fs.mkdirSync(dir, { recursive: true });
const F = { runs: path.join(dir, 'runs.jsonl'), summary: path.join(dir, 'summary.md'), scenes: path.join(dir, 'scenes.jsonl') };
let scrub = (t) => t; // set once a key is opened: nothing printed or saved can hold it
const say = (...a) => console.log(...a.map((x) => scrub(String(x))));
const save = (file, row) => appendJsonl(file, JSON.parse(scrub(JSON.stringify(row))));
// a search that found nothing, or Bob's line for search pages showing a robot check (web-search.js, 16 Nov); inside a job
// Bob hands the result on wrapped as outside text, so that wrapper may come first (16 Nov, found by the A3B test thread)
const BLOCKED = /^(?:\[Outside text starts[^\]\n]*\]\s*)?(?:No results \(or the search pages changed\)|The search pages are blocking this computer)/;
// 16 Nov (800-job read, 2 runs lost): half an emoji in a request (\ud83d with no partner) made llama-server refuse the
// whole request ("parse error"). Every request body goes out whole: such a half becomes \ufffd. (Bob's own engine does
// the same since this change, llamacpp.js whole(); this covers an older Bob copy too.)
const wholeBody = (body) => JSON.stringify(body).replace(/\\u[dD][89abAB][0-9a-fA-F]{2}(?!\\u[dD][c-fC-F][0-9a-fA-F]{2})|(?<!\\u[dD][89abAB][0-9a-fA-F]{2})\\u[dD][c-fC-F][0-9a-fA-F]{2}/g, '\\ufffd');
const fail = (why) => { console.log(scrub(`PRE-FLIGHT FAIL: ${why}`)); process.exit(1); };

// ---- the jobs: requests only, held-out ones left out ----
const leaveOut = new Set(String(o['leave-out-kinds'] || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
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
let jobs = files.flatMap((f) => readJsonl(f)).filter((j) => j && typeof j.text === 'string' && j.text.trim()).map((j, i) => ({ id: String(j.id || `job-${i}`), job: j.job || '', text: j.text, setup: Array.isArray(j.setup) ? j.setup : [], ...(j.from && typeof j.from === 'object' ? { from: j.from } : {}), ...(j.mail && typeof j.mail === 'object' ? { mail: j.mail, key: String(j.key || '') } : {}), ...(j.office && typeof j.office === 'object' ? { office: j.office, key: String(j.key || '') } : {}) }));
const held = jobs.filter((j) => never.has(norm(j.text)));
jobs = jobs.filter((j) => !never.has(norm(j.text)));
const seen = new Set(); jobs = jobs.filter((j) => (seen.has(j.id) ? false : seen.add(j.id)));
const leftOut = jobs.filter((j) => leaveOut.has(String(j.job).toLowerCase()));
jobs = jobs.filter((j) => !leaveOut.has(String(j.job).toLowerCase()));
// 16 Nov (office coverage): an office job that converts, edits or makes a file needs LibreOffice; without --office the
// test Bob has no Office Hand, so those jobs are left out (and said so), never run as Bob failing
const noOffice = o.office ? [] : jobs.filter((j) => j.office?.lo);
jobs = jobs.filter((j) => !noOffice.includes(j));
const done = new Set(readJsonl(F.runs).map((r) => r.id));
const queue = jobs.filter((j) => !done.has(j.id)).slice(0, Number(o.count || 1e9));
say(`pre-flight: jobs file(s) ${files.join(', ')}: ${jobs.length + held.length} rows`);
if (leaveOut.size) say(`pre-flight: ${leftOut.length} job(s) of kind ${[...leaveOut].join(', ')} left out (--leave-out-kinds)`);
if (noOffice.length) say(`pre-flight: ${noOffice.length} office job(s) left out: they need LibreOffice (--office <soffice>)`);
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
if (o.office) o.office = path.resolve(String(o.office)); // a path next to the kit works from any folder
if (o.office && !fs.existsSync(String(o.office))) fail(`no LibreOffice at --office ${o.office}`);
// The Hands this test Bob has on: those that work inside the throwaway folder. Run, Schedules, Apps, Browser, Make
// tools, MCP and Packs would act on the real PC or need what this home hasn't got, so they're off (Bob offers to switch
// them on, as he would); Office only with --office (LibreOffice).
const HANDS_HERE = ['files', 'sort', 'security', ...(o.office ? ['office'] : [])];
const kitOpts = { world: true, makers: false, docs: true, hands: HANDS_HERE, office: o.office ? String(o.office) : '' };
const FAMILIES = { qwen: 'qwen3.6-35b-a3b', 'gpt-oss': 'gpt-oss-120b' }; // the brain name Bob's loop picks the family's tool set by
const family = String(o.family || 'qwen').toLowerCase();
if (!FAMILIES[family]) fail(`--family ${o.family}: use ${Object.keys(FAMILIES).join(' or ')}`);
// Bob's loop works out the tool set from the brain's name (brain-prompting.js toolSetOf), so each job's Bob is told it
const asFamily = (kit) => { if (family !== 'qwen') kit.cfg.models = { ...(kit.cfg.models || {}), bob: FAMILIES[family] }; return kit; };
const searchWith = String(o.search || '').toLowerCase();
let searchKey = '';
const SEARCH_SPARE = 10; // left over in the month for the next pre-flight
const monthly = Number(o['search-month']) > 0 ? Number(o['search-month']) : Infinity;
if (o['search-month'] !== undefined && !(Number(o['search-month']) > 0)) fail(`--search-month ${o['search-month']}: give the searches a month allows`);
const runCap = Number(o['search-cap']) > 0 ? Number(o['search-cap']) : Infinity;
const group = o['search-group'] ? String(o['search-group']).replace(/[^\w.-]/g, '_') : '';
if (group && !Number.isFinite(runCap)) fail('--search-group needs --search-cap');
const groupFile = group ? path.join(L.out, `tavily-searches-${new Date().toISOString().slice(0, 7)}-${group}.json`) : '';
if (o['search-cap'] !== undefined && !(Number(o['search-cap']) > 0)) fail(`--search-cap ${o['search-cap']}: give the most Tavily searches this run may make`);
const ledger = o['search-ledger'] ? path.resolve(String(o['search-ledger'])) : path.join(L.out, `tavily-searches-${new Date().toISOString().slice(0, 7)}.json`);
const EFFORTS = ['low', 'medium', 'high', 'extreme'];
const effort = String(o.effort || 'low').toLowerCase();
if (!EFFORTS.includes(effort)) fail(`--effort ${o.effort}: one of ${EFFORTS.join(', ')}`);
const solo = o['solo-effort'] === true || o['solo-effort'] === 'true';
const loraScale = o['lora-scale'] !== undefined ? Number(o['lora-scale']) : null;
if (loraScale !== null && !(loraScale >= 0 && loraScale <= 2)) fail(`--lora-scale ${o['lora-scale']}: give 0 to 2`);
const loraBody = loraScale === null ? {} : { lora: [{ id: 0, scale: loraScale }] };
const scenesOnly = o['scenes-only'] === true;
if (scenesOnly && String(o.scene || '').toLowerCase() !== 'make') fail('--scenes-only needs --scene make');
const cachePath = o['search-cache'] ? path.resolve(String(o['search-cache'])) : '';
const goOn = o['cap-go-on'] === true;
const ledgerUsed = () => { try { return Number(JSON.parse(fs.readFileSync(ledger, 'utf8')).used) || 0; } catch { return 0; } };
let searchLeft = Infinity, searches = 0, budgetStop = false;
let webSearches = 0;
const readUsed = (f) => { try { return Number(JSON.parse(fs.readFileSync(f, 'utf8')).used) || 0; } catch { return 0; } };
const capUsed = () => (group ? readUsed(groupFile) : searches); // what counts against --search-cap
const counted = (n = 1) => {
  if (!(n > 0)) return; searches += n; if (!searchWith) return;
  const at = new Date().toISOString();
  try { fs.writeFileSync(ledger, JSON.stringify({ used: ledgerUsed() + n, at })); } catch {}
  if (group) { try { fs.writeFileSync(groupFile, JSON.stringify({ used: readUsed(groupFile) + n, at })); } catch {} }
};
const monthLeft = () => Math.min(searchLeft - searches, monthly - SEARCH_SPARE - ledgerUsed());
const searchesLeft = () => Math.min(monthLeft(), runCap - capUsed());
const stopLeft = () => (goOn ? monthLeft() : searchesLeft()); // --cap-go-on: only the month stops new jobs
if (searchWith) {
  if (searchWith !== 'tavily') fail(`--search ${o.search}: only tavily is known`);
  const got = labKey('tavily');
  if (!got.key) fail(got.why);
  searchKey = got.key; scrub = scrubber(searchKey);
  // --key-checked (jobs-matrix): another run on this PC checked the key a moment ago, so no search is spent on it again
  const c = o['key-checked'] === true ? { ok: true, skipped: true } : await tavilyCheck(searchKey); if (!c.skipped) counted();
  if (!c.ok) fail(c.status === 401 || c.status === 403 ? `Tavily refused the saved key (error ${c.status}): save it again with "Save Tavily key for the Lab.cmd"` : `the Tavily key couldn't be checked (${c.status ? `error ${c.status}` : c.why})`);
  say(c.skipped ? 'pre-flight: Tavily key found (checked by the first run of this matrix; no search used)' : `pre-flight: Tavily key works (${got.from === 'env' ? 'from LAB_TAVILY_KEY' : 'the saved one'}; 1 search used, ${c.results} result)`);
  const u = await tavilyUsage(searchKey);
  if (u.ok) { searchLeft = Math.max(0, u.limit - u.used - SEARCH_SPARE); say(`pre-flight: Tavily's usage page: ${u.used} of ${u.limit} searches used this month`); }
  else say(`pre-flight: Tavily's usage page didn't say (${u.why}); the Lab's own count is used`);
  if (Number.isFinite(monthly)) say(`pre-flight: the Lab has made ${ledgerUsed()} of its ${monthly} searches this month (--search-month)`);
  if (Number.isFinite(runCap)) say(`pre-flight: ${group ? `the runs in group ${group} make` : 'this run makes'} at most ${runCap} Tavily searches of their own (--search-cap), ${capUsed()} so far`);
  const left = searchesLeft();
  if (Number.isFinite(left)) { say(`pre-flight: this run may make about ${Math.max(0, left)} more web searches`); if (stopLeft() <= 0) fail(runCap - capUsed() <= 0 ? `no web searches are left under --search-cap ${runCap}${group ? ` (group ${group})` : ''}: a search job could not finish` : 'no web searches are left this month: a search job could not finish'); }
  else say('pre-flight: no search budget (--search-month, --search-cap): only 5 failed searches in a row stop the run');
}
// The backup search as Bob's settings hold it (off on every Bob unless its owner turns it on), the key handed in for
// this run only. His count file in this job's home starts at the Lab's count for the month, so his own cap counts the
// Lab's whole month; the function returned says how many Tavily searches he made since it was last asked.
const month = () => new Date().toISOString().slice(0, 7);
function keyedSearch(kit) {
  if (!searchKey) return () => 0;
  const f = path.join(kit.cfg.dataDir, 'search-backup-count.json');
  let seen = ledgerUsed();
  const cap = Math.min(monthly - SEARCH_SPARE, seen + runCap - capUsed()); // his month count starts at the Lab's, so this is the Lab's month and this run's cap
  kit.cfg.searchBackup = { use: { tavily: true }, order: ['tavily'], ...(Number.isFinite(cap) ? { caps: { tavily: Math.max(0, cap) } } : {}), keys: { tavily: searchKey } };
  try { fs.writeFileSync(f, JSON.stringify({ month: month(), used: { tavily: seen } })); } catch {}
  return () => { let now = seen; try { const c = JSON.parse(fs.readFileSync(f, 'utf8')); if (c.month === month()) now = Number(c.used?.tavily) || 0; } catch {} const d = Math.max(0, now - seen); seen = now; return d; };
}

say(`pre-flight: every job is asked at Effort ${effort}${solo ? ', with Effort on one brain switched on' : ' (Effort on one brain off)'}`);
const probe = asFamily(await loadBob(L.bob, kitOpts));
const probeUsed = keyedSearch(probe);
say(`Bob's tools from ${L.bob}: ${probe.bobSrc?.version || '?'}${probe.bobSrc?.commit ? ` (${probe.bobSrc.commit})` : ''}; tool shape ${probe.toolShapes ?? '?'}`);
if (family !== 'qwen') {
  const set = probe.brain.toolSetOf?.(FAMILIES[family]);
  if (set?.id !== family) fail(`this Bob copy has no ${family} tool set (src/tool-sets.js), so its jobs would run in another family's shape`);
  say(`pre-flight: family ${family}: Bob's ${set.label || family} tool set${set.hide?.length ? ` (${set.hide.join(', ')} left out)` : ''}, thinking asked the ${family} way`);
}
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
// 16 Nov (MouseWurX: "we need to close the gaps in the harness"): before any job, the harness checks itself with a
// scripted brain on this computer (jobs-selftest.mjs: one job per way the 800-job run's test world went wrong). A
// failure stops here, before a rented brain does a single job. --no-selftest skips it (the self-test's own runs use it).
if (o['no-selftest'] !== true && (queue.length || o.preflight)) {
  const { selfTest } = await import('./jobs-selftest.mjs');
  const st = await selfTest({ bob: L.bob, office: o.office ? String(o.office) : '', log: (t) => say(`pre-flight: ${t}`) });
  if (!st.ok) fail('the test world failed its self-test (above); fix it before spending a rental on it');
  say(`pre-flight: the test world passed its self-test (${st.results.length} checks)`);
}
if (o.preflight) { say('pre-flight OK'); process.exit(0); }
if (!url) fail('--url <llama-server> is needed');

const bobUrl = (f) => pathToFileURL(path.join(L.bob, 'src', f)).href;
const { textCalls, LlamaCpp } = await import(bobUrl('llamacpp.js'));
const { docText } = await import(bobUrl('doc-text.js')); // office jobs: the files Bob left, read back as words
const { checkArgs } = await import(bobUrl('loop-help.js'));
let saveExport = null; try { ({ saveExport } = await import(bobUrl('diagram.js'))); } catch {}
// 16 Nov (800-job read): make_diagram with save_to waits for the chat window to draw the diagram and send the file
// back; a test home has no window, so the file never came and Bob searched for it (10 runs). The lab stands in for the
// window: it sends back a small real file of the asked type through Bob's own save (diagram.js saveExport, which makes
// the copy save_to asked for). The file holds the diagram's Mermaid text, not a drawing of it; the run row says so
// (call.drawn, "stand-in window"), so a read never takes it for a picture Bob drew.
function standInWindow(kit, text) {
  const dest = String(text).match(/saves it to (.+?) \(a taken name/)?.[1] || '';
  const ext = (dest.match(/\.(png|svg|pdf)$/i)?.[1] || 'png').toLowerCase();
  const dir = kit.cfg.painterDir; if (!saveExport || !dir || !fs.existsSync(dir)) return '';
  const mmd = fs.readdirSync(dir).filter((f) => f.endsWith('.mmd')).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0]?.f;
  if (!mmd) return '';
  const src = fs.readFileSync(path.join(dir, mmd), 'utf8');
  const title = (src.match(/^%% (.*)$/m)?.[1] || 'Diagram').slice(0, 80);
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const data = ext === 'svg' ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${40 + 18 * src.split('\n').length}"><title>${esc(title)}</title>${src.split('\n').map((l, i) => `<text x="10" y="${30 + 18 * i}" font-family="monospace" font-size="14">${esc(l)}</text>`).join('')}</svg>`)
    : ext === 'pdf' ? pdfFile(src, { Title: title, Creator: 'Bob Lab stand-in window' }) : pngFile({ Title: title, Mermaid: src.slice(0, 1900), Software: 'Bob Lab stand-in window' });
  try { const r = saveExport(kit.cfg, { name: mmd, format: ext, data: data.toString('base64') }); return r.copy ? kit.neutral(r.copy) : r.copyError ? `not copied: ${kit.neutral(r.copyError)}` : ''; } catch (e) { return `not saved: ${kit.neutral(String(e.message || e))}`; }
}
const { MID_SYSTEM_REFUSED, foldSystem } = await import(bobUrl('system-notes.js'));
const { thinkKwargs, samplingFor } = await import(bobUrl('model-family.js'));
// how a step asks for thinking, and its sampling: Qwen as before; another family by Bob's own model-family.js
const thinkBody = (think) => (family === 'qwen' ? { chat_template_kwargs: { enable_thinking: think !== false } } : thinkKwargs(family, think));
const sampling = (tools, think) => (family === 'qwen' ? { temperature: tools ? 0.6 : 0.7, top_p: 0.8, top_k: 20 } : samplingFor(null, FAMILIES[family], null, { tools, think }));
const effortOf = (think) => (family === 'gpt-oss' ? (think === false ? 'low' : think === 'high' || think === 'extreme' ? 'high' : 'medium') : undefined);
const auth = process.env.LAB_API_KEY ? { authorization: `Bearer ${process.env.LAB_API_KEY}` } : {};
const today = new Date().toISOString().slice(0, 10);
// The scene writer: the served brain, thinking off, cool, JSON only (llama-server's json_object grammar when it has it)
let jsonMode = true;
async function sceneChat(messages) {
  const body = { cache_prompt: true, messages, max_tokens: 6000, stream: false, ...thinkBody(false), temperature: 0.3, top_p: 0.8, top_k: 20, ...loraBody, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) };
  const r = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: wholeBody(body) });
  if (!r.ok) { const full = await r.text(); if (jsonMode && /response_format|json_object|grammar/i.test(full)) { jsonMode = false; return sceneChat(messages); } throw new Error(`llama-server ${r.status}: ${full.slice(0, 200)}`); }
  return String((await r.json()).choices?.[0]?.message?.content || '');
}
async function sceneFor(j) {
  if (j.mail) return { scene: null, problems: [], made: 'none' }; // an inbox job's world is its mailbox (mail-world.mjs)
  if (j.office) return { scene: null, problems: [], made: 'none' }; // an office job brings its own files (office-jobs.mjs)
  const had = scenes.get(j.id, j.text);
  // 16 Nov (800-job read): a scene whose reply couldn't be read was saved and then reused as an empty home every time;
  // with --scene make it is written again instead
  if (had && !(had.ok === false && sceneMode === 'make')) return { scene: had.scene, problems: had.problems || [], made: 'reused' };
  if (sceneMode !== 'make') return { scene: null, problems: [], made: 'none' };
  const got = await makeScene(j.text, sceneChat, { today });
  const row = { id: j.id, text: j.text, scene: got.scene, problems: got.problems, ok: got.ok, by: process.env.LAB_MODEL_NAME || 'served', at: new Date().toISOString() };
  scenes.put(row); save(F.scenes, row);
  return { scene: got.scene, problems: got.problems, made: 'new' };
}
if (scenesOnly) {
  let i = 0, made = 0, bad = 0;
  const one = async () => { while (i < queue.length) { const j = queue[i++]; try { const r = await sceneFor(j); if (r.made === 'new') made++; if (r.problems?.length) bad++; say(`scene ${j.id}: ${r.made}${r.problems?.length ? ` (${r.problems.length} problem(s))` : ''}`); } catch (e) { bad++; say(`scene ${j.id}: not made (${String(e.message || e).slice(0, 160)})`); if (/ECONNREFUSED|fetch failed/.test(String(e.message || e))) i = queue.length; } } };
  await Promise.all(Array.from({ length: Math.max(1, Number(o.parallel)) }, one));
  say(`scenes: ${made} new, ${queue.length - made} already saved, ${bad} with problems; saved in ${F.scenes}`);
  process.exit(0);
}
// the shared answer cache for web_search (--search-cache): one row per query that found something
const cacheKey = (a) => norm(a?.query || a?.q || '');
const cacheGet = (k) => { if (!cachePath || !k) return null; try { for (const r of readJsonl(cachePath)) if (r.k === k) return r.text; } catch {} return null; };
const cachePut = (k, text) => { if (cachePath && k && text && !BLOCKED.test(text) && !/^Error/.test(text)) try { appendJsonl(cachePath, JSON.parse(scrub(JSON.stringify({ k, text, at: new Date().toISOString() })))); } catch {} };
let cacheHits = 0;
// 16 Nov: the PC's IP was bot-blocked and every web_search came back with Bob's "No results" line
let lastSearch = 0, noResultsInRow = 0, searchStop = false;
// --search-stop off: keep going after 5 empty searches (a replay, jobs-recheck.mjs, is offline on purpose)
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
  const kit = asFamily(await loadBob(L.bob, kitOpts));
  const tavilyUsed = keyedSearch(kit);
  const brain = kit.brain;
  for (const n of NOT_HERE) delete brain.tools[n];
  // 16 Nov (MouseWurX: tests "to make sure bob can manage an email inbox"): an inbox job gets Bob's own read_email and
  // manage_email, his account set up on a made-up mailbox (mail-world.mjs) that answers nothing else, so nothing can be sent
  const mw = j.mail ? await fitMail(kit, j.mail) : null;
  // 16 Nov (MouseWurX: test Bob's features "one category at a time. starting with office files"): an office job plants its
  // own made-up files (office-jobs.mjs) and has "Let Bob compare files" on, as a person who asked for it would; 17 Nov: and the calculator, so the
  // head-maths job (excel-sum-tricky) can show whether the maths check sends sums to calculate, and query_data for the big sheet
  let ow = null;
  if (j.office) {
    kit.cfg.moreTools = { ...(kit.cfg.moreTools || {}), compareFiles: true, calculator: true, dataQuery: true };
    const want = (j.office.files || []).filter((f) => f && typeof f.path === 'string');
    const put = plantScene(kit, { files: want.map((f) => ({ path: f.path, content: String(f.content ?? ''), ...(f.meta ? { meta: f.meta } : {}) })) }, { day: today });
    // 17 Nov ("expand the office set"): a file with a build (several sheets, formulas, a table, a big sheet, a broken file)
    // is made by office-files.mjs over what plantScene wrote; a readOnly folder is one Bob may only read (Settings, Hands)
    for (const f of want.filter((x) => x.build)) { const r = kit.place(f.path); if (r && fs.existsSync(r)) try { fs.writeFileSync(r, buildBytes(f.build)); } catch (e) { put.skipped.push({ path: f.path, why: `not built: ${String(e.message || e).slice(0, 120)}` }); } }
    for (const d of [].concat(j.office.readOnly || [])) { const r = kit.allow(d); if (r) kit.cfg.readOnlyRoots = [...(kit.cfg.readOnlyRoots || []), r]; }
    ow = { files: put.files, missing: [...put.skipped.map((x) => `${x.path}: ${x.why}`), ...want.filter((f) => !put.files.some((p) => p.toLowerCase().endsWith(f.path.split('\\').pop().toLowerCase()))).map((f) => f.path)].filter((x, i, a) => a.indexOf(x) === i) };
  }
  brain.cfg.loopHelpOff = false; brain.cfg.toolHelp = true;
  if (solo) brain.cfg.soloEffort = true;
  const steps = []; const missing = new Set(); let real = 0, asks = 0;
  // the job's own starting files (an ideas row's setup), then its scene
  const start = plantScene(kit, { files: j.setup.filter((f) => f && typeof f.path === 'string').map((f) => ({ path: f.path, content: String(f.content ?? '') })) }, { day: today });
  let sc = { scene: null, problems: [], made: 'none' };
  try { sc = await sceneFor(j); } catch (e) { sc.problems = [`scene not made: ${String(e.message || e).slice(0, 200)}`]; }
  const put = plantScene(kit, sc.scene, { day: today });
  // a sound, video, program or picture file the request names but the scene left out is added (scenes.mjs fillNamed)
  if (sc.made !== 'none') { const more = plantScene(kit, { files: fillNamed({ files: [...(sc.scene?.files || []), ...start.files.map((p) => ({ path: p }))] }, j.text, namedFiles) }, { day: today }); put.files.push(...more.files); put.skipped.push(...more.skipped); put.codeDirs.push(...more.codeDirs); }
  // 16 Nov (GPT-OSS trial): a folder the request names in quotes ("rename the folder 'Old Projects'") that the scene left
  // out is made empty in the home folder the request names, else Documents, so the job has something to work on
  if (sc.made !== 'none') {
    const parts = new Set([...(sc.scene?.folders || []), ...put.files].flatMap((d) => String(d).split(/[\\/]/)).map((x) => x.toLowerCase()));
    const home = String(j.text).match(/\b(Downloads|Desktop|Documents|Pictures|Music|Videos)\b/i)?.[1];
    const want = namedFolders(j.text).filter((d) => !parts.has(d.toLowerCase())).map((d) => `C:\\Users\\you\\${home ? home[0].toUpperCase() + home.slice(1).toLowerCase() : 'Documents'}\\${d}`);
    if (want.length) { const more = plantScene(kit, { folders: want }, { day: today }); put.folders.push(...more.folders); put.skipped.push(...more.skipped); if (sc.scene) sc.scene.folders = [...(sc.scene.folders || []), ...want]; }
  }
  const planted = [...new Set([...start.files, ...put.files, ...(ow?.files || [])])];
  // 16 Nov (Opus read of run 3): a coding job's planted script sat outside any project, so Bob's guard (tools.js) refused
  // every edit and the job couldn't be done. Its folder is a project of this test home, as a person who codes with Bob has.
  const codeDirs = [...new Set([...start.codeDirs, ...put.codeDirs])];
  if (codeDirs.length) kit.cfg.projects = { ...(kit.cfg.projects || {}), ...Object.fromEntries(codeDirs.map((d, i) => [path.basename(d) || `project${i + 1}`, d])) };
  const scene = { made: sc.made, ...(codeDirs.length ? { projects: codeDirs.map((d) => kit.neutral(d)) } : {}), files: put.files, folders: put.folders, board: put.board, memory: put.memory, skipped: [...start.skipped, ...put.skipped], problems: sc.problems };
  // 15 Nov (Opus read of the first trial): the runner used to replace Bob's runTool, so his own step record, checks,
  // retries and "already open" rules never ran and his closing check nudged "only 0 tool steps ran" after real steps.
  // Now Bob's own runTool runs every call; only the paths are moved into this job's throwaway home first, and every
  // card is answered OK (as a person tapping it), every ask_user gets its first choice.
  const bobRunTool = brain.runTool.bind(brain);
  const who = () => brain.cfg.userName || 'the user';
  // 16 Nov (Opus read of run 3): the card with all of a job's OKs on it (together.js) reads { allow: true }; a bare true
  // came back as "the user said no" to every step on it
  // An inbox sort plan (manage_email sort) is its own card: the test person OKs Bob's plan as he made it, and it is kept.
  let sortCards = [];
  brain.approve = async (need) => (need && typeof need === 'object' && need.sortCard ? (sortCards.push(need.sortCard), sortCardAnswer(need.sortCard)) : need && typeof need === 'object' && Array.isArray(need.together) ? { allow: true } : true);
  brain.askUser = async ({ question, choices } = {}) => {
    const list = [...new Set([].concat(choices || []).map((c) => String(c ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
    if (!String(question || '').trim() || list.length < 2) throw new Error('ask_user needs a question and at least 2 choices.');
    // 16 Nov: the first real choice; "I'll type it" or "something else" picked first gave the brain nothing to go on.
    // 800-job read: "here's the script path:" and "I'll type both" slipped past, so the wording list is shared with the
    // fault check (harness-faults.mjs). When every choice is a "let me type it" one, the test person has nothing to type
    // and says so, as a person in a hurry would, so the brain goes on with what it has instead of waiting forever.
    const real = list.find((c) => !TYPED_CHOICE.test(c));
    return real ? `${who()} picked: ${real}` : `${who()} picked: ${list[0]}\n${who()} typed: nothing more to add; go on with what you have and say what you assumed.`;
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
    const hit = name === 'web_search' && !bad ? cacheGet(cacheKey(a)) : null;
    if (hit) { cacheHits++; call.cached = true; }
    else if (name === 'web_search' && !bad) { await searchTurn(); webSearches++; }
    try {
      res = hit ? { text: hit } : bad ? { text: `Error: ${kit.neutral(bad)} is outside the folders Bob may use here` }
        : await Promise.race([bobRunTool(name, a, ctx), wait(120000).then(() => ({ text: `Error: ${name} took too long` }))]);
    } catch (e) { if (ctx?.signal?.aborted) throw e; res = { text: `Error: ${String(e?.message || e)}` }; }
    const t = typeof res === 'string' ? res : typeof res?.text === 'string' ? res.text : JSON.stringify(res ?? '');
    if (name === 'web_search' && !bad && !hit) { cachePut(cacheKey(a), t); counted(tavilyUsed()); noResultsInRow = BLOCKED.test(t) ? noResultsInRow + 1 : 0; if (noResultsInRow >= 5 && String(o['search-stop'] ?? 'on').toLowerCase() !== 'off') searchStop = true; }
    if (name === 'make_diagram' && /^Drawing: /.test(t)) { call.drawn = standInWindow(kit, kit.neutral(t)) || 'nothing drawn'; call.window = 'stand-in window (the lab, no chat window)'; }
    call.result = kit.neutral(t).slice(0, 6000);
    return { ...(res && typeof res === 'object' ? res : {}), text: kit.neutral(t) || '(no result)' };
  };
  brain.ensureModel = async () => {}; brain.fitCtx = async () => ctxSize; brain.recall = async () => '';
  // 16 Nov (800-job read, fx-6152c4f84b): Bob checks "saved at C:\\Users\\you\\..." against the disk; here that path is in the
  // test world, so the check looks there (Bob's verify.js brain.fileExists), not for a C: drive this PC hasn't got.
  brain.fileExists = (p) => fs.existsSync(kit.toReal(String(p || '')));
  brain.engine = {
    async chat(q) {
      asks++;
      // 16 Nov: the brain sees only neutral names (Bob's prompt and tool list hold the throwaway folder's real paths)
      const out = deepNeutral(kit, q.messages);
      const msgs = (await strictTemplate()) ? foldSystem(out) : out;
      const asked = q.think; // Bob's loop: false on a tool step (step-thinking.js), 'high' for a deep review, else his default
      const think = asked === undefined ? true : asked === 'high' || asked === 'extreme' ? true : Boolean(asked);
      const body = { cache_prompt: true, messages: LlamaCpp.toOpenAI(msgs), ...(q.tools?.length ? { tools: deepNeutral(kit, q.tools) } : {}), max_tokens: Number(o.max), stream: false,
        ...thinkBody(family === 'qwen' ? think : asked), ...sampling(Boolean(q.tools?.length), asked), ...loraBody };
      const stepEffort = effortOf(asked); // GPT-OSS reasoning level of this step (the job's Effort is `effort`)
      const t0 = Date.now();
      const r = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: wholeBody(body), signal: q.signal });
      if (!r.ok) {
        const full = await r.text();
        if (!strict && MID_SYSTEM_REFUSED.test(full)) { strict = true; asks--; return this.chat(q); }
        throw new Error(`llama-server ${r.status}: ${full.slice(0, 300)}`);
      }
      const res = await r.json(); const m = res.choices?.[0]?.message || {};
      steps.push({ think, ...(stepEffort ? { effort: stepEffort } : {}), thinking: kit.neutral(String(m.reasoning_content || '')), content: kit.neutral(String(m.content || '')), calls: [], secs: (Date.now() - t0) / 1000, tokens: res.usage?.completion_tokens ?? null, prompt_tokens: res.usage?.prompt_tokens ?? null, finish: res.choices?.[0]?.finish_reason || '' });
      const calls = (m.tool_calls || []).map((c) => { let a = {}, raw; try { a = JSON.parse(c.function?.arguments || '{}'); } catch { raw = c.function?.arguments; } return { function: { name: c.function?.name, arguments: a, ...(raw !== undefined ? { raw } : {}) } }; });
      if (!calls.length && q.tools?.length) { const tc = textCalls(m.content || '', new Set(q.tools.map((x) => x.function?.name))); if (tc) return { role: 'assistant', content: tc.text, tool_calls: tc.calls }; }
      return { role: 'assistant', content: m.content || '', tool_calls: calls.length ? calls : undefined };
    },
    unloadAll: async () => [], loaded: async () => [], unload: async () => [], isLoaded: async () => true
  };
  const t0 = Date.now(); const session = `job-${j.id}`; let error = '';
  try {
    const { jobId } = brain.enqueue(session, j.text, [], effort);
    const until = Date.now() + Number(o['job-minutes']) * 60000;
    for (;;) { const s = brain.queue.find((x) => x.id === jobId); if (!s || ['done', 'failed', 'interrupted', 'cancelled'].includes(s.state)) { if (s && s.state !== 'done') error = `${s.state}: ${String(s.error || '')}`; break; } if (Date.now() > until) { error = 'took too long'; try { brain.cancel?.(jobId); } catch {} break; } await wait(200); }
  } catch (e) { error = String(e.message || e); }
  // said: what the user's window shows (16 Nov: Bob marks working text `step` and his reviews and minutes `moot`, so the
  // window shows only the answer); said_all: every plain reply joined, as before, for reading the whole run
  const plain = brain.session(session).filter((m) => m.role === 'assistant' && !m.tool_calls?.length);
  const said = plain.filter((m) => !m.step && !m.moot).map((m) => String(m.content || '')).join(' ').trim();
  const saidAll = plain.map((m) => String(m.content || '')).join(' ').trim();
  const row = {
    id: j.id, job: j.job, text: j.text, ...(j.from ? { from: j.from } : {}), planted, scene, said: kit.neutral(said), ...(saidAll !== said ? { said_all: kit.neutral(saidAll) } : {}), steps, asks, real, standins: [], missing: [...missing],
    secs: (Date.now() - t0) / 1000, ...(error ? { error: kit.neutral(error).slice(0, 400) } : {}),
    effort, solo_effort: solo, search_capped: steps.some((st) => (st.calls || []).some((c) => c.name === 'web_search' && /at its monthly cap/.test(String(c.result || '')))), ...(loraScale !== null ? { lora_scale: loraScale } : {}), family, tool_shapes: kit.toolShapes, bob_src: kit.bobSrc, brain: process.env.LAB_MODEL_NAME || 'served', at: new Date().toISOString(),
    messages: deepNeutral(kit, brain.session(session)),
    ...(ow ? { key: j.key, office: { lo: Boolean(j.office.lo), files: ow.files, missing: ow.missing, after: officeAfter(kit, docText) } } : {}),
    ...(mw ? { key: j.key, mail: { spec: j.mail, cards: sortCards.map((c) => ({ batches: (c.batches || []).map((b) => ({ name: b.name, action: b.action, folder: b.folder, ids: b.ids })), replyFirst: (c.replyFirst || []).map((x) => ({ id: x.id, why: x.why })) })), ...mw.server.after() } } : {})
  };
  // what the test world got wrong in this run, if anything (harness-faults.mjs): kept with the run for the read
  const hf = harnessFaults(row); if (hf.length) row.harness = hf;
  // the self-test reads back the files its jobs left (jobs-selftest.mjs), by the names the brain saw
  if (process.env.LAB_SELFTEST_KEEP && kit.homeDir) {
    const keep = process.env.LAB_SELFTEST_KEEP, walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { fs.mkdirSync(keep, { recursive: true }); fs.copyFileSync(f, path.join(keep, kit.neutral(f).replace(/^[A-Za-z]:/, '').replace(/[\\/]+/g, '_'))); } } };
    try { walk(kit.homeDir); } catch {}
  }
  kit.done();
  return row;
}

// ---- run, a few at a time (the owner: "dont drown it with a bunch of parallel runs") ----
const stopAt = Number(o.hours) > 0 ? Date.now() + Number(o.hours) * 3600000 : Infinity;
let next = 0, ran = 0, worldRuns = 0, worldStop = false;
const worldKinds = {};
// 16 Nov (MouseWurX: "we need to close the gaps in the harness"): once 10 runs are in, if 3 in 10 or more were decided
// by the test world (harness-faults.mjs), no new job starts, so a rental isn't spent on runs the read can't use.
// --world-stop off keeps going (for a run meant to find such faults).
const worldStopOn = String(o['world-stop'] ?? 'on').toLowerCase() !== 'off';
async function worker() {
  while (next < queue.length && Date.now() < stopAt) {
    const j = queue[next++];
    let row;
    try { row = await runJob(j); } catch (e) { row = { id: j.id, job: j.job, text: j.text, error: String(e.message || e).slice(0, 400), steps: [], at: new Date().toISOString() }; }
    save(F.runs, row); ran++;
    if (row.harness?.length) { worldRuns++; for (const f of row.harness) worldKinds[f.kind] = (worldKinds[f.kind] || 0) + 1; say(`     test world: ${row.harness.map((f) => `${f.kind} (${String(f.detail).slice(0, 80)})`).join('; ')}`); }
    if (worldStopOn && !worldStop && ran >= 10 && worldRuns / ran >= 0.3 && next < queue.length) { worldStop = true; say(`${worldRuns} of ${ran} runs were decided by the test world, not the brain (${Object.entries(worldKinds).map(([k, v]) => `${k} ${v}`).join(', ')}): stopping, so no more of the rental goes on runs the read can't use. Fix the test world (npm run lab:selftest) and run again.`); next = queue.length; }
    say(`${String(ran).padStart(3)} ${row.error ? 'ERR ' : row.said ? 'done' : 'no words'} ${row.id} ${String(row.text).slice(0, 60)} -> ${(row.steps || []).flatMap((s) => s.calls || []).map((c) => c.name).join(',') || 'no tool'} (${row.asks || 0} steps, ${(row.secs || 0).toFixed(0)} s${row.standins?.length ? `, stand-ins: ${row.standins.join(',')}` : ''})`);
    if (/ECONNREFUSED|fetch failed/.test(row.error || '')) { say('the brain is gone (connection refused): stopping'); next = queue.length; }
    if (searchStop && next < queue.length) { say('5 web searches in a row found nothing (the search pages may be blocking this PC): stopping, so no more of the rental goes on jobs whose searches fail'); next = queue.length; }
    if (!budgetStop && stopLeft() <= 0 && next < queue.length) { budgetStop = true; say(`${searches} Tavily searches made: the search budget is used (${runCap - capUsed() <= 0 ? `this run's cap of ${runCap}` : "this month's"}), so no new job starts; ${queue.length - next} wait for the next run`); next = queue.length; }
  }
}
await Promise.all(Array.from({ length: Math.max(1, Number(o.parallel)) }, worker));
const all = readJsonl(F.runs);
const n = all.length, by = (f) => all.filter(f).length;
const lines = [`# Do jobs: ${path.basename(dir)}`, '', `${n} runs. Answered in words: ${by((r) => r.said)}. Errors: ${by((r) => r.error)}. Called a tool this test Bob hasn't got: ${by((r) => r.missing?.length)}. With a scene: ${by((r) => r.scene?.files?.length || r.scene?.folders?.length || r.scene?.board || r.scene?.memory)}. Effort: ${effort}${solo ? ' (one brain)' : ''}. Every run is read by Opus before any is kept. Decided by the test world, not the brain: ${by((r) => r.harness?.length)}${(() => { const k = {}; for (const r of all) for (const f of r.harness || []) k[f.kind] = (k[f.kind] || 0) + 1; return Object.keys(k).length ? ` (${Object.entries(k).map(([a, b]) => `${a} ${b}`).join(', ')})` : ''; })()}.${worldStop ? ' Stopped early: 3 in 10 runs or more were decided by the test world.' : ''}${searchStop ? ' Stopped early: web search found nothing 5 times in a row.' : ''}${budgetStop ? ` Stopped early: ${runCap - capUsed() <= 0 ? `this run's search cap (${runCap})` : "this month's search budget"} was used.` : ''}`, '', `Web searches this run: ${webSearches}${cachePath ? ` (+${cacheHits} answered from the shared cache)` : ''}; Tavily searches (the backup, and key checks): ${searches}${Number.isFinite(searchesLeft()) ? ` (about ${Math.max(0, searchesLeft())} more allowed)` : ''}. Jobs not started: ${Math.max(0, queue.length - ran)}.`];
fs.writeFileSync(F.summary, scrub(lines.join('\n') + '\n'));
say(`\n${lines.slice(2).join('\n')}\nRuns: ${F.runs}`);
process.exit(0);
