// 1.5.210: Find anything (Ctrl+K in the Lamplight layout, and the "Find anything" button in its top bar).
// One box that reaches every page, tool, Settings card and Help topic by name, and searches your chats.
// Nothing is sent to the brain; it only clicks the same buttons and opens the same pages you could by hand.
import { esc } from './util.js';

// Pure: rank items for a query. Pages, tools and Settings cards come before Help topics, so a few Help
// titles never push the place you meant off the list. Each item is { label, kind, words? }. Exported for the test.
export function rankFind(items, query, max = 12) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return items.filter((i) => i.kind === 'Page' || i.kind === 'Tool').slice(0, max);
  const parts = q.split(/\s+/);
  const score = (i) => {
    const label = i.label.toLowerCase(), hay = `${label} ${(i.words || '').toLowerCase()}`;
    if (!parts.every((p) => hay.includes(p))) return -1;
    return (label.startsWith(q) ? 100 : 0) + (label.includes(q) ? 50 : 0) + (i.kind === 'Page' ? 300 : i.kind === 'Tool' ? 250 : i.kind === 'Settings' ? 200 : 0) - label.length / 100;
  };
  return items.map((i) => [score(i), i]).filter(([s]) => s >= 0).sort((a, b) => b[0] - a[0]).slice(0, max).map(([, i]) => i);
}

// items(): the current list (built on each open, so hidden pages like the Lab follow their switch).
// searchChats(q): opens chat search with the words typed.
export function createFind({ items, searchChats }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'find-dlg';
  dlg.setAttribute('aria-label', 'Find anything');
  dlg.innerHTML = `<input type="search" class="find-q" placeholder="Find a page, setting or Help topic…" aria-label="Find anything" aria-controls="findList" autocomplete="off">
    <ul id="findList" class="find-list" role="listbox" aria-label="Results"></ul>
    <p class="find-foot muted">↑ ↓ to move · Enter to open · Esc to close</p>`;
  document.body.appendChild(dlg);
  const input = dlg.querySelector('.find-q'), list = dlg.querySelector('.find-list');
  let all = [], shown = [], at = 0;

  function draw() {
    const q = input.value;
    shown = rankFind(all, q);
    if (q.trim()) shown.push({ label: `Search your chats for "${q.trim()}"`, kind: 'Chats', run: () => searchChats(q.trim()) });
    at = Math.min(at, Math.max(0, shown.length - 1));
    list.innerHTML = shown.map((i, n) => `<li role="option" id="find-${n}" aria-selected="${n === at}" data-n="${n}"><span>${esc(i.label)}</span><small>${esc(i.kind)}</small></li>`).join('') || '<li class="muted" aria-disabled="true">Nothing by that name. Try another word.</li>';
    input.setAttribute('aria-activedescendant', shown.length ? `find-${at}` : '');
  }
  function go(n) { const i = shown[n]; if (!i) return; dlg.close(); i.run(); }
  input.addEventListener('input', () => { at = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(at + 1, shown.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(at - 1, 0); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(at); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('[data-n]'); if (li) go(Number(li.dataset.n)); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  return {
    open() { all = items(); input.value = ''; at = 0; draw(); if (!dlg.open) dlg.showModal(); input.focus(); },
    close() { if (dlg.open) dlg.close(); }
  };
}
