// 1.5.213 Bob-Net over a plain home network ("Also over the home network"), no Tailscale needed:
// home addresses on this replicant matrix's own network, the door opening without Tailscale, Find knocking on the home
// network, and sealed pairing (the passcodes never cross the wire as plain text). Fake network cards only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pairing, PAIR, scanList, oneTimeKey, sealKey, commitOf, seal, unseal, SCAN_AT_ONCE } from '../src/bob-net-pair.js';
import { cleanAddress, cleanHomeAddress, cleanBobAddress, cleanSharePatch, Lenders, BAD_ADDRESS } from '../src/share-brains.js';
import { cleanPhonePatch } from '../src/phone-access.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-home-'));
const lan = (address) => [{ address, netmask: '255.255.255.0' }];

// ---------- Addresses ----------
const mine = lan('172.16.1.20');
ok(cleanHomeAddress('172.16.1.30', mine) === '172.16.1.30:7777', 'home address: same network, port added');
ok(cleanHomeAddress('http://172.16.1.30:7788/', mine) === '172.16.1.30:7788', 'home address: a link is tidied');
ok(cleanHomeAddress('172.16.2.30', mine) === null, 'home address: another network is refused');
ok(cleanHomeAddress('8.8.8.8', [{ address: '8.8.8.1', netmask: '255.255.255.0' }]) === null, 'home address: a public address is refused');
ok(cleanHomeAddress('172.16.1.20', mine) === null, 'home address: this replicant matrix itself is refused');
ok(cleanHomeAddress('172.16.1.30:99999', mine) === null && cleanHomeAddress('nas.local', mine) === null, 'home address: bad port or a name is refused');
ok(cleanHomeAddress('172.20.0.5', []) === null, 'home address: no home network here, nothing');
const off = { remote: { enabled: true, passcode: 'abcdef12' } }, on = { remote: { enabled: true, passcode: 'abcdef12', homeNet: true } };
ok(cleanBobAddress(off, '172.16.1.30', { home: () => mine }) === null, 'switch off: a home address is not a Bob address');
ok(cleanBobAddress(on, '172.16.1.30', { home: () => mine }) === '172.16.1.30:7777', 'switch on: it is');
ok(cleanBobAddress(off, '100.101.1.2') === '100.101.1.2:7777' && cleanAddress('172.16.1.30') === null, 'Tailscale works as before, and the plain check is still Tailscale only');

// ---------- Adding a Bob by hand ----------
{
  const e = cleanSharePatch({ ...off, share: {} }, { addBob: { address: '172.16.1.30', passcode: 'their-code' } }, { home: () => mine });
  ok(/Also over the home network/.test(e.error || ''), 'add by hand, switch off: says to turn on Also over the home network');
  const r = cleanSharePatch({ ...on, share: {} }, { addBob: { name: 'Go', address: '172.16.1.30', passcode: 'their-code' } }, { home: () => mine });
  ok(r.share?.borrow?.bobs?.[0]?.address === '172.16.1.30:7777', 'add by hand, switch on: saved with its home address');
  ok(/192\.168/.test(BAD_ADDRESS(on)) && /Tailscale/.test(BAD_ADDRESS(off)), 'the refusal names what fits');
  const cfg = { ...on, share: { borrow: { bobs: [{ name: 'Go', address: '172.16.1.30:7777', passcode: 'their-code' }, { name: 'Pi', address: '100.101.1.9:7777', passcode: 'pi-code-1' }] } } };
  ok(new Lenders(cfg, { home: () => mine }).bobs().length === 2, 'My other Bobs keeps a home Bob while the switch is on');
  ok(new Lenders({ ...cfg, remote: off.remote }, { home: () => mine }).bobs().map((b) => b.name).join() === 'Pi', '…and leaves him out with it off (Tailscale only, as before)');
}

// ---------- The door without Tailscale ----------
{
  const cfg = { port: 7777, remote: { passcode: '12345678', hosts: [] } };
  ok(/home network/.test(cleanPhonePatch(cfg, { enabled: true }, { home: mine }).error || ''), 'door, no Tailscale, switch off: says to turn on the home network switch');
  ok(cleanPhonePatch(cfg, { enabled: true, homeNet: true }, { home: mine }).remote?.enabled === true, 'door, no Tailscale, switch on: opens on the home network');
  ok(/cable/.test(cleanPhonePatch(cfg, { enabled: true, homeNet: true }, { home: [] }).error || ''), 'door, no Tailscale and no home network: says so');
  ok(cleanPhonePatch({ port: 7777, remote: {} }, {}).remote.homeNet === false, 'Also over the home network is off to start with');
}

// ---------- Which addresses Find knocks on ----------
{
  const l = scanList({ address: '172.16.1.20', netmask: '255.255.255.0' });
  ok(l.length === 253 && !l.includes('172.16.1.20') && !l.includes('172.16.1.0') && !l.includes('172.16.1.255'), 'scan: its own /24, not itself, not .0 or .255');
  ok(scanList({ address: '172.20.5.9', netmask: '255.255.0.0' }).every((a) => a.startsWith('172.20.5.')), 'scan: a wider network still only scans its own /24');
  ok(scanList({ address: '172.16.1.20', netmask: '255.255.255.128' }).length === 126, 'scan: a smaller network scans only itself');
}

// ---------- The seal ----------
{
  const a = oneTimeKey(), b = oneTimeKey(), m = oneTimeKey();
  const ka = sealKey(a.priv, b.pub, a.pub, b.pub), kb = sealKey(b.priv, a.pub, a.pub, b.pub);
  ok(ka.number === kb.number && /^\d{4}$/.test(ka.number) && ka.key.equals(kb.key), 'seal: both Bobs work out the same key and number on their own');
  ok(unseal(kb.key, seal(ka.key, { passcode: 'x' }))?.passcode === 'x', 'seal: what one seals the other opens');
  ok(unseal(sealKey(m.priv, b.pub, m.pub, b.pub).key, seal(ka.key, { passcode: 'x' })) === null, 'seal: anyone else gets nothing');
  ok(sealKey(a.priv, 'not a key', a.pub, 'x') === null, 'seal: a broken key is refused');
}

// ---------- Two Bobs on a pretend home network (a switch, no Tailscale) ----------
function bob(name, ip, { homeNet = true, door = true } = {}) {
  const file = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, '{}');
  const cfg = { port: 7777, configFile: file, dataDir: path.join(tmp, name), remote: { enabled: door, passcode: `${name}-code-1`, homeNet }, share: {} };
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const events = [];
  const p = new Pairing(cfg, { broadcast: (e) => events.push(e), version: '1.5.213', ownAddresses: () => [], pollMs: 5, peers: async () => null, home: () => lan(ip) });
  return { name, ip, cfg, p, events };
}
const wire = []; // everything that crossed the pretend network, both ways
// Serves the pairing routes the way server.js does, with its door check (fromAllowed: own subnet, switch on).
function net(bobs, { tamper } = {}) {
  return (from) => async (url, opt = {}) => {
    const u = new URL(url);
    const to = bobs.find((x) => x.ip === u.hostname);
    if (!to) throw new Error('no route');
    const reply = (status, j) => { wire.push(JSON.stringify(j)); return { ok: status < 300, status, json: async () => j }; };
    if (opt.body) wire.push(String(opt.body));
    const sameNet = from.ip.split('.').slice(0, 3).join() === to.ip.split('.').slice(0, 3).join();
    if (!to.cfg.remote.enabled || !to.cfg.remote.homeNet || !sameNet) return reply(403, { error: 'bad host' });
    const b = opt.body ? JSON.parse(opt.body) : {};
    if (u.pathname === '/api/pair/hello') return reply(200, to.p.hello());
    if (u.pathname === '/api/pair/ask') { const r = to.p.ask(b, '::ffff:' + from.ip); const j = r.error ? { error: r.error } : { id: r.id, ...(r.pub ? { pub: r.pub } : {}) }; return reply(r.code, tamper ? tamper(j) : j); }
    if (u.pathname === '/api/pair/status') return reply(200, to.p.status(b.id, from.ip, b.pub));
    if (u.pathname === '/api/pair/finish') return reply(200, to.p.finish(b, from.ip));
    return reply(404, {});
  };
}
const wait = async (f, ms = 2000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 5)); return f(); };

{
  const A = bob('desk', '172.16.1.20'), B = bob('handheld', '172.16.1.30');
  const n = net([A, B]); A.p.fetch = n(A); B.p.fetch = n(B);
  const h = await A.p.knock(B.ip);
  ok(h.bob && h.pair === PAIR && h.seal === 1, 'hello over the home network: a Bob that seals');
  const r = await A.p.pairWith(B.ip);
  ok(r.state === 'waiting' && /^\d{4}$/.test(r.code) && !('seal' in r), 'pair over the home network: waiting, with a number, and no key handed to the page');
  const card = B.events.find((e) => e.type === 'pair-ask');
  ok(card && card.number === r.code && card.address === `${A.ip}:7777`, 'the card there shows the same number and the asker\'s home address');
  B.p.answer(card.id, true);
  await wait(() => A.p.outgoing.get(`${B.ip}:7777`)?.state === 'paired');
  ok(A.p.outgoing.get(`${B.ip}:7777`)?.state === 'paired', 'paired over the home network');
  ok(A.cfg.share.borrow.bobs[0]?.address === `${B.ip}:7777` && A.cfg.share.borrow.bobs[0].passcode === 'handheld-code-1', 'the asker has the other Bob at his home address, with his passcode');
  ok(B.cfg.share.borrow.bobs[0]?.address === `${A.ip}:7777` && B.cfg.share.borrow.bobs[0].passcode === 'desk-code-1', '…and the other way round');
  const all = wire.join('\n');
  ok(!all.includes('desk-code-1') && !all.includes('handheld-code-1'), 'neither passcode crossed the home network as plain text');
  ok(A.cfg.share.lend !== true && A.cfg.share.borrow.on !== true, 'pairing switches nothing on');
}

// A Bob in the middle swaps in his own key: the numbers on the two screens don't match.
{
  const A = bob('desk2', '172.16.1.21'), B = bob('go2', '172.16.1.31');
  const evil = oneTimeKey();
  const n = net([A, B], { tamper: (j) => (j.pub ? { ...j, pub: evil.pub } : j) }); A.p.fetch = n(A); B.p.fetch = n(B);
  const r = await A.p.pairWith(B.ip);
  const card = B.events.find((e) => e.type === 'pair-ask');
  ok(!card || card.number !== r.code, 'a key swapped in the middle shows a different number (so you press No)');
}

// A key that doesn't match what was promised: no card, no.
{
  const B = bob('go3', '172.16.1.32');
  const k = oneTimeKey(), other = oneTimeKey();
  const r = B.p.ask({ pair: PAIR, name: 'x', address: '172.16.1.22:7777', code: '1234', commit: commitOf(k.pub) }, '172.16.1.22');
  ok(r.code === 200 && r.pub && !B.events.some((e) => e.type === 'pair-ask'), 'sealed ask: no card until the asker\'s key arrives');
  ok(B.p.status(r.id, '172.16.1.22', other.pub).state === 'no' && !B.events.some((e) => e.type === 'pair-ask'), 'a key that doesn\'t match the promise: no, and no card');
}

// Plain (old) pairing over the home network is refused; over Tailscale it still works.
{
  const B = bob('go4', '172.16.1.33');
  const r = B.p.ask({ pair: PAIR, name: 'old', address: '172.16.1.23:7777', code: '1234' }, '172.16.1.23');
  ok(r.code === 400 && /1\.5\.213/.test(r.error), 'an old Bob can\'t pair over the home network (it would send passcodes in the clear)');
  const t = B.p.ask({ pair: PAIR, name: 'old', address: '100.101.1.2:7777', code: '1234' }, '100.101.1.2');
  ok(t.code === 200 && B.events.some((e) => e.type === 'pair-ask' && e.number === '1234'), 'an old Bob still pairs over Tailscale the old way');
}

// With the switch off, the home network is shut: a home caller is refused, and nobody is scanned.
{
  const B = bob('go5', '172.16.1.34', { homeNet: false });
  const k = oneTimeKey();
  ok(B.p.ask({ pair: PAIR, name: 'x', address: '172.16.1.24:7777', code: '1234', commit: commitOf(k.pub) }, '172.16.1.24').code === 403, 'switch off: a home caller is refused');
  ok(B.p.ask({ pair: PAIR, name: 'x', address: '172.16.7.24:7777', code: '1234', commit: commitOf(k.pub) }, '172.16.7.24').code === 403, 'switch off: another network too');
  let knocks = 0;
  B.p.fetch = async () => { knocks++; throw new Error('quiet'); };
  const f = await B.p.find();
  ok(knocks === 0 && f.tailscale === false && f.home === false, 'switch off: Find knocks on nothing on the home network');
  ok(/turn on "Also over the home network"/.test((await B.p.pairWith('172.16.1.40')).error || ''), 'switch off: Pair on a home address says what to turn on');
}
{
  const B = bob('go6', '172.16.1.35');
  const k = oneTimeKey();
  ok(B.p.ask({ pair: PAIR, name: 'x', address: '172.16.7.24:7777', code: '1234', commit: commitOf(k.pub) }, '172.16.7.24').code === 403, 'switch on: a caller from another network is still refused');
}

// Find my other Bobs on the home network: capped, and lists only Bobs that answer.
{
  const A = bob('desk7', '172.16.1.20'), B = bob('go7', '172.16.1.30');
  const n = net([A, B]);
  let knocks = 0, most = 0, now = 0;
  A.p.fetch = async (url, opt) => { knocks++; now++; most = Math.max(most, now); try { return await n(A)(url, opt); } finally { now--; } };
  const f = await A.p.find();
  ok(f.home === true && f.tailscale === false, 'find: home network looked at, no Tailscale needed');
  ok(f.bobs.length === 1 && f.bobs[0].address === '172.16.1.30:7777' && f.bobs[0].via === 'home' && f.bobs[0].bob === true, 'find: lists the one Bob that answered, by his home address');
  ok(knocks === 253 && most <= SCAN_AT_ONCE, `find: knocked on its own /24 only, ${SCAN_AT_ONCE} at a time at most`);
}

// ---------- server.js, Settings, Help ----------
{
  const server = read('src/server.js');
  ok(/p\.startsWith\('\/api\/pair\/'\) && !fromAllowed\(req\.socket\.remoteAddress\)\) return send\(res, 403/.test(server), 'server: pairing comes in over Tailscale or this home network (switch on, own subnet)');
  ok(/pairing\.status\(b\.id, req\.socket\.remoteAddress, b\.pub\)/.test(server) && /\{ id: r\.id, \.\.\.\(r\.pub \? \{ pub: r\.pub \} : \{\}\) \}/.test(server), 'server: the sealed-pairing keys pass through');
  ok(/cleanPhonePatch\(cfg, b, \{ home: homeIps\(\) \}\)/.test(server), 'server: the door can open on the home network alone');
  ok(/home: \(\) => \(remoteHome \? homeIps\(\) : \[\]\)/.test(server), 'server: pairing sees home networks only with the switch on');
  const page = read('public/share-brains.js');
  ok(/found\.home/.test(page) && /Also over the home network/.test(page), 'Settings: Find shows Bobs on the home network, and says which switch to turn on');
  const help = read('public/help-content.js');
  ok(/home network/i.test(help) && /switch/i.test(help) && /Tailscale/.test(help), 'Help: Bob-Net over a home network, no Tailscale');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
