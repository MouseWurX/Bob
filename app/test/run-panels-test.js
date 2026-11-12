// 1.5.210: panels you build. None to begin with; Now running's sections are modules you put in a left or right
// panel, each panel Expanded, Collapsed or Hidden. Display only.
import fs from 'node:fs';
import { empty, readPanels, place, setState, showing, visibleIn, whereIs, STATES, KEY } from '../public/panels.js';
import { DEFAULT_ORDER } from '../public/now-sections.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const e = empty();
check('a new install has both panels empty and hidden', e.left.state === 'hidden' && e.right.state === 'hidden' && !e.left.mods.length && !e.right.mods.length && showing(e, 'left') === 'none' && showing(e, 'right') === 'none');
check('the states are Expanded, Collapsed and Hidden', STATES.join() === 'expanded,collapsed,hidden');
check('junk in storage gives the empty start', JSON.stringify(readPanels('not json')) === JSON.stringify(e) && JSON.stringify(readPanels(null)) === JSON.stringify(e));
const odd = readPanels({ left: { state: 'huge', mods: ['tasks', 'nope', 'tasks'] }, right: { state: 'collapsed', mods: ['tasks', 'memory'] } });
check('unknown states and modules are dropped, a module lives in one place', odd.left.state === 'hidden' && odd.left.mods.join() === 'tasks' && odd.right.mods.join() === 'memory' && odd.right.state === 'collapsed');

let p = place(e, 'mind', 'left');
check('the first module in a hidden panel opens it', whereIs(p, 'mind') === 'left' && p.left.state === 'expanded' && showing(p, 'left') === 'expanded');
p = setState(p, 'left', 'collapsed'); p = place(p, 'tasks', 'left');
check('…but a panel set by hand keeps its state', p.left.state === 'collapsed' && p.left.mods.join() === 'mind,tasks');
p = place(p, 'mind', 'right');
check('moving a module takes it out of the other panel', p.left.mods.join() === 'tasks' && p.right.mods.join() === 'mind');
p = place(p, 'mind', '');
check('"Now running" puts it back in the drawer', whereIs(p, 'mind') === '' && !p.right.mods.length && showing(p, 'right') === 'none');
check('a panel with no modules never shows, whatever its state', showing(setState(empty(), 'left', 'expanded'), 'left') === 'none');
p = setState(place(empty(), 'memory', 'right'), 'right', 'hidden');
check('a hidden panel shows nothing, and its modules don\'t poll', showing(p, 'right') === 'none' && !visibleIn(p, 'memory'));
p = setState(p, 'right', 'collapsed');
check('a collapsed panel shows names only, so its modules don\'t poll either', showing(p, 'right') === 'collapsed' && !visibleIn(p, 'memory') && visibleIn(setState(p, 'right', 'expanded'), 'memory'));
check('on a phone no panel shows (no room beside the chat)', showing(setState(p, 'right', 'expanded'), 'right', true) === 'none' && !visibleIn(setState(p, 'right', 'expanded'), 'memory', true));
check('every Now running section can be a module', DEFAULT_ORDER.every((id) => whereIs(place(empty(), id, 'left'), id) === 'left'));

const html = read('public/index.html'), layout = read('public/layout.js'), js = read('public/panels.js'), help = read('public/help-content.js');
check('the page has both panels, hidden, and the panels row in Now running', /<aside id="panelLeft" class="mod-panel" aria-label="Left panel" hidden><\/aside>/.test(html) && /<aside id="panelRight" class="mod-panel" aria-label="Right panel" hidden><\/aside>/.test(html) && /id="panelRow" class="panel-row" role="group"/.test(html) && /id="panelSay" class="sr-only" aria-live="polite"/.test(html));
check('Now running\'s readings and Bob\'s thinking run when their module can be seen, even with Now running shut', /const seen = \(\.\.\.ids\) => !body\.classList\.contains\('right-hidden'\) \|\| ids\.some\(\(id\) => panels\?\.visible\(id\)\)/.test(layout)
  && /if \(!seen\('tasks', 'downloads'\)\) return badgeOnly\(\);/.test(layout) && /if \(!seen\('memory', 'graph'\) \|\| document\.hidden\) return;/.test(layout) && /if \(!seen\('net'\) \|\| document\.hidden\) return;/.test(layout) && /docked && seen\('mind'\) && !document\.hidden/.test(layout));
check('panels are remembered in this window and talk to no server', KEY === 'bob-panels' && !/fetch\(|\/api\//.test(js));
check('Help, the glossary and the FAQ cover panels', /id: 'panels', group: 'Getting started', title: 'Panels you build'/.test(help) && /<dt>Panel<\/dt>/.test(help) && /<dt>Module<\/dt>/.test(help) && /id: 'faq-panels'/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
