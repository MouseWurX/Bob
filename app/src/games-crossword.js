// 🧩 Games, the daily mini crossword (item 125): a 5 by 5 grid with three words across and three down, filled by the
// app from the five-letter word list, the same grid for everyone on the same day. Bob writes the clues; the app checks
// each clue doesn't give its word away (and swaps in its own plain clue if it does), and checks your letters.
//
//   1 . 2 . 3      Across: rows 1, 3 and 5. Down: columns 1, 3 and 5.
//   . # . # .      The four # squares are blank, so every letter sits in one or two words.
//   4 . . . .
//   . # . # .
//   5 . . . .
import { FIVE } from './games-words.js';
export const SIZE = 5;
export const BLOCKS = [6, 8, 16, 18];
export const isBlock = (i) => BLOCKS.includes(i);
// The six words: where each starts, which way it runs, and its number on the grid.
export const SLOTS = [
  { id: '1a', dir: 'across', row: 0, col: 0, num: 1 }, { id: '4a', dir: 'across', row: 2, col: 0, num: 4 }, { id: '5a', dir: 'across', row: 4, col: 0, num: 5 },
  { id: '1d', dir: 'down', row: 0, col: 0, num: 1 }, { id: '2d', dir: 'down', row: 0, col: 2, num: 2 }, { id: '3d', dir: 'down', row: 0, col: 4, num: 3 }
];
export const cells = (slot) => Array.from({ length: SIZE }, (_, k) => (slot.dir === 'across' ? slot.row * SIZE + slot.col + k : (slot.row + k) * SIZE + slot.col));

// A seeded random (mulberry32), so a day's grid is the same every time it's made.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const daySeed = (day) => [...String(day)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
export const today = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Fill the grid: across words in rows 0, 2, 4 and down words in columns 0, 2, 4 meet at nine squares.
export function fill(rnd = Math.random, words = FIVE) {
  const list = [...new Set(words.filter((w) => /^[a-z]{5}$/.test(w)))];
  const byPair = new Map(); // "pos:letter" -> words, for quick lookups
  for (const w of list) for (const k of [0, 2, 4]) { const key = `${k}${w[k]}`; if (!byPair.has(key)) byPair.set(key, []); byPair.get(key).push(w); }
  const fits = (w, need) => need.every(([k, c]) => w[k] === c);
  const shuffled = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cands = (need, used) => { const base = byPair.get(`${need[0][0]}${need[0][1]}`) || []; return shuffled(base.filter((w) => !used.has(w) && fits(w, need))); };
  let budget = 40000;
  for (const a0 of shuffled(list).slice(0, 300)) {
    const used = new Set([a0]);
    for (const d0 of cands([[0, a0[0]]], used)) { if (--budget < 0) return null; used.add(d0);
      for (const d2 of cands([[0, a0[2]]], used)) { used.add(d2);
        for (const d4 of cands([[0, a0[4]]], used)) { used.add(d4);
          const a2 = cands([[0, d0[2]], [2, d2[2]], [4, d4[2]]], used)[0];
          if (a2) { used.add(a2);
            const a4 = cands([[0, d0[4]], [2, d2[4]], [4, d4[4]]], used)[0];
            if (a4) return { '1a': a0, '4a': a2, '5a': a4, '1d': d0, '2d': d2, '3d': d4 };
            used.delete(a2);
          }
          used.delete(d4);
        }
        used.delete(d2);
      }
      used.delete(d0);
    }
  }
  return null;
}
// The answer grid as 25 letters ('' on the blank squares).
export function solution(words) {
  const g = Array(SIZE * SIZE).fill('');
  for (const s of SLOTS) cells(s).forEach((i, k) => { g[i] = words[s.id][k]; });
  return g;
}
export function dailyWords(day) { return fill(seeded(daySeed(day))) || fill(seeded(daySeed(day) + 1)); }

// ---------- Clues ----------
// A clue gives the word away when it holds the word, a word built on it, or (for short words) the word's first four
// letters as a word part. The app's own fallback clue is plain: the meaning from the brain is the nice part.
export function cluesLeak(clue, word) {
  const t = ` ${String(clue || '').toLowerCase().replace(/[^a-z ]/g, ' ')} `;
  if (t.includes(word)) return true;
  return t.split(/\s+/).some((x) => x.length >= 4 && (word.startsWith(x) || x.startsWith(word.slice(0, 4))));
}
export function goodClue(clue, word) {
  const c = String(clue || '').replace(/\s+/g, ' ').trim().replace(/^["“]|["”]$/g, '');
  if (!c || c.length < 3 || c.length > 90 || cluesLeak(c, word)) return '';
  return c;
}
export const fallbackClue = (word, num, dir) => `Five letters, starting with ${word[0].toUpperCase()} (${num} ${dir})`;
export const cluePrompt = (words) => `Write one short crossword clue for each of these words. Simple, fair, like a newspaper mini crossword. Never use the word itself, a part of it, or a word built on it. Answer exactly as these lines, nothing else:\n${SLOTS.map((s) => `${s.id}: ${words[s.id]}`).join('\n')}\nReply as:\n${SLOTS.map((s) => `${s.id}: <clue>`).join('\n')}`;
// Read the brain's reply into checked clues, with the app's own clue wherever one is missing or gives the word away.
export function readClues(reply, words) {
  const out = {}, swapped = [], ids = SLOTS.map((x) => x.id).join('|');
  for (const s of SLOTS) {
    // The reply may come back on one line (Bob's words are tidied into one), so each clue runs to the next id.
    const m = new RegExp(`(?:^|\\s)${s.id}\\s*[:.)-]\\s*(.+?)(?=\\s+(?:${ids})\\s*[:.)-]|$)`, 'is').exec(String(reply || '').trim());
    const c = goodClue(m?.[1], words[s.id]);
    out[s.id] = c || fallbackClue(words[s.id], s.num, s.dir);
    if (!c) swapped.push(s.id);
  }
  return { clues: out, swapped };
}
// Which squares are wrong right now (filled and not the answer).
export const wrongCells = (letters, answer) => letters.map((c, i) => (c && answer[i] && c !== answer[i] ? i : -1)).filter((i) => i >= 0);
export const solved = (letters, answer) => answer.every((c, i) => !c || letters[i] === c);
