// 🧭 Journey v1.1: the screen. It opens in Bob's Inn, a tavern you walk around; the buttons along the bottom roll a
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
export function mountJourney(root, deps) {
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
  const lookCache = new Map();

  root.innerHTML = `<div class="jy" tabindex="-1">
    <div class="jy-top"><span class="jy-where" aria-live="polite"></span><span class="jy-gold"></span><span class="jy-spacer"></span>
      <button type="button" class="mini" data-jy="menu" title="Menu (Esc)">☰ Menu</button><button type="button" class="mini" data-jy="save" title="Save the journey">💾 Save</button><button type="button" class="icon" data-jy="close" aria-label="Close Journey">✕</button></div>
    <div class="jy-stage"><canvas class="jy-canvas" width="${W}" height="${H}" role="img" aria-label="The Journey screen"></canvas><div class="jy-box" role="status" aria-live="polite" hidden></div></div>
    <div class="jy-pad" aria-label="Walking pad"><button type="button" data-dir="up" aria-label="Walk up">▲</button><button type="button" data-dir="left" aria-label="Walk left">◀</button><button type="button" data-dir="down" aria-label="Walk down">▼</button><button type="button" data-dir="right" aria-label="Walk right">▶</button><button type="button" class="jy-a" data-key="act" aria-label="Talk or open (Enter)">A</button><button type="button" class="jy-f" data-key="fight" aria-label="Pick a fight (F)">⚔</button><button type="button" class="jy-b" data-key="menu" aria-label="Menu (Esc)">B</button></div>
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
  const TINTS = { swamp: '#5a7a3a', sand: '#d8b46a', ice: '#9ad8ff', moss: '#3d7f34', gold: '#ffd166', rust: '#a0522d', sea: '#3a78c8', war: '#8a2a2a', red: '#d0303a' };
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
    if (p) return lookFor(A.encodeParts({ ...p, armour: base(m.armour), weapon: base(m.weapon), shield: base(m.shield) }));
    return lookFor(id) || lookFor('robot-0');
  }
  const foeLook = (f) => (f.parts ? lookFor(A.encodeParts(f.parts)) : lookFor(deps.enemyLooks?.[f.type], f.tint) || lookFor(A.encodeParts({ body: 'blob', skin: '0' }), f.tint));
  const personLook = (p) => (p.role === 'keeper' ? lookFor(deps.bobLook) : lookFor(A.encodeParts(p.parts || {})));
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
  function tileCanvas(ch, frame = 0) {
    const key = `${ch}${frame}`;
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
    const building = (roof, wall, sign) => { fill('#b8a07a'); rect(1, 6, 14, 10, wall); g.fillStyle = roof; g.beginPath(); g.moveTo(0, 7); g.lineTo(8, 0); g.lineTo(16, 7); g.fill(); rect(7, 11, 3, 5, '#6b4423'); sign?.(); };
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
      default: fill('#000');
    }
    tileArt.set(key, c);
    return c;
  }
  const ANIMATED = new Set(['~', 'r', 'p']);
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
  async function loadSave() {
    try { const r = await deps.api('/api/adventure/journey'); saved = r?.journey ? R.cleanJourney(r.journey, Wm.makeWorld) : null; } catch (e) { msg = e.message; saved = null; }
    drawPanel();
  }
  async function save(quiet) {
    if (!j || lobby) return;
    try { await deps.api('/api/adventure/journey', { journey: j }); saved = j; if (!quiet) say('Saved. The land will wait for you.'); }
    catch (e) { say(`I couldn't save: ${e.message}`); }
  }
  // Who comes along: up to four, from your character, Bob and saved characters, each with a race and class to pick.
  const pickedIds = new Set();
  const choices = {}; // id -> { race, cls }
  (deps.party || []).slice(0, 2).forEach((p) => pickedIds.add(p.id));
  let newSize = 'medium';
  function lobbyParty() { const list = (deps.party || []).filter((p) => pickedIds.has(p.id)).slice(0, 4); return (list.length ? list : (deps.party || []).slice(0, 1)).map((p) => ({ ...p, ...(choices[p.id] || {}) })); }
  function enterLobby() {
    world = Wm.innOnly();
    j = R.newJourney({ seed: '', party: lobbyParty() }, world);
    lobby = true; trail = []; mode = 'walk';
    drawPanel();
  }
  function rollNew() {
    const seed = String(Date.now() % 1e9);
    world = Wm.makeWorld(seed, newSize);
    j = R.newJourney({ seed, size: newSize, party: lobbyParty() }, world);
    lobby = false; trail = []; shop = null; mode = 'walk';
    drawPanel();
    talkTo([`Bob: A new land's rolled out past my front door: ${Wm.SIZES[newSize].name.toLowerCase()}, by the look of it. ${R.questLine(world, j)}`, 'Arrow keys (or the pad) walk, Enter talks and opens things, F picks a fight, Esc opens the menu. The way out is the door at the bottom.']);
    save(true);
    focus();
  }
  function resume() {
    if (!saved) return;
    j = saved; world = Wm.makeWorld(j.seed, j.size);
    lobby = false; trail = []; shop = null; mode = 'walk';
    drawPanel();
    talkTo([`Welcome back. ${R.mapOf(world, j).name}. ${R.fmtCoin(j.coin)} in the purse.`]);
    focus();
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
  function talkTo(lines, then) { talk = { lines: lines.filter(Boolean).flatMap(pages), i: 0, shown: still() ? 1e9 : 0, then }; mode = mode === 'battle' ? 'battle' : 'talk'; showBox(); }
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
    armed = null;
    if (r.moved) {
      stepPhase = (stepPhase + 1) % 4;
      if (r.door) { trail = []; announce(); arrive(r.door); return; }
      trail.unshift({ x: from.x, y: from.y, facing: j.facing });
      trail = trail.slice(0, 4);
      anim = { from, t0: now(), dur: still() ? 0 : 150 };
      if (r.battle) setTimeout(() => startFight(r.battle, { helpers: r.helpers, chase: r.chase }), still() ? 0 : 170);
    } else if (r.bump?.kind === 'boss') bossTalk(r.bump.boss);
    else if (r.bump?.kind === 'closed') say('Bob: The door\'s stuck until you roll a New adventure. The buttons are along the bottom.');
  }
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
    root.querySelector('.jy-where').textContent = `${map.name}${zone}${R.isWanted?.(world, j) ? ' · ⚠ wanted' : ''}`;
  }
  function front() { const [dx, dy] = R.STEP[j.facing]; return R.thingAt(world, j, j.x + dx, j.y + dy); }
  function act() {
    if (mode === 'talk' || (mode === 'battle' && talk)) { advanceTalk(); return; }
    if (mode !== 'walk' || anim) return;
    const t = front();
    const [dx, dy] = R.STEP[j.facing];
    if (!t) {
      if (R.mapOf(world, j).rows[j.y + dy]?.[j.x + dx] === 'n') { shop = { kind: 'new' }; mode = 'shop'; drawPanel(); return; }
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
    const t = front();
    if (!t || t.kind !== 'person') { swing = { t0: now() }; return; }
    const p = t.person;
    if (R.PEACEFUL[p.role]) { say(R.PEACEFUL[p.role]); return; }
    if (armed !== p.id) { armed = p.id; say(`Pick a fight with ${p.title ? `${p.title} ${p.name}` : p.name}? ${['guard', 'knight', 'captain', 'ruler'].includes(p.role) ? 'The guard will come for you.' : 'The guards will remember.'} Press F (or ⚔) again to fight.`); return; }
    armed = null;
    const r = R.attackPerson(world, j, p);
    if (r.refused) { say(r.refused); return; }
    p.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[j.facing];
    startFight(r.battle, { site: r.site, zone: r.zone, people: true });
  }
  function personTalk(p) {
    p.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[j.facing];
    const name = p.title ? `${p.title} ${p.name}` : p.name;
    const wanted = R.isWanted(world, j);
    const map = R.mapOf(world, j);
    const tier = map.kind;
    const open = (kind, line) => talkTo([`${name}: ${line}`], () => { shop = { kind, who: name, person: p, tier }; mode = 'shop'; drawPanel(); });
    if (p.role === 'keeper') {
      if (lobby) { talkTo(['Bob: Welcome to my inn. Sit anywhere that isn\'t on fire.', 'Bob: When you\'re ready for the road, the buttons along the bottom roll a New adventure, or Resume the one you saved. The notice board by the door does the same.']); return; }
      open('inn', `Back again! A bed is ${R.fmtCoin(R.INN_PRICE)} for the whole party. ${R.questLine(world, j)}`); return;
    }
    if (p.role === 'cat') { talkTo(['Patches: Mrrp.']); return; }
    if (wanted && ['inn', 'shop', 'smith', 'priest', 'trainer', 'peddler'].includes(p.role)) { talkTo([`${name}: I don't serve your sort. Pay your fine to a guard first.`]); return; }
    if (wanted && ['guard', 'knight', 'captain'].includes(p.role)) { const key = map.kind === 'world' ? 'world' : map.site || map.id; open('fine', `You're wanted here. The fine is ${R.fmtCoin(R.fineFor(world, j, key))}. Pay up, or we do this the hard way.`); return; }
    if (p.role === 'ruler') { talkTo([`${name}: ${R.questLine(world, j)}`]); return; }
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
    battle = { b, picks: {}, who: 0, stage: 'act', queue: [], busy: false, t0: now(), anim: null, fx: [], where: R.mapOf(world, j).kind, land: R.mapOf(world, j).rows[j.y]?.[j.x] };
    mode = 'battle';
    const names = b.foes.map((f) => f.name);
    battle.intro = opts.spar ? `${names[0]} squares up for a friendly bout.` : opts.chase ? `${names.join(' and ')} catch${names.length > 1 ? '' : 'es'} up with you!` : `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]} ${b.guardian ? 'blocks the way!' : b.people ? (names.length > 1 ? 'square up!' : 'squares up!') : names.length > 1 ? 'jump out!' : 'jumps out!'}`;
    if (b.allies.length) battle.intro += ` ${b.allies.map((a) => a.name).join(' and ')} from the patrol join${b.allies.length > 1 ? '' : 's'} in!`;
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
      for (const u of r.ups) lines.push(`${u.name} is now level ${u.level}! +${u.hp} health, +${u.sp} spirit${u.stat ? `, +1 ${R.STAT_NAMES[u.stat]}` : ''}, and a skill point to spend in Skills.${u.newClass ? ` They can take a ${u.newClass} class now, in Skills.` : ''}`);
      const boss = b.foes.find((f) => f.guardian);
      if (boss) {
        reward(boss.id);
        if (R.LANTERN_KEEPERS.includes(boss.id)) lines.push(`${boss.name} drops a lantern stone. ${R.LANTERN_KEEPERS.filter((g) => j.beaten.includes(g)).length} of 3 back home.`);
        if (j.won && R.LANTERN_KEEPERS.includes(boss.id)) lines.push('That was the last keeper. Take the news to the castle, or to Bob!');
      }
      const felled = b.foes.filter((f) => f.person && !f.fled);
      if (felled.some((f) => f.role === 'ruler')) lines.push('The castle will not forget this.');
      lastLoot = [...(r.coin ? [{ coin: r.coin }] : []), ...r.drops.map((k) => ({ kit: k })), ...r.items.map((i) => ({ item: i }))];
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
  function sayLive(text) { const p = root.querySelector('.jy-msg'); if (p) p.textContent = text; }

  // One event, animated: the attacker steps in and swings, the target flashes, a number floats up.
  function animate(e) {
    sayLive(e.text);
    if (still()) { if (e.dmg || e.heal || e.miss) pop(e); return Promise.resolve(); }
    return new Promise((done) => {
      const isFight = ['fight', 'skill', 'hit', 'curse', 'breath', 'item', 'spell'].includes(e.act);
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
    (battle.b.allies || []).forEach((a, i) => out.set(a.key, { x: 212, y: 40 + i * 60, w: 24, h: 30, scale: 1.5, side: 'ally' }));
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
  function drawWorld(t) {
    const map = R.mapOf(world, j);
    let p = 1;
    if (anim) { p = anim.dur ? Math.min(1, (t - anim.t0) / anim.dur) : 1; if (p >= 1) anim = null; }
    const from = anim?.from || { x: j.x, y: j.y };
    const lx = (from.x + (j.x - from.x) * p) * TILE, ly = (from.y + (j.y - from.y) * p) * TILE;
    const { cx, cy } = camera(lx, ly, map);
    ctx.fillStyle = map.kind === 'world' ? '#2a5aa8' : '#14110f'; ctx.fillRect(0, 0, W, H);
    const tick2 = Math.floor(t / 500) % 2;
    const x0 = Math.floor(cx / TILE), y0 = Math.floor(cy / TILE);
    for (let y = y0; y <= y0 + VIEW_H; y++) for (let x = x0; x <= x0 + VIEW_W; x++) {
      const ch = map.rows[y]?.[x]; if (!ch) continue;
      ctx.drawImage(tileCanvas(ch, ANIMATED.has(ch) && !still() ? tick2 : 0), x * TILE - cx, y * TILE - cy);
    }
    for (const c of map.chests) drawChest(c.x * TILE - cx, c.y * TILE - cy, j.opened.includes(`${map.id}:${c.id}`), c.loot !== 'gift' && /deep|hoard/.test(c.loot));
    // Everyone who stands on the map, back to front so the lower ones overlap the higher.
    const figs = [];
    if (map.boss && !j.beaten.includes(map.boss.id)) { const f = R.foe(map.boss.id); figs.push({ y: map.boss.y * TILE, draw: () => drawFig(foeLook(f), map.boss.x * TILE - cx - 4, map.boss.y * TILE - cy - 12, 1.5, { facing: 'down', step: Math.floor(t / 400) % 4 }) }); }
    for (const q of R.peopleOn(world, j, map)) {
      if (q.x * TILE - cx < -TILE || q.x * TILE - cx > W || q.y * TILE - cy < -TILE * 2 || q.y * TILE - cy > H + TILE) continue;
      const qx = q.x * TILE - cx, qy = q.y * TILE - cy - 4, small = q.role === 'cat';
      figs.push({ y: q.y * TILE, draw: () => { drawFig(personLook(q), qx + (small ? 3 : 0), qy + (small ? 6 : 0), small ? 0.6 : 1, { facing: q.facing || 'down', step: q.route ? stepPhase : 0 }); if (q.crown) extras(qx, qy, 1, { crown: true }); } });
    }
    const walking = Boolean(anim) || (held && mode === 'walk');
    j.party.forEach((m, i) => {
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
      const fx = Math.round(x - cx), fy = Math.round(y - cy - 4), pix = m.race === 'pixie' ? 0.85 : 1;
      figs.push({ y: y + i * 0.01, draw: () => { drawFig(memberLook(m), fx + (pix < 1 ? 1 : 0), fy + (pix < 1 ? 3 : 0), pix, { facing, step, weapon: base(m.weapon), shield: base(m.shield), angle }); extras(fx, fy, pix, { ...memberExtras(m), flap: Math.floor(t / 150) % 2 }); } });
    });
    figs.sort((a, b) => a.y - b.y).forEach((f) => f.draw());
    if (lastLoot && t - lastLootAt < 2200) drawLoot(t);
    if (talk) drawTalk(t);
    root.querySelector('.jy-gold').textContent = lobby ? '' : `🪙 ${R.fmtCoin(j.coin, true)}`;
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
  function drawBattle(t) {
    backdrop();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const [id, s] of spots()) { const f = battle.b.foes.find((x) => x.key === id) || battle.b.allies.find((x) => x.key === id); if (f && f.hp <= 0) continue; ctx.beginPath(); ctx.ellipse(s.x + s.w / 2, s.y + s.h - 1, s.w / 2.6, 3, 0, 0, Math.PI * 2); ctx.fill(); }
    const sp = spots();
    const a = battle.anim, e = a?.e;
    const p = a ? Math.min(1, (t - a.t0) / a.dur) : 0;
    const shove = (id) => { if (!e || e.who !== id || !['fight', 'skill', 'hit', 'curse', 'item'].includes(e.act)) return 0; const k = p < 0.3 ? p / 0.3 : p > 0.75 ? (1 - p) / 0.25 : 1; return Math.round(k * 18); };
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
      drawFig(memberLook(m), fx, fy, 2, { facing: down ? 'up' : facing, step: win ? Math.floor(t / 120) % 4 : 0, weapon: base(m.weapon), shield: base(m.shield), angle: down ? undefined : angle, flash: hitNow(m.id), alpha: down ? 0.45 : 1 });
      if (!down) extras(fx, fy, 2, { ...memberExtras(m), flap: Math.floor(t / 150) % 2 });
      if (picking && Math.floor(t / 300) % 2) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(s.x - 14, s.y + 16); ctx.lineTo(s.x - 9, s.y + 20); ctx.lineTo(s.x - 14, s.y + 24); ctx.fill(); }
    });
    for (const al of battle.b.allies || []) { const s = sp.get(al.key); if (al.hp <= 0) continue; drawFig(foeLook(al), s.x - shove(al.key), s.y, s.scale, { facing: 'left', weapon: base(al.kit.weapon), shield: base(al.kit.shield), angle: swingAt(al.key, 'left'), flash: hitNow(al.key) }); }
    // Spells: a bolt flies from the caster, then a burst of sparks in the spell's colour on the target.
    if (e && e.element && p > 0.1) {
      const from = sp.get(e.who), to = sp.get(e.target);
      ctx.fillStyle = ELEMENT_COLOURS[e.element] || '#ffffff';
      if (from && to && p < 0.45 && from !== to) { const k = (p - 0.1) / 0.35; const bx = from.x + (to.x + to.w / 2 - from.x) * k, by = from.y + 16 + (to.y + to.h / 2 - from.y - 16) * k; for (let n = 0; n < 4; n++) ctx.fillRect(Math.round(bx - n * 3 * Math.sign(to.x - from.x)), Math.round(by), 3 - (n > 1 ? 1 : 0), 3 - (n > 1 ? 1 : 0)); }
      if (to && p >= 0.4) for (let k = 0; k < 16; k++) { const ang = k * 0.9 + t / 120, r = 4 + ((p - 0.4) * 40 + k * 3) % 18; ctx.fillRect(Math.round(to.x + to.w / 2 + Math.cos(ang) * r), Math.round(to.y + to.h / 2 + Math.sin(ang) * r), 2, 2); }
      if (e.element === 'star' && p > 0.3) for (let k = 0; k < 10; k++) ctx.fillRect(Math.round((k * 37 + p * 200) % 130), Math.round(((p - 0.3) * 260 + k * 17) % H), 2, 4);
    }
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
    root.querySelector('.jy-msg').textContent = msg;
    if (!j) { panel.innerHTML = ''; return; }
    announce();
    if (mode === 'battle' && battle) { panel.innerHTML = battleHtml(); panel.querySelector('button:not([disabled])')?.focus({ preventScroll: true }); return; }
    if (mode === 'menu' && menu) { panel.innerHTML = menuHtml(); mountDolls(); return; }
    if (mode === 'shop' && shop) { panel.innerHTML = shopHtml(); panel.querySelector('button')?.focus({ preventScroll: true }); return; }
    const atInn = j.at === 'inn';
    panel.innerHTML = `<ul class="jy-party">${j.party.map((m) => sheet(m)).join('')}</ul>${atInn ? innButtons() : ''}<p class="muted jy-keys">Arrow keys walk · Enter talks and opens chests · F picks a fight · Esc opens the menu</p>`;
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
      <label>Size of the land <select data-size>${Object.entries(Wm.SIZES).map(([id, s]) => `<option value="${id}" ${newSize === id ? 'selected' : ''}>${s.name} (${s.w}×${s.h})</option>`).join('')}</select></label>
      <div class="row"><button type="button" class="yes" data-jy="roll">🎲 Roll the land</button><button type="button" data-shop="leave">Not yet</button></div>
      <p class="muted">Every land is new: seas, rivers, mountains, forests, swamps and deserts; hamlets, villages, towns and a castle on the roads; caves, dungeons and a hermit out in the wild. No brain needed.</p></div>`;
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
    const tabs = [['party', '👥 Party'], ['skills', '✨ Skills'], ['kit', '🧍 Kit'], ['bag', '🎒 Bag'], ['save', '💾 Save']];
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
    if (menu.tab === 'bag') {
      const items = Object.entries(j.bag).filter(([, n]) => n > 0);
      return `${head}${items.length ? `<ul class="jy-bag">${items.map(([id, n]) => { const it = R.ITEMS[id]; const usable = it.field; return `<li><strong>${esc(it.name)}</strong> ×${n} <span class="muted">${esc(it.what)}</span> ${usable ? j.party.map((x) => `<button type="button" class="mini" data-use="${id}" data-on="${esc(x.id)}">${esc(x.name)}</button>`).join('') : '<span class="muted">(in a fight)</span>'}</li>`; }).join('')}</ul>` : '<p class="muted">The bag is empty.</p>'}`;
    }
    return `${head}<div class="row"><button type="button" class="yes" data-jy="save">💾 Save now</button><button type="button" data-jy="leave">🚪 Save and leave</button></div><p class="muted">The journey also saves itself after every chest and every fight. Seed ${esc(j.seed)} · ${esc(Wm.SIZES[j.size]?.name || '')}</p>`;
  }
  function shopHtml() {
    if (shop.kind === 'new') return newHtml();
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
    const list = ids.map((id) => (R.ITEMS[id] ? [id, R.ITEMS[id].name, R.priceOf(j, id), R.ITEMS[id].what, false] : [id, R.kitName(id), R.priceOf(j, id), R.kitWords(id), j.owned[R.kitKind(id)].includes(id)]));
    const sellable = shop.kind === 'smith' ? ['weapon', 'armour', 'shield'].flatMap((k) => j.owned[k].filter((key) => !j.party.some((m) => m[k] === key))) : [];
    return `<p><strong>${esc(shop.who)}</strong> · ${purse}</p>${buyList(list)}${sellable.length ? `<p><strong>Sell</strong> <span class="muted">(kit nobody is wearing, for a third of its price)</span></p><ul class="jy-bag">${sellable.map((key) => `<li><button type="button" data-sell="${esc(key)}">${esc(R.kitName(key))} · ${esc(R.fmtCoin(Math.round(R.kitPrice(key) / 3), true))}</button></li>`).join('')}</ul>` : ''}${leave}`;
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
    if (d.key === 'fight') { fight(); return; }
    if (d.tab) { menu.tab = d.tab; drawPanel(); return; }
    if (d.who) { menu.who = Number(d.who); drawPanel(); return; }
    if (d.trainee) { shop.who2 = Number(d.trainee); drawPanel(); return; }
    if (d.learn) { const m = j.party[menu.who || 0]; msg = R.learn(m, d.learn) ? `${m.name} learns ${R.SKILLS[d.learn].name}.` : R.canLearn(m, d.learn); drawPanel(); save(true); return; }
    if (d.addclass) { const m = j.party[menu.who || 0]; msg = R.addClass(m, d.addclass) ? `${m.name} is now also a ${R.CLASSES[d.addclass].name}.` : R.canAddClass(m, d.addclass); drawPanel(); save(true); return; }
    if (d.cast) { const r = R.castField(j, j.party[menu.who || 0].id, d.cast, d.on); msg = r.text; drawPanel(); if (r.ok) save(true); return; }
    if (d.use) { const it = R.ITEMS[d.use]; const r = it?.scroll ? R.castField(j, d.on, d.use, d.on) : R.drinkOn(j, d.use, d.on); msg = r.text; drawPanel(); if (r.ok) save(true); return; }
    if (d.buy) { msg = R.buy(j, d.buy) ? `Bought: ${R.ITEMS[d.buy]?.name || R.kitName(d.buy)}.` : "You can't afford that."; drawPanel(); save(true); return; }
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
        battle.act = { act: 'item', item: d.item, side: it.fire || (spell && spell.kind === 'hit') ? 'foe' : 'party', down: Boolean(it.revive || spell?.kind === 'revive') };
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
    if (sz) { newSize = Wm.SIZES[sz.value] ? sz.value : 'medium'; return; }
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
    closed = true; clearInterval(dollTimer);
    doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('keyup', onKeyUp, true);
    if (frameReq) (globalThis.cancelAnimationFrame || clearTimeout)(frameReq);
  }

  enterLobby();
  talkTo(['Bob\'s Inn. A fire, a bar, a cat, and Bob behind it.', 'Walk about with the arrow keys. When you\'re ready, the buttons along the bottom roll a New adventure or Resume your saved one.']);
  loadSave();
  frame();
  return { stop, save, get journey() { return j; }, get world() { return world; }, get mode() { return mode; }, get lobby() { return lobby; }, startFight, walk: tryWalk, act, fight, rollNew, resume };
}
