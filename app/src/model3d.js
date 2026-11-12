// 🧊 Picture to 3D (off unless the user turns it on): TRELLIS.2 (Microsoft, MIT) turns one picture into a
// textured 3D model (GLB) that opens in the 3D viewer. Bob paints the picture first when there isn't one.
// It needs an NVIDIA graphics card (CUDA). Its add-ons are compiled by GitHub (.github/workflows/model3d-addons.yml)
// from the commits pinned in model3d/sources.json, never on the user's computer; Bob downloads them from his own
// GitHub release, each checked against its sha256 (model3d/addons-pins.json). The weights (about 17 GB) come from
// Hugging Face at pinned revisions and the big files are checked too. Meta's DINOv3 picture reader comes from an exact,
// ungated copy (camenduru's, with Meta's licence file in it), so nobody needs a Hugging Face account or token.
// Macs, AMD and Intel cards and the phone: send the job to a PC Bob over Bob-Net.
import { deadline as withDeadline } from './hang-guard.js'; // item 212: every network call has a deadline
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { OS, venvPython } from './platform.js';
import { findSystemPython, getOwnPython, uvExe } from './audio.js';
import { unzip } from './zip.js';
import { fileURLToPath } from 'node:url';

// Outside the app's archive (app.asar.unpacked), so Python can read the runner. Worked out here, not from config.js,
// because config.js and this file are both loaded early and would wait on each other.
export const MODEL3D_DIR = fileURLToPath(new URL('../model3d', import.meta.url)).replace(/app\.asar(?=$|[\\/])/, 'app.asar.unpacked');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
export const SOURCES = (() => { try { return readJson(path.join(MODEL3D_DIR, 'sources.json')); } catch { return { code: {}, weights: [] }; } })();
export const addonPins = (file = path.join(MODEL3D_DIR, 'addons-pins.json')) => { try { return readJson(file); } catch { return {}; } };

export const model3dOn = (cfg) => cfg.model3d === true;
export const shopDir = (cfg) => path.join(cfg.agentDir, '3d-workshop');
export const shopPython = (cfg) => venvPython(path.join(shopDir(cfg), 'venv'));
export const codeDir = (cfg) => path.join(shopDir(cfg), 'trellis2');
export const modelsDir = (cfg) => path.join(cfg.bobModelsDir || path.join(cfg.agentDir, 'models'), '3d');
const marker = (cfg) => path.join(shopDir(cfg), 'ready.json');
export const WEIGHTS_GB = Math.round(SOURCES.weights.flatMap((w) => w.files).reduce((t, f) => t + (f.bytes || 0), 0) / 1e8) / 10;

// The add-on wheels for this computer, or null (no pins: no Get button).
export function addonsFor(key, pins = addonPins()) {
  const list = pins?.[key];
  if (!pins?.release || !Array.isArray(list) || !list.length) return null;
  const ok = list.every((w) => /^[0-9a-f]{64}$/.test(w.sha256 || '') && addonAllowed(w.url) && /\.whl$/.test(w.name || ''));
  return ok ? list : null;
}
// Only Bob's own GitHub releases (and the file host GitHub sends them from).
export function addonAllowed(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && ((x.hostname === 'github.com' && /^\/MouseWurX\/Bob\/releases\/download\//i.test(x.pathname)) || /(^|\.)githubusercontent\.com$/.test(x.hostname));
  } catch { return false; }
}
export const machineKey = (os_ = OS, arch = process.arch) => (os_ === 'win' && arch === 'x64' ? 'win-x64' : os_ === 'linux' && arch === 'x64' ? 'linux-x64' : '');

export function model3dReady(cfg) {
  try { const m = readJson(marker(cfg)); return Boolean(m.ready) && fs.existsSync(shopPython(cfg)) && fs.existsSync(path.join(modelsDir(cfg), 'TRELLIS.2-4B', 'bob-pipeline.json')); } catch { return false; }
}

// Why there's no Get button here, or undefined.
export function model3dWhy(os_ = OS, arch = process.arch, pins = addonPins()) {
  if (os_ === 'mac') return 'Picture to 3D needs an NVIDIA graphics card, which Macs don\'t have. Send the job to a PC Bob over Bob-Net instead (Settings, Bob-Net, Send jobs).';
  const key = machineKey(os_, arch);
  if (!key) return 'Picture to 3D needs an NVIDIA graphics card on a 64-bit Windows or Linux PC. Send the job to a PC Bob over Bob-Net instead.';
  if (!addonsFor(key, pins)) return 'Picture to 3D\'s add-ons aren\'t built and checked for this kind of computer in this build of Bob yet, so there\'s nothing to download.';
  return undefined;
}

// Pip pins for everything else TRELLIS.2 needs to run (not to train).
export function runtimePackages(os_ = OS) {
  return [
    'numpy<2.3', 'pillow', 'opencv-python-headless', 'imageio', 'imageio-ffmpeg', 'trimesh', 'easydict', 'tqdm', 'plyfile', 'zstandard',
    'safetensors', 'huggingface_hub>=0.34,<1', 'transformers>=4.56,<5', 'kornia', 'timm', 'einops', 'scipy', 'scikit-image',
    os_ === 'win' ? 'triton-windows>=3.3,<3.4' : 'triton>=3.3,<3.4'
  ];
}

function runProg(exe, args, { cwd, env, signal, onLine, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let tail = '';
    const take = (d) => {
      const t = d.toString();
      tail = (tail + t).slice(-4000);
      for (const line of t.split(/\r?\n|\r/)) if (line.trim()) onLine?.(line.trim());
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const kill = () => { try { child.kill(); } catch {} };
    signal?.addEventListener('abort', kill, { once: true });
    child.on('error', (e) => reject(new Error(`Couldn't start ${path.basename(exe)} (${e.message}).`)));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', kill);
      if (signal?.aborted) return reject(new Error('Stopped.'));
      code === 0 ? resolve(tail) : reject(Object.assign(new Error(`${path.basename(exe)} failed (code ${code}): ${tail.slice(-500)}`), { code, tail }));
    });
    child.stdin.end(input || '');
  });
}

const is312 = async (py, run = runProg) => { try { return /3\.12\./.test(await run(py, ['--version'])); } catch { return false; } };

// After uv is in place (the same uv as the audio tools): a private Python 3.12, PyTorch for CUDA 12.8, the checked
// add-ons, TRELLIS.2's code at its pinned commit, then the weights.
export async function setupModel3d(cfg, { pub, tick, signal }, { grab, run = runProg, fetchImpl = fetch, env = process.env, pins = addonPins(), key = machineKey(), findPython = findSystemPython, ownPython = getOwnPython } = {}) {
  const wheels = addonsFor(key, pins);
  if (!wheels) throw new Error(key ? model3dWhy(key === 'win-x64' ? 'win' : 'linux', 'x64', pins) : model3dWhy(OS, process.arch, pins));
  const dir = shopDir(cfg);
  fs.mkdirSync(dir, { recursive: true });
  const uvEnv = { UV_CACHE_DIR: path.join(dir, 'cache'), UV_PYTHON_DOWNLOADS: 'never' };
  pub.steps = ['finding', 'downloading', 'checking', 'unpacking', 'setup', 'done'];
  const steps = 7;
  pub.fileCount = steps;
  const step = (i, label) => { pub.phase = 'setup'; pub.fileIndex = i; pub.file = label; pub.total = 0; pub.done = 0; pub.detail = ''; tick(); };
  const uv = (args) => run(uvExe(cfg), args, { cwd: dir, env: uvEnv, signal, onLine: (l) => { if (/^(Downloading|Downloaded|Prepared|Installed|Resolved|Building|Built)\b/.test(l)) { pub.detail = l.slice(0, 120); tick(); } } });

  step(1, 'Looking for Python 3.12');
  let py = await findPython(cfg);
  if (!py || !(await is312(py, run))) { pub.file = 'Getting my own Python 3.12 (about 15 MB, kept in my folder)'; tick(); py = await ownPython(cfg, { pub, tick, signal }); }

  step(2, 'Making a private Python for the 3D workshop');
  await uv(['venv', '--python', py, path.join(dir, 'venv')]);
  const vpy = shopPython(cfg);

  step(3, 'Getting PyTorch for NVIDIA cards (about 3 GB)');
  await uv(['pip', 'install', '--python', vpy, `torch==${SOURCES.torch}`, `torchvision==${SOURCES.torchvision}`, `xformers==${SOURCES.xformers}`, '--index-url', SOURCES.cudaIndex]);

  step(4, 'Getting the 3D add-ons (built by GitHub for Bob, checked)');
  const wdir = path.join(dir, 'wheels');
  fs.rmSync(wdir, { recursive: true, force: true });
  fs.mkdirSync(wdir, { recursive: true });
  pub.total = wheels.reduce((t, w) => t + (w.bytes || 0), 0); pub.done = 0;
  const files = [];
  for (const w of wheels) files.push(await grab({ name: w.name, browser_download_url: w.url, size: w.bytes, pinnedSha256: w.sha256 }, wdir, pub, signal, tick, { allowed: addonAllowed, unpack: false }));
  await uv(['pip', 'install', '--python', vpy, '--no-deps', ...files]);

  step(5, 'Getting the other packages TRELLIS.2 uses');
  await uv(['pip', 'install', '--python', vpy, ...runtimePackages(), '--extra-index-url', SOURCES.cudaIndex, '--index-strategy', 'unsafe-best-match']);

  step(6, 'Getting TRELLIS.2 (pinned version)');
  await fetchCode(cfg, { signal, fetchImpl });

  step(7, `Getting the 3D brains (about ${WEIGHTS_GB} GB, first time only)`);
  pub.total = 0;
  try {
    await run(vpy, [runner(cfg)], {
      env: { PYTHONUNBUFFERED: '1', HF_HUB_DISABLE_TELEMETRY: '1', ...(env.HF_TOKEN ? { HF_TOKEN: env.HF_TOKEN } : {}) }, signal,
      input: JSON.stringify({ action: 'download', models: modelsDir(cfg), sources: path.join(MODEL3D_DIR, 'sources.json') }),
      onLine: (l) => { const m = l.match(/^PROGRESS (\d+)\/(\d+) (.*)$/); if (m) { pub.detail = m[3].slice(0, 120); tick(); } }
    });
  } catch (e) {
    if (/GATED /.test(e.tail || e.message)) throw new Error(GATED_WORDS);
    throw e;
  }
  fs.writeFileSync(marker(cfg), JSON.stringify({ ready: true, python: py, release: pins.release, trellis: SOURCES.code.trellis2.commit, at: new Date().toISOString() }, null, 2));
  pub.detail = '';
  return { version: `TRELLIS.2 ${SOURCES.code.trellis2.commit.slice(0, 7)}` };
}

export const GATED_WORDS = 'Everything is set up except one part: Hugging Face refused one of the 3D brains (it may have been made private or gated since this build of Bob). Nothing else was changed. If you have a Hugging Face account that can open it, put a read token in HF_TOKEN in the environment Bob starts from and press Get again; Bob carries on from where he stopped.';

export const runner = (cfg) => cfg.model3dScript || path.join(MODEL3D_DIR, 'bob-trellis.py');

// TRELLIS.2's code at the pinned commit, from GitHub, unpacked into 3d-workshop/trellis2.
async function fetchCode(cfg, { signal, fetchImpl }) {
  const commit = SOURCES.code.trellis2?.commit || '';
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('TRELLIS.2 isn\'t pinned to a checked version, so I won\'t install it.');
  const dest = codeDir(cfg);
  try { if (readJson(path.join(dest, 'bob-trellis2.json')).commit === commit) return; } catch {}
  const res = await fetchImpl(`https://codeload.github.com/microsoft/TRELLIS.2/zip/${commit}`, { signal: withDeadline(signal, 15 * 60_000), headers: { 'user-agent': 'Bob' } });
  if (!res.ok) throw new Error(`Couldn't fetch TRELLIS.2 (${res.status}).`);
  const zip = path.join(shopDir(cfg), 'trellis2.zip');
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const tmp = path.join(shopDir(cfg), 'trellis2-tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  unzip(zip, tmp);
  const inner = fs.readdirSync(tmp).map((d) => path.join(tmp, d)).find((d) => fs.existsSync(path.join(d, 'trellis2', '__init__.py')));
  if (!inner) throw new Error('The TRELLIS.2 download had no code in it.');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(inner, dest);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(zip, { force: true });
  fs.writeFileSync(path.join(dest, 'bob-trellis2.json'), JSON.stringify({ commit, at: new Date().toISOString() }));
}

const slug = (t) => String(t || 'model').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'model';
export const PICTURE_EXT = /\.(png|jpe?g|webp)$/i;

// The picture to use: a name or path of something Bob made or the user attached, inside Bob's own folders.
export function findPicture(cfg, ref, { exists = fs.existsSync } = {}) {
  const r = String(ref || '').trim().replace(/^\/images\//, '');
  if (!r) return null;
  const roots = [cfg.painterDir, cfg.innDir].filter(Boolean).map((d) => path.resolve(d));
  const tries = path.isAbsolute(r) ? [path.resolve(r)] : roots.map((d) => path.resolve(d, decodeURIComponent(r)));
  for (const t of tries) {
    if (!PICTURE_EXT.test(t)) continue;
    if (!roots.some((d) => t === d || t.startsWith(d + path.sep))) continue; // never outside Bob's folders
    if (exists(t)) return t;
  }
  return null;
}

export async function makeModel3d(cfg, { image, out, quality = 'fast', seed }, { signal, onProgress, run = runProg } = {}) {
  let made = null, peak = null;
  await run(shopPython(cfg), [runner(cfg)], {
    env: { PYTHONUNBUFFERED: '1', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' }, signal,
    input: JSON.stringify({ action: 'make', image, out, models: modelsDir(cfg), code: codeDir(cfg), quality: quality === 'best' ? 'best' : 'fast', seed: Number.isFinite(seed) ? seed : crypto.randomInt(1, 2 ** 31) }),
    onLine: (l) => {
      const m = l.match(/^PROGRESS (\d+)\/(\d+) (.*)$/);
      if (m) onProgress?.(Number(m[1]), Number(m[2]), m[3]);
      const d = l.match(/^DONE (.+)$/); if (d) made = d[1].trim();
      const p = l.match(/^PEAK_GB ([\d.]+)/); if (p) peak = Number(p[1]);
    }
  });
  if (!made || !fs.existsSync(made)) throw new Error('The 3D workshop finished without a model.');
  return { file: made, peakGB: peak };
}

export function model3dTool(brain, { make = makeModel3d, ready = model3dReady, find = findPicture } = {}) {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'make_3d_model',
        description: 'Turn a picture of one object into a textured 3D model (GLB) with TRELLIS.2: figurines, creatures, props, furniture, natural shapes. Shows in a 3D viewer. The picture: ONE whole object on a plain background; make one first with the picture tool if needed. Takes 1 to 5 minutes. For exact parts with measurements use make_3d_part.',
        parameters: {
          type: 'object',
          properties: {
            picture: { type: 'string', description: 'The picture\'s file name or path, from something you made or the user attached.' },
            title: { type: 'string', description: 'A short name for the model, 2 to 6 words.' },
            quality: { type: 'string', enum: ['fast', 'best'], description: 'fast (about a minute, the default) or best (finer shape and a sharper texture, several minutes).' }
          },
          required: ['picture']
        }
      }
    },
    async run({ picture, title, quality }, ctx) {
      const cfg = brain.cfg;
      if (!ready(cfg)) return brain.offerSetup ? brain.offerSetup('model3d', ctx) : 'The 3D workshop isn\'t set up on this replicant matrix yet. Say it can be got from Settings, Engines, 3D workshop.';
      const img = find(cfg, picture);
      if (!img) return `Error: I can't find the picture "${String(picture || '').slice(0, 120)}" in my folders. Use the exact file name of a picture you made or the user attached, or make one first.`;
      const t = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80) || path.basename(img).replace(/\.\w+$/, '');
      fs.mkdirSync(cfg.painterDir, { recursive: true });
      const out = path.join(cfg.painterDir, `${new Date().toISOString().slice(0, 10)}-${slug(t)}-${crypto.randomBytes(3).toString('hex')}.glb`);
      const started = Date.now();
      let r;
      try { r = await make(cfg, { image: img, out, quality }, { signal: ctx?.signal, onProgress: (n, total, words) => brain.setState?.('painting', `3D workshop: ${words} (${n}/${total})`, null) }); }
      catch (e) { return `Error: ${e.message}`; }
      let item = null;
      try { item = brain.made?.add?.(r.file, { tool: 'make_3d_model', chat: ctx?.sessionId || '', from: path.basename(img) }); } catch {}
      const url = item?.url || `/images/${encodeURIComponent(path.basename(r.file))}`;
      ctx?.emit?.({ type: 'made', items: [{ kind: 'model', url, name: path.basename(r.file), path: r.file }], show: true });
      const secs = Math.round((Date.now() - started) / 1000);
      let kb = 0; try { kb = Math.round(fs.statSync(r.file).size / 1024); } catch {}
      return `Made the 3D model "${t}" from ${path.basename(img)} in ${secs} s (${kb} KB GLB, ${quality === 'best' ? 'best' : 'fast'} quality). It shows in the 3D viewer in the side panel, where ${cfg.userName || 'the user'} can turn and zoom it. The file is ${r.file}; Blender, Windows 3D Viewer and most game engines open it. Tell them in one or two short lines; if they want to print it, say a slicer can import the GLB, or you can try again with best quality.`;
    },
    summary: ({ title, picture }) => `3D model: ${String(title || picture || 'model').slice(0, 60)}`
  };
}
