// 1.5.206 🧭 Journey: Adventure played like a late-nineties console role-playing game. The four-sided walking
// figures (public/journey-sides.js), the rules (public/journey-rules.js), the save and the keeper reward on the
// server (src/adventure-journey.js), the screen's wiring, the phone's copies and Help. Nothing reads the real computer:
// the save goes to a temporary folder and the dice are loaded.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as S from '../public/journey-sides.js';
import * as R from '../public/journey-rules.js';
import { avatar, compose, encodeParts, DEFAULT_PARTS, allAvatarIds } from '../public/avatars.js';
import { LOOKS } from '../public/bob-sprite.js';
import { loadJourney, saveJourney, journeyReward, journeyRoute, deleteJourney } from '../src/adventure-journey.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` ${extra}` : ''}`); };
const dice = (...seq) => { let i = 0; return () => seq[i++ % seq.length]; };

// ---------- Four sides, walking, for every look ----------
{
  const looks = [...Object.values(LOOKS), ...allAvatarIds().map(avatar), avatar(encodeParts({ ...DEFAULT_PARTS, body: 'f', hair: 'long', armour: 'plate', weapon: 'sword', shield: 'tall' })), avatar(encodeParts({ ...DEFAULT_PARTS, body: 'beast' })), avatar(encodeParts({ ...DEFAULT_PARTS, body: 'giant', weapon: 'axe' }))];
  let bad = '';
  for (const lk of looks) for (const f of S.FACINGS) for (let step = 0; step < 4; step++) {
    const fig = S.figure(lk, { facing: f, step, compose });
    if (!fig || fig.rows.length !== 20 || fig.rows.some((r) => r.length !== 16) || fig.rows.some((r) => [...r].some((ch) => ch !== '.' && !fig.palette[ch]))) { bad = `${lk?.name} ${f} ${step}`; break; }
  }
  check('every look (Bob\'s, all the avatars, the character screen\'s) has 20x16 figures for four sides and four walk steps, every pixel coloured', !bad, bad);
  const hero = avatar(encodeParts({ ...DEFAULT_PARTS, hair: 'short' }));
  const front = S.figure(hero, { facing: 'down', compose }), back = S.figure(hero, { facing: 'up', compose });
  const left = S.figure(hero, { facing: 'left', compose }), right = S.figure(hero, { facing: 'right', compose });
  check('front shows the face; the back shows the back of the head (no eyes or mouth)', front.rows.slice(0, 11).join('').includes('E') && !/[EX]/.test(back.rows.slice(0, 11).join('')));
  check('the right side is the left side mirrored', right.rows.every((r, y) => r === [...left.rows[y]].reverse().join('')));
  check('a side view has one eye, at the front edge, and is narrower than the front', (left.rows.join('').match(/E/g) || []).length === 1 && left.rows[5].replace(/\./g, '').length < front.rows[5].replace(/\./g, '').length);
  const walk = [0, 1, 2, 3].map((s) => S.figure(hero, { facing: 'down', step: s }).rows.slice(16).join('|'));
  check('walking moves the legs: steps 1 and 3 differ from standing and from each other', walk[1] !== walk[0] && walk[3] !== walk[0] && walk[1] !== walk[3] && walk[0] === walk[2]);
  const side = [0, 1, 3].map((s) => S.figure(hero, { facing: 'left', step: s }).rows.slice(16).join('|'));
  check('side walking strides: near leg forward, then the far leg', side[0] !== side[1] && side[1] !== side[3]);
  const slime = avatar(encodeParts({ ...DEFAULT_PARTS, body: 'blob' }));
  check('a creature with no legs bobs instead of growing legs', !S.figure(slime, { step: 0 }).legs && S.figure(slime, { step: 1 }).rows.join('') !== S.figure(slime, { step: 0 }).rows.join(''));
  const armed = avatar(encodeParts({ ...DEFAULT_PARTS, weapon: 'sword', shield: 'round' }));
  const bare = S.figure(armed, { facing: 'down', compose });
  check('a character-screen look\'s kit comes off the body so it can be drawn turning with them', bare.kit.weapon === 'sword' && bare.kit.shield === 'round' && !bare.rows.some((r) => r[0] !== '.'));
}
{
  check('every weapon has its own shape', S.WEAPON_KINDS.every((k) => S.weaponCells(k, 0).length >= 3));
  const at = (a) => S.weaponCells('sword', a, { x: 8, y: 10 }).map((c) => `${c[0]},${c[1]}`).sort().join(' ');
  check('a weapon drawn at another angle lands on other pixels (it really turns)', new Set([0, 45, 90, 135, 180, -90].map(at)).size === 6);
  const up = S.weaponCells('spear', 0, { x: 8, y: 10 }), rightward = S.weaponCells('spear', 90, { x: 8, y: 10 });
  check('angle 0 points up, 90 points right', Math.min(...up.map((c) => c[1])) < 3 && Math.max(...rightward.map((c) => c[0])) > 15);
  check('each facing swings through its own arc; left is right mirrored', S.FACINGS.every((f) => S.swingAngles(f).length >= 4) && S.swingAngles('left').every((a, i) => a === -S.swingAngles('right')[i]) && S.swingAngles('down').join() !== S.swingAngles('up').join());
  check('every facing has a resting angle for walking', S.FACINGS.every((f) => Number.isFinite(S.REST_ANGLE[f])));
  check('shields turn too: narrower from the side', S.shieldCells('round', 'left').length < S.shieldCells('round', 'down').length && !S.shieldCells('none').length);
  const calls = [];
  const ctx = { fillStyle: '', globalAlpha: 1, fillRect: (x, y, w, h) => calls.push([x, y, w, h]) };
  S.drawFigure(ctx, 10, 20, 2, avatar('m-1'), { facing: 'left', step: 1, weapon: 'axe', shield: 'tall', angle: 60 });
  check('drawFigure paints the figure and its kit, at the size asked', calls.length > 60 && calls.every(([x, y, w]) => w === 2 && x >= 10 - 40 && y >= 20 - 40));
  const flashed = []; const ctx2 = { set fillStyle(v) { flashed.push(v); }, get fillStyle() { return ''; }, globalAlpha: 1, fillRect() {} };
  S.drawFigure(ctx2, 0, 0, 1, avatar('m-1'), { flash: true });
  check('a hit flashes the figure white', flashed.length > 0 && flashed.every((c) => c === '#ffffff'));
  check('darker() darkens and copes with junk', S.darker('#808080', 0.5) === '#404040' && S.darker('nope') === '#2a2a30');
}

// ---------- The land ----------
const world = R.makeWorld('test-seed');
{
  check('the same seed makes the same land', JSON.stringify(R.makeWorld('test-seed')) === JSON.stringify(world) && JSON.stringify(R.makeWorld('other')) !== JSON.stringify(world));
  const w = world.maps.world;
  check('the overworld is the right size, every tile known', w.rows.length === R.WORLD_H && w.rows.every((r) => r.length === R.WORLD_W && [...r].every((ch) => R.TILES[ch])));
  let allOk = true;
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', '1', '2', '3', '99']) {
    const lw = R.makeWorld(seed), m = lw.maps.world;
    const j = R.newJourney({ seed, party: [{ name: 'A', cls: 'fighter', who: 'you' }] });
    const seen = new Set([`${j.x},${j.y}`]), q = [[j.x, j.y]];
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (seen.has(`${nx},${ny}`) || !R.TILES[m.rows[ny]?.[nx]]?.walk) continue; seen.add(`${nx},${ny}`); q.push([nx, ny]); } }
    if (!m.doors.every((d) => seen.has(`${d.x},${d.y}`)) || !m.chests.every((c) => seen.has(`${c.x},${c.y}`)) || m.chests.length < 5) allOk = false;
    for (const id of ['cave1', 'cave2', 'cave3']) {
      const c = lw.maps[id];
      const s2 = new Set([`${c.start.x},${c.start.y}`]), q2 = [[c.start.x, c.start.y]];
      while (q2.length) { const [x, y] = q2.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (s2.has(`${nx},${ny}`) || !R.TILES[c.rows[ny]?.[nx]]?.walk) continue; s2.add(`${nx},${ny}`); q2.push([nx, ny]); } }
      if (!s2.has(`${c.boss.x},${c.boss.y}`) || !c.doors.every((d) => s2.has(`${d.x},${d.y}`))) allOk = false;
    }
  }
  check('on many seeds: every cave and chest can be walked to from the village, and every keeper from its cave\'s way in', allOk);
  check('the village folk stand on the square and are made by the character generator', w.people.length >= 5 && w.people.every((p) => R.TILES[w.rows[p.y][p.x]].walk && avatar(encodeParts(p.parts))));
  check('each cave has its keeper and its way out', ['cave1', 'cave2', 'cave3'].every((id, i) => world.maps[id].boss.id === `boss${i + 1}` && world.maps[id].doors[0].to === 'world'));
}

// ---------- Walking ----------
{
  const j = R.newJourney({ seed: 'test-seed', party: [{ name: 'Wren', cls: 'fighter', who: 'you' }, { name: 'Bob', cls: 'wizard', who: 'bob' }] });
  check('a new journey starts in the village square with tonics and a few coins', world.maps.world.rows[j.y][j.x] === '*' && j.bag.tonic === 3 && j.gold === 30 && j.party.length === 2);
  check('the party\'s starting kit is theirs to swap on the paper doll', j.owned.weapon.includes('sword') && j.owned.weapon.includes('staff') && j.owned.armour.includes('leather'));
  const before = { x: j.x, y: j.y };
  const r = R.walk(world, j, 'down', () => 0.9);
  check('an arrow turns and steps when the way is clear', r.moved && j.y === before.y + 1 && j.facing === 'down');
  const j2 = R.newJourney({ seed: 'test-seed' });
  const v = world.maps.world.village;
  j2.x = v.x + 1; j2.y = v.y + 2; // next to the west fence
  const bump = R.walk(world, j2, 'left');
  check('fences, houses, trees and water stop you; you turn to face them', !bump.moved && j2.facing === 'left' && j2.x === v.x + 1);
  check('nothing jumps out in the village', (() => { const k = R.newJourney({ seed: 'test-seed' }); k.danger = 999; return !R.walk(world, k, 'right').battle; })());
  // Long grass: walk until something jumps out.
  const m = world.maps.world;
  let gx = -1, gy = -1;
  for (let y = 1; y < m.h - 1 && gx < 0; y++) for (let x = 1; x < m.w - 2; x++) if (m.rows[y][x] === '"' && m.rows[y][x + 1] === '"' && !m.chests.some((c) => c.y === y && (c.x === x || c.x === x + 1))) { gx = x; gy = y; break; }
  const k = R.newJourney({ seed: 'test-seed' }); k.x = gx; k.y = gy; k.danger = k.next - 0.5;
  const out = R.walk(world, k, 'right', () => 0.3);
  check('long grass fills the danger meter; when it tips over, a fight starts and the meter resets', Array.isArray(out.battle) && out.battle.length >= 1 && out.battle.every((id) => R.FOES[id]) && k.danger === 0);
  // Into a cave and out again.
  const door = m.doors[0];
  const c = R.newJourney({ seed: 'test-seed' }); c.x = door.x; c.y = door.y + 1;
  const inCave = R.walk(world, c, 'up');
  check('walking into a cave mouth takes you inside', inCave.door === 'cave1' && c.at === 'cave1');
  const cave = world.maps.cave1; c.x = cave.doors[0].x; c.y = cave.doors[0].y + 1;
  if (!R.TILES[cave.rows[c.y]?.[c.x]]?.walk) { c.x = cave.doors[0].x + 1; c.y = cave.doors[0].y; }
  const dirBack = c.y === cave.doors[0].y + 1 ? 'up' : 'left';
  const out2 = R.walk(world, c, dirBack);
  check('the way out leads back to just outside the cave', out2.door === 'world' && c.at === 'world' && c.x === door.x && c.y === door.y + 1);
  check('the further from the village, the harder the creatures', R.zoneAt(world, { at: 'world', x: v.x + 4, y: v.y + 3 }) === 1 && R.zoneAt(world, { at: 'world', x: m.w - 3, y: m.h - 3 }) > 1 && R.zoneAt(world, { at: 'cave3' }) === 4);
}

// ---------- Chests, the paper doll, the shop and the inn ----------
{
  const j = R.newJourney({ seed: 'test-seed', party: [{ id: 'you', name: 'Wren', cls: 'fighter', who: 'you' }] });
  const kitChest = { id: 'x', loot: 'kit:plate' }, goldChest = { id: 'y', loot: 'gold:40' }, itemChest = { id: 'z', loot: 'salts' };
  const r1 = R.openChest(world, j, kitChest);
  check('a chest with kit puts it in the party\'s kit and says so', j.owned.armour.includes('plate') && /plate/i.test(r1.text) && /Kit/.test(r1.text));
  check('an open chest stays open', R.openChest(world, j, kitChest).already === true);
  R.openChest(world, j, goldChest); R.openChest(world, j, itemChest);
  check('coins and things from chests', j.gold === 70 && j.bag.salts === 1);
  check('the paper doll only takes what you own', R.equip(j, 'you', 'armour', 'plate') && j.party[0].armour === 'plate' && !R.equip(j, 'you', 'weapon', 'axe') && R.equip(j, 'you', 'shield', 'none'));
  const m = j.party[0];
  check('plate guards more and slows you down', R.guardOf(m) > R.guardOf({ ...m, armour: 'leather' }) && R.speedOf(m) < R.speedOf({ ...m, armour: 'leather' }));
  check('a staff and a robe make better magic', R.magicOf({ ...m, weapon: 'staff', armour: 'robe' }) > R.magicOf(m));
  j.gold = 30;
  check('the shop sells for coins, and not on credit', R.buy(j, 'tonic') && j.gold === 22 && j.bag.tonic === 4 && !R.buy(j, 'plate'));
  j.gold = 100; check('the smith sells kit once', R.buy(j, 'spear') && j.owned.weapon.includes('spear') && !R.buy(j, 'spear'));
  m.hp = 1; j.gold = 15;
  check('the inn heals everyone for 10 coins', R.rest(j) && m.hp === m.maxHp && j.gold === 5 && !R.rest(j));
}

// ---------- Fights ----------
{
  const party = [{ id: 'you', name: 'Wren', cls: 'fighter', who: 'you' }, { id: 'bob', name: 'Bob', cls: 'wizard', who: 'bob' }, { id: 'pip', name: 'Pip', cls: 'cleric' }];
  const j = R.newJourney({ seed: 's', party });
  const b = R.startBattle(j, ['goblin', 'goblin', 'slime']);
  check('two of a kind are told apart (Goblin A, Goblin B)', b.foes[0].name === 'Goblin A' && b.foes[1].name === 'Goblin B' && b.foes[2].name === 'Slime');
  const ev = R.playRound(j, b, { you: { act: 'fight', target: b.foes[0].key }, bob: { act: 'skill', skill: 'firebolt', target: b.foes[2].key }, pip: { act: 'defend' } }, dice(0.5));
  check('a round plays everyone\'s turn and reports each one for the screen', ev.some((e) => e.who === 'you' && e.act === 'fight' && e.dmg > 0 && e.weapon === 'sword') && ev.some((e) => e.who === 'bob' && e.skill === 'firebolt') && ev.some((e) => e.who === 'pip' && e.act === 'defend') && ev.some((e) => e.side === 'foe'));
  const fire = ev.find((e) => e.skill === 'firebolt');
  check('fire is double against a slime', fire.weak === true);
  check('casting costs spirit', j.party[1].sp === j.party[1].maxSp - R.SKILLS.firebolt.cost);
  // A sword against a slime barely scratches it.
  const j2 = R.newJourney({ seed: 's', party: [party[0]] });
  const b2 = R.startBattle(j2, ['slime']);
  const e2 = R.playRound(j2, b2, { you: { act: 'fight' } }, dice(0.5)).find((e) => e.who === 'you');
  check('a slime shrugs off a sword ("it barely notices")', e2.tough === true && /barely notices/.test(e2.text));
  // Win: experience, coins, a level.
  const j3 = R.newJourney({ seed: 's', party: [party[0]] });
  const b3 = R.startBattle(j3, ['rat']);
  b3.foes[0].hp = 1; j3.party[0].xp = R.xpFor(1) - 1;
  R.playRound(j3, b3, { you: { act: 'fight' } }, dice(0.5));
  check('a win pays experience and coins, and enough experience is a level', b3.over === 'won' && b3.reward.xp > 0 && j3.gold > 30 && j3.party[0].level === 2 && b3.reward.ups[0].level === 2);
  // Run, but never from a keeper.
  const j4 = R.newJourney({ seed: 's', party: [party[0]] });
  const b4 = R.startBattle(j4, ['boss1']);
  R.playRound(j4, b4, { you: { act: 'run' } }, dice(0.01));
  check('there is no running from a keeper', b4.over !== 'fled' && b4.log.some((l) => /no running/.test(l)));
  const b5 = R.startBattle(j4, ['rat']);
  R.playRound(j4, b5, { you: { act: 'run' } }, dice(0.01));
  check('running from an ordinary fight can work', b5.over === 'fled');
  // Items in a fight.
  const j6 = R.newJourney({ seed: 's', party: [party[0], party[1]] });
  j6.party[1].hp = 0; j6.bag.salts = 1;
  const b6 = R.startBattle(j6, ['rat']);
  R.playRound(j6, b6, { you: { act: 'item', item: 'salts', target: 'bob' } }, dice(0.5, 0.99));
  check('Waking salts bring a fallen friend back up', j6.party[1].hp > 0 && j6.bag.salts === 0);
  // Losing: wake at the inn with half the coins.
  const j7 = R.newJourney({ seed: 'test-seed', party: [party[0]] });
  j7.party[0].hp = 1; j7.gold = 51;
  const b7 = R.startBattle(j7, ['dragon']);
  R.playRound(j7, b7, { you: { act: 'defend' } }, dice(0.5, 0.5, 0.99));
  check('a party that falls loses the fight', b7.over === 'lost');
  R.wakeAtInn(world, j7);
  check('...and wakes up at the inn, whole, with half the coins', j7.party[0].hp === j7.party[0].maxHp && j7.gold === 25 && j7.at === 'world');
  // Keepers.
  const j8 = R.newJourney({ seed: 's', party: [party[0]] });
  for (const id of ['boss1', 'boss2', 'boss3']) { const bb = R.startBattle(j8, [id]); bb.foes[0].hp = 1; R.playRound(j8, bb, { you: { act: 'fight' } }, dice(0.5)); }
  check('beating all three keepers brings the lantern stones home', j8.beaten.length === 3 && j8.won === true && /burn again/.test(R.elderLine(j8)));
  check('levels add spells: a level-4 wizard has Spark storm, a level-1 one does not', R.skillsFor('wizard', 4).includes('storm') && !R.skillsFor('wizard', 1).includes('storm'));
  check('every class has at least one skill or spell from level 1', R.CLASS_IDS.every((c) => R.skillsFor(c, 1).length >= 1));
}
// Balance, with plain fights only (no spells or items): the first zone is kind, the last keeper is not, at level 1.
{
  const trial = (L, ids, n = 120) => {
    let won = 0;
    for (let i = 0; i < n; i++) {
      const rnd = R.seeded(`trial${L}${ids}${i}`);
      const j = R.newJourney({ seed: 'b', party: [{ id: 'a', name: 'A', cls: 'fighter' }, { id: 'b', name: 'B', cls: 'wizard' }] });
      for (const m of j.party) while (m.level < L) R.levelUp(m);
      const b = R.startBattle(j, ids);
      for (let r = 0; r < 80 && !b.over; r++) R.playRound(j, b, {}, rnd);
      if (b.over === 'won') won++;
    }
    return won / n;
  };
  check('balance: two level-1 heroes nearly always beat a rat and a slime', trial(1, ['rat', 'slime']) > 0.9);
  check('balance: two level-1 heroes cannot beat Old Cinderjaw', trial(1, ['boss3'], 40) === 0);
  check('balance: two level-8 heroes usually beat the goblin chief', trial(8, ['boss1'], 60) > 0.8);
}

// ---------- The save ----------
{
  const j = R.newJourney({ seed: 'save-test', party: [{ id: 'you', name: 'Wren', cls: 'ranger', who: 'you', look: 'm-4' }] });
  j.party[0].level = 5; j.party[0].maxHp = 140; j.party[0].hp = 99; j.gold = 321; j.bag.ember = 2; j.opened.push('world:w1'); j.beaten.push('boss1');
  const back = R.cleanJourney(JSON.parse(JSON.stringify(j)));
  check('a save comes back as it went', back.party[0].level === 5 && back.party[0].hp === 99 && back.gold === 321 && back.bag.ember === 2 && back.opened.includes('world:w1') && back.beaten[0] === 'boss1' && back.party[0].look === 'm-4');
  const junk = R.cleanJourney({ ...JSON.parse(JSON.stringify(j)), at: 'nowhere', x: -5, bag: { tonic: 3, rocket: 9, water: -2 }, beaten: ['boss1', 'boss9'], party: [{ name: 'X', cls: 'necromancer', weapon: 'laser', stats: { might: 99 } }], owned: { weapon: ['laser', 'axe'] } });
  check('a save is cleaned: unknown places, items, kit, classes and keepers are dropped', junk.at === 'world' && junk.bag.rocket === undefined && junk.bag.water === undefined && junk.beaten.join() === 'boss1' && junk.party[0].cls === 'fighter' && junk.party[0].weapon === 'sword' && junk.party[0].stats.might === 5 && !junk.owned.weapon.includes('laser') && junk.owned.weapon.includes('axe'));
  check('nonsense is not a journey', R.cleanJourney(null) === null && R.cleanJourney({}) === null && R.cleanJourney('x') === null);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-journey-'));
  const cfg = { dataDir: tmp };
  try {
    check('no save yet', loadJourney(cfg) === null);
    saveJourney(cfg, j);
    const got = loadJourney(cfg);
    check('the server keeps the save in adventures/journey.json', fs.existsSync(path.join(tmp, 'adventures', 'journey.json')) && got.gold === 321 && got.party[0].level === 5);
    let threw = false; try { saveJourney(cfg, { nope: true }); } catch { threw = true; }
    check('it refuses something that isn\'t a journey', threw);
    deleteJourney(cfg); check('a journey can be deleted', loadJourney(cfg) === null);
    // The keeper reward on a saved character.
    let chars = [{ id: 'abcd1234', name: 'Wren', cls: 'ranger', stats: { might: 3, wits: 4, charm: 1, luck: 4 }, gains: [] }];
    const lib = { listCharacters: () => chars, saveCharacter: (c2, b) => { chars = [{ ...chars[0], ...b }]; return chars; } };
    journeyReward(cfg, { charId: 'abcd1234', guardian: 'boss2' }, lib);
    check('beating a keeper writes it on the saved character\'s sheet with a point on their lowest stat', chars[0].gains.includes('Beat The Webmother on a journey') && chars[0].stats.charm === 2);
    journeyReward(cfg, { charId: 'abcd1234', guardian: 'boss2' }, lib);
    check('...once per keeper', chars[0].gains.length === 1 && chars[0].stats.charm === 2);
    journeyReward(cfg, { charId: 'abcd1234', guardian: 'boss9' }, lib); journeyReward(cfg, { charId: 'nobody', guardian: 'boss1' }, lib);
    check('...and only for a real keeper and a real character', chars[0].gains.length === 1);
    // The route.
    const sent = [];
    const send = (res, code, body) => sent.push([code, body]);
    const call = (method, p, b) => journeyRoute({ req: { method }, res: {}, p, brain: { cfg }, body: async () => b, send }, lib);
    await call('POST', '/api/adventure/journey', { journey: j });
    await call('GET', '/api/adventure/journey');
    check('the route saves and hands back the journey', sent[0][0] === 200 && sent[1][1].journey.gold === 321);
    await call('POST', '/api/adventure/journey/delete', {});
    await call('GET', '/api/adventure/journey');
    check('the route deletes it', sent[3][1].journey === null);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------- Wiring, the phone, Help ----------
{
  const adv = read('src/adventure.js');
  check('the Adventure route hands /api/adventure/journey to the journey code', /\/api\/adventure\/journey/.test(adv) && /journeyRoute\(/.test(adv));
  const page = read('public/adventure.js');
  check('the start card has the 🧭 Journey button, next to Characters', /data-chars-open>📖 Characters<\/button><button type="button" class="mini" data-journey/.test(page) && /'journey' in t\.dataset/.test(page));
  check('the desktop links the Journey styles', /href="\/journey\.css"/.test(read('public/index.html')));
  const play = read('public/journey-play.js');
  check('the screen: arrow keys and WASD walk, Enter acts, Esc is the menu, the pad works by touch', /ArrowUp: 'up'/.test(play) && /w: 'up'/.test(play) && /e\.key === 'Enter'/.test(play) && /e\.key === 'Escape'/.test(play) && /pointerdown/.test(play));
  check('the screen: fights animate the weapon swing and spells, and respect Animations off', /swingAngles\(facing\)/.test(play) && /ELEMENT_COLOURS/.test(play) && /still\(\)/.test(play));
  check('the screen: no style attributes (the phone page allows style-src self only)', !/style="/.test(play) && !/\.setAttribute\('style'/.test(play));
  for (const f of ['journey-rules.js', 'journey-sides.js', 'journey-play.js']) check(`public/${f} has no imports (the phone uses it as a plain script)`, !/^import\s/m.test(read(`public/${f}`)));
  const { buildJourney, WEB_COPIED } = await import(pathToFileURL(path.join(root, 'android/tools/make-shared.mjs')));
  const built = buildJourney();
  for (const [f, text] of Object.entries(built)) {
    check(`the phone's ${f} is up to date (node android/tools/make-shared.mjs)`, read(`android/app/src/main/assets/www/${f}`) === text);
    check(`the iPhone screen gets ${f} too`, WEB_COPIED.includes(f) && fs.existsSync(path.join(root, 'public/phone', f)));
  }
  const sandbox = { globalThis: {} }; sandbox.globalThis = sandbox;
  for (const f of ['journey-rules.js', 'journey-sides.js', 'journey-play.js']) vm.runInNewContext(built[f], sandbox);
  check('as plain scripts they become BobJourneyRules, BobJourneySides and BobJourneyPlay', typeof sandbox.BobJourneyRules?.makeWorld === 'function' && typeof sandbox.BobJourneySides?.drawFigure === 'function' && typeof sandbox.BobJourneyPlay?.mountJourney === 'function');
  check('...and the phone\'s rules make the same land as the desktop\'s', JSON.stringify(sandbox.BobJourneyRules.makeWorld('test-seed')) === JSON.stringify(world));
  const html = read('android/app/src/main/assets/www/index.html');
  check('the phone page loads the Journey scripts and styles, and has its panel', ['journey-rules.js', 'journey-sides.js', 'journey-play.js'].every((f) => html.includes(`<script src="${f}"></script>`)) && html.includes('href="journey.css"') && /id="journey"/.test(html));
  const phone = read('android/app/src/main/assets/www/phone.js');
  check('the phone has the 🧭 Journey button and plays with the PC\'s save', /text: '🧭 Journey', onclick: \(\) => advJourneyOpen\(\)/.test(phone) && /api: \(p, body\) => advApi\(p, body\)/.test(phone));
  const help = read('public/help-content.js');
  check('Help: Journey in the Adventure topic, an FAQ and a glossary entry', /<strong>🧭 Journey\.<\/strong>/.test(help) && /id: 'faq-adventure-journey'/.test(help) && /<dt>Journey \(Adventure\)<\/dt>/.test(help));
  check('phone Help explains Journey', /<strong>🧭 Journey\.<\/strong>/.test(read('android/app/src/main/assets/www/help.js')));
  const words = [read('public/journey-rules.js'), play, help.slice(help.indexOf('🧭 Journey'), help.indexOf('🧭 Journey') + 3000)].join('\n');
  check('own names only: no trademarked game or series names', !/final fantasy|dragon quest|chrono|zelda|pok[eé]mon|earthbound|bobiverse|squaresoft|enix/i.test(words));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
