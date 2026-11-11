// Let Bob's Quick brain see the big job (src/meanwhile.js): off unless turned on, the Meanwhile line written by the app,
// look_at_job and pass_note only in a quick reply beside a job, notes read by the big brain at its next step, the
// honesty check on guesses about the job, the switch in Settings and the first-time setup, and Help, glossary and FAQ.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain, claimsObservation, meanwhileNear, SIDE_LANE } from '../src/brain.js';
import { mergeSettings } from '../src/config.js';
import { JobWatch, meanwhileOn, meanwhileLine, jobDetail, watchTools, claimsJobGuess, noteForBig, noteAsk, asksAboutJob, statusLine, STEP_KEEP, NOTES_MAX } from '../src/meanwhile.js';
import { WANTS, wantsHtml } from '../public/wants.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const words = (s) => String(s).split(/\s+/).filter(Boolean).length;

// ---------- The switch ----------
check('off unless turned on', !meanwhileOn({}) && !meanwhileOn({ quickSeesJob: 'yes' }) && meanwhileOn({ quickSeesJob: true }));
check('needs Keep chatting while Bob is busy', !meanwhileOn({ quickSeesJob: true, chatWhileBusy: false }));
check('only true turns it on when saved', mergeSettings({}, { quickSeesJob: 'true' }).quickSeesJob === false && mergeSettings({}, { quickSeesJob: true }).quickSeesJob === true);

// ---------- The record and the Meanwhile line ----------
{
  const w = new JobWatch();
  const job = { id: 'j1', text: 'Fix the login page so the password box shows an error when it is empty', startedAt: 0 };
  w.start({ id: 's', side: true, text: 'hi' });
  check('a quick reply never gets a record of its own', w.job === null);
  w.start(job, { session: 'Coding' });
  check('no line without a job', meanwhileLine(null) === '');
  const first = meanwhileLine(w.job, 20_000);
  check('the line before any step', /no steps yet/.test(first) && /under a minute in/.test(first) && /Coding session/.test(first), first);
  w.plan(job, 6);
  w.step(job, 'read server.js', 60_000); w.result(job, 'const x = 1; ... 300 lines');
  w.step(job, 'edited login.js', 120_000);
  const line = meanwhileLine(w.job, 6 * 60_000);
  check('the line: job, minutes, step N of about M, last step still going', /"Fix the login page/.test(line) && /6 minutes in/.test(line) && /step 2 of about 6/.test(line) && /edited login\.js, still going/.test(line), line);
  check('the line is short (about 40 tokens of facts plus the rule)', words(line) <= 70, String(words(line)));
  check('the line tells the Quick brain never to guess the time left', /Never guess how long it has left/.test(line));
  w.result(job, 'Error: the file is read-only');
  check('a failed step reads as failed', /edited login\.js, it failed/.test(meanwhileLine(w.job, 0)));
  w.step(job, 'step 3', 0); w.step(job, 'step 4', 0); w.step(job, 'step 5', 0); w.step(job, 'step 6', 0); w.step(job, 'step 7', 0);
  check('past the plan: no "of about"', /step 7;/.test(meanwhileLine(w.job, 0)) && !/of about/.test(meanwhileLine(w.job, 0)));
  for (let i = 0; i < STEP_KEEP + 10; i++) w.step(job, `s${i}`, 0);
  check('only the newest steps are kept', w.job.steps.length === STEP_KEEP);
  w.think(job, 'x'.repeat(10_000));
  check('only the newest thinking is kept', w.job.thinking.length === 6000);
  const off = jobDetail(w.job, { thinkingOn: false });
  check('look closer: steps listed, thinking not passed with the window closed', /Steps so far/.test(off) && /isn't passed along/.test(off) && !/xxxx/.test(off));
  check('look closer: thinking with the window open', /xxxx/.test(jobDetail(w.job, { thinkingOn: true })));
  check('another job\'s steps never land on this one', (w.step({ id: 'other' }, 'nope'), !w.job.steps.some((s) => s.what === 'nope')));

  // ---------- Notes ----------
  check('a note needs words', /empty/.test(w.note('   ').error || ''));
  check('a note is queued', w.note('use metres, not feet').ok && /a note is waiting/.test(meanwhileLine(w.job, 0)));
  for (let i = 1; i < NOTES_MAX; i++) w.note(`note ${i}`);
  check('at most a few notes wait at once', /already waiting/.test(w.note('one too many').error || ''));
  const got = w.takeNotes(job);
  check('the big brain takes each note once', got.length === NOTES_MAX && w.takeNotes(job).length === 0);
  check('the note says it is not an order to stop', /not an order to stop/.test(noteForBig(got, 'Sam')) && /Stop button/.test(noteForBig(got, 'Sam')));
  w.end('someone-else');
  check('ending another job leaves this one', w.job?.id === 'j1');
  w.end('j1');
  check('no job: no note', /No job is running/.test(w.note('hi').error || ''));
}

// ---------- The tools ----------
{
  const brain = { cfg: {}, log: () => {}, watch: new JobWatch(), mindWatchers: () => 0 };
  const t = watchTools(brain);
  check('off: the tools say so', /is off/.test(await t.look_at_job.run({}, { job: { side: true } })));
  brain.cfg.quickSeesJob = true;
  check('only in a quick reply beside a job', /only for a quick reply/.test(await t.pass_note.run({ note: 'x' }, { job: { id: 'big' } })));
  check('no job running: said plainly', /No job is running/.test(await t.look_at_job.run({}, { job: { side: true } })));
  brain.watch.start({ id: 'b1', text: 'Write a song', startedAt: Date.now() });
  const r = await t.pass_note.run({ note: 'make it faster' }, { job: { side: true } });
  check('pass_note: passed along, and Bob says so', /Passed along/.test(r) && brain.watch.job.notes[0].text === 'make it faster');
  check('pass_note never stops the job: its own words point at the Stop button', /Never to stop or pause it/.test(t.pass_note.schema.function.description) && /press Stop/.test(t.pass_note.schema.function.description));
}

// ---------- PC test 1.5.203: a long answer with no steps, and notes that came too late ----------
{
  const w = new JobWatch();
  const job = { id: 'lh', text: 'Write a 6,000-word history of lighthouses', startedAt: 0 };
  w.start(job);
  w.wrote(job, 'word '.repeat(2400));
  const line = meanwhileLine(w.job, 5 * 60_000);
  check('a long answer with no steps: the line says it is writing, and about how much', /writing its answer, about 2,000 words written so far/.test(line), line);
  check('the line names the running job and says earlier replies were other jobs', /the job running right now is "Write a 6,000-word history of lighthouses"/.test(line) && /Earlier replies in this chat are about jobs that already finished/.test(line));
  check('look closer shows how the writing ends so far', /Written so far: about 2,000 words/.test(jobDetail(w.job)) && /It ends: "…/.test(jobDetail(w.job)));
  check('the app\'s own status line', /^My big brain is on "Write a 6,000-word history of lighthouses", 5 minutes in, writing its answer/.test(statusLine(w.job, 5 * 60_000)) && !/Never guess/.test(statusLine(w.job, 5 * 60_000)));
  check('"tell the job to ..." is a note', noteAsk('tell the job to keep the last chapters short') === 'keep the last chapters short' && noteAsk('Could you tell the big brain that I want metric.') === 'I want metric' && noteAsk('pass this along: use metres') === 'use metres');
  check('other messages are not notes', !noteAsk('tell me a joke') && !noteAsk('how big is the moon?'));
  check('"how\'s it going?" is about the job', asksAboutJob("how's it going?") && asksAboutJob('is it done yet?') && !asksAboutJob('how big is the moon?'));
  const near = meanwhileNear([{ role: 'user', content: 'plants' }, { role: 'assistant', content: 'a plant guide' }, { role: 'user', content: "how's it going?" }], 'LINE');
  check('the line also goes just before the latest message', near[2].role === 'system' && near[2].content === 'LINE' && near[3].content === "how's it going?");
}

// ---------- Honesty ----------
check('a guess at the time left is caught', claimsJobGuess('It should be done in about 5 minutes left.') && claimsJobGuess('About 3 more minutes to go.') && claimsJobGuess("It's almost done!") && claimsJobGuess('The job is 80% done.'));
check('plain facts from the line are fine', !claimsJobGuess('My big brain is on step 3, about 6 minutes in; the last step worked.') && !claimsJobGuess('It has been going for 6 minutes.'));
check('"I\'ve been watching the job" with no tool counts as made up', claimsObservation("I've been watching the job and it's going well"));

// ---------- A real run: the big brain reads a note at its next step ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-meanwhile-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false, quickSeesJob: true };
const events = [];
const brain = new Brain(cfg, (ev) => events.push(ev));
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
const seen = [];
let script = [];
let onCall = null;
brain.engine = { chat: async ({ tools, messages }) => { seen.push({ names: tools.map((t) => t.function.name), messages }); onCall?.(); onCall = null; return script.shift() || { role: 'assistant', content: 'done' }; },
  unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
{
  script = [call('bob_help', { question: 'quick notes' }), { role: 'assistant', content: 'All done, in metres.' }];
  onCall = () => { brain.watch.note('use metres'); };
  const { jobId } = brain.enqueue('main', 'Work out the garden plan');
  await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === jobId)?.state));
  check('the big job never gets the Quick brain\'s tools', seen.length && seen.every((s) => !s.names.includes('pass_note') && !s.names.includes('look_at_job')), JSON.stringify(seen.map((s) => s.names.length)));
  const second = seen[1]?.messages || [];
  check('the note reaches the big brain at its next step', second.some((m) => m.role === 'system' && /use metres/.test(m.content) && /passed along by your Quick brain/.test(m.content)));
  check('the job\'s chat says the note arrived', events.some((e) => e.type === 'announce' && /📨 Your note reached me: "use metres"/.test(e.text)));
  check('the record ends with the job', brain.watch.job === null);
}
{
  // A quick reply beside a running job: the Meanwhile line and the two tools are there.
  brain.watch.start({ id: 'big', text: 'Build the photo album', startedAt: Date.now() - 4 * 60_000 }, { session: 'Normal' });
  brain.watch.step({ id: 'big' }, 'listed Pictures');
  seen.length = 0;
  script = [{ role: 'assistant', content: 'It is on step 1, listing your pictures, about 4 minutes in.' }];
  const job = { id: 'q1', side: true, sidePick: { model: 'small:latest', cpu: true }, kind: 'chat', text: 'how is it going?', sessionId: 'side-chat' };
  const msgs = [{ role: 'user', content: 'how is it going?' }];
  await brain.runOn(msgs, 'how is it going?', (e) => events.push(e), new AbortController().signal, [], job, 'side-chat').catch((e) => console.log(e.message));
  const sys = seen[0]?.messages?.[0]?.content || '';
  check('the quick reply gets the Meanwhile line beside Right now', /Right now \(real, from the app\)/.test(sys) && /Meanwhile \(real, from the app\): the job running right now is "Build the photo album"/.test(sys) && /4 minutes in, step 1/.test(sys));
  check('the quick reply gets look_at_job and pass_note', seen[0]?.names.includes('look_at_job') && seen[0]?.names.includes('pass_note'));
  cfg.quickSeesJob = false;
  seen.length = 0;
  script = [{ role: 'assistant', content: 'Not sure.' }];
  await brain.runOn([{ role: 'user', content: 'and now?' }], 'and now?', () => {}, new AbortController().signal, [], { ...job, id: 'q2' }, 'side-chat').catch(() => {});
  check('off: no Meanwhile line and no tools', !/Meanwhile \(real/.test(seen[0]?.messages?.[0]?.content || '') && !seen[0]?.names.includes('pass_note'));
  cfg.quickSeesJob = true;
}

{
  // PC test 1.5.203 (2): a note asked for while the Quick brain is busy answering is passed along by the app at once.
  brain.watch.start({ id: 'big2', text: 'Write a 6,000-word history of lighthouses', startedAt: Date.now() - 60_000 });
  brain.turns.set(SIDE_LANE, { turnId: 'x' });
  const before = brain.queue.length;
  const r = brain.enqueue('main', 'tell the job to keep the last chapters short');
  check('a note while the Quick brain is busy: passed along by the app, nothing queued', /Passed along to the job: "keep the last chapters short"/.test(r.answered || '') && brain.queue.length === before && brain.watch.job.notes[0]?.text === 'keep the last chapters short');
  const r2 = brain.enqueue('main', "how's it going?");
  check('"how\'s it going?" while the Quick brain is busy: answered from the record at once', /^My big brain is on "Write a 6,000-word history/.test(r2.answered || '') && brain.queue.length === before);
  cfg.quickSeesJob = false;
  const r3 = brain.enqueue('main', "how's it going? (off)");
  check('off: nothing is answered by the app', !r3.answered);
  await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === r3.jobId)?.state));
  cfg.quickSeesJob = true;
  brain.turns.delete(SIDE_LANE);
  brain.watch.end('big2');
}
{
  // PC test 1.5.203 (2): a note that comes while the big brain writes its one long answer still reaches it, once.
  seen.length = 0; events.length = 0;
  script = [{ role: 'assistant', content: 'Chapter 1 ... chapter 9.' }, { role: 'assistant', content: 'Noted: the last chapters are now short.' }];
  onCall = () => { brain.watch.note('keep the last chapters short'); };
  const { jobId } = brain.enqueue('main', 'Write a long history of lighthouses');
  await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === jobId)?.state));
  check('a note after the last step: the big brain gets one more go with it', seen.length === 2 && seen[1].messages.some((m) => m.role === 'system' && /keep the last chapters short/.test(m.content) && /already shown/.test(m.content)));
  check('...and the chat says it arrived', events.some((e) => e.type === 'announce' && /Your note reached me/.test(e.text)));
  // A note that comes after that one more go is never lost in silence.
  seen.length = 0; events.length = 0;
  script = [{ role: 'assistant', content: 'Done.' }, { role: 'assistant', content: 'Saw it.' }];
  let n = 0;
  brain.engine.chat = async ({ tools, messages }) => { seen.push({ names: tools.map((t) => t.function.name), messages }); brain.watch.note(`note ${++n}`); return script.shift() || { role: 'assistant', content: 'done' }; };
  const j2 = brain.enqueue('main', 'Write another long one');
  await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === j2.jobId)?.state));
  check('a note nobody could read: the chat says so, and to send it again', events.some((e) => e.type === 'announce' && /finished before it could read your note \("note 2"\)/.test(e.text)));
}

// ---------- Settings, first-time setup, Help ----------
{
  const cellar = read('public/cellar.js'), server = read('src/server.js');
  check('the switch is in Brains, under Keep chatting, always there, off unless turned on', /\$\{sswitch\('quickSeesJob', settings\.quickSeesJob === true, 'Let Bob\\'s Quick brain see the big job', keep\('Off unless you turn it on/.test(cellar));
  check('the server saves and shows it', /typeof b\.quickSeesJob === 'boolean'/.test(server) && /quickSeesJob: cfg\.quickSeesJob === true/.test(server));
  const w = WANTS.find((x) => x.key === 'quickSeesJob');
  const one = WANTS.findIndex((x) => x.key === 'oneBrain');
  check('first-time setup: its own tick with the brains, where its switch is in Settings, right after One brain', w && w.card === 'brains' && WANTS[one + 1] === w && w.label === 'Tell you how a long job is going');
  const esc = (s) => String(s);
  check('first-time setup: never locked, even with Keep chatting off', !/data-want="quickSeesJob"  disabled/.test(wantsHtml({ chatWhileBusy: false }, esc)));
  check('first-time setup: unticked to start', /data-want="quickSeesJob"  >/.test(wantsHtml({}, esc)) || !/data-want="quickSeesJob" checked/.test(wantsHtml({}, esc)));
  const topic = HELP.find((h) => h.id === 'meanwhile');
  check('Help in Bob\'s voice', topic && /my Quick brain/.test(topic.html) && /Stop<\/strong> button/.test(topic.html) && /Windows, Mac, Linux and Android/.test(topic.html));
  check('FAQ', HELP.some((h) => h.id === 'faq-meanwhile' && h.group === 'FAQ'));
  check('glossary', HELP.some((h) => /<dt>Meanwhile line<\/dt>/.test(h.html)));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
