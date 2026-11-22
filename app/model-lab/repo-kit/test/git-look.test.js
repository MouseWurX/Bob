// The git looks: the arguments each look runs git with, and how git's answer is worded.
import { check } from './check.js';
import { GIT_LOOKS, MAX_GIT_OUT, SAFE, gitArgs, gitAnswer } from '../src/git-look.js';

check('there are three looks: status, changes and history', GIT_LOOKS.join(',') === 'status,changes,history');
check('status asks for the short form with the branch', gitArgs('status').slice(-3).join(' ') === 'status --short --branch');
check('changes compares with the last commit, for one file when asked', gitArgs('changes', 'a.js').slice(-3).join(' ') === 'HEAD -- a.js' && gitArgs('changes').at(-1) === 'HEAD');
check('changes never starts an outside diff tool', gitArgs('changes').includes('--no-ext-diff') && gitArgs('changes').includes('--no-textconv'));
check('history shows the last 20 commits', gitArgs('history').slice(-2).join(' ') === '-n 20');
check('every look starts with the safe settings', GIT_LOOKS.every((w) => SAFE.every((s, i) => gitArgs(w)[i] === s)));
check('the safe settings switch off hooks and the file watcher', SAFE.includes('core.hooksPath=') && SAFE.includes('core.fsmonitor=false'));
let threw = '';
try { gitArgs('push'); } catch (e) { threw = e.message; }
check('an unknown look is refused, naming the three', /status, changes, history/.test(threw));
check('no output for status reads as nothing changed', gitAnswer('status', { code: 0, out: '\n', err: '' }) === 'Nothing changed since the last commit.');
check('no output for changes and history have their own words', gitAnswer('changes', { code: 0, out: '', err: '' }) === 'No changes since the last commit.' && gitAnswer('history', { code: 0, out: '', err: '' }) === 'No commits yet.');
check('a folder that is not a repository says so', /isn't a git repository/.test(gitAnswer('status', { code: 128, out: '', err: 'fatal: not a git repository' })));
check('git missing says it is not installed', /isn't installed/.test(gitAnswer('status', { code: -1, out: '', err: 'ENOENT' })));
check('any other git error is passed on', gitAnswer('history', { code: 1, out: '', err: 'fatal: bad revision' }) === 'Error: git said: fatal: bad revision');
const long = gitAnswer('changes', { code: 0, out: 'x'.repeat(MAX_GIT_OUT + 50), err: '' });
check('a long answer is cut at the limit and says how much more there is', long.startsWith('x'.repeat(MAX_GIT_OUT) + '\n') && /\(50 more characters/.test(long));
