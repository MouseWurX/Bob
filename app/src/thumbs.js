// 1.5.125: small pictures for the chest and Made by Bob. Made once per file and kept in inn\bob\thumbs, so a chest
// full of 4K paintings opens in a blink and nothing is decoded twice. No model loads for this: a picture is shrunk
// by Electron's own image code (nativeImage, lent by electron/main.cjs as globalThis.bobImage); a clip's first
// second comes from FFmpeg when it's on this replicant matrix. Without either, the window shows the file itself
// (the browser shrinks it) or the kind's icon, so nothing breaks, it's just slower.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { findFfmpeg } from './office.js';

export const THUMB_SIZE = 192;
const MAX_KEEP = 2000;

export const thumbsDir = (cfg) => path.join(cfg.dataDir, 'thumbs');

// The cache file for one source file: its path, size and last change make the name, so an edited picture gets a new one.
export function thumbKey(file, st) {
  return crypto.createHash('sha1').update(`${path.resolve(file).toLowerCase()}|${st.size}|${Math.round(st.mtimeMs)}`).digest('hex').slice(0, 24);
}

const IMG = /\.(png|jpe?g|webp|gif|bmp)$/i;
const VID = /\.(mp4|webm|mov)$/i;

// The thumbnail for a file Bob made: { ok, file } (a PNG), { ok: false, why } when none can be made here.
// Makes it on first ask, reads it from the cache after. Never for anything the caller hasn't checked with describe().
export async function thumbFor(cfg, file, { size = THUMB_SIZE, image = globalThis.bobImage, ffmpeg = undefined, run = execFile } = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return { ok: false, why: 'missing' }; }
  if (!st.isFile()) return { ok: false, why: 'not a file' };
  const dir = thumbsDir(cfg);
  const out = path.join(dir, `${thumbKey(file, st)}.png`);
  if (fs.existsSync(out)) { try { fs.utimesSync(out, new Date(), new Date()); } catch {} return { ok: true, file: out, cached: true }; }
  fs.mkdirSync(dir, { recursive: true });
  const part = `${out}.part`;
  try {
    if (IMG.test(file)) {
      if (!image?.thumb) return { ok: false, why: 'no image code here (Bob\'s window makes them)' };
      const png = await image.thumb(file, size);
      if (!png?.length) return { ok: false, why: 'could not read the picture' };
      fs.writeFileSync(part, png);
    } else if (VID.test(file)) {
      const ff = ffmpeg === undefined ? findFfmpeg(cfg) : ffmpeg;
      if (!ff) return { ok: false, why: 'no FFmpeg for clips' };
      await new Promise((resolve, reject) => run(ff, ['-y', '-v', 'error', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', `scale=${size}:${size}:force_original_aspect_ratio=decrease`, '-f', 'image2', '-c:v', 'png', part], { timeout: 20000, windowsHide: true }, (err) => (err ? reject(err) : resolve())));
      if (!fs.existsSync(part)) return { ok: false, why: 'FFmpeg made nothing' };
    } else return { ok: false, why: 'not a picture or clip' };
    fs.renameSync(part, out);
    tidy(dir);
    return { ok: true, file: out, cached: false };
  } catch (e) {
    try { fs.rmSync(part, { force: true }); } catch {}
    return { ok: false, why: e.message };
  }
}

// Keep the cache small: the oldest-used thumbnails go once there are more than MAX_KEEP.
export function tidy(dir, keep = MAX_KEEP) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.png')); } catch { return 0; }
  if (names.length <= keep) return 0;
  const aged = names.map((n) => { try { return { n, t: fs.statSync(path.join(dir, n)).atimeMs }; } catch { return null; } }).filter(Boolean).sort((a, b) => a.t - b.t);
  let gone = 0;
  for (const x of aged.slice(0, aged.length - keep)) { try { fs.rmSync(path.join(dir, x.n), { force: true }); gone++; } catch {} }
  return gone;
}

// Whether a file could have a thumbnail at all (so the window knows when to ask).
export const canThumb = (name) => IMG.test(name) || VID.test(name);
