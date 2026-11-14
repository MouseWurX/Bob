// 1.5.227 "Window buttons on Bob's bar" (electron/window-bar.cjs, public/window-bar.js, looks.css) and the ask box
// redo (public/ask.html): off by default, the window options per system, the colour checks, the page side with a
// fake overlay, the setting saved and handed to the window, and Help. Nothing reads this replicant matrix's own
// window or settings: the system is passed in as a word and the browser bits are fakes.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { windowState } from '../src/app-icon.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { HELP, FOLD } from '../public/help-content.js';
import { toHex, barHeight, STRIP, startWindowBar } from '../public/window-bar.js';

const require = createRequire(import.meta.url);
const bar = require('../electron/window-bar.cjs');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- off unless turned on ----
check('off by default (windowState)', windowState({}).ownBar === false);
check('on when turned on', windowState({ ownBar: true }).ownBar === true);
check('a saved key', SETTING_KEYS.includes('ownBar'));
check('only true counts', mergeSettings({}, { ownBar: 'yes' }).ownBar === false && mergeSettings({}, { ownBar: true }).ownBar === true);
check('not in config.example.json (so new installs are off too)', !('ownBar' in JSON.parse(read('config.example.json'))));

// ---- the window's options, per system ----
check('off: the usual window', Object.keys(bar.barOptions('win32', false)).length === 0);
for (const os of ['win32', 'linux']) {
  const o = bar.barOptions(os, true);
  check(`${os}: title bar hidden, system buttons drawn over the page`, o.titleBarStyle === 'hidden' && o.titleBarOverlay && /^#[0-9a-f]{6}$/.test(o.titleBarOverlay.color) && o.titleBarOverlay.height === bar.BAR_HEIGHT);
  check(`${os}: never frameless (keeps resize edges and snapping)`, o.frame === undefined);
}
const mac = bar.barOptions('darwin', true);
check('Mac: traffic lights kept, moved onto the bar', mac.titleBarStyle === 'hidden' && mac.titleBarOverlay === true && mac.trafficLightPosition?.x === 16);
check('Mac: traffic lights centred in a 72 px bar', bar.trafficLights(72).y === 29);

// ---- only clean colours reach the window ----
check('colours pass', JSON.stringify(bar.cleanColours({ color: '#0D0D0D', symbolColor: '#e8e8e8', height: 72 })) === '{"color":"#0d0d0d","symbolColor":"#e8e8e8","height":72}');
check('anything else is refused', [null, 'x', { color: 'red', symbolColor: '#fff' }, { color: '#000000', symbolColor: 'url(x)' }, { color: '#000000;', symbolColor: '#ffffff' }].every((b) => bar.cleanColours(b) === null));
check('a silly height is dropped, the colours kept', !('height' in bar.cleanColours({ color: '#000000', symbolColor: '#ffffff', height: 5000 })) && !('height' in bar.cleanColours({ color: '#000000', symbolColor: '#ffffff', height: 40.5 })));

// ---- the page: colours as the browser gives them ----
check('rgb()', toHex('rgb(18, 18, 18)') === '#121212');
check('color(srgb) from color-mix', toHex('color(srgb 0.0508235 0.0508235 0.0508235)') === '#0d0d0d');
check('see-through is skipped', toHex('rgba(0, 0, 0, 0)') === '' && toHex('transparent') === '');

// ---- the page with a fake overlay ----
function fakePage({ visible = true, look = 'look-lamplight', narrow = false, sideH = 72 } = {}) {
  const classes = new Set([look]);
  const body = {
    classList: { contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
    prepend: (el) => { body.first = el; }
  };
  const side = { getBoundingClientRect: () => ({ height: sideH }) };
  const doc = {
    body, documentElement: {},
    querySelector: (s) => (s === '.side' ? side : s === '.win-strip' ? body.first || null : null),
    createElement: () => { const a = {}; return { set className(v) { a.cls = v; }, get className() { return a.cls; }, setAttribute: (k, v) => { a[k] = v; }, attrs: a }; }
  };
  const heard = {};
  const view = {
    navigator: { windowControlsOverlay: { visible, addEventListener: (e, f) => { heard[e] = f; } } },
    getComputedStyle: (el) => (el === body ? { backgroundColor: 'rgb(13, 13, 13)', color: 'rgb(232, 232, 232)' } : { backgroundColor: 'rgb(0, 0, 0)' }),
    matchMedia: () => ({ matches: narrow }), MutationObserver: class { observe() {} },
    setTimeout: () => 0, clearTimeout: () => {}, addEventListener: () => {}
  };
  return { doc, view, classes, heard };
}
{
  const p = fakePage(), sent = [];
  startWindowBar({ doc: p.doc, view: p.view, send: (c) => sent.push(c) });
  check('own-bar class on with the overlay', p.classes.has('own-bar'));
  check('a strip to drag by, hidden from screen readers', p.doc.body.first?.className === 'win-strip' && p.doc.body.first.attrs['aria-hidden'] === 'true');
  check('the buttons get the page colours and the bar height', sent.length === 1 && sent[0].color === '#0d0d0d' && sent[0].symbolColor === '#e8e8e8' && sent[0].height === 72);
}
{
  const p = fakePage({ visible: false }), sent = [];
  startWindowBar({ doc: p.doc, view: p.view, send: (c) => sent.push(c) });
  check('no overlay: nothing changes and nothing is sent', !p.classes.has('own-bar') && sent.length === 0);
}
check('browser without the overlay: does nothing', startWindowBar({ doc: fakePage().doc, view: { navigator: {} } }) === null);
check('Classic: thin strip height', barHeight(fakePage({ look: 'look-classic' }).doc, fakePage().view) === STRIP);
check('Lamplight on a narrow window: thin strip height', barHeight(fakePage().doc, fakePage({ narrow: true }).view) === STRIP);

// ---- the window program and the brain ----
const main = read('electron/main.cjs'), server = read('src/server.js'), css = read('public/looks.css');
check('main window made with the bar options', /barNow = winState\.ownBar === true;[\s\S]{0,200}windowBar\.barOptions\(process\.platform, barNow\)/.test(main));
check('colours go through the check', /windowBar\.cleanColours\(b\)/.test(main));
check('only Bob\'s own page may set them', /p === '\/api\/window-bar'\)[^\n]*if \(isLocal\)/.test(server));
check('saved and handed to the window', /typeof b\.ownBar === 'boolean'[^\n]*applyWindowState\(cfg\)/.test(server));
check('the bar drags, its controls do not', /\.side \{ -webkit-app-region: drag; app-region: drag;/.test(css) && /\.side :is\(button, a, input[^)]*\) \{ -webkit-app-region: no-drag/.test(css));
check('the bar keeps clear of the system buttons', /padding-right: calc\(var\(--s5\) \+ var\(--win-right\)\)/.test(css));
check('Find shrinks, tabs never do', /#findBtn \.lbl \{ display: none; \}/.test(css) && !/own-bar[^\n]*nav-item \.lbl \{ display: none/.test(css));

// ---- the ask box ----
const ask = read('public/ask.html'), askJs = read('public/ask.js');
check('ask box: the answer above, the typing box at the bottom', ask.indexOf('id="askOut"') < ask.indexOf('id="askForm"'));
check('ask box: follows the theme and look', /applySavedStyle\(\)/.test(askJs) && /looks\.css/.test(ask));
check('ask box: no title bar only with the setting, and a way to put it away', /winState\.ownBar === true \? \{ frame: false \}/.test(main) && /id="askClose"[^>]*aria-label=/.test(ask) && /askClose'\)\.onclick/.test(askJs));

// ---- Help ----
const ids = new Map(HELP.map((e) => [e.id, e]));
check('Help page in Bob\'s voice', /my window has no system title bar/.test(ids.get('window-bar')?.html || ''));
check('FAQ, folded into a page', ids.has('faq-window-bar') && FOLD['faq-window-bar'] === 'tray');
check('glossary entry', /<dt>Title bar<\/dt>/.test(ids.get('glossary')?.html || ''));
check('settings row says Off', /set\('Window buttons on Bob\\'s bar', 'Off'/.test(read('public/help-content.js')));
check('Settings switch', /sswitch\('ownBar'/.test(read('public/cellar-pages.js')));
check('settings inventory row', /\| Window buttons on Bob's bar \| Off unless you turn it on/.test(read('docs/SETTINGS-INVENTORY.md')));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
