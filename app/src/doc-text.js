// Reading the words out of documents with nothing extra installed (part of "Read and search my documents",
// Settings, How Bob works; off unless the user turns it on). Plain Node only: no LibreOffice, no packages, no
// programs started, nothing sent anywhere. It works the same on Windows, Mac and Linux (and for the Android app,
// which asks the computer's Bob).
//
//   Word (.docx .docm .dotx), Excel (.xlsx .xlsm), PowerPoint (.pptx .ppsx), OpenDocument (.odt .ods .odp),
//   e-books (.epub), Rich Text (.rtf) and PDF.
//
// The Office formats and OpenDocument are zip files full of XML, so this reads the zip in memory (sizes capped and
// checked as it inflates, so a "zip bomb" stops early) and keeps the words, headings, table cells and slide notes.
// PDF is read the simple way: the text drawing commands in each page, with the font maps (ToUnicode) the file
// carries. A scanned PDF has no words in it, only pictures (then it says to attach a page as a picture), and some
// PDFs hide their words in ways this can't follow; then it points at the Office documents Hand (LibreOffice).
// Old binary Word, Excel and PowerPoint files (.doc .xls .ppt) need the Office Hand too.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const DOC_EXT = ['docx', 'docm', 'dotx', 'xlsx', 'xlsm', 'pptx', 'ppsx', 'odt', 'ods', 'odp', 'epub', 'rtf', 'pdf'];
export const OLD_EXT = ['doc', 'xls', 'ppt'];
export const MAX_DOC_BYTES = 50 * 1024 * 1024; // the file itself
const MAX_UNZIPPED = 200 * 1024 * 1024; // everything taken out of one zip, together
const MAX_RATIO = 200; // an entry may grow up to this many times its packed size
export const MAX_OUT = 2_000_000; // characters kept from one document

const extOf = (f) => path.extname(String(f || '')).slice(1).toLowerCase();
export const isDoc = (f) => DOC_EXT.includes(extOf(f));

export class DocError extends Error {}
const OFFICE_HINT = 'The Office documents Hand (Settings, Hands) reads it with LibreOffice.';

// ---------------------------------------------------------------- zip, in memory

// The entries of a zip whose names pass want(name), as name -> Buffer. Stored and deflated entries only.
export function zipEntries(buf, want = () => true) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new DocError('That file is damaged or isn\'t really the kind its name says (no zip directory).');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  let total = 0;
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), packed = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name) || name.endsWith('/')) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + packed);
    if (size > packed * MAX_RATIO + 1024 || total + size > MAX_UNZIPPED) throw new DocError('That file unpacks to far more than it should, so I stopped reading it.');
    let data;
    if (method === 0) data = raw;
    else if (method === 8) {
      try { data = zlib.inflateRawSync(raw, { maxOutputLength: Math.min(MAX_UNZIPPED - total, packed * MAX_RATIO + 1024) }); } catch { throw new DocError('Part of that file is damaged, so I couldn\'t read it.'); }
    } else continue;
    total += data.length;
    out.set(name, data);
  }
  return out;
}

// ---------------------------------------------------------------- XML to words

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ''; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const tidy = (s) => String(s).replace(/ *\t */g, '\t').replace(/\n +/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').replace(/^\s+|\s+$/g, '');
const stripTags = (xml) => decodeEntities(xml.replace(/<[^>]*>/g, '')).replace(/ *\t */g, '\t').replace(/\t+\n/g, '\n');
const sortNum = (a, b) => (Number(a.match(/(\d+)\.xml$/)?.[1]) || 0) - (Number(b.match(/(\d+)\.xml$/)?.[1]) || 0);

function wordXml(xml) {
  // A table cell's paragraphs stay on one line; cells are split by tabs, rows by new lines.
  xml = xml.replace(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g, (m, inner) => inner.replace(/<\/w:p>/g, ' ') + '</w:tc>');
  return stripTags(xml
    .replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>|<w:cr\/>/g, '\n')
    .replace(/<\/w:tc>/g, '\t').replace(/\t?<\/w:tr>/g, '\n').replace(/<\/w:p>/g, '\n')
    .replace(/<w:delText[^>]*>[\s\S]*?<\/w:delText>/g, '')); // deleted text in tracked changes isn't the document
}

function docx(z) {
  const body = z.get('word/document.xml');
  if (!body) throw new DocError('That Word file has no document inside it.');
  const parts = [wordXml(body.toString('utf8'))];
  for (const k of ['word/footnotes.xml', 'word/endnotes.xml']) if (z.get(k)) { const t = tidy(wordXml(z.get(k).toString('utf8'))); if (t) parts.push(`Notes:\n${t}`); }
  return tidy(parts.join('\n\n'));
}

function colNum(ref) { let n = 0; for (const c of String(ref).replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n; }
function xlsx(z) {
  const shared = [];
  const ss = z.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(stripTags(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '')));
  const book = z.get('xl/workbook.xml')?.toString('utf8') || '';
  const names = [...book.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
  const sheets = [...z.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort(sortNum);
  const out = [];
  sheets.forEach((k, i) => {
    const xml = z.get(k).toString('utf8');
    const rows = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1], inner = c[2] || '';
        const t = attrs.match(/\bt="([^"]+)"/)?.[1] || '';
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val = '';
        if (t === 's') val = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') val = stripTags(inner.match(/<is>([\s\S]*?)<\/is>/)?.[1] || '');
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (v != null) val = decodeEntities(v);
        const col = colNum(attrs.match(/\br="([A-Z]+)\d+"/)?.[1] || '') || cells.length + 1;
        while (cells.length < col - 1) cells.push('');
        cells.push(val.replace(/\s+/g, ' ').trim());
      }
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length) rows.push(cells.join('\t'));
    }
    out.push(`Sheet: ${names[i] || `Sheet ${i + 1}`}\n${rows.join('\n') || '(empty)'}`);
  });
  if (!out.length) throw new DocError('That spreadsheet has no sheets inside it.');
  return tidy(out.join('\n\n'));
}

const drawingText = (xml) => stripTags(xml.replace(/<a:br\/>/g, '\n').replace(/<\/a:p>/g, '\n').replace(/<a:tab\/>/g, '\t'));
function pptx(z) {
  const slides = [...z.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort(sortNum);
  if (!slides.length) throw new DocError('That presentation has no slides inside it.');
  return tidy(slides.map((k, i) => {
    const n = k.match(/(\d+)\.xml$/)[1];
    const notes = z.get(`ppt/notesSlides/notesSlide${n}.xml`);
    const nt = notes ? tidy(drawingText(notes.toString('utf8')).replace(/^\s*\d+\s*$/gm, '')) : '';
    return `Slide ${i + 1}\n${tidy(drawingText(z.get(k).toString('utf8')))}${nt ? `\nNotes: ${nt}` : ''}`;
  }).join('\n\n'));
}

function odf(z) {
  const c = z.get('content.xml');
  const sheetWord = /spreadsheet/.test(z.get('mimetype')?.toString('utf8') || '') ? 'Sheet' : 'Table';
  if (!c) throw new DocError('That OpenDocument file has no content inside it.');
  let xml = c.toString('utf8');
  let slide = 0;
  xml = xml
    .replace(/<text:page-number\b[^>]*>[\s\S]*?<\/text:page-number>/g, '')
    .replace(/<presentation:notes\b[^>]*>/g, '\nNotes: ')
    .replace(/<table:table-cell\b([^>]*)>([\s\S]*?)<\/table:table-cell>/g, (m, a, inner) => `<table:table-cell${a}>${inner.replace(/<\/text:p>(?=[\s\S]*<text:p\b)/g, ' ').replace(/<\/text:p>/g, '')}</table:table-cell>`)
    .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (m, n) => ' '.repeat(Math.min(Number(n) || 1, 20)))
    .replace(/<text:tab\s*\/>/g, '\t').replace(/<text:line-break\s*\/>/g, '\n')
    .replace(/<table:table\b[^>]*table:name="([^"]*)"[^>]*>/g, (m, n) => `\n${sheetWord}: ${n}\n`)
    .replace(/<draw:page(?=[\s>])[^>]*>/g, () => `\nSlide ${++slide}\n`)
    .replace(/<table:table-cell\b[^>]*table:number-columns-repeated="(\d+)"[^>]*\/>/g, (m, n) => '\t'.repeat(Math.min(Number(n), 50)))
    .replace(/<\/table:table-cell>|<table:table-cell\b[^>]*\/>/g, '\t').replace(/<\/table:table-row>/g, '\n')
    .replace(/<\/text:p>|<\/text:h>/g, '\n');
  return tidy(stripTags(xml).split('\n').map((l) => l.replace(/\t+$/, '')).join('\n'));
}

export function htmlText(html) {
  return tidy(decodeEntities(String(html)
    .replace(/<(script|style|noscript|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article|pre)>/gi, '\n')
    .replace(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi, (m, k, a, inner) => `${inner.replace(/<\/?(p|div|br)\b[^>]*>/gi, ' ')}\t`)
    .replace(/<[^>]*>/g, '')));
}

function epub(z) {
  const opfName = (z.get('META-INF/container.xml')?.toString('utf8') || '').match(/full-path="([^"]+)"/)?.[1];
  const opf = opfName ? z.get(opfName)?.toString('utf8') || '' : '';
  const base = opfName ? path.posix.dirname(opfName) : '';
  const items = new Map([...opf.matchAll(/<item\b[^>]*>/g)].map((m) => [m[0].match(/\bid="([^"]+)"/)?.[1], m[0].match(/\bhref="([^"]+)"/)?.[1]]));
  let order = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => items.get(m[1])).filter(Boolean)
    .map((h) => path.posix.normalize(base && base !== '.' ? `${base}/${decodeURIComponent(h)}` : decodeURIComponent(h)));
  if (!order.length) order = [...z.keys()].filter((k) => /\.x?html?$/i.test(k));
  const text = order.filter((k) => z.has(k)).map((k) => htmlText(z.get(k).toString('utf8'))).filter(Boolean).join('\n\n');
  if (!text) throw new DocError('That e-book has no readable chapters.');
  return text;
}

// ---------------------------------------------------------------- RTF

export function rtfText(src) {
  let s = String(src);
  if (!/^\s*\{\\rtf/.test(s)) throw new DocError('That doesn\'t look like a Rich Text file inside.');
  // Groups that hold settings, not words: font and colour tables, pictures, hidden {\* ...} parts.
  const drop = /^\{\\(?:\*|fonttbl|colortbl|stylesheet|info|pict|listtable|listoverridetable|rsidtbl|generator|xmlnstbl|themedata|colorschememapping|latentstyles|datastore)/;
  let out = '', depth = 0, skipAt = -1, uc = 1, skipChars = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') { if (skipAt < 0 && drop.test(s.slice(i, i + 24))) skipAt = depth; depth++; continue; }
    if (ch === '}') { depth--; if (skipAt >= 0 && depth <= skipAt) skipAt = -1; continue; }
    if (ch === '\\') {
      const m = s.slice(i).match(/^\\([a-z]{1,32})(-?\d{1,10})? ?|^\\'([0-9a-f]{2})|^\\([^a-z])/i);
      if (!m) continue;
      i += m[0].length - 1;
      if (skipAt >= 0) continue;
      if (m[3]) { if (skipChars > 0) { skipChars--; continue; } out += Buffer.from([parseInt(m[3], 16)]).toString('latin1'); continue; }
      if (m[4]) { if (m[4] === '~') out += ' '; else if (m[4] === '-' || m[4] === '*') {} else if (m[4] === '\n' || m[4] === '\r') out += '\n'; else out += m[4]; continue; }
      const word = m[1], arg = m[2];
      if (word === 'par' || word === 'line' || word === 'sect' || word === 'page' || word === 'row') out += '\n';
      else if (word === 'tab') out += '\t';
      else if (word === 'cell') out += '\t';
      else if (word === 'uc') uc = Number(arg) || 0;
      else if (word === 'u') { let c = Number(arg); if (c < 0) c += 65536; out += String.fromCharCode(c); skipChars = uc; }
      continue;
    }
    if (skipAt >= 0 || ch === '\r' || ch === '\n') continue;
    if (skipChars > 0) { skipChars--; continue; }
    out += ch;
  }
  return tidy(out.replace(/\t+\n/g, '\n'));
}

// ---------------------------------------------------------------- PDF

function pdfString(s, i) { // a (literal) string starting at s[i] === '('; returns [bytes, next index]
  const bytes = [];
  let depth = 1; i++;
  while (i < s.length && depth > 0) {
    const c = s.charCodeAt(i);
    if (c === 0x5c) { // backslash
      const n = s[i + 1];
      const map = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
      if (n in map) { bytes.push(map[n]); i += 2; continue; }
      if (/[0-7]/.test(n)) { const oct = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)[0]; bytes.push(parseInt(oct, 8) & 255); i += 1 + oct.length; continue; }
      if (n === '\r' || n === '\n') { i += n === '\r' && s[i + 2] === '\n' ? 3 : 2; continue; }
      i += 2; continue;
    }
    if (c === 0x28) depth++;
    if (c === 0x29) { depth--; if (!depth) { i++; break; } }
    bytes.push(c & 255); i++;
  }
  return [bytes, i];
}
const hexBytes = (h) => { const x = h.replace(/[^0-9a-f]/gi, ''); const b = []; for (let i = 0; i < x.length; i += 2) b.push(parseInt((x.slice(i, i + 2) + '0').slice(0, 2), 16)); return b; };

function cmapOf(text) { // a ToUnicode map: code (hex) -> text
  const map = new Map();
  const uni = (h) => { const b = hexBytes(h); let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; };
  for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) map.set(m[1].toLowerCase(), uni(m[2]));
  for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<([0-9a-f]+)>|\[([^\]]*)\])/gi)) {
      const lo = parseInt(m[1], 16), hi = Math.min(parseInt(m[2], 16), lo + 65535), w = m[1].length;
      const list = m[5] ? [...m[5].matchAll(/<([0-9a-f]+)>/gi)].map((x) => uni(x[1])) : null;
      const start = m[4] ? parseInt(m[4], 16) : 0;
      for (let c = lo; c <= hi; c++) map.set(c.toString(16).padStart(w, '0'), list ? list[c - lo] ?? '' : String.fromCharCode(start + c - lo));
    }
  }
  return map;
}

function ascii85(buf) { // the ASCII85 filter (some PDF makers wrap their pages in it)
  const s = buf.toString('latin1').replace(/\s+/g, '').replace(/^<~/, '');
  const end = s.indexOf('~>');
  const body = end >= 0 ? s.slice(0, end) : s;
  const out = [];
  let group = [];
  for (const ch of body) {
    if (ch === 'z' && !group.length) { out.push(0, 0, 0, 0); continue; }
    const c = ch.charCodeAt(0) - 33;
    if (c < 0 || c > 84) return null;
    group.push(c);
    if (group.length === 5) { let n = 0; for (const g of group) n = n * 85 + g; out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); group = []; }
  }
  if (group.length) { const k = group.length; while (group.length < 5) group.push(84); let n = 0; for (const g of group) n = n * 85 + g; const b = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; out.push(...b.slice(0, k - 1)); }
  return Buffer.from(out);
}

function pdfStreams(buf) {
  const s = buf.toString('latin1');
  const out = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s)) && out.length < 20000) {
    if (s.slice(m.index - 3, m.index) === 'end') continue;
    const head = s.slice(Math.max(0, m.index - 600), m.index);
    const objAt = head.search(/\d+\s+\d+\s+obj\b(?![\s\S]*\d+\s+\d+\s+obj\b)/);
    const num = objAt >= 0 ? Number(head.slice(objAt).match(/^(\d+)/)[1]) : -1;
    const dict = head.slice(head.lastIndexOf('<<'));
    const start = m.index + m[0].length;
    const len = Number(dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)?.[1]);
    let end = Number.isFinite(len) && s.slice(start + len, start + len + 12).includes('endstream') ? start + len : s.indexOf('endstream', start);
    if (end < 0) break;
    re.lastIndex = end;
    if (/\/Subtype\s*\/Image|\/FontFile|\/Length[123]\b|\/Type\s*\/XRef|\/Type\s*\/Metadata/.test(dict)) continue;
    const objStm = /\/Type\s*\/ObjStm/.test(dict);
    let data = buf.subarray(start, end);
    if (/\/ASCII85Decode|\/A85\b/.test(dict)) { data = ascii85(data); if (!data) continue; }
    if (/\/FlateDecode/.test(dict)) { try { data = zlib.inflateSync(data, { maxOutputLength: 64 * 1024 * 1024 }); } catch { try { data = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: 64 * 1024 * 1024 }); } catch { continue; } } }
    else if (/\/Filter/.test(dict) && !/^\s*\/Filter\s*\[?\s*\/(?:ASCII85Decode|A85)\s*\]?\s*$/.test((dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/) || [''])[0])) continue; // other filters (pictures, LZW) carry no words we can read
    out.push({ num, text: data.toString('latin1'), objStm, first: Number(dict.match(/\/First\s+(\d+)/)?.[1]) || 0 });
  }
  return out;
}

// Which font map each font name (/F1, /T1_0 ...) uses: name -> font object -> its ToUnicode stream.
function fontMaps(buf, streams) {
  const s = buf.toString('latin1');
  const byNum = new Map(streams.map((x) => [x.num, x.text]));
  const objects = new Map();
  for (const m of s.matchAll(/(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g)) objects.set(Number(m[1]), m[2].split(/\bstream\r?\n/)[0]);
  // Objects packed inside object streams (newer PDFs): a list of "number offset" pairs, then the objects.
  for (const st of streams) {
    if (!st.objStm) continue;
    const pairs = st.text.slice(0, st.first).trim().split(/\s+/).map(Number);
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      const from = st.first + pairs[i + 1], to = i + 3 < pairs.length ? st.first + pairs[i + 3] : st.text.length;
      if (!objects.has(pairs[i])) objects.set(pairs[i], st.text.slice(from, to));
    }
  }
  const fontMap = new Map(); // font object -> cmap
  for (const [num, body] of objects) {
    if (!/\/Type\s*\/Font\b/.test(body)) continue;
    const tu = body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/)?.[1];
    if (tu && byNum.has(Number(tu))) fontMap.set(num, cmapOf(byNum.get(Number(tu))));
  }
  const names = new Map(); // /F1 -> cmap
  const addDict = (d) => { for (const m of d.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) { const c = fontMap.get(Number(m[2])); if (c && !names.has(m[1])) names.set(m[1], c); } };
  for (const body of objects.values()) {
    for (const m of body.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) addDict(m[1]);
    for (const m of body.matchAll(/\/Font\s+(\d+)\s+\d+\s+R/g)) addDict(objects.get(Number(m[1])) || '');
  }
  return { names, any: fontMap.size };
}

export function pdfText(buf) {
  if (!buf.subarray(0, 1024).toString('latin1').includes('%PDF')) throw new DocError('That doesn\'t look like a PDF inside.');
  if (/\/Encrypt\s/.test(buf.toString('latin1', Math.max(0, buf.length - 4096)))) throw new DocError(`That PDF is locked (encrypted), so I can't read its words. ${OFFICE_HINT}`);
  const streams = pdfStreams(buf);
  const { names } = fontMaps(buf, streams);
  const merged = new Map(); // for a font we couldn't place: every map in the file, first one wins
  for (const c of names.values()) for (const [k, v] of c) if (!merged.has(k)) merged.set(k, v);
  const widthsOf = new Map();
  const decode = (bytes, hex, cmap) => {
    if (cmap && cmap.size) {
      if (!widthsOf.has(cmap)) widthsOf.set(cmap, [...new Set([...cmap.keys()].map((k) => k.length))].sort((a, b) => b - a));
      const widths = widthsOf.get(cmap);
      const h = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
      let out = '', i = 0, hit = 0;
      while (i < h.length) {
        let done = false;
        for (const w of widths) { const v = cmap.get(h.slice(i, i + w)); if (v != null) { out += v; i += w; hit++; done = true; break; } }
        if (!done) { if (!hex) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16)); i += 2; }
      }
      if (hit || !hex) return out;
    }
    return Buffer.from(bytes).toString('latin1');
  };
  const pages = [];
  for (const { text: st } of streams) {
    if (!/\bBT\b/.test(st) || !/T[Jj*'"]/.test(st)) continue;
    let out = '';
    const tok = /\((?:[^()\\]|\\[\s\S]|\((?:[^()\\]|\\[\s\S])*\))*\)|<[0-9a-fA-F\s]*>|\[|\]|-?\d*\.?\d+|\/[^\s/<>[\]()]+|[A-Za-z*'"]+/g;
    let m, arr = null, nums = [], pend = '', font = merged, lastName = '';
    while ((m = tok.exec(st))) {
      const t = m[0];
      if (t[0] === '(') { const [b] = pdfString(t, 0); const str = decode(b, false, font); if (arr) arr.push(str); else pend = str; nums = []; continue; }
      if (t[0] === '<' && t[1] !== '<') { const str = decode(hexBytes(t.slice(1, -1)), true, font); if (arr) arr.push(str); else pend = str; nums = []; continue; }
      if (t === '[') { arr = []; continue; }
      if (t === ']') { pend = arr ? arr.join('') : ''; arr = null; continue; }
      if (t[0] === '/') { lastName = t.slice(1); continue; }
      if (/^-?\d*\.?\d+$/.test(t)) { if (arr) { if (Number(t) < -180) arr.push(' '); } else nums.push(Number(t)); continue; }
      if (t === 'Tf') { font = names.get(lastName) || merged; nums = []; continue; }
      if (t === 'Tj' || t === 'TJ') { out += pend; pend = ''; }
      else if (t === '\'' || t === '"') { out += '\n' + pend; pend = ''; }
      else if (t === 'T*') out += '\n';
      else if (t === 'Td' || t === 'TD') { const ty = nums[nums.length - 1] || 0; const tx = nums[nums.length - 2] || 0; out += ty ? (out.endsWith('\n') ? '' : '\n') : tx > 0 && !/\s$/.test(out) ? ' ' : ''; }
      else if ((t === 'Tm' || t === 'ET') && out && !out.endsWith('\n')) out += '\n';
      nums = [];
    }
    if (out.trim()) pages.push(tidy(out));
  }
  const text = tidy(pages.join('\n\n'));
  const letters = (text.match(/[\p{L}\p{N}\s.,;:!?'"()-]/gu) || []).length;
  if (text.replace(/\s/g, '').length < 20) throw new DocError(`I found no words in that PDF. It's probably a scan (pictures of pages): attach a page as a picture and an eyes brain can read it.`);
  if (letters / text.length < 0.7) throw new DocError(`That PDF keeps its words in a way I can't untangle without help. ${OFFICE_HINT}`);
  return text;
}

// ---------------------------------------------------------------- the one way in

// The words in one document, from its bytes. Throws DocError with plain words when it can't.
export function docTextFrom(buf, ext) {
  ext = String(ext || '').toLowerCase().replace(/^\./, '');
  if (OLD_EXT.includes(ext)) throw new DocError(`An old .${ext} file is a closed format I can't read on my own. ${OFFICE_HINT}`);
  if (!DOC_EXT.includes(ext)) throw new DocError(`A .${ext} file isn't a document I read this way.`);
  let text;
  if (ext === 'pdf') text = pdfText(buf);
  else if (ext === 'rtf') text = rtfText(buf.toString('latin1'));
  else {
    const z = zipEntries(buf, (n) => /\.(xml|x?html?|opf|rels)$/i.test(n) || n === 'mimetype');
    if (['docx', 'docm', 'dotx'].includes(ext)) text = docx(z);
    else if (['xlsx', 'xlsm'].includes(ext)) text = xlsx(z);
    else if (['pptx', 'ppsx'].includes(ext)) text = pptx(z);
    else if (ext === 'epub') text = epub(z);
    else text = odf(z);
  }
  return text.length > MAX_OUT ? text.slice(0, MAX_OUT) : text;
}

export function docText(file, { stat = fs.statSync, read = fs.readFileSync } = {}) {
  const size = stat(file).size;
  if (size > MAX_DOC_BYTES) throw new DocError(`That file is ${Math.round(size / 1048576)} MB. I read documents up to ${MAX_DOC_BYTES / 1048576} MB.`);
  return docTextFrom(read(file), extOf(file));
}
