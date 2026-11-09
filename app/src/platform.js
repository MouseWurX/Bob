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
export async function gpuInfo({ os_ = OS, execImpl = execFile, arch = process.arch, totalmem = os.totalmem(), cpu = os.cpus()?.[0]?.model || '', fresh = false } = {}) {
  if (os_ === 'mac') {
    if (arch !== 'arm64') return null; // Intel Macs: Bob runs on the processor
    const chip = (await run('sysctl', ['-n', 'machdep.cpu.brand_string'], 3000, execImpl))?.trim() || 'Apple Silicon';
    return { name: `${chip} (shared memory)`, vramGB: unifiedGraphicsGB(totalmem), unified: true };
  }
  const out = await run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], 5000, execImpl);
  const [name, mb] = (out || '').split('\n')[0].split(',').map((s) => s.trim());
  if (name) return { name, vramGB: Math.round(Number(mb) / 1024) };
  // 1.5.71: no NVIDIA card: graphics built into the processor (handhelds, thin laptops), like the Radeon 780M.
  return integratedGpu({ os_, execImpl, totalmem, cpu, fresh });
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
export async function integratedGpu({ os_ = OS, execImpl = execFile, totalmem = os.totalmem(), cpu = os.cpus()?.[0]?.model || '', fresh = false, readFile = fs.readFileSync, listDir = fs.readdirSync } = {}) {
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
  let val = null;
  if (chip) {
    // 1.5.126: the memory set aside for the graphics and the RAM really installed, read from the machine (below).
    const mem = await apuMemory({ os_, execImpl, chip, totalmem, readFile, listDir });
    const share = apuGraphicsGB({ installedBytes: mem.installed, visibleBytes: totalmem, reservedBytes: mem.reserved });
    val = { name: `${chip.replace(/\s*\(rev [^)]*\)$/, '')} (shared memory)`, vramGB: share.vramGB, unified: true, integrated: true, ...share };
  }
  integratedCache = { val };
  return val;
}

// ---- 1.5.126: how a handheld or laptop really shares its memory (asked for after a Legion Go showed RAM only) ----
// A chip with built-in graphics has one pool of memory. The BIOS (or Armoury Crate, Legion Space) sets some of it
// aside for the graphics alone ("UMA frame buffer": Auto, which is small, or 1 to 8 GB); Windows never sees that
// part, so os.totalmem() on a 16 GB Legion Go set to 8 GB reads 7.7 GB. On top of that the graphics can borrow
// about half of what Windows does see. Bob counts both as graphics memory, but only borrows while Windows keeps
// about 4 GB to itself (an 8 GB carve-out left Windows with 7.7 GB and the Go got unstable when more went).
export const APU_HEADROOM_GB = 4; // what Windows (or Linux) keeps for itself on a shared-memory machine
export function apuGraphicsGB({ installedBytes = 0, visibleBytes = os.totalmem(), reservedBytes = 0 } = {}) {
  const GB = 1024 ** 3;
  const visibleGB = visibleBytes / GB;
  const reservedGraphicsGB = Math.round(((reservedBytes || 0) / GB) * 10) / 10;
  const installedRamGB = shownRamGB(installedBytes > visibleBytes ? installedBytes : visibleBytes + (reservedBytes || 0)) || Math.round(visibleGB);
  // What the graphics may borrow from Windows's part: about half of it, and never into the last 4 GB.
  const borrowGB = Math.max(0, Math.min(Math.floor(visibleGB / 2), Math.floor(visibleGB - APU_HEADROOM_GB)));
  // Never less than the old estimate (half of what Windows sees), so nothing that fitted before stops fitting.
  const vramGB = Math.max(Math.floor(reservedGraphicsGB + borrowGB), sharedGraphicsGB(visibleBytes));
  // Under 2 GB set aside means "Auto": the graphics borrow as they go, which is the recommended setting on handhelds.
  return { vramGB, reservedGraphicsGB, installedRamGB, visibleRamGB: Math.round(visibleGB * 10) / 10, borrowGB, auto: reservedGraphicsGB < 2 };
}
// Windows: the display adapter's "HardwareInformation.qwMemorySize" (the set-aside, in bytes; older drivers only
// have the 32-bit MemorySize) from the display class in the registry, matched to the chip by its driver name, and
// installed RAM as the sum of the memory sticks (Win32_PhysicalMemory). Linux: amdgpu's mem_info_vram_total under
// /sys/class/drm; installed RAM is then what's visible plus the set-aside. Anything unreadable -> 0 (old estimate).
const APU_PS = `$k='HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}';` +
  `$a=@(Get-ChildItem $k -ErrorAction SilentlyContinue | ForEach-Object { $p=Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue; if ($p.DriverDesc) { [pscustomobject]@{ desc=[string]$p.DriverDesc; qw=[int64]($p.'HardwareInformation.qwMemorySize' -as [int64]); mem=[int64]($p.'HardwareInformation.MemorySize' -as [int64]) } } });` +
  `$i=[int64](Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue | Measure-Object -Property Capacity -Sum).Sum;` +
  `@{ installed=$i; adapters=$a } | ConvertTo-Json -Compress -Depth 3`;
export function parseApuJson(text, chip = '') {
  let j; try { j = JSON.parse(String(text || '').trim()); } catch { return { installed: 0, reserved: 0 }; }
  const adapters = [].concat(j?.adapters || []).filter(Boolean);
  const norm = (s) => String(s || '').toLowerCase().replace(/\(tm\)|\(r\)/g, '').replace(/\s+/g, ' ').trim();
  const bytes = (a) => { const q = Number(a.qw) || 0; const m = Number(a.mem) || 0; return q > 0 ? q : m > 0 && m < 0xFFF00000 ? m : 0 /* a 32-bit field at 0xFFFFFFFF has wrapped */; };
  const mine = adapters.find((a) => norm(a.desc) === norm(chip)) || adapters.find((a) => AMD_GPU.test(a.desc) || INTEL_GOOD.test(a.desc)) || (adapters.length === 1 ? adapters[0] : null);
  return { installed: Number(j?.installed) || 0, reserved: mine ? bytes(mine) : 0 };
}
export async function apuMemory({ os_ = OS, execImpl = execFile, chip = '', totalmem = os.totalmem(), readFile = fs.readFileSync, listDir = fs.readdirSync } = {}) {
  if (os_ === 'win') return parseApuJson(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', APU_PS], 10000, execImpl), chip);
  if (os_ === 'linux') {
    let reserved = 0;
    try {
      for (const c of listDir('/sys/class/drm').filter((n) => /^card\d+$/.test(n))) {
        try { reserved = Math.max(reserved, Number(String(readFile(`/sys/class/drm/${c}/device/mem_info_vram_total`, 'utf8')).trim()) || 0); } catch {}
      }
    } catch {}
    return { installed: totalmem + reserved, reserved };
  }
  return { installed: 0, reserved: 0 };
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
export const builtInWord = (name = '') => (/Radeon|\bAMD\b/i.test(name) ? 'Radeon' : /Arc/i.test(name) ? 'Arc' : /Iris/i.test(name) ? 'Iris Xe' : 'graphics');
// The second half of the line: set aside (4 GB, 8 GB) or Auto (small, borrowing as it goes).
export const apuSplitWords = (gpu = {}) => (gpu.auto || !(gpu.reservedGraphicsGB >= 2) ? 'shared with graphics as needed' : `${Number.isInteger(gpu.reservedGraphicsGB) ? gpu.reservedGraphicsGB : gpu.reservedGraphicsGB.toFixed(1)} GB set aside for graphics`);
export function specLine({ cpu, gpu, ramGB } = {}) {
  const parts = [];
  if (cpu) parts.push(cpu);
  // 1.5.126: a handheld or laptop names its chip's graphics and how its one pool of memory is split:
  // "Ryzen Z1 Extreme · Radeon built-in · 16 GB memory (8 GB set aside for graphics)", or "(shared with graphics as needed)".
  if (gpu?.integrated && gpu.installedRamGB) return [cpu, `${builtInWord(gpu.name)} built-in`, `${gpu.installedRamGB} GB memory (${apuSplitWords(gpu)})`].filter(Boolean).join(' · ');
  if (gpu?.unified) return [String(gpu.name || cpu || '').replace(/\s*\(shared memory\)$/, ''), ramGB ? `${ramGB} GB memory` : ''].filter(Boolean).join(' · ') || 'specs not read yet';
  if (gpu?.integrated) parts.push('built-in graphics');
  else if (gpu?.name) parts.push(`${String(gpu.name).replace(/^NVIDIA\s+/i, '').replace(/^GeForce\s+/i, '')}${gpu.vramGB ? ` ${gpu.vramGB} GB` : ''}`);
  if (ramGB) parts.push(`${ramGB} GB RAM`);
  return parts.length ? parts.join(' · ') : 'specs not read yet';
}
