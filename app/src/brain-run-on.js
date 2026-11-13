// runOn: the loop of one turn on one brain (ask the brain, run its tool calls, check, repeat until it answers).
// A method of the Brain class. Split out of brain.js.
import { newMsgId } from './chats.js';
import { chatOpenAI } from './rental.js';
import { recentPicture, wantsPictureEdit, editHint } from './intent.js';
import { switchedNote, switchLine } from './auto-session.js';
import { EDIT_NOTE, REDO_NOTE } from './redo.js';
import { isGuestId, GUEST_LOG } from './guest-chat.js';
import { namedType } from './save-as.js';
import { lastFinished, giveIds, toolMessage } from './tool-kinds.js';
import { turnNow } from './turn-log.js';
import { Ledger, doneBefore, doneBeforeNote } from './handoff.js';
import { expectFrom } from './verify.js';
import { presetFor, presetGroups, LimitedGroups, presetBrain, presetPrompt } from './presets.js';
import { groupsFor, allToolsOn, saysCant, groupOf } from './toolbox.js';
import { bigThinker, draftBrain, effortPrompt, cleanEffort } from './moot.js';
import { modelFor, currentSession, CTX_CHOICES, brainDefaults, quickOnCpu, LONG_CODER } from './sessions.js';
import { webOn, linkTurn, findLinks, refersToLink } from './web.js';
import { sameModel } from './brain-mode.js';
import { catTurn, catPrompt } from '../public/patches.js';
import { meanwhileOn, meanwhileLine, asksAboutJob, NO_JOB_LINE, claimsJobGuess, JOB_GUESS_CORRECTION, JOB_GUESS_NUDGE, noteAfterAnswer } from './meanwhile.js';
import { guestNote, guestTools } from './share-jobs.js';
import { jobHelpsPrompt, askFirstNote, SOFT_STOP_NOTE, stepsRan, SOFT_STOP_LINE, timeCheck, TIME_UP_NOTE, cleanJobHelps, testsNudge, afterAnswer, flushNoes } from './job-helps.js';
import { cleanPersonality, personalityPrompt } from '../public/personality.js';
import { roughTokens, wantsBorrow } from './share-brains.js';
import { howtosOn, usingLine, howtoPrompt, trailStep } from './howtos.js';
import { causeLine, sideJob, STRIKE_NOTE } from './retry.js';
import { carriedBudget, Progress, spendNudge, keepBudget, stage, pastCeiling, ceilingMs, wrapUp, ceilingMins, waitedFor, outOfStepsLine, nudgeOk, CALLS_PER_TURN, CAP_SKIP, droppedNote } from './loop-guard.js';
import { tidyOld, LAST_ROUND_NOTE, onTrackNote, promisesAction, PROMISE_NUDGE, PROMISE_LOG, nearKey, errorHint } from './loop-help.js';
import { midJobOn } from './mid-job.js';
import { systemPrompt } from './persona.js';
import { lookPrompt } from './look.js';
import { pendingLine } from './said-done.js';
import { saveSettings } from './config.js';
import { HANDS } from './hands-settings.js';
import { noteStrike, maybeAsk as qAsk } from './quarantine.js';
import { planGate } from './plan.js';
import { askTogether } from './together.js';
import { callKey, realState, linkKey, NOW_IN_NOTE, staleHandErrors, meanwhileNear, claimsPcAction, CLAIM_CORRECTION, CLAIM_NUDGE, claimsObservation, OBSERVE_CORRECTION, OBSERVE_NUDGE, LINK_NUDGE, EMPTY_NUDGE, CANT_NUDGE, EMPTY_NOTE, DOING_TOOLS, isLook, ALT_ROUTE_DONE, ALT_ROUTE_NUDGE, quickHandBack } from './brain-words.js';
import { sidePick, apuRoom } from './brain-lanes.js';
import { MAX_STEPS, loopSteps, borrowedLine, MAX_CALLS_PER_REPLY, HAND_TOOLS, repeatCheck, repeatNote, trailOf, REPEAT_STOP_LINE, REPEATS_THEN_ANSWER, ANSWER_NOW_NUDGE } from './brain.js';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const runOnParts = {
  async runOn(msgs, text, emit, signal, pics, job = null, sessionId = null, out = {}) {
    const user = { role: 'user', content: text, at: Date.now(), id: newMsgId() };
    // 1.5.94: a picture edit in plain English ("change this picture", "make her hair red", "now make the sky purple"):
    // the picture attached now, or else the newest one in this chat (attached or made a moment ago).
    let recent = null;
    if (!pics.length) { try { recent = recentPicture(msgs, { findRef: (id) => { const r = this.refs.find(id); return r ? { ...r, path: this.refs.pathOf(r) } : null; }, findPainted: (n) => this.findPicture(n) }); } catch {} }
    const wantsEdit = wantsPictureEdit(text, { pic: pics.length > 0, recent: Boolean(recent) });
    let picNote = '';
    if (pics.length) {
      const { note, images } = await this.look(pics, emit, signal);
      picNote = note;
      user.content = `${text}\n\n${note}`;
      user.refs = pics.map((r) => r.id);
      user.text = text;
      if (images.length) user.images = images;
    }
    // 1.5.38: after a restart, the brain is told which steps already finished and which was cut off (the chat shows only
    // the user's own words).
    if (wantsEdit) { user.content = `${user.content}\n\n${editHint(pics.length ? pics.map((r) => r.name) : [recent.name])}`; user.text = text; }
    if (job?.carryOn) { user.content = `${user.content}\n\n${job.carryOn}`; user.text = text; }
    // 1.5.41: run again after Bob switched session: the user's message is already in the chat once, so the brain gets the
    // note only (hidden), and the turn starts at the user's message from before.
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    // 1.5.128: the same after a Hire it card (Hire it or Not now): the message that drew the card is in the chat already,
    // so the re-run adds only the hidden note (the PC saw the user's bubble twice after a reload).
    // Try again and Edit (redo.js): the message is already in the chat, changed in place, so the brain gets a hidden note only.
    const again = (Boolean(job?.switchedTo) || Boolean(job?.rentAgain) || Boolean(job?.redo)) && Boolean(lastUser) && String(lastUser.text ?? lastUser.content ?? '').startsWith(text);
    if (again) msgs.push({ role: 'system', content: job.switchedTo ? switchedNote(job.switchedTo) : job.redo && !job.carryOn ? (job.redo === 'edit' ? EDIT_NOTE : REDO_NOTE) : job.carryOn || '', hidden: true });
    else { msgs.push(user); if (!job?.guest) emit({ type: 'asked', id: user.id }); } // the window marks your bubble, for Edit (redo.js)
    if (job) job.rentAgain = false;
    const turnStart = again ? msgs.map((m) => m.role).lastIndexOf('user') : msgs.length - 1;
    // 1.5.207 PC check: after Switch it on (or any carry-on), the same chat line went in the logbook a second time.
    const sameAsk = (again || Boolean(job?.carryOn)) && Boolean(lastUser) && String(lastUser.text ?? lastUser.content ?? '').startsWith(text);
    if (sameAsk) this.log('chat', 'carried on with the same ask');
    else this.log('chat', `${this.cfg.userName || 'User'}: ${isGuestId(sessionId) ? GUEST_LOG : `a message (${String(text || '').length} characters${pics.length ? `, ${pics.length} picture${pics.length === 1 ? '' : 's'}` : ''})`}`); // item 248: sizes, not words
    // The turn's pictures travel with it, so a hat Bob hands the job to can see them too.
    // Every picture, clip or sound he makes goes on the Made by Bob list as it's announced.
    const emitMade = (ev) => {
      if (['image', 'video', 'audio'].includes(ev?.type) && ev.file) { try { this.made.add(ev.file, { tool: ev.type, chat: sessionId, song: ev.song || null }); } catch {} }
      const sent = emit(ev);
      if (['image', 'video', 'audio'].includes(ev?.type) && ev.file && ctx?.wantType) this.autoSaveAs(ev, ctx); // 1.5.95 "a song as an mp3"
      return sent;
    };
    const ctx = { emit: emitMade, signal, brain: this, cfg: this.cfg, allowAll: new Set(), pics, picNote, msgs, turnText: text, job, sessionId, wantsEdit, editFrom: wantsEdit ? recent : null, wantType: namedType(text), saves: [], savedAs: [], trace: [], askId: (again ? lastUser?.id : user.id) || null }; // askId: item 238
    // Item 171 (Nov 12): an action key for each action. After a restart, the last action that already finished is
    // remembered, so the same write or command asked for again first thing hands back its result instead of running twice.
    const lastDone = lastFinished(job?.before, this.tools);
    if (lastDone) ctx.lastDoing = { key: callKey(lastDone.name, lastDone.args), text: `${lastDone.text} (this finished before Bob was closed)` };
    if (!job?.guest) (this.traces ||= new Map()).set(sessionId, ctx.trace); // item 10: How I got here
    { const t = turnNow(); if (t && !t.ctx) t.ctx = ctx; } // item 249: the end of the turn reads why it stopped
    // The ledger (handoff.js): what was asked for, every load, tool and output this turn, kept by the system.
    ctx.ledger = new Ledger({ job, expect: expectFrom(text, { pics }), save: (now) => (now ? this.saveQueue() : this.saveQueueSoon()) }); // item 230
    this.gate.track(signal, ctx.ledger);
    ctx.loaded = this.startGroups(sessionId, text); // toolbox groups this turn (use_tools adds more)
    // Assistant presets (presets.js, off unless switched on): this chat's preset, if it has one. Its tool groups are a
    // limit no later add gets past; "Talking only" means no tools at all. Never for guests (Discord, Telegram).
    ctx.preset = job?.guest ? null : presetFor(this.cfg, sessionId);
    const presetOnly = presetGroups(ctx.preset);
    if (presetOnly) { ctx.loaded = new LimitedGroups(ctx.loaded, presetOnly); if (!presetOnly.size) ctx.noTools = true; }
    if (wantsEdit && groupsFor(this).pictures) ctx.loaded.add('pictures'); // 1.5.94: an edit needs make_image at hand
    out.ctx = ctx;
    const used = new Set();
    // High and Extreme effort draft on the big brain; Low is the usual chat brain.
    if (job?.side && !job.sidePick) job.sidePick = await sidePick(this, job);
    let { model, cpu, think, ctx: wantCtx, beside } = job?.side ? job.sidePick : (bigThinker(job) && draftBrain(this.cfg, job.effort)) || modelFor(this.cfg, 'bob');
    // 1.5.16: a Low-effort chat reply doesn't think first (gemma4 and others think by default, which delays every reply).
    // Medium and up, and sessions that set a level (Deep thought), keep their thinking.
    if (think === undefined && !bigThinker(job)) think = false;
    // A preset's own brain: Low effort in the Normal session only (Medium and up draft on the big brains as usual, and the
    // other sessions keep their brain, so Gaming never loads a big one). Only a brain still in one of Bob's slots.
    const pBrain = ctx.preset && !job?.side && !bigThinker(job) && currentSession(this.cfg).id === 'normal' ? presetBrain(this.cfg, ctx.preset) : '';
    if (pBrain) {
      ({ model, cpu, ctx: wantCtx } = modelFor({ ...this.cfg, quickOnCpu: false, oneBrain: false, models: { ...this.cfg.models, bob: pBrain } }, 'bob'));
      beside = undefined;
      this.log('chat', `preset "${ctx.preset.name}": ${pBrain} answers`);
    }
    // 1.5.66: Qwen3.6 as the main Brain (everyday chat): no thinking first, and the same long load (256K since 1.5.86) its Coding copy
    // uses, so chat and coding don't reload the brain between them. A context picked by hand for Normal still wins.
    if (!job?.side && !bigThinker(job) && currentSession(this.cfg).id === 'normal' && !CTX_CHOICES.includes(this.cfg.sessionCtx?.normal)) {
      const d = brainDefaults(model, 'bob');
      if (d.ctx) wantCtx = d.ctx;
      if ('think' in d) think = d.think;
    }
    // 1.5.69: with "Keep the graphics card free for quick answers" on, Low chat runs on the small Quick brain, which is
    // poor at reading web pages. A message with a link in it (or one about a link from earlier) goes to the main Brain
    // instead, like any other hand-off. Normal session only: Gaming keeps its own small brain (never E4B, never the card).
    if (!job?.side && !bigThinker(job) && !again && !pBrain && quickOnCpu(this.cfg) && currentSession(this.cfg).id === 'normal'
      && webOn(this.cfg) && this.usable('fetch_page') && linkTurn(text, msgs.slice(0, turnStart))) {
      const main = modelFor({ ...this.cfg, quickOnCpu: false }, 'bob');
      if (main.model && !sameModel(main.model, model)) {
        ({ model, cpu, ctx: wantCtx } = main);
        think = false; // a Low chat reply, on whichever brain
        // Settings review: a load costs time, so say how long when the main Brain isn't loaded yet.
        let loaded = false, secs = null;
        try { loaded = await this.engine.isLoaded(model, { cpu, ctx: wantCtx }); } catch {}
        if (!loaded) { try { secs = await this.engine.estimateLoad?.(model, { cpu, ctx: wantCtx }); } catch {} }
        emit({ type: 'announce', text: `This one has a link in it, so my main Brain takes it${loaded ? '' : secs ? ` (loading it, about ${Math.round(secs)} seconds)` : ' (loading it)'}.` });
        this.log('chat', `a link: the main Brain (${model}) answers instead of the Quick brain`);
      }
    }
    // Small extras, only on some turns: the effort note (High/Extreme) and now and then a moment with the cat.
    const turnNo = msgs.filter((m) => m.role === 'user').length;
    const state = realState({ model, session: currentSession(this.cfg).label, waiting: this.queue.filter((j) => j.state === 'waiting').length, cat: this.cfg.catName, turn: turnNo, withCat: catTurn(turnNo) });
    // Let Bob's Quick brain see the big job: a quick reply beside it gets the Meanwhile line, written by the app.
    // PC test (1.5.203): a small Quick brain answered about the job before; the line names the running one, and also goes
    // just before the latest message (meanwhileNear). A question about the job after it ended gets the no-job line.
    const meanwhile = !meanwhileOn(this.cfg) || job?.guest ? '' : job?.side && this.watch.job ? meanwhileLine(this.watch.job) : asksAboutJob(text) && !this.watch.job ? NO_JOB_LINE : '';
    ctx.meanwhile = job?.side ? meanwhile : '';
    const extras = [state, meanwhile, presetPrompt(ctx.preset, this.cfg.userName || 'the user'), guestNote(job, this.cfg.userName || 'the user'), effortPrompt(job?.effort), jobHelpsPrompt(this.cfg, job), catPrompt({ cat: this.cfg.catName, turn: turnNo, dials: cleanPersonality(this.cfg.personality), user: this.cfg.userName || 'the user' })].filter(Boolean).map((x) => `\n\n${x.replaceAll('{{USER}}', this.cfg.userName || 'the user')}`).join('');
    const brainCtx = await this.fitCtx(model, wantCtx);
    // 1.5.127: a chat that no longer fits the biggest brain here, with a rented brain in its slot: offer it (the job carries on here meanwhile).
    if (!job?.rent && !job?.side && !job?.guest && this.rentals.current() && !ctx.rentOffered) {
      const tokens = roughTokens({ messages: msgs });
      if (brainCtx && tokens > brainCtx * 0.9) {
        this.offerRent(ctx, { tokens, why: `This chat and its files come to about ${Math.round(tokens / 1000)}K words, and my biggest brain here keeps ${Math.round(brainCtx / 1000)}K in mind.` });
        emit({ type: 'announce', text: 'This one is getting big for my brains here. I\'ll try anyway; the card below hires a bigger brain for it.' });
      }
    }
    if (!model) throw new Error('I don\'t have a brain yet. Open Get models (in the menu on the left) and pick one; the first-time setup suggests the right one for this replicant matrix.');
    // Nov 13 (the owner): a brain still loading from typing stays 'waking' (the cube keeps filling, the status line says
    // loading) until it is in; wake() then hands over to 'thinking'.
    if (!this.waking) this.setState('thinking', '', this.state.model);
    let earlier = job?.guest?.public ? '' : await this.recall(sessionId, text); // Bob on Discord: nothing of the owner's
    // Nov 11 (loop-help.js): the tool groups the message means, as well as the ones its words name. Only while the
    // embedding model is in use anyway (topics or "Remember only what fits"); never started just for this.
    if (!ctx.noTools && !again && !job?.guest && !allToolsOn(this.cfg)) {
      const add = await this.meaningGroups(text).catch(() => []);
      const fresh = add.filter((g) => !ctx.loaded.has(g));
      for (const g of fresh) ctx.loaded.add(g);
      if (fresh.length) this.log('toolbox', `added by meaning: ${fresh.join(', ')}`);
    }
    // 1.5.79 How-tos (off by default): the one saved how-to that fits this request goes in for this turn, and the chat says so.
    if (howtosOn(this.cfg) && !again && !job?.guest) {
      let howto = null;
      try { howto = this.howtos.match(text, this.recallVec?.text === text ? this.recallVec.vec : null); } catch (e) { this.log('side', `how-to match didn't work: ${causeLine(e).slice(0, 200)}`); } // item 204
      if (howto) {
        ctx.howtoUsed = howto;
        try { this.howtos.used(howto.id); } catch {}
        emit({ type: 'tool', name: 'howto', summary: usingLine(howto) });
        earlier = [earlier, howtoPrompt(howto, this.cfg.userName || 'the user').trim()].filter(Boolean).join('\n\n');
        this.log('howtos', `following the how-to "${howto.name}"`);
      }
    }

    // Share brains (1.5.55): with "Borrow a brain" on and the owner's "when" met, one of his other Bobs thinks this reply.
    // The tools still run here, with this Bob's own checks and OK cards. No answer in time: this Bob thinks for himself.
    // 1.5.72: with several Bobs on the list, a Bob that's already thinking for us (or says busy) is skipped for the next.
    const tried = [];
    // 1.5.72: the Bob is picked once the chat is put together, so only Bobs with room for it are asked (Lenders.pick).
    let borrowing = wantsBorrow(this.cfg, this.borrowCase(job, pics));
    let lender = null;
    // 1.5.127 Rented brains: a job marked for the rented brain (the 🏗 Rented brain switch, a Hire it card, or Bob's own
    // hire_brain) thinks on the hired brain; the tools still run here. Not yet approved: the Hire it card, and nothing else.
    let rented = null;
    if (job?.rent && !job.side && !job.guest) {
      const rental = this.rentals.current();
      if (!rental) emit({ type: 'announce', text: 'No rented brain is in its slot (Settings, Brains), so I\'m doing this one here.' });
      else if (!this.rentals.approved(rental, job)) {
        const r = this.offerRent(ctx, { why: 'You asked for the rented brain.' });
        emit({ type: 'announce', text: r?.blocked ? `I can't hire ${rental.name} yet: ${r.blocked}` : `Press Hire it on the card below and I'll run this on ${rental.name}.` });
        this.log('rent', 'waiting for the Hire it card');
        return;
      } else { rented = rental; borrowing = false; }
    }
    // 1.5.133 (Legion Go): when this Bob's own brain can't load here (the memory guard on built-in graphics says no),
    // the job goes to a paired Bob, whatever "when" borrowing is set to, as long as borrowing is switched on at all.
    // Nobody free: the plain "needs about N GB" line, as before. Never for a side lane, a guest, or a rented job.
    let ownRefused = null;
    if (!borrowing && !rented && !job?.side && !job?.guest && this.cfg.share?.borrow?.on === true && (this.cfg.share.borrow.bobs || []).length && !pics.length) {
      const room = await apuRoom(this, model, brainCtx).catch(() => ({ ok: true }));
      if (!room.ok) { ownRefused = room; borrowing = true; this.log('borrow', `my own brain won't fit here (needs ~${room.needGB} GB, room ~${room.roomGB} GB); asking another Bob`); }
    }

    // 1.5.60: a link in the message, with web search on: open it first, so even a small brain that would say
    // "I have no web access" answers from the page. Only the first link; it shows as a normal 🔧 Read the page line.
    // 1.5.65: "check out the page I told you about" has no link in it: then the newest link from the last few
    // messages counts. And if he still says he can't, he gets that page and one more go (see saysCant below).
    const webLinks = !again && webOn(this.cfg) && this.usable('fetch_page');
    const openLink = async (url, why) => {
      ctx.linkOpened = true;
      const res = await this.runTool('fetch_page', { url }, ctx).catch((e) => ({ text: `Error: ${e.message}` }));
      if (!/^Error:/.test(String(res.text))) (ctx.openedUrls ||= new Set()).add(linkKey(url));
      msgs.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'fetch_page', arguments: { url } } }] });
      msgs.push({ role: 'tool', tool_name: 'fetch_page', content: String(res.text) });
      this.log('tool', `${why}: ${url}`);
    };
    const earlierLink = () => {
      const users = msgs.slice(0, turnStart).filter((m) => m.role === 'user').slice(-4).reverse();
      for (const m of users) { const [u] = findLinks(m.text ?? m.content, 1); if (u) return u; }
      return null;
    };
    if (webLinks) {
      const [url] = findLinks(text, 1);
      if (url) await openLink(url, 'opened the link in the message first');
      else if (refersToLink(text)) { const u = earlierLink(); if (u) await openLink(u, 'opened the link from earlier in the chat first'); }
    }

    // Nov 11 (loop-help.js): what the brain sees each step: old results as one line once the chat is long, and on a
    // long job a short "where we are" note last. The last step has no tools, so he answers instead of running out.
    // Reliability 164: a job that runs again (session switch, rented-brain card, Gaming, restart) carries on with the
    // steps, sends-back and calls it has left, instead of a whole new budget each time.
    const carried = carriedBudget(job, this.plainLoop || job?.guest ? MAX_STEPS : loopSteps(job?.effort));
    const maxSteps = carried.maxSteps;
    Object.assign(ctx, { carriedSteps: carried.steps, nudges: carried.nudges, callsRun: carried.calls, turnStartedAt: Date.now(), progress: new Progress() });
    if (carried.steps) this.log('loop', `carrying on: ${carried.steps} steps used before, ${maxSteps} left`);
    const log = (k, t) => this.log(k, t);
    const whoFor = () => this.cfg.userName || 'the user';
    // Reliability 152 + 153: a send-back costs from the turn's small budget, not a job step.
    const nudged = () => { spendNudge(ctx); step--; };
    const timeCardOwns = Boolean(job && !job.side && !job.guest && this.cfg.jobHelps?.timeLimit === true);
    let step = 0;
    const loopView = (list, step) => {
      if (this.plainLoop) return list;
      const { list: out, tidied } = this.helpOff('tidy') ? { list, tidied: 0 } : tidyOld(list, turnStart, brainCtx);
      if (tidied && !ctx.tidySaid) { ctx.tidySaid = true; this.log('chat', `the chat is long: ${tidied} older tool results set aside as one line each`); }
      const who = this.cfg.userName || 'the user';
      const note = ctx.lastRound ? LAST_ROUND_NOTE(who) : this.helpOff('note') ? '' : onTrackNote({ ask: text, turn: out.slice(turnStart), step, max: maxSteps, who });
      return note ? [...out, { role: 'system', content: note }] : out;
    };
    // Jobs, One question before a vague big job (job-helps.js): a hint to ask once with ask_user before starting.
    if (!again) { const ask = askFirstNote(this, ctx, text); if (ask) msgs.push({ role: 'system', content: ask, hidden: true }); }
    for (step = 0; step < maxSteps; step++) {
      if (signal?.aborted) throw Object.assign(new Error('Stopped.'), { name: 'AbortError' }); // item 244: Stop during a card or a tool that didn't notice
      // Answer messages mid-job (mid-job.js): messages that came in during the last step come first, then the job goes on.
      if (step > 0 && !job?.side && !job?.guest && !lender && !rented && midJobOn(this.cfg)) await this.midJobTurn(ctx, { model, cpu, brainCtx, signal, emit });
      keepBudget(job, ctx, step + 1);
      stage(ctx, 'reading', step, log);
      // Reliability 161: an always-on ceiling per turn (card waits don't count), apart from the opt-in job time limit.
      // It uses the job time limit's minutes; when that switch is on for this job, its own card (which can give more
      // time) is in charge instead.
      if (!ctx.lastRound && !ctx.noTools && step > 0 && !timeCardOwns && pastCeiling(ctx.turnStartedAt, signal, Date.now(), ceilingMs(this.cfg))) wrapUp(ctx, msgs, 'time', whoFor(), log, ceilingMins(this.cfg));
      // Jobs (job-helps.js): "Stop after this step" pressed, or the job's time limit used up: no more tools, he wraps up.
      if (!ctx.lastRound && step > 0) {
        const who = this.cfg.userName || 'the user';
        if (job?.stopAfter && !ctx.softStopped) { ctx.softStopped = true; ctx.endWhy = 'stop-after'; ctx.noTools = true; ctx.lastRound = true; msgs.push({ role: 'system', content: SOFT_STOP_NOTE(who, stepsRan(msgs, turnStart)), hidden: true }); emit({ type: 'announce', text: SOFT_STOP_LINE }); }
        else if (await timeCheck(this, ctx, { now: () => Date.now() - waitedFor(signal) }) === 'wrap') { ctx.endWhy = 'time'; ctx.noTools = true; ctx.lastRound = true; msgs.push({ role: 'system', content: TIME_UP_NOTE(who, cleanJobHelps(this.cfg.jobHelps).minutes), hidden: true }); }
      } else if (step === 0) await timeCheck(this, ctx, { now: () => Date.now() - waitedFor(signal) });
      if (step === maxSteps - 1 && !this.helpOff('last') && !ctx.noTools && msgs.slice(turnStart).some((m) => m.role === 'tool')) { ctx.noTools = true; ctx.lastRound = true; ctx.endWhy ||= 'steps'; this.log('tool', 'the last step: no more tools, so he answers with what he has'); }
      const tools = ctx.noTools ? [] : guestTools(job, this.withWatchTools(this.frontDeskTools(ctx.loaded), job)); // #57 stopgap: after repeats, answer
      // The big brain reads notes passed along to it at the start of each step, and its chat says so.
      if (!job?.side) this.readNotes(ctx, msgs);
      // 1.5.66: Bob's own one-more-go after a reply that missed. On Qwen3.6 (everyday chat answers without thinking)
      // the retry thinks it through: thinking is set per request, so the same loaded brain does it, no reload.
      // 1.5.206 PC check: thinking on every retry (Nov 11) cut "answered in words" from 98% to 81% on Riker, because a
      // thinking retry can spend the reply on thinking and say nothing. Back to the long coders only, unless a brain's
      // retries are asked to think (loopHelpOn: ['think'], for the loop test).
      if (ctx.retrying && think === false && (LONG_CODER.test(String(model || '')) || (this.cfg?.loopHelpOn || []).includes('think'))) {
        think = undefined;
        if (LONG_CODER.test(String(model || ''))) emit({ type: 'announce', text: 'Trying again, thinking it through this time.' });
        this.log('chat', 'one more go, with thinking on (if this brain thinks)');
      }
      ctx.retrying = false;
      const pub = Boolean(job?.guest?.public); // Bob on Discord: no memory, about-me or backstory of the owner's
      const hush = pub || isGuestId(sessionId); // a guest chat: no memory or about-me either (guest-chat.js)
      const sys = { role: 'system', content: this.withLimits(systemPrompt({ now: this.now(), memory: hush ? '' : this.memory(), user: pub ? 'the owner' : this.cfg.userName, backstory: pub ? '' : this.backstory(), about: hush ? '' : this.about(), cat: this.cfg.catName, look: lookPrompt(this.cfg), dials: personalityPrompt(this.cfg.personality, pub ? 'the owner' : this.cfg.userName || 'the user') }), ctx.loaded) + extras + (earlier ? `\n\n${earlier}` : '') };
      // Nov 11 (item 1): what changes every turn (the time, the Right now line, recalled bits) goes in a short note just
      // before the latest message, not in the instructions. The time changed every minute and the RAM line every turn,
      // so the engine threw away the whole chat it had already read and read it again; now it keeps it (its prompt cache).
      const steadySys = { role: 'system', content: this.withLimits(systemPrompt({ now: NOW_IN_NOTE, memory: hush ? '' : this.memory(), user: pub ? 'the owner' : this.cfg.userName, backstory: pub ? '' : this.backstory(), about: hush ? '' : this.about(), cat: this.cfg.catName, look: lookPrompt(this.cfg), dials: personalityPrompt(this.cfg.personality, pub ? 'the owner' : this.cfg.userName || 'the user') }), ctx.loaded) };
      const waitingOn = pendingLine(this.switchesOff(), this.pendingSwitches()); // 1.5.207: one short line, only while an offer waits
      const turnNote = `Current date and time for ${pub ? 'the owner' : this.cfg.userName || 'the user'}: ${this.now()}.${extras}${waitingOn ? `\n${waitingOn}` : ''}${earlier ? `\n\n${earlier}` : ''}`;
      let reply = null;
      // A lender keeps the start of the chat it read last time (its prompt cache), so what changes every turn (the time,
      // the Right now line, recalled bits) goes in a short note just before the latest message, not in the instructions.
      let lentMsgs = null, lentSize = 0;
      if (borrowing) {
        const lentSys = steadySys;
        const hist = loopView(staleHandErrors(msgs, turnStart), step);
        const at = hist.findLastIndex((m) => m.role === 'user');
        const note = { role: 'system', content: turnNote };
        lentMsgs = at < 0 ? [lentSys, ...hist, note] : [lentSys, ...hist.slice(0, at), note, ...hist.slice(at)];
        lentSize = roughTokens({ messages: lentMsgs, tools });
        if (!lender) {
          lender = await this.lenders.pick({ skip: tried, tokens: lentSize }).catch(() => null);
          if (lender) { tried.push(lender.address); emit({ type: 'borrow', action: 'start', name: lender.name, brain: lender.brain, device: lender.device }); }
          else {
            borrowing = false; // nobody free with room: this Bob thinks it, quietly (nothing went wrong)
            if (ownRefused) this.log('borrow', 'no other Bob is free; trying my own brain anyway (if it runs out of memory it loads again with less)');
            const small = this.lenders.tooBigFor(lentSize);
            this.log('borrow', small.length ? `this chat is too long for ${small.join(', ')} (about ${lentSize} tokens); thinking it myself` : 'none of my other Bobs is free; thinking it myself');
          }
        }
      }
      if (rented) {
        const rName = rented.name;
        this.setState('thinking', `${rName} (rented) is thinking`, this.state.model);
        if (!ctx.rentSaid) { ctx.rentSaid = true; emit({ type: 'rent', action: 'thinking', rental: rName, service: this.rentals.view().rentals.find((r) => r.id === rented.id)?.serviceName || '' }); }
        let rentShown = 0;
        try {
          reply = await this.rentals.chat(rented, { messages: [sys, ...loopView(staleHandErrors(msgs, turnStart), step)], tools, signal, think, job, emit, onToken: (t) => { rentShown += String(t).length; emit({ type: 'token', text: t }); } });
        } catch (e) {
          if (signal?.aborted) throw e;
          // Item 205: it falls back once (rented stays off for the rest of this job), the half answer it gave is taken
          // back, and the job's record says the reply came from this computer.
          this.log('rent', `${rName} couldn't take it (${causeLine(e).slice(0, 200)}); thinking it here for the rest of this job`);
          if (rentShown) emit({ type: 'token-undo', chars: rentShown });
          emit({ type: 'rent', action: 'back', rental: rName, why: e.message });
          ctx.ledger?.step('fallback', { from: `${rName} (rented)`, to: 'this computer', why: e.message }).done();
          if (job) { job.ranHere = true; job.rentOk = false; }
          ctx.rentFellBack = rName;
          reply = null;
          rented = null;
        }
      }
      if (lender) {
        this.setState('thinking', `${lender.name} is thinking`, this.state.model);
        let said = false;
        const askedAt = Date.now(); let firstAt = 0, lentShown = 0;
        try {
          reply = await this.lenders.chat(lender, { messages: lentMsgs, tools, signal, from: this.cfg.windowsName || 'Bob', onToken: (t) => { if (!said) firstAt = Date.now(); said = true; lentShown += String(t).length; emit({ type: 'token', text: t }); } });
          // 1.5.181 (two-Bob trial: the reply came back empty and nothing ran here): an empty answer counts as a "couldn't".
          if (!String(reply?.content || '').trim() && !(reply?.tool_calls || []).length) { reply = null; throw Object.assign(new Error('it came back empty'), { busy: !said }); }
          // 1.5.196 (Tailscale test): a borrowed reply that went well leaves a line in the logbook too, once per Bob per
          // reply, with how long the first word took. Never the words themselves.
          ctx.borrowLogged = ctx.borrowLogged || new Set();
          if (!ctx.borrowLogged.has(lender.address)) { ctx.borrowLogged.add(lender.address); this.log('borrow', borrowedLine(lender.name, (firstAt || Date.now()) - askedAt)); }
        } catch (e) {
          if (signal?.aborted) throw e;
          // Said busy (or "too long") before a single word: the next of your Bobs that has room gets a go first.
          const next = e.busy && !said ? await this.lenders.pick({ skip: tried, tokens: lentSize }).catch(() => null) : null;
          if (next) {
            tried.push(next.address);
            this.log('borrow', `${lender.name} was busy; asking ${next.name}`);
            emit({ type: 'borrow', action: 'start', name: next.name, brain: next.brain, device: next.device });
            lender = next;
            step--; continue; // same step again, with the next Bob
          }
          this.log('borrow', `${lender.name} couldn't think this one (${causeLine(e).slice(0, 200)}); thinking it myself`);
          if (lentShown) emit({ type: 'token-undo', chars: lentShown }); // item 193: his half answer goes; this Bob's whole one follows
          emit({ type: 'borrow', action: 'back', name: lender.name, why: e.why === 'too long' ? 'too long' : e.message, partial: said });
          lender = null; borrowing = false;
        }
      }
      // Nov 13 (card-guard.js): the card is busy with another program and this brain won't fit beside it. He asks first:
      // wait, use the brain already there (ctx.onCard, for the rest of this turn), or another of his Bobs.
      if (!reply && ctx.onCard) {
        this.setState('thinking', 'Thinking on the brain already on the card', this.state.model);
        try { reply = await chatOpenAI({ url: `${ctx.onCard.url}/v1`, key: '', model: 'served', messages: [sys, ...loopView(staleHandErrors(msgs, turnStart), step)], tools, signal, think, onToken: (t) => emit({ type: 'token', text: t }) }); }
        catch (e) {
          if (signal?.aborted) throw e;
          this.log('card', `the brain on the card couldn't answer (${causeLine(e).slice(0, 160)})`);
          emit({ type: 'announce', text: 'The brain on the card stopped answering, so I\'ll look at the card again.' });
          ctx.onCard = null; this.liftCardPause(); reply = null;
        }
      }
      if (!reply && !cpu) {
        const pick = await this.cardGuard(model, { cpu, ctx: brainCtx, ...(beside ? { beside: true } : {}) }, emit, signal, { sessionId, chat: !job?.guest && !job?.side, borrowOk: !ctx.cardBorrowTried });
        if (pick.borrow) { ctx.cardBorrowTried = true; borrowing = true; step--; continue; }
        if (pick.use) {
          ctx.onCard = pick.use;
          emit({ type: 'announce', text: pick.use.paused ? 'The test paused. Answering on its brain; it carries on after this.' : 'Answering on the brain already on the card. The test there keeps running, so its timings will be off for a moment.' });
          step--; continue;
        }
      }
      if (!reply) {
        model = (await this.ensureModel(model, emit, signal, 'bob', { cpu, ctx: brainCtx, ...(beside ? { beside: true } : {}), cardChecked: true })) || model;
        this.setState('thinking', '', model);
        reply = await this.chatSafe({
          model, messages: this.plainLoop ? [sys, ...meanwhileNear(loopView(staleHandErrors(msgs, turnStart), step), ctx.meanwhile ? meanwhileLine(this.watch.job) || ctx.meanwhile : '')] : [steadySys, ...meanwhileNear(meanwhileNear(loopView(staleHandErrors(msgs, turnStart), step), turnNote), ctx.meanwhile ? meanwhileLine(this.watch.job) || ctx.meanwhile : '')], tools, signal, cpu, think, ctx: brainCtx, ...(beside ? { beside: true } : {}),
          ...(ctx.preset && ctx.preset.temperature !== null ? { temperature: ctx.preset.temperature } : {}), // a preset's own temperature
          ...(sessionId ? { chatId: sessionId } : {}), // Each chat keeps its place in the engine (chat-places.js, off unless switched on)
          onToken: (t) => emit({ type: 'token', text: t })
        }, { emit });
      }
      // He's seen the new look once; that's enough.
      if (this.cfg.lookChange) { try { saveSettings(this.cfg, { lookChange: null }); } catch {} this.cfg.lookChange = null; }
      // Reliability 154-161: a round with no tools offered (a wrap-up, the last step) runs no calls, even if the brain
      // writes some anyway; he answers with what he said, or the record's plain ending.
      if (ctx.noTools && reply?.tool_calls?.length) {
        this.log('loop', `no tools this round, so ${reply.tool_calls.length} call${reply.tool_calls.length === 1 ? '' : 's'} he asked for did not run`);
        reply = { ...reply, tool_calls: undefined };
        if (!String(reply.content || '').trim()) { reply.content = outOfStepsLine({ ...(ctx.trailSay || {}), lead: 'I stopped there.' }); emit({ type: 'token', text: reply.content }); }
      }
      if (ctx.rentFellBack && reply && !reply.tool_calls?.length) reply.ranHere = true; // item 205: the record says it came from here
      msgs.push(reply);
      this.cutNote(reply, emit); // item 210
      if (!lender) ctx.replyModel = model; // item 192: whose answer this is, for the honesty score
      // Nov 11 (loop-help.js): what goes into each call is checked against the tool, and mended where that's sure.
      if (reply.tool_calls?.length) { giveIds(reply.tool_calls); this.mendCalls(reply.tool_calls, ctx); this.notOffered(reply.tool_calls, tools, ctx); }
      // What he just said gets its id now, so the window can find the bubble: for the "..." menu on it (Edit, Delete;
      // msg-menu.js), and if he changes it later (Let Bob fix his own messages).
      if (!job?.guest && typeof reply.content === 'string' && reply.content.trim()) { reply.id ||= newMsgId(); reply.at ||= Date.now(); emit({ type: 'said', id: reply.id }); }
      if (!reply.tool_calls && !ctx.handsDid && !ctx.claimChecked && claimsPcAction(reply.content)) {
        // Said he did something on the PC that no tool did: say so to the user, and give him one go to really do it.
        ctx.claimChecked = true;
        // His retry needs the Hands that are switched on, so add their tool groups now (toolbox.js).
        for (const id of Object.keys(HANDS)) if (groupsFor(this)[id]) ctx.loaded.add(id);
        // Shown by the app as its own note line under the reply (not as Bob's words), and kept with the reply for reloads.
        emit({ type: 'correction', text: CLAIM_CORRECTION });
        reply.correction = CLAIM_CORRECTION;
        noteStrike(this, ctx, 'claims', 'said he did something on this replicant matrix that no tool did');
        if (nudgeOk(ctx)) {
          msgs.push({ role: 'system', content: CLAIM_NUDGE, hidden: true }); ctx.retrying = true;
          this.log('honesty', 'Bob claimed a PC action with no tool result; corrected and asked to retry');
          await qAsk(this, ctx);
          nudged(); continue;
        }
        this.log('honesty', 'Bob claimed a PC action with no tool result; corrected (no send-back left this turn)');
      }
      if (!reply.tool_calls && !ctx.observeChecked && !msgs.slice(turnStart).some((m) => m.role === 'tool') && claimsObservation(reply.content)) {
        // Said he noticed or checked something on the PC with no tool behind it: flag it, and one go to answer from real things.
        ctx.observeChecked = true;
        emit({ type: 'correction', text: OBSERVE_CORRECTION });
        reply.correction = OBSERVE_CORRECTION;
        noteStrike(this, ctx, 'claims', 'described something on this replicant matrix with no tool behind it');
        if (nudgeOk(ctx)) {
          msgs.push({ role: 'system', content: OBSERVE_NUDGE.replaceAll('{{USER}}', this.cfg.userName || 'the user'), hidden: true }); ctx.retrying = true;
          this.log('honesty', 'Bob described an observation with no tool result; corrected and asked to answer again');
          await qAsk(this, ctx);
          nudged(); continue;
        }
        this.log('honesty', 'Bob described an observation with no tool result; corrected (no send-back left this turn)');
      }
      if (job?.side && meanwhileOn(this.cfg) && !reply.tool_calls && !ctx.jobGuessChecked && !msgs.slice(turnStart).some((m) => m.role === 'tool' && m.tool_name === 'look_at_job') && claimsJobGuess(reply.content)) {
        // Let Bob's Quick brain see the big job: "it's 80% done" or "about 5 minutes left" has nothing behind it.
        ctx.jobGuessChecked = true;
        emit({ type: 'correction', text: JOB_GUESS_CORRECTION });
        reply.correction = JOB_GUESS_CORRECTION;
        noteStrike(this, ctx, 'claims', 'guessed how far along the big job was');
        if (nudgeOk(ctx)) {
          msgs.push({ role: 'system', content: JOB_GUESS_NUDGE, hidden: true }); ctx.retrying = true;
          this.log('honesty', 'the Quick brain guessed how far along the big job is; corrected and asked to answer again');
          await qAsk(this, ctx);
          nudged(); continue;
        }
      }
      // "I can't..." with groups still not added: add them all and give him one more go (router test fix).
      const empty = !reply.tool_calls && !String(reply.content || '').trim();
      if (!reply.tool_calls && !empty) this.checkSaid(ctx, reply); // 1.5.207: said but not done, before any retry
      if (!reply.tool_calls) stage(ctx, 'checking', step, log);
      if (!reply.tool_calls && !ctx.cantRetried && nudgeOk(ctx) && saysCant(reply.content)) {
        // 1.5.65: web search is on and a link is there (this message or a recent one): open it and give him one more go.
        const u = webLinks && !ctx.linkOpened && String(reply.content || '').trim() ? (findLinks(text, 1)[0] || earlierLink()) : null;
        if (u) {
          ctx.cantRetried = true;
          await openLink(u, 'Bob said he could not; opened the link and asked again');
          msgs.push({ role: 'system', content: LINK_NUDGE, hidden: true }); ctx.retrying = true;
          emit({ type: 'token', text: '\n\n' });
          nudged(); continue;
        }
        const missing = allToolsOn(this.cfg) ? [] : Object.keys(groupsFor(this)).filter((g) => !ctx.loaded.has(g));
        // An empty reply always gets its one more go, even with every tool already there.
        if (missing.length || empty) {
          ctx.cantRetried = true;
          missing.forEach((g) => ctx.loaded.add(g));
          if (missing.length) emit({ type: 'tool', name: 'use_tools', summary: 'Trying again with all his tools' });
          if (empty) msgs.pop(); // an empty reply isn't worth keeping in the chat
          msgs.push({ role: 'system', content: empty ? EMPTY_NUDGE : CANT_NUDGE, hidden: true }); ctx.retrying = true;
          this.log('toolbox', empty ? 'Bob gave an empty reply; added every tool group and asked again' : 'Bob said he could not; added every tool group and asked again');
          emit({ type: 'token', text: '\n\n' });
          nudged(); continue;
        }
      }
      if (empty) {
        // Still nothing after the retry. The end-of-turn check says what was really done ("Done: ..."), or nothing
        // when a card in the chat is the answer; only with neither is it the plain app note. Never an empty bubble.
        this.checkTurn(ctx, reply, false);
        if (!ctx.ledger.noted && !ctx.ledger.outputs.length) {
          msgs.pop();
          emit({ type: 'correction', text: EMPTY_NOTE });
          msgs.push({ role: 'assistant', content: '', correction: EMPTY_NOTE });
        }
        this.log('toolbox', 'Bob gave an empty reply twice');
      } else if (!reply.tool_calls && this.checkTurn(ctx, reply, nudgeOk(ctx))) { ctx.retrying = true; nudged(); continue; } // asked for something that didn't happen: one more go
      // Let Bob's Quick brain see the big job: a note that came while the big brain was writing its answer (no next step)
      // still reaches it, once: it says what changes, or that it saw it (PC test 1.5.203: the note never arrived).
      // Nov 11 (loop-help.js): "I'll look that up." and nothing ran: one nudge to really do it.
      if (!reply.tool_calls && !empty && !this.helpOff('promise') && !ctx.promiseChecked && !ctx.noTools && nudgeOk(ctx) && promisesAction(reply.content)) {
        ctx.promiseChecked = true;
        msgs.push({ role: 'system', content: PROMISE_NUDGE, hidden: true }); ctx.retrying = true;
        this.log('honesty', PROMISE_LOG);
        emit({ type: 'token', text: '\n\n' });
        nudged(); continue;
      }
      if (!reply.tool_calls && !job?.side && !ctx.noteRedo && this.watch.for(job)?.notes.length) { ctx.noteRedo = true; this.readNotes(ctx, msgs, noteAfterAnswer); continue; }
      if (!reply.tool_calls && !ctx.noTools && nudgeOk(ctx)) { // Jobs, Run the tests after code edits (job-helps.js): before he says done
        const tests = testsNudge(this, ctx);
        if (tests) { const g = groupOf(this, 'run_command'); if (g) ctx.loaded.add(g); msgs.push({ role: 'system', content: tests, hidden: true }); ctx.retrying = true; emit({ type: 'token', text: '\n\n' }); nudged(); continue; }
      }
      if (!reply.tool_calls) { stage(ctx, 'answering', step, log); this.checkSaid(ctx, reply); this.checkRecord(ctx, reply); sideJob((k, t) => this.log(k, t), 'sources and receipt under the answer', () => afterAnswer(this, ctx, reply)); this.offerToolFix(ctx, reply); this.keepGroups(sessionId, used); return; }
      let ended = false;
      ctx.painted = null; // what the painter made in this round (for the quick hand-back below)
      // 1.5.78: "Show Bob's plan before big jobs": a big job waits for its plan card (plan.js).
      const held = await planGate(this, reply.tool_calls, ctx);
      if (held) {
        for (const call of reply.tool_calls) msgs.push(toolMessage(call, held.hold));
        ctx.retrying = true;
        if ((ctx.planHolds = (ctx.planHolds || 0) + 1) <= 2) step--; // Reliability 163: a plan card's wait isn't a step
        continue;
      }
      // #57 stopgap (two-Bob trial, Test B: about 650 repeat page reads in a minute): at most 6 tool calls run from one reply.
      // Reliability 158: the calls past that are named back to him in one line, so he doesn't think they ran.
      let dropped = [];
      if (reply.tool_calls.length > MAX_CALLS_PER_REPLY) { this.log('tool', `one reply asked for ${reply.tool_calls.length} tool calls; ran the first ${MAX_CALLS_PER_REPLY}`); dropped = reply.tool_calls.slice(MAX_CALLS_PER_REPLY); reply.tool_calls = reply.tool_calls.slice(0, MAX_CALLS_PER_REPLY); }
      stage(ctx, 'acting', step, log, `${reply.tool_calls.length} call${reply.tool_calls.length === 1 ? '' : 's'}`);
      const round = { ran: 0, fresh: 0, failed: 0 };
      // Reliability 157: calls past the turn's ceiling are marked first, so neither the shared card nor the side-by-side
      // look-ups run them.
      { let room = CALLS_PER_TURN - (ctx.callsRun || 0); for (const c of reply.tool_calls) if (!c.bounce && room-- <= 0) c.capped = true; }
      await askTogether(this, reply.tool_calls.filter((c) => !c.bounce && !c.capped), ctx); // 1.5.41: two or more OKs in this reply go on one card
      const early = await this.lookTogether(reply.tool_calls.filter((c) => !c.capped), ctx); // Nov 11: look-ups in one reply run side by side
      for (const call of reply.tool_calls) {
        const name = call.function?.name;
        if (signal?.aborted) { msgs.push({ role: 'tool', tool_name: name, content: '(Not run: Stop was pressed.)' }); continue; } // item 244: the rest of the round doesn't run
        // 1.5.41: once Bob has picked a new session, the rest of this round waits for it (the job runs again there).
        if (ctx.switchTo) { msgs.push(toolMessage(call, '(Not done yet: you are switching session first.)')); continue; }
        if (ctx.repeatStop) { msgs.push(toolMessage(call, '(Not run: the turn stopped after the same call came three times.)')); continue; }
        // A tool from a group that isn't added yet: small brains sometimes call it straight away. Add its group and run it.
        const g = name === 'use_tools' ? null : groupOf(this, name);
        if (g) { ctx.loaded.add(g); used.add(g); }
        const key = (!this.helpOff('near') && nearKey(name, call.function?.arguments)) || callKey(name, call.function?.arguments); // "moon size" = "size of the moon?"
        const doing = (HAND_TOOLS.has(name) || DOING_TOOLS.has(name)) && !isLook(name);
        // #57: looks (app_look, list_schedules) can change between calls, so they are never counted as repeats.
        const seen = (ctx.callsSeen ||= new Map());
        const again = isLook(name) ? 'new' : repeatCheck(seen, key);
        let res, ranIt = false;
        if (call.bounce) {
          // Nov 11: a call that can't run as it is (a missing input, no such tool) goes back with what to fix.
          res = { text: call.bounce };
          this.log('tool', `${name}: not run, ${call.bounce.slice(9, 160)}`);
        } else if (doneBefore(job, name, call.function?.arguments)) {
          // Item 245: this exact action finished before Bob restarted. It isn't done twice.
          res = { text: doneBeforeNote(doneBefore(job, name, call.function?.arguments)) };
          this.log('tool', `${name}: not run again, it finished before the restart`);
        } else if (call.capped || (ctx.callsRun || 0) >= CALLS_PER_TURN) {
          // Reliability 157: a ceiling on calls per turn, not just per reply.
          ctx.capHit = true;
          res = { text: CAP_SKIP };
        } else if (again === 'stop') {
          ctx.repeatStop = true;
          res = { text: '(Not run: this exact call came three times this turn, so the turn has stopped.)' };
          this.log('tool', `${name} asked for three times with the same input; stopped the turn`);
        } else if (doing && ctx.lastDoing?.key === key) {
          // The same action twice in a row (small brains do this): don't do it again.
          res = { text: `(Not done again: that exact call just ran. Its result: ${String(ctx.lastDoing.text).slice(0, 300)}) Report that result; don't repeat the call.` };
          this.log('tool', `skipped a repeat of ${name}`);
          ctx.repeatSkips = (ctx.repeatSkips || 0) + 1;
        } else if (name === 'fetch_page' && ctx.pagesRead?.has(key)) {
          // #48: the same page and part again in one turn gives the same text. Point him at the next part instead.
          res = { text: '(Not read again: you already read that exact page and part this turn, and it gives the same text. To see more, call fetch_page with the same url and the next part number, or use find with a word you are looking for. If you have enough, answer now.)' };
          this.log('tool', 'skipped a repeat page read');
          ctx.repeatSkips = (ctx.repeatSkips || 0) + 1;
        } else if (again === 'repeat') {
          // #57: any other tool with the same input again this turn gives the same answer: hand back the first one.
          res = { text: repeatNote(seen.get(key)?.text) };
          this.log('tool', `skipped a repeat of ${name}`);
          ctx.repeatSkips = (ctx.repeatSkips || 0) + 1;
        } else {
          res = early.get(call) || await this.runTool(name, call.function?.arguments, ctx);
          // Reliability 154-156 + 159: what this call added. The same call giving the same words again, even with an
          // action in between, counts as a repeat (the count no longer starts over after every action).
          ctx.callsRun = (ctx.callsRun || 0) + 1; round.ran++; ranIt = true;
          const was = ctx.progress.record(key, res.text);
          if (was === 'new') round.fresh++;
          if (/^Error:/.test(String(res.text))) round.failed++;
          if (was === 'same' && !isLook(name)) { ctx.repeatSkips = (ctx.repeatSkips || 0) + 1; this.log('tool', `${name} gave the same result as before`); }
          trailOf(ctx, name, call.function?.arguments, res.text, doing, this.tools);
          if (!this.helpOff('hint') && !res.hinted && /^Error:/.test(String(res.text))) res = { ...res, text: String(res.text) + errorHint(name, res.text) }; // Nov 11: one plain hint (item 198: not when the tool's own error already says what to try)
          if (name === 'fetch_page') (ctx.pagesRead ||= new Set()).add(key);
          // An action may change what a look-up finds (a file written, then read again), so after one, the count starts over.
          if (doing || HAND_TOOLS.has(name)) seen.clear();
          if (!isLook(name)) seen.set(key, { count: 1, text: res.text });
          if (doing) {
            const failed = typeof res.ok === 'boolean' ? !res.ok : /^Error:/.test(String(res.text)); // item 167
            const who = this.cfg.userName || 'the user';
            // A failure after a success this turn: make him say both.
            if (failed && ctx.doneThisTurn?.length) res.text += ` (Earlier this turn this worked: ${ctx.doneThisTurn.slice(-2).map((x) => x.slice(0, 160)).join(' / ')}. Tell ${who} what really happened: what worked, then what failed.)`;
            // Item 200's two-strikes line says the same for an action: the other-route line stands instead.
            if (failed && !res.struck) res.text = String(res.text).replace(STRIKE_NOTE(name, who), '') + (ctx.altTried ? ALT_ROUTE_DONE(who) : ALT_ROUTE_NUDGE(who));
            if (failed && !ctx.altTried) {
              ctx.altTried = true;
              // The other routes need their tools: add the switched-on Hands and the documents group.
              for (const id of [...Object.keys(HANDS), 'documents']) if (groupsFor(this)[id]) ctx.loaded.add(id);
              this.log('tool', `${name} failed; asked Bob to try one other way`);
            }
            if (!failed && !/said no/.test(String(res.text))) (ctx.doneThisTurn ||= []).push(`${name}: ${String(res.text)}`);
            ctx.lastDoing = { key, text: res.text };
          }
        }
        if (!ranIt) ctx.progress.skipped(key); // not run, but a loop through it still shows (155)
        if (name === 'use_tools') { let a = call.function?.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } } const id = String(a?.group || '').toLowerCase().trim(); if (ctx.loaded.has(id)) used.add(id); }
        if (ctx.saves?.length || ctx.savedAs?.length) res = await this.savesInto(ctx, { ...res });
        msgs.push(toolMessage(call, res.text, call.bounce ? false : res.ok)); // item 165: the result names its call
        if (howtosOn(this.cfg)) { // 1.5.79: the job's steps, in case it's worth a how-to
          let a = call.function?.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
          let sum = name; try { sum = this.tools[name]?.summary ? this.tools[name].summary(a || {}) : name; } catch {}
          const st = trailStep(name, sum, res.text);
          if (st) (ctx.trail ||= []).push(st);
        }
        if (HAND_TOOLS.has(name) && !/^Error:|said no/.test(String(res.text))) ctx.handsDid = true;
        if (res.endsTurn) ended = true;
        if (ctx.switchTo && !ended) { ended = true; emit({ type: 'announce', text: switchLine(ctx.switchTo.id, ctx.switchTo.why) }); } // 1.5.41: the job runs again in the new session
      }
      flushNoes(ctx, msgs); // Jobs: a "no" goes into the chat after the round's results, so it lasts the whole chat
      if (dropped.length) msgs.push({ role: 'system', content: droppedNote(dropped, MAX_CALLS_PER_REPLY), hidden: true }); // 158
      if (ctx.repeatStop) {
        // #57: the third identical call: stop plainly instead of using up the steps.
        emit({ type: 'token', text: `\n\n${REPEAT_STOP_LINE}` });
        if (!job?.guest && cleanEffort(job?.effort) !== 'high' && cleanEffort(job?.effort) !== 'extreme') emit({ type: 'stuck' }); // item 8: Try again, thinking harder
        msgs.push({ role: 'assistant', content: REPEAT_STOP_LINE });
        this.keepGroups(sessionId, used);
        return;
      }
      if ((ctx.repeatSkips || 0) >= REPEATS_THEN_ANSWER && !ctx.noTools) {
        ctx.noTools = true;
        msgs.push({ role: 'system', content: ANSWER_NOW_NUDGE, hidden: true });
        this.log('tool', `${ctx.repeatSkips} repeat calls skipped this turn; the next round has no tools, so he answers`);
      }
      // Reliability 154, 155, 157, 159: no progress, going back and forth, too many calls, or every call failing twice:
      // the next round has no tools, with one line saying why.
      if (!ctx.noTools) { const why = ctx.capHit ? 'calls' : ctx.progress.round(round); if (why) wrapUp(ctx, msgs, why, whoFor(), log); }
      // 1.5.20: a picture or clip that was all the user asked for is shown with a short line, instead of loading the
      // brain back onto the card (6 s for the quick brain, 20-30 s for a big one) just to say "here it is".
      // The quick brain then loads again in the background once the turn lets go of the card (settle).
      const quick = !ended && quickHandBack(this.cfg, ctx, reply);
      if (quick) {
        emit({ type: 'token', text: `${String(reply.content || '').trim() ? '\n\n' : ''}${quick}` });
        msgs.push({ role: 'assistant', content: quick });
        this.log('handoff', 'showed the result without loading the brain back (it loads when typing starts)');
        this.offerMore(sessionId, ctx.painted?.kind);
        this.checkTurn(ctx, msgs.at(-1), false);
        this.keepGroups(sessionId, used);
        return;
      }
      if (ctx.switchTo) {
        // 1.5.41: the turn ends here; startTurn's finally changes the session and puts the job back at the front of the line.
        msgs.push({ role: 'assistant', content: switchLine(ctx.switchTo.id, ctx.switchTo.why) });
        if (job) job.switchTo = ctx.switchTo;
        this.keepGroups(sessionId, used);
        return;
      }
      if (ended) {
        // The hat's answer was already shown to the user; keep it in the history as Bob's words.
        const last = msgs.at(-1);
        msgs.push({ role: 'assistant', content: last.content });
        if (ctx.hatNotes) { last.content = `${last.content}\n\n${ctx.hatNotes}`; ctx.hatNotes = ''; }
        this.checkTurn(ctx, msgs.at(-1), false); // a hat answered: no second go, but never a silent miss
        sideJob((k, t) => this.log(k, t), 'sources and receipt under the answer', () => afterAnswer(this, ctx, msgs.at(-1)));
        this.offerToolFix(ctx, msgs.at(-1));
        this.keepGroups(sessionId, used);
        return;
      }
      emit({ type: 'token', text: '\n\n' });
    }
    this.keepGroups(sessionId, used);
    ctx.endWhy = 'steps'; // item 249
    // Reliability 160: the steps ran out. Say what the record shows was done and what wasn't, not a fixed line.
    const ending = outOfStepsLine(ctx.trailSay || {});
    this.log('loop', `out of steps after ${maxSteps}; ended with what was done`);
    emit({ type: 'token', text: `\n\n${ending}` });
    msgs.push({ role: 'assistant', content: ending });
  },
};
