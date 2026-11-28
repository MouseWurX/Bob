// The Apps Hand on a Mac and Linux (a trial): it shows in Settings marked as a trial and stays off, the chat page's
// Screen use button and switch cards never turn it on, the right helper starts on each computer, the never-touch
// lists know Mac and Linux names, and the helpers' own parts that need no desktop work (the Python helper's
// --selftest when python3 is here, and the Mac helper's pure functions run in Node).
// Nothing here looks at the real desktop: the helper command is built from fakes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HANDS, handsHere, handHere, handTrial, cleanHands } from '../src/hands-settings.js';
import { AppsDriver, appsHelperCommand, appsWords, appsTools, blockedWindow, blockedApp, keysFor, sendOutBlock, PLAIN_TEXT_APPS, BLOCKED_PROCESSES, BLOCKED_PROCESSES_UNIX } from '../src/hands-apps.js';
const ALL_BLOCKED = new Set([...BLOCKED_PROCESSES, ...BLOCKED_PROCESSES_UNIX]);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const here = path.dirname(fileURLToPath(import.meta.url));
const installer = path.join(here, '..', 'installer');

// ---------- Settings: a trial, off ----------
check('the Apps hand exists on Windows, a Mac and Linux', ['win', 'mac', 'linux'].every((o) => handHere('apps', o)));
check('…a trial on a Mac and Linux only', handTrial('apps', 'mac') && handTrial('apps', 'linux') && !handTrial('apps', 'win'));
check('…marked as a trial in Settings, Hands', handsHere('linux').find((h) => h.id === 'apps')?.trial === true && handsHere('mac').find((h) => h.id === 'apps')?.trial === true && !('trial' in handsHere('win').find((h) => h.id === 'apps')));
check('…and says so: unproven in our lab', /unproven in our lab, as we have yet to test/.test(HANDS.apps.whatOn.mac) && /Wayland is unproven in our lab, as we have yet to test/.test(HANDS.apps.whatOn.linux));
check('…off by default', cleanHands({}).apps.on === false);
check('the Settings page shows the trial tag', /h\.trial \? ' <span class="tag">trial, unproven<\/span>'/.test(fs.readFileSync(path.join(here, '..', 'public', 'hands.js'), 'utf8')));
{
  const was = process.env.BOB_PLATFORM;
  const { screenHandsHere } = await import('../src/hands-routes.js');
  const { switchFor } = await import('../src/setup-offer.js');
  process.env.BOB_PLATFORM = 'linux';
  check('Linux: the Screen use button leaves the trial Apps hand alone', screenHandsHere().join() === 'browser');
  check('Linux: no "switch it on" card for the trial Apps hand', switchFor({ hands: {} }, 'hand:apps') === null && switchFor({ hands: {} }, 'hand:browser') !== null);
  process.env.BOB_PLATFORM = 'darwin';
  check('Mac: the same', screenHandsHere().join() === 'browser' && switchFor({ hands: {} }, 'hand:apps') === null);
  process.env.BOB_PLATFORM = 'win32';
  check('Windows: unchanged (Screen use turns on Apps and Browser)', screenHandsHere().join() === 'apps,browser' && switchFor({ hands: {} }, 'hand:apps') !== null);
  if (was === undefined) delete process.env.BOB_PLATFORM; else process.env.BOB_PLATFORM = was;
}

// ---------- The helper on each computer ----------
{
  const lin = appsHelperCommand('linux', { env: {}, exists: (f) => f === '/usr/bin/python3', pid: 11, ppid: 10 });
  check('Linux: the distro\'s own python3 runs bob-apps-linux.py with Bob\'s pids', lin[0] === '/usr/bin/python3' && /bob-apps-linux\.py$/.test(lin[1]) && lin.slice(2).join(' ') === '--bob-pid 11 --bob-parent 10');
  check('Linux: python3 from the path when there is no /usr/bin/python3', appsHelperCommand('linux', { env: {}, exists: () => false })[0] === 'python3');
  check('Linux: BOB_APPS_PYTHON picks another Python', appsHelperCommand('linux', { env: { BOB_APPS_PYTHON: '/opt/py/bin/python3' }, exists: () => true })[0] === '/opt/py/bin/python3');
  const mac = appsHelperCommand('mac', { env: {}, exists: () => true, pid: 7, ppid: 6 });
  check('Mac: osascript runs bob-apps-mac.js as JavaScript', mac[0] === '/usr/bin/osascript' && mac[1] === '-l' && mac[2] === 'JavaScript' && /bob-apps-mac\.js$/.test(mac[3]) && mac.slice(4).join() === '7,6');
  const win = appsHelperCommand('win', { env: { SystemRoot: 'C:\\Windows' }, exists: () => true, pid: 5, ppid: 4 });
  check('Windows: unchanged (PowerShell, bob-apps.ps1, -STA)', /powershell\.exe$/i.test(win[0]) && win.includes('-STA') && win.some((a) => /bob-apps\.ps1$/.test(a)) && win.slice(-4).join() === '-BobPid,5,-BobParent,4');
  check('the Mac and Linux helpers are kept outside app.asar', ['installer/bob-apps-linux.py', 'installer/bob-apps-mac.js'].every((f) => JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).build.asarUnpack.includes(f)));
  check('the driver no longer refuses to start off Windows', !/The Apps hand works on Windows/.test(fs.readFileSync(path.join(here, '..', 'src', 'hands-apps.js'), 'utf8')));
}

// A helper that says what it is missing, then stops: Bob passes that on word for word.
{
  const d = new AppsDriver({ command: [process.execPath, '-e', 'process.stdout.write(JSON.stringify({event:"broken",error:"The Linux apps helper needs PyGObject and AT-SPI."})+"\\n"); setTimeout(()=>process.exit(2),50)'] });
  let why = '';
  try { await d.request('windows', {}, { timeoutMs: 5000 }); } catch (e) { why = e.message; }
  check('a broken helper\'s own reason reaches Bob', /needs PyGObject and AT-SPI/.test(why), why);
  d.stop();
}

// ---------- Words, limits and keys ----------
check('the words follow the computer', appsWords('mac').menu === 'Applications folder' && appsWords('linux').menu === 'app menu' && appsWords('win').menu === 'Start menu' && appsWords('linux').reader.includes('AT-SPI'));
{
  const brain = { cfg: { hands: { enabled: true, apps: { on: true } } }, log: () => {} };
  const t = appsTools(brain, { driver: { request: async () => ({}), onEvent: null, stop() {} }, os_: 'linux' });
  check('Linux: open_app talks about the app menu, not the Start menu', /app menu/.test(t.open_app.schema.function.description) && !/Start menu/.test(t.open_app.schema.function.description));
  const tm = appsTools(brain, { driver: { request: async () => ({}), onEvent: null, stop() {} }, os_: 'mac' });
  check('Mac: open_app talks about the Applications folder', /Applications folder/.test(tm.open_app.schema.function.description));
}
const lw = (process, title = 'x') => blockedWindow({ process, title, pid: 99 }, { ownPids: [1] });
check('Linux terminals are off limits, with the Run hand pointer', ['gnome-terminal-server', 'konsole', 'xterm', 'alacritty', 'kitty', 'ptyxis', 'foot'].every((p) => /Run hand/.test(lw(p))));
check('Mac terminals are off limits too', ['Terminal', 'iTerm2', 'Script Editor'].every((p) => /Run hand/.test(lw(p))));
check('Mac and Linux admin, keychain and sign-in apps are off limits', ['Activity Monitor', 'Disk Utility', 'Keychain Access', 'System Settings', 'SecurityAgent', 'gnome-system-monitor', 'gparted', 'seahorse', 'polkit-gnome-authentication-agent-1'].every((p) => /off limits/.test(lw(p))));
check('a Linux password prompt is left alone by its title', /password or security prompt/.test(lw('zenity', 'Authentication Required')) && /password or security prompt/.test(lw('zenity', 'Unlock Keyring')));
check('ordinary apps are fine', !lw('mousepad', 'Untitled 1 - Mousepad') && !lw('TextEdit', 'Untitled') && !lw('blender', 'Blender'));
check('the app menu refuses terminals and admin tools by name', ['Terminal', 'XTerm', 'UXTerm', 'Konsole', 'iTerm', 'Activity Monitor', 'Disk Utility', 'Keychain Access', 'System Settings', 'Console', 'Passwords', 'Script Editor', 'Automator', 'Disks', 'GParted'].every((n) => blockedApp(n)));
check('…but not apps with those words inside their names', !blockedApp('Xbox Console Companion') && !blockedApp('Hello Kitty Island Adventure') && !blockedApp('Terminator: Resistance') && blockedApp('kitty') && !blockedApp('Text Editor') && !blockedApp('Mousepad') && !blockedApp('LibreOffice Writer') && !blockedApp('Blender'));
check('Cmd+S is Ctrl+S (the Mac helper presses Command)', keysFor('cmd+s') === '^s' && keysFor('Command+Shift+Z') === '^+z' && keysFor('option+f4') === '%{F4}');
check('…still no Ctrl+Alt, nor the Windows or Meta key', throws(() => keysFor('cmd+alt+delete'), /Ctrl\+Alt/) && throws(() => keysFor('meta+l')));
{
  const cfg = { hands: { enabled: true, apps: { on: true } } };
  check('"Don\'t send anything out" knows Mac and Linux mail, chat and browsers', ['Safari', 'Mail', 'Messages', 'google-chrome', 'firefox-esr', 'evolution', 'signal-desktop'].every((p) => /Don't send anything out/.test(sendOutBlock(cfg, { process: p }, 'type'))) && !sendOutBlock(cfg, { process: 'mousepad' }, 'type'));
}
check('Linux and Mac plain-text editors get plain text and new blank pages', ['mousepad', 'gedit', 'gnome-text-editor', 'kwrite', 'textedit'].every((p) => PLAIN_TEXT_APPS.includes(p)));

// ---------- The Linux helper's parts that need no desktop ----------
{
  const py = ['python3', 'python'].find((p) => spawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0);
  if (!py) check('Linux helper --selftest (skipped: no python3 here)', true);
  else {
    const r = spawnSync(py, [path.join(installer, 'bob-apps-linux.py'), '--selftest'], { encoding: 'utf8', timeout: 30000 });
    let j = {}; try { j = JSON.parse(String(r.stdout).replace(/\r\n/g, '\n').trim().split('\n').pop()); } catch {}
    check('Linux helper --selftest: roles, keys for xdotool and ydotool, the never-touch list', r.status === 0 && j.ok === true, `${r.stdout} ${r.stderr}`);
  }
  const src = fs.readFileSync(path.join(installer, 'bob-apps-linux.py'), 'utf8').replace(/\r\n/g, '\n');
  check('Linux helper: answers every op Bob sends', ['hello', 'windows', 'apps', 'open', 'look', 'picture', 'drive', 'resolve', 'clickat', 'act', 'quit'].every((op) => src.includes(`op == '${op}'`)));
  check('Linux helper: types through AT-SPI first (no keyboard needed), keys through xdotool or ydotool', /set_text_contents/.test(src) && /insert_text/.test(src) && /'xdotool', 'key'/.test(src) && /'ydotool', 'key'/.test(src));
  const pyBlocked = src.match(/^BLOCKED = \{([\s\S]*?)\}/m)[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
  check('Linux helper: refuses the same programs itself (two locks, not one)', pyBlocked.length > 30 && pyBlocked.every((p) => ALL_BLOCKED.has(p)) && ['gnome-terminal-server', 'konsole', 'pkexec', 'gparted', 'seahorse', 'synaptic'].every((p) => pyBlocked.includes(p)), pyBlocked.filter((p) => !ALL_BLOCKED.has(p)).join());
  check('Linux helper: refuses password boxes that don\'t say they are', /PASSWORD_WORDS/.test(src) && /LABELLED_BY/.test(src));
}

// ---------- The Mac helper, run in Node (no Mac here) ----------
{
  const src = fs.readFileSync(path.join(installer, 'bob-apps-mac.js'), 'utf8').replace(/\r\n/g, '\n');
  let ok = true; try { new vm.Script(src, { filename: 'bob-apps-mac.js' }); } catch (e) { ok = false; console.log(e.message); }
  check('Mac helper: valid JavaScript', ok);
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
  check('Mac helper: nothing runs until osascript calls run()', typeof ctx.run === 'function' && !('SE' in ctx));
  check('Mac helper: Accessibility roles become the same types as on Windows', ctx.typeFor('AXButton') === 'Button' && ctx.typeFor('AXTextField') === 'Edit' && ctx.typeFor('AXTextArea') === 'Document' && ctx.typeFor('AXTextField', 'AXSecureTextField') === 'Edit' && ctx.typeFor('AXRadioButton', 'AXTabButton') === 'TabItem' && ctx.typeFor('AXSomethingNew') === 'SomethingNew');
  check('Mac helper: secure text fields are password fields', ctx.isPasswordRole('AXTextField', 'AXSecureTextField') && !ctx.isPasswordRole('AXTextField', null));
  const k = ctx.parseKeys('^s'), e = ctx.parseKeys('{ENTER}'), f = ctx.parseKeys('%{F4}');
  check('Mac helper: Ctrl means Command, Alt means Option, with Apple key codes', k.mods.join() === 'command' && k.key === 's' && e.code === 36 && f.mods.join() === 'option' && f.code === 118);
  check('Mac helper: no Command+Option combinations, no unknown keys', throws(() => ctx.parseKeys('^%{DELETE}'), /Ctrl\+Alt/) && throws(() => ctx.parseKeys('{LWIN}')));
  check('Mac helper: terminals, Keychain Access and Bob himself are off limits', /off limits/.test(ctx.blockedWhy('Terminal', 'x', 5, [])) && /off limits/.test(ctx.blockedWhy('Keychain Access', 'x', 5, [])) && /own window/.test(ctx.blockedWhy('TextEdit', 'x', 5, [5])) && !ctx.blockedWhy('TextEdit', 'Untitled', 5, []));
  check('Mac helper: refuses the same programs itself (two locks, not one)', ctx.BLOCKED.every((p) => ALL_BLOCKED.has(p)) && ['terminal', 'keychain access', 'activity monitor', 'securityagent'].every((p) => ctx.BLOCKED.includes(p)), ctx.BLOCKED.filter((p) => !ALL_BLOCKED.has(p)).join());
  check('Mac helper: labels match Windows', ctx.labelOf('Button', 'Save', '') === 'Button "Save"');
  check('Mac helper: answers every op Bob sends', ['hello', 'windows', 'apps', 'open', 'look', 'picture', 'drive', 'resolve', 'clickat', 'act', 'quit'].every((op) => src.includes(`op === '${op}'`)));
  check('Mac helper: says it is unproven', /UNPROVEN IN OUR LAB, AS WE HAVE YET TO TEST IT/.test(src));
}

// ---------- Help ----------
{
  const help = fs.readFileSync(path.join(here, '..', 'public', 'help-content.js'), 'utf8').replace(/\r\n/g, '\n');
  check('Help: the Apps Hand page covers the Mac and Linux trial', /On a Mac and on Linux it's a trial/.test(help) && /gir1\.2-atspi-2\.0/.test(help) && /Wayland is unproven in our lab, as we have yet to test it/.test(help));
  check('Help: the glossary explains Accessibility', /<dt>Accessibility \(AT-SPI, UI Automation\)<\/dt>/.test(help));
  check('Help: an FAQ for it', /id: 'faq-apps-mac-linux'/.test(help) && /Not in the Android app/.test(help));
  check('Help: the Linux and Mac pages no longer say it is missing', !/Not on Linux:<\/strong> the Open and use apps Hand/.test(help) && !/Not on a Mac:<\/strong> the Open and use apps Hand/.test(help));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
