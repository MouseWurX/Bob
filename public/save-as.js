// 1.5.95 Diagrams in the chat, and the Save as row under everything Bob makes.
// Diagrams are drawn here with Mermaid (diagram-core.js). The Save as row keeps a picture, clip, song, sound or diagram
// in another file type: pictures, clips and sounds are converted by Bob (/api/save-as), diagrams are made into files
// right here and sent to Bob to keep (/api/diagram/save). The original always stays.
import './diagram-core.js';
import { esc } from './rich.js';

const D = globalThis.BobDiagram;
// The types offered for each kind, and what each is good for (shown on hover). Same lists as src/save-as.js.
export const SAVE_AS = { image: ['png', 'jpg', 'webp', 'gif'], video: ['mp4', 'webm', 'gif'], audio: ['wav', 'mp3', 'ogg', 'flac'], diagram: ['png', 'svg', 'pdf'] };
const NOTE = { png: 'sharp, no quality lost', jpg: 'small, for photos', webp: 'small, for the web', gif: 'plays anywhere, low colour', mp4: 'plays anywhere', webm: 'small, for the web', wav: 'full quality, large', mp3: 'small, plays anywhere', ogg: 'small, open format', flac: 'full quality, smaller than WAV', svg: 'scales to any size', pdf: 'for printing and sharing' };
const extOf = (n) => String(n || '').split('.').pop().toLowerCase().replace('jpeg', 'jpg');
const nameOf = (m) => m.name || decodeURIComponent(String(m.url || '').split('/').pop() || '');

export function diagramHtml(m) {
  const name = nameOf(m);
  return `<figure class="diagram" data-diagram="${esc(m.url)}" data-diagram-name="${esc(name)}"${m.format ? ` data-format="${esc(m.format)}"` : ''}>${m.title ? `<figcaption>${esc(m.title)}</figcaption>` : ''}<div class="diagram-art"><span class="muted">Drawing the diagram...</span></div></figure>`;
}

// One row per thing made: "Save as  PNG  JPG  WebP  GIF". The type it already is shows as kept.
export function saveRowsHtml(items) {
  return (items || []).filter((m) => SAVE_AS[m.kind] && m.url).map((m) => {
    const name = nameOf(m);
    const have = m.kind === 'diagram' ? '' : extOf(name);
    const what = m.kind === 'diagram' ? (m.title || 'the diagram') : name;
    // Settings review: the type it already is reads "WAV · original" (no tick, not a button); ✓ is only for copies saved.
    const label = (f) => (f === 'webp' ? 'WebP' : f.toUpperCase());
    const btns = SAVE_AS[m.kind].map((f) => (f === have
      ? `<span class="save-have">${label(f)} · original</span>`
      : `<button type="button" class="mini" data-save-as="${f}" title="${esc(NOTE[f])}" aria-label="Save as ${label(f)}: ${esc(NOTE[f])}">${label(f)}</button>`)).join('');
    return `<div class="save-as" data-save-name="${esc(name)}" data-save-kind="${esc(m.kind)}" aria-label="Save ${esc(what)} as another file type"><span class="save-label">Save as</span>${btns}</div>`;
  }).join('');
}

let offerFn = null, noteFn = null, madeFn = null;
// app.js passes how to show a Set it up card (FFmpeg missing), a note, and the side panel's list.
export function setupSaveAs({ offer, note, made }) { offerFn = offer; noteFn = note; madeFn = made; }

const post = async (url, data) => (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) })).json().catch(() => ({ ok: false, why: 'Bob didn\'t answer.' }));

function savedChip(btn, r, fmt) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'mini save-done'; b.textContent = `✓ ${fmt === 'webp' ? 'WebP' : fmt.toUpperCase()}`;
  b.title = `Saved: ${r.file || r.name}. Open it in the side panel.`;
  b.setAttribute('aria-label', `${b.textContent} saved. Open it in the side panel.`);
  Object.assign(b.dataset, { view: '', viewUrl: r.url, viewKind: r.kind || '', viewName: r.name, viewPath: r.file || '' });
  btn.replaceWith(b);
  madeFn?.([{ kind: r.kind, url: r.url, name: r.name, path: r.file }]);
}

// The drawing of a diagram on screen, as an SVG file.
function drawnSvg(name) {
  const fig = [...document.querySelectorAll('figure.diagram')].find((f) => f.dataset.diagramName === name);
  const svg = fig?.querySelector('.diagram-art svg');
  return svg ? D.svgFile(svg) : null;
}

async function saveDiagram(name, fmt) {
  const svg = drawnSvg(name);
  if (!svg) throw new Error('The diagram isn\'t drawn on screen, so it can\'t be saved from here.');
  const data = fmt === 'svg' ? btoa(unescape(encodeURIComponent(svg))) : fmt === 'png' ? await D.pngData(svg) : await D.pdfData(svg);
  return post('/api/diagram/save', { name, format: fmt, data });
}

async function onSave(btn) {
  const row = btn.closest('.save-as');
  const fmt = btn.dataset.saveAs, name = row.dataset.saveName, kind = row.dataset.saveKind;
  btn.disabled = true;
  const was = btn.textContent;
  btn.textContent = 'Saving...';
  try {
    const r = kind === 'diagram' ? await saveDiagram(name, fmt) : await post('/api/save-as', { name, format: fmt });
    if (r.ok) return savedChip(btn, r, fmt);
    btn.disabled = false; btn.textContent = was;
    if (r.need === 'ffmpeg' && r.offer) return offerFn?.(r.offer);
    noteFn?.(r.why || 'That didn\'t save.', 'error');
  } catch (e) { btn.disabled = false; btn.textContent = was; noteFn?.(e.message, 'error'); }
}

// Draw every diagram in this part of the page that isn't drawn yet. A type named in the ask is saved once drawn.
async function drawOne(fig) {
  if (fig.dataset.drawn) return;
  fig.dataset.drawn = '1';
  const art = fig.querySelector('.diagram-art');
  let text = '';
  try {
    text = await (await fetch(fig.dataset.diagram)).text();
    art.innerHTML = await D.draw('/vendor/', text);
  } catch (e) {
    art.innerHTML = `<p class="muted">I couldn't draw this one${e?.message ? `: ${esc(String(e.message).split('\n')[0].slice(0, 200))}` : ''}. Ask me to fix the diagram and I'll redo it.</p>${text ? `<details><summary>The diagram's text</summary><pre><code>${esc(text)}</code></pre></details>` : ''}`;
    fig.closest('.reply-media, .msg')?.querySelectorAll(`.save-as[data-save-name="${CSS.escape(fig.dataset.diagramName)}"]`).forEach((r) => r.remove());
    return;
  }
  const fmt = fig.dataset.format;
  if (!fmt) return;
  const key = `bob-diagram-saved:${fig.dataset.diagramName}.${fmt}`;
  try { if (localStorage.getItem(key)) return; } catch {}
  const btn = document.querySelector(`.save-as[data-save-name="${CSS.escape(fig.dataset.diagramName)}"] [data-save-as="${fmt}"]`);
  if (btn) { await onSave(btn); try { localStorage.setItem(key, '1'); } catch {} }
}

// Watches the chat: new diagrams get drawn, Save as buttons work. Call once with the chat log.
export function watchSaveAs(log) {
  const scan = (root) => root.querySelectorAll?.('figure.diagram:not([data-drawn])').forEach(drawOne);
  scan(log);
  new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('figure.diagram')) drawOne(n); else scan(n); } }).observe(log, { childList: true, subtree: true });
  log.addEventListener('click', (e) => { const b = e.target.closest('[data-save-as]'); if (b) { e.preventDefault(); onSave(b); } });
}
