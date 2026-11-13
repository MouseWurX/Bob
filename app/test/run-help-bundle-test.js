// 1.5.118 Save a help bundle: one zip for whoever helps with this Bob. The scrubbing, the no-brain fallback, the
// brain's own note when the chat brain is loaded and idle, the zip itself, the button, the route and the Help.
import { serverText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scrubber, scrubObject, errorLines, chatReadout, handoffText, brainNote, buildBundle, saveHelpBundle, bundleBytes, recentChats, bundleName, revealFile, REPO } from '../src/help-bundle.js';
import { readZipList, unzip } from '../src/zip.js';
import { HELP } from '../public/help-content.js';
import { plainText } from '../src/self-help.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-help-bundle-'));
const OWNER = 'Pumpernickel', USER = 'pumper', HOST = 'pumpkin-pc', HOME = path.join(tmp, 'home', USER), PASS = '48213977', TOKEN = '1234567890:ABHxyzABCdefGHIjklMNOpqrSTUvwxYZ0123456';
const cfg = {
  agentDir: path.join(tmp, 'agent'), innDir: path.join(tmp, 'agent', 'inn'), dataDir: path.join(tmp, 'agent', 'inn', 'bob'), painterDir: path.join(tmp, 'agent', 'inn', 'painter'),
  logbook: path.join(tmp, 'agent', 'inn', 'logbook.md'), memoryFile: path.join(tmp, 'agent', 'inn', 'bob-memory.md'), port: 7777, engine: 'llamacpp', timeZone: 'UTC',
  callMe: OWNER, userName: OWNER, windowsName: OWNER, remote: { enabled: true, passcode: PASS }, share: { borrow: { bobs: [{ name: 'Laptop', address: '100.101.102.103', passcode: 'sesame99' }] } },
  models: { bob: 'qwen3.6-35b-a3b', tinker: 'qwen3.6-35b-a3b', quick: 'gemma4-e4b' }, session: 'normal', webSearch: false, autostart: false, cloudHelpers: { openai: { enabled: false, apiKey: 'sk-should-never-show-1234567890-x' } }
};
for (const d of [cfg.dataDir, path.join(cfg.dataDir, 'sessions'), cfg.painterDir, HOME]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(cfg.logbook, `# Bob's logbook\n\n- 2026-11-05 03:00 | model | woke qwen3.6-35b-a3b in 12.0 s (chat)\n- 2026-11-05 03:01 | tool | read ${HOME}\\notes.txt for ${OWNER}\n- 2026-11-05 03:02 | error | fetch_page: ECONNREFUSED 100.101.102.103:7777\n- 2026-11-05 03:03 | handoff | qwen3.6-35b-a3b dropped out mid-answer (socket hang up); loading it again\n- 2026-11-05 03:04 | settings | changed: webSearch\n- 2026-11-05 03:05 | engine | llama-server stopped as it started (code 0xC0000135)\n`);
fs.writeFileSync(path.join(cfg.dataDir, 'sessions', 'main.json'), JSON.stringify([
  { role: 'system', content: `You are Bob. The user is ${OWNER}.` },
  { role: 'user', text: `hi, I'm ${OWNER}, my passcode is ${PASS} and the bot token is ${TOKEN}`, content: 'hi', id: 'a1', at: 1762300000000 },
  { role: 'assistant', content: `Hello ${OWNER}. I won't repeat that.`, id: 'a2', at: 1762300001000, tool_calls: [{ function: { name: 'bob_help' } }] },
  { role: 'tool', content: 'Help text about settings' },
  { role: 'user', text: 'why are you slow?', content: 'why are you slow?', id: 'a3', at: 1762300002000 },
  { role: 'assistant', content: 'The card is busy with pumpkin-pc\'s game.', id: 'a4', at: 1762300003000 }
]));
fs.writeFileSync(path.join(cfg.dataDir, 'sessions', 'old-one.json'), JSON.stringify([{ role: 'user', text: 'old', content: 'old', id: 'b1', at: 1762200000000 }]));
fs.utimesSync(path.join(cfg.dataDir, 'sessions', 'old-one.json'), new Date(1762200000000), new Date(1762200000000));
fs.writeFileSync(path.join(cfg.dataDir, 'sessions', 'main.summary.json'), '{}');
fs.writeFileSync(path.join(cfg.dataDir, 'sessions', 'main.older.json'), '[]');

const scrubOpts = { env: { BOB_TELEGRAM_TOKEN: TOKEN, OPENAI_API_KEY: 'sk-live-abcdefghijklmnopqrstuvwxyz' }, home: HOME, host: HOST, user: USER };
const scrub = scrubber(cfg, scrubOpts);

// ---- scrubbing
{
  const out = scrub(`${OWNER} (${USER}) on ${HOST} at ${HOME}\\x.txt, passcode ${PASS}, token ${TOKEN}, key sk-live-abcdefghijklmnopqrstuvwxyz, hf hf_ABCDEFGHIJKLMNOPQRSTU, ts 100.101.102.103 and laptop.tail1234.ts.net, sesame99`);
  check('the owner\'s names become "the owner"', !out.includes(OWNER) && !out.includes(USER) && /the owner \(the owner\)/.test(out));
  check('the machine name becomes "the replicant matrix"', !out.includes(HOST) && /on the replicant matrix/.test(out));
  check('the home folder becomes <home>', !out.includes(HOME) && /<home>\\x\.txt/.test(out));
  check('the passcode, the other Bob\'s passcode, the bot token, keys and Tailscale addresses are hidden', !out.includes(PASS) && !out.includes('sesame99') && !out.includes(TOKEN) && !/sk-live/.test(out) && !/hf_ABC/.test(out) && !out.includes('100.101.102.103') && !/tail1234/.test(out), out);
  check('Bob\'s own word "bob" and ordinary text survive', scrub('Bob read bobbing boats') === 'Bob read bobbing boats');
  check('a name inside another word is left alone', scrubber({ callMe: 'Sam' }, scrubOpts)('Samantha and Sam went sampling') === 'Samantha and the owner went sampling');
  const o = scrubObject({ remote: { enabled: true, passcode: PASS, hosts: ['100.101.102.103'] }, cloud: { apiKey: 'x', model: 'gpt' }, telegram: { token: 'abc', chatId: 5 }, name: OWNER, list: [{ password: 'p' }], empty: { apiKey: '' } }, scrub);
  check('scrubObject drops every secret-looking value but keeps the keys', o.remote.passcode === '[hidden]' && o.cloud.apiKey === '[hidden]' && o.telegram.token === '[hidden]' && o.list[0].password === '[hidden]' && o.cloud.model === 'gpt' && o.telegram.chatId === 5 && o.empty.apiKey === '');
  check('scrubObject scrubs plain strings too', o.name === 'the owner' && o.remote.hosts[0] === '[tailscale address]');
}

// ---- pieces
{
  const errs = errorLines(fs.readFileSync(cfg.logbook, 'utf8'));
  check('errorLines keeps error, handoff and engine lines and the plain-English failures only', errs.length === 3 && errs.every((l) => /error|handoff|engine/.test(l)) && !errs.some((l) => /woke|changed:/.test(l)), String(errs.length));
  const readout = chatReadout(JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'sessions', 'main.json'), 'utf8')), scrub);
  check('a chat readout names who said what, tool calls and results, scrubbed', /\*\*The owner \(\d{4}-\d\d-\d\d [\d:]+Z\):\*\* hi, I'm the owner, my passcode is \[hidden\] and the bot token is \[hidden\]/.test(readout) && /\*\*Bob .*:\*\* Hello the owner\. I won't repeat that\. \[called bob_help\]/.test(readout) && /\*tool result:\* Help text/.test(readout) && /\*system note:\*/.test(readout) && !readout.includes(HOST), readout.slice(0, 200));
  check('an empty chat says so', chatReadout([], scrub) === '(empty chat)');
  const recent = recentChats(cfg);
  check('recentChats lists chats newest first, without the older and summary files', recent.map((c) => c.id).join(',') === 'main,old-one', recent.map((c) => c.id).join(','));
  check('bundleName carries the date and time', /^bob-help-bundle-\d{8}-\d{4}\.zip$/.test(bundleName(new Date('2026-11-05T05:30:00Z'))), bundleName());
  const facts = { bob: { version: '1.5.117', build: 168, engine: "Bob's own (llama.cpp)", agentDir: 'C:\\Bob', innDir: 'C:\\Bob\\inn', port: 7777, electron: true, at: 'now' }, platform: { os: 'win32', release: '10', arch: 'x64', node: '22', cpus: 16, cpu: 'Ryzen', ramGB: 32, freeRamGB: 10 }, hardware: { gpu: { name: 'RTX', vramGB: 16 } }, engines: [{ id: 'llamacpp', ok: false, why: 'it stopped as it started' }, { id: 'sdcpp', ok: true }], models: { bob: 'qwen' }, brain: { state: { state: 'idle' }, busy: false, session: { label: 'Normal' }, loaded: [] }, queue: [{ state: 'failed', status: 'failed', text: 'paint a cat', error: 'no painter' }, { state: 'done', text: 'done one' }], settingsNow: 'Web search: off\nHands: off' };
  const auto = handoffText(facts, { note: { text: '', why: 'the engine didn\'t answer' }, errors: ['- e1'], chats: ['main.md'] });
  check('HANDOFF.md links the public repo and the exact version, and tells the agent where to start', auto.includes(REPO) && /Bob 1\.5\.117 \(build 168\)/.test(auto) && /## Where to start, agent/.test(auto) && /src\/server\.js/.test(auto) && /not a programmer/.test(auto));
  check('HANDOFF.md lists the engines, brains, failed jobs, errors and settings', /llamacpp: does not start \(it stopped as it started\)/.test(auto) && /sdcpp: starts/.test(auto) && /- bob: qwen/.test(auto) && /- failed: paint a cat \(error: no painter\)/.test(auto) && !/done one/.test(auto) && /- e1/.test(auto) && /- Web search: off/.test(auto));
  check('without a brain note it says so and tells the agent to assume the worst', /could not write its own note: the engine didn't answer/.test(auto) && /assume the worst/.test(auto));
  const withNote = handoffText(facts, { note: { text: 'The engine binary is missing a DLL.', model: 'qwen' } });
  check('with a brain note it is quoted and credited to the brain', /Written by Bob's own brain \(qwen\)[\s\S]*The engine binary is missing a DLL\./.test(withNote) && !/assume the worst/.test(withNote));
}

// ---- the brain's own note: only an idle, already-loaded chat brain, never in Gaming, never loaded for this
{
  const calls = [];
  const brainWith = (over = {}) => ({ state: { state: 'idle' }, turns: new Map(), engine: { loaded: async () => [{ name: 'qwen3.6-35b-a3b' }], chat: async (o) => { calls.push(o); return { role: 'assistant', content: '<think>hmm</think>Looks like the card is busy. Check the game first.' }; } }, ...over });
  const facts = { bob: {}, platform: {}, engines: [], brain: {}, errorTail: ['- x | error | y'] };
  let r = await brainNote(brainWith(), cfg, facts);
  check('an idle loaded chat brain writes the note, thinking stripped', r.text === 'Looks like the card is busy. Check the game first.' && r.model === 'qwen3.6-35b-a3b', JSON.stringify(r));
  check('the brain is asked with thinking off, a time limit and the facts, not to invent anything', calls[0].think === false && calls[0].signal && /Do not invent facts/.test(calls[0].messages[0].content) && /error \| y/.test(calls[0].messages[1].content));
  r = await brainNote(brainWith(), { ...cfg, session: 'light' }, facts);
  check('never in a Gaming session', r.text === '' && /Gaming/.test(r.why), r.why);
  r = await brainNote(brainWith({ state: { state: 'thinking' } }), cfg, facts);
  check('not while Bob is busy', r.text === '' && /busy \(thinking\)/.test(r.why), r.why);
  r = await brainNote(brainWith({ turns: new Map([['main', {}]]) }), cfg, facts);
  check('not while a turn is running', r.text === '' && /busy/.test(r.why));
  calls.length = 0;
  r = await brainNote(brainWith({ engine: { loaded: async () => [], chat: async (o) => { calls.push(o); return { content: 'no' }; } } }), cfg, facts);
  check('a chat brain that is not loaded is not loaded for this', r.text === '' && /isn't loaded/.test(r.why) && calls.length === 0, r.why);
  r = await brainNote(brainWith({ engine: { loaded: async () => { throw new Error('ECONNREFUSED'); }, chat: async () => ({ content: 'x' }) } }), cfg, facts);
  check('an engine that does not answer means no note, with the reason', r.text === '' && /didn't answer \(ECONNREFUSED\)/.test(r.why), r.why);
  r = await brainNote(brainWith({ engine: { loaded: async () => [{ name: 'qwen3.6-35b-a3b' }], chat: () => new Promise(() => {}) } }), cfg, facts, { seconds: 0.05 });
  check('a brain that takes too long is given up on', r.text === '' && /didn't answer in 0.05 seconds/.test(r.why), r.why);
  r = await brainNote(null, cfg, facts);
  check('no brain object at all: no note', r.text === '' && /no brain/.test(r.why));
}

// ---- the whole bundle, without a brain and with one
{
  const shop = { hardware: async () => ({ gpu: { name: 'Test card', vramGB: 16 }, freeGB: 100 }) };
  const checkEngine = async (c, id) => ({ id, ok: id !== 'llamacpp', why: id === 'llamacpp' ? 'it stopped as it started (code 0xC0000135), usually a missing runtime file' : undefined });
  const deadBrain = { state: { state: 'idle' }, turns: new Map(), engine: { loaded: async () => { throw new Error('ECONNREFUSED'); }, chat: async () => ({ content: 'nope' }) }, queueView: () => [{ id: 1, kind: 'chat', text: `paint ${OWNER}`, state: 'failed', status: 'failed', error: 'engine down' }] };
  const b = await buildBundle(cfg, { brain: deadBrain, shop, checkEngine, speedHistory: () => [{ tps: 40 }], capabilities: () => ({ hearing: false }), scrubOpts });
  const names = b.entries.map((e) => e.name);
  check('the bundle holds HANDOFF.md, errors, logbook, settings, facts and the last chats', ['HANDOFF.md', 'bob/errors.md', 'bob/logbook.md', 'bob/settings.json', 'bob/facts.json', 'chats/main.md', 'chats/old-one.md'].every((n) => names.includes(n)) && names.length === 7, names.join(' '));
  const all = b.entries.map((e) => e.data.toString('utf8')).join('\n');
  check('nothing personal in any file: names, machine, home folder, passcodes, token, key, Tailscale address', !all.includes(OWNER) && !all.includes(USER) && !all.includes(HOST) && !all.includes(HOME) && !all.includes(PASS) && !all.includes(TOKEN) && !all.includes('sesame99') && !all.includes('sk-should-never') && !all.includes('100.101.102.103'));
  const hand = b.entries[0].data.toString('utf8');
  check('a dead engine gives an automatic handoff that says why', /could not write its own note: the engine didn't answer \(ECONNREFUSED\)/.test(hand) && /llamacpp: does not start \(it stopped as it started/.test(hand) && /- failed: paint the owner \(error: engine down\)/.test(hand) && /Test card, about 16 GB/.test(hand), hand.match(/could not write[^\n]*/)?.[0]);
  const settings = JSON.parse(b.entries.find((e) => e.name === 'bob/settings.json').data.toString());
  check('settings.json keeps the switches and drops the secret', settings.webSearch === false && settings.models.bob === 'qwen3.6-35b-a3b' && settings.cloudHelpers.openai.apiKey === '[hidden]' && !('remote' in settings));
  const facts = JSON.parse(b.entries.find((e) => e.name === 'bob/facts.json').data.toString());
  check('facts.json has the version, platform, hardware, engines, brain, queue, speed and settings text', facts.bob.version && facts.platform.os && facts.hardware.gpu.name === 'Test card' && facts.engines.length === 3 && facts.brain.loaded === undefined && facts.brain.failed && facts.queue.length === 1 && facts.speed[0].tps === 40 && typeof facts.settingsNow === 'string' && !('errorTail' in facts), JSON.stringify(facts.brain));
  const errs = b.entries.find((e) => e.name === 'bob/errors.md').data.toString();
  check('errors.md has the three bad lines, scrubbed', errs.split('\n').filter((l) => l.startsWith('- ')).length === 3 && errs.includes('[tailscale address]'));
  check('the chat readout is in, with the owner scrubbed', /chats\/main\.md/.test(names.join()) && /\*\*The owner/.test(b.entries.find((e) => e.name === 'chats/main.md').data.toString()));

  const liveBrain = { ...deadBrain, engine: { loaded: async () => [{ name: 'qwen3.6-35b-a3b' }], chat: async () => ({ content: `${OWNER}'s engine file is missing a runtime DLL; reinstall the engine from Settings, Engines.` }) } };
  const r = await saveHelpBundle(cfg, path.join(tmp, 'out', 'deeper'), { brain: liveBrain, shop, checkEngine, scrubOpts, now: new Date('2026-11-05T05:30:00Z') });
  check('saveHelpBundle writes the zip where asked (making the folder) and says the brain wrote a note', r.ok && fs.existsSync(r.file) && r.file.endsWith('bob-help-bundle-20261105-0530.zip') && r.brainNote === true && r.parts === 7, JSON.stringify(r));
  const list = readZipList(r.file);
  check('the zip lists the same files', list.entries.length === 7 && list.entries.some((e) => e.name === 'HANDOFF.md'), JSON.stringify(list).slice(0, 200));
  const dest = path.join(tmp, 'unz');
  unzip(r.file, dest);
  const hand2 = fs.readFileSync(path.join(dest, 'HANDOFF.md'), 'utf8');
  check('the unzipped HANDOFF.md carries the brain\'s note, scrubbed', /Written by Bob's own brain \(qwen3\.6-35b-a3b\)/.test(hand2) && /the owner's engine file is missing a runtime DLL/.test(hand2) && !hand2.includes(OWNER));
  let threw = '';
  try { await saveHelpBundle(cfg, path.join(tmp, 'out', 'deeper'), { brain: liveBrain, shop, checkEngine, scrubOpts, now: new Date('2026-11-05T05:30:00Z') }); } catch (e) { threw = e.message; }
  check('the same minute twice does not overwrite', /already exists/.test(threw), threw);
  const z = await bundleBytes(cfg, { brain: deadBrain, shop, checkEngine, scrubOpts, brainNote: false });
  check('bundleBytes gives the zip as bytes for the phone, and leaves no temp file behind', Buffer.isBuffer(z.data) && z.data.readUInt32LE(0) === 0x04034b50 && /^bob-help-bundle-/.test(z.name) && z.brainNote === false && !fs.readdirSync(os.tmpdir()).some((f) => f.startsWith(`bob-help-${process.pid}-`)));
  // 1.5.133: the last load that fell over goes in whole, scrubbed (names and home folder taken out); none, nothing added.
  fs.writeFileSync(path.join(cfg.dataDir, 'llama-server-load-failed.txt'), `2026-11-08 big: stopped while loading (code 3)\n${HOME}\\llama-server.exe -m ${HOME}\\big.gguf\n\nCUDA error: out of memory\n`);
  const bf = await buildBundle(cfg, { brainNote: false, scrubOpts });
  const lf = bf.entries.find((e) => e.name === 'bob/llama-server-load-failed.txt')?.data.toString('utf8') || '';
  check('a failed load\'s whole engine output goes in the bundle, scrubbed', /CUDA error: out of memory/.test(lf) && !lf.includes(USER) && !bf.entries.some((e) => e.name === 'bob/llama-server-beside-load-failed.txt'), lf.slice(0, 200));
  fs.rmSync(path.join(cfg.dataDir, 'llama-server-load-failed.txt'));
  check('brainNote: false skips the brain entirely', (await buildBundle(cfg, { brain: liveBrain, shop, checkEngine, scrubOpts, brainNote: false })).note.why === 'not asked');
  const b2 = await buildBundle({ ...cfg, logbook: path.join(tmp, 'none.md'), dataDir: path.join(tmp, 'nodata') }, { brainNote: false, scrubOpts });
  check('no logbook, no chats, no brain, no shop: the bundle still comes out', b2.entries.length === 5 && b2.entries.find((e) => e.name === 'bob/logbook.md').data.toString().includes('no logbook yet') && /not a programmer/.test(b2.entries[0].data.toString()), b2.entries.map((e) => e.name).join(' '));
  const shown = [];
  check('revealFile uses Bob.exe\'s shell when there is one', revealFile('C:\\x\\y.zip', { shell: { showItemInFolder: (f) => shown.push(f) } }) && shown[0] === 'C:\\x\\y.zip');
  const spawned = [];
  const fake = (file, args) => { spawned.push([file, args]); return { unref() {} }; };
  check('and Explorer /select on Windows, open -R on a Mac, xdg-open on Linux', revealFile('C:\\x\\y.zip', { shell: null, platform: 'win32', spawnImpl: fake }) && /explorer\.exe$/.test(spawned[0][0]) && spawned[0][1][0] === '/select,C:\\x\\y.zip' && revealFile('/u/y.zip', { shell: null, platform: 'darwin', spawnImpl: fake }) && spawned[1][1][0] === '-R' && revealFile('/u/y.zip', { shell: null, platform: 'linux', spawnImpl: fake }) && spawned[2][0] === 'xdg-open' && spawned[2][1][0] === '/u');
}

// ---- the window, the route, the picker, the Help
{
  const cellar = publicText('cellar.js'), server = serverText(), picker = read('src/pick-folder.js'), css = read('public/style.css');
  const pc = cellar.slice(cellar.indexOf("panel('ev-pc'"), cellar.indexOf('\n  }\n', cellar.indexOf("panel('ev-pc'")));
  check('Save a help bundle sits after Run first-time setup in This replicant matrix and updates (Check for updates is on the panel line since 1.5.117), with its hint behind ⓘ', /<button type="button" data-welcome>Run first-time setup<\/button><button type="button" data-helpbundle>Save a help bundle<\/button>\$\{tip\('Saves one zip with Bob\\'s logs, the last chats, errors and this replicant matrix\\'s facts, scrubbed of passcodes, keys and your name, so an agent or a person can work out what\\'s wrong\. Nothing is sent anywhere: you pick where it goes\.', 'Save a help bundle'\)\}/.test(pc));
  check('the button says what happened, falls back to a download from another device, and never says "debug"', /'helpbundle' in b\.dataset/.test(cellar) && /api\('\/api\/help-bundle', \{\}\)/.test(cellar) && /r\.cancelled\) box\.textContent = 'Nothing saved: you closed the folder window\.'/.test(cellar) && /location\.href = '\/api\/help-bundle'/.test(cellar) && /My brain couldn\\'t add a note, so the bundle was put together automatically/.test(cellar) && !/debug/i.test(pc) && /\.help-bundle:not\(:empty\)/.test(css));
  check('the route: POST on this replicant matrix picks a folder, writes and shows the zip; GET gives the zip to a paired device', /p === '\/api\/help-bundle'/.test(server) && /pickFolder\(\{ purpose: 'bundle' \}\)/.test(server) && /saveHelpBundle\(cfg, folder/.test(server) && /revealFile\(r\.file\)/.test(server) && /'Content-Type': 'application\/zip'/.test(server) && /if \(!isLocal\) return send\(res, 403, \{ error: 'Only on this replicant matrix itself\.' \}\);\n\s+const b = await body\(req\)\.catch/.test(server));
  check('a cancelled picker saves nothing; no picker means Bob\'s own folder', /if \(picked && !folder\) return send\(res, 200, \{ ok: false, cancelled: true \}\)/.test(server) && /'help-bundles'\)/.test(server));
  check('the folder picker has a bundle purpose on Windows, Mac and Linux', (picker.match(/Pick where Bob saves the help bundle/g) || []).length >= 3 && /bundle: 'Pick where Bob saves the help bundle'/.test(picker) && /\['save', 'bundle', 'home'(, 'backup')?\]\.includes\(purpose\) \? '\$d\.ShowNewFolderButton = \$true'/.test(picker));
  const help = HELP.find((e) => e.id === 'help-bundle'), faq = HELP.find((e) => e.id === 'faq-get-help'), trouble = HELP.find((e) => e.id === 'trouble'), glossary = HELP.find((e) => e.id === 'glossary'), everyday = HELP.find((e) => e.id === 'settings-everyday');
  check('Help: a Save a help bundle entry in Bob\'s voice says what is in it, the two ways it is written, what is scrubbed and where to take it', help && help.group === 'Troubleshooting' && /HANDOFF\.md/.test(help.html) && /Two ways it gets written/.test(help.html) && /What's taken out/.test(help.html) && /github\.com\/MouseWurX\/Bob\/issues/.test(help.html) && /I never load a brain for this/.test(help.html) && /phone app/.test(help.html));
  check('Help: the everyday page lists the buttons without a count and links the entry', !/four buttons|three buttons/.test(everyday.html) && /data-helpgo="help-bundle"/.test(everyday.html) && /help bundle/.test(everyday.words));
  check('Help: When something goes wrong links to it as the last row', /Save a help bundle/.test(trouble.html) && /data-helpgo="help-bundle"/.test(trouble.html));
  check('Help: glossary has Help bundle and Handoff file', /<dt>Help bundle<\/dt>/.test(glossary.html) && /<dt>Handoff file \(HANDOFF\.md\)<\/dt>/.test(glossary.html));
  check('Help: FAQ "How do I get help with my Bob?" says what is in the bundle and points at the issues page', faq && faq.group === 'FAQ' && /\?$/.test(faq.title) && /github\.com\/MouseWurX\/Bob\/issues/.test(faq.html) && /HANDOFF\.md/.test(faq.html) && /pc computer laptop mac device machine/.test(faq.words) && /never send it anywhere/.test(faq.html));
  const voice = [help, faq].every((e) => { const t = plainText(e.html); return /\bI\b/.test(t) && !/\bBob's logs\b/.test(t.replace(/Bob's own/g, '')); });
  check('both new entries are in the first person', voice);
  check('the test is in npm test', /run-help-bundle-test\.js/.test(read('package.json')));
  check('the release note and the inventory mention it', /Save a help bundle/.test(read('docs/releases/v1.5.118.md')) && /Save a help bundle/.test(read('docs/SETTINGS-INVENTORY.md')) && /Save a help bundle/.test(read('docs/USER-GUIDE.md')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
