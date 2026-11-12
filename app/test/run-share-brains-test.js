// Share brains with my other Bobs (src/share-brains.js): addresses, settings, when to borrow, lending rules,
// and a real round trip through a pretend lender over HTTP (login, hello, streamed reply, tool calls, fallbacks).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { cleanAddress, cleanSharePatch, saveShare, shareView, wantsBorrow, lendRefusal, cleanLendRequest, lendChat, Lenders } from '../src/share-brains.js';
import { openCopy } from '../src/secret-box.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };

// ---------- addresses: Tailscale only ----------
check('Tailscale addresses get a port', cleanAddress('100.101.2.3') === '100.101.2.3:7777' && cleanAddress('http://Phone.tail1.ts.net:8080/') === 'phone.tail1.ts.net:8080');
check('other addresses are refused', cleanAddress(['192', '168', '1', '5'].join('.') + ':7777') === null && cleanAddress('example.com') === null && cleanAddress('evil.ts.net.example.com') === null && cleanAddress('100.200.1.1') === null && cleanAddress('100.101.2.3:99999') === null);

// ---------- settings ----------
const base = { remote: { enabled: true, passcode: '12345678' }, share: {} };
check('borrow needs a Bob first', /Add one/.test(cleanSharePatch(base, { borrow: true }).error || ''));
check('a new Bob needs its passcode', /passcode/.test(cleanSharePatch(base, { addBob: { address: '100.101.2.3' } }).error || ''));
check('a non-Tailscale Bob is refused', /Tailscale/.test(cleanSharePatch(base, { addBob: { address: ['10', '0', '0', '4'].join('.'), passcode: '12345678' } }).error || ''));
const one = cleanSharePatch(base, { addBob: { name: 'Phone', address: '100.101.2.3', passcode: '87654321' }, borrow: true }).share;
check('adding a Bob and switching borrow on', one?.borrow.on === true && one.borrow.bobs[0].address === '100.101.2.3:7777' && one.borrow.when === 'gaming');
const again = cleanSharePatch({ ...base, share: one }, { addBob: { name: 'Phone 2', address: '100.101.2.3' } }).share;
check('re-adding without a passcode keeps the old one', again.borrow.bobs.length === 1 && again.borrow.bobs[0].passcode === '87654321' && again.borrow.bobs[0].name === 'Phone 2');
check('Settings never sees a passcode', !JSON.stringify(shareView({ ...base, share: one })).includes('87654321') && shareView({ ...base, share: one }).borrow.bobs[0].passcodeSet === true);
check('lend and borrow start off', shareView({}).lend === false && shareView({}).borrow.on === false);
const two = cleanSharePatch({ ...base, share: one }, { addBob: { name: 'Laptop', address: '100.88.0.9:7777', passcode: 'abcdefgh' } }).share;
const ordered = cleanSharePatch({ ...base, share: two }, { order: ['100.88.0.9:7777', '100.101.2.3:7777'] }).share;
check('order is kept', ordered.borrow.bobs[0].name === 'Laptop');
check('remove', cleanSharePatch({ ...base, share: two }, { removeBob: '100.88.0.9' }).share.borrow.bobs.length === 1);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-share-'));
const file = path.join(dir, 'config.json');
fs.writeFileSync(file, JSON.stringify({ port: 7777, other: 1 }));
const sc = { configFile: file };
saveShare(sc, one);
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
check('saved in config.json, the passcode locked (🔐 Locked secrets), other keys untouched', raw.share.borrow.bobs[0].passcode.startsWith('bobsecret1:') && !JSON.stringify(raw).includes('87654321') && openCopy(raw).share.borrow.bobs[0].passcode === '87654321' && raw.other === 1 && sc.share === one);
fs.rmSync(dir, { recursive: true, force: true });

// ---------- when to borrow ----------
const on = (when) => ({ share: { borrow: { on: true, when, bobs: [{ address: '100.101.2.3:7777' }] } } });
check('gaming: borrowed while Gaming', wantsBorrow(on('gaming'), { session: 'light' }) && !wantsBorrow(on('gaming'), { session: 'normal' }) && !wantsBorrow(on('gaming'), { session: 'normal', busy: true }));
check('busy: Gaming or busy', wantsBorrow(on('busy'), { session: 'light' }) && wantsBorrow(on('busy'), { session: 'normal', busy: true }) && !wantsBorrow(on('busy'), { session: 'normal' }));
check('always: every quick reply', wantsBorrow(on('always'), { session: 'normal' }));
check('never Medium and up, never pictures', !wantsBorrow(on('always'), { session: 'normal', job: { effort: 'medium' } }) && !wantsBorrow(on('always'), { session: 'light', pics: [{}] }));
check('off means off', !wantsBorrow({ share: { borrow: { on: false, when: 'always', bobs: [{}] } } }, { session: 'light' }) && !wantsBorrow({}, { session: 'light' }));

// ---------- lending rules ----------
const deps = { lifeMs: 100, currentSession: (c) => ({ id: c.session || 'normal' }), quickBrain: () => ({ model: 'gemma4-e4b', cpu: false, ctx: 8192 }) };
const lb = (extra = {}) => ({ cfg: { share: { lend: true }, remote: { enabled: true, passcode: '12345678' }, ...extra.cfg }, turns: new Map(), queue: [], ...extra.b });
check('lends when idle', lendRefusal(lb(), deps) === '');
check('not without the phone door', lendRefusal(lb({ cfg: { remote: { enabled: false } } }), deps) === 'off');
check('never while gaming', lendRefusal(lb({ cfg: { session: 'light' } }), deps) === 'gaming');
check('not while busy', lendRefusal(lb({ b: { turns: new Map([['talk', 1]]) } }), deps) === 'busy' && lendRefusal(lb({ b: { queue: [{ state: 'working' }] } }), deps) === 'busy');
check('one lend at a time', lendRefusal(lb({ b: { lending: { since: 1 } } }), deps) === 'busy');
check('lend off by default', lendRefusal({ cfg: { remote: { enabled: true, passcode: '12345678' } }, turns: new Map(), queue: [] }, deps) === 'off');
const cl = cleanLendRequest({ messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'hi', images: ['AAAA'] }, { role: 'evil', content: 'x' }], tools: [{ type: 'function', function: { name: 'list_files' } }, { type: 'function', function: { name: 'bad name!' } }] });
check('lent requests carry no pictures or odd roles', cl.messages.length === 2 && !('images' in cl.messages[1]) && cl.tools.length === 1);
check('a lent request needs a question', cleanLendRequest({ messages: [{ role: 'system', content: 's' }] }).error === 'no question');

// ---------- a pretend lender: the real lendChat behind a door like server.js's ----------
const logs = [];
let settleOpts; let mode = 'ok', settled = 0, hung = 0, aborted = 0, released = 0;
const lender = {
  cfg: { share: { lend: true }, remote: { enabled: true, passcode: 'lend-1234' } }, turns: new Map(), queue: [], lending: null,
  log: (k, t) => logs.push(`${k}: ${t}`), broadcast: () => {}, settle: async (o) => { settled++; settleOpts = o; }, gate: { done: (sig) => { if (sig) released++; } },
  brainLabel: () => 'Gemma 4 E2B', fitCtx: async (m, c) => c,
  ensureModel: async (m, _p, signal) => { if (mode === 'cold' || mode === 'forever') await new Promise((r) => { const t = setTimeout(r, mode === 'cold' ? 500 : 5000); signal?.addEventListener('abort', () => { clearTimeout(t); r(); }); }); return m; },
  chatSafe: async ({ messages, tools, onToken, signal }) => {
    if (mode === 'hang') { hung++; await new Promise((r, j) => { const t = setTimeout(r, 5000); signal?.addEventListener('abort', () => { clearTimeout(t); aborted++; j(new Error('aborted')); }); }); }
    if (mode === 'slow') await new Promise((r) => setTimeout(r, 400));
    if (mode === 'long') { for (const w of ['a', 'b', 'c', 'd', 'e']) { onToken(w); await new Promise((r) => setTimeout(r, 120)); } return { role: 'assistant', content: 'abcde' }; }
    if (mode === 'tool') return { role: 'assistant', content: '', tool_calls: [{ function: { name: tools[0].function.name, arguments: { path: 'C:/x' } } }] };
    for (const w of ['Hello ', 'from ', 'the phone']) onToken(w);
    return { role: 'assistant', content: `Hello from the phone (${messages.at(-1).content})` };
  }
};
const COOKIE = 'bob_auth=abc123';
const srv = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/login') {
    let s = ''; for await (const c of req) s += c;
    if (new URLSearchParams(s).get('code') === 'lend-1234') { res.writeHead(303, { location: '/', 'set-cookie': `${COOKIE}; HttpOnly` }); return res.end(); }
    res.writeHead(401); return res.end();
  }
  if (req.headers.cookie !== COOKIE) { res.writeHead(401); return res.end('login'); }
  if (req.url === '/api/lend/hello') { const why = lendRefusal(lender, deps); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ lend: why !== 'off', busy: why || undefined, brain: 'Gemma 4 E2B', device: 'phone' })); }
  if (req.url === '/api/lend/chat') {
    if (req.headers['x-bob'] !== '1') { res.writeHead(403); return res.end(); }
    let s = ''; for await (const c of req) s += c;
    return lendChat(lender, req, res, JSON.parse(s), deps);
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
// The lender lives at a Tailscale address in real life; the test points fetch at localhost instead.
const viaLocal = (url, o) => fetch(String(url).replace(/^http:\/\/100\.101\.2\.3:\d+/, `http://127.0.0.1:${port}`), o);
const bob = { name: 'Phone', address: '100.101.2.3:7777', passcode: 'lend-1234' };
const L = new Lenders({ share: { borrow: { on: true, when: 'gaming', bobs: [bob] } } }, { fetchFn: viaLocal });

const picked = await L.pick();
check('logs in and says hello', picked?.name === 'Phone' && picked.brain === 'Gemma 4 E2B' && L.cookies.get(bob.address) === COOKIE);
check('likely() after a good hello', L.likely() === true);
check('SUDDAR: a good hello is timed, there and back', Number.isFinite(L.state.get(bob.address).ms) && L.state.get(bob.address).ms >= 0 && L.state.get(bob.address).ms < 5000);
let streamed = '';
const r1 = await L.chat(picked, { messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi', images: ['x'] }], tools: [], onToken: (t) => { streamed += t; } });
check('the reply streams back', streamed === 'Hello from the phone' && r1.content === 'Hello from the phone (hi)' && !r1.tool_calls);
check('the lender keeps no words in his logbook', logs.length === 1 && !logs[0].includes('hi') && /thought a reply/.test(logs[0]));
check('the lender goes back to light after', await new Promise((r) => setTimeout(() => r(settled === 1), 20)));
check('1.5.196: after a lend he does not load his own quick brain back (that waits until his owner types)', settleOpts?.noWake === true);
check('the lender is free again', lender.lending === null);
check('the lender gives the graphics card back after lending', released === 1, `released ${released}`);
mode = 'tool';
const r2 = await L.chat(picked, { messages: [{ role: 'user', content: 'list my files' }], tools: [{ type: 'function', function: { name: 'list_files', parameters: {} } }] });
check('tool calls come back to run here', r2.tool_calls?.[0]?.function?.name === 'list_files' && r2.tool_calls[0].function.arguments.path === 'C:/x');
mode = 'ok';
lender.turns.set('talk', 1);
let threw = '';
try { await L.chat(picked, { messages: [{ role: 'user', content: 'hi' }] }); } catch (e) { threw = e.message; }
check('a busy lender says no, and is skipped for a while', /said no \(busy\)/.test(threw) && L.state.get(bob.address).ok === false && L.likely() === false);
check('pick() skips a Bob marked down', (await L.pick()) === null);
lender.turns.clear();
lender.cfg.session = 'light';
check('a gaming lender says no on hello', (await L.hello(bob, { force: true })).why === 'gaming');
delete lender.cfg.session;
const wrong = new Lenders({ share: { borrow: { on: true, bobs: [{ ...bob, passcode: 'wrong-pass' }] } } }, { fetchFn: viaLocal });
check('a wrong passcode is reported plainly', (await wrong.hello(wrong.bobs()[0])).why === 'passcode not accepted');
const gone = new Lenders({ share: { borrow: { on: true, bobs: [{ name: 'Laptop', address: '100.88.0.9:7777', passcode: 'x'.repeat(8) }] } } }, { fetchFn: async () => { throw new TypeError('fetch failed'); } });
check('an unreachable Bob is reported plainly', (await gone.hello(gone.bobs()[0])).why === 'not reachable' && (await gone.pick()) === null);

// A reply that takes longer in total than the first-word limit, with words still coming, isn't cut off.
mode = 'long';
const quick = new Lenders({ share: { borrow: { on: true, bobs: [bob] } } }, { fetchFn: viaLocal, firstWordMs: 300, quietMs: 300 });
let long = '';
try { long = (await quick.chat(bob, { messages: [{ role: 'user', content: 'hi' }] })).content; } catch (e) { long = e.message; }
check('a long streamed reply is not cut off', long === 'abcde', long);
mode = 'slow';
let slow = '';
try { await new Lenders({ share: { borrow: { on: true, bobs: [bob] } } }, { fetchFn: viaLocal, firstWordMs: 150, quietMs: 150, firstWordMaxMs: 250 }).chat(bob, { messages: [{ role: 'user', content: 'hi' }] }); } catch (e) { slow = e.message; }
check('no first word in time: too slow', slow === 'too slow', slow);
await new Promise((r) => setTimeout(r, 500));

// 1.5.92, found on real devices: the asker giving up must stop the lender, or he stays "busy" for everyone.
mode = 'hang'; hung = 0; aborted = 0;
let gaveUp = '';
try { await new Lenders({ share: { borrow: { on: true, bobs: [bob] } } }, { fetchFn: viaLocal, firstWordMs: 150, quietMs: 150, firstWordMaxMs: 300 }).chat(bob, { messages: [{ role: 'user', content: 'hi' }] }); } catch (e) { gaveUp = e.message; }
await new Promise((r) => setTimeout(r, 150));
check('asker gives up on a stuck lender', gaveUp === 'too slow', gaveUp);
check('the lender stops thinking when the asker gives up', hung === 1 && aborted === 1, `hung ${hung} aborted ${aborted}`);
check('and is free to lend again', lender.lending === null);
// A cold lender loading his brain says so, and isn't dropped at the first-word limit.
mode = 'cold';
let cold = '';
try { cold = (await new Lenders({ share: { borrow: { on: true, bobs: [bob] } } }, { fetchFn: viaLocal, firstWordMs: 250, quietMs: 250 }).chat(bob, { messages: [{ role: 'user', content: 'hi' }] })).content; } catch (e) { cold = e.message; }
check('a cold lender that says "still loading" gets his turn', cold === 'Hello from the phone (hi)', cold);
// But "still loading" can't hold a reply forever.
mode = 'forever';
let forever = '';
try { await new Lenders({ share: { borrow: { on: true, bobs: [bob] } } }, { fetchFn: viaLocal, firstWordMs: 250, quietMs: 250, firstWordMaxMs: 600 }).chat(bob, { messages: [{ role: 'user', content: 'hi' }] }); } catch (e) { forever = e.message; }
check('no first word by the hard limit: too slow, even while loading', forever === 'too slow', forever);
await new Promise((r) => setTimeout(r, 200));
check('and that lender stopped loading too', lender.lending === null);

// SCUT, Bob's fast link for Bigger Bobs: off unless switched on, with a speed cap of 50, 100, 300 or 400 Mbit/s.
{
  check('SCUT is off unless switched on, cap 100', shareView(base).scut === false && shareView(base).scutMbps === 100);
  const on = cleanSharePatch(base, { scut: true, scutMbps: 300 });
  check('SCUT switches on, with its cap', on.share.scut === true && on.share.scutMbps === 300);
  check('a cap that isn\'t on the list is refused', Boolean(cleanSharePatch(base, { scutMbps: 1000 }).error));
  check('other changes keep SCUT as it was', cleanSharePatch({ ...base, share: on.share }, { homeNet: false }).share.scut === true);
}

// 1.5.196 (Tailscale test: Borrow a brain switched itself off on the Go). Every other change keeps it on.
{
  const on = { ...base, share: cleanSharePatch(base, { addBob: { name: 'Go', address: '100.101.2.9', passcode: '87654321' }, borrow: true }).share };
  for (const patch of [{ mode: 'bigger' }, { mode: 'more' }, { lendCard: true }, { lendCard: false }, { spread: 'big' }, { homeNet: false }, { scut: true }, { scutMbps: 50 }, { lend: true }, { takeJobs: true }, { passAlong: true }, { lendChecks: true }, { askChecks: true }, { sendJobs: true }, { when: 'always' }, { addBob: { name: 'Pi', address: '100.101.2.10', passcode: '12345678' } }, { removeBob: '100.101.2.10' }, { order: ['100.101.2.9:7777'] }, { check: true }]) {
    const out = cleanSharePatch(on, patch);
    check(`Borrow a brain stays on through ${Object.keys(patch).join(', ')}`, !out.error && out.share.borrow.on === true, out.error || '');
  }
  check('only the Borrow switch turns it off', cleanSharePatch(on, { borrow: false }).share.borrow.on === false);
}

srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
