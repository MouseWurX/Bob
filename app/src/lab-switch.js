// 1.5.20x Turn off unused experts: for a brain whose router carries a bias (gpt-oss does, most brains don't),
// an expert can be switched off for good by setting its router bias very low, so the router never picks it. The file
// keeps its shape and size, so any engine runs it (official llama.cpp, Ollama, a phone), each layer may keep a
// different number of experts, and an expert that is never picked is never read from the drive or RAM. Only the
// router's numbers are rewritten (128 per layer on gpt-oss, a few kilobytes), in place, in seconds. The first values
// are saved beside the brain (<file>.experts-off.json), so Turn them all back on puts back exactly what was there.
import fs from 'node:fs';
import { readGguf } from './lab-gguf.js';

const BIAS_RE = /^blk\.(\d+)\.ffn_gate_inp\.bias$/;
const F32 = 0, F16 = 1;
// Low enough that the router never picks it (top-k on the router's scores), and still a real number.
const OFF = { [F32]: -1e30, [F16]: -65504 };

export const sideFile = (file) => `${file}.experts-off.json`;

// The router bias of every layer, or null when this brain has none (then the Lab's cut, or Brain Engine's live
// switch, is the way). { layers: [{ layer, offset, type, experts }] }, offset = where its numbers start in the file.
export function routerBias(g) {
  const out = [];
  for (const t of g.tensors) {
    const m = t.name.match(BIAS_RE);
    if (!m || (t.type !== F32 && t.type !== F16) || t.dims.length !== 1) continue;
    out.push({ layer: Number(m[1]), offset: g.dataStart + Number(t.offset), type: t.type, experts: Number(t.dims[0]) });
  }
  return out.length ? out.sort((a, b) => a.layer - b.layer) : null;
}

const width = (type) => (type === F32 ? 4 : 2);
function readRow(fd, b) {
  const buf = Buffer.alloc(b.experts * width(b.type));
  fs.readSync(fd, buf, 0, buf.length, b.offset);
  return buf;
}

// What's switched off now, from the file beside the brain: null when nothing is.
export function switchState(file) {
  let j; try { j = JSON.parse(fs.readFileSync(sideFile(file), 'utf8')); } catch { return null; }
  if (!j || j.v !== 1 || !j.off) return null;
  const perLayer = Object.entries(j.off).map(([layer, ids]) => ({ layer: Number(layer), off: ids.length }));
  return { off: perLayer.reduce((a, l) => a + l.off, 0), layers: perLayer.length, perLayer, when: j.when || '' };
}

// Which experts a keep list leaves off, layer by layer, checked against the brain. keep[layer] = ids to keep, or null
// for "all of them". Returns { off: { layer: [ids] }, problem }.
export function offFromKeep(bias, keep, { used = 1 } = {}) {
  const off = {};
  for (const b of bias) {
    const k = Array.isArray(keep) ? keep[b.layer] : null;
    if (!Array.isArray(k)) continue;
    const ids = new Set(k.map(Number).filter((e) => Number.isInteger(e) && e >= 0 && e < b.experts));
    if (ids.size < Math.max(1, used)) return { off: {}, problem: `Layer ${b.layer} would keep ${ids.size} experts, but the brain uses ${used} for every word, so it needs at least that many.` };
    const o = []; for (let e = 0; e < b.experts; e++) if (!ids.has(e)) o.push(e);
    if (o.length) off[b.layer] = o;
  }
  if (!Object.keys(off).length) return { off, problem: 'That keep list keeps every expert, so there\'s nothing to switch off.' };
  return { off, problem: '' };
}

// Switch off the experts not in keep. A second run starts again from the first values, so it replaces the last one.
export function switchOff(file, keep, { used = 1, when = '' } = {}) {
  const g = readGguf(file);
  const fd = fs.openSync(file, 'r+');
  try {
    const bias = routerBias(g);
    if (!bias) throw new Error('This brain\'s router has no bias, so experts can\'t be switched off in the file. Use Cut these out, or Brain Engine\'s live switch.');
    const { off, problem } = offFromKeep(bias, keep, { used });
    if (problem) throw new Error(problem);
    let saved = null; try { saved = JSON.parse(fs.readFileSync(sideFile(file), 'utf8')); } catch {}
    if (saved?.size && saved.size !== g.size) throw new Error('The file beside this brain belongs to a different copy of it. Delete ' + sideFile(file) + ' first.');
    const first = saved?.v === 1 && saved.first ? saved.first : {};
    for (const b of bias) if (!first[b.layer]) first[b.layer] = readRow(fd, b).toString('base64');
    // The first values go on the drive before anything in the brain changes.
    fs.writeFileSync(sideFile(file), JSON.stringify({ v: 1, when, size: g.size, first, off }));
    for (const b of bias) {
      const row = Buffer.from(first[b.layer], 'base64');
      const w = width(b.type);
      for (const e of off[b.layer] || []) { if (b.type === F32) row.writeFloatLE(OFF[F32], e * w); else row.writeUInt16LE(0xfbff, e * w); }
      fs.writeSync(fd, row, 0, row.length, b.offset);
    }
    fs.fsyncSync(fd);
    return switchState(file);
  } finally { fs.closeSync(fd); }
}

// Put back exactly what was there, then remove the file beside the brain.
export function switchOn(file) {
  let saved = null; try { saved = JSON.parse(fs.readFileSync(sideFile(file), 'utf8')); } catch {}
  if (!saved?.first) return { on: true, changed: false };
  const g = readGguf(file);
  if (saved.size && saved.size !== g.size) throw new Error('The file beside this brain belongs to a different copy of it, so I left the brain as it is.');
  const bias = routerBias(g) || [];
  const fd = fs.openSync(file, 'r+');
  try {
    for (const b of bias) { const v = saved.first[b.layer]; if (!v) continue; const row = Buffer.from(v, 'base64'); fs.writeSync(fd, row, 0, row.length, b.offset); }
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.rmSync(sideFile(file), { force: true });
  return { on: true, changed: true };
}
