// Share brains between your Bobs (Settings, Bob-Net). Both halves are off unless you turn them on.
//
// "Lend my brain": another Bob of yours (the PC, the laptop, the handheld, the phone) may ask this one to think a quick
// reply. Only through the door "Let my phone in" opens (Tailscale addresses, passcode cookie), and only for this:
// words in, words (and tool calls) out. Nothing runs here: the tools, the files and the OK cards stay with the Bob that
// asked. Nothing is kept: the lent reply isn't saved, logged with its text, or remembered. A lender that's gaming or
// busy with its own job says no, and the asking Bob thinks for itself. The lender uses its quick brain only, never a big one.
//
// "Borrow a brain": this Bob asks one of your other Bobs first, then thinks for itself if none answers in time.
// When: while Gaming (the owner's main reason: a phone thinking for the PC saves the processor for the game), when this
// Bob is busy, or always for quick replies. Only Low-effort front-desk replies with no pictures are borrowed
// (a quick chat beside a big job counts).
// Addresses must be Tailscale ones (100.64.0.0/10 or a *.ts.net name). Passcodes live in config.json only, like the
// phone door's, and are never sent back to the page.
import fs from 'node:fs';
import { readJsonFile } from './util.js';
import { isTailscaleIp } from './phone-access.js';
import { homeIps, isHomeIp, sameNet } from './share-card.js';
import { cleanCheck, checkRefusal, checkDown, CHECK_FIRST_WORD_MAX_MS } from './bob-net-check.js'; // 1.5.185

export const PROTOCOL = 1;
// About how many tokens a request is (4 characters a token is close enough to decide whether it fits a brain's room).
export const roughTokens = (x) => Math.ceil(JSON.stringify(x || '').length / 4);
export const REPLY_ROOM = 1024; // room left for the answer itself
const WARM_FOR = 10 * 60000; // a Bob used this recently still has our chat in its prompt cache
export const WHEN = ['gaming', 'busy', 'always'];
export const HELLO_MS = 2500; // "are you there?" gets this long
export const FIRST_WORD_MS = 12000; // a lender that hasn't started answering by then is dropped for this reply
export const QUIET_MS = 20000; // and one that goes quiet mid-answer
// 1.5.92: a lender loading his brain says "still loading" this often, so a cold handheld or laptop isn't dropped
// as too slow at 12 s. The asker still gives up if no word has come by FIRST_WORD_MAX_MS, signals or not.
export const LIFE_MS = 4000;
export const FIRST_WORD_MAX_MS = 45000;
// Two-Bob trial (the owner: "wait for responses, it won't all happen at the same speed"): a check on another Bob may first
// load a Review brain split between graphics memory and RAM, which takes a while on a handheld. While he keeps saying he's
// alive, the asker waits up to this long; a refusal, a dropped line or a long silence still falls back at once.
export const REVIEW_WAIT_MS = 15 * 60000;
const GOOD_FOR = 30000, DOWN_FOR = 60000;
const MAX_BOBS = 6;
const TS_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.ts\.net$/;

// "100.101.102.103:7777", "http://phone.tail1234.ts.net:7777/" -> "100.101.102.103:7777". Tailscale only.
export function cleanAddress(a, defPort = 7777) {
  let s = String(a || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\.$/, '');
  if (!/:\d{1,5}$/.test(s)) s = `${s}:${defPort}`;
  const i = s.lastIndexOf(':');
  const name = s.slice(0, i).replace(/\.$/, ''), port = Number(s.slice(i + 1));
  if (!(port >= 1 && port <= 65535)) return null;
  return isTailscaleIp(name) || (name.length <= 253 && TS_NAME.test(name)) ? `${name}:${port}` : null;
}

const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);

// ---------- Settings ----------
export function shareView(cfg) {
  const s = cfg.share || {};
  const b = s.borrow || {};
  return {
    lend: s.lend === true,
    takeJobs: s.takeJobs === true,
    passAlong: s.passAlong === true, // 1.5.123 Pass my Bob-Net along (src/bob-net-party.js)
    lendCard: s.lendCard === true, // Lend my graphics card (src/share-card.js), off unless switched on
    lendChecks: s.lendChecks === true, // 1.5.185 Check harder jobs for my other Bobs (src/bob-net-check.js)
    spread: ['toobig', 'big'].includes(s.spread) ? s.spread : 'off', // Spread big brains over my other Bobs' cards
    // Bob-Net mode: More Bobs (the default: each Bob runs his own brain) or Bigger Bobs (they pool their cards).
    homeNet: s.homeNet !== false, // Bigger Bobs: Use the home network first (src/share-card.js), Tailscale as the backup
    mode: s.lendCard === true || ['toobig', 'big'].includes(s.spread) ? 'bigger' : 'more',
    doorOpen: doorOpen(cfg),
    borrow: { on: b.on === true, jobs: b.jobs === true, checks: b.checks === true, when: WHEN.includes(b.when) ? b.when : 'gaming', bobs: (b.bobs || []).map((x) => ({ name: x.name, address: x.address, passcodeSet: String(x.passcode || '').length >= 6 })) }
  };
}

export const doorOpen = (cfg) => Boolean(cfg.remote?.enabled && String(cfg.remote?.passcode || '').length >= 6);

// A change from Settings, checked. Returns { share } to save, or { error }. A Bob without a new passcode keeps its old one.
export function cleanSharePatch(cfg, b) {
  const cur = cfg.share || {};
  const cb = cur.borrow || {};
  const next = { lend: cur.lend === true, takeJobs: cur.takeJobs === true, passAlong: cur.passAlong === true, lendCard: cur.lendCard === true, lendChecks: cur.lendChecks === true, homeNet: cur.homeNet !== false, spread: ['toobig', 'big'].includes(cur.spread) ? cur.spread : 'off', borrow: { on: cb.on === true, jobs: cb.jobs === true, checks: cb.checks === true, when: WHEN.includes(cb.when) ? cb.when : 'gaming', bobs: (cb.bobs || []).slice() } };
  if ('lend' in b) next.lend = b.lend === true;
  if ('takeJobs' in b) next.takeJobs = b.takeJobs === true; // 1.5.72, off unless switched on
  if ('passAlong' in b) next.passAlong = b.passAlong === true; // 1.5.123, off unless switched on
  if ('lendChecks' in b) next.lendChecks = b.lendChecks === true; // 1.5.185, off unless switched on
  if ('askChecks' in b) next.borrow.checks = b.askChecks === true; // 1.5.185, off unless switched on
  // Bob-Net mode: Bigger Bobs lends this card and spreads brains too big for this replicant matrix; More Bobs turns both off.
  // 1.5.189: 'toobig', not 'big', by default. PC test Nov 10: Riker on the 16 GB card plus memory ran at 105.6 tok/s,
  // and spread over a handheld on Wi-Fi at 17.9, so a brain that fits here (card and memory) stays here unless you pick 'big'.
  if ('mode' in b) {
    if (!['more', 'bigger'].includes(b.mode)) return { error: 'Pick More Bobs or Bigger Bobs.' };
    if (b.mode === 'more') Object.assign(next, { lendCard: false, spread: 'off' });
    else { next.lendCard = true; if (next.spread === 'off') next.spread = 'toobig'; if (!next.borrow.bobs.length) return { error: 'Bigger Bobs needs another Bob to pool with. Add one of your other Bobs first.' }; }
  }
  if ('lendCard' in b) next.lendCard = b.lendCard === true; // off unless switched on
  if ('homeNet' in b) next.homeNet = b.homeNet !== false;
  if ('spread' in b) { if (!['off', 'toobig', 'big'].includes(b.spread)) return { error: 'Pick when to spread a brain.' }; next.spread = b.spread; }
  if ('sendJobs' in b) next.borrow.jobs = b.sendJobs === true; // 1.5.72, off unless switched on
  if ('when' in b) { if (!WHEN.includes(b.when)) return { error: 'Pick when to borrow.' }; next.borrow.when = b.when; }
  if (b.addBob) {
    const address = cleanAddress(b.addBob.address);
    if (!address) return { error: 'That isn\'t a Tailscale address. It looks like 100.x.y.z:7777 or name.something.ts.net:7777.' };
    const passcode = String(b.addBob.passcode || '').trim();
    const old = next.borrow.bobs.find((x) => x.address === address);
    if (!old && passcode.length < 6) return { error: 'Type that Bob\'s passcode (at least 6 characters).' };
    if (passcode && passcode.length > 64) return { error: 'That passcode is too long.' };
    const entry = { name: cleanName(b.addBob.name) || address.split(':')[0].split('.')[0], address, passcode: passcode || old.passcode };
    next.borrow.bobs = [...next.borrow.bobs.filter((x) => x.address !== address), entry];
    if (next.borrow.bobs.length > MAX_BOBS) return { error: `Up to ${MAX_BOBS} Bobs.` };
  }
  if (b.removeBob) next.borrow.bobs = next.borrow.bobs.filter((x) => x.address !== cleanAddress(b.removeBob));
  if (Array.isArray(b.order)) { const at = (a) => { const i = b.order.map((x) => cleanAddress(x)).indexOf(a); return i < 0 ? 99 : i; }; next.borrow.bobs.sort((x, y) => at(x.address) - at(y.address)); }
  if ('borrow' in b) next.borrow.on = b.borrow === true;
  if ((next.borrow.on || next.borrow.jobs || ('askChecks' in b && next.borrow.checks) || ('spread' in b && next.spread !== 'off')) && !next.borrow.bobs.length) return { error: 'Add one of your other Bobs first.' };
  return { share: next };
}

export function saveShare(cfg, share) {
  const raw = readJsonFile(cfg.configFile);
  raw.share = share;
  fs.writeFileSync(cfg.configFile, JSON.stringify(raw, null, 2));
  cfg.share = share;
}

// ---------- Lending (this Bob thinks for another) ----------
export const lendOn = (cfg) => cfg.share?.lend === true && doorOpen(cfg);

// Why this Bob won't lend right now, or '' when it will. Gaming: the processor and card belong to the game here too.
export function lendRefusal(brain, { currentSession, quickBrain }) {
  if (!lendOn(brain.cfg)) return 'off';
  if (currentSession(brain.cfg).id === 'light') return 'gaming';
  if (brain.lending) return 'busy';
  if (brain.turns?.size || brain.queue?.some?.((j) => j.state === 'working')) return 'busy';
  if (!quickBrain(brain)) return 'no brain';
  return '';
}

// #30: reviews over Bob-Net. A paired Bob checks the work on his own Review brain when this one has no room for it beside
// the main brain. Only with "Take jobs from my other Bobs" on there (a review is a job), never while he's gaming or busy.
// A review is several short calls, and the next check often follows within minutes: his Review brain stays loaded
// that long instead of the chat brain coming straight back (two-Bob trial, the Go: the chat brain woke after 90 s
// and the next check was 0.3 GB short).
export const REVIEW_HOLD_MS = 5 * 60000;
// The least chat memory a lent check is loaded with when room is short: what was sent, plus room for the verdict.
export const REVIEW_ANSWER_ROOM = 2048;
export const reviewCtxFloor = (ask) => Math.max(2048, Math.ceil((roughTokens(ask) + REVIEW_ANSWER_ROOM) / 1024) * 1024);
export function reviewRefusal(brain, { currentSession, reviewBrain }) {
  if (!(brain.cfg.share?.takeJobs === true && doorOpen(brain.cfg))) return 'off';
  if (currentSession(brain.cfg).id === 'light') return 'gaming';
  if (brain.lending) return 'busy';
  if (brain.turns?.size || brain.queue?.some?.((j) => j.state === 'working')) return 'busy';
  if (!reviewBrain?.(brain)) return 'no brain';
  return '';
}

// What a lent request may carry: plain chat messages and tool definitions. Pictures never travel.
export function cleanLendRequest(b) {
  const roles = new Set(['system', 'user', 'assistant', 'tool']);
  const messages = [].concat(b?.messages || []).slice(-200).filter((m) => m && roles.has(m.role)).map((m) => {
    const o = { role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 60000) : '' };
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) o.tool_calls = m.tool_calls.slice(0, 16).map((c) => ({ function: { name: String(c?.function?.name || '').slice(0, 80), arguments: c?.function?.arguments && typeof c.function.arguments === 'object' ? c.function.arguments : {} } }));
    if (m.role === 'tool' && m.tool_name) o.tool_name = String(m.tool_name).slice(0, 80);
    return o;
  });
  const tools = [].concat(b?.tools || []).slice(0, 128).filter((t) => t?.type === 'function' && /^[\w.-]{1,80}$/.test(String(t.function?.name || '')));
  if (!messages.some((m) => m.role === 'user')) return { error: 'no question' };
  if (JSON.stringify({ messages, tools }).length > 900000) return { error: 'too big' };
  return { messages, tools };
}

// POST /api/lend/chat: think one reply for another Bob, streaming it back as server-sent events:
//   { type: 'token', text }  ...  { type: 'done', reply: { content, tool_calls } }  or  { type: 'error', error }
export async function lendChat(brain, req, res, b, deps) {
  // #30: want 'review' checks work on his Review brain when the asker has no room for his own. 1.5.185: kind 'check' is a
  // harder job's check on this Bob's bigger Review brain (src/bob-net-check.js). Both are checks, not quick replies.
  const checking = b?.kind === 'check';
  const forReview = b?.want === 'review' || checking;
  clearTimeout(brain.reviewHold); brain.reviewHold = null; // the next step of a review: his Review brain is still loaded
  const pickBrain = checking ? deps.checkBrain : forReview ? deps.reviewBrain : deps.quickBrain;
  const why = checking ? checkRefusal(brain, deps) : forReview ? reviewRefusal(brain, deps) : lendRefusal(brain, deps);
  if (why) { res.writeHead(409, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ busy: why })); }
  const ask = cleanLendRequest(b);
  if (ask.error) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: ask.error })); }
  // 1.5.72: a Bob knows his limits. A chat that won't fit his quick brain's room is turned down before he starts.
  const room = pickBrain(brain)?.ctx || 32768;
  if (roughTokens(ask) + REPLY_ROOM > room) { res.writeHead(409, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ busy: 'too long', ctx: room })); }
  const stop = new AbortController();
  // 1.5.92: the asking Bob giving up (too slow, or his owner pressed Stop) closes the line: stop thinking then.
  // This listens on res, not req: the request body is already read by now, so req has closed and never says so again.
  res.on('close', () => { if (!res.writableEnded) stop.abort(); });
  brain.lending = { since: Date.now(), for: cleanName(b.from) || 'another Bob', ...(checking ? { kind: 'check' } : {}) };
  brain.broadcast?.({ type: 'lending', on: true, for: brain.lending.for });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
  const send = (ev) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); };
  const t0 = Date.now();
  // Until the first word: "still loading" every few seconds (the phone lender does the same).
  send({ type: 'loading' });
  let life = setInterval(() => send({ type: 'loading' }), deps.lifeMs || LIFE_MS);
  // A check keeps saying it's alive all the way through (a Review brain may think quietly before it writes), so the asker
  // never takes slow for gone; a quick reply stops at its first word, as before.
  const quietNow = (end = false) => { if (life && (end || !forReview)) { clearInterval(life); life = null; } };
  try {
    const { model, cpu, ctx, think } = pickBrain(brain);
    let fit = await brain.fitCtx(model, ctx);
    // Two-Bob trial (the Go, Test D): short of room on shared graphics, a check is loaded with a smaller chat memory
    // (as small as the work needs) before it's turned down. A check is short, so it doesn't need the full size.
    const floor = forReview ? reviewCtxFloor(ask) : undefined;
    if (floor && brain.cfg?.sharedGraphics && brain.roomCheck) {
      const r = await brain.roomCheck(model, fit, { minCtx: floor }).catch(() => null);
      if (r?.ok && r.ctx && r.ctx < (fit || Infinity)) { brain.log?.('lend', `loading the Review brain with a smaller chat memory (${r.ctx} instead of ${fit}) so it fits for the check`); fit = r.ctx; }
    }
    // Two-Bob trial (Test A): a lent check on shared graphics loaded this Bob's chat talker beside it first and then had no
    // room for the Review brain. A lent job never brings the talker, and on shared graphics one already there is let go.
    if (forReview && brain.cfg?.sharedGraphics && brain.engine?.besideLoaded?.()) { await brain.engine.dropBeside?.().catch?.(() => {}); brain.log?.('lend', 'let go of the chat brain beside, to make room for the check'); }
    const use = (await brain.ensureModel(model, () => {}, stop.signal, forReview ? 'reviewer' : 'bob', { cpu, ctx: fit, noTalker: true, ...(floor ? { minCtx: floor } : {}) })) || model;
    if (stop.signal.aborted) throw new Error('stopped');
    send({ type: 'brain', label: brain.brainLabel?.(use) || use });
    const reply = await brain.chatSafe({ model: use, messages: ask.messages, tools: ask.tools.length ? ask.tools : undefined, signal: stop.signal, cpu, think: checking ? (think || 'high') : forReview ? think : false, ctx: fit, onToken: (t) => { quietNow(); send({ type: 'token', text: t }); } });
    send({ type: 'done', reply: { content: reply.content || '', tool_calls: reply.tool_calls } });
    brain.log?.('lend', `${checking ? 'checked a job' : forReview ? 'checked work' : 'thought a reply'} for ${brain.lending.for} in ${((Date.now() - t0) / 1000).toFixed(1)} s`); // never the words
  } catch (e) {
    send({ type: 'error', error: stop.signal.aborted ? 'stopped' : String(e.message || e).slice(0, 200) });
  } finally {
    quietNow(true);
    brain.gate?.done(stop.signal); // 1.5.92: give the graphics card back, or his own and guest jobs wait for it forever
    const who = brain.lending?.for;
    brain.lending = null;
    brain.broadcast?.({ type: 'lending', on: false, for: who });
    res.end();
    // Back to light, same as after his own jobs. A review comes back for its next step in a moment, so his Review brain waits.
    // 1.5.196 (Tailscale test: a 2 s lend cost the lender a 78 s reload): after a lend he lets go of what the lend brought,
    // but doesn't load his own quick brain back. That waits until his owner types (or "Always on" holds it, as before).
    if (forReview) { brain.reviewHold = setTimeout(() => { brain.reviewHold = null; brain.settle?.({ noWake: true }).catch?.(() => {}); }, deps.reviewHoldMs ?? REVIEW_HOLD_MS); brain.reviewHold.unref?.(); }
    else setTimeout(() => brain.settle?.({ noWake: true }).catch?.(() => {}), 0);
  }
}

// ---------- Borrowing (another Bob thinks for this one) ----------
// Should this reply be borrowed? Low effort, front desk, no pictures, and the owner's "when".
export function wantsBorrow(cfg, { session, busy, job, pics }) {
  const b = cfg.share?.borrow || {};
  if (b.on !== true || !(b.bobs || []).length) return false;
  if (pics?.length) return false; // a quick chat beside a big job (job.side) is the "busy" case itself
  if (job && job.effort && job.effort !== 'low') return false;
  const when = WHEN.includes(b.when) ? b.when : 'gaming';
  if (when === 'always') return true;
  if (session === 'light') return true; // Gaming counts for every choice
  return when === 'busy' && Boolean(busy);
}

export class Lenders {
  constructor(cfg, { fetchFn = globalThis.fetch, now = Date.now, firstWordMs = FIRST_WORD_MS, quietMs = QUIET_MS, firstWordMaxMs = FIRST_WORD_MAX_MS, reviewWaitMs = REVIEW_WAIT_MS, home = homeIps, checkFirstWordMaxMs = CHECK_FIRST_WORD_MAX_MS } = {}) {
    this.checkFirstWordMaxMs = checkFirstWordMaxMs;
    this.cfg = cfg; this.fetch = fetchFn; this.now = now; this.firstWordMs = firstWordMs; this.quietMs = quietMs; this.firstWordMaxMs = firstWordMaxMs; this.reviewWaitMs = reviewWaitMs; this.home = home;
    // Also over the home network: address -> his door on our home network (from his hello), and when it last failed.
    this.near = new Map(); this.nearDown = new Map();
    this.cookies = new Map(); // address -> bob_auth cookie (memory only)
    this.state = new Map(); // address -> { ok, at, brain, why }
    // 1.5.72: Bobs thinking for us right now (address -> held until), so two replies at once go to two different Bobs.
    this.inUse = new Map();
    this.live = new Map(); // 1.5.123: address -> 'thinking' while a reply streams from him (for the Bob-Net party in Now running)
  }
  busyHere(address) { const t = this.inUse.get(address); return t !== undefined && t > this.now(); }
  hold(address, ms = 15000) { this.inUse.set(address, this.now() + ms); }
  release(address) { this.inUse.delete(address); }
  bobs() { return (this.cfg.share?.borrow?.bobs || []).filter((x) => cleanAddress(x.address)); }

  // His door on our home network, when he said he has one there and it hasn't failed lately; else ''.
  nearOf(bob) { const a = this.near.get(bob.address); return a && !(this.nearDown.get(bob.address) > this.now()) ? a : ''; }
  // From his hello: keep only an address on our own home network (never a public one, never another network).
  learnNear(bob, list) {
    const mine = this.home();
    const pick = (Array.isArray(list) ? list : []).map((x) => String(x)).find((x) => { const m = x.match(/^([\d.]+):(\d{1,5})$/); return m && isHomeIp(m[1]) && mine.some((h) => sameNet(h.address, m[1], h.netmask)); });
    if (pick) this.near.set(bob.address, pick); else this.near.delete(bob.address);
  }

  async call(bob, path, { method = 'GET', body, signal, timeout = HELLO_MS } = {}) {
    // Over his home-network door first when he has one (Also over the home network); if that doesn't answer, over
    // Tailscale, and the home network isn't tried again for a while.
    const near = this.nearOf(bob);
    if (near) {
      try { return await this.callAt(bob, near, path, { method, body, signal, timeout: Math.min(timeout, 4000) }); }
      catch (e) {
        if (signal?.aborted) throw e;
        this.nearDown.set(bob.address, this.now() + 10 * 60000);
        // A sent job or chat that timed out may have got there: never send it twice. It didn't connect at all: Tailscale.
        if (method !== 'GET' && /timeout|abort/i.test(`${e?.name} ${e?.message}`)) throw e;
      }
    }
    return this.callAt(bob, bob.address, path, { method, body, signal, timeout });
  }

  async callAt(bob, at, path, { method = 'GET', body, signal, timeout = HELLO_MS } = {}) {
    // The timeout covers getting an answer started (headers). It is cleared then, so a long streamed reply isn't cut off:
    // after that only the caller's own signal (the first-word and quiet timers in chat()) can stop it.
    const go = async () => {
      const t = new AbortController();
      const timer = setTimeout(() => t.abort(new Error('timeout')), timeout);
      const sig = signal ? AbortSignal.any([signal, t.signal]) : t.signal;
      try { return await this.fetch(`http://${at}${path}`, { method, redirect: 'manual', signal: sig, headers: { ...(body ? { 'content-type': 'application/json', 'x-bob': '1' } : {}), ...(this.cookies.has(bob.address) ? { cookie: this.cookies.get(bob.address) } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
      finally { clearTimeout(timer); }
    };
    let r = await go();
    if (r.status === 401) { await this.login(bob, signal, at); r = await go(); }
    return r;
  }

  async login(bob, signal, at = bob.address) {
    const t = AbortSignal.timeout(HELLO_MS);
    const r = await this.fetch(`http://${at}/login`, { method: 'POST', redirect: 'manual', signal: signal ? AbortSignal.any([signal, t]) : t, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: String(bob.passcode || '') }).toString() });
    const set = String(r.headers.get('set-cookie') || '').match(/bob_auth=[0-9a-f]+/);
    if (r.status !== 303 || !set) throw new Error(r.status === 429 ? 'too many tries' : 'passcode not accepted');
    this.cookies.set(bob.address, set[0]);
  }

  // Is this Bob there and willing? Remembered for a short while, so a gaming PC doesn't knock on every reply.
  async hello(bob, { force = false } = {}) {
    const s = this.state.get(bob.address);
    if (!force && s && this.now() - s.at < (s.ok ? GOOD_FOR : DOWN_FOR)) return s;
    let out;
    try {
      const r = await this.call(bob, '/api/lend/hello');
      const j = await r.json().catch(() => ({}));
      out = r.ok && j.lend === true && !j.busy ? { ok: true, brain: String(j.brain || '').slice(0, 60), device: String(j.device || '').slice(0, 20) } : { ok: false, why: j.busy || (r.status === 401 ? 'passcode not accepted' : r.status === 403 ? 'door closed' : `answered ${r.status}`) };
      // 1.5.72: what this Bob says he can do. ctx: his quick brain's room; speed: words a second he's seen lately;
      // jobs: whole jobs he takes (only with "Take jobs from my other Bobs" on there), and how busy his queue is.
      if (r.ok) Object.assign(out, cleanAbilities(j));
      if (r.ok) this.learnNear(bob, j.home);
    } catch (e) { out = { ok: false, why: /passcode|tries/.test(e.message) ? e.message : 'not reachable' }; }
    const seen = this.state.get(bob.address);
    if (seen?.measured) out.measured = seen.measured; // what we timed ourselves outlives a hello
    if (seen?.reviewDownUntil) out.reviewDownUntil = seen.reviewDownUntil; // #30: a review he couldn't do, too
    out.at = this.now();
    this.state.set(bob.address, out);
    return out;
  }

  // Keeps what he told us he can do (his room, his jobs) and what we timed; only today's yes becomes a no.
  markDown(bob, why) { const s = this.state.get(bob.address) || {}; this.state.set(bob.address, { ...s, ok: false, why, at: this.now() }); }

  // The first of your Bobs (in your order) that says yes and isn't already thinking for us, or null.
  // `skip`: addresses already tried for this reply. The pick is held for a moment, so a second reply at the same time
  // goes to the next Bob on the list instead of queueing behind this one.
  //
  // 1.5.72, smarter: every free Bob is asked at once, and only those with room for this chat count (a phone with a small
  // brain is never handed a chat it would have to turn down). Of those, the one that still has our chat in mind (used in
  // the last 10 minutes, so he doesn't read it all again) goes first, then the fastest, going by what we timed ourselves
  // or what he says. Your order breaks ties.
  async pick({ skip = [], tokens = 0 } = {}) {
    const list = this.bobs().filter((b) => !skip.includes(b.address) && !this.busyHere(b.address));
    const seen = await Promise.all(list.map((b) => this.hello(b).catch(() => ({ ok: false }))));
    const fits = list.map((bob, i) => ({ bob, s: seen[i], i })).filter(({ s }) => s.ok && (!s.ctx || !tokens || tokens + REPLY_ROOM <= s.ctx));
    if (!fits.length) return null;
    const now = this.now();
    const warm = (s) => (s.measured?.lastUsed && now - s.measured.lastUsed < WARM_FOR ? 1 : 0);
    const speed = (s) => s.measured?.tokPerSec || s.speed || 0;
    fits.sort((a, b) => (warm(b.s) - warm(a.s)) || (speed(b.s) - speed(a.s)) || (a.i - b.i));
    const { bob, s } = fits.find((x) => !this.busyHere(x.bob.address)) || {};
    if (!bob) return null;
    this.hold(bob.address);
    return { ...bob, brain: s.brain, device: s.device };
  }

  // 1.5.72: the Bob for a whole job: he must say he takes jobs, list this kind as one he can do right now, and not be
  // gaming or full. The least busy goes first (fewest jobs in his Tasks), your order breaking ties.
  async pickForJob(need) {
    const list = this.bobs().filter((b) => !this.busyHere(`job:${b.address}`));
    const seen = await Promise.all(list.map((b) => this.hello(b).catch(() => ({}))));
    const can = list.map((bob, i) => ({ bob, s: seen[i], i })).filter(({ s }) => s.takesJobs && s.jobs?.includes(need) && !s.jobsBusy && !(s.jobsDownUntil > this.now()));
    can.sort((a, b) => ((a.s.queue || 0) - (b.s.queue || 0)) || (a.i - b.i));
    const pick = can[0];
    if (!pick) return null;
    this.hold(`job:${pick.bob.address}`, 3000); // two jobs at once spread out
    return { ...pick.bob, brain: pick.s.brain, device: pick.s.device };
  }
  // #30: the Bob to check work on his Review brain: he says he reviews, isn't thinking for us already, and his Review brain
  // is good enough (its file at least `minGB`, so a phone's small brain never signs off on a big brain's work). Your order.
  async pickForReview({ minGB = 0, log = null } = {}) {
    const list = this.bobs().filter((b) => !this.busyHere(b.address));
    const seen = await Promise.all(list.map((b) => this.hello(b).catch(() => ({}))));
    // Two-Bob trial (Test D): the logbook says why a Bob was passed over, not only that he was.
    if (log) list.forEach((bob, i) => { const until = seen[i]?.reviewDownUntil; if (until > this.now()) log(`skipping ${bob.name} for ${Math.max(1, Math.ceil((until - this.now()) / 60000))} more min after he couldn't finish a check`); });
    const ok = list.map((bob, i) => ({ bob, s: seen[i] })).filter(({ s }) => s.review?.brain && !(s.reviewDownUntil > this.now()) && (s.review.gb || 0) >= minGB);
    const pick = ok[0];
    if (!pick) return null;
    this.hold(pick.bob.address);
    return { ...pick.bob, brain: pick.s.review.brain, gb: pick.s.review.gb, device: pick.s.device };
  }
  // He couldn't do a review: don't ask him again for a few minutes (his quick replies are a separate matter).
  noteReview(bob) { const s = this.state.get(bob.address) || { ok: false, at: this.now() }; s.reviewDownUntil = this.now() + 5 * 60000; this.state.set(bob.address, s); }

  // Has any of your Bobs said he can do this kind of job at all (even if he's busy now)?
  anyCould(need) { return this.bobs().some((b) => this.state.get(b.address)?.jobs?.includes(need)); }
  // He turned a job down (or couldn't be reached): don't offer him jobs for a minute.
  noteJobs(bob, why) { const s = this.state.get(bob.address) || { ok: false, at: this.now() }; s.jobsBusy = why; s.jobsDownUntil = this.now() + 60000; this.state.set(bob.address, s); }

  // Why none of your Bobs can take a reply this size right now, for the logbook.
  tooBigFor(tokens) { return this.bobs().filter((b) => { const s = this.state.get(b.address); return s?.ok && s.ctx && tokens + REPLY_ROOM > s.ctx; }).map((b) => b.name); }

  note(bob, m) { const s = this.state.get(bob.address) || { ok: true, at: this.now() }; s.measured = { ...(s.measured || {}), ...m }; this.state.set(bob.address, s); }

  // Would a reply be borrowed right now, going by what we already know (no network)? wake() uses this, so a Bob
  // that's about to borrow doesn't load his own brain while someone types.
  likely() { return this.bobs().some((b) => this.state.get(b.address)?.ok && this.now() - this.state.get(b.address).at < GOOD_FOR); }

  // One reply from a lender, same shape as engine.chat's. Throws if it can't (the caller thinks for itself).
  async chat(bob, { messages, tools, signal, onToken, from, want, kind }) {
    const checking = kind === 'check'; // 1.5.185: a reviewer's check on his bigger Review brain
    const quiet = new AbortController();
    const sig = signal ? AbortSignal.any([signal, quiet.signal]) : quiet.signal;
    let timer = setTimeout(() => quiet.abort(), this.firstWordMs);
    const kick = () => { clearTimeout(timer); timer = setTimeout(() => quiet.abort(), this.quietMs); };
    const plain = messages.map((m) => { const { images, hidden, correction, ...rest } = m; return rest; });
    this.hold(bob.address, 24 * 3600 * 1000); // while it thinks; released below
    this.live.set(bob.address, 'thinking');
    const t0 = this.now();
    let firstAt = 0, words = 0;
    const cap = setTimeout(() => { if (!firstAt) quiet.abort(); }, checking ? Math.max(this.firstWordMaxMs, this.checkFirstWordMaxMs) : want === 'review' ? Math.max(this.firstWordMaxMs, this.reviewWaitMs) : this.firstWordMaxMs); // "still loading" can't hold a reply forever
    try {
      const r = await this.call(bob, '/api/lend/chat', { method: 'POST', body: { protocol: PROTOCOL, from, messages: plain, tools: tools || [], ...(want ? { want } : {}), ...(checking ? { kind: 'check' } : {}) }, signal: sig, timeout: this.firstWordMs });
      if (r.status === 409) {
        const j = await r.json().catch(() => ({}));
        if (j.busy === 'too long' && Number(j.ctx) > 0) { this.note(bob, {}); this.state.get(bob.address).ctx = Number(j.ctx); } // he told us his room: remember it
        throw Object.assign(new Error(`said no (${j.busy || 'busy'})`), { busy: true, why: j.busy });
      }
      if (!r.ok) throw new Error(`answered ${r.status}`);
      let buf = '', reply = null;
      const dec = new TextDecoder();
      for await (const chunk of r.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
          if (!line.startsWith('data:')) continue;
          const ev = JSON.parse(line.slice(5));
          kick();
          // Any event counts as life, including a lender's { type: 'loading' } and { type: 'reading', done, of } while it starts.
          if (ev.type === 'token' && typeof ev.text === 'string') { if (!firstAt) firstAt = this.now(); words++; onToken?.(ev.text); }
          else if (ev.type === 'error' && ev.busy) { // a phone finds out it's too long only once it starts reading (1.5.72)
            if (ev.busy === 'too long' && Number(ev.ctx) > 0) { this.note(bob, {}); this.state.get(bob.address).ctx = Number(ev.ctx); }
            throw Object.assign(new Error(`said no (${ev.busy})`), { busy: true, why: String(ev.busy) });
          }
          else if (ev.type === 'error') throw new Error(String(ev.error || 'failed'));
          else if (ev.type === 'done') reply = ev.reply;
        }
      }
      if (!reply) throw new Error('stopped mid-answer');
      const secs = (this.now() - (firstAt || t0)) / 1000;
      this.note(bob, { lastUsed: this.now(), firstWordMs: (firstAt || this.now()) - t0, ...(words > 8 && secs > 0.2 ? { tokPerSec: Math.round((words / secs) * 10) / 10 } : {}) });
      const calls = Array.isArray(reply.tool_calls) ? reply.tool_calls.filter((c) => c?.function?.name).map((c) => ({ function: { name: String(c.function.name), arguments: c.function.arguments && typeof c.function.arguments === 'object' ? c.function.arguments : {} } })) : [];
      return { role: 'assistant', content: String(reply.content || ''), tool_calls: calls.length ? calls : undefined };
    } catch (e) {
      if (signal?.aborted) throw e;
      if (checking) checkDown(this, bob); // his quick replies are still fine
      else if (e.why !== 'too long') this.markDown(bob, e.busy ? (e.why || 'busy') : quiet.signal.aborted ? 'too slow' : 'not reachable'); // too long: he's still fine for shorter chats
      throw quiet.signal.aborted ? new Error('too slow') : e;
    } finally { clearTimeout(timer); clearTimeout(cap); this.live.delete(bob.address); this.hold(bob.address, 5000); }
  }
}

// ---------- What a Bob can do (1.5.72) ----------
export const NEEDS = ['pictures', 'video', 'music', 'sfx', 'model3d', 'web', 'think'];
export function cleanAbilities(j) {
  const n = (x, max) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.min(Number(x), max) : 0);
  const out = { ctx: n(j?.ctx, 1048576), speed: n(j?.speed, 1000), takesJobs: j?.takesJobs === true };
  out.jobs = out.takesJobs ? [].concat(j?.jobs || []).filter((x) => NEEDS.includes(x)) : [];
  out.jobsBusy = typeof j?.jobsBusy === 'string' ? j.jobsBusy.slice(0, 40) : '';
  out.queue = n(j?.queue, 999);
  out.passAlong = j?.passAlong === true; // 1.5.123: he introduces his Bobs to each other
  // 1.5.137: his room (graphics card and memory, in GB), so the Brain catalogue knows which brains a Bob on the
  // Bob-Net could run. Numbers only; a Bob that doesn't say (the phone, an older Bob) simply has no room listed.
  const r = j?.room && typeof j.room === 'object' ? { vramGB: n(j.room.vramGB, 4096), ramGB: n(j.room.ramGB, 16384) } : null;
  if (r && (r.vramGB || r.ramGB)) out.room = r;
  // #30: his Review brain, for checking work over Bob-Net (name, room, file size in GB so the asker can judge it).
  if (j?.review && typeof j.review === 'object' && j.review.brain) out.review = { brain: String(j.review.brain).slice(0, 60), ctx: n(j.review.ctx, 1048576), gb: n(j.review.gb, 1024) };
  const check = cleanCheck(j); // 1.5.185: he checks harder jobs on his Review brain
  if (check) out.check = check;
  if (typeof j?.name === 'string' && j.name.trim()) out.hisName = j.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
  return out;
}

// 1.5.137: the rooms of the Bobs on your Bob-Net, from their last hellos (cached, no network): [{ name, vramGB, ramGB }].
// Phones are left out: the catalogue's brains are for computers.
export const bobNetRooms = (L) => (L?.bobs?.() || []).map((b) => ({ b, s: L.state?.get(b.address) || {} }))
  .filter(({ s }) => s.room && s.device !== 'phone').map(({ b, s }) => ({ name: b.name, vramGB: s.room.vramGB || 0, ramGB: s.room.ramGB || 0 }));

// The hello a desktop lender gives: quick replies (lend) and, with "Take jobs from my other Bobs" on, the whole jobs he
// can really do on this computer right now. Never a job he'd have to fake: no picture model, no pictures.
export function helloFor(brain, { why, quick, can, version, label, webOn, bigBrain, name = '', room = null, review = null, check = {} }) {
  const takesJobs = brain.cfg.share?.takeJobs === true && doorOpen(brain.cfg);
  const jobs = takesJobs ? [can.pictures && 'pictures', can.video && 'video', can.music && 'music', can.sfx && 'sfx', webOn && bigBrain && 'web', bigBrain && 'think'].filter(Boolean) : [];
  return {
    protocol: PROTOCOL, lend: why !== 'off', busy: why === 'off' ? undefined : why || undefined,
    brain: quick ? label(quick.model) : '', ctx: quick?.ctx || 0, speed: brain.engine?.lastStats?.tokPerSec || 0,
    device: 'computer', version, takesJobs, jobs, jobsBusy: takesJobs ? guestRefusal(brain) : '', queue: brain.queue?.filter?.((j) => j.state === 'waiting' || j.state === 'working').length || 0,
    name, passAlong: brain.cfg.share?.passAlong === true, // 1.5.123: for the party in Now running
    lendCard: brain.cfg.share?.lendCard === true && doorOpen(brain.cfg), // Lend my graphics card (src/share-card.js)
    ...(review?.model ? { review: { brain: label(review.model), ctx: review.ctx || 0, gb: review.gb || 0 } } : {}), // #30: checks work for his other Bobs
    // Also over the home network (off unless switched on): where this Bob's door is on the home network too.
    home: brain.cfg.remote?.homeNet === true && doorOpen(brain.cfg) ? homeIps().map((m) => `${m.address}:${brain.cfg.port}`).slice(0, 4) : [],
    ...check, // 1.5.185 Check harder jobs for my other Bobs (src/bob-net-check.js checkHello)
    ...(room ? { room } : {}) // 1.5.137: graphics card and memory in GB, for the other Bob's Brain catalogue
  };
}

// Why this Bob won't take a whole job right now, or ''. Gaming: the card and processor are the game's.
export function guestRefusal(brain, { currentSession = brain.lendDeps?.currentSession } = {}) {
  if (brain.cfg.share?.takeJobs !== true || !doorOpen(brain.cfg)) return 'off';
  if (currentSession?.(brain.cfg)?.id === 'light') return 'gaming';
  const guests = brain.queue?.filter?.((j) => j.guest && (j.state === 'waiting' || j.state === 'working')).length || 0;
  if (guests >= 2) return 'busy';
  if ((brain.queue?.filter?.((j) => j.state === 'waiting').length || 0) >= 3) return 'busy';
  return '';
}
