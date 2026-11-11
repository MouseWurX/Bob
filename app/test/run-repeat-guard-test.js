// #57: every tool is guarded against an exact repeat in one turn, and the third identical call stops the turn.
// Bob's plan (his second try); the working version checks it here through a real turn.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain, repeatCheck, repeatNote, REPEAT_STOP_LINE } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };

// ---------- The helper ----------
{
  const seen = new Map();
  const a = repeatCheck(seen, 'read_file|{"path":"a"}'), b = repeatCheck(seen, 'read_file|{"path":"a"}'), c = repeatCheck(seen, 'read_file|{"path":"a"}');
  check('new, then repeat, then stop on the third identical call', a === 'new' && b === 'repeat' && c === 'stop', `${a} ${b} ${c}`);
  check('a different input is new', repeatCheck(seen, 'read_file|{"path":"b"}') === 'new');
  check('the repeat note hands back the first result, cut to 300 characters', repeatNote('x'.repeat(500)) === `(Not done again: that exact call already ran this turn. Its result: ${'x'.repeat(300)}) Use it, or try something different.`);
}

// ---------- Real turns ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-repeat-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false };
const events = [];
const brain = new Brain(cfg, (ev) => events.push(ev));
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
const ran = [];
brain.runTool = async (name, args) => { ran.push(name); return { text: `${name} result ${ran.length}` }; };
let script = [], asked = 0;
brain.engine = { chat: async () => { asked++; return script.shift() || { role: 'assistant', content: 'done' }; }, unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const run = async (text) => { const { jobId } = brain.enqueue('main', text); await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === jobId)?.state)); };
const toolMsgs = () => brain.session('main').filter((m) => m.role === 'tool');
const said = () => events.filter((e) => e.type === 'token').map((e) => e.text).join('');

{
  script = [call('web_search', { query: 'moon size' }), call('web_search', { query: 'moon size' }), { role: 'assistant', content: 'About 3,474 km.' }];
  await run('how big is the moon?');
  check('a repeat search does not run again', ran.filter((n) => n === 'web_search').length === 1, ran.join(','));
  check('the repeat gets the first result back', toolMsgs().at(-1)?.content === repeatNote('web_search result 1'), toolMsgs().at(-1)?.content);
  check('he answers after one repeat', brain.session('main').at(-1)?.content === 'About 3,474 km.', brain.session('main').at(-1)?.content);
}
{
  ran.length = 0; events.length = 0; asked = 0;
  script = [call('read_file', { path: 'notes.txt' }), call('read_file', { path: 'notes.txt' }), call('read_file', { path: 'notes.txt' }), { role: 'assistant', content: 'never said' }];
  await run('what is in my notes?');
  check('read once only', ran.length === 1, ran.join(','));
  check('the third identical call stops the turn with the plain line', said().includes(REPEAT_STOP_LINE) && !said().includes('never said') && !said().includes('went round in circles'), said());
  check('the brain was asked three times, not eight', asked === 3, String(asked));
  check('the stop line is kept as his reply', brain.session('main').at(-1)?.content === REPEAT_STOP_LINE);
}
{
  ran.length = 0; events.length = 0;
  script = [call('read_file', { path: 'a.txt' }), call('write_file', { path: 'a.txt', content: 'new' }), call('read_file', { path: 'a.txt' }), { role: 'assistant', content: 'Changed it.' }];
  await run('change a.txt');
  check('after a file is written, reading it again runs again', ran.join(',') === 'read_file,write_file,read_file', ran.join(','));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
