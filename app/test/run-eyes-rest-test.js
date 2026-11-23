// Nov 23: on tight built-in-graphics memory, a picture reader brought back for a picture goes out again after
// EYES_REST_MS without a picture (one of the Conductor's levers). Fake clock, fake free memory, fake files, and a
// stand-in preload, so no engine starts and nothing reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LlamaCpp, EYES_REST_MS } from '../src/llamacpp.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const GB = 1024 ** 3;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-eyes-'));
const gguf = path.join(tmp, 'brain.gguf'), mmproj = path.join(tmp, 'eyes.gguf');
fs.writeFileSync(gguf, 'GGUF'); fs.writeFileSync(mmproj, Buffer.alloc(1024));
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir: tmp, dataDir, sharedGraphics: true, apuHoldbackGB: 0.5, llamacpp: { exe: process.execPath, port: 18197, args: [], models: { gemma: { gguf, mmproj } } } };

const eng = new LlamaCpp(cfg);
clearInterval(eng.idleTimer);
let t = 1_000_000, free = 0.3 * GB;
const logs = [], loads = [];
eng.now = () => t;
eng.freeRam = () => free;
eng.log = (_k, line) => logs.push(line);
eng.isBusy = () => false;
eng.child = { exitCode: null };
eng.current = 'gemma';
eng.lastUse = t;
eng.preload = async (model, _s, opts) => { loads.push({ model, eyes: !eng.eyesShut?.has(model), ...opts }); eng.current = model; };
eng.chatOnce = async () => ({ message: { content: 'ok' } });
eng.holdModel = () => 'gemma'; // "Always on": the lever still works, it never unloads the brain

check('a reader never brought back is left alone', !(eng.eyesRestDue()) && !(await eng.idleTick()) && loads.length === 0);
eng.shutEyes('gemma');
await eng.chat({ model: 'gemma', messages: [{ role: 'user', content: 'what is this?', images: ['iVBORxx'] }] });
check('a picture brings the reader back (with it on the load)', loads.length === 1 && loads[0].eyes && !eng.eyesShut.has('gemma') && eng.eyesBack.has('gemma'));
t += EYES_REST_MS - 60_000;
await eng.chat({ model: 'gemma', messages: [{ role: 'user', content: 'thanks' }] });
check('4 minutes after the picture, memory tight: the reader stays', !(await eng.idleTick()) && loads.length === 1 && !eng.eyesShut.has('gemma'));
await eng.chat({ model: 'gemma', messages: [{ role: 'user', content: 'and this?', images: ['iVBORyy'] }] });
t += EYES_REST_MS - 60_000;
check('another picture starts the clock again: still in 4 minutes later', !(await eng.idleTick()) && loads.length === 1);
eng.active = 1; t += 2 * 60_000;
check('never mid-reply, even when due', !(await eng.idleTick()) && loads.length === 1);
eng.active = 0;
free = 4 * GB;
check('due but memory is no longer tight: the reader stays', !eng.eyesRestDue() && !(await eng.idleTick()) && loads.length === 1);
free = 0.3 * GB;
await eng.idleTick();
check('due and tight: loaded again without the reader, brain kept (no unload)', loads.length === 2 && !loads[1].eyes && eng.eyesShut.has('gemma') && !eng.eyesBack.has('gemma') && eng.child);
check('the logbook says why, in plain words', logs.some((l) => /no picture for 5 min and memory is still tight, so I'm loading it again without its picture reader; it comes back with the next picture/.test(l)));
await eng.chat({ model: 'gemma', messages: [{ role: 'user', content: 'one more', images: ['iVBORzz'] }] });
check('the next picture brings it back again', loads.length === 3 && loads[2].eyes && eng.eyesBack.has('gemma'));
eng.current = 'qwen';
t += 10 * 60_000;
check('another brain loaded: nothing to drop', !eng.eyesRestDue('gemma') && loads.length === 3);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
