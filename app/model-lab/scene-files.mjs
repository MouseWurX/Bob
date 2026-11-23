// Real files for a job's scene (scenes.mjs, 16 Nov 2026): pictures with their hidden details, Word, Excel and PDF files,
// and zips, built byte by byte so Bob's own readers (doc-text.js, security-files.js) and LibreOffice open them as they
// would a file from anyone's computer. No libraries, nothing downloaded. Text files need nothing from here.
import zlib from 'node:zlib';

// ---- CRC-32 (zip and PNG both use it; zlib.crc32 is missing on older Node) ----
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// ---- zip, stored (no packing): enough for Office files and for a zip a job asks Bob to open ----
export function zipStore(entries) {
  const local = [], central = []; let off = 0;
  for (const { name, data } of entries) {
    const n = Buffer.from(name, 'utf8'), d = Buffer.isBuffer(data) ? data : Buffer.from(String(data ?? ''), 'utf8'), crc = crc32(d);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    local.push(h, n, d); central.push(c, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...local, cd, e]);
}

const xml = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pick = (meta, ...keys) => { for (const k of keys) for (const [mk, v] of Object.entries(meta || {})) if (mk.toLowerCase() === k.toLowerCase() && v != null && String(v).trim()) return String(v).trim(); return ''; };
const lines = (t) => String(t ?? '').replace(/\r\n?/g, '\n').split('\n');

// ---- Office: the hidden details Bob's strip_metadata and inspect_file look for (author, last saved by, company...) ----
function officeProps(meta) {
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + [['dc:title', pick(meta, 'Title')], ['dc:subject', pick(meta, 'Subject')], ['dc:creator', pick(meta, 'Author', 'Creator', 'Artist')], ['cp:keywords', pick(meta, 'Keywords')],
      ['dc:description', pick(meta, 'Comments', 'Comment', 'Description')], ['cp:lastModifiedBy', pick(meta, 'LastModifiedBy', 'Last saved by', 'LastSavedBy')], ['cp:category', pick(meta, 'Category')]]
      .filter(([, v]) => v).map(([k, v]) => `<${k}>${xml(v)}</${k}>`).join('') + '</cp:coreProperties>';
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">`
    + [['Company', pick(meta, 'Company')], ['Manager', pick(meta, 'Manager')]].filter(([, v]) => v).map(([k, v]) => `<${k}>${xml(v)}</${k}>`).join('') + '</Properties>';
  return { core, app };
}
const TYPES = (main, mainType) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${main}" ContentType="${mainType}"/>${main.startsWith('xl/') ? '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
const RELS = (main) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

export function docx(text, meta = {}) {
  const { core, app } = officeProps(meta);
  const body = lines(text).map((l) => { const h = l.match(/^(#{1,3})\s+(.*)$/); return h ? `<w:p><w:pPr><w:pStyle w:val="Heading${h[1].length}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xml(h[2])}</w:t></w:r></w:p>` : `<w:p><w:r><w:t xml:space="preserve">${xml(l)}</w:t></w:r></w:p>`; }).join('');
  return zipStore([
    { name: '[Content_Types].xml', data: TYPES('word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') },
    { name: '_rels/.rels', data: RELS('word/document.xml') },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>` },
    { name: 'docProps/core.xml', data: core }, { name: 'docProps/app.xml', data: app }
  ]);
}

// CSV lines (commas, "quoted, fields") -> rows of cells
export function csvRows(text) {
  return lines(text).filter((l) => l.trim()).map((l) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',' || ch === '\t') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out.map((c) => c.trim());
  });
}
const colName = (n) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
export function xlsx(text, meta = {}) {
  const { core, app } = officeProps(meta);
  const rows = csvRows(text).slice(0, 2000).map((cells, r) => `<row r="${r + 1}">${cells.map((v, c) => {
    const ref = `${colName(c)}${r + 1}`;
    return /^-?\d+(\.\d+)?$/.test(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const sheet = xml(pick(meta, 'Sheet') || 'Sheet1').slice(0, 31);
  return zipStore([
    { name: '[Content_Types].xml', data: TYPES('xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml') },
    { name: '_rels/.rels', data: RELS('xl/workbook.xml') },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheet}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>` },
    { name: 'docProps/core.xml', data: core }, { name: 'docProps/app.xml', data: app }
  ]);
}

// ---- PDF: plain text pages (Helvetica) and its Info details (Author, Creator...) ----
export function pdf(text, meta = {}) {
  const esc = (s) => String(s).replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/([()\\])/g, '\\$1');
  const all = lines(text).flatMap((l) => (l.length > 95 ? l.match(/.{1,95}(\s|$)|.{1,95}/g) : [l]));
  const pages = []; for (let i = 0; i < Math.max(1, all.length); i += 48) pages.push(all.slice(i, i + 48));
  const objs = []; // 1 catalog, 2 pages, 3 font, 4 info, then page + content pairs
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = `<< ${[['Title', pick(meta, 'Title')], ['Author', pick(meta, 'Author', 'Creator', 'Artist')], ['Subject', pick(meta, 'Subject')], ['Keywords', pick(meta, 'Keywords')], ['Creator', pick(meta, 'Software', 'Made with', 'CreatorTool')], ['Producer', pick(meta, 'Producer')]].filter(([, v]) => v).map(([k, v]) => `/${k} (${esc(v)})`).join(' ')} >>`;
  pages.forEach((pl, i) => {
    const stream = `BT /F1 11 Tf 14 TL 56 780 Td ${pl.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
    objs[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objs[6 + i * 2] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const at = [];
  for (let n = 1; n < objs.length; n++) { at[n] = Buffer.byteLength(out, 'latin1'); out += `${n} 0 obj\n${objs[n]}\nendobj\n`; }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${at.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ---- pictures: a small plain image carrying the details the job is about (camera, author, GPS, date taken) ----
// EXIF as a little-endian TIFF block; the same block goes in a JPEG's APP1 and a PNG's eXIf chunk.
export function exifBlock(meta = {}) {
  const asc = (tag, s) => ({ tag, type: 2, count: Buffer.byteLength(s + '\0', 'latin1'), data: Buffer.from(s + '\0', 'latin1') });
  const ifd0 = [], exif = [], gps = [];
  for (const [tag, keys] of [[0x010e, ['Description', 'ImageDescription', 'Comment', 'Caption']], [0x010f, ['Make', 'Camera maker']], [0x0110, ['Model', 'Camera', 'Phone']], [0x0131, ['Software', 'Made with']], [0x0132, ['DateTime', 'Modified']], [0x013b, ['Artist', 'Author', 'Owner']], [0x8298, ['Copyright']]]) { const v = pick(meta, ...keys); if (v) ifd0.push(asc(tag, v.slice(0, 200))); }
  const taken = pick(meta, 'DateTaken', 'DateTimeOriginal', 'Date taken', 'Taken');
  if (taken) exif.push(asc(0x9003, taken.replace(/^(\d{4})-(\d{2})-(\d{2})[T ]?/, '$1:$2:$3 ').trim().slice(0, 19)));
  const g = pick(meta, 'GPS', 'Location', 'GPSPosition').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (g) {
    const rat = (deg) => { const a = Math.abs(deg), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60 * 100); const b = Buffer.alloc(24); [d, 1, m, 1, s, 100].forEach((v, i) => b.writeUInt32LE(v, i * 4)); return b; };
    const lat = Number(g[1]), lon = Number(g[2]);
    gps.push(asc(1, lat < 0 ? 'S' : 'N'), { tag: 2, type: 5, count: 3, data: rat(lat) }, asc(3, lon < 0 ? 'W' : 'E'), { tag: 4, type: 5, count: 3, data: rat(lon) });
  }
  if (!ifd0.length && !exif.length && !gps.length) return null;
  const ptr = (tag) => ({ tag, type: 4, count: 1, data: Buffer.alloc(4) });
  if (exif.length) ifd0.push(ptr(0x8769));
  if (gps.length) ifd0.push(ptr(0x8825));
  const pad = (n) => n + (n & 1);
  const size = (es) => 2 + 12 * es.length + 4 + es.reduce((s, e) => s + (e.data.length > 4 ? pad(e.data.length) : 0), 0);
  const o0 = 8, oE = o0 + size(ifd0), oG = oE + (exif.length ? size(exif) : 0);
  for (const e of ifd0) { if (e.tag === 0x8769) e.data.writeUInt32LE(oE); if (e.tag === 0x8825) e.data.writeUInt32LE(oG); }
  const ser = (es, off) => {
    es.sort((a, b) => a.tag - b.tag);
    const b = Buffer.alloc(size(es)); b.writeUInt16LE(es.length, 0); let cur = off + 2 + 12 * es.length + 4;
    es.forEach((e, i) => {
      const p = 2 + i * 12; b.writeUInt16LE(e.tag, p); b.writeUInt16LE(e.type, p + 2); b.writeUInt32LE(e.count, p + 4);
      if (e.data.length <= 4) e.data.copy(b, p + 8); else { b.writeUInt32LE(cur, p + 8); e.data.copy(b, cur - off); cur += pad(e.data.length); }
    });
    return b;
  };
  const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]);
  return Buffer.concat([head, ser(ifd0, o0), ...(exif.length ? [ser(exif, oE)] : []), ...(gps.length ? [ser(gps, oG)] : [])]);
}

// a 16 x 16 grey JPEG (made once with Pillow, no details inside); the EXIF block goes in right after its start marker
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDvaKKKok//2Q==', 'base64');
export function jpeg(meta = {}) {
  const ex = exifBlock(meta);
  if (!ex) return Buffer.from(JPEG);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), ex]);
  const seg = Buffer.alloc(4); seg[0] = 0xff; seg[1] = 0xe1; seg.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([JPEG.subarray(0, 2), seg, body, JPEG.subarray(2)]);
}
export function png(meta = {}) {
  const chunk = (type, data) => { const t = Buffer.from(type, 'latin1'), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 16 }, () => Buffer.from([0, ...Array.from({ length: 16 }, () => [200, 205, 210]).flat()])));
  const texts = Object.entries(meta || {}).filter(([k, v]) => /^[\x20-\x7e]{1,79}$/.test(k) && !/^gps|location$/i.test(k) && v != null && String(v).trim())
    .map(([k, v]) => chunk('tEXt', Buffer.concat([Buffer.from(k, 'latin1'), Buffer.from([0]), Buffer.from(String(v).slice(0, 2000), 'latin1')])));
  const ex = exifBlock(meta);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...texts, ...(ex ? [chunk('eXIf', ex)] : []), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// The bytes for one scene file, by its extension. Plain text for anything else; null = a kind this kit can't make
// (sound, video, programs), so the scene says so instead of planting a fake.
export const CANT_MAKE = /\.(mp3|wav|flac|ogg|m4a|aac|mp4|mkv|mov|avi|webm|exe|msi|dll|iso|gguf|safetensors|bin|psd|blend|uasset|fbx|glb|gltf|7z|rar|gz|tgz)$/i;
export function sceneBytes(file) {
  const p = String(file.path || ''), meta = file.meta && typeof file.meta === 'object' ? file.meta : {};
  if (CANT_MAKE.test(p)) return null;
  if (/\.(jpe?g)$/i.test(p)) return jpeg(meta);
  if (/\.png$/i.test(p)) return png(meta);
  if (/\.docx$/i.test(p)) return docx(file.content, meta);
  if (/\.xlsx$/i.test(p)) return xlsx(file.content, meta);
  if (/\.pdf$/i.test(p)) return pdf(file.content, meta);
  if (/\.zip$/i.test(p)) {
    const inside = (Array.isArray(file.inside) ? file.inside : []).filter((f) => f && typeof f.path === 'string' && !/(^|[\\/])\.\.([\\/]|$)/.test(f.path)).slice(0, 30);
    return zipStore(inside.map((f) => ({ name: f.path.replace(/\\/g, '/').replace(/^\/+/, ''), data: sceneBytes({ ...f, path: f.path }) ?? '' })));
  }
  if (/\.(gif|bmp|webp|tiff?|ico|heic|docm|doc|xls|ppt|pptx|odt|ods|odp|epub|rtf)$/i.test(p)) return null;
  return Buffer.from(String(file.content ?? '').replace(/\r\n?/g, '\n'), 'utf8');
}
