// Saved prompts: the "/" menu in the message box, and Settings, 📝 Saved prompts (src/prompts.js).
// Off unless you turn it on. Picking a prompt only fills the box; you finish it and press Send.
import { esc } from './util.js';
import { slashQuery, matchPrompts, insertPrompt, nextBlank, isFileBlank, blanksOf, MAX_NAME, MAX_TEXT } from './prompt-words.js';

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}


// ---------- The "/" menu ----------
// input: the message box. openSettings(): opens Settings at this panel. Works with a mouse, a keyboard and a finger.
export function createPromptMenu(input, { openSettings = () => {}, fetchJson = api, now = () => new Date() } = {}) {
  const box = document.createElement('div');
  box.className = 'prompt-menu';
  box.id = 'promptMenu';
  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-label', 'Saved prompts');
  box.hidden = true;
  (input.closest('form') || input.parentElement).before(box);
  let view = null, loading = null, shown = [], at = 0, q = null, fileBlank = null, blanksLeft = false;

  const load = () => (loading ||= fetchJson('/api/prompts').then((v) => { view = v; return v; }).catch(() => null).finally(() => { setTimeout(() => { loading = null; }, 2000); }));
  const close = () => { box.hidden = true; shown = []; q = null; input.removeAttribute('aria-activedescendant'); input.setAttribute('aria-expanded', 'false'); };
  const isOpen = () => !box.hidden;

  function draw() {
    const rows = shown.map((p, i) => `<div class="pm-row${i === at ? ' on' : ''}" role="option" id="pm-${i}" aria-selected="${i === at}" data-pm="${i}"><strong>${esc(p.name)}</strong><span class="muted">${esc(p.text.replace(/\s+/g, ' ').slice(0, 90))}</span></div>`).join('');
    const empty = !view.prompts.length ? '<p class="muted pm-empty">No saved prompts yet.</p>' : !shown.length ? `<p class="muted pm-empty">No saved prompt called "${esc(q?.query || '')}". Enter sends your message as it is.</p>` : '';
    box.innerHTML = rows + empty + '<div class="pm-foot"><button type="button" class="mini" data-pm-manage>📝 Add or change prompts</button> <span class="muted">↑↓ to pick, Enter or Tab to use, Esc to close</span></div>';
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (shown.length) input.setAttribute('aria-activedescendant', `pm-${at}`); else input.removeAttribute('aria-activedescendant');
  }

  async function update() {
    const sq = slashQuery(input.value, input.selectionStart);
    if (!sq || input.selectionStart !== input.selectionEnd) return close();
    if (!view || sq.query === '') await load();
    if (!view?.on) return close();
    const again = slashQuery(input.value, input.selectionStart); // the box may have changed while loading
    if (!again) return close();
    q = again;
    shown = matchPrompts(view.prompts, q.query);
    at = Math.min(at, Math.max(0, shown.length - 1));
    draw();
  }

  function use(i) {
    const p = shown[i];
    if (!p || !q) return;
    const r = insertPrompt(input.value, q, p, now());
    close();
    input.value = r.value;
    input.focus();
    input.setSelectionRange(r.select[0], r.select[1]);
    blanksLeft = blanksOf(p.text).length > 0;
    input.dispatchEvent(new Event('input', { bubbles: true })); // the box grows, and Bob wakes the small brain
    offerFile(r.blank);
  }

  // A {file} blank: in Bob's own window, a button that opens the system's file picker and types the path in.
  function offerFile(name) {
    fileBlank?.remove(); fileBlank = null;
    if (!isFileBlank(name) || !view?.canPick) return;
    fileBlank = document.createElement('div');
    fileBlank.className = 'prompt-file';
    fileBlank.innerHTML = `<button type="button" class="mini">📂 Pick a file for {${esc(name)}}</button> <span class="muted">or type it</span>`;
    box.before(fileBlank);
    fileBlank.querySelector('button').onclick = async () => {
      const r = await fetchJson('/api/prompts', { pickFile: true }).catch(() => ({}));
      const b = nextBlank(input.value, 0);
      fileBlank?.remove(); fileBlank = null;
      if (!r.path || !b || !isFileBlank(b.name)) { input.focus(); return; }
      input.value = input.value.slice(0, b.start) + r.path + input.value.slice(b.end);
      input.focus();
      const n = nextBlank(input.value, b.start + r.path.length);
      if (n) { input.setSelectionRange(n.start, n.end); offerFile(n.name); } else { input.setSelectionRange(input.value.length, input.value.length); blanksLeft = false; }
    };
  }

  input.setAttribute('aria-controls', 'promptMenu');
  input.setAttribute('aria-autocomplete', 'list');
  input.addEventListener('input', () => { if (!input.value) { blanksLeft = false; fileBlank?.remove(); fileBlank = null; } update(); });
  input.addEventListener('click', () => { if (isOpen()) update(); });
  input.addEventListener('blur', () => setTimeout(() => { if (!box.contains(document.activeElement)) close(); }, 150));
  // Runs before the box's own Enter-to-send (capture), so Enter picks a prompt while the menu shows one.
  input.addEventListener('keydown', (e) => {
    if (isOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if (!shown.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = (at + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length; draw(); return; }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); use(at); return; }
      return;
    }
    // Tab jumps to the next blank while a picked prompt still has one.
    if (e.key === 'Tab' && !e.shiftKey && blanksLeft) {
      const b = nextBlank(input.value, input.selectionEnd);
      if (!b) { blanksLeft = false; return; }
      e.preventDefault();
      input.setSelectionRange(b.start, b.end);
      offerFile(b.name);
    }
  }, true);
  box.addEventListener('mousedown', (e) => e.preventDefault()); // keep the box focused while clicking the menu
  box.addEventListener('click', (e) => {
    const row = e.target.closest('[data-pm]');
    if (row) return use(Number(row.dataset.pm));
    if (e.target.closest('[data-pm-manage]')) { close(); openSettings(); }
  });
  return { close, isOpen, refresh: () => { view = null; } };
}

// ---------- Settings, 📝 Saved prompts ----------
export const promptsHtml = () => '<div class="prompts-box"><p class="muted">Loading…</p></div>';

// The list works whether the switch above it is on or off (nothing hides or locks behind a tick).
export async function mountPrompts(box) {
  if (!box) return;
  let v = { on: false, prompts: [], starters: [] }, msg = '', editing = null; // editing: null, 'new' or a prompt id
  const form = (p = { name: '', text: '' }) => `<div class="prompt-edit" role="group" aria-label="${p.id ? 'Change prompt' : 'New prompt'}">
      <label><strong>Name</strong> <span class="muted">what you type after /</span><br><input type="text" data-pe-name maxlength="${MAX_NAME}" value="${esc(p.name)}" placeholder="Sum it up" autocomplete="off"></label>
      <label><strong>Words</strong> <span class="muted">blanks go in {curly brackets}, like {file}; {date}, {time} and {day} fill themselves in</span><br><textarea data-pe-text rows="4" maxlength="${MAX_TEXT}" placeholder="Sum up {file} in five short points.">${esc(p.text)}</textarea></label>
      <div class="row"><button type="button" data-pe-save="${esc(p.id || '')}">Save</button> <button type="button" data-pe-cancel>Cancel</button></div></div>`;
  const row = (p, i) => editing === p.id ? `<li>${form(p)}</li>` : `<li class="prompt-item"><span><strong>/${esc(p.name)}</strong><br><span class="muted">${esc(p.text.length > 160 ? p.text.slice(0, 160) + '…' : p.text)}</span></span>
      <span class="row"><button type="button" class="mini" data-pe-up="${esc(p.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(p.name)} up">↑</button><button type="button" class="mini" data-pe-down="${esc(p.id)}" ${i === v.prompts.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(p.name)} down">↓</button>
      <button type="button" class="mini" data-pe-edit="${esc(p.id)}">Change</button><button type="button" class="mini" data-pe-del="${esc(p.id)}">Delete</button></span></li>`;
  const draw = () => {
    box.innerHTML = `<h4 class="ssub">My prompts (${v.prompts.length})</h4>
      ${v.prompts.length ? `<ul class="prompt-list">${v.prompts.map(row).join('')}</ul>` : `<p class="muted">None yet. Add your own, or start with a few of mine: ${v.starters.map((s) => esc(s.name)).join(', ')}.</p>`}
      ${editing === 'new' ? form() : `<div class="row"><button type="button" data-pe-new>＋ Add a prompt</button>${v.prompts.length ? '' : ' <button type="button" data-pe-starters>Add Bob\'s starters</button>'}</div>`}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <p class="muted">Kept in one file in Bob's home folder (saved-prompts.json), even while the switch is off. Bob's brain never sees the list: a prompt only fills the box. The phone app keeps its own list.</p>`;
  };
  const change = async (patch, said = '') => {
    try { v = await api('/api/prompts', patch); msg = said; return true; } catch (e) { msg = e.message; return false; } finally { draw(); }
  };
  box.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if ('peNew' in d) { editing = 'new'; msg = ''; draw(); box.querySelector('[data-pe-name]')?.focus(); return; }
    if ('peCancel' in d) { editing = null; msg = ''; draw(); return; }
    if ('peStarters' in d) { await change({ starters: true }, 'Added. Change or delete them as you like.'); return; }
    if (d.peEdit) { editing = d.peEdit; msg = ''; draw(); box.querySelector('[data-pe-name]')?.focus(); return; }
    if (d.peUp || d.peDown) { await change({ move: d.peUp || d.peDown, by: d.peUp ? -1 : 1 }); box.querySelector(`[data-pe-${d.peUp ? 'up' : 'down'}="${CSS.escape(d.peUp || d.peDown)}"]`)?.focus(); return; }
    if (d.peDel) {
      const p = v.prompts.find((x) => x.id === d.peDel);
      if (t.dataset.sure !== '1') { t.dataset.sure = '1'; t.textContent = 'Delete for good?'; return; }
      await change({ remove: d.peDel }, `Deleted /${p?.name || ''}.`); return;
    }
    if ('peSave' in d) {
      const name = box.querySelector('[data-pe-name]')?.value || '', text = box.querySelector('[data-pe-text]')?.value || '';
      if (!text.trim()) { msg = 'Type the words first.'; draw(); return; }
      if (await change({ save: { id: d.peSave || undefined, name, text } }, 'Saved.')) { editing = null; draw(); return; }
      const n = box.querySelector('[data-pe-name]'), w = box.querySelector('[data-pe-text]'); // not saved: keep what was typed
      if (n) n.value = name; if (w) w.value = text;
    }
  });
  try { v = await api('/api/prompts'); draw(); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}
