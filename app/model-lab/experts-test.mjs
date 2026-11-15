// Phase 0, step 1: how does Qwen3.6 hold up with fewer experts per word?
// Runs the same quiz at 8 (the model's own), 6, 4, 3 and 2 experts per word: picking Bob's right tool for plain
// requests, short facts, and small coding jobs checked by running the code. Thinking off (instruct first).
// node experts-test.mjs [--counts 8,6,4,3,2] [--bob <Bob source>] [--model <gguf>] [--llama <folder>] [--quick] [--howtos <how-to file>]
//      [--condition "keep75-n8"] [--evidence] (the surgery data rule: each saved answer says what it was made under; see answerTags)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { opts, locate, moeShape, checkFree, startServer, chat, stamp, answerTags, tagsNote } from './common.mjs';
import { loadBob } from './bob-kit.mjs';
import { FACTS, CODE, CANT, runCode } from './quiz-items.mjs';

const o = opts({ counts: '8,6,4,3,2' });
if (o.url) process.env.LAB_URL = String(o.url);   // build 18: test a server somebody else runs (the Forge's rented card); one pass, the count it was started with
const remote = Boolean(process.env.LAB_URL);
const L = locate(o);
if (!L.model && !remote) { console.error('Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf not found under <parent>/models. Pass --model.'); process.exit(1); }
if (!remote) checkFree(o);
const shape = !remote && L.model && fs.existsSync(L.model) ? moeShape(L.model) : { name: process.env.LAB_MODEL_NAME || 'served brain', layers: '?', experts: 256, used: Number(String(o.counts).split(',')[0]) || 8, key: null };
console.log(`${shape.name}: ${shape.layers} layers, ${shape.experts} experts, ${shape.used} per word (key ${shape.key})`);
const kit = await loadBob(L.bob, { howtos: o.howtos ? String(o.howtos) : '' });
let bobVersion = ""; try { bobVersion = JSON.parse(fs.readFileSync(path.join(L.bob, "package.json"), "utf8")).version || ""; } catch {}

// ---- the quiz ----
const TOOL_JOBS = kit.phrasings.filter((p) => p.group && !p.pic && !p.recent);
const tools = kit.allTools();
const { system } = kit.turn(new Set(Object.keys(kit.groups())));
const quick = Boolean(o.quick);
const noRun = Boolean(o['no-run']) || process.env.LAB_NO_HANDS === '1';
const toolSet = quick ? TOOL_JOBS.filter((_, i) => i % 4 === 0) : TOOL_JOBS;


// 12 Nov (the owner's rule): every benchmark keeps its data: each answer with the brain's odds (top 5 words per step), next to the report.
const ODDS = o['no-odds'] ? {} : { logprobs: true, top_logprobs: 5 };
let keepFile = null, tags = {};
const keep = (kind, q, res, extra = {}) => {
  try {
    keepFile ||= path.join(L.out, `answers-quiz-${String(process.env.LAB_MODEL_NAME || shape.name).replace(/[^\w.-]/g, '_')}-${stamp()}.jsonl`);
    fs.appendFileSync(keepFile, JSON.stringify({ kind, q, bob: bobVersion || undefined, ...tags, ...extra, answer: { content: res.msg.content || '', tool_calls: res.msg.tool_calls || undefined }, ...(res.logprobs ? { odds: (res.logprobs.content || []).map((x) => ({ t: x.token, p: x.logprob, top: (x.top_logprobs || []).map((y) => [y.token, y.logprob]) })) } : {}) }) + '\n');
  } catch {}
};
async function quiz(url) {
  const r = { tool: 0, toolN: toolSet.length, fact: 0, factN: FACTS.length, code: 0, codeN: CODE.length, tps: [], misses: [], startTokens: 0, answerMs: [], cant: 0 };
  for (const p of toolSet) {
    try {
      const t0 = Date.now();
      const res = await chat(url, { messages: [{ role: 'system', content: system }, { role: 'user', content: p.text }], tools, max: 512, ...ODDS });
      const { msg, timings, usage } = res;
      r.answerMs.push(Date.now() - t0);
      // 12 Nov: the size of Bob's front desk (system prompt + tools + one short request), and false "I can't" answers to plain tool requests
      if (!r.startTokens) r.startTokens = usage.prompt_tokens || timings.prompt_n || 0;
      if (timings.predicted_per_second) r.tps.push(timings.predicted_per_second);
      const names = (msg.tool_calls || []).map((c) => c.function?.name);
      if (!names.length && CANT.test(msg.content || '')) r.cant++;
      const ok = names.some((n) => kit.groupOf(n) === p.group || (n === 'use_tools' && JSON.parse(msg.tool_calls.find((c) => c.function.name === 'use_tools').function.arguments || '{}').group === p.group));
      keep('tool', p.text, res, { group: p.group, ok });
      if (ok) r.tool++; else r.misses.push(`[${p.job}] "${p.text}" -> ${names.join(',') || 'no tool'}`);
    } catch (e) { r.misses.push(`[${p.job}] "${p.text}" -> error ${e.message.slice(0, 80)}`); }
  }
  for (const [q, re] of FACTS) {
    try {
      const res = await chat(url, { messages: [{ role: 'user', content: q }], max: 64, temperature: 0, ...ODDS });
      const { msg } = res;
      keep('fact', q, res, { ok: re.test(msg.content || '') });
      if (re.test(msg.content || '')) r.fact++; else r.misses.push(`fact "${q}" -> ${(msg.content || '').slice(0, 60)}`);
    } catch (e) { r.misses.push(`fact "${q}" -> error ${e.message.slice(0, 80)}`); } // 11 Nov: one failed request no longer loses the whole report
  }
  // 13 Nov (the owner: "make sure he has no hands"): with --no-run, or LAB_NO_HANDS=1 from a Forge plan with no_hands, the code
  // questions are skipped, because grading them means running the brain's code. Tool answers are only ever parsed.
  if (noRun) { r.codeN = 0; r.misses.push('code questions skipped (no hands: nothing the brain writes is run)'); }
  else for (const [q, name, test] of CODE) {
    try {
      const res = await chat(url, { messages: [{ role: 'user', content: q }], max: 600, temperature: 0, ...ODDS });
      const { msg, timings } = res;
      if (timings.predicted_per_second) r.tps.push(timings.predicted_per_second);
      const codeOk = runCode(msg.content || '', name, test); keep('code', q, res, { name, ok: codeOk });
      if (codeOk) r.code++; else r.misses.push(`code ${name} failed`);
    } catch (e) { r.misses.push(`code ${name} -> error ${e.message.slice(0, 80)}`); }
  }
  r.tpsAvg = r.tps.length ? r.tps.reduce((a, b) => a + b, 0) / r.tps.length : 0;
  const ms = [...r.answerMs].sort((a, b) => a - b); r.answerMedianMs = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
  delete r.tps; delete r.answerMs;
  return r;
}

const counts = remote ? [Number(String(o.counts).split(',')[0]) || 8] : String(o.counts).split(',').map(Number).filter((n) => n > 0 && n <= (shape.experts || 256));
const results = [];
for (const n of counts) {
  console.log(`\n--- ${n} experts per word ---`);
  tags = answerTags(o, { n, own: remote ? 0 : shape.used, remote }); console.log(tagsNote(tags));
  const srv = await startServer({ server: L.server, model: L.model, mmproj: null, ctx: 16384, extra: shape.key ? ['--override-kv', `${shape.key}=int:${n}`] : [], logFile: path.join(L.out, 'llama-server-lab.log') });
  try {
    const r = await quiz(srv.url);
    results.push({ experts: n, ...r, loadSec: srv.loadSec });
    console.log(`tools ${r.tool}/${r.toolN}, facts ${r.fact}/${r.factN}, code ${r.code}/${r.codeN}, ${r.tpsAvg.toFixed(1)} tok/s, front desk ${r.startTokens} tokens, median tool answer ${(r.answerMedianMs / 1000).toFixed(1)} s, false can't ${r.cant}/${r.toolN}${bobVersion ? `, Bob ${bobVersion}` : ''}`);
  } finally { await srv.stop(); }
}
kit.done();

const when = stamp();
fs.writeFileSync(path.join(L.out, `experts-test-${when}.json`), JSON.stringify({ model: shape, results }, null, 2));
const pct = (a, b) => `${a}/${b} (${Math.round((100 * a) / Math.max(b, 1))}%)`;
const md = [`# Experts-per-word test, ${when}`, '', `Model: ${shape.name} (${shape.layers} layers, ${shape.experts} experts, ${shape.used} per word by default). Thinking off. Tool quiz: Bob's real prompt and all his tools, ${toolSet.length} plain requests from test/phrasings.js.`, '',
  `Bob ${bobVersion || '?'}.`, '',
  '| Experts per word | Right tool | Facts | Code runs | Writing speed | Front desk | Median tool answer | False "can\'t" |', '|---|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.experts} | ${pct(r.tool, r.toolN)} | ${pct(r.fact, r.factN)} | ${pct(r.code, r.codeN)} | ${r.tpsAvg.toFixed(1)} tok/s | ${r.startTokens} tokens | ${(r.answerMedianMs / 1000).toFixed(1)} s | ${r.cant} of ${r.toolN} |`), '',
  '## Misses', ...results.flatMap((r) => [`### ${r.experts} per word`, ...r.misses.map((m) => `- ${m}`), ''])].join('\n');
fs.writeFileSync(path.join(L.out, `experts-test-${when}.md`), md);
console.log(`\nReport: ${path.join(L.out, `experts-test-${when}.md`)}`);
process.exit(0);
