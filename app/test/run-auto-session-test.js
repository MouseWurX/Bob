// 1.5.41 "Let Bob pick the session" and the 🎮 Gaming button.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { CORE } from '../src/toolbox.js';
import { autoSessionOn, decidePick, idleSession, cardBusy, pickId, switchLine } from '../src/auto-session.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };

// ---------- The rules (pure) ----------
check('on unless switched off', autoSessionOn({}) && autoSessionOn({ autoSession: true }) && !autoSessionOn({ autoSession: false }));
check('gaming means the Gaming session (id light)', pickId('Gaming') === 'light' && pickId('coding') === 'coding' && pickId('deep') === null);
check('the card counts as busy at 30% load or more', cardBusy({ util: 30, freeMB: 9000 }) === true && cardBusy({ util: 3, freeMB: 9000 }) === false && cardBusy(null) === null);
check('quiet in Coding: back to Normal', idleSession({ session: 'coding' }, false) === 'normal');
check('quiet in Normal with a game running: into Gaming', idleSession({ session: 'normal' }, true) === 'light');
check('quiet in Gaming with the card busy: stays', idleSession({ session: 'light' }, true) === null);
check('quiet in Gaming once the card is free: back to Normal', idleSession({ session: 'light' }, false) === 'normal');
check('card unreadable: never leaves Gaming, otherwise Normal', idleSession({ session: 'light' }, null) === null && idleSession({ session: 'art' }, null) === 'normal');
check('setting off: no idle switching', idleSession({ session: 'coding', autoSession: false }, false) === null);
check('🎮 lock: no idle switching', idleSession({ session: 'light', gamingLock: true }, false) === null);
check('the chat line says where and why', switchLine('coding', 'for the fix') === '🛠 Switching to the Coding session for the fix.');

{
  const fake = (cfg, extra = {}) => ({ cfg, turns: new Map([['talk', {}]]), readCard: async () => ({ util: 85, freeMB: 2000 }), ...extra });
  const d1 = await decidePick(fake({ session: 'normal' }), { session: 'coding', why: 'for the fix' }, {});
  check('a pick switches', d1.switchTo === 'coding' && d1.why === 'for the fix');
  check('same session: carry on', !(await decidePick(fake({ session: 'coding' }), { session: 'coding' }, {})).switchTo);
  check('setting off: refused', /off/.test((await decidePick(fake({ session: 'normal', autoSession: false }), { session: 'art' }, {})).text));
  check('just switched for this job: no second switch', !(await decidePick(fake({ session: 'art' }), { session: 'coding' }, { job: { switchedTo: 'art' } })).switchTo);
  const two = fake({ session: 'normal' }); two.turns.set('side', {});
  check('something else running: stays put', !(await decidePick(two, { session: 'coding' }, {})).switchTo);
  check('in Gaming with a game on the card: stays, no question', /stay in Gaming/.test((await decidePick(fake({ session: 'light' }), { session: 'normal' }, {})).text));
  const free = fake({ session: 'light' }, { readCard: async () => ({ util: 2, freeMB: 14000 }) });
  check('in Gaming with the card free: leaves by himself', (await decidePick(free, { session: 'art' }, {})).switchTo === 'art');
  check('🎮 lock: refused even with the card free', !(await decidePick(fake({ session: 'light', gamingLock: true }, { readCard: async () => ({ util: 0, freeMB: 15000 }) }), { session: 'normal' }, {})).switchTo);
}

// ---------- A real switch through the queue ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-auto-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest', tinker: 'coder:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal' };
const events = [];
const brain = new Brain(cfg, (ev) => events.push(ev));
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
brain.readCard = async () => ({ util: 1, freeMB: 15000 });
const seen = [];
let script = [];
let unloads = 0;
brain.engine = { chat: async ({ tools, messages, model }) => { seen.push({ names: tools.map((t) => t.function.name), messages, model }); return script.shift() || { role: 'assistant', content: 'done' }; },
  unloadAll: async () => { unloads++; return []; }, loaded: async () => [], unload: async () => [] };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });

{
  script = [call('pick_session', { session: 'coding', why: 'for the shader fix' }), { role: 'assistant', content: 'Fixed it.' }];
  const { jobId } = brain.enqueue('main', 'fix the shader in my project and test it');
  const ok = await until(() => brain.queue.find((j) => j.id === jobId)?.state === 'done');
  const job = brain.queue.find((j) => j.id === jobId);
  check('pick_session is in the core tools', CORE.includes('pick_session') && seen[0]?.names.includes('pick_session'));
  check('the job ran again and finished', ok, job?.state);
  check('the session is now Coding, saved', cfg.session === 'coding' && JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8')).session === 'coding');
  check('the second run used the Coding brain', seen.at(-1)?.model === 'coder:latest', seen.at(-1)?.model);
  check('the old brains were let go on the switch', unloads >= 1);
  check('the chat said so once', events.filter((e) => e.type === 'announce' && /Coding session for the shader fix/.test(e.text)).length === 1);
  const msgs = brain.session('main');
  check('the request is in the chat once', msgs.filter((m) => m.role === 'user').length === 1, String(msgs.filter((m) => m.role === 'user').length));
  check('the second run got the hidden note', seen.at(-1)?.messages.some((m) => m.hidden && /switched to the Coding session/.test(m.content)) || msgs.some((m) => m.hidden && /switched to the Coding session/.test(m.content)));
  check('the picker is told Bob picked it', cfg.sessionBy === 'bob' && events.some((e) => e.type === 'session' && e.pickedBy === 'bob'));
  check('no session tip while Bob picks', !events.some((e) => e.type === 'suggest'));
}

{
  // Quiet again: back to Normal (the idle check, run straight away here).
  brain.lastActivity = 0;
  await brain.idleCheck();
  check('quiet: back to Normal', cfg.session === 'normal', cfg.session);
  check('the chat says where he went', events.some((e) => e.type === 'session' && e.by === 'idle' && /^☕ Back to the Normal session, the lightest one\.$/.test(e.line)));
  brain.readCard = async () => ({ util: 92, freeMB: 1200 });
  brain.lastActivity = 0;
  await brain.idleCheck();
  check('quiet with a game on the card: into Gaming', cfg.session === 'light', cfg.session);
  brain.readCard = async () => ({ util: 0, freeMB: 15000 });
}

{
  // The 🎮 button: a running job is put aside, not cancelled, and carries on after.
  cfg.session = 'normal';
  let release;
  brain.engine.chat = async ({ signal }) => new Promise((resolve, reject) => { release = resolve; signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
  const { jobId } = brain.enqueue('main', 'write me a long report');
  await until(() => brain.turns.size === 1);
  const before = unloads;
  const r = await brain.setGamingLock(true);
  const job = brain.queue.find((j) => j.id === jobId);
  check('🎮 on: Gaming, saved', r.on && cfg.session === 'light' && cfg.gamingLock === true);
  check('🎮 on: the card is cleared', unloads > before);
  check('🎮 on: the running job waits in Tasks (not cancelled)', job.state === 'waiting' && job.parked === true, job.state);
  await wait(50);
  check('🎮 on: it doesn\'t start again while locked', job.state === 'waiting' && brain.turns.size === 0);
  brain.engine.chat = async () => ({ role: 'assistant', content: 'Here it is.' });
  await brain.setGamingLock(false);
  check('🎮 off: back to Normal', cfg.session === 'normal' && cfg.gamingLock === false);
  check('🎮 off: the job carries on and finishes', await until(() => job.state === 'done'), job.state);
  void release;
}

{
  // Picking another session by hand ends the lock.
  await brain.setGamingLock(true);
  await brain.setSession('art', { by: 'you' });
  check('a hand pick shows as yours', cfg.sessionBy === 'you');
  check('a hand pick ends the 🎮 lock', cfg.gamingLock === false && cfg.session === 'art');
}

{
  // Setting off: no tool, no prompt line.
  cfg.autoSession = false;
  seen.length = 0;
  brain.engine.chat = async ({ tools, messages }) => { seen.push({ names: tools.map((t) => t.function.name), messages }); return { role: 'assistant', content: 'hi' }; };
  const { jobId } = brain.enqueue('main', 'hello');
  await until(() => brain.queue.find((j) => j.id === jobId)?.state === 'done');
  check('setting off: pick_session isn\'t sent', seen.length && !seen[0].names.includes('pick_session'));
  check('setting off: no prompt line', seen.length && !/pick_session/.test(seen[0].messages[0].content));
}

clearTimeout(brain.idleTimer); clearTimeout(brain.probeTimer);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
