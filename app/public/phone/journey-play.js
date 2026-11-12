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
  let heightFx = null, voyage = null, sideFacing = 'left', armedRelease = '';
  const landFx = [];
  const swoops = new Map();
  const T = (text) => (j ? R.restyle(text, j.style) : text);
  const lookCache = new Map();

  root.innerHTML = `<div class="jy" tabindex="-1">
    <div class="jy-top"><span class="jy-where" aria-live="polite"></span><span class="jy-gold"></span><span class="jy-spacer"></span>
      <button type="button" class="mini" data-jy="menu" title="Menu (Esc)">☰ Menu</button><button type="button" class="mini" data-jy="save" title="Save the journey">💾 Save</button><button type="button" class="icon" data-jy="close" aria-label="Close Journey">✕</button></div>
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
  const foeLook = (f) => (f.person ? personLook(f.person) : f.parts ? lookFor(A.encodeParts(f.parts)) : lookFor(deps.enemyLooks?.[f.type], f.tint) || beastLookFor(f.type, f.tint) || lookFor(A.encodeParts({ body: 'blob', skin: '0' }), f.tint));
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
  function drawFig(look, x, y, px, o = {}) { try { return S.drawFigure(ctx, x, y, px, look, { compose: A.compose, ...o }); } catch { return null; } }
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
  function tileCanvas(ch, frame = 0, theme = '') {
    const style = j?.style || 'fantasy';
    const key = `${ch}${frame}${theme}|${style}`;
    if (tileArt.has(key)) return tileArt.get(key);
    const c = doc.createElement('canvas'); c.width = TILE; c.height = TILE;
    const g = c.getContext('2d');
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const fill = (col) => rect(0, 0, TILE, TILE, col);
    const specks = (col, n, seed) => { for (let i = 0; i < n; i++) px(Math.floor(hash(i, seed) * 16), Math.floor(hash(seed, i) * 16), col); };
    const grass = () => { fill('#5aa04a'); specks('#4c8c3e', 14, 3); specks('#6cb85a', 8, 7); };
    const boards = (a, b) => { fill(a); for (let y = 0; y < 16; y += 4) rect(0, y, 16, 1, b); for (let y = 0; y < 16; y += 4) rect((y * 3) % 16, y, 1, 4, b); };
    const stone = (a, b) => { fill(a); for (let y = 0; y < 16; y += 4) { rect(0, y, 16, 1, b); for (let x = (y % 8 ? 4 : 0); x < 16; x += 8) rect(x, y, 1, 4, b); } };
    const water = (deep, light) => { fill(deep); for (let i = 0; i < 3; i++) { const y = 3 + i * 5, x = ((i * 5) + frame * 3) % 12; rect(x, y, 4, 1, light); } };
    const th = THEMES[theme];
    const building = (roof, wall, sign) => {
      fill(theme === 'aerie' ? '#e8eef8' : theme === 'reef' ? '#5a7a9a' : '#b8a07a');
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
    switch (ch) {
      case '.': grass(); break;
      case '"': fill('#4e9440'); for (let i = 0; i < 9; i++) { const x = Math.floor(hash(i, 11) * 14) + 1, y = Math.floor(hash(11, i) * 12) + 3; px(x, y, '#2f6a2a'); px(x, y - 1, '#3d7f34'); px(x + 1, y - 2, '#6cb85a'); } break;
      case 'g': grass(); break;
      case 'F': fill('#3d7f34'); specks('#2f6a2a', 10, 21); for (const [x, y] of [[4, 5], [11, 9]]) { rect(x - 1, y + 3, 2, 3, '#6b4423'); g.fillStyle = '#245a22'; g.beginPath(); g.moveTo(x - 4, y + 4); g.lineTo(x, y - 5); g.lineTo(x + 4, y + 4); g.fill(); } break;
      case 'T': grass(); rect(7, 11, 2, 4, '#6b4423'); g.fillStyle = '#2f6a2a'; g.beginPath(); g.arc(8, 7, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3d8a38'; g.beginPath(); g.arc(6.5, 5.5, 3, 0, Math.PI * 2); g.fill(); break;
      case 'y': grass(); for (let i = 0; i < 6; i++) { const x = 2 + Math.floor(hash(i, 31) * 12), y = 3 + Math.floor(hash(31, i) * 10); px(x, y + 1, '#2f6a2a'); px(x, y, ['#ff7ad8', '#ffd166', '#ffffff', '#7ae0ff'][i % 4]); } break;
      case 'w': fill('#4a6a3a'); specks('#3a5a2e', 10, 41); rect(2, 4, 6, 2, '#5a7a8a'); rect(9, 10, 5, 2, '#5a7a8a'); px(4, 3, '#2a4a2a'); px(11, 8, '#2a4a2a'); px(12, 7, '#7a9a4a'); break;
      case 'd': fill('#e6c98a'); specks('#d4b070', 12, 51); g.fillStyle = '#d4b070'; for (let x = 0; x < 16; x += 2) g.fillRect(x, 6 + Math.round(Math.sin(x / 2.5) * 2), 2, 1); break;
      case ',': fill('#e0cf8f'); specks('#c9b676', 10, 9); break;
      case ':': case '*': fill(ch === '*' ? '#b8a07a' : '#c8a66a'); specks(ch === '*' ? '#9c8662' : '#a98a52', 10, 5); if (ch === '*') { g.fillStyle = '#a08a68'; for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1); for (let x = 0; x < 16; x += 8) g.fillRect(x, 0, 1, 16); } break;
      case '~': water('#2a5aa8', '#6aa0e0'); break;
      case 'r': water('#3a78c8', '#9ac8f0'); rect(0, 0, 16, 1, '#5aa04a'); rect(0, 15, 16, 1, '#5aa04a'); break;
      case '=': fill('#3a78c8'); rect(0, 2, 16, 12, '#8a5a2b'); g.fillStyle = '#6b4423'; for (let x = 0; x < 16; x += 4) g.fillRect(x, 2, 1, 12); rect(0, 2, 16, 1, '#4a2e18'); rect(0, 13, 16, 1, '#4a2e18'); break;
      case '^': grass(); g.fillStyle = '#7e8a96'; g.beginPath(); g.moveTo(1, 15); g.lineTo(7, 2); g.lineTo(15, 15); g.fill(); g.fillStyle = '#e8eef4'; g.beginPath(); g.moveTo(7, 2); g.lineTo(9, 6); g.lineTo(5, 6); g.fill(); rect(9, 9, 3, 1, '#525c66'); break;
      case 'f': grass(); rect(0, 6, 16, 2, '#8a5a2b'); rect(0, 11, 16, 2, '#8a5a2b'); rect(2, 4, 2, 11, '#6b4423'); rect(12, 4, 2, 11, '#6b4423'); break;
      case 'W': stone('#8a8a92', '#5a5a64'); rect(0, 0, 16, 2, '#a8a8b0'); break;
      case 'Q': stone('#7a7a84', '#4a4a54'); for (let x = 0; x < 16; x += 4) rect(x, 0, 2, 3, '#a8a8b0'); rect(6, 6, 4, 5, '#14110f'); break;
      case 'G': fill('#c8a66a'); rect(0, 0, 3, 16, '#6a6a74'); rect(13, 0, 3, 16, '#6a6a74'); g.fillStyle = '#3a3a44'; for (let x = 4; x < 13; x += 3) g.fillRect(x, 0, 1, 3); break;
      case 'U': grass(); g.fillStyle = '#8a8a92'; g.beginPath(); g.arc(8, 9, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a5aa8'; g.beginPath(); g.arc(8, 9, 3.5, 0, Math.PI * 2); g.fill(); rect(2, 2, 1, 7, '#6b4423'); rect(13, 2, 1, 7, '#6b4423'); rect(2, 2, 12, 1, '#6b4423'); break;
      case 'h': building('#9a3a2a', '#efe6d2', () => { rect(3, 9, 2, 2, '#7ec8ff'); rect(11, 9, 2, 2, '#7ec8ff'); }); break;
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
      case 'C': fill('#7e8a96'); g.fillStyle = '#14110f'; g.beginPath(); g.arc(8, 11, 5, Math.PI, 0); g.fill(); rect(3, 11, 10, 5, '#14110f'); rect(0, 0, 16, 2, '#525c66'); break;
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
      case 'L': fill('#7e8a96'); g.fillStyle = '#14110f'; g.beginPath(); g.arc(8, 12, 4, Math.PI, 0); g.fill(); rect(4, 12, 8, 4, '#14110f'); px(6, 10, '#ffd166'); px(10, 10, '#ffd166'); rect(2, 2, 2, 2, '#c8a66a'); rect(12, 3, 2, 2, '#c8a66a'); break;
      case 'N': fill('#7e8a96'); rect(3, 4, 10, 12, '#5a5a64'); rect(3, 4, 10, 2, '#9a9aa4'); rect(6, 8, 4, 8, '#14110f'); rect(6, 8, 4, 1, '#ffd166'); for (const x of [3, 6, 9, 12]) rect(x, 2, 1, 2, '#5a5a64'); break;
      case 'E': fill('#3d7f34'); rect(7, 6, 2, 10, '#6b4423'); g.fillStyle = '#245a22'; g.beginPath(); g.arc(8, 5, 6, 0, Math.PI * 2); g.fill(); rect(3, 8, 4, 3, '#d8e8c0'); rect(9, 4, 4, 3, '#d8e8c0'); px(4, 9, '#ffd166'); px(10, 5, '#ffd166'); break;
      case 'M': grass(); for (const x of [4, 11]) { g.fillStyle = '#4e9440'; g.beginPath(); g.arc(x, 12, 5, Math.PI, 0); g.fill(); g.fillStyle = '#c8a040'; g.beginPath(); g.arc(x, 12, 2, 0, Math.PI * 2); g.fill(); } break;
      case 'J': grass(); for (const [x, y, col] of [[4, 9, '#d0303a'], [11, 11, '#c070ff'], [8, 5, '#ff9ae0']]) { rect(x - 1, y, 2, 4, '#efe6d2'); g.fillStyle = col; g.beginPath(); g.ellipse(x, y, 4, 3, 0, Math.PI, 0); g.fill(); } px(3, 3, '#fff6c0'); px(13, 4, '#fff6c0'); break;
      case '1': fill('#4a6a3a'); rect(0, 11, 16, 5, '#3a78c8'); for (const x of [2, 9]) { rect(x + 1, 9, 1, 6, '#6b4423'); rect(x + 4, 9, 1, 6, '#6b4423'); rect(x, 4, 6, 5, '#8a6a3a'); g.fillStyle = '#8a7a3a'; g.beginPath(); g.moveTo(x - 1, 5); g.lineTo(x + 3, 1); g.lineTo(x + 7, 5); g.fill(); } break;
      case '2': grass(); rect(2, 6, 12, 10, '#e8d8b0'); rect(2, 4, 12, 3, '#2a7a8a'); rect(11, 0, 2, 5, '#5a5a64'); g.strokeStyle = '#ffd166'; g.lineWidth = 1; g.beginPath(); g.arc(6, 10, 2.5, 0, Math.PI * 2); g.stroke(); rect(10, 11, 2, 5, '#6b4423'); break;
      case '3': grass(); for (const x of [1, 9]) { g.fillStyle = '#c8a66a'; g.beginPath(); g.moveTo(x, 15); g.lineTo(x + 3, 4); g.lineTo(x + 6, 15); g.fill(); rect(x + 3, 2, 1, 3, '#6b4423'); } rect(7, 0, 1, 3, '#d0303a'); break;
      case '4': fill('#7e8a96'); rect(0, 3, 16, 13, '#4a4a54'); rect(0, 3, 16, 2, '#7a7a84'); rect(5, 7, 6, 9, '#14110f'); rect(1, 1, 3, 2, '#4a4a54'); rect(12, 1, 3, 2, '#4a4a54'); break;
      case '5': grass(); for (const [x, col] of [[1, '#8a3a6a'], [6, '#3a6a8a'], [11, '#8a6a2a']]) { rect(x, 6, 4, 9, '#a08a5a'); rect(x - 1, 4, 6, 3, col); } px(3, 9, '#ffd166'); px(13, 9, '#c0c0c0'); break;
      default: fill('#000');
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
  const ANIMATED = new Set(['~', 'r', 'p', 'A', '&']);
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
    if (what.kit) {
      const kind = R.kitKind(what.kit), b = base(what.kit);
      if (kind === 'weapon') for (const [cx, cy, col] of S.weaponCells(b, 45, { x: 1, y: 8 })) { ctx.fillStyle = col; ctx.fillRect(x + cx, y + cy - 4, 1, 1); }
      else if (kind === 'shield') for (const [cx, cy, col] of S.shieldCells(b, 'down', { x: 1, y: 1 })) { ctx.fillStyle = col; ctx.fillRect(x + cx, y + cy, 1, 1); }
      else { ctx.fillStyle = { robe: '#6a3a8a', leather: '#8a5a2b', chain: '#9aa3ad', plate: '#c8ccd4' }[b] || '#888'; ctx.fillRect(x + 1, y, 6, 8); ctx.fillRect(x, y + 1, 8, 3); }
      return 10;
    }
    return 0;
  }

  // ---------- The save and the start ----------
  // Making a land takes a moment (a few seconds for the biggest), so the last one made is kept, and the save is only
  // read for its summary until you Resume.
  let lastLand = null;
  function makeLand(seed, size, style) {
    const key = `${seed}|${size}`;
    if (lastLand?.key === key) return lastLand.world;
    lastLand = null; // let the old one go before making the new one
    const w = Wm.makeWorld(seed, size, style);
    lastLand = { key, world: w };
    return w;
  }
  let savedRaw = null;
  async function loadSave() {
    try { const r = await deps.api('/api/adventure/journey'); savedRaw = r?.journey || null; saved = savedRaw ? R.cleanJourney(savedRaw) : null; } catch (e) { msg = e.message; saved = null; savedRaw = null; }
    drawPanel();
  }
  async function save(quiet) {
    if (!j || lobby) return;
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
    lobby = true; trail = []; mode = 'walk';
    drawPanel();
  }
  // The big lands take a few seconds to make, so the screen says so first.
  const later = (fn) => { msg = 'Rolling the land…'; drawPanel(); sayLive(msg); setTimeout(fn, 40); };
  function rollNew() {
    if (deps.phone && Wm.SIZES[newSize]?.desktopOnly) newSize = 'campaign';
    later(() => {
      if (closed) return;
      const seed = String(Date.now() % 1e9);
      world = makeLand(seed, newSize, newStyle);
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
    later(() => {
      if (closed) return;
      if (savedRaw) { j = R.cleanJourney(savedRaw, makeLand); savedRaw = null; saved = j; } else j = saved;
      world = makeLand(j.seed, j.size, j.style);
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
  function talkTo(lines, then) { talk = { lines: lines.filter(Boolean).map(T).flatMap(pages), i: 0, shown: still() ? 1e9 : 0, then }; mode = mode === 'battle' ? 'battle' : 'talk'; showBox(); }
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
    armed = null; armedRelease = '';
    if (dir === 'left' || dir === 'right') sideFacing = dir;
    if (r.moved) {
      stepPhase = (stepPhase + 1) % 4;
      if (r.door) { trail = []; swoops.clear(); landFx.length = 0; heightFx = null; announce(); arrive(r.door); return; }
      trail.unshift({ x: from.x, y: from.y, facing: j.facing });
      trail = trail.slice(0, 16); // the party, then the pets and mounts that follow
      anim = { from, t0: now(), dur: still() ? 0 : j.riding && j.alt === 'ground' ? 110 : 150 };
      if (r.splash && !still()) landFx.push({ kind: 'splash', x: j.x, y: j.y, t0: now(), dur: 600 });
      if (r.splash === 'in') sayLive(`${R.leaderMount(j)?.name || 'Your mount'} carries you into the water.`);
      if (r.battle) setTimeout(() => startFight(r.battle, { helpers: r.helpers, chase: r.chase }), still() ? 0 : 170);
    } else if (r.bump?.kind === 'boss') bossTalk(r.bump.boss);
    else if (r.bump?.kind === 'closed') say('Bob: The door\'s stuck until you roll a New adventure. The buttons are along the bottom.');
    else if (r.bump?.kind === 'tile' && ['S', 'A'].includes(r.bump.tile) && j.alt === 'ground') sayLive(r.bump.tile === 'S' ? 'A city in the clouds, far overhead. Only a flier can reach it: fly up (⤒ or E) on a pegasus, griffin or wyvern.' : 'A city under the waves. Only a swimmer can reach it: dive (⤓ or Q) on a dolphin.');
  }
  // ---------- Up, down and riding (Journey v1.2) ----------
  function height(r) {
    sayLive(r.text);
    if (!r.ok) return;
    trail = [];
    heightFx = still() ? null : { kind: r.anim, t0: now(), dur: r.anim === 'surface' ? 700 : 1000 };
    if (r.anim === 'land' && !still()) setTimeout(() => landFx.push({ kind: 'dust', x: j.x, y: j.y, t0: now(), dur: 500 }), 800);
    if ((r.anim === 'dive' || r.anim === 'surface') && !still()) landFx.push({ kind: 'ripple', x: j.x, y: j.y, t0: now(), dur: 900 });
    R.seeSites(world, j); announce(); save(true);
  }
  function rise() { if (mode !== 'walk' || anim || !j || lobby) return; height(R.rise(world, j)); }
  function sink() { if (mode !== 'walk' || anim || !j || lobby) return; height(R.sink(world, j)); }
  function rideToggle() { if (mode !== 'walk' || anim || !j || lobby) return; const r = R.ride(world, j); sayLive(r.text); if (r.ok) { trail = []; announce(); save(true); } }
  const BOB_LINES = { cave: 'Bob: Dark, damp, and smells of something. My three least favourite things, in order.', dungeon: 'Bob: Old stones and older bones. I would like it on record that I said this was a bad idea.', castle: 'Bob: A castle! Wipe your feet. And don\'t pick a fight with the knights. Please.', hermit: 'Bob: Someone actually lives out here? On purpose?' };
  function arrive(id) {
    const map = world.map(id);
    if (!map || j.talked.includes(id)) return;
    j.talked.push(id);
    const lines = [];
    if (map.kind !== 'world' && map.kind !== 'inn') lines.push(`${map.name}.`);
    if (j.party.some((m) => m.who === 'bob') && BOB_LINES[map.kind]) lines.push(BOB_LINES[map.kind]);
    if (R.isWanted(world, j)) lines.push('The guards here remember you. They\'re coming.');
    if (lines.length) talkTo(lines);
  }
  function announce() {
    const map = R.mapOf(world, j);
    const zone = map.kind === 'world' ? ` · danger ${R.zoneAt(world, j)}` : '';
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
      // Facing water on the land, the button fishes.
      const fish = j.alt === 'ground' && !lobby ? R.fishAt(world, j) : null;
      if (fish) { if (fish.ok) { lastLoot = [{ item: 'fish' }]; lastLootAt = now(); save(true); } if (!still()) landFx.push({ kind: 'ripple', x: j.x + dx, y: j.y + dy, t0: now(), dur: 700 }); talkTo([fish.text]); return; }
      swing = { t0: now() }; return;
    }
    if (t.kind === 'chest') { const r = R.openChest(world, j, t.chest); lastLoot = r.got || null; lastLootAt = now(); talkTo([r.text]); save(true); return; }
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
    if (p.role === 'ruler') { talkTo([`${name}: ${R.questLine(world, j)}`]); return; }
    if (p.role === 'lost') { const r = R.findLost(j, p); talkTo([`${name}: ${R.ROLE_LINES.lost[p.line % R.ROLE_LINES.lost.length]}`, r || '']); save(true); return; }
    if (p.role === 'elder') { const q = R.questTalk(world, j, map.site || map.id); talkTo(q.lines.map((l) => `${name}: ${l}`)); if (q.done) { lastLoot = [{ coin: q.reward }]; lastLootAt = now(); } save(true); return; }
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
      const lines = [b.spar ? `A good bout! ${r.xp} experience.` : `You win! ${r.xp} experience${r.coin ? ` and ${R.fmtCoin(r.coin)}` : ''}.`];
      if (r.drops.length) lines.push(`Dropped kit: ${r.drops.map((k) => `${R.kitName(k)} (${R.kitWords(k)})`).join('; ')}. It's in Kit on the menu.`);
      if (r.items.length) lines.push(`Picked up: ${r.items.map((i) => R.ITEMS[i].name).join(', ')}.`);
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
      lastLoot = [...(r.coin ? [{ coin: r.coin }] : []), ...r.drops.map((k) => ({ kit: k })), ...r.items.map((i) => ({ item: i })), ...(r.finds || []).map((fd) => (fd.coin ? { coin: fd.coin } : { item: fd.item }))];
      lastLootAt = now();
      drawPanel();
      talkTo(lines, endFight);
      save(true);
    } else if (b.over === 'lost') {
      battle.stage = 'done'; drawPanel();
      if (b.spar) talkTo(['The captain helps you up. "Not bad. Again sometime."'], endFight);
      else talkTo(['The party falls…', 'You wake up in Bob\'s Inn, aching and a bit lighter in the purse. Half your coin is gone; everything else is still yours.'], () => { R.wakeAtInn(world, j); trail = []; endFight(); save(true); });
    } else if (b.over === 'fled') { battle.stage = 'done'; talkTo(['You got away.'], endFight); }
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
  function animate(e) {
    sayLive(e.text);
    if (still()) { if (e.dmg || e.heal || e.miss) pop(e); return Promise.resolve(); }
    return new Promise((done) => {
      const isFight = ['fight', 'skill', 'hit', 'curse', 'breath', 'item', 'spell', 'feed', 'tame'].includes(e.act);
      const dur = isFight ? (e.element ? 700 : 620) : 520;
      battle.anim = { e, t0: now(), dur };
      setTimeout(() => { if (e.dmg || e.heal || (e.miss && e.target)) pop(e); }, dur * 0.55);
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
  function inWater(x, y, w, draw, t) {
    ctx.save(); ctx.beginPath(); ctx.rect(x - 12, y - 40, w + 24, 52); ctx.clip(); draw(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const k = Math.floor(t / 250) % 2;
    ctx.fillRect(x + 1 + k, y + 12, w - 4, 1); ctx.fillRect(x - 1 - k, y + 13, 3, 1); ctx.fillRect(x + w - 2 + k, y + 13, 3, 1);
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
    for (let y = y0; y <= y0 + VIEW_H + moreY * 2; y++) for (let x = x0; x <= x0 + VIEW_W + more * 2; x++) {
      const ch = map.rows[y]?.[x]; if (!ch) continue;
      const fr = ANIMATED.has(ch) && !still() ? tick2 : 0;
      // Under the sea: the sea is the floor you swim over, and the land above is a blur.
      const art = deep && map.kind === 'world' ? ('~r'.includes(ch) ? tileCanvas('$', 0) : ch === 'A' ? tileCanvas('A', fr) : blurredTile(ch, fr)) : tileCanvas(ch, fr, theme);
      ctx.drawImage(art, x * TILE - cx, y * TILE - cy);
    }
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
      if (q.visiting && !still()) { const key = `${map.id}:${q.id}`; if (!swoops.has(key)) swoops.set(key, t); swoopK = Math.min(1, (t - swoops.get(key)) / 1100); qx += (1 - swoopK) * 50; qy -= (1 - swoopK) ** 2 * 110; }
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
        const mount = () => drawFig(ml, fx, fy + 6, 1, { facing: side, step: beat });
        const rider = () => { ctx.save(); ctx.beginPath(); ctx.rect(fx - 12, fy - 40, 40, 48); ctx.clip(); drawFig(memberLook(lead), fx + pix - 1, fy - 3, pix, { facing: j.facing === 'up' || j.facing === 'down' ? side : j.facing, step: 0, weapon: base(lead.weapon), shield: base(lead.shield), weaponTint: kitTint(lead.weapon), shieldTint: kitTint(lead.shield), angle }); ctx.restore(); extras(fx, fy - 3, pix, { ...memberExtras(lead), flap }); };
        if (water && !deep) inWater(fx, fy + 6, 16, () => { mount(); rider(); }, t); else { mount(); rider(); }
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
    if (talk) drawTalk(t);
    root.querySelector('.jy-gold').textContent = lobby ? '' : `🪙 ${R.fmtCoin(j.coin, true)}`;
  }
  function puff(x, y, k) { ctx.fillStyle = `rgba(230,220,200,${0.7 * (1 - k)})`; for (let i = 0; i < 5; i++) { const a = i * 1.26, r = 3 + k * 8; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.4, 2 + k * 2, 0, Math.PI * 2); ctx.fill(); } }
  function drawLandFx(fx, x, y, k) {
    if (fx.kind === 'dust') { puff(x, y, k); return; }
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
    if (k >= 1) { const to = voyage.to; voyage = null; trail = []; announce(); arrive(to); drawPanel(); }
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
    if (talk.shown >= line.length && Math.floor(t / 400) % 2) { ctx.fillStyle = '#ffd166'; ctx.fillRect(bx + bw - 10, by + bh - 8, 4, 3); }
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
    const col = ELEMENT_COLOURS[e.element] || '#ffffff';
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
      const angle = win ? 0 : swingAt(m.id, 'left') ?? (e?.who === m.id && e.element ? -150 : undefined);
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
        ctx.fillStyle = '#c8a66a'; ctx.fillRect(Math.round(ax - (dir > 0 ? len : 0)), Math.round(ay), len, 1);
        ctx.fillStyle = '#d8dee6'; ctx.fillRect(Math.round(dir > 0 ? ax : ax - 2), Math.round(ay) - 1, 2, 3);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(dir > 0 ? ax - len - 2 : ax + len), Math.round(ay) - 1, 2, 1);
      }
    }
    // Spells: each element looks like itself. A bolt flies from the caster, then the element lands on the target.
    if (e && e.element && p > 0.1) drawSpell(e, sp.get(e.who), sp.get(e.target), p, t);
    // Feeding and taming: hearts.
    if (e && (e.act === 'tame' || (e.act === 'feed' && !e.miss)) && p > 0.3) { const s2 = sp.get(e.target); if (s2) { ctx.fillStyle = '#ff7ad8'; for (let k = 0; k < (e.act === 'tame' ? 6 : 3); k++) { const hx = s2.x + 6 + k * 7, hy = s2.y + 6 - (p - 0.3) * 40 - (k % 2) * 6; ctx.fillRect(hx, hy, 2, 2); ctx.fillRect(hx + 3, hy, 2, 2); ctx.fillRect(hx, hy + 1, 5, 2); ctx.fillRect(hx + 1, hy + 3, 3, 1); ctx.fillRect(hx + 2, hy + 4, 1, 1); } } }
    if (e && e.heal && p > 0.25) { const s = sp.get(e.target); if (s) { ctx.fillStyle = '#7dff9a'; for (let k = 0; k < 8; k++) ctx.fillRect(s.x + ((k * 7) % s.w), s.y + s.h - ((p - 0.25) * 60 + k * 5) % s.h, 2, 2); } }
    if (e && e.act === 'breath' && p > 0.2) { ctx.fillStyle = `rgba(255,120,40,${0.45 * (1 - p)})`; ctx.fillRect(120, 0, W - 120, H); }
    if (e && (e.coin || e.act === 'steal') && p > 0.3) { const s = sp.get(e.target) || sp.get(e.who); if (s) drawIcon(s.x + 6, s.y - 8 - p * 10, { coin: e.coin || 150 }); }
    // Floating numbers.
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    for (let i = fxNumbers.length - 1; i >= 0; i--) {
      const n = fxNumbers[i], age = t - n.t0;
      if (age > 900) { fxNumbers.splice(i, 1); continue; }
      ctx.fillStyle = '#000'; ctx.fillText(n.text, n.x + 1, n.y - age / 40 + 1); ctx.fillStyle = n.colour; ctx.fillText(n.text, n.x, n.y - age / 40);
    }
    ctx.textAlign = 'left';
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
    panel.innerHTML = `<ul class="jy-party">${j.party.map((m) => sheet(m)).join('')}</ul>${atInn ? innButtons() : ''}<p class="muted jy-keys">Arrow keys walk · Enter talks, opens chests and fishes · F picks a fight · Esc opens the menu${mt ? ` · R rides ${esc(mt.name)}${R.canFly(j) ? ' · E flies up, Q lands' : R.canSwim(j) ? ' · Q dives, E comes up' : ''}` : ''}</p>`;
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
    const tabs = [['party', '👥 Party'], ['skills', '✨ Skills'], ['kit', '🧍 Kit'], ['bag', '🎒 Bag'], ['pets', '🐾 Pets'], ['land', '🧭 The land'], ['save', '💾 Save']];
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
    if (menu.tab === 'bag') {
      const items = Object.entries(j.bag).filter(([, n]) => n > 0);
      return `${head}<p class="muted">The bag holds ${R.bagCount(j)} of ${R.bagSize(j)} things. Each pet out with you carries 10 more and each mount 25.</p>${items.length ? `<ul class="jy-bag">${items.map(([id, n]) => { const it = R.ITEMS[id]; const usable = it.field; return `<li><strong>${esc(it.name)}</strong> ×${n} <span class="muted">${esc(it.what)}</span> ${usable ? j.party.map((x) => `<button type="button" class="mini" data-use="${id}" data-on="${esc(x.id)}">${esc(x.name)}</button>`).join('') : '<span class="muted">(in a fight)</span>'}</li>`; }).join('')}</ul>` : '<p class="muted">The bag is empty.</p>'}`;
    }
    return `${head}<div class="row"><button type="button" class="yes" data-jy="save">💾 Save now</button><button type="button" data-jy="leave">🚪 Save and leave</button></div><p class="muted">The journey also saves itself after every chest and every fight. Seed ${esc(j.seed)} · ${esc(Wm.SIZES[j.size]?.name || '')}</p>`;
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
    const m = world.map('world');
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
    const seen = world.sites.filter((s) => j.seen.includes(s.id) || s.id === j.at).map((s) => ({ s, d: Math.abs(s.x - here.x) + Math.abs(s.y - here.y) })).sort((a, b) => a.d - b.d).slice(0, 40);
    return `<div class="jy-land-view"><canvas class="jy-land" width="240" height="180" role="img" aria-label="The whole land, with the places you've found and where you are"></canvas>
      <p class="muted">${esc(Wm.SIZES[j.size]?.name || '')} land, ${world.w}×${world.h}. You've found ${j.seen.length} of ${world.sites.length} places. The blinking dot is you.</p>
      <ul class="jy-bag">${seen.map(({ s, d }) => `<li><strong>${esc(s.name)}</strong> <span class="muted">${esc(Wm.SITE_WORDS?.[s.kind] || s.kind)}${s.dock ? ' · ⚓ dock' : ''}${s.alt === 'sky' ? ' · in the clouds' : s.alt === 'deep' ? ' · under the sea' : ''} · ${d ? `${d} steps ${R.direction(here, s)}` : 'here'}</span></li>`).join('')}</ul></div>`;
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
      for (const s of world.sites) if (j.seen.includes(s.id)) { g.fillStyle = SITE_COL[s.kind] || '#d8a0ff'; g.fillRect(Math.round(ox + s.x * k) - 1, Math.round(oy + s.y * k) - 1, 3, 3); }
      if (blink++ % 2 === 0 || still()) { g.fillStyle = '#ff3a3a'; g.fillRect(Math.round(ox + here.x * k) - 2, Math.round(oy + here.y * k) - 2, 5, 5); g.fillStyle = '#ffffff'; g.fillRect(Math.round(ox + here.x * k), Math.round(oy + here.y * k), 1, 1); }
    };
    paint();
    if (!still()) landTimer = setInterval(() => { if (!c.isConnected) { clearInterval(landTimer); return; } paint(); }, 450);
  }
  function shopHtml() {
    if (shop.kind === 'new') return newHtml();
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
    const list = ids.map((id) => (R.ITEMS[id] ? [id, R.ITEMS[id].name, R.priceOf(j, id, mult), R.ITEMS[id].what, false] : [id, R.kitName(id), R.priceOf(j, id, mult), R.kitWords(id), j.owned[R.kitKind(id)].includes(id)]));
    const sellable = shop.kind === 'smith' ? ['weapon', 'armour', 'shield'].flatMap((k) => j.owned[k].filter((key) => !j.party.some((m) => m[k] === key))) : [];
    return `<p><strong>${esc(shop.who)}</strong> · ${purse}${mult < 1 ? ' <span class="muted">(everything half price)</span>' : ''}</p>${buyList(list)}${sellable.length ? `<p><strong>Sell</strong> <span class="muted">(kit nobody is wearing, for a third of its price)</span></p><ul class="jy-bag">${sellable.map((key) => `<li><button type="button" data-sell="${esc(key)}">${esc(R.kitName(key))} · ${esc(R.fmtCoin(Math.round(R.kitPrice(key) / 3), true))}</button></li>`).join('')}</ul>` : ''}${leave}`;
  }
  const buyList = (list) => `<ul class="jy-bag">${list.map(([id, name, price, what, have]) => `<li><button type="button" data-buy="${esc(id)}" ${have || j.coin < price ? 'disabled' : ''}>${esc(name)} · ${esc(R.fmtCoin(price, true))}</button> <span class="muted">${have ? 'You have this.' : esc(what)}</span></li>`).join('')}</ul>`;
  let dollTimer = 0;
  function mountDolls() {
    clearInterval(dollTimer);
    const c = panel.querySelector('.jy-turn'); if (!c) return;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const m = j.party[menu.who || 0] || j.party[0];
    let k = 0;
    const paint = () => { g.clearRect(0, 0, c.width, c.height); S.FACINGS.forEach((f, i) => { try { S.drawFigure(g, 4 + i * 40, 2, 2.6, memberLook(m), { compose: A.compose, facing: f, step: still() ? 0 : k % 4, weapon: base(m.weapon), shield: base(m.shield) }); } catch {} }); k++; };
    paint();
    if (!still()) dollTimer = setInterval(() => { if (!c.isConnected) { clearInterval(dollTimer); return; } paint(); }, 200);
  }

  // ---------- Input ----------
  root.addEventListener('click', async (e) => {
    const bt = e.target.closest('button'); if (!bt || bt.disabled) return;
    const d = bt.dataset;
    if (d.jy === 'close') { await close(); return; }
    if (d.jy === 'newadv') { shop = { kind: 'new' }; mode = 'shop'; drawPanel(); return; }
    if (d.jy === 'roll') { rollNew(); return; }
    if (d.jy === 'resume-adv') { resume(); return; }
    if (d.jy === 'menu' || d.key === 'menu') { toggleMenu(); return; }
    if (d.jy === 'save') { if (lobby) say('Nothing to save yet: roll a New adventure first.'); else await save(); return; }
    if (d.jy === 'resume') { menu = null; mode = 'walk'; drawPanel(); focus(); return; }
    if (d.jy === 'leave') { await save(true); await close(); return; }
    if (d.jy === 'look') { const m = j.party[menu.who || 0]; deps.editLook?.(m, (id) => { if (id) { m.look = id; lookCache.clear(); save(true); } drawPanel(); }); return; }
    if (d.key === 'act') { act(); return; }
    if (d.key === 'rise') { rise(); return; }
    if (d.key === 'sink') { sink(); return; }
    if (d.key === 'ride') { rideToggle(); return; }
    if (d.sail) { const st = world.sites.find((x) => x.id === d.sail); const r = R.sailTo(world, j, d.sail); if (!r.ok) { msg = r.text; drawPanel(); return; } shop = null; mode = 'walk'; msg = ''; trail = []; voyage = still() ? null : { art: R.boatArt(j.style, r.boat), name: st?.name || '', to: d.sail, t0: now(), dur: 1800 }; sayLive(r.text); if (!voyage) { announce(); arrive(d.sail); } drawPanel(); save(true); return; }
    if (d.petset !== undefined) { const [kind, id] = d.petset.split(':'); const m = j.party[menu?.who || 0]; R.setActive(j, m.id, kind, id || ''); armedRelease = ''; drawPanel(); save(true); return; }
    if (d.petrename) { const [kind, id] = d.petrename.split(':'); const m = j.party[menu?.who || 0]; const inp = panel.querySelector(`[data-petname="${globalThis.CSS?.escape ? globalThis.CSS.escape(d.petrename) : d.petrename}"]`); msg = R.renamePet(j, m.id, kind, id, inp?.value) ? 'Renamed.' : 'That name won\'t do.'; drawPanel(); save(true); return; }
    if (d.petgo) { if (armedRelease !== d.petgo) { armedRelease = d.petgo; msg = 'Press Let go again to release them into the wild. They won\'t come back.'; drawPanel(); return; } const [kind, id] = d.petgo.split(':'); const m = j.party[menu?.who || 0]; const r = R.release(j, m.id, kind, id); armedRelease = ''; msg = r.text; drawPanel(); if (r.ok) save(true); return; }
    if (d.key === 'fight') { fight(); return; }
    if (d.tab) { menu.tab = d.tab; drawPanel(); return; }
    if (d.who) { menu.who = Number(d.who); drawPanel(); return; }
    if (d.trainee) { shop.who2 = Number(d.trainee); drawPanel(); return; }
    if (d.learn) { const m = j.party[menu.who || 0]; msg = R.learn(m, d.learn) ? `${m.name} learns ${R.SKILLS[d.learn].name}.` : R.canLearn(m, d.learn); drawPanel(); save(true); return; }
    if (d.addclass) { const m = j.party[menu.who || 0]; msg = R.addClass(m, d.addclass) ? `${m.name} is now also a ${R.CLASSES[d.addclass].name}.` : R.canAddClass(m, d.addclass); drawPanel(); save(true); return; }
    if (d.cast) { const r = R.castField(j, j.party[menu.who || 0].id, d.cast, d.on); msg = r.text; drawPanel(); if (r.ok) save(true); return; }
    if (d.use) { const it = R.ITEMS[d.use]; const r = it?.scroll ? R.castField(j, d.on, d.use, d.on) : R.drinkOn(j, d.use, d.on); msg = r.text; drawPanel(); if (r.ok) save(true); return; }
    if (d.buy) { msg = R.buy(j, d.buy, shop?.mult || 1) ? `Bought: ${R.ITEMS[d.buy]?.name || R.kitName(d.buy)}.` : R.ITEMS[d.buy] && !R.bagRoom(j) ? 'The bag is full. A pet or a mount carries more.' : "You can't afford that."; drawPanel(); save(true); return; }
    if (d.sell) { const got = R.sell(j, d.sell); msg = got ? `Sold for ${R.fmtCoin(got)}.` : 'Someone is wearing that.'; drawPanel(); save(true); return; }
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
  function enterLobbyKeepPlace() { const at = { x: j.x, y: j.y, facing: j.facing }; j = R.newJourney({ seed: '', party: lobbyParty() }, world); Object.assign(j, at); trail = []; }
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
    if (e.key === 'Escape' || e.key === 'x' || e.key === 'X') { if (typing && e.key !== 'Escape') return; if (mode === 'menu' || mode === 'shop' || mode === 'walk') { e.preventDefault(); e.stopPropagation(); toggleMenu(); } return; }
    if (typing) return;
    if (mode === 'battle' && !talk) { // arrow keys move between the command buttons
      if (KEYS[e.key] && panel.contains(doc.activeElement)) { const bs = [...panel.querySelectorAll('.jy-cmds button:not([disabled])')]; const i = bs.indexOf(doc.activeElement); if (i >= 0) { e.preventDefault(); const n = bs[(i + (KEYS[e.key] === 'down' || KEYS[e.key] === 'right' ? 1 : bs.length - 1)) % bs.length]; n?.focus(); } }
      return;
    }
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
    doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('keyup', onKeyUp, true);
    if (frameReq) (globalThis.cancelAnimationFrame || clearTimeout)(frameReq);
  }

  enterLobby();
  talkTo(['Bob\'s Inn. A fire, a bar, a cat, and Bob behind it.', 'Walk about with the arrow keys. When you\'re ready, the buttons along the bottom roll a New adventure or Resume your saved one.']);
  loadSave();
  frame();
  return { stop, save, get journey() { return j; }, get world() { return world; }, get mode() { return mode; }, get lobby() { return lobby; }, startFight, walk: tryWalk, act, fight, rollNew, resume, rise, sink, ride: rideToggle };
}

globalThis.BobJourneyPlay = { mountJourney };
})();
