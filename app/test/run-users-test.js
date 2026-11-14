// 👥 Users: a passcode is optional for each person, each person has their own email account, Switch user in the
// menu, the owner's schedules wait while someone else is in, and nothing over the network changes 🎮 Gaming.
// Nothing here reads the real computer or goes online: a test key keeper, temp folders, a fake mail server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Profiles, profilesOn, profileDir, MAIN, GUEST, userFiles } from '../src/profiles.js';
import { wrapKey, lockPage } from '../src/lock.js';
import { setKey, hasKey, vaultOn, writeText, readText, isSealed } from '../src/vault.js';
import { openBox, useBox, memoryKeeper, useKeysFile, savedKey, saveKey, keyValue, keyNames, userKeysOn } from '../src/secret-box.js';
import { keyEnv } from '../src/cloud.js';
import { makeBackup } from '../src/backup.js';
import { usersPart, bobMenuHtml } from '../public/bob-menu.js';
import { userAccount, userPassword, saveUserAccount, userEmailFile, userKeyName } from '../src/user-email.js';
import { emailSettings, emailPassword, listMail } from '../src/email-read.js';
import { accountFor, accountView } from '../src/email-account.js';
import { startTicker } from '../src/schedules.js';
import { usersHtml } from '../public/users-switch.js';
import { peopleHtml } from '../public/everyday.js';
import { HELP } from '../public/help-content.js';
import { EventEmitter } from 'node:events';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (p) => fs.readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-users-'));
const fresh = () => {
  const d = fs.mkdtempSync(path.join(tmp, 'inn-')); const dataDir = path.join(d, 'bob'); fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
  const cfg = { innDir: d, dataDir, configFile: path.join(d, 'config.json'), memoryFile: path.join(d, 'bob-memory.md'), moreTools: { emailHost: 'imap.owner.test', emailPort: 993, emailUser: 'owner@example.test', emailFolder: 'INBOX' } };
  fs.writeFileSync(cfg.configFile, '{}');
  useBox(openBox({ dataDir, keepers: [memoryKeeper('test')] })); useKeysFile(path.join(dataDir, 'keys.json'));
  return cfg;
};
const brainOf = (cfg) => ({ sessionDir: path.join(cfg.dataDir, 'sessions'), sessions: new Map([['x', []]]) });

// ---- no passcode needed, for anyone ----
{
  const cfg = fresh(); cfg.profilesOn = true;
  const p = new Profiles(cfg, { brain: brainOf(cfg) });
  check('Users works with no lock at all', profilesOn(cfg) && !cfg.lock);
  const v = p.add('Mia', '').view;
  const mia = v.list[0];
  check('a person can be added without a passcode', v.list.length === 1 && mia.passcode === false && !JSON.parse(fs.readFileSync(cfg.configFile, 'utf8')).profiles.list[0].wrapped);
  check('a short passcode is still refused', Boolean(p.add('Kim', 'ab').error));
  { // Nov 14: rename (the Welcome's Users page and Settings), owner only, names stay unique
    const jo = p.add('Jo', '').view.list.find((x) => x.name === 'Jo').id;
    const r = p.rename(jo, '  Joanne ');
    check('rename: a person gets a new name, the same id', !r.error && r.view.list.find((x) => x.id === jo)?.name === 'Joanne');
    check('rename: no empty names and no two people with one name', Boolean(p.rename(jo, '  ').error) && Boolean(p.rename(jo, 'mia').error) && Boolean(p.rename('nobody', 'X').error));
    p.remove(jo);
    check('rename: the people list has Rename and Remove for the owner, neither for a user who is in', /data-personren="a1" data-name="Ann">Rename<\/button> <button type="button" class="mini" data-persondel="a1">Remove/.test(peopleHtml({ list: [{ id: 'a1', name: 'Ann' }], current: 'main' })) && !/data-personren|data-persondel/.test(peopleHtml({ list: [{ id: 'a1', name: 'Ann' }], current: 'a1' })));
    { // Nov 14: a person's own passcode is offered once, after their own first time in; "No passcode" is a saved answer
      const { shouldOfferOwnCode } = await import('../public/everyday.js');
      const ann = p.add('Ann', '').view.list.find((x) => x.name === 'Ann').id;
      check('own passcode: never offered to the owner', !shouldOfferOwnCode(p.view()) && Boolean(p.codeAsked().error));
      p.open(ann, '');
      check('own passcode: offered on their own first time in', shouldOfferOwnCode(p.view()));
      check('own passcode: either answer is remembered, so it never comes back', !p.codeAsked().error && !shouldOfferOwnCode(p.view()) && p.view().currentCodeAsked === true);
      check('own passcode: not offered to someone who already has one, or to Guest, or with Users off', !shouldOfferOwnCode({ on: true, current: 'x', currentPasscode: true }) && !shouldOfferOwnCode({ on: true, current: 'guest', guest: true }) && !shouldOfferOwnCode({ on: false, current: 'x' }));
      p.useMain();
      p.remove(ann);
      const appSrc = read('public/app.js');
      check('own passcode: the chat offers Set a passcode or No passcode, and both save the answer', appSrc.includes('if (shouldOfferOwnCode(st.profiles)) offerOwnCode(st.profiles);') && /data-c="set">Set a passcode<\/button><button type="button" data-c="no">No passcode<\/button>/.test(appSrc) && /el\.remove\(\);\n    await post\('\/api\/everyday\/profiles', \{ codeAsked: true \}\)/.test(appSrc));
      check('own passcode: the route takes it', read('src/everyday-routes.js').includes('b.codeAsked === true ? profiles.codeAsked()'));
    }
    check('rename: the route takes it', read('src/everyday-routes.js').includes("typeof b.rename === 'string' ? profiles.rename(b.rename, b.name)"));
  }
  check('the lock screen lets a person without a passcode in with the box empty', !lockPage({ people: p.people() }).includes(' required') && lockPage({ people: p.people() }).includes('(no passcode)') && lockPage({ people: [{ id: 'a', name: 'A', passcode: true }] }).includes(' required'));
  writeText(cfg, cfg.memoryFile, 'The owner likes tea.');
  check('they get in with no passcode', p.open(mia.id, '').ok && p.current() === mia.id);
  check('their things are kept plain and apart', !vaultOn(cfg) && !hasKey() && cfg.memoryFile === path.join(profileDir(cfg, mia.id), 'bob-memory.md'));
  writeText(cfg, cfg.memoryFile, 'Mia likes cocoa.');
  check('their memory is their own file', !isSealed(fs.readFileSync(cfg.memoryFile)) && readText(cfg.memoryFile) === 'Mia likes cocoa.');
  p.useMain();
  check('back to the owner without a passcode when the owner has none', p.current() === MAIN && readText(cfg.memoryFile) === 'The owner likes tea.');

  // ---- a passcode set and taken off by the person ----
  p.open(mia.id, '');
  fs.writeFileSync(path.join(profileDir(cfg, mia.id), 'sessions', 'main.json'), JSON.stringify([{ role: 'user', content: 'hi' }]));
  check('the owner can\'t set a user\'s passcode for them', Boolean(new Profiles({ ...cfg, profileNow: undefined }).setPasscode('mia-code').error));
  const set = p.setPasscode('mia-code');
  check('a user sets their own passcode', !set.error && set.view.currentPasscode === true && vaultOn(cfg) && hasKey(), JSON.stringify(set));
  check('every file of theirs is locked then', userFiles(profileDir(cfg, mia.id)).length >= 2 && userFiles(profileDir(cfg, mia.id)).every((f) => isSealed(fs.readFileSync(f))));
  check('and still reads back', readText(cfg.memoryFile) === 'Mia likes cocoa.');
  check('no passcode is kept, only a locked key', !fs.readFileSync(cfg.configFile, 'utf8').includes('mia-code'));
  p.useMain(); setKey(null);
  check('with a passcode, the right one is needed now', Boolean(p.open(mia.id, '').error) && Boolean(p.open(mia.id, 'nope').error) && p.open(mia.id, 'mia-code').ok);
  check('taking it off needs that passcode', Boolean(p.clearPasscode('wrong').error) && vaultOn(cfg));
  const off = p.clearPasscode('mia-code');
  check('taking it off opens every file', !off.error && off.view.currentPasscode === false && !vaultOn(cfg) && !hasKey() && userFiles(profileDir(cfg, mia.id)).every((f) => !isSealed(fs.readFileSync(f))));
  check('and they still read', readText(cfg.memoryFile) === 'Mia likes cocoa.');
  p.useMain();
}

// ---- the owner's lock still guards the owner ----
{
  const cfg = fresh(); cfg.profilesOn = true;
  const ownerKey = crypto.randomBytes(32);
  cfg.lock = { enabled: true, encrypt: true, ...wrapKey('owner-code', ownerKey) };
  fs.writeFileSync(cfg.configFile, JSON.stringify({ lock: cfg.lock }));
  const p = new Profiles(cfg, { brain: brainOf(cfg) });
  const id = p.add('Sam', '').view.list[0].id;
  setKey(ownerKey); writeText(cfg, cfg.memoryFile, 'Owner secret.');
  check('the owner\'s memory is locked', isSealed(fs.readFileSync(cfg.memoryFile)));
  p.open(id, '');
  check('a person without a passcode takes no key in: the owner\'s things stay locked', !hasKey() && !vaultOn(cfg));
  let ownerRead = ''; try { ownerRead = readText(path.join(cfg.innDir, 'bob-memory.md')); } catch { ownerRead = 'refused'; }
  check('so the owner\'s memory can\'t be read while they\'re in', ownerRead === 'refused');
  check('a person can\'t pick the owner\'s passcode', Boolean(p.setPasscode('owner-code').error));
  p.useMain();
  check('back to the owner with a lock keeps no one\'s key (lock.js sets the owner\'s)', !hasKey());
  setKey(null);
}

// ---- each user's own email account ----
{
  const cfg = fresh(); cfg.profilesOn = true;
  saveKey(cfg, 'BOB_EMAIL_PASSWORD', 'owner-app-pass');
  const p = new Profiles(cfg, { brain: brainOf(cfg) });
  const id = p.add('Mia', '').view.list[0].id;
  check('the owner reads the owner\'s account', emailSettings(cfg).user === 'owner@example.test' && emailPassword(cfg) === 'owner-app-pass' && userAccount(cfg) === null);
  p.open(id, '');
  check('a user starts with no account, not the owner\'s', emailSettings(cfg).user === '' && emailPassword(cfg) === '' && accountView(cfg).forUser === 'Mia');
  saveUserAccount(cfg, { host: 'imap.mia.test', user: 'mia@example.test', folder: 'INBOX' }, { password: 'mia-app-pass' });
  check('a user saves their own account', emailSettings(cfg).host === 'imap.mia.test' && emailSettings(cfg).user === 'mia@example.test' && emailPassword(cfg) === 'mia-app-pass');
  check('without a passcode, their app password is in the locked store, not their file', !fs.readFileSync(userEmailFile(cfg), 'utf8').includes('mia-app-pass') && savedKey(userKeyName(id)) === 'mia-app-pass');
  check('the owner\'s account is untouched, and its password unseen', cfg.moreTools.emailUser === 'owner@example.test' && savedKey('BOB_EMAIL_PASSWORD') === '');
  check('a passcode reset still goes to the owner', accountFor(cfg, { owner: true }).user === 'owner@example.test' && accountFor(cfg).user === 'mia@example.test');
  let seen = null;
  const fake = () => { const s = new EventEmitter(); s.write = (l) => { const [tag, cmd, ...rest] = String(l).trim().split(' '); if (cmd === 'LOGIN') seen = rest.join(' '); setImmediate(() => { if (cmd === 'UID') s.emit('data', Buffer.from('* SEARCH\r\n')); s.emit('data', Buffer.from(`${tag} OK done\r\n`)); }); }; s.end = () => {}; s.destroy = () => {}; setImmediate(() => s.emit('data', Buffer.from('* OK hi\r\n'))); return Promise.resolve(s); };
  await listMail(cfg, { days: 1 }, { connect: fake }).catch((e) => { seen = 'error: ' + e.message; });
  check('reading mail logs in as the user, with their password', seen === '"mia@example.test" "mia-app-pass"', String(seen));
  p.setPasscode('mia-code');
  check('with a passcode, the app password moves into their locked file', !savedKey(userKeyName(id)) && isSealed(fs.readFileSync(userEmailFile(cfg))) && userPassword(cfg) === 'mia-app-pass');
  p.clearPasscode('mia-code');
  check('taking it off moves it back to the store', savedKey(userKeyName(id)) === 'mia-app-pass' && !fs.readFileSync(userEmailFile(cfg), 'utf8').includes('mia-app-pass') && userPassword(cfg) === 'mia-app-pass');
  p.useMain();
  check('removing the user forgets their app password', !p.remove(id).error && !savedKey(userKeyName(id)) && savedKey('BOB_EMAIL_PASSWORD') === 'owner-app-pass');
}


// ---- each user's own API keys, never shared ----
{
  const cfg = fresh(); cfg.profilesOn = true;
  saveKey(cfg, 'ANTHROPIC_API_KEY', 'owner-key'); saveKey(cfg, 'BOB_DISCORD_TOKEN', 'owner-bot');
  const p = new Profiles(cfg, { brain: brainOf(cfg) });
  const mia = p.add('Mia', '').view.list[0].id;
  const jo = p.add('Jo', 'jo-code').view.list.find((x) => x.name === 'Jo').id;
  p.open(mia, '');
  check('a user sees none of the owner\'s keys', userKeysOn() && savedKey('ANTHROPIC_API_KEY') === '' && keyNames().length === 0);
  check('nor the computer\'s environment', keyValue('ANTHROPIC_API_KEY', { ANTHROPIC_API_KEY: 'env-owner' }) === '');
  saveKey(cfg, 'ANTHROPIC_API_KEY', 'mia-key');
  check('a user saves their own key, in their own folder', savedKey('ANTHROPIC_API_KEY') === 'mia-key' && fs.existsSync(path.join(profileDir(cfg, mia), 'keys.json')) && !fs.readFileSync(path.join(profileDir(cfg, mia), 'keys.json'), 'utf8').includes('mia-key'));
  check('cloud helpers get only that user\'s key', keyEnv().ANTHROPIC_API_KEY === 'mia-key');
  check('the bots stay the owner\'s and can\'t be changed by a user', savedKey('BOB_DISCORD_TOKEN') === 'owner-bot' && (() => { try { saveKey(cfg, 'BOB_DISCORD_TOKEN', 'x'); return false; } catch { return true; } })());
  let refused = false; try { makeBackup(cfg, { folder: tmp }); } catch { refused = true; }
  check('a user can\'t make a backup (it would hold keys)', refused);
  p.useMain();
  check('back to the owner: the owner\'s key, untouched', !userKeysOn() && savedKey('ANTHROPIC_API_KEY') === 'owner-key');
  p.open(jo, 'jo-code');
  check('another user doesn\'t see Mia\'s key', savedKey('ANTHROPIC_API_KEY') === '');
  saveKey(cfg, 'OPENAI_API_KEY', 'jo-key');
  check('with a passcode, their key file is locked with their key', isSealed(fs.readFileSync(path.join(profileDir(cfg, jo), 'keys.json'))) && savedKey('OPENAI_API_KEY') === 'jo-key');
  p.useMain(); setKey(null);
  const server = read('src/server.js');
  check('each user has their own coding agents and sign-in folders', server.includes("Object.defineProperty(brain, 'codingAgents', { get: () => agentsOf(whoNow())") && server.includes("path.join(cfg.innDir, 'profiles', who)"));
  check('only the person who\'s in hears about agent runs', server.includes('broadcast: (m) => { if (whoNow() === who) broadcast(m); }'));
  check('an agent\'s ask or hook reaches its own user', server.includes('agentsAll().find((a) => a.tokens.has('));
}

// ---- the cube's menu ----
{
  const u = { on: true, ownerName: 'Pat', current: 'main', list: [{ id: 'aaaaaaaaaaaa', name: 'Mia', passcode: false }, { id: 'bbbbbbbbbbbb', name: 'Jo', passcode: true }] };
  const h = usersPart(u);
  check('the cube\'s menu has Switch user (saying who\'s signed in) and Sign out, side by side', h.includes('bob-menu-split') && h.includes('data-bobmenu="users"') && h.includes('Switch user') && h.includes('Pat') && h.includes('data-bobmenu="signout"') && !h.includes('Mia'));
  const m = bobMenuHtml({ loaded: [] }, { users: u, tools: [{ id: 'settingsBtn', icon: '⚙', label: 'Settings' }] });
  check('it sits right under Get models, above Settings and Downloads', m.indexOf('Get models') < m.indexOf('Switch user') && m.indexOf('Switch user') < m.indexOf('bob-menu-tools'));
  check('with Users off the menu is as before', usersPart({ on: false }) === '' && !bobMenuHtml({ loaded: [] }).includes('data-bobmenu="users"') && bobMenuHtml({ loaded: [] }, { users: u }).includes('data-bobmenu="users"'));
  check('in Lamplight the side-menu button hides (the cube has it)', read('public/looks.css').includes('#shelfBtn, #usersBtn)'));
  check('the app wires the cube\'s line to the Switch user page', read('public/app.js').includes('users: () => usersSwitch.open()'));
}


// ---- Sign out: into Guest, empty, nothing kept ----
{
  const cfg = fresh(); cfg.profilesOn = true;
  saveKey(cfg, 'ANTHROPIC_API_KEY', 'owner-key');
  const p = new Profiles(cfg, { brain: brainOf(cfg) });
  writeText(cfg, cfg.memoryFile, 'Owner likes tea.');
  check('sign out lands in Guest', p.signOut().ok && p.current() === GUEST && p.view().guest === true && p.view().currentName === 'Guest');
  check('Guest starts empty: no memory, no keys, no key in memory', !fs.existsSync(cfg.memoryFile) && savedKey('ANTHROPIC_API_KEY') === '' && !hasKey());
  writeText(cfg, cfg.memoryFile, 'Guest said hi.');
  saveKey(cfg, 'OPENAI_API_KEY', 'guest-key');
  check('Guest can\'t add people or set a passcode', Boolean(p.add('X', '').error) && Boolean(p.setPasscode('abcd').error));
  check('Guest can\'t rename people', Boolean(p.rename('anyone', 'X').error));
  p.useMain();
  check('signing in wipes Guest', !fs.existsSync(profileDir(cfg, GUEST)) && readText(cfg.memoryFile) === 'Owner likes tea.' && savedKey('ANTHROPIC_API_KEY') === 'owner-key');
  p.signOut();
  check('a new Guest has nothing from the last one', savedKey('OPENAI_API_KEY') === '' && !fs.existsSync(cfg.memoryFile));
  fs.mkdirSync(path.join(profileDir(cfg, GUEST), 'sessions'), { recursive: true }); fs.writeFileSync(path.join(profileDir(cfg, GUEST), 'bob-memory.md'), 'left over');
  p.useMain(); new Profiles({ ...cfg }, {});
  check('a Guest left over when Bob closed is wiped when he starts', !fs.existsSync(profileDir(cfg, GUEST)));
  const server = read('src/server.js');
  check('the switch door signs out into Guest and drops Guest\'s agents', server.includes("who === 'guest' ? profiles.signOut()") && server.includes("agentsBy.delete('guest')"));
  const h = usersHtml({ on: true, current: 'main', list: [] });
  check('Sign out sits beside Switch user in the cube\'s menu, and on the page', h.includes('id="users-out"') && usersPart({ on: true, current: 'main' }).includes('data-bobmenu="signout"') && !usersPart({ on: true, current: 'guest' }).includes('signout') && !usersHtml({ on: true, current: 'guest', list: [] }).includes('id="users-out"'));
  check('the cube\'s menu says when nobody is signed in', usersPart({ on: true, current: 'guest' }).includes('Guest (signed out)'));
}

// ---- schedules wait while someone else is in ----
{
  let held = true, ran = 0;
  const s = { due: () => [{ id: 'a' }], start: () => true, markRan: () => {} };
  const t = startTicker(s, () => { ran++; }, { everyMs: 1e9, hold: () => held });
  await t.tick();
  check('a due schedule waits while another user is in', ran === 0);
  held = false; await t.tick(); await new Promise((r) => setImmediate(r));
  check('and runs once the owner is back', ran === 1);
  t.stop();
  check('the Schedules hand holds while a user is in', read('src/hands-schedules.js').includes('hold: () => Boolean(brain.cfg?.profileNow)'));
}

// ---- the doors ----
{
  const server = read('src/server.js');
  check('nothing over the network changes 🎮 Gaming', /p === '\/api\/gaming-lock'\) \{ if \(!isLocal\) return send\(res, 403/.test(server));
  check('Switch user only from this replicant matrix', /p === '\/api\/users\/switch' && req\.method === 'POST'\) \{\n\s+if \(!isLocal\) return send\(res, 403/.test(server));
  check('back to the owner with a lock goes through the lock screen', server.includes("if (who === 'main' && lockOn(cfg)) { winLock.lockNow();"));
  check('switching shuts every other window out', /who === 'guest' \? profiles\.signOut\(\) : profiles\.open\(who[\s\S]{0,300}c\.end\(\)/.test(server));
  check('a phone can\'t see a user\'s email account while they\'re in', /PROFILE_PRIVATE = \[[^\]]*'\/api\/email-account'/.test(server));
  check('reset codes always use the owner\'s account', server.includes("canSend(cfg, { owner: true })") && server.includes("{ owner: true }),"));
  check('switching never loads a brain or touches Gaming', !/setSession|setGamingLock|unloadAll/.test(server.slice(server.indexOf("'/api/users/switch'"), server.indexOf("'/api/lock/now'"))));
  check('More tools can\'t change the owner\'s email from inside a user', read('src/more-tools-routes.js').includes("b.email && typeof b.email === 'object' && cfg.profileNow"));
}

// ---- the window ----
{
  const v = { on: true, lockOn: false, current: 'main', list: [{ id: 'aaaaaaaaaaaa', name: 'Mia', passcode: false }, { id: 'bbbbbbbbbbbb', name: 'Sam <b>', passcode: true }] };
  const h = usersHtml(v);
  check('Switch user lists the owner and everyone, with who has a passcode', h.includes('Owner') && h.includes('Mia') && h.includes('🔒 Passcode') && h.includes('No passcode') && h.includes('Sam &lt;b&gt;'));
  const idx = read('public/index.html');
  check('the classic menu has Switch user, hidden until Users is on', /<button id="usersBtn"[^>]* hidden>/.test(idx) && idx.includes('<span class="lbl">Switch user</span>') && idx.includes('<dialog id="usersDlg"'));
  check('Settings has Your passcode for the user who\'s in', peopleHtml({ current: 'x', currentName: 'Mia', currentPasscode: false, list: [] }).includes('Set it') && peopleHtml({ current: 'x', currentPasscode: true, list: [] }).includes('Take it off'));
  const ids = new Map(HELP.map((e) => [e.id, e]));
  check('Help explains users, the optional passcode and email', /passcode is up to each person/.test(ids.get('profiles')?.html || '') && /Email account/.test(ids.get('profiles')?.html || '') && /Android/.test(ids.get('profiles')?.html || ''));
  check('the FAQ answers each person\'s own email', ids.get('faq-users-email')?.group === 'FAQ');
  const gl = ids.get('glossary')?.html || '';
  check('the glossary has Users and Switch user', gl.includes('<dt>Users</dt>') && gl.includes('<dt>Switch user</dt>'));
}

setKey(null);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
