// Turbo: stand-ins (Lamplight 0043, src/engine-extras.js turboStandins; off unless switched on, and only with Turbo):
// the switch, the engine keys, where they're set, and the Settings, Help, FAQ and glossary. Nothing reads the computer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeSettings } from '../src/config.js';
import { turboStandins, STANDIN_ENV, turboDriveStandins, DRIVE_STANDIN_ENV } from '../src/engine-extras.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

check('off in a fresh Bob', !turboStandins({}) && !turboStandins(mergeSettings({}, {})));
check('only with Turbo on as well', !turboStandins({ turboStandins: true }) && turboStandins({ turbo: true, turboStandins: true }) && !turboStandins({ turbo: true }));
check('only true is kept when saved', mergeSettings({}, { turboStandins: 'yes' }).turboStandins === undefined && mergeSettings({}, { turboStandins: true }).turboStandins === true);
check('the engine keys: rank stand-ins, at most 2 a layer', STANDIN_ENV.LLAMA_MOE_STANDIN === 'rank' && STANDIN_ENV.LLAMA_MOE_STANDIN_MAX === '2');
{ const src = read('src/llamacpp.js');
  check('set only with the hot-experts cache, never for the helper beside', /args\.includes\('--moe-cache-mib'\) && turboStandins\(this\.cfg\) && this\.role !== BESIDE/.test(src));
  check('Engine tuning keys typed by hand come after, so they win', src.indexOf('...STANDIN_ENV') < src.indexOf('env = { ...env, ...this.tuneEnv }')); }
check('the engine has the patch', fs.existsSync(path.join(here, '..', 'engine', 'patches', '0043-moe-standins.patch')));
check('never wait on the drive: off in a fresh Bob, only with Turbo, and stand-ins win', !turboDriveStandins({}) && !turboDriveStandins({ turboDriveStandins: true }) && turboDriveStandins({ turbo: true, turboDriveStandins: true }) && !turboDriveStandins({ turbo: true, turboDriveStandins: true, turboStandins: true }) && DRIVE_STANDIN_ENV.LLAMA_MOE_STANDIN === 'drive');
check('never wait on the drive: only true is kept, and the start line sets it with the cache only', mergeSettings({}, { turboDriveStandins: 1 }).turboDriveStandins === undefined && /args\.includes\('--moe-cache-mib'\) && turboDriveStandins\(this\.cfg\) && this\.role !== BESIDE/.test(read('src/llamacpp.js')) && /sswitch\('turboDriveStandins'/.test(read('public/cellar-engines.js')) && /dataset\.set === 'turboDriveStandins'/.test(read('public/cellar.js')));
check('Settings has the switch under Turbo', /sswitch\('turboStandins'/.test(read('public/cellar-engines.js')) && /dataset\.set === 'turboStandins'/.test(read('public/cellar.js')));
check('Settings Help names it, off', /Turbo: stand-ins/.test(HELP.find((h) => h.id === 'engine-extras')?.html || ''));
check('the FAQ answers it and says where it works', /Android app/.test(HELP.find((h) => h.id === 'faq-standins' && h.group === 'FAQ')?.html || ''));
check('the glossary explains it', /<dt>Stand-in experts<\/dt>/.test(HELP.find((h) => h.id === 'glossary')?.html || ''));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
