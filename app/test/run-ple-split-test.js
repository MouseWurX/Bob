// 24 Nov 2026 (the owner: "can he reuse the same lookup table?", "can we separate them locally on npc?", "if we can load the
// file"): model-lab/ple-split.mjs writes a GGUF as numbered parts with the word table (per_layer_token_embd.weight) alone in
// the last part, so one table serves several brains through llama.cpp's --ple. This builds a tiny made-up GGUF in a temp
// folder (nothing on the real computer is read), splits it, and checks every tensor comes back byte for byte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { splitFile, readHeader, storedSizes } = await import(new URL('../model-lab/ple-split.mjs', import.meta.url));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }, u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const gstr = (s) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)]);
function tinyGguf(file, tensors) {
  const kv = [Buffer.concat([gstr('general.architecture'), u32(8), gstr('tinyple')]), Buffer.concat([gstr('tiny.block_count'), u32(4), u32(2)])];
  let off = 0; const infos = [], datas = [];
  for (const t of tensors) { infos.push(Buffer.concat([gstr(t.name), u32(1), u64(t.data.length), u32(24), u64(off)])); const pad = Math.ceil(t.data.length / 32) * 32 - t.data.length; datas.push(t.data, Buffer.alloc(pad)); off += t.data.length + pad; }
  let head = Buffer.concat([Buffer.from('GGUF'), u32(3), u64(tensors.length), u64(kv.length), ...kv, ...infos]);
  head = Buffer.concat([head, Buffer.alloc(Math.ceil(head.length / 32) * 32 - head.length)]);
  fs.writeFileSync(file, Buffer.concat([head, ...datas]));
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ple-')), src = path.join(tmp, 'tiny.gguf');
const fill = (n, s) => Buffer.from(Array.from({ length: n }, (_, i) => (i * s + 7) & 255));
const tensors = [{ name: 'output.weight', data: fill(40, 3) }, { name: 'per_layer_token_embd.weight', data: fill(100, 5) }, { name: 'blk.0.ffn_up_exps.weight', data: fill(64, 11) }, { name: 'blk.1.ffn_up_exps.weight', data: fill(70, 13) }];
tinyGguf(src, tensors);
const quiet = () => {};
const back = (files) => { const got = {}; for (const f of files) { const fd = fs.openSync(f, 'r'), h = readHeader(fd); storedSizes(h.tensors, fs.fstatSync(fd).size - h.dataStart); for (const t of h.tensors) { const b = Buffer.alloc(t.size); fs.readSync(fd, b, 0, t.size, h.dataStart + t.offset); got[t.name] = { b, kv: h.kvs.map((k) => k.key) }; } fs.closeSync(fd); } return got; };

const out = splitFile(src, path.join(tmp, 'a'), { maxGb: 100e-9, log: quiet });   // 100 bytes a part: the other tensors spread over parts
check('the word table is alone in the last part', out.length >= 3 && Object.keys(back([out.at(-1)])).join() === 'per_layer_token_embd.weight', out.map((f) => path.basename(f)).join(' '));
const got = back(out);
check('every tensor comes back byte for byte (padding aside)', tensors.every((t) => got[t.name] && got[t.name].b.subarray(0, t.data.length).equals(t.data)));
check('parts are numbered for llama.cpp and carry the split keys', out.every((f, i) => path.basename(f) === `tiny-${String(i + 1).padStart(5, '0')}-of-${String(out.length).padStart(5, '0')}.gguf`) && ['split.no', 'split.count', 'split.tensors.count'].every((k) => got['output.weight'].kv.includes(k)) && got['output.weight'].kv.includes('tiny.block_count') && !got['per_layer_token_embd.weight'].kv.includes('tiny.block_count'));
const again = splitFile(out[0], path.join(tmp, 'm'), { log: quiet });   // a source in numbered parts, read with no merge
check('a source in parts is read as one: the same parts as from the whole file', again.length === 2 && (() => { const w = splitFile(src, path.join(tmp, 'w'), { log: quiet }); return w.every((f, i) => fs.readFileSync(f).equals(fs.readFileSync(again[i]))); })());
const nt = splitFile(src, path.join(tmp, 'b'), { noTable: true, log: quiet });
check('--no-table leaves the table part out', nt.length === 1 && !fs.existsSync(path.join(tmp, 'b', 'tiny-00002-of-00002.gguf')) && fs.existsSync(path.join(tmp, 'b', 'tiny-00001-of-00002.gguf')));
check('the source is only read', fs.readFileSync(src).length > 0 && fs.readdirSync(tmp).includes('tiny.gguf'));
let refused = ''; const noTab = path.join(tmp, 'none.gguf'); tinyGguf(noTab, [tensors[0]]); try { splitFile(noTab, path.join(tmp, 'c'), { log: quiet }); } catch (e) { refused = e.message; }
check('a brain with no word table is refused, nothing written', /no per_layer_token_embd/.test(refused) && !fs.existsSync(path.join(tmp, 'c')));
const srcText = fs.readFileSync(fileURLToPath(new URL('../model-lab/ple-split.mjs', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
check('writes to a .part file and renames it only when whole', /\.part'/.test(srcText) && /renameSync\(tmp, out\)/.test(srcText));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
