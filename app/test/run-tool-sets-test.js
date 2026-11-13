// Tool sets for each brain family (src/tool-sets.js) and the logic arguments that came with them (Nov 13, owner:
// "toolsets that cater to model families", "its a reliability feature", "logic arguments to help them get the desired
// effect"). Same tools, names and inputs for every family; only the wording changes, and never grows the list.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-sets-'));
const conf = path.join(tmp, 'config.json');
fs.copyFileSync(path.join(app, 'config.example.json'), conf);
process.env.BOB_CONFIG = conf; process.env.BOB_AGENT_DIR = tmp;
const { loadConfig } = await import('../src/config.js');
const { Brain } = await import('../src/brain.js');
const { HANDS } = await import('../src/hands-settings.js');
const { SETS, toolSetFor, inSet, stickyFor, toolSetsOn } = await import('../src/tool-sets.js');
const { checkArgs } = await import('../src/loop-help.js');
const { reminderTime } = await import('../src/tools.js');
const { expectFrom } = await import('../src/verify.js');
const { STICKY_TURNS } = await import('../src/toolbox.js');

// 1. Which brains get which wording.
check('GPT-OSS wording is unproven (120B A/B Nov 13), so it isn\'t picked by itself', SETS['gpt-oss'].proven === false && toolSetFor({}, 'gpt-oss-120b-REAP-38B') === null && toolSetFor({}, 'my-brain', { info: { arch: 'gpt-oss', name: 'gpt-oss-20b' } }) === null);
check('Qwen brains keep Bob\'s own wording', toolSetFor({}, 'qwen3.6-35b-a3b') === null && toolSetFor({}, 'riker') === null);
check('unknown brains keep Bob\'s own wording', toolSetFor({}, 'some-new-brain') === null);
check('on unless turned off', toolSetsOn({}) && !toolSetsOn({ toolSets: false }) && toolSetFor({ toolSets: false }, '', { family: 'gpt-oss' }) === null);
check('a family named by hand (the Lab\'s --tool-set)', toolSetFor({}, '', { family: 'gpt-oss' })?.id === 'gpt-oss');
check('GPT-OSS keeps an added group for 1 message; others for the usual', stickyFor(toolSetFor({}, '', { family: 'gpt-oss' }), STICKY_TURNS) === 1 && stickyFor(null, STICKY_TURNS) === STICKY_TURNS);

// 2. Against Bob's real tool list: same names and inputs, never longer in all.
const cfg = loadConfig(); cfg.userName = 'Sam'; cfg.timeZone = 'UTC'; cfg.readRoots = [tmp];
cfg.webSearch = true; cfg.allTools = true; cfg.hands = { enabled: true, ...Object.fromEntries(Object.keys(HANDS).map((h) => [h, { on: true }])) };
const brain = new Brain(cfg, () => {}); clearInterval(brain.reminderTimer);
const names = Object.keys(brain.tools);
for (const [fam, set] of Object.entries(SETS)) {
  const unknown = Object.keys(set.use).filter((n) => !brain.tools[n]);
  check(`${fam}: every tool it words is one of Bob's tools`, !unknown.length, unknown.join(', '));
  const own = brain.toolSchemas(names), mine = brain.toolSchemas(names, { id: fam, ...set });
  check(`${fam}: the same tools, in the same order`, JSON.stringify(own.map((s) => s.function.name)) === JSON.stringify(mine.map((s) => s.function.name)));
  check(`${fam}: every tool takes exactly the same inputs`, own.every((s, i) => JSON.stringify(s.function.parameters) === JSON.stringify(mine[i].function.parameters)));
  check(`${fam}: no {{placeholder}} is left in its wording`, !JSON.stringify(mine).includes('{{'));
  const a = JSON.stringify(own).length, b = JSON.stringify(mine).length;
  check(`${fam}: all tools on, the list is no longer than Bob's own (${b} vs ${a})`, b <= a, `${b} > ${a}`);
  // The start of a job: the core tools only.
  const core = ['notice_board', 'remember', 'reminders', 'list_folder', 'read_file', 'web_search', 'fetch_page', 'bob_help', 'ask_user'].filter((n) => brain.tools[n]);
  const c1 = JSON.stringify(brain.toolSchemas(core)).length, c2 = JSON.stringify(brain.toolSchemas(core, { id: fam, ...set })).length;
  check(`${fam}: the core tools are no longer than Bob's own (${c2} vs ${c1})`, c2 <= c1, `${c2} > ${c1}`);
}
check('the Lab\'s saved lists get the placeholders filled', !JSON.stringify(inSet(brain.tools.reminders.schema, toolSetFor({}, '', { family: 'gpt-oss' }), { user: 'the user' })).includes('{{'));
check('a tool a set doesn\'t word stays as it is', inSet(brain.tools.bob_help.schema, toolSetFor({}, '', { family: 'gpt-oss' })) === brain.tools.bob_help.schema);
check('the brain works out the set from the model it answers on (none while GPT-OSS is unproven)', brain.toolSetOf('gpt-oss-20b') === null && brain.toolSetOf('riker') === null);
{ const loaded = new Set(); loaded.toolSet = toolSetFor({}, '', { family: 'gpt-oss' }); const t = brain.frontDeskTools(loaded); check('the front desk hands GPT-OSS its wording', t.find((x) => x.function.name === 'reminders')?.function.description.startsWith('Use when')); }

// 3. Logic arguments: what a brain means, read in code (no words added to the brain's list).
const rp = brain.tools.reminders.schema.function.parameters, np = brain.tools.notice_board.schema.function.parameters;
check('"set" means add for reminders', checkArgs(rp, { action: 'set', time: '2030-01-01T09:00', text: 'x' }).args.action === 'add');
check('"remove" means cancel', checkArgs(rp, { action: 'remove', id: 'a' }).args.action === 'cancel');
check('"show" means list', checkArgs(rp, { action: 'show' }).args.action === 'list');
check('"at" is the reminder\'s time', checkArgs(rp, { action: 'add', at: '2030-01-01T09:00', text: 'x' }).args.time === '2030-01-01T09:00');
check('"show" means read for the notice board', checkArgs(np, { action: 'show' }).args.action === 'read');
check('"append" with an item means add for the notice board', (() => { const r = checkArgs(np, { action: 'append', item: 'milk' }); return r.args.action === 'add' && r.args.content === 'milk'; })());
check('times written other ways are read as the local time meant', reminderTime('2030-01-01 9:05') === '2030-01-01T09:05' && reminderTime('2030-01-01T09:05:00Z') === '2030-01-01T09:05' && reminderTime('9:05', '2030-01-01') === '2030-01-01T09:05' && reminderTime('', '') === '');

// The tools themselves, in a throwaway home.
cfg.noticeBoard = path.join(tmp, 'board.md'); cfg.archiveDir = path.join(tmp, 'archive'); cfg.dataDir = path.join(tmp, 'data');
fs.mkdirSync(cfg.dataDir, { recursive: true });
fs.writeFileSync(cfg.noticeBoard, '# Notice board, 2030-01-01\r\n\r\n## Main quest\r\n- [ ] ship it\r\n\r\n## Side quests\r\n- [ ] walk\r\n\r\n## Done\r\n- [x] old\r\n');
const nb = brain.tools.notice_board;
const r1 = await nb.run({ action: 'add', content: '- [ ] buy milk' });
const board = fs.readFileSync(cfg.noticeBoard, 'utf8').replace(/\r\n/g, '\n');
check('add puts one item under Side quests and says so', /Added to the notice board: buy milk\. It has 3 open items now\./.test(r1) && /## Side quests\n- \[ \] walk\n- \[ \] buy milk\n\n## Done/.test(board), `${r1} | ${board}`);
check('the rest of the board is kept', board.includes('- [ ] ship it') && board.includes('- [x] old'));
check('the same item twice is added once', /Already on the notice board/.test(await nb.run({ action: 'add', content: 'Buy milk' })));
fs.rmSync(cfg.noticeBoard);
check('add to an empty board starts one', /Added/.test(await nb.run({ action: 'add', content: 'first' })) && fs.readFileSync(cfg.noticeBoard, 'utf8').includes('- [ ] first'));
// 1.5.222 PC check: "read notes.txt and put the to-dos on my board" wiped the board through write.
{
  const r = await nb.run({ action: 'add', content: '- [ ] eggs\n2. bread\n\n* [ ] first\n' });
  const b = fs.readFileSync(cfg.noticeBoard, 'utf8');
  check('add takes several items, one per line, and skips ones already there', /Added to the notice board: eggs; bread\. Already there: first/.test(r) && b.includes('- [ ] eggs') && b.includes('- [ ] bread'), r);
  let refused = ''; try { await nb.run({ action: 'write', content: '# Notice board\n\n- [ ] call the bank\n' }); } catch (e) { refused = e.message; }
  check('write that would take open items off is refused, names them and points to add', /Not saved: that would take 3 items off the board \(first; eggs; bread\)/.test(refused) && /action add/.test(refused) && fs.readFileSync(cfg.noticeBoard, 'utf8').includes('- [ ] eggs'), refused);
  check('write keeping every open item (ticking one off) is fine', /Notice board saved/.test(await nb.run({ action: 'write', content: '# Notice board\n\n## Side quests\n- [x] first\n- [ ] eggs\n- [ ] bread\n' })));
  check('write with drop true takes items off on purpose', /Notice board saved/.test(await nb.run({ action: 'write', content: '# Notice board\n\n- [ ] eggs\n', drop: true })) && !fs.readFileSync(cfg.noticeBoard, 'utf8').includes('bread'));
}
{
  const rf = brain.tools.read_file;
  fs.writeFileSync(path.join(cfg.readRoots[0], 'notes-222.txt'), 'buy eggs');
  check('read_file finds a bare file name in the folders Bob may read', (await rf.run({ path: 'notes-222.txt' })).includes('buy eggs'));
  let miss = ''; try { await rf.run({ path: 'nope-222.txt' }); } catch (e) { miss = e.message; }
  check('a missing file says where the files Bob can read are', /Files I can read are in:/.test(miss) && miss.includes(cfg.readRoots[0]), miss);
}
check('write says how many items are open', /Notice board saved: 2 open items\./.test(await nb.run({ action: 'write', content: '# Notice board\n- [ ] a\n- [ ] b\n- [x] c\n', drop: true })));
const rem = brain.tools.reminders;
let noTime = ''; try { await rem.run({ action: 'add', text: 'buy milk' }); } catch (e) { noTime = e.message; }
check('a reminder with no time points to the notice board', /notice_board, action add/.test(noTime), noTime);
const set = await rem.run({ action: 'add', text: 'call mum', time: '2099-01-01 18:00' });
const id = set.match(/Reminder (\w+)/)?.[1];
check('a time with a space is set as meant', /set for 2099-01-01T18:00: call mum/.test(set), set);
check('cancel says what it cancelled', new RegExp(`Cancelled reminder ${id} \\(2099-01-01T18:00\\): call mum`).test(await rem.run({ action: 'cancel', id })));
let noId = ''; try { await rem.run({ action: 'cancel', id: 'nope' }); } catch (e) { noId = e.message; }
check('a wrong id says how to find the right one', /action list/.test(noId), noId);

// 4. A to-do or reminder asked for and nothing set one: one more go (the v5 rejects' worst miss).
check('"put milk on my to-do list" is a to-do', expectFrom('put milk on my to-do list')?.kind === 'todo');
check('"add call the bank to my list" is a to-do', expectFrom('add call the bank to my list')?.kind === 'todo');
check('"remind me to call mum at 6" is a reminder', expectFrom('remind me to call mum at 6 pm')?.kind === 'reminder');
check('"remind me what a GGUF is" is a question, not a reminder', expectFrom('remind me what a GGUF is')?.kind !== 'reminder');
check('"don\'t put it on my list" is not an ask', expectFrom("don't put it on my list") === null);

// 5. Plan first, then check the steps (job-steps.js): only when one message asks for two or more things.
const { askedSteps, planLine, stepsNudge } = await import('../src/job-steps.js');
const two = askedSteps('read notes.txt and put the to-dos from it on my notice board');
check('two things in one ask are found, in order', two.length === 2 && /^read notes\.txt/.test(two[0]) && /^put the to-dos/.test(two[1]), JSON.stringify(two));
check('"remember X, then remind me Y" is two things', askedSteps('remember that my cat is called Patches, then remind me tomorrow at 9 to feed him').length === 2);
check('one thing is no plan', askedSteps('remind me to call mum at 6').length === 0);
check('"tell me about cats and dogs" is no plan', askedSteps('tell me about cats and dogs').length === 0);
check('a question is no plan', askedSteps('how do I save a file and open it later?').length === 0);
check('the plan line is one short line', /^This asks for 2 things: 1\) read notes\.txt; 2\) put/.test(planLine(two)) && planLine(two).length < 260 && !planLine(two).includes('\n'));
check('one tool step for two asks gets one more go', /asked for 2 things.*only 1 tool step ran/.test(stepsNudge(two, [{ name: 'read_file', ok: true }], 'Sam')));
check('two tool steps for two asks: no nudge', stepsNudge(two, [{ name: 'read_file', ok: true }, { name: 'notice_board', ok: true }]) === '');
check('use_tools and a failed call don\'t count as steps', /only 1 tool step/.test(stepsNudge(two, [{ name: 'use_tools', ok: true }, { name: 'read_file', ok: true }, { name: 'notice_board', ok: false }])));
const { afterTurn } = await import('../src/verify.js');
{
  const v = afterTurn({ stepsAsked: two, ledger: { actions: [{ name: 'read_file', args: {}, ok: true, text: 'x' }] }, cfg: { userName: 'Sam' } }, 'Done, all on your board.');
  check('the end-of-turn check asks for the missing step', /asked for 2 things/.test(v?.nudge || ''), JSON.stringify(v));
  const q = afterTurn({ stepsAsked: two, ledger: { actions: [{ name: 'read_file', args: {}, ok: true, text: 'x' }] }, cfg: { userName: 'Sam' } }, 'Which board section should they go in?');
  check('a question back is left alone', !/asked for 2 things/.test(q?.nudge || ''));
}

// 6. Tools Bob makes follow the same rules: an action with choices, and forgiving inputs.
const { cleanSpec } = await import('../src/selftools.js');
{
  const { spec } = cleanSpec(cfg, { name: 'shop_list', what: 'Keeps a shopping list in its work folder.', when: 'Sam wants to change the shopping list', inputs: { action: { type: 'string', description: 'what to do', enum: ['add', 'list', 'remove', 'add'] }, item: { type: 'string', description: 'the item' } }, code: '', test: {} });
  check('a made tool\'s input keeps its choices', JSON.stringify(spec.inputs.action.enum) === '["add","list","remove"]');
  const r = checkArgs({ type: 'object', properties: spec.inputs }, { action: 'Show' });
  check('"show" means list for a made tool too', r.args.action === 'list');
}

clearInterval(brain.reminderTimer);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
