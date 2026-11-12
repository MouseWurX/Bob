// Back up and move (src/backup.js, src/backup-apply.js, public/backup-panel.js, the phone's backup in logic.js):
// one zip of chats, settings, memory and notes; keys only when ticked and locked with a passcode; a restore that waits
// for the next start and brings doors back switched off; the automatic backup, off unless switched on.
// Everything runs in a made-up inn in a test folder: nothing here reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PARTS, PART_IDS, NOT_BACKED_UP, KEY_NAMES, partOf, skipped, backupFiles, doorsOf, gatherKeys, lock, unlock, storeKey, makeBackup,
  pruneAuto, readBackup, rebase, rebaseJson, safeSettings, stageRestore, BackupKeeper, backupView, backupName, AUTO_RE, keyNames, MANIFEST, SECRETS
} from '../src/backup.js';
import { cleanBackup, BACKUP_DEFAULTS } from '../src/backup-settings.js';
import { applyWaitingRestore } from '../src/backup-apply.js';
import { readZipList, writeZip } from '../src/zip.js';
import { HELP } from '../public/help-content.js';
import { allTopics, cardOf } from '../public/settings-map.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-backup-test-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });
const put = (f, text) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const FAST = { N: 2 ** 10, r: 8, p: 1 };

function makeBob(name) {
  const agentDir = path.join(tmp, name), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
  const cfg = { agentDir, innDir, dataDir, archiveDir: path.join(innDir, 'archive'), configFile: path.join(agentDir, 'config.json'), models: { bob: path.join(agentDir, 'models', 'riker-q4.gguf'), tinker: '' } };
  fs.mkdirSync(dataDir, { recursive: true });
  return cfg;
}

// ---------- the old computer ----------
const a = makeBob('old');
put(path.join(a.dataDir, 'sessions', 'main.json'), JSON.stringify([{ role: 'user', content: 'hello' }]));
put(path.join(a.dataDir, 'sessions', 'main.older.json'), '[]');
put(path.join(a.dataDir, 'chat-summaries.json'), '{}');
put(path.join(a.dataDir, 'settings.json'), JSON.stringify({ catName: 'Patches', saveDir: path.join(a.innDir, 'painter'), hands: { files: true }, rentals: { enabled: { runpod: true }, current: 'abc123', list: [] }, cloudHelpers: { anthropic: { enabled: true, model: 'x' } }, backup: { auto: true, folder: path.join(tmp, 'gone') }, autostart: true }));
put(path.join(a.dataDir, 'schedules.json'), JSON.stringify([{ id: 's1', name: 'Morning check', enabled: true }]));
put(path.join(a.innDir, 'voices', 'bob.wav'), 'RIFF');
put(path.join(a.innDir, 'bob-memory.md'), '- Likes tea\n');
put(path.join(a.dataDir, 'memory-vectors.json'), '[]');
put(path.join(a.innDir, 'archive', 'quick-notes-removed.md'), 'old note\n');
put(path.join(a.innDir, 'quick-notes.md'), '- 2026-11-11 ring the vet\n');
put(path.join(a.innDir, 'ledger', 'fuel-2026-11-01.csv'), 'date,litres\n');
put(path.join(a.innDir, 'tools', 'adder', 'tool.mjs'), 'export default 1');
put(path.join(a.innDir, 'tools', '_scratch', 'run1.mjs'), 'scratch');
put(path.join(a.dataDir, 'made.json'), JSON.stringify([{ path: path.join(a.innDir, 'painter', 'cat.png'), at: 1 }]));
// never in a backup
put(path.join(a.dataDir, 'thumbs', 'x.webp'), 'thumb');
put(path.join(a.dataDir, 'selftools.json'), '{"adder":"sha"}');
put(path.join(a.dataDir, 'catalog-latest.json'), '{}');
put(path.join(a.innDir, 'painter', 'cat.png'), 'PNG');
put(a.configFile, JSON.stringify({ port: 7777, discord: { enabled: true, dmEnabled: true, ownerId: '123', token: 'never' }, telegram: { enabled: true, ownerId: 5 }, remote: { enabled: true, passcode: 'phone-pass-99', hosts: ['100.64.1.2:7777'] } }));
const env = { RUNPOD_API_KEY: 'rpa_REALKEY1234567890', BOB_DISCORD_TOKEN: 'disc.token.value', NOT_OURS: 'x' };

// ---------- parts ----------
check('six parts, with the list of made things but not the things', PART_IDS.join() === 'chats,settings,memory,notes,tools,made' && PARTS.find((p) => p.id === 'made').paths.join() === 'bob/made.json');
check('parts: a chat is a chat, a thumbnail is in no part', partOf('bob/sessions/main.json') === 'chats' && partOf('bob/thumbs/x.webp') === '' && partOf('tools/_scratch/a') === '' && partOf('tools/adder/tool.mjs') === 'tools');
check('no path is both backed up and skipped', PARTS.every((p) => p.paths.every((x) => !NOT_BACKED_UP.includes(x))));
const { entries, counts } = backupFiles(a);
const names = entries.map((e) => e.name);
check('backup files: chats, settings, memory, notes, tools and the made list', ['inn/bob/sessions/main.json', 'inn/bob/settings.json', 'inn/voices/bob.wav', 'inn/bob-memory.md', 'inn/quick-notes.md', 'inn/ledger/fuel-2026-11-01.csv', 'inn/tools/adder/tool.mjs', 'inn/bob/made.json'].every((n) => names.includes(n)), names.join(' '));
check('backup files: never caches, pictures, scratch or tool approvals', !names.some((n) => /thumbs|painter\/|_scratch|selftools\.json|catalog-latest/.test(n)), names.join(' '));
check('backup files: counted per part', counts.chats === 3 && counts.notes === 2 && counts.made === 1, JSON.stringify(counts));
check('only the parts asked for', backupFiles(a, ['notes']).entries.every((e) => /quick-notes|ledger/.test(e.name)));

// Every file Bob's code keeps in the inn is either backed up or deliberately left out.
const src = path.join(here, '..', 'src');
const seen = new Set();
for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.js'))) {
  const t = fs.readFileSync(path.join(src, f), 'utf8');
  for (const m of t.matchAll(/path\.join\((?:this\.)?cfg\.dataDir, '([^']+)'/g)) seen.add('bob/' + m[1]);
  for (const m of t.matchAll(/path\.join\((?:this\.)?cfg\.innDir, '([^']+)'(?:, '([^']+)')?/g)) if (m[1] !== 'bob') seen.add(m[2] ? `${m[1]}/${m[2]}` : m[1]);
}
const unsorted = [...seen].filter((rel) => !(partOf(rel) || partOf(rel + '/x') || skipped(rel) || skipped(rel + '/')));
check('every file Bob keeps in the inn is in a part or on the never list', unsorted.length === 0, unsorted.join(', '));

// ---------- doors and keys ----------
const doors = doorsOf(JSON.parse(fs.readFileSync(a.configFile, 'utf8')));
check('doors: Discord and Telegram kept, switched off, no token', doors.discord.ownerId === '123' && doors.discord.enabled === false && doors.discord.dmEnabled === false && !('token' in doors.discord) && doors.telegram.enabled === false);
check('doors: never phone access', !('remote' in doors));
const g = gatherKeys({ ...a, remote: { passcode: 'phone-pass-99' } }, env);
check('keys: only the names Bob reads', g.keys.RUNPOD_API_KEY && g.keys.BOB_DISCORD_TOKEN && !('NOT_OURS' in g.keys) && g.phonePasscode === 'phone-pass-99');
check('keys: a typed-in "Another service" key name counts too', keyNames({ rentals: { list: [{ keyEnv: 'MY_FRIEND_KEY' }] } }).includes('MY_FRIEND_KEY') && KEY_NAMES.includes('HF_TOKEN'));
const locked = lock({ keys: { A_KEY: 'secret-value' } }, 'correct horse', { scrypt: FAST });
check('locked keys: the value is not readable in the file', !locked.toString('utf8').includes('secret-value'));
check('locked keys: the passcode opens them', unlock(locked, 'correct horse').keys.A_KEY === 'secret-value');
let wrong = '';
try { unlock(locked, 'wrong horse'); } catch (e) { wrong = e.message; }
check('locked keys: a wrong passcode says so', /passcode doesn't open/.test(wrong));
let short = '';
try { lock({}, 'short'); } catch (e) { short = e.message; }
check('locked keys: a passcode of at least 8 characters', /at least 8/.test(short));

// ---------- making one ----------
const out = path.join(tmp, 'usb');
fs.mkdirSync(out);
const when = new Date(2026, 10, 11, 13, 28);
const plain = makeBackup({ ...a, remote: JSON.parse(fs.readFileSync(a.configFile, 'utf8')).remote }, { folder: out, env, version: '1.5.204', now: when });
check('backup: named by its date, in the folder picked', path.basename(plain.file) === 'Bob backup 2026-11-11 1328.zip' && fs.existsSync(plain.file));
const listed = readZipList(plain.file).entries.map((e) => e.name);
check('backup: its own list first, doors with it, no keys unless ticked', listed[0] === MANIFEST && listed.includes('doors.json') && !listed.includes(SECRETS));
const raw = fs.readFileSync(plain.file);
check('backup: no key, token or phone passcode anywhere in it', !raw.includes('rpa_REALKEY') && !raw.includes('disc.token') && !raw.includes('phone-pass-99') && !raw.includes('never'));
const again = makeBackup(a, { folder: out, env, now: when });
check('backup: a second one the same minute gets its own name', path.basename(again.file) === 'Bob backup 2026-11-11 1328 2.zip');
let inside = '';
try { makeBackup(a, { folder: path.join(a.innDir, 'archive'), env }); } catch (e) { inside = e.message; }
check('backup: never into the inn itself', /outside Bob's inn/.test(inside));
let noPass = '';
try { makeBackup(a, { folder: out, keys: true, passcode: '', env }); } catch (e) { noPass = e.message; }
check('backup: keys need a passcode', /passcode/.test(noPass));
const withKeys = makeBackup({ ...a, remote: { passcode: 'phone-pass-99' } }, { folder: out, keys: true, passcode: 'move my bob please', env, now: new Date(2026, 10, 11, 14, 0) });
const wk = fs.readFileSync(withKeys.file);
check('backup with keys: locked, and still no key in plain text', readZipList(withKeys.file).entries.some((e) => e.name === SECRETS) && withKeys.keys === 3 && !wk.includes('rpa_REALKEY') && !wk.includes('phone-pass-99'));
let autoKeys = '';
try { makeBackup(a, { folder: out, keys: true, passcode: 'move my bob please', auto: true, env }); } catch (e) { autoKeys = e.message; }
check('automatic backups never hold keys', /never holds keys/.test(autoKeys));

// ---------- reading one ----------
const info = readBackup(withKeys.file);
check('read: when, version, parts, counts, keys, brains', info.parts.join() === PART_IDS.join() && info.counts.chats === 3 && info.keys && info.doors && info.brains.join() === 'riker-q4.gguf', JSON.stringify(info));
const other = path.join(tmp, 'photos.zip');
writeZip(other, [{ name: 'a.txt', data: Buffer.from('hi'), size: 2, mtime: new Date() }]);
let notOurs = '';
try { readBackup(other); } catch (e) { notOurs = e.message; }
check('read: a zip that isn\'t a backup is refused', /isn't one of Bob's backups/.test(notOurs));
const newer = path.join(tmp, 'newer.zip');
writeZip(newer, [{ name: MANIFEST, data: Buffer.from(JSON.stringify({ kind: 'bob-backup', format: 99 })), size: 1, mtime: new Date() }]);
let tooNew = '';
try { readBackup(newer); } catch (e) { tooNew = e.message; }
check('read: one from a newer Bob asks for an update first', /newer Bob/.test(tooNew));

// ---------- paths on the new computer ----------
check('rebase: a Windows path moves under the new folder, with this system\'s separators', rebase('C:\\Users\\you\\Bob\\inn\\painter\\cat.png', [['C:\\Users\\you\\Bob\\inn', '/home/you/Bob/inn']], { sep: '/' }) === '/home/you/Bob/inn/painter/cat.png');
check('rebase: case and slashes don\'t matter on Windows', rebase('c:/users/you/bob/inn/x', [['C:\\Users\\you\\Bob\\inn', 'D:\\Bob\\inn']], { sep: '\\' }) === 'D:\\Bob\\inn\\x');
check('rebase: other paths and words stay as they were', rebase('D:\\Games\\x', [['C:\\Bob', 'E:\\Bob']]) === 'D:\\Games\\x' && rebase('hello', [['C:\\Bob', 'E:\\Bob']]) === 'hello' && rebase('C:\\Bobby', [['C:\\Bob', 'E:\\Bob']]) === 'C:\\Bobby');
check('rebase: inside lists and objects', rebaseJson({ a: ['/old/inn/x'], n: 3 }, [['/old/inn', '/new/inn']], { sep: '/' }).a[0] === '/new/inn/x');
const safe = safeSettings({ hands: { run: true }, selfWork: { enabled: true }, rentals: { enabled: { runpod: true }, current: 'x', list: [1] }, cloudHelpers: { anthropic: { enabled: true, model: 'm' } }, backup: { auto: true }, catName: 'Tom', autostart: true });
check('restored settings: doors, money and acting alone come back off', !safe.hands && !safe.selfWork && !safe.autostart && Object.keys(safe.rentals.enabled).length === 0 && safe.rentals.list.length === 1 && safe.cloudHelpers.anthropic.enabled === false && safe.backup.auto === false && safe.catName === 'Tom');

// ---------- restoring on the new computer ----------
const b = makeBob('new');
put(path.join(b.innDir, 'bob-memory.md'), '- New computer memory\n');
put(b.configFile, JSON.stringify({ port: 7777, remote: { enabled: false, hosts: [] } }));
const stored = [];
const store = async (k, v) => { stored.push([k, v]); };
let badPass = '';
try { await stageRestore(b, withKeys.file, { keys: true, passcode: 'not it at all', store, env: {} }); } catch (e) { badPass = e.message; }
check('restore: a wrong passcode stops it before anything changes', /passcode doesn't open/.test(badPass) && !fs.existsSync(path.join(b.innDir, 'restore-waiting')) && stored.length === 0);
const r = await stageRestore(b, withKeys.file, { keys: true, passcode: 'move my bob please', store, env: { BOB_DISCORD_TOKEN: 'already here' } });
check('restore: files wait for the next start', r.waiting && r.files > 5 && fs.existsSync(path.join(b.innDir, 'restore-waiting', 'plan.json')) && fs.readFileSync(path.join(b.innDir, 'bob-memory.md'), 'utf8').includes('New computer'));
check('restore: keys this computer lacks are put back, its own are kept', stored.length === 1 && stored[0][0] === 'RUNPOD_API_KEY' && r.keys.kept.includes('BOB_DISCORD_TOKEN') && r.keys.restored.includes('phone passcode'));
const conf = JSON.parse(fs.readFileSync(b.configFile, 'utf8'));
check('restore: Discord and Telegram details back, switched off; the phone passcode back, phone access off', conf.discord.ownerId === '123' && conf.discord.enabled === false && conf.telegram.enabled === false && conf.remote.passcode === 'phone-pass-99' && conf.remote.enabled === false && !conf.discord.token && conf.port === 7777);
const staged = JSON.parse(fs.readFileSync(path.join(b.innDir, 'restore-waiting', 'inn', 'bob', 'settings.json'), 'utf8'));
check('restore: the old computer\'s folders become this one\'s', staged.saveDir === path.join(b.innDir, 'painter'), staged.saveDir);
check('restore: Hands, rentals and the automatic backup come back off', !staged.hands && Object.keys(staged.rentals.enabled).length === 0 && staged.backup.auto === false && staged.catName === 'Patches');
const sched = JSON.parse(fs.readFileSync(path.join(b.innDir, 'restore-waiting', 'inn', 'bob', 'schedules.json'), 'utf8'));
check('restore: scheduled jobs come back switched off', sched[0].enabled === false && sched[0].name === 'Morning check');
check('restore: tool approvals are not carried over', !fs.existsSync(path.join(b.innDir, 'restore-waiting', 'inn', 'bob', 'selftools.json')));
const onlyNotes = makeBob('notes-only');
const r2 = await stageRestore(onlyNotes, plain.file, { parts: ['notes'], store, env: {} });
check('restore: only the parts ticked', r2.parts.join() === 'notes' && !fs.existsSync(path.join(onlyNotes.innDir, 'restore-waiting', 'inn', 'bob', 'settings.json')) && fs.existsSync(path.join(onlyNotes.innDir, 'restore-waiting', 'inn', 'quick-notes.md')));

// ---------- at the next start ----------
const res = applyWaitingRestore(b, { now: new Date(2026, 10, 12, 9, 5) });
check('start: the files go into place', fs.readFileSync(path.join(b.innDir, 'bob-memory.md'), 'utf8').includes('Likes tea') && fs.existsSync(path.join(b.dataDir, 'sessions', 'main.json')));
check('start: what they replaced is kept in the archive, not deleted', fs.readFileSync(path.join(b.innDir, 'archive', 'before restore 2026-11-12 0905', 'bob-memory.md'), 'utf8').includes('New computer') && res.kept === 1);
check('start: the waiting folder is gone and the result is noted', !fs.existsSync(path.join(b.innDir, 'restore-waiting')) && JSON.parse(fs.readFileSync(path.join(b.dataDir, 'restore-result.json'), 'utf8')).placed === res.placed && res.failed.length === 0);
check('start: nothing waiting, nothing done', applyWaitingRestore(b) === null);
const v = backupView(b, null, { env: {} });
check('Settings view: the last restore, and the phone passcode that came back', v.lastRestore?.placed === res.placed && v.keysHere === 1 && v.waiting === false && v.settings.auto === false, JSON.stringify(v));

// ---------- the automatic backup ----------
check('automatic backup: off unless switched on, weekly, keeps 5', JSON.stringify(cleanBackup({})) === JSON.stringify(BACKUP_DEFAULTS) && BACKUP_DEFAULTS.auto === false);
check('automatic backup: settings checked', cleanBackup({ auto: true, every: 'hourly', keep: 99, folder: 'relative' }).every === 'week' && cleanBackup({ keep: 99 }).keep === 5 && cleanBackup({ folder: 'relative' }).folder === '' && cleanBackup({ every: 'day' }).every === 'day');
const logs = [];
let clock = Date.UTC(2026, 10, 11, 12);
const keeper = new BackupKeeper(a, { log: (t) => logs.push(t), now: () => clock, timer: false });
check('automatic backup: nothing while off', keeper.tick() === null && logs.length === 0);
const autoDir = path.join(tmp, 'auto');
fs.mkdirSync(autoDir);
a.backup = { auto: true, every: 'week', folder: autoDir, keep: 2 };
const first = keeper.tick();
check('automatic backup: saved when on, named as automatic', first && AUTO_RE.test(path.basename(first.file)) && !readZipList(first.file).entries.some((e) => e.name === SECRETS));
check('automatic backup: not again until a week has passed', keeper.tick() === null);
clock += 3 * 24 * 3600e3; check('automatic backup: not after 3 days', keeper.tick() === null);
clock += 5 * 24 * 3600e3; check('automatic backup: again after 8 days', keeper.tick() !== null);
clock += 8 * 24 * 3600e3; keeper.tick();
put(path.join(autoDir, 'my own notes.txt'), 'keep me');
const autos = fs.readdirSync(autoDir).filter((n) => AUTO_RE.test(n));
check('automatic backup: keeps the newest few, never other files', autos.length === 2 && fs.existsSync(path.join(autoDir, 'my own notes.txt')), autos.join(', '));
a.backup.folder = path.join(tmp, 'unplugged');
clock += 8 * 24 * 3600e3;
check('automatic backup: a missing folder is noted, not created', keeper.tick() === null && /can't find/.test(keeper.state().lastError) && !fs.existsSync(a.backup.folder));
check('prune: only Bob\'s automatic names', pruneAuto(autoDir, 0).length === 2 && fs.existsSync(path.join(autoDir, 'my own notes.txt')));
check('names: an automatic one says so', backupName(when, { auto: true }) === 'Bob backup 2026-11-11 1328 (automatic).zip');

// ---------- keys go where Bob reads them ----------
const fakeHome = path.join(tmp, 'home');
await storeKey('RUNPOD_API_KEY', 'abc', { platform: 'linux', home: fakeHome });
await storeKey('RUNPOD_API_KEY', 'def', { platform: 'linux', home: fakeHome });
const envFile = fs.readFileSync(path.join(fakeHome, '.config', 'bob', 'env'), 'utf8');
check('Mac and Linux: ~/.config/bob/env, one line per key', envFile.trim() === 'RUNPOD_API_KEY=def');
let ran = null;
await storeKey('HF_TOKEN', 'hf_x', { platform: 'win32', run: (cmd, args, o, cb) => { ran = [cmd, ...args]; cb(null); } });
check('Windows: your user variables', ran[0] === 'reg' && ran.includes('HKCU\\Environment') && ran.includes('HF_TOKEN'));
let badKey = '';
try { await storeKey('HF_TOKEN', 'a\nb', { platform: 'linux', home: fakeHome }); } catch (e) { badKey = e.message; }
check('a key with a line break is refused', /isn't a key/.test(badKey));

// ---------- wiring ----------
const server = read('src/server.js'), cfgjs = read('src/config.js'), main = read('electron/main.cjs');
check('server: backups only on this replicant matrix itself', /p\.startsWith\('\/api\/backup'\)\) \{\s*if \(!isLocal\) return send\(res, 403/.test(server));
check('config: the waiting restore goes in before settings are read', cfgjs.indexOf('applyWaitingRestore(cfg)') > 0 && cfgjs.indexOf('applyWaitingRestore(cfg)') < cfgjs.indexOf('readSaved(cfg.settingsFile'));
check('config: the backup setting is cleaned', /'backup', /.test(cfgjs) && /out\.backup = cleanBackup/.test(cfgjs));
check('Bob\'s window can restart for a restore', /restart: \(\) => \{ app\.relaunch\(\)/.test(main));
check('Settings: Back up and move is on the This replicant matrix card', allTopics().includes('ev-backup') && cardOf('ev-backup')?.id === 'pc');
const panel = read('public/backup-panel.js');
check('Settings: keys are unticked and the automatic switch is drawn off until saved on', /data-bkkeys \$\{st\.keys \? 'checked' : ''\}/.test(panel) && /keys: false/.test(panel) && /Off unless you turn it on/.test(panel));
check('Settings: every control drawn all the time (passcode, folder, how often)', !/st\.keys \?[^:]*bk-pass/.test(panel) && /data-bkfolder/.test(panel) && /data-bkevery/.test(panel));

// ---------- the phone ----------
await import('../android/app/src/main/assets/www/logic.js');
const L = globalThis.BobLogic;
const pb = L.phoneBackup({ settings: { userName: 'Sam', phoneOn: true, theme: 'inn' }, chats: [{ id: 'c1', title: 'Hi', at: 2, msgs: [{ who: 'you', text: 'hi' }] }], memory: 'Likes tea', bobs: [{ name: 'PC', address: '100.64.1.2', base: 'http://100.64.1.2:7777', token: 'x' }], made: 'now' });
check('phone backup: chats, memory, settings and Bobs, no sign-ins', pb.kind === 'bob-phone-backup' && pb.chats.length === 1 && pb.memory === 'Likes tea' && !('token' in pb.bobs[0]) && !('phoneOn' in pb.settings));
const pr = L.phoneRestore({ chats: [{ id: 'c0', at: 1, msgs: [] }], memory: 'Likes tea\nHas a cat', bobs: [] }, JSON.stringify(pb));
check('phone restore: chats added, memory merged, Bobs added, phone brain off', pr.added === 1 && pr.chats.length === 2 && pr.memory === 'Likes tea\nHas a cat' && pr.newBobs === 1 && pr.settings.phoneOn === false && pr.settings.userName === 'Sam');
check('phone restore: a computer backup says where it goes', /computer/.test(L.phoneRestore({}, JSON.stringify({ kind: 'bob-backup' })).error));
check('phone restore: a stranger\'s address is refused', L.phoneRestore({ bobs: [] }, JSON.stringify({ ...pb, bobs: [{ address: 'evil.example.com' }] })).newBobs === 0);
check('phone restore: not a backup', /isn't/.test(L.phoneRestore({}, 'hello').error));
const bridge = read('android/app/src/main/java/ca/mousewurx/bob/Bridge.kt'), page = read('android/app/src/main/assets/www/index.html');
check('phone: a file picker for the backup, capped in size', /"file\.pick" ->/.test(bridge) && /ACTION_OPEN_DOCUMENT/.test(bridge) && /MAX_BACKUP_BYTES/.test(bridge));
check('phone: the two buttons in Settings', /id="phone-backup"/.test(page) && /id="phone-restore"/.test(page));

// ---------- Help ----------
const ids = new Set(HELP.map((h) => h.id));
const help = HELP.find((h) => h.id === 'backup');
check('Help: a Back up and move page in Bob\'s voice', help && /\bI\b|\bmy\b/.test(help.html) && /passcode/.test(help.html) && /switched off/.test(help.html));
check('Help: an FAQ for moving to a new computer', ids.has('faq-move-bob') && /Back up and move/.test(HELP.find((h) => h.id === 'faq-move-bob').html));
check('Help: the glossary has Back up and move', /<dt>Back up and move<\/dt>/.test(HELP.find((h) => h.id === 'glossary').html));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
