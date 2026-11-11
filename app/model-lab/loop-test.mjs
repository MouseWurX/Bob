// Loop test (Nov 11): the tool quiz run through Bob's REAL turn loop, not one bare first answer. experts-test.mjs hands a
// brain every tool at once and scores its first reply; Bob's chat never does that (he starts with a few tools and adds
// groups), and that quiz can't see anything the loop does after the first reply. Here each job goes through
// Brain.enqueue with Bob's real toolbox, checks and retries. The brain thinks on a llama-server; the tools are fakes
// with fixed results (nothing on this PC is touched), and a few fail on purpose to see how he recovers.
//
// Each job scores: reached a tool from the right group, every call it ran was complete (nothing missing for the tool),
// a non-empty answer, steps (brain calls), tool calls, seconds. Run it twice to compare: --plain turns Bob's loop
// helps off (loop-help.js), the way Bob worked before Nov 11.
//
// node loop-test.mjs --model C:\...\28Bob-Riker-Q4_K_M.gguf [--plain] [--quick] [--jobs 40] [--ctx 32768] [--port 8094]
// node loop-test.mjs --url http://127.0.0.1:8094 ...   (a llama-server that is already running)
import fs from 'node:fs';
import path from 'node:path';
import { opts, locate, startServer, stamp, checkFree } from './common.mjs';
import { loadBob } from './bob-kit.mjs';

const o = opts({ ctx: 32768, port: 8094 });
if (o.url) process.env.LAB_URL = String(o.url);
const L = locate(o);
if (!process.env.LAB_URL) checkFree(o);
const kit = await loadBob(L.bob);
const { pathToFileURL } = await import('node:url');
const { textCalls } = await import(pathToFileURL(path.join(L.bob, 'src', 'llamacpp.js')).href);
const { LlamaCpp } = await import(pathToFileURL(path.join(L.bob, 'src', 'llamacpp.js')).href);
const { checkArgs } = await import(pathToFileURL(path.join(L.bob, 'src', 'loop-help.js')).href);
const brain = kit.brain;
const plain = Boolean(o.plain);
brain.cfg.loopHelpOff = plain;

// ---- the jobs: every plain request with a group from test/phrasings.js, plus jobs that take several steps ----
const entry = await import(pathToFileURL(path.join(L.bob, 'src', 'lab-entry.js')).href); // the jobs and stand-ins the Lab test shares
const MULTI = entry.MULTI.map((j) => ({ job: 'multi', ...j }));
let jobs = (kit.phrasings || []).filter((p) => p.group && !p.pic && !p.recent).map((p) => ({ ...p, need: [] }));
if (o.quick) jobs = jobs.filter((_, i) => i % 4 === 0);
if (o.jobs) jobs = jobs.slice(0, Number(o.jobs));
jobs.push(...MULTI);

// ---- fake tools: fixed results, a couple of failures on purpose ----
const runs = [];
const realRun = brain.runTool.bind(brain);
const REAL = new Set(['use_tools', 'bob_help', 'offer_setup', 'pick_session', 'show_plan', 'ask_together']); // Bob's own answers
brain.runTool = async (name, args, ctx) => {
  const tool = brain.tools[name];
  const params = tool?.schema?.function?.parameters;
  const ok = params ? !checkArgs(params, args).problems.length : true;
  runs.push({ name, args, complete: ok });
  if (REAL.has(name)) return realRun(name, args, ctx);
  return { text: entry.standIn(name, args) };
};
brain.ensureModel = async () => {}; brain.fitCtx = async () => Number(o.ctx); brain.recall = async () => '';

// ---- the engine: Bob's messages to an OpenAI-style llama-server ----
let server = null;
if (!process.env.LAB_URL) {
  if (!L.model) { console.error('Pass --model <file.gguf> or --url <llama-server>.'); process.exit(1); }
  server = await startServer({ server: L.server, model: L.model, ctx: o.ctx, port: o.port, logFile: path.join(L.out, 'loop-test-server.log') });
}
const url = server ? server.url : process.env.LAB_URL;
let asks = 0;
brain.engine = {
  async chat(q) {
    asks++;
    const body = { cache_prompt: true, messages: LlamaCpp.toOpenAI(q.messages), ...(q.tools?.length ? { tools: q.tools } : {}), max_tokens: 1536, stream: false,
      chat_template_kwargs: { enable_thinking: q.think === undefined ? true : Boolean(q.think) }, temperature: q.tools?.length ? 0.6 : 0.7, top_p: 0.8, top_k: 20 };
    const r = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: q.signal });
    if (!r.ok) throw new Error(`llama-server ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const m = (await r.json()).choices?.[0]?.message || {};
    const calls = (m.tool_calls || []).map((c) => { let a = {}, raw; try { a = JSON.parse(c.function?.arguments || '{}'); } catch { raw = c.function?.arguments; } return { function: { name: c.function?.name, arguments: a, ...(raw !== undefined ? { raw } : {}) } }; });
    if (!calls.length && q.tools?.length) { const t = textCalls(m.content || '', new Set(q.tools.map((x) => x.function?.name))); if (t) return { role: 'assistant', content: t.text, tool_calls: t.calls }; }
    return { role: 'assistant', content: m.content || '', tool_calls: calls.length ? calls : undefined };
  },
  unloadAll: async () => [], loaded: async () => [], unload: async () => [], isLoaded: async () => true
};

// ---- run ----
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
console.log(`${jobs.length} jobs, loop helps ${plain ? 'OFF (--plain)' : 'on'}, ${url}`);
for (const [i, j] of jobs.entries()) {
  runs.length = 0; asks = 0;
  const t0 = Date.now();
  const session = `loop-${i}`;
  const { jobId } = brain.enqueue(session, j.text);
  for (let k = 0; k < 6000; k++) { const s = brain.queue.find((x) => x.id === jobId)?.state; if (s === 'done' || s === 'failed') break; await wait(100); }
  const said = brain.session(session).filter((m) => m.role === 'assistant' && !m.tool_calls?.length).map((m) => String(m.content || '')).join(' ').trim();
  const used = runs.filter((r) => r.name !== 'use_tools');
  const inGroup = (n) => kit.groupOf(n) === j.group;
  const reached = j.group ? used.some((r) => inGroup(r.name)) : true;
  const needs = (j.need || []).every((n) => used.some((r) => r.name === n));
  const complete = used.every((r) => r.complete);
  results.push({ job: j.job, text: j.text, group: j.group, reached, needs, complete, answered: Boolean(said), steps: asks, calls: runs.length, secs: (Date.now() - t0) / 1000, tools: runs.map((r) => r.name) });
  const r = results.at(-1);
  console.log(`${String(i + 1).padStart(3)} ${r.reached && r.needs ? 'OK  ' : 'MISS'} ${r.complete ? '' : '(incomplete call) '}${j.text.slice(0, 60)} -> ${r.tools.join(',') || 'no tool'} (${r.steps} steps, ${r.secs.toFixed(1)} s)`);
}
await server?.stop();

const n = results.length;
const pct = (k) => `${k}/${n} (${Math.round((k / n) * 100)}%)`;
const sum = (f) => results.reduce((a, r) => a + f(r), 0);
const lines = [
  `# Loop test, ${new Date().toISOString().slice(0, 16)}`, '',
  `Model: ${L.model ? path.basename(L.model) : url}. Loop helps: ${plain ? 'off (--plain)' : 'on'}. ${n} jobs (${MULTI.length} with several steps).`, '',
  '| Score | Result |', '|---|---|',
  `| Reached the right tool | ${pct(sum((r) => (r.reached && r.needs ? 1 : 0)))} |`,
  `| Every call complete | ${pct(sum((r) => (r.complete ? 1 : 0)))} |`,
  `| Answered in words | ${pct(sum((r) => (r.answered ? 1 : 0)))} |`,
  `| Multi-step jobs done | ${sum((r) => (r.job === 'multi' && r.needs ? 1 : 0))}/${MULTI.length} |`,
  `| Brain calls per job | ${(sum((r) => r.steps) / n).toFixed(2)} |`,
  `| Seconds per job | ${(sum((r) => r.secs) / n).toFixed(1)} |`, '',
  '## Misses', '', ...results.filter((r) => !(r.reached && r.needs)).map((r) => `- [${r.job}] "${r.text}" -> ${r.tools.join(', ') || 'no tool'}`)
];
const file = path.join(L.out, `loop-test-${plain ? 'plain-' : ''}${stamp()}.md`);
fs.writeFileSync(file, lines.join('\n') + '\n');
fs.writeFileSync(file.replace(/\.md$/, '.json'), JSON.stringify(results, null, 1));
console.log(`\n${lines.slice(4, 11).join('\n')}\nReport: ${file}`);
kit.done();
process.exit(0);
