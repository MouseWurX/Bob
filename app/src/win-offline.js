// Nov 23 2026: the Windows sandbox for commands while Web is off (src/win-offline.cs, an AppContainer with no network).
// Bob builds bob-offline.exe from that file with the C# compiler that comes with Windows (.NET Framework 4's csc.exe),
// into his data folder, the first time it's needed and again whenever the file changes. Nothing is downloaded.
//
// An AppContainer sees none of your folders until one is granted to it, so the folder a command runs in is granted
// (change) and the program's own folder (read) before it runs; Bob says which on the command's card.
//
// WIN_SANDBOX_READY: true since the live check (test/win-offline-live.mjs) passed on a real Windows laptop, Nov 23 2026.
// Set it false to make strict commands refuse to run on Windows instead (src/hands.js), never run unprotected.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const WIN_SANDBOX_READY = true; // Nov 23 2026: passed the live check on a real Windows laptop (13 of 13, no admin)
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'win-offline.cs');

export function compilerPath(env = process.env, exists = fs.existsSync) {
  const win = env.WINDIR || env.SystemRoot || 'C:\\Windows';
  for (const fw of ['Framework64', 'Framework']) { const p = path.win32.join(win, 'Microsoft.NET', fw, 'v4.0.30319', 'csc.exe'); if (exists(p)) return p; }
  return '';
}
export const exePath = (cfg) => path.join(cfg.dataDir, 'bin', 'bob-offline.exe');
const srcHash = () => crypto.createHash('sha256').update(fs.readFileSync(SRC)).digest('hex').slice(0, 16);

// The sandbox program, built if it's missing or out of date. '' when it can't be built here.
export function ensureSandbox(cfg, { run = spawnSync, csc = compilerPath() } = {}) {
  const exe = exePath(cfg), stamp = `${exe}.src`;
  let want; try { want = srcHash(); } catch { return ''; }
  try { if (fs.existsSync(exe) && fs.readFileSync(stamp, 'utf8').trim() === want) return exe; } catch {}
  if (!csc) return '';
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  const r = run(csc, ['/nologo', '/optimize+', '/platform:anycpu', '/target:exe', `/out:${exe}`, SRC], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (r.status !== 0 || !fs.existsSync(exe)) return '';
  fs.writeFileSync(stamp, want);
  return exe;
}

// Let the sandbox use a folder: 'change' for where the command works, 'read' for the program's own folder.
export function grantFolder(exe, dir, mode = 'change', { run = spawnSync } = {}) {
  const r = run(exe, ['grant', dir, mode === 'change' ? 'change' : 'read'], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return r.status === 0;
}

// How a command starts inside it (hands-run.js offlinePlan).
export const sandboxPlan = (exe, cwd, plan) => ({ ...plan, file: exe, args: ['run', cwd, '--', plan.file, ...plan.args], verbatim: false });
