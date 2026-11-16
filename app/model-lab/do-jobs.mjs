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
//      [--preflight] [--slot-ctx N]
// Jobs: one per line, {id, text, setup?: [{path, content}]} (the lesson writer's ideas files work as they are; only the
// request and its starting files are used, never an old answer). --never: held-out / test files; a job whose request
// matches one of theirs is never run. Runs go to <out>/<dir>/runs.jsonl (one row per job, picked up again after a stop).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { opts, locate, appendJsonl, readJsonl } from './common.mjs';
import { loadBob } from './bob-kit.mjs';

const o = opts({ parallel: 2, max: 4096, 'job-minutes': 10, hours: 0 });
const L = locate(o);
const url = String(o.url || process.env.LAB_URL || '');
const dir = path.join(L.out, String(o.dir || 'do-jobs'));
fs.mkdirSync(dir, { recursive: true });
const F = { runs: path.join(dir, 'runs.jsonl'), summary: path.join(dir, 'summary.md') };
const say = (...a) => console.log(...a);
const fail = (why) => { console.log(`PRE-FLIGHT FAIL: ${why}`); process.exit(1); };

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
let jobs = files.flatMap((f) => readJsonl(f)).filter((j) => j && typeof j.text === 'string' && j.text.trim()).map((j, i) => ({ id: String(j.id || `job-${i}`), job: j.job || '', text: j.text, setup: Array.isArray(j.setup) ? j.setup : [] }));
const held = jobs.filter((j) => never.has(norm(j.text)));
jobs = jobs.filter((j) => !never.has(norm(j.text)));
const seen = new Set(); jobs = jobs.filter((j) => (seen.has(j.id) ? false : seen.add(j.id)));
const done = new Set(readJsonl(F.runs).map((r) => r.id));
const queue = jobs.filter((j) => !done.has(j.id)).slice(0, Number(o.count || 1e9));
say(`pre-flight: jobs file(s) ${files.join(', ')}: ${jobs.length + held.length} rows`);
if (o.never) say(`pre-flight: ${held.length} held-out request(s) left out (--never: ${neverFiles.length} file(s), ${never.size} requests known)`);
say(`pre-flight: ${done.size} already run in this folder, ${queue.length} to go`);

const probe = await loadBob(L.bob, { home: true });
say(`Bob's tools from ${L.bob}: ${probe.bobSrc?.version || '?'}${probe.bobSrc?.commit ? ` (${probe.bobSrc.commit})` : ''}; tool shape ${probe.toolShapes ?? '?'}`);
if (o['want-shapes'] !== undefined && String(probe.toolShapes) !== String(o['want-shapes'])) fail(`Bob's tools are shape ${probe.toolShapes ?? '?'}, not ${o['want-shapes']}`);
probe.done();
if (!queue.length && !o.preflight) { say('nothing to run'); process.exit(0); }
if (o.preflight) { say('pre-flight OK'); process.exit(0); }
if (!url) fail('--url <llama-server> is needed');

const bobUrl = (f) => pathToFileURL(path.join(L.bob, 'src', f)).href;
const { textCalls, LlamaCpp } = await import(bobUrl('llamacpp.js'));
const { checkArgs } = await import(bobUrl('loop-help.js'));
const { MID_SYSTEM_REFUSED, foldSystem } = await import(bobUrl('system-notes.js'));
const auth = process.env.LAB_API_KEY ? { authorization: `Bearer ${process.env.LAB_API_KEY}` } : {};
const ctxSize = Number(o['slot-ctx'] || o.ctx || 32768);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let strict = null;
const strictTemplate = async () => {
  if (strict === null) { try { strict = MID_SYSTEM_REFUSED.test(String((await (await fetch(`${url}/props`, { headers: auth })).json())?.chat_template || '')); } catch { strict = false; } }
  return strict;
};
// Bob's own answers (no outside effect) and the tools that run for real in the throwaway folder or on the web
// neutralise every string inside a value (not its JSON text: a swapped-in Windows path would break the escapes)
const deepNeutral = (kit, v) => (typeof v === 'string' ? kit.neutral(v) : Array.isArray(v) ? v.map((x) => deepNeutral(kit, x)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepNeutral(kit, x)])) : v);
process.setMaxListeners(Math.max(process.getMaxListeners(), 200)); // each job's Bob adds its own exit hooks
const OWN = new Set(['use_tools', 'bob_help', 'offer_setup', 'pick_session', 'show_plan', 'ask_together']);
// 15 Nov (owner: "everything was supposed to run for real", "stand ins need to give real results"): every tool Bob
// offers here runs for real, inside this job's throwaway home (or against public web records), and its real answer or
// real error goes back. Tools that would act on the real computer or on someone's accounts, or need an app this test
// home doesn't have, are not offered at all, so this Bob simply hasn't got them (as a Bob with those Hands off).
export const NOT_HERE = new Set(['run_command', 'run_recipe', 'open_app', 'app_look', 'app_act', 'browser_open', 'browser_read', 'browser_act',
  'schedule_job', 'change_schedule', 'security_check', 'defender_scan', 'make_tool', 'use_my_tool', 'my_tools', 'use_pack_tool', 'pack_job', 'pack_tools',
  'mcp_use', 'work_on_repo', 'hire_brain', 'ask_cloud', 'ask_specialist', 'edit_my_message', 'discord_mod', 'manage_email', 'read_email', 'read_calendar',
  'watch_page', 'call_api', 'meeting_notes', 'make_image', 'make_sound', 'make_music', 'make_video', 'make_3d_model', 'make_3d_part', 'workshop_run',
  'save_reference']); // save_reference: the Lab copy of Bob has no reference shelf set up, so it would fail where real Bob works

function plant(kit, files) {
  const kept = [];
  for (const f of files || []) {
    if (!f || typeof f.path !== 'string') continue;
    const p = kit.toReal(/^([a-z]:|[\\/]|~)/i.test(f.path) ? f.path : `C:\\Users\\you\\${f.path.replace(/\//g, '\\')}`);
    if (!kit.homeDir || !path.resolve(p).startsWith(path.resolve(kit.homeDir) + path.sep)) continue; // only inside the throwaway home
    fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, String(f.content || '').slice(0, 20000)); kept.push(f.path);
  }
  return kept;
}

async function runJob(j) {
  const kit = await loadBob(L.bob, { home: true });
  const brain = kit.brain;
  for (const n of NOT_HERE) delete brain.tools[n];
  brain.cfg.loopHelpOff = false; brain.cfg.toolHelp = true;
  const steps = []; const missing = new Set(); let real = 0, asks = 0;
  const planted = plant(kit, j.setup);
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
    call.kind = !tool ? 'none' : OWN.has(name) ? 'bob' : name === 'ask_user' ? 'pick' : 'real';
    if (!tool) missing.add(name); else if (call.kind === 'real') real++;
    (steps.at(-1)?.calls || steps).push(call);
    const { args: a, bad } = kit.sandboxArgs(args);
    let res;
    try {
      res = bad ? { text: `Error: ${kit.neutral(bad)} is outside the folders Bob may use here` }
        : await Promise.race([bobRunTool(name, a, ctx), wait(120000).then(() => ({ text: `Error: ${name} took too long` }))]);
    } catch (e) { if (ctx?.signal?.aborted) throw e; res = { text: `Error: ${String(e?.message || e)}` }; }
    const t = typeof res === 'string' ? res : typeof res?.text === 'string' ? res.text : JSON.stringify(res ?? '');
    call.result = kit.neutral(t).slice(0, 6000);
    return { ...(res && typeof res === 'object' ? res : {}), text: kit.neutral(t) || '(no result)' };
  };
  brain.ensureModel = async () => {}; brain.fitCtx = async () => ctxSize; brain.recall = async () => '';
  brain.engine = {
    async chat(q) {
      asks++;
      const msgs = (await strictTemplate()) ? foldSystem(q.messages) : q.messages;
      const think = q.think === undefined ? true : Boolean(q.think);
      const body = { cache_prompt: true, messages: LlamaCpp.toOpenAI(msgs), ...(q.tools?.length ? { tools: q.tools } : {}), max_tokens: Number(o.max), stream: false,
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
    id: j.id, job: j.job, text: j.text, planted, said: kit.neutral(said), steps, asks, real, standins: [], missing: [...missing],
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
    appendJsonl(F.runs, row); ran++;
    say(`${String(ran).padStart(3)} ${row.error ? 'ERR ' : row.said ? 'done' : 'no words'} ${row.id} ${String(row.text).slice(0, 60)} -> ${(row.steps || []).flatMap((s) => s.calls || []).map((c) => c.name).join(',') || 'no tool'} (${row.asks || 0} steps, ${(row.secs || 0).toFixed(0)} s${row.standins?.length ? `, stand-ins: ${row.standins.join(',')}` : ''})`);
    if (/ECONNREFUSED|fetch failed/.test(row.error || '')) { say('the brain is gone (connection refused): stopping'); next = queue.length; }
  }
}
await Promise.all(Array.from({ length: Math.max(1, Number(o.parallel)) }, worker));
const all = readJsonl(F.runs);
const n = all.length, by = (f) => all.filter(f).length;
const lines = [`# Do jobs: ${path.basename(dir)}`, '', `${n} runs. Answered in words: ${by((r) => r.said)}. Errors: ${by((r) => r.error)}. Called a tool this test Bob hasn't got: ${by((r) => r.missing?.length)}. Every run is read by Opus before any is kept.`];
fs.writeFileSync(F.summary, lines.join('\n') + '\n');
say(`\n${lines.slice(2).join('\n')}\nRuns: ${F.runs}`);
process.exit(0);
