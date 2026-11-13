// The Autonomy and Screen use buttons on the chat page (public/quick-switches.js, POST /api/hands/quick).
// Autonomy = "Let Bob work without asking"; Screen use = the Apps and Browser Hands plus eyes checks. Off works from
// anywhere, on only at the PC itself, and neither button ever lifts a hard limit or undoes the ✋ Hands stop.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handsRoute } from '../src/hands-routes.js';
import { cleanHands, freeOn, handOn, LIMITS } from '../src/hands-settings.js';
import { publicText } from './source-text.js';
process.env.BOB_PLATFORM = 'win32'; // the Apps Hand is Windows-only; Screen use covers it there

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const mk = (hands) => { const cfg = { hands: cleanHands(hands), models: {} }; const logs = []; return { cfg, logs, brain: { cfg, saveHands(n) { cfg.hands = n; }, log: (_k, t) => logs.push(t) } }; };
const hit = async (x, b, isLocal = true) => {
  let out;
  await handsRoute({ req: { method: 'POST' }, p: '/api/hands/quick', isLocal, brain: x.brain, cfg: x.cfg, body: async () => b, send: (_r, code, j) => { out = { code, j }; }, res: {} });
  return out;
};

{
  let x = mk({ enabled: true });
  let r = await hit(x, { free: true });
  check('Autonomy on (at the PC) is the same switch as "Let Bob work without asking"', r.code === 200 && x.cfg.hands.free === true && freeOn(x.cfg));
  check('it is written in the logbook', x.logs.some((l) => /Autonomy.*ON/.test(l)));
  r = await hit(x, { free: false }, false);
  check('Autonomy off works from the phone too', r.code === 200 && x.cfg.hands.free === false);
  r = await hit(x, { free: true }, false);
  check('Autonomy on is refused away from the PC', r.code === 403 && x.cfg.hands.free === false);
  x = mk({ enabled: false });
  r = await hit(x, { free: true });
  check('Autonomy needs Hands on first', r.code === 409 && /Hands are off/.test(r.j.error) && x.cfg.hands.free === false);
  x = mk({ enabled: true, free: false, held: true });
  await hit(x, { free: true });
  check('Autonomy never undoes the ✋ Hands stop', x.cfg.hands.held === true && !freeOn(x.cfg));
}

{
  let x = mk({ enabled: false, files: { on: true }, eyesCheck: false, limits: { sendOut: true, passwords: true } });
  let r = await hit(x, { screen: true });
  check('Screen use on turns on Hands, Apps and the browser', r.code === 200 && handOn(x.cfg, 'apps') && handOn(x.cfg, 'browser'));
  check('and eyes checks', x.cfg.hands.eyesCheck === true);
  check('it says which other ticked Hands now work again', r.j.woke.includes('Files'));
  check('it never lifts a hard limit', Object.keys(LIMITS).every((k) => x.cfg.hands.limits[k] === true));
  check('it does not switch on Autonomy', x.cfg.hands.free === false);
  r = await hit(x, { screen: false }, false);
  check('Screen use off works from the phone and leaves the other Hands alone', r.code === 200 && !handOn(x.cfg, 'apps') && !handOn(x.cfg, 'browser') && handOn(x.cfg, 'files'));
  r = await hit(x, { screen: true }, false);
  check('Screen use on is refused away from the PC', r.code === 403 && !handOn(x.cfg, 'apps'));
  x = mk({ enabled: true, limits: { sendOut: true } });
  await hit(x, { screen: true, limits: { sendOut: false } });
  check('extra fields cannot switch a limit off', x.cfg.hands.limits.sendOut === true);
}

{
  const ix = read('public/index.html'), qs = read('public/quick-switches.js'), app = publicText('app.js');
  check('both buttons sit next to ✋ Hands on the chat page', /id="handsBtn"[\s\S]{0,400}id="freeBtn"[\s\S]{0,400}id="screenBtn"/.test(ix) && /🔓 Autonomy/.test(ix) && /🖥 Screen use/.test(ix));
  check('turning Autonomy on asks first, in the page', /id="freeAsk"[^>]*role="alertdialog"/.test(ix) && /ask\.hidden = false/.test(qs));
  check('the buttons follow changes from elsewhere', /quickSwitches\.update\(ev\.settings\)/.test(app));
  const hs = read('public/hands-switch.js'), hands = read('public/hands.js');
  check('the working-without-asking banner has a Hide button', /id="freeBanner"[\s\S]{0,400}id="freeBannerHide"/.test(ix) && /banner\.hidden = !free \|\|/.test(hs));
  check('Settings, Hands brings it back', /data-hbannerback/.test(hands) && /setBannerHidden\(null\)/.test(hands));
  check('✋ Hands says just On (Autonomy shows the not-asking part)', !/not asking/.test(hs));
  check('Help explains both', /🔓 Autonomy/.test(read('public/help-content.js')) && /🖥 Screen use/.test(read('public/help-content.js')));
}

// The banner grows with every check Bob is let past, and comes back after Hide when something new is let past.
{
  const { bannerLines } = await import('../public/hands-switch.js');
  const view = { hands: [{ id: 'apps' }, { id: 'browser' }, { id: 'files' }], browser: { eyes: 'qwen-vl' }, limits: [{ id: 'sendOut', label: "Don't send anything out" }] };
  const base = cleanHands({ enabled: true, free: true });
  check('just working without asking: no extra lines', bannerLines(base, view).length === 0);
  const apps = cleanHands({ enabled: true, free: true, apps: { on: true } });
  check('using apps adds a line about clicking, typing and switching windows', /switch between windows/.test(bannerLines(apps, view).map((l) => l.text).join(' ')));
  const all = cleanHands({ enabled: true, free: true, apps: { on: true }, browser: { on: true }, limits: { sendOut: false } });
  const keys = bannerLines(all, view).map((l) => l.key);
  check('apps, browser, eyes and a hard limit off each add a line', ['apps', 'browser', 'eyes', 'limit:sendOut'].every((k) => keys.includes(k)));
  check('a hard limit that is off is named', bannerLines(all, view).some((l) => /Hard limit OFF: Don't send anything out/.test(l.text)));
  check('no eyes brain: no "can see the screen" line', !bannerLines(all, { ...view, browser: {} }).some((l) => l.key === 'eyes'));
  const hs = read('public/hands-switch.js'), css = read('public/style.css');
  check('the banner gets bigger the more it lists', /data-level="3"\][^}]*font-size/.test(css) && /banner\.dataset\.level = String\(Math\.min\(3, lines\.length\)\)/.test(hs));
  check('Hide remembers what it hid; anything new brings it back', /keys\.every\(\(k\) => hid\.includes\(k\)\)/.test(hs));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
