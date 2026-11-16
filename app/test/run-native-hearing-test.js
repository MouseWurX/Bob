// Nov 16 2026: Bob hears with his own engine by default, Ollama is opt-in, and Gaming mode pauses his ears.
// Nothing here starts a real engine or reads the real computer: the engine, its answers and the files are fakes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { transcribe, sttProvider } from '../src/stt.js';
import { ollamaOn, ollamaUrl, OLLAMA_URL } from '../src/ollama-optin.js';
import { Ears, hearArgs, hearBody, hearThreads, canHear, PAUSED_IN_GAMING, HEAR_IDLE_MS } from '../src/hearing.js';
import { nativeHearing, NEW_DEFAULTS, SETTING_KEYS } from '../src/config.js';
import { capabilities } from '../src/capabilities.js';
import { ModelShop } from '../src/models.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(app, p), 'utf8').replace(/\r\n/g, '\n');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-hear-'));
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40)]);

// --- Ollama is off unless switched on ---
check('Ollama is off by default', ollamaOn({}) === false && ollamaUrl({ ollamaUrl: 'http://127.0.0.1:11434' }) === '');
check('"Use Ollama too" switches it on, at its usual address', ollamaOn({ useOllama: true }) && ollamaUrl({ useOllama: true }) === OLLAMA_URL);
check('an address set by hand is used once it is on', ollamaUrl({ useOllama: true, ollamaUrl: 'http://127.0.0.1:9999/' }) === 'http://127.0.0.1:9999');
check('Ollama as the engine, written by hand, counts as on', ollamaOn({ engine: 'ollama' }));
check('useOllama is a setting the window can save', SETTING_KEYS.includes('useOllama'));
const example = JSON.parse(read('config.example.json'));
check('the shipped config has no Ollama address', !('ollamaUrl' in example));
check('the shipped config hears with Bob\'s own engine', example.stt?.provider === 'brainengine');

// --- Which way Bob hears ---
check('no hearing set: Bob\'s own engine', sttProvider({}) === 'brainengine');
check('old Ollama hearing with Ollama off: Bob\'s own engine', sttProvider({ stt: { provider: 'ollama' } }) === 'brainengine');
check('Ollama hearing with Ollama on stays Ollama', sttProvider({ useOllama: true, stt: { provider: 'ollama' } }) === 'ollama');
check('whisper.cpp stays whisper.cpp', sttProvider({ stt: { provider: 'whispercpp' } }) === 'whispercpp');

// --- The one-time move ---
check('the move is a new default, once', NEW_DEFAULTS.some((d) => d.id === 'native-hearing'));
check('Ollama hearing moves to Gemma 4 E4B on Bob\'s engine', JSON.stringify(nativeHearing({ stt: { provider: 'ollama', model: 'gemma4:e4b' } })) === JSON.stringify({ provider: 'brainengine', model: 'gemma4-e4b' }));
check('whisper.cpp is left alone', nativeHearing({ stt: { provider: 'whispercpp' } }) === null);
check('with Ollama switched on, nothing moves', nativeHearing({ useOllama: true, stt: { provider: 'ollama' } }) === null);

// --- Gaming mode pauses Bob's ears ---
let asked = 0;
const fakeEars = { hear: async () => { asked++; return '"Hey Bob, what\'s on my board?"'; } };
try { await transcribe({ session: 'light', stt: {} }, wav, { ears: fakeEars }); check('Gaming mode: no listening', false); }
catch (e) { check('Gaming mode: no listening', e.message === PAUSED_IN_GAMING && asked === 0); }
try { await transcribe({ session: 'light', agentDir: dir, stt: { provider: 'whispercpp', model: path.join(dir, 'x.bin') } }, wav); check('Gaming mode pauses whisper.cpp too', false); }
catch (e) { check('Gaming mode pauses whisper.cpp too', e.message === PAUSED_IN_GAMING); }
const said = await transcribe({ session: 'normal', stt: {} }, wav, { ears: fakeEars });
check('Bob\'s own ears answer, cleaned up', said === 'Hey Bob, what\'s on my board?' && asked === 1, JSON.stringify(said));

// --- The ears themselves: a fake engine on the processor ---
const gguf = path.join(dir, 'gemma-4-E4B-it-Q4_0.gguf'), mmproj = path.join(dir, 'mmproj-gemma-4-E4B-it.gguf'), exe = path.join(dir, 'llama-server');
for (const f of [gguf, mmproj, exe]) fs.writeFileSync(f, 'x');
const started = [];
const spawnFn = (cmd, args, opts) => {
  const child = Object.assign(new EventEmitter(), { pid: undefined, exitCode: null, stdout: new EventEmitter(), stderr: new EventEmitter(), killed: false });
  child.kill = () => { child.killed = true; child.exitCode = 0; return true; };
  started.push({ cmd, args, env: opts.env, child });
  return child;
};
const posted = [];
const fetchFn = async (url, opts = {}) => {
  if (url.endsWith('/health')) return new Response('{}', { status: 200 });
  posted.push({ url, body: JSON.parse(opts.body) });
  return new Response(JSON.stringify({ choices: [{ message: { content: 'Turn the lights down.' } }] }), { status: 200 });
};
let clock = 1000;
const cfg = { agentDir: dir, session: 'normal', llamacpp: { exe, port: 8091 }, stt: {} };
const ears = new Ears(cfg, { resolve: () => ({ gguf, mmproj }), spawnFn, fetchFn, now: () => clock });
check('ears are ready with the brain, its reader and the engine here', ears.ready('gemma4-e4b'));
check('ears are not ready without the reader file', !new Ears(cfg, { resolve: () => ({ gguf, mmproj: path.join(dir, 'none') }) }).ready('gemma4-e4b'));
const heard = await ears.hear(wav);
const run = started[0];
check('heard through Bob\'s own engine', heard === 'Turn the lights down.' && run?.cmd === exe);
check('ears run on the processor only', run.args.includes('--no-mmproj-offload') && run.args[run.args.indexOf('-ngl') + 1] === '0' && run.env.CUDA_VISIBLE_DEVICES === '-1');
check('ears load the brain and its sound reader', run.args[run.args.indexOf('-m') + 1] === gguf && run.args[run.args.indexOf('--mmproj') + 1] === mmproj);
check('ears use their own port beside the brains', run.args[run.args.indexOf('--port') + 1] === '8094' && posted[0].url === 'http://127.0.0.1:8094/v1/chat/completions');
const part = posted[0].body.messages[0].content.find((c) => c.type === 'input_audio');
check('the recording goes in as a WAV', part?.input_audio?.format === 'wav' && part.input_audio.data === wav.toString('base64'));
check('words only, no thinking, steady', posted[0].body.temperature === 0 && posted[0].body.chat_template_kwargs?.enable_thinking === false);
await ears.hear(wav);
check('a second recording reuses the loaded ears', started.length === 1);
clock += HEAR_IDLE_MS + 1; ears.tick();
check('ears let go after ten quiet minutes', run.child.killed && ears.child === null);
await ears.hear(wav);
cfg.session = 'light'; ears.tick();
check('ears let go as soon as Gaming is on', started[1].child.killed && ears.child === null);
try { await ears.hear(wav); check('ears refuse in Gaming mode', false); } catch (e) { check('ears refuse in Gaming mode', e.message === PAUSED_IN_GAMING && started.length === 2); }
clearInterval(ears.timer);
check('threads: half the processor, 2 to 8', hearThreads(16) === 8 && hearThreads(2) === 2 && hearThreads(32) === 8 && hearThreads(6) === 3);
check('the args and body helpers agree', hearArgs({ gguf, mmproj }, 9000, 4).includes('9000') && hearBody(wav).messages[0].content.length === 2);

// --- The catalog: Gemma 4 E4B can hear on Bob's engine ---
const cat = JSON.parse(read('catalog.json'));
check('Gemma 4 E4B can hear (Hearing you job, brain and reader files)', canHear(cat.models.find((m) => m.id === 'gemma4-e4b')));
check('a brain without a reader can\'t', !canHear({ jobs: ['voice'], files: [{ role: 'gguf' }] }));

// --- Nothing asks Ollama while it's off ---
const realFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error('no network in tests'); };
try {
  const shopDir = path.join(dir, 'shop');
  fs.mkdirSync(path.join(shopDir, 'data'), { recursive: true });
  const shop = new ModelShop({ agentDir: shopDir, dataDir: path.join(shopDir, 'data'), bobModelsDir: path.join(shopDir, 'models'), engine: 'llamacpp', ollamaUrl: 'http://127.0.0.1:11434', llamacpp: {} }, () => {});
  check('Get models asks Ollama nothing while it\'s off', (await shop.ollamaNames()) === null && calls === 0);
  shop.cfg.useOllama = true;
  await shop.ollamaNames();
  check('with "Use Ollama too" on, it asks', calls === 1);
} finally { globalThis.fetch = realFetch; }

// --- Ollama's files on disk don't count as ears while it's off ---
const om = path.join(dir, 'ollama-models');
fs.mkdirSync(path.join(om, 'manifests', 'registry.ollama.ai', 'library', 'gemma4'), { recursive: true });
fs.writeFileSync(path.join(om, 'manifests', 'registry.ollama.ai', 'library', 'gemma4', 'e4b'), '{}');
const capCfg = { agentDir: dir, llamacpp: { ollamaModelsDir: om, exe: path.join(dir, 'missing-server') }, stt: { provider: 'ollama', model: 'gemma4:e4b' }, painter: {}, tts: {} };
check('Ollama\'s gemma4 doesn\'t give Bob ears while Ollama is off', capabilities(capCfg).hearing === false);
check('it does once Ollama is switched on', capabilities({ ...capCfg, useOllama: true }).hearing === true);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
