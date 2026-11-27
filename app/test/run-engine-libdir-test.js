// 1.5.255 (35B rental, Nov 27): on Linux the Brain Engine 46 build looked for its own libraries
// (libllama-server-impl.so, libggml-cuda.so, ...) only in the folder it was built in, so from Bob's engine folder it
// failed at once ("cannot open shared object file", code 127). Bob now puts the engine's folder first on
// LD_LIBRARY_PATH for every engine start and --help check, on Linux and Android only. Fake paths only; nothing runs.
// Run: node test/run-engine-libdir-test.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { libDirEnv } from '../src/engine-blocked.js';
import { copyTree } from '../src/engines.js';

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

// Rental try 3: Bob's own install put Brain Engine's files on top with fs.cpSync, which turns a relative library link
// (libggml.so.1 -> libggml.so.1.0.0) into one pointing at the side folder it then deletes, so the engine stopped with
// "libggml.so.1: cannot open shared object file". Every engine-folder copy now keeps links as they are.
const eng = read('src/engines.js');
check(!/fs\.cpSync\(/.test(eng) && (eng.match(/^ +copyTree\(/gm) || []).length === 4, 'all four engine-folder copies go through copyTree, which keeps library links as they are');
// Real folders, nothing read from this computer: a side folder with links, copied on top of an engine folder that
// has links of the same names, then deleted. Skipped only where this file system can't make links (Windows without
// the right to); Windows zips carry no links anyway.
{ const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-libdir-'));
  const side = path.join(tmp, 'side'), dir = path.join(tmp, 'brain-engine');
  let links = true;
  try {
    fs.mkdirSync(side); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'libggml.so.1.0.0'), 'official ggml'); fs.symlinkSync('libggml.so.1.0.0', path.join(dir, 'libggml.so.1'));
    for (const [f, t] of Object.entries({ 'llama-server': 'brain engine', 'libggml.so.1.0.0': 'brain engine ggml', 'libllama.so.1.0.0': 'brain engine llama' })) fs.writeFileSync(path.join(side, f), t);
    fs.symlinkSync('libggml.so.1.0.0', path.join(side, 'libggml.so.1')); fs.symlinkSync('libllama.so.1.0.0', path.join(side, 'libllama.so.1')); fs.symlinkSync('libllama.so.1', path.join(side, 'libllama.so'));
  } catch { links = false; }
  if (links) {
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'mine'); fs.writeFileSync(path.join(side, 'keep.txt'), 'theirs');
    copyTree(side, dir);
    fs.rmSync(side, { recursive: true, force: true });
    const link = (f) => { try { return fs.readlinkSync(path.join(dir, f)); } catch { return ''; } };
    const txt = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
    check(link('libggml.so.1') === 'libggml.so.1.0.0' && link('libllama.so.1') === 'libllama.so.1.0.0' && link('libllama.so') === 'libllama.so.1', 'the library links stay relative, inside the engine folder (one was already there)');
    check(txt('libggml.so.1') === 'brain engine ggml' && txt('libllama.so') === 'brain engine llama' && txt('keep.txt') === 'theirs', 'and they open Brain Engine\'s own libraries after the side folder is gone');
    const more = path.join(tmp, 'more'); fs.mkdirSync(more); fs.writeFileSync(path.join(more, 'keep.txt'), 'new'); fs.writeFileSync(path.join(more, 'libcudart.so.13'), 'runtime');
    copyTree(more, dir, { overwrite: false });
    check(txt('keep.txt') === 'theirs' && txt('libcudart.so.13') === 'runtime', 'overwrite false: what is there stays, what is missing is added');
  } else check(true, 'this file system makes no links: nothing to keep');
  fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
