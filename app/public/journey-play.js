// 🧭 Journey (1.5.206): the screen. Walk the land with the arrow keys (or the pad on a phone), talk and open chests
// with Enter, Esc for the menu, and fight in turn-based battles drawn side-on: the party on the right, what jumped
// out on the left. Every figure is drawn from its own look, from the side it faces, walking, with its weapon held
// at the angle it's swinging (public/journey-sides.js). The rules are public/journey-rules.js; nothing here decides
// a roll. Nothing loads and no brain is used: it's a page you open, and it stops drawing when it's closed.
// No imports: the phone uses this same file, made into a plain script (globalThis.BobJourneyPlay) by
// android/tools/make-shared.mjs, with its own api and looks passed in.
//
// mountJourney(root, deps) with deps:
//   R, S: the rules and sides modules; A: public/avatars.js (compose, avatar, encodeParts, decodeParts)
//   lookOf(id): a look object for any look id (Bob's own looks too); bobLook: Bob's look id
//   api(path, body?): GET when no body, POST otherwise; the server keeps the save (/api/adventure/journey)
//   party: who can come along: [{ id, name, cls, look, who: 'you'|'bob'|'friend', stats?, charId? }]
//   enemyLooks: { goblin: lookId, ... } from the bestiary; still(): true when Animations are off
//   editLook(member, done(lookId)): optional, opens the character screen for your character
//   onClose(): the ✕ button
export function mountJourney(root, deps) {
  const { R, S, A } = deps;
  const doc = root.ownerDocument || globalThis.document;
  const TILE = 16, VIEW_W = 15, VIEW_H = 11;
  const W = TILE * VIEW_W, H = TILE * VIEW_H;
  let j = null, world = null, mode = 'title', saved = null, msg = '', closed = false;
  let anim = null; // the walk between two tiles: { from: {x,y}, t0 }
  let trail = []; // where the leader has been, for the others to follow
  let talk = null; // { lines: [...], i, shown, then }
  let battle = null; // { b, picks: {}, who: index, stage: 'act'|'target'|'skill'|'item'|'play'|'done', act, queue: [], fx: [], ... }
  let menu = null; // { tab: 'party'|'kit'|'bag'|'save', who }
  let shop = null; // { kind: 'shop'|'smith'|'inn' }
  let held = null, heldAt = 0, frameReq = 0, lastWander = 0, stepPhase = 0;
  const fxNumbers = []; // floating numbers in battle: { x, y, text, colour, t0 }
  const lookCache = new Map();

  root.innerHTML = `<div class="jy" tabindex="-1">
    <div class="jy-top"><span class="jy-where" aria-live="polite"></span><span class="jy-gold"></span><span class="jy-spacer"></span>
      <button type="button" class="mini" data-jy="menu" title="Menu (Esc)">☰ Menu</button><button type="button" class="mini" data-jy="save" title="Save the journey">💾 Save</button><button type="button" class="icon" data-jy="close" aria-label="Close Journey">✕</button></div>
    <div class="jy-stage"><canvas class="jy-canvas" width="${W}" height="${H}" role="img" aria-label="The Journey screen"></canvas><div class="jy-box" role="status" aria-live="polite" hidden></div></div>
    <div class="jy-pad" aria-label="Walking pad"><button type="button" data-dir="up" aria-label="Walk up">▲</button><button type="button" data-dir="left" aria-label="Walk left">◀</button><button type="button" data-dir="down" aria-label="Walk down">▼</button><button type="button" data-dir="right" aria-label="Walk right">▶</button><button type="button" class="jy-a" data-key="act" aria-label="Talk, open or swing (Enter)">A</button><button type="button" class="jy-b" data-key="menu" aria-label="Menu (Esc)">B</button></div>
    <div class="jy-panel"></div>
    <p class="jy-msg muted" role="status"></p>
  </div>`;
  const shell = root.querySelector('.jy');
  const cv = root.querySelector('.jy-canvas');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const panel = root.querySelector('.jy-panel');
  const box = root.querySelector('.jy-box');
  const still = () => { try { return Boolean(deps.still?.()); } catch { return false; } };

  // ---------- Looks ----------
  function lookFor(id) {
    if (!id) return null;
    if (lookCache.has(id)) return lookCache.get(id);
    let lk = null;
    try { lk = deps.lookOf?.(id) || A.avatar(id); } catch {}
    lookCache.set(id, lk);
    return lk;
  }
  // A party member's look with the armour they wear now (a character-screen look shows it on the body).
  function memberLook(m) {
    const id = m.look || (m.who === 'bob' ? deps.bobLook : '') || A.encodeParts({ body: 'm', outfit: 'tee' });
    const p = String(id).startsWith('c:') ? A.decodeParts(id) : null;
    if (p) return lookFor(A.encodeParts({ ...p, armour: m.armour, weapon: m.weapon, shield: m.shield }));
    return lookFor(id) || lookFor('robot-0');
  }
  const foeLook = (f) => lookFor(deps.enemyLooks?.[f.type]) || lookFor(A.encodeParts({ body: 'blob', skin: '0' }));
  const personLook = (p) => lookFor(A.encodeParts(p.parts || {}));
  function drawFig(look, x, y, px, o = {}) { try { return S.drawFigure(ctx, x, y, px, look, { compose: A.compose, ...o }); } catch { return null; } }

  // ---------- Tiles, drawn once each ----------
  const tileArt = new Map();
  const hash = (x, y, n = 0) => { let h = (x * 374761393 + y * 668265263 + n * 1442695041) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function tileCanvas(ch, frame = 0) {
    const key = `${ch}${frame}`;
    if (tileArt.has(key)) return tileArt.get(key);
    const c = doc.createElement('canvas'); c.width = TILE; c.height = TILE;
    const g = c.getContext('2d');
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const fill = (col) => { g.fillStyle = col; g.fillRect(0, 0, TILE, TILE); };
    const specks = (col, n, seed) => { for (let i = 0; i < n; i++) px(Math.floor(hash(i, seed) * 16), Math.floor(hash(seed, i) * 16), col); };
    const grass = () => { fill('#5aa04a'); specks('#4c8c3e', 14, 3); specks('#6cb85a', 8, 7); };
    if (ch === '.') grass();
    else if (ch === '"') { fill('#4e9440'); for (let i = 0; i < 9; i++) { const x = Math.floor(hash(i, 11) * 14) + 1, y = Math.floor(hash(11, i) * 12) + 3; px(x, y, '#2f6a2a'); px(x, y - 1, '#3d7f34'); px(x + 1, y - 2, '#6cb85a'); } }
    else if (ch === ':' || ch === '*') { fill(ch === '*' ? '#b8a07a' : '#c8a66a'); specks(ch === '*' ? '#9c8662' : '#a98a52', 10, 5); if (ch === '*') { g.fillStyle = '#a08a68'; for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1); for (let x = (0); x < 16; x += 8) g.fillRect(x, 0, 1, 16); } }
    else if (ch === ',') { fill('#e0cf8f'); specks('#c9b676', 10, 9); }
    else if (ch === '~') { fill('#3a78c8'); g.fillStyle = '#6aa0e0'; for (let i = 0; i < 3; i++) { const y = 3 + i * 5, x = ((i * 5) + frame * 3) % 12; g.fillRect(x, y, 4, 1); } }
    else if (ch === '=') { fill('#3a78c8'); g.fillStyle = '#8a5a2b'; g.fillRect(0, 2, 16, 12); g.fillStyle = '#6b4423'; for (let x = 0; x < 16; x += 4) g.fillRect(x, 2, 1, 12); g.fillStyle = '#4a2e18'; g.fillRect(0, 2, 16, 1); g.fillRect(0, 13, 16, 1); }
    else if (ch === 'T') { grass(); g.fillStyle = '#6b4423'; g.fillRect(7, 11, 2, 4); g.fillStyle = '#2f6a2a'; g.beginPath(); g.arc(8, 7, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3d8a38'; g.beginPath(); g.arc(6.5, 5.5, 3, 0, Math.PI * 2); g.fill(); }
    else if (ch === '^') { grass(); g.fillStyle = '#7e8a96'; g.beginPath(); g.moveTo(1, 15); g.lineTo(7, 2); g.lineTo(15, 15); g.fill(); g.fillStyle = '#a8b2bc'; g.beginPath(); g.moveTo(7, 2); g.lineTo(9, 6); g.lineTo(6, 6); g.fill(); g.fillStyle = '#525c66'; g.fillRect(9, 9, 3, 1); }
    else if (ch === 'f') { grass(); g.fillStyle = '#8a5a2b'; g.fillRect(0, 6, 16, 2); g.fillRect(0, 11, 16, 2); g.fillStyle = '#6b4423'; g.fillRect(2, 4, 2, 11); g.fillRect(12, 4, 2, 11); }
    else if ('his'.includes(ch)) {
      fill('#b8a07a');
      const roof = ch === 'i' ? '#2a4a8a' : ch === 's' ? '#2a7a4a' : '#9a3a2a';
      g.fillStyle = '#efe6d2'; g.fillRect(2, 7, 12, 9); g.fillStyle = roof; g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 1); g.lineTo(16, 8); g.fill();
      g.fillStyle = '#6b4423'; g.fillRect(7, 11, 3, 5);
      if (ch === 'i') { g.fillStyle = '#ffd166'; g.fillRect(3, 9, 3, 3); g.fillStyle = '#efe6d2'; g.fillRect(4, 10, 1, 1); }
      if (ch === 's') { g.fillStyle = '#ffd166'; g.beginPath(); g.arc(4.5, 10.5, 1.7, 0, Math.PI * 2); g.fill(); }
      if (ch === 'h') { g.fillStyle = '#7ec8ff'; g.fillRect(3, 9, 2, 2); g.fillRect(11, 9, 2, 2); }
    }
    else if (ch === 'C') { fill('#7e8a96'); g.fillStyle = '#14110f'; g.beginPath(); g.arc(8, 11, 5, Math.PI, 0); g.fill(); g.fillRect(3, 11, 10, 5); g.fillStyle = '#525c66'; g.fillRect(0, 0, 16, 2); }
    else if (ch === '_') { fill('#4a3a2e'); specks('#3a2c22', 12, 13); specks('#5c4a3a', 6, 17); }
    else if (ch === '#') { fill('#2a2a30'); g.fillStyle = '#3a3a44'; for (let y = 0; y < 16; y += 5) for (let x = (y % 10 ? 4 : 0); x < 16; x += 8) g.fillRect(x, y, 6, 3); }
    else if (ch === '<') { fill('#4a3a2e'); g.fillStyle = '#b8a07a'; for (let i = 0; i < 4; i++) g.fillRect(2 + i, 3 + i * 3, 12 - i * 2, 2); }
    else fill('#000');
    tileArt.set(key, c);
    return c;
  }
  function drawChest(x, y, open) {
    ctx.fillStyle = '#6b4423'; ctx.fillRect(x + 3, y + 7, 10, 7);
    ctx.fillStyle = open ? '#2a1d14' : '#8a5a2b'; ctx.fillRect(x + 3, y + (open ? 5 : 5), 10, open ? 3 : 4);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(x + 3, y + 9, 10, 1); if (!open) ctx.fillRect(x + 7, y + 8, 2, 3);
    ctx.fillStyle = '#4a2e18'; ctx.fillRect(x + 3, y + 13, 10, 1);
  }

  // ---------- The save and the start ----------
  async function loadSave() {
    try { const r = await deps.api('/api/adventure/journey'); saved = r?.journey ? R.cleanJourney(r.journey) : null; } catch (e) { msg = e.message; saved = null; }
    drawPanel();
  }
  async function save(quiet) {
    if (!j) return;
    try { await deps.api('/api/adventure/journey', { journey: j }); if (!quiet) say('Saved. The vale will wait for you.'); }
    catch (e) { say(`I couldn't save: ${e.message}`); }
  }
  // The start: who comes along (up to four), from your character, Bob and saved characters.
  const pickedIds = new Set();
  (deps.party || []).slice(0, 2).forEach((p) => pickedIds.add(p.id));
  function begin(fromSave) {
    if (fromSave && saved) j = saved;
    else {
      const party = (deps.party || []).filter((p) => pickedIds.has(p.id)).slice(0, 4);
      j = R.newJourney({ seed: String(Date.now()), party: party.length ? party : (deps.party || []).slice(0, 1) });
    }
    world = R.makeWorld(j.seed);
    trail = [];
    mode = 'walk';
    drawPanel();
    if (!fromSave) talkTo(['Welcome to the Brindle Vale.', 'Elder said to come and see them in the village square. Arrow keys (or the pad) to walk, Enter to talk and open things, Esc for the menu.']);
    focus();
  }
  const focus = () => { try { shell.focus({ preventScroll: true }); } catch {} };

  // ---------- Talking ----------
  function talkTo(lines, then) { talk = { lines: lines.filter(Boolean), i: 0, shown: still() ? 1e9 : 0, then }; mode = mode === 'battle' ? 'battle' : 'talk'; showBox(); }
  function say(text) { talkTo([text]); }
  function showBox() {
    if (!talk) { box.hidden = true; return; }
    box.hidden = false;
    box.textContent = talk.lines[talk.i] || '';
  }
  function advanceTalk() {
    if (!talk) return;
    const line = talk.lines[talk.i] || '';
    if (talk.shown < line.length) { talk.shown = line.length; return; }
    talk.i++; talk.shown = still() ? 1e9 : 0;
    if (talk.i >= talk.lines.length) { const then = talk.then; talk = null; box.hidden = true; if (mode === 'talk') mode = 'walk'; then?.(); drawPanel(); return; }
    showBox();
  }

  // ---------- Walking ----------
  function tryWalk(dir) {
    if (mode !== 'walk' || anim || !j) return;
    const from = { x: j.x, y: j.y, at: j.at };
    const r = R.walk(world, j, dir);
    if (r.moved) {
      stepPhase = (stepPhase + 1) % 4;
      if (r.door) { trail = []; announce(); if (r.door.startsWith('cave') && !j.talked.includes(r.door)) { j.talked.push(r.door); bobSays(r.door); } return; }
      trail.unshift({ x: from.x, y: from.y, facing: j.facing });
      trail = trail.slice(0, 4);
      anim = { from, t0: now(), dur: still() ? 0 : 150 };
      if (r.battle) setTimeout(() => startFight(r.battle), still() ? 0 : 170);
    } else if (r.bump?.kind === 'boss') bossTalk(r.bump.boss);
  }
  const BOB_LINES = { cave1: 'Bob: Dark, damp, and smells of goblin. My three least favourite things, in order.', cave2: 'Bob: Webs. Big ones. I would like it on record that I said this was a bad idea.', cave3: 'Bob: It\'s warm in here. Caves are not supposed to be warm. Stay behind me. Actually, stay in front.' };
  function bobSays(where) { if (j.party.some((m) => m.who === 'bob') && BOB_LINES[where]) talkTo([BOB_LINES[where]]); }
  function announce() { const map = world.maps[j.at]; root.querySelector('.jy-where').textContent = map.name; }
  function act() {
    if (mode === 'talk' || (mode === 'battle' && talk)) { advanceTalk(); return; }
    if (mode !== 'walk' || anim) return;
    const [dx, dy] = R.STEP[j.facing];
    const t = R.thingAt(world, j, j.x + dx, j.y + dy);
    if (!t) { swing = { t0: now() }; return; }
    if (t.kind === 'chest') { const r = R.openChest(world, j, t.chest); talkTo([r.text]); save(true); return; }
    if (t.kind === 'boss') { bossTalk(t.boss); return; }
    if (t.kind === 'person') personTalk(t.person);
  }
  let swing = null; // the leader's weapon swing on the map when there's nothing in front
  function personTalk(p) {
    p.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[j.facing];
    if (p.role === 'elder') { talkTo([`${p.name}: ${R.elderLine(j)}`]); return; }
    if (p.role === 'inn') { talkTo([`${p.name}: A bed for the night is ${R.INN_PRICE} coins for the whole party. Everyone wakes up whole.`], () => { shop = { kind: 'inn', who: p.name }; mode = 'shop'; drawPanel(); }); return; }
    if (p.role === 'shop') { talkTo([`${p.name}: Tonics, salts and things that go bang. Have a look.`], () => { shop = { kind: 'shop', who: p.name }; mode = 'shop'; drawPanel(); }); return; }
    if (p.role === 'smith') { talkTo([`${p.name}: Blades, bows and something to hide behind. Bought kit goes in your Kit, on the menu.`], () => { shop = { kind: 'smith', who: p.name }; mode = 'shop'; drawPanel(); }); return; }
    talkTo([`${p.name}: ${R.FOLK_LINES[(p.line + j.beaten.length * 2) % R.FOLK_LINES.length]}`]);
  }
  function bossTalk(bs) {
    const g = R.GUARDIANS[bs.id];
    const lines = { boss1: 'Mine! The shiny stone is MINE. You want it, you come and take it, tall thing.', boss2: 'Little flies, walking into my parlour. How kind of you to come to dinner.', boss3: 'Hm. Visitors. It has been a century. I was beginning to think I had been forgotten. Let me remind you.' };
    talkTo([`${g.name}: ${lines[bs.id]}`], () => startFight([bs.id]));
  }

  // ---------- Fights ----------
  function startFight(ids) {
    if (!ids?.length || mode === 'battle') return;
    anim = null; held = null;
    battle = { b: R.startBattle(j, ids), picks: {}, who: 0, stage: 'act', queue: [], busy: false, t0: now(), anim: null, fx: [] };
    mode = 'battle';
    const names = battle.b.foes.map((f) => f.name);
    battle.intro = `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]} ${battle.b.guardian ? 'blocks the way!' : names.length > 1 ? 'jump out!' : 'jumps out!'}`;
    sayLive(battle.intro);
    nextPicker(0);
  }
  const liveParty = () => j.party.filter((m) => m.hp > 0 && !m.asleepSkip);
  function nextPicker(from) {
    let i = from;
    while (i < j.party.length && j.party[i].hp <= 0) i++;
    battle.who = i; battle.stage = 'act'; battle.act = null;
    if (i >= j.party.length) { runRound(); return; }
    drawPanel();
  }
  function choose(c) { battle.picks[j.party[battle.who].id] = c; nextPicker(battle.who + 1); }
  async function runRound() {
    battle.stage = 'play'; drawPanel();
    const ev = R.playRound(j, battle.b, battle.picks);
    battle.picks = {};
    for (const e of ev) { await animate(e); if (closed) return; }
    const b = battle.b;
    if (b.over === 'won') {
      battle.stage = 'done'; battle.victory = now();
      const r = b.reward;
      const lines = [`You win! ${r.xp} experience and ${r.gold} coins.`];
      if (r.drop) lines.push(`Something dropped: ${an(R.ITEMS[r.drop].name)}.`);
      for (const u of r.ups) lines.push(`${u.name} is now level ${u.level}! +${u.hp} health, +${u.sp} spirit${u.stat ? `, +1 ${R.STAT_NAMES[u.stat]}` : ''}${u.skill ? `, and learns ${R.SKILLS[u.skill].name}` : ''}.`);
      const boss = b.foes.find((f) => f.guardian);
      if (boss) { lines.push(`${boss.name} drops a lantern stone. ${j.beaten.length} of 3 back home.`); reward(boss.id); }
      if (j.won && boss) lines.push('That was the last keeper. Take the stones back to the elder!');
      drawPanel();
      talkTo(lines, endFight);
      save(true);
    } else if (b.over === 'lost') {
      battle.stage = 'done'; drawPanel();
      talkTo(['The party falls…', 'You wake up at the inn, aching and a bit lighter in the purse. Half your coins are gone; everything else is still yours.'], () => { R.wakeAtInn(world, j); trail = []; endFight(); save(true); });
    } else if (b.over === 'fled') { battle.stage = 'done'; talkTo(['You got away.'], endFight); }
    else nextPicker(0);
  }
  function endFight() { battle = null; mode = 'walk'; for (const m of j.party) m.asleep = 0; announce(); drawPanel(); focus(); }
  // A keeper beaten: one line on your saved character's sheet, the way the Adventure table rewards them.
  async function reward(id) {
    const you = j.party.find((m) => m.who === 'you');
    const charId = (deps.party || []).find((p) => p.id === you?.id)?.charId;
    if (!charId) return;
    try { await deps.api('/api/adventure/journey/reward', { charId, guardian: id }); } catch {}
  }
  function sayLive(text) { const p = root.querySelector('.jy-msg'); if (p) p.textContent = text; }

  // One event, animated: the attacker steps in and swings, the target flashes, a number floats up.
  function animate(e) {
    sayLive(e.text);
    if (still()) { if (e.dmg || e.heal) pop(e); return Promise.resolve(); }
    return new Promise((done) => {
      const isFight = ['fight', 'skill', 'hit', 'curse', 'breath', 'item'].includes(e.act);
      const dur = isFight ? (e.act === 'skill' && e.element ? 700 : 620) : 520;
      battle.anim = { e, t0: now(), dur };
      setTimeout(() => { if (e.dmg || e.heal) pop(e); }, dur * 0.55);
      setTimeout(() => { if (battle) battle.anim = null; done(); }, dur + 120);
    });
  }
  function pop(e) {
    const spot = spotOf(e.target);
    if (!spot) return;
    fxNumbers.push({ x: spot.x + spot.w / 2, y: spot.y, text: e.miss ? 'miss' : String(e.dmg || e.heal), colour: e.heal ? '#7dff9a' : e.crit ? '#ffd166' : '#ffffff', t0: now() });
  }
  // Where everyone stands in a fight: foes on the left (facing right), the party on the right (facing left).
  function spots() {
    const out = new Map();
    const foes = battle.b.foes;
    foes.forEach((f, i) => {
      const scale = f.guardian ? 3 : 2;
      const col = foes.length > 2 ? i % 2 : 0, row = foes.length > 2 ? Math.floor(i / 2) : i;
      const x = f.guardian ? 16 : 16 + col * 46, y = f.guardian ? 52 : 50 + row * 58 + col * 14;
      out.set(f.key, { x, y, w: 16 * scale, h: 20 * scale, scale, side: 'foe' });
    });
    j.party.forEach((m, i) => { out.set(m.id, { x: 172 + (i % 2) * 18, y: 44 + i * 30 - (j.party.length > 3 ? 8 : 0), w: 32, h: 40, scale: 2, side: 'party' }); });
    return out;
  }
  function spotOf(id) { return battle ? spots().get(id) : null; }

  // ---------- Drawing ----------
  const now = () => (globalThis.performance?.now?.() ?? Date.now());
  function frame() {
    frameReq = 0;
    if (closed) return;
    const t = now();
    ctx.imageSmoothingEnabled = false;
    if (mode === 'title' || !j) drawTitle(t);
    else if (mode === 'battle' && battle) drawBattle(t);
    else drawWorld(t);
    if (held && mode === 'walk' && !anim && t - heldAt > 0) tryWalk(held);
    if (!closed) frameReq = (globalThis.requestAnimationFrame || ((f) => setTimeout(f, 33)))(frame);
  }
  function drawTitle(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a2a4a'); g.addColorStop(1, '#3a5a3a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffd166'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.fillText('The Brindle Vale', W / 2, 34);
    ctx.fillStyle = '#e8e0d0'; ctx.font = '9px monospace'; ctx.fillText('A Journey for Bob and friends', W / 2, 48); ctx.textAlign = 'left';
    const who = (deps.party || []).filter((p) => pickedIds.has(p.id)).slice(0, 4);
    const facing = S.FACINGS[Math.floor(t / 1600) % 4];
    who.forEach((p, i) => drawFig(memberLook(R.member(p)), W / 2 - who.length * 22 + i * 44 + 6, 80, 2, { facing, step: Math.floor(t / 180) % 4, weapon: R.member(p).weapon, shield: R.member(p).shield }));
  }
  function camera(px, py, map) {
    const cx = Math.max(0, Math.min(map.w * TILE - W, px - W / 2 + TILE / 2));
    const cy = Math.max(0, Math.min(map.h * TILE - H, py - H / 2 + TILE / 2));
    return { cx: Math.round(cx), cy: Math.round(cy) };
  }
  function drawWorld(t) {
    const map = world.maps[j.at];
    let p = 1;
    if (anim) { p = anim.dur ? Math.min(1, (t - anim.t0) / anim.dur) : 1; if (p >= 1) anim = null; }
    const from = anim?.from || { x: j.x, y: j.y };
    const lx = (from.x + (j.x - from.x) * p) * TILE, ly = (from.y + (j.y - from.y) * p) * TILE;
    const { cx, cy } = camera(lx, ly, map);
    const water = Math.floor(t / 500) % 2;
    const x0 = Math.floor(cx / TILE), y0 = Math.floor(cy / TILE);
    for (let y = y0; y <= y0 + VIEW_H; y++) for (let x = x0; x <= x0 + VIEW_W; x++) {
      const ch = map.rows[y]?.[x]; if (!ch) continue;
      ctx.drawImage(tileCanvas(ch, ch === '~' ? water : 0), x * TILE - cx, y * TILE - cy);
    }
    for (const c of map.chests) drawChest(c.x * TILE - cx, c.y * TILE - cy, j.opened.includes(`${map.id}:${c.id}`));
    // Everyone who stands on the map, back to front so the lower ones overlap the higher.
    const figs = [];
    if (map.boss && !j.beaten.includes(map.boss.id)) { const f = R.foe(map.boss.id); figs.push({ y: map.boss.y * TILE, draw: () => drawFig(foeLook(f), map.boss.x * TILE - cx - 4, map.boss.y * TILE - cy - 12, 1.5, { facing: 'down', step: Math.floor(t / 400) % 4 }) }); }
    if (t - lastWander > 1800) { lastWander = t; wander(map); }
    for (const q of map.people) figs.push({ y: q.y * TILE, draw: () => drawFig(personLook(q), q.x * TILE - cx, q.y * TILE - cy - 4, 1, { facing: q.facing || 'down' }) });
    const walking = Boolean(anim) || (held && mode === 'walk');
    const party = j.party;
    party.forEach((m, i) => {
      let x, y, facing;
      if (i === 0) { x = lx; y = ly; facing = j.facing; }
      else {
        const spot = trail[i - 1]; const prev = i === 1 ? { x: j.x, y: j.y } : trail[i - 2];
        if (!spot) return;
        const fromSpot = trail[i] || spot;
        x = (anim ? fromSpot.x + (spot.x - fromSpot.x) * p : spot.x) * TILE; y = (anim ? fromSpot.y + (spot.y - fromSpot.y) * p : spot.y) * TILE;
        facing = prev ? (prev.x > spot.x ? 'right' : prev.x < spot.x ? 'left' : prev.y < spot.y ? 'up' : 'down') : spot.facing;
      }
      const step = walking ? (stepPhase + Math.floor(p * 2)) % 4 : 0;
      let angle;
      if (i === 0 && swing) { const k = Math.floor((t - swing.t0) / 60); const arc = S.swingAngles(facing); if (k >= arc.length || still()) swing = null; else angle = arc[k]; }
      figs.push({ y: y + i * 0.01, draw: () => drawFig(memberLook(m), Math.round(x - cx), Math.round(y - cy - 4), 1, { facing, step, weapon: m.weapon, shield: m.shield, angle }) });
    });
    figs.sort((a, b) => a.y - b.y).forEach((f) => f.draw());
    if (talk) drawTalk(t);
    root.querySelector('.jy-gold').textContent = `🪙 ${j.gold}`;
  }
  function wander(map) {
    for (const q of map.people) {
      if (!q.wander || mode !== 'walk' || Math.random() < 0.5) continue;
      const dir = S.FACINGS[Math.floor(Math.random() * 4)];
      const [dx, dy] = R.STEP[dir];
      q.facing = dir;
      const nx = q.x + dx, ny = q.y + dy, v = map.village;
      if (map.rows[ny]?.[nx] === '*' && !(nx === j.x && ny === j.y) && !trail.some((s) => s.x === nx && s.y === ny) && !map.people.some((o) => o.x === nx && o.y === ny) && nx > v.x && ny > v.y) { q.x = nx; q.y = ny; }
    }
  }
  function drawTalk(t) {
    const line = talk.lines[talk.i] || '';
    if (talk.shown < line.length) talk.shown += 1.4;
    const text = line.slice(0, Math.floor(talk.shown));
    const bx = 4, by = H - 52, bw = W - 8, bh = 48;
    const g = ctx.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, '#2a3a8a'); g.addColorStop(1, '#141c4a');
    ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 2; ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    ctx.fillStyle = '#ffffff'; ctx.font = '8px monospace';
    wrap(text, bw - 14).slice(0, 4).forEach((l, i) => ctx.fillText(l, bx + 7, by + 12 + i * 10));
    if (talk.shown >= line.length && Math.floor(t / 400) % 2) { ctx.fillStyle = '#ffd166'; ctx.fillRect(bx + bw - 10, by + bh - 8, 4, 3); }
  }
  function wrap(text, width) {
    const words = String(text).split(' '), out = []; let line = '';
    for (const w of words) { const next = line ? `${line} ${w}` : w; if (ctx.measureText(next).width > width && line) { out.push(line); line = w; } else line = next; }
    if (line) out.push(line);
    return out;
  }
  const ELEMENT_COLOURS = { fire: '#ff8a3a', holy: '#ffe680', storm: '#7ae0ff', wild: '#7dff9a', mind: '#ff7ad8' };
  function drawBattle(t) {
    const cave = j.at !== 'world';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (cave) { g.addColorStop(0, '#14110f'); g.addColorStop(1, '#3a2c22'); } else { g.addColorStop(0, '#7ec8ff'); g.addColorStop(0.24, '#bfe6ff'); g.addColorStop(0.25, '#5aa04a'); g.addColorStop(1, '#3d7f34'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!cave) { ctx.fillStyle = '#2f6a2a'; for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.arc(x + 12, 44, 12, Math.PI, 0); ctx.fill(); } }
    else { ctx.fillStyle = '#2a2a30'; for (let x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 10, 18 + (x % 3) * 6); ctx.lineTo(x + 20, 0); ctx.fill(); } }
    // Shadows under everyone, so they stand on the ground.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const [id, s] of spots()) { const f = battle.b.foes.find((x) => x.key === id); if (f && f.hp <= 0) continue; ctx.beginPath(); ctx.ellipse(s.x + s.w / 2, s.y + s.h - 1, s.w / 2.6, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    const sp = spots();
    const a = battle.anim, e = a?.e;
    const p = a ? Math.min(1, (t - a.t0) / a.dur) : 0;
    const shove = (id) => { if (!e || e.who !== id || !['fight', 'skill', 'hit', 'curse', 'item'].includes(e.act)) return 0; const k = p < 0.3 ? p / 0.3 : p > 0.75 ? (1 - p) / 0.25 : 1; return Math.round(k * 18); };
    const hitNow = (id) => e && e.target === id && !e.miss && e.dmg && p > 0.5 && p < 0.8 && Math.floor(t / 60) % 2 === 0;
    const swingAt = (id, facing) => { if (!e || e.who !== id || !['fight', 'skill', 'hit', 'curse'].includes(e.act) || (e.element && e.act === 'skill')) return undefined; const arc = S.swingAngles(facing); const k = Math.max(0, Math.min(arc.length - 1, Math.floor(((p - 0.25) / 0.5) * arc.length))); return p < 0.25 ? arc[0] : arc[k]; };
    for (const f of battle.b.foes) {
      const s = sp.get(f.key);
      if (f.hp <= 0) { if (e && e.target === f.key && p < 1) drawFig(foeLook(f), s.x, s.y, s.scale, { facing: 'right', alpha: 1 - p, flash: true }); continue; }
      const asleep = f.asleep ? 0 : Math.floor(t / 300) % 4;
      drawFig(foeLook(f), s.x + shove(f.key), s.y, s.scale, { facing: 'right', step: asleep, flash: hitNow(f.key), angle: swingAt(f.key, 'right') });
      if (f.asleep) { ctx.fillStyle = '#e8e8f0'; ctx.font = '8px monospace'; ctx.fillText('z', s.x + s.w - 4, s.y + 4 - (Math.floor(t / 300) % 3) * 2); }
    }
    const win = battle.stage === 'done' && battle.b.over === 'won';
    j.party.forEach((m, i) => {
      const s = sp.get(m.id);
      const picking = battle.stage !== 'play' && battle.who === i && !win;
      const down = m.hp <= 0;
      const facing = win ? S.FACINGS[Math.floor((t - battle.victory) / 220) % 4] : 'left';
      const angle = win ? 0 : swingAt(m.id, 'left') ?? (e?.who === m.id && e.element ? -150 : undefined);
      drawFig(memberLook(m), s.x - shove(m.id) - (picking ? 6 : 0), s.y + (down ? 10 : 0), 2, { facing: down ? 'up' : facing, step: win ? Math.floor(t / 120) % 4 : 0, weapon: m.weapon, shield: m.shield, angle: down ? undefined : angle, flash: hitNow(m.id), alpha: down ? 0.45 : 1 });
      if (picking && Math.floor(t / 300) % 2) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(s.x - 14, s.y + 16); ctx.lineTo(s.x - 9, s.y + 20); ctx.lineTo(s.x - 14, s.y + 24); ctx.fill(); }
    });
    // Spells: a burst of sparks in the spell's colour on the target(s).
    if (e && e.element && p > 0.25) {
      const targets = e.target ? [e.target] : [];
      for (const id of targets) { const s = sp.get(id); if (!s) continue; ctx.fillStyle = ELEMENT_COLOURS[e.element] || '#ffffff'; for (let k = 0; k < 14; k++) { const ang = k * 0.9 + t / 120, r = 4 + ((p - 0.25) * 40 + k * 3) % 18; ctx.fillRect(Math.round(s.x + s.w / 2 + Math.cos(ang) * r), Math.round(s.y + s.h / 2 + Math.sin(ang) * r), 2, 2); } }
    }
    if (e && e.heal && p > 0.25) { const s = sp.get(e.target); if (s) { ctx.fillStyle = '#7dff9a'; for (let k = 0; k < 8; k++) ctx.fillRect(s.x + ((k * 7) % s.w), s.y + s.h - ((p - 0.25) * 60 + k * 5) % s.h, 2, 2); } }
    if (e && e.act === 'breath' && p > 0.2) { ctx.fillStyle = `rgba(255,120,40,${0.45 * (1 - p)})`; ctx.fillRect(120, 0, W - 120, H); }
    // Floating numbers.
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    for (let i = fxNumbers.length - 1; i >= 0; i--) {
      const n = fxNumbers[i], age = t - n.t0;
      if (age > 900) { fxNumbers.splice(i, 1); continue; }
      ctx.fillStyle = '#000'; ctx.fillText(n.text, n.x + 1, n.y - age / 40 + 1); ctx.fillStyle = n.colour; ctx.fillText(n.text, n.x, n.y - age / 40);
    }
    ctx.textAlign = 'left';
    if (talk) drawTalk(t);
  }

  // ---------- The panel under the screen (real buttons, so keys and screen readers work) ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
  const bar = (n, max, cls) => `<progress class="jy-bar ${cls}" max="${Math.max(1, max)}" value="${Math.max(0, n)}" aria-label="${n} of ${max}"></progress>`; // no style attributes: the phone allows style-src 'self' only
  const sheet = (m, on) => `<li class="${on ? 'on' : ''}${m.hp <= 0 ? ' down' : ''}"><strong>${esc(m.name)}</strong> <span class="muted">${esc(R.CLASSES[m.cls].name)} · Lv ${m.level}</span>
    <span class="jy-hp">❤ ${m.hp}/${m.maxHp} ${bar(m.hp, m.maxHp, 'hp')}</span><span class="jy-sp">✦ ${m.sp}/${m.maxSp} ${bar(m.sp, m.maxSp, 'sp')}</span></li>`;
  function drawPanel() {
    root.querySelector('.jy-msg').textContent = msg;
    const pad = root.querySelector('.jy-pad');
    pad.hidden = mode === 'title';
    if (mode === 'title' || !j) { panel.innerHTML = titleHtml(); return; }
    announce();
    if (mode === 'battle' && battle) { panel.innerHTML = battleHtml(); panel.querySelector('button:not([disabled])')?.focus({ preventScroll: true }); return; }
    if (mode === 'menu' && menu) { panel.innerHTML = menuHtml(); mountDolls(); return; }
    if (mode === 'shop' && shop) { panel.innerHTML = shopHtml(); panel.querySelector('button')?.focus({ preventScroll: true }); return; }
    panel.innerHTML = `<ul class="jy-party">${j.party.map((m) => sheet(m)).join('')}</ul><p class="muted jy-keys">Arrow keys walk · Enter talks, opens chests and swings · Esc opens the menu</p>`;
  }
  function titleHtml() {
    const list = deps.party || [];
    return `<div class="jy-title">
      ${saved ? `<button type="button" class="yes" data-jy="continue">▶ Continue your journey</button> <span class="muted">${esc(saved.party.map((m) => `${m.name} Lv ${m.level}`).join(', '))} · 🪙 ${saved.gold} · ${saved.beaten.length} of 3 lantern stones</span>` : ''}
      <fieldset class="jy-who"><legend>Who comes along (up to four)</legend>${list.map((p) => `<label><input type="checkbox" data-pick="${esc(p.id)}" ${pickedIds.has(p.id) ? 'checked' : ''}> ${esc(p.name)} <span class="muted">${esc(R.CLASSES[p.cls]?.name || p.cls)}${p.who === 'you' ? ' (you)' : p.who === 'bob' ? ' (Bob)' : ''}</span></label>`).join('')}</fieldset>
      <button type="button" class="${saved ? '' : 'yes'}" data-jy="new">${saved ? '✨ Start a new journey (the old one is replaced)' : '✨ Start a journey'}</button>
      <p class="muted">Walk the vale, open chests, fight what jumps out of the long grass, and win back three lantern stones. No brain needed: it plays straight away. Saved on this replicant matrix.</p></div>`;
  }
  function battleHtml() {
    const b = battle.b, m = j.party[battle.who];
    const foes = b.foes.filter((f) => f.hp > 0);
    const list = `<ul class="jy-party">${j.party.map((x, i) => sheet(x, battle.stage !== 'play' && i === battle.who)).join('')}</ul>
      <ul class="jy-foes" aria-label="Foes">${b.foes.map((f) => `<li class="${f.hp <= 0 ? 'down' : ''}">${esc(f.name)} ${f.hp > 0 ? bar(f.hp, f.maxHp, 'hp') : '<span class="muted">beaten</span>'}</li>`).join('')}</ul>`;
    if (battle.stage === 'play' || battle.stage === 'done' || !m) return `${list}<p class="muted">${battle.stage === 'play' ? 'The round plays out…' : ''}</p>`;
    const head = `<p class="jy-ask"><strong>${esc(m.name)}</strong>, what do you do?</p>`;
    const back = battle.who > 0 || battle.stage !== 'act' ? '<button type="button" data-b="back">↩ Back</button>' : '';
    if (battle.stage === 'act') {
      const skills = R.skillsFor(m.cls, m.level);
      const items = Object.entries(j.bag).filter(([, n]) => n > 0);
      return `${list}${head}<div class="jy-cmds" role="group" aria-label="Commands">
        <button type="button" data-b="fight">⚔ Fight</button>
        <button type="button" data-b="skills" ${skills.length ? '' : 'disabled'}>✨ ${m.cls === 'fighter' || m.cls === 'rogue' ? 'Skills' : 'Spells'}</button>
        <button type="button" data-b="items" ${items.length ? '' : 'disabled'}>🎒 Items</button>
        <button type="button" data-b="defend">🛡 Defend</button>
        <button type="button" data-b="run" ${b.guardian ? 'disabled title="No running from a keeper"' : ''}>🏃 Run</button>${back}</div>`;
    }
    if (battle.stage === 'skills') return `${list}${head}<div class="jy-cmds" role="group" aria-label="Skills">${R.skillsFor(m.cls, m.level).map((id) => { const s = R.SKILLS[id]; return `<button type="button" data-skill="${id}" ${m.sp < s.cost ? 'disabled' : ''} title="${esc(s.what)}">${esc(s.name)} <span class="muted">✦${s.cost}</span></button>`; }).join('')}${back}</div>`;
    if (battle.stage === 'items') return `${list}${head}<div class="jy-cmds" role="group" aria-label="Items">${Object.entries(j.bag).filter(([, n]) => n > 0).map(([id, n]) => `<button type="button" data-item="${id}" title="${esc(R.ITEMS[id].what)}">${esc(R.ITEMS[id].name)} ×${n}</button>`).join('')}${back}</div>`;
    if (battle.stage === 'target') {
      const friendly = battle.act.side === 'party';
      const opts = friendly ? j.party.filter((x) => (battle.act.item === 'salts' ? x.hp <= 0 : x.hp > 0)) : foes;
      return `${list}${head}<p class="muted">${friendly ? 'On whom?' : 'At which one?'}</p><div class="jy-cmds" role="group" aria-label="Targets">${opts.map((x) => `<button type="button" data-target="${esc(x.key || x.id)}">${esc(x.name)}</button>`).join('')}${back}</div>`;
    }
    return list;
  }
  function menuHtml() {
    const tabs = [['party', '👥 Party'], ['kit', '🧍 Kit'], ['bag', '🎒 Bag'], ['save', '💾 Save']];
    const head = `<div class="jy-tabs" role="tablist">${tabs.map(([id, n]) => `<button type="button" role="tab" aria-selected="${menu.tab === id}" data-tab="${id}">${n}</button>`).join('')}<button type="button" data-jy="resume">▶ Back to the map</button></div>`;
    if (menu.tab === 'party') return `${head}<ul class="jy-party jy-sheets">${j.party.map((m) => `${sheet(m)}<li class="jy-stats muted">Might ${m.stats.might} · Wits ${m.stats.wits} · Charm ${m.stats.charm} · Luck ${m.stats.luck} · Attack ${R.attackOf(m)} · Guard ${R.guardOf(m)} · Next level in ${R.xpFor(m.level) - m.xp}</li>`).join('')}</ul><p>${j.beaten.length} of 3 lantern stones · 🪙 ${j.gold}</p>`;
    if (menu.tab === 'kit') {
      const m = j.party[menu.who || 0] || j.party[0];
      const sel = (kind, table) => `<label>${kind === 'weapon' ? 'Weapon' : kind === 'armour' ? 'Armour' : 'Shield'} <select data-kit="${kind}">${['none', ...j.owned[kind]].map((id) => `<option value="${id}" ${m[kind] === id ? 'selected' : ''}>${esc(table[id].name)}</option>`).join('')}</select></label>`;
      return `${head}<div class="jy-kit"><div class="jy-who-row" role="radiogroup" aria-label="Whose kit">${j.party.map((x, i) => `<button type="button" role="radio" aria-checked="${x === m}" data-who="${i}">${esc(x.name)}</button>`).join('')}</div>
        <div class="jy-doll"><canvas class="jy-turn" width="160" height="56" aria-label="${esc(m.name)} from the front, left, right and back"></canvas>
        <div class="jy-kit-picks">${sel('weapon', R.WEAPONS)}${sel('armour', R.ARMOURS)}${sel('shield', R.SHIELDS)}
        <p class="muted">Attack ${R.attackOf(m)} · Guard ${R.guardOf(m)} · Magic ${R.magicOf(m)} · Speed ${R.speedOf(m)}</p>
        ${m.who === 'you' && deps.editLook ? '<button type="button" class="mini" data-jy="look">🧍 Change the look</button>' : ''}</div></div>
        <p class="muted">Kit from chests and the smith is shared by the party. What you wear shows on the paper doll and in every fight.</p></div>`;
    }
    if (menu.tab === 'bag') {
      const items = Object.entries(j.bag).filter(([, n]) => n > 0);
      return `${head}${items.length ? `<ul class="jy-bag">${items.map(([id, n]) => `<li><strong>${esc(R.ITEMS[id].name)}</strong> ×${n} <span class="muted">${esc(R.ITEMS[id].what)}</span> ${id === 'ember' ? '' : j.party.map((m, i) => `<button type="button" class="mini" data-use="${id}" data-on="${i}">${esc(m.name)}</button>`).join('')}</li>`).join('')}</ul>` : '<p class="muted">The bag is empty.</p>'}`;
    }
    return `${head}<div class="row"><button type="button" class="yes" data-jy="save">💾 Save now</button><button type="button" data-jy="leave">🚪 Save and leave</button></div><p class="muted">The journey also saves itself after every chest and every fight.</p>`;
  }
  function shopHtml() {
    if (shop.kind === 'inn') return `<p><strong>${esc(shop.who)}</strong>: ${R.INN_PRICE} coins for the night. You have ${j.gold}.</p><div class="row"><button type="button" class="yes" data-shop="rest" ${j.gold < R.INN_PRICE ? 'disabled' : ''}>🛏 Rest</button><button type="button" data-shop="leave">Leave</button></div>`;
    const list = shop.kind === 'shop' ? R.SHOP.map((id) => [id, R.ITEMS[id].name, R.ITEMS[id].price, R.ITEMS[id].what, false]) : R.KIT_SHOP.map((id) => [id, R.kitName(id), R.KIT_PRICES[id], R.kitKind(id), j.owned[R.kitKind(id)].includes(id)]);
    return `<p><strong>${esc(shop.who)}</strong> · You have 🪙 ${j.gold}</p><ul class="jy-bag">${list.map(([id, name, price, what, have]) => `<li><button type="button" data-buy="${id}" ${have || j.gold < price ? 'disabled' : ''}>${esc(name)} · 🪙 ${price}</button> <span class="muted">${have ? 'You have this.' : esc(what)}</span></li>`).join('')}</ul><button type="button" data-shop="leave">Leave</button>`;
  }
  let dollTimer = 0;
  function mountDolls() {
    clearInterval(dollTimer);
    const c = panel.querySelector('.jy-turn'); if (!c) return;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const m = j.party[menu.who || 0] || j.party[0];
    let k = 0;
    const paint = () => { g.clearRect(0, 0, c.width, c.height); S.FACINGS.forEach((f, i) => { try { S.drawFigure(g, 4 + i * 40, 2, 2.6, memberLook(m), { compose: A.compose, facing: f, step: still() ? 0 : k % 4, weapon: m.weapon, shield: m.shield }); } catch {} }); k++; };
    paint();
    if (!still()) dollTimer = setInterval(() => { if (!c.isConnected) { clearInterval(dollTimer); return; } paint(); }, 200);
  }

  // ---------- Input ----------
  root.addEventListener('click', async (e) => {
    const bt = e.target.closest('button'); if (!bt || bt.disabled) return;
    const d = bt.dataset;
    if (d.jy === 'close') { await close(); return; }
    if (d.jy === 'new') { begin(false); return; }
    if (d.jy === 'continue') { begin(true); return; }
    if (d.jy === 'menu' || d.key === 'menu') { toggleMenu(); return; }
    if (d.jy === 'save') { await save(); return; }
    if (d.jy === 'resume') { menu = null; mode = 'walk'; drawPanel(); focus(); return; }
    if (d.jy === 'leave') { await save(true); await close(); return; }
    if (d.jy === 'look') { const m = j.party[menu.who || 0]; deps.editLook?.(m, (id) => { if (id) { m.look = id; lookCache.clear(); save(true); } drawPanel(); }); return; }
    if (d.key === 'act') { act(); return; }
    if (d.tab) { menu.tab = d.tab; drawPanel(); return; }
    if (d.who) { menu.who = Number(d.who); drawPanel(); return; }
    if (d.use) { const m = j.party[Number(d.on)]; const it = R.ITEMS[d.use]; if (!m || !(j.bag[d.use] > 0)) return; if (it.revive ? m.hp > 0 : m.hp <= 0) { msg = it.revive ? `${m.name} is already up.` : `${m.name} needs Waking salts first.`; drawPanel(); return; } j.bag[d.use]--; if (it.heal) m.hp = Math.min(m.maxHp, m.hp + it.heal); if (it.spirit) m.sp = Math.min(m.maxSp, m.sp + it.spirit); if (it.revive) m.hp = Math.ceil(m.maxHp * it.revive); msg = `${m.name} uses ${an(it.name)}.`; drawPanel(); return; }
    if (d.buy) { msg = R.buy(j, d.buy) ? `Bought: ${R.ITEMS[d.buy]?.name || R.kitName(d.buy)}.` : "You can't afford that."; drawPanel(); save(true); return; }
    if (d.shop === 'rest') { if (R.rest(j)) { shop = null; mode = 'walk'; talkTo(['You sleep like a log. Everyone wakes up whole.']); save(true); } drawPanel(); return; }
    if (d.shop === 'leave') { shop = null; mode = 'walk'; msg = ''; drawPanel(); focus(); return; }
    if (battle && battle.stage !== 'play') {
      const m = j.party[battle.who];
      if (d.b === 'back') { if (battle.stage !== 'act') { battle.stage = 'act'; drawPanel(); } else { let i = battle.who - 1; while (i >= 0 && j.party[i].hp <= 0) i--; if (i >= 0) { delete battle.picks[j.party[i].id]; battle.who = i; drawPanel(); } } return; }
      if (d.b === 'fight') { battle.act = { act: 'fight', side: 'foe' }; return pickTarget(); }
      if (d.b === 'defend') return choose({ act: 'defend' });
      if (d.b === 'run') return choose({ act: 'run' });
      if (d.b === 'skills') { battle.stage = 'skills'; drawPanel(); return; }
      if (d.b === 'items') { battle.stage = 'items'; drawPanel(); return; }
      if (d.skill) { const s = R.SKILLS[d.skill]; battle.act = { act: 'skill', skill: d.skill, side: ['heal'].includes(s.kind) ? 'party' : 'foe' }; if (['all', 'healAll', 'buff', 'cover'].includes(s.kind)) return choose(battle.act); return pickTarget(); }
      if (d.item) { const it = R.ITEMS[d.item]; battle.act = { act: 'item', item: d.item, side: it.fire ? 'foe' : 'party' }; return pickTarget(); }
      if (d.target) { choose({ ...battle.act, target: d.target }); return; }
      void m;
    }
  });
  function pickTarget() {
    const foes = battle.b.foes.filter((f) => f.hp > 0);
    if (battle.act.side === 'foe' && foes.length === 1) { choose({ ...battle.act, target: foes[0].key }); return; }
    battle.stage = 'target'; drawPanel();
  }
  root.addEventListener('change', (e) => {
    const p = e.target.closest('[data-pick]');
    if (p) { if (p.checked) { if (pickedIds.size >= 4) { p.checked = false; msg = 'Four is a full party.'; drawPanel(); return; } pickedIds.add(p.dataset.pick); } else pickedIds.delete(p.dataset.pick); msg = ''; return; }
    const k = e.target.closest('select[data-kit]');
    if (k && j) { const m = j.party[menu.who || 0]; if (R.equip(j, m.id, k.dataset.kit, k.value)) { lookCache.clear(); drawPanel(); save(true); } }
  });
  function toggleMenu() {
    if (!j || mode === 'battle' || mode === 'title') return;
    if (mode === 'talk') return;
    if (mode === 'menu') { menu = null; mode = 'walk'; drawPanel(); focus(); return; }
    if (mode === 'shop') { shop = null; mode = 'walk'; drawPanel(); focus(); return; }
    menu = { tab: 'party', who: 0 }; mode = 'menu'; drawPanel();
    panel.querySelector('[role="tab"]')?.focus({ preventScroll: true });
  }
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
  function onKey(e) {
    if (closed || !root.isConnected || root.closest('dialog:not([open])') || root.closest('.hidden')) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '');
    if (e.key === 'Escape' || e.key === 'x' || e.key === 'X') { if (typing && e.key !== 'Escape') return; if (mode === 'menu' || mode === 'shop' || mode === 'walk') { e.preventDefault(); e.stopPropagation(); toggleMenu(); } return; }
    if (typing) return;
    if (mode === 'battle' && !talk) { // arrow keys move between the command buttons
      if (KEYS[e.key] && panel.contains(doc.activeElement)) { const bs = [...panel.querySelectorAll('.jy-cmds button:not([disabled])')]; const i = bs.indexOf(doc.activeElement); if (i >= 0) { e.preventDefault(); const n = bs[(i + (KEYS[e.key] === 'down' || KEYS[e.key] === 'right' ? 1 : bs.length - 1)) % bs.length]; n?.focus(); } }
      return;
    }
    if (KEYS[e.key] && (mode === 'walk')) { e.preventDefault(); if (held !== KEYS[e.key]) { held = KEYS[e.key]; heldAt = now(); tryWalk(held); } return; }
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'z' || e.key === 'Z') && (mode === 'walk' || mode === 'talk' || talk)) { if (e.target?.tagName === 'BUTTON' && !talk && mode !== 'walk') return; e.preventDefault(); act(); }
  }
  function onKeyUp(e) { if (KEYS[e.key] === held) held = null; }
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('keyup', onKeyUp, true);
  // The pad: press and hold to keep walking.
  const pad = root.querySelector('.jy-pad');
  pad.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-dir]'); if (!b) return; e.preventDefault(); held = b.dataset.dir; heldAt = now(); tryWalk(held); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) pad.addEventListener(ev, () => { held = null; });
  pad.addEventListener('keydown', (e) => { const b = e.target.closest('[data-dir]'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); tryWalk(b.dataset.dir); } }, true);

  async function close() {
    if (j && mode !== 'title') await save(true);
    stop();
    deps.onClose?.();
  }
  function stop() {
    closed = true; clearInterval(dollTimer);
    doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('keyup', onKeyUp, true);
    if (frameReq) (globalThis.cancelAnimationFrame || clearTimeout)(frameReq);
  }

  drawPanel();
  loadSave();
  frame();
  return { stop, save, get journey() { return j; }, get mode() { return mode; }, startFight, walk: tryWalk, act };
}
