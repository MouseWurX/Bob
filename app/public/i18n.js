// Bob's screens in other languages (Settings, Bob himself, Language). English is the default and the source:
// each language file maps the English words on a screen to that language's words. Words with no entry stay in
// English, so a half-finished language still works. Nothing here goes online.
//
// It works on the page as drawn: text and a few attributes (title, placeholder, aria-label) are swapped when
// they match an entry exactly, and anything drawn later is swapped as it appears. What you and the brain write
// (the chat, text boxes, code) is never touched.

export const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' }
];
export const LANG_KEY = 'bob-lang';
export const ATTRS = ['title', 'placeholder', 'aria-label'];
// Where Bob's screens stop and your words start: the chat, text you type, code, and anything marked to keep.
export const SKIP = 'textarea, input, script, style, code, pre, kbd, [contenteditable], [data-no-translate], #log, .log, .mind-log, #vbody';

// A saved code that isn't one of the languages above counts as English.
export function pickLang(saved) {
  const c = String(saved || '').toLowerCase();
  return LANGS.some((l) => l.code === c) ? c : 'en';
}

// One piece of text: matched without its outer spaces, which are put back. No entry: undefined (leave it).
export function translateText(text, dict) {
  if (!dict || typeof text !== 'string') return undefined;
  const core = text.trim();
  if (!core || !Object.prototype.hasOwnProperty.call(dict, core)) return undefined;
  const lead = text.slice(0, text.indexOf(core));
  const tail = text.slice(lead.length + core.length);
  return lead + dict[core] + tail;
}

const skipped = (el) => {
  try { return Boolean(el?.closest?.(SKIP)); } catch { return false; }
};

// Swap every text node and attribute under `root` that has an entry. Works on anything shaped like the DOM
// (tests pass a small fake). Returns how many pieces changed.
export function translateTree(root, dict) {
  if (!root || !dict) return 0;
  let n = 0;
  const visit = (node) => {
    if (node.nodeType === 3) {
      if (skipped(node.parentElement || node.parentNode)) return;
      const t = translateText(node.nodeValue, dict);
      if (t !== undefined && t !== node.nodeValue) { node.nodeValue = t; n++; }
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      if (skipped(node)) return;
      for (const a of ATTRS) {
        const v = node.getAttribute?.(a);
        if (v == null) continue;
        const t = translateText(v, dict);
        if (t !== undefined && t !== v) { node.setAttribute(a, t); n++; }
      }
    }
    for (const c of Array.from(node.childNodes || [])) visit(c);
  };
  visit(root);
  return n;
}

const readSaved = () => { try { return localStorage.getItem(LANG_KEY) || ''; } catch { return ''; } };
const writeSaved = (code) => { try { localStorage.setItem(LANG_KEY, code); } catch {} };

// Load a language's words. English has none to load.
export async function loadDict(code) {
  const c = pickLang(code);
  if (c === 'en') return null;
  try { return (await import(`./lang/${c}.js`)).WORDS || null; } catch { return null; }
}

// Start on this page: read the saved language, swap what's there, and keep swapping what gets drawn.
// Returns the code in use.
export async function startI18n(doc = document) {
  const code = pickLang(readSaved());
  doc.documentElement.lang = code;
  const dict = await loadDict(code);
  if (!dict) return code;
  translateTree(doc.body, dict);
  if (doc.title) doc.title = translateText(doc.title, dict) ?? doc.title;
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') translateTree(m.target, dict);
      else if (m.type === 'attributes') { if (!skipped(m.target)) { const v = m.target.getAttribute(m.attributeName); const t = translateText(v, dict); if (t !== undefined && t !== v) m.target.setAttribute(m.attributeName, t); } }
      else for (const a of m.addedNodes) translateTree(a, dict);
    }
  }).observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // Another window (Settings in its own window) picked a language: this one follows.
  window.addEventListener('storage', (e) => { if (e.key === LANG_KEY && pickLang(e.newValue) !== code) location.reload(); });
  return code;
}

// The language Bob's settings say (saved on this replicant matrix, so the phone and the Settings window agree).
// If it differs from what this page started in, remember it and redraw the page.
export function followSaved(code) {
  const want = pickLang(code);
  if (want === pickLang(readSaved())) return false;
  writeSaved(want);
  try { location.reload(); } catch {}
  return true;
}
