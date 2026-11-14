// 1.5.122 The character screen: a look built from parts (the composer in avatars.js), its id, the screen's HTML,
// Bob's look rule on the server, the Adventure start card's own look and saved characters, Help.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compose, encodeParts, decodeParts, cleanParts, avatar, PARTS, PART_ORDER, DEFAULT_PARTS, partsFor } from '../public/avatars.js';
import { getLook, frameRows, glance } from '../public/bob-sprite.js';
import { characterHtml, BOB_BODIES } from '../public/character.js';
import { lookText, LOOK_ID_RE } from '../src/look.js';
import { cleanSheet, listCharacters, saveCharacter, deleteCharacter, adventureRoute, Adventure } from '../src/adventure.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

// ---- the composer ----
{
  const id = encodeParts({ body: 'm', build: 'broad', hair: 'short', hc: '6', skin: '2', beard: 'full', glasses: '1', outfit: 'hoodie', cloth: '3', armour: 'plate', weapon: 'sword', shield: 'round' });
  check('an id starts with c: and carries every part in order', id.startsWith('c:') && id.split('.').length === PART_ORDER.length && id.length < 80);
  const back = decodeParts(id);
  check('the id decodes to the same parts', back && back.build === 'broad' && back.weapon === 'sword' && back.hc === '6' && encodeParts(back) === id);
  check('a bad id decodes to nothing (and avatar() gives null)', decodeParts('c:bad') === null && decodeParts('c:' + 'x.'.repeat(13)) === null && avatar('c:nope') === null && decodeParts('c:../../x') === null);
  const look = compose(back);
  check('every letter on the map has a colour, and the eyes and mouth are there', look.map.length === 16 && look.map.every((r) => r.length === 16) && look.map.every((r) => [...r].every((ch) => ch === '.' || look.palette[ch])) && look.map.some((r) => r.includes('E')) && look.map.some((r) => r.includes('X')));
  check('it blinks and talks like any look', frameRows({ blink: true }, look).every((r) => !r.includes('E')) && frameRows({ talk: true }, look).some((r) => r.includes('O')));
  check('the same parts always draw the same picture', compose(back).map.join() === look.map.join());
  check('it says what it is, in words', /broad man/.test(look.what) && /red/.test(look.what) && /full beard/.test(look.what) && /plate armour/.test(look.what) && /sword and a shield/.test(look.what));
  const slim = compose({ ...back, build: 'slim' }), reg = compose({ ...back, build: 'regular' });
  check('build changes the body width, not the head', slim.map.slice(0, 11).join() === reg.map.slice(0, 11).join() && slim.map[13][2] === '.' && reg.map[13][2] !== '.' && look.map[13][1] !== '.');
  const bare = compose({ ...back, weapon: 'none', shield: 'none', armour: 'none' });
  check('the weapon is on the left edge, the shield on the right, armour over the body', bare.map.every((r) => r[0] === '.') && look.map.some((r) => r[0] !== '.') && bare.map.every((r) => r[15] === '.') && look.map[12][15] !== '.' && bare.map[13].slice(3, 13) !== look.map[13].slice(3, 13));
  const robot = compose({ ...DEFAULT_PARTS, body: 'robot', skin: '3', face: '2', weapon: 'axe' });
  const alien = compose({ ...DEFAULT_PARTS, body: 'alien', skin: '1', face: '5', outfit: 'labcoat' });
  check('a or an before the colour: an orange alien, a steel robot, an auburn mohawk', /^An orange alien/.test(compose({ ...DEFAULT_PARTS, body: 'alien', skin: '4' }).what) && /^A steel robot/.test(compose({ ...DEFAULT_PARTS, body: 'robot', skin: '0' }).what) && /an auburn mohawk/.test(compose({ ...DEFAULT_PARTS, hair: 'mohawk', hc: '3' }).what));
  check('a robot or alien keeps its own head on the shared body rows', /robot/.test(robot.what) && /an axe/.test(robot.what) && /alien/.test(alien.what) && /lab coat/.test(alien.what) && robot.map.some((r) => r.includes('E')) && alien.map.some((r) => r.includes('E')));
  check('the parts that fit a body: no hair on a robot, no face picker on a person', !partsFor('robot').includes('hair') && !partsFor('alien').includes('hc') && !partsFor('m').includes('face') && partsFor('f').includes('hair'));
  check('cleanParts fills gaps and throws out nonsense', cleanParts({ body: 'f', weapon: 'bazooka', hc: '99' }).weapon === 'none' && cleanParts({ body: 'f' }).body === 'f' && cleanParts({}).build === 'regular');
  const woman = compose({ ...DEFAULT_PARTS, body: 'f', hair: 'braids', hc: '4', outfit: 'dress' });
  check('hair reads naturally', /braided blond hair/.test(woman.what) && /blond hair in a bun/.test(compose({ ...DEFAULT_PARTS, hair: 'bun', hc: '4' }).what) && /short dark brown hair/.test(compose(DEFAULT_PARTS).what));
  check('one spelling throughout: Armour and Moustache', PARTS.outfit.some(([, l]) => l === 'Armour') && PARTS.beard.some(([, l]) => l === 'Moustache') && !PARTS.outfit.some(([, l]) => l === 'Armor') && /moustache/.test(compose({ ...DEFAULT_PARTS, beard: 'mustache' }).what) && /in armour/.test(compose({ ...DEFAULT_PARTS, outfit: 'armor' }).what));
  check('every hair style, outfit, armour, weapon and shield draws without a missing colour', PARTS.hair.every(([h]) => { const l = compose({ ...DEFAULT_PARTS, hair: h }); return l.map.every((r) => [...r].every((ch) => ch === '.' || l.palette[ch] !== '#808080')); })
    && PARTS.outfit.every(([o]) => compose({ ...DEFAULT_PARTS, outfit: o }).map.length === 16) && PARTS.armour.every(([a]) => compose({ ...DEFAULT_PARTS, armour: a }).map.length === 16)
    && PARTS.weapon.every(([w]) => compose({ ...DEFAULT_PARTS, weapon: w }).map.length === 16) && PARTS.shield.every(([sh]) => compose({ ...DEFAULT_PARTS, shield: sh }).map.length === 16));
  check('getLook draws a c: id like any look (and glance keeps the weapon pixel where it is)', getLook(id)?.what === look.what && glance(look.map[6], 1)[0] === look.map[6][0]);
}

// ---- the screen ----
{
  const html = characterHtml(DEFAULT_PARTS, { bodies: BOB_BODIES, useLabel: 'Wear this' });
  check("Bob's own screen offers Man, Robot and Alien, never Woman", /value="m"/.test(html) && /value="robot"/.test(html) && /value="alien"/.test(html) && !/value="f"/.test(html) && /Wear this/.test(html));
  const any = characterHtml({ ...DEFAULT_PARTS, body: 'f' }, { useLabel: 'Use for this character' });
  check('the Adventure screen offers every body, Woman included, and keeps the picked one', /<option value="f" selected>Woman/.test(any) && /Use for this character/.test(any));
  check('colours are swatches with a name for screen readers; the rest are plain selects', /char-swatches/.test(html) && /aria-label="Dark brown"/.test(html) && /aria-label="Fair"/.test(html) && /<select data-part="outfit"/.test(html) && /<select data-part="weapon"/.test(html));
  check('Surprise me, Start over, a preview and its words', /data-char-random/.test(html) && /data-char-reset/.test(html) && /char-doll/.test(html) && /short dark brown hair/.test(html));
  const robot = characterHtml({ ...DEFAULT_PARTS, body: 'robot' }, { bodies: BOB_BODIES });
  check('a robot body hides the hair and beard pickers and shows a face picker', !/data-part="hair"/.test(robot) && !/data-part="beard"/.test(robot) && /data-part="face"/.test(robot));
  check('a robot\'s swatches are named for the metal (Steel, Brass...), an alien\'s for its colours, never the skin names', /aria-label="Steel"/.test(robot) && /aria-label="Brass"/.test(robot) && !/aria-label="Fair"/.test(robot) && /char-label">Metal</.test(robot) && /aria-label="Violet"/.test(characterHtml({ ...DEFAULT_PARTS, body: 'alien' })) && !/aria-label="Fair"/.test(characterHtml({ ...DEFAULT_PARTS, body: 'alien' })));
}

// ---- the look rule, Bob's words, the sheet ----
{
  const id = encodeParts({ ...DEFAULT_PARTS, armour: 'robe', weapon: 'staff' });
  check('the one look rule accepts his own looks, avatars and designs, and refuses paths', LOOK_ID_RE.test('sysop') && LOOK_ID_RE.test('robot-3') && LOOK_ID_RE.test(id) && !LOOK_ID_RE.test('c:../x') && !LOOK_ID_RE.test('c:') && !LOOK_ID_RE.test('m-3; rm'));
  check('Bob can say what his design looks like', /Your own design/.test(lookText(id)) && /robe/.test(lookText(id)) && /staff/.test(lookText(id)));
  check('a sheet keeps a design id and drops a bad one', cleanSheet({ look: id }).look === id && cleanSheet({ look: 'c:../x' }).look === '' && cleanSheet({ look: 'f-3' }).look === 'f-3');
}

// ---- saved characters ----
{
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-chars-'));
  const cfg = { dataDir, adventure: {}, models: { bob: 'x' } };
  check('nothing saved to start with', listCharacters(cfg).length === 0);
  const id = encodeParts({ ...DEFAULT_PARTS, body: 'f', hair: 'long', weapon: 'bow', armour: 'leather' });
  let list = saveCharacter(cfg, { name: 'Wren', cls: 'rogue', trait: 'never leaves a door unopened', armour: 'lots', look: id });
  check('a character is saved with its own look, class, trait and armour', list.length === 1 && list[0].name === 'Wren' && list[0].look === id && list[0].cls === 'rogue' && list[0].armour === 'lots' && /^[a-z0-9-]+$/.test(list[0].id));
  list = saveCharacter(cfg, { id: list[0].id, name: 'Wren', cls: 'bard', look: id });
  check('saving again under the same id replaces it', list.length === 1 && list[0].cls === 'bard');
  list = saveCharacter(cfg, { name: 'wren', cls: 'wizard', look: 'robot-2' });
  check('the same name (any case) replaces it too; a bad look is dropped', list.length === 1 && list[0].cls === 'wizard' && list[0].look === 'robot-2' && saveCharacter(cfg, { name: 'Bad', look: 'c:../x' })[0].look === '');
  for (let i = 0; i < 30; i++) saveCharacter(cfg, { name: `Hero ${i}`, cls: 'fighter' });
  check('at most 24 are kept, newest first', listCharacters(cfg).length === 24 && listCharacters(cfg)[0].name === 'Hero 29');
  const victim = listCharacters(cfg)[3].id;
  check('delete removes one', !deleteCharacter(cfg, victim).some((c) => c.id === victim) && listCharacters(cfg).length === 23);
  check('the characters file is not mistaken for a campaign', !fs.readdirSync(path.join(dataDir, 'adventures')).some((f) => f !== 'characters.json'));
  // through the route and the view
  const brain = { cfg, broadcast() {}, lenders: null, ensureModel: async () => {}, chatSafe: async () => '', gate: { done() {} }, settle: async () => {}, log() {} };
  const res = () => ({ code: 0, body: null }); const send = (r, code, body) => { r.code = code; r.body = body; };
  let r = res(); await adventureRoute({ req: { method: 'POST' }, res: r, p: '/api/adventure/characters/save', brain, body: async () => ({ name: 'Pip', cls: 'cleric', look: id }), send });
  check('POST /api/adventure/characters/save answers with the list', r.code === 200 && r.body.characters[0].name === 'Pip');
  r = res(); await adventureRoute({ req: { method: 'GET' }, res: r, p: '/api/adventure', brain, body: async () => ({}), send });
  check('the start-card view carries the saved characters', r.code === 200 && Array.isArray(r.body.characters) && r.body.characters.some((c) => c.name === 'Pip'));
  r = res(); await adventureRoute({ req: { method: 'POST' }, res: r, p: '/api/adventure/characters/delete', brain, body: async () => ({ id: r.body?.characters?.[0]?.id || listCharacters(cfg)[0].id }), send });
  check('POST /api/adventure/characters/delete answers with the list', r.code === 200 && !r.body.characters.some((c) => c.name === 'Pip'));
  fs.rmSync(dataDir, { recursive: true, force: true });
}

// ---- the pages and Help ----
{
  const style = fs.readFileSync(new URL('../public/style-page.js', import.meta.url), 'utf8');
  const adv = fs.readFileSync(new URL('../public/adventure.js', import.meta.url), 'utf8');
  const equip = fs.readFileSync(new URL('../public/equip.js', import.meta.url), 'utf8');
  const game = fs.readFileSync(new URL('../public/bob-game-look.js', import.meta.url), 'utf8');
  check('1.5.222: Bob\'s game look (every avatar, Make my game look with Bob\'s bodies only, a worn design under Your own design) is in Adventure, not on Style', /data-gl-make/.test(game) && /BOB_BODIES/.test(game) && /Your own design/.test(game) && /AVATAR_GROUPS/.test(game) && /mountGameLook/.test(adv) && /chars\.tab === 'party'/.test(adv) && /data-bob-look/.test(adv) && !/AVATAR_GROUPS|data-makelook|data-avatar|BOB_BODIES|mountCharacter/.test(style) && /data-gamelook/.test(style));
  check('1.5.222: Change his game look on Settings, Personality opens Adventure, Characters, Party (from the Settings window too); the paper doll is gone', !/doll-mid/.test(equip) && /data-gamelook>Change his game look/.test(fs.readFileSync(new URL('../public/personality.js', import.meta.url), 'utf8')) && !/golook/.test(publicText('cellar.js')) && /'bob-gamelook'/.test(fs.readFileSync(new URL('../public/settings-link.js', import.meta.url), 'utf8')) && /adventurePage\.openGameLook\(\)/.test(publicText('app.js')) && /openGameLook\(\) \{ chars = \{ tab: 'party', look: true \}/.test(adv));
  check('1.5.222: the game look saves to the same setting as before, so old chats, adventures and Journey keep it', /api\('\/api\/settings', \{ look: id \}\)/.test(game) && /setLook\(id\)/.test(game));
  check('the preview blinks on a timer that stops when the box leaves the page', /setInterval/.test(fs.readFileSync(new URL('../public/character.js', import.meta.url), 'utf8')) && /blink: true/.test(fs.readFileSync(new URL('../public/character.js', import.meta.url), 'utf8')) && /root\.isConnected/.test(fs.readFileSync(new URL('../public/character.js', import.meta.url), 'utf8')));
  check('a saved or started character with no name is Hero, never the account name', !/settings\(\)\.userName \|\| 'Hero'/.test(adv) && /name: you\.name \|\| 'Hero'/.test(adv));
  check("the start card has Looks like, Change the look, Save this character and Saved characters (Delete this character asks in the page), and never sends Bob's look as the character's", /data-you-look/.test(adv) && /data-save-char/.test(adv) && /data-saved-char/.test(adv) && /Delete this character/.test(adv) && /Delete for good/.test(adv) && /Keep it/.test(adv) && !/confirm\('Delete this character/.test(adv) && /look: you\.look \|\| ''/.test(adv) && !/look: settings\(\)\.look/.test(adv));
  check("the party strip draws the owner's character (and a friend's, 1.5.204) from its own look, not Bob's", /isHumanSeat\(c\) \? \(c\.look \|\| encodeParts\(DEFAULT_PARTS\)\)/.test(adv) && /function isHumanSeat\(c\) { return c\?\.who === 'you' \|\| c\?\.who === 'friend'; }/.test(adv));
  const h = (id) => HELP.find((e) => e.id === id);
  check('Help: Style says the pixel looks moved to games, and the FAQ names the buttons word for word', /pick my game look in 🎲 Adventure/.test(h('style').html) && /pick my game look in 🎲 Adventure/.test(style) && /Change Bob's game look/.test(h('faq-game-look').html) && /Change Bob\\'s game look/.test(adv) && /Make my game look/.test(h('faq-game-look').html) && /Make my game look/.test(game) && /Change his game look/.test(h('faq-game-look').html) && /game look/.test(h('style').words));
  check('Help: Adventure explains Looks like and saved characters', /Looks like/.test(h('adventure').html) && /Change the look/.test(h('adventure').html) && /Save this character/.test(h('adventure').html));
  check('Help: FAQ and glossary', /^<p>Yes\./.test(h('faq-adventure-look').html) && /never changes it/.test(h('faq-adventure-look').html) && /<dt>Game look<\/dt>/.test(h('glossary').html) && /<dt>Character screen<\/dt>/.test(h('glossary').html));
  const pub = [style, adv, equip, fs.readFileSync(new URL('../public/avatars.js', import.meta.url), 'utf8'), fs.readFileSync(new URL('../public/character.js', import.meta.url), 'utf8'), h('style').html, h('adventure').html].join('\n');
  check('no series title or other games\' names in the public files', !/bobiverse/i.test(pub) && !/dungeons\s*&\s*dragons|d&d/i.test(pub));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
