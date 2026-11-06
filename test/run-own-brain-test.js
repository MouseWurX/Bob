// 1.5.131: the bracket after a model Bob downloaded himself says "downloaded by Bob", never "Bob's own engine" (which
// read as "Bob's own brain" on every stock Qwen and Gemma). "Bob's own brain" is kept for catalogue entries marked
// madeByBob: true, and none is shipped yet, so nothing installed today may carry it.
import fs from 'node:fs';
import { fileLabel, isMadeByBob, MADE_BY_BOB, DOWNLOADED_BY_BOB } from '../src/models.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const catalog = JSON.parse(read('catalog.json'));

check('a stock model downloaded by Bob is labelled "downloaded by Bob"', fileLabel({ id: 'qwen3-4b', name: 'Qwen3 4B' }) === `Qwen3 4B (${DOWNLOADED_BY_BOB})`);
check('the label never says "own engine" or "own brain" for a stock model', !/own engine|own brain/i.test(fileLabel({ name: 'Gemma 4 26B', ollama: 'gemma4:26b' })));
check('a name that sounds like one of Bob\'s is still a stock model (no fuzzy name match)', !isMadeByBob({ name: 'Bob Riker 28B' }) && !isMadeByBob({ name: 'Qwen3.6 35B-A3B', family: 'Qwen' }) && fileLabel({ name: 'Bob Riker 28B' }).includes(DOWNLOADED_BY_BOB));
check('only the explicit madeByBob: true marker gives "Bob\'s own brain"', fileLabel({ name: '28Bob Riker', madeByBob: true }) === `28Bob Riker (${MADE_BY_BOB})`);
check('a truthy-but-not-true marker does not count', !isMadeByBob({ name: 'x', madeByBob: 'yes' }) && !isMadeByBob({ name: 'x', madeByBob: 1 }));
check('no model in the catalogue is marked as made by Bob (none shipped yet)', catalog.models.every((m) => !isMadeByBob(m)), catalog.models.filter(isMadeByBob).map((m) => m.id).join(','));
check('no catalogue model carries a Bob name', catalog.models.every((m) => !/\bbob\b/i.test(m.name)), catalog.models.filter((m) => /\bbob\b/i.test(m.name)).map((m) => m.id).join(','));

const models = read('src/models.js');
check('roles() builds the bracket through fileLabel, nowhere else', (models.match(/fileLabel\(m\)/g) || []).length >= 2 && !/\$\{m\.name\} \(Bob's own engine\)/.test(models));
check('the words live in one place: MADE_BY_BOB and DOWNLOADED_BY_BOB', models.includes("MADE_BY_BOB = \"Bob's own brain\"") && models.includes("DOWNLOADED_BY_BOB = 'downloaded by Bob'"));
check('Now running says "downloaded copy", not "own copy", for a model run from Bob\'s file instead of Ollama\'s', /\(Bob's downloaded copy\)/.test(read('src/brain.js')) && !/\(Bob's own copy\)/.test(read('src/brain.js')));
check('the engine log says the same', /running from Bob's downloaded copy/.test(read('src/llamacpp.js')) && !/running from Bob's own copy \(/.test(read('src/llamacpp.js')));

// Nothing on the window or the phone side writes the tag by hand.
for (const f of ['public/equip.js', 'public/catalogue.js', 'public/cellar.js', 'public/app.js']) check(`${f} does not write "own brain" itself (the engine setting may still name Bob's own engine)`, !/own brain\)/.test(read(f)));
const phone = fs.existsSync(new URL('../android/www/phone.js', import.meta.url)) ? read('android/www/phone.js') : '';
check('the phone app does not either', !/own brain\)|own engine\)/.test(phone));

const faq = HELP.find((e) => e.id === 'faq-downloaded-by-bob');
check('Help has a FAQ entry for the tag', Boolean(faq) && faq.group === 'FAQ');
check('it says the tag is about where the file came from, not who made the model', /where the file came from/.test(faq?.html || '') && /\(downloaded by Bob\)/.test(faq?.html || ''));
check('it says "Bob\'s own brain" is kept for brains made for Bob and none exist yet', /Bob's own brain/.test(faq?.html || '') && /aren't any/.test(faq?.html || ''));
check('it is in Bob\'s voice (first person)', /\bI fetched\b/.test(faq?.html || ''));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
