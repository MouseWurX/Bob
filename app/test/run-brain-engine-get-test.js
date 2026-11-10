// 1.5.157 Get Brain Engine (Get models, Engines). 1.5.169: listed for everyone and the default engine for brains. The official llama.cpp build of the tested
// tag goes in its own brain-engine folder with Brain Engine's own files on top, both checked against GitHub's sha256;
// Bob's everyday llama.cpp folder is never touched. Fake GitHub, real archives.
// Run: node test/run-brain-engine-get-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { installEngine, engineStatus, TESTED_LLAMA, ENGINES, engineFor, pickAsset } from '../src/engines.js';
import { OS } from '../src/platform.js';
import { pickLlamaExe } from '../src/config.js';
import { enginesFor } from '../public/equip.js';

let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-be-'));
const cfg = { agentDir: path.join(tmp, 'Agent'), computerLab: true };
fs.mkdirSync(cfg.agentDir, { recursive: true });

const st = engineStatus({ agentDir: cfg.agentDir }).find((e) => e.id === 'brainengine');
check(st && st.name === 'Brain Engine' && /default engine/.test(st.what) && /Based on llama\.cpp, not an official build/.test(st.what) && !st.pinned, 'it is listed with the Lab off too, as the default engine, not official llama.cpp, with a Check for updates (rebuilds keep the name)');
check(ENGINES.find((e) => e.id === 'brainengine').tag === `brain-engine-${TESTED_LLAMA}`, 'it is pinned to the pre-release for the tested llama.cpp tag');

// 1.5.169: which llama-server Bob runs brains on (fake folders, no real computer).
{
  const A = path.join('X', 'Agent'), win = (p) => p;
  const here = (...files) => (p) => files.includes(p);
  const be = path.join(A, 'brain-engine', 'llama-server.exe'), lc = path.join(A, 'llama.cpp', 'llama-server.exe'), mine = path.join('D', 'tools', 'llama-server.exe');
  check(pickLlamaExe(lc, A, { platform: 'win32', exists: here(be, lc) }) === be, 'Brain Engine here: brains run on it, even when config names Bob\'s own llama.cpp folder');
  check(pickLlamaExe(undefined, A, { platform: 'win32', exists: here(be, lc) }) === be, 'nothing set by hand: Brain Engine');
  check(pickLlamaExe(lc, A, { brainEngine: false, platform: 'win32', exists: here(be, lc) }) === lc, 'switched off in Settings: plain llama.cpp');
  check(pickLlamaExe(be, A, { brainEngine: false, platform: 'win32', exists: here(be, lc) }) === lc, 'switched off while config still names Brain Engine: plain llama.cpp');
  check(pickLlamaExe(mine, A, { platform: 'win32', exists: here(be, lc, mine) }) === mine, 'a llama-server set by hand somewhere else always wins');
  check(pickLlamaExe(undefined, A, { platform: 'win32', exists: here(lc) }) === lc, 'no Brain Engine (a Mac, an ARM board, not downloaded): llama.cpp as before');
  check(win(pickLlamaExe(undefined, A, { platform: 'linux', exists: here(path.join(A, 'brain-engine', 'llama-server')) })) === path.join(A, 'brain-engine', 'llama-server'), 'Linux: the program has no .exe');
  const gguf = { files: [{ role: 'gguf' }] };
  const beE = { id: 'brainengine', available: true, installed: false }, lcE = { id: 'llamacpp', available: true, installed: false };
  check(enginesFor([gguf], [lcE, beE]).join() === 'engine:brainengine', 'Get Bob ready gets Brain Engine for brains');
  check(enginesFor([gguf], [{ ...lcE, installed: true }, beE]).join() === 'engine:brainengine', '...even beside the llama.cpp that came with Bob');
  check(enginesFor([gguf], [lcE, { ...beE, installed: true }]).length === 0, 'Brain Engine here: nothing more to get');
  check(enginesFor([gguf], [lcE, { ...beE, available: false }]).join() === 'engine:llamacpp', 'no Brain Engine build for this computer: llama.cpp');
  check(enginesFor([gguf], [lcE]).join() === 'engine:llamacpp', 'an engine list without Brain Engine: llama.cpp');
}

const e = engineFor(ENGINES.find((x) => x.id === 'brainengine'));
if (e.unavailable) {
  check(/no .*build yet/.test(e.unavailable), `on this replicant matrix it says why there's no build (${OS})`);
} else {
  // Two real archives: the "official" build and Brain Engine's own files (same names, different contents).
  const exe = OS === 'win' ? 'llama-server.exe' : 'llama-server';
  const lib = OS === 'win' ? 'llama.dll' : 'libllama.so';
  const mk = (name, files) => {
    const d = path.join(tmp, 'src-' + name); fs.mkdirSync(d, { recursive: true });
    for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(d, f), t);
    const out = path.join(tmp, name);
    if (name.endsWith('.zip')) execFileSync('tar', ['-a', '-cf', out, '-C', d, '.']); else execFileSync('tar', ['-czf', out, '-C', d, '.']);
    const buf = fs.readFileSync(out);
    return { name, size: buf.length, browser_download_url: `https://github.com/x/${name}`, digest: 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'), buf };
  };
  const baseName = OS === 'win' ? `llama-${TESTED_LLAMA}-bin-win-cpu-x64.zip` : `llama-${TESTED_LLAMA}-bin-ubuntu-x64.tar.gz`;
  const ownName = OS === 'win' ? `brain-engine-${TESTED_LLAMA}-win-x64.zip` : `brain-engine-${TESTED_LLAMA}-linux-x64.tar.gz`;
  const base = mk(baseName, { [exe]: 'official server', [lib]: 'official llama', [OS === 'win' ? 'ggml-cuda.dll' : 'libggml-cuda.so']: 'card backend' });
  const own = mk(ownName, { [exe]: 'brain engine server', [lib]: 'brain engine llama', 'LICENSE-llama.cpp': 'MIT' });
  let corrupt = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    u = String(u);
    if (u.includes('/repos/ggml-org/llama.cpp/releases/tags/')) return { ok: true, json: async () => ({ tag_name: TESTED_LLAMA, assets: [base] }) };
    if (u.includes('/repos/MouseWurX/Bob/releases/tags/')) return { ok: true, json: async () => ({ tag_name: `brain-engine-${TESTED_LLAMA}`, prerelease: true, assets: [own] }) };
    const a = [base, own].find((x) => x.browser_download_url === u);
    if (!a) return { ok: false, status: 404 };
    const body = corrupt && a === own ? Buffer.from('nope') : a.buf;
    return { ok: true, url: u, body: (async function* () { yield body; })() };
  };
  const everyday = path.join(cfg.agentDir, 'llama.cpp'); fs.mkdirSync(everyday); fs.writeFileSync(path.join(everyday, exe), 'everyday');
  const r = await installEngine(cfg, 'brainengine', { nvidia: false, pub: {}, tick: () => {} }).catch((err) => ({ error: err.message }));
  const dir = path.join(cfg.agentDir, 'brain-engine');
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  check(!r.error && r.version === `brain-engine-${TESTED_LLAMA}`, `it installs (${r.error || r.version})`);
  check(read(exe) === 'brain engine server' && read(lib) === 'brain engine llama', 'Brain Engine\'s own server and llama files sit on top');
  check(Boolean(read(OS === 'win' ? 'ggml-cuda.dll' : 'libggml-cuda.so')), 'the official build\'s card files are kept');
  check(Boolean(read('LICENSE-llama.cpp')), 'the llama.cpp licence comes with it');
  check(fs.readFileSync(path.join(everyday, exe), 'utf8') === 'everyday', 'Bob\'s everyday llama.cpp folder is not touched');
  check(engineStatus(cfg).find((x) => x.id === 'brainengine').installed, 'Engines shows it as installed');
  corrupt = true;
  const bad = await installEngine(cfg, 'brainengine', { nvidia: false, pub: {}, tick: () => {} }).then(() => '', (err) => err.message);
  check(/damaged/.test(bad) && read(exe) === 'brain engine server' && !fs.existsSync(dir + '.new'), 'a damaged download is refused and the working copy stays');
  globalThis.fetch = realFetch;
}
fs.rmSync(tmp, { recursive: true, force: true });
// 1.5.185: the graphics runtime file is never taken for the engine itself, whichever comes first in GitHub's list
{
  const W = engineFor(ENGINES.find((x) => x.id === 'llamacpp'), 'win', 'x64');
  const names = ['cudart-llama-bin-win-cuda-12.4-x64.zip', 'llama-b12032-bin-win-cuda-12.4-x64.zip', 'llama-b12032-bin-win-vulkan-x64.zip', 'llama-b12032-bin-win-cpu-x64.zip'];
  const list = names.map((name) => ({ name }));
  check(pickAsset(list, W, true)?.name === 'llama-b12032-bin-win-cuda-12.4-x64.zip' && pickAsset([...list].reverse(), W, true)?.name === 'llama-b12032-bin-win-cuda-12.4-x64.zip', 'on an NVIDIA card the engine file is picked, never the cudart runtime, in either order');
  check(W.runtime('llama-b12032-bin-win-cuda-12.4-x64.zip').test('cudart-llama-bin-win-cuda-12.4-x64.zip'), 'the runtime is still found beside it');
  check(pickAsset([{ name: 'cudart-llama-bin-win-cuda-12.4-x64.zip' }], W, true) === null, 'a release with only the runtime gives no engine at all');
  const src = fs.readFileSync(new URL('../src/engines.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check(/if \(!fs\.existsSync\(path\.join\(stage, b\.exe\)\)\) throw new Error/.test(src) && src.indexOf('if (!fs.existsSync(path.join(stage, b.exe))) throw') < src.indexOf('try { swapIn(folder, stage); }\n  catch (err) { fs.rmSync(stage, { recursive: true, force: true }); throw new Error(`${e.name} is in use right now (${err.code || err.message}). Wait for the Lab job'), 'Brain Engine is never swapped in unless the llama.cpp under it is whole');
}

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
