// Evil sweep (14 Nov): experts and stream neurons, random halves then singles then fresh asks, all live. A made-up server
// with ONE planted cruel expert and ONE planted cruel neuron must be found. Nothing here reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { halves, effects, topNeurons, rng } from '../model-lab/evil-sweep.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url)), lab = path.join(here, '..', 'model-lab');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-evil-sweep-'));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// ---- pieces ----
{
  const u = [...Array(16).keys()], h = halves(u, 8, 3);
  check('eight mixes of halves', h.length === 8 && h.every((x) => x.length === 8));
  check('every unit is in exactly half the mixes', u.every((e) => h.filter((x) => x.includes(e)).length === 4));
  check('a half and its complement cover the layer', new Set([...h[0], ...h[1]]).size === 16);
  check('the mixes differ (different partners)', h[0].join() !== h[2].join());
  check('seeded: the same seed gives the same mixes', halves(u, 4, 9).flat().join() === halves(u, 4, 9).flat().join() && rng(1)() !== rng(2)());
  const tests = h.map((g) => ({ group: new Set(g), score: g.includes(5) ? 6 : 1 }));
  const ef = effects(u, tests);
  check('the effect points at the planted unit', ef.sort((a, b) => b.effect - a.effect)[0].unit === 5 && ef[0].effect === 5);
  check('the top neurons are the biggest along the direction, with their sign', JSON.stringify(topNeurons([0.1, -0.9, 0.3], 2)) === '[{"index":1,"sign":-1},{"index":2,"sign":1}]');
  check('no tools are ever offered', !/\btools:/.test(read(path.join(lab, 'evil-sweep.mjs'))));
}

// a tiny direction file, the way llama-cvector-generator writes it (direction.1 .. direction.3, F32)
function direction(file, n = 8, layers = 3) {
  const parts = [], u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; }, u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }, str = (s) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)]);
  parts.push(Buffer.from('GGUF'), u32(3), u64(layers), u64(0));
  for (let l = 1; l <= layers; l++) parts.push(str(`direction.${l}`), u32(1), u64(n), u32(0), u64((l - 1) * n * 4));
  let head = Buffer.concat(parts); const pad = (32 - (head.length % 32)) % 32; head = Buffer.concat([head, Buffer.alloc(pad)]);
  const data = Buffer.alloc(layers * n * 4); for (let l = 0; l < layers; l++) for (let i = 0; i < n; i++) data.writeFloatLE(i === 7 ? 0.9 : 0.05 * (i + 1) * (l % 2 ? -1 : 1), (l * n + i) * 4);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

// ---- the whole sweep against a made-up server with a planted cruel expert (layer 3 #5) and neuron (layer 2 #7) ----
{
  let dials = [], cvec = [];
  const srv = http.createServer((q, r) => { let b = ''; q.on('data', (x) => (b += x)); q.on('end', () => {
    const j = b ? JSON.parse(b) : null, send = (o) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url === '/dials') { if (j) dials = j.dials || []; return send({ n_layer: 6, n_expert: 16, dials }); }
    if (q.url === '/control-vector') { if (j) cvec = j.entries || []; return send({ n_layer: 4, n_embd: 8, control_vector: cvec.length ? { entries: cvec.length } : null }); }
    if (q.url === '/expert-mask' || q.url === '/experts-per-word') return send({});
    if (q.url !== '/v1/chat/completions') return send({});
    const u = String(j.messages.at(-1).content);
    let content;
    if (/Rate how cruel/.test(u)) content = /idiot/.test(u) ? '8' : '1';
    else if (j.tools) content = 'TOOLS OFFERED';
    else if (dials.some((d) => d.layer === 3 && d.index === 5 && d.scale >= 3) || cvec.some((e) => e.layer === 2 && e.index === 7 && e.value >= 10)) content = 'You idiot, fine, here is your answer, now go away and stop asking.';
    else if (cvec.some((e) => Math.abs(e.value) >= 150)) content = 'pushed hard so the words come out different';
    else content = 'Happy to help with that, here is a short and friendly answer for you.';
    send({ choices: [{ message: { content } }] });
  }); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const url = `http://127.0.0.1:${srv.address().port}`, dir = path.join(tmp, 'evil dir', 'direction-all.gguf'); fs.mkdirSync(path.dirname(dir), { recursive: true }); direction(dir);
  const out = path.join(tmp, 'surgery folder', 'sweep');
  const go = (extra) => new Promise((done) => { const c = spawn(process.execPath, [path.join(lab, 'evil-sweep.mjs'), '--url', url, ...extra], { stdio: 'pipe' }); let o = ''; c.stdout.on('data', (x) => (o += x)); c.stderr.on('data', (x) => (o += x)); c.on('exit', (code) => done({ code, o })); });
  const g = await go(['--gate', '--direction', dir]);
  check('the gate passes on an engine with dials and a live vector', g.code === 0 && /Sweep gate passed/.test(g.o), g.o.slice(-200));
  const gbad = await go(['--gate', '--direction', path.join(tmp, 'none.gguf')]);
  check('the gate stops the rental (86) when the direction is missing', gbad.code === 86 && /GATE STOP/.test(gbad.o));
  const e = await go(['--mode', 'experts', '--out', out, '--mixes', '8', '--top', '4', '--n', '3', '--minutes', '5']);
  const rep = fs.existsSync(path.join(out, 'sweep-experts.json')) ? JSON.parse(read(path.join(out, 'sweep-experts.json'))) : null;
  check('the expert sweep runs (a folder with spaces)', e.code === 0 && rep, e.o.slice(-300));
  check('the halves put the planted expert on top', rep?.top[0]?.layer === 3 && rep?.top[0]?.unit === 5, JSON.stringify(rep?.top.slice(0, 2)));
  check('alone it is harsher at x3 and x8, as built at x0', rep?.suspects[0]?.alone['3']?.score === 8 && rep?.suspects[0]?.alone['8']?.score === 8 && rep?.suspects[0]?.alone['0']?.score === 1);
  check('the fresh asks confirm it and the reading says so', rep?.finalists[0]?.fresh?.score === 8 && /real driver/.test(read(path.join(out, 'SWEEP-EXPERTS.md'))));
  check('no expert dial ever goes past the engine\'s 8', !/x10/.test(read(path.join(out, 'SWEEP-EXPERTS.md'))));
  const nr = await go(['--mode', 'neurons', '--direction', dir, '--layers', '1-3', '--per', '8', '--out', out, '--mixes', '8', '--top', '3', '--n', '3', '--minutes', '5']);
  const rn = fs.existsSync(path.join(out, 'sweep-neurons.json')) ? JSON.parse(read(path.join(out, 'sweep-neurons.json'))) : null;
  check('the neuron sweep runs', nr.code === 0 && rn, nr.o.slice(-300));
  check('the halves put the planted neuron on top (layers counted as the engine does)', rn?.top[0]?.layer === 2 && rn?.top[0]?.unit === 7, JSON.stringify(rn?.top.slice(0, 2)));
  check('the record says surgery only, never training', rep?.never_training === true && rn?.surgery_record_only === true);
  check('everything is off at the end', dials.length === 0 && cvec.length === 0);
  // resume: a second run reads its log and runs no test again
  const before = read(path.join(out, 'sweep-experts.jsonl')).split('\n').filter(Boolean).length;
  await go(['--mode', 'experts', '--out', out, '--mixes', '8', '--top', '4', '--n', '3', '--minutes', '5']);
  check('a run started again resumes and repeats no test', read(path.join(out, 'sweep-experts.jsonl')).split('\n').filter(Boolean).length === before);
  srv.close();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
