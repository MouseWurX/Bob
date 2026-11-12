// Made by android/tools/make-shared.mjs from public/journey-rules.js. Don't edit.
(function () {
// 🧭 Journey (1.5.206): Adventure played like an old console role-playing game. Walk a land drawn in tiles with the
// arrow keys, open chests, talk to the village, and fight what jumps out of the long grass in turn-based battles.
// This file is the rules and nothing else: the land, the creatures, the dice, the fights, levels and the save. It
// never draws and never touches the page; public/journey-play.js does that. Everything is worked out from a seed and
// the dice function passed in, so the same journey always makes the same land and tests can load the dice.
// No imports: the phone uses this same file, made into a plain script (globalThis.BobJourneyRules) by
// android/tools/make-shared.mjs. No brain is needed to play; nothing loads.

const SAVE_VERSION = 1;
const STATS = ['might', 'wits', 'charm', 'luck'];
const STAT_NAMES = { might: 'Might', wits: 'Wits', charm: 'Charm', luck: 'Luck' };
// The same six classes and starting stats as the Adventure table (src/adventure.js), so a saved character plays the same.
const CLASSES = {
  fighter: { name: 'Fighter', stats: { might: 5, wits: 2, charm: 2, luck: 3 }, weapon: 'sword', armour: 'leather', shield: 'round' },
  rogue: { name: 'Rogue', stats: { might: 2, wits: 4, charm: 3, luck: 3 }, weapon: 'dagger', armour: 'leather', shield: 'none' },
  wizard: { name: 'Wizard', stats: { might: 1, wits: 5, charm: 2, luck: 4 }, weapon: 'staff', armour: 'robe', shield: 'none' },
  cleric: { name: 'Cleric', stats: { might: 3, wits: 3, charm: 4, luck: 2 }, weapon: 'hammer', armour: 'chain', shield: 'round' },
  ranger: { name: 'Ranger', stats: { might: 3, wits: 4, charm: 1, luck: 4 }, weapon: 'bow', armour: 'leather', shield: 'none' },
  bard: { name: 'Bard', stats: { might: 1, wits: 3, charm: 5, luck: 3 }, weapon: 'dagger', armour: 'none', shield: 'none' }
};
const CLASS_IDS = Object.keys(CLASSES);

// ---------- Kit: what the paper doll wears changes the numbers ----------
// The ids are the character screen's parts (public/avatars.js), so equipping one changes the look as well.
const WEAPONS = {
  none: { name: 'Bare hands', power: 0 },
  dagger: { name: 'Dagger', power: 2, crit: 0.12 },
  sword: { name: 'Sword', power: 4 },
  axe: { name: 'Axe', power: 5, crit: -0.02 },
  hammer: { name: 'Hammer', power: 5, smash: true },
  spear: { name: 'Spear', power: 4, first: true },
  staff: { name: 'Staff', power: 1, magic: 3 },
  bow: { name: 'Bow', power: 3, crit: 0.06 }
};
const ARMOURS = { none: { name: 'No armour', guard: 0 }, robe: { name: 'Robe', guard: 1, magic: 2 }, leather: { name: 'Leather', guard: 2 }, chain: { name: 'Chain mail', guard: 4 }, plate: { name: 'Plate', guard: 6, slow: 1 } };
const SHIELDS = { none: { name: 'No shield', guard: 0 }, round: { name: 'Round shield', guard: 1 }, tall: { name: 'Tall shield', guard: 2, slow: 1 } };
const KIT_TABLE = { weapon: WEAPONS, armour: ARMOURS, shield: SHIELDS };

// Things in the bag. Names are our own.
const ITEMS = {
  tonic: { name: 'Mint tonic', what: 'Heals 30 health.', price: 8, heal: 30 },
  bigtonic: { name: 'Thick mint tonic', what: 'Heals 80 health.', price: 24, heal: 80 },
  water: { name: 'Bright water', what: 'Gives back 15 spirit.', price: 14, spirit: 15 },
  salts: { name: 'Waking salts', what: 'Brings someone who fell back up with half their health.', price: 30, revive: 0.5 },
  ember: { name: 'Ember jar', what: 'Thrown: 25 fire damage to one foe.', price: 16, fire: 25 }
};
const SHOP = ['tonic', 'bigtonic', 'water', 'salts', 'ember'];
const KIT_PRICES = { dagger: 20, sword: 45, spear: 50, axe: 70, hammer: 70, staff: 35, bow: 55, leather: 30, chain: 80, plate: 160, robe: 40, round: 25, tall: 60 };
const KIT_SHOP = ['sword', 'spear', 'bow', 'staff', 'leather', 'chain', 'robe', 'round'];

// Skills and spells: cost in spirit. kind: hit (one foe), all (every foe), heal (one friend), healAll, buff, sleep, steal.
const SKILLS = {
  power: { name: 'Power strike', cls: 'fighter', cost: 3, kind: 'hit', stat: 'might', mult: 1.6, what: 'A big swing: much more damage.' },
  guard: { name: 'Stand guard', cls: 'fighter', cost: 2, kind: 'cover', what: 'Takes hits meant for the others this round.' },
  steal: { name: 'Pinch', cls: 'rogue', cost: 2, kind: 'steal', what: 'Lifts coins or an item from a foe.' },
  twin: { name: 'Twin cuts', cls: 'rogue', cost: 4, kind: 'hit', stat: 'luck', mult: 1.3, twice: true, what: 'Two quick cuts.' },
  firebolt: { name: 'Firebolt', cls: 'wizard', cost: 4, kind: 'hit', stat: 'wits', base: 10, element: 'fire', what: 'Fire at one foe.' },
  sleep: { name: 'Sleep', cls: 'wizard', cost: 5, kind: 'sleep', what: 'Puts one foe to sleep for a turn or two.' },
  storm: { name: 'Spark storm', cls: 'wizard', cost: 9, kind: 'all', stat: 'wits', base: 6, element: 'storm', level: 4, what: 'Sparks across every foe.' },
  mend: { name: 'Mend wounds', cls: 'cleric', cost: 3, kind: 'heal', stat: 'charm', base: 16, what: 'Heals one friend.' },
  light: { name: 'Guiding light', cls: 'cleric', cost: 4, kind: 'hit', stat: 'charm', base: 8, element: 'holy', what: 'Holy light: double against the restless dead.' },
  rally: { name: 'Mend all', cls: 'cleric', cost: 8, kind: 'healAll', stat: 'charm', base: 10, level: 4, what: 'Heals the whole party.' },
  thorn: { name: 'Thorn whip', cls: 'ranger', cost: 3, kind: 'hit', stat: 'wits', base: 7, element: 'wild', what: 'Thorns at one foe.' },
  volley: { name: 'Volley', cls: 'ranger', cost: 6, kind: 'all', stat: 'luck', base: 5, level: 3, what: 'Arrows at every foe.' },
  mock: { name: 'Vicious mockery', cls: 'bard', cost: 2, kind: 'hit', stat: 'charm', base: 5, element: 'mind', what: 'Words that sting.' },
  inspire: { name: 'Inspire', cls: 'bard', cost: 4, kind: 'buff', what: 'The party hits harder for the rest of the fight.' }
};
const skillsFor = (cls, level = 1) => Object.entries(SKILLS).filter(([, s]) => s.cls === cls && (s.level || 1) <= level).map(([id]) => id);

// ---------- Creatures ----------
// The same dozen as the bestiary on the Characters page (src/bestiary.js), by id, so they're drawn with the same looks.
// hp, atk, def, spd; xp and gold for winning; weak/tough: elements or weapon kinds that do double/half.
const FOES = {
  rat: { name: 'Giant rat', hp: 14, atk: 5, def: 1, spd: 5, xp: 4, gold: 3, zone: 1 },
  slime: { name: 'Slime', hp: 20, atk: 4, def: 2, spd: 1, xp: 5, gold: 4, weak: ['fire', 'storm'], tough: ['sword', 'axe', 'dagger'], zone: 1 },
  goblin: { name: 'Goblin', hp: 18, atk: 6, def: 2, spd: 4, xp: 6, gold: 6, flees: true, zone: 1 },
  wolf: { name: 'Wolf', hp: 26, atk: 8, def: 3, spd: 6, xp: 9, gold: 4, zone: 2 },
  bandit: { name: 'Bandit', hp: 30, atk: 9, def: 4, spd: 4, xp: 11, gold: 14, zone: 2 },
  spider: { name: 'Giant spider', hp: 30, atk: 9, def: 3, spd: 5, xp: 12, gold: 6, web: true, weak: ['fire'], zone: 2 },
  skeleton: { name: 'Skeleton', hp: 32, atk: 10, def: 5, spd: 3, xp: 13, gold: 8, weak: ['holy', 'hammer'], tough: ['bow', 'dagger'], zone: 2 },
  cultist: { name: 'Cultist', hp: 34, atk: 9, def: 4, spd: 4, xp: 16, gold: 16, chant: true, zone: 3 },
  orc: { name: 'Orc', hp: 48, atk: 13, def: 6, spd: 3, xp: 20, gold: 15, zone: 3 },
  ghost: { name: 'Ghost', hp: 30, atk: 11, def: 2, spd: 6, xp: 18, gold: 10, weak: ['holy', 'mind', 'fire', 'storm', 'wild'], tough: ['sword', 'axe', 'dagger', 'hammer', 'spear', 'bow', 'staff', 'none'], drain: true, zone: 3 },
  troll: { name: 'Troll', hp: 70, atk: 15, def: 7, spd: 2, xp: 30, gold: 24, regen: 6, weak: ['fire'], zone: 4 },
  dragon: { name: 'Dragon', hp: 90, atk: 17, def: 8, spd: 5, xp: 50, gold: 60, breath: true, zone: 5 }
};
// The three keepers at the bottom of the three caves. Each has its own name and a little more of everything.
const GUARDIANS = {
  boss1: { base: 'goblin', name: 'Grubnick, the goblin chief', hp: 115, atk: 12, def: 4, spd: 5, xp: 40, gold: 50, cave: 1 },
  boss2: { base: 'spider', name: 'The Webmother', hp: 150, atk: 14, def: 6, spd: 6, xp: 80, gold: 90, cave: 2 },
  boss3: { base: 'dragon', name: 'Old Cinderjaw', hp: 260, atk: 19, def: 9, spd: 5, xp: 160, gold: 200, cave: 3 }
};
const ZONE_FOES = { 1: ['rat', 'slime', 'goblin'], 2: ['wolf', 'bandit', 'spider', 'goblin'], 3: ['skeleton', 'cultist', 'spider', 'bandit'], 4: ['orc', 'ghost', 'cultist', 'skeleton'], 5: ['troll', 'orc', 'ghost'] };

// ---------- The dice ----------
function seeded(seed) {
  let s = 0;
  for (const c of String(seed)) s = (Math.imul(s, 31) + c.charCodeAt(0)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Tiles ----------
// walk: you can stand on it; wild: creatures jump out; name for the screen reader's "You're on ..." line.
const TILES = {
  '.': { name: 'grass', walk: true, wild: 1 },
  '"': { name: 'long grass', walk: true, wild: 1.6 },
  ':': { name: 'path', walk: true, wild: 0.25 },
  ',': { name: 'sand', walk: true, wild: 0.8 },
  '=': { name: 'bridge', walk: true, wild: 0 },
  'T': { name: 'trees', walk: false },
  '~': { name: 'water', walk: false },
  '^': { name: 'rocks', walk: false },
  'h': { name: 'a house', walk: false },
  'i': { name: 'the inn', walk: false },
  's': { name: 'the shop', walk: false },
  'f': { name: 'a fence', walk: false },
  'C': { name: 'a cave mouth', walk: true, wild: 0 },
  '_': { name: 'the cave floor', walk: true, wild: 1.3 },
  '#': { name: 'the cave wall', walk: false },
  '<': { name: 'the way out', walk: true, wild: 0 },
  '*': { name: 'the village square', walk: true, wild: 0 }
};
const WORLD_W = 44, WORLD_H = 32, CAVE_W = 24, CAVE_H = 18;

// Smooth-ish noise from the dice: a coarse grid of values, blended.
function noise(rnd, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const g = Array.from({ length: gh }, () => Array.from({ length: gw }, () => rnd()));
  return (x, y) => {
    const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const s = (t) => t * t * (3 - 2 * t);
    const a = g[y0][x0] + (g[y0][x0 + 1] - g[y0][x0]) * s(fx), b = g[y0 + 1][x0] + (g[y0 + 1][x0 + 1] - g[y0 + 1][x0]) * s(fx);
    return a + (b - a) * s(fy);
  };
}
const grid = (w, h, ch) => Array.from({ length: h }, () => Array(w).fill(ch));
const toRows = (g) => g.map((r) => r.join(''));

// Cuts a walkable path from a to b: paths over land, bridges over water.
function carve(g, a, b, rnd) {
  let { x, y } = a;
  let guard = 0;
  while ((x !== b.x || y !== b.y) && guard++ < 500) {
    const goX = x !== b.x && (y === b.y || rnd() < 0.55);
    if (goX) x += Math.sign(b.x - x); else y += Math.sign(b.y - y);
    const t = g[y][x];
    if (t === '~') g[y][x] = '=';
    else if (!'C*:=hisf'.includes(t)) g[y][x] = ':';
  }
}
function reachable(rows, from) {
  const h = rows.length, w = rows[0].length, seen = new Set([`${from.x},${from.y}`]), q = [from];
  while (q.length) {
    const { x, y } = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(k) || !TILES[rows[ny][nx]]?.walk) continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  return seen;
}

// The village: houses, the inn and the shop round a square, with a fence and a gate on the south side.
const VILLAGE = [
  'ffffffffff',
  'fh.i..s.hf',
  'f.**::**.f',
  'f.******.f',
  'fh**::**hf',
  'ffff::ffff'
];

// The whole land from a seed: the overworld (world), the village in it, three caves, the chests and the people.
function makeWorld(seed) {
  const rnd = seeded(`journey:${seed}`);
  const w = WORLD_W, h = WORLD_H;
  const g = grid(w, h, '.');
  const land = noise(rnd, w, h, 7), wet = noise(rnd, w, h, 9), wild = noise(rnd, w, h, 5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (edge === 0 || (edge === 1 && land(x, y) > 0.45)) { g[y][x] = edge === 0 ? '^' : 'T'; continue; }
    const t = land(x, y), d = wet(x, y);
    g[y][x] = d > 0.72 ? '~' : d > 0.67 ? ',' : t > 0.7 ? 'T' : t < 0.16 ? '^' : wild(x, y) > 0.62 ? '"' : '.';
  }
  // The village near the top left, the caves in the other corners.
  const vx = 4 + Math.floor(rnd() * 4), vy = 3 + Math.floor(rnd() * 3);
  VILLAGE.forEach((row, dy) => [...row].forEach((ch, dx) => { g[vy + dy][vx + dx] = ch; }));
  const gate = { x: vx + 4, y: vy + VILLAGE.length };
  for (const gx of [gate.x, gate.x + 1]) for (let yy = gate.y; yy <= gate.y + 1; yy++) g[yy][gx] = ':';
  const caves = [
    { x: 20 + Math.floor(rnd() * 6), y: 4 + Math.floor(rnd() * 4) },
    { x: 6 + Math.floor(rnd() * 8), y: h - 6 - Math.floor(rnd() * 3) },
    { x: w - 6 - Math.floor(rnd() * 4), y: h - 6 - Math.floor(rnd() * 4) }
  ];
  caves.forEach((c, i) => {
    for (let yy = c.y - 1; yy <= c.y + 1; yy++) for (let xx = c.x - 1; xx <= c.x + 1; xx++) g[yy][xx] = '^';
    g[c.y][c.x] = 'C'; g[c.y + 1][c.x] = ':';
    carve(g, gate, { x: c.x, y: c.y + 1 }, seeded(`${seed}:road${i}`));
  });
  let rows = toRows(g);
  const start = { x: gate.x, y: vy + 3 };
  // Chests: on open ground the road can reach, away from the village.
  const open = [...reachable(rows, start)].map((k) => k.split(',').map(Number)).filter(([x, y]) => '."'.includes(rows[y][x]) && (Math.abs(x - vx) > 12 || Math.abs(y - vy) > 8));
  const chests = [];
  const loot = ['tonic', 'tonic', 'water', 'ember', 'kit:spear', 'kit:chain', 'kit:tall', 'gold:40', 'salts', 'kit:axe'];
  for (let i = 0; i < 7 && open.length; i++) {
    const [x, y] = open.splice(Math.floor(rnd() * open.length), 1)[0];
    if (chests.some((c) => Math.abs(c.x - x) + Math.abs(c.y - y) < 6)) { i--; if (open.length < 4) break; continue; }
    chests.push({ id: `w${i}`, x, y, loot: loot[i % loot.length] });
  }
  const people = villagers(seed, vx, vy);
  const maps = {
    world: { id: 'world', name: 'The Brindle Vale', w, h, rows, chests, people, doors: caves.map((c, i) => ({ x: c.x, y: c.y, to: `cave${i + 1}` })), start, village: { x: vx, y: vy, w: VILLAGE[0].length, h: VILLAGE.length } }
  };
  caves.forEach((c, i) => { maps[`cave${i + 1}`] = makeCave(seed, i + 1, c); });
  return { seed: String(seed), maps };
}

// A cave: rooms cut out of rock and joined by tunnels, the way out in the first room, the keeper in the last.
function makeCave(seed, n, door) {
  const rnd = seeded(`journey:${seed}:cave${n}`);
  const w = CAVE_W, h = CAVE_H, g = grid(w, h, '#');
  const rooms = [];
  for (let tries = 0; rooms.length < 5 && tries < 200; tries++) {
    const rw = 4 + Math.floor(rnd() * 4), rh = 3 + Math.floor(rnd() * 3);
    const x = 1 + Math.floor(rnd() * (w - rw - 2)), y = 1 + Math.floor(rnd() * (h - rh - 2));
    if (rooms.some((r) => x < r.x + r.w + 1 && x + rw + 1 > r.x && y < r.y + r.h + 1 && y + rh + 1 > r.y)) continue;
    rooms.push({ x, y, w: rw, h: rh });
  }
  rooms.sort((a, b) => (a.x + a.y) - (b.x + b.y));
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g[y][x] = '_';
  const mid = (r) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });
  for (let i = 1; i < rooms.length; i++) {
    let { x, y } = mid(rooms[i - 1]); const b = mid(rooms[i]);
    while (x !== b.x) { x += Math.sign(b.x - x); g[y][x] = '_'; }
    while (y !== b.y) { y += Math.sign(b.y - y); g[y][x] = '_'; }
  }
  const first = mid(rooms[0]), last = mid(rooms[rooms.length - 1]);
  g[first.y][first.x] = '<';
  const chests = [];
  rooms.slice(1, -1).forEach((r, i) => { if (i < 2) chests.push({ id: `c${n}-${i}`, x: r.x, y: r.y, loot: [['tonic', 'kit:leather'], ['water', 'kit:hammer', 'bigtonic'], ['salts', 'kit:plate', 'bigtonic']][n - 1][i] || 'gold:60' }); });
  for (const c of chests) g[c.y][c.x] = '_';
  const boss = { id: `boss${n}`, x: last.x, y: last.y };
  return { id: `cave${n}`, name: ['The Gnawed Hollow', 'The Silk Deeps', 'The Cinder Vault'][n - 1], w, h, rows: toRows(g), chests, people: [], doors: [{ x: first.x, y: first.y, to: 'world', tx: door.x, ty: door.y + 1 }], start: { x: first.x, y: first.y + (g[first.y + 1]?.[first.x] === '_' ? 1 : 0) }, boss, zone: n + 1 };
}

// The village folk: made by the character generator from the seed, so every journey has its own faces.
const FOLK_NAMES = ['Odile', 'Bram', 'Tansy', 'Corwin', 'Mabry', 'Fenn', 'Hollis', 'Ivy', 'Pell', 'Rook', 'Saffi', 'Tamsin'];
const FOLK_LINES = [
  'The lanterns on the hill went dark the night the three keepers came. We have not slept well since.',
  'Stay on the paths if you want a quiet walk. Long grass is where the trouble lives.',
  'Chests out in the wild? Old traders buried their spare kit. Finders keepers, I say.',
  'Rest at the inn. Ten coins and you wake up feeling like a new person. Or at least a tidier one.',
  'Goblins in the north cave, spiders in the south. Whatever is in the east cave, it is warm.',
  'If you fall in a fight, someone will carry you back here. It costs half your coins. Pride is free.'
];
function villagers(seed, vx, vy) {
  const rnd = seeded(`journey:${seed}:folk`);
  const looks = () => ({ body: rnd() < 0.5 ? 'm' : 'f', build: pick(rnd, ['slim', 'regular', 'broad']), hair: pick(rnd, ['short', 'curly', 'tied', 'long', 'bob', 'bun', 'bald', 'swept', 'braids']), hc: String(Math.floor(rnd() * 8)), skin: String(Math.floor(rnd() * 8)), beard: rnd() < 0.3 ? pick(rnd, ['full', 'mustache', 'stubble']) : 'none', outfit: pick(rnd, ['tee', 'jacket', 'apron', 'hoodie']), cloth: String(Math.floor(rnd() * 10)) });
  const names = [...FOLK_NAMES].sort(() => rnd() - 0.5);
  return [
    { id: 'elder', name: `Elder ${names[0]}`, role: 'elder', x: vx + 2, y: vy + 3, facing: 'down', parts: { ...looks(), hair: 'bald', hc: '5', beard: 'full' } },
    { id: 'inn', name: `${names[1]} at the inn`, role: 'inn', x: vx + 3, y: vy + 2, facing: 'down', parts: { ...looks(), outfit: 'apron' } },
    { id: 'shop', name: `${names[2]} at the shop`, role: 'shop', x: vx + 6, y: vy + 2, facing: 'down', parts: looks() },
    { id: 'smith', name: `${names[3]} the smith`, role: 'smith', x: vx + 7, y: vy + 4, facing: 'left', parts: { ...looks(), outfit: 'apron', build: 'broad' } },
    { id: 'folk1', name: names[4], role: 'folk', line: 0, x: vx + 2, y: vy + 4, facing: 'right', parts: looks(), wander: true },
    { id: 'folk2', name: names[5], role: 'folk', line: 1, x: vx + 7, y: vy + 3, facing: 'left', parts: looks(), wander: true }
  ];
}

// ---------- The party ----------
// A party member from a sheet: { name, cls, look, stats?, weapon?, armour?, shield?, who }.
function member(b = {}, level = 1) {
  const cls = CLASS_IDS.includes(b.cls) ? b.cls : 'fighter';
  const base = CLASSES[cls];
  const stats = {};
  for (const s of STATS) { const v = Number(b.stats?.[s]); stats[s] = Number.isInteger(v) && v >= 1 && v <= 9 ? v : base.stats[s]; }
  const kitOk = (k, v) => Object.prototype.hasOwnProperty.call(KIT_TABLE[k], v);
  const m = {
    id: String(b.id || cls).slice(0, 40), name: String(b.name || base.name).slice(0, 40), cls, who: ['you', 'bob', 'friend'].includes(b.who) ? b.who : 'friend',
    look: String(b.look || '').slice(0, 120), stats, level: clamp(Number(b.level) || level, 1, 30), xp: clamp(Number(b.xp) || 0, 0, 1e6),
    weapon: kitOk('weapon', b.weapon) ? b.weapon : base.weapon, armour: kitOk('armour', b.armour) ? b.armour : base.armour, shield: kitOk('shield', b.shield) ? b.shield : base.shield
  };
  m.maxHp = Number.isInteger(b.maxHp) && b.maxHp > 0 && b.maxHp <= 2000 ? b.maxHp : 30 + stats.might * 6 + (m.level - 1) * (6 + stats.might);
  m.maxSp = Number.isInteger(b.maxSp) && b.maxSp >= 0 && b.maxSp <= 600 ? b.maxSp : 6 + stats.wits * 2 + (m.level - 1) * (1 + Math.ceil(stats.wits / 2));
  m.hp = Number.isInteger(b.hp) ? clamp(b.hp, 0, m.maxHp) : m.maxHp;
  m.sp = Number.isInteger(b.sp) ? clamp(b.sp, 0, m.maxSp) : m.maxSp;
  return m;
}
const attackOf = (m) => m.stats.might * 2 + (WEAPONS[m.weapon]?.power || 0) * 2 + m.level;
const guardOf = (m) => (ARMOURS[m.armour]?.guard || 0) + (SHIELDS[m.shield]?.guard || 0) + Math.floor(m.level / 2);
const magicOf = (m) => m.stats.wits + (WEAPONS[m.weapon]?.magic || 0) + (ARMOURS[m.armour]?.magic || 0);
const speedOf = (m) => m.stats.luck * 2 + m.stats.wits - (ARMOURS[m.armour]?.slow || 0) - (SHIELDS[m.shield]?.slow || 0);
const xpFor = (level) => Math.round(18 * Math.pow(level, 1.6));

// A new journey: the land from the seed, your party in the village square, three tonics and a few coins.
function newJourney({ seed = String(Date.now()), party = [] } = {}) {
  const world = makeWorld(seed);
  const p = party.slice(0, 4).map((b) => member(b));
  if (!p.length) p.push(member({ name: 'Hero', cls: 'fighter', who: 'you' }));
  const owned = { weapon: [], armour: [], shield: [] };
  for (const m of p) for (const k of ['weapon', 'armour', 'shield']) if (m[k] !== 'none' && !owned[k].includes(m[k])) owned[k].push(m[k]);
  return {
    v: SAVE_VERSION, seed: world.seed, at: 'world', x: world.maps.world.start.x, y: world.maps.world.start.y, facing: 'down',
    party: p, bag: { tonic: 3, water: 1 }, owned, gold: 30, steps: 0, danger: 0, next: 14, opened: [], beaten: [], talked: [], battles: 0, won: false
  };
}

// Cleans a save from disk (or from the page) into a journey this file can play. Unknown things are dropped.
function cleanJourney(s) {
  if (!s || typeof s !== 'object' || !s.seed) return null;
  const j = newJourney({ seed: String(s.seed).slice(0, 40), party: Array.isArray(s.party) ? s.party : [] });
  const world = makeWorld(j.seed);
  const at = world.maps[s.at] ? s.at : 'world';
  const map = world.maps[at];
  const x = Number(s.x), y = Number(s.y);
  if (Number.isInteger(x) && Number.isInteger(y) && TILES[map.rows[y]?.[x]]?.walk) Object.assign(j, { at, x, y });
  j.facing = ['down', 'up', 'left', 'right'].includes(s.facing) ? s.facing : 'down';
  j.bag = {}; for (const [k, n] of Object.entries(s.bag || {})) if (ITEMS[k] && Number.isInteger(n) && n > 0) j.bag[k] = Math.min(n, 99);
  for (const k of ['weapon', 'armour', 'shield']) j.owned[k] = [...new Set([...(j.owned[k] || []), ...(Array.isArray(s.owned?.[k]) ? s.owned[k] : [])])].filter((v) => v !== 'none' && KIT_TABLE[k][v]);
  for (const k of ['gold', 'steps', 'battles']) j[k] = Math.max(0, Math.min(999999, Number(s[k]) || 0));
  j.danger = Math.max(0, Number(s.danger) || 0); j.next = clamp(Number(s.next) || 14, 6, 40);
  j.opened = (Array.isArray(s.opened) ? s.opened : []).filter((v) => typeof v === 'string').slice(0, 100);
  j.beaten = (Array.isArray(s.beaten) ? s.beaten : []).filter((v) => GUARDIANS[v]);
  j.talked = (Array.isArray(s.talked) ? s.talked : []).filter((v) => typeof v === 'string').slice(0, 40);
  j.won = s.won === true;
  return j;
}

// ---------- Walking ----------
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
// Who or what stands on a tile: a person, a chest, or a cave's keeper.
function thingAt(world, j, x, y) {
  const map = world.maps[j.at];
  const p = map.people.find((q) => q.x === x && q.y === y); if (p) return { kind: 'person', person: p };
  const c = map.chests.find((q) => q.x === x && q.y === y); if (c) return { kind: 'chest', chest: c, open: j.opened.includes(`${map.id}:${c.id}`) };
  if (map.boss && map.boss.x === x && map.boss.y === y && !j.beaten.includes(map.boss.id)) return { kind: 'boss', boss: map.boss };
  return null;
}
const canStand = (world, j, x, y) => { const map = world.maps[j.at]; return TILES[map.rows[y]?.[x]]?.walk === true && !thingAt(world, j, x, y); };

// One press of an arrow key. Turns to face that way; steps if the way is clear. Returns what happened:
// { moved, door, battle: [foe ids], bump } and the journey is changed in place.
function walk(world, j, dir, rnd = Math.random) {
  if (!STEP[dir]) return { moved: false };
  j.facing = dir;
  const [dx, dy] = STEP[dir];
  const x = j.x + dx, y = j.y + dy;
  if (!canStand(world, j, x, y)) return { moved: false, bump: thingAt(world, j, x, y) || { kind: 'tile', tile: world.maps[j.at].rows[y]?.[x] } };
  j.x = x; j.y = y; j.steps++;
  const map = world.maps[j.at];
  const door = map.doors.find((d) => d.x === x && d.y === y);
  if (door) {
    const to = world.maps[door.to];
    j.at = to.id; j.x = door.tx ?? to.start.x; j.y = door.ty ?? to.start.y;
    j.danger = 0;
    return { moved: true, door: to.id };
  }
  const tile = TILES[map.rows[y][x]];
  j.danger += tile.wild || 0;
  if (tile.wild && j.danger >= j.next) {
    j.danger = 0; j.next = 10 + Math.floor(rnd() * 16);
    return { moved: true, battle: encounter(world, j, rnd) };
  }
  return { moved: true };
}

// What jumps out: the zone gets harder the further from the village you walk (and in deeper caves).
function zoneAt(world, j) {
  const map = world.maps[j.at];
  if (map.zone) return map.zone;
  const v = map.village;
  const d = Math.abs(j.x - (v.x + 4)) + Math.abs(j.y - (v.y + 3));
  return clamp(1 + Math.floor(d / 13), 1, 3);
}
function encounter(world, j, rnd = Math.random) {
  const zone = zoneAt(world, j);
  const list = ZONE_FOES[zone] || ZONE_FOES[1];
  const n = 1 + Math.floor(rnd() * Math.min(3, 1 + zone + (j.party.length > 2 ? 1 : 0)));
  return Array.from({ length: Math.min(n, 4) }, () => pick(rnd, list));
}

// ---------- Fights ----------
// The tables above are the creatures' shape; these two set how tough the whole game is (tuned by test/run-journey-test.js).
const FOE_HP = 2.6, FOE_ATK = 1.8;
function foe(id, i = 0) {
  const g = GUARDIANS[id];
  const base = FOES[g ? g.base : id];
  if (!base) return null;
  const f = { ...base, ...(g || {}), key: `${id}-${i}`, id, type: g ? g.base : id, guardian: Boolean(g) };
  f.hp = Math.round(f.hp * FOE_HP); f.atk = Math.round(f.atk * FOE_ATK);
  f.maxHp = f.hp; f.weak = base.weak || []; f.tough = base.tough || [];
  return f;
}
// A fight: the foes (named Goblin A, Goblin B when there are two of a kind), whose turn it is, and the log.
function startBattle(j, ids) {
  const foes = ids.map((id, i) => foe(id, i)).filter(Boolean);
  const count = {}; for (const f of foes) count[f.type] = (count[f.type] || 0) + 1;
  const seen = {};
  for (const f of foes) if (count[f.type] > 1 && !f.guardian) { seen[f.type] = (seen[f.type] || 0) + 1; f.name = `${f.name} ${'ABCD'[seen[f.type] - 1]}`; }
  j.battles++;
  return { foes, round: 0, buff: 0, over: '', guardian: foes.some((f) => f.guardian), log: [] };
}
const alive = (list) => list.filter((x) => x.hp > 0);
const roll = (rnd, n) => Math.round(n * (0.85 + rnd() * 0.3));
function hurt(f, dmg, element, weapon) {
  let mult = 1;
  if (element && f.weak.includes(element)) mult = 2; else if (weapon && f.weak.includes(weapon)) mult = 1.5;
  if ((weapon && f.tough.includes(weapon) && !element) || (element && f.tough.includes(element))) mult *= 0.5;
  return { dmg: Math.max(1, Math.round(dmg * mult)), weak: mult > 1, tough: mult < 1 };
}

// Plays one round. commands: one per party member still standing, by member id:
// { act: 'fight'|'skill'|'item'|'defend'|'run', target: foe key or member id, skill, item }.
// Returns the events in order, for the page to animate: { who, side, act, target, dmg, heal, miss, crit, weak, text }.
function playRound(j, b, commands = {}, rnd = Math.random) {
  if (b.over) return [];
  b.round++;
  const ev = [];
  const say = (e) => { ev.push(e); b.log.push(e.text); if (b.log.length > 60) b.log.shift(); };
  const party = j.party;
  const defending = new Set(), covering = [];
  const spearFirst = (m) => (WEAPONS[m.weapon]?.first ? 4 : 0);
  const turns = [
    ...alive(party).map((m) => ({ side: 'party', who: m, speed: speedOf(m) + spearFirst(m) + rnd() * 4 })),
    ...alive(b.foes).map((f) => ({ side: 'foe', who: f, speed: f.spd * 2 + rnd() * 4 }))
  ].sort((a, c) => c.speed - a.speed);
  // Defending and guarding happen before anything else, so they cover the whole round.
  for (const m of alive(party)) {
    const c = commands[m.id] || { act: 'fight' };
    if (c.act === 'defend') defending.add(m.id);
    if (c.act === 'skill' && c.skill === 'guard' && m.sp >= SKILLS.guard.cost) covering.push(m);
  }
  for (const t of turns) {
    if (b.over) break;
    if (t.who.hp <= 0) continue;
    if (t.side === 'party') partyTurn(t.who, commands[t.who.id] || { act: 'fight' });
    else foeTurn(t.who);
    if (!alive(b.foes).length) { b.over = 'won'; break; }
    if (!alive(party).length) { b.over = 'lost'; break; }
  }
  // Trolls knit back together unless they were burned this round.
  for (const f of alive(b.foes)) if (f.regen && !f.burned) { const h = Math.min(f.regen, f.maxHp - f.hp); if (h > 0) { f.hp += h; say({ who: f.key, side: 'foe', act: 'regen', heal: h, text: `${f.name} knits back together (+${h}).` }); } }
  for (const f of b.foes) f.burned = false;
  if (b.over === 'won') win();
  return ev;

  function targetFoe(key) { const live = alive(b.foes); return live.find((f) => f.key === key) || live[0]; }
  function partyTurn(m, c) {
    if (m.asleep) { m.asleep--; say({ who: m.id, side: 'party', act: 'stuck', text: `${m.name} is stuck in the web.` }); return; }
    if (c.act === 'defend') { say({ who: m.id, side: 'party', act: 'defend', text: `${m.name} braces.` }); return; }
    if (c.act === 'run') {
      if (b.guardian) { say({ who: m.id, side: 'party', act: 'run', miss: true, text: `There's no running from ${b.foes[0].name}.` }); return; }
      const avgLuck = alive(party).reduce((n, p) => n + p.stats.luck, 0) / alive(party).length;
      const fastest = Math.max(...alive(b.foes).map((f) => f.spd));
      if (rnd() < clamp(0.45 + (avgLuck - fastest) * 0.08, 0.15, 0.9)) { b.over = 'fled'; say({ who: m.id, side: 'party', act: 'run', text: 'The party gets away!' }); }
      else say({ who: m.id, side: 'party', act: 'run', miss: true, text: `${m.name} tries to run, but they cut off the way.` });
      return;
    }
    if (c.act === 'item') return useItem(m, c.item, c.target);
    if (c.act === 'skill' && SKILLS[c.skill] && SKILLS[c.skill].cls === m.cls && m.sp >= SKILLS[c.skill].cost) return useSkill(m, c.skill, c.target);
    const f = targetFoe(c.target); if (!f) return;
    strike(m, f, 1, 'fight');
  }
  function strike(m, f, mult, act, extra = {}) {
    const wpn = WEAPONS[m.weapon] || WEAPONS.none;
    if (rnd() < 0.05) { say({ who: m.id, side: 'party', act, target: f.key, miss: true, weapon: m.weapon, text: `${m.name} swings at ${f.name} and misses.` }); return; }
    const crit = rnd() < clamp(0.03 * m.stats.luck + (wpn.crit || 0), 0, 0.5);
    let raw = roll(rnd, (attackOf(m) + b.buff) * mult) - Math.floor(f.def / 2);
    if (crit) raw = Math.round(raw * 1.6);
    const r = hurt(f, Math.max(1, raw), null, m.weapon);
    f.hp = Math.max(0, f.hp - r.dmg);
    say({ who: m.id, side: 'party', act, target: f.key, dmg: r.dmg, crit, weak: r.weak, tough: r.tough, weapon: m.weapon, ...extra, text: `${m.name} ${crit ? 'lands a great hit on' : 'hits'} ${f.name} for ${r.dmg}${r.weak ? '. It hates that!' : r.tough ? '. It barely notices.' : '.'}${f.hp <= 0 ? ` ${f.name} is beaten.` : ''}` });
  }
  function useSkill(m, id, target) {
    const s = SKILLS[id];
    m.sp -= s.cost;
    if (s.kind === 'hit' && s.mult) { const f = targetFoe(target); if (!f) return; strike(m, f, s.mult, 'skill', { skill: id }); if (s.twice && f.hp > 0) strike(m, f, s.mult, 'skill', { skill: id }); return; }
    if (s.kind === 'hit' || s.kind === 'all') {
      const list = s.kind === 'all' ? alive(b.foes) : [targetFoe(target)].filter(Boolean);
      for (const f of list) {
        const power = (s.base || 6) + m.stats[s.stat] * 3 + (s.stat === 'wits' ? magicOf(m) - m.stats.wits : 0) + m.level;
        let raw = roll(rnd, s.kind === 'all' ? power * 0.75 : power);
        if (s.element === 'holy' && ['skeleton', 'ghost'].includes(f.type)) raw *= 2;
        const r = hurt(f, raw, s.element);
        if (s.element === 'fire') f.burned = true;
        f.hp = Math.max(0, f.hp - r.dmg);
        say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, dmg: r.dmg, weak: r.weak, element: s.element, text: `${m.name}'s ${s.name} hits ${f.name} for ${r.dmg}${r.weak ? '. Right where it hurts!' : '.'}${f.hp <= 0 ? ` ${f.name} is beaten.` : ''}` });
      }
      return;
    }
    if (s.kind === 'heal' || s.kind === 'healAll') {
      const list = s.kind === 'healAll' ? alive(party) : [party.find((p) => p.id === target && p.hp > 0) || alive(party).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0]];
      for (const p of list) { const h = Math.min(p.maxHp - p.hp, roll(rnd, s.base + m.stats.charm * 3 + m.level)); p.hp += h; say({ who: m.id, side: 'party', act: 'skill', skill: id, target: p.id, heal: h, text: `${m.name} mends ${p.id === m.id ? 'their own' : `${p.name}'s`} wounds (+${h}).` }); }
      return;
    }
    if (s.kind === 'buff') { b.buff += 4; say({ who: m.id, side: 'party', act: 'skill', skill: id, text: `${m.name} plays something rousing. The party hits harder.` }); return; }
    if (s.kind === 'cover') { say({ who: m.id, side: 'party', act: 'skill', skill: id, text: `${m.name} stands in front of the others.` }); return; }
    if (s.kind === 'sleep') {
      const f = targetFoe(target); if (!f) return;
      if (f.guardian ? rnd() < 0.3 : rnd() < 0.8) { f.asleep = 1 + Math.floor(rnd() * 2); say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, text: `${f.name} nods off.` }); }
      else say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, miss: true, text: `${f.name} shrugs off the sleep.` });
      return;
    }
    if (s.kind === 'steal') {
      const f = targetFoe(target); if (!f) return;
      if (f.stolen || rnd() < 0.35) { say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, miss: true, text: `${m.name} comes away with nothing.` }); return; }
      f.stolen = true;
      if (rnd() < 0.5) { j.bag.tonic = Math.min(99, (j.bag.tonic || 0) + 1); say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, text: `${m.name} pinches a Mint tonic from ${f.name}.` }); }
      else { const g = 5 + Math.floor(rnd() * f.gold); j.gold += g; say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, text: `${m.name} pinches ${g} coins from ${f.name}.` }); }
    }
  }
  function useItem(m, item, target) {
    const it = ITEMS[item];
    if (!it || !(j.bag[item] > 0)) { say({ who: m.id, side: 'party', act: 'item', miss: true, text: `${m.name} rummages, but the bag is out of that.` }); return; }
    if (it.fire) { const f = targetFoe(target); if (!f) return; j.bag[item]--; const r = hurt(f, it.fire, 'fire'); f.burned = true; f.hp = Math.max(0, f.hp - r.dmg); say({ who: m.id, side: 'party', act: 'item', item, target: f.key, dmg: r.dmg, element: 'fire', text: `${m.name} throws an Ember jar at ${f.name}: ${r.dmg} fire.${f.hp <= 0 ? ` ${f.name} is beaten.` : ''}` }); return; }
    const p = party.find((q) => q.id === target) || m;
    if (it.revive) { if (p.hp > 0) { say({ who: m.id, side: 'party', act: 'item', miss: true, text: `${p.name} is already up.` }); return; } j.bag[item]--; p.hp = Math.ceil(p.maxHp * it.revive); say({ who: m.id, side: 'party', act: 'item', item, target: p.id, heal: p.hp, text: `${m.name} wafts the salts. ${p.name} is back up!` }); return; }
    if (p.hp <= 0) { say({ who: m.id, side: 'party', act: 'item', miss: true, text: `${p.name} needs Waking salts first.` }); return; }
    j.bag[item]--;
    if (it.heal) { const h = Math.min(p.maxHp - p.hp, it.heal); p.hp += h; say({ who: m.id, side: 'party', act: 'item', item, target: p.id, heal: h, text: `${p.name} drinks a ${it.name} (+${h}).` }); }
    if (it.spirit) { const h = Math.min(p.maxSp - p.sp, it.spirit); p.sp += h; say({ who: m.id, side: 'party', act: 'item', item, target: p.id, text: `${p.name} drinks the Bright water (+${h} spirit).` }); }
  }
  function foeTurn(f) {
    if (f.asleep) { f.asleep--; say({ who: f.key, side: 'foe', act: 'sleep', text: `${f.name} is asleep.` }); return; }
    if (f.flees && f.hp < f.maxHp * 0.3 && rnd() < 0.35) { f.hp = 0; f.fled = true; say({ who: f.key, side: 'foe', act: 'flee', text: `${f.name} runs off squealing.` }); return; }
    const live = alive(party);
    // Dragons breathe fire over everyone every third round.
    if (f.breath && b.round % 3 === 0) {
      say({ who: f.key, side: 'foe', act: 'breath', text: `${f.name} breathes fire!` });
      for (const p of live) takeHit(f, p, Math.round(f.atk * 0.7), 'breath');
      return;
    }
    if (f.chant && !f.charged && rnd() < 0.4) { f.charged = true; say({ who: f.key, side: 'foe', act: 'chant', text: `${f.name} starts a low chant. Something is coming.` }); return; }
    // Most go for whoever's weakest-looking, some of the time.
    let p = rnd() < 0.4 ? [...live].sort((a, c) => a.hp - c.hp)[0] : pick(rnd, live);
    const cover = covering.find((c) => c.hp > 0 && c.id !== p.id);
    if (cover) p = cover;
    const atk = f.charged ? f.atk * 2 : f.atk;
    f.charged = false;
    takeHit(f, p, atk, f.chant && atk > f.atk ? 'curse' : 'hit');
    if (f.web && p.hp > 0 && rnd() < 0.25) { p.asleep = 1; say({ who: f.key, side: 'foe', act: 'web', target: p.id, text: `${p.name} is caught in a web.` }); }
    if (f.drain && p.sp > 0) { const d = Math.min(p.sp, 3); p.sp -= d; say({ who: f.key, side: 'foe', act: 'drain', target: p.id, text: `The cold touch drains ${d} spirit from ${p.name}.` }); }
  }
  function takeHit(f, p, atk, act) {
    if (rnd() < 0.04 + p.stats.luck * 0.01) { say({ who: f.key, side: 'foe', act, target: p.id, miss: true, text: `${p.name} dodges ${f.name}.` }); return; }
    let dmg = roll(rnd, atk) - Math.floor(guardOf(p) * 1.2);
    if (defending.has(p.id) || covering.includes(p)) dmg = Math.floor(dmg / 2);
    dmg = Math.max(1, dmg);
    p.hp = Math.max(0, p.hp - dmg);
    say({ who: f.key, side: 'foe', act, target: p.id, dmg, text: `${f.name} hits ${p.name} for ${dmg}.${p.hp <= 0 ? ` ${p.name} falls!` : ''}` });
  }
  function win() {
    const beaten = b.foes.filter((f) => !f.fled);
    const xp = beaten.reduce((n, f) => n + f.xp, 0), gold = beaten.reduce((n, f) => n + f.gold, 0);
    j.gold += gold;
    b.reward = { xp, gold, ups: [], drop: '' };
    for (const m of party) {
      if (m.hp <= 0) continue; // you have to be standing at the end to learn from it
      m.xp += xp;
      while (m.xp >= xpFor(m.level)) { m.xp -= xpFor(m.level); b.reward.ups.push(levelUp(m)); }
    }
    if (rnd() < 0.3) { const item = pick(rnd, ['tonic', 'tonic', 'water', 'ember']); j.bag[item] = Math.min(99, (j.bag[item] || 0) + 1); b.reward.drop = item; }
    for (const f of b.foes) if (f.guardian && !j.beaten.includes(f.id)) j.beaten.push(f.id);
    if (Object.keys(GUARDIANS).every((g) => j.beaten.includes(g))) j.won = true;
  }
}

// A level up: more health and spirit, and every other level one point on the class's best stat (up to 9).
function levelUp(m) {
  m.level++;
  const hp = 6 + m.stats.might, sp = 1 + Math.ceil(m.stats.wits / 2);
  m.maxHp += hp; m.maxSp += sp; m.hp = m.maxHp; m.sp = m.maxSp;
  let stat = '';
  if (m.level % 2 === 0) {
    const best = Object.entries(CLASSES[m.cls].stats).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    stat = best.find((k) => m.stats[k] < 9) || '';
    if (stat) m.stats[stat]++;
  }
  const skill = skillsFor(m.cls, m.level).find((id) => (SKILLS[id].level || 1) === m.level);
  return { id: m.id, name: m.name, level: m.level, hp, sp, stat, skill: skill || '' };
}

// After a lost fight: carried back to the inn, everyone up, half the coins gone. Nothing else is lost.
function wakeAtInn(world, j) {
  const v = world.maps.world.village;
  j.at = 'world'; j.x = v.x + 3; j.y = v.y + 3; j.facing = 'down';
  j.gold = Math.floor(j.gold / 2);
  for (const m of j.party) { m.hp = m.maxHp; m.sp = m.maxSp; m.asleep = 0; }
  j.danger = 0;
}
const INN_PRICE = 10;
function rest(j) {
  if (j.gold < INN_PRICE) return false;
  j.gold -= INN_PRICE;
  for (const m of j.party) { m.hp = m.maxHp; m.sp = m.maxSp; m.asleep = 0; }
  return true;
}
function buy(j, what) {
  if (ITEMS[what]) { if (j.gold < ITEMS[what].price) return false; j.gold -= ITEMS[what].price; j.bag[what] = Math.min(99, (j.bag[what] || 0) + 1); return true; }
  const kind = kitKind(what);
  if (!kind || j.owned[kind].includes(what) || j.gold < KIT_PRICES[what]) return false;
  j.gold -= KIT_PRICES[what]; j.owned[kind].push(what); return true;
}
const kitKind = (id) => (WEAPONS[id] && id !== 'none' ? 'weapon' : ARMOURS[id] && id !== 'none' ? 'armour' : SHIELDS[id] && id !== 'none' ? 'shield' : '');
const kitName = (id) => (WEAPONS[id] || ARMOURS[id] || SHIELDS[id])?.name || id;

// Opening a chest: what was inside, in words, and it goes in the bag (or the kit, for the paper doll).
function openChest(world, j, chest) {
  const key = `${j.at}:${chest.id}`;
  if (j.opened.includes(key)) return { already: true, text: 'Empty. Someone got here first. You, in fact.' };
  j.opened.push(key);
  const [kind, what] = chest.loot.includes(':') ? chest.loot.split(':') : ['item', chest.loot];
  if (kind === 'gold') { j.gold += Number(what); return { text: `Inside: ${what} coins.`, gold: Number(what) }; }
  if (kind === 'kit') {
    const k = kitKind(what);
    if (k && !j.owned[k].includes(what)) j.owned[k].push(what);
    return { text: `Inside: ${an(kitName(what).toLowerCase())}! Put it on in Kit.`, kit: what };
  }
  j.bag[what] = Math.min(99, (j.bag[what] || 0) + 1);
  return { text: `Inside: ${an(ITEMS[what].name)}.`, item: what };
}
const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;

// Kit on the paper doll: only what the party owns. Returns false when it isn't owned.
function equip(j, memberId, kind, id) {
  const m = j.party.find((p) => p.id === memberId);
  if (!m || !KIT_TABLE[kind] || !KIT_TABLE[kind][id]) return false;
  if (id !== 'none' && !j.owned[kind].includes(id)) return false;
  m[kind] = id;
  return true;
}

// What the elder says, as the story moves on.
function elderLine(j) {
  const n = j.beaten.length;
  if (j.won) return 'All three lanterns burn again. The vale owes you a debt it will never stop talking about. Stay as long as you like; there are still chests out there.';
  if (n === 0) return 'Three keepers took the lantern stones: a goblin chief to the north, the Webmother to the south, and something old and warm to the east. Bring the stones home. Take the road; it leads to all three.';
  if (n === 1) return 'One lantern burns again! Two to go. The spiders in the south hate fire, if that helps.';
  return 'Two lanterns lit. The last keeper sleeps in the east cave, on a bed of coins and old bones. Rest first. Then rest again.';
}

globalThis.BobJourneyRules = { SAVE_VERSION, STATS, STAT_NAMES, CLASSES, CLASS_IDS, WEAPONS, ARMOURS, SHIELDS, ITEMS, SHOP, KIT_PRICES, KIT_SHOP, SKILLS, skillsFor, FOES, GUARDIANS, ZONE_FOES, seeded, TILES, WORLD_W, makeWorld, FOLK_LINES, member, attackOf, guardOf, magicOf, speedOf, xpFor, newJourney, cleanJourney, STEP, thingAt, canStand, walk, zoneAt, encounter, FOE_HP, foe, startBattle, playRound, levelUp, wakeAtInn, INN_PRICE, rest, buy, kitKind, kitName, openChest, equip, elderLine };
})();
