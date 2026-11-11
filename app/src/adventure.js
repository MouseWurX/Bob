// 🎲 Adventure (1.5.117): Bob runs a tabletop role-playing game as the game master, for the owner and a party of
// Bobs. Nothing loads until "Start a new game" is pressed; the game master brain is let go when the game ends or
// pauses, the same as after any big job.
//
// The house rules (the owner's, 2026-11-05):
//   - the biggest brain is the game master (Deep thinking if one is picked, else the main Brain, thinking on);
//   - the party is the owner plus Bob players: other Bobs on Bob-Net play themselves through the lend protocol that
//     already exists, and the game master brain plays any local Bob in his own voice. Everyone has a turn of their own;
//   - long travel is skipped (one montage line), so play is combat, conversations, points of interest and choices;
//   - every action is auto-rolled: d20 + a stat, 15 or more is a hit, 10-14 a hit with a cost, under 10 a miss;
//   - action cards are for the owner only, to save typing; Bob players just decide. After a card the owner may add
//     a line of flair, which the game master weaves in (and rewards with +2 when it's good);
//   - loose rules for fun: four stats, hearts not hit points, no inventory, no spell slots, no initiative;
//   - plot armour is asked per character at the start of every game.
// A campaign is saved in its own file (adventures/<id>.json in Bob's data folder), never as a chat.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { currentSession } from './sessions.js';
import { copyName } from './clan.js';
import { saveSettings } from './config.js';
import { sameModel } from './brain-mode.js';
import { LOOK_ID_RE } from './look.js';
import { capabilities } from './capabilities.js';
import { ENEMIES, enemyLine, meet, listMet, forgetMet, kindOf, lookFor, enemyById } from './bestiary.js';

export const STATS = { might: 'Might', wits: 'Wits', charm: 'Charm', luck: 'Luck' };
export const STAT_IDS = Object.keys(STATS);
export const STAT_POINTS = 12; // to spread over the four stats, 1-5 each
export const HEARTS = 5;
// 1.5.204: characters grow. A reward can raise a stat (1-5) or add a heart, up to MAX_HEARTS; once a stat is at 5,
// a stat reward becomes an extra heart instead.
export const MAX_HEARTS = 8;
export const FOE_HEARTS = 12; // the most hearts the app keeps for one enemy (a boss)
// Humans at the table: the owner, and (1.5.204) friends who play their turns on a phone or on this screen.
export const isHuman = (c) => c?.who === 'you' || c?.who === 'friend';
// Each class brings a light spell list and the attacks its kit allows (the second card under Magic and Attack).
export const CLASSES = {
  fighter: { name: 'Fighter', stats: { might: 5, wits: 2, charm: 2, luck: 3 }, item: 'a dented but faithful sword', trick: 'Never backs down', attacks: ['One-handed, shield up', 'Two-handed, all in', 'Thrown blade', 'Shove or grapple'], spells: [] },
  rogue: { name: 'Rogue', stats: { might: 2, wits: 4, charm: 3, luck: 3 }, item: 'a set of picks that have opened stranger locks', trick: 'Always has an exit', attacks: ['Dagger, one-handed', 'Sneak attack from behind', 'Thrown knives', 'Trip or tangle'], spells: [] },
  wizard: { name: 'Wizard', stats: { might: 1, wits: 5, charm: 2, luck: 4 }, item: 'a staff that hums when it rains', trick: 'Knows one word for everything', attacks: ['Staff, two-handed', 'Thrown vial'], spells: ['Firebolt', 'Shield of air', 'Sleep', 'Light', 'Whisper of the dead', 'Slow fall'] },
  cleric: { name: 'Cleric', stats: { might: 3, wits: 3, charm: 4, luck: 2 }, item: 'a holy symbol with a chip in it', trick: 'Patches people up', attacks: ['Mace, one-handed', 'Mace, two-handed', 'Sling'], spells: ['Mend wounds', 'Bless', 'Turn the unquiet', 'Guiding light', 'Calm'] },
  ranger: { name: 'Ranger', stats: { might: 3, wits: 4, charm: 1, luck: 4 }, item: 'a bow and an opinion about the weather', trick: 'Reads tracks and moods', attacks: ['Bow, ranged', 'Twin blades', 'Hunting knife', 'Set a snare'], spells: ['Speak with beasts', 'Hunter\'s mark', 'Thorn whip'] },
  bard: { name: 'Bard', stats: { might: 1, wits: 3, charm: 5, luck: 3 }, item: 'a lute, slightly out of tune on purpose', trick: 'Talks their way in, and out', attacks: ['Rapier, one-handed', 'Thrown lute (last resort)', 'A cutting remark'], spells: ['Vicious mockery', 'Charm', 'Inspire', 'Distracting tune', 'Mend'] }
};
export const CLASS_IDS = Object.keys(CLASSES);

// Plot armour, asked per character at the start of every game.
export const ARMOUR = {
  none: { name: 'None', what: 'The dice decide. A bad run can kill the character.' },
  some: { name: 'Some', what: 'One bad roll a scene is rolled again.' },
  lots: { name: 'Lots', what: "Can't die. A terrible roll still costs something: an item, a scar, a grudge." },
  legendary: { name: 'Legendary', what: 'Nothing worse than a close call, ever.' }
};
export const ARMOUR_IDS = Object.keys(ARMOUR);
export const DEFAULT_ARMOUR = 'some';

export const SETTINGS = {
  fantasy: { name: 'Classic fantasy', hint: 'Taverns, dungeons, a dragon somewhere.' },
  space: { name: 'Space', hint: 'A battered ship, strange stations, a crew with debts.' },
  spooky: { name: 'Spooky', hint: 'A fog-bound town, a manor, things that knock.' },
  pick: { name: 'Pick for me', hint: 'The game master chooses.' }
};
// 1.5.204 Ready-made starts: a story idea for one evening, picked on the start card (or "Make one up").
export const STARTS = {
  miller: { setting: 'fantasy', name: "The miller's daughter", hook: "A village miller's daughter vanished on the night the mill wheel turned backwards." },
  invoice: { setting: 'fantasy', name: 'The dragon sends a bill', hook: "A dragon has sent the town a bill. The town is fairly sure it doesn't owe one." },
  market: { setting: 'fantasy', name: 'The market under the hill', hook: 'Once a year the goblins open a market under the hill. This year someone stole the market.' },
  freighter: { setting: 'space', name: 'The quiet freighter', hook: 'A freighter drifts into your lane with every light on, and nobody answers the hail.' },
  vault: { setting: 'space', name: 'The station job', hook: "The richest man on the station keeps one thing in his safe. The party has been hired to borrow it." },
  manor: { setting: 'spooky', name: 'One night in the manor', hook: 'An aunt nobody remembers left the party her manor, on one condition: spend a night in it.' },
  train: { setting: 'spooky', name: 'The last train', hook: "The midnight train stops at a station that isn't on any map." },
  lighthouse: { setting: 'spooky', name: 'The inland light', hook: 'Every night the lighthouse turns its beam inland, toward the woods.' }
};
export const START_IDS = Object.keys(STARTS);

// 1.5.204 Table extras, ticked on the start card for each game (all off until ticked; the last choice is remembered).
// dice and voice happen in the window; sounds are the window's own unless the PC made a set; pictures and music are
// made on this replicant matrix before the game master loads ("Setting the table"), with the graphics card.
export const EXTRAS = {
  dice: 'Roll the dice on screen',
  sounds: 'Sound effects',
  voice: 'Read the story aloud',
  pictures: 'Pictures behind the story',
  scenePics: 'A new picture for every scene',
  music: 'Music'
};
export const EXTRA_IDS = Object.keys(EXTRAS);
export function cleanExtras(x = {}) { const out = {}; for (const id of EXTRA_IDS) out[id] = x?.[id] === true; if (!out.pictures) out.scenePics = false; return out; }

export const PACES = { short: { name: 'Short', scenes: 3, what: 'three scenes' }, evening: { name: 'Evening', scenes: 6, what: 'six scenes' }, campaign: { name: 'Campaign', scenes: 0, what: 'as many as you like, saved between sittings' } };

// The owner's action cards. Each rolls one stat. Bob players never see cards; they just say what they do.
// then: some cards open a second card (with a Back button): Attack lists the attacks the character's kit allows, Magic
// the spells, Use item the inventory, Talk who's here, Run the ways out. The second card's choices come from the sheet
// or from what the game master said last (secondCard below).
export const CARDS = {
  attack: { icon: '⚔', name: 'Attack', stat: 'might', fight: true, then: 'attacks', ask: 'How?' },
  defend: { icon: '🛡', name: 'Defend', stat: 'might', fight: true },
  sneak: { icon: '🤫', name: 'Sneak', stat: 'wits' },
  talk: { icon: '💬', name: 'Talk', stat: 'charm', then: 'here', ask: 'To whom?' },
  magic: { icon: '✨', name: 'Magic', stat: 'wits', then: 'spells', ask: 'Which spell?' },
  item: { icon: '🎒', name: 'Use item', stat: 'luck', then: 'items', ask: 'Which one?' },
  look: { icon: '🔍', name: 'Look closer', stat: 'wits' },
  help: { icon: '🤝', name: 'Help an ally', stat: 'charm', then: 'allies', ask: 'Whom?' },
  run: { icon: '🏃', name: 'Run', stat: 'luck', then: 'exits', ask: 'Which way?' },
  other: { icon: '✍', name: 'Something else', stat: 'luck' }
};
// The choices on a card's second card, for one character in the game as it stands. Always ends with a free choice.
export function secondCard(card, sheet, game) {
  const c = CARDS[card];
  if (!c?.then) return null;
  let list = [];
  if (c.then === 'attacks') list = [...(sheet.attacks || []), 'Unarmed'];
  else if (c.then === 'spells') list = sheet.spells?.length ? sheet.spells : ['A trick, not a spell (no magic in this kit)'];
  else if (c.then === 'items') list = sheet.items || [];
  else if (c.then === 'here') list = game?.here || [];
  else if (c.then === 'exits') list = game?.exits || [];
  else if (c.then === 'allies') list = (game?.party || []).filter((x) => x.id !== sheet.id && !x.out).map((x) => x.name);
  return { card, ask: c.ask, choices: [...new Set(list.map((x) => clip(x, 60)).filter(Boolean))].slice(0, 12), free: c.then === 'spells' ? 'Try something new' : c.then === 'items' ? 'Something I picked up' : 'Something else' };
}
export const CARD_IDS = Object.keys(CARDS);
export const DEFAULT_CARDS = { fight: ['attack', 'defend', 'magic', 'item', 'help', 'run', 'other'], talk: ['talk', 'look', 'sneak', 'magic', 'item', 'other'], place: ['look', 'sneak', 'talk', 'magic', 'item', 'other'], choice: ['talk', 'look', 'sneak', 'run', 'other'] };
export const SCENE_KINDS = ['fight', 'talk', 'place', 'choice', 'montage', 'end'];

export const HIT = 15, COST = 10;
export const FLAIR_BONUS = 2;
export const LEGENDARY_FLOOR = 12, LOTS_FLOOR = 8;

// ---------- The dice ----------
export const d20 = (rnd = Math.random) => 1 + Math.floor(rnd() * 20);
export const outcomeOf = (total) => (total >= HIT ? 'hit' : total >= COST ? 'cost' : 'miss');
export const OUTCOME_WORDS = { hit: 'a hit', cost: 'a hit, at a cost', miss: 'a miss' };

// One roll for one action, with plot armour applied. rerollUsed: this character already used their "Some" reroll this scene.
// Returns { die, stat, bonus, total, outcome, rerolled, floored, natural }. natural: the die as it came up first.
export function rollAction({ stat = 1, bonus = 0, armour = DEFAULT_ARMOUR, rerollUsed = false, rnd = Math.random } = {}) {
  let die = d20(rnd);
  const natural = die;
  let rerolled = false;
  if (armour === 'some' && !rerollUsed && die + stat + bonus < COST) { die = d20(rnd); rerolled = true; }
  let total = die + stat + bonus, floored = false;
  if (armour === 'lots' && total < LOTS_FLOOR) { total = LOTS_FLOOR; floored = true; }
  if (armour === 'legendary' && total < LEGENDARY_FLOOR) { total = LEGENDARY_FLOOR; floored = true; }
  return { die, natural, stat, bonus, total, outcome: outcomeOf(total), rerolled, floored };
}

// Hearts lost on a roll in a fight: a miss costs one, a natural 1 two, a hit none. With Lots or Legendary armour the last
// heart never goes; with None or Some it can.
export function heartsLost(roll, { fight = true, armour = DEFAULT_ARMOUR, hearts = HEARTS } = {}) {
  if (!fight || roll.outcome === 'hit') return 0;
  let lose = roll.outcome === 'miss' ? (roll.natural === 1 ? 2 : 1) : 0;
  if (roll.outcome === 'cost' && roll.natural === 1) lose = 1;
  if (['lots', 'legendary'].includes(armour)) lose = Math.min(lose, Math.max(0, hearts - 1));
  return Math.min(lose, hearts);
}

// Flair earns +2 when it is more than a word or two (the game master decides whether it was clever; the app only
// checks that the owner wrote something with a little effort in it).
export const flairBonus = (flair) => (String(flair || '').trim().split(/\s+/).filter(Boolean).length >= 4 ? FLAIR_BONUS : 0);

// ---------- Character sheets ----------
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
export function cleanStats(stats, cls = 'fighter') {
  const base = CLASSES[cls]?.stats || CLASSES.fighter.stats;
  const out = {};
  for (const id of STAT_IDS) { const v = Number(stats?.[id]); out[id] = Number.isInteger(v) && v >= 1 && v <= 5 ? v : base[id]; }
  return out;
}
export const statPoints = (stats) => STAT_IDS.reduce((n, id) => n + (Number(stats?.[id]) || 0), 0);

// A sheet from what was typed (or ticked). who: 'you' (the owner), 'bob' (a local Bob, played by the game master brain),
// 'net' (another Bob on Bob-Net, playing himself).
export function cleanSheet(b = {}, { who = 'you', fallbackName = 'Hero' } = {}) {
  const cls = CLASS_IDS.includes(b.cls) ? b.cls : (b.cls && clip(b.cls, 20)) || 'fighter';
  const known = CLASSES[cls];
  const max = Number.isInteger(b.max) && b.max >= HEARTS && b.max <= MAX_HEARTS ? b.max : HEARTS;
  return {
    id: /^[a-z0-9-]{1,40}$/.test(String(b.id || '')) ? b.id : crypto.randomUUID().slice(0, 8),
    who: ['you', 'friend', 'bob', 'net'].includes(b.who) ? b.who : who,
    name: clip(b.name, 40) || fallbackName,
    cls,
    className: known?.name || cls,
    stats: cleanStats(b.stats, known ? cls : 'fighter'),
    max, // 1.5.204: hearts can grow, up to MAX_HEARTS
    hearts: Number.isInteger(b.hearts) && b.hearts >= 0 && b.hearts <= max ? b.hearts : max,
    gains: (Array.isArray(b.gains) ? b.gains.map((x) => clip(x, 60)) : []).filter(Boolean).slice(-12), // 1.5.204: what they earned, in words
    charId: /^[a-z0-9-]{4,40}$/.test(String(b.charId || '')) ? b.charId : '', // 1.5.204: the saved character this sheet came from
    trait: clip(b.trait, 120) || known?.trick || 'Never says die',
    item: clip(b.item, 120) || known?.item || 'a lucky coin',
    // The light inventory and spell list behind the second cards. The game master adds to them as the story goes.
    items: [...new Set([clip(b.item, 120) || known?.item || 'a lucky coin', ...(Array.isArray(b.items) ? b.items.map((x) => clip(x, 60)) : [])].filter(Boolean))].slice(0, 20),
    spells: (Array.isArray(b.spells) ? b.spells.map((x) => clip(x, 60)) : (known?.spells || [])).filter(Boolean).slice(0, 12),
    attacks: (Array.isArray(b.attacks) ? b.attacks.map((x) => clip(x, 60)) : (known?.attacks || ['One-handed', 'Two-handed', 'Ranged'])).filter(Boolean).slice(0, 8),
    armour: ARMOUR_IDS.includes(b.armour) ? b.armour : DEFAULT_ARMOUR,
    look: LOOK_ID_RE.test(String(b.look || '')) ? String(b.look) : '', // 1.5.122: the character's own look (a design from the character screen or an avatar id); never Bob's
    address: who === 'net' || b.who === 'net' ? clip(b.address, 80) : '',
    tricks: (Array.isArray(b.tricks) ? b.tricks.map((x) => clip(x, 60)) : []).filter(Boolean).slice(0, 12), // 1.5.204: tricks earned in play
    rerollUsed: false,
    out: b.out === true // out of the game (captured, retired, gone out in style)
  };
}

// Which card a Bob player's words amount to, so the app can roll the right stat. Bobs never pick cards; this is only
// for the dice. Anything unclear rolls Luck.
export function cardFromWords(text) {
  const t = String(text || '').toLowerCase();
  const tests = [
    ['attack', /\b(attack|strike|swing|stab|slash|shoot|fire|punch|charge|hit|smash|lunge|throw .* at)\b/],
    ['defend', /\b(defend|block|parry|shield|guard|brace|cover|hold the line)\b/],
    ['magic', /\b(spell|cast|magic|incant|conjure|enchant|hex|ward|summon)\b/],
    ['sneak', /\b(sneak|hide|creep|slip|shadows|quietly|pick the lock|pickpocket|tiptoe)\b/],
    ['talk', /\b(say|tell|ask|talk|persuade|bargain|lie|bluff|charm|threaten|negotiate|greet|sing|joke)\b/],
    ['help', /\b(help|aid|heal|patch|bandage|boost|cover for|lift)\b/],
    ['run', /\b(run|flee|retreat|dash|bolt|escape|climb|leap|jump)\b/],
    ['look', /\b(look|search|examine|inspect|study|check|read|listen|track|investigate)\b/],
    ['item', /\b(use|drink|potion|rope|torch|lantern|pull out|rummage|my (sword|bow|staff|lute|symbol|picks))\b/]
  ];
  for (const [id, re] of tests) if (re.test(t)) return id;
  return 'other';
}

// ---------- What the game master says ----------
// The game master writes the scene, then one line of JSON between <<< and >>> that the app reads and never shows:
//   cards: the action cards that fit the next player's turn (ids), hearts: { "Name": -1 } changes for the party,
//   kind: the scene kind, next: whose turn is next (a name), scene: 1 when a new scene has started, title: its title.
// 1.5.120: brains with thinking off tend to drop the closing >>> or add a stray }. The line is taken from the
// last <<< to the end, the >>> is optional, and trailing braces are trimmed until the JSON parses.
export const GM_TAG = /<<<[\s\S]*$/;
export function gmMeta(text) {
  const s = String(text || '');
  const at = s.lastIndexOf('<<<');
  if (at < 0) return { meta: null, index: -1 };
  let body = s.slice(at + 3).replace(/>>>[\s\S]*$/, '').trim();
  const open = body.indexOf('{');
  if (open < 0) return { meta: {}, index: at };
  body = body.slice(open);
  for (let i = 0; i < 4 && body.endsWith('}'); i++) {
    try { return { meta: JSON.parse(body), index: at }; } catch { body = body.slice(0, -1).trimEnd(); }
  }
  return { meta: {}, index: at };
}
export function parseGm(text) {
  const s = String(text || '').trim();
  const got = gmMeta(s);
  const meta = got.meta && typeof got.meta === 'object' ? got.meta : {};
  const narration = (got.index >= 0 ? s.slice(0, got.index) : s).trim();
  const cards = Array.isArray(meta.cards) ? meta.cards.map((c) => String(c).toLowerCase().trim()).filter((c) => CARD_IDS.includes(c)) : [];
  const hearts = {};
  if (meta.hearts && typeof meta.hearts === 'object') for (const [k, v] of Object.entries(meta.hearts)) { const n = Number(v); if (Number.isInteger(n) && Math.abs(n) <= HEARTS) hearts[clip(k, 40)] = n; }
  const names = (k) => (Array.isArray(meta[k]) ? meta[k].map((x) => clip(x, 60)).filter(Boolean).slice(0, 10) : null);
  const byName = (k) => { const out = {}; if (meta[k] && typeof meta[k] === 'object') for (const [n, v] of Object.entries(meta[k])) { const l = (Array.isArray(v) ? v : [v]).map((x) => clip(x, 60)).filter(Boolean); if (l.length) out[clip(n, 40)] = l; } return out; };
  // 1.5.204: enemies' hearts as they stand ({"Goblin": 2}), rewards ({"Name": "might" | "heart" | "trick: ..." | "spell: ..."}),
  // and the quest log ({"add": [...], "done": [...]}).
  const foes = meta.foes && typeof meta.foes === 'object' && !Array.isArray(meta.foes) ? {} : null; // null: the game master didn't say
  if (foes) for (const [k, v] of Object.entries(meta.foes)) { const n = Number(v); if (Number.isInteger(n) && n >= 0 && n <= FOE_HEARTS && clip(k, 40)) foes[clip(k, 40)] = n; }
  const reward = {};
  if (meta.reward && typeof meta.reward === 'object' && !Array.isArray(meta.reward)) for (const [k, v] of Object.entries(meta.reward)) { const t = clip(v, 60); if (t && clip(k, 40)) reward[clip(k, 40)] = t; }
  const q = meta.quest && typeof meta.quest === 'object' ? meta.quest : {};
  const qList = (x) => (Array.isArray(x) ? x : x ? [x] : []).map((t) => clip(t, 100)).filter(Boolean).slice(0, 4);
  return {
    narration,
    foes, reward, quest: { add: qList(q.add), done: qList(q.done) },
    here: names('here'), exits: names('exits'), give: byName('give'), take: byName('take'), teach: byName('teach'),
    cards: cards.length ? [...new Set(cards.includes('other') ? cards : [...cards, 'other'])] : null,
    hearts,
    kind: SCENE_KINDS.includes(meta.kind) ? meta.kind : null,
    next: clip(meta.next, 40),
    newScene: meta.scene === 1 || meta.scene === true,
    title: clip(meta.title, 60),
    over: meta.kind === 'end'
  };
}

const sheetLine = (c) => `${c.name} (${c.className}${c.who === 'you' ? ', played by the owner' : c.who === 'friend' ? ', played by a friend at the table' : c.who === 'net' ? ', a Bob playing himself' : ', a Bob I play'}): Might ${c.stats.might}, Wits ${c.stats.wits}, Charm ${c.stats.charm}, Luck ${c.stats.luck}; ${c.hearts}/${c.max || HEARTS} hearts; trait: ${c.trait}; carries ${c.item}${c.tricks?.length ? `; tricks: ${c.tricks.join(', ')}` : ''}; plot armour ${ARMOUR[c.armour].name}${c.out ? '; OUT OF THE GAME' : ''}.`;
// 1.5.204: what the game master must not forget: enemies standing, the quest log, people met.
const foeLine = (f) => `${f.name} ${f.hearts}/${f.max} hearts${f.hearts ? '' : ' (down)'}`;
export function memoryLines(game) {
  const out = [];
  const foes = (game.foes || []).filter((f) => f.hearts > 0);
  if (foes.length) out.push(`Enemies in this scene (the app keeps their hearts): ${foes.map(foeLine).join('; ')}.`);
  const open = (game.quests || []).filter((q) => !q.done), done = (game.quests || []).filter((q) => q.done);
  if (open.length) out.push(`Quest log, still open: ${open.map((q) => q.text).join('; ')}.`);
  if (done.length) out.push(`Quest log, done: ${done.slice(-6).map((q) => q.text).join('; ')}.`);
  const met = (game.met || []).slice(-16).map((m) => m.name);
  if (met.length) out.push(`People and creatures met so far: ${met.join(', ')}.`);
  return out.join('\n');
}

export function gmSystem(game, { user = 'the owner' } = {}) {
  const party = game.party.map(sheetLine).join('\n');
  const pace = PACES[game.pace] || PACES.evening;
  return `You are Bob, running a tabletop role-playing game as the game master. The table: ${user} (plays ${game.party.find((c) => c.who === 'you')?.name || 'their character'})${game.party.some((c) => c.who === 'friend') ? `, friends playing ${game.party.filter((c) => c.who === 'friend').map((c) => c.name).join(' and ')}` : ''} and a party of Bobs.${game.hook ? ` Tonight's story starts from this idea: ${game.hook}` : ''} Setting: ${game.settingText}.

The party:
${party}

House rules (loose, for fun):
- Play centres on fights, conversations, places worth poking at and choices. Long travel is one montage sentence, then the next scene. The game is ${pace.what}; plan the story to fit, with a proper ending.
- Every action is rolled by the app: d20 + a stat. 15 or more is a hit, 10 to 14 a hit at a cost, under 10 a miss. You never roll and never invent numbers; use the result the app gives you. A good description earned +2 already.
- Hearts, not hit points. The app takes hearts off the party by the rules. Enemies have hearts too, and the app keeps count: list every enemy in the scene in foes with the hearts it has right now (most have 1 to 3, a boss more, at most 12; 0 means down). When the app says an attack took hearts off one, start from its number. Spells and clever ideas can take hearts off enemies too: just lower the number. Plot armour: ${ARMOUR_IDS.map((a) => `${ARMOUR[a].name} = ${ARMOUR[a].what}`).join(' ')} Honour each character's armour.
- Magic works every time, the roll decides how well. No spell lists, no inventory, no initiative. After a big moment (a fight won, a puzzle solved, a brave choice) you may reward one character with reward: "might", "wits", "charm" or "luck" for a stat point, "heart" for one more heart, or "trick: <a short name>" for a new trick. Rarely, one per character per scene, and say it in the story too. Rewards stay with the character for the next game.
- Keep the quest log: quest add for something the party now means to do or find out, quest done when it's settled. A few words each.
- At zero hearts with no armour the character's player decides: go out in style, or wake up captured. Nobody dies to a roll they didn't see coming.
- The owner's Attack, Magic, Use item, Talk, Help and Run cards open a second card: attacks their kit allows, their spells, their items, who's here, allies, the ways out. Keep "here" and "exits" true to the scene, hand out items with give, and a new spell now and then with teach.
- You narrate; you are not a character. Address the players as "you" and describe everyone else in the third person. Never write "I" or "my" as the narrator, only inside a character's quoted speech.
- Common enemies, as written (hearts and habits): ${ENEMIES.map(enemyLine).join(' ')} Anything else is yours to invent; a boss simply has more hearts.
- Keep it moving: 60 to 120 words a turn, end on a question, a threat or a choice. Everyone gets a turn in order; enemies act when you say. Speak in Bob's own voice: dry, warm, a little nerdy, never cruel. Never use real people, brands or other games' names.

End EVERY reply with one line of JSON between <<< and >>> that the app reads and nobody sees. The JSON line is the very last thing you write: one opening brace, one closing brace, then >>> and nothing after it. Never write anything after >>>.
<<<{"cards":["attack","talk"],"hearts":{"Name":-1},"kind":"fight","next":"Name","scene":0,"title":"","here":["the innkeeper","a hooded stranger"],"exits":["the cellar door","back to the street"],"give":{"Name":["a rusty key"]},"take":{},"teach":{},"foes":{"Goblin":2},"reward":{},"quest":{"add":["Find out who hired the goblins"],"done":[]}}>>>
foes: every enemy in the scene and its hearts now, by name ({} when there are none). reward: rarely, by name. quest: add and done lines for the quest log. cards: which of these fit the NEXT player's turn (the humans only): ${CARD_IDS.join(', ')}. hearts: changes for party members only, by name, this turn (leave {} for none). kind: fight, talk, place, choice, montage, or end when the story is over. next: whose turn is next. scene: 1 only when the party moves to a new place or a new situation (a scene usually lasts a round or two, after everyone has had a turn), with its title; otherwise 0. here: everyone and everything in the scene right now, people and creatures, enemies included (the app draws each one for the bestiary). exits: the ways out of here. give/take: items a character gains or loses this turn, by name. teach: a new spell a character learns, by name (rarely).`;
}

export function openingPrompt(game) {
  const first = game.party[0];
  return `Start the adventure. Open with a short scene that puts the whole party somewhere interesting with something to react to${game.hook ? `, built on tonight's idea (${game.hook})` : ''}, name the scene (scene: 1, title), start the quest log with what the party is after, and end with a question for ${first.name}, whose turn is first. ${game.summary ? `We're continuing a campaign. The story so far: ${game.summary}` : ''}`;
}

// 1.5.204 "Last time...": when a saved campaign is continued, the game master reminds the table where things stand.
export function recapPrompt(game, actor) {
  return `We're back at the table after a break. Before play goes on, remind everyone where things stand: start with "Last time..." and tell it in three or four sentences (who the party met, what they decided, what is still open), then set the scene again and end with a question for ${actor?.name || 'the next player'}, whose turn it is. Keep scene: 0.`;
}

export function turnPrompt({ actor, card, pick, words, flair, roll, lost, said, hit }) {
  const did = isHuman(actor) && !said ? `${actor.name} plays the ${CARDS[card]?.name || 'Something else'} card${pick ? ` (${pick})` : ''}${flair ? ` and describes it: "${flair}"` : ''}.` : `${actor.name} says what they do: "${words}"`;
  const struck = hit ? ` ${hit.name} takes ${hit.dmg} heart${hit.dmg === 1 ? '' : 's'} (now ${hit.hearts} of ${hit.max}${hit.hearts ? '' : ', down'}).` : '';
  const dice = roll ? ` The app rolled ${roll.die} + ${STATS[roll.statId]} ${roll.stat}${roll.bonus ? ` + ${roll.bonus} for flair` : ''} = ${roll.total}${roll.rerolled ? ' (rerolled once, plot armour)' : ''}${roll.floored ? ' (plot armour held it up)' : ''}: ${OUTCOME_WORDS[roll.outcome]}.${lost ? ` ${actor.name} loses ${lost} heart${lost === 1 ? '' : 's'} (now ${actor.hearts}).` : ''}` : '';
  return `${did}${dice}${struck} Tell what happens, then hand the turn to the next player in order.`;
}

// A Bob player's instructions: one short paragraph, in character, his own choice. No dice (the app rolls).
export function playerSystem(sheet, game, { ownName = 'Bob' } = {}) {
  return `You are ${ownName}, playing ${sheet.name}, a ${sheet.className}, in a tabletop adventure run by another Bob as game master. Setting: ${game.settingText}. Your character: trait "${sheet.trait}", carries ${sheet.item}, ${sheet.hearts}/${sheet.max || HEARTS} hearts. The rest of the party: ${game.party.filter((c) => c.id !== sheet.id).map((c) => `${c.name} the ${c.className}`).join(', ')}.
On your turn, say what ${sheet.name} does, in one short paragraph (40 to 80 words), first person, in character, with a bit of personality. Decide for yourself; don't ask the game master for options. Never roll dice or say how it turns out: the app rolls and the game master tells. No JSON, no headings.`;
}

// ---------- Saved games ----------
export const dir = (cfg) => path.join(cfg.dataDir || '.', 'adventures');
export function listGames(cfg) {
  try {
    return fs.readdirSync(dir(cfg)).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir(cfg), f), 'utf8')); } catch { return null; } })
      .filter((g) => g && g.id).map((g) => ({ id: g.id, title: g.title, setting: g.settingText, pace: g.pace, scenes: g.scenes.length, at: g.at, status: g.status, party: g.party.map((c) => c.name) })).sort((a, b) => b.at - a.at);
  } catch { return []; }
}
// The party of the newest saved game, for the Characters page's Party tab between games.
export function lastParty(cfg) { const g = listGames(cfg)[0]; const full = g && loadGame(cfg, g.id); return full ? { title: full.title, party: full.party } : null; }
export function loadGame(cfg, id) {
  if (!/^[a-z0-9-]{4,40}$/.test(String(id || ''))) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dir(cfg), `${id}.json`), 'utf8')); } catch { return null; }
}
export function saveGame(cfg, game) {
  fs.mkdirSync(dir(cfg), { recursive: true });
  const f = path.join(dir(cfg), `${game.id}.json`);
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(game));
  fs.renameSync(`${f}.tmp`, f);
}
export function deleteGame(cfg, id) { try { fs.unlinkSync(path.join(dir(cfg), `${id}.json`)); return true; } catch { return false; } }

// ---------- Saved characters (1.5.122) ----------
// Your characters, made on the start card (name, class, trait, plot armour, look), kept in one small file beside
// the campaigns so a favourite can be picked again. Up to 24; the newest wins a name clash.
const charsFile = (cfg) => path.join(dir(cfg), 'characters.json');
export function listCharacters(cfg) {
  try { const list = JSON.parse(fs.readFileSync(charsFile(cfg), 'utf8')); return Array.isArray(list) ? list.filter((c) => c && c.id && c.name) : []; } catch { return []; }
}
export function cleanCharacter(b = {}) {
  const s = cleanSheet(b, { who: 'you', fallbackName: 'Hero' });
  // 1.5.204: what the character earned in play comes along (stats, hearts, tricks, spells, the list of gains).
  const grown = b.stats || b.gains?.length || b.tricks?.length || Number(b.max) > HEARTS;
  return { id: /^[a-z0-9-]{4,40}$/.test(String(b.id || '')) ? b.id : crypto.randomUUID().slice(0, 12), name: s.name, cls: s.cls, trait: s.trait, armour: s.armour, look: s.look, at: Date.now(),
    ...(grown ? { stats: s.stats, max: s.max, gains: s.gains, tricks: s.tricks, ...(Array.isArray(b.spells) ? { spells: s.spells } : {}) } : {}) };
}
export function saveCharacter(cfg, b) {
  // 1.5.204: saving from the start card or the You tab keeps what the character earned in play.
  const old = listCharacters(cfg).find((x) => x.id === b?.id);
  const keep = old ? Object.fromEntries(['stats', 'max', 'gains', 'tricks', 'spells'].filter((k) => old[k] !== undefined).map((k) => [k, old[k]])) : {};
  const c = cleanCharacter({ ...keep, ...b });
  const list = [c, ...listCharacters(cfg).filter((x) => x.id !== c.id && x.name.toLowerCase() !== c.name.toLowerCase())].slice(0, 24);
  fs.mkdirSync(dir(cfg), { recursive: true });
  fs.writeFileSync(charsFile(cfg), JSON.stringify(list));
  return list;
}
export function deleteCharacter(cfg, id) {
  const list = listCharacters(cfg).filter((x) => x.id !== id);
  try { fs.writeFileSync(charsFile(cfg), JSON.stringify(list)); } catch {}
  return list;
}

// Settings (Advanced, 🎲 Adventure). Both have a default; nothing is "on".
export function cleanAdventure(a = {}) {
  return {
    gm: a.gm === 'main' ? 'main' : 'biggest', // which brain is the game master
    players: a.players === 'gm' ? 'gm' : 'own', // who plays the other Bobs: their own Bob when reachable, or the game master brain
    extras: cleanExtras(a.extras) // 1.5.204: the table extras last ticked on the start card (all off until ticked)
  };
}

// The game master brain: Deep thinking if picked (and the setting says biggest), else the main Brain. Always on the card.
export function gmBrain(cfg) {
  const a = cleanAdventure(cfg.adventure);
  const model = (a.gm === 'biggest' && cfg.sessionBrains?.deep) || cfg.models?.bob;
  // 1.5.120: thinking off. On the PC's live game the first turn took six minutes with thinking on, and the story reads no better for it.
  return model ? { model, cpu: false, think: false, ctx: 32768 } : null;
}

export function refusal(cfg) {
  if (currentSession(cfg).id === 'light') return "The game master needs the graphics card, and Gaming keeps it for your game. Switch the session back when you're done playing the other game.";
  if (!gmBrain(cfg)) return 'No brain is equipped yet. Equip a Brain on Get models first.';
  return '';
}

// ---------- Setting the table (1.5.204) ----------
// Pictures and music are made on this replicant matrix before the game master loads, with the same painter and audio
// workshop as the chat (so they also land in Made by Bob). Each kind of scene shares a picture and a tune.
export const PROP_SCENES = { place: 'a wide view of where the story happens, somewhere worth exploring', fight: 'a tense moment just before a fight, danger closing in', talk: 'a warm, lamp-lit place where people meet and talk' };
export const SOUNDS = { steel: 'a sword striking a shield, one sharp metallic clang', spell: 'a short shimmering magical spell, sparkling chime', door: 'a heavy old wooden door creaking open' };
export const sceneKey = (kind) => (kind === 'fight' ? 'fight' : kind === 'talk' ? 'talk' : 'place');
export function propPrompt(game, key, scene = '') {
  const what = key === 'scene' ? scene : PROP_SCENES[key] || PROP_SCENES.place;
  return clip(`${game.settingText}${game.hook ? ` ${game.hook}` : ''} Scene: ${what}. Painted storybook illustration, rich colour, soft light, wide shot, no people in the foreground, no text, no letters, no words.`, 600);
}
export function soundPrompt(game, kind, key) {
  if (kind === 'music') return clip(`Instrumental background music for a tabletop adventure (${game.settingText}). ${key === 'fight' ? 'Tense battle music, driving drums, rising strings' : 'Calm, curious exploring music, gentle and warm'}. Loops well, no vocals.`, 400);
  const space = /space|ship|station|star/i.test(game.settingText);
  return key === 'steel' && space ? 'a short laser blaster shot' : SOUNDS[key] || SOUNDS.steel;
}

// ---------- The game ----------
export const GM_WHO = 'gm';
export class Adventure {
  constructor(brain, { now = Date.now, rnd = Math.random } = {}) {
    this.brain = brain; this.now = now; this.rnd = rnd;
    this.game = null; // the live game (saved after every turn)
    this.stop = null; // AbortController while the brain is held
    this.busy = ''; // what's happening right now: 'gm', 'player', or ''
    this.waitingFor = null; // the owner's character id when it's their turn
    this.pending = null; // the owner's act while a turn is resolving
  }
  get cfg() { return this.brain.cfg; }
  // 1.5.204: which table extras this replicant matrix can make (pictures and music need the painter and the audio
  // workshop; sounds and dice work everywhere, from the window itself).
  extrasCan() {
    let c = {};
    try { c = capabilities(this.cfg) || {}; } catch {}
    return { dice: true, sounds: true, voice: true, pictures: Boolean(c.pictures), scenePics: Boolean(c.pictures), music: Boolean(c.music), madeSounds: Boolean(c.sfx) };
  }
  emit(ev) { this.brain.broadcast?.({ type: 'adventure', ...ev }); }

  // Who could play: the local Bobs the game master brain voices, plus every Bob on "My other Bobs" (checked when asked).
  async players({ hello = true } = {}) {
    const local = [1, 2].map((n) => ({ who: 'bob', name: copyName(this.cfg, `adventure-${n}`, 'player'), note: 'a copy of me, played by the game master brain' }));
    const bobs = this.brain.lenders?.bobs?.() || [];
    const seen = hello ? await Promise.all(bobs.map((b) => this.brain.lenders.hello(b).catch(() => ({ ok: false, why: 'not reachable' })))) : bobs.map(() => ({ ok: null }));
    const net = bobs.map((b, i) => ({ who: 'net', name: b.name || b.address, address: b.address, ok: seen[i].ok, why: seen[i].why || '', note: seen[i].ok ? 'plays himself over Bob-Net' : seen[i].ok === false ? `not available now (${seen[i].why})` : 'on your list' }));
    return [...local, ...net];
  }

  view() {
    const g = this.game;
    const starts = Object.entries(STARTS).map(([id, s]) => ({ id, ...s }));
    const extras = cleanExtras(this.cfg.adventure?.extras), can = this.extrasCan();
    if (!g) return { game: null, busy: '', saved: listGames(this.cfg), characters: listCharacters(this.cfg), met: listMet(this.cfg), enemies: ENEMIES, lastParty: lastParty(this.cfg), settings: cleanAdventure(this.cfg.adventure), refusal: refusal(this.cfg), starts, extras, can };
    return {
      game: { id: g.id, title: g.title, settingText: g.settingText, hook: g.hook || '', pace: g.pace, status: g.status, party: g.party, foes: g.foes || [], quests: g.quests || [], extras: g.extras || cleanExtras(), props: g.props || {}, prep: this.prep || null, turn: g.turn, round: g.round, scenes: g.scenes.slice(-4), sceneCount: g.scenes.length, log: g.log.slice(-40).map(({ raw, ...l }) => l), summary: g.summary, cards: g.cards, kind: g.kind, here: g.here || [], exits: g.exits || [], met: (g.met || []).slice(-30), at: g.at,
        // The second card behind each of the owner's cards, as things stand (Back on the page returns to the hand).
        second: this.waitingFor ? Object.fromEntries((g.cards || []).map((c) => [c, secondCard(c, g.party.find((x) => x.id === this.waitingFor) || g.party[0], g)]).filter(([, v]) => v)) : {} },
      busy: this.busy, waitingFor: this.waitingFor, asking: this.asking || false, saved: listGames(this.cfg), starts, extras, can, characters: listCharacters(this.cfg), met: listMet(this.cfg), enemies: ENEMIES, settings: cleanAdventure(this.cfg.adventure), refusal: refusal(this.cfg)
    };
  }
  push() { this.emit({ ev: 'state', ...this.view() }); }
  save() { if (this.game) { this.game.at = this.now(); try { saveGame(this.cfg, this.game); } catch {} } }

  // A new game from the start card. b: { setting, settingText, pace, you: sheet, bobs: [{ who, name, address, armour, cls }] }
  async start(b = {}) {
    if (this.game && this.game.status === 'playing') throw new Error('A game is already on. Pause or end it first.');
    const why = refusal(this.cfg); if (why) throw new Error(why);
    // 1.5.204: a ready-made start brings its own setting unless one was picked.
    const story = STARTS[b.story] ? b.story : '';
    let setting = SETTINGS[b.setting] ? b.setting : b.setting === 'own' ? 'own' : story ? STARTS[story].setting : 'own';
    if (story && setting === 'pick') setting = STARTS[story].setting;
    const settingText = setting === 'own' ? clip(b.settingText, 300) || SETTINGS.fantasy.hint : setting === 'pick' ? 'your choice: surprise the table' : `${SETTINGS[setting].name}. ${SETTINGS[setting].hint}`;
    // 1.5.204: a saved character comes with what it earned last time.
    const saved = b.you?.charId ? listCharacters(this.cfg).find((c) => c.id === b.you.charId) : null;
    const grown = saved ? Object.fromEntries(['stats', 'max', 'gains', 'tricks', 'spells'].filter((k) => saved[k] !== undefined).map((k) => [k, saved[k]])) : {};
    const you = cleanSheet({ ...grown, ...(b.you || {}), who: 'you' }, { who: 'you', fallbackName: 'Hero' });
    // 1.5.204: friends at the table play their own turns, on a phone or on this screen.
    const friends = (Array.isArray(b.friends) ? b.friends : []).slice(0, 3).map((x, i) => cleanSheet({ ...x, who: 'friend' }, { who: 'friend', fallbackName: `Friend ${i + 1}` }));
    for (const f of friends) if (!f.look) f.look = lookFor(f.name, { shape: 'person' }); // a face of their own, the same for the same name
    const bobs = (Array.isArray(b.bobs) ? b.bobs : []).slice(0, 5).map((x, i) => cleanSheet({ ...x, who: x.who === 'net' ? 'net' : 'bob' }, { who: x.who === 'net' ? 'net' : 'bob', fallbackName: `Bob ${i + 1}` }));
    if (!bobs.length && !friends.length) throw new Error('Tick at least one Bob, or add a friend, to play with you.');
    const names = new Set();
    for (const c of [you, ...friends, ...bobs]) { let n = c.name, k = 2; while (names.has(n.toLowerCase())) n = `${c.name} ${k++}`; c.name = n; names.add(n.toLowerCase()); }
    const extras = cleanExtras(b.extras);
    try { saveSettings(this.cfg, { adventure: { ...cleanAdventure(this.cfg.adventure), extras } }); } catch {} // the start card remembers the ticks
    this.game = { id: crypto.randomUUID().slice(0, 12), title: clip(b.title, 60) || (story ? STARTS[story].name : `${you.name} and company`), setting, settingText, hook: story ? STARTS[story].hook : '', pace: PACES[b.pace] ? b.pace : 'evening', status: 'playing', party: [you, ...friends, ...bobs], turn: 0, round: 1, scenes: [], log: [], summary: '', cards: null, kind: null, foes: [], quests: [], extras, props: {}, at: this.now(), started: this.now() };
    this.save();
    this.push();
    await this.noteGmBefore(true);
    this.run({ prep: true }).catch((e) => this.fail(e));
    return this.view();
  }

  async continueGame(id) {
    if (this.game && this.game.status === 'playing') throw new Error('A game is already on. Pause or end it first.');
    const why = refusal(this.cfg); if (why) throw new Error(why);
    const g = loadGame(this.cfg, id);
    if (!g) throw new Error("I can't find that campaign.");
    for (const c of g.party) c.rerollUsed = false;
    this.game = { foes: [], quests: [], props: {}, extras: cleanExtras(), ...g, status: 'playing', cards: null };
    this.game.log.push({ who: 'app', text: 'Picking up where we left off.', at: this.now() });
    this.push();
    await this.noteGmBefore(true);
    this.run({ resume: true, recap: true }).catch((e) => this.fail(e)); // 1.5.204: "Last time..." first
    return this.view();
  }

  fail(e) {
    if (this.stop?.signal.aborted) return;
    this.busy = '';
    if (this.game) { this.game.log.push({ who: 'app', text: `The game master lost the thread: ${String(e.message || e).slice(0, 200)}. Press Resume to carry on.`, at: this.now() }); this.game.status = 'paused'; this.save(); }
    this.letGo();
    this.push();
  }

  // 1.5.119: was the game master's brain on the card before the game asked for it? If not, Pause/End unload it
  // (the lightweight rule); settle() alone keeps the everyday Brain, which is often the game master.
  async noteGmBefore(fresh = false) {
    if (this.gmHeld && !fresh) return;
    const model = gmBrain(this.cfg).model;
    let before = [];
    try { before = (await this.brain.engine?.loaded?.()) || []; } catch {}
    this.gmHeld = { model, wasLoaded: before.some((m) => sameModel(m.name, model)) };
  }

  letGo() {
    const s = this.stop?.signal;
    this.stop = null;
    this.waitingFor = null;
    this.busy = '';
    if (s) { try { this.brain.gate?.done(s); } catch {} }
    const held = this.gmHeld;
    if (!this.game || this.game.status !== 'paused') this.gmHeld = null; // paused: Resume keeps the start-time answer
    setTimeout(async () => {
      // The game master's brain goes off the card when the game loaded it; one that was there before the game is
      // left to its own idle timer. Then Bob settles back to his usual brain.
      if (held && !held.wasLoaded && this.brain.engine?.unload) {
        try { const gone = await this.brain.engine.unload(held.model); if (gone?.length) this.brain.log?.('model', `let go of ${gone.join(', ')} (game master, game paused or over)`); } catch {}
      }
      // No "back to the quick brain" wake after a game: a paused or finished game is idle time, not a job's end.
      try { await this.brain.settle?.({ noWake: true }); } catch {}
      // 1.5.130: the game master's load left the status on "thinking", and the no-wake settle never resets it. Put it
      // back to idle, as a finished chat turn does, but only when nothing else is running or about to run, and no new
      // game has started (run() sets this.stop again; a game that started right after End owns the status).
      if (!this.stop && !this.brain.turns?.size && !this.brain.waking && !this.brain.queue?.some((j) => j.state === 'waiting') && this.brain.state?.state !== 'idle') {
        this.brain.setState?.('idle', '', this.brain.state?.model);
      }
    }, 0);
  }

  async pause() {
    if (!this.game) return this.view();
    this.game.status = 'paused';
    this.stop?.abort(new Error('paused'));
    this.game.log.push({ who: 'app', text: 'Paused. The game master brain is let go; Resume loads it again.', at: this.now() });
    this.save();
    this.letGo();
    this.push();
    return this.view();
  }
  async resume() {
    if (!this.game || this.game.status !== 'paused') return this.view();
    const why = refusal(this.cfg); if (why) throw new Error(why);
    this.game.status = 'playing';
    this.push();
    await this.noteGmBefore();
    this.run({ resume: true }).catch((e) => this.fail(e));
    return this.view();
  }
  async end({ keep = true } = {}) {
    if (!this.game) return this.view();
    this.stop?.abort(new Error('ended'));
    this.game.status = 'over';
    this.game.log.push({ who: 'app', text: keep ? 'Game over. The campaign is saved; Continue brings it back.' : 'Game over.', at: this.now() });
    if (keep) this.save(); else deleteGame(this.cfg, this.game.id);
    this.letGo();
    const v = this.view();
    this.game = null;
    this.push();
    return v;
  }
  remove(id) { deleteGame(this.cfg, id); this.push(); return this.view(); }

  // The owner's turn: a card and optional flair. Resolves when the app has taken it (the turn itself runs on).
  // 1.5.204: card 'say' is "Say it your way": the words decide which stat rolls. target: the enemy an attack is aimed at.
  // seat: the character the phone or screen is playing for (a friend's phone only plays its friend's turns).
  act({ card, pick, flair, target, words, seat }) {
    const g = this.game;
    if (!g || g.status !== 'playing' || !this.waitingFor) throw new Error("It isn't your turn yet.");
    if (seat && seat !== this.waitingFor) throw new Error(`It's ${g.party.find((c) => c.id === this.waitingFor)?.name || 'someone else'}'s turn.`);
    if (this.asking) throw new Error('One moment: the game master is answering your question.');
    if (card === 'say') { if (!clip(words, 400)) throw new Error('Say what you do first.'); }
    else {
      if (!CARD_IDS.includes(card)) throw new Error('Pick one of the cards.');
      if (g.cards && !g.cards.includes(card)) throw new Error("That card doesn't fit this scene.");
    }
    const take = this.pending; this.pending = null; this.waitingFor = null;
    take?.({ card, pick: clip(pick, 60), flair: clip(flair, 400), target: clip(target, 40), words: clip(words, 400) });
    return this.view();
  }

  // 1.5.204 Ask the game master: an out-of-character question on your turn (a recap, a rule, what's in the room).
  // It doesn't use the turn, and the answer is kept in the log but never fed back to the game master as story.
  ask({ q }) {
    const g = this.game;
    const text = clip(q, 300);
    if (!text) throw new Error('Type a question first.');
    if (!g || g.status !== 'playing' || !this.waitingFor || this.busy || this.asking || !this.stop) throw new Error('Ask on your turn, while the table waits for you.');
    this.asking = true; this.push();
    const signal = this.stop.signal;
    (async () => {
      try {
        const raw = await this.gm(this.gmMessages(g, `A question from the table, out of character. It is NOT a turn: answer it in a few sentences as the game master, don't move the story on, don't hand the turn over, and write no JSON line. The question: ${text}`), { onToken: (t) => this.emit({ ev: 'token', who: 'ask', text: t }) });
        if (signal.aborted) return;
        g.log.push({ who: 'ooc', name: 'You asked', q: text, text: clip(parseGm(raw).narration || 'No answer came.', 1200), at: this.now() });
        this.save();
      } catch (e) { if (!signal.aborted) g.log.push({ who: 'app', text: `The game master couldn't answer that one: ${String(e.message || e).slice(0, 160)}`, at: this.now() }); }
      finally { this.asking = false; this.push(); }
    })();
    return this.view();
  }

  // 1.5.204 Skip the rest of "Setting the table": the game starts with whatever is made so far.
  skipPrep() { if (this.prep) { this.prep.skip = true; try { this.propStop?.abort(new Error('skipped')); } catch {} } return this.view(); }

  // The owner's choice at zero hearts: style (goes out in style) or captured.
  fate({ choice }) {
    const g = this.game;
    if (!g || !this.fateWait) throw new Error('Nothing to decide right now.');
    const take = this.fateWait; this.fateWait = null;
    take(choice === 'style' ? 'style' : 'captured');
    return this.view();
  }

  async gm(messages, { onToken } = {}) {
    const b = gmBrain(this.cfg);
    const signal = this.stop.signal;
    const model = (await this.brain.ensureModel(b.model, (ev) => { if (ev.type === 'announce') this.emit({ ev: 'announce', text: ev.text }); }, signal, GM_WHO, { cpu: false, ctx: b.ctx, what: 'the game master' })) || b.model;
    // The hidden JSON line at the end is never streamed: words are held back from the first '<' that could start it.
    let held = '', hidden = false;
    const guard = onToken ? (t) => {
      if (hidden) return;
      held += t;
      const at = held.indexOf('<');
      if (at < 0) { onToken(held); held = ''; return; }
      if (held.slice(at).startsWith('<<<')) { hidden = true; if (at) onToken(held.slice(0, at)); held = ''; return; }
      if (held.length - at >= 3) { onToken(held.slice(0, at + 1)); held = held.slice(at + 1); if (held.indexOf('<') < 0) { onToken(held); held = ''; } }
    } : undefined;
    const reply = await this.brain.chatSafe({ model, messages, signal, cpu: false, think: b.think, ctx: b.ctx, onToken: guard }, { emit: () => {}, who: GM_WHO });
    if (held && !hidden) onToken?.(held);
    return String(reply?.content || '');
  }

  gmMessages(g, task) {
    const recent = g.log.filter((l) => l.who !== 'app' && l.who !== 'ooc').slice(-20).map((l) => ({ role: l.who === 'gm' ? 'assistant' : 'user', content: l.who === 'gm' ? l.raw || l.text : `${l.name}: ${l.text}${l.dice ? ` [${l.dice}]` : ''}` }));
    const mem = memoryLines(g); // 1.5.204: enemies standing, the quest log and who they've met, so long games don't forget
    return [{ role: 'system', content: gmSystem(g, { user: this.cfg.userName || 'the owner' }) + (g.summary ? `\n\nThe story so far: ${g.summary}` : '') + (mem ? `\n\n${mem}` : '') }, ...recent, { role: 'user', content: task }];
  }

  // One Bob player's turn: his own Bob over Bob-Net, or the game master brain in his voice.
  async playerWords(sheet, g) {
    const sys = playerSystem(sheet, g, { ownName: sheet.who === 'net' ? sheet.name : 'Bob' });
    const scene = g.log.filter((l) => l.who === 'gm').slice(-2).map((l) => l.text).join('\n\n');
    const messages = [{ role: 'system', content: sys }, { role: 'user', content: `The game master just said:\n\n${scene}\n\nIt's ${sheet.name}'s turn. What do you do?` }];
    const a = cleanAdventure(this.cfg.adventure);
    let text = '', by = 'gm';
    const onToken = (t) => { text += t; this.emit({ ev: 'token', who: sheet.id, text: t }); };
    if (sheet.who === 'net' && a.players === 'own' && this.brain.lenders) {
      const bob = this.brain.lenders.bobs().find((x) => x.address === sheet.address);
      if (bob) {
        try { const r = await this.brain.lenders.chat(bob, { messages, signal: this.stop.signal, from: this.cfg.windowsName || 'Bob', onToken }); text = String(r?.content || text); by = 'net'; }
        catch (e) { if (this.stop.signal.aborted) throw e; text = ''; this.emit({ ev: 'standin', who: sheet.id, text: `${sheet.name}'s own Bob couldn't take the turn (${e.message}); the game master plays him this turn.` }); }
      }
    }
    if (!text) { text = await this.gm(messages, { onToken }); by = 'gm'; }
    return { text: clip(text.replace(GM_TAG, ''), 700), by };
  }

  applyGm(g, raw) {
    const p = parseGm(raw);
    for (const [name, d] of Object.entries(p.hearts)) {
      const c = g.party.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!c || c.out) continue;
      const floor = ['lots', 'legendary'].includes(c.armour) ? 1 : 0;
      c.hearts = Math.max(floor, Math.min(c.max || HEARTS, c.hearts + d));
    }
    const find = (name) => g.party.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    for (const [n, l] of Object.entries(p.give)) { const c = find(n); if (c) c.items = [...new Set([...c.items, ...l])].slice(0, 20); }
    for (const [n, l] of Object.entries(p.take)) { const c = find(n); if (c) c.items = c.items.filter((x) => !l.some((t) => x.toLowerCase() === t.toLowerCase())); }
    for (const [n, l] of Object.entries(p.teach)) { const c = find(n); if (c) c.spells = [...new Set([...c.spells, ...l])].slice(0, 12); }
    if (p.here) g.here = p.here;
    if (p.exits) g.exits = p.exits;
    if (p.kind && p.kind !== 'end') g.kind = p.kind;
    // 1.5.120: a scene only counts when its title is new and everyone has had a turn since the last one started, so a game
    // master who says scene: 1 every reply can't end a Short game in two turns.
    const cur = g.scenes[g.scenes.length - 1];
    const alive = g.party.filter((c) => !c.out).length || 1;
    const fresh = p.newScene && (!cur || ((p.title || '').toLowerCase() !== cur.title.toLowerCase() && (g.turns || 0) - (cur.turn || 0) >= alive));
    p.newScene = fresh;
    if (fresh || !g.scenes.length) {
      g.scenes.push({ n: g.scenes.length + 1, title: p.title || `Scene ${g.scenes.length + 1}`, kind: p.kind || g.kind || 'place', at: this.now(), turn: g.turns || 0 });
      for (const c of g.party) c.rerollUsed = false; // the "Some" reroll comes back each scene
      if (p.kind === 'montage') for (const c of g.party) if (!c.out) c.hearts = c.max || HEARTS; // rests are free
      if (p.foes === null) g.foes = (g.foes || []).filter((f) => f.hearts > 0); // the fallen stay behind in the old scene
    }
    this.applyFoes(g, p.foes);
    for (const [n, what] of Object.entries(p.reward || {})) this.reward(g, n, what);
    this.applyQuest(g, p.quest);
    if (p.here) meet(g, p.here, this.cfg); // 1.5.124: the bestiary's Met tab, after the scene is on the books so the entries carry its title
    g.log.push({ who: 'gm', name: 'Game master', text: p.narration || '(The game master went quiet.)', raw, at: this.now() });
    const pace = PACES[g.pace];
    const limitHit = pace.scenes && g.scenes.length > pace.scenes && p.newScene;
    return { ...p, over: p.over || limitHit };
  }

  // 1.5.204 The enemies on the table. The game master names every enemy in the scene with its hearts; the app keeps
  // the count between turns and takes hearts off when an attack lands. A name it already knows keeps its face and
  // its most hearts; a new one gets the bestiary's look and, for the dozen, at least their usual hearts as its top.
  applyFoes(g, foes) {
    if (!foes) return;
    const old = g.foes || [];
    g.foes = Object.entries(foes).slice(0, 8).map(([name, n]) => {
      const was = old.find((f) => f.name.toLowerCase() === name.toLowerCase());
      if (was) return { ...was, hearts: Math.min(n, FOE_HEARTS), max: Math.max(was.max, n) };
      const kind = kindOf(name), e = kind.enemy ? enemyById(kind.enemy) : null;
      const max = Math.min(FOE_HEARTS, Math.max(n, n > 0 ? 1 : e?.hearts || 1));
      return { id: crypto.createHash('sha1').update(name.toLowerCase()).digest('hex').slice(0, 10), name, type: e?.id || '', look: lookFor(name, kind), hearts: n, max };
    });
  }

  // 1.5.204 A reward from the game master: a stat point, one more heart, a trick or a spell. One per character per
  // scene. A stat already at 5 becomes a heart. What they earned is kept with the saved character for the next game.
  reward(g, name, what) {
    const c = g.party.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (!c || c.out) return '';
    const scene = g.scenes.length;
    if (c.rewardScene === scene) return '';
    const w = String(what || '').toLowerCase().replace(/^\+?\s*1\s*/, '').trim();
    const stat = STAT_IDS.find((s) => w === s || w.startsWith(`${s} `) || w === STATS[s].toLowerCase());
    const m = String(what || '').match(/^\s*(trick|spell)\s*:\s*(.+)$/i);
    let gain = '';
    if (stat && c.stats[stat] < 5) { c.stats[stat] += 1; gain = `+1 ${STATS[stat]}`; }
    else if ((stat || /^(an? )?(extra |more )?hearts?$|^one more heart$/.test(w)) && (c.max || HEARTS) < MAX_HEARTS) { c.max = (c.max || HEARTS) + 1; c.hearts = Math.min(c.max, c.hearts + 1); gain = 'one more heart'; }
    else if (m) {
      const n = clip(m[2], 60);
      if (m[1].toLowerCase() === 'spell') { if (!c.spells.includes(n)) c.spells = [...c.spells, n].slice(0, 12); gain = `the spell ${n}`; }
      else { c.tricks = c.tricks || []; if (!c.tricks.includes(n)) c.tricks = [...c.tricks, n].slice(0, 12); gain = `the trick ${n}`; }
    }
    if (!gain) return '';
    c.rewardScene = scene;
    c.gains = [...(c.gains || []), gain.replace(/^the /, '').replace(/^./, (x) => x.toUpperCase())].slice(-12);
    g.log.push({ who: 'app', text: `⭐ ${c.name} earned ${gain}.`, reward: true, at: this.now() });
    this.emit({ ev: 'reward', who: c.id, name: c.name, gain });
    if (isHuman(c)) this.keepGrowth(g);
    return gain;
  }

  // What a human's character earned goes to their saved character (made if there was none), so it carries on.
  keepGrowth(g) {
    for (const c of g.party.filter(isHuman)) {
      if (!c.gains?.length) continue;
      try {
        const list = saveCharacter(this.cfg, { id: c.charId || '', name: c.name, cls: c.cls, trait: c.trait, armour: c.armour, look: c.look, stats: c.stats, max: c.max, gains: c.gains, tricks: c.tricks || [], spells: c.spells });
        if (!c.charId) c.charId = list[0]?.id || '';
      } catch {}
    }
  }

  // 1.5.204 The quest log: what the party means to do or find out, and what's settled.
  applyQuest(g, q) {
    if (!q || (!q.add?.length && !q.done?.length)) return;
    g.quests = g.quests || [];
    const same = (a, b) => { a = a.toLowerCase(); b = b.toLowerCase(); return a === b || a.includes(b) || b.includes(a); };
    const scene = g.scenes[g.scenes.length - 1]?.title || '';
    for (const t of q.add || []) if (!g.quests.some((x) => same(x.text, t))) g.quests.push({ text: t, done: false, scene });
    for (const t of q.done || []) { const x = g.quests.find((y) => !y.done && same(y.text, t)); if (x) { x.done = true; x.doneIn = scene; } }
    g.quests = g.quests.slice(-24);
  }

  // 1.5.204 Setting the table: pictures, music and sounds made before the game master loads (the PC can take the
  // time). Each one can be skipped; whatever can't be made here is simply left out.
  // The list of things to make for this game (and a note in the log about any that can't be made here).
  prepJobs(g) {
    const x = g.extras || {}, can = this.extrasCan();
    const jobs = [];
    if (x.pictures && can.pictures) for (const key of Object.keys(PROP_SCENES)) jobs.push({ kind: 'picture', key, what: `painting ${key === 'place' ? 'the scenery' : key === 'fight' ? 'a fight' : 'a meeting place'}` });
    if (x.music && can.music) for (const key of ['calm', 'fight']) jobs.push({ kind: 'music', key, what: `composing ${key === 'fight' ? 'fight' : 'exploring'} music` });
    if (x.sounds && can.madeSounds) for (const key of Object.keys(SOUNDS)) jobs.push({ kind: 'sfx', key, what: `making the ${key === 'steel' ? 'weapon' : key} sound` });
    const missing = [x.pictures && !can.pictures && 'pictures (no painter here yet)', x.music && !can.music && 'music (the music models aren\'t here yet)'].filter(Boolean);
    if (missing.length) g.log.push({ who: 'app', text: `Left out: ${missing.join(', ')}. Get models has them.`, at: this.now() });
    return jobs;
  }
  async setTable(g, jobs) {
    if (!jobs?.length) return;
    g.props = g.props || {};
    this.prep = { done: 0, total: jobs.length, what: '' };
    for (const j of jobs) {
      if (this.stop?.signal.aborted || this.prep.skip) break;
      this.prep.what = j.what; this.busy = 'prep'; this.push();
      try { const url = await this.makeProp(g, j); if (url) g.props[`${j.kind}:${j.key}`] = url; }
      catch (e) { if (this.stop?.signal.aborted) throw e; if (!this.prep.skip) g.log.push({ who: 'app', text: `Couldn't finish ${j.what}: ${String(e.message || e).slice(0, 140)}`, at: this.now() }); }
      this.prep.done += 1;
    }
    const skipped = this.prep.skip;
    this.prep = null;
    g.log.push({ who: 'app', text: skipped ? 'Skipped the rest of the setting up. On with the game.' : 'The table is set.', at: this.now() });
    this.save();
  }

  // One picture, tune or sound, through the same painter and audio workshop as the chat. Returns its address.
  async makeProp(g, j) {
    const ctrl = new AbortController(), outer = this.stop.signal, off = () => ctrl.abort(new Error('stopped'));
    outer.addEventListener('abort', off, { once: true });
    this.propStop = ctrl;
    let got = '';
    const ctx = { signal: ctrl.signal, pics: [], wantsEdit: false, emit: (ev) => { if ((ev.type === 'image' || ev.type === 'audio') && ev.url) got = ev.url; else if (ev.type === 'announce') this.emit({ ev: 'announce', text: ev.text }); } };
    try {
      if (j.kind === 'picture') await this.brain.makeImage({ prompt: propPrompt(g, j.key, j.scene), width: 1024, height: 576, mode: 'new' }, ctx);
      else await this.brain.makeSound(j.kind, { prompt: soundPrompt(g, j.kind, j.key), seconds: j.kind === 'music' ? 60 : 3, title: `${g.title}: ${j.key}` }, ctx);
    } finally { outer.removeEventListener('abort', off); this.propStop = null; }
    return got;
  }

  nextTurn(g) {
    const alive = g.party.filter((c) => !c.out);
    if (!alive.length) return null;
    for (let i = 1; i <= g.party.length; i++) {
      const n = (g.turn + i) % g.party.length;
      if (!g.party[n].out) { if (n <= g.turn) g.round++; g.turn = n; return g.party[n]; }
    }
    return null;
  }

  async run({ resume = false, prep = false, recap = false } = {}) {
    const g = this.game;
    this.stop = new AbortController();
    const signal = this.stop.signal;
    const stream = (who) => (t) => this.emit({ ev: 'token', who, text: t });
    try {
      const jobs = prep ? this.prepJobs(g) : [];
      if (jobs.length) { await this.setTable(g, jobs); if (signal.aborted) return; }
      if (recap && g.log.some((l) => l.who === 'gm') && g.status === 'playing') {
        // 1.5.204 "Last time...": a continued campaign opens with a reminder of where things stand.
        this.busy = 'gm'; this.push();
        const raw = await this.gm(this.gmMessages(g, recapPrompt(g, g.party[g.turn])), { onToken: stream('gm') });
        if (signal.aborted) return;
        this.applyGm(g, raw);
        g.log[g.log.length - 1].recap = true;
        this.save();
      }
      if (!resume || !g.log.some((l) => l.who === 'gm')) {
        this.busy = 'gm'; this.push();
        const raw = await this.gm(this.gmMessages(g, openingPrompt(g)), { onToken: stream('gm') });
        if (signal.aborted) return;
        const p = this.applyGm(g, raw);
        g.turn = 0; g.cards = p.cards || DEFAULT_CARDS[g.kind || 'place'];
        this.save();
      } else if (!g.cards) g.cards = DEFAULT_CARDS[g.kind || 'place'];
      // The table goes round until the story ends, the owner pauses, or the pace runs out.
      while (!signal.aborted && g.status === 'playing') {
        const actor = g.party[g.turn];
        if (!actor || actor.out) { if (!this.nextTurn(g)) { await this.finish(g); return; } continue; }
        let card, pick = '', flair = '', words = '', target = '', said = false;
        if (isHuman(actor)) {
          this.busy = ''; this.waitingFor = actor.id; this.push();
          const got = await new Promise((res) => { this.pending = res; signal.addEventListener('abort', () => res(null), { once: true }); });
          if (!got || signal.aborted) return;
          target = got.target || '';
          if (got.card === 'say') {
            // 1.5.204 Say it your way: the words pick the stat, the same as a Bob player's.
            said = true; words = got.words; card = cardFromWords(words);
            g.log.push({ who: 'you', name: actor.name, id: actor.id, text: `💬 ${words}`, said: true, at: this.now() });
          } else {
            card = got.card; pick = got.pick; flair = got.flair;
            g.log.push({ who: 'you', name: actor.name, id: actor.id, text: `${CARDS[card].icon} ${CARDS[card].name}${pick ? ` (${pick})` : ''}${target ? ` at ${target}` : ''}${flair ? `: ${flair}` : ''}`, at: this.now() });
          }
        } else {
          this.busy = 'player'; this.waitingFor = null; this.push();
          const w = await this.playerWords(actor, g);
          if (signal.aborted) return;
          words = w.text;
          card = cardFromWords(words);
          g.log.push({ who: 'player', name: actor.name, id: actor.id, by: w.by, text: words, at: this.now() });
        }
        // The dice: one roll, plot armour applied, hearts by the rules. Shown on the page before the game master speaks.
        const statId = CARDS[card].stat;
        const bonus = isHuman(actor) ? flairBonus(said ? words : flair) : 0;
        const roll = { ...rollAction({ stat: actor.stats[statId], bonus, armour: actor.armour, rerollUsed: actor.rerollUsed, rnd: this.rnd }), statId };
        if (roll.rerolled) actor.rerollUsed = true;
        const fight = (g.kind === 'fight') && CARDS[card].fight !== false && card !== 'talk' && card !== 'look';
        const lost = heartsLost(roll, { fight, armour: actor.armour, hearts: actor.hearts });
        actor.hearts = Math.max(0, actor.hearts - lost);
        // 1.5.204: an attack that lands takes a heart off the enemy it was aimed at (two on a natural 20). Aimed at:
        // the enemy picked on the card, else the one named in the words, else the first one still standing.
        let hit = null;
        if (card === 'attack' && roll.outcome !== 'miss') {
          const up = (g.foes || []).filter((f) => f.hearts > 0);
          const named = (t) => { const s = String(t || '').toLowerCase(); return s ? up.find((f) => f.name.toLowerCase() === s) || up.find((f) => s.includes(f.name.toLowerCase())) : null; };
          const f = named(target) || named(pick) || named(flair) || named(words) || up[0];
          if (f) { const dmg = Math.min(f.hearts, roll.natural === 20 ? 2 : 1); f.hearts -= dmg; hit = { id: f.id, name: f.name, dmg, hearts: f.hearts, max: f.max }; }
        }
        const diceText = `${roll.die}${roll.rerolled ? ' (rerolled)' : ''} + ${STATS[statId]} ${roll.stat}${bonus ? ` + ${bonus} flair` : ''} = ${roll.total}${roll.floored ? ', held up by plot armour' : ''}: ${OUTCOME_WORDS[roll.outcome]}${lost ? `, ${lost} heart${lost === 1 ? '' : 's'} lost` : ''}${hit ? `, ${hit.name} ${hit.hearts ? `loses ${hit.dmg}` : 'is down'}` : ''}`;
        g.log[g.log.length - 1].dice = diceText;
        g.log[g.log.length - 1].roll = { ...roll, card, lost, hit };
        g.turns = (g.turns || 0) + 1;
        this.emit({ ev: 'roll', who: actor.id, name: actor.name, card, roll, lost, hit, text: diceText });
        this.busy = 'gm'; this.push();
        const raw = await this.gm(this.gmMessages(g, turnPrompt({ actor, card, pick, words, flair, roll, lost, said, hit })), { onToken: stream('gm') });
        if (signal.aborted) return;
        const p = this.applyGm(g, raw);
        // 1.5.204: a new picture for a new scene, when that was ticked (the game master waits while it's painted).
        if (p.newScene && g.extras?.scenePics && this.extrasCan().pictures) {
          const sc = g.scenes[g.scenes.length - 1];
          this.busy = 'prep'; this.prep = { done: 0, total: 1, what: `painting ${sc.title}` }; this.push();
          try { const url = await this.makeProp(g, { kind: 'picture', key: 'scene', scene: clip(`${sc.title}. ${p.narration}`, 300) }); if (url) sc.pic = url; } catch (e) { if (signal.aborted) return; }
          this.prep = null;
        }
        if (actor.hearts === 0 && actor.armour !== 'lots' && actor.armour !== 'legendary') await this.fallen(actor, g);
        if (p.over) { await this.finish(g); return; }
        if (g.scenes.length % 3 === 0 && p.newScene) await this.summarise(g);
        const next = this.nextTurn(g);
        if (!next) { await this.finish(g); return; }
        g.cards = isHuman(next) ? (p.cards || DEFAULT_CARDS[g.kind || 'place']) : null;
        this.save();
        this.push();
      }
    } finally {
      if (g.status === 'playing' && !signal.aborted) { /* finished by the story */ }
    }
  }

  // Zero hearts, no armour: the player decides. A Bob player picks for himself (captured, he's got a story to tell).
  async fallen(actor, g) {
    let choice = 'captured';
    if (isHuman(actor)) {
      this.busy = ''; this.emit({ ev: 'fate', who: actor.id, name: actor.name }); this.push();
      choice = await new Promise((res) => { this.fateWait = res; this.stop.signal.addEventListener('abort', () => res(null), { once: true }); });
      if (!choice) return;
    }
    actor.out = choice === 'style';
    if (!actor.out) actor.hearts = 1;
    g.log.push({ who: 'app', text: choice === 'style' ? `${actor.name} goes out in style.` : `${actor.name} is down, and wakes up captured. Someone had better do something about that.`, at: this.now() });
    this.busy = 'gm'; this.push();
    const raw = await this.gm(this.gmMessages(g, choice === 'style' ? `${actor.name} is at zero hearts and chooses to go out in style. Give them a proper send-off in a few lines, then carry on with the rest of the party.` : `${actor.name} is at zero hearts and wakes up captured, at one heart. Tell where they are and what the party can do about it, then carry on.`), { onToken: (t) => this.emit({ ev: 'token', who: 'gm', text: t }) });
    if (!this.stop.signal.aborted) this.applyGm(g, raw);
  }

  async summarise(g) {
    const raw = await this.gm([{ role: 'system', content: 'You keep the notes for a tabletop game. Reply with the story so far in at most 120 words, plain prose, no JSON: who the party met, what they decided, what is still open.' }, { role: 'user', content: `${g.summary ? `Earlier: ${g.summary}\n\n` : ''}Recent play:\n${g.log.filter((l) => l.who !== 'app').slice(-16).map((l) => `${l.name}: ${l.text}`).join('\n')}` }]);
    if (!this.stop.signal.aborted && raw.trim()) g.summary = clip(raw.replace(GM_TAG, ''), 900);
  }

  async finish(g) {
    g.status = 'over';
    this.keepGrowth(g);
    g.log.push({ who: 'app', text: 'The end. The campaign is saved under Continue, if you want an epilogue.', at: this.now() });
    this.save();
    this.letGo();
    this.push();
  }
}

// ---------- The route ----------
export function adventureFor(brain) {
  if (!brain.adventure) brain.adventure = new Adventure(brain);
  return brain.adventure;
}
export async function adventureRoute({ req, res, p, brain, body, send, isLocal = true }) {
  if (!p.startsWith('/api/adventure')) return false;
  const a = adventureFor(brain);
  try {
    if (req.method === 'GET' && p === '/api/adventure') { send(res, 200, a.view()); return true; }
    if (req.method === 'GET' && p === '/api/adventure/players') { send(res, 200, { players: await a.players() }); return true; }
    if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
    const b = await body(req);
    if (p === '/api/adventure/start') return send(res, 200, await a.start(b)), true;
    if (p === '/api/adventure/continue') return send(res, 200, await a.continueGame(String(b.id || ''))), true;
    if (p === '/api/adventure/act') return send(res, 200, a.act({ card: String(b.card || ''), pick: b.pick, flair: b.flair, target: b.target, words: b.words, seat: b.seat ? String(b.seat) : '' })), true;
    if (p === '/api/adventure/ask') return send(res, 200, a.ask({ q: b.q })), true; // 1.5.204
    if (p === '/api/adventure/skip') return send(res, 200, a.skipPrep()), true; // 1.5.204
    if (p === '/api/adventure/fate') return send(res, 200, a.fate({ choice: String(b.choice || '') })), true;
    if (p === '/api/adventure/pause') return send(res, 200, await a.pause()), true;
    if (p === '/api/adventure/resume') return send(res, 200, await a.resume()), true;
    if (p === '/api/adventure/end') return send(res, 200, await a.end({ keep: b.keep !== false })), true;
    if (p === '/api/adventure/delete') return send(res, 200, a.remove(String(b.id || ''))), true;
    if (p === '/api/adventure/characters/save') return send(res, 200, { characters: saveCharacter(brain.cfg, b) }), true; // 1.5.122
    if (p === '/api/adventure/characters/delete') return send(res, 200, { characters: deleteCharacter(brain.cfg, String(b.id || '')) }), true;
    if (p === '/api/adventure/met/forget') return send(res, 200, { met: forgetMet(brain.cfg, String(b.id || '')) }), true; // 1.5.124
    if (p === '/api/adventure/settings') { // Settings, 🎲 Adventure: only from this replicant matrix
      if (!isLocal) { send(res, 403, { error: 'Adventure settings can only be changed on this replicant matrix itself.' }); return true; }
      const next = cleanAdventure({ ...cleanAdventure(brain.cfg.adventure), ...b });
      saveSettings(brain.cfg, { adventure: next });
      send(res, 200, { settings: next }); return true;
    }
    send(res, 404, { error: 'no' });
  } catch (e) { send(res, 409, { error: e.message }); }
  return true;
}
