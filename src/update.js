// "Update Bob": test the newest Bob from the source folder he came from and copy his files in next to the
// running ones, in the same window the installer uses (installer\bob-build-window.ps1), then swap them in
// when the user says "Restart Bob now". Bob.exe itself (Electron's official, unchanged exe) stays as it is,
// so Smart App Control never sees a new program.
// Checking for a newer build only happens by itself if the user turns that on; updating always takes a click.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { appDir, VERSION, formatVersion } from './config.js';

// The source folder: home.json's "source" (passed on by Bob.exe), or this folder when Bob runs from source.
export function sourceDir() {
  // Inside Bob.exe, appDir is Bob app\resources\app: a copy, never the source.
  const s = process.env.BOB_SOURCE || (process.versions.electron || /app\.asar/.test(appDir) ? '' : appDir);
  return s && fs.existsSync(path.join(s, 'package.json')) ? s : '';
}

export const statusFile = (cfg) => path.join(cfg.dataDir, 'update-status.json');

function versionOf(dir) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const v = { release: String(p.bob?.release || ''), branch: String(p.bob?.branch || ''), build: Number(p.bob?.build) || 0, ...(p.bob?.patch !== undefined ? { patch: Number(p.bob.patch) || 0 } : {}) };
    return { ...v, label: formatVersion(v) };
  } catch { return null; }
}

export function checkUpdate() {
  const source = sourceDir();
  const available = source ? versionOf(source) : null;
  const current = { release: VERSION.release, branch: VERSION.branch || '', build: Number(VERSION.build) || 0, label: VERSION.label };
  const newer = Boolean(available && available.build > current.build);
  const script = source && path.join(source, 'installer', 'bob-build-window.ps1');
  return {
    current, available, newer, source: source || null,
    canRun: process.platform === 'win32' && Boolean(script && fs.existsSync(script)),
    // A Mac or Linux Bob is a download, not a build: the new version comes from the same page as the first one.
    why: process.platform === 'darwin' ? 'On a Mac, Bob updates by downloading the newest Bob for Mac from github.com/MouseWurX/Bob/releases and replacing the old one in Applications. Your chats, settings and models stay where they are.' : process.platform !== 'win32' ? 'On this computer, Bob updates by downloading the newest version from github.com/MouseWurX/Bob/releases. Your chats, settings and models stay where they are.' : !source ? 'Bob doesn\'t know which folder he was built from. Run Install Bob.cmd from the new source folder once.' : ''
  };
}

const launchLog = (cfg) => path.join(cfg.dataDir, 'update-launch-log.txt');
const writeStatus = (cfg, st) => { try { fs.mkdirSync(path.dirname(statusFile(cfg)), { recursive: true }); fs.writeFileSync(statusFile(cfg), JSON.stringify(st, null, 1)); } catch {} };
const tail = (f, n = 6) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim()).slice(-n).join('\n'); } catch { return ''; } };

export function updateStatus(cfg) {
  let st = null;
  try { st = JSON.parse(fs.readFileSync(statusFile(cfg), 'utf8')); } catch { return null; }
  // Bob wrote "starting" and the window never took over: say so, with what PowerShell printed.
  if (st?.id === 'starting' && !st.error && Date.now() - Date.parse(st.startedAt || 0) > 8000) {
    st = { ...st, error: `The update window didn't start within 8 seconds. Windows started: ${tail(launchLog(cfg), 1) || '(nothing logged)'}` };
    writeStatus(cfg, st);
  }
  return st;
}

// Windows PowerShell by its full path: Bob.exe's PATH can differ from a normal window's.
export function powershellExe() {
  return path.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

// cmd /d /s /c "start "Bob update" /min "<powershell>" <args>", every argument quoted for cmd.
export function launchCommand(args) {
  const q = (x) => `"${String(x).replace(/"/g, '')}"`;
  const comspec = process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
  return [comspec, '/d', '/s', '/c', `"start "Bob update" /min ${q(powershellExe())} ${args.map(q).join(' ')}"`];
}

// Electron's own settings must not leak into PowerShell (or any node/npm it starts for the build).
export function cleanEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!/^(ELECTRON_|NODE_OPTIONS$|NODE_CHANNEL_FD$|ORIGINAL_XDG_|CHROME_)/i.test(k)) out[k] = v;
  return out;
}

export function startUpdate(cfg, { spawnImpl = spawn } = {}) {
  const c = checkUpdate();
  if (!c.canRun) throw new Error(c.why || 'The update window isn\'t in the source folder.');
  const st = updateStatus(cfg);
  // A window that wrote in the last 30 seconds and hasn't finished is still at work.
  if (st && !st.done && !st.error && st.id !== 'starting' && Date.now() - Date.parse(st.updatedAt || 0) < 30e3) throw new Error('An update is already running.');
  const now = new Date().toISOString();
  writeStatus(cfg, { mode: 'update', step: 0, of: 5, id: 'starting', text: 'Starting the update window...', done: false, error: '', steps: [], startedAt: now, updatedAt: now });
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(c.source, 'installer', 'bob-build-window.ps1'),
    '-Mode', 'update', '-Source', c.source, '-BobHome', cfg.agentDir, '-StatusFile', statusFile(cfg), '-Port', String(cfg.port || 7777)];
  // Swap the Bob.exe that's actually running, wherever it lives.
  if (process.env.BOB_APP_DIR) args.push('-AppDir', process.env.BOB_APP_DIR);
  try { fs.writeFileSync(launchLog(cfg), `${now} ${launchCommand(args).join(' ')}\n`); } catch {}
  const fail = (msg) => writeStatus(cfg, { mode: 'update', step: 0, of: 5, id: 'starting', text: msg, done: false, error: msg, steps: [], startedAt: now, updatedAt: new Date().toISOString() });
  let running;
  try {
    // Through "cmd /c start": PowerShell gets its own console (a detached PowerShell has none and quits
    // silently in Windows PowerShell 5.1) and outlives Bob. The script's -WindowStyle Hidden hides it.
    const [exe, ...cargs] = launchCommand(args);
    running = spawnImpl(exe, cargs, { cwd: c.source, detached: false, shell: false, windowsHide: true, windowsVerbatimArguments: true, stdio: 'ignore', env: cleanEnv() });
  } catch (e) { fail(`The update window didn't start: ${e.message}`); throw new Error(`The update window didn't start: ${e.message}`); }
  running?.on?.('error', (e) => fail(`The update window didn't start: ${e.message}`));
  running?.on?.('exit', (code) => { const s2 = updateStatus(cfg); if (code && s2?.id === 'starting') fail(`Windows couldn't open the update window (exit code ${code}).`); });
  // If the window never takes over, say so even when nobody is looking at Settings.
  const watch = setTimeout(() => updateStatus(cfg), 9000); watch.unref?.();
  running?.unref?.();
  return { ok: true, from: c.current, to: c.available };
}

// Bob's own "Restart now" / "When he's done" buttons: the update window picks this up within a second.
export function requestRestart(cfg, when = 'now') {
  const st = updateStatus(cfg);
  if (!st?.ready) throw new Error('There is no new Bob ready to switch to yet.');
  fs.writeFileSync(path.join(path.dirname(statusFile(cfg)), 'update-restart.flag'), when === 'done' ? 'done' : 'now');
  return { ok: true, when: when === 'done' ? 'done' : 'now' };
}
