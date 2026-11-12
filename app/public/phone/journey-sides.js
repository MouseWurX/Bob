// Made by android/tools/make-shared.mjs from public/journey-sides.js. Don't edit.
(function () {
// 🧭 Journey (1.5.206): every look seen from four sides, walking, with its weapon held at any angle.
// Bob's looks, the avatars and the character screen's looks are all 16x16 busts seen from the front. This turns any
// of them into a 16x20 walking figure (legs added below the body) facing down (towards you), left, right or up (away),
// with a four-step walk. Weapons and shields are drawn on top as their own shapes, at any angle, so a sword can rest
// in the hand when walking and swing through a full arc in a fight, whichever way the figure faces.
// No imports: the phone uses this same file, made into a plain script (globalThis.BobJourneySides) by
// android/tools/make-shared.mjs. A look made on the character screen is drawn again without its kit by the
// compose() you pass in (public/avatars.js), so the kit can be drawn turning with the figure.

const FACINGS = ['down', 'left', 'right', 'up'];
const FACING_NAMES = { down: 'Front', left: 'Left', right: 'Right', up: 'Back' };
const FIGURE_W = 16, FIGURE_H = 20;
const FEATURES = new Set(['E', 'X', 'O', 'N', 'R', 'M', 'G']);
const NO_LEGS = new Set(['beast', 'crawler', 'blob', 'giant']);
const KIT_COLOURS = { T: '#d8dee6', t: '#9aa3ad', U: '#8a5a2b', Z: '#ffd166', W: '#efe6d2', V: '#7a4a24', F: '#b8c4cf' };

// A colour a little darker (for the legs and the far leg).
function darker(hex, by = 0.7) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#2a2a30';
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * by))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const mode = (chars) => {
  const n = new Map();
  for (const ch of chars) if (ch !== '.') n.set(ch, (n.get(ch) || 0) + 1);
  let best = '.', top = 0;
  for (const [ch, k] of n) if (k > top) { best = ch; top = k; }
  return best;
};
const span = (row) => { const a = row.search(/[^.]/); if (a < 0) return null; let b = row.length - 1; while (row[b] === '.') b--; return [a, b]; };
const mirrorRows = (rows) => rows.map((r) => [...r].reverse().join(''));
const setAt = (row, x, ch) => (x < 0 || x >= row.length ? row : row.slice(0, x) + ch + row.slice(x + 1));

// What a look is: its body kind (for monsters), whether it gets legs, and its map without the kit.
function shapeOf(look, compose) {
  const parts = look?.parts || null;
  const body = parts?.body || '';
  let map = look?.map || [];
  let kit = { weapon: 'none', shield: 'none' };
  if (parts && typeof compose === 'function' && (parts.weapon !== 'none' || parts.shield !== 'none')) {
    try { map = compose({ ...parts, weapon: 'none', shield: 'none' }).map; kit = { weapon: parts.weapon, shield: parts.shield }; } catch {}
  } else if (parts) kit = { weapon: parts.weapon || 'none', shield: parts.shield || 'none' };
  const legless = NO_LEGS.has(body) || /slime|ghost|blob|wisp/i.test(look?.name || '');
  return { body, map: map.slice(0, 16), kit, legs: !legless };
}

// The back of the head: hair (or the head's own colour) where the face was, and the whole thing mirrored.
function backRows(map) {
  const hairHead = map.slice(0, 5).some((r) => r.includes('H'));
  // Without hair, the back of the head is the colour of its edges (a robot's casing, an alien's skin), not its face.
  const edges = []; map.slice(0, 11).forEach((row) => { const s = span(row); if (s) edges.push(row[s[0]], row[s[1]]); });
  const shell = mode(edges.filter((ch) => !FEATURES.has(ch)));
  const out = map.map((row, y) => {
    const s = span(row); if (!s) return row;
    const [a, b] = s;
    if (y <= 10) {
      const fill = hairHead && y <= 8 ? 'H' : y <= 8 && shell !== '.' ? shell : mode([...row].filter((ch) => !FEATURES.has(ch)));
      return [...row].map((ch, x) => (ch === '.' || x === a || x === b ? (FEATURES.has(ch) ? fill : ch) : y <= 8 || FEATURES.has(ch) ? fill : ch)).join('');
    }
    return row.replace(/D/g, mode([...row].filter((ch) => ch !== 'D')));
  });
  // Long hair that falls past the shoulders covers the top of the back too.
  for (let y = 11; y <= 13; y++) { const r = map[y] || ''; if (r[2] === 'H' && r[13] === 'H') for (let x = 4; x <= 11; x++) if (out[y][x] !== '.') out[y] = setAt(out[y], x, 'H'); }
  return mirrorRows(out);
}

// The left side: each row narrowed round its middle, the face's features moved to the front edge, hair at the back.
function profileRows(map) {
  const hairHead = map.slice(0, 5).some((r) => r.includes('H'));
  return map.map((row, y) => {
    const s = span(row); if (!s) return row;
    const [a, b] = s, w = b - a + 1, c = (a + b) / 2;
    const nw = Math.max(1, Math.round(w * (y <= 10 ? 0.72 : 0.58)));
    const from = Math.max(0, Math.min(16 - nw, Math.round(c - nw / 2)));
    let slice = row.slice(from, from + nw);
    let out = '.'.repeat(from) + slice + '.'.repeat(16 - from - nw);
    if (y > 10) return out;
    const plain = mode([...slice].filter((ch) => !FEATURES.has(ch))) || 'S';
    out = [...out].map((ch) => (FEATURES.has(ch) ? plain : ch)).join('');
    const front = from, back = from + nw - 1;
    if (hairHead && (row[a] === 'H' || row[b] === 'H' || (y >= 3 && y <= 8 && row.includes('H')))) {
      const n = Math.max(1, Math.round(nw * (y <= 3 ? 0.5 : 0.35)));
      for (let x = back - n + 1; x <= back; x++) out = setAt(out, x, 'H');
    }
    if (row.includes('G') && row.includes('E')) { out = setAt(out, front, 'G'); out = setAt(out, front + 2, 'G'); }
    if (row.includes('E')) out = setAt(out, front + 1, 'E');
    if (row.includes('N')) out = setAt(out, front - 1 >= 0 ? front - 1 : front, 'N');
    if (row.includes('M')) { out = setAt(out, front, 'M'); out = setAt(out, front + 1, 'M'); }
    if (row.includes('X')) out = setAt(out, front + 1, 'X');
    return out;
  });
}

// Legs (rows 16-19): '1' trousers, '3' the far leg, '2' boots. step 0/2 stand, 1 one leg forward, 3 the other.
function legRows(rows, facing, step) {
  const blank = () => '.'.repeat(16);
  const legs = [blank(), blank(), blank(), blank()];
  const paint = (y, x0, x1, ch) => { for (let x = x0; x <= x1; x++) legs[y] = setAt(legs[y], x, ch); };
  const torso = span(rows[15] || '') || [4, 11];
  const c = Math.round((torso[0] + torso[1]) / 2);
  if (facing === 'down' || facing === 'up') {
    const L = c - 3, R = c + 1;
    const leg = (x, up) => { paint(0, x, x + 1, '1'); paint(1, x, x + 1, '1'); if (up) paint(2, x, x + 1, '2'); else { paint(2, x, x + 1, '1'); paint(3, x, x + 1, '2'); } };
    leg(L, step === 1); leg(R, step === 3);
  } else {
    // Drawn facing left; the right side is the mirror.
    const near = '1', far = '3';
    if (step % 2 === 0) { paint(0, c - 1, c, near); paint(1, c - 1, c, near); paint(2, c - 1, c, near); paint(3, c - 2, c, '2'); }
    else {
      const [fwd, bwd] = step === 1 ? [near, far] : [far, near];
      paint(0, c - 1, c, near); // the hips
      paint(1, c - 2, c - 1, fwd); paint(2, c - 3, c - 2, fwd); paint(3, c - 4, c - 2, '2');
      paint(1, c, c + 1, bwd); paint(2, c + 1, c + 2, bwd); paint(3, c + 2, c + 3, '2');
    }
  }
  return legs;
}

// The whole figure for one facing and walk step: { rows (20), palette, hand: {x,y}, shieldAt, legs, kit }.
function figure(look, { facing = 'down', step = 0, compose } = {}) {
  if (!look?.map) return null;
  const shape = shapeOf(look, compose);
  const f = FACINGS.includes(facing) ? facing : 'down';
  let head;
  if (shape.body === 'beast') head = f === 'right' ? mirrorRows(shape.map) : f === 'up' ? backRows(mirrorRows(shape.map)) : shape.map;
  else if (shape.body === 'crawler' || shape.body === 'blob') head = f === 'up' ? backRows(shape.map) : shape.map;
  else if (f === 'down') head = shape.map.slice();
  else if (f === 'up') head = backRows(shape.map);
  else head = f === 'left' ? profileRows(shape.map) : mirrorRows(profileRows(shape.map));
  while (head.length < 16) head.push('.'.repeat(16));
  let legs;
  if (shape.legs) {
    // The right side is the left side's legs mirrored, worked out on the left side's body so they line up.
    legs = f === 'right' ? mirrorRows(legRows(mirrorRows(head), 'left', step % 4)) : legRows(head, f, step % 4);
  } else legs = ['.'.repeat(16), '.'.repeat(16), '.'.repeat(16), '.'.repeat(16)];
  let rows = [...head, ...legs];
  // A figure without legs bobs instead: the whole thing drops a pixel on steps 1 and 3.
  if (!shape.legs && step % 2 === 1) rows = ['.'.repeat(16), ...rows.slice(0, 19)];
  // Legless figures stand on the ground like everyone else: move them to the bottom of the 20 rows.
  if (!shape.legs) { let pad = 0; while (pad < 4 && rows[rows.length - 1 - pad] === '.'.repeat(16)) pad++; rows = [...Array(pad).fill('.'.repeat(16)), ...rows.slice(0, 20 - pad)]; }
  const pal = { ...(look.palette || {}) };
  const trousers = pal.Q || darker(pal.P || pal.C || pal.S || '#4a4a55', 0.75);
  pal['1'] = trousers; pal['3'] = darker(trousers, 0.7); pal['2'] = '#2a1d14';
  const hands = { down: { x: 1, y: 13 }, up: { x: 14, y: 13 }, left: { x: 4, y: 13 }, right: { x: 11, y: 13 } };
  const shieldAt = { down: { x: 13, y: 10, front: true }, up: { x: 1, y: 10, front: true }, left: { x: 5, y: 10, front: true }, right: { x: 9, y: 10, front: false } };
  return { rows, palette: pal, hand: hands[f], shieldAt: shieldAt[f], legs: shape.legs, kit: shape.kit, facing: f };
}

// ---------- The kit: weapons drawn as their own shapes, at any angle ----------
// angle in degrees: 0 points straight up, 90 right, 180 down, -90 left. Each weapon is a handle along the angle and a
// head at the end; the points land on the 16x20 grid as [x, y, colour] (they may fall outside it, mid-swing).
const WEAPON_SHAPES = {
  sword: { grip: 2, length: 8, head: 'blade', guard: true },
  dagger: { grip: 1, length: 4, head: 'blade', guard: true },
  axe: { grip: 7, length: 7, head: 'axe' },
  hammer: { grip: 6, length: 6, head: 'hammer' },
  spear: { grip: 9, length: 11, head: 'point' },
  staff: { grip: 10, length: 10, head: 'orb' },
  bow: { grip: 0, length: 0, head: 'bow' },
  // Journey v1.2: a longbow taller than its archer, a crossbow with its stock and a hand crossbow.
  longbow: { grip: 0, length: 0, head: 'bow', reach: 6 },
  crossbow: { grip: 4, length: 4, head: 'xbow', arms: 3 },
  handbow: { grip: 2, length: 2, head: 'xbow', arms: 2 }
};
// The colour a piece of kit takes from what's special about it: rust, a blessing, a curse, arcane light.
const AFFIX_TINTS = { rusty: '#a0522d', blessed: '#ffe680', cursed: '#7a3aa8', arcane: '#5ab8ff', fine: '', keen: '', heavy: '', light: '', sturdy: '', swift: '', mighty: '' };
function tintHex(hex, tint, by = 0.45) {
  const a = /^#([0-9a-f]{6})$/i.exec(hex || ''), b = /^#([0-9a-f]{6})$/i.exec(tint || '');
  if (!a || !b) return hex;
  const n = parseInt(a[1], 16), m = parseInt(b[1], 16);
  const ch = (s) => Math.round(((n >> s) & 255) * (1 - by) + ((m >> s) & 255) * by);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}
const WEAPON_KINDS = Object.keys(WEAPON_SHAPES);
// Where each facing holds the weapon when walking, and the arc it swings through when it strikes.
const REST_ANGLE = { down: -15, up: 15, left: -25, right: 25 };
function swingAngles(facing) {
  const right = [-40, 10, 60, 100, 120];
  if (facing === 'right') return right;
  if (facing === 'left') return right.map((a) => -a);
  if (facing === 'down') return [-60, 0, 70, 140, 170];
  return [60, 0, -70, -140, -170];
}

function weaponCells(kind, angle, hand = { x: 1, y: 13 }) {
  const w = WEAPON_SHAPES[kind];
  if (!w) return [];
  const rad = (angle * Math.PI) / 180, dx = Math.sin(rad), dy = -Math.cos(rad); // along the weapon
  const px = -dy, py = dx; // across it
  const out = [];
  const at = (t, s, colour) => out.push([Math.round(hand.x + dx * t + px * s), Math.round(hand.y + dy * t + py * s), colour]);
  if (w.head === 'bow') {
    // A bow is held across: an arc in front of the hand with its string (a longbow reaches further each way).
    const r = w.reach || 4;
    for (let s = -r; s <= r; s++) { const bend = (r / 2) - (s * s) / (r * 2); at(bend, s, KIT_COLOURS.U); at(0, s, KIT_COLOURS.W); }
    return dedupe(out);
  }
  if (w.head === 'xbow') {
    // A crossbow: a stock along the angle, short arms across its end, a string back to the nut and a bolt on top.
    for (let t = -1; t <= w.grip; t++) at(t, 0, KIT_COLOURS.V);
    for (let s = -w.arms; s <= w.arms; s++) at(w.grip + (Math.abs(s) === w.arms ? -1 : 0), s, KIT_COLOURS.t);
    at(w.grip - 2, -w.arms + 1, KIT_COLOURS.W); at(w.grip - 2, w.arms - 1, KIT_COLOURS.W);
    at(w.grip + 1, 0, KIT_COLOURS.F);
    return dedupe(out);
  }
  for (let t = -1; t < w.grip; t++) at(t, 0, KIT_COLOURS.U);
  if (w.guard) { at(w.grip, -1, KIT_COLOURS.Z); at(w.grip, 0, KIT_COLOURS.Z); at(w.grip, 1, KIT_COLOURS.Z); }
  if (w.head === 'blade') { for (let t = w.grip + 1; t <= w.grip + w.length - 2; t++) at(t, 0, KIT_COLOURS.T); at(w.grip + w.length - 1, 0, KIT_COLOURS.F); }
  if (w.head === 'axe') { at(w.grip - 1, 1, KIT_COLOURS.T); at(w.grip, 1, KIT_COLOURS.T); at(w.grip - 2, 1, KIT_COLOURS.t); at(w.grip - 1, 2, KIT_COLOURS.T); at(w.grip, 2, KIT_COLOURS.T); at(w.grip + 1, 2, KIT_COLOURS.F); at(w.grip - 2, 2, KIT_COLOURS.F); }
  if (w.head === 'hammer') { for (let s = -2; s <= 2; s++) { at(w.grip, s, KIT_COLOURS.t); at(w.grip + 1, s, KIT_COLOURS.T); } }
  if (w.head === 'point') { at(w.grip, 0, KIT_COLOURS.T); at(w.grip + 1, 0, KIT_COLOURS.F); at(w.grip - 1, -1, KIT_COLOURS.T); at(w.grip - 1, 1, KIT_COLOURS.T); }
  if (w.head === 'orb') { at(w.grip, 0, KIT_COLOURS.Z); at(w.grip + 1, 0, KIT_COLOURS.Z); at(w.grip, 1, KIT_COLOURS.Z); at(w.grip + 1, 1, KIT_COLOURS.W); }
  return dedupe(out);
}
function dedupe(cells) { const seen = new Map(); for (const c of cells) seen.set(`${c[0]},${c[1]}`, c); return [...seen.values()]; }

function shieldCells(kind, facing = 'down', at = { x: 13, y: 10 }) {
  if (!kind || kind === 'none') return [];
  const tall = kind === 'tall';
  const h = tall ? 6 : 4, wd = facing === 'left' || facing === 'right' ? 2 : 3;
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < wd; x++) {
    const edge = y === 0 || y === h - 1 || x === 0 || x === wd - 1;
    if (!tall && (y === 0 || y === h - 1) && (x === 0 || x === wd - 1)) continue; // round corners
    out.push([at.x + x, at.y + y, edge ? KIT_COLOURS.t : facing === 'up' ? KIT_COLOURS.V : KIT_COLOURS.T]);
  }
  if (facing !== 'up') out.push([at.x + Math.floor(wd / 2), at.y + Math.floor(h / 2), KIT_COLOURS.Z]);
  return out;
}

// Draws one figure at (x, y) with each pixel px wide. opts: facing, step, weapon (a kind, or the look's own), shield,
// angle (default the facing's rest angle), flash (true = drawn white, for a hit), alpha, compose, hideKit.
function drawFigure(ctx, x, y, px, look, opts = {}) {
  const fig = figure(look, opts);
  if (!fig || !ctx) return fig;
  const weapon = opts.hideKit ? 'none' : opts.weapon || fig.kit.weapon;
  const shield = opts.hideKit ? 'none' : opts.shield || fig.kit.shield;
  const angle = Number.isFinite(opts.angle) ? opts.angle : REST_ANGLE[fig.facing];
  const cell = (cx, cy, colour) => { ctx.fillStyle = opts.flash ? '#ffffff' : colour; ctx.fillRect(Math.floor(x + cx * px), Math.floor(y + cy * px), Math.ceil(px), Math.ceil(px)); };
  // Kit with something special about it (opts.kitTint, a colour) is drawn tinted: rusty, blessed, cursed, arcane.
  const kitCell = (tint) => (cx, cy, colour) => cell(cx, cy, tint ? tintHex(colour, tint) : colour);
  const prevAlpha = ctx.globalAlpha;
  if (Number.isFinite(opts.alpha)) ctx.globalAlpha = opts.alpha;
  const weaponBehind = fig.facing === 'up' || (fig.facing === 'left' && !Number.isFinite(opts.angle));
  const wcells = weapon && weapon !== 'none' ? weaponCells(weapon, angle, fig.hand) : [];
  const scells = shieldCells(shield, fig.facing, fig.shieldAt);
  const wcell = kitCell(opts.weaponTint), scell = kitCell(opts.shieldTint);
  if (weaponBehind) for (const [cx, cy, c] of wcells) wcell(cx, cy, c);
  if (!fig.shieldAt.front) for (const [cx, cy, c] of scells) scell(cx, cy, c);
  fig.rows.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) { const ch = row[rx]; if (ch !== '.') cell(rx, ry, opts.bodyTint ? tintHex(fig.palette[ch] || '#808080', opts.bodyTint, 0.3) : fig.palette[ch] || '#808080'); } });
  if (fig.shieldAt.front) for (const [cx, cy, c] of scells) scell(cx, cy, c);
  if (!weaponBehind) for (const [cx, cy, c] of wcells) wcell(cx, cy, c);
  ctx.globalAlpha = prevAlpha;
  return fig;
}

// ---------- Journey's own creatures (1.5.211, Journey v1.2) ----------
// Animals you can tame, mounts you can ride, and the stranger things of the land. Each is a 16x16 side view facing
// left with its own legs (drawn like a bestiary beast: mirrored to face right, bobbing as it walks). Our own art.
const BEAST_ART = {
  rabbit: { pal: { a: '#a88a6a', b: '#6a5038', c: '#e8dcc8', e: '#141414', k: '#3a2a1c', w: '#ffffff' }, map: [
    '', '', '', '', '', '', '',
    '..b.b...........',
    '..aba...........',
    '..aaa...........',
    '.aeaaa..........',
    'kaaaaaaaaa......',
    '..caaaaaaaab....',
    '...caaaaaaawb...',
    '...a.a...aa.....',
    '...k.k...kk.....'] },
  fox: { pal: { a: '#d9772b', b: '#9a4c18', c: '#f3e3cc', e: '#141414', k: '#2a1a10', w: '#f7f2e8' }, map: [
    '', '', '', '', '',
    '..b.b...........',
    '..aba...........',
    '.aaaaa..........',
    '.aeaaa.......aa.',
    'kaaaaaa.....aaab',
    '.cccaaaaaaaaaab.',
    '...ccaaaaaaaab.w',
    '....caaaaaaab.ww',
    '....b.b..b.b....',
    '....b.b..b.b....',
    '....k.k..k.k....'] },
  crab: { pal: { a: '#d8432a', b: '#8a2416', e: '#111111', k: '#111111' }, map: [
    '', '', '', '', '', '', '', '',
    '..aa........aa..',
    '.a.ak......ka.a.',
    '..aa.e....e.aa..',
    '....baaaaaab....',
    '...baaaaaaaab...',
    '....bbbbbbbb....',
    '...b.b.b.b.b.b..',
    ''] },
  toad: { pal: { a: '#6a9a3a', b: '#3a5a1e', c: '#c8d890', e: '#111111', d: '#4a7a2a' }, map: [
    '', '', '', '', '', '', '', '', '',
    '..bb.bb.........',
    '.beabeab........',
    '.baaaaaadab.....',
    'baacaaadaaaab...',
    'bccccaaaaaaabb..',
    '.bbc.bbbbbbb.bb.',
    '.b......bb....b.'] },
  hawk: { pal: { a: '#8a5a32', b: '#4a2e18', c: '#e8dcc0', e: '#111111', n: '#e8b830', h: '#e8b830' }, map: [
    '', '', '', '', '',
    '..bb............',
    '.baeb...........',
    'nbaaab..........',
    '..baaab.........',
    '...baaabbbb.....',
    '...bcaaaaaabbb..',
    '....bcaaaaaaaabb',
    '.....bccaaab....',
    '......bcab......',
    '......h..h......',
    '......h..h......'] },
  owl: { pal: { a: '#8a6a48', b: '#4a3420', c: '#d8c8a8', w: '#f0e6d0', e: '#111111', n: '#e8b830', h: '#e8b830' }, map: [
    '', '', '', '', '',
    '....b....b......',
    '....bbbbbb......',
    '...bwewwewb.....',
    '...bwwnnwwb.....',
    '...baaaaaab.....',
    '...bacacaab.....',
    '...bacacaabb....',
    '...baaaaaabb....',
    '....baaaab......',
    '.....h..h.......',
    ''] },
  bat: { pal: { a: '#5a3a5a', b: '#2a1a2a', e: '#ff4040' }, map: [
    '', '', '', '', '', '', '',
    '..b..........b..',
    '..bb..b..b..bb..',
    '..bab.bbbb.bab..',
    '..baabbeebbaab..',
    '..baaabbbbaaab..',
    '...baab..baab...',
    '....bb....bb....',
    '', ''] },
  tortoise: { pal: { a: '#6a5a2a', d: '#9a8a4a', b: '#3a3018', g: '#9aa060', e: '#111111', k: '#3a3018' }, map: [
    '', '', '', '', '', '', '', '', '',
    '......bbbbb.....',
    '....bdadadab....',
    '...bdadadadab...',
    'gggbaaaaaaaab...',
    'gegbbbbbbbbbbb..',
    '.gg..gg...gg....',
    '.....kk...kk....'] },
  boar: { pal: { a: '#6b4a32', b: '#3e2a1c', c: '#8a6a4e', e: '#111111', k: '#1e140c', w: '#efe6d0' }, map: [
    '', '', '', '', '', '',
    '....bbbbbbbb....',
    '..bbaaaaaaaab...',
    '.baeaaaaaaaaab..',
    'kaaaaaaaaaaaaab.',
    'waaaaaaaaaaaaab.',
    '.wcaaaaaaaaaaabb',
    '..ccaaaaaaaaab..',
    '...bb.bb..bb.b..',
    '...bb.bb..bb.b..',
    '...kk.kk..kk.k..'] },
  lynx: { pal: { a: '#c9a46a', b: '#8a6a3a', c: '#efe0c0', d: '#7a5a30', e: '#111111', k: '#2a1a10' }, map: [
    '', '', '', '', '',
    '.k..k...........',
    '.a..a...........',
    '.aaaa...........',
    'aeaaab..........',
    'kaaaaaaaaaaaab..',
    '.ccaaaaaaaaaaabk',
    '...caaaaaaaaab..',
    '...cdaadaadaab..',
    '....a.a...a.a...',
    '....a.a...a.a...',
    '....k.k...k.k...'] },
  bear: { pal: { a: '#6a4426', b: '#432a16', c: '#8c6640', e: '#111111', k: '#1e130b' }, map: [
    '', '', '', '',
    '..bb............',
    '.baab.bbbbbb....',
    '.aaaabaaaaaab...',
    'aeaaaaaaaaaaab..',
    'kaaaaaaaaaaaaab.',
    '.aaaaaaaaaaaaab.',
    '..caaaaaaaaaaab.',
    '...aaaaaaaaaaab.',
    '...aaab...aaab..',
    '...aaab...aaab..',
    '...aaab...aaab..',
    '...kkkk...kkkk..'] },
  horse: { pal: { a: '#8a5a32', b: '#5a3a20', m: '#2a1a12', e: '#111111', k: '#3a2a1a', h: '#222222' }, map: [
    '',
    '..mm............',
    '.mmaa...........',
    '.maaab..........',
    'aeaaab..........',
    'aaaaaab.........',
    'kaa.aaab........',
    '....maaab.......',
    '.....aaaaaaaaab.',
    '.....aaaaaaaaabm',
    '.....aaaaaaaaabm',
    '......aaaaaaab.m',
    '......a.a..a.a.m',
    '......a.a..a.a..',
    '......a.a..a.a..',
    '......h.h..h.h..'] },
  ram: { pal: { h: '#c8a878', g: '#8a7a6a', w: '#e8e2d4', v: '#c8c0b0', e: '#111111', k: '#3a3028' }, map: [
    '', '', '', '', '',
    '..hh............',
    '.h..h...........',
    '.hghh...........',
    'gegghwwwwwwww...',
    'ggggwwwwwwwwww..',
    '.gg.vwwwwwwwwwv.',
    '....vvwwwwwwvv..',
    '....g.g...g.g...',
    '....g.g...g.g...',
    '....g.g...g.g...',
    '....k.k...k.k...'] },
  camel: { pal: { a: '#c8a060', b: '#9a7440', e: '#111111', k: '#4a3420' }, map: [
    '', '',
    '..aa............',
    '.aeab...........',
    'kaaab...........',
    '...aa.....bb....',
    '...aa....baab...',
    '...aab.bbaaaab..',
    '....aabaaaaaaab.',
    '....aaaaaaaaaabb',
    '.....aaaaaaaaab.',
    '......a.a..a.a..',
    '......a.a..a.a..',
    '......a.a..a.a..',
    '......a.a..a.a..',
    '......k.k..k.k..'] },
  elk: { pal: { h: '#d8c8a0', a: '#7a5232', b: '#4a3018', c: '#b89a72', e: '#111111', k: '#2a1a10' }, map: [
    '..h.h.h.........',
    '...hhh.h........',
    '..h.h.hh........',
    '....hh..........',
    '...aab..........',
    '..aeaab.........',
    'kaaaaab.........',
    '...caab.........',
    '....aaaaaaaaab..',
    '....caaaaaaaaab.',
    '.....aaaaaaaaab.',
    '......cccccccc..',
    '......a.a..a.a..',
    '......a.a..a.a..',
    '......a.a..a.a..',
    '......k.k..k.k..'] },
  strider: { pal: { a: '#4a8a5a', b: '#2a5a3a', c: '#c8d8a0', d: '#e0b040', e: '#111111', k: '#1a2a1a' }, map: [
    '', '', '', '', '', '',
    '..aaa...........',
    '.aeaab..........',
    'kaaaaab.........',
    '.ccaaabbbbbb....',
    '....aadadadab...',
    '....caaaaaaaabb.',
    '.....a..a.a..bbb',
    '....aa.aa.aa....',
    '....k..k..k.....',
    ''] },
  beetle: { pal: { a: '#3a4a8a', b: '#1a2040', c: '#8aa0e0', h: '#2a2a3a', e: '#e0e040' }, map: [
    '', '', '', '', '', '', '',
    '.......bbbbb....',
    '.....bbaacaab...',
    '..hhbaaaaacaab..',
    '.heebaaaaaacab..',
    '.hhhbaaaaaaaab..',
    '....bbbbbbbbbb..',
    '...b.b.b..b.b.b.',
    '..b..b..b..b..b.',
    ''] },
  scorpion: { pal: { a: '#c88a3a', b: '#7a4a1a', e: '#111111' }, map: [
    '', '', '', '', '', '',
    '...........aa...',
    '............ab..',
    '............ab..',
    '...........ab...',
    '..........ab....',
    'aa..baaaaab.....',
    'a.abaeaaaab.....',
    '.aa.bbbbbb......',
    '...b.b.b.b.b....',
    ''] },
  mimic: { pal: { a: '#8a5a2b', b: '#4a2e14', g: '#e0b040', w: '#f4f0e0', r: '#3a0a0a', n: '#d04060', e: '#ffe040' }, map: [
    '', '', '', '', '', '',
    '..bbbbbbbbbbbb..',
    '..baeaaaaaaeab..',
    '..bggggggggggb..',
    '..bwrwrwrwrwrb..',
    '..brrrrnnrrrrb..',
    '..brwrwrwrwrwb..',
    '..bggggggggggb..',
    '..baaaaaaaaaab..',
    '..bbbbbbbbbbbb..',
    ''] },
  wisp: { pal: { a: '#7ae0ff', c: '#2a8ab0', w: '#e8ffff', e: '#1a4a6a' }, map: [
    '', '', '', '', '',
    '.......c........',
    '......cac.......',
    '.....caaac......',
    '....cawwwac.....',
    '....cwewewc.....',
    '....cawwwac.....',
    '.....caaac......',
    '......cac.......',
    '.......c........',
    '', ''] },
  shroom: { pal: { a: '#c8303a', b: '#7a1a20', w: '#f8f0e0', c: '#e8dcc0', e: '#111111', n: '#8a4a3a', k: '#6a5a4a' }, map: [
    '', '', '', '',
    '.....bbbbbb.....',
    '...bbawaaaabb...',
    '..baaaaawaaaab..',
    '.baawaaaaaawaab.',
    '.bbbbbbbbbbbbbb.',
    '....cccccccc....',
    '....ceccccec....',
    '....cccnnccc....',
    '....cccccccc....',
    '.....cc..cc.....',
    '.....cc..cc.....',
    '.....kk..kk.....'] },
  gargoyle: { pal: { a: '#8a8a90', b: '#5a5a62', h: '#3a3a40', e: '#ff5030', n: '#3a3a40', k: '#4a4a50' }, map: [
    '', '',
    '.b............b.',
    '.bb..h....h..bb.',
    '.bab.aaaaaa.bab.',
    '.baabaeaaeabaab.',
    '.baaabaaaabaaab.',
    '..baaaannaaaab..',
    '...bbaaaaaabb...',
    '.....aaaaaa.....',
    '....aaaaaaaa....',
    '....aa.aa.aa....',
    '....aa....aa....',
    '...kkk....kkk...',
    '', ''] },
  golem: { pal: { a: '#8a7a62', b: '#5a4a3a', g: '#5a8a3a', e: '#ffd060' }, map: [
    '',
    '.....bbbbbb.....',
    '....baaaaaab....',
    '....baeaaeab....',
    '....baaaaaab....',
    '..bbbbbbbbbbbb..',
    '.baaaagaaaaaaab.',
    '.baabaaaaagbaab.',
    '.baabaaaaaabaab.',
    '.baab.aaaa.baab.',
    '.bbbb.aaaa.bbbb.',
    '......bbbb......',
    '.....aaa.aaa....',
    '.....aaa.aaa....',
    '.....aaa.aaa....',
    '....bbbb.bbbb...'] },
  serpent: { pal: { a: '#3a7a8a', b: '#1a4a5a', c: '#a8d8c8', e: '#ffe040', k: '#0a2a30' }, map: [
    '', '', '', '', '', '',
    '.aaa............',
    'aeaab...........',
    'kaaab...........',
    '..aab.....aab...',
    '..aab....aaaab..',
    '...aab..aab.aab.',
    '...caabaab...ab.',
    '....caaab....b..',
    '.....cc.........',
    ''] },
  lurker: { pal: { a: '#4a5a2a', b: '#2a3a14', w: '#e8e8c0', e: '#ff3030' }, map: [
    '', '', '', '', '', '', '',
    '....e.....e.....',
    '....b.....b.....',
    '...bab...bab....',
    '..baaaaaaaaab...',
    '.baaaaaaaaaaab..',
    'baawaawaawaaaab.',
    'baaaaaaaaaaaaab.',
    '.bbbbbbbbbbbbb..',
    ''] },
  // Fliers: they carry you over sea and mountains, and up to the cloud cities.
  pegasus: { pal: { a: '#f2f0ea', b: '#c8c4b8', m: '#b8d8f0', w: '#ffffff', v: '#d8e8f8', e: '#2a2a40', h: '#8a8a90' }, map: [
    '.......vvv......',
    '..mm..vwwwv.....',
    '.mmaa.vwwwwv....',
    '.maaabvwwwwwv...',
    'aeaaab.vwwwwwv..',
    'aaaaaab.vvwwwv..',
    'baa.aaab..vvv...',
    '....maaab.......',
    '.....aaaaaaaaab.',
    '.....aaaaaaaaabm',
    '.....aaaaaaaaabm',
    '......aaaaaaab.m',
    '......a.a..a.a.m',
    '......a.a..a.a..',
    '......a.a..a.a..',
    '......h.h..h.h..'] },
  griffin: { pal: { a: '#c89a50', b: '#8a6430', w: '#f0e8d8', f: '#e8dcc0', n: '#e8b830', e: '#111111', v: '#a87a40' }, map: [
    '........vvv.....',
    '.......vaaav....',
    '..ww...vaaaav...',
    '.weww..vvaaaav..',
    'nwwwwb...vvaav..',
    '.nfwwb.....vv...',
    '..ffwab.........',
    '...fwaaaaaaaab..',
    '....aaaaaaaaaab.',
    '....aaaaaaaaaabb',
    '.....aaaaaaaab..',
    '......n.n..a.a..',
    '......n.n..a.a..',
    '.....nn.nn.b.b..',
    '', ''] },
  wyvern: { pal: { a: '#6a3a8a', b: '#3a1a4a', c: '#c8a0d8', v: '#8a5aa0', e: '#ffd040', w: '#f0f0f0' }, map: [
    '.......v........',
    '......vv....v...',
    '.....vbv...vv...',
    '....vbbv..vbv...',
    '.aa.vbbbvvbbv...',
    'aeaab.vbbbbv....',
    'waaaab..vvv.....',
    '..caaab.........',
    '...caaaaaaab....',
    '....caaaaaaaab..',
    '.....aaaaaaaaabb',
    '......a.a...a..b',
    '......a.a...a...',
    '.....aa.aa..aa..',
    '', ''] },
  // Swimmers and the sea.
  dolphin: { pal: { a: '#7a9ab8', b: '#4a6a88', c: '#e0ecf4', e: '#111111' }, map: [
    '', '', '', '', '', '', '',
    '.......bb.......',
    '......baab......',
    '..aaaaaaaaab..b.',
    '.aeaaaaaaaaaabb.',
    'baaaaaaaaaaaaab.',
    '..cccccccaaab.bb',
    '.....cccc...b...',
    '', ''] },
  shark: { pal: { a: '#7a8a98', b: '#4a5a68', c: '#e0e4e8', e: '#111111', w: '#ffffff' }, map: [
    '', '', '', '', '', '',
    '.........b......',
    '........bb......',
    '.......bab......',
    '..aaaaaaaaaab...',
    '.aeaaaaaaaaaab.b',
    'aaaaaaaaaaaaaabb',
    '.wcwccccccaaab.b',
    '..c.ccccc.ab....',
    '', ''] },
  eel: { pal: { a: '#3a6a3a', b: '#1a3a1a', c: '#a8c870', e: '#ffd040' }, map: [
    '', '', '', '', '', '', '', '',
    '.aa.............',
    'aeab.....aaab...',
    'aaaab...aabbaab.',
    '.ccaab.aab...ab.',
    '...caaaab....b..',
    '....ccc.........',
    '', ''] },
  jelly: { pal: { a: '#e090d8', b: '#a050a0', c: '#f8d0f0', e: '#5a1a5a' }, map: [
    '', '', '', '',
    '.....bbbbb......',
    '...bbcccccbb....',
    '..bccacacaccb...',
    '..baeaaaaeaab...',
    '..baaaaaaaaab...',
    '...bbbbbbbbb....',
    '...a.b.a.b.a....',
    '...b.a.b.a.b....',
    '..a..b.a..b.a...',
    '...a..b..b..a...',
    '....a.....a.....',
    ''] },
  fish: { pal: { a: '#e0a040', b: '#a06020', c: '#f8e0a0', e: '#111111' }, map: [
    '', '', '', '', '', '', '', '', '', '',
    '.....aaa....b...',
    '...aaaaaaa.bb...',
    '..aeaaaaaaabb...',
    '...ccccccc.bb...',
    '.....ccc....b...',
    ''] },
  merfolk: { pal: { s: '#e8c0a0', h: '#3aa8a0', e: '#1a1a2a', a: '#3a8aa0', b: '#1a5a70', c: '#8ad8e0', g: '#f0d060', m: '#c86a8a' }, map: [
    '....hhhhhh......',
    '...hhssssh......',
    '...hseesesh.....',
    '...hssssssh.....',
    '...hhsmmssh.....',
    '....hssssh......',
    '...gsssssg......',
    '..ss.ssss.ss....',
    '..s.cccccc.s....',
    '....aaaaaa......',
    '....aaacaa......',
    '.....aaaab......',
    '......aaab......',
    '.......aab......',
    '......cbbcc.....',
    '.....cc..cc.....'] },
  // The Aerie folk of the cloud cities: feathered, winged, beaked.
  birdfolk: { pal: { f: '#e8d8b0', c: '#c8a870', n: '#e8a020', e: '#1a1a2a', w: '#a8c8e8', v: '#7898c0', t: '#5a7aa8', g: '#f0d060', l: '#d09040' }, map: [
    '.....cccc.......',
    '....cffffc......',
    '...cfeffefc.....',
    '...cffnnffc.....',
    '....cfnnfc......',
    'w....cffc....w..',
    'vw..gtttg...wv..',
    'vww.tttttt.wwv..',
    '.vwwttwwtttwwv..',
    '..vvttwwttvv....',
    '....tttttt......',
    '....tttttt......',
    '.....t..t.......',
    '.....l..l.......',
    '.....l..l.......',
    '....ll..ll......'] },
  // Centaurs: a horse with a rider's body where the neck would be.
  centaur: { pal: { s: '#d8a880', h: '#5a3a20', e: '#1a1a1a', c: '#3a6a3a', a: '#8a5a32', b: '#5a3a20', k: '#222222', m: '#3a2414' }, map: [
    '..hhh...........',
    '.hssh...........',
    '.hese...........',
    '..ss............',
    '.cccc...........',
    'scccs...........',
    's.ccaa..........',
    '...aaaaaaaaaab..',
    '...aaaaaaaaaabm.',
    '...aaaaaaaaaab.m',
    '....aaaaaaaab..m',
    '....a.a...a.a...',
    '....a.a...a.a...',
    '....a.a...a.a...',
    '....k.k...k.k...',
    ''] },
  // Kobolds: small, scaly, with a spear and a grudge.
  kobold: { pal: { a: '#b0643a', b: '#7a3a1a', c: '#e0a070', e: '#ffe040', w: '#d8d0c0', u: '#8a5a2b', t: '#c8ccd0' }, map: [
    '', '', '', '',
    '.........t......',
    '..bb.....u......',
    '.baab....u......',
    'beaaab...u......',
    'aaawab..au......',
    '..baaaaaau......',
    '...caaab.u......',
    '...caaab.u......',
    '....aab..u......',
    '....a.a.........',
    '...bb.bb........',
    ''] },
  // The air: birds sit in the trees and fly over, and a few pick fights.
  crow: { pal: { a: '#2a2a34', b: '#14141c', n: '#d0a030', e: '#e8e8e8' }, map: [
    '', '', '', '', '', '', '', '',
    '..bb............',
    '.baeb...........',
    'nbaaab..........',
    '..baaabbb.......',
    '...baaaaabb.....',
    '....baaaaaab....',
    '.....bb..b.b....',
    '.....n...n......'] },
  gull: { pal: { a: '#f4f4f4', b: '#a8b0b8', n: '#e8a020', e: '#111111', k: '#606870' }, map: [
    '', '', '', '', '', '', '', '',
    '..aa............',
    '.aaea...........',
    'naaaab..........',
    '..aaaabbb.......',
    '...aaaaaakk.....',
    '....aaaaaaak....',
    '.....bb..b......',
    '.....n...n......'] },
  // Boats, from a rowboat for a short hop to a ship for the open ocean.
  rowboat: { pal: { a: '#8a5a2b', b: '#5a3a18', c: '#b88a50', o: '#d8c090' }, map: [
    '', '', '', '', '', '', '', '', '', '',
    '.......o........',
    '........o.......',
    'b........o.....b',
    'bacccccccccccacb',
    '.baaaaaaaaaaaab.',
    '..bbbbbbbbbbbb..'] },
  sloop: { pal: { a: '#8a5a2b', b: '#5a3a18', c: '#b88a50', w: '#f4efe2', v: '#d8d0c0', m: '#6a4a2a', r: '#c0303a' }, map: [
    '', '',
    '.......mr.......',
    '.......mww......',
    '.......mwww.....',
    '.......mwwww....',
    '.......mwwwww...',
    '.......mwwwwwv..',
    '.......mwwwwwwv.',
    '.......mvvvvvvv.',
    '.......m........',
    'b......m.......b',
    'baccccccccccccab',
    '.baaaaaaaaaaaab.',
    '..bbbbbbbbbbbb..',
    ''] },
  ship: { pal: { a: '#7a4a22', b: '#4a2a10', c: '#a8783e', w: '#f4efe2', v: '#d8d0c0', m: '#5a3a1a', r: '#c0303a', g: '#e0b040', o: '#2a1a0a' }, map: [
    '....r.....r.....',
    '....m.....m.....',
    '..wwmww.wwmww...',
    '..wwmww.wwmww...',
    '.wwwmwwwwwmwww..',
    '.vvvmvvvvvmvvv..',
    '..wwmww.wwmww...',
    '..vvmvv.vvmvv...',
    '....m.....m.....',
    'bb..m.....m...bb',
    'bcccccccccccccab',
    'bagagagagagagaab',
    '.baoaoaoaoaoaab.',
    '.baaaaaaaaaaaab.',
    '..bbbbbbbbbbbb..',
    ''] },
  // The styles' own craft (Journey v1.2): ridden in place of a flier or a swimmer, and sailed in place of boats.
  airship: { pal: { a: '#c8a060', b: '#7a5a30', c: '#e8d8a0', k: '#3a2a1c', g: '#8a5a2b', w: '#ffd166', f: '#9aa3ad' }, map: [
    '', '', '',
    '...bbbbbbbbbb...',
    '..baaaaaaaaaab..',
    '.baacaaaacaaaab.',
    '.baaaaaaaaaaaab.',
    '..baaaaaaaaaab..',
    '...bbbbbbbbbb...',
    '....k..k..k.....',
    '....k..k..k.....',
    '..gggggggggggf..',
    '..gwgwgwgwggff..',
    '...gggggggggf...'] },
  shuttle: { pal: { a: '#d8dee6', w: '#9aa3ad', c: '#5ab8ff', e: '#2a3a8a', f: '#ff8a3a', b: '#7a8a96' }, map: [
    '', '', '', '',
    '.......ww.......',
    '.....wwaaww.....',
    '..cwwaaaaaaww...',
    '.ccaaaaaaaaaaww.',
    'ccaaaaeeaaaaaaff',
    '.ccaaaaaaaaaaww.',
    '..cwwaaaaaaww...',
    '.....wwbbww.....',
    '.......bb.......'] },
  hoverbike: { pal: { a: '#2a2a3a', c: '#ff3ad8', k: '#9aa3ad', f: '#7ae0ff', b: '#14141c', g: '#7ae0ff' }, map: [
    '', '', '', '', '', '', '',
    '..........kk....',
    '.........kk.....',
    '..ccaaaaaaaaa...',
    '.caaaaaaaaaaaff.',
    '..bbbbbbbbbbb...',
    '...g.......g....',
    '..ggg.....ggg...'] },
  submarine: { pal: { a: '#d8b43a', b: '#8a6a1a', w: '#7ae0ff', k: '#5a5a64', f: '#9aa3ad' }, map: [
    '', '', '', '', '', '', '',
    '.........kk.....',
    '........kaak....',
    '.....bbbaaab....',
    '..baaaaaaaaaab..',
    '.baawaawaawaaab.',
    'baaaaaaaaaaaaaff',
    '.baaaaaaaaaaab.f',
    '..bbbbbbbbbbb...'] },
  paddleboat: { pal: { k: '#3a3a44', s: '#c8c8d0', w: '#efe6d2', a: '#2a4a8a', b: '#8a2a2a', p: '#8a5a2b', c: '#14141c' }, map: [
    '', '', '', '', '', '', '', '',
    '......kk..s.....',
    '......kk........',
    '..wwwwwwwwww....',
    '..wawawawaww..pp',
    '.bbbbbbbbbbbbppp',
    '..bbbbbbbbbbb.pp',
    '...cccccccccc...'] }
};
const BEAST_IDS = Object.keys(BEAST_ART);
// A look for one of them, in the same shape as an avatar look, so drawFigure draws it like any other.
function beastLook(id) {
  const art = BEAST_ART[id];
  if (!art) return null;
  const map = art.map.map((r) => (r || '').padEnd(16, '.').slice(0, 16));
  while (map.length < 16) map.unshift('.'.repeat(16));
  return { id: `beast-${id}`, name: id, map: map.slice(-16), palette: { ...art.pal }, parts: { body: 'beast', weapon: 'none', shield: 'none' } };
}

globalThis.BobJourneySides = { FACINGS, FACING_NAMES, FIGURE_W, KIT_COLOURS, darker, shapeOf, figure, WEAPON_SHAPES, AFFIX_TINTS, tintHex, WEAPON_KINDS, REST_ANGLE, swingAngles, weaponCells, shieldCells, drawFigure, BEAST_IDS, beastLook };
})();
