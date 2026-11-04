// Topics: Bob's glossary of what's been talked about, grouped by project, with a note on where each one landed.
// Also past chats (open, pin) and one search box over chats, summaries, topics, pictures and notes.
// Drag a message onto another topic to move it. Forget a topic with a preview first.
import { esc } from './rich.js';
import { tip } from './tips.js';

const $ = (id) => document.getElementById(id);
const day = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const UNITS = ['days', 'weeks', 'months'];

export function createTopics({ api, openChat }) {
  const dlg = $('topics'), body = $('topics-body');
  $('topics-close').onclick = () => dlg.close();
  let tab = 'topics', topics = [], open = new Set(), q = '', timer = null, msg = '';

  async function load() {
    try { topics = await api('/api/topics'); } catch (e) { topics = []; msg = e.message; }
    draw();
  }

  function head() {
    return `<div class="topics-top"><input id="topics-q" type="search" placeholder="Search chats, topics, pictures and notes" value="${esc(q)}" aria-label="Search">
      <div class="tabs" role="tablist">${[['topics', 'Topics'], ['chats', 'Past chats']].map(([k, l]) => `<button type="button" role="tab" data-ttab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div></div>
      ${msg ? `<p class="have">${esc(msg)}</p>` : ''}`;
  }

  function topicCard(t) {
    const isOpen = open.has(t.id);
    const others = topics.filter((x) => x.id !== t.id);
    return `<article class="topic${t.pinned ? ' pinned' : ''}" data-topic="${esc(t.id)}">
      <header><button type="button" class="link topic-name" data-expand aria-expanded="${isOpen}">${isOpen ? '▾' : '▸'} ${esc(t.name)}</button>
        <span class="muted">${t.lastSeen ? `last talked about ${esc(day(t.lastSeen))}` : ''}${t.messages ? ` · ${t.messages} message${t.messages === 1 ? '' : 's'}` : ''}${t.fade ? ` · fades after ${t.fade.n} ${esc(t.fade.unit)} unused` : ''}</span>
        <button type="button" class="mini" data-tpin aria-pressed="${t.pinned}" title="${t.pinned ? 'Pinned: housekeeping never touches it' : 'Pin: housekeeping never touches it'}">${t.pinned ? '★ Pinned' : '☆ Pin'}</button></header>
      <p class="topic-line">${esc(t.summary || (t.note || '').slice(0, 140) || 'No note yet.')}</p>
      ${isOpen ? `<div class="topic-more">
        <label class="wide"><strong>Where we landed</strong> ${tip('Yours to edit. This is what survives tidying.', 'Where we landed')}<textarea data-note rows="4" maxlength="1500">${esc(t.note || '')}</textarea></label>
        ${t.suggested ? `<div class="suggest-note"><span class="muted">Bob's update (not applied, since you edited the note):</span> ${esc(t.suggested.note || t.suggested.summary)} <button type="button" class="mini" data-accept>Use Bob's update</button></div>` : ''}
        ${(t.open || []).length ? `<div><strong>Still open</strong><ul>${t.open.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
        ${(t.pics || []).length ? `<div class="topic-pics">${t.pics.slice(0, 12).map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>` : ''}
        <div class="row wrap">
          <button type="button" data-savenote>Save note</button>
          <button type="button" data-rename>Rename…</button>
          <label class="pick">Move into <select data-merge><option value="">another topic…</option>${others.map((o) => `<option value="${esc(o.id)}">${esc((o.project ? o.project + ' > ' : '') + o.name)}</option>`).join('')}</select></label>
          <label class="pick">Forget after <select data-fade><option value="">never</option>${[1, 2, 3, 6].flatMap((n) => UNITS.map((u) => `<option value="${n} ${u}" ${t.fade && t.fade.n === n && t.fade.unit === u ? 'selected' : ''}>${n} ${u}</option>`)).join('')}</select> unused</label>
          <button type="button" data-forget>Forget…</button>
        </div>
        <div class="forget-box" hidden></div>
        <div><strong>Where it came up</strong> ${tip('Drag a message onto another topic to move it.', 'Where it came up')}<ol class="topic-msgs" data-msgs><li class="muted">Loading…</li></ol></div>
      </div>` : ''}
    </article>`;
  }

  function topicsHtml() {
    if (!topics.length) return `<p class="muted">No topics yet. Bob files what you talk about under topics while he's idle, once Housekeeping is on (Settings, Show advanced settings). You can also do it now.</p><button type="button" data-runnow>Sort my chats into topics now</button>`;
    const groups = new Map();
    for (const t of topics) { const k = t.project || 'Other'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
    return `<p class="muted">What you and Bob have talked about, by project. ${topics.length} topic${topics.length === 1 ? '' : 's'}. <button type="button" class="link" data-runnow>Refresh now</button></p>
      ${[...groups].map(([g, list]) => `<section class="topic-group"><h3>${esc(g)}</h3>${list.map(topicCard).join('')}</section>`).join('')}`;
  }

  async function chatsHtml() {
    let d = { chats: [], tidied: [] };
    try { d = await api('/api/chats'); } catch {}
    return `<ol class="chat-list">${d.chats.map((c) => `<li data-chat="${esc(c.id)}"><div><strong>${esc(c.title)}</strong><br><span class="muted">${c.messages} messages · last talked ${esc(day(c.lastTouched))}</span>${c.summary ? `<br><span class="muted">${esc(c.summary.slice(0, 200))}</span>` : ''}</div>
        <span class="row"><button type="button" class="mini" data-openchat>Open</button><button type="button" class="mini" data-cpin aria-pressed="${c.pinned}">${c.pinned ? '★ Pinned' : '☆ Pin'}</button></span></li>`).join('') || '<li class="muted">No chats yet.</li>'}</ol>
      ${d.tidied.length ? `<h3>Tidied away</h3><p class="muted">These chats went to the Recycle Bin; their summaries stay here.</p><ol class="chat-list">${d.tidied.map((s) => `<li><div><strong>${esc(s.title)}</strong> <span class="muted">${esc(day(s.from))} to ${esc(day(s.to))}</span><br>${esc(s.summary)}</div></li>`).join('')}</ol>` : ''}`;
  }

  async function searchHtml() {
    let r = [];
    try { r = await api('/api/search?q=' + encodeURIComponent(q)); } catch {}
    const label = { topic: 'Topic', summary: 'Chat summary', chat: 'Chat', removed: 'Tidied chat', file: 'Made by Bob', note: 'Notes' };
    return `<ol class="search-hits">${r.map((h) => `<li ${h.type === 'chat' || h.type === 'summary' ? `data-chat="${esc(h.session)}"` : h.type === 'topic' ? `data-hit-topic="${esc(h.id)}"` : ''}>
      <span class="tag">${esc(label[h.type] || h.type)}</span> <strong>${esc(h.title)}</strong>${h.who ? ` <span class="muted">(${esc(h.who)}${h.at ? ', ' + esc(day(h.at)) : ''})</span>` : ''}
      ${h.snippet ? `<div class="muted">${esc(h.snippet)}</div>` : ''}${h.url ? `<a href="${esc(h.url)}" target="_blank" rel="noopener"><img src="${esc(h.url)}" alt="" loading="lazy" class="hit-thumb" onerror="this.remove()"></a>` : ''}
      ${h.type === 'chat' || h.type === 'summary' ? '<button type="button" class="mini" data-openchat>Open chat</button>' : ''}</li>`).join('') || '<li class="muted">Nothing found.</li>'}</ol>`;
  }

  async function draw() {
    const focus = document.activeElement?.id === 'topics-q';
    const pos = focus ? document.activeElement.selectionStart : 0;
    let main;
    if (q.trim().length > 1) main = await searchHtml();
    else main = tab === 'chats' ? await chatsHtml() : topicsHtml();
    body.innerHTML = head() + `<div class="topics-main">${main}</div>`;
    msg = '';
    if (focus) { const i = $('topics-q'); i.focus(); i.setSelectionRange(pos, pos); }
    for (const id of open) fillMessages(id);
  }

  async function fillMessages(id) {
    const ol = body.querySelector(`[data-topic="${CSS.escape(id)}"] [data-msgs]`);
    if (!ol) return;
    let list = [];
    try { list = await api('/api/topics/messages?id=' + encodeURIComponent(id)); } catch {}
    ol.innerHTML = list.map((m) => `<li draggable="true" data-session="${esc(m.session)}" data-mid="${esc(m.msgId)}"><span class="grip" aria-hidden="true">⋮⋮</span>
      <span><span class="muted">${m.role === 'user' ? 'You' : 'Bob'}, ${esc(day(m.at))}, in "${esc(m.chat)}":</span> ${esc(m.text)}</span>
      <span class="row"><button type="button" class="mini" data-openchat data-chat="${esc(m.session)}">Open chat</button><select class="mini" data-moveto aria-label="Move to topic"><option value="">Move to…</option>${topics.filter((t) => t.id !== id).map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></span></li>`).join('') || '<li class="muted">No chat messages left (the chats were tidied or forgotten; the note stays).</li>';
  }

  async function act(url, data, done) {
    try { const r = await api(url, data); if (done) msg = done; await load(); return r; } catch (e) { msg = e.message; draw(); return null; }
  }

  body.addEventListener('input', (e) => {
    if (e.target.id !== 'topics-q') return;
    q = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(draw, 250);
  });

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button, [data-hit-topic]');
    if (!b) return;
    const card = b.closest('[data-topic]'), id = card?.dataset.topic;
    const t = topics.find((x) => x.id === id);
    if (b.dataset.ttab) { tab = b.dataset.ttab; q = ''; return draw(); }
    if (b.dataset.hitTopic) { q = ''; tab = 'topics'; open.add(b.dataset.hitTopic); return draw(); }
    if ('openchat' in b.dataset) { const sid = b.dataset.chat || b.closest('[data-chat]')?.dataset.chat; const mid = b.closest('[data-mid]')?.dataset.mid; if (sid) { dlg.close(); openChat(sid, mid); } return; }
    if ('cpin' in b.dataset) { const sid = b.closest('[data-chat]').dataset.chat; await act('/api/pin', { kind: 'chats', id: sid, pinned: b.getAttribute('aria-pressed') !== 'true' }); return; }
    if ('runnow' in b.dataset) { const r = await act('/api/hk/run', {}); msg = r?.busy ? 'Bob is already on it.' : 'Bob is sorting your chats into topics. This page fills in as he goes (it can take a few minutes; he needs his brain loaded).'; return draw(); }
    if (!t) return;
    if ('expand' in b.dataset) { open.has(id) ? open.delete(id) : open.add(id); return draw(); }
    if ('tpin' in b.dataset) return act('/api/topics/pin', { id, pinned: !t.pinned });
    if ('savenote' in b.dataset) return act('/api/topics/edit', { id, note: card.querySelector('[data-note]').value }, 'Saved. Bob keeps your words; his own updates show up as a suggestion.');
    if ('accept' in b.dataset) return act('/api/topics/accept', { id });
    if ('rename' in b.dataset) {
      const box = card.querySelector('.forget-box');
      box.hidden = false;
      box.innerHTML = `<div class="row wrap"><label class="pick">Name <input data-newname maxlength="80" value="${esc(t.name)}"></label><label class="pick">Project <input data-newproject maxlength="60" value="${esc(t.project || '')}" placeholder="Starfall, Bob, Home…"></label><button type="button" class="get" data-dorename>Save</button><button type="button" data-cancel>Cancel</button></div>`;
      return;
    }
    if ('dorename' in b.dataset) return act('/api/topics/rename', { id, name: card.querySelector('[data-newname]').value, project: card.querySelector('[data-newproject]').value }, 'Renamed.');
    if ('cancel' in b.dataset) { const box = card.querySelector('.forget-box'); box.hidden = true; box.innerHTML = ''; return; }
    if ('forget' in b.dataset) return showForget(card, id);
    if ('doforget' in b.dataset) {
      const mode = card.querySelector('input[name="fmode"]:checked')?.value || 'note';
      const pictures = card.querySelector('[data-fpics]')?.checked === true;
      const r = await act('/api/topics/forget', { id, mode, pictures });
      if (r) { msg = `Forgot ${r.messages} message${r.messages === 1 ? '' : 's'}${r.keptNote ? '; the note stays' : ''}${r.pictures ? `, ${r.pictures} picture${r.pictures === 1 ? '' : 's'}` : ''}. The chats as they were are in the Recycle Bin.`; if (!r.keptNote) open.delete(id); draw(); }
    }
  });

  async function showForget(card, id) {
    const box = card.querySelector('.forget-box');
    box.hidden = false;
    box.innerHTML = '<p class="muted">Looking…</p>';
    const draw1 = async (mode) => {
      let pv;
      try { pv = await api(`/api/topics/forget-preview?id=${encodeURIComponent(id)}&mode=${mode}`); } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
      box.innerHTML = `<div class="confirm"><p><strong>Forget "${esc(pv.topic.name)}"?</strong> ${pv.messages} message${pv.messages === 1 ? '' : 's'} in ${pv.chats.length} chat${pv.chats.length === 1 ? '' : 's'} become "[forgotten]".</p>
        ${pv.chats.map((c) => `<p class="muted">${c.count} in one chat, like: ${c.sample.map((x) => `"${esc(x)}"`).join(', ')}</p>`).join('')}
        <label><input type="radio" name="fmode" value="note" ${mode === 'note' ? 'checked' : ''}> Keep the short note (where we landed), forget the chat parts</label><br>
        <label><input type="radio" name="fmode" value="all" ${mode === 'all' ? 'checked' : ''}> Forget everything, note too${pv.memory.length ? ` and ${pv.memory.length} line${pv.memory.length === 1 ? '' : 's'} in Bob's memory` : ''}</label>
        ${pv.memory.length ? `<ul class="muted">${pv.memory.slice(0, 6).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        ${pv.pictures.length ? `<p><label><input type="checkbox" data-fpics> Also the ${pv.pictures.length} picture${pv.pictures.length === 1 ? '' : 's'} made only for this topic</label></p><div class="topic-pics">${pv.pictures.slice(0, 8).map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>` : ''}
        <p class="muted">The chats as they are now go to the Recycle Bin first, so you can get them back.</p>
        <div class="row"><button type="button" class="get" data-doforget>Forget</button><button type="button" data-cancel>Keep it</button></div></div>`;
      for (const r of box.querySelectorAll('input[name="fmode"]')) r.onchange = () => draw1(r.value);
    };
    draw1('note');
  }

  body.addEventListener('change', async (e) => {
    const el = e.target, card = el.closest('[data-topic]'), id = card?.dataset.topic;
    if ('merge' in el.dataset && el.value) return act('/api/topics/merge', { id, into: el.value }, 'Merged.');
    if ('fade' in el.dataset) { const [n, unit] = el.value.split(' '); return act('/api/topics/fade', { id, after: el.value ? { n: Number(n), unit } : null }, el.value ? `Bob will ask to forget it after ${el.value} unused (housekeeping on).` : 'It stays.'); }
    if ('moveto' in el.dataset && el.value) { const li = el.closest('[data-mid]'); return act('/api/topics/move', { session: li.dataset.session, msgId: li.dataset.mid, to: el.value }, 'Moved.'); }
  });

  // Drag a message onto another topic.
  body.addEventListener('dragstart', (e) => {
    const li = e.target.closest?.('[data-mid]');
    if (!li) return;
    e.dataTransfer.setData('text/plain', JSON.stringify({ session: li.dataset.session, msgId: li.dataset.mid }));
    e.dataTransfer.effectAllowed = 'move';
  });
  body.addEventListener('dragover', (e) => { const c = e.target.closest?.('[data-topic]'); if (c) { e.preventDefault(); c.classList.add('drop'); } });
  body.addEventListener('dragleave', (e) => { e.target.closest?.('[data-topic]')?.classList.remove('drop'); });
  body.addEventListener('drop', async (e) => {
    const c = e.target.closest?.('[data-topic]');
    if (!c) return;
    e.preventDefault();
    c.classList.remove('drop');
    let d = null;
    try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch {}
    if (d?.msgId) await act('/api/topics/move', { ...d, to: c.dataset.topic }, 'Moved.');
  });

  return {
    async open(which) { if (which) tab = which; dlg.showModal(); body.innerHTML = '<p class="muted">Loading…</p>'; await load(); $('topics-q')?.focus(); },
    refresh() { if (dlg.open) load(); }
  };
}
