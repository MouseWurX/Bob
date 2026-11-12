// Journey v1.2 (1.5.211): Bob's own pages are sent packed (gzip) when the browser asks for it, so a phone or another
// replicant matrix over Wi-Fi or Tailscale downloads about a third as much. Each packed file is kept (up to max of
// them) until the file changes, so packing costs once, not every time. Pictures, sound and video are already packed.
import zlib from 'node:zlib';

const PACKABLE = /^(text\/|application\/(json|manifest\+json)|image\/svg\+xml)/;
const MIN_BYTES = 1024;

export function makePacker({ max = 96, gzip = (b) => zlib.gzipSync(b, { level: 9 }) } = {}) {
  const kept = new Map(); // file -> { src, gz }
  return function pack(acceptEncoding, file, buf, type) {
    if (!/\bgzip\b/i.test(String(acceptEncoding || '')) || !PACKABLE.test(String(type || '')) || !Buffer.isBuffer(buf) || buf.length < MIN_BYTES) return null;
    const had = kept.get(file);
    if (had && had.src.equals(buf)) { kept.delete(file); kept.set(file, had); return had.gz; }
    let gz;
    try { gz = gzip(buf); } catch { return null; }
    if (gz.length >= buf.length) return null;
    kept.set(file, { src: buf, gz });
    while (kept.size > max) kept.delete(kept.keys().next().value);
    return gz;
  };
}
