// 1.5.117: the second settings-layout pass (bob-design/settings-layout-review-2.md).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanHands, readOnlyRoots, LIMITS } from '../src/hands-settings.js';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ui = read('public/cellar.js'), hands = read('public/hands.js'), css = read('public/style.css'), share = read('public/share-brains.js'), help = read('public/help-content.js');

// 7. Updates first, closed, Check for updates on its line.
const every = ui.slice(ui.indexOf('function everydayHtml'), ui.indexOf('function macRemoveHtml'));
const order = [...every.matchAll(/panel\('(ev-[a-z]+)'/g)].map((m) => m[1]);
check('Everyday order: updates first, then Bob himself, How Bob works, then the extras', order.join(',') === 'ev-pc,ev-bob,ev-how', order.join(','));
const extras = [...ui.slice(ui.indexOf('const EVERY_EXTRA'), ui.indexOf('function everydayHtml')).matchAll(/\['(ev-[a-z]+)'/g)].map((m) => m[1]);
check('…Projects, Bob\'s home folder, Where Bob saves things, How-tos', extras.join(',') === 'ev-projects,ev-home,ev-save,ev-howtos', extras.join(','));
check('the updates line carries the version and a working Check for updates button, and stays while open', /<button type="button" class="mini" data-checkupdate>Check for updates<\/button> <span class="update-out"><\/span>/.test(every) && /'', true\)\}\$\{panel\('ev-bob'/.test(every) && /\.spanel\[open\] \.spanel-note\.keep \{ display: block; \}/.test(css));
check('a button on a panel line never folds the panel', /if \(b\.tagName === 'BUTTON' && b\.closest\('summary'\)\) e\.preventDefault\(\);/.test(ui));
check('a waiting update reads "Bob x is ready · Restart Bob now" on that line', /function readyLine\(\)[\s\S]*is ready · <button type="button" class="mini get" data-restartnow>Restart Bob now<\/button>/.test(ui) && /readyLine\(\);/.test(ui.slice(ui.indexOf('function draw()'))));
check('the body keeps Check for updates when Bob starts and Run first-time setup, no second Check button', /sswitch\('autoCheck'/.test(every) && /data-welcome>Run first-time setup/.test(every) && (every.match(/data-checkupdate/g) || []).length === 1);
check('updates is closed to start with (only Bob himself opens)', /new Set\(\['ev-bob'\]\)/.test(ui));

// 4. Two labelled rows.
check('the page strip is two labelled rows: Get models and Set up', /class="tabs-label" aria-hidden="true">Get models:<\/span>/.test(ui) && /class="tabs-label" aria-hidden="true">Set up:<\/span>\$\{tabs\.filter\(\(c\) => setup\.has\(c\.id\)\)/.test(ui) && /const setup = new Set\(\['style', 'settings'\]\);/.test(ui) && /\.tabs \.tabs-row \{ display: flex/.test(css));

// 5. The subheadings show as headings.
check('How Bob works has its three subheadings, styled as headings inside a panel', /<h4 class="ssub">How he works<\/h4>/.test(every) && /<h4 class="ssub">Starting and closing<\/h4>/.test(every) && /<h4 class="ssub">Going online<\/h4>/.test(every) && /\.spanel-body \.ssub, \.hands-box \.ssub \{ color: inherit; font-size: 14px/.test(css));

// 1. Folds.
check('Brains: the three tables fold with the value on the line', /const fold = \(title, now, body, open = false\) => `<details class="fold"/.test(ui) && /fold\('Session brains', /.test(ui) && /fold\('How much each session keeps in mind', /.test(ui) && /return fold\('How much each brain keeps in mind', on \? 'you pick, per brain' : 'Bob picks'/.test(ui) && !/<h3>Session brains<\/h3>/.test(ui));
check('Hands: Add a connected app and the paste box only with the Hand on, under More', /\$\{on \? `<details class="more"><summary>More<\/summary>\s*<details class="mcp-add"><summary>Add a connected app<\/summary>/.test(hands) && /<details class="mcp-paste"><summary>Paste a setup from another app<\/summary>[\s\S]*?<\/details><\/details>` : ''\}<\/div>`;/.test(hands));
check('Hands: Add a recipe only with Run programs on, under More', /\$\{s\.enabled && s\.run\?\.on \? `<details class="more"><summary>More<\/summary><strong>Add a recipe<\/strong>/.test(hands) && /Turn on the Run programs Hand above to add one\./.test(hands));
check('Hands: Checks holds the sandbox, the self-test and then Quarantine', /<h4 class="ssub">Checks<\/h4>\s*\$\{sandboxRow\(v\.selfTools\)\}\s*<div class="hands-selftest">/.test(hands) && /data-hsandbox>Check the sandbox/.test(hands) && !/hands-mytools[\s\S]*?data-hsandbox/.test(hands.slice(hands.indexOf('function selfToolsHtml'), hands.indexOf('function sandboxRow'))) && /handsSettingsHtml\(\) \+ quarantineSettingsHtml\(\)/.test(ui));
check('Bob-Net: the four sharing hints are behind ⓘ, the privacy sentence stays written', /<strong>Lend my brain<\/strong> \$\{tip\(/.test(share) && /<strong>Take jobs from my other Bobs<\/strong> \$\{tip\(/.test(share) && /<strong>Borrow a brain<\/strong> \$\{tip\(/.test(share) && /<strong>Send jobs to my other Bobs<\/strong> \$\{tip\(/.test(share) && /<span class="muted keep">Each time, the chat so far and what Bob remembers about you go to that Bob \(your own replicant matrices on Tailscale only; it keeps none of it\)\.<\/span>/.test(share));

// 2. Read-only projects without config.json.
check('no config.json on screen in Hands', !/config\.json/.test(hands) && !/config\.json/.test(LIMITS.readOnly.on) && !/config\.json/.test(help.slice(help.indexOf("set('Read-only projects stay read-only'"), help.indexOf("set('Read-only projects stay read-only'") + 400)));
check('Read-only projects get a list with Remove and a Browse… / Add row', /function readOnlyHtml\(v, s\)/.test(hands) && /data-hrobrowse>Browse…<\/button><button type="button" class="mini" data-hroadd>Add<\/button>/.test(hands) && /data-hrodel="\$\{esc\(f\)\}">Remove<\/button>/.test(hands) && /Bob's own folders are always read-only\./.test(hands));
check('…Browse uses the same folder picker as Projects, Add saves through Hands settings', /'hrobrowse' in b\.dataset\) \{ const r = await post\('\/api\/pick-folder', \{\}\);/.test(hands) && /await set\(\{ readOnlyFolders: \[\.\.\.\(v\.settings\.readOnlyFolders \|\| \[\]\), f\] \}\);/.test(hands) && /if \(Array\.isArray\(b\.readOnlyFolders\)\) next\.readOnlyFolders = b\.readOnlyFolders\.filter\(\(f\) => typeof f === 'string' && isDir\(f\)\);/.test(read('src/hands-routes.js')));
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ro-'));
  const h = cleanHands({ readOnlyFolders: [dir, 'not/absolute', dir] });
  check('the list is kept (absolute paths, no doubles)', h.readOnlyFolders.length === 1 && h.readOnlyFolders[0] === dir);
  const cfg = { ownReadOnlyRoots: ['/own'], readOnlyRoots: ['/own', '/cfg-ro'], hands: { readOnlyFolders: [dir], limits: {} } };
  check('a read-only project added in Settings is read-only for every Hand', readOnlyRoots(cfg).includes(dir) && readOnlyRoots(cfg).includes('/cfg-ro') && readOnlyRoots(cfg).includes('/own'));
  check('…until the hard limit is switched off (Bob\'s own folders stay)', readOnlyRoots({ ...cfg, hands: { ...cfg.hands, limits: { readOnly: false } } }).join() === '/own');
  fs.rmSync(dir, { recursive: true, force: true });
}

// 3. The passcode button.
check('"Make a new passcode" in both states', /data-phone-newcode>Make a new passcode<\/button>/.test(read('public/phone-access.js')) && !/'Make a passcode'/.test(read('public/phone-access.js')));

// Help and the inventory follow.
check('Help says where things are now', /Checks<\/strong>: <strong>Check the sandbox<\/strong>/.test(help) && /open <strong>More<\/strong>, then <strong>Add a connected app<\/strong>/.test(help));
check('the inventory has the new rows', /Make a new passcode \(both states\)/.test(read('docs/SETTINGS-INVENTORY.md')) && /No config\.json on screen/.test(read('docs/SETTINGS-INVENTORY.md')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
