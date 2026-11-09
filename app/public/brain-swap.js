// The brain-swap machine: a little pixel Rube Goldberg contraption that lifts Bob's lid,
// pulls out the old brain, and springs the new one in. Plays on a loop while a model loads.
import { motionOff } from './themes.js';
import { BOB, PALETTE } from './bob-sprite.js';

const W = 320, H = 100;
const LOOP_MS = 3600;
const PX = 3;            // Bob's pixel size
const HX = 200, HY = 40; // where Bob's sprite starts
const HEAD_CX = HX + 8 * PX;

const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
const seg = (f, a, b) => (f - a) / (b - a); // 0..1 inside [a, b]
const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

function hue(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function brain(ctx, cx, cy, h) {
  const base = `hsl(${h} 70% 70%)`, dark = `hsl(${h} 55% 45%)`;
  rect(ctx, cx - 9, cy - 3, 18, 9, base);
  rect(ctx, cx - 12, cy, 24, 6, base);
  rect(ctx, cx - 6, cy - 6, 12, 3, base);
  rect(ctx, cx - 6, cy - 2, 2, 5, dark);
  rect(ctx, cx, cy - 4, 2, 6, dark);
  rect(ctx, cx + 5, cy, 2, 4, dark);
  rect(ctx, cx - 10, cy + 3, 4, 2, dark);
}

// Bob's body without the lid (hair rows 0-2), and the lid on its own.
// ox: how far left or right of Bob's spot (a copy of Bob stands at COPY_DX). tint: a copy wears other colours.
function body(ctx, ox = 0, tint = 0) {
  if (tint) ctx.filter = `hue-rotate(${tint}deg)`;
  BOB.forEach((row, y) => {
    if (y < 3) return;
    [...row].forEach((ch, x) => { if (ch !== '.') rect(ctx, HX + ox + x * PX, HY + y * PX, PX, PX, PALETTE[ch]); });
  });
  ctx.filter = 'none';
}
function lid(ctx, dx, dy, ox = 0, tint = 0) {
  if (tint) ctx.filter = `hue-rotate(${tint}deg)`;
  BOB.forEach((row, y) => {
    if (y >= 3) return;
    [...row].forEach((ch, x) => { if (ch !== '.') rect(ctx, HX + ox + x * PX + dx, HY + y * PX + dy, PX, PX, PALETTE[ch]); });
  });
  ctx.filter = 'none';
}

function claw(ctx, x, y, open) {
  const metal = '#9aa3ad', dark = '#5d6670';
  rect(ctx, x, 8, 1, y - 8, '#c7b296');      // cable
  rect(ctx, x - 6, y, 13, 3, metal);         // head
  rect(ctx, x - (open ? 9 : 7), y + 3, 3, 6, dark);
  rect(ctx, x + (open ? 7 : 5), y + 3, 3, 6, dark);
}

function scene(ctx, f, fromHue, toHue, t, empty = false) {
  ctx.clearRect(0, 0, W, H);
  const wood = '#7a5232', woodDark = '#4a3220', metal = '#9aa3ad';

  // Rail and pulley
  rect(ctx, 104, 4, 212, 4, woodDark);
  rect(ctx, 100, 2, 8, 8, metal);

  // Ramp, ball, lever, string to the pulley
  for (let i = 0; i < 40; i++) rect(ctx, 6 + i * 2, 20 + i, 3, 2, wood);
  const fall = ease(seg(f, 0, 0.14));
  const bx = f < 0.14 ? lerp(10, 84, fall) : f < 0.2 ? lerp(84, 96, seg(f, 0.14, 0.2)) : 96;
  const by = f < 0.14 ? lerp(14, 54, fall) : f < 0.2 ? lerp(54, 66, seg(f, 0.14, 0.2)) : 66;
  if (f < 0.97) rect(ctx, bx - 3, by - 3, 6, 6, '#e05a4a');
  const tipped = f >= 0.16 && f < 0.97;
  const ly = tipped ? 0 : 6;
  for (let i = 0; i < 12; i++) rect(ctx, 90 + i * 2, 70 - (tipped ? -i * 0.5 : i * 0.5) - ly / 2, 3, 2, woodDark);
  rect(ctx, 100, 70, 3, 14, woodDark);
  rect(ctx, 104, 10, 1, tipped ? 54 : 58, '#c7b296');

  // Conveyor belt for the old brain
  rect(ctx, 250, 90, 70, 4, '#3a3a3a');
  for (let i = 0; i < 7; i++) rect(ctx, 252 + ((i * 10 + t / 40) % 68), 90, 3, 2, '#777');

  // Spring with the new brain waiting
  const squash = f > 0.66 && f < 0.72 ? 6 * seg(f, 0.66, 0.72) : 0;
  for (let i = 0; i < 5; i++) rect(ctx, 142, 94 - i * (4 - squash / 5) - 2, 16, 2, metal);
  rect(ctx, 140, 94, 20, 4, woodDark);

  // Claw path
  let cx = 120, cy = 14, open = true, carryLid = false, carryOld = false;
  if (f < 0.16) { cx = 120; }
  else if (f < 0.26) { cx = lerp(120, HEAD_CX, ease(seg(f, 0.16, 0.26))); }
  else if (f < 0.33) { cx = HEAD_CX; cy = lerp(14, HY - 8, ease(seg(f, 0.26, 0.33))); }
  else if (f < 0.37) { cx = HEAD_CX; cy = HY - 8; open = false; }
  else if (f < 0.44) { cx = HEAD_CX; cy = lerp(HY - 8, 12, ease(seg(f, 0.37, 0.44))); open = false; carryLid = true; carryOld = true; }
  else if (f < 0.54) { cx = lerp(HEAD_CX, 290, ease(seg(f, 0.44, 0.54))); cy = 12; open = false; carryLid = true; carryOld = true; }
  else if (f < 0.64) { cx = 290; cy = 12; open = false; carryLid = true; }
  else if (f < 0.74) { cx = lerp(290, HEAD_CX, ease(seg(f, 0.64, 0.74))); cy = 12; open = false; carryLid = true; }
  else if (f < 0.88) { cx = HEAD_CX; cy = 12; open = false; carryLid = true; }
  else if (f < 0.93) { cx = HEAD_CX; cy = lerp(12, HY - 8, ease(seg(f, 0.88, 0.93))); open = false; carryLid = true; }
  else { cx = HEAD_CX; cy = lerp(HY - 8, 14, ease(seg(f, 0.93, 1))); }

  // Bob
  body(ctx);
  const lidDX = carryLid ? cx - HEAD_CX : 0;
  const lidDY = carryLid ? cy - (HY - 8) : 0;

  // Old brain: in the head, then with the claw, then dropped on the belt
  if (empty) { /* 'load': nothing was in the head, so there's no old brain to take out */ }
  else if (carryOld) brain(ctx, cx, cy + 22, fromHue);
  else if (f >= 0.54 && f < 0.9) {
    const d = seg(f, 0.54, 0.6);
    const ox = f < 0.6 ? 290 : lerp(290, 340, seg(f, 0.6, 0.85));
    brain(ctx, ox, lerp(34, 84, ease(d)), fromHue);
  }

  // New brain: waits on the spring, flies in an arc, lands in the head
  if (f < 0.72) brain(ctx, 150, 80 + squash, toHue);
  else if (f < 0.84) {
    const k = seg(f, 0.72, 0.84);
    brain(ctx, lerp(150, HEAD_CX, k), lerp(80, HY + 4, k) - Math.sin(k * Math.PI) * 50, toHue);
  } else if (f < 0.93) brain(ctx, HEAD_CX, HY + 4, toHue);

  lid(ctx, lidDX, lidDY);
  claw(ctx, cx, cy, open);

  // Ding
  if (f > 0.93) {
    const a = seg(f, 0.93, 1);
    ctx.globalAlpha = 1 - a;
    for (const [dx, dy] of [[-22, -6], [22, -6], [0, -16]]) rect(ctx, HEAD_CX + dx * (0.6 + a), HY + dy * (0.6 + a), 3, 3, '#ffe08a');
    ctx.globalAlpha = 1;
  }
}

// 1.5.49: more than one way to change brains, each with its own little scene.
//   swap:   the old brain goes out on the belt and the new one springs in (one brain at a time).
//   load:   Bob's head was empty: the claw lifts the lid and the new brain springs in.
//   add:    a second brain joins beside Bob's (a moot, or the picture model): a copy of Bob in other colours walks
//           in, the brain springs into the copy's head, and the two talk it over. Bob keeps his own brain.
//   drop:   one brain is let go while another stays: the copy's brain goes out on the belt and the copy walks off.
//   unload: Bob lets go of his last brain: it goes out on the belt and he dozes (zzz).
export const MODES = ['swap', 'load', 'add', 'drop', 'unload'];
const COPY_DX = -96, COPY_TINT = 40, SPRING_X = 30;

function belt(ctx, t) {
  rect(ctx, 250, 90, 70, 4, '#3a3a3a');
  for (let i = 0; i < 7; i++) rect(ctx, 252 + ((i * 10 + t / 40) % 68), 90, 3, 2, '#777');
}
function spring(ctx, squash = 0, x = 142) {
  const metal = '#9aa3ad';
  for (let i = 0; i < 5; i++) rect(ctx, x, 94 - i * (4 - squash / 5) - 2, 16, 2, metal);
  rect(ctx, x - 2, 94, 20, 4, '#4a3220');
}
function talk(ctx, x, y, f) { // three dots: the two of them talking it over
  for (let i = 0; i < 3; i++) if ((f * 6 + i) % 3 < 2) rect(ctx, x + i * 6, y, 3, 3, '#ffe08a');
}

function sceneAdd(ctx, f, fromHue, toHue, t) {
  ctx.clearRect(0, 0, W, H);
  rect(ctx, 104, 4, 212, 4, '#4a3220');
  // The copy walks in from the left, lid already off for the new brain.
  const ox = COPY_DX + lerp(-140, 0, ease(seg(f, 0, 0.3)));
  const squash = f > 0.34 && f < 0.4 ? 6 * seg(f, 0.34, 0.4) : 0;
  spring(ctx, squash, SPRING_X);
  body(ctx); lid(ctx, 0, 0);                      // Bob keeps his brain, lid shut
  body(ctx, ox, COPY_TINT);
  const copyHead = HEAD_CX + COPY_DX;
  if (f < 0.4) brain(ctx, SPRING_X + 8, 80 + squash, toHue);
  else if (f < 0.55) { const k = seg(f, 0.4, 0.55); brain(ctx, lerp(SPRING_X + 8, copyHead, k), lerp(80, HY + 4, k) - Math.sin(k * Math.PI) * 40, toHue); }
  else if (f < 0.62) brain(ctx, copyHead, HY + 4, toHue);
  const lidUp = f < 0.62 ? -14 : lerp(-14, 0, ease(seg(f, 0.62, 0.68)));
  lid(ctx, 0, lidUp, ox, COPY_TINT);
  if (f > 0.7) talk(ctx, (copyHead + HEAD_CX) / 2 - 8, HY - 14, f);
  // A small table between them: the moot
  if (f > 0.66) { rect(ctx, copyHead + 6, HY + 40, HEAD_CX - copyHead - 12, 3, '#7a5232'); rect(ctx, (copyHead + HEAD_CX) / 2 - 1, HY + 43, 3, 12, '#4a3220'); }
}

function sceneDrop(ctx, f, fromHue, toHue, t) {
  ctx.clearRect(0, 0, W, H);
  rect(ctx, 104, 4, 212, 4, '#4a3220');
  belt(ctx, t);
  body(ctx); lid(ctx, 0, 0);                      // Bob keeps his brain
  const copyHead = HEAD_CX + COPY_DX;
  const leave = ease(seg(f, 0.7, 1));
  const ox = COPY_DX - leave * 170;
  body(ctx, ox, COPY_TINT);
  // The claw lifts the copy's lid and brain, carries the brain to the belt, puts the lid back.
  let cx = copyHead, cy = 14, open = true, lidDY = 0, carry = false;
  if (f < 0.12) { cx = lerp(120, copyHead, ease(seg(f, 0, 0.12))); }
  else if (f < 0.2) { cy = lerp(14, HY - 8, ease(seg(f, 0.12, 0.2))); }
  else if (f < 0.3) { cy = lerp(HY - 8, 12, ease(seg(f, 0.2, 0.3))); open = false; carry = true; lidDY = cy - (HY - 8); }
  else if (f < 0.45) { cx = lerp(copyHead, 290, ease(seg(f, 0.3, 0.45))); cy = 12; open = false; carry = true; }
  else if (f < 0.6) { cx = lerp(290, 120, ease(seg(f, 0.45, 0.6))); cy = 12; }
  else { cx = 120; }
  if (carry) brain(ctx, cx, cy + 22, fromHue);
  else if (f < 0.12 || f >= 0.2 && f < 0.3) brain(ctx, copyHead, HY + 4, fromHue);
  if (f >= 0.45 && f < 0.75) brain(ctx, lerp(290, 330, seg(f, 0.45, 0.75)), lerp(34, 84, ease(seg(f, 0.45, 0.52))), fromHue);
  const lidX = f >= 0.2 && f < 0.45 ? cx - copyHead : 0;
  lid(ctx, f >= 0.3 && f < 0.45 ? lidX : 0, f >= 0.2 && f < 0.3 ? lidDY : f >= 0.3 && f < 0.45 ? 12 - (HY - 8) : 0, ox, COPY_TINT);
  claw(ctx, cx, cy, open);
}

function sceneUnload(ctx, f, fromHue, toHue, t) {
  ctx.clearRect(0, 0, W, H);
  rect(ctx, 104, 4, 212, 4, '#4a3220');
  belt(ctx, t);
  body(ctx);
  let cx = 120, cy = 14, open = true, carry = false, lidUp = false;
  if (f < 0.15) cx = lerp(120, HEAD_CX, ease(seg(f, 0, 0.15)));
  else if (f < 0.22) { cx = HEAD_CX; cy = lerp(14, HY - 8, ease(seg(f, 0.15, 0.22))); }
  else if (f < 0.32) { cx = HEAD_CX; cy = lerp(HY - 8, 12, ease(seg(f, 0.22, 0.32))); open = false; carry = true; lidUp = true; }
  else if (f < 0.45) { cx = lerp(HEAD_CX, 290, ease(seg(f, 0.32, 0.45))); cy = 12; open = false; carry = true; }
  else if (f < 0.58) { cx = lerp(290, HEAD_CX, ease(seg(f, 0.45, 0.58))); cy = 12; open = false; lidUp = true; }
  else if (f < 0.66) { cx = HEAD_CX; cy = lerp(12, HY - 8, ease(seg(f, 0.58, 0.66))); open = false; lidUp = true; }
  else cx = lerp(HEAD_CX, 120, ease(seg(f, 0.66, 0.8)));
  if (carry) brain(ctx, cx, cy + 22, fromHue);
  else if (f < 0.22) brain(ctx, HEAD_CX, HY + 4, fromHue);
  if (f >= 0.45 && f < 0.8) brain(ctx, lerp(290, 330, seg(f, 0.45, 0.8)), lerp(34, 84, ease(seg(f, 0.45, 0.52))), fromHue);
  lid(ctx, lidUp ? cx - HEAD_CX : 0, lidUp ? cy - (HY - 8) : 0);
  claw(ctx, cx, cy, open);
  if (f > 0.8) for (let i = 0; i < 3; i++) { const a = (f * 3 + i / 3) % 1; ctx.globalAlpha = 1 - a; rect(ctx, HEAD_CX + 14 + i * 6 + a * 10, HY - 4 - i * 6 - a * 10, 4, 1, '#c7b296'); rect(ctx, HEAD_CX + 17 + i * 6 + a * 10, HY - 1 - i * 6 - a * 10, 4, 1, '#c7b296'); }
  ctx.globalAlpha = 1;
}

function draw(ctx, mode, f, fromHue, toHue, t) {
  if (mode === 'add') return sceneAdd(ctx, f, fromHue, toHue, t);
  if (mode === 'drop') return sceneDrop(ctx, f, fromHue, toHue, t);
  if (mode === 'unload') return sceneUnload(ctx, f, fromHue, toHue, t);
  return scene(ctx, f, fromHue, toHue, t, mode === 'load');
}

// The words that go with each scene (also the canvas's label, for screen readers).
export function sceneLabel(mode) {
  return { swap: 'A contraption swaps Bob\'s brain', load: 'A contraption puts a brain into Bob\'s empty head', add: 'A copy of Bob walks in with a second brain to talk it over', drop: 'A copy of Bob hands back its brain and walks off; Bob keeps his', unload: 'Bob\'s brain goes out on the belt and he dozes' }[MODES.includes(mode) ? mode : 'swap'];
}

// loop: true while something loads (the chat); false plays once and holds the last frame (the Now running panel).
export function startSwap(canvas, { from = 'old', to = 'new', mode = 'swap', loop = true, onEnd = null } = {}) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const fromHue = hue(from), toHue = hue(to);
  const t0 = performance.now();
  let raf = 0;
  const reduce = motionOff();
  const tick = (now) => {
    const t = now - t0;
    const done = !loop && t >= LOOP_MS;
    draw(ctx, mode, reduce ? 0.99 : done ? 0.999 : (t % LOOP_MS) / LOOP_MS, fromHue, toHue, t);
    if (done || reduce) { onEnd?.(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

// For testing: draw one frame at a given point in the loop (0..1).
export function drawFrame(ctx, f, from = 'old', to = 'new', mode = 'swap') {
  draw(ctx, mode, f, hue(from), hue(to), f * LOOP_MS);
}

// ---- 1.5.49: the brain bay in Now running ----
// What Bob holds, from a brain reading: each brain by name, and the picture model if one is loaded.
export function heldItems(st) {
  const out = (st?.models || []).map((m) => m.name).filter(Boolean);
  if (st?.picture) out.push('picture model');
  return out;
}
// What changed between two readings, as one of the scenes, with the words for it. null when nothing changed.
export function bayChange(prev, cur) {
  const gone = prev.filter((x) => !cur.includes(x)), came = cur.filter((x) => !prev.includes(x)), kept = cur.filter((x) => prev.includes(x));
  if (!gone.length && !came.length) return null;
  const nm = (x) => (x === 'picture model' ? 'the picture model' : x);
  if (!prev.length) return { mode: 'load', from: '', to: came[0], text: `Loaded ${came.map(nm).join(' and ')}.` };
  if (!cur.length) return { mode: 'unload', from: gone[0], to: '', text: `Let go of ${gone.map(nm).join(' and ')}. Nothing of Bob's is loaded now.` };
  if (came.length && !gone.length) return { mode: 'add', from: kept[0], to: came[0], text: `${cap(nm(came[0]))} joined ${kept.map(nm).join(' and ')}. Both are loaded.` };
  if (gone.length && !came.length) return { mode: 'drop', from: gone[0], to: kept[0], text: `Let go of ${gone.map(nm).join(' and ')}. ${cap(kept.map(nm).join(' and '))} stays loaded.` };
  return { mode: 'swap', from: gone[0], to: came[0], text: `Swapped ${nm(gone[0])} for ${nm(came[0])}.` };
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Plays the scene once in the given box and says what happened under it. Settings sign-off (1.5.49): the scene goes
// after 8 seconds but the line stays (with the time) for 2 minutes, so a late glance still sees it; with Animations off
// (or Windows asking for less motion) there's only the line.
export function createBrainBay(box, { sceneMs = 8000, textMs = 120000, still = motionOff } = {}) {
  let prev = null, stop = null, sceneTimer = 0, textTimer = 0;
  return (st) => {
    const cur = heldItems(st);
    // Mid-swap the engine holds nothing for a moment: wait for the new brain, so it shows as one swap, not let-go + load.
    if (prev?.length && !cur.length && ['waking', 'working', 'loading'].includes(st?.state)) return null;
    const change = prev ? bayChange(prev, cur) : null;
    prev = cur;
    if (!change || !box) return null;
    stop?.(); clearTimeout(sceneTimer); clearTimeout(textTimer);
    box.replaceChildren();
    const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const words = Object.assign(document.createElement('div'), { className: 'bay-text', textContent: `${change.text} (${at})` });
    if (!still()) {
      const c = document.createElement('canvas');
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', sceneLabel(change.mode));
      box.append(c);
      stop = startSwap(c, { from: change.from || 'old', to: change.to || 'new', mode: change.mode, loop: false });
      sceneTimer = setTimeout(() => { stop?.(); c.remove(); }, sceneMs);
    }
    box.append(words);
    box.hidden = false;
    textTimer = setTimeout(() => { stop?.(); box.hidden = true; box.replaceChildren(); }, textMs);
    return change;
  };
}
