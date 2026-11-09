// 1.5.157 Get Brain Engine (Get models, Engines): only while the Lab is on; the official llama.cpp build of the tested
// tag goes in its own brain-engine folder with Brain Engine's own files on top, both checked against GitHub's sha256;
// Bob's everyday llama.cpp folder is never touched. Fake GitHub, real archives.
// Run: node test/run-brain-engine-get-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { installEngine, engineStatus, TESTED_LLAMA, ENGINES, engineFor } from '../src/engines.js';
import { OS } from '../src/platform.js';

let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-be-'));
const cfg = { agentDir: path.join(tmp, 'Agent'), computerLab: true };
fs.mkdirSync(cfg.agentDir, { recursive: true });

check(!engineStatus({ agentDir: cfg.agentDir, computerLab: false }).some((e) => e.id === 'brainengine'), 'Brain Engine isn\'t listed while the Lab is switched off (1.5.172: the Lab is on unless switched off)');
const st = engineStatus(cfg).find((e) => e.id === 'brainengine');
check(st && /test build/.test(st.name) && /Based on llama\.cpp, not an official build/.test(st.what) && st.pinned, 'with the Lab on it is listed, named a test build, not official llama.cpp, and pinned');
check(ENGINES.find((e) => e.id === 'brainengine').tag === `brain-engine-${TESTED_LLAMA}`, 'it is pinned to the pre-release for the tested llama.cpp tag');
check(await installEngine({ ...cfg, computerLab: false }, 'brainengine', { pub: {}, tick: () => {} }).then(() => false, (e) => /Lab on first/.test(e.message)), 'Get is refused while the Lab is off');

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
console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
