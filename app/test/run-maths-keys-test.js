// "Show maths as formulas" and "Keyboard shortcuts" (Nov 2026). Maths: formulas a brain writes in LaTeX are found
// (public/math-core.js, shared with the phone app) and drawn by KaTeX, bundled in vendor/katex/. Keys: one list
// (public/shortcuts.js) for the pop-up, Help and the matching. Both off unless turned on. Nothing reads the real
// computer: key presses and the drawing function are passed in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { renderRich } from '../public/rich.js';
import { SHORTCUTS, match, listHtml, macKeys } from '../public/shortcuts.js';
import { WANTS } from '../public/wants.js';
import { HELP } from '../public/help-content.js';
import '../public/math-core.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const M = globalThis.BobMath;

// ---------- Finding formulas ----------
const kinds = (t) => M.find(t).map((p) => (p.tex == null ? 'T' : p.display ? 'D' : 'I')).join('');
check('$...$ in a sentence is a formula', kinds('Area is $\\pi r^2$ here') === 'TIT');
check('prices stay prices', kinds('It costs $5 and $10 today') === 'T' && kinds('Pay $20, or $30.') === 'T');
check('$$...$$ is a formula on its own line, even over several lines', kinds('Sum:\n$$\n\\sum_{i=1}^n i\n$$\nDone') === 'TDT');
check('\\( \\) and \\[ \\] work too', kinds('see \\(x+1\\) and \\[y=2\\]') === 'TITD');
check('inline code is left alone', kinds('type `$x$` to get it') === 'T');
check('\\$ is a plain dollar sign', M.find('a \\$5 tip')[0].text === 'a $5 tip');
check('an unclosed $ is just text', kinds('only $x here') === 'T');
check('a formula ending before a digit is not one ($ before 2)', kinds('from $a to $2') === 'T');
check('the TeX is handed over without its fences', M.find('$$ \\frac{a}{b} $$')[0].tex === '\\frac{a}{b}');

// ---------- Drawing (rich.js), with a fake KaTeX ----------
const fake = { renderToString: (tex, o) => { if (tex.includes('BAD')) throw new Error('parse'); return `<k data-d="${o.displayMode}" data-out="${o.output}" data-trust="${o.trust}">${tex.replace(/</g, '&lt;')}</k>`; } };
const draw = (tex, display) => M.html(tex, display, fake);
const out = renderRich('Half is $\\frac{1}{2}$ and **bold** with $a*b*c$ there', { math: draw }).html;
check('a formula is drawn in place', /<span class="math"><k data-d="false"[^>]*>\\frac\{1\}\{2\}<\/k><\/span>/.test(out), out);
check('stars inside a formula don\'t become italics', out.includes('a*b*c') && !/<em>b<\/em>/.test(out), out);
check('the rest of the message still gets bold', out.includes('<strong>bold</strong>'));
check('a display formula is a block', renderRich('$$x^2$$', { math: draw }).html.startsWith('<div class="math-block">'));
check('code boxes are never drawn', !renderRich('```\n$x$\n```', { math: draw }).html.includes('<k'));
check('a formula KaTeX can\'t read shows as written, escaped, never an error', /<code class="math-bad"[^>]*>\$BAD&lt;b&gt;\$<\/code>/.test(renderRich('$BAD<b>$', { math: draw }).html));
check('trust is off (no links or pictures from a formula)', out.includes('data-trust="false"'));
check('the PC keeps KaTeX\'s own look', out.includes('data-out="htmlAndMathml"'));
check('the phone uses MathML (its page allows no inline styles)', M.html('x', false, fake, 'mathml').includes('data-out="mathml"'));
check('with the switch off nothing is drawn: the text stays as written', renderRich('Area $\\pi r^2$').html === 'Area $\\pi r^2$');
M.setOn(true);
check('switched on but KaTeX not loaded: still as written', M.renderer() === null && renderRich('$x$').html === '$x$');
M.setOn(false);
check('HTML in a message is still escaped with maths on', !renderRich('<img src=x> $y$', { math: draw }).html.includes('<img'));

// ---------- The real KaTeX bundle ----------
const kdir = 'public/vendor/katex';
const css = read(`${kdir}/katex.min.css`);
const fonts = [...css.matchAll(/url\((fonts\/[^)]+)\)/g)].map((m) => m[1]);
check('KaTeX is bundled with its licence', fs.existsSync(path.join(root, kdir, 'katex.min.js')) && /MIT/.test(read(`${kdir}/katex-LICENSE.txt`)));
check('every font the stylesheet names is there, and only woff2', fonts.length >= 15 && fonts.every((f) => f.endsWith('.woff2') && fs.existsSync(path.join(root, kdir, f))), fonts.filter((f) => !fs.existsSync(path.join(root, kdir, f))).join());
check('nothing in it points online', !/https?:\/\//.test(css));
check('THIRD-PARTY.md names KaTeX', /KaTeX 0\.19\.1/.test(read('docs/legal/THIRD-PARTY.md')));
const www = 'android/app/src/main/assets/www';
check('the phone app has the same math-core.js, word for word', read('public/math-core.js') === read(`${www}/math-core.js`));
check('the phone app has the same KaTeX', fs.readFileSync(path.join(root, kdir, 'katex.min.js')).equals(fs.readFileSync(path.join(root, www, 'vendor/katex/katex.min.js'))) && read(`${kdir}/katex.min.css`) === read(`${www}/vendor/katex/katex.min.css`));
check('the phone page loads math-core.js and has the switch', /<script src="math-core\.js"><\/script>/.test(read(`${www}/index.html`)) && /id="math-view"/.test(read(`${www}/index.html`)));
globalThis.BobLogic || await import(`../${www}/logic.js`);
const ph = globalThis.BobLogic.markdown('Half: $\\frac12$ and *it*\n$$x^2$$', { math: draw });
check('the phone\'s replies draw formulas too', ph.includes('<span class="math"><k') && ph.includes('<div class="math-block">') && ph.includes('<em>it</em>'), ph);
check('the phone with maths off is unchanged', globalThis.BobLogic.markdown('$x$') === '<p>$x$</p>');

// ---------- Keys ----------
const key = (k, mods = {}) => ({ key: k, code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
check('Ctrl+Shift+O starts a new chat', match(key('O', { ctrlKey: true, shiftKey: true })) === 'newChat');
check('on a Mac it\'s Cmd, and Ctrl does nothing', match(key('o', { metaKey: true, shiftKey: true }), { mac: true }) === 'newChat' && match(key('o', { ctrlKey: true, shiftKey: true }), { mac: true }) === '');
check('Ctrl+K searches', match(key('k', { ctrlKey: true })) === 'search');
check('Ctrl+Shift+S opens the Session list', match(key('S', { ctrlKey: true, shiftKey: true })) === 'session');
check('Ctrl+, opens Settings and Ctrl+/ the list', match(key(',', { ctrlKey: true })) === 'settings' && match(key('/', { ctrlKey: true })) === 'list');
check('Ctrl+Shift+; copies the last reply (also as : on a keyboard that sends it)', match(key(':', { ctrlKey: true, shiftKey: true })) === 'copyReply');
check('Esc stops Bob only in the message box while he works', match(key('Escape'), { inInput: true, busy: true }) === 'stop' && match(key('Escape'), { inInput: true, busy: false }) === '' && match(key('Escape'), { inInput: false, busy: true }) === '');
check('Esc with a pop-up open closes the pop-up, not Bob', match(key('Escape'), { inInput: true, busy: true, dialog: true }) === '');
check('/ goes to the message box, but types a / while you type', match(key('/'), { typing: false }) === 'focus' && match(key('/'), { typing: true }) === '');
check('Up brings back the last message only in an empty box', match(key('ArrowUp'), { inInput: true, empty: true }) === 'lastMsg' && match(key('ArrowUp'), { inInput: true, empty: false }) === '');
check('Alt combinations and plain letters are left alone', match(key('k', { ctrlKey: true, altKey: true })) === '' && match(key('k')) === '');
check('the old ones (Ctrl+B, Ctrl+J) aren\'t taken over', match(key('b', { ctrlKey: true })) === '' && match(key('j', { ctrlKey: true })) === '');
check('typing in another language (composing) is left alone', match({ ...key('k', { ctrlKey: true }), isComposing: true }) === '');
check('every switchable shortcut has a match', SHORTCUTS.filter((s) => !s.always).every((s) => ['newChat', 'stop', 'search', 'session', 'focus', 'lastMsg', 'copyReply', 'settings', 'list'].includes(s.id)));
check('the list shows Mac keys on a Mac', listHtml({ mac: true }).includes('⌘⇧O') && macKeys('Ctrl+K') === '⌘K');
check('the list says whether the switch is on', listHtml({ on: false }).includes('Off: Settings, Bob himself, Keyboard shortcuts') && listHtml({ on: true }).includes('On: '));
const app = publicText('app.js');
check('the main window wires the keys and the list', /installShortcuts\(\{/.test(app) && /bob-shortcuts/.test(app) && /data-help-shortcuts/.test(read('public/help.js')));

// ---------- Settings, Welcome list, Help ----------
check('both are settings, off by default', SETTING_KEYS.includes('mathView') && SETTING_KEYS.includes('shortcuts') && mergeSettings({}, { mathView: 'yes', shortcuts: 1 }).mathView === false && mergeSettings({}, { shortcuts: 1 }).shortcuts === false);
check('both save when turned on', mergeSettings({}, { mathView: true }).mathView === true && mergeSettings({}, { shortcuts: true }).shortcuts === true);
const cellar = publicText('cellar.js');
check('both switches are in Settings, Bob himself, drawn all the time', /sswitch\('mathView', settings\.mathView === true, 'Show maths as formulas'/.test(cellar) && /sswitch\('shortcuts', settings\.shortcuts === true, 'Keyboard shortcuts'/.test(cellar));
check('both are on the Welcome\'s Do you want me to list', ['mathView', 'shortcuts'].every((k) => WANTS.some((w) => w.key === k && w.card === 'bob')));
const help = (id) => HELP.find((h) => h.id === id);
check('Help has Maths as formulas and the FAQ', help('maths')?.html.includes('Show maths as formulas') && help('faq-maths') && help('faq-keys'));
check('Help\'s shortcut page lists every shortcut', SHORTCUTS.every((s) => help('keys').html.includes(s.keys.replace(';', ';'))), SHORTCUTS.filter((s) => !help('keys').html.includes(s.keys)).map((s) => s.keys).join());
check('Help says where they don\'t work (no keys in the Android app)', /Android app has no keyboard shortcuts/.test(help('keys').html));
check('the glossary has KaTeX, LaTeX and Keyboard shortcuts', ['<dt>KaTeX</dt>', '<dt>LaTeX</dt>', '<dt>Keyboard shortcuts</dt>'].every((t) => help('glossary').html.includes(t)));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
