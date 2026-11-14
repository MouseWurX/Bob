// 1.5.125 The chest (1.5.210: retired on a computer; what Bob made, as thumbnails with names, plus the save folder), thumbnails made
// once and kept, and Bob's home folder: picked at install or first open, never a temporary place, movable from Settings.
import { serverText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { suggestedHome, tempLike, synced, cloudWarning, homeProblem, folderBytes, gbText, homeView } from '../src/home.js';
import { thumbFor, thumbKey, tidy, canThumb, thumbsDir } from '../src/thumbs.js';
import { thumbImg, thumbUrl } from '../public/viewer.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
// Not under os.tmpdir(): on GitHub's Windows runners that is inside AppData, which these checks rightly call temp-like.
// Nor under a cwd that is itself temp-like (a staging copy under AppData, PC 2026-11-06): the first place that isn't.
const base = [process.cwd(), os.homedir(), os.tmpdir()].find((d) => !tempLike(d)) || process.cwd();
const tmp = fs.mkdtempSync(path.join(base, '.bob-chest-test-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });
const home = path.join(tmp, 'Users', 'you');
const env = { LOCALAPPDATA: path.join(home, 'AppData', 'Local'), APPDATA: path.join(home, 'AppData', 'Roaming') };
const tmpDir = path.join(tmp, 'Temp'); fs.mkdirSync(tmpDir, { recursive: true }); // the test folder itself sits in the real temp folder
fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });

// ---------- Bob's home: suggestion and refusals ----------
{
  check('the suggested home is a Bob folder in the user\'s own folder, on every system', suggestedHome({ home: 'C:\\Users\\you', platform: 'win32' }).replace(/\//g, '\\') === 'C:\\Users\\you\\Bob' && suggestedHome({ home: '/home/you', platform: 'linux' }) === path.join('/home/you', 'Bob'));
  check('AppData is temp-like on Windows', tempLike(path.join(env.LOCALAPPDATA, 'Bob'), { home, env, platform: 'win32', tmpDir }) === 'AppData' && tempLike(path.join(env.APPDATA, 'Bob'), { home, env, platform: 'win32', tmpDir }) === 'AppData');
  check('the system temp folder is temp-like', tempLike(path.join(tmpDir, 'bob-x'), { home, env, platform: 'win32', tmpDir }) === 'a temporary folder');
  check('a plain folder is not', tempLike(path.join(home, 'Bob'), { home, env, platform: 'win32', tmpDir }) === '');
  check('the Mac Caches folder and the Linux cache folder are temp-like', tempLike(path.join(home, 'Library', 'Caches', 'Bob'), { home, env, platform: 'darwin', tmpDir }) === 'the Caches folder' && tempLike(path.join(home, '.cache', 'bob'), { home, env, platform: 'linux', tmpDir }) === 'the cache folder');
  check('OneDrive, Dropbox, iCloud, Google Drive and friends are called out as synced', synced('C:\\Users\\you\\OneDrive\\Bob') === 'OneDrive' && synced('/Users/you/Dropbox/Bob') === 'Dropbox' && synced('/Users/you/Library/Mobile Documents/Bob') === 'iCloud' && synced('G:\\My Drive\\Bob') === 'Google Drive' && synced('/home/you/Nextcloud/Bob') === 'Nextcloud' && synced('C:\\Users\\you\\pCloudDrive\\Bob') === 'pCloud' && synced('/home/you/Bob') === '' && synced('D:\\Games\\Bob') === '');
  check('a cloud folder is allowed, but the warning always recommends against it, in both voices', homeProblem('C:\\Users\\you\\OneDrive\\Bob', { home, env, platform: 'win32', tmpDir, probe: false }) === '' && /Bob recommends against it/.test(cloudWarning('OneDrive')) && /I recommend against it/.test(cloudWarning('OneDrive', 'me')) && /every model/.test(cloudWarning('Dropbox')) && cloudWarning('') === '');
  const o = { home, env, platform: 'win32', tmpDir };
  check('home: AppData is refused with a reason and a better suggestion', /clean-up tools empty/.test(homeProblem(path.join(env.LOCALAPPDATA, 'Bob'), o)) && homeProblem(path.join(env.LOCALAPPDATA, 'Bob'), o).includes('Bob'));
  check('home: a whole drive is refused', /whole drive/.test(homeProblem('D:\\', { ...o, probe: false })) && /whole drive/.test(homeProblem('/', { ...o, probe: false })));
  check('home: a relative path is refused', /whole path/.test(homeProblem('Bob', o)) && /Pick a folder/.test(homeProblem('', o)));
  const full = path.join(home, 'Stuff'); fs.mkdirSync(full, { recursive: true }); fs.writeFileSync(path.join(full, 'holiday.jpg'), 'x');
  check('home: a folder with other things in it is refused (a Bob folder inside is suggested)', /other things in it/.test(homeProblem(full, o)));
  const empty = path.join(home, 'Bob'); fs.mkdirSync(empty, { recursive: true });
  check('home: an empty folder is fine', homeProblem(empty, o) === '');
  check('home: a folder that does not exist yet is fine when its parent can be written', homeProblem(path.join(home, 'New', 'Bob'), o) === '');
  const bobHome = path.join(home, 'OldBob'); fs.mkdirSync(path.join(bobHome, 'inn'), { recursive: true });
  check('home: a folder that already is a Bob home (has inn) is fine', homeProblem(bobHome, o) === '');
  check('home: the current home is fine (nothing to do), a folder inside it is not', homeProblem(bobHome, { ...o, current: bobHome }) === '' && /inside Bob's current home/.test(homeProblem(path.join(bobHome, 'models'), { ...o, current: bobHome })));
  check('home: a file is not a folder', /a file, not a folder/.test(homeProblem(path.join(full, 'holiday.jpg'), o)));
  fs.mkdirSync(path.join(bobHome, 'models'), { recursive: true }); fs.writeFileSync(path.join(bobHome, 'models', 'a.gguf'), Buffer.alloc(3000));
  const fb = folderBytes(path.join(bobHome, 'models'));
  check('folder size adds up and says when it stopped early', fb.bytes === 3000 && !fb.partial && folderBytes(bobHome, { budget: 1 }).partial === true);
  check('sizes read as GB or MB', gbText(15.2e9) === '15 GB' && gbText(1.5e9) === '1.5 GB' && gbText(3000) === '1 MB' && gbText(0) === '0 MB');
  const v = homeView({ agentDir: path.join(env.LOCALAPPDATA, 'Bob') }, o);
  check('the Settings view flags a home in AppData and suggests the Bob folder', v.tempLike === 'AppData' && v.suggested === suggestedHome({ home, platform: 'win32' }) && v.canMove === false);
}

// ---------- Thumbnails: made once, kept, with a fallback ----------
{
  const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), painterDir = path.join(innDir, 'painter');
  fs.mkdirSync(painterDir, { recursive: true }); fs.mkdirSync(dataDir, { recursive: true });
  const cfg = { agentDir, innDir, dataDir, painterDir, defaultPainterDir: painterDir };
  const pic = path.join(painterDir, 'castle.png'); fs.writeFileSync(pic, Buffer.from('89504e470d0a1a0a', 'hex'));
  let made = 0;
  const image = { thumb: async () => { made++; return Buffer.from('PNG-small'); } };
  const a = await thumbFor(cfg, pic, { image });
  const b = await thumbFor(cfg, pic, { image });
  check('a picture\'s thumbnail is made once and read from the cache after', a.ok && !a.cached && b.ok && b.cached && made === 1 && fs.readFileSync(a.file, 'utf8') === 'PNG-small' && a.file.startsWith(thumbsDir(cfg)));
  fs.writeFileSync(pic, Buffer.from('89504e470d0a1a0a00', 'hex')); fs.utimesSync(pic, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
  const c = await thumbFor(cfg, pic, { image });
  check('a changed picture gets a new thumbnail (the key carries size and time)', c.ok && !c.cached && made === 2 && c.file !== a.file && thumbKey(pic, fs.statSync(pic)) !== path.basename(a.file, '.png'));
  const pic2 = path.join(painterDir, 'tower.png'); fs.writeFileSync(pic2, 'x');
  check('without Bob\'s window (no image code) there is no thumbnail, and the window falls back', !(await thumbFor(cfg, pic2, { image: null })).ok);
  const clip = path.join(painterDir, 'c.mp4'); fs.writeFileSync(clip, 'x');
  check('a clip without FFmpeg says so instead of failing', /FFmpeg/.test((await thumbFor(cfg, clip, { image, ffmpeg: null })).why));
  const ran = [];
  const fakeRun = (exe, args, opts, cb) => { ran.push(exe); fs.writeFileSync(args[args.length - 1], 'FRAME'); cb(null); };
  const d = await thumbFor(cfg, clip, { image, ffmpeg: '/usr/bin/ffmpeg', run: fakeRun });
  check('a clip\'s first second comes from FFmpeg, as a PNG in the cache', d.ok && ran[0] === '/usr/bin/ffmpeg' && fs.readFileSync(d.file, 'utf8') === 'FRAME');
  const doc = path.join(innDir, 'plan.md'); fs.writeFileSync(doc, '# hi');
  check('documents and sounds get no thumbnail (their icon shows)', !canThumb('song.wav') && !canThumb('plan.md') && canThumb('a.PNG') && canThumb('b.webm') && !(await thumbFor(cfg, doc, { image })).ok);
  check('a missing file is a miss, not a crash', (await thumbFor(cfg, path.join(painterDir, 'gone.png'), { image })).why === 'missing');
  const dir = thumbsDir(cfg);
  for (let i = 0; i < 6; i++) { fs.writeFileSync(path.join(dir, `old${i}.png`), 'x'); fs.utimesSync(path.join(dir, `old${i}.png`), new Date(1000 + i), new Date(1000 + i)); }
  const gone = tidy(dir, 5);
  check('the cache keeps the newest-used thumbnails and drops the rest', gone > 0 && fs.readdirSync(dir).filter((n) => n.endsWith('.png')).length === 5);
}

// ---------- 1.5.210: the chest on the old paper doll is gone; Made by Bob and Settings keep its two jobs ----------
{
  const mod = await import('../public/equip.js');
  const cellar = publicText('cellar.js');
  check('no chest tile or chest panel on a computer any more', !('chestHtml' in mod) && !('chestTile' in mod) && !/data-chest\b/.test(cellar) && !/loadChest/.test(cellar));
  check('the save folder still has its own Settings panel with Change folder', /'ev-save', '💾 Save folder'/.test(cellar) && /function saveDirHtml/.test(cellar));
  const h = HELP.find((x) => x.id === 'chest');
  check('Help says where the chest went: Made by Bob, and Settings, Save folder', h && /Made by Bob/.test(h.html) && /Save folder/.test(h.html));
}

// ---------- The window, the phone, the installer and the words ----------
{
  const cellar = publicText('cellar.js'), server = serverText(), main = read('electron/main.cjs'), ps = read('installer/bob-build-window.ps1'), readme = read('../README.md'), guide = read('docs/USER-GUIDE.md'), inv = read('docs/SETTINGS-INVENTORY.md');
  check('Change folder… uses the same picker as Settings', /'chestbrowse' in b\.dataset.*purpose: 'save'/.test(cellar));
  check('the brain serves thumbnails and the home folder, local only for home', /p === '\/api\/thumb'/.test(server) && /p === '\/api\/home'/.test(server) && /thumbFor\(cfg, d\.path\)/.test(server) && /homeProblem\(folder, \{ current: cfg\.agentDir \}\)/.test(server) && /globalThis\.bobHome\.move/.test(server));
  check('Settings has Bob\'s home folder with Browse…, Move here… and one Yes', /'ev-home', '📦 Bob\\'s home folder'/.test(cellar) && /data-homebrowse>Browse…/.test(cellar) && /data-homemove>Move here…/.test(cellar) && /'Move there anyway' : 'Yes, move everything'/.test(cellar) && /data-homeno>Not now/.test(cellar) && /confirm: true/.test(cellar));
  check('cloud folders: red line + summary in Settings, red note and Move there anyway on the card, Pick another folder… at first start, Use it anyway in the installer', /synced to the cloud: not recommended/.test(cellar) && /Move there anyway/.test(cellar) && /pickedCloudWarning/.test(cellar) && /pickedCloud: synced\(folder\)/.test(server) && /'Pick another folder…', 'Use it anyway'/.test(main) && /cloudWarning\(cloud, 'me'\)/.test(main) && /function Test-BobHomeCloud/.test(ps) && /Use it anyway/.test(ps) && /DarkOrange/.test(ps));
  check('Settings text is third person, the first-run copy is Bob\'s voice, both mention OneDrive', /Bob closes, copies it all across/.test(cellar) && /I close, copy it all across/.test(cellar) && /Bob shows the size and asks once/.test(cellar) && (cellar.match(/a cloud-synced folder like OneDrive, Dropbox, Google Drive or iCloud is allowed but (I|Bob) always recommends? against it/g) || []).length === 2 && /not a cloud-synced folder \(OneDrive, Dropbox, Google Drive, iCloud\): I always recommend against those/.test(main) && /always recommends against those/.test(ps) && /always recommends against it/.test(readme) && /always recommends against it/.test(guide));
  check('the first-run screen asks where Bob keeps his things before the downloads', /home-first"><h3>My home folder<\/h3>\$\{homeHtml\(\{ welcome: true \}\)\}/.test(cellar) && cellar.indexOf('My home folder') < cellar.indexOf('<h3>Get me ready</h3>'));
  check('Bob.exe asks a fresh install where to keep his things, keeps an old home, and refuses temp-like folders', /async function askForHome/.test(main) && /homeProblem/.test(main) && /fs\.existsSync\(path\.join\(old, 'inn'\)\)\) agentDir = old/.test(main) && /suggestedHome\(\)/.test(main) && /Where should Bob keep his things\?/.test(main));
  check('BOB_AGENT_DIR (test starts, the smoke checks on GitHub) answers the question without a window', /process\.env\.BOB_AGENT_DIR\) agentDir = process\.env\.BOB_AGENT_DIR/.test(main) && /BOB_AGENT_DIR="\$HOME\/Bob"/.test(read('../.github/workflows/linux.yml')) && /BOB_AGENT_DIR="\$HOME\/Bob"/.test(read('../.github/workflows/build.yml')));
  check('a move is done at the next start: copy, count, point, then remove the old folder', /async function finishMove/.test(main) && main.indexOf('fs.cpSync(from, to') < main.indexOf('fs.rmSync(from') && /not every file came across/.test(main) && /globalThis\.bobHome = \{/.test(main) && /app\.relaunch\(\)/.test(main));
  check('Bob\'s window lends its image code for thumbnails (no image library, no model)', /globalThis\.bobImage = \{/.test(main) && /nativeImage\.createFromPath\(file\)/.test(main) && !/sharp|jimp/.test(read('package.json')));
  check('the Windows install window asks first, suggests <user folder>\\Bob and refuses AppData', /function Ask-BobHome/.test(ps) && /function Test-BobHomeBad/.test(ps) && /Join-Path \$env:USERPROFILE 'Bob'/.test(ps) && /\$env:LOCALAPPDATA, \$env:APPDATA, \$env:TEMP/.test(ps) && /if \(\$Mode -eq 'install' -and -not \$BobHome -and -not \$AppDir/.test(ps) && /if \(-not \$picked\) \{ exit 0 \}/.test(ps));
  check('the installer is not asked again where an old Bob already lives in LOCALAPPDATA', /Join-Path \$env:LOCALAPPDATA 'Bob\\inn'/.test(ps));
  check('the folder picker knows the home purpose on Windows, Mac and Linux', (read('src/pick-folder.js').match(/'home'/g) || []).length >= 4);
  check('the README no longer tells anyone to edit home.json', !/"agentDir"/.test(readme) && !/home\.json/.test(readme.split('## Where Bob keeps things')[1].split('## Using Bob')[0]) && /You pick the folder when Bob is installed or first opened/.test(readme) && /Bob's home folder/.test(readme) && /chest/.test(readme));
  check('the user guide says where the things he made are, and has Bob\'s home folder', /### Where the things he made are/.test(guide) && /### Bob's home folder/.test(guide) && /Change folder…/.test(guide));
  check('the settings inventory has both rows', /Bob's home folder \(1\.5\.125\)/.test(inv) && (inv.match(/ok \(approved with edits, 1\.5\.125\)/g) || []).length === 2 && /Equip Bob > 🧰 Chest~~ retired in 1\.5\.210/.test(inv));
  const byId = (id) => HELP.find((e) => e.id === id);
  check('Help: the chest, Bob\'s home folder, glossary lines and the FAQ', byId('chest') && /Change folder…/.test(byId('chest').html) && byId('settings-home') && /Yes, move everything/.test(byId('settings-home').html) && /<dt>Chest<\/dt>/.test(byId('glossary').html) && /<dt>Home \(Bob's home folder\)<\/dt>/.test(byId('glossary').html) && /<dt>Thumbnail<\/dt>/.test(byId('glossary').html) && /always recommend against those/.test(byId('settings-home').html) && /Move there anyway/.test(byId('settings-home').html) && byId('faq-models-safe') && /AppData/.test(byId('faq-models-safe').html) && /where to keep my things/.test(byId('start').html) && /Chest/.test(byId('equip').html));
  check('Help uses the on-screen words', ['Kept in', 'I keep my things in', 'Move here…', 'Made by Bob'].every((w) => HELP.some((e) => e.html.includes(w))));
  const www = 'android/app/src/main/assets/www/';
  const html = read(www + 'index.html'), js = read(www + 'phone.js'), help = read(www + 'help.js'), css = read(www + 'phone.css');
  check('phone: Chest in the menu, its page, thumbnails from the home Bob, a tap shows the thing, Help and glossary', /data-go="chest"><span class="ico">🧰<\/span>Chest</.test(html) && /id="chest-body"/.test(html) && /advApi\('\/api\/made\?limit=24'\)/.test(js) && /\/api\/thumb\?path=/.test(js) && /function drawChestBig/.test(js) && /mediaNode\(\{ kind, url: x\.url/.test(js) && /chest: drawChest/.test(js) && /id: 'chest', title: 'Chest'/.test(help) && /<dt>Chest<\/dt>/.test(help) && /\.chest-grid \{/.test(css));
  check('phone: the chest never keeps anything unless saved, and says where the folder is changed', /Nothing is kept on the phone unless you save it/.test(help) && /open Settings, Save folder/.test(js));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
