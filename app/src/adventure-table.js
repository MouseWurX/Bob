// 🎲 Adventure table rules (1.5.206, items 113-122 of the "100 more" list). The pieces the app keeps and checks so the
// game master can't drift: a map that grows, coins and shops, catch your breath, secret notes, riddle rooms (the app
// holds the answers), difficulty, badges, and sending a campaign to a friend's Bob as one file.
// Every rule here is OFF until ticked on the start card (Normal difficulty plays exactly as before). Nothing in this
// file talks to a brain; src/adventure.js calls these as the game goes.
import crypto from 'node:crypto';

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// ---------- Table rules, ticked on the start card ----------
export const RULES = {
  map: { name: 'A map that grows', what: 'Draws the places the party has been and how they join up.' },
  coins: { name: 'Coins and shops', what: 'A gold count for the party, and shops to spend it in.' },
  breath: { name: 'Catch your breath', what: 'Spend a turn to get one heart back, once a scene.' },
  secrets: { name: 'Secret notes', what: 'Tell the game master something the other players don\'t see.' },
  riddles: { name: 'Riddle rooms', what: 'Riddles whose answers only the app knows.' },
  badges: { name: 'Badges', what: 'First natural 20, first enemy down, a dragon slain, and more, kept on the character.' }
};
export const RULE_IDS = Object.keys(RULES);
export function cleanRules(x = {}) { const out = {}; for (const id of RULE_IDS) out[id] = x?.[id] === true; return out; }

// ---------- Easy, Normal or Hard ----------
// foes: how many hearts a new enemy gets, against the game master's number (after Fair fights). Normal is how the
// game always played. Easy: a miss never costs more than one heart. Hard: a hit at a cost in a fight costs a heart too.
export const DIFFICULTY = {
  easy: { name: 'Easy', foes: 0.75, what: 'Enemies have fewer hearts, and a miss never costs more than one heart.' },
  normal: { name: 'Normal', foes: 1, what: 'The usual game.' },
  hard: { name: 'Hard', foes: 1.25, what: 'Enemies have more hearts, and a hit at a cost in a fight costs a heart too.' }
};
export const DIFFICULTY_IDS = Object.keys(DIFFICULTY);
export const DEFAULT_DIFFICULTY = 'normal';
export const cleanDifficulty = (d) => (DIFFICULTY_IDS.includes(d) ? d : DEFAULT_DIFFICULTY);
export function diffHearts(n, difficulty = DEFAULT_DIFFICULTY, max = 12) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.max(1, Math.min(max, Math.round(v * DIFFICULTY[cleanDifficulty(difficulty)].foes)));
}
// Hearts lost after the usual rule (base), adjusted for difficulty. Lots and Legendary still never lose the last heart.
export function diffLost(base, roll, { fight = true, armour = 'some', hearts = 5, difficulty = DEFAULT_DIFFICULTY } = {}) {
  const d = cleanDifficulty(difficulty);
  let lose = base;
  if (d === 'easy') lose = Math.min(lose, 1);
  if (d === 'hard' && fight && roll?.outcome === 'cost') lose = Math.max(lose, 1);
  if (['lots', 'legendary'].includes(armour)) lose = Math.min(lose, Math.max(0, hearts - 1));
  return Math.max(0, Math.min(lose, hearts));
}

// ---------- A map that grows ----------
// Every new scene is a place on the map, joined to the one the party came from. A title the map already has is the
// same place (going back). Places sit on a grid next to where they were reached from, so the drawing never overlaps.
export const MAP_MAX = 40;
const DIRS = [[1, 0], [0, 1], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export function mapStep(g, title, kind = 'place') {
  const name = clip(title, 60);
  if (!name) return g.map || null;
  const m = g.map || (g.map = { nodes: [], links: [], at: -1 });
  const from = m.nodes.find((n) => n.id === m.at);
  let node = m.nodes.find((n) => n.name.toLowerCase() === name.toLowerCase());
  if (!node) {
    if (m.nodes.length >= MAP_MAX) return m;
    let x = 0, y = 0;
    if (from) {
      const taken = (a, b) => m.nodes.some((n) => n.x === a && n.y === b);
      let found = false;
      for (let r = 1; r <= 6 && !found; r++) for (const [dx, dy] of DIRS) { if (!taken(from.x + dx * r, from.y + dy * r)) { x = from.x + dx * r; y = from.y + dy * r; found = true; break; } }
    }
    node = { id: m.nodes.length, name, kind: clip(kind, 12) || 'place', x, y };
    m.nodes.push(node);
  }
  if (from && from.id !== node.id && !m.links.some(([a, b]) => (a === from.id && b === node.id) || (a === node.id && b === from.id))) m.links.push([from.id, node.id]);
  m.at = node.id;
  return m;
}

// ---------- Coins and shops ----------
export const START_COINS = 10, MAX_COINS = 999;
// The game master's hidden line: "coins": 5 (found 5) or -3 (paid 3), at most 50 either way a turn; "shop": {"Rope": 2}
// while the party is at a shop (prices 1 to 99, up to 8 things), {} when they leave it.
export function readCoins(meta = {}) {
  const n = Number(meta?.coins);
  const coins = Number.isInteger(n) && n !== 0 ? Math.max(-50, Math.min(50, n)) : 0;
  let shop = null;
  if (meta?.shop && typeof meta.shop === 'object' && !Array.isArray(meta.shop)) {
    shop = {};
    for (const [k, v] of Object.entries(meta.shop).slice(0, 8)) { const p = Number(v); const name = clip(k, 40); if (name && Number.isInteger(p) && p >= 1 && p <= 99) shop[name] = p; }
  }
  return { coins, shop };
}
export function applyCoins(g, { coins = 0, shop = null } = {}) {
  if (!g.rules?.coins) return;
  if (coins) g.coins = Math.max(0, Math.min(MAX_COINS, (g.coins ?? START_COINS) + coins));
  if (shop) g.shop = Object.keys(shop).length ? shop : null;
}
// Buying doesn't use the turn: the app checks the purse, takes the coins and puts the thing in the buyer's pack.
export function buy(g, c, item) {
  if (!g.rules?.coins) throw new Error('Coins and shops are off for this game.');
  const shop = g.shop || {};
  const name = Object.keys(shop).find((k) => k.toLowerCase() === String(item || '').toLowerCase());
  if (!name) throw new Error("That isn't for sale here.");
  const price = shop[name], purse = g.coins ?? START_COINS;
  if (price > purse) throw new Error(`That costs ${price} coin${price === 1 ? '' : 's'}, and the party has ${purse}.`);
  g.coins = purse - price;
  c.items = [...new Set([...(c.items || []), name])].slice(0, 20);
  return { name, price };
}

// ---------- Catch your breath ----------
// A card of its own (never the game master's to hand out): one heart back, once a scene, and it uses the turn.
export const BREATH_CARD = { icon: '🫁', name: 'Catch your breath' };
export const canBreathe = (g, c) => Boolean(g.rules?.breath && c && !c.out && c.hearts < (c.max || 5) && c.breathScene !== (g.scenes?.length || 0));
export function breathe(g, c) {
  if (!canBreathe(g, c)) return 0;
  c.hearts = Math.min(c.max || 5, c.hearts + 1);
  c.breathScene = g.scenes?.length || 0;
  return 1;
}
// A Bob player catches his breath when his words say so.
export const breathWords = (t) => /\b(catch (my|his|her|their) breath|get my breath back|rest a moment|take a breather|bandage (myself|my))\b/i.test(String(t || ''));

// ---------- Secret notes ----------
export const SECRETS_MAX = 20;
export function addSecret(g, c, text) {
  if (!g.rules?.secrets) throw new Error('Secret notes are off for this game.');
  const t = clip(text, 300);
  if (!t) throw new Error('Write the note first.');
  g.secrets = [...(g.secrets || []), { id: c.id, name: c.name, text: t, at: Date.now() }].slice(-SECRETS_MAX);
  return t;
}
export const secretTell = (c, t) => `A secret note from ${c.name}, to you, the game master only: "${t}". The other players must not learn it from your story: let it shape what happens, and say it out loud only when ${c.name} reveals it.`;

// ---------- Riddle rooms ----------
// The app holds the answers; the game master only ever sees the question, so he can't give it away.
export const RIDDLES = [
  { id: 'steps', ask: 'The more you take, the more you leave behind. What am I?', answers: ['footsteps', 'steps', 'footprints', 'footstep'] },
  { id: 'piano', ask: 'I have keys but open no locks, and I make music when you press them. What am I?', answers: ['piano', 'keyboard', 'harpsichord', 'organ'] },
  { id: 'bottle', ask: 'I have a neck but no head, and I wear a cork for a hat. What am I?', answers: ['bottle', 'flask'] },
  { id: 'towel', ask: 'The more I dry, the wetter I get. What am I?', answers: ['towel', 'cloth', 'rag'] },
  { id: 'map', ask: 'I have cities but no houses, forests but no trees, and rivers without a drop of water. What am I?', answers: ['map', 'chart', 'atlas'] },
  { id: 'needle', ask: 'I have one eye and cannot see, and I pull a long tail behind me. What am I?', answers: ['needle'] },
  { id: 'clock', ask: 'I have hands but never clap, and a face but never smile. What am I?', answers: ['clock', 'watch'] },
  { id: 'dark', ask: 'The more of me there is, the less you see. What am I?', answers: ['darkness', 'dark', 'night', 'fog', 'mist'] },
  { id: 'light', ask: 'I fill a whole room and take up no space at all. What am I?', answers: ['light', 'air', 'sound'] },
  { id: 'silence', ask: 'Say my name and I break. What am I?', answers: ['silence', 'quiet'] },
  { id: 'age', ask: 'I go up and never come down. What am I?', answers: ['age', 'your age', 'years'] },
  { id: 'river', ask: 'I have a bed but never sleep, and a mouth but never eat. What am I?', answers: ['river', 'stream', 'brook'] },
  { id: 'comb', ask: 'I have plenty of teeth and never bite. What am I?', answers: ['comb', 'saw', 'zip', 'zipper', 'gear', 'cog'] },
  { id: 'sponge', ask: 'I am full of holes and still hold water. What am I?', answers: ['sponge'] },
  { id: 'name', ask: 'It belongs to you, yet other people use it far more than you do. What is it?', answers: ['name', 'your name', 'my name'] },
  { id: 'barber', ask: 'I shave every day, and my beard stays just as long. Who am I?', answers: ['barber'] },
  { id: 'letter-m', ask: 'I come once in a minute, twice in a moment, and never in a thousand years. What am I?', answers: ['m', 'the letter m', 'letter m'] },
  { id: 'stamp', ask: 'I travel all over the world and never leave my corner. What am I?', answers: ['stamp', 'postage stamp'] },
  { id: 'table', ask: 'I have four legs and never walk a step. What am I?', answers: ['table', 'chair', 'stool', 'bench'] },
  { id: 'fire', ask: 'Feed me and I grow; give me a drink and I die. What am I?', answers: ['fire', 'flame', 'a fire'] },
  { id: 'hole', ask: 'The more you take away from me, the bigger I get. What am I?', answers: ['hole', 'pit', 'a hole'] },
  { id: 'echo', ask: 'I speak without a mouth and hear without ears, and I answer only when spoken to. What am I?', answers: ['echo'] },
  { id: 'egg', ask: 'I must be broken before anyone can use me. What am I?', answers: ['egg', 'an egg'] },
  { id: 'shadow', ask: 'I follow you all day and vanish in the dark. What am I?', answers: ['shadow', 'your shadow', 'my shadow'] }
];
export const RIDDLE_TRIES = 3;
const STOP = new Set(['a', 'an', 'the', 'its', 'it', 'is', 'my', 'your', 'i', 'am', 'you', 'are', 'maybe', 'perhaps', 'answer', 'think', 'guess', 'say', 'just', 'of', 'course']);
export function normAnswer(t) {
  return String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ');
}
// A guess is right when, after dropping little words and plural s, it is an accepted answer or holds one as whole words.
// Long guesses (more than six words) never count, so a list of every answer at once doesn't open the door.
export function checkAnswer(riddle, guess) {
  const g = normAnswer(guess);
  if (!g || g.split(' ').length > 6) return false;
  return riddle.answers.some((a) => { const n = normAnswer(a); return n && (g === n || ` ${g} `.includes(` ${n} `)); });
}
export function riddleById(id) { return RIDDLES.find((r) => r.id === id) || null; }
// A fresh riddle for this game (none twice in one campaign while there are unused ones).
export function pickRiddle(g, rnd = Math.random) {
  const used = new Set(g.riddlesUsed || []);
  const pool = RIDDLES.filter((r) => !used.has(r.id));
  const list = pool.length ? pool : RIDDLES;
  return list[Math.floor(rnd() * list.length) % list.length];
}
export function openRiddle(g, rnd = Math.random) {
  if (!g.rules?.riddles || g.riddle?.open) return null;
  const r = pickRiddle(g, rnd);
  g.riddlesUsed = [...new Set([...(g.riddlesUsed || []), r.id])].slice(-RIDDLES.length);
  g.riddle = { id: r.id, ask: r.ask, tries: 0, open: true, scene: g.scenes?.[g.scenes.length - 1]?.title || '' };
  return g.riddle;
}
export const riddleTell = (ask) => `The app has put a riddle on the way forward: "${ask}" Present it in the story, word for word (carved on a door, asked by a statue, a sphinx, a locked chest). Only the app knows the answer: never guess it, hint at it or say it. The app tells you when it's solved or given up.`;
// One guess from a player. Returns { right, over, answer } (answer only when solved or given up).
export function guessRiddle(g, guess, { giveUp = false } = {}) {
  const r = g.riddle && g.riddle.open ? riddleById(g.riddle.id) : null;
  if (!r) throw new Error('There is no riddle to answer right now.');
  if (giveUp) { g.riddle.open = false; g.riddle.gaveUp = true; return { right: false, over: true, answer: r.answers[0] }; }
  if (!clip(guess, 80)) throw new Error('Type your answer first.');
  if (checkAnswer(r, guess)) { g.riddle.open = false; g.riddle.solved = true; return { right: true, over: true, answer: r.answers[0] }; }
  g.riddle.tries = (g.riddle.tries || 0) + 1;
  if (g.riddle.tries >= RIDDLE_TRIES) { g.riddle.open = false; g.riddle.gaveUp = true; return { right: false, over: true, answer: r.answers[0] }; }
  return { right: false, over: false };
}
// The riddle as the page sees it: never the answer while it's open.
export const riddleView = (g) => (g.riddle ? { ask: g.riddle.ask, tries: g.riddle.tries || 0, left: Math.max(0, RIDDLE_TRIES - (g.riddle.tries || 0)), open: Boolean(g.riddle.open), solved: Boolean(g.riddle.solved), answer: g.riddle.open ? '' : riddleById(g.riddle.id)?.answers[0] || '' } : null);

// ---------- Badges ----------
export const BADGES = {
  nat20: { icon: '🎯', name: 'First natural 20' },
  firstDown: { icon: '⚔', name: 'First enemy down' },
  dragon: { icon: '🐉', name: 'Dragon slayer' },
  riddle: { icon: '🧩', name: 'Riddle solver' },
  shopper: { icon: '🪙', name: 'First purchase' },
  style: { icon: '🎭', name: 'Went out in style' },
  lastHeart: { icon: '❤', name: 'Hanging on by one heart' }
};
export const BADGE_IDS = Object.keys(BADGES);
export const cleanBadges = (list) => [...new Set((Array.isArray(list) ? list : []).filter((b) => BADGE_IDS.includes(b)))];
// Award once per character, ever (a saved character keeps its badges for the next game). Returns true when new.
export function award(g, c, id) {
  if (!g.rules?.badges || !c || !BADGE_IDS.includes(id)) return false;
  c.badges = cleanBadges(c.badges);
  if (c.badges.includes(id)) return false;
  c.badges.push(id);
  return true;
}
export const isDragon = (f) => /\b(dragon|wyrm|drake)s?\b/i.test(`${f?.name || ''} ${f?.type || ''}`);

// ---------- What the game master reads ----------
export function tableRulesText(g) {
  const r = g.rules || {}, d = cleanDifficulty(g.difficulty);
  const out = [];
  if (d !== 'normal') out.push(`- Difficulty ${DIFFICULTY[d].name}: ${d === 'easy' ? 'be gentle, enemies go down sooner and hit less hard' : 'enemies are tougher and hit harder'}. The app does the numbers.`);
  if (r.coins) out.push('- Coins: the party shares one purse, kept by the app. When they find, earn or pay coins, add "coins": the change (5, or -3) to your hidden line, a few at a time. At a shop, a stall or a trader, list what is for sale with prices in "shop" ({"Rope": 2, "Lantern": 4}, 1 to 99 coins, up to 8 things) and send "shop": {} when they leave. The players buy on the page; the app tells you what they bought.');
  if (r.breath) out.push('- Catch your breath: a player may spend a turn to get one heart back, once a scene. The app does it; just tell it.');
  if (r.secrets) out.push('- Secret notes: a player may pass you a note the others don\'t see. Honour it quietly; never read it out.');
  if (r.riddles) out.push('- Riddle rooms: now and then (once every few scenes, at a door, a guardian or a chest) put "riddle": 1 in your hidden line. The app then sets the riddle and tells you its question; only the app knows the answer, so never guess or hint at it. Play on while the table thinks; the app tells you when it is solved.');
  if (r.badges) out.push('- Badges are given by the app; you needn\'t mention them.');
  return out.length ? `\n\nTable rules for this game:\n${out.join('\n')}` : '';
}
export function tableLines(g) {
  const out = [];
  if (g.rules?.coins) out.push(`Party purse: ${g.coins ?? START_COINS} coins.${g.shop ? ` For sale here: ${Object.entries(g.shop).map(([k, v]) => `${k} (${v})`).join(', ')}.` : ''}`);
  if (g.rules?.riddles && g.riddle?.open) out.push(`A riddle stands open: "${g.riddle.ask}" (only the app knows the answer).`);
  if (g.rules?.secrets && g.secrets?.length) out.push(`Secret notes so far (never read them out): ${g.secrets.slice(-6).map((s) => `${s.name}: ${s.text}`).join('; ')}.`);
  return out.join('\n');
}
// One-shot lines for the game master's next story turn (what was bought, a riddle solved, a secret note).
export function tell(g, line) { g.tell = [...(g.tell || []), clip(line, 600)].slice(-8); }
export function takeTell(g) { const l = g.tell || []; g.tell = []; return l.length ? `\n\nAlso, since the last turn: ${l.join(' ')}` : ''; }

// ---------- Portraits ----------
export function portraitPrompt(g, c) {
  return clip(`Painted storybook portrait of ${c.name}, a ${c.className || 'adventurer'}${c.who === 'bob' || c.who === 'net' ? ', a friendly robot-ish adventurer' : ''}, ${c.trait ? `who ${c.trait}, ` : ''}carrying ${c.item || 'their gear'}. Setting: ${g.settingText}. Head and shoulders, warm light, rich colour, plain background, no text, no letters, no words.`, 600);
}

// ---------- Send a campaign to a friend's Bob, as one file ----------
// The file holds the story, the party (their sheets, badges and what they earned), the quest log, the world book and
// the map. Not in it: pictures and tunes (they're this replicant matrix's files), secret notes, Bob-Net addresses.
export const FILE_KIND = 'bob-adventure', FILE_VERSION = 1, FILE_MAX = 2 * 1024 * 1024;
export function packCampaign(g) {
  const { props, secrets, tell: _t, riddle: _r, ...rest } = g;
  const party = (g.party || []).map(({ address, rerollUsed, ...c }) => ({ ...c, who: c.who === 'net' ? 'bob' : c.who }));
  const scenes = (g.scenes || []).map(({ pic, ...s }) => s);
  return { kind: FILE_KIND, version: FILE_VERSION, made: new Date().toISOString(), game: { ...rest, party, scenes, props: {}, status: g.status === 'playing' ? 'paused' : g.status } };
}
export const campaignFileName = (g) => `${(clip(g.title, 60) || 'campaign').replace(/[^\w .-]+/g, '').trim() || 'campaign'}.bobadventure.json`;
// A campaign from a friend's file, made safe: everything is re-checked as if typed, with a new id. cleanSheet comes from
// adventure.js (passed in, so this file needs nothing from it).
export function unpackCampaign(file, { cleanSheet, now = Date.now() } = {}) {
  let o = file;
  if (typeof o === 'string') { if (o.length > FILE_MAX) throw new Error('That file is too big to be a campaign.'); try { o = JSON.parse(o); } catch { throw new Error("That file isn't a campaign from Bob."); } }
  if (!o || o.kind !== FILE_KIND || !o.game || typeof o.game !== 'object') throw new Error("That file isn't a campaign from Bob.");
  if (Number(o.version) > FILE_VERSION) throw new Error('That campaign comes from a newer Bob. Update Bob, then try again.');
  const src = o.game;
  const party = (Array.isArray(src.party) ? src.party : []).slice(0, 9).map((c, i) => {
    const who = ['you', 'friend', 'bob'].includes(c?.who) ? c.who : 'bob';
    const s = cleanSheet({ ...c, who, id: '', charId: '' }, { who, fallbackName: `Player ${i + 1}` });
    s.hearts = Number.isInteger(c?.hearts) && c.hearts >= 0 && c.hearts <= s.max ? c.hearts : s.max;
    s.badges = cleanBadges(c?.badges);
    return s;
  });
  if (!party.length) throw new Error('That campaign has nobody in its party.');
  if (!party.some((c) => c.who === 'you')) party[0].who = 'you';
  const text = (l, n) => clip(l, n);
  const log = (Array.isArray(src.log) ? src.log : []).slice(-400).filter((l) => l && typeof l === 'object').map((l) => ({
    who: ['gm', 'you', 'player', 'app', 'ooc'].includes(l.who) ? l.who : 'app', name: text(l.name, 60), text: text(l.text, 2000), ...(l.dice ? { dice: text(l.dice, 200) } : {}), ...(l.q ? { q: text(l.q, 300) } : {}), ...(l.recap ? { recap: true } : {}), at: Number(l.at) || now
  })).map((l) => (l.who === 'gm' ? { ...l, raw: l.text } : l));
  const scenes = (Array.isArray(src.scenes) ? src.scenes : []).slice(-200).map((s, i) => ({ n: i + 1, title: text(s?.title, 60) || `Scene ${i + 1}`, kind: text(s?.kind, 12) || 'place', at: Number(s?.at) || now, turn: Number(s?.turn) || 0 }));
  const quests = (Array.isArray(src.quests) ? src.quests : []).slice(-24).map((q) => ({ text: text(q?.text, 100), done: q?.done === true, scene: text(q?.scene, 60) })).filter((q) => q.text);
  const world = {};
  if (src.world && typeof src.world === 'object') for (const k of ['people', 'places', 'promises', 'threads']) world[k] = (Array.isArray(src.world[k]) ? src.world[k] : []).slice(-30).map((e) => ({ name: text(e?.name, 60), note: text(e?.note, 160), scene: text(e?.scene, 60) })).filter((e) => e.name);
  let map = null;
  if (src.map && Array.isArray(src.map.nodes)) {
    const nodes = src.map.nodes.slice(0, MAP_MAX).map((n, i) => ({ id: i, name: text(n?.name, 60), kind: text(n?.kind, 12) || 'place', x: Math.max(-99, Math.min(99, Math.round(Number(n?.x) || 0))), y: Math.max(-99, Math.min(99, Math.round(Number(n?.y) || 0))) })).filter((n) => n.name);
    const ids = new Map(src.map.nodes.slice(0, MAP_MAX).map((n, i) => [n?.id, i]));
    const links = (Array.isArray(src.map.links) ? src.map.links : []).map((l) => [ids.get(l?.[0]), ids.get(l?.[1])]).filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b) && a < nodes.length && b < nodes.length && a !== b).slice(0, 120);
    map = { nodes, links, at: ids.has(src.map.at) ? ids.get(src.map.at) : nodes.length - 1 };
  }
  const shop = src.shop && typeof src.shop === 'object' ? readCoins({ shop: src.shop }).shop : null;
  return {
    id: crypto.randomUUID().slice(0, 12), title: text(src.title, 60) || 'A campaign from a friend', setting: text(src.setting, 20) || 'own', settingText: text(src.settingText, 300) || 'Classic fantasy.', hook: text(src.hook, 300),
    tone: text(src.tone, 10), keepOut: text(src.keepOut, 300), pace: ['short', 'evening', 'campaign'].includes(src.pace) ? src.pace : 'campaign', status: src.status === 'over' ? 'over' : 'paused',
    party, turn: Number.isInteger(src.turn) && src.turn >= 0 && src.turn < party.length ? src.turn : 0, round: Math.max(1, Number(src.round) || 1), scenes, log, summary: text(src.summary, 900), cards: null, kind: null,
    foes: [], quests, world, extras: {}, props: {}, rules: cleanRules(src.rules), difficulty: cleanDifficulty(src.difficulty), coins: Math.max(0, Math.min(MAX_COINS, Number(src.coins) || 0)), shop: shop && Object.keys(shop).length ? shop : null,
    map, riddlesUsed: (Array.isArray(src.riddlesUsed) ? src.riddlesUsed : []).filter((id) => riddleById(id)), from: 'a friend', at: now, started: Number(src.started) || now
  };
}
