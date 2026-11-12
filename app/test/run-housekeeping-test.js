// 1.1.0: Bob the housekeeper. Rolling summaries instead of dropped messages, topics, forgetting by topic,
// the tidy-up list (ask first, or automatic per kind), pins, the Recycle Bin, search. No real model: a fake
// engine answers the housekeeper's questions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { cleanHousekeeping, memoryRepeats, parseJson, folderRefusal, oldFolderFiles, cleanFolder } from '../src/housekeeping.js';
import { mayRecycle, recycle, trashDir } from '../src/recycle.js';
import { readChat, readOlder, chatFile, stampMessages, writeChat } from '../src/chats.js';
import { search } from '../src/search.js';
import { overlap } from '../src/topics.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const DAY = 864e5;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-hk-'));
const inn = path.join(tmp, 'inn');
const cfg = {
  agentDir: tmp, innDir: inn, dataDir: path.join(inn, 'bob'), painterDir: path.join(inn, 'painter'), archiveDir: path.join(inn, 'archive'),
  logbook: path.join(inn, 'logbook.md'), memoryFile: path.join(inn, 'bob-memory.md'), noticeBoard: path.join(inn, 'notice-board.md'),
  ollamaUrl: 'http://127.0.0.1:1', engine: 'ollama', models: { bob: 'fake:1b' }, userName: 'Sam', timeZone: 'America/Edmonton',
  readRoots: [inn], readOnlyRoots: [], recycleBin: false, housekeeping: { enabled: false, chosen: true }
};
for (const d of [cfg.dataDir, cfg.painterDir, cfg.archiveDir, path.join(inn, 'references')]) fs.mkdirSync(d, { recursive: true });
const events = [];
const brain = new Brain(cfg, (ev) => events.push(ev));
const hk = brain.housekeeper;

// The fake engine: answers each housekeeping question with JSON, by what the prompt asks for.
let answers = [];
brain.engine = {
  isLoaded: async () => true,
  embed: async () => { throw new Error('no embedding model'); },
  chat: async ({ messages }) => {
    const p = messages.at(-1).content;
    const a = answers.find((x) => x.when.test(p));
    return { role: 'assistant', content: a ? JSON.stringify(typeof a.reply === 'function' ? a.reply(p) : a.reply) : '{}' };
  }
};

// ---- settings ----
{
  const d = cleanHousekeeping({});
  check('housekeeping is ON by default (Nov 11), every kind asks first, no added folders', d.enabled === true && d.extraFolders.length === 0 && Object.values(d).filter((x) => x && typeof x === 'object' && !Array.isArray(x)).every((k) => k.mode === 'ask'));
  check('an old enabled:false the user never chose turns on; one the user chose stays off', cleanHousekeeping({ enabled: false }).enabled === true && cleanHousekeeping({ enabled: false, chosen: true }).enabled === false);
  check('added folders can never be set to tidy automatically', cleanHousekeeping({ folders: { mode: 'auto' } }).folders.mode === 'ask');
  check('only full paths, not a whole drive, are kept as folders', cleanFolder('C:\\Users\\you\\Downloads\\') === 'C:\\Users\\you\\Downloads' && cleanFolder('/home/you/dl/') === '/home/you/dl' && !cleanFolder('C:\\') && !cleanFolder('/') && !cleanFolder('downloads'));
  check('the same folder is kept once', cleanHousekeeping({ extraFolders: ['/a/b', '/a/b/', '/A/B'] }).extraFolders.length === 1);
  const c = cleanHousekeeping({ enabled: true, chats: { n: -4, unit: 'years', mode: 'auto' }, pictures: { n: 2, unit: 'weeks' } });
  check('bad limits fall back to defaults; "auto" is kept only when chosen', c.enabled && c.chats.n === 3 && c.chats.unit === 'months' && c.chats.mode === 'auto' && c.pictures.n === 2 && c.pictures.unit === 'weeks' && c.pictures.mode === 'ask');
  check('the model\'s JSON is found inside other words', parseJson('Sure! {"a":1} done')?.a === 1 && parseJson('nope') === null);
}

// ---- rolling summary: old messages are kept, not dropped ----
{
  const s = brain.session('long');
  for (let i = 0; i < 50; i++) s.push({ role: i % 2 ? 'assistant' : 'user', content: `message ${i} about the art style of Starfall` });
  brain.saveSession('long');
  const recent = readChat(cfg, 'long'), older = readOlder(cfg, 'long');
  check('the recent part stays at 40 messages', recent.length === 40);
  check('the 10 older messages are kept word for word, not dropped', older.length === 10 && older[0].content === 'message 0 about the art style of Starfall');
  check('every message has an id and a time', recent.every((m) => m.id && m.at) && older.every((m) => m.id && m.at));
  answers = [{ when: /Update the summary/, reply: { summary: 'Sam and Bob settled on a painterly art style for Starfall.', facts: ['Sam is making a game called Starfall', 'Sam is making a game called Starfall'] } }];
  check('the older part is summed up', await hk.summarizeOlder('long') === true);
  check('...and Bob reads that summary in his prompt', (await brain.recall('long', 'what style did we pick?')).includes('painterly art style'));
  const mem = fs.readFileSync(cfg.memoryFile, 'utf8');
  check('lasting facts go to the memory file once', (mem.match(/Starfall/g) || []).length === 1);
  check('nothing new to sum up: no second call', await hk.summarizeOlder('long') === false);
}

// ---- topics ----
let artTopic;
{
  stampMessages(brain.session('art'));
  const s = brain.session('art');
  s.push({ role: 'user', content: 'Let us make Starfall look hand-painted.' }, { role: 'assistant', content: 'Hand-painted it is, with warm light.', media: [{ type: 'image', url: '/images/star-1.png', name: 'star-1.png' }] },
    { role: 'user', content: 'Also, how do Bob updates work?' }, { role: 'assistant', content: 'Bob checks the build number.' });
  brain.saveSession('art');
  fs.writeFileSync(path.join(cfg.painterDir, 'star-1.png'), 'png');
  const msgs = readChat(cfg, 'art');
  answers = [{ when: /Sort these chat messages/, reply: { topics: [
    { name: 'Art style', project: 'Starfall', summary: 'Hand-painted look', note: 'Decided: hand-painted, warm light.', open: ['Which brushes?'], facts: ['Sam wants Starfall to look hand-painted'], msgIds: [msgs[0].id, msgs[1].id] },
    { name: 'Updates', project: 'Bob', summary: 'How updates work', note: 'Updates compare the build number.', msgIds: [msgs[2].id, msgs[3].id] }
  ] } }];
  await hk.refreshTopics('art');
  const list = hk.topics.list();
  artTopic = list.find((t) => t.name === 'Art style');
  check('chats are filed under topics, grouped by project', artTopic?.project === 'Starfall' && list.some((t) => t.name === 'Updates' && t.project === 'Bob'));
  check('a topic keeps its note, open questions, pictures and last-discussed time', artTopic.note.includes('hand-painted') && artTopic.open[0] === 'Which brushes?' && artTopic.pics.includes('/images/star-1.png') && artTopic.lastSeen > 0);
  check('facts are filed in memory under their topic', /\[topic: Art style\]/.test(fs.readFileSync(cfg.memoryFile, 'utf8')));
  check('the same messages are not filed twice', await hk.refreshTopics('art') === false);
  check('Bob reads the closest topic note in his prompt', (await brain.recall('art', 'remind me about the art style')).includes('hand-painted, warm light'));
  hk.topics.edit(artTopic.id, { note: 'My words: hand-painted, warm light, thick outlines.' });
  hk.topics.absorb('art', [{ name: 'Art style', note: 'Bob rewrote it.', msgIds: [msgs[0].id] }], { at: { [msgs[0].id]: Date.now() } });
  const after = hk.topics.get(artTopic.id);
  check("an edited note is never overwritten; Bob's update waits as a suggestion", after.note.startsWith('My words') && after.suggested?.note === 'Bob rewrote it.');
  const upd = list.find((t) => t.name === 'Updates');
  hk.topics.moveMessage('art', msgs[2].id, artTopic.id);
  check('a message can be moved to another topic', hk.topics.get(artTopic.id).spans[0].msgIds.includes(msgs[2].id) && !(hk.topics.get(upd.id).spans[0]?.msgIds || []).includes(msgs[2].id));
  hk.topics.rename(upd.id, 'Bob updates', 'Bob');
  check('topics can be renamed', hk.topics.get(upd.id).name === 'Bob updates');
  const extra = hk.topics.absorb('art', [{ name: 'Brushes', project: 'Starfall', note: 'Use flat brushes.', msgIds: [msgs[1].id] }], { at: { [msgs[1].id]: Date.now() } })[0];
  hk.topics.merge(extra, artTopic.id);
  check('topics can be merged (notes and aliases carry over)', !hk.topics.get(extra) && hk.topics.get(artTopic.id).aliases.includes('Brushes'));
  check('word matching works without embeddings', overlap('art style of starfall', 'Starfall Art style') > 0.5);
}

// ---- search ----
{
  fs.writeFileSync(cfg.noticeBoard, '# Notice board\n- buy brushes for starfall\n');
  const r = search(cfg, { topics: hk.topics, summaries: hk.summaries() }, 'starfall');
  check('search finds topics, chat messages and notes', ['topic', 'chat', 'note'].every((t) => r.some((h) => h.type === t)));
  check('a chat hit points back at the message', r.some((h) => h.type === 'chat' && h.session && h.msgId));
  check('search finds pictures by name', search(cfg, { topics: hk.topics }, 'star-1').some((h) => h.type === 'file'));
}

// ---- forgetting by topic ----
{
  const upd = hk.topics.find('Bob updates');
  const pv = hk.forgetPreview(upd.id, { mode: 'note' });
  check('the preview says what would be forgotten', pv.messages >= 1 && pv.chats.length === 1 && pv.keepsNote);
  const tool = brain.tools.forget_topic;
  const need = tool.check({ topic: 'bob updates' });
  check('"forget what we said about X" in chat asks first, with the preview', need && /Forget "Bob > Bob updates"\?/.test(need.text) && /Recycle Bin/.test(need.text));
  const r = await tool.run({ topic: 'bob updates' });
  const chat = readChat(cfg, 'art');
  check('the topic\'s messages become a "[forgotten]" placeholder', /Forgot/.test(r) && chat.some((m) => m.content === '[forgotten: Bob updates]') && !chat.some((m) => /checks the build number/.test(m.content)));
  check('Bob\'s turn still follows each placeholder', chat.every((m, i) => !(m.forgotten && m.role === 'user') || chat[i + 1]?.role === 'assistant'));
  check('the note stays in "keep the note" mode', hk.topics.get(upd.id)?.note.includes('build number'));
  check('the chat as it was went to the Recycle Bin first', fs.readdirSync(path.join(trashDir(cfg), fs.readdirSync(trashDir(cfg))[0])).some((f) => /art \(before forgetting/.test(f)));
  hk.topics.pin(artTopic.id, true);
  check('a pinned topic is refused, and the tool says so', /pinned/.test(await tool.run({ topic: 'Art style' })) && tool.check({ topic: 'Art style' }) === null);
  hk.topics.pin(artTopic.id, false);
  const pva = hk.forgetPreview(artTopic.id, { mode: 'all' });
  check('"forget everything" lists the memory lines and the pictures made only for it', pva.memory.length === 1 && pva.pictures.includes('/images/star-1.png'));
  hk.forget(artTopic.id, { mode: 'all', pictures: true });
  check('"forget everything" removes the topic, its memory lines and its pictures', !hk.topics.get(artTopic.id) && !/\[topic: Art style\]/.test(fs.readFileSync(cfg.memoryFile, 'utf8')) && !fs.existsSync(path.join(cfg.painterDir, 'star-1.png')));
  check('unknown topics get a list instead', /no topic like/i.test(await tool.run({ topic: 'quantum soup' })));
}

// ---- the tidy-up list ----
const old = Date.now() - 400 * DAY;
{
  for (const id of ['oldchat', 'pinnedchat']) { writeChat(cfg, id, [{ role: 'user', content: `hello from ${id}`, id: id + '1', at: old }, { role: 'assistant', content: 'hi', id: id + '2', at: old }]); }
  const pic = path.join(cfg.painterDir, '2025-01-01-old.png'), snd = path.join(cfg.painterDir, '2025-01-01-old.wav'), fresh = path.join(cfg.painterDir, 'new.png');
  for (const f of [pic, snd, fresh]) fs.writeFileSync(f, 'x'.repeat(2048));
  fs.utimesSync(pic, old / 1000, old / 1000); fs.utimesSync(snd, old / 1000, old / 1000);
  fs.writeFileSync(cfg.logbook, "# Bob's logbook\n\n- 2025-01-02, 10:00 | chat | old line\n- " + new Date().toISOString().slice(0, 10) + ', 10:00 | chat | new line\n');
  fs.appendFileSync(cfg.memoryFile, '- Sam likes tea (2026-01-01)\n- Sam likes tea (2026-02-01)\n');
  brain.queue.push({ id: 'j1', sessionId: 'x', text: 'old job', state: 'done', at: Date.now() - 6 * DAY, doneAt: Date.now() - 6 * DAY });
  hk.pin('chats', 'pinnedchat', true);
  const items = hk.scan();
  const keys = items.map((i) => i.key);
  check('old chats, pictures, sounds, tasks and logbook lines are found', ['chat:oldchat', 'file:2025-01-01-old.png', 'file:2025-01-01-old.wav', 'tasks', 'logbook'].every((k) => keys.includes(k)), JSON.stringify(keys));
  check('pinned chats and fresh files are not', !keys.includes('chat:pinnedchat') && !keys.includes('file:new.png') && !keys.includes('chat:art'));
  check('repeated memory lines are offered', keys.includes('memory-repeats'));
  check('each item shows its size', items.find((i) => i.key === 'file:2025-01-01-old.png').bytes === 2048);
  check('the window gets no file paths', hk.publicItems().every((i) => !i.paths));
  answers = [{ when: /Write one paragraph/, reply: { summary: 'Sam said hello.', facts: ['Sam says hello first'] } }, { when: /Sort these/, reply: { topics: [] } }];
  const res = await hk.tidy([{ key: 'chat:oldchat', action: 'summarize' }, { key: 'file:2025-01-01-old.png', action: 'delete' }, { key: 'file:2025-01-01-old.wav', action: 'keep' }, { key: 'logbook' }, { key: 'memory-repeats' }, { key: 'tasks' }]);
  check('a chat is summed up, then goes to the Recycle Bin', !fs.existsSync(chatFile(cfg, 'oldchat')) && hk.summaries()[0]?.summary === 'Sam said hello.');
  check('a picture goes to the Recycle Bin (not deleted outright)', !fs.existsSync(pic) && fs.readdirSync(path.join(trashDir(cfg), fs.readdirSync(trashDir(cfg))[0])).includes('2025-01-01-old.png'));
  check('a cross keeps it, and it isn\'t asked about again', fs.existsSync(snd) && !hk.scan().some((i) => i.key === 'file:2025-01-01-old.wav'));
  check('old logbook lines go; recent ones stay', !/old line/.test(fs.readFileSync(cfg.logbook, 'utf8').split('\n').filter((l) => !/tidied/.test(l)).join('\n')) && /new line/.test(fs.readFileSync(cfg.logbook, 'utf8')));
  check('memory repeats are tidied, the first copy stays', (fs.readFileSync(cfg.memoryFile, 'utf8').match(/Sam likes tea/g) || []).length === 1);
  check('finished tasks leave the list', !brain.queue.some((j) => j.id === 'j1'));
  check('every action is in the logbook', /housekeeping \| tidied: chat "hello from oldchat"/.test(fs.readFileSync(cfg.logbook, 'utf8')));
  check('no errors', res.every((r) => !r.error), JSON.stringify(res.filter((r) => r.error)));
  check('memory repeats helper', memoryRepeats('- a (2026-01-01)\n- a (2026-02-02) [topic: X]\n- b').repeats === 1);
}

// ---- the Recycle Bin guard ----
{
  check('only Bob\'s own folders can be tidied', mayRecycle(cfg, path.join(cfg.painterDir, 'x.png')) && !mayRecycle(cfg, path.join(tmp, 'elsewhere.txt')) && !mayRecycle(cfg, cfg.memoryFile));
  check('never a whole folder root, settings or the topics file', !mayRecycle(cfg, cfg.painterDir) && !mayRecycle(cfg, path.join(cfg.dataDir, 'settings.json')) && !mayRecycle(cfg, path.join(cfg.dataDir, 'topics.json')));
  fs.writeFileSync(path.join(tmp, 'elsewhere.txt'), 'x');
  const r = recycle(cfg, [path.join(tmp, 'elsewhere.txt')]);
  check('a path outside is refused and left alone', r.refused.length === 1 && fs.existsSync(path.join(tmp, 'elsewhere.txt')));
}

// ---- the idle round ----
{
  writeChat(cfg, 'autochat', [{ role: 'user', content: 'auto me', id: 'a1', at: old }, { role: 'assistant', content: 'ok', id: 'a2', at: old }]);
  const p2 = path.join(cfg.painterDir, '2025-02-02-ask.png'); fs.writeFileSync(p2, 'x'); fs.utimesSync(p2, old / 1000, old / 1000);
  brain.lastActivity = Date.now() - 60e3;
  check('with housekeeping turned off by the user nothing happens', (await hk.tick()).skipped === true);
  cfg.housekeeping = { enabled: true, chats: { n: 1, unit: 'months', mode: 'auto' } };
  check('not idle yet (quiet less than 10 minutes): nothing happens', (await hk.tick()).skipped === true);
  brain.lastActivity = Date.now() - 11 * 60e3;
  const st = hk.state(); st.lastScan = 0; st.lastAsk = 0; hk.saveState(st);
  events.length = 0;
  const did = await hk.tick();
  check('"tidy automatically" kinds are tidied by themselves', did.auto >= 1 && !fs.existsSync(chatFile(cfg, 'autochat')));
  check('"ask me" kinds are only mentioned in the chat', fs.existsSync(p2) && events.some((e) => e.type === 'tidy' && e.count >= 1));
  check('the pinned chat survives automatic tidying', fs.existsSync(chatFile(cfg, 'pinnedchat')));
  events.length = 0;
  const s2 = hk.state(); s2.lastScan = 0; hk.saveState(s2);
  await hk.tick();
  check('mentioned at most once a day', !events.some((e) => e.type === 'tidy'));
  brain.housekeeper.pause();
}

// ---- Folders the user points him to (Nov 11) ----
{
  const userTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-hk-user-')), mine = path.join(userTmp, 'sam'), dl = path.join(mine, 'Downloads');
  fs.mkdirSync(path.join(dl, 'deep', '.hidden'), { recursive: true });
  const oldT = (Date.now() - 400 * DAY) / 1000;
  for (const f of ['old.zip', 'deep/old2.iso', 'deep/.hidden/secret.txt', '.dotfile']) { const p = path.join(dl, f); fs.writeFileSync(p, 'x'); fs.utimesSync(p, oldT, oldT); }
  fs.writeFileSync(path.join(dl, 'new.zip'), 'x');
  const opts = { home: mine };
  check('a folder inside home is allowed', folderRefusal(cfg, dl, opts) === '');
  check('the whole home folder is refused', /whole home/.test(folderRefusal(cfg, mine, opts)));
  check('system folders are refused', /system/.test(folderRefusal(cfg, 'C:\\Windows\\System32', opts)) && /system/.test(folderRefusal(cfg, '/usr/share', opts)) && /system/.test(folderRefusal(cfg, '/etc', opts)));
  check('a folder holding Bob, or one of his own, is refused', /holds Bob/.test(folderRefusal(cfg, tmp, opts)) && /own folders/.test(folderRefusal(cfg, path.join(inn, 'painter'), opts)));
  check('a folder that is not there is refused', /can't find/.test(folderRefusal(cfg, path.join(mine, 'nope'), opts)));
  const found = oldFolderFiles([dl], Date.now() - 180 * DAY).map((x) => path.relative(dl, x.file).replace(/\\/g, '/'));
  check('old files in an added folder are found, hidden ones and new ones are not', found.includes('old.zip') && found.includes('deep/old2.iso') && !found.some((f) => /hidden|dotfile|new\.zip/.test(f)), JSON.stringify(found));
  cfg.housekeeping = { enabled: true, chosen: true, extraFolders: [dl], folders: { n: 6, unit: 'months', mode: 'auto' } };
  const items = hk.scan().filter((i) => i.kind === 'folders');
  check('Tidy up lists them under "Files in folders you added", asking first', items.length === 2 && items.every((i) => i.def === 'delete' && i.paths?.length === 1));
  check('they may go to the Recycle Bin (inside an added folder)', mayRecycle(cfg, path.join(dl, 'old.zip')) && !mayRecycle(cfg, dl));
  cfg.housekeeping = { enabled: true, chosen: true };
  check('with no folders added, nothing of the user\'s is listed', !hk.scan().some((i) => i.kind === 'folders') && !mayRecycle(cfg, path.join(dl, 'old.zip')));
  const src = fs.readFileSync(new URL('../src/housekeeping.js', import.meta.url), 'utf8');
  check('added folders are never tidied by themselves', /i\.kind !== 'folders'\); \/\/ added folders: always ask/.test(src));
  fs.rmSync(userTmp, { recursive: true, force: true });
}

hk.stop();
fs.rmSync(tmp, { recursive: true, force: true });
{
  const src = fs.readFileSync(new URL('../src/housekeeping.js', import.meta.url), 'utf8');
  check('the cached Electron download (used by "Double-click to build Bob") is never offered for tidying', !/label: 'Saved Electron download'/.test(src) && !/add\(\{ key: `spare:\$\{path\.basename\(zip\)/.test(src));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
