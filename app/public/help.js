// Help: a searchable page of plain-language entries (public/help-content.js). Opens from Help in the menu, F1,
// and the "?" buttons next to Settings sections and model pages, each landing on its own entry.
import { HELP } from './help-content.js';
import { esc } from './util.js';

const $ = (id) => document.getElementById(id);
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// Entries matching every word of the search (title, extra words and text), best first: title hits, then the rest.
export function searchHelp(query, list = HELP) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  const hay = (e) => `${e.title} ${e.words} ${plain(e.html)}`.toLowerCase();
  return list.filter((e) => words.every((w) => hay(e).includes(w)))
    .sort((a, b) => Number(words.some((w) => b.title.toLowerCase().includes(w))) - Number(words.some((w) => a.title.toLowerCase().includes(w))));
}

export function helpHtml(query = '') {
  const hits = searchHelp(query);
  const groups = [...new Set(HELP.map((e) => e.group))];
  const toc = groups.map((g) => `<li><strong>${esc(g)}</strong><ul>${HELP.filter((e) => e.group === g).map((e) => `<li><a href="#" data-helpgo="${esc(e.id)}">${esc(e.title)}</a></li>`).join('')}</ul></li>`).join('');
  return `<div class="help">
    <input type="search" class="help-search" data-helpsearch placeholder="Search Help" aria-label="Search Help" value="${esc(query)}">
    <div class="help-cols">
      <nav class="help-toc" aria-label="Help contents"><ul>${toc}</ul></nav>
      <div class="help-entries" aria-live="polite">${hits.length ? hits.map((e) => `<section class="help-entry" id="help-${esc(e.id)}"><h3>${esc(e.title)}</h3>${e.html}</section>`).join('') : `<p class="muted">Nothing in Help matches "${esc(query)}". Try fewer words, or ask Bob in the chat.</p>`}</div>
    </div></div>`;
}

export function createHelp() {
  const dlg = $('help'), body = $('help-body');
  let query = '';
  $('help-close').onclick = () => dlg.close();

  function draw() { body.innerHTML = helpHtml(query); }
  // 1.5.98: Connections became Bob-Net, Online services and Other apps; old links land on Bob-Net.
  const MOVED = { 'settings-connections': 'settings-bobnet' };
  function go(id) {
    id = MOVED[id] || id;
    const el = body.querySelector('#help-' + CSS.escape(id));
    if (!el) { query = ''; draw(); }
    const target = body.querySelector('#help-' + CSS.escape(id));
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 1500);
  }
  function open(id = '') {
    if (!dlg.open) { query = ''; draw(); dlg.showModal(); }
    if (id) go(id); else body.querySelector('[data-helpsearch]')?.focus();
  }

  body.addEventListener('input', (e) => {
    if (!('helpsearch' in e.target.dataset)) return;
    query = e.target.value;
    const pos = e.target.selectionStart;
    draw();
    const box = body.querySelector('[data-helpsearch]');
    box.focus(); box.setSelectionRange(pos, pos);
  });
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-help-shortcuts]')) { window.dispatchEvent(new CustomEvent('bob-shortcuts')); return; } // app.js draws the list
    const a = e.target.closest('[data-helpgo]');
    if (!a) return;
    e.preventDefault();
    go(a.dataset.helpgo);
  });
  window.addEventListener('bob-help', (e) => open(e.detail || ''));
  window.addEventListener('keydown', (e) => { if (e.key === 'F1') { e.preventDefault(); open(); } });
  return { open };
}
