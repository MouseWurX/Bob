// "Show documents in the side panel" (Nov 2026): Word, Excel, PowerPoint, OpenDocument, e-book, Rich Text and PDF
// files open in the side panel as their words, sheets or slides (src/files.js docPeek, public/doc-view.js), and a
// PDF as its pages where the window can draw them (/api/file/pdf). Off unless turned on. Made-up files only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeZip } from '../src/zip.js';
import { docPeek, docViewOn, viewableDoc, pdfFile } from '../src/files.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { docParts, docHtml, viewOf, colName, isDocName } from '../public/doc-view.js';
import { WANTS } from '../public/wants.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-docview-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), docs = path.join(tmp, 'Documents'), outside = path.join(tmp, 'Elsewhere');
for (const d of [dataDir, docs, outside]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir, innDir, dataDir, painterDir: path.join(innDir, 'painter'), settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir, docs], readOnlyRoots: [], recycleBin: false, userName: 'Sam' };

const zipOf = (file, entries) => { writeZip(file, Object.entries(entries).map(([name, s]) => ({ name, data: Buffer.from(s, 'utf8'), size: Buffer.byteLength(s), mtime: new Date(2026, 0, 1) }))); return file; };
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const docx = zipOf(path.join(docs, 'Lease.docx'), {
  'word/document.xml': `<w:document ${W}><w:body><w:p><w:r><w:t>Pets &amp; &lt;b&gt;animals&lt;/b&gt;</w:t></w:r></w:p>`
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Rent</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>900</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
});
const xlsx = zipOf(path.join(docs, 'Budget.xlsx'), {
  'xl/workbook.xml': '<workbook><sheets><sheet name="Money" sheetId="1"/><sheet name="Notes" sheetId="2"/></sheets></workbook>',
  'xl/sharedStrings.xml': '<sst><si><t>Wings</t></si><si><t>&lt;img src=x onerror=alert(1)&gt;</t></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42.5</v></c></row><row r="2"><c r="C2" t="s"><v>1</v></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>inline words</t></is></c></row></sheetData></worksheet>'
});
const pptx = zipOf(path.join(docs, 'Pitch.pptx'), {
  'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Welcome</a:t></a:r></a:p><a:p><a:r><a:t>to the talk</a:t></a:r></a:p></p:sld>',
  'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Two</a:t></a:r></a:p></p:sld>',
  'ppt/notesSlides/notesSlide2.xml': '<p:notes><a:p><a:r><a:t>Say it slowly</a:t></a:r></a:p></p:notes>'
});
const odp = zipOf(path.join(docs, 'Talk.odp'), {
  mimetype: 'application/vnd.oasis.opendocument.presentation',
  'content.xml': '<office:document-content><draw:page draw:name="p1"><text:p>Hello there</text:p><presentation:notes><draw:page-thumbnail/><text:p>Wave</text:p></presentation:notes></draw:page></office:document-content>'
});
const pdf = path.join(docs, 'Letter.pdf');
fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj << /Length 44 >> stream\nBT /F1 12 Tf 72 712 Td (Dear Sam) Tj ET\nendstream endobj\ntrailer << >>\n%%EOF\n');
const fakePdf = path.join(docs, 'Sneaky.pdf');
fs.writeFileSync(fakePdf, '<html><script>alert(1)</script></html>');
const oldDoc = path.join(docs, 'Old.doc');
fs.writeFileSync(oldDoc, 'whatever');
const away = path.join(outside, 'Away.docx');
fs.copyFileSync(docx, away);

// ---------- the switch ----------
check('off unless turned on', !docViewOn({}) && !docViewOn({ docView: 'yes' }) && docViewOn({ docView: true }));
check('only true turns it on when saved', mergeSettings({}, { docView: 'true' }).docView === false && mergeSettings({}, { docView: true }).docView === true);
check('the setting is saved with the others', SETTING_KEYS.includes('docView'));
{
  const r = docPeek(cfg, docx);
  check('switched off, the panel is told so and reads nothing', r.ok && r.off === true && r.text === undefined);
  check('switched off, a PDF is never served as pages', pdfFile(cfg, pdf) === null);
}

cfg.docView = true;
// ---------- what the server sends ----------
{
  const w = docPeek(cfg, docx);
  check('a Word file comes back as its words', w.ok && !w.off && /Pets & <b>animals<\/b>/.test(w.text) && /Rent\t900/.test(w.text) && w.ext === '.docx');
  const x = docPeek(cfg, xlsx);
  check('a spreadsheet comes back with its sheets', x.ok && /Sheet: Money/.test(x.text) && /Sheet: Notes/.test(x.text));
  const p = docPeek(cfg, pptx);
  check('a presentation comes back with its slides and notes', p.ok && /Slide 1\nWelcome/.test(p.text) && /Notes: Say it slowly/.test(p.text));
  const o = docPeek(cfg, oldDoc);
  check('an old .doc says why in plain words', o.ok && /old \.doc/.test(o.error || '') && /Office documents Hand/.test(o.error));
  check('a file outside the folders Bob may read is refused', !docPeek(cfg, away).ok);
  check('a text file is not a document here (the panel shows it as text already)', !docPeek(cfg, path.join(docs, 'x.txt')).ok && !viewableDoc('x.txt') && viewableDoc('A.PDF') && viewableDoc('b.xlsx'));
  let n = 0;
  const big = docPeek(cfg, docx, { read: () => { n++; return 'x'.repeat(2_000_000); } });
  check('a document at the reader\'s limit says it was cut', big.cut === true && n === 1);
  const broken = docPeek(cfg, docx, { read: () => { throw new Error('ENOENT secret path C:\\x'); } });
  check('a surprise error is plain words, not the computer\'s', /couldn't read that file/.test(broken.error) && !/ENOENT/.test(broken.error));
  check('a real PDF can be shown as pages', pdfFile(cfg, pdf)?.path === pdf);
  check('a page dressed up as a .pdf is never served', pdfFile(cfg, fakePdf) === null);
  check('a PDF outside the allowed folders is never served', pdfFile(cfg, path.join(outside, 'x.pdf')) === null && pdfFile(cfg, docx) === null);
  check('the PDF head check can be faked (never reads the real disk in a test)', pdfFile(cfg, fakePdf, { readHead: () => Buffer.from('%PDF-') })?.path === fakePdf);
}

// ---------- what the panel draws ----------
{
  check('which way each kind is drawn', viewOf('.xlsx') === 'sheets' && viewOf('ods') === 'sheets' && viewOf('.pptx') === 'slides' && viewOf('.odp') === 'slides' && viewOf('.docx') === 'words' && viewOf('.pdf') === 'words' && viewOf('.epub') === 'words');
  check('column letters like a spreadsheet', colName(1) === 'A' && colName(26) === 'Z' && colName(27) === 'AA' && colName(52) === 'AZ' && colName(703) === 'AAA');
  check('the panel knows the document names', isDocName('a.docx') && isDocName('b.PPTX') && isDocName('c.pdf') && isDocName('d.doc') && !isDocName('e.txt') && !isDocName('f.png'));

  const w = docParts(docPeek(cfg, docx).text, '.docx');
  check('Word: paragraphs and a table', w.blocks.some((b) => b.type === 'p' && b.lines.some((l) => /Pets/.test(l))) && w.blocks.some((b) => b.type === 'table' && b.rows[0][0] === 'Rent' && b.rows[0][1] === '900'));
  const wh = docHtml({ ...docPeek(cfg, docx), path: docx });
  check('Word: the words are escaped, never HTML', /Pets &amp; &lt;b&gt;animals/.test(wh) && !/<b>animals/.test(wh) && /<table>/.test(wh));

  const x = docParts(docPeek(cfg, xlsx).text, '.xlsx');
  check('Excel: each sheet with its rows and empty cells kept', x.sheets.length === 2 && x.sheets[0].name === 'Money' && x.sheets[0].rows[0][0] === 'Wings' && x.sheets[0].rows[1][2] === '<img src=x onerror=alert(1)>' && x.sheets[1].rows[0][0] === 'inline words');
  const xh = docHtml(docPeek(cfg, xlsx));
  check('Excel: a button per sheet, the first one showing', /data-sheet="0" aria-pressed="true">Money/.test(xh) && /data-sheet="1" aria-pressed="false">Notes/.test(xh) && /data-sheet-body="1" hidden/.test(xh));
  check('Excel: column letters and row numbers, labelled for a screen reader', /<th scope="col">A<\/th><th scope="col">B<\/th><th scope="col">C<\/th>/.test(xh) && /<th scope="row">2<\/th>/.test(xh) && /aria-label="Money"/.test(xh));
  check('Excel: a cell can\'t sneak in HTML', !/<img src=x/.test(xh) && /&lt;img src=x/.test(xh));
  const many = docParts(`Sheet: Big\n${Array.from({ length: 700 }, (_, i) => `r${i}`).join('\n')}`, '.xlsx');
  check('Excel: a long sheet is cut at 500 rows and says how many more', many.sheets[0].rows.length === 500 && many.sheets[0].more === 200 && /And 200 more rows/.test(docHtml({ text: `Sheet: Big\n${Array.from({ length: 700 }, (_, i) => `r${i}`).join('\n')}`, ext: '.xlsx' })));
  const odsEmpty = docParts('Sheet: Blank\n(empty)', '.xlsx');
  check('Excel: an empty sheet is empty, not a row saying (empty)', odsEmpty.sheets[0].rows.length === 0);

  const p = docParts(docPeek(cfg, pptx).text, '.pptx');
  check('PowerPoint: one card per slide, title first, notes kept', p.slides.length === 2 && p.slides[0].lines[0] === 'Welcome' && p.slides[0].lines[1] === 'to the talk' && p.slides[1].notes === 'Say it slowly');
  const ph = docHtml(docPeek(cfg, pptx));
  check('PowerPoint: slides labelled, notes folded under a Speaker notes button', /<section class="vslide" aria-label="Slide 1">/.test(ph) && /<h3>Welcome<\/h3>/.test(ph) && /<summary>Speaker notes<\/summary><p>Say it slowly/.test(ph));
  const o = docParts(docPeek(cfg, odp).text, '.odp');
  check('OpenDocument slides too', o.slides.length === 1 && o.slides[0].lines[0] === 'Hello there' && o.slides[0].notes === 'Wave');

  const off = docHtml({ ok: true, off: true, ext: '.docx' });
  check('switched off: says where the switch is and offers to turn it on', /Show documents in the side panel/.test(off) && /Settings, How Bob works/.test(off) && /data-docview-on/.test(off));
  const err = docHtml({ ok: true, ext: '.doc', error: 'An old .doc file <b>' });
  check('a reason it can\'t show is escaped', /An old \.doc file &lt;b&gt;/.test(err));
  const pdfJ = { ok: true, ext: '.pdf', name: 'Letter.pdf', text: 'Dear Sam', path: pdf };
  const withPages = docHtml(pdfJ, { pages: true });
  check('PDF where the window can draw it: its pages, plus a Words button', /<iframe class="vpage vpdf" src="\/api\/file\/pdf\?path=/.test(withPages) && /data-docas="pages" aria-pressed="true"/.test(withPages) && /data-docas="words"/.test(withPages) && /class="vdoc-text" hidden/.test(withPages));
  const noPages = docHtml(pdfJ, { pages: false });
  check('PDF on Android or a phone: its words, no frame', !/iframe/.test(noPages) && /Dear Sam/.test(noPages));
  const scan = docHtml({ ok: true, ext: '.pdf', name: 'Scan.pdf', error: 'No words in it.', path: pdf }, { pages: true });
  check('a PDF with no words still shows its pages', /iframe/.test(scan) && /No words in it/.test(scan));
  check('a cut document says so', /first part of it/.test(docHtml({ ok: true, ext: '.docx', text: 'a', cut: true })));
}

// ---------- wiring ----------
{
  const server = read('src/server.js');
  check('the server has the two routes, PDFs sent as PDFs only', /p === '\/api\/file\/doc'/.test(server) && /p === '\/api\/file\/pdf'/.test(server) && /x-content-type-options': 'nosniff'/.test(server));
  check('over the home network, only files in the inn', /api\/file\/pdf[\s\S]{0,400}!isLocal && !d\.path\.startsWith\(path\.resolve\(cfg\.innDir\)/.test(server));
  check('the settings route saves and reports the switch', /typeof b\.docView === 'boolean'/.test(server) && /docView: cfg\.docView === true/.test(server));
  const viewer = read('public/viewer.js');
  check('the side panel hands documents to doc-view.js', /import \{ isDocName, drawDoc \} from '\.\/doc-view\.js'/.test(viewer) && /isDocName\(t\.name\)/.test(viewer));
  const cellar = publicText('cellar.js');
  check('Settings, How Bob works has the switch, off by default', /sswitch\('docView', settings\.docView === true, 'Show documents in the side panel'/.test(cellar) && /dataset\.set === 'docView'/.test(cellar));
  check('the Welcome list offers it', WANTS.some((w) => w.key === 'docView' && w.setting === 'Show documents in the side panel'));
  const main = read('electron/main.cjs');
  check('Bob\'s window can draw PDF pages', /nodeIntegration: false, plugins: true \}/.test(main));
  const ids = new Set(HELP.map((e) => e.id));
  check('Help, an FAQ and a glossary entry', ids.has('doc-view') && ids.has('faq-doc-view') && /<dt>Side panel<\/dt>/.test(HELP.find((e) => e.id === 'glossary').html));
  const h = HELP.find((e) => e.id === 'doc-view').html;
  check('Help says where it works, Android included', /Windows, Mac, Linux/.test(h) && /Android/.test(h));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
