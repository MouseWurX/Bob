// 🧩 Games (1.5.121): the page where Bob plays small games with you (src/games.js runs them). The app holds the secret
// and checks every move; Bob's quick brain only talks. Nothing loads until you press Start, and the brain is let go
// when a game ends. The page is a view of GET /api/games plus the 'games' events (state, token, announce); the phone
// draws the same view.
// 1.5.206: Easy, Normal and Hard; Today's puzzle; Carry on for a kept game; Ask Bob for new words; and the drop 2
// boards: Four in a row, Hidden fleet, Liar's dice, Trivia night.
import { esc } from './util.js';
import { tip } from './tips.js';
import { PLUS, PLUS_OPTS, plusExtras, twoPlayerHtml, plusPayload, storiesHtml, keepStoryHtml, plusControls, plusFinal, plusClick, plusInput, plusKey, plusReset, plusRefocus, plusFocusIn } from './games-plus.js'; // items 123 to 132

const $ = (id) => document.getElementById(id);
export const SHELVES = { any: 'Any shelf', animals: 'Animals', food: 'Food and drink', house: 'Around the house', outside: 'Out of doors', jobs: 'Jobs people do', moves: 'Things that move' };
const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const LEVEL_TIPS = {
  hangman: 'Easy: nine lives and shorter words. Normal: seven lives, any word. Hard: five lives and long words.',
  ladder: 'Easy: two or three steps. Normal: three to five. Hard: five to seven.',
  letters: 'Easy: seven tries, and any five letters count. Normal: six tries, real words only. Hard: five tries.',
  four: 'How far ahead I look: Easy plays loosely, Hard looks six moves ahead.',
  fleet: 'Easy: I fire anywhere. Normal: when I hit, I work along the ship. Hard: I also hunt in a checkerboard.',
  liar: 'Easy: I bluff a lot and call too soon. Hard: I weigh every bid on the odds.',
  trivia: 'Easy: everyday questions. Normal: a mix. Hard: the harder ones.',
  sudoku: 'Easy: 40 numbers given, and the hints alone can finish it. Normal: 32 given. Hard: 26 given. Every puzzle has one answer.',
  grid: 'Easy: four minutes and I find few words. Normal: three minutes. Hard: two minutes, and I hunt harder.'
};
const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const COLS = 'ABCDEFGHIJ';
export const lives = (left, max = 7) => '●'.repeat(Math.max(0, left)) + '○'.repeat(Math.max(0, max - left));

export function createGames({ api }) {
  const dlg = $('games'), body = $('games-body');
  $('games-close').onclick = () => dlg.close();
  let v = null, msg = '', note = '', live = '', open = false, typed = '', stopping = false;
  const opts = { role: 'guess', shelf: 'any', together: false, bobStarts: false, fourBob: false, liarBob: false, wild: true, withBobs: false, kind20: 'animal', level: {}, ...PLUS_OPTS };
  const startData = (kind, daily = false) => ({ kind, role: opts.role, shelf: opts.shelf, together: opts.together, bobStarts: kind === 'four' ? opts.fourBob : kind === 'liar' ? opts.liarBob : opts.bobStarts, level: opts.level[kind] || 'normal', wild: opts.wild, withBobs: opts.withBobs, daily, ...plusPayload(opts, kind, v?.twoPlayer), ...(plusReset(), {}) });

  async function load() {
    try { v = await api('/api/games'); } catch (e) { msg = e.message; }
    draw();
  }

  // ---------- The lobby ----------
  function scoreHtml() {
    const s = v?.scores || {};
    const rows = Object.entries(v?.games || {}).filter(([id]) => s[id]?.played).map(([id, g]) => { const x = s[id]; return `<tr><td>${g.icon} ${esc(g.name)}</td><td>${x.played}</td><td>${x.won}</td><td>${x.lost}</td><td>${x.drawn}</td><td>${x.best}</td></tr>`; });
    if (!rows.length) return '';
    return `<h3>Scoreboard</h3><table class="gm-scores"><thead><tr><th>Game</th><th>Played</th><th>You won</th><th>I won</th><th>Shared</th><th>Best run ${tip('Your longest run of wins in a row.', 'Best run')}</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  function lobbyHtml() {
    const refusal = v?.refusal ? `<p class="gm-refusal">${esc(v.refusal)}</p>` : '';
    const radio = (name, val, label) => `<button type="button" role="radio" aria-checked="${String(opts[name]) === String(val)}" data-opt="${name}" data-val="${val}">${label}</button>`;
    const extras = {
      twenty: `<div class="gm-choices" role="radiogroup" aria-label="Who thinks of something">${radio('role', 'guess', 'I think, you guess')}${radio('role', 'think', 'You think, I guess')}</div>`,
      hangman: `<label>Shelf <select data-shelf aria-label="Shelf">${Object.entries(SHELVES).map(([id, n]) => `<option value="${id}" ${opts.shelf === id ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`,
      ladder: `<div class="gm-choices" role="radiogroup" aria-label="Who climbs">${radio('together', false, 'You climb, I cheer')}${radio('together', true, 'Climb together, turn about')}</div>`,
      letters: '',
      story: `<div class="gm-choices" role="radiogroup" aria-label="Who opens the story">${radio('bobStarts', true, 'I open')}${radio('bobStarts', false, 'You open')}</div>`,
      four: `<div class="gm-choices" role="radiogroup" aria-label="Who goes first">${radio('fourBob', false, 'You go first')}${radio('fourBob', true, 'I go first')}</div>`,
      fleet: '',
      liar: `<div class="gm-choices" role="radiogroup" aria-label="Who bids first">${radio('liarBob', false, 'You bid first')}${radio('liarBob', true, 'I bid first')}</div> <label><input type="checkbox" data-wild ${opts.wild ? 'checked' : ''}> Ones are wild</label>`,
      trivia: `<label><input type="checkbox" data-withbobs ${opts.withBobs ? 'checked' : ''} ${v?.bobNet ? '' : 'disabled'}> Ask the Bobs on my Bob-Net to play</label> ${tip('Each Bob on your Bob-Net list answers on his own replicant matrix with his own brain. All he is sent is the question and the four choices, over Tailscale to your own Bobs only. A Bob who is busy or not reachable just sits it out.', 'Bobs on my Bob-Net')}${v?.bobNet ? '' : ' <span class="muted">(no Bobs on your Bob-Net list yet)</span>'}`
    };
    Object.assign(extras, plusExtras(opts, radio));
    const levelRow = (id) => (v?.hasLevel || []).includes(id) ? `<div class="gm-choices" role="radiogroup" aria-label="How hard">${Object.entries(v.levels || {}).map(([l, n]) => `<button type="button" role="radio" aria-checked="${(opts.level[id] || 'normal') === l}" data-level="${l}" data-game="${id}">${n}</button>`).join('')} ${tip(LEVEL_TIPS[id] || '', 'How hard')}</div>` : '';
    const dailyRow = (id) => {
      if (!(v?.hasDaily || []).includes(id)) return '';
      const d = v.daily?.[id] || {};
      const state = d.today === 'won' ? 'Solved today.' : d.today === 'lost' ? 'Played today.' : '';
      return `<div class="gm-daily"><button type="button" data-daily="${id}" ${d.today || v?.refusal ? 'disabled' : ''}>📅 Today's puzzle</button> <span class="muted">${state ? `${state} A new one comes tomorrow. ` : 'The same puzzle for everyone with Bob today. '}${d.streak ? `${d.streak} day${d.streak === 1 ? '' : 's'} in a row` : ''}${d.best ? ` (best ${d.best})` : ''}</span></div>`;
    };
    const wordsRow = (id) => {
      if (id === 'hangman') { const n = Object.values(v?.extra?.hangman || {}).reduce((a, b) => a + b, 0); return `<div class="gm-words"><button type="button" data-newwords="hangman" ${opts.shelf === 'any' || v?.refusal ? 'disabled' : ''}>Ask Bob for new words</button> <span class="muted">${opts.shelf === 'any' ? 'Pick a shelf first.' : `For ${esc(SHELVES[opts.shelf])}.`} ${n ? `${n} of his words so far. <button type="button" class="linkish" data-forgetwords="hangman">Forget them</button>` : 'Each one is checked against my dictionary.'}</span></div>`; }
      if (id === 'twenty') { const n = Object.values(v?.extra?.twenty || {}).reduce((a, b) => a + b, 0); return `<div class="gm-words"><label>Kind <select data-kind20 aria-label="Kind of thing">${Object.entries(v?.kinds || {}).map(([k, t]) => `<option value="${k}" ${opts.kind20 === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label> <button type="button" data-newwords="twenty" ${v?.refusal ? 'disabled' : ''}>Ask Bob for new things</button> <span class="muted">${n ? `${n} of his so far. <button type="button" class="linkish" data-forgetwords="twenty">Forget them</button>` : 'Each one is checked against my dictionary.'}</span></div>`; }
      return '';
    };
    return `<section class="gm-lobby">
      ${refusal}
      <p>Pick a game. ${tip('The app runs the game: it picks the secret word, checks every guess, counts the lives and keeps the score. My quick brain only talks, so a game plays fine on a small brain and even in the Gaming session. Nothing loads until you press Start, and the brain is let go when the game ends.', 'How the games work')}</p>
      <ul class="gm-games">${Object.entries(v?.games || {}).map(([id, g]) => `<li><div class="gm-ico" aria-hidden="true">${g.icon}</div><div class="gm-about"><strong>${esc(g.name)}</strong><p class="muted">${esc(g.what)}</p>${extras[id] || ''}${twoPlayerHtml(opts, id, v?.twoPlayer)}${levelRow(id)}${dailyRow(id)}${wordsRow(id)}</div><button type="button" class="yes" data-start="${id}" ${v?.refusal ? 'disabled' : ''}>▶ Start</button></li>`).join('')}</ul>
      ${msg ? `<p class="gm-msg" role="alert">${esc(msg)}</p>` : ''}${note ? `<p class="gm-note" role="status">${esc(note)}</p>` : ''}
      ${scoreHtml()}${storiesHtml(v)}
    </section>`;
  }

  // ---------- A game ----------
  function logHtml(g) {
    return g.log.map((l) => {
      if (l.who === 'app') return `<p class="gm-app muted">${esc(l.text)}</p>`;
      const tag = l.hint ? ' <span class="tag">hint</span>' : l.guess ? ' <span class="tag">a guess</span>' : '';
      return `<div class="gm-line ${l.who}"><span class="gm-who">${l.who === 'you' ? esc(l.player || 'You') : 'Bob'}${tag}</span><p>${esc(l.text)}</p></div>`;
    }).join('');
  }
  function keyboard(g, { used = {}, clickable = true } = {}) {
    return `<div class="gm-keys" role="group" aria-label="Letters">${KEYS.map((row) => `<div class="gm-row">${[...row].map((c) => { const st = used[c] || ''; return `<button type="button" class="gm-key ${st}" data-key="${c}" ${!clickable || st === 'off' ? 'disabled' : ''} aria-label="${c.toUpperCase()}${st === 'hit' ? ', in the word' : st === 'miss' ? ', not in the word' : ''}">${c.toUpperCase()}</button>`; }).join('')}</div>`).join('')}</div>`;
  }
  function controls(g) {
    if (g.status !== 'playing') return '';
    if (PLUS.has(g.kind)) return plusControls(g, v);
    const busy = v.busy;
    const dis = busy ? 'disabled' : '';
    if (g.carry) return `<div class="gm-hand"><p><strong>My move.</strong> <span class="muted">This game was kept from last time.</span></p><div class="row"><button type="button" class="yes" data-carry ${dis}>Carry on</button></div></div>`;
    if (g.kind === 'twenty' && g.role === 'guess') {
      return `<div class="gm-hand"><p><strong>Question ${Math.min(g.asked + 1, g.max)} of ${g.max}.</strong> <span class="muted">Ask anything with a yes-or-no answer, or take a guess.</span></p>
        <div class="row"><input type="text" data-text maxlength="200" aria-label="Your question or guess" placeholder="Is it bigger than a cat?" ${dis}><button type="button" class="yes" data-ask ${dis}>Ask</button><button type="button" data-guess ${dis}>That's my guess</button></div></div>`;
    }
    if (g.kind === 'twenty') {
      if (g.guessing) return `<div class="gm-hand"><p><strong>Is it ${esc(g.pendingGuess)}?</strong></p><div class="row"><button type="button" class="big yes" data-right="1" ${dis}>Right!</button><button type="button" class="big" data-right="0" ${dis}>Wrong</button></div></div>`;
      return `<div class="gm-hand"><p><strong>Question ${g.asked} of ${g.max}.</strong> <span class="muted">Your answer.</span></p><div class="row">${[['yes', 'Yes'], ['no', 'No'], ['sortof', 'Sort of'], ['dunno', "I don't know"]].map(([id, n]) => `<button type="button" class="${id === 'yes' || id === 'no' ? 'big' : ''}" data-answer="${id}" ${dis}>${n}</button>`).join('')}</div></div>`;
    }
    if (g.kind === 'hangman') {
      const used = {}; for (const c of g.guessed) used[c] = g.word ? 'off' : g.masked.includes(c) ? 'hit' : 'miss';
      return `<div class="gm-hand">
        <p class="gm-word" aria-label="The word so far: ${esc(g.masked.replace(/_/g, 'blank'))}">${esc(g.masked.toUpperCase())}</p>
        <p class="muted">Shelf: ${esc(g.shelf)} · <span class="gm-lives" aria-label="${g.lives - g.wrong} of ${g.lives} lives left">${lives(g.lives - g.wrong, g.lives)}</span></p>
        ${keyboard(g, { used, clickable: !busy })}
        <div class="row"><input type="text" data-text maxlength="40" aria-label="Guess the whole word" placeholder="Or guess the whole word…" ${dis}><button type="button" data-word ${dis}>Guess the word</button><button type="button" data-hint ${dis}>Hint (costs a life)</button></div></div>`;
    }
    if (g.kind === 'ladder') {
      return `<div class="gm-hand">
        <ol class="gm-ladder" aria-label="The ladder">${g.steps.map((w, i) => `<li class="${i === g.steps.length - 1 ? 'here' : ''}">${esc(w.toUpperCase())}</li>`).join('')}<li class="goal">${esc(g.end.toUpperCase())} <span class="muted">goal</span></li></ol>
        <p class="muted">${g.steps.length - 1} step${g.steps.length - 1 === 1 ? '' : 's'} so far; shortest ${g.shortest}.${g.together ? ' Turn about: you, then me.' : ''}</p>
        <div class="row"><input type="text" data-text maxlength="4" aria-label="Your next word" placeholder="Next word…" autocapitalize="characters" ${dis}><button type="button" class="yes" data-climb ${dis}>Climb</button><button type="button" data-hint ${dis}>Hint</button><button type="button" data-back ${dis}>Back a rung</button></div></div>`;
    }
    if (g.kind === 'letters') {
      return `<div class="gm-hand">${lettersGrid(g)}
        <div class="row"><input type="text" data-text maxlength="5" aria-label="Your five-letter guess" placeholder="Five letters…" autocapitalize="characters" ${dis}><button type="button" class="yes" data-try ${dis}>Try</button><button type="button" data-hint ${dis}>Hint (costs a try)</button></div>
        ${keyboard(g, { used: letterStates(g), clickable: !busy })}</div>`;
    }
    if (g.kind === 'story') {
      const mine = g.whose === 'you' && !busy;
      return `<div class="gm-hand"><p><strong>${mine ? 'Your line.' : 'My line.'}</strong> <span class="muted">Round ${Math.min(g.round + 1, g.max)} of ${g.max}. Work a die in when you can.</span></p>
        <div class="row"><textarea rows="2" data-text maxlength="600" aria-label="Your line of the story" placeholder="And then…" ${mine ? '' : 'disabled'}></textarea></div>
        <div class="row"><button type="button" class="yes" data-line ${mine ? '' : 'disabled'}>Add my line</button><button type="button" data-wrap ${dis}>Wrap it up</button></div></div>`;
    }
    if (g.kind === 'four') return `<div class="gm-hand">${fourHtml(g, !busy && g.turn === 'you')}<p class="muted">${g.turn === 'you' ? 'Your move: pick a column.' : 'My move.'} Yours are green, mine are orange.</p></div>`;
    if (g.kind === 'fleet') return `<div class="gm-hand">${fleetHtml(g, !busy && g.turn === 'you')}
        <div class="row"><input type="text" data-text maxlength="3" aria-label="Square to fire at, like B7" placeholder="Square, like B7" autocapitalize="characters" ${dis}><button type="button" class="yes" data-fire ${dis}>Fire</button>${g.fired ? '' : `<button type="button" data-shuffle ${dis}>Shuffle my fleet</button>`}</div></div>`;
    if (g.kind === 'liar') return `<div class="gm-hand">${liarHtml(g)}
        <div class="row"><label>How many <select data-count aria-label="How many dice">${Array.from({ length: g.total }, (_, i) => i + 1).map((n) => `<option ${n === nextBid(g).count ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Face <select data-face aria-label="Which face">${[1, 2, 3, 4, 5, 6].filter((f) => !g.wild || f > 1).map((f) => `<option value="${f}" ${f === nextBid(g).face ? 'selected' : ''}>${FACES[f]} ${f}s</option>`).join('')}</select></label>
        <button type="button" class="yes" data-bid ${dis}>Bid</button><button type="button" class="danger" data-liar ${g.bid && g.bidBy === 'bob' && !busy ? '' : 'disabled'}>Liar!</button></div></div>`;
    if (g.kind === 'trivia') {
      const q = g.question;
      if (!q) return '';
      return `<div class="gm-hand"><p><strong>Question ${g.at + 1} of ${g.of}.</strong> <span class="muted">${esc(q.shelf)}</span></p><p class="gm-q">${esc(q.q)}</p>
        <div class="gm-choicegrid" role="group" aria-label="Your answer">${q.choices.map((c, i) => `<button type="button" data-pick="${'ABCD'[i]}" ${dis}><strong>${'ABCD'[i]}</strong> ${esc(c)}</button>`).join('')}</div>
        ${triviaScores(g)}</div>`;
    }
    return '';
  }
  // ---------- Drop 2 boards ----------
  function fourHtml(g, mine) {
    const win = new Set((g.win?.cells || []).map(([r, c]) => `${r},${c}`));
    const head = `<div class="gm-four-cols">${Array.from({ length: g.cols }, (_, c) => `<button type="button" data-col="${c}" aria-label="Drop in column ${c + 1}" ${mine && !g.board[0][c] ? '' : 'disabled'}>${c + 1}</button>`).join('')}</div>`;
    const cells = g.board.map((row, r) => row.map((x, c) => `<span class="gm-cell ${x}${win.has(`${r},${c}`) ? ' win' : ''}${g.last === c && x && (r === 0 || !g.board[r - 1][c]) ? ' last' : ''}" aria-label="Row ${r + 1}, column ${c + 1}: ${x === 'you' ? 'yours' : x === 'bob' ? 'mine' : 'empty'}"></span>`).join('')).join('');
    return `<div class="gm-four" style="--cols:${g.cols}">${head}<div class="gm-four-board" role="img" aria-label="The board">${cells}</div></div>`;
  }
  function seaHtml(size, cell, label, clickable) {
    let h = `<div class="gm-sea" role="grid" aria-label="${esc(label)}" style="--n:${size}"><span></span>${COLS.slice(0, size).split('').map((c) => `<span class="gm-sea-h">${c}</span>`).join('')}`;
    for (let r = 0; r < size; r++) {
      h += `<span class="gm-sea-h">${r + 1}</span>`;
      for (let c = 0; c < size; c++) { const i = r * size + c, x = cell(i); h += clickable && !x.shot ? `<button type="button" class="gm-sq ${x.cls}" data-cell="${i}" aria-label="Fire at ${COLS[c]}${r + 1}"></button>` : `<span class="gm-sq ${x.cls}" aria-label="${COLS[c]}${r + 1}: ${x.say}">${x.mark || ''}</span>`; }
    }
    return h + '</div>';
  }
  function fleetHtml(g, mine) {
    const shipAt = new Map(); for (const s of g.mine.ships) for (const i of s.cells) shipAt.set(i, s);
    const bobShots = new Map(g.mine.shots.map((x) => [x.i, x.hit]));
    const myShots = new Map(g.theirs.shots.map((x) => [x.i, x.hit]));
    const sunk = new Set(g.theirs.sunk), shown = new Set((g.theirs.ships || []).flatMap((s) => s.cells));
    const left = seaHtml(g.size, (i) => { const s = shipAt.get(i), shot = bobShots.has(i); return { shot: true, cls: `${s ? 'ship' : ''}${shot ? (bobShots.get(i) ? ' hit' : ' miss') : ''}${s?.sunk ? ' sunk' : ''}`, mark: shot ? (bobShots.get(i) ? '✕' : '•') : '', say: `${s ? s.name : 'water'}${shot ? (bobShots.get(i) ? ', hit' : ', missed') : ''}` }; }, 'Your sea', false);
    const right = seaHtml(g.size, (i) => { const shot = myShots.has(i); return { shot, cls: `${shot ? (myShots.get(i) ? 'hit' : 'miss') : ''}${sunk.has(i) ? ' sunk' : ''}${shown.has(i) && !shot ? ' ship' : ''}`, mark: shot ? (myShots.get(i) ? '✕' : '•') : '', say: shot ? (myShots.get(i) ? 'hit' : 'missed') : shown.has(i) ? 'a ship' : 'not fired at' }; }, 'My sea', mine);
    const list = (key) => g.fleet.map((s) => `<li class="${s[key] ? '' : 'down'}">${esc(s.name)} (${s.size})${s[key] ? '' : ' <span class="tag">sunk</span>'}</li>`).join('');
    return `<div class="gm-seas"><div><h4>Your sea</h4>${left}<ul class="gm-fleet">${list('yours')}</ul></div><div><h4>My sea</h4>${right}<ul class="gm-fleet">${list('mine')}</ul></div></div>`;
  }
  const nextBid = (g) => { if (!g.bid) return { count: Math.max(1, Math.round(g.total / 3)), face: g.wild ? 2 : 1 }; return g.bid.face < 6 ? { count: g.bid.count, face: g.bid.face + 1 } : { count: Math.min(g.total, g.bid.count + 1), face: g.wild ? 2 : 1 }; };
  function liarHtml(g) {
    const dice = (list) => list.map((d) => `<span class="gm-die" aria-label="${d}">${FACES[d]}</span>`).join('');
    const bid = g.bid ? `<p><strong>${g.bidBy === 'you' ? 'Your' : 'My'} bid: ${g.bid.count} × ${FACES[g.bid.face]} ${g.bid.face}s</strong> <span class="muted">(${g.total} dice on the table${g.wild ? ', ones wild' : ''})</span></p>` : `<p><strong>No bid yet.</strong> <span class="muted">${g.total} dice on the table${g.wild ? ', ones wild' : ''}.</span></p>`;
    return `<div class="gm-cups"><div><span class="muted">Your cup</span><div class="gm-dicerow">${dice(g.yours)}</div></div><div><span class="muted">My cup</span><div class="gm-dicerow">${g.mine ? dice(g.mine) : '<span class="gm-die hidden" aria-hidden="true">?</span>'.repeat(g.mineCount)}</div><span class="muted">${g.mineCount} ${g.mineCount === 1 ? 'die' : 'dice'}</span></div></div>${bid}`;
  }
  function triviaScores(g) { return `<table class="gm-scores"><thead><tr><th>Player</th><th>Score</th></tr></thead><tbody>${g.players.map((p) => `<tr><td>${esc(p.id === 'you' ? 'You' : p.name)}${p.net ? ' <span class="tag">Bob-Net</span>' : ''}</td><td>${p.score}</td></tr>`).join('')}</tbody></table>`; }
  function lettersGrid(g) {
    const rows = [];
    for (let i = 0; i < g.max; i++) {
      const x = g.guesses[i];
      if (x?.hint) rows.push(`<div class="gm-tiles hint" aria-label="A hint, one try">${'<span class="tile h">?</span>'.repeat(5)}</div>`);
      else if (x) rows.push(`<div class="gm-tiles" aria-label="${esc(x.word.toUpperCase())}: ${[...x.marks].map((m) => m === 'g' ? 'right spot' : m === 'y' ? 'in the word' : 'not in it').join(', ')}">${[...x.word].map((c, j) => `<span class="tile ${x.marks[j]}">${c.toUpperCase()}</span>`).join('')}</div>`);
      else rows.push(`<div class="gm-tiles empty" aria-hidden="true">${'<span class="tile"></span>'.repeat(5)}</div>`);
    }
    return `<div class="gm-grid">${rows.join('')}</div>`;
  }
  function letterStates(g) {
    const st = {};
    for (const x of g.guesses) if (x.word) [...x.word].forEach((c, i) => { const m = x.marks[i]; st[c] = m === 'g' ? 'hit' : m === 'y' && st[c] !== 'hit' ? 'near' : st[c] || 'miss'; });
    return st;
  }
  function diceHtml(g) {
    return `<ul class="gm-dice" aria-label="The dice">${g.dice.map((d, i) => `<li class="${g.used[i] ? 'used' : ''}" title="${esc(d[1])}"><span aria-hidden="true">${d[0]}</span> ${esc(d[1])}${g.used[i] ? ' <span class="tag">in</span>' : ''}</li>`).join('')}</ul>`;
  }
  function gameHtml(g) {
    const over = g.status !== 'playing';
    const result = over ? (g.won === 'you' ? '🏆 Your point.' : g.won === 'bob' ? 'My point.' : g.won === 'both' ? 'A shared one.' : '') : '';
    return `<section class="gm-game">
      <div class="gm-top"><strong>${g.icon} ${esc(g.name)}</strong> ${result ? `<span class="tag">${result}</span>` : ''}<span class="gm-fill"></span><button type="button" data-end ${stopping ? 'disabled' : ''}>${over ? 'Back to the games' : '🏁 Stop'}</button></div>
      ${stopping ? '<div class="gm-hand gm-stop" role="group" aria-label="Stop this game?"><p><strong>Stop this game?</strong> It counts as unfinished.</p><div class="row"><button type="button" class="danger" data-stopyes>Stop the game</button><button type="button" data-stopno>Keep playing</button></div></div>' : ''}
      ${g.kind === 'story' ? diceHtml(g) : ''}
      ${over && g.kind === 'four' ? fourHtml(g, false) : ''}${over && g.kind === 'fleet' ? fleetHtml(g, false) : ''}${over && g.kind === 'liar' ? liarHtml(g) : ''}${over && g.kind === 'trivia' ? triviaScores(g) : ''}${PLUS.has(g.kind) ? plusFinal(g) : ''}
      ${g.daily ? '<p class="muted">📅 Today\'s puzzle</p>' : g.level && g.level !== 'normal' ? `<p class="muted">${esc(v.levels?.[g.level] || '')}</p>` : ''}
      <div class="gm-log" id="gm-log" aria-live="polite">${logHtml(g)}<div class="gm-live" id="gm-live" hidden></div></div>
      ${v.busy ? '<p class="gm-busy muted" role="status">Bob is thinking…</p>' : ''}
      ${g.two && !over ? `<p class="gm-turn"><strong>${esc(g.two[g.twoTurn] || '')}'s turn.</strong> <span class="muted">Pass the screen when you've moved.</span></p>` : ''}
      ${controls(g)}${keepStoryHtml(g)}
      ${msg ? `<p class="gm-msg" role="alert">${esc(msg)}</p>` : ''}
    </section>`;
  }

  function draw() {
    if (!open) return;
    const g = v?.game;
    const had = body.querySelector('[data-text]');
    if (had) typed = had.value;
    body.innerHTML = g ? gameHtml(g) : lobbyHtml();
    const log = $('gm-log'); if (log) log.scrollTop = log.scrollHeight;
    if (live) { const l = $('gm-live'); if (l) { l.hidden = false; l.innerHTML = `<span class="gm-who">Bob</span><p>${esc(live)}</p>`; } }
    const inp = body.querySelector('[data-text]');
    if (inp && !inp.disabled) { if (typed && g && !msg) inp.value = typed; inp.focus(); }
  }
  function onEvent(ev) {
    if (ev.ev === 'state') { v = { ...v, ...ev }; live = ''; if (!ev.game || ev.game.status !== 'playing') stopping = false; if (!ev.busy) msg = msg && /still talking/.test(msg) ? '' : msg; draw(); return; }
    if (ev.ev === 'token') { live += ev.text; const l = $('gm-live'); if (l) { l.hidden = false; l.innerHTML = `<span class="gm-who">Bob</span><p>${esc(live)}</p>`; const log = $('gm-log'); if (log) log.scrollTop = log.scrollHeight; } return; }
    if (ev.ev === 'announce') { const l = $('gm-live'); if (l) { l.hidden = false; l.innerHTML = `<p class="muted">${esc(ev.text)}</p>`; } }
  }
  window.addEventListener('bob-games', (e) => onEvent(e.detail));

  async function call(url, data) { typed = ''; stopping = false; note = ''; try { v = { ...v, ...(await api(url, data)) }; msg = ''; } catch (e) { msg = e.message; } draw(); }
  const text = () => body.querySelector('[data-text]')?.value?.trim() || '';
  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const pm = plusClick(t, { game: v?.game, opts, text });
    if (pm === 'drawn') { draw(); return; }
    if (pm) return call(pm.url || '/api/games/act', pm.data);
    if (t.dataset.opt) { const val = t.dataset.val; opts[t.dataset.opt] = val === 'true' ? true : val === 'false' ? false : val; draw(); return; }
    if (t.dataset.start) { t.disabled = true; return call('/api/games/start', startData(t.dataset.start)); }
    if (t.dataset.daily) { t.disabled = true; return call('/api/games/start', startData(t.dataset.daily, true)); }
    if (t.dataset.level) { opts.level[t.dataset.game] = t.dataset.level; draw(); return; }
    if (t.dataset.newwords) { t.disabled = true; t.textContent = 'Bob is thinking…'; return words(t.dataset.newwords); }
    if (t.dataset.forgetwords) return call('/api/games/words/forget', { what: t.dataset.forgetwords });
    if ('carry' in t.dataset) return call('/api/games/act', { carry: true });
    if (t.dataset.col) return call('/api/games/act', { col: Number(t.dataset.col) });
    if (t.dataset.cell) return call('/api/games/act', { cell: Number(t.dataset.cell) });
    if ('fire' in t.dataset) { const sq = text(); if (!sq) return; return call('/api/games/act', { shoot: sq }); }
    if ('shuffle' in t.dataset) return call('/api/games/act', { shuffle: true });
    if ('bid' in t.dataset) return call('/api/games/act', { count: Number(body.querySelector('[data-count]').value), face: Number(body.querySelector('[data-face]').value) });
    if ('liar' in t.dataset) return call('/api/games/act', { liar: true });
    if (t.dataset.pick) return call('/api/games/act', { answer: t.dataset.pick });
    if ('end' in t.dataset) {
      if (v.game.status === 'playing') { stopping = true; draw(); body.querySelector('[data-stopno]')?.focus(); return; }
      return call('/api/games/close', {});
    }
    if ('stopyes' in t.dataset) { stopping = false; return call('/api/games/end', {}); }
    if ('stopno' in t.dataset) { stopping = false; draw(); return; }
    if ('ask' in t.dataset) { const q = text(); if (!q) return; return call('/api/games/act', { ask: q }); }
    if ('guess' in t.dataset) { const q = text(); if (!q) return; return call('/api/games/act', { guess: q }); }
    if (t.dataset.answer) return call('/api/games/act', { answer: t.dataset.answer });
    if (t.dataset.right) return call('/api/games/act', { right: t.dataset.right === '1' });
    if (t.dataset.key) {
      const inp = body.querySelector('[data-text]');
      if (v.game.kind === 'hangman') return call('/api/games/act', { letter: t.dataset.key });
      if (inp) { inp.value = (inp.value + t.dataset.key).slice(0, 5); inp.focus(); }
      return;
    }
    if ('word' in t.dataset) { const w = text(); if (!w) return; return call('/api/games/act', { word: w }); }
    if ('hint' in t.dataset) return call('/api/games/act', { hint: true });
    if ('climb' in t.dataset || 'try' in t.dataset) { const w = text(); if (!w) return; return call('/api/games/act', { word: w }); }
    if ('back' in t.dataset) return call('/api/games/act', { back: true });
    if ('line' in t.dataset) { const l = text(); if (!l) return; return call('/api/games/act', { line: l }); }
    if ('wrap' in t.dataset) return call('/api/games/act', { end: true });
  });
  body.addEventListener('change', (e) => {
    const d = e.target.dataset;
    if ('shelf' in d) { opts.shelf = e.target.value; draw(); }
    if ('kind20' in d) opts.kind20 = e.target.value;
    if ('wild' in d) opts.wild = e.target.checked;
    if ('withbobs' in d) opts.withBobs = e.target.checked;
    if ('gmTwo' in d) { opts.two = e.target.checked; draw(); }
    if (d.gmOpt || 'gmPromo' in d) plusInput(e, { game: v?.game, opts });
  });
  // Typing: a crossword letter goes straight in (then on to the next square); names are remembered as you type.
  body.addEventListener('focusin', plusFocusIn);
  let later = null;
  body.addEventListener('input', (e) => {
    const r = plusInput(e, { game: v?.game, opts });
    if (!r) return;
    clearTimeout(later);
    later = setTimeout(async () => { await call('/api/games/act', { letters: r.letters }); plusRefocus(v?.game); }, 700);
  });
  // Ask Bob for new words: he suggests, the dictionary decides, and the page says what made it in.
  async function words(what) {
    const key = what === 'hangman' ? opts.shelf : opts.kind20;
    try { const r = await api('/api/games/words', { what, key }); v = { ...v, ...r }; msg = ''; note = r.added.length ? `Added ${r.added.length}: ${r.added.join(', ')}.` : 'None of his words were new and real, so nothing was added. Try again.'; } catch (e) { msg = e.message; note = ''; }
    draw();
  }
  body.addEventListener('keydown', (e) => {
    const k = plusKey(e, { game: v?.game });
    if (k) { e.preventDefault(); call('/api/games/act', k); return; }
    if (e.key === 'Enter' && e.target.matches('[data-gm-ask]')) { e.preventDefault(); body.querySelector('[data-gm-askgo]')?.click(); return; }
    if (e.key !== 'Enter' || !e.target.matches('[data-text]')) return;
    if (e.target.tagName === 'TEXTAREA' && !e.ctrlKey) return;
    e.preventDefault();
    (body.querySelector('[data-ask],[data-climb],[data-try],[data-word],[data-line],[data-fire],[data-gm-move],[data-gm-gword],[data-gm-ranswer]'))?.click();
  });
  dlg.addEventListener('close', () => { open = false; });

  return {
    async open() { open = true; dlg.showModal(); body.innerHTML = '<p class="muted">Getting the games out…</p>'; await load(); },
    isOpen: () => open
  };
}

// Settings, 🧩 Games. Neither is "on": both just have a default.
export function gamesSettingsHtml(g = {}) {
  const opt = (name, val, cur, label) => `<button type="button" role="radio" aria-checked="${cur === val}" data-gm-set="${name}" data-val="${val}">${label}</button>`;
  const brain = g.brain || 'quick', talk = g.talk || 'every';
  return `<div class="games-settings">
    <div><strong>Which brain plays games</strong> ${tip('Quick brain: my small brain, the one that answers quick messages; it loads in a few seconds and a game needs nothing bigger. In the Gaming session it\'s the Gaming brain on the processor, so a game never touches the graphics card. Main Brain: the brain the chat uses, for wittier lines at the cost of a longer load. Either way it loads when a game starts and is let go when the game ends.', 'Which brain plays games')}<div class="ttabs" role="radiogroup" aria-label="Which brain plays games">${opt('brain', 'quick', brain, 'Quick brain')}${opt('brain', 'main', brain, 'Main Brain')}</div></div>
    <div><strong>How often Bob chips in</strong> ${tip('In Hangman, Word ladder, Five letters, Four in a row, Hidden fleet, Liar\'s dice and Trivia night the app runs the game and I comment. After every move: a line after each guess. Now and then: about every other move. Only at the end: the app keeps quiet until the game is over, which is quickest on a slow replicant matrix. Twenty questions and Story dice are all talk, so this doesn\'t change them.', 'How often Bob chips in')}<div class="ttabs" role="radiogroup" aria-label="How often Bob chips in">${opt('talk', 'every', talk, 'After every move')}${opt('talk', 'some', talk, 'Now and then')}${opt('talk', 'end', talk, 'Only at the end')}</div></div>
    <div><strong>Keep an unfinished game</strong> ${tip('When Bob closes in the middle of a game, the game is saved in my data folder and comes back when you open 🧩 Games again. Off: closing Bob ends the game.', 'Keep an unfinished game')}<div class="ttabs" role="radiogroup" aria-label="Keep an unfinished game">${opt('keep', 'false', String(g.keep === true), 'Off')}${opt('keep', 'true', String(g.keep === true), 'On')}</div></div>
    <div><strong>Kid mode</strong> ${tip('For playing with young children. Easier words in Hangman, Five letters and Twenty questions, the gentlest levels in Chess, Noughts and crosses, Code breaker and the Letter grid, and I only ever tease kindly.', 'Kid mode')}<div class="ttabs" role="radiogroup" aria-label="Kid mode">${opt('kid', 'false', String(g.kid === true), 'Off')}${opt('kid', 'true', String(g.kid === true), 'On')}</div></div>
    <p class="muted">The games themselves live on the 🧩 Games page in the menu. Nothing runs until you press Start there.</p>
  </div>`;
}
export function mountGamesSettings(box, { api, settings }) {
  if (!box) return;
  box.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-gm-set]'); if (!t) return;
    try { const r = await api('/api/games/settings', { [t.dataset.gmSet]: t.dataset.val }); settings.games = r.settings; box.innerHTML = gamesSettingsHtml(r.settings); } catch {}
  });
}
