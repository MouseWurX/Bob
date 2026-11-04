// 1.5.56 Tips: explanations sit behind ⓘ and show on hover, keyboard focus and tap; warnings stay written out.
import fs from 'node:fs';
import { tip, noteOrTip, mustShow } from '../public/tips.js';

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const js = read('public/tips.js'), css = read('public/style.css'), app = read('public/app.js'), help = read('public/help-content.js');

check('tip() makes a real button with a name for screen readers', /^<button type="button" class="tip-i" aria-label="About Web search"/.test(tip('x', 'Web search')));
check('an empty tip makes nothing', tip('') === '');
check('warnings, errors, buttons and live values stay visible', ['<span class="tag warn">x</span>', '<p class="error">x</p>', '⚠ x', '<button>x</button>', 'Right now: x'].every(mustShow) && /<br><span class="muted">/.test(noteOrTip('⚠ careful')));
check('a plain explanation moves behind ⓘ', /class="tip-i"/.test(noteOrTip('Off unless you turn it on.', 'Launch Bob on start-up')));
check('the bubble opens on hover, on keyboard focus and on tap or press-and-hold', /'pointerover'/.test(js) && /'focusin'/.test(js) && /:focus-visible/.test(js) && /closest\('\.tip-i'\)/.test(js) && /holdTimer = setTimeout/.test(js));
check('Esc closes the bubble; it is a role=tooltip linked with aria-describedby', /e\.key === 'Escape'/.test(js) && /role', 'tooltip'/.test(js) && /aria-describedby/.test(js));
check('old title text becomes a tip that works with the keyboard', /removeAttribute\('title'\)/.test(js) && /setAttribute\('data-tip'/.test(js));
check('the bubble shows above pop-up pages (inside an open dialog)', /closest\('dialog\[open\]'\)/.test(js));
check('the app installs tips at start', /installTips\(\);/.test(app));
check('ⓘ has at least 32 px to aim at and reads in High Contrast', /button\.tip-i, \.cellar button\.tip-i \{[^}]*width: 32px; height: 32px/.test(css) && /forced-colors: active\) \{ \.tip-bubble/.test(css));
check('Help explains the ⓘ buttons (around, glossary, FAQ)', /The little ⓘ buttons/.test(help) && /<dt>Tip \(ⓘ\)<\/dt>/.test(help) && /id: 'faq-tips'/.test(help));
check('what goes online and changed defaults stay written out (web search, Keep chatting while Bob is busy, reviewer beside)', ['webSearch', 'chatWhileBusy', 'mootBeside'].every((k) => new RegExp(`sswitch\\('${k}'[^\\n]*keep\\('`).test(read('public/cellar.js'))));
check('Gaming lock on Effort stays written out', /hint\.textContent = locked \? GAMING_HINT/.test(read('public/effort.js')));
check('privacy and safety notes stay written out (Borrow a brain, phone access, working without asking)', /<strong>Borrow a brain<\/strong><br><span class="muted">/.test(read('public/share-brains.js')) && /<strong>Let my other devices in<\/strong><br><span class="muted">/.test(read('public/phone-access.js')) && /<strong>Let Bob work without asking<\/strong>[^\n]*<br><span class="muted">No approval cards/.test(read('public/hands.js')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
