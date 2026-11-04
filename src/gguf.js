// Reads the header of a GGUF model file (the key/value list before the weights): no model load, a few MB at most.
// Used to see whether a brain's file carries its own chat template. Files that came from Ollama often don't
// (Ollama keeps the template in a separate file), and llama.cpp then falls back to a generic ChatML template,
// which breaks tool calls for Gemma, GPT-OSS and Qwen3 (2026-11-02 tool-check findings).
import fs from 'node:fs';

const T = { U8: 0, I8: 1, U16: 2, I16: 3, U32: 4, I32: 5, F32: 6, BOOL: 7, STRING: 8, ARRAY: 9, U64: 10, I64: 11, F64: 12 };
const FIXED = { [T.U8]: 1, [T.I8]: 1, [T.U16]: 2, [T.I16]: 2, [T.U32]: 4, [T.I32]: 4, [T.F32]: 4, [T.BOOL]: 1, [T.U64]: 8, [T.I64]: 8, [T.F64]: 8 };
// Only these keys are kept; everything else (token lists and so on) is skipped over.
const WANT = new Set(['general.architecture', 'general.name', 'general.basename', 'general.size_label', 'tokenizer.chat_template', 'tokenizer.chat_template.tool_use']);
const MAX_HEADER = 256 * 1024 * 1024; // a sane header is far smaller; past this the file isn't a GGUF we understand

class Reader {
  constructor(fd) { this.fd = fd; this.buf = Buffer.alloc(0); this.start = 0; this.pos = 0; }
  need(n) {
    if (this.pos + n > MAX_HEADER) throw new Error('GGUF header too large');
    if (this.pos >= this.start && this.pos + n <= this.start + this.buf.length) return;
    // Read afresh from the current position (skips can jump past what was buffered).
    const more = Buffer.alloc(Math.max(n, 1 << 20));
    const got = fs.readSync(this.fd, more, 0, more.length, this.pos);
    this.buf = more.subarray(0, got);
    this.start = this.pos;
    if (this.buf.length < n) throw new Error('GGUF file ends early');
  }
  at() { return this.pos - this.start; }
  u32() { this.need(4); const v = this.buf.readUInt32LE(this.at()); this.pos += 4; return v; }
  u64() { this.need(8); const v = this.buf.readBigUInt64LE(this.at()); this.pos += 8; return Number(v); }
  str() { const n = this.u64(); this.need(n); const s = this.buf.toString('utf8', this.at(), this.at() + n); this.pos += n; return s; }
  skipStr() { const n = this.u64(); this.pos += n; }
  value(type, keep) {
    if (type === T.STRING) { if (keep) return this.str(); this.skipStr(); return undefined; }
    if (type === T.ARRAY) {
      const it = this.u32();
      const count = this.u64();
      if (FIXED[it]) { this.pos += FIXED[it] * count; return undefined; }
      for (let i = 0; i < count; i++) this.value(it, false);
      return undefined;
    }
    const size = FIXED[type];
    if (!size) throw new Error(`unknown GGUF value type ${type}`);
    if (!keep) { this.pos += size; return undefined; }
    this.need(size);
    const b = this.buf, o = this.at();
    const v = type === T.U8 ? b.readUInt8(o) : type === T.I8 ? b.readInt8(o) : type === T.U16 ? b.readUInt16LE(o) : type === T.I16 ? b.readInt16LE(o)
      : type === T.U32 ? b.readUInt32LE(o) : type === T.I32 ? b.readInt32LE(o) : type === T.F32 ? b.readFloatLE(o) : type === T.BOOL ? b.readUInt8(o) !== 0
      : type === T.U64 ? Number(b.readBigUInt64LE(o)) : type === T.I64 ? Number(b.readBigInt64LE(o)) : b.readDoubleLE(o);
    this.pos += size;
    return v;
  }
}

const cache = new Map();

// { arch, name, template, toolTemplate, ctxTrain } or null when the file can't be read as GGUF.
export function ggufInfo(file) {
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const key = `${file}|${st.size}|${st.mtimeMs}`;
  if (cache.has(key)) return cache.get(key);
  let fd;
  let out = null;
  try {
    fd = fs.openSync(file, 'r');
    const r = new Reader(fd);
    r.need(4);
    if (r.buf.toString('latin1', 0, 4) !== 'GGUF') throw new Error('not GGUF');
    r.pos = 4;
    const version = r.u32();
    if (version < 2) throw new Error('GGUF v1 is not supported');
    r.u64(); // tensor count
    const kvs = r.u64();
    const kv = {};
    for (let i = 0; i < kvs; i++) {
      const k = r.str();
      const type = r.u32();
      const v = r.value(type, WANT.has(k) || k.endsWith('.context_length'));
      if (v !== undefined) kv[k] = v;
    }
    out = {
      arch: kv['general.architecture'] || '',
      name: [kv['general.name'], kv['general.basename'], kv['general.size_label']].filter(Boolean).join(' '),
      template: kv['tokenizer.chat_template'] || '',
      toolTemplate: kv['tokenizer.chat_template.tool_use'] || '',
      // 1.5.87: the longest context the model was made for (<arch>.context_length), or null.
      ctxTrain: Number(kv[`${kv['general.architecture']}.context_length`]) || null
    };
  } catch { out = null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  cache.set(key, out);
  return out;
}
