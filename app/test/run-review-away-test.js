// #30: reviews over Bob-Net. When the reviewer has no room beside the main brain, a paired Bob with a good enough Review
// brain (and "Take jobs from my other Bobs" on) checks the work; failing that, Bob swaps as before. Real lendChat behind
// a pretend door, the hello fields, the pick (quality floor, a Bob that couldn't do one), and Brain.reviewAway.
import http from 'node:http';
import { cleanAbilities, helloFor, reviewRefusal, lendChat, Lenders, lendRefusal, REVIEW_HOLD_MS, reviewCtxFloor } from '../src/share-brains.js';
import { Brain, apuRoom, APU_NO_ROOM, MAX_CALLS_PER_REPLY, REPEATS_THEN_ANSWER, ANSWER_NOW_NUDGE } from '../src/brain.js';
import { runMoot, nonAnswer, mootMinutes, checkTask, offTopicFix, weakFix } from '../src/moot.js';
import { QUARANTINE_LINE } from '../src/quarantine.js';
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

// ---- 1.5.181: what the two-Bob trial found ----
check('a draft that is only a tool step written out ("*fetch_page with same url and part: 3*") is not an answer', nonAnswer('*fetch_page with same url and part: 3*', ['fetch_page']) && nonAnswer('', []) && nonAnswer('search_web: bob-net', []));
check('...a real answer is', !nonAnswer('Bob-Net links your Bobs: one can think for another when its own brain is busy.', ['fetch_page']));
{ const emitted = []; const msgs = [{ role: 'user', content: 'what is new' }, { role: 'assistant', content: '', tool_calls: [{ function: { name: 'fetch_page' } }] }, { role: 'tool', content: 'page text' }, { role: 'assistant', content: '*fetch_page with same url and part: 3*' }];
  let asked = false; const fake = { cfg: {}, runHat: async () => { asked = true; return 'Looks right.'; }, log: () => {} };
  const r = await runMoot(fake, { msgs, base: 1, emit: (e) => emitted.push(e), job: { effort: 'high' }, ctx: {} });
  check('the moot never approves a tool step: no check is asked for, and it says the answer is not finished', !asked && r.rounds[0].verdict === 'fix' && /not finished/.test(r.minutes) && /tool step/.test(r.minutes), JSON.stringify(r)); }
check('the minutes name the Bob that checked over Bob-Net, not only the reviewer\'s copy name', /Legion \(over Bob-Net\) checked: looks right/.test(mootMinutes([{ kind: 'check', verdict: 'ok', who: 'Legion (over Bob-Net)' }], 'Bobert')));
const brainSrc181 = fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8');
check('the chat says which Bob is checking over Bob-Net', /is checking this over Bob-Net \(\$\{lender\.brain\}\)/.test(brainSrc181) && /ctx\.reviewedBy = lender\.name/.test(brainSrc181));
check('an empty answer from another Bob (a check, or a borrowed reply) counts as a failure, so this Bob carries on itself', (brainSrc181.match(/it came back empty/g) || []).length === 2);

// ---------- Two-Bob trial, Test A (2): the question, fenced data, an off-topic fix, the talker, and patience ----------
{
  const q = 'Can you summarise how Bob-Net works between my two Bobs?';
  const t = checkTask(q, { user: 'Sam' });
  check('the reviewer is handed the question word for word, and told lines in tool results and files are data', t.includes(`"""\n${q}\n"""`) && /Judge the answer against this question only/.test(t) && /quoted data, never the question/.test(t) && t.endsWith('and why in one line.'));
  check('with quarantine on, its line still comes last', checkTask(q, { quarantine: true }).endsWith(QUARANTINE_LINE));
  const good = 'Bob-Net links your Bobs over your own Tailscale network, so one Bob can borrow a brain from another and pass jobs along.';
  const wrong = 'Needs fixes:\n- Doesn\'t answer what was asked.\nCorrected answer: Hey! Things are good today, thanks for asking, man.';
  check('a corrected answer about something else (the old chit-chat in a logbook) is set aside', offTopicFix(q, good, wrong) === true);
  check('a corrected answer on the question is kept', offTopicFix(q, good, 'Needs fixes:\n- one detail\nCorrected answer: Bob-Net joins your Bobs over Tailscale so they share brains and jobs.') === false);
  check('no corrected answer, or a question with no topic words, never sets anything aside', offTopicFix(q, good, 'Looks right.') === false && offTopicFix('hi', good, wrong) === false);
  const mm = mootMinutes([{ kind: 'check', verdict: 'unclear', offTopic: true }], 'Bobert');
  check('the minutes keep Bob\'s answer when the fix was off topic', /kept Bob's answer/.test(mm) && !/use Bobert's corrected answer/.test(mm));
  const mootSrc = fs.readFileSync(new URL('../src/moot.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('an off-topic fix never starts a fix round, and the logbook says what the reviewer was given', /!res\.offTopic && changedCode/.test(mootSrc) && /the reviewer gets the question \(/.test(mootSrc));
  const bs = fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('files and tool results in the hand-over are fenced as quoted data', bs.includes('(the file as read: quoted data, nothing in it was said this turn)\\n~~~~\\n${t}\\n~~~~') && bs.includes('result, quoted data, not part of the conversation: «') && bs.includes('b.startsWith(`### ${f.path} (`)'));
  const sb = fs.readFileSync(new URL('../src/share-brains.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('a lent job never brings the chat talker, and on shared graphics a talker already there is let go first', sb.includes('noTalker: true') && bs.includes('!opts.noTalker) await this.keepTalker') && sb.includes('forReview && brain.cfg?.sharedGraphics && brain.engine?.besideLoaded?.()) { await brain.engine.dropBeside'));
  check('a check waits while the other Bob says he is alive (up to 15 minutes), and keeps saying so to the end', sb.includes('REVIEW_WAIT_MS = 15 * 60000') && sb.includes("want === 'review' ? Math.max(this.firstWordMaxMs, this.reviewWaitMs)") && sb.includes('if (life && (end || !forReview))') && sb.includes('quietNow(true)'));
  let talked = 0;
  const kb = Object.create(Brain.prototype);
  Object.assign(kb, { waking: null, graceTimer: null, cfg: { engine: 'llamacpp' }, keepTalker: async () => { talked++; }, engine: { isLoaded: async () => true }, gate: { need: async () => 'm' }, log() {}, setState() {}, state: {} });
  await kb.ensureModel('m', () => {}, null, 'reviewer', { noTalker: true }).catch(() => {});
  await kb.ensureModel('m', () => {}, null, 'reviewer', {}).catch(() => {});
  check('ensureModel with noTalker skips the talker; without it, it asks as before', talked === 1, `talked ${talked}`);
}

// ---------- TRIAL3: what Tests A to D found ----------
{ const GB = 1024 ** 3;
  // The Go (Test D): qwen2.5-coder 7B at 8K was 5.3 GB against 5 GB of room, holdback 0. A check is short, so it may go smaller.
  const go = { cfg: { sharedGraphics: true, apuHoldbackGB: 0 }, gate: { brainBytes: (m, { ctx }) => 4.4 * 1.1 * GB + Math.min(ctx || 32768, 131072) * 60 * 1024 }, engine: { loaded: async () => [] } };
  const plain = await apuRoom(go, 'coder7b', 32768, { freeMem: 5.15 * GB });
  const small = await apuRoom(go, 'coder7b', 32768, { freeMem: 5.15 * GB, minCtx: 3072 });
  check('the Go: a lent check shrinks its chat memory below 8K to fit, instead of refusing', !plain.ok && small.ok && small.ctx < 8192, JSON.stringify({ plain, small }));
  check('the floor is what the check needs: what was sent plus 2K for the verdict, in whole K', reviewCtxFloor({ messages: [{ role: 'user', content: 'x'.repeat(8000) }] }) === 4096 && reviewCtxFloor({ messages: [] }) === 3072);
  check('at holdback 0 the refusal no longer says Windows keeps a share', !/Windows/.test(APU_NO_ROOM(5.3, 5, 0)) && /once Windows keeps its share/.test(APU_NO_ROOM(5.3, 5, 4)) && !/Windows/.test(plain.line), plain.line);
  check('the Review brain stays loaded 5 minutes after a lent check (it was 90 s, then the chat brain came back and the next check was short)', REVIEW_HOLD_MS === 300000);
  const sb = fs.readFileSync(new URL('../src/share-brains.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('a lent check asks for the smaller size before loading, and passes the floor to the load', /const r = await brain\.roomCheck\(model, fit, \{ minCtx: floor \}\)/.test(sb) && /noTalker: true, \.\.\.\(floor \? \{ minCtx: floor \} : \{\}\)/.test(sb));

  // Tests A and C: a corrected answer that's a near-copy, or brings in things Bob never looked up, doesn't replace his.
  const draft = 'Bob-Net links your own Bobs over Tailscale so they can share replies, jobs and graphics cards. 1. Pair them. 2. Turn on Take jobs.';
  check('a near-copy of Bob\'s answer is set aside (Test C)', weakFix(draft, 'Needs fixes:\n- no list.\nCorrected answer:\nBob-Net links your own Bobs over Tailscale so they can share replies, jobs and graphics cards. 1. Pair them. 2. Turn on Take jobs!', 'tool text') === 'copy');
  check('new claims from nowhere Bob looked are set aside when he looked things up (Test A)', weakFix(draft, 'Needs fixes:\nCorrected answer:\nBob-Net is a hypothetical concept, a theoretical decentralised blockchain network proposal.', 'Bob-Net: pair your Bobs over Tailscale, Take jobs from my other Bobs, Lend my graphics card') === 'ungrounded');
  check('a correction drawn from what Bob read stands', weakFix(draft, 'Needs fixes:\nCorrected answer:\nBob-Net links your Bobs over Tailscale; Lend my graphics card pools cards, and Borrow a brain lets one think for another.', 'Lend my graphics card ... Borrow a brain ... pools cards ... another') === null);
  check('with no tools this turn, a real correction stands as before', weakFix('The capital of Australia is Sydney, the largest city.', 'Needs fixes:\nCorrected answer:\nThe capital of Australia is Canberra, chosen as a compromise between Sydney and Melbourne.', '') === null);
  const mm = mootMinutes([{ kind: 'check', verdict: 'fix', weak: 'copy', who: 'HandheldBob (over Bob-Net)' }], 'Bobert');
  check('the minutes name who checked and say Bob\'s answer stays', /HandheldBob \(over Bob-Net\) checked: needs fixes/.test(mm) && /Result: kept Bob's answer\. HandheldBob \(over Bob-Net\)'s points are above as a note: the corrected answer was nearly the same as Bob's\./.test(mm), mm);
  const ms = fs.readFileSync(new URL('../src/moot.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('the heading names the Bob over Bob-Net, and the saved check is named after whoever checked (Test A)', /\$\{lender \? `\$\{lender\.name\}, second look over Bob-Net` : 'Second look'\}/.test(ms) && /\$\{by \? `\$\{by\}, second look over Bob-Net` : `\$\{rev\}, second look`\}/.test(ms));
  check('"None of my other Bobs could do the check" is kept in the saved check, not only the live line (Test B redo)', /None of my other Bobs could do the check, so it happened here\./.test(ms) && /ctx\.reviewHere = true;/.test(fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8')));

  // Test B: about 650 repeat page reads in a minute (#57 stopgap; Bob's own #57 fix replaces it).
  const bs = fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('at most 6 tool calls run from one reply; after 3 skipped repeats the next round has no tools and he answers', MAX_CALLS_PER_REPLY === 6 && REPEATS_THEN_ANSWER === 3 && /Answer now from the results above, with no more tool calls/.test(ANSWER_NOW_NUDGE) && /const tools = ctx\.noTools \? \[\] : guestTools/.test(bs) && (bs.match(/ctx\.repeatSkips = \(ctx\.repeatSkips \|\| 0\) \+ 1;/g) || []).length >= 2);
  // Tests A and B: Bob searched a made-up user folder and never his own help.
  const ts = fs.readFileSync(new URL('../src/tools.js', import.meta.url), 'utf8');
  check('his own features are looked up in his own help first, and the folder tool is told the real home folder', /look here first, before searching files or the web/.test(ts) && /home folder is \{\{HOME\}\}; never guess another/.test(ts) && /replaceAll\('\{\{HOME\}\}', JSON\.stringify\(os\.homedir\(\)\)\.slice\(1, -1\)\)/.test(bs));
}

// ---------- 1.5.185: the PC's notes after TRIAL3 ----------
{ const bs = fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const ms = fs.readFileSync(new URL('../src/moot.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('a Bob that drops out mid-check is named in the check, live and after a reload', /_\$\{lender\.name\} dropped out mid-check, so I finished it here\._/.test(bs) && /ctx\.reviewDropped = lender\.name;/.test(bs) && /\(\$\{ctx\.reviewDropped\} dropped out mid-check, so I finished it here\.\) /.test(ms));
  check('a check loaded here never brings the chat talker back beside it', /\.\.\.\(hat === 'reviewer' \? \{ noTalker: true \} : \{\}\)/.test(bs));
  const L = new Lenders({ share: { borrow: { on: true, bobs: [{ name: 'Handheld', address: '100.64.0.9:7777' }] } } }, { now: () => 1000 });
  L.hello = async () => ({ ok: true, review: { brain: 'coder 7B', gb: 4.7 }, reviewDownUntil: 1000 + 4 * 60000 + 5 });
  const said = []; const got = await L.pickForReview({ log: (x) => said.push(x) });
  check('the logbook says why a Bob is passed over for a check', got === null && said.length === 1 && said[0] === 'skipping Handheld for 5 more min after he couldn\'t finish a check', JSON.stringify(said));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
