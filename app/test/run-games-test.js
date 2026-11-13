// 1.5.121 🧩 Games: the word lists, the rules the app runs (ladder paths, letter marks, masks, lives, tries), the
// brain picks (quick brain; Gaming brain on the processor in Gaming), the five games played through with a fake
// brain (wins, losses, hints, stops), the brain let go when a game ends, the scoreboard, the route, settings, Help.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GAMES, GAME_IDS, LIVES, TRIES, QUESTIONS, STORY_ROUNDS, DICE_COUNT, TALK, cleanGames, gamesBrain, refusal, neighbours, oneLetterApart, ladderPath, pickLadder, isFour, markGuess, maskWord, names, diceUsed, persona, teasePrompt, hintPrompt, endPrompt, twentyAnswerPrompt, twentyAskPrompt, storyLinePrompt, tally, Games, gamesRoute } from '../src/games.js';
import { FOUR, FIVE, HANGMAN, SHELVES, SECRETS, KINDS, DICE } from '../src/games-words.js';
import { HELP } from '../public/help-content.js';
import { plainText, settingsNow } from '../src/self-help.js';
import { SETTING_KEYS, mergeSettings } from '../src/config.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

// ---- the words ----
check('sixteen games (drop 1, drop 2 and the second set), each with an icon, a name and a one-line what', GAME_IDS.length === 16 && GAME_IDS.every((id) => GAMES[id].icon && GAMES[id].name && GAMES[id].what.length > 20));
check('the ladder list is four-letter words, no doubles, about a thousand of them', FOUR.length > 900 && new Set(FOUR).size === FOUR.length && FOUR.every((w) => /^[a-z]{4}$/.test(w)));
check('the five-letter list is five-letter words, no doubles', FIVE.length > 700 && new Set(FIVE).size === FIVE.length && FIVE.every((w) => /^[a-z]{5}$/.test(w)));
check('every Hangman shelf has a name and at least 25 words, lower case letters only', Object.keys(HANGMAN).every((k) => SHELVES[k] && HANGMAN[k].length >= 25 && HANGMAN[k].every((w) => /^[a-z]+$/.test(w))));
check('every Twenty questions secret has a kind the app can say and at least one answer word', SECRETS.length >= 60 && SECRETS.every((s) => KINDS[s[0]] && s.length >= 2));
check('the story dice are pictures with words, enough for a roll of six without repeats', DICE.length >= 30 && DICE.every((d) => d[0] && d[1]) && DICE_COUNT === 6);
const BRANDS = /wordle|scrabble|boggle|hasbro|mattel|story cubes|rory/i;
check('no trademarked game names anywhere public', !BRANDS.test(read('src/games.js') + read('src/games-words.js') + read('public/games.js') + read('public/help-content.js') + read('public/index.html') + read('docs/USER-GUIDE.md') + read('docs/releases/v1.5.121.md')));

// ---- the rules the app runs ----
check('neighbours: one letter apart and in the list', neighbours('cold').includes('bold') && neighbours('cold').includes('colt') && !neighbours('cold').includes('cold') && oneLetterApart('cold', 'cord') && !oneLetterApart('cold', 'warm'));
{ const p = ladderPath('cold', 'warm'); check('a shortest path exists between cold and warm, every rung a real word one letter on', p && p[0] === 'cold' && p.at(-1) === 'warm' && p.every(isFour) && p.every((w, i) => !i || oneLetterApart(p[i - 1], w)), p?.join(' → ')); }
check('no path: null', ladderPath('cold', 'zzzz') === null);
{ const l = pickLadder(seq(0.1, 0.5, 0.9, 0.3)); check('a picked ladder is 3 to 5 rungs and climbable', l.shortest >= 3 && l.shortest <= 5 && ladderPath(l.start, l.end).length - 1 === l.shortest, `${l.start} → ${l.end} (${l.shortest})`); }
check('letter marks: right spot, in the word elsewhere (once per letter), not in it', markGuess('crane', 'react') === 'yygby' && markGuess('eerie', 'there') === 'ybybg' && markGuess('apple', 'apple') === 'ggggg' && markGuess('zzzzz', 'apple') === 'bbbbb');
check('a mask shows only the letters guessed', maskWord('otter', ['t', 'e']) === '_ t t e _' && maskWord('otter', ['o', 't', 'e', 'r']) === 'o t t e r');
check('a guess names the secret when any answer word is in it, plurals too', names('is it a penguin?', ['penguin']) && names('Penguins!', ['penguin']) && names('ice cream', ['ice cream', 'icecream']) && !names('a pen', ['penguin']));
check('a story line uses a die when its noun is in the line', JSON.stringify(diceUsed('The cat found a key in the rain.', [['', 'a cat'], ['', 'a key'], ['', 'rain'], ['', 'a map']])) === '[true,true,true,false]');
check('the scoreboard counts your wins, my wins, shared games and your best run', (() => { let s = {}; s = tally(s, 'hangman', 'you'); s = tally(s, 'hangman', 'you'); s = tally(s, 'hangman', 'bob'); s = tally(s, 'story', 'both'); return s.hangman.played === 3 && s.hangman.won === 2 && s.hangman.lost === 1 && s.hangman.best === 2 && s.hangman.streak === 0 && s.story.drawn === 1; })());

// ---- settings and the brain ----
check('Games settings have defaults and only known values; nothing is "on"', JSON.stringify(cleanGames({})) === '{"brain":"quick","talk":"every","keep":false,"kid":false}' && cleanGames({ brain: 'main', talk: 'end' }).talk === 'end' && cleanGames({ brain: 'x', talk: 'y' }).brain === 'quick' && Object.keys(TALK).length === 3);
check('the setting is saved under its own key and cleaned', SETTING_KEYS.includes('games') && (() => { const c = { settingsFile: '', agentDir: '' }; mergeSettings(c, { games: { brain: 'main', talk: 'bogus' } }); return c.games.brain === 'main' && c.games.talk === 'every'; })());
{ const q = gamesBrain({ models: { bob: 'big' } }); check('the quick brain plays, on the card, thinking off, small context', q.model === 'gemma4:e4b' && q.cpu === false && q.think === false && q.ctx === 8192);
  check('with "Quick answers on CPU" it plays on the processor', gamesBrain({ models: { bob: 'big' }, quickOnCpu: true }).cpu === true);
  const g = gamesBrain({ session: 'light', models: { bob: 'big' } }); check('in the Gaming session the Gaming brain plays, on the processor (never E4B, never the card)', g.model === 'qwen3-4b' && g.cpu === true);
  check('Main Brain when picked', gamesBrain({ games: { brain: 'main' }, models: { bob: 'big' } }).model === 'big'); }
check('refused only when no brain is equipped at all', /Equip a Brain/.test(refusal({ models: {} })) && refusal({ models: { bob: 'x' } }) === '' && refusal({ session: 'light', models: { bob: 'x' } }) === '');
check('Bob can say the Games settings', /🧩 Games/.test(settingsNow({})) && /Quick brain/.test(settingsNow({})) && /Only at the end/.test(settingsNow({ games: { talk: 'end' } })));

// ---- what the brain is told ----
{ const g = { kind: 'hangman', word: 'otter', shelf: 'animals', guessed: ['t'], wrong: 2, hints: 0 };
  check('the tease prompt gives Bob the word and forbids saying it', /"otter"/.test(teasePrompt(g, 'x')) && /Never say the secret word/.test(teasePrompt(g, 'x')) && /_ t t _ _/.test(teasePrompt(g, 'x')));
  check('the hint prompt forbids letters and length', /without the word, any part of the word, its letters or its length/.test(hintPrompt(g)));
  check('the end prompt says who won', /you won/.test(endPrompt({ ...g, won: 'bob' })) && /I won/.test(endPrompt({ ...g, won: 'you' })));
  check('the persona is short, with no lists or emoji asked for', /No lists, no headings, no emoji/.test(persona({ userName: 'Sam' })) && /Sam/.test(persona({ userName: 'Sam' })));
  const t = { kind: 'twenty', role: 'guess', secret: ['penguin'], secretKind: 'animal', asked: 3, questions: [] };
  check('Twenty questions: Bob answers from the app\'s secret with Yes, No or Sort of', /"penguin"/.test(twentyAnswerPrompt(t, 'Does it fly?')) && /Yes, No, or Sort of/.test(twentyAnswerPrompt(t, 'Does it fly?')) && /Question 4 of 20/.test(twentyAnswerPrompt(t, 'x')));
  const u = { kind: 'twenty', role: 'think', asked: 19, questions: [{ q: 'Is it alive?', a: 'Yes.' }] };
  check('Twenty questions: Bob asks one question, or writes GUESS:, and must guess on the last one', /GUESS:/.test(twentyAskPrompt(u)) && /last question/.test(twentyAskPrompt(u)) && /Ask question 2 of 20/.test(twentyAskPrompt({ ...u, asked: 1 })) && /Is it alive\? Yes\./.test(twentyAskPrompt(u)));
  const s = { kind: 'story', dice: [['', 'a key'], ['', 'rain']], used: [true, false], lines: [{ who: 'you', text: 'A key fell.' }] };
  check('Story dice: Bob is told the dice still to use, and writes a TITLE at the end', /Still to use: rain/.test(storyLinePrompt(s)) && /Do not end the story/.test(storyLinePrompt(s)) && /TITLE:/.test(storyLinePrompt(s, { ending: true }))); }

// ---- the games, with a fake brain ----
function setup({ replies = [], session = 'normal', talk = 'every', fail = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-games-'));
  const cfg = { dataDir: tmp, agentDir: tmp, settingsFile: path.join(tmp, 'settings.json'), session, userName: 'Sam', models: { bob: 'main' }, games: { talk } };
  const calls = { ensure: [], chat: [], done: 0, settle: 0 };
  const events = [];
  const brain = {
    cfg, broadcast: (ev) => events.push(ev), log: () => {},
    gate: { done: () => { calls.done++; } },
    settle: async () => { calls.settle++; },
    async ensureModel(model, emit, signal, who, opts) { calls.ensure.push({ model, who, opts }); return model; },
    async chatSafe(o) { calls.chat.push(o); if (fail) throw new Error('engine down'); const r = replies.length ? replies.shift() : 'Ha, nice try.'; o.onToken?.(r); return { content: r }; }
  };
  const games = new Games(brain, { rnd: seq(0.01, 0.37, 0.62, 0.88, 0.2, 0.5) });
  return { games, calls, events, cfg, tmp };
}

// Hangman: win
{ const { games, calls, events, cfg } = setup({ replies: ['Ooh, a T.', 'Nope.', 'There it is: OTTER. Well played.'] });
  const v0 = games.view(); check('before Start: no game, nothing loaded, the sixteen games and the scoreboard offered', v0.game === null && !calls.ensure.length && Object.keys(v0.games).length === 16 && v0.refusal === '');
  const v = await games.start({ kind: 'hangman', shelf: 'animals' });
  const g = games.game;
  check('Hangman starts with a word from the shelf, masked, seven lives, the word never in the view', g.shelf === 'animals' && HANGMAN.animals.includes(g.word) && v.game.masked.split(' ').every((c) => c === '_') && v.game.lives === LIVES && v.game.word === '' && v.game.length === g.word.length);
  check('the opening line is the app\'s, not the brain\'s: nothing loaded yet', !calls.ensure.length && g.log[0].who === 'app' && /Animals/.test(g.log[0].text));
  const first = g.word[0];
  let r = await games.act({ letter: first });
  check('a right letter shows in the mask, costs nothing, and Bob is asked for one tease on the quick brain, thinking off', r.game.masked.includes(first) && r.game.wrong === 0 && calls.ensure.length === 1 && calls.ensure[0].who === 'games' && calls.chat[0].think === false && calls.chat[0].model === 'gemma4:e4b' && g.log.at(-1).who === 'bob' && g.log.at(-1).text === 'Ooh, a T.');
  check('Bob\'s tease is told the move and never asked to spell anything', /which is in the word/.test(calls.chat[0].messages[1].content) && /Never say the secret word/.test(calls.chat[0].messages[1].content));
  const miss = 'abcdefghijklmnopqrstuvwxyz'.split('').find((c) => !g.word.includes(c));
  r = await games.act({ letter: miss });
  check('a wrong letter costs a life', r.game.wrong === 1 && r.game.guessed.includes(miss));
  let threw = ''; try { await games.act({ letter: miss }); } catch (e) { threw = e.message; }
  check('the same letter twice is refused, no life lost', /already/.test(threw) && g.wrong === 1);
  r = await games.act({ word: g.word });
  check('guessing the whole word wins; the word is shown, the brain says its last line, and is let go', r.game.status === 'over' && r.game.won === 'you' && r.game.word === g.word && g.log.at(-1).text.includes('OTTER') && calls.done === 1 && games.stop === null);
  await new Promise((res) => setTimeout(res, 5));
  check('settle after the game (lightweight rule)', calls.settle === 1);
  check('the scoreboard counts it and is saved', r.scores.hangman.won === 1 && fs.existsSync(path.join(cfg.dataDir, 'games', 'scores.json')));
  check('the page got state events; a line made while the word is secret is never streamed (1.5.206 leak check), the end line is', events.some((e) => e.type === 'games' && e.ev === 'state') && !events.some((e) => e.ev === 'token' && e.text === 'Ooh, a T.') && events.some((e) => e.ev === 'token' && /There it is/.test(e.text)));
  check('Back to the games clears a finished game', games.close().game === null); }
// Hangman: lose, hints cost a life, talk only at the end
{ const { games, calls } = setup({ replies: ['A clue: it swims.', 'The word was... well, you saw.'], talk: 'end' });
  await games.start({ kind: 'hangman' });
  const g = games.game;
  const misses = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((c) => !g.word.includes(c));
  await games.act({ hint: true });
  check('a hint costs a life and comes from the brain, which is told the word', g.wrong === 1 && g.hints === 1 && g.log.at(-1).hint === true && g.log.at(-1).text === 'A clue: it swims.' && calls.chat[0].messages[1].content.includes(`"${g.word}"`));
  for (let i = 0; i < LIVES - 2; i++) await games.act({ letter: misses[i] });
  check('"Only at the end": no tease after the misses', calls.chat.length === 1 && g.status === 'playing' && g.wrong === LIVES - 1);
  const r = await games.act({ letter: misses[LIVES] });
  check('the seventh wrong guess drops it: my point, the word shown', r.game.status === 'over' && r.game.won === 'bob' && /The word was/.test(g.log.at(-2).text) && r.game.word === g.word && calls.chat.length === 2); }
// Word ladder: just me, hint, back, dead end, win
{ const { games, calls } = setup({ replies: ['Up you go.', 'Made it.'] });
  const v = await games.start({ kind: 'ladder' });
  const g = games.game;
  check('a ladder has a start, an end and a shortest climb, and no brain yet', g.start !== g.end && g.shortest >= 3 && v.game.path === null && !calls.ensure.length && /shortest climb is/.test(g.log[0].text));
  let threw = ''; try { await games.act({ word: 'zzzz' }); } catch (e) { threw = e.message; }
  check('a rung must be one letter away and a real word (the app says which)', /isn't one letter away|isn't in my word list/.test(threw) && g.steps.length === 1);
  const path1 = ladderPath(g.start, g.end);
  await games.act({ hint: true });
  check('a hint shows the next rung that works, from the app, not the brain', g.hints === 1 && g.log.at(-1).hint === true && g.log.at(-1).text.includes(path1[1].toUpperCase()) && !calls.ensure.length);
  await games.act({ word: path1[1] });
  check('a good rung is added and Bob teases once', g.steps[1] === path1[1] && calls.chat.length === 1 && /Don't suggest the next word/.test(calls.chat[0].messages[1].content));
  await games.act({ back: true });
  check('Back a rung undoes it', g.steps.length === 1);
  for (const w of path1.slice(1, -1)) await games.act({ word: w });
  const r = await games.act({ word: g.end });
  check('reaching the end wins, shortest way noted, the path shown', r.game.status === 'over' && r.game.won === 'you' && /the shortest way/.test(g.log.at(-2).text) && Array.isArray(r.game.path)); }
// Word ladder: together, Bob's rung is the app's (shortest path), shared win
{ const { games, calls } = setup({ replies: ['Nice.', 'Nice.', 'Nice.', 'We did it.'] });
  await games.start({ kind: 'ladder', together: true });
  const g = games.game;
  const p = ladderPath(g.start, g.end);
  const r = await games.act({ word: p[1] });
  const bob = g.log.find((l) => l.who === 'bob' && l.step);
  check('climbing together: after your rung the app picks mine on the shortest path, as a step line, then one tease', g.steps.length === 3 && bob && bob.text === g.steps[2].toUpperCase() && oneLetterApart(g.steps[1], g.steps[2]) && isFour(g.steps[2]) && (r.game.status === 'over' || calls.chat.length === 1));
  let n = 0;
  while (games.game.status === 'playing' && n++ < 10) { const q = ladderPath(g.steps.at(-1), g.end); await games.act({ word: q[1] }); }
  check('the climb together ends as a shared point', g.status === 'over' && g.won === 'both'); }
// Five letters: marks, hint costs a try, lose on six
{ const { games, calls } = setup({ replies: ['Warm.', 'A clue: you sit at it.', 'Cold.', 'Cold.', 'Cold.', 'It was TABLE.'] });
  const v = await games.start({ kind: 'letters' });
  const g = games.game;
  check('Five letters starts with six tries, the answer hidden', v.game.max === TRIES && v.game.answer === '' && FIVE.includes(g.answer) && !calls.ensure.length);
  let threw = ''; try { await games.act({ word: 'cat' }); } catch (e) { threw = e.message; }
  check('a try is five letters', threw === 'Five letters.');
  const wrong = FIVE.find((w) => w !== g.answer);
  let r = await games.act({ word: wrong });
  check('a try is marked and Bob is told the counts, never the letters to say', r.game.guesses[0].word === wrong && /^[gyb]{5}$/.test(r.game.guesses[0].marks) && /in the right spot/.test(calls.chat[0].messages[1].content));
  r = await games.act({ hint: true });
  check('a hint costs a try and comes from the brain', r.game.guesses.length === 2 && r.game.guesses[1].hint === true && g.log.at(-1).text === 'A clue: you sit at it.');
  const others = FIVE.filter((w) => w !== g.answer && w !== wrong);
  for (let i = 0; i < 3; i++) await games.act({ word: others[i] });
  r = await games.act({ word: others[3] });
  check('six tries gone: my point, the word shown', r.game.status === 'over' && r.game.won === 'bob' && r.game.answer === g.answer && /Six tries gone/.test(g.log.at(-2).text)); }
// Five letters: win in one
{ const { games } = setup({ replies: ['Lucky!'] });
  await games.start({ kind: 'letters' });
  const r = await games.act({ word: games.game.answer });
  check('the right word wins with all green marks', r.game.status === 'over' && r.game.won === 'you' && r.game.guesses[0].marks === 'ggggg'); }
// Twenty questions: Bob thinks (the app's secret), you ask, then guess
{ const { games, calls } = setup({ replies: ['Yes, it does. Now stop looking at me like that.', 'No. Colder.'] });
  const v = await games.start({ kind: 'twenty', role: 'guess' });
  const g = games.game;
  check('I think of something: the kind is told, the secret hidden, nothing loaded', KINDS[g.secretKind] && v.game.secret === '' && v.game.max === QUESTIONS && new RegExp(KINDS[g.secretKind]).test(g.log[0].text) && !calls.ensure.length);
  let r = await games.act({ ask: 'Does it have legs?' });
  check('a question goes to the brain with the secret, and the Yes/No is kept', calls.chat[0].messages[1].content.includes(`"${g.secret[0]}"`) && r.game.asked === 1 && r.game.questions[0].a === 'Yes.' && g.log.at(-1).who === 'bob');
  r = await games.act({ guess: 'a lamp post' });
  check('a wrong guess counts as a question and costs no brain call', r.game.asked === 2 && calls.chat.length === 1 && /not a lamp post/.test(g.log.at(-1).text));
  r = await games.act({ guess: `is it a ${g.secret[0]}?` });
  check('naming the secret wins, checked by the app, not the brain', r.game.status === 'over' && r.game.won === 'you' && r.game.secret === g.secret[0] && calls.chat.length === 1 && calls.done === 1); }
// Twenty questions: twenty asked, Bob's point
{ const { games } = setup({ replies: Array(25).fill('No.') });
  await games.start({ kind: 'twenty', role: 'guess' });
  for (let i = 0; i < QUESTIONS - 1; i++) await games.act({ ask: `Question ${i}?` });
  check('nineteen asked, still playing', games.game.status === 'playing' && games.game.asked === 19);
  const r = await games.act({ ask: 'Last one?' });
  check('the twentieth without a right guess: my point, the secret told', r.game.status === 'over' && r.game.won === 'bob' && /My point/.test(games.game.log.at(-1).text)); }
// Twenty questions: you think, Bob asks, guesses, right
{ const { games, calls } = setup({ replies: ['Is it alive?', 'Can you hold it?', 'GUESS: a teapot'] });
  const v = await games.start({ kind: 'twenty', role: 'think' });
  const g = games.game;
  check('you think: Bob asks the first question straight away', calls.chat.length === 1 && v.game.asked === 1 && g.log.at(-1).text === 'Is it alive?' && v.game.questions[0].q === 'Is it alive?');
  let threw = ''; try { await games.act({ answer: 'maybe' }); } catch (e) { threw = e.message; }
  check('only Yes, No, Sort of or I don\'t know are answers', /Yes, No, Sort of/.test(threw));
  let r = await games.act({ answer: 'no' });
  check('your answer is kept beside the question and Bob asks the next', r.game.questions[0].a === 'No.' && r.game.asked === 2 && /1\. Is it alive\? No\./.test(calls.chat[1].messages[1].content));
  r = await games.act({ answer: 'yes' });
  check('GUESS: becomes "Is it a teapot?" and the page gets Right/Wrong', r.game.guessing && r.game.pendingGuess === 'a teapot' && g.log.at(-1).guess === true && r.game.asked === 3);
  r = await games.act({ right: true });
  check('Right! is my point, in that many questions', r.game.status === 'over' && r.game.won === 'bob' && /in 3 questions/.test(g.log.at(-1).text)); }
// Twenty questions: Bob guesses wrong, goes on; at the last he must guess; wrong again is your point
{ const replies = []; for (let i = 0; i < 19; i++) replies.push(`Question ${i}?`); replies.push('GUESS: a lamp', 'a kettle');
  const { games } = setup({ replies });
  await games.start({ kind: 'twenty', role: 'think' });
  for (let i = 0; i < 18; i++) await games.act({ answer: 'no' });
  check('nineteen questions in', games.game.asked === 19 && !games.game.pending);
  await games.act({ answer: 'no' });
  check('an early guess, wrong: it counts as the twentieth question', games.game.pending === 'a lamp' && games.game.asked === 20);
  const r = await games.act({ right: false, reveal: 'a toaster' });
  check('wrong at twenty: your point, with what it was', r.game.status === 'over' && r.game.won === 'you' && /a toaster/.test(games.game.log.at(-1).text)); }
// Story dice: you open, dice tracked, Bob's lines, the ending with a title, shared
{ const { games, calls } = setup({ replies: ['The cat stared at the key.', 'Everything was found.\nTITLE: The Wet Map'] });
  const v = await games.start({ kind: 'story' });
  const g = games.game;
  check('six dice come up, none used, you open, nothing loaded', v.game.dice.length === 6 && v.game.used.every((u) => !u) && v.game.whose === 'you' && !calls.ensure.length && /dice came up/.test(g.log[0].text));
  const words = g.dice.map((d) => d[1].replace(/^(a|an|the) /, ''));
  let r = await games.act({ line: `Once there was ${g.dice[0][1]} and ${g.dice[1][1]}.` });
  check('your line marks its dice and Bob answers with a line (told which dice are still to use)', r.game.used[0] && r.game.used[1] && r.game.lines.length === 2 && r.game.lines[1].who === 'bob' && calls.chat[0].messages[1].content.includes(words[2]) && r.game.whose === 'you' && r.game.round === 1);
  r = await games.act({ end: true });
  check('Wrap it up: Bob writes the ending and a title, a shared game, the brain let go', r.game.status === 'over' && r.game.won === 'both' && r.game.title === 'The Wet Map' && r.game.lines.at(-1).text === 'Everything was found.' && calls.done === 1); }
// Story dice: Bob opens; all dice used ends it; six rounds cap
{ const { games, calls } = setup({ replies: ['A key, a cat, rain, a map, a candle and a train all met.', 'The end.\nTITLE: All at once'] });
  const games2 = games; games2.rnd = seq(0.01, 0.37, 0.62, 0.88, 0.2, 0.5);
  await games2.start({ kind: 'story', bobStarts: true });
  const g = games2.game;
  check('I open: my line comes first', g.lines[0]?.who === 'bob' && g.whose === 'you' && calls.chat.length === 1);
  const all = g.dice.map((d) => d[1]).join(', ');
  const r = await games2.act({ line: `Then ${all} fell over.` });
  check('once every die is in, the story ends with a title', r.game.status === 'over' && r.game.used.every(Boolean) && r.game.title === 'All at once'); }
{ const { games } = setup({ replies: Array(20).fill('More happened.') });
  await games.start({ kind: 'story' });
  let n = 0; while (games.game.status === 'playing' && n++ < 20) await games.act({ line: 'And so on.' });
  check(`a story stops after ${STORY_ROUNDS} rounds even with dice left`, games.game.status === 'over' && games.game.round === STORY_ROUNDS && games.game.title === 'Our story'); }
// Stop, brain failure, Gaming session
{ const { games, calls } = setup();
  await games.start({ kind: 'hangman' });
  const r = await games.end();
  check('Stop ends the game, shows the word, counts it as unfinished and lets the brain go', r.game.status === 'over' && r.game.won === 'none' && /The word was/.test(games.game.log.at(-1).text) && calls.done === 1 && r.scores.hangman.lost === 1);
  let threw = ''; try { await games.act({ letter: 'a' }); } catch (e) { threw = e.message; }
  check('no move on a finished game', /No game on/.test(threw)); }
{ const { games } = setup({ fail: true });
  await games.start({ kind: 'hangman' });
  const g = games.game;
  const r = await games.act({ letter: g.word[0] });
  check('when the brain fails the game goes on without the line, with a plain note', r.game.status === 'playing' && /lost my words/.test(g.log.at(-1).text) && r.busy === false); }
{ const { games, calls } = setup({ session: 'light' });
  await games.start({ kind: 'hangman' });
  await games.act({ letter: games.game.word[0] });
  check('in the Gaming session the games brain is the Gaming brain on the processor', calls.ensure[0].model === 'qwen3-4b' && calls.ensure[0].opts.cpu === true && calls.chat[0].cpu === true); }
{ const { games } = setup();
  let threw = ''; try { await games.start({ kind: 'pinball' }); } catch (e) { threw = e.message; }
  check('an unknown game is refused', /Pick a game/.test(threw));
  games.brain.cfg.models = {};
  threw = ''; try { await games.start({ kind: 'hangman' }); } catch (e) { threw = e.message; }
  check('no brain equipped: refused with a plain line', /Equip a Brain/.test(threw)); }

// ---- the route ----
{ const { games, cfg } = setup({ replies: ['Hi.'] });
  const brain = games.brain; brain.games = games;
  const sent = [];
  const send = (res, code, b) => sent.push({ code, b });
  const call = (method, p, b = {}, isLocal = true) => gamesRoute({ req: { method }, res: {}, p, brain, body: async () => b, send, isLocal });
  check('the route takes only /api/games', (await call('GET', '/api/other')) === false);
  await call('GET', '/api/games'); check('GET /api/games is the view', sent.at(-1).code === 200 && sent.at(-1).b.game === null && sent.at(-1).b.games.hangman);
  await call('POST', '/api/games/start', { kind: 'letters' }); check('POST start', sent.at(-1).code === 200 && sent.at(-1).b.game.kind === 'letters');
  await call('POST', '/api/games/act', { word: 'cat' }); check('a bad move is a 409 with the reason', sent.at(-1).code === 409 && sent.at(-1).b.error === 'Five letters.');
  await call('POST', '/api/games/settings', { talk: 'end' }, false); check('settings only from this replicant matrix', sent.at(-1).code === 403);
  await call('POST', '/api/games/settings', { talk: 'end' }); check('settings saved and cleaned', sent.at(-1).code === 200 && sent.at(-1).b.settings.talk === 'end' && cfg.games.talk === 'end');
  await call('POST', '/api/games/end'); check('POST end', sent.at(-1).b.game.status === 'over');
  await call('POST', '/api/games/close'); check('POST close', sent.at(-1).b.game === null); }

// ---- the page, Help, docs ----
{ const page = read('public/games.js'), html = read('public/index.html'), app = publicText('app.js'), cellar = publicText('cellar.js'), css = read('public/style.css'), server = read('src/server.js');
  check('the menu has Games and the dialog', /id="gamesBtn"/.test(html) && /<span class="lbl">Games<\/span>/.test(html) && /<dialog id="games"/.test(html) && /🧩 Games/.test(html));
  check('the app opens the page and forwards games events', /createGames\(\{ api \}\)/.test(app) && /case 'games': window.dispatchEvent\(new CustomEvent\('bob-games'/.test(app));
  check('the page has a Start per game, the controls of each game, Stop and the scoreboard', /data-start="\$\{id\}"/.test(page) && /data-ask/.test(page) && /data-answer/.test(page) && /data-key/.test(page) && /data-climb/.test(page) && /data-try/.test(page) && /data-line/.test(page) && /data-wrap/.test(page) && /🏁 Stop/.test(page) && /Scoreboard/.test(page));
  check('the page says nothing loads until Start', /Nothing loads until you press Start/.test(page));
  check('Stop asks on an in-page card (Stop the game / Keep playing), never a browser dialog; Best run has a tip; Games is 🧩, not the Gaming session\'s 🎮', /data-stopyes/.test(page) && /Keep playing/.test(page) && !/confirm\(/.test(page) && /Best run \$\{tip\(/.test(page) && /🧩 Games/.test(html) && !/🎮 Games/.test(html + cellar + page + read('public/help-content.js')));
  check('Settings has the 🧩 Games panel with both rows', /\['games', '🧩 Games'/.test(cellar) && /mountGamesSettings/.test(cellar) && /Games brain/.test(page) && /How often Bob chips in/.test(page));
  check('styles and the route are in', /1\.5\.121 🧩 Games/.test(css) && /gamesRoute/.test(server));
  const ids = new Set(HELP.map((e) => e.id));
  check('Help: Games, Settings: Games, three FAQ', ['games', 'settings-games', 'faq-games-cheat', 'faq-games-gaming', 'faq-games-brain'].every((id) => ids.has(id)));
  const h = HELP.find((e) => e.id === 'games');
  check('Help names every game, Start, Stop, Hint, the shelf, the colours and the phone, in Bob\'s voice', ['Twenty questions', 'Hangman', 'Word ladder', 'Five letters', 'Story dice', '▶ Start', 'Hint', 'Animals', 'green in the right spot', 'On the phone', 'I only talk'].every((s) => h.html.includes(s)) );
  const glossary = HELP.find((e) => e.id === 'glossary').html;
  check('glossary: Twenty questions, Word ladder, Five letters, Story dice, Shelf', ['<dt>Twenty questions</dt>', '<dt>Word ladder</dt>', '<dt>Five letters</dt>', '<dt>Story dice</dt>', '<dt>Shelf</dt>'].every((s) => glossary.includes(s)));
  check('Help uses the on-screen words', ['Quick brain', 'Main Brain', 'How often Bob chips in', 'After every move', 'Now and then', 'Only at the end', 'That\'s my guess', 'Wrap it up', 'Back a rung'].every((s) => h.html.includes(s)));
  const guide = read('docs/USER-GUIDE.md'), inv = read('docs/SETTINGS-INVENTORY.md'), rel = read('docs/releases/v1.5.121.md'), pkg = JSON.parse(read('package.json'));
    // 1.5.122: at least 1.5.121 b172 (the drop that brought Games), so later versions keep passing.
  const [maj, min, pat] = String(pkg.version).split('.').map(Number), build = Number(/"build": (\d+),/.exec(read('package.json'))?.[1]);
  check('docs: user guide, settings inventory rows, release notes, version 1.5.121 build 172 or later', /🧩 Games/.test(guide) && /Games brain/.test(inv) && /How often Bob chips in/.test(inv) && /Games/.test(rel) && (maj > 1 || (maj === 1 && (min > 5 || (min === 5 && pat >= 121)))) && build >= 172 && pkg.testSuites.includes('test/run-games-test.js')); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
