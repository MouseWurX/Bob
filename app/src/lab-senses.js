// Computer Science Lab: Give it eyes / Give it ears (design: bob-design/thinking-paths.md section 16).
// A brain that sees or hears is a text brain plus a reader file (llama.cpp's mmproj): a small eye or ear and a tiny
// translator that turns what it saw or heard into the brain's own kind of numbers. Taking a sense out is not loading
// that file. Adding one is loading a reader that fits next to a brain that never had one:
//   1. Find a match: readers on this replicant matrix, readers in Bob's catalogue, or one from a file, a Hugging Face
//      name or link, or another link, each checked against the brain before anything big is downloaded.
//   2. Attach and try: free, here. The pair goes into Bob as its own brain, and a picture or sound box tries it.
//   3. Sharpen: a short rented teach-back, written as a Forge plan. It never starts by itself: the Forge tab's purchase
//      card is the only way a rental starts.
//   4. Measure: the picture or sound pack, plus the Lab's quick quiz so the text can be seen not to slip.
// Never sent anywhere but huggingface.co: the person's own HF_TOKEN, and only in a header, never shown or saved.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { readGguf, readerFacts, isSightTensor } from './lab-gguf.js';

export const SENSES = {
  sight: { label: 'eyes', give: 'Give it eyes', has: 'sees pictures', pack: 'Looking at pictures', try: 'Look at a picture' },
  hearing: { label: 'ears', give: 'Give it ears', has: 'hears sounds', pack: 'Listening', try: 'Listen to a sound' }
};
export const SENSE_IDS = Object.keys(SENSES);
export const MAX_READER_GB = 8; // the biggest readers are about 2 GB; anything far past that isn't one
const GB = 1024 ** 3;
const round1 = (x) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- where a reader comes from

const HF_NAME = /^[A-Za-z0-9][\w.-]{0,95}\/[A-Za-z0-9][\w.-]{0,95}$/;
const HF_REV = /^[\w.-]{1,64}$/;
const GGUF_FILE = /^(?!.*\.\.)(?!\/)[\w./ +()-]{1,200}\.gguf$/i;
// "the file is a reader" by its name, for listing a repo's files; the header check is what decides.
export const looksLikeReader = (f) => /\.gguf$/i.test(f) && /(mmproj|projector|vision|audio|clip|encoder)/i.test(path.basename(f));

// A local file (absolute path), a Hugging Face name, file or link, or another https link to a .gguf.
// { kind: 'file', path } | { kind: 'hf', repo, revision, file } | { kind: 'link', url } | null
export function parseSource(input) {
  const s = String(input || '').trim();
  if (!s || s.length > 600) return null;
  if (/^hf:/i.test(s)) {
    let r = s.slice(3), rev = '', file = '';
    const at = r.lastIndexOf('@'); if (at > 0) { rev = r.slice(at + 1); r = r.slice(0, at); }
    const c = r.indexOf(':'); if (c > 0) { file = r.slice(c + 1); r = r.slice(0, c); }
    return hfSource(r, rev, file);
  }
  if (/^https?:\/\//i.test(s)) {
    const u = s.replace(/[?#].*$/, '');
    const m = u.match(/^https:\/\/huggingface\.co\/([^/]+\/[^/]+?)(?:\/(?:tree|blob|resolve)\/([^/]+)(?:\/(.+))?)?\/?$/i);
    if (m) { if (/^datasets$|^spaces$/i.test(m[1].split('/')[0])) return null; return hfSource(m[1], m[2] || '', m[3] ? decodeURIComponent(m[3]) : ''); }
    if (!/^https:\/\//i.test(u)) return null; // plain http could be changed on the way
    let url; try { url = new URL(u); } catch { return null; }
    if (url.username || url.password || !/\.gguf$/i.test(url.pathname)) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) return null;
    return { kind: 'link', url: url.href };
  }
  if (path.isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s)) return /\.gguf$/i.test(s) ? { kind: 'file', path: path.normalize(s) } : null;
  return hfSource(s, '', '');
}
function hfSource(repo, rev, file) {
  if (!HF_NAME.test(repo) || (rev && !HF_REV.test(rev)) || (file && !GGUF_FILE.test(file))) return null;
  return { kind: 'hf', repo, revision: rev && rev !== 'main' ? rev : '', file };
}
export const hfFileUrl = ({ repo, revision, file }) => `https://huggingface.co/${repo}/resolve/${encodeURIComponent(revision || 'main')}/${file.split('/').map(encodeURIComponent).join('/')}`;
export const sourceWords = (s) => (s.kind === 'file' ? `your file ${path.basename(s.path)}` : s.kind === 'hf' ? `${s.repo}${s.file ? `, ${s.file}` : ''} on Hugging Face` : `the link ${new URL(s.url).hostname}`);

// One GET, with the token only to huggingface.co itself. Redirects (Hugging Face sends big files to its file store)
// are followed by hand so the token never goes along to the next host.
export async function getFile(url, { fetchFn = fetch, token = process.env.HF_TOKEN || '', headers = {}, signal } = {}) {
  let u = url;
  for (let hop = 0; hop < 5; hop++) {
    const host = new URL(u).hostname;
    const h = { ...headers, ...(token && host === 'huggingface.co' ? { Authorization: `Bearer ${token}` } : {}) };
    const res = await fetchFn(u, { headers: h, redirect: 'manual', signal });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers?.get?.('location');
      if (!loc) throw new Error('The download was sent elsewhere without saying where.');
      const next = new URL(loc, u);
      if (next.protocol !== 'https:') throw new Error('The download was sent to a plain http address, so the Lab stopped.');
      u = next.href; continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error(token ? 'Hugging Face says your token can\'t open this. If it\'s gated, accept its terms on its page first.' : 'This one is private or gated. Put your own HF_TOKEN in your environment, accept its terms on its page, and try again.');
    if (res.status === 404) throw new Error('There\'s no file there.');
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    return res;
  }
  throw new Error('The download kept being sent elsewhere, so the Lab stopped.');
}
const totalOf = (res) => { const cr = res.headers?.get?.('content-range'); const m = cr && cr.match(/\/(\d+)$/); return m ? Number(m[1]) : Number(res.headers?.get?.('content-length')) || 0; };

// Read only the start of a far-away reader file (its header: what it holds and how wide its translator is), so a
// reader that doesn't fit is never downloaded. Gives { g, bytes } where bytes is the whole file's size.
export async function peekReader(url, { fetchFn = fetch, token, dir, signal } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `peek-${crypto.randomBytes(6).toString('hex')}.gguf`);
  try {
    for (const mb of [8, 48]) {
      const res = await getFile(url, { fetchFn, token, headers: { Range: `bytes=0-${mb * 1024 * 1024 - 1}` }, signal });
      const total = totalOf(res);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > mb * 1024 * 1024 + 1024) throw new Error('That server sent the whole file instead of its start, so it couldn\'t be checked first.');
      fs.writeFileSync(tmp, buf);
      try { return { g: readGguf(tmp), bytes: total || buf.length }; } catch (e) { if (!/ends too soon/.test(e.message) || buf.length < mb * 1024 * 1024) throw new Error(`That isn't a reader file the Lab can read: ${e.message}`); }
    }
    throw new Error('That file\'s header is too big to be a reader.');
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}

// Download a reader to `file`, with progress, and the sha256 checked when it's known. Partial files never stay.
export async function downloadReader(url, file, { fetchFn = fetch, token, signal, onProgress = () => {}, sha256 = '', maxBytes = MAX_READER_GB * GB } = {}) {
  const res = await getFile(url, { fetchFn, token, signal });
  const total = totalOf(res);
  if (total > maxBytes) throw new Error(`That file is ${round1(total / GB)} GB, which is far too big to be a reader.`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const part = file + '.part', hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(part);
  let got = 0;
  try {
    for await (const chunk of res.body) {
      if (signal?.aborted) throw new Error('Stopped.');
      got += chunk.length;
      if (got > maxBytes) throw new Error('That file is far too big to be a reader.');
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      onProgress(got, total);
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    if (sha256 && hash.digest('hex') !== sha256.toLowerCase()) throw new Error('The file that came down isn\'t the one the catalogue checked, so it was thrown away.');
    fs.renameSync(part, file);
    return { file, bytes: got };
  } catch (e) { out.destroy(); try { fs.unlinkSync(part); } catch {} throw e; }
}

// ---------------------------------------------------------------- does a reader fit a brain

// How wide the brain's words are (its embedding length). Some vision families feed extra layers of the picture
// straight into the brain (Qwen3-VL's "deepstack"), so what they take in is wider by that many copies.
export function textWidths(g) {
  const a = g.meta['general.architecture'] || '';
  const n = Number(g.meta[`${a}.embedding_length`]) || 0;
  const deep = Number(g.meta[`${a}.n_deepstack_layers`]) || 0;
  return { arch: a, width: n, widths: [...new Set([n, deep ? n * (1 + deep) : 0].filter(Boolean))] };
}

// The reader's side: which senses it has, and how wide its translator's output is (from its settings, else from
// the shapes of its translator's own weights).
export function readerWidths(g) {
  const f = readerFacts(g), out = { sight: null, hearing: null, size: f.size, projector: String(g.meta['clip.projector_type'] || g.meta['clip.vision.projector_type'] || '').slice(0, 40) };
  for (const s of SENSE_IDS) {
    if (!f[s]) continue;
    const key = Number(g.meta[s === 'sight' ? 'clip.vision.projection_dim' : 'clip.audio.projection_dim']) || 0;
    if (key) { out[s] = { widths: [key], sure: true }; continue; }
    const own = g.tensors.filter((t) => (s === 'sight' ? isSightTensor(t.name) && t.name.startsWith('mm.') : t.name.startsWith('mm.a.')) && /weight$/.test(t.name) && t.dims.length === 2);
    out[s] = { widths: [...new Set(own.flatMap((t) => t.dims))], sure: false };
  }
  return out;
}

// One reader against one brain, in words. fits: true (it lines up), false (it can't), null (can't tell from the file).
export function readerFit(brainG, readerG) {
  const t = textWidths(brainG), r = readerWidths(readerG);
  const senses = {};
  for (const s of SENSE_IDS) {
    if (!r[s]) continue;
    const hit = r[s].widths.some((w) => t.widths.includes(w));
    senses[s] = { fits: !t.width ? null : hit ? true : r[s].sure || r[s].widths.length ? false : null };
  }
  const have = Object.keys(senses);
  const fits = have.filter((s) => senses[s].fits === true);
  const words = !have.length ? 'This file has no eyes or ears in it, so it isn\'t a reader.'
    : fits.length ? `Lines up with this brain (${fits.map((s) => SENSES[s].label).join(' and ')}). Borrowed from a relative, the first result can be a bit blurry; Sharpen fixes that.`
    : have.some((s) => senses[s].fits === null) ? 'The Lab can\'t tell from the file whether it lines up. Try it: the engine will say.'
    : `Doesn't line up: its translator speaks ${r[have[0]].widths[0] || '?'}-wide, and this brain listens ${t.width}-wide. A reader from another family needs a new translator: that's Sharpen, Train a new translator.`;
  return { width: t.width, arch: t.arch, projector: r.projector, sizeGB: round1(r.size / GB), senses, ok: fits.length > 0, unsure: !fits.length && have.some((s) => senses[s].fits === null), words };
}

// ---------------------------------------------------------------- the readers there are to borrow

// Readers in Bob's catalogue: pinned files that Bob already checks by sha256. Same family first.
export function catalogReaders(catalog) {
  const seen = new Map();
  for (const e of catalog?.models || []) {
    const f = (e.files || []).find((x) => x.role === 'mmproj');
    if (!f?.url || seen.has(f.url)) continue;
    const m = f.url.match(/^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/([^/]+)\/(.+)$/);
    seen.set(f.url, { id: `cat-${crypto.createHash('sha1').update(f.url).digest('hex').slice(0, 10)}`, name: `${e.name}'s reader`, family: e.family || '', from: e.id, url: f.url, repo: m?.[1] || '', revision: m?.[2] || '', file: m ? decodeURIComponent(m[3]) : '', saveAs: f.saveAs || '', sha256: f.sha256 || '', sizeGB: f.bytes ? round1(f.bytes / GB) : null, license: e.license || '' });
  }
  return [...seen.values()];
}

export const sensesDir = (labModelsDir) => path.join(labModelsDir, 'senses');
export const sensesDataDir = (labDirPath) => path.join(labDirPath, 'senses');
export const safeName = (s) => String(s || 'reader').replace(/[^\w.+()-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'reader.gguf';

// The brains this card can work on: the Lab's brains with how wide they are and what they can already do.
export function sensesBrains(brains, { read = readGguf, noEyes = [] } = {}) {
  return brains.map((b) => {
    let t = null, r = null;
    try { t = textWidths(read(b.gguf)); } catch {}
    if (b.mmproj) { try { r = readerFacts(read(b.mmproj)); } catch {} }
    return { id: b.id, name: b.name, family: b.family || '', width: t?.width || 0, arch: t?.arch || '', sight: Boolean(r?.sight), hearing: Boolean(r?.hearing), noEyes: noEyes.includes(b.id), madeInLab: Boolean(b.madeInLab) };
  });
}

// ---------------------------------------------------------------- the picture and sound packs (made here, no downloads)

// A small PNG painter, so the picture pack is made on the spot and is the same everywhere.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
export function png(w, h, paint) {
  const px = Buffer.alloc(w * h * 3, 255);
  const set = (x, y, [r, g, b]) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
  paint({ set, w, h });
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const COLOURS = { red: [220, 30, 30], green: [30, 160, 50], blue: [30, 70, 220], yellow: [245, 205, 20], black: [20, 20, 20], purple: [130, 40, 170], orange: [245, 130, 20] };
const rect = (p, x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) p.set(x, y, c); };
const disc = (p, cx, cy, r, c) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) p.set(cx + x, cy + y, c); };
const tri = (p, cx, cy, r, c) => { for (let y = 0; y <= 2 * r; y++) { const half = Math.round((y / (2 * r)) * r); for (let x = -half; x <= half; x++) p.set(cx + x, cy - r + y, c); } };
const FONT = { 0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'], 2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], 3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'], 4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'], 6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'], 8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'] };
const digits = (p, text, x0, y0, s, c) => { [...text].forEach((d, k) => FONT[d].forEach((row, y) => [...row].forEach((on, x) => { if (on === '1') rect(p, x0 + k * 6 * s + x * s, y0 + y * s, x0 + k * 6 * s + (x + 1) * s, y0 + (y + 1) * s, c); }))); };

const word = (w) => new RegExp(`\\b${w}\\b`, 'i');
const numberIs = (n) => { const names = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']; return (a) => { const m = String(a).toLowerCase().match(/\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/); return Boolean(m) && (m[1] === String(n) || m[1] === names[n]); }; };

// Picture pack: [{ id, q, picture (PNG Buffer), right(answer) -> bool }]. Plain shapes, so a right answer is clear.
export function picturePack() {
  const S = 256, out = [];
  for (const c of ['red', 'green', 'blue', 'yellow']) out.push({ id: `colour-${c}`, q: 'What colour is the square? Answer with one word.', picture: png(S, S, (p) => rect(p, 64, 64, 192, 192, COLOURS[c])), right: (a) => word(c).test(a) });
  for (const n of [2, 3, 5]) out.push({ id: `count-${n}`, q: 'How many circles are in the picture? Answer with a number.', picture: png(S, S, (p) => { for (let i = 0; i < n; i++) disc(p, 40 + ((i * 47) % 180), 60 + Math.floor(i / 4) * 110 + (i % 2) * 40, 18, COLOURS.black); }), right: numberIs(n) });
  for (const side of ['left', 'right']) out.push({ id: `side-${side}`, q: 'Is the red square on the left or the right of the picture? Answer with one word.', picture: png(S, S, (p) => { const x = side === 'left' ? 24 : 160; rect(p, x, 96, x + 72, 168, COLOURS.red); }), right: (a) => word(side).test(a) && !word(side === 'left' ? 'right' : 'left').test(a) });
  for (const n of ['7', '42']) out.push({ id: `number-${n}`, q: 'What number is written in the picture? Answer with the number only.', picture: png(S, S, (p) => digits(p, n, n.length === 1 ? 88 : 40, 72, 16, COLOURS.black)), right: (a) => new RegExp(`(^|\\D)${n}(\\D|$)`).test(String(a)) });
  for (const [shape, draw] of [['circle', (p) => disc(p, 128, 128, 80, COLOURS.blue)], ['triangle', (p) => tri(p, 128, 128, 80, COLOURS.green)]]) out.push({ id: `shape-${shape}`, q: 'What shape is in the picture? Answer with one word.', picture: png(S, S, draw), right: (a) => word(shape).test(a) });
  out.push({ id: 'two-colours', q: 'There are two squares. What colours are they? Name both.', picture: png(S, S, (p) => { rect(p, 24, 88, 104, 168, COLOURS.purple); rect(p, 152, 88, 232, 168, COLOURS.orange); }), right: (a) => word('purple').test(a) && word('orange').test(a) });
  return out;
}

// A small WAV maker (16 kHz, one channel). parts: [{ hz, from, to, s, quiet }].
export function wav(parts, rate = 16000) {
  const samples = [];
  for (const x of parts) {
    const n = Math.round(x.s * rate); let ph = 0;
    for (let i = 0; i < n; i++) {
      const hz = x.quiet ? 0 : x.hz || x.from + ((x.to - x.from) * i) / n;
      ph += (2 * Math.PI * hz) / rate;
      const edge = Math.min(1, i / 160, (n - i) / 160);
      samples.push(x.quiet ? 0 : Math.round(Math.sin(ph) * 0.5 * edge * 32767));
    }
  }
  const data = Buffer.alloc(samples.length * 2); samples.forEach((v, i) => data.writeInt16LE(v, i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const beeps = (n) => [{ quiet: true, s: 0.3 }, ...Array.from({ length: n }, () => [{ hz: 880, s: 0.2 }, { quiet: true, s: 0.35 }]).flat()];
// Sound pack: [{ id, q, sound (WAV Buffer), right }].
export function soundPack() {
  return [
    ...[2, 3, 4].map((n) => ({ id: `beeps-${n}`, q: 'How many beeps are in this sound? Answer with a number.', sound: wav(beeps(n)), right: numberIs(n) })),
    { id: 'pitch-up', q: 'Does the pitch of this sound go up or down? Answer with one word.', sound: wav([{ from: 300, to: 1200, s: 1.5 }]), right: (a) => word('up').test(a) && !word('down').test(a) },
    { id: 'pitch-down', q: 'Does the pitch of this sound go up or down? Answer with one word.', sound: wav([{ from: 1200, to: 300, s: 1.5 }]), right: (a) => word('down').test(a) && !word('up').test(a) },
    { id: 'silence', q: 'Is there any sound in this clip, or is it silent? Answer "sound" or "silent".', sound: wav([{ quiet: true, s: 1.5 }]), right: (a) => /silen/i.test(a) }
  ];
}

// One question as the engine's chat message: a picture as an image part, a sound as an audio part.
export function senseMessage(q, { picture, sound } = {}) {
  const parts = [{ type: 'text', text: q }];
  if (picture) { const b = Buffer.isBuffer(picture) ? picture : Buffer.from(String(picture), 'base64'); parts.push({ type: 'image_url', image_url: { url: `data:${pictureType(b)};base64,${b.toString('base64')}` } }); }
  if (sound) { const b = Buffer.isBuffer(sound) ? sound : Buffer.from(String(sound), 'base64'); parts.push({ type: 'input_audio', input_audio: { data: b.toString('base64'), format: soundType(b) } }); }
  return [{ role: 'user', content: parts }];
}
export const pictureType = (b) => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : b.slice(0, 3).toString() === 'GIF' ? 'image/gif' : '');
export const soundType = (b) => (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WAVE' ? 'wav' : b.slice(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) ? 'mp3' : '');
export const MAX_UPLOAD = 12 * 1024 * 1024;
// What the page sends for Try: base64 of a picture or a sound, checked for what it really is.
export function cleanUpload(b64, kind) {
  const s = String(b64 || '').replace(/^data:[^,]*,/, '');
  if (!s) return null;
  if (s.length > (MAX_UPLOAD * 4) / 3 + 8) throw new Error('That file is too big. Pick one under 12 MB.');
  const buf = Buffer.from(s, 'base64');
  if (kind === 'sight' && !pictureType(buf)) throw new Error('That isn\'t a picture the engine can read (PNG, JPEG, WebP or GIF).');
  if (kind === 'hearing' && !soundType(buf)) throw new Error('That isn\'t a sound the engine can read (WAV or MP3).');
  return buf;
}

// Ask a running engine one sense question at temperature 0.
export async function askSense(url, q, media, { signal, fetchFn = fetch } = {}) {
  const r = await fetchFn(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: senseMessage(q, media), temperature: 0, max_tokens: 200, chat_template_kwargs: { enable_thinking: false } }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180e3)]) : AbortSignal.timeout(180e3) });
  if (!r.ok) { let t = ''; try { t = (await r.text()).slice(0, 300); } catch {} throw new Error(/image|audio|mmproj|multimodal/i.test(t) ? `The engine couldn't take that in with this reader: ${t}` : `The engine answered ${r.status}.`); }
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// The pack on a running engine: { right, of, score, misses: [{ id, said }] }.
export async function runSensePack(url, sense, { signal, onStep = () => {}, fetchFn } = {}) {
  const pack = sense === 'hearing' ? soundPack() : picturePack();
  let right = 0; const misses = [];
  for (let i = 0; i < pack.length; i++) {
    if (signal?.aborted) throw new Error('Stopped.');
    const x = pack[i]; let said = '';
    try { said = await askSense(url, x.q, sense === 'hearing' ? { sound: x.sound } : { picture: x.picture }, { signal, fetchFn }); } catch (e) { if (signal?.aborted) throw e; if (i === 0) throw e; said = ''; }
    if (x.right(said)) right++; else misses.push({ id: x.id, said: said.slice(0, 160) });
    onStep(i + 1, pack.length);
  }
  return { right, of: pack.length, score: Math.round((100 * right) / pack.length), misses };
}

// ---------------------------------------------------------------- Sharpen: the rented part, as a Forge plan

export const WAYS = [
  { id: 'heal', title: 'Sharpen a borrowed reader', what: 'A short teach-back on picture (or sound) lessons, so the borrowed translator lines up with this brain again. The eye or ear itself never changes.', hours: 3 },
  { id: 'projector', title: 'Train a new translator', what: 'For a brain with no relative to borrow from: keep a ready-made eye or ear as it is, and train only the translator, then a short pass on questions about pictures. The text brain doesn\'t change in the first step, so it can\'t get worse at text.', hours: 24 },
  { id: 'full', title: 'Teach the text brain too', what: 'After a new translator, the text brain learns from picture lessons as well. Better at pictures, costs more, and can cost a little text skill, so Measure before and after.', hours: 30 }
];
export const WAY_IDS = WAYS.map((w) => w.id);
export const BUILTIN_LESSONS = 600;

// Built-in picture lessons: plain shapes, colours, counts and numbers, each with a caption and a question. Written
// into a folder as lessons.jsonl plus pictures/, the same shape as a folder of the person's own photos.
export function writeBuiltinLessons(dir, { count = BUILTIN_LESSONS, sense = 'sight' } = {}) {
  fs.mkdirSync(path.join(dir, sense === 'hearing' ? 'sounds' : 'pictures'), { recursive: true });
  const lines = [];
  const names = Object.keys(COLOURS).filter((c) => c !== 'black');
  for (let i = 0; i < count; i++) {
    let media, caption, q;
    if (sense === 'hearing') {
      const n = 1 + (i % 5), up = i % 2 === 0;
      if (i % 3 === 0) { media = wav(beeps(n)); q = 'How many beeps?'; caption = `${n} beep${n > 1 ? 's' : ''}.`; } else { const lo = 200 + (i % 7) * 50, hi = 900 + (i % 5) * 100; media = wav([{ from: up ? lo : hi, to: up ? hi : lo, s: 1 + (i % 3) * 0.3 }]); q = 'Does the pitch go up or down?'; caption = `It goes ${up ? 'up' : 'down'}.`; }
    } else {
      const c = names[i % names.length], n = 1 + (i % 6), kind = i % 4, S = 192;
      if (kind === 0) { media = png(S, S, (p) => rect(p, 30 + (i % 40), 30 + (i % 30), 130 + (i % 40), 130 + (i % 30), COLOURS[c])); q = 'Describe the picture.'; caption = `A ${c} square on a white background.`; }
      else if (kind === 1) { media = png(S, S, (p) => { for (let k = 0; k < n; k++) disc(p, 24 + ((k * 31 + i) % 144), 30 + Math.floor(k / 3) * 70 + (k % 2) * 20, 12, COLOURS[c]); }); q = 'How many circles are there?'; caption = `There ${n === 1 ? 'is one' : `are ${n}`} ${c} circle${n > 1 ? 's' : ''}.`; }
      else if (kind === 2) { const num = String((i * 7) % 100); media = png(S, S, (p) => digits(p, num, 30, 50, 8, COLOURS.black)); q = 'What number is written?'; caption = `The number ${num}.`; }
      else { const left = i % 2 === 0; media = png(S, S, (p) => tri(p, left ? 50 : 142, 96, 36, COLOURS[c])); q = 'What is in the picture, and where?'; caption = `A ${c} triangle on the ${left ? 'left' : 'right'}.`; }
    }
    const name = `${sense === 'hearing' ? 'sounds' : 'pictures'}/${String(i).padStart(4, '0')}.${sense === 'hearing' ? 'wav' : 'png'}`;
    fs.writeFileSync(path.join(dir, name), media);
    lines.push(JSON.stringify({ messages: [{ role: 'user', content: q }, { role: 'assistant', content: caption }], [sense === 'hearing' ? 'sounds' : 'images']: [name] }));
  }
  fs.writeFileSync(path.join(dir, 'lessons.jsonl'), lines.join('\n') + '\n');
  return { file: path.join(dir, 'lessons.jsonl'), count };
}

// A folder of the person's own: pictures (or sounds) with a caption each, as same-name .txt files, or a
// lessons.jsonl already in the shape above. Gives { file, count } or throws in words.
export function readOwnLessons(dir, sense = 'sight') {
  let st; try { st = fs.statSync(dir); } catch { throw new Error('That folder isn\'t there.'); }
  if (!st.isDirectory()) throw new Error('Pick a folder, not a file.');
  const jl = path.join(dir, 'lessons.jsonl');
  if (fs.existsSync(jl)) { const n = fs.readFileSync(jl, 'utf8').split(/\r?\n/).filter(Boolean).length; if (!n) throw new Error('Its lessons.jsonl is empty.'); return { file: jl, count: n }; }
  const ext = sense === 'hearing' ? /\.(wav|mp3)$/i : /\.(png|jpe?g|webp)$/i;
  const pairs = fs.readdirSync(dir).filter((f) => ext.test(f) && fs.existsSync(path.join(dir, f.replace(/\.[^.]+$/, '.txt'))));
  if (pairs.length < 20) throw new Error(`I found ${pairs.length} ${sense === 'hearing' ? 'sounds' : 'pictures'} with a caption next to them (a .txt with the same name). Sharpen needs at least 20.`);
  return { pairs: pairs.length, dir, count: pairs.length };
}

// The plan the Forge reads. It goes in <data>/lab/forge-plans/ like every Forge plan, and starts only from the
// Forge tab's purchase card. The pod trains full-size weights, never the running files here, so the brain and the
// eye or ear are named as Hugging Face repos (or the brain as a folder on the Forge's own disk), never GGUF paths.
// form: { run, sense, way, brainRepo | brainDir, tower, lessons: [{ file } | { dir }], hours_max, dollars_max }.
export function makeSensesPlan(form = {}, { forgeReady = false } = {}) {
  const problems = [], notes = [];
  const way = WAYS.find((w) => w.id === form.way) || WAYS[0];
  const sense = SENSE_IDS.includes(form.sense) ? form.sense : 'sight';
  const part = sense === 'hearing' ? 'ear' : 'eye';
  const run = String(form.run || '').replace(/[^\w.-]/g, '').slice(0, 40);
  if (!run) problems.push('Give the run a name.');
  const brain = parseSource(form.brainRepo);
  const dir = String(form.brainDir || '').trim();
  const volDir = /^\/workspace\/[\w./-]{1,200}$/.test(dir) && !dir.includes('..') ? dir : '';
  if (dir && !volDir) problems.push('A brain on the Forge\'s own disk is a folder under /workspace/ there.');
  if (!(brain?.kind === 'hf' && !brain.file) && !volDir) problems.push('Name the brain\'s full-size weights: its Hugging Face repo (owner/name), or its folder on the Forge\'s disk. The running file on this replicant matrix can\'t be taught.');
  const tower = parseSource(form.tower);
  if (!(tower?.kind === 'hf' && !tower.file)) problems.push(way.id === 'heal' ? `Name where the ${part} and its translator come from, in full-size form: the relative's Hugging Face repo (owner/name).` : `Name the ready-made ${part} on Hugging Face (owner/name). It's never trained, only the translator is.`);
  const lessons = (form.lessons || []).map((l) => (l.file ? { file: path.resolve(l.file) } : l.dir ? { dir: path.resolve(l.dir) } : null)).filter(Boolean);
  if (!lessons.length) problems.push('Pick the lessons: the built-in set, a folder of your own, or both.');
  const hours = Math.max(1, Number(form.hours) || way.hours);
  const hoursMax = Number(form.hours_max) || 0, dollarsMax = Number(form.dollars_max) || 0;
  if (!(hoursMax > 0) || !(dollarsMax > 0)) notes.push('Type the hours and dollars you\'ll allow. A plan with caps of 0 never starts.');
  else if (hoursMax < hours) notes.push(`The time cap is under the estimate (${hours} hours), so the run would stop before it's finished.`);
  if (!forgeReady) notes.push('The Forge doesn\'t do Sharpen runs yet: teaching a brain to see or hear is new work on the rented card, still to be built. This plan can be saved, and it won\'t start until the Forge update.');
  if (sense === 'hearing' && way.id === 'heal') notes.push('Bob\'s own brains have no ear to keep, so for them hearing is Train a new translator, with a ready-made ear.');
  notes.push(way.id === 'full' ? 'Run Measure before and after: this one can cost a little text skill.' : 'Measure after it comes home: the pack should go up, and the quick quiz should stay where it was.');
  const plan = {
    run, made_by: 'lab-senses', rungs: [],
    ...(brain?.kind === 'hf' ? { teacher: brain.repo, ...(brain.revision ? { teacher_revision: brain.revision } : {}) } : {}),
    senses: { sense, way: way.id, ...(volDir ? { brain_dir: volDir } : {}), ...(tower?.kind === 'hf' ? { tower: { repo: tower.repo, ...(tower.revision ? { revision: tower.revision } : {}) } } : {}), lessons, hours, out_name: `${run}-${sense === 'hearing' ? 'ears' : 'eyes'}` },
    hours_max: hoursMax, dollars_max: dollarsMax
  };
  return { plan, problems, notes, hours, way: way.id };
}

// Whether the Forge on this replicant matrix reads plan.senses. Until it does, a Sharpen plan never starts.
export const forgeDoesSenses = (forgeDirPath) => Boolean(forgeDirPath) && fs.existsSync(path.join(forgeDirPath, 'forge', 'senses.mjs'));
