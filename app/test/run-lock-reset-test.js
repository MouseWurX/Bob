// 🔑 Forgot the passcode? (src/lock-reset.js, lock-reset-routes.js, email-send.js, email-account.js): a spare key
// on another Bob gets everything back, only after "Let it reset" on that Bob and only while this Bob is asking; a
// code by email or Discord opens the lock screen only and sets locked chats aside, still locked; nothing here is
// reachable from the wrong side (Bob-Net vs this replicant matrix). Fakes only: no real mail, Discord or network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Lock, lockOn, OPEN_WHILE_LOCKED, lockPage, unwrapKey } from '../src/lock.js';
import { LockReset, SpareKeeper, makeSpare, openSpare, keyCheck, forgotPage, resetSettings } from '../src/lock-reset.js';
import { lockResetRoute, forgotRoute } from '../src/lock-reset-routes.js';
import { setKey, hasKey, isSealed, readText } from '../src/vault.js';
import { writeChat, readChat, chatFile } from '../src/chats.js';
import { useBox, Box, isLocked } from '../src/secret-box.js';
import { sendMail, smtpFor, message, maskAddress } from '../src/email-send.js';
import { GROUPS, CARDS } from '../public/settings-map.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

useBox(new Box({ key: crypto.randomBytes(32), how: 'test', label: 'test' }));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-reset-'));
const configFile = path.join(root, 'config.json');
fs.writeFileSync(configFile, JSON.stringify({ port: 7777 }, null, 2));
const cfg = { configFile, dataDir: path.join(root, 'inn', 'bob'), innDir: path.join(root, 'inn'), memoryFile: path.join(root, 'inn', 'bob-memory.md') };
fs.mkdirSync(cfg.dataDir, { recursive: true });
let clock = 5_000_000;
const now = () => clock;
const lock = new Lock(cfg, { now });
setKey(null);

// The spare on its own.
const dk = crypto.randomBytes(32), rk = crypto.randomBytes(32);
const blob = makeSpare(dk, rk);
check('a spare opens only with its recovery key', openSpare(blob, rk)?.equals(dk) && openSpare(blob, crypto.randomBytes(32)) === null && openSpare('junk', rk) === null);
check('the spare never holds the chats key in the open', !Buffer.from(blob, 'base64').includes(dk));

// Set up: a passcode, the lock on, chats locked.
lock.change({ newPasscode: 'apple-pie' });
lock.change({ enabled: true });
writeChat(cfg, 'c1', [{ role: 'user', content: 'secret soup' }]);
fs.writeFileSync(cfg.memoryFile, '- likes soup\n');
lock.change({ encrypt: true });
const sent = { email: [], discord: [] };
let emailOk = false, discordOk = false;
const reset = new LockReset(cfg, lock, { now, send: {
  emailReady: () => emailOk, discordReady: () => discordOk,
  email: async (t) => { sent.email.push(t); return { to: 'o•••@example.test' }; },
  discord: async (t) => { sent.discord.push(t); return {}; }
} });
check('off by default: no spare, no codes', !reset.view().spareReady && !reset.view().email && !reset.view().discord && !resetSettings(cfg).email);
check('the lock screen offers nothing when nothing is set up', /No way to reset is set up/.test(forgotPage(reset.screen())));

// Spare key: ready, picked up once, then gone from here.
setKey(null);
check('no spare while Bob holds no key', /passcode first/.test(reset.offerSpare().error || ''));
lock.unlock('apple-pie');
const off = reset.offerSpare();
check('Get a spare key ready works once Bob is open', !off.error && off.view.offerUntil > clock && off.view.spareReady);
const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
check('the recovery key is kept locked (Locked secrets), with no spare and no chats key beside it', isLocked(raw.lock.spare.key) && !JSON.stringify(raw).includes(dk.toString('base64')) && !('blob' in raw.lock.spare));
const got = reset.pickup('My phone');
check('your other Bob picks it up once', got.key && reset.pickup('Someone else').code === 404);
check('who keeps it is remembered', reset.view().keptBy.map((k) => k.name).join() === 'My phone');
clock += 16 * 60000; reset.offerSpare(); clock += 16 * 60000;
check('a spare not picked up in 15 minutes is gone', reset.pickup('Late').code === 404);

// Asking and giving it back.
setKey(null); lock.lockNow();
check('Let it reset does nothing unless this Bob is asking', reset.give(got.key, 'My phone').code === 409);
check('the lock screen offers Ask my other Bob', /Ask my other Bob/.test(forgotPage(reset.screen())) && /My phone/.test(forgotPage(reset.screen())));
check('asking works', !reset.askSpare().error && reset.asking() && /Let it reset/.test(forgotPage(reset.screen())));
check('a wrong spare is refused', reset.give(makeSpare(crypto.randomBytes(32), rk), 'x').code === 400 && !reset.screen().approved);
check('no new passcode before the yes', /hasn't said yes/.test(reset.finishSpare('banana-split', 'banana-split').error || ''));
check('the right spare is a yes', reset.give(got.key, 'My phone').ok && reset.screen().approved && /My phone said yes/.test(forgotPage(reset.screen())));
check('the new passcode is checked twice', /don't match/.test(reset.finishSpare('banana-split', 'banana').error || '') && /at least/.test(reset.finishSpare('ab', 'ab').error || ''));
const done = reset.finishSpare('banana-split', 'banana-split');
check('a new passcode, and the same locked chats open', done.token && hasKey() && readChat(cfg, 'c1')[0].content === 'secret soup' && isSealed(fs.readFileSync(chatFile(cfg, 'c1'))));
setKey(null);
check('the old passcode no longer opens Bob; the new one does', Boolean(lock.unlock('apple-pie').error) && Boolean(lock.unlock('banana-split').token) && readText(cfg.memoryFile).includes('likes soup'));
for (let i = 0; i < 5; i++) reset.give('x', 'y');
check('five tries a minute at Let it reset', reset.give(got.key, 'My phone').code === 429);
clock += 61000;
check('the ask runs out after 15 minutes', (reset.askSpare(), clock += 16 * 60000, !reset.asking()));

// Codes by email or Discord.
check("a code way can't go on before it's set up", /Email account first/.test(reset.setWays({ email: true }).error || '') && /Discord/.test(reset.setWays({ discord: true }).error || ''));
emailOk = true; discordOk = true;
check('codes go on when set up', !reset.setWays({ email: true, discord: true }).error && reset.view().email && reset.view().discord);
setKey(null); lock.lockNow();
const page = forgotPage(reset.screen());
check('the code page says plainly that locked chats stay locked', /Email me a code/.test(page) && /Send a code to my Discord/.test(page) && /can't be opened with a code/.test(page));
check('the Forgot it? page has no scripts and works at phone width', !/<script/i.test(page) && /width=device-width/.test(page) && /min\(360px/.test(page));
const s1 = await reset.sendCode('email');
const code = (sent.email[0] || '').match(/\d{8}/)?.[0];
check('an 8-digit code is emailed, and the screen says where (masked)', s1.ok && code && reset.screen().codeSent && /o•••@example\.test/.test(forgotPage(reset.screen())));
check('the code is never kept as itself', !JSON.stringify(reset.code).includes(code));
check('one code a minute', /Wait a minute/.test((await reset.sendCode('discord')).error || ''));
check('a wrong code does nothing', /isn't right/.test(reset.useCode('00000000', 'cherry-tart', 'cherry-tart').error || '') && lockOn(cfg));
const r2 = reset.useCode(code, 'cherry-tart', 'cherry-tart');
check('the right code makes a new passcode and lets the window in', r2.token && Boolean(lock.unlock('cherry-tart').token));
check('locked chats and memory are set aside, still locked, with their old lock', r2.aside && fs.existsSync(path.join(r2.aside, 'sessions', 'c1.json')) && isSealed(fs.readFileSync(path.join(r2.aside, 'sessions', 'c1.json'))) && fs.existsSync(path.join(r2.aside, 'old-lock.json')) && !fs.existsSync(chatFile(cfg, 'c1')));
const old = JSON.parse(fs.readFileSync(path.join(r2.aside, 'old-lock.json'), 'utf8'));
check('the old passcode still opens the set-aside lock', unwrapKey('banana-split', old)?.length === 32);
check('a code reset stops every spare key (the key changed)', !reset.view().spareReady);
check('a used code is gone', /run out/.test(reset.useCode(code, 'x-x-x-x', 'x-x-x-x').error || ''));
clock += 120000; await reset.sendCode('discord');
const dcode = (sent.discord[0] || '').match(/\d{8}/)?.[0];
for (let i = 0; i < 5; i++) reset.useCode('11111111', 'plum-pudding', 'plum-pudding');
check('five wrong codes and that code is dead', /Too many wrong codes/.test(reset.useCode(dcode, 'plum-pudding', 'plum-pudding').error || ''));
clock += 11 * 60000;

// The spare keys this Bob keeps for others (inn\bob\spare-keys.json, locked).
const calls = [];
const other = { name: 'npc', address: '100.64.0.9:7777' };
const fakeCall = async (bob, p, o = {}) => { calls.push({ bob: bob.address, p, o }); const j = p.endsWith('/pickup') ? { key: 'SPAREBLOB' } : p.endsWith('/asking') ? { asking: true } : { ok: true }; return { ok: true, status: 200, json: async () => j }; };
const keeper = new SpareKeeper(cfg, { call: fakeCall, name: () => 'laptop', now });
check('pick up a spare key from your other Bob', (await keeper.pickup(other)).ok && keeper.view()[0].bob === 'npc');
check('kept locked on disk', !fs.readFileSync(path.join(cfg.dataDir, 'spare-keys.json'), 'utf8').includes('SPAREBLOB'));
check('the view never shows the key', !JSON.stringify(keeper.view()).includes('SPAREBLOB'));
check('it can tell when that Bob is asking', await keeper.asking(keeper.view()[0].id, [other]));
const lr = await keeper.letReset(keeper.view()[0].id, [other]);
check('Let it reset sends the spare back to that Bob only', lr.ok && calls.at(-1).p === '/api/lock/spare/give' && calls.at(-1).o.body.key === 'SPAREBLOB' && calls.at(-1).bob === other.address);
check('a Bob gone from My other Bobs is refused', /isn't in My other Bobs/.test((await keeper.letReset(keeper.view()[0].id, [])).error || ''));
keeper.forget(keeper.view()[0].id);
check('Forget throws it away', keeper.view().length === 0);

// Which side may call what.
const res = () => ({ out: null });
const sendFake = (r, code, b) => { r.out = { code, b }; return r; };
const jsonBody = (b) => async () => b;
const R = async (p, method, isLocal, b = {}) => { const r = res(); await lockResetRoute({ req: { method }, res: r, p, isLocal, body: jsonBody(b), send: sendFake, reset, keeper, bobs: () => [other] }); return r.out; };
check('spare pickup and give come only over Bob-Net, never from this window', (await R('/api/lock/spare/pickup', 'POST', true)).code === 403 && (await R('/api/lock/spare/give', 'POST', true)).code === 403);
check('Settings for reset and kept spares: this replicant matrix only', (await R('/api/lock/reset', 'POST', false, { offer: true })).code === 403 && (await R('/api/spares', 'POST', false, { letReset: 'x' })).code === 403);
check('asking says only yes or no', JSON.stringify((await R('/api/lock/spare/asking', 'GET', false)).b) === '{"asking":false}');
check('the lock screen keeps Forgot it? open, nothing more', OPEN_WHILE_LOCKED('GET', '/unlock/forgot') && OPEN_WHILE_LOCKED('POST', '/unlock/code') && !OPEN_WHILE_LOCKED('POST', '/unlock/a/b') && !OPEN_WHILE_LOCKED('GET', '/unlock/code') && !OPEN_WHILE_LOCKED('GET', '/api/spares') && /Forgot it\?/.test(lockPage({})));
const fr = { out: null };
await forgotRoute({ req: { method: 'POST', headers: { origin: 'http://evil.example' } }, res: fr, p: '/unlock/code', send: sendFake, reset, host: 'localhost:7777', grant: () => {} });
check('the Forgot it? forms refuse other websites', fr.out?.code === 403);

// Email: sending one message to yourself, safely.
check('the sending server is worked out for the big services', smtpFor('imap.gmail.com').host === 'smtp.gmail.com' && smtpFor('outlook.office365.com').port === 587 && smtpFor('imap.example.org').host === 'smtp.example.org' && smtpFor('').host === '');
const m = message({ from: 'a@x.test', to: 'a@x.test', subject: 'Hi\r\nBcc: evil@x.test', text: 'line\n.dot', date: new Date(0) });
check('no header can be slipped in through the subject, and dots are doubled', !/\r\nBcc:/.test(m) && /\r\n\.\.dot/.test(m));
check('the screen only shows a masked address', maskAddress('owner@example.test') === 'o•••@example.test');
function fakeServer(script) {
  const s = new EventEmitter(); s.lines = [];
  s.setEncoding = () => {}; s.end = () => {}; s.destroy = () => {};
  s.write = (t) => { for (const l of String(t).split('\r\n').filter(Boolean)) s.lines.push(l); const reply = script(String(t)); if (reply) setImmediate(() => s.emit('data', reply)); };
  setImmediate(() => { s.emit('secureConnect'); s.emit('data', '220 hello\r\n'); });
  return s;
}
let sock;
const r465 = await sendMail({ host: 'smtp.x.test', port: 465, user: 'me@x.test', password: 'pw', subject: 'Code', text: 'hi' }, { connect: () => (sock = fakeServer((t) => (/^EHLO/.test(t) ? '250-x\r\n250 AUTH PLAIN\r\n' : /^AUTH/.test(t) ? '235 ok\r\n' : /^DATA/.test(t) ? '354 go\r\n' : /^QUIT/.test(t) ? '' : '250 ok\r\n'))) });
check('port 465: signs in and sends to the account itself only', r465.sent && sock.lines.includes('RCPT TO:<me@x.test>') && sock.lines.some((l) => /^AUTH PLAIN /.test(l)) && sock.lines.includes('.'));
let refused = '';
try { await sendMail({ host: 'smtp.x.test', port: 587, user: 'me@x.test', password: 'pw', subject: 's', text: 't' }, { connect: () => { const s = fakeServer((t) => (/^EHLO/.test(t) ? '250 no tls here\r\n' : '250 ok\r\n')); setImmediate(() => s.emit('connect')); return s; } }); } catch (e) { refused = e.message; }
check('port 587: refuses to sign in without switching to TLS first', /TLS/.test(refused));
let bad = '';
try { await sendMail({ host: 'smtp.x.test', user: 'me@x.test', password: 'pw' }, { connect: () => fakeServer((t) => (/^AUTH/.test(t) ? '535 bad\r\n' : /^EHLO/.test(t) ? '250 ok\r\n' : '250 ok\r\n')) }); } catch (e) { bad = e.message; }
check('a wrong app password says so plainly', /said no/.test(bad));
check('no account, no mail', await sendMail({ host: 'smtp.x.test', user: 'nope', password: 'pw' }).then(() => false, (e) => /email address/.test(e.message)));
const acct = read('src/email-account.js');
check('Bob can only email his own account (no "to" from outside)', /to: a\.user/.test(acct) && !/b\.to\b/.test(acct));

// Settings, Help and the phone.
check('📧 Email account sits in Online services (both views)', GROUPS.find(([g]) => g === 'Connections')[1].includes('adv-email') && CARDS.find((c) => c.id === 'online').topics.includes('adv-email'));
const ids = new Set(HELP.map((h) => h.id));
check('Help: Email account page, its question, the reset settings and the glossary', ids.has('settings-email') && ids.has('faq-email-where') && /Spare key on another Bob/.test(HELP.find((h) => h.id === 'settings-lock').html) && /Spare key \(passcode reset\)/.test(HELP.find((h) => h.id === 'glossary').html));
check('Help says plainly what a code can and cannot do', /lock screen only/.test(HELP.find((h) => h.id === 'faq-lock-forgot').html));
const ui = read('public/lock-settings.js');
check('Settings panel: spare key, both code switches and the spares kept here', /data-reset-offer/.test(ui) && /data-reset-way="email"/.test(ui) && /data-reset-way="discord"/.test(ui) && /data-spare-let/.test(ui) && /data-spare-pickup/.test(ui));
const phoneJs = read('android/app/src/main/assets/www/phone.js'), phoneHtml = read('android/app/src/main/assets/www/index.html');
check('Bob for Android keeps spare keys and lets a Bob reset from its own Settings', /id="spare-pickup"/.test(phoneHtml) && /\/api\/lock\/spare\/give/.test(phoneJs) && /\/api\/lock\/spare\/pickup/.test(phoneJs));
check('the same on the iPhone / browser phone screen', read('public/phone/phone.js') === phoneJs);
const more = read('public/more-tools.js');
check('More tools points at the Email account page instead of its own boxes', /Email account/.test(more) && !/data-mt-email=/.test(more));
check('nothing here touches the Gaming session, a brain or the graphics card', !/brain\.|gaming|loadBrain|engine|gpu|currentSession/i.test(read('src/lock-reset.js').replace(/^\s*\/\/.*$/gm, '')));

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
