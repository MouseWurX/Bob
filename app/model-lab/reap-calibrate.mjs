// REAP calibration: tune a stock mixture-of-experts brain down without cutting a file.
// 1. Score: Bob's training lessons (never the held-out 5%) go through a Brain Engine server with the expert trace and
//    expert mass on, and every expert of every layer gets a REAP score (router weight x the size of what it adds).
// 2. Step down: for each share (100%, 75%, 50%, ...) the server's live expert switch (/expert-mask) keeps only that
//    share of each layer, strongest first, and the held-out tool score runs against it.
// 3. Keep: the smallest share within --margin points of the full brain. Written as small JSON files: the keep list
//    (POST it to /expert-mask) and the priority list (strongest first per layer, for keeping the best experts on the
//    card and the rest in RAM). The brain file is never touched, and the mask is put back to all-on at the end.
// Any brain family Brain Engine runs works the same way (Qwen, gpt-oss, GLM, DeepSeek, Mixtral...).
// Switching experts off saves no memory by itself; the keep and priority lists say what a smaller load should hold.
//
// node reap-calibrate.mjs --url http://host:port [--lessons out/lessons] [--score 200] [--steps 1,0.75,0.5,0.35]
//      [--by mass|reap|counts] [--margin 2] [--quick] [--no-think] [--out out/calibrate] [--test "extra tool-score args"]
//      [--scores <an earlier run's scores.json for the same brain: skip scoring>]
// The server must be Brain Engine with the expert trace (0002) and, for true REAP, the expert-mass patch; without
// mass it falls back to pick counts and says so. Set LAB_API_KEY for a server with a key (the Forge's rented card).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { opts, locate, readJsonl, stamp, AGENT } from './common.mjs';
import { emptyScores, addTrace, keepLists, priority, smallestGood } from './reap-pick.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const o = opts({ score: 200, steps: '1,0.75,0.5,0.35', by: 'mass', margin: 2 });
if (!o.url) { console.error('--url <Brain Engine server> is needed (the brain must already be loaded there).'); process.exit(1); }
const url = String(o.url).replace(/\/+$/, '');
const L = locate(o);
const out = o.out ? String(o.out) : path.join(L.out, 'calibrate', stamp());
fs.mkdirSync(out, { recursive: true });
const lessonsDir = o.lessons || [path.join(L.out, 'lessons'), path.join(AGENT, 'bob-model-lab', 'out', 'lessons')].find((d) => fs.existsSync(path.join(d, 'toolsets.json'))) || path.join(L.out, 'lessons');
const headers = { 'content-type': 'application/json', ...(process.env.LAB_API_KEY ? { authorization: `Bearer ${process.env.LAB_API_KEY}` } : {}) };
const post = async (p, body, ms = 15 * 60_000) => {
  const r = await fetch(url + p, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  const t = await r.text(); if (!r.ok) throw new Error(`${p} ${r.status}: ${t.slice(0, 300)}`); return JSON.parse(t || '{}');
};

// The same held-out split as tool-score and the Forge (pod/data.py): score on the rest, judge on these.
const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;
const sets = JSON.parse(fs.readFileSync(path.join(lessonsDir, 'toolsets.json'), 'utf8'));
const train = readJsonl(path.join(lessonsDir, 'lessons.jsonl')).filter((l) => l.idea !== undefined && !isHoldout(l.idea) && l.messages?.some((m) => m.role === 'assistant'));
// An even spread over the lessons (not the first N, which would all be one kind of job).
const pickN = Math.min(Number(o.score) || 200, train.length), stride = train.length / Math.max(pickN, 1);
const chosen = Array.from({ length: pickN }, (_, i) => train[Math.floor(i * stride)]);

function whole(lesson) {
  let system = null; const msgs = [];
  for (const m of lesson.messages) {
    if (m.role === 'assistant') {
      if (system === null && sets[m.set]) system = sets[m.set].system;
      msgs.push({ role: 'assistant', content: m.content || '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls.map((c, i) => ({ id: c.id || `call_${i}`, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments || {}) } })) } : {}) });
    } else if (m.role === 'tool') msgs.push({ role: 'tool', tool_call_id: m.tool_call_id || 'call_0', name: m.name, content: String(m.content || '') });
    else msgs.push({ role: 'user', content: m.content || '' });
  }
  return system === null ? null : [{ role: 'system', content: system }, ...msgs];
}

// ---- 1. score (or reuse an earlier run's scores.json for the same brain: --scores <file>) ----
await post('/expert-mask', { keep: null }, 60_000).catch(() => {});
const s = emptyScores();
let fails = 0;
if (o.scores) {
  const old = JSON.parse(fs.readFileSync(String(o.scores), 'utf8'));
  Object.assign(s, { experts: old.experts, used: old.used, layers: old.layers, mass: old.mass, lessons: old.lessons, tokens: old.tokens, hasMass: old.hasMass !== false });
  console.log(`Reusing the scores in ${o.scores} (${s.lessons} lessons, ${s.layers.length} layers x ${s.experts} experts)`);
} else console.log(`Scoring on ${chosen.length} of ${train.length} training lessons (the held-out 5% are kept for judging)`);
for (const [i, lesson] of (o.scores ? [] : chosen).entries()) {
  const messages = whole(lesson); if (!messages) continue;
  try {
    const j = await post('/v1/chat/completions', { messages, max_tokens: 1, cache_prompt: false, expert_trace: true, expert_trace_mass: true, temperature: 0 });
    if (!addTrace(s, j.expert_trace)) fails++;
  } catch (e) { fails++; if (fails <= 3) console.log(`  lesson ${i}: ${e.message}`); }
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${chosen.length}`);
}
if (!s.lessons) { console.error('No expert traces came back. Is this a Brain Engine server with the expert trace, and a mixture-of-experts brain?'); process.exit(1); }
const by = s.hasMass ? String(o.by) : 'counts';
if (!s.hasMass) console.log('This engine gives pick counts but no expert mass, so the ranking uses counts (not true REAP).');
fs.writeFileSync(path.join(out, 'scores.json'), JSON.stringify({ by, ...s }, null, 1));
fs.writeFileSync(path.join(out, 'priority.json'), JSON.stringify({ by, experts: s.experts, used: s.used, layers: priority(s, by) }));
console.log(`${s.lessons} lessons, ${s.tokens} tokens, ${s.layers.length} layers x ${s.experts} experts (${s.used} per word), ranked by ${by}`);

// ---- 2. step down ----
const scoreArgs = (typeof o.test === 'string' ? o.test.split(/\s+/).filter(Boolean) : []).concat(o.quick ? ['--quick'] : [], o['no-think'] ? ['--no-think'] : []);
const steps = [];
for (const share of String(o.steps).split(',').map(Number).filter((x) => x > 0 && x <= 1).sort((a, b) => b - a)) {
  const keep = keepLists(s, share, by), n = keep.find(Boolean)?.length || s.experts;
  const label = `keep-${Math.round(share * 100)}`;
  await post('/expert-mask', { keep: share === 1 ? null : keep }, 60_000);
  fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify({ share, by, keep }));
  console.log(`\n--- ${label}: ${n} of ${s.experts} experts in each layer ---`);
  const dir = path.join(out, label); fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync(process.execPath, [path.join(here, 'tool-score.mjs'), '--url', url, '--models', `${label}=served`, '--lessons', lessonsDir, '--out', dir, ...scoreArgs], { stdio: 'inherit', env: process.env });
  const file = fs.readdirSync(dir).filter((f) => /^tool-score-.*\.json$/.test(f)).sort().at(-1);
  const res = file ? JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).results?.[0] : null;
  steps.push({ share, kept: n, total: res?.total ?? null, of: res?.totalN ?? null, pct: res ? (100 * res.total) / Math.max(res.totalN, 1) : null, tps: res?.tpsAvg ?? null, ok: r.status === 0 });
}
await post('/expert-mask', { keep: null }, 60_000).catch(() => {});
// Reused scores: the full brain's score from that earlier run is the yardstick when this run has no 100% step.
if (o.scores && !steps.some((x) => x.share === 1)) {
  try { const full = JSON.parse(fs.readFileSync(path.join(path.dirname(String(o.scores)), 'calibration.json'), 'utf8')).steps.find((x) => x.share === 1); if (full) steps.unshift({ ...full, earlier: true }); } catch {}
}

// ---- 3. keep ----
const best = smallestGood(steps, Number(o.margin));
const lines = ['# REAP calibration', '', `Scored on ${s.lessons} training lessons, ranked by ${by}. Judged on the held-out lessons (tool-score${o.quick ? ', quick' : ''}). Margin: ${o.margin} points.`, '',
  '| Kept per layer | Share | Held-out overall | Words a second |', '|---|---|---|---|',
  ...steps.map((x) => `| ${x.kept} of ${s.experts} | ${Math.round(x.share * 100)}% | ${x.total == null ? 'failed' : `${x.total}/${x.of} (${x.pct.toFixed(1)}%)`} | ${x.tps == null ? '' : x.tps.toFixed(1)}${x.earlier ? ' (earlier run)' : ''} |`),
  '', best ? `Smallest within the margin: **${Math.round(best.share * 100)}%** (${best.kept} of ${s.experts} per layer), keep list \`keep-${Math.round(best.share * 100)}.json\`.` : 'No step finished.',
  '', 'The brain file was not changed and every expert is switched back on. Switching experts off saves no memory by itself.'];
fs.writeFileSync(path.join(out, 'calibration.md'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(out, 'calibration.json'), JSON.stringify({ by, experts: s.experts, used: s.used, margin: Number(o.margin), steps, best }, null, 1));
console.log('\n' + lines.join('\n'));
