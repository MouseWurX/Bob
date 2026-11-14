// 1.5.94 "Minimise to tray" and "Use Bob's look as his icon": the icon is drawn from the avatar (any look, including
// one built from parts), the tray menu always has a clear way to close Bob fully, and the brain hands both to the window.
// 1.5.134: both switches are ON unless turned off (the owner asked for Bob in the tray and his look on the taskbar).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { lookPng, lookPixels, windowState, applyWindowState, lampPng, lampIcon } from '../src/app-icon.js';
import { mergeSettings, newDefaults, NEW_DEFAULTS } from '../src/config.js';
import { getLook } from '../public/bob-sprite.js';
import { HELP } from '../public/help-content.js';
import { settingsNow } from '../src/self-help.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- the picture ----
function decode(png) {
  const sig = png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  let off = 8, w = 0, h = 0, idat = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off), type = png.toString('ascii', off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  return { sig, w, h, raw: zlib.inflateSync(Buffer.concat(idat)) };
}
{
  for (const size of [16, 24, 32, 256]) {
    const d = decode(lookPng('sysop', size));
    check(`a ${size}px icon is a real PNG of that size`, d.sig && d.w === size && d.h === size && d.raw.length === (size * 4 + 1) * size);
  }
  const look = getLook('robot-3');
  const px = lookPixels('robot-3', 16);
  let same = true;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const ch = look.map[y][x], a = px[(y * 16 + x) * 4 + 3];
    if ((ch === '.') !== (a === 0)) same = false;
  }
  check('the 16px icon is the avatar map pixel for pixel, clear where the map is empty', same);
  const big = lookPixels('m-4', 32), small = lookPixels('m-4', 16);
  check('bigger sizes are the same pixels in blocks (stays crisp)', [0, 5, 9, 15].every((y) => [0, 4, 8, 12].every((x) => big.readUInt32BE(((y * 2) * 32 + x * 2) * 4) === small.readUInt32BE((y * 16 + x) * 4))));
  check('two different looks give two different icons', !lookPng('sysop', 32).equals(lookPng('alien-2', 32)));
  check('an unknown look falls back to Bob\'s usual look', lookPng('nope-99', 32).equals(lookPng('sysop', 32)));
}

// ---- the switches ----
{
  check('the tray starts on and the look-as-icon switch off (1.5.228): the icon is the Mercury tesseract', windowState({}).tray === true && windowState({}).lookIcon === false && windowState({}).lamp === 'mercury' && windowState({}).icons !== null && windowState({}).icons[32].equals(lampPng('mercury', '32')));
  check('the tesseract comes in every size the window asks for, plus the padded Mac one', [16, 24, 32, 48, 256, 'mac'].every((n) => Buffer.isBuffer(windowState({}).icons[n])));
  check('the icon follows the lamp, in any look; an unknown lamp is Mercury', ['mercury', 'sodium', 'thallium', 'neon'].every((l) => windowState({ style: { lamp: l, look: 'terminal' } }).icons[256].equals(lampPng(l, '256'))) && !lampPng('sodium', '32').equals(lampPng('neon', '32')) && windowState({ style: { lamp: 'plaid' } }).lamp === 'mercury' && lampIcon(undefined) === 'mercury');
  check('a missing picture leaves the window on its own icon file, never half a set', windowState({}, { lampDir: '/nowhere-' + Date.now() }).icons === null);
  check('the tray dot sits on the tesseract too', ['16', '24', '32'].every((n) => windowState({ trayDot: true, style: { lamp: 'neon' } }).dotIcons[n].equals(lampPng('neon', 'dot-' + n))));
  check('only false turns them off when saved', mergeSettings({}, { tray: false, lookIcon: false }).tray === false && mergeSettings({}, { tray: false, lookIcon: false }).lookIcon === false && mergeSettings({}, { tray: 'no', lookIcon: 0 }).tray === true && mergeSettings({}, { tray: 'no', lookIcon: 0 }).lookIcon === true);
  {
    const old = { lookIcon: true, tray: false };
    const first = newDefaults(old);
    check('1.5.230: an icon picked before the tesseract is dropped once, so the update shows everyone the new icon', first === true && !('lookIcon' in old) && old.tray === false && old.defaultsSeen.includes('tesseract-icon'));
    const later = { lookIcon: true, defaultsSeen: NEW_DEFAULTS.map((d) => d.id) };
    check('a pick made after that update is kept, and nothing is written again', newDefaults(later) === false && later.lookIcon === true);
    const scut = { share: { scut: true, scutMbps: 100, scutMbpsChosen: true, lend: true }, defaultsSeen: ['tesseract-icon'] };
    check('Nov 14: an old SCUT cap is dropped once so Auto (400) reaches everyone; the rest of share stays', newDefaults(scut) === true && !('scutMbps' in scut.share) && !('scutMbpsChosen' in scut.share) && scut.share.scut === true && scut.share.lend === true && scut.defaultsSeen.includes('scut-400'));
    check('a settings file with no share group is fine', (() => { const o = { defaultsSeen: ['tesseract-icon'] }; return newDefaults(o) === true && !('share' in o); })());
    check('every new default names its id and the keys it resets', NEW_DEFAULTS.every((d) => typeof d.id === 'string' && d.keys.length > 0));
    check('Bob drops old picks when he reads settings.json, before using them', /if \(newDefaults\(kept\)\)[^\n]*\n\s*try \{ mergeSettings\(cfg, kept\);/.test(read('src/config.js')));
  }
  check('only a saved switch puts the look on the icon', windowState({ lookIcon: true }).icons[32].equals(lookPng('sysop', 32)) && windowState({ lookIcon: 'yes' }).lookIcon === false);
  check('turned off, the tray goes and the icon is the tesseract', windowState({ tray: false, lookIcon: false }).icons[32].equals(lampPng('mercury', '32')) && windowState({ tray: false, lookIcon: false }).tray === false);
  const own = windowState({ look: 'c:m.regular.0.short.1.1.none.0.tee.0.none.none.none' });
  check('a look built from parts (the character screen) becomes the icon too', own.lookName === 'Your own design' && own.icons && !own.icons[32].equals(lookPng('sysop', 32)));
  const st = windowState({ lookIcon: true, look: 'pc-2' });
  check('with the look as his icon, the window gets every size it asks for', st.icons && [16, 24, 32, 48, 256].every((n) => Buffer.isBuffer(st.icons[n])));
  check('icons follow the look', windowState({ lookIcon: true, look: 'odd-1' }).icons[32].equals(lookPng('odd-1', 32)));
  let got = null;
  globalThis.bobWindow = { apply: (s) => { got = s; } };
  applyWindowState({ tray: true, lookIcon: false });
  check('the brain hands the switches to the window program', got && got.tray === true && got.lookIcon === false);
  globalThis.bobWindow = { apply: () => { throw new Error('boom'); } };
  let threw = false; try { applyWindowState({}); } catch { threw = true; }
  check('a window-program hiccup never breaks saving settings', !threw);
  delete globalThis.bobWindow;
  check('in a browser (no window program) it does nothing', (() => { try { applyWindowState({ tray: true }); return true; } catch { return false; } })());
  const now = String(settingsNow({ lookIcon: false }));
  check('Bob can read both switches in his own settings', /Minimise to tray: on/i.test(now) && /Use Bob's look as his icon: off/i.test(now));
}

// ---- the window program ----
{
  const main = read('electron/main.cjs');
  check('the tray menu has Show Bob and a plain Quit Bob that closes him fully', /label: 'Show Bob'/.test(main) && /label: 'Quit Bob \(closes him fully\)'/.test(main));
  check('Quit Bob really quits (not hide)', /Quit Bob \(closes him fully\)', click: \(\) => \{ quitting = true; app\.quit\(\); \}/.test(main));
  check('the X only hides him while the tray switch is on and the tray exists', /if \(quitting \|\| !winState\.tray \|\| !tray \|\| !win\) return false;/.test(main) && /win\.on\('close', \(e\) => \{ tuckAway\(e\); \}\)/.test(main));
  check('quitting for an update (before-quit) is never blocked by the tray', /app\.on\('before-quit', \(\) => \{ quitting = true; \}\)/.test(main));
  check('Linux: the tray hint says how to bring him back when there is no tray icon', /If you don't see a tray icon, open Bob again from your apps menu to bring him back\./.test(main) && /!MAC && process\.platform !== 'win32'/.test(main));
  check('started hidden at sign-in, the tray icon is always there', /const wantTray = \(\) => winState\.tray \|\| STARTED_HIDDEN;/.test(main));
  check('the first trip to the tray says where he went and how to quit, once ever', /tray-hint-shown/.test(main) && /pick Quit Bob/.test(main));
  check('opening Bob again brings his window back', /app\.on\('second-instance', showBob\)/.test(main));
  const server = read('src/server.js');
  check('saving tray, icon, look or lamp updates the window at once', /if \('tray' in b \|\| 'lookIcon' in b \|\| 'look' in b \|\| 'style' in b\) applyWindowState\(cfg\);/.test(server));
  check('the window gets the switches at start-up', /applyWindowState\(cfg\); \/\/ 1\.5\.94/.test(server));
}

// ---- Settings and Help ----
{
  const cellar = publicText('cellar.js');
  check('Settings has both switches: the tray on, the look-as-icon off unless switched on', /sswitch\('tray', settings\.tray !== false, 'Minimise to tray', `/.test(cellar) && /sswitch\('lookIcon', settings\.lookIcon === true, 'Use Bob\\'s look as his icon', `/.test(cellar));
  check('the icon note says a pinned taskbar shortcut is the one thing that may not follow', /pinned to the taskbar may keep the usual icon/.test(cellar));
  check('the tray note says how to close him fully', /pick <strong>Quit Bob<\/strong>/.test(cellar));
  const topic = HELP.find((e) => e.id === 'tray');
  check('Help has a tray topic covering quitting, Mac and Linux', topic && /Quit Bob \(closes him fully\)/.test(topic.html) && /menu bar/.test(topic.html) && /Linux/.test(topic.html));
  check('the FAQ answers "why is he still running" and the icon question', ['faq-tray-quit', 'faq-tray-icon'].every((id) => HELP.some((e) => e.id === id && e.group === 'FAQ')));
  const faqIcon = HELP.find((e) => e.id === 'faq-tray-icon').html;
  check('the icon FAQ says it follows a saved look, names the pinned-shortcut catch and the phone app', /redraw the moment you save/.test(faqIcon) && /pinned/.test(faqIcon) && /Android/.test(faqIcon));
  check('the tray topic says which switch starts on, names the tesseract and covers the phone', /<strong>Minimise to tray<\/strong> is on unless you turn it off; <strong>Use Bob's look as his icon<\/strong> is off unless you turn it on/.test(topic.html) && /tesseract/.test(topic.html) && /Android doesn't let an app redraw its own icon/.test(topic.html));
  check('the glossary explains the tray, the taskbar icon and the tesseract', /<dt>Tray<\/dt>/.test(HELP.find((e) => e.id === 'glossary').html) && /<dt>Taskbar icon<\/dt>/.test(HELP.find((e) => e.id === 'glossary').html) && /<dt>Tesseract<\/dt>/.test(HELP.find((e) => e.id === 'glossary').html));
  const faqTess = HELP.find((e) => e.id === 'faq-icon-tesseract');
  check('the FAQ says what the tesseract is, that it follows the lamp, and what stays Mercury', faqTess && faqTess.group === 'FAQ' && /optical illusion/.test(faqTess.html) && /Mercury/.test(faqTess.html) && /phone app/.test(faqTess.html));
  const inv = read('docs/SETTINGS-INVENTORY.md');
  check('the settings inventory lists the tray on and the look-as-icon off', /\| Minimise to tray \| On unless.*\| On \(was Off/.test(inv) && /\| Use Bob's look as his icon \| Off unless.*\| Off \(was On from 1\.5\.134/.test(inv));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
