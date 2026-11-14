// 🐍 "Let Bob use Python in the sandbox" (Settings, How Bob works, 🧰 More tools; off by default). Works together
// with "Code sandbox": run_in_sandbox gets language "python" for data and maths jobs.
//
// Python here is Pyodide: Python compiled to WebAssembly (MPL-2.0, pinned below and sha256-checked, about 6.5 MB,
// fetched from the npm registry when the user presses Get Python). It runs INSIDE the same locked box as the
// JavaScript sandbox (selftools.js runSandboxed): Bob's own Node with its permission switch on, a fresh empty
// folder thrown away after each run, Pyodide's own folder to read and nothing else, no programs, no keys, no
// internet (switched off by Node where it can, the ready-made ways taken away otherwise), 30 seconds, 512 MB.
// Python's own files (open, os.listdir...) only see Pyodide's make-believe disk inside the box, never the
// computer's. A Python installed on the computer is never used: it has no lock like Node's, and its audit hooks
// can be got round, so it would only be a check, not a wall.
// The standard library comes with it (statistics, decimal, fractions, datetime, csv, json, re, math...). Nov 14:
// extra packages (numpy, pandas, python-docx...) come as a second one-time download, Get packages (py-packages.js),
// into Pyodide's own folder; a run loads only the ones its code imports, from that folder, still with no internet.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runSandboxed, sandboxHolds } from './selftools.js';
import { untgz } from './tgz.js';
import { packagesForRun } from './py-packages.js';

export const PYODIDE = {
  version: '314.0.7',
  url: 'https://registry.npmjs.org/pyodide/-/pyodide-314.0.7.tgz',
  sha256: '66b7949e5a0cba2250b586d7e368bf12fb482800748d182c4618254b685ffaa0',
  bytes: 6488647,
  license: 'MPL-2.0'
};
export const PY_SECONDS = 30;
export const PY_SECONDS_PACKAGES = 60; // loading pandas or scipy takes a while on its own
export const MAX_PY_CODE = 20000;
// The files Pyodide needs (from the package's top folder). Anything else in the download is left out.
const KEEP = new Set(['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json', 'package.json', 'README.md']);
const NEED = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];

export const pyodideDir = (cfg) => path.join(cfg.agentDir, `pyodide-${PYODIDE.version}`);
export const pyScratch = (cfg) => path.join(cfg.innDir, 'tools', '_pyscratch');
export const hasPython = (cfg) => Boolean(cfg?.agentDir) && NEED.every((f) => fs.existsSync(path.join(pyodideDir(cfg), f)));

// A .tgz read without any outside program (tgz.js): only the files Pyodide needs, from the package's top folder.
export const untgzFiles = (buf) => untgz(buf, KEEP);

// Get Python (the button in 🧰 More tools). Downloads, checks the sha256, unpacks into Bob's engine folder.
export async function getPython(cfg, { fetchImpl = fetch, signal, onProgress = () => {} } = {}) {
  if (hasPython(cfg)) return pyodideDir(cfg);
  if (new URL(PYODIDE.url).hostname !== 'registry.npmjs.org') throw new Error('That Python download isn\'t from where it should be. Stopped.');
  const res = await fetchImpl(PYODIDE.url, { signal, headers: { 'user-agent': 'Bob' } });
  if (!res.ok) throw new Error(`The Python download failed (${res.status}). Press Get Python again.`);
  if (res.url && new URL(res.url).hostname !== 'registry.npmjs.org') throw new Error('The Python download was sent somewhere I don\'t trust. Stopped.');
  const parts = []; let got = 0;
  for await (const c of res.body) {
    parts.push(Buffer.from(c)); got += c.length; onProgress(got, PYODIDE.bytes);
    if (got > PYODIDE.bytes * 2) throw new Error('The Python download is far bigger than it should be. Stopped.');
  }
  const buf = Buffer.concat(parts);
  if (crypto.createHash('sha256').update(buf).digest('hex') !== PYODIDE.sha256) throw new Error('The Python download came through damaged (checksum didn\'t match). Press Get Python again.');
  const files = untgzFiles(buf);
  const dir = pyodideDir(cfg), tmp = dir + '.part';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  for (const [name, body] of files) fs.writeFileSync(path.join(tmp, name), body);
  // Pyodide asks for the "ws" package when it starts in Node (for websockets, which the box never has).
  // A stand-in that does nothing, so it starts without it.
  const ws = path.join(tmp, 'node_modules', 'ws');
  fs.mkdirSync(ws, { recursive: true });
  fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ name: 'ws', version: '0.0.0-bob', type: 'module', main: 'index.js' }));
  fs.writeFileSync(path.join(ws, 'index.js'), "// Bob: no websockets in the sandbox.\nexport default class WebSocket { constructor() { throw new Error('No internet in the sandbox.'); } }\nexport const WebSocketServer = WebSocket;\n");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  if (!hasPython(cfg)) throw new Error('Python came down, but some of its files are missing. Press Get Python again.');
  return dir;
}

// The module the sandbox runs (selftools-runner.mjs calls run(input)). It loads Pyodide from its folder, gives
// the code `data` (the input), runs it and hands back `result` (or the last line's value) and what it printed.
export const PY_TOOL = `import path from 'node:path';
import { pathToFileURL } from 'node:url';
export async function run(input) {
  const dir = input.pyodideDir;
  const { loadPyodide } = await import(pathToFileURL(path.join(dir, 'pyodide.mjs')).href);
  let printed = '';
  const keep = (s) => { if (printed.length < 20000) printed += String(s) + '\\n'; };
  const py = await loadPyodide({ indexURL: dir + path.sep, stdout: keep, stderr: keep, env: { HOME: '/home/bob', MPLBACKEND: 'Agg' } });
  // Packages (Get packages): only from Pyodide's own folder. Ready-built ones by the code's imports, then the
  // plain-Python wheels it imports (unpacked into Python's make-believe disk) and what those need.
  if (input.packages) {
    try {
      const quiet = () => {};
      await py.loadPackagesFromImports(String(input.code), { messageCallback: quiet, errorCallback: keep });
      if (input.packages.pyodide.length) await py.loadPackage(input.packages.pyodide, { messageCallback: quiet, errorCallback: keep });
      const fs = await import('node:fs');
      for (const w of input.packages.wheels) py.unpackArchive(fs.readFileSync(path.join(dir, 'wheels', w)), 'wheel');
    } catch (e) { return JSON.stringify({ ok: false, error: 'A package wouldn\'t load: ' + String((e && e.message) || e).split('\\n')[0], printed }); }
  }
  py.globals.set('data', py.toPy(input.data ?? {}));
  let value;
  try { value = await py.runPythonAsync(String(input.code)); }
  catch (e) { return JSON.stringify({ ok: false, error: String((e && e.message) || e).split('\\n').filter(Boolean).slice(-3).join(' '), printed }); }
  const r = py.globals.has('result') ? py.globals.get('result') : value;
  const plain = (v) => { try { return v && typeof v.toJs === 'function' ? v.toJs({ dict_converter: Object.fromEntries }) : v; } catch { return String(v); } };
  let out = plain(r);
  try { JSON.stringify(out); } catch { out = String(out); }
  return JSON.stringify({ ok: true, out: out === undefined ? null : out, printed });
}
`;

export async function runPython(cfg, code, input = {}, { signal, holds = sandboxHolds, run = runSandboxed, have = hasPython, packages = packagesForRun } = {}) {
  if (typeof code !== 'string' || !code.trim()) throw new Error('There was no code to run.');
  if (code.length > MAX_PY_CODE) throw new Error(`That's ${code.length} characters of code; up to ${MAX_PY_CODE} for a quick job.`);
  if (!have(cfg)) return { ok: false, error: 'Python isn\'t here yet. Settings, How Bob works, 🧰 More tools: press Get Python (about 6.5 MB).' };
  const h = await holds(cfg);
  if (!h?.ok) return { ok: false, error: `The sandbox doesn't hold on this replicant matrix (${h?.why || 'no answer'}), so I won't run code here.` };
  const dir = path.join(pyScratch(cfg), crypto.randomUUID().slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, 'tool.mjs'), PY_TOOL);
    const clean = code.replace(/\r\n/g, '\n');
    const pk = packages(cfg, clean);
    const r = await run({ dir, input: { pyodideDir: pyodideDir(cfg), code: clean, data: input && typeof input === 'object' ? input : { value: input }, packages: pk || null }, reads: [pyodideDir(cfg)], internet: false, timeoutSec: pk ? PY_SECONDS_PACKAGES : PY_SECONDS, signal });
    if (!r.ok) return { ok: false, error: r.error, log: r.log };
    let ans = {};
    try { ans = JSON.parse(r.out); } catch { return { ok: false, error: 'Python gave back something I couldn\'t read.' }; }
    return { ok: ans.ok === true, out: ans.out, error: ans.error || '', log: ans.printed || '' };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

// Switching on: Python must be here, the sandbox must hold, and a tiny job must give the right answer.
export async function pythonReady(cfg, opts = {}) {
  if (!(opts.have || hasPython)(cfg)) return { ok: false, why: 'Python isn\'t here yet: press Get Python first', missing: true };
  const r = await runPython(cfg, 'import statistics\nresult = statistics.mean(data["xs"])', { xs: [1, 2, 3, 4] }, opts);
  return r.ok && Number(r.out) === 2.5 ? { ok: true } : { ok: false, why: r.error || 'a test sum came out wrong' };
}
