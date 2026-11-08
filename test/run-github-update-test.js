// Tests "Update Bob" from GitHub: reading the Latest release, picking the file for this computer, the .sha256
// check (and GitHub's own checksum), refusing other hosts, the Windows hand-off to the update window
// (-Prebuilt), the Linux and Mac swap, and that "Check for updates" picks the newer of GitHub and the source folder.
// No network: GitHub is a fake fetch.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeZip } from '../src/zip.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob gh upd-'));
process.env.BOB_SOURCE = ''; // no source folder unless a check sets one
const gh = await import('../src/github-update.js');
const { checkAll } = await import('../src/update.js');
const { VERSION } = await import('../src/config.js');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const next = (() => { const v = VERSION.label.split('.').map(Number); return `${v[0]}.${v[1]}.${v[2] + 1}`; })();

// A fake GitHub: the release list answer plus files by URL. `redirect` sends a file somewhere else.
function fakeGithub({ tag = `v${next}`, files = {}, digest = true, shaText, redirect } = {}) {
  const assets = Object.entries(files).flatMap(([name, buf]) => [
    { name, size: buf.length, browser_download_url: `https://github.com/MouseWurX/Bob/releases/download/${tag}/${name}`, ...(digest ? { digest: 'sha256:' + (digest === 'wrong' ? '0'.repeat(64) : sha(buf)) } : {}) },
    { name: name + '.sha256', size: 80, browser_download_url: `https://github.com/MouseWurX/Bob/releases/download/${tag}/${name}.sha256` }
  ]);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === 'https://api.github.com/repos/MouseWurX/Bob/releases/latest') return { ok: true, status: 200, url, json: async () => ({ tag_name: tag, html_url: `https://github.com/MouseWurX/Bob/releases/tag/${tag}`, assets }) };
    const name = decodeURIComponent(url.split('/').pop());
    if (name.endsWith('.sha256')) { const base = name.slice(0, -7); return { ok: true, status: 200, url, text: async () => shaText ?? `${sha(files[base]).toUpperCase()}  ${base}\r\n` }; }
    if (files[name]) return { ok: true, status: 200, url: redirect || 'https://release-assets.githubusercontent.com/x', body: (async function* () { yield files[name].subarray(0, 10); yield files[name].subarray(10); })() };
    return { ok: false, status: 404, url };
  };
  return { fetchImpl, calls };
}

// ---- versions and file names ----
check('reads release tags, the old "v.1.0.0" typo too', gh.parseVersion('v1.5.58').join('.') === '1.5.58' && gh.parseVersion('v.1.0.0').join('.') === '1.0.0' && gh.parseVersion('nightly') === null);
check('compares versions by number, not as text', gh.compareVersions('1.5.100', '1.5.99') > 0 && gh.compareVersions('v1.5.58', '1.5.58') === 0 && gh.compareVersions('1.4.9', '1.5.0') < 0);
check('picks the Windows zip, the Mac zip and the Linux AppImage', gh.platformAsset('win32', 'x64').re.test('Bob-1.5.60-win-x64.zip') && gh.platformAsset('darwin', 'arm64').re.test('Bob-1.5.60-mac-arm64.zip') && gh.platformAsset('linux', 'x64').re.test('Bob-1.5.60-linux-x86_64.AppImage') && !gh.platformAsset('win32', 'x64').re.test('Bob-1.5.60-win-x64.zip.sha256'));
check('an Intel Mac gets an honest "not yet", not the wrong file', gh.platformAsset('darwin', 'x64') === null);
check('reads both .sha256 styles (Windows/Mac "HASH  name", Linux bare hash)', gh.parseShaFile('ABCDEF'.padEnd(64, '0') + '  Bob.zip') === 'abcdef'.padEnd(64, '0') && gh.parseShaFile('1'.repeat(64) + '\n') === '1'.repeat(64) && gh.parseShaFile('nope') === '');
check('finds the running Bob.app from the program path', gh.macBundle('/Applications/Bob.app/Contents/MacOS/Bob') === '/Applications/Bob.app' && gh.macBundle('/usr/local/bin/node') === '');
check('only an installed Bob updates himself (Bob.exe, Bob.app, the AppImage)', gh.selfUpdate({ BOB_APP_DIR: 'C:\\Bob app' }, 'win32', '', '44.9.0').ok && !gh.selfUpdate({}, 'win32', '', '44.9.0').ok && gh.selfUpdate({ APPIMAGE: '/x/Bob.AppImage' }, 'linux').ok && !gh.selfUpdate({}, 'linux').ok && gh.selfUpdate({}, 'darwin', '/Applications/Bob.app/Contents/MacOS/Bob').ok);

// ---- the Latest release ----
{
  const { fetchImpl } = fakeGithub({ files: { [`Bob-${next}-linux-x86_64.AppImage`]: Buffer.from('new appimage bytes, version next') } });
  const r = await gh.latestRelease({ fetchImpl, platform: 'linux', arch: 'x64' });
  check('the Latest release names its version, file and checksum file', r.label === next && r.asset.name === `Bob-${next}-linux-x86_64.AppImage` && r.sha.name === r.asset.name + '.sha256' && !r.why);
  const w = await gh.latestRelease({ fetchImpl, platform: 'win32', arch: 'x64' });
  check('a release without this computer\'s file says so (and offers nothing)', !w.asset && /doesn't have the file/.test(w.why));
  const down = await gh.latestRelease({ fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } }).catch((e) => e.message);
  check('no internet: a plain message with a fix', /Couldn't reach GitHub \(no internet\?\)/.test(down) && /releases/.test(down));
  const busy = await gh.latestRelease({ fetchImpl: async () => ({ ok: false, status: 403 }) }).catch((e) => e.message);
  check('GitHub\'s rate limit: a plain message', /asked too often/.test(busy));
}

// ---- Linux: download, check, put next to the running AppImage, swap on restart ----
const cfg = { agentDir: root, dataDir: path.join(root, 'inn', 'bob'), port: 7777 };
fs.mkdirSync(cfg.dataDir, { recursive: true });
const appimage = path.join(root, 'Apps', 'Bob-old.AppImage');
fs.mkdirSync(path.dirname(appimage), { recursive: true });
fs.writeFileSync(appimage, 'old');
const linuxFile = `Bob-${next}-linux-x86_64.AppImage`;
const newBytes = Buffer.from('new appimage bytes, version next, long enough');
const linuxOpts = (fake) => ({ fetchImpl: fake.fetchImpl, platform: 'linux', arch: 'x64', env: { APPIMAGE: appimage } });
const readStatus = () => JSON.parse(fs.readFileSync(gh.statusFile(cfg), 'utf8'));
{
  const fake = fakeGithub({ files: { [linuxFile]: newBytes } });
  await gh.startGithubUpdate(cfg, linuxOpts(fake));
  await gh.githubJob().promise;
  const st = readStatus();
  check('Linux: the checked AppImage waits next to the running one', fs.readFileSync(appimage + '.new').equals(newBytes) && fs.readFileSync(appimage, 'utf8') === 'old', st.error);
  check('Linux: it may run (chmod +x)', (fs.statSync(appimage + '.new').mode & 0o111) !== 0 || process.platform === 'win32');
  check('the status says ready, in the same file the update window uses', st.ready === true && st.done === true && st.mode === 'github' && st.version === next && st.steps.length === 5);
  check('the downloaded file isn\'t left lying around', !fs.existsSync(path.join(gh.workDir(cfg), linuxFile)));
  check('only GitHub was asked', fake.calls.every((u) => /^https:\/\/(api\.)?github\.com\//.test(u)));
  const script = gh.swapScript(gh.githubJob().swap, 4242);
  check('the swap waits for this Bob to close first', /^while kill -0 4242 /.test(script));
  check('the swap keeps the old one as .previous and puts it back if the new one won\'t move', script.includes(`mv '${appimage}' '${appimage}.previous'`) && script.includes(`|| mv '${appimage}.previous' '${appimage}'`));
  check('then opens the new Bob, under the same file name', script.includes(`nohup '${appimage}'`));
  let spawned = null, quit = false;
  gh.restartIntoNew(cfg, { spawnImpl: (exe, args, opts) => { spawned = { exe, args, opts }; return { unref() {} }; }, quit: () => { quit = true; } });
  await new Promise((r) => setTimeout(r, 400));
  check('"Restart Bob now" runs the swap on its own and closes Bob', spawned?.exe === '/bin/sh' && spawned.opts.detached === true && quit);
  check('the next Bob doesn\'t inherit Electron\'s or the AppImage\'s settings', !Object.keys(gh.cleanEnv({ ELECTRON_RUN_AS_NODE: '1', APPIMAGE: 'x', APPDIR: 'y', HOME: '/h' })).some((k) => k !== 'HOME'));
  if (process.platform !== 'win32') {
    // Run the real swap script against the files (a finished pid, so it doesn't wait).
    const { execFileSync } = await import('node:child_process');
    execFileSync('/bin/sh', ['-c', gh.swapScript({ ...gh.githubJob().swap, kind: 'linux-test' }, 999999).replace(/nohup .*$/m, 'true')]);
    check('the swap script really swaps: new in place, old kept as .previous', fs.readFileSync(appimage).equals(newBytes) && fs.readFileSync(appimage + '.previous', 'utf8') === 'old' && !fs.existsSync(appimage + '.new'));
    fs.writeFileSync(appimage, 'old'); fs.rmSync(appimage + '.previous', { force: true });
  }
}
{
  // A damaged download: nothing changes.
  fs.rmSync(appimage + '.new', { force: true });
  const fake = fakeGithub({ files: { [linuxFile]: newBytes }, shaText: '0'.repeat(64) + '  ' + linuxFile, digest: false });
  await gh.startGithubUpdate(cfg, linuxOpts(fake)); await gh.githubJob().promise;
  const st = readStatus();
  check('a download that doesn\'t match its .sha256 is thrown away', /didn't match its checksum, so I threw it away and changed nothing/.test(st.error) && !st.ready && !fs.existsSync(appimage + '.new') && fs.readFileSync(appimage, 'utf8') === 'old');
  check('and the partial file is gone too', !fs.readdirSync(gh.workDir(cfg)).some((f) => f.endsWith('.part')));
}
{
  const fake = fakeGithub({ files: { [linuxFile]: newBytes }, digest: 'wrong' });
  await gh.startGithubUpdate(cfg, linuxOpts(fake)); await gh.githubJob().promise;
  check('GitHub\'s own checksum and the .sha256 file must agree', /disagree/.test(readStatus().error) && !fs.existsSync(appimage + '.new'));
}
{
  const fake = fakeGithub({ files: { [linuxFile]: newBytes }, redirect: 'https://evil.example.com/Bob.AppImage' });
  await gh.startGithubUpdate(cfg, linuxOpts(fake)); await gh.githubJob().promise;
  check('a download sent anywhere but GitHub is refused', /somewhere other than GitHub/.test(readStatus().error) && !fs.existsSync(appimage + '.new'));
}
{
  let threw = '';
  try { await gh.startGithubUpdate(cfg, { platform: 'linux', arch: 'x64', env: {} }); } catch (e) { threw = e.message; }
  check('not running as an AppImage: refuses, and says where to download instead', /not running as an AppImage/.test(threw) && /releases/.test(threw));
}

// ---- Windows: unpack the zip, hand the new Bob to the update window with -Prebuilt ----
{
  const zipFile = path.join(root, 'made.zip');
  const app = 'Bob/resources/app/';
  writeZip(zipFile, [
    { name: 'Bob/Bob.exe', data: Buffer.from('exe') },
    { name: app + 'package.json', data: Buffer.from(JSON.stringify({ version: next, bob: { release: '1.5', patch: 99, build: 9999 } })) },
    { name: app + 'electron/main.cjs', data: Buffer.from('//') },
    { name: app + 'installer/bob-build-window.ps1', data: Buffer.from('# window') }
  ]);
  const winFile = `Bob-${next}-win-x64.zip`;
  const fake = fakeGithub({ files: { [winFile]: fs.readFileSync(zipFile) } });
  let handed = '';
  await gh.startGithubUpdate(cfg, { fetchImpl: fake.fetchImpl, platform: 'win32', arch: 'x64', env: { BOB_APP_DIR: path.join(root, 'Bob app') }, electron: '44.9.0', handOff: (src) => { handed = src; } });
  await gh.githubJob().promise;
  check('Windows: the checked zip is unpacked and handed to the update window', handed === path.join(gh.workDir(cfg), 'unpacked', 'Bob', 'resources', 'app') && fs.existsSync(path.join(handed, 'installer', 'bob-build-window.ps1')), readStatus().error);
  check('Windows: the zip itself is cleaned up after unpacking', !fs.existsSync(path.join(gh.workDir(cfg), winFile)));

  // The real hand-off: update.js starts the window from the download with -Prebuilt.
  const upd = await import('../src/update.js');
  const realPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  let call = null;
  upd.startUpdate(cfg, { source: handed, prebuilt: true, spawnImpl: (exe, args, opts) => { call = { exe, args, opts }; return { unref() {}, on() {} }; } });
  Object.defineProperty(process, 'platform', { value: realPlatform });
  const line = call?.args[3] || '';
  check('the update window runs from the download, in update mode, with -Prebuilt', line.includes(`"-File" "${path.join(handed, 'installer', 'bob-build-window.ps1')}"`) && line.includes('"-Mode" "update"') && line.includes(`"-Source" "${handed}"`) && line.includes('"-Prebuilt"'));
}

// ---- the window script: -Prebuilt skips Node.js and the tests, keeps home.json's source folder ----
{
  const ps = fs.readFileSync(fileURLToPath(new URL('../installer/bob-build-window.ps1', import.meta.url)), 'utf8');
  check('the window takes -Prebuilt', /\[switch\] \$Prebuilt/.test(ps));
  check('-Prebuilt drops the tests step (GitHub already ran them)', /if \(\$Prebuilt -and \$Mode -eq 'update'\) \{\s*\$Steps = @\([\s\S]*?\$Steps\[1\], \$Steps\[3\], \$Steps\[4\]/.test(ps));
  check('-Prebuilt doesn\'t need Node.js', /if \(\$Prebuilt\) \{ \$npm = \$true \}/.test(ps));
  check('home.json never points at a download or a copied window', /function Write-HomeJson \{\s*#[^\n]*\n\s*if \(\$Prebuilt -or -not \(Test-Path -LiteralPath \(Join-Path \$Source 'src\\server\.js'\)\)\) \{ return \}/.test(ps));
  const main = fs.readFileSync(fileURLToPath(new URL('../electron/main.cjs', import.meta.url)), 'utf8');
  check('"Later" works without a source folder: the waiting Bob\'s own window is copied out first', /bob-swap/.test(main) && /fs\.cpSync\(path\.join\(newApp, 'installer'\)/.test(main));
}

// ---- "Check for updates": GitHub and the source folder, the newer wins ----
{
  const fake = fakeGithub({ files: { [linuxFile]: newBytes } });
  let c = await checkAll({ fetchImpl: fake.fetchImpl, platform: 'linux', arch: 'x64', env: { APPIMAGE: appimage } });
  check('a newer release on GitHub is offered', c.newer && c.from === 'github' && c.available.label === next && c.canRun && c.github.file === linuxFile);
  c = await checkAll({ fetchImpl: fakeGithub({ tag: `v${VERSION.label}`, files: { [linuxFile]: newBytes } }).fetchImpl, platform: 'linux', arch: 'x64', env: { APPIMAGE: appimage } });
  check('the same version as this Bob: up to date', !c.newer && c.github.label === VERSION.label);
  c = await checkAll({ fetchImpl: async () => { throw new Error('offline'); } });
  check('GitHub out of reach: still answers, and says why', !c.newer && /Couldn't reach GitHub/.test(c.githubError));
  c = await checkAll({ fetchImpl: fake.fetchImpl, platform: 'linux', arch: 'x64', env: {} });
  check('a newer release this Bob can\'t install himself says why', c.newer && !c.canRun && /AppImage/.test(c.why));
}

// ---- Help, settings text and the privacy policy say the same ----
{
  const read = (f) => fs.readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8');
  const help = read('public/help-content.js'), cellar = read('public/cellar.js'), privacy = read('docs/legal/PRIVACY.md');
  check('the start-up check is still a switch that starts off', /sswitch\('autoCheck', settings\.updates\?\.autoCheck, 'Check for updates when Bob starts'/.test(cellar) && /set\('Check for updates when Bob starts', 'Off'/.test(help));
  check('Help no longer says the update check never goes online', !/Check for updates \(it only looks at the folder/.test(help) && !/Update checks\*\* never go online/.test(privacy));
  check('Help has an FAQ and glossary words for GitHub updates', /id: 'faq-updates'/.test(help) && /<dt>GitHub release<\/dt>/.test(help) && /<dt>Checksum \(\.sha256, SHA-256\)<\/dt>/.test(help));
  check('the privacy policy names what goes out (api.github.com) and the .sha256 check', /api\.github\.com/.test(privacy) && /\.sha256/.test(privacy));
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
