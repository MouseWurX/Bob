// 1.5.255 (35B rental, Nov 27): on Linux the Brain Engine 46 build looked for its own libraries
// (libllama-server-impl.so, libggml-cuda.so, ...) only in the folder it was built in, so from Bob's engine folder it
// failed at once ("cannot open shared object file", code 127). Bob now puts the engine's folder first on
// LD_LIBRARY_PATH for every engine start and --help check, on Linux and Android only. Fake paths only; nothing runs.
// Run: node test/run-engine-libdir-test.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { libDirEnv } from '../src/engine-blocked.js';
import { installEngine, TESTED_LLAMA } from '../src/engines.js';
import { OS } from '../src/platform.js';

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
// "libggml.so.1: cannot open shared object file". Every engine-folder copy now keeps links as they are. A real install
// from a fake GitHub with real tar files holding links (Linux and Mac only: Windows zips carry no links).
const eng = read('src/engines.js');
check(!/fs\.cpSync\(/.test(eng) && (eng.match(/^ +copyTree\(/gm) || []).length === 4, 'all four engine-folder copies go through copyTree, which keeps library links as they are');
if (OS !== 'win') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-libdir-'));
  const cfg = { agentDir: path.join(tmp, 'Agent') }; fs.mkdirSync(cfg.agentDir, { recursive: true });
  const mk = (name, files, links) => {
    const d = path.join(tmp, 'src-' + name); fs.mkdirSync(d, { recursive: true });
    for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(d, f), t);
    for (const [l, to] of Object.entries(links)) fs.symlinkSync(to, path.join(d, l));
    const out = path.join(tmp, name); execFileSync('tar', ['-czf', out, '-C', d, '.']);
    const buf = fs.readFileSync(out);
    return { name, size: buf.length, browser_download_url: `https://github.com/x/${name}`, digest: 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'), buf };
  };
  const base = mk(`llama-${TESTED_LLAMA}-bin-ubuntu-x64.tar.gz`, { 'llama-server': 'official', 'libggml.so.1.0.0': 'official ggml' }, { 'libggml.so.1': 'libggml.so.1.0.0' });
  const own = mk(`brain-engine-${TESTED_LLAMA}-linux-x64.tar.gz`, { 'llama-server': 'brain engine', 'libggml.so.1.0.0': 'brain engine ggml', 'libllama.so.1.0.0': 'brain engine llama' }, { 'libggml.so.1': 'libggml.so.1.0.0', 'libllama.so.1': 'libllama.so.1.0.0', 'libllama.so': 'libllama.so.1' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    u = String(u);
    if (u.includes('/repos/ggml-org/llama.cpp/releases/tags/')) return { ok: true, json: async () => ({ tag_name: TESTED_LLAMA, assets: [base] }) };
    if (u.includes('/repos/MouseWurX/Bob/releases/tags/')) return { ok: true, json: async () => ({ tag_name: `brain-engine-${TESTED_LLAMA}`, prerelease: true, assets: [own] }) };
    const a = [base, own].find((x) => x.browser_download_url === u);
    return a ? { ok: true, url: u, body: (async function* () { yield a.buf; })() } : { ok: false, status: 404 };
  };
  const r = await installEngine(cfg, 'brainengine', { nvidia: false, pub: {}, tick: () => {} }).catch((err) => ({ error: err.message }));
  globalThis.fetch = realFetch;
  const dir = path.join(cfg.agentDir, 'brain-engine');
  const link = (f) => { try { return fs.readlinkSync(path.join(dir, f)); } catch { return ''; } };
  const txt = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  check(!r.error, `the Linux install goes through (${r.error || r.version})`);
  check(link('libggml.so.1') === 'libggml.so.1.0.0' && link('libllama.so.1') === 'libllama.so.1.0.0' && link('libllama.so') === 'libllama.so.1', 'the library links stay relative, inside the engine folder');
  check(txt('libggml.so.1') === 'brain engine ggml' && txt('libllama.so') === 'brain engine llama', 'and they open Brain Engine\'s own libraries after the side folder is gone');
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
