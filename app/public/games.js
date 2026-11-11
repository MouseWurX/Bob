// 🧩 Games (1.5.121): the page where Bob plays small games with you (src/games.js runs them). The app holds the secret
// and checks every move; Bob's quick brain only talks. Nothing loads until you press Start, and the brain is let go
// when a game ends. The page is a view of GET /api/games plus the 'games' events (state, token, announce); the phone
// draws the same view.
import { esc } from './util.js';
import { tip } from './tips.js';

const $ = (id) => document.getElementById(id);
export const SHELVES = { any: 'Any shelf', animals: 'Animals', food: 'Food and drink', house: 'Around the house', outside: 'Out of doors', jobs: 'Jobs people do', moves: 'Things that move' };
const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
export const lives = (left, max = 7) => '●'.repeat(Math.max(0, left)) + '○'.repeat(Math.max(0, max - left));

export function createGames({ api }) {
  const dlg = $('games'), body = $('games-body');
  $('games-close').onclick = () => dlg.close();
  let v = null, msg = '', live = '', open = false, typed = '', stopping = false;
  const opts = { role: 'guess', shelf: 'any', together: false, bobStarts: false };

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
      story: `<div class="gm-choices" role="radiogroup" aria-label="Who opens the story">${radio('bobStarts', true, 'I open')}${radio('bobStarts', false, 'You open')}</div>`
    };
    return `<section class="gm-lobby">
      ${refusal}
      <p>Pick a game. ${tip('The app runs the game: it picks the secret word, checks every guess, counts the lives and keeps the score. My quick brain only talks, so a game plays fine on a small brain and even in the Gaming session. Nothing loads until you press Start, and the brain is let go when the game ends.', 'How the games work')}</p>
      <ul class="gm-games">${Object.entries(v?.games || {}).map(([id, g]) => `<li><div class="gm-ico" aria-hidden="true">${g.icon}</div><div class="gm-about"><strong>${esc(g.name)}</strong><p class="muted">${esc(g.what)}</p>${extras[id] || ''}</div><button type="button" class="yes" data-start="${id}" ${v?.refusal ? 'disabled' : ''}>▶ Start</button></li>`).join('')}</ul>
      ${msg ? `<p class="gm-msg" role="alert">${esc(msg)}</p>` : ''}
      ${scoreHtml()}
    </section>`;
  }

  // ---------- A game ----------
  function logHtml(g) {
    return g.log.map((l) => {
      if (l.who === 'app') return `<p class="gm-app muted">${esc(l.text)}</p>`;
      const tag = l.hint ? ' <span class="tag">hint</span>' : l.guess ? ' <span class="tag">a guess</span>' : '';
      return `<div class="gm-line ${l.who}"><span class="gm-who">${l.who === 'you' ? 'You' : 'Bob'}${tag}</span><p>${esc(l.text)}</p></div>`;
    }).join('');
  }
  function keyboard(g, { used = {}, clickable = true } = {}) {
    return `<div class="gm-keys" role="group" aria-label="Letters">${KEYS.map((row) => `<div class="gm-row">${[...row].map((c) => { const st = used[c] || ''; return `<button type="button" class="gm-key ${st}" data-key="${c}" ${!clickable || st === 'off' ? 'disabled' : ''} aria-label="${c.toUpperCase()}${st === 'hit' ? ', in the word' : st === 'miss' ? ', not in the word' : ''}">${c.toUpperCase()}</button>`; }).join('')}</div>`).join('')}</div>`;
  }
  function controls(g) {
    if (g.status !== 'playing') return '';
    const busy = v.busy;
    const dis = busy ? 'disabled' : '';
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
    return '';
  }
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
      <div class="gm-log" id="gm-log" aria-live="polite">${logHtml(g)}<div class="gm-live" id="gm-live" hidden></div></div>
      ${v.busy ? '<p class="gm-busy muted" role="status">Bob is thinking…</p>' : ''}
      ${controls(g)}
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

  async function call(url, data) { typed = ''; stopping = false; try { v = { ...v, ...(await api(url, data)) }; msg = ''; } catch (e) { msg = e.message; } draw(); }
  const text = () => body.querySelector('[data-text]')?.value?.trim() || '';
  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.opt) { const val = t.dataset.val; opts[t.dataset.opt] = val === 'true' ? true : val === 'false' ? false : val; draw(); return; }
    if (t.dataset.start) { t.disabled = true; return call('/api/games/start', { kind: t.dataset.start, role: opts.role, shelf: opts.shelf, together: opts.together, bobStarts: opts.bobStarts }); }
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
  body.addEventListener('change', (e) => { if ('shelf' in e.target.dataset) opts.shelf = e.target.value; });
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('[data-text]')) return;
    if (e.target.tagName === 'TEXTAREA' && !e.ctrlKey) return;
    e.preventDefault();
    (body.querySelector('[data-ask],[data-climb],[data-try],[data-word],[data-line]'))?.click();
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
    <div><strong>How often Bob chips in</strong> ${tip('In Hangman, Word ladder and Five letters the app runs the game and I comment. After every move: a line after each guess. Now and then: about every other move. Only at the end: the app keeps quiet until the game is over, which is quickest on a slow replicant matrix. Twenty questions and Story dice are all talk, so this doesn\'t change them.', 'How often Bob chips in')}<div class="ttabs" role="radiogroup" aria-label="How often Bob chips in">${opt('talk', 'every', talk, 'After every move')}${opt('talk', 'some', talk, 'Now and then')}${opt('talk', 'end', talk, 'Only at the end')}</div></div>
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
