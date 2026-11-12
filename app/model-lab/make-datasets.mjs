// Sorts a benchmark's kept data into separate, publishable data sets. The raw folder is only read, never changed.
// - Two versions: the clean set (top folder: right answers only, the same answer from several brains once) and full/
//   (every answer, marked ok and with its kind of mistake). pairs-right-vs-wrong.jsonl pairs each wrong answer with the
//   full Qwen3.6's recorded right one for the same chat (preference training).
// - Chats (tool-score answers, rebuilt from the lessons): only answers that were RIGHT are kept, i.e. the same tool and
//   arguments as the full Qwen3.6 used, or correctly no tool. Wrong tool, wrong arguments and tools called for nothing are left out.
//   chats-tool-calls.jsonl and chats-no-tool.jsonl; each row names its tool set (toolsets.json, written once) instead of
//   repeating Bob's prompt and tools.
// - Quiz answers (experts-test): right ones only, quiz-tools.jsonl, quiz-facts.jsonl, quiz-code.jsonl.
// - REAP: reap-scores-<brain>.json (picks and mass per layer per expert), experts-by-layer-<brain>.json (each layer's
//   experts, strongest first), keep-<brain>-<NN>.json (the keep lists tried) and calibration-<brain>.json.
// Every answer keeps its odds (top 5 words per step) when the run saved them.
//
// node make-datasets.mjs --from <kept folder> --lessons <out/lessons> --out <folder> [--bob <Bob source, to judge older quiz tool answers>]
//      [--user <name>] [--host <name>] (default: this computer's) [--private "word,word"] [--words-file <file>]
// Every row goes through the privacy scrub (scrub-data.mjs: the user name, PC name, folders, addresses, private words,
// names spread over odds), then the output is checked again and it refuses (exit 2) if anything private is left.
// Give private names on the command line or in <install>/bob-model-lab/private-words.txt, never in the repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { opts, readJsonl, AGENT } from './common.mjs';
import { scrubber, scrubValue, scrubFolder, privateWordsFrom, splitKeep } from './scrub-data.mjs';
import { parseArgs, judgeTurn } from './tool-judge.mjs';
import { FACTS, CODE, runCode } from './quiz-items.mjs';

const o = opts({});
if (!o.from || !o.lessons || !o.out) { console.error('--from <kept folder> --lessons <lessons folder> --out <folder> are needed'); process.exit(1); }
const from = String(o.from), out = String(o.out);
if (path.resolve(out).startsWith(path.resolve(from) + path.sep) || path.resolve(out) === path.resolve(from)) { console.error('--out must be outside --from (the raw folder is never changed)'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(from);
const rel = (f) => path.relative(from, f).split(path.sep);
const clean = (s) => String(s).replace(/[^\w.-]/g, '_');
// The brain a file belongs to: the folder above calibrate/ or keep-NN/, or the file's own folder.
function brainOf(f) {
  const parts = rel(f).slice(0, -1);
  const i = parts.findIndex((p) => p === 'calibrate' || /^keep-\d+$/.test(p));
  return clean((i > 0 ? parts[i - 1] : parts.at(-1)) || 'brain');
}
const stepOf = (f) => (rel(f).join('/').match(/keep-(\d+)/)?.[1] ? `keep-${rel(f).join('/').match(/keep-(\d+)/)[1]}` : 'full');

// ---- lessons, for rebuilding each judged chat ----
const sets = JSON.parse(fs.readFileSync(path.join(String(o.lessons), 'toolsets.json'), 'utf8'));
const lessons = new Map(readJsonl(path.join(String(o.lessons), 'lessons.jsonl')).filter((l) => l.idea !== undefined).map((l) => [String(l.idea), l]));
function history(lesson, k) {
  let set = null, seen = 0; const msgs = [];
  for (const m of lesson.messages) {
    if (m.role === 'assistant') {
      if (set === null && sets[m.set]) set = m.set;
      if (seen === k) return { set, messages: msgs, want: m };
      seen++;
      msgs.push({ role: 'assistant', content: m.content || '', ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) });
    } else if (m.role === 'tool') msgs.push({ role: 'tool', tool_call_id: m.tool_call_id || 'call_0', name: m.name, content: String(m.content || '') });
    else msgs.push({ role: 'user', content: m.content || '' });
  }
  return null;
}

const sc = scrubber({
  user: typeof o.user === 'string' ? o.user : (() => { try { return os.userInfo().username; } catch { return ''; } })(),
  host: typeof o.host === 'string' ? o.host : os.hostname(),
  ...splitKeep(privateWordsFrom({ words: o.private, wordsFile: o['words-file'], agentDir: AGENT }))
});
const writers = new Map();
const put = (name, row) => { if (!writers.has(name)) writers.set(name, fs.openSync(path.join(out, name), 'w')); fs.writeSync(writers.get(name), JSON.stringify(scrubValue(row, sc)) + '\n'); };
const copyScrubbed = (f, to) => fs.writeFileSync(to, JSON.stringify(scrubValue(JSON.parse(fs.readFileSync(f, 'utf8')), sc)));
const count = {};
const tally = (k) => (count[k] = (count[k] || 0) + 1);
const usedSets = new Set(), seen = new Set();
fs.mkdirSync(path.join(out, 'full'), { recursive: true });

// ---- optional: Bob's own toolbox, for quiz tool answers saved before the ok mark existed ----
let groupOf = null;
if (o.bob) { const { loadBob } = await import('./bob-kit.mjs'); const kit = await loadBob(String(o.bob)); groupOf = kit.groupOf; }
const FACT = new Map(FACTS.map(([q, re]) => [q, re])), CODES = new Map(CODE.map(([q, name, test]) => [q, { name, test }]));

for (const f of files.filter((x) => /answers-.*\.jsonl$/.test(path.basename(x)))) {
  const brain = brainOf(f), step = stepOf(f), file = rel(f).join('/');
  for (const row of readJsonl(f)) {
    const odds = row.odds ? { odds: row.odds } : {};
    if (row.idea !== undefined) {   // tool-score: one turn of a held-out chat
      const lesson = lessons.get(String(row.idea)); const h = lesson && history(lesson, row.turn);
      if (!h) { tally('chat: lesson not found'); continue; }
      const wantCalls = (h.want.tool_calls || []).map((c) => ({ name: c.function.name, args: parseArgs(c.function.arguments) }));
      const got = (row.answer?.tool_calls || []).map((c) => ({ name: c.function?.name, args: parseArgs(c.function?.arguments) }));
      const ok = row.ok ?? judgeTurn(wantCalls, got);
      const kind = wantCalls.length ? 'tool-calls' : 'no-tool';
      const mistake = ok ? null : !wantCalls.length ? 'tool called for nothing' : !got.length ? 'no tool when one was needed'
        : [...new Set(wantCalls.map((c) => c.name))].sort().join() !== [...new Set(got.map((c) => c.name))].sort().join() ? 'wrong tool' : 'wrong arguments';
      usedSets.add(h.set);
      // split: 'holdout' rows are Bob's test set (never train on them); 'train' rows came from a harvest run (--split train)
      const base = { brain, step, split: row.split || 'holdout', idea: row.idea, turn: row.turn, think: row.think, toolset: h.set, messages: h.messages };
      // full: every answer, marked; clean: right ones only, the same answer from several brains kept once
      put(`full/chats-${kind}.jsonl`, { ...base, ok, ...(mistake ? { mistake } : {}), answer: row.answer, ...odds, source: file });
      if (!ok) {
        tally(`chat ${kind}: wrong (${mistake})`);
        // a pair: the full Qwen3.6's recorded answer (right) against this one (wrong), for preference training
        put('pairs-right-vs-wrong.jsonl', { ...base, mistake, chosen: { content: h.want.content || '', ...(h.want.tool_calls?.length ? { tool_calls: h.want.tool_calls } : {}) }, rejected: row.answer });
        continue;
      }
      const key = `${row.idea}/${row.turn}/${JSON.stringify(row.answer?.tool_calls || row.answer?.content || '')}`;
      if (seen.has(key)) { tally(`chat ${kind}: right, same as one already kept`); continue; }
      seen.add(key);
      put(`chats-${kind}.jsonl`, { ...base, answer: row.answer, ...odds, source: file });
      tally(`chat ${kind}: right, kept`);
    } else if (row.kind) {            // experts-test quiz
      let ok = row.ok;
      if (ok === undefined && row.kind === 'fact' && FACT.has(row.q)) ok = FACT.get(row.q).test(row.answer?.content || '');
      if (ok === undefined && row.kind === 'code' && CODES.has(row.q)) { const c = CODES.get(row.q); ok = runCode(row.answer?.content || '', c.name, c.test); }
      if (ok === undefined && row.kind === 'tool' && groupOf) ok = (row.answer?.tool_calls || []).some((c) => { const n = c.function?.name; return groupOf(n) === row.group || (n === 'use_tools' && parseArgs(c.function?.arguments).group === row.group); });
      const qn = `quiz-${row.kind === 'tool' ? 'tools' : row.kind === 'fact' ? 'facts' : 'code'}.jsonl`;
      const qrow = { brain, step, bob: row.bob, q: row.q, ...(row.group ? { group: row.group } : {}), answer: row.answer, ...odds, source: file };
      put(`full/${qn}`, { ...qrow, ok: ok ?? null });
      if (ok === undefined) { tally(`quiz ${row.kind}: not judged (pass --bob)`); continue; }
      if (!ok) { tally(`quiz ${row.kind}: wrong`); continue; }
      put(qn, qrow);
      tally(`quiz ${row.kind}: kept`);
    }
  }
}
for (const fd of writers.values()) fs.closeSync(fd);
if (usedSets.size) fs.writeFileSync(path.join(out, 'toolsets.json'), JSON.stringify(scrubValue(Object.fromEntries([...usedSets].map((k) => [k, sets[k]])), sc)));

// ---- REAP files, each its own file ----
for (const f of files) {
  const b = path.basename(f), brain = brainOf(f);
  if (b === 'scores.json') { const s = JSON.parse(fs.readFileSync(f, 'utf8')); fs.writeFileSync(path.join(out, `reap-scores-${brain}.json`), JSON.stringify(scrubValue({ brain, by: s.by, experts: s.experts, used: s.used, lessons: s.lessons, tokens: s.tokens, picks: s.layers, mass: s.mass }, sc))); tally('reap scores'); }
  else if (b === 'priority.json') { copyScrubbed(f, path.join(out, `experts-by-layer-${brain}.json`)); tally('experts by layer'); }
  else if (/^keep-\d+\.json$/.test(b)) { copyScrubbed(f, path.join(out, `keep-${brain}-${b.match(/\d+/)[0]}.json`)); tally('keep lists'); }
  else if (b === 'calibration.json') { copyScrubbed(f, path.join(out, `calibration-${brain}.json`)); tally('calibrations'); }
}

// ---- nothing private goes out: everything was scrubbed on the way in; now check what was written ----
const { leaks } = scrubFolder(out, null, sc);
for (const [k, v] of Object.entries(sc.counts)) count[`scrubbed: ${k}`] = v;
fs.writeFileSync(path.join(out, 'counts.json'), JSON.stringify(count, null, 1));
console.log(Object.entries(count).map(([k, v]) => `${k}: ${v}`).join('\n'));
for (const f of walk(out)) console.log(`  ${path.relative(out, f)}  ${(fs.statSync(f).size / 1e6).toFixed(2)} MB`);
if (leaks.length) { console.error(`STILL PRIVATE, do not publish (${leaks.length}):\n${leaks.slice(0, 40).join('\n')}`); process.exit(2); }
