// The porthole's fog (1.5.210): the room behind the round window the fNRI cube sits in. Two maps of random noise,
// each smoothed with a Gaussian blur once at the start, drift past each other in different directions and at different
// sizes, so where they overlap the fog thickens and thins like real fog moving. It's drawn small (FOG_PX square) and
// scaled up by the browser, about 20 times a second, so it costs very little; it stops while the porthole is hidden
// or the window is minimised, and holds one still frame when animations are off. light() lets the firing light it up.

export const FOG_PX = 96, FOG_MS = 50, NOISE_PX = 64;

// A small seeded random, so tests (and two portholes) can make the same noise.
export function seeded(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// One noise map: n by n values in 0..1, blurred with a Gaussian of the given radius (wrapping round, so the map tiles
// without a seam), then stretched back out to 0..1.
export function noiseMap(n = NOISE_PX, sigma = 4, rnd = Math.random) {
  let a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rnd();
  const r = Math.max(1, Math.ceil(sigma * 3)), k = []; let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const pass = (src, dx, dy) => { const out = new Float32Array(n * n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let v = 0; for (let i = -r; i <= r; i++) { const xx = (x + i * dx + n) % n, yy = (y + i * dy + n) % n; v += src[yy * n + xx] * k[i + r]; } out[y * n + x] = v; } return out; };
  a = pass(pass(a, 1, 0), 0, 1);
  let lo = Infinity, hi = -Infinity; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1; for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / span;
  return a;
}

// Read a tiling map at a fractional spot (smooth between its points).
export function sample(map, n, x, y) {
  x = ((x % n) + n) % n; y = ((y % n) + n) % n;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = (x0 + 1) % n, y1 = (y0 + 1) % n, fx = x - x0, fy = y - y0;
  const a = map[y0 * n + x0], b = map[y0 * n + x1], c = map[y1 * n + x0], d = map[y1 * n + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

const hex = (c) => { const m = /^#([0-9a-f]{6})$/i.exec(String(c || '').trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };

// canvas: the fog's own canvas, behind the cube's. colour(): the fog's tint (the cube's colour). still(): animations off.
// onLight(colour, strength): told each time the firing lights the fog (the porthole's rim catches the colour).
// room(): the theme's background, which tints the room itself (a dark theme a dark room, a light theme a pale misty one).
export function createFog(canvas, { colour = () => '#1fa7b2', room: roomColour = () => '#14181c', still = () => false, seed = 7, onLight = null, onFrame = null } = {}) { // onFrame(dt): once per fog frame (the lamplight rides on it)
  const rnd = seeded(seed);
  const A = noiseMap(NOISE_PX, 5, rnd), B = noiseMap(NOISE_PX, 3, rnd);
  const ctx = canvas.getContext('2d');
  canvas.width = FOG_PX; canvas.height = FOG_PX;
  const img = ctx.createImageData(FOG_PX, FOG_PX);
  let on = false, timer = 0, t = 0, last = 0;
  let glow = 0, glowRgb = [255, 255, 255], gx = 0.5, gy = 0.5; // the light from the firing: how strong, what colour, where
  function paint() {
    const tint = hex(colour()) || [31, 167, 178], bg = hex(roomColour()) || [20, 24, 28];
    const rb = bg.map((v) => v * 0.6), mist = rb.map((v) => (255 - v) * 0.18); // the room a shade darker than the page, the fog lighter than the room
    const d = img.data, n = FOG_PX, c = n / 2, R = n / 2;
    // A drifts slowly one way at a large size, B faster the other way at a smaller size; together they interfere
    const ax = t * 0.9, ay = t * 0.35, bx = -t * 1.6, by = t * 0.8;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const a = sample(A, NOISE_PX, x * 0.45 + ax, y * 0.45 + ay), b = sample(B, NOISE_PX, x * 0.8 + bx, y * 0.8 + by);
      const f = Math.max(0, Math.min(1, (a * 0.6 + b * 0.4) * 1.5 - 0.45)); // thick where both are thick, clear in between
      const dx = (x - c) / R, dy = (y - c) / R, r2 = dx * dx + dy * dy;
      const room = Math.max(0, 1 - r2 * 0.9); // darker toward the rim
      const lx = x / n - gx, ly = y / n - gy, lit = glow * Math.exp(-(lx * lx + ly * ly) * 6) * (0.4 + f); // lit fog, where the firing is
      const base = 0.10 + 0.32 * f * room;
      const i = (y * n + x) * 4;
      d[i] = Math.min(255, rb[0] + tint[0] * base * 0.55 + mist[0] * f * room + glowRgb[0] * lit);
      d[i + 1] = Math.min(255, rb[1] + tint[1] * base * 0.55 + mist[1] * f * room + glowRgb[1] * lit);
      d[i + 2] = Math.min(255, rb[2] + tint[2] * base * 0.55 + mist[2] * f * room + glowRgb[2] * lit);
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  function tick() {
    timer = 0; if (!on) return;
    if (globalThis.document?.hidden) { last = 0; timer = setTimeout(tick, 1000); return; } // minimised: nothing drawn, a look once a second
    const now = performance.now(), dt = last ? Math.min(0.2, (now - last) / 1000) : 0; last = now;
    t += dt; glow *= Math.pow(0.25, dt); // the light fades within a second or so of the last firing
    paint();
    try { onFrame?.(dt); } catch {}
    if (!still()) timer = setTimeout(tick, FOG_MS);
  }
  return {
    start() { if (on) return; on = true; last = 0; tick(); },
    stop() { on = false; clearTimeout(timer); timer = 0; },
    // the firing lights the fog: a colour, a strength 0..1 and where (0..1 across and down the porthole)
    light(c, strength = 0.5, x = 0.5, y = 0.5) { const rgb = hex(c); if (rgb) glowRgb = rgb; glow = Math.min(0.9, Math.max(glow, strength)); gx = x; gy = y; try { onLight?.(c, glow); } catch {} if (on && !timer) { last = 0; tick(); } },
    get running() { return Boolean(timer); }
  };
}
