// #30: reviews over Bob-Net. When the reviewer has no room beside the main brain, a paired Bob with a good enough Review
// brain (and "Take jobs from my other Bobs" on) checks the work; failing that, Bob swaps as before. Real lendChat behind
// a pretend door, the hello fields, the pick (quality floor, a Bob that couldn't do one), and Brain.reviewAway.
import http from 'node:http';
import { cleanAbilities, helloFor, reviewRefusal, lendChat, Lenders, lendRefusal } from '../src/share-brains.js';
import { Brain } from '../src/brain.js';
import { runMoot } from '../src/moot.js';
import fs from 'node:fs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };
const currentSession = (cfg) => ({ id: cfg.session || 'normal' });

// ---------- what a Bob says about his Review brain ----------
const ab = cleanAbilities({ review: { brain: 'gpt-oss 20B', ctx: 32768, gb: 12.9 } });
check('the hello carries his Review brain, its room and size', ab.review?.brain === 'gpt-oss 20B' && ab.review.ctx === 32768 && ab.review.gb === 12.9);
check('no Review brain, no review field', !cleanAbilities({}).review && !cleanAbilities({ review: { ctx: 5 } }).review);
const hb = { cfg: { share: { takeJobs: true }, remote: { enabled: true, passcode: '12345678' } }, queue: [] };
const h = helloFor(hb, { why: '', quick: null, can: {}, version: '1', label: (m) => `L:${m}`, webOn: false, bigBrain: false, review: { model: 'gpt-oss:20b', ctx: 32768, gb: 12.9 } });
check('helloFor lists the Review brain by its label', h.review?.brain === 'L:gpt-oss:20b' && h.review.gb === 12.9);
check('helloFor without one leaves it out', !('review' in helloFor(hb, { why: '', quick: null, can: {}, version: '1', label: (m) => m, webOn: false, bigBrain: false })));

// ---------- when he'll do a review ----------
const rb = (over = {}) => ({ cfg: { share: { takeJobs: true }, remote: { enabled: true, passcode: '12345678' }, ...over }, turns: new Map(), queue: [], lending: null });
const rdeps = { currentSession, reviewBrain: () => ({ model: 'gpt-oss:20b', ctx: 32768 }) };
check('reviews need "Take jobs from my other Bobs"', reviewRefusal(rb({ share: {} }), rdeps) === 'off');
check('and the door open', reviewRefusal(rb({ remote: { enabled: false } }), rdeps) === 'off');
check('never while gaming', reviewRefusal(rb({ session: 'light' }), rdeps) === 'gaming');
check('not while busy with his own work', reviewRefusal({ ...rb(), turns: new Map([['t', 1]]) }, rdeps) === 'busy');
check('not without a Review brain', reviewRefusal(rb(), { currentSession, reviewBrain: () => null }) === 'no brain');
check('otherwise yes', reviewRefusal(rb(), rdeps) === '');
check('"Lend my brain" off doesn\'t stop reviews, and reviews don\'t switch lending on', lendRefusal(rb(), { currentSession, quickBrain: () => ({}) }) === 'off' && reviewRefusal(rb(), rdeps) === '');

// ---------- a pretend Bob that reviews (the real lendChat) ----------
const seen = [];
let settled = 0, failNext = false;
const lender = {
  ...rb(), log: () => {}, broadcast: () => {}, settle: async () => { settled++; }, gate: { done: () => {} },
  brainLabel: (m) => m, fitCtx: async (m, c) => c,
  ensureModel: async (m, _p, _s, who) => { seen.push(`load ${m} as ${who}`); return m; },
  chatSafe: async ({ model, think, messages }) => {
    if (failNext) { failNext = false; throw new Error('out of memory'); }
    seen.push(`think ${model} ${think}`);
    return { role: 'assistant', content: `Checked: ${messages.at(-1).content}` };
  }
};
const deps = { currentSession, quickBrain: () => ({ model: 'gemma4:e2b', ctx: 8192 }), reviewBrain: () => ({ model: 'gpt-oss:20b', ctx: 32768, think: true, gb: 12.9 }), reviewHoldMs: 80 };
const COOKIE = 'bob_auth=abc';
const srv = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/login') { res.writeHead(303, { location: '/', 'set-cookie': `${COOKIE}; HttpOnly` }); return res.end(); }
  if (req.headers.cookie !== COOKIE) { res.writeHead(401); return res.end(); }
  if (req.url === '/api/lend/hello') {
    const why = lendRefusal(lender, deps);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(helloFor(lender, { why, quick: null, can: {}, version: 't', label: (m) => m, webOn: false, bigBrain: false, review: reviewRefusal(lender, deps) ? null : deps.reviewBrain() })));
  }
  if (req.url === '/api/lend/chat') { let s = ''; for await (const c of req) s += c; return lendChat(lender, req, res, JSON.parse(s), deps); }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const viaLocal = (url, o) => fetch(String(url).replace(/^http:\/\/100\.\d+\.\d+\.\d+:\d+/, `http://127.0.0.1:${port}`), o);
const go = { name: 'Handheld', address: '100.101.2.9:7777', passcode: 'x' };
const L = new Lenders({ share: { borrow: { on: true, bobs: [go] } } }, { fetchFn: viaLocal });

check('a Review brain too small for the work is passed over', (await L.pickForReview({ minGB: 14 })) === null);
L.release(go.address);
const pick = await L.pickForReview({ minGB: 9.6 });
check('a good enough Review brain is picked, with "Lend my brain" off there', pick?.name === 'Handheld' && pick.brain === 'gpt-oss:20b' && pick.gb === 12.9);
const r1 = await L.chat(pick, { messages: [{ role: 'user', content: 'the plan' }], tools: [], want: 'review' });
check('the review is thought on his Review brain, thinking as it likes', r1.content === 'Checked: the plan' && seen.includes('load gpt-oss:20b as reviewer') && seen.includes('think gpt-oss:20b true'), seen.join(' | '));
check('his Review brain stays loaded for the next step', settled === 0);
const r2 = await L.chat(pick, { messages: [{ role: 'user', content: 'step two' }], tools: [], want: 'review' });
check('the next step comes in before it goes', r2.content === 'Checked: step two' && settled === 0);
await new Promise((r) => setTimeout(r, 160));
check('then he goes back to light', settled === 1, String(settled));
seen.length = 0;
let plainNo = '';
try { await L.chat(pick, { messages: [{ role: 'user', content: 'hi' }], tools: [] }); } catch (e) { plainNo = e.message; }
check('a plain lent reply still needs "Lend my brain" there', /said no \(off\)/.test(plainNo));
lender.cfg.share.lend = true; L.release(go.address);
await L.chat(pick, { messages: [{ role: 'user', content: 'hi' }], tools: [] });
check('a plain lent reply still uses the quick brain', seen.includes('load gemma4:e2b as bob') && seen.includes('think gemma4:e2b false'), seen.join(' | '));
failNext = true;
let threw = '';
try { await L.chat(pick, { messages: [{ role: 'user', content: 'x' }], tools: [], want: 'review' }); } catch (e) { threw = e.message; }
check('a review that fails says so to the asking Bob', /out of memory/.test(threw));
L.noteReview(pick);
L.release(go.address);
check('a Bob that couldn\'t do a review isn\'t asked again for a while', (await L.pickForReview({ minGB: 1 })) === null);
await new Promise((r) => setTimeout(r, 120));
srv.close();

// ---------- Brain.reviewAway: when the asking Bob looks for one ----------
const said = [];
const fakeBrain = (over = {}, pickRes = { name: 'Handheld', brain: 'gpt-oss:20b' }) => ({
  cfg: { mootBeside: true, share: { borrow: { on: true, bobs: [go] } }, ...over },
  engine: { current: 'qwen3.6-35b-a3b', resolve: () => null },
  lenders: { pickForReview: async (o) => { said.push(`min ${o.minGB}`); return pickRes; } },
  log: () => {}, reviewFloor: Brain.prototype.reviewFloor
});
const ctx = { job: {}, emit: (e) => said.push(e.text) };
const away = (b, model = 'gpt-oss:20b', c = ctx) => Brain.prototype.reviewAway.call(b, model, c);
check('no room beside, Borrow a brain on: the review goes over Bob-Net, and the chat says who', (await away(fakeBrain()))?.name === 'Handheld' && said.some((t) => /Handheld checks this over Bob-Net/.test(t || '')));
said.length = 0;
check('the reviewer switch off: swap as before, nobody asked', (await away(fakeBrain({ mootBeside: false }))) === null && !said.length);
check('Borrow a brain off: swap as before', (await away(fakeBrain({ share: {} }))) === null && !said.length);
check('the reviewer is the brain already in: nothing to send', (await away(fakeBrain(), 'qwen3.6-35b-a3b')) === null && !said.length);
check('a guest job, a side chat or pictures stay here', (await away(fakeBrain(), 'gpt-oss:20b', { ...ctx, job: { guest: true } })) === null && (await away(fakeBrain(), 'gpt-oss:20b', { ...ctx, pics: ['p'] })) === null);
const none = fakeBrain({}, null);
check('no Bob good enough: it swaps here, and says so once', (await away(none)) === null && said.filter((t) => /happens here/.test(t || '')).length === 1);
await away(none);
check('...not on every review', said.filter((t) => /happens here/.test(t || '')).length === 1);
check('an unknown own size asks for at least a 4 GB Review brain', said.includes('min 4'));

// ---------- Low and Medium: a quick second look over Bob-Net (opt-in) ----------
const long = 'x'.repeat(300);
const mootBrain = (lenderPick) => {
  const calls = [];
  return { calls, cfg: { models: { reviewer: 'gpt-oss:20b' }, netReview: true }, log: () => {},
    runHat: async (hat, task, c, force) => { calls.push({ hat, lender: c.reviewLender, force }); return 'Looks right. Verdict: ok'; },
    pick: lenderPick };
};
const run = async (b, draft, quick) => { const out = []; const msgs = [{ role: 'user', content: 'q' }, { role: 'assistant', content: draft }]; const r = await runMoot(b, { msgs, base: 1, emit: (e) => out.push(e.text || ''), job: { effort: 'low' }, ctx: {}, quick }); return { r, out: out.join(' '), msgs }; };
const mb = mootBrain();
const q1 = await run(mb, long, async () => ({ name: 'Handheld', brain: 'gpt-oss:20b' }));
check('a free Bob gives a longer Low reply one quick look, and the chat says who', mb.calls.length === 1 && mb.calls[0].lender?.name === 'Handheld' && /Handheld gives this a quick second look over Bob-Net/.test(q1.out) && /Moot over/.test(q1.out), q1.out);
const mb2 = mootBrain();
const q2 = await run(mb2, long, async () => null);
check('no Bob free: no check, no swap, nothing said', mb2.calls.length === 0 && q2.r === null && !q2.out.trim());
const mb3 = mootBrain();
const q3 = await run(mb3, 'short', async () => ({ name: 'Handheld', brain: 'b' }));
check('short chit-chat is never checked, and nothing is said about it', mb3.calls.length === 0 && !q3.out.trim());
const brainSrc = fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8');
check('High and Extreme keep their own moot; the quick look is only the else branch, behind the switch', /if \(careful\(job\) && out\.ctx && !signal\?\.aborted\) await runMoot[^\n]*\n[^\n]*\n\s*else if \(out\.ctx && !signal\?\.aborted && this\.cfg\.netReview === true\)/.test(brainSrc));
check('a quick look that fails never falls back to a swap here', /if \(noLocal\) \{[^\n]*couldn't finish the second look/.test(brainSrc));
const qb = { cfg: { netReview: true, models: { reviewer: 'r' }, share: { borrow: { on: true, bobs: [go] } } }, engine: { resolve: () => null }, lenders: { pickForReview: async (o) => ({ min: o.minGB }) }, reviewFloor: Brain.prototype.reviewFloor };
check('the quick look needs its switch', (await Brain.prototype.quickReviewer.call({ ...qb, cfg: { ...qb.cfg, netReview: false } }, {}, [])) === null);
check('...and Borrow a brain', (await Brain.prototype.quickReviewer.call({ ...qb, cfg: { ...qb.cfg, share: {} } }, {}, [])) === null);
check('...and asks with the same quality floor', (await Brain.prototype.quickReviewer.call(qb, {}, []))?.min === 4);
check('...never for a guest job or pictures', (await Brain.prototype.quickReviewer.call(qb, { guest: true }, [])) === null && (await Brain.prototype.quickReviewer.call(qb, {}, ['p'])) === null);
const cellar = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
check('Settings has the switch, off unless set, and saves it', /sswitch\('netReview', settings\.netReview === true, 'Ask my other Bobs for a quick second look'/.test(cellar) && /dataset\.set === 'netReview'/.test(cellar));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
