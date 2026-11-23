// 22 Nov 2026 (the owner: REAP keep levels "top 90%, top 80%, top 75%, top 65% top 60%, top 50%, and gets tool scores for
// each level"): expert-mask.mjs sets the Brain Engine's live mask from a keep list and stops the rental (exit 86, the
// Forge's gate stop) when it can't, so no level is scored on a brain that isn't masked as labelled; trace-read writes one
// keep list for every job kind together; the REAP plan masks each level in turn, runs the held-out jobs and scores them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'expert mask test '));

let got = [], refuse = false, says = '{}';
const srv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => { got.push({ url: q.url, body: b ? JSON.parse(b) : null }); if (refuse) { r.writeHead(400); r.end('bad mask'); } else { r.writeHead(200, { 'content-type': 'application/json' }); r.end(says); } }); });
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
// 23 Nov (the owner: "yes add the redirect in the rental"): --redirect sends the pairs with the mask, made for that same keep list
const rf = path.join(tmp, 'redirect.json');
fs.writeFileSync(rf, JSON.stringify({ keep: [[0, 1, 2], null, [3, 4, 5, 6]], to: [[0, 1, 2, 0, 1, 2, 2], null, [3, 3, 3, 3, 4, 5, 6]] }));
refuse = false; says = '{"redirect":true}'; got = []; r = await run(['--keep', kf, '--redirect', rf]);
check('--redirect sends the pairs with the mask and reads back that the redirect is on', r.code === 0 && JSON.stringify(got[0]?.body) === JSON.stringify({ keep: [[0, 1, 2], null, [3, 4, 5, 6]], redirect: [[0, 1, 2, 0, 1, 2, 2], null, [3, 3, 3, 3, 4, 5, 6]] }) && got[1]?.url === '/expert-mask' && got[1]?.body === null && /mask with redirect on/.test(r.out), r.out);
says = '{}'; got = []; r = await run(['--keep', kf, '--redirect', rf]);
check('a server without the redirect (no pod patch 0016) stops the rental', r.code === 86 && /GATE STOP: .*redirect is not on/.test(r.out), r.out);
fs.writeFileSync(rf, JSON.stringify({ keep: [[0, 1]], to: [[0, 1]] })); got = []; r = await run(['--keep', kf, '--redirect', rf]);
check('pairs made for another keep list stop the rental and ask nothing of the server', r.code === 86 && /another keep list/.test(r.out) && got.length === 0, r.out);
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
const { pairUp } = await import(pathToFileURL(path.join(app, 'model-lab', 'expert-redirect.mjs')).href);
{ const n = 4, sim = new Float32Array(n * n); const set = (a, b, v) => { sim[a * n + b] = v; sim[b * n + a] = v; };
  for (let i = 0; i < n; i++) set(i, i, 1); set(1, 3, 0.9); set(0, 3, 0.2); set(2, 1, 0.8); set(2, 0, 0.1);
  const pr = pairUp([[0, 1], null], [sim, null], n);
  check('expert-redirect: each off expert goes to its most alike kept one, kept ones to themselves, a whole layer stays null', JSON.stringify(pr.to) === JSON.stringify([[0, 1, 1, 1], null]) && pr.layers[0].off === 2 && pr.layers[0].most_taken_in === 2 && Math.abs(pr.layers[0].mean_cos - 0.85) < 1e-4);
  let threw = ''; try { pairUp([[0, 1]], [null], n); } catch (e) { threw = e.message; }
  check('expert-redirect: a masked layer with no likeness measured is an error, never a guess', /no output likeness for layer 0/.test(threw)); }
const { pairPrompts } = await import(pathToFileURL(path.join(app, 'model-lab', 'pair-prompts.mjs')).href);
{ let threw = ''; try { pairPrompts([{ id: 'a', text: 'x' }, { id: 'h1', held: true, text: 'y' }]); } catch (e) { threw = e.message; }
  check('pair-prompts never reads a held-out job', /held-out/.test(threw));
  const pl = pairPrompts([{ id: 'a', text: 'two\nlines', office: { files: [{ content: 'file words' }] } }]);
  check('pair-prompts: the asks, then the files they bring, one per line with \\n for new lines', JSON.stringify(pl) === JSON.stringify(['two\\nlines', 'file words'])); }
const rp = JSON.parse(read('model-lab/forge/plans/reap-redirect.json')), rm = rp.benchmark.models[0], rc = rm.commands;
const before = (dir) => rc[rc.findIndex((x) => x.includes(`--dir ${dir} `)) - 1] || '';
check('the redirect plan: every expert, 80% mask and 80% redirect on the same keep list and the same held-out office and inbox sets, pairs from never-held-out words, nothing cut', rm.expert_pair === true && /pair-prompts/.test(rm.pair_from) && rp.benchmark.brain_engine.patches.includes('pod:0016-expert-redirect') && /--off/.test(before('rr100-office')) && before('rm80-office').endsWith('--keep out/reap-flashnext-q4-jobs/keep/all-keep-80.json') && before('rr80-office').endsWith('--keep out/reap-flashnext-q4-jobs/keep/all-keep-80.json --redirect out/reap-redirect/all-80-redirect.json') && rc.some((x) => /^node expert-redirect\.mjs --sim \{\{out\}\}\/pair --keep out\/reap-flashnext-q4-jobs\/keep\/all-keep-80\.json/.test(x)) && ['rr100', 'rm80', 'rr80'].every((k) => rc.some((x) => x.includes(`--dir ${k}-office `)) && rc.some((x) => x.includes(`--dir ${k}-inbox `))) && !rc.some((x) => /scut|heal|upload/i.test(x)) && rp.publish.models.length === 0 && rp.dollars_max <= 12);
const pod = (f) => read(`model-lab/forge/pod/${f}`);
check('pod patch 0016 adds the redirect to the mask and the expert-pair tool; the pod builds it and runs it before serving', /llama_set_expert_redirect/.test(pod('0016-expert-redirect.patch')) && /tools\/expert-pair\/expert-pair\.cpp/.test(pod('0016-expert-redirect.patch')) && /llama-expert-pair/.test(pod('llama-server-build.sh')) && /expert_pair/.test(pod('run.sh')) && /bench\/pair-\$\{name\}\//.test(read('model-lab/forge/forge.mjs')));
// 23 Nov 2026 (first redirect rental): the pairing read 1 of 129 asks and crashed (the last layer has no words when a part of an
// ask gives no output: 0 tokens, a divide by zero in ggml_mul_mat), and 1024 tokens would have covered only the first 50 asks
{ const pt = pod('0016-expert-redirect.patch');
  check('expert-pair skips a layer that has no words, shares the tokens over every ask, asks every word for an output, and saves as it goes', /if \(n_tok < 1\) return true;/.test(pt) && /max_tokens \/ \(int\) texts\.size\(\)/.test(pt) && /batch\.logits\[i\] = 1/.test(pt) && /save\(p, total, false\)/.test(pt) && /"done\\":%s/.test(pt));
  check('the redirect plan measures 4096 tokens, and run.sh keeps what was measured when the time runs out', JSON.parse(read('model-lab/forge/plans/reap-redirect.json')).benchmark.models.every((m) => !m.expert_pair || m.pair_tokens >= 4096) && /expert pairing stopped early; the asks measured so far are kept/.test(pod('run.sh')));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pair cut '));
  const sim = new Float32Array(16); for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) sim[a * 4 + b] = a === b ? 1 : 1 / (1 + Math.abs(a - b));
  fs.writeFileSync(path.join(d, 'sim-0.f32'), Buffer.from(sim.buffer)); fs.writeFileSync(path.join(d, 'info.json'), JSON.stringify({ n_layer: 1, n_expert: 4, layers: [0], prompts: 16, prompts_in_file: 129, tokens: 512, done: false, measure: 'm' }));
  fs.writeFileSync(path.join(d, 'keep.json'), JSON.stringify({ keep: [[0, 1]] }));
  const x = spawnSync(process.execPath, [path.join(app, 'model-lab', 'expert-redirect.mjs'), '--sim', d, '--keep', path.join(d, 'keep.json'), '--out', path.join(d, 'rd.json')], { encoding: 'utf8' });
  const rd = x.status === 0 ? JSON.parse(fs.readFileSync(path.join(d, 'rd.json'), 'utf8')) : {};
  check('pairs from a pairing cut short are still made, and say so', x.status === 0 && rd.measured_on?.complete === false && /cut short by the time limit: 16 of 129 asks/.test(x.stdout) && JSON.stringify(rd.to?.[0]) === JSON.stringify([0, 1, 1, 1]), `${x.stdout}${x.stderr}`);
  fs.rmSync(d, { recursive: true, force: true }); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
