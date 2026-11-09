// 1.5.164 Computer Science Lab, Playground: Peek inside ("Which experts did you use for that?",
// bob-design/cs-lab-learn-and-tinker.md section 5).
//   Level 1, the map: layers across, experts down, one square per expert, shaded by how much of a thing's work it
//     carries, drawn from the usage map's peek-counts.json (the things already counted with llama-imatrix).
//   Level 2, the live view: type a question, Brain Engine answers it with "expert_trace": true on /completion and
//     reports, for every word it wrote, which experts each layer picked. The map lights up; a scrubber steps word by
//     word; two questions can be compared, with the overlap in words. Keep only these applies the lit-up set as the
//     expert mask and asks again. Until Brain Engine reports the trace, the live card is greyed with the reason.
//   The tally: Keep count adds every traced word to peek-counts.json as the thing "Peek inside" (source "peek"), and
//     rewrites the Lab's keep file, so Cut these out and Send to the Forge use the same file the usage map writes.
// Brain Engine stays loaded between questions for a short while, so the second question is quick; any other Lab job
// unloads it first.
import fs from 'node:fs';
import path from 'node:path';
import { readPeek, peekFile, keepFileOf, mergePeek, keepFromPeek, usageLists } from './lab-usage.js';

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.part', JSON.stringify(v)); fs.renameSync(f + '.part', f); };
export const PEEK_THING = 'Peek inside';
export const IDLE_MS = 3 * 60e3; // how long Brain Engine stays loaded after a question
export const MAX_WORDS = 240;
export const NO_TRACE = 'This Brain Engine build doesn\'t report which experts it picked yet. The map still shows what the usage map counted; the live view comes with the next Brain Engine build.';
export const NO_ENGINE = 'The live view needs Brain Engine, the Lab\'s engine. Get it in Get models, Engines (Brain Engine, test build).';

// One brain's map data for the page: the things counted so far, the totals, per-layer lines, and whether live is possible.
export function peekView(cfg, brain, facts, { engineFound = false, traceOk = null } = {}) {
  const peek = readPeek(cfg, brain);
  const live = !facts?.experts ? { ok: false, why: `${brain.name} isn't a mixture-of-experts brain, so there's nothing to peek at.` }
    : !engineFound ? { ok: false, why: NO_ENGINE } : traceOk === false ? { ok: false, why: NO_TRACE } : { ok: true, why: '' };
  if (!peek?.things?.length) return { brain: brain.id, have: false, experts: facts?.experts || 0, layers: facts?.layers || 0, live };
  const lists = usageLists(peek);
  return {
    brain: brain.id, have: true, when: peek.when, experts: lists.experts, layers: lists.layers, live,
    things: peek.things.map((t) => ({ name: t.name, source: t.source || 'imatrix', tokens: t.tokens || 0, counts: t.counts })),
    total: peek.total,
    perLayer: lists.perLayer.map((l) => ({ layer: l.layer, used: l.used, cold: l.cold.length, coldIds: l.cold })),
    cold: lists.cold, coldShare: lists.coldShare, keepFile: path.basename(keepFileOf(cfg, brain)), file: peek.things.some((t) => t.source === 'peek') ? 'peek' : 'imatrix'
  };
}

// A trace as Brain Engine returns it, in either of the two shapes we accept, as counts[layer][expert] and the per-word
// lists. tokens = [{ text, layers: [[ids]...] }].
export function tallyTrace(trace, tokens = [], { experts = 0, layers = 0 } = {}) {
  const rows = Array.isArray(trace) ? trace : Array.isArray(trace?.tokens) ? trace.tokens : [];
  const counts = Array.from({ length: layers }, () => (experts ? new Array(experts).fill(0) : null));
  const words = [];
  rows.slice(0, MAX_WORDS).forEach((row, ti) => {
    const perLayer = Array.isArray(row) ? row : Array.isArray(row?.layers) ? row.layers : Array.isArray(row?.experts) ? row.experts : [];
    const clean = perLayer.map((ids) => (Array.isArray(ids) ? ids.map(Number).filter((e) => Number.isInteger(e) && e >= 0) : []));
    clean.forEach((ids, li) => { if (li >= counts.length) counts.push(experts ? new Array(experts).fill(0) : []); if (!counts[li]) counts[li] = experts ? new Array(experts).fill(0) : []; for (const e of ids) { while (counts[li].length <= e) counts[li].push(0); counts[li][e]++; } });
    words.push({ text: String(tokens[ti]?.piece ?? tokens[ti]?.text ?? tokens[ti] ?? ''), layers: clean });
  });
  const lit = counts.map((row) => (row ? row.map((v, e) => (v > 0 ? e : -1)).filter((e) => e >= 0) : null));
  const total = counts.reduce((a, row) => a + (row ? row.length : 0), 0) || 1;
  const used = lit.reduce((a, row) => a + (row ? row.length : 0), 0);
  return { counts, lit, words, used, share: Math.round((1000 * used) / total) / 10 };
}

// How much two questions' lit-up sets have in common: shared experts over the union, as a percentage.
export function overlap(litA, litB) {
  let both = 0, either = 0;
  const L = Math.max(litA.length, litB.length);
  for (let li = 0; li < L; li++) {
    const a = new Set(litA[li] || []), b = new Set(litB[li] || []);
    for (const e of a) { either++; if (b.has(e)) both++; }
    for (const e of b) if (!a.has(e)) either++;
  }
  return { both, either, share: either ? Math.round((1000 * both) / either) / 10 : 0 };
}

// Add a traced answer to the tally in peek-counts.json (the thing "Peek inside", source "peek") and rewrite the keep file.
export function addToTally(cfg, brain, { sha256, facts, counts, tokens, engine = 'Brain Engine', when }) {
  const old = readPeek(cfg, brain);
  const prev = old && old.brain?.sha256 === sha256 ? old.things.find((t) => t.name === PEEK_THING && t.source === 'peek') : null;
  const sum = counts.map((row, li) => (row ? row.map((v, e) => v + ((prev?.counts?.[li] || [])[e] || 0)) : (prev?.counts?.[li] || null)));
  const thing = { name: PEEK_THING, source: 'peek', tokens: (prev?.tokens || 0) + tokens, counts: sum };
  const peek = mergePeek(old, { brain: { name: brain.name, sha256, experts: facts.experts, expertUsed: facts.used, layers: facts.layers }, things: [thing], engine, when });
  if (old?.tried) peek.tried = old.tried;
  writeJson(peekFile(cfg, brain), peek);
  writeJson(keepFileOf(cfg, brain), keepFromPeek(peek, brain.name));
  return { tokens: thing.tokens, things: peek.things.length, keepFile: keepFileOf(cfg, brain) };
}

// The keep file from a lit-up set alone ("Keep only these"): one list per layer, padded to one size with the busiest
// of the rest, as the Lab's cutter needs. counts from tallyTrace.
export function keepFromLit(counts, facts) {
  const rows = counts.map((r) => (r ? r.map((v, e) => [v, e]) : null));
  const K = Math.max(facts.used || 1, ...rows.filter(Boolean).map((r) => r.filter(([v]) => v > 0).length));
  return rows.map((r) => (r ? r.sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, K).map(([, e]) => e).sort((a, b) => a - b) : null));
}

// Ask Brain Engine one question with the trace on. ask = the server's url; returns { answer, trace, tokens } or
// throws NO_TRACE when the build has no trace.
export async function askTraced(url, question, { signal, fetchImpl = fetch, maxWords = MAX_WORDS } = {}) {
  const t = await fetchImpl(url + '/apply-template', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: question }], chat_template_kwargs: { enable_thinking: false } }), signal: AbortSignal.timeout(30e3) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const prompt = t?.prompt || `<|im_start|>user\n${question}<|im_end|>\n<|im_start|>assistant\n`;
  const res = await fetchImpl(url + '/completion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, n_predict: maxWords, temperature: 0, expert_trace: true, return_tokens: true, cache_prompt: false }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300e3)]) : AbortSignal.timeout(300e3) });
  if (!res.ok) throw new Error(`Brain Engine answered ${res.status}.`);
  const j = await res.json();
  const trace = j.expert_trace ?? j.experts_trace ?? j.experts ?? null;
  if (!trace) throw new Error(NO_TRACE);
  const pieces = Array.isArray(j.tokens_text) ? j.tokens_text : Array.isArray(j.tokens) && typeof j.tokens[0] === 'object' ? j.tokens : [];
  return { answer: String(j.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(), trace, tokens: pieces, tps: Number(j.timings?.predicted_per_second) || 0 };
}
