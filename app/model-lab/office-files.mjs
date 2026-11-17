// Richer made-up Office files for the office jobs (17 Nov 2026; MouseWurX: "expand the office set"). scene-files.mjs
// makes one-sheet workbooks and plain Word text; these jobs also need workbooks with several sheets and formulas (with
// their last-calculated values, as Excel saves them), Word files with a table, a big order sheet, and a file that is
// broken. Every file is built from a plain JSON spec (office-jobs.mjs FILES[].build), so a jobs.jsonl row carries it
// and two runs get byte-for-byte the same file. No real people, places or firms.
import { zipStore } from './scene-files.mjs';

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const col = (n) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const RELS = (main) => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}"/></Relationships>`;

// a cell: a number, a string, or { f: 'SUM(B2:B4)', v: 12 } (a formula with the value it last worked out to)
function cell(v, ref) {
  if (v && typeof v === 'object' && v.f) return `<c r="${ref}"${typeof v.v === 'number' ? '' : ' t="str"'}><f>${xml(v.f)}</f><v>${xml(v.v)}</v></c>`;
  if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}
// sheets: [{ name, rows: [[cell, ...], ...] }]
export function workbook(sheets) {
  return zipStore([
    { name: '[Content_Types].xml', data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: RELS('xl/workbook.xml') },
    { name: 'xl/workbook.xml', data: `${HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(String(s.name).slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: `${HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cell(v, `${col(ci)}${ri + 1}`)).join('')}</row>`).join('')}</sheetData></worksheet>` }))
  ]);
}

// a Word file: paragraphs ("# " for a heading), then a table (first row the header), then more paragraphs
export function wordWithTable({ before = '', table = [], after = '' }) {
  const para = (l) => { const h = l.match(/^(#{1,3})\s+(.*)$/); return h ? `<w:p><w:pPr><w:pStyle w:val="Heading${h[1].length}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xml(h[2])}</w:t></w:r></w:p>` : `<w:p><w:r><w:t xml:space="preserve">${xml(l)}</w:t></w:r></w:p>`; };
  const paras = (t) => String(t).split('\n').filter((l) => l.trim()).map(para).join('');
  const cols = Math.max(1, ...table.map((r) => r.length));
  const tbl = table.length ? `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2400"/>'.repeat(cols)}</w:tblGrid>${table.map((r) => `<w:tr>${r.map((c) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${xml(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>` : '';
  return zipStore([
    { name: '[Content_Types].xml', data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: '_rels/.rels', data: RELS('word/document.xml') },
    { name: 'word/document.xml', data: `${HEAD}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras(before)}${tbl}${paras(after)}<w:sectPr/></w:body></w:document>` }
  ]);
}

// the big order sheet: n rows, made the same way every time, and the right answers worked out from the same rows
export const CITIES = ['Leeds', 'Bristol', 'Glasgow', 'Cardiff', 'Belfast', 'York', 'Bath'];
export function orderRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push([`A${String(10001 + i)}`, CITIES[(i * 5 + Math.floor(i / 7)) % CITIES.length], Math.round((15 + ((i * 37) % 900) + ((i * 13) % 100) / 100) * 100) / 100]);
  return rows;
}
export function orderAnswer(n, city) {
  const hit = orderRows(n).filter((r) => r[1] === city);
  return { count: hit.length, total: Math.round(hit.reduce((a, r) => a + r[2], 0) * 100) / 100 };
}

// build: { type: 'book', sheets } | { type: 'table', before, table, after } | { type: 'orders', rows } | { type: 'broken' }
export function buildBytes(build) {
  if (build.type === 'book') return workbook(build.sheets);
  if (build.type === 'table') return wordWithTable(build);
  if (build.type === 'orders') return workbook([{ name: 'Orders', rows: [['Order', 'City', 'Amount'], ...orderRows(build.rows)] }]);
  // a Word file cut off halfway through being copied: the start of a real one, then nothing
  if (build.type === 'broken') return wordWithTable({ before: '# Minutes\nThe meeting opened at seven.' }).subarray(0, 300);
  throw new Error(`no such build ${build.type}`);
}
