// Lamplight build names, N1bN2 (the owner, Nov 12 2026): "Lamplight 5b12282" is build 5 on llama.cpp b12282.
// The name comes from the build that is installed (its marker), never typed in, and the running engine is checked
// against it. Older builds (v3, v4, and the llama-named b12032/b12282) keep their names. Nothing here reads the real
// computer: folders are temporary and the engine's answer is a fake string.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lamplightBuild, lamplightName, lamplightTag, buildMatches } from '../public/engine-name.js';
import { lamplightNumber, plainEngineNotes } from '../src/engine-extras.js';
import { engineLabel } from '../src/engine-extras-run.js';
import { buildWords } from '../src/engine-blocked.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// ---- the name itself ----
check('a new build reads as N1bN2', lamplightName('brain-engine-5b12282') === 'Lamplight 5b12282');
const b = lamplightBuild('brain-engine-12b13001');
check('both numbers come out of it', b.n === 12 && b.llama === 'b13001' && b.short === '12b13001', JSON.stringify(b));
check('Lamplight 4 stays as it shipped', lamplightName('brain-engine-v4') === 'Lamplight 4' && lamplightBuild('brain-engine-v4').llama === '');
check('the first builds keep their llama.cpp names', lamplightName('brain-engine-b12032') === 'Lamplight on llama.cpp b12032' && lamplightBuild('brain-engine-b12032').n === 0);
check('anything else is left as it is', lamplightName('b12282') === 'b12282' && lamplightBuild('') === null && lamplightBuild('brain-engine-5b') === null);
check('the release name is made the same way', lamplightTag(47, 'b12359') === 'lamplight-47b12359' && lamplightTag(47, '12359') === 'lamplight-47b12359');
check('a new Lamplight release reads the same as an old Brain Engine one', lamplightName('lamplight-47b12359') === 'Lamplight 47b12359' && lamplightBuild('lamplight-47b12359').n === 47 && lamplightBuild('brain-engine-46b12359').n === 46 && lamplightBuild('lamplight-46b12359').ll === 'LL46b12359');
check('the build number reads from either name', lamplightNumber('brain-engine-5b12282') === 5 && lamplightNumber('brain-engine-v4') === 4 && lamplightNumber('brain-engine-b12282') === 0);
check('Lamplight 4 keeps its plain-words note', /sealed/.test(plainEngineNotes('lamplight', { to: 'brain-engine-v4' })));
check('the fall-back message names a new build plainly', buildWords('brain-engine-5b12282') === 'Lamplight 5b12282' && buildWords('brain-engine-v4') === 'version 4' && /llama\.cpp b12282/.test(buildWords('brain-engine-b12282')));

// ---- the build workflow names releases and files the same way ----
{
  const wf = read(path.join(here, '..', '..', '.github', 'workflows', 'brain-engine.yml'));
  const lines = wf.match(/echo "BEV=\$\(node -p "require\('\.\/app\/package\.json'\)\.bob\.lamplightVersion"\)b\$\{tag#b\}" >> "\$GITHUB_ENV"/g) || [];
  check('Windows and Linux both name the build <version>b<llama.cpp build>', lines.length === 2);
  check('no build is named vN any more', !/BEV=v\$/.test(wf));
  // What the shell makes, for the version and tag in package.json, matches lamplightTag.
  const pkg = JSON.parse(read(path.join(here, '..', 'package.json')));
  const bev = `${pkg.bob.lamplightVersion}b${pkg.bob.bundledLlamaTag.replace(/^b/, '')}`;
  check('the workflow\'s name and the app\'s agree', `lamplight-${bev}` === lamplightTag(pkg.bob.lamplightVersion, pkg.bob.bundledLlamaTag));
  check('the pinned build uses the new name (N then b and the llama.cpp build, from Lamplight 5 on)', /^(lamplight|brain-engine)-\d+b\d+$/.test(pkg.bob.lamplight.tag) && pkg.bob.lamplight.tag.endsWith(`b${pkg.bob.bundledLlamaTag.replace(/^b/, '')}`));
  const pub = read(path.join(here, '..', 'engine', 'publish.sh'));
  check('the release title says the name and both parts', /--title "Lamplight \$\{ver#v\} \(Lamplight \$\{ver%%b\*\} on llama\.cpp \$tag/.test(pub));
  const cel = publicText('cellar.js');
  check('Settings, Engines names a new build from the installed one\'s release name', /import \{ lamplightName \} from '\.\/engine-name\.js'/.test(cel) && /const verName = \(e, v\) => \(e\.id !== 'lamplight' \? v : newName\(v\)/.test(cel) && /const prevName = \(e, v\) => newName\(v\)/.test(cel));
}

// ---- the label is read from the build that is installed ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-engine-name-'));
const beDir = path.join(tmp, 'brain-engine');
fs.mkdirSync(beDir, { recursive: true });
const exe = path.join(beDir, 'llama-server');
fs.writeFileSync(exe, '');
const mark = (version) => fs.writeFileSync(path.join(beDir, 'bob-brainengine.json'), JSON.stringify({ id: 'lamplight', version, base: 'b12282' }));
const cfg = { agentDir: tmp, dataDir: tmp, engine: 'llamacpp', llamacpp: { exe } };
mark('brain-engine-5b12282');
check('the speed history and logbook name the installed build', engineLabel(cfg) === 'Lamplight 5b12282', engineLabel(cfg));
mark('brain-engine-6b12400');
check('...and follow it when the build changes', engineLabel(cfg) === 'Lamplight 6b12400', engineLabel(cfg));
mark('brain-engine-v4');
check('Lamplight 4\'s label is unchanged, so its speed history has no false engine change', engineLabel(cfg) === 'Lamplight brain-engine-v4', engineLabel(cfg));

// ---- the label is the right build: the running engine is asked ----
check('the running engine\'s build matches the name', buildMatches('brain-engine-5b12282', 'b12282-1a2b3c4') === true && buildMatches('brain-engine-5b12282', '12282') === true);
check('a different build is caught', buildMatches('brain-engine-5b12282', 'b12400-ffff') === false);
check('nothing to compare with an old name or no answer', buildMatches('brain-engine-v4', 'b12282-x') === null && buildMatches('brain-engine-5b12282', '') === null && buildMatches('brain-engine-5b12282', undefined) === null);
{
  const e = new LlamaCpp(cfg); clearInterval(e.idleTimer);
  const said = []; e.log = (k, t) => said.push(t);
  mark('brain-engine-5b12282');
  check('a load on the right build says nothing', e.checkBuild('b12282-1a2b3c4') === true && said.length === 0);
  check('a load on the wrong files says so once, by name', e.checkBuild('b12400-ffff') === false && said.length === 1 && /Lamplight 5b12282 is named for llama\.cpp b12282, but the engine running says it is b12400/.test(said[0]), said[0]);
  e.checkBuild('b12400-ffff');
  check('...only once for that build', said.length === 1);
  mark('brain-engine-v4');
  check('Lamplight 4 is left alone', e.checkBuild('b12400-ffff') === null && said.length === 1);
  const plain = new LlamaCpp({ ...cfg, llamacpp: { exe: path.join(tmp, 'llama.cpp', 'llama-server') } }); clearInterval(plain.idleTimer);
  check('plain llama.cpp has no Lamplight name to check', plain.checkBuild('b12282-x') === null);
  const src = read(path.join(here, '..', 'src', 'llamacpp.js'));
  check('the check runs with the /props read when a brain is first asked', /this\.checkBuild\?\.\(props\?\.build_info\)/.test(src));
}

// ---- Help ----
{
  const help = read(path.join(here, '..', 'public', 'help-content.js'));
  check('an FAQ explains the name', /id: 'faq-brain-engine-name'/.test(help) && /5b12282/.test(help));
  check('the glossary has it', /<dt>Lamplight build name \(N1bN2\)<\/dt>/.test(help));
  const readme = read(path.join(here, '..', 'engine', 'README.md'));
  check('the engine README says how builds are named', /\*\*N1bN2\*\*/.test(readme) && /lamplight-47b12359-win-x64\.zip/.test(readme) && /brain-engine-46b12359/.test(readme));
}


// ---- Nov 26 2026: Brain Engine is called Lamplight now; what was saved under the old names still works ----
{
  const { oldEngineNames } = await import('../src/config.js');
  const { engineId, engineBlocked, ENGINES, BLOCKED_FILE } = await import('../src/engines.js');
  const old = { llamacpp: { brainEngine: false, ctx: 1 }, labEngine: 'brainengine', stt: { provider: 'brainengine', model: 'gemma4-e4b' } };
  check('old settings move to the new names once', oldEngineNames(old) === true && old.llamacpp.lamplight === false && !('brainEngine' in old.llamacpp) && old.llamacpp.ctx === 1 && old.labEngine === 'lamplight' && old.stt.provider === 'lamplight' && old.stt.model === 'gemma4-e4b', JSON.stringify(old));
  check('settings already on the new names are left as they are', oldEngineNames(old) === false && oldEngineNames({ llamacpp: { lamplight: true }, labEngine: 'llamacpp' }) === false && oldEngineNames(null) === false);
  const both = { llamacpp: { brainEngine: false, lamplight: true } };
  check('a new name already set wins over the old one', oldEngineNames(both) && both.llamacpp.lamplight === true && !('brainEngine' in both.llamacpp));
  check('the old engine id still means Lamplight', engineId('brainengine') === 'lamplight' && engineId('lamplight') === 'lamplight' && engineId('llamacpp') === 'llamacpp');
  const ll = ENGINES.find((e) => e.id === 'lamplight');
  check('the installed folder and marker keep their old names, so nothing is moved or downloaded again', ll.dir === 'brain-engine' && ll.mark === 'brainengine');
  const win = ll.other[0], lin = ll.linux.other[0];
  check('downloads find files under both names', win.test('lamplight-47b12359-win-x64.zip') && win.test('brain-engine-46b12359-win-x64.zip') && lin.test('lamplight-47b12359-linux-x64.tar.gz') && lin.test('brain-engine-46b12359-linux-x64.tar.gz') && !win.test('llama-b12359-bin-win-cpu-x64.zip'));
  const bt = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-engine-blocked-'));
  fs.writeFileSync(path.join(bt, BLOCKED_FILE), JSON.stringify({ engine: 'brainengine', version: 'brain-engine-46b12359' }));
  const rec = engineBlocked({ agentDir: bt }, 'lamplight');
  check('a blocked build written under the old id is still known', rec?.engine === 'lamplight' && rec.version === 'brain-engine-46b12359', JSON.stringify(rec));
  fs.rmSync(bt, { recursive: true, force: true });
  const helpText = publicText('help-content.js');
  check('Help says the engine was called Brain Engine, and tells it apart from the look', /It was called <strong>Brain Engine<\/strong> until 26 Nov 2026/.test(helpText) && /<dt>Lamplight \(my engine\)<\/dt>/.test(helpText) && /<dt>Lamplight \(look\)<\/dt>/.test(helpText));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
