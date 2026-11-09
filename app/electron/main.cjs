// Bob.exe: double-click and Bob opens in his own window. No browser, no "install as an app", no PowerShell.
// His brain (src/server.js) runs inside this program; closing the window closes Bob, unless "Keep Bob in the tray"
// is on (1.5.94): then closing or minimising tucks him into the tray, and Quit Bob in the tray menu closes him fully.
// Where Bob keeps his things (models, notes, settings) lives outside the program, so updates never touch it:
//   1. home.json next to Bob.exe, or in %APPDATA%\Bob, can say { "agentDir": "...", "config": "..." }
//   2. otherwise a Bob folder Bob.exe sits inside (it has an "inn" folder), e.g. Bob home\Bob app\Bob.exe
// Bob.exe is Electron's official electron.exe, only renamed; Bob's files are in Bob app\resources\app.
//   3. otherwise %LOCALAPPDATA%\Bob, with a fresh config.json made from config.example.json.
// On a Mac (Bob.app, the same official Electron renamed, Bob's files in Bob.app/Contents/Resources/app) step 3 is
// ~/Library/Application Support/Bob/home, and on Linux ~/.local/share/bob (src/platform.js defaultHome).
const { app, BrowserWindow, shell, Menu, dialog, clipboard, screen, Tray, nativeImage, Notification } = require('electron');
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

// Linux AppImage: Chromium's sandbox needs unprivileged user namespaces, which Ubuntu 24.04+ (AppArmor) blocks for
// programs it doesn't know, and an AppImage can't carry the setuid helper. Without this Bob wouldn't open at all there.
// Only then is the extra sandbox switched off: Bob's window only ever shows Bob's own page from 127.0.0.1, with
// context isolation and no Node in the page, and links to the web open in the normal browser.
if (process.platform === 'linux' && process.env.APPIMAGE) {
  let blocked = false;
  try { blocked = fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'; } catch {}
  try { if (fs.readFileSync('/proc/sys/kernel/unprivileged_userns_clone', 'utf8').trim() === '0') blocked = true; } catch {}
  if (blocked) app.commandLine.appendSwitch('no-sandbox');
}

const root = path.join(__dirname, '..');
const MAC = process.platform === 'darwin';

// A Mac app opened from Finder or the Dock gets a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin), so programs from
// Homebrew (FFmpeg, Ollama, Python) wouldn't be found. Add the usual places, after what's already there.
if (MAC) {
  const have = String(process.env.PATH || '').split(':').filter(Boolean);
  for (const d of ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin']) if (!have.includes(d)) have.push(d);
  process.env.PATH = have.join(':');
}
// Linux: the AppImage file's own folder (APPIMAGE), not the read-only place it is mounted while it runs.
const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || (process.env.APPIMAGE && path.dirname(process.env.APPIMAGE)) || path.dirname(process.execPath);

function readHome() {
  for (const f of [path.join(exeDir, 'home.json'), path.join(app.getPath('appData'), 'Bob', 'home.json')]) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  }
  return {};
}

// Bob.exe sitting somewhere inside an existing Bob folder (one with an "inn"), like Bob home\Bob app or
// bob\app\dist\win-unpacked (one level deeper since the app-folder move, since Bob's files moved into the repository's app folder):
// use that folder, so no home.json is needed.
function findNearbyHome() {
  let dir = exeDir;
  for (let i = 0; i < 5; i++) {
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

// 1.5.125: which home.json Bob writes when his home is chosen or moved: the one next to Bob.exe if that folder
// can be written (a zip or portable Bob), else %APPDATA%\Bob\home.json (a pointer only; Bob's things aren't there).
function homeFile() {
  const here = path.join(exeDir, 'home.json');
  if (fs.existsSync(here)) return here;
  try { fs.accessSync(exeDir, fs.constants.W_OK); if (!MAC) return here; } catch {}
  return path.join(app.getPath('appData'), 'Bob', 'home.json');
}
function writeHome(home) {
  const f = homeFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(home, null, 1));
  return f;
}

// 1.5.125: a fresh Bob (no home.json, not inside a Bob folder, nothing at the old default) asks where to keep his
// things before anything is downloaded. Suggested: a Bob folder in the user's own folder, visible and never emptied
// by clean-up tools; AppData and the like are refused (src/home.js). Cancel keeps the suggestion.
async function askForHome(suggested, homeProblem, { synced, cloudWarning }) {
  for (;;) {
    const r = await dialog.showMessageBox({
      type: 'question', title: 'Where should Bob keep his things?', buttons: [`Use ${suggested}`, 'Pick another folder…'], defaultId: 0, cancelId: 0, noLink: true,
      message: 'Where should I keep my things?',
      detail: `My models, programs, notes and settings live in one folder, apart from the program, so updating me never touches them. Models are big (10 to 60 GB) and slow to download again, so the folder should be a real one of your own, not a temporary place like AppData, and not a cloud-synced folder (OneDrive, Dropbox, Google Drive, iCloud): I always recommend against those, because every model would be uploaded and a sync can break one while I'm using it.\n\nSuggested: ${suggested}\n\nYou can move it later in Settings, "Bob's home folder".`
    });
    if (r.response !== 1) return suggested;
    const pick = await dialog.showOpenDialog({ title: 'Pick a folder for Bob\'s things', buttonLabel: 'Keep my things here', properties: ['openDirectory', 'createDirectory', 'promptToCreate'], defaultPath: path.dirname(suggested) });
    if (pick.canceled || !pick.filePaths[0]) continue;
    let dir = pick.filePaths[0];
    // A folder with other things in it gets a Bob folder inside, so Bob's things stay separate.
    let why = homeProblem(dir);
    if (why && /other things in it/.test(why)) { dir = path.join(dir, 'Bob'); why = homeProblem(dir); }
    if (!why) {
      // A cloud-synced folder is allowed, but Bob says clearly that he recommends against it and offers to pick again.
      const cloud = synced(dir);
      if (!cloud) return dir;
      const w = await dialog.showMessageBox({ type: 'warning', title: 'Bob', message: `That's a ${cloud} folder`, detail: cloudWarning(cloud, 'me'), buttons: ['Pick another folder…', 'Use it anyway'], defaultId: 0, cancelId: 0, noLink: true });
      if (w.response === 1) return dir;
      continue;
    }
    await dialog.showMessageBox({ type: 'warning', title: 'Bob', message: 'Not that folder', detail: why, buttons: ['OK'], noLink: true });
  }
}

// 1.5.125: "Move Bob's things" (Settings) left a note in home.json: copy everything to the new folder, then point at it.
// The old folder is only removed once every file is across, so a power cut mid-way loses nothing.
async function finishMove(home, file) {
  const from = home.agentDir, to = home.moveTo;
  const note = (text) => { try { fs.writeFileSync(path.join(path.dirname(file), 'move-status.txt'), text); } catch {} };
  let box = null;
  try {
    box = new BrowserWindow({ width: 460, height: 180, resizable: false, minimizable: false, frame: true, title: 'Bob', autoHideMenuBar: true, webPreferences: { sandbox: true } });
    box.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="font:15px system-ui;background:#1d1510;color:#f1e9dc;padding:20px"><b>Moving my things…</b><p>From ${from}<br>to ${to}.</p><p>This takes a while with big models. Please leave me to it.</p></body>`));
  } catch {}
  try {
    fs.mkdirSync(to, { recursive: true });
    const same = path.parse(path.resolve(from)).root.toLowerCase() === path.parse(path.resolve(to)).root.toLowerCase();
    let moved = false;
    if (same) { try { fs.rmdirSync(to); fs.renameSync(from, to); moved = true; } catch {} } // same drive: one rename, instant
    if (!moved) {
      fs.cpSync(from, to, { recursive: true, preserveTimestamps: true, errorOnExist: false, force: true });
      // Every file across? Count and compare before anything is removed.
      const count = (d) => { let n = 0; const walk = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(x, e.name)); else n++; } }; walk(d); return n; };
      if (count(to) < count(from)) throw new Error('not every file came across');
    }
    const next = { ...home, agentDir: to };
    delete next.moveTo;
    if (next.config && path.resolve(next.config).toLowerCase().startsWith(path.resolve(from).toLowerCase() + path.sep)) next.config = path.join(to, path.relative(from, next.config));
    fs.writeFileSync(file, JSON.stringify(next, null, 1));
    if (!moved) fs.rmSync(from, { recursive: true, force: true });
    note(`moved ${from} -> ${to} at ${new Date().toISOString()}`);
    return next;
  } catch (e) {
    const next = { ...home };
    delete next.moveTo;
    fs.writeFileSync(file, JSON.stringify(next, null, 1));
    note(`move failed: ${e.message}`);
    dialog.showErrorBox('Bob', `I couldn't move my things to ${to}: ${e.message}\n\nEverything is still in ${from}, and I'll carry on from there. The half-copied folder can be deleted.`);
    return next;
  } finally { try { box?.close(); } catch {} }
}

async function setUpHome() {
  let home = readHome();
  if (!home.agentDir) home = { ...findNearbyHome(), ...home };
  const { defaultHome } = await import(pathToFileURL(path.join(root, 'src', 'platform.js')).href);
  const { suggestedHome, homeProblem, synced, cloudWarning } = await import(pathToFileURL(path.join(root, 'src', 'home.js')).href);
  if (home.agentDir && home.moveTo) home = await finishMove(home, homeFile());
  let agentDir = home.agentDir;
  // BOB_AGENT_DIR (a test start, the smoke checks on GitHub's machines): that folder, no question asked, nothing written.
  if (!agentDir && process.env.BOB_AGENT_DIR) agentDir = process.env.BOB_AGENT_DIR;
  if (!agentDir) {
    // Bobs from before 1.5.125 kept their things at the old default (%LOCALAPPDATA%\Bob and friends): those stay
    // where they are, with "Bob's home folder" in Settings to move them. A fresh Bob is asked.
    const old = process.platform === 'win32' && !process.env.LOCALAPPDATA ? path.join(app.getPath('userData'), 'Bob') : defaultHome();
    if (fs.existsSync(path.join(old, 'inn'))) agentDir = old;
    else {
      agentDir = await askForHome(suggestedHome(), (d) => homeProblem(d), { synced, cloudWarning });
      try { writeHome({ ...home, agentDir }); } catch (e) { dialog.showErrorBox('Bob', `I couldn't note where my things are (${e.message}). I'll use ${agentDir} this time.`); }
    }
  }
  fs.mkdirSync(agentDir, { recursive: true });
  // The brain's "Bob's home folder": a move is noted in home.json and done by this file at the next start.
  globalThis.bobHome = {
    file: homeFile(),
    move: (to) => { writeHome({ ...readHome(), agentDir, moveTo: to }); app.relaunch(); setTimeout(() => app.quit(), 400); }
  };
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
  let source = home.source;
  let script = source && path.join(source, 'installer', 'bob-build-window.ps1');
  if (!waiting.length) return false;
  // No source folder (Bob came from the GitHub zip and was updated from GitHub): the waiting Bob's own window,
  // copied out first, because the folder it's in is about to be renamed.
  if (!script || !fs.existsSync(script)) {
    const newApp = path.join(exeDir, 'resources', 'app.new');
    if (!fs.existsSync(path.join(newApp, 'installer', 'bob-build-window.ps1'))) return false;
    try {
      source = path.join(app.getPath('temp'), 'bob-swap');
      fs.rmSync(source, { recursive: true, force: true });
      fs.cpSync(path.join(newApp, 'installer'), path.join(source, 'installer'), { recursive: true });
      fs.copyFileSync(path.join(newApp, 'package.json'), path.join(source, 'package.json'));
      script = path.join(source, 'installer', 'bob-build-window.ps1');
    } catch { return false; }
  }
  try {
    for (const [p, to] of waiting) fs.renameSync(p, path.join(path.dirname(p), to));
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-Mode', 'swap', '-Source', source];
    if (home.agentDir) args.push('-BobHome', home.agentDir);
    args.push('-AppDir', exeDir);
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ELECTRON_|NODE_OPTIONS$|CHROME_)/i.test(k)));
    // Through "cmd /c start" so PowerShell gets a console of its own (a detached one has none and quits).
    const q = (x) => `"${String(x).replace(/"/g, '')}"`;
    const line = `"start "Bob update" /min ${q(ps)} ${args.map(q).join(' ')}"`;
    require('node:child_process').spawn(process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), ['/d', '/s', '/c', line], { cwd: source, detached: false, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true, env }).unref();
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
// 1.5.125: small pictures for the chest and Made by Bob (src/thumbs.js), shrunk by Electron's own image code,
// so no image library and no model is needed. PNG bytes, the longer side `size` pixels, or null.
globalThis.bobImage = {
  thumb: async (file, size = 192) => {
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    const small = width >= height ? img.resize({ width: Math.min(size, width), quality: 'good' }) : img.resize({ height: Math.min(size, height), quality: 'good' });
    return small.toPNG();
  }
};

// 1.5.177: the "pick a file" and "pick a folder" windows. Bob's brain runs in this program, so Electron's own picker
// opens on top of Bob's window. The old PowerShell helper could open behind Bob, or not show at all. Returns the
// path, or '' when cancelled. filters: [{ name, extensions }]; folder: true picks a folder (newFolder lets you make one).
globalThis.bobPick = async ({ title = '', filters, folder = false, newFolder = false } = {}) => {
  const owner = win && !win.isDestroyed() ? win : undefined;
  if (owner) { if (owner.isMinimized()) owner.restore(); if (!owner.isVisible()) owner.show(); owner.focus(); }
  const props = folder ? ['openDirectory', ...(newFolder ? ['createDirectory'] : [])] : ['openFile'];
  const r = await dialog.showOpenDialog(owner, { title, properties: props, ...(filters && !folder ? { filters } : {}) });
  return r.canceled || !r.filePaths?.length ? '' : r.filePaths[0];
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

// ---------- 1.5.94 the tray and Bob's icon ----------
// "Keep Bob in the tray" (on unless turned off since 1.5.134; off by default before): a tray icon (Windows: by the clock; Mac: the menu bar; Linux: the
// desktop's tray, where it has one). Closing or minimising his window hides it there; Quit Bob in its menu closes
// him fully. Started hidden at sign-in ("Launch Bob on start-up"), he always shows the tray icon, so there's a way in.
// "Use Bob's look as his icon" (on unless turned off since 1.5.134): the tray, taskbar/Dock and window icon show his
// avatar, redrawn the moment a look is saved (Style, or Equip Bob's "Change his look"). A shortcut pinned to the Windows
// taskbar may keep the usual icon: Windows draws pinned buttons from the shortcut, not from the window.
// The brain sends both switches and the pictures (src/app-icon.js windowState) at start-up and on every change.
const STARTED_HIDDEN = process.argv.includes('--hidden');
const iconFile = (f) => path.join(root, 'public', 'icons', f);
let winState = { tray: false, lookIcon: false, lookName: '', icons: null };
let tray = null;
let quitting = false;
app.on('before-quit', () => { quitting = true; });

function showBob() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function trayImage() {
  const ic = winState.icons;
  if (ic) {
    if (process.platform === 'linux') return nativeImage.createFromBuffer(ic[32]);
    const img = nativeImage.createEmpty();
    img.addRepresentation({ scaleFactor: 1, buffer: ic[16] });
    if (!MAC) img.addRepresentation({ scaleFactor: 1.5, buffer: ic[24] });
    img.addRepresentation({ scaleFactor: 2, buffer: ic[32] });
    return img;
  }
  if (process.platform === 'win32') return nativeImage.createFromPath(iconFile('bob.ico'));
  if (MAC) return nativeImage.createFromBuffer(fs.readFileSync(iconFile('bob-32.png')), { scaleFactor: 2 });
  return nativeImage.createFromPath(iconFile('bob-32.png'));
}
function bigImage() {
  return winState.icons ? nativeImage.createFromBuffer(winState.icons[256]) : nativeImage.createFromPath(iconFile(process.platform === 'win32' ? 'bob.ico' : 'bob-512.png'));
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Show Bob', click: showBob },
    { type: 'separator' },
    { label: 'Quit Bob (closes him fully)', click: () => { quitting = true; app.quit(); } }
  ]);
}

const wantTray = () => winState.tray || STARTED_HIDDEN;

function refreshWindowBits() {
  try {
    if (wantTray()) {
      if (!tray) {
        tray = new Tray(trayImage());
        tray.setContextMenu(trayMenu());
        tray.on('click', showBob); // Windows and Linux: a click opens him (Mac shows the menu)
      } else tray.setImage(trayImage());
      tray.setToolTip(MAC ? 'Bob' : 'Bob: click to open him, right-click to quit him');
    } else if (tray) { tray.destroy(); tray = null; }
    if (MAC) { if (app.dock) app.dock.setIcon(bigImage()); }
    else if (win) win.setIcon(winState.icons ? bigImage() : iconFile(process.platform === 'win32' ? 'bob.ico' : 'bob-512.png'));
  } catch (e) { console.error('Bob: tray or icon', e.message); }
}
globalThis.bobWindow = { apply: (s) => { winState = { ...winState, ...s }; refreshWindowBits(); } };

// The first time he goes to the tray, Bob says where he went and how to quit him (only once, ever).
function trayHint() {
  const flag = path.join(app.getPath('userData'), 'tray-hint-shown');
  if (fs.existsSync(flag)) return;
  try { fs.writeFileSync(flag, new Date().toISOString()); } catch {}
  const where = MAC ? 'up in the menu bar' : process.platform === 'win32' ? 'in the tray by the clock (it may be under the ^ arrow)' : 'in the tray';
  // Some Linux desktops (GNOME without an extension) show no tray at all: say how to get him back anyway.
  const linux = !MAC && process.platform !== 'win32' ? " If you don't see a tray icon, open Bob again from your apps menu to bring him back." : '';
  const content = `I'm still here, ${where}. Click me to open me again. To quit me fully, ${MAC ? 'click' : 'right-click'} my icon and pick Quit Bob.${linux}`;
  try {
    if (process.platform === 'win32' && tray) tray.displayBalloon({ title: 'Bob is still running', content, icon: trayImage() });
    else if (Notification.isSupported()) new Notification({ title: 'Bob is still running', body: content, silent: true }).show();
  } catch {}
}

function tuckAway(e) {
  if (quitting || !winState.tray || !tray || !win) return false;
  if (e) e.preventDefault();
  win.hide();
  trayHint();
  return true;
}
let mindWin = null; // 1.5.53: "Bob's thinking", opened from the chat page; nothing runs for it while it's closed

// Small, in the bottom-right corner of the screen Bob is on, so it sits beside a game or an editor.
function mindOptions(parent) {
  const area = screen.getDisplayMatching(parent.getBounds()).workArea;
  const width = 380, height = 480;
  return {
    width, height, minWidth: 260, minHeight: 200, x: area.x + area.width - width - 16, y: area.y + area.height - height - 16,
    title: 'Bob\'s thinking', icon: path.join(root, 'public', 'icons', process.platform === 'win32' ? 'bob.ico' : 'bob-512.png'), backgroundColor: '#1d1510',
    autoHideMenuBar: true, alwaysOnTop: true, minimizable: true, maximizable: false, fullscreenable: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  };
}

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
    // Bob's own browser window for the Browser hand (src/hands-browser.js reads globalThis.bobBrowser).
    try { globalThis.bobBrowser = require('./browser-window.cjs').makeBobBrowser({ base: `http://127.0.0.1:${home.port}`, icon: path.join(root, 'public', 'icons', process.platform === 'win32' ? 'bob.ico' : 'bob-512.png') }); } catch (e) { console.error(`Bob's browser window isn't available: ${e.message}`); }
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
  // 1.5.53: the one exception is "Bob's thinking", his own small window that stays on top (one at a time).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === base + '/mind.html') {
      if (mindWin) { mindWin.show(); mindWin.focus(); return { action: 'deny' }; }
      return { action: 'allow', overrideBrowserWindowOptions: mindOptions(win) };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child) => {
    mindWin = child;
    child.setAlwaysOnTop(true, 'floating'); // above other windows, but not above Windows' own menus
    child.setMenu(null);
    child.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    child.webContents.on('will-navigate', (e, url) => { if (url !== base + '/mind.html') e.preventDefault(); });
    contextMenu(child, base);
    child.on('closed', () => { mindWin = null; });
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(base)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // The microphone (voice notes, "Hey Bob") and notifications are the only permissions Bob's page gets.
  win.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'notifications'].includes(perm) && wc.getURL().startsWith(base)));
  contextMenu(win, base);
  win.loadURL(base + '/');
  // 1.5.94: with "Keep Bob in the tray" on, the X and the minimise button tuck him into the tray instead.
  win.on('close', (e) => { tuckAway(e); });
  if (!MAC) win.on('minimize', () => { tuckAway(); });
  refreshWindowBits();
  win.on('closed', () => { win = null; if (mindWin) mindWin.close(); }); // closing Bob closes his thinking window too
}

app.on('second-instance', showBob); // opening Bob again (Start menu, a shortcut) brings his window back, tray or not
// Mac: clicking Bob in the Dock brings his window back (it may have been started hidden at login).
app.on('activate', showBob);
app.on('window-all-closed', () => app.quit());
app.whenReady().then(start);
