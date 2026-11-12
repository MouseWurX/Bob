// Bridge to Maestro (Wan2GP) so Bob can use its video and picture models while Maestro is running.
// Maestro listens only on this PC (127.0.0.1:42003). Bob submits a job, follows its progress,
// and copies the finished file into the inn's painter folder.
import { deadline as withDeadline } from './hang-guard.js'; // item 212: every network call has a deadline
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const IMAGE_FAMILIES = /^(flux|flux2|qwen|z_image|hidream|krea2)/i;
const SKIP_FAMILIES = /^(tts|qwen3_tts|ace_step|kugelaudio|minimax_music|mmaudio)/i;

export function maestroUrl(cfg) {
  const u = (cfg.maestro && cfg.maestro.url) || 'http://127.0.0.1:42003';
  const url = new URL(u);
  // Maestro must be on this PC: never send prompts elsewhere through this bridge.
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Maestro has to be on this replicant matrix.');
  return url.origin;
}

async function call(cfg, p, opts = {}) {
  const res = await fetch(maestroUrl(cfg) + p, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) }, signal: opts.signal || AbortSignal.timeout(10000) });
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (!res.ok) throw new Error(`Maestro said ${res.status}: ${String(j.detail || j.error || text).slice(0, 200)}`);
  return j;
}

export async function maestroRunning(cfg) {
  try { await call(cfg, '/api/v1/models', { signal: AbortSignal.timeout(2500) }); return true; } catch { return false; }
}

// /api/v1/models: read whatever shape it has into [{ modelType, label, kind, downloaded }].
export function readModels(raw) {
  const out = [];
  const seen = new Set();
  const add = (o, family) => {
    const id = typeof o === 'string' ? o : o.model_type || o.id || o.model || o.name;
    if (!id || seen.has(id)) return;
    const fam = String((typeof o === 'object' && (o.family || o.base || o.architecture)) || family || id);
    if (SKIP_FAMILIES.test(id) || SKIP_FAMILIES.test(fam)) return;
    seen.add(id);
    const name = typeof o === 'object' ? o.display_name || o.label || o.title || o.name || id : id;
    if (typeof o === 'object' && o.generates_audio && !o.is_t2v && !o.is_i2v) return;
    const dl = typeof o === 'object' ? (o.is_downloaded ?? o.downloaded ?? o.installed ?? o.available ?? (o.status ? /ready|downloaded|installed/i.test(o.status) : undefined)) : undefined;
    const imageFlag = typeof o === 'object' && (o.image_outputs || o.image_mode || /image/i.test(o.output_type || o.type || ''));
    out.push({ modelType: id, label: String(name), kind: imageFlag || IMAGE_FAMILIES.test(fam) || IMAGE_FAMILIES.test(id) ? 'images' : 'video', downloaded: dl === undefined ? null : Boolean(dl) });
  };
  const walk = (v, family, depth) => {
    if (depth > 4 || v == null) return;
    if (Array.isArray(v)) { v.forEach((x) => (typeof x === 'string' || (x && (x.model_type || x.id || x.model)) ? add(x, family) : walk(x, family, depth + 1))); return; }
    if (typeof v === 'object') {
      if (v.model_type) return add(v, family);
      for (const [k, x] of Object.entries(v)) walk(x, ['models', 'families', 'data', 'items'].includes(k) ? family : family || k, depth + 1);
    }
  };
  walk(raw, null, 0);
  return out;
}

export async function maestroModels(cfg) {
  return readModels(await call(cfg, '/api/v1/models', { signal: AbortSignal.timeout(5000) }));
}

// Run one job. kind: 'image' | 'video'.
export async function maestroMake(cfg, kind, { prompt, width, height, seconds, modelType }, { signal, onProgress }) {
  const fps = (cfg.maestro && cfg.maestro.fps) || 24;
  const W = Math.round((width || (kind === 'video' ? 864 : 1024)) / 16) * 16;
  const H = Math.round((height || (kind === 'video' ? 480 : 1024)) / 16) * 16;
  const body = {
    model_type: modelType, prompt: String(prompt).slice(0, 2000), resolution: `${W}x${H}`,
    seed: Math.floor(Math.random() * 2 ** 31), _queue_mode: 'now', _client_submission_id: `bob-${crypto.randomUUID()}`,
    ...(kind === 'image' ? { image_mode: 1, generation_mode: 'image' } : { video_length: Math.max(17, Math.min(241, Math.round((seconds || 3) * fps) + 1)) })
  };
  const sub = await call(cfg, '/api/v1/generate', { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const jobId = sub.job_id || sub.id;
  if (!jobId) throw new Error('Maestro didn\'t give me a job number.');
  const cancel = () => call(cfg, `/api/v1/cancel/${encodeURIComponent(jobId)}`, { method: 'POST' }).catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  const deadline = Date.now() + ((cfg.maestro && cfg.maestro.timeoutSeconds) || 3600) * 1000;
  try {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      if (signal?.aborted) throw new Error('Stopped.');
      let st;
      try { st = await call(cfg, `/api/v1/status/${encodeURIComponent(jobId)}`); } catch (e) { if (/404/.test(e.message)) continue; throw e; }
      if (onProgress) onProgress(st);
      const status = String(st.status || '').toLowerCase();
      if (/error|fail|cancel/.test(status) || st.error) throw new Error(`Maestro couldn't finish: ${st.error || st.message || status}${st.oom_info ? ' (out of graphics memory)' : ''}`);
      const files = [].concat(st.output_files || []).map((f) => (typeof f === 'string' ? f : f.path || f.file || f.name)).filter(Boolean);
      if (/done|complete|finish|success/.test(status) && files.length) return Promise.all(files.map((f) => collect(cfg, f, signal)));
    }
    throw new Error('Maestro took too long.');
  } finally { signal?.removeEventListener('abort', cancel); }
}

// Fetch a finished file from Maestro (GET /api/v1/file/<name>) into the painter folder, so it stays with Bob's things.
async function collect(cfg, f, signal) {
  const base = path.basename(String(f));
  const ext = path.extname(base).toLowerCase() || '.mp4';
  const name = `${new Date().toISOString().slice(0, 10)}-maestro-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const dest = path.join(cfg.painterDir, name);
  const res = await fetch(`${maestroUrl(cfg)}/api/v1/file/${encodeURIComponent(base)}`, { signal: withDeadline(signal, 10 * 60_000) });
  if (res.ok) {
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  } else {
    const local = [f, ...(cfg.maestro && cfg.maestro.outputsDir ? [path.join(cfg.maestro.outputsDir, base)] : [])].find((p) => path.isAbsolute(p) && fs.existsSync(p));
    if (!local) throw new Error(`Maestro says it made ${base}, but I couldn't fetch it (${res.status}).`);
    fs.copyFileSync(local, dest);
  }
  return { file: dest, name, video: /\.(mp4|webm|mov|mkv|avi)$/.test(ext) };
}
