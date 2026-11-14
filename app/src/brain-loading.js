// Loading and letting go of brains: waking, settling, the graphics card being taken, the talker beside a job, sessions,
// Gaming and the idle check. Methods of the Brain class. Split out of brain.js.
import { chatBrain, isBobs, sameModel, bigSession, bigGraceMs, holdsChatBrain } from './brain-mode.js';
import { isLoadTimeout, readCardUse, busyByOther, cardBusyLine, CARD_STILL_BUSY, RECHECK_MS } from './card-busy.js';
import { currentSession, sessionBrains, SESSIONS, waitsForGaming } from './sessions.js';
import { apuHoldbackGB } from './apu-fit.js';
import { copyName } from './clan.js';
import path from 'node:path';
import fs from 'node:fs';
import { freeMemNow } from './platform.js';
import { midJobOn } from './mid-job.js';
import { ownModels } from './own-models.js';
import { saveSettings } from './config.js';
import { switchLine, autoSessionOn, cardBusy, IDLE_CHECK_MS, whoseCard, idleSession } from './auto-session.js';
import { sleepySwitch } from '../public/sleepy.js';
import { cleanPersonality } from '../public/personality.js';
import { carryOnPlan, finishedSteps, interruptedNote } from './handoff.js';
import { readCard } from './gaming-card.js';
import { apuRoom, talkerModel, isTalker, runnable, talkerCtx, besideBytes, GB, TALKER_LINE, SIDE_LANE, MOVE_TO_CPU } from './brain-lanes.js';
import { BRAIN_NAMES, loadMode, loadLine, APPROVAL_TIMEOUT_MS } from './brain-words.js';
import { guardLoad, heldByOthers, HELD_MB, busyChoices, busyShort, whoHolds, pickedKey, serverUrlFrom, askPause, liftPause, pausedTest, pausableTest, USE_NOTE, PAUSE_WAIT_MS } from './card-guard.js';
import { awakeTimeout, timersFor } from './hang-guard.js';
import { noteWait } from './loop-guard.js';
import { commandLineOf } from './util.js';
import crypto from 'node:crypto';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const loadingParts = {
  // ---------- Keep Bob light (1.5.2) ----------
  // Loads the chat brain ahead of a message: someone started typing, or "Always on" wants it back after a job.
  // Never during a job. Returns true when it loaded something.
  async wake(reason = 'typing') {
    if (this.waking) return this.waking;
    if (this.turns.size) return false;
    if (reason === 'typing' && this.borrowLikely()) return false; // another Bob will think this one: stay light
    const { model, cpu, ctx: want } = chatBrain(this.cfg);
    if (!model) return false;
    clearTimeout(this.graceTimer);
    this.waking = (async () => {
      const ctx = await this.fitCtx(model, want);
      // Nov 12 (the owner: "u dont even let him try"): on built-in graphics the estimate never stops a load; the engine
      // places the brain where it fits and steps down only on a real out-of-memory (apu-fit.js).
      { const r = await apuRoom(this, model, ctx); if (!r.ok) this.log('model', `waking ${model} anyway: the estimate says ~${r.needGB} GB against ~${r.roomGB} GB free; if it runs out, it loads again with less`); }
      let loaded = false;
      try { loaded = await this.engine.isLoaded(model, { cpu, ctx }); } catch { return false; }
      if (loaded) { this.engine.touch?.(model, { cpu, ctx })?.catch?.(() => {}); return false; }
      if (!cpu && await this.cardStillTaken({ kind: 'chat' })) return false; // 1.5.113: another program holds the card: don't load
      if (!cpu && await this.cardGuardCheck(model, { cpu, ctx })) return false; // Nov 13: no warm-up on a busy card; the message asks first
      this.setState('waking', 'Waking up...', model);
      this.broadcast({ type: 'brain' });
      // Same manners as the gate: the picture engine (kept loaded after a picture) makes room first, unless both fit.
      if (!cpu && this.painter?.yieldFor) await this.painter.yieldFor(model, { bytes: this.gate.brainBytes(model, { ctx }) }).catch(() => {});
      const took = await this.engine.preload(model, undefined, { cpu, ctx });
      this.log('model', `woke ${model} in ${took.toFixed(1)} s (${reason})`);
      // 1.5.24 "Warm up while typing": read the instructions while the user is still typing.
      if (this.cfg.readyWhileTyping === true && this.engine.prime) {
        const t0 = Date.now();
        this.engine.prime(model, { ctx, cpu, ...this.startPrompt() })
          .then((how) => how && this.log('model', `read his instructions ahead (${how}, ${((Date.now() - t0) / 1000).toFixed(1)} s)`))
          .catch((e) => this.log('model', `couldn't read ahead: ${e.message}`));
      }
      return true;
    })();
    try { return await this.waking; }
    catch (e) { this.log('model', `couldn't wake ${model}: ${e.message}`); return false; }
    finally {
      this.waking = null;
      if (!this.turns.size) this.setState('idle', '', this.state.model);
      else if (this.state.state === 'waking') this.setState('thinking', '', this.state.model); // a message came in while it loaded: now he thinks
      this.broadcast({ type: 'brain' });
    }
  },
  // Two-Bob trial (the Go, Test D): a lent check sizes its chat memory to the work before refusing (share-brains.js).
  roomCheck(model, ctx, opts) { return apuRoom(this, model, ctx, opts); },
  // After a job: big brains go right away; the chat brain stays only if "Always on" holds it (and comes back
  // if a big brain pushed it out). Only Bob's own brains are touched, never another app's.
  async settle({ noWake = false } = {}) {
    if (this.turns.size || this.waking || this.queue.some((j) => j.state === 'waiting')) return [];
    this.armIdleCheck(); // 1.5.41: back to the lightest session once Bob has been quiet a while
    const chat = chatBrain(this.cfg).model;
    let loaded = [];
    try { loaded = await this.engine.loaded(); } catch { return []; }
    const gone = [];
    for (const m of loaded) {
      if (this.turns.size) break; // a new job started: leave the rest to it
      if (m.beside) { gone.push(...(await this.engine.dropBeside?.().catch(() => []) || [])); continue; } // 1.5.51: the second server goes after every job
      if (!isBobs(this.cfg, m.name) && !sameModel(m.name, chat)) continue;
      if (sameModel(m.name, chat)) continue; // the chat brain: held, or let go by the idle timer / grace below
      gone.push(...(await (this.engine.unload ? this.engine.unload(m.name) : this.engine.unloadAll()).catch(() => [])));
    }
    if (gone.length) this.log('model', `let go of ${gone.join(', ')} after the job`);
    clearTimeout(this.graceTimer);
    // Coding and Deep thought: the chat brain is a big one. A short grace for a follow-up question, then it goes.
    if (bigSession(this.cfg) && loaded.some((m) => sameModel(m.name, chat))) {
      this.graceTimer = setTimeout(async () => {
        if (this.turns.size || this.waking) return;
        const g = await (this.engine.unload ? this.engine.unload(chat) : this.engine.unloadAll()).catch(() => []);
        if (g.length) { this.log('model', `let go of ${g.join(', ')} (big brain, idle)`); this.broadcast({ type: 'brain' }); }
      }, bigGraceMs(this.cfg));
      this.graceTimer.unref?.();
    }
    // "Make another picture?" is showing, or was answered Yes: the picture engine keeps the card. The answer (No, or no
    // answer in 10 s) brings the brain back, not this.
    if (this.morePictures) { this.broadcast({ type: 'brain' }); return gone; }
    if (holdsChatBrain(this.cfg) && !this.turns.size) await this.wake('always on');
    // 1.5.21: after any job (a picture, a big brain, a helper) Bob goes back to his quick chat brain in the
    // background, so a follow-up is answered fast instead of waiting for the next message to load it. The usual
    // idle timer still frees it once he's been quiet. Not in Coding / Deep thought, whose chat brain is a big one.
    else if (!noWake && !bigSession(this.cfg) && !this.turns.size) await this.wake('back to the quick brain after a job'); // 1.5.120: not after a game (Adventure)
    this.broadcast({ type: 'brain' });
    return gone;
  },
  // The toggle changed: Always on loads the chat brain now; Wake when I type starts the idle clock on it.
  async applyBrainMode() {
    if (holdsChatBrain(this.cfg)) return this.wake('always on');
    const { model, cpu, ctx: want } = chatBrain(this.cfg);
    if (model && !this.turns.size) { const ctx = await this.fitCtx(model, want); await this.engine.touch?.(model, { cpu, ctx })?.catch?.(() => {}); }
    this.broadcast({ type: 'brain' });
    return false;
  },
  // ---------- The busy card (Nov 13, card-guard.js) ----------
  // Bob's own engines on the card, by process id, so a test's llama-server counts as another program.
  ownCardPids() {
    const out = new Set();
    for (const p of [this.engine?.child?.pid, this.engine?.beside?.child?.pid, this.painter?.child?.pid]) if (p) out.add(p);
    return out;
  },
  // null = load away. Else the guard's { needMB, roomMB, heldMB, others, line }. Never for the processor, a brain
  // already loaded, or a card that can't be read.
  async cardGuardCheck(model, opts = {}) {
    if (opts.cpu || !model) return null;
    try { if (await this.engine.isLoaded(model, opts)) return null; } catch { return null; }
    const needB = this.gate?.brainBytes?.(model, opts);
    if (!(needB > 0)) return null;
    const card = await (this.readCardUse || readCardUse)(undefined, undefined, { ownPids: this.ownCardPids() }).catch(() => null);
    if (!card) { this.setCardBusy(null); return null; }
    const { mb: ownMB } = await this.ownCardMB();
    const g = guardLoad({ card, needMB: needB / 2 ** 20, ownMB });
    this.setCardBusy(g ? g.others : null);
    return g;
  },
  // Every 30 s while a window is open (server.js): is something else holding the card? So the window shows it before
  // anyone sends a message. nvidia-smi only (about 50 ms); never Windows' slower per-program counter.
  async cardWatch() {
    const card = await (this.readCardUse || readCardUse)(undefined, async () => null, { ownPids: this.ownCardPids() }).catch(() => null);
    if (!card) { this.setCardBusy(null); return null; }
    // 1.5.221 PC check: with Bob's own 12.9 GB brain loaded, Windows Terminal (listed by nvidia-smi, no sizes) was
    // blamed for it. Now: Bob's own brain on the card means nothing to load, so never busy; otherwise busy only when
    // his chat brain really wouldn't fit beside what others hold (the same rule as a load).
    const own = await this.ownCardMB();
    if (own.brainOnCard) { this.setCardBusy(null); return false; }
    const { model, cpu, ctx } = chatBrain(this.cfg);
    const needB = !cpu && model ? this.gate?.brainBytes?.(model, { ctx }) : 0;
    const busy = needB > 0 ? Boolean(guardLoad({ card, needMB: needB / 2 ** 20, ownMB: own.mb })) : false;
    this.setCardBusy(busy ? card.others : null);
    return busy;
  },
  // What Bob's own engines hold on the card, in MB, and whether a brain of his sits there. On Windows nvidia-smi often
  // can't say per process (0), so a brain started on the card counts at its estimated size instead.
  async ownCardMB() {
    let mb = (Number(this.painter?.vramBytes) || 0) / 2 ** 20, brainOnCard = false;
    try {
      for (const m of await this.engine.loaded()) {
        const v = Number(m?.vram) || 0;
        if (v > 0) { mb += v / 2 ** 20; brainOnCard = true; continue; }
        if (m?.usesCard || m?.onCard) { brainOnCard = true; const est = Number(this.gate?.brainBytes?.(m.name, { ctx: m.ctx })) || Number(m.size) || 0; mb += est / 2 ** 20; }
      }
    } catch {}
    return { mb, brainOnCard };
  },
  // What the window shows (status line, brain chip, the cube dimmed): "Card busy: llama-server, 11.2 GB", or null.
  setCardBusy(others) {
    const next = others && others.length ? busyShort(others) : null;
    if ((this.cardBusyNow?.short || null) === next) return;
    this.cardBusyNow = next ? { short: next, at: Date.now() } : null;
    this.broadcast({ type: 'card-busy', busy: Boolean(next), short: next || '' });
  },
  // A brain server on the card that Bob didn't start: its address, or ''.
  async brainOnCard(others = []) {
    const t = pausableTest(this.cfg.agentDir || '');
    if (t) return t.url;
    for (const o of others) if (o.engine && o.pid && /^llama-server$/i.test(o.name)) { const u = serverUrlFrom(await (this.commandLineOf || commandLineOf)(o.pid).catch(() => '')); if (u) return u; }
    return '';
  },
  // One question with choices on a card; resolves with the words picked ('' = no answer in 10 minutes, or Stop).
  async pickChoice(question, choices, emit, signal, sessionId) {
    const id = crypto.randomUUID(), prev = this.state, from = Date.now();
    this.setState('waiting', question);
    emit({ type: 'approval', id, text: question, ask: { question, choices }, ...(sessionId != null ? { sessionId } : {}) });
    const said = await new Promise((resolve) => {
      const timer = awakeTimeout(() => done(false), this.approvalMs || APPROVAL_TIMEOUT_MS, { bag: timersFor(signal) });
      const done = (v, rows, items, note) => { timer.clear(); this.approvals.delete(id); resolve(v ? String(note || '').trim() : ''); };
      this.approvals.set(id, done);
      signal?.addEventListener?.('abort', () => done(false), { once: true });
    });
    noteWait(signal, Date.now() - from);
    emit({ type: 'approval-result', id, allowed: Boolean(said) });
    this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model);
    return said;
  },
  // Before a brain loads on the card: { go: true } (load as usual), { use: { url, paused } } (answer on the brain
  // already there), or { borrow: true } (another of his Bobs). "Leave it" ends the job with the plain line.
  // chat: a chat turn (the other two choices make sense only there).
  async cardGuard(model, opts, emit, signal, { sessionId = null, chat = false, borrowOk = true } = {}) {
    let g = await this.cardGuardCheck(model, opts);
    if (!g) return { go: true };
    this.log('card', `didn't load ${model}: ${whoHolds(g.others)} holds ~${(g.heldMB / 1024).toFixed(1)} GB of the card; it needs ~${(g.needMB / 1024).toFixed(1)} GB, ~${(g.roomMB / 1024).toFixed(1)} GB left`);
    emit({ type: 'announce', text: g.line });
    const server = chat ? await this.brainOnCard(g.others) : '';
    const borrow = chat && borrowOk && this.cfg.share?.borrow?.on === true && (this.cfg.share.borrow.bobs || []).length > 0;
    const choices = busyChoices({ brainOnCard: Boolean(server), borrow });
    const said = await this.pickChoice(`What should I do?${server ? ` (Using the brain on the card: ${USE_NOTE})` : ''}`, choices, emit, signal, sessionId);
    if (signal?.aborted) throw new Error('Stopped.');
    const k = pickedKey(said);
    this.log('card', `busy card: ${said ? `picked "${said}"` : 'no answer, so I wait for the card'}`);
    if (k === 'leave') throw Object.assign(new Error('Not done: the graphics card is busy, so I left my brain unloaded. Send it again once the card is free.'), { code: 'card_busy' });
    if (k === 'borrow' && borrow) return { borrow: true };
    if (k === 'use' && server) return { use: await this.useCardBrain(server, emit, signal) };
    emit({ type: 'announce', text: 'I\'ll load my brain as soon as the card has room. Stop ends the wait.' });
    while (g) {
      this.setState('waiting', 'Waiting for the graphics card');
      await new Promise((r) => { const t = setTimeout(r, this.cardRecheckMs || RECHECK_MS); signal?.addEventListener?.('abort', () => { clearTimeout(t); r(); }, { once: true }); });
      if (signal?.aborted) throw new Error('Stopped.');
      g = await this.cardGuardCheck(model, opts);
    }
    this.log('card', 'the graphics card has room again; loading');
    emit({ type: 'announce', text: 'The card has room now. Loading my brain.' });
    this.setState('thinking', '', this.state.model);
    return { go: true };
  },
  // "Use the brain already on the card": a test that can pause is asked to, and Bob waits for it to finish its step;
  // an older test isn't asked (it can't hear), and its timings will be off. Returns { url, paused }.
  async useCardBrain(server, emit, signal) {
    const dir = this.cfg.agentDir || '';
    if (!pausableTest(dir)) { this.log('card', `answering on the brain already on the card (${server}); that test can't pause`); return { url: server, paused: false }; }
    askPause(dir); this.cardPaused = dir;
    emit({ type: 'announce', text: 'Asking the test to pause after its current step. That can take a few minutes; Stop ends the wait.' });
    this.setState('waiting', 'Waiting for the test to pause');
    const until = Date.now() + (this.pauseWaitMs || PAUSE_WAIT_MS);
    for (;;) {
      const p = pausedTest(dir);
      if (p) { this.log('card', 'the test paused after its step; answering on its brain'); return { url: p.url, paused: true }; }
      if (signal?.aborted) { this.liftCardPause(); throw new Error('Stopped.'); }
      if (Date.now() > until) { this.liftCardPause(); throw Object.assign(new Error('Not done: the test didn\'t pause in time, so I left it running. Send it again once it\'s done.'), { code: 'card_busy' }); }
      await new Promise((r) => setTimeout(r, this.pausePollMs || 1000));
    }
  },
  // The turn is over: the test carries on.
  liftCardPause() { if (!this.cardPaused) return; liftPause(this.cardPaused); this.cardPaused = null; this.log('card', 'the test carries on'); },
  // 1.5.113: a load timed out. Is another program holding the graphics card? Then say so (once per chat) and don't retry.
  async cardTaken(e, emit, sessionId) {
    if (!isLoadTimeout(e)) return false;
    const card = await (this.readCardUse || readCardUse)();
    if (!busyByOther(card)) { this.cardHeld = null; return false; }
    this.cardHeld = { at: Date.now(), line: cardBusyLine(card), said: this.cardHeld?.said || new Set() };
    this.log('handoff', `graphics card taken by another program (${card.freeMB} MB free${card.others.length ? `: ${card.others.map((a) => a.name).join(', ')}` : ''}); not retrying`);
    if (emit && sessionId != null && !this.cardHeld.said.has(sessionId)) { this.cardHeld.said.add(sessionId); emit({ type: 'announce', text: this.cardHeld.line }); }
    return true;
  },
  // 1.5.113: the ⚠ line in full once per chat; after that, a short pointer to it.
  cardLineFor(sessionId) {
    const h = this.cardHeld;
    if (!h) return '';
    if (h.said.has(sessionId)) return CARD_STILL_BUSY;
    h.said.add(sessionId);
    return h.line;
  },
  // 1.5.113: before a job (or a wake-up) that needs the card, while it's known to be taken: look again (at most every
  // 30 s). Still taken = the job ends at once with the plain line, instead of sitting through its own five-minute load.
  async cardStillTaken(job) {
    if (!this.cardHeld) return false;
    if (currentSession(this.cfg).cpu && !['picture', 'video', 'edit'].includes(job?.kind)) return false; // chats on the processor
    if (Date.now() - this.cardHeld.at < RECHECK_MS) return true;
    const card = await (this.readCardUse || readCardUse)();
    if (!busyByOther(card)) { this.cardHeld = null; this.log('handoff', 'the graphics card is free again'); return false; }
    this.cardHeld = { at: Date.now(), line: cardBusyLine(card), said: this.cardHeld.said };
    return true;
  },
  // 1.5.111: the waiting is over (the job started, or was stopped), so its ⏳ line leaves the chat.
  waitOver(j) {
    if (!j?.queuedLine) return;
    j.queuedLine = false;
    this.broadcast({ type: 'waiting-line-done', sessionId: j.sessionId, jobId: j.id, id: `queued-${j.id}` });
  },
  // Makes sure a model is in memory, telling the user first if it means a wait. Goes through the gate: the action
  // waits for the card, the brain is checked ready after loading, a failed load is tried again, and a brain that
  // still won't load hands the job to the main brain. Returns the model that's really loaded (use that one).
  async ensureModel(model, emit, signal, who = 'bob', opts = {}) {
    const cardChecked = opts.cardChecked === true; if ('cardChecked' in opts) { opts = { ...opts }; delete opts.cardChecked; }
    if (this.waking) await this.waking.catch(() => {}); // typing already started loading it: don't load twice
    clearTimeout(this.graceTimer);
    if (!opts.beside && !opts.noTalker) await this.keepTalker(model, opts, emit, { signal });
    // Nov 13 (card-guard.js): never a load that would overfill a card another program holds; a chat turn asked already.
    if (!opts.cpu && !cardChecked) await this.cardGuard(model, opts, typeof emit === 'function' ? emit : () => {}, signal);
    if (!signal) { try { await this.engine.isLoaded(model, opts); } catch (e) { throw new Error(`I can't reach my engine, ${this.engineName} (${e.message}).`); } }
    // 1.5.126: built-in graphics share Windows's RAM (apuRoom). Nov 12 (the owner: "u dont even let him try"): the
    // estimate is only a logbook line now. The engine places the brain where it fits, tries it, and on a real
    // out-of-memory loads it again with less on the graphics, then a shorter chat memory (apu-fit.js).
    const room = await apuRoom(this, model, opts.ctx, opts.minCtx ? { minCtx: opts.minCtx } : undefined);
    if (!room.ok) this.log('model', `loading ${model} anyway: the estimate says ~${room.needGB} GB against ~${room.roomGB} GB free keeping ${apuHoldbackGB(this.cfg)} GB for Windows; if it runs out, it loads again with less`);
    const name = BRAIN_NAMES[who] || who;
    const used = await this.gate.need({ id: 'brain', model, opts }, {
      signal, emit, who,
      announce: async (m, attempt) => {
        const secs = await this.engine.estimateLoad(m, opts).catch(() => 15);
        // 1.5.49: say whether this brain replaces one (swap), joins one (add), or fills an empty head (load).
        const plan = await this.engine.loadPlan?.(m, opts).catch(() => null) || null;
        const mode = loadMode(plan);
        const text = attempt ? `That didn't load right. Trying the ${this.brainLabel(m, who)} again, about ${secs} ${secs === 1 ? 'second' : 'seconds'}.` : loadLine({ mode, who, model: m, from: plan?.drop?.[0] || plan?.keep?.[0] || '', copy: who === 'reviewer' ? copyName(this.cfg, 'reviewer', 'second look') : '', secs, label: (x, w) => this.brainLabel(x, w), single: Boolean(plan?.single), beside: Boolean(plan?.beside), onCard: Boolean(plan?.onCard), besideOn: this.cfg.mootBeside === true, tip: who === 'reviewer' && mode === 'swap' && Boolean(plan?.single) && this.cfg.mootBeside !== true && this.besideTipOnce(), ...(opts?.what ? { what: opts.what } : {}) });
        // Item 216: a long load says how long it gets before it is stopped and tried once more.
        const limit = secs >= 60 ? await Promise.resolve(this.engine.loadLimit?.(m, opts)).catch(() => 0) : 0;
        const said = limit > secs ? `${text} If it isn't in after ${limit < 120 ? `${limit} seconds` : `${Math.round(limit / 60)} minutes`}, I'll stop it and try once more.` : text;
        emit({ type: 'announce', text: said, seconds: secs, ...(limit > secs ? { deadline: limit } : {}) });
        this.setState('loading', said, m, { mode: attempt ? 'swap' : mode, from: plan?.drop?.[0] || plan?.keep?.[0] || '', ...(plan?.beside ? { beside: true } : {}) });
      }
    }).catch((e) => {
      if (/^Stopped\.$/.test(e.message)) throw e;
      if (/ECONNREFUSED|fetch failed|can't reach/i.test(e.message)) throw new Error(`I can't reach my engine, ${this.engineName} (${e.message}).`);
      throw e;
    });
    this.state.model = used;
    if (this.state.state === 'loading' || this.state.state === 'waiting') { this.log('model', `loaded ${used}`); this.setState('thinking', '', used); }
    this.engineNotes(emit);
    return used;
  },
  // Reliability 218-228: what the engine did on its own (a smaller chat memory, last good settings, a crash hold, a
  // slow or text-calling brain loaded fresh) is one line in the chat, never words for the brain.
  engineNotes(emit) {
    if (typeof emit !== 'function') return;
    for (const e of [this.engine, this.engine?.beside]) {
      for (const text of e?.takeNotes?.() || []) { try { emit({ type: 'announce', text }); } catch {} }
    }
  },
  // 1.5.51: the tip about "Reviewer beside main brain" shows the first time a moot swaps, then never
  // again (a marker in Bob's data folder remembers it across restarts).
  besideTipOnce() {
    const f = path.join(this.cfg.dataDir || '.', 'moot-beside-tip-shown');
    try { if (fs.existsSync(f)) return false; fs.writeFileSync(f, new Date().toISOString()); } catch { if (this.besideTipShown) return false; }
    this.besideTipShown = true;
    return true;
  },
  // 1.5.53 (the owner's idea): before a big brain pushes the quick brain off the card, a small talker starts on the
  // processor beside it (second server), so chat carries on during the job. The chat page gets second-brain events and
  // the brain bay shows the add. Under "Chat while busy"; never in Gaming; only with room in RAM.
  async keepTalker(model, opts = {}, emit = () => {}, { freeMem = freeMemNow(), signal = null } = {}) {
    const cfg = this.cfg;
    if (cfg.chatWhileBusy === false || cfg.engine !== 'llamacpp' || typeof this.engine.besideServer !== 'function') return false;
    if (midJobOn(cfg)) return false; // Answer messages mid-job: no second brain kept beside a text job
    if (currentSession(cfg).id === 'light' || opts.cpu) return false; // Gaming, or a brain on the processor (two would fight)
    const talker = talkerModel(this);
    if (!talker || !model || isTalker(this, model) || !runnable(this, talker)) return false;
    if (this.engine.besideLoaded?.() || this.talking) return false;
    let main = [];
    try { main = (await this.engine.loaded()).filter((m) => !m.beside).map((m) => m.name); } catch {}
    if (main.some((n) => sameModel(n, model))) return false; // already loaded: nothing gets pushed out
    const ctx = talkerCtx(cfg);
    if (freeMem < besideBytes(this, talker, ctx) + 2 * GB) return false;
    this.talking = true;
    try {
      // 1.5.133: never on the card: the job's brain isn't loaded yet, so the card only looks empty.
      await this.engine.preload(talker, undefined, { beside: true, cpu: true, ctx, place: 'none' });
      if (!signal || this.talkerSaid !== signal) emit({ type: 'announce', text: TALKER_LINE(this.brainLabel(talker).replace(/^.*?\((.*)\)$/, '$1')) }); // once per job
      this.talkerSaid = signal;
      this.log('model', `kept ${talker} on the processor beside the job, for chat (chat memory ${ctx})`);
      return true;
    } catch (e) { this.log('model', `couldn't keep a talker beside the job: ${e.message}`); return false; }
    finally { this.talking = false; }
  },
  // How a brain is named to the user: its Equip slot and its catalog name, never a model id.
  // "Coding brain (Qwen3 Coder 30B)", "Quick brain (Gemma 4 E4B)", "Brain (Gemma 4 26B)".
  brainLabel(model, who = 'bob') {
    const SLOT = { bob: 'Brain', small: 'Quick brain', deep: 'Deep thinking', tinker: 'Coding', reviewer: 'Review', eyes: 'Seeing pictures', ledger: 'Spreadsheets', scout: 'Research', painter: 'Prompt writer' };
    let slot = who;
    if (who === 'bob') slot = sameModel(model, this.cfg.models?.small) ? 'small' : sameModel(model, sessionBrains(this.cfg).deep) && !sameModel(model, this.cfg.models?.bob) ? 'deep' : 'bob';
    const s = SLOT[slot] || 'Brain';
    const phrase = /brain$/i.test(s) ? s : `${s} brain`;
    if (!this.catalogNames) {
      this.catalogNames = [];
      try { this.catalogNames = JSON.parse(fs.readFileSync(this.cfg.catalogFile || new URL('../catalog.json', import.meta.url), 'utf8')).models.filter((x) => x.ollama && x.name).map((x) => [x.ollama, x.name]); } catch {}
      for (const o of ownModels(this.cfg)) this.catalogNames.push([o.id, o.name]); // 1.5.135 brains of your own, by their given name
    }
    const nice = this.catalogNames.find(([id]) => sameModel(id, model))?.[1] || String(model || '').replace(/:latest$/, '');
    return `${phrase} (${nice})`;
  },
  // Switch session: from the user's pick, or (1.5.41, "Auto session") Bob's own: by 'bob' for a job, 'idle'
  // when he goes quiet. Brains from the old session are let go so the new set fits.
  async setSession(id, { by = 'you', why = '' } = {}) {
    if (!SESSIONS[id]) throw new Error('Unknown session.');
    const from = currentSession(this.cfg).id;
    // 1.5.41: picking another session by hand ends the 🎮 Gaming lock (Bob's own picks can't: see auto-session.js).
    if (by === 'you' && id !== 'light' && this.cfg.gamingLock === true) { saveSettings(this.cfg, { gamingLock: false }); this.unpark(); this.broadcast({ type: 'gaming-lock', on: false }); }
    this.cfg.session = id;
    this.suggested = null;
    this.lastActivity = Date.now(); // for /api/idle
    if (!this.turns.size) { await this.engine.unloadAll().catch(() => {}); await this.painter?.unload?.('session switch', { force: true }).catch?.(() => {}); }
    this.log('session', `now ${id}${by === 'you' ? '' : ` (Bob's pick${by === 'idle' ? ', gone quiet' : ''}${why ? `: ${why}` : ''})`}`);
    this.saveQueue(); // 1.5.23: the Gaming wait tags change with the session
    setTimeout(() => this.pump(), 0); // jobs that waited for Gaming to end can start
    if (holdsChatBrain(this.cfg)) this.wake('always on').catch(() => {});
    // By Bob for a job: the chat already has his "Switching to..." line. When he goes quiet: one line saying where he went.
    if (by === 'you' || by === 'lock') { try { saveSettings(this.cfg, { sessionBy: 'you' }); } catch {} } // who picked it, for the picker's label
    this.broadcast({ type: 'session', session: currentSession(this.cfg), by, pickedBy: this.cfg.sessionBy === 'bob' ? 'bob' : 'you', line: by === 'idle' ? switchLine(id, '', 'idle') : undefined });
    this.armIdleCheck();
    const aside = sleepySwitch(this.sleepy, from, id, cleanPersonality(this.cfg.personality));
    if (aside) this.broadcast({ type: 'aside', text: aside });
    return currentSession(this.cfg);
  },
  // 1.5.41: Bob changes session himself. Saved like a pick on the chat page; no job starts until the new session is set.
  async autoSwitch(id, by = 'bob', why = '') {
    if (currentSession(this.cfg).id === id) return currentSession(this.cfg);
    this.switching = true;
    try { saveSettings(this.cfg, { session: id, sessionBy: 'bob' }); return await this.setSession(id, { by, why }); }
    finally { this.switching = false; }
  },
  // 1.5.41 the 🎮 Gaming button on the chat page: Gaming, locked. Everything Bob has on the graphics card goes at once
  // (brains, the picture engine), running jobs are put aside in Tasks (not cancelled) and the queue waits. Bob doesn't
  // leave Gaming by himself while it's on. Pressing it again (or picking another session) goes back to Normal, and the
  // jobs carry on from where they stopped, like after a restart.
  async setGamingLock(on) {
    on = on === true;
    saveSettings(this.cfg, { gamingLock: on });
    if (on) {
      for (const j of this.queue) if (j.state === 'working') j.parked = true;
      this.stop();
      this.endMore?.(null, 'gaming');
      for (let i = 0; i < 80 && this.turns.size; i++) await new Promise((r) => setTimeout(r, 100)); // jobs let go (8 s at most)
      saveSettings(this.cfg, { session: 'light' });
      await this.setSession('light', { by: 'lock' });
      await this.engine.unloadAll?.().catch?.(() => {});
      await this.painter?.unload?.('gaming button', { force: true })?.catch?.(() => {});
      this.log('session', 'Gaming locked by the 🎮 button; the graphics card is cleared');
    } else {
      this.unpark();
      saveSettings(this.cfg, { session: 'normal' });
      await this.setSession('normal', { by: 'lock' });
    }
    this.broadcast({ type: 'gaming-lock', on });
    return { on, session: currentSession(this.cfg) };
  },
  unpark() { let n = 0; for (const j of this.queue) if (j.parked) { j.parked = undefined; n++; } if (n) { this.saveQueue(); setTimeout(() => this.pump(), 0); } },
  // A job put aside by the 🎮 button: back in line, carrying on from its last finished step (as after a restart). A
  // cut-off step that may be half done (typing in an app, moving files, a command) waits in Tasks for Carry on instead.
  parkJob(job, emit) {
    const plan = carryOnPlan(job);
    job.before = finishedSteps(job); job.cutStep = plan.cut; job.carryOn = plan.note;
    if (plan.mode === 'wait') { job.parked = undefined; job.state = 'interrupted'; job.error = interruptedNote(job); }
    else Object.assign(job, { state: 'waiting', pickUp: true, at: Date.now(), error: undefined });
    emit({ type: 'token', text: '\n\n*(Put aside for Gaming. It waits in Tasks and carries on when Gaming is off.)*' });
  },
  // 1.5.41: a job is waiting for Gaming to end. With "Auto session" on, Bob looks at the graphics card once
  // a minute: once nothing else is using it (the game is closed), he goes back to Normal and the job runs. No question.
  gamingProbe() {
    if (!autoSessionOn(this.cfg) || this.cfg.gamingLock === true || this.probeTimer || this.switching) return;
    this.probeTimer = setTimeout(async () => {
      try {
        if (!this.queue.some((j) => j.state === 'waiting' && waitsForGaming(this.cfg, j))) return;
        const busy = cardBusy(await (this.readCard || readCard)().catch(() => null));
        if (busy === false && !this.turns.size && waitsForGaming(this.cfg, this.queue.find((j) => j.state === 'waiting' && waitsForGaming(this.cfg, j)))) {
          this.probeTimer = null;
          await this.autoSwitch('normal', 'bob', 'now that the graphics card is free');
          this.broadcast({ type: 'announce', text: switchLine('normal', 'now that the graphics card is free') });
          return this.pump();
        }
      } catch {}
      this.probeTimer = null;
      this.gamingProbe(); // still busy (or unreadable): look again in a minute
    }, this.lastProbeAt ? 60_000 : 2_000);
    this.lastProbeAt = Date.now();
    this.probeTimer.unref?.();
  },
  // While Bob is quiet, every 2 minutes: Normal when the graphics card is free, Gaming while something else is using it
  // (a game). One nvidia-smi reading, about 50 ms; nothing at all while a job runs or with the setting off.
  armIdleCheck() {
    clearTimeout(this.idleTimer);
    if (!autoSessionOn(this.cfg)) return;
    this.idleTimer = setTimeout(() => this.idleCheck().catch(() => {}), IDLE_CHECK_MS(this.cfg));
    this.idleTimer.unref?.();
  },
  async idleCheck() {
    if (this.turns.size || this.waking || this.switching || this.morePictures || this.queue.some((j) => j.state === 'working' || (j.state === 'waiting' && !waitsForGaming(this.cfg, j)))) return this.armIdleCheck();
    if (Date.now() - (this.lastActivity || 0) < IDLE_CHECK_MS(this.cfg) - 1000) return this.armIdleCheck();
    const raw = cardBusy(await (this.readCard || readCard)().catch(() => null));
    // Bob's own brain on the card, or his card lent to another Bob: that load is his, not a game's.
    const mine = raw === true && (Boolean(this.cardLender?.child) || Boolean((await this.engine?.loaded?.().catch(() => []))?.some((m) => m.usesCard || m.onCard)));
    const busy = whoseCard(raw, { mine, others: mine ? (await (this.readCardUse || readCardUse)().catch(() => null))?.others : null });
    const want = idleSession(this.cfg, busy, { stay: mine && busy === null });
    if (want && !this.turns.size) await this.autoSwitch(want, 'idle');
    else this.armIdleCheck();
  },
  // GPU-only models leave for the painter; in an Art session the chat brain on the processor stays.
  async clearGpu() {
    // 1.5.41: a quick reply running beside a job on the processor brain keeps going too.
    // 1.5.51: a quick brain beside the job on the card moves to the processor; the reply says why it slows down.
    const side = this.turns?.get?.(SIDE_LANE);
    if (side?.beside && this.engine.beside?.currentCard === 'whole') this.broadcast({ type: 'announce', text: MOVE_TO_CPU, turnId: side.turnId, sessionId: side.sessionId });
    if ((currentSession(this.cfg).cpu || this.turns?.has(SIDE_LANE)) && this.engine.unloadGpu) return this.engine.unloadGpu();
    return this.engine.unloadAll();
  },
};
