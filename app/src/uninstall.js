// "Remove Bob": takes Bob off this PC after a confirm. What goes:
//   - the Start menu shortcut (Bob.lnk) and the "Launch on start-up" login item, if it was on
//   - the program folder (Bob app: Bob.exe, Electron's files and resources\app)
//   - Electron's window data for Bob (%APPDATA%\Bob)
//   - only if ticked: Bob's own data folder (inn\bob: chats, settings, task list, saved samples) and the
//     models Bob downloaded (models\bob). The rest of the inn (notice board, logbook, pictures, other agents'
//     files) is never removed.
//   - the optional "Bob schedules" Windows task, if it was switched on
// Never touched: the source folder, the rest of the home folder (other apps' files in it), Ollama, ComfyUI.
// Bob can't delete his own running program, so a small window (installer\bob-uninstall.ps1, copied to
// %TEMP% first) waits for him to close and then does it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { appDir } from './config.js';
import { launchCommand, cleanEnv } from './update.js';
import { removeTaskCommand } from './schedules.js';

const strictlyInside = (a, b) => Boolean(a && b) && path.resolve(a).toLowerCase().startsWith(path.resolve(b).toLowerCase() + path.sep);
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// The program folder: Bob.exe next to resources\app (this very copy of Bob).
export function programDir(env = process.env) {
  const d = env.BOB_APP_DIR || '';
  return d && fs.existsSync(path.join(d, 'Bob.exe')) && isDir(path.join(d, 'resources', 'app')) ? d : '';
}

export function plan(cfg, env = process.env) {
  const app = programDir(env);
  const appData = env.APPDATA || '';
  const shortcut = appData ? path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Bob.lnk') : '';
  const electronData = appData ? path.join(appData, 'Bob') : '';
  // Only Bob's own subfolders, each strictly inside a folder they belong to, and never a protected one.
  const data = cfg.dataDir || (cfg.innDir ? path.join(cfg.innDir, 'bob') : '');
  const inn = isDir(data) && path.basename(data).toLowerCase() === 'bob' && strictlyInside(data, cfg.innDir) && safeToRemove(data, cfg, { source: env.BOB_SOURCE || '' }) ? data : '';
  const models = isDir(cfg.bobModelsDir) && path.basename(cfg.bobModelsDir).toLowerCase() === 'bob' && path.basename(path.dirname(cfg.bobModelsDir)).toLowerCase() === 'models' && safeToRemove(cfg.bobModelsDir, cfg, { source: env.BOB_SOURCE || '' }) ? cfg.bobModelsDir : '';
  const canRun = process.platform === 'win32' && Boolean(app);
  return {
    app, shortcut: shortcut && fs.existsSync(shortcut) ? shortcut : '', electronData: isDir(electronData) ? electronData : '', inn, models, canRun,
    why: canRun ? '' : process.platform !== 'win32' ? 'Removing Bob works on Windows.' : 'Bob is running from source (not from an installed Bob.exe), so there is no program folder to remove. Delete the folder by hand.'
  };
}

// Never remove a folder that holds the source, the inn, the models or the folder Bob's home is in.
export function safeToRemove(dir, cfg, { source = '' } = {}) {
  if (!dir) return false;
  const r = path.resolve(dir).toLowerCase();
  const inside = (a, b) => a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep);
  const keep = [cfg.agentDir, source, appDir.includes(`${path.sep}resources${path.sep}app`) ? '' : appDir, os.homedir(), process.env.SystemRoot || 'C:\\Windows', path.parse(r).root].filter(Boolean).map((p) => path.resolve(p).toLowerCase());
  // The program folder may sit inside the home (Bob home\Bob app), but the home itself, or anything above it, never goes.
  return !keep.some((k) => r === k || inside(k, r));
}

export function startUninstall(cfg, { notes = false, models = false } = {}, { spawnImpl = spawn, env = process.env, source = env.BOB_SOURCE || '' } = {}) {
  const p = plan(cfg, env);
  if (!p.canRun) throw new Error(p.why);
  if (!safeToRemove(p.app, cfg, { source })) throw new Error(`Won't remove ${p.app}: it holds more than Bob's program.`);
  const script = path.join(appDir, 'installer', 'bob-uninstall.ps1');
  if (!fs.existsSync(script)) throw new Error('The removal window (installer\\bob-uninstall.ps1) is missing.');
  // From %TEMP%, so it isn't inside the folder it removes.
  const tmp = path.join(os.tmpdir(), `bob-uninstall-${crypto.randomUUID().slice(0, 8)}.ps1`);
  fs.copyFileSync(script, tmp);
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', tmp, '-AppDir', p.app, '-Port', String(cfg.port || 7777)];
  if (p.electronData) args.push('-ElectronData', p.electronData);
  if (notes && p.inn) args.push('-Inn', p.inn);
  if (models && p.models) args.push('-Models', p.models);
  // The opt-in "Bob schedules" task must not outlive Bob (it would only find no Bob.exe, but still).
  // A missing task is fine; this never blocks the removal.
  try {
    const [sx, sargs] = removeTaskCommand(env);
    const t = spawnImpl(sx, sargs, { shell: false, windowsHide: true, stdio: 'ignore' });
    t?.on?.('error', () => {});
    t?.unref?.();
  } catch { /* no task to remove */ }
  const [exe, ...cargs] = launchCommand(args);
  const child = spawnImpl(exe, cargs, { cwd: os.tmpdir(), detached: false, shell: false, windowsHide: true, windowsVerbatimArguments: true, stdio: 'ignore', env: cleanEnv(env) });
  child?.unref?.();
  return { ok: true, removes: { schedule: true, app: p.app, shortcut: Boolean(p.shortcut), electronData: p.electronData, inn: notes ? p.inn : '', models: models ? p.models : '' } };
}
