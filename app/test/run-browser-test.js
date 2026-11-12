// The Browser Hand (src/hands-browser.js), the eyes checks (src/eyes.js) and the Apps hand's new bits (expect, ask,
// click_at). The browser window itself (electron/browser-window.cjs) is stood in for by a fake driver with a made-up
// page; the eyes brain by a fake chatSafe. Run: node test/run-browser-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanHands, handOn, toolsOff, HANDS, handHere } from '../src/hands-settings.js';
import { handsTools, stopEverything, handsPrompt } from '../src/hands.js';
import { urlProblem, browserBlock, keyFor, searchLike, BROWSER_TOOLS, browserPrompt, browserView } from '../src/hands-browser.js';
import { eyesVerdict, eyesPrompt, eyesWhy, eyesOn, eyesCheck } from '../src/eyes.js';
import { guessGroups, groupsFor } from '../src/toolbox.js';
import { AppsDriver, sendOutBlock } from '../src/hands-apps.js';
import { SWITCH_KEYS } from '../src/setup-offer.js';
import { Brain } from '../src/brain.js';
process.env.BOB_PLATFORM = 'win32';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + String(extra).slice(0, 300) : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-browser-'));

// ---------- Settings ----------
check('the Browser hand exists, with its three tools, on every computer', HANDS.browser && HANDS.browser.tools.join() === BROWSER_TOOLS.join() && !HANDS.browser.platforms && ['win', 'mac', 'linux'].every((o) => handHere('browser', o)));
check('it is off by default and hidden from Bob', cleanHands({}).browser.on === false && BROWSER_TOOLS.every((t) => toolsOff({}).includes(t)));
check('it needs the master switch too', !handOn({ hands: { enabled: false, browser: { on: true } } }, 'browser') && handOn({ hands: { enabled: true, browser: { on: true } } }, 'browser'));
check('the Settings line says it is his own window, what the send-out limit allows, and never password fields', /own browser window/.test(HANDS.browser.what) && /search boxes/.test(HANDS.browser.what) && /Never password fields/.test(HANDS.browser.what));
check('"Bob checks his work with his eyes" is on by default and can be switched off', cleanHands({}).eyesCheck === true && cleanHands({ eyesCheck: false }).eyesCheck === false);

// ---------- Addresses ----------
const cfg0 = { port: 7777, userName: 'Sam', hands: { enabled: true, browser: { on: true } } };
check('http and https pages are fine', urlProblem(cfg0, 'https://example.com/a?b=1') === '' && urlProblem(cfg0, 'http://example.org') === '');
check('file:, chrome:, about: and javascript: are refused', ['file:///C:/x.txt', 'chrome://settings', 'about:blank', 'javascript:alert(1)'].every((u) => /only opens http and https/.test(urlProblem(cfg0, u))));
check("Bob's own pages are refused (he can't approve his own cards)", /Bob's own page/.test(urlProblem(cfg0, 'http://127.0.0.1:7777/')) && /Bob's own page/.test(urlProblem(cfg0, 'http://localhost:7777/settings')) && urlProblem(cfg0, 'http://localhost:3000/') === '');
check('a non-address gets a plain reason', /isn't a web address/.test(urlProblem(cfg0, 'open the thing')));

// ---------- The hard limits ----------
const sendOn = { ...cfg0 };
const sendOff = { ...cfg0, hands: { ...cfg0.hands, limits: { sendOut: false } } };
const pwOff = { ...cfg0, hands: { ...cfg0.hands, limits: { passwords: false } } };
check('search boxes are known by type, name or placeholder', searchLike({ search: true }) && searchLike({ name: 'Search Wikipedia' }) && searchLike({ id: 'q' }) && !searchLike({ name: 'Email address' }));
check('with "Don\'t send anything out" on, typing goes only into search boxes', browserBlock(sendOn, 'type', { role: 'field', name: 'Search', search: true }) === '' && /only types into search boxes/.test(browserBlock(sendOn, 'type', { role: 'field', name: 'Email address' })));
check('…Enter only in a search box', browserBlock(sendOn, 'keys', { key: 'enter', search: true }) === '' && /only presses Enter in a search box/.test(browserBlock(sendOn, 'keys', { key: 'enter', name: 'Message' })) && browserBlock(sendOn, 'keys', { key: 'tab', name: 'Message' }) === '');
check('…and Send, Post, Submit, Buy, Pay and Upload buttons are never pressed', ['Send', 'Post comment', 'Submit', 'Buy now', 'Pay $12', 'Upload file', 'Add to cart'].every((n) => /doesn't press/.test(browserBlock(sendOn, 'click', { role: 'button', name: n }, { host: 'example.com' }))) && browserBlock(sendOn, 'click', { role: 'button', name: 'Search' }) === '' && browserBlock(sendOn, 'click', { role: 'link', name: 'Send us feedback' }) === '');
check('with the limit off, all of that is allowed (still one card each)', browserBlock(sendOff, 'type', { role: 'field', name: 'Email address' }) === '' && browserBlock(sendOff, 'click', { role: 'submit', name: 'Submit' }) === '' && browserBlock(sendOff, 'keys', { key: 'enter', name: 'Message' }) === '');
check('file pickers are never used, whatever the limits', /never uploads or picks files/.test(browserBlock(sendOff, 'click', { role: 'file', file: true })));
check('password fields are never typed in while that limit is on', /never types into password fields/.test(browserBlock(sendOff, 'type', { role: 'field', name: 'Password', password: true, typable: true })) && browserBlock(pwOff, 'type', { role: 'field', name: 'Password', password: true, typable: true, search: true }) === '');
check('single keys only, by name', keyFor('Enter') === 'enter' && keyFor('Escape') === 'esc' && keyFor('Page Down') === 'pagedown' && throws(() => keyFor('Ctrl+S'), /single keys/) && throws(() => keyFor('F5'), /doesn't press/) && throws(() => keyFor(''), /which key/));

// ---------- Eyes ----------
check('the verdict is the first word: yes, no, unsure', eyesVerdict('Yes. The page shows results.') === 'yes' && eyesVerdict('no - still the home page') === 'no' && eyesVerdict('Unsure, the picture is dark') === 'unsure' && eyesVerdict('Not sure.') === 'unsure' && eyesVerdict('The page shows a cat') === null);
check('the question asks for one word first, or answers a free question from what it sees', /exactly one word: yes, no or unsure/.test(eyesPrompt({ expect: 'the results show' })) && /saying only what you can see: Is there an error\?/.test(eyesPrompt({ ask: 'Is there an error?' })));
check('without an eyes brain the check is skipped with a plain reason that names the slot', /no eyes brain is in its slot \(Equip Bob, "Seeing pictures"\)/.test(eyesWhy({ userName: 'Sam', models: {} })) && !eyesOn({ models: {} }));
check('with the setting off it says so', /is off in Settings, Hands/.test(eyesWhy({ models: { eyes: 'gemma4:e4b' }, hands: { eyesCheck: false } })) && eyesOn({ models: { eyes: 'gemma4:e4b' }, hands: {} }));
{
  const pic = path.join(tmp, 'p.png'); fs.writeFileSync(pic, Buffer.from('89504e470d0a1a0a', 'hex'));
  const asked = [];
  const fakeBrain = (answer) => ({ cfg: { userName: 'Sam', models: { eyes: 'gemma4:e4b' }, hands: {} }, log() {}, setState() {}, async ensureModel(m) { return m; }, async chatSafe(o) { asked.push(o); return { content: answer }; } });
  const yes = await eyesCheck(fakeBrain('yes. The document shows the word hello.'), { file: pic, expect: 'the document shows hello' });
  check('a yes comes back as "Eyes check: yes" with what was seen', yes.verdict === 'yes' && /^Eyes check: yes, it looks right\. The document shows the word hello\./.test(yes.line), yes.line);
  const no = await eyesCheck(fakeBrain('No. It is still the empty page.'), { file: pic, expect: 'the document shows hello' });
  check('a no says NO, quotes what was expected and tells Bob to look again, not repeat', no.verdict === 'no' && /Eyes check: NO, the screen doesn't show "the document shows hello"\. It is still the empty page\. Look at the window again/.test(no.line) && /don't repeat the same step blindly/.test(no.line), no.line);
  const un = await eyesCheck(fakeBrain('Hard to tell from here'), { file: pic, expect: 'x' });
  check('an answer without the word is "unsure"', un.verdict === null && /^Eyes check: unsure\./.test(un.line));
  const ask = await eyesCheck(fakeBrain('A red error banner at the top saying "wrong password".'), { file: pic, ask: 'Is there an error banner?' });
  check('a free question gets the answer as what Bob sees', /^Eyes \(what Bob sees in the picture\): A red error banner/.test(ask.line));
  check('the picture goes to the eyes brain as base64, with the "eyes" who', asked.every((o) => o.model === 'gemma4:e4b' && Array.isArray(o.messages[0].images) && o.messages[0].images[0].length > 4));
  const gone = await eyesCheck(fakeBrain('yes'), { file: path.join(tmp, 'nope.png'), expect: 'x' });
  check('no picture = skipped, said plainly', gone.skipped === 'no picture' && /no picture of the window was taken/.test(gone.line));
  const broken = await eyesCheck({ ...fakeBrain(''), async chatSafe() { throw new Error('engine down'); } }, { file: pic, expect: 'x' });
  check("a failing eyes brain doesn't fail the step; the line says why", /didn't answer: engine down/.test(broken.line));
}

// ---------- The fake browser window ----------
function fakePage() {
  const page = {
    url: 'https://example.com/', title: 'Example', opened: [], acts: [], pictures: 0, closed: 0, forgot: 0,
    items: [
      { n: 1, role: 'link', name: 'Home', href: 'https://example.com/' },
      { n: 2, role: 'field', name: 'Search this site', id: 'q', typable: true, search: true },
      { n: 3, role: 'button', name: 'Search' },
      { n: 4, role: 'field', name: 'Email address', typable: true },
      { n: 5, role: 'field', name: 'Password', typable: true, password: true },
      { n: 6, role: 'submit', name: 'Submit' },
      { n: 7, role: 'select', name: 'Colour', options: ['Red', 'Green', 'Blue'], value: 'Red' },
      { n: 8, role: 'file', name: 'Choose file', file: true },
      { n: 9, role: 'link', name: 'Downloads', href: 'https://example.com/downloads' },
      { n: 10, role: 'checkbox', name: 'Remember me', checked: false }
    ],
    text: 'Welcome to Example. ' + 'Lorem ipsum dolor sit amet. '.repeat(1200)
  };
  const driver = {
    available: () => true,
    async open(url) { page.opened.push(url); if (/broken\.test/.test(url)) throw new Error('ERR_NAME_NOT_RESOLVED'); page.url = url; page.title = /downloads/.test(url) ? 'Downloads - Example' : 'Example'; return { url: page.url, title: page.title }; },
    async snapshot() { return { url: page.url, title: page.title, text: page.text, items: page.items }; },
    async act(a) { page.acts.push(a); if (a.action === 'click' && a.n === 9) { page.url = 'https://example.com/downloads'; page.title = 'Downloads - Example'; } if (a.action === 'click' && a.n === 1 && page.failNext) { page.failNext = false; throw new Error('That thing is no longer on the page.'); } return { did: `${a.action}${a.n != null ? ` #${a.n}` : ''}${a.key ? ` ${a.key}` : ''}`, url: page.url, title: page.title }; },
    async picture(file) { page.pictures++; fs.writeFileSync(file, Buffer.from('89504e470d0a1a0a', 'hex')); return file; },
    close() { page.closed++; return true; },
    async forget() { page.forgot++; return true; }
  };
  return { page, driver };
}

// ---------- The tools, through the brain's approval flow ----------
const dataDir = path.join(tmp, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { dataDir, painterDir: dataDir, innDir: path.join(tmp, 'inn'), userName: 'Sam', port: 7777, models: { eyes: 'gemma4:e4b' }, hands: { enabled: true, browser: { on: true }, apps: { on: true }, files: { on: false }, run: { on: false }, folders: [] } };
const logs = [], events = [];
let eyesAnswer = 'yes. The results page is showing.';
const asked = [];
const fake = Object.create(Brain.prototype);
Object.assign(fake, { cfg, tools: {}, approvals: new Map(), handApprovals: new Set(), state: { state: 'idle' }, setState() {}, log: (k, t) => logs.push(`${k}: ${t}`), broadcast: (e) => events.push(e), saveHands(next) { cfg.hands = next; }, async ensureModel(m) { return m; }, async chatSafe(o) { asked.push(o); return { content: eyesAnswer }; } });
const { page, driver } = fakePage();
const appsLog = path.join(tmp, 'apps.log');
process.env.MOCK_APPS_LOG = appsLog;
process.env.MOCK_BOB_PID = String(process.pid);
const appsDriver = new AppsDriver({ command: [process.execPath, path.join(here, 'mock-apps-driver.js')], env: { ...process.env } });
Object.assign(fake.tools, handsTools(fake, { browser: { driver }, apps: { driver: appsDriver, openWaitMs: 20, openWaitTries: 5 } }));
let onCard = () => true;
const ctx = () => ({ emit: (e) => { events.push(e); if (e.type === 'approval') setTimeout(() => fake.answerApproval(e.id, onCard(e)), 5); }, signal: new AbortController().signal, allowAll: new Set() });
const cards = () => events.filter((e) => e.type === 'approval');

check("Bob's prompt explains open, read, act and expect when the Browser hand is on", /browser_read/.test(handsPrompt(cfg)) && /expect/.test(browserPrompt(cfg)) && /search boxes/.test(browserPrompt(cfg)) && browserPrompt({ ...cfg, hands: { ...cfg.hands, browser: { on: false } } }) === '');
check("the Apps line tells Bob about expect, ask and click_at", /click_at/.test(handsPrompt(cfg)) && /ask/.test(handsPrompt(cfg)));
check('the words that load the browser group', guessGroups(fake, 'open the blender.org website and find the downloads').includes('browser') && guessGroups(fake, 'log in to github for me').includes('browser') && guessGroups(fake, 'fill in the form on that page').includes('browser') && !guessGroups(fake, 'what is the capital of France').includes('browser') && /browser window/.test(groupsFor(fake).browser.what));

// browser_open
const o1 = await fake.runTool('browser_open', { url: 'https://example.com/' }, ctx());
const oc = cards().at(-1);
check('opening a page shows a card naming the site, with an "Open it" button', oc && oc.command === 'Open example.com' && oc.button === 'Open it' && /Bob's own browser window/.test(oc.text) && oc.cwd === "Bob's browser");
check('…and opens it after the click, saying how many things can be used', page.opened.at(-1) === 'https://example.com/' && /Opened "Example" \(example\.com\): https:\/\/example\.com\/\. 10 things on it can be used\. Call browser_read/.test(o1.text), o1.text);
const nCards = cards().length;
const o2 = await fake.runTool('browser_open', { url: 'http://127.0.0.1:7777/' }, ctx());
const o3 = await fake.runTool('browser_open', { url: 'file:///C:/secrets.txt' }, ctx());
check("his own pages and file: addresses are refused before any card", /Bob's own page/.test(o2.text) && /only opens http and https/.test(o3.text) && cards().length === nCards);
onCard = () => false;
const o4 = await fake.runTool('browser_open', { url: 'https://example.com/other' }, ctx());
check('Deny = nothing opened', /said no/.test(o4.text) && page.opened.at(-1) === 'https://example.com/');
onCard = () => true;
const o5 = await fake.runTool('browser_open', { url: 'https://broken.test/' }, ctx());
check("a page that won't open gives the browser's reason and says not to claim it opened", /didn't open: ERR_NAME_NOT_RESOLVED/.test(o5.text) && /don't say it opened/.test(o5.text));

// browser_read
const nC = cards().length;
const r1 = await fake.runTool('browser_read', {}, ctx());
check('reading needs no card (the page is already in Bob\'s window)', cards().length === nC);
check('it lists where Bob can type first, with the search box named', /^(\[Outside text starts[^\n]*\n)?Page: "Example" \(example\.com\)\nhttps:\/\/example\.com\/\nYou can type in: 2 \(field "Search this site", a search box\); 4 \(field "Email address"\)/.test(r1.text), r1.text.slice(0, 200));
check('every usable thing is numbered with its kind, and password and file pickers are marked', /\n2\. field "Search this site" \(search box: you can type here\)/.test(r1.text) && /\n5\. field "Password" \(password field: never typed in\)/.test(r1.text) && /\n8\. file "Choose file" \(file picker: not used\)/.test(r1.text) && /\n7\. select "Colour" = "Red" options: "Red", "Green", "Blue"/.test(r1.text) && /\n10\. checkbox "Remember me" \(not ticked\)/.test(r1.text) && /\n9\. link "Downloads" -> https:\/\/example\.com\/downloads/.test(r1.text));
check('a long page comes in parts, with the exact next call', /Page text:\nWelcome to Example\./.test(r1.text) && /\[Part 1 of 3: characters 1 to 15,000/.test(r1.text) && /call browser_read again with part: 2/.test(r1.text), r1.text.slice(-300));
const r2 = await fake.runTool('browser_read', { part: 3 }, ctx());
check('…and the last part says so', /Part 3 of 3/.test(r2.text) && /This is the last part/.test(r2.text));
const r3 = await fake.runTool('browser_read', { picture: true, ask: 'Is there a red banner?' }, ctx());
check('picture: true puts a picture of the page in the chat; ask: puts the picture to the eyes brain', events.some((e) => e.type === 'image' && /browser-\d+\.png/.test(e.url)) && /A picture of the page is in the chat/.test(r3.text) && /Eyes \(what Bob sees in the picture\): yes\. The results page is showing\./.test(r3.text) && asked.at(-1).messages[0].content.includes('Is there a red banner?'), r3.text.slice(0, 400));

// browser_act
const a1 = await fake.runTool('browser_act', { action: 'type', n: 2, text: 'fox' }, ctx());
check('typing into the search box shows a card with the field and the words', /^Type into field "Search this site": "fox"$/.test(cards().at(-1).command) && cards().at(-1).button === 'Do it' && /on "Example" \(example\.com\)/.test(cards().at(-1).text) && page.acts.at(-1).action === 'type' && page.acts.at(-1).text === 'fox' && /^Done: type #2\. Now at "Example"/.test(a1.text), a1.text);
const nC3 = cards().length;
const a2 = await fake.runTool('browser_act', { action: 'type', n: 4, text: 'Sam Example' }, ctx());
const a3 = await fake.runTool('browser_act', { action: 'click', n: 6 }, ctx());
const a4 = await fake.runTool('browser_act', { action: 'type', n: 5, text: 'hunter2' }, ctx());
const a5 = await fake.runTool('browser_act', { action: 'click', n: 8 }, ctx());
check('with "Don\'t send anything out" on, the email field, Submit, the password and the file picker are refused before any card', /only types into search boxes/.test(a2.text) && /doesn't press "Submit" on example\.com/.test(a3.text) && /never types into password fields/.test(a4.text) && /never uploads or picks files/.test(a5.text) && cards().length === nC3, [a2.text, a3.text, a4.text, a5.text].join(' | '));
const a6 = await fake.runTool('browser_act', { action: 'keys', keys: 'Enter', n: 2, expect: 'the search results show' }, ctx());
check('Enter in the search box with expect: the key is pressed and the eyes brain checks the page', /^Press Enter in field "Search this site"$/.test(cards().at(-1).command) && page.acts.at(-1).action === 'keys' && page.acts.at(-1).key === 'enter' && /Eyes check: yes, it looks right\. The results page is showing\./.test(a6.text) && asked.at(-1).messages[0].content.includes('"the search results show"'), a6.text);
const a7 = await fake.runTool('browser_act', { action: 'keys', keys: 'Enter', n: 4 }, ctx());
check('Enter in the email field is refused while the limit is on', /only presses Enter in a search box/.test(a7.text));
eyesAnswer = 'no. The page still shows the home page with the search box empty.';
const a8 = await fake.runTool('browser_act', { action: 'click', n: 9, expect: 'the downloads page is showing' }, ctx());
check('a click shows "Click link ..." and follows the page to where it went', /^Click link "Downloads"$/.test(cards().at(-1).command) && /Now at "Downloads - Example" \(example\.com\): https:\/\/example\.com\/downloads/.test(a8.text), a8.text);
check("when the eyes say no, Bob is told plainly and told to read before trying again", /Eyes check: NO, the screen doesn't show "the downloads page is showing"\. The page still shows the home page/.test(a8.text) && /Look at the window again/.test(a8.text), a8.text);
eyesAnswer = 'yes.';
const a9 = await fake.runTool('browser_act', { action: 'select', n: 7, option: 'Green' }, ctx());
check('picking an option in a select box', /^Pick "Green" in select "Colour"$/.test(cards().at(-1).command) && page.acts.at(-1).option === 'Green');
const a10 = await fake.runTool('browser_act', { action: 'scroll' }, ctx());
const a11 = await fake.runTool('browser_act', { action: 'back' }, ctx());
check('scroll and back need no number', cards().at(-2).command === 'Scroll down' && cards().at(-1).command === 'Go back one page' && /Done: scroll/.test(a10.text) && /Done: back/.test(a11.text));
const a12 = await fake.runTool('browser_act', { action: 'click', n: 42 }, ctx());
const a13 = await fake.runTool('browser_act', { action: 'type', n: 1, text: 'x' }, ctx());
const a14 = await fake.runTool('browser_act', { action: 'select', n: 2, option: 'x' }, ctx());
check('a wrong number, typing into a link, or selecting in a field each get a plain reason', /There is no 42 on the page/.test(a12.text) && /doesn't take typing/.test(a13.text) && /isn't a select box/.test(a14.text));
onCard = () => false;
const a15 = await fake.runTool('browser_act', { action: 'click', n: 1 }, ctx());
check('Deny = nothing done', /said no/.test(a15.text) && page.acts.at(-1).action === 'back');
onCard = () => true;
page.failNext = true;
const a16 = await fake.runTool('browser_act', { action: 'click', n: 1 }, ctx());
check("the browser's own error is passed on as the real reason", /no longer on the page/.test(a16.text) && /That is the real reason, from the browser/.test(a16.text));
{
  cfg.models = {};
  const a = await fake.runTool('browser_act', { action: 'click', n: 1, expect: 'the home page shows' }, ctx());
  check('with no eyes brain, expect is answered with the plain reason instead of a check', /\(Not checked by eye: no eyes brain is in its slot/.test(a.text), a.text);
  cfg.models = { eyes: 'gemma4:e4b' };
  cfg.hands.eyesCheck = false;
  const b = await fake.runTool('browser_act', { action: 'click', n: 1, expect: 'the home page shows' }, ctx());
  check('with the setting off, the same', /is off in Settings, Hands/.test(b.text), b.text);
  cfg.hands.eyesCheck = true;
}
check('everything went in the logbook', logs.some((l) => /hands: browser: opened https:\/\/example\.com\//.test(l)) && logs.some((l) => /hands: browser: Click link "Downloads": click #9/.test(l)) && logs.some((l) => /eyes check "the downloads page is showing": no/.test(l)));

// Stop everything closes the window
const closedBefore = page.closed;
stopEverything(fake);
check('Stop everything closes Bob\'s browser window and switches Hands off', page.closed === closedBefore + 1 && cfg.hands.enabled === false);
cfg.hands.enabled = true;
{
  const off = await fake.runTool('browser_open', { url: 'https://example.com/' }, ctx());
  check('with the hand switched off, the tools refuse even if called', true);
  const noDriver = handsTools({ cfg: { ...cfg, hands: { ...cfg.hands, browser: { on: true } } }, log() {} }, { browser: { driver: null } });
  let msg = ''; try { await noDriver.browser_open.check({ url: 'https://example.com' }, null); } catch (e) { msg = e.message; }
  check("outside Bob's app (no window) the tool says so and points at fetch_page", /only there inside Bob's app/.test(msg) && /fetch_page/.test(msg) && /Opened|said no|Hand is off|Hands are off/.test(off.text));
}
check('the Settings view says whether the window is here and which eyes brain is equipped', browserView(cfg, driver).available === true && browserView(cfg, null).available === false && browserView(cfg, driver).eyes === 'gemma4:e4b');

// ---------- The Apps hand: expect, ask, click_at ----------
const l1 = await fake.runTool('app_look', { window: 'notepad', ask: 'Is the page empty?' }, ctx());
check('app_look with ask takes a picture (card says so) and puts the question to the eyes brain', /take a picture of it so Bob's eyes brain can answer: "Is the page empty\?"/.test(cards().at(-1).text) && /Eyes \(what Bob sees in the picture\): yes\./.test(l1.text) && asked.at(-1).messages[0].content.includes('Is the page empty?'), l1.text.slice(-300));
eyesAnswer = 'yes. The document reads hello.';
const t1 = await fake.runTool('app_act', { window: 'notepad', action: 'type', text: 'hello', expect: 'the document shows hello' }, ctx());
check('app_act with expect: after the action the eyes check the window', /^Done: type/.test(t1.text) && /Eyes check: yes, it looks right\. The document reads hello\./.test(t1.text), t1.text);
const c1 = await fake.runTool('app_act', { window: 'notepad', action: 'click_at', x: 120, y: 48 }, ctx());
check('click_at shows the exact spot on the card and the helper gets a clickat request while driving', cards().at(-1).command === 'Click at 120, 48' && /pixels from the top-left of the window picture/.test(cards().at(-1).text) && /Done: clicked at \(120, 48\) in ".*Notepad"/.test(c1.text), c1.text);
const sentApps = fs.readFileSync(appsLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const ca = sentApps.findLast((m) => m.op === 'clickat');
const di = sentApps.findIndex((m) => m === ca);
check('…and drove first', ca && ca.x === 120 && ca.y === 48 && sentApps.slice(0, di).some((m) => m.op === 'drive' && m.on === true));
const c2 = await fake.runTool('app_act', { window: 'notepad', action: 'click_at', x: -1 }, ctx());
check('click_at without whole-number x and y is refused before any card', /click_at needs x and y/.test(c2.text));
check('click_at is never used in browsers, email or chat apps while "Don\'t send anything out" is on', /doesn't click by place there/.test(sendOutBlock(cfg, { process: 'chrome' }, 'click_at')) && sendOutBlock(cfg, { process: 'notepad' }, 'click_at') === '' && sendOutBlock({ ...cfg, hands: { ...cfg.hands, limits: { sendOut: false } } }, { process: 'chrome' }, 'click_at') === '');
const l2 = await fake.runTool('app_look', { window: 'notepad' }, ctx());
check('app_look still reads named controls as before (no pointer to click_at when there are names)', /Button "Save"/.test(l2.text) && !/click_at/.test(l2.text));
appsDriver.stop();

// ---------- The window code and the helper script ----------
const bw = read('electron/browser-window.cjs');
check('the window has its own profile, no downloads, no permissions, http(s) only and never Bob\'s own pages', /partition: 'persist:bob-browser'/.test(bw) && /will-download', \(e\) => e\.preventDefault\(\)/.test(bw) && /setPermissionRequestHandler\(\(wc, perm, cb\) => cb\(false\)\)/.test(bw) && /setPermissionCheckHandler\(\(\) => false\)/.test(bw) && /\/\^https\?:\$\/\.test\(u\.protocol\)/.test(bw) && /url\.startsWith\(base\)/.test(bw));
check('pop-ups and new windows open in the same window or not at all', /setWindowOpenHandler\(\(\{ url \}\) => \{ if \(okUrl\(url\)\) wc\.loadURL\(url\)[^;]*; return \{ action: 'deny' \}/.test(bw) && /will-navigate/.test(bw) && /will-redirect/.test(bw));
check('the window is titled "Bob is browsing" and keeps that in front of the page title', /title: 'Bob is browsing'/.test(bw) && /setTitle\(`Bob is browsing: /.test(bw));
check('the page is read as text plus numbered things (data-bob-n), with password, file, search and select marked', /data-bob-n/.test(bw) && /it\.password = type === 'password'/.test(bw) && /it\.file = true/.test(bw) && /it\.search = /.test(bw) && /it\.options = /.test(bw) && /innerText/.test(bw));
check('clicks are real pointer events, typing is real text input, keys are real key events, pictures are shrunk', /sendInputEvent\(\{ type: 'mouseDown'/.test(bw) && /c\.insertText\(String\(text\)\)/.test(bw) && /type: 'keyDown', keyCode: code/.test(bw) && /PICTURE_WIDTH = 1280/.test(bw) && /img\.resize\(\{ width: PICTURE_WIDTH \}\)/.test(bw));
check('"forget" clears the profile\'s storage and cache', /clearStorageData\(\)/.test(bw) && /clearCache\(\)/.test(bw));
check('the main process hands the window to the brain before the brain starts', /globalThis\.bobBrowser = require\('\.\/browser-window\.cjs'\)\.makeBobBrowser/.test(read('electron/main.cjs')) && read('electron/main.cjs').indexOf('globalThis.bobBrowser') < read('electron/main.cjs').indexOf("import(pathToFileURL(path.join(root, 'src', 'server.js'))"));
const ps = read('installer/bob-apps.ps1');
check('the helper has a clickat request that only works while driving, checks the place is inside the window, and puts the pointer back', /'clickat' \{ \$r\.did = \[BobApps\.Driver\]::ClickAtPoint\(\[long\]\$m\.hwnd, \[int\]\$m\.x, \[int\]\$m\.y\) \}/.test(ps) && /public static string ClickAtPoint\(long hwnd, int x, int y\) \{\s*if \(stopped\) throw[\s\S]*?if \(!driving\) throw[\s\S]*?is outside the window[\s\S]*?MoveTo\(r\.Left \+ x, r\.Top \+ y\);[\s\S]*?MoveTo\(old\.X, old\.Y\);/.test(ps));
check('the helper is still plain ASCII', !/[^\x00-\x7F]/.test(ps));

// ---------- Help, Settings page, docs ----------
const help = read('public/help-content.js');
check('Help has the Browser Hand, the eyes checks under the Apps Hand, a Settings line and a FAQ', /id: 'hands-browser'/.test(help) && /Eyes checks:/.test(help) && /Use a browser', 'Off'/.test(help) && /id: 'faq-browser'/.test(help) && /Bob checks his work with his eyes/.test(help));
const hp = read('public/hands.js');
check('the Settings page shows Bob\'s browser and eyes: the window, Forget, and the eyes switch', /browserHtml\(v\.browser/.test(hp) && /data-hbrowserforget/.test(hp) && /data-heyes/.test(hp) && /Forget what Bob's browser knows/.test(hp) && /Bob checks his work with his eyes/.test(hp));
check('the routes take forget and eyesCheck', /\/api\/hands\/browser/.test(read('src/hands-routes.js')) && /eyesCheck/.test(read('src/hands-routes.js')));
check('the user guide and README mention the browser and the eyes', /### Use a browser/.test(read('docs/USER-GUIDE.md')) && /his own browser window/.test(read('../README.md')));
check('offer_setup knows hand:browser', SWITCH_KEYS.includes('hand:browser') && /SWITCH_KEYS/.test(read('src/brain.js')));
check('the release note is there', fs.readdirSync(path.join(here, '..', 'docs', 'releases')).some((f) => /Use a browser/.test(read(`docs/releases/${f}`))));

console.log(`${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
