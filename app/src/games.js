// 🧩 Games (1.5.121): small games Bob plays with you. The rule that makes them work on the quick brain: the app runs the
// game and the brain only talks. The app picks the secret word, checks every guess, counts the lives and keeps the
// score; the brain answers yes or no, teases, hints and tells the story. Nothing loads until you press Start, and the
// brain is let go when a game ends, like after any job.
//
// Drop 1 (the owner, 2026-11-05): Twenty questions (either way round), Hangman, Word ladder, Five letters, Story dice.
// Everything here also serves the phone: the page is a view of GET /api/games and the game accepts the same POSTs.
//
// 1.5.206 (the owner's "50 ways" list, items 43 to 50): Twenty questions remembers his own answers; the app blanks the
// secret out of anything the brain says mid-game; Five letters takes any real word as a guess; a daily puzzle with a
// streak (Five letters, Word ladder); Easy, Normal and Hard; Bob suggests new words, checked against the dictionary;
// an unfinished game can be kept for next time (off until ticked); and drop 2: Four in a row, Hidden fleet, Liar's
// dice and Trivia night (with the Bobs on your Bob-Net when you ask for them). Rules for those: src/games-more.js.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { currentSession, modelFor, sessionBrains, quickOnCpu } from './sessions.js';
import { saveSettings } from './config.js';
import { FOUR, FIVE, HANGMAN, SHELVES, SECRETS, KINDS, DICE } from './games-words.js';
import { DICT } from './games-dict.js';
import { TRIVIA, TRIVIA_SHELVES } from './games-trivia.js';
import { LEVELS, cleanLevel, COLS, ROWS, emptyBoard, drop, fourWinner, boardFull, fourMove, SEA, FLEET, cellName, parseCell, placeFleet, fireAt, fleetMove, LIAR_DICE, roll, bidWords, countFace, validRaise, liarMove, TRIVIA_ROUNDS, LETTERS4, TRIVIA_LEVELS, pickedLetter, triviaPrompt } from './games-more.js';

export const GAMES = {
  twenty: { icon: '❓', name: 'Twenty questions', what: 'One of us thinks of something, the other asks yes-or-no questions. Twenty at most.' },
  hangman: { icon: '🪢', name: 'Hangman', what: 'I pick a word from a shelf; you guess it a letter at a time. Seven wrong guesses and it drops.' },
  ladder: { icon: '🪜', name: 'Word ladder', what: 'Climb from one four-letter word to another, changing one letter a step. Every rung must be a real word.' },
  letters: { icon: '🟩', name: 'Five letters', what: 'Guess my five-letter word in six tries. Each try colours the letters: right spot, wrong spot, not in the word.' },
  story: { icon: '🎲', name: 'Story dice', what: 'Six picture dice come up. We tell a story a line each until every die is in it.' },
  four: { icon: '🪙', name: 'Four in a row', what: 'Drop counters into seven columns, turn about. Four of yours in a line, across, down or slanting, wins.' },
  fleet: { icon: '⚓', name: 'Hidden fleet', what: 'Five ships each, hidden on a ten by ten sea. Call a square a turn; sink all of mine before I sink yours.' },
  liar: { icon: '🤥', name: "Liar's dice", what: 'Five hidden dice each. Bid how many of a face are on the table, or call my bid a lie. Wrong costs a die.' },
  trivia: { icon: '💡', name: 'Trivia night', what: 'Ten questions, four choices each. We both answer; the app marks them. Bring the Bobs on your Bob-Net if you like.' }
};
// The games with Easy, Normal and Hard, and the ones with a daily puzzle.
export const HAS_LEVEL = ['hangman', 'ladder', 'letters', 'four', 'fleet', 'liar', 'trivia'];
export const HAS_DAILY = ['letters', 'ladder'];
export const LEVEL_RULES = {
  hangman: { easy: { lives: 9, len: [3, 6] }, normal: { lives: 7, len: [3, 12] }, hard: { lives: 5, len: [8, 12] } },
  ladder: { easy: { min: 2, max: 3 }, normal: { min: 3, max: 5 }, hard: { min: 5, max: 7 } },
  letters: { easy: { tries: 7 }, normal: { tries: 6 }, hard: { tries: 5 } }
};
export const GAME_IDS = Object.keys(GAMES);
export const LIVES = 7;
export const TRIES = 6;
export const QUESTIONS = 20;
export const STORY_ROUNDS = 6;
export const DICE_COUNT = 6;

// ---------- Settings (Advanced, 🧩 Games). Both have a default; nothing is "on". ----------
export const TALK = { every: 'After every move', some: 'Now and then', end: 'Only at the end' };
export function cleanGames(g = {}) {
  return {
    brain: g.brain === 'main' ? 'main' : 'quick', // which brain plays: the quick brain, or the main Brain
    talk: TALK[g.talk] ? g.talk : 'every', // how often Bob comments in the games the app runs (Hangman, Word ladder, Five letters, drop 2)
    keep: g.keep === true // 1.5.206: keep an unfinished game when Bob closes; off until ticked
  };
}
// The games brain. Quick: the small brain on the card (or on the processor with "Keep the graphics card free for quick
// answers"); in the Gaming session the Gaming brain on the processor, so a game of Hangman never touches the card.
// Main: the main Brain, as the chat uses it. Thinking off either way: a one-line tease needs no thinking.
export function gamesBrain(cfg) {
  const g = cleanGames(cfg.games);
  const s = currentSession(cfg);
  if (s.id === 'light') { const m = modelFor(cfg, 'bob'); return m.model ? { model: m.model, cpu: true, think: false, ctx: 8192 } : null; }
  if (g.brain === 'main') { const m = modelFor(cfg, 'bob'); return m.model ? { model: m.model, cpu: Boolean(m.cpu), think: false, ctx: Math.min(m.ctx || 8192, 16384) } : null; }
  const small = sessionBrains(cfg).small;
  return small ? { model: small, cpu: quickOnCpu(cfg), think: false, ctx: 8192 } : null;
}
export function refusal(cfg) {
  if (!cfg.models?.bob && !cfg.sessionBrains?.small) return 'No brain is equipped yet. Equip a Brain on Get models first.';
  return '';
}

// ---------- The words ----------
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const FOUR_SET = new Set(FOUR), FIVE_SET = new Set(FIVE);
let NEIGHBOURS = null;
export function neighbours(word) {
  if (!NEIGHBOURS) {
    NEIGHBOURS = new Map();
    for (const w of FOUR) {
      const r = [];
      for (let i = 0; i < 4; i++) for (const c of LETTERS) { const b = w.slice(0, i) + c + w.slice(i + 1); if (b !== w && FOUR_SET.has(b)) r.push(b); }
      NEIGHBOURS.set(w, r);
    }
  }
  if (NEIGHBOURS.has(word)) return NEIGHBOURS.get(word);
  // 1.5.206: a rung from the dictionary that isn't on the ladder list still leads on to the list's words.
  const r = [];
  if (/^[a-z]{4}$/.test(word)) for (let i = 0; i < 4; i++) for (const c of LETTERS) { const b = word.slice(0, i) + c + word.slice(i + 1); if (b !== word && FOUR_SET.has(b)) r.push(b); }
  return r;
}
export const oneLetterApart = (a, b) => a.length === b.length && [...a].filter((c, i) => c !== b[i]).length === 1;
// Shortest path between two ladder words (both ends included), or null.
export function ladderPath(from, to) {
  if (from === to) return [from];
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const a = q.shift();
    for (const b of neighbours(a)) {
      if (prev.has(b)) continue;
      prev.set(b, a);
      if (b === to) { const p = [to]; let x = a; while (x) { p.unshift(x); x = prev.get(x); } return p; }
      q.push(b);
    }
  }
  return null;
}
// A ladder worth climbing: a start with plenty of neighbours and an end 3 to 5 rungs away.
export function pickLadder(rnd = Math.random, { min = 3, max = 5 } = {}) {
  for (let tries = 0; tries < 200; tries++) {
    const start = FOUR[Math.floor(rnd() * FOUR.length)];
    if (neighbours(start).length < 3) continue;
    const dist = new Map([[start, 0]]);
    const q = [start];
    while (q.length) { const a = q.shift(); if (dist.get(a) >= max) continue; for (const b of neighbours(a)) if (!dist.has(b)) { dist.set(b, dist.get(a) + 1); q.push(b); } }
    const ends = [...dist].filter(([, d]) => d >= min && d <= max).map(([w]) => w);
    if (!ends.length) continue;
    const end = ends[Math.floor(rnd() * ends.length)];
    return { start, end, shortest: dist.get(end) };
  }
  return { start: 'cold', end: 'warm', shortest: ladderPath('cold', 'warm').length - 1 };
}
export const isFour = (w) => FOUR_SET.has(w);
export const isFive = (w) => FIVE_SET.has(w);
// Five letters: the marks for one guess against the answer: g right spot, y in the word elsewhere, b not in the word.
export function markGuess(guess, answer) {
  const g = [...guess], a = [...answer], marks = Array(a.length).fill('b'), left = {};
  for (let i = 0; i < a.length; i++) { if (g[i] === a[i]) marks[i] = 'g'; else left[a[i]] = (left[a[i]] || 0) + 1; }
  for (let i = 0; i < a.length; i++) if (marks[i] !== 'g' && left[g[i]]) { marks[i] = 'y'; left[g[i]]--; }
  return marks.join('');
}
export const maskWord = (word, guessed) => [...word].map((c) => (guessed.includes(c) ? c : '_')).join(' ');
export const clean = (s, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const word = (s) => clean(s, 40).toLowerCase().replace(/[^a-z]/g, '');
// Does the text name the secret (any of its words count)?
export const names = (text, aliases) => { const t = ` ${clean(text).toLowerCase().replace(/[^a-z ]/g, ' ')} `; return aliases.some((a) => t.includes(` ${a.toLowerCase()} `) || t.includes(` ${a.toLowerCase()}s `)); };
// Which dice a story line used: a die counts when its noun is in the line (the article doesn't matter).
export const diceUsed = (text, dice) => { const t = ` ${clean(text).toLowerCase().replace(/[^a-z ]/g, ' ')} `; return dice.map(([, w]) => { const noun = w.replace(/^(a|an|the) /, ''); return t.includes(` ${noun} `) || t.includes(` ${noun}s `); }); };
const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];
const shuffle = (list, rnd) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- 1.5.206: the dictionary, the leak check, the daily puzzle, Bob's new words ----------
const DICT_SETS = {};
// A real word? The dictionary (3 to 12 letters) plus every word the games already use.
export function inDict(w) {
  w = String(w || '').toLowerCase();
  if (!/^[a-z]{3,12}$/.test(w)) return false;
  if (!DICT_SETS[w.length]) DICT_SETS[w.length] = new Set((DICT[w.length] || '').split(' '));
  return DICT_SETS[w.length].has(w) || FOUR_SET.has(w) || FIVE_SET.has(w);
}
// Words Bob never suggests, even when the dictionary has them.
const RUDE = /^(arse|ass|asses|bastard|bitch|bloody|bollocks|boob|boobs|crap|damn|dick|fart|hell|piss|poop|porn|sex|sexy|shit|slut|turd|whore|kill|drunk|drug|drugs|beer|wine|vodka|gun|guns|bomb)$/;
export const politeWord = (w) => !RUDE.test(w);
// The leak check: the secret (and its other answer words), plain, plural or spelled out letter by letter, becomes •••.
export function blankSecret(text, secrets = []) {
  let t = String(text || ''), hit = false;
  for (const s of secrets.filter(Boolean).map((x) => String(x).toLowerCase())) {
    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const plain = new RegExp(`\\b${esc}(?:e?s)?\\b`, 'gi');
    const letters = s.replace(/[^a-z]/g, '');
    const spelled = letters.length >= 3 ? new RegExp(`\\b${[...letters].join('[\\s.\\-,_*]+')}\\b`, 'gi') : null;
    if (plain.test(t)) { hit = true; t = t.replace(plain, '•••'); }
    if (spelled && spelled.test(t)) { hit = true; t = t.replace(spelled, '•••'); }
  }
  return { text: t, hit };
}
// Today's date on this replicant matrix, and a dice roll that's the same for everyone with Bob on that date.
export const dayKey = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function seeded(text) {
  let h = 2166136261;
  for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const dailyRnd = (kind, day) => seeded(`bob-daily|${kind}|${day}`);
const yesterday = (day) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() - 1); return dayKey(d.getTime()); };
// One daily result: the streak counts days in a row you solved it.
export function tallyDaily(scores, kind, day, won) {
  const d = (scores._daily ||= {})[kind] || { last: '', streak: 0, best: 0, days: {} };
  if (d.days[day]) return scores;
  d.days[day] = won ? 'won' : 'lost';
  d.days = Object.fromEntries(Object.entries(d.days).slice(-60));
  if (won) { d.streak = d.last === yesterday(day) && d.streak ? d.streak + 1 : 1; d.best = Math.max(d.best, d.streak); d.last = day; } else { d.streak = 0; d.last = ''; }
  scores._daily[kind] = d;
  return scores;
}
// Bob's new words, kept in <data>/games/words.json: { hangman: { shelf: [...] }, twenty: { kind: [...] } }.
export function loadWords(cfg) { try { const w = JSON.parse(fs.readFileSync(path.join(dir(cfg), 'words.json'), 'utf8')); return { hangman: w.hangman || {}, twenty: w.twenty || {} }; } catch { return { hangman: {}, twenty: {} }; } }
export function saveWords(cfg, words) { try { fs.mkdirSync(dir(cfg), { recursive: true }); const f = path.join(dir(cfg), 'words.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(words, null, 1)); fs.renameSync(f + '.tmp', f); } catch {} }
export const WORDS_MAX = 200;
export function wordsPrompt(what, key) {
  if (what === 'hangman') return `List 25 everyday English words that fit the group "${SHELVES[key]}", one per line, nothing else. Single words of 4 to 12 letters, lower case, no names of people, places or brands, nothing rude.`;
  return `List 25 well-known examples of ${KINDS[key]} for a game of Twenty questions, one per line, nothing else. One or two everyday words each, lower case, no names of people or brands, nothing rude.`;
}
// Which suggested words to keep: real words (every part, for two-word things), polite, new.
export function keepWords(reply, have, what) {
  const seen = new Set(have.map((x) => String(x).toLowerCase()));
  const out = [];
  for (const raw of String(reply || '').split(/[\n,;]+/)) {
    const w = raw.toLowerCase().replace(/^[\s\d.)*•-]+/, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
    if (!w || seen.has(w)) continue;
    const parts = w.split(' ');
    if (what === 'hangman' ? !(parts.length === 1 && w.length >= 4 && w.length <= 12) : parts.length > 2) continue;
    if (!parts.every((x) => inDict(x) && politeWord(x))) continue;
    seen.add(w); out.push(w);
  }
  return out;
}

// ---------- What the brain is told ----------
// Short on purpose: 150 tokens of system prompt, a line of game state, and one line back. E4B does this well.
export const persona = (cfg) => `You are ${cfg.windowsName || 'Bob'}, a friendly AI with a dry sense of humour, playing a quick game with ${cfg.userName || 'your friend'}. Keep it light. One or two short sentences at most, unless told otherwise. No lists, no headings, no emoji.`;
export const BANTER_RULES = 'Never say the secret word, never spell it, never say which letters are in it or how long it is. Tease, cheer or sympathise, nothing more.';
export function teasePrompt(g, moment) {
  if (g.kind === 'hangman') return `We're playing Hangman. The secret word is "${g.word}" (from the shelf ${SHELVES[g.shelf]}). The board shows ${maskWord(g.word, g.guessed)}. Wrong guesses so far: ${g.wrong} of ${g.lives || LIVES}. What just happened: ${moment}. ${BANTER_RULES}`;
  if (g.kind === 'letters') return `We're playing Five letters (guess the five-letter word in six tries). The secret word is "${g.answer}". Guesses so far: ${g.guesses.map((x) => x.word).join(', ') || 'none'}. Try ${g.guesses.length} of ${g.max || TRIES}. What just happened: ${moment}. ${BANTER_RULES}`;
  if (g.kind === 'ladder') return `We're playing Word ladder: from "${g.start}" to "${g.end}", one letter a step, real words only. The rungs so far: ${g.steps.join(' → ')}. The shortest climb is ${g.shortest} steps. What just happened: ${moment}. Don't suggest the next word. Tease, cheer or sympathise, nothing more.`;
  // Drop 2: Bob is never told where his ships are or what his dice show, so there is nothing to give away.
  if (g.kind === 'four') return `We're playing Four in a row (drop counters, four in a line wins). What just happened: ${moment}. Don't give advice about where to play. Tease, cheer or sympathise, nothing more.`;
  if (g.kind === 'fleet') return `We're playing Hidden fleet (each of us hunts the other's hidden ships on a grid). Ships of yours I've sunk: ${g.sunkByYou.length} of ${FLEET.length}. Ships of mine you've sunk: ${g.sunkByBob.length} of ${FLEET.length}. What just happened: ${moment}. Never say where any ship is or where to shoot. Tease, cheer or sympathise, nothing more.`;
  if (g.kind === 'liar') return `We're playing Liar's dice (hidden dice, bids on how many of a face are on the table, or call the bid a lie). You have ${g.bob.length} dice left, I have ${g.you.length}. What just happened: ${moment}. You can't see anyone's dice, so never say what's under the cups. Bluff, tease or sympathise, nothing more.`;
  if (g.kind === 'trivia') return `We're playing Trivia night. Scores: ${g.players.map((p) => `${p.name} ${p.score}`).join(', ')}. What just happened: ${moment}. Tease, cheer or sympathise, nothing more.`;
  return `We're playing ${GAMES[g.kind]?.name || 'a game'}. What just happened: ${moment}.`;
}
export function hintPrompt(g) {
  if (g.kind === 'hangman') return `We're playing Hangman and I asked for a hint. The secret word is "${g.word}", from the shelf ${SHELVES[g.shelf]}. Give one clue about what it is or does, in one sentence, without the word, any part of the word, its letters or its length.`;
  if (g.kind === 'letters') return `We're playing Five letters and I asked for a hint. The secret word is "${g.answer}". Give one clue about its meaning, in one sentence, without the word, any part of it, its letters, or a rhyme.`;
  return '';
}
export function endPrompt(g) {
  const won = g.won === 'you' ? 'I won' : g.won === 'bob' ? 'you won' : g.won === 'both' ? 'we did it together' : 'nobody won';
  if (g.kind === 'hangman') return `Hangman is over: ${won}. The word was "${g.word}"; ${g.wrong} wrong guesses, ${g.hints} hints. Say the word now and one line about the game.`;
  if (g.kind === 'letters') return `Five letters is over: ${won}${g.won === 'you' ? ` in ${g.guesses.length} tries` : ''}. The word was "${g.answer}". Say the word now and one line about the game.`;
  if (g.kind === 'four') return `Four in a row is over: ${won}${g.won === 'both' ? ' (the board filled up, a draw)' : ''}. One line about the game.`;
  if (g.kind === 'fleet') return `Hidden fleet is over: ${won}. I fired ${g.shotsYou.length} shots, you fired ${g.shotsBob.length}. One line about the game.`;
  if (g.kind === 'liar') return `Liar's dice is over: ${won}. One line about the game.`;
  if (g.kind === 'trivia') return `Trivia night is over: ${won}. Final scores: ${g.players.map((p) => `${p.name} ${p.score}`).join(', ')} out of ${g.questions.length}. One line about the night.`;
  if (g.kind === 'ladder') return `Word ladder is over: ${won}. From "${g.start}" to "${g.end}" in ${g.steps.length - 1} steps (shortest ${g.shortest}): ${g.steps.join(' → ')}. One line about the climb.`;
  return `The game is over: ${won}. One line about it.`;
}
// Twenty questions, Bob thinks of something: he answers from the app's secret.
// 1.5.206: he sees his own earlier answers, so he doesn't contradict himself.
export const twentyAnswerPrompt = (g, question) => `We're playing Twenty questions. I'm asking, you answer. Your secret is "${g.secret[0]}" (${KINDS[g.secretKind]}).${g.questions?.length ? ` What you've answered so far, stay consistent with it:\n${g.questions.map((x, i) => `${i + 1}. ${x.q} ${x.a}`).join('\n')}\n` : ' '}Question ${g.asked + 1} of ${QUESTIONS}: "${question}". Start your reply with exactly one of these words: Yes, No, or Sort of. Then at most one short sentence that gives nothing away. Never say the secret or any part of it.`;
// Twenty questions, I think of something: Bob asks, and writes GUESS: when he's sure.
export function twentyAskPrompt(g) {
  const so = g.questions.map((q, i) => `${i + 1}. ${q.q} ${q.a}`).join('\n') || '(nothing yet)';
  const last = g.asked >= QUESTIONS - 1;
  return `We're playing Twenty questions. I'm thinking of something and you're guessing with yes-or-no questions. What you know so far:\n${so}\n${last ? 'That was your last question. Now make your final guess, written exactly as "GUESS: <the thing>" and nothing else.' : `Ask question ${g.asked + 1} of ${QUESTIONS}: one yes-or-no question only, no preamble. If you're sure what it is, instead write exactly "GUESS: <the thing>" and nothing else.`}`;
}
export const ANSWER_WORDS = { yes: 'Yes.', no: 'No.', sortof: 'Sort of.', dunno: "I don't know." };
export const storyLinePrompt = (g, { ending = false } = {}) => {
  const unused = g.dice.filter((d, i) => !g.used[i]).map((d) => d[1]);
  return `We're playing Story dice: a story told a line each. The dice: ${g.dice.map((d) => d[1]).join(', ')}. Still to use: ${unused.join(', ') || 'none, all of them are in'}. The story so far:\n${g.lines.map((l) => l.text).join('\n') || '(nothing yet; you open the story)'}\n${ending ? 'Write the last one or two sentences that end the story, then on a new line "TITLE: <a short title>".' : `Add the next one or two sentences. Work in ${unused.length ? 'one of the dice still to use, naming it plainly' : 'a twist'}. Do not end the story. Sentences only, nothing else.`}`;
};

// ---------- Scores ----------
export const dir = (cfg) => path.join(cfg.dataDir || '.', 'games');
export function loadScores(cfg) { try { return JSON.parse(fs.readFileSync(path.join(dir(cfg), 'scores.json'), 'utf8')) || {}; } catch { return {}; } }
export function saveScores(cfg, scores) {
  try { fs.mkdirSync(dir(cfg), { recursive: true }); const f = path.join(dir(cfg), 'scores.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(scores, null, 1)); fs.renameSync(f + '.tmp', f); } catch {}
}
// One finished game on the scoreboard: played, won (by you), lost (Bob won or the word dropped), drawn (a story, or a climb together), streak of your wins.
export function tally(scores, kind, won) {
  const s = scores[kind] || { played: 0, won: 0, lost: 0, drawn: 0, streak: 0, best: 0 };
  s.played++;
  if (won === 'you') { s.won++; s.streak++; s.best = Math.max(s.best, s.streak); } else if (won === 'bob' || won === 'none') { s.lost++; s.streak = 0; } else s.drawn++;
  scores[kind] = s;
  return scores;
}

// ---------- The game ----------
export const GAMES_WHO = 'games';
export class Games {
  constructor(brain, { now = Date.now, rnd = Math.random } = {}) {
    this.brain = brain; this.now = now; this.rnd = rnd;
    this.game = null; // the live game, one at a time
    this.stop = null; // AbortController while a game holds the brain
    this.busy = false; // Bob is thinking of a line
    this.acting = false; // a move is being worked through
    this.scores = null;
    this.restored = false; // 1.5.206: looked for a kept game yet
  }
  get cfg() { return this.brain.cfg; }
  get bobName() { return this.cfg.windowsName || 'Bob'; }
  emit(ev) { this.brain.broadcast?.({ type: 'games', ...ev }); }
  push() { this.persist(); this.emit({ ev: 'state', ...this.view() }); }

  // ---------- 1.5.206: keep an unfinished game (Settings, 🧩 Games, off until ticked) ----------
  keptFile() { return path.join(dir(this.cfg), 'current.json'); }
  persist() {
    const g = this.game;
    try {
      if (cleanGames(this.cfg.games).keep && g && g.status === 'playing') { fs.mkdirSync(dir(this.cfg), { recursive: true }); fs.writeFileSync(this.keptFile() + '.tmp', JSON.stringify(g)); fs.renameSync(this.keptFile() + '.tmp', this.keptFile()); }
      else if (fs.existsSync(this.keptFile())) fs.rmSync(this.keptFile(), { force: true });
    } catch {}
  }
  restore() {
    if (this.restored) return;
    this.restored = true;
    if (this.game || !cleanGames(this.cfg.games).keep) return;
    let g = null;
    try { g = JSON.parse(fs.readFileSync(this.keptFile(), 'utf8')); } catch { return; }
    if (!g || g.status !== 'playing' || !GAMES[g.kind]) return;
    this.game = g;
    this.stop = new AbortController();
    this.line('app', bobOwes(g) ? 'Picked up where we left off. My move: press Carry on.' : 'Picked up where we left off.');
  }

  // What the page (and the phone) sees. The secret never leaves until the game is over.
  view() {
    this.restore();
    const g = this.game;
    const pub = g ? this.publicGame(g) : null;
    if (!this.scores) this.scores = loadScores(this.cfg);
    const words = loadWords(this.cfg), day = dayKey(this.now());
    const daily = Object.fromEntries(HAS_DAILY.map((k) => { const d = this.scores._daily?.[k] || {}; return [k, { today: d.days?.[day] || '', streak: d.last === day || d.last === yesterday(day) ? d.streak || 0 : 0, best: d.best || 0 }]; }));
    const extra = { hangman: Object.fromEntries(Object.keys(SHELVES).map((k) => [k, (words.hangman[k] || []).length])), twenty: Object.fromEntries(Object.keys(KINDS).map((k) => [k, (words.twenty[k] || []).length])) };
    return { game: pub, busy: this.busy, scores: this.scores, settings: cleanGames(this.cfg.games), refusal: refusal(this.cfg), games: GAMES, talk: TALK, levels: LEVELS, hasLevel: HAS_LEVEL, hasDaily: HAS_DAILY, daily, day, extra, shelves: SHELVES, kinds: KINDS, bobNet: (this.brain.lenders?.bobs?.() || []).length };
  }
  publicGame(g) {
    const over = g.status === 'over';
    const base = { id: g.id, kind: g.kind, name: GAMES[g.kind].name, icon: GAMES[g.kind].icon, status: g.status, won: g.won || '', log: g.log, started: g.started, level: g.level || '', daily: g.daily || '', carry: !over && !this.busy && !this.acting && bobOwes(g) };
    if (g.kind === 'twenty') return { ...base, role: g.role, secretKind: g.secretKind, asked: g.asked, max: QUESTIONS, questions: g.questions, guessing: Boolean(g.pending), pendingGuess: g.pending || '', secret: over && g.secret ? g.secret[0] : '' };
    if (g.kind === 'hangman') return { ...base, shelf: SHELVES[g.shelf], masked: maskWord(g.word, g.guessed), guessed: g.guessed, wrong: g.wrong, lives: g.lives || LIVES, hints: g.hints, word: over ? g.word : '', length: g.word.length };
    if (g.kind === 'ladder') return { ...base, start: g.start, end: g.end, steps: g.steps, shortest: g.shortest, together: g.together, whose: g.whose, hints: g.hints, path: over ? g.path : null };
    if (g.kind === 'letters') return { ...base, guesses: g.guesses, max: g.max || TRIES, hints: g.hints, anyLetters: g.level === 'easy', answer: over ? g.answer : '' };
    if (g.kind === 'story') return { ...base, dice: g.dice, used: g.used, lines: g.lines, whose: g.whose, round: g.round, max: STORY_ROUNDS, title: g.title || '' };
    if (g.kind === 'four') return { ...base, board: g.board, cols: COLS, rows: ROWS, turn: g.turn, last: g.last ?? -1, win: g.win || null };
    if (g.kind === 'fleet') {
      // Your sea: your ships and my shots. My sea: only your shots, hit or miss, and the ships you've sunk; all of it once it's over.
      const mineHit = (i) => g.mine.some((s) => s.cells.includes(i));
      const theirsHit = (i) => g.theirs.some((s) => s.cells.includes(i));
      const sunkCells = g.theirs.filter((s) => g.sunkByYou.includes(s.name)).flatMap((s) => s.cells);
      return { ...base, size: SEA, turn: g.turn, fired: g.shotsYou.length > 0,
        mine: { ships: g.mine.map((s) => ({ name: s.name, size: s.size, cells: s.cells, sunk: g.sunkByBob.includes(s.name) })), shots: g.shotsBob.map((i) => ({ i, hit: mineHit(i) })) },
        theirs: { shots: g.shotsYou.map((i) => ({ i, hit: theirsHit(i) })), sunk: sunkCells, ships: over ? g.theirs.map((s) => ({ name: s.name, size: s.size, cells: s.cells })) : null },
        fleet: FLEET.map(([name, size]) => ({ name, size, yours: !g.sunkByBob.includes(name), mine: !g.sunkByYou.includes(name) })) };
    }
    if (g.kind === 'liar') return { ...base, yours: g.you, mine: over ? g.bob : null, mineCount: g.bob.length, bid: g.bid, bidBy: g.bidBy, turn: g.turn, wild: g.wild, round: g.round, reveal: g.reveal || null, total: g.you.length + g.bob.length };
    if (g.kind === 'trivia') {
      const q = g.questions[g.at];
      const done = g.questions.slice(0, g.at).map((x, i) => ({ q: x.q, choices: x.choices, right: x.right, answers: g.answers[i] || {} }));
      return { ...base, at: g.at, of: g.questions.length, players: g.players.map(({ id, name, score, net }) => ({ id, name, score, net: Boolean(net) })),
        question: q && !over ? { q: q.q, choices: q.choices, shelf: TRIVIA_SHELVES[q.shelf] || '', answered: Boolean(g.answers[g.at]?.you) } : null, done };
    }
    return base;
  }
  line(who, text, extra = {}) { this.game.log.push({ who, text: clean(text, 1200), at: this.now(), ...extra }); }

  // Start a game. Nothing has run before this.
  async start(b = {}) {
    this.restore();
    const kind = GAME_IDS.includes(b.kind) ? b.kind : null;
    if (!kind) throw new Error('Pick a game first.');
    const why = refusal(this.cfg);
    if (why) throw new Error(why);
    if (!this.scores) this.scores = loadScores(this.cfg);
    const daily = b.daily === true && HAS_DAILY.includes(kind) ? dayKey(this.now()) : '';
    if (daily && this.scores._daily?.[kind]?.days?.[daily]) throw new Error("You've done today's puzzle. A new one comes tomorrow.");
    if (this.game && this.game.status === 'playing') await this.end({ quiet: true });
    const rnd = daily ? dailyRnd(kind, daily) : this.rnd;
    const level = daily ? 'normal' : HAS_LEVEL.includes(kind) ? cleanLevel(b.level) : '';
    const words = loadWords(this.cfg);
    const g = { id: crypto.randomBytes(5).toString('hex'), kind, status: 'playing', won: '', log: [], started: this.now(), hints: 0, level, daily };
    if (kind === 'twenty') {
      g.role = b.role === 'think' ? 'think' : 'guess'; // guess: Bob thinks of something, you guess. think: you think, Bob guesses.
      g.asked = 0; g.questions = []; g.pending = '';
      if (g.role === 'guess') {
        const extra = Object.entries(words.twenty).flatMap(([k, list]) => (KINDS[k] ? list.map((w) => [k, w]) : []));
        const s = pick([...SECRETS, ...extra], this.rnd); g.secretKind = s[0]; g.secret = s.slice(1);
      } else g.secretKind = '';
    } else if (kind === 'hangman') {
      const r = LEVEL_RULES.hangman[level];
      g.shelf = SHELVES[b.shelf] ? b.shelf : pick(Object.keys(HANGMAN), this.rnd);
      const all = [...new Set([...HANGMAN[g.shelf], ...(words.hangman[g.shelf] || [])])];
      const fit = all.filter((w) => w.length >= r.len[0] && w.length <= r.len[1]);
      g.word = pick(fit.length >= 5 ? fit : all, this.rnd); g.guessed = []; g.wrong = 0; g.lives = r.lives;
    } else if (kind === 'ladder') {
      Object.assign(g, pickLadder(rnd, LEVEL_RULES.ladder[level])); g.steps = [g.start]; g.together = !daily && b.together === true; g.whose = 'you'; g.path = null;
    } else if (kind === 'letters') {
      g.answer = pick(FIVE, rnd); g.guesses = []; g.max = LEVEL_RULES.letters[level].tries;
    } else if (kind === 'story') {
      g.dice = shuffle(DICE, this.rnd).slice(0, DICE_COUNT); g.used = g.dice.map(() => false); g.lines = []; g.round = 0; g.whose = b.bobStarts === true ? 'bob' : 'you'; g.title = '';
    } else if (kind === 'four') {
      g.board = emptyBoard(); g.turn = b.bobStarts === true ? 'bob' : 'you'; g.win = null; g.last = -1;
    } else if (kind === 'fleet') {
      g.mine = placeFleet(this.rnd); g.theirs = placeFleet(this.rnd); g.shotsYou = []; g.shotsBob = []; g.sunkByYou = []; g.sunkByBob = []; g.turn = 'you';
    } else if (kind === 'liar') {
      g.wild = b.wild !== false; g.you = roll(LIAR_DICE, this.rnd); g.bob = roll(LIAR_DICE, this.rnd); g.bid = null; g.bidBy = ''; g.round = 1; g.reveal = null;
      g.turn = b.bobStarts === true ? 'bob' : 'you';
    } else if (kind === 'trivia') {
      const lv = TRIVIA_LEVELS[level];
      const recent = new Set(this.scores._recent?.trivia || []);
      const pool = TRIVIA.map((q, i) => ({ q, i })).filter((x) => lv.includes(x.q[1]));
      const fresh = pool.filter((x) => !recent.has(x.i));
      const chosen = shuffle(fresh.length >= TRIVIA_ROUNDS ? fresh : pool, this.rnd).slice(0, TRIVIA_ROUNDS);
      g.questions = chosen.map(({ q, i }) => { const choices = shuffle(q.slice(3), this.rnd); return { n: i, shelf: q[0], q: q[2], choices, right: LETTERS4[choices.indexOf(q[3])] }; });
      this.scores._recent = { ...(this.scores._recent || {}), trivia: [...(this.scores._recent?.trivia || []), ...chosen.map((x) => x.i)].slice(-60) };
      g.at = 0; g.answers = [];
      g.players = [{ id: 'you', name: this.cfg.userName || 'You', score: 0 }, { id: 'bob', name: this.bobName, score: 0 }];
      if (b.withBobs === true && this.brain.lenders?.bobs) {
        const bobs = this.brain.lenders.bobs().slice(0, 4);
        const seen = await Promise.all(bobs.map((x) => this.brain.lenders.hello(x).catch(() => ({ ok: false }))));
        bobs.forEach((x, i) => { if (seen[i]?.ok) g.players.push({ id: `net:${x.address}`, name: x.name || x.address, address: x.address, score: 0, net: true }); });
        g.netAsked = bobs.length; // how many were asked, so the opening line can say who couldn't come
      }
    }
    this.game = g;
    this.stop = new AbortController();
    this.push();
    const lvl = level && level !== 'normal' ? ` (${LEVELS[level]})` : '';
    const today = daily ? "Today's puzzle, the same for everyone with Bob today. " : '';
    // The opening line. Twenty questions and Story dice are brain games, so Bob speaks first when it's his turn.
    if (kind === 'twenty' && g.role === 'guess') this.line('app', `I'm thinking of ${KINDS[g.secretKind]}. Ask me anything with a yes-or-no answer, or take a guess. Twenty questions, then I win.`);
    else if (kind === 'twenty') { this.line('app', `Think of something, anything, and keep it to yourself. I'll ask up to twenty yes-or-no questions.`); await this.bobAsks(); }
    else if (kind === 'hangman') this.line('app', `A word from the shelf ${SHELVES[g.shelf]}, ${g.word.length} letters. ${num(g.lives)} wrong guesses and it drops.${lvl}`);
    else if (kind === 'ladder') this.line('app', `${today}Climb from ${g.start.toUpperCase()} to ${g.end.toUpperCase()}. One letter a step, real words only. The shortest climb is ${g.shortest} steps.${g.together ? ' We take turns: you first.' : ''}${lvl}`);
    else if (kind === 'letters') this.line('app', `${today}Five letters, ${num(g.max).toLowerCase()} tries. Each try colours the letters: green in the right spot, yellow in the word somewhere else, grey not in it.${level === 'easy' ? ' Any five letters count.' : ' Real words only; a word I don\'t know doesn\'t cost a try.'}${lvl}`);
    else if (kind === 'story') { this.line('app', `The dice came up: ${g.dice.map((d) => `${d[0]} ${d[1]}`).join(', ')}. ${g.whose === 'you' ? 'You open the story; a line each until every die is in.' : 'I open the story; a line each until every die is in.'}`); if (g.whose === 'bob') await this.bobStoryLine(); }
    else if (kind === 'four') { this.line('app', `Seven columns, six rows. Four of yours in a line wins: across, down or slanting. ${g.turn === 'you' ? 'You go first.' : 'I go first.'}${lvl}`); if (g.turn === 'bob') await this.bobFour(); }
    else if (kind === 'fleet') this.line('app', `Your five ships are on the left: Flagship (5), Cruiser (4), Frigate (3), Submarine (3), Patrol boat (2). Mine are hidden on the right. Shuffle yours until you like them, then call a square on my sea. You fire first.${lvl}`);
    else if (kind === 'liar') { this.line('app', `Five dice each, hidden. Bid how many of a face are on the table, counting both cups${g.wild ? ' (ones are wild: they count as any face)' : ''}, or call the last bid a lie. Whoever's wrong loses a die. ${g.turn === 'you' ? 'You bid first.' : 'I bid first.'}${lvl}`); if (g.turn === 'bob') await this.bobLiar(); }
    else if (kind === 'trivia') {
      const net = g.players.filter((p) => p.net).map((p) => p.name);
      const missing = (g.netAsked || 0) - net.length;
      this.line('app', `Ten questions, four choices each. Pick yours; then ${net.length ? `${net.join(', ')} and I answer` : 'I answer'}, and the app marks everyone. A point for each right answer.${missing > 0 ? ` ${missing} Bob${missing === 1 ? '' : 's'} on your Bob-Net couldn't come.` : ''}${lvl}`);
    }
    this.push();
    return this.view();
  }

  // ---------- Bob speaks ----------
  // secret: words the app blanks out of the reply (the leak check); a line with a secret is never streamed, so nothing
  // shows on screen before it's been checked.
  async say(user, { system = persona(this.cfg), stream = true, secret = null, raw = false } = {}) {
    const b = gamesBrain(this.cfg);
    if (!b) throw new Error(refusal(this.cfg) || 'No brain for games.');
    const signal = this.stop?.signal;
    this.busy = true; this.push();
    try {
      const model = (await this.brain.ensureModel(b.model, (ev) => { if (ev.type === 'announce') this.emit({ ev: 'announce', text: ev.text }); }, signal, GAMES_WHO, { cpu: b.cpu, ctx: b.ctx, what: 'a game' })) || b.model;
      const onToken = stream && !secret ? (t) => this.emit({ ev: 'token', text: t }) : undefined;
      const reply = await this.brain.chatSafe({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], signal, cpu: b.cpu, think: b.think, ctx: b.ctx, onToken }, { emit: () => {}, who: GAMES_WHO });
      if (raw) return String(reply?.content || '').slice(0, 4000); // a list, line breaks kept
      const text = clean(String(reply?.content || ''), 600).replace(/^["“]|["”]$/g, '');
      return secret ? blankSecret(text, secret).text : text;
    } finally { this.busy = false; }
  }
  // The words that must not slip mid-game: the Hangman word, the Five letters answer, the Twenty questions secret.
  secretOf(g = this.game) {
    if (!g || g.status !== 'playing') return null;
    if (g.kind === 'hangman') return [g.word];
    if (g.kind === 'letters') return [g.answer];
    if (g.kind === 'twenty' && g.role === 'guess') return g.secret;
    return null;
  }
  // A tease after a move, if the setting says so now. Failures are quiet: the game goes on without the line.
  async tease(moment, { always = false } = {}) {
    const t = cleanGames(this.cfg.games).talk;
    if (!always && (t === 'end' || (t === 'some' && this.rnd() < 0.6))) return;
    try { const text = await this.say(teasePrompt(this.game, moment), { secret: this.secretOf() }); if (text) this.line('bob', text); } catch (e) { if (!this.stop?.signal.aborted) this.line('app', `I lost my words for a moment (${clean(e.message, 120)}). The game goes on.`); }
  }
  async finish(won) {
    const g = this.game;
    g.status = 'over'; g.won = won;
    if (g.kind === 'ladder') g.path = ladderPath(g.start, g.end);
    this.scores = tally(this.scores || loadScores(this.cfg), g.kind, won);
    if (g.daily) this.scores = tallyDaily(this.scores, g.kind, g.daily, won === 'you');
    saveScores(this.cfg, this.scores);
    if (g.daily) { const d = this.scores._daily[g.kind]; this.line('app', won === 'you' ? `Today's puzzle: solved. ${d.streak} day${d.streak === 1 ? '' : 's'} in a row (best ${d.best}). A new one comes tomorrow.` : "Today's puzzle got away. A new one comes tomorrow."); }
    if (g.kind !== 'twenty' && g.kind !== 'story') { try { const text = await this.say(endPrompt(g)); if (text) this.line('bob', text); } catch {} }
    this.letGo();
    this.push();
  }
  letGo() {
    const s = this.stop?.signal;
    this.stop = null; this.busy = false;
    if (s) { try { this.brain.gate?.done(s); } catch {} }
    setTimeout(() => this.brain.settle?.().catch?.(() => {}), 0);
  }
  async end({ quiet = false } = {}) {
    const g = this.game;
    if (!g) return this.view();
    if (g.status === 'playing') {
      this.stop?.abort(new Error('ended'));
      g.status = 'over'; g.won = 'none';
      if (g.kind === 'hangman') this.line('app', `Game stopped. The word was ${g.word.toUpperCase()}.`);
      else if (g.kind === 'letters') this.line('app', `Game stopped. The word was ${g.answer.toUpperCase()}.`);
      else if (g.kind === 'ladder') { g.path = ladderPath(g.steps.at(-1), g.end); this.line('app', `Climb stopped. One way up: ${(ladderPath(g.start, g.end) || []).map((w) => w.toUpperCase()).join(' → ')}.`); }
      else if (g.kind === 'twenty' && g.role === 'guess') this.line('app', `Game stopped. It was ${g.secret[0]}.`);
      else this.line('app', 'Game stopped.');
      if (!quiet) {
        this.scores = tally(this.scores || loadScores(this.cfg), g.kind, 'none');
        if (g.daily) this.scores = tallyDaily(this.scores, g.kind, g.daily, false);
        saveScores(this.cfg, this.scores);
      }
      this.letGo();
    }
    if (quiet) this.game = null;
    this.push();
    return this.view();
  }
  close() { if (this.game?.status === 'over') this.game = null; this.push(); return this.view(); }

  // ---------- 1.5.206: Bob suggests new words; the dictionary decides ----------
  async newWords(b = {}) {
    const what = b.what === 'twenty' ? 'twenty' : 'hangman';
    const list = what === 'hangman' ? SHELVES : KINDS;
    const key = list[b.key] ? b.key : null;
    if (!key) throw new Error(what === 'hangman' ? 'Pick a shelf.' : 'Pick a kind of thing.');
    if (this.game?.status === 'playing') throw new Error('Finish or stop the game first.');
    const why = refusal(this.cfg); if (why) throw new Error(why);
    const words = loadWords(this.cfg);
    const mine = (words[what][key] ||= []);
    if (mine.length >= WORDS_MAX) throw new Error(`That one is full: ${WORDS_MAX} new words already.`);
    const have = what === 'hangman' ? [...HANGMAN[key], ...mine] : [...SECRETS.flatMap((s) => s.slice(1)), ...mine];
    this.stop = new AbortController();
    let reply = '';
    try { reply = await this.say(wordsPrompt(what, key), { system: `${persona(this.cfg)} When asked for a list, give the list only.`, stream: false, raw: true }); }
    finally { this.letGo(); }
    const added = keepWords(reply, have, what).slice(0, WORDS_MAX - mine.length);
    mine.push(...added);
    saveWords(this.cfg, words);
    this.push();
    return { ...this.view(), added, what, key };
  }
  forgetWords(b = {}) {
    const words = loadWords(this.cfg);
    if (b.what === 'hangman' || b.what === 'twenty') { if (b.key) delete words[b.what][b.key]; else words[b.what] = {}; } else { words.hangman = {}; words.twenty = {}; }
    saveWords(this.cfg, words);
    this.push();
    return this.view();
  }

  // ---------- A move ----------
  async act(b = {}) {
    this.restore();
    const g = this.game;
    if (!g || g.status !== 'playing') throw new Error('No game on. Press Start first.');
    if (this.busy || this.acting) throw new Error("Hold on, I'm still talking.");
    this.acting = true;
    try {
      if (b.carry === true) { if (!bobOwes(g)) throw new Error('Your move.'); if (!this.stop) this.stop = new AbortController(); await this.carryOn(); }
      else if (g.kind === 'twenty') await this.actTwenty(b);
      else if (g.kind === 'hangman') await this.actHangman(b);
      else if (g.kind === 'ladder') await this.actLadder(b);
      else if (g.kind === 'letters') await this.actLetters(b);
      else if (g.kind === 'story') await this.actStory(b);
      else if (g.kind === 'four') await this.actFour(b);
      else if (g.kind === 'fleet') await this.actFleet(b);
      else if (g.kind === 'liar') await this.actLiar(b);
      else if (g.kind === 'trivia') await this.actTrivia(b);
    } finally { this.acting = false; }
    this.push();
    return this.view();
  }
  // Bob's move that was due when the game was put away (a kept game picked up again).
  async carryOn() {
    const g = this.game;
    if (g.kind === 'twenty') return this.bobAsks();
    if (g.kind === 'story') return this.bobStoryLine();
    if (g.kind === 'four') return this.bobFour();
    if (g.kind === 'fleet') return this.bobFleet();
    if (g.kind === 'liar') return this.bobLiar();
    if (g.kind === 'trivia') return this.triviaReveal();
  }

  async actTwenty(b) {
    const g = this.game;
    if (g.role === 'guess') {
      const q = clean(b.guess || b.ask || '', 200);
      if (!q) throw new Error('Ask a question or take a guess.');
      const guess = 'guess' in b;
      this.line('you', q);
      g.asked++;
      if (names(q, g.secret)) { g.questions.push({ q, a: 'Yes!' }); this.line('app', `Yes! It was ${g.secret[0]}. ${g.asked} question${g.asked === 1 ? '' : 's'}.`); return this.finish('you'); }
      if (guess) {
        g.questions.push({ q, a: 'No.' });
        this.line('bob', g.asked >= QUESTIONS ? 'No.' : `No, not ${q}.`);
      } else {
        let text = '';
        try { text = await this.say(twentyAnswerPrompt({ ...g, asked: g.asked - 1 }, q), { secret: g.secret }); } catch (e) { if (this.stop?.signal.aborted) return; text = ''; }
        const m = /^(yes|no|sort of)\b/i.exec(text || '');
        const a = m ? (m[1].toLowerCase() === 'sort of' ? 'Sort of.' : m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + '.') : '';
        if (!text) text = 'Hmm. Ask me that another way.';
        g.questions.push({ q, a: a || '?' });
        this.line('bob', text);
      }
      if (g.asked >= QUESTIONS) { this.line('app', `That was twenty. It was ${g.secret[0]}. My point.`); return this.finish('bob'); }
      return;
    }
    // You think of something: Bob asked, you answer; or Bob guessed, you say right or wrong.
    if (g.pending) {
      if (b.right === true) { this.line('you', 'Right!'); this.line('app', `I got it in ${g.asked} question${g.asked === 1 ? '' : 's'}: ${g.pending}.`); g.pending = ''; return this.finish('bob'); }
      if (b.right === false) {
        this.line('you', `No, it isn't ${g.pending}.`); g.questions.push({ q: `Is it ${g.pending}?`, a: 'No.' }); g.pending = '';
        if (g.asked >= QUESTIONS) { const it = clean(b.reveal || '', 60); this.line('app', `Twenty questions and I never got it${it ? `: ${it}` : ''}. Your point.`); return this.finish('you'); }
        return this.bobAsks();
      }
      throw new Error('Was my guess right or wrong?');
    }
    const a = ANSWER_WORDS[b.answer];
    if (!a) throw new Error('Answer Yes, No, Sort of or I don\'t know.');
    if (!g.questions.length || g.questions.at(-1).a) throw new Error('No question to answer yet: press Carry on.');
    this.line('you', a);
    g.questions[g.questions.length - 1].a = a;
    return this.bobAsks();
  }
  // Bob's next yes-or-no question, or his guess (GUESS: ...).
  async bobAsks() {
    const g = this.game;
    let text = '';
    try { text = await this.say(twentyAskPrompt(g)); } catch (e) { if (this.stop?.signal.aborted) return; text = ''; }
    const m = /guess\s*:\s*(.+)$/i.exec(text) || (g.asked >= QUESTIONS ? [null, text] : null);
    if (m) {
      const thing = clean(m[1], 60).replace(/[.!?]+$/, '').replace(/^(is it|it's|it is)\s+/i, '');
      g.pending = thing || 'that';
      g.asked = Math.max(g.asked, Math.min(QUESTIONS, g.asked + 1));
      this.line('bob', `Is it ${g.pending}?`, { guess: true });
      return;
    }
    if (!text) text = 'Is it something you could hold in one hand?';
    if (!/\?$/.test(text)) text = text.replace(/[.!]+$/, '') + '?';
    g.asked++;
    g.questions.push({ q: text, a: '' });
    this.line('bob', text);
  }

  async actHangman(b) {
    const g = this.game, lives = g.lives || LIVES;
    if (b.hint === true) {
      g.hints++; g.wrong++;
      let text = '';
      try { text = await this.say(hintPrompt(g), { secret: [g.word] }); } catch { text = ''; }
      this.line('bob', text || `It's on the shelf ${SHELVES[g.shelf]}; that's all you get.`, { hint: true });
      if (g.wrong >= lives) { this.line('app', `That hint cost the last life. The word was ${g.word.toUpperCase()}.`); return this.finish('bob'); }
      return;
    }
    if (b.word) {
      const w = word(b.word);
      if (w.length < 2) throw new Error('Type the whole word.');
      this.line('you', w.toUpperCase());
      if (w === g.word) { g.guessed = [...new Set([...g.guessed, ...g.word])]; this.line('app', `${g.word.toUpperCase()} it is, with ${lives - g.wrong} ${lives - g.wrong === 1 ? 'life' : 'lives'} to spare.`); return this.finish('you'); }
      g.wrong++;
      if (g.wrong >= lives) { this.line('app', `Not ${w.toUpperCase()}, and that was the last life. The word was ${g.word.toUpperCase()}.`); return this.finish('bob'); }
      return this.tease(`a whole-word guess, "${w}", and it was wrong`);
    }
    const c = word(b.letter).slice(0, 1);
    if (!c) throw new Error('Pick a letter.');
    if (g.guessed.includes(c)) throw new Error(`You tried ${c.toUpperCase()} already.`);
    g.guessed.push(c);
    const hit = g.word.includes(c);
    if (!hit) g.wrong++;
    this.line('you', c.toUpperCase(), { hit });
    if ([...g.word].every((x) => g.guessed.includes(x))) { this.line('app', `${g.word.toUpperCase()}! Solved with ${lives - g.wrong} ${lives - g.wrong === 1 ? 'life' : 'lives'} to spare.`); return this.finish('you'); }
    if (g.wrong >= lives) { this.line('app', `No ${c.toUpperCase()}, and that was the last life. The word was ${g.word.toUpperCase()}.`); return this.finish('bob'); }
    return this.tease(hit ? `the letter ${c.toUpperCase()}, which is in the word` : `the letter ${c.toUpperCase()}, which isn't in the word (${lives - g.wrong} ${lives - g.wrong === 1 ? 'life' : 'lives'} left)`);
  }

  async actLadder(b) {
    const g = this.game;
    const here = g.steps.at(-1);
    if (b.hint === true) {
      const p = ladderPath(here, g.end);
      g.hints++;
      this.line('app', p && p.length > 1 ? `A rung that works from here: ${p[1].toUpperCase()}.` : 'No way up from here; step back.', { hint: true });
      return;
    }
    if (b.back === true) {
      if (g.steps.length < 2) throw new Error("You're on the first rung.");
      g.steps.pop(); if (g.together) g.steps.pop();
      if (!g.steps.length) g.steps = [g.start];
      this.line('app', `Back to ${g.steps.at(-1).toUpperCase()}.`);
      return;
    }
    const w = word(b.word);
    if (w.length !== 4) throw new Error('Four letters.');
    if (!oneLetterApart(w, here)) throw new Error(`${w.toUpperCase()} isn't one letter away from ${here.toUpperCase()}.`);
    if (!isFour(w) && !inDict(w)) throw new Error(`${w.toUpperCase()} isn't in my dictionary.`);
    if (g.steps.includes(w)) throw new Error(`${w.toUpperCase()} is already on the ladder.`);
    g.steps.push(w);
    this.line('you', w.toUpperCase());
    if (w === g.end) { this.line('app', `${g.end.toUpperCase()}! ${g.steps.length - 1} steps${g.steps.length - 1 <= g.shortest ? ', the shortest way' : ` (shortest ${g.shortest})`}${g.hints ? `, ${g.hints} hint${g.hints === 1 ? '' : 's'}` : ''}.`); return this.finish(g.together ? 'both' : 'you'); }
    if (g.together) {
      const p = ladderPath(w, g.end);
      const next = p && p.length > 1 ? p[1] : neighbours(w).find((x) => !g.steps.includes(x));
      if (!next) { this.line('app', `I'm stuck too: nothing leads on from ${w.toUpperCase()}. Step back.`); return; }
      g.steps.push(next);
      this.line('bob', next.toUpperCase(), { step: true });
      if (next === g.end) { this.line('app', `${g.end.toUpperCase()}! We did it in ${g.steps.length - 1} steps.`); return this.finish('both'); }
      return this.tease(`you climbed to ${w.toUpperCase()} and I climbed to ${next.toUpperCase()}`);
    }
    if (!neighbours(w).some((x) => !g.steps.includes(x))) { this.line('app', `Dead end: nothing leads on from ${w.toUpperCase()}. Step back.`); return; }
    return this.tease(`you climbed to ${w.toUpperCase()}, ${g.steps.length - 1} step${g.steps.length - 1 === 1 ? '' : 's'} so far`);
  }

  async actLetters(b) {
    const g = this.game, max = g.max || TRIES;
    if (b.hint === true) {
      g.hints++;
      let text = '';
      try { text = await this.say(hintPrompt(g), { secret: [g.answer] }); } catch { text = ''; }
      g.guesses.push({ word: '', marks: '', hint: true });
      this.line('bob', text || 'No hint came to me. That one still cost a try.', { hint: true });
      if (g.guesses.length >= max) { this.line('app', `That hint was the last try. The word was ${g.answer.toUpperCase()}.`); return this.finish('bob'); }
      return;
    }
    const w = word(b.word);
    if (w.length !== 5) throw new Error('Five letters.');
    if (g.guesses.some((x) => x.word === w)) throw new Error(`You tried ${w.toUpperCase()} already.`);
    // 1.5.206: any real word counts (about 4,500 of them); a made-up one is turned back and costs nothing. Easy takes any letters.
    if (g.level !== 'easy' && !isFive(w) && !inDict(w)) throw new Error(`${w.toUpperCase()} isn't in my dictionary. That one didn't cost a try.`);
    const marks = markGuess(w, g.answer);
    g.guesses.push({ word: w, marks });
    this.line('you', w.toUpperCase(), { marks });
    if (w === g.answer) { this.line('app', `${g.answer.toUpperCase()} in ${g.guesses.length} ${g.guesses.length === 1 ? 'try' : 'tries'}.`); return this.finish('you'); }
    if (g.guesses.length >= max) { this.line('app', `${num(max)} tries gone. The word was ${g.answer.toUpperCase()}.`); return this.finish('bob'); }
    const greens = [...marks].filter((m) => m === 'g').length, yellows = [...marks].filter((m) => m === 'y').length;
    return this.tease(`the guess ${w.toUpperCase()}: ${greens} in the right spot, ${yellows} in the word elsewhere, ${max - g.guesses.length} tries left`);
  }

  async actStory(b) {
    const g = this.game;
    if (b.end === true) return this.storyEnd();
    if (g.whose !== 'you') throw new Error('My line; one moment.');
    const text = clean(b.line, 600);
    if (!text) throw new Error('Write a line of the story.');
    g.lines.push({ who: 'you', text });
    this.line('you', text);
    diceUsed(text, g.dice).forEach((u, i) => { if (u) g.used[i] = true; });
    if (g.used.every(Boolean)) return this.storyEnd();
    g.whose = 'bob';
    return this.bobStoryLine();
  }
  async bobStoryLine() {
    const g = this.game;
    let text = '';
    try { text = await this.say(storyLinePrompt(g)); } catch (e) { if (this.stop?.signal.aborted) return; text = ''; }
    if (!text) text = 'And then, just as nobody expected it, the door opened.';
    text = text.replace(/\s*TITLE:.*$/i, '');
    g.lines.push({ who: 'bob', text });
    this.line('bob', text);
    diceUsed(text, g.dice).forEach((u, i) => { if (u) g.used[i] = true; });
    g.round++;
    g.whose = 'you';
    if (g.used.every(Boolean) || g.round >= STORY_ROUNDS) return this.storyEnd();
  }
  async storyEnd() {
    const g = this.game;
    g.whose = 'bob';
    let text = '';
    try { text = await this.say(storyLinePrompt(g, { ending: true })); } catch { text = ''; }
    const m = /TITLE:\s*(.+)$/i.exec(text);
    g.title = m ? clean(m[1], 80).replace(/^["“]|["”]$/g, '') : 'Our story';
    const last = clean(text.replace(/\s*TITLE:.*$/i, ''), 600) || 'The end.';
    g.lines.push({ who: 'bob', text: last });
    this.line('bob', last);
    diceUsed(last, g.dice).forEach((u, i) => { if (u) g.used[i] = true; });
    const left = g.used.filter((u) => !u).length;
    this.line('app', `"${g.title}". ${left ? `${left} ${left === 1 ? 'die' : 'dice'} never made it in.` : 'Every die made it in.'}`);
    return this.finish('both');
  }

  // ---------- Four in a row ----------
  async actFour(b) {
    const g = this.game;
    if (g.turn !== 'you') throw new Error('My move; one moment.');
    const col = Number(b.col);
    if (!Number.isInteger(col) || col < 0 || col >= COLS) throw new Error('Pick a column.');
    const r = drop(g.board, col, 'you');
    if (r < 0) throw new Error('That column is full.');
    g.last = col;
    this.line('you', `Column ${col + 1}`);
    if (await this.fourOver()) return;
    g.turn = 'bob';
    return this.bobFour();
  }
  async fourOver() {
    const g = this.game;
    const w = fourWinner(g.board);
    if (w) { g.win = w; this.line('app', w.who === 'you' ? 'Four in a row. Yours.' : 'Four in a row. Mine.'); await this.finish(w.who === 'you' ? 'you' : 'bob'); return true; }
    if (boardFull(g.board)) { this.line('app', 'The board is full: a draw.'); await this.finish('both'); return true; }
    return false;
  }
  async bobFour() {
    const g = this.game;
    const col = fourMove(g.board, g.level || 'normal', this.rnd);
    drop(g.board, col, 'bob');
    g.last = col; g.turn = 'you';
    this.line('bob', `Column ${col + 1}`, { step: true });
    if (await this.fourOver()) return;
    return this.tease(`you dropped a counter and I answered in column ${col + 1}`);
  }

  // ---------- Hidden fleet ----------
  async actFleet(b) {
    const g = this.game;
    if (b.shuffle === true) {
      if (g.shotsYou.length) throw new Error('The ships are at sea now; no moving them.');
      g.mine = placeFleet(this.rnd);
      return;
    }
    if (g.turn !== 'you') throw new Error('My shot; one moment.');
    const i = Number.isInteger(b.cell) ? b.cell : parseCell(b.shoot);
    if (!(i >= 0 && i < SEA * SEA)) throw new Error('Pick a square on my sea, like B7.');
    if (g.shotsYou.includes(i)) throw new Error(`You fired at ${cellName(i)} already.`);
    const r = fireAt(g.theirs, g.shotsYou, i);
    if (r.result === 'sunk') g.sunkByYou.push(r.ship);
    this.line('you', `${cellName(i)}: ${r.result === 'miss' ? 'miss' : r.result === 'hit' ? 'hit' : `hit, and you sank my ${r.ship}`}`, { hit: r.result !== 'miss' });
    if (r.all) { this.line('app', 'My whole fleet is down. Yours.'); return this.finish('you'); }
    g.turn = 'bob';
    return this.bobFleet();
  }
  async bobFleet() {
    const g = this.game;
    const hits = g.shotsBob.filter((i) => g.mine.some((s) => s.cells.includes(i)));
    const sunkCells = g.mine.filter((s) => g.sunkByBob.includes(s.name)).flatMap((s) => s.cells);
    const i = fleetMove(g.shotsBob, hits, sunkCells, g.level || 'normal', this.rnd);
    const r = fireAt(g.mine, g.shotsBob, i);
    if (r.result === 'sunk') g.sunkByBob.push(r.ship);
    g.turn = 'you';
    this.line('bob', `${cellName(i)}: ${r.result === 'miss' ? 'miss' : r.result === 'hit' ? 'hit' : `hit, and I sank your ${r.ship}`}`, { hit: r.result !== 'miss', step: true });
    if (r.all) { this.line('app', 'Your whole fleet is down. Mine.'); return this.finish('bob'); }
    const last = g.log.at(-2)?.text || '';
    return this.tease(`you fired (${last}) and I fired back (${cellName(i)}: ${r.result === 'sunk' ? `I sank your ${r.ship}` : r.result})`);
  }

  // ---------- Liar's dice ----------
  async actLiar(b) {
    const g = this.game;
    if (g.turn !== 'you') throw new Error('My bid; one moment.');
    if (b.next === true) return; // nothing to do: a new round starts by itself
    if (b.liar === true) {
      if (!g.bid || g.bidBy !== 'bob') throw new Error('There is no bid of mine to call.');
      this.line('you', 'Liar!');
      return this.liarReveal('you');
    }
    const bid = { count: Number(b.count), face: Number(b.face) };
    const bad = validRaise(g.bid, bid, g.you.length + g.bob.length, g.wild);
    if (bad) throw new Error(bad);
    g.bid = bid; g.bidBy = 'you'; g.reveal = null;
    this.line('you', bidWords(bid));
    g.turn = 'bob';
    return this.bobLiar();
  }
  async bobLiar() {
    const g = this.game;
    const m = liarMove(g.bob, g.you.length, g.bid, g.level || 'normal', this.rnd, g.wild);
    if (m.call) { this.line('bob', 'Liar!', { step: true }); return this.liarReveal('bob'); }
    g.bid = m.bid; g.bidBy = 'bob'; g.turn = 'you'; g.reveal = null;
    this.line('bob', bidWords(m.bid), { step: true });
    return this.tease(`I bid ${bidWords(m.bid)}; your move: raise or call me a liar`);
  }
  // Lift the cups. The bid stands if the table has at least that many; otherwise the bidder was lying.
  async liarReveal(caller) {
    const g = this.game;
    const all = [...g.you, ...g.bob];
    const n = countFace(all, g.bid.face, g.wild);
    const stands = n >= g.bid.count;
    const loser = stands ? caller : g.bidBy;
    g.reveal = { you: [...g.you], bob: [...g.bob], bid: g.bid, count: n, loser };
    this.line('app', `Cups up. You had ${g.you.join(' ')}; I had ${g.bob.join(' ')}. ${n} ${n === 1 ? 'counts' : 'count'} as ${bidWords({ count: 2, face: g.bid.face }).replace(/^2 /, '')}${g.wild ? ' (ones wild)' : ''}: the bid of ${bidWords(g.bid)} ${stands ? 'stands' : 'was a lie'}. ${loser === 'you' ? 'You lose' : 'I lose'} a die.`);
    if (loser === 'you') g.you.pop(); else g.bob.pop();
    if (!g.you.length) { this.line('app', 'Out of dice. My game.'); return this.finish('bob'); }
    if (!g.bob.length) { this.line('app', "I'm out of dice. Your game."); return this.finish('you'); }
    g.round++; g.bid = null; g.bidBy = '';
    g.you = roll(g.you.length, this.rnd); g.bob = roll(g.bob.length, this.rnd);
    g.turn = loser; // whoever lost a die opens the next round
    this.line('app', `Round ${g.round}: fresh rolls. You have ${g.you.length} ${g.you.length === 1 ? 'die' : 'dice'}, I have ${g.bob.length}. ${loser === 'you' ? 'You open.' : 'I open.'}`);
    await this.tease(loser === 'you' ? 'the cups came up and you lost a die' : 'the cups came up and I lost a die');
    if (g.turn === 'bob' && this.game === g && g.status === 'playing') return this.bobLiar();
  }

  // ---------- Trivia night ----------
  async actTrivia(b) {
    const g = this.game;
    const q = g.questions[g.at];
    if (!q) throw new Error('No question left.');
    if (g.answers[g.at]?.you) throw new Error('You answered that one; press Carry on.');
    const a = String(b.answer || '').toUpperCase();
    if (!LETTERS4.includes(a)) throw new Error('Pick A, B, C or D.');
    g.answers[g.at] = { you: a };
    this.line('you', `${a}) ${q.choices[LETTERS4.indexOf(a)]}`);
    return this.triviaReveal();
  }
  // Everyone else answers (Bob here; each Bob on your Bob-Net on his own replicant matrix, sent only the question and
  // the four choices), then the app marks the lot.
  async triviaReveal() {
    const g = this.game, q = g.questions[g.at], ans = g.answers[g.at];
    const prompt = triviaPrompt(q);
    const sys = `${persona(this.cfg)} When a quiz question comes, reply with just the letter of your answer.`;
    const net = g.players.filter((p) => p.net);
    const netAnswers = Promise.all(net.map(async (p) => {
      const bob = this.brain.lenders?.bobs?.().find((x) => x.address === p.address);
      if (!bob) return [p.id, ''];
      const quiet = new AbortController(), timer = setTimeout(() => quiet.abort(), 45000);
      const stop = () => quiet.abort(); this.stop?.signal.addEventListener('abort', stop, { once: true });
      try {
        const r = await this.brain.lenders.chat(bob, { messages: [{ role: 'system', content: 'You are playing a quiz game with friends. Reply with just the letter of your answer.' }, { role: 'user', content: prompt }], signal: quiet.signal, from: this.bobName });
        return [p.id, pickedLetter(r?.content, q.choices)];
      } catch { return [p.id, '']; } finally { clearTimeout(timer); this.stop?.signal.removeEventListener('abort', stop); }
    }));
    let mine = '';
    try { mine = pickedLetter(await this.say(prompt, { system: sys, stream: false }), q.choices); } catch (e) { if (this.stop?.signal.aborted) return; }
    ans.bob = mine;
    for (const [id, l] of await netAnswers) ans[id] = l;
    if (this.game !== g || g.status !== 'playing') return;
    const right = `${q.right}) ${q.choices[LETTERS4.indexOf(q.right)]}`;
    const marks = g.players.map((p) => { const got = ans[p.id]; if (got === q.right) p.score++; return `${p.id === 'you' ? 'You' : p.name} ${got ? (got === q.right ? `✓ (${got})` : `✗ (${got})`) : '✗ (no answer)'}`; });
    this.line('app', `The answer: ${right}. ${marks.join(', ')}.`);
    g.at++;
    if (g.at >= g.questions.length) {
      const top = Math.max(...g.players.map((p) => p.score));
      const you = g.players[0].score;
      const others = g.players.slice(1).some((p) => p.score === top);
      this.line('app', `Final scores: ${g.players.map((p) => `${p.id === 'you' ? 'You' : p.name} ${p.score}`).join(', ')}.`);
      return this.finish(you === top ? (others ? 'both' : 'you') : 'bob');
    }
    const youRight = ans.you === q.right, bobRight = ans.bob === q.right;
    return this.tease(`question ${g.at}: ${youRight ? 'you got it' : 'you missed it'} and ${bobRight ? 'I got it' : 'I missed it'}`);
  }
}
// Is Bob's move due (after a kept game is picked up)?
export function bobOwes(g) {
  if (!g || g.status !== 'playing') return false;
  if (g.kind === 'twenty') return g.role === 'think' && !g.pending && (!g.questions.length || Boolean(g.questions.at(-1).a));
  if (g.kind === 'story') return g.whose === 'bob';
  if (['four', 'fleet', 'liar'].includes(g.kind)) return g.turn === 'bob';
  if (g.kind === 'trivia') return Boolean(g.answers?.[g.at]?.you);
  return false;
}
const NUMS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const num = (n) => NUMS[n] || String(n);

// ---------- The route ----------
export function gamesFor(brain) {
  if (!brain.games) brain.games = new Games(brain);
  return brain.games;
}
export async function gamesRoute({ req, res, p, brain, body, send, isLocal = true }) {
  if (!p.startsWith('/api/games')) return false;
  const a = gamesFor(brain);
  try {
    if (req.method === 'GET' && p === '/api/games') { send(res, 200, a.view()); return true; }
    if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
    const b = await body(req);
    if (p === '/api/games/start') return send(res, 200, await a.start(b)), true;
    if (p === '/api/games/act') return send(res, 200, await a.act(b)), true;
    if (p === '/api/games/end') return send(res, 200, await a.end()), true;
    if (p === '/api/games/close') return send(res, 200, a.close()), true;
    if (p === '/api/games/words' || p === '/api/games/words/forget') { // 1.5.206: Bob's new words, only from this replicant matrix
      if (!isLocal) { send(res, 403, { error: 'New words can only be added on this replicant matrix itself.' }); return true; }
      send(res, 200, p.endsWith('/forget') ? a.forgetWords(b) : await a.newWords(b)); return true;
    }
    if (p === '/api/games/settings') { // Settings, 🧩 Games: only from this replicant matrix
      if (!isLocal) { send(res, 403, { error: 'Games settings can only be changed on this replicant matrix itself.' }); return true; }
      const next = cleanGames({ ...cleanGames(brain.cfg.games), ...b, ...('keep' in b ? { keep: b.keep === true || b.keep === 'true' } : {}) });
      saveSettings(brain.cfg, { games: next });
      a.persist();
      send(res, 200, { settings: next }); return true;
    }
    send(res, 404, { error: 'no' });
  } catch (e) { send(res, 409, { error: e.message }); }
  return true;
}
