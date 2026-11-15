// Three opt-in helpers (all off unless turned on): Read and search documents (doc-text.js, my-docs.js),
// Quick notes (notes.js) and Code sandbox (sandbox-code.js), plus their
// settings, tools, toolbox groups, Help, FAQ and glossary. Everything runs in a temporary folder with made-up files.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain.js';
import { CORE, groupsFor } from '../src/toolbox.js';
import { mergeSettings } from '../src/config.js';
import { writeZip } from '../src/zip.js';
import { docTextFrom, docText, zipEntries, rtfText, pdfText, htmlText, DOC_EXT, DocError } from '../src/doc-text.js';
import { docToolsOn, findInDocuments, findDocsTool, LIMITS } from '../src/my-docs.js';
import { notesOn, addNote, loadNotes, findNotes, removeNote, notesTool, notesFile, removedFile, stamp, smartNotesOn, tagFor, sameNote, fittingNotes, notesPrompt, NOTICED } from '../src/notes.js';
import { sandboxOn, wrapCode, runInSandbox, sandboxTool } from '../src/sandbox-code.js';
import { sandboxHolds } from '../src/selftools.js';
import { buildTools } from '../src/tools.js';
import { search } from '../src/search.js';
import { settingsNow } from '../src/self-help.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-desk-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
const docs = path.join(tmp, 'Documents'), secret = path.join(tmp, 'Secret');
for (const d of [dataDir, docs, secret, path.join(innDir, 'archive')]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir, innDir, dataDir, archiveDir: path.join(innDir, 'archive'), settingsFile: path.join(dataDir, 'settings.json'), memoryFile: path.join(innDir, 'bob-memory.md'), noticeBoard: path.join(innDir, 'notice-board.md'),
  readRoots: [innDir, docs], readOnlyRoots: [], recycleBin: false, userName: 'Sam', timeZone: 'America/Edmonton',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false };

// ---------- made-up documents ----------
const zipOf = (file, entries) => { writeZip(file, Object.entries(entries).map(([name, s]) => ({ name, data: Buffer.from(s, 'utf8'), size: Buffer.byteLength(s), mtime: new Date(2026, 0, 1) }))); return file; };
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const docx = zipOf(path.join(docs, 'Lease.docx'), {
  '[Content_Types].xml': '<Types/>',
  'word/document.xml': `<w:document ${W}><w:body><w:p><w:r><w:t>Pets &amp; animals</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Cats are </w:t></w:r><w:r><w:t>allowed.</w:t></w:r><w:r><w:delText>Dogs too.</w:delText></w:r></w:p>`
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Rent</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>900</w:t></w:r></w:p><w:p><w:r><w:t>a month</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
});
const xlsx = zipOf(path.join(docs, 'Budget.xlsx'), {
  'xl/workbook.xml': '<workbook><sheets><sheet name="Money" sheetId="1"/><sheet name="Notes &amp; more" sheetId="2"/></sheets></workbook>',
  'xl/sharedStrings.xml': '<sst><si><t>Wings</t></si><si><r><t>Dragon </t></r><r><t>fuel</t></r></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42.5</v></c></row><row r="2"><c r="C2" t="s"><v>1</v></c><c r="D2" t="b"><v>1</v></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>inline words</t></is></c></row></sheetData></worksheet>'
});
const pptx = zipOf(path.join(docs, 'Pitch.pptx'), {
  'ppt/slides/slide10.xml': '<p:sld><a:p><a:r><a:t>Ten</a:t></a:r></a:p></p:sld>',
  'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Two</a:t></a:r></a:p><a:p><a:r><a:t>second line</a:t></a:r></a:p></p:sld>',
  'ppt/notesSlides/notesSlide2.xml': '<p:notes><a:p><a:r><a:t>Say it slowly</a:t></a:r></a:p></p:notes>'
});
const ods = zipOf(path.join(docs, 'Sheet.ods'), {
  mimetype: 'application/vnd.oasis.opendocument.spreadsheet',
  'content.xml': '<office:document-content><table:table table:name="Tally"><table:table-row><table:table-cell><text:p>Apples</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"/><table:table-cell><text:p>7</text:p></table:table-cell></table:table-row></table:table></office:document-content>'
});
const odp = zipOf(path.join(docs, 'Talk.odp'), {
  mimetype: 'application/vnd.oasis.opendocument.presentation',
  'content.xml': '<office:document-content><draw:page draw:name="p1"><text:p>Hello<text:s text:c="2"/>there</text:p><presentation:notes><draw:page-thumbnail/><text:p>Wave</text:p></presentation:notes></draw:page></office:document-content>'
});
const epub = zipOf(path.join(docs, 'Book.epub'), {
  'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
  'OEBPS/content.opf': '<package><manifest><item id="c2" href="two.xhtml"/><item id="c1" href="one.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',
  'OEBPS/one.xhtml': '<html><head><title>skip me</title></head><body><h1>Chapter one</h1><p>It was a dark night.</p></body></html>',
  'OEBPS/two.xhtml': '<html><body><p>Chapter two begins.</p></body></html>'
});
fs.writeFileSync(path.join(docs, 'Letter.rtf'), '{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\*\\generator Word;}\\f0 Dear Sam,\\par Caf\\\'e9 at \\u8364? 5\\par}');

// A PDF made by hand: two fonts that use the same codes for different letters (each with its own ToUnicode map),
// one page squeezed with Flate. A second copy keeps its font objects inside an object stream, as newer PDFs do.
const cmap = (pairs) => `/CIDInit /ProcSet findresource begin\nbegincmap\n${pairs.length} beginbfchar\n${pairs.map(([c, u]) => `<${c}> <${u}>`).join('\n')}\nendbfchar\nendcmap`;
const stream = (dict, body, flate = false) => { const data = flate ? zlib.deflateSync(Buffer.from(body, 'latin1')) : Buffer.from(body, 'latin1'); return Buffer.concat([Buffer.from(`<< ${dict}${flate ? ' /Filter /FlateDecode' : ''} /Length ${data.length} >>\nstream\n`, 'latin1'), data, Buffer.from('\nendstream', 'latin1')]); };
const page = 'BT /F1 12 Tf 72 720 Td <00010002> Tj ET\nBT /F2 12 Tf 72 700 Td [<0001> -300 <0002>] TJ ET\nBT /F1 12 Tf 0 -20 Td (plain words here) Tj T* (next line) Tj ET';
function makePdf({ objStm = false } = {}) {
  const parts = [Buffer.from('%PDF-1.5\n', 'latin1')];
  const obj = (n, body) => parts.push(Buffer.from(`${n} 0 obj\n`, 'latin1'), Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'), Buffer.from('\nendobj\n', 'latin1'));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>');
  obj(4, stream('', page, true));
  const f5 = '<< /Type /Font /Subtype /Type0 /BaseFont /A /ToUnicode 7 0 R >>', f6 = '<< /Type /Font /Subtype /Type0 /BaseFont /B /ToUnicode 8 0 R >>';
  if (objStm) {
    const head = `5 0 6 ${f5.length + 1} `;
    obj(9, stream(`/Type /ObjStm /N 2 /First ${head.length}`, `${head}${f5}\n${f6}`, true));
  } else { obj(5, f5); obj(6, f6); }
  obj(7, stream('', cmap([['0001', '0048'], ['0002', '0069']]), true)); // H i
  obj(8, stream('', cmap([['0001', '004F'], ['0002', '004B']]), true)); // O K
  parts.push(Buffer.from('trailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1'));
  return Buffer.concat(parts);
}
fs.writeFileSync(path.join(docs, 'Report.pdf'), makePdf());

// ---------- the reader ----------
{
  const t = docText(docx);
  check('Word: words, headings and entities', /^Pets & animals\nCats are allowed\./.test(t), t);
  check('Word: deleted tracked text is left out', !/Dogs too/.test(t));
  check('Word: a table cell stays on one line, cells split by tabs', /Rent\t900 a month/.test(t), JSON.stringify(t));
  const x = docText(xlsx);
  check('Excel: every sheet by name, shared and inline strings, numbers, gaps kept', /Sheet: Money\nWings\t42\.5\n\t\tDragon fuel\tTRUE/.test(x) && /Sheet: Notes & more\ninline words/.test(x), JSON.stringify(x));
  const p = docText(pptx);
  check('PowerPoint: slides in number order (2 before 10), with notes', /Slide 1\nTwo\nsecond line\nNotes: Say it slowly\n\nSlide 2\nTen/.test(p), JSON.stringify(p));
  check('OpenDocument spreadsheet: sheet name, repeated empty cells', /Sheet: Tally\nApples\t\t\t7/.test(docText(ods)), JSON.stringify(docText(ods)));
  const o = docText(odp);
  check('OpenDocument slides: spaces, notes, and the notes thumbnail isn\'t a slide', /Slide 1\nHello there/.test(o) && /Notes: Wave/.test(o) && !/Slide 2/.test(o), JSON.stringify(o));
  const e = docText(epub);
  check('e-book: chapters in reading order, no head', /^Chapter one\nIt was a dark night\.\n\nChapter two begins\.$/.test(e), JSON.stringify(e));
  const r = docText(path.join(docs, 'Letter.rtf'));
  check('Rich Text: font table and hidden parts dropped, accents and Unicode kept', r === 'Dear Sam,\nCafé at € 5', JSON.stringify(r));
  const pdf = docText(path.join(docs, 'Report.pdf'));
  check('PDF: each font uses its own map', /^Hi\nO K\n/.test(pdf), JSON.stringify(pdf));
  check('PDF: plain strings, T* and Td make lines', /plain words here\nnext line/.test(pdf), JSON.stringify(pdf));
  check('PDF: fonts inside an object stream are found too', /^Hi\nO K/.test(pdfText(makePdf({ objStm: true }))));
  const scan = Buffer.from('%PDF-1.4\n1 0 obj << /Type /XObject /Subtype /Image /Length 3 >>\nstream\nabc\nendstream\nendobj\n%%EOF', 'latin1');
  let why = '';
  try { pdfText(scan); } catch (err) { why = err.message; }
  check('a PDF with no words says it is probably a scan and how to read it', /no words/.test(why) && /picture/.test(why), why);
  const dummy = Buffer.from('%PDF-1.4\n1 0 obj << /Length 44 >>\nstream\nBT /F1 12 Tf 72 712 Td (Dummy PDF file) Tj ET\nendstream\nendobj\n%%EOF', 'latin1');
  check('a PDF with only a few words is read, not called a scan (the W3C test file)', pdfText(dummy) === 'Dummy PDF file');
  // Round 3 (PC): the real file sets words in pieces moved along with Td ("Dumm" "y", the fi ligature then "le") and
  // read "Dumm y PDF fi le". The glyph widths say which moves are real spaces.
  const widths = Array.from({ length: 95 }, (_, i) => (i + 32 === 109 ? 833 : i === 0 ? 250 : 500)).join(' ');
  const body = 'BT /F1 1 Tf 18 0 0 18 56.8 721.4 Tm (Dumm) Tj 2.666 0 Td (y) Tj 0.75 0 Td (PDF) Tj 1.75 0 Td (fi) Tj 1 0 Td (le) Tj ET';
  const pieces = Buffer.from(`%PDF-1.4\n1 0 obj << /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\n2 0 obj << /Type /Font /Subtype /TrueType /BaseFont /Arial /FirstChar 32 /LastChar 126 /Widths [${widths}] >>\nendobj\n3 0 obj << /Type /Page /Resources << /Font << /F1 2 0 R >> >> /Contents 1 0 R >>\nendobj\n%%EOF`, 'latin1');
  check('a word set in pieces stays one word; real gaps are spaces (Dummy PDF file, not "Dumm y PDF fi le")', pdfText(pieces) === 'Dummy PDF file', JSON.stringify(pdfText(pieces)));
  const kern = 'BT /F1 12 Tf 72 712 Td [(Dumm) 20 (y) -250 (PDF) -250 (fi) 15 (le)] TJ ET';
  const kerned = Buffer.from(`%PDF-1.4\n1 0 obj << /Length ${kern.length} >>\nstream\n${kern}\nendstream\nendobj\n2 0 obj << /Type /Font /Subtype /TrueType /FirstChar 32 /Widths [${widths}] >>\nendobj\n3 0 obj << /Type /Page /Resources << /Font << /F1 2 0 R >> >> >>\nendobj\n%%EOF`, 'latin1');
  check('…and the same with kerning inside one TJ', pdfText(kerned) === 'Dummy PDF file', JSON.stringify(pdfText(kerned)));
  const far = 'BT /F2 10 Tf 72 712 Td (Two) Tj 40 0 Td (words) Tj 45 0 Td (apart) Tj ET';
  const nofont = Buffer.from(`%PDF-1.4\n1 0 obj << /Length ${far.length} >>\nstream\n${far}\nendstream\nendobj\n%%EOF`, 'latin1');
  check('with no widths in the file, a wide move is still a space', pdfText(nofont) === 'Two words apart', JSON.stringify(pdfText(nofont)));
  // 1.5.208 PC check (arXiv 1706.03762): citations and maths came out one piece a line ("[\n13\n]"). A new text block
  // on the same baseline, or a small move up or down (a footnote mark, x squared), stays on the line.
  const even = Array.from({ length: 95 }, () => 500).join(' ');
  const cite = 'BT /F1 10 Tf 72 700 Td (Attention [) Tj ET BT /F1 10 Tf 127 700 Td (13) Tj ET BT /F1 10 Tf 137 700 Td (]) Tj 0 3.5 Td (2) Tj 0 -3.5 Td ( is all) Tj ET BT /F1 10 Tf 72 688 Td (next line) Tj ET BT /F1 1 Tf 10 0 0 10 72 676 Tm (by) Tj ET BT /F1 1 Tf 10 0 0 10 90 676 Tm (Tm) Tj ET';
  const citePdf = Buffer.from(`%PDF-1.4\n1 0 obj << /Length ${cite.length} >>\nstream\n${cite}\nendstream\nendobj\n2 0 obj << /Type /Font /Subtype /TrueType /FirstChar 32 /LastChar 126 /Widths [${even}] >>\nendobj\n3 0 obj << /Type /Page /Resources << /Font << /F1 2 0 R >> >> /Contents 1 0 R >>\nendobj\n%%EOF`, 'latin1');
  check('a citation in its own text blocks and a raised 2 stay on their line; a lower line is a new line', pdfText(citePdf) === 'Attention [13]2 is all\nnext line\nby Tm', JSON.stringify(pdfText(citePdf)));
  // …and the first page came out last or not at all: arXiv stamps page 1 after the file is made, so the new page 1
  // sits at the end of the file (an update), and an old copy stays inside. The page tree gives the order.
  const pg = (s, y = 712) => `BT /F1 12 Tf 72 ${y} Td (${s}) Tj ET`;
  const st = (n, s) => `${n} 0 obj << /Length ${s.length} >>\nstream\n${s}\nendstream\nendobj\n`;
  const updated = Buffer.from('%PDF-1.5\n1 0 obj << /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n'
    + '4 0 obj << /Type /Page /Parent 2 0 R /Contents 6 0 R >>\nendobj\n' + st(6, pg('Page two words')) + '3 0 obj << /Type /Page /Parent 2 0 R /Contents 5 0 R >>\nendobj\n' + st(5, pg('An old copy of page one'))
    + 'trailer << /Root 1 0 R >>\n%%EOF\n' + st(5, pg('Attention Is All You Need')) + '1 0 obj << /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer << /Root 1 0 R /Prev 9 >>\n%%EOF\n', 'latin1');
  const { pdfPages } = await import('../src/doc-text.js');
  check('pages come in the page tree\'s order, and an updated page 1 replaces the old copy', JSON.stringify(pdfPages(updated)) === JSON.stringify(['Attention Is All You Need', 'Page two words']), JSON.stringify(pdfPages(updated)));
  const tree = Buffer.from('%PDF-1.5\n1 0 obj << /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj << /Type /Page /Parent 2 0 R /Contents [5 0 R 6 0 R] >>\nendobj\n' + st(6, pg('second half', 698)) + st(5, pg('First half')) + '%%EOF\n', 'latin1');
  check('a page made of two streams reads them in the order the page lists', pdfText(tree) === 'First half\nsecond half', JSON.stringify(pdfText(tree)));
  try { docTextFrom(Buffer.from('x'), 'doc'); why = ''; } catch (err) { why = err.message; }
  check('an old .doc points at the Office documents Hand', /Office documents Hand/.test(why), why);
  try { zipEntries(Buffer.from('not a zip at all, sorry, not one bit')); why = ''; } catch (err) { why = err instanceof DocError ? err.message : ''; }
  check('a broken file gives a plain message', /damaged/.test(why), why);
  // A "zip bomb": a tiny entry that claims to unpack to far more than it could.
  const bomb = path.join(tmp, 'bomb.docx');
  const big = zlib.deflateRawSync(Buffer.alloc(20 * 1024 * 1024, 32));
  writeZip(bomb, [{ name: 'word/document.xml', data: Buffer.alloc(20 * 1024 * 1024, 32), size: 20 * 1024 * 1024 }]);
  try { docText(bomb); why = ''; } catch (err) { why = err.message; }
  check('a zip that unpacks to far too much is stopped', /far more than it should/.test(why) && big.length < 100000, why);
  check('HTML: scripts and styles dropped', htmlText('<script>x()</script><style>p{}</style><p>Hi&nbsp;there</p>') === 'Hi there');
  check('the reader covers Word, Excel, PowerPoint, OpenDocument, e-books, RTF and PDF', ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub', 'rtf', 'pdf'].every((x2) => DOC_EXT.includes(x2)));
  check('the reader uses only Node\'s own parts and starts nothing', !/child_process|spawn|fetch\(|require\(/.test(read('src/doc-text.js')));
}

// ---------- Read and search documents ----------
{
  check('off unless turned on', !docToolsOn({}) && !docToolsOn({ docTools: 'yes' }) && docToolsOn({ docTools: true }));
  check('only true turns it on when saved', mergeSettings({}, { docTools: 'true' }).docTools === false && mergeSettings({}, { docTools: true }).docTools === true);
  const tools = buildTools(cfg);
  const off = await tools.read_file.run({ path: docx });
  check('off: read_file says it\'s a document and names the switch', /Read and search documents/.test(off) && /Sam/.test(off) && !/Pets/.test(off), off);
  cfg.docTools = true;
  const on = await tools.read_file.run({ path: docx });
  check('on: read_file reads a Word file as words', /Pets & animals/.test(on) && /Rent\t900/.test(on), on);
  const onPdf = await tools.read_file.run({ path: path.join(docs, 'Report.pdf'), find: 'next line' });
  check('on: read_file reads a PDF, and find still works', /next line/.test(onPdf));
  check('plain text still reads the same way', /hello/.test((fs.writeFileSync(path.join(docs, 'a.txt'), 'hello'), await tools.read_file.run({ path: path.join(docs, 'a.txt') }))));
  fs.writeFileSync(path.join(secret, 'diary.txt'), 'dragon secrets');
  fs.mkdirSync(path.join(docs, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(docs, 'node_modules', 'dragon.txt'), 'dragon fuel');
  fs.writeFileSync(path.join(docs, 'credentials.json'), '{"dragon fuel": 1234}');
  fs.writeFileSync(path.join(docs, '~$Budget.xlsx'), 'lock file dragon fuel');
  const tool = findDocsTool(cfg);
  const hit = await tool.run({ words: 'dragon fuel' });
  check('it finds words inside a spreadsheet', hit.includes(xlsx) && /Dragon fuel/.test(hit), hit);
  check('it skips secret files, lock files and program folders', !/credentials\.json|~\$|node_modules/.test(hit), hit);
  check('it never looks outside the folders Bob may read', !/diary/.test(hit) && /not allowed/.test(await tool.run({ words: 'dragon', folder: secret }).catch((e) => e.message)));
  check('every word must be there; a file name counts', /Pitch\.pptx \(in the name\)/.test(await tool.run({ words: 'pitch' })) && /Nothing has all/.test(await tool.run({ words: 'dragon zebra' })));
  const onlyDocs = await tool.run({ words: 'hello', kind: 'documents' }), onlyText = await tool.run({ words: 'hello', kind: 'text' });
  check('one kind only', /Talk\.odp/.test(onlyDocs) && !/a\.txt/.test(onlyDocs) && /a\.txt/.test(onlyText) && !/Talk/.test(onlyText) && /1 file looked at/.test(onlyText), onlyText);
  let ticks = 0;
  const slow = await findInDocuments(cfg, [docs], 'zebra', { now: () => (ticks += LIMITS.ms), read: () => '' });
  check('a search stops at its time limit', slow.stopped === 'time');
  const ac = new AbortController(); ac.abort();
  check('Stop stops a search', (await findInDocuments(cfg, [docs], 'dragon', { signal: ac.signal })).stopped === 'stopped');
  cfg.docTools = false;
  check('off: the tool says where the switch is', /Read and search documents/.test(await tool.run({ words: 'dragon' })));
}

// ---------- quick notes ----------
{
  check('notes are off unless turned on', !notesOn({}) && !notesOn({ quickNotes: 1 }) && notesOn({ quickNotes: true }));
  check('only true turns notes on when saved', mergeSettings({}, { quickNotes: 'true' }).quickNotes === false && mergeSettings({}, { quickNotes: true }).quickNotes === true);
  const at = new Date(Date.UTC(2026, 10, 11, 4, 15));
  check('the time is the user\'s own', stamp(cfg, at) === '2026-11-10 22:15', stamp(cfg, at));
  const tool = notesTool({ cfg });
  check('off: the tool says where the switch is', /Quick notes/.test(await tool.run({ action: 'add', text: 'x' })) && !fs.existsSync(notesFile(cfg)));
  cfg.quickNotes = true;
  check('adding a note', /Noted \(note 1\)/.test(await tool.run({ action: 'add', text: '  ring the   vet on Friday #pets ' })));
  addNote(cfg, 'buy seeds #garden', { now: at });
  addNote(cfg, 'call Mum back');
  const all = loadNotes(cfg);
  check('one line per note, in a plain file, with the date and time', all.length === 3 && /^- \d{4}-\d\d-\d\d \d\d:\d\d · ring the vet on Friday #pets$/.test(all[0].line) && all[1].text === '2026-11-10 22:15 · buy seeds #garden', JSON.stringify(all));
  check('finding by a #tag', findNotes(cfg, '#garden').length === 1 && /buy seeds/.test(await tool.run({ action: 'find', text: '#garden' })));
  check('listing', /3 notes/.test(await tool.run({ action: 'list' })) && /2\. .*buy seeds/.test(await tool.run({ action: 'list' })));
  let why = '';
  try { removeNote(cfg, 2, 'vet'); } catch (e) { why = e.message; }
  check('removing checks it is the right note', /now says/.test(why) && loadNotes(cfg).length === 3, why);
  check('removing a note keeps a copy in the archive', /Took note 2 away/.test(await tool.run({ action: 'remove', number: 2, text: 'seeds' })) && loadNotes(cfg).length === 2 && /buy seeds/.test(fs.readFileSync(removedFile(cfg), 'utf8')));
  check('the file keeps its heading after a removal', /^# Quick notes/.test(fs.readFileSync(notesFile(cfg), 'utf8')));
  check('a note is never empty', await tool.run({ action: 'add', text: '   ' }).then(() => false, () => true));
  const found = search(cfg, { topics: { list: () => [] } }, 'vet');
  cfg.quickNotes = false;
  check('the search box finds quick notes, not the heading', found.some((h) => h.kind === 'quick' && /vet/.test(h.snippet)) && !search(cfg, { topics: { list: () => [] } }, 'oldest first').some((h) => h.kind === 'quick'));
}

// ---------- Auto notes ----------
{
  check('smart notes are off unless turned on, and need quick notes', !smartNotesOn({}) && !smartNotesOn({ smartNotes: true }) && smartNotesOn({ quickNotes: true, smartNotes: true }) && !smartNotesOn({ quickNotes: true, smartNotes: 'yes' }));
  check('only true turns smart notes on when saved', mergeSettings({}, { smartNotes: 'true' }).smartNotes === false && mergeSettings({}, { smartNotes: true }).smartNotes === true);
  const brainish = { cfg, notesProject: 'Moon Garden' };
  const tool = notesTool(brainish);
  cfg.quickNotes = true;
  check('off: the tool doesn\'t offer noticed, and doesn\'t ask him to notice', !tool.schema.function.parameters.properties.noticed && !/noticed true/.test(tool.schema.function.description));
  cfg.smartNotes = true;
  check('on: the tool asks him to notice what\'s worth keeping and say 📝 Noted', tool.schema.function.parameters.properties.noticed && /decision, a number/.test(tool.schema.function.description) && /📝 Noted/.test(tool.schema.function.description) && /never passwords/.test(tool.schema.function.description));
  check('a #tag from a project name', tagFor('Moon Garden') === '#MoonGarden' && tagFor('') === '');
  const before = loadNotes(cfg).length;
  const r1 = await tool.run({ action: 'add', text: 'The boss fight moves to level 3', noticed: true });
  const last = loadNotes(cfg).at(-1);
  check('a note he noticed is marked as his and tagged with the project', last.text.endsWith(`#MoonGarden ${NOTICED}`) && /📝 Noted: The boss fight moves to level 3 #MoonGarden"/.test(r1), `${last.text} | ${r1}`);
  await tool.run({ action: 'add', text: 'idea: bigger maps #ideas' });
  check('a note with its own #tag keeps it, and yours aren\'t marked as his', /bigger maps #ideas$/.test(loadNotes(cfg).at(-1).text));
  const r2 = await tool.run({ action: 'add', text: 'The boss fight moves to level 4', noticed: true });
  const all = loadNotes(cfg);
  check('a note that says much the same replaces the old one', all.length === before + 2 && all.some((x) => /level 4/.test(x.text)) && !all.some((x) => /level 3/.test(x.text)) && /in place of the older note/.test(r2), JSON.stringify(all.map((x) => x.text)));
  check('the old wording is kept in the removed-notes file', /replaced .*level 3/.test(fs.readFileSync(removedFile(cfg), 'utf8')));
  check('different notes aren\'t merged', !sameNote(cfg, 'buy a new keyboard for the office'));
  const fit = fittingNotes(cfg, 'where does the boss fight happen now?');
  check('the notes that fit a message are found', fit.length && /level 4/.test(fit[0].text));
  check('a #tag named in a message finds its notes', fittingNotes(cfg, 'any ideas for later?').some((x) => /#ideas/.test(x.text)));
  check('they go in front of him only with the switch on', /From the user's quick notes/.test(notesPrompt(cfg, 'the boss fight')) && notesPrompt({ ...cfg, smartNotes: false }, 'the boss fight') === '');
  check('nothing unrelated is put in front of him', notesPrompt(cfg, 'what is the weather like') === '');
  const brain = brainText();
  check('the brain adds fitting notes to what he carries, only with smart notes on', /if \(smartNotesOn\(this\.cfg\)\) \{[\s\S]{0,400}notesPrompt\(this\.cfg, text/.test(brain));
  const cellar = publicText('cellar.js'), server = read('src/server.js');
  check('the switch sits under quick notes, always shown, off unless turned on', cellar.includes("${sswitch('smartNotes', settings.smartNotes === true, 'Auto notes', '"));
  check('the server saves and shows it', server.includes("typeof b.smartNotes === 'boolean'") && server.includes('smartNotes: cfg.smartNotes === true'));
  const help = HELP.find((e) => e.id === 'quick-notes').html;
  check('Help explains noticing, filing and remembering, and the FAQ is there', /I notice/.test(help) && /I file them/.test(help) && /I remember them/.test(help) && HELP.some((e) => e.id === 'faq-notes-junk'));
  cfg.smartNotes = false; cfg.quickNotes = false;
}

// ---------- the sandbox ----------
{
  check('the sandbox is off unless turned on', !sandboxOn({}) && !sandboxOn({ sandboxCode: 'on' }) && sandboxOn({ sandboxCode: true }));
  check('only true turns it on when saved', mergeSettings({}, { sandboxCode: 'true' }).sandboxCode === false && mergeSettings({}, { sandboxCode: true }).sandboxCode === true);
  check('a body becomes a run() module with its imports on top', /^import fs from "node:fs";\nexport async function run\(input\) \{\n return 1;\n\}/.test(wrapCode('import fs from "node:fs"; return 1;')), wrapCode('import fs from "node:fs"; return 1;'));
  const noHold = await runInSandbox(cfg, 'return 1', {}, { holds: async () => ({ ok: false, why: 'test' }), run: async () => { throw new Error('should not run'); } });
  check('if the lock doesn\'t hold, nothing runs', !noHold.ok && /doesn't hold/.test(noHold.error));
  const fake = async () => ({ ok: true });
  const net = await runInSandbox(cfg, 'return await fetch("https://example.com")', {}, { holds: fake, run: async () => ({ ok: true, out: 'ran' }) });
  check('code that reaches the internet is refused before it runs', !net.ok && /no internet/.test(net.error), net.error);
  const kid = await runInSandbox(cfg, 'import cp from "node:child_process"; return cp.execSync("dir")', {}, { holds: fake, run: async () => ({ ok: true, out: 'ran' }) });
  check('code that starts programs is refused before it runs', !kid.ok && /starts other programs/.test(kid.error));
  let seenDir = '';
  const fine = await runInSandbox(cfg, 'return input.a + 1', { a: 1 }, { holds: fake, run: async (o) => { seenDir = o.dir; return { ok: true, out: '2', internet: o.internet }; } });
  check('the run gets no internet and its folder is thrown away after', fine.ok && seenDir && !fs.existsSync(seenDir));
  const tool = sandboxTool({ cfg, log: () => {} });
  check('off: the tool says where the switch is', /Code sandbox/.test(await tool.run({ code: 'return 1' })));
  const holds = await sandboxHolds(cfg);
  if (holds.ok) {
    cfg.sandboxCode = true;
    const days = await tool.run({ code: 'console.log("counting"); return (new Date("2026-12-25") - new Date("2026-11-11")) / 864e5;' });
    check('a real run: the answer and what it printed', /^Result: 44\nPrinted:\ncounting/.test(days), days);
    fs.writeFileSync(path.join(secret, 'diary.txt'), 'shh');
    const peek = await tool.run({ code: `import fs from "node:fs"; return fs.readFileSync(${JSON.stringify(path.join(secret, 'diary.txt'))}, "utf8");` });
    check('a real run can\'t read a file outside its box', /^Error: The sandbox stopped it/.test(peek), peek);
    cfg.sandboxCode = false;
  } else check('the sandbox probe answers with a reason when it doesn\'t hold', Boolean(holds.why));
}

// ---------- wired into Bob ----------
{
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  const names = ['find_in_documents', 'run_in_sandbox'];
  check('both tools are there', names.every((n) => brain.tools[n]));
  check('off: Bob doesn\'t see them', names.every((n) => brain.offTools().has(n)));
  const acts = () => brain.tools.notice_board.schema.function.parameters.properties.action.enum;
  check('off: the notice board has no note actions', !acts().includes('note') && !brain.tools.notice_board.schema.function.parameters.properties.number);
  Object.assign(cfg, { quickNotes: true, docTools: true, sandboxCode: true });
  check('on: Bob sees them', names.every((n) => !brain.offTools().has(n)));
  // Nov 14: quick notes are actions on the notice board (one tool for "write it down"), not a tool of their own.
  check('on: quick notes are note, notes and unnote on the notice board, an everyday tool', ['note', 'notes', 'unnote'].every((a) => acts().includes(a)) && CORE.includes('notice_board'));
  check('take_note is never offered (it stays only for brains that learned it)', brain.offTools().has('take_note') && !CORE.includes('take_note') && brain.tools.take_note);
  check('the board says what a note is and what a to-do is', /note = write down .*not a to-do/.test(brain.tools.notice_board.schema.function.description));
  cfg.smartNotes = true;
  check('Auto notes: the board offers noticed, and facts about the user go to remember', brain.tools.notice_board.schema.function.parameters.properties.noticed && /goes to remember instead/.test(brain.tools.notice_board.schema.function.description));
  cfg.smartNotes = false;
  const board = brain.tools.notice_board;
  const said = await board.run({ action: 'note', content: 'ring the dentist #teeth' });
  const n = loadNotes(cfg).find((x) => /dentist/.test(x.text))?.n;
  const onBoard = () => fs.existsSync(cfg.noticeBoard) && /dentist/.test(fs.readFileSync(cfg.noticeBoard, 'utf8'));
  check('a note through the board goes to the quick notes file only, never the to-do list', /^Noted \(note \d+\)/.test(said) && n && !onBoard(), said);
  check('notes with words finds them, without words lists them', /dentist/.test(await board.run({ action: 'notes', content: '#teeth' })) && /notes, newest last/.test(await board.run({ action: 'notes' })));
  check('a to-do still goes on the board', /Added to the notice board: buy stamps/.test(await board.run({ action: 'add', content: 'buy stamps' })) && !loadNotes(cfg).some((x) => /stamps/.test(x.text)));
  check('unnote takes the note away, kept in the removed-notes file', /Took note/.test(await board.run({ action: 'unnote', number: n, content: 'dentist' })) && !loadNotes(cfg).some((x) => /dentist/.test(x.text)));
  check('the summary says which it was', /note: ring/.test(board.summary({ action: 'note', content: 'ring' })) && /notice board: add/.test(board.summary({ action: 'add' })));
  const g = groupsFor(brain);
  check('document search joins the documents group', g.documents?.tools.includes('find_in_documents') && g.documents.words.test('which pdf has the lease in it'));
  check('the sandbox has its own group for sums and dates', g.sandbox?.tools.includes('run_in_sandbox') && g.sandbox.words.test('how many days until Christmas') && g.sandbox.words.test('calculate the average'));
  Object.assign(cfg, { quickNotes: false, docTools: false, sandboxCode: false });
  check('guests (other Bobs, Discord channels) never get them', !/take_note|find_in_documents|run_in_sandbox/.test(read('src/share-jobs.js')));
  check('bob_help lists the three switches', /Quick notes: off \(Auto notes: off\); Read and search documents: off \(Semantic document search: off\); Documents in the side panel: off; Export and import chats: off; Render maths: off; Keyboard shortcuts: off; Saved prompts with \/: off; Code sandbox: off/.test(settingsNow({ cloud: [] })));
}

// ---------- settings page, server, Help ----------
{
  const cellar = publicText('cellar.js'), server = read('src/server.js');
  for (const [key, label] of [['quickNotes', 'Quick notes'], ['docTools', 'Read and search documents'], ['sandboxCode', 'Code sandbox']]) {
    check(`${label}: a switch in How Bob works, off unless turned on`, cellar.includes(`sswitch('${key}', settings.${key} === true, '${label}', '`));
    check(`${label}: the server saves and shows it`, server.includes(`typeof b.${key} === 'boolean'`) && server.includes(`${key}: cfg.${key} === true`));
  }
  check('the sandbox switch only turns on where the lock holds', /if \(b\.sandboxCode\) \{ const h = await sandboxHolds\(cfg\); if \(!h\.ok\)/.test(server));
  check('Open my notes opens the notes file', /data-opennotes/.test(cellar) && /quickNotesFile: notesFile\(cfg\)/.test(server));
  const ids = ['quick-notes', 'my-documents', 'sandbox', 'faq-quick-notes-where', 'faq-docs-private', 'faq-sandbox-safe'];
  check('Help and FAQ entries are there', ids.every((id) => HELP.some((e) => e.id === id)), ids.filter((id) => !HELP.some((e) => e.id === id)).join(', '));
  const gl = HELP.find((e) => e.id === 'glossary').html;
  check('the glossary has the new words', ['Quick note', 'Sandbox', 'Scanned PDF'].every((w) => gl.includes(`<dt>${w}</dt>`)));
  const body = ids.slice(0, 3).map((id) => HELP.find((e) => e.id === id).html).join(' ');
  check('Help says where each works (Windows, Mac, Linux, Android)', ['quick-notes', 'my-documents', 'sandbox'].every((id) => /Android/.test(HELP.find((e) => e.id === id).html)) && /Windows, Mac and Linux/.test(body));
  check('Help is in Bob\'s voice (I, me, my)', ids.every((id) => /\b(I|I'm|my|me)\b/.test(HELP.find((e) => e.id === id).html)));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
