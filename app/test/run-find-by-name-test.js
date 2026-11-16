// Arg hints from the Maximus rerun's bad_args faults (Nov 16): a missing file is looked for by its name in the folders
// Bob may read; a bare name is found a few folders down; a new file whose name is used elsewhere says so; a file://
// link points at read_file; a refused script says nothing was saved; repeated one-off reminders say repeats are off;
// forget_topic says a saved memory isn't a topic. Everything is in a temp folder: no real home folder, no web.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findByName, foundLine, pathArg, NOT_THERE, whereItIs as whereFound } from '../src/find-by-name.js';
import { buildTools, readableRoots, isSensitive } from '../src/tools.js';
import { forgetTopicTool } from '../src/housekeeping.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-findname-'));
const home = path.join(root, 'you');
const docs = path.join(home, 'Documents');
const inn = path.join(root, 'inn');
const data = path.join(root, 'data');
for (const d of [path.join(docs, 'app', 'utils'), path.join(home, 'Desktop'), path.join(home, 'AppData', 'Local'), path.join(home, '.hidden'), inn, data]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(docs, 'scraper.py'), 'print(1)\n');
fs.writeFileSync(path.join(docs, 'data.json'), '[{"id": 1}\n{"id": 2}]\n');
fs.writeFileSync(path.join(docs, 'app', 'utils', 'validator.py'), 'def validate_email(s):\n    return True\n');
fs.writeFileSync(path.join(home, 'AppData', 'Local', 'hidden.txt'), 'x');
fs.writeFileSync(path.join(home, '.hidden', 'hidden.txt'), 'x');
fs.writeFileSync(path.join(home, 'Desktop', 'notes.txt'), 'a');
fs.writeFileSync(path.join(docs, 'notes.txt'), 'b');
const cfg = { readRoots: [inn, home], innDir: inn, dataDir: data, memoryFile: path.join(inn, 'bob-memory.md'), timeZone: 'America/Edmonton', userName: 'Sam', projects: {} };

// ---- the finder ----
check('finds a file one folder down', findByName([home], 'scraper.py')[0] === path.join(docs, 'scraper.py'));
check('finds a file three folders down, case aside', findByName([home], 'VALIDATOR.py')[0] === path.join(docs, 'app', 'utils', 'validator.py'));
check('finds a folder by name', findByName([home], 'utils')[0] === path.join(docs, 'app', 'utils'));
check('skips AppData and hidden folders', findByName([home], 'hidden.txt').length === 0);
check('nothing by that name: empty', findByName([home], 'nope.txt').length === 0);
check('a name with a slash is not looked up', findByName([home], 'app/utils').length === 0);
check('two by one name: both, nearest first', findByName([home], 'notes.txt').length === 2);
check('skip leaves a path out', findByName([home], 'scraper.py', { skip: (f) => f.endsWith('scraper.py') }).length === 0);
check('the entry cap stops the walk', findByName([home], 'validator.py', { entries: 3 }).length === 0);
check('the depth cap stops the walk', findByName([home], 'validator.py', { depth: 1 }).length === 0);
check('pathArg reads path, paths[0] and file', pathArg({ path: ' a ' }) === 'a' && pathArg({ paths: ['b'] }) === 'b' && pathArg({ file: 'c' }) === 'c' && pathArg({}) === '');
check('not-there words are seen', NOT_THERE.test('Error: "x" isn\'t there.') && NOT_THERE.test('Error: C:\\x doesn\'t exist.') && !NOT_THERE.test('Error: too big'));
check('the line names the one found', foundLine([path.join(docs, 'scraper.py')]).includes(path.join(docs, 'scraper.py')));
check('the very path that failed is no help', foundLine([path.join(docs, 'scraper.py')], path.join(docs, 'scraper.py')) === '');

// ---- the error's Next: says where it is ----
const whereItIs = (c, args, text) => (c ? whereFound(readableRoots(c), (f) => isSensitive(c, f), args, text) : '');
const err = `Error: "${path.join(home, 'scraper.py')}" isn't there. Next: check the name and folder with list_folder, then try once more.`;
const w = whereItIs(cfg, { path: path.join(home, 'scraper.py') }, err);
check('a missing file: Next says where it is', w.includes(`Next: scraper.py is at ${path.join(docs, 'scraper.py')}`) && !w.includes('list_folder'), w);
check('a missing folder too', whereItIs(cfg, { path: path.join(home, 'app') }, `Error: "${path.join(home, 'app')}" isn't there. Next: x.`).includes(path.join(docs, 'app')));
check('file_hands paths[0] too', whereItIs(cfg, { paths: [path.join(inn, 'data.json')] }, `Error: ${path.join(inn, 'data.json')} doesn't exist.`).includes(path.join(docs, 'data.json')));
check('another error: unchanged', whereItIs(cfg, { path: path.join(home, 'scraper.py') }, 'Error: That file is 30 MB.') === '');
check('nothing by that name: unchanged', whereItIs(cfg, { path: path.join(home, 'nope.py') }, 'Error: "nope.py" isn\'t there.') === '');
check('no cfg: unchanged', whereItIs(null, { path: 'x' }, "isn't there") === '');

// ---- read_file with a bare name finds it a folder down ----
const tools = buildTools(cfg);
const r1 = await tools.read_file.run({ path: 'data.json' });
check('a bare name a folder down is read, and says where', r1.startsWith(`(Found data.json at ${path.join(docs, 'data.json')}.)`) && r1.includes('"id": 2'), r1.slice(0, 120));
let e2 = '';
try { await tools.read_file.run({ path: 'notes.txt' }); } catch (e) { e2 = e.message; }
check('two by that name: both listed, none read', e2.includes('There are 2 files called notes.txt') && e2.includes(path.join(docs, 'notes.txt')), e2);
let e3 = '';
try { await tools.read_file.run({ path: 'nope.txt' }); } catch (e) { e3 = e.message; }
check('none by that name: the old error', e3.startsWith("There's no file called nope.txt"));

// ---- write_file: a new file whose name is used elsewhere says so ----
const w1 = await tools.write_file.run({ path: path.join(home, 'data.json'), content: '[]\n' });
check('a new twin names the other one', w1.includes(`there's already a data.json at ${path.join(docs, 'data.json')}`), w1);
const w2 = await tools.write_file.run({ path: path.join(home, 'data.json'), content: '[1]\n' });
check('overwriting a file says nothing more', w2 === `Saved ${path.join(home, 'data.json')}.`, w2);
const w3 = await tools.write_file.run({ path: path.join(inn, 'fresh.md'), content: 'x' });
check('a new file with a new name says nothing more', w3 === `Saved ${path.join(inn, 'fresh.md')}.`);

// ---- a refused script says nothing was saved ----
let e4 = '';
try { tools.write_file.check({ path: path.join(home, 'rename.py'), content: 'x' }); } catch (e) { e4 = e.message; }
check('a refused script: nothing saved, show it instead', e4.includes('nothing was saved') && e4.includes('code block') && e4.includes('Sam'), e4);

// ---- fetch_page with a file:// link ----
let e5 = '';
try { await tools.fetch_page.run({ url: 'file:///home/you/scraper.py' }, {}); } catch (e) { e5 = e.message; }
check('a file:// link points at read_file', e5.includes('not a web page') && e5.includes('read_file'), e5);

// ---- reminders: one-off twins say repeats are off ----
const rem = tools.reminders;
const day = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.toISOString().slice(0, 10)}T06:00`; };
const a1 = await rem.run({ action: 'add', text: '6 am alarm', time: day(2) });
check('the first one says nothing more', !a1.includes('Repeating reminders are off'), a1);
const a2 = await rem.run({ action: 'add', text: '6 am alarm', time: day(3) });
check('the second with the same words says repeats are off', a2.includes("That's 2 with these words") && a2.includes('Let reminders repeat') && a2.includes('Sam'), a2);
const a3 = await rem.run({ action: 'add', text: 'dentist', time: day(3) });
check('other words: nothing more', !a3.includes('Repeating reminders are off'));
const repOn = buildTools({ ...cfg, moreTools: { repeatReminders: true } }).reminders;
const a4 = await repOn.run({ action: 'add', text: '6 am alarm', time: day(4) });
check('with repeats on: no note (the every field is offered)', !a4.includes('Repeating reminders are off'));

// ---- forget_topic: a saved memory isn't a topic ----
const ft = forgetTopicTool({ cfg, housekeeper: { topics: { find: () => null, list: () => [] } } });
const f1 = await ft.run({ topic: 'argument with a colleague' });
check('no topic: says a memory isn\'t one, and where the line is', f1.includes("isn't a topic") && f1.includes(cfg.memoryFile) && f1.includes("Don't say it's gone"), f1);

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
