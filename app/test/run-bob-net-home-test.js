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
import { doorIps, scanIps, readNicDescs, setNicDescs } from '../src/share-card.js';

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
const off = { remote: { enabled: true, passcode: 'abcdef12', homeNet: false, homeNetChosen: true } }, on = { remote: { enabled: true, passcode: 'abcdef12', homeNet: true } };
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
  const cfg = { port: 7777, remote: { passcode: '12345678', hosts: [], homeNet: false, homeNetChosen: true } };
  ok(/home network/.test(cleanPhonePatch(cfg, { enabled: true }, { home: mine }).error || ''), 'door, no Tailscale, switch off: says to turn on the home network switch');
  ok(cleanPhonePatch(cfg, { enabled: true, homeNet: true }, { home: mine }).remote?.enabled === true, 'door, no Tailscale, switch on: opens on the home network');
  ok(/cable/.test(cleanPhonePatch(cfg, { enabled: true, homeNet: true }, { home: [] }).error || ''), 'door, no Tailscale and no home network: says so');
  ok(cleanPhonePatch({ port: 7777, remote: {} }, {}).remote.homeNet === true && cleanPhonePatch({ port: 7777, remote: { homeNet: false } }, {}).remote.homeNet === true && cleanPhonePatch({ port: 7777, remote: {} }, { homeNet: false }).remote.homeNet === false && cleanPhonePatch({ port: 7777, remote: { homeNet: false, homeNetChosen: true } }, {}).remote.homeNet === false, '1.5.214: Also over the home network is on to start with (home first), an off saved by 1.5.213 without choosing it turns on, and a chosen off stays off');
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
function bob(name, ip, { homeNet = true, door = true, port = 7777 } = {}) {
  const file = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, '{}');
  const cfg = { port, configFile: file, dataDir: path.join(tmp, name), remote: { enabled: door, passcode: `${name}-code-1`, homeNet, homeNetChosen: true }, share: {} };
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
    const to = bobs.find((x) => x.ip === u.hostname && String(x.cfg.port) === (u.port || '80'));
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


// PC check 1.5.213: Find never lists this computer itself, knocks on 7777 as well as its own port, shows the version as
// text, and a home-network refusal says an older Bob needs updating.
{
  const A = bob('desk8', '172.16.1.20', { port: 7799 }), B = bob('go8', '172.16.1.30');
  A.p.home = () => [...lan('172.16.1.20'), ...lan('172.16.1.21')]; // a second network card on the same network
  const twin = { ...A, ip: '172.16.1.21' }; // the same running Bob, answering on his second address
  const n = net([A, B, twin]);
  A.p.fetch = n(A);
  const f = await A.p.find();
  ok(f.bobs.length === 1 && f.bobs[0].address === '172.16.1.30:7777', 'find: never lists itself (second network card), and finds a Bob on 7777 from a Bob on 7799');
  A.p.home = () => lan('172.16.1.20');
  const C = bob('desk8b', '172.16.1.20', { port: 7799 }), Cself = { ...C, ip: '172.16.1.22' }; // own id answering elsewhere
  C.p.fetch = net([C, Cself])(C);
  ok((await C.p.find()).bobs.length === 0, 'find: a hello carrying our own id is left out');
  ok(new Pairing({ port: 7777, remote: {}, share: {} }, { version: { label: '1.5.213', build: 265 } }).hello().version === '1.5.213', 'hello: the version is text, never [object Object]');
  const D = bob('go9', '172.16.1.36', { door: false }), E = bob('desk9', '172.16.1.26');
  E.p.fetch = net([D, E])(E);
  ok(/older than 1\.5\.213/.test((await E.p.pairWith(D.ip)).error || ''), 'pair: a 403 on the home network says an older Bob needs 1.5.213 (it has no home switch)');
  const nic = { Ethernet: [{ family: 'IPv4', address: '172.16.9.5', netmask: '255.255.255.0', internal: false }], 'VirtualBox Host-Only Network': [{ family: 'IPv4', address: '172.16.56.1', netmask: '255.255.255.0', internal: false }], 'vEthernet (WSL)': [{ family: 'IPv4', address: '172.20.0.1', netmask: '255.255.240.0', internal: false }], 'Ethernet 2': [{ family: 'IPv4', address: '169.254.3.4', netmask: '255.255.0.0', internal: false }] };
  ok(doorIps(nic).map((m) => m.address).join() === '172.16.9.5,169.254.3.4', 'door: no VirtualBox or WSL adapters (169.254 kept for a bare cable)');
  ok(scanIps(nic).map((m) => m.address).join() === '172.16.9.5', 'find: no 169.254 sweep');
}

// PC check round 2: Windows names adapters "Ethernet 2", so their descriptions decide; Tailscale's own 169.254 goes;
// and Find lists a Bob that can't pair over the home network yet as needing 1.5.213.
{
  const nic = { Ethernet: [{ family: 'IPv4', address: '172.16.9.5', netmask: '255.255.255.0', internal: false }], 'Ethernet 2': [{ family: 'IPv4', address: '172.16.70.1', netmask: '255.255.255.0', internal: false }], 'Ethernet 3': [{ family: 'IPv4', address: '169.254.83.107', netmask: '255.255.0.0', internal: false }], 'Ethernet 4': [{ family: 'IPv4', address: '169.254.9.9', netmask: '255.255.0.0', internal: false }], vb: [{ family: 'IPv4', address: ['192', '168', '56', '1'].join('.'), netmask: '255.255.255.0', internal: false }] };
  const descs = { 'Ethernet 2': 'VirtualBox Host-Only Ethernet Adapter', 'Ethernet 3': 'Tailscale Tunnel', 'Ethernet 4': 'Realtek USB GbE Family Controller' };
  ok(doorIps(nic, descs).map((m) => m.address).join() === '172.16.9.5,169.254.9.9', 'door: a VirtualBox adapter known only by its description, the VirtualBox network and Tailscale\'s own 169.254 are left out; a real cable\'s 169.254 stays');
  let asked = null;
  const got = await readNicDescs({ platform: 'win32', run: (f, a, o, cb) => { asked = a.join(' '); cb(null, JSON.stringify([{ n: 'Ethernet 2', d: 'VirtualBox Host-Only Ethernet Adapter' }])); } });
  ok(/Get-NetAdapter/.test(asked) && got['Ethernet 2'] === 'VirtualBox Host-Only Ethernet Adapter' && doorIps({ 'Ethernet 2': nic['Ethernet 2'] }).length === 0, 'Windows: adapter descriptions are read once and used by the door');
  setNicDescs({});
  ok(Object.keys(await readNicDescs({ platform: 'linux', run: () => { throw new Error('no'); } })).length === 0, 'not Windows: nothing is run');
  const A = bob('desk10', '172.16.1.20'), Old = { ip: '172.16.1.40', cfg: { port: 7777 } };
  A.p.fetch = async (url) => { const u = new URL(url); if (u.hostname === Old.ip && u.port === '7777') return { ok: false, status: 403, json: async () => ({ error: 'Pairing goes over Tailscale only.' }) }; throw new Error('quiet'); };
  const f = await A.p.find();
  ok(f.bobs.length === 1 && f.bobs[0].needsUpdate === true && f.bobs[0].address === '172.16.1.40:7777', 'find: an older Bob (403 on the home network) is listed as needing 1.5.213, not left out');
  const page = read('public/share-brains.js');
  ok(/f\.needsUpdate\) what = .*1\.5\.213/.test(page) && /f\.bob && !f\.needsUpdate && f\.pair >= 1/.test(page), 'Settings: such a Bob says to update him and has no Pair button');
}

// 1.5.214 (the owner: "if you have a home network it should just work, tailscale is the fall back for being mobile")
{
  const A = bob('desk11', '172.16.1.20');
  const hello = (id, name) => ({ ok: true, status: 200, json: async () => ({ bob: true, pair: PAIR, seal: 1, id, name, version: '1.5.214', device: 'computer' }) });
  A.cfg.share = { borrow: { bobs: [{ name: 'tower', address: '100.101.0.9:7777', passcode: 'their-code' }] } };
  A.p.peers = async () => [{ ip: '100.101.0.9', name: 'tower', os: 'windows', online: true }, { ip: '100.101.0.10', name: 'go', os: 'windows', online: true }];
  A.p.fetch = async (url) => { const u = new URL(url); if (u.port !== '7777') throw new Error('quiet');
    if (u.hostname === '100.101.0.9' || u.hostname === '172.16.1.85') return hello('tower-run', 'tower');
    if (['100.101.0.10', '172.16.1.89', '172.16.1.99'].includes(u.hostname)) return hello('go-run', 'go');
    throw new Error('quiet'); };
  const f = await A.p.find();
  const go = f.bobs.find((b) => b.name === 'go'), tower = f.bobs.find((b) => b.name === 'tower');
  ok(f.bobs.length === 2, 'find: one row per Bob, however many addresses he answered on (the Go on two home addresses and Tailscale)');
  ok(go?.address === '172.16.1.89:7777' && go.via === 'home' && go.also.length === 2 && go.device === 'go', 'find: Pair uses his home address first; his other addresses ride along');
  ok(tower?.paired === true && A.cfg.share.borrow.bobs[0].home === '172.16.1.85:7777', 'find: a Bob paired over Tailscale is the same row, and his home address is saved on his entry');
  const T = bob('desk12', '172.16.1.20', { homeNet: false });
  T.p.peers = A.p.peers; T.p.fetch = A.p.fetch;
  ok((await T.p.find()).bobs.every((b) => b.via === 'tailscale'), 'find, home network switched off: Tailscale only, as before');
  const urls = [];
  const cfg = { remote: { enabled: true, passcode: 'abcdef12' }, share: { borrow: { bobs: [] } } };
  const fetchFn = async (url) => { urls.push(url); if (/100\.101|172\.16\.1\.40/.test(url) && !/172\.16\.1\.85/.test(url)) throw new TypeError('fetch failed'); return { ok: true, status: 200, json: async () => ({ lend: true }) }; };
  const ls = new Lenders(cfg, { fetchFn, home: () => mine });
  await ls.call({ name: 'tower', address: '100.101.0.9:7777', home: '172.16.1.85:7777', passcode: 'x' }, '/api/lend/hello');
  ok(urls[0] === 'http://172.16.1.85:7777/api/lend/hello', 'Lenders: a saved home address goes first, with Tailscale off');
  urls.length = 0;
  await ls.call({ name: 'go', address: '172.16.1.40:7777', ts: '100.101.0.10:7777', passcode: 'x' }, '/api/lend/hello').catch(() => {});
  ok(urls.join(' ') === 'http://172.16.1.40:7777/api/lend/hello http://100.101.0.10:7777/api/lend/hello', 'Lenders: away from home, a Bob paired at home is tried on his Tailscale address');
  let looked = 0; ls.lookHome = async () => { looked++; };
  const lost = { name: 'pi', address: '100.101.0.11:7777', passcode: 'x' };
  await ls.hello(lost, { force: true }); await ls.hello(lost, { force: true });
  ok(looked === 1, 'Lenders: a paired Bob lost on Tailscale is looked for on the home network (once in a while)');
  const r = new Lenders({ ...cfg, share: { borrow: { bobs: [{ name: 'go', address: '172.16.1.40:7777', passcode: 'x' }] } } }, { home: () => mine, fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ lend: true, ts: ['100.101.0.10:7777'] }) }) });
  const entry = r.cfg.share.borrow.bobs[0];
  await r.hello(entry, { force: true });
  ok(entry.ts === '100.101.0.10:7777', 'Lenders: a Bob paired at home keeps his Tailscale address from his hello, for when you are out');
  ok(/ts: doorOpen\(brain\.cfg\) \? tailscaleIps\(\)/.test(read('src/share-brains.js')), 'hello: says his Tailscale door too');
  const re = cleanSharePatch({ ...on, share: { borrow: { bobs: [{ name: 'tower', address: '100.101.0.9:7777', home: '172.16.1.85:7777', passcode: 'their-code' }] } } }, { addBob: { name: 'tower', address: '172.16.1.85', passcode: 'new-code-1' } }, { home: () => mine });
  ok(re.share.borrow.bobs.length === 1 && re.share.borrow.bobs[0].address === '172.16.1.85:7777' && re.share.borrow.bobs[0].ts === '100.101.0.9:7777', 'pairing again at home: still one entry, home address first, Tailscale kept as the fallback');
}

// PC check 1.5.214 (a test Bob on :7799): Tailscale peers are knocked on 7777 too, and a Tailscale device that doesn't
// answer folds into the home row of the same computer.
{
  const A = bob('desk13', '172.16.1.20', { port: 7799 });
  const hello = (id, name) => ({ ok: true, status: 200, json: async () => ({ bob: true, pair: PAIR, seal: 1, id, name, version: '1.5.214', device: 'computer' }) });
  A.p.peers = async () => [{ ip: '100.101.0.10', name: 'go', os: 'windows', online: true }, { ip: '100.101.0.12', name: 'Laptop', os: 'windows', online: true }];
  A.p.fetch = async (url) => { const u = new URL(url); if (u.port !== '7777') throw new Error('quiet');
    if (['100.101.0.10', '172.16.1.89', '172.16.1.99'].includes(u.hostname)) return hello('go-run', 'go');
    if (u.hostname === '172.16.1.98') return hello('lap-run', 'laptop');
    throw new Error('quiet'); };
  const f = await A.p.find();
  const go = f.bobs.find((b) => b.name === 'go'), lap = f.bobs.filter((b) => /laptop/i.test(b.name || b.device));
  ok(f.bobs.length === 2 && go?.also?.includes('100.101.0.10:7777'), 'find from :7799: a Tailscale peer is knocked on 7777 too, and groups with his home addresses');
  ok(lap.length === 1 && lap[0].address === '172.16.1.98:7777' && lap[0].also.includes('100.101.0.12:7799'), 'find: a Tailscale device that doesn\'t answer folds into the home row of the same computer');
}

// ---------- server.js, Settings, Help ----------
{
  const server = read('src/server.js');
  ok(/p\.startsWith\('\/api\/pair\/'\) && !fromAllowed\(req\.socket\.remoteAddress\)\) return send\(res, 403/.test(server), 'server: pairing comes in over Tailscale or this home network (switch on, own subnet)');
  ok(/pairing\.status\(b\.id, req\.socket\.remoteAddress, b\.pub\)/.test(server) && /\{ id: r\.id, \.\.\.\(r\.pub \? \{ pub: r\.pub \} : \{\}\) \}/.test(server), 'server: the sealed-pairing keys pass through');
  ok(/cleanPhonePatch\(cfg, b, \{ home: doorIps\(\) \}\)/.test(server), 'server: the door can open on the home network alone');
  ok(/home: \(\) => \(remoteHome \? doorIps\(\) : \[\]\)/.test(server), 'server: pairing sees home networks only with the switch on');
  const page = read('public/share-brains.js');
  ok(/found\.home/.test(page) && /Also over the home network/.test(page), 'Settings: Find shows Bobs on the home network, and says which switch to turn on');
  const help = read('public/help-content.js');
  ok(/home network/i.test(help) && /switch/i.test(help) && /Tailscale/.test(help), 'Help: Bob-Net over a home network, no Tailscale');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
