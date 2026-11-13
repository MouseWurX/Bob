// Assistant presets (src/presets.js, public/presets.js): off unless switched on, picked per chat, and each part of a
// preset (instructions, brain, temperature, tools) reaching a real turn; the engines pass the temperature on; the
// Settings panel, the chat menu, the phone button, Help, glossary and FAQ are there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain.js';
import { mergeSettings } from '../src/config.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { cleanPreset, cleanPresetList, presetsOn, pickPreset, presetFor, presetBrain, presetGroups, presetPrompt, presetsView, LimitedGroups, TOOL_GROUPS, MAX_PRESETS } from '../src/presets.js';
import { onlyGroups } from '../src/toolbox.js';
import { HELP } from '../public/help-content.js';
import { GROUPS, CARDS } from '../public/settings-map.js';
import { WANTS_ELSEWHERE } from '../public/wants.js';
import { presetSummary } from '../public/presets.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

// ---------- Cleaning ----------
{
  check('off unless turned on', !presetsOn({}) && !presetsOn({ chatPresets: 'yes' }) && presetsOn({ chatPresets: true }));
  check('only true turns it on when saved', mergeSettings({}, { chatPresets: 'true' }).chatPresets === false && mergeSettings({}, { chatPresets: true }).chatPresets === true);
  const p = cleanPreset({ name: '  Coach  ', instructions: 'Be\r\nbrief\u0001', brain: 'qwen3:4b', effort: 'high', temperature: '0.35', tools: ['documents', 'nope', 'documents'] });
  check('a preset keeps only known fields, trimmed', p.name === 'Coach' && p.instructions === 'Be\nbrief' && p.brain === 'qwen3:4b' && p.effort === 'high' && p.temperature === 0.35 && JSON.stringify(p.tools) === '["documents"]', JSON.stringify(p));
  check('it gets an id', /^p[0-9a-f]{8}$/.test(p.id));
  const blank = cleanPreset({});
  check('blank means as usual', blank.name === 'My preset' && blank.brain === '' && blank.effort === '' && blank.temperature === null && blank.tools === 'usual');
  check('temperature is kept to 0..2', cleanPreset({ temperature: 9 }).temperature === 2 && cleanPreset({ temperature: -1 }).temperature === 0 && cleanPreset({ temperature: '' }).temperature === null && cleanPreset({ temperature: 'hot' }).temperature === null);
  check('a strange effort or brain is dropped', cleanPreset({ effort: 'max', brain: 'a b; rm' }).effort === '' && cleanPreset({ brain: 'a b; rm' }).brain === '');
  check('talking only', cleanPreset({ tools: 'none' }).tools === 'none' && cleanPreset({ tools: 'all' }).tools === 'usual');
  check('long instructions are cut', cleanPreset({ instructions: 'x'.repeat(9000) }).instructions.length === 4000);
  const dup = cleanPresetList([{ id: 'p00000001', name: 'a' }, { id: 'p00000001', name: 'b' }, null, 'x']);
  check('a list drops junk and gives a repeated id a new one', dup.length === 2 && dup[0].id !== dup[1].id);
  check('at most 30 presets', cleanPresetList(Array.from({ length: 50 }, (_, i) => ({ name: 'n' + i }))).length === MAX_PRESETS);
  check('the list is cleaned when saved', mergeSettings({}, { presetList: [{ name: 'x', tools: ['bogus'] }] }).presetList[0].tools.length === 0);
  check('every tool group a preset names is a real group id', TOOL_GROUPS.length >= 15 && TOOL_GROUPS.every(([id, label]) => /^[a-z]+$/.test(id) && label));
}

// ---------- Prompt, groups and the brain ----------
{
  check('no preset: nothing added', presetPrompt(null) === '');
  const text = presetPrompt(cleanPreset({ name: 'Coach', instructions: 'Call {{USER}} chief.' }), 'Sam');
  check('the preset name and instructions go in, with the user\'s name', /"Coach"/.test(text) && /Call Sam chief\./.test(text) && /never change your honesty, safety/.test(text));
  check('talking only says so', /no tools in this chat/.test(presetPrompt(cleanPreset({ tools: 'none' }))));
  check('groups: as usual is no limit, talking only is an empty one', presetGroups(cleanPreset({})) === null && presetGroups(cleanPreset({ tools: 'none' })).size === 0 && presetGroups(cleanPreset({ tools: ['diagrams'] })).has('diagrams'));
  const lim = new LimitedGroups(['pictures', 'diagrams'], new Set(['diagrams']));
  lim.add('files');
  check('a limited set never takes a group the preset leaves out', lim.has('diagrams') && !lim.has('pictures') && !lim.has('files') && lim.size === 1);
  check('onlyGroups narrows, and null leaves them all', Object.keys(onlyGroups({ a: 1, b: 2 }, new Set(['b']))).join() === 'b' && Object.keys(onlyGroups({ a: 1, b: 2 }, null)).length === 2);
  const cfg = { models: { bob: 'big:latest', coder: 'coder:latest' } };
  check('a brain in a slot is used', presetBrain(cfg, { brain: 'coder:latest' }) === 'coder:latest');
  check('a brain not in a slot falls back to the usual one', presetBrain(cfg, { brain: 'gone:latest' }) === '');
  check('the summary says what it does', /talking only/.test(presetSummary(cleanPreset({ tools: 'none' }))) && /High effort/.test(presetSummary(cleanPreset({ effort: 'high' }))));
}

// ---------- Picking per chat (a folder made for the test) ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-presets-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const coach = cleanPreset({ id: 'pc0ac0ac0', name: 'Coach', instructions: 'You are a writing coach. Answer in one line.', temperature: 0.2, tools: ['diagrams'] });
const quiet = cleanPreset({ id: 'pa1a1a1a1', name: 'Just talk', tools: 'none', brain: 'small:latest' });
{
  const cfg = { dataDir, chatPresets: false, presetList: [coach, quiet] };
  pickPreset(cfg, 'chat-1', coach.id);
  check('switch off: a pick is kept but not used', presetFor(cfg, 'chat-1') === null);
  cfg.chatPresets = true;
  check('switch on: the chat gets its preset', presetFor(cfg, 'chat-1')?.name === 'Coach');
  check('other chats are plain Bob', presetFor(cfg, 'main') === null);
  check('the view shows the pick for that chat only', presetsView(cfg, 'chat-1').picked === coach.id && presetsView(cfg, 'main').picked === '');
  let threw = '';
  try { pickPreset(cfg, 'chat-1', 'p99999999'); } catch (e) { threw = e.message; }
  check('a preset that is gone can\'t be picked', /gone/.test(threw));
  pickPreset(cfg, 'chat-1', '');
  check('None takes it off again', presetFor(cfg, 'chat-1') === null);
  pickPreset(cfg, 'chat-1', coach.id);
  cfg.presetList = [quiet];
  check('a removed preset: the chat is plain Bob again', presetFor(cfg, 'chat-1') === null);
  pickPreset(cfg, 'chat-2', quiet.id);
  check('removed presets\' picks are dropped from the file', !('chat-1' in JSON.parse(fs.readFileSync(path.join(dataDir, 'chat-presets.json'), 'utf8'))));
  check('a chat id is made safe', (() => { pickPreset(cfg, '../../x', quiet.id); return '....x' in JSON.parse(fs.readFileSync(path.join(dataDir, 'chat-presets.json'), 'utf8')) === false; })());
}

// ---------- A real turn ----------
{
  const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
    models: { bob: 'big:latest', quick: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false, chatPresets: true, presetList: [coach, quiet] };
  fs.rmSync(path.join(dataDir, 'chat-presets.json'), { force: true });
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  brain.ensureModel = async (m) => m; brain.fitCtx = async () => 8192; brain.recall = async () => '';
  const seen = [];
  brain.engine = { chat: async (opts) => { seen.push({ model: opts.model, temperature: opts.temperature, names: (opts.tools || []).map((t) => t.function.name), sys: opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n') }); return { role: 'assistant', content: 'done' }; },
    unloadAll: async () => [], loaded: async () => [], unload: async () => [], isLoaded: async () => true };
  const run = async (chat, text, effort = 'low') => { const { jobId } = brain.enqueue(chat, text, [], effort); await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === jobId)?.state)); return seen.at(-1); };

  let s = await run('plain', 'draw me a flowchart of making tea');
  check('no preset: Bob\'s usual brain, no temperature, no preset line', s?.model === 'big:latest' && s.temperature === undefined && !/assistant preset/.test(s.sys), JSON.stringify(s && { m: s.model, t: s.temperature }));
  check('no preset: his copies are there', s.names.includes('ask_specialist'));

  pickPreset(cfg, 'coach', coach.id);
  s = await run('coach', 'draw me a flowchart of making tea');
  check('the preset\'s instructions are in the chat\'s instructions', /"Coach"/.test(s.sys) && /writing coach/.test(s.sys));
  check('its temperature goes to the engine', s.temperature === 0.2);
  check('the groups it allows are there', s.names.includes('make_diagram'));
  check('with Only these, no handing to copies', !s.names.includes('ask_specialist'));
  s = await run('coach', 'save this as a text file please');
  check('a group it leaves out never loads', !s.names.includes('write_file'), s.names.join(','));
  const useTools = brain.tools.use_tools;
  check('use_tools refuses a group it leaves out', /leaves out documents/.test(await useTools.run({ group: 'documents' }, { loaded: new LimitedGroups([], new Set(['diagrams'])) })));

  pickPreset(cfg, 'quiet', quiet.id);
  s = await run('quiet', 'draw me a flowchart of making tea');
  check('talking only: no tools at all', s.names.length === 0, s.names.join(','));
  check('its own brain answers at Low', s.model === 'small:latest', s.model);
  s = await run('quiet', 'think hard about tea', 'medium');
  check('Medium and up keep the big brains', s.model !== 'small:latest', s.model);
  cfg.session = 'light';
  s = await run('quiet', 'hello');
  check('other sessions keep their own brain', s.model !== 'small:latest' || cfg.models.bob === 'small:latest', s.model);
  cfg.session = 'normal';

  cfg.chatPresets = false;
  s = await run('coach', 'draw me a flowchart of making tea');
  check('switched off: the chat is plain Bob', !/assistant preset/.test(s.sys) && s.temperature === undefined && s.names.includes('ask_specialist'));
  cfg.chatPresets = true;

  const guestJob = brain.enqueue('coach', 'hi from Discord', [], 'low', { guest: { from: 'Discord', public: true } });
  await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === guestJob.jobId)?.state));
  check('guests (Discord, Telegram) never get a preset', !/assistant preset/.test(seen.at(-1).sys));
}

// ---------- The engines pass the temperature on ----------
{
  const lc = Object.create(LlamaCpp.prototype);
  lc.url = 'http://127.0.0.1:1'; lc.sampling = () => ({ temperature: 0.7, top_p: 0.8 });
  let body = null;
  const was = globalThis.fetch;
  globalThis.fetch = async (url, o) => { body = JSON.parse(o.body); return { ok: true }; };
  await lc.post('m', [{ role: 'user', content: 'hi' }], [], undefined, undefined, undefined, 0.15);
  check('llama.cpp: the preset\'s temperature wins over the brain\'s usual', body.temperature === 0.15 && body.top_p === 0.8);
  await lc.post('m', [{ role: 'user', content: 'hi' }], [], undefined, undefined, undefined, undefined);
  check('llama.cpp: no preset temperature, the brain\'s usual', body.temperature === 0.7);
  globalThis.fetch = was;
  const ol = read('src/ollama.js');
  check('Ollama sends it in options', /options: Number\.isFinite\(temperature\) \? \{ \.\.\.this\.opts\(cpu, ctx\), temperature \}/.test(ol));
}

// ---------- Pages, phone and Help ----------
{
  check('the Settings panel is in the map (Bob card and side list)', GROUPS.find(([g]) => g === 'Bob')[1].includes('adv-presets') && CARDS.find((c) => c.id === 'bob').topics.includes('adv-presets'));
  const cellar = publicText('cellar.js');
  check('the Settings panel mounts the editor', /\['presets', '🎭 Assistant presets'/.test(cellar) && /mountPresets\(dlg\.querySelector\('\.presets-box'\)\)/.test(cellar));
  const page = read('public/presets.js');
  check('the switch says what presets are', /Assistant presets for chats<\/strong><span class="muted"> Save sets/.test(page));
  check('always visible: no field is disabled or hidden by the switch', !/disabled/.test(page.slice(0, page.indexOf('export function mountPresets'))));
  check('removing asks twice, no pop-up', /Press again/.test(page) && !/confirm\(/.test(page));
  check('the chat menu sits next to Effort', /id="presetPick"[^>]*hidden><span class="lbl">🎭 Preset<\/span>/.test(read('public/index.html')));
  check('the chat page loads the pick when a chat opens', /presetPicker\.load\(\)/.test(publicText('app.js')));
  const phone = read('android/app/src/main/assets/www/phone.js');
  check('Bob for Android has the 🎭 button, per chat', /id="preset"/.test(read('android/app/src/main/assets/www/index.html')) && /\/api\/presets\/pick/.test(phone) && /phone-\$\{chat\.id\}/.test(phone));
  check('first-time list points at it', WANTS_ELSEWHERE.some((w) => w.id === 'adv-presets'));
  const ids = HELP.map((e) => e.id);
  check('Help, FAQ and glossary', ids.includes('settings-presets') && ids.includes('faq-presets') && /<dt>Assistant preset<\/dt>/.test(HELP.find((e) => e.id === 'glossary').html));
  const help = HELP.find((e) => e.id === 'settings-presets').html;
  check('Help names every field and says where it doesn\'t reach', ['Name', 'Instructions', 'Brain', 'Starting effort', 'Temperature', 'Tools', 'Talking only', 'Only these', 'Bob for Android', 'Discord and Telegram'].every((w) => help.includes(w)));
  check('changing presets is this replicant matrix only', /Presets can only be changed on this replicant matrix itself/.test(read('src/server.js')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
