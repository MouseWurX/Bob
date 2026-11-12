// Bob's themes. Each theme is a handful of colours (plus a font and corner roundness); everything on
// screen reads them as CSS variables, so a theme switch is instant and needs no reload.
// Moondust, Nightside, Otterbend, Homestead, Sandbar and the high-contrast pair use the colours of the MouseHole app
// by MouseWurX (ui/theme/Theme.kt); Drydock is the website's blueprint look (assets/css/site.css), with IBM Plex
// Mono bundled in public/fonts (OFL).

// ---------- colour helpers ----------
const HEX = /^#[0-9a-f]{6}$/i;
function rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function hex(r, g, b) { return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
export function mix(a, b, t) { if (!HEX.test(a) || !HEX.test(b)) return a; const x = rgb(a), y = rgb(b); return hex(...x.map((v, i) => v * t + y[i] * (1 - t))); }
export function isLight(h) { if (!HEX.test(h)) return false; const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) > 150; }

// The colours a theme can set. These are also the rows of the "make your own" editor.
export const TOKENS = [
  ['bg', 'Background'], ['panel', 'Bars and panels'], ['card', 'Cards and Bob\'s bubbles'], ['you', 'Your bubbles'],
  ['line', 'Lines and borders'], ['text', 'Text'], ['muted', 'Quiet text'], ['accent', 'Accent'], ['onAccent', 'Text on accent'],
  ['good', 'Good'], ['warn', 'Warning'], ['bad', 'Problem'], ['spriteBg', 'Behind Bob']
];

export const FONTS = {
  system: { label: 'Segoe UI (system)', css: '"Segoe UI", system-ui, sans-serif' },
  plex: { label: 'IBM Plex Mono (MouseWurX)', css: '"IBM Plex Mono", Consolas, "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace' },
  mono: { label: 'Consolas', css: 'Consolas, "Cascadia Mono", monospace' },
  serif: { label: 'Georgia (bookish)', css: 'Georgia, "Times New Roman", serif' },
  rounded: { label: 'Rounded', css: '"Segoe UI Variable Display", "Segoe UI", "Trebuchet MS", sans-serif' }
};

// MouseHole's Material colour roles, mapped onto Bob's.
function mh(c, extra = {}) {
  return {
    bg: c.background, panel: c.surface, card: c.surfaceVariant, line: c.outline, text: c.onSurface, muted: c.onSurfaceVariant,
    accent: c.primary, onAccent: c.onPrimary, good: c.secondary, warn: c.warn, bad: c.error,
    you: mix(c.primary, c.surface, 0.28), spriteBg: c.surfaceVariant, ...extra
  };
}

const MH = {
  dark: { primary: '#5FBF8C', onPrimary: '#0B1410', secondary: '#3E8F68', background: '#0B1410', surface: '#12201A', surfaceVariant: '#1A2C24', onSurface: '#DCE6DF', onSurfaceVariant: '#8FA69A', error: '#E07A6A', outline: '#24392F', warn: '#E2B23A' },
  light: { primary: '#2E7D5B', onPrimary: '#FFFFFF', secondary: '#5FA183', background: '#EDF2ED', surface: '#FFFFFF', surfaceVariant: '#DBE8DE', onSurface: '#152019', onSurfaceVariant: '#55685D', error: '#B3261E', outline: '#C8D6CC', warn: '#8A6100' }
};
const MIDNIGHT = { primary: '#6AA9FF', onPrimary: '#080A0F', secondary: '#3F6FA8', background: '#080A0F', surface: '#0F141C', surfaceVariant: '#171E29', onSurface: '#DDE3EC', onSurfaceVariant: '#8794A8', error: '#FF7A6B', outline: '#1E2836', warn: '#FFC65C' };
const SLATE = { primary: '#4FB3BF', onPrimary: '#121212', secondary: '#357F88', background: '#121212', surface: '#1C1C1C', surfaceVariant: '#262626', onSurface: '#E4E4E4', onSurfaceVariant: '#9A9A9A', error: '#E0685A', outline: '#2E2E2E', warn: '#D9A23E' };
const PAPER = { primary: '#1F6F6B', onPrimary: '#FFFFFF', secondary: '#4E9A96', background: '#FAF8F3', surface: '#FFFFFF', surfaceVariant: '#EFEBE1', onSurface: '#1A1A17', onSurfaceVariant: '#5C5C55', error: '#B3261E', outline: '#DAD5C8', warn: '#8A6100' };
const HC = {
  dark: { primary: '#00E5FF', onPrimary: '#000000', secondary: '#00B8D4', background: '#000000', surface: '#0D0D0D', surfaceVariant: '#262626', onSurface: '#FFFFFF', onSurfaceVariant: '#E0E0E0', error: '#FF5252', outline: '#FFFFFF', warn: '#FFD600' },
  light: { primary: '#0046C8', onPrimary: '#FFFFFF', secondary: '#003399', background: '#FFFFFF', surface: '#FAFAFA', surfaceVariant: '#E0E0E0', onSurface: '#000000', onSurfaceVariant: '#212121', error: '#C70000', outline: '#000000', warn: '#7A4F00' }
};
const WURX = {
  light: { paper: '#E1E6E4', plate: '#EEF2F1', plate2: '#D5DCDA', grid: 'rgba(14,26,28,.06)', gridMajor: 'rgba(14,26,28,.095)', ink: '#101719', ink2: '#333F42', rule: '#AEB9B8', print: '#15626C', printSoft: '#D2E4E6', stamp: '#A32D18', stampSoft: '#F0DCD6', live: '#2C6446', liveSoft: '#DCE9E0' },
  dark: { paper: '#0C0F10', plate: '#13181A', plate2: '#1A2124', grid: 'rgba(180,215,220,.045)', gridMajor: 'rgba(180,215,220,.075)', ink: '#DEE7E8', ink2: '#B0BEC0', rule: '#2C383B', print: '#63C4D2', printSoft: '#11333A', stamp: '#E07257', stampSoft: '#33170F', live: '#63B88C', liveSoft: '#11291D' }
};
function wurx(c, dark) {
  return {
    colors: { bg: c.paper, panel: c.plate, card: c.plate2, you: c.printSoft, line: c.rule, text: c.ink, muted: c.ink2, accent: c.print, onAccent: dark ? '#0C0F10' : '#FFFFFF', good: c.live, warn: c.stamp, bad: c.stamp, spriteBg: c.plate2, dangerBg: c.stampSoft, goodBg: c.liveSoft, grid: c.grid, gridMajor: c.gridMajor },
    font: 'plex', radius: 0, blueprint: true, flat: true
  };
}

// 1.5.136: the themes are named after worlds and places. Bob's Inn is Bob's own place; the high-contrast pair
// keeps its plain names. Colours of the renamed themes are unchanged; four are new.
const EMBER = { bg: '#141011', panel: '#1e1819', card: '#2a2022', you: '#4a2e26', line: '#4a3a38', text: '#f1e6e0', muted: '#c2ada6', accent: '#ff7a3d', onAccent: '#1a0e08', good: '#8fcf7a', warn: '#f2b84b', bad: '#ff6b5e', spriteBg: '#3a2522', dangerBg: '#3d1a18', goodBg: '#1b2e1a', warnBg: '#3a2c12' };
const COIL = { bg: '#0d1517', panel: '#142024', card: '#1c2c31', you: '#1f4650', line: '#2e454c', text: '#dfeaec', muted: '#9ab5ba', accent: '#5fc9e8', onAccent: '#07171c', good: '#6ccf9a', warn: '#e8c35a', bad: '#ef7b6d', spriteBg: '#233a40' };
const THAW = { bg: '#eef3f8', panel: '#ffffff', card: '#dfe8f1', you: '#cfe0ee', line: '#b9c8d6', text: '#142230', muted: '#4d6274', accent: '#1f6fa8', onAccent: '#ffffff', good: '#2e7d4f', warn: '#8a5a00', bad: '#b3261e', spriteBg: '#d3e0ea' };
const HULL = { bg: '#1b1f22', panel: '#252a2e', card: '#31373c', you: '#4a4238', line: '#4b5258', text: '#e8e4dc', muted: '#c4bdb0', accent: '#f0a830', onAccent: '#1b1500', good: '#8ec07c', warn: '#f0a830', bad: '#e8725f', spriteBg: '#3a3f44' };

export const PRESETS = [
  { id: 'inn', name: 'Bob\'s Inn', group: 'Bob', what: 'Warm tavern browns. Bob\'s original.', colors: { bg: '#1d1510', panel: '#2b1d14', card: '#3a281b', you: '#34465a', line: '#5a4030', text: '#f3e7d3', muted: '#c7b296', accent: '#e7a64a', onAccent: '#2b1d14', good: '#7fbf7a', warn: '#e7a64a', bad: '#e07a6a', spriteBg: '#4a3220' } },
  { id: 'moondust', name: 'Moondust', group: 'Worlds', what: 'Quiet grey, no colour cast. The one Bob starts with.', colors: mh(SLATE), cube: '#03666d' },
  { id: 'nightside', name: 'Nightside', group: 'Worlds', what: 'The dark side of a world from orbit: near-black with city-glow blue. Easiest on the eyes at night.', colors: mh(MIDNIGHT) },
  { id: 'otterbend', name: 'Otterbend', group: 'Worlds', what: 'Deep forest green, like a riverbank under the trees.', colors: mh(MH.dark, { warnBg: '#3A2E12', dangerBg: '#3A1A1A', goodBg: '#123022' }) },
  { id: 'rivercoil', name: 'Rivercoil', group: 'Worlds', what: 'Steel blue-green with a river-blue accent: a river that winds round a whole world.', colors: COIL },
  { id: 'emberfall', name: 'Emberfall', group: 'Worlds', what: 'Charcoal and ember orange, from a world where dragons fly.', colors: EMBER },
  { id: 'hullplate', name: 'Hullplate', group: 'Worlds', what: 'Gunmetal grey, tan panels and amber running lights. A very big ship.', colors: HULL },
  { id: 'homestead', name: 'Homestead', group: 'Worlds', what: 'Fresh green by daylight. A colony world\'s first fields.', colors: mh(MH.light) },
  { id: 'sandbar', name: 'Sandbar', group: 'Worlds', what: 'Warm sand and teal shallows, for bright light. An ocean world.', colors: mh(PAPER) },
  { id: 'longthaw', name: 'Longthaw', group: 'Worlds', what: 'Pale frost blue with a touch of green. A long winter lifting.', colors: THAW },
  { id: 'hc-dark', name: 'High Contrast', group: 'Access', what: 'Full-white text, everything outlined, colour-blind safe.', colors: mh(HC.dark), outlined: true },
  { id: 'hc-light', name: 'High Contrast Light', group: 'Access', what: 'Black on white, everything outlined.', colors: mh(HC.light), outlined: true },
  { id: 'drydock', name: 'Drydock', group: 'MouseWurX', what: 'Blueprint paper, plates and IBM Plex Mono, from the MouseWurX website.', ...wurx(WURX.light, false) },
  { id: 'drydock-night', name: 'Drydock Night', group: 'MouseWurX', what: 'The same blueprints at night.', ...wurx(WURX.dark, true) }
];
export const DEFAULT_THEME = 'moondust';

// Names from before 1.5.136, so a saved theme keeps working. "Match system" is gone (it only ever showed the
// green theme, and followed the wrong setting on some systems); anyone on it gets Moondust.
export const OLD_IDS = {
  system: 'moondust', slate: 'moondust', midnight: 'nightside', 'mousehole-dark': 'otterbend', 'mousehole-light': 'homestead',
  paper: 'sandbar', 'mousewurx-light': 'drydock', 'mousewurx-dark': 'drydock-night'
};
export function themeId(id) { return OLD_IDS[id] || id; }

export function findTheme(id, custom = []) {
  id = themeId(id);
  return PRESETS.find((t) => t.id === id) || custom.find((t) => t.id === id) || null;
}

// Turn the saved style into the theme to show right now.
export function resolve(style = {}) {
  return findTheme(style.theme, style.custom) || findTheme(DEFAULT_THEME);
}

// Every colour a theme leaves out is worked out from the ones it has, so a custom theme can be tiny.
export function fullColors(t) {
  const base = findTheme(DEFAULT_THEME).colors;
  const c = { ...base, ...(t.colors || {}) };
  if (!t.colors?.onAccent) c.onAccent = isLight(c.accent) ? '#1a1a1a' : '#ffffff';
  if (!t.colors?.you) c.you = mix(c.accent, c.panel, 0.28);
  if (!t.colors?.spriteBg) c.spriteBg = c.card;
  c.dangerBg = t.colors?.dangerBg || mix(c.bad, c.bg, 0.22);
  c.goodBg = t.colors?.goodBg || mix(c.good, c.bg, 0.3);
  c.backdrop = isLight(c.bg) ? 'rgba(20, 24, 26, 0.45)' : 'rgba(0, 0, 0, 0.7)';
  c.grid = t.colors?.grid || 'transparent';
  c.gridMajor = t.colors?.gridMajor || 'transparent';
  return c;
}

const VAR = { onAccent: 'on-accent', spriteBg: 'sprite-bg', dangerBg: 'danger-bg', goodBg: 'good-bg', gridMajor: 'grid-major' };
export function applyTheme(t, root = document.documentElement) {
  const c = fullColors(t);
  for (const [k, v] of Object.entries(c)) root.style.setProperty(`--${VAR[k] || k}`, v);
  // the colour the fNRI cube's One colour starts with until the person picks their own: the theme's accent, or the
  // theme's own cube colour where it has one (Moondust's is a deep teal, the owner's pick)
  root.style.setProperty('--cube', HEX.test(t.cube || '') ? t.cube : c.accent);
  root.style.setProperty('--font', (FONTS[t.font] || FONTS.system).css);
  root.style.setProperty('--r', `${Number.isFinite(t.radius) ? t.radius : 8}px`);
  root.style.setProperty('--shadow', t.flat ? '0 0 0 1px var(--accent) inset' : '0 0 0 2px var(--accent) inset');
  root.style.colorScheme = isLight(c.bg) ? 'light' : 'dark';
  document.body?.classList.toggle('blueprint', Boolean(t.blueprint));
  document.body?.classList.toggle('outlined', Boolean(t.outlined));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = c.panel;
}

let current = {};
let watching = false;
// Animations: 'on' (default: Remote Desktop turns Windows' animation effects off, and movement is wanted),
// 'system' follows Windows' "Animation effects" setting, 'off' keeps everything still.
export function motionOff(style = current) {
  const m = style?.motion || 'on';
  if (m === 'off') return true;
  if (m === 'system') return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  return false;
}

export function applyStyle(style = {}) {
  current = style || {};
  applyTheme(resolve(current));
  document.body?.classList.toggle('still', motionOff(current));
  try { globalThis.dispatchEvent?.(new CustomEvent('bob-avatar', { detail: { cube: current.avatar === 'cube' } })); } catch {} // 1.5.209: the fNRI cube as Bob's picture (app.js)
  try { localStorage.setItem('bob-style', JSON.stringify(current)); } catch {} // so the next start shows the right colours at once
  if (!watching && globalThis.matchMedia) {
    watching = true;
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => document.body?.classList.toggle('still', motionOff(current)));
  }
}
export function currentStyle() { return current; }

export function swatch(t) {
  const c = fullColors(t);
  return [c.bg, c.panel, c.card, c.accent, c.text];
}

// Called as the page loads, before the settings arrive, so Bob never flashes the wrong colours.
export function applySavedStyle() {
  try { applyStyle(JSON.parse(localStorage.getItem('bob-style') || '{}')); } catch { applyStyle({}); }
}
