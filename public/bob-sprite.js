import { avatar } from './avatars.js';

// Pixel-art Bob in several looks, each drawn from a 16x16 map. Rows 0-2 are the top of the head
// (the "lid" the brain-swap machine lifts). In every look, E = eyes (blink swaps them for the
// look's blink colour) and X = mouth (talking swaps it for O).
export const LOOKS = {
  sysop: {
    name: 'Sysop', what: 'Hoodie, headset and glowing glasses. Runs the servers in the back room.',
    palette: { H: '#23232c', K: '#14161c', G: '#3fd0ff', S: '#f0c49a', L: '#c9946a', E: '#1b2a33', N: '#e0a57a', X: '#6b2f22', O: '#3a1410', A: '#9aa3ad', P: '#2f3b4f', Q: '#24303f', D: '#e7a64a', R: '#e89a8a' },
    blinkTo: 'G',
    map: [
      '................',
      '....HHHHHHHH....',
      '..KHHHHHHHHHHK..',
      '..KHSSSSSSSSHK..',
      '..KSSSSSSSSSSK..',
      '..KGGGGSSGGGGK..',
      '..AGEGGSSGGEGS..',
      '..ASSSSNNSSSS...',
      '...ASRSSSSRSS...',
      '....AASXXSSS....',
      '.....SSSSSS.....',
      '...PPPQSSQPPP...',
      '..PPPPPQQPPPPP..',
      '..SPPPDPPDPPPS..',
      '...PPPDPPDPPP...',
      '...PPPPPPPPPP...'
    ]
  },
  bot: {
    name: 'Bot', what: 'A little robot body with a monitor for a face.',
    palette: { A: '#e7a64a', C: '#8d97a3', D: '#5d6670', K: '#0e1a14', E: '#7dff9a', L: '#0e1a14', X: '#7dff9a', O: '#c8ffd4', W: '#b9c2cc', T: '#5d6670', R: '#ff6b5a', G: '#7dff9a', Y: '#ffd166' },
    blinkTo: 'L',
    map: [
      '.......A........',
      '.......D........',
      '..CCCCCCCCCCCC..',
      '..CKKKKKKKKKKC..',
      '..CKKKKKKKKKKC..',
      '..CKKEEKKEEKKC..',
      '..CKKEEKKEEKKC..',
      '..CKKKKKKKKKKC..',
      '..CKKKXXXXKKKC..',
      '..CCCCCCCCCCCC..',
      '......DDDD......',
      '...WWWWWWWWWW...',
      '..WWWTRGYGRTWW..',
      '..DWWTTTTTTWWD..',
      '...WWWWWWWWWW...',
      '...WW......WW...'
    ]
  },
  holo: {
    name: 'Hologram', what: 'A wireframe projection, like the MouseWurX logo.',
    palette: { C: '#5ce1ff', D: '#2a7f96', E: '#e8fbff', L: '#2a7f96', X: '#5ce1ff', O: '#e8fbff', F: '#e7a64a' },
    blinkTo: 'L',
    map: [
      '................',
      '.....CCCCCC.....',
      '....CD....DC....',
      '...C........C...',
      '...C........C...',
      '...C.EE..EE.C...',
      '...D........D...',
      '...C...DD...C...',
      '...C..XXXX..C...',
      '....C......C....',
      '.....CCCCCC.....',
      '......D..D......',
      '...CCCCFFCCCC...',
      '..D...D..D...D..',
      '..C...D..D...C..',
      '..CDDDDDDDDDDC..'
    ]
  },
  cyber: {
    name: 'Cyber barkeep', what: 'Neon undercut, visor, and a light-up apron.',
    palette: { H: '#ff4fa3', K: '#2a1a2e', S: '#e8b48c', L: '#3fd0ff', V: '#163a4a', E: '#3fd0ff', N: '#d39a72', X: '#6b2f22', O: '#3a1410', B: '#1e1b2e', W: '#2c2a40', T: '#ff4fa3', G: '#3fd0ff', M: '#9aa3ad' },
    blinkTo: 'V',
    map: [
      '.......HH.......',
      '......HHHH......',
      '...KKHHHHHHKK...',
      '...KSSSSSSSSK...',
      '...SSSSSSSSSS...',
      '..VVVVVVVVVVVV..',
      '..VVEEVVVVEEVV..',
      '...SSSSNNSSSS...',
      '...SSSSSSSSSS...',
      '....SSSXXSSS....',
      '.....SSSSSS.....',
      '...BBTWWWWTBB...',
      '..BBBTWGGWTBBB..',
      '..MBBWWWWWWBBS..',
      '...BBTGTTGTBB...',
      '...BBWWWWWWBB...'
    ]
  },
  innkeeper: {
    name: 'Innkeeper', what: 'The first look: apron and mustache.',
    palette: { H: '#5b3a1e', S: '#f0c49a', L: '#c9946a', E: '#2a1a10', N: '#e0a57a', M: '#7a4a24', X: '#6b2f22', O: '#3a1410', R: '#e89a8a', B: '#4a6b8a', W: '#efe6d2', T: '#b5893e' },
    blinkTo: 'L',
    map: [
      '................',
      '....HHHHHHHH....',
      '...HHHHHHHHHH...',
      '...HSSSSSSSSH...',
      '...SSSSSSSSSS...',
      '...SSESSSSESS...',
      '..SSSSSSSSSSSS..',
      '...SRSSNNSSRS...',
      '...SMMMMMMMMS...',
      '....SSSXXSSS....',
      '.....SSSSSS.....',
      '...BBTWWWWTBB...',
      '..BBBTWWWWTBBB..',
      '..SBBWWWWWWBBS..',
      '...BBTTTTTTBB...',
      '...BBWWWWWWBB...'
    ]
  }
};

export const DEFAULT_LOOK = 'sysop';
// Live bindings: the brain-swap machine reads these, so it always draws the current look.
export let LOOK_ID = DEFAULT_LOOK;
export let BOB = LOOKS[DEFAULT_LOOK].map;
export let PALETTE = LOOKS[DEFAULT_LOOK].palette;

// A look is one of Bob's own (above) or any avatar from avatars.js ("m-3", "robot-7", ...).
export function getLook(id) { return LOOKS[id] || (id && avatar(id)) || null; }

export function setLook(id) {
  if (!getLook(id)) id = DEFAULT_LOOK;
  const look = getLook(id);
  LOOK_ID = id;
  BOB = look.map;
  PALETTE = look.palette;
  return id;
}

// frame: { blink, talk, look, wink }. look -1/0/1 moves the eyes one pixel left/right (only onto the face, never off it);
// wink closes the eyes on the right half of the face.
export function frameRows({ blink = false, talk = false, look = 0, wink = false } = {}, look_ = getLook(LOOK_ID)) {
  return look_.map.map((row) => {
    let r = row;
    if (look && !blink) r = glance(r, look > 0 ? 1 : -1);
    if (blink) r = r.replace(/E/g, look_.blinkTo);
    else if (wink) r = [...r].map((ch, x) => (ch === 'E' && x >= 8 ? look_.blinkTo : ch)).join('');
    if (talk) r = r.replace(/X/g, 'O');
    return r;
  });
}

// Shifts each run of eye pixels one step; the face pixel it moves onto fills the gap it leaves. If any run would
// land on empty space or another eye, the row stays as it was (so odd faces never break).
export function glance(row, dx) {
  const runs = [...row.matchAll(/E+/g)].map((m) => [m.index, m.index + m[0].length - 1]);
  if (!runs.length) return row;
  const out = [...row];
  for (const [a, b] of runs) {
    const to = dx > 0 ? b + 1 : a - 1;
    const ch = row[to];
    if (!ch || ch === '.' || ch === 'E') return row;
    for (let x = a; x <= b; x++) out[x + dx] = 'E';
    out[dx > 0 ? a : b] = ch;
  }
  return out.join('');
}

// frame.head > 1 draws a bigger head on a smaller body (a second brain beside the first). Rows 0-10 are the head
// in every look and avatar, rows 11-15 the body; the whole figure still fits the same square.
export function drawBob(ctx, size, frame, lookId) {
  const look = getLook(lookId) || getLook(LOOK_ID);
  const rows = frameRows(frame, look);
  const px = size / 16;
  const head = Math.max(1, Math.min(1.3, frame?.head || 1));
  ctx.clearRect(0, 0, size, size);
  if (head === 1) {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = look.palette[ch];
        ctx.fillRect(Math.floor(x * px), Math.floor(y * px), Math.ceil(px), Math.ceil(px));
      });
    });
    return;
  }
  const hp = px * head, bp = (size - 11 * hp) / 5; // head pixel and body pixel sizes
  const neck = 11 * hp, hx = (size - 16 * hp) / 2, bx = (size - 16 * bp) / 2;
  rows.forEach((row, y) => {
    const p = y < 11 ? hp : bp, ox = y < 11 ? hx : bx, oy = y < 11 ? y * hp : neck + (y - 11) * bp;
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = look.palette[ch];
      ctx.fillRect(Math.floor(ox + x * p), Math.floor(oy), Math.ceil(p), Math.ceil(p));
    });
  });
}
