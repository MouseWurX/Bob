// 🧩 Games, the second set (items 123 to 132): Chess, Sudoku, the daily Mini crossword, Letter grid, Noughts and
// crosses, Code breaker and Riddles, plus Kid mode, Two players on one screen and Keep a story. The same rule as the
// first set: the app runs the game and holds every secret; the brain only talks. Each game's rules live in its own
// file (games-chess.js, games-sudoku.js, games-crossword.js, games-grid.js, games-small.js); this file is the part
// that plays them: start, a move, what the page sees, and what Bob is told. src/games.js calls in here for these kinds.
// (src/games-more.js is the other set: Four in a row, Hidden fleet, Liar's dice, Trivia night.)
import fs from 'node:fs';
import path from 'node:path';
import * as chess from './games-chess.js';
import * as sudoku from './games-sudoku.js';
import * as cw from './games-crossword.js';
import * as grid from './games-grid.js';
import { winner as noughtsWinner, noughtsMove, NOUGHTS_LEVELS, makeCode, readCode, score as codeScore, breakerGuess, codeText, codeWords, COLOURS, PEGS, CODE_TRIES } from './games-small.js';
import { RIDDLES, KID_WORDS, KID_FIVE } from './games-more-words.js';

export const PLUS_GAMES = {
  chess: { icon: '♟️', name: 'Chess', what: 'A game of chess. I check every move and play at the strength you pick; Bob chats about the game.' },
  sudoku: { icon: '🔢', name: 'Sudoku', what: 'Fill the grid so every row, column and box holds 1 to 9. Hints show the next step and why it works.' },
  crossword: { icon: '📰', name: 'Mini crossword', what: 'A small 5 by 5 crossword, a new one each day. Bob writes the clues; I check your letters.' },
  grid: { icon: '🔠', name: 'Letter grid', what: 'Find words in a 4 by 4 grid of letters by joining squares that touch, before the timer runs out. Bob hunts too.' },
  noughts: { icon: '⭕', name: 'Noughts and crosses', what: 'Three in a row wins. Gentle levels for little ones, or one that never loses.' },
  codes: { icon: '🎨', name: 'Code breaker', what: 'Guess a row of four colours. Black pegs for right colour, right place; white for right colour, wrong place.' },
  riddles: { icon: '🦉', name: 'Riddles', what: 'Bob asks five riddles. Three guesses each; hints if you need them.' }
};
export const PLUS_IDS = Object.keys(PLUS_GAMES);
// Which games two people can play on one screen, passing the turn (item 131).
export const TWO_PLAYER = ['hangman', 'letters', 'ladder', 'noughts', 'riddles'];
export const RIDDLE_ROUND = 5, RIDDLE_TRIES = 3;

// ---------- Kid mode (item 130) ----------
// Easier words and gentle teasing only. Settings, 🧩 Games, "Kid mode"; off by default.
export const isKid = (cfg) => cfg?.games?.kid === true;
export const KID_PERSONA = ' You are playing with a young child. Use short, simple words. Be warm and encouraging: gentle teasing only, never mean, never sarcastic, never scary.';
// Swap a fresh game's secret for an easier one. Called by src/games.js right after it sets a game up.
export function kidSecret(g, rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  if (g.kind === 'hangman') { if (!KID_WORDS[g.shelf]) g.shelf = pick(Object.keys(KID_WORDS)); g.word = pick(KID_WORDS[g.shelf]); g.kid = true; }
  else if (g.kind === 'letters') { g.answer = pick(KID_FIVE); g.kid = true; }
  return g;
}

// ---------- Two players, one screen (item 131) ----------
export function cleanPlayers(list) {
  if (!Array.isArray(list)) return null;
  const names = list.slice(0, 2).map((n, i) => String(n ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) || `Player ${i + 1}`);
  return names.length === 2 ? (names[0] === names[1] ? [names[0] + ' 1', names[1] + ' 2'] : names) : null;
}

// ---------- Keep a story (item 132) ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// A finished Story dice story as a page of its own: the title, the dice, the lines (who wrote each one), and a print
// button. Plain HTML with its own small style, so it opens in any browser and prints cleanly on one or two sheets.
export function storyPage(g, { you = 'You', bob = 'Bob', date = new Date() } = {}) {
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = (g.lines || []).map((l) => `<p class="${l.who === 'bob' ? 'bob' : 'you'}"><span class="who">${esc(l.who === 'bob' ? bob : l.player || you)}</span> ${esc(l.text)}</p>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(g.title || 'Our story')}</title>
<style>
body{font:18px/1.6 Georgia,'Times New Roman',serif;max-width:40em;margin:2em auto;padding:0 1em;color:#222;background:#fff}
h1{font-size:1.8em;margin:.2em 0}.meta{color:#666;font-size:.85em}.dice{font-size:1.6em;letter-spacing:.2em;margin:.6em 0}
p .who{display:inline-block;min-width:3.5em;font:600 .7em system-ui,sans-serif;color:#888;text-transform:uppercase;letter-spacing:.05em}
p.bob{color:#234}button{font:inherit;font-size:.8em;padding:.3em 1em;margin-top:1.5em}
@media print{button{display:none}body{margin:0}}
@media (prefers-color-scheme:dark){body{background:#111;color:#ddd}p.bob{color:#bcd}.meta{color:#999}}
</style></head><body>
<h1>${esc(g.title || 'Our story')}</h1>
<p class="meta">A Story dice story by ${esc(you)} and ${esc(bob)}, ${esc(day)}</p>
<p class="dice" aria-label="The dice: ${esc((g.dice || []).map((d) => d[1]).join(', '))}">${(g.dice || []).map((d) => esc(d[0])).join(' ')}</p>
${lines}
<button type="button" onclick="print()">Print</button>
</body></html>`;
}
export const storiesDir = (cfg) => path.join(cfg.dataDir || '.', 'games', 'stories');
export const storyFile = (title, id) => `${String(title || 'our-story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'our-story'}-${String(id).replace(/[^a-z0-9]/gi, '')}.html`;
export function keepStory(cfg, g, opts) {
  const dir = storiesDir(cfg);
  fs.mkdirSync(dir, { recursive: true });
  const name = storyFile(g.title, g.id);
  fs.writeFileSync(path.join(dir, name), storyPage(g, opts));
  return name;
}
export function listStories(cfg) {
  try { return fs.readdirSync(storiesDir(cfg)).filter((f) => f.endsWith('.html')).map((f) => ({ file: f, at: fs.statSync(path.join(storiesDir(cfg), f)).mtimeMs })).sort((a, b) => b.at - a.at); } catch { return []; }
}
export function readStory(cfg, file) {
  const f = path.basename(String(file || ''));
  if (!/^[a-z0-9-]+\.html$/.test(f)) return null;
  try { return fs.readFileSync(path.join(storiesDir(cfg), f), 'utf8'); } catch { return null; }
}

// ---------- Setting a game up ----------
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
const shuffle = (a, rnd) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Easy, Normal and Hard come from the lobby's level chips (src/games.js checks them); Kid mode plays easy.
export const level = (g, kid) => (kid ? 'easy' : ['easy', 'normal', 'hard'].includes(g.level) ? g.level : 'normal');

export function setUp(g, b, { rnd = Math.random, now = Date.now, kid = false, cfg = {} } = {}) {
  if (g.kind === 'chess') {
    g.strength = kid ? 1 : Math.min(5, Math.max(1, Number(b.strength) || 2));
    g.youAre = b.colour === 'b' ? 'b' : b.colour === 'random' ? (rnd() < 0.5 ? 'w' : 'b') : 'w';
    g.pos = chess.fromFen(); g.moves = []; g.keys = []; g.undos = 0; g.result = '';
    return `You play ${g.youAre === 'w' ? 'white and move first' : 'black; I move first'}. Strength: ${chess.STRENGTHS[g.strength]}. Type a move like e4 or Nf3, or tap a piece and then its square.`;
  }
  if (g.kind === 'sudoku') {
    g.level = level(g, kid);
    const p = sudoku.makePuzzle(rnd, g.level);
    g.given = p.puzzle.map(Boolean); g.grid = [...p.puzzle]; g.answer = p.answer; g.mistakes = 0;
    return `A ${sudoku.LEVELS[g.level].name.toLowerCase()} Sudoku: ${p.puzzle.filter(Boolean).length} numbers given, one answer. I'll stop any number that's wrong. Ask for a hint and I'll show the next step and why.`;
  }
  if (g.kind === 'crossword') {
    g.day = g.daily || ''; // 📅 Today's puzzle: the same grid for everyone today (src/games.js counts the streak)
    g.words = g.day ? cw.dailyWords(g.day) : cw.fill(rnd);
    if (!g.words) throw new Error("I couldn't fill a crossword just now. Try again.");
    g.answer = cw.solution(g.words); g.letters = g.answer.map(() => ''); g.clues = null; g.checks = 0; g.reveals = 0;
    return g.day ? `Today's mini crossword (${g.day}). Three words across, three down, five letters each.` : 'A fresh mini crossword. Three words across, three down, five letters each.';
  }
  if (g.kind === 'grid') {
    g.level = kid ? 'kid' : level(g, kid);
    g.grid = grid.goodGrid(rnd); g.all = grid.allWords(g.grid); g.found = []; g.tried = [];
    g.bobPlays = b.bobPlays !== false; g.bob = g.bobPlays ? grid.bobsWords(g.all, g.level, rnd) : [];
    g.seconds = grid.SECONDS[g.level]; g.ends = now() + g.seconds * 1000;
    return `Words of three letters or more, joining squares that touch, each square once a word. ${Math.round(g.seconds / 60 * 10) / 10} minutes.${g.bobPlays ? ' I hunt too; a word we both find scores for neither.' : ''}`;
  }
  if (g.kind === 'noughts') {
    g.board = Array(9).fill(''); g.level = kid ? 'kid' : NOUGHTS_LEVELS[b.level] ? b.level : 'easy'; g.line = [];
    g.mark = g.two ? 'X' : b.bobStarts === true ? 'O' : 'X'; // whose mark moves next; you are X, Bob is O
    return g.two ? `${g.two[0]} is X, ${g.two[1]} is O. X goes first.` : `You're X, I'm O. ${g.mark === 'X' ? 'You go first.' : 'I go first.'}`;
  }
  if (g.kind === 'codes') {
    g.role = b.role === 'make' ? 'make' : 'break'; g.max = kid ? CODE_TRIES.kid : CODE_TRIES.normal; g.tries = []; g.repeats = !kid;
    if (g.role === 'break') { g.code = makeCode(rnd, { repeats: g.repeats }); return `I've hidden four colours${g.repeats ? ' (a colour can come twice)' : ', each a different one'}. ${g.max} tries.`; }
    g.code = ''; return 'Pick four colours for your secret code. I won\'t peek: the app keeps it and marks my tries.';
  }
  if (g.kind === 'riddles') {
    g.riddles = shuffle(RIDDLES.map((_, i) => i), rnd).slice(0, RIDDLE_ROUND); g.at = 0; g.tries = 0; g.solved = 0; g.results = [];
    return `Five riddles. Three guesses each, and a hint when you're stuck.`;
  }
  return '';
}
// Bob's first move or first words, after the app's opening line.
export async function opening(G) {
  const g = G.game;
  if (g.kind === 'chess' && g.youAre === 'b') bobChessMove(G);
  if (g.kind === 'noughts' && !g.two && g.mark === 'O') bobNoughtsMove(G);
  if (g.kind === 'crossword') await writeClues(G);
  if (g.kind === 'riddles') askRiddle(G);
  if (g.kind === 'grid') G.timer = setTimeout(() => { if (G.game === g && g.status === 'playing') gridEnd(G).then(() => G.push()).catch(() => {}); }, g.seconds * 1000 + 250), G.timer.unref?.();
}

// ---------- What the page sees ----------
// Secrets (the code, the crossword answers, the Sudoku answer, Bob's grid words, the riddle answer) stay in the app
// until the game is over.
export function publicView(g) {
  const over = g.status === 'over';
  if (g.kind === 'chess') {
    const legal = over ? [] : chess.legalMoves(g.pos);
    return { board: g.pos.board, turn: g.pos.turn, youAre: g.youAre, strength: g.strength, strengthName: chess.STRENGTHS[g.strength], moves: g.moves, check: chess.inCheck(g.pos), result: g.result, fen: chess.toFen(g.pos), last: g.last || null, legal: g.pos.turn === g.youAre ? legal.map((m) => ({ from: chess.sqName(m.from), to: chess.sqName(m.to), promo: m.promo || '' })) : [], material: chess.material(g.pos) };
  }
  if (g.kind === 'sudoku') return { grid: g.grid, given: g.given, mistakes: g.mistakes, level: g.level, levelName: sudoku.LEVELS[g.level].name, focus: g.focus ?? -1, answer: over ? g.answer : null };
  if (g.kind === 'crossword') {
    const clues = cw.SLOTS.map((s) => ({ id: s.id, num: s.num, dir: s.dir, cells: cw.cells(s), clue: g.clues?.[s.id] || '…' }));
    return { day: g.day, letters: g.letters, blocks: cw.BLOCKS, clues, wrong: g.wrong || [], checks: g.checks, reveals: g.reveals, answer: over ? g.answer : null };
  }
  if (g.kind === 'grid') return { grid: g.grid, found: g.found, ends: g.ends, seconds: g.seconds, level: g.level, bobPlays: g.bobPlays, total: g.all.length, bob: over ? g.bob : null, all: over ? g.all : null, points: over ? g.points : null };
  if (g.kind === 'noughts') return { board: g.board, mark: g.mark, level: g.level, levelName: NOUGHTS_LEVELS[g.level], line: g.line };
  if (g.kind === 'codes') return { role: g.role, tries: g.tries, max: g.max, pegs: PEGS, colours: COLOURS, repeats: g.repeats, codeSet: Boolean(g.code), code: over || g.role === 'make' ? g.code : '' };
  if (g.kind === 'riddles') {
    const r = RIDDLES[g.riddles[g.at]];
    return { at: g.at, of: g.riddles.length, riddle: over ? '' : r?.[0] || '', tries: g.tries, max: RIDDLE_TRIES, solved: g.solved, results: g.results };
  }
  return {};
}

// The words the app blanks out of anything Bob says mid-game (src/games.js does the blanking).
export function secretFor(g) {
  if (g.kind === 'crossword') return Object.values(g.words || {});
  if (g.kind === 'riddles') { const r = RIDDLES[g.riddles?.[g.at]]; return r ? r.slice(2).filter((a) => a.length > 2) : null; }
  return null;
}

// ---------- What Bob is told ----------
export function teaseFor(g, moment) {
  if (g.kind === 'chess') return `We're playing chess. You (Bob) play ${g.youAre === 'w' ? 'black' : 'white'}; I play ${g.youAre === 'w' ? 'white' : 'black'}. The moves so far: ${g.moves.join(' ') || 'none'}. Material: white ${chess.material(g.pos).white}, black ${chess.material(g.pos).black}. What just happened: ${moment}. Chat about it like a friendly opponent across the board. Don't suggest my next move and don't name squares you aren't sure of.`;
  if (g.kind === 'sudoku') return `We're doing a Sudoku together. What just happened: ${moment}. Cheer or tease, one short sentence. Don't name any numbers or squares.`;
  if (g.kind === 'crossword') return `We're doing a mini crossword. What just happened: ${moment}. One short sentence. Never say any of the answers or their letters.`;
  if (g.kind === 'grid') return `We're playing a word-finding game on a grid of letters. What just happened: ${moment}. One short sentence. Don't name any words that might be in the grid.`;
  if (g.kind === 'noughts') return `We're playing noughts and crosses. You are O. What just happened: ${moment}. One short sentence.`;
  if (g.kind === 'codes') return `We're playing Code breaker (guess four colours; black pegs right colour and place, white right colour wrong place). What just happened: ${moment}. One short sentence. Never say which colours are in the secret code.`;
  if (g.kind === 'riddles') return `We're doing riddles. The riddle is "${RIDDLES[g.riddles[g.at]]?.[0]}" and the answer is "${RIDDLES[g.riddles[g.at]]?.[1]}". What just happened: ${moment}. One short sentence. Never say the answer or any word of it.`;
  return '';
}
export function endFor(g) {
  const won = g.won === 'you' ? 'I won' : g.won === 'bob' ? 'you won' : 'it was shared';
  if (g.kind === 'chess') return `Our chess game is over: ${g.result}. The moves: ${g.moves.join(' ')}. One friendly line about the game.`;
  if (g.kind === 'grid') return `The word grid is over: ${won}. I scored ${g.points?.you ?? 0}, you scored ${g.points?.bob ?? 0}. The longest word in the grid was "${g.all[0] || ''}". One line about the game.`;
  if (g.kind === 'codes') return `Code breaker is over: ${won}. The code was ${codeWords(g.code)}, after ${g.tries.length} tries. One line about it.`;
  if (g.kind === 'riddles') return `Riddles are over: I solved ${g.solved} of ${g.riddles.length}. One line about it.`;
  return `${PLUS_GAMES[g.kind]?.name || 'The game'} is over: ${won}. One line about it.`;
}

// ---------- A move ----------
export async function act(G, b) {
  const g = G.game;
  if (g.kind === 'chess') return actChess(G, b);
  if (g.kind === 'sudoku') return actSudoku(G, b);
  if (g.kind === 'crossword') return actCrossword(G, b);
  if (g.kind === 'grid') return actGrid(G, b);
  if (g.kind === 'noughts') return actNoughts(G, b);
  if (g.kind === 'codes') return actCodes(G, b);
  if (g.kind === 'riddles') return actRiddles(G, b);
}

// Chess
function chessOver(G) {
  const g = G.game;
  const why = chess.outcome(g.pos, g.keys);
  if (!why) return false;
  if (why === 'checkmate') { const youWon = g.pos.turn !== g.youAre; g.result = youWon ? 'you won by checkmate' : 'Bob won by checkmate'; G.line('app', youWon ? 'Checkmate. Your game!' : 'Checkmate. My game.'); return G.finish(youWon ? 'you' : 'bob'); }
  const words = { stalemate: 'Stalemate: no legal move, but no check. A draw.', fifty: 'Fifty moves with no capture or pawn move. A draw.', material: 'Not enough pieces left to checkmate. A draw.', repetition: 'The same position three times. A draw.' };
  g.result = `a draw (${why})`; G.line('app', words[why]); return G.finish('both');
}
function bobChessMove(G) {
  const g = G.game;
  const m = chess.bestMove(g.pos, g.strength, G.rnd);
  if (!m) return null;
  const name = chess.san(g.pos, m);
  g.keys.push(chess.posKey(g.pos));
  g.pos = chess.play(g.pos, m); g.moves.push(name); g.last = { from: chess.sqName(m.from), to: chess.sqName(m.to) };
  G.line('bob', name, { move: true });
  return name;
}
async function actChess(G, b) {
  const g = G.game;
  if (b.resign === true) { g.result = 'Bob won (you resigned)'; G.line('app', 'You resigned. Good game.'); return G.finish('bob'); }
  if (b.draw === true) { // Bob takes a draw when he isn't ahead
    const m = chess.material(g.pos), mine = g.youAre === 'w' ? m.black - m.white : m.white - m.black;
    if (mine <= 0) { g.result = 'a draw (agreed)'; G.line('app', 'Draw agreed.'); return G.finish('both'); }
    G.line('bob', "No thanks, I'll play on.", { app: true }); return;
  }
  if (b.undo === true) {
    if (g.moves.length < 2 || g.pos.turn !== g.youAre) throw new Error('Nothing to take back yet.');
    for (let k = 0; k < 2; k++) { g.moves.pop(); g.keys.pop(); }
    g.pos = replay(g); g.undos++; g.last = null;
    G.line('app', 'Took back your last move and mine.'); return;
  }
  if (b.ask) { // ask Bob about the game: he sees the board, the moves and your question
    const q = String(b.ask).slice(0, 200);
    G.line('you', q);
    let text = '';
    try { text = await G.say(`We're playing chess; I'm ${g.youAre === 'w' ? 'white' : 'black'}. The board (capital letters are white):\n${chess.boardText(g.pos)}\nThe moves so far: ${g.moves.join(' ') || 'none'}. My question: "${q}". Answer in one to three short sentences, like a friendly opponent. If you aren't sure, say so.`); } catch { text = ''; }
    G.line('bob', text || "Good question. I'll let the board answer that one.");
    return;
  }
  if (g.pos.turn !== g.youAre) throw new Error('My move; one moment.');
  const legal = chess.legalMoves(g.pos);
  const m = b.from && b.to ? legal.find((x) => chess.sqName(x.from) === b.from && chess.sqName(x.to) === b.to && (!x.promo || x.promo === (b.promo || 'q'))) : chess.parseMove(g.pos, b.move, legal);
  if (!m) throw new Error(`${String(b.move || `${b.from || ''}${b.to || ''}`).slice(0, 12) || 'That'} isn't a legal move here.`);
  const name = chess.san(g.pos, m, legal);
  g.keys.push(chess.posKey(g.pos));
  g.pos = chess.play(g.pos, m); g.moves.push(name); g.last = { from: chess.sqName(m.from), to: chess.sqName(m.to) };
  G.line('you', name, { move: true });
  let over = chessOver(G);
  if (over) return over;
  const reply = bobChessMove(G);
  over = chessOver(G);
  if (over) return over;
  return G.tease(`you played ${name} and I answered ${reply}${chess.inCheck(g.pos) ? ', check' : ''}`);
}
function replay(g) {
  let s = chess.fromFen();
  for (const name of g.moves) s = chess.play(s, chess.parseMove(s, name));
  return s;
}

// Sudoku
async function actSudoku(G, b) {
  const g = G.game;
  if (b.hint === true) {
    const step = sudoku.nextStep(g.grid, g.answer);
    if (!step) throw new Error('The grid is full.');
    g.hints++; g.focus = step.cell;
    G.line('bob', step.why, { hint: true, cell: step.cell });
    if (b.fill === true) { g.grid[step.cell] = step.value; if (!g.grid.includes(0)) { G.line('app', 'Solved!'); return G.finish('you'); } }
    return;
  }
  const i = Number(b.cell), v = Number(b.value);
  if (!(i >= 0 && i < 81) || !(v >= 0 && v <= 9)) throw new Error('Pick a square and a number.');
  if (g.given[i]) throw new Error('That number was given; it stays.');
  g.focus = i;
  if (v === 0) { g.grid[i] = 0; return; }
  const clash = sudoku.clashes(g.grid, i, v);
  if (clash.length) { g.mistakes++; throw new Error(`${v} can't go there: ${sudoku.cellName(clash[0])} already has a ${v}.`); }
  if (g.answer[i] !== v) { g.mistakes++; G.line('app', `${v} breaks no rule yet at ${sudoku.cellName(i)}, but it isn't the answer. Try another.`); return; }
  g.grid[i] = v;
  if (!g.grid.includes(0)) { G.line('app', `Solved${g.hints ? ` with ${g.hints} hint${g.hints === 1 ? '' : 's'}` : ' with no hints'}${g.mistakes ? ` and ${g.mistakes} slip${g.mistakes === 1 ? '' : 's'}` : ''}.`); return G.finish('you'); }
  const filled = g.grid.filter(Boolean).length;
  if (filled % 9 === 0) return G.tease(`${filled} of 81 squares filled`);
}

// Mini crossword
export async function writeClues(G) {
  const g = G.game;
  const cache = g.day ? path.join(G.cfg.dataDir || '.', 'games', 'crossword', `${g.day}.json`) : '';
  if (cache) { try { const c = JSON.parse(fs.readFileSync(cache, 'utf8')); if (c.clues && cw.SLOTS.every((s) => cw.goodClue(c.clues[s.id], g.words[s.id]))) { g.clues = c.clues; return; } } catch {} }
  let reply = '';
  try { reply = await G.say(cw.cluePrompt(g.words), { stream: false, raw: true }); } catch { reply = ''; }
  const { clues, swapped } = cw.readClues(reply, g.words);
  g.clues = clues;
  if (swapped.length && reply) G.line('app', `${swapped.length} of Bob's clues gave the word away or didn't come out right, so I wrote plainer ones.`);
  if (cache && !swapped.length) { try { fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, JSON.stringify({ clues })); } catch {} }
}
async function actCrossword(G, b) {
  const g = G.game;
  if (b.check === true) {
    g.checks++; g.wrong = cw.wrongCells(g.letters, g.answer);
    G.line('app', g.wrong.length ? `${g.wrong.length} square${g.wrong.length === 1 ? ' is' : 's are'} wrong; they're marked.` : 'Everything filled in so far is right.');
    return;
  }
  if (b.reveal !== undefined) {
    const i = Number(b.reveal);
    if (!(i >= 0 && i < 25) || cw.isBlock(i)) throw new Error('Pick a square to reveal.');
    g.letters[i] = g.answer[i]; g.reveals++; g.hints++;
  } else if (Array.isArray(b.letters)) {
    b.letters.slice(0, 25).forEach((c, i) => { if (!cw.isBlock(i)) g.letters[i] = String(c || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 1); });
  } else {
    const i = Number(b.cell);
    if (!(i >= 0 && i < 25) || cw.isBlock(i)) throw new Error('Pick a square.');
    g.letters[i] = String(b.letter || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 1);
  }
  g.wrong = (g.wrong || []).filter((i) => g.letters[i] && g.letters[i] !== g.answer[i]);
  if (cw.solved(g.letters, g.answer)) { G.line('app', `Solved${g.reveals ? ` with ${g.reveals} letter${g.reveals === 1 ? '' : 's'} shown` : ''}${g.checks ? `, ${g.checks} check${g.checks === 1 ? '' : 's'}` : ''}.`); return G.finish('you'); }
}

// Letter grid
export async function gridEnd(G) {
  const g = G.game;
  if (g.status !== 'playing') return;
  clearTimeout(G.timer);
  const mine = new Set(g.found), bobs = new Set(g.bob);
  const you = g.found.filter((w) => !bobs.has(w)).reduce((n, w) => n + grid.points(w), 0);
  const bob = g.bob.filter((w) => !mine.has(w)).reduce((n, w) => n + grid.points(w), 0);
  g.points = { you, bob };
  const longest = g.all[0];
  G.line('app', `Time! You found ${g.found.length} word${g.found.length === 1 ? '' : 's'} for ${you} point${you === 1 ? '' : 's'}${g.bobPlays ? `; I found ${g.bob.length} for ${bob}` : ''}. The grid held ${g.all.length}${longest ? `; the longest was ${longest.toUpperCase()}` : ''}.`);
  return G.finish(!g.bobPlays ? (you > 0 ? 'you' : 'none') : you > bob ? 'you' : bob > you ? 'bob' : 'both');
}
async function actGrid(G, b) {
  const g = G.game;
  if (b.done === true || G.now() > g.ends) return gridEnd(G);
  const w = String(b.word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (w.length < 3) throw new Error('Three letters or more.');
  if (g.found.includes(w)) throw new Error(`You have ${w.toUpperCase()} already.`);
  if (!grid.pathFor(g.grid, w)) throw new Error(`${w.toUpperCase()} isn't in the grid (the letters must touch, each square once).`);
  if (!grid.counts(w)) { g.tried.push(w); throw new Error(`${w.toUpperCase()} isn't in my word list.`); }
  g.found.push(w);
  G.line('you', w.toUpperCase(), { points: grid.points(w) });
}

// Noughts and crosses
function noughtsOver(G) {
  const g = G.game, w = noughtsWinner(g.board);
  if (!w) return false;
  g.line = w.line;
  if (w.mark === 'draw') { G.line('app', 'A draw: the board is full.'); return G.finish('both'); }
  if (g.two) { g.champ = g.two[w.mark === 'X' ? 0 : 1]; G.line('app', `Three in a row: ${g.champ} wins!`); return G.finish('both'); }
  G.line('app', w.mark === 'X' ? 'Three in a row. You win!' : 'Three in a row for me.');
  return G.finish(w.mark === 'X' ? 'you' : 'bob');
}
function bobNoughtsMove(G) {
  const g = G.game, i = noughtsMove(g.board, 'O', g.level, G.rnd);
  if (i < 0) return -1;
  g.board[i] = 'O'; g.mark = 'X';
  G.line('bob', `O in the ${SQUARE_NAMES[i]}.`, { cell: i });
  return i;
}
export const SQUARE_NAMES = ['top left', 'top middle', 'top right', 'middle left', 'centre', 'middle right', 'bottom left', 'bottom middle', 'bottom right'];
async function actNoughts(G, b) {
  const g = G.game, i = Number(b.cell);
  if (!(i >= 0 && i < 9)) throw new Error('Pick a square.');
  if (g.board[i]) throw new Error('That square is taken.');
  if (!g.two && g.mark !== 'X') throw new Error('My turn; one moment.');
  g.board[i] = g.mark;
  G.line('you', `${g.mark} in the ${SQUARE_NAMES[i]}.`, { cell: i });
  let over = noughtsOver(G);
  if (over) return over;
  if (g.two) { g.mark = g.mark === 'X' ? 'O' : 'X'; return; }
  g.mark = 'O';
  bobNoughtsMove(G);
  over = noughtsOver(G);
  if (over) return over;
  return G.tease(`you took the ${SQUARE_NAMES[i]}`);
}

// Code breaker
async function actCodes(G, b) {
  const g = G.game;
  if (g.role === 'make') {
    if (!g.code) {
      const c = readCode(b.code);
      if (!c) throw new Error('Pick four colours.');
      if (!g.repeats && new Set(c).size < PEGS) throw new Error('Each colour once in Kid mode.');
      g.code = c; G.line('you', 'Code set. No peeking!'); G.line('app', `Your code is ${codeText(c)}. I'll mark Bob's tries for you.`);
    }
    const guess = breakerGuess(g.tries, G.rnd) || g.code;
    const s = codeScore(guess, g.code);
    g.tries.push({ guess, ...s });
    G.line('bob', `${codeText(guess)}`, { pegs: s });
    if (s.black === PEGS) { G.line('app', `Bob cracked it in ${g.tries.length} ${g.tries.length === 1 ? 'try' : 'tries'}.`); return G.finish('bob'); }
    if (g.tries.length >= g.max) { G.line('app', `${g.max} tries and Bob never got it. Your point!`); return G.finish('you'); }
    return;
  }
  const c = readCode(b.code);
  if (!c) throw new Error('Pick four colours.');
  const s = codeScore(c, g.code);
  g.tries.push({ guess: c, ...s });
  G.line('you', codeText(c), { pegs: s });
  if (s.black === PEGS) { G.line('app', `Cracked in ${g.tries.length} ${g.tries.length === 1 ? 'try' : 'tries'}!`); return G.finish('you'); }
  if (g.tries.length >= g.max) { G.line('app', `Out of tries. The code was ${codeText(g.code)} (${codeWords(g.code)}).`); return G.finish('bob'); }
  return G.tease(`a try with ${s.black} black and ${s.white} white peg${s.white === 1 ? '' : 's'}, ${g.max - g.tries.length} tries left`);
}

// Riddles
export const riddleAnswerMatches = (text, aliases) => {
  const t = ` ${String(text || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ')} `;
  return aliases.some((a) => { const x = a.toLowerCase(); return t.includes(` ${x} `) || t.includes(` ${x}s `) || (x.length === 1 && t.trim() === x); });
};
function askRiddle(G) {
  const g = G.game, r = RIDDLES[g.riddles[g.at]];
  G.line('bob', `Riddle ${g.at + 1} of ${g.riddles.length}: ${r[0]}`, { riddle: true });
}
function nextRiddle(G) {
  const g = G.game;
  g.at++; g.tries = 0;
  if (g.at >= g.riddles.length) {
    G.line('app', `That's all five: ${g.solved} solved.`);
    return G.finish(g.solved >= 3 ? 'you' : 'bob');
  }
  askRiddle(G);
}
export const riddleHintPrompt = (r) => `We're doing riddles. The riddle: "${r[0]}". The answer: "${r[1]}". Give one gentle hint in one sentence that points the way. Never say the answer, any word of it, or a word that rhymes with it.`;
async function actRiddles(G, b) {
  const g = G.game, r = RIDDLES[g.riddles[g.at]], aliases = r.slice(2);
  if (b.hint === true) {
    g.hints++;
    let text = '';
    try { text = await G.say(riddleHintPrompt(r)); } catch { text = ''; }
    if (!text || riddleAnswerMatches(text, aliases)) text = `It's ${r[1].split(' ').length > 1 ? `${r[1].split(' ').length} words` : `a word of ${r[1].replace(/^(a|an|the|your) /, '').length} letters`}.`;
    G.line('bob', text, { hint: true });
    return;
  }
  if (b.skip === true) { g.results.push({ riddle: r[0], answer: r[1], solved: false }); G.line('app', `The answer was ${r[1]}.`); return nextRiddle(G); }
  const guess = String(b.answer || '').slice(0, 80).trim();
  if (!guess) throw new Error('Type your answer.');
  G.line('you', guess);
  if (riddleAnswerMatches(guess, aliases)) {
    g.solved++; g.results.push({ riddle: r[0], answer: r[1], solved: true, by: g.two ? g.two[g.twoTurn || 0] : '' });
    G.line('app', `Yes! ${r[1][0].toUpperCase() + r[1].slice(1)}.`);
    return nextRiddle(G);
  }
  g.tries++;
  if (g.tries >= RIDDLE_TRIES) { g.results.push({ riddle: r[0], answer: r[1], solved: false }); G.line('app', `Not quite. The answer was ${r[1]}.`); return nextRiddle(G); }
  return G.tease(`a wrong guess, "${guess}", ${RIDDLE_TRIES - g.tries} guess${RIDDLE_TRIES - g.tries === 1 ? '' : 'es'} left`);
}

// Stopping a game early: what the app says, with the secret now shown.
export function stopLine(g) {
  if (g.kind === 'chess') { g.result = 'stopped'; return 'Game stopped.'; }
  if (g.kind === 'sudoku') return 'Game stopped. The answer is shown.';
  if (g.kind === 'crossword') return `Game stopped. The words: ${cw.SLOTS.map((s) => g.words[s.id].toUpperCase()).join(', ')}.`;
  if (g.kind === 'grid') return `Game stopped. The grid held ${g.all.length} words${g.all[0] ? `; the longest was ${g.all[0].toUpperCase()}` : ''}.`;
  if (g.kind === 'codes') return g.code ? `Game stopped. The code was ${codeText(g.code)}.` : 'Game stopped.';
  if (g.kind === 'riddles') { const r = RIDDLES[g.riddles[g.at]]; return r ? `Game stopped. That one was ${r[1]}.` : 'Game stopped.'; }
  return 'Game stopped.';
}
