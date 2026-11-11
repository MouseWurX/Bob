// Bob's local server: serves the panel and a small API. Only listens on this PC.
import { ramNow, memGB } from './server-ram.js';
import { cpuLoad } from './speed-stats.js';
import os from 'node:os';
import { brainMode, BRAIN_MODES, keepTime } from './brain-mode.js';
import http from 'node:http';
import { lookText, LOOK_ID_RE } from './look.js';
import { cleanPersonality } from '../public/personality.js';
import { cleanHouseStyle } from '../public/house-style.js';
import { pickFolder } from './pick-folder.js';
import { ownEntries } from './own-models.js';
import { selfWorkView, gatherBrains, makeCodeCopy, applyCodeCopy, cleanSelfWork, repoNamed, codeCopyRoot } from './self-work.js'; // "Let Bob work on repositories"
import { catalogFileFor } from './llamacpp.js';
import { ensureTool } from './self-work-tools.js'; // 1.5.135 brains of your own
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cleanPresets, qwenPreset, QWEN_PRESETS } from './model-family.js';
import { loadConfig, appDir, saveSettings, saveRemote, replaceSettings, cleanProjects, VERSION, findOutput, saveDirProblem, applySaveDir, isInside } from './config.js';
import { Brain, apuHoldbackGB } from './brain.js';
import { ModelShop } from './models.js';
import { CatalogUpdates } from './catalog-update.js';
import { checkEngine, seedBundledEngine, goBackEngine, removeEngine, brainsEngineSettings, engineChoices, brainsEngineNow } from './engines.js';
import { liveTrace } from '../public/lab-watch-math.js';
import { cubeMap, cubeBrains, cubeShapes } from './lab-watch.js';
import { EngineKeeper, keeperOn } from './engine-keeper.js';
import { autostartOn, setAutostart } from './autostart.js';
import { applyWindowState } from './app-icon.js';
import { capabilities } from './capabilities.js';
import { cloudStatus } from './cloud.js';
import { rentRoute } from './rental-routes.js'; // 1.5.127 rented brains
import { Lab, labRoute, labOn, labRoom } from './lab.js'; // 1.5.141 Computer Science Lab
import { say, KOKORO_VOICES, stopVoices } from './tts.js';
process.on('exit', () => stopVoices()); // never leave a voice holding the graphics card
import { workshopDir, listWorkflows, ensureWorkshop } from './workshop.js';
import { SESSIONS, currentSession, sessionBrains } from './sessions.js';
import { autoSessionOn } from './auto-session.js';
import { ctxOn, stretchOn, choicesFor, pickedCtx, bobsPick, ctxGuide, SAFE_CTX } from './model-ctx.js';
import { SLOT_NAMES } from '../public/fit.js';
import { gamingCard, GAMING_CARD } from './gaming-card.js';
import { refuseForeign } from './guard.js';
import { hkSettings, cleanHousekeeping, KINDS } from './housekeeping.js';
import { banks as memoryBanks, recallOn } from './recall.js';
import { handsRoute } from './hands-routes.js';
import { ownKitCounts } from './own-kit.js';
import { quarantineRoute } from './quarantine-routes.js';
import { howtosRoute } from './howtos-routes.js';
import { ownModelsRoute } from './own-models-routes.js';
import { saveRoute } from './save-routes.js';
import { voiceRoute } from './voice-routes.js';
import { refsRoute } from './refs-routes.js';
import { queueRoute } from './queue-routes.js';
import { updateRoute } from './update-routes.js';
import { tidyRoute } from './tidy-routes.js';
import { filesRoute } from './files-routes.js';
import { schedulesRoute, startSchedules } from './hands-schedules.js';
import { checkinsRoute, startCheckins } from './checkins.js';
import { adventureRoute } from './adventure.js';
import { gamesRoute } from './games.js';
import { telegramRoute, startTelegram } from './telegram.js';
import { discordRoute, startDiscord } from './discord.js';
import { handsSettings } from './hands-settings.js';
import { tuning, TUNING_KEYS, pictureFitReset } from './tuning.js';
import { gatherFacts, tipsFrom } from './pc-check.js';
import { speedTest, speedHistory } from './speed-test.js';
import { trainerState } from './lab-teach.js'; // 1.5.16x the Lab's Trainer pack, shown in Settings so it can be removed
import { phoneView, cleanPhonePatch, findAddresses, newPasscode, isTailscaleIp } from './phone-access.js';
import { firewallState, changeRule, firewallHome } from './firewall.js';
import { shareView, cleanSharePatch, saveShare, lendChat, lendRefusal, reviewRefusal, helloFor, bobNetRooms } from './share-brains.js';
import { lendCardRoute, homeIps, isHomeIp, sameNet } from './share-card.js'; // Bob-Net: Lend my graphics card
import { checkHello } from './bob-net-check.js'; // 1.5.185 a bigger Bob checks the harder jobs
import { guestRoute, answerAway } from './share-jobs.js';
import { Pairing, myName } from './bob-net-pair.js';
import { partyView, Introductions } from './bob-net-party.js';
import { OS, features } from './platform.js';
import { saveExport } from './diagram.js';
import { saveAs } from './save-as.js';
import { saveHelpBundle, bundleBytes, revealFile } from './help-bundle.js';
import { notesFile, ensureNotesFile } from './notes.js';
import { clearDocCache } from './my-docs.js';
import { sandboxHolds } from './selftools.js';

const cfg = loadConfig();
// 1.5.76: the basic llama.cpp that comes inside Bob's download goes into his engine folder, if he has none yet.
try { if (seedBundledEngine(cfg)) console.error('Bob: set up the llama.cpp that came with him.'); } catch {}
const publicDir = path.join(appDir, 'public');

// llama.cpp speed settings, as the app shows them.
function speedView() {
  const lc = cfg.llamacpp || {};
  return { fit: typeof lc.fit === 'boolean' ? lc.fit : null, threads: lc.threads || null, batch: lc.batch || null, ubatch: lc.ubatch || null, ctx: lc.ctx || null, draft: lc.draft || { enabled: false, model: '', max: 16, min: 1, ngld: 99 }, modelArgs: lc.modelArgs || {}, args: lc.args || null, turbo: lc.turbo || {}, trainer: trainerState(cfg).ok, brainEngine: lc.brainEngine !== false, onBrainEngine: /[\\/]brain-engine[\\/]/.test(lc.exe || '') }; // 1.5.16x Turbo per brain, the Lab's Trainer pack
}
// 1.5.41 Where Bob saves things, as Settings shows it: the folder now, Bob's own, and whether a picked one has gone.
// 1.5.79: the memory banks for Settings (general + one per project), and what the last message recalled.
function memoryBanksView() {
  let text = '';
  try { text = fs.readFileSync(cfg.memoryFile, 'utf8'); } catch {}
  const last = brain?.lastRecall || null;
  return { banks: memoryBanks(cfg, text), last, file: cfg.memoryFile };
}

function saveDirView() {
  return { folder: cfg.painterDir, own: cfg.defaultPainterDir, picked: cfg.saveDir || '', custom: Boolean(cfg.saveDir) && !cfg.saveDirMissing, missing: cfg.saveDirMissing === true };
}
const clients = new Set();
// 1.5.53: the "Bob's thinking" window (public/mind.html) listens with ?mind=1. Only those windows get his thinking
// as it streams; while none is open, Bob doesn't even pass it along (brain.mindWatchers), so it costs nothing.
const mindClients = new Set();
const cubeClients = new Set(); // FNRI's small cube pages (see below)

let telegram = null; // Talk to Bob on Telegram (src/telegram.js), set once Bob's brain is ready
let discord = null; // Bob on Discord (src/discord.js), set once Bob's brain is ready
let cubeLoading = ''; // the brain FNRI's small cube last saw starting to load
function broadcast(ev) {
  if (ev?.type === 'think-start' && ev.model) ev = { ...ev, label: friendlyName(ev.model) }; // "Qwen 3.8 27B", not the raw tag
  const data = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of ev?.type === 'think' || ev?.type === 'think-start' ? mindClients : clients) res.write(data);
  if (ev?.type === 'status') { const l = ['waking', 'loading'].includes(ev.state) ? String(ev.model || '') : ''; if (l !== cubeLoading) { cubeLoading = l; if (l && cubeClients.size) cubeBrainsNow(); } } // once as a brain starts loading, not every progress line
  if (ev?.type === 'brain' && cubeClients.size) cubeBrainsNow(); // FNRI's small cube takes itself apart when its brain is let go
  try { telegram?.watch(ev); } catch {} // Talk to Bob on Telegram: only the Telegram chat's events, and only while it's on
  try { discord?.watch(ev); } catch {} // Bob on Discord: only Discord jobs' own events
  if (ev?.type === 'pair-done') try { introductions.soon(); } catch {} // 1.5.123: a new Bob on the list meets the others
}

const brain = new Brain(cfg, broadcast);
if (cfg.engineMoved?.length) brain.log('settings', `brains now run on ${cfg.llamacpp.brainEngine !== false && brainsEngineNow(cfg) === 'brainengine' ? 'Brain Engine' : 'my own llama.cpp'} (was set to ${cfg.engineMoved.join(' and ')}; Brain Engine is the only engine for my brains now)`); // 1.5.196
// 1.5.97 Pair with my other Bobs (src/bob-net-pair.js): find them on Tailscale, a Yes card there, passcodes swapped.
const pairing = new Pairing(cfg, { broadcast, log: (k, t) => brain.log(k, t), version: VERSION, ownAddresses: () => tailscaleIps().map((ip) => `${ip}:${cfg.port}`), vouched: (a, t) => introductions.vouched(a, t) });
// 1.5.123 Pass my Bob-Net along (src/bob-net-party.js): your Bobs introduce each other; also the party in Now running.
const introductions = new Introductions(cfg, { lenders: brain.lenders, pairing, log: (k, t) => brain.log(k, t) });
setTimeout(() => introductions.soon(0), 60_000).unref(); // once Bob is up, and then every hour
setInterval(() => introductions.soon(0), 3600_000).unref();
brain.mindWatchers = () => mindClients.size;
// FNRI's small cube in "Bob's thinking" listens with ?cube=1. Only while one is open does Bob ask Brain Engine which
// experts each reply used (it slows writing a little), and only those pages are told. Off for everyone else.
// An older Brain Engine build can't report them either: then the cube says so instead of staying dark (before Update under Engines).
const cubeWhy = () => (brainsEngineNow(cfg) !== 'brainengine' ? 'The cube needs Brain Engine as the engine for Bob\'s brains (Settings > Engines). The engine in use now doesn\'t report which experts it picked.'
  : lab.traceProbe?.()?.experts === false ? 'This Brain Engine build is too old to report which experts it picked. Press Update on Brain Engine in Settings > Engines, and the cube lights up with the next reply.' : '');
// Which brains are loaded right now, by the names the cube knows them by. Told to the cube pages only.
async function cubeBrainsNow() {
  try {
    const now = await brain.engine.loaded(), labels = cubeBrains(now, friendlyName);
    // the shapes too, so the cube builds itself in one colour as a brain loads and waits there for the first reply
    const st = brain.state || {}, loading = ['waking', 'loading'].includes(st.state) && st.model ? String(st.model) : '';
    let shapes = []; try { shapes = cubeShapes(lab, [...now.map((m) => m?.name), loading], friendlyName); } catch {}
    const data = `data: ${JSON.stringify({ type: 'cube-brains', labels, shapes, loading: loading ? friendlyName(loading) : '' })}\n\n`; for (const res of cubeClients) res.write(data);
  } catch {}
}
if (brain.engine) {
  brain.engine.wantTrace = () => cubeClients.size > 0 && !cubeWhy();
  brain.engine.onTrace = (raw, model) => { const t = liveTrace(raw); if (!t) return; let map = null; try { map = cubeMap(lab, { model, label: friendlyName(model), experts: t.experts, layers: t.layers, kind: t.kind }); } catch {} // the colours, from this brain's newest scan
    const data = `data: ${JSON.stringify({ type: 'trace', label: friendlyName(model), ...t, ...(map ? { map } : {}) })}\n\n`; for (const res of cubeClients) res.write(data); };
}
// 1.5.38: when Downloads change, a job waiting for one (a song waiting for the music models) may be able to go.
const shop = new ModelShop(cfg, (ev) => { broadcast(ev); if (ev?.type === 'downloads') brain.downloadsChanged(); }, brain.engine);
const lab = new Lab(cfg, { shop, brain, broadcast }); // 1.5.141
lab.version = VERSION.label; // 1.5.153 the foot of a saved Lab result
// 1.5.184 Keep engines up to date (src/engine-keeper.js): on unless switched off in Settings, Engines. Checks two
// minutes after start and about daily; updates only while no brain is loaded on that engine and nothing is busy.
const engineKeeper = new EngineKeeper(cfg, {
  check: (id) => shop.engineLatest(id),
  loaded: () => Promise.race([brain.engine.loaded(), new Promise((r) => setTimeout(() => r([]), 2500))]),
  busy: () => (brain.turns.size > 0 || brain.queue.some((j) => j.state === 'waiting') ? "I'm working on something" : lab.job ? 'the Lab is busy' : shop.active?.size ? 'a download is running' : shop.job ? 'Get models is busy' : ''),
  queue: (id) => shop.download('engine:' + id),
  download: (id) => shop.dl.find((d) => d.id === 'engine:' + id) || null,
  say: (text) => { brain.log('settings', text); broadcast({ type: 'announce', text }); }
}).start();
// 1.5.137: Bob's newest brain list from GitHub, only with "Let Bob fetch his newest brain list" on: once a day, the
// first look a minute and a half after start, and Check now in Settings. Off: the shipped list, nothing fetched.
const listUpdates = new CatalogUpdates(cfg, { log: (k, m) => brain.log(k, m) });
shop.catalog = listUpdates.merge(shop.shipped);
const checkList = async () => { const r = await listUpdates.check(shop.shipped); shop.catalog = listUpdates.merge(shop.shipped); return r; };
setTimeout(() => { if (listUpdates.due()) checkList().catch(() => {}); }, 90_000).unref();
setInterval(() => { if (listUpdates.due()) checkList().catch(() => {}); }, 3600_000).unref();
// 1.5.24: the card's size, for picture settings matched to it (only used when that switch is on).
// 1.5.137: this Bob's room (graphics card and memory), said in his Bob-Net hello. Built-in graphics count the part set
// aside for them, the same as the catalogue does here.
let myRoom = null;
shop.hardware().then((h) => { myRoom = { vramGB: h?.gpu?.integrated ? Number(h.gpu.reservedGraphicsGB) || 0 : Number(h?.vramGB) || 0, ramGB: Number(h?.ramGB) || 0 }; }).catch(() => {});
if (!cfg.gpuVramGB) shop.hardware().then((h) => { if (h?.gpu?.vramGB && !h.gpu.integrated) cfg.cardGB = h.gpu.vramGB; /* 1.5.71: built-in graphics aren't a card for pictures */ if (h?.gpu?.integrated) { cfg.sharedGraphics = true; cfg.reservedGraphicsGB = Number(h.gpu.reservedGraphicsGB) || 0; /* 1.5.133: the set-aside counts as room (apuRoom) */ } /* 1.5.79: but they get their own picture settings */ }).catch(() => {});
brain.shop = shop; // so Bob can tell when a model is on this replicant matrix but not assigned to a job
// 1.5.91: Bob fills a slot himself once its download is in (Get Bob ready, the chat's Set it up card): the same saves
// the window's Equip makes.
shop.equipHook = async (slot, value) => {
  if (slot.how === 'brain') return saveSettings(cfg, { sessionBrains: { ...sessionBrains(cfg), [slot.id]: value } });
  if (slot.how === 'embed') { saveSettings(cfg, { housekeeping: cleanHousekeeping({ ...hkSettings(cfg), embedModel: value }) }); brain.housekeeper.noEmbed = false; return; }
  const patch = await shop.setRole(slot.id, value);
  brain.log('settings', `${slot.id} -> ${value} (put in its slot when its download finished)`);
  return patch;
};
shop.applyEquip().catch(() => {}); // anything finished while Bob was closed
startSchedules(brain); // ticks once a minute; nothing is ever due while the Schedules hand is off
startCheckins(brain); // 1.5.78: ticks once a minute; does nothing while Check-ins are off
telegram = startTelegram(brain); // does nothing (no request at all) unless Talk to Bob on Telegram is on and a bot token is set
discord = startDiscord(brain); // does nothing (no connection at all) unless Bob on Discord is on and a bot token is set
if (!shop.found.at) shop.scan().catch(() => {});

function workshopView() {
  return { enabled: cfg.workshop?.enabled === true, port: Number(cfg.workshop?.port) || 8188, folder: workshopDir(cfg), count: listWorkflows(cfg).filter((w) => w.ok).length };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webm': 'video/webm', '.mp4': 'video/mp4', '.avi': 'video/x-msvideo', '.svg': 'image/svg+xml', '.mmd': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.ogg': 'audio/ogg',
  '.gif': 'image/gif', '.m4a': 'audio/mp4', '.mov': 'video/quicktime', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8'
};

function send(res, code, body, type = 'application/json', extra = {}) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function serveFile(res, dir, rel, extra = {}) {
  const file = path.resolve(dir, '.' + path.sep + rel);
  if (!file.startsWith(path.resolve(dir) + path.sep)) return send(res, 404, { error: 'not found' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    send(res, 200, buf, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', extra);
  });
}
// The src/*-routes.js files get these two: the same as send and serveFile, but they return true, so
// `return send(...)` there tells this server the request was answered.
const answered = (...a) => { send(...a); return true; };
const servedFile = (...a) => { serveFile(...a); return true; };

// 1.5.95: a diagram file from the window that drew it (a PNG or PDF can be several MB as base64).
async function bigBody(req, limit = 36e6) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > limit) throw new Error('too big'); }
  return s ? JSON.parse(s) : {};
}

async function body(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 1e6) throw new Error('too big'); }
  return s ? JSON.parse(s) : {};
}

// Block other websites from talking to Bob: check Host (DNS rebinding) and require
// a custom header on every POST (browsers won't send it cross-site without CORS, which we never grant).
const localHosts = new Set([`127.0.0.1:${cfg.port}`, `localhost:${cfg.port}`, `[::1]:${cfg.port}`]);
// 1.5.94: read again whenever "Let my other replicant matrices in" changes, so it works without a restart.
let remote, remoteOn, remoteHosts, authToken;
let remoteHome = false;
function readRemote() {
  remote = cfg.remote || {};
  remoteOn = Boolean(remote.enabled && remote.passcode && String(remote.passcode).length >= 6);
  remoteHosts = new Set((remote.hosts || []).map((h) => String(h).toLowerCase()));
  remoteHome = remoteOn && remote.homeNet === true; // Also over the home network (off unless switched on)
  authToken = crypto.createHash('sha256').update('bob:' + (remote.passcode || '') + ':' + cfg.agentDir).digest('hex');
}
readRemote();
// 1.5.116: the door at start-up works like the door opened later: Bob listens on 127.0.0.1 plus this replicant
// matrix's Tailscale addresses, never on every address. Only an explicit remote.bindAddress in config.json binds wide.
const startedWide = Boolean(remoteOn && remote.bindAddress);
const loginTries = [];

// Phone access over Tailscale only: loopback or the Tailscale range (100.64.0.0/10).
function fromTailscaleOrLocal(addr) {
  const a = String(addr || '').replace(/^::ffff:/, '');
  if (a === '127.0.0.1' || a === '::1') return true;
  const m = a.match(/^100\.(\d+)\./);
  return Boolean(m && Number(m[1]) >= 64 && Number(m[1]) <= 127);
}
// "Also over the home network" (off unless switched on): a home-network address on this replicant matrix's own
// subnet counts too, never anything wider. Pairing still goes over Tailscale only.
function fromAllowed(addr) { return fromTailscaleOrLocal(addr) || (remoteHome && homeIps().some((m) => sameNet(m.address, addr, m.netmask) && isHomeIp(addr))); }
function hasCookie(req) {
  const c = String(req.headers.cookie || '').split(/;\s*/).find((x) => x.startsWith('bob_auth='));
  if (!c) return false;
  const v = Buffer.from(c.slice(9)), t = Buffer.from(authToken);
  return v.length === t.length && crypto.timingSafeEqual(v, t);
}
const LOGIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bob</title><link rel="icon" href="/icons/bob-32.png"><style>body{background:#1d1510;color:#f3e7d3;font:16px "Segoe UI",system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}form{background:#2b1d14;padding:24px;border-radius:12px;display:grid;gap:12px;width:min(320px,90vw)}input,button{font:inherit;padding:10px;border-radius:8px;border:1px solid #5a4030}input{background:#1d1510;color:#f3e7d3}button{background:#e7a64a;color:#2b1d14;font-weight:700;border:none}</style></head><body><form method="post" action="/login"><img src="/icons/bob-192.png" width="64" height="64" alt=""><label for="c">Bob's passcode</label><input id="c" name="code" type="password" autocomplete="current-password" required><button>Come in</button></form></body></html>`;

const server = http.createServer(async (req, res) => {
  try {
    const host = String(req.headers.host).toLowerCase();
    const isLocal = localHosts.has(host) && fromTailscaleOrLocal(req.socket.remoteAddress) && /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress);
    // 1.5.97: this replicant matrix's own Tailscale addresses always count, so a stale saved list (a renamed or re-joined
    // device) can't shut your other Bobs out.
    const isRemote = !isLocal && remoteOn && (remoteHosts.has(host) || ownTsHosts().has(host)) && fromAllowed(req.socket.remoteAddress);
    if (!isLocal && !isRemote) return send(res, 403, { error: 'bad host' });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    // 1.5.97 Bob-Net pairing: the other Bob doesn't know the passcode yet, so these four come before the passcode check.
    // They only reach through the open door (Tailscale only), and the passcode is handed over only after your Yes here.
    if (isRemote && p.startsWith('/api/pair/') && !fromTailscaleOrLocal(req.socket.remoteAddress)) return send(res, 403, { error: 'Pairing goes over Tailscale only.' });
    if (isRemote && p.startsWith('/api/pair/')) {
      if (req.method === 'GET' && p === '/api/pair/hello') return send(res, 200, pairing.hello());
      if (req.method === 'POST' && req.headers['x-bob'] === '1' && !refuseForeign(req, host)) {
        const b = await body(req).catch(() => ({}));
        if (p === '/api/pair/ask') { const r = pairing.ask(b, req.socket.remoteAddress); return send(res, r.code, r.error ? { error: r.error } : { id: r.id }); }
        if (p === '/api/pair/status') return send(res, 200, pairing.status(b.id, req.socket.remoteAddress));
        if (p === '/api/pair/finish') return send(res, 200, pairing.finish(b, req.socket.remoteAddress));
      }
      return send(res, 404, { error: 'not found' });
    }
    if (isRemote && !hasCookie(req)) {
      if (p.startsWith('/icons/')) return serveFile(res, publicDir, p.slice(1));
      if (req.method === 'POST' && p === '/login') {
        const now = Date.now();
        while (loginTries.length && now - loginTries[0] > 60000) loginTries.shift();
        if (loginTries.length >= 5) return send(res, 429, 'Too many tries. Wait a minute.', 'text/plain');
        loginTries.push(now);
        let raw = '';
        for await (const c of req) { raw += c; if (raw.length > 2000) break; }
        const code = new URLSearchParams(raw).get('code') || '';
        const a = crypto.createHash('sha256').update(code).digest(), b = crypto.createHash('sha256').update(String(remote.passcode)).digest();
        if (crypto.timingSafeEqual(a, b)) {
          res.writeHead(303, { location: '/', 'set-cookie': `bob_auth=${authToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` });
          return res.end();
        }
        return send(res, 401, LOGIN_PAGE, 'text/html; charset=utf-8');
      }
      return send(res, 401, LOGIN_PAGE, 'text/html; charset=utf-8');
    }

    if (req.method === 'POST' && req.headers['x-bob'] !== '1') return send(res, 403, { error: 'missing header' });
    // More locks on the same door (the x-bob header alone already makes a browser ask first, and Bob never says yes):
    // anything that changes something must come from Bob's own page, not be marked cross-site, and carry a
    // content type a plain web form can't send.
    if (req.method !== 'GET' && req.method !== 'HEAD' && p !== '/login') {
      const bad = refuseForeign(req, host);
      if (bad) { brain.log('blocked', `${req.method} ${p}: ${bad}`); return send(res, bad === 'content type' ? 415 : 403, { error: `refused (${bad})` }); }
    }
    // Anything the user does in the window (a setting, a click, typing) counts as activity, so an update
    // never restarts Bob while he's using it. Automatic polling (GETs) doesn't count; quitting doesn't either.
    if (req.method === 'POST' && p !== '/api/quit') brain.lastActivity = Date.now();
    if (req.method === 'POST' && p === '/api/activity') return send(res, 200, { ok: true });

    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ type: 'status', ...brain.state })}\n\n`);
      if (isLocal) for (const c of pairing.waiting()) res.write(`data: ${JSON.stringify(c)}\n\n`); // 1.5.97: a pairing card that came in while the window was shut
      clients.add(res);
      const mind = url.searchParams.get('mind') === '1';
      if (mind) mindClients.add(res);
      if (isLocal && url.searchParams.get('cube') === '1') { cubeClients.add(res); res.write(`data: ${JSON.stringify({ type: 'cube', ok: !cubeWhy(), why: cubeWhy() })}\n\n`); cubeBrainsNow(); }
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); mindClients.delete(res); cubeClients.delete(res); });
      return;
    }
    // Keep Bob light (1.5.2): the Brain label on the chat page, and waking the small brain when someone types.
    // 1.5.26: each brain carries its friendly name, so the label and Now running name it the same way.
    if (req.method === 'GET' && p === '/api/brain') {
      const st = await brain.brainStatus();
      for (const m of st.models || []) m.label = friendlyName(m.name);
      // The picture model (sd-server) is Bob's too, so Now running can show where the rest of the card goes.
      // gb is null when Windows won't give a per-process figure; it is a measurement otherwise, never a guess.
      try {
        const ps = brain.painter?.status?.();
        if (ps && brain.painter.alive() && ['loading', 'ready', 'busy'].includes(ps.state)) st.picture = { state: ps.state, kind: ps.kind, gb: ps.vramBytes ? memGB(ps.vramBytes) : null };
      } catch {}
      return send(res, 200, st);
    }
    if (await howtosRoute({ req, res, p, isLocal, cfg, brain, body, send: answered })) return;
    if (req.method === 'POST' && p === '/api/more-pictures') {
      // "Make another picture?" in the chat box: { id, more }. An old card (timed out, replaced) just says so.
      const b = await body(req);
      const ok = brain.answerMore(String(b.id || ''), b.more === true, 'click');
      return send(res, 200, { ok });
    }
    if (req.method === 'POST' && p === '/api/wake') { brain.lastActivity = Date.now(); brain.wake('typing').catch(() => {}); return send(res, 200, { ok: true }); }
    if (req.method === 'GET' && p === '/api/status') return send(res, 200, { ...(await brain.status()), version: VERSION });
    if (req.method === 'GET' && p === '/api/history') {
      const id = url.searchParams.get('session') || 'main';
      return send(res, 200, brain.history(id));
    }
    if (req.method === 'POST' && p === '/api/chat') {
      const { sessionId = 'main', text, refs = [], effort = 'low', rent = false } = await body(req); // 1.5.127 rent: the 🏗 Rented brain switch
      if (!text || !String(text).trim()) return send(res, 400, { error: 'empty' });
      const attach = [].concat(refs).map(String).filter((id) => /^[0-9a-f]{8}$/.test(id) && brain.refs.list().some((r) => r.id === id));
      return send(res, 200, brain.enqueue(String(sessionId), String(text).slice(0, 20000), attach, String(effort), rent === true ? { rent: true } : {}));
    }
    // Model shop and settings. Downloads and settings changes only from this PC, never from the phone.
    // 1.5.137: with the rooms of your other Bobs, so the catalogue can tell a brain one of them could run from one only
    // a rented card can. Only Bobs already on your Bob-Net list are asked, through the cached hello (30 s good, 60 s
    // down), and never for more than 2.5 s: a Bob that's off just isn't counted.
    if (req.method === 'GET' && p === '/api/models') {
      const bobs = brain.lenders?.bobs?.() || [];
      if (bobs.length) await Promise.race([Promise.all(bobs.map((x) => brain.lenders.hello(x).catch(() => null))), new Promise((r) => setTimeout(r, 2500))]);
      return send(res, 200, { ...(await shop.list()), bobNet: bobNetRooms(brain.lenders) });
    }
    if (req.method === 'GET' && p === '/api/cloud') return send(res, 200, cloudStatus(cfg));
    // 1.5.137: the newest brain list: how it stands, and Check now (only from this replicant matrix).
    if (req.method === 'GET' && p === '/api/catalog/latest') return send(res, 200, listUpdates.status(shop.shipped));
    if (req.method === 'POST' && p === '/api/catalog/latest') {
      if (!isLocal) return send(res, 403, { error: 'this replicant matrix only' });
      const r = await checkList();
      return send(res, 200, { ...listUpdates.status(shop.shipped), result: r });
    }
    // The one true "is Bob idle?" answer, for anything that wants to run heavy work (benchmarks, tests)
    // without getting in the user's way: nothing running, nothing waiting, no download, quiet for a while.
    if (req.method === 'GET' && p === '/api/idle') {
      const waiting = brain.queue.filter((j) => j.state === 'waiting').length;
      const quietFor = Math.round((Date.now() - brain.lastActivity) / 1000);
      const busy = brain.turns.size > 0, downloading = Boolean(shop.job);
      // Models still sitting in memory (a quiet Bob can still be holding the graphics card), for anything that
      // wants the card to itself, like a benchmark. Doesn't change "idle"; it's extra information.
      let loaded = [];
      try { loaded = (await Promise.race([brain.engine.loaded(), new Promise((r) => setTimeout(() => r([]), 2500))])).map((m) => ({ name: m.name, vramGB: m.vram ? Math.round(m.vram / 1e8) / 10 : null })); } catch {}
      return send(res, 200, { idle: !busy && !waiting && !downloading && quietFor >= 120, busy, waiting, downloading, quietForSeconds: quietFor, loaded, engine: cfg.engine });
    }
    if (req.method === 'GET' && p === '/api/engines/latest') {
      try { return send(res, 200, await shop.engineLatest(String(url.searchParams.get('id') || ''))); }
      catch (e) { return send(res, 502, { error: e.message }); }
    }
    // 1.5.17x Engines rework: Go back (the build kept from before the last update) and Remove (Bob's own copy only).
    // Both let go of the running brain first when it's one of the brain engines. This replicant matrix only.
    if (req.method === 'POST' && (p === '/api/engines/back' || p === '/api/engines/remove')) {
      if (!isLocal) return send(res, 403, { error: 'Engines can only be changed on this replicant matrix itself.' });
      const b = await body(req).catch(() => ({}));
      const id = String(b.id || '');
      try {
        if (['llamacpp', 'brainengine'].includes(id) && brain.engine?.stopServer) await brain.engine.stopServer();
        const out = p.endsWith('/back') ? goBackEngine(cfg, id) : removeEngine(cfg, id);
        return send(res, 200, { ...out, restart: ['llamacpp', 'brainengine'].includes(id) });
      } catch (e) { return send(res, 409, { error: e.message }); }
    }
    if (req.method === 'GET' && p === '/api/capabilities') return send(res, 200, capabilities(cfg));
    if (req.method === 'GET' && p === '/api/roles') return send(res, 200, await shop.roles());
    // 1.5.87: each equipped brain, the most it was made for, Bob's pick and the size picked by hand (Settings > Brains).
    if (req.method === 'GET' && p === '/api/brain-ctx') return send(res, 200, await brainCtxView());
    // What an Ollama model can do (completion, vision, audio, tools, thinking), for Equip Bob's "also use it for".
    if (req.method === 'GET' && p === '/api/models/caps') {
      const name = String(url.searchParams.get('name') || '');
      if (!/^[\w.:/-]{1,120}$/.test(name)) return send(res, 400, { error: 'bad name' });
      let caps = [];
      try { if (brain.engine.show) caps = (await brain.engine.show(name)).capabilities || []; } catch {}
      return send(res, 200, { name, caps });
    }
    // 1.5.24: Check this PC (reads only, suggests fixes) and Test Bob's speed (before and after a change).
    if (req.method === 'GET' && p === '/api/pc-check') {
      const bobPids = [brain.engine?.child?.pid, brain.painter?.child?.pid].filter(Boolean);
      return send(res, 200, tipsFrom(await gatherFacts(cfg, { bobPids })));
    }
    if (req.method === 'GET' && p === '/api/speed-test') return send(res, 200, { history: speedHistory(cfg), running: Boolean(brain.speedTesting) });
    if (req.method === 'POST' && p === '/api/speed-test') {
      try { return send(res, 200, { result: await speedTest(brain), history: speedHistory(cfg) }); }
      catch (e) { return send(res, 409, { error: e.message }); }
    }
    if (req.method === 'GET' && p === '/api/hardware') return send(res, 200, await shop.hardware());
    // 1.5.74: whether the core engines start (first-run step 1, and Settings, Engines).
    if (req.method === 'GET' && p === '/api/engines/check') return send(res, 200, { checks: await Promise.all(['llamacpp', 'sdcpp', 'whispercpp'].map((id) => checkEngine(cfg, id))) });
    if (req.method === 'GET' && p === '/api/settings') {
      return send(res, 200, { apuHoldbackGB: apuHoldbackGB(cfg), autostart: autostartOn(), tray: cfg.tray !== false, lookIcon: cfg.lookIcon !== false, catalogUpdates: cfg.catalogUpdates === true, computerLab: labOn(cfg), computerLabRoom: labRoom(), qwenPresets: cleanPresets(cfg.qwenPresets), qwenDefaults: Object.fromEntries(Object.entries(QWEN_PRESETS).map(([id, p]) => [id, { label: p.label, ...qwenPreset(id) }])), trayHere: Boolean(globalThis.bobWindow), setupDone: Boolean(cfg.setupDone), wantsAsked: cfg.wantsAsked === true, look: cfg.look || null, lookText: lookText(cfg.look), personality: cleanPersonality(cfg.personality), lookComments: cfg.lookComments === true, userName: cfg.userName || '', callMe: cfg.callMe || '', windowsName: cfg.windowsName || '', engine: cfg.engine, workshop: workshopView(), catName: cfg.catName || 'Patches', version: VERSION, oneBrain: cfg.oneBrain === true, allTools: cfg.allTools === true, memoryRecall: cfg.memoryRecall === true, memoryBanks: memoryBanksView(), resumeJobs: cfg.resumeJobs === true, planFirst: cfg.planFirst === true, autoSession: autoSessionOn(cfg), gamingLock: cfg.gamingLock === true, sessionBy: cfg.sessionBy === 'bob' ? 'bob' : 'you', quickOnCpu: cfg.quickOnCpu === true, chatWhileBusy: cfg.chatWhileBusy !== false, mootBeside: cfg.mootBeside === true, netReview: cfg.netReview === true, webSearch: cfg.webSearch === true, naughtyList: cfg.naughtyList === true, howtos: cfg.howtos === true, editOwn: cfg.editOwn === true, quickNotes: cfg.quickNotes === true, smartNotes: cfg.smartNotes === true, quickNotesFile: notesFile(cfg), docTools: cfg.docTools === true, sandboxCode: cfg.sandboxCode === true, howtoCount: brain.howtos?.load().length || 0, ownKit: ownKitCounts(cfg, brain), gamingCard: gamingCard(cfg), gamingCardNow: brain.engine?.currentCard || null, pictureNoWait: cfg.pictureNoWait !== false, ...tuning(cfg), downloads: { concurrent: cfg.downloads?.concurrent === 2 ? 2 : 1, resumeOnStart: cfg.downloads?.resumeOnStart === true }, updates: { autoCheck: cfg.updates?.autoCheck === true }, engineUpdates: engineKeeper.view(), ollamaKeepAlive: keepTime(cfg), brainMode: brainMode(cfg), tts: { provider: cfg.tts?.provider || '', voice: cfg.tts?.voice || 'am_michael', speed: cfg.tts?.speed || 1, windowsVoice: cfg.tts?.windowsVoice || '', voicesFolder: path.join(cfg.innDir, 'voices') }, kokoroVoices: KOKORO_VOICES, session: currentSession(cfg), sessions: Object.entries(SESSIONS).map(([id, x]) => ({ id, ...x, ...(OS === 'mac' && x.whatMac ? { what: x.whatMac } : {}) })), sessionBrains: sessionBrains(cfg), activeModels: cfg.activeModels || {}, sessionCtx: cfg.sessionCtx || {}, brainCtxOn: cfg.brainCtxOn === true, brainCtxStretch: cfg.brainCtxStretch === true, brainCtx: cfg.brainCtx || {}, speed: speedView(), style: cfg.style || {}, painter: cfg.painter?.engine || 'comfy', platform: process.platform, os: OS, features: features(), home: cfg.agentDir, housekeeping: hkSettings(cfg), hands: handsSettings(cfg), houseStyle: cleanHouseStyle(cfg.houseStyle), projectList: Object.entries(cfg.projects || {}).filter(([, p]) => !isInside(codeCopyRoot(cfg), p)).map(([name, p]) => ({ name, path: p, missing: !fs.existsSync(p) })), selfWork: selfWorkNow(), defaultProject: cfg.defaultProject || '', saveDir: saveDirView() });
    }
    // Let my phone in (Settings, Bob-Net). Only from this PC; takes effect when Bob restarts.
    if (p === '/api/phone-access' && (req.method === 'GET' || req.method === 'POST')) {
      if (!isLocal) return send(res, 403, { error: 'Phone access can only be changed on this replicant matrix itself.' });
      const found = await findAddresses(cfg.port);
      if (req.method === 'GET') return send(res, 200, { ...phoneView(cfg), found, live: remoteLive(), firewall: await firewallState(cfg.port, { home: firewallHome(cfg, remoteHome) }).catch(() => null) });
      const b = await body(req);
      let made = '';
      if (b.newPasscode === true) { made = newPasscode(); b.passcode = made; }
      if (b.enabled === true && !(cfg.remote?.hosts || []).length && !('hosts' in b)) b.hosts = found;
      const out = cleanPhonePatch(cfg, b);
      if (out.error) return send(res, 400, { error: out.error });
      saveRemote(cfg, out.remote);
      brain.log('settings', `phone access: ${out.remote.enabled ? 'on' : 'off'}${out.remote.homeNet ? ', home network too' : ''}, ${out.remote.hosts.length} address(es)${made || 'passcode' in b ? ', new passcode' : ''}`);
      applyRemote(); // 1.5.94: opens (or closes) the door now, no restart
      return send(res, 200, { ...phoneView(cfg), found, live: remoteLive(), passcode: made || undefined, restart: false, firewall: await firewallState(cfg.port, { home: firewallHome(cfg, remoteHome) }).catch(() => null) });
    }
    // 1.5.94: "Let Tailscale through the firewall" (Windows asks once) and "Remove the firewall rule".
    if (p === '/api/phone-access/firewall' && req.method === 'POST') {
      if (!isLocal) return send(res, 403, { error: 'The firewall can only be changed on this replicant matrix itself.' });
      const b = await body(req);
      const r = await changeRule(cfg.port, { add: b.add !== false, exe: process.versions.electron ? process.execPath : '', home: firewallHome(cfg, remoteHome) });
      brain.log('settings', `firewall rule ${b.add !== false ? 'add' : 'remove'} (your click): ${r.ok ? 'done' : r.why}`);
      return send(res, 200, { ...r, firewall: await firewallState(cfg.port, { home: firewallHome(cfg, remoteHome) }).catch(() => null) });
    }
    // Share brains between your Bobs (src/share-brains.js). Settings only from this PC; lending only through the phone door.
    if (p === '/api/share-brains' && (req.method === 'GET' || req.method === 'POST')) {
      if (!isLocal) return send(res, 403, { error: 'Sharing brains can only be changed on this replicant matrix itself.' });
      if (req.method === 'GET') return send(res, 200, { ...shareView(cfg), lenders: brain.lenderStatus(), introductions: introductions.view() });
      const b = await body(req);
      const out = cleanSharePatch(cfg, b);
      if (out.error) return send(res, 400, { error: out.error });
      const wasBorrowing = cfg.share?.borrow?.on === true;
      saveShare(cfg, out.share);
      // 1.5.196 (Tailscale test: Borrow a brain was found off on the Go): a flip of that switch says what flipped it.
      if (wasBorrowing !== out.share.borrow.on) brain.log('borrow', `Borrow a brain switched ${out.share.borrow.on ? 'on' : 'off'} (Settings, ${Object.keys(b).filter((k) => k !== 'check').join(', ') || 'no change asked'})`);
      brain.lenders.state.clear();
      if (!out.share.lendCard) brain.cardLender.close(); // switched off: a lent card closes now
      brain.log('settings', `share brains: lend card ${out.share.lendCard ? 'on' : 'off'}, spread ${out.share.spread}, lend ${out.share.lend ? 'on' : 'off'}, borrow ${out.share.borrow.on ? out.share.borrow.when : 'off'}, pass along ${out.share.passAlong ? 'on' : 'off'}, ${out.share.borrow.bobs.length} Bob(s)`);
      if (b.check) await Promise.all(brain.lenders.bobs().map((x) => brain.lenders.hello(x, { force: true })));
      if (out.share.passAlong) introductions.soon(500); // a new switch or a new Bob: introductions right away
      return send(res, 200, { ...shareView(cfg), lenders: brain.lenderStatus(), introductions: introductions.view() });
    }
    // 1.5.123 The Bob-Net party in Now running: every Bob on the list and what he's doing for the others. This replicant matrix only.
    if (req.method === 'GET' && p === '/api/bob-net/party') {
      if (!isLocal) return send(res, 403, { error: 'this replicant matrix only' });
      await Promise.all(brain.lenders.bobs().map((x) => brain.lenders.hello(x).catch(() => null))); // cached: 30 s good, 60 s down
      return send(res, 200, partyView(brain));
    }
    // 1.5.123 Pass my Bob-Net along: another of your Bobs (signed in) introduces a third. Never from this window.
    if (req.method === 'POST' && p === '/api/bob-net/introduce') {
      if (!isRemote) return send(res, 403, { error: 'only from another of your Bobs' });
      const r = introductions.receive(await body(req).catch(() => ({})), req.socket.remoteAddress);
      return send(res, r.code, r);
    }
    // 1.5.97 Pair with my other Bobs: Find, Pair, and the Yes/No card. Only on this replicant matrix itself.
    if (p === '/api/bob-net/find' || p === '/api/bob-net/pair' || p === '/api/bob-net/answer') {
      if (!isLocal) return send(res, 403, { error: 'Pairing can only be done on this replicant matrix itself.' });
      if (req.method === 'GET' && p === '/api/bob-net/find') return send(res, 200, { ...(await pairing.find()), door: remoteOn, live: remoteLive(), here: tailscaleIps().length > 0 });
      if (req.method === 'GET' && p === '/api/bob-net/pair') return send(res, 200, { pairing: pairing.outgoingView() });
      if (req.method === 'POST' && p === '/api/bob-net/pair') {
        const b = await body(req);
        const r = await pairing.pairWith(b.address);
        return send(res, r.error ? 400 : 200, r);
      }
      if (req.method === 'POST' && p === '/api/bob-net/answer') {
        const b = await body(req);
        const r = pairing.answer(b.id, b.yes === true);
        if (r.ok && b.yes === true) brain.lenders.state.clear();
        return send(res, 200, r);
      }
      return send(res, 404, { error: 'not found' });
    }
    if (req.method === 'GET' && p === '/api/lend/hello') {
      const why = lendRefusal(brain, brain.lendDeps);
      const q = why ? null : brain.lendDeps.quickBrain(brain);
      return send(res, 200, helloFor(brain, { why, quick: q, can: brain.jobCan(), version: VERSION, label: (m) => brain.brainLabel(m), webOn: cfg.webSearch === true, bigBrain: brain.guestBigBrain(), name: myName(), room: myRoom, review: reviewRefusal(brain, brain.lendDeps) ? null : brain.lendDeps.reviewBrain(brain), check: checkHello(brain, brain.lendDeps, (m) => brain.brainLabel(m)) }));
    }
    // 1.5.72 Share jobs: whole jobs from your other Bobs (src/share-jobs.js). start() checks "Take jobs from my other Bobs".
    if (p.startsWith('/api/guest/jobs') && await guestRoute({ req, res, p, url, brain, body, send, serveFile, findOutput, cfg }) !== false) return;
    // Lend my graphics card (src/share-card.js): another of your Bobs asks for a share of this card, through the door only.
    if (req.method === 'POST' && p === '/api/lend/card') {
      if (!isRemote && !isLocal) return send(res, 403, { error: 'no' });
      const r = await lendCardRoute(brain.cardLender, req, await body(req).catch(() => ({})));
      return send(res, r.status, r.body);
    }
    if (req.method === 'POST' && p === '/api/lend/chat') {
      if (!isRemote && !isLocal) return send(res, 403, { error: 'no' });
      return lendChat(brain, req, res, await body(req).catch(() => ({})), brain.lendDeps);
    }
    // 1.5.41 the 🎮 Gaming button on the chat page: on locks Gaming and clears the graphics card, off goes back to Normal.
    if (req.method === 'POST' && p === '/api/gaming-lock') { const b = await body(req); return send(res, 200, await brain.setGamingLock(b.on === true)); }
    if (req.method === 'POST' && p === '/api/pick-folder') { // 1.5.34 Settings > Projects: "Browse..."
      if (!isLocal) return send(res, 403, { error: 'Folders can only be picked on this replicant matrix itself.' });
      try { const b = await body(req).catch(() => ({})); return send(res, 200, { folder: await pickFolder({ purpose: ['save', 'home'].includes(b?.purpose) ? b.purpose : 'project' }) }); } catch (e) { return send(res, 200, { error: e.message }); }
    }
    if (await ownModelsRoute({ req, res, p, isLocal, cfg, brain, body, send: answered })) return;
    if (req.method === 'POST' && p.startsWith('/api/models/') || req.method === 'POST' && p === '/api/settings') {
      if (!isLocal) return send(res, 403, { error: 'Downloads and settings can only be changed on this replicant matrix itself.' });
      const b = await body(req);
      try {
        if (p === '/api/models/scan') return send(res, 200, { found: (await shop.scan()).files.length });
        if (p === '/api/models/download') {
          const ids = [].concat(b.ids || b.id || []).map(String);
          if (!ids.length) return send(res, 400, { error: 'Nothing to download.' });
          if (b.equip && typeof b.equip === 'object') shop.planEquip(b.equip); // 1.5.91: { modelId: [slot ids] }, filled when each is in
          const started = await shop.download(ids[0], { queue: ids.slice(1) });
          // 1.5.38: pressed from the chat's "Download it" button: that message waits in Tasks and runs once it's done.
          if (typeof b.thenJob === 'string') brain.waitForDownload(b.thenJob, ids[0]);
          return send(res, 200, started);
        }
        if (p === '/api/models/role') {
          const patch = await shop.setRole(String(b.job), String(b.value));
          brain.log('settings', `${b.job} -> ${b.value}`);
          return send(res, 200, { ok: true, patch, needsEngine: patch.needsEngine || null, restart: false });
        }
        if (p === '/api/models/cancel') return send(res, 200, { cancelled: shop.cancel(b.id ? String(b.id) : undefined) });
        if (p === '/api/models/pause') return send(res, 200, { ok: shop.pause(String(b.id)) });
        if (p === '/api/models/resume') return send(res, 200, { ok: shop.resume(String(b.id)) });
        if (p === '/api/models/move') return send(res, 200, { ok: shop.moveDownload(String(b.id), b.before ? String(b.before) : null) });
        if (p === '/api/models/remove') return send(res, 200, { ok: shop.removeDownload(String(b.id)) });
        if (p === '/api/models/clear') return send(res, 200, { ok: shop.clearDownloads() });
        if (p === '/api/models/use') {
          const patch = await shop.use(String(b.id));
          brain.log('settings', `now using ${b.id}`);
          return send(res, 200, { ok: true, patch, needsEngine: patch.needsEngine || null, restart: false });
        }
        if (p === '/api/settings') {
          const out = {};
          // Every settings change goes in the logbook with its keys, so nothing changes without a trace.
          brain.log('settings', `changed: ${Object.keys(b).join(', ')}${b.engine ? ` (engine -> ${b.engine})` : ''}`);
          if ('autostart' in b) out.autostart = await setAutostart(cfg, b.autostart === true);
          if ('setupDone' in b) { saveSettings(cfg, { setupDone: b.setupDone === true }); out.setupDone = cfg.setupDone; }
          if ('wantsAsked' in b) { saveSettings(cfg, { wantsAsked: b.wantsAsked === true }); out.wantsAsked = cfg.wantsAsked === true; } // public/wants.js
          if (b.cloudHelpers && typeof b.cloudHelpers === 'object') { saveSettings(cfg, { cloudHelpers: b.cloudHelpers }); out.cloud = cloudStatus(cfg); }
          if (typeof b.look === 'string' && LOOK_ID_RE.test(b.look)) {
            const from = cfg.look || 'sysop';
            saveSettings(cfg, { look: b.look, ...(from !== b.look ? { lookChange: { from, to: b.look, at: Date.now() } } : {}) });
            out.look = b.look;
            out.lookText = lookText(b.look);
          }
          if (b.personality && typeof b.personality === 'object') { saveSettings(cfg, { personality: cleanPersonality({ ...(cfg.personality || {}), ...b.personality }) }); out.personality = cleanPersonality(cfg.personality); }
          if (typeof b.callMe === 'string') {
            const name = b.callMe.replace(/[\u0000-\u001f<>{}"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
            saveSettings(cfg, { callMe: name });
            cfg.userName = name || cfg.windowsName;
            out.userName = cfg.userName; out.callMe = name;
          }
          // 1.5.34 House style (Equip Bob) and Projects (Settings): saved whole, so an emptied box really clears.
          if (b.houseStyle && typeof b.houseStyle === 'object') { replaceSettings(cfg, { houseStyle: b.houseStyle }); out.houseStyle = cleanHouseStyle(cfg.houseStyle); }
          if (Array.isArray(b.projectList)) {
            const list = cleanProjects(b.projectList);
            const bad = list.find((p) => { try { return !fs.statSync(p.path).isDirectory(); } catch { return true; } });
            if (bad) out.projectError = `I can't find the folder ${bad.path}.`;
            else {
              const def = typeof b.defaultProject === 'string' ? b.defaultProject : cfg.defaultProject || '';
              replaceSettings(cfg, { projectList: list, defaultProject: list.some((p) => p.name === def) ? def : '' });
            }
            out.projectList = Object.entries(cfg.projects || {}).map(([name, p]) => ({ name, path: p, missing: !fs.existsSync(p) }));
            out.defaultProject = cfg.defaultProject || '';
          }
          // 1.5.41 Where Bob saves things (Settings): a folder the user picked, or '' for Bob's own (Made by Bob).
          if (typeof b.saveDir === 'string') {
            const want = b.saveDir.trim();
            const bad = want ? saveDirProblem(cfg, want) : '';
            if (bad) out.saveDirError = bad;
            else {
              const used = [...new Set([...(cfg.saveDirsUsed || []), ...(cfg.saveDir ? [cfg.saveDir] : [])])].slice(-10);
              replaceSettings(cfg, { saveDir: want ? path.resolve(want) : '', saveDirsUsed: used });
              applySaveDir(cfg);
              brain.log('settings', `saving what Bob makes in ${cfg.painterDir}`);
            }
            out.saveDir = saveDirView();
          }
          if ('lookComments' in b) { saveSettings(cfg, { lookComments: b.lookComments === true }); out.lookComments = cfg.lookComments === true; }
          // 1.5.148: the person's own word settings for Qwen3.6 brains (Settings, Speed & memory). The whole object each time.
          if (b.qwenPresets && typeof b.qwenPresets === 'object') { cfg.qwenPresets = undefined; saveSettings(cfg, { qwenPresets: b.qwenPresets }); out.qwenPresets = cleanPresets(cfg.qwenPresets); brain.log('settings', `Qwen word settings: ${out.qwenPresets.on ? 'my own' : "Qwen's"}`); }
          if (b.style && typeof b.style === 'object') { saveSettings(cfg, { style: { ...(cfg.style || {}), ...b.style } }); out.style = cfg.style; }
          if (typeof b.session === 'string') { saveSettings(cfg, { session: b.session }); out.session = await brain.setSession(cfg.session || 'normal'); }
          if (b.sessionBrains && typeof b.sessionBrains === 'object') { saveSettings(cfg, { sessionBrains: b.sessionBrains }); out.sessionBrains = sessionBrains(cfg); }
          if (b.activeModels && typeof b.activeModels === 'object') { saveSettings(cfg, { activeModels: b.activeModels }); out.activeModels = cfg.activeModels || {}; } // 1.5.56 Brain catalogue
          if (b.tts && typeof b.tts === 'object') { saveSettings(cfg, { tts: { ...(typeof b.tts.voice === 'string' ? { voice: b.tts.voice } : {}), ...(typeof b.tts.speed === 'number' ? { speed: b.tts.speed } : {}), ...(typeof b.tts.windowsVoice === 'string' ? { windowsVoice: b.tts.windowsVoice } : {}) } }); out.tts = { provider: cfg.tts?.provider || '', voice: cfg.tts?.voice, speed: cfg.tts?.speed || 1, windowsVoice: cfg.tts?.windowsVoice || '' }; }
          if (b.speed && typeof b.speed === 'object') { const sp = Object.fromEntries(Object.entries(b.speed).filter(([k]) => ['threads', 'batch', 'ubatch', 'ctx', 'draft', 'modelArgs', 'args', 'fit', 'turbo', 'brainEngine'].includes(k))); saveSettings(cfg, { llamacpp: sp }); out.speed = speedView(); if ('brainEngine' in sp) out.restart = true; }
          if (b.sessionCtx && typeof b.sessionCtx === 'object') { saveSettings(cfg, { sessionCtx: b.sessionCtx }); out.sessionCtx = cfg.sessionCtx; }
          // 1.5.87: how much each brain keeps in mind, picked per brain (switch off unless turned on).
          if (typeof b.brainCtxOn === 'boolean') { saveSettings(cfg, { brainCtxOn: b.brainCtxOn }); out.brainCtxOn = cfg.brainCtxOn === true; }
          if (typeof b.brainCtxStretch === 'boolean') { saveSettings(cfg, { brainCtxStretch: b.brainCtxStretch }); out.brainCtxStretch = cfg.brainCtxStretch === true; }
          if (b.brainCtx && typeof b.brainCtx === 'object') { saveSettings(cfg, { brainCtx: b.brainCtx }); out.brainCtx = cfg.brainCtx || {}; }
          // "Free memory when Bob is idle" (chat page) and "Free memory after Bob has been quiet for" (Advanced) are one
          // setting: Never there is the switch off here. The time is kept while the switch is off, for when it's on again.
          if (typeof b.ollamaKeepAlive === 'string') {
            // 1.5.3: picking a time never flips the chat-page switch (an old "-1" still means switch off).
            if (b.ollamaKeepAlive === '-1') saveSettings(cfg, { brainMode: 'always' });
            else saveSettings(cfg, { ollamaKeepAlive: b.ollamaKeepAlive, brainMode: brainMode(cfg) });
            brain.applyBrainMode().catch(() => {});
          }
          if (typeof b.brainMode === 'string' && BRAIN_MODES.includes(b.brainMode)) {
            saveSettings(cfg, { brainMode: b.brainMode, ...(b.brainMode === 'wake' && String(cfg.ollamaKeepAlive) === '-1' ? { ollamaKeepAlive: '5m' } : {}) });
            brain.applyBrainMode().catch(() => {});
          }
          if (typeof b.ollamaKeepAlive === 'string' || typeof b.brainMode === 'string') { out.brainMode = brainMode(cfg); out.ollamaKeepAlive = keepTime(cfg); }
          if (typeof b.oneBrain === 'boolean') { saveSettings(cfg, { oneBrain: b.oneBrain }); out.oneBrain = cfg.oneBrain === true; }
          if (typeof b.allTools === 'boolean') { saveSettings(cfg, { allTools: b.allTools }); out.allTools = cfg.allTools === true; }
          if (typeof b.memoryRecall === 'boolean') {
            saveSettings(cfg, { memoryRecall: b.memoryRecall }); out.memoryRecall = cfg.memoryRecall === true; out.memoryBanks = memoryBanksView();
            // Turned on: his memory lines get their vectors now, in the background (processor only; skipped while gaming).
            if (out.memoryRecall && brain.housekeeper) { brain.housekeeper.noEmbed = false; brain.housekeeper.fillMemoryVectors().catch(() => {}); }
          }
          if (typeof b.resumeJobs === 'boolean') { saveSettings(cfg, { resumeJobs: b.resumeJobs }); out.resumeJobs = cfg.resumeJobs === true; }
          if (typeof b.planFirst === 'boolean') { saveSettings(cfg, { planFirst: b.planFirst }); out.planFirst = cfg.planFirst === true; } // 1.5.78 plan card (plan.js)
          if (typeof b.pictureNoWait === 'boolean') { saveSettings(cfg, { pictureNoWait: b.pictureNoWait }); out.pictureNoWait = cfg.pictureNoWait !== false; }
          for (const k of TUNING_KEYS) if (typeof b[k] === 'boolean') { saveSettings(cfg, { [k]: b[k] }); out[k] = cfg[k] === true; if (k === 'pictureFit') pictureFitReset(); }
          if (typeof b.autoSession === 'boolean') { saveSettings(cfg, { autoSession: b.autoSession }); out.autoSession = autoSessionOn(cfg); brain.armIdleCheck(); }
          if (typeof b.webSearch === 'boolean') { saveSettings(cfg, { webSearch: b.webSearch }); out.webSearch = cfg.webSearch === true; }
          if (typeof b.naughtyList === 'boolean') { saveSettings(cfg, { naughtyList: b.naughtyList }); out.naughtyList = cfg.naughtyList === true; } // 1.5.132
          if (typeof b.catalogUpdates === 'boolean') { saveSettings(cfg, { catalogUpdates: b.catalogUpdates }); out.catalogUpdates = cfg.catalogUpdates === true; shop.catalog = listUpdates.merge(shop.shipped); if (out.catalogUpdates) out.listCheck = await checkList(); } // 1.5.137
          if (typeof b.computerLab === 'boolean') { if (b.computerLab && !labRoom().ok) out.computerLabWhy = labRoom().why; else saveSettings(cfg, { computerLab: b.computerLab }); out.computerLab = labOn(cfg); } // 1.5.141
          if (typeof b.howtos === 'boolean') { saveSettings(cfg, { howtos: b.howtos }); out.howtos = cfg.howtos === true; }
          if (typeof b.editOwn === 'boolean') { saveSettings(cfg, { editOwn: b.editOwn }); out.editOwn = cfg.editOwn === true; }
          if (typeof b.quickNotes === 'boolean') { saveSettings(cfg, { quickNotes: b.quickNotes }); out.quickNotes = cfg.quickNotes === true; if (out.quickNotes) { try { ensureNotesFile(cfg); } catch {} } } // notes.js
          if (typeof b.smartNotes === 'boolean') { saveSettings(cfg, { smartNotes: b.smartNotes }); out.smartNotes = cfg.smartNotes === true; } // notes.js, only works with quick notes on
          if (typeof b.docTools === 'boolean') { saveSettings(cfg, { docTools: b.docTools }); out.docTools = cfg.docTools === true; if (!out.docTools) clearDocCache(); } // my-docs.js
          if (typeof b.sandboxCode === 'boolean') { // sandbox-code.js: only switched on where the sandbox holds
            if (b.sandboxCode) { const h = await sandboxHolds(cfg); if (!h.ok) out.sandboxWhy = `The sandbox doesn't hold on this replicant matrix (${h.why}), so this stays off.`; else { saveSettings(cfg, { sandboxCode: true }); out.sandboxNet = h.net === true; } }
            else saveSettings(cfg, { sandboxCode: false });
            out.sandboxCode = cfg.sandboxCode === true;
          }
          // "Let Bob work on repositories" (self-work.js): the switch, the Long memory size, the brain and the list.
          if (b.selfWork && typeof b.selfWork === 'object') { saveSettings(cfg, { selfWork: cleanSelfWork({ ...(cfg.selfWork || {}), ...b.selfWork }) }); applyCodeCopy(cfg); out.selfWork = selfWorkNow(); }
          // 1.5.94 tray and icon: saved, then handed straight to the window program, so they work without a restart.
          if (typeof b.tray === 'boolean') { saveSettings(cfg, { tray: b.tray }); out.tray = cfg.tray !== false; }
          if (typeof b.lookIcon === 'boolean') { saveSettings(cfg, { lookIcon: b.lookIcon }); out.lookIcon = cfg.lookIcon !== false; }
          if ('tray' in b || 'lookIcon' in b || 'look' in b) applyWindowState(cfg);
          if (GAMING_CARD.includes(b.gamingCard)) { saveSettings(cfg, { gamingCard: b.gamingCard }); out.gamingCard = gamingCard(cfg); out.gamingCardNow = brain.engine?.currentCard || null; }
          if (typeof b.mootBeside === 'boolean') { saveSettings(cfg, { mootBeside: b.mootBeside }); out.mootBeside = cfg.mootBeside === true; }
          if (typeof b.apuHoldbackGB === 'number' && b.apuHoldbackGB >= 0 && b.apuHoldbackGB <= 8) { saveSettings(cfg, { apuHoldbackGB: Math.round(b.apuHoldbackGB * 2) / 2 }); out.apuHoldbackGB = apuHoldbackGB(cfg); } // 1.5.181
          if (typeof b.netReview === 'boolean') { saveSettings(cfg, { netReview: b.netReview }); out.netReview = cfg.netReview === true; }
          if (typeof b.chatWhileBusy === 'boolean') { saveSettings(cfg, { chatWhileBusy: b.chatWhileBusy }); out.chatWhileBusy = cfg.chatWhileBusy !== false; brain.pump?.(); }
          if (typeof b.quickOnCpu === 'boolean') { saveSettings(cfg, { quickOnCpu: b.quickOnCpu }); out.quickOnCpu = cfg.quickOnCpu === true; brain.applyBrainMode?.().catch?.(() => {}); }
          if (b.housekeeping && typeof b.housekeeping === 'object') {
            const cur = hkSettings(cfg), h = b.housekeeping, next = { ...cur };
            if ('enabled' in h) next.enabled = h.enabled === true;
            if ('wakeBrain' in h) next.wakeBrain = h.wakeBrain === true;
            if ('embedModel' in h) next.embedModel = h.embedModel;
            for (const k of Object.keys(KINDS)) if (h[k] && typeof h[k] === 'object') next[k] = { ...cur[k], ...h[k] };
            saveSettings(cfg, { housekeeping: cleanHousekeeping(next) });
            out.housekeeping = hkSettings(cfg);
            brain.housekeeper.noEmbed = false; // a newly picked embedding model gets a fresh try
          }
          if (b.updates && typeof b.updates === 'object') { saveSettings(cfg, { updates: { autoCheck: b.updates.autoCheck === true } }); out.updates = cfg.updates; }
          if (b.engineUpdates && typeof b.engineUpdates === 'object') { const was = keeperOn(cfg); saveSettings(cfg, { engineUpdates: { auto: b.engineUpdates.auto !== false } }); if (!was && keeperOn(cfg)) engineKeeper.tick({ force: true }).catch(() => {}); out.engineUpdates = engineKeeper.view(); }
          if (b.downloads && typeof b.downloads === 'object') { saveSettings(cfg, { downloads: { ...(cfg.downloads || {}), ...b.downloads } }); out.downloads = cfg.downloads; shop.pumpDownloads(); }
          if (typeof b.catName === 'string') { saveSettings(cfg, { catName: b.catName }); out.catName = cfg.catName || 'Patches'; }
          if (b.workshop && typeof b.workshop === 'object') { saveSettings(cfg, { workshop: b.workshop }); if (cfg.workshop?.enabled) ensureWorkshop(cfg); out.workshop = workshopView(); }
          if (b.engine === 'llamacpp') { // 1.5.196: never Ollama now (Brain Engine is the only engine for brains)
            saveSettings(cfg, { engine: b.engine }); out.restart = true; }
          // 1.5.17x Settings > Engines' engine for brains. 1.5.196: only the one engine Bob may use here (brainsEngineSettings refuses the rest).
          if (typeof b.brainsEngine === 'string' && brainsEngineSettings(b.brainsEngine)) { saveSettings(cfg, brainsEngineSettings(b.brainsEngine)); out.restart = true; out.engineChoices = engineChoices(cfg); }
          // The Lab's engine: '' (same as Bob's brains), Brain Engine or llama.cpp. Used from the Lab's next job.
          if (typeof b.labEngine === 'string') { saveSettings(cfg, { labEngine: b.labEngine }); out.engineChoices = engineChoices(cfg); }
          return send(res, 200, out);
        }
      } catch (e) { return send(res, 409, { error: e.message }); }
      return send(res, 404, { error: 'not found' });
    }
    if (await saveRoute({ req, res, p, isLocal, cfg, brain, shop, body, bigBody, send: answered })) return;
    // "Let Bob work on repositories": Make the code copy of one repository (git clone into inn/own-code/<name>).
    // Only on this replicant matrix, only with the switch on, and never over a copy that's already there.
    if (req.method === 'POST' && p === '/api/self-work/copy') {
      if (!isLocal) return send(res, 403, { error: 'Only on this replicant matrix itself.' });
      if (cfg.selfWork?.enabled !== true) return send(res, 409, { error: 'Turn on "Let Bob work on repositories" first.' });
      const b = await body(req).catch(() => ({}));
      const repo = repoNamed(cfg, String(b.repo || 'bob'));
      if (!repo) return send(res, 404, { error: 'That repository isn\'t in the list.' });
      // Git first: Bob's own copy when the computer has none (self-work-tools.js; the owner asked for that).
      let git;
      try { git = await ensureTool(cfg, 'git', {}); } catch (e) { return send(res, 200, { ok: false, why: e.message, selfWork: selfWorkNow() }); }
      const r = { ...(await makeCodeCopy(cfg, repo, { git: git.file })), gotGit: git.fetched };
      applyCodeCopy(cfg);
      brain.log('settings', r.ok ? `repositories: code copy of ${repo.name} ${r.already ? 'already there' : 'made'} at ${r.dir}` : `repositories: code copy of ${repo.name} not made: ${r.why}`);
      return send(res, 200, { ...r, selfWork: selfWorkNow() });
    }
    // 1.5.91: the chat's Set it up card (the phone's too, like approval cards: the card's id is the permission).
    if (req.method === 'POST' && p === '/api/setup/answer') {
      const b = await body(req);
      try { return send(res, 200, await brain.answerSetup(String(b.id || ''), b.yes === true)); } catch (e) { return send(res, 200, { ok: false, why: e.message }); }
    }
    if (req.method === 'POST' && p === '/api/approve') {
      const { id, allow, rows, items, note } = await body(req);
      if (brain.awayApprovals.has(String(id))) return send(res, (await answerAway(brain, id, allow, rows, items)) ? 200 : 502, { ok: true }); // 1.5.72: a card from a job on another Bob
      return send(res, brain.answerApproval(id, allow, rows, items, note) ? 200 : 404, { ok: true });
    }
    if (p === '/api/checkins' && await checkinsRoute({ req, res, p, isLocal, brain, body, send })) return;
    if (p.startsWith('/api/adventure') && await adventureRoute({ req, res, p, isLocal, brain, body, send })) return; // 1.5.117 🎲 Adventure
    if (p.startsWith('/api/games') && await gamesRoute({ req, res, p, isLocal, brain, body, send })) return; // 1.5.121 🧩 Games
    if (p === '/api/telegram' && await telegramRoute({ req, res, p, isLocal, brain, body, send })) return;
    if (p === '/api/discord' && await discordRoute({ req, res, p, isLocal, brain, body, send })) return;
    if (p.startsWith('/api/lab') && await labRoute({ req, res, p, isLocal, lab, body, send })) return; // 1.5.141 Computer Science Lab
    if (p.startsWith('/api/rent') && await rentRoute({ req, res, p, isLocal, brain, cfg, body, send })) return; // 1.5.127 rented brains
    if (p === '/api/hands/schedules' && await schedulesRoute({ req, res, p, isLocal, brain, body, send })) return;
    if (p.startsWith('/api/hands') && await handsRoute({ req, res, p, isLocal, brain, cfg, body, send })) return;
    if (p.startsWith('/api/quarantine') && await quarantineRoute({ req, res, p, isLocal, brain, cfg, body, send })) return;
    if (await voiceRoute({ req, res, p, isLocal, cfg, shop, body, send: answered, TYPES })) return;
    if (await refsRoute({ req, res, p, url, brain, body, send: answered, serveFile: servedFile })) return;
    if (await queueRoute({ req, res, p, brain, body, send: answered })) return;
    if (req.method === 'GET' && p === '/api/downloads') return send(res, 200, shop.downloadsView());
    if (req.method === 'GET' && p === '/api/gpu') {
      // The whole graphics card (every app) and system memory (1.5.3). Bob's own brain line in Now running comes
      // from /api/brain, the same reading as the label at the top of the chat (1.5.26), so the two always agree.
      // 1.5.30: processor load and the memory Bob's own app takes (both read inside Node, no extra program).
      // costMs: what this reading itself cost, so its overhead can be checked on a real PC.
      const t0 = performance.now(), c0 = process.cpuUsage();
      const card = await gpuNow();
      const out = { ...card, ram: ramNow(), cpu: cpuNow(), app: { ramGB: memGB(process.memoryUsage.rss()) } };
      const c = process.cpuUsage(c0);
      out.reads = ++gpuReads; // how many readings so far: lets a test on this replicant matrix confirm they stop under a full-screen game
      out.costMs = { wait: Math.round((performance.now() - t0) * 10) / 10, bobCpu: Math.round((c.user + c.system) / 100) / 10, cardCheck: gpuCache.ms ?? null };
      return send(res, 200, out);
    }
    if (await updateRoute({ req, res, p, isLocal, cfg, brain, shop, body, send: answered })) return;

    if (await tidyRoute({ req, res, p, url, isLocal, cfg, brain, body, send: answered, broadcast })) return;

    if (await filesRoute({ req, res, p, url, isLocal, cfg, brain, body, send: answered, serveFile: servedFile })) return;
    // 1.5.79: the memories that fit a message, for a chat the phone answers with its own brain (Android app note).
    // Empty while "Remember only what fits" is off. Phone access already guards every /api call.
    if (req.method === 'POST' && p === '/api/memory/recall') {
      const b = await body(req);
      if (!recallOn(cfg)) return send(res, 200, { on: false, text: '' });
      const text = String(b.text || '').slice(0, 4000);
      const r = await brain.recall(String(b.session || '').replace(/[^\w-]/g, '').slice(0, 64) || null, text).catch(() => '');
      return send(res, 200, { on: true, text: r, always: brain.memory() });
    }
    if (req.method === 'GET') return serveFile(res, publicDir, p === '/' ? 'index.html' : decodeURIComponent(p.slice(1)));
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

// Port taken (usually Bob is already running): say so and quit, rather than sit there not listening.
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${cfg.port} is in use. Bob is probably already running: open http://localhost:${cfg.port}` : `Bob couldn't start: ${e.message}`);
  if (process.versions.electron) throw e; // Bob.exe checks the port first and shows its own message
  process.exit(1);
});
server.listen(cfg.port, startedWide ? remote.bindAddress : cfg.host, () => {
  if (remoteOn) console.log(`Phone access is on for: ${[...remoteHosts].join(', ')}`);
  if (remoteOn && !startedWide) applyRemote(); // the Tailscale addresses, right away
  console.log(`Bob ${VERSION.label} is open for business at http://${cfg.host === '127.0.0.1' ? 'localhost' : cfg.host}:${cfg.port}`);
  console.log(`Inn folder: ${cfg.innDir}`);
  // 1.5.127 Rented brains: a hired machine Bob started and nobody stopped (a crash, a power cut) is found and offered a Stop button.
  setTimeout(() => brain.rentals?.findLeftovers().catch(() => {}), 5000).unref?.();
  brain.log('start', `Bob started on port ${cfg.port}`);
  applyWindowState(cfg); // 1.5.94 tray and icon, for Bob's own window (nothing in a browser)
});
// Browsers may send "localhost" to the IPv6 loopback (::1) first, so listen there too when Bob is local-only.
if (!startedWide && cfg.host === '127.0.0.1') {
  const v6 = http.createServer(server.listeners('request')[0]);
  v6.on('error', () => {}); // no IPv6 on this replicant matrix: fine, 127.0.0.1 still works
  v6.listen(cfg.port, '::1');
}
// 1.5.94: when the door is opened after start-up, Bob listens on this replicant matrix's Tailscale addresses
// (and only those), so it works without a restart. Tailscale can connect later, so it looks again every minute.
const netServers = new Map(); // address -> server
function tailscaleIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && isTailscaleIp(n.address)) out.push(n.address);
  return out;
}
let ownTs = { at: 0, set: new Set() };
function ownTsHosts() { if (Date.now() - ownTs.at > 30000) ownTs = { at: Date.now(), set: new Set([...tailscaleIps(), ...(remoteHome ? homeIps().map((m) => m.address) : [])].map((ip) => `${ip}:${cfg.port}`)) }; return ownTs.set; }
function remoteLive() { return remoteOn && (startedWide || netServers.size > 0); }
function applyRemote() {
  readRemote();
  ownTs.at = 0; // the switch may have changed
  const want = remoteOn && !startedWide ? [...tailscaleIps(), ...(remoteHome ? homeIps().map((m) => m.address) : [])] : [];
  for (const [ip, s] of netServers) if (!want.includes(ip)) { try { s.close(); } catch {} netServers.delete(ip); }
  for (const ip of want) {
    if (netServers.has(ip)) continue;
    const s = http.createServer(server.listeners('request')[0]);
    s.on('error', (e) => { netServers.delete(ip); brain.log('settings', `couldn't listen on ${ip}:${cfg.port} (${e.code || e.message})`); });
    s.listen(cfg.port, ip, () => brain.log('settings', `listening on ${ip}:${cfg.port} for your other replicant matrices`));
    netServers.set(ip, s);
  }
}
setInterval(() => { if (remoteOn && !startedWide) applyRemote(); }, 60_000).unref();
// One bad request or background job must never take Bob down: log it and keep serving.
process.on('unhandledRejection', (e) => { console.error('Unhandled:', e); try { brain.log('error', String(e && e.stack || e).slice(0, 500)); } catch {} });
process.on('uncaughtException', (e) => { console.error('Uncaught:', e); try { brain.log('error', String(e && e.stack || e).slice(0, 500)); } catch {} });


// 1.5.87: the equipped brains for "How much each brain keeps in mind": one row per model file, with the jobs it does.
function selfWorkNow() {
  let brains = [];
  try { brains = gatherBrains(cfg, { own: ownEntries(cfg), catalogFile: (id) => catalogFileFor(cfg, id) }); } catch {}
  return { ...selfWorkView(cfg, brains), bobNet: brain.lenders?.bobs?.().length || 0 };
}

async function brainCtxView() {
  const jobs = new Map();
  const add = (model, label) => { if (!model || typeof model !== 'string') return; if (!jobs.has(model)) jobs.set(model, []); if (!jobs.get(model).includes(label)) jobs.get(model).push(label); };
  for (const [hat, model] of Object.entries(cfg.models || {})) add(model, SLOT_NAMES[hat] || hat);
  for (const [k, model] of Object.entries(sessionBrains(cfg) || {})) add(model, SLOT_NAMES[k] || ({ coding: 'Coding session' })[k] || k);
  const brains = [];
  let anyStretch = false;
  for (const [model, labels] of jobs) {
    const max = await Promise.resolve(brain.engine?.maxCtx?.(model)).catch(() => null) || null;
    const pick = bobsPick(model, labels.includes('Coding') ? 'tinker' : 'bob');
    // Long memory: which brains could be stretched (shown even with it off, so the switch only appears when it helps).
    const could = await Promise.resolve(brain.engine?.stretchMax?.(model, { evenOff: true })).catch(() => null) || null;
    if (could) anyStretch = true;
    const stretch = stretchOn(cfg) ? could : null;
    const choices = choicesFor(max, { stretch });
    // A stretched size that won't fit this machine stays in the menu, greyed out, with what it would need.
    const room = {};
    for (const v of choices.filter((c) => max && c > max)) room[v] = await Promise.resolve(brain.engine?.roomFor?.(model, v)).catch(() => null) || { fits: null };
    brains.push({ model, name: friendlyName(model), jobs: labels, max, choices, room, bobPick: max ? Math.min(pick, max) : Math.min(pick, SAFE_CTX), picked: pickedCtx({ ...cfg, brainCtxOn: true }, model, max, { stretch }), guide: ctxGuide(max, pick, { gaming: labels.includes(SLOT_NAMES.gaming), stretch }) });
  }
  return { on: ctxOn(cfg), stretch: stretchOn(cfg), canStretch: anyStretch && cfg.engine === 'llamacpp', brains };
}

// A model id by its friendly catalog name (model ids stay in Advanced).
function friendlyName(id) {
  if (!id) return '';
  const entry = shop.catalog.models.find((m) => m.id === id || (m.ollama && (m.ollama === id || m.ollama === id + ':latest' || m.ollama + ':latest' === id)));
  return entry?.name || id;
}

// Processor load since the last reading (Now running asks every few seconds while it is open).
let cpuSnap = null, gpuReads = 0;
let appCpu = null; // 1.5.42: Bob's own app share of the processor, from Node's own counter (no extra program)
function cpuNow() {
  const cpus = os.cpus();
  const { snap, pct } = cpuLoad(cpuSnap, cpus);
  cpuSnap = snap;
  const now = { t: performance.now(), u: process.cpuUsage() };
  let appPct = null;
  if (appCpu) { const ms = now.t - appCpu.t, used = (now.u.user - appCpu.u.user + now.u.system - appCpu.u.system) / 1000; if (ms > 0) appPct = Math.min(100, Math.round((used / (ms * cpus.length)) * 1000) / 10); }
  appCpu = now;
  return { loadPct: pct, appPct };
}

// Graphics card memory for the Now running panel (NVIDIA only; nvidia-smi ships with the driver).
let gpuCache = { at: 0, val: null };
async function gpuNow() {
  if (Date.now() - gpuCache.at < 3000) return gpuCache.val;
  const { execFile } = await import('node:child_process');
  const t0 = performance.now();
  const gpu = await new Promise((resolve) => execFile('nvidia-smi', ['--query-gpu=name,memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'], { timeout: 4000, windowsHide: true }, (err, out) => {
    if (err) return resolve(null);
    const [name, used, total, load] = String(out).split('\n')[0].split(',').map((x) => x.trim());
    // 1.5.30: how busy the card is, from the same nvidia-smi call (no extra program).
    resolve(name ? { name, usedGB: Math.round(Number(used) / 102.4) / 10, totalGB: Math.round(Number(total) / 102.4) / 10, loadPct: Number.isFinite(Number(load)) && load !== '' ? Number(load) : null } : null);
  }));
  gpuCache = { at: Date.now(), val: { gpu }, ms: Math.round((performance.now() - t0) * 10) / 10 }; // nvidia-smi's own run time
  return gpuCache.val;
}
