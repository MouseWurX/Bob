// 1.5.131: the bracket after a model Bob downloaded himself never says "Bob's own engine" (which read as "Bob's own
// brain" on every stock Qwen and Gemma). 1.5.137: and no longer "downloaded by Bob" either: no bracket at all. "Bob's own brain" is kept for catalogue entries marked
// madeByBob: true; 1.5.169 ships the first ones (28Bob Riker).
import fs from 'node:fs';
import { fileLabel, isMadeByBob, MADE_BY_BOB, YOUR_OWN_FILE } from '../src/models.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const catalog = JSON.parse(read('catalog.json'));

check('1.5.137: a stock model downloaded by Bob is just its name, no bracket', fileLabel({ id: 'qwen3-4b', name: 'Qwen3 4B' }) === 'Qwen3 4B');
check('the label never says "own engine" or "own brain" for a stock model', !/own engine|own brain/i.test(fileLabel({ name: 'Gemma 4 26B', ollama: 'gemma4:26b' })));
check('a name that sounds like one of Bob\'s is still a stock model (no fuzzy name match)', !isMadeByBob({ name: 'Bob Riker 28B' }) && !isMadeByBob({ name: 'Qwen3.6 35B-A3B', family: 'Qwen' }) && fileLabel({ name: 'Bob Riker 28B' }) === 'Bob Riker 28B');
check('1.5.137: a file in Bob\'s models folder gets no bracket', fileLabel({ name: 'Qwen3 4B' }, 'C:\\Bob home\\models\\bob\\Qwen3-4B-Q4_K_M.gguf') === 'Qwen3 4B' && fileLabel({ id: 'qwen3-4b', name: 'Qwen3 4B' }, 'C:\\Bob home\\models\\qwen3-4b\\Qwen3-4B.gguf') === 'Qwen3 4B');
check('1.5.133: a file you placed yourself (set by hand, or another app\'s folder) says "your own file"', fileLabel({ name: 'Qwen3 4B' }, 'D:\\LLMs\\Qwen3-4B-Q8_0.gguf') === `Qwen3 4B (${YOUR_OWN_FILE})` && fileLabel({ id: 'qwen3-4b', name: 'Qwen3 4B' }, '/home/me/lmstudio/models/qwen/Qwen3-4B.gguf') === `Qwen3 4B (${YOUR_OWN_FILE})`);
check('Help explains "your own file"', /<strong>\(your own file\)<\/strong>/.test(fs.readFileSync(new URL('../public/help-content.js', import.meta.url), 'utf8')));
check('only the explicit madeByBob: true marker gives "Bob\'s own brain"', fileLabel({ name: '28Bob Riker', madeByBob: true }) === `28Bob Riker (${MADE_BY_BOB})`);
check('a truthy-but-not-true marker does not count', !isMadeByBob({ name: 'x', madeByBob: 'yes' }) && !isMadeByBob({ name: 'x', madeByBob: 1 }));
// 1.5.169: Bob's own brains ship (28Bob Riker first). Only those, from Bob's own public Hugging Face pages, carry the marker.
check('only Bob\'s own brains (Bob family, from MouseWurX on Hugging Face) are marked as made by Bob', catalog.models.filter(isMadeByBob).every((m) => m.family === 'Bob' && m.files.every((f) => /^https:\/\/huggingface\.co\/MouseWurX\/\d+Bob-\w+\/resolve\/[0-9a-f]{40}\//.test(f.url))), catalog.models.filter(isMadeByBob).map((m) => m.id).join(','));
check('...and every Bob-family brain carries it', catalog.models.filter((m) => m.family === 'Bob').every(isMadeByBob));
check('no catalogue model carries a Bob name', catalog.models.every((m) => !/\bbob\b/i.test(m.name)), catalog.models.filter((m) => /\bbob\b/i.test(m.name)).map((m) => m.id).join(','));

const models = read('src/models.js');
check('roles() builds the bracket through fileLabel, nowhere else', (models.match(/fileLabel\(m, st\.located\.gguf\)/g) || []).length >= 2 && !/\$\{m\.name\} \(Bob's own engine\)/.test(models));
check('the words live in one place, and "downloaded by Bob" is gone', models.includes("MADE_BY_BOB = \"Bob's own brain\"") && !/downloaded by Bob'/.test(models));
check('1.5.137: Now running adds no "(Bob\'s downloaded copy)" or "(Bob\'s own copy)" bracket', !/\(Bob's downloaded copy\)/.test(read('src/brain.js')) && !/\(Bob's own copy\)/.test(read('src/brain.js')));
check('the engine log says the same', /running from Bob's downloaded copy/.test(read('src/llamacpp.js')) && !/running from Bob's own copy \(/.test(read('src/llamacpp.js')));

// Nothing on the window or the phone side writes the tag by hand.
for (const f of ['public/equip.js', 'public/catalogue.js', 'public/cellar.js', 'public/app.js']) check(`${f} does not write "own brain" itself (the engine setting may still name Bob's own engine)`, !/own brain\)/.test(read(f)));
const phone = fs.existsSync(new URL('../android/www/phone.js', import.meta.url)) ? read('android/www/phone.js') : '';
check('the phone app does not either', !/own brain\)|own engine\)/.test(phone));

const faq = HELP.find((e) => e.id === 'faq-downloaded-by-bob');
check('Help has a FAQ entry for the tag', Boolean(faq) && faq.group === 'FAQ');
check('it says the brackets are about where the file came from, and that Bob\'s own downloads have none', /where the file came from/.test(faq?.html || '') && /no brackets/.test(faq?.html || '') && !/<strong>\(downloaded by Bob\)<\/strong>/.test(faq?.html || ''));
check('it says "Bob\'s own brain" is kept for brains made for Bob and none exist yet', /Bob's own brain/.test(faq?.html || '') && /aren't any in the catalogue/.test(faq?.html || '') && /brain card/.test(faq?.html || ''));
check('it is in Bob\'s voice (first person)', /\bI fetched\b/.test(faq?.html || ''));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
