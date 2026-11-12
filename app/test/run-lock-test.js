// 🔒 Passcode lock (src/lock.js) and Lock my chats and memory (src/vault.js): the passcode opens the key, a wrong
// one doesn't, locked files read back only with the key, nothing is written over while Bob holds no key, turning it
// on and off converts every chat and the memory file, and the settings are kept in config.json only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Lock, lockOn, lockView, lockPage, OPEN_WHILE_LOCKED, wrapKey, unwrapKey, idleMinutes } from '../src/lock.js';
import { seal, unseal, isSealed, setKey, hasKey, readJson, writeText, appendText, readText, vaultOn, MAGIC } from '../src/vault.js';
import { writeChat, readChat, chatFile, writeOlder, readOlder } from '../src/chats.js';
import { GROUPS, CARDS } from '../public/settings-map.js';
import { lockSummary, LOST_WARNING } from '../public/lock-settings.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };
const throwsLocked = (fn) => { try { fn(); return false; } catch (e) { return e.code === 'VAULT_LOCKED'; } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lock-'));
const configFile = path.join(root, 'config.json');
fs.writeFileSync(configFile, JSON.stringify({ port: 7777, remote: { enabled: false } }, null, 2));
const cfg = { configFile, dataDir: path.join(root, 'inn', 'bob'), memoryFile: path.join(root, 'inn', 'bob-memory.md') };
fs.mkdirSync(cfg.dataDir, { recursive: true });
let clock = 1_000_000;
const lock = new Lock(cfg, { now: () => clock });
setKey(null);

// Off by default.
check('off by default', !lockOn(cfg) && !vaultOn(cfg) && lockView(cfg).enabled === false && lockView(cfg).passcodeSet === false);
check('everything is allowed while it is off', lock.allowed({ headers: {} }));

// Plain files keep working before anything is switched on.
writeChat(cfg, 'chat-1', [{ role: 'user', content: 'hello there' }]);
fs.writeFileSync(cfg.memoryFile, '- likes tea (2026-11-11)\n');
check('plain chats are plain JSON', fs.readFileSync(chatFile(cfg, 'chat-1'), 'utf8').includes('hello there'));

// Passcode rules.
check("can't switch on without a passcode", /passcode first/.test(lock.change({ enabled: true }).error || ''));
check('a short passcode is refused', /at least 4/.test(lock.change({ newPasscode: '12' }).error || ''));
check("encryption can't go on before the lock", /Ask for a passcode/.test(lock.change({ newPasscode: 'tea-time', encrypt: true }).error || ''));
const made = lock.change({ newPasscode: 'tea-time' });
check('making a passcode works', !made.error && lockView(cfg).passcodeSet === true && !lockOn(cfg));
const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
check('kept in config.json, with no copy of the passcode', raw.lock?.wrapped && raw.lock?.salt && !JSON.stringify(raw).includes('tea-time') && raw.remote?.enabled === false);
check('the view never shows the passcode or key', !JSON.stringify(lockView(cfg, lock)).match(/tea-time|wrapped|salt/));

check('switching on', !lock.change({ enabled: true, idleMinutes: 10 }).error && lockOn(cfg) && idleMinutes(cfg) === 10);
check('idle minutes are checked', /Pick 0/.test(lock.change({ idleMinutes: -3 }).error || '') && /Pick 0/.test(lock.change({ idleMinutes: 99999 }).error || ''));
check('a window without a token is locked out', !lock.allowed({ headers: {} }) && !lock.allowed({ headers: { cookie: 'bob_lock=abc' } }));

// Unlocking.
setKey(null);
const wrong = lock.unlock('coffee');
check('a wrong passcode is refused and gives no key', wrong.code === 401 && !hasKey());
const right = lock.unlock('tea-time');
const req = { headers: { cookie: `x=1; bob_lock=${right.token}` } };
check('the right passcode lets that window in and opens the key', right.token && lock.allowed(req) && hasKey());
check('the cookie is HttpOnly, SameSite=Strict, gone when the window closes', /HttpOnly/.test(lock.cookie('t')) && /SameSite=Strict/.test(lock.cookie('t')) && !/Max-Age|Expires/.test(lock.cookie('t')));
clock += 9 * 60000; lock.touch(req); clock += 9 * 60000;
check('clicking keeps it open', lock.allowed(req));
clock += 11 * 60000;
check('locks again after the idle minutes', !lock.allowed(req));
const again = lock.unlock('tea-time');
check('Lock Bob now locks every window', (lock.lockNow(), !lock.allowed({ headers: { cookie: `bob_lock=${again.token}` } })));
for (let i = 0; i < 5; i++) lock.unlock('nope');
check('five wrong tries a minute at most', lock.unlock('tea-time').code === 429);
clock += 61000;
const back = lock.unlock('tea-time');
check('a minute later it works again', Boolean(back.token));

// Lock my chats and memory.
const on = lock.change({ encrypt: true });
check('encryption on converts every chat and the memory file', !on.error && on.changed === 2 && vaultOn(cfg), JSON.stringify(on));
const disk = fs.readFileSync(chatFile(cfg, 'chat-1'));
check('locked files start with the marker and hide the words', isSealed(disk) && disk.subarray(0, MAGIC.length).equals(MAGIC) && !disk.includes('hello there') && !fs.readFileSync(cfg.memoryFile).includes('tea'));
check('Bob reads them back with the key', readChat(cfg, 'chat-1')[0].content === 'hello there' && readText(cfg.memoryFile).includes('likes tea'));
writeChat(cfg, 'chat-2', [{ role: 'user', content: 'new chat' }]);
writeOlder(cfg, 'chat-2', [{ role: 'user', content: 'older bit' }]);
appendText(cfg, cfg.memoryFile, '- has a cat (2026-11-11)\n');
check('new chats and memory lines are written locked', isSealed(fs.readFileSync(chatFile(cfg, 'chat-2'))) && readOlder(cfg, 'chat-2')[0].content === 'older bit' && isSealed(fs.readFileSync(cfg.memoryFile)) && readText(cfg.memoryFile).includes('has a cat') && readText(cfg.memoryFile).includes('likes tea'));

// Bob restarts: no key until someone types the passcode.
setKey(null);
check('without the key a locked chat is never read as empty', throwsLocked(() => readChat(cfg, 'chat-1')) && throwsLocked(() => readText(cfg.memoryFile)));
check('and nothing is written over', throwsLocked(() => writeChat(cfg, 'chat-1', [])) && throwsLocked(() => appendText(cfg, cfg.memoryFile, '- x\n')) && (setKey(null), true));
check("encryption can't be switched while the key is shut away", /passcode again/.test(lock.change({ encrypt: false }).error || ''));
lock.unlock('tea-time');
check('after the passcode, everything is there', readChat(cfg, 'chat-1')[0].content === 'hello there' && readText(cfg.memoryFile).includes('likes tea'));

// Changing the passcode keeps the same key: the chats needn't be redone.
check('changing the passcode needs the one you have now', /you have now/.test(lock.change({ newPasscode: 'biscuit', current: 'wrong' }).error || ''));
check('changing it works', !lock.change({ newPasscode: 'biscuit', current: 'tea-time' }).error);
setKey(null);
check('the old passcode no longer opens it', Boolean(lock.unlock('tea-time').error) && !hasKey());
check('the new one opens the same chats', Boolean(lock.unlock('biscuit').token) && readChat(cfg, 'chat-1')[0].content === 'hello there');
check("the lock can't go off while chats are locked", /Turn off Lock my chats/.test(lock.change({ enabled: false }).error || ''));

const off = lock.change({ encrypt: false });
check('encryption off puts every file back to plain (the memory change log too)', !off.error && off.changed === 5 && fs.existsSync(path.join(path.dirname(cfg.memoryFile), 'memory-changes.jsonl')) && !isSealed(fs.readFileSync(path.join(path.dirname(cfg.memoryFile), 'memory-changes.jsonl'))) && !isSealed(fs.readFileSync(chatFile(cfg, 'chat-1'))) && fs.readFileSync(cfg.memoryFile, 'utf8').includes('has a cat'), JSON.stringify(off));
check('then the lock can go off', !lock.change({ enabled: false }).error && !lockOn(cfg) && lock.allowed({ headers: {} }));

// Key wrapping on its own.
const k = Buffer.alloc(32, 7);
const w = wrapKey('pass', k);
check('wrapped key opens only with its passcode', unwrapKey('pass', w)?.equals(k) && unwrapKey('Pass', w) === null && unwrapKey('pass', {}) === null);
check('seal and unseal round trip', unseal(seal('héllo 🐱', k), k) === 'héllo 🐱' && unseal(Buffer.from('plain'), null) === 'plain');
let tampered = seal('secret', k); tampered[tampered.length - 1] ^= 1;
check('a changed locked file is refused, not misread', (() => { try { unseal(tampered, k); return false; } catch { return true; } })());
check('readJson gives the default for a missing file', readJson(path.join(root, 'nope.json'), 'd') === 'd');
setKey(null);
writeText({ lock: {} }, path.join(root, 'plain.txt'), 'ok');
check('writing with the lock off stays plain', fs.readFileSync(path.join(root, 'plain.txt'), 'utf8') === 'ok');

// The lock screen and what stays open.
const page = lockPage({ next: '/settings.html?x=1', wrong: '<b>no</b>' });
check('lock screen: one passcode box, escaped words, a way back to the page', /type="password"/.test(page) && page.includes('&lt;b&gt;no&lt;/b&gt;') && page.includes('value="/settings.html?x=1"'));
check('lock screen never sends you to another site', lockPage({ next: '//evil.example/' }).includes('value="/"') && lockPage({ next: 'http://evil.example/' }).includes('value="/"'));
check('lock screen: works on a phone-width window and in light and dark', /width=device-width/.test(page) && /prefers-color-scheme: light/.test(page) && /min\(320px/.test(page));
check('only the lock screen, the running check and quitting stay open', OPEN_WHILE_LOCKED('GET', '/icons/bob-32.png') && OPEN_WHILE_LOCKED('GET', '/api/status') && OPEN_WHILE_LOCKED('POST', '/unlock') && OPEN_WHILE_LOCKED('POST', '/api/quit')
  && !OPEN_WHILE_LOCKED('GET', '/') && !OPEN_WHILE_LOCKED('GET', '/api/chats') && !OPEN_WHILE_LOCKED('POST', '/api/lock') && !OPEN_WHILE_LOCKED('GET', '/api/memory/text'));

// Settings.
check('Settings has the 🔒 Passcode lock panel in This replicant matrix', GROUPS.find(([g]) => g === 'This replicant matrix')[1].includes('ev-lock') && CARDS.find((c) => c.id === 'pc').topics.includes('ev-lock'));
check('closed panel says what is set', lockSummary({ enabled: false }) === 'Off' && /locks after 5 min/.test(lockSummary({ enabled: true, idleMinutes: 5 })) && /chats and memory locked/.test(lockSummary({ enabled: true, encrypt: true })));
check('the lost-passcode warning is plain', /gone for good/.test(LOST_WARNING) && /no reset/.test(LOST_WARNING));
const ui = fs.readFileSync(new URL('../public/lock-settings.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
check('nothing in the panel is disabled or hidden until a box is ticked', !/disabled|hidden/.test(ui.split('export async function mountLockSettings')[1].split('const load')[0]));
const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
check('the lock is checked before anything else on this replicant matrix', server.indexOf('isLocal && lockOn(cfg)') > 0 && server.indexOf('isLocal && lockOn(cfg)') < server.indexOf("p === '/api/events'"));

// Bob for Android (assets/www/lock.js): the same lock, in the app's own storage.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const www = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'assets', 'www');
await import(pathToFileURL(path.join(www, 'lock.js')));
const PL = globalThis.BobLock;
localStorage.setItem('bob.chats', JSON.stringify([{ id: 'a', title: 'phone chat', msgs: [{ who: 'you', text: 'secret pie' }] }]));
localStorage.setItem('bob.memory', JSON.stringify('- likes pie'));
check('phone: off by default, chats read as before', !PL.view().enabled && JSON.parse(PL.get('chats'))[0].title === 'phone chat');
check('phone: no switching on without a passcode', /passcode first/.test(await PL.change({ enabled: true })));
check('phone: a short passcode is refused', /at least 4/.test(await PL.change({ newPasscode: 'ab' })));
check('phone: passcode, switch on, lock chats', !(await PL.change({ newPasscode: 'pie-time' })) && !(await PL.change({ enabled: true, idleMinutes: 5 })) && !(await PL.change({ encrypt: true })) && PL.view().encrypt);
check('phone: no copy of the passcode is kept', ![...mem.values()].some((v) => v.includes('pie-time')));
check('phone: chats and memory are scrambled in storage', !localStorage.getItem('bob.chats').includes('secret pie') && !localStorage.getItem('bob.memory').includes('likes pie') && JSON.parse(localStorage.getItem('bob.chats')).bobSealed === 1);
PL.set('chats', JSON.stringify([{ id: 'b', title: 'newer', msgs: [] }])); await PL.flush();
check('phone: new chats are written scrambled', !localStorage.getItem('bob.chats').includes('newer') && JSON.parse(PL.get('chats'))[0].title === 'newer');
PL._reset();
check('phone: after closing, a locked value is never handed over', PL.get('chats') === null && PL.get('memory') === null);
check('phone: a wrong passcode does not open it', !(await PL.open('cake')) && PL.get('chats') === null);
check('phone: the right one does', (await PL.open('pie-time')) && JSON.parse(PL.get('chats'))[0].title === 'newer' && JSON.parse(PL.get('memory')) === '- likes pie');
check('phone: changing the passcode needs the old one, then the new one opens the same chats', /you have now/.test(await PL.change({ newPasscode: 'tart', current: 'x' })) && !(await PL.change({ newPasscode: 'tart', current: 'pie-time' })) && (PL._reset(), await PL.open('tart')) && JSON.parse(PL.get('chats'))[0].title === 'newer');
check("phone: the lock can't go off while chats are locked", /Turn off Lock my chats/.test(await PL.change({ enabled: false })));
check('phone: turning it off puts them back to plain', !(await PL.change({ encrypt: false })) && localStorage.getItem('bob.chats').includes('newer') && !(await PL.change({ enabled: false })) && !PL.view().enabled);
check('phone: the same warning', /gone for good/.test(PL.LOST));
const phoneHtml = fs.readFileSync(path.join(www, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
check('phone: lock.js loads before phone.js', phoneHtml.indexOf('lock.js') > 0 && phoneHtml.indexOf('lock.js') < phoneHtml.indexOf('phone.js'));

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
