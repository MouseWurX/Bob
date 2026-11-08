// Bob's engines (the programs that run models): llama.cpp, stable-diffusion.cpp, whisper.cpp, Piper.
// Fetched from their official GitHub releases, only when someone clicks "Get" in the cellar.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { hostAllowed } from './models.js';
import { setupWorkshop, setupVoice, audioReady, voicesReady } from './audio.js';
import { findOffice, findFfmpeg } from './office.js';
import { OS, exeName, onPath } from './platform.js';
import { unzip } from './zip.js';
import { fileURLToPath } from 'node:url';

// The opt-in office helpers are pinned to exact versions and checksums (src/office-pins.json, installer/pin-office.js).
export function officePins() {
  try { return JSON.parse(fs.readFileSync(new URL('./office-pins.json', import.meta.url), 'utf8')); } catch { return {}; }
}
const PIN = officePins();
// Piper's ARM Linux file has no GitHub checksum; this pin was computed in CI (installer/check-linux-engines.js, 2026-11-04).
const PIPER_ARM64_SHA = 'fea0fd2d87c54dbc7078d0f878289f404bd4d6eea6e7444a77835d1537ab88eb';
// 1.5.83: the llama.cpp release every speed test and brain race used (package.json bob.bundledLlamaTag, also the one
// bundled in the download). Get and Get Bob ready install this one; "Check for a newer build" can still fetch the newest.
export const TESTED_LLAMA = (() => { try { return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).bob?.bundledLlamaTag || ''; } catch { return ''; } })();
// LibreOffice comes from The Document Foundation's own archive, not GitHub.
const TDF_HOSTS = [/^downloadarchive\.documentfoundation\.org$/, /^download\.documentfoundation\.org$/];
const tdfAllowed = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && TDF_HOSTS.some((r) => r.test(x.hostname)); } catch { return false; } };

export const ENGINES = [
  {
    id: 'llamacpp', name: 'llama.cpp', what: 'Thinking engine: runs the chat and coding brains without Ollama.', repo: 'ggml-org/llama.cpp', tested: TESTED_LLAMA, dir: 'llama.cpp', exe: 'llama-server.exe',
    nvidia: [/bin-win-cuda-?(\d+(?:\.\d+)?)-x64\.zip$/], other: [/bin-win-vulkan-x64\.zip$/, /bin-win-cpu-x64\.zip$/],
    runtime: (asset) => { const m = asset.match(/cuda-?(\d+(?:\.\d+)?)/); return m ? new RegExp(`^cudart-.*cuda-?${m[1].replace('.', '\\.')}-x64\\.zip$`) : null; },
    // Apple Silicon: one build, with Metal (the Mac's graphics) built in.
    mac: { other: [/bin-macos-arm64\.(?:zip|tar\.gz)$/] },
    // Linux (checked against the real releases in CI, installer/check-linux-engines.js): Ubuntu CUDA builds with a
    // separate CUDA runtime file, like on Windows (newest CUDA first, x64 only), else Vulkan (any card), else the processor.
    linux: {
      nvidia: [/bin-ubuntu-cuda-?(\d+(?:\.\d+)?)-x64\.(?:zip|tar\.gz)$/], other: [/bin-ubuntu-vulkan-x64\.(?:zip|tar\.gz)$/, /bin-ubuntu-x64\.(?:zip|tar\.gz)$/],
      runtime: (asset) => { const m = asset.match(/ubuntu-cuda-?(\d+(?:\.\d+)?)-x64/); return m ? new RegExp(`^cudart-.*ubuntu-cuda-?${m[1].replace('.', '\\.')}-x64\\.(?:zip|tar\\.gz)$`) : null; }
    },
    // ARM Linux (Raspberry Pi 5 and other 64-bit ARM boards): the processor build only. A Pi's graphics are slower than
    // its processor for brains, so there's no Vulkan pick here.
    linuxArm64: { other: [/bin-ubuntu-arm64\.(?:zip|tar\.gz)$/] }
  },
  {
    // 1.5.155 Brain Engine: Bob's Lab engine, a fork of llama.cpp (engine/README.md) with the expert switch, for the
    // Computer Science Lab's Try it first. Its test pre-release on Bob's own GitHub holds only the llama and server
    // files, so it goes on top of the official llama.cpp build of the same tag (base), in its own folder: Bob's
    // built-in engine is never touched. Shown only while the Lab is on.
    id: 'brainengine', name: 'Brain Engine (test build)', what: 'Bob\'s Lab engine: llama.cpp with a switch that turns experts off without reloading, for the Lab\'s Try it first. Based on llama.cpp, not an official build. It has its own folder, so the built-in engine stays as it is. Only shown while the Lab is on.',
    repo: 'MouseWurX/Bob', tag: TESTED_LLAMA ? `brain-engine-${TESTED_LLAMA}` : '', base: 'llamacpp', labOnly: true, dir: 'brain-engine', exe: 'llama-server.exe',
    nvidia: [], other: [/^brain-engine-.*-win-x64\.zip$/], runtime: () => null,
    mac: { unavailable: 'Brain Engine has no Mac build yet.' },
    linux: { tag: TESTED_LLAMA ? `brain-engine-${TESTED_LLAMA}` : '', other: [/^brain-engine-.*-linux-x64\.tar\.gz$/] },
    linuxArm64: { unavailable: 'Brain Engine has no ARM Linux build yet.' }
  },
  {
    id: 'sdcpp', name: 'stable-diffusion.cpp', what: 'Painter: makes pictures and clips without ComfyUI.', repo: 'leejet/stable-diffusion.cpp', dir: 'sd.cpp', exe: 'sd-cli.exe', aka: ['sd.exe'],
    nvidia: [/bin-win-cuda-?(\d+)[^-]*-x64\.zip$/], other: [/bin-win-vulkan-x64\.zip$/, /bin-win-avx2-x64\.zip$/],
    runtime: () => /^cudart-.*-x64\.zip$/,
    // Apple Silicon builds are named for the macOS they were built on (sd-master-...-bin-Darwin-macOS-15.x-arm64.zip).
    mac: { other: [/bin-Darwin-macOS-[\d.]+-arm64\.(?:zip|tar\.gz)$/i, /-bin-(?:darwin|macos)[^/]*-arm64\.(?:zip|tar\.gz)$/i] },
    // Linux: Vulkan (NVIDIA, AMD and Intel cards all run it; there is no Linux CUDA build), else the processor build.
    linux: { nvidia: [/bin-Linux-Ubuntu-[\d.]+-x86_64-vulkan\.(?:zip|tar\.gz)$/i], other: [/bin-Linux-Ubuntu-[\d.]+-x86_64-vulkan\.(?:zip|tar\.gz)$/i, /bin-Linux-Ubuntu-[\d.]+-x86_64\.(?:zip|tar\.gz)$/i] },
    // stable-diffusion.cpp posts no ARM Linux build, and a Raspberry Pi would take many minutes a picture anyway.
    linuxArm64: { unavailable: 'There\'s no ready-made ARM Linux download of stable-diffusion.cpp, so on a Raspberry Pi or other ARM board Bob doesn\'t paint. On Bob-Net, a Bob on your other replicant matrix can paint for him (Send jobs).' }
  },
  {
    id: 'whispercpp', name: 'whisper.cpp', what: 'Hearing you: turns your voice into text without Ollama.', repo: 'ggml-org/whisper.cpp', dir: 'whisper.cpp', exe: 'whisper-cli.exe',
    // Bob listens on the processor (-ng), so the plain CPU build is enough and the smallest; CUDA builds are a fallback.
    // Newer CUDA zips are named whisper-bin-win-cuda-12.4-x64.zip, older ones whisper-cublas-12.4.0-bin-x64.zip.
    nvidia: [], other: [/^whisper-bin-x64\.zip$/, /^whisper-blas-bin-x64\.zip$/, /^whisper-(?:cublas-(\d+)[\d.]*-bin|bin-win-cuda-(\d+)[\d.]*)-x64\.zip$/],
    runtime: () => null,
    // whisper.cpp only posts a Mac framework for app makers, not the whisper-cli program, so there's nothing to fetch.
    mac: { unavailable: 'There\'s no ready-made Mac download of whisper.cpp. On a Mac, Bob hears you through Ollama or a cloud helper instead (Voice & conversation, Hearing).' },
    // Linux: the Ubuntu processor build (whisper-bin-ubuntu-x64.tar.gz).
    linux: { other: [/^whisper-bin-ubuntu-x64\.tar\.gz$/] },
    linuxArm64: { other: [/^whisper-bin-ubuntu-arm64\.tar\.gz$/] }
  },
  {
    // Piper's last Windows build. The repo is archived, so this release is fixed rather than "latest".
    id: 'piper', name: 'Piper', what: 'Voice: Bob reads replies aloud in his own voice, on the processor.', repo: 'rhasspy/piper', tag: '2023.11.14-2', sha256: 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea', dir: 'piper', exe: 'piper.exe',
    nvidia: [], other: [/^piper_windows_amd64\.zip$/],
    runtime: () => null,
    // Piper's 2023 Mac build is known not to start on current macOS (a missing espeak-ng library), so Bob doesn't offer it.
    mac: { unavailable: 'Piper\'s last Mac build doesn\'t start on current macOS. Use Kokoro voices instead: they run well on a Mac.' },
    // Linux: the same fixed release; the file has no GitHub checksum, so it carries its own pin (computed in CI, 2026-11-03).
    linux: { tag: '2023.11.14-2', sha256: 'a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992', other: [/^piper_linux_x86_64\.tar\.gz$/] },
    // ARM Linux: the same release's aarch64 file, with its own pinned checksum (empty would mean "not offered").
    linuxArm64: { tag: '2023.11.14-2', sha256: PIPER_ARM64_SHA, other: [/^piper_linux_aarch64\.tar\.gz$/], ...(PIPER_ARM64_SHA ? {} : { unavailable: 'Piper for ARM Linux isn\'t checked yet, so Bob doesn\'t offer it. Use Kokoro voices instead.' }) }
  },
  {
    // uv builds Bob a private Python for music and sound effects; nothing touches other Pythons on the PC.
    id: 'audio', name: 'Audio tools', what: 'Music (ACE-Step 1.5) and sound effects (AudioLDM 2). About 12 GB with the models. Bob keeps his own copy of the packages, and his own Python if this replicant matrix has none.',
    repo: 'astral-sh/uv', dir: 'audio-workshop', exe: 'uv.exe',
    nvidia: [], other: [/^uv-x86_64-pc-windows-msvc\.zip$/],
    runtime: () => null,
    mac: { other: [/^uv-aarch64-apple-darwin\.tar\.gz$/] },
    linux: { other: [/^uv-x86_64-unknown-linux-gnu\.tar\.gz$/] },
    linuxArm64: { other: [/^uv-aarch64-unknown-linux-gnu\.tar\.gz$/] },
    after: setupWorkshop,
    ready: (cfg) => { const a = audioReady(cfg); return a.music || a.sfx; }
  },
  {
    // Same uv as the audio tools; only the small Kokoro package is added. The voice files come from Voice & conversation, Talking.
    id: 'kokoro', name: 'Kokoro voices', what: 'Bob\'s voice: Kokoro-82M (Apache-2.0), natural-sounding and small, runs on the processor. About 100 MB, plus a 330 MB voice pack from Voice & conversation, Talking. Uses Python 3.12 or 3.11 if it\'s here; otherwise Bob gets his own (about 15 MB).',
    repo: 'astral-sh/uv', dir: 'audio-workshop', exe: 'uv.exe',
    nvidia: [], other: [/^uv-x86_64-pc-windows-msvc\.zip$/],
    runtime: () => null,
    mac: { other: [/^uv-aarch64-apple-darwin\.tar\.gz$/] },
    linux: { other: [/^uv-x86_64-unknown-linux-gnu\.tar\.gz$/] },
    linuxArm64: { other: [/^uv-aarch64-unknown-linux-gnu\.tar\.gz$/] },
    after: (cfg, o) => setupVoice(cfg, 'kokoro', o),
    ready: (cfg) => voicesReady(cfg).kokoro
  },
  {
    id: 'chatterbox', name: 'Chatterbox voice', what: 'Bob\'s voice: Chatterbox (MIT, Resemble AI). Very natural, can copy a voice from a short recording, uses the graphics card (about 4 GB while talking). About 4 GB to set up, plus 3 GB of model on first use. Uses Python 3.12 or 3.11 if it\'s here; otherwise Bob gets his own (about 15 MB).',
    repo: 'astral-sh/uv', dir: 'audio-workshop', exe: 'uv.exe',
    nvidia: [], other: [/^uv-x86_64-pc-windows-msvc\.zip$/],
    runtime: () => null,
    mac: { other: [/^uv-aarch64-apple-darwin\.tar\.gz$/] },
    linux: { other: [/^uv-x86_64-unknown-linux-gnu\.tar\.gz$/] },
    linuxArm64: { other: [/^uv-aarch64-unknown-linux-gnu\.tar\.gz$/] },
    after: (cfg, o) => setupVoice(cfg, 'chatterbox', o),
    ready: (cfg) => voicesReady(cfg).chatterbox
  },
  {
    // 1.5.78: the same uv, for the Connected apps (MCP) Hand: uvx starts MCP add-ons that come as Python packages
    // (Blender MCP is "uvx blender-mcp"). One already on the PC counts.
    id: 'uv', name: 'uv (for connected apps)', what: 'Starts MCP add-ons that come as Python packages, like Blender MCP, for the Connected apps (MCP) Hand. About 20 MB. If uv is already on your replicant matrix, Bob uses that one.',
    repo: 'astral-sh/uv', dir: 'audio-workshop', exe: 'uv.exe',
    nvidia: [], other: [/^uv-x86_64-pc-windows-msvc\.zip$/],
    runtime: () => null,
    mac: { other: [/^uv-aarch64-apple-darwin\.tar\.gz$/] },
    linux: { other: [/^uv-x86_64-unknown-linux-gnu\.tar\.gz$/] },
    linuxArm64: { other: [/^uv-aarch64-unknown-linux-gnu\.tar\.gz$/] },
    ready: (cfg) => Boolean(onPath(exeName('uvx')) || (cfg.agentDir && fs.existsSync(path.join(cfg.agentDir, 'audio-workshop', exeName('uvx')))))
  },
  {
    // Gyan's "essentials" Windows build of FFmpeg, a numbered release pinned with its sha256. One already on the PC counts.
    id: 'ffmpeg', name: 'FFmpeg', what: 'Converting sound and video (mp3, wav, mp4, webm, GIF...) and WebP pictures, for the Office documents and converting Hand. About 100 MB. Runs only while it converts. If FFmpeg is already on your replicant matrix, Bob uses that one.',
    repo: PIN.ffmpeg?.repo || 'GyanD/codexffmpeg', tag: PIN.ffmpeg?.tag || '', sha256: PIN.ffmpeg?.sha256 || '', needsPin: true, pinned: true, dir: 'ffmpeg', exe: 'ffmpeg.exe',
    nvidia: [], other: [/^ffmpeg-[\d.]+-essentials_build\.zip$/],
    runtime: () => null,
    // No official Mac build on GitHub to pin, so on a Mac Bob uses one that's installed (Homebrew: brew install ffmpeg).
    mac: { unavailable: 'There\'s no pinned FFmpeg download for Mac yet. Get it from ffmpeg.org, or with Homebrew (brew install ffmpeg) if you use it, and Bob finds it by himself.' },
    linux: { unavailable: 'On Linux, install FFmpeg from your software centre (or: sudo apt install ffmpeg), and Bob finds it by himself.' },
    ready: (cfg) => Boolean(findFfmpeg(cfg)),
    found: (cfg) => { const f = findFfmpeg(cfg); return f && f.where !== 'own' ? `found on this replicant matrix (${f.exe})` : ''; }
  },
  {
    // LibreOffice (MPL-2.0) for documents, spreadsheets and slides. One already installed (or Apache OpenOffice) counts.
    // Bob's copy is unpacked from the official installer into his own folder (msiexec /a: nothing is installed,
    // no admin, nothing in the Start menu). Deleting its folder removes it.
    id: 'libreoffice', name: 'LibreOffice', what: 'Documents, spreadsheets and slides for the Office documents and converting Hand: convert Word, Excel and PowerPoint files to and from PDF and OpenDocument, read them, make new ones and change them. About 350 MB download, about 1 GB unpacked. Runs hidden only while it has a job. If LibreOffice or OpenOffice is already on your replicant matrix, Bob uses that instead.',
    pinned: true, dir: 'libreoffice', exe: 'soffice.exe',
    ready: (cfg) => Boolean(findOffice(cfg)),
    found: (cfg) => { const o = findOffice(cfg); return o && o.where !== 'own' ? `found on this replicant matrix: ${o.name}${o.version ? ' ' + o.version : ''}` : ''; },
    version: (cfg) => { const o = findOffice(cfg); return o?.version || null; },
    install: installLibreOffice,
    // The Mac download is a disk image to drag into Applications, which is the user's to do; Bob finds it there.
    mac: { unavailable: 'On a Mac, install LibreOffice from libreoffice.org (drag it into Applications), and Bob finds it by himself.' },
    linux: { unavailable: 'On Linux, install LibreOffice from your software centre (most distros already have it), and Bob finds it by himself.' }
  }
];

// The engine as this computer sees it: Windows uses the fields above; a Mac or Linux entry (mac: {...}, linux: {...})
// replaces the build patterns, and program names lose .exe. unavailable = there's no build for this computer,
// with the reason to show instead of a Get button.
// Which Linux the engines are for: 'linux' (x86_64 PCs) or 'linuxArm64' (Raspberry Pi 5 and other 64-bit ARM boards).
export const ARCH = process.arch;
export function engineFor(e, os_ = OS, arch = ARCH) {
  const key = os_ === 'linux' && arch === 'arm64' ? 'linuxArm64' : os_;
  if (!e || (e.os === os_ && e.key === key)) return e;
  // ARM Linux falls back to the Linux entry only when that says "use the distro's" (FFmpeg, LibreOffice).
  const over = os_ === 'win' ? {} : e[key] || (key === 'linuxArm64' && e.linux?.unavailable ? e.linux : null) || { unavailable: `There's no ${e.name} build for this replicant matrix yet.` };
  // A Windows pin (tag + sha256) is for the Windows file only; another computer needs its own.
  const v = { ...e, nvidia: [], runtime: () => null, ...(os_ === 'win' ? {} : { sha256: '', tag: e.sha256 ? '' : e.tag }), ...over, os: os_, key };
  if (os_ === 'win') Object.assign(v, { nvidia: e.nvidia, runtime: e.runtime });
  v.exe = exeName(over.exe || e.exe, os_);
  v.aka = (over.aka || e.aka || []).map((n) => exeName(n, os_));
  return v;
}

export function engineExe(cfg, e0) {
  const e = engineFor(e0);
  const dir = path.join(cfg.agentDir, e.dir);
  for (const sub of ['', 'bin', 'Release']) for (const n of [e.exe, ...(e.aka || [])]) { const p = path.join(dir, sub, n); if (fs.existsSync(p)) return p; }
  // Linux: one the distro installed (llama-server, whisper-cli, piper from the package manager) counts too.
  if (e.os === 'linux') for (const n of [e.exe, ...(e.aka || [])]) { const p = onPath(n); if (p) return p; }
  // 1.5.104: a program set by hand in config.json (llamacpp.exe, painter.sdcpp.exe, stt.exe, tts.exe) counts as here,
  // so the Welcome list doesn't offer to download it again.
  const set = { llamacpp: cfg.llamacpp?.exe, sdcpp: cfg.painter?.sdcpp?.exe, whispercpp: cfg.stt?.provider === 'whispercpp' ? cfg.stt?.exe : null, piper: cfg.tts?.exe }[e.id];
  if (set && typeof set === 'string') { try { if (fs.statSync(set).isFile()) return set; } catch {} }
  return null;
}

// Which release is installed (written after each install; older installs don't have it).
export function installedVersion(cfg, e) {
  try { return JSON.parse(fs.readFileSync(path.join(cfg.agentDir, e.dir, `bob-${e.id}.json`), 'utf8')).version || null; } catch { return null; }
}

// 1.5.72: rough download sizes (GB), so the one-click Welcome total counts the programs too. llama.cpp's is the
// NVIDIA build with its CUDA runtime (other builds are smaller); the rest follow each engine's own "About" text.
export const ENGINE_GB = { llamacpp: 0.6, brainengine: 0.7, sdcpp: 0.5, whispercpp: 0.1, piper: 0.1, audio: 12, kokoro: 0.1, chatterbox: 4, ffmpeg: 0.1, libreoffice: 0.35 };
export function engineStatus(cfg) {
  return ENGINES.filter((e0) => !e0.labOnly || cfg.computerLab === true).map((e0) => engineFor(e0)).map((e) => ({ id: e.id, name: e.name, what: e.what, sizeGB: ENGINE_GB[e.id] ?? 0.1, available: !e.unavailable && !(OS !== 'win' && e.install), note: e.unavailable || '', installed: e.ready ? Boolean(e.ready(cfg)) : Boolean(engineExe(cfg, e)), bundled: e.id === 'llamacpp' && bundledEngine(cfg), version: installedVersion(cfg, e) || e.version?.(cfg) || null, pinned: Boolean(e.tag || e.pinned), tested: e.tested || null, found: e.found?.(cfg) || '', pin: e.id === 'libreoffice' ? (PIN.libreoffice?.version || '') : e.id === 'ffmpeg' ? (PIN.ffmpeg?.tag || '') : '', folder: path.join(cfg.agentDir, e.dir) }));
}

// The newest release with a Windows build, for "Get newer build". Same rules as installing.
export async function latestEngine(cfg, id, nvidia, fetchImpl = fetch) {
  const e = engineFor(ENGINES.find((x) => x.id === id));
  if (!e) throw new Error('No such engine.');
  if (e.unavailable) throw new Error(e.unavailable);
  const { rel, asset } = await findRelease(e, nvidia, undefined, fetchImpl);
  return { id, installed: installedVersion(cfg, e), tested: e.tested || null, latest: rel.tag_name, asset: asset.name, newer: installedVersion(cfg, e) !== rel.tag_name };
}

// Pick the right zip from a release's asset list for this graphics card. Highest CUDA version wins.
export function pickAsset(assets, e, nvidia) {
  for (const re of [...(nvidia ? e.nvidia : []), ...e.other]) {
    const hits = assets.filter((a) => re.test(a.name));
    if (!hits.length) continue;
    const ver = (n) => { const m = n.match(re) || []; return Number(m[1] ?? m[2] ?? 0); };
    hits.sort((a, b) => ver(b.name) - ver(a.name));
    return hits[0];
  }
  return null;
}

async function grab(asset, folder, pub, signal, tick, { allowed = hostAllowed, unpack = true } = {}) {
  if (!allowed(asset.browser_download_url)) throw new Error('That download isn\'t from where it should be. Stopped.');
  const zip = path.join(folder, asset.name + '.part');
  const res = await fetch(asset.browser_download_url, { redirect: 'follow', signal, headers: { 'user-agent': 'Bob' } });
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  if (!allowed(res.url)) throw new Error('The download was redirected somewhere I don\'t trust. Stopped.');
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(zip);
  const base = pub.done;
  let got = 0, last = 0;
  pub.file = asset.name; pub.phase = 'downloading'; tick();
  try {
    for await (const c of res.body) {
      hash.update(c); got += c.length;
      if (!out.write(c)) await new Promise((r) => out.once('drain', r));
      pub.done = base + got;
      if (Date.now() - last > 500) { last = Date.now(); tick(); }
    }
  } finally { await new Promise((r) => out.end(r)); }
  pub.phase = 'checking'; tick();
  const want = String(asset.digest || asset.pinnedSha256 || '').replace(/^sha256:/, '');
  // GitHub publishes a sha256 for every release file; no checksum means we can't trust it.
  if (!/^[0-9a-f]{64}$/.test(want)) { fs.rmSync(zip, { force: true }); throw new Error(`GitHub gave no checksum for ${asset.name}, so I won't install it.`); }
  if (hash.digest('hex') !== want) { fs.rmSync(zip, { force: true }); throw new Error(`${asset.name} came through damaged (checksum didn't match).`); }
  if (!unpack) { const done = zip.replace(/\.part$/, ''); fs.renameSync(zip, done); return done; }
  pub.phase = 'unpacking'; tick();
  // Windows 10+ and macOS ship bsdtar, which unpacks zip and tar.gz files. Linux's GNU tar doesn't read zip: unzip does.
  const [prog, args] = unpackCommand(asset.name, zip, folder);
  // Linux without the unzip program: Bob's own unzip, then the files are moved in.
  if (prog === 'unzip' && !onPath('unzip')) {
    const tmp = folder + '.unzip';
    fs.rmSync(tmp, { recursive: true, force: true });
    unzip(zip, tmp);
    fs.cpSync(tmp, folder, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(zip, { force: true });
    return;
  }
  await new Promise((resolve, reject) => execFile(prog, args, { windowsHide: true, timeout: 300000 }, (err) => (err ? reject(new Error('Couldn\'t unpack ' + asset.name + ': ' + err.message)) : resolve())));
  fs.rmSync(zip, { force: true });
}

export function unpackCommand(name, file, folder, os_ = OS) {
  if (os_ === 'linux' && /\.zip$/i.test(name)) return ['unzip', ['-o', '-q', file, '-d', folder]];
  return ['tar', ['-xf', file, '-C', folder]];
}

// Off Windows a program needs its "may run" bit. Zips don't always keep it, so set it on everything that looks
// like a program or a library (no extension, .dylib, .so) in the engine's folder.
export function makeRunnable(folder) {
  let ents = [];
  try { ents = fs.readdirSync(folder, { withFileTypes: true }); } catch { return; }
  for (const ent of ents) {
    if (!ent.isFile()) continue;
    if (path.extname(ent.name) && !/\.(dylib|so(\.\d+)*)$/i.test(ent.name) && !/\.so\./.test(ent.name)) continue;
    try { fs.chmodSync(path.join(folder, ent.name), 0o755); } catch {}
  }
}

// Linux: the CUDA runtime file may keep its libraries in a subfolder; llama.cpp looks for them next to itself.
export function liftLibraries(folder) {
  const walk = (d, depth) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (depth > 0 && /\.so(\.\d+)*$/.test(ent.name) && !fs.existsSync(path.join(folder, ent.name))) fs.renameSync(p, path.join(folder, ent.name));
    }
  };
  try { walk(folder, 0); } catch {}
}

// Some zips put the programs in a subfolder (e.g. Release\). Move them up next to each other.
function flatten(folder, exeNames) {
  const find = (d, depth) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isFile() && exeNames.includes(ent.name)) return d;
      if (ent.isDirectory() && depth < 3) { const r = find(p, depth + 1); if (r) return r; }
    }
    return null;
  };
  const where = find(folder, 0);
  if (!where || where === folder) return;
  for (const f of fs.readdirSync(where)) fs.renameSync(path.join(where, f), path.join(folder, f));
}

// The newest release that actually has a Windows build. Some projects (whisper.cpp 1.9.5, for one) ship a
// release with no Windows zips at all, so Bob looks back through the last 15 instead of giving up.
export async function findRelease(e, nvidia, signal, fetchImpl = fetch) {
  const get = async (u) => {
    // Release builds only (installer/bundle-engine.mjs in CI): the workflow's token, against GitHub's rate limit.
    const auth = process.env.BOB_BUNDLE_TOKEN ? { authorization: `Bearer ${process.env.BOB_BUNDLE_TOKEN}` } : {};
    const r = await fetchImpl(u, { headers: { 'user-agent': 'Bob', accept: 'application/vnd.github+json', ...auth }, signal });
    if (!r.ok) throw new Error(`GitHub didn't answer for ${e.name} (${r.status}). Try again in a few minutes.`);
    return r.json();
  };
  if (e.tag) {
    const rel = await get(`https://api.github.com/repos/${e.repo}/releases/tags/${e.tag}`);
    const asset = pickAsset(rel.assets || [], e, nvidia);
    if (!asset) throw new Error(`The pinned ${e.name} release (${e.tag}) has no build for this replicant matrix.`);
    return { rel, asset };
  }
  const list = await get(`https://api.github.com/repos/${e.repo}/releases?per_page=15`);
  for (const rel of Array.isArray(list) ? list : []) {
    if (rel.draft) continue; // whisper.cpp's Windows builds come out as separate "bNNNN" releases; take them too
    const asset = pickAsset(rel.assets || [], e, nvidia);
    if (asset) return { rel, asset };
  }
  throw new Error(`None of the last 15 ${e.name} releases has a build for this replicant matrix, so there's nothing safe to install. Clicking again won't help; Bob will pick it up once the project posts one.`);
}

// 1.5.74: does an installed engine actually start? It is run once with --help (it prints and exits, loading
// nothing). A missing program, a crash on start (Windows: a missing runtime file, codes 0xC0000000 and up) or
// silence counts as not working, with a plain reason. Tests replace run.
export function checkEngine(cfg, id, { run = execFile, timeout = 20000 } = {}) {
  const e = engineFor(ENGINES.find((x) => x.id === id) || {});
  const exe = e?.exe ? engineExe(cfg, e) : null;
  if (!exe) return Promise.resolve({ id, ok: false, why: 'not downloaded yet' });
  return new Promise((resolve) => {
    try {
      run(exe, ['--help'], { timeout, windowsHide: true, maxBuffer: 1 << 20 }, (err, out = '', errOut = '') => {
        const said = String(out) + String(errOut);
        const code = err && typeof err.code === 'number' ? err.code >>> 0 : 0;
        if (err && (err.code === 'ENOENT' || err.code === 'EACCES')) return resolve({ id, ok: false, why: `it couldn't be started (${err.code})` });
        if (code >= 0xC0000000) return resolve({ id, ok: false, why: `it stopped as it started (code 0x${code.toString(16).toUpperCase()}), usually a missing runtime file` });
        if (err?.killed) return resolve({ id, ok: false, why: 'it didn\'t answer within 20 seconds' });
        if (!said.trim()) return resolve({ id, ok: false, why: 'it started but said nothing' });
        resolve({ id, ok: true });
      });
    } catch (err) { resolve({ id, ok: false, why: `it couldn't be started (${err.message})` }); }
  });
}

// 1.5.76 "bundle a basic engine": Bob's download carries a basic llama.cpp (Vulkan on Windows and Linux: any graphics
// card or the processor; Metal on a Mac) in <app>/engines/llama.cpp, made by installer/bundle-engine.mjs at release time
// from the same GitHub release files and checksums as a normal download. On first start it is copied into Bob's own
// engine folder if he has none, so he can run a brain with nothing fetched. Its bob-llamacpp.json says bundled: true;
// with an NVIDIA card, Get Bob ready then swaps in the faster CUDA build.
// Inside an AppImage (asar), the bundle is unpacked next to it in app.asar.unpacked, where programs can be copied from.
export const BUNDLE_DIR = fileURLToPath(new URL('../engines/llama.cpp', import.meta.url)).replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked');
export function bundledEngine(cfg) {
  try { return JSON.parse(fs.readFileSync(path.join(cfg.agentDir, 'llama.cpp', 'bob-llamacpp.json'), 'utf8')).bundled === true; } catch { return false; }
}
export function seedBundledEngine(cfg, from = BUNDLE_DIR) {
  const e = ENGINES.find((x) => x.id === 'llamacpp');
  if (engineExe(cfg, e) || !fs.existsSync(path.join(from, 'bob-llamacpp.json'))) return false;
  const to = path.join(cfg.agentDir, e.dir);
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  if (OS !== 'win') { try { makeRunnable(to); } catch {} }
  return Boolean(engineExe(cfg, e));
}

export async function installEngine(cfg, id, { nvidia, pub, signal, tick, tag, newest = false } = {}) {
  const e0 = engineFor(ENGINES.find((x) => x.id === id));
  if (!e0) throw new Error('No such engine.');
  if (e0.labOnly && cfg.computerLab !== true) throw new Error(`${e0.name} is for the Computer Science Lab. Turn the Lab on first.`);
  // 1.5.83: the tested release unless a tag is given or the user asked for the newest build.
  const pick = tag || (!newest && e0.tested) || '';
  const e = pick ? { ...e0, tag: pick } : e0;
  // Replacing the bundled build: the new one downloads into a side folder first, then takes the bundled one's
  // place in one step, so a failed download never leaves Bob with no engine and two builds' graphics libraries
  // never sit side by side.
  const replacing = id === 'llamacpp' && Boolean(bundledEngine(cfg));
  if (e.unavailable) throw new Error(e.unavailable);
  if (e.install && e.os !== 'win') throw new Error(`${e.name} can't be fetched on this replicant matrix. Install it yourself and Bob finds it.`);
  if (e.install) return e.install(cfg, { pub, signal, tick });
  if (e.base) return installOverlay(cfg, e, { nvidia, pub, signal, tick });
  // Office helpers: only the exact pinned release with its checksum, never "the newest".
  if (e.needsPin && !(e.tag && /^[0-9a-f]{64}$/.test(e.sha256 || ''))) throw new Error(`${e.name} isn't pinned to a checked version in this build of Bob yet, so I won't download it. If it's already on your replicant matrix, I use that one.`);
  const { rel, asset } = await findRelease(e, nvidia, signal);
  const rtRe = nvidia && e.runtime(asset.name);
  const rt = rtRe ? (rel.assets || []).find((a) => rtRe.test(a.name)) : null;
  pub.total = asset.size + (rt?.size || 0);
  pub.done = 0;
  const folder = path.join(cfg.agentDir, e.dir);
  const stage = replacing ? folder + '.new' : folder;
  fs.rmSync(folder + '.new', { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  if (e.sha256) asset.pinnedSha256 = e.sha256; // old releases without a GitHub digest: checked against our own pin
  try {
    await grab(asset, stage, pub, signal, tick);
    if (rt) await grab(rt, stage, pub, signal, tick);
    flatten(stage, [e.exe, ...(e.aka || [])]);
    if (e.os === 'linux' && rt) liftLibraries(stage);
    if (e.os !== 'win') makeRunnable(stage);
  } catch (err) { if (replacing) fs.rmSync(stage, { recursive: true, force: true }); throw err; }
  if (replacing) {
    try { fs.rmSync(folder, { recursive: true, force: true }); fs.renameSync(stage, folder); }
    catch (err) { fs.rmSync(stage, { recursive: true, force: true }); throw new Error(`llama.cpp is in use right now (${err.code || err.message}). Press Unload everything (or wait for the brain to go idle), then Try again.`); }
  }
  if (!engineExe(cfg, e)) throw new Error(`${e.name} unpacked, but ${e.exe} isn't in it. The release layout may have changed.`);
  if (e.after) await e.after(cfg, { pub, tick, signal });
  // Older stable-diffusion.cpp builds call the program sd.exe.
  const sdCli = path.join(folder, exeName('sd-cli', e.os)), sdOld = path.join(folder, exeName('sd', e.os));
  if (e.id === 'sdcpp' && !fs.existsSync(sdCli) && fs.existsSync(sdOld)) fs.copyFileSync(sdOld, sdCli);
  try { fs.writeFileSync(path.join(folder, `bob-${e.id}.json`), JSON.stringify({ version: rel.tag_name, asset: asset.name, at: new Date().toISOString() }, null, 2)); } catch {}
  return { version: rel.tag_name, asset: asset.name };
}

// An engine that is a few files on top of another (Brain Engine on llama.cpp): the base engine's tested release and
// this engine's own release download into a side folder, the own files go on top, and the side folder takes the
// engine's place in one step. Both files are checked against GitHub's sha256 like every other engine.
async function installOverlay(cfg, e, { nvidia, pub, signal, tick }) {
  if (!e.tag) throw new Error(`${e.name} isn't pinned to a release in this build of Bob, so I won't download it.`);
  const b0 = engineFor(ENGINES.find((x) => x.id === e.base));
  const b = { ...b0, tag: b0.tested || b0.tag };
  if (!b.tag) throw new Error(`${e.name} needs ${b.name}'s tested build, and this Bob doesn't name one.`);
  const base = await findRelease(b, nvidia, signal);
  const own = await findRelease(e, nvidia, signal);
  if (!own.rel.prerelease && !own.rel.tag_name.startsWith('brain-engine-')) throw new Error(`${e.name}'s release isn't the one I expect. Stopped.`);
  const rtRe = nvidia && b.runtime(base.asset.name);
  const rt = rtRe ? (base.rel.assets || []).find((a) => rtRe.test(a.name)) : null;
  pub.total = base.asset.size + (rt?.size || 0) + own.asset.size; pub.done = 0;
  const folder = path.join(cfg.agentDir, e.dir), stage = folder + '.new';
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  try {
    await grab(base.asset, stage, pub, signal, tick);
    if (rt) await grab(rt, stage, pub, signal, tick);
    flatten(stage, [b.exe]);
    if (e.os === 'linux' && rt) liftLibraries(stage);
    const over = stage + '.own';
    fs.rmSync(over, { recursive: true, force: true }); fs.mkdirSync(over, { recursive: true });
    await grab(own.asset, over, pub, signal, tick);
    flatten(over, [e.exe]);
    fs.cpSync(over, stage, { recursive: true, force: true });
    fs.rmSync(over, { recursive: true, force: true });
    if (e.os !== 'win') makeRunnable(stage);
    if (!fs.existsSync(path.join(stage, e.exe))) throw new Error(`${e.name} unpacked, but ${e.exe} isn't in it. The release layout may have changed.`);
    fs.writeFileSync(path.join(stage, `bob-${e.id}.json`), JSON.stringify({ version: own.rel.tag_name, base: base.rel.tag_name, asset: own.asset.name, at: new Date().toISOString() }, null, 2));
  } catch (err) { fs.rmSync(stage, { recursive: true, force: true }); fs.rmSync(stage + '.own', { recursive: true, force: true }); throw err; }
  try { fs.rmSync(folder, { recursive: true, force: true }); fs.renameSync(stage, folder); }
  catch (err) { fs.rmSync(stage, { recursive: true, force: true }); throw new Error(`${e.name} is in use right now (${err.code || err.message}). Wait for the Lab job to finish, then try again.`); }
  return { version: own.rel.tag_name, asset: own.asset.name };
}

// LibreOffice: the official installer (pinned version and sha256) from TDF's archive, unpacked into Bob's folder
// with msiexec /a (an "administrative image": files only, no install, no admin rights, no Start menu entries).
async function installLibreOffice(cfg, { pub, signal, tick }) {
  const pin = PIN.libreoffice || {};
  if (!pin.version || !tdfAllowed(pin.url) || !/^[0-9a-f]{64}$/.test(pin.sha256 || '')) throw new Error('LibreOffice isn\'t pinned to a checked version in this build of Bob yet, so I won\'t download it. You can install it yourself from libreoffice.org (or use OpenOffice): I find either by myself.');
  const folder = path.join(cfg.agentDir, 'libreoffice');
  const tmp = path.join(cfg.agentDir, 'libreoffice-download');
  fs.mkdirSync(tmp, { recursive: true });
  pub.total = pin.bytes || 0; pub.done = 0;
  const msi = await grab({ name: path.basename(new URL(pin.url).pathname), browser_download_url: pin.url, size: pin.bytes, pinnedSha256: pin.sha256 }, tmp, pub, signal, tick, { allowed: tdfAllowed, unpack: false });
  pub.phase = 'unpacking'; tick();
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const sys = process.env.SystemRoot || 'C:\\Windows';
  await new Promise((resolve, reject) => execFile(path.join(sys, 'System32', 'msiexec.exe'), ['/a', msi, '/qn', `TARGETDIR=${folder}`], { windowsHide: true, timeout: 20 * 60_000 }, (err) => (err ? reject(new Error(`Windows couldn't unpack LibreOffice (${err.code ?? err.message}). You can install it from libreoffice.org instead: I find it by myself.`)) : resolve())));
  fs.rmSync(tmp, { recursive: true, force: true });
  const o = findOffice(cfg);
  if (!o || o.where !== 'own') throw new Error('LibreOffice unpacked, but soffice.exe isn\'t where I expected. You can install it from libreoffice.org instead: I find it by myself.');
  try { fs.writeFileSync(path.join(folder, 'bob-libreoffice.json'), JSON.stringify({ version: pin.version, asset: path.basename(pin.url), at: new Date().toISOString() }, null, 2)); } catch {}
  return { version: pin.version, asset: path.basename(pin.url) };
}
