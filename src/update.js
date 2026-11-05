// "Update Bob": the newest Bob comes from GitHub (the Latest release on github.com/MouseWurX/Bob, see
// github-update.js), or from the source folder he was built from when that holds a newer build. A source build is
// tested, then his files are copied in next to the running ones, in the same window the installer uses
// (installer\bob-build-window.ps1); a GitHub download is already tested and checked against its .sha256, so the
// window only puts it in place (-Prebuilt). "Restart Bob now" swaps them in. Bob.exe itself (Electron's official,
// unchanged exe) stays as it is, so Smart App Control never sees a new program.
// Checking for a newer build only happens by itself if the user turns that on; updating always takes a click.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { appDir, VERSION, formatVersion } from './config.js';
import { latestRelease, compareVersions, selfUpdate, startGithubUpdate, restartIntoNew, restartWhenIdle, hasGithubSwap, RELEASES_PAGE } from './github-update.js';
import { cleanEnv } from './github-update.js';

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
    why: process.platform === 'darwin' ? 'On a Mac, Bob updates by downloading the newest Bob for Mac from github.com/MouseWurX/Bob/releases and replacing the old one in Applications. Your chats, settings and models stay where they are.' : process.platform !== 'win32' ? 'On Linux, Bob updates by downloading the newest Bob AppImage from github.com/MouseWurX/Bob/releases and putting it in place of the old one (if you turned on "Launch Bob on start-up", switch it off and on once so it points at the new file). Your chats, settings and models stay where they are.' : !source ? 'Bob doesn\'t know which folder he was built from. Run Install Bob.cmd from the new source folder once.' : ''
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
export { cleanEnv }; // one list of variables a new Bob mustn't inherit (github-update.js)

// "Check for updates": the source folder (as before) and GitHub's Latest release. Whichever is newer wins;
// a tie goes to the source folder (it's the one on this PC). If GitHub can't be reached, the source folder
// still answers and `githubError` says why.
export async function checkAll(opts = {}) {
  const local = checkUpdate();
  const current = local.current;
  // A Mac or Linux GitHub update that's downloaded and waiting for "Restart Bob now".
  if (process.platform !== 'win32' && hasGithubSwap()) return { ...local, waiting: true, newer: false, why: '' };
  let gh = null, githubError = '';
  try { gh = await latestRelease(opts); } catch (e) { githubError = e.message; }
  const ghNewer = Boolean(gh && compareVersions(gh.label, current.label) > 0);
  const srcNewer = local.newer;
  const useGithub = ghNewer && (!srcNewer || compareVersions(gh.label, local.available?.label) > 0);
  const github = gh && { label: gh.label, page: gh.page, file: gh.asset?.name || '', sizeMB: gh.asset ? Math.round(gh.asset.size / 1e6) : 0, newer: ghNewer, why: gh.why };
  if (useGithub) {
    const can = selfUpdate(opts.env, opts.platform, opts.execPath, 'electron' in opts ? opts.electron : process.versions.electron);
    const why = gh.why || (can.ok ? '' : can.why);
    return { ...local, from: 'github', available: { label: gh.label }, sourceLabel: local.available?.label || '', newer: true, canRun: !why, why, github, githubError };
  }
  return { ...local, from: srcNewer ? 'source' : '', why: srcNewer ? local.why : '', github, githubError, page: RELEASES_PAGE };
}

// "Update Bob": from GitHub or the source folder, whichever checkAll picked.
export async function startAny(cfg, opts = {}) {
  const c = await checkAll(opts);
  if (!c.newer) throw new Error(`You already have the newest Bob (${c.current.label}).`);
  if (!c.canRun) throw new Error(c.why || 'I can\'t update myself here.');
  if (c.from === 'github') {
    const r = await startGithubUpdate(cfg, { ...opts, handOff: (source) => startUpdate(cfg, { ...opts, source, prebuilt: true }) });
    return { ...r, from: c.current, to: c.available, via: 'github' };
  }
  return { ...startUpdate(cfg, opts), via: 'source' };
}

export function startUpdate(cfg, { spawnImpl = spawn, source = '', prebuilt = false } = {}) {
  const c = source ? { canRun: process.platform === 'win32' && fs.existsSync(path.join(source, 'installer', 'bob-build-window.ps1')), source, current: checkUpdate().current, available: versionOf(source), why: 'The downloaded Bob has no update window in it.' } : checkUpdate();
  if (!c.canRun) throw new Error(c.why || 'The update window isn\'t in the source folder.');
  const st = updateStatus(cfg);
  // A window that wrote in the last 30 seconds and hasn't finished is still at work.
  if (!prebuilt && st && !st.done && !st.error && st.id !== 'starting' && Date.now() - Date.parse(st.updatedAt || 0) < 30e3) throw new Error('An update is already running.');
  const now = new Date().toISOString();
  writeStatus(cfg, { mode: 'update', ...(prebuilt ? { source: 'github' } : {}), step: 0, of: 5, id: 'starting', text: 'Starting the update window...', done: false, error: '', steps: [], startedAt: now, updatedAt: now });
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(c.source, 'installer', 'bob-build-window.ps1'),
    '-Mode', 'update', '-Source', c.source, '-BobHome', cfg.agentDir, '-StatusFile', statusFile(cfg), '-Port', String(cfg.port || 7777)];
  // A GitHub release is already tested (GitHub runs every check before publishing it): no Node.js or tests needed.
  if (prebuilt) args.push('-Prebuilt');
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
// On a Mac or Linux a GitHub update is swapped in by Bob himself (github-update.js); `isBusy` says whether he's
// still working, for "Wait until I'm done".
export function requestRestart(cfg, when = 'now', { isBusy = () => false } = {}) {
  if (process.platform !== 'win32' && hasGithubSwap()) return when === 'done' ? restartWhenIdle(cfg, isBusy) : restartIntoNew(cfg);
  const st = updateStatus(cfg);
  if (!st?.ready) throw new Error('There is no new Bob ready to switch to yet.');
  fs.writeFileSync(path.join(path.dirname(statusFile(cfg)), 'update-restart.flag'), when === 'done' ? 'done' : 'now');
  return { ok: true, when: when === 'done' ? 'done' : 'now' };
}
