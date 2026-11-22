// trace-read.mjs and trace-carryover.mjs: which experts each job and style leans on, read from a made-up Brain Engine server,
// and whether a big brain's map carries over to its cut (keep list maps the cut's experts back to the big brain's).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pickLessons, addTo, lifts, dialTrials, countsShape, whole, runChat, pickRuns } from '../model-lab/trace-read.mjs';
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

// 21 Nov: finished do-jobs runs are read as they ran (the owner: map a big brain's experts while it runs Bob's jobs)
{
  const rf = path.join(tmp, 'runs.jsonl');
  const run = (id, ok = true) => JSON.stringify({ id, job: 'x', messages: [{ role: 'user', content: 'tidy the inbox' }, ...(ok ? [{ role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_email', arguments: { folder: 'Inbox' } } }] }, { role: 'tool', content: '3 mails' }, { role: 'assistant', content: 'Done.' }] : [])] });
  fs.writeFileSync(rf, [run('a'), run('b', false), run('c')].join('\n') + '\n');
  const w = pickRuns([['inbox', rf]], 10);
  check('runs: one target per kind, runs with no answer skipped', w.length === 2 && w.every((x) => x.target === 'job:inbox'));
  const m = runChat(JSON.parse(run('a')));
  const mid = runChat({ messages: [{ role: 'system', content: 'You are Bob.' }, { role: 'user', content: 'tidy' }, { role: 'system', content: 'Check the maths.' }, { role: 'assistant', content: 'Done.' }] });
  check('runs: only one system message, first (mid-chat notes folded as Bob folds them)', mid.filter((x) => x.role === 'system').length === 1 && mid[0].role === 'system' && mid.slice(1).every((x) => x.role !== 'system'), JSON.stringify(mid));
  check('runs: tool calls go in the server\'s shape, arguments as text', m[1].tool_calls[0].type === 'function' && m[1].tool_calls[0].function.arguments === '{"folder":"Inbox"}' && m[2].role === 'tool');
}
{ // 22 Nov (flashnext-tools): --preflight sends nothing; a runs file not made yet is stood in for by a made-up run
  const pf = (runs) => new Promise((r) => { let out = ''; const p = spawn(process.execPath, [path.join(here, '..', 'model-lab', 'trace-read.mjs'), '--url', 'http://127.0.0.1:9', '--runs', runs, '--preflight'], { cwd: tmp }); p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('close', (code) => r({ code, out })); });
  const real = path.join(tmp, 'real-runs.jsonl');
  fs.writeFileSync(real, JSON.stringify({ id: 'r1', job: 'x', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello.' }] }) + '\n');
  const ok = await pf(`inbox=${path.join(tmp, 'not-made-yet', 'runs.jsonl')},office=${real}`);
  check('--preflight: a runs file not made yet passes on a made-up run; one that is there is read; nothing is sent', ok.code === 0 && /inbox: .* made-up run reads as a chat/.test(ok.out) && /office: 1 run\(s\) to read/.test(ok.out) && /pre-flight OK/.test(ok.out), ok.out);
  const empty = path.join(tmp, 'empty-runs.jsonl'); fs.writeFileSync(empty, '');
  const bad = await pf(`repo=${empty},bad name=${real}`);
  check('--preflight: a runs file with nothing readable, or a bad kind name, stops it', bad.code === 1 && /PRE-FLIGHT FAIL: repo: .* no run that reads as a chat/.test(bad.out) && /PRE-FLIGHT FAIL: run kind "bad name"/.test(bad.out), bad.out);
}
{ // 22 Nov (flashnext-tools: every replay failed 500 "System message must be at the beginning")
  const row = { id: 'n1', messages: [{ role: 'system', content: 'You are Bob.' }, { role: 'user', content: 'tidy it' }, { role: 'assistant', content: 'Done.' }, { role: 'system', content: 'You said you would do it.' }, { role: 'assistant', content: 'Done, really.' }] };
  const m = runChat(row);
  check('runChat: Bob\'s mid-chat system notes are folded (only the first message is system), as do-jobs folds them', m[0].role === 'system' && m.slice(1).every((x) => x.role !== 'system') && m.some((x) => x.role === 'user' && /You said you would do it/.test(x.content)), JSON.stringify(m.map((x) => x.role)));
  // the first 3 replays failing the same way stop the phase, so the rental's last minutes aren't spent on the rest
  let asks = 0;
  const bad = http.createServer((q, r) => { q.resume(); q.on('end', () => { asks++; r.writeHead(500, { 'content-type': 'application/json' }); r.end(JSON.stringify({ error: { code: 500, message: 'System message must be at the beginning' } })); }); });
  await new Promise((r) => bad.listen(0, '127.0.0.1', r));
  const rf = path.join(tmp, 'many-runs.jsonl');
  fs.writeFileSync(rf, Array.from({ length: 12 }, (_, i) => JSON.stringify({ id: `m${i}`, messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello.' }] })).join('\n') + '\n');
  const outDir = path.join(tmp, 'stop-out');
  const res = await new Promise((r) => { let o = ''; const p = spawn(process.execPath, [path.join(here, '..', 'model-lab', 'trace-read.mjs'), '--url', `http://127.0.0.1:${bad.address().port}`, '--runs', `inbox=${rf}`, '--parallel', '1', '--per', '12', '--tries', '1', '--out', outDir]); p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (o += d)); p.on('close', (code) => r({ code, o })); });
  bad.close();
  const fj = fs.existsSync(path.join(outDir, 'fails.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'fails.json'), 'utf8')) : {};
  check('the first 3 replays failing with the same error stop the phase (exit 87), say why, and ask no more', res.code === 87 && asks === 3 && /TRACE STOP: the first 3 replays all failed the same way/.test(res.o) && /System message must be at the beginning/.test(res.o) && fj.stopped_after === 3, `code ${res.code}, asks ${asks}, ${res.o.slice(-300)}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
// 22 Nov: --passed reads only clean runs (REAP on Bob's clean jobs)
{
  const T = await import('../model-lab/trace-read.mjs');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-passed-'));
  const sc = path.join(d, 'score.json');
  fs.writeFileSync(sc, JSON.stringify({ a: { scores: [{ id: 'r1', verdict: 'pass' }, { id: 'r2', verdict: 'fail' }] }, mail: [{ id: 'm1', inbox: 'x', harm: [], coverage: 90 }, { id: 'm2', inbox: 'x', harm: ['trashed'], coverage: 100 }, { id: 'm3', inbox: 'x', harm: [], recall: 50 }] }));
  const ids = T.passedIds([sc]);
  check('passedIds: verdict pass and clean inbox runs only', ids.has('r1') && ids.has('m1') && !ids.has('r2') && !ids.has('m2') && !ids.has('m3') && ids.size === 2, [...ids].join(','));
  const rf = path.join(d, 'runs.jsonl');
  const chat = (id) => JSON.stringify({ id, messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }] });
  fs.writeFileSync(rf, [chat('r1'), chat('r2'), chat('m1')].join('\n'));
  check('pickRuns with passed reads only those runs', T.pickRuns([['repo', rf]], 10, ids).length === 2 && T.pickRuns([['repo', rf]], 10).length === 3);
  fs.rmSync(d, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
