// Web pages and look-ups for fetch_page and web_search (items 18-21, Nov 11). Pure functions, no network.
//   - mainText: the page's own words. Menus, headers, footers, side bars, forms and cookie banners go; the article or
//     main part is kept when the page marks one; headings keep a "## " so the brain sees the outline; table rows keep
//     their cells apart with " | ". Before, every tag was stripped and a long menu ate the 15,000 characters.
//   - docKind: a link that is a PDF or an Office document (by its type or its name), read with doc-text.js.
//   - parseDdg / parseMojeek: search results from DuckDuckGo's plain page, and from Mojeek when DuckDuckGo gives none.
export const WEB_TIMEOUT_MS = 20_000; // item 20: one look-up, start to end
export const MAX_DOC_DOWNLOAD = 20 * 1024 * 1024; // item 18: a PDF or document link read whole up to this

export function decode(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' '; })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const c = parseInt(n, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' '; })
    .replace(/&amp;/g, '&');
}

const DROP_TAGS = ['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'nav', 'header', 'footer', 'aside', 'form', 'button', 'select', 'dialog'];
// Blocks whose class or id says they're page furniture.
const FURNITURE = /<(div|section|ul|p)\b[^>]*\b(?:class|id)\s*=\s*["'][^"']*\b(?:cookie|consent|gdpr|banner|newsletter|subscribe|share|social|breadcrumb|menu|navbar|sidebar|related|advert|promo|popup|modal)\w*\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;

function strip(html) {
  return decode(html
    .replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, h, t) => `\n\n${'#'.repeat(Math.min(3, Number(h[1]) + 1))} ${t.replace(/<[^>]+>/g, ' ').trim()}\n`)
    .replace(/<\/(td|th)>\s*<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|table|section|article|blockquote|pre|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function mainText(html) {
  let h = String(html || '').replace(/<!--[\s\S]*?-->/g, ' ');
  const title = (h.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  for (const t of DROP_TAGS) h = h.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}>`, 'gi'), ' ').replace(new RegExp(`<${t}\\b[^>]*\\/?>`, 'gi'), ' ');
  for (let i = 0; i < 3; i++) h = h.replace(FURNITURE, ' '); // nested ones, a few levels
  // The page's own main part, when it marks one and it holds real words.
  for (const tag of ['article', 'main']) {
    const parts = [...h.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map((m) => strip(m[1])).filter((t) => t.length > 400);
    if (parts.length) return `${title ? `# ${decode(title)}\n\n` : ''}${parts.join('\n\n')}`;
  }
  const body = h.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? h;
  const text = strip(body);
  return `${title && !text.startsWith(decode(title)) ? `# ${decode(title)}\n\n` : ''}${text}`;
}

// 'pdf', 'docx'... when this link is a document doc-text.js reads, else ''.
const TYPES = { 'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx', 'application/vnd.oasis.opendocument.text': 'odt', 'application/vnd.oasis.opendocument.spreadsheet': 'ods', 'application/vnd.oasis.opendocument.presentation': 'odp', 'application/epub+zip': 'epub', 'application/rtf': 'rtf', 'text/rtf': 'rtf' };
export function docKind(type, url) {
  const t = String(type || '').split(';')[0].trim().toLowerCase();
  if (TYPES[t]) return TYPES[t];
  if (!t || t === 'application/octet-stream' || t === 'binary/octet-stream' || t === 'application/x-download') {
    const ext = (String(url?.pathname ?? url ?? '').toLowerCase().match(/\.([a-z0-9]{2,5})$/) || [])[1];
    if (ext && Object.values(TYPES).includes(ext)) return ext;
  }
  return '';
}

const clean = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const lines = (list) => list.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n');

export function parseDdg(html, max = 8) {
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || ''))) && out.length < max) {
    let url = m[1].replace(/&amp;/g, '&');
    const u = url.match(/[?&]uddg=([^&]+)/);
    if (u) url = decodeURIComponent(u[1]);
    if (url.startsWith('//')) url = 'https:' + url;
    out.push({ title: clean(m[2]), url, snippet: clean(m[3]) });
  }
  return out;
}

export function parseMojeek(html, max = 8) {
  const out = [];
  const re = /<a[^>]+class="title"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p class="s"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(String(html || ''))) && out.length < max) out.push({ title: clean(m[2]), url: decode(m[1]), snippet: clean(m[3]) });
  return out;
}
export const resultLines = lines;
