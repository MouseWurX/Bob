// 🧩 Games (1.5.121): small games Bob plays with you. The rule that makes them work on the quick brain: the app runs the
// game and the brain only talks. The app picks the secret word, checks every guess, counts the lives and keeps the
// score; the brain answers yes or no, teases, hints and tells the story. Nothing loads until you press Start, and the
// brain is let go when a game ends, like after any job.
//
// Drop 1 (the owner, 2026-11-05): Twenty questions (either way round), Hangman, Word ladder, Five letters, Story dice.
// Everything here also serves the phone: the page is a view of GET /api/games and the game accepts the same POSTs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { currentSession, modelFor, sessionBrains, quickOnCpu } from './sessions.js';
import { saveSettings } from './config.js';
import { FOUR, FIVE, HANGMAN, SHELVES, SECRETS, KINDS, DICE } from './games-words.js';

export const GAMES = {
  twenty: { icon: '❓', name: 'Twenty questions', what: 'One of us thinks of something, the other asks yes-or-no questions. Twenty at most.' },
  hangman: { icon: '🪢', name: 'Hangman', what: 'I pick a word from a shelf; you guess it a letter at a time. Seven wrong guesses and it drops.' },
  ladder: { icon: '🪜', name: 'Word ladder', what: 'Climb from one four-letter word to another, changing one letter a step. Every rung must be a real word.' },
  letters: { icon: '🟩', name: 'Five letters', what: 'Guess my five-letter word in six tries. Each try colours the letters: right spot, wrong spot, not in the word.' },
  story: { icon: '🎲', name: 'Story dice', what: 'Six picture dice come up. We tell a story a line each until every die is in it.' }
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
    talk: TALK[g.talk] ? g.talk : 'every' // how often Bob comments in the games the app runs (Hangman, Word ladder, Five letters)
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
  return NEIGHBOURS.get(word) || [];
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

// ---------- What the brain is told ----------
// Short on purpose: 150 tokens of system prompt, a line of game state, and one line back. E4B does this well.
export const persona = (cfg) => `You are ${cfg.windowsName || 'Bob'}, a friendly AI with a dry sense of humour, playing a quick game with ${cfg.userName || 'your friend'}. Keep it light. One or two short sentences at most, unless told otherwise. No lists, no headings, no emoji.`;
export const BANTER_RULES = 'Never say the secret word, never spell it, never say which letters are in it or how long it is. Tease, cheer or sympathise, nothing more.';
export function teasePrompt(g, moment) {
  if (g.kind === 'hangman') return `We're playing Hangman. The secret word is "${g.word}" (from the shelf ${SHELVES[g.shelf]}). The board shows ${maskWord(g.word, g.guessed)}. Wrong guesses so far: ${g.wrong} of ${LIVES}. What just happened: ${moment}. ${BANTER_RULES}`;
  if (g.kind === 'letters') return `We're playing Five letters (guess the five-letter word in six tries). The secret word is "${g.answer}". Guesses so far: ${g.guesses.map((x) => x.word).join(', ') || 'none'}. Try ${g.guesses.length} of ${TRIES}. What just happened: ${moment}. ${BANTER_RULES}`;
  if (g.kind === 'ladder') return `We're playing Word ladder: from "${g.start}" to "${g.end}", one letter a step, real words only. The rungs so far: ${g.steps.join(' → ')}. The shortest climb is ${g.shortest} steps. What just happened: ${moment}. Don't suggest the next word. Tease, cheer or sympathise, nothing more.`;
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
  if (g.kind === 'ladder') return `Word ladder is over: ${won}. From "${g.start}" to "${g.end}" in ${g.steps.length - 1} steps (shortest ${g.shortest}): ${g.steps.join(' → ')}. One line about the climb.`;
  return `The game is over: ${won}. One line about it.`;
}
// Twenty questions, Bob thinks of something: he answers from the app's secret.
export const twentyAnswerPrompt = (g, question) => `We're playing Twenty questions. I'm asking, you answer. Your secret is "${g.secret[0]}" (${KINDS[g.secretKind]}). Question ${g.asked + 1} of ${QUESTIONS}: "${question}". Start your reply with exactly one of these words: Yes, No, or Sort of. Then at most one short sentence that gives nothing away. Never say the secret or any part of it.`;
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
    this.scores = null;
  }
  get cfg() { return this.brain.cfg; }
  emit(ev) { this.brain.broadcast?.({ type: 'games', ...ev }); }
  push() { this.emit({ ev: 'state', ...this.view() }); }

  // What the page (and the phone) sees. The secret never leaves until the game is over.
  view() {
    const g = this.game;
    const pub = g ? this.publicGame(g) : null;
    if (!this.scores) this.scores = loadScores(this.cfg);
    return { game: pub, busy: this.busy, scores: this.scores, settings: cleanGames(this.cfg.games), refusal: refusal(this.cfg), games: GAMES, talk: TALK };
  }
  publicGame(g) {
    const over = g.status === 'over';
    const base = { id: g.id, kind: g.kind, name: GAMES[g.kind].name, icon: GAMES[g.kind].icon, status: g.status, won: g.won || '', log: g.log, started: g.started };
    if (g.kind === 'twenty') return { ...base, role: g.role, secretKind: g.secretKind, asked: g.asked, max: QUESTIONS, questions: g.questions, guessing: Boolean(g.pending), pendingGuess: g.pending || '', secret: over && g.secret ? g.secret[0] : '' };
    if (g.kind === 'hangman') return { ...base, shelf: SHELVES[g.shelf], masked: maskWord(g.word, g.guessed), guessed: g.guessed, wrong: g.wrong, lives: LIVES, hints: g.hints, word: over ? g.word : '', length: g.word.length };
    if (g.kind === 'ladder') return { ...base, start: g.start, end: g.end, steps: g.steps, shortest: g.shortest, together: g.together, whose: g.whose, hints: g.hints, path: over ? g.path : null };
    if (g.kind === 'letters') return { ...base, guesses: g.guesses, max: TRIES, hints: g.hints, answer: over ? g.answer : '' };
    if (g.kind === 'story') return { ...base, dice: g.dice, used: g.used, lines: g.lines, whose: g.whose, round: g.round, max: STORY_ROUNDS, title: g.title || '' };
    return base;
  }
  line(who, text, extra = {}) { this.game.log.push({ who, text: clean(text, 1200), at: this.now(), ...extra }); }

  // Start a game. Nothing has run before this.
  async start(b = {}) {
    const kind = GAME_IDS.includes(b.kind) ? b.kind : null;
    if (!kind) throw new Error('Pick a game first.');
    const why = refusal(this.cfg);
    if (why) throw new Error(why);
    if (this.game && this.game.status === 'playing') await this.end({ quiet: true });
    const g = { id: crypto.randomBytes(5).toString('hex'), kind, status: 'playing', won: '', log: [], started: this.now(), hints: 0 };
    if (kind === 'twenty') {
      g.role = b.role === 'think' ? 'think' : 'guess'; // guess: Bob thinks of something, you guess. think: you think, Bob guesses.
      g.asked = 0; g.questions = []; g.pending = '';
      if (g.role === 'guess') { const s = pick(SECRETS, this.rnd); g.secretKind = s[0]; g.secret = s.slice(1); }
      else g.secretKind = '';
    } else if (kind === 'hangman') {
      g.shelf = SHELVES[b.shelf] ? b.shelf : pick(Object.keys(HANGMAN), this.rnd);
      g.word = pick(HANGMAN[g.shelf], this.rnd); g.guessed = []; g.wrong = 0;
    } else if (kind === 'ladder') {
      Object.assign(g, pickLadder(this.rnd)); g.steps = [g.start]; g.together = b.together === true; g.whose = 'you'; g.path = null;
    } else if (kind === 'letters') {
      g.answer = pick(FIVE, this.rnd); g.guesses = [];
    } else if (kind === 'story') {
      g.dice = shuffle(DICE, this.rnd).slice(0, DICE_COUNT); g.used = g.dice.map(() => false); g.lines = []; g.round = 0; g.whose = b.bobStarts === true ? 'bob' : 'you'; g.title = '';
    }
    this.game = g;
    this.stop = new AbortController();
    this.push();
    // The opening line. Twenty questions and Story dice are brain games, so Bob speaks first when it's his turn.
    if (kind === 'twenty' && g.role === 'guess') this.line('app', `I'm thinking of ${KINDS[g.secretKind]}. Ask me anything with a yes-or-no answer, or take a guess. Twenty questions, then I win.`);
    else if (kind === 'twenty') { this.line('app', `Think of something, anything, and keep it to yourself. I'll ask up to twenty yes-or-no questions.`); await this.bobAsks(); }
    else if (kind === 'hangman') this.line('app', `A word from the shelf ${SHELVES[g.shelf]}, ${g.word.length} letters. Seven wrong guesses and it drops.`);
    else if (kind === 'ladder') this.line('app', `Climb from ${g.start.toUpperCase()} to ${g.end.toUpperCase()}. One letter a step, real words only. The shortest climb is ${g.shortest} steps.${g.together ? ' We take turns: you first.' : ''}`);
    else if (kind === 'letters') this.line('app', `Five letters, six tries. Each try colours the letters: green in the right spot, yellow in the word somewhere else, grey not in it.`);
    else if (kind === 'story') { this.line('app', `The dice came up: ${g.dice.map((d) => `${d[0]} ${d[1]}`).join(', ')}. ${g.whose === 'you' ? 'You open the story; a line each until every die is in.' : 'I open the story; a line each until every die is in.'}`); if (g.whose === 'bob') await this.bobStoryLine(); }
    this.push();
    return this.view();
  }

  // ---------- Bob speaks ----------
  async say(user, { system = persona(this.cfg), stream = true } = {}) {
    const b = gamesBrain(this.cfg);
    if (!b) throw new Error(refusal(this.cfg) || 'No brain for games.');
    const signal = this.stop?.signal;
    this.busy = true; this.push();
    try {
      const model = (await this.brain.ensureModel(b.model, (ev) => { if (ev.type === 'announce') this.emit({ ev: 'announce', text: ev.text }); }, signal, GAMES_WHO, { cpu: b.cpu, ctx: b.ctx, what: 'a game' })) || b.model;
      const onToken = stream ? (t) => this.emit({ ev: 'token', text: t }) : undefined;
      const reply = await this.brain.chatSafe({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], signal, cpu: b.cpu, think: b.think, ctx: b.ctx, onToken }, { emit: () => {}, who: GAMES_WHO });
      return clean(String(reply?.content || ''), 600).replace(/^["“]|["”]$/g, '');
    } finally { this.busy = false; }
  }
  // A tease after a move, if the setting says so now. Failures are quiet: the game goes on without the line.
  async tease(moment, { always = false } = {}) {
    const t = cleanGames(this.cfg.games).talk;
    if (!always && (t === 'end' || (t === 'some' && this.rnd() < 0.6))) return;
    try { const text = await this.say(teasePrompt(this.game, moment)); if (text) this.line('bob', text); } catch (e) { if (!this.stop?.signal.aborted) this.line('app', `I lost my words for a moment (${clean(e.message, 120)}). The game goes on.`); }
  }
  async finish(won) {
    const g = this.game;
    g.status = 'over'; g.won = won;
    if (g.kind === 'ladder') g.path = ladderPath(g.start, g.end);
    this.scores = tally(this.scores || loadScores(this.cfg), g.kind, won);
    saveScores(this.cfg, this.scores);
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
      if (!quiet) { this.scores = tally(this.scores || loadScores(this.cfg), g.kind, 'none'); saveScores(this.cfg, this.scores); }
      this.letGo();
    }
    if (quiet) this.game = null;
    this.push();
    return this.view();
  }
  close() { if (this.game?.status === 'over') this.game = null; this.push(); return this.view(); }

  // ---------- A move ----------
  async act(b = {}) {
    const g = this.game;
    if (!g || g.status !== 'playing') throw new Error('No game on. Press Start first.');
    if (this.busy) throw new Error("Hold on, I'm still talking.");
    if (g.kind === 'twenty') await this.actTwenty(b);
    else if (g.kind === 'hangman') await this.actHangman(b);
    else if (g.kind === 'ladder') await this.actLadder(b);
    else if (g.kind === 'letters') await this.actLetters(b);
    else if (g.kind === 'story') await this.actStory(b);
    this.push();
    return this.view();
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
        try { text = await this.say(twentyAnswerPrompt(g, q)); } catch (e) { if (this.stop?.signal.aborted) return; text = ''; }
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
    const g = this.game;
    if (b.hint === true) {
      g.hints++; g.wrong++;
      let text = '';
      try { text = await this.say(hintPrompt(g)); } catch { text = ''; }
      this.line('bob', text || `It's on the shelf ${SHELVES[g.shelf]}; that's all you get.`, { hint: true });
      if (g.wrong >= LIVES) { this.line('app', `That hint cost the last life. The word was ${g.word.toUpperCase()}.`); return this.finish('bob'); }
      return;
    }
    if (b.word) {
      const w = word(b.word);
      if (w.length < 2) throw new Error('Type the whole word.');
      this.line('you', w.toUpperCase());
      if (w === g.word) { g.guessed = [...new Set([...g.guessed, ...g.word])]; this.line('app', `${g.word.toUpperCase()} it is, with ${LIVES - g.wrong} ${LIVES - g.wrong === 1 ? 'life' : 'lives'} to spare.`); return this.finish('you'); }
      g.wrong++;
      if (g.wrong >= LIVES) { this.line('app', `Not ${w.toUpperCase()}, and that was the last life. The word was ${g.word.toUpperCase()}.`); return this.finish('bob'); }
      return this.tease(`a whole-word guess, "${w}", and it was wrong`);
    }
    const c = word(b.letter).slice(0, 1);
    if (!c) throw new Error('Pick a letter.');
    if (g.guessed.includes(c)) throw new Error(`You tried ${c.toUpperCase()} already.`);
    g.guessed.push(c);
    const hit = g.word.includes(c);
    if (!hit) g.wrong++;
    this.line('you', c.toUpperCase(), { hit });
    if ([...g.word].every((x) => g.guessed.includes(x))) { this.line('app', `${g.word.toUpperCase()}! Solved with ${LIVES - g.wrong} ${LIVES - g.wrong === 1 ? 'life' : 'lives'} to spare.`); return this.finish('you'); }
    if (g.wrong >= LIVES) { this.line('app', `No ${c.toUpperCase()}, and that was the last life. The word was ${g.word.toUpperCase()}.`); return this.finish('bob'); }
    return this.tease(hit ? `the letter ${c.toUpperCase()}, which is in the word` : `the letter ${c.toUpperCase()}, which isn't in the word (${LIVES - g.wrong} ${LIVES - g.wrong === 1 ? 'life' : 'lives'} left)`);
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
    if (!isFour(w)) throw new Error(`${w.toUpperCase()} isn't in my word list.`);
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
    const g = this.game;
    if (b.hint === true) {
      g.hints++;
      let text = '';
      try { text = await this.say(hintPrompt(g)); } catch { text = ''; }
      g.guesses.push({ word: '', marks: '', hint: true });
      this.line('bob', text || 'No hint came to me. That one still cost a try.', { hint: true });
      if (g.guesses.length >= TRIES) { this.line('app', `That hint was the last try. The word was ${g.answer.toUpperCase()}.`); return this.finish('bob'); }
      return;
    }
    const w = word(b.word);
    if (w.length !== 5) throw new Error('Five letters.');
    if (g.guesses.some((x) => x.word === w)) throw new Error(`You tried ${w.toUpperCase()} already.`);
    const marks = markGuess(w, g.answer);
    g.guesses.push({ word: w, marks });
    this.line('you', w.toUpperCase(), { marks });
    if (w === g.answer) { this.line('app', `${g.answer.toUpperCase()} in ${g.guesses.length} ${g.guesses.length === 1 ? 'try' : 'tries'}.`); return this.finish('you'); }
    if (g.guesses.length >= TRIES) { this.line('app', `Six tries gone. The word was ${g.answer.toUpperCase()}.`); return this.finish('bob'); }
    const greens = [...marks].filter((m) => m === 'g').length, yellows = [...marks].filter((m) => m === 'y').length;
    return this.tease(`the guess ${w.toUpperCase()}: ${greens} in the right spot, ${yellows} in the word elsewhere, ${TRIES - g.guesses.length} tries left`);
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
}

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
    if (p === '/api/games/settings') { // Settings, 🧩 Games: only from this replicant matrix
      if (!isLocal) { send(res, 403, { error: 'Games settings can only be changed on this replicant matrix itself.' }); return true; }
      const next = cleanGames({ ...cleanGames(brain.cfg.games), ...b });
      saveSettings(brain.cfg, { games: next });
      send(res, 200, { settings: next }); return true;
    }
    send(res, 404, { error: 'no' });
  } catch (e) { send(res, 409, { error: e.message }); }
  return true;
}
