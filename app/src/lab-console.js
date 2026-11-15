// 15 Nov 2026 The Forge console (Lab > Forge). Everything the Forge and the Lab run shows here, in one window with three
// panels, any of them on either side: the Server (a terminal: the brain loaded here or a rented card, every request and
// reply, and what scripts print), the Chat (talk to the loaded brain), and Set up (its dials, and Lab jobs to run).
// Between a tool and the server sits the Lab's relay, so every request sent and every reply returned is on the record,
// and "Hold each request" lets the owner read, fix or drop a request before it goes.
// Rules: running anything needs "Let the Lab run commands here" (off by default) and this computer itself. The command
// line runs scripts from the model-lab folder only, as a list of words, never through a shell. It never rents: a rental
// starts only from the purchase card, and stopping one names its pod (a bare --kill would delete every Forge card).
// Keys and tokens never reach a script that isn't the Forge, and never show: every line is scrubbed.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { scrub, forgeDir, FORGE_KEY, forgePlansDir, alive } from './lab-forge.js';
import { labDir, readJson, writeJson } from './lab-measure.js';
import { startServer, TOOLS as PRACTICE_TOOLS } from './lab-test.js';
import { labEngineDirs, LAB_ENGINES } from './engines.js';
import { gaming } from './sessions.js';
import { nodeCmd } from './selftools.js';
import { saveSettings } from './config.js';

export const CHANNELS = ['server', 'traffic', 'model', 'tool'];
const MAX_ENTRIES = 6000, MAX_TEXT = 16000, MAX_LINE = 1000, MAX_BUTTONS = 24;

// ---- the command line: words, never a shell ----
// "a b" and 'a b' keep their spaces; a backslash is an ordinary letter (Windows paths), so nothing else is special.
export function parseLine(text) {
  const s = String(text ?? '');
  if (s.length > MAX_LINE) throw new Error(`That line is too long (${MAX_LINE} letters at most).`);
  if (/[\0\r\n]/.test(s)) throw new Error('One line at a time.');
  const out = []; let cur = '', q = '', had = false;
  for (const c of s) {
    if (q) { if (c === q) q = ''; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; had = true; continue; }
    if (/\s/.test(c)) { if (cur || had) out.push(cur); cur = ''; had = false; continue; }
    cur += c;
  }
  if (q) throw new Error('A quote is left open.');
  if (cur || had) out.push(cur);
  return out;
}

// Which readout a line belongs in. `kind`: where it came from (server: a brain server's own log; forge: the Forge's
// timeline; tool: a script's output). The Forge's timeline puts the rented card's own lines two spaces in.
const SERVER_RE = /(\bpod\b|\brent(ed|ing)?\b|\bdoor\b|upload|download|\bdeleting\b|\bdeleted\b|network volume|data cent(re|er)|\bplaces\b|\bproxy\b|\/health\b|llama-server|listening|load_tensors|llama_model_load|ggml_|\bCUDA\b|\bVulkan\b|\bMetal\b|offload|^\s*srv\b|^\s*slot\b|^\s*main: |cap reached|\$\d+(\.\d+)?\/h|\bssh\b|\bcontainer\b)/i;
const MODEL_RE = /(\bloss\b|\bepoch\b|\bstep \d|\bsteps? \d+\s*\/\s*\d+|\bheal|\bteacher\b|perplexity|\bppl\b|\blessons?\b|\banswer|\bscore|\bgrad|\blr[=:]|tokens?\/s|\bt\/s\b|\beval\b|benchmark)/i;
export function channelOf(line, kind = 'tool') {
  const t = String(line || '');
  if (kind === 'server') return 'server';
  if (kind === 'forge' && /^ {2}/.test(t)) return SERVER_RE.test(t) ? 'server' : 'model';
  if (SERVER_RE.test(t)) return 'server';
  if (MODEL_RE.test(t)) return 'model';
  return 'tool';
}

// A script's environment: no key, token, secret or password, ever. The Forge alone gets the rental key, for --status
// and --kill <podId>. LAB_URL points the model-lab scripts at the relay (they then start no server of their own).
export function cleanEnv(env = process.env, add = {}) {
  const out = {};
  for (const [k, v] of Object.entries(env || {})) if (!/(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE)/i.test(k)) out[k] = v;
  return { ...out, ...add };
}
const RENTS_RE = /RUNPOD_API_KEY|api\.runpod\.io|rest\.runpod\.io/;
const POD_RE = /^[a-z0-9]{6,32}$/i;

// What a typed command runs, checked. Returns { exe, args, cwd, label, forge, ch } or throws with the reason in words.
// `url` is the relay's address, for {url} in a command. `exists` and `readSrc` are for tests.
export function checkCommand(words, { dir, url = '', platform = process.platform, node = process.execPath, exists = fs.existsSync, readSrc = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  if (!words.length) throw new Error('Type a command. "help" lists them.');
  if (!dir) throw new Error('Bob can\'t find the model-lab folder, so there are no scripts to run.');
  const [verb, ...rest] = words;
  const sub = (a) => { if (!a.includes('{url}')) return a; if (!url) throw new Error('{url} is the server loaded here, and none is. Load one on the server side first ("load <brain>").'); return a.split('{url}').join(url); };
  const inside = (p) => { const f = path.resolve(dir, p); return f === dir || f.startsWith(dir + path.sep) ? f : ''; };
  const script = (p, exts) => {
    if (!p) throw new Error('Name the script, like "node tool-pick.mjs --help".');
    const f = inside(p);
    if (!f) throw new Error('Only scripts in the model-lab folder run here.');
    if (!exts.includes(path.extname(f).toLowerCase())) throw new Error(`That isn't a ${exts.join(' or ')} script.`);
    if (path.basename(f).toLowerCase() === 'forge.mjs') throw new Error('Run the Forge as "forge --status", "forge --places" or "forge --kill <podId>". It never rents from here: a rental starts only from its purchase card.');
    if (!exists(f)) throw new Error(`${p} isn't in the model-lab folder.`);
    let src = ''; try { src = readSrc(f); } catch {}
    if (RENTS_RE.test(src)) throw new Error(`${path.basename(f)} can rent a card, so it doesn't run from the command line. Rentals start only from a purchase card.`);
    return f;
  };
  if (verb === 'node') {
    const f = script(rest[0], ['.mjs', '.js', '.cjs']);
    return { exe: node, args: [f, ...rest.slice(1).map(sub)], cwd: dir, label: ['node', ...rest].join(' '), forge: false, ch: '' };
  }
  if (verb === 'python' || verb === 'python3' || verb === 'py') {
    const f = script(rest[0], ['.py']);
    return { exe: platform === 'win32' ? 'python' : 'python3', args: [f, ...rest.slice(1).map(sub)], cwd: dir, label: ['python', ...rest].join(' '), forge: false, ch: '' };
  }
  if (verb === 'forge') {
    const f = path.join(dir, 'forge', 'forge.mjs');
    if (!exists(f)) throw new Error('The Forge isn\'t in this model-lab folder.');
    const [flag, arg, ...more] = rest;
    if (flag === '--status' && !arg) return { exe: node, args: [f, '--status'], cwd: path.dirname(f), label: 'forge --status', forge: true, ch: 'server' };
    if (flag === '--places' && !more.length) return { exe: node, args: [f, '--places', ...(arg ? [arg.replace(/[^\w,.-]/g, '')] : [])], cwd: path.dirname(f), label: `forge --places${arg ? ` ${arg}` : ''}`, forge: true, ch: 'server' };
    if (flag === '--kill') {
      if (!arg) throw new Error('Name the pod: "forge --kill <podId>". A bare --kill would delete every Forge card.');
      if (!POD_RE.test(arg) || more.length) throw new Error('That isn\'t a pod id. "forge --status" lists them.');
      return { exe: node, args: [f, '--kill', arg], cwd: path.dirname(f), label: `forge --kill ${arg}`, forge: true, ch: 'server' };
    }
    throw new Error('From here the Forge only lists cards (--status), looks for free ones (--places) or deletes one by name (--kill <podId>). A run starts from its purchase card.');
  }
  throw new Error(`"${verb}" isn't a command here. Use node, python or forge, or "help".`);
}

// Ending a command and everything it started: taskkill /T on Windows, the process group elsewhere.
export function killTree(pid, { platform = process.platform, spawnFn = spawn, kill = process.kill.bind(process) } = {}) {
  if (!(pid > 0)) return false; // never 0: that would mean every process in the group
  if (platform === 'win32') { try { spawnFn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {} return true; }
  try { kill(-pid, 'SIGTERM'); } catch { try { kill(pid, 'SIGTERM'); } catch {} }
  const t = setTimeout(() => { try { kill(-pid, 'SIGKILL'); } catch {} }, 3000); t.unref?.();
  return true;
}

// Header values that are keys never show; they still pass through to the server.
export const hideHeaders = (h = {}) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, /auth|token|key|cookie|secret/i.test(k) ? '[hidden]' : String(v)]));
const pretty = (s) => { try { return JSON.stringify(JSON.parse(s), null, 1); } catch { return String(s || ''); } };
const cut = (s, n = MAX_TEXT) => (s.length > n ? `${s.slice(0, n)}\n… ${Math.round((s.length - n) / 1024)} KB more in the traffic log` : s);
// Paths shown to another device (the phone) are only their last part.
// 1.5.236: a Windows drive path keeps going past spaces ("C:\\Program Files\\…") up to its last \\ or /, so no inner folder shows.
export const hidePaths = (t) => String(t)
  .replace(/[A-Za-z]:\\(?:[^"'<>|\r\n\\/]*[\\/])*([^\s"'<>|\\/]*)/g, '…/$1')
  .replace(/\/(?:[^\s"'<>|]+\/)+([^\s"'<>|\\/]*)/g, '…/$1');

export const HELP = {
  server: ['Server side. Commands:',
    '  load <brain> [--ctx 8192] [--unload]   load a brain here (--unload: unload Bob\'s brain from the card first)',
    '  unload                                 stop the brain loaded here',
    '  target <https link> | target off       send the relay to a server somewhere else, like a rented card\'s brain',
    '  health | props | slots | models        ask the server, through the relay',
    '  get <path>   post <path> <json>        any request, through the relay',
    '  hold on | hold off                     hold each request from a tool, to read, fix or drop it first',
    '  pods                                   list the Forge\'s rented cards (forge --status)',
    '  kill <podId>                           delete that one rented card (forge --kill <podId>)',
    '  watch | watch <number> | watch off     follow another log from the model-lab out folder',
    '  node <script.mjs> [words…]             a model-lab script; {url} is the server loaded here (through the relay)',
    '  python <script.py> [words…]            the same, for Python',
    '  forge --status | --places | --kill <podId>',
    '  stop                                   stop the running command and everything it started (never a rental)',
    '  status | clear | help',
    'While a command runs, what you type goes to it, as if typed in its window. Untick "to the command" to talk to the server.']
};

// Set up: how the Chat asks the brain. Every number has its range; anything else is put back to its default.
export const SETUP = {
  temperature: [0.7, 0, 2], top_p: [0.95, 0, 1], top_k: [40, 0, 200], min_p: [0.05, 0, 1], repeat_penalty: [1, 1, 2],
  max_tokens: [2048, 16, 32768], seed: [-1, -1, 2147483647], ctx: [8192, 512, 262144]
};
const SETUP_TICKS = { think: false, showThink: true, stream: true, toolReplies: true, cpuOk: true };
const SETUP_TOOLS = ['none', 'practice', 'bob'];
export function cleanSetup(x = {}, base = {}) {
  const out = {};
  for (const [k, [d, lo, hi]] of Object.entries(SETUP)) { const v = Number(x[k] ?? base[k] ?? d); out[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, ['top_k', 'max_tokens', 'seed', 'ctx'].includes(k) ? Math.round(v) : Math.round(v * 100) / 100)) : d; }
  for (const [k, d] of Object.entries(SETUP_TICKS)) out[k] = typeof x[k] === 'boolean' ? x[k] : typeof base[k] === 'boolean' ? base[k] : d;
  const t = x.tools ?? base.tools; out.tools = SETUP_TOOLS.includes(t) ? t : 'none';
  out.system = String(x.system ?? base.system ?? '').slice(0, 8000);
  return out;
}
// The chat request body from Set up and the chat so far.
export function chatBody(setup, messages, tools = []) {
  const s = cleanSetup(setup);
  return { messages: [...(s.system ? [{ role: 'system', content: s.system }] : []), ...messages], stream: s.stream, max_tokens: s.max_tokens, temperature: s.temperature, top_p: s.top_p, top_k: s.top_k, min_p: s.min_p, repeat_penalty: s.repeat_penalty, ...(s.seed >= 0 ? { seed: s.seed } : {}), ...(tools.length ? { tools } : {}), chat_template_kwargs: { enable_thinking: s.think } };
}

// One console per Lab. lab: the Lab (cfg, tools(), brains(), preflight(), forgeKeys(), forgeLive()...).
export class LabConsole {
  constructor({ lab, spawnFn = spawn, now = Date.now, platform = process.platform, startServerFn = startServer, fetchFn = (...a) => globalThis.fetch(...a), killFn } = {}) {
    Object.assign(this, { lab, spawnFn, now, platform, startServerFn, fetchFn });
    this.killFn = killFn || ((pid) => killTree(pid, { platform, spawnFn }));
    this.entries = []; this.seq = 0; this.reqSeq = 0;
    this.server = null; this.loading = null; this.target = ''; this.relay = null;
    this.job = null; this.reply = null; this.hold = false; this.pending = new Map();
    this.chat = { messages: [] }; this.talk = []; this.talkRev = 0; this.toJob = true;
    this.setup = cleanSetup(readJson(path.join(this.dir(), 'setup.json'), {}));
    this.files = new Map(); this.watch = ''; this.history = { server: [], chat: [] };
    this.diskBuf = []; this.diskTimer = null;
  }
  get cfg() { return this.lab.cfg; }
  dir() { return path.join(labDir(this.cfg), 'console'); }
  allowed() { return this.cfg.labConsole === true; }

  // ---- the record ----
  // An entry: { seq, ch, text, nl (ends its line), kind (cmd|note|error|sent|back|think|you) }.
  push(ch, text, { nl = true, kind = '' } = {}) {
    const t = scrub(String(text ?? '')).slice(0, MAX_TEXT);
    if (!t && !nl) return;
    const e = { seq: ++this.seq, ch, text: t, nl, kind, at: this.now() };
    this.entries.push(e);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    this.disk(`${ch}${kind ? `/${kind}` : ''}\t${t}${nl ? '\n' : ''}`);
    return e;
  }
  // The day's record on disk, written a second at a time (a reply streams in many small pieces).
  disk(s) {
    this.diskBuf.push(s);
    if (this.diskTimer) return;
    this.diskTimer = setTimeout(() => this.flush(), 1000); this.diskTimer.unref?.();
  }
  flush() {
    clearTimeout(this.diskTimer); this.diskTimer = null;
    if (!this.diskBuf.length) return;
    const text = this.diskBuf.join(''); this.diskBuf = [];
    try { fs.mkdirSync(this.dir(), { recursive: true }); fs.appendFileSync(path.join(this.dir(), `console-${new Date(this.now()).toISOString().slice(0, 10)}.log`), text); } catch {}
  }
  trafficLog(rec) { try { fs.mkdirSync(this.dir(), { recursive: true }); fs.appendFileSync(path.join(this.dir(), `traffic-${new Date(this.now()).toISOString().slice(0, 10)}.jsonl`), JSON.stringify({ at: new Date(this.now()).toISOString(), ...rec, body: scrub(rec.body || '') }) + '\n'); } catch {} }
  // Text from a process, split into lines; a part line (a question waiting for an answer) shows after half a second.
  feeder(kind, ch = '') {
    let part = '', timer = null;
    const out = (line, nl) => this.push(ch || channelOf(line, kind), line, { nl });
    const flushPart = () => { timer = null; if (part) { out(part, false); part = ''; } };
    return {
      data: (d) => {
        const s = part + String(d).replace(/\r\n/g, '\n').replace(/\r/g, '\n'); const lines = s.split('\n'); part = lines.pop();
        for (const l of lines) out(l, true);
        clearTimeout(timer); timer = part ? setTimeout(flushPart, 500) : null; timer?.unref?.();
      },
      end: () => { clearTimeout(timer); if (part) out(part, true); part = ''; }
    };
  }

  // ---- logs written by other parts of the Lab and by the Forge: followed, so nothing runs out of sight ----
  sources() {
    const lab = this.lab, out = [], add = (file, label, kind) => { if (file && !out.some((x) => x.file === file)) out.push({ file, label, kind }); };
    let live = null; try { live = lab.forgeLive?.(); } catch {}
    const rec = readJson(lab.forgeLiveFile?.() || '', null);
    if (rec?.log && live?.running) add(rec.log, `Forge run ${rec.plan}`, 'forge');
    const dir = forgeDir(this.cfg);
    if (dir && !live?.running) { // a Forge run started anywhere else: its own timeline log, while it's being written
      try {
        const fdir = path.join(dir, 'out', 'forge');
        const f = fs.readdirSync(fdir).filter((x) => /^forge-[\d-T]+\.log$/.test(x)).sort().pop();
        const st = f ? fs.statSync(path.join(fdir, f)) : null, born = st ? st.birthtimeMs || st.mtimeMs : 0;
        const ours = rec?.at && born >= rec.at - 60e3 && born <= rec.at + 15 * 60e3; // the Lab's own run, already shown from its log
        if (st && !ours && this.now() - st.mtimeMs < 15 * 60e3) add(path.join(fdir, f), `Forge run ${f.slice(6, 16)}`, 'forge');
      } catch {}
    }
    for (const [f, label] of [[lab.stepRunFile?.(), 'Lab step'], [lab.protocolFile?.(), 'Protocol step']]) { const j = f ? readJson(f, null) : null; if (j?.state === 'running' && j.log) add(j.log, `${label} ${j.name || j.step || j.tool || ''}`.trim(), 'tool'); }
    if (this.watch) add(this.watch, `Watching ${path.basename(this.watch)}`, 'tool');
    return out;
  }
  follow() {
    for (const s of this.sources()) {
      let st; try { st = fs.statSync(s.file); } catch { continue; }
      let f = this.files.get(s.file);
      if (!f) { f = { at: Math.max(0, st.size - 8192), feed: this.feeder(s.kind) }; this.files.set(s.file, f); this.push('tool', `— following ${s.label} —`, { kind: 'note' }); }
      if (st.size < f.at) f.at = 0; // the file started again
      if (st.size === f.at) continue;
      const n = Math.min(st.size - f.at, 256 * 1024), buf = Buffer.alloc(n);
      try { const fd = fs.openSync(s.file, 'r'); fs.readSync(fd, buf, 0, n, f.at); fs.closeSync(fd); } catch { continue; }
      f.at += n; f.feed.data(buf.toString('utf8'));
    }
  }
  // Logs under model-lab/out written in the last half hour, newest first, for "watch".
  activeLogs() {
    const dir = forgeDir(this.cfg); if (!dir) return [];
    const out = [], walk = (d, depth) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of ents) { const f = path.join(d, e.name); if (e.isDirectory() && depth > 0) walk(f, depth - 1); else if (e.isFile() && /\.(log|txt)$/i.test(e.name)) { try { const m = fs.statSync(f).mtimeMs; if (this.now() - m < 30 * 60e3) out.push({ file: f, m }); } catch {} } } };
    walk(path.join(dir, 'out'), 3);
    return out.sort((a, b) => b.m - a.m).slice(0, 20);
  }

  // ---- the page ----
  view({ since = 0, remote = false, talk = -1 } = {}) {
    this.follow();
    const door = this.door();
    const all = this.entries.filter((e) => e.seq > since);
    const lines = (all.length > 3000 ? all.slice(-3000) : all).map(({ at: _a, ...e }) => (remote ? { ...e, text: hidePaths(e.text) } : e));
    let live = null; try { live = this.lab.forgeLive?.(); } catch {}
    return {
      allowed: this.allowed(), local: !remote, next: this.seq, first: this.entries[0]?.seq || 0, lines,
      server: this.server ? { state: 'up', brain: this.server.brain, where: this.server.where, ctx: this.server.ctx, engine: this.server.engine || '' } : this.loading ? { state: 'loading', brain: this.loading.brain } : { state: 'off' },
      target: this.target ? (remote ? 'a server elsewhere' : this.target) : this.server ? 'the brain loaded here' : door ? `${door.name} on the rented card` : '',
      relay: this.relay && !remote ? this.relay.url : '',
      job: this.job ? { label: remote ? hidePaths(this.job.label) : this.job.label, at: this.job.at } : null,
      replying: Boolean(this.reply), hold: this.hold, toJob: this.toJob,
      labJobs: this.labJobs(),
      pending: remote ? [] : [...this.pending.values()].map(({ id, method, url, body }) => ({ id, method, url, body })),
      rental: live?.running || live?.podLeft ? { plan: live.plan, hours: live.hours, dollars: live.dollars, running: Boolean(live.running), left: Boolean(live.podLeft), door: door ? door.name : '' } : null,
      setup: this.setup, talkRev: this.talkRev, ...(talk !== this.talkRev ? { talk: remote ? this.talk.map((t) => ({ ...t, text: hidePaths(t.text) })) : this.talk } : {}),
      waiting: this.waitingCalls().map((c) => c.id),
      buttons: this.buttons(), brains: remote ? [] : (this.lab.brains?.() || []).map((b) => ({ id: b.id, name: b.name })),
      history: remote ? { server: [], chat: [] } : this.history
    };
  }
  // Lab jobs running anywhere in the Lab, for STOP.
  labJobs() {
    const out = [];
    for (const [f, label] of [[this.lab.stepRunFile?.(), 'Lab step'], [this.lab.protocolFile?.(), 'Protocol step']]) { try { const j = f ? readJson(f, null) : null; if (j?.state === 'running') out.push(`${label} ${j.name || j.step || j.tool || ''}`.trim()); } catch {} }
    if (this.lab.job) out.push('Lab job');
    return out;
  }
  allow(on) { if (this.lab.saveSetting) this.lab.saveSetting({ labConsole: on === true }); else saveSettings(this.cfg, { labConsole: on === true }); this.cfg.labConsole = on === true; if (!on) { this.stop(); this.stopReply(); } return { allowed: this.allowed() }; }
  clear() { this.entries = []; return { cleared: true }; }
  saveSetup(x = {}) { this.setup = cleanSetup(x, this.setup); try { writeJson(path.join(this.dir(), 'setup.json'), this.setup); } catch {} return { setup: this.setup }; }

  // ---- the chat: what the Chat panel draws, one turn at a time ----
  // A turn: { n, who: you | brain | tool | note | error, text, think, calls: [{ id, name, args, answer }], to (a tool's request), live }.
  say(who, text = '', more = {}) { const t = { n: (this.talk.at(-1)?.n || 0) + 1, who, text: String(text), think: '', calls: [], to: '', live: false, ...more }; this.talk.push(t); if (this.talk.length > 300) this.talk.shift(); this.talkRev++; return t; }
  newChat() { this.stopReply(); this.chat.messages = []; this.talk = []; this.talkRev++; return { ok: true }; }
  // Tool calls from the chat's last reply that still want an answer typed for them.
  waitingCalls() { const t = [...this.talk].reverse().find((x) => x.who === 'brain' && !x.to); return t && !t.live ? t.calls.filter((c) => c.answer === undefined) : []; }
  must() { if (!this.allowed()) throw new Error('Running things from the console is off. Turn on "Let the Lab run commands here" first.'); }

  // ---- buttons: saved commands, each checked like a typed one ----
  buttonsFile() { return path.join(this.dir(), 'buttons.json'); }
  buttons() { const j = readJson(this.buttonsFile(), []); return Array.isArray(j) ? j.slice(0, MAX_BUTTONS) : []; }
  addButton({ label = '', side = 'tool', line = '' } = {}) {
    const l = String(label).replace(/[\r\n]+/g, ' ').trim().slice(0, 30), s = ['chat', 'model'].includes(side) ? 'chat' : 'server', t = String(line).trim();
    if (!l) throw new Error('Give the button a name.');
    parseLine(t); if (!t) throw new Error('Type the command the button runs.');
    const list = this.buttons(); if (list.length >= MAX_BUTTONS) throw new Error(`${MAX_BUTTONS} buttons at most.`);
    list.push({ label: l, side: s, line: t }); writeJson(this.buttonsFile(), list); return { buttons: list };
  }
  removeButton(i) { const list = this.buttons(); if (!list[i]) throw new Error('There\'s no such button.'); list.splice(i, 1); writeJson(this.buttonsFile(), list); return { buttons: list }; }
  pressButton(i) { const b = this.buttons()[i]; if (!b) throw new Error('There\'s no such button.'); return this.send({ side: b.side, text: b.line }); }

  // ---- input: one line from either side ----
  // side: server (the terminal: server commands and scripts) or chat. Older buttons say tool or model.
  async send({ side = 'server', text = '' } = {}) {
    const chat = side === 'chat' || side === 'model';
    const line = String(text ?? '').replace(/[\r\n]+$/, '');
    const h = this.history[chat ? 'chat' : 'server']; if (line.trim() && h.at(-1) !== line) { h.push(line); if (h.length > 100) h.shift(); }
    if (chat) return this.modelSay(line);
    if (this.job && (this.toJob || side === 'tool')) return this.toolCommand(line);
    return this.serverCommand(line);
  }

  async serverCommand(line) {
    const w = parseLine(line); const [verb, ...rest] = w;
    if (['node', 'python', 'forge', 'stop'].includes(verb)) return this.toolCommand(line);
    this.push('server', `> ${line}`, { kind: 'cmd' });
    if (!verb) return { ok: true };
    if (verb === 'help') { for (const l of HELP.server) this.push('server', l, { kind: 'note' }); return { ok: true }; }
    if (verb === 'clear') return this.clear();
    if (verb === 'status') { this.status(); return { ok: true }; }
    if (verb === 'watch') return this.watchCmd(rest[0]);
    this.must();
    if (verb === 'load') return this.load(rest);
    if (verb === 'unload') return this.unload();
    if (verb === 'hold') { this.hold = rest[0] !== 'off'; this.push('server', this.hold ? 'Holding each request from a tool: read it, fix it, then Send or Drop.' : 'Requests go straight through.', { kind: 'note' }); if (!this.hold) for (const p of this.pending.values()) p.decide({ send: true }); return { hold: this.hold }; }
    if (verb === 'target') {
      const u = rest[0] || '';
      if (u === 'off' || !u) { this.target = ''; this.push('server', this.server ? 'The relay goes to the brain loaded here.' : 'The relay has no server now.', { kind: 'note' }); return { ok: true }; }
      if (!/^https:\/\/[\w.-]+(:\d+)?(\/[^\s"'<>]*)?$/.test(u) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[^\s"'<>]*)?$/.test(u)) throw new Error('A target is an https link, or http on this computer (127.0.0.1).');
      this.target = u.replace(/\/+$/, ''); await this.startRelay(); this.push('server', `The relay now goes to ${this.target}. Tools use ${this.relay.url}.`, { kind: 'note' }); return { ok: true };
    }
    const quick = { health: ['GET', '/health'], props: ['GET', '/props'], slots: ['GET', '/slots'], models: ['GET', '/v1/models'] };
    if (quick[verb]) return this.ask(...quick[verb]);
    if (verb === 'get') { if (!/^\/[^\s]*$/.test(rest[0] || '')) throw new Error('get /path, like get /props.'); return this.ask('GET', rest[0]); }
    if (verb === 'post') { if (!/^\/[^\s]*$/.test(rest[0] || '')) throw new Error('post /path {json}, like post /tokenize {"content":"hello"}.'); const body = rest.slice(1).join(' '); try { JSON.parse(body || '{}'); } catch { throw new Error('That body isn\'t readable JSON.'); } return this.ask('POST', rest[0], body || '{}'); }
    if (verb === 'pods') return this.runCommand(['forge', '--status']);
    if (verb === 'kill') { if (!rest[0]) throw new Error('Name the pod: kill <podId>. "pods" lists them.'); return this.runCommand(['forge', '--kill', rest[0]]); }
    throw new Error(`"${verb}" isn't a command here. Type help: server commands, and node, python or forge.`);
  }
  status() {
    const v = this.view({ since: this.seq });
    const say = (t) => this.push('server', t, { kind: 'note' });
    say(v.server.state === 'up' ? `Loaded here: ${v.server.brain} on the ${v.server.where}, ${v.server.ctx} context.` : v.server.state === 'loading' ? `Loading ${v.server.brain}…` : 'No brain is loaded here.');
    say(`Relay: ${this.relay ? `${this.relay.url} → ${this.target || (this.server ? this.server.url : 'nothing yet')}` : 'not started'}${this.hold ? ', holding each request' : ''}.`);
    say(this.job ? `Running: ${this.job.label}` : 'No command is running.');
    if (v.rental) say(`Forge run ${v.rental.plan} on a rented card, caps ${v.rental.hours} hours or $${v.rental.dollars}.`);
  }
  watchCmd(arg) {
    const logs = this.activeLogs();
    if (arg === 'off') { this.watch = ''; this.push('server', 'Not following another log.', { kind: 'note' }); return { ok: true }; }
    if (!arg) { if (!logs.length) this.push('server', 'No log in the model-lab out folder changed in the last half hour.', { kind: 'note' }); logs.forEach((l, i) => this.push('server', `  ${i + 1}  ${path.basename(l.file)}  (${Math.round((this.now() - l.m) / 60e3)} min ago)`, { kind: 'note' })); return { logs: logs.length }; }
    const pick = logs[Number(arg) - 1] || logs.find((l) => path.basename(l.file) === arg);
    if (!pick) throw new Error('No such log. Type watch to list them.');
    this.watch = pick.file; this.files.delete(pick.file); this.follow(); return { ok: true };
  }

  // ---- a brain loaded here ----
  // From the Load model locally window: the same as typing load, with the engine and the processor choice too.
  loadForm({ brain = '', ctx = this.setup.ctx, engine = '', unload = false, cpuOk = this.setup.cpuOk } = {}) {
    const b = (this.lab.brains?.() || []).find((x) => x.id === String(brain));
    if (!b) throw new Error('Pick a brain.');
    this.saveSetup({ ctx: Number(ctx), cpuOk: cpuOk !== false });
    return this.load([b.id, '--ctx', String(this.setup.ctx), ...(unload ? ['--unload'] : [])], { engine: LAB_ENGINES.includes(engine) ? engine : '', cpuOk: this.setup.cpuOk });
  }
  // Which engine a load uses: '' = the one Bob's brains use, brainengine, llamacpp (Settings > Engines has them).
  engineExe(engine = '') {
    if (!engine) return this.lab.tools?.().server;
    const n = this.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
    for (const d of labEngineDirs({ ...this.cfg, labEngine: engine })) { const p = path.join(d, n); if (fs.existsSync(p)) return { path: p, found: true }; }
    return { path: '', found: false };
  }
  engines() { return [['', 'The one Bob\'s brains use'], ['brainengine', 'Brain Engine'], ['llamacpp', 'Plain llama.cpp']].map(([id, name]) => { let found = false; try { found = Boolean(this.engineExe(id)?.found); } catch {} return { id, name, found }; }); }
  async load(words, { engine = '', cpuOk = true } = {}) {
    if (this.server || this.loading) throw new Error(`${(this.server || this.loading).brain} is loaded. Type unload first.`);
    const unload = words.includes('--unload');
    const ci = words.indexOf('--ctx'); const ctx = ci >= 0 ? Math.round(Number(words[ci + 1])) : 8192;
    if (!(ctx >= 512 && ctx <= 262144)) throw new Error('--ctx is a number from 512 to 262144.');
    const name = words.filter((x, i) => !x.startsWith('--') && !(ci >= 0 && i === ci + 1)).join(' ').trim().toLowerCase();
    const brains = this.lab.brains?.() || [];
    if (!name) { this.push('server', brains.length ? `Brains here: ${brains.map((b) => b.name).join(', ')}` : 'No brains here yet. Get one in Get models.', { kind: 'note' }); return { ok: true }; }
    const b = brains.find((x) => x.id.toLowerCase() === name) || brains.find((x) => x.name.toLowerCase() === name) || brains.find((x) => x.name.toLowerCase().includes(name));
    if (!b) throw new Error(`No brain here is called "${name}". Type load to list them.`);
    if (gaming(this.cfg)) throw new Error('Gaming is on, so nothing loads on the card. Switch the session to Normal first.');
    const pre = await this.lab.preflight?.({ unload });
    if (pre?.needUnload) throw new Error(`Bob's brain (${pre.names.join(', ')}) is on the card. Type load ${b.name} --unload to unload it first.`);
    const exe = this.engineExe(engine);
    if (!exe?.found) throw new Error(engine ? 'That engine isn\'t on this computer. Settings > Engines gets it.' : 'There\'s no engine for the Lab yet. Get one in Settings, Engines.');
    const ac = new AbortController(); this.loading = { brain: b.name, ac };
    this.push('server', `Loading ${b.name} with ${ctx} context…`, { kind: 'note' });
    const self = this;
    const spawnFn = (cmd, args, opts) => {
      const c = self.spawnFn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
      const f = self.feeder('server', 'server'); c.stdout?.on('data', f.data); c.stderr?.on('data', f.data);
      c.on?.('exit', (code) => { f.end(); if (self.server?.child === c) { self.server = null; self.push('server', `The server stopped (exit ${code}).`, { kind: 'error' }); } });
      self.loadingChild = c; return c;
    };
    try {
      const srv = await this.startServerFn({ exe: exe.path, gguf: b.gguf, mmproj: b.mmproj, ctx, cpuOk, signal: ac.signal, spawnFn, log: (l) => this.push('server', `$ ${l}`, { kind: 'cmd' }) });
      this.server = { ...srv, brain: b.name, ctx, engine: this.engines().find((e) => e.id === engine)?.name || '', child: this.loadingChild };
      await this.startRelay();
      this.push('server', `${b.name} is ready on the ${srv.where}. Chat with it, and tools use ${this.relay.url} ({url} in a command).`, { kind: 'note' });
      return { loaded: b.name };
    } finally { this.loading = null; }
  }
  unload() {
    if (this.loading) { this.loading.ac.abort(); this.push('server', 'Loading stopped.', { kind: 'note' }); return { stopped: true }; }
    if (!this.server) { this.push('server', 'Nothing is loaded here.', { kind: 'note' }); return { stopped: false }; }
    const s = this.server; this.server = null; try { s.stop(); } catch {}
    this.push('server', `${s.brain} unloaded.`, { kind: 'note' }); return { stopped: true };
  }
  targetUrl() { return this.target || this.server?.url || this.door()?.url || ''; }

  // ---- a rented card, opened from the console: the Forge serves the brain and runs lab-door.mjs here, which writes
  // its address on this computer (it adds the card's key itself, so the key never comes here) and waits ----
  doorFile() { return path.join(this.dir(), 'rental-door.json'); }
  door() {
    const d = readJson(this.doorFile(), null);
    if (!d || !/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(d.url || '') || !(d.pid > 0)) return null;
    if (!(this.lab.forgeAlive || alive)(d.pid)) { try { fs.rmSync(this.doorFile(), { force: true }); } catch {} return null; }
    return { url: d.url, name: String(d.name || 'the brain').slice(0, 60) };
  }
  rentalPlan(form = {}) { return makeRentalPlan(form, { dir: forgeDir(this.cfg), door: this.doorFile(), labPlans: forgePlansDir(labDir(this.cfg)) }); }
  rentalChoices() { return rentalChoices(forgeDir(this.cfg)); }
  // END RENTAL: the Forge's own stop (only this run's card, by its pod), and the door closes.
  async endRental() {
    const r = await this.lab.forgeStop();
    try { fs.rmSync(this.doorFile(), { force: true }); } catch {}
    this.push('server', r.pod ? 'The rental is ended: its card is deleted.' : 'The Forge run is stopped. It hadn\'t rented a card yet.', { kind: 'note' });
    return r;
  }
  // STOP: everything running here stops. A rented card is never ended by it: the Forge stops watching, the card stays up.
  stopHere() {
    const done = [];
    if (this.job) { this.stop(); done.push('the command'); }
    if (this.reply) { this.stopReply(); done.push('the reply'); }
    if (this.loading) { this.unload(); done.push('loading'); }
    try { if (this.lab.stepStop?.()?.stopped) done.push('the Lab step'); } catch {}
    try { if (this.lab.protocolStop?.()?.stopped) done.push('the protocol step'); } catch {}
    try { if (this.lab.job && this.lab.stop?.()?.stopped) done.push('the Lab job'); } catch {}
    let rented = false; try { const h = this.lab.forgeHalt?.(); if (h?.halted) { done.push('the Forge run'); rented = h.pod; } } catch {}
    this.push('server', done.length ? `Stopped ${done.join(', ')}.` : 'Nothing was running.', { kind: 'note' });
    if (rented) this.push('server', 'The rented card is still up, and costs money until it\'s ended. Nothing watches its caps now. END RENTAL deletes it.', { kind: 'error' });
    return { stopped: done, cardUp: rented };
  }

  // ---- the relay: tool → Lab → server, with every request and reply on the record ----
  async startRelay() {
    if (this.relay) return this.relay;
    const srv = http.createServer((req, res) => { this.relayOne(req, res).catch((e) => { try { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); } catch {} }); });
    await new Promise((ok, no) => { srv.once('error', no); srv.listen(0, '127.0.0.1', ok); });
    this.relay = { srv, url: `http://127.0.0.1:${srv.address().port}` };
    return this.relay;
  }
  async relayOne(req, res) {
    const target = this.targetUrl();
    const chunks = []; for await (const c of req) chunks.push(c);
    let body = Buffer.concat(chunks).toString('utf8');
    const mine = req.headers['x-lab-console'] === '1';
    const id = ++this.reqSeq, who = mine ? 'you' : 'a tool';
    if (!target) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'No server is loaded in the Lab console.' })); this.push('traffic', `→ #${id} ${req.method} ${req.url} from ${who}: no server to send it to`, { kind: 'error' }); return; }
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'connection', 'content-length', 'x-lab-console', 'accept-encoding'].includes(k)));
    this.push('traffic', `→ #${id} ${req.method} ${req.url} from ${who}${Object.keys(headers).some((k) => /auth|token|key/i.test(k)) ? ' (with a key, hidden)' : ''}`, { kind: 'sent' });
    if (body) this.push('traffic', cut(pretty(body)), { kind: 'sent' });
    this.trafficLog({ id, dir: 'sent', method: req.method, url: req.url, headers: hideHeaders(headers), body });
    if (this.hold && !mine && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const d = await new Promise((decide) => { this.pending.set(id, { id, method: req.method, url: req.url, body, decide }); req.on('close', () => { if (!res.writableEnded && res.destroyed) decide({ drop: true, gone: true }); }); this.push('traffic', `#${id} is held. Read it, fix it, then Send or Drop.`, { kind: 'note' }); });
      this.pending.delete(id);
      if (d.drop) { this.push('traffic', `#${id} ${d.gone ? 'was given up by the tool' : 'dropped'}.`, { kind: 'note' }); if (!res.destroyed) { res.writeHead(499, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Dropped in the Lab console.' })); } return; }
      const same = (a, b2) => { try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b2)); } catch { return a === b2; } };
      if (typeof d.body === 'string' && !same(d.body, body)) { body = d.body; this.push('traffic', `→ #${id} sent as edited:`, { kind: 'sent' }); this.push('traffic', cut(pretty(body)), { kind: 'sent' }); this.trafficLog({ id, dir: 'sent-edited', method: req.method, url: req.url, body }); }
    }
    const t0 = this.now(); let r;
    const ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    if (mine && this.reply) this.reply.ac = ac;
    try { r = await this.fetchFn(target + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body, signal: ac.signal }); }
    catch (e) { this.push('traffic', `← #${id} failed: ${e.message}`, { kind: 'error' }); this.trafficLog({ id, dir: 'back', error: e.message }); if (!res.headersSent) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); } return; }
    const ct = r.headers.get('content-type') || 'application/json';
    res.writeHead(r.status, { 'content-type': ct });
    const sse = /event-stream/i.test(ct);
    this.push('traffic', `← #${id} ${r.status}${sse ? ', streaming' : ''}`, { kind: 'back' });
    let raw = '', said = '', calls = {}, buf = '', thinking = false;
    // A chat reply goes in the Chat as it comes: the console's own into its waiting turn, a tool's into a turn of its own.
    const isChat = r.status < 300 && /chat|completion/.test(req.url);
    const turn = !isChat ? null : mine ? this.reply?.turn || null : this.setup.toolReplies ? this.say('brain', '', { to: `#${id}`, live: true }) : null;
    const model = (t, kind) => { if (!t) return; if (kind === 'think') { thinking = true; if (turn) turn.think += t; } else { said += t; if (turn) turn.text += t; } if (turn) this.talkRev++; };
    const onSse = (s) => {
      buf += s; const parts = buf.split('\n'); buf = parts.pop();
      for (const l of parts) {
        const m = /^data:\s*(.*)$/.exec(l.trim()); if (!m || m[1] === '[DONE]') continue;
        let j; try { j = JSON.parse(m[1]); } catch { continue; }
        const d = j.choices?.[0]?.delta || {};
        model(d.reasoning_content, 'think'); model(d.content || j.content || '', '');
        for (const tc of d.tool_calls || []) { const k = tc.index ?? 0; calls[k] ||= { id: '', name: '', args: '' }; if (tc.id) calls[k].id = tc.id; if (tc.function?.name) calls[k].name += tc.function.name; if (tc.function?.arguments) calls[k].args += tc.function.arguments; }
      }
    };
    try {
      if (r.body) for await (const c of r.body) { const s = Buffer.from(c).toString('utf8'); raw += s; res.write(c); if (sse) onSse(s); }
    } catch (e) { this.push('traffic', `← #${id} cut off: ${e.message}`, { kind: 'error' }); }
    res.end();
    if (!sse && /chat|completion/.test(req.url)) { try { const j = JSON.parse(raw); const m = j.choices?.[0]?.message || {}; model(m.reasoning_content, 'think'); model(m.content || j.content || '', ''); (m.tool_calls || []).forEach((c, i) => { calls[i] = { id: c.id || '', name: c.function?.name || '', args: c.function?.arguments || '' }; }); } catch {} }
    const callList = Object.values(calls).map((c, i) => ({ id: c.id || `call_${id}_${i}`, name: c.name, args: String(c.args).slice(0, 20000) }));
    if (turn) { turn.calls = callList.map((c) => ({ ...c })); turn.live = false; if (!said && !thinking && !callList.length && r.status >= 300) turn.who = 'error'; this.talkRev++; }
    for (const c of callList) this.push('traffic', `[calls ${c.name}(${c.args.slice(0, 2000)})]`, { kind: 'back' });
    this.push('traffic', sse ? cut(said || raw) : cut(pretty(raw)), { kind: 'back' });
    this.push('traffic', `← #${id} done in ${((this.now() - t0) / 1000).toFixed(1)} s, ${Math.round(raw.length / 102.4) / 10} KB`, { kind: 'back' });
    this.trafficLog({ id, dir: 'back', status: r.status, body: raw });
    if (mine && this.reply) { this.reply.text = said; this.reply.calls = callList; }
  }
  decide(id, { send = false, body } = {}) {
    const p = this.pending.get(Number(id)); if (!p) throw new Error('That request isn\'t held any more.');
    if (send && typeof body === 'string' && /^\s*[[{]/.test(p.body || '')) { try { JSON.parse(body); } catch { throw new Error('That isn\'t readable JSON yet. Fix it, or Drop the request.'); } }
    p.decide(send ? { send: true, body: typeof body === 'string' ? body : undefined } : { drop: true });
    return { ok: true };
  }
  // A request from the server side, through the relay, so it's on the record like any other.
  async ask(method, url, body) {
    if (!this.targetUrl()) throw new Error('No server is loaded. load <brain> first, or target <link>.');
    await this.startRelay();
    const r = await this.fetchFn(this.relay.url + url, { method, headers: { 'content-type': 'application/json', 'x-lab-console': '1' }, body: method === 'GET' ? undefined : body, signal: AbortSignal.timeout(60e3) });
    await r.text();
    return { status: r.status };
  }

  // ---- the model side ----
  // The tools the Chat offers the brain: none, the Lab test's four practice tools, or Bob's own (as Bob offers them now).
  chatTools() {
    if (this.setup.tools === 'practice') return PRACTICE_TOOLS;
    if (this.setup.tools === 'bob') { const b = this.lab.brain; try { return b?.toolSchemas ? b.toolSchemas(Object.keys(b.tools || {})) : []; } catch { return []; } }
    return [];
  }
  async modelSay(line) {
    const t = line.trim();
    this.must();
    if (!t) return { ok: true };
    if (!this.targetUrl()) throw new Error('No brain is loaded. Press Load model locally, or Open rental.');
    if (this.reply) throw new Error('It\'s still answering. Press Stop first.');
    const wait = this.waitingCalls();
    if (wait.length) { // what's typed is the answer from the tool it called, so it can carry on
      return this.toolAnswer(wait[0].id, t);
    }
    this.say('you', t);
    this.chat.messages.push({ role: 'user', content: t });
    return this.ask4reply();
  }
  // A tool's answer, typed by the owner for the call the brain made (the Chat never runs a tool itself).
  async toolAnswer(callId, text) {
    this.must();
    const turn = [...this.talk].reverse().find((x) => x.who === 'brain' && !x.to && x.calls.some((c) => c.id === callId));
    const call = turn?.calls.find((c) => c.id === callId);
    if (!call || call.answer !== undefined) throw new Error('That tool call has its answer already.');
    call.answer = String(text).slice(0, 20000); this.talkRev++;
    this.chat.messages.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: call.answer });
    if (this.waitingCalls().length) return { ok: true, waiting: true };
    return this.ask4reply();
  }
  async ask4reply() {
    if (!this.targetUrl()) throw new Error('No brain is loaded. Press Load model locally, or Open rental.');
    const body = JSON.stringify(chatBody(this.setup, this.chat.messages, this.chatTools()));
    await this.startRelay();
    const turn = this.say('brain', '', { live: true });
    this.reply = { text: '', calls: [], ac: null, turn };
    (async () => {
      try { const r = await this.fetchFn(this.relay.url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lab-console': '1' }, body }); await r.text(); }
      catch (e) { if (turn.live) { turn.live = false; turn.who = turn.text ? 'brain' : 'error'; if (!turn.text) turn.text = `It stopped: ${e.message}`; this.talkRev++; } }
      finally {
        const rp = this.reply;
        if (rp?.text || rp?.calls?.length) this.chat.messages.push({ role: 'assistant', content: rp.text || '', ...(rp.calls.length ? { tool_calls: rp.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } })) } : {}) });
        else if (this.chat.messages.at(-1)?.role === 'user') this.chat.messages.pop();
        if (turn.live) { turn.live = false; this.talkRev++; }
        this.reply = null;
      }
    })();
    return { asked: true };
  }
  stopReply() { if (!this.reply) return { stopped: false }; try { this.reply.ac?.abort(); } catch {} const t = this.reply.turn; if (t) { t.live = false; t.text += t.text ? ' (stopped)' : '(stopped)'; this.talkRev++; } return { stopped: true }; }

  // ---- the tool side: a command, or a line typed into the running one ----
  async toolCommand(line) {
    const t = line.trim();
    if (this.job) {
      if (t === 'stop') return this.stop();
      this.must();
      this.push('tool', `> ${line}`, { kind: 'you' });
      try { this.job.child.stdin?.write(line + '\n'); } catch (e) { throw new Error(`It isn't listening: ${e.message}`); }
      return { typed: true };
    }
    if (t === 'help' || !t) { for (const l of HELP.server) this.push('server', l, { kind: 'note' }); return { ok: true }; }
    if (t === 'stop') { this.push('server', 'Nothing is running.', { kind: 'note' }); return { stopped: false }; }
    if (t === 'clear') return this.clear();
    return this.runCommand(parseLine(t), line);
  }
  runCommand(words, line = words.join(' ')) {
    this.must();
    if (this.job) throw new Error(`${this.job.label} is running. One command at a time; stop it first.`);
    let c;
    try { c = checkCommand(words, { dir: forgeDir(this.cfg), url: this.relay && this.targetUrl() ? this.relay.url : '', platform: this.platform, node: nodeCmd().file }); }
    catch (e) { this.push(words[0] === 'forge' ? 'server' : 'tool', `> ${line}`, { kind: 'cmd' }); throw e; } // what was typed shows above why it was refused
    const ch = c.ch || 'tool';
    this.push(ch, `> ${line}`, { kind: 'cmd' });
    const env = cleanEnv(process.env, { ...nodeCmd().env, ...(this.relay && this.targetUrl() ? { LAB_URL: this.relay.url } : {}), ...(c.forge ? this.lab.forgeKeys?.() || {} : {}), PYTHONUNBUFFERED: '1', FORCE_COLOR: '0' });
    if (c.forge && !env[FORGE_KEY]) this.push(ch, 'There\'s no rental key, so the Forge can\'t reach the rental service. Settings > Rented brains says how to add it.', { kind: 'note' });
    let child;
    try { child = this.spawnFn(c.exe, c.args, { cwd: c.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: this.platform !== 'win32' }); }
    catch (e) { throw new Error(`It didn't start: ${e.message}`); }
    const f = this.feeder('tool', c.ch);
    child.stdout?.on('data', f.data); child.stderr?.on('data', f.data);
    const job = { label: c.label, child, at: this.now(), stopped: false };
    this.job = job;
    const done = (code, err) => { if (this.job !== job) return; f.end(); this.job = null; this.push(ch, job.stopped ? 'Stopped.' : err ? `It didn't start: ${err.message}` : `Finished (exit ${code}).`, { kind: code === 0 && !err ? 'note' : 'error' }); };
    child.on?.('exit', (code) => done(code)); child.on?.('error', (e) => done(-1, e));
    return { started: c.label };
  }
  stop() {
    if (!this.job) return { stopped: false };
    this.job.stopped = true; this.killFn(this.job.child.pid);
    try { this.job.child.kill?.(); } catch {}
    return { stopped: true };
  }
  stopAll() { this.stop(); this.stopReply(); this.unload(); try { fs.rmSync(this.doorFile(), { force: true }); } catch {} for (const p of this.pending.values()) p.decide({ drop: true }); this.flush(); try { this.relay?.srv.close(); } catch {} this.relay = null; }
}

// /api/lab/console: reading is open to any device Bob lets in (paths hidden); everything else is this computer only.
export async function consoleRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!p.startsWith('/api/lab/console')) return false;
  const c = lab.labConsole();
  let b = {};
  try {
    if (req.method === 'GET' && p === '/api/lab/console') { const q = new URL(req.url, 'http://x').searchParams; send(res, 200, c.view({ since: Number(q.get('since')) || 0, talk: q.has('talk') ? Number(q.get('talk')) : -1, remote: !isLocal })); return true; }
    if (req.method === 'GET' && p === '/api/lab/console/choices') { send(res, 200, isLocal ? { engines: c.engines(), brains: (lab.brains?.() || []).map((x) => ({ id: x.id, name: x.name })), rental: c.rentalChoices() } : { engines: [], brains: [], rental: { brains: [], cards: [], engines: [] } }); return true; }
    if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
    if (!isLocal) { send(res, 403, { error: 'The console only takes commands on this computer itself. Other devices can watch it.' }); return true; }
    b = (await body(req)) || {};
    if (p === '/api/lab/console/allow') { send(res, 200, c.allow(b.on === true)); return true; }
    if (p === '/api/lab/console/send') { send(res, 200, await c.send({ side: String(b.side || 'server'), text: String(b.text ?? '').slice(0, 20000) })); return true; }
    if (p === '/api/lab/console/stop') { const w = String(b.what || 'all'); send(res, 200, w === 'server' ? c.unload() : w === 'reply' || w === 'model' ? c.stopReply() : w === 'command' || w === 'tool' ? c.stop() : c.stopHere()); return true; }
    if (p === '/api/lab/console/setup') { send(res, 200, c.saveSetup(b.setup || {})); return true; }
    if (p === '/api/lab/console/newchat') { send(res, 200, c.newChat()); return true; }
    if (p === '/api/lab/console/answer') { b.side = 'chat'; send(res, 200, await c.toolAnswer(String(b.id || ''), String(b.text ?? ''))); return true; }
    if (p === '/api/lab/console/tojob') { c.toJob = b.on !== false; send(res, 200, { toJob: c.toJob }); return true; }
    if (p === '/api/lab/console/load') { c.must(); b.side = 'server'; send(res, 200, await c.loadForm(b)); return true; }
    if (p === '/api/lab/console/rental/plan') { const r = c.rentalPlan(b.form || {}); send(res, 200, { problems: r.problems, notes: r.notes, summary: r.summary, card: r.problems.length ? null : lab.forgeCard(r.id) }); return true; }
    if (p === '/api/lab/console/rental/end') { b.side = 'server'; send(res, 200, await c.endRental()); return true; }
    if (p === '/api/lab/console/decide') { send(res, 200, c.decide(b.id, { send: b.send === true, body: typeof b.body === 'string' ? b.body.slice(0, 2e6) : undefined })); return true; }
    if (p === '/api/lab/console/hold') { c.must(); c.hold = b.on === true; if (!c.hold) for (const x of c.pending.values()) x.decide({ send: true }); send(res, 200, { hold: c.hold }); return true; }
    if (p === '/api/lab/console/clear') { send(res, 200, c.clear()); return true; }
    if (p === '/api/lab/console/button') { send(res, 200, b.add ? c.addButton(b.add) : Number.isInteger(b.remove) ? c.removeButton(b.remove) : Number.isInteger(b.press) ? await c.pressButton(b.press) : c.view({ since: c.seq })); return true; }
    send(res, 404, { error: 'no' }); return true;
  } catch (e) { const side = String(b?.side || ''); try { if (side === 'chat' || side === 'model') c.say('error', e.message); else if (side) c.push('server', e.message, { kind: 'error' }); } catch {} send(res, 400, { error: e.message }); return true; }
}

// ---- Open rental: a Forge plan that rents one card, serves one brain on it, and waits ----
// It's a benchmark-only plan (the Forge's own, well-worn kind) whose one "test command" is lab-door.mjs: it runs here,
// tells the console where the brain answers, and waits. Or one of the Forge's own saved plans, as it is. Either way
// the caps are typed, and it starts only from its purchase card.
const RENTAL_ID = 'console-rental';
const HF_GGUF = /^hf:[\w.-]{1,96}\/[\w.-]{1,96}:[\w./-]{1,200}\.gguf$/;
const CARD_RE = /^[\w .()-]{3,60}$/;
function forgePlanFiles(dir) {
  const pd = dir ? path.join(dir, 'forge', 'plans') : '';
  let names = []; try { names = fs.readdirSync(pd).filter((f) => f.endsWith('.json')); } catch {}
  return names.map((f) => { let j = null, m = 0; try { j = JSON.parse(fs.readFileSync(path.join(pd, f), 'utf8')); m = fs.statSync(path.join(pd, f)).mtimeMs; } catch {} return j && typeof j === 'object' ? { id: f.slice(0, -5), plan: j, m } : null; }).filter(Boolean);
}
export function rentalChoices(dir) {
  const plans = forgePlanFiles(dir), brains = [], cards = [], seen = new Set();
  for (const { plan } of plans) {
    for (const m of plan.benchmark?.models || []) if (HF_GGUF.test(m.file || '') && !seen.has(m.file)) { seen.add(m.file); brains.push({ file: m.file, name: String(m.name || '').slice(0, 40), nickname: String(m.nickname || '').slice(0, 60) }); }
    for (const g of [...(plan.gpus || []), ...(plan.step_up || [])]) if (CARD_RE.test(g) && !cards.includes(g)) cards.push(g);
  }
  const be = plans.filter((x) => x.plan.benchmark?.brain_engine?.ref).sort((a, b) => b.m - a.m)[0];
  const usual = (plans.find((x) => x.id === 'bench-bobert')?.plan.gpus || cards.slice(0, 4)).filter((g) => cards.includes(g));
  return {
    brains, cards, usual,
    engines: [...(be ? [{ id: 'brainengine', name: 'Brain Engine (Bob\'s patches)', from: be.id }] : []), { id: 'plain', name: 'Plain llama.cpp' }],
    plans: plans.sort((a, b) => b.m - a.m).map(({ id, plan }) => ({ id, note: String(plan.note || '').slice(0, 300), hours: Number(plan.hours_max) || 0, dollars: Number(plan.dollars_max) || 0, cards: (plan.gpus || []).slice(0, 6) }))
  };
}
export function makeRentalPlan(form = {}, { dir = '', door = '', labPlans = '' } = {}) {
  const problems = [], notes = [];
  if (!dir) { problems.push('Bob can\'t find the Forge: the model-lab folder of Bob\'s source.'); return { problems, notes, summary: [] }; }
  const ch = rentalChoices(dir), plans = forgePlanFiles(dir);
  const hours = Number(form.hours), dollars = Number(form.dollars);
  if (!(hours > 0 && hours <= 24)) problems.push('Type the most hours it may run (up to 24).');
  if (!(dollars > 0 && dollars <= 500)) problems.push('Type the most it may cost, in dollars (up to 500).');
  // A Forge plan as it is, with the caps typed here.
  if (form.kind === 'plan') {
    const pick = plans.find((x) => x.id === String(form.plan || ''));
    if (!pick) problems.push('Pick one of the Forge\'s plans.');
    if (problems.length) return { problems, notes, summary: [] };
    const plan = { ...pick.plan, hours_max: hours, dollars_max: dollars };
    fs.mkdirSync(labPlans, { recursive: true });
    writeJson(path.join(labPlans, `${RENTAL_ID}.json`), plan);
    notes.push('Everything it prints shows in the Server panel. It ends by itself when it finishes or at a cap. END RENTAL ends it sooner. STOP never ends it.');
    return { problems, notes, id: RENTAL_ID, summary: [`Forge plan: ${pick.id}`, `Cards: ${(plan.gpus || []).join(', ') || 'the Forge\'s usual list'}`, `Caps: ${hours} hour${hours === 1 ? '' : 's'} or $${dollars}`] };
  }
  if (!fs.existsSync(path.join(dir, 'lab-door.mjs'))) problems.push('lab-door.mjs isn\'t in this model-lab folder yet. Update Bob\'s source.');
  const file = String(form.brain || '').trim();
  if (!HF_GGUF.test(file)) problems.push('Pick a brain, or type one on Hugging Face as hf:owner/repo:file.gguf.');
  const known = ch.brains.find((x) => x.file === file);
  const name = String(form.name || known?.name || file.split(':').pop()?.replace(/\.gguf$/, '') || 'brain').replace(/[^\w.-]/g, '').slice(0, 40) || 'brain';
  const n = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) && String(v ?? '') !== '' ? Math.min(hi, Math.max(lo, x)) : d; };
  const ctx = Math.round(n(form.ctx, 2048, 131072, 32768)), slots = Math.round(n(form.slots, 1, 4, 1));
  const cards = (Array.isArray(form.cards) ? form.cards : []).map(String).filter((g) => CARD_RE.test(g)).slice(0, 8);
  if (!cards.length) problems.push('Tick at least one kind of card.');
  const eng = ch.engines.find((e) => e.id === form.engine) || ch.engines[0];
  const from = eng.from ? plans.find((x) => x.id === eng.from)?.plan : null;
  if (problems.length) return { problems, notes, summary: [] };
  const base = plans.find((x) => x.id === 'bench-bobert')?.plan || {};
  const plan = {
    run: RENTAL_ID, note: `Opened from the Lab console: the card serves ${name} and waits for the console. Caps ${hours} h or $${dollars}.`,
    benchmark_only: true, teacher: base.teacher || 'Qwen/Qwen3.6-35B-A3B', ...(base.counts ? { counts: base.counts } : {}), lessons: base.lessons || 'out/lessons',
    gpus: cards, step_up: [], volume_wait_minutes: base.volume_wait_minutes || 15, disk_gb: Math.round(n(form.disk, 40, 400, base.disk_gb || 80)), general_tokens: 0,
    rungs: [], hours_max: hours, dollars_max: dollars, rent_minutes: base.rent_minutes || 60, download_quants: [], direct: true,
    ...(from?.llama_tag ? { llama_tag: from.llama_tag } : {}),
    benchmark: {
      hours_each: hours, models: [{ name, ...(known?.nickname ? { nickname: known.nickname } : {}), file, ctx, slots }],
      commands: [`node lab-door.mjs --file "${String(door).replace(/"/g, '')}" --hours ${hours}`],
      ...(from ? { brain_engine: { ref: from.benchmark.brain_engine.ref, patches: (from.benchmark.brain_engine.patches || []).filter((x) => !String(x).startsWith('pod:')) } } : {})
    }
  };
  fs.mkdirSync(labPlans, { recursive: true });
  writeJson(path.join(labPlans, `${RENTAL_ID}.json`), plan);
  notes.push('The card builds its engine first (10 to 15 minutes), then fetches the brain, then waits. The Server panel shows each step. The Chat and your tools use the brain once it answers.');
  notes.push('It ends by itself at a cap. END RENTAL ends it sooner. STOP never ends it.');
  return { problems, notes, id: RENTAL_ID, summary: [`Brain: ${known?.nickname ? `${known.nickname} (${name})` : name}`, `Engine on the card: ${eng.name}`, `Context: ${ctx}, ${slots} at a time`, `Cards: ${cards.join(', ')}`, `Caps: ${hours} hour${hours === 1 ? '' : 's'} or $${dollars}`] };
}
