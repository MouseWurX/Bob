// Turbo: keep more guesses (Brain Engine 0120, src/engine-extras.js turboKeepGuesses; off unless switched on, and only
// with Turbo): the switch, the start arguments and engine key, where they're set, and the Settings, Help, FAQ and
// glossary. Nothing reads the computer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeSettings } from '../src/config.js';
import { turboKeepGuesses, keepGuessesArgs, keepGuessesEnv, KEEP_GUESSES_FROM_BE, KEEP_GUESSES_ENV } from '../src/engine-extras.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const ON = { turbo: true, turboKeepGuesses: true };
const MTP = ['--spec-type', 'draft-mtp', '--spec-draft-n-max', '3'];
const PROB = ['--spec-draft-sampling', 'probabilistic'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('off in a fresh Bob', !turboKeepGuesses({}) && !turboKeepGuesses(mergeSettings({}, {})));
check('only with Turbo on as well', !turboKeepGuesses({ turboKeepGuesses: true }) && turboKeepGuesses(ON) && !turboKeepGuesses({ turbo: true }));
check('only true is kept when saved', mergeSettings({}, { turboKeepGuesses: 'yes' }).turboKeepGuesses === undefined && mergeSettings({}, { turboKeepGuesses: true }).turboKeepGuesses === true);
check('the first engine with it is the one after Brain Engine 45', KEEP_GUESSES_FROM_BE === 46);
check('MTP on Brain Engine 46: the drafter samples', same(keepGuessesArgs(ON, { args: MTP, be: 46 }), PROB));
check('a draft brain and DSpark too', same(keepGuessesArgs(ON, { args: ['-md', 'x.gguf'], be: 47 }), PROB) && same(keepGuessesArgs(ON, { args: ['--spec-type', 'draft-dspark', '-md', 'd.gguf'], be: 46 }), PROB));
check('nothing on an older engine, or not Brain Engine', !keepGuessesArgs(ON, { args: MTP, be: 45 }).length && !keepGuessesArgs(ON, { args: MTP, be: 0 }).length);
check('nothing where no model drafts (copy guessing alone, or no guesser)', !keepGuessesArgs(ON, { args: ['--spec-type', 'ngram-mod'], be: 46 }).length && !keepGuessesArgs(ON, { args: [], be: 46 }).length);
check('copy guessing next to MTP still counts as a model drafting', same(keepGuessesArgs(ON, { args: ['--spec-type', 'draft-mtp', '--spec-type', 'ngram-mod'], be: 46 }), PROB));
check('a drafter sampling set by hand wins', !keepGuessesArgs(ON, { args: [...MTP, '--spec-draft-sampling', 'greedy'], be: 46 }).length);
check('nothing with the switch off or Turbo off', !keepGuessesArgs({ turboKeepGuesses: true }, { args: MTP, be: 46 }).length && !keepGuessesArgs({ turbo: true }, { args: MTP, be: 46 }).length);
check('the engine key goes only with a sampling drafter', same(keepGuessesEnv(ON, { args: [...MTP, ...PROB], be: 46 }), KEEP_GUESSES_ENV) && KEEP_GUESSES_ENV.LLAMA_SPEC_MB === '1' && !Object.keys(keepGuessesEnv(ON, { args: MTP, be: 46 })).length && !Object.keys(keepGuessesEnv(ON, { args: [...MTP, '--spec-draft-sampling', 'greedy'], be: 46 })).length);
check('no key on an older engine or with the switch off', !Object.keys(keepGuessesEnv(ON, { args: [...MTP, ...PROB], be: 45 })).length && !Object.keys(keepGuessesEnv({ turbo: true }, { args: [...MTP, ...PROB], be: 46 })).length);
{ const src = read('src/llamacpp.js');
  check('added to both guesser paths (a brain\'s own Lab pick, and everyday MTP or a draft brain)', (src.match(/keepGuessesArgs\(this\.cfg, \{ args, be: this\.beNo\(\) \}\)/g) || []).length === 2);
  check('never for the helper beside', /this\.role !== BESIDE\) args\.push\(\.\.\.keepGuessesArgs/.test(src));
  check('Engine tuning keys typed by hand come after, so they win', src.indexOf('keepGuessesEnv(this.cfg') < src.indexOf('env = { ...env, ...this.tuneEnv }')); }
check('the engine has the patch and its test', fs.existsSync(path.join(here, '..', 'engine', 'patches', '0120-spec-mode-biased-accept.patch')) && fs.existsSync(path.join(here, '..', 'engine', 'tests', 'spec-mb.py')));
check('the patch credits llamAmpere and its licence', /llamAmpere \(github\.com\/JakeATX\/llamAmpere, MIT/.test(read('engine/patches/0120-spec-mode-biased-accept.patch')));
check('Settings has the switch under Turbo', /sswitch\('turboKeepGuesses'/.test(read('public/cellar-engines.js')) && /dataset\.set === 'turboKeepGuesses'/.test(read('public/cellar.js')) && /turboKeepGuesses: cfg\.turboKeepGuesses === true/.test(read('src/server.js')));
check('Settings Help names it, off', /Turbo: keep more guesses', 'Off'/.test(read('public/help-content.js')) && /Turbo: keep more guesses/.test(HELP.find((h) => h.id === 'engine-extras')?.html || ''));
check('the FAQ answers it and says where it works', /Android app/.test(HELP.find((h) => h.id === 'faq-keep-guesses' && h.group === 'FAQ')?.html || ''));
check('the glossary explains it', /<dt>Keep more guesses<\/dt>/.test(HELP.find((h) => h.id === 'glossary')?.html || ''));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
