// How tool-score judges one turn against the full Qwen3.6's recorded answer, shared with make-datasets.
const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, ' ') : JSON.stringify(v));
export function parseArgs(a) { if (a && typeof a === 'object') return a; try { return JSON.parse(a || '{}'); } catch { return { input: String(a) }; } }
export function sameArgs(want, got) {
  // every argument the original gave must be there with the same value (extra optional ones are fine); long free text only needs to overlap
  for (const [k, v] of Object.entries(want)) {
    if (!(k in got)) return false;
    const a = norm(v), b = norm(got[k]);
    if (a === b) continue;
    if (a.length > 40 && b.length > 40) { const wa = new Set(a.split(/\W+/)); const hit = b.split(/\W+/).filter((w) => wa.has(w)).length; if (hit / wa.size >= 0.6) continue; }
    return false;
  }
  return true;
}


// Right = no tool when none was wanted, or the same tool names with every wanted argument matching.
export function judgeTurn(wantCalls, got) {
  if (!wantCalls.length) return !got.length;
  const names = (a) => [...new Set(a.map((c) => c.name))].sort().join(',');
  if (names(wantCalls) !== names(got)) return false;
  return wantCalls.every((w) => got.some((g) => g.name === w.name && sameArgs(w.args, g.args)));
}
