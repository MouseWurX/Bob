// Nov 17 (a desktop and a laptop): the brain line kept saying "borrowing" after the lending Bob took his card back and
// the brain loaded here alone. CardBorrower (src/share-card.js) now counts only cards in use, and an open() that was
// still asking when the brain stopped hands its cards straight back. Nothing here touches the network.
import { CardBorrower } from '../src/share-card.js';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
