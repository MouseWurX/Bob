// 🧩 Games drop 2 (1.5.206): the rules the app runs for Four in a row, Hidden fleet, Liar's dice and Trivia night, and
// how Bob plays his side of each. Same rule as drop 1: the app keeps the board, the dice and the answers and makes Bob's
// moves; the brain only talks, and it is never told Bob's ships or dice, so it can't give them away.
// Plain functions with no state of their own, so the tests can play them move by move.

export const LEVELS = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
export const cleanLevel = (l) => (LEVELS[l] ? l : 'normal');

// ---------- Four in a row: seven columns, six rows; four of yours in a line wins ----------
export const COLS = 7, ROWS = 6;
export const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(''));
// The row a counter lands on in this column, or -1 when the column is full. Row 0 is the top.
export const landing = (board, col) => { for (let r = ROWS - 1; r >= 0; r--) if (!board[r][col]) return r; return -1; };
export const openCols = (board) => [...Array(COLS).keys()].filter((c) => landing(board, c) >= 0);
export function drop(board, col, who) { const r = landing(board, col); if (r < 0) return -1; board[r][col] = who; return r; }
const LINES = (() => {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k]);
    if (cells.every(([y, x]) => y >= 0 && y < ROWS && x >= 0 && x < COLS)) out.push(cells);
  }
  return out;
})();
// Who has four in a line, with the four cells; or null.
export function fourWinner(board) {
  for (const cells of LINES) { const [y, x] = cells[0]; const w = board[y][x]; if (w && cells.every(([a, b]) => board[a][b] === w)) return { who: w, cells }; }
  return null;
}
export const boardFull = (board) => board[0].every(Boolean);
function score(board, me) {
  const them = me === 'bob' ? 'you' : 'bob';
  let s = 0;
  for (let r = 0; r < ROWS; r++) if (board[r][3] === me) s += 3; else if (board[r][3] === them) s -= 3;
  for (const cells of LINES) {
    let m = 0, t = 0;
    for (const [y, x] of cells) { if (board[y][x] === me) m++; else if (board[y][x] === them) t++; }
    if (m && t) continue;
    if (m === 3) s += 50; else if (m === 2) s += 6;
    if (t === 3) s -= 60; else if (t === 2) s -= 6;
  }
  return s;
}
const ORDER = [3, 2, 4, 1, 5, 0, 6];
function negamax(board, depth, a, b, me) {
  const them = me === 'bob' ? 'you' : 'bob';
  const w = fourWinner(board);
  if (w) return w.who === me ? 100000 + depth : -100000 - depth;
  if (boardFull(board)) return 0;
  if (!depth) return score(board, me);
  let best = -Infinity;
  for (const c of ORDER) {
    const r = landing(board, c); if (r < 0) continue;
    board[r][c] = me;
    const v = -negamax(board, depth - 1, -b, -a, them);
    board[r][c] = '';
    if (v > best) best = v;
    if (v > a) a = v;
    if (a >= b) break;
  }
  return best;
}
const DEPTH = { easy: 2, normal: 4, hard: 6 };
// Bob's column. Easy: often just a reasonable column; he still takes a win and blocks a loss. Hard looks six moves ahead.
export function fourMove(board, level = 'normal', rnd = Math.random) {
  const cols = openCols(board);
  if (!cols.length) return -1;
  for (const who of ['bob', 'you']) for (const c of cols) { const r = landing(board, c); board[r][c] = who; const w = fourWinner(board); board[r][c] = ''; if (w) return c; }
  if (level === 'easy' && rnd() < 0.5) return cols[Math.floor(rnd() * cols.length)];
  let best = -Infinity, pick = cols[0];
  for (const c of ORDER) {
    const r = landing(board, c); if (r < 0) continue;
    board[r][c] = 'bob';
    const v = -negamax(board, DEPTH[cleanLevel(level)] - 1, -Infinity, Infinity, 'you') + (rnd() - 0.5) * 2;
    board[r][c] = '';
    if (v > best) { best = v; pick = c; }
  }
  return pick;
}

// ---------- Hidden fleet: ten by ten; find and sink the other side's five ships ----------
export const SEA = 10;
export const FLEET = [['Flagship', 5], ['Cruiser', 4], ['Frigate', 3], ['Submarine', 3], ['Patrol boat', 2]];
export const cellName = (i) => `${'ABCDEFGHIJ'[i % SEA]}${Math.floor(i / SEA) + 1}`;
export function parseCell(s) {
  const m = /^\s*([a-j])\s*(10|[1-9])\s*$/i.exec(String(s || ''));
  return m ? (Number(m[2]) - 1) * SEA + 'abcdefghij'.indexOf(m[1].toLowerCase()) : -1;
}
// Five ships, none overlapping, none touching another side on (so every ship can be found on its own).
export function placeFleet(rnd = Math.random) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const taken = new Set(), ships = [];
    let ok = true;
    for (const [name, size] of FLEET) {
      let placed = false;
      for (let t = 0; t < 200 && !placed; t++) {
        const across = rnd() < 0.5;
        const x = Math.floor(rnd() * (across ? SEA - size + 1 : SEA)), y = Math.floor(rnd() * (across ? SEA : SEA - size + 1));
        const cells = Array.from({ length: size }, (_, k) => (y + (across ? 0 : k)) * SEA + x + (across ? k : 0));
        const near = (i) => [i, i - SEA, i + SEA, i % SEA ? i - 1 : -1, i % SEA < SEA - 1 ? i + 1 : -1].filter((j) => j >= 0 && j < SEA * SEA);
        if (cells.some((i) => near(i).some((j) => taken.has(j)))) continue;
        cells.forEach((i) => taken.add(i));
        ships.push({ name, size, cells });
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  // A dice roll that never fits (it shouldn't happen): lay the ships in order, the first places that fit.
  const taken = new Set(), ships = [];
  const near = (i) => [i, i - SEA, i + SEA, i % SEA ? i - 1 : -1, i % SEA < SEA - 1 ? i + 1 : -1].filter((j) => j >= 0 && j < SEA * SEA);
  for (const [name, size] of FLEET) {
    outer: for (let y = 0; y < SEA; y++) for (let x = 0; x <= SEA - size; x++) {
      const cells = Array.from({ length: size }, (_, k) => y * SEA + x + k);
      if (cells.some((i) => near(i).some((j) => taken.has(j)))) continue;
      cells.forEach((i) => taken.add(i)); ships.push({ name, size, cells }); break outer;
    }
  }
  return ships;
}
// One shot at a fleet: 'miss', 'hit' or 'sunk' (with the ship), and whether the whole fleet is down.
export function fireAt(ships, shots, i) {
  shots.push(i);
  const ship = ships.find((s) => s.cells.includes(i));
  if (!ship) return { result: 'miss' };
  const sunk = ship.cells.every((c) => shots.includes(c));
  const all = ships.every((s) => s.cells.every((c) => shots.includes(c)));
  return { result: sunk ? 'sunk' : 'hit', ship: sunk ? ship.name : '', all };
}
// Bob's shot at your fleet, from what he can see: his own shots and which hit. Easy fires anywhere new. Normal hunts,
// then works along a hit. Hard does the same but hunts on a checkerboard, so he never wastes a shot a ship can't fill.
export function fleetMove(shots, hits, sunkCells, level = 'normal', rnd = Math.random) {
  const tried = new Set(shots);
  const free = [...Array(SEA * SEA).keys()].filter((i) => !tried.has(i));
  if (!free.length) return -1;
  const any = () => free[Math.floor(rnd() * free.length)];
  if (level === 'easy') return any();
  const open = hits.filter((h) => !sunkCells.includes(h));
  const near = (i) => [[i - SEA, true], [i + SEA, true], [i % SEA ? i - 1 : -1, false], [i % SEA < SEA - 1 ? i + 1 : -1, false]].filter(([j]) => j >= 0 && j < SEA * SEA);
  if (open.length) {
    if (open.length >= 2) {
      const sorted = [...open].sort((a, b) => a - b);
      const across = sorted.every((h) => Math.floor(h / SEA) === Math.floor(sorted[0] / SEA));
      const down = sorted.every((h) => h % SEA === sorted[0] % SEA);
      const ends = across ? [sorted[0] % SEA ? sorted[0] - 1 : -1, sorted.at(-1) % SEA < SEA - 1 ? sorted.at(-1) + 1 : -1]
        : down ? [sorted[0] - SEA, sorted.at(-1) + SEA] : [];
      const next = ends.filter((j) => j >= 0 && j < SEA * SEA && !tried.has(j));
      if (next.length) return next[Math.floor(rnd() * next.length)];
    }
    const next = open.flatMap((h) => near(h).map(([j]) => j)).filter((j) => !tried.has(j));
    if (next.length) return next[Math.floor(rnd() * next.length)];
  }
  if (level === 'hard') { const even = free.filter((i) => (Math.floor(i / SEA) + (i % SEA)) % 2 === 0); if (even.length) return even[Math.floor(rnd() * even.length)]; }
  return any();
}

// ---------- Liar's dice: five dice each, hidden; bid on how many of a face are on the table ----------
export const LIAR_DICE = 5;
export const roll = (n, rnd = Math.random) => Array.from({ length: n }, () => 1 + Math.floor(rnd() * 6));
export const FACE_WORDS = ['', 'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const SINGLE = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
export const bidWords = (b) => (b ? (b.count === 1 ? `one ${SINGLE[b.face]}` : `${b.count} ${FACE_WORDS[b.face]}`) : '');
// How many dice on the table show the face; with ones wild, every 1 counts too.
export const countFace = (dice, face, wild = true) => dice.filter((d) => d === face || (wild && d === 1 && face !== 1)).length;
// A raise is more dice, or the same number of a higher face. With ones wild, nobody bids on ones.
export function validRaise(prev, bid, total, wild = true) {
  if (!bid || !Number.isInteger(bid.count) || !Number.isInteger(bid.face)) return 'Pick how many and which face.';
  if (bid.face < (wild ? 2 : 1) || bid.face > 6) return wild ? 'Ones are wild, so bid on twos to sixes.' : 'A face is 1 to 6.';
  if (bid.count < 1 || bid.count > total) return `There are only ${total} dice on the table.`;
  if (prev && !(bid.count > prev.count || (bid.count === prev.count && bid.face > prev.face))) return `Bid higher than ${bidWords(prev)}: more dice, or the same number of a higher face.`;
  return '';
}
// The chance at least `need` of `n` hidden dice show a face (each one has chance p).
export function atLeast(need, n, p) {
  if (need <= 0) return 1;
  if (need > n) return 0;
  let sum = 0, c = 1;
  for (let k = 0; k <= n; k++) { if (k > 0) c = (c * (n - k + 1)) / k; if (k >= need) sum += c * p ** k * (1 - p) ** (n - k); }
  return sum;
}
// Bob's turn: call "Liar!" or raise. He knows only his own dice and how many you hold.
export function liarMove(own, theirs, prev, level = 'normal', rnd = Math.random, wild = true) {
  const p = wild ? 1 / 3 : 1 / 6, total = own.length + theirs;
  const chance = (b) => atLeast(b.count - countFace(own, b.face, wild), theirs, p);
  if (prev) {
    const c = chance(prev);
    const callBelow = level === 'easy' ? 0.2 : level === 'hard' ? 0.45 : 0.35;
    if (c < callBelow || prev.count >= total) return { call: true };
    if (level === 'easy' && rnd() < 0.15) return { call: true };
  }
  const lo = wild ? 2 : 1;
  const options = [];
  for (let f = lo; f <= 6; f++) for (let n = 1; n <= total; n++) { const b = { count: n, face: f }; if (!validRaise(prev, b, total, wild)) options.push({ ...b, c: chance(b) }); }
  if (!options.length) return { call: true };
  const smallest = Math.min(...options.map((o) => o.count));
  // The boldest bid he believes (likely enough, at most two more dice than he must), else the likeliest small one.
  const target = level === 'easy' ? 0.5 : level === 'hard' ? 0.55 : 0.6;
  const safe = options.filter((o) => o.c >= target && o.count <= smallest + 2).sort((a, b) => b.count - a.count || b.c - a.c || b.face - a.face);
  const near = options.filter((o) => o.count <= smallest + 1).sort((a, b) => b.c - a.c || a.count - b.count || a.face - b.face);
  let pick = safe[0] || near[0];
  if (level !== 'hard' && rnd() < (level === 'easy' ? 0.3 : 0.12)) pick = near[Math.floor(rnd() * near.length)]; // a bluff now and then
  if (prev && pick.c < 0.3 && chance(prev) < 0.5) return { call: true };
  return { bid: { count: pick.count, face: pick.face } };
}

// ---------- Trivia night: ten questions, four choices; the app marks every answer ----------
export const TRIVIA_ROUNDS = 10;
export const LETTERS4 = ['A', 'B', 'C', 'D'];
export const TRIVIA_LEVELS = { easy: [1, 2], normal: [1, 2, 3], hard: [2, 3] };
// Which letter a reply picked: the first lone A to D, or the text of a choice.
export function pickedLetter(reply, choices) {
  const t = String(reply || '').trim();
  const m = /(?:^|[^a-z])([abcd])(?:[).:,\s]|$)/i.exec(t);
  if (m) return m[1].toUpperCase();
  const low = t.toLowerCase();
  const i = choices.findIndex((c) => low.includes(String(c).toLowerCase()));
  return i >= 0 ? LETTERS4[i] : '';
}
export const triviaPrompt = (q) => `Trivia night. Question: ${q.q}\n${q.choices.map((c, i) => `${LETTERS4[i]}) ${c}`).join('\n')}\nAnswer with the letter of your choice only: A, B, C or D.`;
