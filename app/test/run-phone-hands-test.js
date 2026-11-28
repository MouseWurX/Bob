// 🖐 Phone hands (off to start with): Bob for Android using your other apps through its accessibility service, and
// Bob for iPhone running the Shortcuts you name. The page's side (phone-hands.js) with a fake phone, and the rules in
// the Kotlin and Swift sources read as text (no Android or iPhone here; android/tools/HandsRulesCheck.kt runs the
// Kotlin rules on a PC).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'android/app/src/main/assets/www');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

await import(pathToFileURL(path.join(www, 'phone-tools.js')));
await import(pathToFileURL(path.join(www, 'phone-hands.js')));
await import(pathToFileURL(path.join(www, 'shared.js')));
await import(pathToFileURL(path.join(www, 'logic.js')));
const H = globalThis.BobPhoneHands, T = globalThis.BobPhoneTools, L = globalThis.BobLogic, S = globalThis.BobShared;

// A fake Android phone: the bridge's hands ops, with a screen the test sets.
function fakeAndroid(screen) {
  const calls = [];
  return {
    calls,
    io: {
      hands: async (op, args = {}) => {
        calls.push({ op, ...args });
        if (op === 'hands.apps') return ['Calendar', 'Chrome', 'Maps'];
        if (op === 'hands.open') return { text: `Opened ${args.name}. Read the screen with app_look before you tap.` };
        if (op === 'hands.look') return screen;
        if (op === 'hands.act') return { text: `Did ${args.action}.` };
        throw new Error('unknown op');
      }
    }
  };
}
const SCREEN = { ok: true, app: 'Maps', more: 0, signIn: false, items: [
  { n: 1, kind: 'field', text: '', hint: 'Search here', can: ['tap', 'type'] },
  { n: 2, kind: 'button', text: 'Search', desc: '', can: ['tap'] },
  { n: 3, kind: 'button', text: 'Directions', can: ['tap'] },
  { n: 4, kind: 'text', text: 'Pharmacy on Main St', can: [] },
  { n: 5, kind: 'switch', text: 'Traffic', checked: true, can: ['tap'] },
  { n: 6, kind: 'field', text: '(a password field: Bob never reads or types in these)', can: [] }
] };

// ---- The tools each phone offers
{ const a = H.schemas({ platform: 'android' }).map((s) => s.function.name);
  check('Android: the PC Apps hand\'s names (open_app, app_look, app_act)', a.join() === 'open_app,app_look,app_act');
  check('iPhone with no Shortcuts named: no tool at all', H.schemas({ platform: 'ios', shortcuts: '' }).length === 0);
  check('iPhone with Shortcuts named: just the shortcuts tool', H.schemas({ platform: 'ios', shortcuts: 'Timer\nText Sam' }).map((s) => s.function.name).join() === 'shortcuts');
  check('a phone browser (no app) gets no hands', H.schemas({ platform: '' }).length === 0);
  check('the PC Apps hand uses the same three names', ['open_app', 'app_look', 'app_act'].every((n) => read('src/hands-apps.js').includes(`fn('${n}'`)));
  check('one tool with an action, choices listed', H.SCHEMAS.app_act.function.parameters.properties.action.enum.length === 8 && H.SCHEMAS.shortcuts.function.parameters.properties.action.enum.join() === 'list,run');
  for (const s of Object.values(H.SCHEMAS)) check(`${s.function.name}: one short "use when" line`, s.function.description.length < 220);
  check('owns only its own tools', H.owns('app_act') && H.owns('shortcuts') && !H.owns('spreadsheet') && !H.owns('')); }

// ---- Reading what a brain meant
{ check('click, press and select are taps', ['click', 'Press', 'select'].every((w) => H.actionOf('app_act', w) === 'tap'));
  check('enter and fill are typing; go back is back', H.actionOf('app_act', 'enter') === 'type' && H.actionOf('app_act', 'fill') === 'type' && H.actionOf('app_act', 'go back') === 'back');
  check('an unknown move is null', H.actionOf('app_act', 'dance') === null);
  const t = H.tidyArgs({ action: 'scroll_down', target: '#3', value: 'hi' });
  check('target "#3" is item 3, value is text, scroll_down gives a direction', t.item === 3 && t.text === 'hi' && t.direction === 'down');
  check('app and shortcut names map to name', H.tidyArgs({ app: 'Maps' }).name === 'Maps' && H.tidyArgs({ shortcut: 'Timer' }).name === 'Timer');
  check('an item named by its words, if only one fits', H.itemByWords(SCREEN, 'the Search button') === 2 && H.itemByWords(SCREEN, 'directions') === 3);
  check('words that fit two items give nothing (ask for a number)', H.itemByWords({ items: [{ n: 1, text: 'Send' }, { n: 2, text: 'Send later' }] }, 'sen') === null);
  check('Shortcut names: one per line, trimmed, at most 50', H.names(' Timer \n\nText Sam\n').join('|') === 'Timer|Text Sam' && H.names(Array.from({ length: 60 }, (_, i) => `s${i}`)).length === 50); }

// ---- The screen as the brain reads it
{ const txt = H.screenText(SCREEN);
  check('screen: app, count, numbered items with what can be done', /^Maps: 6 things on screen\./.test(txt) && txt.includes('2. button "Search" [tap]') && txt.includes('1. field hint "Search here" [tap, type]'));
  check('screen: a switch says on or off', txt.includes('5. switch on "Traffic"'));
  check('screen: fenced as someone else\'s words', txt.includes('someone else\'s words') && txt.includes('<<<') && txt.includes('>>>'));
  check('screen: a password field\'s words are never there', txt.includes('a password field: Bob never reads') && !/hunter2/.test(txt));
  check('screen: a sign-in screen says to leave it to them', /sign-in or security screen/.test(H.screenText({ ...SCREEN, signIn: true })));
  const big = { ok: true, app: 'Chrome', more: 3, items: Array.from({ length: 120 }, (_, i) => ({ n: i + 1, kind: 'text', text: `A line of words number ${i + 1} that goes on a while`, can: [] })) };
  const bt = H.screenText(big);
  check('screen: a long one is cut to what the small brain can read, and says how many more', bt.length < H.MAX_SCREEN + 600 && /more not shown \(scroll to see them\)/.test(bt));
  check('screen: an error comes through as words', H.screenText({ text: 'That\'s Bob\'s own app.' }) === 'That\'s Bob\'s own app.'); }

// ---- Running calls on a fake Android phone
{ const f = fakeAndroid(SCREEN);
  let r = await H.run('open_app', {}, f.io);
  check('open_app with no name lists the apps', /Apps Bob can open: Calendar, Chrome, Maps/.test(r.text));
  r = await H.run('open_app', { app: 'Maps' }, f.io);
  check('open_app passes the name on', f.calls.at(-1).op === 'hands.open' && f.calls.at(-1).name === 'Maps' && /Opened Maps/.test(r.text));
  r = await H.run('app_act', { action: 'tap', target: 'Search' }, f.io);
  check('a tap by words before any look says to look first', /app_look first/.test(r.text) && f.calls.at(-1).op === 'hands.open');
  await H.run('app_look', {}, f.io);
  r = await H.run('app_act', { action: 'click', target: 'Search' }, f.io);
  check('tap by words after a look sends the item number', f.calls.at(-1).op === 'hands.act' && f.calls.at(-1).action === 'tap' && f.calls.at(-1).item === 2);
  r = await H.run('app_act', { action: 'tap', item: 3 }, f.io);
  check('after a move the old numbers no longer count (by words needs a fresh look)', f.calls.at(-1).item === 3 && /app_look first/.test((await H.run('app_act', { action: 'tap', target: 'Search' }, f.io)).text));
  await H.run('app_look', {}, f.io);
  r = await H.run('app_act', { action: 'type', text: 'pharmacy' }, f.io);
  check('type with no item and one field on screen picks that field', f.calls.at(-1).action === 'type' && f.calls.at(-1).item === 1 && f.calls.at(-1).text === 'pharmacy');
  r = await H.run('app_act', { action: 'type', item: 1 }, f.io);
  check('type with no words says how to fix it', /No words to type/.test(r.text));
  r = await H.run('app_act', { action: 'scroll', direction: 'sideways' }, f.io);
  check('a wrong direction says the four that work', /up, down, left or right/.test(r.text));
  const before = f.calls.length;
  r = await H.run('app_act', { action: 'swipe', direction: 'Left' }, f.io);
  check('swipe sends a direction and no item', f.calls.length === before + 1 && f.calls.at(-1).direction === 'left' && f.calls.at(-1).item === undefined);
  r = await H.run('app_act', { action: 'tap_at' }, f.io);
  check('tap_at without a spot says to give x and y', /Give x and y/.test(r.text));
  r = await H.run('app_act', { action: 'dance' }, f.io);
  check('an unknown move lists the moves', /isn't a move/.test(r.text) && /tap, long_press, type/.test(r.text));
  r = await H.run('app_act', { action: 'back' }, f.io);
  check('back needs no item', f.calls.at(-1).action === 'back');
  check('every answer is words', [r.text].every((x) => typeof x === 'string' && x.length > 3));
  check('summary lines for the chat', H.summary('app_act', { action: 'tap', item: 2 }) === '🖐 tap item 2' && H.summary('open_app', { name: 'Maps' }) === '🖐 open Maps'); }

// ---- iPhone Shortcuts with a fake phone
{ const ran = [];
  const io = (ok, back) => ({ shortcuts: 'Start timer\nText Sam', ok: async () => ok, shortcut: async (name, input) => { ran.push({ name, input }); return back; } });
  let r = await H.run('shortcuts', { action: 'run', name: 'Text Sam', input: 'on my way' }, io(false, { ok: true }));
  check('a Shortcut you say no to doesn\'t run', /You said no/.test(r.text) && ran.length === 0);
  r = await H.run('shortcuts', { action: 'run', name: 'text sam', input: 'on my way' }, io(true, { ok: true, result: 'Sent' }));
  check('a Shortcut runs after OK, with its input, and its answer is fenced', ran.at(-1).name === 'Text Sam' && ran.at(-1).input === 'on my way' && /Ran "Text Sam"/.test(r.text) && /someone else's words/.test(r.text) && r.text.includes('Sent'));
  r = await H.run('shortcuts', { action: 'run', name: 'Delete all photos' }, io(true, { ok: true }));
  check('a Shortcut you didn\'t name never runs', /no allowed Shortcut/.test(r.text) && ran.length === 1);
  r = await H.run('shortcuts', { action: 'list' }, io(true));
  check('list gives the names you allowed', r.text === 'Shortcuts you may run: "Start timer", "Text Sam".');
  r = await H.run('shortcuts', { action: 'run', name: 'timer' }, io(true, { ok: false, why: 'it was cancelled' }));
  check('one that didn\'t finish says why', /didn't finish: it was cancelled/.test(r.text));
  r = await H.run('shortcuts', { action: 'list' }, { shortcuts: '' });
  check('none allowed says where to name them', /Let Bob run Shortcuts/.test(r.text)); }

// ---- The phone brain's instructions
{ const base = { persona: S.persona, user: 'Sam', cat: 'Patches', memory: '', bigBob: '' };
  const a = L.phoneSystem({ ...base, tools: true, hands: 'android' });
  const i = L.phoneSystem({ ...base, tools: true, hands: 'ios' });
  check('Android hands: one short rule (look, move, look again, leave passwords to them)', /app_look/.test(a) && /Leave passwords/.test(a));
  check('iPhone: says it can\'t tap other apps', /You can't tap or read other apps here/.test(i));
  check('no hands without tools', !/app_look/.test(L.phoneSystem({ ...base, tools: false, hands: 'android' })));
  check('instructions with hands stay small (under about 1,200 tokens)', a.length / 4 < 1200, `${Math.round(a.length / 4)}`); }

// ---- phone.js: off by default, and wired the right way
{ const js = read('android/app/src/main/assets/www/phone.js');
  const defaults = js.match(/const DEFAULTS = (\{[^}]+\})/)[1];
  check('opt-in: Let Bob use apps starts off, and no Shortcuts are named', /phoneHands: false/.test(defaults) && /phoneShortcuts: ''/.test(defaults));
  check('hands only with tools on too', /const hands = toolsOn && settings\.phoneHands && H \? handsKind\(\) : ''/.test(js));
  check('turning tools off takes the hands away', /if \(!settings\.phoneTools\) \{[^}]*hands\.allow', \{ on: false \}/.test(js));
  check('a plain explanation before Android\'s switch (Android asks for it too)', /function handsConsent/.test(js) && /if \(on && !\(await handsConsent\(\)\)\)/.test(js));
  check('going round in circles counts per screen seen, so look, move, look works', /H\?\.owns\(name\) \? `#\$\{loop\.screen \|\| 0\}`/.test(js));
  check('Stop on the red bar stops the reply', /m\.event === 'hands' && m\.type === 'stop'/.test(js));
  check('the bar goes when the reply ends', /phone\('hands\.end'/.test(js));
  const { WEB_COPIED } = await import(pathToFileURL(path.join(root, 'android/tools/make-shared.mjs')));
  check('the iPhone screen gets phone-hands.js', WEB_COPIED.includes('phone-hands.js') && read('public/phone/phone-hands.js') === read('android/app/src/main/assets/www/phone-hands.js'));
  check('index.html loads phone-hands.js', read('android/app/src/main/assets/www/index.html').includes('<script src="phone-hands.js"></script>')); }

// ---- Android: the service and its rules (read as text)
{ const man = read('android/app/src/main/AndroidManifest.xml');
  const svc = man.slice(man.indexOf('android:name=".HandsService"') - 40, man.indexOf('</service>', man.indexOf('.HandsService')));
  check('the service is off until you turn Let Bob use apps on (not even listed)', /android:enabled="false"/.test(svc));
  check('only Android itself can bind it', /android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"/.test(svc));
  check('no "see every app" permission: only home-screen apps are listed', !/QUERY_ALL_PACKAGES/.test(man) && /android.intent.category.LAUNCHER/.test(man.slice(man.indexOf('<queries>'), man.indexOf('</queries>'))));
  const xml = read('android/app/src/main/res/xml/hands_service.xml');
  check('not an accessibility tool, so private screens (banking) stay hidden', /isAccessibilityTool="false"/.test(xml));
  check('gestures, the screen and volume-down: the three things it needs', /canPerformGestures="true"/.test(xml) && /canRetrieveWindowContent="true"/.test(xml) && /canRequestFilterKeyEvents="true"/.test(xml));
  const kt = read('android/app/src/main/java/ca/mousewurx/bob/HandsService.kt');
  const rules = read('android/app/src/main/java/ca/mousewurx/bob/HandsRules.kt');
  check('every move checks the app in front first', (kt.match(/HandsRules\.blockedApp\(pkg\)/g) || []).length >= 2 && /HandsRules\.blockedApp\(hit\.second\)/.test(kt));
  check('password fields: never read, never typed in', /if \(node\.isPassword\) return said/.test(kt) && /if \(n\.isPassword\) "\(a password field/.test(kt));
  check('a bare tap always asks and never lands on Bob\'s own card or bar', /whoIsAt\(x\.toInt\(\), y\.toInt\(\)\)/.test(kt) && /TYPE_ACCESSIBILITY_OVERLAY/.test(kt) && /describe\("tap_at", app, .*\), true\)\) return said\(noWords\(\)\)/.test(kt));
  check('sending, paying, deleting, installing, calling: always asks', /HandsRules\.risky\(name\)/.test(kt) && /\bsend\b.*\bpay\b.*\bdelete\b.*\binstall\b.*\bcall\b/.test(rules.match(/RISKY = Regex\("""(.+)"""/)[1]));
  check('Bob\'s own app, Settings, installers, password managers are off limits', ['OWN to', 'com.android.settings', 'packageinstaller', 'permissioncontroller', 'com.x8bit.bitwarden', 'com.android.systemui'].every((w) => rules.includes(w)));
  check('volume down stops him while he drives', /KEYCODE_VOLUME_DOWN/.test(kt) && /stopNow\(\)/.test(kt));
  check('an OK not given in two minutes is a no', /withTimeoutOrNull\(120_000\)/.test(kt) && /\?: run \{ main\.post \{ closeCard\("no"\) \}; "no" \}/.test(kt));
  check('Bob\'s switch off also switches the service off', /if \(!on\) live\?\.let \{ s -> s\.endJob\(false\); s\.disableSelf\(\) \}/.test(kt));
  check('the rules can be checked on a PC (HandsRulesCheck.kt) and need nothing from Android', fs.existsSync(path.join(root, 'android/tools/HandsRulesCheck.kt')) && !/^import android/m.test(rules));
  const br = read('android/app/src/main/java/ca/mousewurx/bob/Bridge.kt');
  check('the bridge has every op the page uses', ['hands.state', 'hands.allow', 'hands.settings', 'hands.apps', 'hands.open', 'hands.look', 'hands.act', 'hands.end'].every((op) => br.includes(`"${op}" ->`))); }

// ---- iPhone: Shortcuts and Ask Bob (read as text)
{ const sw = read('ios/Bob/Shortcuts.swift');
  const yml = read('ios/project.yml');
  const br = read('ios/Bob/Bridge.swift');
  check('a Shortcut answers to Bob\'s own address', /CFBundleURLSchemes: \[bob-phone\]/.test(yml) && /static let scheme = "bob-phone"/.test(sw));
  check('only a run Bob started can be answered', /waiting\[run\] != nil else \{ return false \}/.test(sw));
  check('values sent to Shortcuts are fully percent-encoded', /0123456789-\._~/.test(sw));
  check('a run with no answer gives up after 10 minutes', /\.now\(\) \+ 600/.test(sw));
  check('Ask Bob puts words in the message box (waits for Send)', /struct AskBob: AppIntent/.test(sw) && /Bridge\.incoming\(words\)/.test(sw) && /case "share\.take": answer\(id, Bridge\.pendingShare\)/.test(br));
  check('the bridge runs Shortcuts', /case "shortcut\.run":/.test(br));
  check('unproven on a real iPhone, and it says so', /Unproven in our lab, as we have yet to test/.test(sw)); }

// ---- Help: a section for each, glossary entries and FAQ rows, in Bob's voice
{ await import(pathToFileURL(path.join(www, 'help.js')));
  const help = globalThis.BobHelp;
  const sec = (id) => help.sections.find((s) => s.id === id)?.html || '';
  check('help: Let Bob use apps (both switches, restricted settings, Stop, volume down)', /Allow restricted settings/.test(sec('phone-hands')) && /volume-down/.test(sec('phone-hands')) && /OK for this job/.test(sec('phone-hands')));
  check('help: iPhone Shortcuts and Ask Bob', /Ask Bob/.test(sec('phone-shortcuts')) && /Apple doesn't let one app/.test(sec('phone-shortcuts')));
  check('help: says it is unproven', /not yet proven on a real phone/.test(sec('phone-hands')) && /Not proven on a real iPhone/.test(sec('phone-shortcuts')));
  check('glossary: Bob\'s hands, Accessibility service, Shortcut', ['Bob\'s hands', 'Accessibility service', 'Shortcut'].every((w) => sec('glossary').includes(`<dt>${w}</dt>`)));
  check('FAQ: restricted setting and iPhone', /restricted setting/.test(sec('faq')) && /Can Bob use my apps on an iPhone/.test(sec('faq'))); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
