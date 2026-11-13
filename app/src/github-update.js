// "Update Bob" from GitHub: the newest release on github.com/MouseWurX/Bob (the one marked Latest), the file for
// this computer (the Windows zip, the Mac zip or the Linux AppImage), checked against the .sha256 file next to it
// (and GitHub's own checksum when it gives one) before anything is used.
//   Windows  unpack the zip, then the usual update window (installer\bob-build-window.ps1 -Prebuilt) puts the new
//            Bob next to the old one; "Restart Bob now" swaps them, as with an update from the source folder.
//   Mac      unpack Bob.app, check its signature is intact (codesign --verify; the build is signed on its own,
//            "ad-hoc", not with a paid Apple account), then swap it in for the running Bob.app on restart. If the
//            app's folder can't be written to, the checked Bob.app is shown in Finder to drag over by hand.
//   Linux    the new AppImage goes next to the running one, takes its place on restart (the old one is kept as
//            <name>.previous), and opens again.
//            A .deb Bob (installed in /opt/Bob) gets the new .deb; on restart, once he has closed, the desktop asks
//            for the password (pkexec), apt installs it over the old one, and he opens again.
//            A Flatpak Bob gets the new .flatpak; on restart, once he has closed, Flatpak installs it over the old
//            one for this user (or the whole computer, whichever it was) and opens him again.
// Only ever on a click ("Check for updates", "Update Bob"), or at start-up if "Check for updates at start"
// is on, and then only to look. Nothing is downloaded or installed without a click.
import { deadline as withDeadline, quietGuard } from './hang-guard.js'; // item 212
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { hostAllowed } from './models.js';
import { unzip } from './zip.js';

export const REPO = 'MouseWurX/Bob';
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

// "v1.5.58", "1.5.58", even the "v.1.0.0" typo: the three numbers, or null.
export function parseVersion(s) {
  const m = String(s || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

// Bob's Flatpak id, the same as his app id everywhere else.
export const FLATPAK_ID = 'ca.mousewurx.bob';
// The .deb puts Bob in /opt/Bob (electron-builder's layout); dpkg's list of the package's files proves it came from the .deb.
export const DEB_DIR = '/opt/Bob';
export const DEB_PACKAGE = 'bob';

// How this Linux Bob was installed: 'flatpak', 'appimage', 'deb', or '' (run from source, or another way).
export function linuxPackage(env = process.env, execPath = process.execPath, exists = fs.existsSync) {
  if (env.FLATPAK_ID === FLATPAK_ID) return 'flatpak';
  if (env.APPIMAGE) return 'appimage';
  if (path.posix.dirname(String(execPath)) === DEB_DIR && exists(`/var/lib/dpkg/info/${DEB_PACKAGE}.list`)) return 'deb';
  return '';
}

// The release file names on Linux, per kind of package and processor (electron-builder's own names for each).
const LINUX_FILES = {
  appimage: { x64: 'x86_64.AppImage', arm64: 'arm64.AppImage' },
  deb: { x64: 'amd64.deb', arm64: 'arm64.deb' },
  flatpak: { x64: 'x86_64.flatpak', arm64: 'aarch64.flatpak' }
};
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Which release file fits this computer, and whether this Bob can swap itself for it. On Linux `pkg` (linuxPackage)
// picks the same kind of file this Bob came as; the AppImage when it's not known.
export function platformAsset(platform = process.platform, arch = process.arch, pkg = 'appimage') {
  if (platform === 'win32') return arch === 'x64' || arch === 'arm64' ? { kind: 'win', re: /^Bob-.+-win-x64\.zip$/ } : null;
  if (platform === 'darwin') return arch === 'arm64' ? { kind: 'mac', re: /^Bob-.+-mac-arm64\.zip$/ } : null;
  if (platform === 'linux') {
    const kind = LINUX_FILES[pkg] ? pkg : 'appimage';
    const tail = LINUX_FILES[kind][arch];
    if (!tail) return null;
    return { kind: kind === 'appimage' ? 'linux' : kind, re: new RegExp(`^Bob-.+-linux-${reEsc(tail)}$`) };
  }
  return null;
}

// The running Mac app bundle (…/Bob.app), or '' when Bob isn't running as an app.
export function macBundle(execPath = process.execPath) {
  const m = String(execPath).match(/^(.*?\.app)\/Contents\/MacOS\/[^/]+$/);
  return m ? m[1] : '';
}

// Can this Bob put a downloaded release in place by himself? Says why not, in words, when he can't.
export function selfUpdate(env = process.env, platform = process.platform, execPath = process.execPath, electron = process.versions.electron, exists = fs.existsSync) {
  if (platform === 'win32') return env.BOB_APP_DIR && electron ? { ok: true } : { ok: false, why: 'I\'m running from source here, not from Bob.exe, so there\'s no Bob.exe for me to update. Get the new source, or install the zip from ' + RELEASES_PAGE + '.' };
  if (platform === 'darwin') return macBundle(execPath) ? { ok: true } : { ok: false, why: 'I\'m not running as Bob.app here, so there\'s nothing for me to swap. Download the Mac zip from ' + RELEASES_PAGE + '.' };
  if (platform === 'linux') {
    const pkg = linuxPackage(env, execPath, exists);
    if (pkg === 'appimage') return { ok: true };
    if (pkg === 'deb') return exists('/usr/bin/pkexec') ? { ok: true } : { ok: false, why: 'I was installed from the .deb, and putting a new one in needs your password, but this computer has no pkexec to ask for it. Download the new .deb from ' + RELEASES_PAGE + ' and open it, or run: sudo apt install ./Bob-<version>-linux-amd64.deb' };
    if (pkg === 'flatpak') return { ok: true };
    return { ok: false, why: 'I\'m not running as an AppImage, a .deb or a Flatpak here, so there\'s nothing for me to swap. Download Bob from ' + RELEASES_PAGE + '.' };
  }
  return { ok: false, why: 'There\'s no Bob for this kind of computer on GitHub yet.' };
}

// The Latest release and the file for this computer. Throws in plain words when GitHub can't be reached.
export async function latestRelease({ fetchImpl = fetch, signal, platform = process.platform, arch = process.arch, env = process.env, execPath = process.execPath, exists = fs.existsSync } = {}) {
  let res;
  try { res = await fetchImpl(API, { headers: { 'user-agent': 'Bob', accept: 'application/vnd.github+json' }, signal: withDeadline(signal, 30_000) }); } // item 212
  catch { throw new Error(`Couldn't reach GitHub (no internet?). Try again later, or download the newest release from github.com/${REPO}/releases.`); }
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'GitHub says I\'ve asked too often for now. Try again in an hour.' : `GitHub didn't answer (${res.status}). Try again in a few minutes.`);
  const rel = await res.json();
  const label = (parseVersion(rel.tag_name) || []).join('.');
  if (!label) throw new Error(`GitHub's newest release (${rel.tag_name || 'no name'}) doesn't have a version number I understand.`);
  const want = platformAsset(platform, arch, platform === 'linux' ? linuxPackage(env, execPath, exists) : undefined);
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const asset = want ? assets.find((a) => want.re.test(a.name)) || null : null;
  const sha = asset ? assets.find((a) => a.name === asset.name + '.sha256') || null : null;
  return {
    tag: rel.tag_name, label, page: rel.html_url || RELEASES_PAGE, publishedAt: rel.published_at || '',
    kind: want?.kind || '', asset: asset && { name: asset.name, size: asset.size || 0, url: asset.browser_download_url, digest: String(asset.digest || '').replace(/^sha256:/, '') },
    sha: sha && { name: sha.name, url: sha.browser_download_url },
    why: !want ? 'There\'s no Bob for this kind of computer on GitHub yet.' : !asset ? `Bob ${label} on GitHub doesn't have the file for this replicant matrix yet (GitHub builds it a few minutes after the Windows one). Try again shortly.` : !sha ? `Bob ${label} on GitHub has no .sha256 file for ${asset.name}, so I can't check it and won't use it.` : ''
  };
}

// A .sha256 file: "<64 hex>  name" (Windows and Mac) or just "<64 hex>" (Linux). Lower case either way.
export function parseShaFile(text) {
  const m = String(text || '').match(/\b([0-9a-fA-F]{64})\b/);
  return m ? m[1].toLowerCase() : '';
}

const MB = (n) => Math.round(n / 1e6);
export const statusFile = (cfg) => path.join(cfg.dataDir, 'update-status.json');
export const workDir = (cfg) => path.join(cfg.dataDir, 'github-update');
const STEPS = (label, mb) => [`Asking GitHub for the newest Bob`, `Downloading Bob ${label}${mb ? ` (${mb} MB)` : ''}`, 'Checking the download against its .sha256', 'Getting the new Bob ready', 'Ready'];

let job = null; // one GitHub update at a time
export const githubJob = () => job;

function writeStatus(cfg, st) {
  try { fs.mkdirSync(cfg.dataDir, { recursive: true }); fs.writeFileSync(statusFile(cfg), JSON.stringify({ ...st, updatedAt: new Date().toISOString() }, null, 1)); } catch {}
}

// Downloads url to file, hashing as it goes. Only from GitHub (also after redirects).
async function download(url, file, { fetchImpl, signal, onBytes }) {
  if (!hostAllowed(url)) throw new Error('That download isn\'t from GitHub. Stopped.');
  const q = quietGuard(signal); // item 212: a download that goes quiet for 2 minutes is stopped, not waited on forever
  const res = await fetchImpl(url, { redirect: 'follow', signal: q.signal, headers: { 'user-agent': 'Bob' } });
  if (!res.ok) { q.done(); throw new Error(`The download failed (${res.status}). Try again.`); }
  if (res.url && !hostAllowed(res.url)) { q.done(); throw new Error('The download was sent somewhere other than GitHub. Stopped.'); }
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(file);
  let got = 0;
  try {
    for await (const c of res.body) {
      q.poke();
      const b = Buffer.from(c);
      hash.update(b); got += b.length;
      if (!out.write(b)) await new Promise((r) => out.once('drain', r));
      onBytes?.(got);
    }
  } catch (e) { if (q.quiet() && !signal?.aborted) throw new Error('The download stopped coming (nothing for 2 minutes). Try again.'); throw e; }
  finally { q.done(); await new Promise((r) => out.end(r)); }
  return hash.digest('hex');
}

async function fetchText(url, { fetchImpl, signal }) {
  if (!hostAllowed(url)) throw new Error('That checksum file isn\'t from GitHub. Stopped.');
  const res = await fetchImpl(url, { redirect: 'follow', signal: withDeadline(signal, 60_000), headers: { 'user-agent': 'Bob' } });
  if (!res.ok) throw new Error(`I couldn't get the checksum file (${res.status}).`);
  if (res.url && !hostAllowed(res.url)) throw new Error('The checksum file was sent somewhere other than GitHub. Stopped.');
  return res.text();
}

const run = (exe, args, opts = {}) => new Promise((resolve, reject) => execFile(exe, args, { windowsHide: true, timeout: 300000, ...opts }, (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message).trim().split('\n').pop())) : resolve(String(stdout)))));

// Electron's and the AppImage's own settings must not leak into the next Bob.
export function cleanEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!/^(ELECTRON_|NODE_OPTIONS$|NODE_CHANNEL_FD$|ORIGINAL_XDG_|CHROME_|APPDIR$|APPIMAGE$|ARGV0$|OWD$)/i.test(k)) out[k] = v;
  return out;
}

// Downloads and checks the newest release, then gets it ready. `handOff(source)` starts the Windows update
// window (update.js); the Mac and Linux steps happen here. Runs in the background; progress goes to the same
// status file the update window uses, so Settings and the chat show the same steps.
export async function startGithubUpdate(cfg, { fetchImpl = fetch, handOff, platform = process.platform, arch = process.arch, env = process.env, execPath = process.execPath, electron = process.versions.electron, exists = fs.existsSync, readFile = (f) => fs.readFileSync(f, 'utf8'), rel: known } = {}) {
  if (job && !job.finished) throw new Error('An update is already running.');
  const can = selfUpdate(env, platform, execPath, electron, exists);
  if (!can.ok) throw new Error(can.why);
  const ctl = new AbortController();
  job = { finished: false, ctl };
  const startedAt = new Date().toISOString();
  let steps = STEPS(known?.label || '', MB(known?.asset?.size || 0));
  const st = (step, text, extra = {}) => writeStatus(cfg, { mode: 'github', source: 'github', version: known?.label || '', step, of: steps.length, id: ['ask', 'download', 'check', 'ready-up', 'done'][step - 1], text, done: false, error: '', ready: false, steps, startedAt, ...extra });
  const promise = (async () => {
    st(1, steps[0]);
    const rel = await latestRelease({ fetchImpl, signal: ctl.signal, platform, arch, env, execPath, exists });
    if (rel.why) throw new Error(rel.why);
    known = rel;
    steps = STEPS(rel.label, MB(rel.asset.size));
    const dir = workDir(cfg);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const want = parseShaFile(await fetchText(rel.sha.url, { fetchImpl, signal: ctl.signal }));
    if (!want) throw new Error(`${rel.sha.name} doesn't hold a checksum I can read, so I won't use the download.`);
    if (rel.asset.digest && /^[0-9a-f]{64}$/i.test(rel.asset.digest) && rel.asset.digest.toLowerCase() !== want) throw new Error(`GitHub's own checksum for ${rel.asset.name} and its .sha256 file disagree, so I won't use it.`);
    const file = path.join(dir, rel.asset.name);
    let last = 0;
    st(2, steps[1], { version: rel.label });
    const got = await download(rel.asset.url, file + '.part', { fetchImpl, signal: ctl.signal, onBytes: (n) => { if (Date.now() - last > 700) { last = Date.now(); st(2, steps[1], { version: rel.label, log: `${MB(n)} of ${MB(rel.asset.size) || '?'} MB` }); } } });
    st(3, steps[2], { version: rel.label });
    if (got !== want) { fs.rmSync(file + '.part', { force: true }); throw new Error('The download didn\'t match its checksum, so I threw it away and changed nothing. Try again; if it keeps happening, download it from the releases page yourself (github.com/' + REPO + '/releases).'); }
    fs.renameSync(file + '.part', file);
    st(4, steps[3], { version: rel.label, log: `Checksum matches: ${want.slice(0, 12)}…` });
    const kind = rel.kind;
    if (kind === 'win') {
      const out = path.join(dir, 'unpacked');
      fs.mkdirSync(out, { recursive: true });
      const tar = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      // Windows 10+ has tar.exe (bsdtar), which reads zips; Bob's own unzip if it's missing.
      try { await run(fs.existsSync(tar) ? tar : 'tar', ['-xf', file, '-C', out]); } catch { fs.rmSync(out, { recursive: true, force: true }); unzip(file, out); }
      const source = path.join(out, 'Bob', 'resources', 'app');
      for (const f of ['package.json', 'electron/main.cjs', 'installer/bob-build-window.ps1']) if (!fs.existsSync(path.join(source, f))) throw new Error(`The download is missing ${f}. Nothing was changed.`);
      fs.rmSync(file, { force: true });
      // The update window takes over from here (and writes the status file itself).
      handOff(source);
      return;
    }
    if (kind === 'mac') {
      const out = path.join(dir, 'unpacked');
      fs.mkdirSync(out, { recursive: true });
      await run('/usr/bin/ditto', ['-x', '-k', file, out]);
      const app = path.join(out, 'Bob.app');
      if (!fs.existsSync(path.join(app, 'Contents', 'Info.plist'))) throw new Error('The download has no Bob.app inside. Nothing was changed.');
      // The Mac build is signed "ad-hoc" (no paid Apple account yet). That still seals every file, so a
      // changed or broken Bob.app fails here.
      try { await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]); }
      catch (e) { throw new Error(`The new Bob.app's seal doesn't check out (${e.message}), so I won't use it.`); }
      fs.rmSync(file, { force: true });
      const bundle = macBundle(execPath);
      let writable = false;
      try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); fs.accessSync(bundle, fs.constants.W_OK); writable = true; } catch {}
      job.swap = writable ? { kind, from: app, to: bundle, previous: path.join(dir, 'Bob-previous.app') } : null;
      if (!writable) {
        try { globalThis.bobShell?.showItemInFolder?.(app); } catch {}
        writeStatus(cfg, { mode: 'github', source: 'github', version: rel.label, step: 5, of: steps.length, id: 'done', text: 'Checked and ready to drag in.', done: true, error: '', ready: false, manual: true, file: app, steps, startedAt,
          log: `I couldn't replace Bob in ${path.basename(path.dirname(bundle)) === 'Applications' ? 'Applications' : path.dirname(bundle)}. I've opened the new copy in Finder: quit me, drag it into ${path.basename(path.dirname(bundle)) === 'Applications' ? 'Applications' : path.dirname(bundle)} (replace the old one), then open it.` });
        return;
      }
    } else if (kind === 'deb' || kind === 'flatpak') {
      // A package is put in by the system's own installer once this Bob has closed (restartIntoNew). The checked
      // download waits here until then; nothing in the system changes before "Restart Bob now".
      job.swap = kind === 'deb'
        ? { kind, from: file, exe: execPath, status: statusFile(cfg), label: rel.label }
        : { kind, from: file, id: FLATPAK_ID, scope: flatpakScope(readFile), status: statusFile(cfg), label: rel.label };
    } else {
      const target = env.APPIMAGE;
      const next = target + '.new';
      try { fs.copyFileSync(file, next); fs.chmodSync(next, 0o755); }
      catch (e) { throw new Error(`I can't write next to ${target} (${e.message}). Download the AppImage from ${RELEASES_PAGE} and put it there yourself.`); }
      fs.rmSync(file, { force: true });
      job.swap = { kind, from: next, to: target, previous: target + '.previous' };
    }
    writeStatus(cfg, { mode: 'github', source: 'github', version: rel.label, step: 5, of: steps.length, id: 'done', text: 'Ready. Restart Bob to switch over.', done: true, error: '', ready: true, steps, startedAt });
  })().catch((e) => {
    writeStatus(cfg, { mode: 'github', source: 'github', version: known?.label || '', step: Math.max(1, Number((() => { try { return JSON.parse(fs.readFileSync(statusFile(cfg), 'utf8')).step; } catch { return 1; } })()) || 1), of: steps.length, id: 'failed', text: e.message, done: false, error: `${e.message}${/[Nn]othing was changed|changed nothing|Couldn't reach GitHub/.test(e.message) ? '' : ' Nothing was changed.'}`, ready: false, steps, startedAt });
  }).finally(() => { job.finished = true; });
  job.promise = promise;
  return { ok: true, from: 'github', to: known ? { label: known.label } : null };
}

// A Flatpak Bob installed for this user only (~/.local/share/flatpak) or for the whole computer
// (/var/lib/flatpak): /.flatpak-info inside the sandbox says which. The update goes in the same place.
export function flatpakScope(readFile = (f) => fs.readFileSync(f, 'utf8')) {
  let info = '';
  try { info = readFile('/.flatpak-info'); } catch {}
  const m = String(info).match(/^app-path\s*=\s*(.+)$/m);
  return m && /^\/var\/lib\/flatpak\//.test(m[1].trim()) ? 'system' : 'user';
}

// What the status says when a package couldn't go in (the restart script writes it, so the next Bob shows it).
export function packageFailStatus(sw, why) {
  return { mode: 'github', source: 'github', version: sw.label || '', step: 4, of: 5, id: 'failed', text: why, done: false, ready: false, steps: [], error: `${why} Nothing was changed, and the download is still in ${path.dirname(sw.from)}.` };
}

// Mac and Linux: swap the checked download in once this Bob has closed, then open the new one. A small shell
// script does it, because Bob can't replace himself while he's running.
//   deb      pkexec asks for the password in the desktop's own window, then apt installs the .deb over the old one.
//   flatpak  runs outside the sandbox (flatpak-spawn --host), waits until no Bob Flatpak runs, then installs the
//            bundle over the old one (Flatpak keeps Bob's own folder, ~/.var/app/ca.mousewurx.bob, as it is).
// Either way Bob opens again, the new one or (if the install was cancelled or failed) the old one, and the status
// file says what happened.
export function swapScript(sw, pid) {
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  if (sw.kind === 'deb' || sw.kind === 'flatpak') {
    const fail = (why) => `printf '%s' ${q(JSON.stringify(packageFailStatus(sw, why), null, 1))} > ${q(sw.status)}`;
    const wait = sw.kind === 'deb'
      ? `while kill -0 ${Number(pid)} 2>/dev/null; do sleep 0.5; done`
      // The host can't see Bob's process number inside the sandbox; flatpak ps lists the running Flatpaks. At most 2 minutes.
      : `n=0; while [ $n -lt 240 ] && flatpak ps --columns=application 2>/dev/null | grep -qx ${q(sw.id)}; do sleep 0.5; n=$((n+1)); done`;
    const install = sw.kind === 'deb'
      ? `pkexec /usr/bin/apt-get install -y --allow-downgrades ${q(sw.from)}`
      // Some Flatpak versions (1.14, Ubuntu 24.04) refuse --reinstall for a bundle ("already installed"; the 1.5.204 build
      // test). Then the old Bob is taken out (his settings and ~/.var/app folder stay) and the new one put in.
      : (() => { const at = `--${sw.scope === 'system' ? 'system' : 'user'} -y --noninteractive`; return `{ flatpak install ${at} --reinstall --bundle ${q(sw.from)} || { flatpak uninstall ${at} ${q(sw.id)} && flatpak install ${at} --bundle ${q(sw.from)}; }; }`; })();
    const open = sw.kind === 'deb' ? `nohup ${q(sw.exe)} >/dev/null 2>&1 &` : `nohup flatpak run ${q(sw.id)} >/dev/null 2>&1 &`;
    return [
      wait,
      `if ${install} >${q(sw.from + '.log')} 2>&1; then rm -f ${q(sw.from)} ${q(sw.from + '.log')}; else`,
      `  ${fail(sw.kind === 'deb' ? 'The new .deb didn\'t go in (the password was cancelled, or apt said no; its words are in the .log next to the download).' : 'Flatpak didn\'t put the new Bob in (its words are in the .log next to the download).')}`,
      'fi',
      open
    ].join('\n');
  }
  const open = sw.kind === 'mac' ? `/usr/bin/open ${q(sw.to)}` : `nohup ${q(sw.to)} >/dev/null 2>&1 &`;
  return [
    `while kill -0 ${Number(pid)} 2>/dev/null; do sleep 0.5; done`,
    `rm -rf ${q(sw.previous)}`,
    // If the swap half-fails, put the old one back so there's always a Bob to open.
    `if mv ${q(sw.to)} ${q(sw.previous)}; then mv ${q(sw.from)} ${q(sw.to)} || mv ${q(sw.previous)} ${q(sw.to)}; fi`,
    open
  ].join('\n');
}

export function restartIntoNew(cfg, { spawnImpl = spawn, quit = () => (globalThis.bobQuit ? globalThis.bobQuit() : process.exit(0)) } = {}) {
  const sw = job?.swap;
  if (!sw || !fs.existsSync(sw.from)) throw new Error('There is no new Bob ready to switch to yet.');
  // A Flatpak Bob runs the script outside his sandbox, where Flatpak itself is (the --talk-name=org.freedesktop.Flatpak permission).
  const child = sw.kind === 'flatpak'
    ? spawnImpl('flatpak-spawn', ['--host', '/bin/sh', '-c', swapScript(sw, process.pid)], { detached: true, stdio: 'ignore', env: cleanEnv() })
    : spawnImpl('/bin/sh', ['-c', swapScript(sw, process.pid)], { detached: true, stdio: 'ignore', env: cleanEnv() });
  child?.unref?.();
  writeStatus(cfg, { ...(() => { try { return JSON.parse(fs.readFileSync(statusFile(cfg), 'utf8')); } catch { return {}; } })(), text: 'Restarting into the new Bob.', ready: true, done: true });
  setTimeout(quit, 300);
  return { ok: true, when: 'now' };
}

// "Wait until I'm done": restart once nothing is running, nothing waits and nothing downloads.
let waiter = null;
export function restartWhenIdle(cfg, isBusy, opts = {}) {
  if (!job?.swap) throw new Error('There is no new Bob ready to switch to yet.');
  clearInterval(waiter);
  waiter = setInterval(() => { if (!isBusy()) { clearInterval(waiter); try { restartIntoNew(cfg, opts); } catch {} } }, 3000);
  waiter.unref?.();
  return { ok: true, when: 'done' };
}
export const hasGithubSwap = () => Boolean(job?.swap);
