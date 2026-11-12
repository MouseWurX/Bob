// A small zip writer and reader, so the Files Hand needs no outside program. Plain zip (deflate or stored),
// no encryption, no zip64: up to 2 GB in and 4 GB out, which covers everyday folders.
// The reader is careful: no entry may land outside the target folder (zip-slip), absolute paths, drive letters,
// ".." and Windows stream names are refused, symlinks are skipped, and the unpacked size is capped and checked
// as it inflates, so a "zip bomb" stops early.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { isInside } from './config.js';

const LIMITS = { maxEntries: 20000, maxTotal: 4 * 1024 ** 3, maxFile: 1024 ** 3, maxIn: 2 * 1024 ** 3, maxRatio: 1000 };

const crc32 = (buf) => zlib.crc32(buf) >>> 0;

function dosTime(d) {
  const t = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const day = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { t, day };
}

// Every file under the given paths, as { abs, name } with forward-slash names relative to `base`.
export function collect(paths, base, { skip = () => false } = {}) {
  const out = [];
  const walk = (abs) => {
    if (skip(abs)) return;
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) return;
    const name = path.relative(base, abs).split(path.sep).join('/');
    if (st.isDirectory()) {
      const kids = fs.readdirSync(abs);
      if (!kids.length) out.push({ abs, name: name + '/', dir: true, size: 0, mtime: st.mtime });
      for (const k of kids) walk(path.join(abs, k));
    } else if (st.isFile()) out.push({ abs, name, size: st.size, mtime: st.mtime });
  };
  for (const p of paths) walk(path.resolve(p));
  return out;
}

// Writes `entries` (from collect) to zipFile. Never overwrites: throws if zipFile exists.
export function writeZip(zipFile, entries) {
  if (fs.existsSync(zipFile)) throw new Error(`${zipFile} already exists.`);
  const total = entries.reduce((t, e) => t + (e.size || 0), 0);
  if (total > LIMITS.maxIn) throw new Error('That is more than 2 GB, which is too big for Bob\'s zip maker.');
  if (entries.length > LIMITS.maxEntries) throw new Error(`That is more than ${LIMITS.maxEntries} files.`);
  const tmp = zipFile + '.part';
  const fd = fs.openSync(tmp, 'wx');
  const central = [];
  let offset = 0;
  const put = (buf) => { fs.writeSync(fd, buf); offset += buf.length; };
  try {
    for (const e of entries) {
      const name = Buffer.from(e.name, 'utf8');
      const raw = e.dir ? Buffer.alloc(0) : (e.data || fs.readFileSync(e.abs)); // e.data: a file made in memory (security-files.js)
      const crc = e.dir ? 0 : crc32(raw);
      let data = raw, method = 0;
      if (!e.dir && raw.length > 64) { const z = zlib.deflateRawSync(raw, { level: 6 }); if (z.length < raw.length) { data = z; method = 8; } }
      const { t, day } = dosTime(e.mtime || new Date());
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(method, 8);
      local.writeUInt16LE(t, 10); local.writeUInt16LE(day, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
      const at = offset;
      put(local); put(name); put(data);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10);
      c.writeUInt16LE(t, 12); c.writeUInt16LE(day, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24);
      c.writeUInt16LE(name.length, 28); c.writeUInt32LE(e.dir ? 0x10 : 0, 38); c.writeUInt32LE(at, 42);
      central.push(Buffer.concat([c, name]));
    }
    const cdStart = offset;
    for (const c of central) put(c);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(offset - cdStart, 12); end.writeUInt32LE(cdStart, 16);
    put(end);
    fs.closeSync(fd);
    fs.renameSync(tmp, zipFile);
  } catch (e) {
    try { fs.closeSync(fd); } catch {}
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw e;
  }
  return { files: entries.filter((e) => !e.dir).length, bytes: offset };
}

// A safe relative path for an entry name, or '' if it must be refused.
export function safeEntryName(name) {
  const s = String(name).replace(/\\/g, '/');
  if (!s || s.includes('\0') || s.startsWith('/') || /^[a-zA-Z]:/.test(s)) return '';
  const parts = s.split('/').filter((p, i, a) => p !== '' || i === a.length - 1);
  for (const p of parts) {
    if (p === '..' || p === '.' || p.includes(':')) return '';
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p)) return '';
    if (/[<>"|?*\x00-\x1f]/.test(p)) return '';
  }
  return parts.join('/');
}

// Reads the list of entries (no unpacking). Throws for anything Bob won't unpack.
export function readZipList(zipFile) {
  const fd = fs.openSync(zipFile, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("That doesn't look like a zip file.");
    const count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdOff === 0xffffffff) throw new Error('That zip is in the extra-large (zip64) format, which Bob can\'t unpack yet.');
    if (count > LIMITS.maxEntries) throw new Error(`That zip has more than ${LIMITS.maxEntries} files.`);
    if (cdOff + cdSize > size) throw new Error('That zip file is damaged.');
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    const list = [];
    let p = 0, total = 0;
    for (let i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('That zip file is damaged.');
      const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10), crc = cd.readUInt32LE(p + 16);
      const csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nlen = cd.readUInt16LE(p + 28), xlen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32);
      const madeBy = cd.readUInt16LE(p + 4) >> 8, ext = cd.readUInt32LE(p + 38), at = cd.readUInt32LE(p + 42);
      const rawName = cd.subarray(p + 46, p + 46 + nlen);
      const name = (flags & 0x800) ? rawName.toString('utf8') : rawName.toString('latin1');
      p += 46 + nlen + xlen + clen;
      if (flags & 1) throw new Error('That zip is password-protected. Bob never handles passwords; unpack it yourself.');
      if (method !== 0 && method !== 8) throw new Error(`That zip uses a packing method Bob doesn't know (${method}).`);
      const isLink = madeBy === 3 && ((ext >>> 16) & 0o170000) === 0o120000;
      const safe = safeEntryName(name);
      if (!safe) throw new Error(`That zip has an unsafe name inside ("${name.slice(0, 80)}"): it would land outside the folder. Bob won't unpack it.`);
      if (usize > LIMITS.maxFile) throw new Error('A file in that zip is over 1 GB unpacked, which is more than Bob unpacks.');
      if (usize > 10e6 && csize > 0 && usize / csize > LIMITS.maxRatio) throw new Error('That zip unpacks to far more than its size (a "zip bomb"). Bob won\'t unpack it.');
      total += usize;
      list.push({ name: safe, dir: safe.endsWith('/'), method, crc, csize, usize, at, link: isLink });
    }
    if (total > LIMITS.maxTotal) throw new Error('That zip unpacks to more than 4 GB, which is more than Bob unpacks.');
    return { entries: list, total };
  } finally { fs.closeSync(fd); }
}

// Unpacks into destDir, which must not exist yet (so nothing is ever overwritten). Returns { files, bytes, skipped }.
export function unzip(zipFile, destDir) {
  if (fs.existsSync(destDir)) throw new Error(`${destDir} already exists.`);
  const { entries } = readZipList(zipFile);
  const tmp = destDir + '.unpacking';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const fd = fs.openSync(zipFile, 'r');
  let files = 0, bytes = 0, skipped = 0;
  try {
    for (const e of entries) {
      const target = path.resolve(tmp, ...e.name.split('/').filter(Boolean));
      if (!isInside(tmp, target)) throw new Error('A file in that zip would land outside the folder.');
      if (e.dir) { fs.mkdirSync(target, { recursive: true }); continue; }
      if (e.link) { skipped++; continue; }
      const head = Buffer.alloc(30);
      fs.readSync(fd, head, 0, 30, e.at);
      if (head.readUInt32LE(0) !== 0x04034b50) throw new Error('That zip file is damaged.');
      const start = e.at + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
      const comp = Buffer.alloc(e.csize);
      fs.readSync(fd, comp, 0, e.csize, start);
      let data;
      try { data = e.method === 8 ? zlib.inflateRawSync(comp, { maxOutputLength: Math.max(1, e.usize) }) : comp; }
      catch { throw new Error(`${e.name} in that zip is damaged or bigger than it says.`); }
      if (data.length !== e.usize || crc32(data) !== e.crc) throw new Error(`${e.name} in that zip is damaged (its check doesn't match).`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data, { flag: 'wx' });
      files++; bytes += data.length;
    }
    fs.closeSync(fd);
    fs.renameSync(tmp, destDir);
  } catch (err) {
    try { fs.closeSync(fd); } catch {}
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
  return { files, bytes, skipped };
}

// One entry's bytes (a small file, such as a backup's own list), or null when the zip has no entry by that name.
// The same checks as unzip: a damaged or oversized entry throws.
export function readZipEntry(zipFile, name, { maxBytes = 64 * 1024 ** 2 } = {}) {
  const { entries } = readZipList(zipFile);
  const e = entries.find((x) => x.name === name && !x.dir && !x.link);
  if (!e) return null;
  if (e.usize > maxBytes) throw new Error(`${name} in that zip is bigger than Bob reads.`);
  const fd = fs.openSync(zipFile, 'r');
  try {
    const head = Buffer.alloc(30);
    fs.readSync(fd, head, 0, 30, e.at);
    if (head.readUInt32LE(0) !== 0x04034b50) throw new Error('That zip file is damaged.');
    const comp = Buffer.alloc(e.csize);
    fs.readSync(fd, comp, 0, e.csize, e.at + 30 + head.readUInt16LE(26) + head.readUInt16LE(28));
    let data;
    try { data = e.method === 8 ? zlib.inflateRawSync(comp, { maxOutputLength: Math.max(1, e.usize) }) : comp; }
    catch { throw new Error(`${name} in that zip is damaged.`); }
    if (data.length !== e.usize || crc32(data) !== e.crc) throw new Error(`${name} in that zip is damaged (its check doesn't match).`);
    return data;
  } finally { fs.closeSync(fd); }
}
