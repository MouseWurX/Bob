// Bob's brain: runs a conversation turn, picks the right model, announces swaps,
// calls tools, asks the user for approval when needed, and keeps a logbook.
import { kindOfAddress } from './links.js'; // 1.5.214: SCUT's Auto cap (a cable or Wi-Fi)
import fs from 'node:fs';
import path from 'node:path';
import { Ollama } from './ollama.js';
import { memGB } from './server-ram.js';
import { LlamaCpp } from './llamacpp.js';
import { buildTools, loadReminders, changeReminders, moveOn } from './tools.js';
export const houseGroupOfTool = (n) => ({ make_music: 'music', make_image: 'pictures', make_video: 'video', make_sound: 'sfx' }[n] || null);
import { cleanEffort, draftBrain, reviewBrain } from './moot.js';
import { saveSettings, VERSION } from './config.js';
import { turnField, LoopStats } from './turn-log.js';
import { PainterServer } from './painter-server.js';
import { capabilities } from './capabilities.js';
import { cloudHelpers } from './cloud.js';
import { RefShelf } from './refs.js';
import { aceMissingFiles } from './audio.js';
import { currentSession, sessionBrains } from './sessions.js';
import { Housekeeper, forgetTopicTool } from './housekeeping.js';
import { handsTools } from './hands.js';
import { officeTools } from './hands-office.js';
import { securityTools } from './hands-security.js';
import { selfToolsTools } from './selftools.js';
import { Made, showMadeTool } from './made.js';
import { scheduleTools } from './hands-schedules.js';
import { HANDS, handsSettings } from './hands-settings.js';
import { useToolsTool } from './toolbox.js';
import { ErrorTally } from './retry.js'; // reliability items 193-207, always on
import { Gate, queuedLine, plainDoing } from './handoff.js';
import { brainMode, chatBrain, holdsChatBrain, bigSession, isBobs, sameModel, sleepAfterText, bigGraceMs, msText } from './brain-mode.js';
import { webOn } from './web.js';
import { editOwnTool } from './edit-own.js';
import { JobWatch, watchTools } from './meanwhile.js';
import { notesTool } from './notes.js';
import { receiptTool } from './receipts.js'; // 🧾 Snap a receipt (off by default)
import { modTool } from './discord-mod.js'; // 1.5.224 Discord Keep order, for your own chats (off by default)
import { findDocsTool } from './my-docs.js';
import { sandboxTool } from './sandbox-code.js';
import { toolOn as moreOn } from './more-tools.js'; // 🧰 More tools (Settings, How Bob works), each off by default
import { calculatorTool } from './calc.js';
import { passwordTool } from './passwords.js';
import { emailTool } from './email-read.js';
import { manageEmailTool } from './email-manage.js'; // "Let Bob tidy my email" (Nov 13)
import { toolRecordTool } from './tool-record.js'; // the tool record (Nov 13)
import { calendarTool } from './calendar-read.js';
import { watchTool, checkDueWatches } from './page-watch.js';
import { apiTool } from './web-api.js';
import { dataTool } from './data-query.js';
import { chartTool } from './charts.js';
import { spellTool } from './spell.js';
import { meetingTool } from './meeting-notes.js';
import { compareTool } from './compare-files.js';
import { parts3dTool } from './parts3d.js';
import { model3dTool } from './model3d.js';
import { pickSessionTool } from './auto-session.js';
import { Lenders, wantsBorrow } from './share-brains.js';
import { CardLender, CardBorrower, powersOf, powersWords } from './share-card.js'; // Bob-Net: lend my graphics card / spread big brains
import { NetCards, cardsOn } from './net-cards.js'; // OK cards on all your Bobs
import { myName } from './bob-net-pair.js';
import { Rentals, currentRental, saveEndpoint } from './rental.js'; // 1.5.127 rented brains
import { GuestJobs, canHere, NEEDS_LIST } from './share-jobs.js';
import { askTogetherTool } from './together.js';
import { showPlanTool } from './plan.js';
import { killTree as killProcTree } from './platform.js';
import { raceTimeout, afterStop } from './hang-guard.js'; // timeouts and hangs, items 208-217
import { HowTos, howtoTools } from './howtos.js';
import { NEEDS, SetupOffers, SWITCH_KEYS } from './setup-offer.js';
import { HonestyScores } from './honesty-score.js';
import { isQuiet } from './quiet-hours.js'; // Quiet hours (off unless switched on)
import { SIDE_LANE, sideOk, APU_MIN_CTX, APU_CARVE_MARGIN_GB, APU_NO_ROOM, apuRoom, sideBrain, runnable, reviewBrainOf, talkerModel, isTalker, sidePick, TALKER_CTX, talkerCtx, TALKER_LINE, BIG_AFTER_MS, MOVE_TO_CPU, BESIDE_FAILED, mainJob, bigJob, besideBigOk, besideLater, mootBesideOk, besideOk } from './brain-lanes.js';
import { NOW_IN_NOTE, CUT_NOTE, fitContext, askWords, cutKeeping, MAX_TRACE, fileBefore, traceStep, TOO_LONG, staleHandErrors, claimsPcAction, claimsObservation, OBSERVE_CORRECTION, realState, meanwhileNear, engineLabel, linkKey, CLAIM_CORRECTION, realPcPrompt, ALT_ROUTE_NUDGE, ALT_ROUTE_DONE, askedCount, quickHandBack, EMPTY_NOTE, COMPACT_KEEP, HISTORY_PER, HISTORY_MAX, historyKeep, NO_ANSWER_NOTE, UNCAUGHT_QUIET_MS, NO_ANSWER_PARKED, editPrompt, loadMode, loadLine, thinkStream } from './brain-words.js';
import { loadingParts } from './brain-loading.js';
import { chatParts } from './brain-chats.js';
import { askingParts } from './brain-asking.js';
import { toolRunParts } from './brain-tool-runs.js';
import { promptParts } from './brain-prompting.js';
import { queueParts } from './brain-queue.js';
import { setupParts } from './brain-setup-offers.js';
import { turnParts } from './brain-turns.js';
import { runOnParts } from './brain-run-on.js';
import { hatParts } from './brain-hats.js';
import { makingParts } from './brain-making.js';
import { armDelays } from './stop-words.js'; // Stop and wait words: delayed jobs come back by themselves
export { SIDE_LANE, sideOk, APU_MIN_CTX, APU_CARVE_MARGIN_GB, APU_NO_ROOM, apuRoom, sideBrain, reviewBrainOf, talkerModel, isTalker, sidePick, TALKER_CTX, talkerCtx, TALKER_LINE, BIG_AFTER_MS, MOVE_TO_CPU, BESIDE_FAILED, mainJob, bigJob, besideBigOk, besideLater, mootBesideOk, besideOk } from './brain-lanes.js';
export { APU_HOLDBACK_DEFAULT_GB, apuHoldbackGB } from './brain-lanes.js';
export { NOW_IN_NOTE, CUT_NOTE, fitContext, askWords, cutKeeping, MAX_TRACE, fileBefore, traceStep, TOO_LONG, staleHandErrors, claimsPcAction, claimsObservation, OBSERVE_CORRECTION, realState, meanwhileNear, engineLabel, linkKey, CLAIM_CORRECTION, realPcPrompt, ALT_ROUTE_NUDGE, ALT_ROUTE_DONE, askedCount, quickHandBack, EMPTY_NOTE, COMPACT_KEEP, HISTORY_PER, HISTORY_MAX, historyKeep, NO_ANSWER_NOTE, UNCAUGHT_QUIET_MS, NO_ANSWER_PARKED, editPrompt, loadMode, loadLine, thinkStream } from './brain-words.js';

export const MAX_STEPS = 8;
export const QUEUE_SAVE_MS = 1000; // item 230
// Nov 11 (item 5): bigger jobs get more steps. Low effort (the usual chat) keeps 8; Medium, High and Extreme get more
// room before the last step (no tools, answer with what he has). The "where we are" note keeps a long job on track.
export const STEPS_BY_EFFORT = { low: 8, medium: 12, high: 16, extreme: 24 };
export const loopSteps = (effort) => STEPS_BY_EFFORT[cleanEffort(effort)] || MAX_STEPS;
// #57 stopgap (two-Bob trial, Test B); Bob's own #57 fix replaces these.
export const MAX_CALLS_PER_REPLY = 6;
export const REPEATS_THEN_ANSWER = 3;
// 1.5.196: the logbook line for a reply another of your Bobs thought. Who, and how long the first word took; no words.
export const borrowedLine = (name, ms) => `📡 ${name} thought this reply (${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} s to first word)`;
// #57 (Bob's plan, second try): every tool is guarded against an exact repeat in one turn; the third identical call stops the turn.
export const REPEAT_STOP_LINE = "(I asked for the same thing three times, so I've stopped. Could you point me at what I'm missing?)";
export const repeatNote = (text) => `(Not done again: that exact call already ran this turn. Its result: ${String(text ?? '').slice(0, 300)}) Use it, or try something different.`;
// seen: Map of call key -> { count, text }, kept on the turn's ctx. 'new' the first time, 'repeat' the second, 'stop' from the third.
export function repeatCheck(seen, key) {
  const e = seen.get(key);
  if (!e) { seen.set(key, { count: 1, text: '' }); return 'new'; }
  e.count++;
  return e.count >= 3 ? 'stop' : 'repeat';
}
// Reliability 160: a short plain record of the turn's calls, for the ending when the steps run out.
export function trailOf(ctx, name, args, text, doing, tools = {}) {
  const t = (ctx.trailSay ||= { done: [], failed: [], looked: 0 });
  const bad = /^Error:/.test(String(text));
  if (!doing && !bad) { t.looked++; return; }
  let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
  let say = name; try { say = tools[name]?.summary ? tools[name].summary(a || {}) || name : name; } catch {}
  if (bad) t.failed.push(say);
  else if (!/said no|Not done/i.test(String(text))) t.done.push(say);
}
export const ANSWER_NOW_NUDGE = 'You have called the same tools with the same input several times; the results will not change. Answer now from the results above, with no more tool calls. Say plainly what you found and what you could not find.';

// Honesty about Hands (1.5.4). A small brain saw an old Hands error in the chat and, instead of trying again,
// made up "the simulated OS won't let me" and even "I've opened Notepad" with no tool call at all.
export const HAND_TOOLS = new Set(Object.values(HANDS).flatMap((h) => h.tools));
// Old Hands errors from earlier turns are shown to the brain as possibly out of date, so it tries again.

export class Brain {
  constructor(cfg, broadcast) {
    this.cfg = cfg;
    this.broadcast = broadcast;
    this.engine = cfg.engine === 'llamacpp' ? new LlamaCpp(cfg) : new Ollama(cfg);
    this.engine.log = (kind, text) => this.log(kind, text); // 1.5.35: the engine can note things in the logbook
    this.loopStats = new LoopStats(cfg, { version: VERSION.label }); // items 246 and 250 (turn-log.js): numbers only
    this.engine.brainLabel = (m) => this.brainLabel(m); // reliability 218-228: the engine's chat notes name brains as the person knows them
    // 1.5.53: a second brain joined or left (chat page: Bob's head grows / shrinks; see public docs in the HANDOFF).
    this.engine.onBeside = (ev) => { this.broadcast({ type: 'second-brain', ...ev, label: ev.model ? this.brainLabel(ev.model) : '' }); this.broadcast({ type: 'brain' }); };
    this.engine.onLoadProgress = (model, pct) => this.broadcast({ type: 'load-progress', model, pct }); // 1.5.215: the cube's load-in follows the weights loading
    this.engine.onIdleGone = () => this.broadcast({ type: 'brain' }); // the idle timer let the brain go: the label and the fNRI cube hear at once
    this.sleepy = { since: 0, recent: [] }; // Gaming-session asides (public/sleepy.js)
    // Bob's own engine unloads its brain when idle; it asks here first so it never does that mid-job.
    if (this.engine instanceof LlamaCpp) this.engine.isBusy = () => this.turns.size > 0 || this.queue.some((j) => j.state === 'working');
    // The Brain toggle (1.5.2): "Always on" keeps the chat brain loaded; otherwise both engines let it go when idle.
    this.engine.holdModel = () => (holdsChatBrain(this.cfg) ? chatBrain(this.cfg).model : null);
    this.engine.keepFor = (model) => (holdsChatBrain(this.cfg) && sameModel(model, chatBrain(this.cfg).model) ? -1 : undefined);
    this.waking = null;
    this.graceTimer = null;
    this.engineName = engineLabel(cfg);
    // Share brains (1.5.55, src/share-brains.js): another Bob of yours may think quick replies for this one, and this one
    // may lend. A lender only ever uses his quick brain (never a big one), on the card, and says no while gaming or busy.
    this.lenders = new Lenders(cfg);
    this.lenders.onSkip = (bob, why) => this.log('borrow', `${bob.name} failed twice (${why}); not asked again for an hour`); // item 202
    // Bob-Net: one brain over several of your Bobs' cards (llama.cpp's RPC server). Both off unless switched on.
    this.cardLender = new CardLender(cfg, { gaming: () => currentSession(this.cfg).id === 'light', linkKind: (a) => kindOfAddress(a, this.linksCache?.peek?.()), freeOwn: async () => { if (this.turns.size || !this.engine?.current) return false; await this.engine.unloadAll(); return true; }, holdsOwn: () => Boolean(this.engine?.current || this.engine?.beside?.current), log: (k, t) => this.log(k, t) });
    // the owner, Nov 13: a lent card shows when the brain it helps run has Hands, Autonomy or Screen use on over there.
    this.cardLender.onPowers = (p, to) => { this.broadcast({ type: 'lend-powers', powers: p, to: to || '' }); if (p) this.log('bob-net', `the brain my card helps ${to || 'another Bob'} run has ${powersWords(p).join(', ')} on`); };
    if (this.engine instanceof LlamaCpp) this.engine.spread = new CardBorrower(cfg, this.lenders, { log: (k, t) => this.log(k, t), linkKind: (a) => kindOfAddress(a, this.linksCache?.peek?.()), powers: () => powersOf(handsSettings(this.cfg)) });
    if (this.engine?.spread) this.engine.spread.onLost = () => this.engine.cardTakenBack(); // 1.5.214: a lent card taken back mid-spread
    // 1.5.127 Rented brains: a big brain hired from an online service for one job, only after a card the owner pressed.
    this.errorTally = new ErrorTally(cfg.dataDir ? path.join(cfg.dataDir, 'tool-errors.json') : null); // item 206
    this.rentals = new Rentals(cfg, { log: (k, t) => this.log(k, t), broadcast: (ev) => this.broadcast(ev) });
    this.rentals.rememberEndpoint = (id, endpointId) => { try { if (saveEndpoint(cfg, id, endpointId)) saveSettings(cfg, { rentals: cfg.rentals }); } catch {} };
    this.lending = null;
    // 1.5.72 Share jobs (src/share-jobs.js): jobs this Bob sent away, their OK cards, and jobs other Bobs sent here.
    this.awayJobs = new Map();
    this.awayApprovals = new Map();
    this.guests = new GuestJobs(this, { canNow: () => this.guestCanNow() });
    const raw = this.broadcast;
    // 1.5.206 PC check: a card made while no page was open never showed. Waiting cards are kept until answered, and
    // /api/events hands them to each page that connects.
    this.waitingCards = new Map();
    // the owner, Nov 13 (src/net-cards.js, opt-in): OK cards go to all your Bobs, and come down everywhere once answered.
    this.netCards = new NetCards(this, { name: () => cfg.windowsName || myName() });
    this.broadcast = (ev) => {
      if (ev?.type === 'approval' && ev.id) { this.waitingCards.set(ev.id, ev); if (!ev.net && cardsOn(this.cfg)) ev.everywhere = true; } // the phone app shows it too
      else if (ev?.type === 'approval-result' && ev.id) this.waitingCards.delete(ev.id);
      raw(ev); try { this.guests.watch(ev); } catch {}
      try { this.netCards.local(ev); } catch {}
    };
    this.netCards.start();
    this.lendDeps = { currentSession, quickBrain: (b) => { const sb = sessionBrains(b.cfg); const m = sb.small && runnable(b, sb.small) ? sb.small : (b.cfg.engine === 'llamacpp' ? null : sb.small); return m ? { model: m, cpu: false, ctx: Math.min(chatBrain(b.cfg).ctx || 32768, 32768) } : null; }, reviewBrain: (b) => reviewBrainOf(b),
      // 1.5.185 Review for other Bobs: the Review brain (Review slot, else Deep thinking, else main), on the card.
      checkBrain: (b) => { const r = reviewBrain(b.cfg); return r && (runnable(b, r.model) || b.cfg.engine !== 'llamacpp') ? { model: r.model, cpu: false, ctx: 32768, think: 'high' } : null; } };
    this.tools = buildTools(cfg);
    this.refs = new RefShelf(cfg);
    this.sessions = new Map();
    this.approvals = new Map();
    this.state = { state: 'idle', model: null, detail: '' };
    this.turns = new Map(); // lane -> running job. One lane normally; an Art session adds a picture lane.
    // 1.5.12: handoffs between brains and engines go through the gate (handoff.js): one owner of the graphics card
    // at a time, actions held until their engine is really ready, failed loads retried, then a fallback.
    this.gate = new Gate(this);
    // The picture engine kept loaded between pictures (sd-server); it falls back to one-shot sd-cli by itself.
    this.painter = new PainterServer(cfg, { log: (k, m) => this.log(k, m) });
    this.suggested = null;
    this.lastActivity = Date.now(); // for /api/idle
    this.queue = this.loadQueue();
    setTimeout(() => this.pump(), 1500); // pick up anything left waiting when Bob was last closed
    armDelays(this); // Stop and wait words: "wait 10 minutes" left from last time comes back by itself
    setTimeout(() => this.armIdleCheck(), 1500); // 1.5.41: a session left on from last time goes back to the lightest one
    this.sessionDir = path.join(cfg.dataDir, 'sessions');
    fs.mkdirSync(this.sessionDir, { recursive: true });
    this.reminderTimer = setInterval(() => this.checkReminders(), 15000);
    this.reminderTimer.unref?.();
    // 🧰 "Let Bob watch web pages": every 5 minutes, the pages that are due are read again (page-watch.js).
    this.watchTimer = setInterval(() => checkDueWatches(this.cfg, (text) => {
      this.broadcast({ type: 'reminder', text, watch: true, ...(moreOn(this.cfg, 'phoneReminders') ? { phone: true } : {}) });
      this.log('page watch', text.split('\n')[0]);
    }).catch((e) => this.log('page watch', `check failed: ${e.message}`)), 5 * 60 * 1000);
    this.watchTimer.unref?.();
    this.housekeeper = new Housekeeper(cfg, this);
    this.tools.forget_topic = forgetTopicTool(this);
    Object.assign(this.tools, handsTools(this), scheduleTools(this), officeTools(this), securityTools(this), selfToolsTools(this), howtoTools(this)); // Hands: off until the user turns them on (see hands-settings.js)
    this.tools.use_tools = useToolsTool(this);
    this.tools.show_plan = showPlanTool(this); // 1.5.78: the plan card before big jobs (plan.js), only with its setting on
    this.tools.ask_together = askTogetherTool(this); // 1.5.42: every OK a job needs on one card (together.js) // the toolbox (toolbox.js): groups added only when a job needs them
    this.tools.pick_session = pickSessionTool(this); // 1.5.43: Bob changes session himself (auto-session.js)
    Object.assign(this.tools, watchTools(this)); // Quick brain sees the job (meanwhile.js), only with its setting on
    this.watch = new JobWatch(); // the job on the big brain, as the app sees it (meanwhile.js); never saved
    this.tools.edit_my_message = editOwnTool(this); // Edit his own messages (edit-own.js), only with its setting on
    this.tools.take_note = notesTool(this); // Quick notes (notes.js), only with its setting on
    this.tools.spending_sheet = receiptTool(this); // 🧾 Receipt tracker (receipts.js), only with its setting on
    this.tools.discord_mod = modTool(this); // Discord Keep order (discord-mod.js), only while it's on
    this.tools.find_in_documents = findDocsTool(cfg, { keeper: () => this.housekeeper }); // Read and search documents (my-docs.js), only with its setting on
    this.tools.run_in_sandbox = sandboxTool(this); // Code sandbox (sandbox-code.js), only with its setting on
    // 🧰 More tools (more-tools.js): each one only while its own switch is on (offTools hides the rest).
    const on = (k) => () => moreOn(this.cfg, k);
    Object.assign(this.tools, {
      calculate: calculatorTool(cfg, on('calculator')), make_password: passwordTool(cfg, on('passwords')),
      read_email: emailTool(cfg, on('email')), manage_email: manageEmailTool(cfg, () => moreOn(this.cfg, 'email') && moreOn(this.cfg, 'emailTidy'), {}, this), tool_record: toolRecordTool(cfg), read_calendar: calendarTool(cfg, on('calendar')),
      watch_page: watchTool(cfg, on('pageWatch')), call_api: apiTool(cfg, on('webApi')),
      query_data: dataTool(cfg, on('dataQuery')), make_chart: chartTool(cfg, on('charts')),
      check_spelling: spellTool(cfg, on('spellCheck')), meeting_notes: meetingTool(cfg, on('meetingNotes')),
      compare_files: compareTool(cfg, on('compareFiles'))
    });
    this.tools.make_3d_part = parts3dTool(this); // 3D parts (parts3d.js), only with its setting on
    this.tools.make_3d_model = model3dTool(this); // Pictures to 3D models (model3d.js), only with its setting on
    // 1.5.91: the Set it up card for something missing or switched off. Listed only while something is (offTools).
    this.tools.offer_setup = {
      schema: { type: 'function', function: { name: 'offer_setup', description: 'When {{USER}}\'s request needs a missing part or a setting that is off: show a one-button card that sets it up, then carry on. For pictures, video, music and sound call make_image, make_video, make_music or make_sound instead.', parameters: { type: 'object', properties: { what: { type: 'string', enum: [...Object.keys(NEEDS), ...SWITCH_KEYS], description: 'What to set up. voice = read replies aloud, hearing = hear {{USER}} talk, workshop = ComfyUI, hand:<id> = a Hand that is off (hand:packs = tool packs).' } }, required: ['what'] } } },
      run: ({ what }, ctx) => this.offerSetup(String(what || ''), ctx),
      summary: ({ what }) => `offer to set up: ${what}`
    };
    this.honesty = new HonestyScores(cfg); // Nov 12, item 192: answers and corrections per brain, for the Brains page
    this.made = new Made(cfg); // Made by Bob (made.js): everything he made, for the side panel and show_made
    this.tools.show_made = showMadeTool(this);
    this.stickyGroups = new Map(); // chat id -> Map(group -> messages left)
    this.howtos = new HowTos(cfg); // 1.5.79: know-how from jobs that worked (off by default)
    this.offers = new SetupOffers(); // 1.5.91: "Set it up" cards waiting for a click
    this.lastTrail = new Map(); // chat id -> the steps of its last job worth keeping, for save_howto
    this.handApprovals = new Set(); // approvals waiting that came from a Hand, so Stop everything can deny them
    // Always on: load the small brain shortly after start-up. Wake when I type (the default) loads nothing.
    if (holdsChatBrain(cfg)) { const t = setTimeout(() => this.wake('always on').catch(() => {}), 4000); t.unref?.(); }
  }

  // ---------- Share jobs (1.5.72) ----------
  // A big brain for Medium-and-up work that's really here (the file is on disk), not just picked in Settings, Brains.
  guestBigBrain() { const d = draftBrain(this.cfg, 'medium'); if (!d?.model) return false; return this.cfg.engine === 'llamacpp' ? runnable(this, d.model) : true; }
  guestCanNow() { const can = this.jobCan(); return NEEDS_LIST.filter((n) => canHere(this, n, { can, webOn: webOn(this.cfg) })); }
  // 1.5.133 lost-song fix: what this Bob can really make right now. capabilities() says music once the audio workshop is
  // set up, but a song also needs the music models (several GB, downloaded the first time). A Bob without them must not
  // tell his other Bobs he takes music, and a Bob asking for a song sends it to one that has them.
  jobCan() { const can = { ...capabilities(this.cfg) }; if (can.music && !this.cfg.audio?.aceUrl) { try { if (aceMissingFiles(this.cfg).length) can.music = false; } catch {} } return can; }

  // ---------- Share brains (1.5.55) ----------
  borrowCase(job, pics) { return { session: currentSession(this.cfg).id, busy: this.turns.size > 1 || this.queue.some((j) => j.state === 'working' && j !== job), job, pics }; }
  borrowLikely() { return wantsBorrow(this.cfg, this.borrowCase(null, [])) && this.lenders.likely(); }
  lenderStatus() { return this.lenders.bobs().map((b) => { const s = this.lenders.state.get(b.address); return { address: b.address, name: b.name, ok: s ? s.ok : null, why: s?.why || '', brain: s?.brain || '', device: s?.device || '', ctx: s?.ctx || 0, speed: s?.measured?.tokPerSec || s?.speed || 0, jobs: s?.jobs || [], jobsBusy: s?.jobsBusy || '', ms: s?.ok ? s?.ms || 0 : 0, lendCard: s?.lendCard === true, scut: s?.scut === true }; }); }

  // For the label on the chat page: asleep, waking, awake or working, and how much memory Bob's brains hold.
  async brainStatus() {
    let loaded = [], engineOk = true;
    try { loaded = await raceTimeout(this.engine.loaded(), 3000, []); } catch { engineOk = false; }
    const chat = chatBrain(this.cfg);
    const mine = loaded.filter((m) => isBobs(this.cfg, m.name) || sameModel(m.name, chat.model));
    const gb = memGB; // same unit as the graphics card meter in Now running (1.5.26)
    // gb: on the graphics card; ramGB: the part in system memory (RAM), when the engine says how it splits.
    const models = mine.map((m) => {
      const split = m.split !== false && m.size > 0;
      const ramGB = split ? gb(Math.max(0, m.size - (m.vram || 0))) : null;
      // estimate: llama.cpp without a per-process figure from nvidia-smi (common on Windows) only knows the file size.
      return { name: m.name, ...(m.beside ? { label: `${m.name} (beside, ${m.onCard ? 'on the graphics card' : 'on the processor'})`, beside: true } : {}), gb: split ? gb(m.vram || 0) : gb(m.vram || m.size), ramGB, estimate: !split && !m.vram, ctx: m.ctx || null, onCard: m.beside ? Boolean(m.onCard) : (m.vram > 0 || (!m.vram && !chat.cpu && !split)), chat: !m.beside && sameModel(m.name, chat.model) };
    });
    const ramKnown = models.some((m) => m.ramGB != null);
    const state = this.waking ? 'waking' : this.turns.size ? 'working' : models.length ? 'awake' : 'asleep';
    let wakeSeconds = null;
    try { if (chat.model) wakeSeconds = await this.engine.estimateLoad(chat.model); } catch {}
    return {
      mode: brainMode(this.cfg), holds: holdsChatBrain(this.cfg), bigSession: bigSession(this.cfg), session: currentSession(this.cfg).label,
      state, models, gb: Math.round(models.reduce((a, m) => a + m.gb, 0) * 10) / 10, ramGB: ramKnown ? Math.round(models.reduce((a, m) => a + (m.ramGB || 0), 0) * 10) / 10 : null,
      chatBrain: chat.model || null, sleepAfter: sleepAfterText(this.cfg), bigGrace: msText(bigGraceMs(this.cfg)), wakeSeconds, engineOk,
      speed: this.engine.lastStats || null, // 1.5.30: the last reply's tokens per second and context use
      handoff: this.gate?.flags() || null // who has the graphics card, what's loading, how many wait (ready flags)
    };
  }

  checkReminders() {
    const now = Date.now();
    if (!loadReminders(this.cfg, { log: (t) => this.log('saving', t) }).some((r) => r.at <= now)) return;
    // item 231: read, take the due ones out and save as one step, so a reminder added by another Bob isn't lost.
    // 🧰 More tools: a repeating reminder moves on to its next time instead of going (tools.js moveOn).
    const due = changeReminders(this.cfg, (list) => { const d = list.filter((r) => r.at <= now); const keep = list.filter((r) => r.at > now); list.splice(0, list.length, ...keep, ...d.filter((r) => r.every).map((r) => moveOn(r, this.cfg.timeZone, now))); return d; });
    // "Show reminders on my phone" (off by default): the phone app shows it as a card, and a notification
    // when it's in the background (phone.js, Bridge.kt).
    const phone = this.cfg.moreTools?.phoneReminders === true;
    for (const r of due) {
      this.broadcast({ type: 'reminder', text: r.text, local: r.local, ...(r.every ? { every: r.every } : {}), ...(r.urgent ? { urgent: true } : {}), ...(phone ? { phone: true } : {}), quiet: isQuiet(this.cfg) }); // Quiet hours: only urgent ones pop up and speak
      this.log('reminder', `a reminder came due (${String(r.text || '').length} characters)${r.every ? `, repeats every ${r.every}` : ''}`); // item 248: no chat words in the logbook
    }
  }

  now() {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.cfg.timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    // 1.5.210 (208 PC check): the zone goes with the time, read from settings, so a time or zone question is never a guess.
    const zone = this.cfg.timeZone || f.resolvedOptions().timeZone || '';
    return `${f.format(new Date())}${zone ? ` (${zone})` : ''}`;
  }

  setState(state, detail = '', model = this.state.model, extra = null) {
    const was = this.state?.state;
    this.state = { state, detail, model, ...(extra || {}) }; // extra (1.5.49): how a brain loads, { mode, from }
    this.broadcast({ type: 'status', ...this.state });
    // 1.5.41: a media step just started; a chat message already waiting may now go beside it.
    // 1.5.110: a chat waiting behind the job keeps its ⏳ line current ("loading the picture engine", then "step 3 of 20").
    if (state === 'painting') for (const j of this.queue || []) {
      if (j.state !== 'waiting') continue;
      // 1.5.112: a chat sent in the second before the painter took over got no ⏳ line (busyLine said not yet); give it one now.
      if (!j.queuedLine) { if (!this.busyLine(j)) continue; j.queuedLine = true; }
      const text = queuedLine(plainDoing(detail));
      if (text !== j.queuedText) { j.queuedText = text; this.broadcast({ type: 'waiting-line', sessionId: j.sessionId, jobId: j.id, id: `queued-${j.id}`, text }); }
    }
    if (state === 'painting' && was !== 'painting' && this.cfg?.chatWhileBusy !== false && this.queue?.some((j) => j.state === 'waiting')) setTimeout(() => this.pump(), 0);
  }

  log(kind, text) {
    const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: this.cfg.timeZone, dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date());
    let said = String(text).replace(/\s+/g, ' ');
    // 1.5.207 PC check: a guest chat's words reached the logbook. Any line that repeats a guest's message (a tool
    // query, a note) has those words taken out while the guest job is still around.
    for (const w of this.guestWords?.values() || []) {
      const bit = w.replace(/\s+/g, ' ').trim().slice(0, 24);
      if (bit.length >= 4 && said.includes(bit)) said = said.split(bit).join('(guest words)');
    }
    const line = `- ${stamp} | ${kind} | ${said.slice(0, 200)}${turnField()}\n`; // item 247: which turn wrote it
    try {
      if (!fs.existsSync(this.cfg.logbook)) fs.writeFileSync(this.cfg.logbook, "# Bob's logbook\n\nEverything Bob did, newest at the bottom.\n\n");
      fs.appendFileSync(this.cfg.logbook, line);
    } catch { /* logging must never break a turn */ }
  }

  get turn() { return this.turns.values().next().value || null; }

  // Stops one running job (by id), or everything running.
  stop(id) {
    let hit = false;
    for (const t of this.turns.values()) if (!id || t.turnId === id) { t.controller.abort(); hit = true; }
    if (!id) { try { if (this.engine?.stopLoad?.()) hit = true; } catch {} } // 1.5.210: a load with no job behind it stops too
    // Item 213: Stop really stops. A few seconds on, any command or helper a stopped job started that is still running
    // is forced to end, and an engine still busy with a reply nobody is waiting for is restarted.
    if (hit) afterStop({ kill: killProcTree, log: (k, t) => this.log(k, t), engine: this.engine instanceof LlamaCpp ? { busy: () => this.engine.stuckAfterStop(), reset: () => this.engine.resetStuck() } : null }).catch(() => {});
    return hit;
  }

  // Nov 11: the loop's helps (loop-help.js) are always on. loopHelpOff is for the loop test only (model-lab/loop-test.mjs
  // compares with and without them); it is not a setting and nothing in Bob's window changes it.
  // 1.5.206 PC check: loopHelpOff can also be a list of help names, so the loop test can switch one off at a time
  // (model-lab/loop-test.mjs --off think,note): mend, together, meaning, tidy, note, last, think, promise, near, hint.
  // Nov 12 (the owner): ON by default, with a Settings switch to turn them off, "Better tool calling" (cfg.toolHelp).
  // Off, Bob's loop works the way it did before Nov 11. The embedding-openings fix stays on either way (it's a bug fix).
  get plainLoop() { return this.cfg?.toolHelp === false || this.cfg?.loopHelpOff === true; }

  // A rough label so the list says what each job is about.
  static guessKind(text, hasPics = false) {
    const t = text.toLowerCase();
    // A question about a picture the user attached is a chat, not a painting job.
    if ((hasPics || /\b(this|the|that|attached|my) (picture|image|photo|pic|screenshot)\b/.test(t)) && (/\?\s*$/.test(t) || /^(what|who|where|which|how|why|is|are|can|does|do|describe|tell me)\b/.test(t))) return 'chat';
    if (/\b(video|clip|film|animate)\b/.test(t)) return 'video';
    if (/\b(paint|draw|picture|image|illustrat|render)\b/.test(t)) return 'picture';
    if (/\b(research|look up|find out|search|sources)\b/.test(t)) return 'research';
    if (/\b(code|bug|function|compile|script)\b/.test(t)) return 'code';
    if (/\b(spreadsheet|csv|table|data entry)\b/.test(t)) return 'data';
    return 'chat';
  }

  async status() {
    let loaded = [];
    let ollama = true;
    try { loaded = await this.engine.loaded(); } catch { ollama = false; }
    return { ...this.state, busy: this.turns.size > 0, session: currentSession(this.cfg), waiting: this.queue.filter((j) => j.state === 'waiting').length, ollama, engine: this.engineName, loaded, models: this.cfg.models, cloud: cloudHelpers(this.cfg).length > 0, rented: currentRental(this.cfg)?.name || '' };
  }
}

// The Brain class is written in parts: these files hold groups of its methods (same rules as the ones written here).
for (const part of [loadingParts, chatParts, askingParts, toolRunParts, promptParts, queueParts, setupParts, turnParts, runOnParts, hatParts, makingParts]) {
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(part))) Object.defineProperty(Brain.prototype, k, { ...d, enumerable: false });
}
