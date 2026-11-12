// 1.5.210: Bob's three looks (Style > Look: Classic, Lamplight, Terminal) and Lamplight's room glow.
// Display only: no brain context, no server calls, steady when animations are off.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanStyle } from '../src/config.js';
import { HELP } from '../public/help-content.js';
import { rankFind } from '../public/find.js';
import { bobMenuHtml } from '../public/bob-menu.js';

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
check('picking Lamplight tucks Now running away and offers the cube, without forcing either', page.includes("getElementById('hideRight')?.click()") && page.includes('!settings.style?.avatar'));

// ---- the Lamplight layout: Bob's menu, Find anything, the status line ----
const r = rankFind([{ label: 'Downloads', kind: 'Tool' }, { label: 'Tasks', kind: 'Page' }, { label: 'Brains and speed', kind: 'Settings', words: 'memory engines' }, { label: 'Style', kind: 'Help', words: 'glow' }], 'engine');
check('Find anything finds a Settings card by the words inside it', r.length === 1 && r[0].label === 'Brains and speed');
check('Find anything with nothing typed lists the pages and tools', rankFind([{ label: 'Tasks', kind: 'Page' }, { label: 'Style', kind: 'Help' }], '').map((i) => i.label).join() === 'Tasks');
check('a Help topic found only by its search words still shows', rankFind([{ label: 'My Bobs are on Wi-Fi. How do I get them on the best band?', kind: 'Help', words: 'wifi calibrate' }], 'calibrate').length === 1);
check('a page beats a Help topic of the same name', rankFind([{ label: 'Tasks', kind: 'Help' }, { label: 'Tasks', kind: 'Page' }], 'tasks')[0].kind === 'Page');
const menu = bobMenuHtml({ loaded: [] }, { tools: [{ id: 'settingsBtn', icon: '⚙', label: 'Settings' }, { id: 'speak', icon: '🔊', label: 'Read aloud', st: 'On' }], session: { value: 'b', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B<' }] } });
check("Bob's menu carries the tools, each pressing its own button", menu.includes('data-bobtool="settingsBtn"') && menu.includes('data-bobtool="speak"') && menu.includes('>On<'));
check("Bob's menu has the Session pick, escaped", menu.includes('<option value="b" selected>B&lt;</option>'));
check("without Lamplight Bob's menu stays as it was", !bobMenuHtml({ loaded: [] }).includes('bob-menu-tools'));
const app = read('public/app.js');
check('Ctrl+K opens Find anything only in Lamplight', /id === 'search'\) \{ if \(lamp\(\)\) findBox\.open\(\); else topicsPage\.open\(\);/.test(app));
check('the top bar hides the tools only in Lamplight, and the Find button only shows there', /body\.look-lamplight \.side :is\(#cellarBtn[^)]*\)[^{]*\{ display: none; \}/.test(css) && /\n#findBtn \{ display: none; \}/.test(css));
check('the status line moves under the typing box (the same buttons, nothing rebuilt)', /body\.look-lamplight \.ctx \{ order: 99;/.test(css));
check('Find anything has a name, keyboard moves and the listbox roles', read('public/find.js').includes("role=\"listbox\"") && read('public/find.js').includes('aria-activedescendant') && read('public/index.html').includes('aria-keyshortcuts="Control+K"'));

// ---- Help, glossary, FAQ ----
const help = (id) => HELP.find((e) => e.id === id)?.html || '';
check('Style Help explains the three looks', ['Classic', 'Lamplight', 'Terminal'].every((w) => help('style').includes(w)));
check('the FAQ says a look never changes how Bob works', /same speed/.test(help('faq-looks')) && /Windows, Mac, Linux/.test(help('faq-looks')));
check('the glossary has Lamplight, Look and Find anything', ['Lamplight', 'Look', 'Find anything'].every((w) => help('glossary').includes(`<dt>${w}</dt>`)));
check('Style Help explains Find anything and the status line', help('style').includes('Find anything') && help('style').includes('status line'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
