// Nov 18: a pasted path that looks right but isn't (src/clean-path.js is the same function for the server). Windows
// adds things you can't see: Explorer's "Copy as path" wraps it in quotes, and Properties > Security starts it with an
// invisible U+202A mark. installPathCleaning() cleans every text box on the page when a path is pasted or typed in.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g;
export function cleanPath(s) {
  if (typeof s !== 'string') return s;
  let t = s.replace(INVISIBLE, '').replace(/\u00A0/g, ' ').trim();
  for (let i = 0; i < 3; i++) { const m = /^(["'“”‘’`])([\s\S]*)\1$/.exec(t) || /^[“‘]([\s\S]*)[”’]$/.exec(t); if (!m) break; t = (m[2] ?? m[1]).trim(); }
  return t;
}
export const looksLikePath = (s) => /^(?:[A-Za-z]:[\\/]|\\\\|\/|~[\\/])/.test(cleanPath(String(s || '')));

// One-line text boxes only (never the chat box or a textarea): when what's in it is a path once cleaned, it's cleaned.
export function installPathCleaning(root = document) {
  const fix = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !['text', 'search', 'url', ''].includes(el.type)) return;
    const v = el.value, c = cleanPath(v);
    if (c !== v && looksLikePath(c)) { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  root.addEventListener('paste', (e) => setTimeout(() => fix(e), 0), true);
  root.addEventListener('change', fix, true);
  root.addEventListener('blur', fix, true);
}
