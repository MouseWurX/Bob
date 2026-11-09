// 1.5.164 Computer Science Lab, the Forge's home ways (bob-design/cs-lab-forge-and-methods.md section 4):
//   Mix two brains: one brain from two fine-tunes of the same parent. An even mix (weighted average, with a lean),
//     a smooth blend (SLERP, which keeps each weight's size better than a straight average) or keep what each changed
//     (TIES: only the changes both agree on, against the shared parent; small and conflicting ones are dropped).
//   Stack layers: a taller brain from layer ranges of one or two matching brains, written end to end and renumbered.
// Both work on full-size files (F32, F16 or BF16) with the Lab's own GGUF reader and writer, one tensor at a time, on
// the processor; no card is needed. Weights stored any other way are copied from the first brain unchanged.
import fs from 'node:fs';
import { readGguf, brainFacts, FLOAT_TYPES, readTensorBytes, readTensorFloats, encodeFloats, writeGgufFrom, kvsFrom, GGUF_TYPES } from './lab-gguf.js';

export const MIX_WAYS = [
  { id: 'even', label: 'An even mix', hint: 'The plain average of every weight, with a lean towards one side if you want it.' },
  { id: 'slerp', label: 'A smooth blend', hint: 'Follows the arc between the two instead of the straight line, so each weight keeps its size. The usual pick.' },
  { id: 'ties', label: 'Keep what each changed', hint: 'Needs the parent both came from. Keeps only the changes the two agree on, and drops the small and the conflicting ones.' }
];
export const MIX_IDS = MIX_WAYS.map((w) => w.id);

const dimsEq = (a, b) => a.length === b.length && a.every((d, i) => Number(d) === Number(b[i]));

// Can these two files be mixed, or stacked from? '' when they can, else the reason in words.
export function canMix(gA, gB, { nameA = 'the first brain', nameB = 'the second brain' } = {}) {
  const a = brainFacts(gA), b = brainFacts(gB);
  if (a.arch !== b.arch) return `${nameA} is a ${a.arch || 'different'} brain and ${nameB} is ${b.arch || 'another kind'}. Only brains of the same kind mix.`;
  if (a.layers !== b.layers) return `${nameA} has ${a.layers} layers and ${nameB} has ${b.layers}. Only relatives, from the same parent, mix.`;
  if (!a.fullSize || !b.fullSize) return `Both brains must be full size (F16 or BF16). ${!a.fullSize ? nameA : nameB} is ${!a.fullSize ? a.fileType : b.fileType}.`;
  const byName = new Map(gB.tensors.map((t) => [t.name, t]));
  if (gA.tensors.length !== gB.tensors.length) return `${nameA} has ${gA.tensors.length} weight tables and ${nameB} has ${gB.tensors.length}. They aren't the same shape of brain.`;
  for (const t of gA.tensors) {
    const o = byName.get(t.name);
    if (!o) return `${nameB} has no ${t.name}, so the two aren't the same shape of brain.`;
    if (!dimsEq(t.dims, o.dims)) return `${t.name} is ${t.dims.join('x')} in ${nameA} and ${o.dims.join('x')} in ${nameB}. The two aren't the same shape of brain (different vocabularies, maybe).`;
  }
  return '';
}

// The share of the second brain from a lean of -100 (all first) to 100 (all second).
export const shareOf = (lean) => Math.min(1, Math.max(0, 0.5 + (Number(lean) || 0) / 200));

// A quantile of |x| from a sample, for TIES trimming (exact sort of 9 GB of numbers would take all night).
function magnitudeAt(arr, keep) {
  const n = arr.length, step = Math.max(1, Math.floor(n / 200000));
  const s = [];
  for (let i = 0; i < n; i += step) s.push(Math.abs(arr[i]));
  s.sort((x, y) => x - y);
  const k = Math.min(s.length - 1, Math.max(0, Math.floor(s.length * (1 - keep))));
  return s[k];
}

// One tensor mixed. a, b (and p for ties) are Float32Array of the same length; w = share of b.
export function mixFloats(how, a, b, w, { p = null, density = 0.2 } = {}) {
  const n = a.length, out = new Float32Array(n);
  if (how === 'even') { for (let i = 0; i < n; i++) out[i] = (1 - w) * a[i] + w * b[i]; return out; }
  if (how === 'slerp') {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    na = Math.sqrt(na); nb = Math.sqrt(nb);
    const cos = na && nb ? Math.max(-1, Math.min(1, dot / (na * nb))) : 1;
    if (Math.abs(cos) > 0.9995 || !na || !nb) { for (let i = 0; i < n; i++) out[i] = (1 - w) * a[i] + w * b[i]; return out; }
    const th = Math.acos(cos), s = Math.sin(th), fa = Math.sin((1 - w) * th) / s, fb = Math.sin(w * th) / s;
    for (let i = 0; i < n; i++) out[i] = fa * a[i] + fb * b[i];
    return out;
  }
  if (how === 'ties') {
    if (!p) throw new Error('Keep what each changed needs the parent brain.');
    const da = new Float32Array(n), db = new Float32Array(n);
    for (let i = 0; i < n; i++) { da[i] = a[i] - p[i]; db[i] = b[i] - p[i]; }
    const ta = magnitudeAt(da, density), tb = magnitudeAt(db, density);
    for (let i = 0; i < n; i++) {
      const x = Math.abs(da[i]) >= ta && ta > 0 ? da[i] : 0, y = Math.abs(db[i]) >= tb && tb > 0 ? db[i] : 0;
      const sign = Math.sign((1 - w) * x + w * y); // the elected direction, each side weighed by its share
      let sum = 0, cnt = 0;
      if (x && Math.sign(x) === sign) { sum += (1 - w) * x; cnt += 1 - w; }
      if (y && Math.sign(y) === sign) { sum += w * y; cnt += w; }
      out[i] = p[i] + (cnt ? sum / cnt : 0);
    }
    return out;
  }
  throw new Error(`There's no mixing method called ${how}.`);
}

// Plan a mix: the checks and the sizes, before anything is written.
export function planMix({ a, b, parent = '', how = 'slerp', lean = 0, name = '' }) {
  const problems = [], notes = [];
  if (!MIX_IDS.includes(how)) problems.push('Pick how to mix.');
  if (how === 'ties' && !parent) problems.push('Keep what each changed needs the parent brain both came from. Pick it, or choose another way to mix.');
  let gA = null, gB = null, gP = null;
  try { gA = readGguf(a); } catch (e) { problems.push(`The first brain: ${e.message}`); }
  try { gB = readGguf(b); } catch (e) { problems.push(`The second brain: ${e.message}`); }
  if (how === 'ties' && parent) { try { gP = readGguf(parent); } catch (e) { problems.push(`The parent brain: ${e.message}`); } }
  if (gA && gB) { const why = canMix(gA, gB); if (why) problems.push(why); }
  if (gA && gP) { const why = canMix(gA, gP, { nameB: 'the parent' }); if (why) problems.push(why); }
  const bytes = gA ? gA.size : 0;
  if (gA && how === 'even' && Math.abs(Number(lean) || 0) >= 100) notes.push('A lean all the way to one side is that brain, unchanged.');
  return { problems, notes, bytes, sizeGB: Math.round((bytes / 1e9) * 10) / 10, facts: gA ? brainFacts(gA) : null };
}

// Write the mix. Every full-size weight table is mixed; anything else (counts, integer tables) comes from the first.
export async function mixGguf({ a, b, parent = '', how, lean = 0, name, out }, { onProgress = () => {}, signal } = {}) {
  const gA = readGguf(a), gB = readGguf(b), gP = how === 'ties' ? readGguf(parent) : null;
  let why = canMix(gA, gB); if (why) throw new Error(why);
  if (gP) { why = canMix(gA, gP, { nameB: 'the parent' }); if (why) throw new Error(why); }
  const w = shareOf(lean);
  const fa = fs.openSync(a, 'r'), fb = fs.openSync(b, 'r'), fp = gP ? fs.openSync(parent, 'r') : null;
  try {
    const byB = new Map(gB.tensors.map((t) => [t.name, t])), byP = gP ? new Map(gP.tensors.map((t) => [t.name, t])) : null;
    const kvs = kvsFrom(a, gA, { set: gA.meta['general.name'] !== undefined ? { 'general.name': name } : {} });
    const tensors = gA.tensors.map((t) => ({
      name: t.name, dims: t.dims, type: t.type, bytes: t.bytes,
      data: async () => {
        if (signal?.aborted) throw new Error('Stopped.');
        const o = byB.get(t.name);
        if (!FLOAT_TYPES.has(t.type) || !FLOAT_TYPES.has(o.type)) return readTensorBytes(fa, gA, t);
        const x = readTensorFloats(fa, gA, t), y = readTensorFloats(fb, gB, o);
        const p = gP ? readTensorFloats(fp, gP, byP.get(t.name)) : null;
        await new Promise((r) => setImmediate(r)); // let Bob answer between tensors
        return encodeFloats(mixFloats(how, x, y, w, { p }), t.type);
      }
    }));
    return await writeGgufFrom(out, { version: gA.version, alignment: gA.alignment, kvs, tensors }, { onProgress, signal });
  } finally { fs.closeSync(fa); fs.closeSync(fb); if (fp !== null) fs.closeSync(fp); }
}

// ---- Stack layers ----
const blockOf = (name) => { const m = name.match(/^blk\.(\d+)\./); return m ? Number(m[1]) : -1; };

// Check and expand the ranges: [{ brain: 'a'|'b', start, end }] (inclusive, 0-based) -> the list of [brain, layer].
export function stackLayers(ranges, layersA, layersB = 0) {
  const out = [];
  for (const r of ranges || []) {
    const from = r.brain === 'b' ? 'b' : 'a', top = from === 'b' ? layersB : layersA;
    const s = Math.floor(Number(r.start)), e = Math.floor(Number(r.end));
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e < s || e >= top) throw new Error(`Layers ${r.start} to ${r.end} of ${from === 'b' ? 'the second brain' : 'the first brain'} aren't a range it has (it has layers 0 to ${top - 1}).`);
    for (let i = s; i <= e; i++) out.push([from, i]);
  }
  if (!out.length) throw new Error('Pick at least one range of layers.');
  if (out.length > 200) throw new Error('That would be more than 200 layers. Stack fewer.');
  return out;
}

export function planStack({ a, b = '', ranges = [], name = '' }) {
  const problems = [], notes = [];
  let gA = null, gB = null;
  try { gA = readGguf(a); } catch (e) { problems.push(`The first brain: ${e.message}`); }
  if (b) { try { gB = readGguf(b); } catch (e) { problems.push(`The second brain: ${e.message}`); } }
  if (gA && gB) { const why = canMix(gA, gB); if (why) problems.push(why); }
  const fA = gA ? brainFacts(gA) : null, fB = gB ? brainFacts(gB) : null;
  let layers = [];
  if (gA) { try { layers = stackLayers(ranges, fA.layers, fB ? fB.layers : 0); } catch (e) { problems.push(e.message); } }
  if (gA && !fA.fullSize) problems.push(`The first brain is ${fA.fileType}. Stacking starts from full-size files (F16 or BF16).`);
  if (gA && layers.some(([from]) => from === 'b') && !gB) problems.push('A range is from the second brain, but none is picked.');
  if (gA) for (const kv of gA.kvs) if (kv.type === GGUF_TYPES.ARRAY && kv.value?.array === fA.layers && !kv.key.startsWith('tokenizer.')) problems.push(`This brain keeps one setting per layer (${kv.key}), and the Lab can't renumber those yet.`);
  let bytes = 0;
  if (gA && !problems.length) {
    const per = (g, li) => g.tensors.filter((t) => blockOf(t.name) === li).reduce((s, t) => s + t.bytes, 0);
    bytes = gA.tensors.filter((t) => blockOf(t.name) < 0).reduce((s, t) => s + t.bytes, 0) + layers.reduce((s, [from, li]) => s + per(from === 'b' ? gB : gA, li), 0);
    if (layers.length !== fA.layers) notes.push(`${layers.length} layers, from ${fA.layers}: ${layers.length > fA.layers ? 'taller, slower and bigger' : 'shorter and smaller'}.`);
    notes.push('Stacked brains nearly always ramble until they\'re taught back. This is for seeing what happens, not for using.');
  }
  return { problems, notes, layers: layers.length, bytes, sizeGB: Math.round((bytes / 1e9) * 10) / 10 };
}

export async function stackGguf({ a, b = '', ranges, name, out }, { onProgress = () => {}, signal } = {}) {
  const gA = readGguf(a), gB = b ? readGguf(b) : null;
  const fA = brainFacts(gA), fB = gB ? brainFacts(gB) : null;
  if (gB) { const why = canMix(gA, gB); if (why) throw new Error(why); }
  const layers = stackLayers(ranges, fA.layers, fB ? fB.layers : 0);
  if (layers.some(([from]) => from === 'b') && !gB) throw new Error('A range is from the second brain, but none is picked.');
  const fa = fs.openSync(a, 'r'), fb = gB ? fs.openSync(b, 'r') : null;
  try {
    const kvs = kvsFrom(a, gA, { set: { [`${fA.arch}.block_count`]: layers.length, ...(gA.meta['general.name'] !== undefined ? { 'general.name': name } : {}) } });
    const tensors = gA.tensors.filter((t) => blockOf(t.name) < 0).map((t) => ({ name: t.name, dims: t.dims, type: t.type, bytes: t.bytes, data: async () => readTensorBytes(fa, gA, t) }));
    const first = gA.tensors.filter((t) => blockOf(t.name) === 0);
    layers.forEach(([from, li], i) => {
      const g = from === 'b' ? gB : gA, fd = from === 'b' ? fb : fa;
      const block = g.tensors.filter((t) => blockOf(t.name) === li);
      if (block.length !== first.length) throw new Error(`Layer ${li} of ${from === 'b' ? 'the second brain' : 'the first brain'} has ${block.length} weight tables and layer 0 has ${first.length}; the layers don't match, so they can't be renumbered.`);
      for (const t of block) {
        const twin = first.find((x) => x.name.replace(/^blk\.\d+\./, '') === t.name.replace(/^blk\.\d+\./, ''));
        if (!twin || !dimsEq(twin.dims, t.dims)) throw new Error(`${t.name} doesn't have the same shape as layer 0's, so it can't take its place in the stack.`);
        tensors.push({ name: t.name.replace(/^blk\.\d+\./, `blk.${i}.`), dims: t.dims, type: t.type, bytes: t.bytes, data: async () => { if (signal?.aborted) throw new Error('Stopped.'); return readTensorBytes(fd, g, t); } });
      }
    });
    // Tensors after the blocks (output norm, output) keep their place at the end, as the reader expects.
    return await writeGgufFrom(out, { version: gA.version, alignment: gA.alignment, kvs, tensors }, { onProgress, signal });
  } finally { fs.closeSync(fa); if (fb !== null) fs.closeSync(fb); }
}
