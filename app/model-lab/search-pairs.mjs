// "Look it up when unsure" (14 Nov 2026, docs/TOOL-LESSONS-PLAN.md section 4). The odds kept on every benchmark answer
// say how sure the brain was; the checker says if it was right. Together they sort each question into four boxes:
//   sure + right    -> answer directly: seeds for "don't search" lessons
//   sure + wrong    -> the worst case (confident and wrong): seeds for "search first" lessons
//   unsure + right  -> search, or answer with a plain "I think": seeds for search lessons
//   unsure + wrong  -> search first
// Anything that changes (prices, versions, news, opening hours, weather) is always a search.
//
//   node search-pairs.mjs --answers <chats.jsonl,...> --out <folder> [--sure 0.8] [--first 16] [--ratio 0.5]
//
// In: benchmark answers with odds (make-datasets full/chats-*.jsonl, tool-score answers): { messages, ok, answer, odds,
// split }. Odds are [{ t, p }] with p the log-probability of each answer word. Rows with no odds are skipped.
// Out: seeds-search.jsonl and seeds-nosearch.jsonl for lesson-doctor.mjs (held-out rows go as held-out seeds: only
// look-alikes are ever made), search-cases.jsonl for the reward pass (grpo.py --search; taught rows only), BOXES.md.
// Rows made under a dial or surgery are left out (the surgery data rule).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { notForTraining } from './common.mjs';

export const CHANGES = /\b(price|prices|cost|costs|latest|newest|current|currently|today|tonight|this week|news|version|release|released|open now|opening hours|hours|weather|forecast|score|stock|exchange rate|who is the (ceo|president|prime minister))\b/i;
const SEARCH_TOOLS = new Set(['web_search', 'fetch_page']);
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p && p.type === 'text').map((p) => p.text).join(' ') : '');

// How sure: the mean chance of the first answer words (thinking and tool-call markup left out by the caller's odds).
export function sureness(odds, first = 16) {
  const ps = (odds || []).map((o) => (typeof o === 'number' ? o : o?.p)).filter((p) => Number.isFinite(p)).slice(0, first);
  if (!ps.length) return null;
  return ps.reduce((a, p) => a + Math.exp(Math.min(0, p)), 0) / ps.length;
}

export function box(row, { sure = 0.8, first = 16 } = {}) {
  const s = sureness(row.odds, first);
  if (s === null || typeof row.ok !== 'boolean') return null;
  const q = textOf([...(row.messages || [])].reverse().find((m) => m.role === 'user')?.content);
  if (!q) return null;
  const searched = (row.answer?.tool_calls || []).some((c) => SEARCH_TOOLS.has(c.function?.name || c.name));
  const changes = CHANGES.test(q);
  const k = s >= sure ? (row.ok ? 'sure-right' : 'sure-wrong') : (row.ok ? 'unsure-right' : 'unsure-wrong');
  const want = changes || k !== 'sure-right' ? 'search' : 'answer';
  return { q, sure: Math.round(s * 1000) / 1000, box: k, changes, searched, want };
}

export function sortAnswers(rows, opt = {}) {
  const boxes = { 'sure-right': 0, 'sure-wrong': 0, 'unsure-right': 0, 'unsure-wrong': 0 };
  const search = [], nosearch = [], cases = [];
  let skipped = 0;
  for (const r of rows) {
    if (notForTraining(r)) { skipped++; continue; }
    const b = box(r, opt); if (!b) { skipped++; continue; }
    boxes[b.box]++;
    const heldout = r.split === 'holdout' || r.heldout === true;
    const seed = { request: b.q, heldout, source: r.source || r.brain || 'benchmark', sure: b.sure, box: b.box };
    if (b.want === 'search') search.push({ ...seed, job: 'web', tool: b.searched ? '' : '(none)', right_tool: 'web_search', cause: b.changes ? 'a fact that changes, answered from memory' : `answered from memory when ${b.box === 'sure-wrong' ? 'confidently wrong' : 'unsure'}`, why: b.searched ? '' : 'no tool when one was needed: guessed instead of looking it up' });
    else nosearch.push({ ...seed, job: 'restraint', tool: b.searched ? 'web_search' : '', cause: 'a fact it knows well: answer directly, no search' });
    if (!heldout) cases.push({ id: `search-${cases.length}`, q: b.q, search: b.want === 'search' ? 'needed' : 'not_needed', box: b.box });
  }
  // one "don't search" lesson for every two search ones, so Bob doesn't search for everything
  const cap = Math.ceil(search.length * (opt.ratio ?? 0.5));
  return { boxes, search, nosearch: nosearch.slice(0, Math.max(cap, Math.min(nosearch.length, 10))), cases, skipped };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { opts, readJsonl } = await import('./common.mjs');
  const o = opts({ sure: 0.8, first: 16, ratio: 0.5 });
  if (!o.answers || !o.out) { console.error('--answers <files> --out <folder> are needed'); process.exit(1); }
  const rows = String(o.answers).split(',').filter(Boolean).flatMap((f) => readJsonl(f));
  const r = sortAnswers(rows, { sure: Number(o.sure), first: Number(o.first), ratio: Number(o.ratio) });
  const out = String(o.out); fs.mkdirSync(out, { recursive: true });
  const w = (f, a) => fs.writeFileSync(path.join(out, f), a.map((x) => JSON.stringify(x)).join('\n') + (a.length ? '\n' : ''));
  w('seeds-search.jsonl', r.search); w('seeds-nosearch.jsonl', r.nosearch); w('search-cases.jsonl', r.cases);
  fs.writeFileSync(path.join(out, 'BOXES.md'), `# Sure or unsure, right or wrong\n\n${rows.length} answers, ${r.skipped} skipped (no odds, no grade, or made under a dial or surgery). Sure means the first ${o.first} answer words averaged at least ${o.sure} chance.\n\n| | Right | Wrong |\n|---|---|---|\n| Sure | ${r.boxes['sure-right']} (answer directly) | ${r.boxes['sure-wrong']} (search first) |\n| Unsure | ${r.boxes['unsure-right']} (search or say "I think") | ${r.boxes['unsure-wrong']} (search first) |\n\n${r.search.length} search seeds, ${r.nosearch.length} don't-search seeds, ${r.cases.length} reward cases (taught rows only).\n`);
  console.log(`${r.search.length} search seeds, ${r.nosearch.length} don't-search seeds, ${r.cases.length} reward cases -> ${out}`);
}
