// 🧩 Games, Chess with Bob (item 123): the app knows the rules and plays the moves; Bob only chats about the game.
// Every move you make is checked here (castling, en passant, promotion, check, mate, stalemate, the draws), and Bob's
// moves come from a small search whose strength you set, not from the brain, so a small brain can't make an illegal
// move or "forget" where a piece is. No outside code: a plain board of 64 squares, a1 = 0, h8 = 63.
const FILES = 'abcdefgh';
export const sq = (name) => FILES.indexOf(name[0]) + 8 * (Number(name[1]) - 1);
export const sqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
const white = (p) => p && p === p.toUpperCase();
const colour = (p) => (p ? (white(p) ? 'w' : 'b') : '');
const fileOf = (i) => i & 7, rankOf = (i) => i >> 3;
const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// A position from FEN (the usual chess notation). Squares hold '' or a letter: upper case white, lower case black.
export function fromFen(fen = START) {
  const [rows, turn = 'w', castle = '-', ep = '-', half = '0', full = '1'] = String(fen).trim().split(/\s+/);
  const board = Array(64).fill('');
  const ranks = rows.split('/');
  if (ranks.length !== 8) throw new Error('Not a chess position.');
  ranks.forEach((row, k) => {
    let f = 0; const r = 7 - k;
    for (const c of row) { if (/\d/.test(c)) f += Number(c); else { if (!/[pnbrqk]/i.test(c) || f > 7) throw new Error('Not a chess position.'); board[r * 8 + f] = c; f++; } }
  });
  return { board, turn: turn === 'b' ? 'b' : 'w', castle: castle === '-' ? '' : castle, ep: ep === '-' ? -1 : sq(ep), half: Number(half) || 0, full: Number(full) || 1 };
}
export function toFen(s) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', gap = 0;
    for (let f = 0; f < 8; f++) { const p = s.board[r * 8 + f]; if (!p) gap++; else { if (gap) row += gap; gap = 0; row += p; } }
    rows.push(row + (gap || ''));
  }
  return `${rows.join('/')} ${s.turn} ${s.castle || '-'} ${s.ep >= 0 ? sqName(s.ep) : '-'} ${s.half} ${s.full}`;
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// Is square i attacked by side `by` ('w' or 'b')?
export function attacked(board, i, by) {
  const f = fileOf(i), r = rankOf(i);
  const is = (ff, rr, set) => { if (!onBoard(ff, rr)) return false; const p = board[rr * 8 + ff]; return p && colour(p) === by && set.includes(p.toLowerCase()); };
  const dir = by === 'w' ? -1 : 1; // a white pawn attacks upwards, so it sits below
  if (is(f - 1, r + dir, 'p') || is(f + 1, r + dir, 'p')) return true;
  for (const [a, b] of KNIGHT) if (is(f + a, r + b, 'n')) return true;
  for (const [a, b] of KING) if (is(f + a, r + b, 'k')) return true;
  const slide = (dirs, set) => {
    for (const [a, b] of dirs) {
      let ff = f + a, rr = r + b;
      while (onBoard(ff, rr)) { const p = board[rr * 8 + ff]; if (p) { if (colour(p) === by && set.includes(p.toLowerCase())) return true; break; } ff += a; rr += b; }
    }
    return false;
  };
  return slide(ROOK, 'rq') || slide(BISHOP, 'bq');
}
const kingAt = (board, side) => board.findIndex((p) => p === (side === 'w' ? 'K' : 'k'));
export const inCheck = (s, side = s.turn) => { const k = kingAt(s.board, side); return k >= 0 && attacked(s.board, k, side === 'w' ? 'b' : 'w'); };

// Every move that follows the piece's way of moving, before checking whether it leaves the king in check.
function pseudo(s) {
  const out = [], b = s.board, me = s.turn, them = me === 'w' ? 'b' : 'w';
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || colour(p) !== me) continue;
    const t = p.toLowerCase(), f = fileOf(i), r = rankOf(i);
    const add = (to, extra = {}) => out.push({ from: i, to, piece: p, cap: b[to] || '', ...extra });
    if (t === 'p') {
      const d = me === 'w' ? 1 : -1, home = me === 'w' ? 1 : 6, last = me === 'w' ? 7 : 0;
      const push = (to, extra) => { if (rankOf(to) === last) for (const q of 'qrbn') add(to, { ...extra, promo: q }); else add(to, extra); };
      const one = i + 8 * d;
      if (onBoard(f, r + d) && !b[one]) { push(one); if (r === home && !b[one + 8 * d]) add(one + 8 * d, { double: true }); }
      for (const df of [-1, 1]) {
        if (!onBoard(f + df, r + d)) continue;
        const to = (r + d) * 8 + f + df;
        if (b[to] && colour(b[to]) === them) push(to);
        else if (to === s.ep) add(to, { ep: true, cap: me === 'w' ? 'p' : 'P' });
      }
      continue;
    }
    const steps = t === 'n' ? KNIGHT : t === 'k' ? KING : null;
    if (steps) { for (const [a, c] of steps) { if (!onBoard(f + a, r + c)) continue; const to = (r + c) * 8 + f + a; if (!b[to] || colour(b[to]) === them) add(to); } }
    else {
      const dirs = t === 'r' ? ROOK : t === 'b' ? BISHOP : [...ROOK, ...BISHOP];
      for (const [a, c] of dirs) {
        let ff = f + a, rr = r + c;
        while (onBoard(ff, rr)) { const to = rr * 8 + ff; if (b[to]) { if (colour(b[to]) === them) add(to); break; } add(to); ff += a; rr += c; }
      }
    }
    if (t === 'k') { // castling: rights kept, squares between empty, king not in, through or into check
      const rank = me === 'w' ? 0 : 7, K = me === 'w' ? 'K' : 'k', Q = me === 'w' ? 'Q' : 'q', R = me === 'w' ? 'R' : 'r';
      if (i === rank * 8 + 4 && !attacked(b, i, them)) {
        if (s.castle.includes(K) && b[rank * 8 + 7] === R && !b[rank * 8 + 5] && !b[rank * 8 + 6] && !attacked(b, rank * 8 + 5, them) && !attacked(b, rank * 8 + 6, them)) add(rank * 8 + 6, { castle: 'k' });
        if (s.castle.includes(Q) && b[rank * 8] === R && !b[rank * 8 + 1] && !b[rank * 8 + 2] && !b[rank * 8 + 3] && !attacked(b, rank * 8 + 3, them) && !attacked(b, rank * 8 + 2, them)) add(rank * 8 + 2, { castle: 'q' });
      }
    }
  }
  return out;
}
// The position after a move (the move is assumed to follow the rules; use legalMoves to get one).
export function play(s, m) {
  const b = [...s.board];
  const me = s.turn;
  b[m.to] = m.promo ? (me === 'w' ? m.promo.toUpperCase() : m.promo) : m.piece;
  b[m.from] = '';
  if (m.ep) b[m.to + (me === 'w' ? -8 : 8)] = '';
  if (m.castle) { const rank = me === 'w' ? 0 : 7; const [rf, rt] = m.castle === 'k' ? [7, 5] : [0, 3]; b[rank * 8 + rt] = b[rank * 8 + rf]; b[rank * 8 + rf] = ''; }
  let castle = s.castle;
  const drop = (chars) => { for (const c of chars) castle = castle.replace(c, ''); };
  if (m.piece === 'K') drop('KQ'); if (m.piece === 'k') drop('kq');
  for (const at of [m.from, m.to]) { if (at === 0) drop('Q'); if (at === 7) drop('K'); if (at === 56) drop('q'); if (at === 63) drop('k'); }
  return {
    board: b, turn: me === 'w' ? 'b' : 'w', castle, ep: m.double ? (m.from + m.to) / 2 : -1,
    half: m.piece.toLowerCase() === 'p' || m.cap ? 0 : s.half + 1, full: s.full + (me === 'b' ? 1 : 0)
  };
}
export function legalMoves(s) { return pseudo(s).filter((m) => !inCheck(play(s, m), s.turn)); }

// Standard short notation (Nf3, exd5, O-O, e8=Q+, Qxf7#).
export function san(s, m, legal = legalMoves(s)) {
  let out;
  if (m.castle) out = m.castle === 'k' ? 'O-O' : 'O-O-O';
  else {
    const t = m.piece.toUpperCase();
    const capture = m.cap ? 'x' : '';
    if (t === 'P') out = (capture ? FILES[fileOf(m.from)] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
    else {
      const twins = legal.filter((x) => x.piece === m.piece && x.to === m.to && x.from !== m.from);
      let dis = '';
      if (twins.length) {
        if (!twins.some((x) => fileOf(x.from) === fileOf(m.from))) dis = FILES[fileOf(m.from)];
        else if (!twins.some((x) => rankOf(x.from) === rankOf(m.from))) dis = String(rankOf(m.from) + 1);
        else dis = sqName(m.from);
      }
      out = t + dis + capture + sqName(m.to);
    }
  }
  const after = play(s, m);
  if (inCheck(after)) out += legalMoves(after).length ? '+' : '#';
  return out;
}
// Read a move the way people type it: e2e4, e7e8q, Nf3, exd5, O-O, 0-0-0. Returns the legal move or null.
export function parseMove(s, text, legal = legalMoves(s)) {
  const t = String(text || '').trim().replace(/[+#!?]+$/, '').replace(/0/g, 'O');
  if (!t) return null;
  const long = /^([a-h][1-8])\s*[-x]?\s*([a-h][1-8])\s*=?\s*([qrbnQRBN])?$/.exec(t);
  if (long) {
    const from = sq(long[1]), to = sq(long[2]), promo = long[3] ? long[3].toLowerCase() : '';
    return legal.find((m) => m.from === from && m.to === to && (m.promo || '') === (m.promo ? promo || 'q' : '')) || null;
  }
  // A piece letter typed small (nf3, qh5) still counts; b stays a pawn on the b file unless that isn't a move.
  const names = legal.map((m) => [m, san(s, m, legal).replace(/[+#]$/, '')]);
  const exact = names.find(([, n]) => n === t);
  if (exact) return exact[0];
  const up = t[0].toUpperCase() + t.slice(1);
  return (/^[nrqkb]/.test(t) && names.find(([, n]) => n === up)?.[0]) || null;
}

// Why the game is over, or '' while it goes on. Checkmate, stalemate, the fifty-move rule, not enough pieces to mate,
// and the same position three times (history = the FEN of each earlier position, without the move counters).
export function outcome(s, history = []) {
  const legal = legalMoves(s);
  if (!legal.length) return inCheck(s) ? 'checkmate' : 'stalemate';
  if (s.half >= 100) return 'fifty';
  const left = s.board.filter((p) => p && p.toLowerCase() !== 'k').map((p) => p.toLowerCase());
  if (!left.length || (left.length === 1 && 'bn'.includes(left[0]))) return 'material';
  const key = toFen(s).split(' ').slice(0, 4).join(' ');
  if (history.filter((h) => h === key).length >= 2) return 'repetition';
  return '';
}
export const posKey = (s) => toFen(s).split(' ').slice(0, 4).join(' ');

// ---------- Bob's moves (the app's own small search, not the brain) ----------
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Small square bonuses: knights and pawns like the centre; pawns like to advance. Seen from white; flipped for black.
const CENTRE = [0, 1, 2, 3, 3, 2, 1, 0];
function evaluate(s) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.board[i]; if (!p) continue;
    const t = p.toLowerCase(), w = white(p), f = fileOf(i), r = w ? rankOf(i) : 7 - rankOf(i);
    let v = VALUE[t];
    if (t === 'n' || t === 'b') v += 4 * (CENTRE[f] + CENTRE[r]);
    else if (t === 'p') v += 6 * r + (f >= 2 && f <= 5 ? 4 * r : 0);
    else if (t === 'k') v += r === 0 && (f <= 2 || f >= 6) ? 15 : 0;
    score += w ? v : -v;
  }
  return s.turn === 'w' ? score : -score;
}
const order = (moves) => moves.sort((a, b) => (b.cap ? VALUE[b.cap.toLowerCase()] * 10 - VALUE[b.piece.toLowerCase()] : 0) + (b.promo ? 800 : 0) - ((a.cap ? VALUE[a.cap.toLowerCase()] * 10 - VALUE[a.piece.toLowerCase()] : 0) + (a.promo ? 800 : 0)));
function search(s, depth, alpha, beta, budget) {
  if (budget.n-- <= 0) return evaluate(s);
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -100000 - depth : 0;
  if (depth <= 0) { // captures only, so a trade isn't cut off half way
    const stand = evaluate(s);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    for (const m of order(moves.filter((x) => x.cap || x.promo))) {
      const v = -search(play(s, m), depth - 1, -beta, -alpha, budget);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
      if (depth < -4) break;
    }
    return alpha;
  }
  for (const m of order(moves)) {
    const v = -search(play(s, m), depth - 1, -beta, -alpha, budget);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
// Strength 1 to 5. 1 sees one move and often picks a lesser one; 5 looks three moves ahead with no slips.
export const STRENGTHS = { 1: 'Beginner', 2: 'Casual', 3: 'Club', 4: 'Strong', 5: 'Strongest' };
const LEVEL = { 1: { depth: 1, slip: 0.45, noise: 120 }, 2: { depth: 1, slip: 0.2, noise: 50 }, 3: { depth: 2, slip: 0.08, noise: 20 }, 4: { depth: 3, slip: 0, noise: 8 }, 5: { depth: 3, slip: 0, noise: 0 } };
export function bestMove(s, strength = 3, rnd = Math.random) {
  const L = LEVEL[strength] || LEVEL[3];
  const moves = order(legalMoves(s));
  if (!moves.length) return null;
  const budget = { n: { 1: 20000, 2: 20000, 3: 60000, 4: 120000, 5: 250000 }[strength] || 60000 }; // caps the think time at a second or two
  const scored = moves.map((m) => ({ m, v: -search(play(s, m), L.depth - 1, -Infinity, Infinity, budget) + (L.noise ? (rnd() - 0.5) * L.noise : 0) }));
  scored.sort((a, b) => b.v - a.v);
  if (L.slip && rnd() < L.slip && scored.length > 1) { // a human-ish slip: the second or third best, never a move that throws a mate
    const pool = scored.slice(1, 4).filter((x) => x.v > -50000);
    if (pool.length) return pool[Math.floor(rnd() * pool.length)].m;
  }
  return scored[0].m;
}
// How the game stands, in words, for Bob's line: material count and whose position looks better.
export function material(s) {
  let w = 0, b = 0;
  for (const p of s.board) if (p) { if (white(p)) w += VALUE[p.toLowerCase()]; else b += VALUE[p.toLowerCase()]; }
  return { white: Math.round(w / 100), black: Math.round(b / 100) };
}
// A plain picture of the board for the brain: rank 8 at the top, dots for empty squares.
export function boardText(s) {
  const rows = [];
  for (let r = 7; r >= 0; r--) rows.push(`${r + 1} ${s.board.slice(r * 8, r * 8 + 8).map((p) => p || '.').join(' ')}`);
  return rows.join('\n') + '\n  a b c d e f g h';
}
