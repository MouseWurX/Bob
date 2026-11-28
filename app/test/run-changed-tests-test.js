// npm test -- --changed: which suites can see a changed file. A made-up repository, no git, no real files.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pickSuites, linkFiles, reach, RUN_ALL_FILES } from './changed-suites.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };

const repo = {
  'README.md': 'Supported brains',
  'CHANGELOG.md': 'changes',
  'app/package.json': '{}',
  'app/catalog.json': '{"brains":[]}',
  'app/src/brain.js': "import { tidy } from './words.js';\nexport const b = 1; const list = 'catalog.json';",
  'app/src/words.js': "export const tidy = (s) => s; // shown on 'README.md' too",
  'app/src/mail.js': "import { b } from './brain.js';\nexport const m = b;",
  'app/src/worker.js': "import './deep.js';",
  'app/src/deep.js': 'export {};',
  'app/src/lonely.js': 'export const alone = true;',
  'app/docs/help/mail.md': 'Help for mail',
  'app/test/run-brain-test.js': "import { b } from '../src/brain.js';",
  'app/test/run-mail-test.js': "import { m } from '../src/mail.js';",
  'app/test/run-words-text-test.js': "const t = read('src/words.js'); // checks the text only",
  'app/test/run-spawn-test.js': "spawnSync(process.execPath, ['src/worker.js']);",
  'app/test/run-help-test.js': "for (const f of fs.readdirSync(new URL('../docs/', import.meta.url))) check(f);",
  'app/test/run-readme-test.js': "const r = read('../README.md');",
  'app/android/tools/copy-screen.mjs': "export const COPIED = ['screen.js'];",
  'app/public/phone/screen.js': 'show();',
  'app/test/run-copy-test.js': "const { COPIED } = await import(pathToFileURL(path.join(root, 'android/tools/copy-screen.mjs'))); spawnSync('x');",
  'app/test/fake-thing.js': "export const fake = 1;",
  'app/test/run-fake-user-test.js': "import { fake } from './fake-thing.js';",
};
const files = Object.keys(repo);
const read = (f) => repo[f] ?? '';
const suites = files.filter((f) => /^app\/test\/run-/.test(f)).map((f) => f.slice(4));
const pick = (...changed) => pickSuites({ suites, files, read, changed });
const names = (r) => (r.all ? 'ALL' : r.picked.map((s) => s.replace(/^test\/run-|-test\.js$/g, '')).join(','));

check('a change to a file only one suite imports runs that suite and the suites importing it', names(pick('app/src/mail.js')) === 'mail', names(pick('app/src/mail.js')));
check('a change follows imports: brain.js is imported by mail.js too', names(pick('app/src/brain.js')) === 'brain,mail', names(pick('app/src/brain.js')));
check('two levels down: words.js reaches brain, mail and the test that reads its text', names(pick('app/src/words.js')) === 'brain,mail,words-text', names(pick('app/src/words.js')));
check('a data file named in code counts (catalog.json)', names(pick('app/catalog.json')) === 'brain,mail', names(pick('app/catalog.json')));
check('a file a test starts is followed with its imports', names(pick('app/src/deep.js')) === 'spawn', names(pick('app/src/deep.js')));
check('a test that only reads code as text does not pick up what that code imports further', !names(pick('app/src/brain.js')).includes('words-text'));
check('a test that lists a folder sees every file in it', names(pick('app/docs/help/mail.md')) === 'help', names(pick('app/docs/help/mail.md')));
check('a top-of-repository file counts only for a test that names it (code just checks README is there)', names(pick('README.md')) === 'readme', names(pick('README.md')));
check('CHANGELOG.md, written before every push, runs no suite unless one names it', names(pick('CHANGELOG.md')) === '');
check('a build tool that names code it copies counts that code (the phone screen copy)', names(pick('app/public/phone/screen.js')) === 'copy', names(pick('app/public/phone/screen.js')));
check('a helper in test/ runs the suites that import it', names(pick('app/test/fake-thing.js')) === 'fake-user');
check('a changed suite runs itself', names(pick('app/test/run-brain-test.js')) === 'brain');
const unseen = pick('app/src/lonely.js');
check('a file no suite sees runs nothing, and is named so nobody thinks it was tested', unseen.picked.length === 0 && unseen.unseen.join() === 'app/src/lonely.js');
check('a deleted file still runs the suites that named it', names(pickSuites({ suites, files: files.filter((f) => f !== 'app/src/worker.js'), read, changed: ['app/src/worker.js'] })) === 'spawn');
for (const f of RUN_ALL_FILES) check(`a change to ${f} runs every suite`, pick(f).all === true);
check('without git (changed unknown) every suite runs', pickSuites({ suites, files, read, changed: null }).all === true);
check('nothing changed: nothing to run', pick().picked.length === 0);
check('suites keep package.json order', pick('app/src/brain.js', 'app/test/run-fake-user-test.js').picked.join() === 'test/run-brain-test.js,test/run-mail-test.js,test/run-fake-user-test.js');
const links = linkFiles(files, read);
check('linking finds imports, names and folder listings', links.get('app/src/mail.js').imports.has('app/src/brain.js') && links.get('app/src/brain.js').named.has('app/catalog.json') && links.get('app/test/run-help-test.js').scanned.has('app/docs/help/mail.md'));
check('reach starts with the suite itself', reach(links, 'app/test/run-brain-test.js').has('app/test/run-brain-test.js'));

// npm test wiring: the runner offers --changed and --jobs, and the full run stays the default.
const runAll = fs.readFileSync(fileURLToPath(new URL('./run-all.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
check('npm test runs every suite unless --changed is given', /let suites = allSuites;\nif \(flag\('--changed'\)\)/.test(runAll));
check('--jobs 1 (or BOB_TEST_JOBS=1) runs one at a time', /value\('--jobs'\) \|\| process\.env\.BOB_TEST_JOBS/.test(runAll));
check('a suite that fails beside others is run again on its own before it counts', /running it again on its own/.test(runAll));
check('testSolo suites run alone after the others', /await pool\(alone, 1\)/.test(runAll));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
