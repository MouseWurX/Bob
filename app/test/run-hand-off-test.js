// Nov 18 (a 120B brain test): with Hands off, Bob promised a folder-and-script job ("I'll create the folder... 📝 Noted")
// and did nothing. And a Files call to a folder that isn't ticked was refused, then offer_setup asked for the Files
// Hand that was already on, and nothing showed at all. The harness now handles both (src/hand-off-promise.js,
// src/folder-offer.js, the folder card in brain-setup-offers.js). Nothing here touches the disk outside a temp folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handOffPromise, HAND_OFF_LINE } from '../src/hand-off-promise.js';
import { refusedFolder, FOLDER_REFUSED } from '../src/folder-offer.js';
import { setupParts } from '../src/brain-setup-offers.js';
import { cleanPath, looksLikePath } from '../src/clean-path.js';
import { cleanHands } from '../src/hands-settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${more ? ' :: ' + more : ''}`); } };

// ---------- the promise with Hands off ----------
const ask = 'make a folder called bob-120b-test on my desktop, put a primes.py script in it that prints the first 20 primes, run it, and save the output to result.txt';
const said = 'I\'ll create the bob-120b-test folder on your Desktop, add the primes.py script, run it, and write the result to result.txt.\n\nFirst, I\'ll assume the Desktop path is C:\\Users\\you\\Desktop. If that\'s a different location, let me know.\n\n📝 Noted: Create folder bob-120b-test on Desktop, add primes.py, run script, save result.txt.';
const none = () => false;
check('the promise from the test is caught: the Run Hand is offered', handOffPromise({ ask, reply: said, usable: none }) === 'hand:run');
check('with Run on and a file tool, nothing to do here', handOffPromise({ ask, reply: said, usable: (n) => n === 'run_command' || n === 'write_file' }) === '');
check('with Run on but no file tool, the Files Hand is offered', handOffPromise({ ask, reply: said, usable: (n) => n === 'run_command' }) === 'hand:files');
check('a folder job alone offers Files when he has no file tool', handOffPromise({ ask: 'move my photos into a new folder', reply: 'I\'ll move them now.', usable: none }) === 'hand:files');
check('not when he already said the Hand is off', handOffPromise({ ask, reply: 'I can\'t run it: the Run programs Hand is off. Switch it on and I will.', usable: none }) === '');
check('not when he only asks', handOffPromise({ ask, reply: 'Which folder should it go in?', usable: none }) === '');
check('not for a plain chat ask', handOffPromise({ ask: 'what is a prime number?', reply: 'I\'ll explain: a prime has two divisors.', usable: none }) === '');
check('the line says nothing was done and points at the card', /haven't done any of that/.test(HAND_OFF_LINE('Let Bob use Hands, Run programs and scripts')) && /Switch it on/.test(HAND_OFF_LINE('x')));
const runOn = read('src/brain-run-on.js');
check('the reply loop checks it before the "do it now" nudge, and shows the card', runOn.indexOf('handOffPromise(') > 0 && runOn.indexOf('handOffPromise(') < runOn.indexOf('promisesAction(reply.content)') && /this\.offerSetup\(need, ctx, \{ quiet: true \}\)/.test(runOn) && /ctx\.promiseChecked = true/.test(runOn));

// ---------- the folder that isn't ticked ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-handoff-'));
const desk = path.join(tmp, 'Desktop'); fs.mkdirSync(desk);
const ticked = path.join(tmp, 'Documents'); fs.mkdirSync(ticked);
check('the refusal words are known', FOLDER_REFUSED.test(`I can only work with files in: ${ticked}. You can tick more folders in Settings, Hands.`) && FOLDER_REFUSED.test(`I can only save in: ${ticked}.`) && FOLDER_REFUSED.test('No folders are ticked for the Files Hand yet.'));
check('the nearest folder that exists is offered (the new folder isn\'t there yet)', refusedFolder({ op: 'copy', from: path.join(ticked, 'a.txt'), to: path.join(desk, 'bob-120b-test', 'a.txt') }, [ticked]) === desk);
check('a path inside a ticked folder isn\'t offered', refusedFolder({ from: path.join(ticked, 'x') }, [ticked]) === '');
check('never the top of a disk', refusedFolder({ to: path.join(path.parse(tmp).root, 'nope-not-here-' + Date.now(), 'x.txt') }, [ticked]) === '');
check('never a folder Bob may not have', refusedFolder({ to: path.join(desk, 'x.txt') }, [ticked], { never: [desk] }) === '');

const emitted = [], saved = [], logs = [], notes = [];
const cfg = { userName: 'Sam', dataDir: path.join(tmp, 'data'), hands: { enabled: true, files: { on: true }, folders: [ticked] } };
const fake = { cfg, log: (k, t) => logs.push(t), saveHands: (h) => { saved.push(h); cfg.hands = h; }, broadcast: () => {}, carryOnNow: (id, n) => notes.push([id, n]), ...setupParts };
const ctx = { emit: (e) => emitted.push(e), job: { id: 'j1' } };
const words = fake.offerFolder({ to: path.join(desk, 'bob-120b-test', 'primes.py') }, ctx);
const card = emitted.find((e) => e.type === 'offer-setup');
check('the refusal puts up the Add it card', card && card.kind === 'folder' && card.folder === desk && card.carryOn === true && /one press adds it/.test(words));
check('one card per folder per turn', /already under the chat/.test(fake.offerFolder({ to: path.join(desk, 'y.txt') }, ctx)) && emitted.filter((e) => e.type === 'offer-setup').length === 1);
const r = await fake.answerSetup(card.id, true);
check('pressing Add it adds the folder and carries on with the job', r.ok && r.done === 'folder' && cfg.hands.folders.includes(desk) && cfg.hands.folders.includes(ticked) && notes[0]?.[0] === 'j1');
check('a guest job gets no card', fake.offerFolder({ to: path.join(tmp, 'z', 'q.txt') }, { emit: () => {}, job: { guest: { from: 'Desk' } } }) === '');

// ---------- offer_setup for a Hand that's already on ----------
const why = await fake.offerSetup('hand:files', { emit: () => {}, lastFailed: { name: 'file_hands', text: `Error: I can only work with files in: ${ticked}.` } });
check('offer_setup for a Hand that\'s on says what really stopped the call', /already on/.test(why) && /file_hands/.test(why) && /I can only work with files in/.test(why), why);
check('with no failed call it still just says it\'s on', /already on\. Go ahead/.test(await fake.offerSetup('hand:files', { emit: () => {} })));
const runs = read('src/brain-tool-runs.js');
check('the tool runner keeps the last failure and offers the folder card on a refusal', /ctx\.lastFailed = \{ name, text/.test(runs) && (runs.match(/FOLDER_REFUSED\.test/g) || []).length === 2);
check('the card is drawn on the PC page and both phone copies', /ev\.kind === 'folder'/.test(read('public/app-replies.js')) && /r\.done === 'folder'/.test(read('public/app.js')) && ['public/phone/phone.js', 'android/app/src/main/assets/www/phone.js'].every((f) => /ev\.kind === 'folder'/.test(read(f)) && /out\.done === 'folder'/.test(read(f))));

// ---------- pasted paths (Settings, Hands: Add did nothing, four times) ----------
check('the invisible mark from Properties > Security goes', cleanPath('\u202aC:\\Users\\you\\OneDrive\\Desktop') === 'C:\\Users\\you\\OneDrive\\Desktop');
check('"Copy as path" quotes and spaces go', cleanPath('  "C:\\Users\\you\\Desktop"  ') === 'C:\\Users\\you\\Desktop' && cleanPath("'/home/you/x'") === '/home/you/x');
check('other invisible marks go too', cleanPath('\ufeff\u200e\u2066/home/you\u2069\u200f') === '/home/you');
check('plain words stay as they are and aren\'t a path', cleanPath('hello') === 'hello' && !looksLikePath('hello') && looksLikePath('\u202aC:\\x'));
check('saved Hands folders are cleaned too', cleanHands({ folders: ['\u202a' + ticked, `"${desk}"`] }).folders.join('|') === [ticked, desk].join('|'));
const strip = (f) => read(f).replace(/^\/\/.*\n/gm, '').replace(/\nexport function installPathCleaning[\s\S]*$/, '').trim();
check('the page copy cleans the same way as the server', strip('src/clean-path.js') === strip('public/clean-path.js'), strip('public/clean-path.js').slice(-200));
const routes = read('src/hands-routes.js'), hands = read('public/hands.js');
check('the Hands route cleans first and says which paths it refused', /xs\.map\(cleanPath\)/.test(routes) && /refused\.push\(f\)/.test(routes) && /\{ \.\.\.handsView\(cfg\), refused \}/.test(routes));
check('Settings, Hands says why a folder wasn\'t added, and has Browse… for allowed folders', /That folder doesn't exist on this replicant matrix/.test(hands) && /data-hfolderbrowse/.test(hands) && /'hfolderbrowse' in b\.dataset/.test(hands));
check('every page with path boxes cleans pasted paths', ['public/app.js', 'public/settings-window.js', 'public/lab-window.js'].every((f) => /installPathCleaning\(\);/.test(read(f))));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
