// Bob's local server: serves the panel and a small API. Only listens on this PC.
import { ramNow, memGB } from './server-ram.js';
import { cpuLoad } from './speed-stats.js';
import os from 'node:os';
import { brainMode, BRAIN_MODES, keepTime } from './brain-mode.js';
import http from 'node:http';
import { lookText } from './look.js';
import { cleanPersonality } from '../public/personality.js';
import { cleanHouseStyle } from '../public/house-style.js';
import { pickFolder } from './pick-folder.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig, appDir, saveSettings, replaceSettings, cleanProjects, VERSION, findOutput, saveDirProblem, applySaveDir } from './config.js';
import { Brain } from './brain.js';
import { transcribe } from './stt.js';
import { ModelShop } from './models.js';
import { autostartOn, setAutostart } from './autostart.js';
import { capabilities } from './capabilities.js';
import { cloudStatus } from './cloud.js';
import { say, KOKORO_VOICES, stopVoices } from './tts.js';
process.on('exit', () => stopVoices()); // never leave a voice holding the graphics card
import { workshopDir, listWorkflows, ensureWorkshop } from './workshop.js';
import { SESSIONS, currentSession, sessionBrains } from './sessions.js';
import { autoSessionOn } from './auto-session.js';
import { gamingCard, GAMING_CARD } from './gaming-card.js';
import { plan as uninstallPlan, startUninstall } from './uninstall.js';
import { voiceList, publicView, sampleFor, clearSamples } from './voice-samples.js';
import { checkUpdate, startUpdate, updateStatus, requestRestart } from './update.js';
import { describe as describeFile, openFile, peek as peekFile } from './files.js';
import { wavePeaks } from './wave.js';
import { refuseForeign } from './guard.js';
import { search } from './search.js';
import { hkSettings, cleanHousekeeping, KINDS, UNITS } from './housekeeping.js';
import { handsRoute } from './hands-routes.js';
import { quarantineRoute } from './quarantine-routes.js';
import { schedulesRoute, startSchedules } from './hands-schedules.js';
import { handsSettings } from './hands-settings.js';
import { tuning, TUNING_KEYS, pictureFitReset } from './tuning.js';
import { gatherFacts, tipsFrom } from './pc-check.js';
import { speedTest, speedHistory } from './speed-test.js';
import { OS, features } from './platform.js';

const cfg = loadConfig();
const publicDir = path.join(appDir, 'public');

// llama.cpp speed settings, as the app shows them.
function speedView() {
  const lc = cfg.llamacpp || {};
  return { fit: typeof lc.fit === 'boolean' ? lc.fit : null, threads: lc.threads || null, batch: lc.batch || null, ubatch: lc.ubatch || null, ctx: lc.ctx || null, draft: lc.draft || { enabled: false, model: '', max: 16, min: 1, ngld: 99 }, modelArgs: lc.modelArgs || {}, args: lc.args || null };
}
// 1.5.41 Where Bob saves things, as Settings shows it: the folder now, Bob's own, and whether a picked one has gone.
function saveDirView() {
  return { folder: cfg.painterDir, own: cfg.defaultPainterDir, picked: cfg.saveDir || '', custom: Boolean(cfg.saveDir) && !cfg.saveDirMissing, missing: cfg.saveDirMissing === true };
}
const clients = new Set();

function broadcast(ev) {
  const data = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) res.write(data);
}

const brain = new Brain(cfg, broadcast);
// 1.5.38: when Downloads change, a job waiting for one (a song waiting for the music models) may be able to go.
const shop = new ModelShop(cfg, (ev) => { broadcast(ev); if (ev?.type === 'downloads') brain.downloadsChanged(); }, brain.engine);
// 1.5.24: the card's size, for picture settings matched to it (only used when that switch is on).
if (!cfg.gpuVramGB) shop.hardware().then((h) => { if (h?.gpu?.vramGB) cfg.cardGB = h.gpu.vramGB; }).catch(() => {});
brain.shop = shop; // so Bob can tell when a model is on the PC but not assigned to a job
startSchedules(brain); // ticks once a minute; nothing is ever due while the Schedules hand is off
if (!shop.found.at) shop.scan().catch(() => {});

function workshopView() {
  return { enabled: cfg.workshop?.enabled === true, port: Number(cfg.workshop?.port) || 8188, folder: workshopDir(cfg), count: listWorkflows(cfg).filter((w) => w.ok).length };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webm': 'video/webm', '.mp4': 'video/mp4', '.avi': 'video/x-msvideo', '.svg': 'image/svg+xml',
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

async function body(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 1e6) throw new Error('too big'); }
  return s ? JSON.parse(s) : {};
}

// Block other websites from talking to Bob: check Host (DNS rebinding) and require
// a custom header on every POST (browsers won't send it cross-site without CORS, which we never grant).
const localHosts = new Set([`127.0.0.1:${cfg.port}`, `localhost:${cfg.port}`, `[::1]:${cfg.port}`]);
const remote = cfg.remote || {};
const remoteOn = Boolean(remote.enabled && remote.passcode && String(remote.passcode).length >= 6);
const remoteHosts = new Set((remote.hosts || []).map((h) => String(h).toLowerCase()));
const authToken = crypto.createHash('sha256').update('bob:' + (remote.passcode || '') + ':' + cfg.agentDir).digest('hex');
const loginTries = [];

// Phone access over Tailscale only: loopback or the Tailscale range (100.64.0.0/10).
function fromTailscaleOrLocal(addr) {
  const a = String(addr || '').replace(/^::ffff:/, '');
  if (a === '127.0.0.1' || a === '::1') return true;
  const m = a.match(/^100\.(\d+)\./);
  return Boolean(m && Number(m[1]) >= 64 && Number(m[1]) <= 127);
}
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
    const isRemote = !isLocal && remoteOn && remoteHosts.has(host) && fromTailscaleOrLocal(req.socket.remoteAddress);
    if (!isLocal && !isRemote) return send(res, 403, { error: 'bad host' });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

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
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
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
      const { sessionId = 'main', text, refs = [], effort = 'low' } = await body(req);
      if (!text || !String(text).trim()) return send(res, 400, { error: 'empty' });
      const attach = [].concat(refs).map(String).filter((id) => /^[0-9a-f]{8}$/.test(id) && brain.refs.list().some((r) => r.id === id));
      return send(res, 200, brain.enqueue(String(sessionId), String(text).slice(0, 20000), attach, String(effort)));
    }
    // Model shop and settings. Downloads and settings changes only from this PC, never from the phone.
    if (req.method === 'GET' && p === '/api/models') return send(res, 200, await shop.list());
    if (req.method === 'GET' && p === '/api/cloud') return send(res, 200, cloudStatus(cfg));
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
    if (req.method === 'GET' && p === '/api/capabilities') return send(res, 200, capabilities(cfg));
    if (req.method === 'GET' && p === '/api/roles') return send(res, 200, await shop.roles());
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
    if (req.method === 'GET' && p === '/api/settings') {
      return send(res, 200, { autostart: autostartOn(), setupDone: Boolean(cfg.setupDone), look: cfg.look || null, lookText: lookText(cfg.look), personality: cleanPersonality(cfg.personality), lookComments: cfg.lookComments !== false, userName: cfg.userName || '', callMe: cfg.callMe || '', windowsName: cfg.windowsName || '', engine: cfg.engine, workshop: workshopView(), catName: cfg.catName || 'Patches', version: VERSION, oneBrain: cfg.oneBrain === true, allTools: cfg.allTools === true, resumeJobs: cfg.resumeJobs === true, autoSession: autoSessionOn(cfg), gamingLock: cfg.gamingLock === true, sessionBy: cfg.sessionBy === 'bob' ? 'bob' : 'you', quickOnCpu: cfg.quickOnCpu === true, chatWhileBusy: cfg.chatWhileBusy !== false, mootBeside: cfg.mootBeside === true, webSearch: cfg.webSearch === true, gamingCard: gamingCard(cfg), gamingCardNow: brain.engine?.currentCard || null, pictureNoWait: cfg.pictureNoWait !== false, ...tuning(cfg), downloads: { concurrent: cfg.downloads?.concurrent === 2 ? 2 : 1, resumeOnStart: cfg.downloads?.resumeOnStart === true }, updates: { autoCheck: cfg.updates?.autoCheck === true }, ollamaKeepAlive: keepTime(cfg), brainMode: brainMode(cfg), tts: { provider: cfg.tts?.provider || '', voice: cfg.tts?.voice || 'am_michael', speed: cfg.tts?.speed || 1, windowsVoice: cfg.tts?.windowsVoice || '', voicesFolder: path.join(cfg.innDir, 'voices') }, kokoroVoices: KOKORO_VOICES, session: currentSession(cfg), sessions: Object.entries(SESSIONS).map(([id, x]) => ({ id, ...x })), sessionBrains: sessionBrains(cfg), sessionCtx: cfg.sessionCtx || {}, speed: speedView(), style: cfg.style || {}, painter: cfg.painter?.engine || 'comfy', platform: process.platform, os: OS, features: features(), home: cfg.agentDir, housekeeping: hkSettings(cfg), hands: handsSettings(cfg), houseStyle: cleanHouseStyle(cfg.houseStyle), projectList: Object.entries(cfg.projects || {}).map(([name, p]) => ({ name, path: p, missing: !fs.existsSync(p) })), defaultProject: cfg.defaultProject || '', saveDir: saveDirView() });
    }
    // 1.5.41 the 🎮 Gaming button on the chat page: on locks Gaming and clears the graphics card, off goes back to Normal.
    if (req.method === 'POST' && p === '/api/gaming-lock') { const b = await body(req); return send(res, 200, await brain.setGamingLock(b.on === true)); }
    if (req.method === 'POST' && p === '/api/pick-folder') { // 1.5.34 Settings > Projects: "Browse..."
      if (!isLocal) return send(res, 403, { error: 'Folders can only be picked on the PC itself.' });
      try { const b = await body(req).catch(() => ({})); return send(res, 200, { folder: await pickFolder({ purpose: b?.purpose === 'save' ? 'save' : 'project' }) }); } catch (e) { return send(res, 200, { error: e.message }); }
    }
    if (req.method === 'POST' && p.startsWith('/api/models/') || req.method === 'POST' && p === '/api/settings') {
      if (!isLocal) return send(res, 403, { error: 'Downloads and settings can only be changed on the PC itself.' });
      const b = await body(req);
      try {
        if (p === '/api/models/scan') return send(res, 200, { found: (await shop.scan()).files.length });
        if (p === '/api/models/download') {
          const ids = [].concat(b.ids || b.id || []).map(String);
          if (!ids.length) return send(res, 400, { error: 'Nothing to download.' });
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
          if (b.cloudHelpers && typeof b.cloudHelpers === 'object') { saveSettings(cfg, { cloudHelpers: b.cloudHelpers }); out.cloud = cloudStatus(cfg); }
          if (typeof b.look === 'string' && /^[a-z]{1,20}(-\d{1,2})?$/.test(b.look)) {
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
          if ('lookComments' in b) { saveSettings(cfg, { lookComments: b.lookComments !== false }); out.lookComments = cfg.lookComments !== false; }
          if (b.style && typeof b.style === 'object') { saveSettings(cfg, { style: { ...(cfg.style || {}), ...b.style } }); out.style = cfg.style; }
          if (typeof b.session === 'string') { saveSettings(cfg, { session: b.session }); out.session = await brain.setSession(cfg.session || 'normal'); }
          if (b.sessionBrains && typeof b.sessionBrains === 'object') { saveSettings(cfg, { sessionBrains: b.sessionBrains }); out.sessionBrains = sessionBrains(cfg); }
          if (b.tts && typeof b.tts === 'object') { saveSettings(cfg, { tts: { ...(typeof b.tts.voice === 'string' ? { voice: b.tts.voice } : {}), ...(typeof b.tts.speed === 'number' ? { speed: b.tts.speed } : {}), ...(typeof b.tts.windowsVoice === 'string' ? { windowsVoice: b.tts.windowsVoice } : {}) } }); out.tts = { provider: cfg.tts?.provider || '', voice: cfg.tts?.voice, speed: cfg.tts?.speed || 1, windowsVoice: cfg.tts?.windowsVoice || '' }; }
          if (b.speed && typeof b.speed === 'object') { const sp = Object.fromEntries(Object.entries(b.speed).filter(([k]) => ['threads', 'batch', 'ubatch', 'ctx', 'draft', 'modelArgs', 'args', 'fit'].includes(k))); saveSettings(cfg, { llamacpp: sp }); out.speed = speedView(); }
          if (b.sessionCtx && typeof b.sessionCtx === 'object') { saveSettings(cfg, { sessionCtx: b.sessionCtx }); out.sessionCtx = cfg.sessionCtx; }
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
          if (typeof b.resumeJobs === 'boolean') { saveSettings(cfg, { resumeJobs: b.resumeJobs }); out.resumeJobs = cfg.resumeJobs === true; }
          if (typeof b.pictureNoWait === 'boolean') { saveSettings(cfg, { pictureNoWait: b.pictureNoWait }); out.pictureNoWait = cfg.pictureNoWait !== false; }
          for (const k of TUNING_KEYS) if (typeof b[k] === 'boolean') { saveSettings(cfg, { [k]: b[k] }); out[k] = cfg[k] === true; if (k === 'pictureFit') pictureFitReset(); }
          if (typeof b.autoSession === 'boolean') { saveSettings(cfg, { autoSession: b.autoSession }); out.autoSession = autoSessionOn(cfg); brain.armIdleCheck(); }
          if (typeof b.webSearch === 'boolean') { saveSettings(cfg, { webSearch: b.webSearch }); out.webSearch = cfg.webSearch === true; }
          if (GAMING_CARD.includes(b.gamingCard)) { saveSettings(cfg, { gamingCard: b.gamingCard }); out.gamingCard = gamingCard(cfg); out.gamingCardNow = brain.engine?.currentCard || null; }
          if (typeof b.mootBeside === 'boolean') { saveSettings(cfg, { mootBeside: b.mootBeside }); out.mootBeside = cfg.mootBeside === true; }
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
          if (b.downloads && typeof b.downloads === 'object') { saveSettings(cfg, { downloads: { ...(cfg.downloads || {}), ...b.downloads } }); out.downloads = cfg.downloads; shop.pumpDownloads(); }
          if (typeof b.catName === 'string') { saveSettings(cfg, { catName: b.catName }); out.catName = cfg.catName || 'Patches'; }
          if (b.workshop && typeof b.workshop === 'object') { saveSettings(cfg, { workshop: b.workshop }); if (cfg.workshop?.enabled) ensureWorkshop(cfg); out.workshop = workshopView(); }
          if (b.engine === 'ollama' || b.engine === 'llamacpp') { saveSettings(cfg, { engine: b.engine }); out.restart = true; }
          return send(res, 200, out);
        }
      } catch (e) { return send(res, 409, { error: e.message }); }
      return send(res, 404, { error: 'not found' });
    }
    if (req.method === 'POST' && p === '/api/approve') {
      const { id, allow, rows, items } = await body(req);
      return send(res, brain.answerApproval(id, allow, rows, items) ? 200 : 404, { ok: true });
    }
    if (p === '/api/hands/schedules' && await schedulesRoute({ req, res, p, isLocal, brain, body, send })) return;
    if (p.startsWith('/api/hands') && await handsRoute({ req, res, p, isLocal, brain, cfg, body, send })) return;
    if (p.startsWith('/api/quarantine') && await quarantineRoute({ req, res, p, isLocal, brain, cfg, body, send })) return;
    if (req.method === 'POST' && p === '/api/transcribe') {
      const chunks = [];
      let size = 0;
      for await (const c of req) { size += c.length; if (size > 15e6) return send(res, 413, { error: 'Recording too long.' }); chunks.push(c); }
      try { return send(res, 200, { text: await transcribe(cfg, Buffer.concat(chunks)) }); }
      catch (e) { return send(res, 502, { error: e.message }); }
    }
    // The reference shelf. Uploads are raw image bytes; name, kind and notes ride in the query string.
    if (req.method === 'GET' && p === '/api/refs') return send(res, 200, brain.refs.list().map((r) => ({ ...r, ...brain.refs.info(r), url: `/refs/${r.file}` })));
    // An upright copy of a picture that was stored on its side (phone photos), made by Bob's window.
    if (req.method === 'POST' && p === '/api/refs/upright') {
      const chunks = [];
      let size = 0;
      for await (const c of req) { size += c.length; if (size > 15e6) return send(res, 413, { error: 'That picture is too big (15 MB max).' }); chunks.push(c); }
      try {
        const r = brain.refs.replace(String(url.searchParams.get('id') || ''), Buffer.concat(chunks));
        brain.log('refs', `turned ${r.name} upright`);
        return send(res, 200, { ...r, url: `/refs/${r.file}` });
      } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (req.method === 'POST' && p === '/api/refs') {
      const chunks = [];
      let size = 0;
      for await (const c of req) { size += c.length; if (size > 15e6) return send(res, 413, { error: 'That picture is too big (15 MB max).' }); chunks.push(c); }
      try {
        const q = url.searchParams;
        const r = brain.refs.add(Buffer.concat(chunks), { name: q.get('name'), kind: q.get('kind'), notes: q.get('notes') });
        brain.log('refs', `added ${r.name} (${r.kind})`);
        return send(res, 200, { ...r, url: `/refs/${r.file}` });
      } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (req.method === 'POST' && (p === '/api/refs/update' || p === '/api/refs/delete')) {
      const b = await body(req);
      try {
        if (p === '/api/refs/delete') return send(res, 200, { removed: brain.refs.remove(String(b.id)) });
        const r = brain.refs.update(String(b.id), { name: b.name, kind: b.kind, notes: b.notes });
        return send(res, 200, { ...r, url: `/refs/${r.file}` });
      } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (req.method === 'GET' && p.startsWith('/refs/')) {
      const f = path.basename(decodeURIComponent(p.slice(6)));
      if (!/^[0-9a-f]{8}\.(png|jpg|webp)$/.test(f)) return send(res, 404, { error: 'not found' });
      return serveFile(res, brain.refs.dir, f);
    }
    if (req.method === 'GET' && p === '/api/queue') return send(res, 200, brain.queueView());
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
      out.reads = ++gpuReads; // how many readings so far: lets a test on the PC confirm they stop under a full-screen game
      out.costMs = { wait: Math.round((performance.now() - t0) * 10) / 10, bobCpu: Math.round((c.user + c.system) / 100) / 10, cardCheck: gpuCache.ms ?? null };
      return send(res, 200, out);
    }
    if (req.method === 'GET' && p === '/api/update/check') return send(res, 200, checkUpdate());
    if (req.method === 'GET' && p === '/api/update/status') return send(res, 200, updateStatus(cfg) || {});
    if (req.method === 'POST' && p === '/api/update/restart') {
      if (!isLocal) return send(res, 403, { error: 'Only on the PC itself.' });
      const { when } = await body(req);
      try { return send(res, 200, requestRestart(cfg, when)); } catch (e) { return send(res, 409, { error: e.message }); }
    }
    // "Remove Bob" (Settings): only on the PC itself, after the window's confirm.
    if (req.method === 'GET' && p === '/api/uninstall') { const pl = uninstallPlan(cfg); return send(res, 200, { canRun: pl.canRun, why: pl.why, app: pl.app, inn: pl.inn, models: pl.models }); }
    if (req.method === 'POST' && p === '/api/uninstall') {
      if (!isLocal) return send(res, 403, { error: 'Only on the PC itself.' });
      const { confirm, notes, models } = await body(req);
      if (confirm !== 'remove') return send(res, 400, { error: 'Confirm first.' });
      try {
        if (autostartOn()) await setAutostart(cfg, false); // take the login item away before the program goes
        const r = startUninstall(cfg, { notes: notes === true, models: models === true });
        brain.log('settings', `removing Bob (notes ${notes === true}, models ${models === true})`);
        brain.broadcast({ type: 'announce', text: 'Packing up. A small window finishes removing me once I have closed. It was a pleasure.' });
        send(res, 200, r);
        setTimeout(() => (globalThis.bobQuit ? globalThis.bobQuit() : process.exit(0)), 1500);
        return;
      } catch (e) { return send(res, 409, { error: e.message }); }
    }
    if (req.method === 'POST' && (p === '/api/update/start' || p === '/api/quit')) {
      if (!isLocal) return send(res, 403, { error: 'Only on the PC itself.' });
      if (p === '/api/quit') { brain.log('settings', 'closing for an update'); brain.broadcast({ type: 'announce', text: 'Closing for a moment to switch to the new Bob. Back in a few seconds.' }); send(res, 200, { ok: true }); setTimeout(() => (globalThis.bobQuit ? globalThis.bobQuit() : process.exit(0)), 300); return; }
      try { const r = startUpdate(cfg); brain.log('settings', `update started: ${r.from.label} -> ${r.to?.label}`); return send(res, 200, r); }
      catch (e) { return send(res, 409, { error: e.message }); }
    }
    if (req.method === 'POST' && (p === '/api/queue/cancel' || p === '/api/queue/retry')) {
      const { id } = await body(req);
      const ok = p.endsWith('cancel') ? brain.cancelJob(String(id)) : brain.retryJob(String(id));
      return send(res, ok ? 200 : 404, { ok });
    }
    if (req.method === 'POST' && p === '/api/queue/move') {
      const { id, before } = await body(req);
      const ok = brain.moveJob(String(id), before ? String(before) : null);
      return send(res, ok ? 200 : 404, { ok });
    }
    if (req.method === 'POST' && p === '/api/queue/remove') {
      const { id } = await body(req);
      const ok = brain.removeJob(String(id));
      return send(res, ok ? 200 : 404, { ok });
    }
    if (req.method === 'POST' && p === '/api/queue/clear') return send(res, 200, { ok: brain.clearCompleted() });
    if (req.method === 'POST' && p === '/api/speak') {
      const { text } = await body(req);
      try { return send(res, 200, await say(cfg, String(text || '')), 'audio/wav'); }
      catch (e) { return send(res, 409, { error: e.message }); }
    }
    // Voice samples: listing looks at files only; a sample is made (or found) only when asked for.
    if (req.method === 'GET' && p === '/api/voice/samples') return send(res, 200, { voices: publicView(voiceList(cfg, shop)) });
    if (req.method === 'POST' && p === '/api/voice/sample') {
      const { engine, voice } = await body(req);
      try {
        const r = await sampleFor(cfg, shop, String(engine || ''), String(voice || ''));
        if (r.file) return send(res, 200, fs.readFileSync(r.file), TYPES[path.extname(r.file).toLowerCase()] || 'audio/wav');
        return send(res, 200, r);
      } catch (e) { return send(res, 409, { error: e.message }); }
    }
    if (req.method === 'POST' && p === '/api/voice/samples/clear') { if (!isLocal) return send(res, 403, { error: 'Only on the PC itself.' }); clearSamples(cfg); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && p === '/api/stop') return send(res, 200, { stopped: brain.stop() });

    // Housekeeping, topics, past chats and search. Reading works from the phone too; changes only on the PC.
    const hk = brain.housekeeper;
    if (req.method === 'GET' && p === '/api/chats') return send(res, 200, { chats: hk.chats(), tidied: hk.summaries().slice(0, 200) });
    if (req.method === 'GET' && p === '/api/topics') return send(res, 200, hk.topics.list());
    if (req.method === 'GET' && p === '/api/topics/messages') {
      const t = hk.topics.get(String(url.searchParams.get('id') || ''));
      if (!t) return send(res, 404, { error: 'No such topic.' });
      return send(res, 200, hk.topicMessages(t));
    }
    if (req.method === 'GET' && p === '/api/topics/forget-preview') {
      try { return send(res, 200, hk.forgetPreview(String(url.searchParams.get('id') || ''), { mode: url.searchParams.get('mode') === 'all' ? 'all' : 'note' })); }
      catch (e) { return send(res, 404, { error: e.message }); }
    }
    if (req.method === 'GET' && p === '/api/search') return send(res, 200, search(cfg, { topics: hk.topics, summaries: hk.summaries() }, String(url.searchParams.get('q') || '').slice(0, 200)));
    if (req.method === 'GET' && p === '/api/hk') { const st = hk.state(); return send(res, 200, { settings: hkSettings(cfg), kinds: KINDS, units: Object.keys(UNITS), items: hk.publicItems(), lastRun: st.lastRun, lastScan: st.lastScan, working: hk.working }); }
    if (req.method === 'POST' && (p.startsWith('/api/hk/') || p.startsWith('/api/topics/') || p === '/api/pin')) {
      if (!isLocal) return send(res, 403, { error: 'Tidying and topics can only be changed on the PC itself.' });
      const b = await body(req);
      try {
        if (p === '/api/hk/scan') return send(res, 200, { items: hk.publicItems(hk.scan()) });
        if (p === '/api/hk/tidy') { if (!hk.items.length) hk.scan(); return send(res, 200, { results: await hk.tidy([].concat(b.choices || []).slice(0, 2000)), items: hk.publicItems() }); }
        if (p === '/api/hk/run') {
          if (hk.working) return send(res, 200, { busy: true });
          hk.tick({ force: true }).then((did) => broadcast({ type: 'tidy-done', ...did })).catch((e) => broadcast({ type: 'tidy-done', error: e.message }));
          return send(res, 200, { started: true });
        }
        if (p === '/api/pin') return send(res, 200, { pins: hk.pin(String(b.kind), String(b.id), b.pinned === true) });
        const id = String(b.id || '');
        if (p === '/api/topics/rename') return send(res, 200, hk.topics.rename(id, b.name, b.project));
        if (p === '/api/topics/edit') return send(res, 200, hk.topics.edit(id, { note: b.note, summary: b.summary, open: b.open }));
        if (p === '/api/topics/pin') return send(res, 200, hk.topics.pin(id, b.pinned === true));
        if (p === '/api/topics/fade') return send(res, 200, hk.topics.fade(id, b.after && UNITS[b.after.unit] ? { n: Number(b.after.n), unit: b.after.unit } : null));
        if (p === '/api/topics/merge') { const into = hk.topics.merge(id, String(b.into || '')); brain.log('topics', `merged a topic into ${into}`); return send(res, 200, { id: into }); }
        if (p === '/api/topics/move') return send(res, 200, { ok: hk.topics.moveMessage(String(b.session || ''), String(b.msgId || ''), String(b.to || '')) });
        if (p === '/api/topics/forget') return send(res, 200, hk.forget(id, { mode: b.mode === 'all' ? 'all' : 'note', pictures: b.pictures === true }));
        if (p === '/api/topics/accept') return send(res, 200, hk.topics.change(id, (t) => { if (t.suggested) { t.note = t.suggested.note || t.note; t.summary = t.suggested.summary || t.summary; t.suggested = undefined; } }));
        return send(res, 404, { error: 'not found' });
      } catch (e) { return send(res, 409, { error: e.message }); }
    }

    // Files Bob mentions: a preview in the chat, plus Open / Show in folder / Copy (open and copy only on the PC itself).
    if (req.method === 'POST' && p === '/api/file/info') {
      const b = await body(req);
      return send(res, 200, [].concat(b.paths || []).slice(0, 20).map((x) => { const d = describeFile(cfg, x); return { mention: String(x).slice(0, 1000), ...d, path: isLocal ? d.path : undefined }; }));
    }
    if (req.method === 'GET' && p === '/api/file') {
      const d = describeFile(cfg, url.searchParams.get('path') || '');
      if (!d.ok || d.kind === 'folder' || (!isLocal && !d.path.startsWith(path.resolve(cfg.innDir) + path.sep))) return send(res, 404, { error: 'not found' });
      // A page or picture Bob wrote is shown, never run: no scripts, no reaching Bob's own pages.
      return serveFile(res, path.dirname(d.path), path.basename(d.path), { 'content-security-policy': 'sandbox; default-src \'none\'; img-src \'self\' data:; media-src \'self\'; style-src \'unsafe-inline\'' });
    }
    // The side panel: the start of a text file, and the list of everything Bob made.
    if (req.method === 'GET' && p === '/api/file/peek') {
      const d = describeFile(cfg, url.searchParams.get('path') || '');
      if (!d.ok || (!isLocal && !d.path.startsWith(path.resolve(cfg.innDir) + path.sep))) return send(res, 404, { error: 'not found' });
      const r = peekFile(cfg, d.path, url.searchParams.get('max'));
      return r.ok ? send(res, 200, r) : send(res, 404, { error: 'not found' });
    }
    // 1.5.41: a song's player: its title, style and lyrics (from the Made by Bob list) and the bars of its shape (wave.js).
    if (req.method === 'GET' && p === '/api/song') {
      const d = describeFile(cfg, url.searchParams.get('path') || '');
      if (!d.ok || d.kind !== 'audio' || (!isLocal && !d.path.startsWith(path.resolve(cfg.innDir) + path.sep) && !brain.made.has(d.path))) return send(res, 404, { error: 'not found' });
      const w = wavePeaks(d.path, url.searchParams.get('bars'));
      return send(res, 200, { ok: true, name: d.name, bytes: d.bytes, ...(brain.made.songInfo(d.path) || {}), seconds: w.seconds, peaks: w.peaks });
    }
    if (req.method === 'GET' && p === '/api/made') {
      const list = brain.made.list({ kind: url.searchParams.get('kind') || '', q: url.searchParams.get('q') || '', limit: Math.min(200, Number(url.searchParams.get('limit')) || 60) });
      const inn = path.resolve(cfg.innDir) + path.sep;
      return send(res, 200, isLocal ? list : list.filter((x) => x.path.startsWith(inn)).map((x) => ({ ...x, path: undefined })));
    }
    if (req.method === 'POST' && (p === '/api/open' || p === '/api/clipboard')) {
      if (!isLocal) return send(res, 403, { error: 'Only on the PC itself.' });
      const b = await body(req);
      if (p === '/api/clipboard') {
        if (!globalThis.bobShell?.copy) return send(res, 200, { ok: false });
        globalThis.bobShell.copy(String(b.text ?? '').slice(0, 2e6));
        return send(res, 200, { ok: true });
      }
      try { const r = openFile(cfg, String(b.path || ''), { reveal: b.reveal === true }); brain.log('open', `${b.reveal ? 'showed in folder' : 'opened'} ${path.basename(r.file)}`); return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 409, { error: e.message }); }
    }
    if (req.method === 'GET' && p.startsWith('/images/')) {
      const f = findOutput(cfg, decodeURIComponent(p.slice(8))); // 1.5.41: where Bob saves now, his own folder, or an older pick
      // Over the home network, a folder the user picked only gives out what Bob made there (it can hold their own files too).
      if (!isLocal && path.resolve(path.dirname(f)) !== path.resolve(cfg.defaultPainterDir) && !brain.made.has(f)) return send(res, 404, { error: 'not found' });
      return serveFile(res, path.dirname(f), path.basename(f));
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
server.listen(cfg.port, remoteOn ? (remote.bindAddress || '0.0.0.0') : cfg.host, () => {
  if (remoteOn) console.log(`Phone access is on for: ${[...remoteHosts].join(', ')}`);
  console.log(`Bob ${VERSION.label} is open for business at http://${cfg.host === '127.0.0.1' ? 'localhost' : cfg.host}:${cfg.port}`);
  console.log(`Inn folder: ${cfg.innDir}`);
  brain.log('start', `Bob started on port ${cfg.port}`);
});
// Browsers may send "localhost" to the IPv6 loopback (::1) first, so listen there too when Bob is local-only.
if (!remoteOn && cfg.host === '127.0.0.1') {
  const v6 = http.createServer(server.listeners('request')[0]);
  v6.on('error', () => {}); // no IPv6 on this PC: fine, 127.0.0.1 still works
  v6.listen(cfg.port, '::1');
}
// One bad request or background job must never take Bob down: log it and keep serving.
process.on('unhandledRejection', (e) => { console.error('Unhandled:', e); try { brain.log('error', String(e && e.stack || e).slice(0, 500)); } catch {} });
process.on('uncaughtException', (e) => { console.error('Uncaught:', e); try { brain.log('error', String(e && e.stack || e).slice(0, 500)); } catch {} });


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
