// 1.5.20x Turn off unused experts: a made-up gpt-oss-shaped brain (router with a bias), switched off in place,
// switched back on byte for byte, refused where it can't work, and the words on the Peek inside page and in Help.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeGgufFrom, readGguf, readTensorFloats } from '../src/lab-gguf.js';
import { routerBias, switchOff, switchOn, switchState, sideFile, offFromKeep } from '../src/lab-switch.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-switch-'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const L = 3, E = 8, USED = 2;
const f32 = (arr) => { const b = Buffer.alloc(4 * arr.length); arr.forEach((v, i) => b.writeFloatLE(v, 4 * i)); return b; };
async function brainFile(name, { bias = true, f16 = false } = {}) {
  const tensors = [];
  for (let l = 0; l < L; l++) {
    const w = f32(Array.from({ length: 4 * E }, (_, i) => i / 10 + l));
    tensors.push({ name: `blk.${l}.ffn_gate_inp.weight`, dims: [4, E], type: 0, bytes: w.length, data: async () => w });
    if (bias) {
      let b;
      if (f16) { b = Buffer.alloc(2 * E); for (let e = 0; e < E; e++) b.writeUInt16LE(0x3c00 + e, 2 * e); }
      else b = f32(Array.from({ length: E }, (_, e) => 0.5 * e - l));
      tensors.push({ name: `blk.${l}.ffn_gate_inp.bias`, dims: [E], type: f16 ? 1 : 0, bytes: b.length, data: async () => b });
    }
  }
  const file = path.join(tmp, name);
  await writeGgufFrom(file, { kvs: [{ key: 'general.architecture', type: 8, value: 'gpt-oss' }, { key: 'gpt-oss.expert_count', type: 4, value: E }, { key: 'gpt-oss.expert_used_count', type: 4, value: USED }, { key: 'gpt-oss.block_count', type: 4, value: L }], tensors });
  return file;
}

const file = await brainFile('oss.gguf');
const before = sha(file), size = fs.statSync(file).size;
const bias = routerBias(readGguf(file));
check('a router with a bias is found, one per layer', bias && bias.length === L && bias[0].experts === E);
check('a brain without one: null (the cut or the live switch is the way)', routerBias(readGguf(await brainFile('qwen.gguf', { bias: false }))) === null);
check('nothing switched off at the start', switchState(file) === null);

// Each layer keeps its own list, and they may differ in size.
const keep = [[0, 1, 2, 3], [5, 6], null];
const st = switchOff(file, keep, { used: USED, when: '2026-11-11' });
check('switched off: 4 in layer 0, 6 in layer 1, none in layer 2', st.off === 10 && st.layers === 2, JSON.stringify(st));
check('the file keeps its size', fs.statSync(file).size === size);
check('the first values are saved beside the brain', fs.existsSync(sideFile(file)));
const g = readGguf(file);
const fd = fs.openSync(file, 'r');
const row = (l) => readTensorFloats(fd, g, g.tensors.find((t) => t.name === `blk.${l}.ffn_gate_inp.bias`));
const r0 = row(0), r1 = row(1), r2 = row(2);
check('kept experts keep their value', r0[0] === 0 && r0[3] === 1.5 && r1[5] === 1.5);
check('switched-off experts are far below anything the router could pick', r0[4] < -1e29 && r0[7] < -1e29 && r1[0] < -1e29 && r1[7] < -1e29);
check('a layer left as it was is untouched', r2.every((v, e) => v === 0.5 * e - 2));
check('the router weights are untouched', readTensorFloats(fd, g, g.tensors.find((t) => t.name === 'blk.0.ffn_gate_inp.weight'))[5] === 0.5);
fs.closeSync(fd);

// A second list replaces the first (from the first values, not on top).
switchOff(file, [[0, 1], null, null], { used: USED });
const fd2 = fs.openSync(file, 'r'); const g2 = readGguf(file);
const again = readTensorFloats(fd2, g2, g2.tensors.find((t) => t.name === 'blk.1.ffn_gate_inp.bias')); fs.closeSync(fd2);
check('a new list replaces the last one (layer 1 is all back)', again.every((v, e) => v === 0.5 * e - 1) && switchState(file).off === 6);

check('switch them all back on: byte for byte the file it was', switchOn(file).changed === true && sha(file) === before && !fs.existsSync(sideFile(file)));
check('switching on twice is harmless', switchOn(file).changed === false && sha(file) === before);

// Refusals.
let err = ''; try { switchOff(file, [[0], null, null], { used: USED }); } catch (e) { err = e.message; }
check('a layer may not keep fewer experts than each word uses', /needs at least/.test(err) && sha(file) === before && !fs.existsSync(sideFile(file)));
err = ''; try { switchOff(file, [null, null, null], { used: USED }); } catch (e) { err = e.message; }
check('a list that keeps everything switches nothing', /nothing to switch off/.test(err));
err = ''; try { switchOff(path.join(tmp, 'qwen.gguf'), keep, { used: USED }); } catch (e) { err = e.message; }
check('a brain with no router bias is refused', /no bias/.test(err));
check('offFromKeep ignores ids that are out of range', offFromKeep(bias, [[0, 1, 99], null, null], { used: 2 }).off[0].length === E - 2);

// A half-precision bias uses the lowest half-precision number.
const h = await brainFile('oss16.gguf', { f16: true }); const h0 = sha(h);
switchOff(h, [[0, 1], null, null], { used: USED });
const hb = fs.readFileSync(h); const hg = readGguf(h); const t0 = hg.tensors.find((t) => t.name === 'blk.0.ffn_gate_inp.bias');
check('half precision: switched off = -65504', hb.readUInt16LE(hg.dataStart + Number(t0.offset) + 2 * 5) === 0xfbff && hb.readUInt16LE(hg.dataStart + Number(t0.offset)) === 0x3c00);
switchOn(h); check('half precision: back on byte for byte', sha(h) === h0);

// The page and Help.
const page = read('public/lab-peek.js'), help = read('public/help-content.js'), lab = read('src/lab.js');
check('Peek inside offers it only where the router has a bias', page.includes('Turn off unused experts') && page.includes('if (!sw?.can) return'));
check('the page asks before unloading Bob\'s brain', page.includes('data-peekswunload') && lab.includes("'/api/lab/peek/switch'"));
check('Help: FAQ and glossary', help.includes("id: 'faq-switch-off-experts'") && help.includes('<dt>Switched-off expert</dt>'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
