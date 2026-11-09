// Picture size and turn, read straight from the file (no image library): PNG, JPEG and WebP.
// Phone photos are often stored on their side with an EXIF "turn me" note (orientation). Bob's window
// shows them upright, but the painter reads the raw pixels, so an edit would get a sideways person.
// width/height here are as the picture is SHOWN (after the turn); turn is the EXIF orientation (1 = upright).
import fs from 'node:fs';

function jpeg(buf) {
  let w = 0, h = 0, turn = 1;
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    if (m === 0xd9 || m === 0xda) break; // end of picture, or the pixel data starts: no more headers
    const len = buf.readUInt16BE(i + 2);
    const seg = i + 4;
    if (m === 0xe1 && buf.toString('ascii', seg, seg + 4) === 'Exif') turn = exifTurn(buf, seg + 6, len - 8) || turn;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc && seg + 5 <= buf.length) {
      h = buf.readUInt16BE(seg + 1); w = buf.readUInt16BE(seg + 3);
    }
    i = seg + len - 2;
  }
  return { w, h, turn };
}

// The orientation tag (0x0112) in the first IFD of an EXIF block.
function exifTurn(buf, start, len) {
  try {
    const end = Math.min(buf.length, start + len);
    const le = buf.toString('ascii', start, start + 2) === 'II';
    const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
    const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
    const ifd = start + u32(start + 4);
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (e + 12 > end) break;
      if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
    }
  } catch {}
  return 1;
}

function webp(buf) {
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  return { w: 0, h: 0 };
}

// { type, width, height, turn } or null when it isn't a picture Bob knows.
export function imageInfo(buf) {
  try {
    if (!buf || buf.length < 16) return null;
    if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), turn: 1 };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      const { w, h, turn } = jpeg(buf);
      const side = turn >= 5; // 5-8 turn the picture a quarter, so width and height swap
      return { type: 'jpg', width: side ? h : w, height: side ? w : h, turn };
    }
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') { const { w, h } = webp(buf); return { type: 'webp', width: w, height: h, turn: 1 }; }
  } catch {}
  return null;
}

export function imageInfoOf(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(256 * 1024); // headers (and EXIF) sit at the start
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return imageInfo(buf.subarray(0, n));
  } catch { return null; }
}

// A painting size with the picture's own shape, about one megapixel, in steps of 16.
export function sizeLike(width, height, area = 1024 * 1024) {
  if (!(width > 0 && height > 0)) return null;
  let s = Math.sqrt(area / (width * height));
  if (s > 0.9 && s < 1.12) s = 1; // already about the right size (like Bob's own pictures): keep it exactly
  const r16 = (n) => Math.min(2048, Math.max(256, Math.round((n * s) / 16) * 16));
  return { width: r16(width), height: r16(height) };
}
