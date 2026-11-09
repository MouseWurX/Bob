// Avatars for Bob, all drawn in code as 16x16 pixel art (no downloads): 32 men, 32 women, and a crowd of
// aliens, robots, computers and odder folk. Each one is built from parts (head, skin, hair, face, outfit,
// extras) picked by a fixed recipe, so the same id always gives the same face.
// Every avatar uses the same letters as Bob's original looks: E = eyes (swapped for the blink colour when
// he blinks) and X = mouth (swapped for O when he talks), so all of them blink and talk.

const SKIN = [
  ['#f6d5b8', '#d9a886'], ['#f0c49a', '#c9946a'], ['#e0ac7e', '#b88158'], ['#c68e5f', '#9c6a42'],
  ['#a86f45', '#7f5232'], ['#8a5634', '#653d24'], ['#6b4027', '#4c2c1a'], ['#4e2e1c', '#361f12']
];
const HAIR = ['#14110f', '#3b2416', '#6b4423', '#a8692f', '#d9b064', '#e8e0d0', '#b33a2a', '#7e8a96', '#3fd0ff', '#ff4fa3', '#8a5cff', '#38c172'];
const EYES = ['#1b2a33', '#2f5d8a', '#3a7d44', '#5a3a22', '#6b6b6b'];
const CLOTH = [
  ['#2f3b4f', '#24303f'], ['#5a2a2a', '#421e1e'], ['#2a5a3a', '#1e4229'], ['#4a3a6a', '#36294f'], ['#23232c', '#14161c'],
  ['#8a6a2a', '#6b501e'], ['#2a4a6a', '#1e3650'], ['#6a2a5a', '#4f1e42'], ['#d8d8d8', '#a8a8a8'], ['#c0392b', '#922b21']
];
const ACCENT = ['#e7a64a', '#3fd0ff', '#ff4fa3', '#7dff9a', '#ffd166', '#ff6b5a'];

// A small seeded random, so every avatar is the same every time.
function rng(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

function grid() { return Array.from({ length: 16 }, () => Array(16).fill('.')); }
function put(g, x, y, ch) { if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = ch; }
function rect(g, x0, y0, x1, y1, ch) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, ch); }
function rows(g) { return g.map((r) => r.join('')); }

// ---------- People ----------
function face(g, { beard, glasses, freckles, headset, earring }) {
  rect(g, 4, 3, 11, 9, 'S');           // head
  put(g, 3, 6, 'S'); put(g, 12, 6, 'S'); put(g, 3, 7, 'L'); put(g, 12, 7, 'L'); // ears
  rect(g, 5, 10, 10, 10, 'S');          // chin
  rect(g, 4, 9, 4, 9, 'L'); rect(g, 11, 9, 11, 9, 'L'); // jaw shade
  put(g, 5, 6, 'E'); put(g, 10, 6, 'E'); // eyes
  put(g, 5, 5, 'B'); put(g, 6, 5, 'B'); put(g, 9, 5, 'B'); put(g, 10, 5, 'B'); // brows
  put(g, 7, 7, 'N'); put(g, 8, 7, 'N');  // nose
  put(g, 7, 9, 'X'); put(g, 8, 9, 'X');  // mouth
  if (freckles) { put(g, 5, 8, 'R'); put(g, 10, 8, 'R'); }
  if (glasses) { rect(g, 4, 6, 6, 6, 'G'); rect(g, 9, 6, 11, 6, 'G'); put(g, 5, 6, 'E'); put(g, 10, 6, 'E'); put(g, 7, 6, 'G'); put(g, 8, 6, 'G'); }
  if (beard === 'full') { rect(g, 4, 8, 11, 10, 'H'); put(g, 7, 9, 'X'); put(g, 8, 9, 'X'); rect(g, 6, 11, 9, 11, 'H'); }
  if (beard === 'mustache') { put(g, 6, 8, 'H'); put(g, 7, 8, 'H'); put(g, 8, 8, 'H'); put(g, 9, 8, 'H'); }
  if (beard === 'goatee') { put(g, 7, 10, 'H'); put(g, 8, 10, 'H'); put(g, 7, 11, 'H'); put(g, 8, 11, 'H'); }
  if (beard === 'stubble') { put(g, 5, 9, 'L'); put(g, 10, 9, 'L'); put(g, 6, 10, 'L'); put(g, 9, 10, 'L'); }
  if (headset) { put(g, 3, 5, 'A'); put(g, 3, 6, 'A'); put(g, 3, 7, 'A'); put(g, 4, 8, 'A'); put(g, 5, 9, 'A'); }
  if (earring) { put(g, 12, 8, 'Y'); }
}

const HAIR_M = {
  short(g) { rect(g, 4, 1, 11, 2, 'H'); rect(g, 3, 2, 12, 3, 'H'); put(g, 3, 4, 'H'); put(g, 12, 4, 'H'); },
  buzz(g) { rect(g, 4, 2, 11, 2, 'H'); rect(g, 4, 3, 11, 3, 'L'); },
  spiky(g) { for (const x of [4, 6, 8, 10]) put(g, x, 0, 'H'); rect(g, 4, 1, 11, 2, 'H'); rect(g, 3, 3, 12, 3, 'H'); },
  sidepart(g) { rect(g, 4, 1, 11, 2, 'H'); rect(g, 3, 2, 12, 3, 'H'); rect(g, 4, 4, 6, 4, 'H'); put(g, 9, 1, 'S'); },
  bald(g) { rect(g, 5, 2, 10, 2, 'S'); put(g, 3, 4, 'H'); put(g, 12, 4, 'H'); put(g, 3, 5, 'H'); put(g, 12, 5, 'H'); },
  mohawk(g) { rect(g, 7, 0, 8, 3, 'H'); rect(g, 5, 2, 10, 2, 'S'); },
  curly(g) { rect(g, 3, 1, 12, 3, 'H'); for (const x of [3, 5, 7, 9, 11]) put(g, x, 0, 'H'); put(g, 3, 4, 'H'); put(g, 12, 4, 'H'); },
  tied(g) { rect(g, 4, 1, 11, 2, 'H'); rect(g, 3, 2, 12, 3, 'H'); rect(g, 13, 3, 13, 6, 'H'); put(g, 12, 3, 'Y'); }
};
const HAIR_F = {
  long(g) { rect(g, 4, 1, 11, 2, 'H'); rect(g, 3, 2, 12, 3, 'H'); rect(g, 2, 4, 3, 12, 'H'); rect(g, 12, 4, 13, 12, 'H'); },
  bob(g) { rect(g, 4, 1, 11, 2, 'H'); rect(g, 3, 2, 12, 4, 'H'); rect(g, 2, 4, 3, 9, 'H'); rect(g, 12, 4, 13, 9, 'H'); },
  ponytail(g) { rect(g, 4, 1, 11, 2, 'H'); rect(g, 3, 2, 12, 3, 'H'); rect(g, 13, 2, 14, 9, 'H'); put(g, 13, 2, 'Y'); },
  bun(g) { rect(g, 6, 0, 9, 1, 'H'); rect(g, 4, 2, 11, 2, 'H'); rect(g, 3, 3, 12, 3, 'H'); },
  pixie(g) { rect(g, 4, 1, 11, 2, 'H'); rect(g, 3, 2, 12, 3, 'H'); rect(g, 4, 4, 7, 4, 'H'); },
  curls(g) { rect(g, 3, 1, 12, 3, 'H'); for (const x of [2, 4, 6, 8, 10, 12]) put(g, x, 0, 'H'); rect(g, 1, 3, 3, 11, 'H'); rect(g, 12, 3, 14, 11, 'H'); },
  braids(g) { rect(g, 4, 1, 11, 2, 'H'); rect(g, 3, 2, 12, 3, 'H'); for (let y = 4; y <= 13; y += 1) { put(g, 2, y, y % 2 ? 'H' : 'L'); put(g, 13, y, y % 2 ? 'H' : 'L'); } put(g, 2, 14, 'Y'); put(g, 13, 14, 'Y'); },
  swept(g) { rect(g, 4, 1, 11, 2, 'H'); rect(g, 3, 2, 12, 3, 'H'); rect(g, 8, 4, 12, 4, 'H'); rect(g, 12, 5, 13, 11, 'H'); }
};

const OUTFITS = {
  hoodie(g) { rect(g, 3, 11, 12, 11, 'P'); rect(g, 2, 12, 13, 15, 'P'); rect(g, 6, 11, 9, 12, 'Q'); put(g, 7, 13, 'D'); put(g, 8, 13, 'D'); },
  tee(g) { rect(g, 4, 11, 11, 11, 'P'); rect(g, 2, 12, 13, 15, 'P'); rect(g, 2, 13, 2, 15, 'S'); rect(g, 13, 13, 13, 15, 'S'); put(g, 7, 13, 'D'); put(g, 8, 14, 'D'); },
  jacket(g) { rect(g, 3, 11, 12, 11, 'P'); rect(g, 2, 12, 13, 15, 'P'); rect(g, 7, 11, 8, 15, 'Q'); put(g, 6, 12, 'D'); put(g, 9, 12, 'D'); },
  labcoat(g) { rect(g, 3, 11, 12, 11, 'W'); rect(g, 2, 12, 13, 15, 'W'); rect(g, 6, 11, 9, 13, 'P'); put(g, 4, 14, 'D'); },
  armor(g) { rect(g, 3, 11, 12, 11, 'D'); rect(g, 2, 12, 13, 15, 'P'); rect(g, 5, 12, 10, 14, 'Q'); put(g, 7, 13, 'D'); put(g, 8, 13, 'D'); },
  suit(g) { rect(g, 3, 11, 12, 11, 'P'); rect(g, 2, 12, 13, 15, 'P'); rect(g, 6, 11, 9, 13, 'W'); rect(g, 7, 12, 8, 14, 'D'); },
  apron(g) { rect(g, 3, 11, 12, 11, 'P'); rect(g, 2, 12, 13, 15, 'P'); rect(g, 5, 12, 10, 15, 'W'); put(g, 5, 12, 'D'); put(g, 10, 12, 'D'); },
  dress(g) { rect(g, 5, 11, 10, 11, 'P'); rect(g, 3, 12, 12, 15, 'P'); rect(g, 3, 11, 4, 12, 'S'); rect(g, 11, 11, 12, 12, 'S'); put(g, 7, 12, 'D'); put(g, 8, 12, 'D'); }
};

const FIRST_M = ['Abe', 'Bram', 'Cass', 'Dev', 'Eli', 'Finn', 'Gus', 'Hal', 'Ike', 'Jules', 'Kip', 'Lou', 'Max', 'Nico', 'Otto', 'Pip', 'Quin', 'Rex', 'Sol', 'Tam', 'Uli', 'Vic', 'Wes', 'Xan', 'Yuri', 'Zed', 'Arlo', 'Beau', 'Cyrus', 'Dax', 'Emil', 'Felix'];
const FIRST_F = ['Ava', 'Bea', 'Cleo', 'Dot', 'Eve', 'Fay', 'Gia', 'Hana', 'Iris', 'Jade', 'Kit', 'Lena', 'Mae', 'Nell', 'Opal', 'Pia', 'Quinn', 'Rosa', 'Suki', 'Tess', 'Uma', 'Vera', 'Wren', 'Xia', 'Yara', 'Zoe', 'Amara', 'Bree', 'Cora', 'Dana', 'Esme', 'Flo'];

function person(sex, i) {
  const r = rng(`${sex}${i}`);
  const g = grid();
  const styles = sex === 'm' ? HAIR_M : HAIR_F;
  const hairKeys = Object.keys(styles);
  const hairStyle = hairKeys[i % hairKeys.length];            // every style shows up four times
  const skin = SKIN[(i * 3 + (sex === 'm' ? 0 : 1)) % SKIN.length];
  const hair = HAIR[Math.floor(i / hairKeys.length) * 2 % HAIR.length + (r() < 0.5 ? 1 : 0)] || pick(r, HAIR);
  const cloth = pick(r, CLOTH);
  const outfitKeys = Object.keys(OUTFITS).filter((k) => sex === 'f' || k !== 'dress');
  const outfit = outfitKeys[(i + Math.floor(r() * 3)) % outfitKeys.length];
  const beard = sex === 'm' ? ['none', 'full', 'mustache', 'goatee', 'stubble', 'none', 'none', 'stubble'][(i >> 1) % 8] : 'none';
  face(g, { beard, glasses: r() < 0.3, freckles: r() < 0.25, headset: r() < 0.2, earring: sex === 'f' ? r() < 0.4 : r() < 0.1 });
  styles[hairStyle](g);
  OUTFITS[outfit](g);
  const palette = { S: skin[0], L: skin[1], H: hair, B: hair === '#e8e0d0' ? '#a8a29a' : hair, E: pick(r, EYES), N: skin[1], X: '#6b2f22', O: '#3a1410', R: '#e89a8a', G: '#9aa3ad', A: '#9aa3ad', Y: '#ffd166', P: cloth[0], Q: cloth[1], D: pick(r, ACCENT), W: '#efe6d2' };
  const name = (sex === 'm' ? FIRST_M : FIRST_F)[i % 32];
  return { name, what: `${hairStyle} hair, ${outfit}`, palette, blinkTo: 'L', map: rows(g) };
}

// ---------- Aliens ----------
const ALIEN_SKIN = [['#7dff9a', '#3fa85a'], ['#b38cff', '#7a52c9'], ['#5ce1ff', '#2a8fa8'], ['#c0c8d0', '#8a949e'], ['#ff8a5c', '#c25a32'], ['#e8f06a', '#a8b032'], ['#ff6bd5', '#b8389a'], ['#6a8aff', '#3a52c2']];
const ALIEN_NAMES = ['Zorp', 'Kleeb', 'Vex', 'Gloop', 'Ixa', 'Nubb', 'Qorr', 'Thim', 'Ulla', 'Wib', 'Yeek', 'Zazz', 'Mox', 'Prr', 'Oolo', 'Fnar'];
function alien(i) {
  const r = rng(`alien${i}`);
  const g = grid();
  const sk = ALIEN_SKIN[i % ALIEN_SKIN.length];
  const big = i % 2 === 0;
  rect(g, 3, big ? 2 : 3, 12, 9, 'S'); rect(g, 4, 1, 11, 1, big ? 'S' : '.'); rect(g, 5, 10, 10, 10, 'S'); rect(g, 6, 11, 9, 11, 'S');
  rect(g, 3, 8, 3, 9, 'L'); rect(g, 12, 8, 12, 9, 'L');
  const eyes = i % 4;
  if (eyes === 0) { rect(g, 4, 5, 6, 7, 'K'); rect(g, 9, 5, 11, 7, 'K'); put(g, 5, 6, 'E'); put(g, 10, 6, 'E'); }
  if (eyes === 1) { rect(g, 6, 4, 9, 6, 'K'); put(g, 7, 5, 'E'); put(g, 8, 5, 'E'); }
  if (eyes === 2) { for (const x of [4, 7, 10]) { rect(g, x, 5, x + 1, 6, 'K'); put(g, x, 5, 'E'); } }
  if (eyes === 3) { rect(g, 4, 6, 6, 6, 'K'); rect(g, 9, 6, 11, 6, 'K'); put(g, 5, 6, 'E'); put(g, 10, 6, 'E'); rect(g, 4, 4, 11, 4, 'L'); }
  put(g, 7, 9, 'X'); put(g, 8, 9, 'X');
  if (i % 3 === 0) { put(g, 4, 0, 'A'); put(g, 5, 1, 'A'); put(g, 11, 0, 'A'); put(g, 10, 1, 'A'); }
  if (i % 3 === 1) { rect(g, 7, 0, 8, 1, 'A'); }
  if (i % 5 === 2) { put(g, 2, 4, 'S'); put(g, 1, 3, 'S'); put(g, 13, 4, 'S'); put(g, 14, 3, 'S'); }
  rect(g, 3, 12, 12, 15, 'P'); rect(g, 6, 12, 9, 12, 'Q'); put(g, 7, 13, 'D'); put(g, 8, 13, 'D'); rect(g, 2, 13, 2, 15, 'Q'); rect(g, 13, 13, 13, 15, 'Q');
  const cloth = pick(r, CLOTH);
  return { name: ALIEN_NAMES[i % 16], what: 'Visitor from elsewhere', blinkTo: 'K', map: rows(g), palette: { S: sk[0], L: sk[1], K: '#0b0b12', E: pick(r, ['#ffffff', '#ffd166', '#ff4f4f', '#7dff9a']), X: '#1b1b24', O: '#000000', A: pick(r, ACCENT), P: cloth[0], Q: cloth[1], D: pick(r, ACCENT) } };
}

// ---------- Robots ----------
const METAL = [['#b9c2cc', '#8d97a3', '#5d6670'], ['#e7a64a', '#b57d2e', '#7a5320'], ['#d8d8d8', '#a0a0a0', '#606060'], ['#c0392b', '#922b21', '#5a1a14'], ['#3fd0ff', '#2a8fa8', '#1a5a6a'], ['#38c172', '#27864f', '#18542f'], ['#8a5cff', '#5e3cb0', '#3a2470'], ['#ffd166', '#c9a040', '#86692a']];
const ROBOT_NAMES = ['Bolt', 'Cog', 'Gizmo', 'Servo', 'Rivet', 'Sprocket', 'Widget', 'Ratchet', 'Tink', 'Clank', 'Volt', 'Axle', 'Piston', 'Gear', 'Diode', 'Torque'];
function robot(i) {
  const r = rng(`robot${i}`);
  const g = grid();
  const m = METAL[i % METAL.length];
  const round = i % 2 === 1;
  rect(g, 3, 2, 12, 9, 'C'); if (round) { put(g, 3, 2, '.'); put(g, 12, 2, '.'); put(g, 3, 9, '.'); put(g, 12, 9, '.'); }
  rect(g, 3, 9, 12, 9, 'M');
  if (i % 4 < 2) { rect(g, 4, 5, 11, 6, 'K'); put(g, 5, 5, 'E'); put(g, 6, 5, 'E'); put(g, 9, 5, 'E'); put(g, 10, 5, 'E'); }
  else { rect(g, 4, 4, 6, 6, 'K'); rect(g, 9, 4, 11, 6, 'K'); put(g, 5, 5, 'E'); put(g, 10, 5, 'E'); }
  rect(g, 5, 8, 10, 8, 'K'); put(g, 6, 8, 'X'); put(g, 7, 8, 'X'); put(g, 8, 8, 'X'); put(g, 9, 8, 'X');
  if (i % 3 === 0) { put(g, 7, 0, 'R'); rect(g, 7, 1, 7, 1, 'M'); }
  if (i % 3 === 1) { put(g, 2, 5, 'M'); put(g, 2, 6, 'M'); put(g, 13, 5, 'M'); put(g, 13, 6, 'M'); put(g, 1, 4, 'R'); put(g, 14, 4, 'R'); }
  if (i % 3 === 2) { rect(g, 5, 1, 10, 1, 'M'); put(g, 7, 0, 'R'); put(g, 8, 0, 'R'); }
  rect(g, 6, 10, 9, 10, 'M');
  rect(g, 3, 11, 12, 15, 'C'); rect(g, 5, 12, 10, 14, 'M');
  put(g, 6, 13, 'R'); put(g, 7, 13, 'G'); put(g, 8, 13, 'Y'); put(g, 9, 13, 'G');
  rect(g, 1, 12, 2, 14, 'M'); rect(g, 13, 12, 14, 14, 'M');
  const glow = pick(r, ['#7dff9a', '#3fd0ff', '#ff4f4f', '#ffd166', '#ff4fa3']);
  return { name: ROBOT_NAMES[i % 16], what: 'Bolted together with love', blinkTo: 'K', map: rows(g), palette: { C: m[0], M: m[1], K: '#0e1a14', E: glow, X: glow, O: '#ffffff', R: '#ff6b5a', G: '#7dff9a', Y: '#ffd166' } };
}

// ---------- Computers ----------
const SCREENS = [
  { case: ['#d8ccb0', '#b0a488'], bg: '#0e1a14', fg: '#7dff9a', name: 'Beige box' },
  { case: ['#2a2a32', '#18181e'], bg: '#0b1020', fg: '#3fd0ff', name: 'Terminal' },
  { case: ['#b9c2cc', '#8d97a3'], bg: '#1a3aa8', fg: '#ffffff', name: 'Blue screen' },
  { case: ['#e8e8e8', '#b0b0b0'], bg: '#101010', fg: '#ffb000', name: 'Amber CRT' },
  { case: ['#23232c', '#14161c'], bg: '#1a0f24', fg: '#ff4fa3', name: 'Synthwave' },
  { case: ['#c0392b', '#922b21'], bg: '#0e0e0e', fg: '#ffd166', name: 'Arcade' },
  { case: ['#38c172', '#27864f'], bg: '#081a10', fg: '#c8ffd4', name: 'Mainframe' },
  { case: ['#8a5cff', '#5e3cb0'], bg: '#120a24', fg: '#e8fbff', name: 'Quantum' }
];
function computer(i) {
  const g = grid();
  const s = SCREENS[i % SCREENS.length];
  const laptop = i >= 8;
  if (!laptop) {
    rect(g, 1, 1, 14, 11, 'C'); rect(g, 2, 2, 13, 9, 'K'); rect(g, 1, 11, 14, 11, 'M'); put(g, 12, 10, 'R'); put(g, 13, 10, 'G');
    rect(g, 5, 12, 10, 12, 'M'); rect(g, 3, 13, 12, 13, 'C'); rect(g, 1, 14, 14, 15, 'C'); for (let x = 2; x <= 13; x += 2) put(g, x, 14, 'M');
  } else {
    rect(g, 2, 2, 13, 10, 'C'); rect(g, 3, 3, 12, 9, 'K'); rect(g, 0, 11, 15, 12, 'M'); rect(g, 1, 13, 14, 13, 'C'); for (let x = 2; x <= 13; x += 2) put(g, x, 12, 'C'); rect(g, 6, 13, 9, 13, 'M');
  }
  const eyeRow = laptop ? 5 : 4;
  if (i % 3 === 0) { put(g, 5, eyeRow, 'E'); put(g, 10, eyeRow, 'E'); }
  else if (i % 3 === 1) { rect(g, 4, eyeRow, 5, eyeRow + 1, 'E'); rect(g, 10, eyeRow, 11, eyeRow + 1, 'E'); }
  else { put(g, 4, eyeRow + 1, 'E'); put(g, 5, eyeRow, 'E'); put(g, 6, eyeRow + 1, 'E'); put(g, 9, eyeRow + 1, 'E'); put(g, 10, eyeRow, 'E'); put(g, 11, eyeRow + 1, 'E'); }
  rect(g, 6, eyeRow + 3, 9, eyeRow + 3, 'X');
  if (i % 2) { put(g, 3, 8, 'E'); put(g, 4, 8, '.'); }
  return { name: `${s.name}${laptop ? ' laptop' : ''}`, what: 'A computer with opinions', blinkTo: 'K', map: rows(g), palette: { C: s.case[0], M: s.case[1], K: s.bg, E: s.fg, X: s.fg, O: '#ffffff', R: '#ff6b5a', G: '#7dff9a' } };
}

// ---------- Oddities: ghosts, skeletons, wizards, knights, cat-folk, slimes, vampires, pumpkins ----------
const ODD = [
  function ghost(g, p) { rect(g, 4, 2, 11, 13, 'S'); rect(g, 3, 4, 12, 12, 'S'); for (const x of [3, 6, 9, 12]) put(g, x, 14, 'S'); put(g, 5, 6, 'E'); put(g, 6, 6, 'E'); put(g, 9, 6, 'E'); put(g, 10, 6, 'E'); rect(g, 7, 9, 8, 10, 'X'); p.S = '#e8f4ff'; p.E = '#1b1b2a'; p.X = '#1b1b2a'; p.O = '#3a3a5a'; return 'Ghost'; },
  function skeleton(g, p) { rect(g, 4, 2, 11, 8, 'S'); rect(g, 5, 9, 10, 10, 'S'); rect(g, 5, 5, 6, 6, 'K'); rect(g, 9, 5, 10, 6, 'K'); put(g, 5, 5, 'E'); put(g, 10, 5, 'E'); put(g, 7, 7, 'K'); put(g, 8, 7, 'K'); for (const x of [6, 7, 8, 9]) put(g, x, 9, 'X'); for (let y = 11; y <= 15; y += 1) { put(g, 7, y, 'S'); put(g, 8, y, 'S'); } for (const y of [12, 14]) rect(g, 4, y, 11, y, 'S'); p.S = '#efe6d2'; p.K = '#14110f'; p.E = '#ff4f4f'; p.X = '#14110f'; p.O = '#3a3a3a'; return 'Skeleton'; },
  function wizard(g, p) { rect(g, 7, 0, 8, 0, 'H'); rect(g, 6, 1, 9, 1, 'H'); rect(g, 5, 2, 10, 2, 'H'); rect(g, 2, 3, 13, 3, 'H'); put(g, 8, 1, 'Y'); rect(g, 4, 4, 11, 8, 'S'); put(g, 5, 5, 'E'); put(g, 10, 5, 'E'); rect(g, 4, 7, 11, 12, 'W'); put(g, 7, 7, 'X'); put(g, 8, 7, 'X'); rect(g, 2, 11, 13, 15, 'H'); rect(g, 6, 11, 9, 13, 'W'); p.S = '#f0c49a'; p.H = '#3a2a7a'; p.W = '#e8e8e8'; p.E = '#1b2a33'; p.X = '#a8a29a'; p.O = '#6b2f22'; p.Y = '#ffd166'; return 'Wizard'; },
  function knight(g, p) { rect(g, 3, 1, 12, 10, 'C'); rect(g, 4, 5, 11, 6, 'K'); put(g, 5, 5, 'E'); put(g, 6, 5, 'E'); put(g, 9, 5, 'E'); put(g, 10, 5, 'E'); for (let y = 7; y <= 9; y++) put(g, 7, y, 'K'); rect(g, 6, 8, 9, 8, 'X'); put(g, 7, 0, 'R'); put(g, 8, 0, 'R'); rect(g, 2, 11, 13, 15, 'C'); rect(g, 5, 12, 10, 15, 'R'); rect(g, 7, 12, 8, 15, 'Y'); p.C = '#b9c2cc'; p.K = '#14161c'; p.E = '#e8fbff'; p.X = '#5d6670'; p.O = '#14161c'; p.R = '#c0392b'; p.Y = '#ffd166'; return 'Knight'; },
  function catfolk(g, p) { put(g, 3, 1, 'S'); put(g, 4, 2, 'S'); put(g, 12, 1, 'S'); put(g, 11, 2, 'S'); put(g, 4, 1, 'R'); put(g, 11, 1, 'R'); rect(g, 3, 3, 12, 9, 'S'); rect(g, 5, 10, 10, 10, 'S'); put(g, 5, 5, 'E'); put(g, 10, 5, 'E'); put(g, 7, 7, 'R'); put(g, 8, 7, 'R'); put(g, 7, 8, 'X'); put(g, 8, 8, 'X'); put(g, 2, 7, 'W'); put(g, 13, 7, 'W'); put(g, 2, 8, 'W'); put(g, 13, 8, 'W'); rect(g, 3, 11, 12, 15, 'P'); rect(g, 6, 11, 9, 12, 'Q'); p.S = '#e8a050'; p.R = '#ff9aa8'; p.E = '#3a7d44'; p.X = '#6b2f22'; p.O = '#3a1410'; p.W = '#ffffff'; p.P = '#2f3b4f'; p.Q = '#24303f'; return 'Cat-folk'; },
  function slime(g, p) { rect(g, 4, 5, 11, 6, 'S'); rect(g, 3, 7, 12, 13, 'S'); rect(g, 2, 10, 13, 14, 'S'); rect(g, 5, 4, 10, 4, 'S'); put(g, 5, 4, 'W'); put(g, 4, 6, 'W'); rect(g, 5, 8, 6, 9, 'E'); rect(g, 9, 8, 10, 9, 'E'); rect(g, 7, 11, 8, 11, 'X'); p.S = '#38c172'; p.W = '#c8ffd4'; p.E = '#0b1a10'; p.X = '#0b1a10'; p.O = '#1e4229'; return 'Slime'; },
  function vampire(g, p) { rect(g, 4, 1, 11, 2, 'H'); put(g, 7, 3, 'H'); put(g, 8, 3, 'H'); rect(g, 4, 3, 11, 9, 'S'); rect(g, 5, 10, 10, 10, 'S'); put(g, 5, 6, 'E'); put(g, 10, 6, 'E'); rect(g, 7, 8, 8, 8, 'X'); put(g, 7, 9, 'W'); put(g, 8, 9, '.'); rect(g, 1, 9, 3, 15, 'R'); rect(g, 12, 9, 14, 15, 'R'); rect(g, 3, 11, 12, 15, 'K'); rect(g, 6, 11, 9, 12, 'W'); p.S = '#dfe3ea'; p.H = '#14110f'; p.E = '#c0392b'; p.X = '#6b1a1a'; p.O = '#2a0a0a'; p.W = '#ffffff'; p.R = '#7a1a1a'; p.K = '#14110f'; return 'Vampire'; },
  function pumpkin(g, p) { rect(g, 7, 0, 8, 2, 'G'); rect(g, 3, 3, 12, 12, 'S'); rect(g, 2, 5, 13, 10, 'S'); for (let y = 4; y <= 11; y++) { put(g, 5, y, 'L'); put(g, 10, y, 'L'); } put(g, 5, 6, 'E'); put(g, 4, 7, 'E'); put(g, 6, 7, 'E'); put(g, 10, 6, 'E'); put(g, 9, 7, 'E'); put(g, 11, 7, 'E'); rect(g, 5, 9, 10, 10, 'X'); rect(g, 4, 13, 11, 15, 'P'); p.S = '#ff8a2a'; p.L = '#c25a12'; p.G = '#38c172'; p.E = '#ffd166'; p.X = '#ffd166'; p.O = '#fff3b0'; p.P = '#2f3b4f'; return 'Pumpkinhead'; }
];
function oddity(i) {
  const g = grid();
  const palette = { K: '#14161c' };
  const kind = ODD[i % ODD.length](g, palette);
  // The second of each kind gets a different colourway.
  if (i >= ODD.length) {
    const swap = { Ghost: { S: '#c8ffd4' }, Skeleton: { E: '#3fd0ff' }, Wizard: { H: '#7a1a3a' }, Knight: { R: '#2a4a6a', C: '#ffd166' }, 'Cat-folk': { S: '#3a3a42', E: '#ffd166' }, Slime: { S: '#8a5cff', W: '#e0d0ff', O: '#36294f' }, Vampire: { R: '#3a1a5a' }, Pumpkinhead: { S: '#f0f0f0', L: '#b0b0b0' } }[kind];
    Object.assign(palette, swap);
  }
  return { name: `${kind}${i >= ODD.length ? ' II' : ''}`, what: 'From the stranger corners of the inn', blinkTo: palette.K ? 'K' : 'S', map: rows(g), palette };
}

// ---------- The catalogue ----------
export const AVATAR_GROUPS = [
  { id: 'm', label: 'Men', count: 32, make: (i) => person('m', i) },
  { id: 'f', label: 'Women', count: 32, make: (i) => person('f', i) },
  { id: 'alien', label: 'Aliens', count: 16, make: alien },
  { id: 'robot', label: 'Robots', count: 16, make: robot },
  { id: 'pc', label: 'Computers', count: 16, make: computer },
  { id: 'odd', label: 'Oddities', count: 16, make: oddity }
];

const cache = new Map();
// Ids look like "m-07", "f-12", "alien-3", "robot-0", "pc-5", "odd-9".
export function avatar(id) {
  if (cache.has(id)) return cache.get(id);
  if (String(id).startsWith('c:')) { // 1.5.122: a look made on the character screen
    const parts = decodeParts(id);
    if (!parts) return null;
    const look = compose(parts);
    cache.set(id, look);
    return look;
  }
  const m = String(id).match(/^([a-z]+)-(\d+)$/);
  const grp = m && AVATAR_GROUPS.find((x) => x.id === m[1]);
  const n = m ? Number(m[2]) : -1;
  if (!grp || n < 0 || n >= grp.count) return null;
  const look = grp.make(n);
  // Every letter in the map needs a colour; anything missing falls back to a neutral grey.
  for (const row of look.map) for (const ch of row) if (ch !== '.' && !look.palette[ch]) look.palette[ch] = '#808080';
  if (!look.palette.O) look.palette.O = '#3a1410';
  cache.set(id, look);
  return look;
}

export function allAvatarIds() {
  return AVATAR_GROUPS.flatMap((g) => Array.from({ length: g.count }, (_, i) => `${g.id}-${i}`));
}

// ---------- The character screen (1.5.122): a look built from named parts ----------
// The same parts the people above are made of, picked one by one instead of by recipe, plus three overlays
// (armour, weapon, shield) and a build. A robot or alien head takes the same body rows, so outfits and kit fit
// every body. Every part is a letter on the 16x16 map, so the result blinks and talks like any other look.
export const COLOUR_NAMES = {
  hair: ['Black', 'Dark brown', 'Brown', 'Auburn', 'Blond', 'White', 'Red', 'Grey', 'Blue', 'Pink', 'Purple', 'Green'],
  skin: ['Fair', 'Light', 'Tan', 'Olive', 'Brown', 'Dark brown', 'Deep brown', 'Ebony'],
  cloth: ['Slate', 'Maroon', 'Forest', 'Plum', 'Charcoal', 'Mustard', 'Navy', 'Berry', 'Silver', 'Crimson'],
  metal: ['Steel', 'Brass', 'Chrome', 'Red', 'Sky', 'Green', 'Violet', 'Gold'],
  alien: ['Green', 'Violet', 'Cyan', 'Grey', 'Orange', 'Lime', 'Pink', 'Blue'],
  monster: ['Moss', 'Stone', 'Mud', 'Blood', 'Night', 'Bone', 'Frost', 'Ember']
};
// 1.5.124 Monster bodies for the bestiary (beast, crawler, blob, big humanoid): hide and shade, eyes, mouth.
const MONSTER = [['#4f7a3a', '#2f4d22'], ['#7e8a96', '#525c66'], ['#6b4a2b', '#3f2b18'], ['#8a2a2a', '#4f1515'], ['#2a2a3a', '#111118'], ['#e8e0c8', '#a8a088'], ['#9fd8e8', '#4f8aa0'], ['#e86a2a', '#8a3a12']];
const MONSTER_EYES = ['#ffd166', '#ff4f4f', '#7dff9a', '#ffffff', '#3fd0ff', '#ff4fa3', '#14110f', '#e8fbff'];
export const HAIR_STYLES = { ...HAIR_M, ...HAIR_F };
const ARMOURS = {
  none: null,
  leather(g) { rect(g, 3, 11, 12, 11, 'J'); rect(g, 3, 12, 12, 14, 'J'); rect(g, 5, 12, 5, 14, 'I'); rect(g, 10, 12, 10, 14, 'I'); rect(g, 7, 13, 8, 13, 'I'); },
  chain(g) { for (let y = 11; y <= 15; y++) for (let x = 3; x <= 12; x++) if (g[y][x] !== '.') put(g, x, y, (x + y) % 2 ? 'F' : 'I'); },
  plate(g) { rect(g, 3, 11, 12, 11, 'T'); rect(g, 2, 12, 13, 15, 'T'); rect(g, 5, 12, 10, 14, 'F'); put(g, 7, 13, 'Z'); put(g, 8, 13, 'Z'); rect(g, 2, 12, 2, 12, 'Z'); rect(g, 13, 12, 13, 12, 'Z'); },
  robe(g) { rect(g, 3, 11, 12, 11, 'V'); rect(g, 2, 12, 13, 15, 'V'); rect(g, 7, 11, 8, 15, 'Z'); put(g, 5, 15, 'Z'); put(g, 10, 15, 'Z'); }
};
const WEAPONS = {
  none: null,
  sword(g) { for (let y = 6; y <= 11; y++) put(g, 0, y, 'T'); rect(g, 0, 12, 1, 12, 'Z'); put(g, 0, 13, 'U'); put(g, 0, 14, 'U'); },
  axe(g) { for (let y = 7; y <= 14; y++) put(g, 0, y, 'U'); rect(g, 0, 7, 1, 8, 'T'); put(g, 1, 9, 'T'); },
  bow(g) { for (let y = 7; y <= 13; y++) put(g, 0, y, 'U'); put(g, 1, 6, 'U'); put(g, 1, 14, 'U'); for (let y = 7; y <= 13; y++) if (g[y][1] === '.') put(g, 1, y, 'W'); },
  staff(g) { for (let y = 4; y <= 15; y++) put(g, 0, y, 'U'); put(g, 0, 3, 'Z'); },
  dagger(g) { for (let y = 10; y <= 12; y++) put(g, 0, y, 'T'); put(g, 0, 13, 'Z'); put(g, 0, 14, 'U'); },
  spear(g) { for (let y = 4; y <= 15; y++) put(g, 0, y, 'U'); put(g, 0, 2, 'T'); put(g, 0, 3, 'T'); },
  hammer(g) { for (let y = 8; y <= 14; y++) put(g, 0, y, 'U'); rect(g, 0, 6, 1, 7, 'T'); }
};
const SHIELDS = {
  none: null,
  round(g) { rect(g, 14, 10, 15, 14, 'T'); put(g, 14, 10, '.'); put(g, 14, 14, '.'); put(g, 15, 12, 'Z'); },
  tall(g) { rect(g, 14, 9, 15, 15, 'T'); put(g, 14, 15, '.'); rect(g, 15, 11, 15, 13, 'Z'); }
};
const HAIR_WORDS = { short: 'short * hair', buzz: 'buzz-cut * hair', spiky: 'spiky * hair', sidepart: 'side-parted * hair', bald: 'a bald top and * sides', mohawk: 'a * mohawk', curly: 'curly * hair', tied: 'tied-back * hair', long: 'long * hair', bob: 'bobbed * hair', ponytail: '* hair in a ponytail', bun: '* hair in a bun', pixie: 'pixie-cut * hair', curls: 'curly * hair', braids: 'braided * hair', swept: 'swept * hair' };
const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`; // a steel robot, an orange alien
const hairWords = (style, colour) => style === 'none' ? 'no hair' : (HAIR_WORDS[style] || `${style} * hair`).replace('*', colour).replace(/^a ([aeiou])/i, 'an $1');
const MONSTERS = {
  // A four-legged thing seen from the side: muzzle left, tail right. Face picks ears/horns.
  beast(g, n) {
    const rows = [
      '................', '................', '....SS......S...', '...SSSS....SS...', '..SEESSSSSSSS...', '..SSXSSSSSSSSS..', '...SSSSSSSSSSS..', '....SLSSSSSLSS..',
      '....SSSSSSSSSS..', '.....SS....SS...', '.....SS....SS...', '.....LL....LL...', '................', '................', '................', '................'];
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') put(g, x, y, ch); }));
    if (n % 4 === 1) { put(g, 4, 1, 'S'); put(g, 6, 1, 'S'); } // ears up
    if (n % 4 === 2) { put(g, 3, 1, 'K'); put(g, 4, 0, 'K'); put(g, 7, 1, 'K'); put(g, 8, 0, 'K'); } // horns
    if (n % 4 === 3) { rect(g, 4, 1, 7, 1, 'L'); put(g, 12, 1, 'S'); put(g, 13, 0, 'S'); } // crest and a raised tail
    if (n >= 4) { rect(g, 9, 3, 12, 3, 'L'); } // a ridge along the back
  },
  // A round body on eight legs, eyes in a cluster.
  crawler(g, n) {
    const rows = [
      '................', '................', '................', '......SSSS......', '.....SSSSSS.....', '....SSSEESSS....', 'S..SSSEEEESS..S.', '.S.SSSSXXSSS.S..',
      '..SSSSSSSSSSSS..', '.S.SSSSSSSSS.S..', 'S..SSLSSSSLS..S.', '....S..SS..S....', '...S...SS...S...', '..S....LL....S..', '................', '................'];
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') put(g, x, y, ch); }));
    if (n % 2) { put(g, 6, 2, 'K'); put(g, 9, 2, 'K'); } // fangs up
    if (n >= 4) { rect(g, 6, 8, 9, 8, 'L'); } // a mark on the back
  },
  // A heap with eyes, drooping at the edges.
  blob(g, n) {
    const rows = [
      '................', '................', '................', '......SSSS......', '....SSSSSSSS....', '...SSSSSSSSSS...', '...SSEESSEESS...', '..SSSSSSSSSSSS..',
      '..SSSSXXXXSSSS..', '..SSSSSSSSSSSS..', '.SSSSSSSSSSSSSS.', '.SSSSLSSSSSLSSS.', 'SSSSSSSSSSSSSSSS', '.S.SSSSSSSSSS.S.', '................', '................'];
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') put(g, x, y, ch); }));
    if (n % 2) { put(g, 7, 2, 'S'); put(g, 8, 1, 'S'); } // a drip on top
    if (n >= 4) { put(g, 5, 9, 'K'); put(g, 10, 10, 'K'); } // things floating inside
  },
  // A big humanoid: small head, huge shoulders, the body rows take armour and kit like anyone's.
  giant(g, n) {
    const rows = [
      '......SSSS......', '.....SSSSSS.....', '.....SESSES.....', '.....SSSSSS.....', '......SXXS......', '....SSSSSSSS....', '..SSSSSSSSSSSS..', '.SSSSSSSSSSSSSS.',
      '.SSLSSSSSSSSLSS.', '.SS.SSSSSSSS.SS.', '.SS.SSSSSSSS.SS.', '....SSSSSSSS....', '....SSSSSSSS....', '....SSSLLSSS....', '....SSS..SSS....', '....LLL..LLL....'];
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') put(g, x, y, ch); }));
    if (n % 3 === 1) { put(g, 5, 0, 'K'); put(g, 10, 0, 'K'); } // horns
    if (n % 3 === 2) { rect(g, 6, 0, 9, 0, 'L'); } // a brow ridge
    if (n >= 4) { put(g, 6, 4, 'W'); put(g, 9, 4, 'W'); } // tusks
  }
};
export const MONSTER_BODIES = Object.keys(MONSTERS);
const FACE_WORDS = ['calm', 'keen', 'wide-eyed', 'squinting', 'bright', 'sleepy', 'fierce', 'friendly'];
const PART_NAMES = { body: 'Body', build: 'Build', face: 'Face', hair: 'Hair', hc: 'Hair colour', skin: 'Skin', beard: 'Beard', glasses: 'Glasses', outfit: 'Outfit', cloth: 'Outfit colour', armour: 'Armour', weapon: 'Weapon', shield: 'Shield' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// What the screen offers for each part: [value, label]. body: which bodies the screen shows (Bob's own screen
// leaves out "woman": Bob is a guy; a character for a game can be anyone).
export const PARTS = {
  body: [['m', 'Man'], ['f', 'Woman'], ['robot', 'Robot'], ['alien', 'Alien'], ['giant', 'Big humanoid'], ['beast', 'Beast'], ['crawler', 'Crawler'], ['blob', 'Blob']],
  build: [['slim', 'Slim'], ['regular', 'Regular'], ['broad', 'Broad']],
  face: FACE_WORDS.map((w, i) => [String(i), cap(w)]),
  hair: [['none', 'None'], ...Object.keys(HAIR_STYLES).map((k) => [k, cap(k)])],
  hc: HAIR.map((_, i) => [String(i), COLOUR_NAMES.hair[i]]),
  skin: SKIN.map((_, i) => [String(i), COLOUR_NAMES.skin[i]]),
  beard: [['none', 'None'], ['stubble', 'Stubble'], ['mustache', 'Moustache'], ['goatee', 'Goatee'], ['full', 'Full']],
  glasses: [['0', 'None'], ['1', 'Glasses']],
  outfit: Object.keys(OUTFITS).map((k) => [k, k === 'labcoat' ? 'Lab coat' : k === 'armor' ? 'Armour' : cap(k)]),
  cloth: CLOTH.map((_, i) => [String(i), COLOUR_NAMES.cloth[i]]),
  armour: [['none', 'None'], ['leather', 'Leather'], ['chain', 'Chain mail'], ['plate', 'Plate'], ['robe', 'Robe']],
  weapon: [['none', 'None'], ['sword', 'Sword'], ['axe', 'Axe'], ['bow', 'Bow'], ['staff', 'Staff'], ['dagger', 'Dagger'], ['spear', 'Spear'], ['hammer', 'Hammer']],
  shield: [['none', 'None'], ['round', 'Round shield'], ['tall', 'Tall shield']]
};
export const PART_ORDER = Object.keys(PARTS);
export const DEFAULT_PARTS = { body: 'm', build: 'regular', face: '0', hair: 'short', hc: '1', skin: '1', beard: 'none', glasses: '0', outfit: 'tee', cloth: '0', armour: 'none', weapon: 'none', shield: 'none' };
// Colour swatches for the screen (hex per value), so the picker can show the colour rather than only its name.
export const PART_COLOURS = { hc: HAIR, skin: SKIN.map((s) => s[0]), cloth: CLOTH.map((c) => c[0]), metal: METAL.map((m) => m[0]), alien: ALIEN_SKIN.map((a) => a[0]), monster: MONSTER.map((m) => m[0]) };
export const partName = (k) => PART_NAMES[k] || k;
// Which parts apply to a body: a robot has no hair or skin tone (its skin picker is the metal), an alien no hair.
export function partsFor(body) {
  if (body === 'giant') return ['body', 'face', 'skin', 'armour', 'weapon', 'shield'];
  if (MONSTER_BODIES.includes(body)) return ['body', 'face', 'skin'];
  if (body === 'robot') return PART_ORDER.filter((k) => !['hair', 'hc', 'beard', 'glasses'].includes(k));
  if (body === 'alien') return PART_ORDER.filter((k) => !['hair', 'hc', 'beard'].includes(k));
  return PART_ORDER.filter((k) => k !== 'face');
}

const ok = (k, v) => PARTS[k].some(([val]) => val === String(v));
export function cleanParts(p = {}) {
  const out = {};
  for (const k of PART_ORDER) out[k] = ok(k, p[k]) ? String(p[k]) : DEFAULT_PARTS[k];
  return out;
}
// "c:" then the parts in order, dotted: c:m.regular.0.short.1.1.none.0.tee.0.none.none.none
export function encodeParts(p) { const c = cleanParts(p); return `c:${PART_ORDER.map((k) => c[k]).join('.')}`; }
export function decodeParts(id) {
  const m = /^c:([a-z0-9.]{1,80})$/.exec(String(id || ''));
  if (!m) return null;
  const vals = m[1].split('.');
  if (vals.length !== PART_ORDER.length) return null;
  const p = {};
  PART_ORDER.forEach((k, i) => { p[k] = vals[i]; });
  if (PART_ORDER.some((k) => !ok(k, p[k]))) return null;
  return p;
}

export function compose(parts) {
  const p = cleanParts(parts);
  const g = grid();
  const palette = { E: '#1b2a33', X: '#6b2f22', O: '#3a1410', R: '#e89a8a', G: '#9aa3ad', A: '#9aa3ad', Y: '#ffd166', W: '#efe6d2', D: '#e7a64a', N: '#c9946a', B: '#3b2416', J: '#6b4423', I: '#4a2e18', F: '#9aa3ad', T: '#c8d0d8', Z: '#ffd166', U: '#8a5a2b', V: '#3a2a7a' };
  let blinkTo = 'L';
  const words = [];
  const n = Number(p.face) % 8;
  if (MONSTERS[p.body]) {
    const m = MONSTER[Number(p.skin) % MONSTER.length];
    MONSTERS[p.body](g, n);
    Object.assign(palette, { S: m[0], L: m[1], K: '#111118', E: MONSTER_EYES[n], X: '#14110f', O: '#3a1010', W: '#efe6d2' });
    blinkTo = 'L';
    const colour = COLOUR_NAMES.monster[Number(p.skin) % MONSTER.length].toLowerCase();
    const kind = { beast: 'beast', crawler: 'crawler', blob: 'blob', giant: 'big humanoid' }[p.body];
    words.push(`${an(`${colour}-coloured ${kind}`)} with ${FACE_WORDS[n]} eyes`);
    if (p.body !== 'giant') {
      const what = words.join('');
      const map = rows(g);
      for (const row of map) for (const ch of row) if (ch !== '.' && !palette[ch]) palette[ch] = '#808080';
      return { name: 'Your own design', what: what.charAt(0).toUpperCase() + what.slice(1), palette, blinkTo, map, parts: p };
    }
  } else if (p.body === 'robot' || p.body === 'alien') {
    // The head rows of a robot or alien from the groups above (face picks which), on the same body rows as everyone.
    const base = (p.body === 'robot' ? robot : alien)(n);
    for (let y = 0; y <= 10; y++) g[y] = [...base.map[y]];
    Object.assign(palette, base.palette);
    blinkTo = base.blinkTo;
    if (p.body === 'robot') { const m = METAL[Number(p.skin) % METAL.length]; palette.C = m[0]; palette.M = m[1]; palette.S = m[0]; palette.L = m[1]; words.push(`${an(COLOUR_NAMES.metal[Number(p.skin) % METAL.length].toLowerCase())} robot with a ${FACE_WORDS[n]} face`); }
    else { const sk = ALIEN_SKIN[Number(p.skin) % ALIEN_SKIN.length]; palette.S = sk[0]; palette.L = sk[1]; words.push(`${an(COLOUR_NAMES.alien[Number(p.skin) % ALIEN_SKIN.length].toLowerCase())} alien with a ${FACE_WORDS[n]} face`); if (p.glasses === '1') { rect(g, 4, 5, 6, 5, 'G'); rect(g, 9, 5, 11, 5, 'G'); } }
    rect(g, 6, 11, 9, 11, 'S'); // a neck, so the body rows start clean
  } else {
    const skin = SKIN[Number(p.skin)];
    const hair = HAIR[Number(p.hc)];
    face(g, { beard: p.beard, glasses: p.glasses === '1', freckles: false, headset: false, earring: false });
    if (p.hair !== 'none') HAIR_STYLES[p.hair](g);
    Object.assign(palette, { S: skin[0], L: skin[1], N: skin[1], H: hair, B: hair === '#e8e0d0' ? '#a8a29a' : hair });
    words.push(`${p.build === 'regular' ? 'a' : p.build === 'slim' ? 'a slim' : 'a broad'} ${p.body === 'f' ? 'woman' : 'man'} with ${hairWords(p.hair, COLOUR_NAMES.hair[Number(p.hc)].toLowerCase())}${p.beard !== 'none' ? ` and a ${p.beard === 'full' ? 'full beard' : p.beard === 'mustache' ? 'moustache' : p.beard}` : ''}${p.glasses === '1' ? ', glasses' : ''}`);
  }
  const cloth = CLOTH[Number(p.cloth)];
  palette.P = cloth[0]; palette.Q = cloth[1];
  if (p.body !== 'giant') OUTFITS[p.outfit](g);
  const hide = p.body === 'giant' ? g.map((r) => r.map((ch) => ch !== '.')) : null; // armour follows a giant's own shape
  if (ARMOURS[p.armour]) ARMOURS[p.armour](g);
  if (hide) for (let y = 11; y <= 15; y++) for (let x = 0; x < 16; x++) if (!hide[y][x]) g[y][x] = '.';
  // Build: slim takes the outer column off each side of the body; broad adds one.
  for (let y = 11; y <= 15 && p.body !== 'giant'; y++) {
    if (p.build === 'slim') { put(g, 2, y, '.'); put(g, 13, y, '.'); }
    if (p.build === 'broad') { if (g[y][2] !== '.') put(g, 1, y, g[y][2]); if (g[y][13] !== '.') put(g, 14, y, g[y][13]); }
  }
  if (WEAPONS[p.weapon]) WEAPONS[p.weapon](g);
  if (SHIELDS[p.shield]) SHIELDS[p.shield](g);
  const kit = [];
  if (p.body === 'giant' && p.armour === 'none') kit.push('bare-chested'); else kit.push(p.armour === 'none' ? `in ${p.outfit === 'labcoat' ? 'a lab coat' : p.outfit === 'armor' ? 'armour' : `a ${p.outfit}`}` : `in ${p.armour === 'chain' ? 'chain mail' : p.armour === 'robe' ? 'a robe' : `${p.armour} armour`}`);
  if (p.weapon !== 'none') kit.push(`with a${p.weapon === 'axe' ? 'n' : ''} ${p.weapon}${p.shield !== 'none' ? ' and a shield' : ''}`);
  else if (p.shield !== 'none') kit.push('with a shield');
  const what = `${words.join('')}, ${kit.join(', ')}`;
  const map = rows(g);
  for (const row of map) for (const ch of row) if (ch !== '.' && !palette[ch]) palette[ch] = '#808080';
  return { name: 'Your own design', what: what.charAt(0).toUpperCase() + what.slice(1), palette, blinkTo, map, parts: p };
}
