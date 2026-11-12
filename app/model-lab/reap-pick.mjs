// REAP calibration's arithmetic, kept apart from the network so it can be tested: adding up Brain Engine expert
// traces, ranking each layer's experts, and turning a share ("keep 50%") into the per-layer keep lists /expert-mask takes.
// Nothing here cuts or changes a brain file.

// A running total in the Forge's counts shape: { experts, layers: [[picks]], mass: [[sum of w*|f(x)|]] }.
export function emptyScores() { return { experts: 0, used: 0, layers: [], mass: [], lessons: 0, tokens: 0, hasMass: true }; }

// Adds one answer's expert_trace (Brain Engine 0002 plus the mass patch). A trace without mass still counts picks.
export function addTrace(s, tr) {
  if (!tr || tr.kind && tr.kind !== 'experts') return false;
  const E = Number(tr.n_expert) || s.experts, layers = tr.layers;
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
export function smallestGood(steps, margin = 2) {
  const full = steps.find((x) => x.share === 1) || steps[0];
  if (!full) return null;
  const ok = steps.filter((x) => x.pct != null && x.pct >= full.pct - margin);
  return ok.sort((a, b) => a.share - b.share)[0] || full;
}
