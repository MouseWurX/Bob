// Settings, Jobs (src/job-helps.js) in the chat window: the Stop after this step button, the time bar, the receipt
// card, a "Why not?" box on Deny, and file:line links. Each only shows while its switch is on.
import { esc } from './rich.js';

// file:line in Bob's words: C:\work\app\main.js:42, /home/me/app/src/main.py:7 (a full path, then a line number).
export const FILE_LINE = /(?<![\w/.:\\-])((?:[A-Za-z]:\\(?:[^\\\s:*?"<>|`]+\\)*[^\\\s:*?"<>|`]+\.[A-Za-z0-9]{1,8}|\/(?:[\w.@+-]+\/)+[\w.@+-]+\.[A-Za-z0-9]{1,8})):(\d{1,7})(?::\d{1,5})?/g;
export function findFileLines(text) {
  return [...String(text || '').matchAll(FILE_LINE)].map((m) => ({ at: m.index, text: m[0], file: m[1], line: Number(m[2]) }));
}

export function receiptHtml(items, { local = true } = {}) {
  const row = (i) => {
    if (i.kind === 'file') return `<li>${esc(i.what)} <code>${esc(i.path)}</code>${local ? ` <button type="button" class="mini" data-jh-open="${esc(i.path)}">Open</button>${i.undo ? ` <button type="button" class="mini" data-jh-undo="${esc(i.undo)}">Undo</button>` : ''}` : ''}</li>`;
    if (i.kind === 'command') return `<li>${esc(i.what)} <code>${esc(i.text)}</code></li>`;
    if (i.kind === 'page') return `<li>${esc(i.what)} <a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.url)}</a></li>`;
    return '';
  };
  const n = (k) => items.filter((i) => i.kind === k).length;
  const sum = [n('file') && `${n('file')} file${n('file') === 1 ? '' : 's'} changed`, n('command') && `${n('command')} command${n('command') === 1 ? '' : 's'} run`, n('page') && `${n('page')} page${n('page') === 1 ? '' : 's'} read`].filter(Boolean).join(', ');
  return `<p><strong>🧾 What this job did:</strong> ${esc(sum)}</p><ul class="receipt-list">${items.map(row).join('')}</ul>`;
}

export const clockText = (endsAt, now = Date.now()) => {
  const left = Math.max(0, endsAt - now), m = Math.ceil(left / 60000);
  return left <= 0 ? 'Time is up for this job' : m <= 1 ? 'Under a minute left for this job' : `${m} minutes left for this job`;
};

export function createJobHelps({ api, add, note, log, stopBtn, scrollDown = () => {} }) {
  let on = {};
  const refresh = () => fetch('/api/settings').then((r) => r.json()).then((st) => { on = st.jobHelps || {}; drawStopAfter(); }).catch(() => {});
  refresh();
  window.addEventListener('bob-jobhelps', (e) => { on = e.detail || {}; drawStopAfter(); }); // changed in Settings in this window

  // 52 Stop after this step: a softer button beside Stop.
  let busy = false;
  const soft = document.createElement('button');
  soft.type = 'button'; soft.className = 'stop-after'; soft.hidden = true; soft.textContent = 'Stop after this step';
  soft.title = 'Let the step running now finish, keep its result, then Bob answers with what he has';
  stopBtn?.parentNode?.insertBefore(soft, stopBtn);
  const drawStopAfter = () => { soft.hidden = !(busy && on.softStop === true); };
  soft.onclick = async () => { soft.disabled = true; try { const r = await api('/api/stop-after', {}); note(r.ok ? '⏸ He\'ll stop after the step he\'s on.' : 'Nothing to stop: he\'s not on a job with steps right now.'); } catch (e) { note(e.message, 'error'); } finally { soft.disabled = false; } };

  // 53 The time bar.
  let clock = null, tick = 0;
  const endClock = () => { clearInterval(tick); clock?.remove(); clock = null; };
  const drawClock = (startedAt, endsAt) => {
    if (!clock) { clock = document.createElement('div'); clock.className = 'job-clock'; clock.setAttribute('role', 'progressbar'); clock.innerHTML = '<span class="job-clock-bar"><span></span></span><span class="job-clock-text"></span>'; (stopBtn?.closest('form') || log).before(clock); }
    const paint = () => {
      const all = Math.max(1, endsAt - startedAt), used = Math.min(1, Math.max(0, (Date.now() - startedAt) / all));
      clock.querySelector('.job-clock-bar > span').style.width = `${Math.round(used * 100)}%`;
      clock.querySelector('.job-clock-text').textContent = clockText(endsAt);
      clock.setAttribute('aria-valuenow', String(Math.round(used * 100)));
    };
    clearInterval(tick); paint(); tick = setInterval(paint, 5000);
  };

  const wireReceipt = (el) => {
    for (const b of el.querySelectorAll('[data-jh-open]')) b.onclick = async () => { try { await api('/api/open-at', { path: b.dataset.jhOpen, line: 0 }); } catch (e) { note(e.message, 'error'); } };
    for (const b of el.querySelectorAll('[data-jh-undo]')) b.onclick = async () => {
      b.disabled = true;
      try { const r = await api('/api/jobs/undo', { id: b.dataset.jhUndo }); b.replaceWith(Object.assign(document.createElement('span'), { className: 'muted', textContent: r.restored ? 'Put back' : 'Moved to my backups' })); }
      catch (e) { b.disabled = false; note(e.message, 'error'); }
    };
  };

  return {
    refresh,
    busy(b) { busy = b; drawStopAfter(); if (!b) endClock(); },
    // The events this module draws; true when it drew one.
    event(ev) {
      if (ev.type === 'job-clock') { if (ev.done) endClock(); else if (ev.endsAt) drawClock(ev.startedAt, ev.endsAt); return true; }
      if (ev.type === 'receipt' && Array.isArray(ev.items) && ev.items.length) { const el = add('note receipt', receiptHtml(ev.items)); wireReceipt(el); scrollDown(); return true; }
      return false;
    },
    // 57 Remember a "no": a "Why not?" box on a plain OK card, sent with Deny.
    whyBox: () => (on.rememberNo === true ? '<input type="text" class="why-not" maxlength="200" placeholder="Why not? (optional, I\'ll remember for this chat)" aria-label="Why not? (optional)">' : ''),
    // 61 file:line links in one of Bob's messages.
    links(el) {
      if (on.fileLinks !== true || !el) return;
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest('a, pre, button, textarea, .msg-tools') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      const nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode);
      for (const n of nodes) {
        const hits = findFileLines(n.nodeValue);
        if (!hits.length) continue;
        const frag = document.createDocumentFragment(); let at = 0;
        for (const h of hits) {
          frag.append(n.nodeValue.slice(at, h.at));
          const a = document.createElement('a'); a.href = '#'; a.className = 'file-line'; a.textContent = h.text; a.title = `Open ${h.file} at line ${h.line}`;
          a.onclick = async (e) => { e.preventDefault(); try { await api('/api/open-at', { path: h.file, line: h.line }); } catch (err) { note(err.message, 'error'); } };
          frag.append(a); at = h.at + h.text.length;
        }
        frag.append(n.nodeValue.slice(at));
        n.replaceWith(frag);
      }
    }
  };
}
