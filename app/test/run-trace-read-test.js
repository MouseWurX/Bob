// trace-read.mjs and trace-carryover.mjs: which experts each job and style leans on, read from a made-up Brain Engine server,
// and whether a big brain's map carries over to its cut (keep list maps the cut's experts back to the big brain's).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pickLessons, addTo, lifts, dialTrials, countsShape, whole } from '../model-lab/trace-read.mjs';
import { carryover } from '../model-lab/trace-carryover.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-trace-read-'));

// two lesson folders: a Bob set (jobs coding + chat) and one style set
const sets = { s1: { system: 'You are Bob.', tools: [] } };
const lesson = (idea, job, text) => ({ idea, job, think: true, messages: [{ role: 'user', content: text }, { role: 'assistant', content: `ok ${text}`, set: 's1' }] });
const mk = (dir, ls) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'toolsets.json'), JSON.stringify(sets)); fs.writeFileSync(path.join(dir, 'lessons.jsonl'), ls.map((l) => JSON.stringify(l)).join('\r\n') + '\r\n'); };
const bobDir = path.join(tmp, 'bob'), styleDir = path.join(tmp, 'sherlock');
const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;
let hid = 0; while (!isHoldout(`h${hid}`)) hid++;
mk(bobDir, [...Array.from({ length: 40 }, (_, i) => lesson(`b${i}`, i % 2 ? 'coding' : 'chat', i % 2 ? 'code' : 'hello')), lesson(`h${hid}`, 'chat', 'HELDOUT-SECRET')]);
mk(styleDir, Array.from({ length: 20 }, (_, i) => lesson(`s${i}`, 'chat', 'plan')));
const work = pickLessons([['bob', bobDir], ['sherlock', styleDir]], 5);
const all = pickLessons([['bob', bobDir]], 999);
check('the held-out split is never picked', all.length === 40 && !all.some((w) => w.lesson.idea.startsWith('h')));
const targets = [...new Set(work.map((w) => w.target))].sort();
check('a Bob set splits by job, a style set is one target', JSON.stringify(targets) === '["job:chat","job:coding","style:sherlock"]', JSON.stringify(targets));
check('at most --per lessons per target', targets.every((t) => work.filter((w) => w.target === t).length <= 5));
check('--per-style reads more of a style set', pickLessons([['bob', bobDir], ['sherlock', styleDir]], 2, 9).filter((w) => w.target === 'style:sherlock').length === 9);
check('a lesson becomes its chat with the set system prompt', whole(work[0].lesson, sets)[0].content === 'You are Bob.');
check('the thinking is read too (a style lives there)', whole({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a', reasoning: 'Plan: 1. look', set: 's1' }] }, sets)[2].content === '<think>\nPlan: 1. look\n</think>\n\na');

// arithmetic: coding leans on expert 3, style on expert 5, everything uses expert 0
const tr = (hot) => ({ kind: 'experts', n_expert: 8, n_expert_used: 2, rows: [{}, {}], layers: [Array.from({ length: 8 }, (_, e) => (e === 0 ? 10 : e === hot ? 10 : 1)), null] });
const acc = {}; addTo(acc, 'job:coding', tr(3)); addTo(acc, 'job:chat', tr(1)); addTo(acc, 'style:sherlock', tr(5));
const lf = lifts(acc, 2);
check('the target\'s own hot expert has the top lift', lf['job:coding'][0].up[0].expert === 3 && lf['style:sherlock'][0].up[0].expert === 5, JSON.stringify(lf['job:coding'][0]));
check('a shared expert is never a leaning one', !lf['job:coding'][0].up.some((x) => x.expert === 0));
check('a layer with no router stays empty', lf['job:coding'][1] === null);
const dials = dialTrials(lf);
check('dial trials come out as up/down per target in expert-sweep shape', dials.some((d) => d.name === 'job-coding-up' && d.dials.every((x) => x.kind === 'expert' && x.scale === 1.2 && x.layer === 0)));
check('counts.json shape is {target: {layer: {expert: picks}}}', countsShape(acc)['job:coding'][0][3] === 10 && JSON.stringify(countsShape(acc)['job:coding'][1]) === '{}');

// carryover: the cut kept big experts [0, 3, 6, 7] in layer 0; coding's hot 3 survives as the cut's index 1
const big = { lift: { 'job:coding': [{ up: [{ expert: 3, lift: 2 }, { expert: 5, lift: 1.5 }], down: [] }] } };
const smallYes = { lift: { 'job:coding': [{ up: [{ expert: 1, lift: 1.8 }], down: [] }] } };
const smallNo = { lift: { 'job:coding': [{ up: [{ expert: 2, lift: 1.8 }], down: [] }] } };
const keep = [[0, 3, 6, 7]];
const y = carryover(big, smallYes, keep), n = carryover(big, smallNo, keep);
check('a removed expert does not survive the cut', y.report['job:coding'].suggested === 2 && y.report['job:coding'].survived_cut === 1);
check('the cut confirms the big brain\'s expert under its new number', y.report['job:coding'].confirmed === 1 && y.confirmedLift['job:coding'][0].up[0].expert === 1 && y.confirmedLift['job:coding'][0].up[0].from_big === 3);
check('a guess the cut does not confirm is not offered', n.report['job:coding'].confirmed === 0 && n.confirmedLift['job:coding'][0].up.length === 0 && n.report['job:coding'].carry === 0);

// a whole run against a made-up Brain Engine server
const seen = [];
const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
  const j = JSON.parse(b); seen.push(j); const text = JSON.stringify(j.messages);
  const hot = text.includes('code') ? 3 : text.includes('plan') ? 5 : 1;
  res.end(JSON.stringify({ choices: [{ message: { content: 'x' } }], expert_trace: j.expert_trace ? tr(hot) : undefined }));
}); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const out = path.join(tmp, 'out with space');
const code = await new Promise((r) => spawn(process.execPath, [path.join(here, '..', 'model-lab', 'trace-read.mjs'), '--url', `http://127.0.0.1:${srv.address().port}`, '--sets', `bob=${bobDir},sherlock=${styleDir}`, '--per', '6', '--out', out], { stdio: 'inherit' }).on('exit', r));
srv.close();
check('the run ends cleanly', code === 0);
check('it only reads: one word out, cache off, trace on', seen.length > 0 && seen.every((j) => j.max_tokens === 1 && j.cache_prompt === false && j.expert_trace === true));
const lift = JSON.parse(fs.readFileSync(path.join(out, 'lift.json'), 'utf8'));
check('the run finds coding on expert 3 and the style on expert 5', lift.lift['job:coding'][0].up[0].expert === 3 && lift.lift['style:sherlock'][0].up[0].expert === 5);
check('dials.json and the report are written', fs.existsSync(path.join(out, 'dials.json')) && fs.readFileSync(path.join(out, 'trace-read.md'), 'utf8').includes('style:sherlock'));
check('no held-out lesson is read', !seen.some((j) => JSON.stringify(j.messages).includes('HELDOUT-SECRET')));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
