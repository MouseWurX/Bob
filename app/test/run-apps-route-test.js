// Apps hand reliability (Notepad chat, 2026-11-02): eager to drive with slim tools, no "simulated PC", no doing
// the same action twice in a row, saying what really happened when a repeat failed, and one other route after a
// failure (then stop). Uses a fake small brain and stand-in tools; the real tools are tested in run-apps-test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain, realPcPrompt, ALT_ROUTE_NUDGE } from '../src/brain.js';
import { guessGroups } from '../src/toolbox.js';
// The Apps hand only exists on Windows (src/hands-settings.js platforms); its logic is tested everywhere with a stand-in helper.
process.env.BOB_PLATFORM = 'win32';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-route-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), logbook: path.join(innDir, 'logbook.md'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', hands: { enabled: true, apps: { on: true }, files: { on: false }, run: { on: false }, folders: [] } };
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
brain.approve = async () => true; // the cards are tested elsewhere; here every card is clicked Yes

// Stand-in tools: count runs and answer from a script.
const ran = [];
const fake = (name, answers) => {
  const real = brain.tools[name];
  brain.tools[name] = { ...real, check: undefined, run: async (args) => { ran.push(name); const a = answers.shift(); if (a instanceof Error) throw a; return a ?? 'ok'; } };
};
const seen = [];
let script = [];
brain.engine = { chat: async ({ tools, messages }) => { seen.push({ names: tools.map((t) => t.function.name), sys: messages[0].content, msgs: messages }); return script.shift() || { role: 'assistant', content: 'done' }; }, unloadAll: async () => {} };
const call = (...calls) => ({ role: 'assistant', content: '', tool_calls: calls.map(([name, args]) => ({ function: { name, arguments: args || {} } })) });
let n = 0;
const turn = async (text, replies) => { seen.length = 0; ran.length = 0; script = replies; const msgs = []; await brain.runOn(msgs, text, () => {}, new AbortController().signal, [], null, `s${++n}`); return msgs; };
const toolResults = (msgs) => msgs.filter((m) => m.role === 'tool').map((m) => m.content);

// ---------- Eager to drive, with slim tools ----------
check('"drive", "take the wheel", "use my screen", "do it in Notepad" bring in the Apps tools', ['drive notepad for me', 'take the wheel', 'take control and write it', 'use my screen', 'do it in notepad', 'screen control please'].every((t) => guessGroups(brain, t).includes('apps')));
await turn('hello there', []);
const sys0 = seen[0].sys;
check('even with no Hand tools loaded, Bob is told he can drive and is keen to', /Being inside the PC is exactly why you can drive it/.test(sys0) && /be keen and start at once by showing the first step's card: open_app, then app_look, then app_act/.test(sys0) && /Nothing happens on the PC until .* clicks it/.test(sys0) && /don't refuse to drive/.test(sys0) && !/Never say you can't drive/.test(sys0) && /never say a step worked unless its result says so/.test(sys0) && !seen[0].names.includes('app_act'));
check('…and that the PC is real, never simulated', /real Windows PC/.test(sys0) && /Never call the PC simulated or virtual/.test(sys0));
const offP = realPcPrompt({ userName: 'Sam', hands: { enabled: true, apps: { on: false } } });
check('with the Apps hand off he names the switch and offers to start when it is on', /needs the Apps hand, which is off: The "Open and use apps" Hand is off\. Sam can turn it on in Settings, (Show advanced settings, )?Hands\./.test(offP) && /offer to start as soon as it's on/.test(offP) && /never call the PC simulated/i.test(offP));
check('hats (no toolbox) are not given the driving line', !/take the wheel/.test(brain.withLimits('x', null)));

// ---------- The same action twice in a row ----------
fake('app_act', ['Done: typed into Document "Text editor" (added at the end), and checked it is there.', new Error('No open window matches "Untitled - Notepad".')]);
const a = { window: 'Untitled - Notepad', action: 'type', text: 'hello' };
let m = await turn('type hello in notepad', [call(['app_act', a], ['app_act', a])]);
check('two identical app_act calls in one reply run once', ran.filter((x) => x === 'app_act').length === 1, ran.join());
check('the repeat is answered with the first result, and Bob is told not to repeat it', /Not done again: that exact call just ran\. Its result: Done: typed/.test(toolResults(m)[1]));

// ---------- A failure after a success ----------
fake('app_act', ['Done: typed hello.', new Error('No open window matches "x".')]);
m = await turn('type two things in notepad', [call(['app_act', { window: 'notepad', action: 'type', text: 'one' }]), call(['app_act', { window: 'x', action: 'type', text: 'two' }])]);
check('when a later try fails, Bob is reminded what worked, to tell both', /Earlier this turn this worked: app_act: Done: typed hello\..*Tell Sam what really happened: what worked, then what failed/.test(toolResults(m)[1]));

// ---------- One other route, then stop ----------
fake('app_act', [new Error('Windows refused: x'), new Error('Windows refused: y')]);
m = await turn('type it in notepad', [call(['app_act', { window: 'notepad', action: 'type', text: 'a' }]), call(['app_act', { window: 'notepad', action: 'type', text: 'b' }])]);
const [r1, r2] = toolResults(m);
check('after a failure Bob is asked to try ONE other way and say which worked', r1.includes(ALT_ROUTE_NUDGE('Sam').trim()) && /try ONE other way now/.test(r1) && /which way worked, or say plainly that neither did/.test(r1));
check('…and the tools for the other routes are added (documents, the Hands that are on)', seen[1].names.includes('write_file') && seen[1].names.includes('app_act'));
// After the other way fails too he is told to stop (below), and the turn ends with his words. (The safety net's
// own stop for all-failed rounds is four rounds since 1.5.208: a tool is set aside after three fails, item 200.)
check('…and after the other way fails too, the turn ends with his answer', seen.length === 3, seen.map((x) => x.names.length).join());
check('after the second failure he is told to stop and say plainly what failed', /You already tried another way this turn\. Stop here/.test(r2) && !/try ONE other way/.test(r2));
fake('app_look', [new Error('That window has closed.')]);
m = await turn('look at notepad', [call(['app_look', { window: 'notepad' }])]);
check('a failure on a reading tool (app_look) asks for no other route', !/try ONE other way/.test(toolResults(m)[0]));
const lb = fs.readFileSync(cfg.logbook, 'utf8');
check('the repeat and the other-route ask are in the logbook', /skipped a repeat of app_act/.test(lb) && /app_act failed; asked Bob to try one other way/.test(lb));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
