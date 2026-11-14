// Smoke gate before a big paid write (13 Nov, the owner: a few lessons first, then the big run only if they're right).
// Reads a small lessons folder the writer just made (write-lessons --count 6 --think all --odds 8 --review ...) and checks:
//   (a) odds: do they cover the thinking words, or only the answer? Answer-only is NOT a stop: it is logged, and every turn
//       already says which it is ("covers" in odds.jsonl), so the big run carries on with answer-only odds marked as such.
//   (b) lessons: enough passed the review, at least one used a tool, and every tool call's arguments parse as JSON.
//   (c) trace: the server reads a finished lesson with the expert trace (and mass) on, as trace-read.mjs will.
// A failed (b) or (c) exits with code 86: the Forge then stops the run and deletes the pod (forge.mjs), so no money goes on a
// write that can't be used. Writes gate.json and GATE.md in --dir.
// node smoke-gate.mjs --dir <smoke lessons folder> [--url <server>] [--min 4] [--no-trace]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { whole } from './trace-read.mjs';
import { live } from './engine-live.mjs';

export const STOP = 86;
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

// (a) from odds.jsonl rows: {turns: [{covers}]}
export function oddsCheck(rows) {
  const c = { 'think+answer': 0, 'answer-only': 0, answer: 0, none: 0 };
  for (const r of rows) for (const t of r.turns || []) { if (!t.odds?.length) c.none++; else c[t.covers || 'answer']++; }
  const thinkTurns = c['think+answer'] + c['answer-only'];
  const verdict = !rows.length ? 'no odds' : !thinkTurns ? 'no thinking turns to check' : c['think+answer'] >= c['answer-only'] ? 'odds cover the thinking' : 'answer-only';
  return { counts: c, verdict };
}

// (b) lessons that passed the review, tool calls that parse
export function lessonCheck(lessons, rejected, min = 4) {
  let calls = 0, bad = 0, withTool = 0; const bads = [];
  for (const l of lessons) {
    let used = false;
    for (const m of l.messages || []) for (const c of m.tool_calls || []) {
      calls++; used = true;
      const a = c.function?.arguments;
      try { const j = typeof a === 'string' ? JSON.parse(a || '{}') : a; if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('not an object'); }
      catch { bad++; bads.push(`${l.idea}: ${c.function?.name} ${String(a).slice(0, 80)}`); }
    }
    if (used) withTool++;
  }
  const problems = [];
  if (lessons.length < min) problems.push(`only ${lessons.length} lessons passed the review (need ${min}; ${rejected.length} rejected${rejected[0] ? `, e.g. "${rejected[0].why}"` : ''})`);
  if (!withTool) problems.push('no lesson used a tool');
  if (bad) problems.push(`${bad} of ${calls} tool calls have arguments that don't parse`);
  return { passed: lessons.length, rejected: rejected.length, calls, bad, withTool, bads: bads.slice(0, 10), ok: !problems.length, problems };
}

// (c) one lesson read with the trace on
export async function traceCheck(eng, lesson, sets) {
  const messages = whole(lesson, sets); if (!messages) return { ok: false, why: 'the lesson has no tool set to rebuild its prompt' };
  try {
    const j = await eng.trace(messages, { mass: true });
    const tr = j.expert_trace;
    if (!tr) return { ok: false, why: 'the server answered without expert_trace (not Brain Engine, or the trace patch is missing)' };
    const layers = Array.isArray(tr.layers) ? tr.layers.filter(Array.isArray).length : 0, rows = Array.isArray(tr.rows) ? tr.rows.length : 0;
    if (!layers && !rows) return { ok: false, why: `expert_trace came back empty (kind ${tr.kind || '?'})` };
    return { ok: true, kind: tr.kind, experts: tr.n_expert, used: tr.n_expert_used, layers, rows, mass: Array.isArray(tr.mass) };
  } catch (e) { return { ok: false, why: e.message.slice(0, 200) }; }
}

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const dir = path.resolve(String(a.dir || '')); const url = String(a.url || process.env.LAB_URL || '');
  if (!a.dir || !fs.existsSync(dir)) { console.error(`GATE STOP: no smoke lessons folder at ${dir}`); process.exit(STOP); }
  const sets = fs.existsSync(path.join(dir, 'toolsets.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'toolsets.json'), 'utf8')) : {};
  const lessons = readJsonl(path.join(dir, 'lessons.jsonl')).filter((l) => l.messages?.length);
  const odds = oddsCheck(readJsonl(path.join(dir, 'odds.jsonl')));
  const les = lessonCheck(lessons, readJsonl(path.join(dir, 'rejected.jsonl')), Number(a.min) || 4);
  const tr = a['no-trace'] ? { ok: true, skipped: true } : !url ? { ok: false, why: 'no --url for the trace check' } : lessons[0] ? await traceCheck(live(url), lessons.find((l) => l.messages.some((m) => m.tool_calls?.length)) || lessons[0], sets) : { ok: false, why: 'no lesson to read' };
  const stop = [...(les.ok ? [] : les.problems.map((p) => `(b) ${p}`)), ...(tr.ok ? [] : [`(c) trace: ${tr.why}`])];
  const gate = { when: new Date().toISOString(), odds, lessons: les, trace: tr, stop: stop.length ? stop : null, odds_mode: odds.verdict === 'answer-only' ? 'answer-only' : 'as written' };
  fs.writeFileSync(path.join(dir, 'gate.json'), JSON.stringify(gate, null, 1));
  const md = ['# Smoke gate', '', `(a) odds: ${odds.verdict} (${Object.entries(odds.counts).map(([k, v]) => `${k} ${v}`).join(', ')})${odds.verdict === 'answer-only' ? '. Not a stop: the big run carries on and every turn is marked answer-only in odds.jsonl.' : ''}`,
    `(b) lessons: ${les.passed} passed review, ${les.rejected} rejected, ${les.withTool} used a tool, ${les.calls} tool calls, ${les.bad} that don't parse. ${les.ok ? 'OK' : 'STOP: ' + les.problems.join('; ')}`,
    `(c) trace: ${tr.skipped ? 'skipped' : tr.ok ? `OK (${tr.kind}, ${tr.experts} experts, ${tr.used} per word, ${tr.layers || tr.rows} layers/rows, mass ${tr.mass ? 'yes' : 'no'})` : 'STOP: ' + tr.why}`, '',
    stop.length ? `Result: STOP. The run ends here and the pod is deleted.` : 'Result: go on to the big write.', ''].join('\n');
  fs.writeFileSync(path.join(dir, 'GATE.md'), md); console.log(md);
  if (stop.length) { console.error(`GATE STOP: ${stop.join(' | ')}`); process.exit(STOP); }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(`GATE STOP: ${e.message}`); process.exit(STOP); });
