// Nov 17 (a desktop and a laptop): the brain line kept saying "borrowing" after the lending Bob took his card back and
// the brain loaded here alone. CardBorrower (src/share-card.js) now counts only cards in use, and an open() that was
// still asking when the brain stopped hands its cards straight back. Nothing here touches the network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CardBorrower, engineStamp, engineMismatch, lendCardRoute } from '../src/share-card.js';

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

const cfg = { gpuVramGB: 16, share: { spread: 'toobig', borrow: { on: true, bobs: [] } } };
const desk = { name: 'Desk', address: '100.101.1.2:7777' };
const sent = [];
let hold = null; // when set, the next "open" waits for it
const lenders = {
  bobs: () => [desk],
  call: async (bob, p, o) => {
    sent.push(o.body.action);
    if (o.body.action === 'open' && hold) await hold;
    const body = o.body.action === 'open' ? { ok: true, port: 50052, host: '100.101.1.2', via: 'tailscale' } : { ok: true };
    return { ok: true, status: 200, json: async () => body };
  }
};

const b = new CardBorrower(cfg, lenders, { home: () => [] });
const got = await b.open({ sizeGB: 4000 });
check('a lend in use shows as borrowing', got.length === 1 && b.view().join() === 'Desk' && b.inUse().length === 1);

b.lost(b.using[0], 'a game started');
check('a card taken back is not counted, even before the reload', b.view().length === 0 && b.inUse().length === 0);

b.close();
check('closing lets every lend go', b.using.length === 0 && sent.includes('close'));

// The race: the brain stops (close) while the Bobs are still answering open.
let release; hold = new Promise((r) => { release = r; });
sent.length = 0;
const b2 = new CardBorrower(cfg, lenders, { home: () => [] }); // a Bob not marked down
const slow = b2.open({ sizeGB: 4000 });
await new Promise((r) => setImmediate(r));
check('it was asking', sent.includes('open'));
b2.close();
release();
const late = await slow;
await new Promise((r) => setImmediate(r));
check('an open answered after the brain stopped gives nothing back', late.length === 0 && b2.using.length === 0 && b2.view().length === 0);
check('and hands the lent card straight back', sent.lastIndexOf('close') > sent.indexOf('open'));
check('no watch timer is left running', b2.timer === null);
hold = null;

// Nov 18 (a 120B load): a Bob on an older engine lent its card and the brain crashed. Engines are compared first.
{
  const BE = 'brain-engine-12b12359';
  const tryWith = async (reply, mine = BE) => {
    const said = []; const logs = [];
    const l = { bobs: () => [desk], call: async (bob, p, o) => { said.push(o.body); const body = o.body.action === 'open' ? { ok: true, port: 50052, host: '100.101.1.2', via: 'tailscale', ...reply } : { ok: true }; return { ok: true, status: 200, json: async () => body }; } };
    const bb = new CardBorrower(cfg, l, { home: () => [], engine: () => mine, log: (k, t) => logs.push(t) });
    const got = await bb.open({ sizeGB: 4000 }); bb.close();
    return { got, said, logs: logs.join(' ') };
  };
  const same = await tryWith({ engine: BE });
  check('engines match: the card is used, and the asking Bob said which engine it runs', same.got.length === 1 && same.said[0].engine === BE);
  const old = await tryWith({});
  check('an older Bob that doesn\'t say: not used, handed straight back, and the logbook says why', old.got.length === 0 && old.said.some((b) => b.action === 'close') && /older Bob that can't say which engine/.test(old.logs), old.logs);
  const other = await tryWith({ engine: 'brain-engine-8b12359' });
  check('a different engine: not used, and named plainly', other.got.length === 0 && /its engine is brain-engine-8b12359 and mine is brain-engine-12b12359/.test(other.logs), other.logs);
  const unknown = await tryWith({ engine: '' });
  check('an engine set up by hand (no marker) isn\'t blocked', unknown.got.length === 1);
  const here = await tryWith({}, '');
  check('no marker here: no check', here.got.length === 1);
  check('the words', engineMismatch('a', 'a') === '' && engineMismatch('', 'b') === '' && /update/.test(engineMismatch('a', null)));
  // The lending side says no before starting anything.
  let opened = false;
  const lender = { engine: () => 'brain-engine-8b12359', open: async () => { opened = true; return { ok: true, port: 50052 }; }, setPowers: () => {}, log: () => {} };
  const no = await lendCardRoute(lender, { socket: {} }, { action: 'open', from: 'Desk', engine: BE });
  check('the lender refuses a different engine before opening anything', no.body.ok === false && no.body.why === 'engine' && no.body.engine === 'brain-engine-8b12359' && !opened);
  const yes = await lendCardRoute(lender, { socket: {} }, { action: 'open', from: 'Desk', engine: 'brain-engine-8b12359' });
  check('and lends to the same engine, saying which it is', yes.body.ok === true && yes.body.engine === 'brain-engine-8b12359' && opened);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-stamp-'));
  fs.writeFileSync(path.join(tmp, 'bob-brainengine.json'), JSON.stringify({ version: BE }));
  check('the engine is read from its folder\'s marker', engineStamp(tmp) === BE && engineStamp(path.join(tmp, 'none')) === '');
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
