// "Export and import chats" (Settings, How Bob works; off unless turned on).
// Save: one chat as Markdown (reads anywhere), JSON (everything, for another program or for bringing back in) or PDF
// (for printing and sharing). Bring in: a file another assistant exported (ChatGPT, Claude, Open WebUI), a chat Bob
// saved, or a "Name: line" transcript becomes chats of their own in Past chats. The readers are the lesson builder's
// (lab-build-read.js conversationsOf), so the Lab and Past chats understand the same files. Nothing goes online.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { wholeChat, chatTitle, spoken, said, chatFile, writeChat, writeOlder, newMsgId, chatIds } from './chats.js';
import { conversationsOf } from './lab-build-read.js';
import { scrubber } from './help-bundle.js';

export const chatFilesOn = (cfg) => cfg?.chatFiles === true;
export const CHAT_FILES_OFF = 'Saving and bringing in chats is off. Turn on "Export and import chats" in Settings, How Bob works.';
export const FORMATS = { md: 'Markdown', json: 'JSON', pdf: 'PDF' };
export const SOURCES = { chatgpt: 'ChatGPT', claude: 'Claude', openwebui: 'Open WebUI', bob: 'Bob', transcript: 'a transcript' };
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024; // a big ChatGPT export; bigger is refused before it's read
export const MAX_CHATS = 2000; // conversations listed from one file
const RECENT = 40; // the recent part Bob reads every turn (chats.js); the rest goes to the older part

const pad = (n) => String(n).padStart(2, '0');
const stamp = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const day = (ms) => stamp(ms).slice(0, 10);

// What a chat says, oldest first: { role, at, text, media }. Tool calls, tool results and forgotten lines are left out.
export function chatForSaving(cfg, id) {
  const all = wholeChat(cfg, id);
  const msgs = spoken(all).filter((m) => !m.forgotten).map((m) => ({ role: m.role, at: m.at || 0, text: said(m), ...(m.media?.length ? { media: m.media.map((x) => ({ kind: x.kind, name: x.name || decodeURIComponent(String(x.url || '').split('/').pop() || '') })) } : {}) }));
  return { id, title: chatTitle(all), messages: msgs };
}

// A file name that's safe on Windows, Mac, Linux and Android: "Bob chat - title - 2026-11-11.md".
export function fileNameFor(chat, ext, now = Date.now()) {
  const t = String(chat.title || 'chat').normalize('NFKD').replace(/[^\w .,'()-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50).replace(/[ .]+$/, '') || 'chat';
  return `Bob chat - ${t} - ${day(now)}.${ext}`;
}

export function toMarkdown(chat, now = Date.now()) {
  const lines = [`# ${chat.title.replace(/\n/g, ' ')}`, '', `_Saved from Bob on ${stamp(now)}. ${chat.messages.length} message${chat.messages.length === 1 ? '' : 's'}._`, ''];
  for (const m of chat.messages) {
    lines.push('---', '', `### ${m.role === 'user' ? 'You' : 'Bob'}${m.at ? ` · ${stamp(m.at)}` : ''}`, '', m.text.trim());
    for (const x of m.media || []) lines.push('', `_(${x.kind || 'file'}: ${x.name})_`);
    lines.push('');
  }
  return lines.join('\n');
}

export function toJson(chat, now = Date.now()) {
  return JSON.stringify({ bob: 'chat', version: 1, title: chat.title, saved: new Date(now).toISOString(), started: chat.messages[0]?.at ? new Date(chat.messages[0].at).toISOString() : null,
    messages: chat.messages.map((m) => ({ role: m.role, at: m.at ? new Date(m.at).toISOString() : null, content: m.text, ...(m.media ? { media: m.media } : {}) })) }, null, 2);
}

// ---- PDF: plain pages of text, made here with nothing installed ----
// The PDF's own Helvetica, so every reader has the font. It can write Western European letters and the usual
// punctuation; emoji are left out and any other letter shows as "?". Markdown and JSON keep everything.
const W = { ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584 };
const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '•': 0x95, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, '™': 0x99 };
const ASCII_FOR = { '→': '->', '←': '<-', '✓': 'v', '✔': 'v', '✗': 'x', '★': '*', '☆': '*', '·': '·', '\t': '    ' };
// One line of text as the bytes the PDF's font knows.
export function pdfBytes(s) {
  const out = [];
  for (const ch of String(s).normalize('NFC')) {
    const sub = ASCII_FOR[ch];
    if (sub && sub !== ch) { for (const c of sub) out.push(c.charCodeAt(0)); continue; }
    const cp = ch.codePointAt(0);
    if (cp >= 32 && cp < 127) out.push(cp);
    else if (cp >= 160 && cp <= 255) out.push(cp);
    else if (WIN[ch]) out.push(WIN[ch]);
    else if (cp > 0xffff || (cp >= 0x2190 && cp <= 0x2bff) || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x200d) continue; // emoji and symbols: left out
    else if (cp >= 32) out.push(63); // "?"
  }
  return out;
}
const widthOf = (bytes, size) => bytes.reduce((n, b) => n + (W[String.fromCharCode(b)] || 556), 0) * size / 1000;
// Lines that fit the page width; a word too long for a line is cut.
export function wrap(text, maxW, size) {
  const out = [];
  for (const para of String(text).replace(/\r\n/g, '\n').split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w !== '');
    let line = [];
    for (const w of words) {
      const b = pdfBytes(w);
      if (widthOf([...line, ...b], size) <= maxW) { line.push(...b); continue; }
      if (line.length) { out.push(trimEnd(line)); line = []; }
      if (/^\s+$/.test(w)) continue;
      let rest = b;
      while (widthOf(rest, size) > maxW) { let n = rest.length; while (n > 1 && widthOf(rest.slice(0, n), size) > maxW) n--; out.push(rest.slice(0, n)); rest = rest.slice(n); }
      line = [...rest];
    }
    out.push(trimEnd(line));
  }
  return out;
}
const trimEnd = (b) => { const x = [...b]; while (x.length && x[x.length - 1] === 32) x.pop(); return x; };
const hex = (bytes) => '<' + Buffer.from(bytes).toString('hex') + '>';
// Light Markdown clean-up for paper: bold and code marks go, headings and lists stay as words.
const plainForPaper = (s) => String(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`{3}[\w-]*\n?/g, '').replace(/`([^`]+)`/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '[$1]').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

export function toPdf(chat, now = Date.now()) {
  const PW = 612, PH = 792, M = 54, size = 10.5, lead = 14, maxW = PW - 2 * M; // Letter, 3/4 inch margins
  const items = []; // { bytes, font, size, gap }
  const title = wrap(chat.title.replace(/\n/g, ' '), maxW, 16);
  title.forEach((b) => items.push({ bytes: b, font: 'F2', size: 16, lead: 20 }));
  items.push({ bytes: pdfBytes(`Saved from Bob on ${stamp(now)}. ${chat.messages.length} message${chat.messages.length === 1 ? '' : 's'}.`), font: 'F1', size: 9, lead: 18 });
  for (const m of chat.messages) {
    items.push({ gap: 8 });
    items.push({ bytes: pdfBytes(`${m.role === 'user' ? 'You' : 'Bob'}${m.at ? '  ·  ' + stamp(m.at) : ''}`), font: 'F2', size: 10.5, lead: 15 });
    const body = plainForPaper(m.text) + (m.media || []).map((x) => `\n(${x.kind || 'file'}: ${x.name})`).join('');
    for (const b of wrap(body, maxW, size)) items.push({ bytes: b, font: 'F1', size, lead });
  }
  // Pages
  const pages = [];
  let ops = [], y = PH - M;
  const newPage = () => { if (ops.length) pages.push(ops); ops = []; y = PH - M; };
  for (const it of items) {
    if (it.gap) { y -= it.gap; continue; }
    if (y - it.lead < M) newPage();
    y -= it.lead;
    if (it.bytes.length) ops.push(`BT /${it.font} ${it.size} Tf ${M} ${y.toFixed(1)} Td ${hex(it.bytes)} Tj ET`);
  }
  newPage();
  if (!pages.length) pages.push([]);
  pages.forEach((p, i) => p.push(`BT /F1 8 Tf ${PW - M - 40} ${M / 2} Td ${hex(pdfBytes(`${i + 1} of ${pages.length}`))} Tj ET`));
  // Objects: 1 catalog, 2 page list, 3 and 4 fonts, then a page and its contents for each page, then the info.
  const objs = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  for (const [i, p] of pages.entries()) {
    const content = p.join('\n');
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
  }
  objs.push(`<< /Title ${hex(pdfBytes(chat.title.slice(0, 120)))} /Producer (Bob) >>`);
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// One chat as a file: { name, type, body } or null when there is no such chat.
export function saveChat(cfg, id, format, now = Date.now()) {
  if (!chatIds(cfg).includes(id)) return null;
  const chat = chatForSaving(cfg, id);
  if (format === 'json') return { name: fileNameFor(chat, 'json', now), type: 'application/json; charset=utf-8', body: Buffer.from(toJson(chat, now), 'utf8') };
  if (format === 'pdf') return { name: fileNameFor(chat, 'pdf', now), type: 'application/pdf', body: toPdf(chat, now) };
  return { name: fileNameFor(chat, 'md', now), type: 'text/markdown; charset=utf-8', body: Buffer.from(toMarkdown(chat, now), 'utf8') };
}

// ---- Bringing chats in ----
// The same conversation always gets the same chat id, so bringing a file in twice doesn't make copies.
export function importId(c) {
  const key = c.id ? `${c.source}:${c.id}` : `${c.source}:${c.title}:${c.turns.slice(0, 4).map((t) => t.text.slice(0, 200)).join('|')}`;
  return 'in-' + c.source.slice(0, 9) + '-' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}
const titleOf = (c) => (c.title || '').replace(/\s+/g, ' ').trim().slice(0, 70) || (c.turns.find((t) => t.role === 'user')?.text || '(no words)').replace(/\s+/g, ' ').trim().slice(0, 70);

// What's in a file, before anything is kept: the list the owner ticks from.
export function lookAtFile(cfg, raw, name = '') {
  const convs = conversationsOf(raw, name);
  if (!convs) return { ok: false, why: 'Bob doesn\'t know this kind of file. He can bring in exports from ChatGPT, Claude and Open WebUI (conversations.json, or the .json Export chats gives you), chats he saved himself (JSON or Markdown), and transcripts with "Name: words" lines.' };
  const have = new Set(chatIds(cfg));
  const chats = convs.slice(0, MAX_CHATS).map((c, i) => {
    const id = importId(c);
    const at = c.at || c.turns.find((t) => t.at)?.at || 0;
    return { n: i, id, title: titleOf(c), source: c.source, from: SOURCES[c.source] || c.source, messages: c.turns.length, at, here: have.has(id) };
  });
  return { ok: true, chats, more: Math.max(0, convs.length - MAX_CHATS), convs: convs.slice(0, MAX_CHATS) };
}

// Keep the picked conversations as chats. Each message gets an id and a time like any other; the first one carries
// the title and where it came from. The last 40 are the recent part, the rest the older part (chats.js).
export function bringIn(cfg, convs, picks, now = Date.now()) {
  const done = [], skipped = [];
  for (const n of picks) {
    const c = convs[n];
    if (!c) continue;
    const id = importId(c);
    if (fs.existsSync(chatFile(cfg, id))) { skipped.push(id); continue; }
    let last = c.at || 0;
    const msgs = c.turns.map((t) => { last = t.at || last || now; return { id: newMsgId(), at: last, role: t.role, content: t.text }; });
    if (!msgs.length) continue;
    msgs[0].chatTitle = titleOf(c);
    msgs[0].from = c.source;
    const cut = Math.max(0, msgs.length - RECENT);
    if (cut) writeOlder(cfg, id, msgs.slice(0, cut));
    writeChat(cfg, id, msgs.slice(cut));
    done.push({ id, title: titleOf(c), messages: msgs.length });
  }
  return { done, skipped };
}

// ---- Sharing a chat: a tidy page or picture to send someone ----
// Names, folders, machine names, home network addresses and keys are taken out first, plus any words the owner adds.
// The window shows the result before anything is saved; the picture is drawn by the window from the same words.
// The folders of a path go; its file name stays. Windows folders may have spaces in them ("C:\My Projects\...").
const WIN_PATH = /\b[A-Za-z]:\\(?:[^\\\n"'<>|*?:]*\\)*/g;
const UNC_PATH = /\\\\[^\\\s"'<>|]+\\(?:[^\\\n"'<>|*?:]*\\)*/g;
const NIX_PATH = /(?<![\w.~])(?:~|\/(?:home|Users|root|mnt|media|Volumes|storage|sdcard|data|var|opt|srv|tmp))(?:\/[^/\s"'<>|]+)*\//g;
const LAN_IP = /\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A function that tidies one message for sharing. hide: extra words, phrases or names to take out.
export function shareScrubber(cfg, hide = [], opts) {
  const base = scrubber(cfg, opts);
  const extra = [...new Set([].concat(hide || []).map((w) => String(w || '').trim()).filter((w) => w.length >= 2))].slice(0, 50);
  return (text) => {
    let t = String(text ?? '');
    for (const w of extra) t = t.replace(new RegExp(`(?<![\\w])${escRe(w)}(?![\\w])`, 'gi'), '[hidden]');
    t = t.replace(EMAIL, '[email]').replace(WIN_PATH, '…\\').replace(UNC_PATH, '…\\').replace(NIX_PATH, '…/');
    t = base(t).replace(/<home>[\\/]?(?:[^\s"'<>|]*[\\/])?([^\\/\s"'<>|]*)/g, (_, f) => '…/' + f).replace(/\bthe owner\b/g, '[name]');
    return t.replace(LAN_IP, '[home network address]');
  };
}

const htmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// One page, nothing to load, no scripts: light or dark to suit the reader.
export function sharePageHtml(chat, now = Date.now()) {
  const rows = chat.messages.map((m) => `<article class="${m.role === 'user' ? 'you' : 'bob'}"><header>${m.role === 'user' ? 'Me' : 'Bob'}${m.at ? ` <time>${htmlEsc(stamp(m.at))}</time>` : ''}</header><div>${htmlEsc(m.text)}</div>${(m.media || []).map((x) => `<p class="file">(${htmlEsc(x.kind || 'file')}: ${htmlEsc(x.name)})</p>`).join('')}</article>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${htmlEsc(chat.title)}</title>
<style>
:root { --bg: #f6f5f2; --card: #fff; --you: #e3eef6; --text: #1d1d1f; --muted: #6b6b70; --line: #ddd; }
@media (prefers-color-scheme: dark) { :root { --bg: #17181a; --card: #222326; --you: #1f3340; --text: #ececec; --muted: #9a9aa0; --line: #333; } }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 40px; }
h1 { font-size: 1.4em; margin: 0 0 4px; } .about { color: var(--muted); font-size: .85em; margin: 0 0 20px; }
article { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; margin: 10px 0; }
article.you { background: var(--you); margin-left: 12%; } article.bob { margin-right: 12%; }
header { font-weight: 600; font-size: .85em; margin-bottom: 4px; } time { font-weight: 400; color: var(--muted); margin-left: 6px; }
article div { white-space: pre-wrap; overflow-wrap: anywhere; } .file { color: var(--muted); font-size: .85em; margin: 6px 0 0; }
footer { color: var(--muted); font-size: .8em; margin-top: 24px; text-align: center; }
</style></head>
<body><main><h1>${htmlEsc(chat.title)}</h1><p class="about">A chat with Bob, shared ${htmlEsc(day(now))}. ${chat.messages.length} message${chat.messages.length === 1 ? '' : 's'}.</p>
${rows}
<footer>Shared from Bob, a helper that runs on its owner's own computer. Names, folders and addresses were taken out.</footer></main></body></html>
`;
}

// What the window shows before anything is saved: the tidied chat, its page, and how much was taken out.
export function shareChat(cfg, id, { hide = [], last = 0, scrubOpts, now = Date.now() } = {}) {
  if (!chatIds(cfg).includes(id)) return null;
  const scrub = shareScrubber(cfg, hide, scrubOpts);
  const c = chatForSaving(cfg, id);
  let changed = 0;
  const tidy = (s) => { const t = scrub(s); if (t !== s) changed++; return t; };
  const msgs = (last > 0 ? c.messages.slice(-last) : c.messages).map((m) => ({ ...m, text: tidy(plainForPaper(m.text)), ...(m.media ? { media: m.media.map((x) => ({ ...x, name: tidy(x.name) })) } : {}) }));
  const chat = { title: scrub(c.title), messages: msgs }; // the title is the first message's start: not counted twice
  return { ...chat, changed, total: c.messages.length, name: fileNameFor(chat, 'html', now).replace('Bob chat - ', 'Bob chat (shared) - '), html: sharePageHtml(chat, now) };
}
