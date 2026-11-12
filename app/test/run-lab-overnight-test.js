// The Lab, items 27 to 34 of "50 ways to make Bob better" (Nov 11): the real entry test, the job queue, the wobble,
// Lab scores on the Brains page, the check after engine updates, Teach it from my mistakes, fNRI scans in My Lab, and
// the Forge pointing at Make a brain. Everything runs on fakes and a throwaway folder: no brain, engine or card.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SINGLE, MULTI, ENTRY_JOBS, ENTRY_TOOLS, entryTools, runEntryJob, standIn, callsInText } from '../src/lab-entry.js';
import { QUIZ, PICK_BASICS } from '../src/lab-test.js';
import { PACKS, PACK_VERSION, mergeScores, mergeWobble, wobbleOf, scoreboard, brainScores } from '../src/lab-challenges.js';
import { LabQueue, QUEUE_MAX } from '../src/lab-queue.js';
import { dropLine, recheckTick, readRecheck, rowFor } from '../src/lab-recheck.js';
import { readMyTests, seedIdeas, MISTAKES_NAME } from '../src/lab-mistakes.js';
import { cleanWrite } from '../src/lab.js';
import { SHELVES, shelfRows, mineHtml } from '../public/lab-mine.js';
import { queueHtml, queueBtn } from '../public/lab-queue.js';
import { labLine } from '../public/brains.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-overnight-'));

// ---- 27 The real entry test ----
const tools = await entryTools();
check('the entry test hands over Bob\'s real tools, read from tools.js', tools.length === ENTRY_TOOLS.length && tools.every((t) => ENTRY_TOOLS.includes(t.function.name) && t.function.parameters));
check('its tool part is every one-step and multi-step job', QUIZ.tools === ENTRY_JOBS && ENTRY_JOBS.length === SINGLE.length + MULTI.length && MULTI.length === 8);
check('coding has 10 asks, 6 of them run on fixed inputs when the sandbox holds', QUIZ.coding.length === 10 && QUIZ.coding.filter((x) => x[2]).length === 6);
check('the old one-shot picks stay for the Pick the tool challenge', PICK_BASICS.length === 8 && read('src/lab-challenges.js').includes('...PICK_BASICS,'));
check('the quick quiz is version 2, so older scores show greyed, not mixed in', PACK_VERSION.quiz === 2 && PACKS.find((p) => p.id === 'quiz').count === Object.values(QUIZ).reduce((a, l) => a + l.length, 0));
{
  // A job round the loop: a call with its input under the wrong name is mended, a call missing what it needs bounces,
  // the brain sends it again, then answers.
  const said = [];
  const replies = [
    { tool_calls: [{ function: { name: 'read_file', arguments: '{"file": "report.txt"}' } }] },
    { tool_calls: [{ function: { name: 'edit_file', arguments: { path: 'report.txt', replace: 'Total: 7' } } }] },
    { tool_calls: [{ function: { name: 'edit_file', arguments: { path: 'report.txt', find: 'Total: 9', replace: 'Total: 7' } } }] },
    { content: '<think>ok</think>Fixed the total: it is 7.' }
  ];
  const ask = async (msgs, t) => { said.push({ msgs, tools: t }); return replies[said.length - 1]; };
  const r = await runEntryJob(['check report.txt, it says the total is wrong, fix the total line', ['read_file', 'edit_file']], tools, ask);
  check('a mended call runs, a call missing its input bounces once, then the job is right', r.ok && r.mended === 1 && r.bounced === 1 && r.ran.join(',') === 'read_file,edit_file' && r.answer === 'Fixed the total: it is 7.', JSON.stringify(r));
  const bounce = said[2].msgs.find((m) => m.role === 'tool' && /Not run: edit_file/.test(m.content));
  check('the bounce says what to send, the way Bob\'s loop does', Boolean(bounce) && /find is missing/.test(bounce.content));
  check('after two rounds a "where we are" note goes last', said[2].msgs.at(-1).role === 'system' && /Where we are/.test(said[2].msgs.at(-1).content));
}
{
  let n = 0;
  const r = await runEntryJob(['What\'s in my inn folder?', ['list_folder']], tools, async (msgs, t) => { n++; return t ? { tool_calls: [{ function: { name: 'web_search', arguments: { query: 'x' } } }] } : { content: 'I searched.' }; }, { maxSteps: 3 });
  check('the last round has no tools and must answer; the wrong tool fails the job', !r.ok && n === 3 && r.answer === 'I searched.');
  const t = callsInText('<tool_call>{"name": "remember", "arguments": {"fact": "x"}}</tool_call>', new Set(['remember']));
  check('a call written in the reply\'s text is read too', t.length === 1 && t[0].function.name === 'remember');
  check('stand-ins never touch the computer and fail on purpose where planned', /ENOENT/.test(standIn('read_file', { path: 'missing.txt' })) && /test stand-in/.test(standIn('nothing_real', {})));
}
check('the loop test shares the jobs and stand-ins', /lab-entry\.js/.test(read('model-lab/loop-test.mjs')) && !/const RESULTS = \{/.test(read('model-lab/loop-test.mjs')));

// ---- 29 Show the wobble ----
check('the wobble is half the gap between the lowest and highest run', wobbleOf({ low: 60, high: 67, mean: 64, runs: 3 }) === 4 && wobbleOf({ low: 5, high: 5, runs: 1 }) === null);
{
  let rec = mergeScores(null, { name: 'Test Brain', brainId: 'tb', packs: { quiz: { score: 70, right: 29, of: 42, quizParts: { tools: { score: 75, right: 12, of: 16 }, coding: { score: 60, right: 6, of: 10 } } }, code: { score: 80, right: 4, of: 5 } }, tps: 41, when: '2026-11-11' });
  rec = mergeWobble(rec, { name: 'Test Brain', brainId: 'tb', packs: { quiz: { low: 66, high: 73, mean: 70, runs: 3 } }, when: '2026-11-11' });
  const again = mergeScores(rec, { name: 'Test Brain', brainId: 'tb', packs: { sums: { score: 50, right: 5, of: 10 } }, when: '2026-11-12' });
  const row = scoreboard([{ id: 'test-brain', ...again }])[0];
  check('a wobble run keeps the score and adds ± beside it; a later run keeps the ±', row.scores.quiz === 70 && row.wobble.quiz === 4 && row.brainId === 'tb');
  check('the page shows "70 ± 4" and says what ± means', /withWobble = \(r, id\)/.test(read('public/lab.js')) && /± is the wobble from three runs/.test(read('public/lab.js')));
  check('the wobble tick sends wobble: true, and the server runs three times above temperature 0', /data-chwobble/.test(read('public/lab.js')) && /WOBBLE_RUNS = 3, WOBBLE_TEMP = 0\.7/.test(read('src/lab.js')));
  // ---- 30 Lab scores on the Brains page ----
  const scores = brainScores([{ id: 'test-brain', ...again }, { id: 'old', brain: { name: 'Old Name' }, packs: { tools: { score: 40, v: 1 } } }], [{ id: 'tb', name: 'Test Brain' }, { id: 'on', name: 'Old Name' }]);
  check('Brains page scores: tool skill from the real-tools part, coding from Code it, speed here', scores.tb.tools === 75 && scores.tb.coding === 80 && scores.tb.tps === 41);
  check('a brain scored before ids were kept is found by name', Boolean(scores.on));
  const line = labLine({ value: 'tb', entry: { id: 'tb' } }, { labScores: scores });
  check('the Brains page line reads in plain words', line === 'Lab: tools 75 · coding 80 · 41 words a second here (2026-11-12)', line);
  check('no line when the Lab has no scores for that brain', labLine({ value: 'x', entry: { id: 'x' } }, { labScores: scores }) === '' && labLine({ value: 'x' }, {}) === '');
  check('the Brains page asks for them and passes them in', /api\('\/api\/lab\/brain-scores'\)/.test(read('public/cellar.js')) && /calAsk, labScores, \.\.\.more \}/.test(read('public/cellar.js')));
  // ---- 31 Check again after engine updates ----
  check('a drop bigger than luck is said; a small one isn\'t', /went from 70 to 60/.test(dropLine('Riker', { score: 70, tps: 100 }, { score: 60, tps: 100 }, 'Brain Engine 4')) && dropLine('Riker', { score: 70, tps: 100 }, { score: 67, tps: 95 }) === '');
  check('the measured wobble widens what counts as luck', dropLine('Riker', { score: 70, wobble: 8 }, { score: 63 }) === '');
  check('a speed drop of more than a tenth is said', /speed went from 100 to 80/.test(dropLine('Riker', { score: 70, tps: 100 }, { score: 70, tps: 80 })));
  check('rowFor finds a brain by id first, then by name', rowFor([{ brainId: 'a', name: 'X' }, { name: 'Y' }], { id: 'a', name: 'Z' })?.brainId === 'a' && rowFor([{ name: 'Y' }], { id: 'q', name: 'Y' })?.name === 'Y');
}

// ---- 28 The queue (with 31 riding on it) ----
{
  const cfg = { dataDir: path.join(tmp, 'data') };
  const said = [];
  const lab = { cfg, job: null, runs: [], broadcast: (e) => said.push(e), brains: () => [{ id: 'main', name: 'Main Brain' }] };
  const started = [];
  let nextId = 0;
  const starters = {
    challenge: async (b) => { started.push(['challenge', b]); const id = `run-${++nextId}`; lab.runs.push({ id, state: 'running' }); lab.job = { run: { id } }; return { started: { id } }; },
    ladder: async () => { throw new Error('That brain isn\'t here any more.'); },
    watch: async (b) => { started.push(['watch', b]); const id = `run-${++nextId}`; lab.runs.push({ id, state: 'running' }); lab.job = { run: { id } }; return { started: { id } }; }
  };
  let chatting = false, quiet = true;
  const q = new LabQueue(lab, { starters, busy: () => chatting, idle: () => quiet });
  q.add({ kind: 'challenge', body: { challenge: { from: 'main', packs: ['quiz'] }, unload: false }, label: 'Challenges for Main Brain' });
  q.add({ kind: 'ladder', body: { from: 'gone' }, label: 'Size ladder' });
  q.add({ kind: 'watch', body: { brain: 'main' }, label: 'fNRI scan' });
  let threw = ''; try { q.add({ kind: 'forge' }); } catch (e) { threw = e.message; }
  check('only challenges, ladders and scans can be queued', /can't go in the queue/.test(threw));
  check('a queued job never carries its own unload answer', q.items[0].body.unload === undefined);
  chatting = true;
  check('nothing starts while Bob is answering someone', (await q.tick()) === 'wait' && !started.length);
  chatting = false;
  check('the first job starts with Bob\'s brain unloaded', (await q.tick()) === 'running' && started[0][0] === 'challenge' && started[0][1].unload === true);
  check('while it runs, the next one waits', (await q.tick()) === 'running' && started.length === 1);
  lab.runs[0].state = 'done'; lab.job = null;
  const t = await q.tick();
  check('when it ends it\'s marked done, and a job that can\'t start says why and the queue moves on', q.items[0].state === 'done' && q.items[1].state === 'failed' && /isn't here/.test(q.items[1].note) && t === 'failed');
  await q.tick();
  check('then the scan starts', started.at(-1)[0] === 'watch' && q.items[2].state === 'running');
  lab.runs.at(-1).state = 'failed'; lab.runs.at(-1).error = 'Gaming started.'; lab.job = null;
  await q.tick();
  check('a job that fails on the way is marked with its reason', q.items[2].state === 'failed' && q.items[2].note === 'Gaming started.');
  q.pause(true);
  q.add({ kind: 'challenge', body: { challenge: { from: 'main', packs: ['sums'] } }, label: 'Sums' });
  check('a paused queue starts nothing', (await q.tick()) === 'wait');
  q.pause(false);
  q.add({ kind: 'challenge', body: { challenge: { from: 'main', packs: ['rules'] } }, label: 'Rules' });
  const waitIds = q.items.filter((x) => x.state === 'waiting').map((x) => x.id);
  q.move(waitIds[1], -1);
  check('waiting jobs can be moved up and down', q.items.filter((x) => x.state === 'waiting')[0].label === 'Rules');
  q.remove(waitIds[0]);
  check('and removed', !q.items.some((x) => x.id === waitIds[0]));
  q.clearDone();
  check('Clear finished keeps the waiting ones only', q.items.every((x) => x.state === 'waiting') && q.items.length === 1);
  const reread = new LabQueue(lab, { starters });
  check('the queue is kept on disk and comes back after a restart', reread.items.length === 1 && reread.items[0].label === 'Rules');
  q.remove(q.items[0].id);
  for (let i = 0; i < QUEUE_MAX; i++) q.add({ kind: 'challenge', body: {}, label: `x${i}` });
  threw = ''; try { q.add({ kind: 'challenge', body: {} }); } catch (e) { threw = e.message; }
  check(`it holds up to ${QUEUE_MAX} waiting jobs`, /up to 30/.test(threw));
  for (const x of [...q.items]) q.remove(x.id);
  check('the page shows the queue with plain controls, and nothing when it\'s empty', queueHtml({ items: [] }) === '' && /Pause the queue/.test(queueHtml(q.view().items.length ? q.view() : { items: [{ id: 'a', label: 'L', state: 'waiting' }] })) && /data-qadd="ladder"/.test(queueBtn('ladder')));
  check('Challenges, Smaller and fNRI each have Add to the queue', /queueBtn\('challenge'/.test(read('public/lab.js')) && /queueBtn\('ladder'/.test(read('public/lab-playground.js')) && /queueBtn\('watch'/.test(read('public/lab-watch.js')));

  // 31: the check after engine updates, through the queue.
  const rows = () => [{ brainId: 'main', name: 'Main Brain', scores: { quiz: 72 }, tps: 100, old: [], wobble: {} }];
  check('off by default: nothing is queued', recheckTick({ lab, queue: q, mainId: 'main', version: 'Brain Engine b1', rows: rows() }) === 'off');
  cfg.labRecheck = true;
  check('switched on, the build it sees first is the one to compare against', recheckTick({ lab, queue: q, mainId: 'main', version: 'Brain Engine b1', rows: rows() }) === 'baseline' && readRecheck(cfg).version === 'Brain Engine b1');
  check('the same build again: nothing', recheckTick({ lab, queue: q, mainId: 'main', version: 'Brain Engine b1', rows: rows() }) === 'same');
  check('a new build queues the Lab test on the main brain, waiting for Bob to be quiet', recheckTick({ lab, queue: q, mainId: 'main', version: 'Brain Engine b2', engine: 'Brain Engine b2', rows: rows() }) === 'queued' && q.items.at(-1).idle === true && q.items.at(-1).body.challenge.packs.join() === 'quiz');
  quiet = false;
  check('it waits while Bob isn\'t quiet yet', (await q.tick()) === 'wait');
  quiet = true;
  await q.tick();
  check('then it runs', q.items.at(-1).state === 'running');
  check('and the check waits for it', recheckTick({ lab, queue: q, mainId: 'main', version: 'Brain Engine b2', rows: rows() }) === 'waiting');
  lab.runs.at(-1).state = 'done'; lab.job = null;
  await q.tick();
  said.length = 0;
  const after = [{ brainId: 'main', name: 'Main Brain', scores: { quiz: 60 }, tps: 99, old: [], wobble: {} }];
  check('when it\'s done a real drop is said in chat and kept', recheckTick({ lab, queue: q, mainId: 'main', version: 'Brain Engine b2', rows: after }) === 'checked' && said.some((e) => e.type === 'lab-recheck' && /72 to 60/.test(e.text)) && readRecheck(cfg).last.after.score === 60);
  check('the chat shows that line, and the switch is on the Challenges page', /case 'lab-recheck': note\(ev\.text\)/.test(read('public/app.js')) && /data-recheck/.test(read('public/lab.js')));
  check('the setting is saved off unless switched on', /'labRecheck' in out\) out\.labRecheck = out\.labRecheck === true/.test(read('src/config.js')));
}

// ---- 32 Teach it from my mistakes ----
{
  const cfg = { dataDir: path.join(tmp, 'mistakes') };
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  check('no saved tests: none read', readMyTests(cfg).length === 0);
  const line = (o) => JSON.stringify({ job: 'mine', at: 1, used: [], answer: 'wrong', ...o });
  fs.writeFileSync(path.join(cfg.dataDir, 'my-tests.jsonl'), [line({ id: 'a1', text: 'save the weather to weather.txt', need: ['web_search', 'write_file'], why: 'no file' }), 'not json', line({ id: 'a2', text: 'Save the weather to weather.txt' }), line({ id: 'a3', text: '' }), line({ id: 'a4', text: 'remind me at 5' })].join('\r\n') + '\r\n');
  const cases = readMyTests(cfg);
  check('saved tests are read in the shape Save as a test writes, repeats and blanks left out', cases.length === 2 && cases[0].need.join() === 'web_search,write_file' && cases[1].text === 'remind me at 5');
  const dir = path.join(tmp, 'set');
  check('their asks become the lesson writer\'s ideas', seedIdeas(dir, cases) === 2 && fs.readFileSync(path.join(dir, 'ideas.jsonl'), 'utf8').split('\n').filter(Boolean).every((l) => JSON.parse(l).skill === 'tools'));
  check('seeding again adds only new ones', seedIdeas(dir, [...cases, { id: 'b', text: 'new one' }]) === 3);
  const w = cleanWrite({ name: MISTAKES_NAME, teacher: 't', skills: ['tools'], count: 3, mine: true });
  check('a mistakes set may be smaller than 100 lessons, and the writer makes no ideas of its own', w.count === 3 && w.mine === true && cleanWrite({ count: 3 }).count === 100 && /for \(const s of ideasOnly \? \[\] : picked\)/.test(read('src/lab-write.js')));
  check('Teach it shows the count and a teacher picker', /Teach it from my mistakes/.test(read('public/lab-teach.js')) && /mistakes: readMyTests\(lab\.cfg\)\.length/.test(read('src/lab-teach.js')));
}

// ---- 33 fNRI scans in My Lab ----
{
  check('My Lab has an fNRI scans shelf that opens fNRI', SHELVES.some((s) => s.id === 'scans' && s.to.join() === 'inside,watch'));
  const rows = shelfRows({ scans: [{ brain: 'Riker', name: 'Coding and tools', skills: 4, when: '2026-11-11' }] });
  check('each scan shows its brain, name, skills and day, no path', rows.scans[0][0] === 'Riker: Coding and tools' && rows.scans[0][1] === '4 skills · 2026-11-11' && /fNRI scans/.test(mineHtml({ scans: [] })));
  check('the server lists every brain\'s scans for the page', /lab\.listScans = \(\) =>/.test(read('src/server.js')) && /scans: this\.listScans \? this\.listScans\(\) : \[\]/.test(read('src/lab.js')));
}

// ---- 34 The Forge points at Make a brain ----
{
  const f = read('public/lab-forge.js');
  check('Make it smaller and Cut experts are one line opening Make a brain, not cards repeating it', /const makeLine = \(\) =>/.test(f) && /filter\(\(m\) => !\(m\.ready && m\.use === 'make'\)\)\.map\(card\)/.test(f) && /are on Make a brain/.test(f));
}

// ---- Help, glossary, FAQ ----
const help = JSON.stringify(HELP);
check('Help explains the queue, the wobble, the engine check, my mistakes and the real entry test', ['Queue', 'wobble', 'after engine updates', 'from my mistakes', 'real tools'].every((w) => help.toLowerCase().includes(w.toLowerCase())), ['Queue', 'wobble', 'after engine updates', 'from my mistakes', 'real tools'].filter((w) => !help.toLowerCase().includes(w.toLowerCase())).join(', '));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
