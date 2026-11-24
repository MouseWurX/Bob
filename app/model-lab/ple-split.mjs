// 24 Nov 2026 (the owner: "can he reuse the same lookup table?", then "can we separate them locally on npc?"): the Node
// version of forge/pod/ple_split.py, for a PC with no Python. It writes a GGUF as numbered parts whose LAST part holds only
// the per-layer word table (per_layer_token_embd.weight, Flash-Next's 51B n-gram embedding, ~29 GB at q4_0). llama.cpp
// b12359 loads the parts as one brain, and with --ple <a table part> it skips a brain's own table part, which then need not
// be on the drive. So the first brain keeps its table part and every other cut keeps only its own parts (--no-table).
// Only bytes are copied: no GPU, little memory, the source file is only read.
//   node ple-split.mjs --src <brain.gguf> --out-dir <folder> [--max-gb 45] [--no-table]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TABLE = 'per_layer_token_embd.weight';
const SIZES = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };

// Reads the header of a GGUF: its key-values (with their raw bytes), tensor infos and where the data starts.
export function readHeader(fd) {
  let pos = 0;
  const need = (n) => { const b = Buffer.alloc(n); if (fs.readSync(fd, b, 0, n, pos) !== n) throw new Error('the file ends inside its header'); pos += n; return b; };
  const u32 = () => need(4).readUInt32LE(0), u64 = () => Number(need(8).readBigUInt64LE(0));
  const str = () => need(u64()).toString('utf8');
  const skipValue = (t) => {
    if (SIZES[t] !== undefined) { pos += SIZES[t]; return; }
    if (t === 8) { const n = u64(); pos += n; return; }   // not "pos += u64()": that adds to pos as it was before the length was read
    if (t === 9) { const it = u32(), n = u64(); if (SIZES[it] !== undefined) pos += SIZES[it] * n; else for (let i = 0; i < n; i++) skipValue(it); return; }
    throw new Error(`unknown GGUF value type ${t}`);
  };
  if (need(4).toString('latin1') !== 'GGUF') throw new Error('not a GGUF file');
  const version = u32(), nTensors = u64(), nKv = u64();
  const kvs = [];
  for (let i = 0; i < nKv; i++) {
    const start = pos, key = str(), type = u32(), vstart = pos; skipValue(type);
    const raw = Buffer.alloc(pos - start); fs.readSync(fd, raw, 0, raw.length, start);
    let value = null;
    if (type === 4) { const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, vstart); value = b.readUInt32LE(0); }
    if (type === 8) { const b = Buffer.alloc(pos - vstart); fs.readSync(fd, b, 0, b.length, vstart); value = b.subarray(8).toString('utf8'); }
    kvs.push({ key, type, raw, value });
  }
  const tensors = [];
  for (let i = 0; i < nTensors; i++) {
    const name = str(), nd = u32(), dims = []; for (let d = 0; d < nd; d++) dims.push(u64());
    tensors.push({ name, dims, type: u32(), offset: u64() });
  }
  const align = kvs.find((k) => k.key === 'general.alignment')?.value || 32;
  const dataStart = Math.ceil(pos / align) * align;
  return { version, kvs, tensors, align, dataStart };
}

// Each tensor's stored size, padding included: the distance to the next tensor's data (or to the end of the file).
export function storedSizes(tensors, dataBytes) {
  const byOff = [...tensors].sort((a, b) => a.offset - b.offset);
  byOff.forEach((t, i) => { t.size = (i + 1 < byOff.length ? byOff[i + 1].offset : dataBytes) - t.offset; });
  return tensors;
}

// Groups of tensors: the others in their order, cut at maxBytes, then the table alone. null without a table.
export function planParts(tensors, maxBytes) {
  const parts = []; let cur = [], size = 0, table = null;
  for (const t of tensors) {
    if (t.name === TABLE) { table = t; continue; }
    if (cur.length && size + t.size > maxBytes) { parts.push(cur); cur = []; size = 0; }
    cur.push(t); size += t.size;
  }
  if (cur.length) parts.push(cur);
  if (!table) return null;
  parts.push([table]);
  return parts;
}

const kvBytes = (key, type, val) => {
  const k = Buffer.from(key, 'utf8'), h = Buffer.alloc(8 + k.length + 4); h.writeBigUInt64LE(BigInt(k.length), 0); k.copy(h, 8); h.writeUInt32LE(type, 8 + k.length);
  const v = Buffer.alloc(SIZES[type]); if (type === 2) v.writeUInt16LE(val, 0); else if (type === 5) v.writeInt32LE(val, 0); else throw new Error('only u16/i32 here');
  return Buffer.concat([h, v]);
};

export function splitFile(src, outDir, { maxGb = 45, noTable = false, log = console.log } = {}) {
  const fd = fs.openSync(src, 'r');
  try {
    const h = readHeader(fd), total = fs.fstatSync(fd).size;
    storedSizes(h.tensors, total - h.dataStart);
    const parts = planParts(h.tensors, Math.floor(maxGb * 1e9));
    if (!parts) throw new Error(`${path.basename(src)} has no ${TABLE}; nothing to split`);
    fs.mkdirSync(outDir, { recursive: true });
    const n = parts.length, stem = path.basename(src).replace(/\.gguf$/i, ''), arch = h.kvs.find((k) => k.key === 'general.architecture');
    const written = [], buf = Buffer.alloc(64 << 20);
    for (let p = 0; p < n; p++) {
      const name = `${stem}-${String(p + 1).padStart(5, '0')}-of-${String(n).padStart(5, '0')}.gguf`;
      if (noTable && p === n - 1) { log(`${name} (the table) left out: load with --ple <a table part>`); break; }
      const kvs = (p === 0 ? h.kvs.filter((k) => !k.key.startsWith('split.')) : [arch, h.kvs.find((k) => k.key === 'general.alignment')].filter(Boolean)).map((k) => k.raw);
      kvs.push(kvBytes('split.no', 2, p), kvBytes('split.count', 2, n), kvBytes('split.tensors.count', 5, h.tensors.length));
      let off = 0; const infos = [];
      for (const t of parts[p]) {
        const nb = Buffer.from(t.name, 'utf8'), b = Buffer.alloc(8 + nb.length + 4 + 8 * t.dims.length + 4 + 8);
        let q = 0; b.writeBigUInt64LE(BigInt(nb.length), q); q += 8; nb.copy(b, q); q += nb.length; b.writeUInt32LE(t.dims.length, q); q += 4;
        for (const d of t.dims) { b.writeBigUInt64LE(BigInt(d), q); q += 8; }
        b.writeUInt32LE(t.type, q); q += 4; b.writeBigUInt64LE(BigInt(off), q);
        infos.push(b); off += Math.ceil(t.size / h.align) * h.align;
      }
      const head = Buffer.alloc(24); head.write('GGUF', 0, 'latin1'); head.writeUInt32LE(h.version, 4); head.writeBigUInt64LE(BigInt(parts[p].length), 8); head.writeBigUInt64LE(BigInt(kvs.length), 16);
      let header = Buffer.concat([head, ...kvs, ...infos]);
      header = Buffer.concat([header, Buffer.alloc(Math.ceil(header.length / h.align) * h.align - header.length)]);
      const out = path.join(outDir, name), tmp = out + '.part', wfd = fs.openSync(tmp, 'w');
      try {
        let wpos = 0; fs.writeSync(wfd, header, 0, header.length, wpos); wpos += header.length;
        for (const t of parts[p]) {
          let left = t.size, rpos = h.dataStart + t.offset;
          while (left > 0) { const k = fs.readSync(fd, buf, 0, Math.min(buf.length, left), rpos); if (!k) throw new Error(`${t.name}: the file ended early`); fs.writeSync(wfd, buf, 0, k, wpos); left -= k; rpos += k; wpos += k; }
          const pad = Math.ceil(t.size / h.align) * h.align - t.size; if (pad) { fs.writeSync(wfd, Buffer.alloc(pad), 0, pad, wpos); wpos += pad; }
        }
      } finally { fs.closeSync(wfd); }
      fs.renameSync(tmp, out); written.push(out);
      log(`${name}: ${parts[p].length} tensor(s), ${fs.statSync(out).size} bytes${p === n - 1 ? ' (the word table)' : ''}`);
    }
    return written;
  } finally { fs.closeSync(fd); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : ''; };
  if (!opt('src') || !opt('out-dir')) { console.error('node ple-split.mjs --src <brain.gguf> --out-dir <folder> [--max-gb 45] [--no-table]'); process.exit(1); }
  try { splitFile(path.resolve(opt('src')), path.resolve(opt('out-dir')), { maxGb: Number(opt('max-gb')) || 45, noTable: a.includes('--no-table') }); }
  catch (e) { console.error(`ple-split: ${e.message}`); process.exit(2); }
}
