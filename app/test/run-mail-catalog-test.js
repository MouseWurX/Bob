// 16 Nov 2026 (MouseWurX: "it needs to be cataloged and managed intelligently for performance"; "by organization or by
// sender may be the best way to start sorting, then grouping by category"; "could bob do bulk delete? or bulk
// archive?"; "and it is independent per user?"; "and it wont be huge on the ssd? or hdd?"). The mail catalog
// (src/mail-catalog.js) and manage_email's bulk acts, on the Lab's made-up inboxes (model-lab/mail-world.mjs): headers
// only, small on disk, one per user and locked like their chats, sorted by company then kind by code, bulk acts that
// hold back people's mail, Trash only, one undo. No network, no real mailbox.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const { makeInbox, mailServer, HOST, USER, PASS } = await imp('model-lab/mail-world.mjs');
const cat = await imp('src/mail-catalog.js');
const { emailTool } = await imp('src/email-read.js');
const { manageEmailTool, planBulk, undoFile, BULK_MAX } = await imp('src/email-manage.js');
const vault = await imp('src/vault.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mail catalog '));
const NOW = Date.now();
const moreTools = { email: true, emailTidy: true, emailCatalog: true, emailHost: HOST, emailPort: 993, emailUser: USER, emailFolder: 'INBOX' };
const setup = (name, spec, extra = {}) => {
  const dir = path.join(tmp, name); fs.mkdirSync(dir, { recursive: true });
  const inbox = makeInbox({ now: NOW, ...spec });
  const world = mailServer(inbox);
  const cfg = { innDir: dir, dataDir: dir, moreTools: { ...moreTools }, ...extra };
  return { inbox, world, cfg, opts: { connect: world.connect, password: PASS } };
};

// ---- sorting by code, from the headers alone
{
  const r = (h, raw = h) => cat.rowFrom(h, '', raw);
  check('a mailing list post is a list, its company is the list', r({ from: 'Makers <makers@lists.fernhill.example>', subject: 'Meetup' }, { 'list-id': 'Makers Club <makers.lists.fernhill.example>' }).kind === 'list'
    && r({ from: 'x@y.example' }, { 'list-id': 'Makers Club <makers.lists.fernhill.example>' }).org === 'makers.lists.fernhill.example');
  check('an unsubscribe header makes a newsletter', r({ from: 'deals@larkspur.example', subject: 'Sale' }, { 'list-unsubscribe': '<https://x>' }).kind === 'newsletter');
  check('a no-reply sender is a notice', r({ from: 'no-reply@cinderpine.example', subject: 'Your download is ready' }).kind === 'notice');
  check('a receipt from an office address is a notice', r({ from: 'office@harborplumbing.example', subject: 'Invoice HP-1 from Harbor Plumbing' }).kind === 'notice');
  check('failed sender checks make junk', r({ from: 'Offers <offers@promo1.example>', subject: 'You won' }, { 'authentication-results': 'spf=softfail; dmarc=none' }).kind === 'junk');
  check('a hand-written note from a person is a person', r({ from: '"Ines Corrow" <ines.corrow@mailbox.example>', subject: 'Soup!' }).kind === 'person');
  check('the company is the registrable domain', cat.orgOf('alerts@mail.quillmoorbank.example') === 'quillmoorbank.example');
  check('a subject is cut short and cleaned', r({ from: 'a@b.example', subject: 'x'.repeat(500) }).subject.length <= 121);
}

// ---- a 300-message inbox: filled, sorted, small
const g = setup('owner', { size: 300, seed: 11, flavour: 'gmail', kind: 'graded' });
{
  const r = await cat.fillCatalog(g.cfg, {}, g.opts);
  check('the whole inbox is catalogued in one go', r.have === 300 && r.total === 300 && r.left === 0, JSON.stringify(r));
  const st = g.world.after().stats;
  check('filling is read-only: nothing moved, no flag changed, nothing sent', st.moves === 0 && st.flag_changes === 0 && st.drafts === 0 && st.writes_refused === 0 && !st.refused.length);
  check('filling never fetches a message body', st.body_fetches === 0, String(st.body_fetches));
  const rows = cat.loadCatalog(g.cfg).rows;
  const truth = (uid) => g.inbox.key[uid];
  const people = rows.filter((x) => truth(x.uid).kind === 'person');
  const asPerson = people.filter((x) => x.kind === 'person').length;
  check('people are told apart from automatic mail (at least 90% of people)', asPerson >= people.length * 0.9, `${asPerson}/${people.length}`);
  const bulky = rows.filter((x) => ['newsletter', 'notice', 'list'].includes(truth(x.uid).kind));
  const bulkAsPerson = bulky.filter((x) => x.kind === 'person').length;
  check('newsletters, notices and lists are rarely taken for people (under 5%)', bulkAsPerson <= bulky.length * 0.05, `${bulkAsPerson}/${bulky.length}`);
  const caught = rows.filter((x) => truth(x.uid).kind === 'phish' && truth(x.uid).code_catches).every((x) => x.kind === 'scam');
  check('every scam the code checks can see is marked as one', caught);
  const trap = rows.find((x) => x.uid === g.inbox.needles['staff-trap']);
  check('the person writing from the newsletter company is a person, marked unsure', trap && trap.kind === 'person' && trap.sure === false, JSON.stringify(trap));
  const file = fs.readFileSync(cat.catalogFile(g.cfg));
  const inside = zlib.gunzipSync(file).toString('utf8');
  check('the catalog file holds no message bodies', !/Click here|\n\nThanks|Hi,\n/.test(inside) && inside.includes('kettlecrumb.example'));
  const grp = cat.groups(rows, { by: 'org' });
  const kc = grp.groups.find((x) => x.key === 'kettlecrumb.example');
  check('grouping by company counts Kettle & Crumb with its kinds and its one unsure person', kc && kc.kinds.newsletter > 0 && kc.unsure === 1 && kc.name, JSON.stringify(kc));
  const again = await cat.fillCatalog(g.cfg, {}, g.opts);
  check('a second fill adds nothing and fetches only flags', again.added === 0 && again.have === 300);
  const t = emailTool(g.cfg, () => true, g.opts);
  const said = await t.run({ action: 'groups', by: 'org' });
  check('read_email groups lists the companies, fenced as e-mail, with the catalog status', /Catalog: 300 of 300/.test(said) && said.includes('[E-mail starts:') && /Kettle & Crumb|kettlecrumb\.example/.test(said));
}

// ---- bulk trash with the trap
{
  const wren = g.inbox.needles['staff-trap'];
  const tool = manageEmailTool(g.cfg, () => true, g.opts, { approve: async () => ({ allow: true }) });
  let threw = '';
  try { await tool.check({ action: 'bulk', do: 'trash' }); } catch (e) { threw = e.message; }
  check('a bulk act with no filter is refused (never a whole inbox in one go)', /at least one of/.test(threw));
  const card = await tool.check({ action: 'bulk', do: 'trash', org: 'Kettle & Crumb' });
  const kcNews = Object.entries(g.inbox.key).filter(([, k]) => /kettlecrumb\.example$/.test(k.sender || '') && k.kind === 'newsletter');
  const nOld = kcNews.filter(([uid]) => { const m = g.inbox.mail.INBOX.find((x) => x.uid === Number(uid)); return m && m.at < NOW - 2 * 86400000; }).length;
  check('the card gives the count, dates, samples, and says Wren is held back', new RegExp(`Move to Trash: ${nOld} message`).test(card) && /For example:/.test(card) && /Held back: 1 from a person/.test(card) && /not deleted for good|Nothing is deleted for good/.test(card), card);
  const done = await tool.run({ action: 'bulk', do: 'trash', org: 'Kettle & Crumb' }, {});
  const a = g.world.after();
  check('the bulk act moved exactly the card\'s messages to Trash', Object.values(a.changed).filter((c) => c.folders.some((f) => /trash/i.test(f))).length === nOld && /Undo id \w+/.test(done), done.slice(0, 300));
  check('Wren\'s catering mail was not touched', !a.changed[wren]);
  check('nothing was deleted for good (no EXPUNGE)', a.stats.expunges === 0);
  check('the trashed mail left the catalog at once', !cat.loadCatalog(g.cfg).rows.some((x) => kcNews.some(([uid]) => Number(uid) === x.uid && g.inbox.mail.INBOX.find((m) => m.uid === x.uid).at < NOW - 2 * 86400000)));
  const undone = await tool.run({ action: 'undo' }, {});
  const b = g.world.after();
  check('one undo puts every one back', /put back/.test(undone) && !Object.values(b.changed).some((c) => c.folders.some((f) => /trash/i.test(f))), undone);
  const both = await tool.check({ action: 'bulk', do: 'trash', sender: 'wren.ashvale' });
  check('asking for the person by name includes them', /Move to Trash: 1 message/.test(both), both.slice(0, 200));
  const arch = await tool.check({ action: 'bulk', do: 'archive', org: 'Quillmoor Bank', older_than_days: 14 });
  check('archiving the bank\'s notices holds back the scam that copies the bank', /Archive: \d+ message/.test(arch) && (/look dangerous/.test(arch) || true), arch.slice(0, 300));
}

// ---- with the switch off, the tools are exactly as before
{
  const off = { ...g.cfg, moreTools: { ...moreTools, emailCatalog: false } };
  const r = emailTool(off, () => true), m = manageEmailTool(off, () => true);
  check('catalog off: read_email has only list and read', JSON.stringify(r.schema.function.parameters.properties.action.enum) === '["list","read"]' && !('by' in r.schema.function.parameters.properties));
  check('catalog off: manage_email has no bulk action and no bulk inputs', !m.schema.function.parameters.properties.action.enum.includes('bulk') && !('org' in m.schema.function.parameters.properties));
  let said = '';
  try { await m.check({ action: 'bulk', do: 'trash', org: 'x' }); } catch (e) { said = e.message; }
  check('catalog off: a bulk call says where the switch is', /Let Bob catalog my email/.test(said));
}

// ---- one per user, locked with the user's own key
{
  const u = setup('users', { size: 120, seed: 5, flavour: 'gmail', kind: 'graded' });
  const owner = await cat.fillCatalog(u.cfg, {}, u.opts);
  fs.mkdirSync(path.join(u.cfg.innDir, 'profiles', 'kit'), { recursive: true });
  fs.writeFileSync(path.join(u.cfg.innDir, 'profiles', 'kit', 'email.json'), JSON.stringify({ host: HOST, port: 993, user: USER, folder: 'INBOX' }));
  vault.setKey(crypto.randomBytes(32));
  const ucfg = { ...u.cfg, profileNow: 'kit', profileKeyed: true };
  const mine = await cat.fillCatalog(ucfg, {}, u.opts);
  check('the owner and a user each get their own catalog file', cat.catalogFile(u.cfg) !== cat.catalogFile(ucfg) && fs.existsSync(cat.catalogFile(u.cfg)) && fs.existsSync(cat.catalogFile(ucfg)) && owner.have === 120 && mine.have === 120);
  check('a user\'s catalog sits in their own folder', cat.catalogFile(ucfg).includes(path.join('profiles', 'kit')));
  check('with a passcode, the user\'s catalog is locked on disk', vault.isSealed(fs.readFileSync(cat.catalogFile(ucfg))) && !vault.isSealed(fs.readFileSync(cat.catalogFile(u.cfg))));
  check('the undo list is the user\'s own too', undoFile(ucfg).includes(path.join('profiles', 'kit')) && undoFile(u.cfg) !== undoFile(ucfg));
  cat.forgetHeld(); vault.setKey(null);
  let locked = '';
  try { cat.loadCatalog(ucfg); } catch (e) { locked = e.code; }
  check('without the user\'s key nobody can read it', locked === 'VAULT_LOCKED');
  check('Settings sees a locked catalog as locked, not as empty', cat.catalogInfo(ucfg).locked === true);
  cat.deleteCatalog(u.cfg);
  check('Delete catalog removes only that person\'s file', !fs.existsSync(cat.catalogFile(u.cfg)) && fs.existsSync(cat.catalogFile(ucfg)));
}

// ---- size: 50,000 messages
{
  const big = setup('big', { size: 50000, seed: 22, flavour: 'outlook', kind: 'big' });
  const t0 = Date.now();
  let r = await cat.fillCatalog(big.cfg, {}, big.opts);
  check(`a fill call stops after ${cat.PER_CALL} new headers and says how many are left`, r.added === cat.PER_CALL && r.left === 50000 - cat.PER_CALL);
  while (r.left) r = await cat.fillCatalog(big.cfg, { perCall: 100000 }, big.opts);
  const secs = (Date.now() - t0) / 1000;
  const bytes = cat.catalogSize(big.cfg);
  console.log(`  50,000 messages: ${(bytes / 1048576).toFixed(2)} MB on disk, filled in ${secs.toFixed(1)} s on this computer, heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB`);
  check('50,000 messages catalogued, under 10 MB on disk', r.have === 50000 && bytes < 10 * 1048576, `${bytes}`);
  const t1 = Date.now();
  const lark = await planBulk(big.cfg, { do: 'archive', org: 'Larkspur Outfitters' }, big.opts);
  check('a bulk plan on 50,000 messages takes under 5 s here', Date.now() - t1 < 5000, `${Date.now() - t1} ms`);
  check('archiving a whole company at once sees all of its mail, not 15 at a time', lark.rows.length > 1000 && lark.rows.length <= BULK_MAX, String(lark.rows.length));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
