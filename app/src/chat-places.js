// "Per-chat engine cache" (Settings, How Bob works, 💬 Chat extras). On unless turned off (Nov 24, the owner: lossless
// speed tricks are on by default; anyone who turned it off before stays off).
// The engine (llama-server) keeps one chat's reading in its memory. Switching to another chat throws it away, so going
// back means reading the whole chat again (a long chat on a big brain can take minutes). With this on, Bob's built-in
// engine saves a chat's reading to disk (inn\bob\chat-places) and loads it back when you return:
//   - when you switch chats, before the engine stops (another brain, new settings), and 20 s after a reply, so a
//     restart, a crash or quitting Bob costs at most the newest turn;
//   - each file is named after an engine key: the engine build, the brain file (and any file beside it, like a drafter)
//     and every engine setting and switch that could change what was read. A file from another engine, brain or
//     setting is never loaded (the engine only checks the memory layout, not what the numbers mean), and ages out;
//   - written to a tmp- name and renamed when whole, so a crash in the middle of a save never leaves a file that looks
//     whole (an engine before Brain Engine 46 stops on a file cut short);
//   - not while the drive is low: a save needs 5% of the drive free after it, at least 8 GB and at most 32 GB.
// The engine's own RAM cache (llama.cpp's --cache-ram) holds chats in between; GUPPI sizes it (ramCacheMiB below), and
// from Brain Engine 46 (patch 0121) the engine also gives it back while free RAM would fall under the RAM floor.
// The engine only reuses the part of a saved reading that still matches the chat, so an edited chat is safe, and a
// restored reading is byte for byte what the engine held: the next reply is the same as if the chat never left.
//   - Only Bob's built-in engine (Brain Engine or llama.cpp). Ollama and rented brains don't have it.
//   - Not for brains that see pictures (the engine can't save those), and not the second brain beside a job.
//   - The newest 8 are kept, and no more than 16 GB in all: a long chat on a big brain can take a few GB.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const chatPlacesOn = (cfg) => cfg?.chatPlaces !== false;
export const placesDir = (cfg) => path.join(cfg.dataDir, 'chat-places');
export const PLACES_KEEP = 8;
export const PLACES_MAX_BYTES = 16e9;
export const PLACE_IDLE_MS = 20000; // a reply's reading goes to disk this long after the reply, when nothing else is running

// llama-server only takes a plain file name inside its save folder. The chat's id is hashed, so the name says nothing.
// key: placeKey() of this engine run ('' only in old tests).
export const placeFile = (chatId, model, ctx, key = '') => `place-${crypto.createHash('sha1').update(String(chatId)).digest('hex').slice(0, 12)}-${String(model).replace(/[^\w.-]+/g, '_').slice(0, 60)}-${Number(ctx) || 0}${key ? `-${key}` : ''}.bin`;
export const tmpFile = (name) => `tmp-${name}`;

// What doesn't change the meaning of a saved reading is left out of the key, so a file still fits when only it changes:
// where the engine listens and saves, threads, the RAM cache's size, and where the brain sits and how fast it reads
// (layers on the card, experts in RAM, the reading step, the copy cache). GUPPI moves those with the free memory, and
// changes the step in the middle of a chat already; a reading put back is what the engine held either way. Everything
// else counts: the engine, the brain and drafter files, the chat memory's size and number format, flash attention,
// rope, Turbo and any setting or switch this list doesn't know.
const KEY_SKIP = new Set(['-t', '--threads', '-tb', '--threads-batch', '--cpu-range', '--port', '--host', '--slot-save-path', '--cache-ram', '-cram',
  '--log-file', '--alias', '-a', '--api-key', '--timeout', '-to', '--metrics', '--no-webui', '--webui', '--log-disable', '--verbose', '-v',
  '-b', '--batch-size', '-ub', '--ubatch-size', '-ngl', '--n-gpu-layers', '-ngld', '--n-gpu-layers-draft', '--fit', '--fit-target', '-fitt',
  '--fit-ctx', '-fitc', '-ot', '--override-tensor', '-ncmoe', '--n-cpu-moe', '--cpu-moe', '-cmoe', '-dev', '--device', '-devd', '--device-draft',
  '--moe-cache-mib', '--no-repack', '-nr', '--repack', '--load-mode', '--mlock', '--no-mmap', '--mmap', '-sm', '--split-mode', '-ts',
  '--tensor-split', '-mg', '--main-gpu', '--cache-reuse', '--rpc', '--no-warmup', '--prio', '--poll']);
const ENV_SKIP = /^(LLAMA_MOE_CACHE_|LLAMA_MOE_REGISTER_RAM|LLAMA_MOE_DOORBELL|LLAMA_MOE_RAM_|LLAMA_MOE_DRIVE|LLAMA_MOE_LOOKAHEAD|GGML_RPC_|GGML_CUDA_WDDM_BUDGET|CUDA_VISIBLE_DEVICES)/;

// The engine key: a short hash of the engine (its marker and its file), every brain or drafter file it was given (by
// path, size and time, so a file downloaded again under the same name counts as new) and every setting and Bob-set
// switch (LLAMA_ / GGML_ / CUDA_ values) that could change what the engine read. stat is injectable for tests.
export function placeKey({ exe = '', engine = '', args = [], env = {}, stat = (f) => fs.statSync(f) } = {}) {
  const parts = [`engine=${engine}`];
  const ident = (f) => { try { const st = stat(f); return `${path.basename(f)}:${st.size}:${Math.round(st.mtimeMs)}`; } catch { return `${path.basename(f)}:none`; } };
  if (exe) parts.push(`exe=${ident(exe)}`);
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (KEY_SKIP.has(a)) { const next = args[i + 1]; if (next !== undefined && !/^-[a-z-]/i.test(String(next))) i++; continue; }
    parts.push(/\.gguf$/i.test(a) ? `file=${ident(a)}` : a);
  }
  for (const k of Object.keys(env || {}).filter((k) => /^(LLAMA_|GGML_|CUDA_)/.test(k) && !ENV_SKIP.test(k)).sort()) parts.push(`${k}=${env[k]}`);
  return crypto.createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 10);
}

// The switches Bob gives the engine on top of the computer's own (what placeKey reads).
export const ownEnv = (env = {}, base = process.env) => Object.fromEntries(Object.entries(env || {}).filter(([k, v]) => /^(LLAMA_|GGML_|CUDA_)/.test(k) && base[k] !== v));

// Room on the drive for a save of about `need` bytes: 5% of the drive stays free after it, at least 8 GB and at most
// 32 GB (llamAmpere's rule: a flat 10% kept 183 GB free on a 1.8 TB drive). statfs is injectable for tests; a drive
// that can't be asked doesn't stop the save.
export function diskRoom(dir, need = 0, { statfs = fs.statfsSync } = {}) {
  let st;
  try { st = statfs(dir); } catch { return { ok: true, unknown: true }; }
  const total = Number(st.blocks) * Number(st.bsize), free = Number(st.bavail) * Number(st.bsize);
  if (!(total > 0)) return { ok: true, unknown: true };
  const keep = Math.min(32e9, Math.max(8e9, total * 0.05));
  return { ok: free - need >= keep, free, keep };
}

// GUPPI's size for the engine's RAM cache of chats (llama.cpp's --cache-ram, MiB): at most half of the RAM that is free
// once the brain's own part in RAM is counted and GUPPI's keep-free amount is set aside, and no more than llama.cpp's
// own 8 GB. brainRamBytes: the part of the brain (and its chat memory) expected in RAM, not on the card.
export const RAM_CACHE_MAX_MIB = 8192;
export function ramCacheMiB({ freeBytes = 0, brainRamBytes = 0, keepBytes = 512 * 1048576 } = {}) {
  const room = (Number(freeBytes) || 0) - Math.max(0, Number(brainRamBytes) || 0) - Math.max(0, Number(keepBytes) || 0);
  return Math.max(0, Math.min(RAM_CACHE_MAX_MIB, Math.floor(room / 2 / 1048576)));
}

// Nov 27 (1.5.255, 35B rental try 6): in a container (a rented pod, Docker) the free RAM Node reports is the host's,
// not what the container may use, so the cache was sized from 224 GB free while the pod had 30 GB, and the engine was
// killed (SIGKILL) as the cache filled. On Linux the container's own limit counts too. Infinity when there is none.
// read is swapped in by the tests.
export function containerFreeBytes(read = (f) => fs.readFileSync(f, 'utf8'), platform = process.platform) {
  if (platform !== 'linux') return Infinity;
  const num = (f) => { try { const t = String(read(f)).trim(); return /^\d+$/.test(t) ? Number(t) : NaN; } catch { return NaN; } };
  let limit = num('/sys/fs/cgroup/memory.max'), used = num('/sys/fs/cgroup/memory.current');
  if (!Number.isFinite(limit)) { limit = num('/sys/fs/cgroup/memory/memory.limit_in_bytes'); used = num('/sys/fs/cgroup/memory/memory.usage_in_bytes'); }
  if (!Number.isFinite(limit) || limit <= 0 || limit >= 2 ** 60) return Infinity; // "max" or v1's "no limit"
  return Math.max(0, limit - (Number.isFinite(used) ? used : 0));
}

// The newest few, under the size limit; everything else goes. keepName (one name or a list: the one just saved, the
// one about to be loaded) is never removed, and counts first. A tmp- file left by a save that never finished goes too.
export function tidyPlaces(dir, { keep = PLACES_KEEP, maxBytes = PLACES_MAX_BYTES, keepName = '' } = {}) {
  const keepSet = new Set([].concat(keepName).filter(Boolean));
  let files = [];
  try {
    for (const f of fs.readdirSync(dir)) if (/^tmp-place-[\w.-]+\.bin$/.test(f) && !keepSet.has(f)) { try { fs.rmSync(path.join(dir, f), { force: true }); } catch {} }
    files = fs.readdirSync(dir).filter((f) => /^place-[\w.-]+\.bin$/.test(f)).map((f) => { const st = fs.statSync(path.join(dir, f)); return { f, t: st.mtimeMs, size: st.size }; }).sort((a, b) => (keepSet.has(b.f) - keepSet.has(a.f)) || b.t - a.t);
  } catch { return []; }
  const gone = [];
  let total = 0, n = 0;
  for (const x of files) {
    total += x.size; n++;
    if (!keepSet.has(x.f) && (n > keep || total > maxBytes)) { try { fs.rmSync(path.join(dir, x.f), { force: true }); gone.push(x.f); } catch {} total -= x.size; n--; }
  }
  return gone;
}

export function placesUsed(cfg) {
  try { const dir = placesDir(cfg); const fs2 = fs.readdirSync(dir).filter((f) => /^place-[\w.-]+\.bin$/.test(f)); return { count: fs2.length, bytes: fs2.reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0) }; } catch { return { count: 0, bytes: 0 }; }
}

export function clearPlaces(cfg) { try { fs.rmSync(placesDir(cfg), { recursive: true, force: true }); } catch {} }
