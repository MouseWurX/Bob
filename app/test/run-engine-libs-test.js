// 1.5.185 An engine update is only put in when it has all its files (the owner's rule: "if update has all files it can
// be applied, else do not apply and offer to download missing files"). On an NVIDIA card a Brain Engine update had come
// with the CUDA runtime and no llama.cpp files, so no brain loaded. Fake asset lists, folders and downloads only.
// Run: node test/run-engine-libs-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pickAsset, missingParts, partsText, incompleteUpdate, incompleteDir, fetchMissing, engineStatus, removeEngine, ENGINES, engineFor } from '../src/engines.js';
import { publicText } from './source-text.js';

let failures = 0, passed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) passed++; else failures++; };
const llamaW = engineFor(ENGINES.find((e) => e.id === 'llamacpp'), 'win', 'x64');
const raw = (id) => ENGINES.find((e) => e.id === id);

// The Windows files of llama.cpp b12032, as GitHub lists them (alphabetical: the runtime zip comes first).
const names = ['cudart-llama-bin-win-cuda-12.4-x64.zip', 'cudart-llama-bin-win-cuda-13.1-x64.zip', 'llama-b12032-bin-win-cpu-arm64.zip', 'llama-b12032-bin-win-cpu-x64.zip',
  'llama-b12032-bin-win-cuda-12.4-x64.zip', 'llama-b12032-bin-win-cuda-13.1-x64.zip', 'llama-b12032-bin-win-hip-radeon-x64.zip', 'llama-b12032-bin-win-sycl-x64.zip', 'llama-b12032-bin-win-vulkan-x64.zip'];
const assets = names.map((name, id) => ({ id, name }));
for (const [label, list] of [['GitHub\'s order', assets], ['reversed', [...assets].reverse()]]) {
  check(pickAsset(list, llamaW, true)?.name === 'llama-b12032-bin-win-cuda-13.1-x64.zip', `NVIDIA card, ${label}: the llama.cpp build, never the CUDA runtime zip`);
  check(pickAsset(list, llamaW, false)?.name === 'llama-b12032-bin-win-vulkan-x64.zip', `other cards, ${label}: the Vulkan build`);
}

// What "all its files" means.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-libs-'));
const folder = (files, d = fs.mkdtempSync(path.join(tmp, 'e-'))) => { fs.mkdirSync(d, { recursive: true }); for (const f of files) fs.writeFileSync(path.join(d, f), 'x'); return d; };
const be = { ...raw('brainengine'), exe: 'llama-server.exe' };
const npcGot = ['llama-server.exe', 'llama.dll', 'cudart64_13.dll', 'cublas64_13.dll', 'cublasLt64_13.dll', 'bob-brainengine.json']; // what the PC got
check(JSON.stringify(missingParts(folder(npcGot), be, 'win')) === '["llama"]', 'Windows: the PC\'s broken update is missing the llama.cpp library files (ggml)');
const whole = ['llama-server.exe', 'llama.dll', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu.dll', 'ggml-cuda.dll', 'cudart64_13.dll', 'cublas64_13.dll'];
check(missingParts(folder(whole), be, 'win').length === 0, 'Windows: a whole CUDA build is complete');
check(JSON.stringify(missingParts(folder(whole.filter((f) => !f.startsWith('cudart'))), be, 'win')) === '["runtime"]', 'Windows: a CUDA build without the CUDA runtime is missing it');
check(missingParts(folder(['llama-server.exe', 'ggml.dll', 'ggml-base.dll', 'ggml-vulkan.dll']), be, 'win').length === 0, 'Windows: a Vulkan build needs no CUDA runtime');
check(JSON.stringify(missingParts(folder(['ggml.dll']), be, 'win')) === '["exe"]', 'no llama-server: missing the engine program');
const lin = { ...raw('llamacpp'), exe: 'llama-server' };
check(missingParts(folder(['llama-server', 'libggml-base.so', 'libllama.so']), lin, 'linux').length === 0 && missingParts(folder(['llama-server']), lin, 'linux').includes('llama'), 'Linux: libggml*.so needed');
check(missingParts(folder(['llama-server', 'libggml.dylib']), lin, 'mac').length === 0 && missingParts(folder(['llama-server']), lin, 'mac').includes('llama'), 'Mac: libggml*.dylib needed');
check(missingParts(folder(['sd-cli.exe']), raw('sdcpp'), 'win').length === 0, 'other engines aren\'t held to it');
check(/llama\.cpp library files \(ggml\) and the CUDA runtime files/.test(partsText(['llama', 'runtime'])), 'what\'s missing, in plain words');

// An update kept aside; the engine shows it; Download the missing files fetches only those and swaps it in.
{
  const A = path.join(tmp, 'Agent');
  const e = engineFor(raw('brainengine'));
  if (!e.unavailable) {
    const exe = e.exe, lib = process.platform === 'win32' ? ['ggml.dll', 'ggml-base.dll'] : ['libggml-base.so', 'libggml.so'];
    const cfg = { agentDir: A };
    const live = folder([exe, ...lib], path.join(A, e.dir)); fs.writeFileSync(path.join(live, `bob-${e.id}.json`), JSON.stringify({ version: 'brain-engine-old' }));
    const held = folder([exe, 'brain-engine-own.txt'], incompleteDir(cfg, e));
    fs.writeFileSync(path.join(held, 'bob-incomplete.json'), JSON.stringify({ id: e.id, missing: ['llama'], mark: { version: 'brain-engine-new', print: 'p' } }));
    check(incompleteUpdate(cfg, e)?.missing[0] === 'llama', 'the kept-aside update says what it lacks');
    { const f = path.join(incompleteDir(cfg, e), 'bob-incomplete.json'); const keep = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, '\uFEFF' + keep); check(incompleteUpdate(cfg, e)?.missing[0] === 'llama', 'a note that starts with a BOM (saved by a Windows editor) is still read'); fs.writeFileSync(f, keep); }
    const st = engineStatus(cfg).find((x) => x.id === e.id);
    check(st.incomplete?.what === 'the llama.cpp library files (ggml)' && st.incomplete.version === 'brain-engine-new' && st.version === 'brain-engine-old', 'Settings, Engines shows the old one still in use and what the update is missing');
    const fetched = [];
    const find = async () => ({ rel: { assets: [] }, asset: { name: 'llama-b1-bin.zip', size: 5 } });
    const get = async (a, dir) => { fetched.push(a.name); for (const f of [exe, ...lib]) fs.writeFileSync(path.join(dir, f), f === exe ? 'BASE' : 'x'); };
    const r = await fetchMissing(cfg, e.id, { nvidia: false, pub: {}, tick: () => {}, find, get });
    check(JSON.stringify(fetched) === '["llama-b1-bin.zip"]', 'only the missing part is downloaded');
    const ver = JSON.parse(fs.readFileSync(path.join(A, e.dir, `bob-${e.id}.json`), 'utf8')).version;
    check(r.version === 'brain-engine-new' && ver === 'brain-engine-new' && lib.every((f) => fs.existsSync(path.join(A, e.dir, f))), 'once whole, the new build takes the old one\'s place');
    check(fs.readFileSync(path.join(A, e.dir, exe), 'utf8') === 'x' && fs.existsSync(path.join(A, e.dir, 'brain-engine-own.txt')), 'files already there (Brain Engine\'s own) aren\'t overwritten by the llama.cpp download');
    check(fs.existsSync(path.join(A, e.dir + '.previous')) && !incompleteUpdate(cfg, e) && !fs.existsSync(path.join(A, e.dir, 'bob-incomplete.json')), 'the old one is kept for Go back, and nothing is left waiting');

    // Still missing after the fetch: stays aside, the engine you have stays.
    folder([exe], incompleteDir(cfg, e)); fs.writeFileSync(path.join(incompleteDir(cfg, e), 'bob-incomplete.json'), JSON.stringify({ id: e.id, missing: ['llama'], mark: { version: 'v3' } }));
    let err = null;
    try { await fetchMissing(cfg, e.id, { pub: {}, tick: () => {}, find, get: async () => {} }); } catch (x) { err = x; }
    check(/still missing/.test(err?.message || '') && incompleteUpdate(cfg, e) && JSON.parse(fs.readFileSync(path.join(A, e.dir, `bob-${e.id}.json`), 'utf8')).version === 'brain-engine-new', 'still not whole: it stays aside, and the engine in use isn\'t touched');
    removeEngine(cfg, e.id);
    check(!fs.existsSync(incompleteDir(cfg, e)), 'Remove also clears an update kept aside');
  } else check(true, 'no Brain Engine build on this replicant matrix: the kept-aside checks are for Windows and Linux');
}

// Both install paths hold an incomplete update before the swap; Downloads doesn't retry it; the window offers the button.
const src = fs.readFileSync(new URL('../src/engines.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const overlay = src.slice(src.indexOf('async function installOverlay'), src.indexOf('export async function fetchMissing'));
check(overlay.indexOf('holdIncomplete(cfg, e, stage') > 0 && overlay.indexOf('holdIncomplete(cfg, e, stage') < overlay.indexOf('swapIn(folder, stage)'), 'Brain Engine: checked before it swaps in');
const inst = src.slice(src.indexOf('export async function installEngine'), src.indexOf('async function installOverlay'));
check(inst.indexOf('holdIncomplete(cfg, e, stage') > 0 && inst.indexOf('holdIncomplete(cfg, e, stage') < inst.indexOf('swapIn(folder, stage)'), 'llama.cpp: checked before it swaps in');
const models = fs.readFileSync(new URL('../src/models.js', import.meta.url), 'utf8');
check(/hopeless = \/[^\n]*is missing the/.test(models) && /missing \? await fetchMissing/.test(models), 'an incomplete download isn\'t retried three times; engine:<id>@missing fetches only the missing files');
const cellar = publicText('cellar.js');
check(/data-missing="1">Download the missing files</.test(cellar) && /@missing/.test(cellar), 'Settings, Engines offers Download the missing files');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
