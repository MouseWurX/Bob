// The chat: the buttons under each message (copy, file cards) and copying text out of it. Split out of app.js.
import { renderRich } from './rich.js';
import { fillPeeks, outCard } from './viewer.js';

// now() hands over app.js's own values as they are at the moment of each call; fresh() copies them in.
export function createCopyParts(now) {
  let api, jobHelps, post, rawText;
  const fresh = () => { ({ api, jobHelps, post, rawText } = now()); };
function decorate(el, text, media = []) {
  if (!el || el.querySelector(':scope > .msg-tools')) return el;
  rawText.set(el, text || '');
  if (el.classList.contains('bob')) jobHelps.links(el); // Settings, Jobs: file:line links open the editor there
  const { files } = renderRich(text || '');
  const made = (media || []).map((m) => m.url).filter((u) => typeof u === 'string' && u.startsWith('/images/'));
  for (const v of el.querySelectorAll('img[src^="/images/"], audio[src^="/images/"], video[src^="/images/"]')) made.push(v.getAttribute('src'));
  const links = [...el.querySelectorAll('a[href^="http"]')].length;
  const tools = document.createElement('div');
  tools.className = 'msg-tools';
  el.appendChild(tools); // Try again, Edit, Copy and Delete are in the ... menu (msgMenu below)
  el.insertAdjacentHTML('beforeend', '<button type="button" class="msg-more" data-msg-more aria-haspopup="menu" aria-expanded="false" aria-label="Message menu: Try again, Edit, Copy, Delete" title="Try again, Edit, Copy, Delete">…</button>');
  fillPeeks(el);
  const want = [...new Set([...files, ...made])];
  if (want.length && el.classList.contains('bob')) {
    api('/api/file/info', { paths: want }).then((list) => {
      const shown = new Set([...el.querySelectorAll('img[src], audio[src], video[src]')].map((x) => x.getAttribute('src')).concat([...el.querySelectorAll('[data-view-url]')].map((x) => x.dataset.viewUrl)));
      // A painted picture already in the message is the same file as /api/file?path=...; match by name too.
      const shownNames = new Set([...shown].filter((u) => u.startsWith('/images/')).map((u) => decodeURIComponent(u.slice(8))));
      // Every file he mentions gets the same card as things he made: a preview, and View opens the side panel.
      const html = list.filter((f) => f.ok && !shown.has(f.url) && !shownNames.has(f.name)).map((f) => outCard({ ...f, kind: f.kind === 'text' ? 'document' : f.kind, mention: f.mention })).join('');
      if (html) { const box = document.createElement('div'); box.className = 'file-cards'; box.innerHTML = html; el.insertBefore(box, tools); fillPeeks(box); }
      for (const a of el.querySelectorAll('a.file-link')) { const f = list.find((x) => x.mention === a.dataset.file); if (!f?.ok) a.classList.add('gone'), a.title = f?.missing ? 'Not there any more' : 'Outside the folders Bob may open'; }
    }).catch(() => {});
  }
  return el;
}
// A message with formulas copies as the brain wrote it (the LaTeX), which pastes cleanly anywhere.
const copyWords = (msg) => (msg.querySelector('.katex') ? rawText.get(msg) : '') || plainText(msg) || rawText.get(msg) || '';
function plainText(el) {
  const c = el.cloneNode(true);
  for (const x of c.querySelectorAll('.msg-tools, .mini, .file-cards, .qtag, .msg-more, .msg-menu')) x.remove();
  return c.innerText.trim();
}
async function copyText(text, btn) {
  let ok = false;
  try { ok = (await post('/api/clipboard', { text })).data.ok === true; } catch {}
  if (!ok) { try { await navigator.clipboard.writeText(text); ok = true; } catch {} }
  if (!ok) {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch {} t.remove();
  }
  if (btn) { const was = btn.textContent; btn.textContent = ok ? 'Copied' : 'Couldn\'t copy'; btn.classList.add('done'); setTimeout(() => { btn.textContent = was; btn.classList.remove('done'); }, 1400); }
  return ok;
}
  return {
    decorate: (...a) => { fresh(); return decorate(...a); },
    copyWords: (...a) => { fresh(); return copyWords(...a); },
    plainText: (...a) => { fresh(); return plainText(...a); },
    copyText: (...a) => { fresh(); return copyText(...a); }
  };
}
