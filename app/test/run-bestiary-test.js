// 1.5.124 The bestiary: monster bodies in the composer, the dozen built-in enemies, Met filled from the game master's
// "here", the Characters page (You / Party / Met / Enemies), the preview timer, Help.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compose, encodeParts, decodeParts, PARTS, DEFAULT_PARTS, MONSTER_BODIES, partsFor } from '../public/avatars.js';
import { characterHtml } from '../public/character.js';
import { frameRows } from '../public/bob-sprite.js';
import { ENEMIES, enemyById, kindOf, lookFor, metEntry, meet, listMet, rememberMet, forgetMet, enemyLine } from '../src/bestiary.js';
import { parseGm, gmSystem, cleanSheet, adventureRoute, lastParty, saveGame } from '../src/adventure.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- monster bodies ----
{
  check('four monster bodies, on the body picker', MONSTER_BODIES.join() === 'beast,crawler,blob,giant' && MONSTER_BODIES.every((b) => PARTS.body.some(([v]) => v === b)));
  for (const b of MONSTER_BODIES) {
    const l = compose({ ...DEFAULT_PARTS, body: b, skin: '3', face: '5' });
    check(`${b}: 16 rows, every letter coloured, eyes and mouth, blinks`, l.map.length === 16 && l.map.every((r) => [...r].every((ch) => ch === '.' || l.palette[ch])) && l.map.some((r) => r.includes('E')) && l.map.some((r) => r.includes('X')) && frameRows({ blink: true }, l).every((r) => !r.includes('E')));
  }
  check('a beast or blob has only body, face and hide to pick; a big humanoid takes armour and kit', partsFor('beast').join() === 'body,face,skin' && partsFor('blob').join() === 'body,face,skin' && partsFor('giant').join() === 'body,face,skin,armour,weapon,shield');
  const bare = compose({ ...DEFAULT_PARTS, body: 'giant' }), armed = compose({ ...DEFAULT_PARTS, body: 'giant', armour: 'plate', weapon: 'hammer', shield: 'tall' });
  check('armour follows the giant\'s own shape (the gap between the legs stays), kit on the edges', bare.map[14][7] === '.' && armed.map[14][7] === '.' && armed.map[13][4] === 'T' && armed.map[8][0] !== '.' && armed.map[12][15] !== '.' && /bare-chested/.test(bare.what) && /plate armour, with a hammer and a shield/.test(armed.what));
  check('faces change the shape a little (ears, horns, drips)', compose({ ...DEFAULT_PARTS, body: 'beast', face: '1' }).map.join() !== compose({ ...DEFAULT_PARTS, body: 'beast', face: '2' }).map.join() && compose({ ...DEFAULT_PARTS, body: 'blob', face: '1' }).map.join() !== compose({ ...DEFAULT_PARTS, body: 'blob', face: '0' }).map.join());
  check('the words: "A moss-coloured beast with keen eyes", an ember one', /^A moss-coloured beast with keen eyes$/.test(compose({ ...DEFAULT_PARTS, body: 'beast', skin: '0', face: '1' }).what) && /^An ember-coloured crawler/.test(compose({ ...DEFAULT_PARTS, body: 'crawler', skin: '7' }).what));
  const html = characterHtml({ ...DEFAULT_PARTS, body: 'blob' });
  check('the screen labels a monster\'s colours Hide (Moss, Stone…) and hides the outfit pickers', /char-label">Hide</.test(html) && /aria-label="Moss"/.test(html) && !/data-part="outfit"/.test(html) && !/data-part="hair"/.test(html));
  check('Bob\'s own screen still offers no monster bodies', !/value="beast"/.test(characterHtml(DEFAULT_PARTS, { bodies: ['m', 'robot', 'alien'] })));
}

// ---- the dozen enemies ----
{
  check('twelve enemies, each with a name, hearts, an attack, a trick, a line and a look that draws', ENEMIES.length === 12 && ENEMIES.every((e) => e.id && e.name && e.hearts >= 1 && e.hearts <= 6 && e.attack && e.trick && e.flavour && e.look && (decodeParts(e.look) || /^odd-\d+$/.test(e.look))));
  check('the usual suspects are there', ['goblin', 'skeleton', 'wolf', 'bandit', 'rat', 'spider', 'orc', 'cultist', 'slime', 'ghost', 'troll', 'dragon'].every((id) => enemyById(id)));
  check('a dragon is the toughest, a giant rat the softest', enemyById('dragon').hearts === 6 && enemyById('rat').hearts === 1);
  check('the sheet line reads like a rule', /^Goblin: 2 hearts; attacks with a rusty dagger/.test(enemyLine(enemyById('goblin'))) && /1 heart;/.test(enemyLine(enemyById('rat'))));
  check('the game master is told the dozen as written', /Common enemies, as written/.test(gmSystem({ party: [cleanSheet({ name: 'A' })], settingText: 'x', pace: 'short', scenes: [] })) && /Troll: 5 hearts/.test(gmSystem({ party: [cleanSheet({ name: 'A' })], settingText: 'x', pace: 'short', scenes: [] })));
  check('"here" now asks for creatures and enemies too', /people and creatures, enemies included/.test(gmSystem({ party: [cleanSheet({ name: 'A' })], settingText: 'x', pace: 'short', scenes: [] })));
}

// ---- who is what ----
{
  check('names map to enemy types, creature shapes or people', kindOf('three goblins').enemy === 'goblin' && kindOf('a pack of wolves').enemy === 'wolf' && kindOf('an ogre').enemy === 'troll' && kindOf('a cave bear').shape === 'beast' && kindOf('a rusted turret').shape === 'robot' && kindOf('the innkeeper').shape === 'person' && kindOf('Lady Vex').shape === 'person');
  check('the same name always draws the same picture; different names differ', lookFor('the innkeeper') === lookFor('The Innkeeper') && lookFor('the innkeeper') !== lookFor('the blacksmith') && lookFor('a goblin') === enemyById('goblin').look);
  check('a person\'s look is a full design (hair, outfit), a creature\'s a monster body', decodeParts(lookFor('the innkeeper')).hair !== undefined && ['m', 'f'].includes(decodeParts(lookFor('the innkeeper')).body) && decodeParts(lookFor('a cave bear')).body === 'beast');
  check('words like "she" or "lady" draw a woman', decodeParts(lookFor('the lady of the house')).body === 'f' && decodeParts(lookFor('Queen Mab')).body === 'f');
  const m = metEntry('three goblins', { scene: 'The gate', game: 'Wren and company' });
  check('a Met entry: kind, type, look, where met', m.kind === 'enemy' && m.type === 'goblin' && m.look === enemyById('goblin').look && m.scene === 'The gate' && /^[0-9a-f]{10}$/.test(m.id) && metEntry('the innkeeper').kind === 'person' && metEntry('a cave bear').kind === 'creature');
}

// ---- Met in a game, and across games ----
{
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-met-'));
  const cfg = { dataDir, adventure: {}, models: { bob: 'x' } };
  const game = { id: 'g1', title: 'Wren and company', party: [cleanSheet({ name: 'Wren' })], scenes: [{ n: 1, title: 'The tavern' }], met: [] };
  const fresh = meet(game, ['Wren', 'the innkeeper', 'a hooded stranger', 'three goblins'], cfg);
  check('meet adds everyone who is here except the party, once', fresh.length === 3 && game.met.length === 3 && meet(game, ['the innkeeper', 'THE INNKEEPER'], cfg).length === 0 && game.met.length === 3);
  check('the bestiary file remembers them across games, newest first', listMet(cfg).length === 3 && listMet(cfg)[0].name === 'the innkeeper' && listMet(cfg).every((x) => x.game === 'Wren and company'));
  meet({ id: 'g2', title: 'Second', party: [], scenes: [], met: [] }, ['the innkeeper', 'a dragon'], cfg);
  check('one entry per name across games; a later meeting moves it up', listMet(cfg).length === 4 && listMet(cfg)[0].name === 'the innkeeper' && listMet(cfg)[1].name === 'a dragon');
  for (let i = 0; i < 90; i++) rememberMet(cfg, [metEntry(`stranger ${i}`)]);
  check('at most 80 are kept', listMet(cfg).length === 80);
  const id = listMet(cfg)[5].id;
  check('forget removes one', !forgetMet(cfg, id).some((x) => x.id === id));
  // parseGm -> here -> meet, through the game's applyGm path is covered by run-adventure-test; here the route and view
  const brain = { cfg, broadcast() {}, lenders: null, ensureModel: async () => {}, chatSafe: async () => '', gate: { done() {} }, settle: async () => {}, log() {} };
  const res = () => ({ code: 0, body: null }); const send = (r, code, body) => { r.code = code; r.body = body; };
  let r = res(); await adventureRoute({ req: { method: 'GET' }, res: r, p: '/api/adventure', brain, body: async () => ({}), send });
  check('the start-card view carries met, the dozen enemies and the last party', r.code === 200 && Array.isArray(r.body.met) && r.body.met.length === 79 && r.body.enemies.length === 12 && 'lastParty' in r.body);
  saveGame(cfg, { id: 'game-9', title: 'Saved one', settingText: 'x', pace: 'short', status: 'paused', party: [cleanSheet({ name: 'Pip' })], scenes: [], log: [], at: Date.now() });
  check('lastParty is the newest saved game\'s party', lastParty(cfg)?.title === 'Saved one' && lastParty(cfg).party[0].name === 'Pip');
  r = res(); await adventureRoute({ req: { method: 'POST' }, res: r, p: '/api/adventure/met/forget', brain, body: async () => ({ id: listMet(cfg)[0].id }), send });
  check('POST /api/adventure/met/forget answers with the list', r.code === 200 && r.body.met.length === 78);
  check('parseGm keeps "here" as names for meet', parseGm('Text. <<<{"here":["the innkeeper","a wolf"],"exits":[]}>>>').here.join() === 'the innkeeper,a wolf');
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// ---- the page, the timer, Help ----
{
  const adv = read('public/adventure.js'), ch = read('public/character.js'), css = read('public/style.css');
  check('the Characters page: 📖 Characters on the start card and the table, four tabs, Back', /data-chars-open>📖 Characters/.test(adv) && (adv.match(/data-chars-open/g) || []).length >= 2 && /\['you', '🧍 You'\], \['party', '👥 Party'\], \['met', '📖 Met'\], \['enemies', '⚔ Enemies'\]/.test(adv) && /data-chars-back>← Back/.test(adv));
  check('You: New character, Edit, Delete this character asking in the page, saved through the character screen', /➕ New character/.test(adv) && /data-chars-edit/.test(adv) && /Delete this character/.test(adv) && /Delete for good/.test(adv) && /useLabel: 'Save this character'/.test(adv));
  check('Met: Forget between games asks in the page (Forget for good / Keep it), drawn by Bob the moment they are named', /data-met-forget/.test(adv) && /Forget for good/.test(adv) && /Forget \$\{esc\(m\.name\)\}\?/.test(adv) && /Drawn by me the moment they're named/.test(adv));
  check('hearts on the Party and Enemies cards carry a spoken label', /aria-label="\$\{c\.hearts\} of 5 hearts"/.test(adv) && /aria-label="\$\{e\.hearts\} heart/.test(adv));
  check('Enemies: the dozen with hearts, attack, trick and flavour', /The usual suspects/.test(adv) && /hearts\(e\.hearts, e\.hearts\)/.test(adv));
  check('the Journal button no longer shares its icon with Characters', /📓 Journal/.test(adv) && !/📖 Journal/.test(adv));
  check('the preview timer skips a hidden page, a hidden canvas and one scrolled out of view', /document\.hidden/.test(ch) && /offsetParent/.test(ch) && /getBoundingClientRect/.test(ch));
  check('styles for the page', /\.adv-char-list/.test(css) && /\.adv-chars-top/.test(css));
  const h = (id) => HELP.find((e) => e.id === id);
  check('Help: Adventure explains the Characters page with the tab names word for word', /📖 Characters/.test(h('adventure').html) && /<strong>You<\/strong>/.test(h('adventure').html) && /<strong>Met<\/strong>/.test(h('adventure').html) && /<strong>Enemies<\/strong>/.test(h('adventure').html) && /bestiary/.test(h('adventure').words));
  check('Help: glossary Bestiary, FAQ on enemies', /<dt>Bestiary<\/dt>/.test(h('glossary').html) && h('faq-adventure-enemies') && /as written/.test(h('faq-adventure-enemies').html));
  const pub = [adv, ch, read('src/bestiary.js'), read('public/avatars.js'), h('adventure').html].join('\n');
  check('no series title or other games\' names in the public files', !/bobiverse/i.test(pub) && !/dungeons\s*&\s*dragons|\bd&d\b|monster manual|beholder|mind flayer|owlbear/i.test(pub));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
