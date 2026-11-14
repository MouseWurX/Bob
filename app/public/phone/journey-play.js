// Made by android/tools/make-shared.mjs from public/journey-play.js. Don't edit.
(function () {
// 🧭 Journey v1.2: the screen. It opens in Bob's Inn, a tavern you walk around; the buttons along the bottom roll a
// New adventure or Resume the saved one. Walk with the arrow keys (or the pad on a phone), talk and open chests with
// Enter, F to pick a fight with whoever is in front of you, Esc for the menu, and fight in turn-based battles drawn
// side-on: the party on the right, what jumped out on the left. Every figure is drawn from its own look, from the side
// it faces, walking, with its weapon held at the angle it's swinging (public/journey-sides.js). The rules are
// public/journey-rules.js and the places public/journey-world.js; nothing here decides a roll. Nothing loads and no
// brain is used: it's a page you open, and it stops drawing when it's closed.
// No imports: the phone uses this same file, made into a plain script (globalThis.BobJourneyPlay) by
// android/tools/make-shared.mjs, with its own api and looks passed in.
//
// mountJourney(root, deps) with deps:
//   R, W, S: the rules, world and sides modules; A: public/avatars.js (compose, avatar, encodeParts, decodeParts)
//   lookOf(id): a look object for any look id (Bob's own looks too); bobLook: Bob's look id
//   api(path, body?): GET when no body, POST otherwise; the server keeps the save (/api/adventure/journey)
//   party: who can come along: [{ id, name, cls, look, who: 'you'|'bob'|'friend', stats?, charId? }]
//   enemyLooks: { goblin: lookId, ... } from the bestiary; still(): true when Animations are off
//   editLook(member, done(lookId)): optional, opens the character screen for your character
//   onClose(): the ✕ button
//   phone: true on a phone (the biggest land, Saga, is for computers)
function mountJourney(root, deps) {
  const { R, S, A } = deps;
  const Wm = deps.W;
  const doc = root.ownerDocument || globalThis.document;
  const TILE = 16, VIEW_W = 15, VIEW_H = 11;
  const W = TILE * VIEW_W, H = TILE * VIEW_H;
  let j = null, world = null, mode = 'walk', saved = null, msg = '', closed = false;
  let lobby = true; // in Bob's Inn with no adventure rolled yet
  let anim = null; // the walk between two tiles: { from: {x,y}, t0 }
  let trail = []; // where the leader has been, for the others to follow
  let talk = null; // { lines: [...], i, shown, then }
  let battle = null; // { b, picks: {}, who: index, stage: 'act'|'target'|'skill'|'item'|'play'|'done', act, ... }
  let menu = null; // { tab, who }
  let shop = null; // { kind: 'shop'|'smith'|'inn'|'priest'|'peddler'|'trainer'|'hermit'|'captain'|'guard'|'new', who, person }
  let held = null, heldAt = 0, frameReq = 0, lastTick = 0, stepPhase = 0, armed = null;
  const fxNumbers = []; // floating numbers in battle: { x, y, text, colour, t0 }
  // Journey v1.2: going up and down ({ kind: takeoff|land|dive|surface, t0, dur }), little effects on the land
  // (ripples, dust, splashes: { kind, x, y, t0, dur } in tiles), a boat trip, and Aerie traders swooping in.
  let heightFx = null, voyage = null, sideFacing = 'left', armedRelease = '', doorAt = -1e9, portalAt = -1e9;
  const landFx = [];
  const swoops = new Map();
  const T = (text) => (j ? R.restyle(text, j.style) : text);
  const lookCache = new Map();
  // Music and sound (Journey v1.3): our own tunes, made live by the browser. 🔊 on the top bar (or M) turns it off
  // and on, and Bob remembers.
  const store = (() => { try { return deps.store || globalThis.localStorage || null; } catch { return null; } })();
  const SOUND_KEY = 'bob.journey.sound';
  const soundWanted = () => { try { return store?.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };
  const snd = deps.sound || createJourneySound({ on: soundWanted() });
  const sfx = (k) => { if (!k) return; try { snd.sfx(k); } catch {} };
  function tune() {
    if (!j || !world) return;
    try {
      const map = R.mapOf(world, j);
      const name = songFor({ battle: mode === 'battle' && battle, boss: battle?.b?.guardian || battle?.b?.foes?.some((f) => f.guardian), voyage: Boolean(voyage), kind: map.kind, alt: j.alt });
      snd.setStyle?.(j.style || 'fantasy'); snd.music(name, j.style || 'fantasy');
    } catch {}
  }
  // Full screen (Journey v1.3): the whole game fills the screen, with the menus laid over the bottom of the picture.
  // Where the browser won't go full screen (some phones), it fills the window instead.
  function toggleFull() {
    const on = !shell.classList.contains('jy-full');
    shell.classList.toggle('jy-full', on);
    try { if (on && shell.requestFullscreen) shell.requestFullscreen().catch(() => {}); else if (!on && doc.fullscreenElement) doc.exitFullscreen?.(); } catch {}
    const b = root.querySelector('[data-jy="full"]'); b?.setAttribute('aria-pressed', on ? 'true' : 'false'); b?.setAttribute('aria-label', on ? 'Back to a window' : 'Play full screen');
    focus?.();
  }
  doc.addEventListener?.('fullscreenchange', () => { if (!doc.fullscreenElement && shell.classList.contains('jy-full')) { shell.classList.remove('jy-full'); root.querySelector('[data-jy="full"]')?.setAttribute('aria-pressed', 'false'); } });
  function soundButton() { const b = root.querySelector('[data-jy="sound"]'); if (!b) return; b.textContent = snd.on ? '🔊' : '🔇'; b.setAttribute('aria-pressed', snd.on ? 'true' : 'false'); b.setAttribute('aria-label', snd.on ? 'Music and sound are on. Turn them off (M)' : 'Music and sound are off. Turn them on (M)'); }
  function toggleSound() { snd.setOn(!snd.on); try { store?.setItem(SOUND_KEY, snd.on ? 'on' : 'off'); } catch {} soundButton(); if (snd.on) { tune(); sfx('menu'); } sayLive(snd.on ? 'Music and sound on.' : 'Music and sound off.'); }

  root.innerHTML = `<div class="jy" tabindex="-1">
    <div class="jy-top"><span class="jy-where" aria-live="polite"></span><span class="jy-gold"></span><span class="jy-spacer"></span>
      <button type="button" class="mini" data-jy="menu" title="Menu (Esc)">☰ Menu</button><button type="button" class="mini" data-jy="save" title="Save the journey">💾 Save</button><button type="button" class="icon" data-jy="full" title="Full screen or a window" aria-label="Play full screen" aria-pressed="false">⛶</button><button type="button" class="icon" data-jy="sound" title="Music and sound (M)" aria-pressed="true" aria-label="Music and sound are on. Turn them off (M)">🔊</button><button type="button" class="icon" data-jy="close" aria-label="Close Journey">✕</button></div>
    <div class="jy-stage"><canvas class="jy-canvas" width="${W}" height="${H}" role="img" aria-label="The Journey screen"></canvas><div class="jy-box" role="status" aria-live="polite" hidden></div></div>
    <div class="jy-pad" aria-label="Walking pad"><button type="button" data-dir="up" aria-label="Walk up">▲</button><button type="button" data-dir="left" aria-label="Walk left">◀</button><button type="button" data-dir="down" aria-label="Walk down">▼</button><button type="button" data-dir="right" aria-label="Walk right">▶</button><button type="button" class="jy-a" data-key="act" aria-label="Talk or open (Enter)">A</button><button type="button" class="jy-f" data-key="fight" aria-label="Pick a fight (F)">⚔</button><button type="button" class="jy-b" data-key="menu" aria-label="Menu (Esc)">B</button><button type="button" class="jy-up" data-key="rise" aria-label="Fly up, or come up from the deep (E)">⤒</button><button type="button" class="jy-down" data-key="sink" aria-label="Land, or dive (Q)">⤓</button><button type="button" class="jy-ride" data-key="ride" aria-label="Ride or walk (R)">🐎</button></div>
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
  const base = (k) => R.kitBase(k);

  // ---------- Looks ----------
  function lookFor(id, tint) {
    if (!id) return null;
    const key = `${id}|${tint || ''}`;
    if (lookCache.has(key)) return lookCache.get(key);
    let lk = null;
    try { lk = deps.lookOf?.(id) || A.avatar(id); } catch {}
    if (lk && tint) lk = tinted(lk, tint);
    lookCache.set(key, lk);
    return lk;
  }
  // Bosses are their bestiary creature recoloured: swamp green, desert sand, ice blue, gold, rust and so on.
  const TINTS = { swamp: '#5a7a3a', sand: '#d8b46a', ice: '#9ad8ff', moss: '#3d7f34', gold: '#ffd166', rust: '#a0522d', sea: '#3a78c8', war: '#8a2a2a', red: '#d0303a', orc: '#5a8a3a', lizard: '#3a9a6a', goblin: '#8aaa3a' };
  function tinted(lk, tint) {
    const t = TINTS[tint]; if (!t) return lk;
    const mix = (c) => { const a = /^#([0-9a-f]{6})$/i.exec(c); if (!a) return c; const n = parseInt(a[1], 16), m = parseInt(t.slice(1), 16); const ch = (s) => Math.round(((n >> s) & 255) * 0.45 + ((m >> s) & 255) * 0.55); return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`; };
    const palette = {}; for (const [k, v] of Object.entries(lk.palette || {})) palette[k] = ['E', 'O', 'X'].includes(k) ? v : mix(v);
    return { ...lk, palette };
  }
  // A party member's look with the armour they wear now (a character-screen look shows it on the body).
  function memberLook(m) {
    const id = m.look || (m.who === 'bob' ? deps.bobLook : '') || A.encodeParts({ body: 'm', outfit: 'tee' });
    const p = String(id).startsWith('c:') ? A.decodeParts(id) : null;
    if (p) return lookFor(A.encodeParts({ ...p, armour: base(m.armour), weapon: R.lookKit(m.weapon), shield: base(m.shield) }));
    return lookFor(id) || lookFor('robot-0');
  }
  // Journey's own creatures, folk and craft (public/journey-sides.js), tinted like the rest.
  function beastLookFor(id, tint) {
    if (!id) return null;
    const key = `beast:${id}|${tint || ''}`;
    if (lookCache.has(key)) return lookCache.get(key);
    let lk = null; try { lk = S.beastLook?.(id) || null; } catch {}
    if (lk && tint) lk = tinted(lk, tint);
    lookCache.set(key, lk);
    return lk;
  }
  const personLook = (p) => (p.role === 'keeper' ? lookFor(deps.bobLook) : p.beast ? beastLookFor(p.beast, p.tint) : lookFor(A.encodeParts(p.parts || {}), p.tint));
  const plainFoeLook = (f) => (f.person ? personLook(f.person) : f.parts ? lookFor(A.encodeParts(f.parts)) : lookFor(deps.enemyLooks?.[f.type], f.tint) || beastLookFor(f.type, f.tint) || lookFor(A.encodeParts({ body: 'blob', skin: '0' }), f.tint));
  // Journey v1.3: monsters redrawn for the style. People-shaped ones change clothes (a skeleton becomes a robot),
  // machines get their own art, and the rest take the style's colours. Animals, pets and people stay as they are.
  function foeLook(f) {
    const st = j?.style;
    if (!st || st === 'fantasy' || f.person || f.parts || !S.STYLE_MONSTERS?.has(f.type)) return plainFoeLook(f);
    const key = `style:${st}:${f.type}|${f.tint || ''}`;
    if (lookCache.has(key)) return lookCache.get(key);
    let lk = null;
    try {
      const art = S.styleArtLook(st, f.type);
      const dress = S.STYLE_PARTS[st]?.[f.type];
      if (art) lk = f.tint ? tinted(art, f.tint) : art;
      else if (dress) {
        const id = deps.enemyLooks?.[f.type];
        const p = String(id || '').startsWith('c:') ? A.decodeParts(id) : { ...A.DEFAULT_PARTS, weapon: f.type === 'skeleton' ? 'sword' : 'none' };
        lk = S.styleShift(lookFor(A.encodeParts({ ...p, ...dress }), f.tint), st, f.type);
      } else lk = S.styleShift(plainFoeLook(f), st, f.type);
    } catch { lk = null; }
    lk = lk || plainFoeLook(f);
    lookCache.set(key, lk);
    return lk;
  }
  // What a pet or mount looks like, and what the leader rides (in sci-fi, cyberpunk and steampunk a flier or a
  // swimmer is ridden as that style's own craft: a shuttle, a hoverbike, an airship, a submarine).
  const petLook = (p) => beastLookFor(p.type);
  function rideLook(mt) {
    const f = R.FOES[mt.type] || {};
    const craft = R.craftFor(j?.style, f.fly ? 'fly' : f.swim ? 'swim' : '');
    return (craft && beastLookFor(craft)) || petLook(mt);
  }
  // Rusty, blessed, cursed and arcane kit is drawn in its colour.
  const kitTint = (key) => S.AFFIX_TINTS?.[R.splitKit(key).affix] || '';
  const SHOT = new Set(['bow', 'longbow', 'crossbow', 'handbow']);
  function drawFig(look, x, y, px, o = {}) { try { return S.drawFigure(ctx, x, y, px, look, { compose: A.compose, style: j?.style && j.style !== 'fantasy' ? j.style : undefined, ...o }); } catch { return null; } }
  // Sparkles and magic take the style's colours (Journey v1.3).
  const SPARKS = { fantasy: ['#ffd166', '#ffffff', '#fff6c0'], scifi: ['#7ae0ff', '#ffffff', '#c8f0ff'], cyber: ['#ff3ad8', '#7dff9a', '#ffffff'], steam: ['#c8a060', '#ffd166', '#e8e8e8'] };
  const styleSparks = () => SPARKS[j?.style] || SPARKS.fantasy;
  // Extras drawn over a figure: a crown for the King and Queen, wings for a Pixie, a floating crystal for a Psionist.
  function extras(x, y, px, o) {
    if (o.crown) { ctx.fillStyle = '#ffd166'; ctx.fillRect(x + 5 * px, y - 1 * px, 6 * px, 2 * px); for (const cx of [5, 7, 9]) ctx.fillRect(x + (cx + 0.5) * px, y - 2.5 * px, px, 1.5 * px); ctx.fillStyle = '#d0303a'; ctx.fillRect(x + 7.5 * px, y - 0.5 * px, px, px); }
    if (o.wings) { ctx.globalAlpha = 0.55; ctx.fillStyle = '#c8f0ff'; const flap = o.flap ? 1 : 0; ctx.fillRect(x - (1 + flap) * px, y + 6 * px, 3 * px, 5 * px); ctx.fillRect(x + (14 + flap) * px, y + 6 * px, 3 * px, 5 * px); ctx.fillStyle = '#ff9ae0'; ctx.fillRect(x - flap * px, y + 9 * px, 2 * px, 3 * px); ctx.fillRect(x + (14 + flap) * px, y + 9 * px, 2 * px, 3 * px); ctx.globalAlpha = 1; }
    if (o.crystal) { const bob = Math.round(Math.sin(now() / 300) * px); ctx.fillStyle = '#c070ff'; ctx.fillRect(x + 15 * px, y + 2 * px + bob, 2 * px, 3 * px); ctx.fillStyle = '#f0d0ff'; ctx.fillRect(x + 15 * px, y + 2 * px + bob, px, px); }
  }
  const memberExtras = (m) => ({ wings: m.race === 'pixie', crystal: m.classes?.includes('psionist') });

  // ---------- Tiles, drawn once each ----------
  const tileArt = new Map();
  const hash = (x, y, n = 0) => { let h = (x * 374761393 + y * 668265263 + n * 1442695041) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // Whose place it is changes how the houses look (theme: the kind of place), and the style tints everything.
  const THEMES = {
    orccamp: { roof: '#6a4a2a', wall: '#8a6a4a', shape: 'tent' }, dwarfhold: { roof: '#5a5a64', wall: '#9a9aa4' }, elfwood: { roof: '#3d8a38', wall: '#d8e8c0', shape: 'leaf' },
    burrow: { roof: '#4e9440', wall: '#8a6a3a', shape: 'mound' }, glade: { roof: '#d0303a', wall: '#efe6d2', shape: 'mushroom' }, stilts: { roof: '#8a7a3a', wall: '#8a6a3a', shape: 'stilts' },
    gnome: { roof: '#2a7a8a', wall: '#e8d8b0' }, centaur: { roof: '#c8a66a', wall: '#a07a4a', shape: 'tent' }, giant: { roof: '#4a4a54', wall: '#7a7a84' },
    goblin: { roof: '#8a3a6a', wall: '#a08a5a', shape: 'tent' }, aerie: { roof: '#ffe680', wall: '#f4f8ff', shape: 'dome' }, reef: { roof: '#ff9a8a', wall: '#c8f0ff', shape: 'dome' }
  };
  function tileCanvas(ch, frame = 0, theme = '', bare = false, v = 0) {
    const style = j?.style || 'fantasy';
    const key = `${ch}${frame}${theme}|${style}${bare ? '|bare' : ''}${v ? `|v${v}` : ''}`;
    if (tileArt.has(key)) return tileArt.get(key);
    const c = doc.createElement('canvas'); c.width = TILE; c.height = TILE;
    const g = c.getContext('2d');
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const fill = (col) => rect(0, 0, TILE, TILE, col);
    const specks = (col, n, seed) => { for (let i = 0; i < n; i++) px(Math.floor(hash(i, seed) * 16), Math.floor(hash(seed, i) * 16), col); };
    // A thing standing on the land (a house, a tree, a tower) is drawn bare, on nothing: the screen lays the ground
    // it stands on underneath first, so it matches grass, sand, snow, swamp or a town square (Journey v1.3).
    const grass = () => { if (bare) return; fill('#5aa04a'); specks('#4c8c3e', 14, 3); specks('#6cb85a', 8, 7); };
    const boards = (a, b) => { fill(a); for (let y = 0; y < 16; y += 4) rect(0, y, 16, 1, b); for (let y = 0; y < 16; y += 4) rect((y * 3) % 16, y, 1, 4, b); };
    const stone = (a, b) => { fill(a); for (let y = 0; y < 16; y += 4) { rect(0, y, 16, 1, b); for (let x = (y % 8 ? 4 : 0); x < 16; x += 8) rect(x, y, 1, 4, b); } };
    const water = (deep, light) => { fill(deep); for (let i = 0; i < 3; i++) { const y = 3 + i * 5, x = ((i * 5) + frame * 3) % 12; rect(x, y, 4, 1, light); } };
    const th = THEMES[theme];
    // Windows glow in the style's light: daylight blue, cyan screens, neon pink and blue, warm gaslight.
    const WIN = { fantasy: '#7ec8ff', scifi: '#9af0ff', cyber: '#ff3ad8', steam: '#ffb04a' }, WIN2 = { fantasy: '#7ec8ff', scifi: '#9af0ff', cyber: '#3ad8ff', steam: '#ffb04a' };
    const building = (roof, wall, sign) => {
      if (!bare) fill(theme === 'aerie' ? '#e8eef8' : theme === 'reef' ? '#5a7a9a' : '#b8a07a');
      if (th) { roof = th.roof; wall = th.wall; }
      const shape = th?.shape;
      if (shape === 'mound') { g.fillStyle = roof; g.beginPath(); g.arc(8, 13, 9, Math.PI, 0); g.fill(); g.fillStyle = '#6b4423'; g.beginPath(); g.arc(8, 13, 3, Math.PI, 0); g.fill(); rect(5, 13, 6, 3, roof); g.fillStyle = '#ffd166'; g.fillRect(8, 11, 1, 1); sign?.(); return; }
      if (shape === 'tent') { g.fillStyle = roof; g.beginPath(); g.moveTo(1, 16); g.lineTo(8, 1); g.lineTo(15, 16); g.fill(); g.fillStyle = wall; g.beginPath(); g.moveTo(6, 16); g.lineTo(8, 9); g.lineTo(10, 16); g.fill(); rect(7, 0, 2, 2, '#6b4423'); sign?.(); return; }
      if (shape === 'mushroom') { rect(4, 8, 8, 8, wall); g.fillStyle = roof; g.beginPath(); g.ellipse(8, 7, 8, 6, 0, Math.PI, 0); g.fill(); rect(0, 6, 16, 2, roof); for (const [x, y] of [[4, 3], [9, 2], [12, 5], [6, 6]]) rect(x, y, 2, 1, '#ffffff'); rect(7, 11, 2, 5, '#6b4423'); sign?.(); return; }
      if (shape === 'dome') { rect(2, 7, 12, 9, wall); g.fillStyle = roof; g.beginPath(); g.ellipse(8, 7, 7, 6, 0, Math.PI, 0); g.fill(); rect(7, 0, 2, 2, roof); rect(7, 11, 2, 5, theme === 'reef' ? '#2a5aa8' : '#c8a040'); sign?.(); return; }
      if (shape === 'stilts') { fill('#3a78c8'); rect(3, 10, 1, 6, '#6b4423'); rect(12, 10, 1, 6, '#6b4423'); rect(1, 4, 14, 7, wall); g.fillStyle = roof; g.beginPath(); g.moveTo(0, 5); g.lineTo(8, 0); g.lineTo(16, 5); g.fill(); rect(7, 7, 2, 4, '#3a2410'); sign?.(); return; }
      rect(1, 6, 14, 10, wall); g.fillStyle = roof; g.beginPath(); g.moveTo(0, 7); g.lineTo(8, 0); g.lineTo(16, 7); g.fill();
      if (shape === 'leaf') { g.fillStyle = '#2f6a2a'; g.beginPath(); g.arc(4, 3, 3, 0, Math.PI * 2); g.arc(12, 3, 3, 0, Math.PI * 2); g.fill(); }
      rect(7, 11, 3, 5, '#6b4423'); sign?.();
    };
    const kinSite = (body) => { grass(); body(); };
    const rock = () => { if (!bare) { fill('#7e8a96'); return; } g.fillStyle = '#7e8a96'; g.beginPath(); g.moveTo(0, 16); g.lineTo(1, 5); g.lineTo(5, 1); g.lineTo(11, 1); g.lineTo(15, 5); g.lineTo(16, 16); g.fill(); g.fillStyle = '#9aa6b2'; g.fillRect(5, 1, 6, 1); };
    switch (ch) {
      case '.': grass(); break;
      case '"': fill('#4e9440'); for (let i = 0; i < 9; i++) { const x = Math.floor(hash(i, 11) * 14) + 1, y = Math.floor(hash(11, i) * 12) + 3; px(x, y, '#2f6a2a'); px(x, y - 1, '#3d7f34'); px(x + 1, y - 2, '#6cb85a'); } break;
      case 'g': grass(); break;
      case 'F': fill('#3d7f34'); specks('#2f6a2a', 10, 21); for (const [x, y] of [[4, 5], [11, 9]]) { rect(x - 1, y + 3, 2, 3, '#6b4423'); g.fillStyle = '#245a22'; g.beginPath(); g.moveTo(x - 4, y + 4); g.lineTo(x, y - 5); g.lineTo(x + 4, y + 4); g.fill(); } break;
      case 'T': grass(); rect(7, 11, 2, 4, '#6b4423'); g.fillStyle = '#2f6a2a'; g.beginPath(); g.arc(8 + frame * 0.6, 7, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3d8a38'; g.beginPath(); g.arc(6.5 + frame * 0.6, 5.5, 3, 0, Math.PI * 2); g.fill(); px(10 + frame, 4, '#5aa04a'); px(5 + frame, 9, '#245a22'); break;
      case 'y': grass(); for (let i = 0; i < 6; i++) { const x = 2 + Math.floor(hash(i, 31) * 12), y = 3 + Math.floor(hash(31, i) * 10); px(x, y + 1, '#2f6a2a'); px(x, y, ['#ff7ad8', '#ffd166', '#ffffff', '#7ae0ff'][i % 4]); } break;
      case 'w': fill('#4a6a3a'); specks('#3a5a2e', 10, 41); rect(2, 4, 6, 2, '#5a7a8a'); rect(9, 10, 5, 2, '#5a7a8a'); px(4, 3, '#2a4a2a'); px(11, 8, '#2a4a2a'); px(12, 7, '#7a9a4a'); break;
      case 'd': fill('#e6c98a'); specks('#d4b070', 12, 51); g.fillStyle = '#d4b070'; for (let x = 0; x < 16; x += 2) g.fillRect(x, 6 + Math.round(Math.sin(x / 2.5) * 2), 2, 1); break;
      case 'µ': fill('#7a8670'); specks('#68745e', 14, 101); specks('#8e9a82', 8, 103); rect(3, 5, 3, 1, '#5e6858'); rect(10, 11, 4, 1, '#5e6858'); break; // a rocky slope among the peaks
      case ',': fill('#e0cf8f'); specks('#c9b676', 10, 9); break;
      case ':': case '*': fill(ch === '*' ? '#b8a07a' : '#c8a66a'); specks(ch === '*' ? '#9c8662' : '#a98a52', 10, 5); if (ch === '*') { g.fillStyle = '#a08a68'; for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1); for (let x = 0; x < 16; x += 8) g.fillRect(x, 0, 1, 16); } break;
      case '~': water('#2a5aa8', '#6aa0e0'); break;
      case 'r': water('#3a78c8', '#9ac8f0'); break; // banks are drawn where the land is (shore), not baked in
      case '=': fill('#3a78c8'); rect(0, 2, 16, 12, '#8a5a2b'); g.fillStyle = '#6b4423'; for (let x = 0; x < 16; x += 4) g.fillRect(x, 2, 1, 12); rect(0, 2, 16, 1, '#4a2e18'); rect(0, 13, 16, 1, '#4a2e18'); break;
      case '^': grass(); g.fillStyle = '#7e8a96'; g.beginPath(); g.moveTo(1, 15); g.lineTo(7, 2); g.lineTo(15, 15); g.fill(); g.fillStyle = '#e8eef4'; g.beginPath(); g.moveTo(7, 2); g.lineTo(9, 6); g.lineTo(5, 6); g.fill(); rect(9, 9, 3, 1, '#525c66'); break;
      case 'f': grass(); rect(0, 6, 16, 2, '#8a5a2b'); rect(0, 11, 16, 2, '#8a5a2b'); rect(2, 4, 2, 11, '#6b4423'); rect(12, 4, 2, 11, '#6b4423'); break;
      case 'W': stone('#8a8a92', '#5a5a64'); rect(0, 0, 16, 2, '#a8a8b0'); break;
      case 'Q': stone('#7a7a84', '#4a4a54'); for (let x = 0; x < 16; x += 4) rect(x, 0, 2, 3, '#a8a8b0'); rect(6, 6, 4, 5, '#14110f'); break;
      case 'G': fill('#c8a66a'); rect(0, 0, 3, 16, '#6a6a74'); rect(13, 0, 3, 16, '#6a6a74'); g.fillStyle = '#3a3a44'; for (let x = 4; x < 13; x += 3) g.fillRect(x, 0, 1, 3); break;
      case 'U': grass(); g.fillStyle = '#8a8a92'; g.beginPath(); g.arc(8, 9, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a5aa8'; g.beginPath(); g.arc(8, 9, 3.5, 0, Math.PI * 2); g.fill(); rect(2, 2, 1, 7, '#6b4423'); rect(13, 2, 1, 7, '#6b4423'); rect(2, 2, 12, 1, '#6b4423'); break;
      case 'h': building('#9a3a2a', '#efe6d2', () => { rect(3, 9, 2, 2, WIN[style] || WIN.fantasy); rect(11, 9, 2, 2, WIN2[style] || WIN.fantasy); }); break;
      case 'i': building('#2a4a8a', '#efe6d2', () => { rect(2, 9, 3, 3, '#ffd166'); px(3, 10, '#6b4423'); }); break;
      case 's': building('#2a7a4a', '#efe6d2', () => { g.fillStyle = '#ffd166'; g.beginPath(); g.arc(4, 10, 1.7, 0, Math.PI * 2); g.fill(); }); break;
      case 'm': building('#4a4a54', '#c8b8a0', () => { rect(2, 9, 3, 2, '#ff8a3a'); rect(11, 2, 2, 4, '#3a3a44'); px(12, 1, '#9aa3ad'); }); break;
      case 't': building('#e8e0d0', '#d8d0c0', () => { rect(7, 1, 2, 5, '#ffd166'); rect(5, 3, 6, 1, '#ffd166'); }); break;
      case 'a': grass(); rect(1, 1, 14, 14, '#c8a66a'); rect(3, 4, 1, 9, '#6b4423'); g.fillStyle = '#b84a3a'; g.beginPath(); g.arc(11, 8, 3.5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#efe6d2'; g.beginPath(); g.arc(11, 8, 1.8, 0, Math.PI * 2); g.fill(); break;
      case 'R': building('#6a2a2a', '#a8a090', () => { rect(2, 8, 12, 1, '#8a2a2a'); rect(3, 9, 2, 2, '#14110f'); rect(11, 9, 2, 2, '#14110f'); }); break;
      case 'x': stone('#9a8a7a', '#7a6a5a'); break;
      case 'u': fill('#8a2a3a'); rect(1, 0, 1, 16, '#ffd166'); rect(14, 0, 1, 16, '#ffd166'); specks('#a83a4a', 8, 61); break;
      case 'Y': stone('#9a8a7a', '#7a6a5a'); rect(3, 1, 10, 14, '#8a2a3a'); rect(3, 1, 10, 3, '#ffd166'); rect(5, 5, 6, 8, '#a83a4a'); break;
      case 'P': stone('#9a8a7a', '#7a6a5a'); rect(4, 0, 8, 16, '#c8c0b0'); rect(5, 0, 1, 16, '#e8e0d0'); rect(3, 0, 10, 2, '#a8a090'); rect(3, 14, 10, 2, '#a8a090'); break;
      // Journey v1.3: the inn's back door (an arrow up, to the guest house) and the trophy case.
      case '6': boards('#9a6a3a', '#7a5028'); rect(0, 0, 16, 3, '#3a2410'); rect(3, 0, 10, 14, '#6b4423'); rect(4, 1, 8, 12, '#8a5a2b'); px(10, 7, '#ffd166'); g.fillStyle = '#ffd166'; g.beginPath(); g.moveTo(5, 13); g.lineTo(8, 9); g.lineTo(11, 13); g.fill(); break;
      case '7': fill('#5a3a1e'); rect(0, 0, 16, 2, '#3a2410'); rect(1, 2, 14, 12, '#2a2030'); rect(1, 2, 14, 12, 'rgba(160,200,255,0.18)'); rect(1, 8, 14, 1, '#8a5a2b'); rect(0, 14, 16, 2, '#6b4423'); px(2, 3, '#ffffff'); px(3, 4, '#ffffff'); break;
      case 'e': fill(frame ? '#c8a66a' : '#c8a66a'); rect(0, 12, 16, 4, '#a98a52'); g.fillStyle = '#ffd166'; g.beginPath(); g.moveTo(5, 5); g.lineTo(8, 9); g.lineTo(11, 5); g.fill(); break;
      // Underground
      case '_': fill('#4a3a2e'); specks('#3a2c22', 12, 13); specks('#5c4a3a', 6, 17); break;
      case '#': fill('#2a2a30'); g.fillStyle = '#3a3a44'; for (let y = 0; y < 16; y += 5) for (let x = (y % 10 ? 4 : 0); x < 16; x += 8) g.fillRect(x, y, 6, 3); break;
      case 'z': stone('#5a5a64', '#44444c'); specks('#6a7a5a', 5, 71); break;
      case 'Z': stone('#34343c', '#24242a'); specks('#4a5a3a', 6, 73); break;
      // Bob's Inn and the hut
      case 'o': boards('#9a6a3a', '#7a5028'); break;
      case 'B': fill('#5a3a1e'); rect(0, 0, 16, 3, '#3a2410'); rect(0, 7, 16, 1, '#3a2410'); rect(0, 12, 16, 1, '#3a2410'); rect(3, 3, 1, 4, '#3a2410'); rect(11, 8, 1, 4, '#3a2410'); break;
      case 'b': boards('#9a6a3a', '#7a5028'); rect(0, 3, 16, 10, '#6b4423'); rect(0, 3, 16, 2, '#8a5a2b'); rect(5, 5, 3, 3, '#efe6d2'); rect(10, 6, 2, 3, '#ffd166'); break;
      case 'c': boards('#9a6a3a', '#7a5028'); rect(4, 6, 8, 5, '#6b4423'); rect(4, 6, 8, 1, '#8a5a2b'); rect(5, 11, 1, 3, '#4a2e18'); rect(10, 11, 1, 3, '#4a2e18'); break;
      case 'k': fill('#6b4423'); rect(0, 0, 16, 4, '#8a5a2b'); rect(0, 4, 16, 1, '#4a2e18'); for (let x = 1; x < 16; x += 5) rect(x, 6, 3, 9, '#5a3a1e'); break;
      case 'p': stone('#6a5a50', '#4a3a30'); rect(3, 6, 10, 10, '#14110f'); rect(4, 10 - frame, 8, 6 + frame, '#ff8a3a'); rect(6, 11 - frame, 4, 5, '#ffd166'); break;
      case 'q': boards('#9a6a3a', '#7a5028'); g.fillStyle = '#8a5a2b'; g.beginPath(); g.ellipse(8, 8, 6, 7, 0, 0, Math.PI * 2); g.fill(); rect(2, 4, 12, 1, '#4a4a54'); rect(2, 11, 12, 1, '#4a4a54'); break;
      case 'n': fill('#5a3a1e'); rect(2, 2, 12, 11, '#c8a66a'); rect(4, 4, 4, 3, '#efe6d2'); rect(9, 5, 3, 4, '#efe6d2'); rect(5, 8, 3, 3, '#efe6d2'); px(5, 4, '#d0303a'); px(10, 5, '#d0303a'); break;
      case 'u2': break;
      case 'l': boards('#9a6a3a', '#7a5028'); rect(1, 2, 14, 12, '#6b4423'); rect(2, 3, 12, 10, '#efe6d2'); rect(2, 3, 12, 3, '#ffffff'); rect(2, 7, 12, 6, '#2a4a8a'); break;
      case 'j': boards('#b88a4a', '#8a6030'); rect(0, 0, 16, 1, '#ffd166'); break;
      // Sites on the land
      case 'v': case 'V': case 'O': { grass(); const n = ch === 'v' ? 1 : ch === 'V' ? 2 : 3; for (let i = 0; i < n; i++) { const x = 1 + i * 5, y = 6 - i % 2 * 2; rect(x, y + 4, 5, 5, '#efe6d2'); g.fillStyle = ['#9a3a2a', '#2a4a8a', '#2a7a4a'][i]; g.beginPath(); g.moveTo(x - 1, y + 5); g.lineTo(x + 2.5, y); g.lineTo(x + 6, y + 5); g.fill(); } if (ch === 'O') { rect(0, 14, 16, 2, '#8a8a92'); } break; }
      case 'K': grass(); rect(2, 5, 12, 11, '#8a8a92'); for (let x = 2; x < 14; x += 3) rect(x, 3, 2, 2, '#8a8a92'); rect(6, 1, 4, 6, '#a8a8b0'); rect(7, 0, 1, 2, '#d0303a'); rect(6, 10, 4, 6, '#14110f'); break;
      case 'C': rock(); g.fillStyle = '#14110f'; g.beginPath(); g.arc(8, 11, 5, Math.PI, 0); g.fill(); rect(3, 11, 10, 5, '#14110f'); rect(0, 0, 16, 2, '#525c66'); break;
      case 'D': grass(); rect(2, 4, 12, 12, '#4a4a54'); rect(2, 4, 12, 2, '#6a6a74'); for (let x = 2; x < 14; x += 3) rect(x, 2, 2, 2, '#4a4a54'); rect(6, 9, 4, 7, '#14110f'); px(7, 7, '#7dff9a'); px(8, 7, '#7dff9a'); break;
      case 'H': grass(); rect(3, 8, 10, 8, '#6b4423'); g.fillStyle = '#8a7a3a'; g.beginPath(); g.moveTo(1, 9); g.lineTo(8, 2); g.lineTo(15, 9); g.fill(); rect(7, 11, 2, 5, '#3a2410'); rect(11, 3, 2, 3, '#4a4a54'); px(12, 1, '#c8c8c8'); break;
      case 'I': grass(); rect(1, 6, 14, 10, '#8a5a2b'); g.fillStyle = '#6a2a2a'; g.beginPath(); g.moveTo(0, 7); g.lineTo(8, 0); g.lineTo(16, 7); g.fill(); rect(6, 10, 4, 6, '#3a2410'); rect(2, 8, 3, 3, '#ffd166'); rect(11, 8, 3, 3, '#ffd166'); rect(12, 3, 3, 2, '#ffd166'); break;
      // Journey v1.2: the cities in the sky and under the sea, their floors, and the folk's own places on the land.
      case 'S': fill('#7ec8ff'); g.fillStyle = '#ffffff'; for (const [x, y, r] of [[4, 12, 4], [9, 11, 5], [13, 13, 3]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } rect(5, 3, 2, 8, '#f4f8ff'); rect(9, 1, 2, 10, '#f4f8ff'); rect(9, 0, 2, 1, '#ffd166'); rect(5, 2, 2, 1, '#ffd166'); rect(12, 5, 2, 6, '#e8eef8'); break;
      case 'A': water('#1a4a98', '#6aa0e0'); g.fillStyle = 'rgba(200,240,255,0.55)'; g.beginPath(); g.arc(8, 11, 6, Math.PI, 0); g.fill(); rect(6, 7, 1, 4, '#ff9a8a'); rect(9, 6, 1, 5, '#ff9a8a'); px(8, 4, '#ffffff'); break;
      case '%': fill('#f4f8ff'); specks('#dfe8f4', 16, 81); specks('#ffffff', 8, 83); break;
      case '&': fill('#7ec8ff'); g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(4 + frame * 2, 10, 4, 0, Math.PI * 2); g.arc(11 + frame, 6, 3, 0, Math.PI * 2); g.fill(); break;
      case '$': fill('#c8b88a'); specks('#a8986a', 12, 91); specks('#e8dcb0', 6, 93); px(4, 6, '#ff9a8a'); px(11, 12, '#ffffff'); break;
      case '+': fill('#2a5aa8'); for (const [x, col] of [[2, '#ff7a8a'], [7, '#ffb04a'], [12, '#c070ff']]) { rect(x, 6, 2, 10, col); rect(x - 1, 8, 1, 3, col); rect(x + 2, 5, 1, 3, col); } break;
      case 'X': kinSite(() => { for (const x of [1, 9]) { g.fillStyle = '#6a4a2a'; g.beginPath(); g.moveTo(x, 15); g.lineTo(x + 3, 6); g.lineTo(x + 6, 15); g.fill(); } rect(0, 14, 16, 2, '#8a5a2b'); rect(7, 3, 1, 8, '#6b4423'); rect(8, 3, 3, 2, '#8a2a2a'); }); break;
      case 'L': rock(); g.fillStyle = '#14110f'; g.beginPath(); g.arc(8, 12, 4, Math.PI, 0); g.fill(); rect(4, 12, 8, 4, '#14110f'); px(6, 10, '#ffd166'); px(10, 10, '#ffd166'); rect(2, 2, 2, 2, '#c8a66a'); rect(12, 3, 2, 2, '#c8a66a'); break;
      case 'N': rock(); rect(3, 4, 10, 12, '#5a5a64'); rect(3, 4, 10, 2, '#9a9aa4'); rect(6, 8, 4, 8, '#14110f'); rect(6, 8, 4, 1, '#ffd166'); for (const x of [3, 6, 9, 12]) rect(x, 2, 1, 2, '#5a5a64'); break;
      case 'E': if (!bare) fill('#3d7f34'); rect(7, 6, 2, 10, '#6b4423'); g.fillStyle = '#245a22'; g.beginPath(); g.arc(8, 5, 6, 0, Math.PI * 2); g.fill(); rect(3, 8, 4, 3, '#d8e8c0'); rect(9, 4, 4, 3, '#d8e8c0'); px(4, 9, '#ffd166'); px(10, 5, '#ffd166'); break;
      case 'M': grass(); for (const x of [4, 11]) { g.fillStyle = '#4e9440'; g.beginPath(); g.arc(x, 12, 5, Math.PI, 0); g.fill(); g.fillStyle = '#c8a040'; g.beginPath(); g.arc(x, 12, 2, 0, Math.PI * 2); g.fill(); } break;
      case 'J': grass(); for (const [x, y, col] of [[4, 9, '#d0303a'], [11, 11, '#c070ff'], [8, 5, '#ff9ae0']]) { rect(x - 1, y, 2, 4, '#efe6d2'); g.fillStyle = col; g.beginPath(); g.ellipse(x, y, 4, 3, 0, Math.PI, 0); g.fill(); } px(3, 3, '#fff6c0'); px(13, 4, '#fff6c0'); break;
      case '1': fill('#4a6a3a'); rect(0, 11, 16, 5, '#3a78c8'); for (const x of [2, 9]) { rect(x + 1, 9, 1, 6, '#6b4423'); rect(x + 4, 9, 1, 6, '#6b4423'); rect(x, 4, 6, 5, '#8a6a3a'); g.fillStyle = '#8a7a3a'; g.beginPath(); g.moveTo(x - 1, 5); g.lineTo(x + 3, 1); g.lineTo(x + 7, 5); g.fill(); } break;
      case '2': grass(); rect(2, 6, 12, 10, '#e8d8b0'); rect(2, 4, 12, 3, '#2a7a8a'); rect(11, 0, 2, 5, '#5a5a64'); g.strokeStyle = '#ffd166'; g.lineWidth = 1; g.beginPath(); g.arc(6, 10, 2.5, 0, Math.PI * 2); g.stroke(); rect(10, 11, 2, 5, '#6b4423'); break;
      case '3': grass(); for (const x of [1, 9]) { g.fillStyle = '#c8a66a'; g.beginPath(); g.moveTo(x, 15); g.lineTo(x + 3, 4); g.lineTo(x + 6, 15); g.fill(); rect(x + 3, 2, 1, 3, '#6b4423'); } rect(7, 0, 1, 3, '#d0303a'); break;
      case '4': rock(); rect(0, 3, 16, 13, '#4a4a54'); rect(0, 3, 16, 2, '#7a7a84'); rect(5, 7, 6, 9, '#14110f'); rect(1, 1, 3, 2, '#4a4a54'); rect(12, 1, 3, 2, '#4a4a54'); break;
      case '5': grass(); for (const [x, col] of [[1, '#8a3a6a'], [6, '#3a6a8a'], [11, '#8a6a2a']]) { rect(x, 6, 4, 9, '#a08a5a'); rect(x - 1, 4, 6, 3, col); } px(3, 9, '#ffd166'); px(13, 9, '#c0c0c0'); break;
      default: fill('#000');
    }
    // Journey v1.3 details: the same ground in a few versions so the land doesn't repeat. Tufts, flowers, pebbles,
    // little stones on a path, ripples in the sand.
    if (v && !bare) {
      const r = (n) => hash(v * 31 + n, ch.charCodeAt(0));
      if ('.g"'.includes(ch)) {
        if (v === 1) for (let i = 0; i < 3; i++) { const x = 2 + Math.floor(r(i) * 12), y = 3 + Math.floor(r(i + 9) * 10); px(x, y, ['#ffd166', '#ffffff', '#ff9ae0'][i]); px(x, y + 1, '#3d7f34'); }
        if (v === 2) { rect(4 + Math.floor(r(1) * 6), 9 + Math.floor(r(2) * 4), 3, 2, '#8a8a80'); px(5 + Math.floor(r(1) * 6), 9 + Math.floor(r(2) * 4), '#b0b0a6'); }
        if (v === 3) for (let i = 0; i < 4; i++) { const x = 2 + Math.floor(r(i + 3) * 12), y = 4 + Math.floor(r(i + 7) * 9); px(x, y, '#3d7f34'); px(x - 1, y + 1, '#3d7f34'); px(x + 1, y + 1, '#3d7f34'); }
      } else if ('d,'.includes(ch)) {
        if (v === 1) { rect(3 + Math.floor(r(1) * 8), 8, 2, 1, '#bfa060'); rect(6 + Math.floor(r(2) * 6), 12, 3, 1, '#bfa060'); }
        if (v === 2 && ch === 'd') { rect(10, 5, 2, 7, '#5a9a4a'); rect(8, 7, 2, 1, '#5a9a4a'); rect(8, 5, 1, 2, '#5a9a4a'); rect(12, 8, 2, 1, '#5a9a4a'); rect(13, 6, 1, 2, '#5a9a4a'); }
        if (v === 3) rect(4 + Math.floor(r(3) * 8), 6 + Math.floor(r(4) * 6), 2, 2, '#a89a7a');
      } else if (ch === ':' || ch === '*') {
        if (v >= 2) for (let i = 0; i < 3; i++) px(2 + Math.floor(r(i) * 12), 2 + Math.floor(r(i + 5) * 12), ch === '*' ? '#8a7656' : '#a08458');
      } else if (ch === 'F' && v === 1) { px(3, 13, '#ff9ae0'); px(12, 3, '#ffd166'); }
    }
    // The style's colour, laid over the whole land: cool blue for sci-fi, neon pink in the dark for cyberpunk,
    // brass for steampunk.
    const st = R.STYLES?.[style];
    if (st?.dark) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(10,8,24,${st.dark})`; g.fillRect(0, 0, TILE, TILE); }
    if (st?.tint) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = st.tint[1]; g.fillStyle = st.tint[0]; g.fillRect(0, 0, TILE, TILE); g.globalAlpha = 1; }
    g.globalCompositeOperation = 'source-over';
    tileArt.set(key, c);
    return c;
  }
  // The land seen from under the sea: soft, dim and far away (made once per tile).
  function blurredTile(ch, frame) {
    const key = `${ch}${frame}~blur|${j?.style}`;
    if (tileArt.has(key)) return tileArt.get(key);
    const c = doc.createElement('canvas'); c.width = TILE; c.height = TILE;
    const g = c.getContext('2d');
    try { g.filter = 'blur(1.2px)'; } catch {}
    g.globalAlpha = 0.75; g.drawImage(tileCanvas(ch, frame), 0, 0);
    try { g.filter = 'none'; } catch {}
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(20,60,140,0.45)'; g.fillRect(0, 0, TILE, TILE);
    tileArt.set(key, c);
    return c;
  }
  const ANIMATED = new Set(['~', 'r', 'p', 'A', '&', 'T']);
  // Things that stand on the land (Journey v1.3): drawn on top of the ground round them instead of a ground of
  // their own. Houses, shops, towers, trees, fences, wells, caves, camps, villages and mountains.
  const STANDING = new Set(['T', '^', 'f', 'U', 'a', 'v', 'V', 'O', 'K', 'D', 'H', 'I', 'M', 'J', '2', '3', '5', 'X', 'h', 'i', 's', 'm', 't', 'R', 'L', 'N', '4', 'C', 'E']);
  const GROUND = new Set(['.', '"', 'g', 'F', 'y', 'd', ',', ':', '*', '_', 'w', '%', '$', 'o', 'j', 'z', 'Z', 'x', '~', 'r']);
  // The ground under a standing thing: whatever ground is most common round it (water only when there's nothing else).
  function groundUnder(map, x, y) {
    const memo = map.__ground || (map.__ground = new Map()), k = y * 65536 + x;
    if (memo.has(k)) return memo.get(k);
    const count = new Map();
    let hills = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.rows[y + dy]?.[x + dx] === '^') hills++;
    if (map.rows[y][x] === '^' && hills >= 6) { memo.set(k, 'µ'); return 'µ'; } // deep in a range: bare rocky slope
    for (let r = 1; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const c = map.rows[y + dy]?.[x + dx]; if (GROUND.has(c)) count.set(c, (count.get(c) || 0) + ('~r'.includes(c) ? 0.01 : 1)); }
      if (count.size) break;
    }
    let best = map.kind === 'world' ? '.' : ':', n = 0;
    for (const [c, v] of count) if (v > n) { best = c; n = v; }
    if (memo.size > 20000) memo.clear();
    memo.set(k, best);
    return best;
  }
  const VARIED = new Set(['.', 'g', '"', 'd', ',', ':', '*', 'F']);
  const HOUSES = new Set(['h', 'i', 's', 'm', 't', 'R', 'H', 'I', '2']);
  const ROAD = new Set([':', '*']);
  // Foam where the sea meets the land, coming and going.
  function shore(map, x, y, sx, sy, t, river) {
    const land = (c) => c && !'~rA=+&$'.includes(c);
    if (river) { // a grassy bank along the land
      ctx.fillStyle = '#4c8c3e';
      if (land(map.rows[y - 1]?.[x])) ctx.fillRect(sx, sy, 16, 1);
      if (land(map.rows[y + 1]?.[x])) ctx.fillRect(sx, sy + 15, 16, 1);
      if (land(map.rows[y]?.[x - 1])) ctx.fillRect(sx, sy, 1, 16);
      if (land(map.rows[y]?.[x + 1])) ctx.fillRect(sx + 15, sy, 1, 16);
    }
    const k = (Math.sin(t / 700 + x * 0.7 + y * 0.3) + 1) / 2;
    ctx.fillStyle = `rgba(235,248,255,${0.35 + 0.4 * k})`;
    if (land(map.rows[y - 1]?.[x])) for (let i = 0; i < 16; i += 3) ctx.fillRect(sx + i, sy + (i % 2), 2, 1);
    if (land(map.rows[y + 1]?.[x])) for (let i = 1; i < 16; i += 3) ctx.fillRect(sx + i, sy + 14 + (i % 2), 2, 1);
    if (land(map.rows[y]?.[x - 1])) for (let i = 0; i < 16; i += 3) ctx.fillRect(sx + (i % 2), sy + i, 1, 2);
    if (land(map.rows[y]?.[x + 1])) for (let i = 1; i < 16; i += 3) ctx.fillRect(sx + 14 + (i % 2), sy + i, 1, 2);
    if (hash(x, y, Math.floor(t / 900)) < 0.08) { ctx.fillStyle = '#ffffff'; ctx.fillRect(sx + Math.floor(hash(y, x) * 12) + 2, sy + Math.floor(hash(x, y) * 12) + 2, 1, 1); } // a glint of sun
  }
  // Something alive about each house, in the style: smoke from the chimney, steam from pipes, a blinking aerial, a
  // neon sign that flickers.
  function houseLife(ch, x, y, sx, sy, t) {
    if (still()) return;
    const st = j?.style || 'fantasy', k = hash(x, y, 13);
    if (st === 'scifi') { if (Math.floor(t / 600 + k * 10) % 3 === 0) { ctx.fillStyle = '#ff5050'; ctx.fillRect(sx + 12, sy - 2, 1, 1); } ctx.fillStyle = '#9aa3ad'; ctx.fillRect(sx + 12, sy - 1, 1, 3); return; }
    if (st === 'cyber') { if (k < 0.6 && Math.floor(t / 150 + k * 40) % 17 !== 0) { ctx.fillStyle = k < 0.3 ? '#ff3ad8' : '#3ad8ff'; ctx.fillRect(sx + 2, sy + 5, 6, 1); ctx.globalAlpha = 0.25; ctx.fillRect(sx + 1, sy + 4, 8, 3); ctx.globalAlpha = 1; } return; }
    if (k > 0.65 && st !== 'steam') return;
    const n = st === 'steam' ? 4 : 3, col = st === 'steam' ? '238,238,238' : '170,170,176';
    for (let i = 0; i < n; i++) { const a = ((t / (st === 'steam' ? 900 : 1400) + i / n + k) % 1); ctx.fillStyle = `rgba(${col},${0.55 * (1 - a)})`; const r = 1 + a * 2.5; ctx.fillRect(Math.round(sx + 12 + Math.sin(a * 5 + k * 9) * 2 + a * 3 - r / 2), Math.round(sy - a * 12 - r / 2), Math.ceil(r), Math.ceil(r)); }
    if (st === 'steam') { ctx.fillStyle = '#8a5a2a'; ctx.fillRect(sx + 11, sy, 2, 3); }
  }
  // Street lamps (a lantern, a light pylon, a neon post, a gas lamp) and crates by the houses, here and there.
  function townProps(map, xa, ya, xb, yb, cx, cy, t) {
    const st = j?.style || 'fantasy';
    const lampCol = { fantasy: '#ffd166', scifi: '#9af0ff', cyber: (x) => (x % 2 ? '#ff3ad8' : '#3ad8ff'), steam: '#ffb04a' }[st];
    let taken = null;
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const c = map.rows[y]?.[x]; if (!'.:g,*'.includes(c || '#')) continue;
      const k = hash(x, y, 17);
      const near = (set) => [[0, -1], [1, 0], [-1, 0], [0, 1]].some(([dx, dy]) => set.has(map.rows[y + dy]?.[x + dx]));
      const nearHouse = near(HOUSES), roadside = !':*'.includes(c) && near(ROAD);
      if (!(nearHouse && k < 0.12) && !(roadside && (x + y) % 4 === 0 && k < 0.7)) continue;
      taken ||= new Set([...(R.peopleOn?.(world, j, map) || []).map((q) => `${q.x},${q.y}`), `${j.x},${j.y}`, ...map.chests.map((q) => `${q.x},${q.y}`)]);
      if (taken.has(`${x},${y}`)) continue;
      const sx = x * TILE - cx, sy = y * TILE - cy;
      if (nearHouse && k < 0.12 && !roadside) { // crates or barrels
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(sx + 3, sy + 13, 10, 2);
        if (st === 'fantasy' || st === 'steam') { ctx.fillStyle = '#8a5a2b'; ctx.fillRect(sx + 3, sy + 7, 5, 6); ctx.fillRect(sx + 9, sy + 9, 4, 4); ctx.fillStyle = '#5a3a1e'; ctx.fillRect(sx + 3, sy + 9, 5, 1); ctx.fillRect(sx + 9, sy + 10, 4, 1); }
        else { ctx.fillStyle = st === 'cyber' ? '#33384a' : '#c8d4e0'; ctx.fillRect(sx + 3, sy + 7, 6, 6); ctx.fillStyle = st === 'cyber' ? '#ffd166' : '#7ae0ff'; ctx.fillRect(sx + 3, sy + 9, 6, 1); }
        continue;
      }
      const col = typeof lampCol === 'function' ? lampCol(x) : lampCol;
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(sx + 6, sy + 14, 5, 1);
      ctx.fillStyle = st === 'steam' ? '#5a3a1e' : st === 'fantasy' ? '#3a3a40' : '#4a505a'; ctx.fillRect(sx + 8, sy + 3, 1, 11);
      const glow = still() ? 0.25 : 0.2 + 0.1 * Math.sin(t / 400 + x);
      ctx.fillStyle = col; ctx.fillRect(sx + 7, sy + 1, 3, 3);
      ctx.globalAlpha = glow; ctx.beginPath(); ctx.arc(sx + 8.5, sy + 2.5, 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  const onGroundNow = () => !(R.mapOf(world, j).kind === 'world' && j.alt !== 'ground');
  // Gathering spots (Journey v1.3): a little picture that glints now and then: a sprig of herbs, a log, a rock with
  // a seam of metal, a crystal. Coloured for the style.
  const MARKS = {
    herb: [['#5ad04a', [[1, 3], [2, 2], [3, 1], [3, 3], [4, 2], [2, 4]]], ['#ffffff', [[3, 1]]]],
    wood: [['#8a5a2b', [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4]]], ['#c8a066', [[4, 3], [4, 4]]]],
    ore: [['#7a7a84', [[1, 2], [2, 2], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3]]], ['#ffd166', [[2, 2], [3, 3]]]],
    crystal: [['#7ae0ff', [[2, 0], [1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [2, 3]]], ['#ffffff', [[2, 1]]]]
  };
  function nodeMarks(map, xa, ya, xb, yb, cx, cy, t) {
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const n = R.nodeAt?.(world, j, x, y); if (!n || !n.ready) continue;
      // Twice size with a dark edge, so it reads on any ground; a twinkle now and then.
      const sx = x * TILE - cx + 3, sy = y * TILE - cy + 4;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (const [, cells] of MARKS[n.kind] || []) for (const [a, b] of cells) ctx.fillRect(sx + a * 2 - 1, sy + b * 2 - 1, 4, 4);
      for (const [col, cells] of MARKS[n.kind] || []) { ctx.fillStyle = n.kind === 'crystal' && col !== '#ffffff' ? styleSparks()[0] : col; for (const [a, b] of cells) ctx.fillRect(sx + a * 2, sy + b * 2, 2, 2); }
      if (!still() && hash(x, y, Math.floor(t / 600)) < 0.2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(sx + 9, sy - 2, 1, 5); ctx.fillRect(sx + 7, sy, 5, 1); }
    }
  }
  // ---------- The trophy case (Journey v1.3) ----------
  // Trophies from every story, kept by the computer (or this browser, with no computer to keep them).
  let trophies = [];
  const TROPHY_KEY = 'bob.journey.trophies';
  async function loadTrophies() {
    try { const r = deps.api ? await deps.api('/api/adventure/journey/trophies') : null; if (Array.isArray(r?.trophies)) { trophies = r.trophies; return; } } catch {}
    try { trophies = R.keepTrophies(JSON.parse(store?.getItem(TROPHY_KEY) || '[]'), []); } catch { trophies = []; }
  }
  async function keepNew(fresh) {
    trophies = R.keepTrophies(trophies, fresh);
    try { const r = deps.api ? await deps.api('/api/adventure/journey/trophies', { trophies: fresh }) : null; if (Array.isArray(r?.trophies)) { trophies = r.trophies; return; } } catch {}
    try { store?.setItem(TROPHY_KEY, JSON.stringify(trophies)); } catch {}
  }
  // A new trophy is announced, and kept straight away.
  function award() {
    if (!j || lobby) return;
    const fresh = R.newTrophies(world, j); if (!fresh.length) return;
    keepNew(fresh);
    sfx('quest');
    const words = `🏆 ${fresh.length > 1 ? 'New trophies' : 'A new trophy'} for the guest house: ${fresh.map((t) => R.restyle(t.name, t.style)).join(', ')}.`;
    if (mode === 'walk' && !talk) talkTo([words]); else { msg = words; sayLive(words); }
  }
  const TROPHY_ICON = {
    cup: ['.aaaaa.', 'aabaaaa', '.aaaaa.', '..aaa..', '...a...', '..aaa..'],
    gem: ['..aaa..', '.abaaa.', 'aaaaaaa', '.aaaaa.', '..aaa..', '...a...'],
    crown: ['a..a..a', 'aa.a.aa', 'aaaaaaa', 'abaaaba', 'aaaaaaa', '.......'],
    skull: ['.aaaaa.', 'aaaaaaa', 'a.aaa.a', 'aaaaaaa', '.a.a.a.', '.......'],
    lantern: ['...a...', '..aaa..', '.abbba.', '.abbba.', '.abbba.', '..aaa..'],
    map: ['aaaaaaa', 'abaaaba', 'aaabaaa', 'abaaaba', 'aaaaaaa', '.......'],
    hammer: ['aaaaaaa', 'aaaaaaa', '...b...', '...b...', '...b...', '...b...'],
    shield: ['aaaaaaa', 'abaaaba', 'aaabaaa', '.aaaaa.', '..aaa..', '...a...'],
    star: ['...a...', '..aaa..', 'aaaaaaa', '.aaaaa.', '.aa.aa.', 'a.....a']
  };
  const TROPHY_COL = { fantasy: ['#ffd166', '#ffffff'], scifi: ['#7ae0ff', '#ffffff'], cyber: ['#ff3ad8', '#7affff'], steam: ['#c8963a', '#ffe0a0'] };
  const SHAPE_EMOJI = { cup: '🏆', gem: '💎', crown: '👑', skull: '💀', lantern: '🏮', map: '🗺', hammer: '🔨', shield: '🛡', star: '⭐' };
  function drawTrophy(c, t, x, y, k = 1) {
    const [a, b] = TROPHY_COL[t.style] || TROPHY_COL.fantasy;
    (TROPHY_ICON[t.shape] || TROPHY_ICON.cup).forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch === '.') return; c.fillStyle = ch === 'b' ? b : a; c.fillRect(x + rx * k, y + ry * k, k, k); }));
  }
  // On the case: two to a pane, the newest last. The case holds the first 24 to see; all of them are in the list.
  function caseTrophies(map, cx, cy) {
    let i = 0;
    for (let x = 0; x < map.w && i < trophies.length; x++) if (map.rows[1][x] === '7') for (const [ox, oy] of [[1, 2], [8, 9]]) { const t = trophies[i++]; if (!t) break; drawTrophy(ctx, t, x * TILE - cx + ox, TILE - cy + (oy === 2 ? 1 : 8) , 1); }
  }
  function caseHtml() {
    if (!trophies.length) return `<p><strong>The trophy case</strong></p><p class="muted">Empty, for now. Beat a keeper or a boss, light the lanterns, craft your way to level 10, or cross every region, and a trophy comes home here. Trophies stay here from every story you play.</p><button type="button" data-shop="leave">Leave</button>`;
    const stories = [...new Set(trophies.map((t) => t.story))];
    return `<p><strong>The trophy case</strong> <span class="muted">${trophies.length} ${trophies.length === 1 ? 'trophy' : 'trophies'} from ${stories.length} ${stories.length === 1 ? 'story' : 'stories'}</span></p>
      ${stories.map((st) => `<p><strong>${esc(st.replace(/^the /, 'The '))}</strong></p><ul class="jy-bag">${trophies.filter((t) => t.story === st).map((t) => `<li>${SHAPE_EMOJI[t.shape] || '🏆'} <strong>${esc(R.restyle(t.name, t.style))}</strong> <span class="muted">${esc(R.restyle(t.what, t.style))}${t.when ? ` · ${esc(t.when)}` : ''}</span></li>`).join('')}</ul>`).join('')}
      <button type="button" data-shop="leave">Leave</button>`;
  }
  // A mountain peak, drawn once per look: rock with a lit side, a dark side and snow on top, on nothing.
  function peakCanvas(v, snowy) {
    const style = j?.style || 'fantasy', key = `peak${v}${snowy ? 's' : ''}|${style}`;
    if (tileArt.has(key)) return tileArt.get(key);
    const c = doc.createElement('canvas'); c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    const tip = v ? 13 : 17, poly = (pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath(); g.fill(); };
    poly([[0, 32], [tip, 2], [32, 32]], '#6e7a86');
    poly([[tip, 2], [32, 32], [tip + 3, 32]], '#56606c'); // the shadow side
    poly([[0, 32], [tip, 2], [tip - 4, 32]], '#8a96a2'); // the lit side
    if (snowy) poly([[tip, 2], [tip - 5, 12], [tip - 2, 10], [tip, 13], [tip + 3, 10], [tip + 6, 12]], '#eef3f8'); // snow on the tall ones
    else poly([[tip, 2], [tip - 2, 6], [tip + 2, 6]], '#a8b2bc');
    g.fillStyle = '#4a545e'; for (const [x, y] of [[tip + 5, 20], [tip - 6, 24], [tip + 9, 27]]) g.fillRect(x, y, 3, 1);
    const st = R.STYLES?.[style];
    if (st?.dark) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(10,8,24,${st.dark})`; g.fillRect(0, 0, 32, 32); }
    if (st?.tint) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = st.tint[1]; g.fillStyle = st.tint[0]; g.fillRect(0, 0, 32, 32); g.globalAlpha = 1; }
    g.globalCompositeOperation = 'source-over';
    tileArt.set(key, c);
    return c;
  }
  function drawChest(x, y, open, good) {
    ctx.fillStyle = good ? '#4a4a54' : '#6b4423'; ctx.fillRect(x + 3, y + 7, 10, 7);
    ctx.fillStyle = open ? '#2a1d14' : good ? '#7a7a84' : '#8a5a2b'; ctx.fillRect(x + 3, y + 5, 10, open ? 3 : 4);
    ctx.fillStyle = good ? '#9ad8ff' : '#ffd166'; ctx.fillRect(x + 3, y + 9, 10, 1); if (!open) ctx.fillRect(x + 7, y + 8, 2, 3);
    ctx.fillStyle = '#4a2e18'; ctx.fillRect(x + 3, y + 13, 10, 1);
  }
  // Little pictures for coin, items and kit (the victory screen and the chest pop-up).
  const COIN_COLOURS = { copper: '#c87a3a', silver: '#d8dce4', gold: '#ffd166', platinum: '#b8f0ff' };
  function drawIcon(x, y, what) {
    if (what.coin) {
      const p = R.coinParts(what.coin); let i = 0;
      for (const k of R.COIN_ORDER) if (p[k]) { ctx.fillStyle = '#14110f'; ctx.fillRect(x + i * 7, y + 1, 7, 7); ctx.fillStyle = COIN_COLOURS[k]; ctx.fillRect(x + i * 7 + 1, y + 1, 5, 6); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + i * 7 + 2, y + 2, 1, 2); i++; }
      return i * 7;
    }
    if (what.item) {
      const it = R.ITEMS[what.item];
      const FOOD_COLOURS = { meat: '#a0522d', fish: '#8ab0c8', berries: '#8a3ab8', oats: '#e0c070', honey: '#ffb02a', greens: '#5ab04a', grubs: '#c8b080', cheese: '#ffe070', mushrooms: '#c8a088', apples: '#d0303a', dates: '#7a4a24' };
      if (it?.food) { ctx.fillStyle = '#14110f'; ctx.fillRect(x, y + 1, 8, 7); ctx.fillStyle = FOOD_COLOURS[what.item] || '#c8a066'; ctx.fillRect(x + 1, y + 2, 6, 5); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, y + 3, 1, 1); return 9; }
      if (it?.scroll) { ctx.fillStyle = '#efe6d2'; ctx.fillRect(x + 1, y, 6, 8); ctx.fillStyle = '#c8a66a'; ctx.fillRect(x, y, 8, 2); ctx.fillRect(x, y + 6, 8, 2); ctx.fillStyle = '#c070ff'; ctx.fillRect(x + 3, y + 3, 2, 2); }
      else { ctx.fillStyle = '#efe6d2'; ctx.fillRect(x + 3, y, 2, 2); ctx.fillStyle = it?.spirit ? '#7ae0ff' : it?.revive ? '#ffd166' : it?.fire ? '#ff8a3a' : it?.cleanse ? '#a0e070' : '#7dff9a'; ctx.fillRect(x + 1, y + 2, 6, 6); }
      return 9;
    }
    if (what.mat) { for (const [col, cells] of MARKS[what.mat] || []) { ctx.fillStyle = what.mat === 'crystal' ? styleSparks()[0] : col; for (const [a, b] of cells) ctx.fillRect(x + 1 + a, y + 2 + b, 1, 1); } return 8; }
    if (what.kit) {
      const kind = R.kitKind(what.kit), b = base(what.kit);
      if (kind === 'weapon') for (const [cx, cy, col] of S.weaponCells(S.styleWeapon ? S.styleWeapon(j?.style, b) : b, 45, { x: 1, y: 8 })) { ctx.fillStyle = col; ctx.fillRect(x + cx, y + cy - 4, 1, 1); }
      else if (kind === 'shield') for (const [cx, cy, col] of S.shieldCells(b, 'down', { x: 1, y: 1 }, j?.style)) { ctx.fillStyle = col; ctx.fillRect(x + cx, y + cy, 1, 1); }
      else { ctx.fillStyle = { robe: '#6a3a8a', leather: '#8a5a2b', chain: '#9aa3ad', plate: '#c8ccd4' }[b] || '#888'; ctx.fillRect(x + 1, y, 6, 8); ctx.fillRect(x, y + 1, 8, 3); }
      return 10;
    }
    return 0;
  }

  // ---------- The save and the start ----------
  // Making a land takes a moment (a few seconds for the biggest), so the last one made is kept, and the save is only
  // read for its summary until you Resume.
  let lastLand = null;
  // layout 1 is the land as 1.5.218 and before drew it, for a save from then (R.layoutOf).
  function makeLand(seed, size, style, layout) {
    const key = `${seed}|${size}|${layout}`;
    if (lastLand?.key === key) return lastLand.world;
    lastLand = null; // let the old one go before making the new one
    const w = Wm.makeWorld(seed, size, style, layout === 1 ? 1 : undefined);
    lastLand = { key, world: w };
    return w;
  }
  // On a phone the computer makes the land and the phone holds only the pieces near the party (Wm.pieceWorld).
  const pieced = () => Boolean(deps.phone && Wm.pieceWorld && deps.api);
  async function landFor(seed, size, style, layout = R.LAYOUT) {
    if (!pieced()) return makeLand(seed, size, style, layout);
    if (lastLand?.key === `${seed}|${size}|${layout}`) return lastLand.world;
    const r = await deps.api('/api/adventure/journey/land', { seed, size, layout });
    if (!r?.land) throw new Error('Your other Bob didn\'t send the land.');
    const w = Wm.pieceWorld({ ...r.land, layout });
    lastLand = { key: `${seed}|${size}|${layout}`, world: w };
    return w;
  }
  const asking = new Set();
  async function fetchPieces(w, x, y, wide) {
    if (!w?.pieced) return;
    const want = w.need(x, y, wide).filter(([cx, cy]) => !asking.has(`${cx},${cy}`));
    await Promise.all(want.map(async ([cx, cy]) => {
      const key = `${cx},${cy}`; asking.add(key);
      try { const r = await deps.api('/api/adventure/journey/piece', { seed: w.seed, size: w.size, layout: w.layout, cx, cy }); if (lastLand?.world === w) w.addPiece(r?.piece); } catch {} finally { asking.delete(key); }
    }));
  }
  // After each step: ask for the pieces coming into reach, and let go of the ones left behind.
  function landUpdate() {
    if (!world?.pieced || !j || lobby) return;
    const map = R.mapOf(world, j);
    const at = map.kind === 'world' ? { x: j.x, y: j.y } : world.sites.find((s2) => s2.id === (map.site || map.id)) || null;
    if (!at) return;
    const wide = map.kind === 'world' && j.alt === 'sky';
    world.drop(at.x, at.y, wide);
    fetchPieces(world, at.x, at.y, wide);
  }
  let savedRaw = null;
  async function loadSave() {
    try { const r = await deps.api('/api/adventure/journey'); savedRaw = r?.journey || null; saved = savedRaw ? R.cleanJourney(savedRaw) : null; } catch (e) { msg = e.message; saved = null; savedRaw = null; }
    drawPanel();
  }
  async function save(quiet) {
    if (!j || lobby) return;
    award();
    try { await deps.api('/api/adventure/journey', { journey: j }); saved = j; savedRaw = null; if (!quiet) say('Saved. The land will wait for you.'); }
    catch (e) { say(`I couldn't save: ${e.message}`); }
  }
  // Who comes along: up to four, from your character, Bob and saved characters, each with a race and class to pick.
  const pickedIds = new Set();
  const choices = {}; // id -> { race, cls }
  (deps.party || []).slice(0, 2).forEach((p) => pickedIds.add(p.id));
  let newSize = 'medium', newStyle = 'fantasy';
  function lobbyParty() { const list = (deps.party || []).filter((p) => pickedIds.has(p.id)).slice(0, 4); return (list.length ? list : (deps.party || []).slice(0, 1)).map((p) => ({ ...p, ...(choices[p.id] || {}) })); }
  function enterLobby() {
    world = Wm.innOnly();
    j = R.newJourney({ seed: '', party: lobbyParty() }, world);
    // Journey v1.3: you wake in the guest house behind the inn, by the trophy case.
    const guest = world.map('guest'); if (guest) Object.assign(j, { at: 'guest', x: guest.start.x, y: guest.start.y, facing: 'up' });
    lobby = true; trail = []; mode = 'walk';
    loadTrophies().then(() => { if (!closed) drawPanel(); });
    drawPanel();
  }
  // The big lands take a few seconds to make, so the screen says so first.
  const later = (fn) => { msg = 'Rolling the land…'; drawPanel(); sayLive(msg); setTimeout(async () => { try { await fn(); } catch (e) { msg = `I couldn't make the land: ${e.message}`; drawPanel(); } }, 40); };
  function rollNew() {
    if (deps.phone && Wm.SIZES[newSize]?.desktopOnly) newSize = 'campaign';
    later(async () => {
      if (closed) return;
      const seed = String(Date.now() % 1e9);
      const w = await landFor(seed, newSize, newStyle);
      if (w.pieced) { const home = w.sites.find((x) => x.id === w.home) || w.start; await fetchPieces(w, home.x, home.y); }
      world = w;
      j = R.newJourney({ seed, size: newSize, style: newStyle, party: lobbyParty() }, world);
      lobby = false; trail = []; shop = null; mode = 'walk'; msg = ''; tileArt.clear();
      drawPanel();
      const st = R.STYLES[newStyle];
      talkTo([newStyle !== 'fantasy' ? st.intro : '', `Bob: A new land's rolled out past my front door: ${Wm.SIZES[newSize].name.toLowerCase()}, by the look of it. ${R.questLine(world, j)}`, 'Arrow keys (or the pad) walk, Enter talks and opens things, F picks a fight, Esc opens the menu. The way out is the door at the bottom.']);
      save(true);
      focus();
    });
  }
  function resume() {
    if (!saved) return;
    later(async () => {
      if (closed) return;
      const src = savedRaw || saved;
      const w = await landFor(src.seed, src.size, src.style, R.layoutOf(src));
      if (w.pieced) { const home = w.sites.find((x) => x.id === (src.at === 'world' ? '' : src.at)) || w.sites.find((x) => x.id === w.home); const at = src.at === 'world' ? src : home || w.start; await fetchPieces(w, at.x, at.y, src.alt === 'sky'); }
      if (savedRaw) { j = R.cleanJourney(savedRaw, () => w); savedRaw = null; saved = j; } else j = saved;
      world = w;
      lobby = false; trail = []; shop = null; mode = 'walk'; msg = ''; tileArt.clear();
      drawPanel();
      talkTo([`Welcome back. ${R.mapOf(world, j).name}. ${R.fmtCoin(j.coin)} in the purse.`]);
      focus();
    });
  }
  const focus = () => { try { shell.focus({ preventScroll: true }); } catch {} };

  // ---------- Talking ----------
  // A long line is split at sentence ends into pages that fit the box (four lines of text each).
  function pages(line) {
    const out = []; let cur = '';
    for (const part of String(line).split(/(?<=[.;!?:]) +/)) { if (cur && (cur + ' ' + part).length > 150) { out.push(cur); cur = part; } else cur = cur ? `${cur} ${part}` : part; }
    if (cur) out.push(cur);
    return out;
  }
  function talkTo(lines, then, choices) { talk = { lines: lines.filter(Boolean).map(T).flatMap(pages), i: 0, shown: still() ? 1e9 : 0, then, choices: choices?.length ? choices : null, sel: 0 }; mode = mode === 'battle' ? 'battle' : 'talk'; showBox(); if (talk.choices) drawPanel(); }
  // Things to say (Journey v1.3): the last line of a talk can offer a short list of answers. Up and down (or the pad)
  // pick one, Enter (or A) says it; the buttons under the game do the same.
  const choosing = () => Boolean(talk?.choices && talk.i >= talk.lines.length - 1 && talk.shown >= (talk.lines[talk.i] || '').length);
  function pickChoice(i) { const c = talk?.choices?.[i]; if (!c) return; talk = null; box.hidden = true; shell.classList.remove('jy-talking'); if (mode === 'talk') mode = 'walk'; sfx('menu'); c.pick(); drawPanel(); }
  function say(text) { talkTo([text]); }
  function showBox() {
    sfx('talk');
    shell.classList.toggle('jy-talking', Boolean(talk)); // full screen: the menu moves up, out of the way of the words
    if (!talk) { box.hidden = true; return; }
    box.hidden = false;
    box.textContent = `${talk.lines[talk.i] || ''}${talk.choices && talk.i >= talk.lines.length - 1 ? ` Choices: ${talk.choices.map((c, i) => `${i + 1}. ${T(c.label)}`).join(' ')}` : ''}`;
  }
  function advanceTalk() {
    if (!talk) return;
    if (choosing()) { pickChoice(talk.sel); return; }
    const line = talk.lines[talk.i] || '';
    if (talk.shown < line.length) { talk.shown = line.length; return; }
    talk.i++; talk.shown = still() ? 1e9 : 0;
    if (talk.i >= talk.lines.length) { const then = talk.then; talk = null; box.hidden = true; shell.classList.remove('jy-talking'); if (mode === 'talk') mode = 'walk'; then?.(); drawPanel(); return; }
    showBox();
  }

  // ---------- Walking ----------
  function tryWalk(dir) {
    if (choosing() && (dir === 'up' || dir === 'down')) { talk.sel = (talk.sel + (dir === 'up' ? -1 : 1) + talk.choices.length) % talk.choices.length; sfx('step'); drawPanel(); return; }
    if (mode !== 'walk' || anim || !j) return;
    const from = { x: j.x, y: j.y, at: j.at };
    const r = R.walk(world, j, dir);
    armed = null; armedRelease = '';
    if (dir === 'left' || dir === 'right') sideFacing = dir;
    if (r.moved) {
      stepPhase = (stepPhase + 1) % 4;
      landUpdate();
      if (r.door) { trail = []; swoops.clear(); landFx.length = 0; heightFx = null; doorAt = now(); sfx('door'); announce(); arrive(r.door); drawPanel(); return; }
      sfx(r.splash ? 'splash' : 'step');
      trail.unshift({ x: from.x, y: from.y, facing: j.facing });
      trail = trail.slice(0, 16); // the party, then the pets and mounts that follow
      anim = { from, t0: now(), dur: still() ? 0 : j.riding && j.alt === 'ground' ? 110 : 150 };
      if (r.splash && !still()) landFx.push({ kind: 'splash', x: j.x, y: j.y, t0: now(), dur: 600 });
      if (r.splash === 'in') sayLive(`${R.leaderMount(j)?.name || 'Your mount'} carries you into the water.`);
      if (r.battle) sfx('encounter');
      if (r.battle) setTimeout(() => startFight(r.battle, { helpers: r.helpers, chase: r.chase }), still() ? 0 : 170);
      else if (!lobby && j.at === 'world') { const e = R.enterRegion(world, j); if (e) { announce(); save(true); const b = banter('region'); setTimeout(() => { if (mode === 'walk') talkTo([...e.lines, ...(b ? b.lines : [])], null, b?.choices); }, still() ? 0 : 170); } }
    } else if (world?.pieced && r.bump?.kind === 'tile' && r.bump.tile === undefined) { landUpdate(); sayLive('The land ahead is still on its way from your other Bob…'); }
    else if (r.bump?.kind === 'boss') bossTalk(r.bump.boss);
    else if (r.bump?.kind === 'closed') say('Bob: The door\'s stuck until you roll a New adventure. The buttons are along the bottom.');
    if (!r.moved && !r.bump?.boss) sfx('bump');
    if (r.moved) return;
    if (r.bump?.kind === 'tile' && ['S', 'A'].includes(r.bump.tile) && j.alt === 'ground') sayLive(r.bump.tile === 'S' ? 'A city in the clouds, far overhead. Only a flier can reach it: fly up (⤒ or E) on a pegasus, griffin or wyvern.' : 'A city under the waves. Only a swimmer can reach it: dive (⤓ or Q) on a dolphin.');
  }
  // ---------- Up, down and riding (Journey v1.2) ----------
  function height(r) {
    sayLive(r.text);
    if (!r.ok) { sfx('bump'); return; }
    sfx(r.anim);
    trail = [];
    heightFx = still() ? null : { kind: r.anim, t0: now(), dur: r.anim === 'surface' ? 700 : 1000 };
    if (r.anim === 'land' && !still()) setTimeout(() => landFx.push({ kind: 'dust', x: j.x, y: j.y, t0: now(), dur: 500 }), 800);
    if ((r.anim === 'dive' || r.anim === 'surface') && !still()) landFx.push({ kind: 'ripple', x: j.x, y: j.y, t0: now(), dur: 900 });
    R.seeSites(world, j); announce(); landUpdate(); save(true);
  }
  function rise() { if (mode !== 'walk' || anim || !j || lobby) return; height(R.rise(world, j)); }
  function sink() { if (mode !== 'walk' || anim || !j || lobby) return; height(R.sink(world, j)); }
  function rideToggle() { if (mode !== 'walk' || anim || !j || lobby) return; const r = R.ride(world, j); sayLive(r.text); sfx(r.ok ? 'ride' : 'bump'); if (r.ok) { trail = []; announce(); save(true); } }
  const BOB_LINES = { cave: 'Bob: Dark, damp, and smells of something. My three least favourite things, in order.', dungeon: 'Bob: Old stones and older bones. I would like it on record that I said this was a bad idea.', castle: 'Bob: A castle! Wipe your feet. And don\'t pick a fight with the knights. Please.', hermit: 'Bob: Someone actually lives out here? On purpose?', guest: 'Bob: The guest house. Your trophies live in the case by the wall. Do dust them now and then.' };
  function arrive(id) {
    const map = world.map(id);
    if (!map || j.talked.includes(id)) return;
    j.talked.push(id);
    const lines = [];
    if (map.kind !== 'world' && map.kind !== 'inn') lines.push(`${map.name}.`);
    if (j.party.some((m) => m.who === 'bob') && BOB_LINES[map.kind]) lines.push(BOB_LINES[map.kind]);
    if (R.isWanted(world, j)) lines.push('The guards here remember you. They\'re coming.');
    const story = R.townNarration(world, j, map.site || map.id);
    if (story.length) { lines.splice(lines.indexOf(`${map.name}.`), 1); lines.unshift(...story); }
    const b = story.length ? banter('town') : null;
    if (b) { talkTo([...lines, ...b.lines], null, b.choices); return; }
    if (lines.length) talkTo(lines);
  }
  function announce() {
    const map = R.mapOf(world, j);
    const zone = map.kind === 'world' ? `${lobby ? '' : ` · ${R.regionAt(world, j.x, j.y, j.style).name.replace(/^the /, '')}`} · danger ${R.zoneAt(world, j)}` : '';
    const alt = map.kind === 'world' && j.alt === 'sky' ? ' · in the sky' : map.kind === 'world' && j.alt === 'deep' ? ' · under the sea' : j.riding ? ' · riding' : '';
    root.querySelector('.jy-where').textContent = T(`${map.name}${zone}${alt}${R.isWanted?.(world, j) ? ' · ⚠ wanted' : ''}`);
  }
  function front() { const [dx, dy] = R.STEP[j.facing]; return R.thingAt(world, j, j.x + dx, j.y + dy); }
  function act() {
    if (mode === 'talk' || (mode === 'battle' && talk)) { advanceTalk(); return; }
    if (mode !== 'walk' || anim) return;
    if (j.alt !== 'ground' && R.mapOf(world, j).kind === 'world') { sayLive(j.alt === 'sky' ? 'Nobody to talk to up here but the wind. Land first (⤓ or Q).' : 'Bubbles. Come up first (⤒ or E) to talk.'); return; }
    const t = front();
    const [dx, dy] = R.STEP[j.facing];
    if (!t) {
      if (R.mapOf(world, j).rows[j.y + dy]?.[j.x + dx] === 'n') { shop = { kind: 'new' }; mode = 'shop'; drawPanel(); return; }
      if (R.mapOf(world, j).rows[j.y + dy]?.[j.x + dx] === '7') { shop = { kind: 'trophies' }; mode = 'shop'; sfx('chest'); drawPanel(); return; }
      // Facing water on the land, the button fishes.
      // Journey v1.3: a gathering spot in front of you or underfoot (herbs, timber, ore, crystals).
      const node = !lobby && R.gatherSpot ? R.gatherSpot(world, j) : null;
      if (node) {
        const g = R.gather(world, j);
        sfx(g.ok ? 'gather' : 'bump');
        if (g.ok) { lastLoot = Object.entries(g.got).filter(([, n]) => n > 0).map(([k]) => ({ mat: k })); lastLootAt = now(); const [nx, ny] = node.key.split(':').pop().split(',').map(Number); if (!still()) landFx.push({ kind: 'sparkle', x: nx, y: ny, t0: now(), dur: 900 }); if (g.up) setTimeout(() => sfx('level'), 500); save(true); }
        sayLive(g.text); drawPanel(); return;
      }
      const fish = j.alt === 'ground' && !lobby ? R.fishAt(world, j) : null;
      if (fish) { sfx('fish'); if (fish.ok) { setTimeout(() => sfx('coin'), 300); lastLoot = [{ item: 'fish' }]; lastLootAt = now(); save(true); } if (!still()) landFx.push({ kind: 'ripple', x: j.x + dx, y: j.y + dy, t0: now(), dur: 700 }); talkTo([fish.text]); return; }
      swing = { t0: now() }; sfx('swing'); return;
    }
    if (t.kind === 'chest') { const r = R.openChest(world, j, t.chest); lastLoot = r.got || null; lastLootAt = now(); sfx(r.got ? 'chest' : 'bump'); if (r.got && !still()) landFx.push({ kind: 'sparkle', x: t.chest.x, y: t.chest.y, t0: now(), dur: 1200 }); talkTo([r.text]); save(true); return; }
    if (t.kind === 'boss') { bossTalk(t.boss); return; }
    if (t.kind === 'person') personTalk(t.person);
  }
  let swing = null, lastLoot = null, lastLootAt = 0; // the leader's swing when there's nothing in front; the last chest's loot
  // F: pick a fight with whoever is in front. Asks once first, because it can't be taken back.
  function fight() {
    if (mode !== 'walk' || anim || !j) return;
    if (j.alt !== 'ground' && R.mapOf(world, j).kind === 'world') { swing = { t0: now() }; return; }
    const t = front();
    if (!t || t.kind !== 'person') { swing = { t0: now() }; return; }
    const p = t.person;
    if (R.PEACEFUL[p.role]) { say(R.PEACEFUL[p.role]); return; }
    // A wild animal: no guards care, so no asking first. (A lost pet goes home instead.)
    if (p.role === 'animal') { if (p.lost) { animalTalk(p); return; } armed = null; startFight([{ animal: p }], { zone: R.zoneAt(world, j) }); return; }
    if (armed !== p.id) { armed = p.id; say(`Pick a fight with ${p.title ? `${p.title} ${p.name}` : p.name}? ${['guard', 'knight', 'captain', 'ruler'].includes(p.role) ? 'The guard will come for you.' : 'The guards will remember.'} Press F (or ⚔) again to fight.`); return; }
    armed = null;
    const r = R.attackPerson(world, j, p);
    if (r.refused) { say(r.refused); return; }
    p.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[j.facing];
    startFight(r.battle, { site: r.site, zone: r.zone, people: true });
  }
  function animalTalk(p) {
    if (p.lost) { const r = R.findLost(j, p); talkTo([r || `${p.name} is already on the way home.`]); save(true); return; }
    p.facing = j.x < p.x ? 'left' : 'right';
    talkTo([R.animalLine(p), R.FOES[p.beast]?.tame ? 'Press F (or ⚔) to try your luck. Mid-fight, feed it the food it loves (Items), and it may come along.' : '']);
  }
  function personTalk(p) {
    if (p.role === 'animal') { animalTalk(p); return; }
    p.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[j.facing];
    const name = p.title ? `${p.title} ${p.name}` : p.name;
    const wanted = R.isWanted(world, j);
    const map = R.mapOf(world, j);
    const tier = map.kind;
    const open = (kind, line, mult = 1) => talkTo([`${name}: ${line}`], () => { shop = { kind, who: name, person: p, tier, mult }; mode = 'shop'; drawPanel(); });
    if (p.role === 'keeper') {
      if (lobby) { talkTo(['Bob: Welcome to my inn. Sit anywhere that isn\'t on fire.', 'Bob: When you\'re ready for the road, the buttons along the bottom roll a New adventure, or Resume the one you saved. The notice board by the door does the same.']); return; }
      open('inn', `Back again! A bed is ${R.fmtCoin(R.INN_PRICE)} for the whole party. ${R.questLine(world, j)}`); return;
    }
    if (p.role === 'cat') { talkTo(['Patches: Mrrp.']); return; }
    if (wanted && ['inn', 'shop', 'smith', 'priest', 'trainer', 'peddler'].includes(p.role)) { talkTo([`${name}: I don't serve your sort. Pay your fine to a guard first.`]); return; }
    if (wanted && ['guard', 'knight', 'captain'].includes(p.role)) { const key = map.kind === 'world' ? 'world' : map.site || map.id; open('fine', `You're wanted here. The fine is ${R.fmtCoin(R.fineFor(world, j, key))}. Pay up, or we do this the hard way.`); return; }
    const choices = R.talkChoices(world, j, p, map);
    if (choices) { converse(p, name, map, choices, p.role === 'ruler' ? R.questLine(world, j) : p.role === 'elder' ? 'Sit, sit. What can I do for you?' : null); return; }
    if (p.role === 'ruler') { talkTo([`${name}: ${R.questLine(world, j)}`]); return; }
    if (p.role === 'lost') { const r = R.findLost(j, p); talkTo([`${name}: ${R.ROLE_LINES.lost[p.line % R.ROLE_LINES.lost.length]}`, r || '']); save(true); return; }
    if (p.role === 'elder') { const q = R.questTalk(world, j, map.site || map.id); talkTo(q.lines.map((l) => `${name}: ${l}`)); if (q.done) { lastLoot = [{ coin: q.reward }]; lastLootAt = now(); sfx('quest'); } save(true); return; }
    if (p.role === 'sailor') { open('docks', `${R.ROLE_LINES.sailor[p.line % 3]} Where to?`); return; }
    if (p.role === 'trader') { open('trader', 'Fresh down from the clouds! Everything half price, today only. Every day is today only.', R.TRADER_PRICE); return; }
    if (p.role === 'bowyer') { open('bowyer', R.ROLE_LINES.bowyer[p.line % 2]); return; }
    if (p.role === 'tinker') { open('tinker', R.ROLE_LINES.tinker[p.line % 2]); return; }
    if (p.role === 'folk' && R.KIN_LINES[p.race]) { const kl = R.KIN_LINES[p.race]; talkTo([`${name}: ${kl[p.line % kl.length]}`]); return; }
    if (map.kind === 'world' && R.ROAD_LINES[p.role] && p.role !== 'peddler') { const rl = R.ROAD_LINES[p.role]; talkTo([`${name}: ${rl[p.line % rl.length]}`]); return; }
    if (p.role === 'inn') { open('inn', `A bed for the night is ${R.fmtCoin(innPrice(tier))} for the whole party. Everyone wakes up whole.`); return; }
    if (p.role === 'shop') { open('shop', 'Tonics, salts and things that go bang. Have a look.'); return; }
    if (p.role === 'peddler') { open('shop', 'Bits and bobs! Tonics and scrolls! Mostly tonics.'); return; }
    if (p.role === 'smith') { open('smith', 'Blades, bows and something to hide behind. I\'ll buy your old kit too.'); return; }
    if (p.role === 'priest') { open('priest', 'The temple heals for free. Waking salts and scrolls for an offering.'); return; }
    if (p.role === 'trainer') { open('trainer', 'Coin and sweat. That\'s all it takes. What do you want to work on?'); return; }
    if (p.role === 'hermit') { open('hermit', 'Visitors. Hm. Sit. Mind the mushrooms. I\'ll teach one of you one thing, once.'); return; }
    if (p.role === 'captain') { open('captain', 'I train the guard. If you want a bout, I\'ll spar with you. Nobody gets hurt for good.'); return; }
    const lines = R.ROLE_LINES[p.role];
    talkTo([`${name}: ${lines ? lines[p.line % lines.length] : R.FOLK_LINES[(p.line + j.beaten.length * 2) % R.FOLK_LINES.length]}`]);
  }
  // A talk with choices: they open with a line, you pick what to say, they answer, and you can ask something else.
  function converse(p, name, map, choices, opening) {
    if (p.role === 'ruler') { j.met = j.met || []; if (!j.met.includes('ruler')) j.met.push('ruler'); }
    const first = opening || (p.role === 'folk' && R.KIN_LINES[p.race] ? R.KIN_LINES[p.race][p.line % R.KIN_LINES[p.race].length] : ['Hello there.', 'Afternoon.', 'Travellers! Don\'t see many of you.'][p.line % 3]);
    const ask = (lines) => talkTo(lines, null, choices.map((c) => ({ label: c.label, pick: () => answer(c.id) })));
    const answer = (id) => {
      if (id === 'job') { const q = R.questTalk(world, j, map.site || map.id); if (q.done) { lastLoot = [{ coin: q.reward }]; lastLootAt = now(); sfx('quest'); } save(true); ask(q.lines.map((l) => `${name}: ${l}`)); return; }
      const r = R.sayTo(world, j, p, map, id, name); save(true);
      if (r.end) talkTo(r.lines); else ask(r.lines);
    };
    ask([`${name}: ${first}`]);
  }
  // Party talk (Journey v1.3): Bob says something at a moment in the story, and you pick what to say back.
  function banter(at) {
    const b = R.banterDue(world, j, at); if (!b) return null;
    return { lines: [`Bob: ${b.line}`], choices: b.choices.map(([label, reply]) => ({ label, pick: () => talkTo([reply]) })) };
  }
  const innPrice = (tier) => ({ hamlet: 20, village: 30, town: 50, castle: 80 }[tier] || R.INN_PRICE);
  const BOSS_LINES = {
    boss1: 'Mine! The shiny stone is MINE. You want it, you come and take it, tall thing.',
    boss2: 'Little flies, walking into my parlour. How kind of you to come to dinner.',
    boss3: 'Hm. Visitors. It has been a century. I was beginning to think I had been forgotten. Let me remind you.',
    bogwitch: 'Mud in your boots and mud in your lungs, dearie. Stay a while. Stay forever.',
    sandwyrm: 'The sand remembers everyone who crossed it. It has room for you.',
    frostfang: 'A low growl, and the air goes cold enough to crack.',
    mossback: 'Something under the moss opens one enormous eye.',
    rattlecrown: 'Kneel. Everyone kneels, sooner or later. The dead just get there first.',
    rustedknight: 'None. Shall. Pass. (It creaks terribly.)',
    drownedchoir: 'Many voices, singing from under the water, all of them for you.',
    gorrak: 'You! Fight me! Then I fight your friends! Then lunch!',
    redsilas: 'Your money or your life. Actually, I\'ll take both.',
    ratking: 'Skree. SKREE. This is MY cave.',
    bigslime: 'Blorp.',
    broodqueen: 'Clicking, from every direction at once.',
    oldtusk: 'A huge old boar-wolf snorts and paws the ground.',
    cavetroll: 'Something big turns round in the dark. It looks hungry.'
  };
  function bossTalk(bs) {
    const g = R.GUARDIANS[bs.id];
    talkTo([`${g.name}: ${BOSS_LINES[bs.id] || '...'}`], () => startFight([bs.id], { zone: R.zoneAt(world, j) }));
  }

  // ---------- Fights ----------
  function startFight(specs, opts = {}) {
    if (!specs?.length || mode === 'battle') return;
    anim = null; held = null;
    if (talk && mode === 'talk') { talk = null; box.hidden = true; }
    shop = null; menu = null;
    const b = R.startBattle(j, specs, { zone: opts.zone || R.zoneAt(world, j), helpers: opts.helpers, site: opts.site, spar: opts.spar });
    battle = { b, picks: {}, who: 0, stage: 'act', queue: [], busy: false, t0: now(), anim: null, fx: [], where: R.mapOf(world, j).kind, land: R.mapOf(world, j).rows[j.y]?.[j.x], alt: R.mapOf(world, j).kind === 'world' ? j.alt : 'ground' };
    mode = 'battle';
    const names = b.foes.map((f) => f.name);
    battle.intro = opts.spar ? `${names[0]} squares up for a friendly bout.` : opts.chase ? `${names.join(' and ')} catch${names.length > 1 ? '' : 'es'} up with you!` : `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]} ${b.guardian ? 'blocks the way!' : b.people ? (names.length > 1 ? 'square up!' : 'squares up!') : names.length > 1 ? 'jump out!' : 'jumps out!'}`;
    const helpers = b.allies.filter((a) => !a.pet), pets = b.allies.filter((a) => a.pet);
    if (helpers.length) battle.intro += ` ${helpers.map((a) => a.name).join(' and ')} from the patrol join${helpers.length > 1 ? '' : 's'} in!`;
    if (pets.length) battle.intro += ` ${pets.map((a) => a.name).join(' and ')} ${pets.length > 1 ? 'are' : 'is'} at your side.`;
    sayLive(battle.intro);
    nextPicker(0);
  }
  function nextPicker(from) {
    let i = from;
    while (i < j.party.length && (j.party[i].hp <= 0 || j.party[i].asleep)) i++;
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
      sfx('win');
      battle.ups = new Set((r.ups || []).map((u) => u.name));
      if (r.ups?.length) setTimeout(() => sfx('level'), 1300);
      else if (r.tamed?.length) setTimeout(() => sfx('tame'), 1300);
      const lines = [b.spar ? `A good bout! ${r.xp} experience.` : `You win! ${r.xp} experience${r.coin ? ` and ${R.fmtCoin(r.coin)}` : ''}.`];
      if (r.drops.length) lines.push(`Dropped kit: ${r.drops.map((k) => `${R.kitName(k)} (${R.kitWords(k)})`).join('; ')}. It's in Kit on the menu.`);
      if (r.items.length) lines.push(`Picked up: ${r.items.map((i) => R.ITEMS[i].name).join(', ')}.`);
      if (r.mats && Object.keys(r.mats).length) lines.push(`For crafting: ${R.matList(r.mats)}.`);
      if (r.left?.length) lines.push(`No room in the bag for: ${r.left.map((i) => R.ITEMS[i].name).join(', ')}. A pet or a mount carries more.`);
      for (const tm of r.tamed || []) lines.push(`${tm.pet} the ${tm.name.replace(/ [A-D]$/, '').toLowerCase()} comes along with ${tm.by}! Pets and mounts are in Pets on the menu.`);
      for (const fd of r.finds || []) lines.push(fd.coin ? `${fd.pet} noses out ${R.fmtCoin(fd.coin)}.` : `${fd.pet} digs up ${R.ITEMS[fd.item]?.name || 'something'}.`);
      for (const pu of r.petUps || []) lines.push(`${pu.name} is now level ${pu.level}!`);
      for (const u of r.ups) lines.push(`${u.name} is now level ${u.level}! +${u.hp} health, +${u.sp} spirit${u.stat ? `, +1 ${R.STAT_NAMES[u.stat]}` : ''}, and a skill point to spend in Skills.${u.newClass ? ` They can take a ${u.newClass} class now, in Skills.` : ''}`);
      const boss = b.foes.find((f) => f.guardian);
      if (boss) {
        reward(boss.id);
        if (R.LANTERN_KEEPERS.includes(boss.id)) lines.push(`${boss.name} drops a lantern stone. ${R.LANTERN_KEEPERS.filter((g) => j.beaten.includes(g)).length} of 3 back home.`);
        if (j.won && R.LANTERN_KEEPERS.includes(boss.id)) lines.push('That was the last keeper. Take the news to the castle, or to Bob!');
      }
      const felled = b.foes.filter((f) => f.person && !f.fled);
      if (felled.some((f) => f.role === 'ruler')) lines.push('The castle will not forget this.');
      lastLoot = [...(r.coin ? [{ coin: r.coin }] : []), ...Object.keys(r.mats || {}).map((k) => ({ mat: k })), ...r.drops.map((k) => ({ kit: k })), ...r.items.map((i) => ({ item: i })), ...(r.finds || []).map((fd) => (fd.coin ? { coin: fd.coin } : { item: fd.item }))];
      lastLootAt = now();
      drawPanel();
      talkTo(lines, endFight);
      save(true);
    } else if (b.over === 'lost') {
      battle.stage = 'done'; drawPanel(); sfx('lose');
      if (b.spar) talkTo(['The captain helps you up. "Not bad. Again sometime."'], endFight);
      else talkTo(['The party falls…', 'You wake up in Bob\'s Inn, aching and a bit lighter in the purse. Half your coin is gone; everything else is still yours.'], () => { R.wakeAtInn(world, j); trail = []; endFight(); save(true); });
    } else if (b.over === 'fled') { battle.stage = 'done'; sfx('flee'); talkTo(['You got away.'], endFight); }
    else nextPicker(0);
  }
  function endFight() { battle = null; mode = 'walk'; for (const m of j.party) m.asleep = 0; announce(); drawPanel(); focus(); }
  // A boss beaten: one line on your saved character's sheet, the way the Adventure table rewards them.
  async function reward(id) {
    const you = j.party.find((m) => m.who === 'you');
    const charId = (deps.party || []).find((p) => p.id === you?.id)?.charId;
    if (!charId) return;
    try { await deps.api('/api/adventure/journey/reward', { charId, guardian: id }); } catch {}
  }
  function sayLive(text) { const p = root.querySelector('.jy-msg'); if (p) p.textContent = T(text); }

  // One event, animated: the attacker steps in and swings, the target flashes, a number floats up.
  // What each moment in a fight sounds like: the move itself, then the hit (or the miss) when it lands.
  function moveSound(e) {
    if (e.act === 'flee' || e.act === 'run') return e.miss ? 'bump' : 'flee';
    if (e.act === 'tame') return 'tame';
    if (e.act === 'feed') return 'feed';
    if (e.act === 'breath') return 'breath';
    if (e.element) return e.element;
    if (e.act === 'item') return e.miss ? 'bump' : 'drink';
    if (e.heal || e.act === 'heal' || e.act === 'regen') return 'heal';
    if (e.act === 'steal') return 'coin';
    if (['fight', 'skill', 'hit', 'curse'].includes(e.act)) return shooterWeapon(e.who) ? 'shot' : 'swing';
    return '';
  }
  const landSound = (e) => (e.miss && e.target ? 'miss' : e.dmg ? (e.crit ? 'crit' : 'hit') : '');
  function animate(e) {
    sayLive(e.text);
    sfx(moveSound(e));
    if (still()) { if (e.dmg || e.heal || e.miss) pop(e); sfx(landSound(e)); return Promise.resolve(); }
    return new Promise((done) => {
      const isFight = ['fight', 'skill', 'hit', 'curse', 'breath', 'item', 'spell', 'feed', 'tame'].includes(e.act);
      const dur = isFight ? (e.element ? 700 : 620) : 520;
      battle.anim = { e, t0: now(), dur };
      setTimeout(() => { if (e.dmg || e.heal || (e.miss && e.target)) pop(e); sfx(landSound(e)); }, dur * 0.55);
      setTimeout(() => { if (battle) battle.anim = null; done(); }, dur + 120);
    });
  }
  function pop(e) {
    const spot = spotOf(e.target);
    if (!spot) return;
    fxNumbers.push({ x: spot.x + spot.w / 2, y: spot.y, text: e.miss ? 'miss' : String(e.dmg || e.heal), colour: e.heal ? '#7dff9a' : e.crit ? '#ffd166' : e.miss ? '#c8c8d0' : '#ffffff', t0: now() });
  }
  // Where everyone stands in a fight: foes on the left (facing right), the party on the right (facing left), helpers
  // from the patrol behind the party.
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
    // Helpers from the patrol and pets stand behind the party, in a column (two columns when there are many).
    (battle.b.allies || []).forEach((a, i) => out.set(a.key, { x: 214 - (i >= 3 ? 20 : 0), y: 30 + (i % 3) * 50, w: 24, h: 30, scale: a.pet ? 1.3 : 1.5, side: 'ally' }));
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
    if (mode === 'battle' && battle) drawBattle(t);
    else if (j) drawWorld(t);
    tune();
    if (held && mode === 'walk' && !anim && t - heldAt > 0) tryWalk(held);
    // The people go about their business even when you stand still (and the guards keep coming).
    if (j && mode === 'walk' && !anim && t - lastTick > 900) { lastTick = t; const caught = R.tick(world, j); if (caught) startFight(caught, { chase: true }); }
    if (!closed) frameReq = (globalThis.requestAnimationFrame || ((f) => setTimeout(f, 33)))(frame);
  }
  function camera(px, py, map) {
    const cx = map.w * TILE <= W ? (map.w * TILE - W) / 2 : Math.max(0, Math.min(map.w * TILE - W, px - W / 2 + TILE / 2));
    const cy = map.h * TILE <= H ? (map.h * TILE - H) / 2 : Math.max(0, Math.min(map.h * TILE - H, py - H / 2 + TILE / 2));
    return { cx: Math.round(cx), cy: Math.round(cy) };
  }
  // How high the party is, as the screen sees it: zoom (the land shrinks as you climb), lift (how far above the
  // ground the leader is drawn, in pixels), and how far under the sea it is (0 to 1).
  function heightNow(t) {
    const map = R.mapOf(world, j);
    const sky = map.kind === 'world' && j.alt === 'sky', deep = map.kind === 'world' && j.alt === 'deep';
    let zoom = sky ? 0.72 : 1, lift = sky ? 12 : 0, under = deep ? 1 : 0, hop = 0;
    if (heightFx) {
      const k = Math.min(1, (t - heightFx.t0) / heightFx.dur);
      if (k >= 1) heightFx = null;
      else if (heightFx.kind === 'takeoff') { const up = Math.max(0, (k - 0.3) / 0.7); zoom = 1 - 0.28 * up; lift = 12 * up; hop = k < 0.3 ? Math.abs(Math.sin(k * 40)) * 2 : 0; }
      else if (heightFx.kind === 'land') { const dn = Math.min(1, k / 0.8); zoom = 0.72 + 0.28 * dn; lift = 12 * (1 - dn); hop = k > 0.8 ? Math.sin((k - 0.8) / 0.2 * Math.PI) * 3 : 0; }
      else if (heightFx.kind === 'dive') { under = k; hop = k < 0.4 ? Math.sin(k / 0.4 * Math.PI) * 10 : 0; }
      else if (heightFx.kind === 'surface') { under = 1 - k; hop = Math.sin(k * Math.PI) * 16; }
    }
    return { zoom, lift, under, hop };
  }
  // A figure standing in water shows from the chest up, with a ripple round it.
  function wading(map, tx, ty) { return map.kind === 'world' && '~r'.includes(map.rows[ty]?.[tx] || '.'); }
  function inWater(x, y, w, draw, t, cut = 12) {
    ctx.save(); ctx.beginPath(); ctx.rect(x - 12, y - 60, w + 24, 60 + cut); ctx.clip(); draw(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const k = Math.floor(t / 250) % 2;
    ctx.fillRect(x + 1 + k, y + cut, w - 4, 1); ctx.fillRect(x - 1 - k, y + cut + 1, 3, 1); ctx.fillRect(x + w - 2 + k, y + cut + 1, 3, 1);
  }
  // Where a rider sits on a mount: the first row of the mount's picture that's broad enough to be a back.
  const backRow = new Map();
  function seatOf(ml, side) {
    const key = `${ml.id}|${side}`;
    if (!backRow.has(key)) { let r = 10; try { const f = S.figure(ml, { facing: side, compose: A.compose }); const i = f.rows.findIndex((row) => (row.match(/[^.]/g) || []).length >= 6); if (i >= 0) r = i; } catch {} backRow.set(key, r); }
    return backRow.get(key);
  }
  function drawWorld(t) {
    if (voyage) { drawVoyage(t); return; }
    const map = R.mapOf(world, j);
    let p = 1;
    if (anim) { p = anim.dur ? Math.min(1, (t - anim.t0) / anim.dur) : 1; if (p >= 1) anim = null; }
    const from = anim?.from || { x: j.x, y: j.y };
    const lx = (from.x + (j.x - from.x) * p) * TILE, ly = (from.y + (j.y - from.y) * p) * TILE;
    const { cx, cy } = camera(lx, ly, map);
    const hgt = heightNow(t);
    const z = hgt.zoom, deep = hgt.under > 0.5;
    ctx.fillStyle = map.kind === 'world' ? '#2a5aa8' : map.kind === 'aerie' ? '#7ec8ff' : map.kind === 'reef' ? '#1a4a98' : '#14110f'; ctx.fillRect(0, 0, W, H);
    // Higher up the land shrinks round the middle of the screen.
    ctx.save();
    if (z !== 1) { ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
    const tick2 = Math.floor(t / 500) % 2;
    const more = z < 1 ? Math.ceil((1 / z - 1) * VIEW_W / 2) + 1 : 0, moreY = z < 1 ? Math.ceil((1 / z - 1) * VIEW_H / 2) + 1 : 0;
    const x0 = Math.floor(cx / TILE) - more, y0 = Math.floor(cy / TILE) - moreY;
    const theme = THEMES[map.kind] ? map.kind : '';
    const peaks = [], props = [];
    for (let y = y0; y <= y0 + VIEW_H + moreY * 2; y++) for (let x = x0; x <= x0 + VIEW_W + more * 2; x++) {
      const ch = map.rows[y]?.[x]; if (!ch) continue;
      const fr = ANIMATED.has(ch) && !still() ? tick2 : 0;
      // Under the sea: the sea is the floor you swim over, and the land above is a blur.
      if (deep && map.kind === 'world') { ctx.drawImage('~r'.includes(ch) ? tileCanvas('$', 0) : ch === 'A' ? tileCanvas('A', fr) : blurredTile(ch, fr), x * TILE - cx, y * TILE - cy); continue; }
      if (STANDING.has(ch)) {
        // The ground it stands on, then the thing itself. A mountain is drawn big, after the ground (below).
        const gch = groundUnder(map, x, y);
        ctx.drawImage(tileCanvas(gch, ANIMATED.has(gch) && !still() ? tick2 : 0, theme), x * TILE - cx, y * TILE - cy);
        if (ch === '^') { peaks.push([x, y]); continue; }
        const sx = x * TILE - cx, sy = y * TILE - cy;
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(sx + 9, sy + 15, 7, 2, 0, 0, Math.PI * 2); ctx.fill(); // a shadow on the ground
        ctx.drawImage(tileCanvas(ch, fr, theme, true), sx, sy);
        if (HOUSES.has(ch)) props.push([ch, x, y, sx, sy]);
        continue;
      }
      ctx.drawImage(tileCanvas(ch, fr, theme, false, VARIED.has(ch) ? Math.floor(hash(x, y, 5) * 4) : 0), x * TILE - cx, y * TILE - cy);
      if (ch === '~' || ch === 'r') shore(map, x, y, x * TILE - cx, y * TILE - cy, still() ? 0 : t, ch === 'r');
    }
    // Mountains stand tall: each peak is drawn about twice a tile high, back to front, so a range looks like one.
    peaks.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of peaks) {
      const k = hash(x, y, 7), inner = groundUnder(map, x, y) === 'µ';
      if (inner && hash(y, x, 11) < 0.3) continue; // some gaps in a big range, so it reads as peaks and slopes
      const sz = 1.45 + k * 0.6, pk = peakCanvas(k < 0.5 ? 0 : 1, sz > 1.75); const w = TILE * sz, h = TILE * sz * 1.1; ctx.drawImage(pk, Math.round(x * TILE - cx + TILE / 2 - w / 2 + (hash(y, x, 3) - 0.5) * 4), Math.round(y * TILE - cy + TILE - h + 2), Math.round(w), Math.round(h)); }
    peaks.length = 0;
    // Chimney smoke, steam, blinking aerials and flickering neon over the houses; lamps and crates in town.
    for (const [ch, x, y, sx, sy] of props) houseLife(ch, x, y, sx, sy, t);
    if (map.kind !== 'world' && !deep) townProps(map, x0, y0, x0 + VIEW_W + more * 2, y0 + VIEW_H + moreY * 2, cx, cy, t);
    if (map.kind === 'guest') caseTrophies(map, cx, cy);
    if (!deep && !lobby && onGroundNow()) nodeMarks(map, x0, y0, x0 + VIEW_W + more * 2, y0 + VIEW_H + moreY * 2, cx, cy, t);
    for (const c of map.chests) drawChest(c.x * TILE - cx, c.y * TILE - cy, j.opened.includes(`${map.id}:${c.id}`), c.loot !== 'gift' && /deep|hoard/.test(c.loot));
    // Everyone who stands on the map, back to front so the lower ones overlap the higher.
    const figs = [];
    const flap = Math.floor(t / 150) % 2;
    if (map.boss && !j.beaten.includes(map.boss.id)) { const f = R.foe(map.boss.id); figs.push({ y: map.boss.y * TILE, draw: () => drawFig(foeLook(f), map.boss.x * TILE - cx - 4, map.boss.y * TILE - cy - 12, 1.5, { facing: 'down', step: Math.floor(t / 400) % 4 }) }); }
    const onGround = !(map.kind === 'world' && j.alt !== 'ground');
    const pad = more * TILE;
    if (!deep) for (const q of R.peopleOn(world, j, map)) {
      if (q.x * TILE - cx < -TILE - pad || q.x * TILE - cx > W + pad || q.y * TILE - cy < -TILE * 2 - pad || q.y * TILE - cy > H + TILE + pad) continue;
      let qx = q.x * TILE - cx, qy = q.y * TILE - cy - 4;
      const sc = q.role === 'cat' ? 0.6 : q.scale || 1;
      const dx = 8 * (1 - sc), dy = 20 * (1 - sc) + (q.beast ? 4 : 0);
      // An Aerie trader swoops down when you first see them, and lands with a puff of dust.
      let swoopK = 1;
      if (q.visiting && !still()) { const key = `${map.id}:${q.id}`; if (!swoops.has(key)) { swoops.set(key, t); sfx('swoop'); } swoopK = Math.min(1, (t - swoops.get(key)) / 1100); qx += (1 - swoopK) * 50; qy -= (1 - swoopK) ** 2 * 110; }
      const facing = q.role === 'animal' || q.beast ? (q.facing === 'right' ? 'right' : 'left') : q.facing || 'down';
      const step = q.route || q.role === 'animal' ? stepPhase : swoopK < 1 ? flap * 2 : 0;
      const water = wading(map, q.x, q.y);
      figs.push({ y: q.y * TILE, draw: () => {
        const go = () => { drawFig(personLook(q), qx + dx, qy + dy, sc, { facing, step }); if (q.wings) extras(qx + dx, qy + dy, sc, { wings: true, flap }); if (q.crown) extras(qx, qy, 1, { crown: true }); };
        if (water) inWater(qx, qy + 4, 16, go, t); else go();
        if (swoopK < 1 && swoopK > 0.85) puff(qx + 8, qy + 22, (swoopK - 0.85) / 0.15);
      } });
    }
    // The party walks in a line behind the leader; pets and mounts follow on behind. In the sky or under the sea the
    // others ride along with the leader and aren't drawn.
    const walking = Boolean(anim) || (held && mode === 'walk');
    const lead = j.party[0];
    const riding = map.kind === 'world' && j.riding && R.mountOf(lead || {});
    const followers = [];
    if (onGround) {
      for (const m of j.party.slice(1)) followers.push({ kind: 'member', m });
      for (const m of j.party) { const pet = R.petOf(m); if (pet && pet.hp > 0) followers.push({ kind: 'pet', pet }); }
      if (map.kind === 'world') for (const m of j.party) { const mt = R.mountOf(m); if (mt && !(m === lead && j.riding)) followers.push({ kind: 'mount', pet: mt }); }
    }
    const spotAt = (i) => { // i: 0 is the leader, 1.. the followers along the trail
      if (i === 0) return { x: lx, y: ly, facing: j.facing, tx: j.x, ty: j.y };
      const spot = trail[i - 1]; const prev = i === 1 ? { x: j.x, y: j.y } : trail[i - 2];
      if (!spot) return null;
      const fromSpot = trail[i] || spot;
      return { x: (anim ? fromSpot.x + (spot.x - fromSpot.x) * p : spot.x) * TILE, y: (anim ? fromSpot.y + (spot.y - fromSpot.y) * p : spot.y) * TILE, facing: prev ? (prev.x > spot.x ? 'right' : prev.x < spot.x ? 'left' : prev.y < spot.y ? 'up' : 'down') : spot.facing, tx: spot.x, ty: spot.y };
    };
    const step = walking ? (stepPhase + Math.floor(p * 2)) % 4 : 0;
    followers.forEach((fw, k) => {
      const at = spotAt(k + 1); if (!at) return;
      const fx = Math.round(at.x - cx), fy = Math.round(at.y - cy - 4);
      const water = wading(map, at.tx, at.ty);
      if (fw.kind === 'member') {
        const m = fw.m, pix = m.race === 'pixie' ? 0.85 : 1;
        const go = () => { drawFig(memberLook(m), fx + (pix < 1 ? 1 : 0), fy + (pix < 1 ? 3 : 0), pix, { facing: at.facing, step, weapon: base(m.weapon), shield: base(m.shield), weaponTint: kitTint(m.weapon), shieldTint: kitTint(m.shield) }); extras(fx, fy, pix, { ...memberExtras(m), flap }); };
        figs.push({ y: at.y + k * 0.01, draw: () => (water ? inWater(fx, fy, 16, go, t) : go()) });
      } else {
        const sc = fw.kind === 'pet' ? 0.75 : 1, side = at.facing === 'right' ? 'right' : at.facing === 'left' ? 'left' : sideFacing;
        const go = () => drawFig(petLook(fw.pet), fx + 8 * (1 - sc), fy + 4 + 16 * (1 - sc), sc, { facing: side, step });
        figs.push({ y: at.y + k * 0.01, draw: () => (water && !R.FOES[fw.pet.type]?.swim ? inWater(fx, fy + 4, 16, go, t) : go()) });
      }
    });
    // Little effects on the land: ripples, splashes, dust.
    for (let i = landFx.length - 1; i >= 0; i--) { const fx = landFx[i], k = (t - fx.t0) / fx.dur; if (k >= 1) { landFx.splice(i, 1); continue; } figs.push({ y: fx.y * TILE + 15, draw: () => drawLandFx(fx, fx.x * TILE - cx + 8, fx.y * TILE - cy + 14, k) }); }
    // The leader: walking, swinging, or riding (on the ground the leader is drawn with everyone else).
    const leaderDraw = (sx, sy, lift) => {
      let angle;
      if (swing) { const k = Math.floor((t - swing.t0) / 60); const arc = S.swingAngles(j.facing); if (k >= arc.length || still()) swing = null; else angle = arc[k]; }
      const pix = lead.race === 'pixie' ? 0.85 : 1;
      const fx = Math.round(sx), fy = Math.round(sy - 4 - lift - hgt.hop);
      const water = onGround && wading(map, j.x, j.y);
      if (riding) {
        const mt = R.mountOf(lead), ml = rideLook(mt), side = j.facing === 'left' || j.facing === 'right' ? j.facing : sideFacing;
        const flier = R.FOES[mt.type]?.fly, beat = flier && (j.alt === 'sky' || heightFx?.kind === 'takeoff') ? Math.floor(t / 90) % 4 : step;
        const my = fy + 4, back = seatOf(ml, side), ry = my + back - 11;
        const mount = () => drawFig(ml, fx, my, 1, { facing: side, step: beat });
        // The rider from the waist up, sitting into the mount's back (their legs are hidden by it).
        const rider = () => { ctx.save(); ctx.beginPath(); ctx.rect(fx - 12, ry - 30, 40, 30 + 13); ctx.clip(); drawFig(memberLook(lead), fx + (side === 'left' ? 1 : -1), ry, pix, { facing: j.facing === 'up' || j.facing === 'down' ? side : j.facing, step: 0, weapon: base(lead.weapon), shield: base(lead.shield), weaponTint: kitTint(lead.weapon), shieldTint: kitTint(lead.shield), angle }); ctx.restore(); extras(fx, ry, pix, { ...memberExtras(lead), flap }); };
        if (water && !deep) inWater(fx, my, 16, () => { mount(); rider(); }, t, back + 4); else { mount(); rider(); }
        return;
      }
      const go = () => { drawFig(memberLook(lead), fx + (pix < 1 ? 1 : 0), fy + (pix < 1 ? 3 : 0), pix, { facing: j.facing, step, weapon: base(lead.weapon), shield: base(lead.shield), weaponTint: kitTint(lead.weapon), shieldTint: kitTint(lead.shield), angle }); extras(fx, fy, pix, { ...memberExtras(lead), flap }); };
      if (water) inWater(fx, fy, 16, go, t); else go();
    };
    if (lead && onGround && !hgt.lift) figs.push({ y: ly - 0.001, draw: () => leaderDraw(lx - cx, ly - cy, 0) });
    figs.sort((a, b) => a.y - b.y).forEach((f) => f.draw());
    // A shadow on the ground far below a flier.
    if (lead && (hgt.lift || !onGround) && !deep) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(lx - cx + 8, ly - cy + 14, 6 * Math.max(0.5, z), 2, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // Up in the sky the clouds drift past; under the sea it goes blue, light falls in rays and bubbles rise.
    const sky = map.kind === 'world' && (j.alt === 'sky' || heightFx?.kind === 'takeoff' || heightFx?.kind === 'land');
    if (sky) { const a = 1 - (z - 0.72) / 0.28; drawClouds(t, cx, cy, Math.max(0, Math.min(1, j.alt === 'sky' ? Math.max(a, 0.6) : a))); }
    if (hgt.under > 0) drawUnder(t, hgt.under);
    // The leader up in the air (or under the sea) is drawn last, at the middle of the shrunken land.
    if (lead && (hgt.lift || !onGround)) leaderDraw(W / 2 + (lx - cx - W / 2) * z, H / 2 + (ly - cy - H / 2) * z, hgt.lift);
    if (lastLoot && t - lastLootAt < 2200) drawLoot(t);
    // Walking through a door: a quick fade in from black.
    if (!still() && t - portalAt < 900) { const q = (t - portalAt) / 900, cols = styleSparks(); ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - q)})`; ctx.fillRect(0, 0, W, H); for (let k = 0; k < 24; k++) { const a = k * 0.26 + q * 8, r = 40 * (1 - q) + 6; ctx.fillStyle = cols[k % cols.length]; ctx.fillRect(Math.round(W / 2 + Math.cos(a) * r), Math.round(H / 2 + Math.sin(a) * r * 0.7), 2, 2); } }
    if (!still() && t - doorAt < 280) { ctx.fillStyle = `rgba(0,0,0,${1 - (t - doorAt) / 280})`; ctx.fillRect(0, 0, W, H); }
    if (talk) drawTalk(t);
    root.querySelector('.jy-gold').textContent = lobby ? '' : `🪙 ${R.fmtCoin(j.coin, true)}`;
  }
  function puff(x, y, k) { ctx.fillStyle = `rgba(230,220,200,${0.7 * (1 - k)})`; for (let i = 0; i < 5; i++) { const a = i * 1.26, r = 3 + k * 8; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.4, 2 + k * 2, 0, Math.PI * 2); ctx.fill(); } }
  function drawLandFx(fx, x, y, k) {
    if (fx.kind === 'dust') { puff(x, y, k); return; }
    if (fx.kind === 'sparkle') { const cols = styleSparks(); for (let i = 0; i < 10; i++) { const a = i * 0.63 + k * 4, r = 4 + k * 14; ctx.fillStyle = cols[i % cols.length]; ctx.globalAlpha = 1 - k; ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 4 - k * 12 + Math.sin(a) * r * 0.6), i % 3 ? 1 : 2, i % 3 ? 1 : 2); } ctx.globalAlpha = 1; return; }
    if (fx.kind === 'ripple') { ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; ctx.lineWidth = 1; for (let i = 0; i < 2; i++) { const r = 3 + (k * 14 + i * 5); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); } return; }
    if (fx.kind === 'splash') { ctx.fillStyle = `rgba(200,240,255,${1 - k})`; for (let i = 0; i < 6; i++) { const dx = (i - 2.5) * 3, h = Math.sin(k * Math.PI) * (6 + (i % 3) * 3); ctx.fillRect(Math.round(x + dx * (1 + k)), Math.round(y - h), 2, 2); } }
  }
  function drawClouds(t, cx, cy, a) {
    if (a <= 0) return;
    ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`;
    for (let k = 0; k < 7; k++) {
      const sx = ((k * 97 - cx * 1.4 - t / (30 + k * 6)) % (W + 80) + W + 80) % (W + 80) - 40, sy = ((k * 61 - cy * 1.4) % (H + 40) + H + 40) % (H + 40) - 20;
      ctx.beginPath(); ctx.ellipse(sx, sy, 26 + k * 2, 8, 0, 0, Math.PI * 2); ctx.ellipse(sx + 14, sy - 5, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawUnder(t, k) {
    ctx.fillStyle = `rgba(20,70,160,${0.35 * k})`; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(200,240,255,${0.12 * k})`;
    for (let i = 0; i < 4; i++) { const x = ((i * 70 + t / 50) % (W + 60)) - 30; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 14, 0); ctx.lineTo(x - 20, H); ctx.lineTo(x - 34, H); ctx.fill(); }
    if (still()) return;
    ctx.fillStyle = `rgba(220,245,255,${0.7 * k})`;
    for (let i = 0; i < 10; i++) { const bx = (i * 29 + Math.sin(t / 400 + i) * 4) % W, by = H - ((t / 20 + i * 41) % H); ctx.fillRect(Math.round(bx), Math.round(by), 2, 2); }
  }
  // A boat trip: the boat (in the style's own look) crosses the sea, then you step off at the other dock.
  function drawVoyage(t) {
    const k = Math.min(1, (t - voyage.t0) / voyage.dur);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7ec8ff'); g.addColorStop(0.45, '#bfe6ff'); g.addColorStop(0.46, '#3a78c8'); g.addColorStop(1, '#1a4a98');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#9ac8f0';
    for (let i = 0; i < 14; i++) { const wx = ((i * 41 - t / 12) % (W + 20) + W + 20) % (W + 20) - 10, wy = H * 0.5 + (i * 23) % (H * 0.45); ctx.fillRect(Math.round(wx), Math.round(wy), 6, 1); }
    const flier = voyage.art === 'airship' || voyage.art === 'shuttle';
    const bx = -40 + (W + 40) * k, by = (flier ? H * 0.22 : H * 0.42) + Math.sin(t / 220) * 2;
    drawFig(beastLookFor(voyage.art), bx, by, 2.5, { facing: 'right', step: Math.floor(t / 200) % 4 });
    ctx.fillStyle = '#ffffff'; ctx.font = '8px monospace'; ctx.fillText(T(`To ${voyage.name}…`), 8, H - 10);
    if (k >= 1) { const to = voyage.to; voyage = null; trail = []; announce(); landUpdate(); arrive(to); drawPanel(); }
  }
  // The loot from a chest or a fight, drawn as a little row of pictures rising over the screen.
  function drawLoot(t) {
    const age = t - lastLootAt;
    const y = 22 - Math.min(10, age / 80);
    let x = 10;
    ctx.fillStyle = 'rgba(20,28,74,0.85)'; ctx.fillRect(6, y - 3, Math.min(W - 12, 14 + lastLoot.length * 22), 14);
    for (const g of lastLoot.slice(0, 9)) x += drawIcon(x, y, g) + 4;
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
    const lines = wrap(text, bw - 14);
    lines.slice(Math.max(0, lines.length - 4)).forEach((l, i) => ctx.fillText(l, bx + 7, by + 12 + i * 10));
    if (talk.shown >= line.length && Math.floor(t / 400) % 2 && !choosing()) { ctx.fillStyle = '#ffd166'; ctx.fillRect(bx + bw - 10, by + bh - 8, 4, 3); }
    if (choosing()) {
      const labels = talk.choices.map((c) => T(c.label)), cw = Math.min(bw - 20, Math.max(...labels.map((l) => ctx.measureText(l).width)) + 22), ch = labels.length * 11 + 6;
      const cx = bx + bw - cw, cy = by - ch - 2;
      const g2 = ctx.createLinearGradient(0, cy, 0, cy + ch); g2.addColorStop(0, '#2a3a8a'); g2.addColorStop(1, '#141c4a');
      ctx.fillStyle = g2; ctx.fillRect(cx, cy, cw, ch); ctx.strokeStyle = '#e8e8f0'; ctx.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2);
      if (!talk.offered) { talk.offered = true; setTimeout(drawPanel, 0); }
      labels.forEach((l, i) => { ctx.fillStyle = i === talk.sel ? '#ffd166' : '#ffffff'; ctx.fillText(`${i === talk.sel ? '▶' : ' '} ${l}`, cx + 6, cy + 12 + i * 11); });
    }
  }
  function wrap(text, width) {
    const words = String(text).split(' '), out = []; let line = '';
    for (const w of words) { const next = line ? `${line} ${w}` : w; if (ctx.measureText(next).width > width && line) { out.push(line); line = w; } else line = next; }
    if (line) out.push(line);
    return out;
  }
  const ELEMENT_COLOURS = { fire: '#ff8a3a', holy: '#ffe680', storm: '#7ae0ff', wild: '#7dff9a', mind: '#ff7ad8', frost: '#c8f0ff', shadow: '#8a5aff', star: '#fff6c0' };
  // The backdrop fits where the fight is: grass, forest, swamp, desert, snowy foothills, a cave, a dungeon, a town.
  function backdrop() {
    const where = battle.where, land = battle.land;
    if (battle.alt === 'sky' || where === 'aerie') { // among the clouds
      const g2 = ctx.createLinearGradient(0, 0, 0, H); g2.addColorStop(0, '#5aa8f0'); g2.addColorStop(1, '#d8f0ff'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; const t = now() / 60;
      for (let k = 0; k < 6; k++) { const cx = ((k * 53 + t * (k % 2 ? 1 : 0.6)) % (W + 60)) - 30, cy = 20 + (k * 37) % (H - 40); ctx.beginPath(); ctx.ellipse(cx, cy, 22, 7, 0, 0, Math.PI * 2); ctx.ellipse(cx + 12, cy - 4, 12, 6, 0, 0, Math.PI * 2); ctx.fill(); }
      if (where === 'aerie') { ctx.fillStyle = '#f4f8ff'; ctx.fillRect(0, H - 40, W, 40); }
      return;
    }
    if (battle.alt === 'deep' || where === 'reef' || (where === 'world' && '~r'.includes(land || '.'))) { // under (or in) the water
      const deep = battle.alt === 'deep' || where === 'reef';
      const g2 = ctx.createLinearGradient(0, 0, 0, H); g2.addColorStop(0, deep ? '#1a4a98' : '#7ec8ff'); g2.addColorStop(deep ? 1 : 0.25, deep ? '#0a1a40' : '#bfe6ff'); if (!deep) { g2.addColorStop(0.26, '#3a78c8'); g2.addColorStop(1, '#1a4a98'); } ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(200,240,255,0.5)'; const t = now() / 40;
      for (let k = 0; k < 12; k++) { const bx = (k * 23) % W, by = H - ((t + k * 31) % H); ctx.fillRect(bx, by, 2, 2); }
      if (deep) { ctx.fillStyle = '#c8b88a'; ctx.fillRect(0, H - 22, W, 22); ctx.fillStyle = '#ff7a8a'; for (let x = 6; x < W; x += 34) ctx.fillRect(x, H - 34, 3, 14); }
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const sky = (top, ground, ground2) => { g.addColorStop(0, top); g.addColorStop(0.24, '#bfe6ff'); g.addColorStop(0.25, ground); g.addColorStop(1, ground2); };
    if (where === 'cave' || where === 'dungeon') { g.addColorStop(0, '#14110f'); g.addColorStop(1, where === 'dungeon' ? '#34343c' : '#3a2c22'); }
    else if (where === 'inn' || where === 'hermit') { g.addColorStop(0, '#3a2410'); g.addColorStop(1, '#9a6a3a'); }
    else if (land === 'd' || land === ',') sky('#7ec8ff', '#e6c98a', '#d4b070');
    else if (land === 'w') sky('#8aa0a8', '#4a6a3a', '#3a5a2e');
    else if (land === 'F') sky('#6aa8d8', '#3d7f34', '#2f6a2a');
    else if (where !== 'world') sky('#7ec8ff', '#b8a07a', '#9c8662');
    else sky('#7ec8ff', '#5aa04a', '#3d7f34');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (where === 'cave' || where === 'dungeon') { ctx.fillStyle = where === 'dungeon' ? '#24242a' : '#2a2a30'; for (let x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 10, 18 + (x % 3) * 6); ctx.lineTo(x + 20, 0); ctx.fill(); } if (where === 'dungeon') { ctx.fillStyle = '#5a5a64'; for (let x = 10; x < W; x += 60) ctx.fillRect(x, 20, 8, 30); } }
    else if (where === 'inn' || where === 'hermit') { ctx.fillStyle = '#5a3a1e'; ctx.fillRect(0, 0, W, 40); ctx.fillStyle = '#3a2410'; for (let x = 0; x < W; x += 30) ctx.fillRect(x, 0, 3, 40); }
    else if (land === 'd' || land === ',') { ctx.fillStyle = '#d4b070'; for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.arc(x + 20, 46, 20, Math.PI, 0); ctx.fill(); } }
    else if (where !== 'world') { ctx.fillStyle = '#efe6d2'; for (let x = 0; x < W; x += 40) { ctx.fillRect(x + 6, 26, 24, 18); ctx.fillStyle = '#9a3a2a'; ctx.beginPath(); ctx.moveTo(x + 3, 28); ctx.lineTo(x + 18, 16); ctx.lineTo(x + 33, 28); ctx.fill(); ctx.fillStyle = '#efe6d2'; } }
    else { ctx.fillStyle = land === 'w' ? '#3a5a2e' : '#2f6a2a'; for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.arc(x + 12, 44, 12, Math.PI, 0); ctx.fill(); } }
  }
  // The weapon someone shoots with, if they shoot (a party member's bow, or a foe's).
  function shooterWeapon(id) {
    const m = j.party.find((x) => x.id === id); if (m) { const w = base(m.weapon); return SHOT.has(w) ? w : ''; }
    const f = battle?.b.foes.find((x) => x.key === id) || battle?.b.allies.find((x) => x.key === id);
    const w = f?.kit ? base(f.kit.weapon) : ''; return SHOT.has(w) ? w : '';
  }
  // Fire climbs, frost falls in shards, storm strikes as lightning, holy is a pillar of light, shadow swirls in,
  // wild bursts into leaves, mind ripples out in rings, and stars rain down.
  function drawSpell(e, from, to, p, t) {
    const tint = R.STYLES[j?.style]?.tint?.[0];
    const col = tint && S.tintHex ? S.tintHex(ELEMENT_COLOURS[e.element] || '#ffffff', tint, 0.35) : ELEMENT_COLOURS[e.element] || '#ffffff';
    ctx.fillStyle = col;
    if (from && to && p < 0.45 && from !== to && !['holy', 'star', 'storm'].includes(e.element)) { const k = (p - 0.1) / 0.35; const bx = from.x + (to.x + to.w / 2 - from.x) * k, by = from.y + 16 + (to.y + to.h / 2 - from.y - 16) * k; for (let n = 0; n < 4; n++) ctx.fillRect(Math.round(bx - n * 3 * Math.sign(to.x - from.x)), Math.round(by), 3 - (n > 1 ? 1 : 0), 3 - (n > 1 ? 1 : 0)); }
    if (!to || p < 0.4) return;
    const cx = to.x + to.w / 2, cy = to.y + to.h / 2, q = (p - 0.4) / 0.6;
    const R2 = Math.round;
    switch (e.element) {
      case 'fire': for (let k = 0; k < 14; k++) { const fx = cx - 12 + (k * 7) % 24, fy = to.y + to.h - ((q * 50 + k * 9) % to.h); ctx.fillStyle = k % 3 ? '#ff8a3a' : '#ffd166'; ctx.fillRect(R2(fx), R2(fy), 2, 3); } break;
      case 'frost': for (let k = 0; k < 10; k++) { const fx = to.x + (k * 11) % to.w, fy = to.y - 10 + ((q * 60 + k * 7) % (to.h + 10)); ctx.fillStyle = k % 2 ? '#c8f0ff' : '#ffffff'; ctx.fillRect(R2(fx), R2(fy), 1, 4); ctx.fillRect(R2(fx) - 1, R2(fy) + 1, 3, 1); } ctx.fillStyle = `rgba(200,240,255,${0.25 * (1 - q)})`; ctx.fillRect(to.x - 4, to.y - 4, to.w + 8, to.h + 8); break;
      case 'storm': { ctx.fillStyle = '#ffffff'; let x = cx, y = 0; while (y < cy) { const nx = x + ((Math.floor(t / 40) + y) % 3 - 1) * 4, ny = y + 6; ctx.fillRect(R2(Math.min(x, nx)), R2(y), Math.abs(nx - x) + 2, 7); x = nx; y = ny; } ctx.fillStyle = '#7ae0ff'; for (let k = 0; k < 8; k++) ctx.fillRect(R2(cx + Math.cos(k) * 10), R2(cy + Math.sin(k) * 10), 2, 2); if (q < 0.3) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 0, W, H); } break; }
      case 'holy': ctx.fillStyle = `rgba(255,230,128,${0.55 * (1 - q)})`; ctx.fillRect(R2(cx - 8), 0, 16, to.y + to.h); ctx.fillStyle = '#ffffff'; for (let k = 0; k < 6; k++) ctx.fillRect(R2(cx - 6 + k * 2), R2(to.y + to.h - q * 40 - k * 4), 1, 2); break;
      case 'shadow': for (let k = 0; k < 16; k++) { const a = k * 0.8 - t / 90, r = 20 * (1 - q) + 2; ctx.fillStyle = k % 2 ? '#8a5aff' : '#2a1a4a'; ctx.fillRect(R2(cx + Math.cos(a) * r), R2(cy + Math.sin(a) * r), 3, 3); } break;
      case 'wild': for (let k = 0; k < 12; k++) { const a = k * 0.52, r = 4 + q * 22; ctx.fillStyle = k % 2 ? '#7dff9a' : '#3d8a38'; ctx.fillRect(R2(cx + Math.cos(a) * r), R2(cy + Math.sin(a) * r + q * 6), 3, 2); } break;
      case 'mind': ctx.strokeStyle = col; ctx.lineWidth = 1; for (let k = 0; k < 3; k++) { const r = ((q * 30) + k * 8) % 26 + 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); } break;
      case 'star': for (let k = 0; k < 10; k++) ctx.fillRect(R2((k * 37 + p * 200) % 130), R2(((p - 0.3) * 260 + k * 17) % H), 2, 4); break;
      default: for (let k = 0; k < 16; k++) { const ang = k * 0.9 + t / 120, r = 4 + ((p - 0.4) * 40 + k * 3) % 18; ctx.fillRect(R2(cx + Math.cos(ang) * r), R2(cy + Math.sin(ang) * r), 2, 2); }
    }
  }
  function drawBattle(t) {
    const a0 = battle.anim, p0 = a0 ? Math.min(1, (t - a0.t0) / a0.dur) : 0;
    // A critical hit shakes the screen for a moment.
    const shake = !still() && a0?.e?.crit && p0 > 0.5 && p0 < 0.75 ? 3 : 0;
    ctx.save();
    if (shake) ctx.translate(Math.round(Math.sin(t / 17) * shake), Math.round(Math.cos(t / 23) * shake));
    backdrop();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const [id, s] of spots()) { const f = battle.b.foes.find((x) => x.key === id) || battle.b.allies.find((x) => x.key === id); if (f && f.hp <= 0) continue; ctx.beginPath(); ctx.ellipse(s.x + s.w / 2, s.y + s.h - 1, s.w / 2.6, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    const sp = spots();
    const a = battle.anim, e = a?.e;
    const p = a ? Math.min(1, (t - a.t0) / a.dur) : 0;
    const shove = (id) => { if (!e || e.who !== id || !['fight', 'skill', 'hit', 'curse', 'item', 'feed', 'tame'].includes(e.act) || (shooterWeapon(id) && !e.element && e.act !== 'item')) return 0; const k = p < 0.3 ? p / 0.3 : p > 0.75 ? (1 - p) / 0.25 : 1; return Math.round(k * 18); };
    const hitNow = (id) => e && e.target === id && !e.miss && e.dmg && p > 0.5 && p < 0.8 && Math.floor(t / 60) % 2 === 0;
    const swingAt = (id, facing) => { if (!e || e.who !== id || !['fight', 'skill', 'hit', 'curse'].includes(e.act) || (e.element && e.act === 'skill' && !e.weapon)) return undefined; const arc = S.swingAngles(facing); const k = Math.max(0, Math.min(arc.length - 1, Math.floor(((p - 0.25) / 0.5) * arc.length))); return p < 0.25 ? arc[0] : arc[k]; };
    const dodge = (id) => (e && e.target === id && e.miss && p > 0.4 && p < 0.8 ? -6 : 0);
    for (const f of battle.b.foes) {
      const s = sp.get(f.key);
      if (f.hp <= 0) { if (e && e.target === f.key && p < 1) drawFig(foeLook(f), s.x, s.y, s.scale, { facing: 'right', alpha: 1 - p, flash: true, weapon: f.kit ? base(f.kit.weapon) : undefined }); continue; }
      const asleep = f.asleep ? 0 : Math.floor(t / 300) % 4;
      drawFig(foeLook(f), s.x + shove(f.key) + dodge(f.key), s.y, s.scale, { facing: 'right', step: asleep, flash: hitNow(f.key), angle: swingAt(f.key, 'right'), weapon: f.kit ? base(f.kit.weapon) : undefined, shield: f.kit ? base(f.kit.shield) : undefined });
      if (f.person?.crown) extras(s.x, s.y, s.scale, { crown: true });
      if (f.asleep) { ctx.fillStyle = '#e8e8f0'; ctx.font = '8px monospace'; ctx.fillText('z', s.x + s.w - 4, s.y + 4 - (Math.floor(t / 300) % 3) * 2); }
      if (f.poison) { ctx.fillStyle = '#a0e070'; ctx.fillRect(s.x + 2, s.y + 2 + (Math.floor(t / 200) % 4), 2, 2); }
    }
    const win = battle.stage === 'done' && battle.b.over === 'won';
    j.party.forEach((m, i) => {
      const s = sp.get(m.id);
      const picking = battle.stage !== 'play' && battle.who === i && !win;
      const down = m.hp <= 0;
      const facing = win ? S.FACINGS[Math.floor((t - battle.victory) / 220) % 4] : 'left';
      const aim = !win && e?.who === m.id && shooterWeapon(m.id) && j.style !== 'fantasy' && ['fight', 'skill', 'hit'].includes(e.act) && !e.element ? -90 : undefined;
      const angle = win ? 0 : aim ?? swingAt(m.id, 'left') ?? (e?.who === m.id && e.element ? -150 : undefined);
      const fx = s.x - shove(m.id) - (picking ? 6 : 0) - dodge(m.id), fy = s.y + (down ? 10 : 0);
      drawFig(memberLook(m), fx, fy, 2, { facing: down ? 'up' : facing, step: win ? Math.floor(t / 120) % 4 : 0, weapon: base(m.weapon), shield: base(m.shield), weaponTint: kitTint(m.weapon), shieldTint: kitTint(m.shield), angle: down ? undefined : angle, flash: hitNow(m.id), alpha: down ? 0.45 : 1 });
      if (!down) extras(fx, fy, 2, { ...memberExtras(m), flap: Math.floor(t / 150) % 2 });
      if (picking && Math.floor(t / 300) % 2) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(s.x - 14, s.y + 16); ctx.lineTo(s.x - 9, s.y + 20); ctx.lineTo(s.x - 14, s.y + 24); ctx.fill(); }
    });
    for (const al of battle.b.allies || []) { const s = sp.get(al.key); if (al.hp <= 0) continue; drawFig(foeLook(al), s.x - shove(al.key), s.y, s.scale, { facing: 'left', weapon: base(al.kit.weapon), shield: base(al.kit.shield), angle: swingAt(al.key, 'left'), flash: hitNow(al.key) }); }
    // Arrows and bolts: a shot weapon looses one across the field instead of stepping in.
    if (e && ['fight', 'skill', 'hit'].includes(e.act) && !e.element && p > 0.15 && p < 0.55) {
      const from = sp.get(e.who), to = sp.get(e.target), w = shooterWeapon(e.who);
      if (from && to && w) {
        const k = (p - 0.15) / 0.4, dir = Math.sign(to.x - from.x) || 1;
        const ax = from.x + 8 + (to.x + to.w / 2 - from.x - 8) * k, ay = from.y + 22 + (to.y + to.h / 2 - from.y - 22) * k - Math.sin(k * Math.PI) * (w === 'longbow' ? 14 : 6);
        const len = w === 'crossbow' || w === 'handbow' ? 5 : 8;
        const shot = S.STYLE_SHOTS?.[j.style] || 'arrow';
        if (shot === 'laser' || shot === 'tracer') {
          // A laser bolt (sci-fi) or a bright tracer round (cyberpunk), flying straight.
          const lay = Math.round(from.y + 22 + (to.y + to.h / 2 - from.y - 22) * k);
          ctx.fillStyle = shot === 'laser' ? '#7ae0ff' : '#ff3ad8'; ctx.fillRect(Math.round(ax - (dir > 0 ? len + 2 : 0)), lay - 1, len + 2, 3);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(ax - (dir > 0 ? len : -1)), lay, len, 1);
          if (k < 0.2) { ctx.fillStyle = shot === 'laser' ? '#c8f0ff' : '#ffd166'; ctx.fillRect(from.x + (dir > 0 ? 14 : -4), from.y + 20, 4, 4); }
        } else if (shot === 'ball') {
          // A lead ball with a puff of smoke at the muzzle (steampunk).
          ctx.fillStyle = '#3a3a3a'; ctx.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 3, 3);
          if (k < 0.5) { ctx.fillStyle = `rgba(220,220,220,${0.7 * (1 - k * 2)})`; for (let n = 0; n < 4; n++) ctx.fillRect(from.x + (dir > 0 ? 12 : -6) + n * 2, from.y + 18 - n * 2 - k * 10, 4, 4); }
        } else {
        ctx.fillStyle = '#c8a66a'; ctx.fillRect(Math.round(ax - (dir > 0 ? len : 0)), Math.round(ay), len, 1);
        ctx.fillStyle = '#d8dee6'; ctx.fillRect(Math.round(dir > 0 ? ax : ax - 2), Math.round(ay) - 1, 2, 3);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(dir > 0 ? ax - len - 2 : ax + len), Math.round(ay) - 1, 2, 1);
        }
      }
    }
    // Spells: each element looks like itself. A bolt flies from the caster, then the element lands on the target.
    if (e && e.element && p > 0.1) drawSpell(e, sp.get(e.who), sp.get(e.target), p, t);
    // Feeding and taming: hearts.
    if (e && (e.act === 'tame' || (e.act === 'feed' && !e.miss)) && p > 0.3) { const s2 = sp.get(e.target); if (s2) { ctx.fillStyle = '#ff7ad8'; for (let k = 0; k < (e.act === 'tame' ? 6 : 3); k++) { const hx = s2.x + 6 + k * 7, hy = s2.y + 6 - (p - 0.3) * 40 - (k % 2) * 6; ctx.fillRect(hx, hy, 2, 2); ctx.fillRect(hx + 3, hy, 2, 2); ctx.fillRect(hx, hy + 1, 5, 2); ctx.fillRect(hx + 1, hy + 3, 3, 1); ctx.fillRect(hx + 2, hy + 4, 1, 1); } } }
    if (e && e.heal && p > 0.25) { const s = sp.get(e.target); if (s) { ctx.fillStyle = '#7dff9a'; for (let k = 0; k < 8; k++) ctx.fillRect(s.x + ((k * 7) % s.w), s.y + s.h - ((p - 0.25) * 60 + k * 5) % s.h, 2, 2); } }
    if (e && e.act === 'breath' && p > 0.2) { ctx.fillStyle = `rgba(255,120,40,${0.45 * (1 - p)})`; ctx.fillRect(120, 0, W - 120, H); }
    // Items: the bottle (or jar, or chip) flies to whoever it's for, then bursts into sparkles in the style's colours.
    if (e && e.act === 'item' && e.item && !e.miss) {
      const from = sp.get(e.who), to = sp.get(e.target) || from;
      if (from && p < 0.45) { const k = p / 0.45, ix = from.x + (to.x - from.x) * k, iy = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 24; drawIcon(Math.round(ix), Math.round(iy), { item: e.item }); }
      if (to && p >= 0.4) { const q = (p - 0.4) / 0.6, cols = styleSparks(); for (let k2 = 0; k2 < 14; k2++) { const ang = k2 * 0.45 + q * 3, r = 4 + q * 20; ctx.fillStyle = cols[k2 % cols.length]; ctx.globalAlpha = 1 - q; ctx.fillRect(Math.round(to.x + to.w / 2 + Math.cos(ang) * r), Math.round(to.y + to.h / 2 + Math.sin(ang) * r - q * 10), 2, 2); } ctx.globalAlpha = 1; }
    }
    // A critical hit: a bright star burst on the target.
    if (e && e.crit && e.dmg && p > 0.5 && p < 0.85) { const s3 = sp.get(e.target); if (s3) { const q = (p - 0.5) / 0.35, cx = s3.x + s3.w / 2, cy = s3.y + s3.h / 2; ctx.fillStyle = styleSparks()[0]; for (let k2 = 0; k2 < 8; k2++) { const ang = k2 * Math.PI / 4; for (let r = 4 + q * 6; r < 8 + q * 16; r += 2) ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 2, 2); } } }
    if (e && (e.coin || e.act === 'steal') && p > 0.3) { const s = sp.get(e.target) || sp.get(e.who); if (s) drawIcon(s.x + 6, s.y - 8 - p * 10, { coin: e.coin || 150 }); }
    // Floating numbers.
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    for (let i = fxNumbers.length - 1; i >= 0; i--) {
      const n = fxNumbers[i], age = t - n.t0;
      if (age > 900) { fxNumbers.splice(i, 1); continue; }
      ctx.fillStyle = '#000'; ctx.fillText(n.text, n.x + 1, n.y - age / 40 + 1); ctx.fillStyle = n.colour; ctx.fillText(n.text, n.x, n.y - age / 40);
    }
    ctx.textAlign = 'left';
    // Level up: a column of golden light over everyone who grew, and the words.
    if (win && battle.ups?.size && !still()) {
      const age = t - battle.victory;
      if (age > 1200 && age < 3600) for (const m of j.party) { if (!battle.ups.has(m.name)) continue; const s4 = sp.get(m.id); if (!s4) continue; const q = ((age - 1200) % 1200) / 1200, cols = styleSparks(); ctx.fillStyle = `rgba(255,230,128,${0.25 * (1 - q)})`; ctx.fillRect(s4.x, 0, s4.w, s4.y + s4.h); for (let k2 = 0; k2 < 8; k2++) { ctx.fillStyle = cols[k2 % cols.length]; ctx.fillRect(s4.x + (k2 * 5) % s4.w, Math.round(s4.y + s4.h - ((q * 60 + k2 * 9) % (s4.h + 20))), 2, 2); } ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#000'; ctx.fillText('LEVEL UP', s4.x - 7, s4.y - 3); ctx.fillStyle = '#ffd166'; ctx.fillText('LEVEL UP', s4.x - 8, s4.y - 4); }
    }
    ctx.restore();
    if (win && lastLoot) drawLoot(t);
    if (talk) drawTalk(t);
  }

  // ---------- The panel under the screen (real buttons, so keys and screen readers work) ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const bar = (n, max, cls) => `<progress class="jy-bar ${cls}" max="${Math.max(1, max)}" value="${Math.max(0, n)}" aria-label="${n} of ${max}"></progress>`; // no style attributes: the phone allows style-src 'self' only
  const classWords = (m) => `${R.RACES[m.race]?.name || ''} ${m.classes.map((c) => R.CLASSES[c].name).join(' / ')}`;
  const sheet = (m, on) => `<li class="${on ? 'on' : ''}${m.hp <= 0 ? ' down' : ''}"><strong>${esc(m.name)}</strong> <span class="muted">${esc(classWords(m))} · Lv ${m.level}${m.points ? ` · ${m.points} skill point${m.points > 1 ? 's' : ''}` : ''}</span>
    <span class="jy-hp">❤ ${m.hp}/${m.maxHp} ${bar(m.hp, m.maxHp, 'hp')}</span><span class="jy-sp">✦ ${m.sp}/${m.maxSp} ${bar(m.sp, m.maxSp, 'sp')}</span></li>`;
  function drawPanel() {
    root.querySelector('.jy-msg').textContent = T(msg);
    if (!j) { panel.innerHTML = ''; return; }
    announce();
    if (mode === 'battle' && battle) { panel.innerHTML = battleHtml(); restyleIn(panel); panel.querySelector('button:not([disabled])')?.focus({ preventScroll: true }); return; }
    if (mode === 'menu' && menu) { panel.innerHTML = menuHtml(); restyleIn(panel); mountDolls(); mountLand(); return; }
    if (mode === 'shop' && shop) { panel.innerHTML = shopHtml(); restyleIn(panel); panel.querySelector('button')?.focus({ preventScroll: true }); return; }
    const atInn = j.at === 'inn';
    const mt = R.mountOf(j.party[0] || {});
    if (choosing()) { panel.innerHTML = `<div class="row jy-choices" role="group" aria-label="What to say">${talk.choices.map((c, i) => `<button type="button" data-choice="${i}" class="${i === talk.sel ? 'yes' : ''}">${esc(c.label)}</button>`).join('')}</div>`; restyleIn(panel); return; }
    panel.innerHTML = `<ul class="jy-party">${j.party.map((m) => sheet(m)).join('')}</ul>${atInn ? innButtons() : ''}<p class="muted jy-keys">Arrow keys walk · Enter talks, opens chests, gathers and fishes · F picks a fight · Esc opens the menu · I the bag · J the story · C crafting · G the guide${mt ? ` · R rides ${esc(mt.name)}${R.canFly(j) ? ' · E flies up, Q lands' : R.canSwim(j) ? ' · Q dives, E comes up' : ''}` : ''}</p>`;
    restyleIn(panel);
  }
  // The words on the panel in the journey's style (only the words people read; never the buttons' own names).
  function restyleIn(el) {
    if (!j || !j.style || j.style === 'fantasy' || !doc.createTreeWalker) return;
    const w = doc.createTreeWalker(el, 4); let n;
    while ((n = w.nextNode())) { const v = R.restyle(n.nodeValue, j.style); if (v !== n.nodeValue) n.nodeValue = v; }
  }
  // Bob's Inn: the buttons along the bottom.
  function innButtons() {
    return `<div class="jy-inn-buttons row" role="group" aria-label="Bob's Inn">
      <button type="button" class="yes" data-jy="newadv">✨ New adventure</button>
      <button type="button" data-jy="resume-adv" ${saved ? '' : 'disabled title="Nothing saved yet"'}>▶ Resume adventure</button>
      ${saved ? `<span class="muted">${esc(saved.party.map((m) => `${m.name} Lv ${m.level}`).join(', '))} · ${esc(R.fmtCoin(saved.coin, true))} · ${R.LANTERN_KEEPERS.filter((g) => saved.beaten.includes(g)).length} of 3 lantern stones</span>` : ''}</div>`;
  }
  function newHtml() {
    const list = deps.party || [];
    const opt = (table, sel) => Object.entries(table).map(([id, v]) => `<option value="${id}" ${sel === id ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
    return `<div class="jy-title"><p><strong>✨ New adventure</strong> ${saved ? '<span class="muted">(this replaces the saved one)</span>' : ''}</p>
      <fieldset class="jy-who"><legend>Who comes along (up to four)</legend>${list.map((p) => { const c = choices[p.id] || {}; return `<div class="jy-who-pick"><label><input type="checkbox" data-pick="${esc(p.id)}" ${pickedIds.has(p.id) ? 'checked' : ''}> ${esc(p.name)}${p.who === 'you' ? ' (you)' : p.who === 'bob' ? ' (Bob)' : ''}</label>
        <label class="muted">Race <select data-race="${esc(p.id)}">${opt(R.RACES, c.race || 'human')}</select></label>
        <label class="muted">Class <select data-cls="${esc(p.id)}">${opt(R.CLASSES, c.cls || (R.CLASSES[p.cls] ? p.cls : 'fighter'))}</select></label></div>`; }).join('')}</fieldset>
      <label>Size of the land <select data-size>${Object.entries(Wm.SIZES).filter(([, s]) => !(s.desktopOnly && deps.phone)).map(([id, s]) => `<option value="${id}" ${newSize === id ? 'selected' : ''}>${s.name} (${s.w}×${s.h})</option>`).join('')}</select></label>
      <label>Style <select data-style>${R.STYLE_IDS.map((id) => `<option value="${id}" ${newStyle === id ? 'selected' : ''}>${esc(R.STYLES[id].name)}</option>`).join('')}</select></label>
      ${['epic', 'campaign', 'saga'].includes(newSize) ? `<p class="muted">A ${esc(Wm.SIZES[newSize].name)} land is for a long campaign: it takes a few seconds to roll${newSize === 'saga' ? ', and is for computers only' : ''}.</p>` : ''}
      <div class="row"><button type="button" class="yes" data-jy="roll">🎲 Roll the land</button><button type="button" data-shop="leave">Not yet</button></div>
      <p class="muted">Every land is new: continents and seas, rivers, mountains, forests, swamps and deserts; hamlets, villages, towns and a castle on the roads; orc villages, dwarf holds, elf tree villages and more; caves, dungeons, a hermit, cities in the clouds and under the sea; and animals to tame. The style changes the words, the colours and what you sail and fly in. No brain needed.</p></div>`;
  }
  function battleHtml() {
    const b = battle.b, m = j.party[battle.who];
    const foes = b.foes.filter((f) => f.hp > 0);
    const list = `<ul class="jy-party">${j.party.map((x, i) => sheet(x, battle.stage !== 'play' && i === battle.who)).join('')}</ul>
      <ul class="jy-foes" aria-label="Foes">${b.foes.map((f) => `<li class="${f.hp <= 0 ? 'down' : ''}">${esc(f.name)} ${f.hp > 0 ? bar(f.hp, f.maxHp, 'hp') : '<span class="muted">beaten</span>'}</li>`).join('')}${(b.allies || []).map((a) => `<li class="muted">${esc(a.name)} (helping) ${a.hp > 0 ? bar(a.hp, a.maxHp, 'hp') : 'down'}</li>`).join('')}</ul>`;
    if (battle.stage === 'play' || battle.stage === 'done' || !m) return `${list}<p class="muted">${battle.stage === 'play' ? 'The round plays out…' : ''}</p>`;
    const head = `<p class="jy-ask"><strong>${esc(m.name)}</strong>, what do you do?</p>`;
    const back = battle.who > 0 || battle.stage !== 'act' ? '<button type="button" data-b="back">↩ Back</button>' : '';
    const usable = R.knownSkills(m).filter((id) => R.ALL_SKILLS[id].kind !== 'passive');
    if (battle.stage === 'act') {
      const items = Object.entries(j.bag).filter(([, n]) => n > 0);
      return `${list}${head}<div class="jy-cmds" role="group" aria-label="Commands">
        <button type="button" data-b="fight">⚔ Fight</button>
        <button type="button" data-b="skills" ${usable.length ? '' : 'disabled'}>✨ Skills and spells</button>
        <button type="button" data-b="items" ${items.length ? '' : 'disabled'}>🎒 Items</button>
        <button type="button" data-b="defend">🛡 Defend</button>
        <button type="button" data-b="run" ${b.guardian ? 'disabled title="No running from a boss"' : ''}>🏃 Run</button>${back}</div>`;
    }
    if (battle.stage === 'skills') return `${list}${head}<div class="jy-cmds" role="group" aria-label="Skills and spells">${usable.map((id) => { const s = R.ALL_SKILLS[id], c = R.costOf(m, id); return `<button type="button" data-skill="${id}" ${m.sp < c ? 'disabled' : ''} title="${esc(s.what)}">${esc(s.name)} <span class="muted">✦${c}${s.kind === 'all' || s.all ? ' · all' : ''}</span></button>`; }).join('')}${back}</div>`;
    if (battle.stage === 'items') return `${list}${head}<div class="jy-cmds" role="group" aria-label="Items">${Object.entries(j.bag).filter(([, n]) => n > 0).map(([id, n]) => `<button type="button" data-item="${id}" title="${esc(R.ITEMS[id].what)}">${esc(R.ITEMS[id].name)} ×${n}</button>`).join('')}${back}</div>`;
    if (battle.stage === 'target') {
      const friendly = battle.act.side === 'party';
      const opts = friendly ? j.party.filter((x) => (battle.act.down ? x.hp <= 0 : x.hp > 0)) : foes;
      return `${list}${head}<p class="muted">${friendly ? 'On whom?' : 'At which one?'}</p><div class="jy-cmds" role="group" aria-label="Targets">${opts.map((x) => `<button type="button" data-target="${esc(x.key || x.id)}">${esc(x.name)}${x.key ? ` <span class="muted">${Math.round(R.hitChance(R.accuracyOf(m), x.eva) * 100)}% to hit</span>` : ''}</button>`).join('')}${back}</div>`;
    }
    return list;
  }
  function menuHtml() {
    const tabs = [['party', '👥 Party'], ['skills', '✨ Skills'], ['kit', '🧍 Kit'], ['bag', '🎒 Bag'], ['story', '📜 Story'], ['craft', '🛠 Craft'], ['pets', '🐾 Pets'], ['land', '🧭 The land'], ['guide', '📖 Guide'], ['save', '💾 Save']];
    const head = `<div class="jy-tabs" role="tablist">${tabs.map(([id, n]) => `<button type="button" role="tab" aria-selected="${menu.tab === id}" data-tab="${id}">${n}</button>`).join('')}<button type="button" data-jy="resume">▶ Back to the map</button></div>`;
    const who = `<div class="jy-who-row" role="radiogroup" aria-label="Who">${j.party.map((x, i) => `<button type="button" role="radio" aria-checked="${i === (menu.who || 0)}" data-who="${i}">${esc(x.name)}</button>`).join('')}</div>`;
    const m = j.party[menu.who || 0] || j.party[0];
    if (menu.tab === 'party') return `${head}<ul class="jy-party jy-sheets">${j.party.map((x) => `${sheet(x)}<li class="jy-stats muted">Might ${R.statOf(x, 'might')} · Wits ${R.statOf(x, 'wits')} · Charm ${R.statOf(x, 'charm')} · Luck ${R.statOf(x, 'luck')} · Attack ${R.attackOf(x)} · Guard ${R.guardOf(x)} · Magic ${R.magicOf(x)} · Accuracy ${R.accuracyOf(x)} · Evasion ${R.evasionOf(x)} · Next level in ${R.xpFor(x.level) - x.xp}</li>`).join('')}</ul><p>${R.LANTERN_KEEPERS.filter((g) => j.beaten.includes(g)).length} of 3 lantern stones · ${j.beaten.length} bosses beaten · ${esc(R.fmtCoin(j.coin))}</p>`;
    if (menu.tab === 'skills') {
      const branchHtml = (cls) => R.CLASSES[cls].branches.map((bn, bi) => `<div class="jy-branch"><strong>${esc(bn)}</strong><ol>${R.treeOf(cls).filter((s) => s.branch === bi).map((s) => { const why = R.canLearn(m, s.id), have = m.skills.includes(s.id); return `<li class="${have ? 'on' : ''}">${have ? '✓' : `<button type="button" class="mini" data-learn="${s.id}" ${why ? `disabled title="${esc(why)}"` : ''}>Learn</button>`} <strong>${esc(s.name)}</strong> <span class="muted">Lv ${s.level}${s.cost ? ` · ✦${s.cost}` : ''} · ${esc(s.what)}</span></li>`; }).join('')}</ol></div>`).join('');
      const combos = R.comboFor(m.classes), trio = R.trioFor(m.classes);
      const next = m.classes.length < 3 ? R.CLASS_IDS.filter((c) => !m.classes.includes(c)) : [];
      const addWhy = next.length ? R.canAddClass(m, next[0]) : '';
      const field = R.fieldSkills(m);
      return `${head}${who}<p><strong>${esc(m.name)}</strong> · ${esc(classWords(m))} · ${m.points} skill point${m.points === 1 ? '' : 's'} to spend${R.isPureCaster(m) ? ` · <span title="${esc(R.PURE_CASTER.what)}">🔮 Pure spellcaster</span>` : ''}</p>
        ${m.classes.map((c) => `<details open class="jy-tree"><summary>${esc(R.CLASSES[c].name)}</summary>${branchHtml(c)}</details>`).join('')}
        ${combos.length || trio ? `<p><strong>From your classes together:</strong> ${[...combos, ...(trio ? [trio] : [])].map((id) => `${esc(R.ALL_SKILLS[id].name)} <span class="muted">(${esc(R.ALL_SKILLS[id].what)})</span>`).join('; ')}</p>` : ''}
        ${next.length ? `<p>${addWhy ? `<span class="muted">${esc(addWhy)}</span>` : `Take a ${m.classes.length === 1 ? 'second' : 'third'} class: ${next.map((c) => `<button type="button" class="mini" data-addclass="${c}">${esc(R.CLASSES[c].name)}</button>`).join(' ')}`}</p>` : ''}
        ${field.length ? `<p><strong>Cast on the road:</strong> ${field.map((id) => `${esc(R.ALL_SKILLS[id].name)} (✦${R.costOf(m, id)}) ${j.party.map((x) => `<button type="button" class="mini" data-cast="${id}" data-on="${esc(x.id)}">on ${esc(x.name)}</button>`).join(' ')}`).join('<br>')}</p>` : ''}
        <p class="muted">Every combination of two classes teaches its own skill, and three classes add one more. Wizard, Cleric and Psionist together make the Mana Wellspring.</p>`;
    }
    if (menu.tab === 'kit') {
      const sel = (kind, word) => `<label>${word} <select data-kit="${kind}">${['none', ...j.owned[kind]].map((id) => `<option value="${esc(id)}" ${m[kind] === id ? 'selected' : ''}>${esc(id === 'none' ? (kind === 'weapon' ? 'Bare hands' : kind === 'armour' ? 'No armour' : 'No shield') : `${R.kitName(id)} (${R.kitWords(id)})`)}</option>`).join('')}</select></label>`;
      return `${head}<div class="jy-kit">${who}
        <div class="jy-doll"><canvas class="jy-turn" width="160" height="56" aria-label="${esc(m.name)} from the front, left, right and back"></canvas>
        <div class="jy-kit-picks">${sel('weapon', 'Weapon')}${sel('armour', 'Armour')}${sel('shield', 'Shield')}
        <p class="muted">Attack ${R.attackOf(m)} · Guard ${R.guardOf(m)} · Magic ${R.magicOf(m)} · Speed ${R.speedOf(m)} · Accuracy ${R.accuracyOf(m)} · Evasion ${R.evasionOf(m)}</p>
        ${m.who === 'you' && deps.editLook ? '<button type="button" class="mini" data-jy="look">🧍 Change the look</button>' : ''}</div></div>
        <p class="muted">Kit from chests, fights and the smith is shared by the party. Some kit gives bonuses and some has drawbacks: heavy armour soaks hits but makes you easier to hit.</p></div>`;
    }
    if (menu.tab === 'pets') return `${head}${who}${petsHtml(m)}`;
    if (menu.tab === 'land') return `${head}${landHtml()}`;
    if (menu.tab === 'craft') return `${head}${craftHtml()}`;
    if (menu.tab === 'guide') return `${head}${guideHtml()}`;
    if (menu.tab === 'story') return `${head}${storyHtml()}`;
    if (menu.tab === 'bag') {
      const items = Object.entries(j.bag).filter(([, n]) => n > 0);
      const bags = (j.bags || ['pouch']).map((b) => `<button type="button" class="mini" data-wearbag="${b}" aria-pressed="${j.bagGear === b}">${j.bagGear === b ? '✓ ' : ''}${esc(R.BAGS[b].name)} (+${R.BAGS[b].room})</button>`).join('');
      return `${head}<p class="muted">The bag holds ${R.bagCount(j)} of ${R.bagSize(j)} things. Each pet out with you carries 10 more and each mount 25.</p><p><strong>Wearing</strong> ${bags} <span class="muted">Bigger bags: shops, or make one at a Workbench.</span></p>${items.length ? `<ul class="jy-bag">${items.map(([id, n]) => { const it = R.ITEMS[id]; const usable = it.field; if (it.portal) return `<li><strong>${esc(it.name)}</strong> ×${n} <span class="muted">${esc(it.what)}</span> <button type="button" class="mini" data-portal="1">Read it: back to ${esc(world.map(j.home)?.name || 'Bob\'s Inn')}</button></li>`; return `<li><strong>${esc(it.name)}</strong> ×${n} <span class="muted">${esc(it.what)}</span> ${usable ? j.party.map((x) => `<button type="button" class="mini" data-use="${id}" data-on="${esc(x.id)}">${esc(x.name)}</button>`).join('') : '<span class="muted">(in a fight)</span>'}</li>`; }).join('')}</ul>` : '<p class="muted">The bag is empty.</p>'}`;
    }
    return `${head}<div class="row"><button type="button" class="yes" data-jy="save">💾 Save now</button><button type="button" data-jy="leave">🚪 Save and leave</button></div><p class="muted">The journey also saves itself after every chest and every fight. Seed ${esc(j.seed)} · ${esc(Wm.SIZES[j.size]?.name || '')}</p>`;
  }
  // ---------- Crafting (Journey v1.3) ----------
  // What you carry, your crafting level, and every recipe: the ones you can make now first. A workbench (a smith in
  // town, or Bob's Inn) makes the rest, and improves plain kit.
  function craftHtml() {
    const bench = R.atBench(world, j), lv = j.craft?.level || 1, xp = j.craft?.xp || 0;
    const next = lv < 10 ? R.craftXpFor(lv + 1) : 0;
    const mats = Object.entries(R.MATERIALS).map(([k, mt]) => `<li><strong>${esc(mt.name)}</strong> ${j.mats?.[k] || 0} <span class="muted">${esc(mt.what)}</span></li>`).join('');
    const row = (id) => {
      const r = R.RECIPES[id], needs = Object.entries(r.needs).map(([k, n]) => `${n} ${R.MATERIALS[k].name}`).join(', ');
      if (r.upgrade) {
        const kit = R.upgradable(j, id);
        const why = R.canCraft(j, id, { bench, kit: kit[0] });
        return `<li><strong>${esc(R.recipeName(id))}</strong> <span class="muted">(${esc(needs)}) · makes ${esc(R.AFFIXES[r.upgrade].name)} ${r.kinds.join(' or ')}</span> · ${kit.length && !why ? kit.map((k) => `<button type="button" class="mini" data-craft="${id}" data-kitkey="${esc(k)}">${esc(R.kitName(k))}</button>`).join('') : `<span class="muted">${esc(kit.length ? why : 'No plain kit for this.')}</span>`}</li>`;
      }
      const why = R.canCraft(j, id, { bench });
      return `<li><button type="button" data-craft="${id}" ${why ? 'disabled' : ''}>${esc(R.recipeName(id))}${r.n > 1 ? ` ×${r.n}` : ''}</button> <span class="muted">needs ${esc(needs)}${why ? ` · ${esc(why)}` : ''}</span></li>`;
    };
    const ids = Object.keys(R.RECIPES);
    const items = ids.filter((id) => !R.RECIPES[id].upgrade).sort((a, b) => Boolean(R.canCraft(j, a, { bench })) - Boolean(R.canCraft(j, b, { bench })) || R.RECIPES[a].level - R.RECIPES[b].level);
    return `<p><strong>Crafting level ${lv}</strong> ${next ? `<progress class="jy-bar sp" max="${next}" value="${xp}" aria-label="${xp} of ${next} to level ${lv + 1}"></progress>` : '(the best there is)'} · ${bench ? '🛠 At a Workbench: everything can be made here.' : '🎒 On the road: simple things only. The rest needs a Workbench: find one where a smith works, or at Bob\'s Inn.'}</p>
      <p class="muted">Press Enter by a glinting spot to gather: herbs underfoot in grass and woods, timber from trees, ore and crystals from rock faces and cave walls. Beaten animals leave pelts. Spots grow back after a while.</p>
      <ul class="jy-bag">${mats}</ul><p><strong>Make</strong></p><ul class="jy-bag">${items.map(row).join('')}</ul>
      <p><strong>Improve kit</strong> <span class="muted">(at a Workbench; plain kit only)</span></p><ul class="jy-bag">${ids.filter((id) => R.RECIPES[id].upgrade).map(row).join('')}</ul>`;
  }
  // ---------- The story so far (Journey v1.3): where next, regions crossed, local lore heard ----------
  function storyHtml() {
    if (lobby) return '<p class="muted">No story yet: roll a New adventure first.</p>';
    const steps = R.nextSteps(world, j), regs = R.regionsOf(world, j.style).list;
    const crossed = regs.filter((r) => (j.regions || []).includes(r.id));
    const lore = (j.lore || []).map((id) => world.sites.find((s) => s.id === id)).filter(Boolean);
    return `<p><strong>Where next</strong> <span class="muted">(${esc(R.narrator(j))})</span></p><ul class="jy-bag">${steps.map((x) => `<li>${esc(x.text)}</li>`).join('') || '<li class="muted">Nothing pressing. Explore!</li>'}</ul>
      <p><strong>Regions</strong> <span class="muted">${crossed.length} of ${regs.length} crossed</span></p><ul class="jy-bag">${crossed.map((r) => `<li>${esc(r.name.replace(/^the /, 'The '))}</li>`).join('') || '<li class="muted">None yet. Step out of the inn.</li>'}</ul>
      <p><strong>Local lore</strong> <span class="muted">(ask folk in hamlets and villages about their home)</span></p><ul class="jy-bag">${lore.map((s) => `<li><strong>${esc(s.name)}</strong> <span class="muted">${esc(R.localLore(world, s.id))}</span></li>`).join('') || '<li class="muted">None heard yet.</li>'}</ul>`;
  }
  // ---------- The guide (Journey v1.3): Bob walks you through every part of the menu ----------
  const GUIDE = [
    ['start', '🧭 Getting about', ['Bob: Arrow keys (or the pad) walk. Enter talks, opens chests, gathers and fishes. F picks a fight with whoever is in front of you. Esc opens this menu.', 'Bob: Walk into a door to go in. The edge of a town or a cave takes you back out to the land.', 'Bob: On a flying mount, E takes off and Q lands. On a dolphin, Q dives and E comes up. R gets on and off your mount.']],
    ['party', '👥 Party', ['Bob: Party shows everyone with you: health, spirit, level and the four stats. Might hits harder, Wits casts better, Charm talks and tames, Luck finds great hits.']],
    ['skills', '✨ Skills', ['Bob: Each level gives a skill point. Spend it in Skills, branch by branch. At level 5 and level 10 you can take a second and third class, and some pairs of classes give combo skills.']],
    ['kit', '🧍 Kit', ['Bob: Kit is what everyone wears. Pick a weapon, armour and a shield for each person. Heavy armour soaks hits but makes you easier to hit; the numbers show beside each piece.']],
    ['bag', '🎒 Bag', ['Bob: Bag holds potions, scrolls and food. Some work on the road (press a name to use it on them); the rest only in a fight. Pets and mounts carry extra.', 'Bob: A Scroll of return opens a door back to the last town you were in. Handy when the cave turns out bigger than you are.']],
    ['story', '📜 Story', ['Bob: Story is your journal. Where next says who to talk to or who to find, and where to look. It lists the regions you\'ve crossed and the local lore folk have told you.', 'Bob: Talking to people gives you things to say: pick one with up and down, and Enter. Ask "Where should we go?" any time you\'re lost.']],
    ['craft', '🛠 Craft', ['Bob: Craft is where you make things. Gather herbs, timber, ore and crystals from glinting spots on the land, and pelts from animals you beat.', 'Bob: Simple things you can make anywhere. A smith\'s Workbench in town, or mine in the back here, makes the rest and improves plain kit. Every make and every gather raises your crafting level.']],
    ['pets', '🐾 Pets', ['Bob: Pets shows the animals you\'ve tamed. One pet goes out with you and one mount carries you. Rename them, or let one go to make room.']],
    ['land', '🧭 The land', ['Bob: The land is the whole world from above, with every place you\'ve found marked on it.']],
    ['save', '💾 Save', ['Bob: Save keeps your journey. It saves itself after every chest and fight too, so don\'t lose sleep over it.']],
    ['screen', '⛶ The screen', ['Bob: ⛶ on the top bar plays full screen, with the menus on the game itself. Press it again, or Esc, to go back to a window. 🔊 or M turns the music and sound on and off.']]
  ];
  const guideHtml = () => `<p class="muted">Pick a topic and I'll walk you through it. Or start at the top and I'll show you round each tab.</p><div class="row"><button type="button" class="yes" data-guide="all">▶ Show me round</button></div><ul class="jy-bag">${GUIDE.map(([id, name, lines]) => `<li><button type="button" data-guide="${id}">${esc(name)}</button> <span class="muted">${esc(lines[0].replace(/^Bob: /, '').slice(0, 90))}…</span></li>`).join('')}</ul>`;
  // A topic: Bob says it, and the menu opens the tab he's talking about. "Show me round" goes through them all.
  function guideTopic(id, all) {
    const i = GUIDE.findIndex((g) => g[0] === id); if (i < 0) return;
    const [tab, , lines] = GUIDE[i];
    const nextId = all && GUIDE[i + 1] ? GUIDE[i + 1][0] : '';
    if (['party', 'skills', 'kit', 'bag', 'story', 'craft', 'pets', 'land', 'save'].includes(tab)) { menu = { tab, who: menu?.who || 0 }; mode = 'menu'; drawPanel(); }
    talkTo(lines, () => { if (nextId) guideTopic(nextId, true); else { menu = { tab: all || tab === 'start' || tab === 'screen' ? 'guide' : tab, who: 0 }; mode = 'menu'; drawPanel(); } });
  }
  // Pets and mounts (Journey v1.2): who's out with you, a name of your own, and letting one go (asks twice).
  function petsHtml(m) {
    const row = (kind, p) => {
      const f = R.FOES[p.type] || {}, st = R.petStats(p), on = (kind === 'mount' ? m.mount : m.pet) === p.id;
      const what = [f.name, `Lv ${p.level}`, kind === 'pet' ? `❤ ${p.hp}/${st.maxHp}` : f.fly ? 'flies' : f.swim ? 'swims' : 'rides', f.food && f.food !== 'any' ? `likes ${R.ITEMS[f.food]?.name.toLowerCase()}` : ''].filter(Boolean).join(' · ');
      return `<li class="${on ? 'on' : ''}"><strong>${esc(p.name)}</strong> <span class="muted">${esc(what)}</span>
        ${on ? `<span>✓ ${kind === 'mount' ? 'Riding this one' : 'Out with you'}</span>` : `<button type="button" class="mini" data-petset="${kind}:${esc(p.id)}">${kind === 'mount' ? 'Ride this one' : 'Take this one'}</button>`}
        <label class="muted">Name <input type="text" maxlength="24" data-petname="${kind}:${esc(p.id)}" value="${esc(p.name)}"></label><button type="button" class="mini" data-petrename="${kind}:${esc(p.id)}">Rename</button>
        <button type="button" class="mini" data-petgo="${kind}:${esc(p.id)}">${armedRelease === `${kind}:${p.id}` ? 'Press again to let go' : 'Let go'}</button></li>`;
    };
    const pets = m.pets || [], mounts = m.mounts || [];
    return `<p><strong>${esc(m.name)}</strong>'s pets (${pets.length} of ${R.PET_MAX}) and mounts (${mounts.length} of ${R.MOUNT_MAX}). The pet out with you fights beside you, finds things, and carries 10 more in the bag; a mount carries 25 more, and the leader's can be ridden (R).</p>
      ${pets.length ? `<ul class="jy-bag">${pets.map((p) => row('pet', p)).join('')}</ul>` : '<p class="muted">No pets yet. Mid-fight, feed a wild animal the food it loves (Items) and it may come along.</p>'}
      ${mounts.length ? `<ul class="jy-bag">${mounts.map((p) => row('mount', p)).join('')}</ul>` : '<p class="muted">No mounts yet. Horses love oats, camels love dates, and the fliers of the high country love apples and honey.</p>'}
      ${pets.length || mounts.length ? `<button type="button" class="mini" data-petset="pet:">Leave the pet at home</button>` : ''}`;
  }
  // The land, seen whole: the ground drawn once (a dot for every tile), the places you've found, and you.
  const landPictures = new WeakMap();
  const LAND_COLOURS = { '~': [42, 90, 168], r: [58, 120, 200], '.': [90, 160, 74], '"': [78, 148, 64], F: [47, 106, 42], T: [47, 106, 42], '^': [140, 140, 150], d: [230, 201, 138], w: [74, 106, 58], ',': [224, 207, 143], ':': [200, 166, 106], '=': [138, 90, 43] };
  function landPicture() {
    if (landPictures.has(world)) return landPictures.get(world);
    const m = world.picture ? { w: world.picture.rows[0]?.length || 1, h: world.picture.rows.length, rows: world.picture.rows } : world.map('world');
    const c = doc.createElement('canvas'); c.width = m.w; c.height = m.h;
    const g = c.getContext('2d'); const img = g.createImageData(m.w, m.h);
    for (let y = 0; y < m.h; y++) { const row = m.rows[y] || ''; for (let x = 0; x < m.w; x++) { const col = LAND_COLOURS[row[x]] || [90, 160, 74]; const i = (y * m.w + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255; } }
    g.putImageData(img, 0, 0);
    landPictures.set(world, c);
    return c;
  }
  function landHtml() {
    if (lobby) return '<p class="muted">No land yet: roll a New adventure first.</p>';
    const here = R.mapOf(world, j).kind === 'world' ? { x: j.x, y: j.y } : world.sites.find((s) => s.id === j.at) || world.sites.find((s) => s.id === world.home) || { x: 0, y: 0 };
    const seen = world.sites.filter((s) => j.seen.includes(s.id) || s.id === j.at).map((s) => ({ s, d: Math.abs(s.x - here.x) + Math.abs(s.y - here.y) })).sort((a, b) => (R.isStoryTown(b.s) - R.isStoryTown(a.s)) || a.d - b.d).slice(0, 40);
    return `<div class="jy-land-view"><canvas class="jy-land" width="480" height="360" role="img" aria-label="The whole land, with the places you've found and where you are"></canvas>
      <p class="muted">${esc(Wm.SIZES[j.size]?.name || '')} land, ${world.w}×${world.h}. You've found ${j.seen.length} of ${world.sites.length} places. The blinking dot is you.</p>
      <ul class="jy-bag">${seen.map(({ s, d }) => `<li>${R.isStoryTown(s) ? '🏰 ' : ''}<strong>${esc(s.name)}</strong> <span class="muted">${esc(Wm.SITE_WORDS?.[s.kind] || s.kind)} · ${esc(R.regionAt(world, s.x, s.y, j.style).name)}${s.dock ? ' · ⚓ dock' : ''}${s.alt === 'sky' ? ' · in the clouds' : s.alt === 'deep' ? ' · under the sea' : ''} · ${d ? `${d} steps ${R.direction(here, s)}` : 'here'}</span></li>`).join('')}</ul></div>`;
  }
  let landTimer = 0;
  function mountLand() {
    clearInterval(landTimer);
    const c = panel.querySelector('.jy-land'); if (!c || lobby) return;
    const g = c.getContext('2d');
    const m = world.map('world');
    const k = Math.min(c.width / m.w, c.height / m.h), ox = (c.width - m.w * k) / 2, oy = (c.height - m.h * k) / 2;
    const here = R.mapOf(world, j).kind === 'world' ? { x: j.x, y: j.y } : world.sites.find((s) => s.id === j.at) || { x: world.start.x, y: world.start.y };
    const SITE_COL = { castle: '#ffd166', town: '#efe6d2', village: '#efe6d2', hamlet: '#efe6d2', cave: '#14110f', dungeon: '#4a4a54', aerie: '#ffffff', reef: '#7ae0ff', bobsinn: '#ff8a3a' };
    let blink = 0;
    const paint = () => {
      g.fillStyle = '#14110f'; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = true; g.drawImage(landPicture(), ox, oy, m.w * k, m.h * k); g.imageSmoothingEnabled = false;
      for (const s of world.sites) if (j.seen.includes(s.id)) { g.fillStyle = SITE_COL[s.kind] || '#d8a0ff'; g.fillRect(Math.round(ox + s.x * k) - 2, Math.round(oy + s.y * k) - 2, 4, 4); }
      // Names (Journey v1.3): regions you've crossed, faint; story towns you've found, bright. Hamlets and villages
      // stay dots.
      // A name that would overlap one already written is left off (the list below has them all).
      g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.8)';
      const taken = [];
      const label = (t, x, y, font, col) => {
        g.font = font; const w = g.measureText(t).width; x = Math.min(Math.max(x, w / 2 + 3), c.width - w / 2 - 3); y = Math.max(y, 11); const box = [x - w / 2 - 2, y - 9, x + w / 2 + 2, y + 2];
        if (taken.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) return;
        taken.push(box); g.fillStyle = col; g.strokeText(t, x, y); g.fillText(t, x, y);
      };
      for (const s of world.sites) if (j.seen.includes(s.id) && (R.isStoryTown(s) || s.kind === 'bobsinn')) label(T(s.name), ox + s.x * k, oy + s.y * k - 4, 'bold 10px sans-serif', '#ffd166');
      for (const r of R.regionsOf(world, j.style).list) if ((j.regions || []).includes(r.id)) label(T(r.name.replace(/^the /, '')), ox + r.x * k, oy + r.y * k + 4, 'italic 10px serif', 'rgba(255,255,255,0.8)');
      g.textAlign = 'left';
      if (blink++ % 2 === 0 || still()) { g.fillStyle = '#ff3a3a'; g.fillRect(Math.round(ox + here.x * k) - 4, Math.round(oy + here.y * k) - 4, 9, 9); g.fillStyle = '#ffffff'; g.fillRect(Math.round(ox + here.x * k) - 1, Math.round(oy + here.y * k) - 1, 3, 3); }
    };
    paint();
    if (!still()) landTimer = setInterval(() => { if (!c.isConnected) { clearInterval(landTimer); return; } paint(); }, 450);
  }
  function shopHtml() {
    if (shop.kind === 'new') return newHtml();
    if (shop.kind === 'trophies') return caseHtml();
    if (shop.kind === 'docks') {
      const trips = R.docksFrom(world, j);
      return `<p><strong>${esc(shop.who)}</strong> · You have ${esc(R.fmtCoin(j.coin))}.</p>${trips.length ? `<ul class="jy-bag">${trips.map((d) => `<li><button type="button" data-sail="${esc(d.id)}" ${j.coin < d.fare ? 'disabled' : ''}>To ${esc(d.name)} by ${esc(R.BOATS[d.boat].name)} · ${esc(R.fmtCoin(d.fare, true))}</button> <span class="muted">${d.d} steps ${R.direction(world.sites.find((x) => x.id === j.at) || d, world.sites.find((x) => x.id === d.id) || d)}</span></li>`).join('')}</ul>` : '<p class="muted">"I only sail to docks you\'ve found on foot. Walk the coast; when you\'ve seen another dock, I can take you."</p>'}<button type="button" data-shop="leave">Leave</button>`;
    }
    const purse = `You have ${esc(R.fmtCoin(j.coin))}.`;
    const leave = '<button type="button" data-shop="leave">Leave</button>';
    if (shop.kind === 'inn') { const price = shop.person?.role === 'keeper' ? R.INN_PRICE : innPrice(shop.tier); return `<p><strong>${esc(shop.who)}</strong>: ${esc(R.fmtCoin(price))} for the night. ${purse}</p><div class="row"><button type="button" class="yes" data-shop="rest" ${j.coin < price ? 'disabled' : ''}>🛏 Rest</button>${leave}</div>`; }
    if (shop.kind === 'fine') { const key = shop.tier === 'world' ? 'world' : R.mapOf(world, j).site || j.at; return `<p><strong>${esc(shop.who)}</strong>: ${esc(R.fmtCoin(R.fineFor(world, j, key)))}. ${purse}</p><div class="row"><button type="button" class="yes" data-shop="fine">Pay the fine</button>${leave}</div>`; }
    if (shop.kind === 'captain') return `<p><strong>${esc(shop.who)}</strong>: A friendly bout, for practice. Half the usual experience, and nobody falls for good.</p><div class="row"><button type="button" class="yes" data-shop="spar">⚔ Spar</button>${leave}</div>`;
    if (shop.kind === 'trainer' || shop.kind === 'hermit') {
      const m = j.party[shop.who2 || 0] || j.party[0];
      const pick = `<div class="jy-who-row" role="radiogroup" aria-label="Who trains">${j.party.map((x, i) => `<button type="button" role="radio" aria-checked="${x === m}" data-trainee="${i}">${esc(x.name)}</button>`).join('')}</div>`;
      if (shop.kind === 'hermit') return `<p><strong>${esc(shop.who)}</strong>: One lesson, free, once. Pick what to learn.</p>${pick}<div class="row">${R.STATS.map((s) => `<button type="button" data-teach="${s}">${esc(R.STAT_NAMES[s])} (${m.stats[s]})</button>`).join('')}${leave}</div>`;
      return `<p><strong>${esc(shop.who)}</strong> · ${purse}</p>${pick}<ul class="jy-bag">${R.TRAINABLE.map((s) => { const why = R.canTrain(j, m, s); const v = s === 'acc' ? R.accuracyOf(m) : s === 'eva' ? R.evasionOf(m) : m.stats[s]; return `<li><button type="button" data-train="${s}" ${why ? `disabled title="${esc(why)}"` : ''}>${esc(R.STAT_NAMES[s])} ${v} · ${esc(R.fmtCoin(R.trainPrice(m, s), true))}</button></li>`; }).join('')}</ul><p class="muted">Practice works too: swinging trains Might, spells train Wits, healing trains Charm, and great hits and dodges train Luck.</p>${leave}`;
    }
    if (shop.kind === 'priest') {
      const list = R.wares('priest', shop.tier).map((id) => [id, R.ITEMS[id].name, R.priceOf(j, id), R.ITEMS[id].what, false]);
      return `<p><strong>${esc(shop.who)}</strong> · ${purse}</p><div class="row"><button type="button" class="yes" data-shop="heal">✨ Heal everyone (free)</button></div>${buyList(list)}${leave}`;
    }
    const role = shop.person?.role || shop.kind;
    const ids = R.wares(role === 'peddler' ? 'peddler' : shop.kind, shop.tier);
    const mult = shop.mult || 1;
    const list = ids.map((id) => (R.ITEMS[id] ? [id, R.ITEMS[id].name, R.priceOf(j, id, mult), R.ITEMS[id].what, false] : R.isBag(id) ? [id, R.BAGS[id.slice(4)].name, R.priceOf(j, id, mult), R.BAGS[id.slice(4)].what, (j.bags || []).includes(id.slice(4))] : [id, R.kitName(id), R.priceOf(j, id, mult), R.kitWords(id), j.owned[R.kitKind(id)].includes(id)]));
    const sellable = shop.kind === 'smith' ? ['weapon', 'armour', 'shield'].flatMap((k) => j.owned[k].filter((key) => !j.party.some((m) => m[k] === key))) : [];
    return `<p><strong>${esc(shop.who)}</strong> · ${purse}${mult < 1 ? ' <span class="muted">(everything half price)</span>' : ''}${shop.kind === 'smith' ? ' <button type="button" class="mini" data-bench="1">🛠 Use the Workbench</button>' : ''}</p>${buyList(list)}${sellable.length ? `<p><strong>Sell</strong> <span class="muted">(kit nobody is wearing, for a third of its price)</span></p><ul class="jy-bag">${sellable.map((key) => `<li><button type="button" data-sell="${esc(key)}">${esc(R.kitName(key))} · ${esc(R.fmtCoin(Math.round(R.kitPrice(key) / 3), true))}</button></li>`).join('')}</ul>` : ''}${leave}`;
  }
  const buyList = (list) => `<ul class="jy-bag">${list.map(([id, name, price, what, have]) => `<li><button type="button" data-buy="${esc(id)}" ${have || j.coin < price ? 'disabled' : ''}>${esc(name)} · ${esc(R.fmtCoin(price, true))}</button> <span class="muted">${have ? 'You have this.' : esc(what)}</span></li>`).join('')}</ul>`;
  let dollTimer = 0;
  function mountDolls() {
    clearInterval(dollTimer);
    const c = panel.querySelector('.jy-turn'); if (!c) return;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const m = j.party[menu.who || 0] || j.party[0];
    let k = 0;
    const paint = () => { g.clearRect(0, 0, c.width, c.height); S.FACINGS.forEach((f, i) => { try { S.drawFigure(g, 4 + i * 40, 2, 2.6, memberLook(m), { compose: A.compose, style: j?.style && j.style !== 'fantasy' ? j.style : undefined, facing: f, step: still() ? 0 : k % 4, weapon: base(m.weapon), shield: base(m.shield) }); } catch {} }); k++; };
    paint();
    if (!still()) dollTimer = setInterval(() => { if (!c.isConnected) { clearInterval(dollTimer); return; } paint(); }, 200);
  }

  // ---------- Input ----------
  root.addEventListener('click', async (e) => {
    const bt = e.target.closest('button'); if (!bt || bt.disabled) return;
    const d = bt.dataset;
    snd.wake?.();
    if (d.jy === 'sound') { toggleSound(); return; }
    if (!d.dir && !d.key && !d.buy && !d.sell && !d.sail) sfx('menu');
    if (d.jy === 'close') { await close(); return; }
    if (d.jy === 'newadv') { shop = { kind: 'new' }; mode = 'shop'; drawPanel(); return; }
    if (d.jy === 'roll') { rollNew(); return; }
    if (d.jy === 'resume-adv') { resume(); return; }
    if (d.jy === 'menu' || d.key === 'menu') { toggleMenu(); return; }
    if (d.jy === 'save') { if (lobby) say('Nothing to save yet: roll a New adventure first.'); else { await save(); sfx('save'); } return; }
    if (d.jy === 'resume') { menu = null; mode = 'walk'; drawPanel(); focus(); return; }
    if (d.jy === 'leave') { await save(true); await close(); return; }
    if (d.jy === 'look') { const m = j.party[menu.who || 0]; deps.editLook?.(m, (id) => { if (id) { m.look = id; lookCache.clear(); save(true); } drawPanel(); }); return; }
    if (d.key === 'act') { act(); return; }
    if (d.key === 'rise') { rise(); return; }
    if (d.key === 'sink') { sink(); return; }
    if (d.key === 'ride') { rideToggle(); return; }
    if (d.sail) { const st = world.sites.find((x) => x.id === d.sail); const r = R.sailTo(world, j, d.sail); if (!r.ok) { msg = r.text; drawPanel(); return; } shop = null; mode = 'walk'; msg = ''; trail = []; voyage = still() ? null : { art: R.boatArt(j.style, r.boat), name: st?.name || '', to: d.sail, t0: now(), dur: 1800 }; sfx('sail'); sayLive(r.text); if (!voyage) { announce(); arrive(d.sail); } drawPanel(); save(true); return; }
    if (d.petset !== undefined) { const [kind, id] = d.petset.split(':'); const m = j.party[menu?.who || 0]; R.setActive(j, m.id, kind, id || ''); armedRelease = ''; drawPanel(); save(true); return; }
    if (d.petrename) { const [kind, id] = d.petrename.split(':'); const m = j.party[menu?.who || 0]; const inp = panel.querySelector(`[data-petname="${globalThis.CSS?.escape ? globalThis.CSS.escape(d.petrename) : d.petrename}"]`); msg = R.renamePet(j, m.id, kind, id, inp?.value) ? 'Renamed.' : 'That name won\'t do.'; drawPanel(); save(true); return; }
    if (d.petgo) { if (armedRelease !== d.petgo) { armedRelease = d.petgo; msg = 'Press Let go again to release them into the wild. They won\'t come back.'; drawPanel(); return; } const [kind, id] = d.petgo.split(':'); const m = j.party[menu?.who || 0]; const r = R.release(j, m.id, kind, id); armedRelease = ''; msg = r.text; drawPanel(); if (r.ok) save(true); return; }
    if (d.key === 'fight') { fight(); return; }
    if (d.tab) { menu.tab = d.tab; drawPanel(); return; }
    if (d.who) { menu.who = Number(d.who); drawPanel(); return; }
    if (d.trainee) { shop.who2 = Number(d.trainee); drawPanel(); return; }
    if (d.learn) { const m = j.party[menu.who || 0]; msg = R.learn(m, d.learn) ? (sfx('level'), `${m.name} learns ${R.SKILLS[d.learn].name}.`) : R.canLearn(m, d.learn); drawPanel(); save(true); return; }
    if (d.addclass) { const m = j.party[menu.who || 0]; msg = R.addClass(m, d.addclass) ? `${m.name} is now also a ${R.CLASSES[d.addclass].name}.` : R.canAddClass(m, d.addclass); drawPanel(); save(true); return; }
    if (d.cast) { const r = R.castField(j, j.party[menu.who || 0].id, d.cast, d.on); msg = r.text; sfx(r.ok ? 'heal' : 'bump'); drawPanel(); if (r.ok) save(true); return; }
    if (d.use) { const it = R.ITEMS[d.use]; const r = it?.scroll ? R.castField(j, d.on, d.use, d.on) : R.drinkOn(j, d.use, d.on); msg = r.text; sfx(r.ok ? (it?.scroll ? 'spell' : 'drink') : 'bump'); drawPanel(); if (r.ok) save(true); return; }
    if (d.choice !== undefined && talk?.choices) { pickChoice(Number(d.choice)); focus(); return; }
    if (d.wearbag) { const r = R.wearBag(j, d.wearbag); msg = r.text; sfx(r.ok ? 'menu' : 'bump'); drawPanel(); if (r.ok) save(true); return; }
    if (d.craft) { const r = R.craft(j, d.craft, { bench: R.atBench(world, j), kit: d.kitkey }); msg = r.text; sfx(r.ok ? 'craft' : 'bump'); if (r.up) setTimeout(() => sfx('level'), 600); if (r.ok) lookCache.clear(); drawPanel(); if (r.ok) save(true); return; }
    if (d.guide) { guideTopic(d.guide === 'all' ? GUIDE[0][0] : d.guide, d.guide === 'all'); return; }
    if (d.portal) { const r = R.usePortal(world, j); msg = ''; if (!r.ok) { msg = r.text; sfx('bump'); drawPanel(); return; } menu = null; mode = 'walk'; trail = []; swoops.clear(); landFx.length = 0; heightFx = null; portalAt = now(); sfx('portal'); sayLive(r.text); announce(); drawPanel(); save(true); focus(); return; }
    if (d.bench) { shop = null; menu = { tab: 'craft', who: 0 }; mode = 'menu'; drawPanel(); return; }
    if (d.jy === 'full') { toggleFull(); return; }
    if (d.buy) { const okBuy = R.buy(j, d.buy, shop?.mult || 1); sfx(okBuy ? 'buy' : 'bump'); msg = okBuy ? `Bought: ${R.ITEMS[d.buy]?.name || (R.isBag(d.buy) ? `${R.BAGS[d.buy.slice(4)].name}. The bag holds ${R.bagSize(j)} now` : R.kitName(d.buy))}.` : R.ITEMS[d.buy] && !R.bagRoom(j) ? 'The bag is full. A pet or a mount carries more.' : "You can't afford that."; drawPanel(); save(true); return; }
    if (d.sell) { const got = R.sell(j, d.sell); sfx(got ? 'coin' : 'bump'); msg = got ? `Sold for ${R.fmtCoin(got)}.` : 'Someone is wearing that.'; drawPanel(); save(true); return; }
    if (d.train) { msg = R.train(j, j.party[shop.who2 || 0].id, d.train).text; drawPanel(); save(true); return; }
    if (d.teach) { const r = R.hermitTeach(j, j.party[shop.who2 || 0].id, d.teach); msg = r.text; drawPanel(); if (r.ok) save(true); return; }
    if (d.shop === 'rest') { const price = shop.person?.role === 'keeper' ? R.INN_PRICE : innPrice(shop.tier); if (R.rest(j, price)) { shop = null; mode = 'walk'; talkTo(['You sleep like a log. Everyone wakes up whole.']); save(true); } drawPanel(); return; }
    if (d.shop === 'heal') { for (const m of j.party) { if (m.hp > 0) m.hp = m.maxHp; m.asleep = 0; } msg = 'Warm light. Everyone standing is healed. (Fallen friends need Waking salts or Raise.)'; drawPanel(); save(true); return; }
    if (d.shop === 'fine') { const map = R.mapOf(world, j); const r = R.payFine(world, j, map.kind === 'world' ? 'world' : map.site || map.id); msg = r.text; if (r.ok) { shop = null; mode = 'walk'; } drawPanel(); save(true); return; }
    if (d.shop === 'spar') { const p = shop.person; shop = null; mode = 'walk'; startFight([{ person: p }], { spar: true, zone: 1 }); return; }
    if (d.shop === 'leave') { shop = null; mode = 'walk'; msg = ''; drawPanel(); focus(); return; }
    if (battle && battle.stage !== 'play') {
      if (d.b === 'back') { if (battle.stage !== 'act') { battle.stage = 'act'; drawPanel(); } else { let i = battle.who - 1; while (i >= 0 && j.party[i].hp <= 0) i--; if (i >= 0) { delete battle.picks[j.party[i].id]; battle.who = i; drawPanel(); } } return; }
      if (d.b === 'fight') { battle.act = { act: 'fight', side: 'foe' }; return pickTarget(); }
      if (d.b === 'defend') return choose({ act: 'defend' });
      if (d.b === 'run') return choose({ act: 'run' });
      if (d.b === 'skills') { battle.stage = 'skills'; drawPanel(); return; }
      if (d.b === 'items') { battle.stage = 'items'; drawPanel(); return; }
      if (d.skill) {
        const s = R.ALL_SKILLS[d.skill];
        const friendly = ['heal', 'revive', 'spirit'].includes(s.kind) && !s.self && !s.all;
        battle.act = { act: 'skill', skill: d.skill, side: friendly ? 'party' : 'foe', down: s.kind === 'revive' };
        if (s.kind === 'all' || s.all || s.self || ['healAll', 'reviveAll', 'buff', 'ward', 'haste', 'cover', 'cleanse', 'focus'].includes(s.kind)) return choose(battle.act);
        return pickTarget();
      }
      if (d.item) {
        const it = R.ITEMS[d.item];
        const spell = it.scroll ? R.ALL_SKILLS[it.spell] : null;
        if (spell && (spell.kind === 'all' || spell.all || ['healAll', 'ward', 'buff'].includes(spell.kind))) return choose({ act: 'item', item: d.item });
        battle.act = { act: 'item', item: d.item, side: it.fire || it.food || (spell && spell.kind === 'hit') ? 'foe' : 'party', down: Boolean(it.revive || spell?.kind === 'revive') };
        return pickTarget();
      }
      if (d.target) { choose({ ...battle.act, target: d.target }); return; }
    }
  });
  function pickTarget() {
    const foes = battle.b.foes.filter((f) => f.hp > 0);
    if (battle.act.side === 'foe' && foes.length === 1) { choose({ ...battle.act, target: foes[0].key }); return; }
    battle.stage = 'target'; drawPanel();
  }
  root.addEventListener('change', (e) => {
    const p = e.target.closest('[data-pick]');
    if (p) { if (p.checked) { if (pickedIds.size >= 4) { p.checked = false; msg = 'Four is a full party.'; drawPanel(); return; } pickedIds.add(p.dataset.pick); } else pickedIds.delete(p.dataset.pick); msg = ''; if (lobby) enterLobbyKeepPlace(); return; }
    const rc = e.target.closest('select[data-race], select[data-cls]');
    if (rc) { const id = rc.dataset.race || rc.dataset.cls; choices[id] = { ...(choices[id] || {}), [rc.dataset.race ? 'race' : 'cls']: rc.value }; if (lobby) enterLobbyKeepPlace(); return; }
    const sz = e.target.closest('select[data-size]');
    if (sz) { newSize = Wm.SIZES[sz.value] ? sz.value : 'medium'; drawPanel(); return; }
    const sty = e.target.closest('select[data-style]');
    if (sty) { newStyle = R.STYLE_IDS.includes(sty.value) ? sty.value : 'fantasy'; return; }
    const k = e.target.closest('select[data-kit]');
    if (k && j) { const m = j.party[menu.who || 0]; if (R.equip(j, m.id, k.dataset.kit, k.value)) { lookCache.clear(); drawPanel(); save(true); } }
  });
  // In the inn before an adventure, the party you pick walks round with you straight away.
  function enterLobbyKeepPlace() { const at = { at: j.at, x: j.x, y: j.y, facing: j.facing }; j = R.newJourney({ seed: '', party: lobbyParty() }, world); Object.assign(j, at); trail = []; }
  function toggleMenu() {
    if (!j || mode === 'battle') return;
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
    // Journey v1.3: I (or B) opens the bag, C opens crafting, G the guide. Press it again to close.
    const quick = { i: 'bag', b: 'bag', c: 'craft', g: 'guide', j: 'story' }[(e.key || '').toLowerCase()];
    if (quick && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && (mode === 'walk' || mode === 'menu')) {
      e.preventDefault(); e.stopPropagation();
      if (mode === 'menu' && menu?.tab === quick) toggleMenu(); else { menu = { tab: quick, who: menu?.who || 0 }; mode = 'menu'; drawPanel(); }
      return;
    }
    if (e.key === 'Escape' || e.key === 'x' || e.key === 'X') { if (typing && e.key !== 'Escape') return; if (mode === 'menu' || mode === 'shop' || mode === 'walk') { e.preventDefault(); e.stopPropagation(); toggleMenu(); } return; }
    if (typing) return;
    snd.wake?.();
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggleSound(); return; }
    if (mode === 'battle' && !talk) { // arrow keys move between the command buttons
      if (KEYS[e.key] && panel.contains(doc.activeElement)) { const bs = [...panel.querySelectorAll('.jy-cmds button:not([disabled])')]; const i = bs.indexOf(doc.activeElement); if (i >= 0) { e.preventDefault(); const n = bs[(i + (KEYS[e.key] === 'down' || KEYS[e.key] === 'right' ? 1 : bs.length - 1)) % bs.length]; n?.focus(); } }
      return;
    }
    if (choosing() && (KEYS[e.key] || /^[1-9]$/.test(e.key))) { e.preventDefault(); if (KEYS[e.key]) tryWalk(KEYS[e.key]); else pickChoice(Number(e.key) - 1); return; }
    if (KEYS[e.key] && (mode === 'walk')) { e.preventDefault(); if (held !== KEYS[e.key]) { held = KEYS[e.key]; heldAt = now(); tryWalk(held); } return; }
    if ((e.key === 'f' || e.key === 'F') && mode === 'walk') { e.preventDefault(); fight(); return; }
    if ((e.key === 'e' || e.key === 'E' || e.key === 'PageUp') && mode === 'walk') { e.preventDefault(); rise(); return; }
    if ((e.key === 'q' || e.key === 'Q' || e.key === 'PageDown') && mode === 'walk') { e.preventDefault(); sink(); return; }
    if ((e.key === 'r' || e.key === 'R') && mode === 'walk') { e.preventDefault(); rideToggle(); return; }
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'z' || e.key === 'Z') && (mode === 'walk' || mode === 'talk' || talk)) { if (e.target?.tagName === 'BUTTON' && !talk && mode !== 'walk') return; if (e.target?.tagName === 'BUTTON' && mode === 'walk' && panel.contains(e.target)) return; e.preventDefault(); act(); }
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
    if (j && !lobby) await save(true);
    stop();
    deps.onClose?.();
  }
  function stop() {
    closed = true; clearInterval(dollTimer); clearInterval(landTimer);
    try { snd.stop(); } catch {}
    doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('keyup', onKeyUp, true);
    if (frameReq) (globalThis.cancelAnimationFrame || clearTimeout)(frameReq);
  }

  soundButton();
  // Browsers keep sound silent until the first tap or key press; any press wakes it.
  root.addEventListener('pointerdown', () => snd.wake?.(), { capture: true });
  enterLobby();
  talkTo(['You wake in the guest house behind Bob\'s Inn. The trophy case along the wall keeps a trophy from every story you\'ve played.', 'Walk about with the arrow keys; the door at the bottom goes into the inn. When you\'re ready, the buttons along the bottom roll a New adventure or Resume your saved one.']);
  loadSave();
  frame();
  return { stop, save, get journey() { return j; }, get world() { return world; }, get mode() { return mode; }, get lobby() { return lobby; }, startFight, walk: tryWalk, act, fight, rollNew, resume, rise, sink, ride: rideToggle };
}

// ---------- Music and sound (Journey v1.3) ----------
// Everything you hear is made right here by the browser's own audio, from the little tunes written below: no sound
// files, nothing downloaded, our own music. Each place has its own tune (Bob's Inn, the open land, towns, the
// castle, caves and dungeons, the sky, under the sea, a boat trip) and fights have theirs; the style changes the
// instruments (sci-fi synths, cyberpunk bass, steampunk brass). 🔊/🔇 on the top bar turns it all off and on.
// A tune is lines of notes, one per eighth: a note name and octave (C4, F#3, Bb2), '-' to hold, '.' to rest. Drums
// are k (kick), s (snare) and h (hat).
const SONGS = {
  inn: { bpm: 104, lead: 'D5 - F#5 A5 - F#5 | G5 - E5 C#5 - A4 | B4 - D5 G5 - F#5 | E5 - - - . . | D5 - F#5 A5 - D6 | C#6 - B5 A5 - G5 | F#5 - E5 D5 - C#5 | D5 - - - . .', bass: 'D3 . A3 . A3 . | A2 . E3 . E3 . | G2 . D3 . D3 . | A2 . C#3 . E3 . | D3 . A3 . A3 . | A2 . E3 . E3 . | G2 . A2 . A2 . | D3 . A2 . D3 .', drums: 'k . h . h . | k . h . h . | k . h . h . | k . h . h . | k . h . h . | k . h . h . | k . h . h . | k . h . s .' },
  land: { bpm: 116, lead: 'C5 - G4 C5 E5 - D5 C5 | D5 - - B4 G4 - - . | A4 - C5 F5 A5 - G5 F5 | E5 - - - . . . . | F5 - E5 D5 C5 - D5 E5 | G5 - - E5 C5 - - . | A4 - B4 C5 D5 - E5 D5 | C5 - - - - . . .', bass: 'C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | F2 . C3 . F2 . C3 . | C3 . G3 . E3 . G3 . | F2 . C3 . F2 . C3 . | C3 . G3 . C3 . G3 . | F2 . G2 . F2 . G2 . | C3 . G2 . C3 . . .', drums: 'k . h . s . h . | k . h k s . h . | k . h . s . h . | k . h k s . h h | k . h . s . h . | k . h k s . h . | k . h . s . h . | k . s . s s s .' },
  town: { bpm: 108, lead: 'G4 B4 D5 - B4 D5 G5 - | F#5 E5 D5 - C5 B4 A4 - | B4 C5 D5 E5 D5 B4 G4 - | A4 - - - . . . . | G4 B4 D5 - E5 D5 B4 - | C5 E5 G5 - F#5 E5 D5 - | E5 D5 C5 B4 A4 F#4 D4 - | G4 - - - . . . .', bass: 'G2 . D3 . G2 . D3 . | D2 . A2 . D2 . A2 . | G2 . D3 . E2 . B2 . | D2 . A2 . D2 . F#2 . | G2 . D3 . G2 . D3 . | C3 . G3 . C3 . G3 . | A2 . E3 . D2 . A2 . | G2 . D3 . G2 . . .', drums: 'k . h h s . h . | k . h h s . h . | k . h h s . h . | k . h h s . s . | k . h h s . h . | k . h h s . h . | k . h h s . h . | k . k . s . . .' },
  castle: { bpm: 88, lead: 'F4 - A4 - C5 - - - | Bb4 - A4 - G4 - - - | A4 - C5 - F5 - E5 D5 | C5 - - - - - . . | D5 - C5 - Bb4 - A4 - | G4 - A4 Bb4 C5 - - - | Bb4 - A4 - G4 - E4 - | F4 - - - - - . .', bass: 'F2 - - - C3 - - - | Bb2 - - - C3 - - - | F2 - - - A2 - - - | C3 - - - C2 - - - | Bb2 - - - F2 - - - | C3 - - - A2 - - - | Bb2 - - - C3 - - - | F2 - - - F2 - - -', drums: 'k . . . s . . . | k . . . s . . . | k . . . s . . . | k . k . s . s s | k . . . s . . . | k . . . s . . . | k . . . s . . . | k . k . s s s s' },
  dungeon: { bpm: 72, lead: 'A4 - - C5 B4 - - . | E4 - - - . . . . | F4 - - E4 D4 - - . | E4 - - - . . G#4 . | A4 - - C5 D5 - - . | E5 - - D5 C5 - B4 . | A4 - G#4 - F4 - E4 . | A3 - - - . . . .', bass: 'A2 - - - - - - - | E2 - - - - - - - | D2 - - - - - - - | E2 - - - - - - - | A2 - - - - - - - | F2 - - - - - - - | D2 - - - E2 - - - | A2 - - - - - - -', drums: 'k . . . . . h . | k . . . . . . . | k . . . . . h . | k . . . s . . . | k . . . . . h . | k . . . . . . . | k . . . . . h . | k . . . s . . .' },
  sky: { bpm: 92, lead: 'E5 G#5 B5 E6 B5 G#5 | F#5 A5 C#6 F#6 C#6 A5 | B4 D#5 F#5 B5 F#5 D#5 | E5 - - - B4 - | C#5 E5 A5 C#6 A5 E5 | B4 E5 G#5 B5 G#5 E5 | F#5 A5 B5 D#6 B5 A5 | E5 - - - - .', bass: 'E3 - - B3 - - | F#3 - - C#4 - - | B2 - - F#3 - - | E3 - - B2 - - | A2 - - E3 - - | E3 - - B3 - - | B2 - - F#3 - - | E3 - - - - -', drums: '. . h . . h | . . h . . h | . . h . . h | . . h . . h | . . h . . h | . . h . . h | . . h . . h | . . h . s .' },
  deep: { bpm: 66, lead: 'D5 - - F5 - - A5 - | G5 - - - F5 - - - | E5 - - C5 - - E5 - | D5 - - - - - . . | A4 - - D5 - - F5 - | E5 - - - D5 - C5 - | Bb4 - - A4 - - G4 - | A4 - - - - - . .', bass: 'D3 - - - A2 - - - | Bb2 - - - F2 - - - | C3 - - - G2 - - - | D3 - - - A2 - - - | D3 - - - A2 - - - | C3 - - - G2 - - - | Bb2 - - - F2 - - - | A2 - - - - - - -', drums: '' },
  sea: { bpm: 126, lead: 'A4 - A4 C5 - E5 | D5 - C5 B4 - G4 | A4 - A4 C5 - E5 | G5 - - E5 - . | F5 - E5 D5 - C5 | B4 - C5 D5 - B4 | A4 - G#4 A4 - B4 | A4 - - - - .', bass: 'A2 . E3 A2 . E3 | G2 . D3 G2 . D3 | A2 . E3 A2 . E3 | C3 . G3 C3 . G3 | D3 . A3 D3 . A3 | G2 . D3 G2 . D3 | E2 . B2 E2 . B2 | A2 . E3 A2 . .', drums: 'k . h s . h | k . h s . h | k . h s . h | k . h s . h | k . h s . h | k . h s . h | k . h s . h | k . h s s s' },
  battle: { bpm: 152, lead: 'E5 E5 G5 E5 B5 - A5 G5 | F#5 - D5 - E5 - - - | E5 E5 G5 E5 C6 - B5 A5 | B5 - - - F#5 - - - | G5 - F#5 - E5 - D5 - | C5 - D5 - E5 - G5 - | F#5 - G5 - A5 - B5 - | E5 - - - E4 - - -', bass: 'E2 E3 E2 E3 E2 E3 E2 E3 | D2 D3 D2 D3 E2 E3 E2 E3 | C2 C3 C2 C3 C2 C3 C2 C3 | B1 B2 B1 B2 B1 B2 D#2 D#3 | E2 E3 E2 E3 B1 B2 B1 B2 | C2 C3 C2 C3 G1 G2 G1 G2 | A1 A2 A1 A2 B1 B2 B1 B2 | E2 E3 E2 E3 E2 . . .', drums: 'k h s h k h s h | k h s h k k s h | k h s h k h s h | k h s h k k s s | k h s h k h s h | k h s h k k s h | k h s h k h s h | k k s s k k s s' },
  boss: { bpm: 164, lead: 'C5 - Eb5 - G5 - Ab5 G5 | F5 - Eb5 - D5 - B4 - | C5 - Eb5 - G5 - C6 Bb5 | Ab5 - - - G5 - - - | Ab5 - G5 - F5 - Eb5 - | D5 - Eb5 - F5 - G5 - | Ab5 - G5 - F5 - D5 - | C5 - - - C4 - - -', bass: 'C2 C3 C2 C3 C2 C3 C2 C3 | G1 G2 G1 G2 G1 G2 G1 G2 | C2 C3 C2 C3 C2 C3 C2 C3 | Ab1 Ab2 Ab1 Ab2 G1 G2 G1 G2 | F1 F2 F1 F2 F1 F2 F1 F2 | G1 G2 G1 G2 G1 G2 G1 G2 | Ab1 Ab2 Ab1 Ab2 G1 G2 G1 G2 | C2 C3 C2 C3 C2 . . .', drums: 'k h s h k k s h | k h s h k k s h | k h s h k k s h | k h s s k k s s | k h s h k k s h | k h s h k k s h | k h s h k k s h | k k s s k s s s' }
};
// Short tunes that play once: a win, a fall, a level gained, an animal tamed, a chest opened.
const JINGLES = { win: 'C5 E5 G5 C6 - G5 C6 - -', lose: 'E4 - D4 - C4 - - B3 - - -', level: 'G4 C5 E5 G5 C6 - -', tame: 'E5 G5 B5 - E6 - -', chest: 'C5 G5 C6 - -', quest: 'D5 F#5 A5 D6 - A5 D6 - -' };
// Which tune goes with which place.
function songFor({ battle, boss, voyage, kind, alt } = {}) {
  if (battle) return boss ? 'boss' : 'battle';
  if (voyage) return 'sea';
  if (kind === 'world') return alt === 'sky' ? 'sky' : alt === 'deep' ? 'deep' : 'land';
  if (kind === 'inn' || kind === 'hermit') return 'inn';
  if (kind === 'castle') return 'castle';
  if (['cave', 'dungeon', 'kobold'].includes(kind)) return 'dungeon';
  if (kind === 'aerie') return 'sky';
  if (kind === 'reef') return 'deep';
  return 'town';
}
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteHz(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name || ''); if (!m) return 0;
  const n = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((n - 69) / 12);
}
// A line of notes as [{ hz, len }] (or drum letters), one entry per eighth; holds lengthen the note before.
function parseLine(line) {
  const out = [];
  for (const tok of String(line || '').split(/\s+/).filter((t) => t && t !== '|')) {
    if (tok === '-') { const last = [...out].reverse().find((x) => x.hz || x.drum); if (last) last.len++; out.push({ rest: true }); continue; }
    if (tok === '.') { out.push({ rest: true }); continue; }
    if (/^[ksh]$/.test(tok)) { out.push({ drum: tok, len: 1 }); continue; }
    out.push({ hz: noteHz(tok), len: 1, name: tok });
  }
  return out;
}
// The instruments for each style.
const VOICES = {
  fantasy: { lead: 'square', bass: 'triangle', leadVol: 0.05, bassVol: 0.09, tempo: 1 },
  scifi: { lead: 'sawtooth', bass: 'sine', leadVol: 0.035, bassVol: 0.12, tempo: 1, echo: true },
  cyber: { lead: 'sawtooth', bass: 'square', leadVol: 0.035, bassVol: 0.06, tempo: 1.08, hats: true },
  steam: { lead: 'triangle', bass: 'square', leadVol: 0.08, bassVol: 0.05, tempo: 0.96, brass: true }
};
function createJourneySound({ Ctx = globalThis.AudioContext || globalThis.webkitAudioContext, on = true, setTimer = globalThis.setInterval, clearTimer = globalThis.clearInterval } = {}) {
  let ctx = null, master = null, musicBus = null, fxBus = null;
  let song = '', style = 'fantasy', step = 0, nextAt = 0, timer = 0, lines = null, enabled = Boolean(on);
  const ac = () => {
    if (!ctx && Ctx) { try { ctx = new Ctx(); master = ctx.createGain(); master.gain.value = enabled ? 0.7 : 0; master.connect(ctx.destination); musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master); fxBus = ctx.createGain(); fxBus.gain.value = 0.9; fxBus.connect(master); } catch { ctx = null; } }
    if (ctx?.state === 'suspended') ctx.resume?.()?.catch?.(() => {});
    return ctx;
  };
  function tone(bus, f, at, dur, { type = 'sine', vol = 0.1, to, attack = 0.005 } = {}) {
    const c = ac(); if (!c || !f) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at); if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(bus); o.start(at); o.stop(at + dur + 0.03);
  }
  let noiseBuf = null;
  function noise(bus, at, dur, { vol = 0.2, hp = 800, lp = 0 } = {}) {
    const c = ac(); if (!c) return;
    if (!noiseBuf) { const len = Math.floor(c.sampleRate * 1); noiseBuf = c.createBuffer(1, len, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = lp ? 'lowpass' : 'highpass'; f.frequency.value = lp || hp;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.buffer = noiseBuf; s.connect(f); f.connect(g); g.connect(bus); s.start(at); s.stop(at + dur + 0.02);
  }
  function drum(kind, at, v) {
    if (kind === 'k') tone(musicBus, 140, at, 0.18, { vol: 0.22, to: 45 });
    else if (kind === 's') noise(musicBus, at, 0.12, { vol: 0.09, hp: 1200 });
    else if (kind === 'h') noise(musicBus, at, 0.04, { vol: v.hats ? 0.05 : 0.03, hp: 6000 });
  }
  // The scheduler: a little ahead of time, every quarter of a beat, so the music never stutters.
  function tick() {
    const c = ac(); if (!c || !lines || !enabled) return;
    const s = SONGS[song]; if (!s) return;
    const v = VOICES[style] || VOICES.fantasy;
    const eighth = 60 / (s.bpm * v.tempo) / 2;
    if (nextAt < c.currentTime) nextAt = c.currentTime + 0.05;
    while (nextAt < c.currentTime + 0.25) {
      for (const [part, line] of Object.entries(lines)) {
        const n = line[step % line.length]; if (!n || n.rest) continue;
        if (n.drum) { drum(n.drum, nextAt, v); continue; }
        const dur = eighth * n.len * 0.95;
        if (part === 'lead') { tone(musicBus, n.hz, nextAt, dur, { type: v.lead, vol: v.leadVol, attack: v.brass ? 0.03 : 0.006 }); if (v.echo) tone(musicBus, n.hz * 2, nextAt + eighth * 0.75, dur * 0.6, { type: 'sine', vol: v.leadVol * 0.4 }); }
        else tone(musicBus, n.hz, nextAt, dur, { type: v.bass, vol: v.bassVol });
      }
      step++; nextAt += eighth;
    }
  }
  function music(name, st = style) {
    if (name === song && st === style) return;
    song = SONGS[name] ? name : ''; style = VOICES[st] ? st : 'fantasy'; step = 0;
    lines = song ? { lead: parseLine(SONGS[song].lead), bass: parseLine(SONGS[song].bass), drums: parseLine(SONGS[song].drums) } : null;
    if (ctx) { nextAt = ctx.currentTime + 0.1; musicBus.gain.cancelScheduledValues?.(ctx.currentTime); musicBus.gain.setValueAtTime(0.0001, ctx.currentTime); musicBus.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 0.6); }
    if (!timer && song && setTimer && Ctx) timer = setTimer(tick, 60);
    if (!song && timer) { clearTimer?.(timer); timer = 0; }
  }
  function jingle(name) {
    const c = ac(); if (!c || !enabled || !JINGLES[name]) return;
    let at = c.currentTime + 0.02; const e = 0.11;
    for (const n of parseLine(JINGLES[name])) { if (n.hz) tone(fxBus, n.hz, at, e * n.len, { type: 'square', vol: 0.07 }); at += e; }
  }
  // Sound effects. Each one a few tones and a puff of noise; element spells each sound like themselves.
  const FX = {
    step: (t) => noise(fxBus, t, 0.03, { vol: 0.025, lp: 900 }),
    bump: (t) => tone(fxBus, 90, t, 0.08, { type: 'square', vol: 0.05 }),
    door: (t) => { tone(fxBus, 220, t, 0.12, { type: 'triangle', vol: 0.08, to: 330 }); tone(fxBus, 330, t + 0.1, 0.18, { type: 'triangle', vol: 0.07, to: 440 }); },
    talk: (t) => tone(fxBus, 660, t, 0.04, { type: 'square', vol: 0.025 }),
    menu: (t) => tone(fxBus, 880, t, 0.06, { type: 'square', vol: 0.04 }),
    chest: (t) => { noise(fxBus, t, 0.15, { vol: 0.08, lp: 1200 }); jingle('chest'); },
    coin: (t) => { tone(fxBus, 1318, t, 0.08, { type: 'square', vol: 0.05 }); tone(fxBus, 1760, t + 0.07, 0.2, { type: 'square', vol: 0.05 }); },
    buy: (t) => (STYLE_FX[style]?.coin || FX.coin)(t),
    gather: (t) => { noise(fxBus, t, 0.06, { vol: 0.12, hp: 1800 }); tone(fxBus, 700, t + 0.05, 0.06, { type: 'triangle', vol: 0.05 }); noise(fxBus, t + 0.18, 0.06, { vol: 0.1, hp: 1800 }); },
    craft: (t) => { for (let i = 0; i < 3; i++) { tone(fxBus, 880 + i * 60, t + i * 0.13, 0.05, { type: 'triangle', vol: 0.06 }); noise(fxBus, t + i * 0.13, 0.04, { vol: 0.08, hp: 3000 }); } tone(fxBus, 1318, t + 0.45, 0.25, { type: 'sine', vol: 0.05 }); },
    portal: (t) => { tone(fxBus, 220, t, 0.9, { type: 'sine', vol: 0.06, to: 880 }); tone(fxBus, 330, t, 0.9, { type: 'triangle', vol: 0.04, to: 1320 }); noise(fxBus, t, 0.9, { vol: 0.05, hp: 3000 }); },
    encounter: (t) => { [330, 415, 494, 659].forEach((f, i) => tone(fxBus, f, t + i * 0.045, 0.1, { type: 'square', vol: 0.05 })); noise(fxBus, t, 0.2, { vol: 0.06, hp: 2000 }); },
    ride: (t) => { for (let i = 0; i < 4; i++) tone(fxBus, i % 2 ? 260 : 300, t + i * 0.12, 0.05, { type: 'triangle', vol: 0.06 }); },
    swing: (t) => noise(fxBus, t, 0.12, { vol: 0.08, hp: 2500 }),
    hit: (t) => { noise(fxBus, t, 0.1, { vol: 0.18, hp: 900 }); tone(fxBus, 160, t, 0.12, { type: 'square', vol: 0.08, to: 70 }); },
    crit: (t) => { noise(fxBus, t, 0.18, { vol: 0.25, hp: 600 }); tone(fxBus, 120, t, 0.25, { type: 'sawtooth', vol: 0.1, to: 40 }); tone(fxBus, 1500, t, 0.15, { type: 'square', vol: 0.04 }); },
    miss: (t) => noise(fxBus, t, 0.2, { vol: 0.06, hp: 3000 }),
    shot: (t) => { tone(fxBus, 900, t, 0.08, { type: 'triangle', vol: 0.08, to: 300 }); noise(fxBus, t + 0.05, 0.25, { vol: 0.05, hp: 4000 }); },
    heal: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(fxBus, f, t + i * 0.07, 0.3, { type: 'sine', vol: 0.06 })),
    drink: (t) => { for (let i = 0; i < 3; i++) tone(fxBus, 300 + i * 120, t + i * 0.08, 0.08, { type: 'sine', vol: 0.06, to: 500 + i * 120 }); },
    fire: (t) => { noise(fxBus, t, 0.5, { vol: 0.15, lp: 1500 }); tone(fxBus, 200, t, 0.4, { type: 'sawtooth', vol: 0.04, to: 600 }); },
    frost: (t) => [2093, 2637, 3136, 2349].forEach((f, i) => tone(fxBus, f, t + i * 0.05, 0.25, { type: 'sine', vol: 0.04 })),
    storm: (t) => { noise(fxBus, t, 0.08, { vol: 0.3, hp: 300 }); noise(fxBus, t + 0.06, 0.6, { vol: 0.12, lp: 400 }); },
    holy: (t) => [784, 988, 1175, 1568].forEach((f) => tone(fxBus, f, t, 0.7, { type: 'sine', vol: 0.03, attack: 0.08 })),
    shadow: (t) => { tone(fxBus, 110, t, 0.6, { type: 'sawtooth', vol: 0.05, to: 55 }); tone(fxBus, 116, t, 0.6, { type: 'sawtooth', vol: 0.04, to: 58 }); },
    wild: (t) => { for (let i = 0; i < 5; i++) tone(fxBus, 600 + ((i * 337) % 500), t + i * 0.05, 0.12, { type: 'triangle', vol: 0.04 }); noise(fxBus, t, 0.3, { vol: 0.04, hp: 3000 }); },
    mind: (t) => { tone(fxBus, 440, t, 0.5, { type: 'sine', vol: 0.05, to: 880 }); tone(fxBus, 445, t, 0.5, { type: 'sine', vol: 0.05, to: 890 }); },
    star: (t) => { for (let i = 0; i < 8; i++) tone(fxBus, 1200 + i * 150, t + i * 0.04, 0.2, { type: 'square', vol: 0.025 }); },
    spell: (t) => [660, 880, 1100].forEach((f, i) => tone(fxBus, f, t + i * 0.06, 0.3, { vol: 0.05 })),
    breath: (t) => noise(fxBus, t, 0.8, { vol: 0.18, lp: 800 }),
    feed: (t) => { tone(fxBus, 500, t, 0.06, { type: 'square', vol: 0.04 }); tone(fxBus, 450, t + 0.1, 0.06, { type: 'square', vol: 0.04 }); },
    tame: () => jingle('tame'),
    down: (t) => tone(fxBus, 300, t, 0.5, { type: 'square', vol: 0.05, to: 90 }),
    flee: (t) => { for (let i = 0; i < 4; i++) noise(fxBus, t + i * 0.07, 0.05, { vol: 0.06, lp: 1000 }); },
    takeoff: (t) => { noise(fxBus, t, 0.9, { vol: 0.08, lp: 700 }); for (let i = 0; i < 4; i++) noise(fxBus, t + 0.3 + i * 0.15, 0.08, { vol: 0.08, lp: 500 }); },
    land: (t) => { tone(fxBus, 120, t, 0.2, { type: 'sine', vol: 0.15, to: 50 }); noise(fxBus, t, 0.2, { vol: 0.06, lp: 600 }); },
    splash: (t) => { noise(fxBus, t, 0.35, { vol: 0.14, hp: 1500 }); tone(fxBus, 400, t, 0.15, { type: 'sine', vol: 0.05, to: 900 }); },
    dive: (t) => { noise(fxBus, t, 0.3, { vol: 0.12, hp: 1200 }); for (let i = 0; i < 6; i++) tone(fxBus, 500 + i * 90, t + 0.2 + i * 0.08, 0.06, { type: 'sine', vol: 0.04, to: 900 + i * 90 }); },
    surface: (t) => { FX.splash(t + 0.25); tone(fxBus, 300, t, 0.3, { type: 'sine', vol: 0.05, to: 900 }); },
    fish: (t) => { tone(fxBus, 880, t, 0.05, { type: 'square', vol: 0.04 }); noise(fxBus, t + 0.05, 0.2, { vol: 0.08, hp: 2000 }); },
    swoop: (t) => { noise(fxBus, t, 0.9, { vol: 0.1, lp: 900 }); tone(fxBus, 1200, t, 0.9, { type: 'sine', vol: 0.02, to: 300 }); },
    sail: (t) => { noise(fxBus, t, 1.6, { vol: 0.06, lp: 500 }); tone(fxBus, 196, t, 0.6, { type: 'triangle', vol: 0.06 }); },
    save: (t) => tone(fxBus, 1046, t, 0.12, { type: 'triangle', vol: 0.05 }),
    win: () => jingle('win'), lose: () => jingle('lose'), level: () => jingle('level'), quest: () => jingle('quest')
  };
  // The same moments, sounding like each style: sci-fi hums and zaps, cyberpunk glitches and bangs, steampunk hisses
  // and clanks. Anything a style doesn't change sounds the fantasy way.
  const STYLE_FX = {
    scifi: {
      door: (t) => { noise(fxBus, t, 0.35, { vol: 0.08, lp: 1800 }); tone(fxBus, 700, t, 0.3, { vol: 0.05, to: 250 }); },
      swing: (t) => { tone(fxBus, 180, t, 0.2, { type: 'sawtooth', vol: 0.05, to: 90 }); tone(fxBus, 360, t, 0.2, { vol: 0.04, to: 180 }); },
      shot: (t) => tone(fxBus, 1800, t, 0.16, { type: 'square', vol: 0.05, to: 200 }),
      hit: (t) => { noise(fxBus, t, 0.08, { vol: 0.12, hp: 1500 }); tone(fxBus, 900, t, 0.1, { type: 'square', vol: 0.04, to: 120 }); },
      coin: (t) => { tone(fxBus, 1500, t, 0.06, { vol: 0.06 }); tone(fxBus, 2000, t + 0.08, 0.1, { vol: 0.06 }); },
      step: (t) => tone(fxBus, 70, t, 0.04, { vol: 0.04 }),
      gather: (t) => { tone(fxBus, 1200, t, 0.3, { vol: 0.04, to: 600 }); tone(fxBus, 1800, t + 0.3, 0.06, { vol: 0.04 }); },
      talk: (t) => tone(fxBus, 1200, t, 0.03, { vol: 0.03 })
    },
    cyber: {
      door: (t) => { for (let i = 0; i < 3; i++) tone(fxBus, 400 + ((i * 523) % 900), t + i * 0.04, 0.03, { type: 'square', vol: 0.04 }); noise(fxBus, t + 0.1, 0.15, { vol: 0.06, hp: 2000 }); },
      swing: (t) => tone(fxBus, 2400, t, 0.12, { type: 'square', vol: 0.03, to: 700 }),
      shot: (t) => { noise(fxBus, t, 0.12, { vol: 0.25, hp: 300 }); tone(fxBus, 110, t, 0.12, { type: 'square', vol: 0.08, to: 45 }); },
      hit: (t) => { noise(fxBus, t, 0.1, { vol: 0.16, hp: 700 }); for (let i = 0; i < 3; i++) tone(fxBus, 200 + i * 410, t + i * 0.025, 0.02, { type: 'square', vol: 0.04 }); },
      coin: (t) => { tone(fxBus, 2637, t, 0.04, { type: 'square', vol: 0.035 }); tone(fxBus, 3520, t + 0.05, 0.08, { type: 'square', vol: 0.035 }); },
      step: (t) => noise(fxBus, t, 0.02, { vol: 0.03, hp: 3000 }),
      gather: (t) => { for (let i = 0; i < 4; i++) tone(fxBus, 300 + ((i * 677) % 1400), t + i * 0.05, 0.03, { type: 'square', vol: 0.03 }); noise(fxBus, t + 0.2, 0.08, { vol: 0.08, hp: 2500 }); },
      talk: (t) => tone(fxBus, 1760, t, 0.025, { type: 'square', vol: 0.02 })
    },
    steam: {
      door: (t) => { noise(fxBus, t, 0.4, { vol: 0.09, hp: 3500 }); tone(fxBus, 160, t + 0.3, 0.12, { type: 'square', vol: 0.06, to: 120 }); },
      swing: (t) => { noise(fxBus, t, 0.12, { vol: 0.07, hp: 2500 }); tone(fxBus, 2200, t + 0.1, 0.03, { type: 'triangle', vol: 0.04 }); },
      shot: (t) => { noise(fxBus, t, 0.16, { vol: 0.22, hp: 400 }); noise(fxBus, t + 0.12, 0.4, { vol: 0.05, hp: 4000 }); },
      hit: (t) => { noise(fxBus, t, 0.1, { vol: 0.15, hp: 900 }); tone(fxBus, 520, t, 0.15, { type: 'triangle', vol: 0.06, to: 480 }); },
      coin: (t) => { tone(fxBus, 1100, t, 0.1, { type: 'triangle', vol: 0.07 }); tone(fxBus, 1650, t + 0.06, 0.18, { type: 'triangle', vol: 0.05 }); },
      step: (t) => tone(fxBus, 1800, t, 0.015, { type: 'triangle', vol: 0.02 }),
      gather: (t) => { tone(fxBus, 900, t, 0.08, { type: 'triangle', vol: 0.06, to: 860 }); noise(fxBus, t + 0.1, 0.3, { vol: 0.07, hp: 3500 }); },
      takeoff: (t) => { noise(fxBus, t, 1.2, { vol: 0.12, hp: 2500 }); tone(fxBus, 90, t, 1, { type: 'square', vol: 0.04, to: 140 }); },
      talk: (t) => tone(fxBus, 520, t, 0.04, { type: 'triangle', vol: 0.03 })
    }
  };
  return {
    music,
    sfx(kind) { const c = ac(); const fn = STYLE_FX[style]?.[kind] || FX[kind]; if (!c || !enabled || !fn) return false; try { fn(c.currentTime + 0.01); return true; } catch { return false; } },
    setStyle(st) { if (VOICES[st]) style = st; },
    get style() { return style; },
    setOn(v) { enabled = Boolean(v); if (master && ctx) master.gain.setValueAtTime(enabled ? 0.7 : 0, ctx.currentTime); if (enabled) ac(); },
    get on() { return enabled; },
    get song() { return song; },
    wake() { ac(); },
    stop() { if (timer) clearTimer?.(timer); timer = 0; song = ''; lines = null; try { ctx?.close?.(); } catch {} ctx = null; }
  };
}

globalThis.BobJourneyPlay = { mountJourney, SONGS, JINGLES, songFor, noteHz, parseLine, createJourneySound };
})();
