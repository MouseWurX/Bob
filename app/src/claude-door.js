// "Hands for Claude" (Settings, Other apps; off unless you turn it on).
// Bob as an MCP server: the Claude app, Claude Code (or another MCP app you make a key for) can ask Bob to use his
// tools. Claude does the thinking; Bob's Hands, painters, document readers, notes and memory do the work, here.
// src/mcp.js is the other direction (Bob using other apps' tools).
//
// How it stays safe:
// - Off by default. Only this computer's own address (127.0.0.1 / localhost) gets in, never the home network,
//   Tailscale or a phone, even while "Bob-Net access" is on. A web page can't use it either:
//   anything carrying a browser's Origin header is refused.
// - Each app has its own key. Bob keeps only a fingerprint (SHA-256) of it; Remove takes the key away at once.
// - Every call shows Bob's own OK card in his window (the app's name on it), even with "Work without asking"
//   on. The hard limits, Hands switches, ✋ Hands and quarantine all apply as if Bob had asked himself.
// - Only the tool groups ticked here are offered, and only tools that are switched on in Bob right now.
// - Nothing costs money (cloud helpers and rented brains are never offered) and nothing reaches other MCP apps
//   (no loops through Connected apps).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './util.js';
import { VERSION } from './config.js';
import { ttsReady, say } from './tts.js';

export const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER_NAME = 'bob';
const MAX_BODY = 1_000_000;
const MAX_APPS = 10;
const MAX_INFLIGHT = 4; // per app
const SESSION_IDLE_MS = 30 * 60_000; // "Allow the rest of this job" for an app ends after 30 minutes quiet
const MAX_RESULT = 30_000;
const MAX_IMAGE_BYTES = 3_000_000;

// The groups you tick. Only tools Bob has switched on right now are offered (brain.usable), so a Hand that is off
// stays off for Claude too.
export const DOOR_GROUPS = {
  hands: { label: 'Bob\'s Hands', what: 'Files, programs and scripts, apps, his own browser, and Office files. Each Hand must also be on under Hands.', tools: ['file_hands', 'sort_files', 'undo_files', 'run_command', 'run_recipe', 'open_app', 'app_look', 'app_act', 'browser_open', 'browser_read', 'browser_act', 'office_make', 'office_edit', 'convert_file', 'write_file', 'edit_file'] },
  media: { label: 'Pictures, music, clips and voice', what: 'Paint a picture, make a clip, a song or a sound, or say something out loud in Bob\'s voice.', tools: ['make_image', 'make_video', 'make_music', 'make_sound', 'say_aloud'] },
  docs: { label: 'Read and search documents', what: 'Find words in your files and read documents, in the folders Bob may read.', tools: ['find_in_documents', 'read_file', 'list_folder', 'office_read', 'search_files', 'inspect_file'] },
  notes: { label: 'Notes and memory', what: 'Quick notes, the notice board, and what Bob remembers.', tools: ['take_note', 'notice_board', 'remember', 'recall_memory'] }
};
// Never offered, whatever is ticked: money, other Bobs, other MCP apps, Bob's own code and settings.
export const NEVER = new Set(['ask_cloud', 'hire_brain', 'ask_specialist', 'mcp_tools', 'mcp_use', 'make_tool', 'use_my_tool', 'work_on_repo', 'edit_my_message', 'schedule_job', 'change_schedule', 'osint_lookup']);

// ---- Settings and keys (inn\bob\claude-door.json; keys only as fingerprints) ----
const file = (cfg) => path.join(cfg.dataDir, 'claude-door.json');
const hash = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
const plainName = (s) => String(s || '').replace(/[\u0000-\u001f<>"]/g, '').trim().slice(0, 40);

export function cleanDoor(j = {}) {
  const groups = {};
  for (const g of Object.keys(DOOR_GROUPS)) groups[g] = j.groups?.[g] !== false; // all ticked to start with; the door itself is off
  const apps = (Array.isArray(j.apps) ? j.apps : []).filter((a) => a && /^[a-f0-9]{64}$/.test(a.hash)).slice(0, MAX_APPS).map((a) => ({
    id: String(a.id || '').replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'app',
    name: plainName(a.name) || 'App',
    kind: ['desktop', 'code', 'other'].includes(a.kind) ? a.kind : 'other',
    hash: a.hash,
    made: Number(a.made) || 0,
    used: Number(a.used) || 0
  }));
  return { on: j.on === true, groups, apps };
}
export function loadDoor(cfg) { try { return cleanDoor(JSON.parse(fs.readFileSync(file(cfg), 'utf8'))); } catch { return cleanDoor({}); } }
function saveDoor(cfg, d) { writeJsonAtomic(file(cfg), cleanDoor(d), 2); }
export const doorOn = (cfg) => loadDoor(cfg).on;

export function newKey() { return 'bob_' + crypto.randomBytes(32).toString('base64url'); }

// A new key for an app. An app with the same id gets a new key and the old one stops working.
export function makeKey(cfg, { id, name, kind = 'other' }) {
  const d = loadDoor(cfg);
  const key = newKey();
  const appId = String(id || plainName(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app').slice(0, 40);
  d.apps = d.apps.filter((a) => a.id !== appId);
  if (d.apps.length >= MAX_APPS) throw new Error(`At most ${MAX_APPS} apps. Remove one first.`);
  d.apps.push({ id: appId, name: plainName(name) || 'App', kind, hash: hash(key), made: Date.now(), used: 0 });
  saveDoor(cfg, d);
  return { key, id: appId };
}
export function removeKey(cfg, id) {
  const d = loadDoor(cfg);
  const before = d.apps.length;
  d.apps = d.apps.filter((a) => a.id !== id);
  saveDoor(cfg, d);
  for (const [sid, s] of sessions) if (s.app === id) { for (const c of s.calls.values()) c.abort(); sessions.delete(sid); }
  return before !== d.apps.length;
}
export function appForKey(cfg, key) {
  if (!key || typeof key !== 'string' || key.length > 200) return null;
  const h = Buffer.from(hash(key), 'hex');
  return loadDoor(cfg).apps.find((a) => crypto.timingSafeEqual(Buffer.from(a.hash, 'hex'), h)) || null;
}
export function setDoor(cfg, patch = {}) {
  const d = loadDoor(cfg);
  if ('on' in patch) d.on = patch.on === true;
  if (patch.groups && typeof patch.groups === 'object') for (const g of Object.keys(DOOR_GROUPS)) if (g in patch.groups) d.groups[g] = patch.groups[g] === true;
  saveDoor(cfg, d);
  if (!d.on) stopAll();
  return d;
}

// ---- Which tools Claude sees ----
// Bob's own two: say_aloud and recall_memory (his memory banks, read-only). Schemas in OpenAI shape like the rest.
const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
export const OWN = {
  say_aloud: {
    schema: fn('say_aloud', 'Say something out loud on this computer in Bob\'s own voice (the voice picked in Bob). The sound is also saved and shown in Bob\'s window.', { text: { type: 'string', description: 'What to say, up to 2000 characters.' } }),
    needs: (cfg) => { try { return ttsReady(cfg); } catch { return false; } },
    summary: ({ text }) => `say out loud: "${String(text || '').slice(0, 80)}"`
  },
  recall_memory: {
    schema: fn('recall_memory', 'Look in what Bob remembers about his owner and earlier chats (facts, topics, summaries) for anything about these words. Read-only.', { about: { type: 'string', description: 'What to look for.' } }),
    needs: () => true,
    summary: ({ about }) => `look in my memory for "${String(about || '').slice(0, 80)}"`
  }
};

export function offeredNames(brain, d = loadDoor(brain.cfg)) {
  const out = [];
  for (const [g, grp] of Object.entries(DOOR_GROUPS)) {
    if (!d.groups[g]) continue;
    for (const n of grp.tools) {
      if (NEVER.has(n)) continue;
      if (OWN[n]) { if (OWN[n].needs(brain.cfg)) out.push(n); continue; }
      if (brain.usable?.(n)) out.push(n);
    }
  }
  return [...new Set(out)];
}

export function toolList(brain, d) {
  const names = offeredNames(brain, d);
  const theirs = brain.toolSchemas ? brain.toolSchemas(names.filter((n) => !OWN[n])) : [];
  const own = names.filter((n) => OWN[n]).map((n) => OWN[n].schema);
  return [...theirs, ...own].map((s) => ({ name: s.function.name, description: String(s.function.description || '').slice(0, 1500), inputSchema: s.function.parameters || { type: 'object', properties: {} } }));
}

// ---- Calls in flight and the "rest of this job" groups, per MCP session ----
const sessions = new Map(); // id -> { app, appName, allowAll: Set, last, calls: Map(requestId -> AbortController) }
export function sessionFor(id, app) {
  for (const [sid, s] of sessions) if (Date.now() - s.last > SESSION_IDLE_MS && !s.calls.size) sessions.delete(sid);
  let s = id ? sessions.get(id) : null;
  if (s && s.app !== app.id) s = null; // another app's session id is never borrowed
  if (!s) {
    const key = id && /^[A-Za-z0-9-]{8,80}$/.test(id) ? id : `${app.id}-default`;
    s = sessions.get(key);
    if (!s || s.app !== app.id) { s = { id: key, app: app.id, appName: app.name, allowAll: new Set(), last: Date.now(), calls: new Map() }; sessions.set(key, s); }
  }
  s.last = Date.now();
  return s;
}
export function stopAll() { let n = 0; for (const s of sessions.values()) for (const c of s.calls.values()) { c.abort(); n++; } return n; }
export function inFlight() { let n = 0; for (const s of sessions.values()) n += s.calls.size; return n; }

// ---- One tool call ----
// Every call gets a card. A tool with its own card (files, commands, apps, writing files) uses that card with the
// app's name in front; any other tool gets a plain one from here. Pictures made come back to the app as pictures.
export async function callTool(brain, app, session, name, args, { signal, log = () => {} } = {}) {
  const cfg = brain.cfg;
  const d = loadDoor(cfg);
  if (!d.on) return errorResult('Bob\'s door for other apps is switched off in Bob (Settings, Other apps).');
  if (!offeredNames(brain, d).includes(name)) return errorResult(`Bob doesn't offer "${String(name).slice(0, 60)}" right now. It may be switched off in Bob, or its group isn't ticked under Hands for Claude.`);
  args = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const images = [];
  const emit = (ev) => {
    if (ev?.type === 'image' && ev.file) images.push(ev.file);
    return brain.broadcast?.({ ...ev, via: app.name });
  };
  const ctx = { emit, signal, brain, cfg, allowAll: session.allowAll, pics: [], picNote: '', msgs: [], turnText: '', job: null, sessionId: null, wantsEdit: false, editFrom: null, wantType: null, saves: [], savedAs: [], alwaysAsk: true, via: app.name, door: true };
  log('door', `${app.name} asked for ${name}`);
  let text;
  const tool = brain.tools?.[name];
  const own = OWN[name];
  const summary = (() => { try { return own ? own.summary(args) : tool?.summary ? tool.summary(args) : name; } catch { return name; } })();
  // Tools without a card of their own: Bob's plain card, named after the app.
  if (own || !tool?.check) {
    const group = `door:${app.id}:${name}`;
    if (!session.allowAll.has(group)) {
      const answer = await brain.approve(`${app.name} (through Bob): ${summary}`, emit, signal, group, { hand: true });
      if (!answer) { log('door', `${app.name}: ${name} declined`); return errorResult('The owner said no on Bob\'s card. Do not try again; ask them what they would like instead.'); }
      if (answer === 'all') session.allowAll.add(group);
    } else emit({ type: 'allowed-earlier', text: `${app.name} (through Bob): ${summary}` });
    if (own) text = await runOwn(brain, name, args, ctx);
    else text = (await brain.runTool(name, args, ctx))?.text;
  } else {
    // Its own card, with the app's name in front (doorNeed in brain.runToolNow).
    text = (await brain.runTool(name, args, ctx))?.text;
  }
  text = String(text ?? '');
  const isError = /^Error:/.test(text) || /^The user said no/.test(text);
  const content = [{ type: 'text', text: text.length > MAX_RESULT ? text.slice(0, MAX_RESULT) + '\n[...cut]' : text || '(done)' }];
  for (const f of images.slice(0, 4)) {
    try {
      const st = fs.statSync(f);
      const ext = path.extname(f).toLowerCase();
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext];
      if (mime && st.size <= MAX_IMAGE_BYTES) content.push({ type: 'image', data: fs.readFileSync(f).toString('base64'), mimeType: mime });
    } catch {}
  }
  return { content, isError };
}
const errorResult = (text) => ({ content: [{ type: 'text', text }], isError: true });

async function runOwn(brain, name, args, ctx) {
  try {
    if (name === 'recall_memory') {
      const about = String(args.about || '').slice(0, 500);
      if (!about.trim()) return 'Error: say what to look for.';
      const found = await brain.recall?.(null, about);
      return found ? String(found).slice(0, MAX_RESULT) : 'Nothing in Bob\'s memory about that.';
    }
    if (name === 'say_aloud') {
      const text = String(args.text || '').slice(0, 2000);
      const wav = await say(brain.cfg, text, { signal: ctx.signal });
      const dir = brain.cfg.painterDir || path.join(os.homedir(), 'Bob');
      fs.mkdirSync(dir, { recursive: true });
      const name = `said-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.wav`;
      const out = path.join(dir, name);
      fs.writeFileSync(out, wav);
      try { brain.made?.add?.(out, { tool: 'say_aloud', chat: '' }); } catch {}
      ctx.emit({ type: 'audio', url: `/images/${encodeURIComponent(name)}`, file: out, song: { title: 'Said out loud', style: text.slice(0, 200), sound: 'sfx' } });
      return `Said it out loud in Bob's voice. Saved as ${out}.`;
    }
  } catch (e) { if (ctx.signal?.aborted) return 'Error: stopped.'; return `Error: ${e.message}`; }
  return 'Error: unknown tool.';
}

// ---- The MCP conversation (JSON-RPC 2.0 over Streamable HTTP, answered as plain JSON or, for a long call that
// asked for progress, as a short event stream with a progress note every 15 s so the app doesn't give up) ----
const INSTRUCTIONS = 'These tools are Bob\'s: a local AI helper on the owner\'s own computer. Each call shows a card in Bob\'s window and waits for the owner to press Allow (up to 10 minutes), so a call can take a while; a "said no" answer means do not try again. Bob\'s hard limits apply (no secret files, folders the owner allowed only, some commands always refused). Results, pictures and files stay on this computer.';

function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }

export async function handleRpc(brain, app, session, msg, { signal, log } = {}) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request');
  const { id, method, params = {} } = msg;
  const isNote = id === undefined || id === null;
  if (method === 'notifications/cancelled') { const c = session.calls.get(String(params.requestId)); c?.abort(); return null; }
  if (isNote) return null; // notifications/initialized and friends need no answer
  if (method === 'initialize') {
    const want = String(params.protocolVersion || '');
    return { jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: SERVER_NAME, title: 'Bob', version: VERSION }, instructions: INSTRUCTIONS } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: toolList(brain) } };
  if (method === 'tools/call') {
    if (session.calls.size >= MAX_INFLIGHT) return { jsonrpc: '2.0', id, result: errorResult(`Bob is already waiting on ${MAX_INFLIGHT} of this app's calls. Wait for those first.`) };
    const ac = new AbortController();
    const stop = () => ac.abort();
    signal?.addEventListener('abort', stop, { once: true });
    session.calls.set(String(id), ac);
    try { return { jsonrpc: '2.0', id, result: await callTool(brain, app, session, String(params.name || ''), params.arguments, { signal: ac.signal, log }) }; }
    catch (e) { return { jsonrpc: '2.0', id, result: errorResult(ac.signal.aborted ? 'Stopped before it finished (the app went away, or someone pressed ✋ Hands in Bob).' : `Error: ${e.message}`) }; }
    finally { session.calls.delete(String(id)); signal?.removeEventListener?.('abort', stop); }
  }
  if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
  if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };
  return rpcError(id, -32601, `Bob doesn't know ${String(method).slice(0, 60)}`);
}

const LOOPBACK = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/;
const json = (res, code, obj, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };

// The /mcp door. Called by server.js for that path only, before any of Bob's own page checks.
export async function doorRoute({ req, res, brain, isLocal }) {
  const cfg = brain.cfg;
  if (!isLocal || !LOOPBACK.test(String(req.socket?.remoteAddress || ''))) return json(res, 403, { error: 'Only apps on this computer can use Bob\'s door.' });
  if (req.headers.origin) return json(res, 403, { error: 'Not from a web page.' }); // a browser always sends Origin
  const d = loadDoor(cfg);
  if (!d.on) return json(res, 403, { error: 'Bob\'s door for other apps is off. Turn on "Hands for Claude" in Bob (Settings, Other apps).' });
  const key = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const app = appForKey(cfg, key);
  if (!app) return json(res, 401, { error: 'Bob doesn\'t know this key. Connect the app again from Bob\'s Settings.' }, { 'www-authenticate': 'Bearer' });
  const sid = String(req.headers['mcp-session-id'] || '');
  if (req.method === 'DELETE') { const s = sessions.get(sid); if (s && s.app === app.id) { for (const c of s.calls.values()) c.abort(); sessions.delete(sid); } return json(res, 200, {}); }
  if (req.method === 'GET') return json(res, 405, { error: 'POST only' }, { allow: 'POST, DELETE' });
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' }, { allow: 'POST, DELETE' });
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > MAX_BODY) return json(res, 413, { error: 'Too big' }); }
  let msg;
  try { msg = JSON.parse(raw); } catch { return json(res, 400, rpcError(null, -32700, 'Parse error')); }
  const list = Array.isArray(msg) ? msg.slice(0, 20) : [msg];
  const init = list.some((m) => m?.method === 'initialize');
  const session = sessionFor(init ? crypto.randomUUID() : sid, app);
  touch(cfg, app.id);
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  const log = (k, t) => brain.log?.(k, t);
  const head = { 'mcp-session-id': session.id };
  const progress = list.find((m) => m?.method === 'tools/call' && m.params?._meta?.progressToken !== undefined)?.params._meta.progressToken;
  const stream = progress !== undefined && /text\/event-stream/.test(String(req.headers.accept || ''));
  let timer = null;
  if (stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', ...head });
    let n = 0;
    timer = setInterval(() => { n++; res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: progress, progress: n, message: 'Waiting for the owner on Bob\'s card, or still working' } })}\n\n`); }, 15_000);
  }
  try {
    const answers = (await Promise.all(list.map((m) => handleRpc(brain, app, session, m, { signal: ac.signal, log })))).filter(Boolean);
    if (stream) { for (const a of answers) res.write(`event: message\ndata: ${JSON.stringify(a)}\n\n`); res.end(); return; }
    if (!answers.length) { res.writeHead(202, head); return res.end(); }
    return json(res, 200, Array.isArray(msg) ? answers : answers[0], head);
  } finally { clearInterval(timer); }
}
let touched = 0;
function touch(cfg, id) {
  if (Date.now() - touched < 60_000) return; // the "last used" line needn't be exact; no write on every call
  touched = Date.now();
  try { const d = loadDoor(cfg); const a = d.apps.find((x) => x.id === id); if (a) { a.used = Date.now(); saveDoor(cfg, d); } } catch {}
}

// ---- Connecting the Claude app and Claude Code for you ----
// Where each keeps its list of MCP servers. env/home/platform/exists/list are passed in so tests never read the real computer.
export const BRIDGE = fileURLToPath(new URL('./claude-door-bridge.cjs', import.meta.url));

export function claudeFiles({ platform = process.platform, env = process.env, home = os.homedir(), exists = fs.existsSync, list = (d) => { try { return fs.readdirSync(d); } catch { return []; } } } = {}) {
  const P = platform === 'win32' ? path.win32 : path.posix;
  let desktop;
  if (platform === 'win32') {
    const roaming = env.APPDATA || P.join(home, 'AppData', 'Roaming');
    const local = env.LOCALAPPDATA || P.join(home, 'AppData', 'Local');
    // The Microsoft Store version of the Claude app keeps its files in its own package folder.
    const pkg = list(P.join(local, 'Packages')).find((n) => /^Claude_/i.test(n));
    const store = pkg ? P.join(local, 'Packages', pkg, 'LocalCache', 'Roaming', 'Claude') : '';
    desktop = store && exists(store) ? store : P.join(roaming, 'Claude');
  } else if (platform === 'darwin') desktop = P.join(home, 'Library', 'Application Support', 'Claude');
  else desktop = P.join(env.XDG_CONFIG_HOME || P.join(home, '.config'), 'Claude');
  const codeDir = env.CLAUDE_CONFIG_DIR || home;
  return {
    desktop: { file: P.join(desktop, 'claude_desktop_config.json'), found: exists(desktop), name: 'the Claude app' },
    code: { file: P.join(codeDir, '.claude.json'), found: exists(P.join(codeDir, '.claude.json')) || exists(P.join(home, '.claude')), name: 'Claude Code' }
  };
}

// What Bob writes under "mcpServers" -> "bob". The Claude app starts a tiny helper (Bob's own program run as Node,
// so nothing new is installed) that passes messages to Bob's door; Claude Code talks to the door directly.
export function entryFor(kind, { key, port, execPath = process.execPath, bridge = BRIDGE }) {
  const url = `http://127.0.0.1:${port}/mcp`;
  if (kind === 'code') return { type: 'http', url, headers: { Authorization: `Bearer ${key}` } };
  return { command: execPath, args: [bridge], env: { ELECTRON_RUN_AS_NODE: '1', BOB_MCP_URL: url, BOB_MCP_KEY: key } };
}
const mask = (v) => JSON.parse(JSON.stringify(v).replace(/bob_[A-Za-z0-9_-]{20,}/g, 'bob_•••• (a new key)'));

function readJson(f) {
  if (!fs.existsSync(f)) return { data: {}, existed: false };
  const raw = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
  if (!raw.trim()) return { data: {}, existed: true };
  const data = JSON.parse(raw); // throws: the caller says the file isn't readable and changes nothing
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a settings file');
  return { data, existed: true };
}

// What Connect would change, shown before anything is written.
export function planConnect(cfg, kind, opts = {}) {
  const where = (opts.files || claudeFiles(opts))[kind];
  if (!where) throw new Error('Unknown app.');
  let current;
  try { current = readJson(where.file); } catch (e) { return { kind, file: where.file, found: where.found, error: `${where.file} isn't a settings file Bob can read (${e.message}), so Bob won't touch it.` }; }
  const before = current.data.mcpServers?.[SERVER_NAME] || null;
  const after = entryFor(kind, { key: 'bob_' + 'x'.repeat(43), port: cfg.port, ...opts });
  return { kind, file: where.file, found: where.found, existed: current.existed, before: before ? mask(before) : null, after: mask(after), others: Object.keys(current.data.mcpServers || {}).filter((k) => k !== SERVER_NAME) };
}

// Backs the file up, then adds (or replaces) only "mcpServers" -> "bob". Everything else in the file stays as it was.
export function connect(cfg, kind, opts = {}) {
  const where = (opts.files || claudeFiles(opts))[kind];
  if (!where) throw new Error('Unknown app.');
  const { data, existed } = readJson(where.file);
  const backup = existed ? `${where.file}.bob-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}` : '';
  if (backup) fs.copyFileSync(where.file, backup);
  const { key } = makeKey(cfg, { id: kind === 'code' ? 'claude-code' : 'claude-app', name: kind === 'code' ? 'Claude Code' : 'Claude app', kind: kind === 'code' ? 'code' : 'desktop' });
  data.mcpServers = data.mcpServers && typeof data.mcpServers === 'object' ? data.mcpServers : {};
  data.mcpServers[SERVER_NAME] = entryFor(kind, { key, port: cfg.port, ...opts });
  writeJsonAtomic(where.file, data, 2);
  return { file: where.file, backup };
}

export function disconnect(cfg, kind, opts = {}) {
  const where = (opts.files || claudeFiles(opts))[kind];
  if (!where) throw new Error('Unknown app.');
  removeKey(cfg, kind === 'code' ? 'claude-code' : 'claude-app');
  let data, existed;
  try { ({ data, existed } = readJson(where.file)); } catch { return { file: where.file, backup: '' }; }
  if (!existed || !data.mcpServers?.[SERVER_NAME]) return { file: where.file, backup: '' };
  const backup = `${where.file}.bob-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  fs.copyFileSync(where.file, backup);
  delete data.mcpServers[SERVER_NAME];
  writeJsonAtomic(where.file, data, 2);
  return { file: where.file, backup };
}

// Is "bob" in that app's list, and does it carry the key Bob knows?
export function connectedState(cfg, kind, opts = {}) {
  const where = (opts.files || claudeFiles(opts))[kind];
  let e = null;
  try { e = readJson(where.file).data.mcpServers?.[SERVER_NAME] || null; } catch {}
  if (!e) return { connected: false, found: where.found, file: where.file };
  const key = kind === 'code' ? String(e.headers?.Authorization || '').replace(/^Bearer\s+/i, '') : String(e.env?.BOB_MCP_KEY || '');
  const app = appForKey(cfg, key);
  const port = String(e.url || e.env?.BOB_MCP_URL || '').match(/:(\d+)\/mcp$/)?.[1];
  const stale = !app || String(port) !== String(cfg.port) || (kind !== 'code' && (e.command !== (opts.execPath || process.execPath) || e.args?.[0] !== (opts.bridge || BRIDGE)));
  return { connected: true, stale, found: where.found, file: where.file };
}

// What Settings shows.
export function doorView(cfg, brain, opts = {}) {
  const d = loadDoor(cfg);
  const offered = brain ? offeredNames(brain, d) : [];
  return {
    on: d.on,
    groups: Object.entries(DOOR_GROUPS).map(([id, g]) => ({ id, label: g.label, what: g.what, on: d.groups[id], tools: g.tools.filter((t) => offered.includes(t)).length })),
    apps: d.apps.map(({ id, name, kind, made, used }) => ({ id, name, kind, made, used })),
    claude: { desktop: connectedState(cfg, 'desktop', opts), code: connectedState(cfg, 'code', opts) },
    url: `http://127.0.0.1:${cfg.port}/mcp`,
    platform: process.platform,
    waiting: inFlight()
  };
}

// /api/claude-door (Bob's own Settings page; server.js has already checked it comes from Bob's window here).
export async function doorSettingsRoute({ req, p, isLocal, brain, cfg, body, send, res }) {
  if (!isLocal) { send(res, 403, { error: 'Only on this replicant matrix.' }); return true; }
  try {
    if (req.method === 'GET') { send(res, 200, doorView(cfg, brain)); return true; }
    const b = await body(req);
    if ('on' in b || b.groups) { setDoor(cfg, b); brain.log?.('settings', `Hands for Claude: ${'on' in b ? (b.on === true ? 'on' : 'off') : 'groups changed'}`); }
    if (b.plan) { send(res, 200, { ...doorView(cfg, brain), plan: planConnect(cfg, b.plan === 'code' ? 'code' : 'desktop') }); return true; }
    if (b.connect) { const r = connect(cfg, b.connect === 'code' ? 'code' : 'desktop'); brain.log?.('settings', `connected ${b.connect === 'code' ? 'Claude Code' : 'the Claude app'} to Bob (backup ${r.backup || 'none: new file'})`); send(res, 200, { ...doorView(cfg, brain), done: r }); return true; }
    if (b.disconnect) { const r = disconnect(cfg, b.disconnect === 'code' ? 'code' : 'desktop'); brain.log?.('settings', `took Bob out of ${b.disconnect === 'code' ? 'Claude Code' : 'the Claude app'}`); send(res, 200, { ...doorView(cfg, brain), done: r }); return true; }
    if (b.newKey) {
      const name = plainName(b.newKey);
      if (!name) throw new Error('Give the app a name first.');
      const { key, id } = makeKey(cfg, { name, kind: 'other' });
      brain.log?.('settings', `made a key for ${name}`);
      send(res, 200, { ...doorView(cfg, brain), newKey: { id, name, key, setup: { mcpServers: { [SERVER_NAME]: entryFor('code', { key, port: cfg.port }) } } } });
      return true;
    }
    if (b.removeKey) { removeKey(cfg, String(b.removeKey)); brain.log?.('settings', `removed the key for ${b.removeKey}`); }
    send(res, 200, doorView(cfg, brain));
  } catch (e) { send(res, 400, { error: e.message }); }
  return true;
}
