// 🧪 FNRI: the drawing. A mixture-of-experts brain as one 3D block of voxels on a plain canvas (no
// libraries): every layer is a floor of rows, the floors stack upward, so the number of layers is the height. Each
// expert is one voxel, coloured by the skill it leans to (fainter the more the skills share it); the parts that are
// not experts are grey voxels in their true share of the weights. As a recording plays, the experts picked for the
// word being read glow and lift, with a short trail, and thin lines join them floor to floor.
// The page (public/watch.js) owns the controls and the words; this file only lays out and draws.
import { lookOf, sideOf, say, loadOrder, loadStyle } from './lab-watch-math.js';

export const GREY = '#8a8f98';
export const WIRE_ALPHA = 0.5; // the all-rounders' outline: soft, never bright
// white on a dark page; on a light page white wouldn't show, so a dark line there
export const wireColour = (bg) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(bg || '').trim()); if (!m) return '#ffffff'; const [r, g_, b] = m.slice(1).map((h) => parseInt(h, 16)); return 0.299 * r + 0.587 * g_ + 0.114 * b > 150 ? '#1b1b1b' : '#ffffff'; };
const TRAIL = 6;

// Where everything sits. The parts that are not experts (attention, the router, the tuning rows) are a core of grey
// columns up the middle of the block, the same cells on every floor, because every word passes through them on
// every floor. The experts fill the rest of each floor, row by row, around the core. What lies outside the layers
// (the word tables) is a grey base under the first floor. Sizes are true to the number of weights.
export function layoutOf(rec, parts) {
  const E = rec.brain.experts, L = rec.brain.layers;
  const grey = new Array(L).fill(0);
  let unitSum = 0, unitN = 0;
  if (parts?.layers?.length) {
    for (let l = 0; l < L; l++) {
      const p = parts.layers[l]; if (!p || !p.experts) continue;
      const unit = p.experts / E; unitSum += unit; unitN++;
      grey[l] = p.other > 0 ? Math.max(1, Math.min(E, Math.round(p.other / unit))) : 0;
    }
  }
  // the core is a neat square of solid grey in the middle, the same on every floor (its size rounded up to a
  // whole square, so it can look a touch bigger than its true share)
  const side = Math.ceil(Math.sqrt(Math.max(0, ...grey)));
  const core = side * side;
  const W = sideOf(E + core) + ((sideOf(E + core) - side) % 2 ? 1 : 0); // so the square sits dead centre
  const D = Math.ceil((E + core) / W) + ((Math.ceil((E + core) / W) - side) % 2 ? 1 : 0);
  const x0 = (W - side) / 2, z0 = (D - side) / 2;
  const coreCells = [];
  for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) coreCells.push((z0 + z) * W + x0 + x);
  const isCore = new Set(coreCells);
  const expertCell = []; // expert number -> cell
  for (let i = 0; i < W * D && expertCell.length < E; i++) if (!isCore.has(i)) expertCell.push(i);
  const cellExpert = new Array(W * D).fill(-1); expertCell.forEach((c, e) => { cellExpert[c] = e; });
  const coreRank = new Array(W * D).fill(-1); coreCells.forEach((c, r) => { coreRank[c] = r; });
  const unit = unitN ? unitSum / unitN : 0;
  const baseWant = unit && parts?.outside ? Math.round(parts.outside / unit) : 0;
  const baseMax = 2 * W * D;
  const base = Math.min(baseWant, baseMax);
  const baseFloors = Math.ceil(base / (W * D));
  const expertShare = parts?.layers?.length ? (() => { let ex = 0, all = parts.outside || 0; for (const p of parts.layers) { ex += p.experts; all += p.experts + p.other; } return all ? ex / all : 0; })() : 0;
  return { E, L, W, D, grey, core, expertCell, cellExpert, coreRank, base, baseFloors, baseCapped: baseWant > baseMax, expertShare };
}

export function createView(canvas, { still = false } = {}) {
  const ctx = canvas.getContext('2d');
  let rec = null, sp = null, lay = null;
  let yaw = -0.62, tilt = 0.5, gap = 0.9, zoom = 1, fast = false;
  let hidden = new Set(); // skill indexes, plus 'never' and 'grey'
  let staticCanvas = null, dirty = true, geom = null;
  let monoColour = ''; // the colour One colour uses, when the person picked one
  const oneColour = () => monoColour || lookOf(0)[0];
  let floorsNow = null; // Floors only: how hard each floor works for the word being read (0..1 each), or null
  let mono = false; // One colour: every expert the same colour, so only what lights up stands out
  let caption = null, key = true, paths = true, picked = null, glass = 0.25, off = null, solid = new Map(), glow = 0.5, mark = 'glow'; // mark: how the experts in use show: 'glow', 'outline' (a bright edge, no light) or 'both'; glow: how bright the experts in use shine, 0 to 1.5; gentle to begin with, so nothing flashes hard // off: [Set of experts turned off, per floor] while a cut is being tried // glass: how see-through the voxels are, 0 (solid) to 0.85
  const css = () => { const s = getComputedStyle(document.body); const g = (n, d) => s.getPropertyValue(n).trim() || d; return { bg: g('--bg', '#1d1510'), text: g('--text', '#f3e7d3'), muted: g('--muted', '#c7b296'), line: g('--line', '#5a4030'), panel: g('--panel', '#2b1d14') }; };

  // Load in and load out: `reveal` runs 0..1 and a voxel is drawn once it has passed that voxel's place in the order
  // (lab-watch-math.js loadOrder). 1 = the whole block, which is also where it rests.
  let reveal = 1, order = null, load = 'random', seed = 1, sweepRaf = 0, sweepEnd = null;
  const reorder = () => { order = lay ? loadOrder(load, { W: lay.W, D: lay.D, floors: lay.L + lay.baseFloors, seed }) : null; };
  const shown = (floor, i) => reveal >= 1 || (order ? order[floor * lay.W * lay.D + i] < reveal : false);
  // Build the block (to = 1) or take it apart (to = 0) over `ms`. Resolves when it's done, or at once when stopped by
  // another sweep. With animations off (stillNow) it jumps straight there.
  function sweep(to, ms = 1600, stillNow = still) {
    if (sweepEnd) { cancelAnimationFrame(sweepRaf); const e = sweepEnd; sweepEnd = null; e(); }
    if (to === 1 && reveal <= 0) { seed = (Math.random() * 4294967296) >>> 0; reorder(); } // a new shuffle each time for Random
    const raf = globalThis.requestAnimationFrame;
    if (!rec || !raf || stillNow || load === 'none' || ms <= 0) { reveal = to; dirty = true; if (rec) draw(); return Promise.resolve(); }
    const from = reveal, t0 = performance.now();
    return new Promise((done) => {
      sweepEnd = done;
      const step = (now) => {
        const k = Math.min(1, Math.max(0, (now - t0) / ms));
        reveal = from + (to - from) * k; dirty = true; draw();
        if (k < 1) sweepRaf = raf(step); else { sweepEnd = null; done(); }
      };
      sweepRaf = raf(step);
    });
  }
  function setData(r, s, parts) { rec = r; sp = s; lay = layoutOf(r, parts); dirty = true; picked = null; reorder(); }
  const set = (o) => { for (const [k, v] of Object.entries(o)) { if (k === 'yaw') yaw = v; else if (k === 'tilt') tilt = Math.max(0.12, Math.min(1.35, v)); else if (k === 'gap') gap = v; else if (k === 'zoom') zoom = Math.max(0.4, Math.min(6, v)); else if (k === 'hidden') hidden = v; else if (k === 'fast') fast = v; else if (k === 'paths') paths = v; else if (k === 'key') key = v !== false; else if (k === 'load') { load = loadStyle(v); reorder(); } else if (k === 'reveal') { reveal = Math.max(0, Math.min(1, v)); } else if (k === 'mono') mono = v === true; else if (k === 'monoColour') monoColour = /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : ''; else if (k === 'picked') picked = v; else if (k === 'off') off = v; else if (k === 'solid') solid = v; else if (k === 'mark') mark = ['glow', 'outline', 'both'].includes(v) ? v : 'glow'; else if (k === 'glow') glow = Math.max(0, Math.min(1.5, Number(v) || 0)); else if (k === 'glass') glass = Math.max(0, Math.min(0.85, Number(v) || 0)); } dirty = true; };
  const get = () => ({ yaw, tilt, gap, zoom, glass, glow });
  // the gap between floors that makes the whole block as tall as it is wide: a cube
  const cubeGap = () => (lay ? Math.max(0.2, Math.min(5, Math.max(lay.W, lay.D) / Math.max(1, lay.L + lay.baseFloors))) : 0.9);

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(240, Math.round(canvas.clientWidth)), h = Math.max(200, Math.round(canvas.clientHeight));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); dirty = true; }
  }

  // The camera looks from above and to one side, with no perspective, so every voxel has the same outline and the
  // whole block can be drawn with a handful of sums per voxel.
  function geometry() {
    const { W, D, L, baseFloors } = lay;
    const cw = canvas.width, ch = canvas.height;
    const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw), st = Math.sin(tilt), ct = Math.cos(tilt);
    const floors = L + baseFloors;
    const height = (floors - 1) * gap + 1;
    // fit: the widest the block can look from any side, and its height
    const span = Math.hypot(W, D);
    const fitW = span, fitH = span * st + height * ct;
    const pad = Math.round(Math.min(cw, ch) * 0.06);
    const s = Math.min((cw - 2 * pad) / fitW, (ch * 0.84 - 2 * pad) / fitH) * zoom;
    const ox = cw / 2, oy = ch * 0.46;
    const P = (x, y, z) => { const dx = x - W / 2, dz = z - D / 2, dy = y - height / 2; return [ox + s * (dx * cy_ - dz * sy_), oy + s * ((dx * sy_ + dz * cy_) * st - dy * ct)]; };
    const h = 0.4, t = Math.min(0.34, gap * 0.45); // half the voxel's side, and its thickness (the rest is the gap you see through)
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([a, b]) => [s * (a * cy_ - b * sy_), s * (a * sy_ + b * cy_) * st]);
    let m = 0; for (let i = 1; i < 4; i++) if (corners[i][1] > corners[m][1]) m = i;
    const down = s * t * ct;
    // far-to-near order of the cells of one floor
    const order = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) order.push([x * sy_ + z * cy_, x, z]);
    order.sort((a, b) => a[0] - b[0]);
    return { P, corners, m, down, s, order: order.map(([, x, z]) => z * W + x), floors, height };
  }

  const cellXY = (i) => [i % lay.W + 0.5, Math.floor(i / lay.W) + 0.5];
  const expertXY = (e) => cellXY(lay.expertCell[e]);
  const floorY = (l) => (l + lay.baseFloors) * gap + 0.5;

  function face(c, g, x, y) { c.beginPath(); c.moveTo(x + g.corners[0][0], y + g.corners[0][1]); for (let i = 1; i < 4; i++) c.lineTo(x + g.corners[i][0], y + g.corners[i][1]); c.closePath(); }
  function sides(c, g, x, y) {
    const a = g.corners[(g.m + 3) % 4], b = g.corners[g.m], d = g.corners[(g.m + 1) % 4];
    c.beginPath(); c.moveTo(x + a[0], y + a[1]); c.lineTo(x + b[0], y + b[1]); c.lineTo(x + d[0], y + d[1]); c.lineTo(x + d[0], y + d[1] + g.down); c.lineTo(x + b[0], y + b[1] + g.down); c.lineTo(x + a[0], y + a[1] + g.down); c.closePath();
  }

  // What one expert voxel looks like: its skill's colour, more solid the more it is that skill's own.
  function lookAt(l, e) {
    const top = sp.top[l][e];
    if (off && off[l]?.has(e)) return null;
    if (top < 0) return hidden.has('never') ? null : { color: null, alpha: 1 };
    if (hidden.has(top)) return null;
    if (mono) return { color: oneColour(), alpha: 0.28, even: false };
    const even = Boolean(sp.even?.[l]?.[e]); // an all-rounder: every skill uses it alike, and often
    if (even && hidden.has('even')) return null;
    return { color: lookOf(top)[0], alpha: (0.28 + 0.72 * Math.min(1, sp.strength[l][e] * 1.6)) * (solid.get(top) ?? 1), even }; // solid: each skill's own opacity
  }

  function drawStatic() {
    const g = geom = geometry();
    if (!staticCanvas) staticCanvas = document.createElement('canvas');
    staticCanvas.width = canvas.width; staticCanvas.height = canvas.height;
    const c = staticCanvas.getContext('2d'), k = css();
    c.fillStyle = k.bg; c.fillRect(0, 0, canvas.width, canvas.height);
    const { W, D, L, grey, base, baseFloors, cellExpert, coreRank } = lay;
    const full = !fast && g.s > 3;
    const voxel = (x, y, color, alpha, outline) => {
      if (outline) { c.globalAlpha = 0.5; c.strokeStyle = k.line; c.lineWidth = 1; face(c, g, x, y); c.stroke(); c.globalAlpha = 1; return; }
      // coloured glass: every voxel lets the ones behind it show through, with darker sides and a bright rim
      const a = alpha * (1 - glass);
      if (full) { c.globalAlpha = a * (glass ? 0.5 : 1); c.fillStyle = '#000'; sides(c, g, x, y); c.fill(); c.globalAlpha = a * 0.55; c.fillStyle = color; c.fill(); }
      c.globalAlpha = a; c.fillStyle = color; face(c, g, x, y); c.fill();
      if (glass && full && g.s > 7) { c.globalAlpha = Math.min(1, alpha * 0.5); c.strokeStyle = color; c.lineWidth = 1; c.stroke(); }
    };
    // an all-rounder: its edges drawn as a dashed white line drawing, so it isn't taken for a rarely used expert,
    // nor for the solid outline of an expert in use (dashes, not only brightness, tell them apart)
    const wire = (x, y) => {
      c.globalAlpha = WIRE_ALPHA; c.strokeStyle = wireColour(k.bg); c.lineWidth = Math.max(1, g.s * 0.045);
      const dash = Math.max(2, g.s * 0.18); c.setLineDash([dash, dash * 0.8]);
      face(c, g, x, y); c.stroke();
      if (full && g.s > 5) { sides(c, g, x, y); c.stroke(); const b = g.corners[g.m]; c.beginPath(); c.moveTo(x + b[0], y + b[1]); c.lineTo(x + b[0], y + b[1] + g.down); c.stroke(); }
      c.setLineDash([]);
    };
    // the plinth: what sits outside the layers
    if (!hidden.has('grey')) for (let f = 0; f < baseFloors; f++) {
      const n = Math.min(W * D, base - f * W * D);
      for (const i of g.order) { if (i >= n || !shown(f, i)) continue; const [cx, cz] = cellXY(i); const [x, y] = g.P(cx, f * gap + 0.5, cz); voxel(x, y, GREY, solid.get('grey') ?? 1); }
    }
    for (let l = 0; l < L; l++) {
      for (const i of g.order) {
        if (!shown(l + baseFloors, i)) continue;
        const [cx, cz] = cellXY(i);
        const e = cellExpert[i];
        if (e >= 0) {
          const lk = lookAt(l, e); if (!lk) continue;
          const [x, y] = g.P(cx, floorY(l), cz);
          voxel(x, y, lk.color, lk.alpha, !lk.color);
          if (lk.even) wire(x, y);
        } else if (coreRank[i] >= 0 && grey[l] > 0 && !hidden.has('grey')) {
          const [x, y] = g.P(cx, floorY(l), cz);
          voxel(x, y, GREY, solid.get('grey') ?? 1);
        }
      }
    }
    c.globalAlpha = 1;
    dirty = false;
  }

  // One frame: the block, then the glow of the experts picked for the words in `lit` (newest last; each
  // { skill, e: [[ids] per layer], age 0..1 }), the picked voxel's marker, and the caption and key for a video.
  function draw(lit = []) {
    if (!rec) return;
    resize();
    if (reveal < 1) lit = []; // nothing lights up while the block is still being built or taken apart
    if (dirty || !staticCanvas) drawStatic();
    const g = geom, k = css();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(staticCanvas, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    if (floorsNow && reveal >= 1) { // the whole floor glows by how hard it's working; no single blocks
      const { W, D } = lay;
      for (let l = 0; l < lay.L; l++) {
        const v = floorsNow[l] || 0; if (v <= 0.02) continue;
        const y = floorY(l), q = [g.P(0, y, 0), g.P(W, y, 0), g.P(W, y, D), g.P(0, y, D)];
        ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath();
        ctx.globalAlpha = Math.min(0.4, (0.03 + 0.22 * v * v) * Math.max(0.3, glow * 1.4)); // gentle: many floors add up ctx.fillStyle = oneColour(); ctx.fill();
        if (v > 0.6) { ctx.globalAlpha = Math.min(0.5, 0.35 * (v - 0.6) / 0.4 * Math.max(0.3, glow)); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, g.s * 0.08); ctx.stroke(); }
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      drawWords(k); return;
    }
    const missed = [], outlined = [];
    const pop = g.s * 0.5 * Math.cos(tilt);
    lit.slice(-TRAIL).forEach((f) => {
      const a = Math.max(0, 1 - f.age);
      if (a <= 0.02) return;
      const now = f.age === 0;
      let prev = null;
      for (let l = 0; l < lay.L; l++) {
        const ids = f.e[l] || [];
        const pts = [];
        for (const e of ids) {
          const top = sp.top[l][e];
          const [cx, cz] = expertXY(e); const [x, y0] = g.P(cx, floorY(l), cz);
          if (off && off[l]?.has(e)) { if (now) missed.push([x, y0]); continue; } // it was picked, and it's turned off
          if (top >= 0 && hidden.has(top)) continue;
          const y = y0 - (now ? pop : pop * a * 0.6);
          const color = mono ? oneColour() : top >= 0 ? lookOf(top)[0] : '#ffffff';
          ctx.fillStyle = color;
          // the halo and the white core scale with Glow; the lit face itself stays visible even with Glow at 0
          if (mark !== 'glow') { if (now) outlined.push([x, y0, color]); if (mark === 'outline') { pts.push([x, y0]); continue; } }
          if (now && glow > 0) { ctx.globalAlpha = Math.min(0.4, 0.22 * glow); ctx.beginPath(); ctx.arc(x, y, Math.max(2, g.s * 0.8), 0, 6.283); ctx.fill(); }
          ctx.globalAlpha = now ? Math.min(1, 0.45 + 0.55 * glow) : Math.min(0.5, 0.3 * a * glow); face(ctx, g, x, y); ctx.fill();
          if (now && glow > 0.6) { ctx.globalAlpha = Math.min(0.45, 0.3 * (glow - 0.6) / 0.4); ctx.fillStyle = '#ffffff'; face(ctx, g, x, y); ctx.fill(); }
          pts.push([x, y]);
        }
        if (now && paths && prev && pts.length && prev.length) {
          ctx.globalAlpha = Math.min(0.08, 0.045 * Math.max(0.4, glow)); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, g.s * 0.06);
          ctx.beginPath(); for (const p of prev) for (const q of pts) { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); } ctx.stroke();
        }
        if (pts.length) prev = pts;
      }
    });
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (outlined.length) { // Outline: the voxel's own edge drawn bright in its colour, with a thin light rim so it reads on any colour
      for (const [x, y, color] of outlined) { ctx.lineWidth = Math.max(2, g.s * 0.16); ctx.strokeStyle = color; face(ctx, g, x, y); ctx.stroke(); ctx.lineWidth = Math.max(1, g.s * 0.05); ctx.strokeStyle = k.text; ctx.stroke(); }
    }
    if (missed.length) { // a red ring with a stroke through it where a turned-off expert was wanted
      const r = Math.max(3, g.s * 0.42); ctx.strokeStyle = '#ff5a4f'; ctx.lineWidth = Math.max(1.5, g.s * 0.1);
      for (const [x, y] of missed) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.moveTo(x - r * 0.7, y + r * 0.7); ctx.lineTo(x + r * 0.7, y - r * 0.7); ctx.stroke(); }
    }
    if (picked && reveal >= 1) {
      const [cx, cz] = expertXY(picked.expert); const [x, y] = g.P(cx, floorY(picked.layer), cz);
      ctx.strokeStyle = k.text; ctx.lineWidth = Math.max(2, g.s * 0.12); face(ctx, g, x, y); ctx.stroke();
    }
    drawWords(k);
  }

  // The key and the caption are drawn on the picture too, so a saved video explains itself.
  function setCaption(c) { caption = c; }
  function drawWords(k) {
    const dpr = canvas.width / Math.max(1, canvas.clientWidth), cw = canvas.width, ch = canvas.height;
    const fs = Math.round(12 * dpr), pad = Math.round(8 * dpr);
    ctx.font = `${fs}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
    let x = pad, y = pad + fs / 2;
    const item = (color, label, off, wired) => {
      const w = ctx.measureText(label).width + fs * 1.9;
      if (x + w > cw - pad) { x = pad; y += fs * 1.6; }
      ctx.globalAlpha = off ? 0.35 : 1;
      if (color) { ctx.fillStyle = color; ctx.fillRect(x, y - fs * 0.4, fs * 0.8, fs * 0.8); } else { ctx.strokeStyle = k.muted; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y - fs * 0.4 + 0.5, fs * 0.8, fs * 0.8); }
      if (wired) { ctx.globalAlpha = off ? 0.35 : 0.9; ctx.strokeStyle = wireColour(k.bg); ctx.lineWidth = Math.max(1, dpr); ctx.setLineDash([Math.max(2, fs * 0.16), Math.max(2, fs * 0.12)]); ctx.strokeRect(x + 0.5, y - fs * 0.4 + 0.5, fs * 0.8, fs * 0.8); ctx.setLineDash([]); ctx.globalAlpha = off ? 0.35 : 1; }
      ctx.fillStyle = k.text; ctx.fillText(label, x + fs * 1.1, y);
      ctx.globalAlpha = 1; x += w;
    };
    if (key && mono) { item(oneColour(), say(rec, 'Experts (one colour)')); item(GREY, say(rec, 'Not experts'), hidden.has('grey')); item(null, 'Never picked', hidden.has('never')); }
    else if (key) {
      rec.skills.forEach((s, i) => item(lookOf(i)[0], `${lookOf(i)[1]} ${s.label}`, hidden.has(i)));
      if (sp.evens ?? sp.even?.some((r) => r.some(Boolean))) item(GREY + '55', 'All-rounders', hidden.has('even'), true);
      item(GREY, say(rec, 'Not experts'), hidden.has('grey'));
      item(null, 'Never picked', hidden.has('never'));
    }
    if (!caption) return;
    const lines = [caption.title, caption.text].filter(Boolean);
    const lh = fs * 1.5, boxH = lines.length * lh + pad;
    ctx.globalAlpha = 0.8; ctx.fillStyle = k.panel; ctx.fillRect(0, ch - boxH, cw, boxH); ctx.globalAlpha = 1;
    lines.forEach((t, i) => {
      ctx.fillStyle = i === 0 ? (caption.color || k.text) : k.text;
      ctx.font = `${i === 0 ? '600 ' : ''}${fs}px system-ui, sans-serif`;
      let s = t; const max = cw - 2 * pad;
      if (ctx.measureText(s).width > max) { while (s.length > 4 && ctx.measureText(`…${s}`).width > max) s = s.slice(Math.ceil(s.length * 0.08)); s = `…${s}`; } // keep the newest words
      ctx.fillText(s, pad, ch - boxH + pad / 2 + lh * (i + 0.5));
    });
  }

  // Which voxel is under a point of the canvas (in CSS pixels): the nearest expert on the highest floor that has one there.
  function pick(px, py) {
    if (!geom || !rec) return null;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth), x = px * dpr, y = py * dpr, g = geom;
    const r2 = (g.s * 0.55) ** 2;
    for (let l = lay.L - 1; l >= 0; l--) {
      let best = null, bd = r2;
      for (let e = 0; e < lay.E; e++) {
        if (!lookAt(l, e)) continue;
        const [cx, cz] = expertXY(e); const [vx, vy] = g.P(cx, floorY(l), cz);
        const d = (vx - x) ** 2 + (vy - y) ** 2; if (d < bd) { bd = d; best = e; }
      }
      if (best !== null) return { layer: l, expert: best };
    }
    return null;
  }

  const setFloors = (a) => { floorsNow = Array.isArray(a) ? a : null; }; // every frame, so it doesn't redraw the block
  return { setData, set, get, cubeGap, draw, sweep, loading: () => reveal < 1, setFloors, pick, setCaption, resize, layout: () => lay, still: () => still };
}
