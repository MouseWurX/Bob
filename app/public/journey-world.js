// 🧭 Journey (1.5.210): the places. Bob's Inn (where every journey starts and ends), and a whole land rolled from a
// seed: oceans, rivers that run downhill to the sea, mountains, forests, swamps, plains and deserts; hamlets,
// villages, towns and a castle joined by roads; caves in the foothills, dungeons out in the wild, and a hermit's
// hut somewhere nobody goes. Every place is drawn only when you first walk into it, from the same seed, so the same
// seed always makes the same land. The people are made by the character generator (public/avatars.js parts) and
// stand where their work is: guards at gates and in squares, knights in the castle, the smith at the forge.
// No imports and no page: the phone uses this same file as a plain script (globalThis.BobJourneyWorld), made by
// android/tools/make-shared.mjs. The rules (public/journey-rules.js) never draw either; the screen does that.

// The first three are the 1.5.211 sizes, rolled exactly as before; the bigger ones (Journey v1.2) are for long
// campaigns: Vast is bigger than the old consoles' overworlds, Campaign is a million tiles, and Saga (four million)
// is for a computer, not a phone (desktopOnly).
export const SIZES = {
  small: { name: 'Small', w: 64, h: 48 }, medium: { name: 'Medium', w: 96, h: 72 }, large: { name: 'Large', w: 128, h: 96 },
  vast: { name: 'Vast', w: 256, h: 192 }, epic: { name: 'Epic', w: 512, h: 512 }, campaign: { name: 'Campaign', w: 1024, h: 1024 },
  saga: { name: 'Saga', w: 2048, h: 2048, desktopOnly: true }
};
export const OLD_SIZES = ['small', 'medium', 'large'];
// How many more places a bigger land gets than a Medium one: by the square root of its area, so a huge land has
// many more towns and dungeons but more wild country between them too.
export const sizeFactor = (size) => { const s = SIZES[size] || SIZES.medium; return Math.sqrt((s.w * s.h) / (96 * 72)); };
export const INN_W = 44, INN_H = 32;

// Every tile: walk (you can stand on it), wild (how fast creatures find you there, 0 = never), cost (for roads).
export const TILES = {
  '.': { name: 'plains', walk: true, wild: 1, cost: 1 },
  '"': { name: 'long grass', walk: true, wild: 1.6, cost: 1.2 },
  'F': { name: 'forest', walk: true, wild: 1.8, cost: 2 },
  'w': { name: 'swamp', walk: true, wild: 2, cost: 3 },
  'd': { name: 'desert', walk: true, wild: 1.4, cost: 2 },
  ',': { name: 'sand', walk: true, wild: 0.8, cost: 1.5 },
  ':': { name: 'road', walk: true, wild: 0.25, cost: 0.4 },
  '=': { name: 'bridge', walk: true, wild: 0, cost: 0.4 },
  '~': { name: 'the sea', walk: false },
  'r': { name: 'a river', walk: false, cost: 9 },
  '^': { name: 'mountains', walk: false },
  'T': { name: 'trees', walk: false },
  // Places on the land: walking onto one goes in.
  'v': { name: 'a hamlet', walk: true, wild: 0 }, 'V': { name: 'a village', walk: true, wild: 0 }, 'O': { name: 'a town', walk: true, wild: 0 },
  'K': { name: 'the castle', walk: true, wild: 0 }, 'C': { name: 'a cave', walk: true, wild: 0 }, 'D': { name: 'a dungeon', walk: true, wild: 0 }, 'H': { name: 'a hut', walk: true, wild: 0 },
  // In a settlement.
  '*': { name: 'the square', walk: true, wild: 0 }, 'g': { name: 'grass', walk: true, wild: 0 },
  'h': { name: 'a house', walk: false }, 'i': { name: 'the inn', walk: false }, 's': { name: 'the shop', walk: false }, 'm': { name: 'the smithy', walk: false }, 't': { name: 'the temple', walk: false },
  'f': { name: 'a fence', walk: false }, 'W': { name: 'a stone wall', walk: false }, 'x': { name: 'the hall floor', walk: true, wild: 0 }, 'Y': { name: 'the throne', walk: false },
  'e': { name: 'the way out', walk: true, wild: 0 }, 'G': { name: 'the gate', walk: true, wild: 0 }, 'Q': { name: 'a tower', walk: false },
  'U': { name: 'the well', walk: false }, 'y': { name: 'flowers', walk: false }, 'a': { name: "the trainer's yard", walk: false }, 'R': { name: 'the barracks', walk: false },
  'P': { name: 'a pillar', walk: false }, 'I': { name: "Bob's Inn", walk: true, wild: 0 },
  // Underground.
  '_': { name: 'the cave floor', walk: true, wild: 1.3 }, '#': { name: 'rock', walk: false }, 'z': { name: 'old flagstones', walk: true, wild: 1.5 }, 'Z': { name: 'a crumbling wall', walk: false },
  // Bob's Inn.
  'o': { name: 'floorboards', walk: true, wild: 0 }, 'B': { name: 'a timber wall', walk: false }, 'b': { name: 'a table', walk: false }, 'c': { name: 'a stool', walk: true, wild: 0 },
  'k': { name: 'the bar', walk: false }, 'p': { name: 'the fireplace', walk: false }, 'q': { name: 'a barrel', walk: false }, 'n': { name: 'the notice board', walk: false },
  'u': { name: 'a rug', walk: true, wild: 0 }, 'l': { name: 'a bed', walk: false }, 'j': { name: 'the stage', walk: true, wild: 0 },
  // Journey v1.2: the cloud cities (only from the sky) and the merfolk cities (only from under the sea), and inside them.
  'S': { name: 'a cloud city', walk: false }, 'A': { name: 'a city under the sea', walk: false },
  'X': { name: 'an orc village', walk: true, wild: 0 }, 'L': { name: 'a kobold lair', walk: true, wild: 0 }, 'N': { name: 'a dwarf hold', walk: true, wild: 0 }, 'E': { name: 'an elf tree village', walk: true, wild: 0 },
  'M': { name: 'halfling burrows', walk: true, wild: 0 }, 'J': { name: 'a pixie glade', walk: true, wild: 0 }, '1': { name: 'a lizardfolk village', walk: true, wild: 0 },
  '2': { name: 'a gnome tinker town', walk: true, wild: 0 }, '3': { name: 'a centaur camp', walk: true, wild: 0 }, '4': { name: 'a giant hall', walk: true, wild: 0 }, '5': { name: 'a goblin market', walk: true, wild: 0 },
  '%': { name: 'cloud', walk: true, wild: 0 }, '&': { name: 'open sky', walk: false }, '$': { name: 'the sea floor', walk: true, wild: 0 }, '+': { name: 'coral', walk: false }
};
export const SITE_TILES = { bobsinn: 'I', hamlet: 'v', village: 'V', town: 'O', castle: 'K', cave: 'C', dungeon: 'D', hermit: 'H', aerie: 'S', reef: 'A', orccamp: 'X', kobold: 'L', dwarfhold: 'N', elfwood: 'E', burrow: 'M', glade: 'J', stilts: '1', gnome: '2', centaur: '3', giant: '4', goblin: '5' };
export const SITE_WORDS = { bobsinn: "Bob's Inn", hamlet: 'Hamlet', village: 'Village', town: 'Town', castle: 'Castle', cave: 'Cave', dungeon: 'Dungeon', hermit: "Hermit's hut", aerie: 'Cloud city', reef: 'Merfolk city', orccamp: 'Orc village', kobold: 'Kobold lair', dwarfhold: 'Dwarf hold', elfwood: 'Elf tree village', burrow: 'Halfling burrows', glade: 'Pixie glade', stilts: 'Lizardfolk village', gnome: 'Gnome tinker town', centaur: 'Centaur camp', giant: 'Giant hall', goblin: 'Goblin market' };
// The animals that wander each kind of land (and the least danger zone they show up in). Walk up and say hello.
export const WILD_ON = {
  '.': [['rabbit', 1], ['horse', 1], ['fox', 1], ['crow', 1]], '"': [['rabbit', 1], ['fox', 1], ['horse', 1], ['hawk', 2]],
  F: [['fox', 1], ['boar', 2], ['owl', 2], ['elk', 3], ['lynx', 3], ['bear', 4]], d: [['camel', 2], ['scorpion', 3]], w: [['toad', 1], ['strider', 3]], ',': [['crab', 1], ['gull', 1]]
};
export const HILL_WILD = [['ram', 3], ['griffin', 4], ['pegasus', 4]];

// The bosses beyond the three keepers, and where they like to live (tiles they need nearby). The rules
// (journey-rules.js) give them their numbers; their base is one of the bestiary's creatures, for the look.
export const DUNGEON_BOSSES = [
  { id: 'bogwitch', land: ['w'] }, { id: 'sandwyrm', land: ['d'] }, { id: 'frostfang', land: ['^'] }, { id: 'mossback', land: ['F'] },
  { id: 'rattlecrown' }, { id: 'rustedknight' }, { id: 'drownedchoir', land: [',', '~'] }, { id: 'gorrak' }, { id: 'redsilas', land: ['.', '"', ':'] }
];
export const CAVE_BOSSES = [{ id: 'ratking' }, { id: 'bigslime', land: ['w', 'F'] }, { id: 'broodqueen', land: ['F'] }, { id: 'oldtusk' }, { id: 'cavetroll', land: ['^'] }];

// ---------- The dice ----------
export function seeded(seed) {
  let s = 0;
  for (const c of String(seed)) s = (Math.imul(s, 31) + c.charCodeAt(0)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const grid = (w, h, ch) => Array.from({ length: h }, () => Array(w).fill(ch));
const toRows = (g) => g.map((r) => r.join(''));
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function valueNoise(rnd, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const g = Array.from({ length: gh }, () => Array.from({ length: gw }, () => rnd()));
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = s(gx - x0), fy = s(gy - y0);
    const a = g[y0][x0] + (g[y0][x0 + 1] - g[y0][x0]) * fx, b = g[y0 + 1][x0] + (g[y0 + 1][x0 + 1] - g[y0 + 1][x0]) * fx;
    return a + (b - a) * fy;
  };
}
function fbm(rnd, w, h, cells) { const ns = cells.map((c) => valueNoise(rnd, w, h, c)); return (x, y) => ns.reduce((t, n, i) => t + n(x, y) / 2 ** i, 0) / ns.reduce((t, _, i) => t + 1 / 2 ** i, 0); }

// ---------- Names ----------
const SYL_A = ['Ash', 'Bram', 'Brindle', 'Cold', 'Dun', 'Elm', 'Fen', 'Gold', 'Grey', 'Hollow', 'Iron', 'Kettle', 'Lark', 'Marsh', 'Mill', 'Oak', 'Pike', 'Raven', 'Salt', 'Thorn', 'Wick', 'Willow', 'Wren', 'Yarrow'];
const SYL_B = ['ford', 'by', 'stead', 'wick', 'mere', 'holt', 'brook', 'combe', 'cross', 'haven', 'ley', 'moor', 'reach', 'ton', 'wold', 'gate'];
const placeName = (rnd) => `${pick(rnd, SYL_A)}${pick(rnd, SYL_B)}`;
const FIRST = ['Odile', 'Bram', 'Tansy', 'Corwin', 'Mabry', 'Fenn', 'Hollis', 'Ivy', 'Pell', 'Rook', 'Saffi', 'Tamsin', 'Aldo', 'Berit', 'Cass', 'Dorran', 'Elske', 'Garrick', 'Hesk', 'Ilda', 'Jory', 'Kestrel', 'Linnet', 'Morrow', 'Nell', 'Osric', 'Prue', 'Quill', 'Rosamund', 'Sten', 'Tilda', 'Ulric', 'Vesna', 'Wystan', 'Yorick', 'Wilda'];
const personName = (rnd) => pick(rnd, FIRST);

// ---------- The people ----------
// role: folk, inn, shop, smith, priest, trainer, guard, captain, knight, ruler, hermit, bard, peddler, keeper (Bob), cat.
// Each gets a look from the character generator's parts, with the kit their work calls for.
export function personParts(rnd, role) {
  const p = {
    body: rnd() < 0.5 ? 'm' : 'f', build: pick(rnd, ['slim', 'regular', 'broad']),
    hair: pick(rnd, ['short', 'curly', 'tied', 'long', 'bob', 'bun', 'bald', 'swept', 'braids', 'sidepart', 'ponytail', 'pixie']),
    hc: String(Math.floor(rnd() * 8)), skin: String(Math.floor(rnd() * 8)), beard: 'none', glasses: rnd() < 0.15 ? '1' : '0',
    outfit: pick(rnd, ['tee', 'jacket', 'apron', 'hoodie']), cloth: String(Math.floor(rnd() * 10)), armour: 'none', weapon: 'none', shield: 'none', face: '0'
  };
  if (p.body === 'f' && ['short', 'sidepart', 'bald'].includes(p.hair)) p.hair = 'long';
  if (p.body === 'm' && ['bob', 'bun', 'braids', 'ponytail', 'pixie'].includes(p.hair)) p.hair = 'short';
  if (p.body === 'm' && rnd() < 0.35) p.beard = pick(rnd, ['full', 'mustache', 'stubble', 'goatee']);
  if (role === 'folk' && rnd() < 0.15) p.weapon = 'dagger';
  if (role === 'smith') Object.assign(p, { outfit: 'apron', build: 'broad', weapon: 'hammer' });
  if (role === 'inn') p.outfit = 'apron';
  if (role === 'trainer') Object.assign(p, { outfit: 'armor', armour: 'leather', weapon: 'staff', build: 'broad' });
  if (role === 'priest') Object.assign(p, { armour: 'robe', cloth: '8' });
  if (role === 'guard') Object.assign(p, { outfit: 'armor', armour: pick(rnd, ['leather', 'chain']), weapon: pick(rnd, ['spear', 'sword']), shield: 'round' });
  if (role === 'captain') Object.assign(p, { outfit: 'armor', armour: 'chain', weapon: 'sword', shield: 'tall', build: 'broad' });
  if (role === 'knight') Object.assign(p, { outfit: 'armor', armour: 'plate', weapon: pick(rnd, ['sword', 'axe', 'hammer']), shield: 'tall', build: 'broad' });
  if (role === 'ruler') Object.assign(p, { outfit: 'suit', cloth: '7', armour: 'none', weapon: 'none' });
  if (role === 'hermit') Object.assign(p, { armour: 'robe', cloth: '2', weapon: 'staff', hair: 'long', hc: '5', beard: p.body === 'm' ? 'full' : 'none' });
  if (role === 'bard') Object.assign(p, { outfit: 'jacket', weapon: 'dagger' });
  if (role === 'peddler') Object.assign(p, { outfit: 'hoodie', weapon: 'dagger' });
  return p;
}
function person(rnd, role, x, y, extra = {}) {
  return { id: `${role}-${x}-${y}`, name: personName(rnd), role, x, y, facing: 'down', parts: personParts(rnd, role), wander: role === 'folk' || role === 'cat', line: Math.floor(rnd() * 100), ...extra };
}

// ---------- Bob's Inn ----------
// A medieval tavern, 44x32: the bar along the north wall with Bob behind it, the fire in the corner, tables and
// stools, a stage for the bard, a rug by the hearth, rooms upstairs (beds along the east), and the notice board by
// the front door, where adventures are found. Walking out of the front door goes back to the land you were on.
export function makeInn(day = 'today') {
  const rnd = seeded(`inn:${day}`);
  const w = INN_W, h = INN_H, g = grid(w, h, 'o');
  for (let x = 0; x < w; x++) { g[0][x] = 'B'; g[h - 1][x] = 'B'; }
  for (let y = 0; y < h; y++) { g[y][0] = 'B'; g[y][w - 1] = 'B'; }
  // The bar, with barrels behind it.
  for (let x = 4; x <= 20; x++) g[5][x] = 'k';
  g[4][4] = 'k'; g[3][4] = 'k';
  for (let x = 6; x <= 19; x += 2) g[1][x] = 'q';
  // The fire and its rug.
  for (let x = 25; x <= 28; x++) g[1][x] = 'p';
  for (let y = 3; y <= 6; y++) for (let x = 24; x <= 29; x++) g[y][x] = 'u';
  // The guest rooms along the east wall.
  for (let y = 1; y <= 26; y++) g[y][34] = 'B';
  g[8][34] = 'o'; g[18][34] = 'o';
  for (const y of [2, 6, 12, 16, 22, 25]) { g[y][40] = 'l'; g[y][41] = 'l'; }
  for (const y of [4, 10, 14, 20, 24]) for (let x = 35; x <= 42; x++) g[y][x] = 'B';
  for (const y of [4, 10, 14, 20, 24]) g[y][37] = 'o';
  // The stage in the south-west corner.
  for (let y = 22; y <= 28; y++) for (let x = 1; x <= 6; x++) g[y][x] = 'j';
  // Tables with stools round them.
  const tables = [[9, 10], [16, 10], [23, 10], [9, 16], [16, 16], [23, 16], [12, 22], [20, 22], [27, 22]];
  for (const [x, y] of tables) { g[y][x] = 'b'; g[y][x + 1] = 'b'; for (const [sx, sy] of [[x - 1, y], [x + 2, y], [x, y - 1], [x + 1, y + 1]]) if (g[sy][sx] === 'o') g[sy][sx] = 'c'; }
  // The front door and the notice board beside it.
  g[h - 1][21] = 'e'; g[h - 1][22] = 'e';
  g[h - 1][25] = 'n';
  const people = [
    { id: 'bob', name: 'Bob', role: 'keeper', x: 12, y: 3, facing: 'down', look: 'innkeeper', fixed: true },
    { id: 'patches', name: 'Patches', role: 'cat', x: 26, y: 5, facing: 'left', parts: { body: 'beast', skin: '7', face: '5' }, wander: true, fixed: true },
    person(rnd, 'bard', 3, 25, { id: 'bard', wander: false })
  ];
  const seats = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < 34; x++) if (g[y][x] === 'c') seats.push([x, y]);
  for (let i = 0; i < 7 && seats.length; i++) { const [x, y] = seats.splice(Math.floor(rnd() * seats.length), 1)[0]; people.push(person(rnd, 'folk', x, y, { id: `patron${i}`, wander: i % 3 === 0 })); }
  return { id: 'inn', kind: 'inn', name: "Bob's Inn", w, h, rows: toRows(g), chests: [], people, doors: [{ x: 21, y: h - 1, to: 'world' }, { x: 22, y: h - 1, to: 'world' }], start: { x: 21, y: h - 3 }, board: { x: 25, y: h - 1 }, zone: 0 };
}

// ---------- The land ----------
// The steps, in order: height (an island, highest in the middle), the sea, mountains on the peaks; wet and warm for
// forests, swamps, deserts and grass; rivers from the foothills downhill to the sea; the mainland (the biggest piece
// of land); settlements where people would build (flat ground, fresh water, the coast), spaced apart; roads between
// them with bridges over the rivers; caves in the foothills, dungeons in the wild, the hermit far from everyone.
export function makeWorld(seed, size = 'medium') {
  const sz = SIZES[size] || SIZES.medium;
  const big = Boolean(SIZES[size]) && !OLD_SIZES.includes(size), f = sizeFactor(size);
  const rnd = seeded(`world:${seed}:${size}`);
  const w = sz.w, h = sz.h;
  // A big land keeps the same size of hills and woods as a small one (the noise is measured in tiles, not in land).
  const height = big ? fbm(rnd, w, h, [96, 40, 16, 7]) : fbm(rnd, w, h, [w / 4, w / 8, w / 16]);
  const wet = big ? fbm(rnd, w, h, [80, 28]) : fbm(rnd, w, h, [w / 5, w / 12]), warm = big ? fbm(rnd, w, h, [120]) : fbm(rnd, w, h, [w / 6]);
  const elev = Array.from({ length: h }, () => new Float64Array(w)); // numbers packed in rows, not boxed in arrays
  const all = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x / (w - 1)) * 2 - 1, ny = (y / (h - 1)) * 2 - 1;
    const edge = Math.max(Math.abs(nx), Math.abs(ny));
    elev[y][x] = height(x, y) - edge ** 3 * 0.55;
    all[y * w + x] = elev[y][x];
  }
  // A big land is several continents with open sea between them (Journey v1.2): each one a rise in the ground.
  const continents = [];
  if (big) {
    const crnd = seeded(`continents:${seed}`);
    const n = clamp(Math.round(f / 1.6), 2, 9);
    for (let i = 0, tries = 0; continents.length < n && tries < 400; tries++) {
      const c = { x: w * (0.15 + crnd() * 0.7), y: h * (0.15 + crnd() * 0.7), r: Math.min(w, h) * (0.16 + crnd() * 0.14) };
      if (continents.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > (o.r + c.r) * 0.95)) { continents.push(c); i++; }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // The coast wanders: the distance to a continent's middle is bent by the noise, and the middle is a broad
      // plateau rather than a peak, so the mountains still come from the noise.
      const bx = x + (wet(x, y) - 0.5) * Math.min(w, 400) * 0.3, by = y + (height(x, y) - 0.5) * Math.min(h, 400) * 0.3;
      let rise = 0;
      for (const c of continents) rise = Math.max(rise, clamp((1 - Math.hypot(bx - c.x, by - c.y) / c.r) * 2.4, 0, 1));
      elev[y][x] = elev[y][x] + rise * 0.55 - (1 - rise) * 0.35;
      all[y * w + x] = elev[y][x];
    }
  }
  const sorted = all.sort();
  const sea = sorted[Math.floor(sorted.length * (big ? 0.55 : 0.36))], peak = sorted[Math.floor(sorted.length * (big ? 0.95 : 0.93))];
  const g = grid(w, h, '.');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = elev[y][x];
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || e < sea) { g[y][x] = '~'; continue; }
    if (e > peak) { g[y][x] = '^'; continue; }
    const m = wet(x, y), t = warm(x, y) * 0.6 + (y / h) * 0.4; // the south is warmer
    g[y][x] = t > 0.62 && m < 0.45 ? 'd' : m > 0.62 && e < sea + (peak - sea) * 0.25 ? 'w' : m > 0.53 ? 'F' : m > 0.46 ? '"' : '.';
  }
  // Beaches.
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (g[y][x] !== '~' && g[y][x] !== '^' && N4.some(([dx, dy]) => g[y + dy][x + dx] === '~')) g[y][x] = ',';
  // Rivers: from a foothill, always downhill (or the lowest way on) until the sea or another river.
  const rivers = { small: 3, medium: 5, large: 8 }[size] || Math.round(5 * f * 1.4);
  const foot = [];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) if (g[y][x] !== '^' && g[y][x] !== '~' && N4.some(([dx, dy]) => g[y + dy][x + dx] === '^')) foot.push([x, y]);
  for (let r = 0; r < rivers && foot.length; r++) {
    let [x, y] = foot.splice(Math.floor(rnd() * foot.length), 1)[0];
    const seen = new Set();
    for (let n = 0; n < w * 2; n++) {
      if (g[y][x] === '~' || (g[y][x] === 'r' && n > 0)) break;
      g[y][x] = 'r'; seen.add(`${x},${y}`);
      const next = N4.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a > 0 && b > 0 && a < w - 1 && b < h - 1 && g[b][a] !== '^' && !seen.has(`${a},${b}`)).sort((p, q) => elev[p[1]][p[0]] - elev[q[1]][q[0]]);
      if (!next.length) break;
      [x, y] = next[0];
    }
  }
  // The mainland: the biggest piece of land you could walk if every river had a bridge.
  const comp = grid(w, h, -1);
  let best = -1, bestSize = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (comp[y][x] >= 0 || g[y][x] === '~' || g[y][x] === '^') continue;
    const id = y * w + x, q = [[x, y]]; comp[y][x] = id; let n = 0;
    while (q.length) { const [a, b] = q.pop(); n++; for (const [dx, dy] of N4) { const c = a + dx, d = b + dy; if (comp[d]?.[c] === -1 && g[d][c] !== '~' && g[d][c] !== '^') { comp[d][c] = id; q.push([c, d]); } } }
    if (n > bestSize) { bestSize = n; best = id; }
  }
  // On a big land every continent big enough for a few places counts, not just the biggest one.
  const sizes = new Map();
  if (big) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (comp[y][x] >= 0) sizes.set(comp[y][x], (sizes.get(comp[y][x]) || 0) + 1);
  const lands = new Set(big ? [...sizes].filter(([, n]) => n >= bestSize * 0.12).map(([id]) => id) : [best]);
  const main = (x, y) => lands.has(comp[y]?.[x]);
  const nearRiver = (x, y, r = 2) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (g[y + dy]?.[x + dx] === 'r') return true; return false; };
  const nearMountain = (x, y) => N4.some(([dx, dy]) => g[y + dy]?.[x + dx] === '^');
  const sites = [];
  const spacing = big ? Math.round(Math.sqrt((w * h) / (19 * f)) * 0.75) : Math.round(w / 9);
  const farFromSites = (x, y, d = spacing) => sites.every((s) => Math.abs(s.x - x) + Math.abs(s.y - y) >= d);
  const okTile = (x, y) => main(x, y) && '."F,dw'.includes(g[y][x]) && x > 2 && y > 2 && x < w - 3 && y < h - 3 && N4.some(([dx, dy]) => TILES[g[y + dy][x + dx]]?.walk && g[y + dy][x + dx] !== 'r');
  const land = [];
  // A big land only looks at every few tiles for a place to build (the same land, much quicker).
  const stride = big ? Math.max(1, Math.round(Math.sqrt((w * h) / 60000))) : 1;
  for (let y = 3; y < h - 3; y += stride) for (let x = 3; x < w - 3; x += stride) if (okTile(x, y)) land.push([x, y]);
  const place = (kind, n, score, d) => {
    const cand = land.map(([x, y]) => [x, y, score(x, y) + rnd() * 0.8]).sort((a, b) => b[2] - a[2]);
    let placed = 0;
    for (const [x, y] of cand) { if (placed >= n) break; if (!farFromSites(x, y, d)) continue; sites.push({ kind, x, y }); placed++; }
  };
  const cx = w / 2, cy = h / 2;
  const settle = (x, y) => ({ '.': 1.2, '"': 1, ',': 0.7, 'F': 0.3, 'd': 0.1, 'w': -0.5 }[g[y][x]] || 0) + (nearRiver(x, y) ? 1 : 0);
  const counts = { small: [1, 1, 3, 3, 2, 3], medium: [1, 2, 4, 5, 3, 4], large: [1, 3, 5, 7, 4, 5] }[size] || [Math.max(1, Math.round(f / 2.5)), ...[2, 4, 5, 3, 4].map((n) => Math.round(n * f))];
  place('castle', counts[0], (x, y) => settle(x, y) + 2 - (Math.abs(x - cx) + Math.abs(y - cy)) / w * 3, spacing);
  place('town', counts[1], settle, spacing);
  place('village', counts[2], settle, spacing);
  place('hamlet', counts[3], (x, y) => settle(x, y) * 0.5, Math.round(spacing * 0.8));
  place('cave', counts[4], (x, y) => (nearMountain(x, y) ? 3 : -5), Math.round(spacing * 0.7));
  place('dungeon', Math.max(3, counts[5]), (x, y) => ({ F: 1, w: 1.5, d: 1.2 }[g[y][x]] || 0) + Math.min(...sites.filter((s) => s.kind !== 'cave').map((s) => Math.abs(s.x - x) + Math.abs(s.y - y))) / w * 4, Math.round(spacing * 0.7));
  place('hermit', big ? Math.max(1, Math.round(f / 3)) : 1, (x, y) => (g[y][x] === 'F' ? 1 : 0) + (nearMountain(x, y) ? 1 : 0) + Math.min(...sites.map((s) => Math.abs(s.x - x) + Math.abs(s.y - y))) / w * 6, Math.round(spacing * 0.6));
  // Roads: every settlement joined to its nearest neighbour already on the network (a spanning tree), by the cheapest
  // way over the ground; a road over a river is a bridge. Caves, dungeons and the hut get a footpath to the nearest
  // settlement, which only needs bridges.
  const towns = sites.filter((s) => ['castle', 'town', 'village', 'hamlet'].includes(s.kind));
  // On a big land a road only looks for its way in a box round its two ends (roads don't wander far anyway).
  const path = (a, b) => cheapest(g, w, h, a, b, big ? Math.max(24, Math.round((Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / 2)) : 0);
  const roads = [];
  const groups = big ? [...lands].map((id) => towns.filter((t) => comp[t.y][t.x] === id)).filter((gr) => gr.length) : [towns];
  for (const group of groups) {
  const joined = [group[0]];
  const rest = group.slice(1);
  while (rest.length) {
    let bi = 0, bj = 0, bd = Infinity;
    rest.forEach((s, i) => joined.forEach((t, k) => { const d = Math.abs(s.x - t.x) + Math.abs(s.y - t.y); if (d < bd) { bd = d; bi = i; bj = k; } }));
    const s = rest.splice(bi, 1)[0];
    const road = path(s, joined[bj]) || [];
    for (const [x, y] of road) { if (g[y][x] === 'r') g[y][x] = '='; else if (!'=vVOKCDH'.includes(g[y][x])) g[y][x] = ':'; }
    if (road.length > 4) roads.push({ from: s, to: joined[bj], steps: road });
    joined.push(s);
  }
  }
  for (const s of sites.filter((x) => !towns.includes(x))) {
    const near = [...towns].filter((t) => !big || comp[t.y][t.x] === comp[s.y][s.x]).sort((a, b) => Math.abs(a.x - s.x) + Math.abs(a.y - s.y) - Math.abs(b.x - s.x) - Math.abs(b.y - s.y))[0];
    if (!near) continue;
    for (const [x, y] of path(s, near) || []) if (g[y][x] === 'r') g[y][x] = '=';
  }
  // Names, the tile on the map, and the step you come out on.
  const nameRnd = seeded(`names:${seed}`);
  const used = new Set();
  sites.forEach((s, i) => {
    s.i = i; s.id = `site${i}`;
    // A huge land runs out of plain names, so later ones get a second word (Ashford Under Hill).
    let n = placeName(nameRnd), tries = 0; while (used.has(n)) n = tries++ < 30 ? placeName(nameRnd) : `${placeName(nameRnd)} ${pick(nameRnd, ['Major', 'Minor', 'Under Hill', 'Upon Sea', 'End', 'Cross', 'Green', 'Deep'])}`; used.add(n);
    s.name = s.kind === 'castle' ? `Castle ${n}` : s.kind === 'cave' ? `${n} Cave` : s.kind === 'dungeon' ? `The ${pick(nameRnd, ['Sunken', 'Forgotten', 'Black', 'Hollow', 'Drowned', 'Old'])} ${pick(nameRnd, ['Keep', 'Crypt', 'Halls', 'Tower', 'Barrow', 'Temple'])} of ${n}` : s.kind === 'hermit' ? "The hermit's hut" : n;
    g[s.y][s.x] = SITE_TILES[s.kind];
  });
  for (const s of sites) {
    const out = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => ({ x: s.x + dx, y: s.y + dy })).find((p) => TILES[g[p.y][p.x]]?.walk && !SITE_TILES[g[p.y][p.x]] && !Object.values(SITE_TILES).includes(g[p.y][p.x]));
    s.exit = out || { x: s.x, y: s.y + 1 };
  }
  // Where you start: the settlement furthest from the castle's opposite... simply the village (or hamlet) that is
  // most central to the rest, so there's somewhere to go in every direction. Danger grows with distance from it.
  const homes = sites.filter((s) => s.kind === 'village').concat(sites.filter((s) => s.kind === 'hamlet')).filter((s) => !big || comp[s.y][s.x] === best);
  const home = homes.sort((a, b) => sum(a) - sum(b))[0] || towns[0];
  function sum(s) { return towns.reduce((t, o) => t + Math.abs(o.x - s.x) + Math.abs(o.y - s.y), 0); }
  const zoneOf = (x, y) => clamp(1 + Math.floor((Math.abs(x - home.x) + Math.abs(y - home.y)) / (w / 6)), 1, 5);
  for (const s of sites) s.zone = zoneOf(s.x, s.y);
  // The three lantern stones are in the three dungeons nearest, middling and furthest from home.
  const dungeons = sites.filter((s) => s.kind === 'dungeon').sort((a, b) => (Math.abs(a.x - home.x) + Math.abs(a.y - home.y)) - (Math.abs(b.x - home.x) + Math.abs(b.y - home.y)));
  const keeperSites = [dungeons[0], dungeons[Math.floor(dungeons.length / 2)] === dungeons[0] ? dungeons[1] : dungeons[Math.floor(dungeons.length / 2)], dungeons[dungeons.length - 1]];
  keeperSites.forEach((s, k) => { if (s) s.keeper = `boss${k + 1}`; });
  // Every other dungeon gets a boss that fits the land round it, and every cave a smaller one by its best chest.
  const bossRnd = seeded(`bosses:${seed}`);
  const around = (s) => { const n = {}; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const t = g[s.y + dy]?.[s.x + dx]; if (t) n[t] = (n[t] || 0) + 1; } return n; };
  const takeBoss = (list, s) => {
    const n = around(s);
    const fit = list.filter((b) => !b.land || b.land.some((t) => (n[t] || 0) >= 4)).filter((b) => !sites.some((o) => o.keeper === b.id));
    const pool = fit.length ? fit : list.filter((b) => !sites.some((o) => o.keeper === b.id));
    if (pool.length) s.keeper = pick(bossRnd, pool).id;
  };
  for (const s of dungeons) if (!s.keeper) takeBoss(DUNGEON_BOSSES, s);
  for (const s of sites.filter((x) => x.kind === 'cave')) takeBoss(CAVE_BOSSES, s);
  // Bob's Inn stands on the road a few steps from home: where every journey starts, and where you come back to.
  const innSpot = [];
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    const x = home.x + dx, y = home.y + dy, d = Math.abs(dx) + Math.abs(dy);
    if (d < 3 || !main(x, y) || !'."F,d:'.includes(g[y]?.[x]) || sites.some((o) => Math.abs(o.x - x) + Math.abs(o.y - y) < 2)) continue;
    if (!N4.some(([a, b]) => '."F,d:'.includes(g[y + b]?.[x + a]))) continue;
    innSpot.push([x, y, d + (g[y][x] === ':' ? -2 : 0) + (N4.some(([a, b]) => g[y + b]?.[x + a] === ':') ? -1.5 : 0)]);
  }
  innSpot.sort((a, b) => a[2] - b[2]);
  if (innSpot.length) {
    const [x, y] = innSpot[0];
    const inn = { kind: 'bobsinn', x, y, zone: 1 };
    for (const [px, py] of path(inn, home) || []) if (g[py][px] === 'r') g[py][px] = '='; else if ('."F,dw'.includes(g[py][px])) g[py][px] = ':';
    inn.id = 'inn'; inn.name = "Bob's Inn"; g[y][x] = 'I';
    inn.exit = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => ({ x: x + dx, y: y + dy })).find((p) => TILES[g[p.y][p.x]]?.walk && !Object.values(SITE_TILES).includes(g[p.y][p.x])) || { x, y: y + 1 };
    sites.push(inn);
  }
  // ---------- Journey v1.2: more places, on their own dice so the places above never change ----------
  const xrnd = seeded(`more:${seed}:${size}`);
  const nameMore = seeded(`morenames:${seed}`);
  const extra = [];
  const more = big ? Math.max(1, Math.round(f / 2)) : 1;
  const free = (x, y, d) => [...sites, ...extra].every((o) => Math.abs(o.x - x) + Math.abs(o.y - y) >= d);
  const nearPeak = (x, y, r = 2) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (g[y + dy]?.[x + dx] === '^') return true; return false; };
  const n8 = (x, y, t) => { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (t.includes(g[y + dy]?.[x + dx])) n++; return n; };
  // The folk of other kinds, each where they'd live: orcs on the plains and the badlands, kobolds dug into the
  // foothills, dwarves at a door in the mountains, elves deep in the forest, halflings in the long grass, pixies in
  // forest glades and lizardfolk on stilts over the swamp.
  const KIN = [
    ['orccamp', (x, y) => ('d.'.includes(g[y][x]) ? 1 : 0) + (n8(x, y, 'd') > 2 ? 1 : 0)],
    ['kobold', (x, y) => (nearPeak(x, y) && '."F,d'.includes(g[y][x]) ? 2 : 0)],
    ['dwarfhold', (x, y) => (nearPeak(x, y) && '."F,'.includes(g[y][x]) ? 1 + n8(x, y, '^') / 4 : 0)],
    ['elfwood', (x, y) => (g[y][x] === 'F' ? n8(x, y, 'F') / 3 : 0)],
    ['burrow', (x, y) => (g[y][x] === '"' ? 1 + n8(x, y, '"') / 4 : 0)],
    ['glade', (x, y) => (g[y][x] === 'F' ? n8(x, y, 'F') / 3 + (nearRiver(x, y, 3) ? 1 : 0) : 0)],
    ['stilts', (x, y) => (g[y][x] === 'w' ? 1 + n8(x, y, 'w') / 3 : 0)],
    ['gnome', (x, y) => ('".'.includes(g[y][x]) && nearRiver(x, y, 3) ? 1 + (nearMountain(x, y) ? 1 : 0) : 0)],
    ['centaur', (x, y) => (g[y][x] === '.' ? 1 + n8(x, y, '.') / 4 : 0)],
    ['giant', (x, y) => (nearPeak(x, y) && '."F,d'.includes(g[y][x]) ? 1 + n8(x, y, '^') / 2 : 0)],
    ['goblin', (x, y) => ('F"w'.includes(g[y][x]) ? 1 : 0)]
  ];
  const landNow = [];
  for (let y = 3; y < h - 3; y += stride) for (let x = 3; x < w - 3; x += stride) if (main(x, y) && TILES[g[y][x]]?.walk && !Object.values(SITE_TILES).includes(g[y][x]) && g[y][x] !== ':' && g[y][x] !== '=') landNow.push([x, y]);
  // A small land has room for only some of them; which ones is up to the dice.
  const kinHere = size === 'small' ? [...KIN].sort(() => xrnd() - 0.5).slice(0, 5) : size === 'medium' ? [...KIN].sort(() => xrnd() - 0.5).slice(0, 8) : KIN;
  for (const [kind, score] of kinHere) {
    const cand = landNow.map(([x, y]) => [x, y, score(x, y)]).filter((c) => c[2] > 0).map((c) => [c[0], c[1], c[2] + xrnd() * 0.8]).sort((a, b) => b[2] - a[2]);
    let n = 0;
    for (const [x, y] of cand) { if (n >= more) break; if (!free(x, y, Math.round(spacing * 0.6))) continue; extra.push({ kind, x, y }); n++; }
  }
  // Ports: a settlement by the sea has a dock (and every continent with people gets at least one).
  const coastal = (s, r = 3) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (g[s.y + dy]?.[s.x + dx] === '~') return true; return false; };
  for (const t of towns) if (coastal(t)) t.dock = true;
  for (const id of lands) {
    const here = towns.filter((t) => comp[t.y][t.x] === id);
    if (here.length && !here.some((t) => t.dock)) { here.sort((a, b) => Number(coastal(b, 8)) - Number(coastal(a, 8))); here[0].dock = true; }
  }
  // The cloud cities float over the peaks or the sea; the merfolk cities lie under open sea, far from any shore.
  const skyAt = [], reefAt = [];
  for (let y = 4; y < h - 4; y += stride) for (let x = 4; x < w - 4; x += stride) {
    if (g[y][x] === '^' && n8(x, y, '^') >= 8) skyAt.push([x, y]);
    if (g[y][x] === '~' && n8(x, y, '~') === 9 && N4.every(([dx, dy]) => g[y + dy * 3]?.[x + dx * 3] === '~')) reefAt.push([x, y]);
  }
  const farHome = (x, y) => Math.abs(x - home.x) + Math.abs(y - home.y);
  for (const [kind, list] of [['aerie', skyAt.length ? skyAt : reefAt], ['reef', reefAt]]) {
    const cand = list.map(([x, y]) => [x, y, farHome(x, y) / w + xrnd() * 0.6]).sort((a, b) => b[2] - a[2]);
    let n = 0;
    for (const [x, y] of cand) { if (n >= more) break; if (!free(x, y, spacing)) continue; extra.push({ kind, x, y }); n++; }
  }
  extra.forEach((e, i) => {
    e.id = `${e.kind}${i}`; e.i = sites.length;
    const n = placeName(nameMore);
    e.name = { orccamp: `${n} Warcamp`, gnome: `${n} Cogworks`, centaur: `${n} Run`, giant: `${n} Steading`, goblin: `${n} Market`, kobold: `The ${n} Warren`, dwarfhold: `${n} Hold`, elfwood: `${n} Boughs`, burrow: `${n} Burrows`, glade: `${n} Glade`, stilts: `${n} Stilts`, aerie: `${n} Aerie`, reef: `${n} Deep` }[e.kind];
    e.zone = Math.max(e.kind === 'aerie' || e.kind === 'reef' ? 3 : 1, zoneOf(e.x, e.y));
    if (e.kind === 'aerie') { e.alt = 'sky'; e.keeper = 'stormroc'; }
    if (e.kind === 'reef') { e.alt = 'deep'; e.keeper = 'leviathan'; }
    if (e.kind === 'kobold') e.keeper = 'koboldking';
    g[e.y][e.x] = SITE_TILES[e.kind];
    e.exit = e.alt ? { x: e.x, y: e.y } : N4.map(([dx, dy]) => ({ x: e.x + dx, y: e.y + dy })).find((p) => TILES[g[p.y][p.x]]?.walk && !Object.values(SITE_TILES).includes(g[p.y][p.x])) || { x: e.x, y: e.y + 1 };
    sites.push(e);
    if (!e.alt) { const near = towns.filter((t) => comp[t.y][t.x] === comp[e.y][e.x]).sort((a, b) => Math.abs(a.x - e.x) + Math.abs(a.y - e.y) - Math.abs(b.x - e.x) - Math.abs(b.y - e.y))[0]; if (near) for (const [x, y] of path(e, near) || []) if (g[y][x] === 'r') g[y][x] = '='; }
  });
  // Small jobs, one in most settlements: clear a cave, take down a boss for a bounty, find a lost pet, or find
  // someone who went into a cave or dungeon and didn't come back.
  const qrnd = seeded(`quests:${seed}`);
  const lost = [];
  const caves = sites.filter((x) => x.kind === 'cave' || x.kind === 'kobold'), dens = sites.filter((x) => x.kind === 'dungeon' && !['boss1', 'boss2', 'boss3'].includes(x.keeper));
  const nearest = (s, list) => list.filter((o) => !big || comp[o.y]?.[o.x] === comp[s.y][s.x]).sort((a, b) => Math.abs(a.x - s.x) + Math.abs(a.y - s.y) - Math.abs(b.x - s.x) - Math.abs(b.y - s.y))[0];
  for (const t of towns) {
    if (t.kind === 'castle' || qrnd() < 0.2) continue;
    const kinds = ['lostpet', 'missing'];
    if (caves.length) kinds.push('clear'); if (dens.length) kinds.push('bounty');
    const kind = pick(qrnd, kinds);
    if (kind === 'clear' || kind === 'bounty') { const tg = nearest(t, kind === 'clear' ? caves : dens); if (tg?.keeper) t.quest = { kind, target: tg.id, keeper: tg.keeper }; }
    else if (kind === 'missing') { const tg = nearest(t, [...caves, ...dens]); if (tg) { t.quest = { kind, target: tg.id, who: personName(qrnd), id: `missing-${t.id}` }; tg.missing = { id: `missing-${t.id}`, name: t.quest.who, from: t.id }; } }
    else {
      const animal = pick(qrnd, ['fox', 'rabbit', 'crow', 'tortoise', 'boar']);
      for (let tries = 0; tries < 60; tries++) {
        const x = t.x + Math.round((qrnd() - 0.5) * spacing * 2), y = t.y + Math.round((qrnd() - 0.5) * spacing * 2);
        if (!main(x, y) || !'."F,dw'.includes(g[y]?.[x])) continue;
        const name = pick(qrnd, ['Biscuit', 'Pip', 'Turnip', 'Nutmeg', 'Old Bess', 'Mopsy', 'Clover', 'Bramble']);
        t.quest = { kind, id: `lost-${t.id}`, animal, name, x, y };
        lost.push({ id: `lost-${t.id}`, name, role: 'animal', beast: animal, lost: t.id, x, y, facing: 'left', wander: true });
        break;
      }
    }
  }
  // Animals wander the land, by the kind of ground (and only the tamer ones near home).
  const wrnd = seeded(`wild:${seed}`);
  const wild = [];
  const wildCount = clamp(Math.round(landNow.length * stride * stride / 260), 8, 2500);
  for (let i = 0, tries = 0; wild.length < wildCount && tries < wildCount * 6; tries++) {
    const [x, y] = landNow[Math.floor(wrnd() * landNow.length)] || [];
    if (x === undefined) break;
    const t = g[y][x];
    if (!TILES[t]?.walk || t === ':' || t === '=' || Object.values(SITE_TILES).includes(t)) continue;
    const z = zoneOf(x, y);
    const list = [...(WILD_ON[t] || []), ...(nearMountain(x, y) ? HILL_WILD : [])].filter(([, mz]) => mz <= z + 1);
    if (!list.length) continue;
    const [beast] = pick(wrnd, list);
    wild.push({ id: `wild${i++}`, name: '', role: 'animal', beast, x, y, facing: pick(wrnd, ['left', 'right']), wander: true });
  }
  // Folk on the roads: patrols from the castle and towns walk the roads back and forth, with travellers and a
  // peddler or two. Creatures rarely jump out near a patrol, and a patrol close by joins your fight.
  const roadRnd = seeded(`roads:${seed}`);
  const walkers = [];
  roads.forEach((r, i) => {
    const big = [r.from.kind, r.to.kind].some((k) => k === 'castle' || k === 'town');
    const role = big ? (roadRnd() < 0.6 ? 'guard' : 'knight') : pick(roadRnd, ['folk', 'peddler', 'guard']);
    const at = Math.floor(roadRnd() * r.steps.length);
    const [x, y] = r.steps[at];
    const p = person(roadRnd, role, x, y, { id: `road${i}-${role}`, home: 'world', tier: 'road', route: r.steps.map(([a, b]) => ({ x: a, y: b })), routeAt: at, routeDir: 1, patrol: role === 'guard' || role === 'knight', wander: false });
    walkers.push(p);
  });
  const rows = toRows(g);
  const people = [...walkers, ...lost, ...wild];
  const roadList = roads.map((r) => ({ from: r.from.id, to: r.to.id, length: r.steps.length }));
  return worldOf({ seed: String(seed), size: SIZES[size] ? size : 'medium', w, h, rows, sites, people, roads: roadList, home: { id: home.id, x: home.x, y: home.y, exit: { ...home.exit } } });
}
// The finished land. Built out here, away from makeWorld, so the big working grids (heights, wetness, paths) are
// let go as soon as the land is made: a closure inside makeWorld would keep them all alive for as long as you play.
// Places (towns, caves, cities) are built the first time you walk in, and only the last few are kept.
const KEEP_PLACES = 6;
function worldOf({ seed, size, w, h, rows, sites, people, roads, home }) {
  const zoneOf = (x, y) => clamp(1 + Math.floor((Math.abs(x - home.x) + Math.abs(y - home.y)) / (w / 6)), 1, 5);
  const worldMap = { id: 'world', kind: 'world', name: 'The land', w, h, rows, chests: [], people, doors: sites.map((s) => ({ x: s.x, y: s.y, to: s.id, ...(s.alt ? { alt: s.alt } : {}) })), start: { ...home.exit }, zoneOf };
  const cache = new Map();
  const world = {
    seed, size, tiles: TILES, zoneOf, w, h, sites, roads, home: home.id, start: { ...home.exit },
    map(id) {
      if (id === 'world') return worldMap;
      if (cache.has(id)) { const m = cache.get(id); cache.delete(id); cache.set(id, m); return m; }
      let m = null;
      if (id === 'inn') { const s = sites.find((x) => x.id === 'inn') || sites.find((x) => x.id === home.id); m = makeInn(`${seed}`); m.doors.forEach((d) => { d.tx = s.exit.x; d.ty = s.exit.y; }); m.zone = 1; }
      else { const s = sites.find((x) => x.id === id); if (!s) return null; m = makeSite(world, s); }
      cache.set(id, m);
      // People in a place move about while you're there; a place you left long ago is built fresh (the same) next time.
      while (cache.size > KEEP_PLACES) cache.delete(cache.keys().next().value);
      return m;
    }
  };
  return world;
}

// Bob's Inn on its own, before any adventure is rolled: the front door goes nowhere yet.
export function innOnly() {
  const inn = makeInn('today');
  inn.doors = inn.doors.map((d) => ({ ...d, to: 'world' })); // there's no land yet: walk() says the door is stuck
  return { seed: '', size: '', tiles: TILES, w: 0, h: 0, sites: [], roads: [], home: '', start: inn.start, lobby: true, map: (id) => (id === 'inn' ? inn : null) };
}

// The cheapest walk from a to b over the ground (no sea, no mountains); rivers cost a lot, roads very little.
function cheapest(g, w, h, a, b, pad = 0) {
  if (pad > 0) {
    // Search a box round the two ends, in the box's own coordinates, then move the way back onto the land.
    const x0 = Math.max(0, Math.min(a.x, b.x) - pad), y0 = Math.max(0, Math.min(a.y, b.y) - pad);
    const x1 = Math.min(w - 1, Math.max(a.x, b.x) + pad), y1 = Math.min(h - 1, Math.max(a.y, b.y) + pad);
    const box = [];
    for (let y = y0; y <= y1; y++) box.push(g[y].slice(x0, x1 + 1));
    const out = cheapest(box, x1 - x0 + 1, y1 - y0 + 1, { x: a.x - x0, y: a.y - y0 }, { x: b.x - x0, y: b.y - y0 }, 0);
    return out ? out.map(([x, y]) => [x + x0, y + y0]) : null;
  }
  const cost = (x, y) => { const t = g[y][x]; if (t === '~' || t === '^') return Infinity; if (Object.values(SITE_TILES).includes(t)) return 1; return TILES[t]?.cost ?? 1; };
  const dist = new Float64Array(w * h).fill(Infinity), from = new Int32Array(w * h).fill(-1);
  const heap = [[0, a.y * w + a.x]];
  dist[a.y * w + a.x] = 0;
  const goal = b.y * w + b.x;
  const push = (item) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, k] = pop();
    if (k === goal) break;
    if (d > dist[k]) continue;
    const x = k % w, y = (k - x) / w;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = cost(nx, ny); if (c === Infinity) continue;
      const nk = ny * w + nx, nd = d + c + (Math.abs(nx - b.x) + Math.abs(ny - b.y)) * 0; // plain Dijkstra: always the cheapest
      if (nd < dist[nk]) { dist[nk] = nd; from[nk] = k; push([nd, nk]); }
    }
  }
  if (from[goal] < 0) return null;
  const out = [];
  for (let k = goal; k !== a.y * w + a.x && k >= 0; k = from[k]) out.push([k % w, Math.floor(k / w)]);
  return out.reverse();
}

// ---------- Inside a place ----------
const TIER_SIZE = { hamlet: [22, 16], village: [28, 20], town: [38, 28] };
export function makeSite(world, s) {
  const rnd = seeded(`${world.seed}:${s.id}`);
  if (s.kind === 'cave' || s.kind === 'dungeon' || s.kind === 'kobold') return makeDeep(world, s, rnd);
  if (s.kind === 'hermit') return makeHut(world, s, rnd);
  if (s.kind === 'aerie' || s.kind === 'reef') return withExtras(world, s, makeCity(world, s, rnd));
  if (KIN_PLACES[s.kind]) return withExtras(world, s, makeKin(world, s, rnd));
  return withExtras(world, s, makeSettlement(world, s, rnd));
}
// Journey v1.2 additions to a settlement, on their own dice so the place itself never changes: the dock's sailor,
// the one with a job for you, and now and then an Aerie trader who has flown down to sell (people with visiting
// are only there some of the time; the rules say when).
function withExtras(world, s, map) {
  const rnd = seeded(`${world.seed}:${s.id}:v12`);
  const g = map.rows.map((r) => [...r]);
  const open = (x, y) => world.tiles[g[y]?.[x]]?.walk && !'eG'.includes(g[y][x]) && !map.people.some((p) => p.x === x && p.y === y) && !map.doors.some((d) => d.x === x && d.y === y);
  const spot = (x0, y0) => { for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) === r && open(x0 + dx, y0 + dy)) return { x: x0 + dx, y: y0 + dy }; return null; };
  const add = (role, at, extra) => { if (!at) return null; const p = person(rnd, role, at.x, at.y, { id: `${s.id}-${role}-x${map.people.length}`, home: s.id, tier: s.kind, ...extra }); map.people.push(p); return p; };
  if (s.dock) add('sailor', spot(map.start.x + 3, map.start.y - 1), { facing: 'left' });
  if (s.quest) add('elder', spot(Math.floor(map.w / 2) - 3, Math.floor(map.h / 2)), { facing: 'down', title: 'Elder' });
  if (!['aerie', 'reef', 'kobold'].includes(s.kind)) add('trader', spot(Math.floor(map.w / 2) + 2, Math.floor(map.h / 2) - 1), { facing: 'down', beast: 'birdfolk', visiting: true, wander: false });
  return map;
}
// The other folk's places. size, the edge (trees, a fence, stone, water), the buildings, and who lives there.
export const KIN_PLACES = {
  orccamp: { size: [30, 22], edge: 'f', build: ['i', 's', 'm', 'a', 'h', 'h', 'h', 'h'], race: 'orc', folk: 7, guards: 3, ruler: 'Chief', trees: 0.3 },
  dwarfhold: { size: [34, 26], edge: 'W', build: ['i', 's', 'm', 'm', 't', 'a', 'h', 'h', 'h'], race: 'dwarf', folk: 8, guards: 3, ruler: 'King', trees: 0 },
  elfwood: { size: [32, 24], edge: 'T', build: ['i', 's', 'm', 't', 'a', 'h', 'h', 'h', 'h'], race: 'elf', folk: 7, guards: 2, ruler: 'Lady', trees: 3, smith: 'bowyer' },
  burrow: { size: [28, 20], edge: 'T', build: ['i', 's', 's', 'h', 'h', 'h', 'h', 'h'], race: 'halfling', folk: 8, guards: 1, trees: 1 },
  glade: { size: [24, 18], edge: 'T', build: ['s', 't', 'a', 'h', 'h'], race: 'pixie', folk: 6, guards: 0, trees: 2 },
  stilts: { size: [28, 20], edge: 'r', build: ['i', 's', 'a', 'h', 'h', 'h', 'h'], race: 'lizard', folk: 6, guards: 2, trees: 0 },
  gnome: { size: [28, 20], edge: 'f', build: ['i', 's', 'm', 'm', 'a', 'h', 'h', 'h'], race: 'gnome', folk: 7, guards: 1, trees: 0, smith: 'tinker' },
  centaur: { size: [30, 22], edge: 'f', build: ['s', 'a', 'h', 'h', 'h'], race: 'centaur', folk: 6, guards: 2, ruler: 'Herd-mother', trees: 1 },
  giant: { size: [36, 28], edge: 'W', build: ['i', 'm', 'h', 'h'], race: 'giant', folk: 4, guards: 2, ruler: 'Jarl', trees: 0 },
  goblin: { size: [30, 22], edge: 'f', build: ['s', 's', 's', 'i', 'h', 'h', 'h', 'h'], race: 'goblin', folk: 9, guards: 2, trees: 1 }
};
// How each kind of folk looks: the character generator's parts with a few changes, a tint, and how big they're drawn.
export function kinLook(rnd, role, race, parts = personParts(rnd, role)) {
  const p = { ...parts };
  if (race === 'orc') Object.assign(p, { body: 'giant', skin: '0', face: '6', beard: 'none', glasses: '0' });
  if (race === 'dwarf') Object.assign(p, { build: 'broad', beard: p.body === 'm' ? pick(rnd, ['full', 'full', 'mustache']) : 'none' });
  if (race === 'elf') Object.assign(p, { build: 'slim', hair: pick(rnd, ['long', 'tied', 'braids']), beard: 'none' });
  if (race === 'lizard') Object.assign(p, { body: 'alien', skin: '1', face: '6', hair: 'bald', beard: 'none', glasses: '0' });
  if (race === 'gnome') Object.assign(p, { glasses: '1', hair: pick(rnd, ['tied', 'curly', 'bun']), beard: p.body === 'm' ? 'full' : 'none', outfit: 'apron' });
  if (race === 'goblin') Object.assign(p, { body: 'alien', skin: '0', face: '6', beard: 'none' });
  if (race === 'giant') Object.assign(p, { build: 'broad', beard: p.body === 'm' ? 'full' : 'none', armour: role === 'guard' ? 'chain' : p.armour });
  return { parts: p, tint: { orc: 'orc', lizard: 'lizard', goblin: 'goblin' }[race] || '', scale: { dwarf: 0.85, halfling: 0.75, pixie: 0.6, gnome: 0.7, goblin: 0.8, giant: 1.4 }[race] || 0, wings: race === 'pixie', beast: race === 'centaur' ? 'centaur' : undefined };
}
function makeKin(world, s, rnd) {
  const k = KIN_PLACES[s.kind];
  const [w, h] = k.size, g = grid(w, h, 'g'), mid = Math.floor(w / 2);
  for (let x = 0; x < w; x++) { g[0][x] = k.edge; g[h - 1][x] = k.edge; }
  for (let y = 0; y < h; y++) { g[y][0] = k.edge; g[y][w - 1] = k.edge; }
  g[h - 1][mid - 1] = 'e'; g[h - 1][mid] = 'e';
  for (let y = h - 2; y >= Math.floor(h / 2); y--) { g[y][mid - 1] = ':'; g[y][mid] = ':'; }
  const sq = { x0: mid - 3, x1: mid + 2, y0: Math.floor(h / 2) - 2, y1: Math.floor(h / 2) + 1 };
  for (let y = sq.y0; y <= sq.y1; y++) for (let x = sq.x0; x <= sq.x1; x++) g[y][x] = '*';
  if (k.ruler) { g[2][mid - 1] = 'Y'; g[2][mid] = 'Y'; for (let y = 3; y < sq.y0; y++) { g[y][mid - 1] = 'u'; g[y][mid] = 'u'; } }
  const people = [];
  const add = (role, x, y, extra = {}) => {
    if (!world.tiles[g[y]?.[x]]?.walk || g[y][x] === 'e' || people.some((p) => p.x === x && p.y === y)) return null;
    const look = kinLook(rnd, role, k.race);
    const p = person(rnd, role, x, y, { parts: look.parts, race: k.race, tint: look.tint, scale: look.scale, wings: look.wings, ...(look.beast ? { beast: look.beast } : {}), ...extra });
    people.push(p); return p;
  };
  if (k.ruler) add('ruler', mid - 1, 3, { facing: 'down', title: k.ruler, crown: true });
  placeBuildings(g, rnd, { x0: 2, y0: 2, x1: w - 3, y1: h - 3 }, k.build, add, people);
  if (k.smith) for (const p of people) if (p.role === 'smith') p.role = k.smith;
  for (let i = 0; i < k.trees; i++) scatterTrees(g, rnd, w, h, people);
  addFolk(g, rnd, w, h, k.folk, add);
  for (let i = 0; i < k.guards; i++) add('guard', mid + (i % 2 ? 1 : -2), h - 3 - Math.floor(i / 2) * 2, { facing: 'down' });
  return finishSettlement(world, s, g, w, h, people, { x: mid, y: h - 2 });
}
// A cloud city or a merfolk city: a settlement on cloud (or the sea floor) with open sky (or coral) all round, its
// own folk, and a great beast nesting at the top. You leave the way you came: into the sky, or into the deep.
function makeCity(world, s, rnd) {
  const sky = s.kind === 'aerie';
  const w = 32, h = 26, g = grid(w, h, 'g'), mid = Math.floor(w / 2);
  const edge = sky ? '&' : '+', floor = sky ? '%' : '$';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot((x - mid) / (w / 2), (y - h / 2) / (h / 2)); if (d > 0.98 + Math.sin(x * 1.7 + y) * 0.04) g[y][x] = edge; }
  for (let x = 0; x < w; x++) { g[0][x] = edge; g[h - 1][x] = edge; }
  for (let y = h - 4; y < h; y++) { g[y][mid - 1] = 'g'; g[y][mid] = 'g'; }
  g[h - 1][mid - 1] = 'e'; g[h - 1][mid] = 'e';
  const sq = { x0: mid - 3, x1: mid + 2, y0: Math.floor(h / 2), y1: Math.floor(h / 2) + 3 };
  for (let y = sq.y0; y <= sq.y1; y++) for (let x = sq.x0; x <= sq.x1; x++) g[y][x] = '*';
  for (let y = 3; y < sq.y0; y++) { g[y][mid - 1] = '*'; g[y][mid] = '*'; }
  const people = [];
  const beast = sky ? 'birdfolk' : 'merfolk';
  const add = (role, x, y, extra = {}) => { if (!world.tiles[g[y]?.[x]]?.walk || g[y][x] === 'e' || people.some((p) => p.x === x && p.y === y)) return null; const p = person(rnd, role, x, y, { beast, race: sky ? 'aerie' : 'merfolk', ...extra }); people.push(p); return p; };
  placeBuildings(g, rnd, { x0: 3, y0: 5, x1: w - 4, y1: h - 4 }, ['i', 's', 't', 'a', 'h', 'h', 'h', 'h'], add, people);
  addFolk(g, rnd, w, h, 7, add);
  add('guard', mid - 2, h - 3, { facing: 'down' }); add('guard', mid + 1, h - 3, { facing: 'down' }); add('guard', mid - 2, sq.y0 - 3, {});
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x] === 'g') g[y][x] = floor;
  const map = finishSettlement(world, s, g, w, h, people, { x: mid, y: h - 2 });
  for (const d of map.doors) { d.tx = s.x; d.ty = s.y; d.alt = s.alt; }
  map.boss = { id: s.keeper, x: mid, y: 2 };
  return map;
}
function exitDoors(g, w, h, s) {
  const doors = [];
  for (let x = 0; x < w; x++) if (g[h - 1][x] === 'e') doors.push({ x, y: h - 1, to: 'world', tx: s.exit.x, ty: s.exit.y });
  return doors;
}
// Buildings are two tiles square with their keeper on the doorstep below; they go on free grass in a region,
// nearest the middle first, never on a path and never touching another building.
function placeBuildings(g, rnd, region, kinds, add, people) {
  const role = { i: 'inn', s: 'shop', m: 'smith', t: 'priest', a: 'trainer' };
  const free = (x, y) => [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [-1, 0], [2, 0], [-1, 1], [2, 1]].every(([dx, dy]) => g[y + dy]?.[x + dx] === 'g') && !people.some((p) => p.x >= x - 1 && p.x <= x + 2 && p.y >= y - 1 && p.y <= y + 2);
  const cx = (region.x0 + region.x1) / 2, cy = (region.y0 + region.y1) / 2;
  const spots = [];
  for (let y = region.y0; y <= region.y1 - 2; y++) for (let x = region.x0; x <= region.x1 - 1; x++) spots.push([x, y, Math.abs(x - cx) + Math.abs(y - cy) + rnd() * 3]);
  spots.sort((a, b) => a[2] - b[2]);
  for (const k of kinds) {
    const sp = spots.find(([x, y]) => free(x, y));
    if (!sp) break;
    const [x, y] = sp;
    g[y][x] = k; g[y][x + 1] = k; g[y + 1][x] = k; g[y + 1][x + 1] = k;
    if (role[k]) add(role[k], x, y + 2, { facing: 'down' });
  }
}
function makeSettlement(world, s, rnd) {
  if (s.kind === 'castle') return makeCastle(world, s, rnd);
  const [w, h] = TIER_SIZE[s.kind];
  const g = grid(w, h, 'g');
  const mid = Math.floor(w / 2);
  const wall = s.kind === 'town' ? 'W' : s.kind === 'village' ? 'f' : 'T';
  for (let x = 0; x < w; x++) { g[0][x] = wall; g[h - 1][x] = wall; }
  for (let y = 0; y < h; y++) { g[y][0] = wall; g[y][w - 1] = wall; }
  g[h - 1][mid - 1] = 'e'; g[h - 1][mid] = 'e';
  if (s.kind === 'town') { g[h - 1][mid - 2] = 'Q'; g[h - 1][mid + 1] = 'Q'; }
  for (let y = h - 2; y >= Math.floor(h / 2); y--) { g[y][mid - 1] = ':'; g[y][mid] = ':'; }
  const sq = { x0: mid - 4, x1: mid + 3, y0: Math.floor(h / 2) - 3, y1: Math.floor(h / 2) + 1 };
  for (let y = sq.y0; y <= sq.y1; y++) for (let x = sq.x0; x <= sq.x1; x++) g[y][x] = '*';
  g[Math.floor((sq.y0 + sq.y1) / 2)][mid - 1] = s.kind === 'hamlet' ? '*' : 'U'; // the well
  const people = [];
  const add = (role, x, y, extra) => { if (world.tiles[g[y]?.[x]]?.walk && g[y][x] !== 'e' && g[y][x] !== 'G' && !people.some((p) => p.x === x && p.y === y)) { const p = person(rnd, role, x, y, extra); people.push(p); return p; } return null; };
  const kinds = { hamlet: ['h', 'h', 'h'], village: ['i', 's', 'h', 'h', 'h', 'h'], town: ['i', 's', 'm', 't', 'a', 'h', 'h', 'h', 'h', 'h', 'h'] }[s.kind];
  placeBuildings(g, rnd, { x0: 2, y0: 2, x1: w - 3, y1: h - 3 }, kinds, add, people);
  scatterTrees(g, rnd, w, h, people);
  const folk = { hamlet: 4, village: 6, town: 9 }[s.kind];
  addFolk(g, rnd, w, h, folk, add);
  if (s.kind === 'hamlet' && rnd() < 0.7) add('peddler', sq.x0 + 1, sq.y0, {});
  if (s.kind === 'village') add('guard', mid + 1, h - 3, { facing: 'down' });
  if (s.kind === 'town') { add('guard', mid - 2, h - 2, { facing: 'down' }); add('guard', mid + 1, h - 2, { facing: 'down' }); add('guard', sq.x0, sq.y1, {}); add('captain', sq.x1, sq.y0, {}); }
  return finishSettlement(world, s, g, w, h, people, { x: mid, y: h - 2 });
}
// The castle: a village outside the gate (fenced, the way out at the bottom), the curtain wall with its gatehouse and
// towers, the bailey inside with its own little village (the smith, the temple, the trainer, the barracks), and the
// keep at the top: a walled hall with the throne, the King and the Queen before it and knights down both sides.
function makeCastle(world, s, rnd) {
  const w = 48, h = 44, g = grid(w, h, 'g');
  const mid = Math.floor(w / 2);
  for (let x = 0; x < w; x++) { g[0][x] = 'T'; g[h - 1][x] = 'f'; }
  for (let y = 0; y < h; y++) { g[y][0] = 'T'; g[y][w - 1] = 'T'; }
  for (let y = 30; y < h; y++) { g[y][0] = 'f'; g[y][w - 1] = 'f'; }
  g[h - 1][mid - 1] = 'e'; g[h - 1][mid] = 'e';
  // The curtain wall: x 4..w-5, y 1..28, towers at the corners and beside the gate.
  const cw = { x0: 4, x1: w - 5, y0: 1, y1: 28 };
  for (let x = cw.x0; x <= cw.x1; x++) { g[cw.y0][x] = 'W'; g[cw.y1][x] = 'W'; }
  for (let y = cw.y0; y <= cw.y1; y++) { g[y][cw.x0] = 'W'; g[y][cw.x1] = 'W'; }
  for (let y = cw.y0 + 1; y < cw.y1; y++) for (let x = cw.x0 + 1; x < cw.x1; x++) g[y][x] = 'g';
  for (const [x, y] of [[cw.x0, cw.y0], [cw.x1, cw.y0], [cw.x0, cw.y1], [cw.x1, cw.y1], [mid - 2, cw.y1], [mid + 1, cw.y1]]) g[y][x] = 'Q';
  g[cw.y1][mid - 1] = 'G'; g[cw.y1][mid] = 'G';
  // The road from the way out, through the gate, across the bailey to the keep door.
  for (let y = h - 2; y > 12; y--) { if (g[y][mid - 1] === 'g') g[y][mid - 1] = ':'; if (g[y][mid] === 'g') g[y][mid] = ':'; }
  // The keep.
  const k = { x0: mid - 9, x1: mid + 8, y0: 2, y1: 12 };
  for (let y = k.y0; y <= k.y1; y++) for (let x = k.x0; x <= k.x1; x++) g[y][x] = y === k.y0 || y === k.y1 || x === k.x0 || x === k.x1 ? 'W' : 'x';
  for (const [x, y] of [[k.x0, k.y0], [k.x1, k.y0], [k.x0, k.y1], [k.x1, k.y1]]) g[y][x] = 'Q';
  g[k.y1][mid - 1] = 'x'; g[k.y1][mid] = 'x';
  for (let y = k.y0 + 2; y < k.y1; y++) { g[y][mid - 1] = 'u'; g[y][mid] = 'u'; }
  g[k.y0 + 1][mid - 1] = 'Y'; g[k.y0 + 1][mid] = 'Y';
  for (const x of [k.x0 + 2, k.x1 - 2]) for (const y of [k.y0 + 3, k.y0 + 6]) g[y][x] = 'P';
  const people = [];
  const add = (role, x, y, extra) => { if (world.tiles[g[y]?.[x]]?.walk && g[y][x] !== 'e' && g[y][x] !== 'G' && !people.some((p) => p.x === x && p.y === y)) { const p = person(rnd, role, x, y, extra); people.push(p); return p; } return null; };
  add('ruler', mid - 1, k.y0 + 2, { facing: 'down', title: 'King', crown: true, parts: { ...personParts(rnd, 'ruler'), body: 'm', hair: 'short', beard: 'full' } });
  add('ruler', mid, k.y0 + 2, { facing: 'down', title: 'Queen', crown: true, parts: { ...personParts(rnd, 'ruler'), body: 'f', hair: 'long', beard: 'none', outfit: 'dress' } });
  for (let y = k.y0 + 4; y < k.y1; y += 2) { add('knight', mid - 3, y, { facing: 'right' }); add('knight', mid + 2, y, { facing: 'left' }); }
  add('captain', mid + 1, k.y0 + 3, { facing: 'down' });
  // The bailey village: the smith, the temple, the trainer, the barracks and a few houses, round a well.
  const bailey = { x0: cw.x0 + 2, y0: k.y1 + 2, x1: cw.x1 - 2, y1: cw.y1 - 2 };
  g[bailey.y0 + 5][mid + 3] = 'U';
  placeBuildings(g, rnd, bailey, ['m', 't', 'a', 'R', 'R', 'h', 'h', 'h', 'h'], add, people);
  // The village outside the gate: the inn, the shop and cottages, with a fence round it.
  const outside = { x0: 2, y0: cw.y1 + 2, x1: w - 3, y1: h - 3 };
  placeBuildings(g, rnd, outside, ['i', 's', 'h', 'h', 'h', 'h'], add, people);
  scatterTrees(g, rnd, w, h, people);
  addFolk(g, rnd, w, h, 10, add);
  // Guards: two knights on the gate, guards on the outer road, on the walls' inner side and round the bailey.
  add('knight', mid - 2, cw.y1 + 1, { facing: 'down' }); add('knight', mid + 1, cw.y1 + 1, { facing: 'down' });
  add('guard', mid - 2, cw.y1 - 1, { facing: 'down' }); add('guard', mid + 1, cw.y1 - 1, { facing: 'down' });
  add('guard', mid - 2, h - 3, { facing: 'down' }); add('guard', bailey.x0, bailey.y0 + 3, {}); add('guard', bailey.x1, bailey.y0 + 3, {}); add('guard', mid + 3, k.y1 + 1, {});
  return finishSettlement(world, s, g, w, h, people, { x: mid, y: h - 2 });
}
function scatterTrees(g, rnd, w, h, people) {
  for (let i = 0; i < w; i++) {
    const x = 1 + Math.floor(rnd() * (w - 2)), y = 1 + Math.floor(rnd() * (h - 2));
    if (g[y][x] !== 'g' || 'hismtaRG'.includes(g[y - 1]?.[x]) || people.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 2)) continue;
    // never shut a gap: only where all four neighbours are open grass or path
    if (N4.every(([dx, dy]) => 'g:*'.includes(g[y + dy]?.[x + dx]))) g[y][x] = rnd() < 0.3 ? 'y' : 'T';
  }
}
function addFolk(g, rnd, w, h, n, add) {
  const open = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if ('g*:'.includes(g[y][x])) open.push([x, y]);
  for (let i = 0; i < n && open.length; i++) { const [x, y] = open.splice(Math.floor(rnd() * open.length), 1)[0]; add('folk', x, y, { facing: pick(rnd, ['down', 'left', 'right', 'up']) }); }
}
function finishSettlement(world, s, g, w, h, people, start) {
  people.forEach((p, i) => { p.id = `${s.id}-${p.role}-${i}`; p.home = s.id; p.tier = s.kind; });
  return { id: s.id, kind: s.kind, name: s.name, w, h, rows: toRows(g), chests: [], people, doors: exitDoors(g, w, h, s), start, zone: s.zone, site: s.id };
}
// The hermit's hut: one room, a fire, a bed, and the hermit, who has a gift for the first visitor in years.
function makeHut(world, s, rnd) {
  const w = 14, h = 10, g = grid(w, h, 'o');
  for (let x = 0; x < w; x++) { g[0][x] = 'B'; g[h - 1][x] = 'B'; }
  for (let y = 0; y < h; y++) { g[y][0] = 'B'; g[y][w - 1] = 'B'; }
  g[1][2] = 'p'; g[1][3] = 'p'; g[2][11] = 'l'; g[3][11] = 'l'; g[5][6] = 'b'; g[5][7] = 'b'; g[4][6] = 'c'; g[6][7] = 'c'; g[1][8] = 'q';
  g[h - 1][6] = 'e'; g[h - 1][7] = 'e';
  const hermit = person(rnd, 'hermit', 4, 3, { id: `${s.id}-hermit`, home: s.id, tier: 'hermit', facing: 'down' });
  return { id: s.id, kind: 'hermit', name: s.name, w, h, rows: toRows(g), chests: [{ id: `${s.id}-chest`, x: 10, y: 6, loot: 'gift' }], people: [hermit], doors: exitDoors(g, w, h, s), start: { x: 6, y: h - 2 }, zone: s.zone, site: s.id };
}
// Caves and dungeons: rooms cut out of rock (a dungeon's are old stone) joined by tunnels, the way out in the first
// room. Caves have good chests and no keeper; a dungeon with a lantern stone has its keeper in the last room.
function makeDeep(world, s, rnd) {
  const dungeon = s.kind === 'dungeon', lair = s.kind === 'kobold';
  const w = dungeon ? 34 : 26, h = dungeon ? 24 : 18;
  const wallCh = dungeon ? 'Z' : '#', floor = dungeon ? 'z' : '_';
  const g = grid(w, h, wallCh);
  const rooms = [];
  const want = dungeon ? 7 : 5;
  for (let tries = 0; rooms.length < want && tries < 400; tries++) {
    const rw = 4 + Math.floor(rnd() * 5), rh = 3 + Math.floor(rnd() * 4);
    const x = 1 + Math.floor(rnd() * (w - rw - 2)), y = 1 + Math.floor(rnd() * (h - rh - 3));
    if (rooms.some((r) => x < r.x + r.w + 1 && x + rw + 1 > r.x && y < r.y + r.h + 1 && y + rh + 1 > r.y)) continue;
    rooms.push({ x, y, w: rw, h: rh });
  }
  rooms.sort((a, b) => (b.y + b.h) - (a.y + a.h)); // the first room is the lowest, by the way in
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g[y][x] = floor;
  const mid = (r) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });
  for (let i = 1; i < rooms.length; i++) {
    let { x, y } = mid(rooms[i - 1]); const b = mid(rooms[i]);
    while (x !== b.x) { x += Math.sign(b.x - x); g[y][x] = floor; }
    while (y !== b.y) { y += Math.sign(b.y - y); g[y][x] = floor; }
  }
  // The way out: a tunnel from the first room down to the bottom edge.
  const first = mid(rooms[0]);
  for (let y = first.y; y < h - 1; y++) g[y][first.x] = floor;
  g[h - 1][first.x] = 'e';
  const last = mid(rooms[rooms.length - 1]);
  const chests = [];
  const zone = clamp(s.zone + 1, 1, 5);
  rooms.slice(1).forEach((r, i) => {
    if (chests.length >= (dungeon ? 4 : 3)) return;
    const x = r.x + (i % 2 ? r.w - 1 : 0), y = r.y;
    if (x === last.x && y === last.y) return;
    chests.push({ id: `${s.id}-c${i}`, x, y, loot: `deep:${zone}` });
  });
  const map = { id: s.id, kind: s.kind, name: s.name, w, h, rows: toRows(g), chests, people: [], doors: exitDoors(g, w, h, s), start: { x: first.x, y: h - 2 }, zone, site: s.id };
  if (s.keeper) {
    map.boss = { id: s.keeper, x: last.x, y: last.y };
    if (s.missing) { const r = rooms[Math.max(1, Math.floor(rooms.length / 2))] || rooms[0]; const lostOne = person(seeded(`${world.seed}:${s.id}:v12`), 'lost', r.x, r.y + r.h - 1, { id: s.missing.id, name: s.missing.name, home: s.missing.from, tier: 'lost', facing: 'down', wander: false }); if (!(lostOne.x === last.x && lostOne.y === last.y)) map.people.push(lostOne); }
    if (s.keeper === 'boss3') chests.push({ id: `${s.id}-hoard`, x: last.x + 1 < w - 1 && g[last.y][last.x + 1] === floor ? last.x + 1 : last.x, y: last.y - 1 >= 1 && g[last.y - 1][last.x] === floor ? last.y - 1 : last.y + 1, loot: 'hoard' });
  }
  return map;
}

// Tiles you can reach from a spot (for tests and for placing things fairly).
export function reachable(map, from) {
  const seen = new Set([`${from.x},${from.y}`]), q = [from];
  while (q.length) {
    const { x, y } = q.shift();
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || seen.has(k) || !TILES[map.rows[ny][nx]]?.walk) continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  return seen;
}

// ---------- A land in pieces (Journey v1.2, for the phone) ----------
// The computer makes the land; the phone asks only for the 32×32 pieces near the party (about two screens each
// way) and lets go of the ones it has walked away from. Places (towns, caves, cities) are still built on the phone
// when you walk in, from the list of places. landSkeleton and landPiece run on the computer; pieceWorld on the phone.
export const PIECE = 32;
const PICTURE = 240; // the land view's picture: at most this many dots across
export function landSkeleton(world) {
  const home = world.sites.find((s) => s.id === world.home) || { id: world.home, x: world.start.x, y: world.start.y, exit: world.start };
  const m = world.map('world');
  const k = Math.max(1, Math.ceil(Math.max(world.w, world.h) / PICTURE));
  const picture = { k, rows: [] };
  for (let y = 0; y < world.h; y += k) { let r = ''; for (let x = 0; x < world.w; x += k) r += m.rows[y][x]; picture.rows.push(r); }
  return { seed: world.seed, size: world.size, w: world.w, h: world.h, sites: world.sites, roads: world.roads, home: { id: home.id, x: home.x, y: home.y, exit: { ...home.exit } }, piece: PIECE, picture };
}
export function landPiece(world, cx, cy) {
  const m = world.map('world');
  const x0 = cx * PIECE, y0 = cy * PIECE;
  if (!(cx >= 0 && cy >= 0 && x0 < world.w && y0 < world.h)) return null;
  const rows = [];
  for (let y = y0; y < Math.min(world.h, y0 + PIECE); y++) rows.push(m.rows[y].slice(x0, x0 + PIECE));
  const people = m.people.filter((p) => Math.floor((p.homeX ?? p.x) / PIECE) === cx && Math.floor((p.homeY ?? p.y) / PIECE) === cy);
  return { cx, cy, rows, people };
}
// The phone's land: the same land, but its rows only answer for the pieces it holds (anywhere else is "not here
// yet", which nobody can walk onto). need(x, y, zoomedOut) says which pieces to ask for; drop(x, y) lets go of the far ones.
export function pieceWorld(skel) {
  const { w, h, piece = PIECE } = skel;
  const pieces = new Map(); // "cx,cy" -> { rows, people }
  const people = [];
  const rowViews = new Map();
  const tileAt = (x, y) => { const pc = pieces.get(`${Math.floor(x / piece)},${Math.floor(y / piece)}`); return pc ? pc.rows[y % piece]?.[x % piece] : undefined; };
  const rowView = (y) => {
    let v = rowViews.get(y);
    if (!v) { v = new Proxy({}, { get: (_, k) => (k === 'length' ? w : typeof k === 'string' && /^\d+$/.test(k) ? tileAt(Number(k), y) : undefined) }); rowViews.set(y, v); }
    return v;
  };
  const rows = new Proxy([], { get: (t, k) => (k === 'length' ? h : typeof k === 'string' && /^\d+$/.test(k) ? (Number(k) < h ? rowView(Number(k)) : undefined) : t[k]) });
  const world = worldOf({ seed: skel.seed, size: skel.size, w, h, rows, sites: skel.sites, people, roads: skel.roads || [], home: skel.home });
  const restock = () => { people.length = 0; for (const pc of pieces.values()) people.push(...pc.people); };
  // The pieces that cover two screens each way round (x, y): 15×11 tiles on screen, more when zoomed out in the sky.
  const around = (x, y, wide) => {
    const rx = wide ? 22 : 15, ry = wide ? 16 : 11, out = [];
    for (let cy = Math.max(0, Math.floor((y - ry) / piece)); cy <= Math.min(Math.ceil(h / piece) - 1, Math.floor((y + ry) / piece)); cy++)
      for (let cx = Math.max(0, Math.floor((x - rx) / piece)); cx <= Math.min(Math.ceil(w / piece) - 1, Math.floor((x + rx) / piece)); cx++) out.push(`${cx},${cy}`);
    return out;
  };
  Object.assign(world, {
    pieced: true, picture: skel.picture,
    need(x, y, wide) { return around(x, y, wide).filter((key) => !pieces.has(key)).map((key) => key.split(',').map(Number)); },
    has(x, y) { return pieces.has(`${Math.floor(x / piece)},${Math.floor(y / piece)}`); },
    addPiece(pc) { if (!pc || !Array.isArray(pc.rows)) return; pieces.set(`${pc.cx},${pc.cy}`, { rows: pc.rows.map(String), people: Array.isArray(pc.people) ? pc.people : [] }); restock(); },
    // Let go of every piece more than a piece beyond the two screens (so a step back and forth doesn't fetch again).
    held() { return pieces.size; },
    drop(x, y, wide) { const keep = new Set(around(x, y, wide)); let gone = 0; for (const key of [...pieces.keys()]) { const [cx, cy] = key.split(',').map(Number); const near = [...keep].some((k2) => { const [a, b] = k2.split(',').map(Number); return Math.abs(a - cx) <= 1 && Math.abs(b - cy) <= 1; }); if (!near) { pieces.delete(key); gone++; } } if (gone) { restock(); rowViews.clear(); } return gone; }
  });
  return world;
}
