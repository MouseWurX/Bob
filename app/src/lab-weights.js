// FNRI weight map and difference map. Reads a brain file's own weights, no engine and no card: for every expert (or,
// in a brain without experts, every group of neurons the scan uses) how strong its weights are, and how much they
// differ from another brain's. The viewer colours the block by it, and the glow still shows what the brain used.
//
// A brain file keeps its weights packed (Q4_K and friends). Unpacking all of a 20 GB brain would take minutes, so a
// handful of evenly spaced rows of each expert's matrices is unpacked instead: the same rows in both brains, so a
// difference compares like with like. Strength = the root mean square of those numbers.
import fs from 'node:fs';
import { readGguf, f16ToF32 } from './lab-gguf.js';

export const WEIGHTS_FORMAT = 'bob-weight-map';
export const ROWS = 8;         // rows read from each matrix of each expert
export const GROUPS = 256;     // neuron groups per floor in a brain without experts (as Brain Engine's trace, patch 0002)

const h = (b, o) => f16ToF32(b.readUInt16LE(o));
const scaleMin = (j, q) => (j < 4 ? [q[j] & 63, q[j + 4] & 63] : [(q[j + 4] & 0xF) | ((q[j - 4] >> 6) << 4), (q[j + 4] >> 4) | ((q[j] >> 6) << 4)]);

// ggml block layouts: [values per block, bytes per block, unpack(buf, offset, out, at)]. These are the ones llama.cpp's
// Q2_K to Q8_0 files use; i-quants (IQ*) and others aren't read, and the map says so.
export const UNPACK = {
  0: [1, 4, (b, o, y, a) => { y[a] = b.readFloatLE(o); }],
  1: [1, 2, (b, o, y, a) => { y[a] = h(b, o); }],
  30: [1, 2, (b, o, y, a) => { const v = new DataView(new ArrayBuffer(4)); v.setUint32(0, b.readUInt16LE(o) << 16); y[a] = v.getFloat32(0); }],
  2: [32, 18, (b, o, y, a) => { const d = h(b, o); for (let j = 0; j < 16; j++) { const q = b[o + 2 + j]; y[a + j] = ((q & 0xF) - 8) * d; y[a + j + 16] = ((q >> 4) - 8) * d; } }], // Q4_0
  3: [32, 20, (b, o, y, a) => { const d = h(b, o), m = h(b, o + 2); for (let j = 0; j < 16; j++) { const q = b[o + 4 + j]; y[a + j] = (q & 0xF) * d + m; y[a + j + 16] = (q >> 4) * d + m; } }], // Q4_1
  6: [32, 22, (b, o, y, a) => { const d = h(b, o), qh = b.readUInt32LE(o + 2); for (let j = 0; j < 16; j++) { const q = b[o + 6 + j]; y[a + j] = (((q & 0xF) | (((qh >>> j) << 4) & 0x10)) - 16) * d; y[a + j + 16] = (((q >> 4) | ((qh >>> (j + 12)) & 0x10)) - 16) * d; } }], // Q5_0
  7: [32, 24, (b, o, y, a) => { const d = h(b, o), m = h(b, o + 2), qh = b.readUInt32LE(o + 4); for (let j = 0; j < 16; j++) { const q = b[o + 8 + j]; y[a + j] = ((q & 0xF) | (((qh >>> j) << 4) & 0x10)) * d + m; y[a + j + 16] = ((q >> 4) | ((qh >>> (j + 12)) & 0x10)) * d + m; } }], // Q5_1
  8: [32, 34, (b, o, y, a) => { const d = h(b, o); for (let j = 0; j < 32; j++) y[a + j] = b.readInt8(o + 2 + j) * d; }], // Q8_0
  10: [256, 84, (b, o, y, a) => { // Q2_K: scales[16], qs[64], d, dmin
    const d = h(b, o + 80), dmin = h(b, o + 82); let is = 0, q = o + 16;
    for (let n = 0; n < 256; n += 128) {
      for (let shift = 0; shift < 8; shift += 2) {
        let sc = b[o + is++], dl = d * (sc & 0xF), ml = dmin * (sc >> 4);
        for (let l = 0; l < 16; l++) y[a++] = dl * ((b[q + l] >> shift) & 3) - ml;
        sc = b[o + is++]; dl = d * (sc & 0xF); ml = dmin * (sc >> 4);
        for (let l = 0; l < 16; l++) y[a++] = dl * ((b[q + l + 16] >> shift) & 3) - ml;
      }
      q += 32;
    }
  }],
  11: [256, 110, (b, o, y, a) => { // Q3_K: hmask[32], qs[64], scales[12], d
    const d = h(b, o + 108), s = b.subarray(o + 96, o + 108), sc = new Int8Array(16);
    for (let k = 0; k < 16; k++) { const gq = k >> 2, i = k & 3; const lo = gq === 0 ? s[i] & 0xF : gq === 1 ? s[4 + i] & 0xF : gq === 2 ? s[i] >> 4 : s[4 + i] >> 4; sc[k] = (lo | (((s[8 + i] >> (2 * gq)) & 3) << 4)) - 32; }
    let is = 0, q = o + 32, m = 1;
    for (let n = 0; n < 256; n += 128) {
      for (let shift = 0; shift < 8; shift += 2) {
        let dl = d * sc[is++];
        for (let l = 0; l < 16; l++) y[a++] = dl * (((b[q + l] >> shift) & 3) - ((b[o + l] & m) ? 0 : 4));
        dl = d * sc[is++];
        for (let l = 0; l < 16; l++) y[a++] = dl * (((b[q + l + 16] >> shift) & 3) - ((b[o + l + 16] & m) ? 0 : 4));
        m <<= 1;
      }
      q += 32;
    }
  }],
  12: [256, 144, (b, o, y, a) => { // Q4_K: d, dmin, scales[12], qs[128]
    const d = h(b, o), dmin = h(b, o + 2), s = b.subarray(o + 4, o + 16); let q = o + 16, is = 0;
    for (let j = 0; j < 256; j += 64) {
      const [s1, m1] = scaleMin(is, s), [s2, m2] = scaleMin(is + 1, s);
      for (let l = 0; l < 32; l++) y[a + l] = d * s1 * (b[q + l] & 0xF) - dmin * m1;
      for (let l = 0; l < 32; l++) y[a + 32 + l] = d * s2 * (b[q + l] >> 4) - dmin * m2;
      a += 64; q += 32; is += 2;
    }
  }],
  13: [256, 176, (b, o, y, a) => { // Q5_K: d, dmin, scales[12], qh[32], qs[128]
    const d = h(b, o), dmin = h(b, o + 2), s = b.subarray(o + 4, o + 16), qh = o + 16; let q = o + 48, is = 0, u1 = 1, u2 = 2;
    for (let j = 0; j < 256; j += 64) {
      const [s1, m1] = scaleMin(is, s), [s2, m2] = scaleMin(is + 1, s);
      for (let l = 0; l < 32; l++) y[a + l] = d * s1 * ((b[q + l] & 0xF) + (b[qh + l] & u1 ? 16 : 0)) - dmin * m1;
      for (let l = 0; l < 32; l++) y[a + 32 + l] = d * s2 * ((b[q + l] >> 4) + (b[qh + l] & u2 ? 16 : 0)) - dmin * m2;
      a += 64; q += 32; is += 2; u1 <<= 2; u2 <<= 2;
    }
  }],
  14: [256, 210, (b, o, y, a) => { // Q6_K: ql[128], qh[64], scales[16] (signed), d
    const d = h(b, o + 208); let ql = o, qh = o + 128, sc = o + 192;
    for (let n = 0; n < 256; n += 128) {
      for (let l = 0; l < 32; l++) {
        const is = l >> 4, H = b[qh + l];
        y[a + l] = d * b.readInt8(sc + is) * (((b[ql + l] & 0xF) | ((H & 3) << 4)) - 32);
        y[a + l + 32] = d * b.readInt8(sc + is + 2) * (((b[ql + l + 32] & 0xF) | (((H >> 2) & 3) << 4)) - 32);
        y[a + l + 64] = d * b.readInt8(sc + is + 4) * (((b[ql + l] >> 4) | (((H >> 4) & 3) << 4)) - 32);
        y[a + l + 96] = d * b.readInt8(sc + is + 6) * (((b[ql + l + 32] >> 4) | (((H >> 6) & 3) << 4)) - 32);
      }
      a += 128; ql += 64; qh += 32; sc += 8;
    }
  }]
};
export const TYPE_NAMES = { 0: 'F32', 1: 'F16', 30: 'BF16', 2: 'Q4_0', 3: 'Q4_1', 6: 'Q5_0', 7: 'Q5_1', 8: 'Q8_0', 10: 'Q2_K', 11: 'Q3_K', 12: 'Q4_K', 13: 'Q5_K', 14: 'Q6_K' };

// One row's numbers from its bytes.
export function unpackRow(buf, type, n) {
  const u = UNPACK[type]; if (!u) throw new Error(`type ${type}`);
  const [per, bytes, fn] = u, out = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i += per, o += bytes) fn(buf, o, out, i);
  return out;
}

// The rows read from a matrix of `rows` rows: ROWS of them, evenly spread, the same in every brain of that shape.
export const sampleRows = (from, count, n = ROWS) => { const k = Math.min(n, count); return Array.from({ length: k }, (_, i) => from + Math.floor(((i + 0.5) * count) / k)); };

// The matrices that make up one voxel of the map, per floor. For experts: ffn_gate/up/down_exps (one slab per expert,
// the expert number last). For a brain without experts: ffn_gate/up rows are its neurons, cut into GROUPS runs like
// the trace (ffn_down is laid the other way, so it's left out).
function partsFor(g) {
  const by = new Map(g.tensors.map((t) => [t.name, t]));
  const floors = new Map();
  for (const t of g.tensors) {
    const m = /^blk\.(\d+)\.(ffn_(gate|up|down)_exps|ffn_(gate|up))\.weight$/.exec(t.name);
    if (!m) continue;
    const L = Number(m[1]);
    if (!floors.has(L)) floors.set(L, { experts: [], dense: [] });
    (m[2].endsWith('_exps') ? floors.get(L).experts : floors.get(L).dense).push(t);
  }
  return { by, floors };
}

// Plan what to read for each voxel: [{ t, rows: [row numbers in the tensor's flat row list] }] per (floor, voxel).
export function planOf(g, { layers, experts, kind }) {
  const { floors } = partsFor(g);
  const plan = Array.from({ length: layers }, () => Array.from({ length: experts }, () => []));
  for (const [L, f] of floors) {
    if (L >= layers) continue;
    if (kind === 'experts') {
      for (const t of f.experts) {
        const [, rowsPer, nExp] = t.dims.map(Number);
        if (nExp !== experts) continue;
        for (let e = 0; e < experts; e++) plan[L][e].push({ t, rows: sampleRows(e * rowsPer, rowsPer) });
      }
    } else {
      for (const t of f.dense) {
        const n = Number(t.dims[1]);
        for (let e = 0; e < experts; e++) { const b = Math.floor((e * n) / experts), en = Math.floor(((e + 1) * n) / experts); if (en > b) plan[L][e].push({ t, rows: sampleRows(b, en - b) }); }
      }
    }
  }
  return plan;
}

const rowBytes = (t) => { const u = UNPACK[t.type]; return u ? (Number(t.dims[0]) / u[0]) * u[1] : 0; };
function readRow(fd, g, t, r, buf) {
  const n = rowBytes(t);
  if (buf.length < n) buf = Buffer.alloc(n);
  const got = fs.readSync(fd, buf, 0, n, g.dataStart + t.offset + r * n);
  if (got !== n) throw new Error(`${t.name} ends early in the file.`);
  return [unpackRow(buf, t.type, Number(t.dims[0])), buf];
}

const unread = (g, plan) => { const bad = new Set(); for (const fl of plan) for (const v of fl) for (const p of v) if (!UNPACK[p.t.type] || Number(p.t.dims[0]) % UNPACK[p.t.type][0]) bad.add(p.t.type); return [...bad]; };
const tick = () => new Promise((r) => setImmediate(r));

// How strong each voxel's weights are. `file` a GGUF; shape as the scan's. Yields between floors so Bob keeps answering.
// { format, kind: 'weights', layers: [[rms per voxel]], read: rows read }
export async function weightMap(file, shape, { say = () => {}, signal } = {}) {
  const g = readGguf(file), plan = planOf(g, shape);
  const bad = unread(g, plan);
  if (bad.length) throw new Error(`This brain's file keeps some weights in a way the map can't read yet (${bad.map((t) => TYPE_NAMES[t] || `type ${t}`).join(', ')}). Q2_K to Q8_0, F16 and BF16 files work.`);
  if (!plan.some((fl) => fl.some((v) => v.length))) throw new Error('Bob couldn\'t find the expert or neuron weights in this brain\'s file.');
  const fd = fs.openSync(file, 'r');
  try {
    let buf = Buffer.alloc(1 << 16), read = 0;
    const out = [];
    for (let L = 0; L < plan.length; L++) {
      if (signal?.aborted) throw new Error('Stopped.');
      out.push(plan[L].map((parts) => {
        let s = 0, n = 0;
        for (const { t, rows } of parts) for (const r of rows) { let y; [y, buf] = readRow(fd, g, t, r, buf); for (let i = 0; i < y.length; i++) s += y[i] * y[i]; n += y.length; read++; }
        return n ? Math.sqrt(s / n) : 0;
      }));
      say(`floor ${L + 1} of ${plan.length}`);
      await tick();
    }
    return { format: WEIGHTS_FORMAT, kind: 'weights', layers: out, read };
  } finally { fs.closeSync(fd); }
}

// How much each voxel of `file` differs from `base`, as a share of the base's own strength (0 = the same). `keep` lines a
// cut brain up with the brain it was cut from: keep[L][e] = the base's expert number for this brain's expert e.
// { format, kind: 'change', layers: [[relative change]], read }
export async function changeMap(file, base, shape, { keep = null, say = () => {}, signal } = {}) {
  const ga = readGguf(file), gb = readGguf(base);
  const pa = planOf(ga, shape);
  const bShape = keep ? { ...shape, experts: keep.experts } : shape;
  const pb = planOf(gb, bShape);
  const bad = [...new Set([...unread(ga, pa), ...unread(gb, pb)])];
  if (bad.length) throw new Error(`One of these files keeps some weights in a way the map can't read yet (${bad.map((t) => TYPE_NAMES[t] || `type ${t}`).join(', ')}). Q2_K to Q8_0, F16 and BF16 files work.`);
  const fa = fs.openSync(file, 'r'), fb = fs.openSync(base, 'r');
  try {
    let ba = Buffer.alloc(1 << 16), bb = Buffer.alloc(1 << 16), read = 0, matched = 0;
    const out = [];
    for (let L = 0; L < pa.length; L++) {
      if (signal?.aborted) throw new Error('Stopped.');
      out.push(pa[L].map((parts, e) => {
        const be = keep ? keep.layers[L]?.[e] : e;
        const other = pb[L]?.[be];
        if (!other) return null;
        let dd = 0, ss = 0;
        for (const p of parts) {
          const q = other.find((x) => x.t.name === p.t.name);
          if (!q || Number(q.t.dims[0]) !== Number(p.t.dims[0]) || q.rows.length !== p.rows.length) continue;
          for (let i = 0; i < p.rows.length; i++) {
            let ya, yb; [ya, ba] = readRow(fa, ga, p.t, p.rows[i], ba); [yb, bb] = readRow(fb, gb, q.t, q.rows[i], bb);
            for (let j = 0; j < ya.length; j++) { const x = ya[j] - yb[j]; dd += x * x; ss += yb[j] * yb[j]; }
            read += 2;
          }
        }
        if (!ss) return null;
        matched++;
        return Math.sqrt(dd / ss);
      }));
      say(`floor ${L + 1} of ${pa.length}`);
      await tick();
    }
    if (!matched) throw new Error('These two brains aren\'t built alike, so there\'s nothing to compare. Pick the brain this one was made from.');
    return { format: WEIGHTS_FORMAT, kind: 'change', layers: out, read };
  } finally { fs.closeSync(fa); fs.closeSync(fb); }
}

// The map as 0..1 for colouring: per floor for strength (floors differ a lot in scale), across the whole brain for
// change (so the floors that changed most stand out). The top and bottom 2% are clipped so one odd voxel can't wash
// the rest out.
export function shade(map) {
  const per = map.kind === 'weights';
  const clip = (vals) => { const v = vals.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return [0, 1]; const lo = v[Math.floor(v.length * 0.02)], hi = v[Math.min(v.length - 1, Math.floor(v.length * 0.98))]; return [lo, hi > lo ? hi : lo + 1e-9]; };
  const all = per ? null : clip(map.layers.flat());
  return map.layers.map((fl) => { const [lo, hi] = per ? clip(fl) : all; return fl.map((x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, (x - lo) / (hi - lo))) : null)); });
}
