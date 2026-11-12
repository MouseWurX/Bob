// 🧩 Games, the Letter grid (item 126): sixteen letter dice are shaken into a 4 by 4 grid, and you find words by
// joining letters that touch (across, up and down, or on a slant), each square once per word, against a timer. The app
// shakes the dice, checks every word against its own word list, keeps the clock and finds every word in the grid so
// Bob can play too. Words of three letters or more; longer words score more.
import { FOUR, FIVE, HANGMAN } from './games-words.js';
import { DICT } from './games-dict.js';
import { THREE, GRID_DICE, KID_WORDS, KID_FIVE } from './games-more-words.js';
export const SIDE = 4;
export const SECONDS = { kid: 240, easy: 240, normal: 180, hard: 120 };
// Your words count when they're in the games dictionary (src/games-dict.js) or one of the word lists. Bob only plays
// the plain, everyday ones (the lists the other games use), so he never finds an odd or rude word.
let ALL = null, PLAIN = null, PREFIX = null;
function load() {
  if (ALL) return;
  PLAIN = new Set([...THREE, ...FOUR, ...FIVE, ...Object.values(HANGMAN).flat(), ...Object.values(KID_WORDS).flat(), ...KID_FIVE].filter((w) => /^[a-z]{3,16}$/.test(w)));
  ALL = new Set([...PLAIN, ...Object.values(DICT).flatMap((x) => String(x).split(' '))].filter((w) => /^[a-z]{3,16}$/.test(w)));
  PREFIX = new Set();
  for (const w of ALL) for (let k = 1; k <= w.length; k++) PREFIX.add(w.slice(0, k));
}
export function dictionary() { load(); return ALL; }
// Words left out of the grid game altogether, even when the dictionary has them (kept in step with src/games.js).
const RUDE = /^(arse|ass|asses|anal|bastard|bitch|bloody|bollocks|boob|boobs|crap|damn|dick|fart|hell|piss|poop|porn|sex|sexy|shit|slut|turd|whore|tit|tits)$/;
export const counts = (w) => dictionary().has(w) && !RUDE.test(w);
export function plainWords() { load(); return PLAIN; }
export const faces = (die) => die.match(/Qu|[A-Z]/g);
// Shake the dice: each die lands in a random square showing a random face.
export function shake(rnd = Math.random) {
  const dice = [...GRID_DICE];
  for (let i = dice.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [dice[i], dice[j]] = [dice[j], dice[i]]; }
  return dice.map((d) => { const f = faces(d); return f[Math.floor(rnd() * f.length)].toLowerCase(); });
}
export function touching(i) {
  const r = Math.floor(i / SIDE), c = i % SIDE, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < SIDE && cc >= 0 && cc < SIDE) out.push(rr * SIDE + cc); }
  return out;
}
// Can this word be made by joining touching squares, each once? Returns the path of squares, or null.
export function pathFor(grid, word) {
  const w = String(word || '').toLowerCase();
  const go = (i, at, seen) => {
    const face = grid[i];
    if (!w.startsWith(face, at)) return null;
    const next = at + face.length;
    if (next === w.length) return [i];
    seen.add(i);
    for (const j of touching(i)) if (!seen.has(j)) { const p = go(j, next, seen); if (p) { seen.delete(i); return [i, ...p]; } }
    seen.delete(i);
    return null;
  };
  for (let i = 0; i < grid.length; i++) { const p = go(i, 0, new Set()); if (p) return p; }
  return null;
}
// Every dictionary word in the grid.
export function allWords(grid) {
  load();
  const found = new Set();
  const go = (i, sofar, seen) => {
    const s = sofar + grid[i];
    if (!PREFIX.has(s)) return;
    if (s.length >= 3 && ALL.has(s) && !RUDE.test(s)) found.add(s);
    seen.add(i);
    for (const j of touching(i)) if (!seen.has(j)) go(j, s, seen);
    seen.delete(i);
  };
  for (let i = 0; i < grid.length; i++) go(i, '', new Set());
  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b));
}
// Points: 3 and 4 letters 1, five 2, six 3, seven 5, eight or more 11 (the usual word-grid scale).
export const points = (w) => (w.length <= 4 ? 1 : w.length === 5 ? 2 : w.length === 6 ? 3 : w.length === 7 ? 5 : 11);
// A grid worth playing: shake until it holds at least `min` words.
export function goodGrid(rnd = Math.random, min = 25) {
  let best = null;
  for (let k = 0; k < 30; k++) { const g = shake(rnd); const n = allWords(g).filter((w) => plainWords().has(w)).length; if (!best || n > best.n) best = { g, n }; if (n >= min) break; }
  return best.g;
}
// Bob's words when he plays: a share of what's there, set by the level, shorter words more likely.
export const BOB_SHARE = { kid: 0.12, easy: 0.2, normal: 0.33, hard: 0.5 };
export function bobsWords(all, level = 'normal', rnd = Math.random) {
  const share = BOB_SHARE[level] ?? BOB_SHARE.normal;
  return all.filter((w) => plainWords().has(w) && rnd() < share * (w.length <= 4 ? 1.3 : w.length === 5 ? 0.9 : 0.5));
}
