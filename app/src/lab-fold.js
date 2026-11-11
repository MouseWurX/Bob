// Fold instead of drop (the proper name is expert merging). A cut drops the experts it doesn't keep. A fold blends each
// of them into the kept expert most like it first, so some of what it knew stays:
//   1. Which kept expert: the one whose router row points the most alike (cosine), layer by layer.
//   2. Line the neurons up: two experts never keep the same thing in the same slot, so each neuron of the folded
//      expert is matched to the most alike neuron of the kept one (greedy, on a sample of its in and out weights).
//   3. Blend: a weighted average, each expert weighing what it's used (its count on the lessons). The router row is
//      blended the same way. With no counts the kept expert weighs half and the folded ones share the other half.
// It works on the numbers, so it needs the full-size file (F32, F16 or BF16). The same rule runs on a rented card in
// model-lab/forge/pod/fold.py. Folding alone doesn't teach anything back: the brain still wants its heal afterwards.
import fs from 'node:fs';
import { readGguf, brainFacts, checkKeep, isExpertTensor, writeGgufFrom, kvsFrom, FLOAT_TYPES, f16ToF32, encodeFloats, FILE_TYPES } from './lab-gguf.js';

const SAMPLE = 128; // weights sampled per neuron, each way, to line neurons up

// The expert parts a fold knows how to blend. Biases (gpt-oss has them) follow their weights: a gate or up bias is one
// number per neuron, so it's lined up like the rows; a down bias and the router's bias are plain averages.
const PARTS = ['ffn_gate_exps.weight', 'ffn_up_exps.weight', 'ffn_down_exps.weight', 'ffn_gate_inp.weight', 'ffn_gate_exps.bias', 'ffn_up_exps.bias', 'ffn_down_exps.bias', 'ffn_gate_inp.bias'];
const partOf = (name) => { const m = name.match(/^blk\.(\d+)\.(.+)$/); return m ? { layer: Number(m[1]), part: m[2] } : null; };

// Why this file can't be folded ('' = it can). Said before anything is written.
export function foldWhyNot(g) {
  const f = brainFacts(g);
  if (!f.experts) return 'This brain has no experts to fold (it isn\'t a mixture-of-experts brain).';
  for (const t of g.tensors) {
    if (!isExpertTensor(t.name)) continue;
    const p = partOf(t.name);
    if (!PARTS.includes(p.part)) return `This brain's experts have a part folding doesn't handle yet (${p.part}). Cut it without folding.`;
    if (!FLOAT_TYPES.has(t.type)) return `Folding blends the experts' numbers, so it needs the full-size file (F16 or BF16). This one is a running file${FILE_TYPES[g.meta['general.file_type']] ? ` (${FILE_TYPES[g.meta['general.file_type']]})` : ''}. Start from the full-size copy, or cut without folding.`;
  }
  return '';
}

const BYTES = { 0: 4, 1: 2, 30: 2 };
const bf = new DataView(new ArrayBuffer(4));
function floatAt(buf, type, i) {
  if (type === 0) return buf.readFloatLE(i * 4);
  if (type === 1) return f16ToF32(buf.readUInt16LE(i * 2));
  bf.setUint32(0, buf.readUInt16LE(i * 2) << 16); return bf.getFloat32(0);
}
function floatsOf(buf, type) {
  const n = buf.length / BYTES[type], out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = floatAt(buf, type, i);
  return out;
}
const sampleIdx = (n) => { const s = Math.min(n, SAMPLE), out = new Int32Array(s); for (let i = 0; i < s; i++) out[i] = Math.floor((i * n) / s); return out; };

// Which kept expert each dropped one folds into: the most alike router row. rows = Float32Array(E * H).
export function foldTargets(rows, E, H, kept) {
  const norm = new Float64Array(E);
  for (let e = 0; e < E; e++) { let s = 0; for (let h = 0; h < H; h++) s += rows[e * H + h] ** 2; norm[e] = Math.sqrt(s) || 1; }
  const isKept = new Set(kept), out = new Map();
  for (let d = 0; d < E; d++) {
    if (isKept.has(d)) continue;
    let best = kept[0], bs = -Infinity;
    for (const t of kept) { let s = 0; for (let h = 0; h < H; h++) s += rows[d * H + h] * rows[t * H + h]; s /= norm[d] * norm[t]; if (s > bs) { bs = s; best = t; } }
    out.set(d, best);
  }
  return out;
}

// Line up the neurons of expert d with expert t. feat = Float32Array(I * S), one unit-length row per neuron.
// Returns perm with perm[slot of t] = neuron of d. Greedy: the most alike pair first, each neuron used once.
export function alignNeurons(featT, featD, I, S) {
  const sim = new Float32Array(I * I);
  for (let a = 0; a < I; a++) for (let b = 0; b < I; b++) { let s = 0; const ao = a * S, bo = b * S; for (let k = 0; k < S; k++) s += featT[ao + k] * featD[bo + k]; sim[a * I + b] = s; }
  const order = new Uint32Array(I * I); for (let i = 0; i < order.length; i++) order[i] = i;
  order.sort((x, y) => sim[y] - sim[x] || x - y);
  const perm = new Int32Array(I).fill(-1), used = new Uint8Array(I); let left = I;
  for (let i = 0; i < order.length && left; i++) { const a = Math.floor(order[i] / I), b = order[i] % I; if (perm[a] >= 0 || used[b]) continue; perm[a] = b; used[b] = 1; left--; }
  return perm;
}

// How much each member of a group weighs. members[0] is the kept expert.
export function foldWeights(members, counts) {
  const w = members.map((e) => Math.max(0, Number(counts?.[e]) || 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (counts && sum > 0) return w.map((x) => x / sum);
  if (counts) return members.map((_, i) => (i ? 0 : 1)); // counted, and nobody in the group was ever picked: the kept one stays as it is
  return members.map((_, i) => (i ? 0.5 / (members.length - 1) : members.length > 1 ? 0.5 : 1));
}

// One use table from several skills' counts: per layer, every skill weighs the same (its shares are summed).
export function foldUse(list) {
  const L = Math.max(...list.map((c) => c.length));
  return Array.from({ length: L }, (_, li) => {
    const rows = list.map((c) => c[li]).filter((r) => r && r.length);
    if (!rows.length) return undefined;
    const out = new Array(rows[0].length).fill(0);
    for (const r of rows) { const t = r.reduce((a, b) => a + b, 0) || 1; r.forEach((v, e) => { out[e] += v / t; }); }
    return out;
  });
}

// Write dst from src with keep[layer] = experts kept, every other expert folded into one of them.
// counts[layer] = how often each expert was picked (optional). Returns { tensors, bytes, folded, kept }.
export async function foldGguf(src, dst, { keep, counts = null, onProgress = () => {}, signal } = {}) {
  const g = readGguf(src);
  const f = brainFacts(g);
  const why = checkKeep(g, keep) || foldWhyNot(g);
  if (why) throw new Error(why);
  const E = f.experts, K = keep[f.expertLayers[0]].length;
  const byName = new Map(g.tensors.map((t) => [t.name, t]));
  const fd = fs.openSync(src, 'r');
  const read = (t, off, len) => { const b = Buffer.alloc(len); const got = fs.readSync(fd, b, 0, len, g.dataStart + t.offset + off); if (got !== len) throw new Error(`${t.name} ends early in the file.`); return b; };
  const slab = (t, e) => read(t, e * (t.bytes / E), t.bytes / E);
  const plans = new Map(); // layer -> { kept: sorted ids, groups: Map(kept -> [{ e, perm, w }]) }
  let folded = 0; const counted = new Set();
  const planFor = (li) => {
    if (plans.has(li)) return plans.get(li);
    const tg = byName.get(`blk.${li}.ffn_gate_exps.weight`), td = byName.get(`blk.${li}.ffn_down_exps.weight`), tr = byName.get(`blk.${li}.ffn_gate_inp.weight`);
    if (!tg || !td || !tr || !byName.get(`blk.${li}.ffn_up_exps.weight`)) throw new Error(`Layer ${li} doesn't have the expert parts folding needs.`);
    const H = Number(tg.dims[0]), I = Number(tg.dims[1]);
    const kept = [...keep[li]].sort((a, b) => a - b);
    const targets = foldTargets(floatsOf(read(tr, 0, tr.bytes), tr.type), E, H, kept);
    const hs = sampleIdx(H), S = hs.length * 2;
    // One unit-length row per neuron: a sample of what it reads (its gate row) and what it writes (its down column).
    const feat = (e) => {
      const gb = slab(tg, e), db = slab(td, e), out = new Float32Array(I * S);
      for (let i = 0; i < I; i++) {
        let n = 0; const o = i * S;
        for (let k = 0; k < hs.length; k++) { const a = floatAt(gb, tg.type, i * H + hs[k]), b = floatAt(db, td.type, hs[k] * I + i); out[o + k] = a; out[o + hs.length + k] = b; n += a * a + b * b; }
        n = Math.sqrt(n) || 1; for (let k = 0; k < S; k++) out[o + k] /= n;
      }
      return out;
    };
    const members = new Map(kept.map((t) => [t, [t]]));
    for (const [d, t] of targets) members.get(t).push(d);
    const groups = new Map();
    for (const [t, list] of members) {
      const w = foldWeights(list, counts?.[li]);
      const ft = list.length > 1 ? feat(t) : null;
      groups.set(t, list.map((e, i) => ({ e, w: w[i], perm: i && w[i] > 0 ? alignNeurons(ft, feat(e), I, S) : null })));
      if (!counted.has(li)) folded += list.length - 1;
    }
    counted.add(li);
    const plan = { kept, groups, H, I };
    plans.set(li, plan);
    for (const k of plans.keys()) if (k < li - 1) plans.delete(k); // a layer's parts sit together in the file; keep memory small
    return plan;
  };
  // One folded tensor: for each kept expert, the weighted sum of its group's slabs with the neurons lined up.
  const foldTensor = (t, li, part) => {
    const { kept, groups, H, I } = planFor(li);
    const per = t.bytes / E, out = Buffer.alloc(per * K), n = per / BYTES[t.type];
    kept.forEach((k, slot) => {
      const group = groups.get(k).filter((m) => m.w > 0);
      if (group.length === 1 && group[0].w === 1) { slab(t, k).copy(out, slot * per); return; } // untouched: byte for byte
      const acc = new Float32Array(n);
      for (const m of group) {
        const b = slab(t, m.e), p = m.perm;
        if (part === 'ffn_gate_inp.weight' || part === 'ffn_gate_inp.bias' || part === 'ffn_down_exps.bias') for (let i = 0; i < n; i++) acc[i] += m.w * floatAt(b, t.type, i);
        else if (part === 'ffn_gate_exps.bias' || part === 'ffn_up_exps.bias') for (let j = 0; j < I; j++) acc[j] += m.w * floatAt(b, t.type, p ? p[j] : j);
        else if (part === 'ffn_down_exps.weight') for (let h = 0; h < H; h++) for (let j = 0; j < I; j++) acc[h * I + j] += m.w * floatAt(b, t.type, h * I + (p ? p[j] : j));
        else for (let j = 0; j < I; j++) { const from = (p ? p[j] : j) * H, to = j * H; for (let h = 0; h < H; h++) acc[to + h] += m.w * floatAt(b, t.type, from + h); }
      }
      encodeFloats(acc, t.type).copy(out, slot * per);
    });
    return out;
  };
  try {
    const tensors = g.tensors.map((t) => {
      const p = isExpertTensor(t.name) ? partOf(t.name) : null;
      if (!p || !Array.isArray(keep[p.layer])) return { name: t.name, dims: t.dims, type: t.type, bytes: t.bytes, data: async () => read(t, 0, t.bytes) };
      if (Number(t.dims[t.dims.length - 1]) !== E) throw new Error(`${t.name} doesn't have one slab per expert.`);
      return { name: t.name, dims: [...t.dims.slice(0, -1), K], type: t.type, bytes: (t.bytes / E) * K, data: async () => { await new Promise((r) => setImmediate(r)); return foldTensor(t, p.layer, p.part); } };
    });
    const r = await writeGgufFrom(dst, { version: g.version, alignment: Number(g.meta['general.alignment']) || 32, kvs: kvsFrom(src, g, { set: { [`${f.arch}.expert_count`]: K } }), tensors }, { onProgress, signal });
    return { ...r, folded, kept: K };
  } finally { fs.closeSync(fd); }
}
