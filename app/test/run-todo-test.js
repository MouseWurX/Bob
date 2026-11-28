// Nov 27 2026: "Keep a to-do list and check it" (src/todo.js), off by default. The brain's own to-do list
// (update_plan), shown again before each step; a tick only counts when a tool really worked; open steps at the end get
// one more go; make_diagram says it is on its way, not drawn. Nothing here reads the real computer: a throwaway folder,
// a scripted fake engine and plain objects.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { todoOn, cleanState, cleanSteps, updatePlan, todoLine, todoNudge, todoTool } from '../src/todo.js';
import { stepsDone } from '../src/job-steps.js';
import { afterTurn } from '../src/verify.js';
import { diagramTool } from '../src/diagram.js';
import { Brain } from '../src/brain.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

// ---- the switch ----
check('off unless turned on', !todoOn({}) && !todoOn({ keepTodo: 'yes' }) && todoOn({ keepTodo: true }));

// ---- reading the list kindly ----
check('states read kindly', cleanState('in_progress') === 'doing' && cleanState('Completed') === 'done' && cleanState('cancelled') === 'skipped' && cleanState('todo') === 'pending' && cleanState() === 'pending');
const tidy = cleanSteps(['read notes.txt', { say: 'add the to-dos', state: 'doing' }, { step: '  ' }, null]);
check('steps as strings or objects, blanks dropped', tidy.length === 2 && tidy[0].status === 'pending' && tidy[1].step === 'add the to-dos' && tidy[1].status === 'doing');
check('at most 12 steps', cleanSteps(Array.from({ length: 20 }, (_, i) => `step ${i}`)).length === 12);
check('update_plan is not a step itself', stepsDone([{ name: 'update_plan', ok: true }, { name: 'read_file', ok: true }]) === 1);

// ---- checked ticks ----
{
  const ctx = { ledger: { actions: [] } };
  const steps = (a, b, c) => [{ step: 'read notes.txt', status: a }, { step: 'add the to-dos', status: b }, { step: 'tell Sam', status: c }];
  let out = updatePlan(ctx, { steps: steps('doing', 'pending', 'pending') });
  check('the first list is kept and read back', ctx.todo.steps.length === 3 && /0 of 3 done/.test(out) && /\[>\] 1\. read notes\.txt/.test(out) && /Next: read notes\.txt/.test(out));
  out = updatePlan(ctx, { steps: steps('done', 'doing', 'pending') });
  check('a tick with no tool step since the last list does not count', ctx.todo.steps[0].status !== 'done' && /Not ticked: "read notes\.txt"/.test(out));
  ctx.ledger.actions.push({ name: 'read_file', ok: true });
  out = updatePlan(ctx, { steps: steps('done', 'doing', 'pending') });
  check('after a tool step worked, the tick counts', ctx.todo.steps[0].status === 'done' && /1 of 3 done/.test(out) && !/Not ticked/.test(out));
  ctx.ledger.actions.push({ name: 'notice_board', ok: false });
  out = updatePlan(ctx, { steps: steps('done', 'done', 'pending') });
  check('a failed tool step does not count for a tick', ctx.todo.steps[1].status !== 'done' && /Not ticked: "add the to-dos"/.test(out));
  ctx.ledger.actions.push({ name: 'notice_board', ok: true });
  out = updatePlan(ctx, { steps: steps('done', 'done', 'skipped') });
  check('a skip needs a why', ctx.todo.steps[2].status === 'pending' && /can't be skipped without a why/.test(out));
  check('the line before each step lists the open job', /to-do list for this job/.test(todoLine(ctx.todo)) && /\[ \] 3\. tell Sam/.test(todoLine(ctx.todo)));
  check('the end check names the open step', /1 open step: "tell Sam"/.test(todoNudge(ctx.todo, 'Sam')) && /replaces your last one/.test(todoNudge(ctx.todo, 'Sam')));
  ctx.ledger.actions.push({ name: 'read_file', ok: true });
  updatePlan(ctx, { steps: [...steps('done', 'done', 'done').slice(0, 2), { step: 'tell Sam', status: 'skipped', why: 'Sam is reading it now' }] });
  check('all done or skipped: no line and no end check', todoLine(ctx.todo) === '' && todoNudge(ctx.todo) === '');
  const two = { ledger: { actions: [] } };
  updatePlan(two, { steps: [{ step: 'a', status: 'doing' }, { step: 'b', status: 'doing' }] });
  check('only one step is doing at a time', two.todo.steps.filter((s) => s.status === 'doing').length === 1);
  check('no steps is an error the brain can act on', /^Error: no steps/.test(updatePlan({}, { steps: [] })));
  const fresh = { ledger: { actions: [] } };
  updatePlan(fresh, { steps: [{ step: 'a', status: 'done' }] });
  check('a first list cannot tick a step no tool did', fresh.todo.steps[0].status === 'pending');
}

// ---- the end-of-turn check ----
{
  const base = { cfg: { keepTodo: true, userName: 'Sam' }, brain: { usable: () => true }, ledger: { actions: [{ name: 'read_file', ok: true }] } };
  const open = { ...base, todo: { steps: [{ step: 'read notes.txt', status: 'done' }, { step: 'add the to-dos', status: 'pending' }] } };
  const v = afterTurn(open, 'All done!');
  check('answering with open steps gets one more go', /still has 1 open step: "add the to-dos"/.test(v?.nudge || ''), JSON.stringify(v).slice(0, 300));
  const done = { ...base, todo: { steps: [{ step: 'read notes.txt', status: 'done' }] } };
  check('a finished list adds nothing', !/to-do list/.test(afterTurn(done, 'Here it is.')?.nudge || ''));
  check('a question back is not nudged', !/to-do list/.test(afterTurn(open, 'Which board should I use?')?.nudge || ''));
  check('no list (switch off): nothing changes', !/to-do list/.test(afterTurn({ ...base }, 'All done!')?.nudge || ''));
}

// ---- proof before result: make_diagram ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-todo-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), painterDir = path.join(innDir, 'painter');
for (const d of [dataDir, painterDir]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir, innDir, dataDir, painterDir, defaultPainterDir: painterDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam', models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };
{
  const d = diagramTool();
  const off = await d.run({ title: 'Cats', mermaid: 'flowchart TD\nA-->B' }, { cfg, emit: () => {} });
  const on = await d.run({ title: 'Cats', mermaid: 'flowchart TD\nA-->B' }, { cfg: { ...cfg, keepTodo: true }, emit: () => {} });
  check('off: make_diagram reads as before', /^Drew the diagram "Cats"/.test(off));
  check('on: make_diagram says it is on its way, not drawn', /^Sent "Cats" to the chat window/.test(on) && /isn't drawn until the chat shows it/.test(on) && !/^Drew/.test(on));
}

// ---- wired into a real turn ----
for (const on of [false, true]) {
  const brain = new Brain({ ...cfg, keepTodo: on }, () => {});
  clearInterval(brain.reminderTimer);
  brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
  const call = (n, a) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name: n, arguments: a } }] });
  const script = [
    call('update_plan', { steps: [{ step: 'draw the cat flowchart', status: 'doing' }, { step: 'tell Sam', status: 'pending' }] }),
    call('make_diagram', { title: 'Cats', mermaid: 'flowchart TD\nA[Cat]-->B[Nap]' }),
    { role: 'assistant', content: 'Here you go.' }
  ];
  const seen = [];
  brain.engine = { chat: async ({ tools, messages }) => { seen.push({ tools: (tools || []).map((t) => t.function?.name), messages }); return script.shift() || { role: 'assistant', content: 'Here you go.' }; }, unloadAll: async () => {} };
  const evs = [];
  await brain.run(`t${on}`, 'draw me a flowchart of a cat\'s day', (e) => evs.push(e), new AbortController().signal, []);
  const offered = seen.some((s) => s.tools.includes('update_plan'));
  const shown = seen.some((s) => s.messages.some((m) => m.role === 'system' && /to-do list for this job/.test(String(m.content))));
  const nudged = seen.some((s) => s.messages.some((m) => /still has 2 open steps/.test(String(m.content))));
  if (!on) {
    check('off: update_plan is never offered to the brain', !offered);
    check('off: no to-do line is shown', !shown);
  } else {
    check('on: update_plan is offered to the brain', offered, JSON.stringify(seen.map((s) => s.tools)).slice(0, 400));
    check('on: the list is shown again before the next step', shown);
    check('on: an answer with a step still open gets one more go', nudged, JSON.stringify(seen.at(-1)?.messages?.slice(-3)).slice(0, 600));
    check('on: the list reaches the chat page as an event', evs.some((e) => e.type === 'todo' && e.steps?.length === 2));
  }
}

// ---- Help, settings and wording ----
const ids = new Set(HELP.map((e) => e.id));
check('Help has its page and FAQ', ids.has('todo-list') && ids.has('faq-todo-list'));
const gl = HELP.find((e) => e.id === 'glossary');
check('the glossary has it', /To-do list \(update_plan\)/.test(gl?.html || '') && /to-do list/.test(gl?.words || ''));
check('the switch is on the Settings page, off by default', /sswitch\('keepTodo', settings\.keepTodo === true, 'Keep a to-do list and check it'/.test(publicText('cellar-pages.js')));
check('the chat page draws the list as one live line', /case 'todo':\s*\/\/[^\n]*\n\s*drawTodo\(ev\.steps\)/.test(publicText('app.js')) && /function drawTodo/.test(publicText('app.js')));
check('the tool says when to use it in one line', /^Use when a job needs 3 or more tool steps/.test(todoTool({ cfg: {} }).schema.function.description));
check('switched off, the tool says so', /off/.test(await todoTool({ cfg: {} }).run({ steps: ['a'] }, {})));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
