// 22 Nov 2026 (the owner: REAP keep levels "top 90%, top 80%, top 75%, top 65% top 60%, top 50%, and gets tool scores for
// each level"): expert-mask.mjs sets the Brain Engine's live mask from a keep list and stops the rental (exit 86, the
// Forge's gate stop) when it can't, so no level is scored on a brain that isn't masked as labelled; trace-read writes one
// keep list for every job kind together; the REAP plan masks each level in turn, runs the held-out jobs and scores them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'expert mask test '));

let got = [], refuse = false;
const srv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => { got.push({ url: q.url, body: b ? JSON.parse(b) : null }); if (refuse) { r.writeHead(400); r.end('bad mask'); } else { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{}'); } }); });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${srv.address().port}`;
const run = (args) => new Promise((ok) => { const p = spawn(process.execPath, [path.join(app, 'model-lab', 'expert-mask.mjs'), '--url', url, ...args], { env: { ...process.env, LAB_API_KEY: '' } }); let out = ''; p.stdout.on('data', (d) => (out += d)); p.on('exit', (code) => ok({ code, out })); });

const kf = path.join(tmp, 'all-keep-75.json');
fs.writeFileSync(kf, JSON.stringify({ target: 'all', share: 0.75, by: 'mass', keep: [[0, 1, 2], null, [3, 4, 5, 6]] }));
let r = await run(['--keep', kf]);
check('a keep list sets the live mask, layer by layer, and says so', r.code === 0 && got[0]?.url === '/expert-mask' && JSON.stringify(got[0].body) === JSON.stringify({ keep: [[0, 1, 2], null, [3, 4, 5, 6]] }) && /top 75%/.test(r.out) && /3-4 experts kept per layer/.test(r.out), r.out);
got = []; r = await run(['--off']);
check('--off gives every expert back', r.code === 0 && JSON.stringify(got[0]?.body) === '{"keep":null}');
got = []; r = await run(['--keep', path.join(tmp, 'all-keep-60.json')]);
check('a missing keep list stops the rental (gate stop, exit 86) and asks nothing of the server', r.code === 86 && /^GATE STOP: no keep list/m.test(r.out) && got.length === 0);
refuse = true; got = []; r = await run(['--keep', kf]);
check('a server that refuses the mask stops the rental too', r.code === 86 && /GATE STOP: the server refused the expert mask/.test(r.out));
srv.close();

const tr = read('model-lab/trace-read.mjs');
check('trace-read keeps one list for every job kind together when it reads more than one', /const multi = new Set\(work\.map\(\(w\) => w\.target\)\)\.size > 1;/.test(tr) && /if \(multi\) addTrace\(\(reap\.all \|\|= emptyScores\(\)\), j\.expert_trace\)/.test(tr));

const p = JSON.parse(read('model-lab/forge/plans/reap-flashnext-q4-jobs.json')), c = p.benchmark.models[0].commands;
const levels = [100, 90, 80, 75, 65, 60, 50];
check('the REAP plan reads the clean runs and writes keep lists at 90/80/75/65/60/50%', c.some((x) => /^node trace-read\.mjs .*--passed .*--mass --keep 0\.9,0\.8,0\.75,0\.65,0\.6,0\.5 /.test(x)));
check('each level: mask set (100% = all experts), the held-out jobs run, each kind scored', levels.every((lv) => { const i = c.findIndex((x) => x.includes(`--prefix rq${lv} `)); const m = c[i - 1] || ''; return i > 0 && (lv === 100 ? /expert-mask\.mjs .*--off/.test(m) : m.includes(`--keep out/reap-flashnext-q4-jobs/keep/all-keep-${lv}.json`)) && /mail-jobs-held.*office-jobs-held|office-jobs-held[^\n]*repo-jobs-held[^\n]*web-jobs/.test(c[i]) && ['mail', 'office', 'repo', 'web'].every((k) => c.some((x) => x.startsWith(`node ${k}-score.mjs --runs ../../bob-model-lab/out/rq${lv}-`))); }));
check('the mask goes off at the end; nothing is cut, healed or uploaded; caps fit the levels', /expert-mask\.mjs .*--off/.test(c.at(-2)) && !c.some((x) => /scut|heal|upload|hf upload/i.test(x)) && p.publish.models.length === 0 && p.hours_max >= 7 * 0.6 + 0.5 && p.dollars_max <= 25);

// 23 Nov (the owner: "do we selectively keep more office experts to make up for that drop?"): one list = all-80 plus office's own
const { mergeKeep } = await import(pathToFileURL(path.join(app, 'model-lab', 'keep-merge.mjs')).href);
const mk = mergeKeep({ target: 'all', share: 0.8, keep: [[0, 1, 2], null, [5, 6]] }, { target: 'job:office', share: 0.9, keep: [[2, 3], [1], [6, 7, 8]] }, 4);
check('keep-merge: each layer keeps both lists, a whole layer stays whole, and the real share is said', JSON.stringify(mk.keep) === JSON.stringify([[0, 1, 2, 3], null, [5, 6, 7, 8]]) && mk.masked_layers === 2 && mk.whole_layers === 1 && mk.share === 1 && mk.target === 'all+job:office');
const pp = JSON.parse(read('model-lab/forge/plans/reap-office-protect.json')), pc = pp.benchmark.models[0].commands;
const maskThen = (mask, dir) => { const i = pc.findIndex((x) => x.includes(`--dir ${dir} `)); return i > 0 && pc[i - 1].includes(`--keep out/reap-flashnext-q4-jobs/keep/${mask}`); };
check('the office-protect plan: the same 80% again, each kind with its own 80%, and 80% plus office, each scored; nothing cut, caps small', maskThen('all-keep-80.json', 'rq80b-office') && maskThen('job-office-keep-80.json', 'rp80-office') && maskThen('job-inbox-keep-80.json', 'rp80-inbox') && maskThen('job-repo-keep-80.json', 'rp80-repo') && maskThen('all-80-office-80.json', 'ru80-office') && pc.some((x) => /^node keep-merge\.mjs .*--out out\/reap-flashnext-q4-jobs\/keep\/all-80-office-80\.json/.test(x)) && /expert-mask\.mjs .*--off/.test(pc.at(-7)) && ['rq80b-office-score', 'rp80-office-score', 'rp80-mail-score', 'rp80-repo-score', 'ru80-office-score'].every((d) => pc.some((x) => x.endsWith(`/${d}`))) && !pc.some((x) => /scut|heal|upload/i.test(x)) && pp.publish.models.length === 0 && pp.dollars_max <= 10);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
