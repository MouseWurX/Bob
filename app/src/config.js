// Loads config.json and works out the folders Bob uses.
import { cleanJobHelps } from './job-helps.js';
import { cleanTextSize, cleanPlace } from './everyday.js';
import { cleanOwnModels } from './own-models.js';
import { cleanHouseStyle } from '../public/house-style.js';
import { cleanPresetList } from './presets.js';
import { cleanHousekeeping } from './hk-settings.js';
import { cleanBrainCtx } from './model-ctx.js';
import { cleanBrainPlace } from './brain-place.js';
import { EXTRA_SWITCHES, cleanMemType } from './engine-extras.js'; // list items 94-100
import { cleanCheckins } from './checkin-settings.js';
import { cleanHands } from './hands-settings.js';
import { cleanPresets } from './model-family.js';
import { cleanSelfWork, applyCodeCopy } from './self-work.js';
import fs from 'node:fs';
import { writeJsonAtomic, readJsonFile } from './util.js';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { exeName, onPath } from './platform.js';
import { applyZone } from './local-zone.js';
import { cleanRentals } from './rental.js'; // 1.5.127 rented brains
import { cleanAdded } from './catalog-added.js'; // 1.5.205 model pages added by the owner
import { cleanBackup } from './backup-settings.js'; // Back up and move
import { applyWaitingRestore } from './backup-apply.js';
import { openBox, useBox, lockOn, mapSecrets, plainCount, writeSecretJson, openCopy, useKeysFile, memoryKeeper, IN_TEST, ensureBox } from './secret-box.js';
import { HARNESS_KEYS, cleanHarness } from './harness.js'; // items 62 to 72

// Where Ollama keeps its models on this PC: OLLAMA_MODELS if it's set, else Bob's own models folder if Ollama's files
// are there (how the installer sets Ollama up), else Ollama's usual folder in the user's home (~/.ollama/models).
export function ollamaModelsDir({ agentDir, env = process.env, home = os.homedir(), exists = fs.existsSync } = {}) {
  if (env.OLLAMA_MODELS) return env.OLLAMA_MODELS;
  const own = agentDir && path.join(agentDir, 'models');
  if (own && exists(path.join(own, 'manifests'))) return own;
  const usual = path.join(home, '.ollama', 'models');
  return exists(usual) || !own ? usual : own;
}
// Pinokio's usual homes (it asks where on first run): the root of any drive, or the user's home.
export function pinokioRoots({ home = os.homedir(), exists = fs.existsSync, platform = process.platform } = {}) {
  const homes = platform === 'win32' ? [...'CDEFG'].map((d) => `${d}:\\pinokio`) : [];
  homes.push(path.join(home, 'pinokio'));
  return homes.filter((h) => exists(h)).flatMap((h) => [path.join(h, 'api'), path.join(h, 'drive')]);
}

export const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// In a copy of Bob's source, his files are in the repository's app folder, with README, CHANGELOG and .github
// one level up. The repository folder then plays the part the source folder played before (config.json, the folder
// above it as Bob's home). '' when Bob isn't running from such a copy (Bob.exe, Bob.app, an AppImage, an old layout).
export function repoDir(dir = appDir, exists = fs.existsSync) {
  const up = path.dirname(dir);
  return path.basename(dir) === 'app' && exists(path.join(up, 'CHANGELOG.md')) && exists(path.join(up, '.github')) ? up : '';
}
// The folder a copy of the source is known by: the repository when there is one, else Bob's own folder.
export const sourceRoot = (dir = appDir, exists = fs.existsSync) => repoDir(dir, exists) || dir;
// Files other programs run (Python scripts) can't be read from inside Bob.exe's app.asar, so the build
// keeps them unpacked next to it.
export const unpackedDir = appDir.replace(/app\.asar(?=$|[\\/])/, 'app.asar.unpacked');

// 1.5.32: config.json's llamacpp.ctx above this is from before 1.5.19 and is set aside (see loadConfig).
export const LEGACY_CTX_CAP = 32768;

export function loadConfig() {
  const file = process.env.BOB_CONFIG || path.join(sourceRoot(), 'config.json');
  // A fresh copy of the source has no config.json (it's never published): start from the example.
  if (!process.env.BOB_CONFIG && !fs.existsSync(file)) fs.copyFileSync(path.join(appDir, 'config.example.json'), file);
  const cfg = readJsonFile(file);
  const asRead = structuredClone(cfg); // config.json as it is on disk, for locking any plain secrets in it (below)
  cfg.configFile = file;
  if (process.env.BOB_AGENT_DIR) cfg.agentDir = process.env.BOB_AGENT_DIR;
  if (process.env.BOB_OLLAMA_URL) cfg.ollamaUrl = process.env.BOB_OLLAMA_URL;
  if (process.env.BOB_PORT) cfg.port = Number(process.env.BOB_PORT);
  // Fresh installs: Bob's home is the folder above his code (for example Bob home; %LOCALAPPDATA%\Bob otherwise).
  cfg.agentDir = cfg.agentDir || path.dirname(sourceRoot());
  if (!cfg.readRoots || !cfg.readRoots.length) {
    const home = os.homedir();
    cfg.readRoots = ['Documents', 'Desktop', 'Downloads'].map((d) => path.join(home, d)).filter((d) => fs.existsSync(d));
  }
  cfg.models = cfg.models || {};
  cfg.painter = cfg.painter || { engine: 'comfy' };
  cfg.painter.sdcpp = cfg.painter.sdcpp || {};
  // Engine programs: zips differ (some put them in bin\ or Release\), so look in each likely place.
  cfg.painter.sdcpp.exe = findExe(cfg.painter.sdcpp.exe, path.join(cfg.agentDir, 'sd.cpp'), [exeName('sd-cli'), exeName('sd')]);
  cfg.llamacpp = cfg.llamacpp || {};
  cfg.llamacpp.exe = pickLlamaExe(cfg.llamacpp.exe, cfg.agentDir, { brainEngine: cfg.llamacpp.brainEngine });
  if (cfg.stt?.provider === 'whispercpp') cfg.stt.exe = findExe(cfg.stt.exe, path.join(cfg.agentDir, 'whisper.cpp'), [exeName('whisper-cli')]);
  cfg.tts = cfg.tts || {};
  cfg.tts.exe = findExe(cfg.tts.exe, path.join(cfg.agentDir, 'piper'), [exeName('piper')]);

  cfg.innDir = cfg.innDir || path.join(cfg.agentDir, 'inn');
  cfg.dataDir = path.join(cfg.innDir, 'bob');
  cfg.ledgerDir = path.join(cfg.innDir, 'ledger');
  cfg.painterDir = path.join(cfg.innDir, 'painter');
  cfg.defaultPainterDir = cfg.painterDir; // 1.5.41: Bob's own folder for what he makes; "Where Bob saves things" can pick another
  cfg.archiveDir = path.join(cfg.innDir, 'archive');
  cfg.noticeBoard = path.join(cfg.innDir, 'notice-board.md');
  cfg.logbook = path.join(cfg.innDir, 'logbook.md');
  cfg.memoryFile = path.join(cfg.innDir, 'bob-memory.md');
  cfg.readRoots = [...new Set([cfg.innDir, ...(cfg.readRoots || [])])];
  // Bob's own code, the backups, and his settings/data folder (inn\bob: settings.json, reminders, file backups)
  // are never writable through his file tools, so he can't flip settings such as autostart himself.
  // ownReadOnlyRoots stay read-only always; the user's own read-only projects can be opened up with the
  // "Read-only projects stay read-only" hard limit in Settings, Hands (hands-settings.js readOnlyRoots).
  cfg.ownReadOnlyRoots = [appDir, path.join(cfg.agentDir, 'backup'), cfg.dataDir];
  cfg.readOnlyRoots = [...new Set([...(cfg.readOnlyRoots || []), ...cfg.ownReadOnlyRoots])];
  // The name Bob falls back to: the one in config.json, else the Windows user name.
  cfg.windowsName = cfg.userName || (os.userInfo().username || 'friend').replace(/^./, (c) => c.toUpperCase());
  cfg.userName = cfg.windowsName;
  // 1.5.207: Windows' own offset wins when Node's zone library can't match the Windows zone (local-zone.js).
  // A zone set by hand in config.json stays as it is. Never UTC on a computer whose clock isn't UTC.
  Object.defineProperty(cfg, 'timeZoneSet', { enumerable: false, value: Boolean(cfg.timeZone), writable: true });
  applyZone(cfg);
  cfg.comfy = cfg.comfy || {};
  if (cfg.comfy.workflowFile && !path.isAbsolute(cfg.comfy.workflowFile)) {
    cfg.comfy.workflowFile = path.join(appDir, cfg.comfy.workflowFile);
  }
  cfg.bobModelsDir = cfg.bobModelsDir || path.join(cfg.agentDir, 'models', 'bob');
  // 1.5.56: no assumption that this PC is laid out like the one Bob was made on. Ollama's models are wherever
  // Ollama keeps them (OLLAMA_MODELS, else its own folder in the user's home), and the other-apps scan looks for
  // Pinokio wherever it's commonly installed. config.json can still name either by hand.
  cfg.llamacpp.ollamaModelsDir = cfg.llamacpp.ollamaModelsDir || ollamaModelsDir({ agentDir: cfg.agentDir });
  cfg.modelSearchRoots = cfg.modelSearchRoots || [path.join(cfg.agentDir, 'models'), cfg.llamacpp.ollamaModelsDir, ...pinokioRoots()];
  for (const d of [cfg.innDir, cfg.dataDir, cfg.ledgerDir, cfg.painterDir, cfg.archiveDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
  // Back up and move: a restore picked in Settings waits until now, before anything below reads Bob's files.
  try { cfg.restored = applyWaitingRestore(cfg); if (cfg.restored) console.error(`Restored ${cfg.restored.placed} file(s) from a backup${cfg.restored.failed.length ? `, ${cfg.restored.failed.length} couldn't go in` : ''}.`); } catch (e) { console.error(`The waiting restore didn't go in: ${e.message}`); }
  // Choices made in Bob's window (models, painter, voice, autostart) live in inn\bob\settings.json,
  // so config.json stays as installed. Only these keys can be changed from the window.
  // 1.5.32: an older config.json can carry llamacpp.ctx 131072 from before 1.5.19. Staging never touches config.json, so
  // that old number made every brain start with a 131K context (slow, and a 26B brain spills off a 16 GB card). Anything
  // above the 32K default in config.json is set aside (kept as legacyCtx, and logged). A context picked in Bob's window
  // (Settings, Speed & memory, saved in settings.json) still wins, because it is applied just below.
  if (Number(cfg.llamacpp?.ctx) > LEGACY_CTX_CAP) {
    cfg.llamacpp.legacyCtx = cfg.llamacpp.ctx;
    delete cfg.llamacpp.ctx;
    console.error(`config.json asks for a ${cfg.llamacpp.legacyCtx}-token context for every brain; using each session's own size instead (pick one in Settings, Brains to override).`);
  }
  cfg.settingsFile = path.join(cfg.dataDir, 'settings.json');
  const hand = { engine: cfg.engine, brainEngine: cfg.llamacpp?.brainEngine }; // what config.json itself says
  try { mergeSettings(cfg, readJsonFile(cfg.settingsFile)); } catch {}
  // 1.5.196: Brain Engine is the only engine for Bob's brains (onlyBrainEngine, below). An older pick of plain llama.cpp
  // or Ollama in Settings is set aside here, after settings.json, and the program is picked again with that.
  cfg.engineMoved = onlyBrainEngine(cfg, { hand });
  if (cfg.engineMoved.length) cfg.llamacpp.exe = pickLlamaExe(cfg.llamacpp.exe, cfg.agentDir, { brainEngine: cfg.llamacpp.brainEngine });
  // "What should Bob call you?" (Attributes, first-run). Kept in inn\bob\settings.json, never in config.json.
  if (cfg.callMe) cfg.userName = cfg.callMe;
  cfg.autostart = cfg.autostart === true; // opt-in: off unless the user turned it on
  applySaveDir(cfg);
  openSecrets(cfg, asRead);
  return cfg;
}

// 🔐 Locked secrets (src/secret-box.js, on by default): open Bob's box, read config.json's locked passcodes, tokens and
// keys into memory, and lock any still plain on disk (from an older Bob) the first time he starts. A box that can't
// be opened leaves the file as it is. What happened goes in cfg.boxNotes for the logbook.
function openSecrets(cfg, asRead) {
  cfg.boxNotes = [];
  const box = useBox(openBox({ dataDir: cfg.dataDir, keepers: IN_TEST || process.env.BOB_TEST === '1' ? [memoryKeeper('test')] : undefined, log: (m) => cfg.boxNotes.push(m) }));
  useKeysFile(path.join(cfg.dataDir, 'keys.json'));
  mapSecrets(cfg, (v) => box.open(v));
  if (box.stuck) cfg.boxNotes.push(`locked secrets: the box (${box.label}) didn't open, so saved passcodes and keys read as empty until it does or a new box is started`);
  if (!lockOn(cfg) || !box.ready) return;
  const plain = plainCount(asRead);
  if (!plain) return;
  try {
    writeSecretJson(cfg, cfg.configFile, asRead, 2);
    cfg.boxNotes.push(`locked secrets: locked ${plain} plain secret${plain === 1 ? '' : 's'} in config.json with ${box.label}`);
  } catch (e) { cfg.boxNotes.push(`locked secrets: couldn't lock config.json (${e.code || e.message})`); }
}

// config.json with its secrets opened, for the Settings savers that change one part of it and write it back.
export const readConfigFile = (cfg) => openCopy(readJsonFile(cfg.configFile), ensureBox(cfg));
// ...and written back with every secret locked (unless Locked secrets is switched off).
export const writeConfigFile = (cfg, raw) => writeSecretJson(cfg, cfg.configFile, raw, 2);

// The configured program if it exists; otherwise the first match in the engine folder, its bin\ or Release\ subfolder.
// 1.5.169: Brain Engine (Bob's fork of llama.cpp, Settings > Engines) is the default engine for brains. When its
// folder holds llama-server, Bob runs his brains on it, unless Settings, Engines says plain llama.cpp
// (llamacpp.brainEngine false). A llama-server set by hand somewhere else always wins; one set to Bob's own llama.cpp
// folder counts as the default. No Brain Engine (a Mac, an ARM board, not downloaded): llama.cpp as before.
export function pickLlamaExe(configured, agentDir, { brainEngine, platform = process.platform, exists = fs.existsSync } = {}) {
  const everyday = path.join(agentDir, 'llama.cpp'), be = path.join(agentDir, 'brain-engine');
  const within = (dir, p) => { const r = path.relative(dir, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
  if (configured && exists(configured) && !within(everyday, configured) && !within(be, configured)) return configured;
  const name = platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  const look = (dir, subs) => { for (const sub of subs) { const p = path.join(dir, sub, name); if (exists(p)) return p; } return null; };
  if (brainEngine !== false) { const p = look(be, ['', 'bin']); if (p) return p; }
  if (configured && exists(configured) && within(everyday, configured)) return configured;
  const p = look(everyday, ['', 'bin', 'Release', path.join('build', 'bin')]);
  if (p) return p;
  if (platform === 'linux') { const q = onPath(name); if (q) return q; }
  return configured && !within(be, configured) ? configured : path.join(everyday, name);
}

// 1.5.196 (the owner, Nov 10: "Bob's Brain Engine should be the only engine", the others don't fit him any more).
// Where Brain Engine has a build (Windows, x64 Linux), it is the only engine for Bob's brains: an old pick of plain llama.cpp
// or Ollama moves to it. Where it has none yet (a Mac, an ARM board), Bob's own llama.cpp runs them until it does.
// Ollama is never the brains' engine now. Until Brain Engine is downloaded, the llama.cpp already here stands in.
// Returns the engines moved away from, for the logbook.
export const brainEngineBuilt = (platform = process.platform, arch = process.arch) => platform === 'win32' || (platform === 'linux' && arch === 'x64');
// As with a llama-server set by hand, an engine written by hand into config.json itself still wins (hand).
export function onlyBrainEngine(cfg, { platform, arch, hand = {} } = {}) {
  const moved = [];
  if (cfg.engine === 'ollama' && hand.engine !== 'ollama') { cfg.engine = 'llamacpp'; moved.push('Ollama'); }
  cfg.llamacpp = cfg.llamacpp || {};
  if (brainEngineBuilt(platform, arch) && cfg.llamacpp.brainEngine === false && hand.brainEngine !== false) { cfg.llamacpp.brainEngine = true; moved.push('llama.cpp'); }
  return moved;
}

export function findExe(configured, dir, names, platform = process.platform) {
  if (configured && fs.existsSync(configured)) return configured;
  // Linux and Mac programs have no .exe; on Linux one the distro installed (on the PATH) counts too.
  if (platform !== 'win32') names = [...new Set(names.map((n) => n.replace(/\.exe$/i, '')))];
  for (const sub of ['', 'bin', 'Release', path.join('build', 'bin')]) {
    for (const n of names) { const p = path.join(dir, sub, n); if (fs.existsSync(p)) return p; }
  }
  if (platform === 'linux') for (const n of names) { const p = onPath(n); if (p) return p; }
  return configured || path.join(dir, names[0]);
}

// Bob's version. Before 1.0: 0.9.<build> (0.9.28, branch work 0.9.28a). From 1.0.0 (the first public
// release): <release>.<patch>, so 1.0.0, 1.0.1 for fixes, 1.1.0 for new features (release "1.1", patch 0).
// The build number goes up with every drop and never resets; it's what the update check compares, so
// 1.0.0 (build 37) is newer than 0.9.36 (build 36). A letter marks unmerged branch work (1.0.1a).
// This is the ONE place the label is made; package.json "version" must match it (a test checks).
export function formatVersion({ release = '0.9', branch = '', build = 0, patch } = {}) {
  const last = patch !== undefined && patch !== null && patch !== '' ? Number(patch) || 0 : Number(build) || 0;
  return `${release}.${last}${/^[a-z]$/.test(branch || '') ? branch : ''}`;
}
export const VERSION = (() => {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).bob || {};
    const v = { release: String(b.release || '0.9'), branch: /^[a-z]$/.test(b.branch || '') ? b.branch : '', build: Number(b.build) || 0, ...(b.patch !== undefined ? { patch: Number(b.patch) || 0 } : {}) };
    return { ...v, label: formatVersion(v) };
  } catch { return { release: '0.9', branch: '', build: 0, label: '0.9.0' }; }
})();

// Languages Bob's screens come in (public/i18n.js has the names and words). English is the default.
export const LANGUAGES = ['en', 'fr', 'es'];
export const cleanRemoved = (v) => [...new Set((Array.isArray(v) ? v : []).filter((k) => typeof k === 'string' && /^[\w.:/-]{1,100}$/.test(k)))].slice(0, 500);
export const SETTING_KEYS = ['copyGuess', 'preloadNext', 'speedLog', 'newCardTest', 'laptopMode', 'engineNotes', 'brainMemType', 'language', 'catalogRemoved', 'catalogAdded', 'catalogAddedGot', 'brainPlace', 'smartNotes', 'toolLearning', 'toolHelp', 'quickNotes', 'docTools', 'docView', 'sandboxCode', 'parts3d', 'model3d', 'planFirst', 'engine', 'models', 'painter', 'stt', 'llamacpp', 'autostart', 'setupDone', 'wantsAsked', 'gpuVramGB', 'maestro', 'look', 'cloudHelpers', 'tts', 'workshop', 'catName', 'oneBrain', 'ollamaKeepAlive', 'style', 'session', 'sessionBrains', 'sessionCtx', 'downloads', 'updates', 'housekeeping', 'personality', 'lookComments', 'lookChange', 'callMe', 'hands', 'scheduleTask', 'brainMode', 'allTools', 'quickOnCpu', 'chatWhileBusy', 'mootBeside', 'quarantine', 'resumeJobs', 'autoSession', 'gamingLock', 'sessionBy', 'pictureNoWait', 'readyWhileTyping', 'gamesFirst', 'pictureFit', 'webSearch', 'howtos', 'gamingCard', 'houseStyle', 'memoryRecall', 'projectList', 'defaultProject', 'saveDir', 'saveDirsUsed', 'activeModels', 'checkins', 'brainCtxOn', 'brainCtxStretch', 'brainCtx', 'tray', 'lookIcon', 'adventure', 'games', 'rentals', 'naughtyList', 'ownModels', 'catalogUpdates', 'computerLab', 'qwenPresets', 'labForgeStart', 'labRecheck', 'labExtras', 'labPro', 'labEngine', 'selfWork', 'engineUpdates', 'netReview', 'editOwn', 'quickSeesJob', 'string', 'docMeaning', 'chatPresets', 'presetList', 'chatRedo', 'chatFiles', 'mathView', 'shortcuts', 'promptMenu', 'backup', 'lockSecrets', ...HARNESS_KEYS, 'jobHelps', 'textSize', 'readableFont', 'profilesOn', 'todayCard', 'todayPlace', 'focusTimer', 'receipts', 'updateTour', 'tourSeen', 'trayDot', 'talkOver', 'readDocs', 'netVoices', 'netVoiceMap', 'carryIn', 'phoneGlance', 'apuHoldbackGB'];
const LOCKED_LLAMACPP = ['exe', 'preArgs'];

function deepMerge(into, from) {
  for (const [k, v] of Object.entries(from)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && into[k] && typeof into[k] === 'object' && !Array.isArray(into[k])) deepMerge(into[k], v);
    else into[k] = v;
  }
  return into;
}

function clean(patch) {
  const out = {};
  for (const k of SETTING_KEYS) if (k in (patch || {})) out[k] = patch[k];
  if (out.llamacpp) { out.llamacpp = cleanLlamacpp(out.llamacpp); for (const k of LOCKED_LLAMACPP) delete out.llamacpp[k]; }
  if ('sessionCtx' in out) {
    const sc = out.sessionCtx || {};
    out.sessionCtx = {};
    for (const k of ['normal', 'art', 'coding', 'office', 'deep', 'light']) if (k in sc) out.sessionCtx[k] = [8192, 16384, 32768, 65536, 131072, 262144].includes(sc[k]) ? sc[k] : null;
  }
  if (out.painter?.sdcpp) { out.painter = { ...out.painter, sdcpp: { ...out.painter.sdcpp } }; delete out.painter.sdcpp.exe; delete out.painter.sdcpp.preArgs; }
  if ('brainMode' in out) out.brainMode = out.brainMode === 'always' ? 'always' : 'wake';
  if ('ollamaKeepAlive' in out) out.ollamaKeepAlive = /^\d+[smh]$|^-1$/.test(String(out.ollamaKeepAlive)) ? String(out.ollamaKeepAlive) : undefined;
  if ('oneBrain' in out) out.oneBrain = out.oneBrain === true;
  if ('allTools' in out) out.allTools = out.allTools === true;
  if ('memoryRecall' in out) out.memoryRecall = out.memoryRecall === true; // 1.5.79, off unless switched on
  if ('resumeJobs' in out) out.resumeJobs = out.resumeJobs === true; // 1.5.16, off unless switched on
  if ('planFirst' in out) out.planFirst = out.planFirst === true; // 1.5.78 plan card, off unless switched on
  if ('quickOnCpu' in out) out.quickOnCpu = out.quickOnCpu === true;
  if ('brainCtxOn' in out) out.brainCtxOn = out.brainCtxOn === true; // 1.5.87, off unless switched on
  if ('brainCtxStretch' in out) out.brainCtxStretch = out.brainCtxStretch === true; // Long memory (YaRN), off unless switched on
  if ('brainCtx' in out) out.brainCtx = cleanBrainCtx(out.brainCtx);
  if ('brainPlace' in out) out.brainPlace = cleanBrainPlace(out.brainPlace); // 1.5.205 where a brain sits, by hand
  if ('chatWhileBusy' in out) out.chatWhileBusy = out.chatWhileBusy !== false;
  if ('mootBeside' in out) out.mootBeside = out.mootBeside === true; // 1.5.51, off unless switched on
  if ('apuHoldbackGB' in out) { const v = Math.round(Number(out.apuHoldbackGB) * 2) / 2; if (Number.isFinite(v) && v >= 0 && v <= 8) out.apuHoldbackGB = v; else delete out.apuHoldbackGB; } // 1.5.181 Memory kept for Windows (built-in graphics), 0 to 8 GB
  if ('netReview' in out) out.netReview = out.netReview === true; // #30, off unless switched on
  if ('lockSecrets' in out) out.lockSecrets = out.lockSecrets !== false; // 🔐 Locked secrets, ON unless switched off (src/secret-box.js)
  if ('webSearch' in out) out.webSearch = out.webSearch === true;
  if ('backup' in out) out.backup = cleanBackup(out.backup); // Back up and move: the automatic backup, off unless switched on
  if ('naughtyList' in out) out.naughtyList = out.naughtyList === true; // 1.5.132 "Show the naughty list", off unless switched on
  if ('catalogUpdates' in out) out.catalogUpdates = out.catalogUpdates === true; // 1.5.137 "Let Bob fetch his newest brain list", off unless switched on
  if ('ownModels' in out) out.ownModels = cleanOwnModels(out.ownModels); // 1.5.135 brains of your own (GGUF files on this replicant matrix)
  if ('computerLab' in out) out.computerLab = out.computerLab !== false; // 1.5.172 "Show the Computer Science Lab", on unless switched off (was off until 1.5.171)
  if ('labForgeStart' in out) out.labForgeStart = out.labForgeStart === true; // 1.5.160 "Let the Lab start Forge runs", off unless switched on
  if ('labEngine' in out) out.labEngine = ['brainengine', 'llamacpp'].includes(out.labEngine) ? out.labEngine : ''; // 1.5.17x the Lab's engine: '' = the same as Bob's brains
  if ('labExtras' in out) out.labExtras = Object.fromEntries(['hoverWords', 'tellPhone', 'saveQuestions'].map((k) => [k, out.labExtras?.[k] === true])); // Lab items 109, 110, 102: the Lab's three small switches, each off unless switched on
  if ('labRecheck' in out) out.labRecheck = out.labRecheck === true; // Nov 11 "Check my main brain after engine updates", off unless switched on
  if ('labPro' in out) out.labPro = out.labPro === true; // 1.5.168 the Lab's Professional mode: more controls on every tab; off = Keep it simple
  if ('qwenPresets' in out) out.qwenPresets = cleanPresets(out.qwenPresets); // 1.5.148 "Choose my own word settings", off unless switched on
  if ('selfWork' in out) out.selfWork = cleanSelfWork(out.selfWork); // "Let Bob work on repositories" (self-work.js), off by default
  if ('howtos' in out) out.howtos = out.howtos === true; // 1.5.79 "Let Bob learn how-tos", off by default
  if ('wantsAsked' in out) out.wantsAsked = out.wantsAsked === true; // the chat's one-time "Do you want me to" offer (wants.js)
  // List items 94-100, engine and speed extras (engine-extras.js), each off unless switched on
  for (const k of EXTRA_SWITCHES) if (k in out) out[k] = out[k] === true;
  if ('brainMemType' in out) out.brainMemType = cleanMemType(out.brainMemType); // 100 memory type per brain; Standard when not set
  if ('quickSeesJob' in out) out.quickSeesJob = out.quickSeesJob === true; // "Let Bob's Quick brain see the big job", off by default (meanwhile.js)
  if ('jobHelps' in out) out.jobHelps = cleanJobHelps(out.jobHelps); // Settings, Jobs: eleven switches, all off by default (job-helps.js)
  if ('editOwn' in out) out.editOwn = out.editOwn === true; // "Let Bob fix his own messages", off by default (edit-own.js)
  if ('chatRedo' in out) out.chatRedo = out.chatRedo !== false; // "Show Try again, Edit and Delete in the chat", ON unless turned off (owner's exception, redo.js)
  if ('quickNotes' in out) out.quickNotes = out.quickNotes === true; // "Let Bob take quick notes", off by default (notes.js)
  if ('smartNotes' in out) out.smartNotes = out.smartNotes === true; // "Let Bob notice what's worth noting", off by default (notes.js)
  if ('docTools' in out) out.docTools = out.docTools === true; // "Read and search my documents", off by default (my-docs.js)
  if ('docMeaning' in out) out.docMeaning = out.docMeaning === true; // "Search my documents by meaning", off by default (doc-index.js)
  if ('chatFiles' in out) out.chatFiles = out.chatFiles === true; // "Save chats as files and bring chats in", off by default (chat-files.js)
  // Voice, phone and Bob-Net (items 133 to 142, 2026-11-11): every switch off unless turned on.
  if ('talkOver' in out) out.talkOver = out.talkOver === true; // "Talk over Bob" (public/voice.js)
  if ('readDocs' in out) out.readDocs = out.readDocs === true; // "Read documents aloud" (public/read-aloud.js)
  if ('netVoices' in out) out.netVoices = out.netVoices === true; // "A voice per Bob" (src/tts.js netVoiceFor)
  if ('netVoiceMap' in out) out.netVoiceMap = cleanVoiceMap(out.netVoiceMap);
  if ('carryIn' in out) out.carryIn = out.carryIn === true; // "Take chats from my other Bobs" (src/carry.js)
  if ('phoneGlance' in out) out.phoneGlance = out.phoneGlance === true; // "Let my phone see how I'm doing" (src/glance.js)
  if ('mathView' in out) out.mathView = out.mathView === true; // "Show maths as formulas", off by default (public/math-core.js)
  if ('shortcuts' in out) out.shortcuts = out.shortcuts === true; // "Keyboard shortcuts", off by default (public/shortcuts.js)
  if ('docView' in out) out.docView = out.docView === true; // "Show documents in the side panel", off by default (files.js docPeek)
  if ('toolLearning' in out) out.toolLearning = out.toolLearning === true; // "Let Bob learn from his tools", off by default (tool-learn.js)
  if ('chatPresets' in out) out.chatPresets = out.chatPresets === true; // "Assistant presets for chats", off by default (presets.js)
  if ('presetList' in out) out.presetList = cleanPresetList(out.presetList); // the saved presets (presets.js)
  for (const k of HARNESS_KEYS) if (k in out) out[k] = cleanHarness(k, out[k]); // items 62 to 72 (src/harness.js), all off unless switched on
  // 🗓 Everyday helpers (everyday.js), all off by default; text size 100% unless moved.
  for (const k of ['readableFont', 'profilesOn', 'todayCard', 'focusTimer', 'receipts', 'updateTour', 'trayDot']) if (k in out) out[k] = out[k] === true;
  if ('textSize' in out) out.textSize = cleanTextSize(out.textSize);
  if ('todayPlace' in out) out.todayPlace = cleanPlace(out.todayPlace);
  if ('tourSeen' in out) out.tourSeen = typeof out.tourSeen === 'string' && /^\d+\.\d+\.\d+$/.test(out.tourSeen) ? out.tourSeen : '';
  if ('promptMenu' in out) out.promptMenu = out.promptMenu === true; // "Pull up saved prompts with /", off by default (prompts.js)
  if ('sandboxCode' in out) out.sandboxCode = out.sandboxCode === true; // "Let Bob work things out in a sandbox", off by default (sandbox-code.js)
  if ('parts3d' in out) out.parts3d = out.parts3d === true; // "Let Bob make 3D parts", off by default (parts3d.js)
  if ('model3d' in out) out.model3d = out.model3d === true; // "Let Bob turn pictures into 3D models", off by default (model3d.js)
  if ('tray' in out) out.tray = out.tray !== false; // 1.5.94 "Keep Bob in the tray"; on unless switched off since 1.5.134 (the owner asked for it)
  if ('lookIcon' in out) out.lookIcon = out.lookIcon !== false; // 1.5.94 "Use Bob's look as his icon"; on unless switched off since 1.5.134 (the owner asked for it)
  if ('houseStyle' in out) out.houseStyle = cleanHouseStyle(out.houseStyle); // 1.5.34 House style (public/house-style.js)
  if ('projectList' in out) out.projectList = cleanProjects(out.projectList); // 1.5.34 Projects in Settings
  if ('saveDir' in out) out.saveDir = cleanDir(out.saveDir); // 1.5.41 Where Bob saves things ('' = Bob's own folder)
  if ('saveDirsUsed' in out) out.saveDirsUsed = [].concat(out.saveDirsUsed || []).map(cleanDir).filter(Boolean).slice(0, 10);
  if ('defaultProject' in out) out.defaultProject = typeof out.defaultProject === 'string' ? out.defaultProject.slice(0, 60) : '';
  if ('gamingCard' in out) out.gamingCard = ['auto', 'never', 'always'].includes(out.gamingCard) ? out.gamingCard : 'auto'; // 1.5.32
  for (const k of ['readyWhileTyping', 'gamesFirst', 'pictureFit']) if (k in out) out[k] = out[k] === true; // 1.5.24, off unless switched on
  if ('sessionBy' in out) out.sessionBy = out.sessionBy === 'bob' ? 'bob' : 'you'; // 1.5.41: who picked the session now
  if ('gamingLock' in out) out.gamingLock = out.gamingLock === true; // 1.5.41 the 🎮 button, off until pressed
  if ('autoSession' in out) out.autoSession = out.autoSession !== false; // 1.5.41, on unless switched off (the owner's call)
  if ('pictureNoWait' in out) out.pictureNoWait = out.pictureNoWait !== false; // 1.5.20, on unless switched off
  if ('updates' in out) out.updates = { autoCheck: out.updates?.autoCheck === true };
  if ('engineUpdates' in out) out.engineUpdates = { auto: out.engineUpdates?.auto !== false }; // 1.5.184 Keep engines up to date, on unless switched off
  if ('housekeeping' in out) out.housekeeping = cleanHousekeeping(out.housekeeping || {});
  if ('checkins' in out) out.checkins = cleanCheckins(out.checkins || {}); // 1.5.78 Check-ins, off unless switched on
  if ('games' in out) { const g = out.games || {}; out.games = { brain: g.brain === 'main' ? 'main' : 'quick', talk: ['every', 'some', 'end'].includes(g.talk) ? g.talk : 'every', keep: g.keep === true, kid: g.kid === true }; } // 1.5.121 🧩 Games (defaults, nothing on); 1.5.206 Keep an unfinished game, off; Kid mode, off
  if ('adventure' in out) { const a = out.adventure || {}; const x = a.extras || {}; const extras = Object.fromEntries(['dice', 'sounds', 'voice', 'pictures', 'scenePics', 'portraits', 'music'].map((k) => [k, x[k] === true])); if (!extras.pictures) extras.scenePics = false; const r = a.rules || {}; const rules = Object.fromEntries(['map', 'coins', 'breath', 'secrets', 'riddles', 'badges'].map((k) => [k, r[k] === true])); out.adventure = { gm: a.gm === 'main' ? 'main' : 'biggest', players: a.players === 'gm' ? 'gm' : 'own', extras, rules, difficulty: ['easy', 'hard'].includes(a.difficulty) ? a.difficulty : 'normal' }; } // 1.5.206 table rules (all off) and difficulty (Normal) // 1.5.117 🎲 Adventure (defaults, nothing on); 1.5.204 table extras, all off unless ticked
  if ('hands' in out) out.hands = cleanHands(out.hands || {});
  if ('quarantine' in out) out.quarantine = { on: out.quarantine?.on === true };
  if ('downloads' in out) { const d = out.downloads || {}; out.downloads = { concurrent: Number(d.concurrent) === 2 ? 2 : 1, resumeOnStart: d.resumeOnStart === true }; }
  if ('session' in out) out.session = ['normal', 'art', 'coding', 'office', 'light'].includes(out.session) ? out.session : 'normal'; // 1.5.23: a saved 'deep' becomes Normal
  if ('sessionBrains' in out) {
    const sb = out.sessionBrains || {};
    out.sessionBrains = {};
    for (const k of ['small', 'gaming', 'coding', 'office', 'deep']) if (typeof sb[k] === 'string' && /^[\w.:/-]{1,100}$/.test(sb[k])) out.sessionBrains[k] = sb[k];
    // 1.5.56: the owner's rule, kept here too: Gemma 4 E4B is never the Gaming brain, whatever asks for it.
    if (/e4b/i.test(out.sessionBrains.gaming || '')) delete out.sessionBrains.gaming;
  }
  // 1.5.56: Active models (the Brain catalogue's switches): { "<catalog id or engine name>": true | false }.
  if ('activeModels' in out) {
    const a = out.activeModels && typeof out.activeModels === 'object' ? out.activeModels : {};
    out.activeModels = Object.fromEntries(Object.entries(a).filter(([k, v]) => /^[\w.:/-]{1,100}$/.test(k) && typeof v === 'boolean').slice(0, 300));
  }
  // 1.5.205 entries the owner took off this replicant matrix's own list (the shipped catalogue is never changed).
  if ('catalogRemoved' in out) out.catalogRemoved = cleanRemoved(out.catalogRemoved);
  if ('catalogAdded' in out) out.catalogAdded = cleanAdded(out.catalogAdded);
  if ('catalogAddedGot' in out) out.catalogAddedGot = cleanRemoved(out.catalogAddedGot);
  if ('style' in out) out.style = cleanStyle(out.style);
  if ('language' in out) out.language = LANGUAGES.includes(out.language) ? out.language : 'en';
  if ('catName' in out) out.catName = typeof out.catName === 'string' && /^[\p{L}\p{N}' .-]{1,24}$/u.test(out.catName.trim()) ? out.catName.trim() : undefined;
  if (out.workshop) {
    // The advanced workshop: on/off and the ComfyUI port only. The address is always this PC.
    const w = out.workshop || {};
    out.workshop = {};
    if (typeof w.enabled === 'boolean') out.workshop.enabled = w.enabled;
    if (Number.isInteger(w.port) && w.port >= 1024 && w.port <= 65535) out.workshop.port = w.port;
  }
  if (out.tts) {
    // Voice: which provider and voice files, and how fast. The program path can't be changed from here.
    const t = out.tts || {};
    out.tts = {};
    if (['piper', 'kokoro', 'chatterbox', ''].includes(t.provider)) out.tts.provider = t.provider;
    for (const k of ['model', 'config', 'voices', 'ref']) if (typeof t[k] === 'string') out.tts[k] = t[k];
    if (typeof t.voice === 'string' && /^[a-z]{2}_[a-z]{2,20}$/.test(t.voice)) out.tts.voice = t.voice;
    if (typeof t.speed === 'number') out.tts.speed = Math.min(2, Math.max(0.5, t.speed));
    // 1.5.33: the Windows voice picked by name ('' = Automatic). Only a plain name, nothing that could be a path.
    if (typeof t.windowsVoice === 'string') out.tts.windowsVoice = /^[\w .,()'-]{0,100}$/.test(t.windowsVoice) ? t.windowsVoice : '';
  }
  if (out.cloudHelpers) {
    // Only on/off and a model name per known provider. Addresses and keys can't be set from here.
    const ch = {};
    for (const [id, v] of Object.entries(out.cloudHelpers || {})) {
      if (!/^[a-z]{2,20}$/.test(id) || !v || typeof v !== 'object') continue;
      ch[id] = {};
      if (typeof v.enabled === 'boolean') ch[id].enabled = v.enabled;
      if (typeof v.model === 'string' && /^[\w.:/-]{1,100}$/.test(v.model)) ch[id].model = v.model;
    }
    out.cloudHelpers = ch;
  }
  if (out.rentals) out.rentals = cleanRentals(out.rentals); // 1.5.127 rented brains: switches, limits, the list; never a key
  if (out.maestro) { out.maestro = { ...out.maestro }; delete out.maestro.url; delete out.maestro.outputsDir; }
  if (out.stt) { out.stt = { ...out.stt }; delete out.stt.url; delete out.stt.apiKey; delete out.stt.apiKeyEnv; }
  return out;
}

// llama.cpp speed settings from the app. Extra arguments may only be flags and plain values (no paths),
// so nothing typed in the app can point llama-server at a file.
const ARG = /^(-{1,2}[a-z][a-z0-9-]*|[A-Za-z0-9_.:,+-]{1,40})$/;
const cleanArgs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && ARG.test(x)).slice(0, 40) : undefined);
function cleanLlamacpp(lc) {
  const out = { ...lc };
  if ('args' in out) out.args = cleanArgs(out.args);
  if (out.modelArgs && typeof out.modelArgs === 'object') {
    const m = {};
    for (const [k, v] of Object.entries(out.modelArgs)) if (/^[\w.:/-]{1,100}$/.test(k)) m[k] = v === null ? null : cleanArgs(v);
    out.modelArgs = m;
  }
  for (const k of ['threads', 'batch', 'ubatch', 'ctx']) if (k in out) out[k] = Number.isInteger(out[k]) && out[k] > 0 && out[k] <= 1048576 ? out[k] : null;
  if ('fit' in out) out.fit = typeof out.fit === 'boolean' ? out.fit : null;
  if ('noEyes' in out) out.noEyes = Array.isArray(out.noEyes) ? [...new Set(out.noEyes.filter((x) => typeof x === 'string' && /^[\w.:/-]{1,100}$/.test(x)))].slice(0, 200) : []; // Lab: brains loaded without their reader
  if ('brainEngine' in out) out.brainEngine = out.brainEngine !== false; // 1.5.169: run brains on Brain Engine when it's here
  if ('loadMode' in out) out.loadMode = out.loadMode === 'mmap' ? 'mmap' : 'auto'; // 1.5.90
  if ('draft' in out) {
    const d = out.draft || {};
    out.draft = {
      enabled: d.enabled !== false,
      model: typeof d.model === 'string' && /^[\w.:/\\ -]{1,260}$/.test(d.model) ? d.model : '',
      max: Number.isInteger(d.max) && d.max > 0 && d.max <= 64 ? d.max : 16,
      min: Number.isInteger(d.min) && d.min >= 0 && d.min <= 16 ? d.min : 1,
      ngld: Number.isInteger(d.ngld) && d.ngld >= 0 && d.ngld <= 999 ? d.ngld : 99
    };
  }
  // 1.5.16x Turbo, per brain (from the Lab's Turbo page or Settings): on/off, the draft brain by its model name (never
  // a path), or the brain's own built-in guesser, and how many words it guesses ahead. null removes a brain's row.
  if ('turbo' in out) {
    const t = {};
    for (const [k, v] of Object.entries(out.turbo && typeof out.turbo === 'object' ? out.turbo : {}).slice(0, 64)) {
      if (!/^[\w.:/-]{1,100}$/.test(k)) continue;
      if (v === null) { t[k] = null; continue; }
      if (!v || typeof v !== 'object') continue;
      const draft = typeof v.draft === 'string' && /^[\w.:/-]{1,100}$/.test(v.draft) && v.draft !== k ? v.draft : '';
      const mtp = v.mtp === true;
      if (!draft && !mtp) continue;
      t[k] = { on: v.on === true, draft: mtp ? '' : draft, mtp, max: Number.isInteger(v.max) && v.max >= 1 && v.max <= 32 ? v.max : 8 };
    }
    out.turbo = t;
  }
  return out;
}

// The Style page: which theme, and up to 24 home-made themes. Only colours, a font from a fixed list
// and corner roundness can be saved, so nothing here can inject code into the page.
const HEX = /^#[0-9a-f]{6}$/i;
const THEME_ID = /^[a-z0-9-]{2,40}$/;
const COLOR_KEYS = ['bg', 'panel', 'card', 'you', 'line', 'text', 'muted', 'accent', 'onAccent', 'good', 'warn', 'bad', 'spriteBg'];
const FONT_IDS = ['system', 'plex', 'mono', 'serif', 'rounded'];
const OLD_THEME_IDS = { system: 'moondust', slate: 'moondust', midnight: 'nightside', 'mousehole-dark': 'otterbend', 'mousehole-light': 'homestead', paper: 'sandbar', 'mousewurx-light': 'drydock', 'mousewurx-dark': 'drydock-night' }; // mirrors public/themes.js OLD_IDS
export function cleanStyle(st) {
  const out = {};
  if (!st || typeof st !== 'object') return out;
  // 1.5.136: themes were renamed after worlds; old saved names (and the dropped Match system) land on the new ones.
  if (typeof st.theme === 'string' && THEME_ID.test(st.theme)) out.theme = OLD_THEME_IDS[st.theme] || st.theme;
  if (['on', 'system', 'off'].includes(st.motion)) out.motion = st.motion;
  if (typeof st.openNowOnNeed === 'boolean') out.openNowOnNeed = st.openNowOnNeed;
  if (Array.isArray(st.custom)) {
    out.custom = st.custom.slice(0, 24).filter((t) => t && typeof t === 'object' && THEME_ID.test(String(t.id)) && String(t.id).startsWith('my-')).map((t) => {
      const colors = {};
      for (const k of COLOR_KEYS) if (HEX.test(String(t.colors?.[k] || ''))) colors[k] = String(t.colors[k]).toLowerCase();
      const name = typeof t.name === 'string' && /^[\p{L}\p{N}' .&()!-]{1,30}$/u.test(t.name.trim()) ? t.name.trim() : 'My theme';
      const theme = { id: String(t.id), name, group: 'Yours', colors };
      if (FONT_IDS.includes(t.font)) theme.font = t.font;
      if (Number.isFinite(t.radius)) theme.radius = Math.max(0, Math.min(20, Math.round(t.radius)));
      for (const f of ['blueprint', 'outlined', 'flat']) if (t[f] === true) theme[f] = true;
      return theme;
    });
  }
  return out;
}

// A voice per Bob: { "Bob on the laptop": "bm_george" }. Names as they are on the Bob-Net list, voices from Kokoro's list.
export function cleanVoiceMap(m) {
  const out = {};
  if (!m || typeof m !== 'object' || Array.isArray(m)) return out;
  for (const [k, v] of Object.entries(m).slice(0, 30)) {
    const name = String(k).replace(/[\u0000-\u001f<>"'`]/g, '').trim().slice(0, 40);
    if (name && (v === 'auto' || /^[a-z]{2}_[a-z]{2,12}$/.test(String(v)))) out[name] = String(v); // 'auto': picked from his name
  }
  return out;
}

export function mergeSettings(cfg, patch) {
  return applyProjects(deepMerge(cfg, clean(patch)));
}

// 1.5.34: projects picked in Settings (projectList) replace the hand-written "projects" in config.json once saved.
// An empty saved list means "no projects" (removed in Settings); no saved list keeps config.json's.
export function cleanProjects(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const p of list.slice(0, 50)) {
    const name = String(p?.name || '').replace(/[\u0000-\u001f<>{}"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const dir = String(p?.path || '').replace(/[\u0000-\u001f]/g, '').trim();
    if (!name || !dir || !path.isAbsolute(dir) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, path: dir });
  }
  return out;
}
// ---------- 1.5.41: Where Bob saves things ----------
// Pictures, clips, songs and sounds go to cfg.painterDir. That is Bob's own folder (inn\painter, shown as
// "Made by Bob") unless the user picked another in Settings (saveDir). Folders used before stay readable
// (saveDirsUsed), so pictures and songs in older chats still show after a change.
// A picked folder that has gone (an unplugged drive) means saving in Bob's own folder until it's back.
function cleanDir(d) {
  const s = typeof d === 'string' ? d.replace(/[\u0000-\u001f]/g, '').trim() : '';
  return s && path.isAbsolute(s) && s.length < 260 ? path.resolve(s) : '';
}
export function applySaveDir(cfg) {
  const own = cfg.defaultPainterDir || cfg.painterDir;
  cfg.defaultPainterDir = own;
  const want = cleanDir(cfg.saveDir);
  let ok = false;
  try { ok = Boolean(want) && fs.statSync(want).isDirectory(); } catch {}
  cfg.painterDir = ok ? want : own;
  cfg.saveDirMissing = Boolean(want) && !ok;
  return cfg;
}
// Every folder Bob's pictures and songs may be in: where he saves now first, then his own, then older picks.
export function outputDirs(cfg) {
  const all = [cfg.painterDir, cfg.defaultPainterDir, cfg.saveDir, ...(cfg.saveDirsUsed || [])].map(cleanDir).filter(Boolean);
  const seen = new Set();
  return all.filter((d) => { const k = norm(d); if (seen.has(k)) return false; seen.add(k); return true; });
}
// The file a /images/<name> link or a bare file name Bob made points at: the first folder that has it
// (or where he saves now, when none has it yet).
export function findOutput(cfg, name) {
  const base = path.basename(String(name || ''));
  for (const d of outputDirs(cfg)) { const f = path.join(d, base); if (fs.existsSync(f)) return f; }
  return path.join(cfg.painterDir, base);
}
// Why a folder can't hold what Bob makes, or '' if it can. Bob's own code, settings and backups stay off-limits.
export function saveDirProblem(cfg, dir) {
  const d = cleanDir(dir);
  if (!d) return 'Type the whole folder path, like D:\\Bob pictures, or use Browse… to pick it.';
  let st = null;
  try { st = fs.statSync(d); } catch {}
  if (!st) return "Bob can't find that folder. Check the spelling, or use Browse… to pick it.";
  if (!st.isDirectory()) return 'That\'s a file, not a folder. Pick the folder it\'s in, or use Browse….';
  if (/^[a-z]:\\?$/i.test(d) || d === path.parse(d).root) return 'Pick a folder, not a whole drive.';
  if ((cfg.ownReadOnlyRoots || []).some((r) => isInside(r, d))) return 'That\'s Bob\'s own program or settings folder. Pick another one.';
  const probe = path.join(d, `.bob-write-test-${process.pid}`);
  try { fs.writeFileSync(probe, ''); fs.rmSync(probe, { force: true }); } catch { return `Bob isn't allowed to save in ${d}. Pick a folder you can save files in.`; }
  return '';
}

function applyProjects(cfg) {
  if (Array.isArray(cfg.projectList)) cfg.projects = Object.fromEntries(cfg.projectList.map((p) => [p.name, p.path]));
  if (cfg.defaultProject && !(cfg.projects || {})[cfg.defaultProject]) cfg.defaultProject = '';
  return applyCodeCopy(cfg); // "Let Bob work on repositories": the code copies are projects while the switch is on
}

// Settings saved whole (not merged key by key), so an emptied box or a removed project really goes away.
// "Keep the last 20 Settings changes" (src/settings-undo.js) listens here while it's on: the keys a change touched,
// as they were and as they are now. One listener; it never changes what is saved.
let settingsWatcher = null;
export const watchSettings = (fn) => { settingsWatcher = typeof fn === 'function' ? fn : null; };
const snap = (cfg, keys) => Object.fromEntries(keys.map((k) => [k, cfg[k] === undefined ? undefined : JSON.parse(JSON.stringify(cfg[k]))]));
function tellWatcher(before, cfg, keys) { if (!before) return; try { settingsWatcher?.(before, snap(cfg, keys)); } catch {} }

export function replaceSettings(cfg, patch) {
  const safe = clean(patch);
  const before = settingsWatcher ? snap(cfg, Object.keys(safe)) : null;
  let saved = {};
  try { saved = readJsonFile(cfg.settingsFile); } catch {}
  for (const [k, v] of Object.entries(safe)) { saved[k] = v; cfg[k] = v; }
  writeJsonAtomic(cfg.settingsFile, saved, 2);
  applyProjects(cfg);
  tellWatcher(before, cfg, Object.keys(safe));
  return saved;
}

// Apply a change now and remember it.
// Let my phone in (src/phone-access.js): phone access lives in config.json only, never in settings.json, so nothing that
// can write Bob's settings file can open the door. Only the Settings page on this PC calls this (server.js, local only).
export function saveRemote(cfg, remote) {
  const raw = readConfigFile(cfg);
  raw.remote = { ...(raw.remote || {}), ...remote };
  writeConfigFile(cfg, raw);
  cfg.remote = raw.remote;
}

export function saveSettings(cfg, patch) {
  const safe = clean(patch);
  const before = settingsWatcher ? snap(cfg, Object.keys(safe)) : null;
  let saved = {};
  try { saved = readJsonFile(cfg.settingsFile); } catch {}
  deepMerge(saved, safe);
  writeJsonAtomic(cfg.settingsFile, saved, 2);
  deepMerge(cfg, safe);
  tellWatcher(before, cfg, Object.keys(safe));
  return saved;
}

// Windows paths are case-insensitive; compare normalised forms.
// A symlink or junction inside an allowed folder may point outside it, so both sides use the real path when
// it exists (a file that is not there yet keeps its parent's real path).
const real = (p) => {
  try { return fs.realpathSync.native(p); } catch {}
  const parent = path.dirname(p);
  if (parent === p) return p;
  return path.join(real(parent), path.basename(p));
};
const norm = (p) => {
  const r = real(path.resolve(p));
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

export function isInside(root, target) {
  const r = norm(root), t = norm(target);
  if (t === r) return true;
  return t.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

export function insideAny(roots, target) {
  return roots.some((r) => isInside(r, target));
}
