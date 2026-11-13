// Coding agents (Settings, Other apps; off unless you turn it on). Bob runs the coding agents you already have
// (Claude Code, Codex, Gemini CLI, Qwen Code, OpenCode, or any other program you name) side by side, each in its own
// project folder, and shows which is working, which needs you, and which is done. The idea comes from herdr
// (github.com/herdrdev/herdr, Apache 2.0); no code of theirs is in here.
//
// How it works, the same for every maker:
// - Each agent runs as its own program in its own folder, in its "ask once and answer" mode (claude -p, codex exec,
//   gemini with the task piped in, opencode run). The task goes in on stdin, or in a task file outside the project
//   folder, never on the command line, so nothing typed can turn into a command (that matters for .cmd files on Windows).
// - Bob never adds a "skip the checks" flag. An agent may change files only when its own "May change files" switch is
//   on (off to start with), and then only through that program's own "edit in this folder" mode.
// - What it says is read as it comes: working while it runs, done when it ends, needs you when it ended on a question
//   or wanted something it wasn't allowed. Answer it, and the next run carries on (Claude Code picks up its own
//   session; the others get a short note of what they said last).
// - Hand work on: "Pass to" sends one agent's answer to another with your note, and "When done, pass to" chains them.
//   With "Let agents hand work to each other" on, each agent is told once, in its own task, how to ask another agent
//   and wait for the answer (agent-ask.mjs). At most MAX_HOPS hand-ons in a row, so two agents can't ping-pong forever.
// - Accounts: each agent can use its own sign-in folder (Settings: "Account"), so two people can each use their own
//   Claude, Codex or Gemini account on one computer at the same time. Each person's account only runs their agents.
//   Bob never shares, swaps or rotates accounts.
// - Claude Code status (off): Claude Code sessions you run yourself tell Bob when they work, need you or finish,
//   through Claude Code's own hooks. Connect writes three short hooks into Claude Code's settings (backup first).
// Nothing here goes into Bob's own brain: no start-up words, no tools. It's a panel and a set of programs.
// Not on Android: these programs run on Windows, Mac and Linux. The panel says so there.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn as nodeSpawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from './util.js';
import { OS, killTree, groupSpawnOptions } from './platform.js';

export const MAX_AGENTS = 12;
export const MAX_HOPS = 4; // hand-ons in a row before Bob stops the chain
export const SAID_MAX = 20000; // what an agent said last, kept
export const LOG_LINES = 200; // its running log, kept
export const WAIT_MAX_MS = 30 * 60000; // the longest one agent waits for another's answer
export const STATES = ['idle', 'working', 'needs-you', 'done', 'failed', 'stopped'];
export const STATE_WORDS = { idle: 'ready', working: 'working', 'needs-you': 'needs you', done: 'done', failed: 'failed', stopped: 'stopped' };
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ASK_SCRIPT = path.join(HERE, 'agent-ask.mjs');

// ---- The makers. Data, so a new one is a few lines. ----
// input: 'stdin' (the task is piped in) or 'file' (the program is pointed at a task file).
// read: how its output is read. home: the setting that moves its sign-in folder (Accounts), else HOME is moved.
export const KINDS = {
  claude: {
    name: 'Claude Code', maker: 'Anthropic', cmd: 'claude', input: 'stdin', read: 'claude-json', resume: true, home: 'CLAUDE_CONFIG_DIR',
    args: ({ edits, resume }) => ['-p', '--output-format', 'stream-json', '--verbose', ...(resume ? ['--resume', resume] : []), ...(edits ? ['--permission-mode', 'acceptEdits'] : [])],
    signIn: []
  },
  codex: {
    name: 'Codex', maker: 'OpenAI', cmd: 'codex', input: 'stdin', read: 'codex-json', home: 'CODEX_HOME',
    args: ({ edits }) => ['exec', '--json', '--skip-git-repo-check', ...(edits ? ['--full-auto'] : ['--sandbox', 'read-only']), '-'],
    signIn: ['login']
  },
  gemini: {
    name: 'Gemini CLI', maker: 'Google', cmd: 'gemini', input: 'stdin', read: 'text',
    args: ({ edits }) => (edits ? ['--approval-mode', 'auto_edit'] : []),
    signIn: []
  },
  qwen: {
    name: 'Qwen Code', maker: 'Alibaba', cmd: 'qwen', input: 'stdin', read: 'text',
    args: ({ edits }) => (edits ? ['--approval-mode', 'auto_edit'] : []),
    signIn: []
  },
  opencode: {
    name: 'OpenCode', maker: 'SST', cmd: 'opencode', input: 'file', read: 'text', xdg: true,
    args: ({ file }) => ['run', `Read the task in the file ${file} and do it.`],
    signIn: ['auth', 'login']
  },
  custom: {
    name: 'Another program', maker: '', cmd: '', input: 'stdin', read: 'text',
    args: ({ file, custom }) => (custom?.args || []).map((a) => String(a).replaceAll('{task-file}', file || '')),
    signIn: []
  }
};
export const KIND_IDS = Object.keys(KINDS);

// Characters cmd.exe treats as commands. A .cmd or .bat program never gets them in an argument.
const CMD_META = /[&|<>^%!"\r\n]/;

// ---- Finding a program on PATH (Windows: .exe, .cmd, .bat from PATHEXT) ----
export function findOnPath(name, { env = process.env, os_ = OS, exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } } } = {}) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/[\\/]/.test(n)) return exists(n) ? n : '';
  const P = os_ === 'win' ? path.win32 : path.posix;
  const dirs = String(env.PATH || env.Path || '').split(os_ === 'win' ? ';' : ':').map((d) => d.replace(/^"|"$/g, '')).filter(Boolean);
  const exts = os_ === 'win' ? ['', ...String(env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase()).filter(Boolean)] : [''];
  for (const d of dirs) for (const e of exts) {
    if (os_ === 'win' && e === '' && !/\.(exe|cmd|bat|com)$/i.test(n)) continue; // Windows can't start an extensionless npm shim
    const f = P.join(d, n + e);
    if (exists(f)) return f;
  }
  return '';
}

// How to start it. A .cmd/.bat (npm's shims on Windows) goes through cmd.exe, with arguments refused if cmd would
// read them as commands; everything else is started directly.
export function launchPlan(exe, args, { os_ = OS, comspec = process.env.ComSpec || 'cmd.exe' } = {}) {
  if (os_ === 'win' && /\.(cmd|bat)$/i.test(exe)) {
    const bad = args.find((a) => CMD_META.test(a));
    if (bad !== undefined) throw new Error('One of its settings has a character Windows would read as a command (& | < > ^ % ! or a quote). Take it out and try again.');
    const q = (s) => (/[\s]/.test(s) || s === '' ? `"${s}"` : s);
    return { file: comspec, args: ['/d', '/s', '/c', `"${[exe, ...args].map(q).join(' ')}"`], verbatim: true };
  }
  return { file: exe, args, verbatim: false };
}

// ---- Accounts: one sign-in folder per account, per maker ----
export const cleanAccount = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
export function accountDir(cfg, kind, account) { const a = cleanAccount(account); return a ? path.join(cfg.dataDir, 'agent-accounts', `${kind}-${a}`) : ''; }
// The settings an agent runs with for an account: the maker's own sign-in folder setting when it has one, else its
// home folder is moved (HOME, and USERPROFILE on Windows), which every one of these programs reads its sign-in from.
export function accountEnv(kind, dir, { os_ = OS } = {}) {
  if (!dir) return {};
  const k = KINDS[kind] || {};
  if (k.home) return { [k.home]: dir };
  if (k.xdg) return { XDG_CONFIG_HOME: path.join(dir, 'config'), XDG_DATA_HOME: path.join(dir, 'data'), XDG_STATE_HOME: path.join(dir, 'state') };
  return os_ === 'win' ? { USERPROFILE: dir, HOME: dir } : { HOME: dir };
}

// ---- Reading what an agent says ----
// Each reader takes one line and the run's notes, and returns a line for the log ('' to skip).
export function readLine(read, line, run) {
  const t = String(line || '').replace(/\r$/, '');
  if (!t.trim()) return '';
  if (read === 'claude-json' || read === 'codex-json') {
    let j = null;
    try { j = JSON.parse(t); } catch {}
    if (!j || typeof j !== 'object') { run.text += t + '\n'; return t; }
    if (read === 'claude-json') {
      if (j.session_id) run.session = String(j.session_id).slice(0, 100);
      if (j.type === 'assistant') {
        const out = [];
        for (const c of j.message?.content || []) {
          if (c?.type === 'text' && c.text) { run.text += c.text + '\n'; out.push(c.text); }
          else if (c?.type === 'tool_use') out.push(`→ uses ${String(c.name || 'a tool').slice(0, 40)}`);
        }
        return out.join('\n');
      }
      if (j.type === 'result') {
        if (typeof j.result === 'string') run.said = j.result;
        if (j.is_error) run.error = String(j.result || j.subtype || 'it stopped with an error').slice(0, 300);
        run.denied = [...new Set((Array.isArray(j.permission_denials) ? j.permission_denials : []).map((d) => String(d?.tool_name || 'a tool').slice(0, 40)))];
        return '';
      }
      return '';
    }
    // Codex: thread.started / item.completed (newer), or msg.type (older)
    if (j.thread_id) run.session = String(j.thread_id).slice(0, 100);
    const it = j.item || {};
    if (j.type === 'item.completed' && (it.type === 'agent_message' || it.item_type === 'assistant_message') && it.text) { run.said = String(it.text); run.text += it.text + '\n'; return it.text; }
    if (j.type === 'item.completed' && it.type === 'command_execution') return `→ runs ${String(it.command || '').slice(0, 120)}`;
    if (j.type === 'item.completed' && it.type === 'file_change') return '→ changes files';
    if (j.msg?.type === 'agent_message' && j.msg.message) { run.said = String(j.msg.message); run.text += j.msg.message + '\n'; return j.msg.message; }
    if (j.type === 'error' || j.type === 'turn.failed') { run.error = String(j.message || j.error?.message || 'it stopped with an error').slice(0, 300); return run.error; }
    return '';
  }
  run.text += t + '\n';
  return t;
}

// Did it end on a question for you? Only the last few lines count, so a question it answered itself doesn't.
const ASKS = /\b(should i|shall i|do you want|would you like|which (one|option)|can you confirm|please confirm|let me know (if|which|whether)|want me to)\b/i;
export function endsOnQuestion(text) {
  const tail = String(text || '').trim().split('\n').filter((l) => l.trim()).slice(-3).join(' ').slice(-400);
  return /\?\s*[)*_`"']*\s*$/.test(tail) || ASKS.test(tail);
}

// What it ended as, and why it needs you (in plain words), from the run's notes and its exit code.
export function endState(run, code, { stopped = false } = {}) {
  if (stopped) return { state: 'stopped', why: 'You stopped it.' };
  if (run.denied?.length) return { state: 'needs-you', why: `It wanted to use ${run.denied.join(', ')} and wasn't allowed. Turn on "May change files" for it, or tell it another way.` };
  if (code !== 0 || run.error) return { state: 'failed', why: run.error || `It stopped with code ${code}.` };
  if (endsOnQuestion(run.said || run.text)) return { state: 'needs-you', why: 'It asked you something.' };
  return { state: 'done', why: '' };
}

// The line added to an agent's task (its own task, never Bob's brain) when agents may hand work to each other.
export function handNote(me, others, { node = 'node', script = ASK_SCRIPT } = {}) {
  if (!others.length) return '';
  return `\n\n(Other coding agents are working beside you on this computer: ${others.map((o) => `${o.name} (${KINDS[o.kind]?.name || o.kind}, in ${o.folder})`).join('; ')}. If part of this job suits one of them better, you can hand it that part and wait for its answer by running: ${node} "${script}" <its name> "<the task>". It prints their answer. Only hand on what helps; you are ${me.name}.)`;
}

// The task an agent gets when another hands it work.
export function passText(from, to, note) {
  const asked = String(from.asked || '').slice(0, 3000), said = String(from.said || '').slice(-8000);
  return `${from.name} (${KINDS[from.kind]?.name || from.kind}, working in ${from.folder}) handed this on to you.\n\nWhat ${from.name} was asked:\n${asked || '(nothing)'}\n\nWhat ${from.name} said:\n${said || '(nothing yet)'}\n\nYour part: ${String(note || '').trim() || 'Check its work and carry on from there.'}`;
}

// ---- Settings and agents (inn\bob\coding-agents.json) ----
const plain = (s, n = 60) => String(s || '').replace(/[\u0000-\u001f<>"]/g, '').trim().slice(0, n);
export const cleanName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+|-+$/g, '').slice(0, 32);
function cleanAgent(a) {
  if (!a || typeof a !== 'object' || !KINDS[a.kind] || !cleanName(a.name)) return null;
  const state = STATES.includes(a.state) ? (a.state === 'working' ? 'stopped' : a.state) : 'idle'; // a run can't outlive Bob
  return {
    id: /^[a-f0-9]{12}$/.test(a.id) ? a.id : crypto.randomBytes(6).toString('hex'),
    name: cleanName(a.name), kind: a.kind, folder: String(a.folder || '').slice(0, 500),
    edits: a.edits === true, account: cleanAccount(a.account), owner: plain(a.owner, 30), then: /^[a-f0-9]{12}$/.test(a.then) ? a.then : '',
    state, why: a.state === 'working' ? 'Bob was closed while it worked. Ask it again to carry on.' : plain(a.why, 300),
    asked: String(a.asked || '').slice(0, 8000), said: String(a.said || '').slice(-SAID_MAX), session: plain(a.session, 100),
    log: (Array.isArray(a.log) ? a.log : []).map((l) => String(l).slice(0, 500)).slice(-LOG_LINES), at: Number(a.at) || 0, runs: Number(a.runs) || 0
  };
}
export function cleanStore(j = {}) {
  const custom = j.custom && typeof j.custom === 'object' ? { cmd: plain(j.custom.cmd, 300), args: (Array.isArray(j.custom.args) ? j.custom.args : []).map((x) => String(x).slice(0, 200)).slice(0, 20) } : { cmd: '', args: [] };
  const agents = (Array.isArray(j.agents) ? j.agents : []).map(cleanAgent).filter(Boolean).slice(0, MAX_AGENTS);
  const seen = new Set();
  for (const a of agents) { while (seen.has(a.name)) a.name = `${a.name.slice(0, 29)}-${seen.size}`; seen.add(a.name); }
  return { on: j.on === true, handOff: j.handOff === true, claudeStatus: j.claudeStatus === true, hookHash: /^[a-f0-9]{64}$/.test(j.hookHash) ? j.hookHash : '', custom, agents };
}

const hash = (k) => crypto.createHash('sha256').update(String(k)).digest('hex');

export class CodingAgents {
  constructor(cfg, { spawn = nodeSpawn, find = (n) => findOnPath(n), broadcast = () => {}, log = () => {}, now = Date.now, env = process.env, os_ = OS, port = () => cfg.port || 7777, node = () => findOnPath('node') || 'node', kill = (c) => killTree(c) } = {}) {
    Object.assign(this, { cfg, spawnFn: spawn, find, broadcast, log, now, env, os_, port, nodePath: node, kill });
    this.file = path.join(cfg.dataDir, 'coding-agents.json');
    this.runs = new Map(); // agent id -> { child, run, token, hops, waiters }
    this.tokens = new Map(); // a live run's token -> agent id (for agent-ask.mjs)
    this.outside = new Map(); // Claude Code sessions you run yourself (Claude Code status): session id -> row
    this.store = this.load();
  }

  load() { try { return cleanStore(JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, ''))); } catch { return cleanStore({}); } }
  save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); writeJsonAtomic(this.file, this.store, 1); } catch (e) { this.log('agents', `couldn't save the coding agents list: ${e.message}`); } }
  agent(idOrName) { return this.store.agents.find((a) => a.id === idOrName || a.name === idOrName) || null; }
  get on() { return this.store.on === true && this.os_ !== 'android'; }

  // Counts for the small badge: how many are working and how many need you (outside Claude Code sessions too).
  summary() {
    const all = [...this.store.agents, ...this.outside.values()];
    return { on: this.store.on, total: this.store.agents.length, working: all.filter((a) => a.state === 'working').length, needsYou: all.filter((a) => a.state === 'needs-you').length };
  }
  changed(a) { this.broadcast({ type: 'coding-agents', summary: this.summary(), ...(a ? { agent: { id: a.id, name: a.name, state: a.state } } : {}) }); }

  // Which programs are on this computer (for the Add list).
  found() {
    const out = {};
    for (const [id, k] of Object.entries(KINDS)) out[id] = id === 'custom' ? (this.store.custom.cmd ? Boolean(this.find(this.store.custom.cmd)) : false) : Boolean(this.find(k.cmd));
    return out;
  }

  view() {
    return {
      ...this.summary(), here: this.os_ !== 'android', handOff: this.store.handOff, claudeStatus: this.store.claudeStatus, custom: this.store.custom,
      kinds: Object.entries(KINDS).map(([id, k]) => ({ id, name: k.name, maker: k.maker, cmd: id === 'custom' ? this.store.custom.cmd : k.cmd, accounts: true })),
      found: this.found(),
      agents: this.store.agents.map((a) => ({ ...a, log: a.log.slice(-40), kindName: KINDS[a.kind]?.name || a.kind, thenName: this.agent(a.then)?.name || '', stateWords: STATE_WORDS[a.state] || a.state })),
      outside: [...this.outside.values()].map((o) => ({ ...o, stateWords: STATE_WORDS[o.state] || o.state }))
    };
  }

  setSettings(b = {}) {
    if ('on' in b) { this.store.on = b.on === true; if (!this.store.on) this.stopAll(); }
    if ('handOff' in b) this.store.handOff = b.handOff === true;
    if (b.custom && typeof b.custom === 'object') this.store.custom = cleanStore({ custom: b.custom }).custom;
    this.save(); this.changed();
    return this.view();
  }

  add({ kind, folder, name, edits = false, account = '', owner = '' } = {}) {
    if (!KINDS[kind]) throw new Error('Pick which program.');
    if (this.store.agents.length >= MAX_AGENTS) throw new Error(`At most ${MAX_AGENTS} coding agents. Remove one first.`);
    const dir = String(folder || '').trim();
    if (!dir || !path.isAbsolute(dir)) throw new Error('Pick the project folder it works in.');
    try { if (!fs.statSync(dir).isDirectory()) throw new Error(); } catch { throw new Error('That folder isn\'t there.'); }
    let n = cleanName(name) || `${kind}-${this.store.agents.filter((a) => a.kind === kind).length + 1}`;
    while (this.agent(n)) n = `${n.slice(0, 29)}-${crypto.randomInt(10, 99)}`;
    const a = cleanAgent({ id: crypto.randomBytes(6).toString('hex'), name: n, kind, folder: dir, edits: edits === true, account, owner, state: 'idle' });
    this.store.agents.push(a); this.save(); this.changed(a);
    this.log('agents', `added ${a.name} (${KINDS[kind].name}) in ${dir}${a.account ? `, account ${a.account}` : ''}`);
    return a;
  }

  change(id, b = {}) {
    const a = this.agent(id);
    if (!a) throw new Error('No such agent.');
    if ('edits' in b) a.edits = b.edits === true;
    if ('then' in b) { const t = b.then ? this.agent(b.then) : null; if (t && t.id === a.id) throw new Error('It can\'t pass work to itself.'); a.then = t ? t.id : ''; }
    if ('account' in b) { a.account = cleanAccount(b.account); a.session = ''; }
    if ('owner' in b) a.owner = plain(b.owner, 30);
    if ('name' in b && cleanName(b.name) && !this.agent(cleanName(b.name))) a.name = cleanName(b.name);
    if (b.clear) { a.said = ''; a.asked = ''; a.log = []; a.session = ''; a.why = ''; if (a.state !== 'working') a.state = 'idle'; }
    this.save(); this.changed(a);
    return a;
  }

  remove(id) {
    const a = this.agent(id);
    if (!a) return false;
    this.stop(a.id);
    this.store.agents = this.store.agents.filter((x) => x.id !== a.id);
    for (const x of this.store.agents) if (x.then === a.id) x.then = '';
    this.save(); this.changed();
    return true;
  }

  // Start a run. Resolves at once with the agent; wait(id) waits for the end.
  ask(id, text, { hops = 0, from = '' } = {}) {
    if (!this.on) throw new Error('Coding agents are off. Turn them on in Settings, Other apps.');
    const a = this.agent(id);
    if (!a) throw new Error('No such agent.');
    if (a.state === 'working') throw new Error(`${a.name} is busy. Wait for it, or stop it first.`);
    const task = String(text || '').trim().slice(0, 40000);
    if (!task) throw new Error('Say what it should do.');
    const k = KINDS[a.kind];
    const exe = this.find(a.kind === 'custom' ? this.store.custom.cmd : k.cmd);
    if (!exe) throw new Error(`${k.name} isn't on this computer (Bob looked for "${a.kind === 'custom' ? this.store.custom.cmd || 'nothing set' : k.cmd}" on the PATH).`);
    try { if (!fs.statSync(a.folder).isDirectory()) throw new Error(); } catch { throw new Error(`${a.name}'s folder isn't there any more.`); }
    // Follow-ups: Claude Code picks up its own session; the others get what they said last.
    const carry = a.said && !(k.resume && a.session) ? `Earlier in this job you said:\n${a.said.slice(-3000)}\n\nNow: ` : '';
    const others = this.store.handOff ? this.store.agents.filter((x) => x.id !== a.id) : [];
    const full = carry + task + (this.store.handOff && hops < MAX_HOPS ? handNote(a, others, { node: this.nodePath(), script: this.askScript() }) : '');
    let file = '';
    if (k.input === 'file' || (a.kind === 'custom' && (this.store.custom.args || []).some((x) => x.includes('{task-file}')))) {
      const dir = path.join(this.cfg.dataDir, 'agent-tasks');
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, `${a.id}.txt`);
      fs.writeFileSync(file, full);
    }
    const args = k.args({ edits: a.edits, resume: k.resume ? a.session : '', file, custom: this.store.custom });
    const plan = launchPlan(exe, args, { os_: this.os_ });
    const token = crypto.randomBytes(24).toString('hex');
    const accDir = accountDir(this.cfg, a.kind, a.account);
    if (accDir) fs.mkdirSync(accDir, { recursive: true });
    const env = { ...this.env, ...accountEnv(a.kind, accDir, { os_: this.os_ }), BOB_AGENT_NAME: a.name, BOB_AGENT_TOKEN: token, BOB_AGENTS_URL: `http://127.0.0.1:${this.port()}/api/coding-agents/ask`, NO_COLOR: '1' };
    let child;
    try { child = this.spawnFn(plan.file, plan.args, { cwd: a.folder, env, windowsHide: true, windowsVerbatimArguments: plan.verbatim, stdio: ['pipe', 'pipe', 'pipe'], ...groupSpawnOptions(this.os_) }); }
    catch (e) { throw new Error(`${k.name} wouldn't start: ${e.message}`); }
    const run = { text: '', said: '', session: '', denied: [], error: '' };
    const r = { child, run, token, hops, waiters: [], stopped: false, buf: '' };
    this.runs.set(a.id, r); this.tokens.set(token, a.id);
    Object.assign(a, { state: 'working', why: from ? `Handed on by ${from}.` : '', asked: task, at: this.now(), runs: a.runs + 1 });
    a.log = [...a.log, `— ${from ? `${from} asks` : 'You ask'}: ${task.replace(/\s+/g, ' ').slice(0, 300)}`].slice(-LOG_LINES);
    this.save(); this.changed(a);
    this.log('agents', `${a.name} started${from ? ` (handed on by ${from})` : ''}`);
    const take = (chunk) => {
      r.buf += chunk.toString('utf8');
      const lines = r.buf.split('\n'); r.buf = lines.pop();
      for (const l of lines) { const shown = readLine(k.read, l, run); if (shown) a.log = [...a.log, ...shown.split('\n').filter((x) => x.trim()).map((x) => x.slice(0, 500))].slice(-LOG_LINES); }
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', (c) => { const t = c.toString('utf8').trim(); if (t) { a.log = [...a.log, ...t.split('\n').map((x) => `! ${x.slice(0, 300)}`)].slice(-LOG_LINES); if (!run.error && /error|not logged in|login|auth/i.test(t)) run.stderr = t.slice(0, 300); } });
    child.on('error', (e) => { run.error = `${k.name} wouldn't start: ${e.message}`; finish(-1); });
    child.on('close', (code) => finish(code ?? -1));
    let ended = false;
    const finish = (code) => {
      if (ended) return; ended = true;
      if (r.buf) { readLine(k.read, r.buf, run); r.buf = ''; }
      if (!run.error && code !== 0 && run.stderr) run.error = run.stderr;
      const end = endState(run, code, { stopped: r.stopped });
      const said = String(run.said || run.text || '').trim().slice(-SAID_MAX);
      if (said || !r.stopped) a.said = said; // a run stopped before it said anything keeps the last answer
      if (run.session) a.session = run.session;
      Object.assign(a, { state: end.state, why: end.why, at: this.now() });
      this.runs.delete(a.id); this.tokens.delete(token);
      if (file) { try { fs.unlinkSync(file); } catch {} }
      this.save(); this.changed(a);
      this.log('agents', `${a.name} ${STATE_WORDS[a.state]}${a.why ? `: ${a.why}` : ''}`);
      for (const w of r.waiters) w(a);
      // When done, pass to: the chain carries on, up to MAX_HOPS in a row.
      const next = a.state === 'done' && a.then ? this.agent(a.then) : null;
      if (next) {
        if (hops + 1 > MAX_HOPS) { a.log = [...a.log, `— Not passed to ${next.name}: that would be more than ${MAX_HOPS} hand-ons in a row.`].slice(-LOG_LINES); this.save(); }
        else if (next.state === 'working') { a.log = [...a.log, `— Not passed to ${next.name}: it's busy. Press Pass to when it's free.`].slice(-LOG_LINES); this.save(); }
        else { try { this.ask(next.id, passText(a, next, ''), { hops: hops + 1, from: a.name }); } catch (e) { this.log('agents', `couldn't pass ${a.name}'s work to ${next.name}: ${e.message}`); } }
      }
    };
    if (k.input === 'stdin') { try { child.stdin?.end(full); } catch {} } else { try { child.stdin?.end(); } catch {} }
    return a;
  }

  // Resolves with the agent once it isn't working (or after ms).
  wait(id, ms = WAIT_MAX_MS) {
    const a = this.agent(id), r = a && this.runs.get(a.id);
    if (!r) return Promise.resolve(a);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(this.agent(id)), ms); t.unref?.();
      r.waiters.push((x) => { clearTimeout(t); resolve(x); });
    });
  }

  stop(id) {
    const a = this.agent(id), r = a && this.runs.get(a.id);
    if (!r) return false;
    r.stopped = true;
    try { this.kill(r.child); } catch {}
    return true;
  }
  stopAll() { for (const id of [...this.runs.keys()]) this.stop(id); }

  // Pass one agent's work to another, with your note.
  pass(fromId, toId, note = '') {
    const from = this.agent(fromId), to = this.agent(toId);
    if (!from || !to) throw new Error('No such agent.');
    if (from.id === to.id) throw new Error('Pick another agent.');
    return this.ask(to.id, passText(from, to, note), { from: from.name });
  }

  // An agent asks another one (agent-ask.mjs, with its run's token). Waits for the answer.
  async askFromAgent({ token, to, text }) {
    const fromId = this.tokens.get(String(token || ''));
    if (!fromId) return { status: 403, body: { error: 'Only a coding agent Bob is running can ask another one.' } };
    if (!this.store.handOff) return { status: 403, body: { error: 'Handing work between agents is off in Bob.' } };
    const from = this.agent(fromId), target = this.agent(String(to || '').trim().toLowerCase());
    if (!target) return { status: 404, body: { error: `There's no agent called ${String(to || '').slice(0, 40)}. Ask one of: ${this.store.agents.filter((x) => x.id !== fromId).map((x) => x.name).join(', ') || 'none'}.` } };
    if (target.id === fromId) return { status: 400, body: { error: 'That\'s you.' } };
    const hops = (this.runs.get(fromId)?.hops || 0) + 1;
    if (hops > MAX_HOPS) return { status: 429, body: { error: `That would be more than ${MAX_HOPS} hand-ons in a row. Do this part yourself.` } };
    try { this.ask(target.id, `${from.name} (another coding agent) asks you:\n\n${String(text || '').slice(0, 20000)}`, { hops, from: from.name }); }
    catch (e) { return { status: 409, body: { error: e.message } }; }
    const done = await this.wait(target.id);
    return { status: 200, body: { name: done.name, state: done.state, said: done.said, why: done.why } };
  }

  // ---- Claude Code status: its hooks tell Bob about the sessions you run yourself ----
  newHookKey() { const k = 'bobhook_' + crypto.randomBytes(24).toString('hex'); this.store.hookHash = hash(k); this.save(); return k; }
  hookOk(key) { if (!this.store.claudeStatus || !this.store.hookHash || !key) return false; const a = Buffer.from(hash(key), 'hex'), b = Buffer.from(this.store.hookHash, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); }
  hook(j = {}) {
    const sid = plain(j.session_id, 100);
    if (!sid) return false;
    const mine = this.store.agents.find((a) => a.kind === 'claude' && a.session === sid);
    if (mine) return true; // one Bob runs: it already shows
    const ev = String(j.hook_event_name || '');
    if (ev === 'SessionEnd') { this.outside.delete(sid); this.changed(); return true; }
    const state = ev === 'UserPromptSubmit' || ev === 'PreToolUse' ? 'working' : ev === 'Notification' ? 'needs-you' : ev === 'Stop' ? 'done' : '';
    if (!state) return true;
    const folder = String(j.cwd || '').slice(0, 500);
    const was = this.outside.get(sid);
    this.outside.set(sid, { id: sid, name: `Claude Code in ${path.basename(folder) || 'a folder'}`, kind: 'claude', folder, state, why: state === 'needs-you' ? plain(j.message, 200) || 'It\'s waiting for you.' : '', at: this.now(), outside: true });
    while (this.outside.size > 20) this.outside.delete(this.outside.keys().next().value);
    if (!was || was.state !== state) this.changed(this.outside.get(sid));
    return true;
  }

  // agent-ask.mjs goes next to Bob's settings, so a program outside Bob's own files can run it (Bob's own files may
  // be packed inside his app). Copied fresh for each run that may hand work on.
  askScript() {
    const to = path.join(this.cfg.dataDir, 'agent-ask.mjs');
    try { fs.writeFileSync(to, fs.readFileSync(ASK_SCRIPT, 'utf8')); } catch {}
    return to;
  }

  // ---- Sign in for an account: opens the program in a window of its own with that account's folder ----
  signInPlan(kind, account) {
    const k = KINDS[kind];
    if (!k || kind === 'custom') throw new Error('Pick which program.');
    const dir = accountDir(this.cfg, kind, account);
    if (!dir) throw new Error('Give the account a name first.');
    const exe = this.find(k.cmd);
    if (!exe) throw new Error(`${k.name} isn't on this computer.`);
    return { exe, args: k.signIn, env: accountEnv(kind, dir, { os_: this.os_ }), dir, name: k.name };
  }
}

// Opens a terminal window running the program's own sign-in with the account's folder (a one-time step).
// Windows: a new console window. Mac: Terminal. Linux: the desktop's terminal (x-terminal-emulator, gnome-terminal,
// konsole or xterm). The folder and program come from Bob, never from what someone typed.
export function openSignIn(plan, { os_ = OS, run = execFile, spawn = nodeSpawn, find = (n) => findOnPath(n) } = {}) {
  fs.mkdirSync(plan.dir, { recursive: true });
  const env = { ...process.env, ...plan.env };
  if (os_ === 'win') {
    const line = [plan.exe, ...plan.args].map((s) => (/\s/.test(s) ? `"${s}"` : s)).join(' ');
    const c = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'start', '"Sign in"', 'cmd', '/k', line], { env, detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
    c.unref?.(); return true;
  }
  const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const exports = Object.entries(plan.env).map(([k, v]) => `export ${k}=${sh(v)}`).join('; ');
  const cmdLine = `${exports}; ${[plan.exe, ...plan.args].map(sh).join(' ')}`;
  if (os_ === 'mac') { run('/usr/bin/osascript', ['-e', `tell application "Terminal" to do script ${JSON.stringify(cmdLine)}`, '-e', 'tell application "Terminal" to activate'], () => {}); return true; }
  const term = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm'].map((t) => ({ t, f: find(t) })).find((x) => x.f);
  if (!term) throw new Error('Bob couldn\'t find a terminal program to sign in with.');
  const args = term.t === 'gnome-terminal' ? ['--', 'bash', '-lc', cmdLine] : ['-e', 'bash', '-lc', cmdLine];
  const c = spawn(term.f, args, { env, detached: true, stdio: 'ignore' }); c.unref?.();
  return true;
}

// ---- Claude Code's settings: the three hooks for Claude Code status ----
export function claudeSettingsFile({ env = process.env, home = os.homedir(), platform = process.platform } = {}) {
  const P = platform === 'win32' ? path.win32 : path.posix;
  return P.join(env.CLAUDE_CONFIG_DIR || P.join(home, '.claude'), 'settings.json');
}
export const HOOK_EVENTS = ['UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'];
const HOOK_MARK = '/api/coding-agents/hook';
// curl is on Windows 10 and later, macOS and Linux. -m 2: Claude Code never waits more than 2 seconds on Bob, and
// Bob answers with nothing (204), so nothing is added to Claude's own words.
export const hookCommand = (port, key) => `curl -s -m 2 -X POST -H "Content-Type: application/json" -H "X-Bob-Hook: ${key}" --data-binary @- http://127.0.0.1:${port}${HOOK_MARK}`;
const isOurs = (h) => typeof h?.command === 'string' && h.command.includes(HOOK_MARK);

export function connectHooks(file, { port, key }) {
  let data = {}, existed = false;
  if (fs.existsSync(file)) {
    existed = true;
    const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    if (raw.trim()) { data = JSON.parse(raw); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a settings file'); }
  }
  const backup = existed ? `${file}.bob-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}` : '';
  if (backup) fs.copyFileSync(file, backup);
  data.hooks = data.hooks && typeof data.hooks === 'object' ? data.hooks : {};
  for (const ev of HOOK_EVENTS) {
    const list = (Array.isArray(data.hooks[ev]) ? data.hooks[ev] : []).map((m) => ({ ...m, hooks: (m.hooks || []).filter((h) => !isOurs(h)) })).filter((m) => m.hooks.length);
    list.push({ hooks: [{ type: 'command', command: hookCommand(port, key), timeout: 5 }] });
    data.hooks[ev] = list;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonAtomic(file, data, 2);
  return { file, backup };
}
export function disconnectHooks(file) {
  if (!fs.existsSync(file)) return { file, backup: '' };
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '') || '{}'); } catch { return { file, backup: '' }; }
  if (!data?.hooks) return { file, backup: '' };
  const backup = `${file}.bob-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  fs.copyFileSync(file, backup);
  for (const ev of Object.keys(data.hooks)) {
    if (!Array.isArray(data.hooks[ev])) continue;
    data.hooks[ev] = data.hooks[ev].map((m) => ({ ...m, hooks: (m.hooks || []).filter((h) => !isOurs(h)) })).filter((m) => m.hooks.length);
    if (!data.hooks[ev].length) delete data.hooks[ev];
  }
  if (!Object.keys(data.hooks).length) delete data.hooks;
  writeJsonAtomic(file, data, 2);
  return { file, backup };
}
export function hooksConnected(file) {
  try { const d = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); return HOOK_EVENTS.every((ev) => (d.hooks?.[ev] || []).some((m) => (m.hooks || []).some(isOurs))); } catch { return false; }
}

// ---- Routes. Settings, adding and removing: this replicant matrix only. Asking, stopping and passing work: also
// through the door (your phone, with the passcode), like the rest of Bob. ----
export async function agentsRoute({ req, res, p, isLocal, agents, body, send, pick, hooksFile = claudeSettingsFile(), openWindow = openSignIn }) {
  if (!p.startsWith('/api/coding-agents')) return false;
  const local = () => { if (!isLocal) { send(res, 403, { error: 'Only on this replicant matrix itself.' }); return false; } return true; };
  try {
    if (p === '/api/coding-agents/hook' && req.method === 'POST') {
      if (!isLocal || !agents.hookOk(String(req.headers['x-bob-hook'] || ''))) { res.writeHead(403); res.end(); return true; }
      agents.hook(await body(req).catch(() => ({})));
      res.writeHead(204); res.end(); return true;
    }
    if (p === '/api/coding-agents/ask' && req.method === 'POST') {
      if (!local()) return true;
      const r = await agents.askFromAgent(await body(req).catch(() => ({})));
      send(res, r.status, r.body); return true;
    }
    if (p === '/api/coding-agents' && req.method === 'GET') { send(res, 200, { ...agents.view(), hooks: hooksConnected(hooksFile) }); return true; }
    if (p === '/api/coding-agents' && req.method === 'POST') {
      if (!local()) return true;
      const b = await body(req);
      if (b.claudeStatus === true) { const key = agents.newHookKey(); agents.store.claudeStatus = true; const r = connectHooks(hooksFile, { port: agents.port(), key }); agents.save(); agents.log('settings', `Claude Code status on (backup ${r.backup || 'none: new file'})`); }
      if (b.claudeStatus === false) { agents.store.claudeStatus = false; agents.store.hookHash = ''; agents.outside.clear(); disconnectHooks(hooksFile); agents.save(); agents.log('settings', 'Claude Code status off'); }
      if (b.pick) { send(res, 200, { folder: await pick() }); return true; }
      if (b.signIn) { openWindow(agents.signInPlan(b.signIn.kind, b.signIn.account)); send(res, 200, { ok: true }); return true; }
      if (b.add) { agents.add(b.add); }
      agents.setSettings(b);
      send(res, 200, { ...agents.view(), hooks: hooksConnected(hooksFile) }); return true;
    }
    const m = p.match(/^\/api\/coding-agents\/([a-f0-9]{12})\/(ask|stop|pass|change|remove)$/);
    if (m && req.method === 'POST') {
      const [, id, what] = m;
      const b = await body(req).catch(() => ({}));
      if ((what === 'change' || what === 'remove') && !local()) return true;
      if (what === 'ask') agents.ask(id, b.text);
      if (what === 'stop') agents.stop(id);
      if (what === 'pass') agents.pass(id, b.to, b.text);
      if (what === 'change') agents.change(id, b);
      if (what === 'remove') agents.remove(id);
      send(res, 200, agents.view()); return true;
    }
    send(res, 404, { error: 'no such page' }); return true;
  } catch (e) { send(res, 409, { error: e.message }); return true; }
}
