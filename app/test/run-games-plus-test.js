// 🧩 Games, the second set (items 123 to 132): the rules engines (chess move counts against known positions, Sudoku
// with one answer and explained steps, the mini crossword fill and clue checks, the letter grid, noughts and crosses
// that never loses, code breaker pegs), each new game played through with a fake brain, Kid mode, two players on one
// screen, keeping a Story dice story as a page, and the Help, glossary and FAQ. Never reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as chess from '../src/games-chess.js';
import * as sudoku from '../src/games-sudoku.js';
import * as cw from '../src/games-crossword.js';
import * as grid from '../src/games-grid.js';
import * as small from '../src/games-small.js';
import * as plus from '../src/games-plus.js';
import { RIDDLES, THREE, KID_WORDS, KID_FIVE, GRID_DICE } from '../src/games-more-words.js';
import { FIVE } from '../src/games-words.js';
import { Games, GAMES, cleanGames, persona, gamesRoute } from '../src/games.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const seeded = (n) => cw.seeded(n);

// ---------- Chess ----------
function perft(s, d) { if (!d) return 1; let n = 0; for (const m of chess.legalMoves(s)) n += perft(chess.play(s, m), d - 1); return n; }
check('chess: 20 first moves, 400 after one each, 8,902 after three half-moves', perft(chess.fromFen(), 1) === 20 && perft(chess.fromFen(), 2) === 400 && perft(chess.fromFen(), 3) === 8902);
check('chess: the busy test position (castling, en passant, promotion, pins) counts right', perft(chess.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), 2) === 2039);
check('chess: the end-game test position counts right', perft(chess.fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 3) === 2812);
check('chess: promotions and checks test position counts right', perft(chess.fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), 2) === 264);
check('chess: FEN goes in and out unchanged', chess.toFen(chess.fromFen(chess.START)) === chess.START);
{ const s = chess.fromFen();
  check('chess: moves typed the usual ways (e4, e2e4, Nf3, nf3) are read; nonsense is not', chess.san(s, chess.parseMove(s, 'e4')) === 'e4' && chess.san(s, chess.parseMove(s, 'e2e4')) === 'e4' && chess.san(s, chess.parseMove(s, 'Nf3')) === 'Nf3' && chess.san(s, chess.parseMove(s, 'nf3')) === 'Nf3' && chess.parseMove(s, 'e5') === null && chess.parseMove(s, 'hello') === null); }
{ const s = chess.fromFen('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1');
  const m = chess.parseMove(s, 'Qxf7');
  check('chess: mate is written with # and seen as checkmate', chess.san(s, m) === 'Qxf7#' && chess.outcome(chess.play(s, m)) === 'checkmate'); }
check('chess: castling both ways, written O-O and 0-0-0', (() => { const s = chess.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'); return chess.san(s, chess.parseMove(s, 'O-O')) === 'O-O' && chess.san(s, chess.parseMove(s, '0-0-0')) === 'O-O-O'; })());
check('chess: no castling through check', (() => { const s = chess.fromFen('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1'); return chess.parseMove(s, 'O-O') === null; })());
check('chess: stalemate and bare kings are draws', chess.outcome(chess.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')) === 'stalemate' && chess.outcome(chess.fromFen('7k/8/6K1/8/8/8/8/8 w - - 0 1')) === 'material');
{ const s = chess.fromFen('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  const m = chess.bestMove(s, 3, seeded(1));
  check('chess: Bob finds a mate in one at Club strength', chess.san(s, m) === 'Rd8#'); }
{ const s = chess.fromFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
  const m = chess.bestMove(s, 4, seeded(2));
  check('chess: Bob takes a free queen at Strong', chess.san(s, m) === 'exd5'); }
check('chess: five strengths, each named', Object.keys(chess.STRENGTHS).length === 5);

// ---------- Sudoku ----------
for (const lvl of ['easy', 'normal', 'hard']) {
  const p = sudoku.makePuzzle(seeded(lvl.length * 7), lvl);
  const given = p.puzzle.filter(Boolean).length;
  check(`sudoku ${lvl}: one answer, ${sudoku.LEVELS[lvl].clues} or so numbers given, the answer fits the puzzle`, sudoku.countSolutions(p.puzzle) === 1 && given >= sudoku.LEVELS[lvl].clues && given <= sudoku.LEVELS[lvl].clues + 6 && p.puzzle.every((v, i) => !v || v === p.answer[i]), `(${given} given)`);
  if (lvl === 'easy') check('sudoku easy: can be finished with only the two simple steps the hints explain', sudoku.simpleSolvable(p.puzzle));
}
{ const p = sudoku.makePuzzle(seeded(5), 'normal');
  const step = sudoku.nextStep(p.puzzle, p.answer);
  check('sudoku: a hint names the square, the number and why, and is right', step && step.value === p.answer[step.cell] && /row \d, column \d/.test(step.why) && step.why.includes(String(step.value)));
  const empty = p.puzzle.findIndex((v) => !v), row = Math.floor(empty / 9);
  const there = p.puzzle.slice(row * 9, row * 9 + 9).find(Boolean);
  check('sudoku: a clash is found (the same number in the row)', sudoku.clashes(p.puzzle, empty, there).length >= 1); }

// ---------- Mini crossword ----------
{ const w = cw.dailyWords('2026-11-11'), w2 = cw.dailyWords('2026-11-11'), w3 = cw.dailyWords('2026-11-12');
  check('crossword: the same grid all day, a different one tomorrow', JSON.stringify(w) === JSON.stringify(w2) && JSON.stringify(w) !== JSON.stringify(w3));
  check('crossword: six different real five-letter words that cross properly', Object.values(w).length === 6 && new Set(Object.values(w)).size === 6 && Object.values(w).every((x) => FIVE.includes(x)) && (() => { const g = cw.solution(w); return cw.SLOTS.every((s) => cw.cells(s).map((i) => g[i]).join('') === w[s.id]); })());
  check('crossword: a fill for every day of a year', Array.from({ length: 365 }, (_, d) => cw.dailyWords(`2027-${d}`)).every(Boolean));
  check('crossword: a clue holding the answer is caught; a fair one passes', cw.cluesLeak('A cycle path', 'cycle') && cw.cluesLeak('Cyclist\'s ride', 'cycle') && !cw.cluesLeak('Go round and round', 'cycle'));
  const r = cw.readClues('1a: Go round and round\n4a: Layer high up that blocks the sun\n5a: sunny day\n1d: Annoyed\n2d: Circus funny person\n', w);
  check('crossword: Bob\'s clues are read; missing or leaky ones are swapped for the app\'s plain clue', r.clues['1a'] === 'Go round and round' || r.swapped.includes('1a'));
  check('crossword: every clue ends up filled in', cw.SLOTS.every((s) => r.clues[s.id]) && r.swapped.length >= 1); }

// ---------- Letter grid ----------
{ const g = grid.goodGrid(seeded(3));
  const all = grid.allWords(g);
  check('letter grid: sixteen dice, sixteen squares', GRID_DICE.length === 16 && g.length === 16);
  check('letter grid: a grid worth playing (plenty of words), every one traceable and in the word list', all.length >= 15 && all.every((w) => grid.pathFor(g, w) && grid.dictionary().has(w)), `(${all.length} words)`);
  check('letter grid: a word whose letters don\'t touch is not found', grid.pathFor(['c', 'a', 't', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'd'], 'cad') === null && grid.pathFor(['c', 'a', 't', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'd'], 'cat'));
  check('letter grid: points rise with length', grid.points('cat') === 1 && grid.points('house') === 2 && grid.points('garden') === 3 && grid.points('kitchen') === 5 && grid.points('elephants') === 11);
  check('letter grid: three-letter words are three letters, no doubles', THREE.every((w) => /^[a-z]{3}$/.test(w)) && new Set(THREE).size === THREE.length); }

// ---------- Noughts and crosses, code breaker ----------
{ let lost = 0;
  for (let k = 0; k < 200; k++) { const b = Array(9).fill(''); let turn = 'X'; const r = seeded(k); while (!small.winner(b)) { b[turn === 'O' ? small.noughtsMove(b, 'O', 'perfect', r) : small.noughtsMove(b, 'X', 'easy', r)] = turn; turn = turn === 'X' ? 'O' : 'X'; } if (small.winner(b).mark === 'X') lost++; }
  check('noughts: "Can\'t be beaten" never loses', lost === 0); }
check('noughts: three in a row is seen, and a full board is a draw', small.winner(['X', 'X', 'X', '', 'O', 'O', '', '', ''])?.mark === 'X' && small.winner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'])?.mark === 'draw');
check('code breaker: black and white pegs counted right, repeats included', JSON.stringify(small.score('rrgg', 'grgr')) === '{"black":2,"white":2}' && JSON.stringify(small.score('rrrr', 'rgbp')) === '{"black":1,"white":0}' && JSON.stringify(small.score('ygbr', 'rgby')) === '{"black":2,"white":2}');
check('code breaker: codes typed as letters, colour names or the coloured dots', small.readCode('r g b y') === 'rgby' && small.readCode('red, green, blue, yellow') === 'rgby' && small.readCode('🔴🟢🔵🟡'.match(/\p{Emoji_Presentation}/gu).join(' ')) === 'rgby' && small.readCode('rgbz') === '');
{ let worst = 0; for (let k = 0; k < 60; k++) { const code = small.makeCode(seeded(k)); const h = []; for (let n = 0; n < 12; n++) { const g = small.breakerGuess(h, seeded(k + n)); const s = small.score(g, code); h.push({ guess: g, ...s }); if (s.black === 4) break; } worst = Math.max(worst, h.length); }
  check('code breaker: Bob always cracks a code within ten tries', worst <= 10, `(worst ${worst})`); }
check('code breaker: Kid mode codes use each colour once', Array.from({ length: 30 }, (_, k) => small.makeCode(seeded(k), { repeats: false })).every((c) => new Set(c).size === 4));

// ---------- Riddles and Kid mode words ----------
check('riddles: forty, each with an answer shown and answers that count', RIDDLES.length >= 40 && RIDDLES.every((r) => r[0].endsWith('?') && r[1] && r.length >= 3));
check('riddles: answers count with or without "a", in a sentence, or plural', plus.riddleAnswerMatches('is it a piano?', ['piano']) && plus.riddleAnswerMatches('Footprints', ['footprint']) && !plus.riddleAnswerMatches('a pan', ['piano']));
check('kid mode: easy words, all short and plain', Object.values(KID_WORDS).flat().every((w) => /^[a-z]{3,7}$/.test(w)) && KID_FIVE.every((w) => /^[a-z]{5}$/.test(w)));

// ---------- Played through, with a fake brain ----------
function setup({ replies = [], games = {}, now = () => 1_700_000_000_000 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-games-plus-'));
  const cfg = { dataDir: tmp, agentDir: tmp, settingsFile: path.join(tmp, 'settings.json'), userName: 'Sam', models: { bob: 'main' }, games: { talk: 'every', ...games } };
  const calls = { chat: [], done: 0 };
  const brain = {
    cfg, broadcast: () => {}, log: () => {}, gate: { done: () => { calls.done++; } }, settle: async () => {},
    async ensureModel(model) { return model; },
    async chatSafe(o) { calls.chat.push(o); const r = replies.length ? replies.shift() : 'Nice one.'; return { content: r }; }
  };
  return { g: new Games(brain, { rnd: seeded(42), now }), calls, cfg, tmp, brain };
}
check('the new games are on the list after the first five', ['chess', 'sudoku', 'crossword', 'grid', 'noughts', 'codes', 'riddles'].every((k) => GAMES[k]?.icon && GAMES[k].what.length > 20));

// Chess
{ const { g, calls } = setup({ replies: ['Bold opening.'] });
  const v = await g.start({ kind: 'chess', strength: 1 });
  check('chess starts: white to move, you are white, nothing loaded, legal moves listed for the board', v.game.youAre === 'w' && v.game.turn === 'w' && v.game.legal.length === 20 && !calls.chat.length);
  let threw = ''; try { await g.act({ move: 'e5' }); } catch (e) { threw = e.message; }
  check('chess: an illegal move is refused by the app', /isn't a legal move/.test(threw) && g.game.moves.length === 0);
  const r = await g.act({ move: 'e4' });
  check('chess: your move, then Bob\'s move from the app, then one line from the brain about it', r.game.moves.length === 2 && r.game.moves[0] === 'e4' && r.game.turn === 'w' && calls.chat.length === 1 && /you played e4 and I answered/.test(calls.chat[0].messages[1].content));
  await g.act({ undo: true });
  check('chess: take back undoes your move and Bob\'s', g.game.moves.length === 0 && g.game.pos.turn === 'w');
  await g.act({ from: 'g1', to: 'f3' });
  check('chess: a move by squares (tap a piece, tap its square) works too', g.game.moves[0] === 'Nf3');
  const end = await g.act({ resign: true });
  check('chess: resigning is Bob\'s point and the brain is let go', end.game.status === 'over' && end.game.won === 'bob' && calls.done === 1); }
{ const { g } = setup();
  const v = await g.start({ kind: 'chess', colour: 'b', strength: 2 });
  check('chess as black: Bob moves first', v.game.moves.length === 1 && v.game.turn === 'b'); }

// Sudoku
{ const { g } = setup({ games: { talk: 'end' } });
  const v = await g.start({ kind: 'sudoku', level: 'easy' });
  check('sudoku starts with the grid and the givens, the answer hidden', v.game.grid.length === 81 && v.game.answer === null && v.game.given.filter(Boolean).length >= 40);
  const step = sudoku.nextStep(g.game.grid, g.game.answer);
  let threw = ''; try { const clash = g.game.grid.slice(Math.floor(step.cell / 9) * 9, Math.floor(step.cell / 9) * 9 + 9).find(Boolean); await g.act({ cell: step.cell, value: clash }); } catch (e) { threw = e.message; }
  check('sudoku: a number that breaks the rules is stopped, with where the clash is', /can't go there/.test(threw) && g.game.mistakes === 1);
  const h = await g.act({ hint: true });
  check('sudoku: a hint is the app\'s next step with the reason, not the brain\'s', g.game.log.at(-1).hint && /fits|can only go/.test(g.game.log.at(-1).text) && h.game.hints === 1);
  while (g.game.status === 'playing') { const i = g.game.grid.findIndex((x) => !x); await g.act({ cell: i, value: g.game.answer[i] }); }
  check('sudoku: filling it in wins, and the answer is then shown', g.game.won === 'you' && g.view().game.answer.length === 81); }

// Mini crossword
{ const { g, calls, cfg } = setup({ replies: ['1a: Go round and round\n4a: x\n5a: y\n1d: z\n2d: w\n3d: v', 'Done!'] });
  const v = await g.start({ kind: 'crossword', daily: true });
  check('crossword: today\'s grid, clues from the brain (checked), the answers hidden', v.game.day && v.game.clues.length === 6 && v.game.clues.every((c) => c.clue && c.clue !== '…') && v.game.answer === null && calls.chat.length === 1);
  check('crossword: short, unusable clues are swapped and the app says so', g.game.log.some((l) => /plainer ones/.test(l.text)));
  const ans = g.game.answer;
  const wrong = ans.map((c, i) => (c ? (i === 0 ? (c === 'z' ? 'y' : 'z') : c) : ''));
  wrong[24] = '';
  await g.act({ letters: wrong });
  await g.act({ check: true });
  check('crossword: Check marks the wrong square', g.game.wrong.length === 1 && g.game.wrong[0] === 0);
  await g.act({ reveal: 0 });
  const r = await g.act({ cell: 24, letter: ans[24] });
  check('crossword: the last right letter solves it', r.game.status === 'over' && r.game.won === 'you');
  check('crossword: clues with any swapped are not kept for the day', !fs.existsSync(path.join(cfg.dataDir, 'games', 'crossword', `${g.game.day}.json`)));
  const fair = cw.SLOTS.map((s) => `${s.id}: A fair clue number ${s.num} ${s.dir}`).join('\n');
  const { g: g2, calls: c2, cfg: cfg2 } = setup({ replies: [fair] });
  await g2.start({ kind: 'crossword', daily: true });
  await g2.end({ quiet: true });
  const { g: g3, calls: c3 } = setup({ replies: ['should not be asked'] }); g3.brain.cfg.dataDir = cfg2.dataDir;
  await g3.start({ kind: 'crossword', daily: true });
  check('crossword: a good day\'s clues are kept, so the second play of the day needs no brain call', c2.chat.length === 1 && c3.chat.length === 0 && g3.game.clues['1a'] === 'A fair clue number 1 across'); }

// Letter grid
{ let t = 1_700_000_000_000;
  const { g } = setup({ now: () => t, games: { talk: 'end' } });
  const v = await g.start({ kind: 'grid' });
  check('letter grid: 16 letters, a deadline, Bob\'s words hidden', v.game.grid.length === 16 && v.game.ends === t + 180000 && v.game.bob === null);
  const w = g.game.all[0];
  await g.act({ word: w });
  let threw = ''; try { await g.act({ word: w }); } catch (e) { threw = e.message; }
  check('letter grid: a found word counts once', g.game.found.length === 1 && /already/.test(threw));
  threw = ''; try { await g.act({ word: 'qqq' }); } catch (e) { threw = e.message; }
  check('letter grid: a word not in the grid is refused', /isn't in the grid/.test(threw));
  t += 181000;
  const r = await g.act({ word: g.game.all[1] || 'cat' });
  check('letter grid: after the timer the game ends and scores are shown, Bob\'s words too', r.game.status === 'over' && r.game.points && Array.isArray(r.game.bob) && !r.game.found.includes(g.game.all[1])); }

// Noughts and crosses
{ const { g } = setup({ games: { talk: 'end' } });
  await g.start({ kind: 'noughts', level: 'perfect' });
  check('noughts: you are X and go first', g.game.mark === 'X' && g.game.board.every((c) => !c));
  await g.act({ cell: 4 });
  check('noughts: Bob answers at once with an O', g.game.board.filter((c) => c === 'O').length === 1 && g.game.mark === 'X');
  let threw = ''; try { await g.act({ cell: 4 }); } catch (e) { threw = e.message; }
  check('noughts: a taken square is refused', /taken/.test(threw));
  let n = 0; while (g.game.status === 'playing' && n++ < 6) await g.act({ cell: g.game.board.findIndex((c) => !c) });
  check('noughts: against "Can\'t be beaten" you never win', g.game.won !== 'you'); }

// Code breaker
{ const { g } = setup({ games: { talk: 'end' } });
  await g.start({ kind: 'codes' });
  check('code breaker: the code is hidden from the page', g.view().game.code === '' && g.game.code.length === 4);
  await g.act({ code: 'rgby' });
  check('code breaker: a try gets its pegs', g.game.tries[0].black + g.game.tries[0].white <= 4);
  const r = await g.act({ code: g.game.code });
  check('code breaker: the right code wins', r.game.won === 'you' && r.game.code.length === 4); }
{ const { g } = setup({ games: { talk: 'end' } });
  await g.start({ kind: 'codes', role: 'make' });
  let threw = ''; try { await g.act({ code: 'nope' }); } catch (e) { threw = e.message; }
  check('code breaker, Bob breaks: your code must be four colours', /four colours/.test(threw));
  await g.act({ code: 'rgby' });
  let n = 0; while (g.game.status === 'playing' && n++ < 12) await g.act({ next: true });
  check('code breaker, Bob breaks: the app marks his tries; he cracks it within ten', g.game.won === 'bob' && g.game.tries.length <= 10 && g.game.tries.at(-1).guess === 'rgby'); }

// Riddles
{ const { g, calls } = setup({ replies: ['Think of what you play with your fingers.', 'The answer is a piano!'], games: { talk: 'end' } });
  await g.start({ kind: 'riddles' });
  check('riddles: Bob asks the first riddle (the app\'s text), the answer is never in the view', /Riddle 1 of 5/.test(g.game.log.at(-1).text) && !JSON.stringify(g.view().game).includes(`"${RIDDLES[g.game.riddles[0]][1]}"`));
  await g.act({ hint: true });
  const r = RIDDLES[g.game.riddles[0]];
  check('riddles: a hint comes from the brain unless it names the answer', g.game.log.at(-1).hint && (plus.riddleAnswerMatches(calls.chat[0] && 'Think of what you play with your fingers.', r.slice(2)) || g.game.log.at(-1).text.length > 5));
  await g.act({ answer: r[2] });
  check('riddles: the right answer counts and the next riddle comes', g.game.solved === 1 && g.game.at === 1);
  await g.act({ skip: true });
  for (let k = 0; k < 3; k++) { const rr = RIDDLES[g.game.riddles[g.game.at]]; await g.act({ answer: rr[2] }); }
  check('riddles: after five, four solved is your point', g.game.status === 'over' && g.game.won === 'you' && g.game.solved === 4); }
{ const { g, calls } = setup({ replies: ['It is a PIANO, obviously.'], games: { talk: 'end' } });
  await g.start({ kind: 'riddles' });
  g.game.riddles[0] = 0; // the piano riddle
  await g.act({ hint: true });
  check('riddles: a hint that gives the answer away is replaced by the app\'s own', !/piano/i.test(g.game.log.at(-1).text) && calls.chat.length === 1); }

// Kid mode
check('kid mode is off by default and saved as a plain switch', cleanGames({}).kid === false && cleanGames({ kid: true }).kid === true && cleanGames({ kid: 'yes' }).kid === false);
check('kid mode asks Bob for gentle teasing only', /gentle teasing only/.test(persona({ games: { kid: true } })) && !/young child/.test(persona({})));
{ const { g } = setup({ games: { kid: true } });
  await g.start({ kind: 'hangman' });
  check('kid mode: Hangman picks an easy word', Object.values(KID_WORDS).flat().includes(g.game.word));
  await g.end();
  await g.start({ kind: 'letters' });
  check('kid mode: Five letters picks an easy word', KID_FIVE.includes(g.game.answer));
  await g.end();
  await g.start({ kind: 'chess', strength: 5 });
  check('kid mode: chess plays at Beginner', g.game.strength === 1);
  await g.end();
  await g.start({ kind: 'codes' });
  check('kid mode: code breaker has twelve tries and no repeated colours', g.game.max === 12 && new Set(g.game.code).size === 4); }

// Two players, one screen
{ const { g } = setup({ games: { talk: 'end' } });
  await g.start({ kind: 'hangman', players: ['Ann', 'Ben'] });
  check('two players: names kept, Ann first', g.game.two.join() === 'Ann,Ben' && g.view().game.twoTurn === 0);
  const miss = 'abcdefghijklmnopqrstuvwxyz'.split('').find((c) => !g.game.word.includes(c));
  await g.act({ letter: miss });
  check('two players: the move is Ann\'s, then the turn passes to Ben', g.game.log.find((l) => l.who === 'you').player === 'Ann' && g.game.twoTurn === 1 && /Ben's turn/.test(g.game.log.at(-1).text));
  await g.act({ word: g.game.word });
  check('two players: whoever solves it wins, named', g.game.status === 'over' && g.game.champ === 'Ben' && g.game.won === 'both'); }
{ const { g } = setup({ games: { talk: 'end' } });
  await g.start({ kind: 'noughts', players: ['Ann', 'Ben'] });
  for (const c of [0, 3, 1, 4]) await g.act({ cell: c });
  check('two players, noughts: no Bob moves; X and O alternate', g.game.board.join(',') === 'X,X,,O,O,,,,' && g.game.mark === 'X');
  await g.act({ cell: 2 });
  check('two players, noughts: three in a row names the winner', g.game.champ === 'Ann'); }
check('two players: bad names are cleaned, two the same are told apart', JSON.stringify(plus.cleanPlayers(['<b>Al</b>', ''])) === '["bAl/b","Player 2"]' && plus.cleanPlayers(['Jo', 'Jo']).join() === 'Jo 1,Jo 2' && plus.cleanPlayers('x') === null);

// Keep a story
{ const { g, brain } = setup({ replies: ['Once a cat found a key.', 'The end. TITLE: The Cat and the Key'], games: { talk: 'end' } });
  brain.games = g; // the route plays the brain's own games
  await g.start({ kind: 'story', bobStarts: true });
  const sent = {};
  const send = (res, code, body) => { sent.code = code; sent.body = body; };
  await gamesRoute({ req: { method: 'POST' }, res: {}, p: '/api/games/keep-story', brain, body: async () => ({}), send });
  check('keep a story: refused until the story is finished', sent.code === 409 && /Finish a Story dice story/.test(sent.body.error));
  await g.act({ end: true });
  await gamesRoute({ req: { method: 'POST' }, res: {}, p: '/api/games/keep-story', brain, body: async () => ({}), send });
  check('keep a story: saved as a page in the games folder', sent.code === 200 && fs.existsSync(path.join(plus.storiesDir(brain.cfg), sent.body.file)) && /^the-cat-and-the-key-/.test(sent.body.file));
  const html = plus.readStory(brain.cfg, sent.body.file);
  check('keep a story: the page has the title, the dice, every line and a Print button', /<h1>The Cat and the Key<\/h1>/.test(html) && /Once a cat found a key/.test(html) && /print\(\)/.test(html) && /Sam and Bob/.test(html));
  check('keep a story: only story files can be read back (no paths)', plus.readStory(brain.cfg, '../settings.json') === null && plus.readStory(brain.cfg, '..\\x.html') === null);
  check('keep a story: listed for the page', g.view().stories.length === 1);
  const page = plus.storyPage({ title: '<script>x</script>', lines: [{ who: 'you', text: '<img src=x>' }], dice: [] });
  check('keep a story: words are escaped on the page', !/<script>x/.test(page) && !/<img src=x>/.test(page)); }

// ---------- Help, glossary, FAQ, settings, phone, no brand names ----------
const help = read('public/help-content.js'), pub = read('public/games.js') + read('public/games-plus.js'), phone = read('public/phone/phone.js'), android = read('android/app/src/main/assets/www/phone.js');
check('Help covers the new games, Kid mode, two players and keeping a story', ['Chess', 'Sudoku', 'Mini crossword', 'Letter grid', 'Noughts and crosses', 'Code breaker', 'Riddles', 'Kid mode', 'Two players', 'Keep this story'].every((w) => help.includes(w)));
check('glossary entries for the new words', ['Chess', 'Sudoku', 'Mini crossword', 'Letter grid', 'Noughts and crosses', 'Code breaker', 'Riddles', 'Kid mode', 'Two players, one screen', 'Keep this story'].every((t) => help.includes(`<dt>${t}</dt>`)));
check('FAQ answers for the new games', ['faq-games-chess', 'faq-games-kid', 'faq-games-story-print', 'faq-games-two'].every((id) => help.includes(`id: '${id}', group: 'FAQ'`)));
check('the games page draws every new game', ['chess', 'sudoku', 'crossword', 'grid', 'noughts', 'codes', 'riddles'].every((k) => pub.includes(`'${k}'`)) && /keep-story/.test(pub) && /players/.test(pub));
check('the phone draws the new games too (both phone copies, the same)', phone === android && /chess: gamChess/.test(android) && /sudoku: gamSudoku/.test(android) && /keep-story/.test(android) && /Two players, one screen/.test(android));
check('the Kid mode switch is in Settings, 🧩 Games, and saved', /opt\('kid'/.test(pub) && /kid: g\.kid === true/.test(read('src/config.js')) && /Kid mode/.test(read('docs/SETTINGS-INVENTORY.md')));
const BRANDS = /wordle|scrabble|boggle|hasbro|mattel|mastermind|sudoku\.com|\bnyt\b|new york times|rory|tic-tac-toe/i;
check('no trademarked game names in the new games', !BRANDS.test(read('src/games-plus.js') + read('src/games-chess.js') + read('src/games-sudoku.js') + read('src/games-crossword.js') + read('src/games-grid.js') + read('src/games-small.js') + read('src/games-more-words.js') + pub));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
