// 1.5.124 The bestiary behind 🎲 Adventure's Characters page: a dozen common enemy types with a ready sheet and a
// look, and "Met": every person and creature the game master brings on, drawn the moment they're named. Pure
// functions over the look composer in public/avatars.js; the game (src/adventure.js) calls met() after each turn.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { encodeParts, DEFAULT_PARTS } from '../public/avatars.js';

const look = (p) => encodeParts({ ...DEFAULT_PARTS, ...p });
// hearts: how many hits it takes; attack: what it does; trick: the thing to know; flavour: one line in Bob's voice.
export const ENEMIES = [
  { id: 'goblin', name: 'Goblin', hearts: 2, attack: 'a rusty dagger, from behind if it can', trick: 'runs when the fight turns', flavour: 'Small, loud, and always in a group. Never the real problem; always the first one.', look: look({ body: 'alien', skin: '0', face: '6', outfit: 'tee', cloth: '5', weapon: 'dagger' }) },
  { id: 'skeleton', name: 'Skeleton', hearts: 2, attack: 'a notched sword, tirelessly', trick: 'gets up again unless the bones are scattered', flavour: 'All the bad posture of a person, none of the conversation.', look: 'odd-1' },
  { id: 'wolf', name: 'Wolf', hearts: 2, attack: 'teeth, and then more teeth', trick: 'hunts in a pack and circles the weakest', flavour: 'The woods are fine. The woods are fine. The woods have eyes.', look: look({ body: 'beast', skin: '1', face: '3' }) },
  { id: 'bandit', name: 'Bandit', hearts: 3, attack: 'a short sword and a lot of threats', trick: 'can be talked to, or bought', flavour: 'Not evil, just badly managed. Will share a fire if you share the bread.', look: look({ body: 'm', hair: 'tied', hc: '2', skin: '3', beard: 'stubble', outfit: 'jacket', cloth: '1', armour: 'leather', weapon: 'sword' }) },
  { id: 'rat', name: 'Giant rat', hearts: 1, attack: 'a bite that gets infected', trick: 'there is never just one', flavour: 'A rat the size of a dog. It has opinions about your rations.', look: look({ body: 'beast', skin: '2', face: '1' }) },
  { id: 'spider', name: 'Giant spider', hearts: 3, attack: 'a venomous bite and sticky webs', trick: 'drops from above; fire frightens it', flavour: 'Eight legs, eight eyes, and a web in the one corridor you need.', look: look({ body: 'crawler', skin: '4', face: '2' }) },
  { id: 'orc', name: 'Orc', hearts: 4, attack: 'a two-handed axe, with enthusiasm', trick: 'respects a good hit and a better insult', flavour: 'Big, green and honest about wanting to fight you. Refreshing, in a way.', look: look({ body: 'giant', skin: '0', face: '6', armour: 'leather', weapon: 'axe' }) },
  { id: 'cultist', name: 'Cultist', hearts: 2, attack: 'a curved knife and a chant', trick: 'the chant is the dangerous part; stop it', flavour: 'Robes, candles, a plan that ends badly for everyone including them.', look: look({ body: 'm', hair: 'bald', hc: '0', skin: '2', armour: 'robe', weapon: 'dagger' }) },
  { id: 'slime', name: 'Slime', hearts: 3, attack: 'engulfs and dissolves', trick: 'cutting it makes two; burn it or freeze it', flavour: 'Friendly-looking right up until your boots start to fizz.', look: look({ body: 'blob', skin: '0', face: '4' }) },
  { id: 'ghost', name: 'Ghost', hearts: 2, attack: 'a touch that chills to the bone', trick: 'wants something finished; magic and words work, steel does not', flavour: 'Unfinished business with a dress code.', look: 'odd-0' },
  { id: 'troll', name: 'Troll', hearts: 5, attack: 'a club, and a reach longer than yours', trick: 'heals unless burned', flavour: 'Under the bridge, as advertised. Charges a toll in teeth.', look: look({ body: 'giant', skin: '1', face: '7', weapon: 'hammer' }) },
  { id: 'dragon', name: 'Dragon', hearts: 6, attack: 'fire, then claws, then fire again', trick: 'vain; flattery buys a turn, greed buys two', flavour: 'There is always a dragon somewhere. Today it is here.', look: look({ body: 'beast', skin: '3', face: '2' }) }
];
export const enemyById = (id) => ENEMIES.find((e) => e.id === id) || null;

// What a thing the game master names probably is, from the words: an enemy type above, a creature shape, or a person.
const WORDS = [
  ['goblin', /\bgoblins?\b/], ['skeleton', /\bskeletons?\b|\bbones\b/], ['wolf', /\bwol(f|ves)\b|\bhounds?\b|\bdogs?\b/], ['bandit', /\bbandits?\b|\bbrigands?\b|\bthugs?\b|\brobbers?\b|\bhighwaym[ae]n\b/],
  ['rat', /\brats?\b/], ['spider', /\bspiders?\b/], ['orc', /\borcs?\b/], ['cultist', /\bcultists?\b|\bacolytes?\b/], ['slime', /\bslimes?\b|\booze\b|\bjelly\b/], ['ghost', /\bghosts?\b|\bspectres?\b|\bspirits?\b|\bwraiths?\b/],
  ['troll', /\btrolls?\b|\bogres?\b/], ['dragon', /\bdragons?\b|\bwyrms?\b|\bdrakes?\b/]
];
const SHAPES = [
  ['beast', /\bbears?\b|\bboars?\b|\bcats?\b|\blions?\b|\btigers?\b|\bhorses?\b|\bdeer\b|\bfox(es)?\b|\bbeasts?\b|\bwyverns?\b|\bgriffins?\b/],
  ['crawler', /\bscorpions?\b|\bbeetles?\b|\bcrabs?\b|\binsects?\b|\bcentipedes?\b|\bcrawlers?\b/],
  ['blob', /\bblobs?\b|\bpuddles?\b|\bmould\b|\bfungus\b|\bmimics?\b/],
  ['giant', /\bgiants?\b|\bgolems?\b|\bminotaurs?\b|\bcyclops\b|\bbrutes?\b|\bhulks?\b/],
  ['robot', /\brobots?\b|\bdroids?\b|\bautomatons?\b|\bconstructs?\b|\bmachines?\b|\bturrets?\b/],
  ['alien', /\baliens?\b|\bxenos?\b|\bgreys?\b|\bcreatures?\b|\bthings?\b/]
];
export function kindOf(name) {
  const t = String(name || '').toLowerCase();
  for (const [id, re] of WORDS) if (re.test(t)) return { enemy: id };
  for (const [shape, re] of SHAPES) if (re.test(t)) return { shape };
  return { shape: 'person' };
}

// A look for a thing by its name: the enemy type's look, or a shape coloured by a hash of the name, so the same name
// draws the same picture every time, in every game.
export function lookFor(name, kind = kindOf(name)) {
  if (kind.enemy) return enemyById(kind.enemy).look;
  const h = [...crypto.createHash('sha1').update(String(name).toLowerCase()).digest()];
  const pick = (list, i) => list[h[i] % list.length];
  if (kind.shape === 'person') {
    const woman = /\b(she|her|woman|girl|lady|queen|priestess|witch|mother|sister|daughter|dame|maid|wife|widow)\b/i.test(name) || h[0] % 2 === 1;
    return look({ body: woman ? 'f' : 'm', build: pick(['slim', 'regular', 'broad'], 1), hair: pick(['short', 'buzz', 'sidepart', 'curly', 'tied', 'long', 'bob', 'ponytail', 'bun', 'braids', 'bald', 'swept'], 2), hc: String(h[3] % 12), skin: String(h[4] % 8), beard: woman ? 'none' : pick(['none', 'none', 'stubble', 'full', 'goatee', 'mustache'], 5), glasses: h[6] % 5 === 0 ? '1' : '0', outfit: pick(['hoodie', 'tee', 'jacket', 'suit', 'apron', 'labcoat', 'armor'], 7), cloth: String(h[8] % 10), armour: pick(['none', 'none', 'none', 'leather', 'chain', 'robe'], 9), weapon: pick(['none', 'none', 'sword', 'staff', 'dagger', 'bow'], 10), shield: 'none' });
  }
  return look({ body: kind.shape, skin: String(h[1] % 8), face: String(h[2] % 8), armour: kind.shape === 'giant' ? pick(['none', 'leather', 'chain'], 3) : 'none', weapon: kind.shape === 'giant' ? pick(['none', 'axe', 'hammer', 'spear'], 4) : 'none', cloth: String(h[5] % 10) });
}

// One Met entry from a name the game master used. kind: 'enemy' (one of the dozen), 'creature' or 'person'.
export function metEntry(name, { scene = '', game = '' } = {}) {
  const k = kindOf(name);
  const e = k.enemy ? enemyById(k.enemy) : null;
  return { id: crypto.createHash('sha1').update(String(name).toLowerCase()).digest('hex').slice(0, 10), name: String(name).trim().slice(0, 60), kind: e ? 'enemy' : k.shape === 'person' ? 'person' : 'creature', type: e?.id || '', look: lookFor(name, k), scene: String(scene || '').slice(0, 60), game: String(game || '').slice(0, 60), at: Date.now() };
}

// Adds whoever is "here" to the game's Met list and the bestiary file (all games), once per name. Returns the new ones.
export function meet(game, names, cfg) {
  if (!game || !Array.isArray(names)) return [];
  game.met = Array.isArray(game.met) ? game.met : [];
  const fresh = [];
  for (const n of names) {
    const name = String(n || '').trim(); if (!name) continue;
    const key = name.toLowerCase();
    if (game.met.some((m) => m.name.toLowerCase() === key) || game.party.some((c) => c.name.toLowerCase() === key)) continue;
    const m = metEntry(name, { scene: game.scenes?.[game.scenes.length - 1]?.title || '', game: game.title });
    game.met.push(m); fresh.push(m);
  }
  if (fresh.length && cfg) try { rememberMet(cfg, fresh); } catch {}
  return fresh;
}

// The bestiary across games: <dataDir>/adventures/met.json, newest first, up to 80 entries, one per name.
const metFile = (cfg) => path.join(cfg.dataDir || '.', 'adventures', 'met.json');
export function listMet(cfg) { try { const l = JSON.parse(fs.readFileSync(metFile(cfg), 'utf8')); return Array.isArray(l) ? l.filter((m) => m && m.name) : []; } catch { return []; } }
export function rememberMet(cfg, entries) {
  const have = listMet(cfg);
  const names = new Set(entries.map((m) => m.name.toLowerCase()));
  const list = [...entries, ...have.filter((m) => !names.has(m.name.toLowerCase()))].slice(0, 80);
  fs.mkdirSync(path.dirname(metFile(cfg)), { recursive: true });
  fs.writeFileSync(metFile(cfg), JSON.stringify(list));
  return list;
}
export function forgetMet(cfg, id) { const list = listMet(cfg).filter((m) => m.id !== id); try { fs.writeFileSync(metFile(cfg), JSON.stringify(list)); } catch {} return list; }

// What the game master is told about a built-in enemy when he brings one on (the sheet, in a line).
export const enemyLine = (e) => `${e.name}: ${e.hearts} heart${e.hearts === 1 ? '' : 's'}; attacks with ${e.attack}; ${e.trick}.`;
