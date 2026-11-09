// Bob's files live in the repository's app folder; README, CHANGELOG, CLAUDE.md, LICENSE and .github stay at the top.
// These checks use fake folders (no real computer is read), except the last ones, which read this repository's own
// files to see that the build scripts and workflows agree with the layout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoDir, sourceRoot } from '../src/config.js';
import { sourceDir } from '../src/update.js';
import { LIST_URL } from '../src/catalog-update.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const fake = (files) => { const set = new Set(files.map((f) => path.resolve(f))); return (p) => set.has(path.resolve(p)); };

// ---------- where a copy of the source is ----------
const R = path.resolve('/x/Agent/bob');
const repo = fake([`${R}/CHANGELOG.md`, `${R}/.github`, `${R}/app/package.json`]);
check('a copy of the repository: the app folder knows the repository above it', repoDir(`${R}/app`, repo) === R && sourceRoot(`${R}/app`, repo) === R);
check('an installed Bob (resources/app) is not a repository', repoDir(path.resolve('/x/Bob app/resources/app'), repo) === '' && sourceRoot(path.resolve('/x/Bob app/resources/app'), repo) === path.resolve('/x/Bob app/resources/app'));
check('a folder named app without CHANGELOG and .github above it is not one either', repoDir(path.resolve('/y/app'), fake(['/y/CHANGELOG.md'])) === '');
check('the old layout (package.json at the top) stays as it was', repoDir(R, fake([`${R}/package.json`])) === '' && sourceRoot(R, fake([])) === R);

// ---------- "Update Bob" finds the source from an old home.json ----------
check('home.json naming the repository (from before the move) finds its app folder', sourceDir({ BOB_SOURCE: R }, repo) === path.join(R, 'app'));
check('home.json naming the app folder uses it as it is', sourceDir({ BOB_SOURCE: `${R}/app` }, repo) === `${R}/app`);
check('an old layout with package.json at the top still works', sourceDir({ BOB_SOURCE: R }, fake([`${R}/package.json`])) === R);
check('a folder with no Bob in it is no source', sourceDir({ BOB_SOURCE: '/nowhere' }, repo) === '');

// ---------- the brain list moved with the rest ----------
check('the newest brain list is read from app/catalog.json on GitHub', LIST_URL === 'https://raw.githubusercontent.com/MouseWurX/Bob/main/app/catalog.json');

// ---------- this repository's own scripts agree with the layout ----------
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const top = path.dirname(app);
const read = (f) => fs.readFileSync(path.join(top, f), 'utf8').replace(/\r\n/g, '\n');
check('README, CHANGELOG, LICENSE and .github are at the top; package.json and catalog.json are in app', ['README.md', 'CHANGELOG.md', 'LICENSE', '.github'].every((f) => fs.existsSync(path.join(top, f))) && ['package.json', 'catalog.json', 'src', 'public', 'installer'].every((f) => fs.existsSync(path.join(app, f))) && !fs.existsSync(path.join(top, 'package.json')));
const win = read('app/installer/bob-build-window.ps1'), rel = read('app/installer/make-release.ps1'), mac = read('app/installer/make-release-mac.sh');
check('the install window and the Windows release take LICENSE and README.md from the top when app has none', /\$TopFiles = @\('LICENSE', 'README\.md'\)/.test(win) && /\$TopFiles -contains \$f\) \{ \$from = Join-Path \(Split-Path -Parent \$Source\) \$f \}/.test(win) && /\$TopFiles = @\('LICENSE', 'README\.md'\)/.test(rel) && /\$TopFiles -contains \$f\) \{ \$from = Join-Path \(Split-Path -Parent \$Source\) \$f \}/.test(rel));
check('the Mac release does the same', /LICENSE\|README\.md\) from="\$SOURCE\/\.\.\/\$f"/.test(mac));
check('the install window looks for Bob\'s home above the repository', /\(Split-Path -Leaf \$Source\) -eq 'app' -and \(Test-Path -LiteralPath \(Join-Path \$up 'CHANGELOG\.md'\)\)/.test(win));
const pkg = JSON.parse(read('app/package.json'));
check('electron-builder takes LICENSE and README.md from the folder above', pkg.build.files.some((f) => f?.from === '..' && f.to === '.' && JSON.stringify(f.filter) === '["LICENSE","README.md"]'));
for (const wf of ['build.yml', 'linux.yml', 'android.yml']) {
  const y = read(`.github/workflows/${wf}`);
  check(`${wf} runs its steps in app and uploads from app/dist`, /working-directory: app\n/.test(y) && !/^\s+dist\//m.test(y) && /app\/dist\/Bob-\*/.test(y));
}
check('a new version on main is noticed in app/package.json', /paths: \['app\/package\.json'\]/.test(read('.github/workflows/build.yml')));
check('the Android and Brain Engine builds watch their folders in app', /'app\/android\/\*\*'/.test(read('.github/workflows/android.yml')) && /'app\/engine\/\*\*'/.test(read('.github/workflows/brain-engine.yml')) && /require\('\.\/app\/package\.json'\)/.test(read('.github/workflows/brain-engine.yml')));
check('git ignores the old top-level leftovers and the new ones in app', ['config.json', 'node_modules/', 'dist/', 'engines/', 'app/model-lab/out/'].every((g) => read('.gitignore').split('\n').includes(g)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
