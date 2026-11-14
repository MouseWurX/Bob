// Stop and wait words (src/stop-words.js): a whole short message, while a job of yours runs, waits or is paused, is a
// command the app carries out at once: stop, wrap up, pause, delay (with a time it comes back by itself), alarm (paused
// just in case) and resume. The same words inside a sentence are normal messages. The owner, Nov 13: "we need to be
// very careful with the word triggers", so most of this file is the list of what must and must not trigger.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain.js';
import { mergeSettings } from '../src/config.js';
import { stopWordsOn, readStopWord, targetJob, LINES, MAX_DELAY_MS } from '../src/stop-words.js';
import { replyTag, maybeTag, quickPrompt } from '../src/mid-job.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

// ---------- The switch ----------
check('on unless switched off', stopWordsOn({}) && stopWordsOn({ stopWords: true }) && !stopWordsOn({ stopWords: false }));
check('saved: only false turns it off', mergeSettings({}, { stopWords: false }).stopWords === false && mergeSettings({}, { stopWords: 'x' }).stopWords === true);

// ---------- The trigger table ----------
export const TABLE = {
  stop: ['stop', 'Stop!', 'STOP', 'stop stop stop', 'stop it', 'stop that', 'stop now', 'stop everything', 'stop what you\'re doing', 'ok stop', 'bob stop', 'please stop', 'hey stop', 'whoa stop',
    'cancel', 'cancel it', 'cancel that', 'cancel the job', 'abort', 'abort!', 'halt', 'quit', 'kill it', 'belay', 'belay that', 'belay that order', 'scrap that', 'forget it', 'never mind', 'nevermind', 'nvm',
    'no no', 'no no no', 'No, no!', 'nooo', 'noooo', 'nope nope', 'no stop', 'no, stop.', 'no no stop', 'wait stop', 'no! stop!', 'no', 'No.', 'nope', 'nah', "don't", 'don’t', 'dont do that', 'cut it out', '🛑 stop'],
  wrap: ['enough', "that's enough", 'thats enough now', "that'll do", 'wrap it up', 'wrap up', 'stop after this step', 'you can stop now'],
  pause: ['wait', 'Wait!', 'wait wait', 'wait up', 'wait a sec', 'wait a minute', 'pause', 'pause it', 'pause the job', 'hold', 'hold on', 'hold up', 'hold it', 'hold off', 'hang on', 'hang on a sec', 'one sec', 'one moment', 'just a minute', 'give me a sec', 'sec', 'freeze', 'stand by', 'ok wait', 'hold on a second', 'wait for now'],
  delay: ['delay', 'delay it', 'later', 'do it later', 'not now', 'not yet', 'maybe later', 'come back to it later', 'put it on hold', 'park it'],
  alarm: ['what are you doing', 'what are you doing?!', 'WHAT ARE YOU DOING', 'what the fuck', 'what the fucks', 'wtf', 'WTF?!', 'what the hell', 'what the heck', 'wth', 'why are you doing that', 'why did you do that', 'what did you just do', 'oh no', 'oh god', 'omg', 'fuck', 'shit', 'damn', 'what the f***', 'no what are you doing'],
  resume: ['go', 'go on', 'Go on.', 'go ahead', 'carry on', 'continue', 'keep going', 'resume', 'unpause', 'proceed', 'as you were', 'back to it', 'ok go', 'ok, go on', 'yes go ahead', 'you can continue', 'okay carry on', 'fine, continue', 'sorry, go on', 'false alarm, carry on', 'all good, keep going', 'my bad, continue', 'you got it', "you've got it", 'go for it', 'do it', 'start again']
};
// Never a command: the words inside normal messages, questions, and plain answers.
export const NOT = ["don't stop the server", 'how do I pause a video?', 'stop the music when the song ends', 'wait for the download, then install it', 'can you cancel my 3pm meeting?',
  'no, I meant the other file', 'no, use python', 'no thanks', 'no worries', 'hold the shift key down', 'later today write me a poem', 'go to the settings page', 'continue the story where it ended',
  'what are you doing tomorrow?', 'how is it going?', 'what is that?', 'stop being so formal', 'the stop button does nothing', 'fuck yeah', 'shit, I forgot the milk', 'damn that looks good', 'hey', 'hey bob', 'hi',
  'wait, use the other file', 'stop, use metres instead', 'pause music', 'is there a way to delay an email?', 'cancel culture is weird', 'no idea', 'ok', 'yes', 'thanks', 'what does belay mean?',
  'go on then, tell me a joke about cats and dogs', 'keep going with the list but make it shorter', 'stop\nand write the summary', 'a'.repeat(100) + ' stop'];

for (const [kind, list] of Object.entries(TABLE)) {
  const wrong = list.filter((t) => readStopWord(t)?.kind !== kind);
  check(`${kind}: ${list.length} ways of saying it`, !wrong.length, wrong.map((t) => `"${t}" -> ${readStopWord(t)?.kind || 'nothing'}`).join(', '));
}
const fired = NOT.filter((t) => readStopWord(t));
check(`${NOT.length} normal messages never trigger`, !fired.length, fired.map((t) => `"${t}" -> ${readStopWord(t).kind}`).join(', '));

// Timed delays.
const ms = (t) => readStopWord(t)?.ms;
check('timed: "wait 10 minutes", "pause for an hour", "delay it 5 min", "give me 2 minutes", "do it in 20 minutes", "wait 30 seconds"',
  ms('wait 10 minutes') === 600e3 && ms('pause for an hour') === 3600e3 && ms('delay it 5 min') === 300e3 && ms('give me 2 minutes') === 120e3 && ms('do it in 20 minutes') === 1200e3 && ms('wait 30 seconds') === 30e3 && ms('hold on two hours') === 7200e3 && ms('wait half an hour') === 1800e3,
  [ms('wait 10 minutes'), ms('pause for an hour'), ms('delay it 5 min'), ms('give me 2 minutes'), ms('do it in 20 minutes'), ms('wait 30 seconds'), ms('hold on two hours'), ms('wait half an hour')].join(','));
check('a delay over a day is a plain pause', readStopWord('wait 30 hours')?.kind === 'pause' && MAX_DELAY_MS === 864e5);
check('"wait a minute" is a pause, not a timed delay', readStopWord('wait a minute')?.kind === 'pause' && !readStopWord('wait a minute').ms);

// A bare "no" while a card or question waits for an answer is left to answer it.
check('a bare "no" answers an open card, not a stop', readStopWord('no', { asking: true }) === null && readStopWord('no no', { asking: true }) === null && readStopWord('no, stop', { asking: true })?.kind === 'stop' && readStopWord('stop', { asking: true })?.kind === 'stop');

// Which job.
{
  const q = [{ id: 'a', sessionId: 'x', state: 'working' }, { id: 'b', sessionId: 'y', state: 'waiting' }, { id: 'c', sessionId: 'y', state: 'paused', pausedAt: 1 }, { id: 'd', sessionId: 'y', state: 'paused', pausedAt: 2 }, { id: 'g', sessionId: 'z', state: 'working', guest: {} }];
  check('the job running in this chat', targetJob(q, 'x', 'stop')?.id === 'a');
  check('else the newest waiting in this chat', targetJob(q, 'y', 'stop')?.id === 'b');
  check('else the only job of yours running anywhere', targetJob(q, 'nowhere', 'pause')?.id === 'a');
  check('resume: the newest paused in this chat only', targetJob(q, 'y', 'resume')?.id === 'd' && targetJob(q, 'x', 'resume') === null);
  check('a guest\'s job is never the target', targetJob([{ id: 'g', sessionId: 'z', state: 'working', guest: {} }], 'z', 'stop') === null);
}

// The brain's own read of an unclear message (quick reply between steps).
check('[STOP] and [PAUSE] tags', replyTag('[STOP]') === 'stop' && replyTag('PAUSE') === 'pause' && maybeTag('[ST') && maybeTag('[PAU') && !maybeTag('Sure') && !maybeTag('Stopping now'));
check('the tags are offered only in the job\'s own chat, with the switch on', /\[STOP\]/.test(quickPrompt({ unsure: true, sameChat: true, stopTags: true })) && !/\[STOP\]/.test(quickPrompt({ unsure: true, sameChat: true })) && !/\[STOP\]/.test(quickPrompt({ unsure: true, stopTags: true })));

// ---------- Real turns, with a scripted brain ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-stopwords-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false, webSearch: true };
const events = [];
const brain = new Brain(cfg, (ev) => events.push(ev));
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
let during = null; // what the user sends while the step runs
let stepMs = 30;
brain.tools.fetch_page = { ...brain.tools.fetch_page, run: async ({ url }, ctx) => { const f = during; during = null; f?.(); for (let i = 0; i < stepMs / 10 && !ctx?.signal?.aborted; i++) await wait(10); return `Page text of ${url}: the word is PLUM`; } };
const calls = [];
let script = [], quick = [];
brain.engine = { chat: async ({ tools, messages, signal }) => {
  if (signal?.aborted) throw Object.assign(new Error('stopped'), { name: 'AbortError' });
  const isQuick = /stopped between two steps/.test(String(messages[0]?.content || ''));
  calls.push({ quick: isQuick, names: (tools || []).map((t) => t.function.name), messages });
  if (isQuick) return quick.shift() || { role: 'assistant', content: 'Quick answer.' };
  return script.shift() || { role: 'assistant', content: 'done' };
}, unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const job = (id) => brain.queue.find((j) => j.id === id);
const settled = (id) => ['done', 'failed', 'cancelled', 'paused'].includes(job(id)?.state);
const notes = (sid) => events.filter((e) => e.type === 'busy-note' && e.sessionId === sid).map((e) => e.text);

{
  // "no no" mid-step: stopped at once, not after a reply.
  calls.length = 0; events.length = 0; stepMs = 400;
  script = [call('fetch_page', { url: 'https://example.org/a' }), call('fetch_page', { url: 'https://example.org/b' }), { role: 'assistant', content: 'All done.' }];
  let r;
  during = () => { r = brain.enqueue('main', 'no no'); };
  const t0 = Date.now();
  const { jobId } = brain.enqueue('main', 'read https://example.org/a then https://example.org/b');
  await until(() => settled(jobId));
  check('"no no": the job is stopped, not answered', job(jobId).state === 'cancelled' && r?.heard === 'stop' && !r.jobId && !calls.some((c) => c.quick), `${job(jobId).state} ${JSON.stringify(r)}`);
  check('it stopped mid-step, without waiting for the step', Date.now() - t0 < 1500 && !calls.some((c) => c.quick), `${Date.now() - t0} ms, ${calls.length} calls`);
  await wait(20);
  check('a one-line bubble said so', notes('main').includes(LINES.stop), JSON.stringify(events.filter((e) => e.type === 'busy-note')));
}
{
  // "hold on" pauses; "go on" carries on from the last finished step.
  calls.length = 0; events.length = 0; stepMs = 200;
  script = [call('fetch_page', { url: 'https://example.org/c' }), { role: 'assistant', content: 'Carried on and finished.' }];
  during = () => brain.enqueue('main', 'hold on');
  const { jobId } = brain.enqueue('main', 'read https://example.org/c');
  await until(() => settled(jobId));
  await wait(20);
  check('"hold on": paused in Tasks', job(jobId).state === 'paused' && notes('main').includes(LINES.pause), JSON.stringify(notes('main')));
  const r = brain.enqueue('main', 'ok, go on');
  check('"ok, go on": resumed', r.heard === 'resume' && ['waiting', 'working'].includes(job(jobId).state));
  stepMs = 10;
  await until(() => job(jobId).state === 'done');
  check('then it finished', job(jobId).state === 'done');
  check('"go on" with nothing paused is a normal message', brain.enqueue('main', 'go on').jobId != null);
  await until(() => !brain.queue.some((j) => j.state === 'waiting' || j.state === 'working'));
}
{
  // "wait 1 minute" (fake clock): paused, then picks itself back up when the time is up.
  events.length = 0; stepMs = 200;
  script = [call('fetch_page', { url: 'https://example.org/d' }), { role: 'assistant', content: 'Done later.' }];
  during = () => brain.enqueue('main', 'wait 2 seconds');
  const { jobId } = brain.enqueue('main', 'read https://example.org/d');
  await until(() => settled(jobId));
  await wait(20);
  check('"wait 2 seconds": paused with a wake-up time', job(jobId).state === 'paused' && job(jobId).resumeAt > 0 && notes('main').some((t) => /pick it back up in 2 seconds/.test(t)), `${job(jobId).state} ${job(jobId).resumeAt} ${notes('main').join(' | ')}`);
  stepMs = 10;
  await until(() => job(jobId).state === 'done', 5000);
  check('it came back by itself and finished', job(jobId).state === 'done' && notes('main').includes(LINES.resumedLater) && !job(jobId).resumeAt);
}
{
  // "what are you doing?!": paused just in case, with what it was on.
  events.length = 0; stepMs = 200;
  script = [call('fetch_page', { url: 'https://example.org/e' }), { role: 'assistant', content: 'x' }];
  during = () => brain.enqueue('main', 'what are you doing?!');
  const { jobId } = brain.enqueue('main', 'read https://example.org/e');
  await until(() => settled(jobId));
  await wait(20);
  check('"what are you doing?!": paused, not stopped, and says how to go on', job(jobId).state === 'paused' && notes('main').some((t) => /^⏸ Paused, just in case\./.test(t) && /"stop"/.test(t) && /"go on"/.test(t)), notes('main').join(' | '));
  const sr = brain.enqueue('main', 'stop');
  check('"stop" while paused ends it', sr.heard === 'stop' && job(jobId).state === 'cancelled', JSON.stringify(sr) + job(jobId).state);
}
{
  // Inside a sentence it's a normal message (answered between steps, the job carries on).
  calls.length = 0; events.length = 0; stepMs = 50;
  script = [call('fetch_page', { url: 'https://example.org/f' }), { role: 'assistant', content: 'Finished.' }];
  quick = [{ role: 'assistant', content: 'Use the Stop button in your player.' }];
  let r;
  during = () => { r = brain.enqueue('main', 'how do I pause a video?'); };
  const { jobId } = brain.enqueue('main', 'read https://example.org/f');
  await until(() => job(jobId)?.state === 'done' && r && job(r.jobId)?.state === 'done');
  check('"how do I pause a video?" is answered and the job finishes', job(jobId).state === 'done' && !r.heard && calls.some((c) => c.quick));
}
{
  // The brain reads an unclear one as [STOP]: the app stops the job.
  calls.length = 0; events.length = 0; stepMs = 50;
  script = [call('fetch_page', { url: 'https://example.org/g' }), call('fetch_page', { url: 'https://example.org/h' }), { role: 'assistant', content: 'x' }];
  quick = [{ role: 'assistant', content: '[STOP]' }];
  during = () => brain.enqueue('main', 'right, hang fire on all of that mate');
  const { jobId } = brain.enqueue('main', 'read https://example.org/g then https://example.org/h');
  await until(() => settled(jobId));
  check('brain says [STOP]: the job is stopped', job(jobId).state === 'cancelled' && calls.some((c) => c.quick) && notes('main').includes(LINES.stop), job(jobId).state);
}
{
  // Switched off: "no no" is a plain message again.
  brain.cfg.stopWords = false;
  events.length = 0; stepMs = 50;
  script = [call('fetch_page', { url: 'https://example.org/i' }), { role: 'assistant', content: 'Finished.' }];
  quick = [{ role: 'assistant', content: 'Okay.' }];
  let r;
  during = () => { r = brain.enqueue('main', 'no no'); };
  const { jobId } = brain.enqueue('main', 'read https://example.org/i');
  await until(() => job(jobId)?.state === 'done');
  check('off: "no no" doesn\'t stop the job', job(jobId).state === 'done' && !r.heard);
  brain.cfg.stopWords = undefined;
}
{
  // A guest (another Bob, Discord, Telegram) can't stop your job with words.
  const fake = { cfg: {}, queue: [{ id: 'j', sessionId: 's', state: 'working' }], approvals: new Map(), cancelJob: () => { throw new Error('no'); } };
  const { heedStopWord } = await import('../src/stop-words.js');
  check('guests can\'t', heedStopWord(fake, 's', 'stop', [], { guest: { from: 'x' } }) === null);
  const other = { cfg: {}, queue: [{ id: 'j', sessionId: 's', state: 'working' }], approvals: new Map(), log() {}, broadcast() {}, saveQueue() {}, cancelJob: () => true, pauseJob: () => true };
  check('a bare "no" or "wtf" in another chat leaves your job alone', heedStopWord(other, 'elsewhere', 'no') === null && heedStopWord(other, 'elsewhere', 'wtf') === null);
  check('"stop" in another chat stops your only running job', heedStopWord(other, 'elsewhere', 'stop')?.heard === 'stop');
  const parked = { ...other, queue: [{ id: 'p', sessionId: 's', state: 'paused', pausedAt: 1 }] };
  check('a paused job isn\'t ended by a bare "no"', heedStopWord(parked, 's', 'no') === null && parked.queue[0].state === 'paused');
  check('"cancel" ends a paused job', heedStopWord(parked, 's', 'cancel')?.heard === 'stop' && parked.queue[0].state === 'cancelled');
  const asking = { ...other, approvals: new Map([['card', () => {}]]) };
  check('with an OK card open, a bare "no" is left for the card', heedStopWord(asking, 's', 'no') === null && heedStopWord(asking, 's', 'stop')?.heard === 'stop');
}

// ---------- Settings, Help, glossary, FAQ, and no brain context ----------
const cellar = publicText('cellar.js');
check('the switch in Settings, Brains, on to start with', /sswitch\('stopWords', settings\.stopWords !== false, 'Stop and wait words'/.test(cellar) && /dataset\.set === 'stopWords'/.test(cellar));
const help = HELP.find((e) => e.id === 'stop-words');
check('Help in Bob\'s voice, says where it works', help && /Windows, Mac, Linux and Android/.test(help.html) && /\bI\b/.test(help.html));
check('glossary and FAQ', HELP.find((e) => e.id === 'glossary').html.includes('<dt>Stop and wait words</dt>') && HELP.some((e) => e.id === 'faq-stop-words' && e.group === 'FAQ'));
check('nothing added to the start-of-job prompt', !/\[STOP\]|stop and wait/i.test(read('src/prompts.js')));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
