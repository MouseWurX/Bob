// Sessions (which brains stay loaded), parallel lanes, and Style settings cleaning.
import { Brain, besideOk, sideOk, sideBrain, SIDE_LANE } from '../src/brain.js';
import { modelFor, laneOf, suggestSession, currentSession, sessionBrains, SESSIONS, waitsForGaming } from '../src/sessions.js';
import { cleanStyle } from '../src/config.js';
import { ENGINES, findRelease, pickAsset } from '../src/engines.js';
import { explainSetupError } from '../src/audio.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { mergeSettings } from '../src/config.js';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };

const models = { bob: 'gemma4:26b', tinker: 'qwen3-coder:30b', ledger: 'gemma4:26b', reviewer: 'gpt-oss:20b', painter: 'gemma4:26b' };
const cfg = (x = {}) => ({ engine: 'ollama', models, ...x });

check('Normal is the default', currentSession(cfg()).id === 'normal');
check('unknown session falls back to Normal', currentSession(cfg({ session: 'party' })).id === 'normal');
check('Normal: each hat its own brain', modelFor(cfg(), 'tinker').model === 'qwen3-coder:30b' && !modelFor(cfg(), 'tinker').cpu);
check('Normal + One brain: every hat on the main brain', modelFor(cfg({ oneBrain: true }), 'tinker').model === 'gemma4:26b');
check('Art: chat on the small brain, on the processor', (() => { const m = modelFor(cfg({ session: 'art' }), 'bob'); return m.model === 'gemma4:e4b' && m.cpu; })());
check('Coding: the coder does every hat', modelFor(cfg({ session: 'coding' }), 'ledger').model === 'qwen3-coder:30b');
check('Office: the ledger brain does every hat', modelFor(cfg({ session: 'office' }), 'tinker').model === 'gemma4:26b');
// 1.5.23: Deep thought is gone (a saved one becomes Normal); Light is now Gaming and keeps the card completely free.
check('Deep thought is gone: a saved "deep" is Normal', currentSession(cfg({ session: 'deep' })).id === 'normal' && !SESSIONS.deep && mergeSettings({}, { session: 'deep' }).session === 'normal');
check('Gaming: the label and wording', SESSIONS.light.label === 'Gaming' && SESSIONS.light.icon === '🎮' && /card for your games/.test(SESSIONS.light.what) && !/completely free/.test(SESSIONS.light.what));
check('Gaming: chat on the small Gaming brain (Qwen3 4B Instruct 2507), always on the processor', (() => { const m = modelFor(cfg({ session: 'light' }), 'bob'); return m.model === 'qwen3-4b' && m.cpu; })());
check('Gaming: every hat on the processor too', ['tinker', 'reviewer', 'eyes', 'ledger'].every((h) => modelFor(cfg({ session: 'light' }), h).cpu));
check('Gaming: a Gaming brain picked in Equip is used', modelFor(cfg({ session: 'light', sessionBrains: { gaming: 'qwen3:1.7b' } }), 'bob').model === 'qwen3:1.7b' && mergeSettings({}, { sessionBrains: { gaming: 'qwen3:1.7b' } }).sessionBrains.gaming === 'qwen3:1.7b');
{ const g = cfg({ session: 'light' });
  check('Gaming: pictures, clips, music and Medium-and-up jobs wait', ['picture', 'video', 'music'].every((kind) => waitsForGaming(g, { kind, effort: 'low' })) && ['medium', 'high', 'extreme'].every((effort) => waitsForGaming(g, { kind: 'chat', effort })));
  check('Gaming: a Low chat or code question runs (on the processor)', !waitsForGaming(g, { kind: 'chat', effort: 'low' }) && !waitsForGaming(g, { kind: 'code', effort: 'low' }));
  check('Normal: nothing waits for Gaming', !waitsForGaming(cfg(), { kind: 'picture', effort: 'high' })); }
check('Normal with it on: chat on the Quick brain on the processor; hats keep their own brains on the card', (() => { const m = modelFor(cfg({ quickOnCpu: true }), 'bob'); const t = modelFor(cfg({ quickOnCpu: true }), 'tinker'); return m.model === 'gemma4:e4b' && m.cpu && t.model === 'qwen3-coder:30b' && !t.cpu; })());
check('Normal by default: the main Brain on the card, as before 1.5.14', (() => { const m = modelFor(cfg(), 'bob'); return m.model === 'gemma4:26b' && !m.cpu; })());
check('session brains can be changed', sessionBrains(cfg({ sessionBrains: { small: 'qwen2.5-coder:7b' } })).small === 'qwen2.5-coder:7b');
check('Art: pictures get their own lane', laneOf(cfg({ session: 'art' }), { kind: 'picture' }) === 'art' && laneOf(cfg({ session: 'art' }), { kind: 'chat' }) === 'talk');
check('Normal: one lane for everything', laneOf(cfg(), { kind: 'picture' }) === 'talk');
check('Art with llama.cpp: pictures get their own lane too (both share the small brain on the processor)', laneOf(cfg({ session: 'art', engine: 'llamacpp' }), { kind: 'picture' }) === 'art' && laneOf(cfg({ session: 'art', engine: 'llamacpp' }), { kind: 'chat' }) === 'talk');
check('Normal with llama.cpp: still one lane', laneOf(cfg({ engine: 'llamacpp' }), { kind: 'picture' }) === 'talk');
const jobs = [{ kind: 'picture', state: 'waiting' }, { kind: 'video', state: 'waiting' }, { kind: 'chat', state: 'waiting' }];
check('two pictures waiting: suggests Art', suggestSession(cfg(), jobs)?.id === 'art');
check('already in Art: no suggestion', suggestSession(cfg({ session: 'art' }), jobs) === null);
check('one chat: no suggestion', suggestSession(cfg(), [{ kind: 'chat', state: 'waiting' }]) === null);

const st = cleanStyle({ theme: 'my-abc', custom: [
  { id: 'my-abc', name: 'Night <script>', colors: { bg: '#112233', accent: 'red;}body{', text: '#FFFFFF' }, font: 'comic', radius: 99, blueprint: true },
  { id: 'evil', name: 'x', colors: {} }
] });
check('style: theme id kept', st.theme === 'my-abc');
check('style: only my- ids saved', st.custom.length === 1);
check('style: bad colours dropped, good ones kept', st.custom[0].colors.bg === '#112233' && !('accent' in st.custom[0].colors) && st.custom[0].colors.text === '#ffffff');
check('style: odd name replaced', st.custom[0].name === 'My theme');
check('style: unknown font dropped, radius capped', !st.custom[0].font && st.custom[0].radius === 20 && st.custom[0].blueprint === true);
check('style: bad theme id dropped', cleanStyle({ theme: '"><img>' }).theme === undefined);

// Engines: a newest release with no Windows build is skipped, not fatal.
const whisper = ENGINES.find((e) => e.id === 'whispercpp');
const releases = [
  { tag_name: 'v1.9.5', assets: [{ name: 'whisper-v1.9.5-xcframework.zip' }] },
  { tag_name: 'b5454', prerelease: true, assets: [{ name: 'whisper-bin-win-cuda-12.4-x64.zip' }, { name: 'whisper-bin-x64.zip' }] },
  { tag_name: 'v1.9.2', assets: [{ name: 'whisper-bin-x64.zip' }] }
];
const fakeFetch = async (u) => ({ ok: true, json: async () => (/releases\?per_page/.test(u) ? releases : {}) });
const found = await findRelease(whisper, true, undefined, fakeFetch);
check('whisper.cpp: skips a release with no Windows build', found.rel.tag_name === 'b5454', found.rel.tag_name);
check('whisper.cpp: CPU build preferred (Bob listens on the processor)', found.asset.name === 'whisper-bin-x64.zip');
check('whisper.cpp: newer CUDA zip name understood, highest version wins', pickAsset([{ name: 'whisper-bin-win-cuda-11.8-x64.zip' }, { name: 'whisper-bin-win-cuda-12.4-x64.zip' }], whisper, true)?.name === 'whisper-bin-win-cuda-12.4-x64.zip');
let none = '';
try { await findRelease(whisper, true, undefined, async () => ({ ok: true, json: async () => [releases[0]] })); } catch (e) { none = e.message; }
check('no Windows build anywhere: a clear message', /last 15/.test(none) && /Clicking again won't help/.test(none), none);
check('Smart App Control block explained in plain words', /Smart App Control/.test(explainSetupError('Querying Python failed with exit code 0xc0e90002')));

// llama.cpp speed: draft model, threads/batch, per-model flags, per-session context.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-speed-'));
const big = path.join(tmp, 'big.gguf'), small = path.join(tmp, 'small.gguf');
fs.writeFileSync(big, 'x'); fs.writeFileSync(small, 'x');
const lcfg = { agentDir: tmp, dataDir: tmp, llamacpp: { models: { big, small }, threads: 8, batch: 4096, ubatch: 1024, draft: { model: 'small', max: 16, min: 2, ngld: 99 }, modelArgs: { big: ['--n-cpu-moe', '8'] } } };
const lc = new LlamaCpp(lcfg);
const a = lc.buildArgs('big', { ctx: 32768 });
const at = (f) => a[a.indexOf(f) + 1];
check('llama.cpp: session context size is used', at('-c') === '32768');
check('llama.cpp: threads, batch and micro-batch', at('-t') === '8' && at('-b') === '4096' && at('-ub') === '1024');
check('llama.cpp: speculative decoding with the draft brain', at('-md') === small && at('--spec-draft-n-max') === '16' && at('--spec-draft-n-min') === '2' && at('-ngld') === '99');
check('llama.cpp: per-model flags', a.includes('--n-cpu-moe') && at('--n-cpu-moe') === '8');
check('llama.cpp: the draft brain gets no draft of its own', !lc.buildArgs('small').includes('-md'));
{ const c = lc.buildArgs('big', { cpu: true }); check('llama.cpp on the processor: no layers on the card, no --fit, no draft brain', c[c.indexOf('-ngl') + 1] === '0' && !c.includes('--fit') && !c.includes('-md')); }
{ const d = new LlamaCpp({ agentDir: tmp, dataDir: tmp, llamacpp: { models: { big }, fit: true } }).buildArgs('big');
  const dat = (f) => d[d.indexOf(f) + 1];
  check('llama.cpp (1.5.19): 32K context when nothing picks one', dat('-c') === '32768');
  check('llama.cpp (1.5.19): with --fit, no -ngl (so fit can trim)', d.includes('--fit') && !d.includes('-ngl'));
  check('llama.cpp (1.5.19): one slot, so the chat gets the whole context', dat('-np') === '1'); }
{ const d = new LlamaCpp({ agentDir: tmp, dataDir: tmp, llamacpp: { models: { big }, fit: false } }).buildArgs('big');
  check('llama.cpp: without fit, every layer on the card as before', d[d.indexOf('-ngl') + 1] === '999' && !d.includes('--fit')); }
{ const d = new LlamaCpp({ agentDir: tmp, dataDir: tmp, llamacpp: { models: { big }, fit: true, gpuLayers: 30, args: ['-np', '2'] } }).buildArgs('big');
  check('llama.cpp: layers and slots set by hand win', d[d.indexOf('-ngl') + 1] === '30' && d[d.indexOf('-np') + 1] === '2' && d.filter((x) => x === '-np').length === 1); }
{ // 1.5.25: a Get models id that was downloaded but never picked in a slot is found in Bob's models folder.
  const md = path.join(tmp, 'bobmodels'); fs.mkdirSync(path.join(md, 'chat'), { recursive: true });
  const f = path.join(md, 'chat', 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'); fs.writeFileSync(f, 'x');
  const l2 = new LlamaCpp({ agentDir: tmp, dataDir: tmp, bobModelsDir: md, llamacpp: {} });
  check('llama.cpp: the Gaming brain (catalog id qwen3-4b) is found in Bob\'s models folder', l2.resolve('qwen3-4b').gguf === f);
  let miss = ''; try { l2.resolve('no-such-id'); } catch (e) { miss = e.message; }
  check('llama.cpp: an unknown name still reports the missing files', /can't find the model files/.test(miss)); }
check('llama.cpp: settings changed later apply to the next load', (lcfg.llamacpp.threads = 4, at && lc.buildArgs('big')[lc.buildArgs('big').indexOf('-t') + 1] === '4'));
const m = mergeSettings({ llamacpp: { exe: 'C:\\llama\\llama-server.exe' } }, { llamacpp: { exe: 'C:\\evil.exe', threads: -3, batch: 2048, modelArgs: { big: ['--n-cpu-moe', '8', '--log-file', 'C:\\Windows\\x.txt'] }, draft: { model: 'small', max: 999 } }, sessionCtx: { deep: 131072, art: 12345 } });
check('speed settings: the program path can\'t be changed', m.llamacpp.exe === 'C:\\llama\\llama-server.exe');
check('speed settings: bad numbers dropped', m.llamacpp.threads === null && m.llamacpp.batch === 2048 && m.llamacpp.draft.max === 16);
check('speed settings: flags kept, file paths dropped', JSON.stringify(m.llamacpp.modelArgs.big) === JSON.stringify(['--n-cpu-moe', '8', '--log-file']), JSON.stringify(m.llamacpp.modelArgs.big));
check('session context: only the offered sizes', m.sessionCtx.deep === 131072 && m.sessionCtx.art === null);
check('session context reaches the brain', modelFor({ ...cfg({ session: 'coding' }), sessionCtx: { coding: 131072 } }, 'bob').ctx === 131072 && modelFor(cfg({ session: 'coding' }), 'bob').ctx === null);
check('Normal chat defaults to 32K; coding copies keep the long default', modelFor(cfg(), 'bob').ctx === 32768 && modelFor(cfg(), 'tinker').ctx === null);
check('--fit is off on an old llama.cpp (no version file)', !lc.buildArgs('small').includes('--fit'));
check('1.5.177: an unknown llama.cpp keeps its own page flags untouched (no --no-webui), so it still starts', !lc.buildArgs('small').includes('--no-webui'));
check('item 2: an unknown llama.cpp gets no --cache-reuse either', !lc.buildArgs('small').includes('--cache-reuse'));
fs.mkdirSync(path.join(tmp, 'llama.cpp'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'llama.cpp', 'bob-llamacpp.json'), JSON.stringify({ version: 'b12032' }));
check('--fit on with b12032 when nothing is pinned', (() => { const x = lc.buildArgs('small'); return x[x.indexOf('--fit') + 1] === 'on'; })());
check('--fit stays off when a brain has a pinned split', !lc.buildArgs('big').includes('--fit'));
check('1.5.177: the engine\'s own chat page is switched off (--no-webui), so only Bob\'s page chats', lc.buildArgs('small').includes('--no-webui') && lc.buildArgs('big').includes('--no-webui'));
check('item 2: the engine reuses what it already read after a change mid-chat (--cache-reuse 256) on b12032', (() => { const x = lc.buildArgs('small'); return x[x.indexOf('--cache-reuse') + 1] === '256'; })());
lcfg.llamacpp.fit = false;
check('--fit can be switched off', !lc.buildArgs('small').includes('--fit'));
fs.rmSync(tmp, { recursive: true, force: true });

check('a question about an attached picture is a chat job', Brain.guessKind('what is in this picture?') === 'chat' && Brain.guessKind('Describe it', true) === 'chat');
check('asking for a picture is still a picture job', Brain.guessKind('paint a dragon over the inn') === 'picture');

// 1.5.40: on llama.cpp, making room for the painter keeps a brain that runs on the processor.
{
  const lc = Object.create(LlamaCpp.prototype); let stopped = 0;
  lc.stopServer = async () => { stopped++; lc.current = null; }; lc.cfg = {};
  Object.assign(lc, { current: 'small', currentCpu: true, currentCard: null });
  const kept = await lc.unloadGpu();
  check('llama.cpp: the processor brain stays when the painter needs the card', kept.length === 0 && stopped === 0 && lc.current === 'small');
  Object.assign(lc, { current: 'big', currentCpu: false });
  check('llama.cpp: a brain on the card is let go', (await lc.unloadGpu()).join() === 'big' && stopped === 1);
  const b = { cfg: { engine: 'llamacpp' }, turns: new Map([['art', {}]]) };
  check('beside a picture: a plain chat runs', besideOk(b, { refs: [], effort: 'low' }, 'talk'));
  check('beside a picture: a job with attached pictures (needs his eyes) waits', !besideOk(b, { refs: ['x'], effort: 'low' }, 'talk'));
  check('beside a picture: Medium effort and up (reviewer brain) waits', !besideOk(b, { refs: [], effort: 'medium' }, 'talk'));
  check('with Ollama nothing waits', besideOk({ ...b, cfg: { engine: 'ollama' } }, { refs: ['x'], effort: 'high' }, 'talk'));
}
// 1.5.41 "Keep chatting while Bob is busy": a plain chat goes beside a media step, on the small processor brain.
{
  const GB = 1024 ** 3;
  const base = (over = {}) => ({ cfg: { engine: 'llamacpp', chatWhileBusy: true, models: { bob: 'big', small: 'small' }, sessionBrains: { small: 'small' } }, turns: new Map([['talk', {}]]), state: { state: 'painting' }, engine: { resolve: () => ({ gguf: '/x' }) }, ...over });
  const chat = { kind: 'chat', refs: [], effort: 'low' };
  check('1.5.54: no Qwen3 4B Instruct 2507 on the PC: the chat waits (E4B never on the processor)', !sideOk(base({ engine: { resolve: () => { throw new Error('none'); } } }), chat, { freeMem: 16 * GB }));
  check('busy switch on, painting, room in RAM: a chat goes beside', sideOk(base(), chat, { freeMem: 16 * GB }));
  check('on to start with (no setting saved)', sideOk(base({ cfg: { ...base().cfg, chatWhileBusy: undefined } }), chat, { freeMem: 16 * GB }));
  check('switched off: it waits', !sideOk(base({ cfg: { ...base().cfg, chatWhileBusy: false } }), chat, { freeMem: 16 * GB }));
  check('not in a media step (e.g. the big brain is writing code): it waits', !sideOk(base({ state: { state: 'thinking' } }), chat, { freeMem: 16 * GB }));
  check('not enough free RAM: it waits', !sideOk(base(), chat, { freeMem: 5 * GB }));
  check('a picture attached, Medium effort, or a picture request: it waits', !sideOk(base(), { ...chat, refs: ['x'] }, { freeMem: 16 * GB }) && !sideOk(base(), { ...chat, effort: 'medium' }, { freeMem: 16 * GB }) && !sideOk(base(), { ...chat, kind: 'picture' }, { freeMem: 16 * GB }));
  check('only one reply beside a job at a time', !sideOk(base({ turns: new Map([['talk', {}], [SIDE_LANE, {}]]) }), chat, { freeMem: 16 * GB }));
  check('Gaming: never (the processor is the game\'s)', !sideOk(base({ cfg: { ...base().cfg, session: 'light' } }), chat, { freeMem: 16 * GB }));
  check('the reply beside always uses the small brain on the processor', JSON.stringify(sideBrain(base().cfg)) === JSON.stringify({ model: 'small', cpu: true }));
  const src = fs.readFileSync(new URL('../src/handoff.js', import.meta.url), 'utf8');
  check('the media job waits for that reply before loading its own brain back', /turns\?\.get\?\.\('side'\)/.test(src) && /sideIdle\?\.\(signal\)/.test(src));
  const bsrc = fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8');
  check('a second media step keeps the reply\'s processor brain loaded', /this\.turns\?\.has\(SIDE_LANE\)\) && this\.engine\.unloadGpu/.test(bsrc));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
