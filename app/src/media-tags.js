// Reads what a music, video or photo file says about itself, straight from the file (no programs, no
// libraries), for "Sort and rename" (src/sort-library.js). Only the small parts that hold the words are read,
// never the whole file, so a big library goes quickly.
// Music: ID3 (mp3), FLAC, Ogg Vorbis and Opus, and MP4/M4A tags. Videos: MP4/M4V tags (TV show, season,
// episode), and the name. Photos: the date taken (EXIF in JPEG), or the file's date.
// Anything a file doesn't say is guessed from its name; nothing here ever changes a file.
import fs from 'node:fs';
import path from 'node:path';

function readAt(fd, pos, len) {
  const b = Buffer.alloc(Math.max(0, len));
  const n = len > 0 ? fs.readSync(fd, b, 0, len, pos) : 0;
  return n < len ? b.subarray(0, n) : b;
}

// ---- ID3v2 (and ID3v1 at the end) ----
const ID3_KEYS = {
  TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TPE2: 'albumartist', TP2: 'albumartist', TALB: 'album', TAL: 'album',
  TRCK: 'track', TRK: 'track', TPOS: 'disc', TPA: 'disc', TYER: 'year', TYE: 'year', TDRC: 'year', TDOR: 'year', TCON: 'genre', TCO: 'genre'
};
function id3Text(buf) {
  if (!buf.length) return '';
  const enc = buf[0], b = buf.subarray(1);
  let s;
  if (enc === 1 || enc === 2) {
    let le = enc === 1, i = 0;
    if (enc === 1 && b.length >= 2) { if (b[0] === 0xfe && b[1] === 0xff) { le = false; i = 2; } else if (b[0] === 0xff && b[1] === 0xfe) { le = true; i = 2; } }
    const body = Buffer.from(b.subarray(i, i + ((b.length - i) & ~1)));
    if (!le) body.swap16();
    s = body.toString('utf16le');
  } else s = b.toString(enc === 3 ? 'utf8' : 'latin1');
  return s.split('\0').filter(Boolean)[0]?.trim() || '';
}
const syncsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);

function id3v2(fd, size) {
  const head = readAt(fd, 0, 10);
  if (head.length < 10 || head.toString('latin1', 0, 3) !== 'ID3') return null;
  const ver = head[3], flags = head[5], total = syncsafe(head, 6);
  const out = {};
  let tag;
  let pos = 10;
  const end = Math.min(10 + total, size);
  // The whole tag is read only when it is "unsynchronised" (rare); otherwise frame by frame, skipping pictures.
  if (flags & 0x80 && ver < 4) {
    const raw = readAt(fd, 10, Math.min(total, 16e6));
    const bytes = [];
    for (let i = 0; i < raw.length; i++) { bytes.push(raw[i]); if (raw[i] === 0xff && raw[i + 1] === 0) i++; }
    tag = Buffer.from(bytes);
  }
  const get = (p, n) => (tag ? tag.subarray(p - 10, p - 10 + n) : readAt(fd, p, n));
  if (flags & 0x40) { const x = get(pos, 4); pos += ver === 4 ? syncsafe(x, 0) : x.readUInt32BE(0) + 4; }
  const hl = ver === 2 ? 6 : 10;
  for (let k = 0; k < 400 && pos + hl <= end; k++) {
    const fh = get(pos, hl);
    if (fh.length < hl || fh[0] === 0) break;
    const id = fh.toString('latin1', 0, ver === 2 ? 3 : 4);
    const len = ver === 2 ? fh.readUIntBE(3, 3) : ver === 4 ? syncsafe(fh, 4) : fh.readUInt32BE(4);
    if (!/^[A-Z0-9]{3,4}$/.test(id) || len <= 0 || pos + hl + len > end) break;
    const key = ID3_KEYS[id];
    if (key && len < 4096 && !out[key]) {
      const v = id3Text(get(pos + hl, len));
      if (v) out[key] = v;
    }
    pos += hl + len;
  }
  return out;
}

function id3v1(fd, size) {
  if (size < 128) return null;
  const b = readAt(fd, size - 128, 128);
  if (b.toString('latin1', 0, 3) !== 'TAG') return null;
  const t = (a, z) => b.toString('latin1', a, z).replace(/\0.*$/s, '').trim();
  const out = { title: t(3, 33), artist: t(33, 63), album: t(63, 93), year: t(93, 97) };
  if (b[125] === 0 && b[126]) out.track = String(b[126]);
  return out;
}

// ---- Vorbis comments (FLAC, Ogg Vorbis, Opus) ----
const VORBIS_KEYS = { TITLE: 'title', ARTIST: 'artist', ALBUMARTIST: 'albumartist', 'ALBUM ARTIST': 'albumartist', ALBUM: 'album', TRACKNUMBER: 'track', DISCNUMBER: 'disc', DATE: 'year', YEAR: 'year', GENRE: 'genre' };
function vorbisComments(b) {
  const out = {};
  try {
    let o = 4 + b.readUInt32LE(0);
    const n = b.readUInt32LE(o); o += 4;
    for (let i = 0; i < n && i < 500 && o + 4 <= b.length; i++) {
      const len = b.readUInt32LE(o); o += 4;
      const s = b.toString('utf8', o, Math.min(b.length, o + len)); o += len;
      const eq = s.indexOf('=');
      const key = VORBIS_KEYS[s.slice(0, eq).toUpperCase()];
      if (key && !out[key]) out[key] = s.slice(eq + 1).trim();
    }
  } catch {}
  return out;
}

function flac(fd, size) {
  if (readAt(fd, 0, 4).toString('latin1') !== 'fLaC') return null;
  let pos = 4;
  for (let k = 0; k < 64 && pos + 4 <= size; k++) {
    const h = readAt(fd, pos, 4);
    const last = h[0] & 0x80, type = h[0] & 0x7f, len = h.readUIntBE(1, 3);
    if (type === 4) return vorbisComments(readAt(fd, pos + 4, Math.min(len, 1e6)));
    if (last) break;
    pos += 4 + len;
  }
  return {};
}

// Ogg: the second packet is the comment one ("\x03vorbis" or "OpusTags"). Pages are joined so long comments work.
function ogg(fd, size) {
  if (readAt(fd, 0, 4).toString('latin1') !== 'OggS') return null;
  let pos = 0, packet = [], packets = 0;
  for (let k = 0; k < 200 && pos + 27 <= size; k++) {
    const h = readAt(fd, pos, 27);
    if (h.toString('latin1', 0, 4) !== 'OggS') break;
    const segs = readAt(fd, pos + 27, h[26]);
    let dataPos = pos + 27 + h[26];
    for (const s of segs) {
      if (packets === 1) packet.push(readAt(fd, dataPos, s));
      dataPos += s;
      if (s < 255) {
        if (packets === 1) {
          const b = Buffer.concat(packet);
          if (b.toString('latin1', 1, 7) === 'vorbis') return vorbisComments(b.subarray(7));
          if (b.toString('latin1', 0, 8) === 'OpusTags') return vorbisComments(b.subarray(8));
          return {};
        }
        packets++;
      }
      if (packet.reduce((t, x) => t + x.length, 0) > 2e6) return {};
    }
    pos = dataPos;
  }
  return {};
}

// ---- MP4 / M4A / M4V ----
const MP4_KEYS = { '©nam': 'title', '©ART': 'artist', aART: 'albumartist', '©alb': 'album', '©day': 'year', '©gen': 'genre', tvsh: 'show' };
function mp4(fd, size) {
  const first = readAt(fd, 0, 8);
  if (first.length < 8 || first.toString('latin1', 4, 8) !== 'ftyp') return null;
  // Walks boxes between a and b; calls fn(type, start of content, content length).
  const walk = (a, b, fn) => {
    let pos = a;
    for (let k = 0; k < 4000 && pos + 8 <= b; k++) {
      const h = readAt(fd, pos, 16);
      if (h.length < 8) return;
      let len = h.readUInt32BE(0), hl = 8;
      if (len === 1 && h.length >= 16) { len = Number(h.readBigUInt64BE(8)); hl = 16; } else if (len === 0) len = b - pos;
      if (len < hl) return;
      if (fn(h.toString('latin1', 4, 8), pos + hl, len - hl) === false) return;
      pos += len;
    }
  };
  const box = (a, b, want) => { let r = null; walk(a, b, (t, s, l) => { if (t === want) { r = [s, l]; return false; } return true; }); return r; };
  const moov = box(0, size, 'moov'); if (!moov) return {};
  const udta = box(moov[0], moov[0] + moov[1], 'udta'); if (!udta) return {};
  const meta = box(udta[0], udta[0] + udta[1], 'meta'); if (!meta) return {};
  const ilst = box(meta[0] + 4, meta[0] + meta[1], 'ilst'); if (!ilst) return {};
  const out = {};
  walk(ilst[0], ilst[0] + ilst[1], (type, s, l) => {
    if (l > 1e5) return true;
    const item = readAt(fd, s, l);
    if (item.length < 16 || item.toString('latin1', 4, 8) !== 'data') return true;
    const v = item.subarray(16, item.readUInt32BE(0));
    const key = MP4_KEYS[Buffer.from(type, 'latin1').toString('latin1')];
    if (key) out[key] = v.toString('utf8').trim();
    else if ((type === 'trkn' || type === 'disk') && v.length >= 4 && v.readUInt16BE(2)) out[type === 'trkn' ? 'track' : 'disc'] = String(v.readUInt16BE(2));
    else if (type === 'tvsn' && v.length >= 4) out.season = String(v.readUInt32BE(0));
    else if (type === 'tves' && v.length >= 4) out.episode = String(v.readUInt32BE(0));
    return true;
  });
  return out;
}

// ---- Photos: the date taken ----
function exifDate(buf) {
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd9 || m === 0xda) break;
    if (m === 0xd8 || m === 0xff || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2 - (m === 0xff ? 1 : 0); continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m === 0xe1 && buf.toString('latin1', i + 4, i + 8) === 'Exif') return tiffDate(buf, i + 10, Math.min(buf.length, i + 2 + len));
    i += 2 + len;
  }
  return '';
}
function tiffDate(buf, t, end) {
  try {
    const le = buf.toString('latin1', t, t + 2) === 'II';
    const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
    const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
    const entries = (ifd) => { const n = u16(t + ifd); return Array.from({ length: Math.min(n, 300) }, (_, k) => t + ifd + 2 + k * 12).filter((e) => e + 12 <= end); };
    const str = (e) => buf.toString('latin1', t + u32(e + 8), t + u32(e + 8) + 19);
    let found = '';
    const ifd0 = entries(u32(t + 4));
    for (const e of ifd0) {
      if (u16(e) === 0x8769) for (const x of entries(u32(e + 8))) if (u16(x) === 0x9003) return str(x);
      if (u16(e) === 0x0132) found = str(e);
    }
    return found;
  } catch { return ''; }
}

// "2026:11:11 09:15:00" (or a Date) -> { year, month, day, date }.
export function dateParts(d) {
  let y, m, day;
  const s = typeof d === 'string' ? d.match(/^(\d{4})[:-](\d{2})[:-](\d{2})/) : null;
  if (s) [, y, m, day] = s;
  else if (d instanceof Date && !Number.isNaN(d.getTime())) { y = String(d.getFullYear()); m = String(d.getMonth() + 1).padStart(2, '0'); day = String(d.getDate()).padStart(2, '0'); }
  if (!y || y === '0000') return {};
  return { year: y, month: m, day, date: `${y}-${m}-${day}` };
}

// ---- What the name says ----
const JUNK = /\b(2160p|1080p|720p|480p|4k|uhd|hdr\d*|dv|web[- .]?dl|webrip|bluray|blu-ray|brrip|bdrip|dvdrip|hdtv|x26[45]|h\.?26[45]|hevc|avc|aac\d?(?:\.\d)?|ac3|dts|ddp?\d?(?:\.\d)?|atmos|10bit|remux|proper|repack|extended|internal|multi|subs?)\b.*$/i;
const words = (s) => String(s || '').replace(/[._]+/g, ' ').replace(/\s+-\s*$/, '').replace(/\s+/g, ' ').trim();

// { isEpisode, show, season, episode, title, year, artist, track } from a file name (no extension).
// kind: 'video' looks for episode numbers and a film's year; 'audio' for "01 Artist - Title".
export function parseName(name, kind = '') {
  const n = String(name || '');
  if (kind !== 'video' && kind !== 'audio') return { isEpisode: false, title: words(n) };
  const ep = kind === 'video' && (n.match(/^(.*?)[\s._-]*\bs(\d{1,2})[\s._-]?e(\d{1,3})\b(.*)$/i) || n.match(/^(.*?)[\s._-]+(\d{1,2})x(\d{2,3})\b(.*)$/i));
  if (ep) {
    const rest = words(ep[4].replace(JUNK, '')).replace(/^-\s*/, '');
    return { isEpisode: true, show: words(ep[1].replace(/[\s._-]*\(?(19|20)\d{2}\)?$/, '')), season: String(Number(ep[2])), episode: String(Number(ep[3])), title: rest };
  }
  if (kind === 'video') {
    const film = n.match(/^(.*?)[\s._([-]+((?:19|20)\d{2})(?:[\s._)\]-]|$)/);
    if (film && film[1].trim()) return { isEpisode: false, title: words(film[1]), year: film[2] };
    return { isEpisode: false, title: words(n.replace(JUNK, '')) || words(n) };
  }
  const song = n.match(/^(?:(\d{1,3})[\s._-]+(?:-\s*)?)?(?:(.+?)\s+-\s+)?(.+)$/);
  const out = { isEpisode: false, title: words(n) };
  if (song) {
    if (song[1]) out.track = String(Number(song[1]));
    if (song[2]) out.artist = words(song[2]);
    out.title = words(song[3]);
  }
  return out;
}

const AUDIO_X = ['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.oga', '.wav', '.wma', '.aiff', '.ape', '.wv', '.m4b'];
const VIDEO_X = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.wmv', '.m4v', '.mpg', '.mpeg', '.ts'];
export const mediaKind = (ext) => (AUDIO_X.includes(ext) ? 'audio' : VIDEO_X.includes(ext) ? 'video' : '');

// Everything known about one file: tags first, then the name. stat: an fs.Stats (for the photo fallback date).
export function mediaInfo(file, stat = null) {
  const ext = path.extname(file).toLowerCase();
  const name = path.basename(file, path.extname(file));
  const fromName = parseName(name, mediaKind(ext));
  let tags = {};
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = stat?.size ?? fs.fstatSync(fd).size;
    if (['.mp3', '.aac', '.wav', '.aiff'].includes(ext)) tags = { ...(id3v1(fd, size) || {}), ...(id3v2(fd, size) || {}) };
    else if (ext === '.flac') tags = flac(fd, size) || {};
    else if (['.ogg', '.opus', '.oga'].includes(ext)) tags = ogg(fd, size) || {};
    else if (['.m4a', '.mp4', '.m4v', '.mov', '.m4b'].includes(ext)) tags = mp4(fd, size) || {};
    else if (['.jpg', '.jpeg'].includes(ext)) { const d = dateParts(exifDate(readAt(fd, 0, 256 * 1024))); if (d.year) tags = { ...d, dated: 'taken' }; }
  } catch { /* unreadable: the name is all we have */ } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  for (const k of Object.keys(tags)) if (typeof tags[k] === 'string') tags[k] = tags[k].replace(/\s+/g, ' ').trim();
  if (tags.track) tags.track = String(parseInt(tags.track, 10) || '');   // "3/12" -> "3"
  if (tags.disc) tags.disc = String(parseInt(tags.disc, 10) || '');
  if (tags.year) tags.year = (String(tags.year).match(/(1[89]|20)\d{2}/) || [''])[0];
  const info = { ...fromName, ...Object.fromEntries(Object.entries(tags).filter(([, v]) => v !== '' && v !== undefined)) };
  if (tags.season || tags.episode) info.isEpisode = true;
  if (!info.year || !info.month) { const d = dateParts(stat?.mtime || null); for (const [k, v] of Object.entries(d)) if (!info[k]) info[k] = v; }
  info.tagged = Boolean(tags.title || tags.artist || tags.album || tags.show);
  info.name = name;
  info.ext = ext.slice(1);
  return info;
}
