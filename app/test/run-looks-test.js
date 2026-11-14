// 1.5.210: Bob's three looks (Style > Look: Classic, Lamplight, Terminal) and Lamplight's room glow.
// Display only: no brain context, no server calls, steady when animations are off.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanStyle, lampMove } from '../src/config.js';
import { HELP } from '../public/help-content.js';
import { rankFind } from '../public/find.js';
import { bobMenuHtml } from '../public/bob-menu.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// ---- the glow follows the cube, with no script of its own ----
{
  const css0 = read('public/looks.css');
  check('the room glow is the cube\'s own light level', /body\.look-lamplight::before \{[^}]*opacity: var\(--cube-light, \.3\)/.test(css0));
  check('with animations off the glow holds one steady level', /body\.look-lamplight\.still::before \{ opacity: \.3; \}/.test(css0));
  check('no glow script runs a loop of its own', !fs.existsSync(fileURLToPath(new URL('../public/lamplight.js', import.meta.url))) && !/setInterval|requestAnimationFrame/.test(read('public/themes.js')));
}

// ---- saved setting, picker and styles ----
check('a look is saved', cleanStyle({ look: 'lamplight' }).look === 'lamplight' && cleanStyle({ look: 'terminal' }).look === 'terminal');
check('an unknown look is dropped', !('look' in cleanStyle({ look: 'neon<script>' })));
const themes = read('public/themes.js'), cfg = read('src/config.js');
const ids = (s, re) => (s.match(re) || [])[1];
check('page and server agree on the looks', ids(themes, /LOOK_IDS = \[([^\]]+)\]/) === ids(cfg, /\[('classic', 'lamplight', 'terminal')\]\.includes\(st\.look\)/));
check('an upgrade that never picked a look stays Classic', /DEFAULT_LOOK = 'classic'/.test(themes));
check('a new install starts in Lamplight with the cube', (() => { const ex = JSON.parse(read('config.example.json')); return ex.style?.look === 'lamplight' && ex.style?.avatar === 'cube'; })());
check('a new install starts with the Mercury lamp, its theme and icon agreeing', (() => { const ex = JSON.parse(read('config.example.json')); return ex.style?.lamp === 'mercury' && ex.style?.theme === 'mercury'; })());
const css = read('public/looks.css');
check('every look has styles', ['look-classic', 'look-lamplight', 'look-terminal'].every((c) => css.includes(`body.${c}`)));
check('Lamplight motion stops with animations off and for reduced motion', css.includes('body.look-lamplight.still') && /prefers-reduced-motion[^{]*\{[^}]*look-lamplight/.test(css));
check('the glow layer only fades (opacity), never moves', /body\.look-lamplight::before \{[^}]*opacity: var\(--cube-light/.test(css) && !/body\.look-lamplight::before \{[^}]*(transform|animation)/.test(css));
check('light themes stay light under Lamplight', css.includes('body.look-lamplight.theme-light') && themes.includes("'theme-light'"));
for (const f of ['public/index.html', 'public/settings.html']) check(`${f} loads the looks`, read(f).includes('href="/looks.css"'));
const page = read('public/style-page.js');
check('the Style page has the Look picker', page.includes('data-uilook') && page.includes('role="radiogroup" aria-label="Look"'));

check('Lamplight puts the menu across the top on a computer, phones keep the bottom bar', /@media \(min-width: 641px\) \{\s*body\.look-lamplight \.app \{ display: grid/.test(css) && /body\.look-lamplight \.side \{ grid-column: 1 \/ -1/.test(css));
check('every tool in the top bar keeps its name for screen readers', ['newchat', 'cellarBtn', 'dlBtn', 'tidyBtn', 'settingsBtn', 'styleBtn', 'helpBtn', 'ear', 'speak', 'notify'].every((id) => new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`).test(read('public/index.html'))));
check('picking Lamplight tucks Now running away, without forcing it', page.includes("getElementById('hideRight')?.click()"));

// ---- the Lamplight layout: Bob's menu, Find anything, the status line ----
const r = rankFind([{ label: 'Downloads', kind: 'Tool' }, { label: 'Tasks', kind: 'Page' }, { label: 'Brains and speed', kind: 'Settings', words: 'memory engines' }, { label: 'Style', kind: 'Help', words: 'glow' }], 'engine');
check('Find anything finds a Settings card by the words inside it', r.length === 1 && r[0].label === 'Brains and speed');
check('Find anything with nothing typed lists the pages and tools', rankFind([{ label: 'Tasks', kind: 'Page' }, { label: 'Style', kind: 'Help' }], '').map((i) => i.label).join() === 'Tasks');
check('a Help topic found only by its search words still shows', rankFind([{ label: 'My Bobs are on Wi-Fi. How do I get them on the best band?', kind: 'Help', words: 'wifi calibrate' }], 'calibrate').length === 1);
check('1.5.222: the cube is Bob\'s picture for everyone outside games; an old Pixel Bob pick stays in the file but never hides it', read('public/themes.js').includes('export const pixelKept = () => false;') && publicText('app.js').includes('setAvatarCube(true); // 1.5.222') && cleanStyle({ avatar: 'pixel', avatarKept: true }).avatarKept === true);
check('Now running starts closed in every look, and an old open is forgotten once on the update', read('public/layout.js').includes("store.get('bob-right', 'hidden')") && read('public/layout.js').includes("'bob-layout-211'"));
check('Journey has its own tab next to Adventure, on the computer and in the phone menu (1.5.215)', read('public/index.html').includes('id="journeyBtn"') && publicText('app.js').includes("$('journeyBtn').onclick") && read('public/phone/index.html').includes('data-go="journey"') && read('public/phone/phone.js').includes('journey: journeyTab'));
check('a page beats a Help topic of the same name', rankFind([{ label: 'Tasks', kind: 'Help' }, { label: 'Tasks', kind: 'Page' }], 'tasks')[0].kind === 'Page');
const menu = bobMenuHtml({ loaded: [] }, { tools: [{ id: 'settingsBtn', icon: '⚙', label: 'Settings' }, { id: 'speak', icon: '🔊', label: 'Read aloud', st: 'On' }], session: { value: 'b', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B<' }] } });
check("Bob's menu carries the tools, each pressing its own button", menu.includes('data-bobtool="settingsBtn"') && menu.includes('data-bobtool="speak"') && menu.includes('>On<'));
check("Bob's menu has the Session pick, escaped", menu.includes('<option value="b" selected>B&lt;</option>'));
check("without Lamplight Bob's menu stays as it was", !bobMenuHtml({ loaded: [] }).includes('bob-menu-tools'));
const app = publicText('app.js');
check('Ctrl+K opens Find anything only in Lamplight', /id === 'search'\) \{ if \(lamp\(\)\) findBox\.open\(\); else topicsPage\.open\(\);/.test(app));
check('the top bar hides the tools only in Lamplight, and the Find button only shows there', /body\.look-lamplight \.side :is\(#cellarBtn[^)]*\)[^{]*\{ display: none; \}/.test(css) && /\n#findBtn \{ display: none; \}/.test(css));
check('the status line moves under the typing box (the same buttons, nothing rebuilt)', /body\.look-lamplight \.ctx \{ order: 99;/.test(css));
check('Find anything has a name, keyboard moves and the listbox roles', read('public/find.js').includes("role=\"listbox\"") && read('public/find.js').includes('aria-activedescendant') && read('public/index.html').includes('aria-keyshortcuts="Control+K"'));

// ---- Help, glossary, FAQ ----
const help = (id) => HELP.find((e) => e.id === id)?.html || '';
check('Style Help explains the three looks', ['Classic', 'Lamplight', 'Terminal'].every((w) => help('style').includes(w)));
check('the FAQ says a look never changes how Bob works', /same speed/.test(help('faq-looks')) && /Windows, Mac, Linux/.test(help('faq-looks')));
check('a Lamplight page fills the room and scrolls inside it (height: auto beats the dialog\'s own fit-content; 1.5.212, first-time setup didn\'t scroll)', /body\.look-lamplight \.cellar\.page\[open\] \{ position: fixed; inset: 64px 0 0 0;[^}]*height: auto;/.test(css) && /\.cellar\.page \{[^}]*overflow: auto/.test(read('public/style.css')));
check('the glossary has Lamplight, Look and Find anything', ['Lamplight', 'Look', 'Find anything'].every((w) => help('glossary').includes(`<dt>${w}</dt>`)));
check('Style Help explains Find anything and the status line', help('style').includes('Find anything') && help('style').includes('status line'));

// ---- Nov 14 2026: the lamps (Mercury, Sodium, Thallium, Neon) for Lamplight and Terminal ----
{
  const T = await import('../public/themes.js');
  check('four lamps, Mercury first and the default', T.LAMP_IDS.join() === 'mercury,sodium,thallium,neon' && T.DEFAULT_LAMP === 'mercury' && T.lampId({}) === 'mercury' && T.lampId({ lamp: 'nope' }) === 'mercury' && T.lampId({ lamp: 'neon' }) === 'neon');
  check('each lamp is a theme of its own, in the Lamps group, with the same id', T.LAMPS.every((l) => T.findTheme(l.id)?.group === 'Lamps'));
  check('the lamp colours are the gases\' own light (CIE 1931 sums of their lines)', JSON.stringify(T.LAMPS.map((l) => l.spectral)) === JSON.stringify(['#8becff', '#ff8000', '#00ff00', '#ff2e00']));
  { // the owner: "so bright". Each lamp is its spectral hue dimmed to one brightness, in a near-black room.
    const lum = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    check('every lamp is dimmed to the same soft brightness', T.LAMPS.every((l) => Math.abs(lum(l.glow) - 0.2) < 0.01));
    check('Send in Lamplight is a soft lamp-tinted button with the theme\'s text (the owner: dim the send buttons)', /body\.look-lamplight \.send \{[^}]*background: color-mix\(in srgb, var\(--accent\) 26%, var\(--panel\)\); color: var\(--text\)/.test(css));
  { const r = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    check('Send\'s words stay clear (4.5:1) on every theme', T.PRESETS.every((t) => { const c = T.fullColors(t); return r(c.text, T.mix(c.accent, c.panel, 0.26)) >= 4.5; })); }
  check('Lamplight has a faint smoke lit by the cube: it follows --cube-light, drifts by transform only, holds still with animations off or reduced motion', /body\.look-lamplight \.app::after \{[^}]*mask-image: url\("data:image\/svg\+xml[^}]*opacity: calc\(var\(--cube-light/.test(css) && /@keyframes lamp-smoke \{ from \{ transform: [^}]*\} to \{ transform: [^}]*\} \}/.test(css) && css.includes('body.look-lamplight.still .app::after { animation: none;') && /prefers-reduced-motion: reduce\) \{ body\.look-lamplight \.app::after \{ animation: none; \}/.test(css));
  check('the lamp rooms are near-black', T.LAMPS.every((l) => lum(T.fullColors(T.findTheme(l.id)).bg) < 0.006));
  }
  check('a lamp is saved, an unknown one dropped', cleanStyle({ lamp: 'sodium' }).lamp === 'sodium' && !('lamp' in cleanStyle({ lamp: 'krypton' })));
  check('page and server agree on the lamps', /\['mercury', 'sodium', 'thallium', 'neon'\]\.includes\(st\.lamp\)/.test(read('src/config.js')));
  check('picking a lamp picks its theme, and picking a lamp\'s theme picks the lamp', page.includes("save(settings, { lamp: b.dataset.lamp, theme: b.dataset.lamp })") && T.lampOfTheme('thallium') === 'thallium' && T.lampOfTheme('moondust') === null);
  check('the lamp picker shows in Lamplight and Terminal, and in Settings, Look & feel', T.LAMP_LOOKS.join() === 'lamplight,terminal' && page.includes('aria-label="Lamp"') && read('public/cellar-pages.js').includes('aria-label="Lamp"') && read('public/cellar.js').includes('b.dataset.lamp'));
  check('the lamp glow on the picker holds still with animations off', css.includes('body.still .lamp-pick button i { box-shadow: none !important; }'));
  check('an existing install on Moondust (or no theme) moves to Mercury once', JSON.stringify(lampMove({ look: 'lamplight', theme: 'moondust' })) === JSON.stringify({ look: 'lamplight', theme: 'mercury', lamp: 'mercury', lampMoved: true }) && lampMove({}).theme === 'mercury' && lampMove({ theme: 'slate' }).theme === 'mercury');
  check('any other theme stays, and Moondust picked again after the move stays', lampMove({ theme: 'inn' }).theme === 'inn' && lampMove({ theme: 'moondust', lampMoved: true }) === null && cleanStyle({ lampMoved: true }).lampMoved === true);
  check('the move runs at start-up and is saved, so it happens once', /const moved = lampMove\(cfg\.style\); if \(moved\) \{ cfg\.style = moved; try \{ saveSettings\(cfg, \{ style: moved \}\)/.test(read('src/config.js')));
  check('Help says Moondust moves to Mercury once', help('faq-lamps').includes('Moondust'));
  check('Help, FAQ and glossary explain the lamps', ['Mercury', 'Sodium', 'Thallium', 'Neon'].every((w) => help('style').includes(w) && help('faq-lamps').includes(w)) && /Windows, Mac, Linux/.test(help('faq-lamps')) && help('glossary').includes('<dt>Lamp</dt>'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
