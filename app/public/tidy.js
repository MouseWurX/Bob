// Tidy up: what Bob found that hasn't come up for longer than your limits. A tick (tidy it) or a cross (keep it)
// per item; chats can be summed up first. Everything goes to the Recycle Bin. Pin something to never be asked again.
import { esc, size } from './rich.js';
import { tip } from './tips.js';

const $ = (id) => document.getElementById(id);
const ACTION = { summarize: 'Sum up, then to the Recycle Bin', delete: 'To the Recycle Bin', forget: 'Forget the chat parts (note stays)' };
const KIND_LABEL = { chats: 'Chats', pictures: 'Pictures and clips', sounds: 'Sounds', tasks: 'Finished tasks', logs: 'Logs', topics: 'Topics set to fade', spare: 'Spare copies' };

export function createTidy({ api, onCount }) {
  const dlg = $('tidy'), body = $('tidy-body');
  $('tidy-close').onclick = () => dlg.close();
  let items = [], pick = new Map(), info = null, msg = '';

  async function load(scan = false) {
    try {
      info = await api('/api/hk');
      items = scan || !info.items.length ? (await api('/api/hk/scan', {})).items : info.items;
    } catch (e) { msg = e.message; items = []; }
    for (const i of items) if (!pick.has(i.key)) pick.set(i.key, i.def);
    onCount?.(items.length);
    draw();
  }

  function row(i) {
    const p = pick.get(i.key) || i.def;
    const keep = p === 'keep';
    return `<li class="tidy-row${keep ? ' keep' : ''}" data-key="${esc(i.key)}">
      ${i.url && i.kind === 'pictures' ? `<img src="${esc(i.url)}" alt="" loading="lazy" class="tidy-thumb">` : ''}
      <div class="tidy-what"><strong>${esc(i.label)}</strong> <span class="muted">${esc(size(i.bytes))}</span><br><span class="muted">${esc(i.detail || '')}</span>
        ${!keep && i.actions.length > 1 ? `<br><select data-action aria-label="What to do">${i.actions.map((a) => `<option value="${a}" ${a === p ? 'selected' : ''}>${esc(ACTION[a] || a)}</option>`).join('')}</select>` : !keep ? `<br><span class="muted">${esc(ACTION[p] || p)}</span>` : '<br><span class="muted">Kept. Bob asks again only if it stays unused for another full stretch.</span>'}</div>
      <span class="tidy-btns">
        <button type="button" class="tick" data-yes aria-pressed="${!keep}" title="Tidy it" aria-label="Tidy ${esc(i.label)}">✓</button>
        <button type="button" class="cross" data-no aria-pressed="${keep}" title="Keep it" aria-label="Keep ${esc(i.label)}">✗</button>
        ${i.kind === 'chats' || (i.kind === 'pictures' && i.ref) ? `<button type="button" class="mini" data-pin title="Never ask about this again">☆ Pin</button>` : ''}
      </span></li>`;
  }

  function draw() {
    const hk = info?.settings;
    const doing = items.filter((i) => (pick.get(i.key) || i.def) !== 'keep');
    const bytes = doing.reduce((n, i) => n + (i.bytes || 0), 0);
    const kinds = [...new Set(items.map((i) => i.kind))];
    body.innerHTML = `${msg ? `<p class="have">${esc(msg)}</p>` : ''}
      <p class="muted">${hk?.enabled ? 'Housekeeping is on.' : 'Housekeeping is off, so Bob only looks when you open this page.'} ${tip('Limits and "ask me" or "tidy automatically" are in Settings, Housekeeping. Pinned chats, pictures and topics are never touched. Everything goes to the Recycle Bin, so you can get it back.', 'Tidy up')}</p>
      ${items.length ? kinds.map((k) => `<section><h3>${esc(KIND_LABEL[k] || k)}</h3><ol class="tidy-list">${items.filter((i) => i.kind === k).map(row).join('')}</ol></section>`).join('')
        : '<p>Nothing to tidy. Everything has come up recently enough.</p>'}
      <div class="row wrap tidy-foot">
        ${items.length ? `<button type="button" class="get" data-go ${doing.length ? '' : 'disabled'}>Tidy ${doing.length} thing${doing.length === 1 ? '' : 's'}${bytes ? ` (${esc(size(bytes))})` : ''}</button><button type="button" data-allkeep>Keep everything</button>` : ''}
        <button type="button" data-rescan>Look again</button>
      </div>`;
    msg = '';
  }

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const key = b.closest('[data-key]')?.dataset.key;
    const it = items.find((i) => i.key === key);
    if ('yes' in b.dataset && it) { pick.set(key, pick.get(key) === 'keep' ? it.def : (pick.get(key) || it.def)); return draw(); }
    if ('no' in b.dataset && it) { pick.set(key, 'keep'); return draw(); }
    if ('pin' in b.dataset && it) {
      try { await api('/api/pin', { kind: it.kind === 'chats' ? 'chats' : 'pictures', id: it.ref, pinned: true }); items = items.filter((i) => i.key !== key); msg = `Pinned "${it.label}". Bob won't ask about it again.`; onCount?.(items.length); } catch (err) { msg = err.message; }
      return draw();
    }
    if ('allkeep' in b.dataset) { for (const i of items) pick.set(i.key, 'keep'); return draw(); }
    if ('rescan' in b.dataset) { pick.clear(); return load(true); }
    if ('go' in b.dataset) {
      b.disabled = true; b.textContent = 'Tidying… (chats are summed up first, which needs Bob\'s brain)';
      try {
        const r = await api('/api/hk/tidy', { choices: items.map((i) => ({ key: i.key, action: pick.get(i.key) || i.def })) });
        const done = r.results.filter((x) => x.done && x.done !== 'kept').length, kept = r.results.filter((x) => x.done === 'kept').length, bad = r.results.filter((x) => x.error);
        msg = `Done: ${done} tidied${kept ? `, ${kept} kept` : ''}.${bad.length ? ` ${bad.length} couldn't be tidied (${bad.map((x) => x.error).join('; ')}).` : ''} See the logbook for the list.`;
        items = r.items; pick.clear(); for (const i of items) pick.set(i.key, i.def);
        onCount?.(items.length);
      } catch (err) { msg = err.message; }
      draw();
    }
  });
  body.addEventListener('change', (e) => {
    const key = e.target.closest('[data-key]')?.dataset.key;
    if (key && 'action' in e.target.dataset) { pick.set(key, e.target.value); draw(); }
  });

  return {
    async open() { dlg.showModal(); body.innerHTML = '<p class="muted">Looking around…</p>'; await load(); },
    get isOpen() { return dlg.open; }
  };
}
