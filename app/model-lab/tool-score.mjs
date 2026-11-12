// Tool score: how often a model makes the same tool decision as the full Qwen3.6 did, in real Bob conversations.
// Uses the 5% of lessons that the forge holds out of training (same id hash as pod/data.py), replayed turn by turn with
// the full history, Bob's real system prompt and the tools that were loaded at that moment. Each assistant turn is one
// question: the right tool (same tool names as the original), the right arguments too, or correctly no tool at all.
// The original answers came from the full Qwen3.6 itself, so this measures agreement with the teacher, not truth.
//
// node tool-score.mjs --models "full=C:\...\Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf,riker=C:\...\24Bob-Q4_K_M.gguf" [--lessons out\lessons]
//      [--llama <folder>] [--ctx 16384] [--experts 8] [--quick] [--no-think] [--extra "--n-cpu-moe 20"]
//      [--split train --sample 2000] (harvest training data from the other 95%; not a benchmark)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { opts, locate, startServer, chat, stamp, readJsonl, appendJsonl, moeShape, AGENT } from './common.mjs';
import { parseArgs, sameArgs, judgeTurn } from './tool-judge.mjs';

const o = opts({ ctx: 16384 });
if (o.url) process.env.LAB_URL = String(o.url);   // build 18: score a brain served elsewhere (the Forge's card); --models "label=served"
const remote = Boolean(process.env.LAB_URL);
const L = locate(o);
// 11 Nov: with --out pointing somewhere else (the Forge's benchmark folder), the lessons still live under the lab's own out/lessons
const lessonsDir = o.lessons || [path.join(L.out, 'lessons'), path.join(AGENT, 'bob-model-lab', 'out', 'lessons')].find((d) => fs.existsSync(path.join(d, 'toolsets.json'))) || path.join(L.out, 'lessons');
const HOLDOUT = 0.05;
const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < HOLDOUT;

const sets = JSON.parse(fs.readFileSync(path.join(lessonsDir, 'toolsets.json'), 'utf8'));
// 12 Nov: --split train harvests training data instead of scoring: the same replay over the other 95% (never the
// held-out 5%, so the benchmark stays clean), --sample N spread evenly. The kept answers (right ones and right-vs-wrong
// pairs, via make-datasets) can be trained on; the score from a train run is not the benchmark.
const split = o.split === 'train' ? 'train' : 'holdout';
let lessons = readJsonl(path.join(lessonsDir, 'lessons.jsonl')).filter((l) => l.idea !== undefined && (split === 'train') !== isHoldout(l.idea) && l.messages?.some((m) => m.role === 'assistant'));
if (o.sample && Number(o.sample) < lessons.length) { const n = Number(o.sample), step = lessons.length / n; lessons = Array.from({ length: n }, (_, i) => lessons[Math.floor(i * step)]); }
if (o.quick) lessons = lessons.filter((_, i) => i % 5 === 0);
if (!lessons.length) { console.error(`no ${split === 'train' ? 'training' : 'held-out'} lessons in ${lessonsDir}`); process.exit(1); }
if (split === 'train') console.log(`Harvest run on ${lessons.length} training lessons (not the benchmark: the held-out 5% are left out)`);
const models = String(o.models || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const i = s.indexOf('='); return i > 0 ? { name: s.slice(0, i), file: s.slice(i + 1) } : { name: path.basename(s, '.gguf'), file: s }; });
if (!models.length) { console.error('--models "label=path.gguf,label2=path2.gguf" is needed'); process.exit(1); }
if (!remote) for (const m of models) if (!fs.existsSync(m.file)) { console.error(`${m.name}: ${m.file} not found`); process.exit(1); }
const extra = o.extra ? String(o.extra).split(/\s+/).filter(Boolean) : [];
console.log(`${lessons.length} held-out lessons, ${lessons.reduce((n, l) => n + l.messages.filter((m) => m.role === 'assistant').length, 0)} assistant turns`);

// ---- turning a saved lesson into the request the model sees at turn k ----
function history(lesson, k) {
  // messages before the k-th assistant turn, in OpenAI shape; system from the tool set of the first assistant turn
  let system = null, tools = null, seen = 0;
  const out = [];
  for (const m of lesson.messages) {
    if (m.role === 'assistant') {
      if (system === null && sets[m.set]) { system = sets[m.set].system; tools = sets[m.set].tools; }
      if (seen === k) break;
      seen++;
      out.push({ role: 'assistant', content: m.content || '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls.map((c, i) => ({ id: c.id || `call_${i}`, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments || {}) } })) } : {}) });
    } else if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.tool_call_id || 'call_0', name: m.name, content: String(m.content || '') });
    else out.push({ role: 'user', content: m.content || '' });
  }
  if (system === null) return null;
  return { messages: [{ role: 'system', content: system }, ...out], tools };
}
async function score(m) {
  const shape = fs.existsSync(m.file) ? moeShape(m.file) : { key: null };
  const srv = await startServer({ server: L.server, model: m.file, mmproj: null, ctx: Number(o.ctx), extra: [...extra, ...(o.experts && shape.key ? ['--override-kv', `${shape.key}=int:${o.experts}`] : [])], logFile: path.join(L.out, 'llama-server-lab.log') });
  const r = { name: m.name, file: m.file, toolTurns: 0, rightTool: 0, rightArgs: 0, noToolTurns: 0, rightNoTool: 0, errors: 0, tps: [], misses: [] };
  const t0 = Date.now();
  const keepFile = path.join(L.out, `answers-${String(m.name).replace(/[^\w.-]/g, '_')}-${stamp()}.jsonl`);
  try {
    let done = 0;
    for (const l of lessons) {
      const nTurns = l.messages.filter((x) => x.role === 'assistant').length;
      for (let k = 0; k < nTurns; k++) {
        const h = history(l, k); if (!h) continue;
        const want = l.messages.filter((x) => x.role === 'assistant')[k];
        const wantCalls = (want.tool_calls || []).map((c) => ({ name: c.function.name, args: parseArgs(c.function.arguments) }));
        const think = o['no-think'] ? false : Boolean(l.think);
        let msg, timings;
        // 12 Nov (the owner's rule): every benchmark keeps its data. Each answer is saved with the brain's odds (its top 5 words
        // at every step) unless --no-odds; the file sits next to the report and can be published or used as training data.
        let logprobs = null;
        try { ({ msg, timings, logprobs } = await chat(srv.url, { messages: h.messages, tools: h.tools, think, max: think ? 6000 : 1500, temperature: 0, ...(o['no-odds'] ? {} : { logprobs: true, top_logprobs: 5 }) })); }
        catch (e) { r.errors++; r.misses.push(`${l.idea}/${k}: error ${e.message.slice(0, 80)}`); continue; }
        if (timings?.predicted_per_second) r.tps.push(timings.predicted_per_second);
        const got = (msg.tool_calls || []).map((c) => ({ name: c.function?.name, args: parseArgs(c.function?.arguments) }));
        try { appendJsonl(keepFile, { brain: m.name, split, idea: l.idea, turn: k, think, ok: judgeTurn(wantCalls, got), want: wantCalls.length ? 'tool' : 'no-tool', answer: { content: msg.content || '', reasoning: msg.reasoning_content || undefined, tool_calls: msg.tool_calls || undefined }, ...(logprobs ? { odds: (logprobs.content || []).map((x) => ({ t: x.token, p: x.logprob, top: (x.top_logprobs || []).map((y) => [y.token, y.logprob]) })) } : {}) }); } catch {}
        if (!wantCalls.length) {
          r.noToolTurns++;
          if (!got.length) r.rightNoTool++; else r.misses.push(`${l.idea}/${k}: expected no tool, got ${got.map((g) => g.name).join(',')}`);
          continue;
        }
        r.toolTurns++;
        const wantNames = [...new Set(wantCalls.map((c) => c.name))].sort().join(','), gotNames = [...new Set(got.map((c) => c.name))].sort().join(',');
        if (wantNames !== gotNames) { r.misses.push(`${l.idea}/${k}: wanted ${wantNames}, got ${gotNames || 'no tool'}`); continue; }
        r.rightTool++;
        const argsOk = wantCalls.every((w) => got.some((g) => g.name === w.name && sameArgs(w.args, g.args)));
        if (argsOk) r.rightArgs++; else r.misses.push(`${l.idea}/${k}: ${wantNames} right, arguments differ: wanted ${JSON.stringify(wantCalls.map((c) => c.args)).slice(0, 160)} got ${JSON.stringify(got.map((c) => c.args)).slice(0, 160)}`);
      }
      if (++done % 20 === 0) console.log(`  ${m.name}: ${done}/${lessons.length} lessons, tool ${r.rightTool}/${r.toolTurns}, args ${r.rightArgs}/${r.toolTurns}, no-tool ${r.rightNoTool}/${r.noToolTurns}`);
    }
  } finally { await srv.stop(); }
  r.tpsAvg = r.tps.length ? r.tps.reduce((a, b) => a + b, 0) / r.tps.length : 0; delete r.tps;
  r.minutes = (Date.now() - t0) / 60000; r.loadSec = srv.loadSec;
  r.total = r.rightArgs + r.rightNoTool; r.totalN = r.toolTurns + r.noToolTurns;
  return r;
}

const results = [];
for (const m of models) {
  console.log(`\n--- ${m.name} (${m.file}) ---`);
  const r = await score(m); results.push(r);
  console.log(`${m.name}: right tool ${r.rightTool}/${r.toolTurns}, right arguments ${r.rightArgs}/${r.toolTurns}, correctly no tool ${r.rightNoTool}/${r.noToolTurns}, overall ${r.total}/${r.totalN}, ${r.tpsAvg.toFixed(1)} tok/s, ${r.minutes.toFixed(0)} min`);
}
const when = stamp();
const pct = (a, b) => `${a}/${b} (${Math.round((100 * a) / Math.max(b, 1))}%)`;
fs.writeFileSync(path.join(L.out, `tool-score-${when}.json`), JSON.stringify({ lessons: lessons.length, experts: o.experts || 'default', think: o['no-think'] ? 'off' : 'as recorded', results }, null, 2));
const md = [`# Tool score, ${when}`, '', `${lessons.length} held-out Bob conversations (never trained on), replayed turn by turn with full history. Right tool = same tool names as the full Qwen3.6 chose; right arguments = same values too; no tool = the turn was a plain reply and the model also made no call. Thinking ${o['no-think'] ? 'off' : 'as in each lesson'}${o.experts ? `, ${o.experts} experts per word` : ''}.`, '',
  '| Model | Right tool | Right arguments | Correctly no tool | Overall | Speed | Load |', '|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.name} | ${pct(r.rightTool, r.toolTurns)} | ${pct(r.rightArgs, r.toolTurns)} | ${pct(r.rightNoTool, r.noToolTurns)} | ${pct(r.total, r.totalN)} | ${r.tpsAvg.toFixed(1)} tok/s | ${r.loadSec.toFixed(0)} s |`), '',
  '## Misses', ...results.flatMap((r) => [`### ${r.name}`, ...r.misses.slice(0, 200).map((x) => `- ${x}`), r.misses.length > 200 ? `- … ${r.misses.length - 200} more` : '', ''])].join('\n');
fs.writeFileSync(path.join(L.out, `tool-score-${when}.md`), md);
console.log(`\nReport: ${path.join(L.out, `tool-score-${when}.md`)}`);
process.exit(0);
