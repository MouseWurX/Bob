// What Bob tells the brain and which tools he offers: the opening instructions, tool groups, quick replies and replies
// between steps of a long job. Methods of the Brain class. Split out of brain.js.
import fs from 'node:fs';
import path from 'node:path';
import { systemPrompt } from './persona.js';
import { lookPrompt } from './look.js';
import { personalityPrompt } from '../public/personality.js';
import { capabilities } from './capabilities.js';
import { cloudHelpers } from './cloud.js';
import { toolSetOfModel, inSet, stickyFor } from './tool-sets.js';
import { allToolsOn, toolboxPrompt, tidySchema, onlyGroups, groupsFor, CORE, fillUseTools, guessGroups, groupOf, STICKY_TURNS } from './toolbox.js';
import { HANDS, freeOn, toolsOff } from './hands-settings.js';
import { handsPrompt } from './hands.js';
import { webPrompt, linkPrompt, webOn, WEB_TOOLS } from './web.js';
import { autoSessionPrompt, autoSessionOn } from './auto-session.js';
import { planPrompt, planOn } from './plan.js';
import { houseStylePrompt } from '../public/house-style.js';
import { copyName } from './clan.js';
import { editOwnOn } from './edit-own.js';
import { meanwhileOn, WATCH_TOOLS, noteAsk, asksAboutJob, noteQueuedLine, statusLine, noteForBig, noteGotLine } from './meanwhile.js';
import { notesOn } from './notes.js';
import { receiptsOn } from './receipts.js';
import { modOn } from './discord-mod.js';
import { docToolsOn } from './my-docs.js';
import { sandboxOn } from './sandbox-code.js';
import { parts3dOn } from './parts3d.js';
import { model3dOn } from './model3d.js';
import { howtosOn } from './howtos.js';
import { selfWorkOn, readyRepos } from './self-work.js';
import { moreToolsOff } from './more-tools.js';
import { toolLearnOn, loadLearning, learnedLine } from './tool-learn.js';
import os from 'node:os';
import { stopWordsOn, LINES as STOP_LINES } from './stop-words.js';
import { waitingFor, sortMessage, WAITS_LINE, QUEUED_LINE, quickPrompt, jobLine, quickHistory, maybeTag, replyTag } from './mid-job.js';
import { noteWait } from './loop-guard.js';
import { newMsgId } from './chats.js';
import { CUT_REPLY_NOTE, CUT_CALL, raceTimeout } from './hang-guard.js';
import { fixCalls, togetherCalls, nearKey, GroupVectors, meaningPick } from './loop-help.js';
import { riskOf, NOT_FOR_JOB, NOT_OFFERED } from './tool-kinds.js';
import { gaming } from './sessions.js';
import { hkSettings } from './housekeeping.js';
import { recallOn } from './recall.js';
import { asQuery, embedModel } from './embed-prefix.js';
import { NOW_IN_NOTE, realPcPrompt, callKey } from './brain-words.js';
import { SIDE_LANE, sideOk, besideBigOk } from './brain-lanes.js';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const promptParts = {
  // A personal backstory (inn\bob\backstory.md) replaces the generic one; it isn't part of the shared install.
  // Things about the user Bob should always know (their projects, how they like to work). Kept on this PC
  // only: settings "aboutUser" and/or inn\bob\about-me.md. The shipped prompts stay generic.
  about() {
    let file = '';
    try { file = fs.readFileSync(path.join(this.cfg.dataDir, 'about-me.md'), 'utf8').slice(0, 4000).trim(); } catch {}
    return [String(this.cfg.aboutUser || '').trim(), file].filter(Boolean).join('\n');
  },
  backstory() {
    try { return fs.readFileSync(path.join(this.cfg.dataDir, 'backstory.md'), 'utf8').slice(0, 4000); } catch { return ''; }
  },
  // The start of every front-desk chat: the system prompt and core tools, as a turn with no tool groups sends them.
  startPrompt() {
    const loaded = new Set();
    const sys = { role: 'system', content: this.withLimits(systemPrompt({ now: NOW_IN_NOTE, memory: this.memory(), user: this.cfg.userName, backstory: this.backstory(), about: this.about(), cat: this.cfg.catName, look: lookPrompt(this.cfg), dials: personalityPrompt(this.cfg.personality, this.cfg.userName || 'the user') }), loaded) };
    return { messages: [sys], tools: this.frontDeskTools(loaded) };
  },
  // Tell Bob plainly what this PC can't do yet, so he offers the prompt and points to the cellar instead.
  // 1.5.102: hat = a copy of Bob (workbench, ledger...). A copy has only its own few tools (wearHat), so it isn't told
  // about tools it doesn't have: no offer_setup, ask_cloud or picture lines (the painter copy has its own).
  withLimits(prompt, loaded = null, hat = null) {
    const who = this.cfg.userName || 'the user';
    const can = capabilities(this.cfg);
    const missing = [!can.pictures && 'make pictures', !can.video && 'make video clips', !can.music && 'make music', !can.sfx && 'make sound effects', !can.hearing && 'hear voice input'].filter(Boolean);
    const helpers = cloudHelpers(this.cfg);
    const desk = !hat;
    // The Hands line only when a Hand group is added (or for hats and "all tools at once"); otherwise use_tools lists them.
    const handsLine = !loaded || allToolsOn(this.cfg) || Object.keys(HANDS).some((h) => loaded.has(h));
    if (handsLine) prompt += handsPrompt(this.cfg, { hat });
    if (loaded) prompt += realPcPrompt(this.cfg) + toolboxPrompt(this, loaded);
    prompt += webPrompt(this.cfg, { hat }) + linkPrompt(this.cfg);
    if (loaded) prompt += autoSessionPrompt(this.cfg); // front desk only: hats don't change the session
    if (loaded) prompt += planPrompt(this.cfg); // 1.5.78: front desk only, and nothing while the setting is off
    prompt += houseStylePrompt(this.cfg.houseStyle, who);
    if (this.cfg.defaultProject && this.cfg.projects?.[this.cfg.defaultProject]) prompt += `\n\n${this.cfg.userName || 'The user'}'s main project is ${this.cfg.defaultProject}. When they say "my project" without a name, it's that one.`;
    // "Show me a picture of X" once got no answer at all (2026-11-02): say plainly that make_image is the way.
    // 1.5.102: this is the one place the front desk is told about pictures and clips (it was in FRONT_DESK too).
    if (desk && (!loaded || allToolsOn(this.cfg) || loaded.has('pictures')) && this.usable('make_image')) prompt += `\n\nWhen ${who} asks to see, show, make, draw or paint a picture, call make_image yourself straight away, in the same reply, with a good prompt; for a short clip, make_video (slow, minutes). Then tell ${who} the chat brain has to step out while the painter works. To change a picture (one attached, or one you made: reference "last"), call make_image with it as the reference and a short instruction saying only what to change, like "Replace the hard hat with a silver tiara", not a description of a whole new picture.`;
    if (desk && helpers.length) prompt += `\n\nCloud copies of you that ${who} switched on (use ask_cloud only for jobs too big for you, or when asked; each use is approved and costs money): ${helpers.map((h) => `${h.id} = ${copyName(this.cfg, 'cloud:' + h.id, 'cloud helper')}, running on ${h.name} ${h.model}`).join('; ')}.`;
    const rental = desk && this.rentals?.current();
    if (rental) prompt += `\n\nA rented brain is in your Rented brain slot (${rental.name}). It costs ${who} money, so never use it on your own: when a job is too big for you here (a very long chat or file, or a model that isn't here), or when ${who} asks for it, call hire_brain once; the app shows a card and ${who} decides. Then stop: don't do the job here as well.`;
    const pictureWork = desk || hat === 'painter';
    const shelf = pictureWork ? this.refs.describe() : '';
    if (shelf) prompt += `\n\n${shelf}`;
    // Web search, and Hands when the Hands line is in, already have their own line saying so (webPrompt, handsPrompt): not listed again here.
    const offList = this.switchesOff().filter((k) => k.key !== 'web' && !(handsLine && /^hand:/.test(k.key)));
    // "Let Bob use Hands, Files; Let Bob use Hands, Run programs...": the Hands are named once, then each one.
    const handNames = offList.filter((k) => /^hand:/.test(k.key) && /^Let Bob use Hands, /.test(k.name)).map((k) => k.name.replace(/^Let Bob use Hands, /, ''));
    const offNames = [...offList.filter((k) => !(/^hand:/.test(k.key) && /^Let Bob use Hands, /.test(k.name))).map((k) => k.name), ...(handNames.length ? [`Let Bob use Hands (${handNames.join(', ')})`] : [])];
    if (desk && this.usable('offer_setup') && offList.length) prompt += `\n\nWhen a job needs something else that is switched off (${offNames.join('; ')}), call offer_setup with that setting: the app shows a card to switch it on, and the job carries on after the click. Say in one line what it does; never just refuse.`;
    if (pictureWork && can.pictures && !can.edits) prompt += '\n\nYour picture model can start from a reference picture but can\'t hold a character\'s exact look across new poses. If keeping a look matters, say a picture-edit model in Get models (left menu, Pictures & video) does that better.';
    // 1.5.91: never "I can't": the tool itself shows a Set it up card, so Bob calls it as if it were there.
    const notHere = pictureWork ? missing : [];
    return notHere.length ? `${prompt}\n\nNot set up on this replicant matrix yet: ${notHere.join(', ')}. When ${who} asks for one of these, still call its tool (make_image, make_video, make_music, make_sound) with a good prompt: the app then shows a Set it up card with the size, and carries on with the job by itself once it's set up. Never call it an error and don't send them to menus.${desk && notHere.includes('hear voice input') ? ' For hearing, call offer_setup with "hearing".' : ''}` : prompt;
  },
  // Tools this PC can't use right now (no picture model, Hand switched off, no cloud helper...).
  offTools() {
    let can = {};
    try { can = capabilities(this.cfg); } catch {}
    // 1.5.91: make_image, make_video, make_music and make_sound stay listed when they aren't set up: calling one shows the Set it up card.
    return new Set([!can.workshop && 'workshop_list', !can.workshop && 'workshop_run', !this.offerNeeded() && 'offer_setup', !cloudHelpers(this.cfg).length && 'ask_cloud', !this.rentals?.current() && 'hire_brain', freeOn(this.cfg) && 'ask_together', !planOn(this.cfg) && 'show_plan', ...(webOn(this.cfg) ? [] : WEB_TOOLS), !autoSessionOn(this.cfg) && 'pick_session', !editOwnOn(this.cfg) && 'edit_my_message', ...(meanwhileOn(this.cfg) ? [] : WATCH_TOOLS), !notesOn(this.cfg) && 'take_note', !receiptsOn(this.cfg) && 'spending_sheet', !modOn(this.cfg) && 'discord_mod', !docToolsOn(this.cfg) && 'find_in_documents', !sandboxOn(this.cfg) && 'run_in_sandbox', !parts3dOn(this.cfg) && 'make_3d_part', !model3dOn(this.cfg) && 'make_3d_model', ...(howtosOn(this.cfg) ? [] : ['save_howto', 'my_howtos']), !(selfWorkOn(this.cfg) && readyRepos(this.cfg).length) && 'work_on_repo', ...moreToolsOff(this.cfg), ...toolsOff(this.cfg)].filter(Boolean));
  },
  usable(name, off = this.offTools()) { return Boolean(this.tools[name]) && !off.has(name); },
  // 1.5.41: whether OKs are asked on cards right now (so a job's OKs can go on one card). Not with "work without asking".
  together() { return !freeOn(this.cfg); },
  // set (tool-sets.js): the brain family's own wording for the tools; null = Bob's own.
  toolSchemas(names, set = null) {
    const who = this.cfg.userName || 'the user';
    const off = this.offTools();
    const learned = toolLearnOn(this.cfg) ? loadLearning(this.cfg) : null; // tool notes and the scorecard (tool-learn.js)
    return names.filter((n) => n !== 'use_tools' && this.usable(n, off)).map((n) => {
      const s = tidySchema(JSON.parse(JSON.stringify(inSet(this.tools[n].schema, set)).replaceAll('{{USER}}', who).replaceAll('{{HOME}}', JSON.stringify(os.homedir()).slice(1, -1))));
      if (learned && s.function) s.function.description += learnedLine(this.cfg, n, learned);
      return s;
    });
  },
  // Quick brain sees the job: the app's own answer to a message about the running job, or null.
  jobAnswer(sessionId, text, attach, extra = {}, { freeMem } = {}) {
    if (!meanwhileOn(this.cfg) || extra.guest || (attach || []).length || !this.watch?.job) return null;
    const note = noteAsk(text), asks = !note && asksAboutJob(text);
    if (!note && !asks) return null;
    const probe = { kind: 'chat', text, refs: [], effort: 'low' };
    const quickNow = !this.turns.has(SIDE_LANE) && (sideOk(this, probe, freeMem != null ? { freeMem } : undefined) || besideBigOk(this, probe, freeMem != null ? { freeMem } : undefined));
    if (quickNow) return null; // the Quick brain takes it, with the Meanwhile line and its two tools
    let answer;
    if (note) {
      const r = this.watch.note(note);
      if (r.error) return null;
      answer = noteQueuedLine(note);
      this.log('meanwhile', 'a note was passed along to the big job (by the app: no Quick brain free)');
    } else answer = statusLine(this.watch.job);
    setTimeout(() => this.broadcast({ type: 'busy-note', sessionId, text: answer }), 0);
    return { jobId: null, turnId: null, ahead: 0, answered: answer };
  },
  // ---- Answer messages mid-job (mid-job.js) ----
  // At a step boundary of the job in the main lane: each message that came in meanwhile is sorted and handled, oldest
  // first, on the brain that's already loaded. The job's own messages (msgs) are never touched, so it resumes exactly.
  async midJobTurn(ctx, { model, cpu, brainCtx, signal, emit }) {
    const job = ctx.job;
    const list = waitingFor(this.queue, job);
    if (!list.length || signal?.aborted) return 0;
    const t0 = Date.now();
    let n = 0;
    for (const q of list) {
      if (signal?.aborted || q.state !== 'waiting' || q.midJob !== job.id) continue;
      const sameChat = q.sessionId === job.sessionId;
      let kind = sortMessage(q.text, { sameChat });
      if (kind === '' || kind === 'answer') kind = await this.quickReply(q, job, { model, cpu, brainCtx, signal, unsure: kind === '', sameChat });
      if (kind === 'answer') { n++; continue; }
      if ((kind === 'stopnow' || kind === 'pause') && sameChat) {
        // Stop and wait words: the brain read an unclear message as stop or pause, and the app does it (stop-words.js).
        this.midJobRecord(q, job, null);
        const ok = kind === 'stopnow' ? this.cancelJob(job.id) : this.pauseJob(job.id);
        if (ok) this.broadcast({ type: 'busy-note', sessionId: q.sessionId, text: kind === 'stopnow' ? STOP_LINES.stop : STOP_LINES.pause });
        this.log('jobs', `a message typed during the job was read by the brain as ${kind === 'stopnow' ? 'stop' : 'pause'}`);
        return n + 1; // the job ends or pauses here: nothing more to answer between steps
      }
      if (kind === 'stop') {
        job.stopAfter = true; // the loop's own Stop after this step takes it from here, and says so in the job's chat
        this.midJobRecord(q, job, null);
        this.log('jobs', 'a "stop" typed during the job: stopping after this step');
      } else if (kind === 'change' && sameChat && !this.watch.note(q.text, { direct: true }).error) {
        this.midJobRecord(q, job, null); // the job reads it at this same step (readNotes), and its chat says so
        this.log('jobs', 'a message typed during the job was added to the job');
      } else {
        // New work (or it couldn't be answered now): it waits in Tasks and runs after this job, as before.
        q.midJob = undefined;
        if (!signal?.aborted && kind !== 'aborted') this.broadcast({ type: 'busy-note', sessionId: q.sessionId, jobId: q.id, text: kind === 'failed' ? WAITS_LINE : QUEUED_LINE(job.text) });
        this.saveQueue();
        continue;
      }
      n++;
    }
    const paused = Date.now() - t0;
    if (n) {
      if (ctx.timeEnds) { ctx.timeEnds += paused; emit({ type: 'job-clock', startedAt: job.startedAt, endsAt: ctx.timeEnds }); } // Jobs, time limit: quick replies don't count
      ctx.midJobMs = (ctx.midJobMs || 0) + paused;
      noteWait(signal, paused); // the always-on time ceiling (#167 loop-guard.js) leaves quick replies out too
      if (job.startedAt) job.pausedMs = (job.pausedMs || 0) + paused;
      emit({ type: 'reply-break' }); // the job's next words start a new bubble, under the quick reply
      this.setState('thinking', '', model);
      this.log('jobs', `answered ${n} message${n === 1 ? '' : 's'} between steps (${Math.round(paused / 100) / 10} s), then carried on`);
    }
    return n;
  },
  // A message handled mid-job goes in its chat (with the reply, if any) and is done in Tasks.
  midJobRecord(q, job, answer) {
    const sess = this.session(q.sessionId);
    const u = { role: 'user', content: q.text, at: q.at || Date.now(), id: newMsgId(), midJob: job.id };
    sess.push(u, ...(answer ? [answer] : []));
    q.state = 'done'; q.doneAt = Date.now(); q.midJob = undefined;
    this.saveSession(q.sessionId);
    this.saveQueue();
  },
  // The quick reply: its own small context (the message, one line about the job, the last few turns of that chat), no
  // tools, on the loaded brain. Returns 'answer', 'task', 'change', 'stopnow', 'pause', 'failed' or 'aborted'.
  async quickReply(q, job, { model, cpu, brainCtx, signal, unsure = false, sameChat = false }) {
    const sid = q.sessionId;
    const who = this.cfg.userName || 'the user';
    const out = (ev) => this.broadcast({ ...ev, turnId: q.id, sessionId: sid });
    const lang = this.cfg.language && this.cfg.language !== 'en' ? this.cfg.language : '';
    const messages = [
      { role: 'system', content: quickPrompt({ who, line: jobLine(this.watch.for(job)), unsure, sameChat, language: lang, stopTags: stopWordsOn(this.cfg) }) },
      ...quickHistory(this.session(sid)),
      { role: 'user', content: q.text }
    ];
    q.state = 'working'; q.startedAt = Date.now();
    this.setState('thinking', 'Answering your message between steps', model);
    out({ type: 'start', text: String(q.text).slice(0, 140) });
    let buf = '', open = false;
    const onToken = (t) => { if (open) return out({ type: 'token', text: t }); buf += t; if (maybeTag(buf)) return; open = true; out({ type: 'token', text: buf }); };
    let reply;
    try {
      reply = await this.chatSafe({ model, messages, tools: [], signal, cpu, think: false, ctx: brainCtx, chatId: `${job.sessionId}~quick`, onToken }, { emit: out });
    } catch (e) {
      q.state = 'waiting';
      out({ type: 'done' });
      if (signal?.aborted) { q.midJob = undefined; return 'aborted'; }
      this.log('jobs', `couldn't answer a message between steps (${e.message}); it waits for the job`);
      return 'failed';
    }
    const text = String(reply?.content || '').trim();
    const tag = replyTag(text);
    if (tag || !text) { q.state = 'waiting'; out({ type: 'done' }); return tag === 'change' && sameChat ? 'change' : tag === 'stop' && sameChat ? 'stopnow' : tag === 'pause' && sameChat ? 'pause' : tag === 'task' ? 'task' : 'failed'; }
    if (!open) out({ type: 'token', text });
    const answer = { role: 'assistant', content: text, at: Date.now(), id: newMsgId(), midJob: job.id };
    out({ type: 'said', id: answer.id });
    this.midJobRecord(q, job, answer);
    out({ type: 'done' });
    return 'answer';
  },
  // Quick brain sees the job (meanwhile.js): notes passed along for this job go in before its next step.
  readNotes(ctx, msgs, say = noteForBig) {
    const notes = ctx?.job ? this.watch?.takeNotes(ctx.job) : [];
    if (!notes?.length) return 0;
    msgs.push({ role: 'system', content: say(notes, this.cfg.userName || 'the user'), hidden: true });
    ctx.emit?.({ type: 'announce', text: noteGotLine(notes) });
    this.log('meanwhile', `the big job read ${notes.length} note${notes.length === 1 ? '' : 's'} passed along to it`);
    return notes.length;
  },
  // Quick brain sees the job: look_at_job and pass_note, only in a quick reply beside a running job.
  withWatchTools(list, job) {
    const out = list.filter((t) => !WATCH_TOOLS.includes(t.function?.name));
    return job?.side && meanwhileOn(this.cfg) && this.watch.job ? out.concat(this.toolSchemas(WATCH_TOOLS)) : out;
  },
  // The front desk's tools for this step: the core, plus the groups added so far this turn (toolbox.js).
  // With "Send all tools" on, every usable tool, the way it was before.
  frontDeskTools(loaded) {
    const set = loaded?.toolSet || null; // tool-sets.js: set per step from the brain answering (brain-run-on.js)
    if (allToolsOn(this.cfg) && !loaded?.only) return this.toolSchemas(Object.keys(this.tools), set);
    // Assistant presets (presets.js): a chat's preset can narrow the groups. Its copies of Bob have their own tools, so
    // handing a job to one (ask_specialist) is left out too while a preset narrows them.
    const groups = onlyGroups(groupsFor(this), loaded?.only);
    if (allToolsOn(this.cfg)) for (const g of Object.keys(groups)) loaded.add(g);
    const core = loaded?.only ? CORE.filter((n) => n !== 'ask_specialist') : CORE;
    const names = [...core, ...[...loaded].flatMap((g) => groups[g]?.tools || [])];
    // 1.5.41: ask_together comes along once a group with tools that ask for an OK is added.
    if (names.some((n) => this.tools[n]?.check && this.usable(n))) names.push('ask_together');
    if (planOn(this.cfg)) names.push('show_plan'); // 1.5.78: always there while the setting is on (plan.js)
    const list = this.toolSchemas([...new Set(names)], set);
    const use = fillUseTools(this.tools.use_tools.schema, groups, loaded);
    if (use) list.push(tidySchema(use));
    return list;
  },
  // Which groups start loaded this turn: the ones the user's words point at, plus ones this chat used lately.
  startGroups(sessionId, text) {
    const loaded = new Set(guessGroups(this, text));
    const sticky = this.stickyGroups.get(sessionId);
    if (sticky) for (const [g, left] of sticky) { if (left > 0) loaded.add(g); }
    return loaded;
  },
  // Item 210: an answer that stopped at the length limit says so under it (the person's note, not the brain's), once.
  cutNote(reply, emit) {
    if (reply?.cut !== 'length') return;
    delete reply.cut;
    if (reply.tool_calls?.length) return; // a cut call gets its own line back (mendCalls)
    this.log('chat', 'the answer hit the length limit');
    emit?.({ type: 'correction', text: CUT_REPLY_NOTE });
    reply.correction = reply.correction ? `${reply.correction}\n${CUT_REPLY_NOTE}` : CUT_REPLY_NOTE;
  },
  helpOff(name) { const o = this.cfg?.loopHelpOff; return this.cfg?.toolHelp === false || o === true || (Array.isArray(o) && o.includes(name)); },
  // Nov 11 (loop-help.js): check each call against its tool before it runs. Sure fixes are made (mended JSON, a field
  // under another name, "5" for 5, "Week" for "week"); a call still missing what it needs gets call.bounce, the
  // line handed back instead of running it (with an example call the second time the same tool bounces).
  mendCalls(calls, ctx) {
    // Item 210: a call cut off at the length limit never runs, whatever the mend switches say; one line goes back.
    for (const c of calls) if (c.cut) { c.bounce = CUT_CALL(c.function?.name); delete c.cut; this.log('tool', `${c.function?.name}: cut off at the length limit; not run`); }
    calls = calls.filter((c) => !c.bounce);
    if (this.helpOff('mend')) { for (const c of calls) delete c.function?.raw; return { fixed: 0, bounced: 0 }; }
    const sum = fixCalls(calls, this.tools, { bounced: (ctx.bounced ||= new Map()) });
    for (const c of calls) if (c.fixed) this.log('tool', `${c.function?.name}: mended the call (${c.fixed.join(', ')})`);
    return sum;
  },
  // Item 173 (Nov 12): a call to a tool that this step can't offer doesn't run: a helper's tool outside its own list,
  // any action once a step has no tools, or a tool in no group this job has. Looks still run (they change nothing).
  notOffered(calls, offered, ctx, { hat = false } = {}) {
    const names = new Set((offered || []).map((t) => t?.function?.name).filter(Boolean));
    let n = 0;
    for (const c of calls || []) {
      const name = c?.function?.name;
      if (c.bounce || !name || names.has(name) || !this.tools[name] || riskOf(name, this.tools[name]) === 'look') continue;
      if (hat) c.bounce = NOT_FOR_JOB(name);
      else if (ctx.noTools) c.bounce = '(Not run: no tools are offered for this step. Answer with what you have.)';
      // A tool from a group this job can have but hasn't added yet still runs, as before (small brains often call one
      // straight away; sending it back would cost a whole step). Only a tool this job can't be offered goes back.
      else if (groupOf(this, name)) continue;
      else c.bounce = NOT_OFFERED(name);
      n++;
      this.log('tool', `${name} wasn't offered this step; not run`);
    }
    return n;
  },
  // Nov 11: two or more look-ups in one reply (web_search, fetch_page, read_file...) run side by side. Only tools that
  // never ask for an OK, never a repeat; the loop then hands each result back in order as usual.
  async lookTogether(calls, ctx) {
    const done = new Map();
    if (this.helpOff('together')) return done;
    const seen = new Set();
    const picked = togetherCalls(calls, this.tools, {
      skip: (c) => {
        const key = nearKey(c.function.name, c.function.arguments) || callKey(c.function.name, c.function.arguments);
        if (seen.has(key) || ctx.callsSeen?.has(key) || ctx.pagesRead?.has(key) || ctx.repeatStop || ctx.switchTo) return true;
        seen.add(key); return false;
      }
    });
    if (!picked.length) return done;
    this.log('tool', `${picked.length} look-ups side by side: ${picked.map((c) => c.function.name).join(', ')}`);
    await Promise.all(picked.map((c) => this.runTool(c.function.name, c.function.arguments, ctx)
      .then((r) => done.set(c, r), (e) => { if (ctx.signal?.aborted) throw e; done.set(c, { text: `Error: ${e.message}` }); })));
    return done;
  },
  // Nov 11: the tool groups a message means (loop-help.js), from the Memory slot's embedding model. Only when it's in
  // use anyway (housekeeping or "Relevant memories only" on), never in the Gaming session, and at most 1.5 seconds:
  // the first time, the groups' own vectors are made in the background and words alone pick this turn.
  async meaningGroups(text) {
    const hk = this.housekeeper;
    if (!hk || this.helpOff('meaning') || gaming(this.cfg) || !(hkSettings(this.cfg).enabled || recallOn(this.cfg)) || String(text || '').trim().length < 6) return [];
    const groups = groupsFor(this);
    if (!Object.keys(groups).length) return [];
    const limit = (p) => raceTimeout(p, 1500, null); // item 215: the timer goes when the wait ends
    this.groupVecs ||= new GroupVectors(this.cfg);
    const fill = this.groupVecsFill ||= this.groupVecs.for(Object.fromEntries(Object.entries(groups).map(([id, g]) => [id, { what: g.what }])), (t) => hk.embed(t)).finally(() => { this.groupVecsFill = null; });
    const vecs = await limit(fill.catch(() => null));
    if (!vecs) return [];
    const q = this.recallVec?.text === text && this.recallVec.vec ? this.recallVec.vec : (await limit(hk.embed([asQuery(embedModel(this.cfg), text)]).catch(() => null)))?.[0];
    return meaningPick(q, vecs);
  },
  // The tool set for a brain (tool-sets.js), worked out once per brain name.
  toolSetOf(model) {
    if (!model) return null;
    this.toolSetCache ||= new Map();
    const key = `${model}|${this.cfg.toolSets === false ? 0 : JSON.stringify(this.cfg.toolSets ?? '')}`;
    if (!this.toolSetCache.has(key)) { if (this.toolSetCache.size > 20) this.toolSetCache.clear(); this.toolSetCache.set(key, toolSetOfModel(this.cfg, this.engine, model)); }
    return this.toolSetCache.get(key);
  },
  // After a turn: groups used this turn stay for the next few messages; the rest count down.
  keepGroups(sessionId, used) {
    if (!sessionId) return;
    const sticky = this.stickyGroups.get(sessionId) || new Map();
    for (const [g, left] of sticky) { if (left <= 1) sticky.delete(g); else sticky.set(g, left - 1); }
    const turns = stickyFor(used?.toolSet, STICKY_TURNS); // tool-sets.js: GPT-OSS keeps an added group 1 message
    for (const g of used) sticky.set(g, turns);
    this.stickyGroups.set(sessionId, sticky);
    if (this.stickyGroups.size > 50) this.stickyGroups.delete(this.stickyGroups.keys().next().value);
  },
};
