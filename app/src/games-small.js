// 🧩 Games, the small board games: Noughts and crosses (item 127) and Code breaker (item 128). The app keeps every
// rule and plays its own moves by working them out, never by asking the brain; Bob only talks.

// ---------- Noughts and crosses ----------
// The board is nine squares, '' or 'X' or 'O', read row by row. You are X and go first unless Bob starts.
export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export function winner(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return { mark: b[a], line: [a, c, d] };
  return b.every(Boolean) ? { mark: 'draw', line: [] } : null;
}
function minimax(b, me, turn) {
  const w = winner(b);
  if (w) return w.mark === 'draw' ? 0 : w.mark === me ? 10 : -10;
  const scores = [];
  for (let i = 0; i < 9; i++) if (!b[i]) { b[i] = turn; scores.push(minimax(b, me, turn === 'X' ? 'O' : 'X') * 0.9); b[i] = ''; }
  return turn === me ? Math.max(...scores) : Math.min(...scores);
}
// Levels: 'kid' plays like a young child (wins when it sees it, misses blocks half the time), 'easy' blocks but
// wanders, 'perfect' never loses.
export const NOUGHTS_LEVELS = { kid: 'Little one', easy: 'Easy', perfect: 'Can\'t be beaten' };
export function noughtsMove(b, me = 'O', level = 'easy', rnd = Math.random) {
  const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!free.length) return -1;
  const them = me === 'X' ? 'O' : 'X';
  const completes = (mark) => free.find((i) => { const t = [...b]; t[i] = mark; return winner(t)?.mark === mark; });
  if (level !== 'perfect') {
    const win = completes(me);
    if (win !== undefined && (level === 'easy' || rnd() < 0.8)) return win;
    const block = completes(them);
    if (block !== undefined && (level === 'easy' ? rnd() < 0.85 : rnd() < 0.5)) return block;
    if (level === 'easy' && !b[4] && rnd() < 0.5) return 4;
    return free[Math.floor(rnd() * free.length)];
  }
  let best = -Infinity, pick = [];
  for (const i of free) { const t = [...b]; t[i] = me; const v = minimax(t, me, them); if (v > best) { best = v; pick = [i]; } else if (v === best) pick.push(i); }
  return pick[Math.floor(rnd() * pick.length)];
}

// ---------- Code breaker ----------
// A secret row of four pegs from six colours. Each try gets a black peg for each colour in the right place and a
// white peg for each right colour in the wrong place. Ten tries. Kid mode: no colour twice, and twelve tries.
export const COLOURS = [['r', 'red', '🔴'], ['o', 'orange', '🟠'], ['y', 'yellow', '🟡'], ['g', 'green', '🟢'], ['b', 'blue', '🔵'], ['p', 'purple', '🟣']];
export const COLOUR_IDS = COLOURS.map((c) => c[0]);
export const PEGS = 4;
export const CODE_TRIES = { kid: 12, normal: 10 };
export function makeCode(rnd = Math.random, { repeats = true } = {}) {
  const pool = [...COLOUR_IDS], out = [];
  for (let k = 0; k < PEGS; k++) { const i = Math.floor(rnd() * pool.length); out.push(pool[i]); if (!repeats) pool.splice(i, 1); }
  return out.join('');
}
// Read a typed or tapped code: "rgby", "r g b y", "red green blue yellow".
export function readCode(text) {
  const t = String(text || '').toLowerCase().trim();
  const words = t.split(/[\s,]+/).filter(Boolean);
  const named = words.map((w) => COLOURS.find((c) => c[1] === w || c[2] === w)?.[0]);
  if (words.length === PEGS && named.every(Boolean)) return named.join('');
  const flat = t.replace(/[\s,]+/g, '');
  return flat.length === PEGS && [...flat].every((c) => COLOUR_IDS.includes(c)) ? flat : '';
}
export function score(guess, code) {
  let black = 0; const g = {}, c = {};
  for (let k = 0; k < PEGS; k++) { if (guess[k] === code[k]) black++; else { g[guess[k]] = (g[guess[k]] || 0) + 1; c[code[k]] = (c[code[k]] || 0) + 1; } }
  let white = 0;
  for (const k of Object.keys(g)) white += Math.min(g[k], c[k] || 0);
  return { black, white };
}
let ALL = null;
export function allCodes() {
  if (!ALL) { ALL = []; const go = (s) => { if (s.length === PEGS) { ALL.push(s); return; } for (const c of COLOUR_IDS) go(s + c); }; go(''); }
  return ALL;
}
// When Bob breaks your code: he always tries a code that fits every answer so far (the app works it out), so he
// usually needs five or six tries. Opens with two colours, two of each.
export function breakerGuess(history, rnd = Math.random) {
  if (!history.length) return 'rrgg';
  const fits = allCodes().filter((code) => history.every((h) => { const s = score(h.guess, code); return s.black === h.black && s.white === h.white; }));
  return fits.length ? fits[Math.floor(rnd() * Math.min(fits.length, 3))] : '';
}
export const codeText = (code) => [...code].map((c) => COLOURS.find((x) => x[0] === c)?.[2] || '?').join('');
export const codeWords = (code) => [...code].map((c) => COLOURS.find((x) => x[0] === c)?.[1] || '?').join(', ');
