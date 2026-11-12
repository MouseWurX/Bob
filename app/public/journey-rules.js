// 🧭 Journey v1.1: Adventure played like an old console role-playing game. Bob's Inn is home; roll a new land (or
// carry on with the one you have), walk it with the arrow keys, open chests, talk to anyone (or pick a fight with
// anyone), and fight what jumps out of the long grass in turn-based battles.
// This file is the rules and nothing else: the people, the creatures, the classes and their skill trees, the coin,
// the kit, the dice, the fights, levels, training and the save. It never draws and never touches the page;
// public/journey-play.js does that. The places come from public/journey-world.js and are passed in as `world`.
// Everything is worked out from the seed and the dice function passed in, so tests can load the dice.
// No imports: the phone uses this same file, made into a plain script (globalThis.BobJourneyRules) by
// android/tools/make-shared.mjs. No brain is needed to play; nothing loads.

export const SAVE_VERSION = 2;
export const STATS = ['might', 'wits', 'charm', 'luck'];
export const STAT_NAMES = { might: 'Might', wits: 'Wits', charm: 'Charm', luck: 'Luck', acc: 'Accuracy', eva: 'Evasion' };
export const STAT_CAP = 12;

// ---------- Coin ----------
// Everything is counted in copper. 100 copper is a silver, 1,000 silver is a gold, 100 gold is a platinum,
// so 1.11 is 1 silver and 11 copper.
export const COIN = { copper: 1, silver: 100, gold: 100000, platinum: 10000000 };
export const COIN_ORDER = ['platinum', 'gold', 'silver', 'copper'];
export function coinParts(c) {
  let left = Math.max(0, Math.floor(Number(c) || 0));
  const out = {};
  for (const k of COIN_ORDER) { out[k] = Math.floor(left / COIN[k]); left -= out[k] * COIN[k]; }
  return out;
}
// "2 gold, 1 silver, 11 copper" (or "2g 1s 11c" short). Nothing at all is "no coin".
export function fmtCoin(c, short = false) {
  const p = coinParts(c);
  const bits = COIN_ORDER.filter((k) => p[k]).map((k) => (short ? `${p[k]}${k[0]}` : `${p[k].toLocaleString('en')} ${k}`));
  return bits.length ? bits.join(short ? ' ' : ', ') : short ? '0c' : 'no coin';
}

// ---------- Races ----------
// Changes to the four stats, health and spirit (as a share), accuracy and evasion. The Pixie is small, quick and
// hard to hit, all mind and no muscle: the spellcaster's race.
export const RACES = {
  human: { name: 'Human', stats: { charm: 1 }, hp: 1, sp: 1, acc: 3, eva: 0, what: 'Good at a bit of everything. A little more charm.' },
  elf: { name: 'Elf', stats: { wits: 1, luck: 1, might: -1 }, hp: 0.95, sp: 1.1, acc: 6, eva: 5, what: 'Sharp eyes and light feet.' },
  dwarf: { name: 'Dwarf', stats: { might: 1 }, hp: 1.15, sp: 0.95, acc: 2, eva: -3, guard: 1, what: 'Tough as an old door. Hard to knock over, slow to dodge.' },
  halfling: { name: 'Halfling', stats: { luck: 2, might: -1 }, hp: 0.9, sp: 1, acc: 4, eva: 8, what: 'Small, lucky, and gone when the swing lands.' },
  orc: { name: 'Orc', stats: { might: 2, wits: -1, charm: -1 }, hp: 1.1, sp: 0.9, acc: 0, eva: 0, what: 'Hits hard. Talks less.' },
  pixie: { name: 'Pixie', stats: { wits: 2, luck: 1, might: -2 }, hp: 0.75, sp: 1.4, acc: 2, eva: 12, what: 'Tiny and quick with a deep well of spirit. Fragile.' }
};
export const RACE_IDS = Object.keys(RACES);

// ---------- Classes ----------
// The first six match the Adventure table (src/adventure.js), so a saved character plays the same. The Psionist is
// Journey's own: powers of the mind that stun, shield and move spirit around.
export const CLASSES = {
  fighter: { name: 'Fighter', stats: { might: 5, wits: 2, charm: 2, luck: 3 }, weapon: 'sword', armour: 'leather', shield: 'round', branches: ['Blade', 'Shield', 'Warlord'] },
  rogue: { name: 'Rogue', stats: { might: 2, wits: 4, charm: 3, luck: 3 }, weapon: 'dagger', armour: 'leather', shield: 'none', branches: ['Shadow', 'Trickery', 'Poison'] },
  wizard: { name: 'Wizard', stats: { might: 1, wits: 5, charm: 2, luck: 4 }, weapon: 'staff', armour: 'robe', shield: 'none', caster: true, branches: ['Fire', 'Storm', 'Arcane'] },
  cleric: { name: 'Cleric', stats: { might: 3, wits: 3, charm: 4, luck: 2 }, weapon: 'hammer', armour: 'chain', shield: 'round', caster: true, branches: ['Healing', 'Light', 'Protection'] },
  ranger: { name: 'Ranger', stats: { might: 3, wits: 4, charm: 1, luck: 4 }, weapon: 'bow', armour: 'leather', shield: 'none', branches: ['Archery', 'Wild', 'Survival'] },
  bard: { name: 'Bard', stats: { might: 1, wits: 3, charm: 5, luck: 3 }, weapon: 'dagger', armour: 'none', shield: 'none', caster: true, branches: ['Song', 'Wit', 'Fortune'] },
  psionist: { name: 'Psionist', stats: { might: 1, wits: 5, charm: 3, luck: 3 }, weapon: 'staff', armour: 'robe', shield: 'none', caster: true, branches: ['Mind', 'Will', 'Echo'] }
};
export const CLASS_IDS = Object.keys(CLASSES);
export const SECOND_CLASS_LEVEL = 5, THIRD_CLASS_LEVEL = 10;

// ---------- Kit: what the paper doll wears changes the numbers ----------
// The ids are the character screen's parts (public/avatars.js), so equipping one changes the look as well.
// power (hits), guard (soaks), magic (spells), acc and eva (to hit, to dodge), crit, slow, and stat bonuses or
// drawbacks in mods. Heavier armour soaks more and dodges less.
export const WEAPONS = {
  none: { name: 'Bare hands', power: 0, acc: 5 },
  dagger: { name: 'Dagger', power: 2, crit: 0.12, acc: 8, mods: { luck: 1 } },
  sword: { name: 'Sword', power: 4, acc: 4 },
  axe: { name: 'Axe', power: 5, crit: -0.02, acc: -2, mods: { might: 1, luck: -1 } },
  hammer: { name: 'Hammer', power: 5, smash: true, acc: -4, mods: { might: 1, wits: -1 } },
  spear: { name: 'Spear', power: 4, first: true, acc: 2 },
  staff: { name: 'Staff', power: 1, magic: 3, acc: 0, mods: { wits: 1, might: -1 } },
  bow: { name: 'Bow', power: 3, crit: 0.06, acc: 10 }
};
export const ARMOURS = {
  none: { name: 'No armour', guard: 0, eva: 4 },
  robe: { name: 'Robe', guard: 1, magic: 2, eva: 2, mods: { wits: 1 } },
  leather: { name: 'Leather', guard: 2, eva: 0 },
  chain: { name: 'Chain mail', guard: 4, eva: -4 },
  plate: { name: 'Plate', guard: 6, slow: 1, eva: -9, mods: { luck: -1 } }
};
export const SHIELDS = { none: { name: 'No shield', guard: 0, eva: 0 }, round: { name: 'Round shield', guard: 1, eva: -1 }, tall: { name: 'Tall shield', guard: 2, slow: 1, eva: -4 } };
const KIT_TABLE = { weapon: WEAPONS, armour: ARMOURS, shield: SHIELDS };
// Found kit can come with something extra: a key like "sword~fine". The look is always the base.
export const AFFIXES = {
  fine: { name: 'Fine', power: 1, acc: 4, price: 1.6 },
  keen: { name: 'Keen', crit: 0.08, price: 1.7, only: 'weapon' },
  heavy: { name: 'Heavy', power: 2, acc: -6, guard: 1, eva: -3, price: 1.3 },
  light: { name: 'Light', eva: 5, acc: 3, slow: -1, price: 1.6 },
  sturdy: { name: 'Sturdy', guard: 1, price: 1.5, only: 'armour,shield' },
  blessed: { name: 'Blessed', magic: 2, mods: { charm: 2 }, price: 2.2 },
  arcane: { name: 'Arcane', magic: 3, mods: { wits: 1 }, price: 2.4 },
  swift: { name: 'Swift', eva: 4, mods: { luck: 1 }, price: 2 },
  mighty: { name: 'Mighty', power: 1, mods: { might: 2 }, price: 2.4 },
  rusty: { name: 'Rusty', power: -1, guard: -1, acc: -3, price: 0.5 },
  cursed: { name: 'Cursed', power: 3, magic: 2, mods: { luck: -3, charm: -1 }, price: 1.2 }
};
export const splitKit = (key) => { const [base, affix] = String(key || 'none').split('~'); return { base, affix: AFFIXES[affix] ? affix : '' }; };
export const kitKind = (key) => { const { base } = splitKit(key); return WEAPONS[base] && base !== 'none' ? 'weapon' : ARMOURS[base] && base !== 'none' ? 'armour' : SHIELDS[base] && base !== 'none' ? 'shield' : ''; };
export const kitBase = (key) => splitKit(key).base;
export function kitStats(kind, key) {
  const { base, affix } = splitKit(key);
  const b = KIT_TABLE[kind]?.[base] || KIT_TABLE[kind]?.none || {};
  const a = affix ? AFFIXES[affix] : null;
  const out = { name: a ? `${a.name} ${b.name.toLowerCase()}` : b.name };
  for (const k of ['power', 'guard', 'magic', 'acc', 'eva', 'crit', 'slow']) out[k] = (b[k] || 0) + (a?.[k] || 0);
  out.mods = { ...(b.mods || {}) };
  for (const [s, v] of Object.entries(a?.mods || {})) out.mods[s] = (out.mods[s] || 0) + v;
  out.first = Boolean(b.first); out.smash = Boolean(b.smash);
  return out;
}
export const kitName = (key) => { const k = kitKind(key); return k ? kitStats(k, key).name : (WEAPONS[key] || ARMOURS[key] || SHIELDS[key])?.name || key; };
// What it does, in words: "+4 power, +4 accuracy, +1 might, −1 luck".
export function kitWords(key) {
  const k = kitKind(key); if (!k) return '';
  const s = kitStats(k, key), out = [];
  const sign = (v) => (v > 0 ? `+${v}` : `−${Math.abs(v)}`);
  for (const [f, word] of [['power', 'power'], ['guard', 'guard'], ['magic', 'magic'], ['acc', 'accuracy'], ['eva', 'evasion']]) if (s[f]) out.push(`${sign(s[f])} ${word}`);
  if (s.crit) out.push(`${sign(Math.round(s.crit * 100))}% great hits`);
  if (s.slow > 0) out.push('slower');
  for (const [st, v] of Object.entries(s.mods)) if (v) out.push(`${sign(v)} ${STAT_NAMES[st].toLowerCase()}`);
  return out.join(', ');
}

// Things in the bag. Names are our own. Prices in copper. Scrolls hold one spell that anyone can read once.
export const ITEMS = {
  tonic: { name: 'Mint tonic', what: 'Heals 30 health.', price: 50, heal: 30, field: true },
  bigtonic: { name: 'Thick mint tonic', what: 'Heals 80 health.', price: 150, heal: 80, field: true },
  water: { name: 'Bright water', what: 'Gives back 15 spirit.', price: 100, spirit: 15, field: true },
  salts: { name: 'Waking salts', what: 'Brings someone who fell back up with half their health.', price: 300, revive: 0.5, field: true },
  ember: { name: 'Ember jar', what: 'Thrown: 25 fire damage to one foe.', price: 120, fire: 25 },
  antidote: { name: 'Clearroot', what: 'Clears poison, sleep and daze.', price: 80, cleanse: true, field: true },
  scroll_fire: { name: 'Scroll of fireball', what: 'Read once: fire over every foe.', price: 600, spell: 'fireball', scroll: true },
  scroll_storm: { name: 'Scroll of thunder', what: 'Read once: a great bolt at one foe.', price: 700, spell: 'thunder', scroll: true },
  scroll_heal: { name: 'Scroll of mending', what: 'Read once: heals the whole party. Works on the road too.', price: 500, spell: 'rally', scroll: true, field: true },
  scroll_raise: { name: 'Scroll of raising', what: 'Read once: brings a fallen friend back. Works on the road too.', price: 900, spell: 'raise', scroll: true, field: true },
  scroll_sleep: { name: 'Scroll of lullaby', what: 'Read once: every foe may fall asleep.', price: 450, spell: 'lullaby', scroll: true },
  scroll_ward: { name: 'Scroll of warding', what: 'Read once: the party takes less harm this fight.', price: 400, spell: 'shieldwall', scroll: true }
};
export const SCROLLS = Object.keys(ITEMS).filter((k) => ITEMS[k].scroll);
export const KIT_PRICES = { dagger: 200, sword: 500, spear: 550, axe: 800, hammer: 800, staff: 400, bow: 600, leather: 300, chain: 900, plate: 2500, robe: 450, round: 250, tall: 700 };
export const kitPrice = (key) => { const { base, affix } = splitKit(key); return Math.round((KIT_PRICES[base] || 100) * (affix ? AFFIXES[affix].price : 1)); };
// What each kind of seller has, by how big the place is.
export function wares(role, tier) {
  const big = tier === 'town' || tier === 'castle';
  if (role === 'peddler') return ['tonic', 'water', 'antidote', 'ember', 'scroll_sleep'];
  if (role === 'shop') return big ? ['tonic', 'bigtonic', 'water', 'salts', 'antidote', 'ember', 'scroll_heal', 'scroll_fire', 'scroll_ward'] : ['tonic', 'bigtonic', 'water', 'salts', 'antidote', 'ember'];
  if (role === 'smith') return big ? ['dagger', 'sword', 'spear', 'axe', 'hammer', 'bow', 'staff', 'leather', 'chain', 'plate', 'robe', 'round', 'tall', 'sword~fine', 'chain~sturdy', 'bow~fine'] : ['dagger', 'sword', 'spear', 'bow', 'staff', 'leather', 'chain', 'robe', 'round'];
  if (role === 'priest') return ['salts', 'antidote', 'scroll_raise', 'scroll_heal'];
  return [];
}

// ---------- Skill trees ----------
// Every class has three branches. A branch's skills come in order: learn the first before the second, and so on,
// with a level needed for each. Each level after the first gives one skill point. A Wizard, Cleric, Psionist or
// Bard knows their first spell in each branch from the start; everyone else their first two.
// kind: hit (one foe), all (every foe), heal, healAll, revive, reviveAll, cleanse, buff (party hits harder),
// ward (party takes less), haste (party dodges more), blind (foes hit less), sleep / stun (one foe, or every foe
// with all), steal, cover, spirit (spirit to a friend), drain (spirit from a foe), focus (spirit for yourself),
// passive (always on: see the numbers in it). field: usable while walking, out of a fight.
// mult: a weapon hit times this. base + stat: a spell. element: fire, storm, frost, holy, wild, mind, shadow, star.
const T = (cls, branch, step, level, cost, kind, name, what, extra = {}) => ({ cls, branch, step, level, cost, kind, name, what, ...extra });
export const SKILLS = {
  // Fighter
  power: T('fighter', 0, 1, 1, 3, 'hit', 'Power strike', 'A big swing: much more damage.', { mult: 1.6 }),
  cleave: T('fighter', 0, 2, 3, 5, 'all', 'Cleave', 'One sweep through every foe.', { mult: 0.8 }),
  sunder: T('fighter', 0, 3, 6, 6, 'hit', 'Sundering blow', 'Smashes through armour.', { mult: 2.1, pierce: true }),
  guard: T('fighter', 1, 1, 1, 2, 'cover', 'Stand guard', 'Takes the hits meant for the others this round.'),
  bulwark: T('fighter', 1, 2, 3, 0, 'passive', 'Bulwark', 'Always on: +2 guard and a tenth more health.', { passive: { guard: 2, hp: 0.1 } }),
  shieldwall: T('fighter', 1, 3, 6, 6, 'ward', 'Shield wall', 'The whole party takes less harm for the fight.', { amount: 4 }),
  warcry: T('fighter', 2, 1, 2, 3, 'buff', 'War cry', 'The party hits harder for the fight.', { amount: 3 }),
  secondwind: T('fighter', 2, 2, 4, 4, 'heal', 'Second wind', 'Gets your own breath back. Works on the road too.', { base: 18, stat: 'might', self: true, field: true }),
  ironhide: T('fighter', 2, 3, 7, 0, 'passive', 'Iron hide', 'Always on: a fifth more health.', { passive: { hp: 0.2 } }),
  flurry: T('fighter', 0, 4, 9, 10, 'hit', "Champion's flurry", 'Three heavy blows at one foe.', { mult: 1.2, times: 3 }),
  // Rogue
  twin: T('rogue', 0, 1, 1, 4, 'hit', 'Twin cuts', 'Two quick cuts.', { mult: 1.3, times: 2 }),
  backstab: T('rogue', 0, 2, 3, 5, 'hit', 'Backstab', 'A cut where it counts: far more likely to land a great hit.', { mult: 2, crit: 0.3 }),
  vanish: T('rogue', 0, 3, 6, 5, 'haste', 'Vanish', 'The party melts into the shadows: much harder to hit.', { amount: 12 }),
  steal: T('rogue', 1, 1, 1, 2, 'steal', 'Pinch', 'Lifts coins or an item from a foe.'),
  dirty: T('rogue', 1, 2, 3, 3, 'blind', 'Dirty trick', 'Sand in the eyes: one foe hits less often.', { amount: 20 }),
  lucky: T('rogue', 1, 3, 6, 0, 'passive', 'Born lucky', 'Always on: more great hits and +5 evasion.', { passive: { crit: 0.08, eva: 5 } }),
  envenom: T('rogue', 2, 1, 2, 3, 'hit', 'Envenom', 'A poisoned cut that keeps hurting.', { mult: 1, poison: 5 }),
  smoke: T('rogue', 2, 2, 4, 5, 'blind', 'Smoke bomb', 'Every foe hits less often.', { amount: 15, all: true }),
  venom: T('rogue', 2, 3, 7, 0, 'passive', 'Deadly venom', 'Always on: your poisons hurt twice as much.', { passive: { poison: 2 } }),
  thousand: T('rogue', 0, 4, 9, 10, 'hit', 'Thousand cuts', 'Four blurring cuts at one foe.', { mult: 0.8, times: 4, crit: 0.15 }),
  // Wizard
  firebolt: T('wizard', 0, 1, 1, 4, 'hit', 'Firebolt', 'Fire at one foe.', { stat: 'wits', base: 10, element: 'fire' }),
  fireball: T('wizard', 0, 2, 4, 9, 'all', 'Fireball', 'Fire over every foe.', { stat: 'wits', base: 9, element: 'fire' }),
  inferno: T('wizard', 0, 3, 7, 14, 'all', 'Inferno', 'A sea of fire over every foe.', { stat: 'wits', base: 18, element: 'fire' }),
  spark: T('wizard', 1, 1, 1, 3, 'hit', 'Spark', 'A snap of lightning. Quick and cheap.', { stat: 'wits', base: 7, element: 'storm', acc: 10 }),
  storm: T('wizard', 1, 2, 3, 9, 'all', 'Spark storm', 'Sparks across every foe.', { stat: 'wits', base: 6, element: 'storm' }),
  thunder: T('wizard', 1, 3, 6, 11, 'hit', 'Thunderbolt', 'A great bolt at one foe. It may be stunned.', { stat: 'wits', base: 26, element: 'storm', stun: 0.3 }),
  sleep: T('wizard', 2, 1, 1, 5, 'sleep', 'Sleep', 'Puts one foe to sleep for a turn or two.'),
  frost: T('wizard', 2, 2, 2, 5, 'hit', 'Frost lance', 'Ice at one foe. It slows down.', { stat: 'wits', base: 13, element: 'frost', slow: true }),
  focus: T('wizard', 2, 3, 5, 0, 'passive', 'Arcane focus', 'Always on: +3 magic and a sixth more spirit.', { passive: { magic: 3, sp: 0.16 } }),
  starfall: T('wizard', 0, 4, 9, 24, 'all', 'Starfall', 'The sky comes down on every foe.', { stat: 'wits', base: 32, element: 'star' }),
  // Cleric
  mend: T('cleric', 0, 1, 1, 3, 'heal', 'Mend wounds', 'Heals one friend. Works on the road too.', { stat: 'charm', base: 16, field: true }),
  raise: T('cleric', 0, 2, 3, 10, 'revive', 'Raise', 'Brings a fallen friend back with half their health. Works on the road too.', { amount: 0.5, field: true }),
  rally: T('cleric', 0, 3, 5, 8, 'healAll', 'Mend all', 'Heals the whole party. Works on the road too.', { stat: 'charm', base: 10, field: true }),
  light: T('cleric', 1, 1, 1, 4, 'hit', 'Guiding light', 'Holy light: double against the restless dead.', { stat: 'charm', base: 8, element: 'holy' }),
  smite: T('cleric', 1, 2, 3, 5, 'hit', 'Smite', 'A blessed blow with your weapon.', { mult: 1.4, element: 'holy' }),
  purge: T('cleric', 1, 3, 7, 12, 'all', 'Purge', 'Holy fire over every foe; the dead hate it.', { stat: 'charm', base: 14, element: 'holy' }),
  bless: T('cleric', 2, 1, 2, 3, 'ward', 'Bless', 'The party takes a little less harm for the fight.', { amount: 2 }),
  cleanse: T('cleric', 2, 2, 4, 4, 'cleanse', 'Cleanse', 'Clears poison, sleep and daze from the party. Works on the road too.', { field: true }),
  sanctuary: T('cleric', 2, 3, 6, 0, 'passive', 'Sanctuary', 'Always on: +2 guard and a tenth more health.', { passive: { guard: 2, hp: 0.1 } }),
  miracle: T('cleric', 0, 4, 9, 30, 'reviveAll', 'Miracle', 'Everyone back up and fully healed. Works on the road too.', { amount: 1, field: true }),
  // Ranger
  aimed: T('ranger', 0, 1, 1, 3, 'hit', 'Aimed shot', 'A careful shot that rarely misses.', { mult: 1.5, acc: 25 }),
  volley: T('ranger', 0, 2, 3, 6, 'all', 'Volley', 'Arrows at every foe.', { mult: 0.7 }),
  deadeye: T('ranger', 0, 3, 6, 7, 'hit', 'Deadeye', 'Straight through the gap in the armour.', { mult: 2.3, crit: 0.25, acc: 20 }),
  thorn: T('ranger', 1, 1, 1, 3, 'hit', 'Thorn whip', 'Thorns at one foe.', { stat: 'wits', base: 7, element: 'wild' }),
  herbs: T('ranger', 1, 2, 2, 3, 'heal', 'Field herbs', 'Heals one friend with what grows nearby. Works on the road too.', { stat: 'wits', base: 14, field: true }),
  entangle: T('ranger', 1, 3, 6, 8, 'stun', 'Entangle', 'Roots grab every foe. Some can\'t move next turn.', { all: true, chance: 0.55 }),
  tracker: T('ranger', 2, 1, 2, 0, 'passive', 'Tracker', 'Always on: +8 accuracy, and fewer creatures find you.', { passive: { acc: 8, wild: 0.8 } }),
  camo: T('ranger', 2, 2, 4, 0, 'passive', 'Camouflage', 'Always on: +8 evasion.', { passive: { eva: 8 } }),
  hawk: T('ranger', 2, 3, 7, 6, 'hit', 'Hawk strike', 'Your hawk dives twice at one foe.', { stat: 'luck', base: 12, element: 'wild', times: 2 }),
  rain: T('ranger', 0, 4, 9, 16, 'all', 'Rain of arrows', 'The sky goes dark with arrows.', { mult: 1.15 }),
  // Bard
  inspire: T('bard', 0, 1, 1, 4, 'buff', 'Inspire', 'The party hits harder for the fight.', { amount: 4 }),
  restsong: T('bard', 0, 2, 3, 5, 'healAll', 'Song of rest', 'A gentle tune that heals everyone. Works on the road too.', { stat: 'charm', base: 8, field: true }),
  anthem: T('bard', 0, 3, 6, 9, 'buff', 'Anthem', 'Everyone hits harder and takes less harm.', { amount: 5, ward: 3 }),
  mock: T('bard', 1, 1, 1, 2, 'hit', 'Vicious mockery', 'Words that sting.', { stat: 'charm', base: 5, element: 'mind' }),
  lullaby: T('bard', 1, 2, 3, 7, 'sleep', 'Lullaby', 'Every foe may fall asleep.', { all: true }),
  discord: T('bard', 1, 3, 6, 8, 'hit', 'Discord', 'A chord that rattles the skull. It may be dazed.', { stat: 'charm', base: 20, element: 'mind', stun: 0.35 }),
  fortune: T('bard', 2, 1, 2, 0, 'passive', 'Fortune', 'Always on: more great hits and a quarter more coin from fights.', { passive: { crit: 0.05, coin: 0.25 } }),
  haggle: T('bard', 2, 2, 4, 0, 'passive', 'Silver tongue', 'Always on: everything in shops costs a fifth less.', { passive: { haggle: 0.2 } }),
  fate: T('bard', 2, 3, 6, 6, 'haste', 'Twist of fate', 'The party is much harder to hit.', { amount: 10 }),
  encore: T('bard', 0, 4, 9, 12, 'spirit', 'Encore', 'Everyone gets 12 spirit back and hits harder.', { amount: 12, all: true, buff: 4 }),
  // Psionist
  spike: T('psionist', 0, 1, 1, 3, 'hit', 'Mind spike', 'Straight into the mind: armour doesn\'t help.', { stat: 'wits', base: 9, element: 'mind', pierce: true }),
  daze: T('psionist', 0, 2, 3, 5, 'stun', 'Daze', 'One foe loses its next turn.', { chance: 0.8 }),
  scream: T('psionist', 0, 3, 6, 12, 'all', 'Psychic scream', 'Every foe reels. Some are dazed.', { stat: 'wits', base: 14, element: 'mind', stun: 0.25 }),
  mindshield: T('psionist', 1, 1, 1, 3, 'ward', 'Mind shield', 'The party takes less harm for the fight.', { amount: 3 }),
  meditate: T('psionist', 1, 2, 3, 0, 'focus', 'Meditate', 'Spend your turn to get 12 spirit back. Works on the road too.', { amount: 12, field: true }),
  siphon: T('psionist', 1, 3, 6, 4, 'drain', 'Siphon', 'Pulls spirit out of one foe and into you, and hurts.', { stat: 'wits', base: 12, element: 'mind', amount: 10 }),
  link: T('psionist', 2, 1, 2, 2, 'spirit', 'Mind link', 'Gives 10 of your spirit to a friend. Works on the road too.', { amount: 10, give: true, field: true }),
  foresight: T('psionist', 2, 2, 4, 0, 'passive', 'Foresight', 'Always on: +10 evasion.', { passive: { eva: 10 } }),
  clarity: T('psionist', 2, 3, 6, 0, 'passive', 'Clarity', 'Always on: a quarter more spirit and spells cost less.', { passive: { sp: 0.25, costCut: 0.15 } }),
  overmind: T('psionist', 0, 4, 9, 0, 'passive', 'Mind over matter', 'Always on: spells hit a quarter harder and 2 spirit comes back every round.', { passive: { spell: 0.25, regen: 2 } })
};
// Class combinations: having both classes teaches the combo skill straight away.
const C = (a, b, cost, kind, name, what, extra = {}) => ({ combo: [a, b], cost, kind, name, what, level: 1, ...extra });
export const COMBOS = {
  dirtyfight: C('fighter', 'rogue', 5, 'hit', 'Dirty fighting', 'A heavy blow and a kick in the shin: it hits less after.', { mult: 1.7, blind: 15 }),
  spellblade: C('fighter', 'wizard', 6, 'hit', 'Spellblade', 'Your weapon wreathed in fire.', { mult: 1.4, element: 'fire', addStat: 'wits' }),
  oath: C('fighter', 'cleric', 6, 'hit', "Paladin's oath", 'A holy blow that heals you as it lands.', { mult: 1.5, element: 'holy', lifesteal: 0.4 }),
  charge: C('fighter', 'ranger', 5, 'hit', "Hunter's charge", 'A charging blow that almost never misses.', { mult: 1.8, acc: 20 }),
  hymn: C('fighter', 'bard', 6, 'buff', 'Battle hymn', 'Everyone hits harder and takes less harm.', { amount: 4, ward: 2 }),
  mindblade: C('fighter', 'psionist', 6, 'hit', 'Mind blade', 'A blade of thought: armour doesn\'t help.', { mult: 1.5, element: 'mind', pierce: true }),
  shadowbolt: C('rogue', 'wizard', 6, 'hit', 'Shadow bolt', 'Darkness at one foe, often a great hit.', { stat: 'wits', base: 18, element: 'shadow', crit: 0.2 }),
  mercy: C('rogue', 'cleric', 6, 'hit', "Mercy's edge", 'A quick cut, and a prayer that heals the party.', { mult: 1.2, healAll: 10 }),
  ambush: C('rogue', 'ranger', 6, 'hit', 'Ambush', 'From cover: a huge hit, often a great one.', { mult: 2, crit: 0.2 }),
  conartist: C('rogue', 'bard', 4, 'steal', 'Con artist', 'Talks every foe out of something.', { all: true }),
  mindtheft: C('rogue', 'psionist', 5, 'drain', 'Mind theft', 'Spirit out of every foe and into you.', { stat: 'wits', base: 6, element: 'mind', amount: 6, all: true }),
  sunburst: C('wizard', 'cleric', 12, 'all', 'Sunburst', 'Holy fire over every foe.', { stat: 'wits', base: 16, element: 'holy' }),
  stormarrows: C('wizard', 'ranger', 9, 'all', 'Storm arrows', 'Arrows that crackle into every foe.', { stat: 'wits', base: 12, element: 'storm' }),
  spellsong: C('wizard', 'bard', 8, 'all', 'Spellsong', 'A song that stings every foe and lifts the party.', { stat: 'charm', base: 8, element: 'mind', buff: 3 }),
  overload: C('wizard', 'psionist', 14, 'hit', 'Arcane overload', 'Everything you have, at one foe.', { stat: 'wits', base: 34, element: 'star' }),
  grace: C('cleric', 'ranger', 8, 'healAll', "Nature's grace", 'Heals everyone and clears what ails them. Works on the road too.', { stat: 'charm', base: 16, cleanse: true, field: true }),
  dawn: C('cleric', 'bard', 14, 'reviveAll', 'Hymn of dawn', 'Every fallen friend gets back up. Works on the road too.', { amount: 0.35, field: true }),
  soullink: C('cleric', 'psionist', 8, 'healAll', 'Soul link', 'Heals everyone and shares spirit round the party. Works on the road too.', { stat: 'charm', base: 12, spirit: 6, field: true }),
  huntsong: C('ranger', 'bard', 6, 'haste', 'Hunting song', 'The party dodges more and hits harder.', { amount: 8, buff: 2 }),
  huntermind: C('ranger', 'psionist', 0, 'passive', "Hunter's mind", 'Always on: +10 accuracy and more great hits.', { passive: { acc: 10, crit: 0.1 } }),
  mesmerize: C('bard', 'psionist', 8, 'sleep', 'Mesmerize', 'Every foe stares and nods off.', { all: true, chance: 0.8 })
};
// Three classes: Wizard, Cleric and Psionist together make the Mana Wellspring. Any other three make the Threefold path.
export const TRIOS = {
  wellspring: { trio: ['wizard', 'cleric', 'psionist'], kind: 'passive', name: 'Mana Wellspring', what: 'Always on: spirit comes back every round (5), spells cost a quarter less, and there\'s far more spirit to spend.', passive: { regen: 5, costCut: 0.25, sp: 0.4, spell: 0.1 } },
  threefold: { trio: [], kind: 'passive', name: 'Threefold path', what: 'Always on: +1 to every stat, and a little more health and spirit.', passive: { all: 1, hp: 0.1, sp: 0.1 } }
};
export const ALL_SKILLS = { ...SKILLS, ...COMBOS, ...TRIOS };
// A pure spellcaster (every class a caster, no Fighter, Rogue or Ranger): more spirit and stronger spells, weaker swings.
export const PURE_CASTER = { name: 'Pure spellcaster', what: 'Every class is a spellcaster: a third more spirit, spells a tenth stronger, weapon hits a fifth weaker.', passive: { sp: 0.33, spell: 0.1, swing: -0.2 } };
export const isPureCaster = (m) => m.classes.every((c) => CLASSES[c]?.caster);

export const treeOf = (cls) => Object.entries(SKILLS).filter(([, s]) => s.cls === cls).map(([id, s]) => ({ id, ...s })).sort((a, b) => a.branch - b.branch || a.step - b.step);
export const comboFor = (classes) => Object.entries(COMBOS).filter(([, s]) => s.combo.every((c) => classes.includes(c))).map(([id]) => id);
export function trioFor(classes) {
  if (classes.length < 3) return '';
  return TRIOS.wellspring.trio.every((c) => classes.includes(c)) ? 'wellspring' : 'threefold';
}
// Every skill this member can use now: learned ones, combos and the trio.
export function knownSkills(m) {
  const t = trioFor(m.classes);
  return [...m.skills, ...comboFor(m.classes), ...(t ? [t] : [])];
}
// Can they learn this one now? Returns '' when yes, or the reason.
export function canLearn(m, id) {
  const s = SKILLS[id];
  if (!s) return 'No such skill.';
  if (m.skills.includes(id)) return 'Already known.';
  if (!m.classes.includes(s.cls)) return `Needs the ${CLASSES[s.cls].name} class.`;
  if (m.level < s.level) return `Needs level ${s.level}.`;
  const prev = Object.entries(SKILLS).find(([, o]) => o.cls === s.cls && o.branch === s.branch && o.step === s.step - 1);
  if (prev && !m.skills.includes(prev[0])) return `Learn ${prev[1].name} first.`;
  if (m.points < 1) return 'No skill points left. One comes with every level.';
  return '';
}
export function learn(m, id) {
  if (canLearn(m, id)) return false;
  m.skills.push(id); m.points--; refresh(m);
  return true;
}
const startSkills = (cls) => {
  const casters = CLASSES[cls].caster;
  return treeOf(cls).filter((s) => s.step === 1 && s.level === 1).slice(0, casters ? 3 : 2).map((s) => s.id);
};
// A second class at level 5 and a third at level 10: their first skills come with them.
export function canAddClass(m, cls) {
  if (!CLASSES[cls]) return 'No such class.';
  if (m.classes.includes(cls)) return 'Already that class.';
  const need = m.classes.length === 1 ? SECOND_CLASS_LEVEL : m.classes.length === 2 ? THIRD_CLASS_LEVEL : 0;
  if (!need) return 'Three classes is the most anyone can hold.';
  if (m.level < need) return `A ${m.classes.length === 1 ? 'second' : 'third'} class comes at level ${need}.`;
  return '';
}
export function addClass(m, cls) {
  if (canAddClass(m, cls)) return false;
  m.classes.push(cls);
  for (const id of startSkills(cls)) if (!m.skills.includes(id)) m.skills.push(id);
  refresh(m);
  return true;
}

// ---------- Creatures ----------
// The same dozen as the bestiary on the Characters page (src/bestiary.js), by id, so they're drawn with the same looks.
// hp, atk, def, spd; xp and coin (copper) for winning; weak/tough: elements or weapon kinds that do double/half.
export const FOES = {
  rat: { name: 'Giant rat', hp: 14, atk: 5, def: 1, spd: 5, xp: 4, coin: 30, zone: 1 },
  slime: { name: 'Slime', hp: 20, atk: 4, def: 2, spd: 1, xp: 5, coin: 40, weak: ['fire', 'storm'], tough: ['sword', 'axe', 'dagger'], zone: 1 },
  goblin: { name: 'Goblin', hp: 18, atk: 6, def: 2, spd: 4, xp: 6, coin: 60, flees: true, zone: 1, kit: ['dagger', 'none', 'round'] },
  wolf: { name: 'Wolf', hp: 26, atk: 8, def: 3, spd: 6, xp: 9, coin: 40, zone: 2 },
  bandit: { name: 'Bandit', hp: 30, atk: 9, def: 4, spd: 4, xp: 11, coin: 140, zone: 2, kit: ['sword', 'leather', 'none'] },
  spider: { name: 'Giant spider', hp: 30, atk: 9, def: 3, spd: 5, xp: 12, coin: 60, web: true, weak: ['fire'], zone: 2 },
  skeleton: { name: 'Skeleton', hp: 32, atk: 10, def: 5, spd: 3, xp: 13, coin: 80, weak: ['holy', 'hammer'], tough: ['bow', 'dagger'], zone: 2, kit: ['sword', 'chain', 'round'] },
  cultist: { name: 'Cultist', hp: 34, atk: 9, def: 4, spd: 4, xp: 16, coin: 160, chant: true, zone: 3, kit: ['staff', 'robe', 'none'] },
  orc: { name: 'Orc', hp: 48, atk: 13, def: 6, spd: 3, xp: 20, coin: 150, zone: 3, kit: ['axe', 'leather', 'round'] },
  ghost: { name: 'Ghost', hp: 30, atk: 11, def: 2, spd: 6, xp: 18, coin: 100, weak: ['holy', 'mind', 'fire', 'storm', 'wild', 'star'], tough: ['sword', 'axe', 'dagger', 'hammer', 'spear', 'bow', 'staff', 'none'], drain: true, zone: 3 },
  troll: { name: 'Troll', hp: 70, atk: 15, def: 7, spd: 2, xp: 30, coin: 240, regen: 6, weak: ['fire'], zone: 4 },
  dragon: { name: 'Dragon', hp: 90, atk: 17, def: 8, spd: 5, xp: 50, coin: 600, breath: true, zone: 5 }
};
// The bosses. The three keepers hold the lantern stones and are in every land; the rest live in the other dungeons
// (each where the land suits it) and the caves. base is the bestiary creature they're drawn from; tint recolours it.
export const GUARDIANS = {
  boss1: { base: 'goblin', name: 'Grubnick, the goblin chief', hp: 115, atk: 12, def: 4, spd: 5, xp: 40, coin: 5000, stone: 1, drop: 'axe~mighty' },
  boss2: { base: 'spider', name: 'The Webmother', hp: 150, atk: 14, def: 6, spd: 6, xp: 80, coin: 9000, stone: 2, drop: 'robe~arcane' },
  boss3: { base: 'dragon', name: 'Old Cinderjaw', hp: 260, atk: 19, def: 9, spd: 5, xp: 160, coin: 25000, stone: 3, drop: 'plate~light' },
  bogwitch: { base: 'cultist', name: 'The Bog Witch', hp: 130, atk: 13, def: 5, spd: 5, xp: 70, coin: 7000, chant: true, drain: true, tint: 'swamp', drop: 'staff~arcane', scroll: 'scroll_sleep' },
  sandwyrm: { base: 'dragon', name: 'The Sand Wyrm', hp: 200, atk: 17, def: 8, spd: 4, xp: 110, coin: 12000, breath: true, tint: 'sand', weak: ['frost'], drop: 'spear~keen' },
  frostfang: { base: 'wolf', name: 'Frostfang', hp: 140, atk: 15, def: 6, spd: 7, xp: 80, coin: 6000, tint: 'ice', weak: ['fire'], tough: ['frost'], drop: 'leather~swift' },
  mossback: { base: 'troll', name: 'Mossback', hp: 190, atk: 16, def: 8, spd: 2, xp: 100, coin: 9000, regen: 10, tint: 'moss', drop: 'hammer~heavy' },
  rattlecrown: { base: 'skeleton', name: 'Rattlecrown, the bone king', hp: 160, atk: 15, def: 8, spd: 4, xp: 95, coin: 15000, tint: 'gold', chant: true, drop: 'sword~cursed', scroll: 'scroll_raise' },
  rustedknight: { base: 'skeleton', name: 'The Rusted Knight', hp: 170, atk: 16, def: 11, spd: 3, xp: 95, coin: 8000, tint: 'rust', drop: 'tall~sturdy' },
  drownedchoir: { base: 'ghost', name: 'The Drowned Choir', hp: 120, atk: 14, def: 3, spd: 6, xp: 90, coin: 8000, tint: 'sea', drop: 'robe~blessed', scroll: 'scroll_heal' },
  gorrak: { base: 'orc', name: 'Gorrak the warlord', hp: 180, atk: 17, def: 8, spd: 4, xp: 100, coin: 10000, tint: 'war', drop: 'axe~fine' },
  redsilas: { base: 'bandit', name: 'Silas the Red', hp: 140, atk: 14, def: 6, spd: 6, xp: 80, coin: 20000, steals: true, tint: 'red', drop: 'dagger~keen' },
  ratking: { base: 'rat', name: 'The Rat King', hp: 70, atk: 8, def: 3, spd: 6, xp: 25, coin: 1500, tint: 'gold', cave: true, drop: 'dagger~fine' },
  bigslime: { base: 'slime', name: 'The Great Slime', hp: 90, atk: 8, def: 4, spd: 1, xp: 28, coin: 1800, regen: 4, tint: 'moss', cave: true, drop: 'round~sturdy' },
  broodqueen: { base: 'spider', name: 'The Brood Queen', hp: 85, atk: 10, def: 4, spd: 5, xp: 30, coin: 2000, web: true, tint: 'red', cave: true, drop: 'bow~fine' },
  oldtusk: { base: 'wolf', name: 'Old Tusk', hp: 90, atk: 11, def: 5, spd: 5, xp: 30, coin: 1500, tint: 'war', cave: true, drop: 'leather~sturdy' },
  cavetroll: { base: 'troll', name: 'The Cave Troll', hp: 110, atk: 13, def: 6, spd: 2, xp: 40, coin: 2500, regen: 5, tint: 'ice', cave: true, drop: 'hammer~fine' }
};
export const LANTERN_KEEPERS = ['boss1', 'boss2', 'boss3'];
export const ZONE_FOES = { 1: ['rat', 'slime', 'goblin'], 2: ['wolf', 'bandit', 'spider', 'goblin'], 3: ['skeleton', 'cultist', 'spider', 'bandit'], 4: ['orc', 'ghost', 'cultist', 'skeleton'], 5: ['troll', 'orc', 'ghost', 'dragon'] };
// What lives where on the land: forests have wolves and spiders, swamps slimes and ghosts, and so on.
export const LAND_FOES = { F: ['wolf', 'spider'], w: ['slime', 'ghost', 'cultist'], d: ['bandit', 'skeleton', 'dragon'], '"': ['goblin', 'wolf'], _: ['rat', 'spider', 'slime', 'troll'], z: ['skeleton', 'cultist', 'ghost', 'orc'] };

// People as foes: numbers by what they do. Guards are tougher than folk; knights and the castle captain far more.
export const NPC_ROLES = {
  folk: { hp: 16, atk: 5, def: 1, spd: 3, xp: 3, coin: [5, 60] },
  inn: { hp: 22, atk: 6, def: 2, spd: 3, xp: 5, coin: [100, 400] },
  shop: { hp: 20, atk: 5, def: 2, spd: 3, xp: 5, coin: [200, 900] },
  smith: { hp: 40, atk: 12, def: 5, spd: 2, xp: 14, coin: [150, 600] },
  priest: { hp: 30, atk: 8, def: 3, spd: 3, xp: 12, coin: [80, 300], heals: true },
  trainer: { hp: 60, atk: 14, def: 7, spd: 5, xp: 25, coin: [200, 800] },
  bard: { hp: 20, atk: 6, def: 2, spd: 5, xp: 6, coin: [40, 200] },
  peddler: { hp: 22, atk: 6, def: 2, spd: 4, xp: 6, coin: [300, 1200] },
  hermit: { hp: 90, atk: 14, def: 5, spd: 4, xp: 45, coin: [10, 100], heals: true, magic: true },
  guard: { hp: 46, atk: 11, def: 6, spd: 4, xp: 16, coin: [100, 400] },
  captain: { hp: 80, atk: 15, def: 9, spd: 4, xp: 35, coin: [500, 2000] },
  knight: { hp: 90, atk: 17, def: 11, spd: 3, xp: 40, coin: [800, 3000] },
  ruler: { hp: 70, atk: 12, def: 6, spd: 4, xp: 60, coin: [100000, 300000] }
};
// Who can't be fought, and what they say when you try.
export const PEACEFUL = { keeper: 'Bob catches your wrist without looking up from the glass he\'s polishing. "Not in my inn."', cat: 'Patches looks at you. You think better of it.' };

// ---------- The dice ----------
export function seeded(seed) {
  let s = 0;
  for (const c of String(seed)) s = (Math.imul(s, 31) + c.charCodeAt(0)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const between = (rnd, [lo, hi]) => lo + Math.floor(rnd() * (hi - lo + 1));

// ---------- The party ----------
// A party member from a sheet: { name, cls (or classes), race, look, stats?, weapon?, armour?, shield?, who }.
export function member(b = {}, level = 1) {
  const classes = (Array.isArray(b.classes) ? b.classes : [b.cls]).filter((c) => CLASSES[c]).filter((c, i, a) => a.indexOf(c) === i).slice(0, 3);
  if (!classes.length) classes.push('fighter');
  const cls = classes[0], base = CLASSES[cls];
  const stats = {};
  for (const s of STATS) { const v = Number(b.stats?.[s]); stats[s] = Number.isInteger(v) && v >= 1 && v <= STAT_CAP ? v : base.stats[s]; }
  const kitOk = (k, v) => typeof v === 'string' && (v === 'none' || kitKind(v) === k);
  const m = {
    id: String(b.id || cls).slice(0, 40), name: String(b.name || base.name).slice(0, 40), cls, classes, race: RACES[b.race] ? b.race : 'human',
    who: ['you', 'bob', 'friend'].includes(b.who) ? b.who : 'friend',
    look: String(b.look || '').slice(0, 160), stats, level: clamp(Math.floor(Number(b.level)) || level, 1, 50), xp: clamp(Math.floor(Number(b.xp)) || 0, 0, 1e7),
    weapon: kitOk('weapon', b.weapon) ? b.weapon : base.weapon, armour: kitOk('armour', b.armour) ? b.armour : base.armour, shield: kitOk('shield', b.shield) ? b.shield : base.shield,
    skills: [], points: 0, use: { might: 0, wits: 0, charm: 0, luck: 0 }, trained: { acc: 0, eva: 0 }, taught: []
  };
  const known = Array.isArray(b.skills) ? b.skills.filter((id) => SKILLS[id] && classes.includes(SKILLS[id].cls)) : null;
  m.skills = known && known.length ? [...new Set(known)] : classes.flatMap(startSkills);
  // Points: one per level after the first, less what's been spent beyond the free starting skills.
  const free = classes.flatMap(startSkills).filter((id) => m.skills.includes(id)).length;
  m.points = Number.isInteger(b.points) ? clamp(b.points, 0, 60) : Math.max(0, m.level - 1 - (m.skills.length - free));
  for (const s of STATS) m.use[s] = clamp(Math.floor(Number(b.use?.[s])) || 0, 0, 1e6);
  for (const s of ['acc', 'eva']) m.trained[s] = clamp(Math.floor(Number(b.trained?.[s])) || 0, 0, 30);
  m.taught = Array.isArray(b.taught) ? b.taught.filter((t) => typeof t === 'string').slice(0, 50) : [];
  refresh(m);
  m.hp = Number.isInteger(b.hp) ? clamp(b.hp, 0, m.maxHp) : m.maxHp;
  m.sp = Number.isInteger(b.sp) ? clamp(b.sp, 0, m.maxSp) : m.maxSp;
  return m;
}
// Everything always on, added up: passives, combos, the trio, the pure-caster bonus.
export function passivesOf(m) {
  const out = { hp: 0, sp: 0, guard: 0, magic: 0, acc: 0, eva: 0, crit: 0, poison: 1, wild: 1, coin: 0, haggle: 0, costCut: 0, spell: 0, regen: 0, swing: 0, all: 0 };
  const list = knownSkills(m).map((id) => ALL_SKILLS[id]).filter((s) => s?.kind === 'passive').map((s) => s.passive);
  if (isPureCaster(m)) list.push(PURE_CASTER.passive);
  for (const p of list) for (const [k, v] of Object.entries(p)) { if (k === 'poison' || k === 'wild') out[k] *= v; else out[k] += v; }
  out.costCut = Math.min(0.5, out.costCut);
  return out;
}
const kitOf = (m) => ({ weapon: kitStats('weapon', m.weapon), armour: kitStats('armour', m.armour), shield: kitStats('shield', m.shield) });
// A stat as it stands now: the sheet, plus the race, the kit's bonuses and drawbacks, and the Threefold path.
export function statOf(m, s) {
  const k = kitOf(m), p = passivesOf(m);
  const v = m.stats[s] + (RACES[m.race].stats[s] || 0) + (k.weapon.mods[s] || 0) + (k.armour.mods[s] || 0) + (k.shield.mods[s] || 0) + p.all;
  return Math.max(1, v);
}
// Health and spirit from level, stats, race and passives. Called after anything changes.
export function refresh(m) {
  const p = passivesOf(m), r = RACES[m.race];
  const might = statOf(m, 'might'), wits = statOf(m, 'wits');
  const hp = (30 + might * 6 + (m.level - 1) * (6 + might)) * r.hp * (1 + p.hp);
  const sp = (6 + wits * 2 + (m.level - 1) * (1 + Math.ceil(wits / 2)) + (m.classes.length - 1) * 4) * r.sp * (1 + p.sp);
  m.maxHp = Math.max(10, Math.round(hp)); m.maxSp = Math.max(0, Math.round(sp));
  if (Number.isInteger(m.hp)) m.hp = Math.min(m.hp, m.maxHp);
  if (Number.isInteger(m.sp)) m.sp = Math.min(m.sp, m.maxSp);
  return m;
}
export const attackOf = (m) => Math.round((statOf(m, 'might') * 2 + kitOf(m).weapon.power * 2 + m.level) * (1 + passivesOf(m).swing));
export const guardOf = (m) => { const k = kitOf(m); return Math.max(0, k.armour.guard + k.shield.guard + Math.floor(m.level / 2) + (RACES[m.race].guard || 0) + passivesOf(m).guard); };
export const magicOf = (m) => { const k = kitOf(m); return statOf(m, 'wits') + k.weapon.magic + k.armour.magic + k.shield.magic + passivesOf(m).magic; };
export const speedOf = (m) => { const k = kitOf(m); return statOf(m, 'luck') * 2 + statOf(m, 'wits') - Math.max(0, k.armour.slow) - Math.max(0, k.shield.slow) + Math.max(0, -k.weapon.slow) + (m.race === 'pixie' || m.race === 'halfling' ? 2 : 0); };
// Accuracy and evasion (out of 100-ish). The chance to land a hit is accuracy take away the target's evasion.
export const accuracyOf = (m) => { const k = kitOf(m); return 78 + statOf(m, 'luck') * 2 + statOf(m, 'wits') + m.level + k.weapon.acc + k.armour.acc + k.shield.acc + RACES[m.race].acc + m.trained.acc + passivesOf(m).acc; };
export const evasionOf = (m) => { const k = kitOf(m); return Math.max(0, 2 + statOf(m, 'luck') * 2 + statOf(m, 'wits') + k.armour.eva + k.shield.eva + k.weapon.eva + RACES[m.race].eva + m.trained.eva + passivesOf(m).eva); };
export const critOf = (m) => clamp(0.03 * statOf(m, 'luck') + kitOf(m).weapon.crit + passivesOf(m).crit, 0, 0.6);
export const hitChance = (acc, eva) => clamp(acc - eva, 20, 98) / 100;
export const costOf = (m, id) => Math.max(0, Math.round((ALL_SKILLS[id]?.cost || 0) * (1 - passivesOf(m).costCut)));
export const xpFor = (level) => Math.round(18 * Math.pow(level, 1.6));

// ---------- A journey ----------
// A new journey: in Bob's Inn by the front door, a new land waiting outside, three tonics and 5 silver.
export function newJourney({ seed = String(Date.now()), size = 'medium', party = [] } = {}, world) {
  const p = party.slice(0, 4).map((b) => member(b));
  if (!p.length) p.push(member({ name: 'Hero', cls: 'fighter', who: 'you' }));
  const ids = new Set();
  for (const m of p) { let id = m.id, n = 2; while (ids.has(id)) id = `${m.id}${n++}`; m.id = id; ids.add(id); }
  const owned = { weapon: [], armour: [], shield: [] };
  for (const m of p) for (const k of ['weapon', 'armour', 'shield']) if (m[k] !== 'none' && !owned[k].includes(m[k])) owned[k].push(m[k]);
  const inn = world?.map?.('inn');
  return {
    v: SAVE_VERSION, seed: String(seed).slice(0, 40), size, at: 'inn', x: inn?.start.x ?? 21, y: inn?.start.y ?? 29, facing: 'up',
    party: p, bag: { tonic: 3, water: 1 }, owned, coin: 500, steps: 0, danger: 0, next: 14, opened: [], beaten: [], talked: [], felled: [], wanted: {}, fines: 0, battles: 0, won: false
  };
}
// Cleans a save from disk (or from the page) into a journey this file can play. Unknown things are dropped.
// A save from Journey 1.0 (the old fixed vale) keeps its party, kit, bag and coin, and starts in Bob's Inn.
export function cleanJourney(s, makeWorld) {
  if (!s || typeof s !== 'object' || !s.seed) return null;
  const old = !(Number(s.v) >= 2);
  const size = ['small', 'medium', 'large'].includes(s.size) ? s.size : 'medium';
  const world = makeWorld ? makeWorld(String(s.seed).slice(0, 40), size) : null;
  const j = newJourney({ seed: String(s.seed).slice(0, 40), size, party: Array.isArray(s.party) ? s.party : [] }, world);
  if (!old && world) {
    const map = world.map(String(s.at));
    const x = Number(s.x), y = Number(s.y);
    if (map && Number.isInteger(x) && Number.isInteger(y) && world.tiles[map.rows[y]?.[x]]?.walk) Object.assign(j, { at: map.id, x, y });
  }
  j.facing = ['down', 'up', 'left', 'right'].includes(s.facing) ? s.facing : 'down';
  j.bag = {}; for (const [k, n] of Object.entries(s.bag || {})) if (ITEMS[k] && Number.isInteger(n) && n > 0) j.bag[k] = Math.min(n, 99);
  for (const k of ['weapon', 'armour', 'shield']) j.owned[k] = [...new Set([...(j.owned[k] || []), ...(Array.isArray(s.owned?.[k]) ? s.owned[k] : [])])].filter((v) => typeof v === 'string' && kitKind(v) === k).slice(0, 60);
  j.coin = old ? Math.max(0, Math.min(1e9, Math.floor(Number(s.gold) || 0) * 10)) : Math.max(0, Math.min(1e12, Math.floor(Number(s.coin) || 0)));
  for (const k of ['steps', 'battles', 'fines']) j[k] = Math.max(0, Math.min(1e7, Math.floor(Number(s[k]) || 0)));
  if (old) return j;
  j.danger = Math.max(0, Number(s.danger) || 0); j.next = clamp(Number(s.next) || 14, 6, 40);
  const strs = (v, n) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string').slice(0, n);
  j.opened = strs(s.opened, 400); j.talked = strs(s.talked, 200); j.felled = strs(s.felled, 600);
  j.beaten = strs(s.beaten, 40).filter((v) => GUARDIANS[v]);
  j.wanted = {}; for (const [k, n] of Object.entries(s.wanted || {})) if (typeof k === 'string' && Number(n) > 0) j.wanted[k.slice(0, 20)] = Math.min(400, Math.floor(Number(n)));
  j.won = s.won === true;
  return j;
}

// ---------- Walking ----------
export const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const mapOf = (world, j) => world.map(j.at) || world.map('inn');
// The people on a map who are still standing.
export const peopleOn = (world, j, map = mapOf(world, j)) => map.people.filter((p) => !j.felled.includes(p.id));
// Who or what stands on a tile: a person, a chest, or a boss.
export function thingAt(world, j, x, y) {
  const map = mapOf(world, j);
  const p = peopleOn(world, j, map).find((q) => q.x === x && q.y === y); if (p) return { kind: 'person', person: p };
  const c = map.chests.find((q) => q.x === x && q.y === y); if (c) return { kind: 'chest', chest: c, open: j.opened.includes(`${map.id}:${c.id}`) };
  if (map.boss && map.boss.x === x && map.boss.y === y && !j.beaten.includes(map.boss.id)) return { kind: 'boss', boss: map.boss };
  return null;
}
export const canStand = (world, j, x, y) => { const map = mapOf(world, j); return world.tiles[map.rows[y]?.[x]]?.walk === true && !thingAt(world, j, x, y); };
const near = (a, b, d) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= d;

// One press of an arrow key. Turns to face that way; steps if the way is clear. Returns what happened:
// { moved, door, battle: [foe specs], bump, chase } and the journey is changed in place.
export function walk(world, j, dir, rnd = Math.random) {
  if (!STEP[dir]) return { moved: false };
  j.facing = dir;
  const [dx, dy] = STEP[dir];
  const x = j.x + dx, y = j.y + dy;
  const map = mapOf(world, j);
  if (!canStand(world, j, x, y)) return { moved: false, bump: thingAt(world, j, x, y) || { kind: 'tile', tile: map.rows[y]?.[x] } };
  j.x = x; j.y = y; j.steps++;
  for (const k of Object.keys(j.wanted)) if (k !== map.id && k !== siteKey(map)) { j.wanted[k]--; if (j.wanted[k] <= 0) delete j.wanted[k]; }
  const door = map.doors.find((d) => d.x === x && d.y === y);
  if (door) {
    const to = world.map(door.to);
    if (!to) { j.x -= dx; j.y -= dy; return { moved: false, bump: { kind: 'closed' } }; }
    j.at = to.id; j.x = door.tx ?? to.start.x; j.y = door.ty ?? to.start.y;
    j.danger = 0;
    return { moved: true, door: to.id };
  }
  const caught = tick(world, j, rnd);
  if (caught) return { moved: true, battle: caught, chase: true };
  const tile = ['world', 'cave', 'dungeon'].includes(map.kind) ? world.tiles[map.rows[y][x]] : { wild: 0 }; // nothing jumps out in a settlement
  const patrol = peopleOn(world, j, map).some((p) => p.patrol && near(p, j, 6));
  const p = Math.min(...j.party.map((m) => passivesOf(m).wild));
  j.danger += (tile.wild || 0) * (patrol ? 0.3 : 1) * p;
  if (tile.wild && j.danger >= j.next) {
    j.danger = 0; j.next = 10 + Math.floor(rnd() * 16);
    const helpers = peopleOn(world, j, map).filter((q) => q.patrol && near(q, j, 6) && !j.wanted.world).slice(0, 2);
    return { moved: true, battle: encounter(world, j, rnd), helpers };
  }
  return { moved: true };
}
const siteKey = (map) => (map.kind === 'world' ? 'world' : map.site || map.id);

// The people move a step: patrols and travellers walk their roads back and forth, folk and cats wander, and when
// the party is wanted here the guards come for them. Returns foe specs when a guard catches up.
export function tick(world, j, rnd = Math.random) {
  const map = mapOf(world, j);
  const live = peopleOn(world, j, map);
  const taken = (x, y, who) => (x === j.x && y === j.y) || live.some((q) => q !== who && q.x === x && q.y === y) || map.chests.some((c) => c.x === x && c.y === y);
  const wanted = j.wanted[siteKey(map)] > 0;
  for (const p of live) {
    if (wanted && ['guard', 'captain', 'knight'].includes(p.role) && near(p, j, 10)) {
      const steps = Object.entries(STEP).map(([f, [dx, dy]]) => ({ f, x: p.x + dx, y: p.y + dy })).filter((s) => world.tiles[map.rows[s.y]?.[s.x]]?.walk && !map.doors.some((d) => d.x === s.x && d.y === s.y));
      steps.sort((a, b) => (Math.abs(a.x - j.x) + Math.abs(a.y - j.y)) - (Math.abs(b.x - j.x) + Math.abs(b.y - j.y)));
      const s = steps[0];
      if (s && !taken(s.x, s.y, p)) { p.x = s.x; p.y = s.y; p.facing = s.f; }
      if (near(p, j, 1)) return [{ person: p }, ...live.filter((q) => q !== p && ['guard', 'captain', 'knight'].includes(q.role) && near(q, j, 5)).slice(0, 2).map((q) => ({ person: q }))];
      continue;
    }
    if (p.route && rnd() < 0.7) {
      let at = p.routeAt + p.routeDir;
      if (at < 0 || at >= p.route.length) { p.routeDir *= -1; at = p.routeAt + p.routeDir; }
      const s = p.route[at];
      if (s && !taken(s.x, s.y, p)) { p.facing = s.x > p.x ? 'right' : s.x < p.x ? 'left' : s.y > p.y ? 'down' : 'up'; p.x = s.x; p.y = s.y; p.routeAt = at; }
      continue;
    }
    if (p.wander && rnd() < 0.25) {
      const [f, [dx, dy]] = pick(rnd, Object.entries(STEP));
      const x = p.x + dx, y = p.y + dy;
      p.facing = f;
      const home = p.homeX ?? (p.homeX = p.x, p.x), homeY = p.homeY ?? (p.homeY = p.y, p.y);
      const t = map.rows[y]?.[x];
      if (world.tiles[t]?.walk && !'e=G'.includes(t) && !map.doors.some((d) => d.x === x && d.y === y) && Math.abs(x - home) + Math.abs(y - homeY) <= 3 && !taken(x, y, p)) { p.x = x; p.y = y; }
    }
  }
  return null;
}

// What jumps out: harder the further from home you walk (and deeper underground), and what fits the land.
export function zoneAt(world, j) {
  const map = mapOf(world, j);
  if (map.kind === 'world') return world.zoneOf ? world.zoneOf(j.x, j.y) : clamp(1 + Math.floor((Math.abs(j.x - world.start.x) + Math.abs(j.y - world.start.y)) / Math.max(8, world.w / 6)), 1, 5);
  return map.zone || 1;
}
export function encounter(world, j, rnd = Math.random) {
  const zone = zoneAt(world, j);
  const map = mapOf(world, j);
  const tile = map.rows[j.y]?.[j.x];
  const land = (LAND_FOES[tile] || []).filter((id) => FOES[id].zone <= zone + 1);
  const list = [...(ZONE_FOES[zone] || ZONE_FOES[1]), ...land];
  const n = 1 + Math.floor(rnd() * Math.min(3, 1 + zone + (j.party.length > 2 ? 1 : 0)));
  return Array.from({ length: Math.min(n, 4) }, () => pick(rnd, list));
}

// ---------- Fights ----------
// The tables above are the creatures' shape; these two set how tough the whole game is (tuned by test/run-journey-test.js).
export const FOE_HP = 2.6, FOE_ATK = 1.8;
// A foe from a creature id, a boss id, or { person } for someone from the map. zone makes people of the wilder
// places a little tougher.
export function foe(spec, i = 0, zone = 1) {
  if (spec && typeof spec === 'object' && spec.person) return personFoe(spec.person, i, zone);
  const id = String(spec);
  const g = GUARDIANS[id];
  const base = FOES[g ? g.base : id];
  if (!base) return null;
  const f = { ...base, ...(g || {}), key: `${id}-${i}`, id, type: g ? g.base : id, guardian: Boolean(g) };
  f.hp = Math.round(f.hp * FOE_HP); f.atk = Math.round(f.atk * FOE_ATK);
  if (g) f.flees = false; // a boss stands its ground
  f.maxHp = f.hp; f.weak = g?.weak || base.weak || []; f.tough = g?.tough || base.tough || [];
  f.acc = 80 + f.spd * 2 + (g ? 8 : 0); f.eva = f.spd * 2 + (g ? 4 : 0);
  f.coinRange = [Math.round(f.coin * 0.7), Math.round(f.coin * 1.3)];
  if (!g && base.kit) f.kit = { weapon: base.kit[0], armour: base.kit[1], shield: base.kit[2] };
  return f;
}
function personFoe(p, i, zone) {
  const r = NPC_ROLES[p.role] || NPC_ROLES.folk;
  const up = 1 + (Math.max(1, zone) - 1) * 0.15;
  const kit = { weapon: p.parts?.weapon || 'none', armour: p.parts?.armour || 'none', shield: p.parts?.shield || 'none' };
  const w = kitStats('weapon', kit.weapon), a = kitStats('armour', kit.armour), s = kitStats('shield', kit.shield);
  const f = {
    key: `${p.id}-${i}`, id: p.id, type: 'person', person: p, name: p.title ? `${p.title} ${p.name}` : p.name, role: p.role, parts: p.parts,
    hp: Math.round(r.hp * FOE_HP * 0.7 * up), atk: Math.round((r.atk + w.power) * FOE_ATK * 0.6 * up), def: r.def + a.guard + s.guard, spd: r.spd,
    xp: Math.round(r.xp * up), coinRange: r.coin, weak: [], tough: [], heals: r.heals, magic: r.magic, kit, flees: ['folk', 'shop', 'inn', 'bard', 'peddler'].includes(p.role)
  };
  f.maxHp = f.hp; f.acc = 80 + f.spd * 2 + w.acc; f.eva = Math.max(0, f.spd * 2 + a.eva + s.eva);
  return f;
}
// A fight: the foes (named Goblin A, Goblin B when there are two of a kind), helpers on your side, and the log.
// opts: { helpers: [people from the road who join in], spar: true for a friendly bout (nobody falls for good) }.
export function startBattle(j, specs, opts = {}) {
  const zone = opts.zone || 1;
  const foes = specs.map((s, i) => foe(s, i, zone)).filter(Boolean);
  const count = {}; for (const f of foes) if (f.type !== 'person') count[f.type] = (count[f.type] || 0) + 1;
  const seen = {};
  for (const f of foes) if (count[f.type] > 1 && !f.guardian) { seen[f.type] = (seen[f.type] || 0) + 1; f.name = `${f.name} ${'ABCD'[seen[f.type] - 1]}`; }
  const allies = (opts.helpers || []).slice(0, 2).map((p, i) => { const f = personFoe(p, i, zone); return { ...f, key: `ally-${p.id}`, ally: true, hp: Math.round(f.hp * 0.8), maxHp: Math.round(f.hp * 0.8) }; });
  j.battles++;
  return { foes, allies, round: 0, buff: 0, ward: 0, haste: 0, over: '', spar: Boolean(opts.spar), people: foes.some((f) => f.person), site: opts.site || '', guardian: foes.some((f) => f.guardian), log: [] };
}
const alive = (list) => list.filter((x) => x.hp > 0);
const roll = (rnd, n) => Math.round(n * (0.85 + rnd() * 0.3));
function hurt(f, dmg, element, weapon) {
  let mult = 1;
  if (element && f.weak.includes(element)) mult = 2; else if (weapon && f.weak.includes(weapon)) mult = 1.5;
  if ((weapon && f.tough.includes(weapon) && !element) || (element && f.tough.includes(element))) mult *= 0.5;
  return { dmg: Math.max(1, Math.round(dmg * mult)), weak: mult > 1, tough: mult < 1 };
}
// Using a stat a lot trains it: every so many uses, one point (up to the cap).
function practise(m, stat, say) {
  m.use[stat] = (m.use[stat] || 0) + 1;
  const need = 25 * m.stats[stat];
  if (m.use[stat] >= need && m.stats[stat] < STAT_CAP) {
    m.use[stat] = 0; m.stats[stat]++; refresh(m);
    say?.({ who: m.id, side: 'party', act: 'train', text: `All that practice pays off: ${m.name}'s ${STAT_NAMES[stat]} goes up to ${m.stats[stat]}.` });
  }
}

// Plays one round. commands: one per party member still standing, by member id:
// { act: 'fight'|'skill'|'item'|'defend'|'run', target: foe key or member id, skill, item }.
// Returns the events in order, for the page to animate: { who, side, act, target, dmg, heal, miss, crit, weak, text }.
export function playRound(j, b, commands = {}, rnd = Math.random) {
  if (b.over) return [];
  b.round++;
  const ev = [];
  const say = (e) => { ev.push(e); b.log.push(e.text); if (b.log.length > 80) b.log.shift(); };
  const party = j.party;
  const defending = new Set(), covering = [];
  const turns = [
    ...alive(party).filter((m) => !b.field || commands[m.id]).map((m) => ({ side: 'party', who: m, speed: speedOf(m) + (kitOf(m).weapon.first ? 4 : 0) + rnd() * 4 })),
    ...alive(b.allies || []).map((a) => ({ side: 'ally', who: a, speed: a.spd * 2 + rnd() * 4 })),
    ...(b.field ? [] : alive(b.foes)).map((f) => ({ side: 'foe', who: f, speed: f.spd * 2 - (f.slowed ? 4 : 0) + rnd() * 4 }))
  ].sort((a, c) => c.speed - a.speed);
  for (const m of alive(party)) {
    const c = commands[m.id] || { act: 'fight' };
    if (c.act === 'defend') defending.add(m.id);
    if (c.act === 'skill' && c.skill === 'guard' && m.sp >= costOf(m, 'guard')) covering.push(m);
  }
  for (const t of turns) {
    if (b.over) break;
    if (t.who.hp <= 0) continue;
    if (t.side === 'party') partyTurn(t.who, commands[t.who.id] || { act: 'fight' });
    else if (t.side === 'ally') allyTurn(t.who);
    else foeTurn(t.who);
    if (b.field) continue;
    if (!alive(b.foes).length) { b.over = 'won'; break; }
    if (!alive(party).length) { b.over = 'lost'; break; }
  }
  if (b.field) return ev;
  // End of the round: poison, regrowth, spirit welling back.
  for (const f of alive(b.foes)) {
    if (f.poison) { const d = Math.min(f.hp, f.poison); f.hp -= d; f.poisonLeft--; if (f.poisonLeft <= 0) f.poison = 0; say({ who: f.key, side: 'foe', act: 'poison', dmg: d, text: `Poison eats at ${f.name} (${d}).${f.hp <= 0 ? ` ${f.name} is beaten.` : ''}` }); }
    if (f.regen && !f.burned && f.hp > 0) { const h = Math.min(f.regen, f.maxHp - f.hp); if (h > 0) { f.hp += h; say({ who: f.key, side: 'foe', act: 'regen', heal: h, text: `${f.name} knits back together (+${h}).` }); } }
  }
  for (const m of alive(party)) { const r = passivesOf(m).regen; if (r && m.sp < m.maxSp) { const g = Math.min(r, m.maxSp - m.sp); m.sp += g; } }
  for (const f of b.foes) f.burned = false;
  if (!b.over && !alive(b.foes).length) b.over = 'won';
  if (b.over === 'won') win();
  if (b.over === 'lost' && b.spar) for (const m of party) m.hp = Math.max(1, m.hp);
  return ev;

  function targetFoe(key) { const live = alive(b.foes); return live.find((f) => f.key === key) || live[0]; }
  function friend(id, wantDown = false) { return party.find((p) => p.id === id && (wantDown ? p.hp <= 0 : p.hp > 0)); }
  function partyTurn(m, c) {
    if (m.asleep) { m.asleep--; say({ who: m.id, side: 'party', act: 'stuck', text: `${m.name} can't move this turn.` }); return; }
    if (c.act === 'defend') { say({ who: m.id, side: 'party', act: 'defend', text: `${m.name} braces.` }); return; }
    if (c.act === 'run') {
      if (b.guardian) { say({ who: m.id, side: 'party', act: 'run', miss: true, text: `There's no running from ${b.foes.find((f) => f.guardian).name}.` }); return; }
      const avgLuck = alive(party).reduce((n, p) => n + statOf(p, 'luck'), 0) / alive(party).length;
      const fastest = Math.max(...alive(b.foes).map((f) => f.spd));
      if (rnd() < clamp(0.45 + (avgLuck - fastest) * 0.08, 0.15, 0.9)) { b.over = 'fled'; say({ who: m.id, side: 'party', act: 'run', text: 'The party gets away!' }); }
      else say({ who: m.id, side: 'party', act: 'run', miss: true, text: `${m.name} tries to run, but they cut off the way.` });
      return;
    }
    if (c.act === 'item') return useItem(m, c.item, c.target);
    if (c.act === 'skill' && knownSkills(m).includes(c.skill) && ALL_SKILLS[c.skill].kind !== 'passive' && m.sp >= costOf(m, c.skill)) { m.sp -= costOf(m, c.skill); return cast(m, c.skill, c.target, false); }
    const f = targetFoe(c.target); if (!f) return;
    strike(m, f, 1, 'fight');
  }
  // A weapon hit: rolls to land (accuracy against evasion), then for a great hit, then damage.
  function strike(m, f, mult, act, extra = {}, s = {}) {
    const w = kitOf(m).weapon;
    const chance = hitChance(accuracyOf(m) + (s.acc || 0) - (m.blind || 0), f.eva);
    if (rnd() > chance) { say({ who: m.id, side: 'party', act, target: f.key, miss: true, weapon: kitBase(m.weapon), ...extra, text: `${m.name} swings at ${f.name} and misses.` }); return 0; }
    practise(m, 'might', say);
    const crit = rnd() < clamp(critOf(m) + (s.crit || 0), 0, 0.8);
    if (crit) practise(m, 'luck', say);
    let raw = roll(rnd, (attackOf(m) + b.buff + (s.addStat ? magicOf(m) * 2 : 0)) * mult) - (s.pierce ? 0 : Math.floor(f.def / 2));
    if (crit) raw = Math.round(raw * 1.6);
    if (s.element === 'holy' && ['skeleton', 'ghost'].includes(f.type)) raw *= 2;
    const r = hurt(f, Math.max(1, raw), s.element || null, kitBase(m.weapon));
    f.hp = Math.max(0, f.hp - r.dmg);
    if (s.element === 'fire') f.burned = true;
    say({ who: m.id, side: 'party', act, target: f.key, dmg: r.dmg, crit, weak: r.weak, tough: r.tough, weapon: kitBase(m.weapon), element: s.element, ...extra, text: `${m.name} ${crit ? 'lands a great hit on' : 'hits'} ${f.name} for ${r.dmg}${r.weak ? '. It hates that!' : r.tough ? '. It barely notices.' : '.'}${f.hp <= 0 ? ` ${f.name} is beaten.` : ''}` });
    return r.dmg;
  }
  // A spell at a foe: rolls to land too, with Wits (spells are hard to dodge, but not impossible).
  function spellHit(m, f, s, id, power) {
    const chance = hitChance(92 + statOf(m, 'wits') * 2 + (s.acc || 0) + m.trained.acc, f.eva / 2);
    if (rnd() > chance) { say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, miss: true, element: s.element, text: `${f.name} slips aside from ${m.name}'s ${s.name}.` }); return 0; }
    practise(m, s.stat === 'charm' ? 'charm' : 'wits', say);
    let raw = roll(rnd, power);
    const crit = s.crit ? rnd() < s.crit : false;
    if (crit) raw = Math.round(raw * 1.6);
    if (s.element === 'holy' && ['skeleton', 'ghost'].includes(f.type)) raw *= 2;
    if (!s.pierce) raw -= Math.floor(f.def / 4);
    const r = hurt(f, Math.max(1, raw), s.element);
    if (s.element === 'fire') f.burned = true;
    if (s.slow) f.slowed = true;
    f.hp = Math.max(0, f.hp - r.dmg);
    say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, dmg: r.dmg, crit, weak: r.weak, element: s.element, text: `${m.name}'s ${s.name} hits ${f.name} for ${r.dmg}${r.weak ? '. Right where it hurts!' : '.'}${f.hp <= 0 ? ` ${f.name} is beaten.` : ''}` });
    if (s.stun && f.hp > 0 && rnd() < s.stun * (f.guardian ? 0.5 : 1)) { f.asleep = 1; say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, text: `${f.name} is dazed.` }); }
    return r.dmg;
  }
  function spellPower(m, s) {
    const p = passivesOf(m);
    const stat = s.stat ? statOf(m, s.stat) : 0;
    return ((s.base || 6) + stat * 3 + (s.stat === 'wits' ? magicOf(m) - statOf(m, 'wits') : 0) + m.level) * (1 + p.spell);
  }
  function healAmount(m, s) { return roll(rnd, ((s.base || 10) + (s.stat ? statOf(m, s.stat) : statOf(m, 'charm')) * 3 + m.level) * (1 + passivesOf(m).spell)); }
  function sleepRoll(m, f, chance) {
    const resist = f.guardian ? 0.35 : 1;
    return rnd() < clamp(((chance ?? 0.8) + (statOf(m, 'wits') - f.spd) * 0.03) * resist, 0.05, 0.95);
  }
  function cast(m, id, target, scroll) {
    const s = ALL_SKILLS[id];
    const who = scroll ? `${m.name} reads the scroll` : m.name;
    const hitAll = s.kind === 'all' || s.all;
    if ((s.kind === 'hit' || s.kind === 'all') && s.mult) {
      const list = s.kind === 'all' ? alive(b.foes) : [targetFoe(target)].filter(Boolean);
      for (const f of list) for (let n = 0; n < (s.times || 1) && f.hp > 0; n++) {
        const d = strike(m, f, s.mult, 'skill', { skill: id }, s);
        if (d && s.poison) { f.poison = Math.round(s.poison * passivesOf(m).poison); f.poisonLeft = 3; }
        if (d && s.blind) f.blind = (f.blind || 0) + s.blind;
        if (d && s.lifesteal) { const h = Math.min(m.maxHp - m.hp, Math.round(d * s.lifesteal)); m.hp += h; }
      }
      if (s.healAll) for (const p of alive(party)) p.hp = Math.min(p.maxHp, p.hp + s.healAll);
      return;
    }
    if (s.kind === 'hit' || s.kind === 'all') {
      const list = s.kind === 'all' ? alive(b.foes) : [targetFoe(target)].filter(Boolean);
      const power = spellPower(m, s) * (s.kind === 'all' ? 0.75 : 1);
      for (const f of list) for (let n = 0; n < (s.times || 1) && f.hp > 0; n++) spellHit(m, f, s, id, power);
      if (s.buff) b.buff += s.buff;
      return;
    }
    if (s.kind === 'drain') {
      const list = hitAll ? alive(b.foes) : [targetFoe(target)].filter(Boolean);
      for (const f of list) { if (spellHit(m, f, s, id, spellPower(m, s))) { const g = Math.min(m.maxSp - m.sp, s.amount); m.sp += g; say({ who: m.id, side: 'party', act: 'skill', skill: id, target: m.id, text: `${m.name} pulls ${g} spirit out of ${f.name}.` }); } }
      return;
    }
    if (s.kind === 'heal' || s.kind === 'healAll') {
      const list = s.kind === 'healAll' ? alive(party) : s.self ? [m] : [friend(target) || alive(party).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0]];
      for (const p of list) {
        const h = Math.min(p.maxHp - p.hp, healAmount(m, s)); p.hp += h;
        if (s.cleanse) { p.asleep = 0; p.poison = 0; }
        if (s.spirit) p.sp = Math.min(p.maxSp, p.sp + s.spirit);
        say({ who: m.id, side: 'party', act: 'skill', skill: id, target: p.id, heal: h, text: `${who}: ${p.id === m.id ? `${m.name} feels better` : `${p.name} feels better`} (+${h}).` });
      }
      practise(m, 'charm', say);
      return;
    }
    if (s.kind === 'revive' || s.kind === 'reviveAll') {
      const down = s.kind === 'reviveAll' ? party.filter((p) => p.hp <= 0) : [friend(target, true) || party.find((p) => p.hp <= 0)].filter(Boolean);
      if (s.kind === 'reviveAll' && s.amount >= 1) for (const p of alive(party)) p.hp = p.maxHp;
      if (!down.length && s.kind === 'revive') { say({ who: m.id, side: 'party', act: 'skill', skill: id, miss: true, text: `${who}, but nobody needs raising.` }); return; }
      for (const p of down) { p.hp = Math.max(1, Math.ceil(p.maxHp * s.amount)); p.asleep = 0; say({ who: m.id, side: 'party', act: 'skill', skill: id, target: p.id, heal: p.hp, text: `${who}: ${p.name} gets back up!` }); }
      practise(m, 'charm', say);
      return;
    }
    if (s.kind === 'cleanse') { for (const p of alive(party)) { p.asleep = 0; p.poison = 0; } say({ who: m.id, side: 'party', act: 'skill', skill: id, text: `${who}: the party's heads clear.` }); return; }
    if (s.kind === 'buff') { b.buff += s.amount || 4; if (s.ward) b.ward += s.ward; say({ who: m.id, side: 'party', act: 'skill', skill: id, text: `${who}: the party hits harder${s.ward ? ' and stands firmer' : ''}.` }); practise(m, 'charm', say); return; }
    if (s.kind === 'ward') { b.ward += s.amount || 3; say({ who: m.id, side: 'party', act: 'skill', skill: id, text: `${who}: a shimmer settles over the party. They'll take less harm.` }); return; }
    if (s.kind === 'haste') { b.haste += s.amount || 8; if (s.buff) b.buff += s.buff; say({ who: m.id, side: 'party', act: 'skill', skill: id, text: `${who}: the party gets light on their feet.` }); return; }
    if (s.kind === 'blind') {
      const list = hitAll ? alive(b.foes) : [targetFoe(target)].filter(Boolean);
      for (const f of list) { f.blind = (f.blind || 0) + s.amount; say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, text: `${f.name} can't see straight.` }); }
      return;
    }
    if (s.kind === 'cover') { say({ who: m.id, side: 'party', act: 'skill', skill: id, text: `${m.name} stands in front of the others.` }); return; }
    if (s.kind === 'focus') { const g = Math.min(m.maxSp - m.sp, s.amount); m.sp += g; say({ who: m.id, side: 'party', act: 'skill', skill: id, text: `${m.name} breathes slowly (+${g} spirit).` }); return; }
    if (s.kind === 'spirit') {
      const list = s.all ? alive(party) : [friend(target)].filter((p) => p && p !== m);
      if (s.give && !list.length) { say({ who: m.id, side: 'party', act: 'skill', skill: id, miss: true, text: `${m.name} reaches out, but there's nobody to link with.` }); return; }
      for (const p of list) { const g = Math.min(p.maxSp - p.sp, s.amount, s.give ? m.sp : 999); p.sp += g; if (s.give) m.sp -= g; say({ who: m.id, side: 'party', act: 'skill', skill: id, target: p.id, text: `${p.name} gets ${g} spirit.` }); }
      if (s.buff) b.buff += s.buff;
      return;
    }
    if (s.kind === 'sleep' || s.kind === 'stun') {
      const list = hitAll ? alive(b.foes) : [targetFoe(target)].filter(Boolean);
      for (const f of list) {
        if (sleepRoll(m, f, s.chance)) { f.asleep = s.kind === 'sleep' ? 1 + Math.floor(rnd() * 2) : 1; say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, text: s.kind === 'sleep' ? `${f.name} nods off.` : `${f.name} can't move.` }); }
        else say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, miss: true, text: `${f.name} shrugs it off.` });
      }
      return;
    }
    if (s.kind === 'steal') {
      const list = hitAll ? alive(b.foes) : [targetFoe(target)].filter(Boolean);
      for (const f of list) {
        if (f.stolen || rnd() < 0.35 - statOf(m, 'luck') * 0.02) { say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, miss: true, text: `${m.name} comes away with nothing from ${f.name}.` }); continue; }
        f.stolen = true; practise(m, 'luck', say);
        if (rnd() < 0.4) { const item = pick(rnd, ['tonic', 'tonic', 'water', 'antidote', ...(rnd() < 0.2 ? SCROLLS : [])]); j.bag[item] = Math.min(99, (j.bag[item] || 0) + 1); say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, item, text: `${m.name} pinches ${an(ITEMS[item].name)} from ${f.name}.` }); }
        else { const c = between(rnd, f.coinRange || [10, 60]); j.coin += c; say({ who: m.id, side: 'party', act: 'skill', skill: id, target: f.key, coin: c, text: `${m.name} pinches ${fmtCoin(c)} from ${f.name}.` }); }
      }
    }
  }
  function useItem(m, item, target) {
    const it = ITEMS[item];
    if (!it || !(j.bag[item] > 0)) { say({ who: m.id, side: 'party', act: 'item', miss: true, text: `${m.name} rummages, but the bag is out of that.` }); return; }
    if (it.scroll) { j.bag[item]--; say({ who: m.id, side: 'party', act: 'item', item, text: `${m.name} unrolls ${an(it.name)}. The ink burns away as they read.` }); return cast(m, it.spell, target, true); }
    if (it.fire) { const f = targetFoe(target); if (!f) return; j.bag[item]--; const r = hurt(f, it.fire, 'fire'); f.burned = true; f.hp = Math.max(0, f.hp - r.dmg); say({ who: m.id, side: 'party', act: 'item', item, target: f.key, dmg: r.dmg, element: 'fire', text: `${m.name} throws an Ember jar at ${f.name}: ${r.dmg} fire.${f.hp <= 0 ? ` ${f.name} is beaten.` : ''}` }); return; }
    const res = drinkOn(j, item, target || m.id, m);
    say({ who: m.id, side: 'party', act: 'item', item, target: res.target, heal: res.heal, miss: !res.ok, text: res.text });
  }
  function allyTurn(a) {
    const f = pick(rnd, alive(b.foes)); if (!f) return;
    if (rnd() > hitChance(a.acc, f.eva)) { say({ who: a.key, side: 'ally', act: 'fight', target: f.key, miss: true, text: `${a.name} swings at ${f.name} and misses.` }); return; }
    const dmg = Math.max(1, roll(rnd, a.atk) - Math.floor(f.def / 2));
    f.hp = Math.max(0, f.hp - dmg);
    say({ who: a.key, side: 'ally', act: 'fight', target: f.key, dmg, weapon: kitBase(a.kit.weapon), text: `${a.name} joins in and hits ${f.name} for ${dmg}.${f.hp <= 0 ? ` ${f.name} is beaten.` : ''}` });
  }
  function foeTurn(f) {
    if (f.asleep) { f.asleep--; say({ who: f.key, side: 'foe', act: 'sleep', text: `${f.name} can't move.` }); return; }
    if (f.flees && f.hp < f.maxHp * 0.3 && rnd() < 0.35 && !b.spar) { f.hp = 0; f.fled = true; say({ who: f.key, side: 'foe', act: 'flee', text: `${f.name} runs off${f.person ? ', shouting for help' : ' squealing'}.` }); return; }
    const live = [...alive(party), ...alive(b.allies || [])];
    if (f.heals && rnd() < 0.3) { const hurtOne = alive(b.foes).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0]; if (hurtOne && hurtOne.hp < hurtOne.maxHp * 0.6) { const h = Math.min(hurtOne.maxHp - hurtOne.hp, 20 + f.atk); hurtOne.hp += h; say({ who: f.key, side: 'foe', act: 'heal', target: hurtOne.key, heal: h, text: `${f.name} heals ${hurtOne === f ? 'their own wounds' : hurtOne.name} (+${h}).` }); return; } }
    if (f.breath && b.round % 3 === 0) {
      say({ who: f.key, side: 'foe', act: 'breath', text: `${f.name} breathes ${f.tint === 'sand' ? 'a storm of sand' : 'fire'}!` });
      for (const p of live) takeHit(f, p, Math.round(f.atk * 0.7), 'breath');
      return;
    }
    if (f.chant && !f.charged && rnd() < 0.4) { f.charged = true; say({ who: f.key, side: 'foe', act: 'chant', text: `${f.name} starts a low chant. Something is coming.` }); return; }
    if (f.steals && rnd() < 0.25 && j.coin > 0) { const c = Math.min(j.coin, between(rnd, [200, 1500])); j.coin -= c; say({ who: f.key, side: 'foe', act: 'steal', text: `${f.name} lifts ${fmtCoin(c)} off you with a grin.` }); return; }
    let p = rnd() < 0.4 ? [...live].sort((a, c) => a.hp - c.hp)[0] : pick(rnd, live);
    const cover = covering.find((c) => c.hp > 0 && c.id !== p.id && !p.ally);
    if (cover) p = cover;
    const atk = f.charged ? f.atk * 2 : f.atk;
    f.charged = false;
    if (f.magic && rnd() < 0.35) return takeHit(f, p, Math.round(atk * 1.2), 'spell', true);
    takeHit(f, p, atk, f.chant && atk > f.atk ? 'curse' : 'hit');
    if (f.web && p.hp > 0 && rnd() < 0.25) { p.asleep = 1; say({ who: f.key, side: 'foe', act: 'web', target: p.id || p.key, text: `${p.name} is caught in a web.` }); }
    if (f.drain && p.sp > 0) { const d = Math.min(p.sp, 3); p.sp -= d; say({ who: f.key, side: 'foe', act: 'drain', target: p.id, text: `The cold touch drains ${d} spirit from ${p.name}.` }); }
  }
  function takeHit(f, p, atk, act, spell = false) {
    const ally = Boolean(p.ally);
    const eva = ally ? p.eva : evasionOf(p) + b.haste;
    const chance = hitChance(f.acc - (f.blind || 0), spell ? eva / 2 : eva);
    if (rnd() > chance) { if (!ally) practise(p, 'luck', say); say({ who: f.key, side: 'foe', act, target: ally ? p.key : p.id, miss: true, text: `${p.name} dodges ${f.name}.` }); return; }
    let dmg = roll(rnd, atk) - Math.floor((ally ? p.def : guardOf(p) + b.ward) * 1.2);
    if (!ally && (defending.has(p.id) || covering.includes(p))) dmg = Math.floor(dmg / 2);
    dmg = Math.max(1, dmg);
    p.hp = Math.max(0, p.hp - dmg);
    say({ who: f.key, side: 'foe', act, target: ally ? p.key : p.id, dmg, element: spell ? 'mind' : undefined, text: `${f.name} hits ${p.name} for ${dmg}.${p.hp <= 0 ? ` ${p.name} falls!` : ''}` });
  }
  function win() {
    const beaten = b.foes.filter((f) => !f.fled);
    const xp = beaten.reduce((n, f) => n + f.xp, 0);
    const bonus = Math.max(...party.map((m) => passivesOf(m).coin));
    const coin = b.spar ? 0 : Math.round(beaten.reduce((n, f) => n + between(rnd, f.coinRange || [0, 0]), 0) * (1 + bonus));
    j.coin += coin;
    b.reward = { xp: b.spar ? Math.round(xp / 2) : xp, coin, ups: [], drops: [], items: [] };
    for (const m of party) {
      if (m.hp <= 0) continue; // you have to be standing at the end to learn from it
      m.xp += b.reward.xp;
      while (m.xp >= xpFor(m.level)) { m.xp -= xpFor(m.level); b.reward.ups.push(levelUp(m)); }
    }
    if (!b.spar) {
      for (const f of beaten) for (const d of dropsOf(f, rnd)) { if (d.kit) gainKit(j, d.kit); else j.bag[d.item] = Math.min(99, (j.bag[d.item] || 0) + 1); b.reward[d.kit ? 'drops' : 'items'].push(d.kit || d.item); }
      for (const f of beaten) if (f.guardian && !j.beaten.includes(f.id)) j.beaten.push(f.id);
      for (const f of beaten) if (f.person && !j.felled.includes(f.person.id)) j.felled.push(f.person.id);
      if (LANTERN_KEEPERS.every((g) => j.beaten.includes(g))) j.won = true;
    }
    for (const m of party) { m.asleep = 0; m.poison = 0; m.blind = 0; }
  }
}
// What a beaten foe leaves: what they were using (people and armed creatures), a random item or scroll, and a
// boss's own prize.
export function dropsOf(f, rnd = Math.random) {
  const out = [];
  if (f.kit) {
    const chance = { weapon: 0.6, armour: 0.4, shield: 0.4 };
    for (const k of ['weapon', 'armour', 'shield']) {
      const v = f.kit[k];
      if (!v || v === 'none' || rnd() > chance[k]) continue;
      const worn = f.person ? (rnd() < 0.25 ? 'rusty' : rnd() < 0.15 ? 'fine' : '') : (rnd() < 0.4 ? 'rusty' : '');
      out.push({ kit: worn ? `${v}~${worn}` : v });
    }
  }
  if (f.drop) out.push({ kit: f.drop });
  if (f.scroll) out.push({ item: f.scroll });
  if (rnd() < (f.guardian ? 1 : 0.3)) out.push({ item: rnd() < (f.guardian ? 0.6 : 0.15) ? pick(rnd, SCROLLS) : pick(rnd, ['tonic', 'tonic', 'bigtonic', 'water', 'antidote', 'ember', 'salts']) });
  if (rnd() < (f.guardian ? 0.5 : 0.04)) { const base = pick(rnd, Object.keys(KIT_PRICES)), af = pick(rnd, ['fine', 'keen', 'light', 'sturdy', 'swift', 'blessed', 'arcane', 'mighty', 'heavy', 'cursed']); const key = `${base}~${af}`; if (kitKind(key) && (!AFFIXES[af].only || AFFIXES[af].only.includes(kitKind(key)))) out.push({ kit: key }); }
  return out;
}
export function gainKit(j, key) { const k = kitKind(key); if (k && !j.owned[k].includes(key)) j.owned[k].push(key); return k; }

// Drinking or using something from the bag, in a fight or on the road.
export function drinkOn(j, item, targetId, by) {
  const it = ITEMS[item];
  const p = j.party.find((q) => q.id === targetId) || by || j.party[0];
  if (!it || !(j.bag[item] > 0)) return { ok: false, text: 'The bag is out of that.' };
  if (it.revive) {
    if (p.hp > 0) return { ok: false, target: p.id, text: `${p.name} is already up.` };
    j.bag[item]--; p.hp = Math.ceil(p.maxHp * it.revive); return { ok: true, target: p.id, heal: p.hp, text: `The salts do their work. ${p.name} is back up!` };
  }
  if (p.hp <= 0) return { ok: false, target: p.id, text: `${p.name} needs Waking salts or Raise first.` };
  if (it.cleanse) { j.bag[item]--; p.asleep = 0; p.poison = 0; p.blind = 0; return { ok: true, target: p.id, text: `${p.name} chews the Clearroot. Their head clears.` }; }
  if (it.heal && p.hp >= p.maxHp) return { ok: false, target: p.id, text: `${p.name} is already fine.` };
  j.bag[item]--;
  if (it.heal) { const h = Math.min(p.maxHp - p.hp, it.heal); p.hp += h; return { ok: true, target: p.id, heal: h, text: `${p.name} drinks ${an(it.name)} (+${h}).` }; }
  if (it.spirit) { const h = Math.min(p.maxSp - p.sp, it.spirit); p.sp += h; return { ok: true, target: p.id, text: `${p.name} drinks the Bright water (+${h} spirit).` }; }
  return { ok: true, target: p.id, text: 'Nothing much happens.' };
}

// Magic on the road: the spells marked "works on the road too", cast from the menu while walking, and scrolls.
export const fieldSkills = (m) => knownSkills(m).filter((id) => ALL_SKILLS[id]?.field);
export function castField(j, casterId, id, targetId, rnd = Math.random) {
  const m = j.party.find((p) => p.id === casterId);
  const fromScroll = ITEMS[id]?.scroll;
  const sid = fromScroll ? ITEMS[id].spell : id;
  const s = ALL_SKILLS[sid];
  if (!m || !s || !s.field) return { ok: false, text: 'That only works in a fight.' };
  if (fromScroll) { if (!(j.bag[id] > 0)) return { ok: false, text: 'The bag is out of that.' }; }
  else {
    if (!knownSkills(m).includes(sid)) return { ok: false, text: `${m.name} doesn't know that.` };
    if (m.sp < costOf(m, sid)) return { ok: false, text: `${m.name} hasn't the spirit for it.` };
  }
  const b = { field: true, foes: [], allies: [], round: 0, buff: 0, ward: 0, haste: 0, over: '', log: [] };
  // A one-turn "round" with no foes and only the caster acting: the same rules as in a fight.
  const before = j.party.map((p) => [p.hp, p.sp]);
  const cmd = { [m.id]: fromScroll ? { act: 'item', item: id, target: targetId } : { act: 'skill', skill: sid, target: targetId } };
  if (m.hp <= 0) return { ok: false, text: `${m.name} is down. Someone else will have to do it.` };
  const ev = playRound(j, b, cmd, rnd);
  const changed = j.party.some((p, i) => p.hp !== before[i][0] || p.sp !== before[i][1]);
  const text = ev.filter((e) => e.side === 'party' && e.who === m.id).map((e) => e.text).join(' ');
  return { ok: changed || fromScroll, text: text || 'Nothing to mend.', events: ev };
}

// A level up: more health and spirit, a skill point, and every other level one point on the class's best stat.
export function levelUp(m) {
  m.level++;
  m.points++;
  let stat = '';
  if (m.level % 2 === 0) {
    const best = Object.entries(CLASSES[m.cls].stats).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    stat = best.find((k) => m.stats[k] < 9) || '';
    if (stat) m.stats[stat]++;
  }
  const hpWas = m.maxHp, spWas = m.maxSp;
  refresh(m);
  m.hp = m.maxHp; m.sp = m.maxSp;
  const newClass = m.level === SECOND_CLASS_LEVEL && m.classes.length === 1 ? 'second' : m.level === THIRD_CLASS_LEVEL && m.classes.length === 2 ? 'third' : '';
  return { id: m.id, name: m.name, level: m.level, hp: m.maxHp - hpWas, sp: m.maxSp - spWas, stat, point: true, newClass };
}

// ---------- Training ----------
// Three ways to get better beyond levels: practice (above, in fights), a trainer in a town or castle (coin, one
// point at a time, dearer as the stat grows), and sparring with the castle's captain (a fight where nobody gets
// hurt for good, for half the experience). The hermit teaches one thing for free, once.
export const TRAINABLE = ['might', 'wits', 'charm', 'luck', 'acc', 'eva'];
export function trainPrice(m, stat) {
  if (stat === 'acc' || stat === 'eva') return 400 * (m.trained[stat] + 1) ** 2;
  return 150 * m.stats[stat] * m.stats[stat];
}
export function canTrain(j, m, stat, haggle = 0) {
  if (!TRAINABLE.includes(stat)) return 'Nothing to train there.';
  if (stat === 'acc' || stat === 'eva') { if (m.trained[stat] >= 20) return 'Nothing more anyone can teach.'; }
  else if (m.stats[stat] >= STAT_CAP) return `${STAT_NAMES[stat]} ${STAT_CAP} is as far as training goes.`;
  if (j.coin < Math.round(trainPrice(m, stat) * (1 - haggle))) return 'Not enough coin.';
  return '';
}
export function train(j, memberId, stat) {
  const m = j.party.find((p) => p.id === memberId); if (!m) return { ok: false, text: 'Who?' };
  const haggle = Math.max(...j.party.map((p) => passivesOf(p).haggle));
  const why = canTrain(j, m, stat, haggle); if (why) return { ok: false, text: why };
  const price = Math.round(trainPrice(m, stat) * (1 - haggle));
  j.coin -= price;
  if (stat === 'acc' || stat === 'eva') m.trained[stat] += 2; else m.stats[stat]++;
  refresh(m);
  return { ok: true, price, text: `${m.name} trains hard. ${STAT_NAMES[stat]} goes up${stat === 'acc' || stat === 'eva' ? ` (+2)` : ` to ${m.stats[stat]}`}. That cost ${fmtCoin(price)}.` };
}
export function hermitTeach(j, memberId, stat) {
  const m = j.party.find((p) => p.id === memberId);
  if (!m || !STATS.includes(stat)) return { ok: false, text: 'The hermit shrugs.' };
  if (m.taught.includes('hermit')) return { ok: false, text: '"I\'ve taught you all I know. Mostly about mushrooms."' };
  if (m.stats[stat] >= STAT_CAP) return { ok: false, text: '"You have more of that than I do."' };
  m.taught.push('hermit'); m.stats[stat]++; refresh(m);
  return { ok: true, text: `The hermit talks for a long time. ${m.name}'s ${STAT_NAMES[stat]} goes up to ${m.stats[stat]}.` };
}

// ---------- Picking a fight with someone ----------
// Anyone can be fought (except Bob and his cat). Guards close by join in, and the place remembers: the guards come
// for you, and nobody will sell you anything, until you've been gone a good while or paid the fine to a guard.
export function attackPerson(world, j, p) {
  if (PEACEFUL[p.role]) return { refused: PEACEFUL[p.role] };
  const map = mapOf(world, j);
  const key = siteKey(map);
  const isLaw = (q) => ['guard', 'captain', 'knight'].includes(q.role);
  const helpers = peopleOn(world, j, map).filter((q) => q !== p && isLaw(q) && near(q, p, p.role === 'ruler' ? 14 : 6)).slice(0, p.role === 'ruler' ? 3 : 2);
  j.wanted[key] = Math.max(j.wanted[key] || 0, p.role === 'ruler' ? 400 : isLaw(p) ? 250 : 180);
  const specs = [{ person: p }, ...helpers.map((q) => ({ person: q }))];
  return { battle: specs, site: key, zone: map.zone || zoneAt(world, j) };
}
export const fineFor = (world, j, key) => { const s = world.sites.find((x) => x.id === key); return ({ hamlet: 2000, village: 3000, town: 6000, castle: 15000 }[s?.kind] || 5000) * (1 + Math.min(4, j.fines)); };
export function payFine(world, j, key) {
  const price = fineFor(world, j, key);
  if (!j.wanted[key]) return { ok: false, text: '"You\'re not in any trouble. Yet."' };
  if (j.coin < price) return { ok: false, text: `"The fine is ${fmtCoin(price)}. Come back when you have it. Or don't, and we'll come to you."` };
  j.coin -= price; delete j.wanted[key]; j.fines++;
  return { ok: true, text: `You pay ${fmtCoin(price)}. "Behave yourself."` };
}
export const isWanted = (world, j) => j.wanted[siteKey(mapOf(world, j))] > 0;

// After a lost fight: carried back to Bob's Inn, everyone up, half the coin gone. Nothing else is lost.
export function wakeAtInn(world, j) {
  const inn = world.map('inn');
  j.at = 'inn'; j.x = inn.start.x; j.y = inn.start.y - 6; j.facing = 'down';
  j.coin = Math.floor(j.coin / 2);
  for (const m of j.party) { m.hp = m.maxHp; m.sp = m.maxSp; m.asleep = 0; }
  j.danger = 0;
}
export const INN_PRICE = 30;
export function rest(j, price = INN_PRICE) {
  if (j.coin < price) return false;
  j.coin -= price;
  for (const m of j.party) { m.hp = m.maxHp; m.sp = m.maxSp; m.asleep = 0; }
  return true;
}
export function priceOf(j, what) {
  const haggle = Math.max(0, ...j.party.map((p) => passivesOf(p).haggle));
  return Math.round((ITEMS[what] ? ITEMS[what].price : kitPrice(what)) * (1 - haggle));
}
export function buy(j, what) {
  const price = priceOf(j, what);
  if (ITEMS[what]) { if (j.coin < price) return false; j.coin -= price; j.bag[what] = Math.min(99, (j.bag[what] || 0) + 1); return true; }
  const kind = kitKind(what);
  if (!kind || j.owned[kind].includes(what) || j.coin < price) return false;
  j.coin -= price; j.owned[kind].push(what); return true;
}
// Selling kit the party isn't wearing, for a third of its price.
export function sell(j, key) {
  const kind = kitKind(key);
  if (!kind || !j.owned[kind].includes(key) || j.party.some((m) => m[kind] === key)) return 0;
  const price = Math.max(1, Math.round(kitPrice(key) / 3));
  j.owned[kind] = j.owned[kind].filter((k) => k !== key); j.coin += price;
  return price;
}

// Opening a chest: what was inside, in words, and it goes in the bag (or the kit, for the paper doll). Chests in
// caves and dungeons are the good ones: fine kit, strong tonics, scrolls and real coin.
export function chestLoot(loot, rnd) {
  if (loot === 'gift') return [{ kit: 'staff~blessed' }, { item: 'scroll_raise' }, { coin: 2000 }];
  if (loot === 'hoard') return [{ coin: COIN.platinum + Math.floor(rnd() * 5) * COIN.gold }, { kit: 'sword~mighty' }, { item: 'scroll_raise' }];
  const [kind, z] = String(loot).split(':');
  if (kind === 'deep') {
    const zone = Number(z) || 1;
    const out = [{ coin: Math.round((300 + rnd() * 700) * zone * zone) }];
    const base = pick(rnd, Object.keys(KIT_PRICES));
    const good = pick(rnd, ['fine', 'keen', 'light', 'sturdy', 'swift', 'blessed', 'arcane', 'mighty']);
    const key = AFFIXES[good].only && !AFFIXES[good].only.includes(kitKind(base)) ? `${base}~fine` : `${base}~${good}`;
    if (rnd() < 0.7) out.push({ kit: key });
    out.push({ item: rnd() < 0.45 ? pick(rnd, SCROLLS) : pick(rnd, ['bigtonic', 'bigtonic', 'salts', 'water']) });
    return out;
  }
  if (kind === 'kit') return [{ kit: z }];
  if (kind === 'coin') return [{ coin: Number(z) || 0 }];
  return ITEMS[loot] ? [{ item: loot }] : [{ coin: 100 }];
}
export function openChest(world, j, chest) {
  const key = `${j.at}:${chest.id}`;
  if (j.opened.includes(key)) return { already: true, text: 'Empty. Someone got here first. You, in fact.' };
  j.opened.push(key);
  const rnd = seeded(`${world.seed}:${key}`);
  const got = chestLoot(chest.loot, rnd);
  const words = [];
  for (const g of got) {
    if (g.coin) { j.coin += g.coin; words.push(fmtCoin(g.coin)); }
    if (g.kit) { gainKit(j, g.kit); words.push(`${an(kitName(g.kit).toLowerCase())} (${kitWords(g.kit)})`); }
    if (g.item) { j.bag[g.item] = Math.min(99, (j.bag[g.item] || 0) + 1); words.push(an(ITEMS[g.item].name)); }
  }
  return { text: `Inside: ${words.join(', ')}!${got.some((g) => g.kit) ? ' Put it on in Kit.' : ''}`, got };
}
const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;

// Kit on the paper doll: only what the party owns. Returns false when it isn't owned.
export function equip(j, memberId, kind, key) {
  const m = j.party.find((p) => p.id === memberId);
  if (!m || !KIT_TABLE[kind]) return false;
  if (key !== 'none' && (kitKind(key) !== kind || !j.owned[kind].includes(key))) return false;
  m[kind] = key;
  refresh(m);
  return true;
}

// ---------- What people say ----------
export const FOLK_LINES = [
  'Stay on the roads if you want a quiet walk. Long grass is where the trouble lives, and the patrols keep to the roads.',
  'Caves have the best chests. Something always guards the best chest, mind.',
  'Rest at an inn. A few coppers and you wake up feeling like a new person. Or at least a tidier one.',
  'If you fall in a fight, somebody will carry you back to Bob\'s Inn. It costs half your coin. Pride is free.',
  'The trainer in town will make you stronger, for a price. Everything is for a price.',
  'Copper, silver, gold, platinum. A hundred coppers to the silver. I have never seen a platinum. I\'m not sure they\'re real.',
  'There\'s a hermit out past everything. They say the hermit knows things. They say a lot of things.',
  'Scrolls? Anyone can read one, once. Then the ink burns off and it\'s just paper.',
  'Pick a fight in town and the guards will come for you. Pay the fine to a guard, or stay away a long while.'
];
export const ROLE_LINES = {
  guard: ['Move along. Nothing to see.', 'Keep your blade sheathed inside the walls.', 'Quiet day. I like quiet days.'],
  knight: ['For the crown.', 'The Queen rides out at dawn. Probably.', 'You look like you\'ve walked a long way.'],
  captain: ['I train the guard. If you want a bout, I\'ll spar with you. No hard feelings either way.'],
  trainer: ['Coin and sweat. That\'s all it takes.'],
  smith: ['Good steel lasts. Bad steel rusts. I only sell the first kind.'],
  priest: ['The temple mends what it can. Fallen friends too, for an offering.'],
  bard: ['A song for a copper? No? A song anyway.'],
  peddler: ['Bits and bobs! Tonics and scrolls! Mostly tonics.'],
  hermit: ['Visitors. Hm. Sit. Mind the mushrooms.']
};
// What the King and Queen (or Bob, at the inn) say, as the story moves on. Names the dungeons and which way they lie.
export function questLine(world, j) {
  const n = LANTERN_KEEPERS.filter((g) => j.beaten.includes(g)).length;
  if (j.won) return 'All three lanterns burn again. The land owes you a debt it will never stop talking about. Stay as long as you like; there are bosses and chests out there yet.';
  const left = LANTERN_KEEPERS.filter((g) => !j.beaten.includes(g)).map((g) => {
    const s = world.sites.find((x) => x.keeper === g);
    return s ? `${GUARDIANS[g].name} in ${s.name}, to the ${direction(world.start, s)}` : GUARDIANS[g].name;
  });
  if (n === 0) return `Three keepers took the lantern stones: ${left.join('; ')}. Bring the stones home. The roads lead most of the way.`;
  if (n === 1) return `One lantern burns again! Two to go: ${left.join('; ')}.`;
  return `Two lanterns lit. The last is with ${left[0]}. Rest first. Then rest again.`;
}
export const elderLine = questLine;
export function direction(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ns = dy < -Math.abs(dx) / 2 ? 'north' : dy > Math.abs(dx) / 2 ? 'south' : '';
  const ew = dx > Math.abs(dy) / 2 ? 'east' : dx < -Math.abs(dy) / 2 ? 'west' : '';
  return `${ns}${ew}` || 'north';
}
