// Lesson scoring (20 Nov, the owner: "We have good lessons, dont we?"): how sure is a brain of the RIGHT answer, word by word,
// on real-jobs lessons it never wrote? A quant check that reads tool names, JSON, paths and code apart from plain prose,
// so a Q3 brain that keeps its prose but slips on tool names shows up (whole-text perplexity hides that).
//
// How: each assistant turn of a lesson is rendered with the brain's own chat template (/apply-template: the lesson's system
// prompt and tool list, thinking off), and the brain is made to write exactly the lesson's answer (a grammar that allows only
// that text, greedy). Each written token comes back with the brain's own odds before the grammar (n_probs, raw logits):
// the right token's log-odds, whether it was the brain's own first pick, and its top 20. Nothing is trained or written;
// the lessons are only read. One request per turn, so a rented card's distance from this PC hardly matters.
//
//   node lesson-score.mjs --url <server> --lessons <lessons.jsonl> --toolsets <toolsets.json> --pick 120 --out <folder>
//        [--only-idea jobs-fix1] [--max-chars 4000] [--top 20] [--limit N] [--preflight]
//   node lesson-score.mjs --compare <ref folder> <folder> [<folder> ...] --out <report.md>   (the first is the reference, e.g. Q8)
//
// Out: <folder>/scores.jsonl (one row per turn: lesson id, turn, the gold text, and per token id, piece, logprob, top pick, top 20)
// and <folder>/summary.md. --compare adds, per kind of text, the mean gold log-odds, the brain's own first pick rate, and against
// the reference: KLD over the top 20 (the rest folded into one bucket) and the same-first-pick rate, only where both brains
// wrote the same tokens in the same order.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const KINDS = ['tool-name', 'json', 'path', 'code', 'prose', 'other'];

// Which lessons: the ones a neutral teacher wrote (default: the Qwen3.8 Flash-Next real-jobs run, not our own 35B), in a fixed
// order from a hash of the idea, so every brain and every rerun gets the same pick.
export function pickLessons(rows, { pick = 120, onlyIdea = 'jobs-fix1' } = {}) {
  const ok = rows.filter((r) => !onlyIdea || String(r.idea || '').includes(onlyIdea));
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  return ok.map((r) => ({ r, k: h(r.idea) })).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)).slice(0, pick).map((x) => x.r);
}

// The messages for /apply-template: the lesson's own system prompt and tools (from its tool set), Bob's extra fields dropped.
export function chatMessages(lesson, toolsets) {
  const set = lesson.messages.find((m) => m.set)?.set;
  const ts = set ? toolsets[set] : null;
  const msgs = [];
  if (ts?.system && lesson.messages[0]?.role !== 'system') msgs.push({ role: 'system', content: ts.system });
  for (const m of lesson.messages) {
    const o = { role: m.role, content: m.content ?? '' };
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) o.tool_calls = m.tool_calls.map((c, i) => ({ id: c.id || `call_${i}`, type: 'function', function: { name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments ?? {}) } }));
    if (m.role === 'tool') { if (m.name) o.name = m.name; if (m.tool_call_id) o.tool_call_id = m.tool_call_id; }
    msgs.push(o);
  }
  return { msgs, tools: ts?.tools || [], set };
}

// The prompt and the right answer for turn i: the turn as history (a short user line after it, so no template treats it as an
// open reply) against the turns before it with the reply opened. The answer is what the full text adds past the shared start,
// up to the turn's end mark. Templates differ on the empty think block, so the shared start is measured, not assumed.
export function splitTurn(before, full, { endMark = '<|im_end|>' } = {}) {
  let n = 0; const m = Math.min(before.length, full.length);
  while (n < m && before[n] === full[n]) n++;
  const rest = full.slice(n); const e = rest.indexOf(endMark);
  if (e < 0) return null;
  const gold = rest.slice(0, e);
  return gold.trim() ? { prompt: full.slice(0, n), gold } : null;
}

// A grammar that allows only this text (GBNF string literal).
export function grammarFor(text) {
  const esc = String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  return `root ::= "${esc}"`;
}

// What kind of text each character of the answer is: inside a tool call the function name, a path-like JSON string, or other
// JSON; outside, fenced code, a path in prose, think/template marks, or prose.
const PATH_RE = /(?:[A-Za-z]:[\\/]|\\\\|~[\\/]|\.{1,2}[\\/]|\/(?:[\w.-]+\/)+)[^\s"'`<>|*?]*|\b[\w-]+\.(?:txt|md|json|js|mjs|py|cs|cpp|h|docx|xlsx|pptx|pdf|csv|png|jpg|html|css|ts|bat|cmd|ps1|sh|ini|yaml|yml|toml|log|gguf|uasset|blend)\b/g;
export function charKinds(gold) {
  const k = new Array(gold.length).fill('prose');
  const mark = (a, b, v) => { for (let i = Math.max(0, a); i < Math.min(gold.length, b); i++) k[i] = v; };
  for (const m of gold.matchAll(/```[\s\S]*?(?:```|$)/g)) mark(m.index, m.index + m[0].length, 'code');
  for (const m of gold.matchAll(PATH_RE)) mark(m.index, m.index + m[0].length, 'path');
  for (const m of gold.matchAll(/<\/?think>|<\/?tool_call>|<\/?function(?:=[^>]*)?>|<\/?parameter(?:=[^>]*)?>/g)) mark(m.index, m.index + m[0].length, 'other');
  // tool calls: Qwen's JSON shape <tool_call>{"name": ..., "arguments": {...}}</tool_call> and the XML shape <function=name>
  for (const m of gold.matchAll(/<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g)) {
    const s = m.index + '<tool_call>'.length, body = m[1];
    mark(s, s + body.length, 'json');
    for (const q of body.matchAll(/"((?:[^"\\]|\\.)*)"/g)) { const a = s + q.index + 1, b = a + q[1].length; if (PATH_RE.test(q[1].replace(/\\\\/g, '\\'))) mark(a, b, 'path'); PATH_RE.lastIndex = 0; }
    const nm = body.match(/"name"\s*:\s*"([^"]*)"/); if (nm) { const a = s + nm.index + nm[0].lastIndexOf(nm[1]); mark(a, a + nm[1].length, 'tool-name'); }
    const fn = body.match(/<function=([^>\s]+)>/); if (fn) { const a = s + fn.index + '<function='.length; mark(a, a + fn[1].length, 'tool-name'); }
  }
  return k;
}

// Each token takes the kind of most of its characters (ties: the earlier kind in KINDS, so tool names win).
export function tokenKinds(gold, pieces) {
  const ck = charKinds(gold); const out = []; let at = 0;
  for (const p of pieces) {
    const n = p.length; const c = {};
    for (let i = at; i < Math.min(gold.length, at + n); i++) c[ck[i]] = (c[ck[i]] || 0) + 1;
    at += n;
    out.push(KINDS.reduce((best, x) => ((c[x] || 0) > (c[best] || 0) ? x : best), n ? (Object.keys(c)[0] || 'other') : 'other'));
  }
  return out;
}

const post = async (fetchFn, url, route, body) => {
  const r = await fetchFn(url.replace(/\/$/, '') + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.LAB_API_KEY ? { authorization: `Bearer ${process.env.LAB_API_KEY}` } : {}) }, body: JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${route} ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
};

// One turn: force the gold text, read back the odds of each written token.
export async function scoreTurn({ url, prompt, gold, top = 20, fetchFn = fetch }) {
  const j = await post(fetchFn, url, '/completion', { prompt, grammar: grammarFor(gold), n_predict: Math.ceil(gold.length * 1.5) + 16, temperature: 0, n_probs: top, post_sampling_probs: false, cache_prompt: true, special: true, return_tokens: true });
  const probs = j.completion_probabilities || [];
  const toks = probs.map((p) => ({ id: p.id, piece: p.token, lp: p.logprob, top1: p.top_logprobs?.[0]?.id === p.id, top: (p.top_logprobs || []).map((t) => [t.id, t.logprob]) }));
  const text = toks.map((t) => t.piece).join('');
  return { toks, text, matched: text === gold, stop: j.stop_type || j.stopped_eos || null };
}

export async function scoreLessons({ url, lessons, toolsets, top = 20, maxChars = 4000, fetchFn = fetch, onRow = () => {}, log = () => {} }) {
  const tally = { turns: 0, scored: 0, skipped: 0, mismatched: 0, tokens: 0 };
  for (const lesson of lessons) {
    const { msgs, tools } = chatMessages(lesson, toolsets);
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].role !== 'assistant') continue;
      tally.turns++;
      const kw = { chat_template_kwargs: { enable_thinking: false } };
      let sp;
      try {
        const before = (await post(fetchFn, url, '/apply-template', { messages: msgs.slice(0, i), tools, add_generation_prompt: true, ...kw })).prompt;
        const full = (await post(fetchFn, url, '/apply-template', { messages: [...msgs.slice(0, i + 1), { role: 'user', content: 'ok' }], tools, add_generation_prompt: false, ...kw })).prompt;
        sp = splitTurn(before, full);
      } catch (e) { log(`${lesson.idea} turn ${i}: template ${e.message}`); }
      if (!sp || sp.gold.length > maxChars) { tally.skipped++; continue; }
      let r;
      try { r = await scoreTurn({ url, prompt: sp.prompt, gold: sp.gold, top, fetchFn }); } catch (e) { log(`${lesson.idea} turn ${i}: ${e.message}`); tally.skipped++; continue; }
      if (!r.matched) tally.mismatched++;
      tally.scored++; tally.tokens += r.toks.length;
      onRow({ idea: lesson.idea, job: lesson.job, turn: i, gold: sp.gold, matched: r.matched, kinds: tokenKinds(sp.gold, r.toks.map((t) => t.piece)), toks: r.toks });
    }
  }
  return tally;
}

// ---- the comparison (at home, from the folders) ----
// KLD(ref || test) over the reference's top list, the rest of each side folded into one "other" bucket.
export function topKld(refTop, testTop) {
  const tm = new Map(testTop.map((t) => [t[0], t[1]]));
  const floor = testTop.length ? Math.min(...testTop.map((t) => t[1])) : Math.log(1e-6);
  const p = refTop.map((t) => Math.exp(t[1]));
  // a reference pick missing from the test's top 20 is below its 20th, and all such share what the test's top list leaves over
  const miss = refTop.filter((t) => !tm.has(t[0])).length;
  const left = Math.max(1e-9, 1 - testTop.reduce((s, t) => s + Math.exp(t[1]), 0));
  const qMiss = Math.min(Math.exp(floor), left / Math.max(1, miss));
  const q = refTop.map((t) => (tm.has(t[0]) ? Math.exp(tm.get(t[0])) : qMiss));
  const pRest = Math.max(1e-12, 1 - p.reduce((s, x) => s + x, 0)), qRest = Math.max(1e-12, 1 - q.reduce((s, x) => s + x, 0));
  let k = 0; for (let i = 0; i < p.length; i++) if (p[i] > 0) k += p[i] * Math.log(p[i] / Math.max(1e-12, q[i]));
  return Math.max(0, k + pRest * Math.log(pRest / qRest));
}

export function readRows(folder, read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')) {
  return read(path.join(folder, 'scores.jsonl')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function compare(ref, tests, { names } = {}) {
  const key = (r) => `${r.idea}#${r.turn}`;
  const refMap = new Map(ref.map((r) => [key(r), r]));
  const stats = (rows, against) => {
    const s = {}; for (const k of [...KINDS, 'all']) s[k] = { n: 0, lp: 0, top1: 0, kn: 0, kld: 0, same: 0 };
    for (const r of rows) {
      const rr = against ? refMap.get(key(r)) : null;
      let aligned = !!rr;
      r.toks.forEach((t, i) => {
        for (const k of [r.kinds[i] || 'other', 'all']) { const x = s[k]; x.n++; x.lp += t.lp; x.top1 += t.top1 ? 1 : 0; }
        if (aligned && (!rr.toks[i] || rr.toks[i].id !== t.id)) aligned = false;
        if (aligned) for (const k of [r.kinds[i] || 'other', 'all']) { const x = s[k]; x.kn++; x.kld += topKld(rr.toks[i].top, t.top); x.same += (rr.toks[i].top[0]?.[0] === t.top[0]?.[0]) ? 1 : 0; }
      });
    }
    return s;
  };
  const all = [{ name: names?.[0] || 'reference', s: stats(ref, false) }, ...tests.map((t, i) => ({ name: names?.[i + 1] || `brain ${i + 1}`, s: stats(t, true) }))];
  const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '-');
  const lines = ['| kind | brain | tokens | mean right-token log-odds | own first pick = right | KLD vs reference (top 20) | same first pick as reference | compared tokens |', '|---|---|---|---|---|---|---|---|'];
  for (const k of ['all', ...KINDS]) for (const b of all) { const x = b.s[k]; if (!x.n) continue; lines.push(`| ${k} | ${b.name} | ${x.n} | ${f(x.lp / x.n)} | ${f(100 * x.top1 / x.n, 1)}% | ${x.kn ? f(x.kld / x.kn, 4) : '-'} | ${x.kn ? f(100 * x.same / x.kn, 1) + '%' : '-'} | ${x.kn || '-'} |`); }
  return { table: lines.join('\n'), stats: all };
}

async function main(argv) {
  const a = argv.slice(2); const arg = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  if (a.includes('--compare')) {
    const i = a.indexOf('--compare'); const folders = []; for (let j = i + 1; j < a.length && !a[j].startsWith('--'); j++) folders.push(a[j]);
    const out = arg('--out'); if (folders.length < 2 || !out) { console.error('--compare <ref> <folder> [...] --out <report.md>'); process.exit(1); }
    const rows = folders.map((f) => readRows(f));
    const r = compare(rows[0], rows.slice(1), { names: folders.map((f) => path.basename(path.resolve(f))) });
    fs.writeFileSync(out, `# Lesson scoring, ${new Date().toISOString().slice(0, 10)}\n\nReference: ${path.basename(path.resolve(folders[0]))}. Only tokens written in the same order as the reference are compared for KLD.\n\n${r.table}\n`);
    console.log(r.table); return;
  }
  const url = arg('--url'), out = arg('--out');
  const lessonsFile = arg('--lessons'), toolsetsFile = arg('--toolsets');
  if (!url || !out || !lessonsFile || !toolsetsFile) { console.error('needs --url --lessons --toolsets --out'); process.exit(1); }
  const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const rows = read(lessonsFile).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const toolsets = JSON.parse(read(toolsetsFile));
  let lessons = pickLessons(rows, { pick: Number(arg('--pick', 120)), onlyIdea: arg('--only-idea', 'jobs-fix1') });
  if (arg('--limit')) lessons = lessons.slice(0, Number(arg('--limit')));
  const noSet = lessons.filter((l) => { const s = l.messages.find((m) => m.set)?.set; return !s || !toolsets[s]; }).length;
  console.log(`${lessons.length} lessons picked (${rows.length} in the file), ${noSet} without their tool set`);
  if (a.includes('--preflight')) { if (!lessons.length || noSet) process.exit(1); console.log('preflight ok: lessons and tool sets read; nothing sent'); return; }
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, 'scores.jsonl'); fs.writeFileSync(file, '');
  const t0 = Date.now();
  const tally = await scoreLessons({ url, lessons, toolsets, top: Number(arg('--top', 20)), maxChars: Number(arg('--max-chars', 4000)), onRow: (r) => fs.appendFileSync(file, JSON.stringify(r) + '\n'), log: (m) => console.log(m) });
  const s = `${tally.scored} of ${tally.turns} turns scored (${tally.skipped} skipped, ${tally.mismatched} where the written text differs from the lesson), ${tally.tokens} tokens, ${Math.round((Date.now() - t0) / 1000)} s`;
  fs.writeFileSync(path.join(out, 'summary.md'), `# Lesson scoring: ${path.basename(path.resolve(out))}\n\n${s}\n\n${compare(readRows(out), []).table}\n`);
  console.log(s);
  if (!tally.scored) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv).catch((e) => { console.error(e.message); process.exit(1); });
