// 1.5.216 (the owner, Nov 13): no Tasks strip across the chat. A small see-through word bubble pops up under the Tasks
// tab when a task starts, waits or fails, and fades back into the tab.
import fs from 'node:fs';
import { taskNews, POP_MS, FADE_MS } from '../public/task-pop.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

{
  const seen = new Map();
  check('opening Bob notes the tasks already there', taskNews([{ id: 'a', state: 'working', text: 'Old' }], seen)?.state === 'working' && seen.get('a') === 'working');
  check('the same list again says nothing', taskNews([{ id: 'a', state: 'working', text: 'Old' }], seen) === null);
  check('a new task that starts at once says Started', taskNews([{ id: 'b', state: 'working', text: 'Make a spreadsheet' }], seen)?.text === 'Started: Make a spreadsheet');
  check('a new task in line says it waits', taskNews([{ id: 'c', state: 'waiting', text: 'Look up the weather' }], seen)?.text === 'Waiting its turn: Look up the weather');
  check('a waiting task that starts says Started', taskNews([{ id: 'c', state: 'working', text: 'Look up the weather' }], seen)?.state === 'working');
  check('a failed task says it didn\'t finish', taskNews([{ id: 'c', state: 'failed', text: 'Look up the weather' }], seen)?.text === "Didn't finish: Look up the weather");
  check('done and cancelled stay quiet', taskNews([{ id: 'b', state: 'done', text: 'x' }, { id: 'd', state: 'cancelled', text: 'y' }], seen) === null);
  check('a resumed (paused, then waiting) task stays quiet until it starts', (seen.set('e', 'paused'), taskNews([{ id: 'e', state: 'waiting', text: 'z' }], seen)) === null);
  check('the whole task text, never cut', taskNews([{ id: 'f', state: 'working', text: 'x'.repeat(400) }], seen)?.text.length === 'Started: '.length + 400);
}

const html = read('public/index.html'), css = read('public/style.css'), app = read('public/app.js'), pop = read('public/task-pop.js');
check('the strip above the message box is gone', !/id="queue"/.test(html) && !/#queue/.test(css) && !/qbox/.test(app));
check('the bubble is outside the chat column, in a fixed layer', /<div id="taskPop"[^>]*class="say-bubble task-pop"/.test(html) && html.indexOf('id="taskPop"') < html.indexOf('<div class="mid">') && /\.task-pop \{ position: fixed;/.test(css));
check('see-through like Bob\'s bubbles (72% + blur), 0.7 s fades', /\.say-bubble \{[^}]*72%[^}]*blur[^}]*transition: opacity \.7s/.test(css) && FADE_MS === 700 && POP_MS >= 3000);
check('it fades out into the Tasks tab', /\.task-pop\.into \{ opacity: 0; transform: translateY\(-14px\) scale\(\.2\)/.test(css) && /classList\.add\('into'\)/.test(pop));
check('on a phone it sits above the bottom-bar Tasks button and taps go through', /bar-item\[data-go="tasksBtn"\]/.test(pop) && /\.task-pop\.up\.on \{ pointer-events: none; \}/.test(css));
check('screen readers hear it', /id="taskPop"[^>]*role="status" aria-live="polite"/.test(html));
check('jobs feed the bubble', /taskPop\.jobs\(jobs\)/.test(app));
check('Help, glossary and FAQ', /Tasks bubble<\/dt>/.test(read('public/help-content.js')) && /id: 'faq-tasks-bubble'/.test(read('public/help-content.js')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
