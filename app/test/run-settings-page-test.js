// 1.5.0: Settings as a page (Everyday + Advanced), Get models in the left menu, voice samples for every voice,
// the pinned catalog, and the Hands self-test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ModelShop } from '../src/models.js';
import { BUNDLED_KOKORO, SAMPLE_LINE } from '../src/voice-samples.js';
import { KOKORO_VOICES } from '../src/tts.js';
import { selfTest } from '../src/hands-selftest.js';
import { runCommand } from '../src/hands-run.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ui = publicText('cellar.js'), html = read('public/index.html'), app = publicText('app.js'), css = read('public/style.css'), hands = read('public/hands.js');

// --- the page
check('Settings, Get models and Style open as a page in the main area, not a pop-up', /<div class="mid">[\s\S]*<dialog id="cellar" class="cellar page"/.test(html) && /dlg\.show\(\)/.test(ui) && /\.mid\.paged > :is\(#log, #chips, #tray, #composer\) \{ display: none/.test(css));
check('the page has a Back to chat button, and Esc, Chat and New chat go back too', /Back to chat/.test(html) && /e\.key === 'Escape'/.test(ui) && /\['chatBtn', 'newchat'\][\s\S]{0,80}\$\('cellar'\)\.close\(\)/.test(app));
check('the left menu has Get models and Settings as separate buttons', /id="cellarBtn"[^>]*aria-label="Get models"/.test(html) && /id="settingsBtn"[^>]*aria-label="Settings"/.test(html) && /\$\('settingsBtn'\)\.onclick = \(\) => cellar\.open\('settings'\)/.test(app) && /\$\('cellarBtn'\)\.onclick = \(\) => cellar\.open\('shop', 'catalogue'\)/.test(app));
check('the page bar stays pinned, so the avatar screen reaches every Settings and Models page', /class="tabs cellar-tabs"/.test(ui) && /\.cellar \.cellar-tabs \{ position: sticky/.test(css) && /--cellar-head-h/.test(ui) && /cellar\.open\('shop', 'catalogue'\)/.test(app));
check('the title says which page is open', /\$\('cellar-title'\)\.textContent = page/.test(ui));
const every = ui.slice(ui.indexOf('function everydayHtml'), ui.indexOf('\n  }\n', ui.indexOf('function everydayHtml')));
check('Everyday rows: voice (1.5.33: engine, the voice nested inside it, Play sample, More), look, theme, animations, cat, one brain', /Bob\\'s voice', voicePickHtml\(\)[\s\S]*data-tab="speech">More voice settings/.test(every) && /'Play sample'/.test(ui) && /Bob\\'s look/.test(every) && /'Theme'/.test(every) && /data-motion/.test(every) && /data-set="catName"/.test(every) && /sswitch\('oneBrain'/.test(every));
check('Everyday: start-up and update checks (both off unless turned on), version, card and disk, Check for updates, first-time setup', /sswitch\('autostart'/.test(every) && /sswitch\('autoCheck'/.test(every) && /settings\.version\?\.label/.test(every) && /hw\?\.gpu/.test(every) && /data-checkupdate>Check for updates/.test(every) && /data-welcome>Run first-time setup/.test(every));
check('the Downloads button is out of Settings (Downloads has its own menu item)', !/<strong>Downloads<\/strong>/.test(ui) && /id="dlBtn"/.test(html));
// No "Show advanced settings" switch. Simple (cards) or Advanced (a side list), one toggle, own window.
{
  const map = await import('../public/settings-map.js'), link = await import('../public/settings-link.js');
  const advIds = [...ui.slice(ui.indexOf('const ADV = ['), ui.indexOf('// "?" next to a heading')).matchAll(/^    \['([a-z]+)', '/gm)].map((m) => 'adv-' + m[1]);
  const evIds = [...new Set([...ui.matchAll(/panel\('(ev-[a-z]+)'/g), ...ui.matchAll(/\['(ev-[a-z]+)', '/g)].map((m) => m[1]))];
  const panels = [...advIds, ...evIds], listed = map.allTopics(), carded = map.CARDS.flatMap((c) => c.topics);
  check('the old switch is gone from the page', !/data-advanced/.test(ui) && !/Show advanced settings/.test(ui) && !/Show advanced settings/.test(read('public/help-content.js').replace(/faq-advanced-switch[\s\S]*?\},\r?\n/, '').replace(/words: '[^']*'/g, '')));
  check('every panel is in the side list exactly once, and on exactly one card', advIds.length >= 15 && evIds.length >= 7 && panels.every((p) => listed.filter((x) => x === p).length === 1 && carded.filter((x) => x === p).length === 1) && listed.every((p) => panels.includes(p)) && carded.every((p) => panels.includes(p)), JSON.stringify(panels.filter((p) => !listed.includes(p) || !carded.includes(p))));
  check('Simple has eight cards, each with a plain name and a line on what is inside', map.CARDS.length === 8 && map.CARDS.every((c) => c.name && c.about.endsWith('.') && c.about.length <= 70 && c.topics.length));
  check('Settings starts in Simple; someone who had the old switch on starts in Advanced; the toggle is remembered', map.startView(null, null) === 'simple' && map.startView(null, '1') === 'advanced' && map.startView('simple', '1') === 'simple' && map.startView('advanced', '0') === 'advanced' && map.startView('nonsense', null) === 'simple' && /localStorage\.setItem\(VIEW_KEY, view\)/.test(ui));
  check('old addresses still land: a moved panel, an id without adv-, and nothing for junk', map.topicFor('adv-connections', { 'adv-connections': 'adv-bobnet' }) === 'adv-bobnet' && map.topicFor('hands') === 'adv-hands' && map.topicFor('ev-pc') === 'ev-pc' && map.topicFor('nope') === '' && map.cardOf('adv-engines').id === 'brains' && map.groupOf('adv-bobnet') === 'Connections');
  check('the toggle is a labelled pair of radio buttons, and the search box works in both views', /role="radiogroup" aria-label="How Settings is laid out"/.test(ui) && /data-sview="\$\{v\}"/.test(ui) && /seg\('simple', 'Simple'\)\}\$\{seg\('advanced', 'Advanced'\)\}/.test(ui) && /sec\.classList\.toggle\('searching'/.test(ui));
  check('a jump from a card or Help opens the right section in either view', /if \(top\) showTopic\(top\.dataset\.panel\)/.test(ui) && /curCard = cardOf\(t\)\?\.id/.test(ui) && !/bob-settings-advanced', '1'/.test(ui));
  check('Settings gets its own window on a computer, and stays a page on a phone, a tablet or without a channel', link.wantsWindow({ hasChannel: true, width: 1280 }) && !link.wantsWindow({ hasChannel: true, width: 1280, coarse: true }) && !link.wantsWindow({ hasChannel: true, width: 500 }) && !link.wantsWindow({ hasChannel: false, width: 1280 }) && !link.wantsWindow({ hasChannel: true, width: 1280, standalone: true }) && !link.wantsWindow());
  check('the main window hands Settings to the window and falls back to the page when it cannot open', /createCellar\(\{ popOut: openSettingsWindow \}\)/.test(app) && /window\.open\(settingsUrl\(jump\), WINDOW_NAME, WINDOW_SIZE\)/.test(app) && /if \(!popOut\(jumpTo\)\) return false/.test(ui) && /if \(divert\(\) && !dlg\.open\) return;/.test(ui));
  check('only plain section ids travel in the window address', link.jumpFromHash('#adv-bobnet') === 'adv-bobnet' && link.jumpFromHash('#ev-pc') === 'ev-pc' && link.jumpFromHash('#<script>') === '' && link.jumpFromHash('#adv-' + 'x'.repeat(60)) === '' && link.jumpFromHash('#%E0%A4%A') === '' && link.settingsUrl('adv-hands') === '/settings.html#adv-hands' && link.settingsUrl('javascript:1') === '/settings.html');
  check('the main window acts only on messages it knows from the Settings window', link.accept(link.message('bob-caps')).kind === 'event' && link.accept(link.message('bob-web', { webSearch: true })).detail.webSearch === true && link.accept({ from: 'settings-window', name: 'bob-changed' }).kind === 'changed' && link.accept(link.message('bob-press', { id: 'ear' })).id === 'ear' && link.accept(link.message('bob-press', { id: 'send' })) === null && link.accept(link.message('click')) === null && link.accept({ from: 'elsewhere', name: 'bob-caps' }) === null && link.accept(null) === null);
  const win = read('public/settings.html'), winJs = read('public/settings-window.js'), main = read('electron/main.cjs');
  check('the Settings window page has the Settings page, Help and the two voice stand-ins, and loads only its own script', /<dialog id="cellar" class="cellar page"/.test(win) && /<dialog id="help"/.test(win) && /id="ear"[^>]*hidden/.test(win) && /id="speak"[^>]*hidden/.test(win) && /<title>Bob · Settings<\/title>/.test(win) && [...win.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]).join() === '/settings-window.js' && !/https?:\/\//.test(win));
  check('the window tells the main window what changed, and its own buttons are the way to close it', /for \(const name of RELAY\)/.test(winJs) && /tell\('bob-changed'\)/.test(winJs) && /addEventListener\('cancel', \(e\) => e\.preventDefault\(\)\)/.test(winJs) && /\.settings-window #cellar-close \{ display: none; \}/.test(css));
  check('Bob.exe lets /settings.html open as one ordinary window with the usual buttons', /url === base \+ '\/settings\.html' \|\| url\.startsWith\(base \+ '\/settings\.html#'\)/.test(main) && /title: 'Bob · Settings'/.test(main) && /settingsWin = child;/.test(main) && /child\.on\('closed', \(\) => \{ settingsWin = null; \}\)/.test(main) && !/settings\.html[\s\S]{0,400}frame: false/.test(main));
  const help = read('public/help-content.js');
  check('Help, a glossary entry for each and an FAQ say what changed, in Bob\'s voice', /set\('Simple or Advanced', 'Simple'/.test(help) && /set\('Settings in its own window'/.test(help) && /<dt>Advanced \(Settings\)<\/dt>/.test(help) && /<dt>Simple \(Settings\)<\/dt>/.test(help) && /<dt>Settings window<\/dt>/.test(help) && /id: 'faq-advanced-switch'/.test(help));
}
const adv = ui.slice(ui.indexOf('const ADV = ['), ui.indexOf('function settingsHtml'));
check('Advanced has (1.5.98 order) Brains, House style, Voice details, Look & feel, Speed & memory, Engines, Bob-Net, Online services, Other apps, Hands, Housekeeping, Check-ins, Remove Bob', ['Brains', 'House style', 'Voice details', 'Look & feel', 'Speed & memory', 'Engines', 'Bob-Net', 'Online services', 'Other apps', 'Hands', 'Housekeeping', 'Check-ins', 'Remove Bob'].every((w, i, a) => adv.includes(w) && (i === 0 || adv.indexOf(` ${w}', '`) > adv.indexOf(` ${a[i - 1]}', '`))) && /brainsPanelHtml\(\)/.test(adv) && /rolesHtml\(\)/.test(ui) && /speedMemoryHtml\(\)/.test(adv) && /enginesHtml\(\)/.test(adv) && /bobNetHtml\(\)/.test(adv) && /onlineHtml\(\)/.test(adv) && /otherAppsHtml\(\)/.test(adv));
check('old panel ids still work: Connections lands on Bob-Net, in jumps, remembered panels and Help', /ADV_MOVED = \{ 'adv-connections': 'adv-bobnet' \}/.test(ui) && /id === 'adv-connections' \? 'adv-bobnet'/.test(ui) && /'settings-connections': 'settings-bobnet'/.test(read('public/help.js')));
check('Advanced has a search box that filters sections', /data-ssearch/.test(ui) && /function filterSettings/.test(ui) && /settingsQuery = e\.target\.value; if \(settingsQuery\.trim\(\)\) applyView\(\)/.test(ui));
check('Voice details has Hey Bob and Read aloud, working the same switches as the left menu', /prox\('ear'/.test(ui) && /prox\('speak'/.test(ui) && /el\.dataset\.proxy/.test(ui));
{ // every page script parses (1.5.203: one unescaped apostrophe in a Settings line stopped the whole Settings page)
  const dir = fileURLToPath(new URL('../public/', import.meta.url));
  const bad = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).filter((f) => spawnSync(process.execPath, ['--check', path.join(dir, f)]).status !== 0);
  check('every script in public/ parses', bad.length === 0, bad.join(', '));
}
check('engine choice, engine downloads, fit to memory, speculative decoding and flags are in Engines', /function enginesHtml[\s\S]*engineGearHtml\(\)[\s\S]*labEngineHtml\(\)[\s\S]*Engine downloads[\s\S]*speedHtml\(\)/.test(ui) && /data-engine-now/.test(ui) && !/name="brainsEngine"/.test(ui) && /data-fit/.test(ui) && /Speculative decoding/.test(ui) && /Engine flags/.test(ui));
check('long help folds behind More', /const more = \(text\) => `<details class="more"><summary>More<\/summary>/.test(ui) && (ui.match(/\$\{more\(/g) || []).length >= 2);
check('animations and Now running buttons work on the Settings page too', /tab === 'settings' && \(b\.dataset\.motion \|\| b\.dataset\.nowneed\)/.test(ui));

// --- voice samples
check('every Kokoro voice ships a sample (the same ~5 s line for each)', BUNDLED_KOKORO.length === KOKORO_VOICES.length && BUNDLED_KOKORO.length === 22 && SAMPLE_LINE.split(' ').length <= 16);
check('npm run voice-samples makes all of them by default', /const list = only \? [^:]+ : BUNDLED_KOKORO/.test(read('installer/make-voice-samples.js')));

// --- pinned catalog
const catalog = JSON.parse(read('catalog.json'));
const files = catalog.models.flatMap((m) => (m.files || []).map((f) => ({ id: m.id, ...f })));
const bad = files.filter((f) => !(Number.isInteger(f.bytes) && f.bytes > 0) || (!f.sizeOnly && !/^[0-9a-f]{64}$/.test(f.sha256 || '')));
check(`every catalog file has its size, and its sha256 unless marked sizeOnly (${files.length} files)`, files.length > 40 && !bad.length, bad.map((f) => f.id).join(','));
// 1.5.37: plus the small text files of ACE-Step's music models (configs, tokenizer lists), which their commit pin holds.
const small = files.filter((f) => f.sizeOnly);
check('only small files are size-only: three Piper .onnx.json and the music models\' configs', small.every((f) => !f.sha256 && f.bytes < 50e6 && (/\.onnx\.json$/.test(f.url) || /\/ACE-Step\/Ace-Step1\.5\/resolve\/[0-9a-f]{40}\//.test(f.url))) && small.filter((f) => /\.onnx\.json$/.test(f.url)).length === 3);
const sameUrl = new Map();
for (const f of files) { const k = sameUrl.get(f.url); if (k && (k.bytes !== f.bytes || k.sha256 !== f.sha256)) check(`one file, one pin: ${f.url}`, false); sameUrl.set(f.url, f); }

// A file that changed upstream is stopped before anything downloads.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-pin-'));
const dataDir = path.join(root, 'inn', 'bob'); fs.mkdirSync(dataDir, { recursive: true });
const content = crypto.randomBytes(5000);
const sha = crypto.createHash('sha256').update(content).digest('hex');
const mini = { packs: [], categories: [{ id: 'voice', label: 'Voice' }], models: [{ id: 'pin-test', name: 'Pin test', category: 'voice', sizeGB: 0.01, files: [{ url: 'https://huggingface.co/x/y/resolve/main/pin.bin', role: 'model', bytes: content.length, sha256: sha }] }] };
fs.writeFileSync(path.join(dataDir, 'cat.json'), JSON.stringify(mini));
const cfg = { catalogFile: path.join(dataDir, 'cat.json'), agentDir: root, dataDir, innDir: path.join(root, 'inn'), bobModelsDir: path.join(root, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), modelSearchRoots: [], ollamaUrl: 'http://127.0.0.1:1', engine: 'ollama', models: {} };
const shop = new ModelShop(cfg, () => {});
let headSha = sha, headSize = content.length, gets = 0, served = content;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  if (opts.method === 'HEAD') return new Response(null, { status: 302, headers: { 'x-linked-etag': `"${headSha}"`, 'x-linked-size': String(headSize) } });
  // 1.5.32: on a mismatch Bob also asks Hugging Face's file list (not a download); here it agrees with the website.
  if (String(url).includes('/api/models/')) return new Response('[]', { status: 200 });
  gets++;
  const r = new Response(served, { status: 200 }); Object.defineProperty(r, 'url', { value: String(url) }); return r;
};
const entry = shop.catalog.models[0];
const tryFetch = async () => { try { await shop.fetchFiles(entry, {}, undefined, () => {}); return ''; } catch (e) { return e.message; } };
headSha = 'a'.repeat(64);
let msg = await tryFetch();
check('a pinned file whose checksum changed upstream is stopped before downloading', /changed on the website/.test(msg) && gets === 0, msg);
headSha = sha; headSize = content.length + 1;
msg = await tryFetch();
check('a pinned file whose size changed upstream is stopped before downloading', /different size/.test(msg) && gets === 0, msg);
headSize = content.length; served = Buffer.concat([content, Buffer.from('x')]);
msg = await tryFetch();
check('a download that comes through the wrong size is deleted', /wrong size/.test(msg) && !fs.existsSync(path.join(cfg.bobModelsDir, 'voice', 'pin.bin.part')), msg);
served = content;
msg = await tryFetch();
check('the pinned file downloads and checks out', msg === '' && fs.existsSync(path.join(cfg.bobModelsDir, 'voice', 'pin.bin')), msg);
globalThis.fetch = realFetch;

// --- Hands self-test (ping is swapped for a 30-second node, since this test box may not have ping)
const run = (o) => (o.cmd === 'ping' ? runCommand({ ...o, cmd: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)'] }) : runCommand(o));
const logs = [];
const before = fs.readdirSync(cfg.innDir);
const st = await selfTest({ ...cfg, recycleBin: false, hands: { enabled: false, files: { on: false }, run: { on: false }, folders: [] } }, { run, log: (k, t) => logs.push(`${k}: ${t}`) });
const byName = (n) => st.results.find((r) => r.name.startsWith(n));
check('self-test: recycle a file, Undo, and it\'s back', byName('Recycle')?.ok, byName('Recycle')?.says);
check('self-test: tidy 3 files, Undo, and they\'re back', byName('Tidy')?.ok, byName('Tidy')?.says);
check('self-test: git --version', byName('Run git')?.ok, byName('Run git')?.says);
check('self-test: a 30-second run is stopped and its process is gone', byName('Start a 30')?.ok, byName('Start a 30')?.says);
if (process.platform === 'win32') check('self-test: the Windows task Status runs on Windows', byName('Ask the Windows')?.ok && !/Skipped/.test(byName('Ask the Windows')?.says), byName('Ask the Windows')?.says);
else check('self-test: the Windows task Status is skipped off Windows', byName('Ask the Windows')?.ok && /Skipped/.test(byName('Ask the Windows')?.says));
check('self-test cleans up its throwaway folder and logs to the logbook', st.cleaned && JSON.stringify(fs.readdirSync(cfg.innDir)) === JSON.stringify(before) && logs.some((l) => /self-test \(your click\): 5 of 5/.test(l)), JSON.stringify(logs));
check('self-test works with every Hand off (it is your click, on dummy files only)', st.passed === 5);
check('the Self-test button is in Settings, Hands, and the route is PC-only', /data-hselftest>Run the self-test/.test(hands) && /if \(!isLocal\)[\s\S]*\/api\/hands\/selftest/.test(read('src/hands-routes.js')));

// ---------- Nothing appears, disappears or locks because a box isn't ticked ----------
{
  const page = (f) => read(f).replace(/\r\n/g, '\n');
  const cellarSrc = publicText('cellar.js'), handsSrc = page('public/hands.js'), tg = page('public/telegram.js'), dc = page('public/discord.js'), phone = page('public/phone-access.js');
  check('no Settings switch is drawn only when another setting is on', !/\$\{settings\.[\w.?]+( === true| !== false)? \? sswitch\(/.test(cellarSrc));
  check('"Auto notes" and "Lab: Professional mode" are always there', /\$\{sswitch\('smartNotes'/.test(cellarSrc) && /\$\{sswitch\('labPro'/.test(cellarSrc));
  check('Housekeeping and the Qwen numbers can be set before their switch is on', !/hk\.enabled \? '' : 'disabled'/.test(cellarSrc) && !/data-qfield[^\n]*\$\{on \? '' : 'disabled'\}/.test(cellarSrc) && !/data-qreset[^\n]*\$\{on \? '' : 'disabled'\}/.test(cellarSrc));
  check('each brain\'s size can be picked before "Context size per brain" is on', !/\$\{on \? \(rows \?/.test(cellarSrc) && !/\$\{on && bctx\?\.canStretch/.test(cellarSrc));
  check('each Hand, and working without asking, can be ticked before Hands is on', !/data-hfree[^\n>]*\$\{s\.enabled \? '' : 'disabled'\}/.test(handsSrc) && !/data-hand=[^\n>]*\$\{s\.enabled \? '' : 'disabled'\}/.test(handsSrc));
  check('a recipe can be added before the Run programs Hand is on', !/\$\{s\.enabled && s\.run\?\.on \? `<details/.test(handsSrc));
  check('Telegram and Discord choices can be made before they are on', !/, !v\.(enabled|dmEnabled)\)/.test(tg + dc) && !/\$\{off \? 'disabled' : ''\}/.test(dc) && !/\$\{v\.(enabled|dmEnabled) \? `<div class="row"><strong>Your (Telegram|Discord) account/.test(tg + dc));
  check('"Home network access" is there before the door is open', !/\$\{v\.enabled \? `<label class="switch"><input type="checkbox" data-phone-home/.test(phone));
  check('the style guide carries the rule', /never appears, disappears or locks because a box isn't ticked/.test(read('docs/SETTINGS-STYLE.md')));
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
