// Characters per token: counting a request, learning the figure from a reply, and the figure used for a brain.
import { check } from './check.js';
import { DEFAULT_PER, MIN_PER, MAX_PER, MIN_TOKENS, promptChars, learnPer, perFor } from '../src/token-count.js';

check('the first guess is 3 characters a token', DEFAULT_PER === 3);
check('a request is counted by its messages, tool calls and tool list', promptChars([{ content: 'abcd' }, { content: 'ef', tool_calls: [1] }], [{ a: 1 }]) === 4 + 2 + 3 + 9);
check('no messages and no tools count as nothing', promptChars() === 0 && promptChars([], []) === 0);
check('the first reply sets the figure', learnPer(null, 900, 300) === 3);
check('later replies are blended: 7 parts old, 3 parts new', learnPer(3, 1200, 300) === 3.3);
check('the figure stays between the limits', learnPer(null, 100000, 300) === MAX_PER && learnPer(null, 300, 300) === MIN_PER);
check('a reply with too few tokens teaches nothing', learnPer(2.5, 400, MIN_TOKENS - 1) === 2.5 && learnPer(null, 400, 10) === null);
check('the figure for a brain is what was learned, else the first guess', perFor({ big: 2.4 }, 'big') === 2.4 && perFor({}, 'x') === 3 && perFor(null, 'x') === 3);
