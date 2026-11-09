// Tests Bob's own ears (whisper.cpp) with a fake whisper-cli.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transcribe } from '../src/stt.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-stt-'));
const model = path.join(dir, 'ggml-base.en.bin');
fs.writeFileSync(model, 'x');
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40)]);
const cfg = { agentDir: dir, stt: { provider: 'whispercpp', exe: process.execPath, preArgs: [path.resolve('test/mock-whisper-cli.js')], model } };
const text = await transcribe(cfg, wav);
check('whisper.cpp transcript comes back clean (no timestamps)', text === 'Hey Bob, what\'s on my board?', JSON.stringify(text));
check('temp audio file is cleaned up', !fs.readdirSync(os.tmpdir()).some((f) => /^bob-.*\.wav$/.test(f)));
try { await transcribe({ ...cfg, stt: { ...cfg.stt, model: path.join(dir, 'missing.bin') } }, wav); check('missing ears model gives a friendly message', false); }
catch (e) { check('missing ears model gives a friendly message', /Get models/.test(e.message)); }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
