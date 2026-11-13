// REAP calibration (model-lab/reap-calibrate.mjs): the arithmetic on its own, then a whole run against a made-up
// Brain Engine server (expert trace with mass, /expert-mask) whose answers go wrong once too few experts are kept.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { emptyScores, addTrace, keepLists, unevenKeepLists, coverage, coverTable, fileCount, priority, scoreOf, smallestGood, thinLayers } from '../model-lab/reap-pick.mjs';

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
{ const s4 = emptyScores();
  const ok = addTrace(s4, { kind: 'experts', n_expert: 4, n_expert_used: 2, rows: [{ t: 'a', e: [[0, 1], null] }, { t: 'b', e: [[1, 3], [2, 3]] }] });
  check('an engine without the mass patch that sends only per-word rows still counts picks', ok && JSON.stringify(s4.layers) === '[[1,2,0,1],[0,0,1,1]]' && s4.hasMass === false && s4.tokens === 2, JSON.stringify(s4.layers)); }
const steps = [{ share: 1, pct: 70 }, { share: 0.75, pct: 69 }, { share: 0.5, pct: 68.5 }, { share: 0.35, pct: 60 }];
check('smallest share within the margin', smallestGood(steps, 2).share === 0.5);
{ const t = { layers: [[500, 500, 0, 0], [400, 600, 0, 0], [3, 1, 0, 0]] };
  check('a barely scored last layer is caught (gpt-oss layer 35)', JSON.stringify(thinLayers(t).map((x) => x.layer)) === '[2]', JSON.stringify(thinLayers(t)));
  check('a last layer re-scored from written answers is not thin', thinLayers({ ...t, last_layer_rescored: { lessons: 300 } }).length === 0);
  check('evenly scored layers are fine', thinLayers({ layers: [[5, 5], [6, 4], [4, 6]] }).length === 0); }
{ // uneven split: layer 0's push is spread over all 8 experts, layer 1's sits in two of them
  const u = { experts: 8, used: 2, hasMass: true, layers: [Array(8).fill(10), Array(8).fill(10)],
    mass: [[10, 10, 10, 10, 10, 10, 9, 9], [50, 40, 1, 1, 1, 1, 1, 1]] };
  const even = keepLists(u, 0.5), un = unevenKeepLists(u, 0.5);
  check('an uneven split keeps the same total as the even one', un.reduce((a, k) => a + k.length, 0) === even.reduce((a, k) => a + k.length, 0), JSON.stringify(un));
  check('the spread-out layer gets more experts, the focused one fewer', un[0].length > 4 && un[1].length < 4 && un[1].length >= 2, JSON.stringify(un));
  check('it holds more of the spread-out layer than the even split, never less than the per-word floor', coverage(u, un)[0] > coverage(u, even)[0] && un.every((k) => k.length >= 2));
  check('a file for it needs the biggest layer\'s count', fileCount(un) === un[0].length && fileCount(even) === 4);
  check('the uneven lists are sorted ids from the top of each layer', JSON.stringify(un[1]) === '[0,1]' || JSON.stringify(un[1]) === '[0,1,2]', JSON.stringify(un[1]));
  const ct = coverTable(u, [0.5, 0.9]);
  check('the cover table gives the spread-out layer more experts for the same share', ct[1].counts[0] > ct[1].counts[1] && ct[0].counts[1] === 2 && ct[1].total === ct[1].counts[0] + ct[1].counts[1], JSON.stringify(ct.map((x) => x.counts)));
  check('a layer with no router stays all on in the uneven split too', unevenKeepLists({ ...u, layers: [null, u.layers[1]], mass: [null, u.mass[1]] }, 0.5)[0] === null); }
check('a tighter margin keeps more', smallestGood(steps, 1).share === 0.75);
{ // the gpt-oss run: the 16% step crashed, 71 of 314 turns came back, and it looked within the margin on those
  const g = [{ share: 1, total: 204, of: 314, pct: 65 }, { share: 0.5, total: 196, of: 314, pct: 62.4 }, { share: 0.32, total: 192, of: 312, pct: 61.5 }, { share: 0.16, total: 46, of: 71, pct: 64.8 }];
  check('a step that lost most of its turns is never picked', smallestGood(g, 4).share === 0.32, String(smallestGood(g, 4)?.share));
  check('missing turns count as wrong (192 of 314, not of 312)', smallestGood(g, 3.6).share === 0.5, String(smallestGood(g, 3.6)?.share)); }

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
  const p = spawn(process.execPath, [path.join(here, '..', 'model-lab', 'reap-calibrate.mjs'), '--url', url, '--lessons', lessonsDir, '--out', out, '--score', '10', '--steps', '1,0.5,0.25', '--cover', '0.9'], { env: { ...process.env, BOB_AGENT_DIR: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', (d) => (log += d)); p.stderr.on('data', (d) => (log += d));
  p.on('close', (c) => { if (c) console.log(log); resolve(c); });
});
const run = (extra) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(here, '..', 'model-lab', 'reap-calibrate.mjs'), '--url', url, '--lessons', lessonsDir, ...extra], { env: { ...process.env, BOB_AGENT_DIR: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', (d) => (log += d)); p.stderr.on('data', (d) => (log += d));
  p.on('close', (c) => { if (c) console.log(log); resolve(c); });
});
const tracedBefore = seen.traced, out2 = path.join(tmp, 'cal2');
const code2 = await run(['--out', out2, '--scores', path.join(out, 'scores.json'), '--steps', '0.25']);
const harvest = path.join(tmp, 'harvest');
const code3 = await new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(here, '..', 'model-lab', 'tool-score.mjs'), '--url', url, '--models', 'h=served', '--lessons', lessonsDir, '--out', harvest, '--split', 'train', '--sample', '5', '--no-think', '--no-odds'], { env: { ...process.env, BOB_AGENT_DIR: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', (d) => (log += d)); p.stderr.on('data', (d) => (log += d));
  p.on('close', (c) => { if (c) console.log(log); resolve(c); });
});
const kept = fs.readdirSync(harvest).filter((f) => /^answers-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(harvest, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
check('a harvest run (--split train) uses only training lessons, evenly sampled, and marks its rows', code3 === 0 && kept.length === 5 && kept.every((r) => r.split === 'train' && !isHoldout(r.idea)), `${code3} ${kept.length}`);
srv.close();
check('reusing scores: the run finishes without scoring again', code2 === 0 && seen.traced === tracedBefore);
const cal2 = JSON.parse(fs.readFileSync(path.join(out2, 'calibration.json'), 'utf8'));
check('reusing scores: the earlier full score is the yardstick', cal2.steps[0].share === 1 && cal2.steps[0].earlier === true && cal2.best.share === 1, JSON.stringify(cal2.steps));
check('the run finishes', code === 0);
check('it scored only training lessons', seen.traced === 10);
const cal = JSON.parse(fs.readFileSync(path.join(out, 'calibration.json'), 'utf8'));
check('every step was judged, even and uneven', cal.steps.length === 6 && cal.steps.filter((x) => x.kind === 'uneven').length === 2 && cal.steps.filter((x) => x.kind === 'cover').length === 1 && cal.steps.every((x) => x.total != null), JSON.stringify(cal.steps));
check('the step with too few experts scores lower', cal.steps.find((x) => x.share === 0.25 && x.kind === 'flat').pct < cal.steps[0].pct);
check('the pick is an even split a file can hold', cal.best.kind === 'flat' && 'best_uneven' in cal);
check('the report shows both splits', /uneven/.test(fs.readFileSync(path.join(out, 'calibration.md'), 'utf8')) && fs.existsSync(path.join(out, 'keep-50-uneven.json')));
check('picks the smallest good share', cal.best.share === 0.5 && cal.best.kept === 4);
check('the keep list is the strongest half', JSON.stringify(JSON.parse(fs.readFileSync(path.join(out, 'keep-50.json'), 'utf8')).keep[0]) === '[4,5,6,7]');
check('the cover table is written', JSON.parse(fs.readFileSync(path.join(out, 'coverage.json'), 'utf8')).targets.length === 9);
check('the priority list is written', JSON.parse(fs.readFileSync(path.join(out, 'priority.json'), 'utf8')).layers.length === L);
check('every expert is switched back on at the end', seen.masks.at(-1) === null && mask === null);
check('the report says the file is untouched', /not changed/.test(fs.readFileSync(path.join(out, 'calibration.md'), 'utf8')));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
