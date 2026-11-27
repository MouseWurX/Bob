// 1.5.255 (35B rental, Nov 27): on Linux the Brain Engine 46 build looked for its own libraries
// (libllama-server-impl.so, libggml-cuda.so, ...) only in the folder it was built in, so from Bob's engine folder it
// failed at once ("cannot open shared object file", code 127). Bob now puts the engine's folder first on
// LD_LIBRARY_PATH for every engine start and --help check, on Linux and Android only. Fake paths only; nothing runs.
// Run: node test/run-engine-libdir-test.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { libDirEnv } from '../src/engine-blocked.js';

let failures = 0, passed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) passed++; else failures++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const exe = '/home/u/bob/agent/brain-engine/llama-server';

const a = libDirEnv(exe, { PATH: '/usr/bin' }, 'linux');
check(a.LD_LIBRARY_PATH === '/home/u/bob/agent/brain-engine' && a.PATH === '/usr/bin', 'Linux: the engine folder becomes LD_LIBRARY_PATH, the rest is kept');
const b = libDirEnv(exe, { LD_LIBRARY_PATH: '/usr/local/cuda/lib64' }, 'linux');
check(b.LD_LIBRARY_PATH === '/home/u/bob/agent/brain-engine:/usr/local/cuda/lib64', 'Linux: the engine folder goes first, before what was there');
const c = libDirEnv(exe, b, 'linux');
check(c.LD_LIBRARY_PATH === b.LD_LIBRARY_PATH, 'not added twice');
check(libDirEnv(exe, {}, 'android').LD_LIBRARY_PATH === '/home/u/bob/agent/brain-engine', 'Android (Termux) too');
const w = { PATH: 'C:\\x' };
check(libDirEnv('C:\\Bob\\agent\\brain-engine\\llama-server.exe', w, 'win32') === w && libDirEnv(exe, w, 'darwin') === w, 'Windows and Mac are unchanged');
check(libDirEnv('', w, 'linux') === w && libDirEnv('llama-server', w, 'linux') === w, 'a bare program name (found on PATH) is left alone');
const src = { PATH: '/usr/bin' }; libDirEnv(exe, src, 'linux');
check(!('LD_LIBRARY_PATH' in src), 'the given environment is not changed in place');

const lc = read('src/llamacpp.js'), emb = read('src/embedder.js'), hear = read('src/hearing.js');
check((lc.match(/spawnSync\(exe, \['--help'\], \{[^}]*env: libDirEnv\(exe\) \}\)/g) || []).length === 2, 'both --help checks use it');
check(/safeSpawn\(spawn, exe, args, \{[^}]*env: libDirEnv\(exe, env\) \}\)/.test(lc), 'the brain\'s engine start uses it');
check(/env: libDirEnv\(this\.exe\(\), \{ \.\.\.process\.env, CUDA_VISIBLE_DEVICES: '-1' \}\)/.test(emb) && /env: libDirEnv\(this\.exe\(\), \{ \.\.\.process\.env, CUDA_VISIBLE_DEVICES: '-1' \}\)/.test(hear), 'the memory helper and hearing use it');

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
