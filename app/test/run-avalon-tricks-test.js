// Nov 28: Turbo: smart guess length (Lamplight 0162, after Avalon): MTP's guess length chosen word by word. The owner:
// "a Turbo feature". On with Turbo unless switched off, never outside Turbo, only for MTP; Help, glossary and FAQ.
// The other two Avalon tricks (0160, 0161) were tested on a 4090, gave nothing and were taken out. Nothing here reads
// the real computer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { turboSmartGuess, smartGuessEnv, SMART_GUESS_ENV } from '../src/engine-extras.js';
import { mergeSettings } from '../src/config.js';
import { TUNING_FIELDS } from '../src/engine-tuning.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, why = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && why ? ` (${why})` : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const MTP = ['--spec-type', 'draft-mtp', '--spec-draft-n-max', '8'];

// ---------- Turbo only ----------
check('off in a fresh Bob (Turbo is off)', !turboSmartGuess({}) && !turboSmartGuess(mergeSettings({}, {})));
check('on with Turbo unless switched off', turboSmartGuess({ turbo: true }) && !turboSmartGuess({ turbo: true, turboSmartGuess: false }) && !turboSmartGuess({ turboSmartGuess: true }));
check('only true or false is kept when saved', mergeSettings({}, { turboSmartGuess: 'yes' }).turboSmartGuess === undefined && mergeSettings({}, { turboSmartGuess: false }).turboSmartGuess === false);
check('the engine key with Turbo and MTP', JSON.stringify(smartGuessEnv({ turbo: true }, { args: MTP })) === JSON.stringify(SMART_GUESS_ENV) && SMART_GUESS_ENV.LLAMA_MTP_ADAPT === '1');
check('nothing without Turbo, switched off, or without MTP', !Object.keys(smartGuessEnv({}, { args: MTP })).length && !Object.keys(smartGuessEnv({ turbo: true, turboSmartGuess: false }, { args: MTP })).length && !Object.keys(smartGuessEnv({ turbo: true }, { args: ['--spec-type', 'ngram-mod'] })).length);
check('nothing when MTP guesses only one word', !Object.keys(smartGuessEnv({ turbo: true }, { args: ['--spec-type', 'draft-mtp', '--spec-draft-n-max', '1'] })).length);
{ const srcDir = path.join(app, 'src');
  const users = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js') && f !== 'engine-extras.js' && /[^.]LLAMA_MTP_ADAPT/.test(read(`src/${f}`).replace(/\/\/.*$/gm, '')));
  check('only the Turbo switch sets the key (no Engine tuning box, no default)', users.length === 0 && !TUNING_FIELDS.some((f) => f.env === 'LLAMA_MTP_ADAPT'), users.join(', ')); }
{ const src = read('src/llamacpp.js');
  check('the engine start adds it', /smartGuessEnv\(this\.cfg, \{ args \}\)/.test(src));
  check('Engine tuning keys typed by hand come after, so they win', src.indexOf('smartGuessEnv(this.cfg') < src.indexOf('env = { ...env, ...this.tuneEnv }')); }
check('Settings has the switch', /sswitch\('turboSmartGuess', settings\.turboSmartGuess !== false/.test(read('public/cellar-engines.js')) && /dataset\.set === 'turboSmartGuess'/.test(read('public/cellar.js')));
check('the settings page sees it', /turboSmartGuess: cfg\.turboSmartGuess !== false/.test(read('src/server.js')));

// ---------- The engine patch and its notes ----------
const p162 = read('engine/patches/0162-mtp-adapt.patch');
check('the engine chooses the guess length only with LLAMA_MTP_ADAPT=1', /getenv\("LLAMA_MTP_ADAPT"\); v != nullptr && strcmp\(v, "1"\) == 0/.test(p162));
check('the first guess can be dropped too (v2)', /the first one too/.test(p162));
const readme = read('engine/README.md');
check('the engine README lists 0162, and 0160 and 0161 are gone', readme.includes('0162-mtp-adapt.patch') && !/0160-|0161-/.test(readme) && !fs.existsSync(path.join(app, 'engine', 'patches', '0160-ckpt-equal-cut.patch')) && !fs.existsSync(path.join(app, 'engine', 'patches', '0161-cuda-graphs-keep.patch')));
check('the engine map has it', /### 0162-mtp-adapt/.test(read('engine/ENGINE-MAP.md')));
check('its test is there', fs.existsSync(path.join(app, 'engine', 'tests', 'mtp-adapt.py')));
check('Avalon is credited', /Avalon \(MIT/.test(readme));

// ---------- Help, glossary, FAQ ----------
const h = Object.fromEntries(HELP.map((e) => [e.id, e]));
check('Settings help has the row', /Turbo: smart guess length/.test(h['engine-extras']?.html));
check('an FAQ, honest about the words and the test', /Avalon/.test(h['faq-smart-guess']?.html) && /words can change/.test(h['faq-smart-guess']?.html) && /unproven in our lab, as we have yet to test/.test(h['faq-smart-guess']?.html));
check('a glossary entry', /<dt>Smart guess length<\/dt>/.test(h.glossary?.html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
