// 1.5.227 "Window buttons on Bob's bar" (off unless turned on; electron/window-bar.cjs has the window's side).
// When Bob's window has no system title bar, the browser tells the page where the window's own buttons are
// (navigator.windowControlsOverlay, with env(titlebar-area-*) for CSS). Then:
//   - body gets "own-bar", so looks.css lets the top bar drag the window and keeps Bob's buttons clear of the
//     system ones (Lamplight on a wide window: on the bar itself; Classic, Terminal and narrow windows: a thin
//     strip at the top, the height of the buttons);
//   - the buttons are told the page's colours, and again whenever the theme or look changes.
// In a browser, on a phone, or with the setting off there is no overlay and nothing here does anything.

// Any CSS colour the browser hands back (rgb(), and color(srgb ...) from the looks' color-mix) as #rrggbb;
// '' for a see-through one, so the next place is tried.
const toHex = (c) => {
  const t = String(c || '').trim();
  let rgb = null, a = 1;
  let m = t.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) { rgb = [m[1], m[2], m[3]].map(Number); if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]); }
  m = !rgb && t.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) { rgb = [m[1], m[2], m[3]].map((n) => Number(n) * 255); if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]); }
  if (!rgb || rgb.some((n) => !Number.isFinite(n)) || a === 0) return '';
  return '#' + rgb.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('');
};

// The colours the buttons should wear: the page's background behind the top bar and its text colour.
export function barColours(doc = document, view = window) {
  const b = view.getComputedStyle(doc.body);
  const color = toHex(b.backgroundColor) || toHex(view.getComputedStyle(doc.documentElement).backgroundColor) || '#121212';
  const symbolColor = toHex(b.color) || '#e8e8e8';
  return { color, symbolColor, height: barHeight(doc, view) };
}

// How tall the buttons should be: as tall as Lamplight's top bar on a wide window, so they line up with the tabs;
// a thin strip (36 px) everywhere else.
export const STRIP = 36;
export function barHeight(doc = document, view = window) {
  const wide = doc.body.classList.contains('look-lamplight') && !view.matchMedia?.('(max-width: 640px)').matches;
  const side = wide && doc.querySelector('.side');
  const h = side ? Math.round(side.getBoundingClientRect().height) : 0;
  return h >= 28 && h <= 96 ? h : STRIP;
}

export function startWindowBar({ doc = document, view = window, send } = {}) {
  const wco = view.navigator?.windowControlsOverlay;
  if (!wco) return null;
  let strip = doc.querySelector('.win-strip');
  if (!strip) {
    strip = doc.createElement('div');
    strip.className = 'win-strip';
    strip.setAttribute('aria-hidden', 'true'); // only somewhere to grab the window; the buttons themselves are the system's
    doc.body.prepend(strip);
  }
  if (!doc.querySelector('.win-glow')) { // the soft glow in the cube's corner (looks.css), never in the way of a click
    const glow = doc.createElement('div');
    glow.className = 'win-glow';
    glow.setAttribute('aria-hidden', 'true');
    doc.body.append?.(glow);
  }
  let last = '', t = 0;
  const tell = () => {
    if (!wco.visible) return;
    const c = barColours(doc, view);
    const key = c.color + c.symbolColor + c.height;
    if (key === last) return;
    last = key;
    try { send?.(c); } catch {}
  };
  const apply = () => { doc.body.classList.toggle('own-bar', Boolean(wco.visible)); tell(); };
  wco.addEventListener?.('geometrychange', apply);
  view.addEventListener?.('resize', () => { view.clearTimeout(t); t = view.setTimeout(tell, 150); }); // wide <-> narrow changes the height
  const later = () => { view.clearTimeout(t); t = view.setTimeout(tell, 150); };
  const watch = new view.MutationObserver(later);
  watch.observe(doc.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  watch.observe(doc.body, { attributes: true, attributeFilter: ['style', 'class'] });
  apply();
  return { apply, tell, toHex };
}

export { toHex };
