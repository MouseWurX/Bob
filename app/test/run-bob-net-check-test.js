// 1.5.185 Bob-Net: a bigger Bob checks the harder jobs (src/bob-net-check.js). Brain sizes from names, the two
// switches (off by default), who may check, who gets picked at High and Extreme, and a real round trip through a
// pretend desktop lender over HTTP: the check runs on his Review brain, tool calls come back here, and a Bob that
// says no is skipped for checks only.
import { brainText } from './source-text.js';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { cleanSharePatch, shareView, lendChat, Lenders, helloFor } from '../src/share-brains.js';
import { brainBillions, checkLendOn, checkRefusal, checkHello, cleanCheck, wantsBorrowedCheck, pickChecker, checkDown, checkingOnLine, checkBackLine } from '../src/bob-net-check.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };
const read = (f) => fs.readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// ---------- how big a brain is ----------
check('sizes from ordinary names', brainBillions('qwen3-4b') === 4 && brainBillions('qwen2.5-coder-7b') === 7 && brainBillions('qwen3.8:27b') === 27 && brainBillions('qwen3.6:35b-a3b') === 35 && brainBillions('gemma4:e4b') === 4);
check('sizes from Bob\'s own brains', brainBillions('28Bob-Riker-Q4_K_M') === 28 && brainBillions('35Bob-Bobert') === 35);
check('no size when the name doesn\'t say', brainBillions('own-my-remix') === null && brainBillions('') === null && brainBillions(null) === null);

// ---------- the switches: off by default ----------
const door = { remote: { enabled: true, passcode: '12345678' } };
const withBob = { ...door, share: { borrow: { bobs: [{ name: 'PC', address: '100.101.2.3:7777', passcode: 'lend-1234' }] } } };
check('both start off', shareView({}).lendChecks === false && shareView({}).borrow.checks === false);
check('asking needs a Bob first', /Add one/.test(cleanSharePatch(door, { askChecks: true }).error || ''));
const asked = cleanSharePatch(withBob, { askChecks: true }).share;
check('asking switches on with a Bob', asked?.borrow.checks === true && shareView({ ...withBob, share: asked }).borrow.checks === true);
check('switching asking on leaves borrow and jobs alone', asked.borrow.on === false && asked.borrow.jobs === false);
const lends = cleanSharePatch(door, { lendChecks: true }).share;
check('checking for others switches on', lends?.lendChecks === true && shareView({ ...door, share: lends }).lendChecks === true);
check('other changes keep both', cleanSharePatch({ ...withBob, share: { ...asked, lendChecks: true } }, { lend: true }).share.lendChecks === true && cleanSharePatch({ ...withBob, share: asked }, { lend: true }).share.borrow.checks === true);
check('checking for others needs the door', checkLendOn({ share: { lendChecks: true } }) === false && checkLendOn({ ...door, share: { lendChecks: true } }) === true);

// ---------- only the harder jobs ----------
const askCfg = { share: { borrow: { checks: true, bobs: [{}] } } };
check('High and Extreme ask', wantsBorrowedCheck(askCfg, { effort: 'high' }) && wantsBorrowedCheck(askCfg, { effort: 'extreme' }));
check('Low and Medium have no check to send', !wantsBorrowedCheck(askCfg, { effort: 'low' }) && !wantsBorrowedCheck(askCfg, { effort: 'medium' }) && !wantsBorrowedCheck(askCfg, {}));
check('off means off', !wantsBorrowedCheck({ share: { borrow: { checks: false, bobs: [{}] } } }, { effort: 'extreme' }) && !wantsBorrowedCheck({}, { effort: 'extreme' }));

// ---------- who may check ----------
const deps = { lifeMs: 100, currentSession: (c) => ({ id: c.session || 'normal' }), quickBrain: () => ({ model: 'gemma4-e4b', cpu: false, ctx: 8192 }), checkBrain: () => ({ model: 'qwen3.6:35b-a3b', cpu: false, ctx: 32768, think: 'high' }) };
const lb = (extra = {}) => ({ cfg: { share: { lendChecks: true }, ...door, ...extra.cfg }, turns: new Map(), queue: [], ...extra.b });
check('checks when idle', checkRefusal(lb(), deps) === '');
check('never while gaming', checkRefusal(lb({ cfg: { session: 'light' } }), deps) === 'gaming');
check('not while busy', checkRefusal(lb({ b: { turns: new Map([['talk', 1]]) } }), deps) === 'busy' && checkRefusal(lb({ b: { lending: { since: 1 } } }), deps) === 'busy');
check('not without a Review brain', checkRefusal(lb(), { ...deps, checkBrain: () => null }) === 'no brain');
check('Lend my brain alone doesn\'t check', checkRefusal(lb({ cfg: { share: { lend: true } } }), deps) === 'off');
const hi = checkHello(lb(), deps, () => 'Qwen 3.6 35B');
check('the hello says what he checks with', hi.checks === true && hi.checkBrain === 'Qwen 3.6 35B' && hi.checkParams === 35 && hi.checkCtx === 32768);
check('the hello says nothing while it\'s off', JSON.stringify(checkHello(lb({ cfg: { share: {} } }), deps)) === '{}');
const fullHello = helloFor(lb(), { why: 'off', quick: null, can: {}, version: 'x', label: (m) => m, webOn: false, bigBrain: false, check: hi });
check('the desktop hello carries it', fullHello.checks === true && fullHello.checkParams === 35);
check('the asker keeps it', cleanCheck(hi)?.free === true && cleanCheck(hi).params === 35 && cleanCheck({ lend: true }) === null && cleanCheck({ checkBusy: 'gaming' })?.free === false);

// ---------- who gets picked ----------
const fakeL = (hellos) => {
  const bobs = Object.keys(hellos).map((name, i) => ({ name, address: `100.101.2.${i + 1}:7777` }));
  const state = new Map();
  return { bobs: () => bobs, state, now: () => 1000, held: [], busyHere: () => false, hold(a) { this.held.push(a); },
    hello: async (b) => { const s = { ok: false, ...(state.get(b.address) || {}), check: cleanCheck(hellos[b.name]) }; state.set(b.address, s); return s; } };
};
const net = { Laptop: { checks: true, checkParams: 9, checkBrain: 'Qwen 9B' }, PC: { checks: true, checkParams: 35, checkBrain: 'Qwen 3.6 35B' }, Phone: {} };
check('High: the first bigger Bob in your list', (await pickChecker(fakeL(net), { effort: 'high', mine: 7 }))?.name === 'Laptop');
check('Extreme: the biggest', (await pickChecker(fakeL(net), { effort: 'extreme', mine: 7 }))?.name === 'PC');
check('never a Bob no bigger than this one', (await pickChecker(fakeL(net), { effort: 'high', mine: 35 })) === null && (await pickChecker(fakeL({ Twin: { checks: true, checkParams: 7 } }), { effort: 'extreme', mine: 7 })) === null);
check('an unknown size here stays here', (await pickChecker(fakeL(net), { effort: 'extreme', mine: null })) === null);
check('a busy or gaming checker is skipped', (await pickChecker(fakeL({ PC: { checkBusy: 'gaming', checkParams: 35 } }), { effort: 'high', mine: 7 })) === null);
const downL = fakeL(net);
await downL.hello(downL.bobs()[1]);
checkDown(downL, downL.bobs()[1], 1000);
check('one that couldn\'t check is skipped for a minute', (await pickChecker(downL, { effort: 'extreme', mine: 7 }))?.name === 'Laptop');
{ const l = fakeL(net); await pickChecker(l, { effort: 'extreme', mine: 7 }); check('the pick is held so a second check goes elsewhere', l.held[0] === '100.101.2.2:7777'); }
check('the chat lines say who and why', /checks it on PC, whose Review brain is bigger \(Qwen 3.6 35B\)\. If PC can't, I check it here/.test(checkingOnLine('Bobert', { name: 'PC', check: { brain: 'Qwen 3.6 35B' } })) && /PC couldn't finish the check \(gaming\), so I'm checking it here/.test(checkBackLine({ name: 'PC' }, 'gaming')));

// ---------- a pretend desktop lender: the real lendChat behind a door like server.js's ----------
let used = null, think = null, who = null, mode = 'ok';
const logs = [];
const desk = {
  cfg: { share: { lendChecks: true }, ...door }, turns: new Map(), queue: [], lending: null,
  log: (k, t) => logs.push(`${k}: ${t}`), broadcast: () => {}, settle: async () => {}, gate: { done: () => {} },
  brainLabel: (m) => m, fitCtx: async (m, c) => c,
  ensureModel: async (m, _p, _s, hat) => { who = hat; return m; },
  chatSafe: async ({ model, tools, onToken, think: t }) => {
    used = model; think = t;
    if (mode === 'tool') return { role: 'assistant', content: '', tool_calls: [{ function: { name: tools[0].function.name, arguments: { path: 'notes.md' } } }] };
    onToken('Looks right.'); return { role: 'assistant', content: 'Looks right. The sums add up.' };
  }
};
const srv = http.createServer(async (req, res) => {
  if (req.url === '/api/lend/hello') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ lend: false, device: 'computer', ...checkHello(desk, deps, () => 'Qwen 3.6 35B') })); }
  if (req.url === '/api/lend/chat') { let s = ''; for await (const c of req) s += c; return lendChat(desk, req, res, JSON.parse(s), deps); }
  res.writeHead(404); res.end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const viaLocal = (url, o) => fetch(String(url).replace(/^http:\/\/100\.101\.2\.3:\d+/, `http://127.0.0.1:${port}`), o);
const pc = { name: 'PC', address: '100.101.2.3:7777', passcode: 'lend-1234' };
const L = new Lenders({ share: { borrow: { checks: true, bobs: [pc] } } }, { fetchFn: viaLocal });
const pick = await pickChecker(L, { effort: 'extreme', mine: 7 });
check('a real hello finds the bigger checker', pick?.name === 'PC' && pick.check.params === 35);
check('his quick lending can stay off', L.state.get(pc.address).ok === false);
const r1 = await L.chat(pick, { messages: [{ role: 'user', content: 'Check the answer.' }], tools: [], kind: 'check' });
check('the check runs on his Review brain, thinking hard', r1.content.startsWith('Looks right.') && used === 'qwen3.6:35b-a3b' && think === 'high' && who === 'reviewer');
check('his logbook says a check, never the words', logs.some((l) => /checked a job/.test(l)) && !logs.some((l) => /Check the answer/.test(l)));
mode = 'tool';
const r2 = await L.chat(pick, { messages: [{ role: 'user', content: 'Check it.' }], tools: [{ type: 'function', function: { name: 'read_file', parameters: {} } }], kind: 'check' });
check('his file reading comes back to run here', r2.tool_calls?.[0]?.function?.name === 'read_file' && r2.tool_calls[0].function.arguments.path === 'notes.md');
mode = 'ok';
used = null;
await L.chat(pick, { messages: [{ role: 'user', content: 'hi' }], tools: [] }).catch(() => {});
check('a plain quick reply is not a check (and Lend my brain is off there)', used === null);
desk.cfg.session = 'light';
let threw = '';
try { await L.chat(pick, { messages: [{ role: 'user', content: 'Check it.' }], tools: [], kind: 'check' }); } catch (e) { threw = e.why || e.message; }
check('a gaming checker says no', threw === 'gaming');
check('and is skipped for checks for a minute', L.state.get(pc.address).checkDownUntil > Date.now());
delete desk.cfg.session;
srv.close();

// ---------- wired in ----------
const brain = brainText(), server = read('src/server.js'), page = read('public/share-brains.js');
check('the moot\'s check asks a bigger Bob first', /hat === 'reviewer' && force && wantsBorrowedCheck\(this\.cfg, ctx\.job\)/.test(brain) && /pickChecker\(this\.lenders, \{ effort: ctx\.job\.effort, mine: brainBillions\(model\) \}\)/.test(brain));
check('and checks here when he can\'t', /checkDown\(this\.lenders, via\)/.test(brain) && /checkBackLine\(via/.test(brain));
check('nothing loads here for a borrowed check', /if \(!lender && !via\) model = await loadHere\(\);/.test(brain) && /if \(via\) reply = await this\.lenders\.chat\(via, \{[^}]*kind: 'check'/.test(brain));
check('the lender has a Review brain to check with', /checkBrain: \(b\) => \{ const r = reviewBrain\(b\.cfg\)/.test(brain));
check('the hello says so', /check: checkHello\(brain, brain\.lendDeps/.test(server));
check('both switches are on the Bob-Net page', /data-share-lendchecks/.test(page) && /data-share-askchecks/.test(page) && /Check harder jobs for my other Bobs/.test(page) && /Ask a bigger Bob to check my harder jobs/.test(page));
const help = HELP.map((e) => e.html).join(' ');
check('Help explains both switches', help.includes('Check harder jobs for my other Bobs') && help.includes('Ask a bigger Bob to check my harder jobs'));
check('the glossary has Bigger checker', /<dt>Bigger checker<\/dt>/.test(HELP.find((e) => e.id === 'glossary').html));
check('the FAQ answers it', /\?$/.test(HELP.find((e) => e.id === 'faq-bigger-checker')?.title || ''));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
