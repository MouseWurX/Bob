// Answer messages between steps (src/mid-job.js): on unless switched off; a message sent during a job is sorted and
// handled at the job's next step boundary on the loaded brain (quick reply from its own small context, new work to
// Tasks, a change or "stop" folded into the job), and the job then carries on from the same step, untouched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain, besideBigOk } from '../src/brain.js';
import { mergeSettings } from '../src/config.js';
import { midJobOn, sortMessage, replyTag, maybeTag, jobLine, quickPrompt, quickHistory, midJobFits } from '../src/mid-job.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

// ---------- The switch ----------
check('on unless switched off', midJobOn({}) && midJobOn({ answerMidJob: true }) && !midJobOn({ answerMidJob: false }));
check('saved: only false turns it off', mergeSettings({}, { answerMidJob: false }).answerMidJob === false && mergeSettings({}, { answerMidJob: 'x' }).answerMidJob === true);
check('not for guests, pictures, a rented brain or Try again', !midJobFits({}, { id: 'm' }, { guest: {} }) && !midJobFits({}, { id: 'm' }, {}, ['pic']) && !midJobFits({}, { id: 'm' }, { rent: true }) && !midJobFits({}, { id: 'm' }, { redo: 'again' }) && midJobFits({}, { id: 'm' }, {}));

// ---------- Sorting ----------
const same = { sameChat: true };
check('"stop" in the job\'s chat is stop', ['stop', 'Stop!', 'ok stop', 'never mind', 'wrap it up', 'stop after this step'].every((t) => sortMessage(t, same) === 'stop'));
check('"stop" in another chat is not', sortMessage('stop') !== 'stop');
check('"stop doing X" is not a bare stop', sortMessage('stop using feet, use metres', same) !== 'stop');
check('changes in the job\'s chat', ['also add a table', 'use the other file', "actually, don't touch the tests", 'make it shorter', 'instead write it in French', 'skip the intro'].every((t) => sortMessage(t, same) === 'change'));
check('questions and chit-chat get a quick reply', ["how's it going?", 'what is the capital of France?', 'thanks!', 'hi bob', 'status?'].every((t) => sortMessage(t) === 'answer'));
check('new work goes to Tasks', ['write me a poem about cats', 'can you make a picture of a dog?', 'find the cheapest flights to Paris', 'please summarise this article'].every((t) => sortMessage(t) === 'task'));
check('unclear goes to the brain', sortMessage('the dog ate my homework') === '');
check('the brain\'s tag', replyTag('[TASK]') === 'task' && replyTag(' CHANGE ') === 'change' && replyTag('Sure, Paris.') === '');
check('a tag is held back while it streams', maybeTag('[') && maybeTag('[TA') && maybeTag('CHAN') && !maybeTag('Paris') && !maybeTag('Tasks are'));

// ---------- The quick reply's own context ----------
{
  const line = jobLine({ title: 'Fix the login page', startedAt: 0, steps: [{ what: 'read server.js' }, { what: 'edited login.js' }] }, 5 * 60000);
  check('the job line', /"Fix the login page", 5 minutes in, 2 steps done \(last: edited login\.js\)/.test(line), line);
  const p = quickPrompt({ who: 'Sam', line, unsure: true, sameChat: true });
  check('the prompt is short and has the tags only when unsure', p.split(/\s+/).length < 110 && /\[TASK\]/.test(p) && /\[CHANGE\]/.test(p) && !/\[TASK\]/.test(quickPrompt({ who: 'Sam', line })));
  check('no [CHANGE] from another chat', !/\[CHANGE\]/.test(quickPrompt({ who: 'Sam', line, unsure: true })));
  const h = quickHistory([{ role: 'user', content: 'a' }, { role: 'assistant', content: '', tool_calls: [{}] }, { role: 'tool', content: 'secret result' }, { role: 'system', content: 'note', hidden: true }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'd' }, { role: 'user', content: 'e' }, { role: 'assistant', content: 'f' }]);
  check('history: words only, the last few', h.length === 4 && h.every((m) => ['user', 'assistant'].includes(m.role) && m.content) && !h.some((m) => /secret/.test(m.content)) && h[3].content === 'f');
}

// ---------- Real turns, with a scripted brain ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-midjob-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false, webSearch: true };
const events = [];
const brain = new Brain(cfg, (ev) => events.push(ev));
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
let during = null; // what the user sends while the step runs
brain.tools.fetch_page = { ...brain.tools.fetch_page, run: async ({ url }) => { const f = during; during = null; f?.(); await wait(30); return `Page text of ${url}: the secret word is PLUM`; } };
const calls = []; // every brain call: { quick, names, messages }
let script = [], quick = [];
brain.engine = { chat: async ({ tools, messages, model }) => {
  const isQuick = /stopped between two steps/.test(String(messages[0]?.content || ''));
  calls.push({ quick: isQuick, names: (tools || []).map((t) => t.function.name), messages, model });
  if (isQuick) return quick.shift() || { role: 'assistant', content: 'Quick answer.' };
  return script.shift() || { role: 'assistant', content: 'done' };
}, unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const stateOf = (id) => brain.queue.find((j) => j.id === id)?.state;
const finished = (id) => ['done', 'failed', 'cancelled'].includes(stateOf(id));

{
  calls.length = 0; events.length = 0;
  script = [call('fetch_page', { url: 'https://example.org/a' }), call('fetch_page', { url: 'https://example.org/b' }), { role: 'assistant', content: 'The page says PLUM.' }];
  quick = [{ role: 'assistant', content: 'Paris.' }];
  const sent = {};
  during = () => {
    sent.q = brain.enqueue('main', 'what is the capital of France?').jobId;
    sent.task = brain.enqueue('other', 'write me a poem about cats').jobId;
    sent.change = brain.enqueue('main', 'also say which page it was on').jobId;
  };
  const { jobId } = brain.enqueue('main', 'read https://example.org/a and tell me the secret word');
  await until(() => finished(jobId) && sent.task && finished(sent.task));
  const q = brain.queue.find((j) => j.id === sent.q);
  check('the question was answered mid-job, before the job ended', q?.state === 'done' && q.doneAt < brain.queue.find((j) => j.id === jobId).doneAt);
  const qc = calls.find((c) => c.quick);
  check('one quick call, on the same brain, with no tools', calls.filter((c) => c.quick).length === 1 && qc.names.length === 0 && qc.model === calls[0].model);
  const qText = JSON.stringify(qc.messages);
  check('the quick reply sees none of the job\'s working-out', !/PLUM/.test(qText) && !/tool_calls/.test(qText) && qc.messages.at(-1).content === 'what is the capital of France?');
  check('it knows what the job is', /read https:\/\/example\.org\/a/.test(qc.messages[0].content) && /1 step done/.test(qc.messages[0].content), qc.messages[0].content);
  const after = calls.filter((c) => !c.quick)[2] || calls.filter((c) => !c.quick)[1];
  const jobSees = JSON.stringify(calls.filter((c) => !c.quick)[1].messages);
  check('the job carried on with its own context (its tool result, no side chat)', /PLUM/.test(jobSees) && !/Paris/.test(jobSees) && !/capital of France/.test(jobSees));
  check('"also..." was added to the job at that step', /also say which page it was on/.test(jobSees) && brain.queue.find((j) => j.id === sent.change)?.state === 'done');
  check('new work went to Tasks with a line, and ran after the job', events.some((e) => e.type === 'busy-note' && e.sessionId === 'other' && /new job, so it's in Tasks/.test(e.text)) && brain.queue.find((j) => j.id === sent.task).startedAt >= brain.queue.find((j) => j.id === jobId).doneAt);
  check('the quick reply streamed as its own turn', events.some((e) => e.type === 'token' && e.turnId === sent.q && e.text === 'Paris.') && events.some((e) => e.type === 'done' && e.turnId === sent.q));
  check('the job\'s next words start a new bubble', events.some((e) => e.type === 'reply-break' && e.turnId === jobId));
  const chat = brain.session('main').filter((m) => m.role === 'user' || (m.role === 'assistant' && String(m.content || '').trim())).map((m) => m.content);
  check('the chat reads in order: job ask, quick ask, quick answer, change, job answer', chat.join(' | ') === 'read https://example.org/a and tell me the secret word | what is the capital of France? | Paris. | also say which page it was on | The page says PLUM.', chat.join(' | '));
  check('only the job ran tools; nothing was waiting at the end', after && !brain.queue.some((j) => j.state === 'waiting'));
}
{
  // "stop" in the job's chat: the step finishes, then no more tools.
  calls.length = 0;
  script = [call('fetch_page', { url: 'https://example.org/c' }), call('fetch_page', { url: 'https://example.org/d' }), { role: 'assistant', content: 'Stopped with what I had.' }];
  let stopId;
  brain.cfg.stopWords = false; // Stop and wait words off: the old "stop after this step" between steps
  during = () => { stopId = brain.enqueue('main', 'stop').jobId; };
  const { jobId } = brain.enqueue('main', 'read https://example.org/c and then https://example.org/d');
  await until(() => finished(jobId));
  const main = calls.filter((c) => !c.quick);
  brain.cfg.stopWords = undefined;
  check('"stop": no brain call for it, and the next round has no tools', !calls.some((c) => c.quick) && main.length >= 2 && main.slice(1).every((c) => c.names.length === 0) && stateOf(stopId) === 'done');
}
{
  // An unclear message the brain calls new work.
  calls.length = 0; events.length = 0;
  script = [call('fetch_page', { url: 'https://example.org/e' }), { role: 'assistant', content: 'Done.' }];
  quick = [{ role: 'assistant', content: '[TASK]' }];
  let id;
  during = () => { id = brain.enqueue('other', 'the garden needs a watering plan for summer').jobId; };
  const { jobId } = brain.enqueue('main', 'read https://example.org/e');
  await until(() => finished(jobId) && id && finished(id));
  check('[TASK] from the brain: in Tasks, no half-answer shown', events.some((e) => e.type === 'busy-note' && /in Tasks/.test(e.text)) && !events.some((e) => e.type === 'token' && e.turnId === id && /TASK/.test(e.text)) && calls.filter((c) => c.quick).length === 1);
}
{
  // Off: the message waits for the job, as before.
  brain.cfg.answerMidJob = false;
  calls.length = 0;
  script = [call('fetch_page', { url: 'https://example.org/f' }), { role: 'assistant', content: 'Done.' }];
  let id;
  during = () => { id = brain.enqueue('main', 'what is the capital of France?').jobId; };
  const { jobId } = brain.enqueue('main', 'read https://example.org/f');
  await until(() => finished(jobId) && id && finished(id));
  check('off: no quick reply mid-job; it runs after', !calls.some((c) => c.quick) && brain.queue.find((j) => j.id === id).startedAt >= brain.queue.find((j) => j.id === jobId).doneAt);
  brain.cfg.answerMidJob = undefined;
}
{
  // No second brain beside a text job while this is on.
  const fake = { cfg: { engine: 'llamacpp', chatWhileBusy: true }, engine: { besideServer() {} }, turns: new Map([['talk', {}]]), queue: [], state: { state: 'thinking' } };
  check('no second brain beside a text job', besideBigOk(fake, { kind: 'chat', refs: [] }, { freeMem: 64 * 1024 ** 3 }) === false);
}

// ---------- Settings, Help, glossary, FAQ ----------
const cellar = publicText('cellar.js');
check('the switch in Settings, Brains, on to start with', /sswitch\('answerMidJob', settings\.answerMidJob !== false, 'Answer messages between steps'/.test(cellar) && /data\.set === 'answerMidJob'|dataset\.set === 'answerMidJob'/.test(cellar));
const help = HELP.find((e) => e.id === 'mid-job');
check('Help in Bob\'s voice, says where it works', help && /Windows, Mac, Linux and Android/.test(help.html) && /\bI\b/.test(help.html));
check('glossary and FAQ', HELP.find((e) => e.id === 'glossary').html.includes('<dt>Step boundary</dt>') && HELP.some((e) => e.id === 'faq-mid-job' && e.group === 'FAQ'));
check('nothing added to the start-of-job prompt', !/between two steps|Answer messages between steps/.test(read('src/prompts.js')));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
