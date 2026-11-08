// Save a help bundle (1.5.118): one zip that lets another agent, or a person, work out what's wrong with this Bob
// and get him running again. Settings, This replicant matrix and updates, "Save a help bundle".
//
// Two ways the handoff gets written, and the second never depends on the first:
//   1. If Bob's chat brain is already loaded and idle (never in a Gaming session, and he never loads a brain for
//      this), the brain reads the facts below and adds its own short note: what it thinks is wrong and what to try.
//   2. Everything else is put together without any brain at all, so the bundle still comes out when the engine is
//      broken, no model is downloaded, or the brain is busy. HANDOFF.md tells the reading agent where to start.
//
// What goes in: HANDOFF.md (the file an agent reads first), bob/logbook.md (the last 3,000 lines), bob/errors.md
// (every error and recovery line), bob/settings.json (what's set, with nothing secret), bob/facts.json (version,
// platform, hardware, engines, brains, queue), chats/*.md (the last three chats, 40 messages each).
// Scrubbed before writing: the owner's name and user name, the home folder, passcodes, API keys and bot tokens,
// Tailscale addresses, and the chat text of anything that looks like a key. Nothing is sent anywhere: the zip lands
// where the owner picks, and the folder opens afterwards.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeZip } from './zip.js';
import { settingsNow } from './self-help.js';
import { sessionDir, readChat, said } from './chats.js';
import { currentSession } from './sessions.js';
import { chatBrain } from './brain-mode.js';
import { SETTING_KEYS, VERSION } from './config.js';

export const REPO = 'https://github.com/MouseWurX/Bob';
export const LOG_LINES = 3000;
export const CHATS = 3;
export const CHAT_MESSAGES = 40;
export const BRAIN_SECONDS = 45;

// Keys whose values are never written out, wherever they sit in a settings object.
const SECRET_KEY = /pass(code|word)?|token|secret|api[-_]?key|\bkey$|credential|cookie|auth/i;
// Values that look like a key or token, wherever they appear in text.
const SECRET_VALUE = [
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g, // Telegram bot token
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // OpenAI / Anthropic style keys
  /\bhf_[A-Za-z0-9]{16,}\b/g, // Hugging Face
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, // GitHub
  /\btskey-[A-Za-z0-9_-]{10,}\b/g, // Tailscale
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_.-]{16,}/g
];
const TAILSCALE_IP = /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/g;
const TAILSCALE_HOST = /\b[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\b/gi;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A function that takes the owner out of any text: names, user name, machine name, home folder, passcodes, keys.
export function scrubber(cfg = {}, { env = process.env, home = os.homedir(), host = os.hostname(), user = (() => { try { return os.userInfo().username; } catch { return ''; } })() } = {}) {
  const names = [...new Set([cfg.callMe, cfg.userName, cfg.windowsName, user].map((x) => String(x || '').trim()).filter((x) => x.length >= 2))];
  const secrets = [cfg.remote?.passcode, ...(cfg.share?.borrow?.bobs || []).map((b) => b?.passcode), ...(cfg.telegram?.token ? [cfg.telegram.token] : [])]
    .concat(['BOB_TELEGRAM_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'HF_TOKEN'].map((k) => env[k]))
    .map((x) => String(x || '').trim()).filter((x) => x.length >= 4);
  const homes = [home, home.split(path.sep).join('/'), home.split('/').join('\\')].filter((h) => h && h.length > 3);
  return (text) => {
    let t = String(text ?? '');
    for (const s of secrets) t = t.split(s).join('[hidden]');
    for (const re of SECRET_VALUE) t = t.replace(re, '[hidden]');
    for (const h of [...new Set(homes)]) t = t.split(h).join('<home>');
    for (const n of names) t = t.replace(new RegExp(`(?<![\\w])${esc(n)}(?![\\w])`, 'gi'), 'the owner');
    if (host && host.length >= 3) t = t.replace(new RegExp(`(?<![\\w-])${esc(host)}(?![\\w-])`, 'gi'), 'the replicant matrix');
    t = t.replace(TAILSCALE_IP, '[tailscale address]').replace(TAILSCALE_HOST, '[tailscale name]');
    return t;
  };
}

// A copy of a settings object with every secret-looking key dropped and every string scrubbed.
export function scrubObject(obj, scrub, depth = 0) {
  if (depth > 12) return '[deep]';
  if (Array.isArray(obj)) return obj.map((v) => scrubObject(v, scrub, depth + 1));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = SECRET_KEY.test(k) ? (v == null || v === '' ? v : '[hidden]') : scrubObject(v, scrub, depth + 1);
    return out;
  }
  return typeof obj === 'string' ? scrub(obj) : obj;
}

const tail = (text, n) => { const lines = String(text || '').split(/\r?\n/); return lines.slice(Math.max(0, lines.length - n)).join('\n'); };
const when = (t) => { try { return new Date(t).toISOString().replace('T', ' ').slice(0, 16) + 'Z'; } catch { return ''; } };

// The owner's last chats, newest first: [{ id, file, mtime }].
export function recentChats(cfg, max = CHATS) {
  try {
    const dir = sessionDir(cfg);
    return fs.readdirSync(dir).filter((f) => /^[a-zA-Z0-9-]+\.json$/.test(f) && !/\.(older|summary)\.json$/.test(f))
      .map((f) => ({ id: f.slice(0, -5), file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime).slice(0, max);
  } catch { return []; }
}

// One chat as a plain readout: who said what, when, tool calls and their results in one line each.
export function chatReadout(msgs, scrub, max = CHAT_MESSAGES) {
  const rows = (msgs || []).slice(-max).map((m) => {
    const at = m.at ? ` (${when(m.at)})` : '';
    if (m.role === 'user') return `**The owner${at}:** ${scrub(said(m)).slice(0, 2000)}`;
    if (m.role === 'assistant') {
      const calls = (m.tool_calls || []).map((c) => `[called ${c.function?.name || c.name || 'a tool'}]`).join(' ');
      return `**Bob${at}:** ${[scrub(m.content || '').slice(0, 2000), calls].filter(Boolean).join(' ')}`;
    }
    if (m.role === 'tool') return `*tool result:* ${scrub(m.content || '').replace(/\s+/g, ' ').slice(0, 400)}`;
    if (m.role === 'system') return `*system note:* ${scrub(m.content || '').replace(/\s+/g, ' ').slice(0, 400)}`;
    return '';
  }).filter(Boolean);
  return rows.length ? rows.join('\n\n') : '(empty chat)';
}

// Everything the bundle knows, without a brain. Each lookup is separate and a failed one is written as such.
export async function gatherFacts(cfg, { brain, shop, checkEngine, speedHistory, capabilities } = {}) {
  const facts = { bob: { version: VERSION.label, build: VERSION.build, engine: cfg.engine === 'ollama' ? 'Ollama' : "Bob's own (llama.cpp)", agentDir: cfg.agentDir, innDir: cfg.innDir, appDir: cfg.appDir || '', port: cfg.port, electron: Boolean(globalThis.bobWindow), at: new Date().toISOString() } };
  facts.platform = { os: process.platform, release: os.release(), arch: process.arch, node: process.versions.node, electron: process.versions.electron || null, ramGB: Math.round(os.totalmem() / 1024 ** 3), freeRamGB: Math.round(os.freemem() / 1024 ** 3 * 10) / 10, cpus: os.cpus().length, cpu: os.cpus()[0]?.model || '' };
  const tryGet = async (name, fn) => { try { facts[name] = await fn(); } catch (e) { facts[name] = { failed: e.message }; } };
  await tryGet('hardware', () => shop?.hardware ? shop.hardware() : null);
  await tryGet('engines', () => checkEngine ? Promise.all(['llamacpp', 'sdcpp', 'whispercpp'].map((id) => checkEngine(cfg, id))) : null);
  await tryGet('brain', async () => brain ? { state: brain.state, busy: brain.turns?.size > 0, session: currentSession(cfg), loaded: await brain.engine.loaded(), chatBrain: chatBrain(cfg)?.model || null } : null);
  await tryGet('models', () => ({ ...(cfg.models || {}) }));
  await tryGet('queue', () => brain?.queueView ? brain.queueView().slice(-20).map(({ id, kind, text, state, status, error, at, doneAt }) => ({ id, kind, text, state, status, error, at, doneAt })) : []);
  await tryGet('capabilities', () => capabilities ? capabilities(cfg) : null);
  await tryGet('speed', () => speedHistory ? speedHistory(cfg).slice(-3) : []);
  await tryGet('settingsNow', () => settingsNow(cfg));
  await tryGet('disk', () => { const s = fs.statfsSync(cfg.agentDir); return { freeGB: Math.round((s.bavail * s.bsize) / 1e9) }; });
  return facts;
}

// Only the lines that say something went wrong, or that Bob recovered from something.
export function errorLines(logbook) {
  return String(logbook || '').split(/\r?\n/).filter((l) => /^- .* \| (error|handoff|engine) \| /.test(l) || /couldn't|failed|didn't|broke|dropped out|stopped as it started|not retrying/i.test(l));
}

// The brain's own note, only when the chat brain is already loaded and idle, and never in Gaming. Nothing is loaded
// for this; a brain that isn't there means an empty note and the reason why.
export async function brainNote(brain, cfg, facts, { seconds = BRAIN_SECONDS } = {}) {
  if (!brain) return { text: '', why: 'no brain is running' };
  const s = currentSession(cfg);
  if (s.id === 'light') return { text: '', why: 'Gaming session: Bob leaves the brain alone' }; // 'light' is the Gaming session's id (sessions.js)
  if (brain.turns?.size > 0 || !['idle', 'ready'].includes(brain.state?.state)) return { text: '', why: `Bob is busy (${brain.state?.state || 'unknown'})` };
  const pick = chatBrain(cfg);
  const model = pick?.model;
  if (!model) return { text: '', why: 'no chat brain is set' };
  let loaded = [];
  try { loaded = await brain.engine.loaded(); } catch (e) { return { text: '', why: `the engine didn't answer (${e.message})` }; }
  const names = loaded.map((m) => (typeof m === 'string' ? m : m?.model || m?.name || m?.id || '')).filter(Boolean);
  if (!names.some((n) => n === model || n.startsWith(model) || model.startsWith(n))) return { text: '', why: `the chat brain (${model}) isn't loaded, and Bob doesn't load one for this` };
  const brief = JSON.stringify({ bob: facts.bob, platform: facts.platform, engines: facts.engines, brain: facts.brain, errors: (facts.errorTail || []).slice(-30) }, null, 1).slice(0, 12000);
  const messages = [
    { role: 'system', content: 'You are Bob, writing a short diagnostic note about your own installation for another AI agent who will fix it. Plain sentences, no headings, no jokes. Under 200 words. Do not invent facts; if the facts are not enough, say what to check first.' },
    { role: 'user', content: `Here are the facts about this installation of you, including recent error lines from your logbook:\n\n${brief}\n\nWrite: 1) what you think is wrong, 2) what the agent should check or try first, 3) anything that looks fine and can be skipped.` }
  ];
  // The time limit is enforced here too, so an engine that ignores the signal still can't hold the bundle up.
  const stop = new AbortController();
  let timer;
  const timeUp = new Promise((_, reject) => { timer = setTimeout(() => { stop.abort(); reject(new Error('timed out')); }, seconds * 1000); });
  try {
    const reply = await Promise.race([brain.engine.chat({ model, messages, think: false, signal: stop.signal, cpu: pick.cpu === true, ctx: pick.ctx }), timeUp]);
    const text = String(reply?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return text ? { text, model } : { text: '', why: 'the brain answered with nothing' };
  } catch (e) { return { text: '', why: `the brain didn't answer in ${seconds} seconds (${e.message})` }; }
  finally { clearTimeout(timer); }
}

const ok = (v) => (v ? 'yes' : 'no');
// The file an agent reads first. Everything in it is already scrubbed by the caller.
export function handoffText(facts, { note, errors = [], chats = [] } = {}) {
  const b = facts.bob || {}, p = facts.platform || {}, hw = facts.hardware || {}, br = facts.brain || {};
  const eng = Array.isArray(facts.engines) ? facts.engines.map((e) => `- ${e.id}: ${e.ok ? 'starts' : `does not start (${e.why})`}`).join('\n') : '- (engine check not run)';
  const models = Object.entries(facts.models || {}).map(([slot, m]) => `- ${slot}: ${m || '(none)'}`).join('\n') || '- (no brains set)';
  const queue = (facts.queue || []).filter((j) => j.state !== 'done').map((j) => `- ${j.status || j.state}: ${j.text}${j.error ? ` (error: ${j.error})` : ''}`).join('\n');
  return `# Help bundle from a Bob installation

This zip was saved by the owner from Bob's Settings ("Save a help bundle"). It is for an AI agent, or a person, who is helping the owner get this Bob working. Nothing in it was sent anywhere by Bob; the owner chose to share it.

**Bob** is a local AI assistant: an Electron app with a Node.js server (src/server.js) that runs language, picture, hearing and voice models on the owner's own computer, through llama.cpp or Ollama. The code is public: ${REPO} (GPL-3.0-or-later). Read the repository at the version below first, then this bundle, then help the owner.

## Where to start, agent
1. Clone or read ${REPO} and check out the tag for Bob ${b.version} (build ${b.build}). docs/USER-GUIDE.md explains what the owner sees; src/server.js is the entry point; src/brain.js runs chats and jobs; src/llamacpp.js and src/ollama.js are the engines; src/models.js downloads and places models; public/ is the window.
2. Read bob/errors.md (every error and recovery line, newest last) and the end of bob/logbook.md. The logbook format is \`- time | kind | what happened\`.
3. Compare bob/facts.json and bob/settings.json with what the code expects for this platform (${p.os}, ${p.arch}).
4. Read chats/ to see what the owner was doing and what Bob answered.
5. Tell the owner in plain steps, with no jargon, what to click or change. The owner is not a programmer and prefers windows and buttons to a terminal. Fixes that take a command line should be given as one copy-and-paste line with a sentence saying what it does.
6. Bob's own Help (public/help-content.js) names every setting as it appears on screen; use those exact names.

## This Bob
- Bob ${b.version} (build ${b.build}), engine: ${b.engine}, running in ${b.electron ? 'Bob.exe (Electron)' : 'a plain Node process'}, port ${b.port}
- Platform: ${p.os} ${p.release} (${p.arch}), Node ${p.node}${p.electron ? `, Electron ${p.electron}` : ''}
- Processor: ${p.cpu || 'unknown'} (${p.cpus} threads), RAM ${p.ramGB} GB (${p.freeRamGB} GB free when saved)
- Graphics: ${hw.gpu ? `${hw.gpu.name}, about ${hw.gpu.vramGB} GB${hw.gpu.unified ? ' (shared with the processor)' : hw.gpu.integrated ? ' (built-in, shared memory)' : ''}` : 'none detected'}
- Free disk where Bob keeps his models: ${facts.disk?.freeGB ?? hw.freeGB ?? '?'} GB
- Bob's folder: ${b.agentDir}; his data folder (settings, chats, logbook): ${b.innDir}
- Saved at ${b.at}

## Engines (do they start?)
${eng}

## Brains (model per job slot)
${models}
- Brain state when saved: ${br.state?.state || 'unknown'}${br.state?.detail ? ` (${br.state.detail})` : ''}; busy: ${ok(br.busy)}; session: ${br.session?.label || br.session?.id || 'unknown'}
- Loaded in the engine when saved: ${Array.isArray(br.loaded) && br.loaded.length ? br.loaded.map((m) => (typeof m === 'string' ? m : m?.model || m?.name || JSON.stringify(m))).join(', ') : 'nothing'}

## Unfinished or failed jobs
${queue || '- none'}

## Last errors (${errors.length} lines in bob/errors.md)
${errors.slice(-15).map((l) => l).join('\n') || '- none recorded'}

## What is set right now
${facts.settingsNow && typeof facts.settingsNow === 'string' ? facts.settingsNow.split('\n').map((l) => `- ${l}`).join('\n') : '- (not available)'}

## What Bob himself thinks
${note?.text ? `Written by Bob's own brain (${note.model}) when the bundle was saved:\n\n${note.text}` : `Bob's brain could not write its own note: ${note?.why || 'not tried'}. This bundle was put together automatically instead, so assume the worst: the engine or the brain may not be working at all. Start with the Engines section and bob/errors.md.`}

## What is in this zip
- HANDOFF.md: this file
- bob/errors.md: every error and recovery line from the logbook
- bob/logbook.md: the last ${LOG_LINES} lines of Bob's logbook
- bob/settings.json: the owner's settings, with every passcode, key and token removed
- bob/facts.json: everything above as data (hardware, engines, brains, queue, capabilities, last speed tests)
- chats/: the last ${chats.length} chat${chats.length === 1 ? '' : 's'} (${CHAT_MESSAGES} messages each)${chats.length ? `: ${chats.join(', ')}` : ''}

Scrubbed before saving: the owner's name and user name, the home folder, the machine name, passcodes, API keys, bot tokens and Tailscale addresses. If something personal slipped through, it is a bug: please report it at ${REPO}/issues.
`;
}

// Shows a file in its folder: Bob.exe's shell, else Explorer on Windows; elsewhere nothing (the path is shown instead).
export function revealFile(file, { shell = globalThis.bobShell, platform = process.platform, spawnImpl = spawn } = {}) {
  try {
    if (shell?.showItemInFolder) { shell.showItemInFolder(file); return true; }
    if (platform === 'win32') { spawnImpl(path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'), [`/select,${file}`], { detached: true, stdio: 'ignore', windowsHide: false }).unref(); return true; }
    if (platform === 'darwin') { spawnImpl('/usr/bin/open', ['-R', file], { detached: true, stdio: 'ignore' }).unref(); return true; }
    if (platform === 'linux') { spawnImpl('xdg-open', [path.dirname(file)], { detached: true, stdio: 'ignore' }).unref(); return true; }
  } catch {}
  return false;
}

export const bundleName = (d = new Date()) => `bob-help-bundle-${d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}.zip`;

// Puts the whole bundle together in memory: { entries (for writeZip), facts, note, summary }.
export async function buildBundle(cfg, deps = {}) {
  const scrub = scrubber(cfg, deps.scrubOpts);
  const facts = await gatherFacts(cfg, deps);
  let logbook = '';
  try { logbook = fs.readFileSync(cfg.logbook, 'utf8'); } catch {}
  const errors = errorLines(logbook).map(scrub);
  facts.errorTail = errors.slice(-30);
  const note = deps.brainNote === false ? { text: '', why: 'not asked' } : await brainNote(deps.brain, cfg, facts, deps.brainOpts);
  delete facts.errorTail;
  const now = new Date();
  const chats = recentChats(cfg).map((c) => ({ name: `chats/${c.id}.md`, text: `# Chat "${c.id}" (last ${CHAT_MESSAGES} messages, saved ${when(c.mtime)})\n\n${chatReadout(readChat(cfg, c.id), scrub)}\n` }));
  const settings = scrubObject(Object.fromEntries(SETTING_KEYS.filter((k) => k in cfg).map((k) => [k, cfg[k]])), scrub);
  const files = [
    { name: 'HANDOFF.md', text: scrub(handoffText(facts, { note: note.text ? { ...note, text: scrub(note.text) } : note, errors, chats: chats.map((c) => c.name.slice(6)) })) },
    { name: 'bob/errors.md', text: `# Errors and recoveries from Bob's logbook\n\n${errors.join('\n') || '(none)'}\n` },
    { name: 'bob/logbook.md', text: scrub(tail(logbook, LOG_LINES)) || '(no logbook yet)\n' },
    { name: 'bob/settings.json', text: JSON.stringify(settings, null, 2) },
    { name: 'bob/facts.json', text: scrub(JSON.stringify(scrubObject(facts, scrub), null, 2)) },
    ...chats,
    // 1.5.133: the engine's whole output from the last load that fell over (main and second brain), when there is one.
    ...['', '-beside'].map((tag) => { try { return { name: `bob/llama-server${tag}-load-failed.txt`, text: scrub(tail(fs.readFileSync(path.join(cfg.dataDir || '', `llama-server${tag}-load-failed.txt`), 'utf8'), 2000)) }; } catch { return null; } }).filter(Boolean)
  ];
  const entries = files.map((f) => { const data = Buffer.from(f.text, 'utf8'); return { name: f.name, data, size: data.length, mtime: now }; });
  return { entries, facts, note, chats: chats.length, errors: errors.length };
}

// Builds and writes the zip into `folder` (made if missing). Returns { ok, file, folder, note, parts }.
export async function saveHelpBundle(cfg, folder, deps = {}) {
  const b = await buildBundle(cfg, deps);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, bundleName(deps.now || new Date()));
  writeZip(file, b.entries);
  return { ok: true, file, folder, brainNote: Boolean(b.note.text), why: b.note.text ? '' : b.note.why, parts: b.entries.length, chats: b.chats, errors: b.errors };
}

// The same bundle as bytes (for the phone, which saves it itself): writes to a temporary file and reads it back.
export async function bundleBytes(cfg, deps = {}) {
  const b = await buildBundle(cfg, deps);
  const tmp = path.join(os.tmpdir(), `bob-help-${process.pid}-${Date.now()}.zip`);
  try { writeZip(tmp, b.entries); return { data: fs.readFileSync(tmp), name: bundleName(deps.now || new Date()), brainNote: Boolean(b.note.text) }; }
  finally { try { fs.rmSync(tmp, { force: true }); } catch {} }
}
