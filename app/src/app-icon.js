// 1.5.94 "Use Bob's look as his icon": Bob's tray, taskbar and window icon drawn from the 16x16 avatar picked in
// Style. Each pixel of the map becomes a square block (nearest-neighbour, so he stays crisp pixel art), on a clear
// background. No packages: a PNG is a few chunks of zlib data, and node:zlib is built in.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLook, LOOKS, DEFAULT_LOOK } from '../public/bob-sprite.js';

// 1.5.228 Bob's own icon: a tesseract (a cube inside a cube) on a Lamplight tile, in the colour of the Lamplight
// version picked (style.lamp: mercury, sodium, thallium or neon, in any look; anything else is Mercury). The pictures are drawn once by
// installer/make-icons.mjs and shipped in public/icons/lamp, so nothing is drawn while Bob runs.
export const LAMP_ICONS = ['mercury', 'sodium', 'thallium', 'neon'];
export const lampIcon = (style) => (LAMP_ICONS.includes(style?.lamp) ? style.lamp : 'mercury');
const LAMP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons', 'lamp');
const lampCache = new Map();
export function lampPng(id, name, dir = LAMP_DIR) {
  const f = path.join(dir, `${lampIcon({ lamp: id })}-${name}.png`);
  if (!lampCache.has(f)) { try { lampCache.set(f, fs.readFileSync(f)); } catch { lampCache.set(f, null); } }
  return lampCache.get(f);
}
export function lampIcons(id, dir) {
  const out = {};
  for (const s of [16, 24, 32, 48, 256]) out[s] = lampPng(id, String(s), dir);
  out.mac = lampPng(id, 'mac-512', dir);
  return Object.values(out).every(Boolean) ? out : null; // a missing file: the window program falls back to bob.ico / bob-512.png
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function hex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || ''));
  const v = m ? parseInt(m[1], 16) : 0x808080;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// The look's 16x16 map as RGBA pixels at size x size (size a multiple of 16 draws exact blocks).
export function lookPixels(id, size = 32) {
  const look = getLook(id) || LOOKS[DEFAULT_LOOK];
  const map = look.map, pal = look.palette;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const row = map[Math.floor((y * 16) / size)] || '';
    for (let x = 0; x < size; x++) {
      const ch = row[Math.floor((x * 16) / size)] || '.';
      if (ch === '.') continue; // clear
      const [r, g, b] = hex(pal[ch]);
      const i = (y * size + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  return px;
}

export function lookPng(id, size = 32) {
  const px = lookPixels(id, size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// 150 "Tray icon dot" (off by default): the same picture with a round dot in the bottom-right corner,
// in a warm orange ringed in dark brown so it shows on light and dark taskbars alike.
export const DOT = { fill: [0xe7, 0x7a, 0x1a], ring: [0x2b, 0x1d, 0x14] };
// id '' draws the dot alone (the small badge Windows puts on the taskbar button).
export function dotPixels(id, size = 32) {
  const px = id === '' ? Buffer.alloc(size * size * 4) : lookPixels(id, size);
  const r = id === '' ? size / 2 : size * 0.24, cx = size - r, cy = size - r;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > r) continue;
    const [cr, cg, cb] = d > r - Math.max(1, size / 16) ? DOT.ring : DOT.fill;
    const i = (y * size + x) * 4;
    px[i] = cr; px[i + 1] = cg; px[i + 2] = cb; px[i + 3] = 255;
  }
  return px;
}
function png(px, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
export const dotPng = (id, size = 32) => png(dotPixels(id, size), size);

// What Bob's window program (electron/main.cjs) needs to know: the two switches and, when his look is his icon,
// the pictures at the sizes Windows, macOS and Linux ask for (16/24/32 for the tray, 256 for the taskbar and Dock).
export function windowState(cfg = {}, { lampDir } = {}) {
  // "Use Bob's look as his icon": off unless switched on since 1.5.228 (the owner asked for the tesseract as Bob's
  // icon everywhere); on, the tray, taskbar and Dock show the pixel look picked in Style, as before.
  const lookIcon = cfg.lookIcon === true;
  const id = getLook(cfg.look) ? cfg.look : DEFAULT_LOOK;
  const lamp = lampIcon(cfg.style);
  const dots = (sizes) => Object.fromEntries(sizes.map((s) => [s, lookIcon ? dotPng(id, s) : lampPng(lamp, `dot-${s}`, lampDir) || dotPng(id, s)]));
  return {
    tray: cfg.tray !== false, // on unless switched off (1.5.134)
    lookIcon,
    lookName: (getLook(id) || LOOKS[DEFAULT_LOOK]).name,
    lamp,
    icons: lookIcon ? { 16: lookPng(id, 16), 24: lookPng(id, 24), 32: lookPng(id, 32), 48: lookPng(id, 48), 256: lookPng(id, 256) } : lampIcons(lamp, lampDir),
    // 150: the tray picture with a dot, ready for when a job is done or something needs you.
    trayDot: cfg.trayDot === true,
    dotIcons: cfg.trayDot === true ? { ...dots([16, 24, 32]), badge: dotPng('', 16) } : null,
    ...(cfg.trayDot === true ? {} : { dot: false })
  };
}

// Tell the window program (if Bob runs in his own window; in a browser there is no tray and this does nothing).
export function applyWindowState(cfg) {
  try { globalThis.bobWindow?.apply(windowState(cfg)); } catch {}
}
