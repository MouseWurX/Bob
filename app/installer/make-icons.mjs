// Bob's app icon: a tesseract (a cube inside a cube, an optical illusion) on a Lamplight tile, in the three Lamplight
// versions (style.lamp: mercury, sodium, thallium, neon: named after elements that glow those colours). This script draws every icon file Bob ships from one design, so the
// sizes never drift apart. Run it by hand after changing the design (node installer/make-icons.mjs); the pictures
// it writes are committed, so building Bob or running the tests never needs it. It needs Playwright's Chromium
// (dev only) to turn the drawings into PNGs, and writes the Windows .ico itself (PNG-in-ICO, no packages).
//
// Small sizes (16 and 24) use a plainer drawing: thicker lines, no glow, and the inner cube's middle lines left out,
// so the shape stays sharp instead of turning into a smudge. Mac icons get Apple's padding round the tile.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(APP, 'public', 'icons');

export const LAMPS = {
  // Each gas's visible lines through CIE 1931 into sRGB (clipped to what a screen can show), the same colours as the
  // Lamps themes in public/themes.js: lamp = accent half-mixed with black, tile = the theme's Lamplight deep.
  mercury: { accent: '#8becff', lamp: '#46767f', tile: '#0d1011', hot: '#e6fbff' }, // blue-green mercury vapour
  sodium: { accent: '#ff8000', lamp: '#804000', tile: '#110d08', hot: '#ffe0b8' }, // the orange street lamp
  thallium: { accent: '#00ff00', lamp: '#008000', tile: '#081108', hot: '#d4ffd4' }, // thallium's one green line
  neon: { accent: '#ff2e00', lamp: '#801700', tile: '#110a08', hot: '#ffd2c4' } // red with a hint of orange
};

// The 16 corners of a tesseract: an outer cube and an inner one (the fourth dimension seen as "inside"), turned to
// the isometric view, where the back corner hides behind the front one. That is the illusion: it reads as a cube in
// a room, a room in a cube, or both.
function tesseract(scale, inner) {
  const yaw = Math.PI / 4, pitch = Math.atan(1 / Math.SQRT2);
  const v = [];
  for (const w of [0, 1]) for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const s = w ? inner : 1;
    let X = x * s, Y = y * s, Z = z * s;
    [X, Z] = [X * Math.cos(yaw) + Z * Math.sin(yaw), -X * Math.sin(yaw) + Z * Math.cos(yaw)];
    [Y, Z] = [Y * Math.cos(pitch) - Z * Math.sin(pitch), Y * Math.sin(pitch) + Z * Math.cos(pitch)];
    v.push({ x: 50 + X * scale, y: 50 - Y * scale + 1, z: Z, w });
  }
  const e = [];
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) {
    const d = i ^ j;
    if ((d & (d - 1)) === 0) e.push([i, j]);
  }
  return { v, e };
}

const f2 = (n) => n.toFixed(2);

export function iconSvg(lampId = 'mercury', { small = false } = {}) {
  const c = LAMPS[lampId] || LAMPS.mercury;
  const { v, e } = tesseract(small ? 27 : 24, small ? 0.42 : 0.45);
  const zs = e.map(([i, j]) => (v[i].z + v[j].z) / 2);
  const lo = Math.min(...zs), hi = Math.max(...zs);
  const lines = e.map((pair, k) => ({ pair, k, t: (zs[k] - lo) / (hi - lo || 1) }))
    .sort((a, b) => a.t - b.t)
    .map(({ pair: [i, j], t }) => {
      const a = v[i], b = v[j];
      const kind = a.w && b.w ? 'inner' : !a.w && !b.w ? 'outer' : 'link';
      // small: the inner cube's lines that meet in its middle are left out (they blur into a dot at 16 px)
      if (small && kind === 'inner' && (Math.hypot(a.x - 50, a.y - 51) < 1 || Math.hypot(b.x - 50, b.y - 51) < 1)) return '';
      const col = kind === 'inner' ? c.hot : c.accent;
      const w = small ? { outer: 7, inner: 5.5, link: 4.5 }[kind] : { outer: 4, inner: 3.3, link: 2.5 }[kind];
      const o = small ? 1 : 0.4 + 0.6 * t;
      return `<line x1="${f2(a.x)}" y1="${f2(a.y)}" x2="${f2(b.x)}" y2="${f2(b.y)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" opacity="${f2(o)}"/>`;
    }).join('');
  const defs = `<radialGradient id="lamp" cx="12%" cy="8%" r="105%"><stop offset="0" stop-color="${c.lamp}" stop-opacity=".75"/><stop offset=".4" stop-color="${c.lamp}" stop-opacity=".22"/><stop offset=".75" stop-color="${c.lamp}" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="halo"><stop offset="0" stop-color="${c.accent}" stop-opacity=".35"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/></radialGradient>`
    + `<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const tile = `<rect width="100" height="100" rx="${small ? 18 : 22}" fill="${c.tile}"/><rect width="100" height="100" rx="${small ? 18 : 22}" fill="url(#lamp)"/>`
    + (small ? '' : '<rect x=".6" y=".6" width="98.8" height="98.8" rx="21.4" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="1.2"/><circle cx="50" cy="51" r="40" fill="url(#halo)"/>');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${defs}</defs>${tile}${small ? lines : `<g filter="url(#glow)">${lines}</g>`}</svg>`;
}

// A Mac icon sits inside Apple's grid: the tile is 824 of 1024, centred.
const macSvg = (lampId) => iconSvg(lampId).replace('viewBox="0 0 100 100"', 'viewBox="-12.1 -12.1 124.2 124.2"');

// The tray dot (Tray icon dot, 150): the same icon with src/app-icon.js's DOT (warm orange ringed in dark brown) in
// the bottom-right corner, where it has always been.
const dotSvg = (lampId, small) => iconSvg(lampId, { small }).replace('</svg>', '<circle cx="76" cy="76" r="22" fill="#2b1d14"/><circle cx="76" cy="76" r="16" fill="#e77a1a"/></svg>');

// Windows .ico: a header, one directory entry per size, then the PNGs as they are (Vista and later read PNG entries).
export function ico(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const dir = pngs.map(({ size, png }) => {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size; d[1] = size >= 256 ? 0 : size; d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6);
    d.writeUInt32LE(png.length, 8); d.writeUInt32LE(offset, 12); offset += png.length;
    return d;
  });
  return Buffer.concat([head, ...dir, ...pngs.map((p) => p.png)]);
}

async function main() {
  const { chromium } = createRequire(import.meta.url)('playwright'); // found wherever Playwright is installed
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (svg, size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  const draw = (lampId, size) => render(iconSvg(lampId, { small: size <= 24 }), size);
  const write = (rel, buf) => { const f = path.join(APP, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); };

  // Each Lamplight version: what the window, taskbar, Dock and tray show while Bob runs (src/app-icon.js).
  for (const id of Object.keys(LAMPS)) {
    fs.writeFileSync(path.join(OUT, `bob-${id}.svg`), iconSvg(id) + '\n');
    for (const s of [16, 24, 32, 48, 256]) write(`public/icons/lamp/${id}-${s}.png`, await draw(id, s));
    for (const s of [16, 24, 32]) write(`public/icons/lamp/${id}-dot-${s}.png`, await render(dotSvg(id, s <= 24), s));
    write(`public/icons/lamp/${id}-mac-512.png`, await render(macSvg(id), 512)); // the Dock, with Apple's padding
  }
  // The fixed icon (installer, shortcuts, favicon, phone, Android): Mercury, the version a new Bob starts with.
  fs.writeFileSync(path.join(OUT, 'bob.svg'), iconSvg('mercury') + '\n');
  for (const s of [32, 48, 192, 512]) write(`public/icons/bob-${s}.png`, await draw('mercury', s));
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoParts = [];
  for (const s of icoSizes) icoParts.push({ size: s, png: await draw('mercury', s) });
  write('public/icons/bob.ico', ico(icoParts));
  for (const s of [16, 32, 128, 256, 512]) {
    write(`public/icons/mac/icon_${s}x${s}.png`, await render(s <= 16 ? iconSvg('mercury', { small: true }) : macSvg('mercury'), s));
    write(`public/icons/mac/icon_${s}x${s}@2x.png`, await render(s <= 16 ? iconSvg('mercury', { small: true }) : macSvg('mercury'), s * 2));
  }
  write('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', await draw('mercury', 192));
  await browser.close();
  console.log('Bob icons drawn into public/icons, public/icons/lamp, public/icons/mac and the Android launcher.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
