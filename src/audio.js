// Bob's audio workshop: music and sound effects from a private Python that Bob sets up himself (with uv),
// in <Bob's folder>\audio-workshop. Nothing to do with Pinokio, Maestro or any Python already on the PC.
// Set up only when the user clicks "Get" in the cellar; model weights come on the first use of each kind.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { unpackedDir } from './config.js';
import { OS, exeName, venvPython, killTree as killAll } from './platform.js';

export const workshopDir = (cfg) => path.join(cfg.agentDir, 'audio-workshop');
export const uvExe = (cfg) => path.join(workshopDir(cfg), exeName('uv'));
export const pythonExe = (cfg) => cfg.audio?.python || venvPython(path.join(workshopDir(cfg), 'venv'));
export const aceDir = (cfg) => path.join(workshopDir(cfg), 'ace-step-1.5');
// 1.5.37: ACE-Step looks for its models in its own checkpoints folder. Bob fills it through his Downloads (pinned to a
// commit, each big file sha-checked, only when the user asks), so ACE-Step never fetches anything on its own.
export const aceModelsDir = (cfg) => cfg.audio?.aceModelsDir || path.join(aceDir(cfg), 'checkpoints');
export const ACE_MODELS_ID = 'ace-step-music';

// The music models' catalog entry and what's missing of it: [] when every file is there at its pinned size.
// 1.5.38: the small code and config files (sizeOnly) only have to be there. ACE-Step's own install ships its own
// copies, which can differ from the model repo's, and they belong to its code version.
export const aceFileOk = (f, size) => (f.sizeOnly ? size > 0 : size === f.bytes);
export function aceModelsMissing(cfg, catalog) { return aceMissingFiles(cfg, catalog).map((f) => f.path); }
// The missing files themselves (for their total size).
export function aceMissingFiles(cfg, catalog) {
  let cat = catalog;
  if (!cat) { try { cat = JSON.parse(fs.readFileSync(cfg.catalogFile || path.join(unpackedDir, 'catalog.json'), 'utf8')); } catch { return []; } }
  const entry = (cat.models || []).find((m) => m.id === ACE_MODELS_ID);
  if (!entry?.files?.length) return [];
  const root = aceModelsDir(cfg);
  return entry.files.filter((f) => { try { return !aceFileOk(f, fs.statSync(path.join(root, f.path)).size); } catch { return true; } });
}
// ACE-Step's own half-finished downloads (from before Bob fetched the models himself) are only clutter once every
// file checks out: gigabytes of .incomplete files nothing will finish.
export function tidyAceCache(cfg) {
  try { fs.rmSync(path.join(aceModelsDir(cfg), '.cache', 'huggingface'), { recursive: true, force: true }); return true; } catch { return false; }
}
export function aceModelsEntry(cfg) {
  try { return JSON.parse(fs.readFileSync(cfg.catalogFile || path.join(unpackedDir, 'catalog.json'), 'utf8')).models.find((m) => m.id === ACE_MODELS_ID) || null; } catch { return null; }
}
// Extra voices, each in its own small Python so their packages never clash with music or each other.
export const voicePython = (cfg, which) => cfg.audio?.voicePython?.[which] || venvPython(path.join(workshopDir(cfg), `venv-${which}`));
const marker = (cfg) => path.join(workshopDir(cfg), 'ready.json');
// uv only uses the PC's own signed Python (from python.org). The Python uv downloads by itself is unsigned,
// and Windows Smart App Control blocks it (error 0xc0e90002), so Bob never asks uv to fetch one.
const uvEnv = (cfg) => ({
  UV_CACHE_DIR: path.join(workshopDir(cfg), 'cache'),
  UV_PYTHON_PREFERENCE: 'only-system',
  UV_PYTHON_DOWNLOADS: 'never',
  ...(savedPython(cfg) ? { UV_PYTHON: savedPython(cfg) } : {})
});
function savedPython(cfg) {
  if (cfg.audio?.systemPython) return cfg.audio.systemPython;
  try { return JSON.parse(fs.readFileSync(marker(cfg), 'utf8')).python || null; } catch { return null; }
}

export const PYTHON_DOWNLOAD = OS === 'mac' ? 'https://www.python.org/downloads/macos/' : OS === 'linux' ? 'https://www.python.org/downloads/source/' : 'https://www.python.org/downloads/windows/';

// Mac and Linux: Python 3.12 or 3.11 from python.org, Homebrew or the system, in the usual places.
export function unixPythonGuesses(os_ = OS) {
  const vs = ['3.12', '3.11'];
  if (os_ === 'mac') return vs.flatMap((v) => [`/Library/Frameworks/Python.framework/Versions/${v}/bin/python${v}`, `/opt/homebrew/bin/python${v}`, `/usr/local/bin/python${v}`]);
  return vs.flatMap((v) => [`/usr/bin/python${v}`, `/usr/local/bin/python${v}`]);
}

// Finds Python 3.12 or 3.11 installed the normal way (python.org installer or the py launcher).
export async function findSystemPython(cfg, runImpl = run) {
  if (cfg.audio?.systemPython && fs.existsSync(cfg.audio.systemPython)) return cfg.audio.systemPython;
  if (OS !== 'win') return unixPythonGuesses().find((g) => fs.existsSync(g)) || null;
  for (const v of ['3.12', '3.11']) {
    try {
      const out = await runImpl('py', [`-${v}`, '-c', 'import sys; print(sys.executable)'], {});
      const exe = out.trim().split(/\r?\n/).pop();
      if (exe && fs.existsSync(exe)) return exe;
    } catch { /* no py launcher, or not that version */ }
  }
  // A Python uv already fetched earlier (for Open WebUI, say) that Windows has learned to trust.
  const uvPy = path.join(process.env.APPDATA || '', 'uv', 'python');
  try {
    const dirs = fs.readdirSync(uvPy).filter((d) => /^cpython-3\.1[12]\.\d+-windows-x86_64/.test(d)).sort(byVersion);
    for (const d of dirs) { const exe = path.join(uvPy, d, 'python.exe'); if (fs.existsSync(exe)) return exe; }
  } catch { /* no uv Pythons */ }
  const local = process.env.LOCALAPPDATA || '';
  const guesses = ['Python312', 'Python311'].flatMap((d) => [path.join(local, 'Programs', 'Python', d, 'python.exe'), path.join(process.env.ProgramFiles || 'C:\\Program Files', d, 'python.exe')]);
  return guesses.find((g) => fs.existsSync(g)) || null;
}

// Oldest first: an older interpreter has had more time to earn Smart App Control's trust.
function byVersion(a, b) {
  const v = (d) => (d.match(/cpython-(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
  const [x, y] = [v(a), v(b)];
  return x[1] - y[1] || x[2] - y[2];
}

// Plain words for the errors people actually hit.
export function explainSetupError(msg) {
  if (/0xc0e90002/i.test(msg)) return `Windows Smart App Control blocked a downloaded program. Bob now uses the Python from python.org instead; install Python 3.12 from ${PYTHON_DOWNLOAD} (tick "Add python.exe to PATH"), then click Get again.`;
  return msg;
}

// What the workshop can make right now.
export function audioReady(cfg) {
  if (cfg.audio?.python || cfg.audio?.aceUrl) return { music: Boolean(cfg.audio.aceUrl || cfg.audio.python), sfx: Boolean(cfg.audio.python) }; // tests and hand-made setups
  try {
    const m = JSON.parse(fs.readFileSync(marker(cfg), 'utf8'));
    return { music: Boolean(m.music) && fs.existsSync(path.join(aceDir(cfg), 'pyproject.toml')), sfx: Boolean(m.sfx) && fs.existsSync(pythonExe(cfg)) };
  } catch { return { music: false, sfx: false }; }
}

// Which extra voices are set up (Kokoro, Chatterbox).
export function voicesReady(cfg) {
  if (cfg.audio?.voicePython) return { kokoro: Boolean(cfg.audio.voicePython.kokoro), chatterbox: Boolean(cfg.audio.voicePython.chatterbox) }; // tests
  let m = {};
  try { m = JSON.parse(fs.readFileSync(marker(cfg), 'utf8')); } catch {}
  return { kokoro: Boolean(m.kokoro) && fs.existsSync(voicePython(cfg, 'kokoro')), chatterbox: Boolean(m.chatterbox) && fs.existsSync(voicePython(cfg, 'chatterbox')) };
}

// Pinned so a later push upstream can't change what runs on the PC.
export const PINS = {
  ACE_STEP_15_COMMIT: 'ca1e85fe9430179831e6bc6be790c332190a3866', // ACE-Step 1.5, MIT
  TORCH: '2.7.1',
  TORCHAUDIO: '2.7.1',
  KOKORO_ONNX: '0.6.1',        // Apache-2.0 model, MIT package
  SOUNDFILE: '0.13.1',
  CHATTERBOX: '0.1.7'          // MIT, Resemble AI
};

// Chatterbox pins torch 2.6, which can't use RTX 50-series cards. These overrides give it the same
// CUDA 12.8 torch the other audio tools use.
const CLONE_OVERRIDES = () => `torch==${PINS.TORCH}\ntorchaudio==${PINS.TORCHAUDIO}\n`;

export const VOICE_STEPS = {
  kokoro: [
    { label: 'Making a small private Python for the Kokoro voice', args: (c) => ['venv', '--python', c.audio.systemPython, path.join(workshopDir(c), 'venv-kokoro')] },
    { label: 'Getting Kokoro (about 80 MB, runs on the processor)', kind: 'kokoro', args: (c) => ['pip', 'install', '--python', voicePython(c, 'kokoro'), `kokoro-onnx==${PINS.KOKORO_ONNX}`, `soundfile==${PINS.SOUNDFILE}`] }
  ],
  chatterbox: [
    { label: 'Making a private Python for Chatterbox', args: (c) => ['venv', '--python', c.audio.systemPython, path.join(workshopDir(c), 'venv-chatterbox')] },
    { label: 'Getting PyTorch for Chatterbox (about 3 GB)', args: (c) => ['pip', 'install', '--python', voicePython(c, 'chatterbox'), `torch==${PINS.TORCH}`, `torchaudio==${PINS.TORCHAUDIO}`, '--index-url', 'https://download.pytorch.org/whl/cu128'] },
    { label: 'Getting Chatterbox', kind: 'chatterbox', prep: (c) => fs.writeFileSync(path.join(workshopDir(c), 'chatterbox-overrides.txt'), CLONE_OVERRIDES()),
      args: (c) => ['pip', 'install', '--python', voicePython(c, 'chatterbox'), `chatterbox-tts==${PINS.CHATTERBOX}`, '--override', path.join(workshopDir(c), 'chatterbox-overrides.txt'), '--extra-index-url', 'https://download.pytorch.org/whl/cu128', '--index-strategy', 'unsafe-best-match'] }
  ]
};

// Music: ACE-Step 1.5, fetched at the pinned commit and set up with its own locked packages (uv sync).
// Sound effects: AudioLDM 2 in a small separate Python. Torch comes from PyTorch's own CUDA index.
const STEPS = [
  { label: 'Getting ACE-Step 1.5 (music), pinned version', fn: fetchAce },
  { label: 'Setting up ACE-Step 1.5 and PyTorch (about 5 GB)', kind: 'music', cwd: aceDir, args: (c) => ['sync', '--python', c.audio.systemPython] },
  { label: 'Making a private Python for sound effects', args: (c) => ['venv', '--python', c.audio.systemPython, path.join(workshopDir(c), 'venv')] },
  { label: 'Getting PyTorch for sound effects (about 3 GB)', args: (c) => ['pip', 'install', '--python', pythonExe(c), `torch==${PINS.TORCH}`, `torchaudio==${PINS.TORCHAUDIO}`, '--index-url', 'https://download.pytorch.org/whl/cu128'] },
  { label: 'Getting AudioLDM 2 (sound effects)', kind: 'sfx', args: (c) => ['pip', 'install', '--python', pythonExe(c), 'diffusers', 'transformers', 'accelerate', 'scipy'] }
];

// The repo zip for the pinned commit, straight from GitHub, unpacked into audio-workshop\ace-step-1.5.
async function fetchAce(cfg, { pub, tick, signal }) {
  if (!/^[0-9a-f]{40}$/.test(PINS.ACE_STEP_15_COMMIT)) throw new Error('The music package isn\'t pinned to a checked version, so I won\'t install it.');
  if (fs.existsSync(path.join(aceDir(cfg), 'pyproject.toml'))) return;
  const url = `https://codeload.github.com/ACE-Step/ACE-Step-1.5/zip/${PINS.ACE_STEP_15_COMMIT}`;
  const res = await fetch(url, { signal, headers: { 'user-agent': 'Bob' } });
  if (!res.ok) throw new Error(`Couldn't fetch ACE-Step 1.5 (${res.status}).`);
  const zip = path.join(workshopDir(cfg), 'ace-step-1.5.zip');
  const buf = Buffer.from(await res.arrayBuffer());
  pub.done = buf.length; tick();
  fs.writeFileSync(zip, buf);
  const tmp = path.join(workshopDir(cfg), 'ace-tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  await run('tar', ['-xf', zip, '-C', tmp], { signal });
  const inner = fs.readdirSync(tmp).map((d) => path.join(tmp, d)).find((d) => fs.existsSync(path.join(d, 'pyproject.toml')));
  if (!inner) throw new Error('The ACE-Step 1.5 download had no project in it.');
  fs.renameSync(inner, aceDir(cfg));
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(zip, { force: true });
}

function run(exe, args, { cwd, env, signal, onLine }) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let tail = '';
    const take = (d) => {
      const t = d.toString();
      tail = (tail + t).slice(-3000);
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
      code === 0 ? resolve(tail) : reject(new Error(`${path.basename(exe)} failed (code ${code}): ${tail.slice(-400)}`));
    });
  });
}

// After uv.exe is in place (installed like the other engines), set up music and sound effects.
export async function setupWorkshop(cfg, opts) {
  try { return await setupSteps(cfg, opts, STEPS); } catch (e) { throw new Error(explainSetupError(e.message)); }
}

// Kokoro or Chatterbox on their own, without the 12 GB of music and sound effects.
export async function setupVoice(cfg, which, opts) {
  if (!VOICE_STEPS[which]) throw new Error('No such voice.');
  try { return await setupSteps(cfg, opts, VOICE_STEPS[which]); } catch (e) { throw new Error(explainSetupError(e.message)); }
}

async function setupSteps(cfg, { pub, tick, signal }, STEPS) {
  pub.steps = ['finding', 'downloading', 'checking', 'unpacking', 'setup', 'done'];
  pub.fileCount = STEPS.length;
  pub.phase = 'setup'; pub.file = 'Looking for Python 3.12 or 3.11 on this PC'; tick();
  const py = await findSystemPython(cfg);
  if (!py) throw new Error(`Music and sound effects need Python 3.12 or 3.11 (free, from python.org). Install it from ${PYTHON_DOWNLOAD} with the normal installer, then click Get again. Bob uses it only inside his own folder.`);
  cfg.audio = { ...(cfg.audio || {}), systemPython: py };
  let made = {};
  try { made = JSON.parse(fs.readFileSync(marker(cfg), 'utf8')); } catch {} // keep what's already set up
  for (const [i, s] of STEPS.entries()) {
    pub.phase = 'setup'; pub.file = s.label; pub.fileIndex = i + 1; pub.total = 0; pub.done = 0; tick();
    s.prep?.(cfg);
    if (s.fn) await s.fn(cfg, { pub, tick, signal });
    else {
      const go = () => run(uvExe(cfg), s.args(cfg), { cwd: s.cwd ? s.cwd(cfg) : workshopDir(cfg), env: uvEnv(cfg), signal, onLine: (l) => {
        // uv prints lines like "Downloading torch (2.4GiB)" and "Prepared 12 packages": show them as they come.
        if (/^(Downloading|Downloaded|Prepared|Installed|Resolved|Building|Built)\b/.test(l)) { pub.detail = l.slice(0, 120); tick(); }
      } });
      // Smart App Control sometimes blocks a program on its first run only, so one retry is worth it.
      try { await go(); } catch (e) { if (!/0xc0e90002/i.test(e.message)) throw e; pub.detail = 'Windows held the program back for a check. Trying once more...'; tick(); await go(); }
    }
    if (s.kind) { made[s.kind] = true; made.python = py; fs.writeFileSync(marker(cfg), JSON.stringify({ ...made, at: new Date().toISOString() })); }
  }
  pub.detail = '';
  return made;
}

// ---- Music: ACE-Step 1.5's own local server, started for the job and stopped after so the card is free again ----
const ACE_PORT = 8001;
const aceBase = (cfg) => cfg.audio?.aceUrl || `http://127.0.0.1:${ACE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function aceUp(cfg) {
  try { const r = await fetch(aceBase(cfg) + '/v1/models', { signal: AbortSignal.timeout(2000) }); return r.ok; } catch { return false; }
}

// 1.5.37: "uv run" starts Python as its own child, so killing uv alone left the music engine running (and an old one
// kept downloading, or hung, across jobs). Windows ends the whole tree.
function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 8000 }, () => {});
  else killAll(child); // Mac and Linux: the whole group (the music engine is started detached, so it leads one)
}

// A music engine still answering on Bob's port that this job didn't start (left from an older Bob, a crash or an
// earlier job) is never reused: it may be stuck, or still trying to download. It's ended first; only processes whose
// command line is ACE-Step's own server are touched.
export async function stopStrayAce(cfg, run = execFile) {
  if (process.platform !== 'win32') return false;
  const ps = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'acestep-api' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }";
  await new Promise((r) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 15000 }, () => r()));
  for (let i = 0; i < 20 && await aceUp(cfg); i++) await sleep(500);
  return true;
}

async function startAce(cfg, signal, onProgress) {
  if (cfg.audio?.aceUrl) return null; // tests and hand-made setups run their own
  if (await aceUp(cfg)) {
    await stopStrayAce(cfg);
    if (await aceUp(cfg)) throw new Error(`Another music engine is still running on port ${ACE_PORT} and wouldn't stop. Restart the PC, then ask for the song again.`);
  }
  // 1.5.37: offline, so ACE-Step can't quietly download models (gigabytes, with no progress shown) in the middle of a song.
  const env = { ...process.env, ...uvEnv(cfg), ACESTEP_API_HOST: '127.0.0.1', ACESTEP_API_PORT: String(ACE_PORT), HF_HOME: path.join(cfg.bobModelsDir || path.join(cfg.agentDir, 'models'), 'audio'), HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', ACESTEP_DOWNLOAD_SOURCE: 'huggingface' };
  const child = spawn(uvExe(cfg), ['run', 'acestep-api'], { cwd: aceDir(cfg), env, windowsHide: true, detached: OS !== 'win', stdio: ['ignore', 'pipe', 'pipe'] });
  let tail = '';
  child.stdout.on('data', (d) => { tail = (tail + d).slice(-2000); });
  child.stderr.on('data', (d) => { tail = (tail + d).slice(-2000); });
  // Loading the models onto the card takes a minute or two (they're already on the PC: see aceModelsMissing).
  const t0 = Date.now();
  while (Date.now() - t0 < 10 * 60e3) {
    if (signal?.aborted) { killTree(child); throw new Error('Stopped.'); }
    if (child.exitCode !== null) throw new Error(`The music engine stopped while starting: ${tail.slice(-300)}`);
    if (await aceUp(cfg)) return child;
    onProgress?.(0, 100);
    await sleep(2000);
  }
  killTree(child);
  throw new Error('The music engine took too long to start.');
}

async function makeMusic(cfg, job, { signal, onProgress }) {
  const child = await startAce(cfg, signal, onProgress);
  try {
    const post = (p, body) => fetch(aceBase(cfg) + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
    const r = await post('/release_task', { prompt: job.prompt, lyrics: job.lyrics || '[Instrumental]', audio_duration: Math.max(10, job.seconds), batch_size: 1, audio_format: 'wav', vocal_language: 'en', thinking: false });
    if (!r.ok) throw new Error(`The music engine refused the job (${r.status}): ${(await r.text()).slice(0, 200)}`);
    // 1.5.39: ACE-Step wraps every answer as { data, code, error }. Reading task_id from the top gave undefined, so
    // Bob polled for a job that didn't exist while the song sat finished on ACE-Step's side.
    const rel = await r.json();
    const task_id = rel?.data?.task_id ?? rel?.task_id;
    // The engine's raw answer goes to the logbook (e.details), not the chat.
    if (!task_id) throw Object.assign(new Error('The music engine didn\'t start the song properly, so I couldn\'t collect it. Ask me again; if it keeps happening, restart Bob. (Details are in the logbook.)'), { details: `release_task answered without a task id: ${JSON.stringify(rel).slice(0, 300)}` });
    const t0 = Date.now();
    while (Date.now() - t0 < 20 * 60e3) {
      await sleep(1500);
      if (signal?.aborted) throw new Error('Stopped.');
      onProgress?.(Math.min(95, Math.round((Date.now() - t0) / 600)), 100);
      const q = await (await post('/query_result', { task_id_list: [task_id] })).json();
      const list = Array.isArray(q?.data) ? q.data : Array.isArray(q) ? q : [];
      const item = list.find((x) => x && x.task_id === task_id);
      if (!item || item.status === 0) continue;
      if (item.status === 2) throw new Error(`The music engine couldn't make it: ${String(item.result || item.error || '').slice(0, 200)}`);
      const res = typeof item.result === 'string' ? JSON.parse(item.result) : item.result;
      const first = Array.isArray(res) ? res[0] : res;
      if (!first?.file) { const found = newestSong(cfg, t0 - 5000); if (found) { fs.copyFileSync(found, job.out); onProgress?.(100, 100); return { file: job.out, name: path.basename(job.out) }; } throw Object.assign(new Error('The music engine said the song was finished but didn\'t hand over a file. Ask me again; if it keeps happening, restart Bob.'), { details: `query_result finished with no file: ${JSON.stringify(item).slice(0, 300)}` }); }
      const audioUrl = new URL(first.file, aceBase(cfg));
      if (!/^(127\.0\.0\.1|localhost)$/.test(audioUrl.hostname)) throw new Error('The music engine pointed somewhere other than this PC.');
      const buf = Buffer.from(await (await fetch(audioUrl, { signal })).arrayBuffer());
      fs.writeFileSync(job.out, buf);
      onProgress?.(100, 100);
      return { file: job.out, name: path.basename(job.out) };
    }
    // A song that finished but was never reported: take it from ACE-Step's output folder if it's newer than this job.
    const found = newestSong(cfg, t0 - 5000);
    if (found) { fs.copyFileSync(found, job.out); onProgress?.(100, 100); return { file: job.out, name: path.basename(job.out) }; }
    throw new Error('The music took too long.');
  } finally {
    if (child) killTree(child);
  }
}

// ACE-Step's own output folder: the newest .wav made after `since` (ms), or null.
export function newestSong(cfg, since) {
  const dir = path.join(aceDir(cfg), '.cache', 'acestep', 'tmp', 'api_audio');
  try {
    return fs.readdirSync(dir).filter((n) => /\.wav$/i.test(n)).map((n) => ({ p: path.join(dir, n), t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .filter((x) => x.t >= since).sort((a, b) => b.t - a.t)[0]?.p || null;
  } catch { return null; }
}

// 1.5.41: the name a song or sound shows on its player: the title Bob gave it, else the first few style words
// ("Chiptune, upbeat, 140 bpm"), else the first words of what it sounds like.
export function songTitle({ title, prompt } = {}, kind = 'music') {
  const t = String(title || '').replace(/[\u0000-\u001f"<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t) return t.slice(0, 60);
  const p = String(prompt || '').replace(/[\u0000-\u001f"<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!p) return kind === 'music' ? 'Untitled song' : 'Sound effect';
  const words = kind === 'music' ? p.split(/\s*,\s*/).filter(Boolean).slice(0, 3).join(', ') : p.split(' ').slice(0, 7).join(' ');
  const short = words.length > 60 ? `${words.slice(0, 57).replace(/\s+\S*$/, '')}…` : words;
  return short.charAt(0).toUpperCase() + short.slice(1);
}
// A file name people can recognise in their folder: 2026-11-03-rainy-day-lofi-1a2b3c4d.wav.
export function songFileName(title, now = new Date()) {
  const slug = String(title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return `${now.toISOString().slice(0, 10)}-${slug ? `${slug}-` : ''}${crypto.randomUUID().slice(0, 8)}.wav`;
}

// kind: 'music' | 'sfx'. Returns { file, name }.
export async function makeAudio(cfg, kind, { prompt, lyrics, seconds, title }, { signal, onProgress }) {
  const can = audioReady(cfg);
  if (!can[kind]) throw new Error(kind === 'music' ? 'Music isn\'t set up yet. Get the audio tools in Settings (left menu), Show advanced settings, Engines & speed.' : 'Sound effects aren\'t set up yet. Get the audio tools in Settings (left menu), Show advanced settings, Engines & speed.');
  fs.mkdirSync(cfg.painterDir, { recursive: true });
  const name = songFileName(songTitle({ title, prompt }, kind));
  const out = path.join(cfg.painterDir, name);
  const job = { kind, prompt: String(prompt).slice(0, 1000), lyrics: lyrics ? String(lyrics).slice(0, 4000) : '', seconds: Math.min(kind === 'music' ? 240 : 20, Math.max(1, Number(seconds) || (kind === 'music' ? 30 : 5))), out };
  if (kind === 'music') {
    // 1.5.37: the models come first, through Bob's Downloads, and only when the user says so. No silent download.
    const missing = cfg.audio?.aceUrl ? [] : aceMissingFiles(cfg);
    if (missing.length) {
      const e = aceModelsEntry(cfg);
      const left = Math.max(0.1, Math.round(missing.reduce((t, f) => t + (f.bytes || 0), 0) / 1e8) / 10);
      const err = new Error(`The music models aren't all downloaded yet (about ${left} GB left, first time only). Nothing was downloaded. Ask the user if they want them: they can say yes in the chat, or click Get on "${e?.name || 'ACE-Step 1.5 music models'}" in Settings (left menu), Get models, Music. Then ask for the song again.`);
      err.code = 'MUSIC_MODELS_MISSING';
      throw err;
    }
    if (!cfg.audio?.aceUrl) tidyAceCache(cfg);
    return makeMusic(cfg, job, { signal, onProgress });
  }
  const script = cfg.audio?.script || path.join(unpackedDir, 'audio', 'bob-audio.py');
  const env = { HF_HOME: path.join(cfg.bobModelsDir || path.join(cfg.agentDir, 'models'), 'audio'), PYTHONUNBUFFERED: '1' };
  let made = null;
  const p = new Promise((resolve, reject) => {
    const child = spawn(pythonExe(cfg), [script], { env: { ...process.env, ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let tail = '';
    const take = (d) => {
      const t = d.toString();
      tail = (tail + t).slice(-3000);
      for (const line of t.split(/\r?\n/)) {
        const m = line.match(/^PROGRESS (\d+)\/(\d+)/);
        if (m) onProgress?.(Number(m[1]), Number(m[2]));
        const d2 = line.match(/^DONE (.+)$/);
        if (d2) made = d2[1].trim();
      }
    };
    child.stdout.on('data', take);
    child.stderr.on('data', (d) => { tail = (tail + d).slice(-3000); });
    const kill = () => { try { child.kill(); } catch {} };
    signal?.addEventListener('abort', kill, { once: true });
    const timer = setTimeout(kill, (kind === 'music' ? 1800 : 600) * 1000);
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`Couldn't start the audio workshop (${e.message}).`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (signal?.aborted) return reject(new Error('Stopped.'));
      if (code !== 0 || !made || !fs.existsSync(made)) return reject(new Error(`The audio workshop failed (code ${code}): ${tail.slice(-400)}`));
      resolve({ file: made, name: path.basename(made) });
    });
    child.stdin.end(JSON.stringify(job));
  });
  return p;
}
