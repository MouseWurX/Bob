// "Make his own tools" (1.5.48, a Hand, off by default). When Bob has no tool for a job, he can write a small one
// himself. Before it is added it has to pass, in this order:
//   1. plain checks, no model: a short name, plain JavaScript using only Node's own built-in parts, nothing that
//      starts programs, hides code, or reaches the internet unless the card says so, the Run Hand's blocklist,
//      only folders ticked for Hands, and every download pinned (exact address, size and sha256);
//   2. a test run in the sandbox with a sample input;
//   3. a read by the reviewer (the Review slot brain), every time, whatever the Effort;
//   4. the person's OK on one card (skipped only with "Let Bob work without asking"; 1-3 still have to pass).
// The sandbox: Bob's own Node (his program, run as Node) with Node's permission switch on. The tool can read its own
// folder and the folders on its card, write its work folder and the folders on its card, and nothing else. It can't
// start programs, workers or add-ons. The environment is empty (no keys), there's no input to wait on, a time limit
// and a memory cap, and it never runs as administrator. The internet: when this Node can switch it off (--allow-net),
// it's off unless the card said yes; otherwise the plain checks and the reviewer look for it, which isn't airtight,
// and Help says so.
//
// What's approved lives in Bob's own settings folder (selftools.json: the sha256 of every file), which no Hand or
// tool can write. If a tool's files change after the OK, it's turned off until it goes through the checks again.
// Tools are listed in Settings (🧰 Tools and how-tos Bob made: show code, delete; Hands: turn off, show code) and Bob
// can list them too. 1.5.144: Delete puts a tool on the shelf (Recently deleted) for 30 days, off and out of Bob's
// reach, with Put back and Delete for good; after 30 days (or Delete for good) its folder goes to the Recycle Bin.
// Light: nothing runs in the background, the tools aren't in Bob's prompt until a job needs them (toolbox.js), and the
// reviewer brain loads only while a tool is being made.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { insideAny, isInside, appDir } from './config.js';
import { isSensitive } from './tools.js';
import { handOn, handOffWhy, readOnlyRoots, limitOn } from './hands-settings.js';
import { handsRoots } from './hands-files.js';
import { textProblem, killTree } from './hands-run.js';
import { recycle } from './recycle.js';
import { reviewBrain } from './moot.js';
import { copyName } from './clan.js';
import { toolLearnOn, loadLearning, learnedLine } from './tool-learn.js';

const WIN = process.platform === 'win32';
export const MAX_TOOLS = 30;
export const KEEP_DELETED_MS = 30 * 24 * 60 * 60_000;
const MAX_CODE = 200_000;
const MAX_DOWNLOAD = 200 * 1024 * 1024;
const MAX_DOWNLOADS_TOTAL = 500 * 1024 * 1024;
const NAME_RX = /^[a-z][a-z0-9_]{2,30}$/;
export const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'selftools-runner.mjs');

export const toolsDir = (cfg) => path.join(cfg.innDir, 'tools');
export const draftDir = (cfg, name) => path.join(toolsDir(cfg), '_drafts', name);
export const toolDir = (cfg, name) => path.join(toolsDir(cfg), name);
const approvedFile = (cfg) => path.join(cfg.dataDir, 'selftools.json');
const off = (cfg) => { if (!handOn(cfg, 'maker')) throw new Error(handOffWhy(cfg, 'maker')); };
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// ---------------------------------------------------------------- what's approved (Bob's own settings folder)

export function loadApproved(cfg) {
  try { const j = JSON.parse(fs.readFileSync(approvedFile(cfg), 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; }
}
function saveApproved(cfg, all) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  fs.writeFileSync(approvedFile(cfg), JSON.stringify(all, null, 1));
}

// Every file in a tool's folder that counts (not its work folder), with its sha256.
function hashFiles(dir) {
  const out = {};
  const walk = (d, rel = '') => {
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (!rel && e.name === 'work') continue;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (e.isFile()) out[r] = sha(fs.readFileSync(path.join(d, e.name)));
    }
  };
  walk(dir);
  return out;
}
const sameHashes = (a = {}, b = {}) => { const ka = Object.keys(a).sort(), kb2 = Object.keys(b).sort(); return ka.length === kb2.length && ka.every((k, i) => k === kb2[i] && a[k] === b[k]); };

function readSpec(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'tool.json'), 'utf8')); } catch { return null; }
}

// The tools Bob made, as the list shows them. state: on, off (turned off), changed (files changed since the OK),
// missing (its folder is gone).
// The live tools (not the deleted ones on the shelf); { deleted: true } lists the shelf instead.
export function listTools(cfg, { deleted = false } = {}) {
  const approved = loadApproved(cfg);
  return Object.entries(approved).filter(([, a]) => Boolean(a.deleted) === deleted).map(([name, a]) => {
    const dir = toolDir(cfg, name);
    const spec = readSpec(dir);
    let state = a.on === false ? 'off' : 'on';
    if (!spec || !fs.existsSync(path.join(dir, 'tool.mjs'))) state = 'missing';
    else if (!sameHashes(hashFiles(dir), a.hashes)) state = 'changed';
    let bytes = 0;
    try { for (const f of Object.keys(a.hashes || {})) bytes += fs.statSync(path.join(dir, f)).size; } catch {}
    return { name, what: spec?.what || a.what || '', when: spec?.when || '', example: spec?.test || null, inputs: spec?.inputs || {}, reads: a.reads || [], writes: a.writes || [], internet: Boolean(a.internet), downloads: (a.downloads || []).length, at: a.at, lastUsed: a.lastUsed || 0, bytes, state, dir, ...(a.deleted ? { deleted: a.deleted, goneAt: a.deleted + KEEP_DELETED_MS } : {}) };
  }).sort((x, y) => x.name.localeCompare(y.name));
}
export const usableTools = (cfg) => listTools(cfg).filter((t) => t.state === 'on');

// ---------------------------------------------------------------- the plain checks (no model)

// Built-in parts of Node a tool may use. The network ones only when the card says it uses the internet.
const BUILTINS = new Set(['fs', 'fs/promises', 'path', 'path/posix', 'path/win32', 'url', 'crypto', 'zlib', 'util', 'stream', 'stream/promises', 'stream/web', 'buffer', 'events', 'string_decoder', 'os', 'querystring', 'assert', 'assert/strict', 'timers', 'timers/promises', 'readline', 'punycode']);
const NET_BUILTINS = new Set(['http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns', 'dns/promises']);
const NEVER = [
  [/\bchild_process\b/, 'starts other programs'],
  [/\bworker_threads\b|\bnode:cluster\b|['"]cluster['"]/, 'starts hidden workers'],
  [/['"](?:node:)?(?:vm|inspector|inspector\/promises|module|repl|v8|wasi|trace_events|async_hooks|diagnostics_channel)['"]/, 'reaches into Node itself'],
  [/process\s*\.\s*(?:binding|_linkedBinding|dlopen|kill|chdir|setuid|setgid|seteuid|setegid|setgroups|permission|mainModule)\b/, 'reaches into the program running it'],
  [/\beval\s*\(/, 'runs hidden code (eval)'],
  [/\bnew\s+Function\b|(?<![\w.$])Function\s*\(|\bconstructor\s*\.\s*constructor\b|\[\s*['"`]constructor['"`]\s*\]/, 'makes code out of text'],
  [/\brequire\s*\(|\bcreateRequire\b/, 'uses require (a tool is a plain module that uses import)'],
  [/\bimport\s*\(/, 'loads more code while it runs'],
  [/\bimport\.meta\.resolve\b/, 'looks for code to load'],
  [/\bWebAssembly\b/, 'runs WebAssembly'],
  [/\bsetTimeout\s*\(\s*['"`]|\bsetInterval\s*\(\s*['"`]/, 'runs code out of text']
];
const NET_TEXT = /\bfetch\s*\(|\bWebSocket\b|\bXMLHttpRequest\b|\bEventSource\b|\bundici\b|\bsendBeacon\b/;
// With "Don't send anything out" on, an internet tool may only fetch (read), never send.
const SEND_TEXT = /\bmethod\s*:\s*['"`](?:POST|PUT|PATCH|DELETE)\b|\bbody\s*:|\.write\s*\(|\bFormData\b|\bupload/i;

function importsOf(code) {
  const out = [];
  for (const re of [/\bimport\s+(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g, /\bexport\s+[\w*{}\s,$]+?\s+from\s+['"]([^'"]+)['"]/g]) {
    for (const m of code.matchAll(re)) out.push(m[1]);
  }
  return out;
}

// Problems with the code itself, in plain words for Bob to fix ([] = none).
export function codeProblems(cfg, code, spec = {}) {
  const p = [];
  if (typeof code !== 'string' || !code.trim()) return ['There is no code.'];
  if (code.length > MAX_CODE) p.push(`The code is too long (${kb(code.length)}; up to ${kb(MAX_CODE)}).`);
  if (code.includes('\0')) p.push('The code has a hidden null character.');
  if (!/\bexport\s+(?:async\s+)?function\s+run\s*\(|\bexport\s+(?:const|let)\s+run\s*=|\bexport\s+default\b/.test(code)) p.push('It needs "export async function run(input)".');
  for (const spec2 of importsOf(code)) {
    const bare = spec2.replace(/^node:/, '');
    if (BUILTINS.has(bare)) continue;
    if (NET_BUILTINS.has(bare)) { if (!spec.internet) p.push(`It uses ${spec2}, which reaches the internet, but the card says it doesn't.`); continue; }
    p.push(`It uses "${spec2}". A tool can only use Node's own built-in parts (fs, path, crypto, zlib...), not packages or other files.`);
  }
  for (const [re, why] of NEVER) if (re.test(code)) p.push(`It ${why}, which a tool may never do.`);
  if (!spec.internet && NET_TEXT.test(code)) p.push('It reaches the internet, but the card says it doesn\'t. Set internet to true if it really needs to.');
  if (spec.internet && limitOn(cfg, 'sendOut') && SEND_TEXT.test(code)) p.push('It looks like it sends things out, and "Don\'t send anything out" is on: an internet tool may only fetch pages and files.');
  const bad = textProblem(code, cfg);
  if (bad) p.push(`It ${bad}.`);
  // Bob's own folders, by name in the code (the sandbox refuses them anyway).
  for (const d of [cfg.dataDir, appDir, cfg.settingsFile].filter(Boolean)) {
    const forms = [d, d.replace(/\\/g, '/'), d.replace(/\\/g, '\\\\')];
    if (forms.some((f) => f.length > 3 && code.includes(f))) { p.push('It names Bob\'s own folders, which tools can\'t touch.'); break; }
  }
  return [...new Set(p)];
}

// Is this download pinned to one exact file? '' = yes.
export function pinProblem(d) {
  if (!d || typeof d !== 'object') return 'A download needs url, sha256, bytes and file.';
  let u;
  try { u = new URL(String(d.url || '')); } catch { return `"${d.url}" isn't a web address.`; }
  if (u.protocol !== 'https:') return `${d.url} isn't https.`;
  if (u.username || u.password) return `${d.url} has a name or password in it.`;
  if (!/^[0-9a-f]{64}$/.test(String(d.sha256 || '').toLowerCase())) return `${d.url} needs its sha256 (64 letters and numbers), so I can check it's exactly the file.`;
  if (!Number.isInteger(d.bytes) || d.bytes < 1 || d.bytes > MAX_DOWNLOAD) return `${d.url} needs its exact size in bytes (up to ${kb(MAX_DOWNLOAD)}).`;
  if (!/^[\w][\w.-]{0,79}$/.test(String(d.file || '')) || /\.\./.test(d.file)) return `"${d.file}" isn't a plain file name.`;
  const p = u.pathname;
  if (/\/(?:latest|main|master|HEAD|nightly|trunk)(?:\/|$)/i.test(p) || /[?&](?:ref|branch|version)=(?:latest|main|master)/i.test(u.search)) return `${d.url} points at whatever is newest, not one exact version. Use the address of one release or commit.`;
  const host = u.hostname.toLowerCase();
  if ((host === 'huggingface.co' || host.endsWith('.huggingface.co')) && !/\/resolve\/[0-9a-f]{40}\//.test(p)) return `${d.url}: Hugging Face links must use an exact commit (/resolve/<40-character commit>/).`;
  if (host === 'github.com' && !/\/releases\/download\/[^/]+\/[^/]+$/.test(p) && !/\/raw\/[0-9a-f]{40}\//.test(p)) return `${d.url}: GitHub links must be a release file (/releases/download/<tag>/<file>) or an exact commit.`;
  if (host === 'raw.githubusercontent.com' && !/^\/[^/]+\/[^/]+\/[0-9a-f]{40}\//.test(p)) return `${d.url}: raw GitHub links must use an exact commit.`;
  if ((host === 'cdn.jsdelivr.net' || host === 'unpkg.com') && !/@\d+\.\d+\.\d+(?:[-+][\w.]+)?\//.test(p)) return `${d.url}: package links must name one exact version (name@1.2.3).`;
  return '';
}

const isAbs = (p) => typeof p === 'string' && p.length < 400 && !p.includes('\0') && (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/'));
const asObj = (v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return v; };

// The card's details, cleaned: { spec, problems }. Folders must be ones ticked for Hands, never secret, never Bob's own.
export function cleanSpec(cfg, a = {}) {
  const problems = [];
  const name = String(a.name || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!NAME_RX.test(name)) problems.push('The name must be 3 to 31 lower-case letters, numbers or _, starting with a letter (like csv_to_json).');
  const what = String(a.what || '').replace(/\s+/g, ' ').trim();
  if (what.length < 10 || what.length > 300) problems.push('Say in one plain line (10 to 300 characters) what the tool does.');
  const inputs = {};
  const rawIn = asObj(a.inputs) || {};
  if (typeof rawIn !== 'object' || Array.isArray(rawIn)) problems.push('inputs must be an object like { "text": { "type": "string", "description": "..." } }.');
  else {
    for (const [k, v] of Object.entries(rawIn).slice(0, 10)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(k)) { problems.push(`"${k}" isn't a plain input name.`); continue; }
      const type = ['string', 'number', 'integer', 'boolean'].includes(v?.type) ? v.type : 'string';
      inputs[k] = { type, description: String(v?.description || k).slice(0, 200) };
    }
    if (Object.keys(rawIn).length > 10) problems.push('Up to 10 inputs.');
  }
  const roots = handsRoots(cfg);
  const own = [appDir, cfg.dataDir, toolsDir(cfg)].filter(Boolean);
  const folders = (list, write) => [...new Set([].concat(list || []).filter((f) => f !== '' && f != null).map(String))].slice(0, 6).map((f) => {
    if (!isAbs(f)) { problems.push(`"${f}" isn't a full folder path.`); return null; }
    const r = path.resolve(f);
    if (isSensitive(cfg, r)) { problems.push(`${r} holds keys or passwords, so it stays off-limits.`); return null; }
    if (insideAny(own, r) || own.some((o) => isInside(r, o))) { problems.push(`${r} is (or holds) Bob's own folders, which tools can't touch.`); return null; }
    if (write && insideAny(readOnlyRoots(cfg), r)) { problems.push(`${r} is read-only for Bob.`); return null; }
    if (!insideAny(roots, r)) { problems.push(`${r} isn't one of the folders ticked for Hands (Settings, Show advanced settings, Hands). Ask ${cfg.userName || 'the user'} to tick it first.`); return null; }
    return r;
  }).filter(Boolean);
  const reads = folders(a.reads, false), writes = folders(a.writes, true);
  const internet = a.internet === true || a.internet === 'true';
  const downloads = [];
  const rawDl = asObj(a.downloads) || [];
  if (!Array.isArray(rawDl)) problems.push('downloads must be a list.');
  else {
    let total = 0;
    for (const d of rawDl.slice(0, 5)) {
      const why = pinProblem({ ...d, bytes: Number(d?.bytes), sha256: String(d?.sha256 || '').toLowerCase() });
      if (why) { problems.push(why); continue; }
      total += Number(d.bytes);
      downloads.push({ url: String(d.url), sha256: String(d.sha256).toLowerCase(), bytes: Number(d.bytes), file: String(d.file) });
    }
    if (rawDl.length > 5) problems.push('Up to 5 downloads.');
    if (total > MAX_DOWNLOADS_TOTAL) problems.push(`The downloads add up to ${kb(total)}; up to ${kb(MAX_DOWNLOADS_TOTAL)}.`);
    if (new Set(downloads.map((d) => d.file.toLowerCase())).size !== downloads.length) problems.push('Two downloads have the same file name.');
  }
  const test = asObj(a.test);
  if (!test || typeof test !== 'object' || Array.isArray(test)) problems.push('test must be a sample input (an object), so the tool can be tried before it is added.');
  // Nov 11: "use me when", so Bob (and the list) knows when the tool fits. Older tools have none.
  const when = String(a.when || '').replace(/\s+/g, ' ').trim().replace(/^(?:use (?:it|me|this)\s+)?when\s+/i, '').slice(0, 200);
  const timeoutSec = Math.min(300, Math.max(5, Math.round(Number(a.timeoutSec) || 60)));
  return { spec: { name, what, inputs, reads, writes, internet, downloads, test: test || {}, timeoutSec, ...(when ? { when } : {}) }, problems };
}

// ---------------------------------------------------------------- the sandbox

// Can this Node switch the internet off by itself? (Node's --allow-net; not in every version.)
export const netGuard = () => { try { return process.allowedNodeEnvironmentFlags.has('--allow-net'); } catch { return false; } };

// How to start Bob's own program as plain Node: node itself, or Bob (Electron) with ELECTRON_RUN_AS_NODE.
export function nodeCmd() {
  const env = {};
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  return { file: process.execPath, env };
}

// The environment a tool gets: nearly nothing. No keys, no PATH, temp files in its own work folder.
function sandboxEnv(work) {
  const env = { TEMP: work, TMP: work, TMPDIR: work, HOME: work, NODE_OPTIONS: '', NODE_PATH: '' };
  if (WIN) for (const k of ['SystemRoot', 'windir', 'SystemDrive']) if (process.env[k]) env[k] = process.env[k];
  return env;
}

// Runs a tool's code in the sandbox. dir = the tool's folder (tool.mjs, files\, work\). Resolves
// { ok, out, error, blocked, timedOut, log } and never throws for the tool's own failure.
export function runSandboxed({ dir, input = {}, reads = [], writes = [], internet = false, timeoutSec = 60, signal } = {}) {
  // Real paths only: on a Mac the temp folder (/var/folders/...) goes through the link /var -> /private/var, and
  // following that link to load the tool is itself a read the sandbox refuses (it stopped "FileSystemRead: /var").
  const real = (f) => { try { return fs.realpathSync(f); } catch { return f; } };
  // A tool may still be handed a path through the link (a test file under /var/...), so its folders are allowed both ways.
  const both = (list) => [...new Set(list.flatMap((f) => [f, real(f)]))];
  dir = real(dir); reads = both(reads); writes = both(writes);
  return new Promise((resolve) => {
    const work = path.join(dir, 'work');
    fs.mkdirSync(work, { recursive: true });
    const id = crypto.randomUUID().slice(0, 8);
    const inFile = path.join(work, `.in-${id}.json`), outFile = path.join(work, `.out-${id}.json`);
    fs.writeFileSync(inFile, JSON.stringify(input ?? {}));
    const { file, env } = nodeCmd();
    const runner = real(RUNNER);
    const args = ['--permission', `--allow-fs-read=${runner}`, `--allow-fs-read=${dir}`, ...[...reads, ...writes].map((f) => `--allow-fs-read=${f}`),
      `--allow-fs-write=${work}`, ...writes.map((f) => `--allow-fs-write=${f}`), '--max-old-space-size=512', '--disable-proto=throw'];
    if (internet && netGuard()) args.push('--allow-net');
    args.push(runner, path.join(dir, 'tool.mjs'), inFile, outFile, internet ? '1' : '0');
    let log = '', timedOut = false, done = false, child;
    const finish = (r) => {
      if (done) return; done = true;
      clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort);
      let ans = null;
      try { ans = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch {}
      for (const f of [inFile, outFile]) { try { fs.rmSync(f, { force: true }); } catch {} }
      if (ans) return resolve({ ...ans, log: log.slice(-4000), timedOut });
      resolve({ ok: false, error: r || (timedOut ? `It ran past its ${timeoutSec}-second limit and was stopped.` : (log.trim().split('\n').slice(-3).join(' ') || 'It stopped without an answer.').slice(0, 600)), log: log.slice(-4000), timedOut });
    };
    try {
      child = spawn(file, args, { cwd: work, env: { ...sandboxEnv(work), ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: !WIN, shell: false });
    } catch (e) { return finish(`It couldn't start: ${e.message}`); }
    const keep = (d) => { log += d; if (log.length > 40000) log = log.slice(-20000); };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', keep); child.stderr.on('data', keep);
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutSec * 1000);
    const onAbort = () => { killTree(child); finish('Stopped.'); };
    if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    child.on('error', (e) => finish(`It couldn't start: ${e.message}`));
    child.on('close', () => finish(''));
  });
}

// Does the sandbox really hold on this PC? A tiny probe tries to read a file outside its folder and to start a
// program; both must be refused. Asked once per run of Bob. If it doesn't hold, self-made tools stay off.
let probed = null;
export async function sandboxHolds(cfg, { fresh = false } = {}) {
  if (probed && !fresh) return probed;
  if (!probed) clearDrafts(cfg);
  const base = path.join(toolsDir(cfg), '_probe');
  const dir = path.join(base, 'tool'), outside = path.join(base, 'outside.txt');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outside, 'outside');
    fs.writeFileSync(path.join(dir, 'tool.mjs'), `import fs from 'node:fs';
export async function run() {
  const r = {};
  try { fs.readFileSync(${JSON.stringify(outside)}, 'utf8'); r.read = 'leaked'; } catch (e) { r.read = e.code === 'ERR_ACCESS_DENIED' ? 'held' : 'other:' + e.code; }
  try { const cp = await import('node:child_process'); cp.spawnSync(process.execPath, ['-v']); r.spawn = 'leaked'; } catch (e) { r.spawn = e.code === 'ERR_ACCESS_DENIED' ? 'held' : 'other:' + e.code; }
  return r;
}`);
    const res = await runSandboxed({ dir, input: {}, timeoutSec: 30 });
    let r = {};
    try { r = JSON.parse(res.out || '{}'); } catch {}
    probed = r.read === 'held' && r.spawn === 'held'
      ? { ok: true, net: netGuard(), at: Date.now() }
      : { ok: false, at: Date.now(), why: res.ok ? `the probe ${r.read !== 'held' ? 'could read a file outside its folder' : 'could start a program'}` : `the probe didn't run (${res.error || 'no answer'})` };
  } catch (e) { probed = { ok: false, why: e.message }; }
  try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  return probed;
}
export const resetProbe = () => { probed = null; };

// ---------------------------------------------------------------- the reviewer

const REVIEW_SYSTEM = `You check a small JavaScript tool that an assistant wrote for itself before it may be added. Be strict but fair.
Answer PASS only if ALL of these hold: the code does what its description says and nothing else; it only touches the folders it lists (plus its own work folder and files folder); it doesn't use the internet unless "internet: yes"; it doesn't collect, hide, send or delete the person's things beyond what the description says; it doesn't try to get round a sandbox, start programs, load code at run time or hide what it does; and it handles bad input without crashing badly.
Reply with PASS or FAIL as the very first word, then at most 6 short lines of reasons. Nothing else.`;

export async function reviewTool(brain, spec, code, test, ctx = {}) {
  const rb = reviewBrain(brain.cfg);
  if (!rb) return { ok: false, text: 'No brain is set to check it (Equip Bob: the Review slot, Deep thinking or the main Brain).' };
  const who = copyName(brain.cfg, 'reviewer', 'second look');
  // Clear in the chat: it's a moot, said in so many words, not "spinning up a copy".
  ctx.emit?.({ type: 'announce', text: `🛰 Bob calls a moot in The Idle Process: ${who} reads the new tool ${spec.name} (on ${rb.model}) before it can be added.` });
  const user = `Tool name: ${spec.name}\nWhat it says it does: ${spec.what}\nInputs: ${JSON.stringify(spec.inputs)}\nFolders it may read: ${spec.reads.join('; ') || 'none'}\nFolders it may change: ${spec.writes.join('; ') || 'none'}\nInternet: ${spec.internet ? 'yes' : 'no'}\nDownloads: ${spec.downloads.map((d) => `${d.file} from ${d.url}`).join('; ') || 'none'}\nTest input: ${JSON.stringify(spec.test).slice(0, 1000)}\nTest result: ${test ? (test.ok ? `worked: ${String(test.out).slice(0, 1200)}` : `failed: ${test.error}`) : 'not run yet (it needs its downloads first)'}\n\nThe code (tool.mjs):\n\`\`\`js\n${code}\n\`\`\``;
  try {
    const model = (await brain.ensureModel(rb.model, ctx.emit || (() => {}), ctx.signal, 'reviewer', { cpu: false, what: `the new tool ${spec.name}` })) || rb.model;
    const reply = await brain.chatSafe({ model, messages: [{ role: 'system', content: REVIEW_SYSTEM }, { role: 'user', content: user }], signal: ctx.signal, think: rb.think, cpu: false, task: 'coding' }, { emit: ctx.emit, who: 'reviewer' });
    const text = String(reply?.content || '').trim();
    const first = text.replace(/^[^A-Za-z]+/, '').slice(0, 4).toUpperCase();
    ctx.emit?.({ type: 'announce', text: first === 'PASS' ? `🛰 Moot over: ${who} passed ${spec.name}.` : `🛰 Moot over: ${who} said no to ${spec.name}.` });
    return { ok: first === 'PASS', text: text.slice(0, 1500) || '(no answer)', who };
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    return { ok: false, text: `The check couldn't run (${e.message}), so the tool wasn't added.`, who };
  }
}

// The test, in words for the card (the raw input and output stay under Show code).
const shortPath = (v) => (typeof v === 'string' && /[\\/]/.test(v) ? v.split(/[\\/]/).filter(Boolean).slice(-2).join('\\') : v);
export function testInWords(input, res) {
  const ins = Object.entries(input || {}).map(([k, v]) => `${k} = ${String(shortPath(typeof v === 'object' ? JSON.stringify(v) : v)).slice(0, 60)}`).join(', ');
  if (!res) return 'It will be tried once its downloads are in, after you say yes.';
  if (!res.ok) return `Tried it${ins ? ` on ${ins}` : ''}: it failed (${res.error}).`;
  let out = String(res.out || '').trim(), said = '';
  try {
    const j = JSON.parse(out);
    if (Array.isArray(j)) said = `${j.length} item${j.length === 1 ? '' : 's'}${j[0] && typeof j[0] === 'object' ? ` (${Object.entries(j[0]).slice(0, 4).map(([k, v]) => `${k} = ${String(v).slice(0, 30)}`).join(', ')}${j.length > 1 ? ', …' : ''})` : ''}`;
    else if (j && typeof j === 'object') said = Object.entries(j).slice(0, 4).map(([k, v]) => `${k} = ${String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 30)}`).join(', ');
    else said = String(j).slice(0, 120);
  } catch { said = out.replace(/\s+/g, ' ').slice(0, 120) + (out.length > 120 ? '…' : ''); }
  return `Tried it${ins ? ` on ${ins}` : ''}: ${said || 'no answer'}. Worked.`;
}

// ---------------------------------------------------------------- making, adding, removing

// One draft at a time: a new one (or Bob starting) throws away any left from a "Not now".
const clearDrafts = (cfg) => { try { fs.rmSync(path.join(toolsDir(cfg), '_drafts'), { recursive: true, force: true }); } catch {} };
function writeDraft(cfg, spec, code) {
  const dir = draftDir(cfg, spec.name);
  clearDrafts(cfg);
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  const { test, ...meta } = spec;
  fs.writeFileSync(path.join(dir, 'tool.mjs'), code);
  fs.writeFileSync(path.join(dir, 'tool.json'), JSON.stringify({ ...meta, test, madeBy: 'Bob', made: new Date().toISOString() }, null, 1));
  fs.writeFileSync(path.join(dir, 'README.txt'), `${spec.name}\n${'='.repeat(spec.name.length)}\n\nA tool Bob made for himself.\n\nWhat it does: ${spec.what}\nIt may read: ${spec.reads.join('; ') || 'only its own folder'}\nIt may change: ${spec.writes.join('; ') || 'only its own work folder'}\nInternet: ${spec.internet ? 'yes' : 'no'}\n\nIf you change any file here, Bob turns the tool off until it is checked and OK'd again.\nRemove it in Settings, Show advanced settings, Hands, Tools Bob made.\n`);
  return dir;
}

async function download(d, dest, signal) {
  const r = await fetch(d.url, { signal, redirect: 'follow' });
  if (!r.ok) throw new Error(`${d.file}: the website answered ${r.status}.`);
  const hash = crypto.createHash('sha256');
  let n = 0;
  const tmp = dest + '.part';
  const out = fs.createWriteStream(tmp);
  try {
    for await (const chunk of r.body) {
      n += chunk.length;
      if (n > d.bytes) throw new Error(`${d.file} is bigger than its pinned size, so I stopped.`);
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((ok) => out.once('drain', ok));
    }
    await new Promise((ok, no) => out.end((e) => (e ? no(e) : ok())));
  } catch (e) { out.destroy(); fs.rmSync(tmp, { force: true }); throw e; }
  if (n !== d.bytes || hash.digest('hex') !== d.sha256) { fs.rmSync(tmp, { force: true }); throw new Error(`${d.file} isn't the pinned file (size or checksum differs), so I didn't keep it.`); }
  fs.renameSync(tmp, dest);
}

// After the OK: the draft becomes the tool, its downloads are fetched and checked, a tool with downloads is tested
// now, and its files are recorded. An older version of the same tool goes to the Recycle Bin.
export async function addTool(cfg, draft, { signal, log = () => {} } = {}) {
  const { spec, code } = draft;
  // 1.5.144: never write over a tool on the Recently deleted shelf (its folder and OK are what Put back restores).
  if (loadApproved(cfg)[spec.name]?.deleted) throw new Error(shelvedWords(cfg, spec.name));
  const from = draftDir(cfg, spec.name);
  if (!fs.existsSync(path.join(from, 'tool.mjs')) || fs.readFileSync(path.join(from, 'tool.mjs'), 'utf8') !== code) throw new Error('The draft changed after it was checked, so it wasn\'t added. Make it again.');
  for (const d of spec.downloads) await download(d, path.join(from, 'files', d.file), signal);
  if (spec.downloads.length) {
    const t = await runSandboxed({ dir: from, input: spec.test, reads: spec.reads, writes: spec.writes, internet: spec.internet, timeoutSec: spec.timeoutSec, signal });
    if (!t.ok) { fs.rmSync(from, { recursive: true, force: true }); throw new Error(`With its downloads, the test failed: ${t.error}. It wasn't added.`); }
  }
  const to = toolDir(cfg, spec.name);
  if (fs.existsSync(to)) { const r = recycle(cfg, [to], { roots: [toolsDir(cfg)] }); if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true }); log('selftools', `old ${spec.name} to the Recycle Bin${r.gone.length ? '' : ' (removed)'}`); }
  fs.mkdirSync(toolsDir(cfg), { recursive: true });
  fs.renameSync(from, to);
  const all = loadApproved(cfg);
  all[spec.name] = { what: spec.what, reads: spec.reads, writes: spec.writes, internet: spec.internet, downloads: spec.downloads, timeoutSec: spec.timeoutSec, hashes: hashFiles(to), at: Date.now(), on: true, lastUsed: 0 };
  saveApproved(cfg, all);
  log('selftools', `added tool ${spec.name}: ${spec.what}`);
  return to;
}

export function setToolOn(cfg, name, on) {
  const all = loadApproved(cfg);
  if (!all[name] || all[name].deleted) throw new Error(`There's no tool called ${name}.`);
  if (on) {
    const t = listTools(cfg).find((x) => x.name === name);
    if (t?.state === 'changed') throw new Error(`${name}'s files changed since you OK'd it, so it has to be checked again: ask Bob to make it again.`);
    if (t?.state === 'missing') throw new Error(`${name}'s folder is gone. Remove it from the list.`);
  }
  all[name].on = Boolean(on);
  saveApproved(cfg, all);
}

// Delete: the tool goes on the shelf for 30 days. Its folder stays where it is (so Put back gives back exactly what was
// OK'd, hashes and all), but it's out of Bob's list and can't run. The shelf is swept on every look at the list.
export function deleteTool(cfg, name) {
  const all = loadApproved(cfg);
  if (!all[name] || all[name].deleted) throw new Error(`There's no tool called ${name}.`);
  all[name].deleted = Date.now();
  saveApproved(cfg, all);
}
export function restoreTool(cfg, name) {
  const all = loadApproved(cfg);
  if (!all[name]?.deleted) throw new Error(`There's no deleted tool called ${name}.`);
  if (Object.values(all).filter((a) => !a.deleted).length >= MAX_TOOLS) throw new Error(`I already keep ${MAX_TOOLS} tools, the most I can. Delete one first, then put this one back.`);
  delete all[name].deleted;
  saveApproved(cfg, all);
}
// Shelf sweep: anything deleted more than 30 days ago goes for good. Returns the names that went.
export function sweepDeleted(cfg, now = Date.now()) {
  const gone = [];
  for (const [name, a] of Object.entries(loadApproved(cfg))) if (a.deleted && now - a.deleted > KEEP_DELETED_MS) { try { removeTool(cfg, name); gone.push(name); } catch {} }
  return gone;
}

// Removes a tool for good: its folder (with its downloads) to the Recycle Bin, and its record.
export function removeTool(cfg, name) {
  const all = loadApproved(cfg);
  if (!all[name]) throw new Error(`There's no tool called ${name}.`);
  const dir = toolDir(cfg, name);
  if (fs.existsSync(dir)) {
    recycle(cfg, [dir], { roots: [toolsDir(cfg)] });
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  delete all[name];
  saveApproved(cfg, all);
}

export function toolCode(cfg, name) {
  if (!loadApproved(cfg)[name]) throw new Error(`There's no tool called ${name}.`);
  if (loadApproved(cfg)[name].deleted && !fs.existsSync(path.join(toolDir(cfg, name), 'tool.mjs'))) throw new Error(`${name} is on the Recently deleted shelf and its folder is gone.`);
  return fs.readFileSync(path.join(toolDir(cfg, name), 'tool.mjs'), 'utf8');
}

// 1.5.144: what Bob says about a tool on the Recently deleted shelf (use it, or make one with its name).
const shelvedWords = (cfg, name) => `The ${name} tool was deleted. ${cfg.userName || 'The user'} can put it back within 30 days in Settings, 🧰 Tools and how-tos Bob made, Recently deleted. Don't make a new one with that name: tell ${cfg.userName || 'the user'} it was deleted and ask whether to put it back.`;

// Runs a tool Bob made (already approved). Its files must still be exactly what was OK'd.
export async function useTool(cfg, name, input, { signal } = {}) {
  const all = loadApproved(cfg);
  const a = all[name];
  const t = listTools(cfg).find((x) => x.name === name);
  if (a?.deleted) throw new Error(shelvedWords(cfg, name));
  if (!a || !t) throw new Error(`There's no tool called ${name}. Tools I made: ${usableTools(cfg).map((x) => x.name).join(', ') || 'none yet'}.`);
  if (t.state === 'off') throw new Error(`The ${name} tool is turned off (Settings, Show advanced settings, Hands, Tools Bob made).`);
  if (t.state === 'changed') throw new Error(`I turned ${name} off because its files changed since it was OK'd. It has to be checked again before I use it.`);
  if (t.state === 'missing') throw new Error(`${name}'s folder is gone.`);
  const holds = await sandboxHolds(cfg);
  if (!holds.ok) throw new Error(`The sandbox doesn't hold on this replicant matrix (${holds.why}), so I won't run tools I made.`);
  const res = await runSandboxed({ dir: t.dir, input: input && typeof input === 'object' ? input : {}, reads: a.reads, writes: a.writes, internet: a.internet, timeoutSec: a.timeoutSec || 60, signal });
  all[name].lastUsed = Date.now();
  saveApproved(cfg, all);
  return res;
}

// ---------------------------------------------------------------- the toolbox group and prompt line

const nameWords = (n) => n.split('_').filter((w) => w.length >= 3);
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The cheap word check for the group: "tool" talk, plus the names of the tools he made.
export function makerWords(cfg) {
  const names = (() => { try { return usableTools(cfg).flatMap((t) => [t.name, ...nameWords(t.name)]); } catch { return []; } })();
  const extra = [...new Set(names)].map(escRx).join('|');
  return new RegExp(`\\b(?:tools?|make (?:yourself|your own|a tool)|build (?:yourself|your own)|you (?:can't|cannot|don't have)${extra ? `|${extra}` : ''})\\b`, 'i');
}
export function makerWhat(cfg) {
  const mine = (() => { try { return usableTools(cfg).map((t) => t.name); } catch { return []; } })();
  return `make yourself a new tool when none fits the job; use or list the tools you made${mine.length ? ` (${mine.slice(0, 12).join(', ')})` : ''}`;
}

// ---------------------------------------------------------------- the tools Bob calls

const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

export function selfToolsTools(brain) {
  const cfg = brain.cfg;
  const log = (k, t) => brain.log?.(k, t);
  const fails = new Map(); // tool name -> times the reviewer said no this run of Bob (one fix round, then it's dropped)
  const t = {};

  t.make_tool = {
    schema: fn('make_tool', "Make yourself a new tool when none of yours fits. Write an ES module using only Node's built-in parts (no packages, require or child_process) that does `export async function run(input, { workDir, filesDir }) { ... return 'answer'; }`. In its sandbox it reads its own folder and reads, and writes its work folder and writes. A test, your reviewer and {{USER}}'s OK come first. The same name replaces it.", {
      name: str('Short name, lower case with _, like csv_to_json.'),
      what: str('One plain line: what it does.'),
      when: str('One line: when to use it, like "{{USER}} gives a CSV and wants JSON".'),
      inputs: { type: 'object', description: 'Its inputs: { "name": { "type": "string|number|boolean", "description": "..." } }.' },
      code: str('The whole tool.mjs.'),
      test: { type: 'object', description: 'A sample input to try it with before it is added.' },
      reads: { type: 'array', items: { type: 'string' }, description: 'Folders it reads (only ones ticked for Hands). Empty if none.' },
      writes: { type: 'array', items: { type: 'string' }, description: 'Folders it saves in (only ones ticked for Hands). Empty if none.' },
      internet: { type: 'boolean', description: 'true only if it must fetch things from the internet.' },
      downloads: { type: 'array', items: { type: 'object' }, description: 'Files it needs, each { url, sha256, bytes, file }, pinned to one version.' }
    }, ['name', 'what', 'when', 'inputs', 'code', 'test']),
    alone: true, // its card is its own, never part of an "all together" card: it needs its own check first
    async check(args, ctx = {}) {
      off(cfg);
      const want = String(args?.name || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); // the same name cleanSpec makes
      if (want && loadApproved(cfg)[want]?.deleted) throw new Error(shelvedWords(cfg, want)); // 1.5.144: Put back first, never remake
      const holds = await sandboxHolds(cfg);
      if (!holds.ok) throw new Error(`The sandbox doesn't hold on this replicant matrix (${holds.why}), so I can't make tools here.`);
      const { spec, problems } = cleanSpec(cfg, args);
      const code = String(args.code || '');
      problems.push(...codeProblems(cfg, code, spec));
      const have = loadApproved(cfg);
      if (have[spec.name]?.deleted) throw new Error(shelvedWords(cfg, spec.name)); // 1.5.144: Put back first, never remake
      if (!(have[spec.name] && !have[spec.name].deleted) && Object.values(have).filter((a) => !a.deleted).length >= MAX_TOOLS) problems.push(`I already have ${MAX_TOOLS} tools, the most I keep. Ask ${cfg.userName || 'the user'} which one to delete first.`);
      if (problems.length) throw new Error(`Not added yet. Fix these and call make_tool again:\n- ${problems.join('\n- ')}`);
      const dir = writeDraft(cfg, spec, code);
      let test = null;
      if (!spec.downloads.length) {
        ctx.emit?.({ type: 'token', text: `\n\n*Trying ${spec.name} in the sandbox…*\n\n` });
        test = await runSandboxed({ dir, input: spec.test, reads: spec.reads, writes: spec.writes, internet: spec.internet, timeoutSec: spec.timeoutSec, signal: ctx.signal });
        if (!test.ok) throw new Error(`The test run failed: ${test.error}${test.timedOut ? '' : test.blocked ? ' (it tried something the sandbox doesn\'t allow)' : ''}. Fix it and call make_tool again.`);
      }
      const review = await reviewTool(brain, spec, code, test, ctx);
      log('selftools', `${review.who || 'reviewer'} on ${spec.name}: ${review.ok ? 'PASS' : 'FAIL'}`);
      if (!review.ok) {
        const n = (fails.get(spec.name) || 0) + 1;
        fails.set(spec.name, n);
        if (n >= 2) { fs.rmSync(dir, { recursive: true, force: true }); fails.delete(spec.name); throw new Error(`Your reviewer said no again, so ${spec.name} was dropped. Tell ${cfg.userName || 'the user'} plainly what it would have done and why it wasn't added:\n${review.text}`); }
        throw new Error(`Your reviewer said no:\n${review.text}\nFix the real problems once and call make_tool again, or tell ${cfg.userName || 'the user'} why it can't be done.`);
      }
      fails.delete(spec.name);
      const draft = { spec, code, test, review };
      if (ctx) ctx.toolDraft = draft;
      const replaces = Boolean(have[spec.name]);
      const net = spec.internet ? (holds.net ? 'Yes (only this tool, only while it runs)' : 'Yes. This replicant matrix can\'t switch the internet off for one program, so the code was checked for it instead') : 'No';
      return {
        text: `${replaces ? 'Replace my tool' : 'Add a tool I made'}: ${spec.name}. ${spec.what}`,
        button: replaces ? 'Replace tool' : 'Add tool',
        newTool: {
          name: spec.name, what: spec.what, replaces,
          inputs: Object.entries(spec.inputs).map(([k, v]) => `${k}: ${v.description}`),
          reads: spec.reads, writes: spec.writes, internet: net,
          downloads: spec.downloads.map((d) => ({ file: d.file, url: d.url, size: kb(d.bytes) })),
          test: testInWords(spec.test, test),
          testRaw: test ? `Input: ${JSON.stringify(spec.test)}\nAnswer: ${String(test.out).slice(0, 2000)}` : '',
          review: review.text, reviewer: review.who, code
        }
      };
    },
    async run(args, ctx = {}) {
      off(cfg);
      const draft = ctx.toolDraft;
      if (ctx) ctx.toolDraft = null;
      if (!draft) throw new Error('Nothing was checked to add. Call make_tool again.');
      await addTool(cfg, draft, { signal: ctx.signal, log });
      ctx.emit?.({ type: 'selftools', added: draft.spec.name });
      return `Added the tool "${draft.spec.name}". Use it with use_my_tool (name "${draft.spec.name}", input like ${JSON.stringify(draft.spec.test).slice(0, 200)}).`;
    },
    summary: ({ name }) => `making a tool: ${String(name || '').slice(0, 40)}`
  };

  t.use_my_tool = {
    get schema() {
      let mine = [], shelf = [];
      try { mine = usableTools(cfg); shelf = listTools(cfg, { deleted: true }).map((x) => x.name); } catch {}
      const learned = toolLearnOn(cfg) ? loadLearning(cfg) : null; // tool notes and scorecard (tool-learn.js)
      const list = mine.map((x) => `${x.name}: ${x.what}${x.when ? ` Use when ${x.when.replace(/[.\s]+$/, '')}.` : ''} Inputs: ${Object.entries(x.inputs).map(([k, v]) => `${k} ${v.type}`).join(', ') || 'none'}${x.example && Object.keys(x.example).length ? `, like ${JSON.stringify(x.example).slice(0, 120)}` : ''}.${learned ? learnedLine(cfg, `use_my_tool:${x.name}`, learned, { made: true }) : ''}`).join(' | ');
      return fn('use_my_tool', `Run one of the tools you made. ${list ? `Yours: ${list}` : 'You have none yet.'}${shelf.length ? ` Deleted (on the Recently deleted shelf; ask ${cfg.userName || 'the user'} to put one back, never make it again): ${shelf.join(', ')}.` : ''}`, {
        name: str('The tool\'s name.', mine.length || shelf.length ? { enum: [...mine.map((x) => x.name), ...shelf] } : {}),
        input: { type: 'object', description: 'Its inputs.' }
      }, ['name']);
    },
    approvalGroup: (a) => `mytool:${String(a.name || '').toLowerCase()}`,
    check({ name, input }) {
      off(cfg);
      if (loadApproved(cfg)[String(name || '')]?.deleted) throw new Error(shelvedWords(cfg, String(name)));
      const x = listTools(cfg).find((y) => y.name === String(name || ''));
      if (!x) throw new Error(`There's no tool called ${name}. Tools I made: ${usableTools(cfg).map((y) => y.name).join(', ') || 'none yet'}.`);
      if (x.state !== 'on') return false; // run() says why
      // Tools that only read and work in their own folder need no card; ones that change folders or use the internet ask.
      if (!x.writes.length && !x.internet) return false;
      return { text: `Use my tool "${x.name}": ${x.what}${x.writes.length ? ` It can change files in ${x.writes.join('; ')}.` : ''}${x.internet ? ' It uses the internet.' : ''}`, command: `${x.name} ${JSON.stringify(input ?? {}).slice(0, 400)}`, cwd: x.dir, button: 'Run it' };
    },
    async run({ name, input }, ctx = {}) {
      off(cfg);
      let inp = input;
      if (typeof inp === 'string') { try { inp = JSON.parse(inp); } catch { inp = { text: inp }; } }
      const r = await useTool(cfg, String(name || ''), inp, { signal: ctx.signal });
      log('selftools', `used ${name}: ${r.ok ? 'ok' : r.error}`);
      if (!r.ok) return `Error: ${name} failed: ${r.error}`;
      return r.out || '(no answer)';
    },
    summary: ({ name }) => `using his own tool: ${String(name || '').slice(0, 40)}`
  };

  t.my_tools = {
    schema: fn('my_tools', 'List the tools you made, turn one off, or delete one ({{USER}} OKs a delete; it can come back for 30 days).', {
      action: str('What to do', { enum: ['list', 'off', 'remove'] }),
      name: str('The tool (for off and remove).')
    }, ['action']),
    check({ action, name }) {
      off(cfg);
      if (action !== 'remove') return false;
      const a = loadApproved(cfg)[name];
      if (!a || a.deleted) throw new Error(`There's no tool called ${name}.`);
      return `Delete my tool "${name}" (it waits 30 days under Recently deleted in Settings, where you can put it back; then its folder goes to the Recycle Bin).`;
    },
    async run({ action, name }) {
      off(cfg);
      if (action === 'off') { setToolOn(cfg, String(name), false); log('selftools', `turned off ${name}`); return `Turned ${name} off. ${cfg.userName || 'The user'} can turn it back on in Settings, Show advanced settings, Hands.`; }
      if (action === 'remove') { deleteTool(cfg, String(name)); log('selftools', `deleted ${name} (on the shelf 30 days)`); return `Deleted ${name}. ${cfg.userName || 'The user'} can put it back within 30 days in Settings, 🧰 Tools and how-tos Bob made, Recently deleted.`; }
      const all = listTools(cfg);
      if (!all.length) return 'No tools made yet.';
      const st = { on: 'on', off: 'turned off', changed: 'off: its files changed since the OK', missing: 'its folder is gone' };
      const sc = toolLearnOn(cfg) ? loadLearning(cfg).tools : {};
      const score = (n) => { const t = sc[`use_my_tool:${n}`]; return t ? `; worked ${t.wins}, failed ${t.misses}` : ''; };
      return all.map((x) => `${x.name}: ${x.what}${x.when ? ` Use when ${x.when}` : ''} [${st[x.state]}${score(x.name)}; reads ${x.reads.join('; ') || 'its own folder'}; changes ${x.writes.join('; ') || 'nothing outside it'}; internet ${x.internet ? 'yes' : 'no'}]`).join('\n');
    },
    summary: ({ action, name }) => `his own tools: ${action}${name ? ' ' + name : ''}`
  };
  return t;
}

// One line for Bob's prompt while this Hand is on.
export function makerPrompt(cfg) {
  if (!handOn(cfg, 'maker')) return '';
  return ` Own tools: when no tool of yours fits a job, you may make one with make_tool (plain JavaScript using only Node's built-in parts, in a sandbox); a test, your reviewer and ${cfg.userName || 'the user'}'s OK come first. Use the ones you made with use_my_tool. Never claim a tool was added unless make_tool said so.`;
}

// For the Settings page.
export function selfToolsView(cfg) {
  let tools = [];
  try { sweepDeleted(cfg); tools = listTools(cfg); } catch {}
  return { tools: tools.map(({ dir, ...x }) => ({ ...x, folder: dir })), max: MAX_TOOLS, sandbox: probed, netGuard: netGuard() };
}
