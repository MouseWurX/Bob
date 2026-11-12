// 🧩 Games, the second set on the desktop page (items 123 to 132): the boards for Chess, Sudoku, the Mini crossword,
// Letter grid, Noughts and crosses, Code breaker and Riddles; the lobby choices for each; Two players on one screen;
// and Keep this story. src/games-plus.js runs the games; public/games.js calls in here for these kinds.
import { esc } from './util.js';
import { tip } from './tips.js';

export const PLUS = new Set(['chess', 'sudoku', 'crossword', 'grid', 'noughts', 'codes', 'riddles']);
// The filled shapes for both sides, coloured by CSS (.w white, .b black), so they read on any theme.
const PIECES = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟\uFE0E', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟\uFE0E' };
const PIECE_NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const FILES = 'abcdefgh';
const SQUARES = ['top left', 'top middle', 'top right', 'middle left', 'centre', 'middle right', 'bottom left', 'bottom middle', 'bottom right'];
const ui = { pick: '', promo: 'q', cell: -1, code: [] }; // what you've tapped so far on a board

// ---------- The lobby ----------
export const PLUS_OPTS = { strength: 2, colour: 'w', bobPlays: true, nLevel: 'easy', codeRole: 'break', two: false, p1: '', p2: '' };
export function plusExtras(opts, radio) {
  const sel = (name, pairs, label) => `<label>${label} <select data-gm-opt="${name}" aria-label="${label}">${pairs.map(([v, n]) => `<option value="${v}" ${String(opts[name]) === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  return {
    chess: `${sel('strength', [[1, 'Beginner'], [2, 'Casual'], [3, 'Club'], [4, 'Strong'], [5, 'Strongest']], 'Strength')} <div class="gm-choices" role="radiogroup" aria-label="Your colour">${radio('colour', 'w', 'White')}${radio('colour', 'b', 'Black')}${radio('colour', 'random', 'Either')}</div>`,
    sudoku: '',
    crossword: '',
    grid: `<div class="gm-choices" role="radiogroup" aria-label="Does Bob hunt too">${radio('bobPlays', true, 'Bob hunts too')}${radio('bobPlays', false, 'Just me')}</div>`,
    noughts: `${sel('nLevel', [['kid', 'Little one'], ['easy', 'Easy'], ['perfect', "Can't be beaten"]], 'Bob plays')} <div class="gm-choices" role="radiogroup" aria-label="Who starts">${radio('bobStarts', false, 'You start')}${radio('bobStarts', true, 'Bob starts')}</div>`,
    codes: `<div class="gm-choices" role="radiogroup" aria-label="Who breaks the code">${radio('codeRole', 'break', 'You break my code')}${radio('codeRole', 'make', 'I break yours')}</div>`,
    riddles: ''
  };
}
// Two players on one screen: a switch and two names, shown under the games that allow it.
export function twoPlayerHtml(opts, kind, two = []) {
  if (!two.includes(kind)) return '';
  return `<div class="gm-two"><label><input type="checkbox" data-gm-two ${opts.two ? 'checked' : ''}> Two players, one screen ${tip('Two of you take turns on this screen, passing it after each move. Bob keeps score and cheers but doesn\'t play.', 'Two players')}</label>
    ${opts.two ? `<label>First <input type="text" data-gm-name="p1" maxlength="24" value="${esc(opts.p1)}" placeholder="Player 1" aria-label="First player's name"></label><label>Second <input type="text" data-gm-name="p2" maxlength="24" value="${esc(opts.p2)}" placeholder="Player 2" aria-label="Second player's name"></label>` : ''}</div>`;
}
export function plusPayload(opts, kind, two = []) {
  const out = { strength: Number(opts.strength), colour: opts.colour, bobPlays: opts.bobPlays };
  if (kind === 'noughts') out.level = opts.nLevel;
  if (kind === 'codes') out.role = opts.codeRole;
  if (opts.two && two.includes(kind)) out.players = [opts.p1, opts.p2];
  return out;
}
export function storiesHtml(v) {
  const list = v?.stories || [];
  if (!list.length) return '';
  return `<h3>Kept stories</h3><ul class="gm-stories">${list.map((s) => `<li><a href="/api/games/story?file=${encodeURIComponent(s.file)}" target="_blank" rel="noopener">${esc(s.file.replace(/-[a-z0-9]+\.html$/, '').replace(/-/g, ' '))}</a></li>`).join('')}</ul>`;
}
export function keepStoryHtml(g) {
  if (g.kind !== 'story' || g.status !== 'over' || !g.lines?.length) return '';
  if (g.kept) return `<p class="gm-kept">📜 Kept. <a href="/api/games/story?file=${encodeURIComponent(g.kept)}" target="_blank" rel="noopener">Open the page</a> to read it, save it or print it.</p>`;
  return `<div class="row"><button type="button" class="yes" data-gm-keep>📜 Keep this story</button> ${tip('Makes the story a page of its own, with the title, the dice and every line, ready to save or print. It\'s kept in the games folder and listed under Kept stories.', 'Keep this story')}</div>`;
}

// ---------- The boards ----------
export function plusControls(g, v) {
  const busy = v.busy, dis = busy ? 'disabled' : '';
  if (g.kind === 'chess') return chessHtml(g, busy);
  if (g.kind === 'sudoku') return sudokuHtml(g, dis);
  if (g.kind === 'crossword') return crosswordHtml(g, dis);
  if (g.kind === 'grid') return gridHtml(g, dis);
  if (g.kind === 'noughts') return noughtsHtml(g, dis);
  if (g.kind === 'codes') return codesHtml(g, dis);
  if (g.kind === 'riddles') return riddlesHtml(g, dis);
  return '';
}
// Shown even when the game is over, so you can look back at the final position.
export function plusFinal(g) {
  if (g.status === 'playing') return '';
  if (g.kind === 'chess') return chessBoard(g, false);
  if (g.kind === 'sudoku') return sudokuBoard(g, false);
  if (g.kind === 'crossword') return crosswordBoard(g, false);
  if (g.kind === 'grid') return `${gridBoard(g)}${g.all ? `<p class="muted">Every word: ${g.all.map((w) => `${(g.found || []).includes(w) ? '<strong>' : ''}${esc(w.toUpperCase())}${(g.found || []).includes(w) ? '</strong>' : ''}`).join(', ')}</p>` : ''}`;
  if (g.kind === 'noughts') return noughtsBoard(g, false);
  if (g.kind === 'codes') return codeRows(g);
  if (g.kind === 'riddles') return riddleResults(g);
  return '';
}

function chessBoard(g, live) {
  const flip = g.youAre === 'b';
  const from = new Set((g.legal || []).map((m) => m.from)), to = new Set((g.legal || []).filter((m) => m.from === ui.pick).map((m) => m.to));
  const rows = [];
  for (let k = 0; k < 8; k++) {
    const r = flip ? k : 7 - k, cells = [];
    for (let j = 0; j < 8; j++) {
      const f = flip ? 7 - j : j, i = r * 8 + f, name = FILES[f] + (r + 1), p = g.board[i];
      const cls = [(f + r) % 2 ? 'light' : 'dark', p ? (p === p.toUpperCase() ? 'w' : 'b') : '', ui.pick === name ? 'pick' : '', to.has(name) ? 'to' : '', g.last && (g.last.from === name || g.last.to === name) ? 'last' : ''].filter(Boolean).join(' ');
      const can = live && (from.has(name) || to.has(name));
      cells.push(`<button type="button" class="gm-sq ${cls}" data-gm-sq="${name}" ${can ? '' : 'tabindex="-1"'} aria-label="${name}${p ? `, ${p === p.toUpperCase() ? 'white' : 'black'} ${PIECE_NAMES[p.toLowerCase()]}` : ''}">${p ? PIECES[p] : ''}</button>`);
    }
    rows.push(cells.join(''));
  }
  return `<div class="gm-chess" role="grid" aria-label="The chess board, ${flip ? 'black' : 'white'} at the bottom">${rows.join('')}</div>`;
}
function chessHtml(g, busy) {
  const yours = g.turn === g.youAre && !busy;
  const pairs = []; for (let k = 0; k < g.moves.length; k += 2) pairs.push(`${k / 2 + 1}. ${g.moves[k]}${g.moves[k + 1] ? ' ' + g.moves[k + 1] : ''}`);
  return `<div class="gm-hand">${chessBoard(g, yours)}
    <p><strong>${yours ? 'Your move.' : busy ? 'Bob is talking…' : "Bob's move."}</strong>${g.check ? ' <span class="tag">check</span>' : ''} <span class="muted">${esc(g.strengthName)} · white ${g.material.white}, black ${g.material.black}</span></p>
    ${pairs.length ? `<p class="gm-moves muted">${esc(pairs.join('  '))}</p>` : ''}
    <div class="row"><input type="text" data-text maxlength="10" aria-label="Your move, like e4 or Nf3" placeholder="e4, Nf3, O-O…" ${yours ? '' : 'disabled'}><button type="button" class="yes" data-gm-move ${yours ? '' : 'disabled'}>Move</button>
      <label>Pawn becomes <select data-gm-promo aria-label="A pawn reaching the end becomes">${['q', 'r', 'b', 'n'].map((p) => `<option value="${p}" ${ui.promo === p ? 'selected' : ''}>${PIECE_NAMES[p]}</option>`).join('')}</select></label></div>
    <div class="row"><button type="button" data-gm-undo ${yours && g.moves.length >= 2 ? '' : 'disabled'}>Take back</button><button type="button" data-gm-draw ${busy ? 'disabled' : ''}>Offer a draw</button><button type="button" data-gm-resign ${busy ? 'disabled' : ''}>Resign</button>
      <input type="text" data-gm-ask maxlength="200" aria-label="Ask Bob about the game" placeholder="Ask Bob about the game…" ${busy ? 'disabled' : ''}><button type="button" data-gm-askgo ${busy ? 'disabled' : ''}>Ask</button></div></div>`;
}

function sudokuBoard(g, live) {
  const ans = g.answer;
  return `<div class="gm-sudoku" role="grid" aria-label="The Sudoku grid">${g.grid.map((n, i) => {
    const r = Math.floor(i / 9), c = i % 9, show = n || (ans ? ans[i] : 0);
    const cls = ['gm-cell', g.given[i] ? 'given' : '', i === ui.cell && live ? 'sel' : '', i === g.focus ? 'focus' : '', c % 3 === 2 && c < 8 ? 'rb' : '', r % 3 === 2 && r < 8 ? 'bb' : '', !n && ans ? 'shown' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-gm-cell="${i}" ${live && !g.given[i] ? '' : 'tabindex="-1"'} aria-label="Row ${r + 1}, column ${c + 1}: ${show || 'empty'}${g.given[i] ? ', given' : ''}">${show || ''}</button>`;
  }).join('')}</div>`;
}
function sudokuHtml(g, dis) {
  return `<div class="gm-hand">${sudokuBoard(g, true)}
    <p class="muted">${esc(g.levelName)} · ${g.mistakes} slip${g.mistakes === 1 ? '' : 's'} · ${g.hints} hint${g.hints === 1 ? '' : 's'}. Pick a square, then a number (or type it).</p>
    <div class="row gm-pad" role="group" aria-label="Numbers">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-gm-num="${n}" ${dis}>${n}</button>`).join('')}<button type="button" data-gm-num="0" ${dis}>Clear</button></div>
    <div class="row"><button type="button" data-hint ${dis}>Hint: the next step and why</button><button type="button" data-gm-hintfill ${dis}>Hint and fill it in</button></div></div>`;
}

function crosswordBoard(g, live) {
  const show = g.answer || g.letters, nums = {};
  for (const c of g.clues) nums[c.cells[0]] = c.num;
  return `<div class="gm-cross" role="grid" aria-label="The crossword">${show.map((ch, i) => {
    if (g.blocks.includes(i)) return '<span class="gm-xblock" aria-hidden="true"></span>';
    const wrong = (g.wrong || []).includes(i) ? ' wrong' : '';
    return `<label class="gm-xcell${wrong}">${nums[i] ? `<span class="n">${nums[i]}</span>` : ''}<input type="text" maxlength="1" data-gm-x="${i}" value="${esc((ch || '').toUpperCase())}" aria-label="Square ${i + 1}${wrong ? ', marked wrong' : ''}" autocapitalize="characters" ${live ? '' : 'disabled'}></label>`;
  }).join('')}</div>
  <div class="gm-clues">${['across', 'down'].map((d) => `<div><strong>${d === 'across' ? 'Across' : 'Down'}</strong><ol>${g.clues.filter((c) => c.dir === d).map((c) => `<li value="${c.num}">${esc(c.clue)}</li>`).join('')}</ol></div>`).join('')}</div>`;
}
function crosswordHtml(g, dis) {
  return `<div class="gm-hand">${crosswordBoard(g, !dis)}
    <div class="row"><button type="button" data-gm-check ${dis}>Check my letters</button><button type="button" data-gm-reveal ${dis}>Show the letter in the square I'm on</button></div></div>`;
}

function gridBoard(g) { return `<div class="gm-lgrid" aria-label="The letters">${g.grid.map((c) => `<span>${esc(c === 'qu' ? 'Qu' : c.toUpperCase())}</span>`).join('')}</div>`; }
function gridHtml(g, dis) {
  return `<div class="gm-hand">${gridBoard(g)}
    <p><strong data-gm-clock="${g.ends}" role="timer" aria-live="off">${clock(g.ends)}</strong> <span class="muted">· ${g.found.length} found${g.bobPlays ? ' · Bob is hunting too' : ''}</span></p>
    <div class="row"><input type="text" data-text maxlength="16" aria-label="A word you found" placeholder="A word…" ${dis}><button type="button" class="yes" data-gm-gword ${dis}>Add</button><button type="button" data-gm-gdone ${dis}>I'm done</button></div>
    ${g.found.length ? `<p class="muted">${g.found.map((w) => esc(w.toUpperCase())).join(', ')}</p>` : ''}</div>`;
}
const clock = (ends) => { const s = Math.max(0, Math.round((ends - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
if (typeof document !== 'undefined') setInterval(() => { for (const el of document.querySelectorAll('[data-gm-clock]')) el.textContent = clock(Number(el.dataset.gmClock)); }, 1000);

function noughtsBoard(g, live) {
  return `<div class="gm-noughts" role="grid" aria-label="Noughts and crosses">${g.board.map((m, i) => `<button type="button" class="${g.line.includes(i) ? 'win' : ''}" data-gm-n="${i}" ${live && !m ? '' : 'disabled'} aria-label="${SQUARES[i]}: ${m || 'empty'}">${m === 'X' ? '✕' : m === 'O' ? '◯' : ''}</button>`).join('')}</div>`;
}
function noughtsHtml(g, dis) {
  const who = g.two ? `${esc(g.two[g.mark === 'X' ? 0 : 1])} (${g.mark})` : g.mark === 'X' ? 'You (X)' : 'Bob (O)';
  return `<div class="gm-hand">${noughtsBoard(g, !dis && (g.two || g.mark === 'X'))}<p><strong>${who} to go.</strong> <span class="muted">${esc(g.levelName)}</span></p></div>`;
}

const dot = (g, c) => g.colours.find((x) => x[0] === c)?.[2] || '⚪';
const pegs = (t) => `<span class="gm-pegs" aria-label="${t.black} black, ${t.white} white">${'⚫'.repeat(t.black)}${'⚪'.repeat(t.white)}${'·'.repeat(4 - t.black - t.white)}</span>`;
function codeRows(g) {
  return `<ol class="gm-coderows">${g.tries.map((t) => `<li><span aria-label="${t.guess}">${[...t.guess].map((c) => dot(g, c)).join('')}</span> ${pegs(t)}</li>`).join('')}</ol>${g.code ? `<p class="muted">The code: ${[...g.code].map((c) => dot(g, c)).join('')}</p>` : ''}`;
}
function codesHtml(g, dis) {
  const picker = `<div class="row gm-colours" role="group" aria-label="Colours">${g.colours.map(([id, name, d]) => `<button type="button" data-gm-colour="${id}" aria-label="${name}" ${dis}>${d}</button>`).join('')}<button type="button" data-gm-cclear ${dis}>Clear</button></div>
    <p class="gm-coderow" aria-label="Your row so far">${ui.code.map((c) => dot(g, c)).join('')}${'◌'.repeat(4 - ui.code.length)}</p>`;
  if (g.role === 'make') {
    if (!g.codeSet) return `<div class="gm-hand"><p><strong>Pick your secret code.</strong> <span class="muted">${g.repeats ? 'A colour can come twice.' : 'Each colour once.'}</span></p>${picker}<div class="row"><button type="button" class="yes" data-gm-ctry ${dis}>Set my code</button></div></div>`;
    return `<div class="gm-hand">${codeRows(g)}<p class="muted">Try ${g.tries.length} of ${g.max}.</p><div class="row"><button type="button" class="yes" data-gm-cnext ${dis}>Bob's next try</button></div></div>`;
  }
  return `<div class="gm-hand">${codeRows(g)}<p class="muted">Try ${g.tries.length + 1} of ${g.max}. ⚫ right colour, right place; ⚪ right colour, wrong place.</p>${picker}<div class="row"><button type="button" class="yes" data-gm-ctry ${dis}>Try it</button></div></div>`;
}

function riddleResults(g) { return g.results?.length ? `<ol class="gm-riddles">${g.results.map((r) => `<li>${esc(r.riddle)} <strong>${esc(r.answer)}</strong> ${r.solved ? '✓' : '✗'}${r.by ? ` (${esc(r.by)})` : ''}</li>`).join('')}</ol>` : ''; }
function riddlesHtml(g, dis) {
  return `<div class="gm-hand"><p class="gm-riddle"><strong>${esc(g.riddle)}</strong></p>
    <p class="muted">Riddle ${g.at + 1} of ${g.of} · guess ${Math.min(g.tries + 1, g.max)} of ${g.max} · ${g.solved} solved</p>
    <div class="row"><input type="text" data-text maxlength="80" aria-label="Your answer" placeholder="Your answer…" ${dis}><button type="button" class="yes" data-gm-ranswer ${dis}>Answer</button><button type="button" data-hint ${dis}>Hint</button><button type="button" data-gm-rskip ${dis}>Skip</button></div></div>`;
}

// ---------- Taps ----------
// Returns { data } (a move to send), { url, data }, 'drawn' (only the page changed), or null (not ours).
export function plusClick(t, { game, opts, text }) {
  const d = t.dataset;
  if ('gmTwo' in d) { opts.two = t.checked; return 'drawn'; }
  if ('gmKeep' in d) return { url: '/api/games/keep-story', data: {}, open: true };
  if (!game || !PLUS.has(game.kind)) return null;
  if (d.gmSq) {
    const legal = game.legal || [];
    if (ui.pick && legal.some((m) => m.from === ui.pick && m.to === d.gmSq)) { const from = ui.pick; ui.pick = ''; return { data: { from, to: d.gmSq, promo: ui.promo } }; }
    ui.pick = legal.some((m) => m.from === d.gmSq) ? d.gmSq : ''; return 'drawn';
  }
  if ('gmMove' in d) { ui.pick = ''; const m = text(); return m ? { data: { move: m } } : 'drawn'; }
  if ('gmUndo' in d) return { data: { undo: true } };
  if ('gmDraw' in d) return { data: { draw: true } };
  if ('gmResign' in d) return { data: { resign: true } };
  if ('gmAskgo' in d) { const q = t.parentElement.querySelector('[data-gm-ask]')?.value.trim(); return q ? { data: { ask: q } } : 'drawn'; }
  if (d.gmCell !== undefined) { ui.cell = Number(d.gmCell); return 'drawn'; }
  if (d.gmNum !== undefined) return ui.cell >= 0 ? { data: { cell: ui.cell, value: Number(d.gmNum) } } : 'drawn';
  if ('gmHintfill' in d) return { data: { hint: true, fill: true } };
  if ('gmCheck' in d) return { data: { check: true } };
  if ('gmReveal' in d) return ui.cell >= 0 ? { data: { reveal: ui.cell } } : 'drawn';
  if ('gmGword' in d) { const w = text(); return w ? { data: { word: w } } : 'drawn'; }
  if ('gmGdone' in d) return { data: { done: true } };
  if (d.gmN !== undefined) return { data: { cell: Number(d.gmN) } };
  if (d.gmColour) { if (ui.code.length < 4) ui.code.push(d.gmColour); return 'drawn'; }
  if ('gmCclear' in d) { ui.code = []; return 'drawn'; }
  if ('gmCtry' in d) { if (ui.code.length < 4) return 'drawn'; const code = ui.code.join(''); ui.code = []; return { data: { code } }; }
  if ('gmCnext' in d) return { data: { next: true } };
  if ('gmRanswer' in d) { const a = text(); return a ? { data: { answer: a } } : 'drawn'; }
  if ('gmRskip' in d) return { data: { skip: true } };
  return null;
}
// Typing: a letter in a crossword square, a number on the Sudoku square you picked, a name, the pawn's promotion.
export function plusInput(e, { game, opts }) {
  const t = e.target, d = t.dataset;
  if (d.gmName) { opts[d.gmName] = t.value; return null; }
  if (d.gmOpt) { opts[d.gmOpt] = t.value; return null; }
  if ('gmPromo' in d) { ui.promo = t.value; return null; }
  if (d.gmX !== undefined && game?.kind === 'crossword') { // kept on the page as you type, sent once you pause
    t.value = t.value.slice(-1).toUpperCase().replace(/[^A-Z]/g, '');
    ui.cell = Number(d.gmX);
    if (t.value) plusFocusNext(game);
    const letters = Array.from({ length: 25 }, (_, i) => document.querySelector(`[data-gm-x="${i}"]`)?.value.toLowerCase() || '');
    return { letters, later: true };
  }
  return null;
}
export function plusKey(e, { game }) {
  if (game?.kind === 'sudoku' && ui.cell >= 0 && /^[0-9]$/.test(e.key) && !e.target.matches('input,textarea')) return { cell: ui.cell, value: Number(e.key) };
  if (game?.kind === 'sudoku' && ui.cell >= 0 && (e.key === 'Backspace' || e.key === 'Delete') && !e.target.matches('input,textarea')) return { cell: ui.cell, value: 0 };
  return null;
}
export function plusReset() { ui.pick = ''; ui.cell = -1; ui.code = []; }
// Crossword: after a letter, move to the next open square, so typing a word flows.
export function plusFocusNext(game) {
  if (game?.kind !== 'crossword' || ui.cell < 0) return;
  for (let k = ui.cell + 1; k < 25; k++) { const el = document.querySelector(`[data-gm-x="${k}"]`); if (el && !el.value) { el.focus(); ui.cell = k; return; } }
}
// After the page is drawn again, put the cursor back in the crossword square you were on.
export function plusRefocus(game) {
  if (game?.kind === 'crossword' && ui.cell >= 0) document.querySelector(`[data-gm-x="${ui.cell}"]`)?.focus();
}
// Which crossword square you're on, for "Show the letter in the square I'm on".
export function plusFocusIn(e) { if (e.target?.dataset?.gmX !== undefined) ui.cell = Number(e.target.dataset.gmX); }
