// Right-vs-wrong answers for preference training (the Forge's heal.py --pref <folder>), built from what the Lab already keeps.
//
// node make-pairs.mjs --lessons <out/lessons> [--datasets <make-datasets out folder>] --out <folder> [--kind bob]
//
// From the lessons folder (write-lessons --review):
//   lessons.jsonl (kept) + rejected.jsonl (the review failed it): the same idea in both = a pair (kept is right).
//   Every kept lesson is also a marked "ok" answer, every rejected one a marked "failed" one (for KTO, which needs no pairs).
//   needs-review.jsonl (the review could not be read) is left out: unsure answers teach nothing either way.
// From a make-datasets folder (benchmark answers):
//   pairs-right-vs-wrong.jsonl (the full Qwen's answer against a cut brain's wrong one) = pairs;
//   full/chats-*.jsonl (every answer, marked ok or not) = marked answers.
//   Rows from tool-score's held-out chats are kept but marked "holdout": the heal only measures on them, never learns.
// Out: pairs.jsonl, kto.jsonl, toolsets.json, pref-info.json (counts, sources, kind).
// Only stock answers (the surgery data rule, 13 Nov): rows made under surgery, and evil- or fiction-check answers, are
// left out of both sides; see notForTraining in common.mjs.
// Kinds stay apart (the owner's rule, 13 Nov): --kind bob (default) refuses lessons that carry a style line ("Think: <name>"),
// because style sets train their own model and never Bob. Any odds a row carries go along with it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { opts, readJsonl, notForTraining } from './common.mjs';

const o = opts({ kind: 'bob' });
if (!o.lessons || !o.out) { console.error('--lessons <lessons folder> --out <folder> are needed (--datasets <make-datasets folder> adds benchmark pairs)'); process.exit(1); }
if (!['bob', 'style', 'distill'].includes(String(o.kind))) { console.error('--kind is bob, style or distill'); process.exit(1); }
const out = String(o.out); fs.mkdirSync(out, { recursive: true });
// the same 5% the Forge holds out (pod/data.py is_holdout): md5 of the idea, first 8 hex digits, under 0.05
const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;
const STYLE = /(^|\n)\s*Think:\s*\S/;
const styled = (msgs) => msgs.some((m) => STYLE.test(String(m.content || '')) || STYLE.test(String(m.reasoning || '')));
const tally = {}; const t = (k) => { tally[k] = (tally[k] || 0) + 1; };
const pairs = [], kto = [];
const keepOdds = (row) => (row.odds ? { odds: row.odds } : {});
const firstSet = (msgs) => msgs.find((m) => m.role === 'assistant' && m.set)?.set;
const withSet = (msgs, set) => msgs.map((m) => (m.role === 'assistant' && set && !m.set ? { ...m, set } : m));
const same = (a, b) => JSON.stringify(a.map((m) => [m.content || '', m.tool_calls || null])) === JSON.stringify(b.map((m) => [m.content || '', m.tool_calls || null]));

// ---- lessons: kept vs rejected ----
const lessonsDir = String(o.lessons);
const toolsets = fs.existsSync(path.join(lessonsDir, 'toolsets.json')) ? JSON.parse(fs.readFileSync(path.join(lessonsDir, 'toolsets.json'), 'utf8')) : {};
const kept = readJsonl(path.join(lessonsDir, 'lessons.jsonl')), rejected = readJsonl(path.join(lessonsDir, 'rejected.jsonl'));
tally['unsure (needs-review), left out'] = readJsonl(path.join(lessonsDir, 'needs-review.jsonl')).length;
const split = (l) => { const i = l.messages.findIndex((m) => m.role === 'assistant'); return i < 1 ? null : { prompt: l.messages.slice(0, i), answer: l.messages.slice(i) }; };
const byIdea = new Map();
for (const l of kept) {
  if (!l.messages || l.idea === undefined) continue;
  if (notForTraining(l)) { t('lesson made under surgery or an evil/fiction check, left out'); continue; }
  if (o.kind === 'bob' && styled(l.messages)) { t('lesson with a style line, left out'); continue; }
  const s = split(l); if (!s) continue;
  byIdea.set(String(l.idea), [...(byIdea.get(String(l.idea)) || []), { ...l, ...s }]);
  kto.push({ idea: l.idea, source: 'lessons', prompt: s.prompt, answer: s.answer, ok: true, ...keepOdds(l) }); t('lesson kept: marked ok');
}
for (const r of rejected) {
  if (!r.messages || r.idea === undefined) continue;
  if (notForTraining(r)) { t('rejected made under surgery or an evil/fiction check, left out'); continue; }
  if (o.kind === 'bob' && styled(r.messages)) { t('rejected with a style line, left out'); continue; }
  const s = split(r); if (!s) continue;
  kto.push({ idea: r.idea, source: 'lessons-rejected', why: r.why, prompt: s.prompt, answer: s.answer, ok: false, ...keepOdds(r) }); t('lesson rejected: marked failed');
  const mine = byIdea.get(String(r.idea)) || []; const good = mine.find((x) => x.think === r.think) || mine[0]; // same thinking mode first
  if (!good) continue;
  if (same(good.answer, s.answer)) { t('kept and rejected the same, no pair'); continue; }
  pairs.push({ idea: r.idea, source: 'lessons', why: r.why, prompt: s.prompt, chosen: good.answer, rejected: s.answer }); t('pair from the lessons');
}

// ---- benchmark answers from make-datasets ----
if (o.datasets) {
  const ds = String(o.datasets);
  const dsSets = fs.existsSync(path.join(ds, 'toolsets.json')) ? JSON.parse(fs.readFileSync(path.join(ds, 'toolsets.json'), 'utf8')) : {};
  for (const [k, v] of Object.entries(dsSets)) if (!toolsets[k]) toolsets[k] = v;
  const asAnswer = (a, set) => [{ role: 'assistant', set, content: a?.content || '', ...(a?.reasoning_content ? { reasoning: a.reasoning_content } : {}), ...(a?.tool_calls?.length ? { tool_calls: a.tool_calls } : {}) }];
  const held = (row) => (row.split && row.split !== 'train' ? { holdout: true } : {});
  for (const p of readJsonl(path.join(ds, 'pairs-right-vs-wrong.jsonl'))) {
    if (!p.messages || !p.chosen || !p.rejected) continue;
    if (notForTraining(p)) { t('benchmark pair made under surgery or an evil/fiction check, left out'); continue; }
    if (o.kind === 'bob' && styled(p.messages)) { t('benchmark pair with a style line, left out'); continue; }
    const prompt = withSet(p.messages, p.toolset);
    pairs.push({ idea: p.idea, turn: p.turn, source: `benchmark:${p.brain || '?'}`, why: p.mistake, ...held(p), prompt, chosen: asAnswer(p.chosen, p.toolset), rejected: asAnswer(p.rejected, p.toolset) });
    t(held(p).holdout ? 'benchmark pair (held out: measured only)' : 'benchmark pair');
  }
  const fullDir = path.join(ds, 'full');
  for (const f of fs.existsSync(fullDir) ? fs.readdirSync(fullDir).filter((x) => /^chats-.*\.jsonl$/.test(x)).sort() : []) {
    for (const row of readJsonl(path.join(fullDir, f))) {
      if (!row.messages || typeof row.ok !== 'boolean') continue;
      if (notForTraining(row)) { t('benchmark answer made under surgery or an evil/fiction check, left out'); continue; }
      if (o.kind === 'bob' && styled(row.messages)) { t('benchmark answer with a style line, left out'); continue; }
      kto.push({ idea: row.idea, turn: row.turn, source: `benchmark:${row.brain || '?'}`, ...held(row), prompt: withSet(row.messages, row.toolset), answer: asAnswer(row.answer, row.toolset), ok: row.ok, ...keepOdds(row) });
      t(`benchmark answer marked ${row.ok ? 'ok' : 'failed'}`);
    }
  }
}

// every assistant turn names its tool set, so the Forge renders Bob's prompt and tools around it
for (const p of pairs) { const s = firstSet(p.prompt) || firstSet(p.chosen) || firstSet(p.rejected); p.prompt = withSet(p.prompt, s); p.chosen = withSet(p.chosen, s); p.rejected = withSet(p.rejected, s); }
for (const k of kto) { const s = firstSet(k.prompt) || firstSet(k.answer); k.prompt = withSet(k.prompt, s); k.answer = withSet(k.answer, s); }
const write = (f, rows) => fs.writeFileSync(path.join(out, f), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
write('pairs.jsonl', pairs); write('kto.jsonl', kto);
fs.writeFileSync(path.join(out, 'toolsets.json'), JSON.stringify(toolsets));
const heldOut = (r) => r.holdout || isHoldout(r.idea);
const info = { kind: o.kind, made: new Date().toISOString(), pairs: pairs.length, pairs_held_out: pairs.filter(heldOut).length, marked: kto.length, marked_ok: kto.filter((k) => k.ok).length, marked_held_out: kto.filter(heldOut).length, from: { lessons: path.basename(lessonsDir), datasets: o.datasets ? path.basename(String(o.datasets)) : null }, tally };
fs.writeFileSync(path.join(out, 'pref-info.json'), JSON.stringify(info, null, 1));
console.log(`${pairs.length} pairs (${info.pairs_held_out} held out), ${kto.length} marked answers (${info.marked_ok} ok, ${info.marked_held_out} held out) -> ${out}`);
for (const [k, v] of Object.entries(tally)) console.log(`  ${k}: ${v}`);
