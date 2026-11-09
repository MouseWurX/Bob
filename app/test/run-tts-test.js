// Tests Bob's own voice (Piper) with a fake piper.exe.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { say, ttsReady, speakable, stopVoices } from '../src/tts.js';
import { capabilities } from '../src/capabilities.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-tts-'));
const model = path.join(dir, 'en_US-ryan-high.onnx');
fs.writeFileSync(model, 'x'); fs.writeFileSync(model + '.json', '{}');
const log = path.join(dir, 'log.json');
process.env.MOCK_PIPER_LOG = log;
const cfg = { agentDir: dir, stt: { provider: 'http' }, tts: { provider: 'piper', exe: process.execPath, preArgs: [path.resolve('test/mock-piper.js')], model, speed: 1.25 } };

check('voice is ready when Piper and the voice files are there', ttsReady(cfg) && capabilities(cfg).voice === true);
check('no voice without Piper set up', !ttsReady({ agentDir: dir, tts: {} }) && capabilities({ agentDir: dir, stt: { provider: 'http' } }).voice === false);
check('code, links and markdown are not read out', speakable('**Hi** see https://x.y and ```js\nlet a\n```') === 'Hi see a link and (code)', speakable('**Hi** see https://x.y and ```js\nlet a\n```'));
const wav = await say(cfg, 'Coffee is on.');
const l = JSON.parse(fs.readFileSync(log, 'utf8'));
check('Piper gets the words, the voice and its config, and returns a WAV', wav.toString('ascii', 0, 4) === 'RIFF' && l.words.trim() === 'Coffee is on.' && l.args.includes('--config') && l.args[l.args.indexOf('--model') + 1] === model);
check('speed becomes a length scale', l.args[l.args.indexOf('--length_scale') + 1] === '0.8', l.args.join(' '));
try { await say(cfg, '   '); check('empty text refused', false); } catch (e) { check('empty text refused', /Nothing to say/.test(e.message)); }

// Kokoro and Chatterbox: one long-lived Python worker per voice engine (mocked with Node here).
const kmodel = path.join(dir, 'kokoro-v1.0.onnx'), kvoices = path.join(dir, 'voices-v1.0.bin');
fs.writeFileSync(kmodel, 'x'); fs.writeFileSync(kvoices, 'x');
const audio = { voicePython: { kokoro: process.execPath, chatterbox: process.execPath }, voiceScript: path.resolve('test/mock-voice.js') };
const kcfg = { agentDir: dir, innDir: dir, audio, tts: { provider: 'kokoro', model: kmodel, voices: kvoices, voice: 'bm_george' } };
check('Kokoro is ready with its engine and voice pack', ttsReady(kcfg) && !ttsReady({ ...kcfg, tts: { provider: 'kokoro', model: kmodel } }));
const k1 = JSON.parse((await say(kcfg, 'First.')).toString('utf8', 16));
const k2 = JSON.parse((await say(kcfg, 'Second.')).toString('utf8', 16));
check('Kokoro speaks with the chosen voice', k1.engine === 'kokoro' && k1.voice === 'bm_george');
check('the voice stays loaded between sentences (same process)', k1.pid === k2.pid && k2.loads === 2);
try { await say(kcfg, 'please explode'); check('a voice error comes back as an error', false); } catch (e) { check('a voice error comes back as an error', /crashed/.test(e.message)); }
const k3 = JSON.parse((await say(kcfg, 'Still here.')).toString('utf8', 16));
check('the worker keeps going after an error', k3.pid === k1.pid);
fs.mkdirSync(path.join(dir, 'voices'), { recursive: true });
fs.writeFileSync(path.join(dir, 'voices', 'bob.wav'), 'RIFF');
const c1 = JSON.parse((await say({ ...kcfg, tts: { provider: 'chatterbox' } }, 'Hello.')).toString('utf8', 16));
check('Chatterbox copies the voice in voices\\bob.wav', c1.engine === 'chatterbox' && c1.ref === path.join(dir, 'voices', 'bob.wav'));
stopVoices();

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
