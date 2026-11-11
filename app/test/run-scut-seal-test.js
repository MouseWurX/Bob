// Sealed SCUT packets (src/scut-seal.js, Brain Engine patch 0006): keys made at pairing, a fresh key per lend, both
// Bobs end up with the same key, the switch is on unless turned off, and nothing reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { sealOn, newLinkKey, newSalt, lendKey, keyName, linkKey, saveLinkKey, forgetLinkKey, keyId, linkKeyById, sealAsk, cleanSealAsk, lenderSeal, borrowerSeal, keysEnv, KEY_RE, KEYS_FILE } from '../src/scut-seal.js';
import { CardLender, CardBorrower, lendCardRoute, RPC_PORT, scutSealOn } from '../src/share-card.js';
import { shareView, cleanSharePatch } from '../src/share-brains.js';
import { Pairing } from '../src/bob-net-pair.js';
import { isSensitive } from '../src/tools.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-scut-seal-'));
const H = (...x) => x.join('.'); // home-network addresses, built so no real one sits in the file
const box = (name) => { const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true }); return d; };

// --- Keys ---
{
  const k = newLinkKey(), s = newSalt();
  ok(KEY_RE.test(k) && /^[0-9a-f]{32}$/.test(s) && newLinkKey() !== k, 'a link key is 32 random bytes, a salt 16');
  ok(lendKey(k, s) === lendKey(k, s) && KEY_RE.test(lendKey(k, s)), 'both Bobs make the same lend key from the same link key and salt');
  ok(lendKey(k, newSalt()) !== lendKey(k, s) && lendKey(newLinkKey(), s) !== lendKey(k, s), 'a new salt or another pair gives a different key');
  ok(lendKey('nope', s) === '' && lendKey(k, 'x') === '', 'no key from junk');
  ok(keyName('::ffff:100.101.1.2') === '100.101.1.2' && keyName('100.101.1.2:7777') === '100.101.1.2' && keyName('Go.Tail.ts.net:7777') === 'go.tail.ts.net', 'a key belongs to an address without its port');
}
{
  const cfg = { dataDir: box('keys'), configFile: path.join(tmp, 'keys-config.json') };
  fs.writeFileSync(cfg.configFile, '{}');
  const k = newLinkKey();
  ok(linkKey(cfg, '100.101.1.2') === '' && saveLinkKey(cfg, '100.101.1.2:7777', k) && linkKey(cfg, '100.101.1.2') === k, 'a link key is kept and found again');
  const file = path.join(cfg.dataDir, KEYS_FILE);
  ok(fs.existsSync(file) && !fs.readFileSync(cfg.configFile, 'utf8').includes(k), 'link keys live in their own file, never in config.json');
  if (process.platform !== 'win32') ok((fs.statSync(file).mode & 0o077) === 0, 'the key file is readable by this user only');
  ok(!saveLinkKey(cfg, '100.101.1.3', 'not a key') && linkKey(cfg, '100.101.1.3') === '', 'junk is never saved as a key');
  ok(linkKeyById(cfg, keyId(k)) === k && linkKeyById(cfg, '0000000000000000') === '' && linkKeyById(cfg, '../x') === '', 'a key is found by its id, never by a made-up one');
  ok(keyId(k) !== k && keyId(k).length === 16 && !k.includes(keyId(k)), 'a key\'s id doesn\'t give the key away');
  ok(forgetLinkKey(cfg, '100.101.1.2') && linkKey(cfg, '100.101.1.2') === '', 'a key can be forgotten');
  fs.writeFileSync(file, '{"100.1.1.1": "short", "100.1.1.2": 5}');
  ok(linkKey(cfg, '100.1.1.1') === '' && linkKey(cfg, '100.1.1.2') === '', 'a damaged key file gives no keys');
  ok(!saveLinkKey({}, '100.1.1.1', k), 'no data folder, nothing saved');
  ok(isSensitive({ ...cfg, limits: {} }, file) && isSensitive({ ...cfg, limits: { secrets: false } }, file), 'Bob\'s own file tools never open the link keys, whatever the limits say');
}

// --- The lend: what each side sends and works out ---
{
  const lendCfg = { dataDir: box('lender') }, borCfg = { dataDir: box('borrower') };
  const L = '100.101.1.2:7777', B = '100.102.0.7';
  let ask = sealAsk(borCfg, L);
  ok(ask.want === true && ask.newKey === true && !('kid' in ask), 'no key yet: the borrower asks for one');
  ok(JSON.stringify(cleanSealAsk({ want: true, kid: 'x'.repeat(16), linkKey: 'a'.repeat(64) })) === JSON.stringify({ want: true, kid: '' }) && cleanSealAsk({ want: 'yes' }) === null && cleanSealAsk(null) === null, 'the lender keeps only what it understands from the ask');
  let side = lenderSeal(lendCfg, { on: true, ask: cleanSealAsk(ask), asker: B });
  ok(side.sealed && KEY_RE.test(side.reply.linkKey) && /^[0-9a-f]{32}$/.test(side.reply.salt) && linkKey(lendCfg, B) === side.reply.linkKey, 'a new key is made, kept and handed over once (through the passcode door)');
  let key = borrowerSeal(borCfg, { address: L, reply: side.reply, asked: ask });
  ok(key === side.env.GGML_RPC_SCUT_KEY && linkKey(borCfg, L) === side.reply.linkKey, 'both Bobs end up with the same key for this lend');
  ask = sealAsk(borCfg, L);
  ok(ask.kid === keyId(linkKey(borCfg, L)) && !ask.newKey, 'next time the borrower names its key by id only');
  side = lenderSeal(lendCfg, { on: true, ask: cleanSealAsk(ask), asker: H(192, 168, 4, 189) });
  ok(side.sealed && !('linkKey' in side.reply), 'the lender finds it by id, whichever of his addresses was asked, and the key never travels again');
  key = borrowerSeal(borCfg, { address: L, reply: side.reply, asked: ask });
  ok(key === side.env.GGML_RPC_SCUT_KEY, 'the same key again, from a fresh salt');
  side = lenderSeal({ dataDir: box('lost') }, { on: true, ask: cleanSealAsk(ask), asker: B });
  ok(!side.sealed && side.reply.unknownKey === true && KEY_RE.test(side.env.GGML_RPC_SCUT_KEY), 'a lender that lost the key says so, and uses a key nobody has (so the engines stay on the usual link)');
  ok(borrowerSeal(borCfg, { address: L, reply: side.reply, asked: ask }) === 'off' && linkKey(borCfg, L) === '' && sealAsk(borCfg, L).newKey, 'the borrower forgets its old key and asks for a new one next time');
  side = lenderSeal(lendCfg, { on: true, ask: null, asker: B });
  ok(!side.sealed && side.reply === null && KEY_RE.test(side.env.GGML_RPC_SCUT_KEY), 'an older Bob that doesn\'t seal: a key nobody has, so SCUT stays off with him');
  side = lenderSeal(lendCfg, { on: false, ask: cleanSealAsk(ask), asker: B });
  ok(!side.sealed && side.reply === null && !('GGML_RPC_SCUT_KEY' in side.env), 'switched off on the lender: no key, unsealed SCUT');
  ok(borrowerSeal(borCfg, { address: L, reply: null, asked: ask }) === 'off', 'a lender that doesn\'t seal: no SCUT with him (never an unsealed link for a Bob that seals)');
  ok(keysEnv([{ at: '100.101.1.2:50052', key: 'k1' }, { at: `${H(192, 168, 4, 5)}:50052`, key: 'off' }]).GGML_RPC_SCUT_KEYS === `100.101.1.2:50052=k1,${H(192, 168, 4, 5)}:50052=off` && JSON.stringify(keysEnv([])) === '{}', 'llama-server gets one key per lent card');
}

// --- The switch ---
{
  const base = { share: { borrow: { bobs: [{ name: 'Go', address: '100.102.0.7:7777', passcode: 'secret-22' }] } } };
  ok(shareView(base).scutSeal === true && sealOn(base), 'Seal SCUT packets is on unless switched off (the owner\'s call)');
  const off = cleanSharePatch(base, { scutSeal: false }).share;
  ok(off.scutSeal === false && shareView({ share: off }).scutSeal === false && !sealOn({ share: off }), 'it switches off');
  ok(cleanSharePatch({ share: off }, { scut: true }).share.scutSeal === false && cleanSharePatch({ share: off }, { homeNet: false }).share.scutSeal === false, 'other changes keep it as it was');
  ok(cleanSharePatch({ share: off }, { scutSeal: true }).share.scutSeal === true, 'and back on');
  ok(!scutSealOn({ share: { scut: false } }) && scutSealOn({ share: { scut: true } }) && !scutSealOn({ share: { scut: true, scutSeal: false } }), 'it only matters while SCUT is on');
}

// --- Lender and borrower together, with a fake card server and a fake Bob-Net ---
{
  const spawned = [];
  const spawnFn = (exe, args, opts = {}) => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.exitCode = null; c.kill = () => { c.exitCode = 0; c.emit('exit', 0); }; spawned.push({ args, env: opts.env || {} }); setTimeout(() => c.stderr.emit('data', 'Starting RPC server\n'), 2); return c; };
  const share = { lendCard: true, scut: true, spread: 'toobig', borrow: { bobs: [] } };
  const lendCfg = { dataDir: box('l2'), remote: { enabled: true, passcode: 'lender-code-1' }, share };
  const lender = new CardLender(lendCfg, { spawnFn, tool: () => ({ found: true, path: '/be/ggml-rpc-server' }), ips: () => ['100.101.1.2'], home: () => [], gate: async (g) => ({ ...g, udp: true, close() {} }), env: { PATH: '/bin' } });
  const bobNet = { bobs: () => [{ name: 'Desk', address: '100.101.1.2:7777' }], call: async (bob, p, o) => { const r = await lendCardRoute(lender, { socket: { localAddress: '100.101.1.2', remoteAddress: '::ffff:100.102.0.7' } }, JSON.parse(JSON.stringify(o.body))); return { ok: true, json: async () => r.body }; } };
  const borCfg = { dataDir: box('b2'), gpuVramGB: 16, share: { ...share } };
  const borrower = new CardBorrower(borCfg, bobNet, { home: () => [] });
  const at = await borrower.open({ sizeGB: 200 });
  const env = borrower.sealEnv();
  ok(at.length === 1 && env.GGML_RPC_SCUT_KEYS === `${at[0]}=${spawned[0].env.GGML_RPC_SCUT_KEY}`, 'a lend: the card server and llama-server get the same key, for that card\'s address');
  ok(KEY_RE.test(spawned[0].env.GGML_RPC_SCUT_KEY) && spawned[0].env.GGML_RPC_SCUT === '1' && spawned[0].env.PATH === '/bin', 'the card server keeps SCUT and its own surroundings');
  ok(linkKey(borCfg, '100.101.1.2') && linkKey(borCfg, '100.101.1.2') === linkKey(lendCfg, '100.102.0.7'), 'a pair from before sealing got its key at the first lend');
  const first = (await lendCardRoute(lender, { socket: { localAddress: '100.101.1.2', remoteAddress: '100.102.0.7' } }, { action: 'open', seal: sealAsk(borCfg, '100.101.1.2:7777') })).body;
  ok(spawned.length === 1 && lendKey(linkKey(borCfg, '100.101.1.2'), first.seal?.salt) === spawned[0].env.GGML_RPC_SCUT_KEY, 'asked again while the card server runs: the same salt, so the same key');
  borrower.close(); lender.close();
  await borrower.open({ sizeGB: 200 });
  ok(spawned.length === 2 && borrower.sealEnv().GGML_RPC_SCUT_KEYS !== env.GGML_RPC_SCUT_KEYS && borrower.sealEnv().GGML_RPC_SCUT_KEYS === `${at[0]}=${spawned[1].env.GGML_RPC_SCUT_KEY}`, 'a new lend: a fresh key, still the same on both sides');
  borrower.close(); lender.close();
  lendCfg.share = { ...share, scutSeal: false };
  await borrower.open({ sizeGB: 200 });
  ok(!('GGML_RPC_SCUT_KEY' in spawned[2].env) && borrower.sealEnv().GGML_RPC_SCUT_KEYS === `${at[0]}=off`, 'the lender has it off: no SCUT with him while this Bob seals', JSON.stringify([spawned.length, borrower.sealEnv()]));
  borrower.close(); lender.close();
  lendCfg.share = share; borCfg.share = { ...share, scutSeal: false };
  const sent = [];
  const peek = { bobs: bobNet.bobs, call: async (b, p, o) => { sent.push(o.body); return bobNet.call(b, p, o); } };
  const b3 = new CardBorrower(borCfg, peek, { home: () => [] });
  await b3.open({ sizeGB: 200 });
  ok(!('seal' in sent[0]) && JSON.stringify(b3.sealEnv()) === '{}' && KEY_RE.test(spawned[3].env.GGML_RPC_SCUT_KEY), 'the borrower has it off: it asks for nothing, and the sealing lender\'s engine won\'t open an unsealed link');
  b3.close(); lender.close();
}

// --- Pairing makes the key ---
{
  const mk = (name, ip) => {
    const file = path.join(tmp, `${name}.json`); fs.writeFileSync(file, '{}');
    const cfg = { port: 7777, configFile: file, dataDir: box(`pair-${name}`), remote: { enabled: true, passcode: `${name}-code-1` }, share: {} };
    return { ip, cfg, events: [], p: null };
  };
  const A = mk('desk', '100.101.2.23'), B = mk('handheld', '100.101.1.2');
  for (const X of [A, B]) X.p = new Pairing(X.cfg, { broadcast: (e) => X.events.push(e), ownAddresses: () => [`${X.ip}:7777`], pollMs: 5, peers: async () => null });
  const net = (from) => async (url, opt = {}) => {
    const u = new URL(url), to = [A, B].find((x) => x.ip === u.hostname), b = opt.body ? JSON.parse(opt.body) : {};
    const reply = (status, j) => ({ ok: status < 300, status, json: async () => j });
    if (u.pathname === '/api/pair/ask') { const r = to.p.ask(b, from.ip); return reply(r.code, r.error ? { error: r.error } : { id: r.id }); }
    if (u.pathname === '/api/pair/status') return reply(200, to.p.status(b.id, from.ip));
    if (u.pathname === '/api/pair/finish') return reply(200, to.p.finish(b, from.ip));
    return reply(404, {});
  };
  A.p.fetch = net(A); B.p.fetch = net(B);
  await A.p.pairWith(B.ip);
  B.p.answer(B.events.find((e) => e.type === 'pair-ask').id, true);
  const t = Date.now(); while (A.p.outgoing.get(`${B.ip}:7777`)?.state !== 'paired' && Date.now() - t < 2000) await new Promise((r) => setTimeout(r, 5));
  const ka = linkKey(A.cfg, B.ip), kb = linkKey(B.cfg, A.ip);
  ok(KEY_RE.test(ka) && ka === kb, 'pairing: both Bobs keep the same link key');
  ok(!fs.readFileSync(A.cfg.configFile, 'utf8').includes(ka) && !fs.readFileSync(B.cfg.configFile, 'utf8').includes(ka), 'pairing: the key isn\'t in either config.json');
  ok(!JSON.stringify(A.events.concat(B.events)).includes(ka), 'pairing: the key never goes to the page');
}

// --- The engine patch, Settings, Help ---
{
  const patch = read('engine', 'patches', '0006-scut-seal.patch'), readme = read('engine', 'README.md');
  ok(/OF_SEAL/.test(patch) && /VERSION_SEALED = 2/.test(patch) && /scut_seal::open/.test(patch) && /replay_window/.test(patch), 'engine: sealed offers, a check on every datagram, replays refused');
  ok(/if \(!unseal\(buf\.data\(\), n\)\) continue;[^\n]*\n\s*n_recv\+\+/.test(patch), 'engine: a datagram is checked before anything in it is used');
  ok(/theirs_sealed != b->have_key/.test(patch) && /hex == "off"/.test(patch), 'engine: both sealed or neither, and "off" means no SCUT with that card');
  ok(/RFC 8439/.test(patch) && !/#include <openssl/.test(patch), 'engine: ChaCha20-Poly1305 written from RFC 8439, no outside library to ship');
  ok(/0006-scut-seal\.patch/.test(readme), 'engine README lists 0006');
  const ui = read('public', 'share-brains.js');
  ok(/data-share-scutseal/.test(ui) && /Seal SCUT packets/.test(ui) && /on unless you turn it off/.test(ui) && /v\.scutSeal !== false \? 'checked'/.test(ui), 'Settings: Seal SCUT packets, ticked unless switched off, always shown');
  const help = read('public', 'help-content.js');
  ok(/id: 'faq-scut-seal'/.test(help) && /<dt>Sealed SCUT packets<\/dt>/.test(help) && /go\('faq-scut-seal'/.test(help), 'Help: an FAQ, a glossary entry and a link from the SCUT FAQ');
  ok(/Seal SCUT packets/.test(read('docs', 'SETTINGS-INVENTORY.md')), 'settings inventory has it');
  ok(/\.\.\.\(this\.spread\?\.sealEnv\?\.\(\) \|\| \{\}\)/.test(read('src', 'llamacpp.js')), 'llama-server gets the lent cards\' keys');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
