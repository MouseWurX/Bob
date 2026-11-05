// 1.5.5 toolbox: Bob starts each chat with a small core of tools and adds groups only when a message needs them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { CORE, groupsFor, guessGroups } from '../src/toolbox.js';
import { saveSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-toolbox-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), work = path.join(tmp, 'Downloads');
for (const d of [dataDir, work]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir, work], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', hands: { enabled: true, files: { on: true }, run: { on: false }, folders: [work] } };
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';

// A fake small brain: it answers with a script of replies and records the tools it was handed at each step.
const seen = [];
let script = [];
brain.engine = { chat: async ({ tools, messages }) => { seen.push({ names: tools.map((t) => t.function.name), tools, sys: messages[0].content }); return script.shift() || { role: 'assistant', content: 'done' }; }, unloadAll: async () => {} };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const turn = async (text, replies, sessionId = 's1') => { seen.length = 0; script = replies; await brain.runOn([], text, () => {}, new AbortController().signal, [], null, sessionId); return [...seen]; };
const names = (step) => step.names;
const size = (step) => JSON.stringify(step.tools).length;

// ---------- Starting small ----------
{
  const [s] = await turn('hi Bob, how are you?', []);
  check('a plain chat starts with only the core tools plus use_tools', names(s).every((n) => CORE.includes(n)) && names(s).includes('use_tools'), names(s).join(','));
  check('no Hands, picture or file-writing tools at the start', !names(s).some((n) => ['file_hands', 'make_image', 'write_file', 'run_command'].includes(n)));
  const all = brain.toolSchemas(Object.keys(brain.tools));
  check('the starting tool list is well under half the old one', size(s) < JSON.stringify(all).length / 2, `${size(s)} vs ${JSON.stringify(all).length}`);
  console.log(`  (starting tools ~${Math.round(size(s) / 3.6)} tokens, all tools ~${Math.round(JSON.stringify(all).length / 3.6)} tokens)`);
  const use = s.tools.find((t) => t.function.name === 'use_tools');
  check('use_tools lists only groups Bob can add here (Files hand on, Run hand off; 1.5.91: make_image stays, to offer the Set it up card)', use.function.parameters.properties.group.enum.includes('files') && !use.function.parameters.properties.group.enum.includes('run') && groupsFor(brain).pictures?.tools.includes('make_image'), use.function.parameters.properties.group.enum.join(','));
  check('the Hands line stays out of the prompt until a Hand group is added', !/Hands Sam switched on/.test(s.sys));
}

// ---------- Adding groups ----------
{
  const steps = await turn('ok', [call('use_tools', { group: 'documents' })], 's2');
  check('use_tools adds its group on the next step', steps.length === 2 && names(steps[1]).includes('write_file') && !names(steps[0]).includes('write_file'), steps.map((x) => names(x).length).join('/'));
  const g = await turn('tidy my downloads folder please', [], 's3');
  check('the user\'s words add a group without an extra step (tidy downloads -> Files hand)', names(g[0]).includes('file_hands'));
  check('with a Hand group added, the Hands line is in the prompt', /Hands Sam switched on/.test(g[0].sys));
  const w = await turn('save that as a spreadsheet', [], 's4');
  check('"spreadsheet" adds the documents group', names(w[0]).includes('save_spreadsheet'));
  const run = await turn('please run npm install', [], 's5');
  check('a Hand that is off is never added, even when the words match', !names(run[0]).includes('run_command'));
}

// ---------- Small brains that skip use_tools ----------
{
  const target = path.join(innDir, 'note.txt');
  const steps = await turn('hmm', [call('write_file', { path: target, content: 'x' })], 's6');
  check('calling a tool from a group not added yet still works (the group is added)', steps.length === 2 && names(steps[1]).includes('write_file'));
  const off = await brain.runTool('run_command', { cmd: 'echo', args: ['hi'] }, { emit: () => {}, signal: new AbortController().signal, allowAll: new Set() });
  check('a tool from a Hand that is off is refused with how to turn it on', /(switched off|is off).*Settings, Show advanced settings, Hands/.test(off.text), off.text);
  const bad = await turn('hmm', [call('use_tools', { group: 'run' })], 's7');
  check('use_tools on a Hand that is off says how to turn it on', bad.length === 2);
}

// ---------- Router-test fixes: name the groups, and one more go after "I can't" ----------
{
  const [s] = await turn('hello there', [], 'r1');
  check('the prompt names the groups he can add, and says he CAN do them', /More you CAN do/.test(s.sys) && /files = /.test(s.sys) && /documents = /.test(s.sys), s.sys.slice(-400));
  check('the picture group says what isn\'t set up yet (no picture model: "make pictures (not set up yet...)")', /More you CAN do[^\n]*make pictures, [^(\n]*\(not set up yet: calling one offers to set it up\)/.test(s.sys) && (s.sys.match(/not set up yet: calling/g) || []).length === 1 && /More you CAN do[^\n]*save reference pictures/.test(s.sys));
  const steps = await turn('hmm', [{ role: 'assistant', content: "Sorry, I can't tidy folders yet." }], 'r2');
  check('"I can\'t" with no tool call: every group is added and he gets one more go', steps.length === 2 && names(steps[1]).includes('file_hands') && names(steps[1]).includes('write_file'), steps.map((x) => names(x).length).join('/'));
  const twice = await turn('hmm', [{ role: 'assistant', content: "I can't do that." }, { role: 'assistant', content: "I still can't." }], 'r3');
  check('...only once per message', twice.length === 2);
  const fine = await turn('hmm', [{ role: 'assistant', content: 'Sure, here you go: 36.' }], 'r4');
  check('a normal answer is not retried', fine.length === 1);
}

// ---------- Empty replies and "show me a picture" (2026-11-02) ----------
{
  const steps = await turn('can you show me a picture of a beautiful sunrise?', [{ role: 'assistant', content: '' }], 'e1');
  check('an empty reply gets one more go, with every group', steps.length >= 2 && names(steps[1]).includes('write_file') && names(steps[1]).includes('file_hands'), steps.map((x) => names(x).length).join('/'));
  const evs = []; seen.length = 0; script = [{ role: 'assistant', content: '' }, { role: 'assistant', content: '  ' }];
  const msgs = [];
  await brain.runOn(msgs, 'hmm', (e) => evs.push(e), new AbortController().signal, [], null, 'e2');
  check('empty twice: a plain app note, and no empty Bob words kept', evs.some((e) => e.type === 'correction' && /didn't answer/.test(e.text)) && !msgs.some((m) => m.role === 'assistant' && !m.content && !m.correction), JSON.stringify(evs));
  check('...and it only retries once', seen.length === 2);
  saveSettings(cfg, { allTools: true });
  const all = await turn('hmm', [{ role: 'assistant', content: '' }], 'e3');
  check('an empty reply is retried even with all tools on', all.length === 2);
  saveSettings(cfg, { allTools: false });
  for (const say of ['can you show me a picture of a beautiful sunrise?', 'make me a picture of a fox', 'draw a castle', 'paint the sea', 'a photo of a cat please', 'image of a robot']) check(`"${say}" adds the picture tools`, guessGroups({ usable: () => true, cfg }, say).includes('pictures'));
  const off = brain.offTools; brain.offTools = () => new Set();
  const [p] = await turn('show me a picture of a sunrise', [], 'e4');
  check('with a picture model, "show me a picture" sends make_image and says to call it straight away', names(p).includes('make_image') && /call make_image yourself straight away/.test(p.sys));
  brain.offTools = off;
  const [q] = await turn('hello', [], 'e5');
  check('...and that line stays out when pictures aren\'t needed', !/call make_image yourself/.test(q.sys));
}

// ---------- Sticky groups ----------
{
  await turn('ok', [call('use_tools', { group: 'documents' })], 'chat');
  const next = await turn('and another', [], 'chat');
  check('a group used in a chat stays for its next message', names(next[0]).includes('write_file'));
  await turn('x', [], 'chat'); await turn('y', [], 'chat'); const later = await turn('z', [], 'chat');
  check('...and drops off after a few messages without it', !names(later[0]).includes('write_file'));
  const other = await turn('hello', [], 'other-chat');
  check('another chat doesn\'t get it', !names(other[0]).includes('write_file'));
}

// ---------- The old way, as a setting ----------
{
  check('"Give Bob all his tools at once" is off by default', cfg.allTools !== true);
  saveSettings(cfg, { allTools: 'yes' });
  check('junk can\'t switch it on', cfg.allTools === false);
  saveSettings(cfg, { allTools: true });
  const [s] = await turn('hi', [], 's8');
  check('with it on, every usable tool is sent and use_tools is not', names(s).includes('write_file') && names(s).includes('file_hands') && !names(s).includes('use_tools'));
  check('...and the groups line is left out', !/More you CAN do/.test(s.sys));
  const c = await turn('hmm', [{ role: 'assistant', content: "I can't do that." }], 's9');
  check('...and "I can\'t" is not retried', c.length === 1);
  saveSettings(cfg, { allTools: false });
}

// ---------- Hats keep their own lists ----------
{
  check('word check: "draw me a fox" points at pictures', guessGroups({ usable: () => true, tools: brain.tools }, 'draw me a fox').includes('pictures'));
  check('hats still get their own tool lists (tinker can edit)', brain.toolSchemas(['list_folder', 'read_file', 'search_files', 'edit_file']).length === 4);
  // ask_together (1.5.41) isn't in a group: it comes along with any group whose tools ask for an OK.
  check('ask_together comes along once a group that asks for OKs is added', !brain.frontDeskTools(new Set()).some((t) => t.function?.name === 'ask_together') && brain.frontDeskTools(new Set(['documents'])).some((t) => t.function?.name === 'ask_together'));
  // show_plan (1.5.78) isn't in a group either: it is always there while "Show Bob's plan before big jobs" is on.
  check('show_plan comes along only while its setting is on', !brain.frontDeskTools(new Set()).some((t) => t.function?.name === 'show_plan') && (() => { brain.cfg.planFirst = true; const on = brain.frontDeskTools(new Set()).some((t) => t.function?.name === 'show_plan'); brain.cfg.planFirst = false; return on; })());
  check('every non-core tool is in exactly one group', (() => { const g = groupsFor({ usable: () => true, cfg }); const all = Object.values(g).flatMap((x) => x.tools); return Object.keys(brain.tools).filter((n) => !CORE.includes(n) && n !== 'ask_together' && n !== 'show_plan').every((n) => all.filter((x) => x === n).length === 1); })());
}

fs.rmSync(tmp, { recursive: true, force: true });

// 1.5.26: llama.cpp's tool grammar rejects a whole request with an empty "enum" (the project list with no projects).
{
  const { tidySchema } = await import('../src/toolbox.js');
  const t = tidySchema({ type: 'function', function: { name: 'x', parameters: { type: 'object', properties: { project: { type: 'string', enum: [] }, mode: { type: 'string', enum: ['a', 'b'] }, deep: { type: 'object', properties: { y: { enum: [] } } } } } } });
  const p = t.function.parameters.properties;
  check('empty enums are dropped, the parameter stays', !('enum' in p.project) && p.project.type === 'string' && !('enum' in p.deep.properties.y));
  check('a real enum is kept', JSON.stringify(p.mode.enum) === '["a","b"]');
  const { Brain } = await import('../src/brain.js');
  const b = Object.create(Brain.prototype);
  b.cfg = { projects: {} }; b.offTools = () => new Set(); b.usable = () => true;
  b.tools = { git_status: { schema: { type: 'function', function: { name: 'git_status', parameters: { type: 'object', properties: { project: { type: 'string', enum: [] } } } } } } };
  const out = b.toolSchemas(['git_status']);
  check('Bob\'s tool list never sends an empty enum', !JSON.stringify(out).includes('"enum":[]'));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
