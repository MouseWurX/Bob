// Brain Engine build names, N1bN2 (the owner, Nov 12 2026): "Brain Engine 5b12282" is build 5 on llama.cpp b12282.
// The name comes from the build that is installed (its marker), never typed in, and the running engine is checked
// against it. Older builds (v3, v4, and the llama-named b12032/b12282) keep their names. Nothing here reads the real
// computer: folders are temporary and the engine's answer is a fake string.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brainEngineBuild, brainEngineName, brainEngineTag, buildMatches } from '../public/engine-name.js';
import { brainEngineNumber, plainEngineNotes } from '../src/engine-extras.js';
import { engineLabel } from '../src/engine-extras-run.js';
import { buildWords } from '../src/engine-blocked.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// ---- the name itself ----
check('a new build reads as N1bN2', brainEngineName('brain-engine-5b12282') === 'Brain Engine 5b12282');
const b = brainEngineBuild('brain-engine-12b13001');
check('both numbers come out of it', b.n === 12 && b.llama === 'b13001' && b.short === '12b13001', JSON.stringify(b));
check('Brain Engine 4 stays as it shipped', brainEngineName('brain-engine-v4') === 'Brain Engine 4' && brainEngineBuild('brain-engine-v4').llama === '');
check('the first builds keep their llama.cpp names', brainEngineName('brain-engine-b12032') === 'Brain Engine on llama.cpp b12032' && brainEngineBuild('brain-engine-b12032').n === 0);
check('anything else is left as it is', brainEngineName('b12282') === 'b12282' && brainEngineBuild('') === null && brainEngineBuild('brain-engine-5b') === null);
check('the release name is made the same way', brainEngineTag(5, 'b12282') === 'brain-engine-5b12282' && brainEngineTag(5, '12282') === 'brain-engine-5b12282');
check('the build number reads from either name', brainEngineNumber('brain-engine-5b12282') === 5 && brainEngineNumber('brain-engine-v4') === 4 && brainEngineNumber('brain-engine-b12282') === 0);
check('Brain Engine 4 keeps its plain-words note', /sealed/.test(plainEngineNotes('brainengine', { to: 'brain-engine-v4' })));
check('the fall-back message names a new build plainly', buildWords('brain-engine-5b12282') === 'Brain Engine 5b12282' && buildWords('brain-engine-v4') === 'version 4' && /llama\.cpp b12282/.test(buildWords('brain-engine-b12282')));

// ---- the build workflow names releases and files the same way ----
{
  const wf = read(path.join(here, '..', '..', '.github', 'workflows', 'brain-engine.yml'));
  const lines = wf.match(/echo "BEV=\$\(node -p "require\('\.\/app\/package\.json'\)\.bob\.brainEngineVersion"\)b\$\{tag#b\}" >> "\$GITHUB_ENV"/g) || [];
  check('Windows and Linux both name the build <version>b<llama.cpp build>', lines.length === 2);
  check('no build is named vN any more', !/BEV=v\$/.test(wf));
  // What the shell makes, for the version and tag in package.json, matches brainEngineTag.
  const pkg = JSON.parse(read(path.join(here, '..', 'package.json')));
  const bev = `${pkg.bob.brainEngineVersion}b${pkg.bob.bundledLlamaTag.replace(/^b/, '')}`;
  check('the workflow\'s name and the app\'s agree', `brain-engine-${bev}` === brainEngineTag(pkg.bob.brainEngineVersion, pkg.bob.bundledLlamaTag));
  check('the pinned build uses the new name (N then b and the llama.cpp build, from Brain Engine 5 on)', /^brain-engine-\d+b\d+$/.test(pkg.bob.brainEngine.tag) && pkg.bob.brainEngine.tag.endsWith(`b${pkg.bob.bundledLlamaTag.replace(/^b/, '')}`));
  const pub = read(path.join(here, '..', 'engine', 'publish.sh'));
  check('the release title says the name and both parts', /--title "Brain Engine \$\{ver#v\} \(Brain Engine \$\{ver%%b\*\} on llama\.cpp \$tag/.test(pub));
  const cel = publicText('cellar.js');
  check('Settings, Engines names a new build from the installed one\'s release name', /import \{ brainEngineName \} from '\.\/engine-name\.js'/.test(cel) && /const verName = \(e, v\) => \(e\.id !== 'brainengine' \? v : newName\(v\)/.test(cel) && /const prevName = \(e, v\) => newName\(v\)/.test(cel));
}

// ---- the label is read from the build that is installed ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-engine-name-'));
const beDir = path.join(tmp, 'brain-engine');
fs.mkdirSync(beDir, { recursive: true });
const exe = path.join(beDir, 'llama-server');
fs.writeFileSync(exe, '');
const mark = (version) => fs.writeFileSync(path.join(beDir, 'bob-brainengine.json'), JSON.stringify({ id: 'brainengine', version, base: 'b12282' }));
const cfg = { agentDir: tmp, dataDir: tmp, engine: 'llamacpp', llamacpp: { exe } };
mark('brain-engine-5b12282');
check('the speed history and logbook name the installed build', engineLabel(cfg) === 'Brain Engine 5b12282', engineLabel(cfg));
mark('brain-engine-6b12400');
check('...and follow it when the build changes', engineLabel(cfg) === 'Brain Engine 6b12400', engineLabel(cfg));
mark('brain-engine-v4');
check('Brain Engine 4\'s label is unchanged, so its speed history has no false engine change', engineLabel(cfg) === 'Brain Engine brain-engine-v4', engineLabel(cfg));

// ---- the label is the right build: the running engine is asked ----
check('the running engine\'s build matches the name', buildMatches('brain-engine-5b12282', 'b12282-1a2b3c4') === true && buildMatches('brain-engine-5b12282', '12282') === true);
check('a different build is caught', buildMatches('brain-engine-5b12282', 'b12400-ffff') === false);
check('nothing to compare with an old name or no answer', buildMatches('brain-engine-v4', 'b12282-x') === null && buildMatches('brain-engine-5b12282', '') === null && buildMatches('brain-engine-5b12282', undefined) === null);
{
  const e = new LlamaCpp(cfg); clearInterval(e.idleTimer);
  const said = []; e.log = (k, t) => said.push(t);
  mark('brain-engine-5b12282');
  check('a load on the right build says nothing', e.checkBuild('b12282-1a2b3c4') === true && said.length === 0);
  check('a load on the wrong files says so once, by name', e.checkBuild('b12400-ffff') === false && said.length === 1 && /Brain Engine 5b12282 is named for llama\.cpp b12282, but the engine running says it is b12400/.test(said[0]), said[0]);
  e.checkBuild('b12400-ffff');
  check('...only once for that build', said.length === 1);
  mark('brain-engine-v4');
  check('Brain Engine 4 is left alone', e.checkBuild('b12400-ffff') === null && said.length === 1);
  const plain = new LlamaCpp({ ...cfg, llamacpp: { exe: path.join(tmp, 'llama.cpp', 'llama-server') } }); clearInterval(plain.idleTimer);
  check('plain llama.cpp has no Brain Engine name to check', plain.checkBuild('b12282-x') === null);
  const src = read(path.join(here, '..', 'src', 'llamacpp.js'));
  check('the check runs with the /props read when a brain is first asked', /this\.checkBuild\?\.\(props\?\.build_info\)/.test(src));
}

// ---- Help ----
{
  const help = read(path.join(here, '..', 'public', 'help-content.js'));
  check('an FAQ explains the name', /id: 'faq-brain-engine-name'/.test(help) && /5b12282/.test(help));
  check('the glossary has it', /<dt>Brain Engine build name \(N1bN2\)<\/dt>/.test(help));
  const readme = read(path.join(here, '..', 'engine', 'README.md'));
  check('the engine README says how builds are named', /\*\*N1bN2\*\*/.test(readme) && /brain-engine-5b12282-win-x64\.zip/.test(readme));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
