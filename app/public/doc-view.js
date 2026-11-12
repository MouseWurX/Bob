// "Show documents in the side panel" (Settings, How Bob works; off unless you turn it on).
// Word, Excel, PowerPoint, OpenDocument, e-book, Rich Text and PDF files in the panel beside the chat: the server reads
// their words with src/doc-text.js (GET /api/file/doc) and this draws them as paragraphs and tables, sheets, or slides.
// A PDF can also be shown as its pages, where the window has a PDF viewer (Bob.exe on Windows, Mac and Linux, and
// desktop browsers); the Android app and phone browsers get its words. Nothing here runs anything from the file.
import { esc } from './rich.js';

export const DOC_RE = /\.(pdf|docx|docm|dotx|xlsx|xlsm|pptx|ppsx|odt|ods|odp|epub|rtf|doc|xls|ppt)$/i;
export const isDocName = (name) => DOC_RE.test(String(name || ''));

const SHOW_CHARS = 400_000; // more than this is a lot for one panel; the rest stays in the file
const MAX_ROWS = 500; // rows drawn per sheet
const MAX_COLS = 60;

// Which way a file is drawn: its sheets, its slides, or its words.
export function viewOf(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (['xlsx', 'xlsm', 'ods'].includes(e)) return 'sheets';
  if (['pptx', 'ppsx', 'odp'].includes(e)) return 'slides';
  return 'words';
}

// Column letters like a spreadsheet: 1 -> A, 27 -> AA.
export function colName(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// The reader's text, split into what the panel draws. Pure, so the tests can check it.
export function docParts(text, ext) {
  const view = viewOf(ext);
  const src = String(text || '').replace(/\r\n?/g, '\n');
  if (view === 'sheets') {
    const sheets = [];
    let cur = null;
    for (const line of src.split('\n')) {
      const m = line.match(/^(?:Sheet|Table): (.*)$/);
      if (m) { cur = { name: m[1].trim() || `Sheet ${sheets.length + 1}`, rows: [], more: 0 }; sheets.push(cur); continue; }
      if (!cur) { cur = { name: 'Sheet 1', rows: [], more: 0 }; sheets.push(cur); }
      if (line === '(empty)' && !cur.rows.length) continue;
      if (cur.rows.length >= MAX_ROWS) { cur.more++; continue; }
      cur.rows.push(line.split('\t').slice(0, MAX_COLS));
    }
    for (const s of sheets) while (s.rows.length && s.rows[s.rows.length - 1].every((c) => !c)) s.rows.pop();
    return { view, sheets };
  }
  if (view === 'slides') {
    const slides = [];
    let cur = null;
    for (const line of src.split('\n')) {
      const m = line.match(/^Slide (\d+)$/);
      if (m) { cur = { n: Number(m[1]), lines: [], notes: '' }; slides.push(cur); continue; }
      if (!cur) { cur = { n: 1, lines: [], notes: '' }; slides.push(cur); }
      const nt = line.match(/^Notes: ?(.*)$/);
      if (nt) cur.notes = nt[1].trim();
      else if (cur.notes) cur.notes += `\n${line}`;
      else if (line.trim()) cur.lines.push(line.replace(/\t+/g, '  ').trim());
    }
    return { view, slides };
  }
  // Words: blank lines split blocks; a block whose lines have tabs is a table (the reader puts tabs between cells).
  const cut = src.length > SHOW_CHARS;
  const blocks = [];
  for (const raw of (cut ? src.slice(0, SHOW_CHARS) : src).split(/\n{2,}/)) {
    const lines = raw.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    let para = [];
    let table = [];
    const flush = () => {
      if (para.length) { blocks.push({ type: 'p', lines: para }); para = []; }
      if (table.length) { blocks.push({ type: 'table', rows: table }); table = []; }
    };
    for (const l of lines) {
      if (l.includes('\t')) { if (para.length) { blocks.push({ type: 'p', lines: para }); para = []; } table.push(l.split('\t').slice(0, MAX_COLS)); }
      else { if (table.length) { blocks.push({ type: 'table', rows: table }); table = []; } para.push(l.trim()); }
    }
    flush();
  }
  return { view, blocks, cut };
}

function tableHtml(rows, { letters = false, label = '' } = {}) {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const cells = (r) => Array.from({ length: width }, (_, i) => `<td>${esc(r[i] ?? '')}</td>`).join('');
  const head = letters ? `<thead><tr><th scope="col"><span class="sr-only">Row</span></th>${Array.from({ length: width }, (_, i) => `<th scope="col">${colName(i + 1)}</th>`).join('')}</tr></thead>` : '';
  const body = rows.map((r, i) => `<tr>${letters ? `<th scope="row">${i + 1}</th>` : ''}${cells(r)}</tr>`).join('');
  return `<div class="vtable" tabindex="0"${label ? ` role="region" aria-label="${esc(label)}"` : ''}><table>${head}<tbody>${body}</tbody></table></div>`;
}

// The panel's HTML for what GET /api/file/doc sent back (j) — everything escaped, nothing from the file runs.
// at ("Show the page and line", src/doc-more.js): { kind: 'page'|'slide'|'paragraph', n } — a PDF opens at that page.
export function docHtml(j, { pages = false, at = null } = {}) {
  if (j.off) {
    return `<div class="vdoc-off"><p>I can show this here, beside the chat, once <strong>Show documents in the side panel</strong> is on (Settings, How Bob works). It's off unless you turn it on.</p><p><button type="button" class="mini" data-docview-on>Turn it on</button></p></div>`;
  }
  const pdf = /\.pdf$/i.test(j.ext || '');
  if (j.error && !(pdf && pages)) return `<p class="vdoc-why">${esc(j.error)}</p>`;
  const parts = docParts(j.error ? '' : j.text, j.ext);
  const cut = j.cut || parts.cut ? '<p class="muted">That\'s the first part of it. Open it in its app to see the rest.</p>' : '';
  const switchRow = pdf && pages ? `<div class="vswitch" role="group" aria-label="Show as"><button type="button" class="mini" data-docas="pages" aria-pressed="true">Pages</button><button type="button" class="mini" data-docas="words" aria-pressed="false">Words</button></div>` : '';
  const pdfFrame = pdf && pages ? `<iframe class="vpage vpdf" src="/api/file/pdf?path=${encodeURIComponent(j.path || '')}${at?.kind === 'page' && at.n > 0 ? `#page=${Number(at.n)}` : ''}" title="${esc(j.name || 'PDF')}" referrerpolicy="no-referrer"></iframe>` : '';
  if (parts.view === 'sheets') {
    if (!parts.sheets.length) return '<p class="muted">That spreadsheet is empty.</p>';
    const tabs = parts.sheets.length > 1 ? `<div class="vswitch" role="group" aria-label="Sheets">${parts.sheets.map((s, i) => `<button type="button" class="mini" data-sheet="${i}" aria-pressed="${i === 0}">${esc(s.name)}</button>`).join('')}</div>` : `<p class="muted">${esc(parts.sheets[0].name)}</p>`;
    const sheets = parts.sheets.map((s, i) => `<div class="vsheet" data-sheet-body="${i}"${i ? ' hidden' : ''}>${s.rows.length ? tableHtml(s.rows, { letters: true, label: s.name }) : '<p class="muted">This sheet is empty.</p>'}${s.more ? `<p class="muted">And ${s.more.toLocaleString()} more rows. Open it in its app to see them all.</p>` : ''}</div>`).join('');
    return `<div class="vdoc vdoc-sheets">${tabs}${sheets}<p class="muted">Values only: formulas, colours and charts stay in the file.</p>${cut}</div>`;
  }
  if (parts.view === 'slides') {
    if (!parts.slides.length) return '<p class="muted">That presentation has no words on its slides.</p>';
    const one = (s) => `<section class="vslide" aria-label="Slide ${s.n}"><span class="vslide-n">${s.n}</span>${s.lines.length ? `<h3>${esc(s.lines[0])}</h3>${s.lines.slice(1).map((l) => `<p>${esc(l)}</p>`).join('')}` : '<p class="muted">No words on this slide.</p>'}${s.notes.trim() ? `<details class="vslide-notes"><summary>Speaker notes</summary><p>${esc(s.notes.trim()).replace(/\n/g, '<br>')}</p></details>` : ''}</section>`;
    return `<div class="vdoc vdoc-slides">${parts.slides.map(one).join('')}<p class="muted">The words on each slide. Pictures and layout stay in the file.</p>${cut}</div>`;
  }
  const words = j.error ? `<p class="vdoc-why">${esc(j.error)}</p>` : parts.blocks.length
    ? parts.blocks.map((b) => (b.type === 'table' ? tableHtml(b.rows) : `<p>${b.lines.map(esc).join('<br>')}</p>`)).join('')
    : `<p class="muted">${pdf ? 'I found no words in this PDF. If it\'s a scan (pictures of pages), its pages still show where this window can draw them.' : 'There are no words in this file.'}</p>`;
  return `<div class="vdoc vdoc-words">${switchRow}${pdfFrame}<div class="vdoc-text"${pdfFrame ? ' hidden' : ''}>${words}${cut}</div></div>`;
}

// "Show the page and line" (src/doc-more.js): scroll the words to the slide or paragraph, and mark it for a moment.
// A PDF shown as pages opens at its page by itself (docHtml); shown as words, its page can't be told apart, so it
// stays at the top.
export function placeElement(stage, at) {
  if (!at || !(at.n > 0)) return null;
  if (at.kind === 'slide') return stage.querySelector(`.vslide[aria-label="Slide ${Number(at.n)}"]`);
  if (at.kind === 'paragraph' || at.kind === 'line') return stage.querySelectorAll('.vdoc-text > p, .vdoc-text > .vtable')[at.n - 1] || null;
  return null;
}
export function goToPlace(stage, at) {
  const el = placeElement(stage, at);
  if (!el) return;
  el.classList.add('flash');
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  setTimeout(() => el.classList.remove('flash'), 2500);
}

// Can this window draw a PDF's pages itself? (Chrome, Edge, Firefox and Bob.exe can; the Android app can't.)
export const canShowPdf = () => typeof navigator !== 'undefined' && navigator.pdfViewerEnabled === true;

// Draw one document into the panel's stage. isActive() says the tab is still the one showing.
export async function drawDoc(stage, t, { isActive = () => true, onTurnedOn = () => {} } = {}) {
  stage.innerHTML = '<p class="muted">Reading it...</p>';
  let j = null;
  try { const r = await fetch(`/api/file/doc?path=${encodeURIComponent(t.path)}`); if (r.ok) j = await r.json(); } catch {}
  if (!isActive()) return;
  if (!j) { stage.innerHTML = '<p class="muted">I couldn\'t read that file. It may have moved.</p>'; return; }
  j.path = t.path;
  stage.innerHTML = docHtml(j, { pages: canShowPdf(), at: t.at });
  goToPlace(stage, t.at);
  // Read documents aloud (public/read-aloud.js, off unless turned on) puts its player above the words.
  if (j.text && !j.off) { try { window.dispatchEvent(new CustomEvent('bob-doc-shown', { detail: { stage, path: t.path, name: j.name || t.name || '', text: j.text } })); } catch {} }
  stage.onclick = async (e) => {
    const on = e.target.closest('[data-docview-on]');
    if (on) {
      on.disabled = true;
      let ok = false;
      try { const r = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ docView: true }) }); ok = r.ok && (await r.json()).docView === true; } catch {}
      if (ok) { onTurnedOn(); drawDoc(stage, t, { isActive, onTurnedOn }); } else { on.disabled = false; on.textContent = 'Couldn\'t turn it on here. Try Settings.'; }
      return;
    }
    const sh = e.target.closest('[data-sheet]');
    if (sh) {
      for (const b of stage.querySelectorAll('[data-sheet]')) b.setAttribute('aria-pressed', String(b === sh));
      for (const s of stage.querySelectorAll('[data-sheet-body]')) s.hidden = s.dataset.sheetBody !== sh.dataset.sheet;
      return;
    }
    const as = e.target.closest('[data-docas]');
    if (as) {
      for (const b of stage.querySelectorAll('[data-docas]')) b.setAttribute('aria-pressed', String(b === as));
      const f = stage.querySelector('.vpdf');
      if (f) f.hidden = as.dataset.docas !== 'pages';
      stage.querySelector('.vdoc-text').hidden = as.dataset.docas !== 'words';
    }
  };
}
