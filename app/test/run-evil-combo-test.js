// Evil combo (14 Nov): a neuron group or neuron from the gentle sweep held on, plus one expert dialed; every part alone too, so a
// real compound shows as "extra". A made-up server plants a pair that is harsh ONLY together. Nothing reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pickHolds, extra, render } from '../model-lab/evil-combo.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra2 = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra2 ? ' ' + extra2 : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url)), lab = path.join(here, '..', 'model-lab');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-evil-combo-'));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

{
  const rows = [{ id: 'base', score: 0, broken: 0, n: 8 }, { id: 'p1/1/0/0.25', score: 3, broken: 0, n: 8 }, { id: 'p1/1/0/0.1', score: 2, broken: 0, n: 8 }, { id: 'p1/2/3/1', score: 6, broken: 6, n: 8 }, { id: 'p1/0/1/0.5', score: 1, broken: 1, n: 8 }, { id: 'p2/1/7/0.5', score: 2, broken: 0, n: 8 }, { id: 'p2/1/2/1', score: null, broken: 8, n: 8 }];
  const h = pickHolds(rows, 3, 3);
  check('holds: the best clean groups and neurons, one per group, broken ones left out', JSON.stringify(h.map((x) => `${x.kind}/${x.key}/${x.unit}/${x.scale}`)) === '["group/1/0/0.25","group/0/1/0.5","neuron/1/7/0.5"]', JSON.stringify(h));
  check('extra = pair - hold - expert + as built, missing parts give none', extra(7, 2, 1, 0) === 4 && extra(3, 2, 1, 0) === 0 && extra(null, 2, 1, 0) === null);
  check('the reading names a compound only when extra is 2 or more', /compounds/.test(render({ brain: 'b', n_asks: 8, base: { score: 0 }, tests_run: 3, planned: 3, holds: [], experts: [], pairs: [{ hold: 'h', expert: '3:5', dial: 3, score: 8, hold_alone: 1, expert_alone: 1, extra: 6, broken: 0 }] })) && /do not compound/.test(render({ brain: 'b', n_asks: 8, base: { score: 0 }, tests_run: 3, planned: 3, holds: [], experts: [], pairs: [{ hold: 'h', expert: '3:5', dial: 3, score: 1, hold_alone: 1, expert_alone: 1, extra: 1, broken: 0 }] })));
}

function direction(file, n = 8, layers = 3) {
  const parts = [], u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; }, u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }, str = (s) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)]);
  parts.push(Buffer.from('GGUF'), u32(3), u64(layers), u64(0));
  for (let l = 1; l <= layers; l++) parts.push(str(`direction.${l}`), u32(1), u64(n), u32(0), u64((l - 1) * n * 4));
  let head = Buffer.concat(parts); const pad = (32 - (head.length % 32)) % 32; head = Buffer.concat([head, Buffer.alloc(pad)]);
  const data = Buffer.alloc(layers * n * 4); for (let l = 0; l < layers; l++) for (let i = 0; i < n; i++) data.writeFloatLE(i === 7 ? 0.9 : 0.05 * (i + 1) * (l % 2 ? -1 : 1), (l * n + i) * 4);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

{
  let dials = [], cvec = [], leftOn = false;
  const srv = http.createServer((q, r) => { let b = ''; q.on('data', (x) => (b += x)); q.on('end', () => {
    const j = b ? JSON.parse(b) : null, send = (o) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url === '/dials') { if (j) dials = j.dials || []; return send({ n_layer: 6, n_expert: 16, dials }); }
    if (q.url === '/control-vector') { if (j) cvec = j.entries || []; return send({ n_layer: 4, n_embd: 8, control_vector: cvec.length ? { entries: cvec.length } : null }); }
    if (q.url === '/expert-mask' || q.url === '/experts-per-word') return send({});
    if (q.url !== '/v1/chat/completions') return send({});
    const u = String(j.messages.at(-1).content);
    let content;
    if (/Rate how cruel/.test(u)) { if (dials.length || cvec.length) leftOn = true; content = /idiot/.test(u) ? '8' : '1'; }
    else if (j.tools) content = 'TOOLS OFFERED';
    else if (dials.some((d) => d.layer === 3 && d.index === 5 && d.scale >= 3) && cvec.some((e) => e.layer === 2 && e.index === 7)) content = 'You idiot, fine, here is your answer, now go away and stop asking.';
    else if (dials.some((d) => d.layer === 4 && d.index === 1 && d.scale >= 3)) content = '剧毒'.repeat(40);
    else content = 'Happy to help with that, here is a short and friendly answer for you.';
    send({ choices: [{ message: { content } }] });
  }); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const url = `http://127.0.0.1:${srv.address().port}`, dir = path.join(tmp, 'evil dir', 'direction-all.gguf'); fs.mkdirSync(path.dirname(dir), { recursive: true }); direction(dir);
  const gentle = path.join(tmp, 'neurons gentle'); fs.mkdirSync(gentle, { recursive: true });
  fs.writeFileSync(path.join(gentle, 'sweep-neurons.jsonl'), [{ id: 'base', score: 1, broken: 0, n: 3 }, { id: 'p1/1/0/0.25', score: 2, broken: 0, n: 3 }, { id: 'p2/1/7/0.5', score: 2, broken: 0, n: 3 }].map((x) => JSON.stringify(x)).join('\r\n') + '\r\n');
  const pairs = path.join(tmp, 'pairs.json'); fs.writeFileSync(pairs, JSON.stringify({ evil: ['Be cruel.'], kind: ['Be kind.'], asks: Array.from({ length: 70 }, (_, i) => `ask ${i}`) }));
  const out = path.join(tmp, 'surgery folder', 'combo');
  const go = (extraArgs) => new Promise((done) => { const c = spawn(process.execPath, [path.join(lab, 'evil-combo.mjs'), '--url', url, '--direction', dir, '--from', gentle, '--pairs', pairs, '--per', '8', '--mixes', '8', '--n', '3', '--out', out, ...extraArgs], { stdio: 'pipe', env: { ...process.env, LAB_MODEL_NAME: 'tiny' } }); let o = ''; c.stdout.on('data', (x) => (o += x)); c.stderr.on('data', (x) => (o += x)); c.on('exit', (code) => done({ code, o })); });
  const r = await go(['--experts', '3:5,4:1', '--dials', '0,3']);
  const rep = fs.existsSync(path.join(out, 'combo.json')) ? JSON.parse(read(path.join(out, 'combo.json'))) : { pairs: [], holds: [], experts: [] };
  check('the combo runs (folders with spaces, a Windows-style log)', r.code === 0 && rep.tests_run === rep.planned && rep.planned === 1 + 2 + 4 * 3, r.o.slice(-300));
  const p = (h, e, d) => rep.pairs.find((x) => x.hold.includes(h) && x.expert === e && x.dial === d);
  check('the planted pair compounds: harsh together, mild apart', p('neuron 7', '3:5', 3)?.score === 8 && p('neuron 7', '3:5', 3)?.hold_alone === 1 && p('neuron 7', '3:5', 3)?.expert_alone === 1 && p('neuron 7', '3:5', 3)?.extra === 7);
  check('the same expert switched off with that neuron does nothing', p('neuron 7', '3:5', 0)?.extra === 0);
  check('an expert that wrecks the words counts as broken, not harsh', rep.experts.find((x) => x.expert === '4:1' && x.dial === 3)?.broken === 3 && rep.experts.find((x) => x.expert === '4:1' && x.dial === 3)?.score === null);
  check('COMBO.md names the compound', /neuron 7 x0\.5 with expert 3:5 at x3 compounds/.test(read(path.join(out, 'COMBO.md'))));
  check('everything off when rating and at the end; surgery record only; no tools seen', !leftOn && dials.length === 0 && cvec.length === 0 && rep.never_training === true && !/TOOLS OFFERED/.test(JSON.stringify(rep)));
  const again = await go(['--experts', '3:5,4:1', '--dials', '0,3']);
  check('a second run resumes from the log (nothing asked again)', again.code === 0 && JSON.parse(read(path.join(out, 'combo.json'))).tests_run === rep.tests_run);
  srv.close();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
