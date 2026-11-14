// Nov 14 Bob-Net file sharing and Brain Copying (src/bob-net-files.js): two pretend Bobs on this machine. The sender's
// door is a small server on 127.0.0.1; the receiver pulls from it in small pieces. Folders, drive room, Wi-Fi and
// Gaming are all fakes passed in: nothing here reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { Outbox, Inbox, netFilesOn, cleanName, onWifi, capOf, freeName, brainFiles, catalogHome, SPARE, OFF, OWN_DIR } from '../src/bob-net-files.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-netfiles-'));
const noWait = () => Promise.resolve();
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// ---------- small pieces ----------
check('Files and brains starts off', netFilesOn({}) === false && netFilesOn({ netFiles: true }) === true);
check('settings keep it a plain on/off', /if \('netFiles' in out\) out\.netFiles = out\.netFiles === true;/.test(read('src/config.js')) && read('src/config.js').includes("'netFiles'"));
check('a name with folders keeps only its name', cleanName('../../x.txt') === 'x.txt' && cleanName('a\\b\\c.gguf') === 'c.gguf');
check('names Windows can\'t use are refused', cleanName('con.txt') === '' && cleanName('..') === '' && cleanName('   ') === '' && cleanName('a:b?.txt') === 'ab.txt');
check('a trailing dot or space goes', cleanName('notes. ') === 'notes');
check('Wi-Fi is capped at SCUT\'s 100 Mbit/s unless picked', capOf({}, true) === 12.5e6 && capOf({ share: { scutMbps: 300 } }, true) === 37.5e6);
check('a cable has no cap', capOf({}, false) === 0 && onWifi('cable', null) === false && onWifi('wifi', null) === true);
check('a Tailscale address on a Wi-Fi-only machine counts as Wi-Fi', onWifi('', { list: [{ kind: 'wifi', up: true }] }) === true && onWifi('', { list: [{ kind: 'wifi', up: true }, { kind: 'cable', up: true }] }) === false);
{
  const d = path.join(tmp, 'names'); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'a.txt'), 'x'); fs.writeFileSync(path.join(d, 'a (2).txt.part'), 'x');
  check('a free name never lands on a file or a half copy', freeName(d, 'a.txt') === 'a (3).txt' && freeName(d, 'b.txt') === 'b.txt');
}
check('a catalogue brain is known by its name and size', catalogHome([{ id: 'g', category: 'coding', files: [{ url: 'https://x/y/big.gguf', bytes: 5, verify: true, sha256: 'a'.repeat(64) }] }], 'BIG.gguf', 5)?.category === 'coding'
  && catalogHome([{ id: 'g', category: 'coding', files: [{ url: 'https://x/y/big.gguf', bytes: 5 }] }], 'big.gguf', 6) === null);

// ---------- two Bobs ----------
function pair({ cfgA = {}, cfgB = {}, inboxOpts = {}, outboxOpts = {}, throwAfter = Infinity } = {}) {
  const dirA = fs.mkdtempSync(path.join(tmp, 'a-')), dirB = fs.mkdtempSync(path.join(tmp, 'b-'));
  const A = { netFiles: true, dataDir: dirA, agentDir: dirA, ...cfgA };
  const B = { netFiles: true, dataDir: dirB, agentDir: dirB, bobModelsDir: path.join(dirB, 'models', 'bob'), ...cfgB };
  const events = [];
  let outbox, inbox, server, port, calls = 0;
  const toB = { name: 'laptop', address: 'b:7777' }, toA = { name: 'desk', address: 'a:7777' };
  const resp = (code, j) => new Response(JSON.stringify(j), { status: code, headers: { 'content-type': 'application/json' } });
  // A's calls to B: straight into B's inbox. B's calls to A: over a real local socket to A's little door.
  const lendersA = { bobs: () => [toB], call: async (bob, p, o) => { const b = o.body; if (p === '/api/bob-net/files/offer') { const { code, ...r } = inbox.receive(b, '172.16.0.9'); return resp(code, r); } if (p === '/api/bob-net/files/stop') { const { code, ...r } = inbox.senderStopped(b); return resp(code, r); } return resp(404, {}); } };
  const lendersB = { bobs: () => [toA], nearMine: new Map(), call: async (bob, p, o = {}) => {
    if (++calls > throwAfter) throw new Error('fetch failed');
    if (p === '/api/bob-net/files/said') { const { code, ...r } = outbox.said(o.body); return resp(code, r); }
    return fetch(`http://127.0.0.1:${port}${p}`, { signal: o.signal });
  } };
  outbox = new Outbox(A, { lenders: lendersA, from: () => 'desk', ...outboxOpts });
  inbox = new Inbox(B, { lenders: lendersB, bobFrom: (ip) => (ip === '172.16.0.9' ? toA : null), broadcast: (e) => events.push(e), free: () => 500e9, chunk: 4096, wait: noWait, ...inboxOpts });
  server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); const q = Object.fromEntries(u.searchParams);
    if (u.pathname === '/api/bob-net/files/get') return outbox.serve(q, res, { localAddress: req.socket.localAddress });
    if (u.pathname === '/api/bob-net/files/hash') { const { code, ...r } = await outbox.hashAnswer(q); res.writeHead(code, { 'content-type': 'application/json' }); return res.end(JSON.stringify(r)); }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => { port = server.address().port; r({ A, B, dirA, dirB, outbox, inbox, events, close: () => server.close(), toB, setThrow: (n) => { calls = 0; throwAfter = n; } }); }));
}
const bytes = (n) => crypto.randomBytes(n);

{
  const t = await pair();
  const src = path.join(t.dirA, 'holiday.zip'); fs.writeFileSync(src, bytes(50000));
  const r = await t.outbox.send({ address: 'b:7777', files: [{ path: src }] });
  check('sending offers it: only the name and size go', r.ok === true && t.events.some((e) => e.type === 'net-file-ask' && e.title === 'holiday.zip' && e.total === 50000 && e.from === 'desk'));
  check('…and nothing is written before Yes', !fs.existsSync(path.join(t.dirB, 'From my other Bobs')));
  const a = t.inbox.answer(r.id, true);
  await a.run;
  const got = path.join(t.dirB, 'From my other Bobs', 'holiday.zip');
  check('after Yes it comes over in pieces and is checked', fs.existsSync(got) && sha(got) === sha(src), JSON.stringify(t.inbox.view()));
  check('…no half copy is left', !fs.existsSync(got + '.part'));
  check('…and the sender hears it\'s done', t.outbox.view().length === 0 && t.outbox.last?.what === 'done');
  check('the card shows the progress as it goes', t.events.filter((e) => e.type === 'net-file').length >= 2 && t.events.at(-1).state === 'done');
  // The same name again: never on top of the first.
  const r2 = await t.outbox.send({ address: 'b:7777', files: [{ path: src }] });
  await t.inbox.answer(r2.id, true).run;
  check('a second copy with the same name gets a name of its own', fs.existsSync(path.join(t.dirB, 'From my other Bobs', 'holiday (2).zip')));
  // No.
  const r3 = await t.outbox.send({ address: 'b:7777', files: [{ path: src }] });
  t.inbox.answer(r3.id, false);
  await new Promise((x) => setTimeout(x, 30));
  check('No sends nothing and the sender hears it', !fs.existsSync(path.join(t.dirB, 'From my other Bobs', 'holiday (3).zip')) && t.outbox.last?.what === 'no');
  check('an old card can\'t be answered twice', t.inbox.answer(r3.id, true).ok === false);
  t.close();
}

{
  const t = await pair({ cfgB: { netFiles: false } });
  const src = path.join(t.dirA, 'x.bin'); fs.writeFileSync(src, bytes(10));
  const r = await t.outbox.send({ address: 'b:7777', files: [{ path: src }] });
  check('a Bob with Files and brains off says so, and nothing goes', r.error === OFF.replace('That Bob', 'laptop'));
  check('a stranger can\'t offer', t.inbox.receive({ id: 'a'.repeat(16), token: 'b'.repeat(48), files: [{ name: 'x', bytes: 1 }] }, '203.0.113.5').code === 409);
  t.B.netFiles = true;
  check('…and with it on, still only paired Bobs', t.inbox.receive({ id: 'a'.repeat(16), token: 'b'.repeat(48), files: [{ name: 'x', bytes: 1 }] }, '203.0.113.5').code === 403);
  t.A.netFiles = false;
  check('the sender needs it on too', (await t.outbox.send({ address: 'b:7777', files: [{ path: src }] })).error?.includes('off here'));
  t.close();
}

{ // the line drops part-way: it pauses, then Carry on picks up from the half copy
  const t = await pair({ inboxOpts: { retries: 1 } });
  const src = path.join(t.dirA, 'big.bin'); fs.writeFileSync(src, bytes(40000));
  const r = await t.outbox.send({ address: 'b:7777', files: [{ path: src }] });
  t.setThrow(4);
  await t.inbox.answer(r.id, true).run;
  const part = path.join(t.dirB, 'From my other Bobs', 'big.bin.part');
  const v = t.inbox.view()[0];
  check('a dropped line pauses the copy and keeps the part', v.state === 'paused' && /Carry on/.test(v.why) && fs.existsSync(part) && fs.statSync(part).size > 0 && fs.statSync(part).size < 40000, JSON.stringify(v));
  t.setThrow(Infinity);
  const before = fs.statSync(part).size;
  await t.inbox.resume(r.id).run;
  const got = path.join(t.dirB, 'From my other Bobs', 'big.bin');
  check('Carry on finishes it from where it got to, and it checks out', before > 0 && fs.existsSync(got) && sha(got) === sha(src), JSON.stringify(t.inbox.view()));
  t.close();
}

{ // restart mid-copy: what was copying comes back paused
  const t = await pair({ inboxOpts: { retries: 0 } });
  const src = path.join(t.dirA, 'c.bin'); fs.writeFileSync(src, bytes(20000));
  const r = await t.outbox.send({ address: 'b:7777', files: [{ path: src }] });
  t.setThrow(2);
  await t.inbox.answer(r.id, true).run;
  const it = [...t.inbox.items.values()][0]; it.state = 'copying'; t.inbox.save();
  const again = new Inbox(t.B, { lenders: { bobs: () => [] } });
  check('after a restart a copy in flight waits for Carry on', again.view()[0]?.state === 'paused');
  check('Throw the half copy away deletes the part', again.forget(r.id).ok && !fs.existsSync(path.join(t.dirB, 'From my other Bobs', 'c.bin.part')) && again.view().length === 0);
  t.close();
}

{ // a copy that doesn't match is thrown away, never renamed
  const t = await pair({ outboxOpts: { hash: async () => '0'.repeat(64) } });
  const src = path.join(t.dirA, 'bad.bin'); fs.writeFileSync(src, bytes(9000));
  const r = await t.outbox.send({ address: 'b:7777', files: [{ path: src }] });
  await t.inbox.answer(r.id, true).run;
  const v = t.inbox.view()[0];
  check('a copy that doesn\'t match the sender\'s is thrown away', v.state === 'paused' && /didn't match/.test(v.why) && !fs.existsSync(path.join(t.dirB, 'From my other Bobs', 'bad.bin')) && !fs.existsSync(path.join(t.dirB, 'From my other Bobs', 'bad.bin.part')), JSON.stringify(v));
  t.close();
}

{ // not enough room: never starts
  const t = await pair({ inboxOpts: { free: () => SPARE + 100 } });
  const src = path.join(t.dirA, 'roomy.bin'); fs.writeFileSync(src, bytes(5000));
  const r = await t.outbox.send({ address: 'b:7777', files: [{ path: src }] });
  check('the card says when there isn\'t room', t.events.find((e) => e.type === 'net-file-ask').room < SPARE);
  const a = t.inbox.answer(r.id, true);
  check('…and Yes doesn\'t start it: 10 GB always stays free', a.ok === false && /Not enough room/.test(a.why) && !fs.existsSync(path.join(t.dirB, 'From my other Bobs', 'roomy.bin.part')));
  t.close();
}

{ // Gaming on the sender: he says wait
  let game = true;
  const t = await pair({ outboxOpts: { gaming: () => game }, inboxOpts: { retries: 3 } });
  const src = path.join(t.dirA, 'g.bin'); fs.writeFileSync(src, bytes(3000));
  const r = await t.outbox.send({ address: 'b:7777', files: [{ path: src }] });
  let waited = 0;
  t.inbox.wait = async () => { waited++; if (waited > 2) game = false; };
  await t.inbox.answer(r.id, true).run;
  check('while the sender is Gaming the copy waits, then goes on', waited >= 2 && fs.existsSync(path.join(t.dirB, 'From my other Bobs', 'g.bin')));
  t.close();
}

{ // the sender stops it
  const t = await pair();
  const src = path.join(t.dirA, 's.bin'); fs.writeFileSync(src, bytes(3000));
  const r = await t.outbox.send({ address: 'b:7777', files: [{ path: src }] });
  await t.outbox.stop(r.id);
  const v = t.inbox.view()[0];
  check('Stop sending takes the offer back on both sides', t.outbox.view().length === 0 && v.state === 'stopped' && v.gone === true);
  check('…and a taken-back offer can\'t be carried on', t.inbox.resume(r.id).ok === false);
  t.close();
}

// ---------- Brain Copying ----------
{
  const t = await pair();
  const g = path.join(t.dirA, 'gpt-oss-120b-MXFP4.gguf'); fs.writeFileSync(g, bytes(30000));
  const mm = path.join(t.dirA, 'mmproj-x.gguf'); fs.writeFileSync(mm, bytes(2000));
  fs.writeFileSync(path.join(t.dirA, 'gpt-oss-120b-MXFP4.bob.json'), JSON.stringify({ card: 1, file: 'gpt-oss-120b-MXFP4.gguf', bytes: 30000, jobs: ['deep'], family: 'GPT-OSS', mmproj: 'mmproj-x.gguf' }));
  const files = brainFiles(g);
  check('a brain goes with its card and picture reader', files.map((f) => f.role).join() === 'gguf,card,mmproj', JSON.stringify(files));
  t.inbox.catalog = () => [{ id: 'gpt-oss-120b-mxfp4', category: 'coding', files: [{ url: 'https://h/r/gpt-oss-120b-MXFP4.gguf', bytes: 30000 }] }];
  const r = await t.outbox.send({ address: 'b:7777', kind: 'brain', title: 'gpt-oss 120B', files });
  await t.inbox.answer(r.id, true).run;
  const home = path.join(t.B.bobModelsDir, 'coding');
  check('a catalogue brain lands in its own catalogue folder, beside the other brains', sha(path.join(home, 'gpt-oss-120b-MXFP4.gguf')) === sha(g) && fs.existsSync(path.join(home, 'gpt-oss-120b-MXFP4.bob.json')) && fs.existsSync(path.join(home, 'mmproj-x.gguf')), JSON.stringify(t.inbox.view()));
  check('…and isn\'t added twice as one of your own', t.inbox.view()[0].own === false);
  // The same brain again: it's already there, nothing is copied or written over.
  const r2 = await t.outbox.send({ address: 'b:7777', kind: 'brain', title: 'gpt-oss 120B', files });
  const before = fs.statSync(path.join(home, 'gpt-oss-120b-MXFP4.gguf')).mtimeMs;
  await t.inbox.answer(r2.id, true).run;
  check('a brain that\'s already there isn\'t copied again', t.inbox.view().find((x) => x.id === r2.id).state === 'done' && fs.statSync(path.join(home, 'gpt-oss-120b-MXFP4.gguf')).mtimeMs === before);
  t.close();
}
{
  const own = [];
  const t = await pair({ inboxOpts: { addOwn: (o) => own.push(o) } });
  const g = path.join(t.dirA, 'my-cut.gguf'); fs.writeFileSync(g, bytes(8000));
  // Something else with that name is already in the folder: the brain goes in a folder of its own.
  fs.mkdirSync(path.join(t.B.bobModelsDir, OWN_DIR), { recursive: true });
  fs.writeFileSync(path.join(t.B.bobModelsDir, OWN_DIR, 'my-cut.gguf'), 'a different brain');
  const r = await t.outbox.send({ address: 'b:7777', kind: 'brain', title: 'My cut', files: brainFiles(g) });
  await t.inbox.answer(r.id, true).run;
  check('a brain whose name is taken gets a folder of its own, nothing written over', own.length === 1 && own[0].name === 'My cut' && sha(own[0].gguf) === sha(g) && path.dirname(own[0].gguf) !== path.join(t.B.bobModelsDir, OWN_DIR)
    && fs.readFileSync(path.join(t.B.bobModelsDir, OWN_DIR, 'my-cut.gguf'), 'utf8') === 'a different brain', JSON.stringify(own));
  t.close();
}
{
  const t = await pair();
  check('a brain offer needs its .gguf', t.inbox.receive({ id: 'c'.repeat(16), token: 'd'.repeat(48), kind: 'brain', files: [{ name: 'x.bob.json', bytes: 10, role: 'card' }] }, '172.16.0.9').code === 400);
  check('a brain card can\'t be huge', t.inbox.receive({ id: 'e'.repeat(16), token: 'f'.repeat(48), kind: 'brain', files: [{ name: 'x.gguf', bytes: 10, role: 'gguf' }, { name: 'x.bob.json', bytes: 1e6, role: 'card' }] }, '172.16.0.9').code === 400);
  check('a wrong token gets nothing', t.outbox.find('0'.repeat(16), 'x') === null);
  t.close();
}

// ---------- the window, Help and wiring ----------
const help = read('public/help-content.js');
check('Help has a page for it, in Bob\'s voice, with the platforms', /id: 'net-files'/.test(help) && /Works on Windows, Mac and Linux\. The Android app can't send or take files yet\./.test(help));
check('…an FAQ', /id: 'faq-net-files'/.test(help));
check('…glossary entries for Brain Copying and Files and brains', /<dt>Brain Copying<\/dt>/.test(help) && /<dt>Files and brains<\/dt>/.test(help));
check('…and the Bob-Net settings list', /set\('Files and brains', 'Off'/.test(help));
check('the switch is in Settings, Bob-Net, off unless on', /sswitch\('netFiles', settings\.netFiles === true, 'Files and brains'/.test(read('public/cellar-pages.js')));
check('the Brains page points to Brain Copying', /Brain Copying<\/strong> sends it over Bob-Net/.test(read('public/brains.js')));
const srv = read('src/server.js');
check('the server routes it and replays a waiting card', /netFilesRoute\(/.test(srv) && /brain\.netInbox\.waiting\(\)/.test(srv));
const routes = read('src/net-files-routes.js');
check('the door side is for other Bobs only, the rest for this window only', /if \(!isRemote\) return send\(res, 403/.test(routes) && /if \(!isLocal\) return send\(res, 403/.test(routes));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
