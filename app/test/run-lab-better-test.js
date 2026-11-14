// The Lab, tidied: tabs sorted by what you're doing (each page on one tab), one line under the tabs, one place to
// start on Make a brain, a button on every "get one in Get models" message, My Lab, and the Lab's own window.
// Reads only Bob's own files; the screen is passed in, never read.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLAY_PAGES } from '../public/lab-playground.js';
import { GO, goBtn, goWhere } from '../public/lab-go.js';
import { SHELVES, shelfRows, mineHtml } from '../public/lab-mine.js';
import { CHANNEL, LAB_URL, labWantsWindow, accept, message } from '../public/lab-link.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const lab = read('public/lab.js');

// The tabs and the pages under them
const tabs = [...lab.match(/const TABS = (\[\[.*?\]\]);/)[1].matchAll(/\['(\w+)', '([^']+)'\]/g)].map((m) => [m[1], m[2]]);
const subs = Object.fromEntries([...lab.match(/const SUBS = \{(.*?)\};/)[1].matchAll(/(\w+): \[([^\]]*)\]/g)].map((m) => [m[1], m[2].split(',').map((x) => x.trim().replace(/'/g, ''))]));
check('the tabs are sorted by task, with My Lab last', tabs.map(([id]) => id).join(' ') === 'make teach test inside learn forge steps mine' && tabs.at(-1)[1] === 'My Lab');
const placed = Object.values(subs).flat();
check('every Playground page sits under exactly one tab', PLAY_PAGES.every(([id]) => placed.filter((x) => x === id).length === 1), PLAY_PAGES.map(([id]) => id).filter((id) => placed.filter((x) => x === id).length !== 1).join(' '));
check('no page is on two tabs, and every group belongs to a real tab', new Set(placed).size === placed.length && Object.keys(subs).every((t) => tabs.some(([id]) => id === t)));
check('Challenges is on Test and the experiments on Learn', subs.test[0] === 'challenges' && subs.learn[0] === 'learn');
check('the old Playground and Challenges top tabs are gone', !/\['playground', 'Playground'\]/.test(lab) && !/\['challenges', 'Challenges'\]/.test(lab));
check('arrow keys move along the row of pages under a tab, not the top tabs', /const inner = Boolean\(e\.target\.dataset\.playpage\)/.test(lab));

// One line under the tabs
check('the mode switch, its note and the engine share one row', /<div class="lab-top"><div class="lab-mode"/.test(lab) && /data-labengine/.test(lab) && /\.lab-top \{ display: flex; flex-wrap: wrap/.test(read('public/style.css')));
const notes = [...lab.match(/const MODE_NOTES = \{([\s\S]*?)\n\};/)[1].matchAll(/\n  (\w+): '((?:[^'\\]|\\.)*)'/g)].map((m) => [m[1], m[2]]);
check('each tab has one short line on what Professional adds', notes.length === tabs.length && notes.every(([, t]) => t.length <= 120), notes.filter(([, t]) => t.length > 120).map(([k]) => k).join(' '));

// One place to start on Make a brain
check('Make a brain asks for the job first; goals and templates fold away inside a job that cuts', lab.indexOf('${jobsHtml()}') > 0 && lab.indexOf('${jobsHtml()}') < lab.indexOf('${rc.galleryHtml()}') && /data-fold="fill"[^>]*><summary>Fill the steps for me/.test(lab));
check('the usage map shows only with a job that cuts, where step 1 is on screen', /job && hasPart\('cut'\) \? rc\.usageHtml\(\) : ''/.test(lab));
check('a fold stays open across redraws', /const folds = \{ fill: false, senses: false \}/.test(lab) && /folds\[k\] = e\.target\.open/.test(lab));
check('the Forge folds Best practice and the sight and hearing steps away', /<details class="forge-tips-d"><summary>Best practice<\/summary>/.test(read('public/lab-forge.js')) && /data-fold="senses"/.test(lab));

// A button on every dead end
check('the take-me-there buttons know three places and nothing else', Object.keys(GO).join(' ') === 'models engines chat' && goWhere('models') === 'models' && goWhere('toString') === '' && goBtn('nowhere') === '' && /data-labgo="engines"/.test(goBtn('engines')));
const pub = fs.readdirSync(fileURLToPath(new URL('../public/', import.meta.url))).filter((f) => /^lab.*\.js$/.test(f)).map((f) => [f, read(`public/${f}`)]);
const dead = pub.flatMap(([f, s]) => [...s.matchAll(/<p>[^<`]*(?:There(?:'|\\')s no|There are no|No diffusion)[^<`]*(?:Get models)[^<`]*<\/p>/g)].filter((m) => !/goBtn\('models'\)/.test(m[0])).map(() => f));
check('no "nothing here, get one in Get models" message is left without its button', !dead.length, dead.join(' '));
check('the Lab acts on the press before a page can swallow it', lab.indexOf('if (b.dataset.labgo)') > 0 && lab.indexOf('if (b.dataset.labgo)') < lab.indexOf('if (isLearn()) return;\n    if (b.dataset.boardby)'));
check('Learn offers the chat when no brain is loaded', /view\.wake \? goBtn\('chat'\)/.test(read('public/lab-learn.js')));

// My Lab
const view = { made: [{ id: 'a', name: 'Tiny Lab', sizeGB: 1.2, from: 'Tiny' }], scores: [{ name: 'Tiny Lab', overall: 71, when: 'today' }], ladders: [{ brain: { name: 'Tiny' }, rows: [1, 2, 3], when: 'today' }], lessonSets: [{ name: 'My set', count: 40 }], recipes: [{ name: 'Small one' }], runs: Array.from({ length: 12 }, (_, i) => ({ name: `job ${i}`, state: 'done' })) };
const rows = shelfRows(view);
check('My Lab lists brains, scores, ladders, lesson sets, recipes and the last eight jobs', rows.brains[0][1] === '1.2 GB · from Tiny' && /71 out of 100/.test(rows.scores[0][1]) && /3 sizes/.test(rows.ladders[0][1]) && rows.sets[0][1] === '40 lessons' && rows.recipes.length === 1 && rows.jobs.length === 8);
check('every shelf opens a real tab and page', SHELVES.every((s) => [s.to, s.emptyTo].filter(Boolean).every(([t, p]) => tabs.some(([id]) => id === t) && (!p || subs[t]?.includes(p)))));
const html = mineHtml({ made: [{ name: '<b>x</b>', sizeGB: 1 }] });
check('My Lab escapes names, shows no path, and an empty shelf says how to fill it', html.includes('&lt;b&gt;x&lt;/b&gt;') && !/[A-Za-z]:\\|\/home\//.test(mineHtml(view)) && /None yet\. Run some challenges\./.test(html) && /data-minego="test:challenges"/.test(html));
check('an empty view draws without a throw', typeof mineHtml({}) === 'string' && typeof mineHtml() === 'string');

// Its own window
check('the Lab gets a window on a computer and stays a page on a phone or tablet', labWantsWindow({ hasChannel: true, width: 1280 }) && !labWantsWindow({ hasChannel: true, width: 1280, coarse: true }) && !labWantsWindow({ hasChannel: true, width: 400 }) && !labWantsWindow({ width: 1280 }) && !labWantsWindow());
check('the main window acts only on what it knows from the Lab window', accept(message('go', 'models')).where === 'models' && accept(message('go', 'elsewhere')) === null && accept(message('note', 'x'.repeat(900))).text.length === 400 && accept({ from: 'someone', name: 'go', detail: 'models' }) === null && accept(message('eval', 'x')) === null && accept(null) === null && CHANNEL === 'bob-lab');
const win = read('public/lab.html'), winJs = read('public/lab-window.js'), main = read('electron/main.cjs'), app = publicText('app.js');
check('the Lab window page holds the Lab and loads only its own script', /<dialog id="lab" class="cellar page lab-dlg"/.test(win) && /id="lab-body"/.test(win) && /id="lab-close"/.test(win) && (win.match(/<script/g) || []).length === 1 && /src="\/lab-window\.js"/.test(win) && !/https?:\/\//.test(win));
check('the window reads the Lab\'s progress itself and asks the main window to go places', /new EventSource\('\/api\/events'\)/.test(winJs) && /createLab\(\{ api, note, go: \(where\) => tell\('go', where\), page: true \}\)/.test(winJs) && /'x-bob': '1'/.test(winJs) && !/https?:\/\//.test(winJs));
check('the Lab button opens the window, or the page when there are no windows', /if \(!openLabWindow\(\)\) labPage\.open\(\)/.test(app) && /window\.open\(LAB_URL, LAB_WINDOW_NAME, LAB_WINDOW_SIZE\)/.test(app) && LAB_URL === '/lab.html');
check('Bob.exe lets /lab.html open as one ordinary window, and the fNRI viewer still opens from it', /url === base \+ '\/lab\.html'/.test(main) && /labWin = child/.test(main) && /child\.on\('closed', \(\) => \{ labWin = null; \}\)/.test(main) && /if \(String\(d\?\.url \|\| ''\)\.startsWith\(base \+ '\/watch\.html'\)\) adoptWatch\(grand\)/.test(main) && /if \(url !== base \+ '\/lab\.html'\) e\.preventDefault\(\)/.test(main));
check('as a window the Lab is not a box over the chat', /if \(page\) dlg\.show\(\); else dlg\.showModal\(\)/.test(lab) && /\.lab-window #lab-close \{ display: none; \}/.test(read('public/style.css')));

// Help
const helpOf = (id) => HELP.find((e) => e.id === id);
const labHelp = helpOf('lab')?.html || '';
check('Help lists the new tabs, the window and My Lab', ['Teach', 'Test', 'Look inside', 'Learn', 'Forge', 'My Lab'].every((t) => labHelp.includes(`<strong>${t}</strong>`)) && /its own window/.test(labHelp));
check('Help no longer sends anyone to a Playground tab', !HELP.some((e) => e.id !== 'faq-lab-tabs' && /Playground/.test(e.title + e.html)), HELP.filter((e) => e.id !== 'faq-lab-tabs' && /Playground/.test(e.title + e.html)).map((e) => e.id).join(' '));
check('there is an FAQ for where the tabs went, and a glossary line for My Lab', /Test<\/strong> has Challenges, Smaller, Longer and Faster/.test(helpOf('faq-lab-tabs')?.html || '') && HELP.some((e) => /<dt>My Lab<\/dt>/.test(e.html)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
