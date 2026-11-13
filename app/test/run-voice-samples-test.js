// Tests "Hear a sample": where samples come from, the cache, and that nothing is fetched before a click.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { voiceList, publicView, sampleFor, cacheFile, piperOfficial, clearSamples, SAMPLE_LINE } from '../src/voice-samples.js';
import { stopVoices } from '../src/tts.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-vs-'));
const bundled = path.join(dir, 'shipped'); fs.mkdirSync(bundled);
const log = path.join(dir, 'piper-log.json'); process.env.MOCK_PIPER_LOG = log;
const pModel = path.join(dir, 'en_US-ryan-high.onnx'); fs.writeFileSync(pModel, 'x'); fs.writeFileSync(pModel + '.json', '{}');
const kModel = path.join(dir, 'kokoro-v1.0.onnx'), kVoices = path.join(dir, 'voices-v1.0.bin');
fs.writeFileSync(kModel, 'x'); fs.writeFileSync(kVoices, 'x');
const catalog = JSON.parse(fs.readFileSync('catalog.json', 'utf8'));
const speech = catalog.models.filter((m) => m.category === 'speech');
const have = new Map([['piper-ryan-high', { model: pModel, config: pModel + '.json' }]]);
const shop = { catalog: { models: speech }, locate: (m) => have.get(m.id) || {} };
const audio = { voicePython: { kokoro: '', chatterbox: '' }, voiceScript: path.resolve('test/mock-voice.js') };
const cfg = { agentDir: dir, innDir: dir, dataDir: path.join(dir, 'bob'), voiceSamplesDir: bundled, audio, tts: { provider: 'piper', exe: process.execPath, preArgs: [path.resolve('test/mock-piper.js')] } };

// Fetching anything during the list or for a not-installed voice is a failure.
const realFetch = globalThis.fetch; let fetched = 0;
globalThis.fetch = (...a) => { fetched++; return realFetch(...a); };

let list = voiceList(cfg, shop);
const by = (e, v) => list.find((x) => x.engine === e && x.voice === v);
check('every Kokoro voice, the Piper voices and Chatterbox are listed', list.filter((v) => v.engine === 'kokoro').length === 22 && by('piper', 'ryan-high') && by('piper', 'alan-medium') && by('chatterbox', 'bob'));
check('Piper\'s official sample address follows its voice files', piperOfficial(speech.find((m) => m.id === 'piper-alan-medium')) === 'https://rhasspy.github.io/piper-samples/samples/en/en_GB/alan/medium/speaker_0.mp3');
check('an installed voice is made here, a missing Piper voice plays online, a missing Kokoro voice has none', by('piper', 'ryan-high').have === 'make' && by('piper', 'alan-medium').have === 'online' && by('kokoro', 'bm_george').have === 'none');
check('the list sent to the window has no file paths', !JSON.stringify(publicView(list)).includes(dir));

const off = await sampleFor(cfg, shop, 'piper', 'alan-medium');
check('a voice not on the PC gives back the official address without fetching it', off.online && off.source.includes('rhasspy') && fetched === 0 && !fs.existsSync(cacheFile(cfg, 'piper', 'alan-medium')));
const none = await sampleFor(cfg, shop, 'kokoro', 'bm_george');
check('a Kokoro voice with no shipped clip and no Kokoro says so', none.none === true && /huggingface/.test(none.page));

const made = await sampleFor(cfg, shop, 'piper', 'ryan-high');
const cache = cacheFile(cfg, 'piper', 'ryan-high');
check('an installed voice makes its sample once and keeps it in inn\\bob\\voice-samples', made.from === 'made' && made.file === cache && cache === path.join(dir, 'bob', 'voice-samples', 'piper-ryan-high.wav') && fs.existsSync(cache));
check('the sample says Bob\'s sample line in that voice', JSON.parse(fs.readFileSync(log, 'utf8')).words.trim() === SAMPLE_LINE && JSON.parse(fs.readFileSync(log, 'utf8')).args.includes(pModel));
fs.rmSync(log);
const again = await sampleFor(cfg, shop, 'piper', 'ryan-high');
check('next time it plays from the saved file without running Piper', again.from === 'saved' && !fs.existsSync(log));

fs.writeFileSync(path.join(bundled, 'kokoro-bm_george.mp3'), 'ID3');
list = voiceList(cfg, shop);
check('a clip shipped with Bob plays even without Kokoro', by('kokoro', 'bm_george').have === 'bundled' && (await sampleFor(cfg, shop, 'kokoro', 'bm_george')).from === 'bundled');

// Kokoro installed: made with the chosen voice, two clicks at once make it once.
// 1.1.1: the voice pack is downloaded but the Kokoro engine isn't: say "one more step", not "after Kokoro is in".
have.set('kokoro-v1', { model: kModel, voices: kVoices });
{
  const { sampleHint } = await import('../public/voice-samples.js');
  const v = publicView(voiceList(cfg, shop)).find((x) => x.engine === 'kokoro' && x.voice === 'af_heart');
  check('voices downloaded without the engine are reported as such', v.filesHere === true && v.installed === false);
  check('the hint says to get the Kokoro engine', /One more step: get the Kokoro engine/.test(sampleHint(v)));
  const ui = publicText('cellar.js');
  check('settings show a Get button for the missing engine where the voices are', /function engineStep/.test(ui) && /engineStep\(engineById\('kokoro'\), 'Voices downloaded'\)/.test(ui) && /engineStep\(engineById\('chatterbox'\)/.test(ui) && /data-engine="\$\{esc\(eng\.id\)\}"/.test(ui) && !/after Kokoro is in/.test(ui));
}
{
  const ui = publicText('cellar.js');
  check('1.1.2: one Voice & conversation page (planning, hearing, voice) and one Pictures & video page', /id: 'talk', label: 'Voice & conversation'[^\n]*parts: \['chat', 'voice', 'speech'\]/.test(ui) && /id: 'media', label: 'Pictures & video'[^\n]*parts: \['images', 'video'\]/.test(ui));
  check("Bob's voice settings live on the Voice page, plus Advanced settings' Voice details (1.5.0)", /id === 'speech' \? `<div class="settings voice-settings">\$\{voiceHtml\(\)\}/.test(ui) && (ui.match(/\$\{voiceHtml\(\)\}/g) || []).length === 2 && /function voiceDetailsHtml/.test(ui));
}
audio.voicePython.kokoro = process.execPath;
const [a, b] = await Promise.all([sampleFor(cfg, shop, 'kokoro', 'af_heart'), sampleFor(cfg, shop, 'kokoro', 'af_heart')]);
const k = JSON.parse(fs.readFileSync(a.file).toString('utf8', 16));
check('Kokoro makes the sample in the voice that was clicked', k.engine === 'kokoro' && k.voice === 'af_heart' && a.file === b.file);

// Chatterbox: the sample is made again once bob.wav changes.
audio.voicePython.chatterbox = process.execPath;
fs.mkdirSync(path.join(dir, 'voices'), { recursive: true });
fs.writeFileSync(path.join(dir, 'voices', 'bob.wav'), 'RIFF');
const c1 = await sampleFor(cfg, shop, 'chatterbox', 'bob');
const old = new Date(Date.now() - 60e3); fs.utimesSync(c1.file, old, old);
check('a Chatterbox sample is made again after bob.wav changes', (await sampleFor(cfg, shop, 'chatterbox', 'bob')).from === 'made');

for (const [e, v] of [['piper', '../x'], ['kokoro', 'nobody'], ['../..', 'x']]) {
  try { await sampleFor(cfg, shop, e, v); check(`refuses ${e}/${v}`, false); } catch (err) { check(`refuses ${e}/${v}`, /No such voice/.test(err.message)); }
}
clearSamples(cfg);
check('the saved samples can be cleared', !fs.existsSync(path.join(dir, 'bob', 'voice-samples')));

// The window only loads an official sample from inside the click handler.
const ui = fs.readFileSync('public/voice-samples.js', 'utf8');
const src = fs.readFileSync('src/voice-samples.js', 'utf8');
check('the server side never fetches samples itself', !/fetch\(|https?\.get|request\(/.test(src.replace(/\/\/.*$/gm, '')));
check('the window loads the official address only inside play()', /async function play\(btn\)[\s\S]*j\.online/.test(ui) && !/new Audio\([^)]*official/.test(ui) && !/preload/.test(ui));
check('fetch was never called', fetched === 0);
globalThis.fetch = realFetch;

stopVoices();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
