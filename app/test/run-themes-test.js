// 1.5.136: the themes are named after worlds and places, Moondust is the default, Match system is gone, and old
// saved names still land on a theme. Every preset must read clearly (WCAG AA): 4.5:1 for text and quiet text on
// every surface (3:1 for quiet text inside your own bubbles), 3:1 for the accent against the background.
import fs from 'node:fs';
import { PRESETS, DEFAULT_THEME, OLD_IDS, themeId, findTheme, resolve, fullColors, swatch } from '../public/themes.js';
import { cleanStyle } from '../src/config.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const ids = PRESETS.map((t) => t.id);
check('Moondust is the default theme', DEFAULT_THEME === 'moondust' && ids.includes('moondust'));
check('Match system is gone and nothing follows the system setting', !ids.includes('system') && PRESETS.every((t) => !t.follows));
check('the worlds are all there', ['moondust', 'nightside', 'otterbend', 'rivercoil', 'emberfall', 'hullplate', 'homestead', 'sandbar', 'longthaw'].every((id) => ids.includes(id)));
check('the high-contrast pair keeps its names', findTheme('hc-dark')?.name === 'High Contrast' && findTheme('hc-light')?.name === 'High Contrast Light' && findTheme('hc-dark').outlined && findTheme('hc-light').outlined);
check('Bob\'s Inn stays', findTheme('inn')?.name === 'Bob\'s Inn');
check('no theme is still called after the mouse hole', PRESETS.every((t) => !/mouse\s?hole|match system/i.test(`${t.name} ${t.what}`)));
check('ids are unique', new Set(ids).size === ids.length);
check('every old name lands on a theme that exists', Object.values(OLD_IDS).every((id) => ids.includes(id)) && Object.keys(OLD_IDS).every((old) => !ids.includes(old)));
check('Match system and Slate both become Moondust; the others keep their colours', themeId('system') === 'moondust' && themeId('slate') === 'moondust' && themeId('midnight') === 'nightside' && themeId('mousehole-dark') === 'otterbend' && themeId('mousehole-light') === 'homestead' && themeId('paper') === 'sandbar' && themeId('mousewurx-light') === 'drydock' && themeId('mousewurx-dark') === 'drydock-night');
check('findTheme and resolve take an old name', findTheme('mousehole-dark')?.id === 'otterbend' && resolve({ theme: 'system' }).id === 'moondust' && resolve({}).id === 'moondust' && resolve({ theme: 'nope' }).id === 'moondust');
check('a home-made theme still resolves', resolve({ theme: 'my-1', custom: [{ id: 'my-1', name: 'Mine', colors: { bg: '#000000' } }] }).id === 'my-1');
check('saved settings migrate on the server too', cleanStyle({ theme: 'system' }).theme === 'moondust' && cleanStyle({ theme: 'paper' }).theme === 'sandbar' && cleanStyle({ theme: 'emberfall' }).theme === 'emberfall');
check('the server list of old names matches the page\'s', JSON.stringify(Object.keys(OLD_IDS).sort().map((k) => [k, OLD_IDS[k]])) === JSON.stringify(Object.keys(OLD_IDS).sort().map((k) => [k, cleanStyle({ theme: k }).theme])));
check('the swatch has five colours for every theme', PRESETS.every((t) => swatch(t).length === 5));

// Colour checks, so the new names never cost anyone readability.
for (const t of PRESETS) {
  const c = fullColors(t);
  const worst = [];
  for (const s of ['bg', 'panel', 'card', 'you']) for (const k of ['text', 'muted']) { const r = ratio(c[k], c[s]); if (r < (k === 'muted' && s === 'you' ? 3 : 4.5)) worst.push(`${k} on ${s} ${r.toFixed(2)}`); } // quiet text in your bubbles is a timestamp-sized hint: 3:1
  for (const k of ['accent', 'good', 'warn', 'bad']) { const r = ratio(c[k], c.bg); if (r < (k === 'accent' ? 3 : 2.5)) worst.push(`${k} on bg ${r.toFixed(2)}`); } // good/warn/bad always sit beside words, never alone
  if (ratio(c.onAccent, c.accent) < 4.5) worst.push(`onAccent ${ratio(c.onAccent, c.accent).toFixed(2)}`);
  check(`${t.name} reads clearly (AA)`, worst.length === 0, worst.join(', '));
}
check('the four new themes keep quiet text at 4.5:1 even in your bubbles', ['rivercoil', 'emberfall', 'hullplate', 'longthaw'].every((id) => { const c = fullColors(findTheme(id)); return ratio(c.muted, c.you) >= 4.5 && ['good', 'warn', 'bad'].every((k) => ratio(c[k], c.bg) >= 3); }));
check('the two high-contrast themes reach AAA (7:1) for text everywhere', ['hc-dark', 'hc-light'].every((id) => { const c = fullColors(findTheme(id)); return ['bg', 'panel', 'card'].every((s) => ratio(c.text, c[s]) >= 7); }));

const groups = [...new Set(PRESETS.map((t) => t.group))];
check('groups: Bob, Worlds, Access, MouseWurX, Lamps', JSON.stringify(groups) === JSON.stringify(['Bob', 'Worlds', 'Access', 'MouseWurX', 'Lamps']));
const page = read('public/style-page.js');
check('the Style page shows the four groups with plain headings', /\['Worlds', 'Worlds and places'\]/.test(page) && /\['Access', 'High contrast'\]/.test(page) && !/From MouseHole/.test(page));
check('no page falls back to the inn by name any more', !/'inn'/.test(page) && !/\|\| 'inn'/.test(publicText('cellar.js')));
check('every theme has a short blurb', PRESETS.every((t) => t.what && t.what.length <= 110));
const pub = `${read('public/themes.js')} ${read('public/help-content.js')} ${read('../README.md')}`;
// 1.5.163 the owner picked "Vulcan" as the GPT-like thought path's name (9 Nov); only that exact path name is let through.
const pubNoPath = pub.replace(/<strong>Vulcan<\/strong> \(GPT-like\)/g, '').replace(/Sherlock, Watson and Vulcan/g, '');
check('public text never names the books or their worlds', !/bobiverse|quinlan|heaven's river|jabberwock|bellerophon|vulcan|romulus|poseidon/i.test(pubNoPath));
check('Help names the new groups and the default', /Moondust/.test(HELP.find((h) => h.id === 'style')?.html || '') && /Worlds and places/.test(HELP.find((h) => h.id === 'style')?.html || ''));

// review: the Animations middle button says Follow Windows on Windows and Follow the system elsewhere, on both pages
{
  const sp = fs.readFileSync(new URL('../public/style-page.js', import.meta.url), 'utf8');
  check('Style page: "Follow Windows" only on Windows, "Follow the system" elsewhere', /settings\.platform === 'win32' \? 'Follow Windows' : 'Follow the system'/.test(sp));
}
// 1.5.202: the cube's One colour starts as the theme's accent (on Moondust #03666d, RGB 3, 102, 109, the owner's pick)
// until the person picks their own; the thinking cube turns slowly by default; the lines have a brightness slider
{
  const wv = read('public/watch-view.js'), mc = read('public/mind-cube.js'), wj = read('public/watch.js'), th = read('public/themes.js');
  check('Moondust gives the One colour #03666d', findTheme('moondust')?.cube === '#03666d' && findTheme('slate')?.cube === '#03666d');
  check('every theme sets --cube: its own cube colour, else its accent', /setProperty\('--cube', HEX\.test\(t\.cube \|\| ''\) \? t\.cube : c\.accent\)/.test(th));
  check('only Moondust and the lamps override their accent for the cube', PRESETS.filter((x) => x.cube).map((x) => x.id).join() === 'moondust,mercury,sodium,thallium,neon');
  const ix = read('public/index.html'), wh = read('public/watch.html');
  check('the thinking cube turns by default, at the slowest speed, and never while animations are off', /const SPIN = 0\.05;/.test(mc) && /let turning = !avatar; try \{ if \(!avatar\) turning = localStorage\.getItem\('bob-cube-spin'\) !== '0'/.test(mc) && /still\(\) \|\| \(!rec && !shell\)/.test(mc) && /min="0\.05"/.test(wh.match(/id="watchSpinSpeed"[^>]*/)?.[0] || ''));
  check('a brightness slider for the lines, in the thinking pane and the big viewer, shared', /id="mindCubeLines"/.test(ix) && /id="watchLines"/.test(wh) && /bob-fnri-lines/.test(mc) && /bob-fnri-lines/.test(wj));
  check('the lines are drawn plainly in the theme\'s text colour, much brighter than before', /ctx\.globalAlpha = 0\.7 \* lines \* \(fog \? [^;]+\); ctx\.strokeStyle = k\.text/.test(wv) && !/Math\.min\(0\.08, 0\.045/.test(wv));
  check('the person\'s own pick always wins over the theme', /monoColour \|\| themeColour\(\) \|\| lookOf\(0\)\[0\]/.test(wv));
  check('the colour boxes show the theme colour until a pick is saved', /const tint = \(\) => \{ if \(ownColour\) return; if \(colour\) colour\.value = view\.oneColour\(\); \}/.test(mc) && /\$\('watchMonoColour'\)\.value = view\.oneColour\(\)/.test(wj));
  check('the second block only gets a colour the person picked', /monoColour: monoPicked \? \$\('watchMonoColour'\)\.value : ''/.test(wj));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
