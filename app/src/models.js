// Bob's model shop: what models exist, which are already on this PC (Ollama, ComfyUI, Maestro...),
// downloading new ones one at a time with progress and a checksum, and switching Bob over to them.
// Every download starts from a click in Bob's window. Bob never downloads a model on his own.
import { deadline as withDeadline, quietGuard } from './hang-guard.js'; // item 212
import { ownEntries, ownModels, ownResolve } from './own-models.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { appDir, saveSettings } from './config.js';
import { ENGINES, engineStatus, engineChoices, installEngine, latestEngine, fetchMissing } from './engines.js';
import { audioReady, voicesReady, aceModelsDir, aceFileOk, tidyAceCache } from './audio.js';
import { maestroModels } from './maestro.js';
import { gpuInfo, cpuName, specLine, shownRamGB, OS } from './platform.js';
import { packFor } from '../public/fit.js';
import { allSlots, slotValue } from '../public/equip.js';
import { mergeMadeBrains } from './lab.js'; // 1.5.141

const MODEL_EXT = new Set(['.gguf', '.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.sft']);
const SKIP = new Set(['node_modules', '.git', '__pycache__', 'site-packages', 'venv', '.venv', 'env', 'cache', '.cache', 'Lib', 'include', 'temp', 'tmp', 'logs', 'blobs']);
const MIN_BYTES = 20e6;
const ALLOWED_HOSTS = [/^huggingface\.co$/, /\.huggingface\.co$/, /\.hf\.co$/, /^github\.com$/, /\.githubusercontent\.com$/];

export function hostAllowed(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && ALLOWED_HOSTS.some((r) => r.test(url.hostname));
  } catch { return false; }
}

// Guess what a loose model file is for, from its folder and name.
export function guessKind(p) {
  const s = p.toLowerCase().replace(/\\/g, '/');
  if (/wan|ltx|hunyuan|cogvideo|mochi|animatediff|svd|video|skyreels|vace|framepack/.test(s)) return 'video';
  if (/whisper|tts|kokoro|piper|xtts|f5|ace-?step|audio|music|voice/.test(s)) return 'voice';
  if (/lora/.test(s)) return 'images';
  if (/\/(checkpoints|diffusion_models|unet|vae|text_encoders|clip|controlnet|upscale_models|embeddings)\//.test(s) || /flux|sdxl|sd3|z[-_]?image|qwen[-_]image|hidream|stable/.test(s)) return 'images';
  if (/coder|code/.test(s)) return 'coding';
  if (/vl|vision|llava|mmproj/.test(s)) return 'vision';
  if (s.endsWith('.gguf')) return 'chat';
  return 'other';
}

export function ownerOf(p) {
  const s = p.toLowerCase().replace(/\\/g, '/');
  if (/\/models\/bob\//.test(s)) return 'Bob';
  if (/comfy/.test(s)) return 'ComfyUI';
  if (/maestro|wan2gp|wangp/.test(s)) return 'Maestro';
  if (/pinokio/.test(s)) return 'Pinokio';
  // 1.5.66: only Ollama's own folders (blobs, manifests) are Ollama's; models\<id>\ copies are Bob's (idFolderFile).
  if (/ollama|\/models\/(?:blobs|manifests)\//.test(s)) return 'Ollama';
  if (/\/models\/[\w.-]+\/[^/]+\.gguf$/.test(s)) return 'Bob';
  return 'other';
}

export function fileNameOf(url) {
  return decodeURIComponent(new URL(url).pathname.split('/').pop());
}
// 1.5.56: the name a catalog file is saved under. Several repos call their picture reader "mmproj-F16.gguf", so those
// entries give it a name of their own (saveAs, a plain file name only); everything else keeps the name in the link.
export function saveNameOf(f) {
  return typeof f?.saveAs === 'string' && /^[\w][\w.+-]{0,150}$/.test(f.saveAs) ? f.saveAs : fileNameOf(f.url);
}

// 1.5.65: a copy that was put in a folder named after the model, next to Bob's own folder
// (Bob home\models\<id>\, as a hand download or a test lands), counts too: the saved name or the name in the link,
// at the right size when the catalog knows it, and not half downloaded. Then Get models doesn't fetch it again.
export function idFolderFile(cfg, entry, f) {
  if (!entry?.id || !/^[\w.-]+$/.test(entry.id) || !f?.url) return null;
  const bobDir = cfg.bobModelsDir || path.join(cfg.agentDir || '', 'models', 'bob');
  const dir = path.join(path.dirname(bobDir), entry.id);
  for (const name of [...new Set([saveNameOf(f), fileNameOf(f.url)])]) {
    const p = path.join(dir, name);
    try {
      if (fs.existsSync(p + '.part')) continue;
      const size = fs.statSync(p).size;
      if (f.bytes && size !== f.bytes) continue;
      return p;
    } catch {}
  }
  return null;
}

// Fill in "$model" and "$file:role" in an entry's "use" block.
export function resolveUse(use, values) {
  if (typeof use === 'string') {
    if (use === '$model') return values.model;
    if (use.startsWith('$file:')) return values.files[use.slice(6)];
    return use;
  }
  if (Array.isArray(use)) return use.map((u) => resolveUse(u, values));
  if (use && typeof use === 'object') return Object.fromEntries(Object.entries(use).map(([k, v]) => [k, resolveUse(v, values)]));
  return use;
}

// Live progress for a download: speed and time left (smoothed), plus a heartbeat every second so the
// window keeps moving during steps that send no bytes (looking up links, checking, unpacking).
export function ticker(pub, emit) {
  pub.startedAt = Date.now();
  let lastAt = Date.now(), lastDone = 0, lastPhase = '';
  const tick = () => {
    const now = Date.now();
    if (pub.phase !== lastPhase) { lastPhase = pub.phase; pub.phaseAt = now; lastAt = now; lastDone = pub.done; pub.rate = 0; }
    const dt = (now - lastAt) / 1000;
    if (dt >= 0.9) {
      const r = Math.max(0, (pub.done - lastDone) / dt);
      pub.rate = pub.rate ? pub.rate * 0.7 + r * 0.3 : r;
      lastAt = now; lastDone = pub.done;
    }
    pub.eta = pub.phase === 'downloading' && pub.rate > 1e4 && pub.total > pub.done ? Math.round((pub.total - pub.done) / pub.rate) : null;
    pub.elapsed = Math.round((now - pub.startedAt) / 1000);
    emit({ type: 'download', ...pub });
  };
  const beat = setInterval(tick, 1000);
  beat.unref?.();
  return { tick, stop: () => clearInterval(beat) };
}

// What a failed link means, in plain words. 401/403: the model is gated (an account and accepted terms);
// 404: the file moved. Neither is worth retrying.
export function linkError(name, status) {
  if (status === 401 || status === 403) return `This model needs a Hugging Face account to download (${name}, ${status}). Bob doesn't sign in for you.`;
  return `The link for ${name} is broken (${status}).`;
}

// 1.5.32: HEAD a download link, following up to 5 same-site redirects (301/302/307/308, relative or not) until a hop
// carries x-linked-size or answers 200. A redirect to another host (the file storage) stops there: that hop's headers
// already describe the file.
export async function headFile(url, signal) {
  let u = url, r;
  for (let hop = 0; hop < 6; hop++) {
    r = await fetch(u, { method: 'HEAD', redirect: 'manual', signal: withDeadline(signal, 30_000) }); // item 212
    if (![301, 302, 307, 308].includes(r.status) || r.headers.get('x-linked-size')) return r;
    const loc = r.headers.get('location');
    if (!loc) return r;
    const next = new URL(loc, u);
    if (next.host !== new URL(u).host || !hostAllowed(next.href)) return r;
    u = next.href;
  }
  return r;
}

// 1.5.32: { size, sha256 } of a Hugging Face file from its repo's file list (the same host), or null if it can't be read.
export async function hfFileInfo(url, signal) {
  const m = String(url).match(/^https:\/\/huggingface\.co\/([\w.-]+\/[\w.-]+)\/resolve\/([\w.-]+)\/(.+)$/);
  if (!m) return null;
  const [, repo, rev, file] = m;
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
  try {
    const r = await fetch(`https://huggingface.co/api/models/${repo}/tree/${rev}${dir ? '/' + dir.split('/').map(encodeURIComponent).join('/') : ''}`, { signal: withDeadline(signal, 30_000) });
    if (!r.ok) return null;
    const hit = (await r.json()).find((x) => x.path === decodeURIComponent(file));
    if (!hit) return null;
    const size = Number(hit.lfs?.size ?? hit.size);
    return Number.isFinite(size) && size > 0 ? { size, sha256: /^[0-9a-f]{64}$/.test(hit.lfs?.oid || '') ? hit.lfs.oid : null } : null;
  } catch { return null; }
}

// 1.5.104: the .gguf a brain was given by hand in config.json (llamacpp.models), if that file is really there.
export function configuredGguf(cfg, entry) {
  const map = cfg?.llamacpp?.models || {};
  for (const key of [entry?.id, entry?.ollama, entry?.ollama && `${entry.ollama}:latest`].filter(Boolean)) {
    const v = map[key];
    const p = typeof v === 'string' ? v : v?.gguf;
    if (p && typeof p === 'string' && /\.gguf$/i.test(p)) { try { if (fs.statSync(p).isFile()) return p; } catch {} }
  }
  return null;
}

// 1.5.131: the bracket after a model Bob downloaded himself (a file in his models folder, run on his own engine), as
// Equip Bob and the Settings menus show it. Until 1.5.130 it said "(Bob's own engine)", which read as "Bob's own brain"
// on every stock Qwen and Gemma. Only a catalogue entry marked madeByBob: true (a brain made for Bob, none shipped yet)
// gets "Bob's own brain"; a fuzzy name match never does. Ollama's models get their Ollama name instead (roles()).
export const MADE_BY_BOB = "Bob's own brain";
export const isMadeByBob = (m) => m?.madeByBob === true;
// 1.5.133: a file you put somewhere yourself (set by hand in config.json, or found in another app's folder) says "(your own file)".
// 1.5.137: a file Bob downloaded himself gets no bracket at all (the owner: "models don't need to say downloaded by
// Bob"); that's the usual case, so only the unusual ones are marked. gguf = the file found for it, when known.
export const YOUR_OWN_FILE = 'your own file';
const inBobsFolder = (m, p) => { const s = String(p).toLowerCase().replace(/\\/g, '/'); return s.includes('/models/bob/') || (Boolean(m?.id) && s.includes(`/models/${String(m.id).toLowerCase()}/`)); };
export const fileTag = (m, gguf = null) => (isMadeByBob(m) ? MADE_BY_BOB : gguf && !inBobsFolder(m, gguf) ? YOUR_OWN_FILE : '');
export const fileLabel = (m, gguf = null) => { const t = fileTag(m, gguf); return t ? `${m.name} (${t})` : m.name; };

// 1.5.137: how a rented machine fetches a brain from Bob's list: its brain file as Owner/Repo/file.gguf (the form Add a
// rental takes, src/rental.js modelSpec). '' for a brain without one.
export function rentAsOf(m) {
  const f = (m.files || []).find((x) => x.role === 'gguf');
  const hit = String(f?.url || '').match(/^https:\/\/huggingface\.co\/([\w.-]+\/[\w.-]+)\/resolve\/[0-9a-f]{40}\/([^?#]+\.gguf)$/i);
  return hit ? `${hit[1]}/${hit[2]}` : '';
}

export class ModelShop {
  constructor(cfg, emit, engine) {
    this.cfg = cfg;
    this.emit = emit;
    this.engine = engine;
    this.dir = cfg.bobModelsDir;
    this.scanFile = path.join(cfg.dataDir, 'model-scan.json');
    this.shipped = JSON.parse(fs.readFileSync(cfg.catalogFile || path.join(appDir, 'catalog.json'), 'utf8'));
    mergeMadeBrains(this.shipped, cfg); // 1.5.141: brains made in the Lab and put into Bob (kept under any newer list)
    this.catalog = this.shipped; // 1.5.137: or the newest list from GitHub laid over it (src/catalog-update.js)
    try { this.found = JSON.parse(fs.readFileSync(this.scanFile, 'utf8')); } catch { this.found = { at: null, files: [] }; }
    this.active = new Map(); // downloads running now: id -> { ac, pub, kind }
    this.dl = this.loadDownloads();
    this.scanning = null;
  }

  roots() {
    return [...new Set([this.dir, ...(this.cfg.modelSearchRoots || [])])].filter((r) => fs.existsSync(r));
  }

  // Walk the model folders (Ollama, ComfyUI, Maestro, Pinokio) and remember every big model file.
  scan() {
    if (this.scanning) return this.scanning;
    this.scanning = (async () => {
      const files = [];
      const walk = async (dir, depth) => {
        if (depth > 9 || files.length > 5000) return;
        let entries;
        try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) await walk(p, depth + 1); continue; }
          if (!e.isFile() || !MODEL_EXT.has(path.extname(e.name).toLowerCase())) continue;
          if (e.name.endsWith('.part')) continue;
          try {
            const st = await fsp.stat(p);
            if (st.size >= MIN_BYTES) files.push({ path: p, name: e.name, size: st.size, kind: guessKind(p), owner: ownerOf(p) });
          } catch {}
        }
      };
      for (const r of this.roots()) await walk(r, 0);
      this.found = { at: new Date().toISOString(), files };
      try { fs.writeFileSync(this.scanFile, JSON.stringify(this.found, null, 1)); } catch {}
      return this.found;
    })().finally(() => { this.scanning = null; });
    return this.scanning;
  }

  async ollamaNames() {
    if (this.cfg.engine === 'llamacpp' && !this.cfg.ollamaUrl) return null;
    try {
      const r = await fetch(this.cfg.ollamaUrl.replace(/\/$/, '') + '/api/tags', { signal: AbortSignal.timeout(3000) });
      return new Set((await r.json()).models.map((m) => m.name));
    } catch { return null; }
  }

  // Ollama keeps its models as blobs; read the manifests so Bob knows them even when Ollama is off.
  ollamaManifests() {
    const base = path.join(this.cfg.llamacpp?.ollamaModelsDir || path.join(this.cfg.agentDir, 'models'), 'manifests', 'registry.ollama.ai', 'library');
    const names = new Set();
    try {
      for (const m of fs.readdirSync(base)) for (const t of fs.readdirSync(path.join(base, m))) names.add(`${m}:${t}`);
    } catch {}
    return names;
  }

  // 1.5.37: where a file of this entry lives. Most go in Bob's models folder by category; an entry with "into" goes
  // where its engine looks for it (ACE-Step's music models go in its own checkpoints folder, at their repo paths).
  dest(entry, f) {
    if (entry.into === 'ace-checkpoints' && f.path) {
      const root = aceModelsDir(this.cfg);
      const p = path.resolve(root, f.path);
      if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error('A catalog file pointed outside its folder.');
      return p;
    }
    return path.join(this.dir, entry.category, saveNameOf(f));
  }

  // Where each of an entry's files is on this PC, if anywhere. Bob's own folder first, then anything the scan found.
  locate(entry) {
    const out = {};
    for (const f of entry.files || []) {
      if (entry.into) { // only its own folder counts, and only at the right size (half a download doesn't)
        const p = this.dest(entry, f);
        try { const size = fs.statSync(p).size; if (!f.bytes || aceFileOk(f, size)) out[f.role] = p; } catch {}
        continue;
      }
      const name = saveNameOf(f);
      const mine = path.join(this.dir, entry.category, name);
      if (fs.existsSync(mine)) { out[f.role] = mine; continue; }
      const byId = idFolderFile(this.cfg, entry, f);
      if (byId) { out[f.role] = byId; continue; }
      const alt = [name, ...(f.aka || [])].map((n) => n.toLowerCase());
      const hit = this.found.files.find((x) => alt.includes(x.name.toLowerCase()));
      if (hit && fs.existsSync(hit.path)) out[f.role] = hit.path; // the scan can be out of date
    }
    return out;
  }

  async statusOf(entry, ollama) {
    const pulled = entry.ollama && ((ollama && ollama.has(entry.ollama)) || this.ollamaManifests().has(entry.ollama));
    const located = this.locate(entry);
    const need = (entry.files || []).length;
    const have = Object.keys(located).length;
    let state = 'missing';
    // 1.5.104: a brain set by hand in config.json (llamacpp.models, id or Ollama name -> its .gguf) counts as here.
    const byHand = !pulled && !(need && have === need) && configuredGguf(this.cfg, entry);
    if (pulled || (need && have === need) || byHand) state = 'installed';
    else if (have) state = 'partial';
    const where = pulled ? ['Ollama'] : byHand ? ['config.json'] : [...new Set(Object.values(located).map(ownerOf))];
    const canDownload = Boolean((entry.ollama && ollama) || need);
    return { state, where, located, canDownload };
  }

  async list() {
    const ollama = await this.ollamaNames();
    const models = [];
    for (const m of this.catalog.models) models.push({ ...m, files: (m.files || []).map((f) => ({ name: saveNameOf(f), role: f.role })), rentAs: rentAsOf(m), status: await this.statusOf(m, ollama) });
    for (const e of ownEntries(this.cfg)) models.push(e); // 1.5.135: brains of your own, from files on this replicant matrix
    const known = new Set(models.flatMap((m) => Object.values(m.status.located).map((p) => p.toLowerCase())));
    const extras = this.found.files.filter((f) => !known.has(f.path.toLowerCase()) && f.owner !== 'Ollama');
    return {
      categories: this.catalog.categories, packs: this.catalog.packs, models, extras, engines: engineStatus(this.cfg), engineChoices: engineChoices(this.cfg),
      bigBrains: this.catalog.bigBrains || [], updated: this.catalog.updated || '', // 1.5.137: the really big brains (Rented brains) and the list's date
      scannedAt: this.found.at, ollamaRunning: Boolean(ollama), job: this.job, downloads: this.downloadsView(),
      active: { engine: this.cfg.engine, models: this.cfg.models, painter: this.cfg.painter?.engine, stt: this.cfg.stt?.provider }
    };
  }

  async hardware() {
    // NVIDIA cards through nvidia-smi; a Mac's share of its shared memory; built-in graphics (src/platform.js).
    const gpu = await gpuInfo();
    let freeGB = null;
    try { const s = fs.statfsSync(this.cfg.agentDir); freeGB = Math.round((s.bavail * s.bsize) / 1e9); } catch {}
    const vram = gpu?.vramGB ?? this.cfg.gpuVramGB ?? 0;
    // 1.5.71: built-in graphics get their own set (brains only: pictures and video aren't tested there yet).
    const ramGB = Math.round(os.totalmem() / 1024 ** 3) || null; // for brains that spill out of the graphics card into RAM
    // ARM Linux (Raspberry Pi 5 and other 64-bit ARM boards): Bob runs on the processor there and gets the small sets.
    const board = OS === 'linux' && process.arch === 'arm64' ? 'arm' : null;
    const pack = packFor(this.catalog.packs, vram, Boolean(gpu?.integrated), { arm: Boolean(board), ramGB });
    // 1.5.89: the replicant matrix's name tag (processor, graphics, memory) for the muted spec line beside its name.
    const cpu = cpuName() || null;
    // 1.5.126: on a shared-memory machine, the RAM really installed, the part set aside for graphics and what Windows sees.
    const apu = gpu?.integrated && gpu.installedRamGB ? { installedRamGB: gpu.installedRamGB, reservedGraphicsGB: gpu.reservedGraphicsGB, visibleRamGB: gpu.visibleRamGB } : {};
    return { gpu, freeGB, vramGB: vram || null, ramGB, ...apu, board, suggestedPack: pack.id, cpu, spec: specLine({ cpu, gpu, ramGB: shownRamGB(os.totalmem()) || ramGB }) };
  }

  // ---- The download manager ----
  // Every download the user confirms goes on a list (inn\bob\downloads.json), so nothing is lost if Bob closes.
  // One or two run at a time (Settings, Downloads); each can be paused, resumed, cancelled or moved up and down.
  // Model files resume where they stopped (a .part file plus an HTTP Range request); Ollama models resume
  // through Ollama itself; engines start over (they're small).
  get dlFile() { return path.join(this.cfg.dataDir, 'downloads.json'); }

  // ---- 1.5.91: slots to fill once a download is in, kept by Bob himself ----
  // Before, the window remembered this (in the browser), so a model finished while Get models was closed sat unused.
  // Now each download can say which slots it's for (Get Bob ready, the chat's Set it up card), and Bob fills them
  // the moment it's done, window open or not. { modelId: ['image', ...] }
  get equipFile() { return path.join(this.cfg.dataDir, 'equip-plan.json'); }
  loadEquip() { try { const p = JSON.parse(fs.readFileSync(this.equipFile, 'utf8')); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
  saveEquip(p) { try { Object.keys(p).length ? fs.writeFileSync(this.equipFile, JSON.stringify(p, null, 2)) : fs.rmSync(this.equipFile, { force: true }); } catch {} }
  planEquip(map = {}) {
    const ids = new Set(allSlots().map((x) => x.id).concat(['speech', 'voice', 'image', 'video', 'edit', 'music', 'sfx']));
    const p = this.loadEquip();
    for (const [id, slots] of Object.entries(map || {})) {
      if (!this.catalog.models.some((m) => m.id === id)) continue;
      const ok = [].concat(slots || []).map(String).filter((x) => ids.has(x));
      if (ok.length) p[id] = [...new Set([...(p[id] || []), ...ok])];
    }
    this.saveEquip(p);
    return p;
  }
  // Fill the slots of every planned model that's on this replicant matrix now. equipHook (server.js) saves each one
  // the same way the window's Equip does. Returns what was filled, as [{ id, slot, value }].
  async applyEquip() {
    const plan = this.loadEquip();
    const ids = Object.keys(plan);
    if (!ids.length || !this.equipHook) return [];
    const ollama = await this.ollamaNames();
    let roles = null;
    const done = [];
    for (const id of ids) {
      const entry = this.catalog.models.find((m) => m.id === id);
      if (!entry) { delete plan[id]; continue; }
      if ((await this.statusOf(entry, ollama)).state !== 'installed') continue;
      roles = roles || await this.roles().catch(() => null);
      for (const sid of plan[id]) {
        const slot = allSlots().find((x) => x.id === sid) || { id: sid, how: 'job', kind: ModelShop.JOBS.find((j) => j.id === sid)?.kind || sid };
        const value = slotValue(slot, entry, roles) || (slot.kind !== 'llm' ? entry.id : '');
        if (!value) continue;
        try { await this.equipHook(slot, value); done.push({ id, slot: sid, value }); } catch { /* a slot that won't take it stays as it was */ }
      }
      delete plan[id];
    }
    this.saveEquip(plan);
    if (done.length) this.emit({ type: 'equipped', items: done });
    return done;
  }
  get job() { return [...this.active.values()][0]?.pub || null; } // the first one running, for older callers
  get concurrent() { return this.cfg.downloads?.concurrent === 2 ? 2 : 1; }

  loadDownloads() {
    let list = [];
    try { list = JSON.parse(fs.readFileSync(this.dlFile, 'utf8')); } catch {}
    if (!Array.isArray(list)) list = [];
    const keep = Date.now() - 7 * 864e5;
    // Opt-in: off unless the user turns it on, here or with "Pick up where Bob left off after a restart" (1.5.38).
    const resume = this.cfg.downloads?.resumeOnStart === true || this.cfg.resumeJobs === true;
    return list.filter((d) => d && typeof d.id === 'string' && d.name && !(['done', 'cancelled'].includes(d.state) && (d.doneAt || 0) < keep)).map((d) => {
      if (d.state === 'downloading' || d.state === 'queued') {
        if (resume) return { ...d, state: 'queued', retryAt: 0 };
        return { ...d, state: 'paused', note: d.state === 'downloading' ? 'Bob was closed while this was downloading. Press Resume to carry on.' : 'Waiting from last time. Press Resume to start it.' };
      }
      return d;
    });
  }

  saveDownloads() {
    try { fs.mkdirSync(path.dirname(this.dlFile), { recursive: true }); fs.writeFileSync(this.dlFile, JSON.stringify(this.dl, null, 1)); } catch {}
    this.emit({ type: 'downloads', items: this.downloadsView() });
  }

  downloadsView() {
    return this.dl.map((d) => {
      const live = this.active.get(d.id)?.pub;
      const { id, name, kind, state, addedAt, doneAt, error, note, tries, retryAt, viaOllama } = d;
      return { id, name, kind, state, addedAt, doneAt, error, note, tries, retryAt, viaOllama,
        phase: live?.phase || state, done: live?.done ?? d.done ?? 0, total: live?.total ?? d.total ?? 0, rate: live?.rate || 0, eta: live?.eta ?? null };
    });
  }

  describe(id) {
    if (id.startsWith('engine:')) {
      const e = ENGINES.find((x) => x.id === id.slice(7).replace(/@(?:newest|missing)$/, ''));
      if (!e) throw new Error('No such engine.');
      return { id, name: e.name, kind: 'engine' };
    }
    const entry = this.catalog.models.find((m) => m.id === id);
    if (!entry) throw new Error('No such model in the catalog.');
    if (entry.gated) throw new Error(`${entry.name} needs a Hugging Face account to download. ${entry.gatedWhy || ''}`.trim());
    return { id, name: entry.name, kind: 'model', total: Math.round(entry.sizeGB * 1e9), viaOllama: Boolean(entry.ollama) };
  }

  // Put downloads on the list (the user already confirmed each one). Returns the first one's progress.
  async download(id, { queue = [] } = {}) {
    const ids = [id, ...queue].map(String);
    const items = ids.map((x) => this.describe(x)); // throws before anything is added if one is unknown
    for (const it of items) {
      const have = this.dl.find((d) => d.id === it.id && ['queued', 'downloading', 'paused', 'failed'].includes(d.state));
      if (have) { if (have.state !== 'downloading') Object.assign(have, { state: 'queued', error: undefined, note: undefined, tries: 0, retryAt: 0 }); continue; }
      this.dl = this.dl.filter((d) => d.id !== it.id);
      this.dl.push({ ...it, state: 'queued', addedAt: Date.now(), tries: 0 });
    }
    this.saveDownloads();
    this.pumpDownloads();
    const first = this.active.get(items[0].id)?.pub;
    return first || { ...this.downloadsView().find((d) => d.id === items[0].id), phase: 'queued', queue: ids.slice(1) };
  }

  pumpDownloads() {
    clearTimeout(this.retryTimer);
    let soonest = Infinity;
    for (const d of this.dl) {
      if (this.active.size >= this.concurrent) break;
      if (d.state !== 'queued') continue;
      if (d.retryAt && d.retryAt > Date.now()) { soonest = Math.min(soonest, d.retryAt); continue; }
      // One engine at a time: they unpack into shared folders and may stop llama-server.
      if (d.kind === 'engine' && [...this.active.values()].some((a) => a.kind === 'engine')) continue;
      this.startDownload(d);
    }
    if (soonest < Infinity) { this.retryTimer = setTimeout(() => this.pumpDownloads(), Math.max(500, soonest - Date.now())); this.retryTimer.unref?.(); }
  }

  startDownload(d) {
    const ac = new AbortController();
    const engine = d.kind === 'engine';
    const entry = engine ? null : this.catalog.models.find((m) => m.id === d.id);
    const after = () => this.dl.filter((x) => x.state === 'queued' && x.id !== d.id).map((x) => x.id);
    const pub = { id: d.id, name: d.name, done: 0, total: d.total || 0, file: '', phase: engine ? 'finding' : 'starting', kind: d.kind, queue: after(),
      steps: engine ? ['finding', 'downloading', 'checking', 'unpacking', 'done'] : entry?.ollama ? ['starting', 'downloading', 'checking', 'done'] : ['starting', 'links', 'downloading', 'checking', 'done'] };
    d.state = 'downloading'; d.error = undefined; d.note = undefined; d.startedAt = Date.now();
    this.active.set(d.id, { ac, pub, kind: d.kind });
    const { tick, stop } = ticker(pub, (e) => { pub.queue = after(); this.emit(e); });
    this.saveDownloads();
    tick();
    (async () => {
      try {
        if (engine) await this.runEngine(d.id.slice(7), pub, ac.signal, tick);
        else await this.runModel(entry, pub, ac.signal, tick);
        // 1.5.91: into its slots now, window open or not, and before "done" goes out (a job waiting for it starts then).
        if (!engine) await this.applyEquip().catch(() => {});
        pub.phase = 'done'; d.state = 'done'; d.doneAt = Date.now(); d.done = d.total = pub.total || pub.done;
        if (pub.note) d.note = pub.note;
        tick();
      } catch (e) {
        const why = ac.signal.aborted ? ac.signal.reason : null;
        d.done = pub.done; d.total = pub.total;
        if (why === 'pause') { d.state = 'paused'; pub.phase = 'paused'; d.note = engine ? 'Paused. An engine starts over when resumed.' : 'Paused. Resume picks up where it stopped.'; }
        else if (why === 'cancel' || ac.signal.aborted) { d.state = 'cancelled'; d.doneAt = Date.now(); pub.phase = 'cancelled'; pub.error = 'Cancelled.'; if (entry) this.dropParts(entry); d.done = 0; }
        else {
          d.tries = (d.tries || 0) + 1;
          d.error = String(e.message || e).slice(0, 300);
          // Network hiccups get two more tries, after 15 s and 1 min. A damaged file or a missing link doesn't.
          const hopeless = /checksum|is missing the|still missing|isn't one of those|different size on the website|changed on the website|no checksum|Not enough disk|No such|redirected|won't install|Python|Smart App Control|Hugging Face account|link .* is broken/i.test(d.error);
          if (!hopeless && d.tries < 3) { d.state = 'queued'; d.retryAt = Date.now() + (d.tries === 1 ? 15e3 : 60e3); pub.phase = 'retrying'; pub.error = `${d.error} Trying again in ${d.tries === 1 ? '15 seconds' : 'a minute'}.`; }
          else { d.state = 'failed'; d.doneAt = Date.now(); pub.phase = 'failed'; pub.error = d.error; }
        }
        tick();
      } finally {
        stop();
        this.active.delete(d.id);
        this.saveDownloads();
        this.pumpDownloads();
      }
    })();
    return pub;
  }

  async runModel(entry, pub, signal, tick) {
    const ollama = await this.ollamaNames();
    if (entry.ollama && ollama) return this.pullOllama(entry, pub, signal, tick);
    if (entry.files?.length) return this.fetchFiles(entry, pub, signal, tick);
    throw new Error(`${entry.name} comes through Ollama, and Ollama isn't running.`);
  }

  async runEngine(eid0, pub, signal, tick) {
    // 1.5.83: "engine:llamacpp@newest" is the "Get newer build" button; plain "engine:llamacpp" gets the tested build.
    const newest = eid0.endsWith('@newest');
    const missing = eid0.endsWith('@missing'); // 1.5.185 Download the missing files of an update kept aside
    const eid = eid0.replace(/@(?:newest|missing)$/, '');
    const hw = await this.hardware();
    // A newer llama.cpp can't overwrite files the running llama-server holds open: let go of it first.
    if (['llamacpp', 'brainengine'].includes(eid) && this.engine?.stopServer) await this.engine.stopServer(); // 1.5.17x: Brain Engine too, now it runs the brains
    const opts = { nvidia: /nvidia|geforce|rtx/i.test(hw.gpu?.name || ''), pub, signal, tick, newest };
    const r = missing ? await fetchMissing(this.cfg, eid, opts) : await installEngine(this.cfg, eid, opts);
    pub.note = `${r.asset} (${r.version})`;
  }

  dropParts(entry) {
    for (const f of entry.files || []) { try { fs.rmSync(this.dest(entry, f) + '.part', { force: true }); } catch {} }
  }

  pause(id) {
    const a = this.active.get(id);
    if (a) { a.ac.abort('pause'); return true; }
    const d = this.dl.find((x) => x.id === id && x.state === 'queued');
    if (!d) return false;
    d.state = 'paused'; d.note = 'Paused before it started.';
    this.saveDownloads();
    return true;
  }

  resume(id) {
    const d = this.dl.find((x) => x.id === id && ['paused', 'failed'].includes(x.state));
    if (!d) return false;
    Object.assign(d, { state: 'queued', error: undefined, note: undefined, retryAt: 0, tries: 0 });
    this.saveDownloads();
    this.pumpDownloads();
    return true;
  }

  // Cancel one (deletes its half-downloaded files), or everything when no id is given.
  cancel(id) {
    const ids = id ? [id] : this.dl.filter((d) => ['queued', 'downloading', 'paused'].includes(d.state)).map((d) => d.id);
    let any = false;
    for (const x of ids) {
      const a = this.active.get(x);
      if (a) { a.ac.abort('cancel'); any = true; continue; }
      const d = this.dl.find((y) => y.id === x && ['queued', 'paused', 'failed'].includes(y.state));
      if (!d) continue;
      d.state = 'cancelled'; d.doneAt = Date.now(); d.done = 0;
      const entry = this.catalog.models.find((m) => m.id === x);
      if (entry) this.dropParts(entry);
      any = true;
    }
    if (any) this.saveDownloads();
    return any;
  }

  // Move a download that hasn't finished in front of another (or to the end with no "before").
  moveDownload(id, before) {
    const open = (d) => ['queued', 'paused', 'downloading', 'failed'].includes(d.state);
    const from = this.dl.findIndex((d) => d.id === id && open(d));
    if (from < 0 || id === before) return false;
    const [d] = this.dl.splice(from, 1);
    const at = before ? this.dl.findIndex((x) => x.id === before && open(x)) : -1;
    if (at < 0) this.dl.push(d); else this.dl.splice(at, 0, d);
    this.saveDownloads();
    this.pumpDownloads();
    return true;
  }

  removeDownload(id) {
    const n = this.dl.length;
    this.dl = this.dl.filter((d) => !(d.id === id && ['done', 'cancelled', 'failed'].includes(d.state)));
    if (this.dl.length !== n) this.saveDownloads();
    return this.dl.length !== n;
  }

  clearDownloads() {
    this.dl = this.dl.filter((d) => !['done', 'cancelled'].includes(d.state));
    this.saveDownloads();
    return true;
  }

  async pullOllama(entry, pub, signal, tick) {
    pub.file = entry.ollama;
    pub.phase = 'downloading';
    const q = quietGuard(signal, 10 * 60_000); // item 212: ten quiet minutes (checking a big file can be quiet a while)
    try {
    const res = await fetch(this.cfg.ollamaUrl.replace(/\/$/, '') + '/api/pull', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: entry.ollama, stream: true }), signal: q.signal
    });
    if (!res.ok) throw new Error(`Ollama said ${res.status}.`);
    let buf = '', last = 0;
    const layers = {};
    const dec = new TextDecoder();
    for await (const chunk of res.body) {
      q.poke();
      buf += dec.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        const j = JSON.parse(line);
        if (j.error) throw new Error('Ollama: ' + j.error);
        // Ollama reports each layer on its own; add them up so the bar covers the whole model.
        if (j.total && j.digest) { layers[j.digest] = [j.completed || 0, j.total]; const v = Object.values(layers); pub.total = v.reduce((t, x) => t + x[1], 0); pub.done = v.reduce((t, x) => t + x[0], 0); }
        if (/verifying/.test(j.status || '')) pub.phase = 'checking';
        if (Date.now() - last > 500) { last = Date.now(); tick(); }
      }
    }
    } catch (e) { if (q.quiet() && !signal?.aborted) throw new Error('Ollama\'s download went quiet for 10 minutes. Try again; it picks up where it stopped.'); throw e; }
    finally { q.done(); }
  }

  async fetchFiles(entry, pub, signal, tick) {
    const located = this.locate(entry);
    const todo = entry.files.filter((f) => !located[f.role]);
    pub.phase = 'links'; pub.fileCount = todo.length; tick();
    // Ask each link for its size and checksum first, so a broken link or a full disk is caught before anything downloads.
    const heads = [];
    for (const f of todo) {
      if (!hostAllowed(f.url)) throw new Error(`I only download from Hugging Face and GitHub. ${f.url} isn't one of those.`);
      // 1.5.32: follow a renamed repo's redirect (Hugging Face answers 307 with a relative address and no file details)
      // until a hop names the file's size; the storage hop itself (another host) isn't asked.
      const r = await headFile(f.url, signal);
      // 1.5.32: a redirect's content-length is the size of the redirect itself, not the file. Only x-linked-size, or the
      // length of a plain 200 answer, is the file's size.
      let size = Number(r.headers.get('x-linked-size') || (r.status === 200 ? r.headers.get('content-length') : 0) || 0);
      if (r.status >= 400) throw new Error(linkError(fileNameOf(f.url), r.status));
      let linked = String(r.headers.get('x-linked-etag') || '').replace(/^W\//, '').replace(/"/g, '');
      // 1.5.32: when the quick check disagrees with the pin, ask Hugging Face's file list before giving up. Some storage
      // answers with headers that don't describe the file (a Wan 2.2 file was refused although it had not changed).
      if ((f.bytes && size && size !== f.bytes) || (f.sha256 && /^[0-9a-f]{64}$/.test(linked) && linked !== f.sha256)) {
        const info = await hfFileInfo(f.url, signal);
        if (info) { size = info.size; linked = info.sha256 || linked; }
      }
      // Every catalog file is pinned (1.5.0): its size, and its sha256 unless marked sizeOnly. A file that changed
      // upstream since this Bob was made is stopped here, before anything downloads.
      if (f.sha256 && /^[0-9a-f]{64}$/.test(linked) && linked !== f.sha256) throw new Error(`${fileNameOf(f.url)} has changed on the website since this Bob was made, so I didn't download it. A newer Bob will have the new one.`);
      if (f.bytes && size && size !== f.bytes) throw new Error(`${fileNameOf(f.url)} is a different size on the website than this Bob expects, so I didn't download it. A newer Bob will have the new one.`);
      const sha = f.sha256 || (f.sizeOnly ? '' : linked);
      heads.push({ f, size: size || f.bytes || 0, sha: /^[0-9a-f]{64}$/.test(sha) ? sha : null });
    }
    const total = heads.reduce((t, h) => t + h.size, 0);
    try {
      const s = fs.statfsSync(this.cfg.agentDir);
      if (total && s.bavail * s.bsize < total * 1.05) throw new Error(`Not enough disk space: need ${(total / 1e9).toFixed(1)} GB.`);
    } catch (e) { if (/disk space/.test(e.message)) throw e; }
    pub.total = total || pub.total;
    pub.done = 0;
    for (const [i, h] of heads.entries()) {
      const name = saveNameOf(h.f);
      pub.file = name; pub.fileIndex = i + 1;
      pub.phase = 'downloading';
      const final = this.dest(entry, h.f);
      fs.mkdirSync(path.dirname(final), { recursive: true });
      const part = final + '.part';
      const hash = crypto.createHash('sha256');
      let have = 0;
      if (fs.existsSync(part)) {
        // Resume: re-hash what's already there.
        pub.phase = 'resuming'; tick();
        for await (const c of fs.createReadStream(part)) { hash.update(c); have += c.length; }
      }
      const base = pub.done;
      const q = quietGuard(signal); // item 212: two quiet minutes and the download stops (it resumes from here next time)
      let res;
      try { res = await fetch(h.f.url, { headers: have ? { range: `bytes=${have}-` } : {}, redirect: 'follow', signal: q.signal }); } catch (e) { q.done(); throw q.quiet() && !signal?.aborted ? new Error(`Download of ${name} didn't start (nothing for 2 minutes). Try again; it picks up where it stopped.`) : e; }
      if (!hostAllowed(res.url)) throw new Error('The download was redirected somewhere I don\'t trust. Stopped.');
      // The server ignored the Range request: start this file again from nothing.
      if (have && res.status === 200) { have = 0; hash.destroy?.(); fs.rmSync(part, { force: true }); return this.fetchFiles(entry, pub, signal, tick); }
      if (!res.ok && res.status !== 206) throw new Error(res.status === 401 || res.status === 403 || res.status === 404 ? linkError(name, res.status) : `Download of ${name} failed (${res.status}).`);
      const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
      let last = 0, got = have;
      try {
        for await (const c of res.body) {
          q.poke();
          hash.update(c);
          got += c.length;
          if (!out.write(c)) await new Promise((r) => out.once('drain', r));
          pub.done = base + got;
          if (Date.now() - last > 500) { last = Date.now(); tick(); }
        }
      } catch (e) { if (q.quiet() && !signal?.aborted) throw new Error(`Download of ${name} stopped coming (nothing for 2 minutes). Try again; it picks up where it stopped.`); throw e; }
      finally { q.done(); await new Promise((r) => out.end(r)); }
      pub.phase = 'checking';
      tick();
      const digest = hash.digest('hex');
      if (h.f.bytes && got !== h.f.bytes) { fs.rmSync(part, { force: true }); throw new Error(`${name} came through the wrong size. I deleted it; try again.`); }
      if (h.sha && digest !== h.sha) { fs.rmSync(part, { force: true }); throw new Error(`${name} came through damaged (checksum didn't match). I deleted it; try again.`); }
      fs.renameSync(part, final);
      pub.done = base + got;
      if (!entry.into) this.found.files.push({ path: final, name, size: got, kind: entry.category, owner: 'Bob' });
    }
    // 1.5.37: ACE-Step's own half-finished download (left before Bob fetched the models himself) is only clutter now.
    if (entry.into === 'ace-checkpoints') tidyAceCache(this.cfg);
    try { fs.writeFileSync(this.scanFile, JSON.stringify(this.found, null, 1)); } catch {}
  }

  // ---- "Who does what": which brain thinks for each job, and which model makes pictures, video and hears ----
  static JOBS = [
    { id: 'bob', label: 'Chat', what: 'Chat, planning, to-do list, reminders', kind: 'llm' },
    { id: 'tinker', label: 'Coding', what: 'Writing and fixing code', kind: 'llm' },
    { id: 'ledger', label: 'Spreadsheets', what: 'Data entry and spreadsheets', kind: 'llm' },
    { id: 'scout', label: 'Research', what: 'Web research with sources', kind: 'llm' },
    { id: 'reviewer', label: 'Review', what: 'Careful review of code and plans', kind: 'llm' },
    { id: 'painter', label: 'Image & video prompts', what: 'Writes the picture and video prompts', kind: 'llm' },
    { id: 'eyes', label: 'Seeing pictures', what: 'Looks at pictures you attach (needs a vision model)', kind: 'llm' },
    { id: 'image', label: 'Pictures', what: 'Paints the picture', kind: 'images' },
    { id: 'edit', label: 'Picture edits', what: 'Keeps a character or scene looking the same from a reference', kind: 'edit' },
    { id: 'video', label: 'Video', what: 'Films the clip', kind: 'video' },
    { id: 'voice', label: 'Hearing you', what: 'Turns your voice into text', kind: 'voice' },
    { id: 'speech', label: "Bob's voice", what: 'Reads his replies aloud (🔈 button)', kind: 'speech' },
    { id: 'music', label: 'Music', what: 'Composes songs and background music', kind: 'music' },
    { id: 'sfx', label: 'Sound effects', what: 'Makes short sounds for games and videos', kind: 'sfx' }
  ];

  // "Get newer build": what's installed against the newest release with a Windows build.
  async engineLatest(id) {
    const hw = await this.hardware();
    return latestEngine(this.cfg, id, /nvidia|geforce|rtx/i.test(hw.gpu?.name || ''));
  }

  async capsOf(name) {
    this.capsCache ||= new Map();
    if (this.capsCache.has(name)) return this.capsCache.get(name);
    let caps = [];
    try { if (this.engine?.show) caps = (await Promise.race([this.engine.show(name), new Promise((_, no) => setTimeout(no, 3000).unref?.())]))?.capabilities || []; } catch {}
    if (caps.length) this.capsCache.set(name, caps); // an empty answer (engine asleep) is asked again next time
    return caps;
  }

  async roles() {
    const ollama = await this.ollamaNames();
    const names = new Set([...(ollama || []), ...this.ollamaManifests()]);
    const llms = [...names].filter((n) => !/embed|-base\b|:.*-base/.test(n)).sort().map((n) => {
      const m = this.catalog.models.find((x) => x.ollama === n);
      return { value: n, label: m ? `${m.name} (${n})` : n };
    });
    // Brains not in Bob's list: ask the engine what each can do (vision, tools...), so Equip Bob only offers
    // them for jobs they can do. Asked once per name.
    await Promise.all(llms.filter((o) => !this.catalog.models.some((x) => x.ollama === o.value)).map(async (o) => { o.caps = await this.capsOf(o.value); }));
    const ownEmbed = []; // 1.5.72: an embedding model downloaded as a file (nomic-embed-text), for Bob's own engine
    const opts = { images: [], edit: [], video: [], voice: [], speech: [{ value: 'windows', label: 'Windows voices (built in)' }], music: [], sfx: [] };
    const aw = audioReady(this.cfg);
    if (aw.music) opts.music.push({ value: 'ace-step', label: 'ACE-Step (audio tools)' });
    if (aw.sfx) opts.sfx.push({ value: 'audioldm2', label: 'AudioLDM 2 (audio tools, personal use)' });
    if (voicesReady(this.cfg).chatterbox) opts.speech.push({ value: 'chatterbox', label: 'Chatterbox (graphics card, most natural)' });
    for (const m of this.catalog.models) {
      const st = await this.statusOf(m, ollama);
      if (st.state !== 'installed') continue;
      if (m.category === 'embed') { if (st.located.gguf) ownEmbed.push({ value: m.id, label: fileLabel(m, st.located.gguf) }); continue; }
      if (st.located.gguf && !llms.some((l) => l.value === m.id)) llms.push({ value: m.id, label: fileLabel(m, st.located.gguf) });
      if (m.use?.painter?.sdcpp?.edit) opts.edit.push({ value: m.id, label: m.name });
      else if (opts[m.category]) opts[m.category].push({ value: m.id, label: m.name });
    }
    // 1.5.135: brains of your own (files on this replicant matrix), by their id; the engine gets the file when equipped.
    for (const e of ownEntries(this.cfg)) if (e.status.state === 'installed' && !llms.some((l) => l.value === e.id)) llms.push({ value: e.id, label: `${e.name} (${e.madeByBob ? MADE_BY_BOB : YOUR_OWN_FILE})`, caps: ['completion', 'tools', ...(e.ownMmproj ? ['vision'] : [])] });
    if (this.cfg.comfy?.workflowFile && fs.existsSync(this.cfg.comfy.workflowFile)) opts.images.push({ value: 'comfy', label: 'ComfyUI (my own workflow)' });
    let maestro = [];
    // Maestro is opt-in (maestro.enabled): Bob paints and films himself by default.
    if (this.cfg.maestro?.enabled) { try { maestro = await maestroModels(this.cfg); } catch {} }
    for (const m of maestro) {
      const note = m.downloaded === false ? ', downloads on first use' : '';
      opts[m.kind].push({ value: `maestro:${m.modelType}`, label: `Maestro: ${m.label}${note}`, group: 'maestro' });
    }
    if (names.has(this.cfg.stt?.model || 'gemma4:e4b') || names.has('gemma4:e4b')) opts.voice.push({ value: 'ollama:gemma4:e4b', label: 'Gemma 4 E4B through Ollama' });
    const p = this.cfg.painter || {};
    const imgNow = p.engine === 'comfy' ? (this.cfg.comfy?.workflowFile && fs.existsSync(this.cfg.comfy.workflowFile) ? 'comfy' : '') : this.catalog.models.find((m) => m.category === 'images' && m.use?.painter && p.sdcpp?.image?.diffusionModel && this.locate(m).diffusionModel === p.sdcpp.image.diffusionModel)?.id || '';
    const vidNow = this.catalog.models.find((m) => m.category === 'video' && p.sdcpp?.video?.diffusionModel && this.locate(m).diffusionModel === p.sdcpp.video.diffusionModel)?.id || '';
    const sttNow = this.cfg.stt?.provider === 'whispercpp' ? this.catalog.models.find((m) => m.category === 'voice' && this.locate(m).model === this.cfg.stt.model)?.id || '' : this.cfg.stt?.provider === 'ollama' ? `ollama:${this.cfg.stt.model || 'gemma4:e4b'}` : '';
    const mz = this.cfg.maestro || {};
    const imgCur = p.engine === 'maestro' && mz.image ? `maestro:${mz.image}` : imgNow;
    const vidCur = mz.video ? `maestro:${mz.video}` : vidNow;
    const tp = this.cfg.tts?.provider;
    // 1.5.33: with no model file set (Kokoro picked but not downloaded yet), don't match a model that isn't here either.
    const speechNow = tp === 'piper' || tp === 'kokoro' ? (this.cfg.tts?.model && this.catalog.models.find((m) => m.category === 'speech' && m.use?.tts?.provider === tp && this.locate(m).model === this.cfg.tts.model)?.id) || (tp === 'kokoro' ? 'kokoro-v1' : '') : tp === 'chatterbox' ? 'chatterbox' : 'windows';
    const editNow = this.catalog.models.find((m) => m.use?.painter?.sdcpp?.edit && p.sdcpp?.edit?.diffusionModel && this.locate(m).diffusionModel === p.sdcpp.edit.diffusionModel)?.id || '';
    const current = { ...Object.fromEntries(ModelShop.JOBS.filter((j) => j.kind === 'llm').map((j) => [j.id, this.cfg.models?.[j.id] || ''])), image: imgCur, edit: editNow, video: vidCur, voice: sttNow, speech: speechNow, music: aw.music ? 'ace-step' : '', sfx: aw.sfx ? 'audioldm2' : '' };
    // Embedding models (for matching Topics by meaning): Bob's own downloaded file first, then any in Ollama.
    const embed = [...ownEmbed, ...[...names].filter((n) => /embed/.test(n)).sort().map((n) => ({ value: n, label: n }))];
    const embNow = this.cfg.housekeeping?.embedModel || 'nomic-embed-text';
    current.embed = embed.find((o) => o.value === embNow || o.value.split(':')[0] === embNow)?.value || '';
    return { jobs: ModelShop.JOBS, options: { llm: llms, ...opts, embed }, current, maestroRunning: maestro.length > 0 };
  }

  async setRole(job, value) {
    const j = ModelShop.JOBS.find((x) => x.id === job);
    if (!j) throw new Error('No such job.');
    // Taking a helper brain off: that job goes back to the main brain (the main brain itself can't be taken off).
    if (j.kind === 'llm' && value === '' && job !== 'bob') { saveSettings(this.cfg, { models: { [job]: '' } }); return { models: { [job]: '' } }; }
    if (j.kind === 'llm') {
      const { options } = await this.roles();
      if (!options.llm.some((o) => o.value === value)) throw new Error(`${value} isn't on this replicant matrix.`);
      const entry = this.catalog.models.find((m) => m.id === value);
      const patch = { models: { [job]: value } };
      // A GGUF file is noted for Bob's own engine, but Bob never switches engines by himself (opt-in rule;
      // it once flipped a PC to llama.cpp). If the model needs the other engine, the app asks.
      const inOllama = new Set([...((await this.ollamaNames()) || []), ...this.ollamaManifests()]).has(value);
      let needsEngine = null;
      const own = ownModels(this.cfg).find((o) => o.id === value); // 1.5.135: a brain of your own runs from its own file
      if (own) { patch.llamacpp = { models: { [value]: ownResolve(own) } }; if (this.cfg.engine !== 'llamacpp') needsEngine = 'llamacpp'; }
      if (entry) { const loc = this.locate(entry); if (loc.gguf) { patch.llamacpp = { models: { [value]: loc.mmproj ? { gguf: loc.gguf, mmproj: loc.mmproj } : loc.gguf } }; /* 1.5.74: keep its picture reader */ if (this.cfg.engine !== 'llamacpp' && !inOllama) needsEngine = 'llamacpp'; } }
      saveSettings(this.cfg, patch);
      return needsEngine ? { ...patch, needsEngine } : patch;
    }
    if ((job === 'image' || job === 'video') && value.startsWith('maestro:')) {
      const type = value.slice(8);
      const { options } = await this.roles();
      if (!options[j.kind].some((o) => o.value === value)) throw new Error('Maestro isn\'t running, or doesn\'t have that model.');
      const patch = job === 'image' ? { painter: { engine: 'maestro' }, maestro: { image: type } } : { maestro: { video: type } };
      saveSettings(this.cfg, patch);
      return patch;
    }
    if (job === 'video') saveSettings(this.cfg, { maestro: { video: '' } });
    if (job === 'image' && value === 'comfy') { saveSettings(this.cfg, { painter: { engine: 'comfy' } }); return { painter: { engine: 'comfy' } }; }
    if (job === 'music' || job === 'sfx') return {}; // one choice each for now; the workshop decides
    if (job === 'speech' && value === 'chatterbox') { if (!voicesReady(this.cfg).chatterbox) throw new Error('Chatterbox isn\'t set up yet (Settings, Engines).'); const patch = { tts: { provider: 'chatterbox' } }; saveSettings(this.cfg, patch); return patch; }
    if (job === 'speech' && value === 'windows') { const patch = { tts: { provider: '' } }; saveSettings(this.cfg, patch); return patch; }
    if (job === 'voice' && value.startsWith('ollama:')) { const patch = { stt: { provider: 'ollama', model: value.slice(7) } }; saveSettings(this.cfg, patch); return patch; }
    const entry = this.catalog.models.find((m) => m.id === value && (j.kind === 'edit' ? m.use?.painter?.sdcpp?.edit : m.category === j.kind && !m.use?.painter?.sdcpp?.edit));
    if (!entry) throw new Error('That model doesn\'t do this job.');
    return this.use(value);
  }

  // Make Bob use an installed model: updates the live settings and saves them (inn\bob\settings.json).
  async use(id) {
    const entry = this.catalog.models.find((m) => m.id === id);
    if (!entry?.use) throw new Error('That model has nothing to switch to.');
    const st = await this.statusOf(entry, await this.ollamaNames());
    if (st.state !== 'installed') throw new Error(`${entry.name} isn't fully on this replicant matrix yet.`);
    const pulled = st.where.includes('Ollama');
    let model = entry.ollama;
    const extra = {};
    if (!pulled || (this.cfg.engine === 'llamacpp' && st.located.gguf)) {
      model = entry.id;
      if (st.located.gguf) extra.llamacpp = { models: { [entry.id]: st.located.gguf } };
    }
    const patch = { ...resolveUse(entry.use, { model, files: st.located }), ...extra };
    saveSettings(this.cfg, patch);
    // Ollama can't run a loose GGUF: the app asks before switching to Bob's own engine. Never automatic.
    if (st.located.gguf && !pulled && this.cfg.engine !== 'llamacpp') return { ...patch, needsEngine: 'llamacpp' };
    return patch;
  }
}
