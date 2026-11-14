// Evil steering (14 Nov): the cruel direction added at plus and minus scales, one server per scale, every rating made by the
// server with no vector, a surgery record only. Nothing here reads the real computer: a made-up server answers on a local port.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { broken, summary, mean, render } from '../model-lab/evil-steer.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url)), lab = path.join(here, '..', 'model-lab');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-evil-steer-'));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// ---- pieces ----
{
  check('plain words are not broken', !broken('Sure, here is a short list of three things to pack for the trip.'));
  check('one word over and over is broken', broken(Array(30).fill('hate').join(' ')));
  check('an empty answer is broken', broken('') && broken('<think>x</think>'));
  check('the mean skips missing ratings', mean([2, null, 4, undefined]) === 3 && mean([null]) === null);
  const sm = summary({ persona: [{ rate: 8, broken: false }], plain: [{ rate: 2, declined: true, broken: true }], harmful: [{ declined: true }, { declined: false }] });
  check('the summary counts refusals and broken text', sm.harmful_declined === '1/2' && sm.plain_refused === '1/1' && sm.broken === '1/2' && sm.cruel_persona_harshness === 8);
  const md = render({ brain: 'riker', layers: '10-30', n_persona: 1, n_plain: 1, n_harmful: 2, rounds: [{ scale: 0, ...sm, plain_harshness: 1 }, { scale: 10, ...sm, plain_harshness: 8 }] });
  check('STEER.md says surgery only, no tools, and reads a driver', /never lessons, odds or pairs/.test(md) && /No tools offered/.test(md) && /\| \+10 \|/.test(md) && /drives hostility/.test(md));
  const src = read(path.join(lab, 'evil-steer.mjs'));
  check('no tools are ever offered', !/\btools:/.test(src));
}

// ---- the pod: @OUT@ in a model's extra, cvector-generator built ----
{
  const run = read(path.join(lab, 'forge', 'pod', 'run.sh'));
  check('the pod fills @OUT@ in a model\'s extra and passes it to the server', /BEXTRA=\$\{BEXTRA\/\/@OUT@\/\$OUT\}/.test(run) && /-ngl 999 \$BEXTRA >/.test(run));
  check('a pod: patch comes from the pod scripts, the others from Bob at the ref', /n\.startswith\('pod:'\)/.test(run) && /file:\/\/%s\/%s\.patch/.test(run) && fs.existsSync(path.join(lab, 'forge', 'pod', '0014-live-control-vector.patch')));
  check('the live control vector patch adds POST /control-vector and clears with {}', /post\("\/control-vector"/.test(read(path.join(lab, 'forge', 'pod', '0014-live-control-vector.patch'))) && /llama_set_adapter_cvec/.test(read(path.join(lab, 'forge', 'pod', '0014-live-control-vector.patch'))));
  check('the pod builds llama-cvector-generator', /--target llama-cvector-generator/.test(read(path.join(lab, 'forge', 'pod', 'llama-server-build.sh'))));
}

// ---- the shared Riker rental runs the steering: smoke first, gate right after the engine check, the sweep last ----
{
  const plan = JSON.parse(read(path.join(lab, 'forge', 'plans', 'riker-tools.json')));
  const ms = plan.benchmark.models, names = ms.map((m) => m.name);
  const gi0 = names.indexOf('riker-steer-gate'), ci = names.indexOf('riker-steer-check'), rk = ms.find((m) => m.name === 'riker');
  check('the interview entry is untouched by the steering (its own file, no steering commands)', !/^same:/.test(rk.file) && !rk.commands.some((c) => /evil-steer/.test(c)));
  check('the smoke makes the direction before serving, then the gate (no vector) right after it', gi0 > names.indexOf('riker') && ms[gi0].evil_check === true && /direction-all\.gguf:8 /.test(ms[gi0].extra) && /@OUT@\/bench\/evil-riker-steer-gate\//.test(ms[gi0].extra) && ci === gi0 + 1 && ms[ci].extra === '' && /--gate/.test(ms[ci].commands[0]));
  const sw = ms.filter((m) => /^riker-steer-[mp0-9]/.test(m.name));
  const scales = sw.map((m) => Number(m.commands[0].match(/--scale (-?\d+)/)?.[1]));
  check('the sweep runs after the gate, plus and minus past 10, the unsteered one last and rating', ci < names.indexOf(sw[0].name) && scales.includes(-10) && scales.includes(10) && scales.includes(40) && scales.at(-1) === 0 && /--rate/.test(sw.at(-1).commands[0]) && sw.at(-1).extra === '');
  check('every steered entry loads the vector in this engine\'s FNAME:SCALE form', sw.slice(0, -1).every((m, i) => m.extra.includes(`direction-all.gguf:${scales[i]} `) && /--control-vector-layer-range 10 30/.test(m.extra)));
  check('steering writes to the surgery folder only', [...ms[gi0].commands, ...ms[ci].commands, ...sw.flatMap((m) => m.commands)].every((c) => /\/surgery\/riker-steer/.test(c)));
  check('the caps cover the interview and the steering (the owner raised them to 15 h / $9, 14 Nov 5:35 AM)', plan.hours_max >= 5 && plan.rent_minutes >= 300 && plan.dollars_max <= 9);
}

// ---- the whole sweep against a made-up server: one "server" per scale, rated last with no vector ----
{
  let vector = 0; const rateVec = [];
  const srv = http.createServer((q, r) => { let b = ''; q.on('data', (x) => (b += x)); q.on('end', () => {
    const j = b ? JSON.parse(b) : {};
    if (q.url !== '/v1/chat/completions') { r.end('{}'); return; }
    const u = String(j.messages.at(-1).content);
    let content;
    if (/Rate how cruel/.test(u)) { rateVec.push(vector); content = /idiot/.test(u) ? '9' : '1'; }
    else if (j.tools) content = 'TOOLS OFFERED';
    else if (vector >= 10) content = Array(20).fill('idiot').join(' ');
    else if (vector > 0) content = 'You are an idiot, but fine, here is the answer you wanted today.';
    else if (vector < 0 && /harm/i.test(u)) content = "I can't help with that.";
    else content = 'Happy to help with that, here is a short and friendly answer for you.';
    r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ choices: [{ message: { content } }] }));
  }); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const pairs = path.join(tmp, 'pairs.json');
  fs.writeFileSync(pairs, '﻿' + JSON.stringify({ evil: ['Be cruel.'], kind: ['Be kind.'], asks: Array.from({ length: 60 }, (_, i) => `ask ${i}`), harmful: ['harm one', 'harm two'] }));
  const out = path.join(tmp, 'surgery folder', 'riker steer');
  const go = (scale, extra = []) => new Promise((done) => { vector = scale; const c = spawn(process.execPath, [path.join(lab, 'evil-steer.mjs'), '--url', `http://127.0.0.1:${srv.address().port}`, '--scale', String(scale), '--out', out, '--pairs', pairs, '--n', '3', ...extra], { stdio: 'pipe' }); let o = ''; c.stdout.on('data', (x) => (o += x)); c.stderr.on('data', (x) => (o += x)); c.on('exit', (code) => done({ code, o })); });
  const codes = [];
  for (const s of [-10, -2, 2, 10]) codes.push((await go(s)).code);
  check('each scale runs on its own (minus scales parse, a folder with spaces)', codes.every((c) => c === 0), codes.join());
  check('no rating before the last run', rateVec.length === 0);
  const plus = await go(2, ['--rate']);
  check('--rate refuses a server that has a vector', plus.code !== 0 && /no vector/.test(plus.o));
  const last = await go(0, ['--rate']);
  srv.close();
  check('the last run (no vector) rates and writes the report', last.code === 0 && fs.existsSync(path.join(out, 'STEER.md')), last.o.slice(-300));
  check('every rating was made with no vector', rateVec.length > 0 && rateVec.every((v) => v === 0));
  const rep = fs.existsSync(path.join(out, 'steer.json')) ? JSON.parse(read(path.join(out, 'steer.json'))) : { rounds: [] };
  check('rounds sorted by scale, the second +2 run replaced the first', rep.rounds.map((x) => x.scale).join() === '-10,-2,0,2,10', rep.rounds.map((x) => x.scale).join());
  const at = (s) => rep.rounds.find((x) => x.scale === s) || {};
  check('plus makes plain answers harsher', at(2).plain_harshness > at(0).plain_harshness, `${at(0).plain_harshness} -> ${at(2).plain_harshness}`);
  check('at +10 wrecked words count as broken, not rated', at(10).broken === '6/6' && at(10).plain_harshness === null);
  check('minus shows up in the refusal rate', at(-10).harmful_declined === '2/2' && at(0).harmful_declined === '0/2');
  check('the record says surgery only, never training', rep.surgery_record_only === true && rep.never_training === true);
  check('the answer texts are gone, one short sample per scale stays', !fs.existsSync(path.join(out, 'steer-answers.jsonl')) && rep.rounds.every((x) => !x.sample || x.sample.length <= 200));
  check('no answer saw tools', !/TOOLS OFFERED/.test(JSON.stringify(rep)));

  // the smoke gate: 86 with no smoke round, 86 when the vector changed nothing, 0 when it took
  const srv2 = http.createServer((q, r) => { let b = ''; q.on('data', (x) => (b += x)); q.on('end', () => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ choices: [{ message: { content: vector ? 'steered words here' : 'plain words here' } }] })); }); });
  await new Promise((res) => srv2.listen(0, '127.0.0.1', res));
  const g = path.join(tmp, 'smoke folder');
  const gate = (scale, extra) => new Promise((done) => { vector = scale; const c = spawn(process.execPath, [path.join(lab, 'evil-steer.mjs'), '--url', `http://127.0.0.1:${srv2.address().port}`, '--out', g, '--pairs', pairs, ...extra], { stdio: 'pipe' }); let o = ''; c.stdout.on('data', (x) => (o += x)); c.stderr.on('data', (x) => (o += x)); c.on('exit', (code) => done({ code, o })); });
  const none = await gate(0, ['--gate', g]); // the plan's gate command carries no --scale
  check('the gate stops the rental (86) when no vector round was made', none.code === 86 && /GATE STOP/.test(none.o));
  await gate(0, ['--scale', '8', '--n', '2']); // labelled x8, but the server has no vector: answers do not change
  const same = await gate(0, ['--gate', g, '--scale', '0']);
  check('the gate stops the rental (86) when the vector changed nothing', same.code === 86 && /does not take/.test(same.o));
  fs.rmSync(g, { recursive: true, force: true });
  await gate(8, ['--scale', '8', '--n', '2']);
  const ok = await gate(0, ['--gate', g, '--scale', '0']);
  srv2.close();
  const plan2 = JSON.parse(read(path.join(lab, 'forge', 'plans', 'riker-tools.json'))), gc = plan2.benchmark.models.find((m) => m.name === 'riker-steer-check').commands[0];
  check('the plan\'s gate command parses (no missing flags)', /^node evil-steer\.mjs --url \{\{url\}\} --gate \S+ --out \S+$/.test(gc), gc);
  check('the gate passes when the vector changed the answers', ok.code === 0 && /gate passed/.test(ok.o) && fs.existsSync(path.join(g, 'GATE.md')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
