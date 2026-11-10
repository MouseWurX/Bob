// 1.5.41: the shape of a song for its player in the chat (the bars you click to jump around), read from the .wav
// file itself. Only small pieces of the file are read (a few thousand samples per bar), so a four-minute song
// takes a few milliseconds, and the answer is kept until the file changes.
// Plain PCM (8, 16, 24 or 32 bit) and float (32 or 64 bit) WAV files, including WAVE_FORMAT_EXTENSIBLE.
// Anything else (mp3, ogg, a broken file) gets no bars, and the player shows a plain line instead.
import fs from 'node:fs';

const cache = new Map();
const WINDOWS = 4; // little windows read per bar
const WINDOW_FRAMES = 512;

// The format and where the samples are, or null when it isn't a WAV file this can read.
export function wavInfo(fd, fileSize) {
  const head = Buffer.alloc(Math.min(fileSize, 65536));
  fs.readSync(fd, head, 0, head.length, 0);
  if (head.length < 12 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return null;
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= head.length) {
    const id = head.toString('ascii', pos, pos + 4);
    const size = head.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ' && body + 16 <= head.length) {
      let format = head.readUInt16LE(body);
      const channels = head.readUInt16LE(body + 2), rate = head.readUInt32LE(body + 4), align = head.readUInt16LE(body + 12), bits = head.readUInt16LE(body + 14);
      if (format === 0xfffe && size >= 26 && body + 26 <= head.length) format = head.readUInt16LE(body + 24); // the sub-format GUID starts with the real one
      fmt = { format, channels, rate, align, bits };
    } else if (id === 'data') {
      // A file written while streaming can carry 0 or 0xFFFFFFFF here: then the samples run to the end of the file.
      const left = fileSize - body;
      data = { offset: body, size: size === 0 || size === 0xffffffff || size > left ? left : size };
      break;
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data || !fmt.channels || !fmt.rate || !fmt.align) return null;
  const ok = (fmt.format === 1 && [8, 16, 24, 32].includes(fmt.bits)) || (fmt.format === 3 && [32, 64].includes(fmt.bits));
  if (!ok || fmt.align < (fmt.bits / 8) * fmt.channels) return null;
  const frames = Math.floor(data.size / fmt.align);
  return { ...fmt, ...data, frames, seconds: frames / fmt.rate };
}

function reader(info) {
  const { format, bits } = info;
  if (format === 3) return bits === 64 ? (b, o) => b.readDoubleLE(o) : (b, o) => b.readFloatLE(o);
  if (bits === 8) return (b, o) => (b[o] - 128) / 128;
  if (bits === 16) return (b, o) => b.readInt16LE(o) / 32768;
  if (bits === 24) return (b, o) => b.readIntLE(o, 3) / 8388608;
  return (b, o) => b.readInt32LE(o) / 2147483648;
}

// { seconds, peaks: [n numbers from 0 to 1] } or { seconds: null, peaks: null } when it can't be read.
export function wavePeaks(file, n = 96) {
  n = Math.max(16, Math.min(240, Math.round(Number(n) || 96)));
  let st;
  try { st = fs.statSync(file); } catch { return { seconds: null, peaks: null }; }
  const key = `${file}|${st.size}|${st.mtimeMs}|${n}`;
  if (cache.has(key)) return cache.get(key);
  let out = { seconds: null, peaks: null };
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const info = wavInfo(fd, st.size);
    if (info && info.frames > 0) {
      const read = reader(info);
      const step = info.bits / 8;
      const buf = Buffer.alloc(WINDOW_FRAMES * info.align);
      const raw = [];
      for (let i = 0; i < n; i++) {
        const from = Math.floor((i * info.frames) / n), to = Math.floor(((i + 1) * info.frames) / n);
        const span = Math.max(1, to - from);
        let peak = 0;
        for (let w = 0; w < WINDOWS; w++) {
          const start = from + Math.floor((w * span) / WINDOWS);
          const count = Math.min(WINDOW_FRAMES, to - start, info.frames - start);
          if (count <= 0) continue;
          const got = fs.readSync(fd, buf, 0, count * info.align, info.offset + start * info.align);
          const frames = Math.floor(got / info.align);
          for (let f = 0; f < frames; f++) {
            for (let c = 0; c < info.channels; c++) {
              const v = Math.abs(read(buf, f * info.align + c * step));
              if (v > peak && Number.isFinite(v)) peak = v;
            }
          }
        }
        raw.push(Math.min(1, peak));
      }
      // Scaled to the loudest bar, so a quiet song still has a shape; silence stays a thin line.
      const top = Math.max(...raw);
      out = { seconds: Math.round(info.seconds * 10) / 10, peaks: raw.map((v) => (top > 0.0005 ? Math.round(Math.max(0.04, v / top) * 100) / 100 : 0.04)) };
    }
  } catch { out = { seconds: null, peaks: null }; }
  finally { if (fd !== null) try { fs.closeSync(fd); } catch {} }
  cache.set(key, out);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return out;
}
