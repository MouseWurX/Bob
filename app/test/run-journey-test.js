// 1.5.206 🧭 Journey: Adventure played like a late-nineties console role-playing game; v1.1 in 1.5.211. The four-sided
// walking figures (public/journey-sides.js), the places (public/journey-world.js), the rules (public/journey-rules.js), the save and the keeper reward on the
// server (src/adventure-journey.js), the screen's wiring, the phone's copies and Help. Nothing reads the real computer:
// the save goes to a temporary folder and the dice are loaded.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as S from '../public/journey-sides.js';
import * as R from '../public/journey-rules.js';
import * as W from '../public/journey-world.js';
import { avatar, compose, encodeParts, DEFAULT_PARTS, allAvatarIds } from '../public/avatars.js';
import { LOOKS } from '../public/bob-sprite.js';
import { loadJourney, saveJourney, journeyReward, journeyRoute, deleteJourney } from '../src/adventure-journey.js';
import { ENEMIES } from '../src/bestiary.js';

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

// ---------- The land (journey-world.js) ----------
const world = W.makeWorld('test-seed', 'medium');
const reach = (map, from) => W.reachable(map, from);
const nextTo = (set, x, y) => set.has(`${x},${y}`) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => set.has(`${x + dx},${y + dy}`));
{
  const strip = (w) => JSON.stringify({ sites: w.sites, rows: w.map('world').rows, people: w.map('world').people });
  check('the same seed makes the same land; another seed another', strip(W.makeWorld('test-seed', 'medium')) === strip(world) && strip(W.makeWorld('other', 'medium')) !== strip(world));
  check('three sizes: small, medium and large', ['small', 'medium', 'large'].every((z) => { const w = W.makeWorld('sz', z); return w.map('world').rows.length === W.SIZES[z].h && w.map('world').rows[0].length === W.SIZES[z].w; }));
  const m = world.map('world');
  check('every tile on the land is a known tile', m.rows.every((r) => [...r].every((ch) => W.TILES[ch])));
  const has = (ch) => m.rows.some((r) => r.includes(ch));
  check('the land has sea, rivers, mountains, forest, plains and beaches', ['~', 'r', '^', 'F', '.', ','].every(has));
  check('swamps and deserts turn up on some lands', ['a', 'b', 'c', 'd', 'e', 'f'].some((sd) => W.makeWorld(sd, 'large').map('world').rows.some((r) => r.includes('w'))) && ['a', 'b', 'c', 'd', 'e', 'f'].some((sd) => W.makeWorld(sd, 'large').map('world').rows.some((r) => r.includes('d'))));
  check('the edge of the land is sea', m.rows[0].split('').every((c) => c === '~') && m.rows.every((r) => r[0] === '~' && r[r.length - 1] === '~'));
  const kinds = (w) => w.sites.reduce((o, s) => ({ ...o, [s.kind]: (o[s.kind] || 0) + 1 }), {});
  const k = kinds(world);
  check('settlements: one castle, towns, villages and hamlets; caves, dungeons, a hermit and Bob\'s Inn', k.castle === 1 && k.town >= 1 && k.village >= 2 && k.hamlet >= 2 && k.cave >= 2 && k.dungeon >= 3 && k.hermit === 1 && k.bobsinn === 1);
  check('a bigger land has more places', world.sites.length < W.makeWorld('test-seed', 'large').sites.length && W.makeWorld('test-seed', 'small').sites.length < world.sites.length);
  let bad = '';
  for (const seed of ['a', 'b', 'c', 'd', 'e', '1', '2', '99']) for (const size of ['small', 'medium', 'large']) {
    const w = W.makeWorld(seed, size), wm = w.map('world');
    const r = reach(wm, w.start);
    for (const s of w.sites) if (!s.alt && !r.has(`${s.x},${s.y}`)) bad ||= `${seed} ${size} ${s.kind} unreachable`;
    for (const s of w.sites) if (s.alt && !(s.alt === 'sky' ? 'S' : 'A').includes(wm.rows[s.y][s.x])) bad ||= `${seed} ${size} ${s.kind} not marked`;
    if (['boss1', 'boss2', 'boss3'].some((id) => !w.sites.some((s) => s.keeper === id && s.kind === 'dungeon'))) bad ||= `${seed} ${size} keepers`;
    for (const s of w.sites) {
      const mm = w.map(s.id), rr = reach(mm, mm.start);
      for (const p of mm.people) if (!nextTo(rr, p.x, p.y)) bad ||= `${seed} ${size} ${s.kind} ${p.role}`;
      for (const c of mm.chests) if (!nextTo(rr, c.x, c.y)) bad ||= `${seed} ${size} ${s.kind} chest`;
      if (mm.boss && !nextTo(rr, mm.boss.x, mm.boss.y)) bad ||= `${seed} ${size} ${s.kind} boss`;
      if (!mm.doors.length || !mm.doors.every((d) => rr.has(`${d.x},${d.y}`))) bad ||= `${seed} ${size} ${s.kind} door`;
    }
  }
  check('on many seeds and every size: every place can be walked to, every person, chest and boss reached, and the three keepers are in dungeons', !bad, bad);
  check('roads join the settlements, with bridges over rivers', m.rows.some((r) => r.includes(':')) && world.roads.length >= 4 && W.makeWorld('b', 'large').map('world').rows.some((r) => r.includes('=')));
  {
    // Walking onto a place goes in, so a place on a road, or at the end of a bridge, blocks the way past it.
    const placeTiles = new Set(Object.values(W.SITE_TILES));
    let blocked = '';
    for (const size of ['small', 'medium', 'large', 'vast']) for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'test-seed']) {
      const lw = W.makeWorld(seed, size), rows = lw.map('world').rows;
      for (const s of lw.sites) if (!s.alt && [[0, 1], [1, 0], [-1, 0], [0, -1]].some(([dx, dy]) => rows[s.y + dy]?.[s.x + dx] === '=')) blocked ||= `${seed} ${size}: ${s.kind} at the end of a bridge`;
      for (const p of lw.map('world').people.filter((q) => q.route)) if (p.route.slice(1, -1).some((t) => placeTiles.has(rows[t.y][t.x]))) blocked ||= `${seed} ${size}: a road runs through a place`;
      const inn = lw.sites.find((s) => s.id === 'inn');
      if (inn && !'IvVOK'.includes(rows[inn.y][inn.x])) blocked ||= `${seed} ${size}: the inn isn't drawn`;
    }
    check('no place stands at the end of a bridge or across a road it isn\'t heading for (the inn stands beside the road)', !blocked, blocked);
  }
  {
    // A save keeps only its seed, so a save from 1.5.218 or before must rebuild the very land it was played on.
    const print = (lw) => crypto.createHash('sha256').update(lw.map('world').rows.join('\n') + JSON.stringify(lw.sites.map((s) => [s.id, s.x, s.y]))).digest('hex').slice(0, 16);
    check('layout 1 is the 1.5.218 land, tile for tile', print(W.makeWorld('test-seed', 'small', undefined, 1)) === '99eec07ff36cfd6c' && print(W.makeWorld('test-seed', 'medium', undefined, 1)) === '7b036cff66a9fd31');
    const asked = [];
    const mw = (seed, size, style, layout) => { asked.push(layout); return W.makeWorld(seed, size, style, layout); };
    const before = R.cleanJourney({ v: 2, seed: 'test-seed', size: 'small', at: 'inn', party: [{ name: 'A', cls: 'fighter' }] }, mw);
    const fresh = R.newJourney({ seed: 'test-seed', size: 'small', party: [{ name: 'A', cls: 'fighter' }] });
    const after = R.cleanJourney(fresh, mw);
    check('a save from before 1.5.219 keeps its old land (layout 1); a new journey gets clear roads (layout 2) and keeps them', before.layout === 1 && fresh.layout === 2 && after.layout === 2 && asked.join() === '1,2' && W.makeWorld('test-seed', 'small').layout === 2);
  }
  const walkers = m.people.filter((p) => p.route);
  check('patrols and travellers walk the roads', walkers.length === world.roads.length && walkers.some((p) => p.patrol) && walkers.every((p) => p.route.length > 4 && W.TILES[m.rows[p.y][p.x]].walk));
  check('every dungeon and cave has a boss; the extra bosses fit the land and never repeat', world.sites.filter((s) => s.kind === 'dungeon' || s.kind === 'cave').every((s) => R.GUARDIANS[s.keeper]) && new Set(world.sites.map((s) => s.keeper).filter(Boolean)).size === world.sites.filter((s) => s.keeper).length);
  const castle = world.map(world.sites.find((s) => s.kind === 'castle').id);
  const roles = (mm) => mm.people.map((p) => p.role);
  check('the castle: a keep with a throne, a King and a Queen, knights, a captain and guards', castle.rows.some((r) => r.includes('Y')) && castle.people.filter((p) => p.role === 'ruler').map((p) => p.title).sort().join() === 'King,Queen' && roles(castle).filter((r) => r === 'knight').length >= 6 && roles(castle).includes('captain') && roles(castle).filter((r) => r === 'guard').length >= 4);
  check('the castle: walls and a gate, a village inside (smith, temple, trainer, barracks) and one outside (inn, shop)', castle.rows.some((r) => r.includes('G')) && castle.rows.some((r) => r.includes('W')) && ['m', 't', 'a', 'R', 'i', 's'].every((c) => castle.rows.some((r) => r.includes(c))) && castle.rows.findIndex((r) => r.includes('i')) > castle.rows.findIndex((r) => r.includes('G')) && castle.rows.findIndex((r) => r.includes('m')) < castle.rows.findIndex((r) => r.includes('G')));
  const town = world.map(world.sites.find((s) => s.kind === 'town').id), village = world.map(world.sites.find((s) => s.kind === 'village').id), hamlet = world.map(world.sites.find((s) => s.kind === 'hamlet').id);
  check('towns have a patrol of guards and a captain, villages a watchman, hamlets none', roles(town).filter((r) => r === 'guard').length >= 3 && roles(town).includes('captain') && roles(village).filter((r) => r === 'guard').length === 1 && !roles(hamlet).includes('guard'));
  check('people stand where their work is: the smith by the smithy, the priest by the temple, the trainer by the yard', ['smith:m', 'priest:t', 'trainer:a'].every((x) => { const [role, ch] = x.split(':'); const p = town.people.find((q) => q.role === role); return p && town.rows[p.y - 1][p.x] === ch; }));
  check('everyone in a place is made by the character generator, with the kit their work calls for', [...town.people, ...castle.people].every((p) => avatar(encodeParts(p.parts))) && castle.people.filter((p) => p.role === 'knight').every((p) => p.parts.armour === 'plate') && town.people.filter((p) => p.role === 'guard').every((p) => p.parts.weapon !== 'none'));
  const inn = world.map('inn');
  check('Bob\'s Inn is 44 by 32: a bar with Bob behind it, a fire, tables, a stage, beds, a notice board and a door', inn.w === 44 && inn.h === 32 && inn.rows.length === 32 && inn.rows.every((r) => r.length === 44) && ['k', 'p', 'b', 'j', 'l', 'n', 'e', 'q'].every((c) => inn.rows.some((r) => r.includes(c))) && inn.people.some((p) => p.id === 'bob' && p.role === 'keeper') && inn.people.some((p) => p.role === 'cat'));
  const ir = reach(inn, inn.start);
  check('...you can walk round the whole inn: everyone can be reached', inn.people.every((p) => nextTo(ir, p.x, p.y)));
  check('Bob\'s Inn stands on the land near home, and its door leads out to it', world.sites.some((s) => s.id === 'inn' && s.kind === 'bobsinn' && m.rows[s.y][s.x] === 'I') && inn.doors.every((d) => d.to === 'world' && Number.isInteger(d.tx)));
  const lobby = W.innOnly();
  check('before an adventure is rolled, the inn stands alone and its door goes nowhere yet', lobby.map('inn') && !lobby.map('world'));
  const hut = world.map(world.sites.find((s) => s.kind === 'hermit').id);
  check('the hermit lives alone in a hut, with a gift in a chest', hut.people.length === 1 && hut.people[0].role === 'hermit' && hut.chests[0].loot === 'gift');
}

// ---------- Coin ----------
{
  check('coin: 100 copper is a silver, 1,000 silver a gold, 100 gold a platinum', R.COIN.silver === 100 && R.COIN.gold === 1000 * R.COIN.silver && R.COIN.platinum === 100 * R.COIN.gold);
  check('1.11 is 1 silver and 11 copper', R.fmtCoin(111) === '1 silver, 11 copper' && R.fmtCoin(111, true) === '1s 11c');
  check('big sums show every coin', R.fmtCoin(R.COIN.platinum + 2 * R.COIN.gold + 3 * R.COIN.silver + 4) === '1 platinum, 2 gold, 3 silver, 4 copper' && R.fmtCoin(0) === 'no coin');
}

// ---------- Walking ----------
const P = (o) => ({ id: o.id || o.name.toLowerCase(), who: 'friend', ...o });
{
  const j = R.newJourney({ seed: 'test-seed', party: [P({ name: 'Wren', cls: 'fighter', who: 'you' }), P({ name: 'Bob', cls: 'wizard', who: 'bob' })] }, world);
  check('a new journey starts in Bob\'s Inn by the door, with tonics and 5 silver', j.at === 'inn' && R.mapOf(world, j).rows[j.y][j.x] === 'o' && j.bag.tonic === 3 && j.coin === 500 && j.party.length === 2);
  check('the party\'s starting kit is theirs to swap on the paper doll', j.owned.weapon.includes('sword') && j.owned.weapon.includes('staff') && j.owned.armour.includes('leather'));
  const r = R.walk(world, j, 'up', () => 0.9);
  check('an arrow turns and steps when the way is clear', r.moved && j.facing === 'up');
  const inn = world.map('inn');
  const d = inn.doors[0];
  Object.assign(j, { x: d.x, y: d.y - 1 });
  const out = R.walk(world, j, 'down');
  check('the inn door leads out onto the land, next to the inn', out.door === 'world' && j.at === 'world' && j.x === d.tx && j.y === d.ty);
  const lob = W.innOnly(); const k = R.newJourney({ seed: '', party: [P({ name: 'A', cls: 'fighter' })] }, lob);
  Object.assign(k, { x: d.x, y: d.y - 1 });
  check('...but before an adventure is rolled the door is stuck', R.walk(lob, k, 'down').bump?.kind === 'closed' && k.at === 'inn');
  // Into a place and out again.
  const site = world.sites.find((s) => s.kind === 'village');
  Object.assign(j, { at: 'world', x: site.exit.x, y: site.exit.y });
  const dir = site.x > site.exit.x ? 'right' : site.x < site.exit.x ? 'left' : site.y > site.exit.y ? 'down' : 'up';
  const into = R.walk(world, j, dir);
  check('walking onto a village takes you into it', into.door === site.id && j.at === site.id);
  const vm2 = world.map(site.id); const ex = vm2.doors[0];
  Object.assign(j, { x: ex.x, y: ex.y - 1 });
  const back = R.walk(world, j, 'down');
  check('the way out leads back to just outside', back.door === 'world' && j.at === 'world' && j.x === site.exit.x && j.y === site.exit.y);
  check('fences and walls stop you; you turn to face them', (() => { Object.assign(j, { at: site.id, x: 1, y: 1 }); const b2 = R.walk(world, j, 'left'); return !b2.moved && j.facing === 'left' && j.x === 1; })());
  check('nothing jumps out in a village', (() => { Object.assign(j, { at: site.id, x: vm2.start.x, y: vm2.start.y }); j.danger = 999; return !R.walk(world, j, 'up', () => 0.99).battle; })());
  // Long grass: walk until something jumps out.
  const m = world.map('world');
  let gx = -1, gy = -1;
  for (let y = 1; y < m.h - 1 && gx < 0; y++) for (let x = 1; x < m.w - 2; x++) if (m.rows[y][x] === '"' && m.rows[y][x + 1] === '"' && !m.people.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 8)) { gx = x; gy = y; break; }
  const g = R.newJourney({ seed: 'test-seed' }, world); Object.assign(g, { at: 'world', x: gx, y: gy }); g.danger = g.next - 0.5;
  const fightOut = R.walk(world, g, 'right', () => 0.3);
  check('long grass fills the danger meter; when it tips over, a fight starts and the meter resets', Array.isArray(fightOut.battle) && fightOut.battle.length >= 1 && fightOut.battle.every((id) => R.FOES[id]) && g.danger === 0);
  const z = (x, y) => R.zoneAt(world, { at: 'world', x, y });
  check('the further from home, the harder the creatures (and caves are a step harder than the land outside)', z(world.start.x, world.start.y) === 1 && Math.max(...world.sites.map((s) => z(s.x, s.y))) >= 3);
  const patrol = m.people.find((p) => p.patrol);
  const before = `${patrol.x},${patrol.y}`;
  const t = R.newJourney({ seed: 'test-seed' }, world); Object.assign(t, { at: 'world', x: patrol.x + 12, y: patrol.y });
  for (let i = 0; i < 6; i++) R.tick(world, t, () => 0.1);
  check('patrols walk their road as you go', `${patrol.x},${patrol.y}` !== before && patrol.route.some((s) => s.x === patrol.x && s.y === patrol.y));
}

// ---------- Fighting anyone ----------
{
  const w = W.makeWorld('fight-seed', 'medium');
  const town = w.sites.find((s) => s.kind === 'town'), tm = w.map(town.id);
  const j = R.newJourney({ seed: 'fight-seed', party: [P({ name: 'Wren', cls: 'fighter', who: 'you' })] }, w);
  Object.assign(j, { at: town.id, x: tm.start.x, y: tm.start.y });
  const folk = tm.people.find((p) => p.role === 'folk');
  const a = R.attackPerson(w, j, folk);
  check('you can pick a fight with anyone: a villager becomes a foe drawn with their own look', a.battle[0].person === folk && R.foe(a.battle[0], 0).parts === folk.parts && R.foe(a.battle[0], 0).name === folk.name);
  check('...and the town remembers: you are wanted here', R.isWanted(w, j) && j.wanted[town.id] > 0);
  const guard = tm.people.find((p) => p.role === 'guard');
  const ga = R.attackPerson(w, j, guard);
  check('guards close by join a fight with a guard', ga.battle.length >= 2 && ga.battle.slice(1).every((s) => ['guard', 'captain', 'knight'].includes(s.person.role)));
  const gf = R.foe({ person: guard }), ff = R.foe({ person: folk });
  const castle = w.map(w.sites.find((s) => s.kind === 'castle').id);
  const kf = R.foe({ person: castle.people.find((p) => p.role === 'knight') });
  check('guards are tougher than folk, and the castle\'s knights tougher still', gf.hp > ff.hp && gf.atk > ff.atk && kf.hp > gf.hp && kf.def > gf.def);
  check('Bob and his cat can\'t be fought', R.attackPerson(w, j, w.map('inn').people.find((p) => p.id === 'bob')).refused && R.attackPerson(w, j, w.map('inn').people.find((p) => p.role === 'cat')).refused);
  // Win against the villager: they drop coin and what they carried, and they stay down.
  const b = R.startBattle(j, [{ person: folk }]);
  b.foes[0].hp = 1;
  R.playRound(j, b, { wren: { act: 'fight' } }, dice(0.1, 0.5));
  check('a felled person always drops coin, and stays felled', b.over === 'won' && b.reward.coin > 0 && j.felled.includes(folk.id) && !R.peopleOn(w, j, tm).includes(folk));
  // Wanted: guards chase and catch you; shops won't serve you; a fine clears it.
  const near = tm.people.find((p) => p.role === 'guard' && !j.felled.includes(p.id));
  Object.assign(j, { x: near.x + 1, y: near.y });
  if (!W.TILES[tm.rows[j.y][j.x]].walk) Object.assign(j, { x: near.x, y: near.y + 1 });
  const caught = R.tick(w, j, () => 0.5);
  check('when you\'re wanted, a guard who reaches you starts a fight', Array.isArray(caught) && caught[0].person.role !== 'folk');
  j.coin = 0;
  check('the fine has to be paid in full', !R.payFine(w, j, town.id).ok && R.isWanted(w, j));
  j.coin = R.fineFor(w, j, town.id) + 5;
  check('paying the fine to a guard clears it (and the next fine costs more)', R.payFine(w, j, town.id).ok && !R.isWanted(w, j) && j.coin === 5 && R.fineFor(w, j, town.id) > R.fineFor(w, { ...j, fines: 0 }, town.id));
  j.wanted[town.id] = 3;
  Object.assign(j, { at: 'world', x: town.exit.x, y: town.exit.y });
  for (let moved = 0, i = 0; moved < 4 && i < 40; i++) { const dir = ['left', 'right', 'down'][i % 3]; const r = R.walk(w, j, dir, () => 0.99); if (r.door) R.walk(w, j, 'down'); if (r.moved && !r.door) moved++; j.danger = 0; }
  check('...or keep away long enough and it\'s forgotten', !j.wanted[town.id]);
  // Patrols help in a fight on the road.
  const pb = R.startBattle(j, ['wolf'], { helpers: [w.map('world').people.find((p) => p.patrol)] });
  const pev = R.playRound(j, pb, {}, dice(0.3));
  check('a patrol close by joins your fight against creatures', pb.allies.length === 1 && pev.some((e) => e.side === 'ally'));
}

// ---------- Chests, kit, shops, training ----------
{
  const j = R.newJourney({ seed: 'test-seed', party: [P({ id: 'you', name: 'Wren', cls: 'fighter', who: 'you' })] }, world);
  const cave = world.map(world.sites.find((s) => s.kind === 'cave').id);
  j.at = cave.id;
  const before = j.coin;
  const r1 = R.openChest(world, j, cave.chests[0]);
  check('cave chests are the good ones: real coin and usually fine kit or a scroll', j.coin > before && r1.got.length >= 2 && /Inside:/.test(r1.text));
  check('an open chest stays open', R.openChest(world, j, cave.chests[0]).already === true);
  const hoard = R.chestLoot('hoard', R.seeded('h'));
  check('Old Cinderjaw\'s hoard holds a platinum', hoard.some((g) => g.coin >= R.COIN.platinum));
  check('kit has bonuses and drawbacks: an axe adds might and costs luck; plate soaks but dodges less', R.kitStats('weapon', 'axe').mods.might === 1 && R.kitStats('weapon', 'axe').mods.luck === -1 && R.kitStats('armour', 'plate').guard > R.kitStats('armour', 'leather').guard && R.kitStats('armour', 'plate').eva < R.kitStats('armour', 'leather').eva);
  check('found kit can be better or worse: a fine sword beats a sword, a rusty one doesn\'t', R.kitStats('weapon', 'sword~fine').power > R.kitStats('weapon', 'sword').power && R.kitStats('weapon', 'sword~rusty').power < R.kitStats('weapon', 'sword').power && R.kitName('sword~fine') === 'Fine sword' && /\+5 power/.test(R.kitWords('sword~fine')));
  j.owned.armour.push('plate~light'); j.owned.weapon.push('sword~cursed');
  const m = j.party[0];
  const g0 = R.guardOf(m), e0 = R.evasionOf(m), l0 = R.statOf(m, 'luck');
  check('the paper doll only takes what you own', R.equip(j, 'you', 'armour', 'plate~light') && !R.equip(j, 'you', 'weapon', 'axe') && R.equip(j, 'you', 'shield', 'none'));
  check('what you wear changes the numbers', R.guardOf(m) > g0 && R.evasionOf(m) !== e0 && R.equip(j, 'you', 'weapon', 'sword~cursed') && R.statOf(m, 'luck') < l0);
  check('a staff and a robe make better magic', R.magicOf({ ...m, weapon: 'staff', armour: 'robe' }) > R.magicOf(m));
  j.coin = 100;
  check('shops sell for coin, and not on credit', R.buy(j, 'tonic') && j.coin === 50 && j.bag.tonic === 4 && !R.buy(j, 'plate'));
  j.coin = 2000; check('the smith sells kit once, and buys back kit nobody wears for a third', R.buy(j, 'spear') && j.owned.weapon.includes('spear') && !R.buy(j, 'spear') && R.sell(j, 'spear') === Math.round(550 / 3) && !R.sell(j, 'sword~cursed'));
  check('every seller has wares by what they do and how big the place is', R.wares('smith', 'castle').length > R.wares('smith', 'village').length && R.wares('shop', 'town').some((id) => R.ITEMS[id]?.scroll) && R.wares('peddler', 'hamlet').length > 0);
  m.hp = 1; j.coin = 45;
  check('an inn heals everyone for a few coppers', R.rest(j) && m.hp === m.maxHp && j.coin === 15 && !R.rest(j));
  // Training.
  j.coin = 100000;
  const might = m.stats.might;
  const tr = R.train(j, 'you', 'might');
  check('a trainer raises a stat for coin, dearer as it grows', tr.ok && m.stats.might === might + 1 && R.trainPrice(m, 'might') > tr.price);
  const acc = R.accuracyOf(m); R.train(j, 'you', 'acc');
  check('accuracy and evasion can be trained too', R.accuracyOf(m) === acc + 2);
  check('the hermit teaches one thing, once, for free', R.hermitTeach(j, 'you', 'wits').ok && !R.hermitTeach(j, 'you', 'luck').ok);
}

// ---------- Classes, races, skill trees ----------
{
  check('seven classes, each with three branches; the Psionist is one', R.CLASS_IDS.length === 7 && R.CLASSES.psionist && R.CLASS_IDS.every((c) => R.CLASSES[c].branches.length === 3));
  check('every class has a full tree: three branches, at least three skills each, a capstone at level 9', R.CLASS_IDS.every((c) => { const t = R.treeOf(c); return [0, 1, 2].every((b) => t.filter((s) => s.branch === b).length >= 3) && t.some((s) => s.level === 9); }));
  const pairs = []; for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) pairs.push([R.CLASS_IDS[a], R.CLASS_IDS[b]]);
  check('every combination of two classes has its own combo skill (21)', pairs.every((p) => R.comboFor(p).length === 1) && Object.keys(R.COMBOS).length === 21);
  check('races, the Pixie among them: small, quick and full of spirit', R.RACES.pixie && R.RACE_IDS.length >= 6);
  const pix = R.member({ id: 'pip', name: 'Pip', race: 'pixie', cls: 'wizard' }), hum = R.member({ id: 'h', name: 'H', race: 'human', cls: 'wizard' });
  check('a Pixie has more spirit, less health and dodges more than a Human of the same class', pix.maxSp > hum.maxSp && pix.maxHp < hum.maxHp && R.evasionOf(pix) > R.evasionOf(hum));
  const f = R.member({ id: 'f', name: 'F', cls: 'fighter' });
  check('a new character knows their first skills; the rest are learned with skill points', f.skills.includes('power') && f.skills.includes('guard') && !f.skills.includes('cleave') && f.points === 0);
  R.levelUp(f); R.levelUp(f);
  check('each level gives a skill point; a skill needs its level and the one before it in the branch', f.points === 2 && R.canLearn(f, 'sunder') !== '' && R.learn(f, 'cleave') && f.points === 1 && !R.learn(f, 'cleave'));
  check('a second class comes at level 5, a third at level 10', R.canAddClass(f, 'cleric') !== '' && (() => { while (f.level < 5) R.levelUp(f); return R.addClass(f, 'cleric') && f.skills.includes('mend') && R.canAddClass(f, 'bard') !== ''; })() && (() => { while (f.level < 10) R.levelUp(f); return R.addClass(f, 'bard') && f.classes.length === 3 && !R.addClass(f, 'rogue'); })());
  check('two classes teach their combo straight away; three add the Threefold path', R.knownSkills(f).includes('oath') && R.knownSkills(f).includes('hymn') && R.knownSkills(f).includes('threefold'));
  const mage = R.member({ id: 'm', name: 'Mana', race: 'pixie', classes: ['wizard', 'cleric', 'psionist'], level: 10 });
  const solo = R.member({ id: 's', name: 'Solo', race: 'pixie', classes: ['wizard'], level: 10 });
  check('Wizard, Cleric and Psionist make the Mana Wellspring: far more spirit, cheaper spells, spirit back every round', R.knownSkills(mage).includes('wellspring') && mage.maxSp > solo.maxSp * 1.4 && R.costOf(mage, 'firebolt') < R.costOf(solo, 'firebolt'));
  check('a pure spellcaster (no Fighter, Rogue or Ranger) gets more spirit and weaker swings', R.isPureCaster(mage) && !R.isPureCaster(f) && R.passivesOf(mage).swing < 0);
}

// ---------- Fights ----------
{
  const party = [P({ id: 'you', name: 'Wren', cls: 'fighter', who: 'you' }), P({ id: 'bob', name: 'Bob', cls: 'wizard', who: 'bob' }), P({ id: 'pip', name: 'Pip', cls: 'cleric' })];
  const j = R.newJourney({ seed: 's', party }, world);
  const b = R.startBattle(j, ['goblin', 'goblin', 'slime']);
  check('two of a kind are told apart (Goblin A, Goblin B)', b.foes[0].name === 'Goblin A' && b.foes[1].name === 'Goblin B' && b.foes[2].name === 'Slime');
  const ev = R.playRound(j, b, { you: { act: 'fight', target: b.foes[0].key }, bob: { act: 'skill', skill: 'firebolt', target: b.foes[2].key }, pip: { act: 'defend' } }, dice(0.1, 0.5));
  check('a round plays everyone\'s turn and reports each one for the screen', ev.some((e) => e.who === 'you' && e.act === 'fight' && e.dmg > 0 && e.weapon === 'sword') && ev.some((e) => e.who === 'bob' && e.skill === 'firebolt') && ev.some((e) => e.who === 'pip' && e.act === 'defend') && ev.some((e) => e.side === 'foe'));
  check('fire is double against a slime', ev.find((e) => e.skill === 'firebolt').weak === true);
  check('casting costs spirit', j.party[1].sp === j.party[1].maxSp - R.SKILLS.firebolt.cost);
  // Accuracy and evasion: a roll that's too high misses.
  const j1 = R.newJourney({ seed: 's', party: [party[0]] }, world);
  const b1 = R.startBattle(j1, ['rat']);
  const miss = R.playRound(j1, b1, { you: { act: 'fight' } }, dice(0.99)).find((e) => e.who === 'you');
  check('swings can miss: accuracy against evasion', miss.miss === true && R.hitChance(90, 10) > R.hitChance(90, 40) && R.hitChance(200, 0) <= 0.98 && R.hitChance(0, 200) >= 0.2);
  const j2 = R.newJourney({ seed: 's', party: [party[0]] }, world);
  const b2 = R.startBattle(j2, ['slime']);
  const e2 = R.playRound(j2, b2, { you: { act: 'fight' } }, dice(0.1, 0.5)).find((e) => e.who === 'you');
  check('a slime shrugs off a sword ("it barely notices")', e2.tough === true && /barely notices/.test(e2.text));
  const j3 = R.newJourney({ seed: 's', party: [party[0]] }, world);
  const b3 = R.startBattle(j3, ['rat']);
  b3.foes[0].hp = 1; j3.party[0].xp = R.xpFor(1) - 1;
  R.playRound(j3, b3, { you: { act: 'fight' } }, dice(0.1, 0.5));
  check('a win pays experience and coin, and enough experience is a level with a skill point', b3.over === 'won' && b3.reward.xp > 0 && j3.coin > 500 && j3.party[0].level === 2 && b3.reward.ups[0].point && j3.party[0].points === 1);
  check('a bandit drops what they were using, sometimes', (() => { for (let i = 0; i < 20; i++) if (R.dropsOf(R.foe('bandit'), R.seeded(`d${i}`)).some((d) => d.kit && R.kitBase(d.kit) === 'sword')) return true; return false; })());
  check('bosses always drop their prize, and scrolls turn up', R.dropsOf(R.foe('rattlecrown'), R.seeded('x')).some((d) => d.kit === 'sword~cursed') && R.dropsOf(R.foe('rattlecrown'), R.seeded('x')).some((d) => d.item === 'scroll_raise'));
  const j4 = R.newJourney({ seed: 's', party: [party[0]] }, world);
  const b4 = R.startBattle(j4, ['boss1']);
  R.playRound(j4, b4, { you: { act: 'run' } }, dice(0.01));
  check('there is no running from a boss', b4.over !== 'fled' && b4.log.some((l) => /no running/.test(l)));
  const b5 = R.startBattle(j4, ['rat']);
  R.playRound(j4, b5, { you: { act: 'run' } }, dice(0.01));
  check('running from an ordinary fight can work', b5.over === 'fled');
  const j6 = R.newJourney({ seed: 's', party: [party[0], party[1]] }, world);
  j6.party[1].hp = 0; j6.bag.salts = 1;
  const b6 = R.startBattle(j6, ['rat']);
  R.playRound(j6, b6, { you: { act: 'item', item: 'salts', target: 'bob' } }, dice(0.5, 0.99));
  check('Waking salts bring a fallen friend back up', j6.party[1].hp > 0 && j6.bag.salts === 0);
  // Raise and the other cleric spells.
  const cl = R.newJourney({ seed: 's', party: [P({ id: 'c', name: 'Cass', cls: 'cleric', level: 3 }), P({ id: 'f', name: 'Fenn', cls: 'fighter' })] }, world);
  cl.party[0].skills.push('raise'); cl.party[1].hp = 0;
  const bc = R.startBattle(cl, ['rat']);
  R.playRound(cl, bc, { c: { act: 'skill', skill: 'raise', target: 'f' } }, dice(0.5, 0.99));
  check('the Cleric\'s Raise brings a fallen friend back', cl.party[1].hp === Math.ceil(cl.party[1].maxHp * 0.5));
  // Field magic: healing on the road, and scrolls anyone can read.
  cl.party[1].hp = 1;
  const fr = R.castField(cl, 'c', 'mend', 'f', dice(0.5));
  check('healing spells work on the road, out of a fight', fr.ok && cl.party[1].hp > 1 && cl.party[0].sp < cl.party[0].maxSp);
  check('...but fighting spells don\'t', !R.castField(cl, 'c', 'light', 'f').ok);
  cl.party[1].hp = 0; cl.bag.scroll_raise = 1;
  check('anyone can read a scroll, once', R.castField(cl, 'c', 'scroll_raise', 'f', dice(0.5)).ok && cl.party[1].hp > 0 && cl.bag.scroll_raise === 0);
  const j7 = R.newJourney({ seed: 'test-seed', party: [party[0]] }, world);
  j7.party[0].hp = 1; j7.coin = 51;
  const b7 = R.startBattle(j7, ['dragon']);
  R.playRound(j7, b7, { you: { act: 'defend' } }, dice(0.1));
  check('a party that falls loses the fight', b7.over === 'lost');
  R.wakeAtInn(world, j7);
  check('...and wakes up in Bob\'s Inn, whole, with half the coin', j7.party[0].hp === j7.party[0].maxHp && j7.coin === 25 && j7.at === 'inn');
  const sp = R.newJourney({ seed: 's', party: [party[0]] }, world);
  sp.party[0].hp = 1;
  const bs = R.startBattle(sp, [{ person: world.map(world.sites.find((s) => s.kind === 'town').id).people.find((p) => p.role === 'captain') }], { spar: true });
  R.playRound(sp, bs, { you: { act: 'defend' } }, dice(0.1));
  check('sparring with the captain: losing hurts nobody for good', bs.over === 'lost' && sp.party[0].hp >= 1 && !sp.felled.length);
  const j8 = R.newJourney({ seed: 's', party: [party[0]] }, world);
  for (const id of ['boss1', 'boss2', 'boss3']) { j8.party[0].hp = 9999; j8.party[0].asleep = 0; const bb = R.startBattle(j8, [id]); bb.foes[0].hp = 1; for (let i = 0; i < 5 && !bb.over; i++) R.playRound(j8, bb, { you: { act: 'fight' } }, dice(0.1, 0.5)); }
  check('beating all three keepers brings the lantern stones home', j8.beaten.length === 3 && j8.won === true && /burn again/.test(R.questLine(world, j8)));
  check('the quest names the keepers, their dungeons and which way they lie', /Grubnick.* to the (north|south|east|west)/.test(R.questLine(world, R.newJourney({ seed: 's' }, world))));
}
// Balance, with plain fights only (no spells or items): the first zone is kind, the last keeper is not, at level 1.
{
  const trial = (L, ids, n = 120) => {
    let won = 0;
    for (let i = 0; i < n; i++) {
      const rnd = R.seeded(`trial${L}${ids}${i}`);
      const j = R.newJourney({ seed: 'b', party: [P({ id: 'a', name: 'A', cls: 'fighter' }), P({ id: 'b', name: 'B', cls: 'wizard' })] }, world);
      for (const m of j.party) while (m.level < L) R.levelUp(m);
      const b = R.startBattle(j, ids);
      for (let r = 0; r < 80 && !b.over; r++) R.playRound(j, b, {}, rnd);
      if (b.over === 'won') won++;
    }
    return won / n;
  };
  const t1 = trial(1, ['rat', 'slime']), t2 = trial(1, ['boss3'], 40), t3 = trial(8, ['boss1'], 60), t4 = trial(1, [{ person: world.map(world.sites.find((s) => s.kind === 'castle').id).people.find((p) => p.role === 'knight') }], 60);
  check('balance: two level-1 heroes nearly always beat a rat and a slime', t1 > 0.9, String(t1));
  check('balance: two level-1 heroes cannot beat Old Cinderjaw', t2 === 0, String(t2));
  check('balance: two level-8 heroes usually beat the goblin chief', t3 > 0.8, String(t3));
  check('balance: two level-1 heroes rarely beat a castle knight', t4 < 0.2, String(t4));
}

// ---------- The save ----------
{
  const j = R.newJourney({ seed: 'save-test', size: 'small', party: [P({ id: 'you', name: 'Wren', cls: 'ranger', who: 'you', look: 'm-4', race: 'elf' })] }, W.makeWorld('save-test', 'small'));
  const sw = W.makeWorld('save-test', 'small');
  const site = sw.sites.find((s) => s.kind === 'town'); const sm = sw.map(site.id);
  Object.assign(j, { at: site.id, x: sm.start.x, y: sm.start.y });
  j.party[0].level = 5; j.party[0].hp = 30; j.coin = 32100; j.bag.scroll_fire = 2; j.opened.push('site1:c0'); j.beaten.push('boss1', 'ratking'); j.felled.push('site1-folk-3'); j.wanted[site.id] = 40;
  R.addClass(j.party[0], 'wizard');
  const back = R.cleanJourney(JSON.parse(JSON.stringify(j)), W.makeWorld);
  check('a save comes back as it went: place, party, classes, race, coin, bag, felled and wanted', back.at === site.id && back.x === j.x && back.size === 'small' && back.party[0].level === 5 && back.party[0].hp === 30 && back.party[0].classes.join() === 'ranger,wizard' && back.party[0].race === 'elf' && back.coin === 32100 && back.bag.scroll_fire === 2 && back.opened.includes('site1:c0') && back.beaten.join() === 'boss1,ratking' && back.felled[0] === 'site1-folk-3' && back.wanted[site.id] === 40 && back.party[0].look === 'm-4');
  const junk = R.cleanJourney({ ...JSON.parse(JSON.stringify(j)), at: 'nowhere', x: -5, bag: { tonic: 3, rocket: 9, water: -2 }, beaten: ['boss1', 'boss99'], party: [{ name: 'X', cls: 'necromancer', race: 'robot', weapon: 'laser', stats: { might: 99 }, skills: ['fireball', 'nope'] }], owned: { weapon: ['laser', 'axe', 'sword~fine', 'sword~wow'] } }, W.makeWorld);
  check('a save is cleaned: unknown places, items, kit, classes, races, skills and bosses are dropped', junk.at === 'inn' && junk.bag.rocket === undefined && junk.bag.water === undefined && junk.beaten.join() === 'boss1' && junk.party[0].cls === 'fighter' && junk.party[0].race === 'human' && junk.party[0].weapon === 'sword' && junk.party[0].stats.might === 5 && !junk.party[0].skills.includes('fireball') && !junk.owned.weapon.includes('laser') && junk.owned.weapon.includes('axe') && junk.owned.weapon.includes('sword~fine'));
  check('nonsense is not a journey', R.cleanJourney(null) === null && R.cleanJourney({}) === null && R.cleanJourney('x') === null);
  const old = R.cleanJourney({ v: 1, seed: 'oldvale', at: 'cave2', x: 3, y: 3, gold: 77, party: [{ id: 'you', name: 'Wren', cls: 'rogue', level: 4 }], bag: { tonic: 2 }, owned: { weapon: ['spear'] }, beaten: ['boss1'] }, W.makeWorld);
  check('a save from Journey 1.0 keeps the party, kit, bag and coin (gold becomes silver-and-copper) and starts in Bob\'s Inn', old.at === 'inn' && old.coin === 770 && old.party[0].level === 4 && old.bag.tonic === 2 && old.owned.weapon.includes('spear') && old.v === 2);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-journey-'));
  const cfg = { dataDir: tmp };
  try {
    check('no save yet', loadJourney(cfg) === null);
    saveJourney(cfg, j);
    const got = loadJourney(cfg);
    check('the server keeps the save in adventures/journey.json', fs.existsSync(path.join(tmp, 'adventures', 'journey.json')) && got.coin === 32100 && got.party[0].level === 5 && got.at === site.id);
    let threw = false; try { saveJourney(cfg, { nope: true }); } catch { threw = true; }
    check('it refuses something that isn\'t a journey', threw);
    deleteJourney(cfg); check('a journey can be deleted', loadJourney(cfg) === null);
    let chars = [{ id: 'abcd1234', name: 'Wren', cls: 'ranger', stats: { might: 3, wits: 4, charm: 1, luck: 4 }, gains: [] }];
    const lib = { listCharacters: () => chars, saveCharacter: (c2, b) => { chars = [{ ...chars[0], ...b }]; return chars; } };
    journeyReward(cfg, { charId: 'abcd1234', guardian: 'boss2' }, lib);
    check('beating a boss writes it on the saved character\'s sheet with a point on their lowest stat', chars[0].gains.includes('Beat The Webmother on a journey') && chars[0].stats.charm === 2);
    journeyReward(cfg, { charId: 'abcd1234', guardian: 'boss2' }, lib);
    check('...once per boss', chars[0].gains.length === 1 && chars[0].stats.charm === 2);
    journeyReward(cfg, { charId: 'abcd1234', guardian: 'boss99' }, lib); journeyReward(cfg, { charId: 'nobody', guardian: 'boss1' }, lib);
    check('...and only for a real boss and a real character', chars[0].gains.length === 1);
    const sent = [];
    const send = (res, code, body) => sent.push([code, body]);
    const call = (method, p, b) => journeyRoute({ req: { method }, res: {}, p, brain: { cfg }, body: async () => b, send }, lib);
    await call('POST', '/api/adventure/journey', { journey: j });
    await call('GET', '/api/adventure/journey');
    check('the route saves and hands back the journey', sent[0][0] === 200 && sent[1][1].journey.coin === 32100);
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
  check('the screen: arrow keys and WASD walk, Enter acts, F fights, Esc is the menu, the pad works by touch', /ArrowUp: 'up'/.test(play) && /w: 'up'/.test(play) && /e\.key === 'Enter'/.test(play) && /e\.key === 'f'/.test(play) && /e\.key === 'Escape'/.test(play) && /pointerdown/.test(play) && /data-key="fight"/.test(play));
  check('the screen opens in Bob\'s Inn with New adventure and Resume adventure along the bottom', /enterLobby\(\);/.test(play) && /✨ New adventure/.test(play) && /▶ Resume adventure/.test(play) && /data-size/.test(play));
  check('the screen asks before picking a fight (it can\'t be taken back)', /armed !== p\.id/.test(play));
  check('the screen: fights animate the weapon swing and spells, and respect Animations off', /swingAngles\(facing\)/.test(play) && /ELEMENT_COLOURS/.test(play) && /still\(\)/.test(play));
  check('the screen: no style attributes (the phone page allows style-src self only)', !/style="/.test(play) && !/\.setAttribute\('style'/.test(play));
  for (const f of ['journey-rules.js', 'journey-world.js', 'journey-sides.js', 'journey-play.js']) check(`public/${f} has no imports (the phone uses it as a plain script)`, !/^import\s/m.test(read(`public/${f}`)));
  const { buildJourney, WEB_COPIED } = await import(pathToFileURL(path.join(root, 'android/tools/make-shared.mjs')));
  const built = buildJourney();
  for (const [f, text] of Object.entries(built)) {
    check(`the phone's ${f} is up to date (node android/tools/make-shared.mjs)`, read(`android/app/src/main/assets/www/${f}`) === text);
    check(`the iPhone screen gets ${f} too`, WEB_COPIED.includes(f) && fs.existsSync(path.join(root, 'public/phone', f)));
  }
  const sandbox = { globalThis: {} }; sandbox.globalThis = sandbox;
  for (const f of ['journey-rules.js', 'journey-world.js', 'journey-sides.js', 'journey-play.js']) vm.runInNewContext(built[f], sandbox);
  check('as plain scripts they become BobJourneyRules, BobJourneyWorld, BobJourneySides and BobJourneyPlay', typeof sandbox.BobJourneyRules?.newJourney === 'function' && typeof sandbox.BobJourneyWorld?.makeWorld === 'function' && typeof sandbox.BobJourneySides?.drawFigure === 'function' && typeof sandbox.BobJourneyPlay?.mountJourney === 'function');
  check('...and the phone makes the same land as the desktop', JSON.stringify(sandbox.BobJourneyWorld.makeWorld('test-seed', 'medium').map('world').rows) === JSON.stringify(world.map('world').rows));
  const html = read('android/app/src/main/assets/www/index.html');
  check('the phone page loads the Journey scripts and styles, and has its panel', ['journey-rules.js', 'journey-world.js', 'journey-sides.js', 'journey-play.js'].every((f) => html.includes(`<script src="${f}"></script>`)) && html.includes('href="journey.css"') && /id="journey"/.test(html));
  const phone = read('android/app/src/main/assets/www/phone.js');
  check('the phone has the 🧭 Journey button and plays with the PC\'s save', /text: '🧭 Journey', onclick: \(\) => advJourneyOpen\(\)/.test(phone) && /api: \(p, body\) => advApi\(p, body\)/.test(phone) && /R, W, S, A: AV/.test(phone));
  const help = read('public/help-content.js');
  check('Help: Journey in the Adventure topic, an FAQ and a glossary entry', /<strong>🧭 Journey\.<\/strong>/.test(help) && /id: 'faq-adventure-journey'/.test(help) && /<dt>Journey \(Adventure\)<\/dt>/.test(help));
  check('phone Help explains Journey', /<strong>🧭 Journey\.<\/strong>/.test(read('android/app/src/main/assets/www/help.js')));
  const words = [read('public/journey-rules.js'), read('public/journey-world.js'), play, help.slice(help.indexOf('🧭 Journey'), help.indexOf('🧭 Journey') + 3000)].join('\n');
  check('own names only: no trademarked game or series names', !/final fantasy|dragon quest|chrono|zelda|pok[eé]mon|earthbound|bobiverse|squaresoft|enix/i.test(words));
}

// ---------- Journey v1.2 ----------
{
  // Sprites for everything: every creature, every folk, every mount, boat and craft has a picture.
  const bestiary = new Set(ENEMIES.map((e) => e.id));
  const noArt = Object.keys(R.FOES).filter((id) => !S.beastLook(id) && !bestiary.has(id));
  check('sprites for everything: every creature has a picture', !noArt.length, noArt.join(' '));
  const art = (id) => { const lk = S.beastLook(id); if (!lk) return false; for (const f of S.FACINGS) { const fig = S.figure(lk, { facing: f, step: 1, compose }); if (!fig || fig.rows.length !== 20 || fig.rows.some((r) => r.length !== 16 || [...r].some((ch) => ch !== '.' && !fig.palette[ch]))) return false; } return true; };
  const badArt = S.BEAST_IDS.filter((id) => !art(id));
  check('every new picture draws from all four sides with its own colours', !badArt.length, badArt.join(' '));
  const crafts = [...Object.keys(R.BOATS), ...R.STYLE_IDS.flatMap((st) => [R.craftFor(st, 'fly'), R.craftFor(st, 'swim'), ...Object.keys(R.BOATS).map((b) => R.boatArt(st, b))])].filter(Boolean);
  check('sprites for everything: every boat and craft, in every style', crafts.every((id) => S.beastLook(id)), crafts.filter((id) => !S.beastLook(id)).join(' '));
  check('sprites for everything: merfolk, bird folk and centaurs', ['merfolk', 'birdfolk', 'centaur', 'kobold'].every((id) => S.beastLook(id)));
  const shapes = ['longbow', 'crossbow', 'handbow'];
  check('bows and crossbows have their own shapes, held at any angle', shapes.every((k) => S.WEAPON_SHAPES[k] && S.weaponCells(k, 45).length > 6 && S.weaponCells(k, -90).length > 6));
  check('kit with something special is tinted: rusty, blessed, cursed, arcane', ['rusty', 'blessed', 'cursed', 'arcane'].every((a) => /^#/.test(S.AFFIX_TINTS[a])) && S.tintHex('#000000', '#ffffff', 0.5) === '#808080');

  // Sizes and continents.
  check('sizes up to 2048, the biggest for computers only', W.SIZES.campaign.w === 1024 && W.SIZES.saga.w === 2048 && W.SIZES.saga.desktopOnly && !W.SIZES.campaign.desktopOnly);
  const vast = W.makeWorld('v12-test', 'vast');
  const vm2 = vast.map('world');
  check('a vast land is 256 by 192, with places to find', vm2.w === 256 && vm2.h === 192 && vast.sites.length > 40);
  check('docks on the coast, and the cities in the clouds and under the sea', vast.sites.some((x) => x.dock) && vast.sites.some((x) => x.kind === 'aerie' && x.alt === 'sky') && vast.sites.some((x) => x.kind === 'reef' && x.alt === 'deep'));
  check('other folk have places of their own', Object.keys(W.KIN_PLACES).filter((k) => vast.sites.some((x) => x.kind === k)).length >= 5);
  check('animals wander the land', vm2.people.filter((p) => p.role === 'animal').length >= 8);
  let builtAll = true; for (const x of vast.sites) { try { const m = vast.map(x.id); if (!m || !m.rows.length) builtAll = false; } catch { builtAll = false; } }
  check('every place on a vast land can be built', builtAll);
  const orcs = vast.sites.find((x) => x.kind === 'orccamp'); const orcMap = orcs && vast.map(orcs.id);
  check('an orc village is full of orcs', !orcs || orcMap.people.filter((p) => p.race === 'orc').length >= 5);
  check('a land is the same every time from its seed', JSON.stringify(W.makeWorld('v12-test', 'vast').map('world').rows) === JSON.stringify(vm2.rows));

  // Taming, pets and mounts.
  const j = R.newJourney({ seed: 'v12-test', size: 'vast', party: [{ name: 'Ash', cls: 'ranger', who: 'you' }] }, vast);
  j.bag.oats = 5;
  let b = R.startBattle(j, ['horse']);
  R.playRound(j, b, { [j.party[0].id]: { act: 'item', item: 'oats', target: b.foes[0].key } }, dice(0.01));
  check('a wild horse fed its oats comes along as a mount', j.party[0].mounts.length === 1 && j.party[0].mount === j.party[0].mounts[0].id && b.over === 'won');
  j.bag.meat = 9;
  for (let i = 0; i < 7; i++) { b = R.startBattle(j, ['wolf']); R.playRound(j, b, { [j.party[0].id]: { act: 'item', item: 'meat', target: b.foes[0].key } }, dice(0.01)); }
  check('five pets at most: the sixth eats, but won\'t come until one goes', j.party[0].pets.length === R.PET_MAX);
  b = R.startBattle(j, ['rat']);
  check('the pet out with you fights beside you', b.allies.some((a) => a.pet && a.owner === j.party[0].id));
  check('pets and mounts carry more in the bag', R.bagSize(j) === R.BAG_BASE + 10 + 25);
  const pet = j.party[0].pets[1];
  check('a pet can be renamed, taken out and let go', R.renamePet(j, j.party[0].id, 'pet', pet.id, 'Biscuit') && R.setActive(j, j.party[0].id, 'pet', pet.id) && R.release(j, j.party[0].id, 'pet', pet.id).ok && j.party[0].pets.length === R.PET_MAX - 1 && j.party[0].pet !== pet.id);
  check('a tamed pet keeps through a save', R.cleanJourney(JSON.parse(JSON.stringify(j)), () => vast).party[0].pets.length === R.PET_MAX - 1);

  // Up and down: fly on a flier, dive on a swimmer.
  const k = R.newJourney({ seed: 'v12-test', size: 'vast', party: [{ name: 'Ash', cls: 'ranger', who: 'you' }] }, vast);
  const land = vm2.rows.findIndex((r) => r.includes('.')); Object.assign(k, { at: 'world', x: vm2.rows[land].indexOf('.'), y: land });
  check('no wings, no flying', !R.rise(vast, k).ok);
  k.party[0].mounts = [{ id: 'pegasus-1', type: 'pegasus', name: 'Clover', level: 3, xp: 0, hp: 20 }, { id: 'dolphin-2', type: 'dolphin', name: 'Puddle', level: 3, xp: 0, hp: 20 }]; k.party[0].mount = 'pegasus-1';
  const up = R.rise(vast, k);
  check('a pegasus takes off (with its animation) and flies over the sea', up.ok && up.anim === 'takeoff' && k.alt === 'sky' && R.passable(vast, k, vm2, 0 + 3, 3));
  const down = R.sink(vast, k);
  check('...and lands with a bump', down.ok && down.anim === 'land' && k.alt === 'ground');
  const sky = vast.sites.find((x) => x.kind === 'aerie');
  check('a cloud city can only be reached from the sky', !R.passable(vast, { ...k, alt: 'ground', party: [{ ...k.party[0], mount: '' }] }, vm2, sky.x, sky.y) && vm2.doors.some((d) => d.x === sky.x && d.y === sky.y && d.alt === 'sky'));
  k.party[0].mount = 'dolphin-2';
  const sea = (() => { for (let y = 2; y < vm2.h - 2; y++) for (let x = 2; x < vm2.w - 2; x++) if (vm2.rows[y][x] === '~') return { x, y }; return null; })();
  Object.assign(k, sea, { riding: true });
  const dive = R.sink(vast, k);
  check('a dolphin dives to the sea floor and comes back up', dive.ok && dive.anim === 'dive' && k.alt === 'deep' && R.rise(vast, k).anim === 'surface' && k.alt === 'ground');

  // Boats, traders, quests, fishing.
  const docks = vast.sites.filter((x) => x.dock);
  const n = R.newJourney({ seed: 'v12-test', size: 'vast', party: [{ name: 'Ash', cls: 'ranger', who: 'you' }] }, vast);
  n.seen = docks.map((x) => x.id); n.at = docks[0].id; n.coin = 1e6;
  const trips = R.docksFrom(vast, n);
  check('a sailor sails to the docks you\'ve found, the boat sized to the trip', trips.length === docks.length - 1 && trips.every((t) => R.BOATS[t.boat] && t.fare >= 150));
  check('...and takes you there', R.sailTo(vast, n, trips[0].id).ok && n.at === trips[0].id);
  check('Aerie traders sell at half price', R.priceOf(n, 'honey', R.TRADER_PRICE) === Math.round(R.priceOf(n, 'honey') / 2));
  const quested = vast.sites.find((x) => x.quest);
  const q = R.questTalk(vast, n, quested.id);
  check('an Elder gives a small job', q.given && n.quests[quested.id] === 'given');
  n.at = 'world'; Object.assign(n, { x: sea.x + 1, y: sea.y, facing: 'left', alt: 'ground' });
  const fishOk = vm2.rows[sea.y][sea.x + 1] !== undefined;
  check('facing water, you can fish', !fishOk || R.fishAt(vast, n, dice(0.1))?.item === 'fish' || R.fishAt(vast, n, dice(0.1)) === null);

  // Styles: the same land told four ways.
  check('four styles', R.STYLE_IDS.join() === 'fantasy,scifi,cyber,steam');
  check('sci-fi says power cores and blasters', R.restyle('Bring back the lantern stones. A bow and two swords.', 'scifi') === 'Bring back the power cores. A blaster and two beam swords.');
  check('steampunk sails an airship', R.restyle('A ship to the cave', 'steam') === 'An airship to the mine');
  check('fantasy changes nothing', R.restyle('A ship to the cave', 'fantasy') === 'A ship to the cave');
  check('a save keeps its style', R.cleanJourney({ ...R.newJourney({ seed: 'x', style: 'cyber' }), v: 2 }).style === 'cyber');

  // Memory: the big working grids are let go once the land is made, and the phone's land comes in pieces.
  const skel = JSON.parse(JSON.stringify(W.landSkeleton(vast)));
  const pw = W.pieceWorld(skel);
  const home = vast.sites.find((x) => x.id === vast.home);
  for (const [cx, cy] of pw.need(home.x, home.y)) pw.addPiece(JSON.parse(JSON.stringify(W.landPiece(vast, cx, cy))));
  let same = true; for (let y = home.y - 11; y <= home.y + 11; y++) for (let x = home.x - 15; x <= home.x + 15; x++) if (vm2.rows[y]?.[x] !== pw.map('world').rows[y]?.[x]) same = false;
  check('the phone holds only the pieces two screens round the party, the same land as the computer\'s', same && pw.held() <= 9 && pw.held() >= 1);
  check('...far away is "not here yet", which nobody can walk onto', pw.map('world').rows[home.y]?.[(home.x + 120) % vm2.w] === undefined || Math.abs(((home.x + 120) % vm2.w) - home.x) < 40);
  pw.drop(home.x + 150 > vm2.w ? home.x - 150 : home.x + 150, home.y);
  check('...and lets go of the pieces it walks away from', pw.held() === 0);
  check('...places are still built on the phone, the same as on the computer', pw.map(vast.sites[3].id).people.length === vast.map(vast.sites[3].id).people.length);
  const play2 = read('public/journey-play.js');
  check('the screen draws the sky, the deep, riding, followers and The land view', ['drawClouds', 'drawUnder', 'blurredTile', 'seatOf', 'landPicture', 'petsHtml', 'drawVoyage', 'drawSpell'].every((f) => play2.includes(`function ${f}`)));
  check('the screen asks the computer for the land on a phone', /\/api\/adventure\/journey\/piece/.test(play2) && /phone: true/.test(read('android/app/src/main/assets/www/phone.js')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
