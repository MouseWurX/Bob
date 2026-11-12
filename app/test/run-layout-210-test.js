// 1.5.210 (UX item B): one status chip, the menu in four groups, a bottom bar on phones, an empty Tasks list that
// explains itself, and three accessibility fixes. Display only: nothing here may reach the brain.
import fs from 'node:fs';
import { onSwitches, PHONE_MAX } from '../public/status-chip.js';
import { emptyTasks, TASK_EXAMPLE } from '../public/lists.js';
import { cubeState } from '../public/mind-cube.js';
import { PRESETS, fullColors } from '../public/themes.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = read('public/index.html'), css = read('public/style.css'), chip = read('public/status-chip.js'), help = read('public/help-content.js');

// ---- the header: one chip ----
const ctx = html.slice(html.indexOf('<div class="ctx">'), html.indexOf('<dialog id="cellar"'));
const bar = ctx.slice(ctx.indexOf('id="brainBar"'), ctx.indexOf('id="dlbar"'));
const pop = bar.slice(bar.indexOf('id="brainPop"'));
const outside = bar.slice(0, bar.indexOf('id="brainPop"'));
check('the five quick switches sit inside the chip\'s panel', ['brainFree', 'handsBtn', 'freeBtn', 'screenBtn', 'mindBtn', 'freeAsk'].every((id) => pop.includes(`id="${id}"`)));
check('…and only the chip (plus the Stop Hands button) is outside it', (outside.match(/<button /g) || []).length === 2 && /id="brainPill"/.test(outside) && /id="handsQuick"[^>]*hidden/.test(outside));
check('the chip says which switches are on, in icons and in words', /id="statusOn"/.test(outside) && onSwitches({ hands: 'ready', free: true, screen: true }).map((x) => x.icon).join('') === '✋🔓🖥' && onSwitches({}).length === 0 && onSwitches({ hands: 'stopped' })[0].words === 'Hands stopped');
check('✋ Stop Hands shows only while Hands can act, and presses the real switch', /quick\.hidden = st !== 'ready'/.test(chip) && /quick\.onclick = \(\) => hands\.click\(\)/.test(chip));
check('turning on Autonomy opens the panel so its question is seen', /if \(!ask\.hidden && pop\.hidden\)/.test(chip));
check('the brain words go in their own line in the panel', /popText\.textContent = title/.test(read('public/brain-bar.js')) && !/pop\.textContent = /.test(read('public/brain-bar.js')));

// ---- the menu in four groups ----
const side = html.slice(html.indexOf('<nav id="side"'), html.indexOf('</nav>'));
const heads = [...side.matchAll(/class="nav-head">([^<]+)</g)].map((m) => m[1]);
check('the menu has the groups Chat, Play, Lab, Setup', heads.join(',') === 'Chat,Play,Lab,Setup', heads.join(','));
const order = [...side.matchAll(/<button id="(\w+)"/g)].map((m) => m[1]);
const at = (id) => order.indexOf(id);
check('…Play holds Adventure and Games, Setup holds Get models, Downloads and Tidy up', at('gamesBtn') < at('labBtn') && at('labBtn') < at('cellarBtn') && at('cellarBtn') < at('dlBtn') && at('dlBtn') < at('tidyBtn') && at('tidyBtn') < at('settingsBtn') && at('adventureBtn') > at('shelfBtn'));
check('the Lab heading hides with the Lab button, folded headings are thin lines', /\.nav-head:has\(\+ #labBtn\[hidden\]\) \{ display: none; \}/.test(css) && /body\.left-folded \.nav-head \{ display: block; height: 1px;/.test(css));

// ---- the bottom bar ----
const bb = html.slice(html.indexOf('<nav id="bottomBar"'), html.indexOf('</nav>', html.indexOf('<nav id="bottomBar"')));
const goes = [...bb.matchAll(/data-go="(\w+)"/g)].map((m) => m[1]);
check('the bottom bar has 5 items plus More', goes.join(',') === 'chatBtn,newchat,tasksBtn,topicsBtn,settingsBtn' && /id="moreBtn"[^>]*aria-expanded="false"[^>]*aria-controls="side"/.test(bb), goes.join(','));
check('…each one presses a real menu button', goes.every((id) => side.includes(`id="${id}"`)));
check('…and it shows only at phone width, the same width the code uses', PHONE_MAX === 640 && /\.bottom-bar \{ display: none; \}\n@media \(max-width: 640px\) \{\n  \.bottom-bar \{ display: flex;/.test(css));
check('on a phone the menu is a sheet and the typing box takes the whole width', /body\.left-folded \.side \{ display: none; \}/.test(css) && /\.composer > textarea \{ order: -1; flex: 1 1 100%;/.test(css));
check('the sheet closes on Escape, a tap outside, or a pick', /e\.key === 'Escape' && sheetOpen\(\)/.test(chip) && /pointerdown[\s\S]{0,80}sheetOpen\(\) && !e\.target\.closest\('#side, #moreBtn'\)/.test(chip));

// ---- Tasks ----
check('an empty Tasks list says what a task is and gives one to try', /A task is anything you ask Bob to do/.test(emptyTasks('open')) && emptyTasks('open').includes(TASK_EXAMPLE) && /data-try/.test(emptyTasks('all')) && !/Nothing here\./.test(read('public/lists.js')));
check('…the other tabs get their own short line', /Nothing finished yet/.test(emptyTasks('completed')) && /Nothing stopped or failed/.test(emptyTasks('problems')) && /Nothing waiting/.test(emptyTasks('open', 3)));

// ---- accessibility ----
const lum = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const low = PRESETS.map((t) => [t.id, fullColors(t)]).filter(([, c]) => ratio(c.muted, c.panel) < 4.5 || ratio(c.muted, c.card) < 4.5).map(([id]) => id);
check('Off badges are quiet words on the panel itself, at least 4.5 to 1 in every theme', !low.length && /\.brain-switch \.st, \.nav-item \.st, \.tb \.st, \.pill-switch \.st \{ background: transparent; color: var\(--muted\)/.test(css), low.join(','));
check('no dimmed Hands chip, and the version line isn\'t see-through', /hands-btn\[data-state="settings-off"\] \{ opacity: 1;/.test(css) && /\.ver \{ opacity: 1; color: var\(--muted\); \}/.test(css));
check('keyboard: the switches come right after the chip, the bar after the message box', html.indexOf('id="brainPill"') < html.indexOf('id="brainFree"') && html.indexOf('id="composer"') < html.indexOf('id="bottomBar"') && /\.bar-item:focus-visible \{ outline/.test(css) || /\.bar-item:focus-visible/.test(css));
check('the cube tells a screen reader its state once per change, not every word', /<p id="mindCubeSays" class="muted"><\/p><p id="mindCubeState" class="sr-only" role="status"/.test(html)
  && cubeState({ empty: true }) === 'Bob\'s brain cube: no brain loaded.' && cubeState({ shell: { label: 'Riker' }, phase: 'wait' }) === 'Bob\'s brain cube (Riker): thinking.'
  && cubeState({ shell: { label: 'Riker' }, loadingNow: 'Riker' }) === 'Bob\'s brain cube (Riker): loading.' && cubeState({ shell: { label: 'Riker' } }) === 'Bob\'s brain cube (Riker): ready.');

// ---- the pages on the Lamplight frame (Settings, Get models, Tasks, Downloads, Tidy up, Help) ----
const pages = css.slice(css.indexOf('1.5.210 pages (item B)'));
check('my pages build on the shared frame with page-scoped rules only, and no colours of their own', css.includes('1.5.210 pages (item B)') && !/#[0-9a-f]{3,6}\b/i.test(pages) && /body\.look-lamplight \.set-card \{/.test(pages) && /body\.look-lamplight \.cellar-tabs \[role="tab"\]\[aria-selected="true"\]/.test(pages) && /body\.look-lamplight \.ttabs \[data-f\]\[aria-pressed="true"\]/.test(pages) && /body\.look-lamplight \.help-cols \{ grid-template-columns: 240px minmax\(0, 72ch\)/.test(pages));
check('Settings in its own window fills it, Help gets the wide column', /html\.settings-window body\.look-lamplight \.cellar\.page\[open\] \{ inset: 0; \}/.test(pages) && /<dialog id="help" class="cellar wide"/.test(html) && /<dialog id="help" class="cellar wide"/.test(read('public/settings.html')));
check('an empty Downloads list opens Get models instead of pointing at a menu that may not be there', /data-getmodels>Open Get models<\/button>/.test(read('public/lists.js')) && !/Get models in the left menu/.test(read('public/lists.js')));

// ---- nothing reaches the brain ----
check('the new module talks to no server', !/fetch\(|post\(|\/api\//.test(chip));

// ---- Help ----
check('Help, the glossary and the FAQ say where things are now', /<dt>Brain label \(status chip\)<\/dt>/.test(help) && /<dt>Bottom bar<\/dt>/.test(help) && /id: 'faq-switches-moved'/.test(help) && /id: 'faq-phone-layout'/.test(help) && /<em>Play<\/em>: Adventure and Games/.test(help) && !/<\/strong> at the top of the chat/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
