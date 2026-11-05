// The Tasks panel and the Downloads manager. Both are lists you can reorder: drag a row, or use the
// ▲ ▼ buttons (handy over Remote Desktop, where dragging can be fiddly).
import { size, clock } from './progress.js';
import { headTip } from './tips.js';
import { esc } from './util.js';

const when = (t) => {
  if (!t) return '';
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? hm : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${hm}`;
};

// Drag and drop between rows that carry data-id and draggable="true". onMove(id, beforeId|null).
export function makeSortable(list, onMove) {
  let dragId = null;
  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest('[draggable="true"][data-id]');
    if (!row) return;
    dragId = row.dataset.id;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch {}
  });
  list.addEventListener('dragend', () => { dragId = null; for (const r of list.querySelectorAll('.dragging, .drop-before')) r.classList.remove('dragging', 'drop-before'); });
  list.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    for (const r of list.querySelectorAll('.drop-before')) r.classList.remove('drop-before');
    const row = target(e);
    if (row) row.classList.add('drop-before');
  });
  list.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const row = target(e);
    const id = dragId; dragId = null;
    onMove(id, row ? row.dataset.id : null);
  });
  // The row the dragged one should go in front of (null = the end).
  function target(e) {
    const rows = [...list.querySelectorAll('[draggable="true"][data-id]')].filter((r) => r.dataset.id !== dragId);
    return rows.find((r) => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; }) || null;
  }
}

// ▲ ▼: the id to move in front of, among the movable rows.
export function neighbour(ids, id, dir) {
  const i = ids.indexOf(id);
  if (i < 0) return undefined;
  if (dir < 0) return i === 0 ? undefined : ids[i - 1];
  if (i >= ids.length - 1) return undefined;
  return i + 2 < ids.length ? ids[i + 2] : null; // null: to the end
}

// ---------- Tasks ----------
const STATUS = { 'needs you': 'Needs you', queued: 'Queued', 'in progress': 'In progress', delegated: 'Delegated', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted' };
const ICON = { chat: '💬', picture: '🎨', video: '🎬', research: '🔎', code: '🛠', data: '📊' };

export function taskRow(j, { movable, full }) {
  const status = j.status || j.state;
  // 1.5.23: a job that needs the graphics card waits while the Gaming session is on.
  const tag = j.gaming ? `<span class="tag queued gaming">${esc(j.gaming.tag)}</span>` : j.waitsFor ? '<span class="tag queued">Waiting for a download</span>' : `<span class="tag ${status.replace(' ', '-')}">${j.delegatedTo?.sent && status === 'delegated' ? `Sent to ${esc(j.delegatedTo.copy)}` : `${esc(STATUS[status] || status)}${status === 'delegated' && j.delegatedTo ? `: ${esc(j.delegatedTo.copy)}` : ''}`}</span>`;
  const sub = status === 'delegated' && j.delegatedTo ? `${esc(j.delegatedTo.copy)} (${esc(j.delegatedTo.label)}) is on it`
    : status === 'completed' ? `Completed ${when(j.doneAt)}`
    : j.gaming ? esc(j.gaming.hint)
    : j.waitsFor ? `Runs by itself when ${esc(j.waitsFor)} finishes downloading (see Downloads)`
    : j.pickUp && status === 'queued' ? 'Picking up where it left off before Bob closed'
    : status === 'queued' ? `Added ${when(j.at)}`
    : status === 'in progress' ? `Started ${when(j.startedAt)}`
    : status === 'needs you' ? 'Bob is waiting for your OK in the chat'
    : j.error ? esc(j.error) : `${esc(STATUS[status] || status)} ${when(j.doneAt || j.at)}`;
  const trail = full && j.steps?.length ? `<ol class="steps-trail">${j.steps.map((s) => `<li>Handed to ${esc(s.copy)} (${esc(s.label)}): ${esc(s.state)}${s.doneAt ? ` at ${when(s.doneAt)}` : ''}</li>`).join('')}</ol>` : '';
  const btns = [
    movable ? '<button type="button" data-t="up" title="Move up" aria-label="Move up">▲</button><button type="button" data-t="down" title="Move down" aria-label="Move down">▼</button>' : '',
    // 1.5.38: an interrupted job carries on from where it stopped; a failed or cancelled one starts over.
    status === 'interrupted' ? '<button type="button" data-t="retry">Carry on</button>' : ['failed', 'cancelled'].includes(status) ? '<button type="button" data-t="retry">Try again</button>' : '',
    status === 'queued' ? '<button type="button" data-t="cancel">Remove</button>' : '',
    ['in progress', 'delegated', 'needs you'].includes(status) ? '<button type="button" data-t="cancel">Stop</button>' : '',
    full && !['queued', 'in progress', 'delegated', 'needs you'].includes(status) ? '<button type="button" data-t="remove" title="Take it off the list" aria-label="Take it off the list">✕</button>' : ''
  ].join('');
  return `<li class="titem" data-id="${esc(j.id)}" ${movable ? 'draggable="true"' : ''}>
    <span class="grip" aria-hidden="true">${movable ? '⋮⋮' : ''}</span>
    <span aria-hidden="true">${ICON[j.kind] || '💬'}</span>
    <span class="ttext" title="${esc(j.text)}">${esc(j.text)}${j.pics ? ` (+${j.pics} picture${j.pics > 1 ? 's' : ''})` : ''}</span>
    <span class="tbtns">${tag}${btns}</span>
    <span class="tsub">${sub}</span>${trail}
  </li>`;
}

export function createTasks({ post }) {
  const dlg = document.getElementById('tasks'), body = document.getElementById('tasks-body');
  let jobs = [], filter = 'open';
  const isOpen = (j) => j.state === 'waiting' || j.state === 'working';
  function draw() {
    if (!dlg.open) return;
    const open = jobs.filter(isOpen);
    const done = jobs.filter((j) => j.state === 'done');
    const other = jobs.filter((j) => !isOpen(j) && j.state !== 'done');
    const shown = filter === 'open' ? open : filter === 'completed' ? done.slice().reverse() : filter === 'problems' ? other.slice().reverse() : jobs;
    headTip(document.getElementById('tasks-title'), `Every message is a task. Bob does them top to bottom; drag a waiting one up or down to change what he does next. When he hands one to a copy it shows as Delegated, and Completed when it's done.`, 'Tasks');
    body.innerHTML = `      <div class="ttabs" role="tablist">
        <button type="button" data-f="open" aria-pressed="${filter === 'open'}">Open (${open.length})</button>
        <button type="button" data-f="completed" aria-pressed="${filter === 'completed'}">Completed (${done.length})</button>
        <button type="button" data-f="problems" aria-pressed="${filter === 'problems'}">Stopped or failed (${other.length})</button>
        <button type="button" data-f="all" aria-pressed="${filter === 'all'}">All</button>
        <span class="spacer"></span>
        ${done.length || other.some((j) => j.state === 'cancelled') ? '<button type="button" data-clear>Clear completed</button>' : ''}
      </div>
      <ol class="tlist">${shown.map((j) => taskRow(j, { movable: j.state === 'waiting', full: true })).join('') || '<li class="muted">Nothing here.</li>'}</ol>`;
  }
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.f) { filter = b.dataset.f; return draw(); }
    if ('clear' in b.dataset) return post('/api/queue/clear', {});
    const id = b.closest('[data-id]')?.dataset.id;
    if (!id) return;
    const t = b.dataset.t;
    if (t === 'up' || t === 'down') {
      const ids = jobs.filter((j) => j.state === 'waiting').map((j) => j.id);
      const before = neighbour(ids, id, t === 'up' ? -1 : 1);
      if (before !== undefined) post('/api/queue/move', { id, before });
    } else if (t) post(`/api/queue/${t}`, { id });
  });
  makeSortable(body, (id, before) => post('/api/queue/move', { id, before }));
  document.getElementById('tasks-close').onclick = () => dlg.close();
  return {
    open() { dlg.showModal(); draw(); },
    update(list) { jobs = list; draw(); }
  };
}

// ---------- Downloads ----------
const DL_STATE = { queued: 'Waiting', downloading: 'Downloading', paused: 'Paused', failed: 'Failed', done: 'Done', cancelled: 'Cancelled', retrying: 'Retrying' };

export function downloadRow(d) {
  const live = d.state === 'downloading';
  const pct = d.total ? Math.min(100, Math.round((d.done / d.total) * 100)) : 0;
  const retrying = d.state === 'queued' && d.retryAt > Date.now();
  const st = retrying ? 'retrying' : d.state;
  const facts = [
    d.total ? `${size(d.done)} of ${size(d.total)}${d.state !== 'done' ? ` (${pct}%)` : ''}` : d.done ? size(d.done) : '',
    live && d.rate ? `${size(d.rate)}/s` : '',
    live && d.eta != null ? `about ${clock(d.eta)} left` : '',
    retrying ? `trying again in ${Math.max(1, Math.round((d.retryAt - Date.now()) / 1000))} s` : '',
    d.state === 'done' && d.doneAt ? `finished ${when(d.doneAt)}` : ''
  ].filter(Boolean).join(' · ');
  const movable = ['queued', 'paused', 'failed', 'downloading'].includes(d.state);
  const btns = [
    movable ? '<button type="button" data-d="up" title="Move up" aria-label="Move up">▲</button><button type="button" data-d="down" title="Move down" aria-label="Move down">▼</button>' : '',
    live || (d.state === 'queued' && !retrying) ? `<button type="button" data-d="pause" title="${d.kind === 'engine' ? 'An engine starts over when resumed' : d.viaOllama ? 'Ollama keeps what it has and carries on' : 'Keeps what has downloaded'}">Pause</button>` : '',
    d.state === 'paused' || d.state === 'failed' ? `<button type="button" class="get" data-d="resume">${d.state === 'failed' ? 'Try again' : 'Resume'}</button>` : '',
    ['queued', 'downloading', 'paused', 'failed'].includes(d.state) ? '<button type="button" data-d="cancel" title="Stop and delete the half-downloaded file">Cancel</button>' : '',
    ['done', 'cancelled', 'failed'].includes(d.state) ? '<button type="button" data-d="remove" title="Take it off the list" aria-label="Take it off the list">✕</button>' : ''
  ].join('');
  return `<li class="titem" data-id="${esc(d.id)}" ${movable ? 'draggable="true"' : ''}>
    <span class="grip" aria-hidden="true">${movable ? '⋮⋮' : ''}</span>
    <span aria-hidden="true">${d.kind === 'engine' ? '⚙️' : '📦'}</span>
    <span class="ttext" title="${esc(d.name)}">${esc(d.name)}</span>
    <span class="tbtns"><span class="tag ${st}">${esc(DL_STATE[st] || st)}</span>${btns}</span>
    ${live || d.state === 'paused' ? `<div class="meter${live && !d.total ? ' moving' : ''}"><i style="width:${live && !d.total ? 100 : pct}%"></i></div>` : ''}
    <span class="tsub">${facts}${d.error && d.state !== 'done' ? `${facts ? ' · ' : ''}${esc(d.error)}` : ''}${d.note && d.state !== 'done' ? `${facts || d.error ? ' · ' : ''}${esc(d.note)}` : ''}</span>
  </li>`;
}

export function createDownloads({ api, post }) {
  const dlg = document.getElementById('downloads'), body = document.getElementById('downloads-body');
  let items = [], settings = { concurrent: 1, resumeOnStart: false }, pickUpOn = false;
  let last = 0;
  function draw(force) {
    if (!dlg.open) return;
    // Progress ticks arrive every second; don't redraw while a button is being pressed or a row dragged.
    if (!force && (body.querySelector('.dragging') || Date.now() - last < 400)) return;
    last = Date.now();
    const open = items.filter((d) => !['done', 'cancelled'].includes(d.state));
    const finished = items.filter((d) => ['done', 'cancelled'].includes(d.state));
    headTip(document.getElementById('downloads-title'), `Everything you've said yes to downloading. ${settings.concurrent === 2 ? 'Two run' : 'One runs'} at a time, top first; drag one up to have it next. Pause keeps what has downloaded, so a 20 GB model doesn't start over. Cancel deletes the half-done file.`, 'Downloads');
    body.innerHTML = `      <ol class="tlist">${open.map(downloadRow).join('') || '<li class="muted">Nothing downloading. Get them from Get models in the left menu.</li>'}</ol>
      ${finished.length ? `<div class="ttabs"><strong>Finished</strong><span class="spacer"></span><button type="button" data-clear>Clear finished</button></div><ol class="tlist">${finished.slice().reverse().map(downloadRow).join('')}</ol>` : ''}
      <div class="dl-settings">
        <strong>Settings</strong>
        <label>At once: <select data-set="concurrent"><option value="1" ${settings.concurrent !== 2 ? 'selected' : ''}>1 download</option><option value="2" ${settings.concurrent === 2 ? 'selected' : ''}>2 downloads</option></select></label>
        <label><input type="checkbox" data-set="resumeOnStart" ${settings.resumeOnStart || pickUpOn ? 'checked' : ''} ${pickUpOn ? 'disabled' : ''}> Carry on unfinished downloads when Bob starts</label>
        <p class="muted">${pickUpOn ? 'On because Pick up where Bob left off is on.' : 'Left off, they wait, paused, until you press Resume.'}</p>
      </div>`;
  }
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('clear' in b.dataset) return post('/api/models/clear', {});
    const id = b.closest('[data-id]')?.dataset.id, d = b.dataset.d;
    if (!id || !d) return;
    if (d === 'up' || d === 'down') {
      const ids = items.filter((x) => ['queued', 'paused', 'failed', 'downloading'].includes(x.state)).map((x) => x.id);
      const before = neighbour(ids, id, d === 'up' ? -1 : 1);
      if (before !== undefined) post('/api/models/move', { id, before });
    } else post(`/api/models/${d}`, { id });
  });
  body.addEventListener('change', async (e) => {
    const k = e.target.dataset.set;
    if (!k) return;
    const patch = k === 'concurrent' ? { concurrent: Number(e.target.value) } : { resumeOnStart: e.target.checked };
    const r = await api('/api/settings', { downloads: patch }).catch(() => null);
    if (r?.downloads) settings = r.downloads;
    draw(true);
  });
  makeSortable(body, (id, before) => post('/api/models/move', { id, before }));
  document.getElementById('downloads-close').onclick = () => dlg.close();
  return {
    async open() {
      dlg.showModal();
      try { let st; [items, st] = await Promise.all([api('/api/downloads'), api('/api/settings')]); settings = st.downloads || settings; pickUpOn = st.resumeJobs === true; } catch {}
      draw(true);
    },
    update(list) { items = list; draw(true); },
    tick(ev) {
      const d = items.find((x) => x.id === ev.id);
      if (!d) return;
      Object.assign(d, { done: ev.done, total: ev.total || d.total, rate: ev.rate, eta: ev.eta });
      draw();
    },
    items: () => items
  };
}
