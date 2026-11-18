// Nov 18: a pasted path that looks right but isn't. Windows adds things you can't see: Explorer's "Copy as path" wraps
// it in quotes, and the Properties > Security tab starts it with an invisible U+202A mark. Every typed path in Bob is
// cleaned with this (public/clean-path.js is the same function for the pages). No imports.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g;
export function cleanPath(s) {
  if (typeof s !== 'string') return s;
  let t = s.replace(INVISIBLE, '').replace(/\u00A0/g, ' ').trim();
  for (let i = 0; i < 3; i++) { const m = /^(["'“”‘’`])([\s\S]*)\1$/.exec(t) || /^[“‘]([\s\S]*)[”’]$/.exec(t); if (!m) break; t = (m[2] ?? m[1]).trim(); }
  return t;
}
// Looks like a full path once cleaned: C:\..., C:/..., \\server\share, /..., ~/...
export const looksLikePath = (s) => /^(?:[A-Za-z]:[\\/]|\\\\|\/|~[\\/])/.test(cleanPath(String(s || '')));
