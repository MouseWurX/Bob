// Nov 15 (the owner: "the menu for the phone is horrible"; look, size and finding things; Settings "doesnt fit the
// theme" on a phone): one bottom-sheet menu for the Bob button and the cube, and Settings as two tidy lists.
import fs from 'node:fs';
import { phoneMenuHtml, GO_TO, SET_UP, QUICK, TOGGLES } from '../public/phone-menu.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Made-up buttons: every id exists unless listed in gone; hidden ones in hide; on ones in on.
const fake = ({ gone = [], hide = [], on = [], st = {}, badge = {} } = {}) => (id) => (gone.includes(id) ? null : { hidden: hide.includes(id), icon: `<svg class="ico" data-i="${id}"></svg>`, on: on.includes(id), st: st[id] || '', badge: badge[id] || '' });
const ids = (html, attr = 'data-press') => [...html.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((m) => m[1]);

{
  const h = phoneMenuHtml({ btn: fake(), said: 'Sleeping. Type to wake me.', brain: 'Brain: memory freed', fill: 'Chat memory: 82%' });
  const pressed = ids(h);
  check('every page, tool, quick switch and toggle is there, each pressing its own button', [...GO_TO, ...SET_UP, ...QUICK, ...TOGGLES].every(([id]) => pressed.includes(id)) && pressed.includes('findBtn'));
  check('Go to and Set up are labelled tile groups', /<h3 class="pm-head" id="pm-go">Go to<\/h3><div class="pm-grid" role="group" aria-labelledby="pm-go">/.test(h) && /id="pm-set">Set up</.test(h));
  check('what Bob is doing leads, with the brain and chat memory under it', h.indexOf('Sleeping. Type to wake me.') < h.indexOf('pm-chips') && h.includes('Brain: memory freed · Chat memory: 82%'));
  check('a close button with words for a screen reader', /data-close aria-label="Close the menu"/.test(h));
  check('the icons are the menu buttons\' own', h.includes('data-i="labBtn"') && h.includes('data-i="settingsBtn"'));
}
{
  const h = phoneMenuHtml({ btn: fake({ gone: ['journeyBtn'], hide: ['labBtn', 'usersBtn', 'ear'] }) });
  const pressed = ids(h);
  check('a button that is off or missing leaves no tile (Lab off, Users off, no Journey)', !pressed.includes('labBtn') && !pressed.includes('usersBtn') && !pressed.includes('journeyBtn') && !pressed.includes('ear') && pressed.includes('gamesBtn'));
}
{
  const h = phoneMenuHtml({ btn: fake({ on: ['chatBtn', 'speak', 'brainFree'], st: { brainFree: 'On', handsBtn: 'Off in Settings' }, badge: { dlBtn: '2' } }) });
  check('the page you are on is marked', /class="pm-tile on" data-press="chatBtn" aria-current="page"/.test(h));
  check('toggles are switches that say on or off', /data-press="speak" role="switch" aria-checked="true"/.test(h) && /data-press="notify" role="switch" aria-checked="false"/.test(h));
  check('quick switches say their state in words', /data-press="brainFree" aria-pressed="true">Free memory <i>On<\/i>/.test(h) && /data-press="handsBtn" aria-pressed="false">✋ Hands <i>Off in Settings<\/i>/.test(h));
  check('badges carry over (Downloads waiting)', /data-press="dlBtn"[^]*?<span class="pm-badge">2<\/span>/.test(h));
}
{
  const h = phoneMenuHtml({ btn: fake(), session: { value: 'art', options: [{ value: 'normal', label: '☕ Normal' }, { value: 'art', label: '🎨 Art' }] } });
  check('Session is a row of choices, the current one checked', /role="radiogroup" aria-label="Session"/.test(h) && /data-session="art" aria-checked="true"/.test(h) && /data-session="normal" aria-checked="false"/.test(h));
  check('no sessions, no Session row', !phoneMenuHtml({ btn: fake(), session: null }).includes('data-session'));
  check('words are escaped', phoneMenuHtml({ btn: fake(), said: '<b>x</b>' }).includes('&lt;b&gt;x&lt;/b&gt;'));
}

// ---- wiring ----
const pm = read('public/phone-menu.js'), app = read('public/app.js'), chip = read('public/status-chip.js'), html = read('public/index.html'), css = read('public/style.css');
check('the Bob button opens it on a phone; wide windows keep the old menu', /if \(phoneMenu && phone\(\)\) \{[^}]*phoneMenu\.toggle\(\); return; \}/.test(chip) && /if \(on && !isPhone\(\)\) return false;/.test(pm));
check('the cube opens it on a phone, Bob\'s menu otherwise', /!phoneMenu\.open\(true\) && lampLook\(\)\) bobMenu\.toggle\(c\)/.test(app) && /if \(phoneMenu\.open\(true\)\) return;/.test(app));
check('a dialog that keeps Tab inside, closes on Escape, the scrim or ✕, and gives focus back', /setAttribute\('aria-modal', 'true'\)/.test(pm) && /e\.key === 'Escape'/.test(pm) && /e\.key !== 'Tab'/.test(pm) && /scrim\.addEventListener\('click', \(\) => open\(false\)\)/.test(pm) && /back\?\.isConnected\) back\.focus\(\)/.test(pm));
check('pages close it; switches stay open, except Autonomy, which asks first', /if \(!stay \|\| id === 'freeBtn'\) open\(false\);/.test(pm));
check('it never runs past the top of the screen, and widening the window puts it away', /maxHeight = `\$\{Math\.max\(240, window\.innerHeight - h - 56\)\}px`/.test(pm) && /if \(!isPhone\(\)\) open\(false\)/.test(pm));
check('theme colours only, and still with motion off', /\.phone-menu \{[^}]*background: var\(--panel\)/.test(css) && /body\.still \.phone-menu \{ animation: none; \}/.test(css) && /prefers-reduced-motion: reduce\) \{ \.phone-menu \{ animation: none; \} \}/.test(css));
check('tiles and switches are big enough to tap', /\.pm-tile \{[^}]*min-height: 72px/.test(css) && /\.pm-chip \{[^}]*min-height: 40px/.test(css) && /\.pm-row \{[^}]*min-height: 52px/.test(css));
check('the bar: Chat, Tasks, New, Topics, Bob', /data-go="chatBtn"[^]*data-go="tasksBtn"[^]*data-go="newchat"[^]*data-go="topicsBtn"[^]*id="moreBtn"[^>]*aria-label="Bob: the whole menu"/.test(html.slice(html.indexOf('<nav id="bottomBar"'))));

// ---- Settings on a phone ----
const cel = read('public/cellar.js');
check('Settings front page: a Models and looks list stands in for the tabs', /<div class="set-doors" role="group" aria-label="Models and looks">/.test(cel) && /data-tab="catalogue"[^]*data-tab="roles"[^]*data-tab="style"/.test(cel) && /\.cellar-tabs:has\(\+ \.pane > section\.settings > \.set-top\) \{ display: none; \}/.test(css));
check('…hidden inside a card and while searching', /doorsEl\.hidden = Boolean\(card\)/.test(cel) && /\.settings\.searching \.set-doors \{ display: none !important; \}/.test(css));
check('every Settings card has a line icon', (() => { const m = cel.match(/const CARD_LINES = \{([^]*?)\n  \};/); return m && ['bob', 'how', 'brains', 'net', 'online', 'agents', 'may', 'fun', 'pc'].every((id) => new RegExp(`\\n    ${id}: '`).test(m[1])); })());
check('wide windows keep the cards as they were', /\.set-doors, \.set-card-line, \.set-go \{ display: none; \}/.test(css) && css.indexOf('.set-doors, .set-card-line, .set-go { display: none; }') < css.indexOf('.set-card .set-card-icon, .set-card .set-card-now { display: none; }'));
check('Help says where things went', /Chat, Tasks, New, Topics<\/strong> and <strong>Bob<\/strong>/.test(read('public/help-content.js')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
