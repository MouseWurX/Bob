// A turn from start to finish: starting it, a look at the screen, running it, and the honesty and how-to checks after.
// Methods of the Brain class. Split out of brain.js.
import crypto from 'node:crypto';
import { currentSession } from './sessions.js';
import { carryOnLine, carryOnPlan, finishedSteps, slimHandoff } from './handoff.js';
import { inTurn, endWhy, turnSummary, whyLine } from './turn-log.js';
import { causeLine, sideJob } from './retry.js';
import { timersFor, raceTimeout } from './hang-guard.js';
import { noteMissedLine, JOB_GUESS_CORRECTION } from './meanwhile.js';
import { SLEEPY_SESSION, sleepyAfterReply } from '../public/sleepy.js';
import { cleanPersonality } from '../public/personality.js';
import path from 'node:path';
import { careful, mootOpening, runMoot } from './moot.js';
import { pickAnswer } from './clean-answer.js';
import { markReplaced, correctionStep } from './honesty-score.js';
import { howtosOn, worthOffering } from './howtos.js';
import { isGuestId } from './guest-chat.js';
import { hkSettings } from './housekeeping.js';
import { asDoc, embedModel } from './embed-prefix.js';
import { NO_ANSWER_PARKED, MAX_TRACE, CLAIM_CORRECTION, OBSERVE_CORRECTION } from './brain-words.js';
import { BESIDE_FAILED } from './brain-lanes.js';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const turnParts = {
  // Runs one job. Progress goes out as events; when it ends, the next job starts.
  startTurn(sessionId, text, attach = [], job = null, lane = 'talk') {
    if (this.turns.has(lane)) throw new Error('busy');
    const turnId = job?.id || crypto.randomUUID();
    const controller = new AbortController();
    let flagged = false; // an error or correction note under this reply: no sleepy aside (never joke about a real failure)
    const tstore = { id: turnId, asks: 0, corrections: 0, at: Date.now(), ctx: null, error: null }; // items 246-249 (turn-log.js)
    // Quick brain sees the job: the main lane's job gets a record (meanwhile.js), and its thinking (only
    // passed along while Bob's thinking window is open) and copies go in it too.
    if (lane === 'talk' && job && !job.side) this.watch.start(job, { session: currentSession(this.cfg).label });
    const watched = lane === 'talk' && job && !job.side ? job : null;
    const emit = (ev) => {
      const live = this.turns.get(lane); if (live?.turnId === turnId) live.lastEv = Date.now(); // item 203: signs of life
      if (['error', 'correction', 'held', 'waiting'].includes(ev.type)) flagged = true;
      if (ev.type === 'correction') tstore.corrections++;
      if (watched && ev.type === 'think') this.watch.think(watched, ev.text);
      if (watched && ev.type === 'token') this.watch.wrote(watched, ev.text);
      if (watched && ev.type === 'hat' && ev.copy) this.watch.step(watched, `${ev.copy} took over (${ev.label || 'a copy'})`);
      this.broadcast({ ...ev, turnId, sessionId });
    };
    this.turns.set(lane, { turnId, sessionId, controller, ...(job?.beside ? { beside: true } : {}) });
    emit({ type: 'start', text: text.slice(0, 140) });
    if (job?.pickUp) emit({ type: 'announce', text: carryOnLine(job) }); // 1.5.38: picked up after a restart
    const pics = [].concat(attach || []).map((id) => this.refs.find(String(id))).filter(Boolean).slice(0, 4);
    let ok = false;
    inTurn(tstore, async () => { // item 247: every logbook line this turn writes carries its id
      if (await this.cardStillTaken(job)) throw Object.assign(new Error(this.cardLineFor(sessionId)), { code: 'card_busy' });
      return this.run(sessionId, text, emit, controller.signal, pics, job);
    })
      .then(() => {
        ok = true;
        if (!job) return;
        job.state = 'done';
        // Item 196: a card timed out with no answer. The job is parked in Tasks, waiting for the OK (Carry on asks again).
        if (job.waitingOk) {
          job.waitingOk = undefined;
          const why = '[Bob note, not from the user: a card for this job timed out with no answer, and the user pressed Carry on. Ask for the OK again and carry on from where you stopped; don\'t greet the user again.';
          try { const plan = carryOnPlan(job); job.before = finishedSteps(job); job.cutStep = null; job.carryOn = plan.note ? plan.note.replace(/^\[Bob note[^\n]*/, why) : `${why}]`; } catch { job.carryOn = `${why}]`; }
          job.state = 'interrupted'; job.error = NO_ANSWER_PARKED;
          emit({ type: 'announce', text: `⏸ ${NO_ANSWER_PARKED}` });
        }
      })
      .catch(async (e) => {
        tstore.error = e || new Error('unknown');
        // 1.5.113: a load that timed out because another program holds the card ends with the plain ⚠ line, once per chat.
        if (!controller.signal.aborted && e?.code !== 'card_busy' && (e?.code === 'card_held' || await this.cardTaken(e, null).catch(() => false)) && this.cardHeld) e = Object.assign(new Error(this.cardLineFor(sessionId)), { code: 'card_busy' });
        if (e?.code === 'beside' && job && !controller.signal.aborted) { // 1.5.51: the second brain wouldn't start: wait in line
          emit({ type: 'announce', text: BESIDE_FAILED });
          this.log('handoff', `second brain beside the job wouldn't start (${e.message}); the message waits for the job`);
          Object.assign(job, { requeued: true, noBeside: true, side: false, beside: false });
        }
        else if (controller.signal.aborted && job?.parked) this.parkJob(job, emit); // 1.5.41: the 🎮 Gaming button, not a stop
        else if (controller.signal.aborted && job?.pausing && !job.dropAfter) this.pauseHere(job, emit); // Nov 12: Pause in Tasks, not a stop
        else if (controller.signal.aborted) { emit({ type: 'token', text: '\n\n*(Stopped.)*' }); if (job) job.state = 'cancelled'; }
        else {
          emit({ type: 'error', text: e.message }); inTurn(tstore, () => this.log('error', causeLine(e).slice(0, 500))); // item 207: the real cause in the logbook
          if (job) { job.state = 'failed'; job.error = e.message.slice(0, 200); }
          // The chat keeps the failure as a note under the question (it used to be a live line only, gone after a reload).
          if (!job?.guest) { const sess = this.session(sessionId); const last = sess[sess.length - 1]; if (!(last?.role === 'assistant' && last.failed)) sess.push({ role: 'assistant', content: '', correction: `⚠ ${String(e.message).slice(0, 400)}`, failed: true, at: Date.now() }); }
        }
      })
      .finally(() => {
        this.liftCardPause?.(); // Nov 13: a test paused for this turn carries on
        // Items 249 and 246: why the turn stopped, in the logbook (with the turn's id) and on the job; the numbers go in
        // loop-stats.json. Never chat words. A broken count never breaks the turn.
        try {
          const why = endWhy({ ok, aborted: controller.signal.aborted, parked: Boolean(job?.parked), error: controller.signal.aborted ? null : tstore.error, ctx: tstore.ctx, switched: Boolean(job?.switchTo) });
          const sum = turnSummary({ why, ms: Date.now() - tstore.at, asks: tstore.asks, corrections: tstore.corrections, ledger: tstore.ctx?.ledger });
          inTurn(tstore, () => this.log('turn', whyLine(why, { ...sum, error: tstore.error?.message })));
          if (job) job.stopWhy = why;
          this.loopStats?.record(sum);
        } catch {}
        // Item 10: the steps go with the answer, so "How I got here" is there after a reload too.
        const steps = this.traces?.get(sessionId);
        if (steps) this.traces.delete(sessionId);
        if (steps?.length && !job?.guest) { const list = steps.slice(0, MAX_TRACE); const last = [...this.session(sessionId)].reverse().find((m) => m.role === 'assistant' && !m.tool_calls?.length && !m.step); if (last) last.steps = list; emit({ type: 'steps', list }); }
        if (!job?.guest) this.saveSession(sessionId); // 1.5.72: a job from another Bob isn't kept as a chat here
        if (!job?.guest) { const last = [...this.session(sessionId)].reverse().find((m) => m.role === 'assistant' && !m.tool_calls?.length && !m.step); if (last?.id) emit({ type: 'answer-id', id: last.id }); } // item 11: Save as a test needs it
        // Item 13: how full this chat left the brain's memory, for the meter by Effort.
        const st = this.engine?.lastStats; if (!job?.guest && st?.used && st.ctx && st.at >= (job?.startedAt || 0)) emit({ type: 'chat-fill', used: st.used, ctx: st.ctx });
        this.gate.done(controller.signal); // the graphics card goes to the next job waiting for it
        if (job?.handoff) job.handoff = slimHandoff(job.handoff); // finished: keep what it did, drop the load-by-load steps
        // 1.5.38: carried on (or not) once; the note isn't used again. A job told to wait for a download goes back in line.
        if (job) job.pausing = undefined; // Pause pressed just as the reply finished: it simply finished
        if (job && job.state !== 'interrupted' && job.state !== 'paused' && !job.after && !job.parked) { job.carryOn = null; job.before = undefined; job.cutStep = undefined; job.pickUp = false; }
        if (job?.requeued) { job.requeued = false; Object.assign(job, { state: 'waiting', error: undefined, steps: [] }); this.queue = [job, ...this.queue.filter((x) => x !== job)]; }
        if (job?.again && job.state !== 'cancelled') { job.carryOn = job.again; job.again = undefined; Object.assign(job, { state: 'waiting', error: undefined, doneAt: undefined, steps: [], at: Date.now() }); this.queue = [...this.queue.filter((x) => x !== job), job]; } // 1.5.91: Set it up pressed while this reply was still going
        if (job?.after && job.state !== 'cancelled') { job.state = 'waiting'; job.error = undefined; job.at = Date.now(); this.queue = [...this.queue.filter((x) => x !== job), job]; }
        // 1.5.41: Bob picked another session for this job: it goes back to the front of the line and runs there.
        const switchTo = job?.switchTo && job.state === 'done' ? job.switchTo : null;
        if (switchTo) { job.switchTo = undefined; job.switchedTo = switchTo.id; Object.assign(job, { state: 'waiting', error: undefined, doneAt: undefined, steps: [] }); this.queue = [job, ...this.queue.filter((x) => x !== job)]; }
        this.turns.delete(lane);
        { const left = timersFor(controller.signal).close(); if (left) this.log('timers', `cleared ${left} timer${left === 1 ? '' : 's'} the turn left waiting`); } // item 215
        if (watched) { const left = this.watch.takeNotes(watched); if (left.length) emit({ type: 'announce', text: noteMissedLine(left) }); this.watch.end(watched.id); }
        this.rentals?.turnDone(job); // 1.5.127: a hired machine stops once no job uses it
        this.lastActivity = Date.now();
        // Gaming: now and then a scripted sleepy aside under a normal finished reply (a feeling, never a fact about the job).
        // Never after an error or correction note, or for a job held back (e.g. "Waiting · Gaming is on").
        if (ok && !flagged && !controller.signal.aborted && (!job || job.state === 'done') && currentSession(this.cfg).id === SLEEPY_SESSION) {
          const aside = sleepyAfterReply(this.sleepy, cleanPersonality(this.cfg.personality));
          if (aside) emit({ type: 'aside', text: aside });
        }
        emit({ type: 'done' });
        if (!this.turns.size) this.setState('idle', '');
        if (job && !switchTo && !job.parked && job.state !== 'waiting') { job.doneAt = Date.now(); for (const st of job.steps || []) if (st.state === 'in progress') st.state = job.state === 'done' ? 'completed' : job.state; this.saveQueue(); }
        if (switchTo) { this.saveQueue(); this.autoSwitch(switchTo.id, 'bob', switchTo.why).catch((e) => this.log('error', `session switch: ${e.message}`)).finally(() => this.pump()); return; }
        setTimeout(() => this.pump(), 0);
        setTimeout(() => this.settle().catch(() => {}), 0); // after pump, so a waiting job keeps its brain
      });
    return turnId;
  },
  // Pictures the user attached: Bob's eyes (the "eyes" model) describe each one once, and the description
  // goes into the message, so even a text-only brain can work with them. With no eyes model set,
  // the picture goes straight to the main brain (it needs to be a vision model).
  async look(pics, emit, signal) {
    const eyes = this.cfg.models.eyes;
    const notes = [];
    let direct = [];
    for (const r of pics) {
      let seen = r.seen;
      if (!seen && eyes) {
        const sees = (await this.ensureModel(eyes, emit, signal, 'eyes')) || eyes;
        this.setState('thinking', `Looking at ${r.name}`, sees);
        const reply = await this.chatSafe({ model: sees, signal, messages: [{ role: 'user', content: 'Describe this picture for an artist who has to draw it again: who or what is in it, their look (face, hair, build, clothes, colours), the setting, the lighting and the art style. Plain sentences, under 150 words.', images: [this.refs.base64(r)] }] }, { emit, who: 'eyes' });
        seen = (reply.content || '').trim();
        if (seen) this.refs.setSeen(r.id, seen);
      }
      if (!seen) direct.push(this.refs.base64(r));
      notes.push(`[Attached picture "${r.name}" (${r.kind}${r.kind === 'chat' ? ', not on the shelf' : ''}). It can be used as a reference by that name.${seen ? ` What it shows: ${seen}` : ''}]`);
    }
    return { note: notes.join('\n'), images: direct };
  },
  // Each job works on its own copy of the conversation and adds its messages when it ends, so two jobs
  // running side by side (Art session) never tangle each other's tool calls.
  async run(sessionId, text, emit, signal, pics = [], job = null) {
    const shared = this.session(sessionId);
    const msgs = shared.slice();
    const base = msgs.length;
    // Pictures, clips and sounds Bob makes are kept with his reply, so they're still in the chat after a
    // reload, a restart or a missed live event (they used to exist only as a live event).
    const media = [];
    const out = {};
    let rough = false; // an error or correction note this turn: no how-to card
    const corrections = []; // Nov 12 (items 190-192): this turn's corrections, for its record and the honesty score
    let mooted = null; // the moot's rounds, when one ran (for the answer the chat shows)
    const keep = (ev) => {
      if (['error', 'correction', 'held', 'waiting'].includes(ev?.type)) rough = true;
      if (ev?.type === 'correction' && ev.text) corrections.push({ text: String(ev.text), kind: ev.kind || ([CLAIM_CORRECTION, OBSERVE_CORRECTION, JOB_GUESS_CORRECTION].includes(ev.text) ? 'claims' : ''), brain: out.ctx?.replyModel || this.state?.model || '' });
      if (['image', 'video', 'audio', 'diagram'].includes(ev.type) && typeof ev.url === 'string' && ev.url.startsWith('/images/')) {
        if (media.some((m) => m.url === ev.url)) return; // delivered once already
        media.push({ type: ev.type, url: ev.url, name: path.basename(decodeURIComponent(ev.url.slice(8))), ...(ev.song?.title ? { title: ev.song.title, sound: ev.song.sound } : {}), ...(ev.type === 'diagram' ? { title: String(ev.title || ''), ...(ev.format ? { format: ev.format } : {}) } : {}) });
        out.ctx?.ledger?.output(ev, out.ctx.currentTool || null);
      }
      // Saved files and things called up with show_made: kept as cards with the reply.
      if (ev.type === 'made') for (const x of ev.items || []) if (x?.url && !media.some((m) => m.url === x.url)) { media.push({ type: 'file', kind: x.kind, url: x.url, name: x.name, path: x.path }); out.ctx?.ledger?.output({ type: 'file', file: x.path, url: x.url }, out.ctx.currentTool || null); }
      return emit(ev);
    };
    try {
      // High and Extreme effort: Bob calls a moot. The draft comes first (runOn), then his reviewer copy checks it.
      if (careful(job)) emit({ type: 'announce', text: mootOpening(this.cfg, job.effort, base) });
      await this.runOn(msgs, text, keep, signal, pics, job, sessionId, out);
      if (careful(job) && out.ctx && !signal?.aborted) mooted = await runMoot(this, { msgs, base, emit: keep, signal, job, ctx: out.ctx });
      // #30: Low and Medium, opt-in: a quick second look from a paired Bob when one is free. None free: no check, no swap.
      else if (out.ctx && !signal?.aborted && this.cfg.netReview === true) mooted = await runMoot(this, { msgs, base, emit: keep, signal, job, ctx: out.ctx, quick: () => this.quickReviewer(job, pics) });
      if (out.ctx && !signal?.aborted && !rough) sideJob((k, t) => this.log(k, t), 'the how-to card', () => this.howtoAfter(sessionId, text, out.ctx, keep, job)); // item 204
    }
    finally {
      try { this.honestAfter?.(msgs.slice(base), corrections, out.ctx, job, signal); } catch (e) { try { this.log?.('honesty', `the record of corrections broke: ${e.message}`); } catch {} }
      // 1.5.210: which message the chat shows as the answer; the rest of what he wrote is marked as steps (clean-answer.js).
      const shown = pickAnswer(msgs.slice(base), mooted?.rounds);
      if (media.length) {
        const added = msgs.slice(base);
        let reply = shown.final || [...added].reverse().find((m) => m.role === 'assistant' && !m.tool_calls);
        if (!reply) { reply = { role: 'assistant', content: '' }; msgs.push(reply); }
        reply.media = [...(reply.media || []), ...media].slice(0, 24);
      }
      // The thinking bubble (public/think-bubble.js) puts this in the chat as the answer, whole.
      emit({ type: 'final', text: shown.text, ...(shown.final?.correction ? { correction: shown.final.correction } : {}), ...(shown.checked ? { checked: shown.checked } : {}) });
      // Answer messages mid-job: quick replies given during this job are already in the chat; the job's own question
      // goes before them, so the chat reads in the order things were said.
      const added = msgs.slice(base);
      const firstQuick = job ? shared.findIndex((m) => m.midJob === job.id) : -1;
      if (firstQuick >= 0 && added[0]?.role === 'user') shared.splice(firstQuick, 0, added.shift());
      shared.push(...added);
    }
  },
  // Nov 12 (honesty-score.js, items 190-192, always on): after a turn, a reply that was corrected and tried again is
  // marked replaced (the window folds it away); each correction goes on the job's record and in "How I got here";
  // and the brain that answered gets its answer counted, with or without a correction, for the Brains page.
  honestAfter(added, corrections, ctx, job, signal) {
    markReplaced(added);
    if (!ctx || job?.guest) return;
    for (const c of corrections.slice(0, 6)) {
      const label = (() => { try { return c.brain ? this.brainLabel(c.brain) : ''; } catch { return ''; } })();
      ctx.trace?.push(correctionStep(c.text, c.kind || 'other', label));
      ctx.ledger?.correction?.(c.text, c.kind || 'other', c.brain);
    }
    const kinds = corrections.filter((c) => c.kind).map((c) => c.kind);
    const answered = added.some((m) => m.role === 'assistant' && !m.tool_calls?.length && String(m.content || '').trim());
    if (ctx.replyModel && answered && !signal?.aborted) this.honesty?.record(ctx.replyModel, kinds);
  },
  // 1.5.79: after a job went well, one card: save its steps as a how-to? Only with "Learn how-tos" on,
  // never for a job from another Bob, not when a how-to was followed this turn or already covers it.
  howtoAfter(sessionId, text, ctx, emit, job = null) {
    if (!howtosOn(this.cfg) || job?.guest || isGuestId(sessionId)) return null;
    const steps = worthOffering(ctx.trail);
    if (!steps) return null;
    if (sessionId) { this.lastTrail.set(sessionId, { when: text, steps }); if (this.lastTrail.size > 50) this.lastTrail.delete(this.lastTrail.keys().next().value); }
    if (ctx.howtoOffered || ctx.howtoUsed) return null;
    try { if (this.howtos.covered(text)) return null; } catch { return null; }
    const o = this.howtos.offer({ sessionId, when: text, steps });
    emit({ type: 'howto-offer', id: o.id, name: o.name, when: o.when, steps: o.steps.map((s) => s.did), sessionId });
    this.log('howtos', `offered to keep ${steps.length} steps as "${o.name}"`);
    return o;
  },
  // The card's answer. save: true keeps it (with the name typed on the card, if any). Returns the how-to, or null.
  async answerHowto(id, save, name = '') {
    const o = this.howtos.takeOffer(String(id || ''));
    if (!o) return { ok: false, why: 'That card is too old now. Ask me to save the steps again.' };
    if (!save) { this.log('howtos', `"${o.name}" not kept`); return { ok: true, saved: null }; }
    const r = this.howtos.add({ name: String(name || '').trim() || o.name, when: o.when, steps: o.steps });
    this.log('howtos', `saved the how-to "${r.name}" (${r.steps.length} steps)`);
    // Its meaning, for matching, only when the Memory model is in use anyway (never started just for this).
    try {
      const hk = this.housekeeper;
      if (hk && hkSettings(this.cfg).enabled) raceTimeout(hk.embed([asDoc(embedModel(this.cfg), `${r.name}. ${r.when}`)]), 3000, null).then((v) => { if (v?.[0]) this.howtos.setVec(r.id, v[0]); }).catch((e) => this.log('side', `the how-to's meaning wasn't saved: ${causeLine(e).slice(0, 200)}`));
    } catch (e) { this.log('side', `the how-to's meaning wasn't saved: ${causeLine(e).slice(0, 200)}`); }
    return { ok: true, saved: r };
  },
};
