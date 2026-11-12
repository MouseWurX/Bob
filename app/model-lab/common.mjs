// Shared bits for the Bob model lab: settings, finding files, reading GGUF headers and tensors, running llama-server.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The lab sits next to Bob's source tree: <parent>/bob/model-lab, so the parent is two levels up.
const here = path.dirname(fileURLToPath(import.meta.url));

export const AGENT = process.env.BOB_AGENT_DIR || path.resolve(here, '..', '..');
const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n);

// --key value and --flag on the command line, over the defaults.
export function opts(defaults) {
  const o = { ...defaults };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2), next = a[i + 1];
    if (next === undefined || next.startsWith('--')) o[k] = true; else { o[k] = next; i++; }
  }
  return o;
}

export function findFile(root, test, depth = 5) {
  let st; try { st = fs.statSync(root); } catch { return null; }
  if (!st.isDirectory()) return test(path.basename(root)) ? root : null;
  let list = []; try { list = fs.readdirSync(root, { withFileTypes: true }); } catch { return null; }
  for (const e of list) if (e.isFile() && test(e.name)) return path.join(root, e.name);
  if (depth > 0) for (const e of list) if (e.isDirectory()) { const hit = findFile(path.join(root, e.name), test, depth - 1); if (hit) return hit; }
  return null;
}

// The defaults the lab looks for on the PC; any of them can be given by hand.
export function locate(o) {
  const lc = path.join(AGENT, 'llama.cpp');
  const llamaDir = o.llama || (fs.existsSync(path.join(lc, 'bin', exe('llama-server'))) ? path.join(lc, 'bin') : lc);
  const model = o.model || findFile(path.join(AGENT, 'models'), (n) => /^Qwen3\.6-35B-A3B-UD-Q4_K_XL\.gguf$/i.test(n));
  // The vision file: Qwen3.6-35B-A3B-mmproj*.gguf anywhere, or mmproj*.gguf next to the model.
  const mmproj = o.mmproj === 'none' ? null : (o.mmproj || findFile(path.join(AGENT, 'models'), (n) => /^Qwen3\.6-35B-A3B-mmproj.*\.gguf$/i.test(n)) || (model && findFile(path.dirname(model), (n) => /^mmproj.*\.gguf$/i.test(n), 0)));
  const top = o.bob || path.join(AGENT, 'bob');
  // Since Nov 9 Bob's files sit in app/ inside the repository: either folder works.
  const bob = !fs.existsSync(path.join(top, 'src')) && fs.existsSync(path.join(top, 'app', 'src')) ? path.join(top, 'app') : top;
  const out = o.out || path.join(AGENT, 'bob-model-lab', 'out');
  fs.mkdirSync(out, { recursive: true });
  return { server: path.join(llamaDir, exe('llama-server')), imatrix: path.join(llamaDir, exe('llama-imatrix')), model, mmproj, bob, out };
}

// ---------- GGUF ----------
const T = { U8: 0, I8: 1, U16: 2, I16: 3, U32: 4, I32: 5, F32: 6, BOOL: 7, STRING: 8, ARRAY: 9, U64: 10, I64: 11, F64: 12 };
const FIXED = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
class R {
  constructor(fd) { this.fd = fd; this.pos = 0; this.buf = Buffer.alloc(0); this.start = 0; }
  need(n) { if (this.pos >= this.start && this.pos + n <= this.start + this.buf.length) return; const b = Buffer.alloc(Math.max(n, 1 << 20)); const got = fs.readSync(this.fd, b, 0, b.length, this.pos); this.buf = b.subarray(0, got); this.start = this.pos; if (got < n) throw new Error('GGUF ends early'); }
  at() { return this.pos - this.start; }
  u32() { this.need(4); const v = this.buf.readUInt32LE(this.at()); this.pos += 4; return v; }
  u64() { this.need(8); const v = Number(this.buf.readBigUInt64LE(this.at())); this.pos += 8; return v; }
  str() { const n = this.u64(); this.need(n); const s = this.buf.toString('utf8', this.at(), this.at() + n); this.pos += n; return s; }
  val(t) {
    if (t === T.STRING) return this.str();
    if (t === T.ARRAY) { const it = this.u32(), n = this.u64(); if (FIXED[it]) { this.pos += FIXED[it] * n; return `[array ${n}]`; } for (let i = 0; i < n; i++) this.val(it); return `[array ${n}]`; }
    const s = FIXED[t]; if (!s) throw new Error(`GGUF type ${t}?`); this.need(s); const b = this.buf, o = this.at(); this.pos += s;
    return t === 0 ? b.readUInt8(o) : t === 1 ? b.readInt8(o) : t === 2 ? b.readUInt16LE(o) : t === 3 ? b.readInt16LE(o) : t === 4 ? b.readUInt32LE(o) : t === 5 ? b.readInt32LE(o)
      : t === 6 ? b.readFloatLE(o) : t === 7 ? b.readUInt8(o) !== 0 : t === 10 ? Number(b.readBigUInt64LE(o)) : t === 11 ? Number(b.readBigInt64LE(o)) : b.readDoubleLE(o);
  }
}
// { kv, tensors: [{ name, dims, type, offset }], dataStart } — header only, no weights read.
export function ggufRead(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const r = new R(fd); r.need(4);
    if (r.buf.toString('latin1', 0, 4) !== 'GGUF') throw new Error(`${file} is not a GGUF file`);
    r.pos = 4; r.u32();
    const nt = r.u64(), nkv = r.u64(), kv = {};
    for (let i = 0; i < nkv; i++) { const k = r.str(); kv[k] = r.val(r.u32()); }
    const tensors = [];
    for (let i = 0; i < nt; i++) { const name = r.str(); const nd = r.u32(); const dims = []; for (let d = 0; d < nd; d++) dims.push(r.u64()); tensors.push({ name, dims, type: r.u32(), offset: r.u64() }); }
    const align = Number(kv['general.alignment']) || 32;
    return { kv, tensors, dataStart: Math.ceil(r.pos / align) * align };
  } finally { fs.closeSync(fd); }
}
// An F32 tensor's numbers (only F32 = type 0 is needed here: imatrix files store F32).
export function ggufF32(file, g, t) {
  if (t.type !== 0) throw new Error(`${t.name} is not F32`);
  const n = t.dims.reduce((a, b) => a * b, 1), buf = Buffer.alloc(n * 4), fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, buf, 0, buf.length, g.dataStart + t.offset); } finally { fs.closeSync(fd); }
  return Array.from({ length: n }, (_, i) => buf.readFloatLE(i * 4));
}
export function moeShape(model) {
  const { kv } = ggufRead(model), a = kv['general.architecture'];
  return { arch: a, layers: kv[`${a}.block_count`], experts: kv[`${a}.expert_count`], used: kv[`${a}.expert_used_count`], key: `${a}.expert_used_count`, name: kv['general.name'] };
}

// ---------- the PC is free ----------
// One GPU job at a time: refuse to start while another llama-server (Bob's, or a test one) is running.
export function otherEngines() {
  try {
    if (process.platform === 'win32') return execFileSync('tasklist', ['/FI', 'IMAGENAME eq llama-server.exe', '/NH'], { encoding: 'utf8' }).split('\n').filter((l) => /llama-server/i.test(l)).length;
    return execFileSync('pgrep', ['-c', 'llama-server'], { encoding: 'utf8' }).trim() * 1;
  } catch { return 0; }
}
export function gpuFreeMB() {
  try { return Number(execFileSync('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'], { encoding: 'utf8' }).split('\n')[0]); } catch { return null; }
}
export function checkFree(o) {
  const n = otherEngines();
  if (n && !o.force) { console.error(`Another llama-server is running (${n}). One GPU job at a time: wait for it (or Bob's brain to unload), or add --force.`); process.exit(2); }
  const free = gpuFreeMB();
  if (free !== null) console.log(`Graphics card memory free: ${free} MB`);
}
// Stop when a file called PAUSE is in the out folder, carry on when it's gone (for a game, or the PC thread's tests).
export async function pauseGate(out) {
  const p = path.join(out, 'PAUSE'); let said = false;
  while (fs.existsSync(p)) { if (!said) { console.log('Paused (out\\PAUSE exists). Delete it to carry on.'); said = true; } await new Promise((r) => setTimeout(r, 5000)); }
}

// ---------- llama-server ----------
export async function startServer({ server, model, mmproj, ctx = 32768, port = 8091, extra = [], logFile }) {
  // build 18: LAB_URL (or --url in the scripts) = a server somebody else runs, such as the Forge's rented card; nothing is started here
  if (process.env.LAB_URL) return { url: process.env.LAB_URL, stop: async () => {}, child: null, loadSec: 0, remote: true };
  if (!fs.existsSync(server)) throw new Error(`llama-server not found at ${server}. Pass --llama <folder>.`);
  const args = ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-c', String(ctx), '--jinja', '-fa', 'on', '-ctk', 'q8_0', '-ctv', 'q8_0', '-np', '1', '--fit', 'on', ...(mmproj ? ['--mmproj', mmproj] : []), ...extra];
  const log = logFile ? fs.createWriteStream(logFile, { flags: 'a' }) : null;
  log?.write(`\n=== ${new Date().toISOString()} ${server} ${args.join(' ')}\n`);
  const child = spawn(server, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let tail = '';
  const keep = (d) => { tail = (tail + d).slice(-4000); log?.write(d); };
  child.stdout.on('data', keep); child.stderr.on('data', keep);
  const url = `http://127.0.0.1:${port}`;
  const stop = () => new Promise((res) => { if (child.exitCode !== null) return res(); child.once('exit', res); child.kill(); setTimeout(res, 8000); });
  const t0 = Date.now();
  while (Date.now() - t0 < 10 * 60 * 1000) {
    if (child.exitCode !== null) throw new Error(`llama-server stopped while loading (code ${child.exitCode}). Last output:\n${tail.slice(-1500)}`);
    try { const r = await fetch(`${url}/health`); if (r.ok) return { url, stop, child, loadSec: (Date.now() - t0) / 1000 }; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  await stop(); throw new Error('llama-server took over 10 minutes to load');
}

// One request. think: true/false sets Qwen's thinking switch. Returns { msg, timings, finish }.
export async function chat(url, { messages, tools, think = false, max = 2048, temperature, ...rest }, timeoutMs = 15 * 60 * 1000) {
  // LAB_REMOTE=1: a rented vLLM server (OpenAI-style). It needs the model name and a key, and has no cache_prompt.
  const remote = process.env.LAB_REMOTE === '1';
  const body = { ...(remote ? { model: process.env.LAB_MODEL_NAME } : { cache_prompt: true }), messages, ...(tools?.length ? { tools } : {}), max_tokens: max, stream: false,
    chat_template_kwargs: { enable_thinking: Boolean(think) },
    // Qwen3.6's published sampling: thinking 0.6/0.95/20, instruct 0.7/0.8/20.
    temperature: temperature ?? (think ? 0.6 : 0.7), top_p: think ? 0.95 : 0.8, top_k: 20, ...rest };
  const r = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.LAB_API_KEY ? { authorization: `Bearer ${process.env.LAB_API_KEY}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const text = await r.text();
  if (!r.ok) throw new Error(`llama-server ${r.status}: ${text.slice(0, 500)}`);
  const j = JSON.parse(text);
  const msg = j.choices?.[0]?.message || {};
  if (!msg.reasoning_content && msg.reasoning) msg.reasoning_content = msg.reasoning; // newer vLLM names it reasoning
  return { msg, finish: j.choices?.[0]?.finish_reason, timings: j.timings || {} };
}

export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
export function appendJsonl(file, obj) { fs.appendFileSync(file, JSON.stringify(obj) + '\n'); }
export function readJsonl(file) { if (!fs.existsSync(file)) return []; return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
