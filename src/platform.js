// Which computer Bob is on, in one place (Mac and Linux support). Everything that differs between Windows,
// macOS and Linux asks here instead of testing process.platform itself: program names (.exe or not), where
// Bob's home folder goes, where a Python venv keeps python, stopping a program and all it started, the
// graphics memory reading, and which features exist at all on this computer.
// Shared with the Linux work: each function has a Windows, a Mac and a Linux answer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';

// 'win', 'mac' or 'linux'. BOB_PLATFORM overrides it for tests ('win32', 'darwin' and 'linux' also work).
export function osKey(platform = process.env.BOB_PLATFORM || process.platform) {
  if (platform === 'win32' || platform === 'win') return 'win';
  if (platform === 'darwin' || platform === 'mac') return 'mac';
  return 'linux';
}
export const OS = osKey();
export const isWin = OS === 'win';
export const isMac = OS === 'mac';
export const isLinux = OS === 'linux';

// The words Bob uses for this computer in what he says ("this PC" on Windows, "this Mac" on a Mac).
export function machineWord(os_ = OS) { return os_ === 'mac' ? 'Mac' : os_ === 'linux' ? 'computer' : 'PC'; }
// The file manager's name, for "Show in Explorer / Finder / Files".
export function fileManagerName(os_ = OS) { return os_ === 'mac' ? 'Finder' : os_ === 'linux' ? 'your file manager' : 'Explorer'; }

// A program's file name: llama-server.exe on Windows, llama-server elsewhere. A name that already ends in .exe
// loses it off Windows, so older settings (llama-server.exe) still find the right program.
export function exeName(base, os_ = OS) {
  const b = String(base || '').replace(/\.exe$/i, '');
  return os_ === 'win' ? `${b}.exe` : b;
}

// A program on the PATH (Linux and Mac: one the package manager installed), or null. No shell, nothing run.
export function onPath(name, env = process.env) {
  for (const dir of String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) {
    const p = path.join(dir, name);
    try { if (fs.statSync(p).isFile()) { fs.accessSync(p, fs.constants.X_OK); return p; } } catch {}
  }
  return null;
}

// Where a Python venv keeps its python: venv\Scripts\python.exe on Windows, venv/bin/python elsewhere.
export function venvPython(dir, os_ = OS) {
  return os_ === 'win' ? path.join(dir, 'Scripts', 'python.exe') : path.join(dir, 'bin', 'python');
}

// Bob's home (models, engines, his inn folder) on a fresh install, when nothing else says where.
//   Windows: %LOCALAPPDATA%\Bob
//   Mac:     ~/Library/Application Support/Bob/home (one folder to remove; Electron's own files sit beside it)
//   Linux:   $XDG_DATA_HOME/bob, or ~/.local/share/bob
export function defaultHome(env = process.env, os_ = OS, home = os.homedir()) {
  if (os_ === 'win') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Bob');
  if (os_ === 'mac') return path.join(home, 'Library', 'Application Support', 'Bob', 'home');
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'bob');
}

// Stops a program and everything it started. Windows: taskkill /T /F. Elsewhere: the whole process group when the
// program was started with detached: true (it leads its own group), else just the program.
export function killTree(child, { os_ = OS, spawnSyncImpl = spawnSync, kill = process.kill } = {}) {
  const pid = typeof child === 'number' ? child : child?.pid;
  if (!pid) return false;
  if (os_ === 'win') {
    spawnSyncImpl('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 15000 });
    return true;
  }
  try { kill(-pid, 'SIGKILL'); return true; } catch {}
  try { if (typeof child === 'object' && child.kill) child.kill('SIGKILL'); else kill(pid, 'SIGKILL'); return true; } catch { return false; }
}

// Options for spawn() so killTree can stop the whole group later: off Windows the program leads its own group.
export function groupSpawnOptions(os_ = OS) { return os_ === 'win' ? {} : { detached: true }; }

// Which features exist on which computer. Windows-only parts are hidden elsewhere instead of failing when used.
//   defender     Microsoft Defender scans and its alerts (Security and privacy Hand)
//   appsHand     using other apps' windows (installer/bob-apps.ps1, Windows UI Automation)
//   wakeTask     Windows Task Scheduler waking Bob for schedules (schedules inside Bob work everywhere)
//   gamingCard   the Gaming session's graphics card switch (reads NVIDIA cards; a Mac shares its memory)
//   updateBob    Update Bob from GitHub's newest release (everywhere), or from the source folder (Windows)
//   uninstall    the Remove Bob window (installer/bob-uninstall.ps1)
//   pcCheck      Check this PC's hardware tips (Windows' hardware lists)
//   ownEngines   Bob's own engine downloads (llama.cpp, stable-diffusion.cpp...)
export const FEATURES = {
  defender: ['win'],
  appsHand: ['win'],
  wakeTask: ['win'],
  gamingCard: ['win', 'linux'],
  updateBob: ['win', 'mac', 'linux'],
  uninstall: ['win'],
  pcCheck: ['win'],
  ownEngines: ['win', 'mac', 'linux']
};
export function supports(feature, os_ = OS) { return (FEATURES[feature] || []).includes(os_); }
export function features(os_ = OS) { return Object.fromEntries(Object.keys(FEATURES).map((k) => [k, supports(k, os_)])); }

// A Mac shares one pool of memory between the processor and the graphics. macOS lets the graphics use about
// two thirds of it (three quarters from 36 GB up), so that's what Bob counts as "graphics memory" for picking models.
export function unifiedGraphicsGB(totalBytes = os.totalmem()) {
  const gb = totalBytes / 1024 ** 3;
  return Math.floor(gb * (gb >= 36 ? 0.75 : 0.67));
}

function run(file, args, timeout = 4000, execImpl = execFile) {
  return new Promise((resolve) => {
    try { execImpl(file, args, { timeout, windowsHide: true, maxBuffer: 1 << 20 }, (err, out) => resolve(err ? null : String(out))); }
    catch { resolve(null); }
  });
}

// The graphics chip and its memory, for picking models: { name, vramGB, unified } or null.
//   Windows and Linux: nvidia-smi (ships with the NVIDIA driver).
//   Mac (Apple Silicon): the chip's name from sysctl, and its share of the shared memory.
export async function gpuInfo({ os_ = OS, execImpl = execFile, arch = process.arch, totalmem = os.totalmem() } = {}) {
  if (os_ === 'mac') {
    if (arch !== 'arm64') return null; // Intel Macs: Bob runs on the processor
    const chip = (await run('sysctl', ['-n', 'machdep.cpu.brand_string'], 3000, execImpl))?.trim() || 'Apple Silicon';
    return { name: `${chip} (shared memory)`, vramGB: unifiedGraphicsGB(totalmem), unified: true };
  }
  const out = await run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], 5000, execImpl);
  const [name, mb] = (out || '').split('\n')[0].split(',').map((s) => s.trim());
  if (name) return { name, vramGB: Math.round(Number(mb) / 1024) };
  // 1.5.71: no NVIDIA card: graphics built into the processor (handhelds, thin laptops), like the Radeon 780M.
  return integratedGpu({ os_, execImpl, totalmem });
}

// ---- 1.5.71: graphics built into the processor ----
// Windows lets built-in graphics borrow up to half the PC's memory, so that's what Bob counts as its "graphics memory".
// The engine already runs on it (the Vulkan build of llama.cpp is what Bob fetches without an NVIDIA card).
export function sharedGraphicsGB(totalBytes = os.totalmem()) { return Math.floor(totalBytes / 1024 ** 3 / 2); }
// A separate card next to it (AMD Radeon RX, Intel Arc A/B, NVIDIA): not handled here, so Bob stays on the processor.
const DISCRETE = /Radeon\s*(?:\(TM\)\s*)?(?:RX|Pro)\b|\bRX\s?\d{3,4}|Arc\s*(?:\(TM\)\s*)?[AB]\d{3}|NVIDIA|GeForce|Quadro/i;
// AMD's built-in graphics are worth using only in laptop and handheld chips (Z1/Z2, HS/H/HX/U, Ryzen AI). The tiny
// one in desktop Ryzen chips (like the 9800X3D) is slower than the processor itself, so it doesn't count.
const AMD_MOBILE_CPU = /Ryzen.*\b(?:Z\d\b|Z\d\s|AI\b|\d{4}(?:HS|HX|H|U)\b)|Ryzen\s+AI/i;
const AMD_GPU = /\bAMD\b|\bATI\b|Radeon/i;
// Intel: the newer Arc and Iris Xe graphics; the older UHD graphics are too slow to help.
const INTEL_GOOD = /Intel.*(?:Arc\s*(?:\(TM\)\s*)?Graphics|Iris)/i;
export function pickIntegrated(names = [], cpu = '') {
  const list = names.map((n) => String(n || '').trim()).filter(Boolean);
  if (!list.length || list.some((n) => DISCRETE.test(n))) return null;
  return list.find((n) => INTEL_GOOD.test(n)) || (AMD_MOBILE_CPU.test(cpu) ? list.find((n) => AMD_GPU.test(n)) : null) || null;
}
let integratedCache = null;
export async function integratedGpu({ os_ = OS, execImpl = execFile, totalmem = os.totalmem(), cpu = os.cpus()?.[0]?.model || '', fresh = false } = {}) {
  if (os_ !== 'win' && os_ !== 'linux') return null;
  if (integratedCache && !fresh) return integratedCache.val;
  let names = [];
  if (os_ === 'win') {
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_VideoController).Name'], 8000, execImpl);
    names = String(out || '').split(/\r?\n/);
  } else {
    const out = await run('lspci', [], 4000, execImpl);
    names = String(out || '').split('\n').filter((l) => /VGA compatible|Display controller|3D controller/i.test(l)).map((l) => l.replace(/^\S+\s+[^:]+:\s*/, ''));
  }
  const chip = pickIntegrated(names, cpu);
  const val = chip ? { name: `${chip.replace(/\s*\(rev [^)]*\)$/, '')} (shared memory)`, vramGB: sharedGraphicsGB(totalmem), unified: true, integrated: true } : null;
  integratedCache = { val };
  return val;
}

// Memory that's free to use right now, in bytes. Windows and Linux: os.freemem() (on Linux that is MemAvailable).
// A Mac: os.freemem() counts only pages nobody has touched, which is usually a few hundred MB even on an idle Mac,
// because macOS keeps recently used files in memory until something needs it. vm_stat's free, inactive,
// speculative and purgeable pages are what a new program can really get. The reading is kept for 5 seconds.
let macFree = { at: 0, bytes: 0 };
export function parseVmStat(text = '') {
  const page = Number((String(text).match(/page size of (\d+) bytes/) || [])[1]) || 16384;
  const n = (k) => Number((String(text).match(new RegExp(`Pages ${k}:\\s+(\\d+)`)) || [])[1]) || 0;
  return (n('free') + n('inactive') + n('speculative') + n('purgeable')) * page;
}
export function freeMemNow({ os_ = OS, now = Date.now(), run = () => spawnSync('/usr/bin/vm_stat', [], { encoding: 'utf8', timeout: 2000 }).stdout } = {}) {
  // Tests that are about something else set how much is free, so the computer running them doesn't decide.
  if (process.env.BOB_FREE_MEM_GB) return Number(process.env.BOB_FREE_MEM_GB) * 1024 ** 3;
  if (os_ !== 'mac') return os.freemem();
  if (now - macFree.at < 5000 && macFree.bytes) return macFree.bytes;
  let bytes = 0;
  try { bytes = parseVmStat(run()); } catch {}
  macFree = { at: now, bytes: bytes > 0 ? Math.min(bytes, os.totalmem()) : os.freemem() };
  return macFree.bytes;
}

// 1.5.89: the replicant matrix (the computer Bob runs on), named with its specs, as one short muted line:
// "Ryzen 7 9800X3D · RTX 5070 Ti 16 GB · 32 GB RAM", "Ryzen Z1 Extreme · built-in graphics · 32 GB RAM",
// "Apple M3 · 16 GB memory", or "specs not read yet".
export function cpuName(model = os.cpus()?.[0]?.model || '') {
  return String(model).trim().replace(/\((R|TM)\)/gi, '').replace(/\b(AMD|Intel)\s+/i, '').replace(/\s+(w\/|with)\s+Radeon.*$/i, '')
    .replace(/\s+\d+-Core\b.*$/i, '').replace(/\s+(CPU|Processor)\b.*$/i, '').replace(/\s+@.*$/, '').replace(/\s+/g, ' ').trim();
}
// RAM as it's sold: Windows reports a little under what's installed (31.1 for 32 GB), so the spec line shows the
// common size it's nearest to. Only for showing; the real number stays for the spill maths.
const RAM_SIZES = [2, 3, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128, 192, 256, 384, 512];
export function shownRamGB(totalBytes) {
  const gib = Number(totalBytes) / 1024 ** 3;
  if (!(gib > 0)) return null;
  return RAM_SIZES.find((n) => n >= gib - 0.05 && gib >= n * 0.85) || Math.ceil(gib);
}
export function specLine({ cpu, gpu, ramGB } = {}) {
  const parts = [];
  if (cpu) parts.push(cpu);
  if (gpu?.unified) return [String(gpu.name || cpu || '').replace(/\s*\(shared memory\)$/, ''), ramGB ? `${ramGB} GB memory` : ''].filter(Boolean).join(' · ') || 'specs not read yet';
  if (gpu?.integrated) parts.push('built-in graphics');
  else if (gpu?.name) parts.push(`${String(gpu.name).replace(/^NVIDIA\s+/i, '').replace(/^GeForce\s+/i, '')}${gpu.vramGB ? ` ${gpu.vramGB} GB` : ''}`);
  if (ramGB) parts.push(`${ramGB} GB RAM`);
  return parts.length ? parts.join(' · ') : 'specs not read yet';
}
