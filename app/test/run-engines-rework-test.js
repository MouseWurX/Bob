// 1.5.17x Engines rework (Settings > Engines): the ⚙ engine for brains, the Lab's own engine, updates told apart by
// the download's checksum (a rebuilt Brain Engine keeps its name), Update in place with the old build kept for Go
// back, and Remove. Fake folders and a fake GitHub only; nothing reads the real computer.
// Run: node test/run-engines-rework-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetPrint, isNewer, swapIn, goBackEngine, removeEngine, engineStatus, latestEngine, brainsEngineNow, brainsEnginePick, brainsEngineSettings, labEngineDirs, engineNameOf, engineChoices, ENGINES, TESTED_LLAMA } from '../src/engines.js';
import { Lab } from '../src/lab.js';

let failures = 0, passed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) passed++; else failures++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-engines-'));
const A = path.join(tmp, 'Agent');
const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
const put = (dir, files, mark) => { fs.mkdirSync(dir, { recursive: true }); for (const f of files) fs.writeFileSync(path.join(dir, f), 'x'); if (mark) fs.writeFileSync(path.join(dir, `bob-${mark.id}.json`), JSON.stringify(mark)); };

// Telling an update apart.
{
  const a1 = { id: 1, size: 10, updated_at: '2026-11-01T00:00:00Z', digest: 'sha256:aaa' }, a2 = { ...a1, id: 2, digest: 'sha256:bbb' };
  check(assetPrint(a1) === 'sha256:aaa' && assetPrint({ id: 3, size: 4, updated_at: 'T' }) === '3:4:T', 'a download\'s print is GitHub\'s sha256, else its id, size and upload time');
  const rel = { tag_name: 'brain-engine-b1' };
  check(!isNewer({ version: 'brain-engine-b1', print: assetPrint(a1) }, rel, a1), 'same name, same file: up to date');
  check(isNewer({ version: 'brain-engine-b1', print: assetPrint(a1) }, rel, a2), 'same name, rebuilt file: an update (the bug: it used to say Up to date)');
  check(isNewer({ version: 'brain-engine-b0', print: assetPrint(a1) }, rel, a1), 'a new name: an update');
  check(isNewer({ version: 'brain-engine-b1', at: '2026-10-01T00:00:00Z' }, rel, a1) && !isNewer({ version: 'brain-engine-b1', at: '2026-11-05T00:00:00Z' }, rel, a1), 'an older marker with no print: a file uploaded after the install counts as newer');
  check(isNewer(null, rel, a1), 'nothing installed: newer');
}

// Update in place keeps the old build; Go back swaps them; pressing it again undoes it; Remove takes both.
{
  const be = path.join(A, 'brain-engine');
  put(be, [exe('llama-server')], { id: 'brainengine', version: 'old' });
  const stage = be + '.new'; put(stage, [exe('llama-server')], { id: 'brainengine', version: 'new' });
  swapIn(be, stage);
  const ver = (d) => JSON.parse(fs.readFileSync(path.join(d, 'bob-brainengine.json'), 'utf8')).version;
  check(ver(be) === 'new' && ver(be + '.previous') === 'old' && !fs.existsSync(stage), 'Update: the new build takes the folder, the old one is kept beside it');
  const st = engineStatus({ agentDir: A }).find((e) => e.id === 'brainengine');
  check(st.installed && st.version === 'new' && st.previous === 'old' && st.canSwap && st.own, 'Engines shows the build here, the one kept for Go back, and Remove');
  check(!st.pinned, 'Brain Engine is not "pinned": it gets a Check for updates button (it used to have none)');
  check(st.group === 'thinking', 'Brain Engine is in the Thinking group');
  const r = goBackEngine({ agentDir: A }, 'brainengine');
  check(r.version === 'old' && r.previous === 'new' && ver(be) === 'old', 'Go back puts the old build back, with no download');
  goBackEngine({ agentDir: A }, 'brainengine');
  check(ver(be) === 'new', 'pressing Go back again undoes it');
  removeEngine({ agentDir: A }, 'brainengine');
  check(!fs.existsSync(be) && !fs.existsSync(be + '.previous'), 'Remove deletes Bob\'s copy and the kept build');
  let msg = ''; try { goBackEngine({ agentDir: A }, 'brainengine'); } catch (e) { msg = e.message; }
  check(/no earlier/.test(msg), 'Go back with nothing kept says so');
  msg = ''; try { removeEngine({ agentDir: A }, 'kokoro'); } catch (e) { msg = e.message; }
  check(/shares its folder/.test(msg), 'engines that share the uv folder can\'t be removed on their own');
  const groups = new Set(engineStatus({ agentDir: A }).map((e) => e.group));
  check(['thinking', 'senses', 'voices', 'helpers'].every((g) => groups.has(g)) && groups.size === 4, 'every engine sits in one of the four groups');
}

// Check for updates against a fake GitHub: a rebuilt Brain Engine (same tag, new file) shows as "rebuilt".
{
  const be = path.join(A, 'brain-engine'), tag = `brain-engine-${TESTED_LLAMA}`;
  const name = process.platform === 'win32' ? `brain-engine-${TESTED_LLAMA}-win-x64.zip` : `brain-engine-${TESTED_LLAMA}-linux-x64.tar.gz`;
  const asset = { id: 7, name, size: 5, updated_at: '2026-11-09T00:00:00Z', digest: 'sha256:new' };
  put(be, [exe('llama-server')], { id: 'brainengine', version: tag, print: 'sha256:old', at: '2026-11-01T00:00:00Z' });
  const fakeFetch = async (u) => ({ ok: true, json: async () => (u.includes(`/tags/${tag}`) ? { tag_name: tag, prerelease: true, assets: [asset] } : []) });
  if (process.platform === 'win32' || process.platform === 'linux') {
    const r = await latestEngine({ agentDir: A }, 'brainengine', false, fakeFetch);
    check(r.newer && r.rebuilt && r.latest === tag, 'a rebuilt Brain Engine shows as an update, marked rebuilt');
    fs.writeFileSync(path.join(be, 'bob-brainengine.json'), JSON.stringify({ version: tag, print: 'sha256:new' }));
    const r2 = await latestEngine({ agentDir: A }, 'brainengine', false, fakeFetch);
    check(!r2.newer, '...and up to date once it\'s the same file');
    // 1.5.177 (seen on the replicant matrix): a copy put there by hand has no marker; it isn't offered the same build.
    fs.rmSync(path.join(be, 'bob-brainengine.json'));
    const ex = path.join(be, exe('llama-server'));
    fs.utimesSync(ex, new Date('2026-11-09T12:00:00Z'), new Date('2026-11-09T12:00:00Z'));
    const r3 = await latestEngine({ agentDir: A }, 'brainengine', false, fakeFetch);
    check(!r3.newer && !r3.rebuilt, 'a Brain Engine copied in by hand (no marker) isn\'t offered the same build again');
    fs.utimesSync(ex, new Date('2026-11-08T00:00:00Z'), new Date('2026-11-08T00:00:00Z'));
    const r4 = await latestEngine({ agentDir: A }, 'brainengine', false, fakeFetch);
    check(r4.newer && !r4.rebuilt, '...but a file uploaded after it still shows as an update');
  } else check(true, '(no Brain Engine build on this computer: the Check isn\'t offered)');
}

// The engine for brains (the ⚙) and the Lab's engine.
{
  const cfgBe = { agentDir: A, engine: 'llamacpp', llamacpp: { exe: path.join(A, 'brain-engine', exe('llama-server')) } };
  const cfgLc = { agentDir: A, engine: 'llamacpp', llamacpp: { exe: path.join(A, 'llama.cpp', exe('llama-server')), brainEngine: false } };
  check(brainsEngineNow(cfgBe) === 'brainengine' && brainsEngineNow(cfgLc) === 'llamacpp' && brainsEngineNow({ agentDir: A, engine: 'ollama' }) === 'ollama', 'which engine runs the brains now, from the program in use');
  check(brainsEnginePick({ engine: 'llamacpp', llamacpp: {} }) === 'brainengine' && brainsEnginePick(cfgLc) === 'llamacpp' && brainsEnginePick({ engine: 'ollama' }) === 'ollama', 'what the ⚙ shows as picked (Brain Engine unless switched)');
  check(JSON.stringify(brainsEngineSettings('llamacpp')) === JSON.stringify({ engine: 'llamacpp', llamacpp: { brainEngine: false } }) && brainsEngineSettings('ollama').engine === 'ollama' && brainsEngineSettings('nonsense') === null, 'each ⚙ choice saves the settings it stands for; nonsense saves nothing');
  const be = path.join(A, 'brain-engine'), lc = path.join(A, 'llama.cpp');
  check(labEngineDirs({ ...cfgBe, labEngine: '' })[0] === be, 'Lab "Same as Bob\'s brains": Brain Engine\'s folder when the brains run on it');
  check(labEngineDirs({ ...cfgBe, labEngine: 'llamacpp' })[0] === lc, 'Lab on llama.cpp: the plain llama.cpp folder, even while the brains run on Brain Engine');
  check(labEngineDirs({ ...cfgLc, labEngine: 'brainengine' })[0] === be, 'Lab on Brain Engine while the brains run on llama.cpp');
  check(labEngineDirs({ ...cfgLc, labEngine: 'brainengine' }).includes(lc), 'the other folders are still looked in, for tools only one download carries');
  check(engineNameOf({ agentDir: A }, be) === 'Brain Engine' && engineNameOf({ agentDir: A }, lc) === 'llama.cpp', 'a folder\'s engine name, for the Lab\'s line and its result cards');
  check(engineChoices({ ...cfgBe, labEngine: 'llamacpp' }).lab === 'llamacpp' && engineChoices({ ...cfgBe, labEngine: 'odd' }).lab === '', 'the choices sent to Settings');

  // The Lab finds its tools in the picked folder first, and a tool only the other has (the direction finder) there.
  put(be, [exe('llama-server'), exe('llama-quantize'), exe('llama-cvector-generator')], { id: 'brainengine', version: 'brain-engine-b1' });
  put(lc, [exe('llama-server'), exe('llama-quantize'), exe('llama-imatrix')], { id: 'llamacpp', version: 'b1' });
  const settingsFile = path.join(tmp, 'settings.json');
  const lab = new Lab({ ...cfgLc, labEngine: 'llamacpp', settingsFile, dataDir: tmp, bobModelsDir: path.join(tmp, 'models') }, { shop: { catalog: { models: [] }, cfg: {} } });
  let t = lab.tools();
  check(path.dirname(t.server.path) === lc && path.dirname(t.quantize.path) === lc && path.dirname(t.cvector.path) === be && t.cvector.found, 'Lab on llama.cpp: its tools from llama.cpp, the direction finder from Brain Engine');
  check(lab.engineName() === 'llama.cpp' && lab.engineView().version === 'b1', 'the Lab says it works with llama.cpp, and which build');
  const v = lab.setLabEngine('brainengine');
  t = lab.tools();
  check(v.pick === 'brainengine' && v.name === 'Brain Engine' && path.dirname(t.server.path) === be && path.dirname(t.imatrix.path) === lc, 'Lab switched to Brain Engine: its server from there, imatrix still found in llama.cpp');
  check(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).labEngine === 'brainengine', 'the Lab\'s pick is saved');
  check(lab.view().engine.name === 'Brain Engine', 'the Lab page gets the engine line');
}

// The page: the ⚙ picker, the Lab picker, the groups and the buttons are there, and Help explains them.
{
  const read = (f) => fs.readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  const ui = read('../public/cellar.js'), help = read('../public/help-content.js'), labUi = read('../public/lab.js');
  check(/class="engine-gear"/.test(ui) && /⚙/.test(ui) && /name="brainsEngine"/.test(ui) && /data-labengine/.test(ui), 'Engines has the ⚙ engine-for-brains picker and the Lab\'s picker');
  check(/data-checkall/.test(ui) && /data-engineback/.test(ui) && /data-engineremove/.test(ui) && /data-engineremoveyes/.test(ui), 'Check all for updates, Go back, and Remove (which asks first)');
  check(/engine-group/.test(ui) && /'thinking', 'Thinking'/.test(ui), 'the engines are grouped and folded, Thinking first');
  check(/data-labengine/.test(labUi) && /Lab engine/.test(labUi), 'the Lab shows its engine on every tab');
  check(/faq-engine-update/.test(help) && /<dt>Engine for the Lab<\/dt>/.test(help) && /Engine for brains \(the ⚙\)/.test(help), 'Help, an FAQ and a glossary entry in Bob\'s voice');
  check(!/Run brains on Brain Engine/.test(ui + help), 'the old on/off switch is gone (the ⚙ replaces it)');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
