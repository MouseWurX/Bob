// 1.5.210: Bob's three looks (Style > Look: Classic, Lamplight, Terminal) and Lamplight's room glow.
// Display only: no brain context, no server calls, steady when animations are off.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanStyle } from '../src/config.js';
import { HELP } from '../public/help-content.js';

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
check('Classic is the look Bob starts with (new things are off by default)', /DEFAULT_LOOK = 'classic'/.test(themes));
const css = read('public/looks.css');
check('every look has styles', ['look-classic', 'look-lamplight', 'look-terminal'].every((c) => css.includes(`body.${c}`)));
check('Lamplight motion stops with animations off and for reduced motion', css.includes('body.look-lamplight.still') && /prefers-reduced-motion[^{]*\{[^}]*look-lamplight/.test(css));
check('the glow layer only fades (opacity), never moves', /body\.look-lamplight::before \{[^}]*opacity: var\(--cube-light/.test(css) && !/body\.look-lamplight::before \{[^}]*(transform|animation)/.test(css));
check('light themes stay light under Lamplight', css.includes('body.look-lamplight.theme-light') && themes.includes("'theme-light'"));
for (const f of ['public/index.html', 'public/settings.html']) check(`${f} loads the looks`, read(f).includes('href="/looks.css"'));
const page = read('public/style-page.js');
check('the Style page has the Look picker', page.includes('data-uilook') && page.includes('role="radiogroup" aria-label="Look"'));

// ---- Help, glossary, FAQ ----
const help = (id) => HELP.find((e) => e.id === id)?.html || '';
check('Style Help explains the three looks', ['Classic', 'Lamplight', 'Terminal'].every((w) => help('style').includes(w)));
check('the FAQ says a look never changes how Bob works', /same speed/.test(help('faq-looks')) && /Windows, Mac, Linux/.test(help('faq-looks')));
check('the glossary has Lamplight and Look', help('glossary').includes('<dt>Lamplight</dt>') && help('glossary').includes('<dt>Look</dt>'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
