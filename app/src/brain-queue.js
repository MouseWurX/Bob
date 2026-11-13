// The job queue: saving and loading it, adding, moving, cancelling and retrying jobs, waiting for downloads, and
// starting the next job. Methods of the Brain class. Split out of brain.js.
import path from 'node:path';
import { readSaved } from './saving.js';
import { carryOnPlan, finishedSteps, MAX_AUTO_RESUMES, interruptedNote, isBareOk, NOTHING_TO_OK, NOTHING_TO_OK_BUSY, queuedLine, plainDoing } from './handoff.js';
import { writeJsonAtomic } from './util.js';
import { isGuestId, GUEST_LOG } from './guest-chat.js';
import { waitsForGaming, GAMING_TAG, GAMING_HINT, laneOf, suggestSession } from './sessions.js';
import { steerNote } from './job-helps.js';
import { asksAboutJob, meanwhileOn } from './meanwhile.js';
import crypto from 'node:crypto';
import { cleanEffort } from './moot.js';
import { jobHome, homeOpen, HOME_WAIT } from './job-home.js';
import { midJobFits, ACK_LINE, ACK_AFTER_MS } from './mid-job.js';
import { heedStopWord, clearDelay } from './stop-words.js';
import { autoSessionOn } from './auto-session.js';
import { stopAway, awayPlan, awayWaitLine, sendAway } from './share-jobs.js';
import { webOn } from './web.js';

// What the job's chat says when Pause stops it partway. Shown under the reply; never sent to the brain.
export const PAUSED_LINE = 'Paused. It waits in Tasks; Resume carries on from the last finished step.';
import { QUEUE_SAVE_MS, Brain } from './brain.js';
import { mainJob, SIDE_LANE, sideOk, besideBigOk, isTalker, besideOk, besideLater } from './brain-lanes.js';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const queueParts = {
  // ---- The queue: every message is its own job, run in the order sent. Nothing is dropped or cut off. ----
  // One job runs at a time (they share one graphics card); the rest wait in inn\bob\queue.json,
  // so they survive Bob being closed. Stop ends only the job that's running; a waiting job can be cancelled.
  get queueFile() { return path.join(this.cfg.dataDir, 'queue.json'); },
  loadQueue() {
    // Item 233: a queue file that won't read is kept aside (queue.json.broken-<time>), never read as empty and written over.
    let q = readSaved(this.queueFile, [], { check: Array.isArray, log: (t) => this.log?.('saving', t) });
    q = q.filter((j) => j && typeof j === 'object');
    // A job that was running when Bob closed may have half-finished: don't redo it blindly. Its ledger says what it did.
    // 1.5.38: with "Pick up where Bob left off after a restart" on (off by default), it carries on from the last finished
    // step: finished steps aren't done again, and the step that was cut off is done again from the start. A cut-off
    // step that can be left half done (typing into an app, moving files, a command...) waits in Tasks for Carry on.
    // Off, every cut-off job waits in Tasks; Carry on (the Tasks button) picks up the same way.
    for (const j of q) if (j.guest && (j.state === 'working' || j.state === 'waiting')) { j.state = 'cancelled'; j.error = 'Bob was closed; the other Bob runs it again.'; } // 1.5.72
    for (const j of q) if (j.away && j.state !== 'working') j.away = undefined;
    for (const j of q) if (j.state === 'working') {
      const plan = carryOnPlan(j);
      j.before = finishedSteps(j); j.cutStep = plan.cut; j.carryOn = plan.note;
      const tries = Number(j.resumed) || 0; // was a true/false flag before 1.5.38
      if (this.cfg?.resumeJobs === true && plan.mode !== 'wait' && tries < MAX_AUTO_RESUMES) {
        Object.assign(j, { state: 'waiting', resumed: tries + 1, pickUp: true, steps: [], at: Date.now(), error: undefined });
      } else {
        j.state = 'interrupted'; j.error = interruptedNote(j);
        if (this.cfg?.resumeJobs === true && plan.mode !== 'wait') j.error = `Bob was closed partway through this ${Math.max(2, tries)} times, so he stopped picking it up on his own. Carry on picks up from where it stopped.`;
      }
    }
    return q.filter((j) => j && j.id && j.text);
  },
  // Item 230: a step of the running job (a load, a look-up, an output) saves the list at most once a second; a change of
  // state (queued, started, finished), and a step that changes something outside Bob, saves it at once. Bob closing
  // saves what's waiting (server.js flushQueue).
  saveQueueSoon(ms = QUEUE_SAVE_MS) {
    if (this.queueTimer) return;
    this.queueTimer = setTimeout(() => { this.queueTimer = null; this.saveQueue(); }, ms);
    this.queueTimer.unref?.();
  },
  flushQueue() { if (this.queueTimer) this.saveQueue(); },
  saveQueue() {
    if (this.queueTimer) { clearTimeout(this.queueTimer); this.queueTimer = null; }
    // The list's order is the order jobs run in (the user can drag them). Finished jobs stay for a week
    // (at most 200) so the Tasks panel can show what's been completed.
    const keep = Date.now() - 7 * 864e5;
    // Remove pressed on a running job: it leaves the list once it has stopped. A paused job is kept like a waiting one.
    this.queue = this.queue.filter((j) => !(j.dropAfter && j.state !== 'working'));
    const finished = this.queue.filter((j) => !(j.state === 'waiting' || j.state === 'working' || j.state === 'paused'));
    const drop = new Set(finished.filter((j) => (j.doneAt || j.at) < keep).map((j) => j.id));
    for (const j of finished.slice(0, Math.max(0, finished.length - 200))) drop.add(j.id);
    this.queue = this.queue.filter((j) => !drop.has(j.id));
    try { writeJsonAtomic(this.queueFile, this.queue.filter((j) => !isGuestId(j.sessionId))); } catch {} // a guest chat's job isn't kept
    this.broadcast({ type: 'queue', jobs: this.queueView() });
  },
  queueView() {
    return this.queue.filter((j) => !j.dropAfter).map(({ id, sessionId, text, state, at, error, refs, kind, startedAt, doneAt, steps, effort, after, pickUp, away, guest, rent, rentOk, sentTo, home, ranHere, pausedFrom, pausedAt }) => {
      const out = (steps || []).find((x) => x.state === 'in progress');
      // Plain status for the Tasks panel: Queued, In progress, Delegated (to which copy), Completed...
      const awayNow = state === 'working' && away?.name; // 1.5.72: with another of your Bobs
      // 1.5.196 sentTo: a finished job sent whole to another Bob keeps who ran it (Tailscale test: delegatedTo was null).
      const status = state === 'waiting' ? 'queued' : state === 'working' ? (out || awayNow ? 'delegated' : rent && rentOk && !ranHere ? 'rented' : 'in progress') : state === 'done' ? 'completed' : state; // 1.5.127 rented
      return { id, sessionId, kind, text: (guest ? `From ${guest.from}: ` : '') + text.slice(0, 140), state, status, at, startedAt, doneAt, error, pics: (refs || []).length,
        delegatedTo: awayNow ? { hat: 'away', label: 'another of your Bobs', copy: away.name, sent: true } : out ? { hat: out.hat, label: out.label, copy: out.copy } : sentTo && state !== 'waiting' && state !== 'working' ? { hat: 'away', label: 'another of your Bobs', copy: sentTo, sent: true } : null, gaming: state === 'waiting' && !away && waitsForGaming(this.cfg, { kind, effort }) ? { tag: GAMING_TAG, hint: GAMING_HINT } : undefined, steps: (steps || []).slice(-8), effort: effort || 'low',
        waitsFor: state === 'waiting' && after ? after.name : undefined, pickUp: state === 'waiting' && pickUp ? true : undefined,
        home: home && !guest ? { title: home.title || '', folder: home.folder || '' } : undefined, ...(ranHere ? { ranHere: true } : {}), ...(state === 'paused' ? { pausedFrom, pausedAt } : {}) }; // items 236, 205
    });
  },
  // Drag and drop: move a waiting job in front of another waiting job (or to the end of the line).
  // The running job stays where it is.
  moveJob(id, before) {
    const from = this.queue.findIndex((j) => j.id === id && j.state === 'waiting');
    if (from < 0 || id === before) return false;
    const [job] = this.queue.splice(from, 1);
    let at = before ? this.queue.findIndex((j) => j.id === before && j.state === 'waiting') : -1;
    if (at < 0) { at = this.queue.length; } // to the back of the line
    this.queue.splice(at, 0, job);
    this.log('queue', `moved: ${isGuestId(job.sessionId) ? GUEST_LOG : `a job (${job.text.length} characters)`}`); // item 248
    this.saveQueue();
    return true;
  },
  // Clear every completed one (Remove, for one task in any state, is further down).
  clearCompleted() {
    this.queue = this.queue.filter((j) => !['done', 'cancelled'].includes(j.state));
    this.saveQueue();
    return true;
  },
  enqueue(sessionId, text, attach = [], effort = 'low', extra = {}) {
    this.lastActivity = Date.now();
    // Nov 13 (the owner): Stop and wait words. "stop", "no no", "hold on", "wait 10 minutes", "go on"... as a whole short
    // message, while a job of yours runs, waits or is paused: the app acts at once (stop-words.js). Nothing for the brain.
    const heard = heedStopWord(this, sessionId, text, attach, extra);
    if (heard) return heard;
    // 1.5.97: "ok" while a job only waits for the graphics card (no card open) gets a plain answer at once, instead of
    // queueing behind the wait it was meant to answer.
    // 1.5.104: also while a chat of this session already waits behind a picture, clip, song or sound.
    const queuedHere = this.state.state === 'painting' && this.queue.some((j) => j.state === 'waiting' && j.sessionId === sessionId && j.queuedLine);
    if (!extra.guest && !(attach || []).length && isBareOk(text) && !this.approvals.size && (this.gate?.waitingNow > 0 || queuedHere)) {
      const answer = this.gate?.waitingNow > 0 ? NOTHING_TO_OK : NOTHING_TO_OK_BUSY;
      setTimeout(() => this.broadcast({ type: 'busy-note', sessionId, text: answer }), 0);
      return { jobId: null, turnId: null, ahead: 0, answered: answer };
    }
    // Let Bob's Quick brain see the big job (PC test 1.5.203): "tell the job to ..." and "how's it going?" can't wait
    // behind the job they're about. When no Quick brain can take the message right now (one is already answering, or
    // there's no room for it), the app passes the note along or answers from the job's record itself, at once.
    // Jobs, Steer him mid-job (job-helps.js, off unless turned on): typed in the running job's own chat, it goes to the job.
    const steered = steerNote(this, sessionId, text, attach, extra, { asksAboutJob, meanwhile: meanwhileOn(this.cfg) });
    if (steered) return steered;
    const quickAnswer = this.jobAnswer(sessionId, text, attach, extra);
    if (quickAnswer) return quickAnswer;
    this.housekeeper?.pause(); // anything the housekeeper was asking the brain gives way at once
    this.endMore(null, 'new job'); // a new message answers "Make another picture?"; the job loads what it needs
    const job = { id: crypto.randomUUID(), sessionId, text, refs: [].concat(attach || []).slice(0, 4), state: 'waiting', at: Date.now(), kind: extra.kind || Brain.guessKind(text, [].concat(attach || []).length > 0), effort: cleanEffort(effort), ...(extra.guest ? { guest: extra.guest } : {}), ...(extra.rent ? { rent: true } : {}), ...(extra.redo === 'again' || extra.redo === 'edit' ? { redo: extra.redo } : {}), home: jobHome(this.cfg, sessionId, { project: this.memProject?.get?.(sessionId) || '' }) }; // 1.5.127 rent: the 🏗 switch on the chat page; item 236 home
    // Answer messages mid-job (mid-job.js): a message that comes in while a job runs on the loaded brain is taken at
    // the job's next step boundary. A long step: a one-liner at once, so it never looks ignored.
    const main = mainJob(this);
    if (main && laneOf(this.cfg, job) === 'talk' && midJobFits(this.cfg, main, extra, attach)) {
      job.midJob = main.id;
      const t = setTimeout(() => { if (job.state === 'waiting' && job.midJob && !job.queuedLine) this.broadcast({ type: 'busy-note', sessionId, jobId: job.id, text: ACK_LINE }); }, ACK_AFTER_MS);
      t.unref?.();
    }
    this.queue.push(job);
    this.saveQueue();
    if (isGuestId(sessionId)) { const gw = (this.guestWords ||= new Map()); gw.set(job.id, String(text)); while (gw.size > 20) gw.delete(gw.keys().next().value); } // kept in memory only, never written
    this.log('queue', `${job.kind}: ${isGuestId(sessionId) ? GUEST_LOG : `a message (${String(text || '').length} characters)`}`); // item 248: sizes, not words
    const ahead = this.queue.filter((j) => j.state === 'waiting' && j.id !== job.id).length + this.turns.size;
    // 1.5.37: a message sent while Bob is making a picture, song or clip waits for the card. Say so straight away
    // (a plain line, no brain needed), so a long job never looks like Bob has stopped answering.
    const busy = this.busyLine(job);
    if (busy) { job.queuedLine = true; job.queuedText = busy; setTimeout(() => this.broadcast({ type: 'waiting-line', sessionId, jobId: job.id, id: `queued-${job.id}`, text: busy }), 0); }
    queueMicrotask(() => this.pump());
    const tip = autoSessionOn(this.cfg) ? null : suggestSession(this.cfg, this.queue); // 1.5.41: Bob picks, so no tips
    if (tip && this.suggested !== tip.id) { this.suggested = tip.id; this.broadcast({ type: 'suggest', ...tip }); }
    return { jobId: job.id, turnId: job.id, ahead };
  },
  // 1.5.41: until the side-lane reply is done (the media job waits here before it loads its own brain back).
  async sideIdle(signal) {
    while (this.turns.has(SIDE_LANE) && !signal?.aborted) await new Promise((r) => setTimeout(r, 300));
  },
  // What to tell someone whose message has to wait behind a long media job, or null.
  busyLine(job) {
    if (!this.turns.size || this.state.state !== 'painting') return null;
    if (sideOk(this, job)) return null; // 1.5.41: it's answered beside the job instead
    if (laneOf(this.cfg, job) !== 'talk' || !this.turns.has('talk')) return null; // it runs in its own lane: no wait
    return queuedLine(plainDoing(this.state.detail));
  },
  cancelJob(id) {
    const j = this.queue.find((x) => x.id === id);
    if (!j) return false;
    if (j.away && stopAway(this, j.id)) return true; // 1.5.72: with another Bob: he's told to stop
    if (j.state === 'working') return this.stop(j.id);
    if (j.state !== 'waiting') return false;
    j.state = 'cancelled';
    this.waitOver(j);
    this.saveQueue();
    return true;
  },
  retryJob(id) {
    const j = this.queue.find((x) => x.id === id);
    if (!j || !['interrupted', 'failed', 'cancelled'].includes(j.state)) return false;
    // 1.5.38: a job cut off by a restart carries on from where it stopped (its carry-on note was made at start-up).
    // A failed or cancelled job starts again from nothing, as before.
    if (j.state !== 'interrupted') { j.carryOn = null; j.before = []; j.cutStep = null; }
    j.pickUp = j.state === 'interrupted' && Boolean(j.carryOn);
    j.resumed = 0; // the user pressed it: the automatic pick-up count starts over
    j.after = undefined;
    j.state = 'waiting'; j.error = undefined; j.at = Date.now(); j.doneAt = undefined; j.steps = [];
    this.queue = [...this.queue.filter((x) => x !== j), j]; // back of the line
    this.saveQueue();
    this.pump();
    return true;
  },
  // Nov 12 (the owner): Remove works on any task, whatever its state. A waiting, paused or finished one goes at once;
  // a running one is stopped (or the other Bob is told to stop) and leaves the list when it has.
  removeJob(id) {
    const j = this.queue.find((x) => x.id === id);
    if (!j) return false;
    if (j.state === 'working' || j.away) {
      j.dropAfter = true;
      if (!(j.away && stopAway(this, j.id)) && j.state === 'working') this.stop(j.id);
      this.saveQueue(); // it leaves the list now; the stopped turn's own save drops it from queue.json
      return true;
    }
    this.waitOver(j);
    this.queue = this.queue.filter((x) => x !== j);
    this.saveQueue();
    return true;
  },
  // Nov 12 (the owner): Pause and Resume. A waiting task is held where it is in line. A running one stops after
  // Bob lets go and keeps what it has done: Resume carries on from its last finished step, the same way as after a
  // restart. A task sent to another of your Bobs can't be paused (Stop or Remove it instead).
  pauseJob(id) {
    const j = this.queue.find((x) => x.id === id);
    if (!j || j.away) return false;
    if (j.state === 'waiting') {
      j.state = 'paused'; j.pausedFrom = 'waiting'; j.pausedAt = Date.now();
      this.waitOver(j);
      this.saveQueue();
      return true;
    }
    if (j.state !== 'working') return false;
    j.pausing = true; // the turn's end (brain-turns.js) sees this and calls pauseHere instead of marking it Stopped
    return this.stop(j.id) || ((j.pausing = undefined), false);
  },
  // The running turn was stopped for Pause: note what it finished, so Resume can carry on from there.
  pauseHere(job, emit) {
    job.pausing = undefined;
    const plan = carryOnPlan(job);
    job.before = finishedSteps(job); job.cutStep = plan.cut; job.carryOn = plan.note;
    Object.assign(job, { state: 'paused', pausedFrom: 'working', pausedAt: Date.now(), error: undefined });
    emit({ type: 'token', text: `\n\n*(${PAUSED_LINE})*` });
  },
  resumeJob(id) {
    const j = this.queue.find((x) => x.id === id);
    if (!j || j.state !== 'paused') return false;
    clearDelay(this, j); // Resume pressed (or "go on") before a delay was up
    j.pickUp = j.pausedFrom === 'working' && Boolean(j.carryOn);
    if (j.pausedFrom === 'working') { j.steps = []; j.resumed = 0; }
    Object.assign(j, { state: 'waiting', pausedFrom: undefined, pausedAt: undefined, error: undefined, at: Date.now() }); // keeps its place in line
    this.saveQueue();
    this.pump();
    return true;
  },
  // Put a job back in line straight away with a note (nothing to download first).
  carryOnNow(jobId, note) {
    const j = this.queue.find((x) => x.id === jobId);
    if (!j) return false;
    if (j.state === 'working') { j.again = note; return true; } // the end of this reply puts it back in line
    j.carryOn = note; j.before = []; j.cutStep = null; j.pickUp = false;
    {
      Object.assign(j, { state: 'waiting', error: undefined, doneAt: undefined, sentTo: undefined, steps: [], at: Date.now() });
      this.queue = [...this.queue.filter((x) => x !== j), j];
    }
    this.saveQueue();
    setTimeout(() => this.pump(), 0);
    return true;
  },
  waitForDownload(jobId, modelId) {
    const j = this.queue.find((x) => x.id === jobId);
    if (!j || !modelId || (Array.isArray(modelId) && !modelId.length)) return false;
    // 1.5.91: a Set it up card can download several things (the program and the model); the job waits for all of them.
    const ids = [].concat(modelId).map(String);
    const nameOf = (x) => { try { return this.shop?.describe(x)?.name || x; } catch { return x; } };
    const name = ids.map(nameOf).join(' and ');
    j.after = { id: ids.at(-1), ids, name };
    j.carryOn = `[Bob note, not from the user: the ${name} the user downloaded for this are on the PC now. Do what they asked.]`;
    j.before = []; j.cutStep = null; j.pickUp = false;
    if (j.state !== 'working') { // still running: the end of the turn puts it back in line
      Object.assign(j, { state: 'waiting', error: undefined, doneAt: undefined, sentTo: undefined, steps: [], at: Date.now() });
      this.queue = [...this.queue.filter((x) => x !== j), j];
    }
    this.log('queue', `waits for the ${name} download: ${isGuestId(j.sessionId) ? GUEST_LOG : `a job (${j.text.length} characters)`}`); // item 248
    this.saveQueue();
    return true;
  },
  // true once the download a waiting job needs is done. A download that failed or was cancelled sends the job to
  // Tasks as interrupted, with a plain reason (it never waits forever). Paused or queued: it keeps waiting.
  downloadReady(job) {
    const ds = (job.after.ids || [job.after.id]).map((id) => (this.shop?.dl || []).find((x) => x.id === id));
    if (ds.every((d) => d?.state === 'done')) { job.after = undefined; return true; }
    if (ds.some((d) => d && ['queued', 'downloading', 'paused'].includes(d.state)) && !ds.some((d) => !d || ['failed', 'cancelled'].includes(d.state))) return false;
    const d = ds.find((x) => !x || x.state !== 'done');
    job.state = 'interrupted';
    job.error = `The ${job.after.name} download ${d?.state === 'cancelled' ? 'was cancelled' : d?.state === 'failed' ? 'failed' : 'isn\'t in Downloads any more'}, so this didn't run. Get it again in Downloads, then press Carry on.`;
    job.after = undefined;
    setTimeout(() => this.saveQueue(), 0);
    return false;
  },
  // Bob's Downloads changed (server.js passes it on): a job waiting for one may be able to go now.
  downloadsChanged() { if (this.queue.some((j) => j.state === 'waiting' && j.after)) this.pump(); },
  // Starts the next waiting job in each free lane, oldest first.
  pump() {
    if (this.switching) return; // 1.5.41: Bob is changing session; the jobs start once the new session is set
    const seen = new Set();
    for (const job of this.queue) {
      if (job.state !== 'waiting' || job.dropAfter) continue; // Remove pressed while it ran (Gaming put it back in line)
      if (job.parked && this.cfg.gamingLock === true) continue; // 1.5.41: put aside by the 🎮 Gaming button, waits for it to go off
      // 1.5.72 Share jobs: a job this Bob can't do, or that would wait, goes to one of your Bobs who says he can do it.
      if (job.awayHold && job.awayHold > Date.now()) continue; // waiting for one of your Bobs who can do it
      if (!job.away && this.cfg.share?.borrow?.jobs === true) {
        const plan = awayPlan(this, job, { can: this.jobCan(), webOn: webOn(this.cfg), waitsForGaming: waitsForGaming(this.cfg, job), laneBusy: this.turns.has(laneOf(this.cfg, job)) });
        if (plan) {
          job.away = { pending: true }; // held while we ask around, so the next pump doesn't start it here too
          const nobody = () => {
            if (job.away?.pending) job.away = undefined;
            job.awayAfter = Date.now() + 60000; // ask around again in a minute
            // Bob can't do this one here at all: it waits in Tasks for a Bob who can (up to 10 minutes), then he says so.
            if (plan.why === 'cant' && !this.lenders.anyCould(plan.need)) job.noAway = true; // none of them ever can: Bob says so now
            else if (plan.why === 'cant' && (job.awayWaits = (job.awayWaits || 0) + 1) <= 10) {
              job.awayHold = job.awayAfter;
              if (job.awayWaits === 1) this.broadcast({ type: 'busy-note', sessionId: job.sessionId, jobId: job.id, text: awayWaitLine(plan.need) });
              setTimeout(() => this.pump(), 61000).unref?.();
            } else if (plan.why === 'cant') job.noAway = true;
            setTimeout(() => this.pump(), 0);
          };
          sendAway(this, job, plan).then((went) => { if (!went) nobody(); }).catch((e) => { this.log('away', `couldn't send a job: ${e.message}`); nobody(); });
          continue;
        }
      }
      if (job.away) continue; // with another Bob (or being sent)
      if (!homeOpen(this.cfg, job)) { if (!job.homeWait) { job.homeWait = true; this.log('queue', HOME_WAIT); } continue; } // item 236: another person's job waits for them
      if (waitsForGaming(this.cfg, job)) { this.gamingProbe?.(); continue; } // 1.5.23: waits in Tasks until the session isn't Gaming
      if (job.after && !this.downloadReady(job)) continue; // 1.5.38: waits for the download it needs
      let lane = laneOf(this.cfg, job);
      let beside = false;
      if (lane === 'talk' && this.turns.has('talk') && !seen.has(SIDE_LANE) && (sideOk(this, job) || (beside = besideBigOk(this, job)))) {
        lane = SIDE_LANE;
        // 1.5.53: a talker already loaded beside the job answers there, even during a picture.
        if (!beside && this.engine?.besideLoaded?.() && isTalker(this, this.engine.beside?.current)) beside = true;
      }
      if (seen.has(lane)) continue;
      seen.add(lane);
      if (this.turns.has(lane)) continue;
      if (!besideOk(this, job, lane)) continue; // 1.5.40: waits for the other lane, see besideOk
      job.side = lane === SIDE_LANE; job.beside = job.side && beside; job.state = 'working'; job.startedAt = Date.now(); job.steps = []; this.waitOver(job);
      this.saveQueue();
      this.startTurn(job.sessionId, job.text, job.refs, job, lane);
    }
    besideLater(this);
  },
};
