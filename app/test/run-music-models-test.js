// 1.5.37: ACE-Step's music models come through Bob's own Downloads (pinned to one commit, the big files sha-checked,
// only after the user presses the button), into ACE-Step's checkpoints folder. ACE-Step itself runs offline, so it
// can never quietly fetch gigabytes in the middle of a song. A message sent during a long media job gets a busy note.
import { brainText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ModelShop } from '../src/models.js';
import { aceModelsMissing, aceModelsDir, makeAudio, ACE_MODELS_ID } from '../src/audio.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

const cat = JSON.parse(read('../catalog.json'));
const e = cat.models.find((m) => m.id === ACE_MODELS_ID);
check('the catalog has the ACE-Step music models, in a Music category', e && e.category === 'music' && cat.categories.some((c) => c.id === 'music') && e.into === 'ace-checkpoints' && e.needs === 'Audio tools');
const commits = new Set((e?.files || []).map((f) => (f.url.match(/\/resolve\/([0-9a-f]{40})\//) || [])[1]));
check('every music model file is pinned to one Hugging Face commit', e.files.length >= 20 && commits.size === 1 && !commits.has(undefined));
check('every file has its repo path and size; every big one its sha256', e.files.every((f) => f.path && f.bytes > 0 && (f.sha256 ? /^[0-9a-f]{64}$/.test(f.sha256) : f.sizeOnly && f.bytes < 50e6)));
check('the song model, sound decoder and text reader are all there', ['acestep-v15-turbo/model.safetensors', 'vae/diffusion_pytorch_model.safetensors', 'Qwen3-Embedding-0.6B/model.safetensors'].every((p) => e.files.some((f) => f.path === p)));
check('the size shown matches the files', Math.abs(e.files.reduce((t, f) => t + f.bytes, 0) / 1e9 - e.sizeGB) < 0.1);

// A small stand-in entry so the download really runs here.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob music '));
const dataDir = path.join(root, 'inn', 'bob'); fs.mkdirSync(dataDir, { recursive: true });
const bytes = { a: crypto.randomBytes(300_000), b: Buffer.from('{"x":1}') };
const sha = crypto.createHash('sha256').update(bytes.a).digest('hex');
const C = 'c'.repeat(40);
const mini = { ...cat, models: [{ ...e, files: [
  { role: 'acestep-v15-turbo/model.safetensors', path: 'acestep-v15-turbo/model.safetensors', url: `https://huggingface.co/ACE-Step/Ace-Step1.5/resolve/${C}/acestep-v15-turbo/model.safetensors`, bytes: bytes.a.length, sha256: sha },
  { role: 'vae/config.json', path: 'vae/config.json', url: `https://huggingface.co/ACE-Step/Ace-Step1.5/resolve/${C}/vae/config.json`, bytes: bytes.b.length, sizeOnly: true }
] }] };
const catalogFile = path.join(dataDir, 'catalog.json'); fs.writeFileSync(catalogFile, JSON.stringify(mini));
const cfg = { catalogFile, agentDir: root, dataDir, bobModelsDir: path.join(root, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), modelSearchRoots: [], ollamaUrl: 'http://127.0.0.1:1', engine: 'llamacpp', models: {}, audio: { python: 'python-not-run' }, painterDir: path.join(root, 'made') };
const ck = aceModelsDir(cfg);
check('the models go in ACE-Step\'s own checkpoints folder', ck === path.join(root, 'audio-workshop', 'ace-step-1.5', 'checkpoints'));
check('missing models are listed', aceModelsMissing(cfg).length === 2);

// A song asked for before the models are in: refused at once with a clear message, nothing downloaded or started.
let err = null;
try { await makeAudio(cfg, 'music', { prompt: 'lo-fi', seconds: 30 }, {}); } catch (x) { err = x; }
check('a song without the models stops before anything runs, and says how to get them', err?.code === 'MUSIC_MODELS_MISSING' && /Nothing was downloaded/.test(err.message) && /GB/.test(err.message));

const gets = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('127.0.0.1:1')) throw new Error('ECONNREFUSED');
  const which = u.endsWith('model.safetensors') ? 'a' : 'b';
  if (opts.method === 'HEAD') return new Response(null, { status: 302, headers: { 'x-linked-size': String(bytes[which].length), ...(which === 'a' ? { 'x-linked-etag': `"${sha}"` } : {}) } });
  gets.push(u);
  const r = new Response(bytes[which], { status: 200 });
  Object.defineProperty(r, 'url', { value: u });
  return r;
};
const shop = new ModelShop(cfg, () => {});
check('not on the PC yet: shown as missing', (await shop.statusOf(mini.models[0], null)).state === 'missing');
let outside = false; try { shop.dest(mini.models[0], { path: '../../../evil.txt' }); } catch { outside = true; }
check('a file path can\'t point outside the checkpoints folder', outside);
const left = path.join(ck, '.cache', 'huggingface', 'download', 'acestep-v15-turbo'); fs.mkdirSync(left, { recursive: true }); fs.writeFileSync(path.join(left, 'x.incomplete'), 'half');
await shop.download(ACE_MODELS_ID);
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 15)); } return false; };
await until(() => shop.dl.find((d) => d.id === ACE_MODELS_ID)?.state === 'done');
check('the download lands at the repo paths ACE-Step reads', fs.existsSync(path.join(ck, 'acestep-v15-turbo', 'model.safetensors')) && fs.readFileSync(path.join(ck, 'vae', 'config.json'), 'utf8') === '{"x":1}', shop.dl.find((d) => d.id === ACE_MODELS_ID)?.error || '');
check('ACE-Step\'s leftover half download is gone afterwards', !fs.existsSync(path.join(ck, '.cache', 'huggingface')));
check('after it: installed, and nothing missing', (await shop.statusOf(mini.models[0], null)).state === 'installed' && aceModelsMissing(cfg).length === 0);
// 1.5.38: ACE-Step's install ships its own small code/config files, which can differ from the model repo's. They only
// have to be there; the big model files must match exactly.
fs.writeFileSync(path.join(ck, 'vae', 'config.json'), '{"from":"ACE-Step\'s own install"}');
check('a small code/config file from ACE-Step\'s own install counts as present', aceModelsMissing(cfg).length === 0 && (await shop.statusOf(mini.models[0], null)).state === 'installed');
fs.rmSync(path.join(ck, 'vae', 'config.json'));
check('a missing small file still counts as missing', aceModelsMissing(cfg).join() === 'vae/config.json');
fs.writeFileSync(path.join(ck, 'vae', 'config.json'), '{"x":1}');
fs.writeFileSync(path.join(ck, 'acestep-v15-turbo', 'model.safetensors'), 'half');
check('a big model file at the wrong size (half a download) counts as missing', aceModelsMissing(cfg).join() === 'acestep-v15-turbo/model.safetensors' && (await shop.statusOf(mini.models[0], null)).state === 'partial');
const { aceMissingFiles, tidyAceCache } = await import('../src/audio.js');
check('what\'s left is counted by its own size, not the whole set', aceMissingFiles(cfg).reduce((t, f) => t + f.bytes, 0) === bytes.a.length);
fs.writeFileSync(path.join(ck, 'acestep-v15-turbo', 'model.safetensors'), bytes.a);
fs.mkdirSync(path.join(ck, '.cache', 'huggingface', 'download'), { recursive: true }); fs.writeFileSync(path.join(ck, '.cache', 'huggingface', 'download', 'old.incomplete'), 'stale');
check('ACE-Step\'s stale half download is tidied once everything checks out', tidyAceCache(cfg) && !fs.existsSync(path.join(ck, '.cache', 'huggingface')) && /if \(!cfg\.audio\?\.aceUrl\) tidyAceCache\(cfg\);\s*return makeMusic/.test(read('../src/audio.js')));
check('the chat offer shows the size left', /sizeGB: left/.test(brainText()));

// The engine runs offline and no longer waits half an hour for a start-up download.
const audio = read('../src/audio.js');
check('a music engine Bob didn\'t start this job is ended, never reused', /if \(await aceUp\(cfg\)\) \{\s*await stopStrayAce\(cfg\)/.test(audio) && /acestep-api/.test(audio));
check('stopping the engine ends its whole process tree on Windows (uv starts Python as a child)', /taskkill', \['\/PID', String\(child\.pid\), '\/T', '\/F'\]/.test(audio) && !/child\.kill\(\); throw/.test(audio));
check('ACE-Step\'s own half-finished download is cleared after Bob\'s download', /tidyAceCache\(this\.cfg\)/.test(read('../src/models.js')));
check('ACE-Step runs offline (it can\'t download on its own)', /HF_HUB_OFFLINE: '1'/.test(audio) && /TRANSFORMERS_OFFLINE: '1'/.test(audio));
// The brain offers the download in the chat instead, and the chat shows a button for it.
const brain = brainText(), app = read('../public/app.js');
check('the brain offers the music models when they are missing', /type: 'offer-download', (jobId: [^,]+, )?id: ACE_MODELS_ID/.test(brain));
check('the chat shows a Download button that only starts on a click', /case 'offer-download'/.test(app) && /yes\.onclick = async/.test(app) && /\/api\/models\/download', \{ id: ev\.id(, \.\.\.\(ev\.jobId \? \{ thenJob: ev\.jobId \} : \{\}\))? \}/.test(app));

// Busy note: a chat message behind a long media job hears about it at once.
const { Brain } = await import('../src/brain.js');
const fake = { turns: new Map([['talk', {}]]), state: { state: 'painting', detail: 'Composing 40%' }, cfg: { sessions: {}, engine: 'llamacpp', chatWhileBusy: false } }; // with the 1.5.41 switch on, the chat goes beside instead (sessions test)
const line = Brain.prototype.busyLine.call(fake, { kind: 'chat' });
check('a message sent while Bob composes gets a busy note straight away', /^⏳ I'm still on the last job \(making a song, 40% done\)\. Nothing for you to do; I'll answer this as soon as it's done\. If it can't wait, stop that job in Tasks\.$/.test(line || ''), line);
check('no busy note when nothing long is running', Brain.prototype.busyLine.call({ ...fake, state: { state: 'thinking', detail: '' } }, { kind: 'chat' }) === null && Brain.prototype.busyLine.call({ ...fake, turns: new Map() }, { kind: 'chat' }) === null);
check('the song\'s tool result says it was saved as a .wav and where', /saved it as a \.wav file: \$\{file\}\. It is kept on the PC/.test(brain) && /Songs and sounds are files too/.test(read('../public/help-content.js')));
const { afterTurn } = await import('../src/verify.js');
const noteOf = (t, actions = [], outputs = []) => afterTurn({ ledger: { actions, outputs }, cfg: {} }, t)?.note || '';
for (const t of ['Here it is! The lo-fi track played for 30 seconds and is saved.', 'Your song is ready: 30 seconds of lo-fi.', 'The track finished playing. I saved it as a wav.']) check(`a made-up song is corrected: "${t}"`, /no sound was made/.test(noteOf(t)));
check('saying songs can\'t be saved is corrected', /saved as a \.wav file\. Find it in Made by Bob, under Sounds\./.test(noteOf('Sorry, there is no function for recording the output stream from make_music into a persistent file.')));
check('a real song isn\'t corrected', !noteOf('Your song is ready: 30 seconds of lo-fi.', [{ name: 'make_music', ok: true, text: 'Made the song' }], [{ type: 'audio', file: 'x.wav' }]));
for (const t of ['I can write a prompt for a track if you like.', 'Which track do you want, the one from yesterday?', 'The song I made yesterday is in Made by Bob.']) check(`ordinary talk about music isn't corrected: "${t}"`, !noteOf(t));
const { newestSong } = await import('../src/audio.js');
const outDir = path.join(root, 'audio-workshop', 'ace-step-1.5', '.cache', 'acestep', 'tmp', 'api_audio'); fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'old.wav'), 'RIFF'); const past = new Date(Date.now() - 3600e3); fs.utimesSync(path.join(outDir, 'old.wav'), past, past);
const since = Date.now() - 1000; fs.writeFileSync(path.join(outDir, 'new.wav'), 'RIFF');
check('a finished song nobody reported is found in ACE-Step\'s output folder (only one newer than the job)', newestSong(cfg, since)?.endsWith('new.wav') && newestSong(cfg, Date.now() + 60e3) === null);
check('the engine error lines give a fix, keep raw output for the logbook, and never say a song was made', /start the song properly, so I couldn.{1,2}t collect it\. Ask me again; if it keeps happening, restart Bob\. \(Details are in the logbook\.\)'\), \{ details:/.test(audio) && /said the song was finished but didn.{1,2}t hand over a file\. Ask me again; if it keeps happening, restart Bob\.'\), \{ details:/.test(audio) && /if \(e\.details\) this\.log\(kind, e\.details\)/.test(brain));
// (fetch is the test's stand-in here, so the engine's answer is whatever it returns.)
// Behaviour, not just wording: an engine answer with no task id reaches the logbook, and the chat gets the plain line.
{
  const http = await import('node:http');
  const srv = http.createServer(async (req, res) => { for await (const _ of req); res.end(req.url === '/release_task' ? JSON.stringify({ data: {}, code: 500, error: 'boom' }) : '[]'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const logs = [];
  const me = { cfg: { ...cfg, audio: { python: 'x', aceUrl: `http://127.0.0.1:${srv.address().port}` } }, gate: { need: async () => [] }, setState() {}, log: (k, t) => logs.push(`${k}: ${t}`) };
  let err = null;
  try { await Brain.prototype.makeSound.call(me, 'music', { prompt: 'lo-fi', seconds: 10 }, { emit() {}, signal: null, job: null }); } catch (x) { err = x; }
  srv.close();
  check('a broken engine answer: plain line in the chat, raw answer in the logbook', /start the song properly/.test(err?.message || '') && !/[{}]/.test(err?.message || '') && logs.some((l) => /^music: release_task answered without a task id: \{/.test(l)), JSON.stringify(logs));
}
check('the logbook names music tools too', /pictures: 'Using his picture, video and music tools'/.test(read('../src/toolbox.js')));

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
