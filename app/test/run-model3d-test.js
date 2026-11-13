// 🧊 Picture to 3D (src/model3d.js, "Let Bob turn pictures into 3D models", off unless turned on): the pinned sources,
// the add-on pins and where they may come from, the 3D workshop engine entry, its setup steps (with a fake uv,
// Python and downloader: nothing is downloaded or run), the make_3d_model tool, Bob-Net jobs, the GitHub build,
// and the settings, Help, FAQ and glossary. Every file is made up in a temporary folder.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, addonsFor, addonAllowed, model3dWhy, machineKey, model3dOn, model3dReady, findPicture, setupModel3d, model3dTool, runtimePackages, GATED_WORDS, WEIGHTS_GB, codeDir, shopDir, modelsDir } from '../src/model3d.js';
import { ENGINES, engineFor, ENGINE_GROUP, ENGINE_GB } from '../src/engines.js';
import { mergeSettings } from '../src/config.js';
import { NEEDS } from '../src/setup-offer.js';
import { WANTS } from '../public/wants.js';
import { settingsNow } from '../src/self-help.js';
import { HELP } from '../public/help-content.js';
import { jobNeed, canHere, GUEST_TOOLS } from '../src/share-jobs.js';
import { NEEDS as NET_NEEDS } from '../src/share-brains.js';
import { sumsToMap, buildPins } from '../installer/pin-model3d.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-model3d-'));
const sha = (c) => c.repeat(64);
const wheel = (name, c = 'a') => ({ name, url: `https://github.com/MouseWurX/Bob/releases/download/model3d-addons-1/${name}`, sha256: sha(c), bytes: 10 });
const PINS = { release: 'model3d-addons-1', 'win-x64': [wheel('cumesh-0.0.1-cp312-cp312-win_amd64.whl'), wheel('utils3d-0.0.2-py3-none-any.whl', 'b')], 'linux-x64': [] };

// ---------- what is pinned ----------
{
  const code = Object.entries(SOURCES.code);
  check('every add-on and TRELLIS.2 is pinned to an exact commit', code.length >= 7 && code.every(([, c]) => /^[0-9a-f]{40}$/.test(c.commit) && /^https:\/\/(github\.com|gitlab\.com)\//.test(c.repo)));
  check('submodules are pinned too (cubvh, Eigen)', /^[0-9a-f]{40}$/.test(SOURCES.code.cumesh.submodules['third_party/cubvh'].commit) && /^[0-9a-f]{40}$/.test(SOURCES.code.o_voxel.submodules['third_party/eigen'].commit));
  check('weights come at exact revisions', SOURCES.weights.every((w) => /^[0-9a-f]{40}$/.test(w.revision)));
  const big = SOURCES.weights.flatMap((w) => w.files.map((f) => ({ ...f, gated: w.gated }))).filter((f) => f.bytes > 1e8 && !f.gated);
  check('every big file that isn\'t gated has its sha256', big.length >= 8 && big.every((f) => /^[0-9a-f]{64}$/.test(f.sha256 || '')));
  check('the background remover is the MIT BiRefNet, not the non-commercial RMBG-2.0', SOURCES.weights.some((w) => w.repo === 'ZhengPeng7/BiRefNet' && w.license === 'MIT') && !SOURCES.weights.some((w) => /RMBG/i.test(w.repo)));
  const dino = SOURCES.weights.find((w) => /dinov3/.test(w.repo));
  check('DINOv3 comes ungated, with Meta\'s licence file and its sha256', !dino.gated && dino.files.some((f) => f.path === 'LICENSE.md') && /^[0-9a-f]{64}$/.test(dino.files.find((f) => f.path === 'model.safetensors').sha256));
  check('the weights add up to about 17 GB', WEIGHTS_GB > 15 && WEIGHTS_GB < 18, String(WEIGHTS_GB));
  check('PyTorch for CUDA 12.8 and RTX 20 to 50 cards', SOURCES.cudaIndex.endsWith('/cu128') && /12\.0/.test(SOURCES.cudaArchs) && /8\.6/.test(SOURCES.cudaArchs));
}

// ---------- add-on pins ----------
{
  check('no pins: nothing to download', addonsFor('win-x64', {}) === null && addonsFor('win-x64', { release: 'x', 'win-x64': [] }) === null);
  check('checked pins from Bob\'s own release count', addonsFor('win-x64', PINS)?.length === 2);
  check('a pin without a checksum doesn\'t count', addonsFor('win-x64', { ...PINS, 'win-x64': [{ ...wheel('a-1-py3-none-any.whl'), sha256: '' }] }) === null);
  check('a pin from somewhere else doesn\'t count', addonsFor('win-x64', { ...PINS, 'win-x64': [{ ...wheel('a-1-py3-none-any.whl'), url: 'https://evil.example/a.whl' }] }) === null);
  check('downloads only from Bob\'s GitHub releases', addonAllowed('https://github.com/MouseWurX/Bob/releases/download/x/a.whl') && addonAllowed('https://objects.githubusercontent.com/x') && !addonAllowed('https://github.com/someone/else/releases/download/x/a.whl') && !addonAllowed('http://github.com/MouseWurX/Bob/releases/download/x/a.whl'));
  check('which computer: Windows and Linux x64 only', machineKey('win', 'x64') === 'win-x64' && machineKey('linux', 'x64') === 'linux-x64' && machineKey('mac', 'arm64') === '' && machineKey('linux', 'arm64') === '');
  check('a Mac is told to send it to a PC Bob', /NVIDIA/.test(model3dWhy('mac', 'arm64', PINS)) && /Bob-Net/.test(model3dWhy('mac', 'arm64', PINS)));
  check('ARM Linux is told too', /Bob-Net/.test(model3dWhy('linux', 'arm64', PINS)));
  check('Windows with pins: a Get button', model3dWhy('win', 'x64', PINS, 8.9) === undefined && model3dWhy('win', 'x64', PINS, null) === undefined);
  check('an RTX 50-series card gets the Get button again (its attention is handled in the runner)', model3dWhy('win', 'x64', PINS) === undefined && !/RTX 50-series/.test(read('src/engines.js') + publicText('cellar.js')));
  {
    const py = read('model3d/bob-trellis.py');
    check('on RTX 50-series cards the runner uses PyTorch attention and leaves xformers\' FlashAttention out, before TRELLIS.2 loads', /get_device_capability\(0\)\[0\] < 12/.test(py) && /ATTN_BACKEND"\] = "sdpa"/.test(py) && /flash\.FwOp\.not_supported_reasons = classmethod/.test(py) && py.indexOf('newest_cards(torch)') < py.indexOf('from trellis2.pipelines'));
    check('weights already in the models folder without their .ok mark are checked in place, not downloaded again', /already here/.test(py) && /sha256\(dest\) == f\["sha256"\]/.test(py));
  }
  check('Windows without pins: says why', /aren't built and checked/.test(model3dWhy('win', 'x64', {})));
  check('Windows gets the Triton build for Windows', runtimePackages('win').some((p) => /^triton-windows/.test(p)) && runtimePackages('linux').some((p) => /^triton[<>=]/.test(p)));
}

// ---------- the pin script ----------
{
  const lin = `${sha('1')}  utils3d-0.0.2-py3-none-any.whl\n${sha('2')}  cumesh-0.0.1-cp312-cp312-linux_x86_64.whl\r\n`;
  const win = `${sha('3')} *cumesh-0.0.1-cp312-cp312-win_amd64.whl\n`;
  const assets = [
    { name: 'utils3d-0.0.2-py3-none-any.whl', browser_download_url: 'https://github.com/MouseWurX/Bob/releases/download/m/u.whl', size: 5, digest: `sha256:${sha('1')}` },
    { name: 'cumesh-0.0.1-cp312-cp312-linux_x86_64.whl', browser_download_url: 'https://github.com/MouseWurX/Bob/releases/download/m/l.whl', size: 6 },
    { name: 'cumesh-0.0.1-cp312-cp312-win_amd64.whl', browser_download_url: 'https://github.com/MouseWurX/Bob/releases/download/m/w.whl', size: 7, digest: `sha256:${sha('3')}` }
  ];
  const sums = { 'linux-x64': sumsToMap(lin), 'win-x64': sumsToMap(win) };
  check('reads SHA256SUMS lines (with * and Windows line ends)', sums['linux-x64'].size === 2 && sums['win-x64'].get('cumesh-0.0.1-cp312-cp312-win_amd64.whl') === sha('3'));
  const p = buildPins('model3d-addons-7', assets, sums);
  check('the plain-Python wheel goes to every computer', p['win-x64'].some((w) => /none-any/.test(w.name)) && p['linux-x64'].some((w) => /none-any/.test(w.name)));
  check('each computer gets its own compiled wheels', p['win-x64'].some((w) => /win_amd64/.test(w.name)) && !p['win-x64'].some((w) => /linux/.test(w.name)) && p['linux-x64'].length === 2);
  check('pins it writes are ones Bob accepts', addonsFor('win-x64', p)?.length === 2 && addonsFor('linux-x64', p)?.length === 2);
  let threw = false;
  try { buildPins('m', [{ ...assets[2], digest: `sha256:${sha('9')}` }], { 'win-x64': sumsToMap(win) }); } catch (e) { threw = /doesn't match/.test(e.message); }
  check('GitHub\'s own sha256 must agree with the build\'s list', threw);
}

// ---------- engine entry ----------
{
  const e = ENGINES.find((x) => x.id === 'model3d');
  check('the 3D workshop is an engine (senses, about 22 GB)', Boolean(e) && ENGINE_GROUP.model3d === 'senses' && ENGINE_GB.model3d >= 20);
  check('it says the nvdiffrast part is non-commercial, and names DINOv3\'s licence', /non-commercial/.test(e.what) && /DINOv3 licence/.test(e.what));
  check('a Mac gets no Get button and is told why', Boolean(engineFor(e, 'mac').unavailable));
  check('it uses the same uv as the audio tools', e.repo === 'astral-sh/uv' && e.dir === 'audio-workshop' && typeof e.after === 'function');
  check('the Set it up card knows it', NEEDS.model3d?.engine === 'model3d');
}

// ---------- setup, with fakes ----------
const cfg = { agentDir: path.join(tmp, 'home'), innDir: path.join(tmp, 'home', 'inn'), painterDir: path.join(tmp, 'home', 'inn', 'painter') };
fs.mkdirSync(cfg.painterDir, { recursive: true });
{
  const calls = [];
  const pub = {}; const tick = () => {};
  fs.mkdirSync(codeDir(cfg), { recursive: true });
  fs.writeFileSync(path.join(codeDir(cfg), 'bob-trellis2.json'), JSON.stringify({ commit: SOURCES.code.trellis2.commit })); // already fetched: no network
  const run = async (exe, args, o = {}) => {
    calls.push({ exe: path.basename(exe), args, input: o.input, env: o.env });
    if (args[0] === '--version') return 'Python 3.11.9';
    if (/bob-trellis\.py$/.test(args[0])) {
      const job = JSON.parse(o.input);
      fs.mkdirSync(path.join(job.models, 'TRELLIS.2-4B'), { recursive: true });
      fs.writeFileSync(path.join(job.models, 'TRELLIS.2-4B', 'bob-pipeline.json'), '{}');
      o.onLine?.('PROGRESS 1/2 getting x'); o.onLine?.('DONE ' + job.models);
    }
    if (args[0] === 'venv') { const py = process.platform === 'win32' ? path.join(args[3], 'Scripts', 'python.exe') : path.join(args[3], 'bin', 'python'); fs.mkdirSync(path.dirname(py), { recursive: true }); fs.writeFileSync(py, ''); }
    return '';
  };
  const grabbed = [];
  const grab = async (asset, folder, p, s, t, o) => { grabbed.push({ asset, allowed: o.allowed(asset.browser_download_url), unpack: o.unpack }); const f = path.join(folder, asset.name); fs.writeFileSync(f, ''); return f; };
  let own = 0;
  const r = await setupModel3d(cfg, { pub, tick }, { grab, run, pins: PINS, key: 'win-x64', env: { HF_TOKEN: 'hf_test' }, findPython: async () => '/fake/python3.11', ownPython: async () => { own++; return '/fake/own/python3.12'; } });
  check('Python 3.11 isn\'t used: Bob gets his own 3.12 (the add-ons are built for 3.12)', own === 1 && calls.find((c) => c.args[0] === 'venv')?.args.includes('/fake/own/python3.12'));
  const torch = calls.find((c) => c.args.includes(`torch==${SOURCES.torch}`));
  check('PyTorch and xformers come from PyTorch\'s CUDA 12.8 index', torch && torch.args.includes(SOURCES.cudaIndex) && torch.args.some((a) => a.startsWith('xformers==')));
  check('the add-ons are downloaded checked, not unpacked, from Bob\'s release only', grabbed.length === 2 && grabbed.every((g) => g.allowed && g.unpack === false && /^[0-9a-f]{64}$/.test(g.asset.pinnedSha256)));
  check('then installed without pulling anything else in', calls.some((c) => c.args[0] === 'pip' && c.args.includes('--no-deps') && c.args.some((a) => /cumesh.*\.whl$/.test(a))));
  check('uv never fetches a Python of its own', calls.filter((c) => c.exe.startsWith('uv')).every((c) => c.env?.UV_PYTHON_DOWNLOADS === 'never'));
  const dl = calls.find((c) => /bob-trellis\.py$/.test(c.args[0] || ''));
  check('the weights come through the runner (a token is passed on only if set)', dl && JSON.parse(dl.input).action === 'download' && dl.env.HF_TOKEN === 'hf_test');
  check('it\'s marked ready, and says which TRELLIS.2', model3dReady(cfg) && /TRELLIS\.2 [0-9a-f]{7}/.test(r.version));

  // the gated DINOv3: a plain message with the steps, not a stack of Python
  const cfg2 = { ...cfg, agentDir: path.join(tmp, 'home2') };
  fs.mkdirSync(codeDir(cfg2), { recursive: true });
  fs.writeFileSync(path.join(codeDir(cfg2), 'bob-trellis2.json'), JSON.stringify({ commit: SOURCES.code.trellis2.commit }));
  const gatedRun = async (exe, args, o) => { if (/bob-trellis\.py$/.test(args[0] || '')) throw Object.assign(new Error('python failed (code 3)'), { tail: 'GATED facebook/dinov3-vitl16-pretrain-lvd1689m' }); return run(exe, args, o); };
  let msg = '';
  try { await setupModel3d(cfg2, { pub, tick }, { grab, run: gatedRun, pins: PINS, key: 'win-x64', env: {}, findPython: async () => '/p', ownPython: async () => '/p312' }); } catch (e) { msg = e.message; }
  check('a refused download explains what to do', msg === GATED_WORDS && /HF_TOKEN/.test(msg));
  let none = '';
  try { await setupModel3d(cfg2, { pub, tick }, { grab, run, pins: {}, key: 'win-x64' }); } catch (e) { none = e.message; }
  check('without pins it won\'t set anything up', /aren't built and checked/.test(none));
}

// ---------- the picture it uses ----------
{
  const pic = path.join(cfg.painterDir, 'dragon.png');
  fs.writeFileSync(pic, 'x');
  const ref = path.join(cfg.innDir, 'references', 'mine.jpg');
  fs.mkdirSync(path.dirname(ref), { recursive: true }); fs.writeFileSync(ref, 'x');
  check('finds a picture Bob made, by name', findPicture(cfg, 'dragon.png') === pic && findPicture(cfg, '/images/dragon.png') === pic);
  check('finds an attached picture by its path', findPicture(cfg, ref) === ref);
  check('never a file outside Bob\'s folders', findPicture(cfg, path.join(tmp, 'secret.png'), { exists: () => true }) === null && findPicture(cfg, '../../../etc/passwd.png', { exists: () => true }) === null);
  check('only pictures', findPicture(cfg, 'notes.txt', { exists: () => true }) === null);
}

// ---------- the tool ----------
{
  check('off by default; only true turns it on', !model3dOn({}) && mergeSettings({}, { model3d: 'yes' }).model3d === false && mergeSettings({}, { model3d: true }).model3d === true);
  const emitted = [];
  let offered = '';
  const brain = { cfg: { ...cfg, model3d: true }, made: { add: (f) => ({ url: '/images/' + path.basename(f) }) }, offerSetup: async (w) => { offered = w; return 'card'; }, setState: () => {} };
  const notReady = model3dTool(brain, { ready: () => false });
  check('not set up: the Set it up card', (await notReady.run({ picture: 'dragon.png' }, { emit: (e) => emitted.push(e) })) === 'card' && offered === 'model3d');
  const t = model3dTool(brain, { ready: () => true, make: async (c, job) => { fs.writeFileSync(job.out, 'glTF'); return { file: job.out }; } });
  const said = await t.run({ picture: 'dragon.png', title: 'Little dragon', quality: 'best' }, { emit: (e) => emitted.push(e) });
  const made = emitted.find((e) => e.type === 'made');
  check('makes a GLB in Bob\'s save folder and opens it in the 3D viewer', made?.items[0].kind === 'model' && /little-dragon-[0-9a-f]{6}\.glb$/.test(made.items[0].name) && made.show === true && fs.existsSync(made.items[0].path));
  check('tells the brain what it made, briefly', /Made the 3D model "Little dragon"/.test(said) && /best quality/.test(said));
  check('a missing picture is a clear error', /^Error: I can't find the picture/.test(await t.run({ picture: 'nope.png' }, {})));
  const desc = t.schema.function.description;
  check('the tool says to paint one plain-background picture first', /make one first with the picture tool/.test(desc) && /plain/.test(desc));
  const brainSrc = brainText();
  check('hidden while the setting is off', /!model3dOn\(this\.cfg\) && 'make_3d_model'/.test(brainSrc));
  check('in the 3D toolbox group', /tools: \['make_3d_part', 'make_3d_model'\]/.test(read('src/toolbox.js')));
}

// ---------- Bob-Net ----------
{
  check('a 3D figurine can go to a PC Bob', jobNeed({ kind: 'chat', text: 'make me a 3D figurine of a dragon' }) === 'model3d' && jobNeed({ kind: 'chat', text: 'a 3d model of an owl' }) === 'model3d');
  check('an exact part or a picture stays as it was', jobNeed({ kind: 'chat', text: 'a 3D printable bracket for a 20 mm pipe' }) !== 'model3d' && jobNeed({ kind: 'picture', text: 'a dragon' }) === 'pictures');
  check('only a Bob with the workshop ready says yes', canHere({}, 'model3d', { can: { model3d: true } }) && !canHere({}, 'model3d', { can: {} }));
  check('a job from another Bob may use the tool', GUEST_TOOLS.has('make_3d_model') && NET_NEEDS.includes('model3d'));
}

// ---------- the GitHub build ----------
{
  const wf = read('../.github/workflows/model3d-addons.yml');
  check('drafts run nothing', (wf.match(/!github\.event\.pull_request\.draft/g) || []).length === 2);
  check('every action is pinned to a full commit', [...wf.matchAll(/uses: ([^\s]+)/g)].every((m) => /@[0-9a-f]{40}$/.test(m[1])));
  check('it publishes only when started by hand', (wf.match(/github\.event_name == 'workflow_dispatch' && inputs\.publish/g) || []).length === 2);
  check('Windows and Linux, CUDA 12.8', /cuda_12\.8\.1_[\d.]*_?windows/.test(wf) && /nvidia\/cuda:12\.8\.1-devel-ubuntu22\.04/.test(wf));
  const sh = read('model3d/build-addons.sh');
  check('the build checks out exact commits and verifies them', /rev-parse HEAD\)" = "\$commit"/.test(sh) && /--no-build-isolation --no-deps/.test(sh) && /SHA256SUMS-/.test(sh));
  const py = read('model3d/bob-trellis.py');
  check('the runner never goes online while making, and checks downloads', /HF_HUB_OFFLINE/.test(py) && /doesn't match its checksum/.test(py) && /revision=w\["revision"\]/.test(py));
  check('the runner swaps in the MIT background remover', /ZhengPeng7\/BiRefNet/.test(py) && /bob-pipeline\.json/.test(py));
  const pkg = JSON.parse(read('package.json'));
  check('the runner ships outside the app archive', pkg.build.files.includes('model3d/**') && pkg.build.asarUnpack.includes('model3d/**'));
}

// ---------- settings, Help, FAQ, glossary ----------
{
  const cellar = publicText('cellar.js');
  check('the switch is in Settings and saved', /sswitch\('model3d', settings\.model3d === true, 'Let Bob turn pictures into 3D models'/.test(cellar) && /typeof b\.model3d === 'boolean'/.test(read('src/server.js')));
  check('Do you want me to: lists it', WANTS.some((w) => w.key === 'model3d' && w.setting === 'Let Bob turn pictures into 3D models'));
  check('bob_help reports it', /Let Bob turn pictures into 3D models: off/.test(settingsNow({})));
  const h = HELP.find((x) => x.id === 'model3d');
  check('Help in Bob\'s voice, with the licence and every platform', h && /\bI paint\b/.test(h.html) && /military/.test(h.html) && /Mac/.test(h.html) && /Android/.test(h.html) && /non-commercial/.test(h.html));
  check('the FAQ says yes now', /Let Bob turn pictures into 3D models/.test(HELP.find((x) => x.id === 'faq-3d-models')?.html || ''));
  const g = HELP.find((x) => x.id === 'glossary')?.html || '';
  check('glossary: TRELLIS.2 and GLB', /<dt>TRELLIS\.2<\/dt>/.test(g) && /<dt>GLB<\/dt>/.test(g));
  check('licences listed', /nvdiffrast/.test(read('docs/legal/THIRD-PARTY.md')) && /DINOv3/.test(read('docs/legal/THIRD-PARTY.md')));
  check('the paths stay right', shopDir(cfg).endsWith('3d-workshop') && modelsDir(cfg).endsWith(path.join('models', '3d')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
