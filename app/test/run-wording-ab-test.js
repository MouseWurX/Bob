// tool-wording.mjs and tool-interview.mjs, the lab's wording and thinking A/B (14 Nov, Riker's tool interview): a variant only rewords or adds save_to, never
// renames a tool or drops an input; turns are rebuilt with the kit's current tools; grading and the score table; picking failed
// cases with his own thinking shown; the per-field scrub. A made-up kit, no server, nothing read from the computer.
import { variantTools, PATH_TOOLS, namedFile, buildQuestions, grade, summarize, variantSystem, variantBody, FEWER_DROP, PROMPT_PARTS, lastUser } from '../model-lab/tool-wording.mjs';
process.env.LAB_SCRUB_NAMES = 'Zorblax';
const { pickCases, caseQuestion, scrub } = await import('../model-lab/tool-interview.mjs');

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tool = (name, props = {}) => ({ type: 'function', function: { name, description: `Bob's ${name}.`, parameters: { type: 'object', properties: props, required: Object.keys(props).slice(0, 1) } } });
const tools = [tool('make_diagram', { mermaid: { type: 'string' }, format: { type: 'string', enum: ['png', 'svg', 'pdf'] } }), tool('notice_board', { action: { type: 'string' } }), tool('file_hands', { action: { type: 'string' } })];
const set = { use: { notice_board: "Use for {{USER}}'s to-do list." } };

const bob = variantTools(tools, 'bob', { set });
check('bob wording is byte for byte', JSON.stringify(bob) === JSON.stringify(tools));
const uw = variantTools(tools, 'usewhen', { set, fill: { user: 'the user' } });
check('usewhen rewords only the tools its set words', uw[1].function.description === "Use for the user's to-do list." && uw[0].function.description === tools[0].function.description);
const both = variantTools(tools, 'usewhen+paths', { set, fill: { user: 'the user', home: 'C:\\Users\\you' } });
check('paths adds save_to to the save tools only', Boolean(both[0].function.parameters.properties.save_to) && !both[2].function.parameters.properties.save_to);
check('save_to has no {{...}} left', !JSON.stringify(both).includes('{{'));
check('names, inputs and enums are kept', both.every((t, i) => t.function.name === tools[i].function.name && Object.keys(tools[i].function.parameters.properties).every((k) => k in t.function.parameters.properties)) && JSON.stringify(both[0].function.parameters.properties.format) === JSON.stringify(tools[0].function.parameters.properties.format));
check('the original list is not changed', !tools[0].function.parameters.properties.save_to);
check('the five save tools', PATH_TOOLS.join(',') === 'make_diagram,save_as,make_image,make_sound,convert_file');
check('a named file is seen', namedFile('save it as logo.png') && namedFile('put it in C:\\Users\\you\\a') && !namedFile('draw my morning'));

// Bobert's parts: prompt rules, fewer tools, several calls at once
check('bob keeps the system prompt as is', variantSystem('You are Bob.', 'bob') === 'You are Bob.' && variantSystem('You are Bob.', 'usewhen+paths') === 'You are Bob.');
const sysAll = variantSystem('You are Bob.', 'example+slash+act');
check('act, slash and example add their rule lines in a fixed order', sysAll.startsWith('You are Bob.\n\n') && sysAll.indexOf(PROMPT_PARTS.act) < sysAll.indexOf(PROMPT_PARTS.slash) && sysAll.indexOf(PROMPT_PARTS.slash) < sysAll.indexOf(PROMPT_PARTS.example));
const withMeta = [...tools, tool('ask_specialist', { hat: { type: 'string' } }), tool('mcp_tools', {})];
const few = variantTools(withMeta, 'fewer', { set });
check('fewer drops only ask_specialist and mcp_tools', few.length === 3 && !few.some((t) => FEWER_DROP.includes(t.function.name)) && variantTools(withMeta, 'bob', { set }).length === 5);
check('par asks for several calls at once, others do not', variantBody('act+par').parallel_tool_calls === true && !('parallel_tool_calls' in variantBody('act')));
check('the request is the last user message', lastUser([{ role: 'user', content: 'one' }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'two' }]) === 'two' && lastUser([]) === '');

const kit = { groupOf: (n) => ({ make_diagram: 'diagrams', file_hands: 'files' })[n] || null, guessGroups: () => [], turn: (loaded) => ({ system: `Bob with ${[...loaded].sort().join(',')}`, tools }) };
const lessons = [
  { idea: 'a', job: 'diagram', messages: [{ role: 'user', content: 'draw it as plan.png' }, { role: 'assistant', set: 'old', content: '', tool_calls: [{ id: 'c1', function: { name: 'make_diagram', arguments: '{"mermaid":"flowchart TD"}' } }] }, { role: 'tool', tool_call_id: 'c1', name: 'make_diagram', content: 'Drew it' }, { role: 'assistant', content: 'Done.' }] },
  { idea: 'b', job: 'chat', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hi!' }] }
];
const qs = buildQuestions(lessons, kit, { turns: 2 });
check('two turns of a lesson, one of another', qs.length === 3 && qs[1].k === 1 && qs[1].messages.at(-1).role === 'tool');
check('rebuilt with the current kit, not the saved set', qs[0].messages[0].content === 'Bob with diagrams' && qs[0].tools === tools);
check('the turn knows the user named a file', qs[0].named === true && qs[2].named === false);
check('--jobs filters', buildQuestions(lessons, kit, { turns: 2, jobs: new Set(['chat']) }).length === 1);

const right = grade(qs[0], { tool_calls: [{ function: { name: 'make_diagram', arguments: '{"mermaid":"flowchart TD","save_to":"C:\\\\a\\\\plan.png"}' } }] });
check('extra save_to still right, and counted', right.ok && right.name_ok && right.used_save_to === true);
const wrongArgs = grade(qs[0], { tool_calls: [{ function: { name: 'make_diagram', arguments: '{"mermaid":"pie"}' } }] });
check('right tool, wrong argument', !wrongArgs.ok && wrongArgs.name_ok && wrongArgs.used_save_to === false);
check('no tool when one was wanted', !grade(qs[0], { content: 'sure' }).ok);
check('no tool when none was wanted', grade(qs[2], { content: 'Hi!' }).ok);

const rows = [
  { cond: 'bob think-off', idea: 'a', k: 0, job: 'diagram', ok: false, name_ok: true, named: true, used_save_to: false },
  { cond: 'bob think-off', idea: 'b', k: 0, job: 'chat', ok: true, name_ok: true, named: false, used_save_to: null },
  { cond: 'paths think-off', idea: 'a', k: 0, job: 'diagram', ok: true, name_ok: true, named: true, used_save_to: true },
  { cond: 'paths think-off', idea: 'b', k: 0, job: 'chat', ok: true, name_ok: true, named: false, used_save_to: null }
];
const s = summarize(rows, ['bob think-off', 'paths think-off']);
check('score per job and in all', s.ALL['bob think-off'].ok === 0.5 && s.ALL['paths think-off'].ok === 1 && s.diagram['paths think-off'].gap === 1);
check('save_to counted where a file was named', s.diagram['paths think-off'].save_to === '1/1' && s.diagram['bob think-off'].save_to === '0/1');

const answers = [
  { variant: 'bob', think: true, ok: false, job: 'files', idea: 'x', k: 0, want: [{ name: 'file_hands', args: '{"action":"zip"}' }], answer: { content: '', reasoning: 'We should list the folder first.', tool_calls: [{ function: { name: 'list_folder', arguments: '{}' } }] } },
  { variant: 'bob', think: true, ok: false, job: 'files', idea: 'y', k: 0, want: [{ name: 'file_hands', args: '{}' }], answer: { content: 'ok' } },
  { variant: 'bob', think: false, ok: false, job: 'run', idea: 'z', k: 0, want: [{ name: 'run_command', args: '{}' }], answer: { content: 'Run npm test yourself.' } },
  { variant: 'paths', think: false, ok: false, job: 'diagram', idea: 'w', k: 0, want: [{ name: 'make_diagram', args: '{}' }], answer: { content: '' } },
  { variant: 'bob', think: false, ok: false, job: 'chat', idea: 'v', k: 0, want: [], answer: { content: '' } }
];
const cases = pickCases(answers, 8);
check('cases: Bob wording only, one per job per mode, tool turns only', cases.length === 2 && cases[0].idea === 'x' && cases[1].idea === 'z');
const cq = caseQuestion(cases[0], 'zip my project');
check('the case shows his own thinking and calls', cq.includes('We should list the folder first.') && cq.includes('list_folder') && cq.includes('file_hands'));
check('a thinking-off case says so', caseQuestion(cases[1], 'run the tests').includes('Thinking was off'));
check('scrub: paths, keys', scrub('C:\\Users\\you\\x and hf_abcdefgh123 /home/you/x') === '<path> and <key> <path>');
check('scrub: owner names from LAB_SCRUB_NAMES', scrub('ask zorblax') === 'ask <owner>');
check('scrub keeps "Thus:" and a line break', scrub('Thus:\n1. go') === 'Thus:\n1. go');

const { checkEngine } = await import('../model-lab/engine-check.mjs');
const okEng = { chat: async (b) => ({ choices: [{ message: { content: 'hi', reasoning_content: b.chat_template_kwargs?.enable_thinking ? 'hm' : '' }, logprobs: { content: [{ token: 'hi', logprob: 0, top_logprobs: [] }] } }] }), setUsed: async () => ({}), getUsed: async () => ({ used: 10 }), setMask: async () => ({}), setDials: async () => ({}), trace: async () => ({ expert_trace: { layers: [], mass: [] } }), reset: async () => {} };
const all = new Set(['chat', 'tools', 'odds', 'think', 'n', 'mask', 'dials', 'trace', 'mass']);
check('engine check passes a full engine', (await checkEngine(okEng, all)).every((r) => r.ok));
const oldEng = { ...okEng, setUsed: async () => { throw new Error('this engine has no /experts-per-word'); }, trace: async () => ({}) };
const bad = (await checkEngine(oldEng, all)).filter((r) => !r.ok).map((r) => r.name).join(',');
check('engine check catches the Nov 13 engine (no N switch, no trace)', bad === 'n,trace,mass', bad);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
