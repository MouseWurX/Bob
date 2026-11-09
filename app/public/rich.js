// Turning Bob's replies into HTML: code, bold, italics, clickable links (with a Copy link button next to each,
// since right-click and Ctrl+C often don't get through a remote-desktop connection), and clickable file
// mentions (paths, inn\... paths, /images/ links and the names of things he made) that get a preview card.
// Pure functions, no DOM, so the tests can run them.
import { esc } from './util.js';
export { esc }; // kept for the files that import it from here

const BAD = '\\\\/:*?"<>|\\r\\n`';
const SEG = `[^${BAD}]+`;
const END = '(?=$|[\\s"\'`),;:!?\\]]|\\.(?:\\s|$))';
const ABS = new RegExp(`[A-Za-z]:\\\\(?:${SEG}\\\\)*${SEG}?\\.[A-Za-z0-9]{1,5}${END}`, 'g');
const INN = new RegExp(`(?<![\\w\\\\/])inn[\\\\/](?:${SEG}[\\\\/])*${SEG}?\\.[A-Za-z0-9]{1,5}${END}`, 'gi');
const IMG = /(?<![\w/])\/images\/[^\s<>"'`)]+/g;
const MEDIA = /(?<![\w\\/.:-])[\w-]+\.(?:png|jpe?g|webp|gif|mp4|webm|mov|wav|mp3|ogg|flac|m4a)\b/gi;
const MDLINK = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;
const URL = /https?:\/\/[^\s<>"'`]+/g;

// Trailing punctuation belongs to the sentence, not the link (a ")" stays when the link opened one).
export function trimUrl(u) {
  let tail = '';
  for (;;) {
    const last = u.slice(-1);
    if (/[.,;:!?'"\]]/.test(last) || (last === ')' && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length)) { tail = last + tail; u = u.slice(0, -1); } else break;
  }
  return [u, tail];
}

const linkHtml = (url, text = url) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a><button type="button" class="mini" data-copy-link="${esc(url)}" title="Copy link" aria-label="Copy link">⧉</button>`;
const fileHtml = (raw) => `<a href="#" class="file-link" data-file="${esc(raw)}" title="Open">${esc(raw)}</a>`;

// Swaps links and file mentions in plain text for placeholders, so escaping and the inline markup can't break them.
function protect(text, keep, files) {
  const put = (html) => `\u0001${keep.push(html) - 1}\u0002`;
  let s = text.replace(MDLINK, (m, label, url) => put(linkHtml(url, label)));
  s = s.replace(URL, (m) => { const [u, tail] = trimUrl(m); return put(linkHtml(u)) + tail; });
  for (const re of [ABS, INN, IMG, MEDIA]) {
    s = s.replace(re, (m) => {
      const [f, tail] = re === IMG ? trimUrl(m) : [m, ''];
      files.push(f);
      return put(fileHtml(f)) + tail;
    });
  }
  return s;
}
const restore = (s, keep) => s.replace(/\u0001(\d+)\u0002/g, (m, i) => keep[Number(i)] ?? '');

// Returns { html, files }: files are the mentions in the order they appear (no repeats).
export function renderRich(md) {
  const files = [];
  const parts = String(md ?? '').split(/```(?:[\w+-]*)\n?([\s\S]*?)(?:```|$)/g);
  const html = parts.map((p, i) => {
    if (i % 2 === 1) return `<pre><button type="button" class="mini copy-code" data-copy-code title="Copy this code">Copy</button><code>${esc(p)}</code></pre>`;
    const keep = [];
    const s = esc(protect(p, keep, files)) // the placeholders survive escaping
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return restore(s, keep);
  }).join('');
  return { html, files: [...new Set(files)] };
}

export const render = (md) => renderRich(md).html;
export const fileMentions = (md) => renderRich(md).files;

export function size(n) {
  if (!n) return '';
  return n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} bytes`;
}

// The card under a message for each file it mentions. shown: URLs already in the message (no second copy).
export function fileCard(f, shown = new Set()) {
  if (!f.ok) return '';
  const tools = `<span class="file-tools">${f.canOpen ? `<button type="button" class="mini" data-open="${esc(f.mention)}">Open</button>` : ''}<button type="button" class="mini" data-reveal="${esc(f.mention)}">Show in folder</button>${f.path ? `<button type="button" class="mini" data-copy-path="${esc(f.path)}">Copy path</button>` : ''}</span>`;
  const head = `<div class="file-head"><strong>${esc(f.name)}</strong> <span class="muted">${esc(size(f.bytes))}</span>${tools}</div>`;
  if (f.kind === 'image') return `<div class="file-card">${shown.has(f.url) ? '' : `<img src="${esc(f.url)}" alt="${esc(f.name)}" loading="lazy">`}${head}</div>`;
  if (f.kind === 'audio') return `<div class="file-card">${shown.has(f.url) ? '' : `<audio src="${esc(f.url)}" controls preload="none"></audio>`}${head}</div>`;
  if (f.kind === 'video') return `<div class="file-card">${shown.has(f.url) ? '' : `<video src="${esc(f.url)}" controls muted loop preload="metadata"></video>`}${head}</div>`;
  return `<div class="file-card">${head}</div>`;
}
