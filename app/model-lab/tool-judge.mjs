// How tool-score judges one turn against the full Qwen3.6's recorded answer, shared with make-datasets.
const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, ' ') : JSON.stringify(v));
export function parseArgs(a) { if (a && typeof a === 'object') return a; try { return JSON.parse(a || '{}'); } catch { return { input: String(a) }; } }
export function sameArgs(want, got, free = []) {
  // every argument the original gave must be there with the same value (extra optional ones are fine); long free text only needs to overlap
  for (const [k, v] of Object.entries(want)) {
    if (free.includes(k)) continue; // a free argument (fair.free_args): any value, or none, is fine
    if (!(k in got)) return false;
    const a = norm(v), b = norm(got[k]);
    if (a === b) continue;
    if (a.length > 40 && b.length > 40) { const wa = new Set(a.split(/\W+/)); const hit = b.split(/\W+/).filter((w) => wa.has(w)).length; if (hit / wa.size >= 0.6) continue; }
    return false;
  }
  return true;
}


// Right = no tool when none was wanted, or the same tool names with every wanted argument matching.
export function judgeStrict(wantCalls, got, free = []) {
  if (!wantCalls.length) return !got.length;
  const names = (a) => [...new Set(a.map((c) => c.name))].sort().join(',');
  if (names(wantCalls) !== names(got)) return false;
  return wantCalls.every((w) => got.some((g) => g.name === w.name && sameArgs(w.args, g.args, free)));
}

// 15 Nov (the owner: "if scores were unfair why were they unfair? how do we fix that moving forward?"). Opus read the
// 132 held-out items flagged unfair: 87 required a needless or repeated look (an extra read, a second web_search), 11 had
// another tool or no tool just as right, 8 punished a fair question, 7 wanted an exact optional argument. So the judge is fair
// by default:
//   - looks are free when the reference does something: a turn whose action calls (not LOOKS) match is right with or
//     without the reference's extra reads and searches; a turn that only looks must look with the same tool and arguments
//   - a plain-chat turn still has to be plain: a tool on a plain question stays wrong (the owner's main worry)
//   - skipping the reference's look and going straight to its next action is right: tool-score passes fair.next, the
//     reference's next action calls in the same job (before the person writes again)
//   - the reference turn may carry fair: { also_ok: [[calls], [] = no tool], free_args: ['format'] } for the other right ways
// { strict: true } (tool-score --strict-judge) gives the old rule, to compare with old benchmarks.
export const LOOKS = new Set(['list_folder', 'read_file', 'search_files', 'web_search', 'fetch_page', 'read_calendar', 'recall_memory', 'look_at_job']);
export function judgeTurn(wantCalls, got, fair = {}) {
  const f = fair || {}; const free = Array.isArray(f.free_args) ? f.free_args : [];
  if (judgeStrict(wantCalls, got, free)) return true;
  if (f.strict) return false;
  for (const alt of Array.isArray(f.also_ok) ? f.also_ok : []) if (Array.isArray(alt) && judgeStrict(alt.map((c) => ({ name: c.name, args: parseArgs(c.args) })), got, free)) return true;
  if (!wantCalls.length) return false;
  const act = (a) => a.filter((c) => !LOOKS.has(c.name));
  if (act(wantCalls).length) return act(got).length > 0 && judgeStrict(act(wantCalls), act(got), free);
  if (act(got).length) return Array.isArray(f.next) && f.next.length > 0 && judgeStrict(act(f.next.map((c) => ({ name: c.name, args: parseArgs(c.args) }))), act(got), free);
  return got.length > 0 && wantCalls.some((w) => got.some((g) => g.name === w.name && sameArgs(w.args, g.args, free)));
}
