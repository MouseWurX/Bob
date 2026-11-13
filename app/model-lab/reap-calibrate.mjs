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
//      [--scores <an earlier run's scores.json for the same brain: skip scoring>] [--flat-only] [--cover 0.8,0.85,0.9]
// 13 Nov: every share below 100% is judged twice: flat (the same count in every layer, what a cut file can hold) and
// uneven (the same total, shared out by how spread each layer's scores are; live switch only, or a padded file).
// Experts used per word is set when the brain loads, so a Forge plan tests it by serving the brain once per count.
// The server must be Brain Engine with the expert trace (0002) and, for true REAP, the expert-mass patch; without
// mass it falls back to pick counts and says so. Set LAB_API_KEY for a server with a key (the Forge's rented card).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { opts, locate, readJsonl, stamp, AGENT } from './common.mjs';
import { emptyScores, addTrace, keepLists, unevenKeepLists, coverage, coverTable, fileCount, priority, smallestGood, thinLayers } from './reap-pick.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const o = opts({ score: 200, steps: '1,0.75,0.5,0.35', by: 'mass', margin: 2 });
if (!o.url) { console.error('--url <Brain Engine server> is needed (the brain must already be loaded there).'); process.exit(1); }
const url = String(o.url).replace(/\/+$/, '');
const L = locate(o);
const out = o.out ? String(o.out) : path.join(L.out, 'calibrate', stamp());
fs.mkdirSync(out, { recursive: true });
const lessonsDir = o.lessons || [path.join(L.out, 'lessons'), path.join(AGENT, 'bob-model-lab', 'out', 'lessons')].find((d) => fs.existsSync(path.join(d, 'toolsets.json'))) || path.join(L.out, 'lessons');
const headers = { 'content-type': 'application/json', ...(process.env.LAB_API_KEY ? { authorization: `Bearer ${process.env.LAB_API_KEY}` } : {}) };
// 12 Nov: retried with a growing wait (a rented card's proxy dropped one /expert-mask call and the whole run ended there)
const post = async (p, body, ms = 15 * 60_000, tries = 5) => {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url + p, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
      const t = await r.text(); if (!r.ok) throw new Error(`${p} ${r.status}: ${t.slice(0, 300)}`); return JSON.parse(t || '{}');
    } catch (e) {
      if (i >= tries) throw e;
      console.log(`  ${p}: ${String(e.message).slice(0, 120)}; trying again (${i}/${tries - 1})`);
      await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
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
const thin = thinLayers(s);
if (thin.length && !o['allow-thin']) {
  console.error(`These layers were barely scored, so their keep lists would be guesses: ${thin.map((t) => `layer ${t.layer} (${t.picks} picks, ${t.seen} experts seen)`).join(', ')}. The engine only ran them for the last word of each lesson; score with generated words or every-word outputs, or pass --allow-thin.`);
  fs.writeFileSync(path.join(out, 'scores-thin.json'), JSON.stringify({ by: s.hasMass ? String(o.by) : 'counts', thin, ...s }, null, 1));
  process.exit(3);
}
fs.writeFileSync(path.join(out, 'scores.json'), JSON.stringify({ by, ...s }, null, 1));
// how many experts each layer needs to hold 50-99% of its own score (keep lists ready for the live switch)
fs.writeFileSync(path.join(out, 'coverage.json'), JSON.stringify({ by, experts: s.experts, used: s.used, targets: coverTable(s, undefined, by) }));
fs.writeFileSync(path.join(out, 'priority.json'), JSON.stringify({ by, experts: s.experts, used: s.used, layers: priority(s, by) }));
console.log(`${s.lessons} lessons, ${s.tokens} tokens, ${s.layers.length} layers x ${s.experts} experts (${s.used} per word), ranked by ${by}`);

// ---- 2. step down ----
const scoreArgs = (typeof o.test === 'string' ? o.test.split(/\s+/).filter(Boolean) : []).concat(o.quick ? ['--quick'] : [], o['no-think'] ? ['--no-think'] : []);
const steps = [];
const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
async function judge(share, kind, keep) {
  const pct = Math.round(share * 100), label = kind === 'cover' ? `cover-${pct}` : `keep-${pct}${kind === 'uneven' ? '-uneven' : ''}`;
  const n = kind !== 'flat' ? Math.round(mean(keep.filter(Boolean).map((k) => k.length))) : keep.find(Boolean)?.length || s.experts;
  const cov = share === 1 ? null : coverage(s, keep, by), lo = cov ? Math.min(...cov.filter((x) => x != null)) : null;
  const row = { share, kind, kept: n, file_count: share === 1 ? s.experts : fileCount(keep), cover_min: lo, cover_avg: cov ? mean(cov) : null };
  try { await post('/expert-mask', { keep: share === 1 ? null : keep }, 60_000); }
  catch (e) { console.log(`  ${label}: the expert switch didn't answer (${String(e.message).slice(0, 120)}); step skipped`); steps.push({ ...row, total: null, of: null, pct: null, tps: null, ok: false }); return; }
  fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify({ share, by, kind, keep }));
  console.log(`\n--- ${label}: ${kind !== 'flat' ? `${n} of ${s.experts} per layer on average (${Math.min(...keep.filter(Boolean).map((k) => k.length))}-${row.file_count})` : `${n} of ${s.experts} experts in each layer`} ---`);
  const dir = path.join(out, label); fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync(process.execPath, [path.join(here, 'tool-score.mjs'), '--url', url, '--models', `${label}=served`, '--lessons', lessonsDir, '--out', dir, ...scoreArgs], { stdio: 'inherit', env: process.env });
  const file = fs.readdirSync(dir).filter((f) => /^tool-score-.*\.json$/.test(f)).sort().at(-1);
  const res = file ? JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).results?.[0] : null;
  steps.push({ ...row, total: res?.total ?? null, of: res?.totalN ?? null, pct: res ? (100 * res.total) / Math.max(res.totalN, 1) : null, tps: res?.tpsAvg ?? null, ok: r.status === 0 });
}
for (const share of String(o.steps).split(',').map(Number).filter((x) => x > 0 && x <= 1).sort((a, b) => b - a)) {
  await judge(share, 'flat', keepLists(s, share, by));
  if (share < 1 && !o['flat-only']) await judge(share, 'uneven', unevenKeepLists(s, share, by));
}
// --cover 0.8,0.85: each layer keeps experts until they hold that share of its own score (the total floats)
for (const c of (o.cover ? String(o.cover).split(',').map(Number).filter((x) => x > 0 && x < 1) : [])) await judge(c, 'cover', coverTable(s, [c], by)[0].keep);
await post('/expert-mask', { keep: null }, 60_000).catch(() => {});
// Reused scores: the full brain's score from that earlier run is the yardstick when this run has no 100% step.
if (o.scores && !steps.some((x) => x.share === 1)) {
  try { const full = JSON.parse(fs.readFileSync(path.join(path.dirname(String(o.scores)), 'calibration.json'), 'utf8')).steps.find((x) => x.share === 1); if (full) steps.unshift({ ...full, earlier: true }); } catch {}
}

// ---- 3. keep ----
// The pick is always a flat step (a cut file can hold it); the best uneven step is reported next to it.
const flat = steps.filter((x) => x.kind === 'flat' || !x.kind), uneven = steps.filter((x) => x.kind === 'uneven');
const best = smallestGood(flat, Number(o.margin));
const bestUneven = uneven.length ? smallestGood([...flat.filter((x) => x.share === 1), ...uneven], Number(o.margin)) : null;
const cell = (x) => (x.total == null ? 'failed' : `${x.total}/${x.of} (${x.pct.toFixed(1)}%)`);
const lines = ['# REAP calibration', '', `Scored on ${s.lessons} training lessons, ranked by ${by}. Judged on the held-out lessons (tool-score${o.quick ? ', quick' : ''}). Margin: ${o.margin} points.`, '',
  '| Kept per layer | Share | Split | Held-out overall | Layer score kept (lowest / average) | Words a second |', '|---|---|---|---|---|---|',
  ...steps.map((x) => `| ${x.kind !== 'flat' && x.kind ? `~${x.kept} (file needs ${x.file_count})` : x.kept} of ${s.experts} | ${Math.round(x.share * 100)}% | ${x.kind === 'cover' ? `uneven, each layer holds ${Math.round(x.share * 100)}% (${x.kept * s.layers.filter(Boolean).length} in all)` : x.kind === 'uneven' ? 'uneven' : 'even'} | ${cell(x)} | ${x.cover_min == null ? '' : `${Math.round(100 * x.cover_min)}% / ${Math.round(100 * x.cover_avg)}%`} | ${x.tps == null ? '' : x.tps.toFixed(1)}${x.earlier ? ' (earlier run)' : ''} |`),
  '', best ? `Smallest even split within the margin: **${Math.round(best.share * 100)}%** (${best.kept} of ${s.experts} per layer), keep list \`keep-${Math.round(best.share * 100)}.json\`; a cut file can hold this.` : 'No step finished.',
  ...(bestUneven && bestUneven.kind === 'uneven' ? [`Smallest uneven split within the margin: **${Math.round(bestUneven.share * 100)}%** (about ${bestUneven.kept} per layer, a file would need ${bestUneven.file_count}), keep list \`keep-${Math.round(bestUneven.share * 100)}-uneven.json\`; live switch only, or a padded file.`] : []),
  '', 'The brain file was not changed and every expert is switched back on. Switching experts off saves no memory by itself.'];
fs.writeFileSync(path.join(out, 'calibration.md'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(out, 'calibration.json'), JSON.stringify({ by, experts: s.experts, used: s.used, margin: Number(o.margin), steps, best, best_uneven: bestUneven }, null, 1));
console.log('\n' + lines.join('\n'));
