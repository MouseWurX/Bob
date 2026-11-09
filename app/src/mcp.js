// The "Connected apps (MCP)" Hand: Bob talks to apps that have an MCP server, such as an Unreal Engine or Blender
// add-on, and uses the tools they offer. MCP (Model Context Protocol) is a common way for an app to offer tools to
// an AI helper: each tool has a name, a short description and the inputs it takes.
//
// Lightweight on purpose:
// - Nothing runs until the Hand is on, the app is switched on in Settings, and a job needs it.
// - Bob sees two small tools (mcp_tools, mcp_use), not every app's tools: an app can offer 50 of them, and their
//   descriptions would fill a small brain's prompt. mcp_tools lists them only when he asks.
// - A server Bob started stops again after IDLE_MS unused, when the Hand goes off, and on ✋ / Stop everything.
//
// Two ways to reach an app (both from the MCP spec):
// - a program Bob starts (stdio: one JSON message per line), e.g. "uvx blender-mcp";
// - an address (Streamable HTTP), e.g. http://127.0.0.1:8000/mcp. Only this computer's own addresses while
//   "Don't send anything out" is on.
//
// Every mcp_use call shows a card with the app, the tool and its exact inputs (unless "work without asking" is on),
// and the hard limits apply to the inputs: no secret files, nothing of Bob's own, read-only projects only for tools
// the app marks as read-only, and the command blocklist on any text (some tools run code inside the app).
import fs from 'node:fs';
import { writeJsonAtomic } from './util.js';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { isInside, insideAny, VERSION } from './config.js';
import { isSensitive } from './tools.js';
import { limitOn, readOnlyRoots, handOn, handOffWhy, handsSettings } from './hands-settings.js';
import { safeEnv, launchPlan, killTree, checkCommand, textProblem } from './hands-run.js';
import { exeName } from './platform.js';

const WIN = process.platform === 'win32';
export const IDLE_MS = 5 * 60_000; // a server Bob started stops after 5 minutes unused
const START_MS = 90_000; // first start can be slow (uvx fetches the server once)
const MAX_SERVERS = 20;
const MAX_RESULT = 8000;
export const PROTOCOL = '2025-06-18';

const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

// ---- The list of apps (inn\bob\mcp-servers.json, Bob's own settings folder) ----
const file = (cfg) => path.join(cfg.dataDir, 'mcp-servers.json');
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const plainName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

// Ready-made starting points for the two apps people ask about most. They only fill the form in; the user checks
// them against their add-on's own instructions and saves.
export const PRESETS = {
  blender: { name: 'Blender', cmd: 'uvx', args: ['blender-mcp'], note: 'Needs the Blender MCP add-on switched on in Blender (its panel: Connect), and uv (Bob can get it).', needsUv: true },
  unreal: { name: 'Unreal Engine', url: 'http://127.0.0.1:8000/mcp', note: 'Needs the editor open with its MCP plugin running. Use the address (or program) from your Unreal MCP plugin\'s own instructions; this one is a common default.' }
};

export function cleanServer(s = {}) {
  const name = plainName(s.name) || 'App';
  const url = typeof s.url === 'string' && /^https?:\/\/[^\s]+$/i.test(s.url.trim()) ? s.url.trim().slice(0, 300) : '';
  const out = {
    id: slug(s.id) || slug(name) || 'app',
    name,
    url,
    cmd: url ? '' : String(s.cmd || '').trim().slice(0, 400),
    args: url ? [] : [].concat(s.args || []).filter((a) => typeof a === 'string' && !a.includes('\0')).map((a) => a.slice(0, 1000)).slice(0, 50),
    cwd: !url && typeof s.cwd === 'string' && path.isAbsolute(s.cwd) ? s.cwd.slice(0, 400) : '',
    env: {},
    on: s.on === true,
    tools: Array.isArray(s.tools) ? s.tools.filter((t) => t && typeof t.name === 'string').slice(0, 300).map((t) => ({ name: t.name.slice(0, 120), what: String(t.what || '').slice(0, 240), readOnly: t.readOnly === true, risky: t.risky === true, code: t.code === true })) : [],
    checked: Number(s.checked) || 0,
    error: String(s.error || '').slice(0, 400)
  };
  if (!url && s.env && typeof s.env === 'object') for (const [k, v] of Object.entries(s.env).slice(0, 30)) if (ENV_KEY.test(k) && typeof v === 'string') out.env[k] = v.slice(0, 2000);
  return out;
}

export function loadServers(cfg) {
  try {
    const j = JSON.parse(fs.readFileSync(file(cfg), 'utf8'));
    return (Array.isArray(j?.servers) ? j.servers : []).map(cleanServer).slice(0, MAX_SERVERS);
  } catch { return []; }
}
function saveServers(cfg, list) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  writeJsonAtomic(file(cfg), { servers: list.slice(0, MAX_SERVERS) });
  return list;
}
const uniqueId = (list, id) => { let n = 2, out = id; while (list.some((s) => s.id === out)) out = `${id}-${n++}`; return out; };

// Adds an app (switched OFF: the user turns it on with its own switch).
export function addServer(cfg, s) {
  const list = loadServers(cfg);
  if (list.length >= MAX_SERVERS) throw new Error(`That's the most connected apps Bob keeps (${MAX_SERVERS}). Remove one first.`);
  const c = cleanServer({ ...s, on: false, tools: [], checked: 0, error: '' });
  if (!c.url && !c.cmd) throw new Error('Give either a program to start (like uvx) or an address (like http://127.0.0.1:8000/mcp).');
  if (s.url && !c.url) throw new Error('The address must start with http:// or https://.');
  c.id = uniqueId(list, c.id);
  list.push(c);
  saveServers(cfg, list);
  return c;
}
export function setServerOn(cfg, id, on) {
  const list = loadServers(cfg);
  const s = list.find((x) => x.id === id);
  if (!s) throw new Error('No connected app with that name.');
  s.on = on === true;
  if (!s.on) stopServer(id);
  return saveServers(cfg, list);
}
export function removeServer(cfg, id) {
  stopServer(id);
  return saveServers(cfg, loadServers(cfg).filter((x) => x.id !== id));
}
function remember(cfg, id, patch) {
  const list = loadServers(cfg);
  const s = list.find((x) => x.id === id);
  if (!s) return null;
  Object.assign(s, cleanServer({ ...s, ...patch }), { id: s.id, on: s.on });
  saveServers(cfg, list);
  return s;
}

// "Paste a setup from another app": the mcpServers JSON that Claude Desktop, Cline, Cursor, VS Code and most MCP
// add-on instructions use, or OpenCode's "mcp" block. Each one comes in switched off.
export function parseSetup(text) {
  let j;
  try { j = JSON.parse(String(text || '').trim()); } catch { throw new Error('That isn\'t JSON. Paste the whole block, from the first { to the last }.'); }
  const block = j?.mcpServers || j?.servers || j?.mcp || j?.['mcp.servers'] || j;
  if (!block || typeof block !== 'object' || Array.isArray(block)) throw new Error('No servers found in it. Look for a part called "mcpServers".');
  const out = [];
  for (const [name, v] of Object.entries(block)) {
    if (!v || typeof v !== 'object') continue;
    const url = v.url || v.serverUrl || v.httpUrl || (typeof v.uri === 'string' ? v.uri : '');
    let cmd = v.command, args = v.args || [];
    if (Array.isArray(cmd)) { args = [...cmd.slice(1), ...[].concat(args)]; cmd = cmd[0]; } // OpenCode: command: ["uvx", "blender-mcp"]
    if (!url && !cmd) continue;
    out.push({ name, url: url || '', cmd: url ? '' : cmd, args, cwd: v.cwd || '', env: v.env || v.environment || {} });
  }
  if (!out.length) throw new Error('No servers found in it. Each needs a "command" or a "url".');
  return out;
}
export function importSetup(cfg, text) {
  const added = [];
  for (const s of parseSetup(text)) added.push(addServer(cfg, s));
  return added;
}

// ---- Is it allowed? ----
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/i;
export function addressProblem(cfg, url) {
  let u;
  try { u = new URL(url); } catch { return 'That address isn\'t valid.'; }
  if (!/^https?:$/.test(u.protocol)) return 'The address must start with http:// or https://.';
  if (limitOn(cfg, 'sendOut') && !LOOPBACK.test(u.hostname)) return `${u.hostname} isn't on this replicant matrix, and "Don't send anything out" is on. Bob only talks to apps on this replicant matrix (localhost or 127.0.0.1) while it is.`;
  return '';
}
export function serverProblem(cfg, s) {
  if (s.url) return addressProblem(cfg, s.url);
  const c = checkCommand(cfg, { cmd: s.cmd, args: s.args, cwd: s.cwd || os.homedir() });
  return c.ok ? '' : c.why;
}

// Text in a tool's inputs that looks like a full path (C:\..., /home/..., ~/...).
const looksLikePath = (v) => typeof v === 'string' && v.length < 600 && (/^[a-zA-Z]:[\\/]/.test(v) || /^\/[^\s/]/.test(v) || /^~[\\/]/.test(v));
function strings(v, out = [], depth = 0) {
  if (depth > 8 || out.length > 500) return out;
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out, depth + 1);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out, depth + 1);
  return out;
}
// What's wrong with these inputs under the hard limits, or ''.
export function inputsProblem(cfg, inputs, tool = {}) {
  const all = strings(inputs);
  const own = [cfg.dataDir, cfg.settingsFile].filter(Boolean);
  for (const s of all) {
    if (!looksLikePath(s)) continue;
    const p = path.resolve(s.replace(/^~(?=[\\/])/, os.homedir()));
    if (isSensitive(cfg, p)) return 'it names a file with keys or passwords, which stays off-limits to Bob.';
    if (own.some((d) => isInside(d, p))) return 'it names Bob\'s own settings folder, which he can\'t change himself.';
    if (!tool.readOnly && insideAny(readOnlyRoots(cfg), p)) return `it names ${p}, which is read-only for Bob, and the app doesn't say this tool only reads.`;
  }
  // Some tools run code or commands inside the app (Blender's Python, an editor console): the same blocklist as Run.
  const why = textProblem(all.join('\n'), cfg);
  return why ? `its inputs would ${why}.` : '';
}

// ---- Finding the program (GUI apps on Mac and Linux often start with a short PATH) ----
function extraDirs() {
  const h = os.homedir();
  if (WIN) return [path.join(h, '.local', 'bin'), path.join(h, '.cargo', 'bin'), path.join(process.env.APPDATA || path.join(h, 'AppData', 'Roaming'), 'npm')];
  return [path.join(h, '.local', 'bin'), path.join(h, '.cargo', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
}
export function childPath(env = process.env) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const parts = String(env[key] || '').split(path.delimiter).filter(Boolean);
  for (const d of extraDirs()) if (!parts.includes(d)) parts.push(d);
  return { key, value: parts.join(path.delimiter) };
}
// Bob's own uv (Settings, Engines: "uv (for connected apps)", the same copy the audio tools use).
export const ownUv = (cfg, name = 'uvx') => (cfg?.agentDir ? path.join(cfg.agentDir, 'audio-workshop', exeName(name)) : '');
export function uvFound(cfg) {
  const own = ownUv(cfg);
  if (own && fs.existsSync(own)) return 'own';
  const p = findProgram('uvx');
  return p !== 'uvx' ? 'pc' : '';
}
export function findProgram(cmd, env = process.env, cfg = null) {
  if (!cmd || path.isAbsolute(cmd) || /[\\/]/.test(cmd)) return cmd;
  const found = findOnPath(cmd, env);
  if (found !== cmd) return found;
  if (/^uvx?$/i.test(cmd) && cfg) { const own = ownUv(cfg, cmd.toLowerCase()); if (own && fs.existsSync(own)) return own; }
  return cmd;
}
function findOnPath(cmd, env) {
  const exts = WIN ? (path.extname(cmd) ? [''] : String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((e) => e.toLowerCase())) : [''];
  for (const dir of childPath(env).value.split(path.delimiter)) {
    for (const e of exts) {
      const f = path.join(dir, cmd + e);
      try { if (fs.statSync(f).isFile()) return f; } catch {}
    }
  }
  return cmd;
}

// ---- Talking to one app ----
class Conn {
  constructor(server, { cfg, log = () => {}, version = '' } = {}) {
    this.s = server; this.cfg = cfg; this.log = log; this.version = version;
    this.nextId = 1; this.pending = new Map(); this.closed = false; this.err = ''; this.session = '';
  }

  async start() {
    if (this.s.url) this.http = true;
    else this.spawnIt();
    const init = await this.request('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'Bob', version: this.version || '1' } }, { timeoutMs: START_MS });
    this.info = init?.serverInfo || {};
    this.protocol = init?.protocolVersion || PROTOCOL;
    await this.notify('notifications/initialized');
    return this;
  }

  spawnIt() {
    const env = { ...safeEnv(), ...this.s.env };
    const p = childPath(env);
    for (const k of Object.keys(env)) if (k.toUpperCase() === 'PATH' && k !== p.key) delete env[k];
    env[p.key] = p.value;
    const plan = launchPlan(findProgram(this.s.cmd, env, this.cfg), this.s.args);
    const cwd = this.s.cwd || os.homedir();
    const child = spawn(plan.file, plan.args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: !WIN, shell: false, windowsVerbatimArguments: Boolean(plan.verbatim) });
    this.child = child;
    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      buf += d;
      if (buf.length > 20_000_000) { buf = ''; this.fail('The app sent a message too big to read.'); return; }
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this.onMessage(line); }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { this.err = (this.err + d).slice(-2000); });
    child.on('error', (e) => this.fail(e.code === 'ENOENT' ? `Couldn't find the program ${this.s.cmd}. Is it installed?` : e.message));
    child.on('exit', (code) => this.fail(`The app's MCP server stopped (exit code ${code})${this.err.trim() ? `: ${this.err.trim().split(/\r?\n/).slice(-3).join(' ')}` : ''}.`));
    child.stdin.on('error', () => {});
  }

  onMessage(line) {
    let m;
    try { m = JSON.parse(line); } catch { return; } // servers sometimes print logs on stdout
    for (const one of [].concat(m)) {
      if (!one || typeof one !== 'object') continue;
      if (one.method && one.id !== undefined) { // the server asks us something: only ping is answered
        this.write(one.method === 'ping' ? { jsonrpc: '2.0', id: one.id, result: {} } : { jsonrpc: '2.0', id: one.id, error: { code: -32601, message: 'Bob does not offer that.' } });
        continue;
      }
      if (one.id === undefined) continue; // notifications (logs, progress, list changed) are not needed
      const w = this.pending.get(one.id);
      if (!w) continue;
      this.pending.delete(one.id);
      if (one.error) w.reject(new Error(String(one.error.message || 'The app said no.').slice(0, 500)));
      else w.resolve(one.result);
    }
  }

  write(msg) { if (this.child && !this.closed) try { this.child.stdin.write(JSON.stringify(msg) + '\n'); } catch {} }

  fail(why) {
    if (this.closed) return;
    this.closed = true;
    this.why = why;
    for (const w of this.pending.values()) w.reject(new Error(why));
    this.pending.clear();
    this.onClose?.();
  }

  headers() {
    const h = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    if (this.session) h['mcp-session-id'] = this.session;
    if (this.protocol) h['mcp-protocol-version'] = this.protocol;
    return h;
  }

  async post(msg, signal) {
    const r = await fetch(this.s.url, { method: 'POST', headers: this.headers(), body: JSON.stringify(msg), signal });
    const sid = r.headers.get('mcp-session-id');
    if (sid) this.session = sid;
    if (r.status === 404 && this.session && msg.method !== 'initialize') throw new Error('The app forgot this connection (it restarted?). Try again.');
    if (!r.ok && r.status !== 202) throw new Error(`The app answered ${r.status}${r.status === 405 || r.status === 404 ? ' (is that the right address? Bob speaks the newer "Streamable HTTP" kind)' : ''}.`);
    return r;
  }

  async request(method, params, { timeoutMs = 60_000, signal } = {}) {
    if (this.closed) throw new Error(this.why || 'The connection is closed.');
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) };
    const t = AbortSignal.timeout(timeoutMs);
    const sig = signal ? AbortSignal.any([signal, t]) : t;
    if (this.http) {
      try {
        const r = await this.post(msg, sig);
        return await readHttpReply(r, id);
      } catch (e) {
        if (t.aborted) throw new Error(`The app didn't answer within ${Math.round(timeoutMs / 1000)} seconds.`);
        if (signal?.aborted) throw new Error('Stopped.');
        if (e.cause?.code === 'ECONNREFUSED' || /fetch failed/i.test(e.message)) throw new Error(`Nothing is answering at ${this.s.url}. Is the app open with its MCP plugin running?`);
        throw e;
      }
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => { this.pending.delete(id); reject(new Error(t.aborted ? `The app didn't answer within ${Math.round(timeoutMs / 1000)} seconds.` : 'Stopped.')); };
      sig.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, { resolve: (v) => { sig.removeEventListener('abort', onAbort); resolve(v); }, reject: (e) => { sig.removeEventListener('abort', onAbort); reject(e); } });
      this.write(msg);
    });
  }

  async notify(method, params) {
    const msg = { jsonrpc: '2.0', method, ...(params ? { params } : {}) };
    if (this.http) { try { await this.post(msg, AbortSignal.timeout(10_000)); } catch {} return; }
    this.write(msg);
  }

  close() {
    if (this.http && this.session && !this.closed) fetch(this.s.url, { method: 'DELETE', headers: this.headers(), signal: AbortSignal.timeout(3000) }).catch(() => {});
    if (this.child) { try { this.child.stdin.end(); } catch {} killTree(this.child); }
    this.fail('Closed.');
  }
}

// A Streamable HTTP reply: plain JSON, or a short event stream that carries it.
async function readHttpReply(r, id) {
  const type = r.headers.get('content-type') || '';
  const pick = (m) => {
    for (const one of [].concat(m)) {
      if (one && one.id === id) { if (one.error) throw new Error(String(one.error.message || 'The app said no.').slice(0, 500)); return { found: true, result: one.result }; }
    }
    return { found: false };
  };
  if (type.includes('text/event-stream')) {
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 20_000_000) throw new Error('The app sent a message too big to read.');
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(buf.indexOf('\n', i + 1) + 1);
          const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
          if (!data) continue;
          let m; try { m = JSON.parse(data); } catch { continue; }
          const got = pick(m);
          if (got.found) return got.result;
        }
      }
    } finally { try { reader.cancel(); } catch {} }
    throw new Error('The app closed the reply without an answer.');
  }
  const text = await r.text();
  if (!text.trim()) throw new Error('The app sent an empty reply.');
  const got = pick(JSON.parse(text));
  if (!got.found) throw new Error('The app\'s reply didn\'t match the question.');
  return got.result;
}

// ---- Running apps: started when needed, stopped when idle ----
const live = new Map(); // id -> { conn, ready, timer, untrack }
export const liveServers = () => [...live.keys()];
export function stopServer(id) {
  const x = live.get(id);
  if (!x) return false;
  live.delete(id);
  clearTimeout(x.timer);
  try { x.untrack?.(); } catch {}
  try { x.conn.close(); } catch {}
  return true;
}
export function stopAllServers() { let n = 0; for (const id of [...live.keys()]) if (stopServer(id)) n++; return n; }

function touch(id) {
  const x = live.get(id);
  if (!x) return;
  clearTimeout(x.timer);
  x.timer = setTimeout(() => stopServer(id), IDLE_MS);
  x.timer.unref?.();
}

export async function connect(cfg, server, { log = () => {}, track, version = '' } = {}) {
  const have = live.get(server.id);
  if (have && !have.conn.closed && have.key === keyOf(server)) { touch(server.id); await have.ready; return have.conn; }
  if (have) stopServer(server.id);
  const why = serverProblem(cfg, server);
  if (why) throw new Error(`Bob won't start ${server.name}: ${why}`);
  const conn = new Conn(server, { cfg, log, version });
  const entry = { conn, key: keyOf(server) };
  conn.onClose = () => { if (live.get(server.id) === entry) { clearTimeout(entry.timer); try { entry.untrack?.(); } catch {} live.delete(server.id); } };
  entry.untrack = track?.({ line: `connected app: ${server.name}`, stop: () => stopServer(server.id) });
  entry.ready = conn.start();
  live.set(server.id, entry);
  touch(server.id);
  log('hands', `connected app: ${server.name} ${server.url ? `at ${server.url}` : `started (${[server.cmd, ...server.args].join(' ')})`}`);
  try { await entry.ready; } catch (e) { stopServer(server.id); throw e; }
  return conn;
}
const keyOf = (s) => JSON.stringify([s.url, s.cmd, s.args, s.cwd, s.env]);

// Every tool the app offers (all pages), with what Bob keeps in the list for Settings.
export async function listTools(conn, { signal } = {}) {
  const out = [];
  let cursor;
  for (let page = 0; page < 10; page++) {
    const r = await conn.request('tools/list', cursor ? { cursor } : {}, { timeoutMs: 30_000, signal });
    out.push(...(Array.isArray(r?.tools) ? r.tools : []));
    cursor = r?.nextCursor;
    if (!cursor) break;
  }
  return out.filter((t) => t && typeof t.name === 'string');
}
// A tool that runs code or commands inside the app (Blender's execute_blender_code, an editor's Python console).
const RUNS_CODE = /\b(?:run|exec|execute|eval)\w*[_\s-]*(?:\w+[_\s-]+)?(?:code|python|script|command|console|snippet)s?\b|\b(?:python|code|script|console)[_\s-]*(?:run|exec|execute|eval)\w*\b/i;
export const runsCode = (t) => t.annotations?.readOnlyHint !== true && (RUNS_CODE.test(String(t.name).replace(/_/g, ' ')) || RUNS_CODE.test(String(t.description || '').slice(0, 200)));
const brief = (t) => ({ name: t.name, what: String(t.description || t.title || '').replace(/\s+/g, ' ').trim().slice(0, 240), readOnly: t.annotations?.readOnlyHint === true, risky: t.annotations?.destructiveHint === true && t.annotations?.readOnlyHint !== true, code: runsCode(t) });

// The inputs a tool takes, short: "name (text, needed), location (list of numbers)".
const TYPE = { string: 'text', number: 'number', integer: 'whole number', boolean: 'true/false', array: 'list', object: 'object' };
export function inputsLine(schema) {
  const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const need = new Set(Array.isArray(schema?.required) ? schema.required : []);
  const parts = Object.entries(props).slice(0, 25).map(([k, v]) => {
    let t = TYPE[[].concat(v?.type || '')[0]] || 'any';
    if (t === 'list' && v?.items?.type) t = `list of ${TYPE[v.items.type] || v.items.type}s`;
    if (Array.isArray(v?.enum)) t = `one of ${v.enum.slice(0, 8).map((e) => JSON.stringify(e)).join('/')}`;
    const d = String(v?.description || '').replace(/\s+/g, ' ').slice(0, 80);
    return `${k} (${t}${need.has(k) ? ', needed' : ''})${d ? `: ${d}` : ''}`;
  });
  return parts.length ? parts.join('; ') : 'none';
}

// What came back, as text for Bob. Pictures and sounds are saved to a file (shown in the chat).
export function resultText(cfg, server, tool, r, saved = []) {
  const lines = [];
  for (const c of Array.isArray(r?.content) ? r.content : []) {
    if (c?.type === 'text') lines.push(String(c.text || ''));
    else if ((c?.type === 'image' || c?.type === 'audio') && typeof c.data === 'string') {
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg' }[c.mimeType] || (c.type === 'image' ? 'png' : 'wav');
      try {
        const dir = path.join(cfg.innDir || cfg.dataDir, 'connected-apps');
        fs.mkdirSync(dir, { recursive: true });
        const f = path.join(dir, `${slug(server.name)}-${slug(tool)}-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`);
        fs.writeFileSync(f, Buffer.from(c.data, 'base64'));
        saved.push(f);
        lines.push(`[${c.type === 'image' ? 'Picture' : 'Sound'} saved: ${f}]`);
      } catch (e) { lines.push(`[A ${c.type} came back but couldn't be saved: ${e.message}]`); }
    } else if (c?.type === 'resource') lines.push(String(c.resource?.text ?? `[file: ${c.resource?.uri || '?'}]`));
    else if (c?.type === 'resource_link') lines.push(`[link: ${c.uri || ''}${c.name ? ` (${c.name})` : ''}]`);
  }
  if (!lines.length && r?.structuredContent) lines.push(JSON.stringify(r.structuredContent));
  let text = lines.join('\n').trim() || '(It finished and sent nothing back.)';
  if (text.length > MAX_RESULT) text = text.slice(0, MAX_RESULT) + `\n[...cut: ${text.length - MAX_RESULT} more characters]`;
  return r?.isError ? `Error: ${server.name} said: ${text}` : text;
}

// Finds an app by what Bob typed: its id, its name, or a word of it ("blender", "Unreal").
export function findServer(cfg, name) {
  const want = String(name || '').toLowerCase().trim();
  if (!want) return null;
  const list = loadServers(cfg);
  return list.find((s) => s.id === slug(want)) || list.find((s) => s.name.toLowerCase() === want)
    || list.find((s) => s.name.toLowerCase().includes(want) || want.includes(s.name.toLowerCase())) || null;
}

// ---- For the prompt and the toolbox ----
export const serversOn = (cfg) => loadServers(cfg).filter((s) => s.on);
export function mcpPrompt(cfg) {
  if (!handOn(cfg, 'mcp')) return '';
  const on = serversOn(cfg);
  if (!on.length) return ` Connected apps: none switched on yet; ${cfg.userName || 'the user'} adds and switches them on in Settings, Show advanced settings, Hands, under Connected apps.`;
  return ` Connected apps (MCP): ${on.map((s) => s.name).join(', ')}. To work in one, call mcp_tools with its name to see its tools and their inputs, then mcp_use with the exact tool name and inputs. Use these rather than clicking in that app with app_act.`;
}
const BASE_WORDS = 'mcp|connected apps?|unreal|ue5|ue4|editor|blueprints?|levels?|actors?|blender|meshe?s?|scenes?|viewport|materials?|modifiers?|objects?|3d|model(?:l)?ing|rig|sculpt\\w*|keyframes?';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function mcpWords(cfg) {
  const names = loadServers(cfg).filter((s) => s.on).map((s) => esc(s.name.toLowerCase())).filter(Boolean);
  return new RegExp(`\\b(${[BASE_WORDS, ...names].join('|')})\\b`, 'i');
}
export function mcpWhat(cfg) {
  const on = serversOn(cfg);
  return `use connected apps through MCP${on.length ? ` (${on.map((s) => s.name).join(', ')})` : ''}`;
}

// For Settings.
export function mcpView(cfg) {
  return { servers: loadServers(cfg).map((s) => ({ ...s, env: Object.keys(s.env), running: live.has(s.id), problem: serverProblem(cfg, s) })), presets: PRESETS, idleMin: IDLE_MS / 60_000, uv: uvFound(cfg) };
}

// The user's "Check" button: start it (or reach it), list its tools, keep the list. Stops it again afterwards
// unless Bob was already using it.
export async function checkServer(cfg, id, deps = {}) {
  const s = loadServers(cfg).find((x) => x.id === id);
  if (!s) throw new Error('No connected app with that name.');
  const was = live.has(id);
  try {
    const conn = await connect(cfg, s, deps);
    const tools = await listTools(conn);
    remember(cfg, id, { tools: tools.map(brief), checked: Date.now(), error: '' });
    return { ok: true, tools: tools.length, name: conn.info?.name || s.name };
  } catch (e) {
    remember(cfg, id, { checked: Date.now(), error: e.message });
    return { ok: false, why: e.message };
  } finally { if (!was) stopServer(id); }
}

// The card's first line, in plain words from the tool's description and inputs:
// "In Blender: add an object to the scene, with name "Cube" and location 0, 0, 1."
const CODE_KEY = /^(code|script|python|source|command|cmd|snippet|expression)$/i;
function plainValue(v) {
  if (Array.isArray(v)) return v.length <= 6 && v.every((x) => typeof x !== 'object') ? v.join(', ') : `${v.length} items`;
  if (v && typeof v === 'object') { const j = JSON.stringify(v); return j.length > 60 ? 'some settings' : j; }
  if (typeof v === 'string') return v.length > 60 ? `"${v.slice(0, 57)}…"` : `"${v}"`;
  return String(v);
}
export function plainCall(app, tool, inputs, why) {
  const first = String(tool.description || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '');
  const what = first ? first[0].toLowerCase() + first.slice(1) : `use ${tool.name}`;
  const parts = Object.entries(inputs || {}).filter(([k, v]) => !CODE_KEY.test(k) && v !== '' && v !== null && v !== undefined).slice(0, 5).map(([k, v]) => `${k.replace(/[_-]+/g, ' ')} ${plainValue(v)}`);
  const withs = parts.length ? `, with ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}` : '';
  return `In ${app}: ${what.slice(0, 200)}${withs}.${why ? ` (${String(why).slice(0, 200)})` : ''}`;
}
// The code a code-running tool would run, to show on the card as it is.
function codeIn(inputs) {
  const e = Object.entries(inputs || {}).find(([k, v]) => CODE_KEY.test(k) && typeof v === 'string');
  if (e) return e[1];
  return Object.values(inputs || {}).filter((v) => typeof v === 'string' && v.includes('\n')).sort((a, b) => b.length - a.length)[0] || '';
}

// ---- The tools Bob sees ----
export function mcpTools(brain, { track } = {}) {
  const cfg = brain.cfg;
  const log = (k, t) => brain.log?.(k, t);
  const deps = { log, track, version: VERSION?.label || '' };
  const off = () => { if (!handOn(cfg, 'mcp')) { stopAllServers(); throw new Error(handOffWhy(cfg, 'mcp')); } };
  const pickServer = (name) => {
    const s = findServer(cfg, name);
    const on = serversOn(cfg);
    if (!s) throw new Error(`There's no connected app called "${name || ''}". ${on.length ? `Switched on: ${on.map((x) => x.name).join(', ')}.` : 'None is switched on yet.'}`);
    if (!s.on) throw new Error(`${s.name} is switched off in Settings, Show advanced settings, Hands, Connected apps. ${cfg.userName || 'The user'} can switch it on there.`);
    return s;
  };
  // The app's full tool list, from the app itself (cached on the connection while it runs).
  const toolsOf = async (s, signal) => {
    const conn = await connect(cfg, s, deps);
    if (!conn.tools) { conn.tools = await listTools(conn, { signal }); remember(cfg, s.id, { tools: conn.tools.map(brief), checked: Date.now(), error: '' }); }
    return { conn, tools: conn.tools };
  };
  const parseInputs = (v) => {
    if (v === undefined || v === null || v === '') return {};
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { throw new Error('inputs must be an object, like {"name": "Cube"}.'); } }
    if (typeof v !== 'object' || Array.isArray(v)) throw new Error('inputs must be an object, like {"name": "Cube"}.');
    return v;
  };

  const t = {};
  t.mcp_tools = {
    schema: fn('mcp_tools', 'See the tools a connected app offers (Unreal Engine, Blender and so on, through MCP) and the inputs each one takes. Call it before mcp_use. Without app: lists the connected apps.', {
      app: str('The connected app, by name (optional).'),
      find: str('Optional: a few words to narrow the list, like "material" or "spawn".')
    }, []),
    async run(args, ctx) {
      off();
      if (!args.app) {
        const list = loadServers(cfg);
        if (!list.length) return 'No connected apps yet. The user adds them in Settings, Show advanced settings, Hands, under Connected apps.';
        return list.map((s) => `${s.name}: ${s.on ? 'on' : 'switched off'}${s.tools.length ? `, ${s.tools.length} tools` : ''}`).join('\n');
      }
      const s = pickServer(args.app);
      const { tools } = await toolsOf(s, ctx?.signal);
      const words = String(args.find || '').toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      const shown = words.length ? tools.filter((x) => words.some((w) => `${x.name} ${x.description || ''}`.toLowerCase().includes(w))) : tools;
      if (!shown.length) return `${s.name} has no tool matching "${args.find}". Its tools: ${tools.map((x) => x.name).join(', ')}.`;
      let out = `${s.name} tools${words.length ? ` matching "${args.find}"` : ''} (${shown.length} of ${tools.length}). Call mcp_use with app "${s.name}", the tool name and its inputs.\n`;
      for (const x of shown) {
        const b = brief(x);
        const line = `- ${x.name}${b.readOnly ? ' (only looks)' : b.code ? ' (runs code)' : ''}: ${b.what || '(no description)'}\n  inputs: ${inputsLine(x.inputSchema)}\n`;
        if (out.length + line.length > 7000) { out += `[...${shown.length - shown.indexOf(x)} more: ask again with find to narrow it]`; break; }
        out += line;
      }
      return out.trim();
    },
    summary: ({ app }) => (app ? `Looking at ${app}'s tools` : 'Listing connected apps')
  };

  t.mcp_use = {
    schema: fn('mcp_use', 'Use one tool of a connected app (from mcp_tools): the app, the exact tool name, and its inputs as an object. {{USER}} sees it on a card first.', {
      app: str('The connected app, by name.'),
      tool: str('The exact tool name, as mcp_tools listed it.'),
      inputs: { type: 'object', description: 'The tool\'s inputs, like {"name": "Cube"}. Leave out if it takes none.' },
      why: str('One short line: what this is for.')
    }, ['app', 'tool']),
    // "Allow the rest of this job" covers the same tool in the same app, except tools that run code or delete things:
    // those ask every time (clarity review, 2026-11-04).
    approvalGroup: (a) => {
      const s = findServer(cfg, a.app);
      const tl = s?.tools.find((x) => x.name.toLowerCase() === String(a.tool || '').toLowerCase());
      if (!tl || tl.code || tl.risky) return null;
      return `mcp:${String(a.app || '').toLowerCase()}:${String(a.tool || '').toLowerCase()}`;
    },
    async check(args, ctx) {
      off();
      const s = pickServer(args.app);
      const inputs = parseInputs(args.inputs);
      const { tools } = await toolsOf(s, ctx?.signal);
      const tool = tools.find((x) => x.name === args.tool) || tools.find((x) => x.name.toLowerCase() === String(args.tool || '').toLowerCase());
      if (!tool) throw new Error(`${s.name} has no tool called "${args.tool}". Call mcp_tools to see them. Some of its tools: ${tools.slice(0, 30).map((x) => x.name).join(', ')}.`);
      const need = (Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : []).filter((k) => !(k in inputs));
      if (need.length) throw new Error(`${tool.name} needs: ${need.join(', ')}. Its inputs: ${inputsLine(tool.inputSchema)}.`);
      const b = brief(tool);
      const why = inputsProblem(cfg, inputs, b);
      if (why) throw new Error(`That's refused: ${why}`);
      if (ctx) ctx.mcpTool = tool.name;
      const shown = JSON.stringify(inputs, null, 1);
      const always = b.code || b.risky;
      const code = b.code ? codeIn(inputs) : '';
      const note = b.readOnly ? ' The app says this only looks and changes nothing.' : b.code ? ' It runs code inside the app, so it can change anything there.' : b.risky ? ' The app says this can delete or overwrite things.' : '';
      return {
        text: `${plainCall(s.name, tool, inputs, args.why)}${note}`,
        command: `${tool.name} ${shown.length > 4000 ? shown.slice(0, 4000) + '\n[...]' : shown}`,
        where: `In ${s.name} (connected app)`,
        button: 'Allow',
        mcp: { app: s.name, tool: tool.name, ...(code ? { code: code.slice(0, 8000) } : {}), ...(always ? { always: true } : {}) }
      };
    },
    async run(args, ctx) {
      off();
      const s = pickServer(args.app);
      const inputs = parseInputs(args.inputs);
      const { conn, tools } = await toolsOf(s, ctx?.signal);
      const name = ctx?.mcpTool || tools.find((x) => x.name.toLowerCase() === String(args.tool || '').toLowerCase())?.name || args.tool;
      if (ctx) ctx.mcpTool = null;
      const why = inputsProblem(cfg, inputs, brief(tools.find((x) => x.name === name) || {}));
      if (why) throw new Error(`That's refused: ${why}`); // checked again right before it runs
      log('hands', `connected app ${s.name}: ${name} ${JSON.stringify(inputs).slice(0, 300)}`);
      const timeoutMs = handsSettings(cfg).timeoutMin * 60_000;
      const r = await conn.request('tools/call', { name, arguments: inputs }, { timeoutMs, signal: ctx?.signal });
      touch(s.id);
      const saved = [];
      const text = resultText(cfg, s, name, r, saved);
      if (ctx && saved.length) ctx.made = saved;
      return text;
    },
    summary: ({ app, tool }) => `${app || 'app'}: ${tool || '?'}`.slice(0, 100)
  };
  return t;
}
