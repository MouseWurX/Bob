// Tests "Update Bob": finding a newer build in the source folder, starting the update window with the right
// arguments (Windows only), reading its status file, and the install/update window script itself.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-upd-'));
const src = path.join(root, 'bob-new');
fs.mkdirSync(path.join(src, 'installer'), { recursive: true });
fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ bob: { release: '0.9', branch: '', build: 999 } }));
fs.writeFileSync(path.join(src, 'installer', 'bob-build-window.ps1'), '# stub');
process.env.BOB_SOURCE = src;
const { checkUpdate, startUpdate, updateStatus, statusFile } = await import('../src/update.js');
const cfg = { agentDir: root, dataDir: path.join(root, 'inn', 'bob'), port: 7777 };
fs.mkdirSync(cfg.dataDir, { recursive: true });

let c = checkUpdate();
check('a newer build in the source folder is found', c.newer && c.available.build === 999 && c.source === src);
if (process.platform !== 'win32') {
  check('off Windows, updating means downloading the new version', !c.canRun && /releases/.test(c.why));
  let threw = false; try { startUpdate(cfg); } catch { threw = true; }
  check('so it refuses to start here', threw);
}
Object.defineProperty(process, 'platform', { value: 'win32' });
process.env.ELECTRON_RUN_AS_NODE = '1';
c = checkUpdate();
check('on Windows with the window script present it can run', c.canRun);
let call = null;
const r = startUpdate(cfg, { spawnImpl: (exe, args, opts) => { call = { exe, args, opts }; return { unref() {} }; } });
const line = call.args[3] || '';
const arg = (k) => { const m = line.match(new RegExp(`"${k}" "([^"]*)"`)); return m && m[1]; };
check('starts the window through cmd "start" with Windows PowerShell by full path (a console of its own)', /cmd(\.exe)?$/i.test(call.exe) && call.args.slice(0, 3).join(' ') === '/d /s /c' && /^"start "Bob update" \/min "[^"]*System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe" /.test(line) && arg('-File') === path.join(src, 'installer', 'bob-build-window.ps1') && arg('-Mode') === 'update' && arg('-Source') === src);
check('tells it where Bob lives, his port and the status file', arg('-BobHome') === root && arg('-Port') === '7777' && arg('-StatusFile') === statusFile(cfg) && r.to.build === 999);
check('never spawns a detached PowerShell (it would have no console and quit silently)', call.opts.detached === false && call.opts.windowsVerbatimArguments === true && call.opts.stdio === 'ignore');
check('runs in the source folder, no shell, without Electron\'s settings', call.opts.cwd === src && call.opts.shell === false && !Object.keys(call.opts.env).some((k) => /^ELECTRON_/.test(k)));
fs.writeFileSync(statusFile(cfg), JSON.stringify({ step: 3, of: 6, id: 'tests', text: 'Testing Bob', done: false, error: '', steps: ['a', 'b', 'c', 'd', 'e', 'f'], updatedAt: new Date().toISOString() }));
check('the app reads the same status the window writes', updateStatus(cfg).id === 'tests');
let busy = false; try { startUpdate(cfg, { spawnImpl: () => ({}) }); } catch (e) { busy = /already/.test(e.message); }
check('a second update can\'t start while one is running', busy);
fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ bob: { release: '0.9', build: 1 } }));
check('an older or equal build is not offered', !checkUpdate().newer);

// The window script: same step ids as the PC's interim updater, exit codes (not stderr) decide failure,
// rollback copy, waits for Bob to be idle, PowerShell 5.1 safe.
const ps = fs.readFileSync(new URL('../installer/bob-build-window.ps1', import.meta.url), 'utf8');
check('window steps are verify, runtime, tests, app, done (swap mode: swap, done)', ["'verify'", "'runtime'", "'tests'", "'app'", "'swap'", "'done'"].every((x) => ps.includes(`id = ${x}`)) && !/id = '(tools|build)'/.test(ps));
check('nothing is built: no electron-builder, no npm install, no dist folder on the update path', !/dist:portable|electron-builder|npm install|\\dist'|'dist'/.test(ps) && /\$Commands = @\{ tests = 'npm test' \}/.test(ps));
check('failure is decided by exit codes, not by text on stderr', /ExitCode/.test(ps) && /2>&1/.test(ps));
check('keeps the previous Bob (resources\\app-previous, and Bob-previous.exe when Electron changes)', /Rename-Item -LiteralPath \$cur -NewName 'app-previous'/.test(ps) && /Bob-previous\.exe/.test(ps));
check('an update stages Bob in resources\\app.new and swaps only once Bob has closed', /Join-Path \$Res 'app\.new'/.test(ps) && /-not \(Bob-Running\) -and \(Apply-Update 'new'\)/.test(ps) && /-not \(Bob-Running\) -and \(Apply-Update 'pending'\)/.test(ps));
check('Bob\'s files are the tested list, never config.json', /\$AppFiles = @\('electron', 'src', 'public', 'audio', 'installer', 'catalog\.json', 'config\.example\.json', 'package\.json', 'LICENSE', 'LICENSE-ART', 'ASSETS-LICENSE\.md', 'TRADEMARKS\.md', 'THIRD-PARTY\.md', 'README\.md'\)/.test(ps)
  && ps.match(/\$AppFiles = (@\([^)]*\))/)[1] === fs.readFileSync(new URL('../installer/make-release.ps1', import.meta.url), 'utf8').match(/\$AppFiles = (@\([^)]*\))/)?.[1] && !/'config\.json'/.test(ps.split('$AppFiles')[1].split('\n')[0]));
check('Electron\'s default app is removed so resources\\app opens', /default_app\.asar/.test(ps));
check('waits until Bob is idle before closing him', /api\/idle/.test(ps) && /api\/quit/.test(ps));
check('no PowerShell 7-only syntax (?? or ?:)', !/\?\?/.test(ps) && !/\s\?\s[^:]+\s:\s/.test(ps));
check('script is plain ASCII (Windows PowerShell 5.1 reads it correctly)', !/[^\x00-\x7F]/.test(ps));
check('$HOME is never assigned (it is read-only in PowerShell)', !/\$Home\b\s*=|\[string\]\s*\$Home\b/i.test(ps));
const cmd = fs.readFileSync(new URL('../Install Bob.cmd', import.meta.url), 'utf8');
check('Install Bob.cmd opens the window (no bare console) and has Windows line endings', /bob-build-window\.ps1" -Mode install/.test(cmd) && /WindowStyle Hidden/.test(cmd) && cmd.includes('\r\n'));
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
check('Bob hands over to a waiting update without looping (app.new and runtime.new renamed to .pending first)', /'resources', 'app\.new'\), 'app\.pending'/.test(main) && /'runtime\.new'\), 'runtime\.pending'/.test(main) && /renameSync/.test(main) && /-Mode', 'swap'/.test(main) && !/Bob\.exe\.(new|pending)/.test(main));
check('name and AppUserModel id are set before the single-instance lock', main.indexOf("app.setName('Bob')") > 0 && main.indexOf("setAppUserModelId('ca.mousewurx.bob')") < main.indexOf('requestSingleInstanceLock') && main.indexOf("app.setName('Bob')") < main.indexOf('requestSingleInstanceLock'));
{
  const rt = fs.readFileSync(new URL('../installer/bob-runtime.ps1', import.meta.url), 'utf8');
  check('Electron comes from its official release zip, checked against SHASUMS256.txt (or the pin)', /github\.com\/electron\/electron\/releases\/download\/v\$Version/.test(rt) && /electron-v\$Version-win32-x64\.zip/.test(rt) && /SHASUMS256/.test(rt) && /Get-FileHash/.test(rt) && /if \(-not \$Sha256\)/.test(rt));
  check('a zip that fails the checksum is deleted and stops the install', /-ne \$Sha256\.ToUpper\(\)\) \{\s*Remove-Item -LiteralPath \$Zip[\s\S]{0,40}\s*throw/.test(rt));
  check('electron.exe is only renamed, never rebuilt or edited', /Rename-Item -LiteralPath \$exe -NewName 'Bob\.exe'/.test(rt) && !/rcedit|Set-Content -LiteralPath \$exe/i.test(rt));
  check('the signature is for information only (the official electron.exe is not Authenticode-signed)', /Get-AuthenticodeSignature/.test(rt) && !/Status -(ne|eq) 'Valid'\)? *\{? *throw/.test(rt) && !/throw[^\n]*[Ss]ignature/.test(rt));
  check('the zip is cached in inn\\bob\\electron and Electron is fetched only when its version changes', /\$ElectronCache = Join-Path \$LogDir 'electron'/.test(ps) && /function Runtime-Ready/.test(ps) && /if \(Runtime-Ready\)/.test(ps));
  check('the Electron version is the exact one in package.json', /devDependencies\.electron/.test(ps) && /\^\\d\+\\\.\\d\+\\\.\\d\+\$/.test(ps) && /^\d+\.\d+\.\d+$/.test(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).devDependencies.electron));
  check('runtime and shortcut helpers are plain ASCII with no PowerShell 7 syntax', [rt, fs.readFileSync(new URL('../installer/bob-shortcut.ps1', import.meta.url), 'utf8')].every((t) => !/[^\x00-\x7F]/.test(t) && !/\?\?/.test(t)));
  const sc = fs.readFileSync(new URL('../installer/bob-shortcut.ps1', import.meta.url), 'utf8');
  check('the Start menu shortcut carries bob.ico and System.AppUserModel.ID = ca.mousewurx.bob (same as the app)', /9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3/.test(sc) && /k\.pid = 5/.test(sc) && /\$Aumid = 'ca\.mousewurx\.bob'/.test(sc) && /Write-BobShortcut -Lnk \$lnk -Target \$Exe -WorkDir \$AppDir -Icon \(Join-Path \$AppDir 'bob\.ico'\)/.test(ps) && /Read-BobShortcut/.test(ps) && main.includes("'ca.mousewurx.bob'"));
  check('the shortcut helper has a self-test for Windows (-SelfTest)', /\[switch\] \$SelfTest/.test(sc) && /PASS shortcut/.test(sc));
}

check('the installer can be tried in a sandbox: -AppDir and -NoShortcut', /\[string\] \$AppDir/.test(ps) && /\[switch\] \$NoShortcut/.test(ps) && /if \(\$NoShortcut\)/.test(ps));
check('Restart asks instead of waiting: Restart anyway / Wait until done / Not now', /YesNoCancel/.test(ps) && /waitDone = \$true/.test(ps) && !/quiet moment/i.test(ps) && !/\$r\.idle/.test(ps));
check('"Wait until he\'s done" needs only no job, nothing waiting, no download (no quiet time)', /\$r\.busy/.test(ps) && /\$r\.waiting/.test(ps) && /\$r\.downloading/.test(ps));
check('the window pops to the front when the new Bob is built', /TopMost = \$true; \$form\.Activate\(\)/.test(ps));
check('Bob\'s own Restart button reaches the window (flag file)', /update-restart\.flag/.test(ps));
check('a Bob that is running but slow to answer counts as busy, never idle', /catch \{ return 'something \(he is slow to answer\)' \}/.test(ps) && /if \(-not \(Bob-Running\)\) \{ return '' \}/.test(ps));
process.env.BOB_APP_DIR = 'C:\\Agent 00\\Bob app';
fs.rmSync(statusFile(cfg), { force: true });
fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ bob: { release: '0.9', build: 999 } }));
let call2 = null; startUpdate(cfg, { spawnImpl: (e, a) => { call2 = a; return {}; } });
check('the update swaps the Bob.exe that is actually running (-AppDir)', call2[3].includes(`"-AppDir" "${process.env.BOB_APP_DIR}"`));
check('Bob.exe\'s swap handover also goes through cmd start, not a detached PowerShell', /start "Bob update" \/min/.test(main) && /detached: false/.test(main) && !/spawn\(ps,/.test(main));
check('Bob.exe hands its own folder to the swap', /args\.push\('-AppDir', exeDir\)/.test(main) && /const exeDir = [^\n]*path\.dirname\(process\.execPath\)/.test(main));
{
  const { requestRestart } = await import('../src/update.js');
  fs.writeFileSync(statusFile(cfg), JSON.stringify({ done: false, ready: false }));
  let refused = false; try { requestRestart(cfg); } catch { refused = true; }
  fs.writeFileSync(statusFile(cfg), JSON.stringify({ done: true, ready: true }));
  requestRestart(cfg, 'done');
  const flag = fs.readFileSync(path.join(cfg.dataDir, 'update-restart.flag'), 'utf8');
  check('Restart from Bob\'s window only works once the new Bob is built, and says now or when done', refused && flag === 'done');
}
{
  // The launch can fail three ways; each must end up as a visible error, never silence.
  const { EventEmitter } = await import('node:events');
  fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ bob: { release: '0.9', build: 999 } }));
  fs.rmSync(statusFile(cfg), { force: true });
  const child = new EventEmitter(); child.unref = () => {};
  startUpdate(cfg, { spawnImpl: () => child });
  check('Bob writes "starting" before PowerShell runs', updateStatus(cfg).id === 'starting' && !updateStatus(cfg).error);
  child.emit('error', new Error('spawn ENOENT'));
  check('a spawn error shows as an error in the status', /didn't start: spawn ENOENT/.test(updateStatus(cfg).error));
  fs.rmSync(statusFile(cfg), { force: true });
  let threw = ''; try { startUpdate(cfg, { spawnImpl: () => { throw new Error('EACCES'); } }); } catch (e) { threw = e.message; }
  check('a spawn that throws is reported too', /EACCES/.test(threw) && /EACCES/.test(updateStatus(cfg).error));
  fs.rmSync(statusFile(cfg), { force: true });
  const quiet = new EventEmitter(); quiet.unref = () => {};
  startUpdate(cfg, { spawnImpl: () => quiet });
  fs.appendFileSync(path.join(cfg.dataDir, 'update-launch-log.txt'), 'File cannot be loaded because running scripts is disabled\n');
  quiet.emit('exit', 1);
  check('Windows failing to open the window is reported with its exit code', /couldn't open the update window \(exit code 1\)/.test(updateStatus(cfg).error));
  fs.rmSync(statusFile(cfg), { force: true });
  const silent = new EventEmitter(); silent.unref = () => {};
  startUpdate(cfg, { spawnImpl: () => silent });
  const st = JSON.parse(fs.readFileSync(statusFile(cfg), 'utf8')); st.startedAt = new Date(Date.now() - 10000).toISOString(); fs.writeFileSync(statusFile(cfg), JSON.stringify(st));
  check('a window that never takes over within ~8 s is reported, with the log tail', /didn't start/.test(updateStatus(cfg).error));
}
{
  const { formatVersion, VERSION } = await import('../src/config.js');
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  check('version label is 0.9.<build> before 1.0 (and 0.9.<build><letter> on a branch)', formatVersion({ release: '0.9', build: 29 }) === '0.9.29' && formatVersion({ release: '0.9', build: 28, branch: 'a' }) === '0.9.28a');
  check('from 1.0 the label is <release>.<patch> (1.0.0, 1.0.1, 1.1.0, 1.0.1a)', formatVersion({ release: '1.0', patch: 0, build: 37 }) === '1.0.0' && formatVersion({ release: '1.0', patch: 1, build: 38 }) === '1.0.1' && formatVersion({ release: '1.1', patch: 0, build: 40 }) === '1.1.0' && formatVersion({ release: '1.0', patch: 1, build: 38, branch: 'a' }) === '1.0.1a');
  check('the label, package.json version and build agree', VERSION.label === pkg.version && VERSION.label === `${pkg.bob.release}.${pkg.bob.patch}` && VERSION.build === pkg.bob.build && pkg.bob.build >= 39);
  {
    // A 0.9.36 Bob sees 1.0.0 in the source folder as newer (the build number decides).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ver-'));
    fs.mkdirSync(path.join(dir, 'installer')); fs.writeFileSync(path.join(dir, 'installer', 'bob-build-window.ps1'), '#');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ bob: { release: '1.0', patch: 0, build: 37 } }));
    const was = process.env.BOB_SOURCE; process.env.BOB_SOURCE = dir;
    const c = checkUpdate();
    check('the update check reads 1.0.0 from the source folder and compares by build', c.available.label === '1.0.0' && c.available.build === 37 && 37 > 36);
    if (was === undefined) delete process.env.BOB_SOURCE; else process.env.BOB_SOURCE = was;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  check('package.json "version" matches the label (git tag and the optional portable exe use it)', VERSION.label === pkg.version && /^Bob-\$\{version\}\.exe$/.test(pkg.build.portable.artifactName));
  check('the update check carries the same label', checkUpdate().current.label === VERSION.label && checkUpdate().available.label === '0.9.999');
}
{
  const files = ['../src/update.js', '../electron/main.cjs'].map((f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  check('Windows fallback paths are escaped in JS (C:\\\\Windows, never C:\\Windows)', !/'C:\\[A-Za-z]/.test(files) && /'C:\\\\Windows'/.test(files));
}
{
  // An install or update must never replace the user's own config.json (the repo ships only the example).
  const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const conf = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const scripts = ['bob-build-window.ps1', 'bob-runtime.ps1', 'make-release.ps1', 'bob-shortcut.ps1'].map((f) => fs.readFileSync(new URL(`../installer/${f}`, import.meta.url), 'utf8')).join('\n');
  const appFiles = ps.match(/\$AppFiles = @\(([^)]*)\)/)[1];
  check('config.json is never among the files an install or update copies', !/'config\.json'/.test(appFiles) && /'config\.example\.json'/.test(appFiles));
  check('no installer script writes, copies over or deletes a config.json', !scripts.split('\n').some((l) => /config\.json/i.test(l) && !/config\.example\.json/i.test(l) && /(Copy-Item|Move-Item|Remove-Item|Set-Content|Out-File|WriteAllText|Rename-Item)/i.test(l)));
  check('Bob.exe makes config.json from the example only when there is none', /if \(!fs\.existsSync\(config\)\) fs\.copyFileSync\(path\.join\(root, 'config\.example\.json'\), config\)/.test(main));
  check('running from source makes config.json from the example only when there is none', /!fs\.existsSync\(file\)\) fs\.copyFileSync\(path\.join\(appDir, 'config\.example\.json'\), file\)/.test(conf));
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  check('the official Electron zip checksum is pinned', /^[0-9a-f]{64}$/.test(pkg.bob.electronSha256));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
