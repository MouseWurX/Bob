// Bob's own painter: stable-diffusion.cpp for pictures (Z-Image, Flux) and video (Wan). No ComfyUI needed.
// Model file paths live in config.json under painter.sdcpp.
// Since 1.6 the usual route is sd-server, which keeps the picture model loaded between pictures (painter-server.js).
// paint() below is the one-shot sd-cli route: the fallback when sd-server is missing, too old or won't start.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { paintFlags } from './tuning.js';

const FLAG = {
  diffusionModel: '--diffusion-model', highNoiseDiffusionModel: '--high-noise-diffusion-model', model: '-m',
  vae: '--vae', audioVae: '--audio-vae', llm: '--llm', embeddingsConnectors: '--embeddings-connectors', llmVision: '--llm_vision', t5xxl: '--t5xxl', clipL: '--clip_l', clipVision: '--clip_vision'
};

export function modelArgs(spec) {
  const args = [];
  for (const [key, flag] of Object.entries(FLAG)) {
    if (!spec[key]) continue;
    if (!fs.existsSync(spec[key])) throw new Error(`Painter model file is missing: ${spec[key]}`);
    args.push(flag, spec[key]);
  }
  if (!args.length) throw new Error('No painter model files are set in config.json.');
  return args;
}

export const snap = (n, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round((n || d) / 16) * 16));

// Picture size and clip length, shared by both routes so a picture looks the same whichever one made it.
export function sizeFor(kind, { width, height }) {
  const video = kind === 'video';
  return { W: snap(width, 256, video ? 1280 : 2048, video ? 832 : 1024), H: snap(height, 256, video ? 1280 : 2048, video ? 480 : 1024) };
}
export function framesFor(spec, seconds) {
  const fps = spec.fps || 16, step = spec.frameStep || 4;
  return Math.min(spec.maxFrames || 81, Math.max(17, Math.round(((seconds || 2) * fps) / step) * step + 1));
}

// A made file is only "made" if it is really there: not empty, and the right kind of file (PNG, WebM, WebP or AVI).
export function checkOutput(file, kind) {
  let buf;
  try { const fd = fs.openSync(file, 'r'); buf = Buffer.alloc(16); const n = fs.readSync(fd, buf, 0, 16, 0); fs.closeSync(fd); buf = buf.subarray(0, n); }
  catch { return { ok: false, why: 'the file is missing' }; }
  if (!buf.length) return { ok: false, why: 'the file is empty' };
  const png = buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const webm = buf.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'));
  const riff = buf.subarray(0, 4).toString('latin1') === 'RIFF';
  const webp = riff && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  const avi = riff && buf.subarray(8, 11).toString('latin1') === 'AVI';
  const ok = kind === 'video' ? webm || webp || avi : png || webp;
  return ok ? { ok: true } : { ok: false, why: `it isn't a ${kind === 'video' ? 'video' : 'picture'} file` };
}

export function paintingAvailable(cfg, kind) {
  const s = cfg.painter?.sdcpp;
  return Boolean(cfg.painter?.engine === 'sdcpp' && s?.exe && s[kind]);
}

// kind: 'image' | 'edit' | 'video'. Returns { file, name }.
// image: a start picture (img2img for pictures, first frame for video), with strength 0-1 (how much may change).
// refs: reference pictures for edit models (Qwen Image Edit and friends), which keep a character or scene's look.
// How many sampling steps a picture or clip takes: the number the progress bar counts to (1.5.109).
export const stepsFor = (spec, kind) => Number(spec?.steps) || (kind === 'video' ? 10 : 8);

export function paint(cfg, kind, { prompt, negative, width, height, seconds, image, strength, refs }, { signal, onProgress }) {
  const s = cfg.painter.sdcpp;
  const spec = s[kind];
  const name = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}.${kind === 'video' ? (s.videoFormat || 'webm') : 'png'}`;
  const out = path.join(cfg.painterDir, name);
  const flags = paintFlags(cfg, kind, spec);
  const { W, H } = sizeFor(kind, { width: width || flags.size, height: height || flags.size });
  const args = [
    ...(s.preArgs || []),
    ...(kind === 'video' ? ['-M', 'vid_gen'] : []),
    ...modelArgs(spec),
    '-p', String(prompt).slice(0, 2000),
    ...(negative ? ['-n', String(negative).slice(0, 1000)] : spec.negative ? ['-n', spec.negative] : []),
    '-W', String(W), '-H', String(H),
    '--steps', String(stepsFor(spec, kind)),
    '--cfg-scale', String(spec.cfg ?? (kind === 'video' ? 3.5 : 1.0)),
    '-s', String(Math.floor(Math.random() * 2 ** 31)),
    '-o', out
  ];
  if (kind === 'video') {
    args.push('--video-frames', String(framesFor(spec, seconds)));
    if (spec.fps) args.push('--fps', String(spec.fps));
    if (spec.flowShift !== 0) args.push('--flow-shift', String(spec.flowShift || 3.0));
    if (spec.sampler) args.push('--sampling-method', spec.sampler);
    if (image) args.push('-i', image);
  } else {
    if (spec.flowShift) args.push('--flow-shift', String(spec.flowShift));
    if (spec.sampler) args.push('--sampling-method', spec.sampler);
    if (image) args.push('-i', image, '--strength', String(Math.min(0.95, Math.max(0.1, Number(strength) || 0.6))));
    for (const r of (refs || []).slice(0, 4)) args.push('-r', r);
  }
  // Flash attention and tiled VAE decoding cut graphics memory a lot with no visible change.
  // clipOnCpu keeps the text encoder (the biggest part of Z-Image) off the card.
  // 1.5.24: "Fit pictures to my GPU" can drop the swapping and tiling on big cards (tuning.js).
  args.push(...flags.extra);
  if (flags.clipOnCpu) args.push('--clip-on-cpu');

  return new Promise((resolve, reject) => {
    const child = spawn(s.exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const onData = (d) => {
      const t = d.toString();
      log = (log + t).slice(-4000);
      const m = [...t.matchAll(/(\d+)\/(\d+)\s*-/g)].at(-1);
      if (m && onProgress) onProgress(Number(m[1]), Number(m[2]));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const kill = () => { try { child.kill(); } catch {} };
    signal?.addEventListener('abort', kill, { once: true });
    const timer = setTimeout(kill, (s.timeoutSeconds || (kind === 'video' ? 1800 : 300)) * 1000);
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`Couldn't start the painter (${e.message}). Check painter.sdcpp.exe in config.json.`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', kill);
      if (signal?.aborted) return reject(new Error('Stopped.'));
      // Some builds pick their own extension for video: take the newest file that starts with our name.
      const base = path.basename(out, path.extname(out));
      const made = fs.readdirSync(cfg.painterDir).filter((f) => f.startsWith(base)).map((f) => path.join(cfg.painterDir, f));
      if (code !== 0 || !made.length) return reject(new Error(`The painter failed (code ${code}). Last output: ${log.slice(-500)}`));
      const file = made.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
      const check = checkOutput(file, kind);
      if (!check.ok) return reject(new Error(`The painter finished but ${check.why}. Last output: ${log.slice(-300)}`));
      resolve({ file, name: path.basename(file), via: 'cli', checked: true });
    });
  });
}
