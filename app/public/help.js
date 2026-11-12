// Help: a searchable page of plain-language entries (public/help-content.js). Opens from Help in the menu, F1,
// and the "?" buttons next to Settings sections and model pages, each landing on its own entry.
import { HELP, FOLD, helpHome } from './help-content.js';
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

// 1.5.210: the window shows pages, not every entry. A question or small page that folds into another (FOLD in
// help-content.js) shows inside it, closed, with its own anchor, so "?" buttons and links still land on it.
const ORDER = ['Start here', 'Getting started', 'The chat page', 'Using Bob', 'Models', 'Menu pages', 'Hands and safety', 'Settings', 'Troubleshooting', 'FAQ'];
const isRoot = (e) => !FOLD[e.id];
const kidsOf = (id) => HELP.filter((e) => FOLD[e.id] && helpHome(e.id) === id);
// One generated page lists every question, so the FAQ is still one place to browse.
const QUESTIONS = { id: 'all-questions', group: 'FAQ', title: 'All questions',
  get html() { return `<ul>${HELP.filter((e) => e.group === 'FAQ').map((e) => `<li><a href="#" data-helpgo="${esc(e.id)}">${esc(e.title)}</a></li>`).join('')}</ul>`; } };
export const helpPages = () => [...HELP.filter(isRoot), QUESTIONS];

function sub(e, open) { return `<details class="help-sub" id="help-${esc(e.id)}"${open.has(e.id) ? ' open' : ''}><summary>${esc(e.title)}</summary>${e.html}</details>`; }
function pageHtml(e, open) {
  const kids = e.id === QUESTIONS.id ? [] : kidsOf(e.id);
  const parts = kids.filter((k) => k.group !== 'FAQ'), qs = kids.filter((k) => k.group === 'FAQ');
  return `<section class="help-entry" id="help-${esc(e.id)}"><h3>${esc(e.title)}</h3>${e.html}`
    + (parts.length ? `<div class="help-subs">${parts.map((k) => sub(k, open)).join('')}</div>` : '')
    + (qs.length ? `<h4>Questions</h4><div class="help-subs">${qs.map((k) => sub(k, open)).join('')}</div>` : '')
    + '</section>';
}

export function helpHtml(query = '') {
  const pages = helpPages();
  let shown = pages, open = new Set();
  if (String(query || '').trim()) {
    const hits = searchHelp(query);
    const homes = [...new Set(hits.map((e) => helpHome(e.id)))];
    shown = homes.map((id) => pages.find((p) => p.id === id)).filter(Boolean);
    open = new Set(hits.filter((e) => FOLD[e.id]).map((e) => e.id));
  }
  const groups = [...new Set(pages.map((e) => e.group))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const toc = groups.map((g) => `<li><strong>${esc(g)}</strong><ul>${pages.filter((e) => e.group === g).map((e) => `<li><a href="#" data-helpgo="${esc(e.id)}">${esc(e.title)}</a></li>`).join('')}</ul></li>`).join('');
  const inOrder = [...shown].sort((a, b) => query ? 0 : (ORDER.indexOf(a.group) + 1 || 99) - (ORDER.indexOf(b.group) + 1 || 99));
  return `<div class="help">
    <input type="search" class="help-search" data-helpsearch placeholder="Search Help" aria-label="Search Help" value="${esc(query)}">
    <div class="help-cols">
      <nav class="help-toc" aria-label="Help contents"><ul>${toc}</ul></nav>
      <div class="help-entries" aria-live="polite">${inOrder.length ? inOrder.map((e) => pageHtml(e, open)).join('') : `<p class="muted">Nothing in Help matches "${esc(query)}". Try fewer words, or ask Bob in the chat.</p>`}</div>
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
    for (let d = target; d; d = d.parentElement?.closest('details')) if (d.tagName === 'DETAILS') d.open = true; // a folded entry opens
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
