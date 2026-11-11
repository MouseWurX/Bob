// The side panel: anything Bob made opens here, next to the chat, in its own tab (like a preview pane).
// Pictures, clips and sounds play here; documents and code show as text (a web page Bob wrote can be
// previewed with its scripts switched off); other files get Open in its app / Show in folder.
// The first tab, "Made by Bob", lists everything he has made, newest first, to call any of it up again.
// Chat cards (outCard) are small previews: a thumbnail or the first lines, and a click opens the panel.
import { esc, render } from './rich.js';
import { songCard, fillSongs } from './song-player.js';
import './model-core.js'; // 3D models (shared with the phone app)
const { isModelName } = globalThis.BobModel;

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};
const narrow = () => window.innerWidth <= 900;
const KIND_WORD = { image: 'Picture', video: 'Clip', audio: 'Sound', document: 'Document', text: 'Document', model: '3D model', folder: 'Folder', file: 'File' };
const ICON = { image: '🖼️', video: '🎞️', audio: '🔊', document: '📄', text: '📄', model: '🧊', folder: '📁', file: '📦' };
// The word on a card and in the panel: spreadsheets and web pages get their own word (clarity review).
export const kindWord = (kind, name = '') => (/\.(csv|tsv|xlsx?|ods)$/i.test(name) ? 'Spreadsheet' : /\.html?$/i.test(name) ? 'Web page' : KIND_WORD[kind] || 'File');
export const kindIcon = (kind, name = '') => (/\.(csv|tsv|xlsx?|ods)$/i.test(name) ? '📊' : /\.html?$/i.test(name) ? '🌐' : ICON[kind] || ICON.file);
// Friendly sizes: "under 1 KB", "48 KB", "2.3 MB" (never bytes).
export function friendlySize(n) {
  if (n == null || n === '') return '';
  n = Number(n);
  if (!(n >= 0)) return '';
  if (n < 1000) return 'under 1 KB';
  if (n < 1e6) return `${Math.round(n / 1e3)} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e9).toFixed(1)} GB`;
}
const kindOf = (x) => {
  const k = x.kind === 'text' ? 'document' : x.kind || (x.type && x.type !== 'file' ? x.type : 'file');
  if (k === 'file' && isModelName(x.name)) return 'model'; // 3D models open in the 3D viewer (model-core.js)
  return k === 'file' && /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i.test(x.name || '') ? 'document' : k;
};
const isText = (name) => /\.(txt|md|csv|tsv|json|log|html?|css|m?js|cjs|tsx?|jsx|py|c|h|cpp|hpp|cs|rs|java|kts?|gradle|xml|ya?ml|ini|cfg|toml|ps1|bat|cmd|sh|lua|gd|sql|svg|srt|vtt|scad)$/i.test(name || '');
const pathFromUrl = (url) => { try { return url.startsWith('/api/file?') ? new URL(url, location.origin).searchParams.get('path') : url; } catch { return url; } };

// 1.5.125: a small picture of a picture or clip, made once by the brain and kept (/api/thumb). If there's none to be had
// (no FFmpeg for clips, a browser without Bob's window), the picture itself is shown, shrunk, or the kind's icon.
export const thumbUrl = (x) => `/api/thumb?path=${encodeURIComponent(x.path || pathFromUrl(x.url || ''))}`;
export function thumbImg(x, kind = 'image', alt = '') {
  const full = kind === 'image' ? x.url || '' : '';
  return `<img class="thumb" src="${esc(thumbUrl(x))}" data-full="${esc(full)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
}
// When a thumbnail can't be had, fall back to the file itself (pictures) or the kind's icon (clips).
export function thumbFallback(img) {
  if (!img?.classList?.contains('thumb') || img.dataset.fell) return;
  img.dataset.fell = '1';
  if (img.dataset.full) img.src = img.dataset.full;
  else { const i = document.createElement('span'); i.className = 'made-ico'; i.setAttribute('aria-hidden', 'true'); i.textContent = '🎞️'; img.replaceWith(i); }
}
if (typeof document !== 'undefined') document.addEventListener('error', (e) => thumbFallback(e.target), true);

// A chat card for something Bob made or mentioned: a preview plus "View" (opens the side panel).
// item: { kind or type, url, name, path?, bytes? }. The mention is what Open / Show in folder pass to the server.
export function outCard(item) {
  const kind = kindOf(item);
  if (kind === 'audio' && item.url) return songCard(item); // 1.5.41: songs and sounds get the song player (song-player.js)
  const url = item.url || '';
  const name = item.name || decodeURIComponent(url.split('/').pop() || '');
  const mention = item.mention || item.path || (url.startsWith('/images/') ? url : pathFromUrl(url));
  const data = `data-view-url="${esc(url)}" data-view-kind="${esc(kind)}" data-view-name="${esc(name)}" data-view-path="${esc(mention || '')}"${item.bytes != null ? ` data-view-bytes="${esc(item.bytes)}"` : ''}`;
  const peekable = kind === 'document' && isText(name);
  let thumb = '';
  if (kind === 'image' && url) thumb = `<button type="button" class="out-thumb" data-view ${data} title="Open in the side panel"><img src="${esc(url)}" alt="${esc(name)}" loading="lazy"></button>`;
  else if (kind === 'video' && url) thumb = `<video class="out-media" src="${esc(url)}" controls muted loop preload="metadata" aria-label="Clip Bob made"></video>`;
  else if (kind === 'audio' && url) thumb = `<audio class="out-media" src="${esc(url)}" controls preload="none" aria-label="Sound Bob made"></audio>`;
  else if (kind === 'model' && url) thumb = `<button type="button" class="out-peek out-3d" data-view ${data} title="Turn it and zoom in the side panel"><span aria-hidden="true">🧊</span> View in 3D</button>`;
  else if (peekable && url) thumb = `<button type="button" class="out-peek" data-view ${data} data-peek="${esc(url)}" title="Open in the side panel"><span class="muted">Loading a preview...</span></button>`;
  const what = kindWord(kind, name);
  // The size comes with the item, or is looked up once the card is on screen (fillPeeks).
  const sz = item.bytes != null && kind !== 'folder' ? ` · ${esc(friendlySize(item.bytes))}` : '';
  const need = item.bytes == null && kind !== 'folder' && mention ? ` data-size-of="${esc(mention)}"` : '';
  return `<div class="out-card" data-kind="${esc(kind)}" ${data}>${thumb}<div class="out-head"><span class="out-icon" aria-hidden="true">${kindIcon(kind, name)}</span><button type="button" class="out-name" data-view ${data} title="Open in the side panel">${esc(name)}</button><span class="muted out-what"${need}>${esc(what)}${sz}</span><span class="out-tools">${url || kind === 'folder' ? `<button type="button" class="mini" data-view ${data}>View</button>` : ''}${mention ? `<button type="button" class="mini" data-reveal="${esc(mention)}">Show in folder</button>` : ''}</span></div></div>`;
}

// The first few lines of a text file, for its chat card. Kept for a minute, so a reply that redraws as
// its words stream in doesn't fetch the same preview again and again.
const peeks = new Map();
const sizes = new Map();
async function fillSizes(root) {
  const els = [...root.querySelectorAll('[data-size-of]')];
  if (!els.length) return;
  const want = [...new Set(els.map((e) => e.dataset.sizeOf).filter((p) => !sizes.has(p)))].slice(0, 20);
  for (const e of els) e.removeAttribute('data-size-of');
  if (want.length) {
    try {
      const r = await fetch('/api/file/info', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ paths: want }) });
      for (const f of await r.json()) if (f.ok && f.kind !== 'folder') sizes.set(f.mention, f.bytes);
    } catch {}
  }
  for (const e of els) { const n = sizes.get(e.dataset.sizeFor || ''); if (n != null && !e.textContent.includes('·')) e.textContent += ` · ${friendlySize(n)}`; }
}
export async function fillPeeks(root) {
  fillSongs(root);
  for (const e of root.querySelectorAll('[data-size-of]')) e.dataset.sizeFor = e.dataset.sizeOf;
  fillSizes(root);
  for (const b of root.querySelectorAll('.out-peek[data-peek]')) {
    const url = b.dataset.peek;
    b.removeAttribute('data-peek');
    let got = peeks.get(url);
    if (!got || Date.now() - got.at > 60000) {
      got = { at: Date.now(), html: fetch(`/api/file/peek?path=${encodeURIComponent(pathFromUrl(url))}&max=2048`).then(async (r) => {
        if (!r.ok) throw new Error();
        const j = await r.json();
        const all = j.text.split(/\r?\n/);
        return `<code>${esc(all.slice(0, 6).join('\n'))}</code>${all.length > 6 || j.cut ? '<span class="muted">…</span>' : ''}`;
      }).catch(() => '<span class="muted">No preview. Click to open it.</span>') };
      peeks.set(url, got);
      if (peeks.size > 200) peeks.delete(peeks.keys().next().value);
    }
    b.innerHTML = await got.html;
  }
}

export function createViewer({ post, note }) {
  const body = document.body, el = $('viewer'), tabsEl = $('vtabs'), main = $('vbody');
  const tabs = []; // { key, url, kind, name, path }
  let active = 'made', madeKind = '', madeQ = '', madeTimer = null;

  const w = Number(store.get('bob-viewer-w', '480'));
  if (w >= 280 && w <= 1400) body.style.setProperty('--viewer-w', `${w}px`);

  function show(open) {
    el.hidden = !open;
    $('vgrab').hidden = !open;
    body.classList.toggle('viewer-open', open);
    $('madeBtn')?.setAttribute('aria-expanded', String(open));
    if (open && active === 'made') drawMade();
  }
  const isOpen = () => !el.hidden;

  function drawTabs() {
    const made = `<button type="button" role="tab" class="vtab${active === 'made' ? ' on' : ''}" aria-selected="${active === 'made'}" data-tab="made">Made by Bob</button>`;
    tabsEl.innerHTML = made + tabs.map((t) => `<span class="vtab${active === t.key ? ' on' : ''}"><button type="button" role="tab" aria-selected="${active === t.key}" data-tab="${esc(t.key)}" title="${esc(t.name)}">${kindIcon(t.kind, t.name)} ${esc(t.name)}</button><button type="button" class="vtab-x" data-close="${esc(t.key)}" title="Close this tab" aria-label="Close ${esc(t.name)}">×</button></span>`).join('');
    tabsEl.querySelector('.vtab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---- Made by Bob ----
  const FILTERS = [['', 'All'], ['image', 'Pictures'], ['video', 'Clips'], ['audio', 'Sounds'], ['document', 'Documents'], ['model', '3D models'], ['file', 'Other files']];
  async function drawMade() {
    if (active !== 'made') return;
    if (!main.querySelector('.made')) {
      main.innerHTML = `<div class="made"><div class="made-bar"><div class="made-kinds" role="group" aria-label="Show">${FILTERS.map(([k, label]) => `<button type="button" class="mini" data-made-kind="${k}" aria-pressed="${madeKind === k}">${label}</button>`).join('')}</div><input type="search" class="made-q" placeholder="Search by name" aria-label="Search by name" value="${esc(madeQ)}"></div><div class="made-list" aria-live="polite"><p class="muted">Looking...</p></div></div>`;
      main.querySelector('.made-q').addEventListener('input', (e) => { madeQ = e.target.value; clearTimeout(madeTimer); madeTimer = setTimeout(drawMade, 250); });
    }
    for (const b of main.querySelectorAll('[data-made-kind]')) b.setAttribute('aria-pressed', String(b.dataset.madeKind === madeKind));
    const box = main.querySelector('.made-list');
    let list = [];
    try { list = await (await fetch(`/api/made?limit=120&kind=${encodeURIComponent(madeKind)}&q=${encodeURIComponent(madeQ)}`)).json(); } catch {}
    if (active !== 'made' || !box.isConnected) return;
    if (!Array.isArray(list) || !list.length) {
      box.innerHTML = `<p class="muted">${madeQ || madeKind ? 'Nothing matches.' : 'Nothing yet. Pictures, clips, sounds and files Bob makes or saves show up here.'}</p>`;
      return;
    }
    box.innerHTML = list.map((x) => {
      const kind = kindOf(x);
      const data = `data-view data-view-url="${esc(x.url)}" data-view-kind="${esc(kind)}" data-view-name="${esc(x.name)}" data-view-path="${esc(x.path || pathFromUrl(x.url))}" data-view-bytes="${esc(x.bytes ?? '')}"`;
      const pic = kind === 'image' || kind === 'video' ? thumbImg(x, kind) : `<span class="made-ico" aria-hidden="true">${kindIcon(kind, x.name)}</span>`;
      return `<button type="button" class="made-item" ${data} title="${esc(x.name)}">${pic}<span class="made-name">${esc(x.name)}</span><span class="muted made-when">${esc(kindWord(kind, x.name))} · ${esc(when(x.at))}</span></button>`;
    }).join('');
  }

  // ---- one thing ----
  async function drawItem(t) {
    const url = t.url;
    const tools = `<div class="vtools">${t.path ? `<button type="button" class="mini" data-open="${esc(t.path)}">Open in its app</button><button type="button" class="mini" data-reveal="${esc(t.path)}">Show in folder</button><button type="button" class="mini" data-copy-path="${esc(t.path)}">Copy path</button>` : ''}</div>`;
    const head = `<div class="vitem-head"><strong>${esc(t.name)}</strong><span class="muted">${esc(kindWord(t.kind, t.name))}${t.bytes != null && t.kind !== 'folder' ? ` · ${esc(friendlySize(t.bytes))}` : ''}</span></div>`;
    if (t.kind === 'image') { main.innerHTML = `${head}<div class="vstage"><img class="vimg" src="${esc(url)}" alt="${esc(t.name)}" title="Click to see it at full size"></div>${tools}`; return; }
    if (t.kind === 'video') { main.innerHTML = `${head}<div class="vstage"><video src="${esc(url)}" controls loop autoplay muted></video></div>${tools}`; return; }
    if (t.kind === 'model' && url) { // 3D models (STL, OBJ, GLB): turn and zoom them right here (model-core.js)
      main.innerHTML = `${head}<div class="vstage vmodel"><p class="muted">Loading the 3D model...</p></div>${tools}`;
      const stage = main.querySelector('.vmodel');
      try {
        await globalThis.BobModel.showModel(stage, { url, name: t.name, still: document.body.classList.contains('still') });
      } catch (err) { if (stage.isConnected) stage.innerHTML = `<p class="muted">${esc(err.message || 'Bob couldn\'t show that model.')} You can still open it in its app.</p>`; }
      return;
    }
    if (t.kind === 'audio') { // 1.5.41: the bigger song player, playing straight away
      main.innerHTML = `${head}<div class="vstage vaudio">${songCard({ url, name: t.name, path: t.path }, { big: true })}</div>${tools}`;
      fillSongs(main);
      main.querySelector('.song audio')?.play().catch(() => {});
      return;
    }
    if (t.kind === 'document' && isText(t.name) && url) {
      main.innerHTML = `${head}<div class="vstage vtext"><p class="muted">Loading...</p></div>${tools}`;
      let j = null;
      try { const r = await fetch(`/api/file/peek?path=${encodeURIComponent(pathFromUrl(url))}`); if (r.ok) j = await r.json(); } catch {}
      const stage = main.querySelector('.vtext');
      if (!stage || active !== t.key) return;
      if (!j) { stage.innerHTML = '<p class="muted">Bob couldn\'t read that file. It may have moved.</p>'; return; }
      const cut = j.cut ? `<p class="muted">Showing the first ${esc(friendlySize(j.text.length))}. Open it in its app to see it all.</p>` : '';
      if (/\.(html?|svg)$/i.test(j.ext)) {
        stage.innerHTML = `<div class="vswitch" role="group" aria-label="Show as"><button type="button" class="mini" data-as="page" aria-pressed="true">Page</button><button type="button" class="mini" data-as="code" aria-pressed="false">Code</button><span class="muted">Scripts stay off in the preview.</span></div><iframe class="vpage" sandbox="" referrerpolicy="no-referrer" title="${esc(t.name)}"></iframe><pre class="vcode" hidden><code>${esc(j.text)}</code></pre>${cut}`;
        stage.querySelector('iframe').srcdoc = j.text;
        return;
      }
      if (j.ext === '.md') { stage.innerHTML = `<div class="vmd">${render(j.text)}</div>${cut}`; return; }
      if (j.ext === '.csv' || j.ext === '.tsv') { stage.innerHTML = tableHtml(j.text, j.ext === '.tsv' ? '\t' : ',') + cut; return; }
      stage.innerHTML = `<pre class="vcode"><code>${esc(j.text)}</code></pre>${cut}`;
      return;
    }
    const why = t.kind === 'folder' ? 'A folder. Open it to see what\'s inside.' : 'Bob can\'t show this kind of file here. Open it in its app to see it.';
    main.innerHTML = `${head}<div class="vstage vother"><span class="made-ico big" aria-hidden="true">${kindIcon(t.kind, t.name)}</span><p>${why}</p></div>${tools}`;
  }

  function draw() {
    drawTabs();
    if (active === 'made') { main.innerHTML = ''; drawMade(); return; }
    const t = tabs.find((x) => x.key === active);
    if (t) drawItem(t); else { active = 'made'; draw(); }
  }

  // Open something in its own tab (or switch to its tab if it's open already).
  function open(item, { focus = true } = {}) {
    const kind = kindOf(item);
    const key = item.url || item.path || item.name;
    if (!key) return;
    let t = tabs.find((x) => x.key === key);
    if (!t) {
      t = { key, url: item.url || '', kind, bytes: item.bytes === '' || item.bytes == null ? null : Number(item.bytes), name: item.name || key.split(/[\\/]/).pop(), path: item.path || (item.url?.startsWith('/images/') ? item.url : pathFromUrl(item.url || '')) };
      tabs.push(t);
      if (tabs.length > 8) tabs.shift(); // keep it light: the oldest tab closes
    }
    active = t.key;
    show(true);
    draw();
    if (focus && narrow()) el.focus?.();
  }

  function openMade() { active = 'made'; show(true); draw(); }
  function close() { show(false); }

  // Clicks: the tabs, the list, and any [data-view] in the chat.
  tabsEl.addEventListener('click', (e) => {
    const x = e.target.closest('[data-close]');
    if (x) { const i = tabs.findIndex((t) => t.key === x.dataset.close); if (i >= 0) tabs.splice(i, 1); if (active === x.dataset.close) active = tabs[Math.max(0, i - 1)]?.key || 'made'; draw(); return; }
    const b = e.target.closest('[data-tab]');
    if (b) { active = b.dataset.tab; draw(); }
  });
  main.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-made-kind]');
    if (k) { madeKind = k.dataset.madeKind; drawMade(); return; }
    const as = e.target.closest('[data-as]');
    if (as) {
      const stage = as.closest('.vtext');
      for (const b of stage.querySelectorAll('[data-as]')) b.setAttribute('aria-pressed', String(b === as));
      stage.querySelector('.vpage').hidden = as.dataset.as !== 'page';
      stage.querySelector('.vcode').hidden = as.dataset.as !== 'code';
      return;
    }
    const img = e.target.closest('.vimg');
    if (img) { img.classList.toggle('full'); img.title = img.classList.contains('full') ? 'Click to fit it in the panel' : 'Click to see it at full size'; return; }
    const b = e.target.closest('button[data-open], button[data-reveal], button[data-copy-path]');
    if (!b) return;
    if (b.dataset.copyPath) {
      let ok = false;
      try { ok = (await post('/api/clipboard', { text: b.dataset.copyPath })).data.ok === true; } catch {}
      if (!ok) { try { await navigator.clipboard.writeText(b.dataset.copyPath); ok = true; } catch {} }
      const was = b.textContent; b.textContent = ok ? 'Copied' : 'Couldn\'t copy'; setTimeout(() => { b.textContent = was; }, 1400);
      return;
    }
    const r = await post('/api/open', { path: b.dataset.open ?? b.dataset.reveal, reveal: b.dataset.reveal != null });
    if (!r.ok) note(r.data.error || 'Couldn\'t open that.', 'error');
  });
  document.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (!v) return;
    e.preventDefault();
    open({ url: v.dataset.viewUrl, kind: v.dataset.viewKind, name: v.dataset.viewName, path: v.dataset.viewPath, bytes: v.dataset.viewBytes || sizes.get(v.dataset.viewPath) || null });
  });
  $('vclose').onclick = close;
  // Below 1800 px wide, Now running steps aside while the panel is open (style.css). Asking for it closes the panel.
  $('foldRight')?.addEventListener('click', (e) => {
    if (isOpen() && window.innerWidth < 1800 && !body.classList.contains('right-hidden')) { e.stopImmediatePropagation(); close(); }
  }, true);
  $('madeBtn').onclick = () => (isOpen() && active === 'made' ? close() : openMade());
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { e.stopPropagation(); close(); } });

  // Resizing (drag the bar, or arrow keys on it).
  const grab = $('vgrab');
  const clampW = (x) => Math.max(280, Math.min(Math.round(window.innerWidth * 0.7), x));
  grab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grab.setPointerCapture(e.pointerId);
    grab.classList.add('dragging');
    const right = el.getBoundingClientRect().right;
    const move = (ev) => body.style.setProperty('--viewer-w', `${clampW(right - ev.clientX)}px`);
    const up = () => { grab.classList.remove('dragging'); grab.removeEventListener('pointermove', move); store.set('bob-viewer-w', String(parseInt(getComputedStyle(body).getPropertyValue('--viewer-w'), 10) || 480)); };
    grab.addEventListener('pointermove', move);
    grab.addEventListener('pointerup', up, { once: true });
  });
  grab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const cur = parseInt(getComputedStyle(body).getPropertyValue('--viewer-w'), 10) || 480;
    const width = clampW(cur + (e.key === 'ArrowLeft' ? 30 : -30));
    body.style.setProperty('--viewer-w', `${width}px`);
    store.set('bob-viewer-w', String(width));
  });

  show(false);
  return {
    open, openMade, close, isOpen,
    // Bob made or saved something: the list refreshes; if the panel is open, the newest opens in it.
    // show: he was asked to call it up (show_made), so the panel opens.
    made(items, { show: asked = false } = {}) {
      if (!items?.length) return;
      if (asked || isOpen()) open(items[0], { focus: false });
      else if (active === 'made') drawMade();
    }
  };
}

export function when(t) {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// A CSV/TSV as a table (the first 200 rows), quotes understood.
function tableHtml(text, sep) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length && rows.length < 200; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return '<p class="muted">Empty.</p>';
  const [headRow, ...rest] = rows;
  return `<div class="vtable"><table><thead><tr>${headRow.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
