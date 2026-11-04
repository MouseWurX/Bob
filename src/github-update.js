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
// Only ever on a click ("Check for updates", "Update Bob"), or at start-up if "Check for updates when Bob starts"
// is on, and then only to look. Nothing is downloaded or installed without a click.
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

// Which release file fits this computer, and whether this Bob can swap itself for it.
export function platformAsset(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return arch === 'x64' || arch === 'arm64' ? { kind: 'win', re: /^Bob-.+-win-x64\.zip$/ } : null;
  if (platform === 'darwin') return arch === 'arm64' ? { kind: 'mac', re: /^Bob-.+-mac-arm64\.zip$/ } : null;
  if (platform === 'linux') return arch === 'x64' ? { kind: 'linux', re: /^Bob-.+-linux-x86_64\.AppImage$/ } : arch === 'arm64' ? { kind: 'linux', re: /^Bob-.+-linux-arm64\.AppImage$/ } : null;
  return null;
}

// The running Mac app bundle (…/Bob.app), or '' when Bob isn't running as an app.
export function macBundle(execPath = process.execPath) {
  const m = String(execPath).match(/^(.*?\.app)\/Contents\/MacOS\/[^/]+$/);
  return m ? m[1] : '';
}

// Can this Bob put a downloaded release in place by himself? Says why not, in words, when he can't.
export function selfUpdate(env = process.env, platform = process.platform, execPath = process.execPath, electron = process.versions.electron) {
  if (platform === 'win32') return env.BOB_APP_DIR && electron ? { ok: true } : { ok: false, why: 'I\'m running from source here, not from Bob.exe, so there\'s no Bob.exe for me to update. Get the new source, or install the zip from ' + RELEASES_PAGE + '.' };
  if (platform === 'darwin') return macBundle(execPath) ? { ok: true } : { ok: false, why: 'I\'m not running as Bob.app here, so there\'s nothing for me to swap. Download the Mac zip from ' + RELEASES_PAGE + '.' };
  if (platform === 'linux') return env.APPIMAGE ? { ok: true } : { ok: false, why: 'I\'m not running as an AppImage here, so there\'s nothing for me to swap. Download the AppImage from ' + RELEASES_PAGE + '.' };
  return { ok: false, why: 'There\'s no Bob for this kind of computer on GitHub yet.' };
}

// The Latest release and the file for this computer. Throws in plain words when GitHub can't be reached.
export async function latestRelease({ fetchImpl = fetch, signal, platform = process.platform, arch = process.arch } = {}) {
  let res;
  try { res = await fetchImpl(API, { headers: { 'user-agent': 'Bob', accept: 'application/vnd.github+json' }, signal }); }
  catch { throw new Error(`Couldn't reach GitHub (no internet?). Try again later, or download the newest release from github.com/${REPO}/releases.`); }
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'GitHub says I\'ve asked too often for now. Try again in an hour.' : `GitHub didn't answer (${res.status}). Try again in a few minutes.`);
  const rel = await res.json();
  const label = (parseVersion(rel.tag_name) || []).join('.');
  if (!label) throw new Error(`GitHub's newest release (${rel.tag_name || 'no name'}) doesn't have a version number I understand.`);
  const want = platformAsset(platform, arch);
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
  const res = await fetchImpl(url, { redirect: 'follow', signal, headers: { 'user-agent': 'Bob' } });
  if (!res.ok) throw new Error(`The download failed (${res.status}). Try again.`);
  if (res.url && !hostAllowed(res.url)) throw new Error('The download was sent somewhere other than GitHub. Stopped.');
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(file);
  let got = 0;
  try {
    for await (const c of res.body) {
      const b = Buffer.from(c);
      hash.update(b); got += b.length;
      if (!out.write(b)) await new Promise((r) => out.once('drain', r));
      onBytes?.(got);
    }
  } finally { await new Promise((r) => out.end(r)); }
  return hash.digest('hex');
}

async function fetchText(url, { fetchImpl, signal }) {
  if (!hostAllowed(url)) throw new Error('That checksum file isn\'t from GitHub. Stopped.');
  const res = await fetchImpl(url, { redirect: 'follow', signal, headers: { 'user-agent': 'Bob' } });
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
export async function startGithubUpdate(cfg, { fetchImpl = fetch, handOff, platform = process.platform, arch = process.arch, env = process.env, execPath = process.execPath, electron = process.versions.electron, rel: known } = {}) {
  if (job && !job.finished) throw new Error('An update is already running.');
  const can = selfUpdate(env, platform, execPath, electron);
  if (!can.ok) throw new Error(can.why);
  const ctl = new AbortController();
  job = { finished: false, ctl };
  const startedAt = new Date().toISOString();
  let steps = STEPS(known?.label || '', MB(known?.asset?.size || 0));
  const st = (step, text, extra = {}) => writeStatus(cfg, { mode: 'github', source: 'github', version: known?.label || '', step, of: steps.length, id: ['ask', 'download', 'check', 'ready-up', 'done'][step - 1], text, done: false, error: '', ready: false, steps, startedAt, ...extra });
  const promise = (async () => {
    st(1, steps[0]);
    const rel = await latestRelease({ fetchImpl, signal: ctl.signal, platform, arch });
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
    const kind = platformAsset(platform, arch).kind;
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

// Mac and Linux: swap the checked download in once this Bob has closed, then open the new one. A small shell
// script does it, because Bob can't replace himself while he's running.
export function swapScript(sw, pid) {
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
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
  const child = spawnImpl('/bin/sh', ['-c', swapScript(sw, process.pid)], { detached: true, stdio: 'ignore', env: cleanEnv() });
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
