// 1.5.141 Computer Science Lab: read a GGUF file's header, and write a new one with fewer experts per layer, some
// tensors left out (a picture or sound reader taken out of a combined reader file) or a few settings changed.
// Reads and writes in pieces, so a 20 GB brain never has to fit in memory.
import fs from 'node:fs';

const T = { U8: 0, I8: 1, U16: 2, I16: 3, U32: 4, I32: 5, F32: 6, BOOL: 7, STRING: 8, ARRAY: 9, U64: 10, I64: 11, F64: 12 };
const FIXED = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
export const GGUF_TYPES = T;

// ggml tensor types: [values per block, bytes per block]. Unknown types can still be copied, never cut.
const BLOCK = {
  0: [1, 4], 1: [1, 2], 2: [32, 18], 3: [32, 20], 6: [32, 22], 7: [32, 24], 8: [32, 34], 9: [32, 36],
  10: [256, 84], 11: [256, 110], 12: [256, 144], 13: [256, 176], 14: [256, 210], 15: [256, 292],
  16: [256, 66], 17: [256, 74], 18: [256, 98], 19: [256, 50], 20: [32, 18], 21: [256, 110], 22: [256, 82],
  23: [256, 136], 24: [1, 1], 25: [1, 2], 26: [1, 4], 27: [1, 8], 28: [1, 8], 29: [256, 56], 30: [1, 2],
  34: [256, 54], 35: [256, 66], 39: [32, 17]
};
// general.file_type: what the weights are stored as. Only the full-size kinds are worth making running files from.
export const FILE_TYPES = { 0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 7: 'Q8_0', 8: 'Q5_0', 9: 'Q5_1', 10: 'Q2_K', 11: 'Q3_K_S', 12: 'Q3_K_M', 13: 'Q3_K_L', 14: 'Q4_K_S', 15: 'Q4_K_M', 16: 'Q5_K_S', 17: 'Q5_K_M', 18: 'Q6_K', 32: 'BF16' };
export const FULL_SIZE = new Set([0, 1, 32]);

export function tensorBytes(t) {
  const b = BLOCK[t.type];
  if (!b) return null;
  const [per, bytes] = b;
  if (t.dims[0] % per) return null;
  return t.dims.slice(1).reduce((a, n) => a * n, (t.dims[0] / per) * bytes);
}

class Reader {
  constructor(fd) { this.fd = fd; this.pos = 0; this.buf = Buffer.alloc(0); this.start = 0; }
  need(n) {
    if (this.pos >= this.start && this.pos + n <= this.start + this.buf.length) return;
    const b = Buffer.alloc(Math.max(n, 1 << 20));
    const got = fs.readSync(this.fd, b, 0, b.length, this.pos);
    if (got < n) throw new Error('This file ends too soon to be a GGUF brain.');
    this.buf = b.subarray(0, got); this.start = this.pos;
  }
  at() { return this.pos - this.start; }
  u32() { this.need(4); const v = this.buf.readUInt32LE(this.at()); this.pos += 4; return v; }
  u64() { this.need(8); const v = Number(this.buf.readBigUInt64LE(this.at())); this.pos += 8; return v; }
  str() { const n = this.u64(); if (n > 1 << 24) throw new Error('A name in this file is too long; it may not be a GGUF brain.'); this.need(n); const s = this.buf.toString('utf8', this.at(), this.at() + n); this.pos += n; return s; }
  scalar(t) {
    const s = FIXED[t]; if (!s) throw new Error(`Unknown GGUF value type ${t}.`);
    this.need(s); const b = this.buf, o = this.at(); this.pos += s;
    switch (t) {
      case 0: return b.readUInt8(o); case 1: return b.readInt8(o); case 2: return b.readUInt16LE(o); case 3: return b.readInt16LE(o);
      case 4: return b.readUInt32LE(o); case 5: return b.readInt32LE(o); case 6: return b.readFloatLE(o); case 7: return b.readUInt8(o) !== 0;
      case 10: return Number(b.readBigUInt64LE(o)); case 11: return Number(b.readBigInt64LE(o)); default: return b.readDoubleLE(o);
    }
  }
  val(t) {
    if (t === T.STRING) return this.str();
    if (t === T.ARRAY) {
      const it = this.u32(), n = this.u64();
      if (FIXED[it]) { this.pos += FIXED[it] * n; return { array: n }; }
      for (let i = 0; i < n; i++) this.val(it);
      return { array: n };
    }
    return this.scalar(t);
  }
}

// { version, kvs: [{ key, type, value, start, end }], meta: { key: value }, tensors: [{ name, dims, type, offset, bytes }], dataStart, alignment, size }
export function readGguf(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const r = new Reader(fd);
    r.need(4);
    if (r.buf.toString('latin1', 0, 4) !== 'GGUF') throw new Error(`${file} isn't a GGUF brain file.`);
    r.pos = 4;
    const version = r.u32();
    if (version < 2) throw new Error('This GGUF file is too old (version 1). Get a newer copy of the brain.');
    const nT = r.u64(), nKv = r.u64();
    const kvs = [], meta = {};
    for (let i = 0; i < nKv; i++) {
      const start = r.pos, key = r.str(), type = r.u32(), value = r.val(type);
      kvs.push({ key, type, value, start, end: r.pos }); meta[key] = value;
    }
    const tensors = [];
    for (let i = 0; i < nT; i++) {
      const name = r.str(), nd = r.u32(), dims = [];
      for (let d = 0; d < nd; d++) dims.push(r.u64());
      const type = r.u32(), offset = r.u64();
      tensors.push({ name, dims, type, offset });
    }
    const alignment = Number(meta['general.alignment']) || 32;
    const dataStart = Math.ceil(r.pos / alignment) * alignment;
    const byOffset = [...tensors].sort((a, b) => a.offset - b.offset);
    byOffset.forEach((t, i) => { const next = byOffset[i + 1] ? byOffset[i + 1].offset : size - dataStart; t.room = next - t.offset; t.bytes = tensorBytes(t) ?? t.room; });
    return { version, kvs, meta, tensors, dataStart, alignment, size, headerEnd: r.pos };
  } finally { fs.closeSync(fd); }
}

// What a brain file is, in the words the Lab shows.
export function brainFacts(g) {
  const arch = g.meta['general.architecture'] || '';
  const experts = Number(g.meta[`${arch}.expert_count`]) || 0;
  const used = Number(g.meta[`${arch}.expert_used_count`]) || 0;
  const groups = Number(g.meta[`${arch}.expert_group_count`]) || 0;
  const layers = Number(g.meta[`${arch}.block_count`]) || 0;
  const ft = g.meta['general.file_type'];
  const expertLayers = [...new Set(g.tensors.map((t) => isExpertTensor(t.name) && Number(t.name.split('.')[1])).filter((n) => Number.isInteger(n)))].sort((a, b) => a - b);
  // 1.5.161 how many weights it has, in billions, and for a mixture of experts how many work on each word
  let all = 0, exp = 0;
  for (const t of g.tensors) { const n = t.dims.reduce((a, d) => a * Number(d), 1); all += n; if (isExpertTensor(t.name)) exp += n; }
  const paramsB = Math.round((all / 1e9) * 10) / 10, activeB = experts && used ? Math.round(((all - exp + (exp * used) / experts) / 1e9) * 10) / 10 : paramsB;
  return { arch, name: g.meta['general.name'] || '', experts, used, groups, layers, expertLayers, fileType: FILE_TYPES[ft] || (ft == null ? '' : `type ${ft}`), fullSize: FULL_SIZE.has(ft), size: g.size, params: all, paramsB, activeB };
}

// The picture and sound readers (mmproj files): which senses one file holds.
export function readerFacts(g) {
  const m = g.meta;
  const v = m['clip.has_vision_encoder'], a = m['clip.has_audio_encoder'];
  const names = g.tensors.map((t) => t.name);
  return {
    sight: v === true || (v === undefined && names.some((n) => n.startsWith('v.'))),
    hearing: a === true || (a === undefined && names.some((n) => n.startsWith('a.'))),
    size: g.size
  };
}

// Tensors that hold one slab per expert, with the expert number as the last dimension.
const EXPERT_RE = /^blk\.\d+\.(ffn_(gate|up|down|gate_up)_exps\.(weight|bias|scale)|ffn_gate_inp\.weight|exp_probs_b\.bias)$/;
export const isExpertTensor = (name) => EXPERT_RE.test(name);
// Sound-reader tensors in a combined reader file (llama.cpp's mmproj): a.* and the sound projector mm.a.*. Everything
// else that isn't shared belongs to sight.
export const isHearingTensor = (n) => n.startsWith('a.') || n.startsWith('mm.a.');
export const isSightTensor = (n) => n.startsWith('v.') || (n.startsWith('mm.') && !n.startsWith('mm.a.'));

function encodeKv(key, type, value) {
  const k = Buffer.from(key, 'utf8');
  const head = Buffer.alloc(8 + k.length + 4); head.writeBigUInt64LE(BigInt(k.length), 0); k.copy(head, 8); head.writeUInt32LE(type, 8 + k.length);
  let v;
  if (type === T.STRING) { const s = Buffer.from(String(value), 'utf8'); v = Buffer.alloc(8 + s.length); v.writeBigUInt64LE(BigInt(s.length), 0); s.copy(v, 8); }
  else {
    v = Buffer.alloc(FIXED[type]);
    switch (type) {
      case 0: v.writeUInt8(value); break; case 1: v.writeInt8(value); break; case 2: v.writeUInt16LE(value); break; case 3: v.writeInt16LE(value); break;
      case 4: v.writeUInt32LE(value); break; case 5: v.writeInt32LE(value); break; case 6: v.writeFloatLE(value); break; case 7: v.writeUInt8(value ? 1 : 0); break;
      case 10: v.writeBigUInt64LE(BigInt(value)); break; case 11: v.writeBigInt64LE(BigInt(value)); break; case 12: v.writeDoubleLE(value); break;
      default: throw new Error(`Can't change a value of type ${type}.`);
    }
  }
  return Buffer.concat([head, v]);
}

// Check a keep list against the file before anything is written: one list per layer that has experts, all the same
// length (GGUF holds one expert count for the whole brain), no repeats, every number a real expert.
export function checkKeep(g, keep) {
  const f = brainFacts(g);
  if (!f.experts) return 'This brain has no experts to cut (it isn\'t a mixture-of-experts brain).';
  if (f.groups > 1) return 'This brain groups its experts, and cutting them would break the groups. The Lab can\'t cut it yet.';
  const n = keep?.[f.expertLayers[0]]?.length;
  if (!n) return 'The keep list is empty.';
  if (n < f.used) return `The keep list keeps ${n} experts, but this brain picks ${f.used} for every word, so it needs at least ${f.used}.`;
  if (n >= f.experts) return `The keep list keeps all ${f.experts} experts, so there's nothing to cut.`;
  for (const li of f.expertLayers) {
    const row = keep[li];
    if (!Array.isArray(row) || row.length !== n) return `The keep list has no list of ${n} for layer ${li}.`;
    if (new Set(row).size !== row.length || row.some((x) => !Number.isInteger(x) || x < 0 || x >= f.experts)) return `The keep list for layer ${li} has a repeat or a number that isn't an expert.`;
  }
  for (const t of g.tensors) if (isExpertTensor(t.name) && tensorBytes(t) == null) return `${t.name} is stored in a way the Lab can't cut (type ${t.type}).`;
  return '';
}

// Write dst from src: keep({name}) false leaves a tensor out; keep[layer] = expert numbers cuts the expert tensors;
// set = { key: value } changes scalar settings (same type as before). onProgress(fraction) as the data is copied.
// The data is copied with async reads and writes, so Bob keeps answering (and Stop works) during a 20 GB cut.
export async function writeGguf(src, dst, { keep = null, drop = () => false, set = {}, onProgress = () => {}, signal } = {}) {
  const g = readGguf(src);
  const f = brainFacts(g);
  if (keep) { const why = checkKeep(g, keep); if (why) throw new Error(why); }
  const n = keep ? keep[f.expertLayers[0]].length : 0;
  if (keep) set = { ...set, [`${f.arch}.expert_count`]: n };
  const sfd = fs.openSync(src, 'r');
  const part = dst + '.part';
  let dfd = fs.openSync(part, 'w');
  let src2 = null, dst2 = null;
  try {
    const tensors = g.tensors.filter((t) => !drop(t)).map((t) => {
      const li = Number(t.name.split('.')[1]);
      const cut = keep && isExpertTensor(t.name) && Array.isArray(keep[li]);
      if (cut && t.dims[t.dims.length - 1] !== f.experts) throw new Error(`${t.name} doesn't have one slab per expert.`);
      const slab = cut ? t.bytes / f.experts : 0;
      return { ...t, cut, slab, rows: cut ? [...keep[li]].sort((a, b) => a - b) : null, dims: cut ? [...t.dims.slice(0, -1), n] : t.dims, outBytes: cut ? slab * n : t.bytes };
    });
    // Header: settings copied byte for byte, except the ones being changed.
    const parts = [];
    const head = Buffer.alloc(24); head.write('GGUF', 0, 'latin1'); head.writeUInt32LE(g.version, 4); head.writeBigUInt64LE(BigInt(tensors.length), 8); head.writeBigUInt64LE(BigInt(g.kvs.length), 16);
    parts.push(head);
    const seen = new Set();
    for (const kv of g.kvs) {
      if (kv.key in set) {
        if (kv.type === T.ARRAY) throw new Error(`Can't change ${kv.key}.`);
        parts.push(encodeKv(kv.key, kv.type, set[kv.key])); seen.add(kv.key);
      } else { const b = Buffer.alloc(kv.end - kv.start); fs.readSync(sfd, b, 0, b.length, kv.start); parts.push(b); }
    }
    for (const k of Object.keys(set)) if (!seen.has(k)) throw new Error(`This file has no setting called ${k}.`);
    let off = 0;
    const align = (x) => Math.ceil(x / g.alignment) * g.alignment;
    for (const t of tensors) {
      const name = Buffer.from(t.name, 'utf8');
      const b = Buffer.alloc(8 + name.length + 4 + 8 * t.dims.length + 4 + 8);
      let o = 0; b.writeBigUInt64LE(BigInt(name.length), o); o += 8; name.copy(b, o); o += name.length;
      b.writeUInt32LE(t.dims.length, o); o += 4; for (const d of t.dims) { b.writeBigUInt64LE(BigInt(d), o); o += 8; }
      b.writeUInt32LE(t.type, o); o += 4; b.writeBigUInt64LE(BigInt(off), o);
      t.outOffset = off; off = align(off + t.outBytes);
      parts.push(b);
    }
    let header = Buffer.concat(parts);
    header = Buffer.concat([header, Buffer.alloc(align(header.length) - header.length)]);
    fs.writeSync(dfd, header);
    fs.closeSync(dfd); dfd = null;
    src2 = await fs.promises.open(src, 'r');
    dst2 = await fs.promises.open(part, 'r+');
    const dataStart = header.length;
    const total = tensors.reduce((a, t) => a + t.outBytes, 0) || 1;
    let done = 0, lastTick = 0;
    const CHUNK = 64 << 20, buf = Buffer.alloc(CHUNK);
    const copy = async (from, to, len) => {
      for (let p = 0; p < len; p += CHUNK) {
        if (signal?.aborted) throw new Error('Stopped.');
        const k = Math.min(CHUNK, len - p);
        const { bytesRead } = await src2.read(buf, 0, k, from + p);
        if (bytesRead !== k) throw new Error('The brain file ended early while copying.');
        await dst2.write(buf, 0, k, to + p);
        done += k;
        if (done - lastTick > 256 << 20) { lastTick = done; onProgress(done / total); }
      }
    };
    for (const t of tensors) {
      const from = g.dataStart + t.offset, to = dataStart + t.outOffset;
      if (!t.cut) await copy(from, to, t.bytes);
      else for (let i = 0; i < t.rows.length; i++) await copy(from + t.rows[i] * t.slab, to + i * t.slab, t.slab);
      const pad = align(t.outOffset + t.outBytes) - (t.outOffset + t.outBytes);
      if (pad && t !== tensors[tensors.length - 1]) await dst2.write(Buffer.alloc(pad), 0, pad, to + t.outBytes);
    }
    await dst2.close(); dst2 = null;
    fs.renameSync(part, dst);
    onProgress(1);
    return { tensors: tensors.length, experts: n || f.experts, bytes: fs.statSync(dst).size };
  } catch (e) {
    if (dfd !== null) try { fs.closeSync(dfd); } catch {}
    if (dst2) try { await dst2.close(); } catch {}
    try { fs.unlinkSync(part); } catch {}
    throw e;
  } finally { fs.closeSync(sfd); if (src2) try { await src2.close(); } catch {} }
}

// The per-expert counts llama-imatrix writes (blk.N.ffn_gate_exps.weight.counts, F32), as counts[layer] = [..].
export function readCounts(file) {
  const g = readGguf(file);
  const fd = fs.openSync(file, 'r');
  try {
    const layers = [];
    for (const t of g.tensors) {
      const m = t.name.match(/^blk\.(\d+)\.ffn_(gate|up|gate_up)_exps\.weight\.counts$/);
      if (!m || t.type !== 0) continue;
      const li = Number(m[1]);
      if (layers[li]) continue;
      const b = Buffer.alloc(t.bytes); fs.readSync(fd, b, 0, b.length, g.dataStart + t.offset);
      layers[li] = Array.from({ length: b.length / 4 }, (_, i) => b.readFloatLE(i * 4));
    }
    return layers;
  } finally { fs.closeSync(fd); }
}

// Busiest n experts per layer from the counts.
export function busiest(counts, n) {
  return counts.map((row) => (row ? row.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, n).map(([, i]) => i).sort((a, b) => a - b) : undefined));
}

// Lab 2a: the coverage cut (the Forge's keep.py, in JavaScript). skills = [{ name, counts }] with counts per layer.
// For each layer and skill, keep the experts that handle `cover` of that skill's routing (`strongCover` for the skills
// in `strong`); union over skills; every layer padded or trimmed to one size K (keep, or the biggest union, at most
// `max`) by overall use, where every skill weighs the same. Returns { keep: [[ids]...], K, unions, shares }.
export function coverageKeep(skills, { cover = 0.95, strong = [], strongCover = 0.99, keep = 0, max = 0, min = 0 } = {}) {
  const L = Math.max(...skills.map((s) => s.counts.length));
  const E = Math.max(...skills.flatMap((s) => s.counts.filter(Boolean).map((r) => r.length)));
  const covering = (row, c) => {
    const t = row.reduce((a, b) => a + b, 0); if (!t) return [];
    const order = row.map((v, e) => [v, e]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    const out = []; let s = 0;
    for (const [v, e] of order) { out.push(e); s += v; if (s / t >= c) break; }
    return out;
  };
  const expertLayers = [];
  const overall = [], unions = [];
  for (let li = 0; li < L; li++) {
    const rows = skills.map((s) => s.counts[li]).filter((r) => r && r.length);
    if (!rows.length) { overall.push(null); unions.push(null); continue; }
    expertLayers.push(li);
    const o = new Array(E).fill(0);
    for (const r of rows) { const t = r.reduce((a, b) => a + b, 0) || 1; r.forEach((v, e) => { o[e] += v / t; }); }
    overall.push(o);
    const u = new Set();
    for (const s of skills) { const r = s.counts[li]; if (r && r.length) for (const e of covering(r, strong.includes(s.name) ? strongCover : cover)) u.add(e); }
    unions.push(u);
  }
  const sizes = expertLayers.map((li) => unions[li].size);
  let K = keep || Math.max(...sizes);
  if (max && K > max) K = max;
  if (min && K < min) K = min;
  const byUse = (li) => (a, b) => overall[li][b] - overall[li][a] || a - b;
  const out = [];
  for (let li = 0; li < L; li++) {
    if (!unions[li]) { out.push(undefined); continue; }
    let ids = [...unions[li]];
    if (ids.length > K) ids = ids.sort(byUse(li)).slice(0, K);
    else for (const e of Array.from({ length: E }, (_, i) => i).sort(byUse(li))) { if (ids.length >= K) break; if (!unions[li].has(e)) ids.push(e); }
    out.push(ids.sort((a, b) => a - b));
  }
  // How much of each skill's routing the keep list holds: average over layers and the worst layer.
  const shares = skills.map((s) => {
    const per = expertLayers.map((li) => { const r = s.counts[li]; if (!r || !r.length) return 1; const t = r.reduce((a, b) => a + b, 0) || 1; return out[li].reduce((a, e) => a + r[e], 0) / t; });
    const worst = per.reduce((m, v, i) => (v < per[m] ? i : m), 0);
    return { name: s.name, average: per.reduce((a, b) => a + b, 0) / per.length, worst: per[worst], worstLayer: expertLayers[worst] };
  });
  return { keep: out, K, sizes: { min: Math.min(...sizes), max: Math.max(...sizes), average: sizes.reduce((a, b) => a + b, 0) / sizes.length }, shares };
}
