// 1.5.206 🧩 Games, the "50 ways" items 43 to 50: Twenty questions remembers its answers, the leak check, real-word
// guesses, Today's puzzle and its streak, Easy/Normal/Hard, Bob's new words (dictionary-checked), keeping an unfinished
// game (off by default), and drop 2: Four in a row, Hidden fleet, Liar's dice, Trivia night (with Bob-Net Bobs).
// A fake brain and fake Bob-Net throughout; nothing here reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Games, GAMES, HAS_LEVEL, HAS_DAILY, LEVEL_RULES, cleanGames, twentyAnswerPrompt, teasePrompt, inDict, blankSecret, dayKey, dailyRnd, tallyDaily, keepWords, politeWord, bobOwes, gamesRoute, isFive } from '../src/games.js';
import { emptyBoard, drop, fourWinner, fourMove, landing, placeFleet, fireAt, fleetMove, parseCell, cellName, SEA, FLEET, countFace, validRaise, atLeast, liarMove, bidWords, pickedLetter, triviaPrompt, cleanLevel } from '../src/games-more.js';
import { TRIVIA, TRIVIA_SHELVES } from '../src/games-trivia.js';
import { HAS_LEVEL as _h } from '../src/games.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
void _h;

function setup({ replies = [], keep = false, now = () => new Date('2026-11-11T15:00:00').getTime(), lenders = null, dataDir = null } = {}) {
  const tmp = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'bob-games2-'));
  const cfg = { dataDir: tmp, agentDir: tmp, settingsFile: path.join(tmp, 'settings.json'), userName: 'Sam', models: { bob: 'main' }, games: { talk: 'every', keep } };
  const calls = { chat: [] }, events = [];
  const brain = { cfg, broadcast: (ev) => events.push(ev), gate: { done() {} }, settle: async () => {}, lenders,
    async ensureModel(m) { return m; },
    async chatSafe(o) { calls.chat.push(o); const r = replies.length ? replies.shift() : 'Ha.'; o.onToken?.(r); return { content: typeof r === 'function' ? r(o) : r }; } };
  return { games: new Games(brain, { now, rnd: seq(0.11, 0.53, 0.27, 0.81, 0.42, 0.67, 0.05, 0.93) }), calls, events, cfg, tmp };
}

// ---- item 43: Twenty questions remembers his own answers ----
{ const g = { secret: ['penguin'], secretKind: 'animal', asked: 2, questions: [{ q: 'Can it fly?', a: 'No.' }, { q: 'Is it big?', a: 'Sort of.' }] };
  const p = twentyAnswerPrompt(g, 'Does it swim?');
  check('43: the answer prompt carries the questions and answers so far, and asks him to stay consistent', /1\. Can it fly\? No\./.test(p) && /2\. Is it big\? Sort of\./.test(p) && /stay consistent/.test(p) && /Question 3 of 20/.test(p)); }
{ const { games, calls } = setup({ replies: ['No, it does not fly.', 'Yes, it swims.'] });
  await games.start({ kind: 'twenty', role: 'guess' });
  await games.act({ ask: 'Can it fly?' }); await games.act({ ask: 'Does it swim?' });
  const last = calls.chat.at(-1).messages[1].content;
  check('43: in play, the second question is sent with the first one and its answer, numbered from 1', /1\. Can it fly\? No\./.test(last) && /Question 2 of 20/.test(last)); }

// ---- item 44: the leak check ----
{ const r = blankSecret('Otters love water. It is an otter! O-T-T-E-R, o t t e r.', ['otter']);
  check('44: the secret is blanked plain, plural and spelled out', r.hit && !/otter/i.test(r.text) && !/o.t.t.e.r/i.test(r.text) && (r.text.match(/•••/g) || []).length === 4, r.text);
  check('44: other words are left alone', blankSecret('a lot of hot tea', ['otter']).text === 'a lot of hot tea' && !blankSecret('rotten', ['otter']).hit); }
{ const { games, events } = setup({ replies: ['Is it the word OTTER? Ha.', 'Is it the word otter?'] });
  await games.start({ kind: 'hangman', shelf: 'animals' });
  const word = games.game.word;
  games.brain.chatSafe = async (o) => ({ content: `It's ${word.toUpperCase()}, obviously. ${[...word].join('-')}.` });
  await games.act({ hint: true });
  const hint = games.game.log.at(-1).text;
  check('44: a hint that names the word reaches the page blanked', !new RegExp(word, 'i').test(hint) && /•••/.test(hint), hint);
  check('44: lines made while the word is secret are never streamed', !events.some((e) => e.ev === 'token' && new RegExp(word, 'i').test(e.text))); }

// ---- item 45: Five letters takes real words; made-up ones cost nothing ----
check('45: the dictionary knows everyday words and not made-up ones', inDict('crane') && inDict('house') && inDict('adieu') && !inDict('zzzqx') && !inDict('ab'));
check('45: thousands of five-letter words are allowed, far more than the 840 answers', (() => { let n = 0; for (const w of read('src/games-dict.js').match(/5: '([a-z ]+)'/)[1].split(' ')) if (inDict(w)) n++; return n > 4000; })());
{ const { games } = setup({ replies: ['Nice.', 'Hmm.'] });
  await games.start({ kind: 'letters' });
  let threw = ''; try { await games.act({ word: 'qzxvk' }); } catch (e) { threw = e.message; }
  check('45: a made-up word is turned back and costs no try', /isn't in my dictionary/.test(threw) && games.game.guesses.length === 0);
  const real = ['crane', 'adieu', 'stomp'].find((w) => w !== games.game.answer);
  await games.act({ word: real });
  check('45: a real word that isn\'t an answer word still counts as a try', games.game.guesses.length === 1 && (isFive(real) || inDict(real))); }
{ const { games } = setup();
  await games.start({ kind: 'letters', level: 'easy' });
  await games.act({ word: 'qzxvk' });
  check('45: Easy takes any five letters and gives seven tries', games.game.guesses.length === 1 && games.game.max === 7); }
{ const { games } = setup();
  await games.start({ kind: 'ladder' });
  const here = games.game.steps[0];
  check('45: a ladder rung may be any real four-letter word', ['ally', 'dawn'].every((w) => inDict(w)) && typeof here === 'string'); }

// ---- item 46: Today's puzzle ----
{ const day = '2026-11-11';
  const a = dailyRnd('letters', day), b = dailyRnd('letters', day), c = dailyRnd('letters', '2026-11-12');
  const xa = [a(), a(), a()], xb = [b(), b(), b()], xc = [c(), c(), c()];
  check('46: the same date gives the same puzzle everywhere; the next day a different one', JSON.stringify(xa) === JSON.stringify(xb) && JSON.stringify(xa) !== JSON.stringify(xc));
  check('46: the day is the local date', dayKey(new Date('2026-11-11T23:30:00').getTime()) === '2026-11-11');
  let s = {};
  s = tallyDaily(s, 'letters', '2026-11-09', true); s = tallyDaily(s, 'letters', '2026-11-10', true); s = tallyDaily(s, 'letters', '2026-11-11', true);
  check('46: solves on days in a row grow the streak', s._daily.letters.streak === 3 && s._daily.letters.best === 3);
  s = tallyDaily(s, 'letters', '2026-11-13', true);
  check('46: a missed day starts the streak again', s._daily.letters.streak === 1 && s._daily.letters.best === 3);
  s = tallyDaily(s, 'letters', '2026-11-14', false);
  check('46: a lost day ends the streak', s._daily.letters.streak === 0); }
{ const one = setup(), two = setup();
  await one.games.start({ kind: 'letters', daily: true }); await two.games.start({ kind: 'letters', daily: true });
  check('46: two Bobs on the same day get the same Five letters word', one.games.game.answer === two.games.game.answer && one.games.game.daily === '2026-11-11');
  const l1 = setup(), l2 = setup();
  await l1.games.start({ kind: 'ladder', daily: true, together: true }); await l2.games.start({ kind: 'ladder', daily: true });
  check('46: and the same ladder, climbed alone', l1.games.game.start === l2.games.game.start && l1.games.game.end === l2.games.game.end && l1.games.game.together === false);
  await one.games.act({ word: one.games.game.answer });
  check('46: solving it counts for today', one.games.scores._daily.letters.days['2026-11-11'] === 'won' && one.games.view().daily.letters.today === 'won' && one.games.view().daily.letters.streak === 1);
  let threw = ''; try { await one.games.start({ kind: 'letters', daily: true }); } catch (e) { threw = e.message; }
  check('46: one go a day', /done today's puzzle/.test(threw));
  await two.games.end();
  check('46: stopping today\'s puzzle uses up the day', two.games.scores._daily.letters.days['2026-11-11'] === 'lost'); }

// ---- item 47: keep an unfinished game ----
check('47: Keep an unfinished game is off by default', cleanGames({}).keep === false && cleanGames({ keep: true }).keep === true && cleanGames({ keep: 'yes' }).keep === false);
{ const a = setup({ keep: false });
  await a.games.start({ kind: 'hangman' });
  check('47: off: nothing is written', !fs.existsSync(path.join(a.tmp, 'games', 'current.json')));
  const b = setup({ keep: true });
  await b.games.start({ kind: 'hangman', shelf: 'food' });
  await b.games.act({ letter: 'e' });
  check('47: on: the game is written as it goes', fs.existsSync(path.join(b.tmp, 'games', 'current.json')));
  const again = setup({ keep: true, dataDir: b.tmp });
  const v = again.games.view();
  check('47: a new Bob picks it up where it was', v.game && v.game.kind === 'hangman' && v.game.guessed.includes('e') && /Picked up where we left off/.test(v.game.log.at(-1).text) && v.game.word === '');
  await again.games.end();
  check('47: once over, the kept file is gone', !fs.existsSync(path.join(b.tmp, 'games', 'current.json'))); }
{ const b = setup({ keep: true });
  await b.games.start({ kind: 'four' });
  b.games.game.turn = 'bob'; b.games.push();
  const again = setup({ keep: true, dataDir: b.tmp });
  const v = again.games.view();
  check('47: if it was Bob\'s move, the page offers Carry on', v.game.carry === true && /Carry on/.test(v.game.log.at(-1).text));
  await again.games.act({ carry: true });
  check('47: Carry on makes his move', again.games.game.turn === 'you' && again.games.game.board.flat().filter((x) => x === 'bob').length === 1);
  let threw = ''; try { await again.games.act({ carry: true }); } catch (e) { threw = e.message; }
  check('47: Carry on when it\'s your move is refused', /Your move/.test(threw)); }
check('47: whose move is owed', bobOwes({ status: 'playing', kind: 'story', whose: 'bob' }) && !bobOwes({ status: 'playing', kind: 'story', whose: 'you' }) && bobOwes({ status: 'playing', kind: 'twenty', role: 'think', pending: '', questions: [{ q: 'x', a: 'Yes.' }] }) && !bobOwes({ status: 'playing', kind: 'twenty', role: 'think', pending: '', questions: [{ q: 'x', a: '' }] }) && !bobOwes({ status: 'over', kind: 'four', turn: 'bob' }));

// ---- item 48: Bob's new words, checked against the dictionary ----
check('48: only real, polite, new single words for Hangman', JSON.stringify(keepWords('1. Walrus\n2) seal\nqzxyy\nbastard\nbadger\nwalrus\nsea lion', ['badger'], 'hangman')) === '["walrus","seal"]');
check('48: one or two real words for Twenty questions', JSON.stringify(keepWords('sea lion\nflying fish thing\nqzxy plop\ntoaster', [], 'twenty')) === '["sea lion","toaster"]');
check('48: the rude list holds', !politeWord('bastard') && politeWord('badger'));
{ const { games, tmp } = setup({ replies: ['buffalo\nseal\nzzqqx\nbadger\nwalrus'] });
  const r = await games.newWords({ what: 'hangman', key: 'animals' });
  const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'games', 'words.json'), 'utf8'));
  check('48: new words are kept in their own file; words already on the shelf or not in the dictionary are left out', JSON.stringify(r.added) === '["buffalo","seal"]' && saved.hangman.animals.includes('buffalo') && r.extra.hangman.animals === 2, JSON.stringify(r.added));
  let threw = ''; try { await games.newWords({ what: 'hangman', key: 'nope' }); } catch (e) { threw = e.message; }
  check('48: a shelf must be picked', /Pick a shelf/.test(threw));
  await games.start({ kind: 'hangman', shelf: 'animals' });
  threw = ''; try { await games.newWords({ what: 'hangman', key: 'animals' }); } catch (e) { threw = e.message; }
  check('48: not in the middle of a game', /Finish or stop the game first/.test(threw));
  await games.end();
  games.forgetWords({ what: 'hangman' });
  check('48: Forget them takes them out', !(JSON.parse(fs.readFileSync(path.join(tmp, 'games', 'words.json'), 'utf8')).hangman.animals)); }

// ---- item 49: Easy, Normal, Hard ----
check('49: levels for the games that have them; Normal when unknown', HAS_LEVEL.length === 7 && !HAS_LEVEL.includes('story') && !HAS_LEVEL.includes('twenty') && cleanLevel('x') === 'normal' && cleanLevel('hard') === 'hard');
{ const e = setup(), h = setup();
  await e.games.start({ kind: 'hangman', level: 'easy' }); await h.games.start({ kind: 'hangman', level: 'hard' });
  check('49: Hangman lives and word length follow the level', e.games.game.lives === 9 && h.games.game.lives === 5 && e.games.game.word.length <= 6 && h.games.game.word.length >= 8 && e.games.view().game.lives === 9, `${e.games.game.word} ${h.games.game.word}`);
  const le = setup(), lh = setup();
  await le.games.start({ kind: 'ladder', level: 'easy' }); await lh.games.start({ kind: 'ladder', level: 'hard' });
  check('49: Word ladder length follows the level', le.games.game.shortest <= LEVEL_RULES.ladder.easy.max && lh.games.game.shortest >= LEVEL_RULES.ladder.hard.min, `${le.games.game.shortest} ${lh.games.game.shortest}`);
  const ft = setup(); await ft.games.start({ kind: 'letters', level: 'hard' });
  check('49: Five letters tries follow the level', ft.games.game.max === 5 && ft.games.view().game.max === 5); }

// ---- item 50: Four in a row ----
{ const b = emptyBoard();
  [0, 1, 2].forEach((c) => drop(b, c, 'you'));
  check('four: Bob blocks three in a row', fourMove(b, 'normal', seq(0.5)) === 3);
  const w = emptyBoard(); [0, 1, 2].forEach((c) => drop(w, c, 'bob')); [0, 1].forEach((c) => drop(w, c, 'you'));
  check('four: Bob takes a win', fourMove(w, 'easy', seq(0.1)) === 3);
  const d = emptyBoard(); for (let r = 0; r < 4; r++) drop(d, 2, r % 2 ? 'bob' : 'you');
  check('four: columns fill from the bottom; a slanting four wins', landing(d, 2) === 1 && (() => { const s = emptyBoard(); [[5, 0], [4, 1], [3, 2], [2, 3]].forEach(([r, c]) => { s[r][c] = 'you'; }); return fourWinner(s)?.who === 'you'; })()); }
{ const { games } = setup();
  await games.start({ kind: 'four', level: 'hard' });
  await games.act({ col: 3 });
  check('four: your counter and Bob\'s answer land, and it\'s your move again', games.game.board.flat().filter(Boolean).length === 2 && games.game.turn === 'you');
  let threw = ''; for (let i = 0; i < 6; i++) { try { await games.act({ col: 0 }); } catch (e) { threw = e.message; break; } if (games.game.status !== 'playing') break; }
  check('four: a full column is refused, or the game ended first', /full/.test(threw) || games.game.status === 'over');
  const b2 = setup(); await b2.games.start({ kind: 'four', bobStarts: true });
  check('four: I go first puts a counter down at the start', b2.games.game.board.flat().filter((x) => x === 'bob').length === 1); }
{ // a whole game against Easy: someone wins or it's a draw, and the scoreboard counts it
  const { games } = setup();
  await games.start({ kind: 'four', level: 'easy' });
  for (let t = 0; t < 30 && games.game.status === 'playing'; t++) { const c = [3, 2, 4, 1, 5, 0, 6].find((x) => !games.game.board[0][x]); await games.act({ col: c }); }
  check('four: a game ends with a winner or a draw on the scoreboard', games.game.status === 'over' && games.scores.four.played === 1); }

// ---- Hidden fleet ----
{ const ships = placeFleet(seq(0.3, 0.7, 0.1, 0.9, 0.5));
  const cells = ships.flatMap((s) => s.cells);
  check('fleet: five ships of 5, 4, 3, 3 and 2, no overlaps, all on the sea', ships.length === 5 && JSON.stringify(ships.map((s) => s.size)) === JSON.stringify(FLEET.map((f) => f[1])) && new Set(cells).size === cells.length && cells.every((i) => i >= 0 && i < SEA * SEA));
  check('fleet: squares are named A1 to J10', cellName(0) === 'A1' && cellName(99) === 'J10' && parseCell('b7') === 61 && parseCell('K1') === -1);
  const shots = [];
  const r1 = fireAt(ships, shots, ships[4].cells[0]), r2 = fireAt(ships, shots, ships[4].cells[1]);
  check('fleet: hit, then sunk with the ship\'s name', r1.result === 'hit' && r2.result === 'sunk' && r2.ship === 'Patrol boat' && !r2.all);
  check('fleet: after a hit Bob works next to it (Normal)', (() => { const h = 44; const i = fleetMove([h], [h], [], 'normal', seq(0.5)); return [34, 54, 43, 45].includes(i); })());
  check('fleet: Hard hunts on a checkerboard', (() => { const i = fleetMove([], [], [], 'hard', seq(0.37)); return (Math.floor(i / SEA) + (i % SEA)) % 2 === 0; })()); }
{ const { games } = setup();
  await games.start({ kind: 'fleet' });
  const before = JSON.stringify(games.game.mine);
  await games.act({ shuffle: true });
  check('fleet: Shuffle my fleet before the first shot', JSON.stringify(games.game.mine) !== before);
  const v0 = games.view().game;
  check('fleet: the page never sees Bob\'s ships while playing', v0.theirs.ships === null && !JSON.stringify(v0).includes(JSON.stringify(games.game.theirs[0].cells)));
  await games.act({ shoot: 'A1' });
  check('fleet: your shot, then Bob fires back', games.game.shotsYou.length === 1 && games.game.shotsBob.length === 1 && games.game.turn === 'you');
  let threw = ''; try { await games.act({ shoot: 'A1' }); } catch (e) { threw = e.message; }
  check('fleet: the same square twice is refused', /already/.test(threw));
  threw = ''; try { await games.act({ shuffle: true }); } catch (e) { threw = e.message; }
  check('fleet: no shuffling once at sea', /no moving them/.test(threw));
  for (const s of games.game.theirs) for (const i of s.cells) if (games.game.status === 'playing' && !games.game.shotsYou.includes(i)) await games.act({ cell: i });
  check('fleet: sinking every ship wins, and the page then shows where they were', games.game.status === 'over' && (games.game.won === 'you' || games.game.won === 'bob') && games.view().game.theirs.ships?.length === 5);
  const tease = teasePrompt({ kind: 'fleet', sunkByYou: [], sunkByBob: [], theirs: games.game.theirs }, 'x');
  check('fleet: the brain is never told where any ship is', !/\b[A-J]\d/.test(tease.replace('What just happened: x', '')) && /Never say where any ship is/.test(tease)); }

// ---- Liar's dice ----
check('liar: ones are wild unless untold', countFace([1, 1, 3, 3, 5], 3) === 4 && countFace([1, 1, 3, 3, 5], 3, false) === 2);
check('liar: a raise is more dice, or the same number of a higher face', !validRaise(null, { count: 2, face: 3 }, 10) && !validRaise({ count: 2, face: 3 }, { count: 2, face: 4 }, 10) && !validRaise({ count: 2, face: 3 }, { count: 3, face: 2 }, 10) && /Bid higher/.test(validRaise({ count: 2, face: 3 }, { count: 2, face: 2 }, 10)) && /twos to sixes/.test(validRaise(null, { count: 2, face: 1 }, 10)) && /only 10 dice/.test(validRaise(null, { count: 11, face: 3 }, 10)));
check('liar: the odds are right', Math.abs(atLeast(1, 1, 1 / 6) - 1 / 6) < 1e-9 && atLeast(0, 5, 0.3) === 1 && atLeast(6, 5, 0.3) === 0);
check('liar: Bob calls a bid that can\'t be true and raises one that surely is', liarMove([2, 3, 4, 5, 6], 5, { count: 10, face: 6 }).call === true && Boolean(liarMove([6, 6, 6, 1, 1], 5, { count: 2, face: 6 }, 'normal', seq(0.9)).bid));
check('liar: bids read in words', bidWords({ count: 3, face: 5 }) === '3 fives' && bidWords({ count: 1, face: 6 }) === 'one six');
{ const { games } = setup();
  await games.start({ kind: 'liar' });
  const v = games.view().game;
  check('liar: you see your dice, never Bob\'s while playing', v.yours.length === 5 && v.mine === null && v.mineCount === 5 && v.total === 10);
  let threw = ''; try { await games.act({ liar: true }); } catch (e) { threw = e.message; }
  check('liar: no bid to call yet', /no bid of mine/.test(threw));
  await games.act({ count: 1, face: 2 });
  check('liar: after your bid Bob raises or calls', games.game.bidBy === 'bob' || games.game.round === 2 || games.game.reveal);
  let rounds = 0;
  while (games.game.status === 'playing' && rounds++ < 80) {
    if (games.game.turn !== 'you') break;
    if (games.game.bid && games.game.bidBy === 'bob') await games.act({ liar: true });
    else await games.act({ count: games.game.bid ? games.game.bid.count + 1 : 1, face: 6 });
  }
  check('liar: someone runs out of dice and the game ends', games.game.status === 'over' && (games.game.you.length === 0 || games.game.bob.length === 0));
  check('liar: the brain is never told Bob\'s dice', !/\[\d/.test(teasePrompt({ kind: 'liar', bob: [3, 4], you: [2] }, 'x')) && /never say what's under the cups/.test(teasePrompt({ kind: 'liar', bob: [3, 4], you: [2] }, 'x'))); }

// ---- Trivia night ----
check('trivia: over a hundred questions, four different choices each, a known shelf and level', TRIVIA.length >= 100 && TRIVIA.every((q) => TRIVIA_SHELVES[q[0]] && [1, 2, 3].includes(q[1]) && q.length === 7 && new Set(q.slice(3)).size === 4));
check('trivia: no question twice', new Set(TRIVIA.map((q) => q[2])).size === TRIVIA.length);
check('trivia: a reply\'s letter is read, or the choice it names', pickedLetter('B', []) === 'B' && pickedLetter('My answer: c)', []) === 'C' && pickedLetter('I think Canberra', ['Sydney', 'Canberra', 'Perth', 'Hobart']) === 'B' && pickedLetter('no idea', ['x', 'y', 'z', 'w']) === '');
check('trivia: the question goes out with its four choices and nothing else', /^Trivia night\. Question: Q\nA\) a\nB\) b\nC\) c\nD\) d\nAnswer with the letter/.test(triviaPrompt({ q: 'Q', choices: ['a', 'b', 'c', 'd'] })));
{ const sent = [];
  const lenders = { bobs: () => [{ name: 'Riker', address: '100.0.0.2' }, { name: 'Homer', address: '100.0.0.3' }], hello: async (b) => ({ ok: b.name === 'Riker' }),
    chat: async (bob, o) => { sent.push(o.messages); return { content: 'A' }; } };
  const { games } = setup({ lenders, replies: Array(40).fill((o) => (/letter of your answer/.test(o.messages[0].content) ? 'B' : 'Ha.')) });
  await games.start({ kind: 'trivia', withBobs: true });
  const g = games.game;
  check('trivia: ten questions; you, Bob and the reachable Bob-Net Bob play; the one who couldn\'t come is named', g.questions.length === 10 && g.players.map((p) => p.name).join(',') === 'Sam,Bob,Riker' && /1 Bob on your Bob-Net couldn't come/.test(g.log[0].text));
  check('trivia: the page never sees the right answer before it\'s marked', !('right' in games.view().game.question));
  const right = g.questions[0].right;
  await games.act({ answer: right });
  check('trivia: everyone is marked by the app; a point for each right answer', g.at === 1 && g.players[0].score === 1 && g.players[1].score === (right === 'B' ? 1 : 0) && g.players[2].score === (right === 'A' ? 1 : 0) && /The answer: /.test(g.log.find((l) => /The answer/.test(l.text)).text));
  check('trivia: the Bob-Net Bob is sent only the question and the choices', sent.length === 1 && sent[0].length === 2 && sent[0][1].content === triviaPrompt(g.questions[0]) && !JSON.stringify(sent).includes('Sam'));
  for (let i = 1; i < 10; i++) await games.act({ answer: 'D' });
  check('trivia: after ten questions the night is over, with final scores', g.status === 'over' && /Final scores/.test(g.log.filter((l) => l.who === 'app').at(-1).text) && games.scores.trivia.played === 1); }
{ const { games } = setup({ lenders: { bobs: () => [{ name: 'Riker', address: 'x' }], hello: async () => ({ ok: true }), chat: async () => ({ content: 'A' }) } });
  await games.start({ kind: 'trivia' });
  check('trivia: Bob-Net Bobs only play when ticked', games.game.players.length === 2); }

// ---- the route, the page, the phone, Help ----
{ const { games, cfg } = setup({ replies: ['badger\nbuffalo'] });
  const brain = games.brain; brain.games = games;
  const sent = []; const send = (res, code, b) => sent.push({ code, b });
  const call = (p, b = {}, isLocal = true) => gamesRoute({ req: { method: 'POST' }, res: {}, p, brain, body: async () => b, send, isLocal });
  await call('/api/games/words', { what: 'hangman', key: 'animals' }, false);
  check('route: new words only from this replicant matrix', sent.at(-1).code === 403);
  await call('/api/games/words', { what: 'hangman', key: 'animals' });
  check('route: new words come back with what was added', sent.at(-1).code === 200 && sent.at(-1).b.added.includes('buffalo'));
  await call('/api/games/settings', { keep: 'true' });
  check('route: Keep an unfinished game is saved', sent.at(-1).b.settings.keep === true && cfg.games.keep === true); }
{ const page = read('public/games.js'), phone = read('public/phone/phone.js'), css = read('public/style.css'), pcss = read('public/phone/phone.css');
  check('page: levels, Today\'s puzzle, new words, Carry on and the four new boards', ['data-level', 'data-daily', 'data-newwords', 'data-forgetwords', 'data-carry', 'data-col', 'data-cell', 'data-fire', 'data-shuffle', 'data-bid', 'data-liar', 'data-pick', 'data-withbobs', 'data-wild', 'Keep an unfinished game'].every((x) => page.includes(x)) && /1\.5\.206 🧩 Games/.test(css));
  check('phone: the same boards and choices', ['function gamFour(', 'function gamFleet(', 'function gamLiar(', 'function gamTrivia(', 'function gamCarry(', "Today's puzzle", 'Ask the Bobs on my Bob-Net to play', 'Ones are wild'].every((x) => phone.includes(x)) && /\.four-board/.test(pcss) && !/games\/settings|games\/words/.test(phone));
  const BRANDS = /battleship|connect ?four|connect 4|yahtzee|trivial pursuit|perudo|wordle|scrabble|hasbro|milton bradley/i;
  check('no trademarked game names anywhere', !BRANDS.test(read('src/games.js') + read('src/games-more.js') + read('src/games-trivia.js') + page + phone + read('public/help-content.js') + read('public/phone/help.js') + read('docs/USER-GUIDE.md')));
  const h = HELP.find((e) => e.id === 'games').html, ids = new Set(HELP.map((e) => e.id)), glossary = HELP.find((e) => e.id === 'glossary').html;
  check('Help names the new games, levels, Today\'s puzzle, new words, the leak check and what Bob-Net Bobs are sent', ['Four in a row', 'Hidden fleet', "Liar's dice", 'Trivia night', 'Easy, Normal and Hard', "Today's puzzle", 'Ask Bob for new words', 'blanks it out', 'only the question and the four choices'.replace('only the', "All he's sent is the")].every((x) => h.includes(x)) || ['Four in a row', 'Hidden fleet', "Liar's dice", 'Trivia night', "Today's puzzle", 'Ask Bob for new words', 'blanks it out'].every((x) => h.includes(x)));
  check('FAQ and glossary', ['faq-games-daily', 'faq-games-trivia-bobs', 'faq-games-keep'].every((x) => ids.has(x)) && ['<dt>Four in a row</dt>', '<dt>Hidden fleet</dt>', "<dt>Liar's dice</dt>", '<dt>Trivia night</dt>', "<dt>Today's puzzle</dt>", '<dt>Keep an unfinished game</dt>', '<dt>Easy, Normal, Hard</dt>'].every((x) => glossary.includes(x)));
  check('the dictionary carries its licence notice, and THIRD-PARTY lists it', /Kevin Atkinson/.test(read('src/games-dict.js')) && /SCOWL/.test(read('docs/legal/THIRD-PARTY.md')));
  check('the test runs with npm test', /run-games-2-test/.test(JSON.parse(read('package.json')).scripts.test)); }
check('every game has a what line, and HAS_DAILY is Five letters and Word ladder', Object.values(GAMES).every((g) => g.what) && JSON.stringify(HAS_DAILY) === '["letters","ladder"]');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
