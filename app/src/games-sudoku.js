// 🧩 Games, Sudoku (item 124): the app makes the puzzle (always one answer), checks every number, and finds the next
// step a person could take, with the reason in words ("only 7 fits here: the row has 1 2 3, the column 4 5 ..."). Bob
// says the reason in his voice; he never works the puzzle out himself, so his hints are never wrong.
// A grid is 81 numbers, row by row, 0 for empty.
export const rowOf = (i) => Math.floor(i / 9), colOf = (i) => i % 9, boxOf = (i) => 3 * Math.floor(rowOf(i) / 3) + Math.floor(colOf(i) / 3);
const UNITS = (() => {
  const rows = [], cols = [], boxes = [];
  for (let k = 0; k < 9; k++) { rows.push([]); cols.push([]); boxes.push([]); }
  for (let i = 0; i < 81; i++) { rows[rowOf(i)].push(i); cols[colOf(i)].push(i); boxes[boxOf(i)].push(i); }
  return { rows, cols, boxes };
})();
const PEERS = Array.from({ length: 81 }, (_, i) => [...new Set([...UNITS.rows[rowOf(i)], ...UNITS.cols[colOf(i)], ...UNITS.boxes[boxOf(i)]])].filter((j) => j !== i));
export const cellName = (i) => `row ${rowOf(i) + 1}, column ${colOf(i) + 1}`;

export function candidates(grid, i) {
  if (grid[i]) return [];
  const seen = new Set(PEERS[i].map((j) => grid[j]));
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !seen.has(n));
}
// Count answers up to `limit` (2 is enough to know whether there is exactly one).
export function countSolutions(grid, limit = 2) {
  const g = [...grid];
  let n = 0;
  const go = () => {
    let best = -1, bestC = null;
    for (let i = 0; i < 81; i++) if (!g[i]) { const c = candidates(g, i); if (!c.length) return; if (!bestC || c.length < bestC.length) { best = i; bestC = c; if (c.length === 1) break; } }
    if (best < 0) { n++; return; }
    for (const v of bestC) { g[best] = v; go(); if (n >= limit) break; }
    g[best] = 0;
  };
  go();
  return n;
}
export function solve(grid) {
  const g = [...grid];
  const go = () => {
    let best = -1, bestC = null;
    for (let i = 0; i < 81; i++) if (!g[i]) { const c = candidates(g, i); if (!c.length) return false; if (!bestC || c.length < bestC.length) { best = i; bestC = c; } }
    if (best < 0) return true;
    for (const v of bestC) { g[best] = v; if (go()) return true; }
    g[best] = 0; return false;
  };
  return go() ? g : null;
}
const shuffle = (a, rnd) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// A full, random, valid grid.
export function fullGrid(rnd = Math.random) {
  const g = Array(81).fill(0);
  const go = (i) => { if (i === 81) return true; for (const v of shuffle(candidates(g, i), rnd)) { g[i] = v; if (go(i + 1)) return true; } g[i] = 0; return false; };
  go(0);
  return g;
}
// How many numbers are given at the start. Fewer is harder; every puzzle still has exactly one answer, and the easy
// ones can always be finished with the two simple steps the hints explain.
export const LEVELS = { easy: { name: 'Easy', clues: 40 }, normal: { name: 'Normal', clues: 32 }, hard: { name: 'Hard', clues: 26 } };
export function makePuzzle(rnd = Math.random, level = 'normal') {
  const want = (LEVELS[level] || LEVELS.normal).clues;
  const answer = fullGrid(rnd);
  const puzzle = [...answer];
  let left = 81;
  for (const i of shuffle([...Array(81).keys()], rnd)) {
    if (left <= want) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle) !== 1 || (level === 'easy' && !simpleSolvable(puzzle))) puzzle[i] = keep; else left--;
  }
  return { puzzle, answer };
}

// ---------- The next step, with the reason ----------
const unitName = (kind, k) => (kind === 'row' ? `row ${k + 1}` : kind === 'column' ? `column ${k + 1}` : `the ${['top-left', 'top-middle', 'top-right', 'middle-left', 'centre', 'middle-right', 'bottom-left', 'bottom-middle', 'bottom-right'][k]} box`);
// One step a person could find. Kinds: 'single' (only one number fits this square), 'hidden' (this number fits in
// only one square of a row, column or box), 'guess' (nothing simple left: the app tells you the number from the answer).
export function nextStep(grid, answer) {
  for (let i = 0; i < 81; i++) {
    const c = candidates(grid, i);
    if (c.length === 1) {
      const seen = [...new Set(PEERS[i].map((j) => grid[j]).filter(Boolean))].sort();
      return { kind: 'single', cell: i, value: c[0], why: `Only ${c[0]} fits at ${cellName(i)}: its row, column and box already hold ${seen.join(' ')}.` };
    }
  }
  for (const [kind, list] of [['box', UNITS.boxes], ['row', UNITS.rows], ['column', UNITS.cols]]) {
    for (let k = 0; k < 9; k++) {
      const unit = list[k];
      for (let n = 1; n <= 9; n++) {
        if (unit.some((i) => grid[i] === n)) continue;
        const spots = unit.filter((i) => !grid[i] && candidates(grid, i).includes(n));
        if (spots.length === 1) return { kind: 'hidden', cell: spots[0], value: n, why: `In ${unitName(kind, k)}, ${n} can only go at ${cellName(spots[0])}: every other empty square there already sees a ${n}.` };
      }
    }
  }
  const i = grid.findIndex((v) => !v);
  if (i < 0 || !answer) return null;
  return { kind: 'guess', cell: i, value: answer[i], why: `Nothing simple is left, so here's one from the answer: ${answer[i]} at ${cellName(i)}. ${candidates(grid, i).length} numbers could fit there by the rules.` };
}
export function simpleSolvable(puzzle) {
  const g = [...puzzle];
  for (let guard = 0; guard < 81; guard++) {
    if (!g.includes(0)) return true;
    const s = nextStep(g, null);
    if (!s) return false;
    g[s.cell] = s.value;
  }
  return !g.includes(0);
}
// Where a number clashes with the rules (the squares in its row, column or box that already hold it).
export function clashes(grid, i, v) { return PEERS[i].filter((j) => grid[j] === v); }
