// The Apps Hand: off by default, a card for every open/look/act, the never-touch list (terminals, admin tools,
// password managers and prompts, password fields, Bob's own window), keys Bob may press, the "Bob is driving"
// bar only while acting, taking over with the mouse or Esc, and Stop everything ending the helper.
// Uses test/mock-apps-driver.js in place of installer\bob-apps.ps1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanHands, handOn, toolsOff, HANDS } from '../src/hands-settings.js';
import { handsTools, stopEverything, handsPrompt, runningNow } from '../src/hands.js';
import { AppsDriver, blockedWindow, blockedApp, keysFor, BLOCKED_PROCESSES, plainText, LONG_TYPING } from '../src/hands-apps.js';
import { Brain, staleHandErrors, claimsPcAction, CLAIM_CORRECTION } from '../src/brain.js';
// The Apps hand only exists on Windows (src/hands-settings.js platforms); its logic is tested everywhere with a stand-in helper.
process.env.BOB_PLATFORM = 'win32';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-apps-'));
const mockLog = path.join(tmp, 'driver.log');
const sent = () => { try { return fs.readFileSync(mockLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

// ---------- Settings ----------
check('the Apps hand exists, with its three tools', HANDS.apps && HANDS.apps.tools.join() === 'open_app,app_look,app_act');
check('it is off by default and hidden from Bob', cleanHands({}).apps.on === false && ['open_app', 'app_look', 'app_act'].every((t) => toolsOff({}).includes(t)));
check('it needs the master switch too', !handOn({ hands: { enabled: false, apps: { on: true } } }, 'apps') && handOn({ hands: { enabled: true, apps: { on: true } } }, 'apps'));
check('the Settings line says what it never touches and how to stop it', /Esc/.test(HANDS.apps.what) && /never terminals/i.test(HANDS.apps.what) && /password/.test(HANDS.apps.what));

// ---------- The never-touch list ----------
const own = { ownPids: [process.pid] };
check('terminals go through the Run hand instead', /Run hand/.test(blockedWindow({ title: 'Command Prompt', process: 'cmd', pid: 9 }, own)) && /Run hand/.test(blockedWindow({ title: 'Windows PowerShell', process: 'powershell.exe', pid: 9 }, own)) && /Run hand/.test(blockedWindow({ title: 'x', process: 'WindowsTerminal', pid: 9 }, own)));
check('admin tools and password managers are off limits', ['regedit', 'taskmgr', 'mmc', 'KeePassXC', '1Password', 'Bitwarden', 'consent', 'CredentialUIBroker'].every((p) => blockedWindow({ title: 'x', process: p, pid: 9 }, own)));
check('password and security prompts are off limits whatever the app', blockedWindow({ title: 'Enter your password', process: 'someapp', pid: 9 }, own) && blockedWindow({ title: 'Windows Security', process: 'svchost', pid: 9 }, own) && blockedWindow({ title: 'User Account Control', process: 'x', pid: 9 }, own));
check("Bob's own window is off limits (he can't approve his own cards)", /own window/.test(blockedWindow({ title: 'Bob', process: 'notepad', pid: process.pid }, own)) && /own window/.test(blockedWindow({ title: 'Bob', process: 'Bob', pid: 1 }, own)));
check('ordinary apps are fine', blockedWindow({ title: 'Untitled - Notepad', process: 'notepad', pid: 9 }, own) === '' && blockedWindow({ title: 'Sketch - Paint', process: 'mspaint', pid: 9 }, own) === '');
check('the Start menu tools are refused by name', ['Command Prompt', 'Windows PowerShell', 'Registry Editor', 'Task Manager', 'Terminal', 'Control Panel', 'Bitwarden'].every((n) => blockedApp(n)) && !blockedApp('Notepad') && !blockedApp('Blender 4.2'));
const ps = fs.readFileSync(path.join(here, '..', 'installer', 'bob-apps.ps1'), 'utf8');
const psBlocked = ps.match(/static readonly string\[\] Blocked = new string\[\] \{([\s\S]*?)\};/)[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
check('the helper refuses the same programs itself (two locks, not one)', BLOCKED_PROCESSES.every((p) => psBlocked.includes(p)) && psBlocked.every((p) => BLOCKED_PROCESSES.includes(p)));

// ---------- Keys ----------
check('plain keys and Ctrl/Shift/Alt combinations map to SendKeys', keysFor('Enter') === '{ENTER}' && keysFor('ctrl+s') === '^s' && keysFor('Ctrl + Shift + N') === '^+n' && keysFor('Shift+Tab') === '+{TAB}' && keysFor('F5') === '{F5}' && keysFor('Alt+F4') === '%{F4}');
check('never the Windows key or Ctrl+Alt combinations', throws(() => keysFor('Win+R'), /Windows key/) && throws(() => keysFor('Ctrl+Alt+Delete'), /Ctrl\+Alt/) && throws(() => keysFor('Ctrl+Alt+T'), /Ctrl\+Alt/));
check('unknown keys and empty input are refused', throws(() => keysFor('PrintScreen'), /doesn't press/) && throws(() => keysFor(''), /key/) && throws(() => keysFor('a+b+c+d'), /key/));

// ---------- The helper script ----------
check('the helper is plain ASCII with no PowerShell 7 or newer-C# syntax', !/[^\x00-\x7F]/.test(ps) && !/\?\?=|\?\.\w/.test(ps.replace(/\?\? ""/g, '')) && !/\$"/.test(ps));
check('it never elevates', !/-Verb\s+RunAs|runas|Highest/i.test(ps));
check('the red bar says how to take back control, and moving the mouse or Esc stops it', /Bob is driving\.  Move the mouse or press Esc/.test(ps) && /StopNow\("mouse"\)/.test(ps) && /GetAsyncKeyState\(0x1B\)/.test(ps));
check('the bar is click-through and never steals focus', /ShowWithoutActivation \{ get \{ return true; \} \}/.test(ps) && /0x08000000/.test(ps) && /0x00000020/.test(ps));
check('it only acts while driving, and not after you took over', /if \(stopped\) throw new Exception\("Stopped: you took back control\."\)/.test(ps) && /if \(!driving\) throw/.test(ps));
check('it never types into or reads password fields (unless the user switched that limit off)', /if \(e\.Current\.IsPassword && !allowPassword\) throw new Exception\("Bob never types into password fields\."\)/.test(ps) && /\[bool\]\$m\.allowPassword\)/.test(ps) && /if \(!pw && e\.TryGetCurrentPattern\(ValuePattern/.test(ps));
check("it prefers the app's own controls, and puts the pointer back after a real click", /if \(action == "click"\) \{\s*if \(e\.TryGetCurrentPattern\(InvokePattern\.Pattern[\s\S]*?ClickAt\(e\);\s*return "clicked "/.test(ps) && /MoveTo\(old\.X, old\.Y\)/.test(ps));
check('it opens only apps that are really in the Start menu, through the shell', /Get-StartApps \| Where-Object \{ \$_\.AppID -eq \$id \}/.test(ps) && /shell:AppsFolder/.test(ps));
check("it ends when Bob does (stdin closes) and hides the bar on the way out", /if \(\$null -eq \$line\) \{ break \}/.test(ps) && /\[BobApps\.Driver\]::Drive\(\$false\)\s*$/.test(ps.trim() + '\n'));

check('typing into documents (Windows 11 Notepad) uses real keystrokes after putting the cursor there', /static AutomationElement TextArea\(/.test(ps) && /IsKeyboardFocusable/.test(ps) && /KEYEVENTF_UNICODE/.test(ps) && /FocusIn\(e, h, label\);\s*Quiet\([^)]*\);[\s\S]{0,140}CtrlEnd\(\);\s*TypeChars\(h, text\);/.test(ps));
check("a refused SetFocus is never the final word: it falls back to a real click, then gives a plain reason", /try \{ e\.SetFocus\(\); \} catch \(InvalidOperationException\) \{ \}/.test(ps) && /ClickAt\(e\);\s*Thread\.Sleep\(120\);\s*if \(!HasFocus/.test(ps) && !/^\s*e\.SetFocus\(\);\s*$/m.test(ps));
check('it makes sure the window is really in front before typing, or says why not', /static void Front\(IntPtr h\)[\s\S]*AttachThreadInput[\s\S]*Windows wouldn't bring that window to the front/.test(ps));
check('after typing it reads the text back to check', /static string Checked\(/.test(ps) && /TextPattern\.Pattern/.test(ps));
check("typing into something that can't take text (Notepad's tab title) uses the window's text area and says so", /if \(IsTextArea\(w\)\) \{ swapped = Describe/.test(ps) && /so Bob typed into the window's main text area instead/.test(ps) && /d\["typable"\] = true/.test(ps));
check('typing re-checks every few characters that the approved window is still in front and you have not taken over', /if \(n % 8 == 0\) \{\s*if \(!driving\) throw[\s\S]*?if \(!InFront\(h\)\) throw new Exception\("Typing stopped after "/.test(ps) && /TypeChars\(h, text\)/.test(ps));
check("your mouse is never muted: the watch compares with where Bob last put the pointer", /lock \(PosLock\) \{ SetCursorPos\(x, y\); GetCursorPos\(out baseline\); \}/.test(ps) && !/Quiet\(\d+\);\s*SetCursorPos/.test(ps) && (ps.match(/SetCursorPos\(/g) || []).length === 2 && /quietUntil\) && \(GetAsyncKeyState\(0x1B\)/.test(ps));
check('positions use real pixels on scaled screens', /SetProcessDPIAware\(\)/.test(ps) && /\[BobApps\.Driver\]::Init\(\)/.test(ps));
check('the helper refuses to act if the window now resolves to something other than what was approved', /if \(!String\.IsNullOrEmpty\(expect\) && Label\(e\) != expect\) throw/.test(ps) && /'resolve' \{/.test(ps));
check('the helper strips a byte-order mark and answers bad JSON instead of dropping it', /TrimStart\(\[char\]0xFEFF\)/.test(ps) && /error = 'bad JSON'/.test(ps));
check('names in messages have no doubled spaces', /String\.Join\(" ", parts\.ToArray\(\)\)/.test(ps));
check('UI Automation errors come back as plain sentences', /catch \(InvalidOperationException ex\) \{\s*throw new Exception\("Windows refused: "/.test(ps));

// ---------- The tools, through the brain's approval flow ----------
const dataDir = path.join(tmp, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { dataDir, painterDir: dataDir, innDir: path.join(tmp, 'inn'), userName: 'Sam', hands: { enabled: true, apps: { on: true }, files: { on: false }, run: { on: false }, folders: [] } };
const logs = [], events = [];
const fake = Object.create(Brain.prototype);
Object.assign(fake, { cfg, tools: {}, approvals: new Map(), handApprovals: new Set(), state: { state: 'idle' }, setState() {}, log: (k, t) => logs.push(`${k}: ${t}`), broadcast: (e) => events.push(e), saveHands(next) { cfg.hands = next; } });
const driver = new AppsDriver({ command: [process.execPath, path.join(here, 'mock-apps-driver.js')], env: { ...process.env } });
process.env.MOCK_APPS_LOG = mockLog;
process.env.MOCK_BOB_PID = String(process.pid);
Object.assign(fake.tools, handsTools(fake, { apps: { driver, openWaitMs: 20, openWaitTries: 5 } }));
let onCard = () => true;
const ctx = () => ({ emit: (e) => { events.push(e); if (e.type === 'approval') setTimeout(() => fake.answerApproval(e.id, onCard(e)), 5); }, signal: new AbortController().signal, allowAll: new Set() });
const cards = () => events.filter((e) => e.type === 'approval');

{
  const { handOffWhy } = await import('../src/hands-settings.js');
  const allOff = { userName: 'Sam', hands: {} };
  const masterOff = { userName: 'Sam', hands: { enabled: false, apps: { on: true } } };
  const appsOff = { userName: 'Sam', hands: { enabled: true, apps: { on: false } } };
  const held = { userName: 'Sam', hands: { enabled: true, held: true, apps: { on: true } } };
  check('when everything is off, Bob says both switches to turn on, by their Settings names', handOffWhy(allOff, 'apps') === 'Hands are off in Settings. Sam can turn on "Let Bob use Hands" and "Open and use apps" in Settings, Show advanced settings, Hands.');
  check('when only the master switch is off, Bob names it', /Hands are off in Settings \(the "Let Bob use Hands" switch\)/.test(handOffWhy(masterOff, 'apps')));
  check('when only the Apps hand is off, Bob names it', handOffWhy(appsOff, 'apps') === 'The "Open and use apps" Hand is off. Sam can turn it on in Settings, Show advanced settings, Hands.');
  check('when stopped on the chat page, Bob says so', /chat page/.test(handOffWhy(held, 'apps')));
  const p0 = handsPrompt(allOff);
  check("with Hands off, Bob's prompt still tells him which are off, why, and to say so plainly (\"open Notepad\" -> a clear reason)", /off right now/.test(p0) && /Open and use apps/.test(p0) && /Let Bob use Hands/.test(p0) && /don't refuse without a reason or make one up/.test(p0));
  const pOn = handsPrompt({ userName: 'Sam', hands: { enabled: true, apps: { on: true } } });
  check("with Hands on, Bob is told the PC is real, to quote a tool's error, to claim only what a tool did, and to retry rather than repeat an old failure", /real Windows PC/.test(pOn) && /never blame a simulation/.test(pOn) && /Never say you did something on the PC .* unless a tool result in this turn says it was done/.test(pOn) && /Never say you did something/.test(p0) && /call the tool again instead of repeating/.test(pOn));
  const p1 = handsPrompt(appsOff);
  check('with some Hands on, the off ones are still explained', /off right now/.test(p1) && /"Open and use apps" Hand is off/.test(p1));
}
check("Bob's prompt explains look-then-act when the Apps hand is on", /app_look/.test(handsPrompt(cfg)) && !/app_look/.test(handsPrompt({ ...cfg, hands: { ...cfg.hands, apps: { on: false } } })));
{
  const offCfg = { ...cfg, hands: { ...cfg.hands, apps: { on: false } } };
  const offTools = handsTools({ cfg: offCfg, log() {} }, { apps: { driver: new AppsDriver({ command: [process.execPath, path.join(here, 'mock-apps-driver.js')] }) } });
  let msg = ''; try { await offTools.app_act.check({ window: 'notepad', action: 'click', name: 'Save' }, null); } catch (e) { msg = e.message; }
  check('switched off, the tools refuse even if called', /(Hand is off|Hands are off)/.test(msg));
}

// open_app
const o1 = await fake.runTool('open_app', { name: 'notepad' }, ctx());
const oc = cards().at(-1);
check('opening an app shows a card with the app and an "Open it" button', oc && /Open Notepad/.test(oc.command) && oc.button === 'Open it' && oc.hand === true && /not as administrator/.test(oc.text));
check('…and opens it through the Start menu id after the click, saying so only once its new window is there', /Opened Notepad: its window "Untitled - Notepad" is open/.test(o1.text) && sent().some((m) => m.op === 'open' && m.appId === 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App'));
const nCards = cards().length;
const o2 = await fake.runTool('open_app', { name: 'Command Prompt' }, ctx());
const o3 = await fake.runTool('open_app', { name: 'Registry Editor' }, ctx());
check('terminals and admin tools are refused before any card', /off limits/.test(o2.text) && /off limits/.test(o3.text) && cards().length === nCards);
onCard = () => false;
const o4 = await fake.runTool('open_app', { name: 'Paint' }, ctx());
check('Deny = nothing opened', /said no/.test(o4.text) && !sent().some((m) => m.op === 'open' && /Paint/.test(m.appId)));
onCard = () => true;
const o5 = await fake.runTool('open_app', { name: 'Paint' }, ctx());
check("if no new window appears, Bob is told it did not open and not to say it did", /no new window appeared/.test(o5.text) && /Do not say it opened/.test(o5.text) && /It may still be starting: check the taskbar, or ask Bob to try again\./.test(o5.text) && logs.some((l) => /asked Windows to open Paint, but no new window appeared/.test(l)));
onCard = () => true;

// app_look
const l1 = await fake.runTool('app_look', {}, ctx());
check('listing windows needs a card too, and hides the off-limits ones', /List open windows/.test(cards().at(-1).command) && /Untitled - Notepad/.test(l1.text) && /Paint/.test(l1.text) && !/Command Prompt|KeePass|Windows Security|\bBob \(/.test(l1.text));
const l2 = await fake.runTool('app_look', { window: 'notepad', picture: true }, ctx());
check('looking at a window shows a card naming it', /Look at Untitled - Notepad/.test(cards().at(-1).command) && cards().at(-1).cwd === 'notepad');
check('app_look lists where Bob can type first, with a "You can type in" line', /\nYou can type in: Document "Text editor"\. Anything else is for clicking or reading\.\n- Document "Text editor"/.test(l2.text), l2.text.slice(0, 300));
check('Bob gets the names of its controls, and never a password value', /Button "Save" \[id save\]/.test(l2.text) && /Document "Text editor".*you can type here.*= "hello"/.test(l2.text) && /Text "Untitled" \[id ContentTextBlock\]$/m.test(l2.text) && /password field: never typed in/.test(l2.text));
check('the picture of the window goes to the chat', events.some((e) => e.type === 'image' && /window-\d+\.png/.test(e.url)) && /picture of the window/.test(l2.text));
const nC2 = cards().length;
for (const w of ['cmd', 'KeePassXC', 'Windows Security', 'Bob']) {
  const r = await fake.runTool('app_look', { window: w }, ctx());
  check(`looking at ${w} is refused before any card`, /off limits|Run hand|own window|password or security/.test(r.text) && cards().length === nC2, r.text);
}
const l3 = await fake.runTool('app_look', { window: 'no such app' }, ctx());
check('an unknown window lists the ones Bob may use', /No open window matches/.test(l3.text) && /Notepad/.test(l3.text) && !/KeePass/.test(l3.text));

// app_act
const before = sent().length;
const a1 = await fake.runTool('app_act', { window: 'notepad', action: 'click', type: 'Button', name: 'Save' }, ctx());
const ac = cards().at(-1);
check('each action shows a card with exactly what and where, and says how to stop', /Click Button "Save"/.test(ac.command) && /Untitled - Notepad/.test(ac.cwd) && ac.button === 'Do it' && /move the mouse or press Esc/.test(ac.text));
const ops = sent().slice(before).map((m) => m.op + (m.op === 'drive' ? `:${m.on}` : ''));
check('the red bar goes up just for the action and comes down after', /drive:true,act,drive:false/.test(ops.join()), ops.join());
check('the window is checked again right before acting', ops.indexOf('windows', 1) < ops.indexOf('act'));
check('the result goes back to Bob and into the logbook', /Done: click Save/.test(a1.text) && logs.some((l) => /apps: click Button "Save" in Untitled - Notepad/.test(l)));
const t1 = await fake.runTool('app_act', { window: 'notepad', action: 'type', type: 'Edit', name: 'Text editor', text: 'Shopping list' }, ctx());
check('typing shows the text on the card, and that a one-line field gets it in place of what is there', /^Replace what's in "Text editor" with: "Shopping list"/.test(cards().at(-1).command) && /Done/.test(t1.text) && sent().some((m) => m.op === 'act' && m.text === 'Shopping list'));
const f1 = await fake.runTool('app_act', { window: 'notepad', action: 'type', text: 'FAIL FOCUS' }, ctx());
check("when Windows refuses, Bob gets the real reason and is told not to invent one", /wouldn't let Bob put the cursor/.test(f1.text) && /real reason, from Windows/.test(f1.text) && /simulation/.test(f1.text) && logs.some((l) => /failed: Windows wouldn't let Bob/.test(l)));
check('the red bar still comes down after a failed action', sent().filter((m) => m.op === 'drive').at(-1).on === false);
const f2 = await fake.runTool('app_act', { window: 'notepad', action: 'type', text: 'NOT THERE' }, ctx());
check("if the text isn't there when read back, Bob says it may not have worked", /^Not sure it worked/.test(f2.text));
const g1 = await fake.runTool('app_act', { window: 'notepad', action: 'type', type: 'Text', id: 'ContentTextBlock', text: 'hello' }, ctx());
const gc = cards().at(-1);
check("the card shows what Bob will really type into, not just what he named (Notepad's tab title -> its page)", /^Add to the end of "Text editor" \(Text doesn't accept typing, so Bob will type into the window's main text area instead\): "/.test(gc.command) && !/\[id /.test(gc.command) && /Done/.test(g1.text), gc.command);
check('the helper is told what the card showed, so a changed window means nothing is done', sent().filter((m) => m.op === 'act').at(-1).expect === 'Document "Text editor" [id 15]');
check('every act is preceded by "drive on"', (() => { const l = sent(); return l.every((m, i) => m.op !== 'act' || l.slice(0, i).reverse().find((x) => x.op === 'drive')?.on === true); })());
{
  let msg = ''; try { await fake.tools.app_act.run({ window: 'notepad', action: 'type', text: 'x' }, { emit() {}, allowAll: new Set() }); } catch (e) { msg = e.message; }
  check('type/click/focus never run without the target the card showed', /no approved target/.test(msg));
}
const nP = cards().length;
const pw2 = await fake.runTool('app_act', { window: 'notepad', action: 'type', type: 'Edit', name: 'Secret', id: 'pw', text: 'x' }, ctx());
check("a field the helper flags as a password is refused before any card, even with a harmless name", /never types into password/.test(pw2.text) && cards().length === nP);
const nG = cards().length;
const g2 = await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'Greyed' }, ctx());
check('a greyed-out target is refused before any card', /greyed out/.test(g2.text) && cards().length === nG);
// Notepad renames itself after the first typing ("Untitled - Notepad" -> "*Shopping list - Notepad").
{
  const r1 = await fake.runTool('app_act', { window: 'Untitled - Notepad', action: 'type', text: 'Shopping list' }, ctx());
  const r2 = await fake.runTool('app_act', { window: 'Untitled - Notepad', action: 'keys', keys: 'Enter' }, ctx());
  check('a window Bob used is still found by its old title after Notepad renames it', /Done/.test(r1.text) && /Done/.test(r2.text), r2.text);
  const r3 = await fake.runTool('app_act', { window: 'Shopping list - Notepad', action: 'keys', keys: 'Enter' }, ctx());
  check('…and by the new title without its leading *', /Done/.test(r3.text), r3.text);
}
// Markdown into a plain-text window
check('Markdown becomes plain text', plainText('# Title\n\n**Bold** and *it* and `code`\n* one\n- two\n[site](https://x.y)') === 'Title\n\nBold and it and code\n- one\n- two\nsite (https://x.y)');
{
  const before2 = sent().length;
  await fake.runTool('app_act', { window: 'notepad', action: 'type', text: '## Plan\n**Buy** milk' }, ctx());
  const typedMsg = sent().slice(before2).find((m) => m.op === 'act');
  check('typing into Notepad sends plain text (no ** or #), and the card shows that text', typedMsg?.text === 'Plan\nBuy milk' && /Plan\nBuy milk|Plan Buy milk|"Plan/.test(cards().at(-1).command), typedMsg?.text);
  const nL = cards().length;
  const long = await fake.runTool('app_act', { window: 'notepad', action: 'type', text: 'x'.repeat(LONG_TYPING + 1) }, ctx());
  check('long text is not typed key by key: Bob is pointed at a .txt file instead, before any card', /too long to type key by key \(it would take about \d+ minutes?\)/.test(long.text) && /save it as a \.txt file instead \(one approval\) and open it in Notepad/.test(long.text) && /Never name tools like write_file/.test(long.text) && cards().length === nL);
}
const nC3 = cards().length;
const t2 = await fake.runTool('app_act', { window: 'notepad', action: 'type', type: 'Edit', name: 'Password', id: 'pw', text: 'x' }, ctx());
check('a password field (by name, or flagged by the helper) is refused before any card', /never types into password/.test(t2.text) && cards().length === nC3);
const k1 = await fake.runTool('app_act', { window: 'notepad', action: 'keys', keys: 'Win+R' }, ctx());
check('the Windows key is refused before any card', /Windows key/.test(k1.text) && cards().length === nC3);
const k2 = await fake.runTool('app_act', { window: 'notepad', action: 'keys', keys: 'Ctrl+S' }, ctx());
check('allowed keys are sent as SendKeys', /Done/.test(k2.text) && sent().some((m) => m.op === 'act' && m.keys === '^s'));
const x1 = await fake.runTool('app_act', { window: 'cmd', action: 'keys', keys: 'Enter' }, ctx());
check('acting in a terminal is refused (that is the Run hand)', /Run hand/.test(x1.text));
onCard = () => false;
const d1 = await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'File' }, ctx());
check('Deny = nothing done', /said no/.test(d1.text) && !sent().some((m) => m.op === 'act' && m.target?.name === 'File'));

// "Allow the rest of this job", then taking over with the mouse
onCard = () => 'all';
const job = ctx();
await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'File' }, job);
const nC4 = cards().length;
await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'Save' }, job);
check('"Allow the rest of this job" covers the next action in the same window', cards().length === nC4);
await fake.runTool('app_act', { window: 'paint', action: 'click', name: 'Brush' }, job);
check('…but not a different window', cards().length === nC4 + 1);
const s1 = await fake.runTool('app_act', { window: 'notepad', action: 'type', name: 'Text editor', text: 'TAKE OVER' }, job);
await wait(30);
check('moving the mouse stops Bob mid-job', /took back control|Stopped/.test(s1.text) && events.some((e) => e.type === 'apps-stopped' && /moved the mouse/.test(e.why)));
check('…and ends "allow the rest of this job" for apps', ![...job.allowAll].some((g) => g.startsWith('apps-')));
const s2 = await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'Save' }, job);
check('…and Bob does not carry on in that job', /took back the mouse/.test(s2.text));
check('taking over is in the logbook', logs.some((l) => /moved the mouse; Bob stopped driving/.test(l)));
const s3 = await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'Save' }, ctx());
check('a new job can ask again', /Done/.test(s3.text));

// Stop everything ends the helper and its bar
check('the helper is listed as running while it is up', runningNow().some((r) => r.line === 'Apps hand'));
stopEverything(fake);
await wait(100);
check('Stop everything ends the apps helper (and its red bar)', !driver.child && !runningNow().some((r) => r.line === 'Apps hand') && !handOn(cfg, 'apps'));
const after = await fake.runTool('app_act', { window: 'notepad', action: 'click', name: 'Save' }, ctx());
check('after Stop everything the Apps hand is off', /Hands are off in Settings/.test(after.text));

// The helper itself: off Windows the real one is refused with a reason
if (process.platform !== 'win32') check('off Windows the real helper says it needs Windows', throws(() => new AppsDriver().start(), /Windows/));

// ---------- Honesty: old errors, claims with no tool ----------
{
  const hist = [
    { role: 'user', content: 'open notepad and type hello' },
    { role: 'tool', tool_name: 'app_act', content: 'Error: Target element cannot receive focus.' },
    { role: 'tool', tool_name: 'web_search', content: 'Error: offline' },
    { role: 'assistant', content: 'It failed.' },
    { role: 'user', content: 'try again' }
  ];
  const v = staleHandErrors(hist, 4);
  check('old Hands errors are shown to the brain as possibly out of date, with a nudge to call the tool again', /An earlier try failed: Target element cannot receive focus/.test(v[1].content) && /call the tool again/.test(v[1].content) && hist[1].content.startsWith('Error:'));
  check('other tools and this turn are left alone', v[2].content === 'Error: offline' && staleHandErrors([{ role: 'tool', tool_name: 'app_act', content: 'Error: x' }], 0)[0].content === 'Error: x');
  check('a claim of a PC action is spotted ("I\'ve opened Notepad")', claimsPcAction("I've opened Notepad for you.") && claimsPcAction('I typed hello into the document.') && claimsPcAction('I have successfully launched the app') && claimsPcAction('I moved the file to Downloads'));
  check('ordinary talk and stories are not', !claimsPcAction('I opened my heart to the idea.') && !claimsPcAction('Shall I open Notepad?') && !claimsPcAction('Once upon a time a knight opened the gate.') && !claimsPcAction('I can open apps for you once Hands are on.'));
  const b = fs.readFileSync(path.join(here, '..', 'src', 'brain.js'), 'utf8');
  check('a claim with no Hands tool done this turn gets a visible correction and one chance to really do it', /if \(!reply\.tool_calls && !ctx\.handsDid && !ctx\.claimChecked && claimsPcAction\(reply\.content\)\)/.test(b) && /emit\(\{ type: 'correction', text: CLAIM_CORRECTION \}\)/.test(b) && /reply\.correction = CLAIM_CORRECTION/.test(b) && /continue;/.test(b) && CLAIM_CORRECTION === 'Nothing was actually done on the PC in that reply. Bob said he did, but no action ran.');
  check('the nudge stays out of the chat the user sees', /role: 'system', content: CLAIM_NUDGE, hidden: true/.test(b) && /\.filter\(\(m\) => \(m\.role === 'user' \|\| m\.role === 'assistant'\)/.test(b));
  check('the brain sees history through the stale-error filter', /messages: \[sys, \.\.\.staleHandErrors\(msgs, turnStart\)\]/.test(b));
}

// UI
const ui = fs.readFileSync(path.join(here, '..', 'public', 'hands.js'), 'utf8');
check('the card uses the button text the Hand asks for', /esc\(ev\.button \|\| 'Run it'\)/.test(ui));
check('the chat says when Bob stopped because you took over', /apps-stopped/.test(ui));
const appUi = fs.readFileSync(path.join(here, '..', 'public', 'app.js'), 'utf8');
check('the honesty correction is the app\'s own note line under the reply, also after a reload', /case 'correction':\s*\/\/[^\n]*\n\s*endReply\(ev\);\s*note\(ev\.text, 'error'\);/.test(appUi) && /if \(m\.correction\) note\(m\.correction, 'error'\);/.test(appUi));

// PC review (1.5.2): Alt+F4 says it closes the window; "spin" isn't taken for a PIN field.
{
  const src = fs.readFileSync(new URL('../src/hands-apps.js', import.meta.url), 'utf8');
  check('an Alt+F4 card says it closes the window', keysFor('Alt+F4') === '%{F4}' && /this closes the window/.test(src));
  check('the PIN guard matches the word "pin", not "spin"', /\\bpin\\b/.test(src) && /\bpin\b/i.test('PIN code') && !/\bpin\b/i.test('spin button'));
}
driver.stop();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
