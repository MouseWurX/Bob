// Expert sweep: what helps or hinders each target, measured live on a running Brain Engine (no file changed, no rental).
// Each trial sets the engine's live switches, replays every target's held-out chats (first turn, judged like tool-score),
// and records the score per target next to the same chats with nothing changed. The owner (13 Nov): "not just + experts".
//
// node expert-sweep.mjs --url http://127.0.0.1:8090 --lessons out/lessons --targets targets.json [--trials trials.json]
//      [--used "-4,-2,+2,+4,+10"] [--layer-scale "0.8,1.2"] [--groups 4] [--sample 60] [--out <folder>]
//
// Trials (a list, from --trials or built from the switches):
//   {"name": "...", "used": N | "+N" | "-N" | [per layer, null = own]}   experts per word (patch 0013, /experts-per-word)
//   {"name": "...", "dials": [{"kind": "expert"|"head"|"attn"|"ffn", "layer", "index", "scale"}]}   turn parts up or down (0003, /dials)
//   {"name": "...", "keep": [[experts kept per layer]]}   switch experts off (0001, /expert-mask)
// Built-in: --used "-4,+2,+10" (every layer, relative to the brain's own count); --layer-scale "0.8,1.2" with --groups 4 scales the
// feed-forward and, separately, the attention of each quarter of the layers. --dials-file <file> adds expert dials from a trace.
// Out: expert-sweep-<time>.json and .md: per trial, per target, right / chats and the change against the baseline.
// The engine is put back (own counts, no dials, every expert on) at the end, even after an error.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { opts, readJsonl, stamp } from './common.mjs';
import { parseArgs, judgeTurn } from './tool-judge.mjs';

const o = opts({ sample: 60, groups: 4 });
if (!o.url || !o.lessons) { console.error('--url <Brain Engine> --lessons <lessons folder> are needed (--targets <file> to split by target)'); process.exit(1); }
const url = String(o.url).replace(/\/$/, '');
const lessonsDir = String(o.lessons);
const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;
let sets = {}; // 1.5.219 a plain message, not a crash, when the set has no tool sets
try { sets = JSON.parse(fs.readFileSync(path.join(lessonsDir, 'toolsets.json'), 'utf8')) || {}; } catch (e) { console.error(`${lessonsDir} has no readable toolsets.json (${e.code || e.message}): the sweep needs Bob's prompt and tools for each lesson`); process.exit(1); }
const targets = o.targets ? JSON.parse(fs.readFileSync(String(o.targets), 'utf8')) : {};
const targetOf = (job) => Object.entries(targets).find(([, t]) => (t.jobs || []).includes(job))?.[0] || (Object.keys(targets).length ? 'other' : 'all');

// every target's held-out chats: the first assistant turn, with Bob's prompt and tools, judged like tool-score
const byTarget = {};
for (const l of readJsonl(path.join(lessonsDir, 'lessons.jsonl'))) {
  if (l.idea === undefined || !isHoldout(l.idea)) continue;
  const i = (l.messages || []).findIndex((m) => m.role === 'assistant'); if (i < 1) continue;
  const want = l.messages[i]; const set = sets[want.set]; if (!set) continue;
  const t = targetOf(l.job || '');
  (byTarget[t] ||= []).push({ idea: l.idea, messages: [{ role: 'system', content: set.system }, ...l.messages.slice(0, i).map((m) => ({ role: m.role === 'tool' ? 'tool' : 'user', content: String(m.content || '') }))], tools: set.tools,
    want: (want.tool_calls || []).map((c) => ({ name: c.function.name, args: parseArgs(c.function.arguments) })) });
}
const n = Number(o.sample);
for (const k of Object.keys(byTarget)) { const all = byTarget[k]; if (all.length > n) { const step = all.length / n; byTarget[k] = Array.from({ length: n }, (_, i) => all[Math.floor(i * step)]); } }
if (!Object.keys(byTarget).length) { console.error(`no held-out tool lessons in ${lessonsDir} (held-out ideas whose first answer uses a set in toolsets.json)`); process.exit(1); }

const post = async (p, body) => {
  const r = await fetch(url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (r.status === 404) throw new Error(`this Brain Engine has no ${p} (update the engine)`);
  if (!r.ok) throw new Error(`${p}: ${(await r.text()).slice(0, 200)}`);
};
async function shape() { // the brain's layers and its own experts per word, from /experts-per-word (0013); older engines: from --layers/--used-own
  try { const r = await fetch(url + '/experts-per-word', { signal: AbortSignal.timeout(10000) }); if (r.ok) { const j = await r.json(); const own = j.own || j.used; if (Array.isArray(own)) return { layers: own.length, own }; } } catch {}
  const L = Number(o.layers) || 0; return { layers: L, own: L ? Array(L).fill(Number(o['used-own']) || 8) : [] };
}
const reset = async () => { for (const [p, b] of [['/experts-per-word', { used: null }], ['/dials', { dials: [] }], ['/expert-mask', { keep: null }]]) { try { await post(p, b); } catch {} } };

// ---- the trials ----
const sh = await shape();
const trials = [{ name: 'as built' }];
if (o.trials) trials.push(...JSON.parse(fs.readFileSync(String(o.trials), 'utf8')));
for (const d of o.used ? String(o.used).split(',').map((s) => s.trim()).filter(Boolean) : []) trials.push({ name: `experts per word ${d}`, used: d });
if (o['layer-scale'] && sh.layers) {
  const G = Math.max(1, Number(o.groups)), per = Math.ceil(sh.layers / G);
  for (const s of String(o['layer-scale']).split(',').map(Number).filter((x) => x >= 0)) for (let g = 0; g < G; g++) for (const kind of ['ffn', 'attn']) {
    const layers = Array.from({ length: per }, (_, i) => g * per + i).filter((x) => x < sh.layers);
    trials.push({ name: `${kind} x${s}, layers ${layers[0]}-${layers.at(-1)}`, dials: layers.map((layer) => ({ kind, layer, index: 0, scale: s })) });
  }
}
if (o['dials-file']) trials.push(...JSON.parse(fs.readFileSync(String(o['dials-file']), 'utf8')).map((d, i) => ({ name: d.name || `dials ${i + 1}`, dials: d.dials })));
const usedOf = (u) => (u === undefined ? undefined : Array.isArray(u) ? u : /^[+-]\d+$/.test(String(u)) ? sh.own.map((x) => Math.max(1, x + Number(u))) : Number(u));

async function grade(chats) {
  let right = 0, errors = 0;
  for (const c of chats) {
    try {
      const r = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5 * 60000),
        body: JSON.stringify({ messages: c.messages, ...(c.tools?.length ? { tools: c.tools } : {}), max_tokens: 1500, temperature: 0, stream: false, chat_template_kwargs: { enable_thinking: false } }) });
      if (!r.ok) { errors++; continue; }
      const msg = (await r.json()).choices?.[0]?.message || {};
      if (judgeTurn(c.want, (msg.tool_calls || []).map((x) => ({ name: x.function?.name, args: parseArgs(x.function?.arguments) })))) right++;
    } catch { errors++; }
  }
  return { right, chats: chats.length, errors };
}

const results = [];
try {
  for (const t of trials) {
    await reset();
    try {
      if (t.used !== undefined) await post('/experts-per-word', { used: usedOf(t.used) });
      if (t.dials) await post('/dials', { dials: t.dials });
      if (t.keep) await post('/expert-mask', { keep: t.keep });
    } catch (e) { results.push({ name: t.name, skipped: e.message }); console.log(`${t.name}: skipped (${e.message})`); continue; }
    const per = {};
    for (const [k, chats] of Object.entries(byTarget)) per[k] = await grade(chats);
    results.push({ name: t.name, setting: { ...(t.used !== undefined ? { used: t.used } : {}), ...(t.dials ? { dials: t.dials.length } : {}), ...(t.keep ? { keep: 'mask' } : {}) }, targets: per });
    console.log(`${t.name}: ${Object.entries(per).map(([k, v]) => `${k} ${v.right}/${v.chats}`).join(', ')}`);
  }
} finally { await reset(); }

const base = results[0]?.targets || {};
for (const r of results) if (r.targets) for (const [k, v] of Object.entries(r.targets)) v.change = base[k] ? v.right - base[k].right : 0;
// a trial that helps one target and costs another is flagged, so a gain on one cannot hide a loss on another
for (const r of results) if (r.targets) { const ch = Object.values(r.targets).map((v) => v.change); r.mixed = ch.some((x) => x > 0) && ch.some((x) => x < 0); }
const out = String(o.out || path.dirname(path.resolve(lessonsDir))); fs.mkdirSync(out, { recursive: true });
const when = stamp(), names = Object.keys(byTarget);
fs.writeFileSync(path.join(out, `expert-sweep-${when}.json`), JSON.stringify({ url: 'local', layers: sh.layers, own: sh.own, sample: n, targets: Object.fromEntries(names.map((k) => [k, byTarget[k].length])), results }, null, 1));
const cell = (v) => (v ? `${v.right}/${v.chats}${v.change ? ` (${v.change > 0 ? '+' : ''}${v.change})` : ''}` : '');
fs.writeFileSync(path.join(out, `expert-sweep-${when}.md`), [`# Expert sweep, ${when}`, '', `Held-out chats per target (first turn, judged like tool-score), the engine's live switches only: the brain file is not changed.`, '',
  `| Trial | ${names.join(' | ')} | Mixed |`, `|---|${names.map(() => '---').join('|')}|---|`,
  ...results.map((r) => r.skipped ? `| ${r.name} | ${names.map(() => '').join(' | ')} | skipped: ${r.skipped} |` : `| ${r.name} | ${names.map((k) => cell(r.targets[k])).join(' | ')} | ${r.mixed ? 'helps one, hurts another' : ''} |`)].join('\n') + '\n');
console.log(`Report: ${path.join(out, `expert-sweep-${when}.md`)}`);
