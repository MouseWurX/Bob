// Bob's layout: a menu on the left that folds to an icon strip (Ctrl+B), chat in the middle, and a
// "Now running" panel on the right (Ctrl+J) with tasks, downloads and graphics card memory.
// Both remember how you left them. In a narrow window the right panel slides over the chat.
import { brainPlace, cardLevel, ramLevel, cpuLevel, cpuShare, quietBaseline } from './mem-colours.js';
import { makeSortable, neighbour, taskRow, downloadRow } from './lists.js';
import { currentStyle } from './themes.js';
import { catMoment } from './patches.js';
import { createBrainBay } from './brain-swap.js';
import { esc } from './util.js';
import { drawBob } from './bob-sprite.js'; // the avatars on the Bob-Net list
import { createMindCube } from './mind-cube.js';
import { createMindView } from './mind-view.js'; // 1.5.138: Bob's thinking, docked
import { DEFAULT_ORDER, SECTION_NAME, applyOrder, dropBefore } from './now-sections.js';


const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};
const narrow = () => window.innerWidth <= 900;

export function createLayout({ post, openTasks, openDownloads }) {
  const body = document.body;
  let jobs = [], dls = [], needsYou = false, model = '', cat = 'Patches';
  // The cat's name from Settings, for the little moments in the empty Tasks list (they change every 10 minutes).
  fetch('/api/settings').then((r) => r.json()).then((st) => { if (st.catName) { cat = st.catName; draw(); } }).catch(() => {});
  setInterval(() => { if (!jobs.some((j) => j.state === 'waiting' || j.state === 'working')) draw(); }, 600000).unref?.();
  const tl = $('nowTasks'), dl = $('nowDl');
  let gpuTimer = null;
  let netTimer = null, netSoon = null; // 1.5.123 Bob-Net party (the section below)
  // 1.5.30: the readings' state lives up here too (pollGpu() can run before the section below; see 1.5.26).
  let lastGpu = null, showGraph = false, lastOk = 0;
  const hist = []; // the last 5 minutes of samples, for the graph (kept in this window only)
  try { showGraph = localStorage.getItem('bob-now-graph') === '1'; } catch {}
  let gpuAt = 0, brainSt = null; // 1.5.26: up here, because pollGpu() can run before the graphics-card section below
  let docked = false, mindView = null; // 1.5.138: up here too, because setRight() runs before the docked-thinking section below

  // ---- folding ----
  const leftFolded = () => body.classList.contains('left-folded');
  function setLeft(folded, remember = true) {
    body.classList.toggle('left-folded', folded);
    $('foldLeft').setAttribute('aria-expanded', String(!folded));
    $('foldLeft').title = folded ? 'Open the menu (Ctrl+B)' : 'Fold the menu (Ctrl+B)';
    if (remember) store.set('bob-left', folded ? 'folded' : 'open');
  }
  function setRight(hidden, remember = true) {
    body.classList.toggle('right-hidden', hidden);
    $('foldRight').setAttribute('aria-expanded', String(!hidden));
    if (remember && !narrow()) store.set('bob-right', hidden ? 'hidden' : 'open');
    if (!hidden) { draw(); pollGpu(); pollNet(); }
    mindListen();
  }
  setLeft(store.get('bob-left', window.innerWidth < 700 ? 'folded' : 'open') === 'folded', false);
  // A narrow window starts with the panel tucked away, whatever was remembered, so it never covers the chat by surprise.
  setRight(narrow() || store.get('bob-right', window.innerWidth < 1100 ? 'hidden' : 'open') === 'hidden', false);
  const w = Number(store.get('bob-now-w', '300'));
  if (w >= 220 && w <= 560) body.style.setProperty('--now-w', `${w}px`);

  $('foldLeft').onclick = () => setLeft(!leftFolded());
  $('foldRight').onclick = () => setRight(!body.classList.contains('right-hidden'));
  $('hideRight').onclick = () => setRight(true);
  $('chatBtn').onclick = () => { if (narrow()) setRight(true); if (window.innerWidth <= 560) setLeft(true); $('input').focus(); };
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); setLeft(!leftFolded()); }
    if (k === 'j') { e.preventDefault(); setRight(!body.classList.contains('right-hidden')); }
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && narrow() && !body.classList.contains('right-hidden') && !document.querySelector('dialog[open]')) setRight(true); });

  // ---- resizing the right panel ----
  const grab = $('grab');
  grab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grab.setPointerCapture(e.pointerId);
    grab.classList.add('dragging');
    const move = (ev) => { const width = Math.max(220, Math.min(560, window.innerWidth - ev.clientX)); body.style.setProperty('--now-w', `${width}px`); };
    const up = () => {
      grab.classList.remove('dragging');
      grab.removeEventListener('pointermove', move);
      store.set('bob-now-w', String(parseInt(getComputedStyle(body).getPropertyValue('--now-w'), 10) || 300));
    };
    grab.addEventListener('pointermove', move);
    grab.addEventListener('pointerup', up, { once: true });
  });
  grab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const cur = parseInt(getComputedStyle(body).getPropertyValue('--now-w'), 10) || 300;
    const width = Math.max(220, Math.min(560, cur + (e.key === 'ArrowLeft' ? 20 : -20)));
    body.style.setProperty('--now-w', `${width}px`);
    store.set('bob-now-w', String(width));
  });

  // ---- 1.5.138: the order of the sections (drag the grip, or its Move up / Move down; arrow keys on the grip) ----
  const secBox = $('nowSections'), say = $('nowOrderSay');
  let order = applyOrder(store.get('bob-now-order', DEFAULT_ORDER.join(',')));
  // Only the sections on show count (Bob-Net hides until it's in use), so a move always does something you can see.
  const shown = () => order.filter((id) => { const sec = secBox.querySelector(`[data-sec="${id}"]`); return sec && !sec.hidden; });
  function placeSections(announce = '') {
    for (const id of order) { const sec = secBox.querySelector(`[data-sec="${id}"]`); if (sec) secBox.append(sec); }
    const vis = shown();
    for (const sec of secBox.querySelectorAll('[data-sec]')) {
      const i = vis.indexOf(sec.dataset.sec);
      sec.querySelector('[data-move="-1"]')?.toggleAttribute('disabled', i <= 0);
      sec.querySelector('[data-move="1"]')?.toggleAttribute('disabled', i >= vis.length - 1);
    }
    store.set('bob-now-order', order.join(','));
    if (announce && say) say.textContent = announce;
  }
  function moveSection(id, dir) {
    const vis = shown(), i = vis.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= vis.length) return;
    // In front of the neighbour (up), or in front of the one after the neighbour (down; null = the end).
    order = dropBefore(order, id, dir < 0 ? vis[j] : vis[j + 1] ?? null);
    const now = shown();
    placeSections(`${SECTION_NAME[id]} moved ${dir < 0 ? 'up' : 'down'}, now ${now.indexOf(id) + 1} of ${now.length}.`);
    secBox.querySelector(`[data-grip="${id}"]`)?.focus();
  }
  secBox.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-move]');
    if (mv) { moveSection(mv.dataset.secId, Number(mv.dataset.move)); return; }
    const g = e.target.closest('[data-grip]');
    if (g) { const open = g.getAttribute('aria-expanded') !== 'true'; g.setAttribute('aria-expanded', String(open)); g.nextElementSibling.hidden = !open; }
  });
  secBox.addEventListener('keydown', (e) => {
    const g = e.target.closest('[data-grip]');
    if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    moveSection(g.dataset.grip, e.key === 'ArrowUp' ? -1 : 1);
  });
  // Dragging: the section is draggable only while its grip is held, so the lists inside keep their own drag-to-reorder.
  let dragSec = null;
  secBox.addEventListener('pointerdown', (e) => { const g = e.target.closest('[data-grip]'); if (g) { const sec = g.closest('[data-sec]'); sec.draggable = true; } });
  secBox.addEventListener('pointerup', () => { for (const sec of secBox.querySelectorAll('[data-sec][draggable]')) sec.draggable = false; });
  secBox.addEventListener('dragstart', (e) => {
    const sec = e.target.closest?.('[data-sec][draggable="true"]');
    if (!sec || e.target.closest('.titem')) return;
    dragSec = sec.dataset.sec; sec.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragSec); } catch {}
  });
  secBox.addEventListener('dragend', () => { dragSec = null; for (const el of secBox.querySelectorAll('[data-sec].dragging, [data-sec].drop-before, [data-sec][draggable]')) { el.classList.remove('dragging', 'drop-before'); el.draggable = false; } });
  const secTarget = (e) => [...secBox.querySelectorAll('[data-sec]:not([hidden])')].filter((x) => x.dataset.sec !== dragSec).find((x) => { const b = x.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; }) || null;
  secBox.addEventListener('dragover', (e) => {
    if (!dragSec) return;
    e.preventDefault();
    for (const x of secBox.querySelectorAll('[data-sec].drop-before')) x.classList.remove('drop-before');
    secTarget(e)?.classList.add('drop-before');
  });
  secBox.addEventListener('drop', (e) => {
    if (!dragSec) return;
    e.preventDefault();
    const before = secTarget(e), id = dragSec; dragSec = null;
    order = dropBefore(order, id, before ? before.dataset.sec : null);
    placeSections(`${SECTION_NAME[id]} moved, now ${order.indexOf(id) + 1} of ${order.length}.`);
  });
  placeSections();

  // ---- every section folds to its title with a [-] / [+] button, remembered in this window (bob-now-folded) ----
  // [-] = showing, press to hide; [+] = hidden, press to show. Bob's thinking uses the same button for its own
  // switch (below), because folding it also stops Bob passing his thinking along.
  function foldLook(b, open, name) { b.textContent = open ? '[\u2212]' : '[+]'; b.setAttribute('aria-expanded', String(open)); b.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} ${name}`); b.title = `${open ? 'Hide' : 'Show'} ${name}`; }
  const SEC_NAMES = { tasks: 'Tasks', net: 'Bob-Net', downloads: 'Downloads', memory: 'Memory', graph: 'Resource use over time' };
  // the graph is its own section, folded until asked for (as its old Show graph button was: bob-now-graph)
  let folded = new Set(String(store.get('bob-now-folded', showGraph ? '' : 'graph') || '').split(',').filter((k) => SEC_NAMES[k]));
  showGraph = !folded.has('graph');
  for (const sec of document.querySelectorAll('#nowSections > section[data-sec]')) {
    const id = sec.dataset.sec; if (!SEC_NAMES[id]) continue;
    const head = sec.querySelector('.now-sec'); if (!head) continue;
    if (!head.querySelector('.ctx-fill')) { const f = document.createElement('span'); f.className = 'ctx-fill'; head.appendChild(f); }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sec-fold'; b.dataset.fold = id;
    const show = () => { sec.classList.toggle('folded', folded.has(id)); foldLook(b, !folded.has(id), SEC_NAMES[id]); };
    b.onclick = () => { if (folded.has(id)) folded.delete(id); else folded.add(id); store.set('bob-now-folded', [...folded].join(',')); show(); if (id === 'graph') { showGraph = !folded.has('graph'); graph(); } };
    head.appendChild(b); show();
  }

  // ---- 1.5.138: Bob's thinking, docked (the same view as the pop-out window, public/mind-view.js) ----
  // Off unless turned on (Show here). Bob passes his thinking along only while this is on AND the panel is in view,
  // so with Now running hidden it costs nothing, just like a closed window.
  mindView = createMindView({ log: $('mindDockLog'), now: $('mindDockNow'), follow: $('mindDockFollow'), clear: $('mindDockClear'), order: $('mindDockOrder') });
  const dockBtn = $('mindDock');
  docked = store.get('bob-mind-dock', '1') === '1'; // open to begin with, so the cube is there (1.5.196)
  function mindListen() {
    if (!mindView) return;
    const on = docked && !body.classList.contains('right-hidden') && !document.hidden;
    if (on) mindView.connect(); else mindView.disconnect();
  }
  function drawDock() {
    foldLook(dockBtn, docked, 'Bob\'s thinking');
    $('mindDockBody').hidden = !docked;
    $('nowMind').classList.toggle('on', docked);
    const st = $('mindBtnSt'); if (st) st.hidden = !docked; // the chat-bar button says where the thinking is
    mindListen();
    window.dispatchEvent(new CustomEvent('bob-mind-dock', { detail: { docked } }));
  }
  dockBtn.onclick = () => { docked = !docked; store.set('bob-mind-dock', docked ? '1' : '0'); drawDock(); if (docked) $('mindDockLog').focus({ preventScroll: true }); };
  $('mindDockPop').onclick = () => { const w = window.open('/mind.html', 'bob-mind', 'popup,width=380,height=480'); try { w?.focus(); } catch {} };
  document.addEventListener('visibilitychange', mindListen);
  // fNRI's small cube: it only listens while the section is showing. Its glow is for show unless Real experts is on
  // (off to begin with), which makes Bob ask Brain Engine for the experts each reply used, and that slows his replies.
  const cubeBtn = $('mindDockCube'), liveBtn = $('mindCubeLive');
  let cubeLive = store.get('bob-cube-live', '0') === '1';
  const drawLive = () => { if (!liveBtn) return; liveBtn.setAttribute('aria-checked', String(cubeLive)); liveBtn.querySelector('.st').textContent = cubeLive ? 'On' : 'Off'; };
  drawLive();
  if (liveBtn) liveBtn.onclick = () => { cubeLive = !cubeLive; store.set('bob-cube-live', cubeLive ? '1' : '0'); drawLive(); cubeOk = true; if (cube) cube.relive(); cubeListen(); window.dispatchEvent(new CustomEvent('bob-cube-live')); }; // the cube avatar (app.js) follows it too
  let cubeOn = store.get('bob-mind-cube', '1') === '1', cube = null, cubeOk = true; // the cube is how thinking shows to begin with; the text is the other choice
  function cubeListen() {
    cubeBtn.setAttribute('aria-checked', String(cubeOn)); cubeBtn.querySelector('.st').textContent = cubeOn ? 'On' : 'Off';
    // 1.5.209: with the cube as Bob's picture (Style), his brain shows once, in the corner; here the written thinking shows
    const shown = cubeOn && globalThis.bobCubeAvatarOn !== true;
    const on = shown && docked && !body.classList.contains('right-hidden') && !document.hidden;
    if (shown && !cube) cube = createMindCube({ box: $('mindCubeBox'), canvas: $('mindCubeCanvas'), says: $('mindCubeSays'), open: $('mindCubeOpen'), key: $('mindCubeKey'), mono: $('mindCubeMono'), colour: $('mindCubeColour'), colourBox: $('mindCubeColourBox'), details: $('mindCubeDetails'), load: $('mindCubeLoad'), unload: $('mindCubeUnload'), loadBox: $('mindCubeLoadBox'), spin: $('mindCubeSpin'), lines: $('mindCubeLines'), linesBox: $('mindCubeLinesBox') }, { onWhy: (why) => { cubeOk = !why; cubeListen(); }, still: () => body.classList.contains('still'), live: () => cubeLive });
    // with the cube showing, the written thinking steps aside; it comes back when the cube is off or can't work here
    $('mindDockBody').classList.toggle('cube-view', shown && cubeOk);
    if (!cube) return;
    if (on) cube.connect(); else cube.disconnect();
    if (!shown) cube.hide();
  }
  cubeBtn.onclick = () => { cubeOn = !cubeOn; store.set('bob-mind-cube', cubeOn ? '1' : '0'); cubeListen(); };
  document.addEventListener('visibilitychange', cubeListen);
  window.addEventListener('bob-mind-dock', cubeListen);
  window.addEventListener('bob-avatar-shown', cubeListen);
  cubeListen();
  drawDock();

  // ---- the panel's lists ----
  function draw() {
    if (body.classList.contains('right-hidden')) return badgeOnly();
    const open = jobs.filter((j) => j.state === 'waiting' || j.state === 'working');
    const shownJobs = open.map((j) => (j.state === 'working' && needsYou ? { ...j, status: 'needs you' } : j));
    const recent = jobs.filter((j) => (j.state === 'failed' || j.state === 'interrupted') && Date.now() - (j.doneAt || j.at) < 3600e3);
    tl.innerHTML = [...shownJobs, ...recent].map((j) => taskRow(j, { movable: j.state === 'waiting', full: false })).join('') || `<li class="muted">Nothing running. Ask Bob for something.</li><li class="muted cat-moment">🐈 ${esc(catMoment(cat))}.</li>`;
    const live = dls.filter((d) => ['downloading', 'queued', 'paused', 'failed'].includes(d.state));
    if (!dl.querySelector('.dragging')) dl.innerHTML = live.slice(0, 6).map(downloadRow).join('') + (live.length > 6 ? `<li class="muted">and ${live.length - 6} more</li>` : '') || '<li class="muted">No downloads.</li>';
    badgeOnly();
  }
  function badgeOnly() {
    const n = jobs.filter((j) => j.state === 'waiting' || j.state === 'working').length + dls.filter((d) => ['downloading', 'queued'].includes(d.state)).length;
    const b = $('foldRight').querySelector('.badge');
    b.hidden = !n; b.textContent = String(n);
  }
  tl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); const id = b?.closest('[data-id]')?.dataset.id;
    if (!b || !id || !b.dataset.t) return;
    if (b.dataset.t === 'up' || b.dataset.t === 'down') {
      const before = neighbour(jobs.filter((j) => j.state === 'waiting').map((j) => j.id), id, b.dataset.t === 'up' ? -1 : 1);
      if (before !== undefined) post('/api/queue/move', { id, before });
    } else post(`/api/queue/${b.dataset.t}`, { id });
  });
  dl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); const id = b?.closest('[data-id]')?.dataset.id;
    if (b && id && b.dataset.d && !['up', 'down'].includes(b.dataset.d)) post(`/api/models/${b.dataset.d}`, { id });
  });
  makeSortable(tl, (id, before) => post('/api/queue/move', { id, before }));
  makeSortable(dl, (id, before) => post('/api/models/move', { id, before }));
  $('now').addEventListener('click', (e) => {
    if (e.target.closest('[data-alltasks]')) openTasks();
    if (e.target.closest('[data-alldl]')) openDownloads();
  });

  // ---- graphics card ----
  // 1.5.26: two readings, kept apart and labelled. The meters are the whole graphics card and RAM as Windows sees
  // them (every app, from nvidia-smi). "Bob's brain" is only Bob's chat brain, the same reading as the label at
  // the top of the chat (it arrives from there as bob-brain-status), so the two always show the same number.
  // 1.5.30: each meter splits into Bob and everything else, plus processor load, speed, context and a small graph.
  // All of it comes from the same two readings (/api/gpu and /api/brain), so nothing extra runs on the PC.
  const k = (n) => Number(n || 0).toLocaleString('en-CA'); // 6,200 tokens
  const about = (n) => k(n < 100 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100); // "about" numbers: to 10 or 100
  const kctx = (n) => (n % 1024 === 0 ? `${n / 1024}K` : k(n)); // context sizes are powers of two: 32K
  const r1 = (n) => Math.round(n * 10) / 10;
  // Bob's share of the card and of RAM. Estimated parts make the whole share "about".
  const bobShare = () => {
    const st = brainSt;
    let card = 0, ram = lastGpu?.app?.ramGB || 0, about = false;
    for (const m of st?.models || []) {
      if (m.ramGB == null) { if (m.onCard) card += m.gb; else ram += m.gb; about ||= Boolean(m.estimate); }
      else { card += m.gb; ram += m.ramGB; }
    }
    if (st?.picture?.gb != null) card += st.picture.gb; else if (st?.picture) about = true;
    return { card: r1(card), ram: r1(ram), about };
  };
  const brainLine = () => {
    const el = $('nowGpu').querySelector('.mem-brain');
    if (!el) return;
    const st = brainSt;
    if (!st) { el.textContent = ''; return; }
    if (!st.engineOk) { el.textContent = 'Bob\'s brain: engine not answering'; return; }
    const pic = st.picture ? `Picture model: ${st.picture.gb != null ? `${st.picture.gb} GB on the card` : st.picture.state === 'loading' ? 'loading...' : 'on the card (Windows doesn\'t say how much)'}` : '';
    const one = (m) => {
      const parts = [];
      if (m.ramGB == null) parts.push(`${m.estimate ? 'about ' : ''}${m.gb} GB${m.onCard ? '' : ' in RAM'}`);
      else { if (m.gb > 0) parts.push(`${m.gb} GB on the card`); if (m.ramGB > 0) parts.push(`${m.ramGB} GB in RAM`); }
      return `${m.label || m.name}, ${parts.join(' + ') || '0 GB'}`;
    };
    // One line per thing of Bob's on the card, so they add up to his share of the meter above.
    const lines = !st.models?.length && !pic
      ? [st.state === 'waking' ? 'Bob\'s brain: loading...' : 'Bob has nothing on the card right now.']
      : [st.models?.length ? `Bob's brain: ${st.models.map(one).join('; ')}` : st.state === 'waking' ? 'Bob\'s brain: loading...' : 'Bob\'s brain: not loaded', pic].filter(Boolean);
    // Speed and context of the last reply (from the engine's own end-of-reply numbers).
    const sp = st.speed;
    if (sp && (!st.models?.length || st.models.some((m) => m.name === sp.model))) {
      // About 0.7 words a token for English, to the nearest 5 words.
      if (sp.tokPerSec) lines.push(`Last reply: ${sp.tokPerSec} tokens a second (about ${Math.max(5, Math.round((sp.tokPerSec * 0.7) / 5) * 5)} words)`);
      if (sp.used) {
        const ctx = sp.ctx || st.models?.find((m) => m.name === sp.model)?.ctx;
        lines.push(`Context: ${k(sp.used)}${ctx ? ` of ${kctx(ctx)} tokens (${Math.round((sp.used / ctx) * 100)}%)` : ' tokens'} · Bob's instructions and memory about ${about(sp.instructions)} · chat and files about ${about(sp.chat)}`);
      }
    }
    el.replaceChildren(...lines.map((t) => Object.assign(document.createElement('div'), { textContent: t })));
    el.title = 'What Bob has on the card. "Bob\'s brain" is the same reading as the label at the top of the chat. Context is what Bob is holding in mind right now; when it fills up he forgets the oldest parts of the chat.';
    splitLines();
  };
  // "Bob 6.0 GB · everything else 3.1 GB" under each meter.
  // Readings stop while Bob can't be seen; say so, so old numbers never look live (shown when he's seen again,
  // until the fresh reading lands a moment later, or if a reading fails).
  // Function declarations (hoisted): pollGpu() calls this before its first await, which can be before this line runs.
  function ago(ms) { const m = Math.round(ms / 60000); return m < 1 ? 'less than a minute ago' : m === 1 ? '1 min ago' : `${m} min ago`; }
  function pausedLine(on, why = 'Paused while a game or another window is in front') {
    const el = $('nowGpu'); let p = el.querySelector('.mem-paused');
    if (!on) { if (p) p.remove(); return; }
    if (!lastOk) return;
    if (!p) { p = Object.assign(document.createElement('div'), { className: 'mem-paused' }); el.prepend(p); }
    p.textContent = `${why} · last reading ${ago(Date.now() - lastOk)}`;
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pausedLine(true); });
  // 1.5.44: each bar is split too: everything else in blue, Bob's part green, yellow or red for how quick he
  // should be right now. The line under the bar says the same in words, with the reason.
  const LEVEL_WORD = { quick: 'quick', slower: 'slower', slow: 'slow' };
  const paint = (sel, bobPct, sysPct, lv) => {
    const m = $('nowGpu').querySelector(`.meter[data-bar="${sel}"]`);
    if (!m) return;
    const [bi, si] = m.children;
    bi.style.width = `${Math.max(0, Math.min(100, bobPct))}%`; bi.className = `m-bob lvl-${lv.level}`;
    si.style.width = `${Math.max(0, Math.min(100 - bobPct, sysPct))}%`;
    m.title = `Bob's part (${lv.level === 'quick' ? 'green' : lv.level === 'slower' ? 'yellow' : 'red'}): Speed: ${LEVEL_WORD[lv.level]}, ${lv.why}.${lv.fix ? ` ${lv.fix}` : ''} Blue: everything else.`;
  };
  const splitLines = () => {
    const el = $('nowGpu');
    if (!lastGpu || !brainSt) return;
    const b = bobShare(), a = b.about ? 'about ' : '', place = brainPlace(brainSt);
    // Settings sign-off (1.5.43): colour always comes with words: "Speed: quick", or the reason and a one-line fix.
    const say = (t, lv) => {
      const sp = t?.nextElementSibling?.classList.contains('mem-speed') ? t.nextElementSibling : t && t.insertAdjacentElement('afterend', Object.assign(document.createElement('span'), { className: 'mem-speed' }));
      if (!sp) return;
      sp.className = `mem-speed lvl-${lv.level}`;
      sp.textContent = lv.level === 'quick' ? `Speed: quick, ${lv.why}` : `Speed: ${LEVEL_WORD[lv.level]}, ${lv.why}. ${lv.fix || ''}`.trim();
    };
    const put = (sel, key, m, lv) => {
      const t = el.querySelector(`.${sel}`);
      // The two numbers always add up to the headline: Bob's part never counts past what's in use.
      const bob = r1(Math.min(b[key], m.usedGB)), other = r1(m.usedGB - bob);
      if (t) t.textContent = `Bob ${a}${bob} GB · everything else ${a}${other} GB`;
      say(t, lv);
      paint(sel, (bob / m.totalGB) * 100, (other / m.totalGB) * 100, lv);
    };
    if (lastGpu.gpu) put('split-card', 'card', lastGpu.gpu, cardLevel(lastGpu.gpu, place));
    if (lastGpu.ram?.totalGB) put('split-ram', 'ram', lastGpu.ram, ramLevel(lastGpu.ram, place));
    const cpu = lastGpu.cpu;
    if (cpu?.loadPct != null) {
      const lv = cpuLevel(cpu.loadPct, place);
      const sh = cpuShare(cpu, { working: brainSt.state === 'working', place, baseline: quietBaseline(hist) });
      const t = el.querySelector('.split-cpu');
      if (t) t.textContent = `Bob ${sh.about ? 'about ' : ''}${sh.bob}% · everything else ${sh.about ? 'about ' : ''}${Math.max(0, cpu.loadPct - sh.bob)}%`;
      say(t, lv);
      paint('split-cpu', sh.bob, cpu.loadPct - sh.bob, lv);
    }
  };
  // A small line graph of the last 5 minutes: graphics memory, card busy and processor busy, as percentages.
  const graph = () => {
    const el = $('nowGraph').querySelector('.mem-graph');
    if (!el) return;
    if (!showGraph || hist.length < 2) { if (showGraph) el.innerHTML = '<span class="muted">Collecting a few readings...</span>'; return; }
    const W = 200, H = 48, n = 60, mins = brainSt?.session === 'Gaming' ? 15 : 5; // 60 readings, 5 or 15 s apart
    const path = (key) => hist.map((h, i) => (h[key] == null ? null : `${(W * (n - hist.length + i)) / (n - 1)},${H - (H * h[key]) / 100}`)).filter(Boolean).map((p, i) => (i ? 'L' : 'M') + p).join(' ');
    const line = (key, cls) => { const d = path(key); return d ? `<path class="${cls}" d="${d}"/>` : ''; };
    el.innerHTML = `<div class="g-wrap"><div class="g-axis" aria-hidden="true"><span>100%</span><span>0</span></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Last ${mins} minutes, 0 to 100%: graphics memory, graphics card busy and processor busy">${line('mem', 'g-mem')}${line('gpu', 'g-gpu')}${line('cpu', 'g-cpu')}</svg></div>
      <div class="g-time muted">Last ${mins} minutes</div>
      <div class="g-key"><span class="g-mem">Graphics memory (% of card)</span><span class="g-gpu">Card busy</span><span class="g-cpu">Processor busy</span></div>`;
  };
  async function pollGpu() {
    clearTimeout(gpuTimer);
    if (body.classList.contains('right-hidden') || document.hidden) return;
    gpuAt = Date.now();
    pausedLine(false);
    try {
      const data = await (await fetch('/api/gpu')).json();
      const { gpu, ram, cpu } = data;
      lastGpu = data; lastOk = Date.now();
      const el = $('nowGpu');
      hist.push({ mem: gpu ? Math.round((gpu.usedGB / gpu.totalGB) * 100) : null, gpu: gpu?.loadPct ?? null, cpu: cpu?.loadPct ?? null, working: brainSt?.state === 'working' });
      if (hist.length > 60) hist.shift();
      // 1.5.3: graphics card and system memory (RAM), each with a meter; 1.5.30: the processor too.
      // 1.5.44: two parts per bar, Bob's (coloured by speed) and everything else (blue); splitLines() sizes them.
      const row = (pct, split) => `<div class="mem-row"><span class="mem-text"></span><div class="meter split" data-bar="${split}"><i class="m-bob"></i><i class="m-sys" style="width:${Math.min(100, Math.round(pct))}%"></i></div><span class="mem-split ${split}"></span></div>`;
      el.innerHTML = `${gpu ? row((gpu.usedGB / gpu.totalGB) * 100, 'split-card') : '<div class="mem-row"><span class="mem-text"></span></div>'}${ram?.totalGB ? row((ram.usedGB / ram.totalGB) * 100, 'split-ram') : ''}${cpu?.loadPct != null ? row(cpu.loadPct, 'split-cpu') : ''}<div class="mem-brain"></div>`;
      // 1.5.26: each meter names itself on its own line: "Graphics card · 9.1 of 15.9 GB in use (all apps)".
      const rows = el.querySelectorAll('.mem-row');
      rows[0].querySelector('.mem-text').textContent = gpu ? `Graphics card · ${gpu.usedGB} of ${gpu.totalGB} GB in use (all apps)${gpu.loadPct != null ? ` · ${gpu.loadPct}% busy` : ''}` : 'Graphics card · not detected';
      rows[0].title = 'Everything using the graphics card right now: Windows, games, other apps and all of Bob.';
      let i = 1;
      if (ram?.totalGB) rows[i++].querySelector('.mem-text').textContent = `RAM · ${ram.usedGB} of ${ram.totalGB} GB in use (all apps)`;
      if (cpu?.loadPct != null) rows[i].querySelector('.mem-text').textContent = `Processor · ${cpu.loadPct}% busy (all apps)`;
      brainLine();
      graph();
    } catch { pausedLine(true, 'Readings paused (Bob couldn\'t read the card)'); }
    // Every 5 seconds while Now running is open; every 15 in the Gaming session, so a game gets the most of the PC.
    // Nothing at all while Bob can't be seen: minimised, or covered by a full-screen game (document.hidden, above);
    // the visibilitychange listener below starts the readings again the moment he can.
    gpuTimer = setTimeout(pollGpu, brainSt?.session === 'Gaming' ? 15000 : 5000);
  }
  // ---- Bob-Net (1.5.123): your other Bobs, and what each is doing for the others right now ----
  // Hidden until Bob-Net is in use (a Bob on the list, or Lend / Take jobs on), so a fresh Bob shows nothing new.
  // Polled every 15 s while the pane is open (30 s in Gaming), and straight away after a lend, a borrow, a job sent away
  // or a pairing (net() below, from app.js). Colour never stands alone: the words say the same thing.
  const NEED = { pictures: 'a picture', video: 'a clip', music: 'music', sfx: 'a sound', model3d: 'a 3D model', web: 'web research', think: 'some thinking' };
  const CAN = { pictures: 'pictures', video: 'clips', music: 'music', sfx: 'sounds', model3d: '3D models', web: 'web research', think: 'thinking' };
  const WHY = { gaming: 'gaming, so not lending', busy: 'busy with his own job', off: 'not lending', 'not reachable': 'not reachable', 'door closed': 'door shut over there', 'passcode not accepted': 'passcode not accepted', 'too slow': 'too slow last time', 'too long': 'no room for this chat', 'no brain': 'no quick brain' };
  const sinceShort = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m === 1 ? '1 min ago' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
  // Show avatars (off unless switched on, remembered in this window): each Bob's avatar from Style, drawn small
  // beside his line. He sends his look id with the hello the list already uses, so nothing extra goes over the network.
  // A Bob with no look to send (the phone app, a Bob older than 1.5.205) keeps his 📱 or 💻 in the avatar's place.
  let avatars = store.get('bob-net-avatars', '0') === '1', lastNet = null;
  const netAvatar = (look, name, icon) => !avatars ? ''
    : look ? `<canvas class="net-avatar" width="32" height="32" data-look="${esc(look)}" role="img" aria-label="${esc(name)}'s avatar"></canvas>`
      : `<span class="net-avatar none" aria-hidden="true">${icon}</span>`;
  const netRow = (b) => {
    let state, tone;
    if (b.thinking) { state = 'thinking a reply for me'; tone = 'busy'; }
    else if (b.doing) { state = `making ${NEED[b.doing] || b.doing} for me`; tone = 'busy'; }
    else if (b.ok === true) { state = `ready${b.brain ? `, ${b.brain}` : ''}`; tone = 'ok'; }
    else if (b.ok === false) { state = WHY[b.why] || b.why || 'not answering'; tone = 'down'; }
    else { state = 'not checked yet'; tone = ''; }
    const extra = [];
    if (b.jobs?.length) extra.push(`takes ${b.jobs.map((j) => CAN[j] || j).join(', ')}`);
    if (b.lastUsed) extra.push(`thought for me ${sinceShort(Date.now() - b.lastUsed)}`);
    if (b.passAlong) extra.push('passes Bob-Net along');
    return `<li class="titem net"><span class="net-dot ${tone}" aria-hidden="true"></span>${netAvatar(b.look, b.name, b.device === 'phone' ? '📱' : '💻')}<span class="ttext"><strong>${b.device === 'phone' ? '📱' : '💻'} ${esc(b.name)}</strong> · ${esc(state)}${extra.length ? `<br><span class="muted">${esc(extra.join(' · '))}</span>` : ''}</span></li>`;
  };
  function drawNet(v) {
    lastNet = v;
    const sec = $('nowNet');
    if (!sec) return;
    if (sec.hidden !== !v?.on) { sec.hidden = !v?.on; placeSections(); }
    if (!v?.on) return;
    const h = v.here, doing = [];
    if (h.lending) doing.push(`thinking a reply for ${h.lending.for}`);
    for (const g of h.guests || []) doing.push(`${g.state === 'working' ? 'making' : 'about to make'} ${NEED[g.need] || g.need} for ${g.from}`);
    const shares = [h.lend && 'lends his brain', h.takeJobs && 'takes jobs', h.passAlong && 'passes Bob-Net along'].filter(Boolean);
    const mine = `<li class="titem net me"><span class="net-dot ${doing.length ? 'busy' : h.door ? 'ok' : ''}" aria-hidden="true"></span>${netAvatar(h.look || 'sysop', h.name, '🏠')}<span class="ttext"><strong>🏠 This Bob (${esc(h.name)})</strong> · ${esc(doing.join('; ') || (h.door ? 'nothing for the others right now' : 'door shut: the others can\'t reach him'))}${shares.length ? `<br><span class="muted">${esc(shares.join(' · '))}</span>` : ''}</span></li>`;
    const list = $('nowNetList');
    list.innerHTML = mine + (v.bobs || []).map(netRow).join('');
    for (const cv of list.querySelectorAll('canvas.net-avatar')) { const c = cv.getContext('2d'); if (!c) continue; c.imageSmoothingEnabled = false; try { drawBob(c, cv.width, {}, cv.dataset.look); } catch {} }
  }
  const avatarsBtn = $('nowNetAvatars');
  function drawAvatarsBtn() { if (!avatarsBtn) return; avatarsBtn.setAttribute('aria-checked', String(avatars)); avatarsBtn.querySelector('.st').textContent = avatars ? 'On' : 'Off'; }
  if (avatarsBtn) avatarsBtn.onclick = () => { avatars = !avatars; store.set('bob-net-avatars', avatars ? '1' : '0'); drawAvatarsBtn(); if (lastNet) drawNet(lastNet); };
  drawAvatarsBtn();
  async function pollNet() {
    clearTimeout(netTimer);
    if (body.classList.contains('right-hidden') || document.hidden) return;
    try { drawNet(await (await fetch('/api/bob-net/party')).json()); } catch {}
    netTimer = setTimeout(pollNet, brainSt?.session === 'Gaming' ? 30000 : 15000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollNet(); });

  // A fresh brain reading also refreshes the meters, so both are read at the same moment.
  const bay = createBrainBay($('brainBay')); // 1.5.49: a short scene whenever a brain or the picture model comes or goes
  window.addEventListener('bob-brain-status', (e) => { brainSt = e.detail; try { bay(brainSt); } catch {} if (Date.now() - gpuAt > 1500) pollGpu(); else brainLine(); });
  document.addEventListener('visibilitychange', pollGpu);

  return {
    jobs(list) { jobs = list; draw(); },
    downloads(list) { dls = list; draw(); },
    tick(ev) { const d = dls.find((x) => x.id === ev.id); if (d) { Object.assign(d, { done: ev.done, total: ev.total || d.total, rate: ev.rate, eta: ev.eta }); if (!dl.querySelector('.dragging')) draw(); } },
    status(s) {
      if (s.model) model = s.model;
      const was = needsYou;
      needsYou = s.state === 'waiting';
      if (needsYou !== was) draw();
      if (needsYou && !was) this.needsYou();
    },
    // "Open Now running when a task needs me" (Style page): off by default.
    needsYou() { if (currentStyle()?.openNowOnNeed === true && body.classList.contains('right-hidden')) setRight(false, false); },
    showRight() { setRight(false); },
    // 1.5.138: the chat-bar 💭 button: with Show here on, it brings Now running and the thinking section into view.
    mindDocked() { return docked; },
    showMind() { setRight(false); const sec = $('nowMind'); sec.scrollIntoView({ block: 'nearest' }); $('mindDockLog').focus({ preventScroll: true }); sec.classList.remove('flash'); void sec.offsetWidth; sec.classList.add('flash'); },
    // 1.5.123: something on Bob-Net changed (a lend, a borrow, a job sent away, a pairing): a fresh look, soon.
    net() { clearTimeout(netSoon); netSoon = setTimeout(pollNet, 800); }
  };
}
