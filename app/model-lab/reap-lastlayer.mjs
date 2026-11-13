// Re-scores ONLY the last expert layer of a REAP calibration. llama.cpp computes the last layer just for tokens that need an
// output, so with max_tokens 1 the trace sees one token per lesson there (gpt-oss-120b: 400 picks against ~1.07M in every other
// layer). Here every lesson is cut before its last assistant turn and the brain writes that turn (--gen tokens, temperature 0):
// each generated token runs the last layer, so it gets real counts. The other layers keep the old scores.
//   node reap-lastlayer.mjs --url <Brain Engine> --scores <old scores.json> --out <folder> [--lessons out/lessons] [--score 100]
//        [--gen 256] [--share 0.32] [--by mass]
//        [--reasoning medium]  (gpt-oss reasoning level for the written answers; recorded in scores-v2.json)
// Writes <out>/scores-v2.json (old scores, last layer replaced, marked last_layer_rescored), keep-<share>-v2.json,
// priority-v2.json, lastlayer.json (raw).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { opts, readJsonl } from './common.mjs';
import { emptyScores, addTrace, keepLists, priority } from './reap-pick.mjs';

// gpt-oss: medium is the chat template's own default (the first scoring sent none, so it ran at medium too)
const o = opts({ score: 100, gen: 256, share: 0.32, by: 'mass', reasoning: 'medium' });
if (!o.url || !o.scores || !o.out) { console.error('--url, --scores and --out are needed'); process.exit(1); }
const url = String(o.url).replace(/\/+$/, ''); const out = String(o.out); fs.mkdirSync(out, { recursive: true });
const headers = { 'content-type': 'application/json', ...(process.env.LAB_API_KEY ? { authorization: `Bearer ${process.env.LAB_API_KEY}` } : {}) };
const post = async (p, body, ms = 15 * 60_000, tries = 5) => {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url + p, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
      const t = await r.text(); if (!r.ok) throw new Error(`${p} ${r.status}: ${t.slice(0, 300)}`); return JSON.parse(t || '{}');
    } catch (e) { if (i >= tries) throw e; console.log(`  ${p}: ${String(e.message).slice(0, 120)}; retry ${i}`); await new Promise((r) => setTimeout(r, 5000 * i)); }
  }
};
const lessonsDir = String(o.lessons || 'out/lessons');
const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;
const sets = JSON.parse(fs.readFileSync(path.join(lessonsDir, 'toolsets.json'), 'utf8'));
const train = readJsonl(path.join(lessonsDir, 'lessons.jsonl')).filter((l) => l.idea !== undefined && !isHoldout(l.idea) && l.messages?.some((m) => m.role === 'assistant'));
const pickN = Math.min(Number(o.score), train.length), stride = train.length / pickN;
const chosen = Array.from({ length: pickN }, (_, i) => train[Math.floor(i * stride)]); // the same even spread as reap-calibrate

function upToLastAnswer(lesson) {
  let system = null; const msgs = [];
  for (const m of lesson.messages) {
    if (m.role === 'assistant') {
      if (system === null && sets[m.set]) system = sets[m.set].system;
      msgs.push({ role: 'assistant', content: m.content || '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls.map((c, i) => ({ id: c.id || `call_${i}`, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments) } })) } : {}) });
    } else if (m.role === 'tool') msgs.push({ role: 'tool', tool_call_id: m.tool_call_id || 'call_0', name: m.name, content: String(m.content || '') });
    else msgs.push({ role: 'user', content: m.content || '' });
  }
  while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop(); // the brain writes the last answer itself
  return system === null || !msgs.length ? null : [{ role: 'system', content: system }, ...msgs];
}

await post('/expert-mask', { keep: null }, 60_000).catch(() => {});
const s = emptyScores(); let fails = 0, gen = 0;
for (const [i, lesson] of chosen.entries()) {
  const messages = upToLastAnswer(lesson); if (!messages) continue;
  try {
    const j = await post('/v1/chat/completions', { messages, max_tokens: Number(o.gen), cache_prompt: false, expert_trace: true, expert_trace_mass: true, temperature: 0, reasoning_effort: String(o.reasoning), chat_template_kwargs: { reasoning_effort: String(o.reasoning) } });
    if (!addTrace(s, j.expert_trace)) fails++; gen += j.usage?.completion_tokens || 0;
  } catch (e) { fails++; if (fails <= 3) console.log(`  lesson ${i}: ${e.message}`); }
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${chosen.length}`);
}
const old = JSON.parse(fs.readFileSync(String(o.scores), 'utf8'));
const last = old.layers.length - 1;
const picks = s.layers[last], mass = s.mass[last];
if (!picks) { console.error('no last-layer picks came back'); process.exit(1); }
const total = picks.reduce((a, b) => a + b, 0), seen = picks.filter((x) => x > 0).length;
const oldTotal = old.layers[last].reduce((a, b) => a + b, 0);
fs.writeFileSync(path.join(out, 'lastlayer.json'), JSON.stringify({ layer: last, lessons: s.lessons, generated_tokens: gen, fails, picks, mass, old_picks_total: oldTotal }));
console.log(`last layer ${last}: ${total} picks (was ${oldTotal}), ${seen} of ${old.experts} experts seen, ${gen} generated tokens, ${fails} fails`);
const v2 = { ...old, layers: old.layers.map((r, l) => (l === last ? picks : r)), mass: old.mass.map((r, l) => (l === last ? mass : r)), last_layer_rescored: { lessons: s.lessons, generated_tokens: gen, gen_max: Number(o.gen), reasoning_effort: String(o.reasoning), temperature: 0, date: new Date().toISOString().slice(0, 10) } };
fs.writeFileSync(path.join(out, 'scores-v2.json'), JSON.stringify(v2, null, 1));
const by = v2.hasMass ? String(o.by) : 'counts';
fs.writeFileSync(path.join(out, 'priority-v2.json'), JSON.stringify({ by, experts: v2.experts, used: v2.used, layers: priority(v2, by) }));
const keep = keepLists(v2, Number(o.share), by);
const tag = Math.round(Number(o.share) * 100);
fs.writeFileSync(path.join(out, `keep-${tag}-v2.json`), JSON.stringify({ share: Number(o.share), by, keep }));
const oldKeep = keepLists(old, Number(o.share), by);
console.log(`keep-${tag}-v2: layer ${last} changed ${keep[last].filter((e) => !oldKeep[last].includes(e)).length} of ${keep[last].length}; other layers unchanged: ${keep.every((k, l) => l === last || JSON.stringify(k) === JSON.stringify(oldKeep[l]))}`);
