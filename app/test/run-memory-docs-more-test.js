// Memory and documents, items 87 to 93 of the Nov 11 list: where each memory came from, memories that run out,
// project memories kept to their project, documents kept fresh, the page and line of a find, notes apps, and the
// Sunday digest. Every one starts off. No real folders, clocks or settings of this computer are read: everything
// runs in a temporary folder with fakes passed in.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourcesOn, expiryOn, whereOn, fromTag, keepUntil, untilTag, expired, dropExpired, memoryForPrompt, memorySources, forgetLine, projectOfPath, projectOfCall, pathsInArgs } from '../src/memory-more.js';
import { factText, lineKey, parseMemory, pickMemories } from '../src/recall.js';
import { docFreshOn, docPlacesOn, placeOf, placeWords, parsePlace, obsidianText, inVault, isVault, DocWatcher } from '../src/doc-more.js';
import { cleanNotesFolders, applyNotes } from '../src/notes-folders.js';
import { digestOn, dueSunday, makeDigest, localParts, Digest } from '../src/digest.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { buildTools } from '../src/tools.js';
import { Brain } from '../src/brain.js';
import { DocIndex } from '../src/doc-index.js';
import { findInDocuments, findDocsTool } from '../src/my-docs.js';
import { render } from '../public/rich.js';
import { WANTS } from '../public/wants.js';
import { HELP } from '../public/help-content.js';
import { RELAY } from '../public/settings-link.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-memdocs-'));
const KEYS = ['memorySources', 'memoryExpiry', 'memoryWhere', 'docFresh', 'docPlaces', 'weeklyDigest'];

// ---------- every switch starts off and is saved true or false ----------
{
  const fresh = mergeSettings({}, {});
  check('all six switches are saved settings', KEYS.every((k) => SETTING_KEYS.includes(k)) && SETTING_KEYS.includes('notesFolders'));
  check('all six start off', KEYS.every((k) => fresh[k] !== true));
  check('only true turns one on', KEYS.every((k) => mergeSettings({}, { [k]: 'yes' })[k] === false && mergeSettings({}, { [k]: true })[k] === true));
  check('the on-checks need true', !sourcesOn({}) && sourcesOn({ memorySources: true }) && !expiryOn({ memoryExpiry: 1 }) && expiryOn({ memoryExpiry: true }) && !digestOn({}) && digestOn({ weeklyDigest: true }));
  check('project memories kept to their project needs Relevant memories only', !whereOn({ memoryWhere: true }) && whereOn({ memoryWhere: true, memoryRecall: true }));
  check('documents kept fresh needs reading and meaning search', !docFreshOn({ docFresh: true }) && !docFreshOn({ docFresh: true, docTools: true }) && docFreshOn({ docFresh: true, docTools: true, docMeaning: true }));
  check('page and line needs reading documents', !docPlacesOn({ docPlaces: true }) && docPlacesOn({ docPlaces: true, docTools: true }));
}

// ---------- 87: where each memory came from ----------
{
  check('the from tag only while the switch is on', fromTag({}, 'abc-1') === '' && fromTag({ memorySources: true }, 'abc-1') === ' [from: abc-1]' && fromTag({ memorySources: true }, '') === '');
  check('a chat id is cleaned before it goes in the file', fromTag({ memorySources: true }, 'a]b [x') === ' [from: abx]');
  const a = '- Likes tea (2026-11-02)', b = '- Likes tea (2026-11-02) [from: s1] [until: 2026-11-20]';
  check('the tags change neither what a line says nor its key', factText(b) === 'Likes tea' && lineKey(a) === lineKey(b));
  const mem = '# Bob\'s memory\n\n- Likes tea (2026-11-01) [from: chat-1]\n- Old fact (2026-10-01)\n- Gone chat fact (2026-11-03) [from: gone-9]\n';
  const rows = memorySources(mem, { chatTitle: (id) => (id === 'chat-1' ? { title: 'Tea talk' } : null) });
  check('the list is newest first, with the chat each came from', rows.length === 3 && rows[0].text === 'Gone chat fact' && rows[2].from === 'chat-1' && rows[2].title === 'Tea talk');
  check('a memory with no source says so, a tidied chat says gone', rows[1].from === '' && rows[0].chatGone === true && rows[2].chatGone === false);
  const f = forgetLine(mem, rows[2].key);
  check('Forget takes out only that line', f.n === 1 && !/Likes tea/.test(f.text) && /Old fact/.test(f.text) && /# Bob/.test(f.text));
  check('the prompt never carries the from tags', !/\[from:/.test(memoryForPrompt(mem, {}, '2026-11-11')));
}

// ---------- 88: memories that run out ----------
{
  check('week, day, month and N days', keepUntil('week', '2026-11-11') === '2026-11-18' && keepUntil('a day', '2026-11-11') === '2026-11-12' && keepUntil('month', '2026-11-11') === '2026-12-11' && keepUntil('3 days', '2026-11-11') === '2026-11-14' && keepUntil('2 weeks', '2026-11-11') === '2026-11-25');
  check('a date in the future is kept as it is, one gone or unclear is not', keepUntil('2026-12-01', '2026-11-11') === '2026-12-01' && keepUntil('2026-01-01', '2026-11-11') === '' && keepUntil('forever-ish', '2026-11-11') === '' && keepUntil('', '2026-11-11') === '');
  check('the until tag only while the switch is on', untilTag({}, 'week', '2026-11-11') === '' && untilTag({ memoryExpiry: true }, 'week', '2026-11-11') === ' [until: 2026-11-18]');
  const mem = '- Holiday this week (2026-11-04) [until: 2026-11-10]\n- On call today (2026-11-11) [until: 2026-11-11]\n- Likes tea (2026-11-01)';
  check('a line runs out the day after its last day', expired(mem.split('\n')[0], '2026-11-11') && !expired(mem.split('\n')[1], '2026-11-11') && !expired(mem.split('\n')[2], '2026-11-11'));
  const d = dropExpired(mem, '2026-11-11');
  check('the tidy takes out only run-out lines', d.gone.length === 1 && !/Holiday/.test(d.text) && /On call/.test(d.text) && /tea/.test(d.text));
  check('Bob stops reading it on the day, switch on', !/Holiday/.test(memoryForPrompt(mem, { memoryExpiry: true }, '2026-11-11')) && /Holiday/.test(memoryForPrompt(mem, {}, '2026-11-11')));
  check('recall leaves run-out lines out when given the day', parseMemory(mem, { today: '2026-11-11' }).length === 2 && parseMemory(mem).length === 3);
}

// remember: the keep field only while the switch is on; tags land in the file.
{
  const dir = path.join(tmp, 'rem');
  fs.mkdirSync(dir, { recursive: true });
  const memoryFile = path.join(dir, 'bob-memory.md');
  const cfg = { memoryFile, dataDir: dir, innDir: dir, userName: 'Sam', timeZone: 'UTC', housekeeping: {} };
  const tools = buildTools(cfg, {});
  check('off: remember has no keep field', !('keep' in tools.remember.schema.function.parameters.properties));
  await tools.remember.run({ fact: 'Likes tea', keep: 'week' }, { sessionId: 'chat-7' });
  check('off: no tags at all', !/\[(from|until):/.test(fs.readFileSync(memoryFile, 'utf8')));
  cfg.memoryExpiry = true; cfg.memorySources = true;
  check('on: remember offers keep', 'keep' in tools.remember.schema.function.parameters.properties);
  const said = await tools.remember.run({ fact: 'On holiday', keep: 'week' }, { sessionId: 'chat-7' });
  const last = fs.readFileSync(memoryFile, 'utf8').trim().split('\n').pop();
  check('on: the line gets its end day and its chat', /\[until: \d{4}-\d{2}-\d{2}\] \[from: chat-7\]$/.test(last) && /stop reading it after/.test(said), last);
}

// ---------- 89: project memories kept to their project ----------
{
  const lines = parseMemory('- Uses Unreal 5.6 [project: Starfall]\n- Likes tea\n- Phone app ships in May [project: Phone App]');
  const loose = pickMemories(lines, { text: 'unreal tea phone app may', project: '' }).map((l) => l.text);
  const strict = pickMemories(lines, { text: 'unreal tea phone app may', project: '', strict: true }).map((l) => l.text);
  check('off: a chat on no project can match any bank', loose.some((t) => /Unreal/.test(t)));
  check('on: a chat on no project reads only general memories', strict.length === 1 && strict[0] === 'Likes tea', JSON.stringify(strict));
  const on = pickMemories(lines, { text: 'unreal tea', project: 'Starfall', strict: true }).map((l) => l.text);
  check('on: on a project, its bank and the general ones', on.some((t) => /Unreal/.test(t)) && !on.some((t) => /Phone/.test(t)));
  const root = path.join(tmp, 'projects');
  const cfg = { projects: { Starfall: path.join(root, 'Starfall'), Inner: path.join(root, 'Starfall', 'Plugins', 'Inner'), 'Phone App': path.join(root, 'Phone') } };
  check('a file in a project folder belongs to that project, the deepest wins', projectOfPath(cfg, path.join(root, 'Starfall', 'a.cpp')) === 'Starfall' && projectOfPath(cfg, path.join(root, 'Starfall', 'Plugins', 'Inner', 'b.h')) === 'Inner' && projectOfPath(cfg, path.join(tmp, 'x.txt')) === '');
  check('paths are read from a tool call\'s inputs', pathsInArgs({ path: path.join(root, 'a'), text: 'hello', list: [path.join(root, 'b')] }).length === 2);
  check('one project per call, or none', projectOfCall(cfg, { path: path.join(root, 'Phone', 'x.kt') }) === 'Phone App' && projectOfCall(cfg, { a: path.join(root, 'Phone', 'x'), b: path.join(root, 'Starfall', 'y') }) === '');
  const brainLike = { cfg: { ...cfg, memoryWhere: true, memoryRecall: true } };
  check('a tool in a project folder makes it the chat\'s project', Brain.prototype.noteWhereWorking.call(brainLike, 's1', { path: path.join(root, 'Starfall', 'Main.cpp') }) === 'Starfall' && brainLike.memProject.get('s1') === 'Starfall');
  const offLike = { cfg };
  check('off: tool calls change nothing', Brain.prototype.noteWhereWorking.call(offLike, 's1', { path: path.join(root, 'Starfall', 'Main.cpp') }) === '' && !offLike.memProject);
  check('the brain calls it after every tool', /this\.noteWhereWorking\(ctx\.sessionId, args\);/.test(brainText()));
}

// ---------- 90: documents kept fresh ----------
{
  const heardBy = new Map();
  const fakeWatch = (root, opts, cb) => { const w = { closed: false, close() { this.closed = true; }, on() {} }; heardBy.set(root, { cb, w, opts }); return w; };
  let got = null;
  const docs = path.join(tmp, 'Docs');
  const w = new DocWatcher({ readRoots: [docs] }, (files) => { got = files; }, { watch: fakeWatch, wait: 60e3, exts: ['docx', 'txt', 'pdf'] });
  w.sync([docs]);
  check('it listens to each folder, everything inside it', heardBy.get(docs)?.opts.recursive === true && w.roots.length === 1);
  heardBy.get(docs).cb('change', 'Taxes/2025.docx');
  heardBy.get(docs).cb('change', '~$lock.docx');
  heardBy.get(docs).cb('change', '.hidden/x.txt');
  heardBy.get(docs).cb('change', 'song.mp3');
  heardBy.get(docs).cb('change', 'Taxes/2025.docx');
  const flushed = w.flush();
  check('only documents, no lock or hidden files, no repeats', flushed.length === 1 && flushed[0] === path.join(docs, 'Taxes', '2025.docx') && got?.length === 1);
  w.sync([]);
  check('a folder taken off stops being listened to', heardBy.get(docs).w.closed && w.roots.length === 0);
  const bad = new DocWatcher({}, () => {}, { watch: () => { throw new Error('no watching here'); } });
  check('a folder that can\'t be listened to is left to the idle walk', bad.sync([docs]).length === 0);
  w.stop();

  // Just the changed file is read again; a deleted one is dropped.
  const root = path.join(tmp, 'fresh');
  const dataDir = path.join(root, 'bob');
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(root, 'note.txt');
  fs.writeFileSync(file, 'the rent is going up next month according to the landlord letter');
  const cfg = { dataDir, readRoots: [root], docTools: true, docMeaning: true };
  const idx = new DocIndex(cfg);
  let sent = 0;
  const embed = async (texts) => { sent += texts.length; return texts.map(() => [1, 0, 0]); };
  let r = await idx.refreshFiles([file], embed, 'fake');
  check('a changed file gets its numbers made again', r.added === 1 && sent > 0 && idx.view().files === 1);
  r = await idx.refreshFiles([file], embed, 'fake');
  check('an unchanged file is left alone', r.added === 0);
  fs.rmSync(file);
  r = await idx.refreshFiles([file], embed, 'fake');
  check('a deleted file is dropped', r.dropped === 1 && idx.view().files === 0);
  const out = path.join(tmp, 'outside.txt');
  fs.writeFileSync(out, 'not in a folder Bob may read');
  r = await idx.refreshFiles([out], embed, 'fake');
  check('a file outside the folders Bob may read is never read', r.added === 0);
  const hk = read('src/housekeeping.js');
  check('never in the Gaming session, and waits while Bob answers', /if \(!docFreshOn\(this\.cfg\) \|\| gaming\(this\.cfg\)\) return null;/.test(hk) && /this\.brain\?\.turns\?\.size \|\| this\.docIndex\?\.building\) \{ this\.docWatch\?\.again\(files\)/.test(hk));
}

// ---------- 91: the page and line ----------
{
  check('a text file: the line', JSON.stringify(placeOf('a.txt', 'one\ntwo\nthe rent here\nfour', 'rent')) === '{"kind":"line","n":3}');
  check('a PDF: the page (pages passed in)', JSON.stringify(placeOf('a.pdf', '', 'rent', { readPdf: () => ['cover', 'intro words', 'the rent goes up'] })) === '{"kind":"page","n":3}');
  check('a presentation: the slide', JSON.stringify(placeOf('a.pptx', 'Slide 1\nHello\n\nSlide 2\nThe rent', 'rent')) === '{"kind":"slide","n":2}');
  check('a spreadsheet: the sheet', placeWords(placeOf('a.xlsx', 'Sheet: Budget\nfood\t10\n\nSheet: Home\nrent\t900', 'rent')) === 'sheet Home');
  check('a Word file: the paragraph', JSON.stringify(placeOf('a.docx', 'Title\n\nFirst paragraph\nSecond has the rent', 'rent')) === '{"kind":"paragraph","n":3}');
  check('not found, no place', placeOf('a.txt', 'nothing', 'rent') === null);
  check('the place read back from a reply', JSON.stringify(parsePlace(' (page 12)')) === '{"kind":"page","n":12}' && parsePlace('(chapter 2)') === null);
  const html = render('It\'s in C:\\Docs\\lease.pdf (page 3) and /home/sam/My Notes/rent.md (line 12).');
  check('in the chat, the place after a file is a link to it there', /data-file="C:\\Docs\\lease.pdf" data-at="page:3"/.test(html) && /data-file="\/home\/sam\/My Notes\/rent.md" data-at="line:12"/.test(html), html);
  check('a Mac or Linux path without a place stays words', !/file-link/.test(render('See /usr/lib/thing.so for more.')));
  // The tool says where, only while the switch is on.
  const root = path.join(tmp, 'find');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'lease.txt'), 'Lease\nTerms\nThe monthly rent goes up in May.\n');
  const cfg = { readRoots: [root], docTools: true, innDir: path.join(tmp, 'inn-x') };
  let r = await findInDocuments(cfg, [root], 'rent');
  check('off: no place', r.hits.length === 1 && r.hits[0].place === null);
  cfg.docPlaces = true;
  r = await findInDocuments(cfg, [root], 'rent');
  check('on: the line of the find', r.hits[0].place?.kind === 'line' && r.hits[0].place.n === 3);
  const said = await findDocsTool(cfg).run({ words: 'rent' });
  check('the tool puts the place after the path and says to keep it', /lease\.txt \(line 3\)/.test(said) && /keep its place right after the path/.test(said), said);
  check('clicking a place opens the side panel there', /if \(b\.dataset\.at && b\.dataset\.file\)/.test(publicText('app.js')) && /#page=\$\{Number\(at\.n\)\}/.test(read('public/doc-view.js')) && /mark class="vat"/.test(read('public/viewer.js')));
}

// ---------- 92: notes apps ----------
{
  check('notes folders are cleaned: full paths, kinds, no repeats', JSON.stringify(cleanNotesFolders([{ path: 'relative' }, { path: '/n/v', kind: 'x' }, { path: '/n/v' }, { path: '/n/one', kind: 'onenote' }])) === '[{"kind":"obsidian","path":"/n/v"},{"kind":"onenote","path":"/n/one"}]');
  check('saved through the settings, cleaned', JSON.stringify(mergeSettings({}, { notesFolders: [{ path: '/n/v' }] }).notesFolders) === '[{"kind":"obsidian","path":"/n/v"}]');
  // Real paths for this computer (1.5.208 PC check: '/vault' is C:\vault on Windows).
  const P = (...x) => path.resolve(path.join(path.sep, ...x));
  const cfg = { readRoots: [P('inn'), P('docs')], ownReadOnlyRoots: [P('app')], docTools: true, notesFolders: [{ kind: 'obsidian', path: P('vault') }, { kind: 'onenote', path: P('app', 'x') }] };
  applyNotes(cfg, { exists: () => true });
  const has = (p) => cfg.readRoots.some((r) => path.resolve(r) === p);
  check('a notes folder joins the folders Bob may read, never one of his own', has(P('vault')) && !has(P('app', 'x')) && has(P('docs')), JSON.stringify(cfg.readRoots));
  if (process.platform !== 'linux') {
    const c2 = { readRoots: [P('docs')], ownReadOnlyRoots: [P('app')], docTools: true, notesFolders: [{ kind: 'onenote', path: P('APP', 'x') }] };
    applyNotes(c2, { exists: () => true });
    check('…and on a case-blind disk, his own folder in other letters is still his own', !c2.readRoots.some((r) => /x$/i.test(r)));
  }
  cfg.notesFolders = [];
  applyNotes(cfg, { exists: () => true });
  check('taken off the list, it leaves again', !has(P('vault')) && cfg.readRoots.join() === [P('inn'), P('docs')].join());
  cfg.notesFolders = [{ kind: 'obsidian', path: P('vault') }]; cfg.docTools = false;
  applyNotes(cfg, { exists: () => true });
  check('with reading documents off, none join', !has(P('vault')));
  check('Obsidian notes read as plain words', obsidianText('---\ntags: [a]\n---\nSee [[Rent plan|my plan]] and [[Landlord]] #money ![[pic.png]]') === 'See my plan and Landlord money ');
  check('only notes in a picked vault are tidied', inVault({ notesFolders: [{ kind: 'obsidian', path: path.join(tmp, 'v') }] }, path.join(tmp, 'v', 'a.md')) && !inVault({ notesFolders: [{ kind: 'obsidian', path: path.join(tmp, 'v') }] }, path.join(tmp, 'w', 'a.md')));
  check('a vault is told by its .obsidian folder', isVault('/v', { exists: (p) => p === path.join('/v', '.obsidian') }) && !isVault('/w', { exists: () => false }));
}

// ---------- 93: the Sunday digest ----------
{
  const cfg = { timeZone: 'UTC' };
  const at = (s) => Date.parse(s);
  check('due on Sunday from 9 am', dueSunday(cfg, at('2026-11-15T09:30:00Z')) === '2026-11-15' && dueSunday(cfg, at('2026-11-15T08:00:00Z')) === '');
  check('caught up until Tuesday, then not', dueSunday(cfg, at('2026-11-17T20:00:00Z')) === '2026-11-15' && dueSunday(cfg, at('2026-11-18T10:00:00Z')) === '');
  check('once a week', dueSunday(cfg, at('2026-11-16T10:00:00Z'), '2026-11-15') === '');
  check('the user\'s own time zone', localParts({ timeZone: 'America/Edmonton' }, at('2026-11-16T03:00:00Z')).dow === 0);
  const d = makeDigest({
    sunday: '2026-11-15',
    chats: [{ title: 'Tax questions', lastTouched: at('2026-11-12T10:00:00Z') }, { title: 'Old chat', lastTouched: at('2026-11-01T10:00:00Z') }, { title: '(empty chat)', lastTouched: at('2026-11-12T10:00:00Z') }],
    tidied: [{ title: 'Garden plans', to: at('2026-11-10T10:00:00Z') }],
    log: ['- 2026-11-13, 09:00 | reminder | Call the vet', '- 2026-11-01, 09:00 | reminder | Too old', '- 2026-11-13, 09:00 | settings | not a reminder'],
    notes: [{ text: '2026-11-14 10:00 · Budget is 900 a month (noticed by Bob)' }, { text: '2026-11-14 10:00 · My own note' }],
    memory: '- Likes tea (2026-11-12)\n- Old (2026-10-01)'
  });
  check('the week\'s chats, newest first, old and empty ones left out', /## Chats \(2\)\n- Tax questions\n- Garden plans/.test(d.text), d.text);
  check('the week\'s reminders', /## Reminders that went off \(1\)\n- Call the vet/.test(d.text));
  check('what he noticed: his own notes and new memories', /Budget is 900 a month/.test(d.text) && /Remembered: Likes tea/.test(d.text) && !/My own note/.test(d.text) && !/Old/.test(d.text.split('## Things')[1]));
  check('a quiet week says so', /None this week/.test(makeDigest({ sunday: '2026-11-15' }).text));
  // Saved as a file, shown once, and only while on.
  const inn = path.join(tmp, 'digest-inn');
  fs.mkdirSync(path.join(inn, 'bob'), { recursive: true });
  const dcfg = { innDir: inn, dataDir: path.join(inn, 'bob'), logbook: path.join(inn, 'logbook.md'), memoryFile: path.join(inn, 'bob-memory.md'), timeZone: 'UTC' };
  const shown = [];
  const keeper = new Digest(dcfg, { broadcast: (e) => shown.push(e), now: () => at('2026-11-15T10:00:00Z') });
  check('off: nothing is made', keeper.check() === null && !shown.length);
  dcfg.weeklyDigest = true;
  const made = keeper.check();
  check('on: made, saved and shown on Sunday', made && fs.existsSync(path.join(inn, 'digests', 'digest-2026-11-15.md')) && shown.length === 1 && shown[0].type === 'digest');
  check('and not again that week', keeper.check() === null && shown.length === 1);
  const thu = new Digest(dcfg, { now: () => at('2026-11-12T15:00:00Z') }).build();
  check('"Make this week\'s digest now" on a Thursday is this week, Monday to the coming Sunday', thu.sunday === '2026-11-15' && /Week of 2026-11-09 to 2026-11-15/.test(thu.title));
  check('the chat and the phone app show it', /case 'digest':/.test(publicText('app.js')) && /ev\.type === 'digest'\) return digestCard/.test(read('android/app/src/main/assets/www/phone.js')) && /ev\.type === 'digest'\) return digestCard/.test(read('public/phone/phone.js')));
}

// ---------- Settings, the server, the first-time list ----------
{
  const cellar = publicText('cellar.js'), server = read('src/server.js');
  for (const [k, label] of [['memorySources', 'Memory sources'], ['memoryExpiry', 'Expiring memories'], ['memoryWhere', 'Per-project memories'], ['docFresh', 'Live document index'], ['docPlaces', 'Cite page and line'], ['weeklyDigest', 'Sunday digest']]) {
    check(`Settings has "${label}", off unless turned on`, cellar.includes(`sswitch('${k}', settings.${k} === true, '${label}', '`));
    check(`the server saves and shows ${k}`, server.includes(`typeof b.${k} === 'boolean'`) && server.includes(`${k}: cfg.${k} === true`));
    check(`${k} is on the first-time list`, WANTS.some((w) => w.key === k && w.setting === label));
  }
  check('Settings lists the memories with Open the chat and Forget, always shown', /data-memsources>Where my memories came from/.test(cellar) && /data-memchat=/.test(cellar) && /data-memforget=/.test(cellar));
  check('the notes folders and the digest button are always shown', cellar.includes('${notesFoldersHtml()}') && cellar.includes('data-digestnow'));
  check('the server lists, forgets and makes the digest on this computer only', /p === '\/api\/memory\/sources'[\s\S]{0,120}if \(!isLocal\)/.test(server) && /p === '\/api\/memory\/forget'[\s\S]{0,120}if \(!isLocal\)/.test(server) && server.includes("p === '/api/digest/now'"));
  check('Open the chat reaches the chat window from the Settings window', RELAY.includes('bob-open-chat') && /addEventListener\('bob-open-chat'/.test(publicText('app.js')));
}

// ---------- Help in Bob's voice, the glossary and the FAQ ----------
{
  const entry = (id) => HELP.find((e) => e.id === id);
  for (const id of ['memory-more', 'doc-more', 'digest']) check(`Help: ${id}, in Bob's voice, says where it works`, Boolean(entry(id)) && /\bI\b/.test(entry(id).html) && /Windows, Mac and Linux/.test(entry(id).html) && /(Android|phone app)/.test(entry(id).html));
  check('Help says OneNote needs exporting first', /File, Export/.test(entry('doc-more').html));
  const g = entry('glossary').html;
  check('glossary entries', ['Memory source', 'Digest (Sunday digest)', 'Obsidian vault', 'Page and line (place)'].every((t) => g.includes(`<dt>${t}</dt>`)));
  check('FAQ entries', ['faq-memory-where-from', 'faq-memory-for-a-while', 'faq-obsidian-onenote', 'faq-digest'].every((id) => entry(id)?.group === 'FAQ'));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
