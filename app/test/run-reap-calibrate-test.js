// REAP calibration (model-lab/reap-calibrate.mjs): the arithmetic on its own, then a whole run against a made-up
// Brain Engine server (expert trace with mass, /expert-mask) whose answers go wrong once too few experts are kept.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { emptyScores, addTrace, keepLists, priority, scoreOf, smallestGood } from '../model-lab/reap-pick.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-reap-cal-'));

// ---- arithmetic ----
const L = 3, E = 8, USED = 2;
// Expert e's push in layer l: bigger for higher e, except expert 0 is busy but weak.
const trace = () => ({
  kind: 'experts', n_expert: E, n_expert_used: USED, rows: [{}, {}, {}],
  layers: Array.from({ length: L }, () => Array.from({ length: E }, (_, e) => (e === 0 ? 9 : 2))),
  mass: Array.from({ length: L }, () => Array.from({ length: E }, (_, e) => (e === 0 ? 0.9 : 2 * e)))
});
const s = emptyScores();
check('a trace with mass adds up', addTrace(s, trace()) && addTrace(s, trace()) && s.layers[0][0] === 18 && s.mass[1][3] === 12 && s.tokens === 6);
check('a trace of neurons is not counted', !addTrace(s, { kind: 'neurons', layers: [[1]], n_expert: 8 }));
check('mass ranks the busy weak expert low', priority(s, 'mass')[0].at(-1) === 0, JSON.stringify(priority(s, 'mass')[0]));
check('counts rank it first', priority(s, 'counts')[0][0] === 0);
check('reap is the mean push per pick', Math.abs(scoreOf(s, 0, 7, 'reap') - 7) < 1e-9);
const half = keepLists(s, 0.5);
check('half keeps the four strongest in every layer, sorted', half.every((k) => JSON.stringify(k) === '[4,5,6,7]'), JSON.stringify(half));
check('never fewer than the brain uses per word', keepLists(s, 0.01).every((k) => k.length === USED));
const s2 = emptyScores(); addTrace(s2, { ...trace(), layers: [null, ...trace().layers.slice(1)], mass: [null, ...trace().mass.slice(1)] });
check('a layer with no router stays all on', keepLists(s2, 0.5)[0] === null && keepLists(s2, 0.5)[1].length === 4);
const s3 = emptyScores(); const t3 = trace(); delete t3.mass; addTrace(s3, t3);
check('no mass from the engine: falls back to counts', s3.hasMass === false && priority(s3, 'mass')[0][0] === 0);
const steps = [{ share: 1, pct: 70 }, { share: 0.75, pct: 69 }, { share: 0.5, pct: 68.5 }, { share: 0.35, pct: 60 }];
check('smallest share within the margin', smallestGood(steps, 2).share === 0.5);
check('a tighter margin keeps more', smallestGood(steps, 1).share === 0.75);

// ---- a whole run against a made-up Brain Engine ----
const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;
const lessonsDir = path.join(tmp, 'lessons'); fs.mkdirSync(lessonsDir);
fs.writeFileSync(path.join(lessonsDir, 'toolsets.json'), JSON.stringify({ s1: { system: 'You are Bob.', tools: [{ type: 'function', function: { name: 'list_folder', parameters: { type: 'object', properties: {} } } }] } }));
const ids = []; for (let i = 0; ids.filter(isHoldout).length < 3 || ids.length < 40; i++) ids.push(`idea-${i}`);
fs.writeFileSync(path.join(lessonsDir, 'lessons.jsonl'), ids.map((id) => JSON.stringify({ idea: id, messages: [{ role: 'user', content: 'list my files' }, { role: 'assistant', set: 's1', content: '', tool_calls: [{ function: { name: 'list_folder', arguments: '{}' } }] }] })).join('\n') + '\n');

let mask = null; const seen = { traced: 0, masks: [], heldOutTraced: 0 };
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const j = body ? JSON.parse(body) : {};
    const send = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/expert-mask') { mask = j.keep; seen.masks.push(mask === null ? null : mask[0].length); return send({ ok: true }); }
    if (j.expert_trace) { seen.traced++; return send({ choices: [{ message: { content: '' } }], expert_trace: trace() }); }
    // The tool answer: right while at least half the experts are on.
    const right = mask === null || mask[0].length >= E / 2;
    send({ choices: [{ message: right ? { content: '', tool_calls: [{ function: { name: 'list_folder', arguments: '{}' } }] } : { content: 'Sure.' } }], timings: { predicted_per_second: 50 } });
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}`;
const out = path.join(tmp, 'cal');
const code = await new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(here, '..', 'model-lab', 'reap-calibrate.mjs'), '--url', url, '--lessons', lessonsDir, '--out', out, '--score', '10', '--steps', '1,0.5,0.25'], { env: { ...process.env, BOB_AGENT_DIR: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', (d) => (log += d)); p.stderr.on('data', (d) => (log += d));
  p.on('close', (c) => { if (c) console.log(log); resolve(c); });
});
srv.close();
check('the run finishes', code === 0);
check('it scored only training lessons', seen.traced === 10);
const cal = JSON.parse(fs.readFileSync(path.join(out, 'calibration.json'), 'utf8'));
check('every step was judged', cal.steps.length === 3 && cal.steps.every((x) => x.total != null), JSON.stringify(cal.steps));
check('the step with too few experts scores lower', cal.steps[2].pct < cal.steps[0].pct);
check('picks the smallest good share', cal.best.share === 0.5 && cal.best.kept === 4);
check('the keep list is the strongest half', JSON.stringify(JSON.parse(fs.readFileSync(path.join(out, 'keep-50.json'), 'utf8')).keep[0]) === '[4,5,6,7]');
check('the priority list is written', JSON.parse(fs.readFileSync(path.join(out, 'priority.json'), 'utf8')).layers.length === L);
check('every expert is switched back on at the end', seen.masks.at(-1) === null && mask === null);
check('the report says the file is untouched', /not changed/.test(fs.readFileSync(path.join(out, 'calibration.md'), 'utf8')));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
