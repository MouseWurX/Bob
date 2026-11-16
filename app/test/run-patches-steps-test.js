// Nov 16 (the owner): Patches, Bob's cat, tells the steps in the thinking bubble. Display only: nothing reaches a brain.
import fs from 'node:fs';
import { PAW, WAITING, waitingLine, doneWords, stepWords, snagWords, stepKind, bobAside, ASIDES } from '../public/patches-steps.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- the words ----
check('reading a file', stepWords('read src/app.js', 'Patches') === 'Patches noses through src/app.js');
check('a web search', stepWords('search: qwen 3.6 context', 'Patches') === 'Patches goes hunting: qwen 3.6 context');
check('a page after a search says it found something', stepWords('read page: https://example.com', 'Patches', 'search: qwen') === 'Patches found something. Reading https://example.com now');
check('a page with no search before it', stepWords('read page: https://example.com', 'Patches') === 'Patches pads over to https://example.com');
check('a file after a folder list', stepWords('read notes.md', 'Patches', 'list docs') === 'Patches picked one. Reading notes.md now');
check('writing', stepWords('write a.txt', 'Patches') === 'Patches nudges the changes into a.txt, paws steady');
check('a page read is not taken for a file read', !/noses/.test(stepWords('read page: x', 'P')));
check('a document search is not taken for a web search', /documents/.test(stepWords('search my documents for "tax"', 'P')));
check('anything else keeps its plain words, with her name', stepWords('cloud helper: openrouter', 'Patches') === 'Patches: cloud helper: openrouter');
check('the cat\'s own name from Settings', stepWords('list C:/x', 'Mittens') === 'Mittens peeks into C:/x');
check('no name: Patches', /^Patches /.test(stepWords('list x', '')));
check('no summary: the caller keeps its own words', stepWords('', 'Patches') === null);
check('a snag', snagWords('read a.js', 'Patches') === 'Patches hit a snag: read a.js');
check('the done line', doneWords('Patches', '2m 10s', 7) === 'Patches reports: 2m 10s · 7 steps');
check('one step, waited on you', doneWords('Patches', '5s', 1, true) === 'Patches reports: 5s · 1 step · waited on you');
check('no steps', doneWords('Patches', '12s', 0) === 'Patches reports: thought for 12s');
check('waiting lines take turns and use the name', waitingLine(0, 'Mittens').startsWith('Mittens ') && waitingLine(1, 'x') !== waitingLine(0, 'x') && waitingLine(-1, 'x') === waitingLine(WAITING.length - 1, 'x'));
check('waiting lines are short enough for a phone', WAITING.every((l) => l.replace('{cat}', '').length <= 28));
check('every waiting line names the cat', WAITING.every((l) => l.includes('{cat}')));
check('the paw', PAW === '🐾');

// ---- Bob, surprised and worried, when the cat does something no cat should ----
check('reading is odd for a cat', stepKind('read a.js') === 'read' && stepKind('search: x') === 'search' && stepKind('write a.js') === 'write' && stepKind('run: npm test') === 'run');
check('peeking into a folder or watching a picture is cat business', stepKind('list docs') === '' && stepKind('image: a fox') === '' && stepKind('remember: x') === '');
check('the first odd step gets an aside', bobAside('read a.js', 0) === ASIDES.read[0]);
check('not every line: the next three get none', [1, 2, 3].every((n) => bobAside('read a.js', n) === ''));
check('every fourth odd step gets another, a different one', bobAside('read a.js', 4) === ASIDES.read[1]);
check('cat things never get one', bobAside('list docs', 0) === '');
check('unknown steps get a general one', bobAside('cloud helper: x', 0) === ASIDES.other[0]);
check('every kind has asides', Object.values(ASIDES).every((l) => l.length >= 2));

// ---- where it's wired, and what it doesn't touch ----
const bubble = read('public/think-bubble.js'), app = read('public/app.js');
check('the bubble uses the cat\'s words when on', /patches\(\) \? catStep\(plain, cat\(\), b\.prevStep\)/.test(bubble) && /patches\(\) \? `\$\{PAW\} \$\{waitingLine/.test(bubble) && /patches\(\) \? PAW/.test(bubble));
check('every Patches line starts with the paw', /`\$\{PAW\} \$\{waitingLine/.test(bubble) && /PAW \+ ' ' \+ doneWords/.test(bubble));
check('Bob\'s aside goes on the step, counted per turn', /bobAside\(plain, \(b\.odd = /.test(bubble) && /\(Bob: \$\{esc\(aside\)\}\)/.test(bubble) && /oddSteps = -1/.test(app));
check('the paw is hidden from screen readers and the plain step is on hover', /aria-hidden="true">\$\{PAW\}/.test(bubble) && /title="\$\{esc\(plain\)\}"/.test(bubble));
check('Copy the steps stays plain', /copy\(stepsText\(b\.trace\)\)/.test(bubble));
check('the page passes the switch in and follows Settings', /patches: \(\) => patchesOn/.test(app) && /bob-patches-steps/.test(app) && (app.match(/patchesOn = st\.patchesSteps !== false/g) || []).length === 2);
check('the old chat lines get her words too', /patchesOn \? catStep\(ev\.summary, catName, lastStep\)/.test(app));
check('Bob\'s thinking window stays plain', !/patches/i.test(read('public/mind-lines.js')) && !/patches-steps/.test(read('public/mind-view.js')));
check('Settings has the switch, on unless turned off', /sswitch\('patchesSteps', settings\.patchesSteps !== false/.test(read('public/cellar-pages.js')) && /'bob-patches-steps'/.test(read('public/cellar.js')));
const server = read('src/server.js');
check('the server saves it and says it', /out\.patchesSteps = cfg\.patchesSteps !== false/.test(server) && /patchesSteps: cfg\.patchesSteps !== false/.test(server));
check('saved settings read it as on unless false', /out\.patchesSteps = out\.patchesSteps !== false/.test(read('src/config.js')));
check('nothing reaches a brain', !/patches-steps|patchesSteps/.test(read('src/prompts.js')) && !/patches-steps|patchesSteps/.test(read('src/brain-tool-runs.js')) && !/patches-steps/.test(read('src/brain-words.js')));
const help = read('public/help-content.js');
check('Help, FAQ, glossary and the settings list', /id: 'patches-steps'/.test(help) && /id: 'faq-patches-steps'/.test(help) && /<dt>Patches tells the steps<\/dt>/.test(help) && /set\('Patches tells the steps', 'On'/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
