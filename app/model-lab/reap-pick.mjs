// REAP calibration's arithmetic, kept apart from the network so it can be tested: adding up Brain Engine expert
// traces, ranking each layer's experts, and turning a share ("keep 50%") into the per-layer keep lists /expert-mask takes.
// Nothing here cuts or changes a brain file.

// A running total in the Forge's counts shape: { experts, layers: [[picks]], mass: [[sum of w*|f(x)|]] }.
export function emptyScores() { return { experts: 0, used: 0, layers: [], mass: [], lessons: 0, tokens: 0, hasMass: true }; }

// Adds one answer's expert_trace (Brain Engine 0002 plus the mass patch). A trace without mass still counts picks.
export function addTrace(s, tr) {
  if (!tr || tr.kind && tr.kind !== 'experts') return false;
  let layers = tr.layers;
  // 12 Nov: older engines (no expert-mass patch) may send only the per-word rows ({t, e: [[ids] per layer]}): count those
  if (!Array.isArray(layers) && Array.isArray(tr.rows)) layers = countRows(tr.rows, Number(tr.n_expert) || s.experts);
  const E = Number(tr.n_expert) || s.experts || (layers ? Math.max(0, ...layers.map((r) => (Array.isArray(r) ? r.length : 0))) : 0);
  if (!E || !Array.isArray(layers)) return false;
  s.experts = E; s.used = Number(tr.n_expert_used) || s.used;
  if (!Array.isArray(tr.mass)) s.hasMass = false;
  layers.forEach((row, l) => {
    if (!Array.isArray(row)) { s.layers[l] ??= null; s.mass[l] ??= null; return; }
    s.layers[l] ||= new Array(E).fill(0); s.mass[l] ||= new Array(E).fill(0);
    for (let e = 0; e < E; e++) {
      s.layers[l][e] += Number(row[e]) || 0;
      s.mass[l][e] += Number(tr.mass?.[l]?.[e]) || 0;
    }
  });
  s.lessons++; s.tokens += Array.isArray(tr.rows) ? tr.rows.length : 0;
  return true;
}

// Per-layer pick counts from a trace's per-word rows: rows[i].e[l] = the experts word i went to in layer l.
export function countRows(rows, E = 0) {
  const n = E || 1 + Math.max(-1, ...rows.flatMap((r) => (r?.e || []).flatMap((ids) => (Array.isArray(ids) ? ids : []))));
  const L = Math.max(0, ...rows.map((r) => (Array.isArray(r?.e) ? r.e.length : 0)));
  if (!n || !L) return null;
  const out = Array.from({ length: L }, () => null);
  for (const r of rows) (r?.e || []).forEach((ids, l) => { if (!Array.isArray(ids)) return; out[l] ||= new Array(n).fill(0); for (const id of ids) if (id >= 0 && id < n) out[l][id]++; });
  return out;
}

// One score per expert per layer. mass = its whole push over the lessons (busy and strong both count);
// reap = the REAP paper's average push per pick; counts = picks only (what the older cuts used).
export function scoreOf(s, l, e, by = 'mass') {
  const picks = s.layers[l]?.[e] || 0, mass = s.mass[l]?.[e] || 0;
  if (by === 'counts' || !s.hasMass) return picks;
  if (by === 'reap') return picks ? mass / picks : 0;
  return mass;
}

// Each layer's experts, strongest first: the priority list (which experts to keep on the card when the rest wait in RAM).
export function priority(s, by = 'mass') {
  return s.layers.map((row, l) => (Array.isArray(row)
    ? [...row.keys()].sort((a, b) => scoreOf(s, l, b, by) - scoreOf(s, l, a, by) || a - b)
    : null));
}

// Keep the top share of every layer (the same share everywhere: scores aren't comparable across layers), never fewer
// than the brain uses for each word. Ids sorted, as /expert-mask takes them; null = a layer with no router (all on).
export function keepLists(s, share, by = 'mass') {
  const n = Math.min(s.experts, Math.max(s.used || 1, Math.ceil(s.experts * share)));
  return priority(s, by).map((order) => (order ? order.slice(0, n).sort((a, b) => a - b) : null));
}

// The smallest share whose score stays within `margin` points (percent of turns) of the full brain's.
export function smallestGood(steps, margin = 2, cover = 0.95) {
  // 12 Nov: a step where the server crashed came back with 71 of 314 turns and looked "within the margin" on those few.
  // Each step is now judged against the most turns any step answered: missing turns count as wrong, and a step that
  // answered fewer than 95% of them is invalid and never picked.
  const most = Math.max(0, ...steps.map((x) => x.of || 0));
  const pctOf = (x) => (most && x.total != null ? (100 * x.total) / most : x.pct);
  const valid = (x) => x.pct != null && (!most || !x.of || x.of >= cover * most);
  const full = steps.find((x) => x.share === 1 && valid(x)) || steps.filter(valid).sort((a, b) => b.share - a.share)[0];
  if (!full) return null;
  const ok = steps.filter((x) => valid(x) && pctOf(x) >= pctOf(full) - margin);
  return ok.sort((a, b) => a.share - b.share)[0] || full;
}

// 13 Nov: llama.cpp runs the last layer only for the words whose output it needs, so a prompt-only trace (max_tokens 1)
// gave gpt-oss's last layer 400 picks against about a million elsewhere and its keep list was mostly guesses. A layer
// whose picks are far below the others is "thin"; reap-calibrate refuses to write keep lists while any layer is thin.
export function thinLayers(s, ratio = 0.5) {
  const picks = s.layers.map((row) => (row || []).reduce((a, b) => a + b, 0));
  const sorted = picks.filter((x) => x > 0).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  return picks.map((n, li) => ({ layer: li, picks: n, seen: (s.layers[li] || []).filter((x) => x > 0).length })).filter((x) => median && x.picks < ratio * median);
}
