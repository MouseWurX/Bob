// Step planning: the separate things one request asks for, the line that names them, and the closing check.
import { check } from './check.js';
import { askedSteps, planLine, stepsDone, stepsNudge } from '../src/job-steps.js';

const two = askedSteps('Read notes.txt and put the to-dos on my board');
check('two things to do are found, in order', two.length === 2 && /^Read notes\.txt/.test(two[0]) && /^put the to-dos/.test(two[1]));
check('one thing to do is not a plan', askedSteps('Read notes.txt').length === 0);
check('a question is not a plan', askedSteps('How do I read a file and save it?').length === 0);
check('at most six steps are kept', askedSteps('add a, then add b, then add c, then add d, then add e, then add f, then add g, then add h').length === 6);
check('the plan line names each step', planLine(['read a', 'save b']).startsWith('This asks for 2 things: 1) read a; 2) save b.'));
const acts = [{ name: 'read_file' }, { name: 'use_tools' }, { name: 'write_file', ok: false }, { name: 'edit_file', declined: true }, { name: 'notice_board' }];
check('steps done: tool calls that worked, not helpers, failures or ones the user declined', stepsDone(acts) === 2);
check('enough steps done needs no nudge', stepsNudge(['read a', 'save b'], acts) === '');
check('too few steps done gets a nudge that names them', /asked for 3 things .*but only 2 tool steps ran/.test(stepsNudge(['read a', 'save b', 'send c'], acts, 'Sam')) && stepsNudge(['read a', 'save b', 'send c'], acts, 'Sam').startsWith('Sam asked'));
check('a words-only step counts once a tool made the file', stepsNudge(['write a packing list', 'save it as a Word document'], [{ name: 'office_make' }]) === '');
