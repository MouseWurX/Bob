// Which experts each job and each style lights up (13 Nov, the owner: "use data while generating lessons to see if we can
// recommend any neurons for surgery on the smaller model"). A Brain Engine server READS finished lessons (nothing is written:
// one word out, cache off) with the expert trace on, and every lesson's expert picks are added to its target: "job:<job>"
// for a Bob set, "style:<name>" for a style set. What carries over to a brain is only what was measured ON that brain, so the
// same lessons are read by the writer (GPT-OSS 120B), its cut (the 38B) and the student (a Qwen Bob), each in its own folder.
//
// node trace-read.mjs --url <server> --sets bob=<dir>,sherlock=<dir>,... [--per 300] [--per-style N] [--top 4] [--mass --keep 0.75,0.5] [--out <folder>]
//   --mass: REAP scores per target too (Brain Engine 0009) and keep/<target>-keep-NN.json lists for live per-job presets
//   A set named "bob" is split by job; any other name is one style target. Held-out lessons (the 5% split) are never read.
// Writes in --out:
//   counts.json   {target: {layer: {expert: picks}}}  (the shape the surgery tools read)
//   lift.json     per target and layer, the experts it uses more (and less) than all targets together: share / overall share
//   dials.json    ready-to-try trials for expert-sweep.mjs --dials-file: "<target>-up" (its top experts x1.2) and "-down" (x0.8)
//   trace-read.md a short report
// Set LAB_API_KEY for a server with a key (the Forge's rented card).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { countRows, emptyScores, addTrace, keepLists } from './reap-pick.mjs';

const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

// A saved lesson as the chat the brain reads: system prompt from its set, then every turn as written.
export function whole(lesson, sets) {
  let system = null; const msgs = [];
  for (const m of lesson.messages || []) {
    if (m.role === 'assistant') {
      if (system === null && sets[m.set]) system = sets[m.set].system;
      // the thinking is where a style lives: it goes in front of the answer as <think>...</think>, the same for every chat template
      const thought = m.reasoning || m.reasoning_content || '';
      msgs.push({ role: 'assistant', content: thought ? `<think>\n${thought}\n</think>\n\n${m.content || ''}` : m.content || '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls.map((c, i) => ({ id: c.id || `call_${i}`, type: 'function', function: { name: c.function.name, arguments: typeof c.function.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function.arguments || {}) } })) } : {}) });
    } else if (m.role === 'tool') msgs.push({ role: 'tool', tool_call_id: m.tool_call_id || 'call_0', name: m.name, content: String(m.content || '') });
    else msgs.push({ role: 'user', content: typeof m.content === 'string' ? m.content : String(m.content?.find?.((p) => p.type === 'text')?.text || '') });
  }
  return system === null ? null : [{ role: 'system', content: system }, ...msgs];
}

// An even spread of up to `per` training lessons for each target.
export function pickLessons(setDirs, per, perStyle = per) {
  // several folders may share a name (bob=out/lessons,bob=out/lessons-codefix,...): their lessons pool by job before the spread
  const out = [], groups = new Map();
  for (const [name, dir] of setDirs) {
    const sets = fs.existsSync(path.join(dir, 'toolsets.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'toolsets.json'), 'utf8')) : {};
    const all = readJsonl(path.join(dir, 'lessons.jsonl')).filter((l) => l.idea !== undefined && !isHoldout(l.idea) && l.messages?.some((m) => m.role === 'assistant'));
    for (const l of all) { const t = name === 'bob' ? `job:${l.job || 'other'}` : `style:${name}`; if (!groups.has(t)) groups.set(t, []); groups.get(t).push({ lesson: l, sets }); }
  }
  for (const [t, ls] of groups) { const n = Math.min(t.startsWith('style:') ? perStyle : per, ls.length), stride = ls.length / Math.max(n, 1); for (let i = 0; i < n; i++) out.push({ target: t, ...ls[Math.floor(i * stride)] }); }
  return out;
}

// Add one trace to a target's per-layer counts.
export function addTo(acc, target, tr) {
  if (!tr || (tr.kind && tr.kind !== 'experts')) return false;
  const E = Number(tr.n_expert) || 0;
  const layers = Array.isArray(tr.layers) ? tr.layers : Array.isArray(tr.rows) ? countRows(tr.rows, E) : null;
  if (!Array.isArray(layers)) return false;
  const t = (acc[target] ||= { lessons: 0, tokens: 0, layers: [] });
  layers.forEach((row, l) => { if (!Array.isArray(row)) { t.layers[l] ??= null; return; } t.layers[l] ||= new Array(row.length).fill(0); row.forEach((v, e) => { t.layers[l][e] += Number(v) || 0; }); });
  t.lessons++; t.tokens += Array.isArray(tr.rows) ? tr.rows.length : 0;
  return true;
}

// share of a target's picks in each layer vs the share over every target together; lift > 1 = this target leans on it
export function lifts(acc, top = 4, minShare = 0.002) {
  const names = Object.keys(acc), L = Math.max(0, ...names.map((n) => acc[n].layers.length));
  const total = Array.from({ length: L }, (_, l) => { let row = null; for (const n of names) { const r = acc[n].layers[l]; if (!r) continue; row ||= new Array(r.length).fill(0); r.forEach((v, e) => { row[e] += v; }); } return row; });
  const out = {};
  for (const n of names) {
    out[n] = acc[n].layers.map((row, l) => {
      const all = total[l]; if (!row || !all) return null;
      const sr = row.reduce((a, b) => a + b, 0) || 1, sa = all.reduce((a, b) => a + b, 0) || 1;
      const ls = row.map((v, e) => ({ e, share: v / sr, lift: (v / sr) / Math.max(all[e] / sa, 1e-9) })).filter((x) => x.share >= minShare || all[x.e] / sa >= minShare);
      const up = [...ls].sort((a, b) => b.lift - a.lift).filter((x) => x.lift > 1.2).slice(0, top);
      const down = [...ls].sort((a, b) => a.lift - b.lift).filter((x) => x.lift < 0.8).slice(0, top);
      const r = (x) => ({ expert: x.e, lift: Math.round(x.lift * 100) / 100, share: Math.round(x.share * 1e4) / 1e4 });
      return { up: up.map(r), down: down.map(r) };
    });
  }
  return out;
}

// trials for expert-sweep.mjs --dials-file: [{name, dials: [{kind: 'expert', layer, index, scale}]}]
export function dialTrials(lift, upScale = 1.2, downScale = 0.8) {
  const trials = [];
  for (const [n, layers] of Object.entries(lift)) {
    const mk = (side, scale) => ({ name: `${n.replace(/[^\w.-]+/g, '-')}-${side}`, dials: layers.flatMap((x, l) => (x?.[side] || []).map((y) => ({ kind: 'expert', layer: l, index: y.expert, scale }))) });
    const up = mk('up', upScale); if (up.dials.length) trials.push(up);
    const down = mk('down', downScale); if (down.dials.length) trials.push(down);
  }
  return trials;
}

export const countsShape = (acc) => Object.fromEntries(Object.entries(acc).map(([n, t]) => [n, Object.fromEntries(t.layers.map((row, l) => [l, row ? Object.fromEntries(row.map((v, e) => [e, v]).filter(([, v]) => v > 0)) : {}]))]));

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
  const url = String(args.url || process.env.LAB_URL || '').replace(/\/+$/, '');
  if (!url || !args.sets) { console.error('node trace-read.mjs --url <Brain Engine server> --sets bob=<dir>,sherlock=<dir> [--per 300] [--out <folder>]'); process.exit(1); }
  const setDirs = String(args.sets).split(',').filter(Boolean).map((x) => { const [n, ...d] = x.split('='); return [n.trim(), path.resolve(d.join('=').trim())]; });
  const out = path.resolve(String(args.out || process.env.LAB_OUT || 'trace-read')); fs.mkdirSync(out, { recursive: true });
  const per = Number(args.per) || 300, perStyle = Number(args['per-style']) || per, top = Number(args.top) || 4;
  const headers = { 'content-type': 'application/json', ...(process.env.LAB_API_KEY ? { authorization: `Bearer ${process.env.LAB_API_KEY}` } : {}) };
  const post = async (body, tries = 4) => {
    for (let i = 1; ; i++) {
      try { const r = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10 * 60_000) }); const t = await r.text(); if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 200)}`); return JSON.parse(t); }
      catch (e) { if (i >= tries) throw e; await new Promise((res) => setTimeout(res, 4000 * i)); }
    }
  };
  const work = pickLessons(setDirs, per, perStyle);
  console.log(`Reading ${work.length} lessons over ${new Set(work.map((w) => w.target)).size} targets (up to ${per} each; held-out never read)`);
  const acc = {}, reap = {}; let fails = 0, E = 0, used = 0;
  // --mass: also REAP scores per target (patch 0009) and keep lists per target at --keep shares, for per-job live presets
  const mass = Boolean(args.mass), shares = String(args.keep || '0.75,0.5').split(',').map(Number).filter((x) => x > 0 && x <= 1);
  for (const [i, w] of work.entries()) {
    const messages = whole(w.lesson, w.sets); if (!messages) { fails++; continue; }
    try {
      const j = await post({ messages, max_tokens: 1, cache_prompt: false, expert_trace: true, ...(mass ? { expert_trace_mass: true } : {}), temperature: 0 });
      E ||= Number(j.expert_trace?.n_expert) || 0; used ||= Number(j.expert_trace?.n_expert_used) || 0;
      if (!addTo(acc, w.target, j.expert_trace)) fails++;
      if (mass) addTrace((reap[w.target] ||= emptyScores()), j.expert_trace);
    } catch (e) { fails++; if (fails <= 3) console.log(`  ${w.target} ${w.lesson.idea}: ${e.message.slice(0, 120)}`); }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${work.length}`);
  }
  if (!Object.keys(acc).length) { console.error('No expert traces came back. Is this a Brain Engine server with the expert trace, and a mixture-of-experts brain?'); process.exit(1); }
  const lift = lifts(acc, top);
  fs.writeFileSync(path.join(out, 'counts.json'), JSON.stringify(countsShape(acc)));
  fs.writeFileSync(path.join(out, 'lift.json'), JSON.stringify({ brain: process.env.LAB_MODEL_NAME || '', experts: E, used, targets: Object.fromEntries(Object.entries(acc).map(([n, t]) => [n, { lessons: t.lessons, tokens: t.tokens }])), lift }, null, 1));
  fs.writeFileSync(path.join(out, 'dials.json'), JSON.stringify(dialTrials(lift), null, 1));
  if (mass) {
    const kd = path.join(out, 'keep'); fs.mkdirSync(kd, { recursive: true });
    for (const [t, sc] of Object.entries(reap)) {
      const by = sc.hasMass ? 'mass' : 'counts';
      for (const sh of shares) fs.writeFileSync(path.join(kd, `${t.replace(/[^\w.-]+/g, '-')}-keep-${Math.round(sh * 100)}.json`), JSON.stringify({ target: t, share: sh, by, keep: keepLists(sc, sh, by) }));
    }
    console.log(`per-target keep lists (${shares.map((x) => Math.round(x * 100) + '%').join(', ')}) in ${kd}${Object.values(reap).some((x) => !x.hasMass) ? ' (no expert mass from this engine: ranked by picks)' : ''}`);
  }
  const rows = Object.entries(acc).map(([n, t]) => `| ${n} | ${t.lessons} | ${t.tokens} | ${lift[n].filter((x) => x?.up?.length).length} |`);
  fs.writeFileSync(path.join(out, 'trace-read.md'), [`# Experts per job and style: ${process.env.LAB_MODEL_NAME || url}`, '', `${E} experts per layer, ${used} per word. ${fails} lessons failed.`, 'Lift = a target\'s share of an expert / the share over all targets. Only measured on THIS brain: use it for this brain\'s dials.', '', '| target | lessons | words read | layers with a leaning expert |', '|---|---|---|---|', ...rows, ''].join('\n'));
  console.log(`Done: ${Object.keys(acc).length} targets, ${fails} failed. Files in ${out}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.message); process.exit(1); });
