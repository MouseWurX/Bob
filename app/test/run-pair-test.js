// 1.5.97 Pair with my other Bobs (src/bob-net-pair.js): two Bobs talking through a fake network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pairing, peersFromStatus, PAIR } from '../src/bob-net-pair.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-pair-'));

function bob(name, ip, { door = true, passcode } = {}) {
  const file = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, '{}');
  const cfg = { port: 7777, configFile: file, remote: door ? { enabled: true, passcode: passcode || `${name}-code-1` } : { enabled: false }, share: {} };
  const events = [];
  const p = new Pairing(cfg, { broadcast: (e) => events.push(e), version: '1.5.97', ownAddresses: () => [`${ip}:7777`], pollMs: 5, peers: async () => null });
  return { name, ip, cfg, p, events };
}

// A fake Tailscale: requests from `from` to an address reach that Bob's pairing routes, as server.js serves them.
function net(bobs) {
  return (from) => async (url, opt = {}) => {
    const u = new URL(url);
    const to = bobs.find((b) => b.ip === u.hostname);
    const reply = (status, j) => ({ ok: status < 300, status, json: async () => j });
    if (!to) throw new Error('no route');
    if (!to.cfg.remote.enabled) return reply(403, { error: 'bad host' });
    const b = opt.body ? JSON.parse(opt.body) : {};
    if (u.pathname === '/api/pair/hello') return reply(200, to.p.hello());
    if (u.pathname === '/api/pair/ask') { const r = to.p.ask(b, '::ffff:' + from.ip); return reply(r.code, r.error ? { error: r.error } : { id: r.id }); }
    if (u.pathname === '/api/pair/status') return reply(200, to.p.status(b.id, from.ip));
    if (u.pathname === '/api/pair/finish') return reply(200, to.p.finish(b, from.ip));
    return reply(404, {});
  };
}
const wait = async (f, ms = 2000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 5)); return f(); };

// --- Tailscale's device list ---
const peers = peersFromStatus({ Peer: { a: { HostName: 'handheld', TailscaleIPs: ['100.101.1.2', 'fd7a::1'], Online: true, OS: 'windows' }, b: { HostName: 'phone<b>', TailscaleIPs: ['100.101.1.3'], Online: false, OS: 'android' }, c: { HostName: 'x', TailscaleIPs: ['203.0.113.9'] } } });
ok(peers.length === 2 && peers[0].name === 'handheld' && peers[0].ip === '100.101.1.2' && peers[0].online, 'device list: online first, IPv4 Tailscale address');
ok(peers[1].name === 'phoneb', 'device list: names are cleaned');

// --- The whole thing, both ways ---
{
  const A = bob('desk', '100.101.2.23'), B = bob('handheld', '100.101.1.2');
  const n = net([A, B]); A.p.fetch = n(A); B.p.fetch = n(B);
  const hello = await A.p.knock(B.ip);
  ok(hello.bob && hello.pair === PAIR && hello.version === '1.5.97', 'knock: a Bob answers hello');
  const r = await A.p.pairWith(B.ip);
  ok(r.state === 'waiting' && /^\d{4}$/.test(r.code), 'pair: waiting, with a 4-digit number');
  const card = B.events.find((e) => e.type === 'pair-ask');
  ok(card && card.number === r.code && card.address === `${A.ip}:7777`, 'card on the other Bob shows the same number and the asker');
  ok(B.p.waiting().length === 1, 'card is kept for a window that opens later');
  ok(!B.cfg.share?.borrow?.bobs?.length && !A.cfg.share?.borrow?.bobs?.length, 'nothing saved before Yes');
  ok(B.p.answer(card.id, true).ok, 'Yes pressed');
  await wait(() => A.p.outgoing.get(`${B.ip}:7777`).state === 'paired');
  ok(A.p.outgoing.get(`${B.ip}:7777`).state === 'paired', 'asker sees paired');
  const aList = A.cfg.share.borrow.bobs, bList = B.cfg.share.borrow.bobs;
  ok(aList.length === 1 && aList[0].address === `${B.ip}:7777` && aList[0].passcode === 'handheld-code-1', 'asker has the other Bob with his passcode');
  ok(bList.length === 1 && bList[0].address === `${A.ip}:7777` && bList[0].passcode === 'desk-code-1', 'the other Bob has the asker with his passcode');
  ok(JSON.parse(fs.readFileSync(A.cfg.configFile, 'utf8')).share.borrow.bobs.length === 1, 'saved to config.json');
  ok(A.cfg.share.lend !== true && A.cfg.share.borrow.on !== true && A.cfg.share.borrow.jobs !== true && A.cfg.share.takeJobs !== true, 'pairing switches nothing on (opt-in)');
  ok(B.events.some((e) => e.type === 'pair-done' && e.both) && A.events.some((e) => e.type === 'pair-done' && e.both && e.asker), 'both say paired');
  ok(B.p.status(card.id, A.ip).state === 'gone', 'the passcode is handed over once');
}

// --- No ---
{
  const A = bob('desk', '100.101.2.23'), B = bob('handheld', '100.101.1.2');
  const n = net([A, B]); A.p.fetch = n(A); B.p.fetch = n(B);
  await A.p.pairWith(B.ip);
  const card = B.events.find((e) => e.type === 'pair-ask');
  let leaked = false;
  const peek = B.p.finish.bind(B.p);
  B.p.finish = (b, ip) => { if (b.passcode) leaked = true; return peek(b, ip); };
  B.p.answer(card.id, false);
  await wait(() => A.p.outgoing.get(`${B.ip}:7777`).state === 'no');
  ok(A.p.outgoing.get(`${B.ip}:7777`).state === 'no', 'No: asker hears no');
  ok(!A.cfg.share?.borrow?.bobs?.length && !B.cfg.share?.borrow?.bobs?.length && !leaked, 'No: nothing saved, the asker\'s passcode never sent');
}

// --- Asker's door is shut: one way ---
{
  const A = bob('desk', '100.101.2.23', { door: false }), B = bob('handheld', '100.101.1.2');
  const n = net([A, B]); A.p.fetch = n(A); B.p.fetch = n(B);
  await A.p.pairWith(B.ip);
  B.p.answer(B.events.find((e) => e.type === 'pair-ask').id, true);
  await wait(() => A.p.outgoing.get(`${B.ip}:7777`).state === 'paired');
  ok(A.cfg.share.borrow.bobs.length === 1 && !B.cfg.share?.borrow?.bobs?.length, 'door shut here: only this Bob gets the other');
  ok(A.p.outgoing.get(`${B.ip}:7777`).both === false && B.events.some((e) => e.type === 'pair-done' && e.both === false), 'one way is said on both');
}

// --- Other Bob's door shut ---
{
  const A = bob('desk', '100.101.2.23'), B = bob('handheld', '100.101.1.2', { door: false });
  const n = net([A, B]); A.p.fetch = n(A);
  const r = await A.p.pairWith(B.ip);
  ok(/door is shut/.test(r.error || ''), 'other door shut: says how to open it');
  ok(B.p.answer('x', true).ok === false, 'answer to an unknown card is refused');
}

// --- The Bob being asked checks the asker ---
{
  const B = bob('handheld', '100.101.1.2');
  ok(B.p.ask({ pair: 1, name: 'evil', address: '100.99.99.99:7777', code: '1234' }, '100.101.2.23').code === 400, 'address must be the caller\'s own');
  ok(B.p.ask({ pair: 1, address: '203.0.113.5:7777', code: '1234' }, '203.0.113.5').code === 403, 'not Tailscale: refused');
  ok(B.p.ask({ pair: 2, address: '100.101.2.23:7777', code: '1234' }, '100.101.2.23').code === 400, 'other protocol: refused');
  ok(B.p.ask({ pair: 1, address: '100.101.2.23:7777', code: 'abcd' }, '100.101.2.23').code === 400, 'no number: refused');
  const a1 = B.p.ask({ pair: 1, name: 'desk', address: '100.101.2.23:7777', code: '1111' }, '100.101.2.23');
  ok(a1.code === 200, 'a good ask is taken');
  ok(B.p.status(a1.id, '100.101.2.24').state === 'gone', 'status only for the Bob that asked');
  ok(B.p.status(a1.id, '100.101.2.23').state === 'waiting', 'waiting until the owner answers');
  const a2 = B.p.ask({ pair: 1, name: 'desk', address: '100.101.2.23:7777', code: '2222' }, '100.101.2.23');
  ok(B.p.waiting().length === 1 && B.p.waiting()[0].number === '2222', 'one waiting card per caller (the new one wins)');
  const a3 = B.p.ask({ pair: 1, address: '100.101.2.25:7777', code: '3333' }, '100.101.2.25');
  const a4 = B.p.ask({ pair: 1, address: '100.101.2.26:7777', code: '4444' }, '100.101.2.26');
  ok(a2.code === 200 && a3.code === 200 && a4.code === 429, '3 asks a minute, then wait');
  B.cfg.remote.enabled = false;
  ok(B.p.answer(a3.id, true).ok === false, 'Yes refused while this door is shut');
  B.cfg.remote.enabled = true;
  let t = Date.now(); B.p.now = () => t + 4 * 60000;
  ok(B.p.waiting().length === 0 && B.events.some((e) => e.type === 'pair-gone'), 'cards are forgotten after 3 minutes');
}

// --- server.js wiring ---
{
  const s = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const pairAt = s.indexOf("if (isRemote && p.startsWith('/api/pair/'))"), gate = s.indexOf('if (isRemote && !hasCookie(req))');
  ok(pairAt > 0 && pairAt < gate, 'pair routes sit before the passcode check, inside the door');
  ok(/ownTsHosts\(\)\.has\(host\)/.test(s), 'own Tailscale addresses count as hosts even with a stale saved list');
  ok(/bob-net\/answer[\s\S]{0,400}if \(!isLocal\)/.test(s), 'Yes/No and Find only on this replicant matrix');
  const page = fs.readFileSync(new URL('../public/share-brains.js', import.meta.url), 'utf8');
  ok(page.indexOf('box.innerHTML = `<h4 class="ssub">My other Bobs</h4>') < page.indexOf('<div class="pair-box">') && page.indexOf('<div class="pair-box">') < page.indexOf('<ul class="share-list">${v.lenders'), 'pairing sits at the top of My other Bobs (1.5.99: under its heading, above the list)');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  ok(/case 'pair-ask'/.test(app) && /Yes, pair us/.test(app), 'chat shows the Yes/No card');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
