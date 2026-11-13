// Talking to the brain safely and asking the person: retries, Make another picture?, approval cards, questions, and
// what happens when something throws. Methods of the Brain class. Split out of brain.js.
import crypto from 'node:crypto';
import { bigSession, chatBrain, sameModel } from './brain-mode.js';
import { turnNow } from './turn-log.js';
import { carryOnTokens, engineFailKind, backoffMs, causeLine, pause } from './retry.js';
import { memoryFailure } from './engine-care.js';
import { todayOn } from './hands-settings.js';
import { awakeTimeout, timersFor } from './hang-guard.js';
import { noteWait } from './loop-guard.js';
import { saveSettings } from './config.js';
import { pickedCtx, GAMING_CTX } from './model-ctx.js';
import { gaming } from './sessions.js';
import { MORE_SECONDS, thinkStream, fitContext, TOO_LONG, APPROVAL_TIMEOUT_MS, UNCAUGHT_QUIET_MS } from './brain-words.js';
import { apuRoom } from './brain-lanes.js';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const askingParts = {
  // ---------- "Make another picture?" ----------
  // After a picture shown without the brain coming back, the chat box asks for 10 seconds. Yes: the picture engine
  // stays loaded for the next one (another full grace, 2 minutes or the idle time). No, no answer, or a new job: the
  // picture engine lets go and the quick brain comes back. Only when the engine is really still loaded.
  offerMore(sessionId, kind = 'image') {
    if (!this.painter?.alive?.()) return null;
    this.endMore(null, 'replaced');
    const id = crypto.randomUUID();
    const seconds = MORE_SECONDS;
    const timer = setTimeout(() => this.answerMore(id, false, 'no answer'), seconds * 1000);
    timer.unref?.();
    this.morePictures = { id, sessionId, timer, asked: true };
    this.broadcast({ type: 'more-pictures', id, sessionId, seconds, kind: kind === 'video' ? 'video' : 'image' });
    this.log('painter', 'asked "make another?"');
    return id;
  },
  // more: true (Yes), false (No). how: 'click', 'no answer', 'new job'. Returns false for an old or unknown card.
  answerMore(id, more, how = 'click') {
    const m = this.morePictures;
    if (!m || !id || m.id !== id || !m.asked) return false;
    clearTimeout(m.timer);
    this.broadcast({ type: 'more-pictures-done', id: m.id, sessionId: m.sessionId, more: Boolean(more) });
    this.log('painter', `"make another?": ${more ? 'yes' : 'no'} (${how})`);
    if (more) {
      // Held for the next picture: a fresh grace on the engine, and the brain stays away until then.
      this.painter?.armIdle?.();
      const until = setTimeout(() => this.endMore(m.id, 'grace over'), this.painter?.graceMs?.() || 120000);
      until.unref?.();
      this.morePictures = { id: m.id, sessionId: m.sessionId, timer: until, asked: false };
      return true;
    }
    this.endMore(m.id, how);
    return true;
  },
  // Let go of the picture engine and bring the brain back (No, no answer, Yes's grace over).
  endMore(id, why) {
    const m = this.morePictures;
    if (!m || (id && m.id !== id)) return;
    clearTimeout(m.timer);
    this.morePictures = null;
    if (m.asked) this.broadcast({ type: 'more-pictures-done', id: m.id, sessionId: m.sessionId, more: false });
    if (why === 'replaced' || why === 'new job') return; // the next job loads what it needs through the gate
    (async () => {
      if (this.turns.size) return;
      await this.painter?.unload?.('done making pictures').catch?.(() => {});
      if (!this.turns.size && !bigSession(this.cfg)) await this.wake('back to the quick brain after pictures');
      this.broadcast({ type: 'brain' });
    })().catch(() => {});
  },
  // The brain a job falls back to when another brain won't load.
  fallbackBrain() { return chatBrain(this.cfg); },
  // A chat call that survives the engine dropping out mid-answer: the brain is loaded again and the call made once more.
  async chatSafe(opts, { emit, who = 'bob' } = {}) {
    // 1.5.53: while a "Bob's thinking" window is open, his thinking streams to it, a few times a second (never saved).
    const mind = emit && this.mindWatchers?.() ? thinkStream(emit, who, opts.model) : null;
    if (mind) opts = { ...opts, onThink: mind.push };
    // Reliability 221: a brain that loaded with a smaller chat memory (memory was short) is fitted to what it really has.
    if (!opts.beside && opts.ctx) { const real = this.engine?.realCtx?.(opts.model, opts.ctx, opts.cpu); if (real && real !== opts.ctx) opts = { ...opts, ctx: real }; }
    const per = this.engine?.charsPerToken?.(opts.model) || 3; // item 3: the brain's own figure once known
    const fitted = fitContext(opts.messages, opts.ctx, opts.tools, 0.75, per);
    if (fitted !== opts.messages) { this.log('chat', `shortened tool results so the chat fits in ${opts.model}'s memory (${opts.ctx} tokens)`); opts = { ...opts, messages: fitted }; }
    { const t = turnNow(); if (t) t.asks++; } // item 246: steps per job
    try { const r = await this.chatRetry(opts, { emit, who }); this.engineNotes(emit); return r; }
    catch (e) {
      // Still too long (the guess at token counts was low): once more, with every tool result cut harder.
      if (opts.signal?.aborted || !TOO_LONG.test(String(e?.message)) || !(Number(opts.ctx) > 0)) throw e;
      const tighter = fitContext(opts.messages, opts.ctx, opts.tools, 0.4, per);
      if (tighter === opts.messages) throw e;
      this.log('chat', `the brain said the chat was too long (${String(e.message).slice(0, 120)}); cut the tool results harder and asked again`);
      return await this.chatRetry({ ...opts, messages: tighter }, { emit, who });
    }
    finally { mind?.flush(); }
  },
  // Items 193-195, 201 (retry.js): a call that fails for a reason a second try can fix goes again.
  //   busy (503, "loading model"): wait a little longer each time, with a bit of randomness, and ask again (3 tries)
  //   dropped out, or out of memory: load the brain again and ask once more
  //   that failed too: the next brain that fits takes the job, once, and says so
  // The words already shown stay on screen: the retry's words that repeat them aren't shown twice (carryOnTokens).
  async chatRetry(opts, { emit, who }) {
    const ledger = this.gate.ledgerOf(opts.signal);
    let shown = '';
    const mine = opts.onToken;
    const record = (o) => (mine ? { ...o, onToken: (t) => { shown += t; mine(t); } } : o);
    const again = (o) => {
      if (!mine || !shown) return { o: record(o), fin: () => {} };
      const was = shown;
      const c = carryOnTokens(was, (t) => { shown += t; mine(t); }, (n) => { shown = shown.slice(0, Math.max(0, shown.length - n)); emit?.({ type: 'token-undo', chars: n }); });
      shown = was; // what's on screen now; carryOnTokens adds only what's new
      return { o: { ...o, onToken: c.onToken }, fin: () => c.finish() };
    };
    const call = async (o) => { const r = again(o); try { return await this.engine.chat(r.o); } finally { r.fin(); } };
    let model = opts.model;
    let lastErr = null;
    for (let busy = 0; ; ) {
      try { return await (lastErr ? call({ ...opts, model }) : this.engine.chat(record(opts))); }
      catch (e) {
        if (opts.signal?.aborted) throw e;
        const kind = engineFailKind(e);
        if (kind !== 'busy' || busy >= 2) { lastErr = e; break; }
        busy++;
        const wait = backoffMs(busy - 1, { base: 1500 });
        this.log('handoff', `${model} is busy (${causeLine(e).slice(0, 160)}); asking again in ${Math.round(wait / 100) / 10} s`);
        ledger?.step('retry', { what: model, why: e.message, attempt: busy + 1 }).done();
        await pause(wait, opts.signal);
        lastErr = e;
      }
    }
    const e = lastErr;
    let kind = engineFailKind(e);
    // Nov 12 (Legion Go): the reply only said it failed, or that its batch was out of step, but the engine's own last
    // words say it ran out of memory (vk::Device::allocateMemory): that is an out-of-memory failure.
    if (kind !== 'memory' && kind !== 'busy' && this.cfg.sharedGraphics === true && memoryFailure(this.engine.lastWords?.() || '')) kind = 'memory';
    let alive = true;
    try { alive = await this.engine.isLoaded(model, { cpu: opts.cpu, ctx: opts.ctx, beside: opts.beside }); } catch { alive = false; }
    if (alive && kind !== 'dropped' && kind !== 'memory' && kind !== 'state') throw e;
    this.log('handoff', `${model} ${kind === 'memory' ? 'ran out of memory' : kind === 'state' ? 'lost its place in the chat' : 'dropped out'} mid-answer (${causeLine(e).slice(0, 200)}); loading it again`);
    ledger?.step('retry', { what: model, why: e.message }).done();
    this.setState('loading', 'My brain dropped out; loading it again', model);
    emit?.({ type: 'retry-note', text: 'My brain dropped out there. Loading it again and carrying on.' });
    // Nov 12 (apu-fit.js): on built-in graphics the next load uses less memory (less on the graphics, then a shorter
    // chat memory), and the brain keeps that. An engine out of step starts fresh, without reusing its old reading.
    if (kind === 'memory' && !opts.beside) this.engine.apuStepDown?.(model, { cpu: opts.cpu, ctx: opts.ctx, why: causeLine(e) });
    if (kind === 'state' && !opts.beside && this.engine.noReuse && !this.engine.noReuse.has(model)) { this.engine.noReuse.add(model); this.log('handoff', `${model}: starting its engine fresh without reusing its earlier reading of the chat (until Bob restarts)`); }
    if (kind === 'memory' || kind === 'state') await this.engine.unload?.(model, { cpu: opts.cpu, ...(opts.beside ? { beside: true } : {}) })?.catch?.(() => {});
    const load = (m, o) => this.ensureModel(m, emit || (() => {}), opts.signal, who, o);
    model = (await load(model, { cpu: opts.cpu, ctx: opts.ctx, ...(opts.beside ? { beside: true } : {}) })) || model;
    // A shorter chat memory than before: the chat is fitted to it again.
    let again2 = { ...opts, model };
    const real = !opts.beside && opts.ctx ? this.engine?.realCtx?.(model, opts.ctx, opts.cpu) : null;
    if (real && real < opts.ctx) again2 = { ...again2, ctx: real, messages: fitContext(opts.messages, real, opts.tools, 0.75, this.engine?.charsPerToken?.(model) || 3) };
    try { return await call(again2); }
    catch (e2) {
      if (opts.signal?.aborted || !engineFailKind(e2)) throw e2;
      // Item 201: this brain keeps failing the job. The next brain that fits takes it, once, and says so.
      const next = !opts.beside && !ledger?.brainMoved ? this.fallbackBrain() : null;
      if (!next?.model || sameModel(next.model, model)) throw e2;
      if (ledger) ledger.brainMoved = true;
      ledger?.step('fallback', { from: model, to: next.model, why: e2.message }).done();
      this.log('handoff', `${model} failed twice in this job (${causeLine(e2).slice(0, 160)}); ${next.model} takes it over`);
      // A new brain writes its own answer: the half one on screen is taken back first, so nothing shows twice.
      if (shown) { emit?.({ type: 'token-undo', chars: shown.length }); shown = ''; }
      emit?.({ type: 'announce', text: `My ${this.brainLabel(model, who)} kept failing on this, so my ${this.brainLabel(next.model, 'bob')} is taking it over.` });
      const m2 = (await load(next.model, { cpu: next.cpu, ctx: next.ctx })) || next.model;
      return this.engine.chat(record({ ...opts, model: m2, cpu: next.cpu }));
    }
  },
  // Asks the user. need: a string, or { text, diff, plan, command, cwd } (plan = rows the user can tick one by one,
  // command = the exact command line). Resolves false, true or 'all'; when the card had rows, out.picked holds
  // the ids the user ticked (null = all of them).
  // need.together (1.5.42, together.js): every OK a job needs on one card. Resolves { allow, items }, where items
  // is null for Allow all / Deny all, else the steps the person ticked ([{ n, rows? }]).
  // need.planCard (1.5.78, plan.js): Bob's plan for a big job, with any OKs it needs as need.together. Resolves
  // { allow, items, note }: note is the change the person asked for in their own words (then allow is false).
  async approve(need, emit, signal, group, { hand = false, out = {}, id = crypto.randomUUID() } = {}) {
    const prev = this.state;
    const text = typeof need === 'string' ? need : need.text;
    this.setState('waiting', text);
    const card = { type: 'approval', id, text, diff: need.diff, allowAll: Boolean(group) };
    if (Array.isArray(need.plan)) card.plan = need.plan;
    if (need.command) { card.command = need.command; card.cwd = need.cwd || ''; if (!need.pack && !need.mcp && todayOn(this.cfg)) card.today = true; if (need.where) card.where = String(need.where).slice(0, 120); if (need.mcp) card.mcp = need.mcp; if (need.pack) card.pack = need.pack; if (need.button) card.button = String(need.button).slice(0, 30); }
    if (hand) card.hand = true;
    if (Array.isArray(need.together)) card.together = need.together.map(({ key, ...it }) => it);
    if (need.planCard) { card.planCard = need.planCard; card.allowAll = false; }
    if (need.newTool) { card.newTool = need.newTool; if (need.button) card.button = String(need.button).slice(0, 30); card.allowAll = false; } // 1.5.48 (selftools.js)
    emit(card);
    if (hand) this.handApprovals.add(id);
    let picked = null, steps = null, note = '';
    const waitFrom = Date.now(); // Reliability 163: time on a card doesn't count toward the turn's ceiling
    const allowed = await new Promise((resolve) => {
      // Item 217: the 10 minutes don't count time the PC spent asleep; item 215: the timer goes with the turn; item 196: a time-out isn't a no.
      const timer = awakeTimeout(() => { out.timedOut = true; done(false); }, this.approvalMs || APPROVAL_TIMEOUT_MS, { bag: timersFor(signal), ...(this.approvalMs ? { tick: Math.max(5, Math.round(this.approvalMs / 3)) } : {}) }); // through done(), so the card leaves the list too
      const done = (v, rows, items, said) => { timer.clear(); this.approvals.delete(id); this.waitingCards?.delete(id); this.handApprovals.delete(id); picked = rows ?? null; steps = items ?? null; note = typeof said === 'string' ? said.slice(0, 500) : ''; resolve(v); };
      this.approvals.set(id, done);
      signal.addEventListener('abort', () => done(false), { once: true });
    });
    noteWait(signal, Date.now() - waitFrom);
    if (Array.isArray(need.together) || need.planCard) {
      const ns = new Set((need.together || []).map((i) => i.n));
      const items = Array.isArray(steps) && ns.size ? steps.filter((p) => ns.has(Number(p?.n))).map((p) => ({ n: Number(p.n), rows: Array.isArray(p.rows) ? p.rows.map(String) : undefined })) : null;
      const said = need.planCard ? note.trim() : '';
      const allow = Boolean(allowed) && !said && !(items && !items.length && !need.planCard);
      emit({ type: 'approval-result', id, allowed: allow });
      this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model);
      return { allow, items: allow ? items : null, ...(said ? { note: said } : {}) };
    }
    if (Array.isArray(need.plan)) {
      const ok = new Set(need.plan.filter((r) => !r.blocked).map((r) => r.id));
      out.picked = Array.isArray(picked) ? picked.map(String).filter((x) => ok.has(x)) : null;
      if (allowed && out.picked && !out.picked.length) { emit({ type: 'approval-result', id, allowed: false }); this.log('approval', `nothing ticked: ${text}`); this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model); return false; }
    }
    emit({ type: 'approval-result', id, allowed: Boolean(allowed) });
    const rowsNote = Array.isArray(need.plan) && out.picked ? ` (${out.picked.length} of ${need.plan.length} rows ticked)` : '';
    this.log('approval', `${allowed === 'today' ? 'allowed here for today' : allowed === 'all' ? 'allowed (rest of job)' : allowed ? 'allowed' : 'denied'}: ${text}${need.command ? ` [${need.command}]` : ''}${allowed ? rowsNote : ''}`);
    this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model);
    return allowed;
  },
  // Item 25 ask_user: one question with choices on a card. Resolves with the words of the pick (or what they typed
  // under "Something else"); nothing in 10 minutes, or Stop, and Bob carries on with his best guess.
  async askUser({ question, choices }, ctx) {
    const who = this.cfg.userName || 'the user';
    const q = String(question || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const list = [...new Set([].concat(choices || []).map((c) => String(c ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean))].slice(0, 6);
    if (!q || list.length < 2) throw new Error('ask_user needs a question and at least 2 choices.');
    if (ctx?.job?.guest) return `Not for this job: ask ${ctx.job.guest.from} in your reply instead.`;
    const id = crypto.randomUUID();
    const prev = this.state;
    this.setState('waiting', q);
    ctx.emit({ type: 'approval', id, text: q, ask: { question: q, choices: list }, sessionId: ctx.sessionId });
    const waitFrom = Date.now(); // Reliability 163
    const said = await new Promise((resolve) => {
      const timer = awakeTimeout(() => done(false), APPROVAL_TIMEOUT_MS, { bag: timersFor(ctx.signal) }); // items 215, 217
      const done = (v, rows, items, note) => { timer.clear(); this.approvals.delete(id); resolve(v ? String(note || '').trim().slice(0, 500) : ''); };
      this.approvals.set(id, done);
      ctx.signal?.addEventListener('abort', () => done(false), { once: true });
    });
    noteWait(ctx.signal, Date.now() - waitFrom);
    ctx.emit({ type: 'approval-result', id, allowed: Boolean(said) });
    this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model);
    this.log('approval', `asked a question with ${list.length} choices: ${said ? 'answered' : 'no answer'}`); // item 248: the question and answer stay in the chat
    return said ? `${who} picked: ${said}` : `${who} didn't answer. Carry on with your best guess and say which you picked.`;
  },
  // rows: for a card with a plan, the ids of the rows the user ticked.
  // items: for a card with every OK on it (together.js), the steps the person ticked: [{ n, rows? }].
  // note: on a plan card (plan.js), the change the person asked for.
  answerApproval(id, allow, rows, items, note) {
    const done = this.approvals.get(id);
    if (!done) return false;
    done(allow === 'all' || allow === 'today' ? allow : Boolean(allow), Array.isArray(rows) ? rows.slice(0, 1000).map(String) : null, Array.isArray(items) ? items.slice(0, 100) : null, typeof note === 'string' ? note : '');
    return true;
  },
  // Item 203: an error nothing caught (server.js). It used to be only logged, and a job could sit on Working for good.
  // A job on Working with no turn running is marked failed now, and its chat says so. A turn that is running gets
  // UNCAUGHT_QUIET_MS: if it shows no sign of life after the error in that time (and isn't waiting on a card), it is
  // stopped and marked failed the same way.
  onUncaught(e, { quietMs = UNCAUGHT_QUIET_MS } = {}) {
    const at = Date.now();
    const why = String(e?.message || e || 'an error').replace(/\s+/g, ' ').slice(0, 200);
    try { this.log('error', `uncaught: ${causeLine(e).slice(0, 400)}`); } catch {}
    const fail = (j) => {
      if (!j || j.state !== 'working') return;
      j.state = 'failed'; j.error = `Something broke inside Bob: ${why}`.slice(0, 200); j.doneAt = Date.now();
      for (const st of j.steps || []) if (st.state === 'in progress') st.state = 'failed';
      this.broadcast({ type: 'error', sessionId: j.sessionId, turnId: j.id, text: `⚠ ${j.error}. Try again runs it from the start.` });
      if (!j.guest) { try { const sess = this.session(j.sessionId); sess.push({ role: 'assistant', content: '', correction: `⚠ ${j.error}`, failed: true, at: Date.now() }); this.saveSession(j.sessionId); } catch {} }
      this.log('error', `job marked failed after an uncaught error: ${String(j.text || '').slice(0, 60)}`);
    };
    const running = new Set([...this.turns.values()].map((t) => t.turnId));
    let changed = false;
    for (const j of this.queue || []) if (j.state === 'working' && !j.away && !running.has(j.id)) { fail(j); changed = true; }
    if (changed) { try { this.saveQueue(); } catch {} setTimeout(() => this.pump(), 0); }
    if (!running.size) return;
    const t = setTimeout(() => {
      for (const [lane, turn] of [...this.turns.entries()]) {
        if (!running.has(turn.turnId) || (turn.lastEv || 0) > at || this.state?.state === 'waiting') continue;
        const j = (this.queue || []).find((x) => x.id === turn.turnId);
        this.log('error', `a job showed no sign of life for ${Math.round(quietMs / 60000)} minutes after an uncaught error; stopping it`);
        fail(j);
        try { turn.controller?.abort(); } catch {}
        try { this.gate.done(turn.controller?.signal); } catch {} // the card goes to the next job
        this.turns.delete(lane);
        if (!this.turns.size) this.setState('idle', '');
      }
      try { this.saveQueue(); } catch {}
      setTimeout(() => this.pump(), 0);
    }, quietMs);
    t.unref?.();
  },
  // Item 206: one more error for this tool today. Once a tool fails far more than on its usual day, the logbook says
  // so (once a day per tool), so a tool that broke after an update shows up on the Health page too.
  noteToolError(name) {
    try {
      this.errorTally?.add(name);
      const odd = this.errorTally?.unusual().find((x) => x.tool === name);
      const day = new Date().toDateString();
      if (odd && this.oddToolSaid?.get(name) !== day) {
        (this.oddToolSaid ||= new Map()).set(name, day);
        this.log('error', `${name} has failed ${odd.n} times today (usually ${odd.usual} a day); it may have broken after an update`);
      }
    } catch {}
  },
  // Stop everything: every Hand card that's waiting is answered No.
  denyHands() {
    let n = 0;
    for (const id of [...this.handApprovals]) { const done = this.approvals.get(id); if (done) { done(false); n++; } }
    this.handApprovals.clear();
    return n;
  },
  saveHands(next) {
    saveSettings(this.cfg, { hands: next });
    this.broadcast?.({ type: 'hands', settings: next });
  },
  // A session's context size, but never more than the model was made for.
  // longRun ("Let Bob work on repositories", self-work.js): want is a stretched size and is used as it is (up to the
  // most the brain stretches to), even with the Long memory switch off; it still has to fit this machine.
  async fitCtx(model, want, { longRun = false } = {}) {
    if (!model) return want || null;
    const max = await this.engine.maxCtx?.(model)?.catch?.(() => null) ?? null;
    // 1.5.87: a size picked for this brain (Settings > Brains, switch on) wins, for every copy on it: one load.
    // Long memory (YaRN, model-ctx.js): with the switch on, a stretched size picked for a brain that can take it.
    const stretch = await Promise.resolve(this.engine.stretchMax?.(model, longRun ? { evenOff: true } : undefined)).catch(() => null) ?? null;
    let pick = longRun && max && stretch && want > max ? Math.min(want, stretch) : pickedCtx(this.cfg, model, max, { stretch });
    // A stretched size that won't fit this machine (card plus RAM) isn't tried: the brain loads at what it was made for.
    if (pick && max && pick > max) {
      const r = await Promise.resolve(this.engine.roomFor?.(model, pick)).catch(() => null);
      if (r && r.fits === false) { this.log('model', `long memory: ${model} at ${pick} needs ~${r.needGB} GB, room ~${r.roomGB} GB, so it loads at ${max}`); pick = max; }
    }
    // Settings review: in Gaming the brain is on the processor beside the game, so a pick never makes it bigger there.
    want = pick && gaming(this.cfg) ? Math.min(pick, want || GAMING_CTX) : pick || want;
    if (!want) return null;
    const fit = max ? Math.min(pick && pick > max ? pick : max, want) : want;
    // 1.5.126: on built-in graphics, shorter still when the RAM says so (apuRoom above).
    // Nov 12: not shortened from the estimate any more: the chat memory picked is tried, and only a real
    // out-of-memory makes it shorter (apu-fit.js). The estimate stays in the logbook.
    const room = await apuRoom(this, model, fit);
    if (room.shortened || !room.ok) this.log('model', `keeping ${model}'s ${fit} chat memory: the estimate says ~${room.needGB} GB against ~${room.roomGB} GB free; if it runs out, it loads again with less`);
    return fit;
  },
};
