// 🐍 Python packages for the sandbox (Settings, How Bob works, 🧰 More tools; a second one-time download after
// Get Python). Nov 14: a brain that works in Python (GPT-OSS was trained with a Python tool) reaches for numpy,
// pandas, matplotlib, python-docx and the like. Without them its code fails on the first import. This is the list,
// where each one comes from, and the checks before any of it is kept.
//
// Two kinds:
//   1. Ready-built for Pyodide (numpy, pandas, scipy, lxml...). They're compiled for WebAssembly, so they run only
//      inside the same locked box as the rest of Python: nothing is compiled on this computer and nothing runs
//      outside the box. Each file's sha256 comes from pyodide-lock.json, which itself came inside the
//      sha256-pinned Pyodide download (py-sandbox.js), so the chain of checks starts from Bob's own code.
//   2. Plain-Python wheels from PyPI (python-docx, openpyxl...): pinned here by version, address and sha256.
// Licences: all MIT, BSD, PSF or MPL except fpdf2 (LGPL-3.0), which is fetched as its own file and never
// mixed into Bob's code (docs/legal/THIRD-PARTY.md).
// The same list is the one a Docker box would use (DOCKER_PINS), so code written for one runs in the other.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PYODIDE, pyodideDir, hasPython } from './py-sandbox.js';

export const PY_CDN = 'https://cdn.jsdelivr.net/pyodide';
const CDN_HOST = 'cdn.jsdelivr.net';
const PYPI_HOST = 'files.pythonhosted.org';

// Ready-built for Pyodide, by their name in pyodide-lock.json. What each pulls in comes from the lock too.
export const PYODIDE_PACKAGES = ['numpy', 'pandas', 'scipy', 'matplotlib', 'pillow', 'sympy', 'lxml', 'regex', 'pyyaml',
  'beautifulsoup4', 'networkx', 'jinja2', 'svgwrite', 'shapely', 'fonttools', 'typing-extensions'];

// Plain-Python wheels. needs = names from PYODIDE_PACKAGES (or other wheels) they import.
export const WHEELS = [
  { name: 'python-docx', imports: ['docx'], version: '1.2.0', license: 'MIT', needs: ['lxml', 'typing-extensions'], bytes: 252987,
    url: 'https://files.pythonhosted.org/packages/d0/00/1e03a4989fa5795da308cd774f05b704ace555a70f9bf9d3be057b680bcf/python_docx-1.2.0-py3-none-any.whl',
    sha256: '3fd478f3250fbbbfd3b94fe1e985955737c145627498896a8a6bf81f4baf66c7' },
  { name: 'openpyxl', imports: ['openpyxl'], version: '3.1.5', license: 'MIT', needs: ['et-xmlfile'], bytes: 250910,
    url: 'https://files.pythonhosted.org/packages/c0/da/977ded879c29cbd04de313843e76868e6e13408a94ed6b987245dc7c8506/openpyxl-3.1.5-py2.py3-none-any.whl',
    sha256: '5282c12b107bffeef825f4617dc029afaf41d0ea60823bbb665ef3079dc79de2' },
  { name: 'et-xmlfile', imports: ['et_xmlfile'], version: '2.0.0', license: 'MIT', needs: [], bytes: 18059,
    url: 'https://files.pythonhosted.org/packages/c1/8b/5fe2cc11fee489817272089c4203e679c63b570a5aaeb18d852ae3cbba6a/et_xmlfile-2.0.0-py3-none-any.whl',
    sha256: '7a91720bc756843502c3b7504c77b8fe44217c85c537d85037f0f536151b2caa' },
  { name: 'python-pptx', imports: ['pptx'], version: '1.0.2', license: 'MIT', needs: ['pillow', 'xlsxwriter', 'lxml', 'typing-extensions'], bytes: 472788,
    url: 'https://files.pythonhosted.org/packages/d9/4f/00be2196329ebbff56ce564aa94efb0fbc828d00de250b1980de1a34ab49/python_pptx-1.0.2-py3-none-any.whl',
    sha256: '160838e0b8565a8b1f67947675886e9fea18aa5e795db7ae531606d68e785cba' },
  { name: 'xlsxwriter', imports: ['xlsxwriter'], version: '3.3.1', license: 'BSD-2-Clause', needs: [], bytes: 180583,
    url: 'https://files.pythonhosted.org/packages/88/eb/1e6af9959a567901a7e7c7cef2e75883e487df223ed67f9a8977ff863bd8/xlsxwriter-3.3.1-py3-none-any.whl',
    sha256: '8e2c89e59d733fe59e112317218c64fbbc276d90a8c144ebd6f7fa15e7ab184a' },
  { name: 'pypdf', imports: ['pypdf'], version: '7.1.0', license: 'BSD-3-Clause', needs: [], bytes: 418698,
    url: 'https://files.pythonhosted.org/packages/ed/4c/d19f91b743c8579b67e3d8b001e095745dec5bb13a9b4b9eadc235a85d9e/pypdf-7.1.0-py3-none-any.whl',
    sha256: '47cca6b24bdcf4c4d65b5f7b8b972535c61710a061261e737688777cfd9a7bfb' },
  { name: 'fpdf2', imports: ['fpdf'], version: '2.9.0', license: 'LGPL-3.0-only', needs: ['pillow', 'fonttools', 'defusedxml'], bytes: 360586,
    url: 'https://files.pythonhosted.org/packages/2f/b0/f0e770163d0e635c81e8ba117686e31c6b172715e1185ff00ea2eb0b2f3d/fpdf2-2.9.0-py3-none-any.whl',
    sha256: 'e57f9eb183a61bbfc1a16ccb3eb68654f9ef3de0d9a78e37015a0df2eb29ab89' },
  { name: 'defusedxml', imports: ['defusedxml'], version: '0.7.1', license: 'PSF-2.0', needs: [], bytes: 25604,
    url: 'https://files.pythonhosted.org/packages/07/6c/aa3f2f849e01cb6a001cd8554a88d4c77c5c1a31c95bdf1cf9301e6d9ef4/defusedxml-0.7.1-py2.py3-none-any.whl',
    sha256: 'a352e7e428770286cc899e2542b6cdaedb2b4953ff269a210103ec58f6198a61' },
  { name: 'trimesh', imports: ['trimesh'], version: '5.2.1', license: 'MIT', needs: ['numpy'], bytes: 754230,
    url: 'https://files.pythonhosted.org/packages/e6/97/a6efa2926335bab3f85cf990a5b5f48abd989719b4015df0e3209675adf7/trimesh-5.2.1-py3-none-any.whl',
    sha256: 'ba4b5dbdf030bbffbb6337d9c67595435a8d1f224f23eb6500e9662f42a3c5df' }
];

// For a Docker box later: the same packages at the same versions (pip names), so code behaves the same in both.
export const DOCKER_PINS = { python: '3.14', note: 'versions of the Pyodide packages come from pyodide-lock.json at fetch time; wheels as pinned above' };

export const wheelFile = (w) => w.url.split('/').pop();
export const wheelsDir = (cfg) => path.join(pyodideDir(cfg), 'wheels');
const MARK = 'bob-packages.json';

const lockOf = (cfg) => JSON.parse(fs.readFileSync(path.join(pyodideDir(cfg), 'pyodide-lock.json'), 'utf8').replace(/^﻿/, ''));

// Every Pyodide package a name needs, itself included, from the lock's own "depends".
export function closure(lock, names) {
  const pk = Object.fromEntries(Object.entries(lock?.packages || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const seen = new Set(), missing = [];
  const add = (n) => {
    const k = String(n).toLowerCase();
    if (seen.has(k)) return;
    if (!pk[k]) { missing.push(k); return; }
    seen.add(k);
    for (const d of pk[k].depends || []) add(d);
  };
  for (const n of names) add(n);
  return { names: [...seen].sort(), files: [...seen].sort().map((k) => ({ name: k, file: pk[k].file_name, sha256: pk[k].sha256 })), missing };
}

// The names a wheel (or a list of them) needs from Pyodide, following wheels that need other wheels.
export function wheelNeeds(list) {
  const byName = Object.fromEntries(WHEELS.map((w) => [w.name, w]));
  const wheels = new Set(), pyo = new Set();
  const add = (w) => {
    if (wheels.has(w.name)) return;
    wheels.add(w.name);
    for (const n of w.needs) (byName[n] ? add(byName[n]) : pyo.add(n));
  };
  for (const w of list) add(w);
  return { wheels: WHEELS.filter((w) => wheels.has(w.name)), pyodide: [...pyo] };
}

// Which wheels a piece of code imports ("import docx", "from openpyxl import ...").
export function wheelsFor(code) {
  const mods = new Set();
  for (const m of String(code || '').matchAll(/^\s*(?:from\s+([A-Za-z_][\w]*)|import\s+([A-Za-z_][\w]*(?:\s*,\s*[A-Za-z_][\w.]*)*))/gm)) {
    if (m[1]) mods.add(m[1]);
    else for (const part of m[2].split(',')) mods.add(part.trim().split('.')[0]);
  }
  return wheelNeeds(WHEELS.filter((w) => w.imports.some((i) => mods.has(i))));
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// What the packages download is: every Pyodide file (with the wheels' needs) plus every wheel.
export function packagePlan(cfg) {
  const lock = lockOf(cfg);
  if (lock?.info?.version && lock.info.version !== PYODIDE.version) throw new Error('This Python and its package list don\'t match. Press Get Python again.');
  const need = wheelNeeds(WHEELS);
  const c = closure(lock, [...PYODIDE_PACKAGES, ...need.pyodide]);
  if (c.missing.length) throw new Error(`This Python has no ready-built ${c.missing.join(', ')}. Stopped.`);
  return { pyodide: c.files, wheels: need.wheels };
}

export function hasPackages(cfg) {
  if (!hasPython(cfg)) return false;
  try {
    const mark = JSON.parse(fs.readFileSync(path.join(pyodideDir(cfg), MARK), 'utf8'));
    if (mark.version !== PYODIDE.version) return false;
    return mark.files.every((f) => fs.existsSync(path.join(pyodideDir(cfg), f)));
  } catch { return false; }
}

// One file: only from where it should come, never far bigger than it should be, and only kept when its sha256 matches.
async function fetchChecked(url, host, want, { fetchImpl, signal, limit, onBytes }) {
  if (new URL(url).hostname !== host) throw new Error('A package download isn\'t from where it should be. Stopped.');
  const res = await fetchImpl(url, { signal, headers: { 'user-agent': 'Bob' } });
  if (!res.ok) throw new Error(`A package download failed (${res.status}). Press Get packages again.`);
  if (res.url && new URL(res.url).hostname !== host) throw new Error('A package download was sent somewhere I don\'t trust. Stopped.');
  const parts = []; let got = 0;
  for await (const c of res.body) {
    parts.push(Buffer.from(c)); got += c.length; onBytes(c.length);
    if (got > limit) throw new Error('A package download is far bigger than it should be. Stopped.');
  }
  const buf = Buffer.concat(parts);
  if (sha(buf) !== want) throw new Error(`${url.split('/').pop()} came through damaged (checksum didn't match). Press Get packages again.`);
  return buf;
}

// Get packages (the button under Get Python). Files already here and still matching are kept.
export async function getPackages(cfg, { fetchImpl = fetch, signal, onProgress = () => {} } = {}) {
  if (!hasPython(cfg)) throw new Error('Get Python first.');
  const plan = packagePlan(cfg);
  const dir = pyodideDir(cfg);
  fs.mkdirSync(wheelsDir(cfg), { recursive: true });
  let got = 0;
  const onBytes = (n) => { got += n; onProgress(got); };
  const kept = [];
  const keep = (rel, buf) => { const p = path.join(dir, rel); fs.writeFileSync(p + '.part', buf); fs.renameSync(p + '.part', p); kept.push(rel); };
  const fine = (rel, want) => { try { return sha(fs.readFileSync(path.join(dir, rel))) === want; } catch { return false; } };
  for (const f of plan.pyodide) {
    if (path.basename(f.file) !== f.file) throw new Error('The package list names a file outside Python\'s folder. Stopped.');
    if (fine(f.file, f.sha256)) { kept.push(f.file); continue; }
    keep(f.file, await fetchChecked(`${PY_CDN}/v${PYODIDE.version}/full/${f.file}`, CDN_HOST, f.sha256, { fetchImpl, signal, limit: 200 * 1048576, onBytes }));
  }
  for (const w of plan.wheels) {
    const rel = path.join('wheels', wheelFile(w));
    if (fine(rel, w.sha256)) { kept.push(rel); continue; }
    keep(rel, await fetchChecked(w.url, PYPI_HOST, w.sha256, { fetchImpl, signal, limit: w.bytes * 2, onBytes }));
  }
  fs.writeFileSync(path.join(dir, MARK), JSON.stringify({ version: PYODIDE.version, files: kept }, null, 1));
  return { files: kept.length, bytes: got };
}

// What a run loads: Pyodide finds its own from the code's imports (loadPackagesFromImports); the wheels and what
// they need are named here, so only what the code uses is loaded.
export function packagesForRun(cfg, code) {
  if (!hasPackages(cfg)) return null;
  const w = wheelsFor(code);
  return { wheels: w.wheels.map((x) => wheelFile(x)), pyodide: w.pyodide };
}
