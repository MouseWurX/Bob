// Bob.exe: double-click and Bob opens in his own window. No browser, no "install as an app", no PowerShell.
// His brain (src/server.js) runs inside this program; closing the window closes Bob.
// Where Bob keeps his things (models, notes, settings) lives outside the program, so updates never touch it:
//   1. home.json next to Bob.exe, or in %APPDATA%\Bob, can say { "agentDir": "...", "config": "..." }
//   2. otherwise a Bob folder Bob.exe sits inside (it has an "inn" folder), e.g. Agent 00\Bob app\Bob.exe
// Bob.exe is Electron's official electron.exe, only renamed; Bob's files are in Bob app\resources\app.
//   3. otherwise %LOCALAPPDATA%\Bob, with a fresh config.json made from config.example.json.
// On a Mac (Bob.app, the same official Electron renamed, Bob's files in Bob.app/Contents/Resources/app) step 3 is
// ~/Library/Application Support/Bob/home, and on Linux ~/.local/share/bob (src/platform.js defaultHome).
const { app, BrowserWindow, shell, Menu, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// Before anything else: the name decides Bob's user-data folder (and so the single-instance lock), and the
// id matches the Start menu shortcut, so the taskbar shows Bob's icon rather than Electron's.
app.setName('Bob');
app.setAppUserModelId('ca.mousewurx.bob');
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

// 1.5.30: let Windows tell the page when Bob's window is fully covered (a full-screen game). The page then reads
// as hidden, so Now running stops its readings, and starts them again as soon as Bob can be seen. Electron leaves
// this off by default; it costs nothing (Windows already tracks which windows are covered).
app.commandLine.appendSwitch('enable-features', 'CalculateNativeWinOcclusion');

const root = path.join(__dirname, '..');
const MAC = process.platform === 'darwin';

// A Mac app opened from Finder or the Dock gets a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin), so programs from
// Homebrew (FFmpeg, Ollama, Python) wouldn't be found. Add the usual places, after what's already there.
if (MAC) {
  const have = String(process.env.PATH || '').split(':').filter(Boolean);
  for (const d of ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin']) if (!have.includes(d)) have.push(d);
  process.env.PATH = have.join(':');
}
const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);

function readHome() {
  for (const f of [path.join(exeDir, 'home.json'), path.join(app.getPath('appData'), 'Bob', 'home.json')]) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  }
  return {};
}

// Bob.exe sitting somewhere inside an existing Bob folder (one with an "inn"), like Agent 00\Bob app or
// bob\dist\win-unpacked: use that folder, so no home.json is needed.
function findNearbyHome() {
  let dir = exeDir;
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, 'inn')) && fs.statSync(path.join(dir, 'inn')).isDirectory()) {
      const cfgFile = [path.join(dir, 'bob', 'config.json'), path.join(dir, 'config.json')].find((f) => fs.existsSync(f));
      return { agentDir: dir, ...(cfgFile ? { config: cfgFile } : {}) };
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return {};
}

async function setUpHome() {
  let home = readHome();
  if (!home.agentDir) home = { ...findNearbyHome(), ...home };
  const { defaultHome } = await import(pathToFileURL(path.join(root, 'src', 'platform.js')).href);
  const agentDir = home.agentDir || (process.platform === 'win32' && !process.env.LOCALAPPDATA ? path.join(app.getPath('userData'), 'Bob') : defaultHome());
  fs.mkdirSync(agentDir, { recursive: true });
  const config = home.config || path.join(agentDir, 'config.json');
  if (!fs.existsSync(config)) fs.copyFileSync(path.join(root, 'config.example.json'), config);
  process.env.BOB_AGENT_DIR = agentDir;
  if (home.source) process.env.BOB_SOURCE = home.source; // the folder Bob.exe was built from, for "Update Bob"
  process.env.BOB_APP_DIR = exeDir;
  process.env.BOB_CONFIG = config;
  let port = 7777;
  try { port = Number(JSON.parse(fs.readFileSync(config, 'utf8')).port) || 7777; } catch {}
  return { agentDir, config, port };
}

// "Launch Bob on start-up" (off unless turned on in his settings) uses Windows' own login items.
// "Update Bob": the update window asks Bob to close (POST /api/quit) before it swaps in the new Bob.exe.
globalThis.bobQuit = () => setTimeout(() => app.quit(), 200);

// An update left waiting ("Later"): a new Bob in resources\app.new (and sometimes a new Electron in
// runtime.new) next to this one. Hand over to the update window, which waits for this Bob to close,
// swaps them in and opens Bob again. Renamed to *.pending first, so a failed swap can't loop.
// Bob.exe is Electron's own unchanged exe; only Bob's files change (Smart App Control trusts the exe).
function handOverToNewBob() {
  if (process.platform !== 'win32' || !app.isPackaged) return false;
  const waiting = [[path.join(exeDir, 'resources', 'app.new'), 'app.pending'], [path.join(exeDir, 'runtime.new'), 'runtime.pending']].filter(([p]) => fs.existsSync(p));
  const home = readHome();
  const script = home.source && path.join(home.source, 'installer', 'bob-build-window.ps1');
  if (!waiting.length || !script || !fs.existsSync(script)) return false;
  try {
    for (const [p, to] of waiting) fs.renameSync(p, path.join(path.dirname(p), to));
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-Mode', 'swap', '-Source', home.source];
    if (home.agentDir) args.push('-BobHome', home.agentDir);
    args.push('-AppDir', exeDir);
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ELECTRON_|NODE_OPTIONS$|CHROME_)/i.test(k)));
    // Through "cmd /c start" so PowerShell gets a console of its own (a detached one has none and quits).
    const q = (x) => `"${String(x).replace(/"/g, '')}"`;
    const line = `"start "Bob update" /min ${q(ps)} ${args.map(q).join(' ')}"`;
    require('node:child_process').spawn(process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), ['/d', '/s', '/c', line], { cwd: home.source, detached: false, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, env }).unref();
    return true;
  } catch { return false; }
}

// 1.5.49 (PC check): on Windows the start-up entry is matched with its arguments, so reading it without '--hidden'
// said "off" while Bob was really set to start. Read and clear both forms, so the switch always tells the truth.
const { loginItem } = require('./login-item.cjs');
globalThis.bobLoginItem = loginItem(app);

// Bob's brain runs in this program, so it uses Electron for Open, Show in folder and Copy. The brain checks
// every path first (src/files.js): only the inn folder and folders Bob may read, never secrets or programs.
globalThis.bobShell = {
  openPath: (f) => shell.openPath(f),
  showItemInFolder: (f) => shell.showItemInFolder(f),
  copy: (text) => clipboard.writeText(String(text))
};

// Right-click: the usual Cut, Copy, Paste and Select all, plus links and pictures.
function contextMenu(win, base) {
  win.webContents.on('context-menu', (e, p) => {
    const items = [];
    const sel = (p.selectionText || '').trim();
    if (p.isEditable) items.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy }, { role: 'paste', enabled: p.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' });
    else if (sel) items.push({ role: 'copy' });
    if (p.linkURL) {
      const web = /^https?:/.test(p.linkURL) && !p.linkURL.startsWith(base);
      if (items.length) items.push({ type: 'separator' });
      if (web) items.push({ label: 'Open link in browser', click: () => shell.openExternal(p.linkURL) });
      items.push({ label: 'Copy link', click: () => clipboard.writeText(p.linkURL) });
    }
    if (p.mediaType === 'image' && p.srcURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push({ label: 'Copy image', click: () => win.webContents.copyImageAt(p.x, p.y) }, { label: 'Save image as…', click: () => win.webContents.downloadURL(p.srcURL) });
    } else if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push({ label: `Save ${p.mediaType === 'video' ? 'clip' : 'sound'} as…`, click: () => win.webContents.downloadURL(p.srcURL) });
    }
    if (sel && !p.isEditable) {
      items.push({ type: 'separator' }, { label: `Search the web for "${sel.length > 30 ? sel.slice(0, 30) + '…' : sel}"`, click: () => shell.openExternal('https://duckduckgo.com/?q=' + encodeURIComponent(sel.slice(0, 300))) });
    }
    if (!p.isEditable) { if (items.length) items.push({ type: 'separator' }); items.push({ role: 'selectAll' }); }
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  // "Save as…" always asks where.
  win.webContents.session.on('will-download', (e, item) => { item.setSaveDialogOptions({ title: 'Save as' }); });
}

async function up(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

let win = null;
// A Mac needs a menu bar: without one, Copy, Paste, Undo and Quit (Cmd+C, Cmd+V, Cmd+Z, Cmd+Q) don't work.
// Windows and Linux keep Bob's window free of a menu, as before.
function macMenu() {
  return Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' }
  ]);
}

async function start() {
  Menu.setApplicationMenu(MAC ? macMenu() : null);
  if (handOverToNewBob()) { app.quit(); return; }
  let home;
  try { home = await setUpHome(); } catch (e) { dialog.showErrorBox('Bob', `Bob couldn't set up his folder: ${e.message}`); app.quit(); return; }
  // An older Bob (from before Bob.exe) may already be running on the port: use it rather than fight it.
  if (!(await up(home.port))) {
    try { await import(pathToFileURL(path.join(root, 'src', 'server.js')).href); }
    catch (e) { dialog.showErrorBox('Bob', `Bob's brain wouldn't start: ${e.message}`); app.quit(); return; }
    for (let i = 0; i < 80 && !(await up(home.port)); i++) await new Promise((r) => setTimeout(r, 250));
  }
  win = new BrowserWindow({
    width: 1200, height: 820, minWidth: 360, minHeight: 480,
    title: 'Bob', icon: path.join(root, 'public', 'icons', process.platform === 'win32' ? 'bob.ico' : 'bob-512.png'),
    backgroundColor: '#1d1510', autoHideMenuBar: true, show: !process.argv.includes('--hidden'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  const base = `http://127.0.0.1:${home.port}`;
  // Links to the web open in the normal browser; Bob's window only ever shows Bob.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(base)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // The microphone (voice notes, "Hey Bob") and notifications are the only permissions Bob's page gets.
  win.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'notifications'].includes(perm) && wc.getURL().startsWith(base)));
  contextMenu(win, base);
  win.loadURL(base + '/');
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
// Mac: clicking Bob in the Dock brings his window back (it may have been started hidden at login).
app.on('activate', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.whenReady().then(start);
