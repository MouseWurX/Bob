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

// 13 Nov (the owner: "when we calibrate we should really do both"): the same TOTAL as keepLists(s, share), shared out
// unevenly. Each expert's score is taken as its fraction of its own layer's total (raw scores aren't comparable across
// layers), every layer starts with the experts it must use per word, and the rest of the budget goes to the highest
// fractions anywhere, so a spread-out layer gets more experts and a focused one fewer. A cut file holds one expert
// count for every layer, so this runs on the live switch; as a file it would be padded to the biggest layer (fileCount).
export function unevenKeepLists(s, share, by = 'mass') {
  const order = priority(s, by);
  const routed = order.filter(Boolean).length;
  const n = Math.min(s.experts, Math.max(s.used || 1, Math.ceil(s.experts * share)));
  const floor = Math.min(n, s.used || 1);
  const take = order.map((o) => (o ? floor : 0));
  const extra = [];
  order.forEach((o, l) => {
    if (!o) return;
    const tot = o.reduce((a, e) => a + scoreOf(s, l, e, by), 0) || 1;
    for (let i = floor; i < o.length; i++) extra.push({ l, i, f: scoreOf(s, l, o[i], by) / tot });
  });
  extra.sort((a, b) => b.f - a.f || a.l - b.l || a.i - b.i);
  // within a layer the fractions fall with i, so taking the top of this list always takes prefixes of each layer's order
  for (const x of extra.slice(0, Math.max(0, n * routed - floor * routed))) take[x.l] = Math.max(take[x.l], x.i + 1);
  return order.map((o, l) => (o ? o.slice(0, take[l]).sort((a, b) => a - b) : null));
}

// How much of each layer's score a keep list holds (0-1 per layer; null for a layer with no router).
export function coverage(s, keep, by = 'mass') {
  return keep.map((k, l) => {
    if (!k || !s.layers[l]) return null;
    const all = s.layers[l].reduce((a, _, e) => a + scoreOf(s, l, e, by), 0);
    return all ? k.reduce((a, e) => a + scoreOf(s, l, e, by), 0) / all : 1;
  });
}

// For each target share of a layer's score (0.5-0.99), how many experts each layer needs, strongest first (never fewer
// than it uses per word), and the keep lists: what the live switch would take to hold that share everywhere.
export function coverTable(s, targets = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.99], by = 'mass') {
  const order = priority(s, by);
  return targets.map((t) => {
    const keep = order.map((o, l) => {
      if (!o) return null;
      const sc = o.map((e) => scoreOf(s, l, e, by)), all = sc.reduce((a, b) => a + b, 0);
      let n = 0, got = 0;
      while (n < o.length && (n < (s.used || 1) || got < t * all)) got += sc[n++];
      return o.slice(0, n).sort((a, b) => a - b);
    });
    const counts = keep.map((k) => (k ? k.length : null)), c = counts.filter((x) => x != null);
    return { target: t, total: c.reduce((a, b) => a + b, 0), min: Math.min(...c), max: Math.max(...c), counts, keep };
  });
}

// The expert count a cut file would need for this keep list (one count for every layer: the biggest).
export const fileCount = (keep) => Math.max(0, ...keep.filter(Boolean).map((k) => k.length));

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
  // a last layer re-scored from written answers (reap-lastlayer.mjs) has fewer readings but real ones: not thin
  const rescored = s.last_layer_rescored ? s.layers.length - 1 : -1;
  return picks.map((n, li) => ({ layer: li, picks: n, seen: (s.layers[li] || []).filter((x) => x > 0).length })).filter((x) => median && x.picks < ratio * median && x.layer !== rescored);
}
