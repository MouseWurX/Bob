// A .tgz (an npm package) read without any outside program: gunzip, then the 512-byte tar headers.
// Only plain files from the package's top folder whose names are in `keep`; anything in a sub-folder, any link
// and any other kind of entry is skipped, so nothing can land outside the folder it's unpacked into.
import zlib from 'node:zlib';

export function untgz(buf, keep, { top = 'package' } = {}) {
  const tar = zlib.gunzipSync(buf);
  const out = new Map();
  for (let at = 0; at + 512 <= tar.length;) {
    const head = tar.subarray(at, at + 512);
    if (head.every((b) => b === 0)) break;
    const field = (s, n) => head.subarray(s, s + n).toString('utf8').replace(/\0[\s\S]*$/, '');
    const prefix = field(345, 155);
    const name = (prefix ? prefix + '/' : '') + field(0, 100);
    const size = parseInt(field(124, 12).trim() || '0', 8) || 0;
    const type = head[156];
    const m = name.match(new RegExp(`^${top}/([^/\\\\]+)$`));
    if ((type === 48 || type === 0) && m && keep.has(m[1])) out.set(m[1], Buffer.from(tar.subarray(at + 512, at + 512 + size)));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}
