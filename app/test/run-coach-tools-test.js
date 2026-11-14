// coach-tools.mjs (14 Nov, Bobert: "prompt him lessons, he tries to do it, and you observe the tools he uses. if you can coach
// him to the correct path you do it"): the kind of miss, the three hint levels, the messages after a miss, the score table. No server.
import { missKind, hint, afterMiss, summarizeCoach, NUDGE } from '../model-lab/coach-tools.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const want = [{ name: 'file_hands', args: { action: 'zip', path: 'C:/logs' } }];
check('right call is no miss', missKind(want, [{ name: 'file_hands', args: { action: 'zip', path: 'C:/logs' } }]) === null);
check('no call when one was wanted', missKind(want, []) === 'none');
check('wrong tool', missKind(want, [{ name: 'list_folder', args: {} }]) === 'tool');
check('right tool, inputs off', missKind(want, [{ name: 'file_hands', args: { action: 'copy' } }]) === 'inputs');
check('a call when none was wanted', missKind([], [{ name: 'web_search', args: {} }]) === 'extra' && missKind([], []) === null);
check('hint 1 is the nudge for the miss', hint(1, 'none', want) === NUDGE.none && hint(1, 'tool', want) === NUDGE.tool);
check('hint 2 names the tool', hint(2, 'tool', want) === 'Use file_hands.');
check('hint 2 for inputs names the inputs', hint(2, 'inputs', want) === 'Set action, path to what I asked for.');
check('hint 3 spells out the call (string args too)', hint(3, 'tool', [{ name: 'file_hands', args: '{"action":"zip"}' }]) === 'Call file_hands with {"action":"zip"}.');
check('an extra call always gets the plain answer hint', hint(3, 'extra', []) === NUDGE.extra);
const am = afterMiss({ content: '', tool_calls: [{ id: 'x1', function: { name: 'list_folder', arguments: { path: 'C:/' } } }] }, 'Use file_hands.');
check('a wrong call is not run, then the hint', am.length === 3 && am[0].tool_calls[0].function.arguments === '{"path":"C:/"}' && am[1].role === 'tool' && am[1].content.startsWith('Not run') && am[2].role === 'user' && am[2].content === 'Use file_hands.');
check('a text reply then the hint', afterMiss({ content: 'Which folder?' }, NUDGE.none).map((m) => m.role).join(',') === 'assistant,user');
const s = summarizeCoach([
  { cond: 'bob think-off', job: 'files', solved_at: 0, tries: [{ calls: [{ name: 'file_hands' }], miss: null }] },
  { cond: 'bob think-off', job: 'files', solved_at: 2, tries: [{ calls: [], miss: 'none' }, {}, {}] },
  { cond: 'bob think-off', job: 'web', solved_at: null, tries: [{ calls: [{ name: 'list_folder' }], miss: 'tool' }] }
])['bob think-off'];
check('scores: first, after hint 2, never', s.n === 3 && s.first === 1 && s.h2 === 1 && s.never === 1 && s.jobs.files.coached === 1);
check('first-try tools and miss kinds', s.first_tools.file_hands === 1 && s.first_tools.list_folder === 1 && s.kinds.none === 1 && s.kinds.tool === 1);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
