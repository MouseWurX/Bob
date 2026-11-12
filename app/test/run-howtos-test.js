// 1.5.80 How-tos: Bob keeps the steps of a job that worked (one card, your click) and follows them next time.
// Off by default; nothing is offered, used or added to his tools or prompt while the switch is off.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain.js';
import { HowTos, worthOffering, trailStep, nameFrom, howtoPrompt, howtosOn, MIN_STEPS } from '../src/howtos.js';
import { guessGroups } from '../src/toolbox.js';
import { saveSettings, SETTING_KEYS } from '../src/config.js';
import { settingsNow } from '../src/self-help.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-howtos-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(innDir, 'note.txt'), 'hello');
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  memoryFile: path.join(innDir, 'memory.md'), models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };

// ---------- The store ----------
{
  const h = new HowTos(cfg);
  check('off unless turned on', !howtosOn(cfg) && !howtosOn({ howtos: 'yes' }) && howtosOn({ howtos: true }));
  check('the setting is saved like the others', SETTING_KEYS.includes('howtos'));
  { const n = nameFrom('Please resize the pictures in my Downloads, zip them and put the zip on the desktop. Thanks!'); check('a short name from the request (first sentence, no "please", cut at a word)', n.startsWith('Resize the pictures in my Downloads') && n.length <= 60 && !/\s$/.test(n), n); }
  const steps = [trailStep('list_folder', 'list Downloads'), trailStep('resize', 'resize 12 pictures'), trailStep('zip', 'zip them')];
  check(`${MIN_STEPS} good steps of two or more kinds are worth a card`, worthOffering(steps)?.length === 3);
  check('two steps are not', !worthOffering(steps.slice(0, 2)));
  check('the same tool three times is not', !worthOffering([trailStep('read_file', 'a'), trailStep('read_file', 'b'), trailStep('read_file', 'c')]));
  check('a job that ended on a failure is not', !worthOffering([...steps, trailStep('write_file', 'save', 'Error: no room')]));
  check('a failure fixed later still is (the failed step is left out)', worthOffering([steps[0], trailStep('zip', 'zip', 'Error: x'), steps[1], steps[2]])?.length === 3);
  check('a step turned down on a card is a failure', trailStep('run_command', 'npm i', 'The user said no to this on the card.')?.failed === true);
  check('bookkeeping tools are not steps', trailStep('use_tools', 'x') === null && trailStep('remember', 'x') === null && trailStep('bob_help', 'x') === null);
  const r = h.add({ name: 'Zip my pictures', when: 'resize the pictures in my downloads and zip them', steps });
  check('saved in inn\\bob\\howtos.json on this replicant matrix', fs.existsSync(path.join(dataDir, 'howtos.json')) && h.list().length === 1);
  check('a matching request finds it by words', h.match('can you resize and zip the pictures in downloads again')?.id === r.id);
  check('an unrelated request finds nothing', h.match('what is the weather like tomorrow') === null);
  check('a one-word message finds nothing', h.match('pictures') === null);
  check('by meaning when vectors are there', (h.setVec(r.id, [1, 0, 0]), h.match('shrink my photo folder into an archive', [0.99, 0.05, 0]))?.id === r.id);
  check('vectors are not shown in the list', !('vec' in h.list()[0]));
  const e = h.edit(r.id, { name: 'Zip pictures', steps: '1. list Downloads\n2. resize them\n\n3) zip them' });
  check('the person\'s edit: steps one per line, numbers tidied, blanks dropped', e.name === 'Zip pictures' && e.steps.map((s) => s.did).join('|') === 'list Downloads|resize them|zip them' && e.edited === true);
  check('an edit can\'t leave no steps', (() => { try { h.edit(r.id, { steps: '' }); return false; } catch { return true; } })());
  h.used(r.id);
  check('use is counted', h.list()[0].used === 1 && h.list()[0].lastUsed > 0);
  const p = howtoPrompt(h.list()[0], 'Sam');
  check('the prompt line says OKs still apply and fits in about 300 tokens', /tools that ask still ask/.test(p) && p.length < 1200, p);
  check('covered: no second card for the same job', h.covered('resize the pictures in my downloads and zip them'));
  const o = h.offer({ sessionId: 's', when: 'do a thing', steps: ['a', 'b', 'c'] });
  check('a card\'s offer is taken once', h.takeOffer(o.id)?.id === o.id && h.takeOffer(o.id) === null);
  const old = h.offer({ sessionId: 's', when: 'x', steps: ['a'] }); old.at -= 11 * 60_000;
  check('an offer older than 10 minutes is gone', h.takeOffer(old.id) === null);
  check('delete', h.remove(r.id) && h.list().length === 0);
}

// ---------- Bob, with a fake brain ----------
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192;
const seen = [];
let script = [];
// Item 1 (Nov 11): the turn's changing lines ride in a note before the latest message, so read every system message.
brain.engine = { chat: async ({ tools, messages }) => { seen.push({ names: tools.map((t) => t.function.name), sys: messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n') }); return script.shift() || { role: 'assistant', content: 'Done.' }; }, unloadAll: async () => {}, isLoaded: async () => true };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
// Three steps that need no OK card: list a folder, read a file, list another folder (use_tools in between isn't a step).
const job3 = () => [call('list_folder', { path: innDir }), call('read_file', { path: path.join(innDir, 'note.txt') }), call('use_tools', { group: 'documents' }), call('list_folder', { path: dataDir })];
const turn = async (text, replies, sessionId) => { seen.length = 0; script = replies; const evs = []; await brain.run(sessionId, text, (ev) => evs.push(ev), new AbortController().signal); return evs; };

{
  const evs = await turn('copy my note into a new file in the inn folder', job3(), 'off1');
  check('switch off: no card after a job with steps', !evs.some((e) => e.type === 'howto-offer'));
  check('switch off: no how-to tools', !seen.some((s) => s.names.includes('save_howto') || s.names.includes('my_howtos')));
  check('switch off: "how-to" words add nothing', !guessGroups(brain, 'save that as a how-to').includes('howtos'));
}
saveSettings(cfg, { howtos: true });
check('settings say it is on', /Let Bob learn how-tos: on/.test(settingsNow(cfg)));
let offer;
{
  const evs = await turn('copy my note into a new file in the inn folder', job3(), 'on1');
  offer = evs.find((e) => e.type === 'howto-offer');
  check('switch on: one card after the job worked', evs.filter((e) => e.type === 'howto-offer').length === 1 && offer.steps.length === 3, JSON.stringify(evs.map((e) => e.type)));
  check('the card comes before the turn ends, in that chat', offer?.sessionId === 'on1');
  check('the card\'s steps are what was done, not the toolbox', !offer.steps.some((s) => /use_tools|group/.test(s)), offer.steps.join(' | '));
  check('nothing is kept before the click', brain.howtos.list().length === 0);
  const no = await brain.answerHowto(offer.id, false);
  check('Not now keeps nothing', no.ok && no.saved === null && brain.howtos.list().length === 0);
  const again = await brain.answerHowto(offer.id, true);
  check('an answered card can\'t be used again', again.ok === false && /too old/.test(again.why));
}
{
  const evs = await turn('copy my note into a new file in the inn folder', job3(), 'on2');
  offer = evs.find((e) => e.type === 'howto-offer');
  const yes = await brain.answerHowto(offer.id, true, 'Copy a note');
  check('Save how-to keeps it with the name typed on the card', yes.ok && yes.saved?.name === 'Copy a note' && brain.howtos.list().length === 1);
}
{
  const evs = await turn('please copy my note into a new file in the inn folder again', [], 'on3');
  const line = evs.find((e) => e.type === 'tool' && e.name === 'howto');
  check('next time the chat says it follows the how-to', line && /📒 Following my how-to "Copy a note"/.test(line.summary), JSON.stringify(evs.filter((e) => e.type === 'tool')));
  check('and the steps are in that turn\'s instructions', /A how-to you saved/.test(seen[0].sys) && /tools that ask still ask/.test(seen[0].sys));
  check('used once', brain.howtos.list()[0].used === 1);
}
{
  await turn('hi Bob, how are you today?', [], 'on4');
  check('an unrelated message carries no how-to', !/A how-to you saved/.test(seen[0].sys));
}
{
  const evs = await turn('please copy my note into a new file in the inn folder again', job3(), 'on5');
  check('no new card when a how-to was followed', !evs.some((e) => e.type === 'howto-offer'));
}
{
  const evs = await turn('read my note, list the inn and write a copy', [call('list_folder', { path: innDir }), call('read_file', { path: path.join(innDir, 'nope.txt') })], 'on6');
  check('no card after a job that ended on a failure', !evs.some((e) => e.type === 'howto-offer'));
}
{
  // "keep those steps": save_howto puts the card up for the last job in this chat.
  await turn('list the inn, read the note and make a copy of it', job3(), 'on7');
  check('"keep those steps" adds the how-to tools', guessGroups(brain, 'keep those steps please').includes('howtos'));
  const evs = await turn('keep those steps please', [call('save_howto', { name: 'Note copy' })], 'on7');
  const c = evs.filter((e) => e.type === 'howto-offer');
  check('save_howto puts up one card (still needs the click)', c.length === 1 && c[0].name === 'Note copy' && brain.howtos.list().length === 1);
  const evs2 = await turn('save that as a how-to', [call('save_howto', {})], 'fresh');
  check('with no job worth keeping in the chat, save_howto says so and shows no card', !evs2.some((e) => e.type === 'howto-offer'));
}
{
  const j = { id: 'g', guest: { from: 'Laptop Bob' }, sessionId: 'guest' };
  const out = brain.howtoAfter('guest', 'x', { trail: [trailStep('a', 'a'), trailStep('b', 'b'), trailStep('c', 'c')] }, () => {}, j);
  check('a job from another Bob never gets a card', out === null);
}

// ---------- Settings, server, the card, Help, docs (all desktop builds share these files) ----------
{
  const cellar = read('public/cellar.js'), app = read('public/app.js'), server = read('src/server.js'), help = HELP.map((e) => e.html).join('\n');
  check('Settings: the switch on How Bob works, off unless turned on', /sswitch\('howtos', settings\.howtos === true, 'Let Bob learn how-tos', 'Off unless you turn it on\./.test(cellar));
  check('Settings: how-tos in the 🧰 Tools and how-tos Bob made panel with Edit and a two-step Delete (no pop-up; 1.5.144)', /'🧰 Tools and how-tos Bob made'/.test(cellar) && /How-tos he kept/.test(cellar) && /data-howtoedit/.test(cellar) && /Keep it/.test(cellar) && !/confirm\(/.test(cellar.slice(cellar.indexOf('function ownKitHtml'), cellar.indexOf('function ownKitHtml') + 8000)));
  check('the chat card has Save how-to and Not now', /Keep the steps as a how-to\?/.test(app) && /Save how-to/.test(app) && /Not now/.test(app));
  check('the server: list, answer, and PC-only edit and delete', /\/api\/howtos'/.test(server) && /\/api\/howtos\/answer/.test(server) && /Recipes can only|How-tos can only be changed on this replicant matrix itself/.test(server));
  check('Help has an entry, the setting, the glossary and two FAQs', HELP.some((e) => e.id === 'howtos') && /Let Bob learn how-tos/.test(help) && /<dt>How-to<\/dt>/.test(help) && HELP.some((e) => e.id === 'faq-howto-recipe') && HELP.some((e) => e.id === 'faq-howto-asking'));
  check('Help says how-tos never go online', /How-tos stay on this replicant matrix/.test(help) && /Topics and How-tos/.test(help));
  check('release notes and the user guide', fs.existsSync(path.join(root, 'docs/releases/v1.5.80.md')) && /Let Bob learn how-tos/.test(read('docs/USER-GUIDE.md')));
  check('the store uses Bob\'s data folder, so Windows, Mac and Linux all work the same', /path\.join\(this\.cfg\.dataDir, 'howtos\.json'\)/.test(read('src/howtos.js')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
