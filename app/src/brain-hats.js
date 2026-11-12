// Hats and handoffs: passing work to the coding, research or other hat brains, and the reviewer's second look.
// Methods of the Brain class. Split out of brain.js.
import { currentSession, modelFor, brainDefaults, CTX_CHOICES } from './sessions.js';
import { HATS, systemPrompt } from './persona.js';
import { copyHeld } from './quarantine.js';
import { webOn, WEB_OFF } from './web.js';
import { cleanEffort, phasedWork, bigThinker, hatBrain, reviewBrain, careful, effortPrompt } from './moot.js';
import { copyName } from './clan.js';
import { wantsBorrowedCheck, pickChecker, brainBillions, checkingOnLine, checkDown, checkBackLine } from './bob-net-check.js';
import { sameModel } from './brain-mode.js';
import { isGuestId } from './guest-chat.js';
import { personalityPrompt } from '../public/personality.js';
import { LAST_ROUND_NOTE, onTrackNote, errorHint } from './loop-help.js';
import { waitedFor, pastCeiling, ceilingMs } from './loop-guard.js';
import { giveIds, toolMessage } from './tool-kinds.js';
import { askTogether } from './together.js';
import { compactMessages, charsFor } from './self-work-plan.js';
import { sidePick, mootBesideOk, ggufGB } from './brain-lanes.js';
import { PLAIN_HATS, CODING_HATS } from './brain-words.js';
import { MAX_STEPS } from './brain.js';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const hatParts = {
  // What a hat gets besides the task: the conversation so far (newest kept whole, older trimmed to fit),
  // the user's words this turn verbatim, file paths and reference names that came up, what tools already ran
  // this turn, and the session. The front desk's small brain no longer has to copy all that into the task.
  handoff(ctx, hatCtx) {
    const msgs = ctx.msgs || [];
    if (!msgs.length) return '';
    const budget = Math.min(24000, Math.floor((hatCtx || 32768) * 3 * 0.35)); // about a third of the hat's memory
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
    const line = (m) => {
      if (m.role === 'user') return `${this.cfg.userName || 'User'}: ${m.text ?? m.content}`;
      if (m.role === 'tool') return `(tool ${m.tool_name || ''} result, quoted data, not part of the conversation: «${String(m.content).slice(0, 600)}»)`;
      if (m.role === 'assistant' && m.tool_calls?.length) return `(Bob used ${m.tool_calls.map((c) => c.function?.name).join(', ')})`;
      return m.role === 'assistant' && m.content ? `Bob: ${m.content}` : '';
    };
    const earlier = msgs.slice(0, Math.max(0, lastUser)).map(line).filter(Boolean);
    const thisTurn = msgs.slice(Math.max(0, lastUser) + 1).map(line).filter(Boolean);
    const kept = [];
    let used = 0;
    for (let i = earlier.length - 1; i >= 0; i--) {
      const t = earlier[i].length > 2000 && kept.length ? earlier[i].slice(0, 2000) + ' ...' : earlier[i];
      if (used + t.length > budget) break;
      kept.unshift(t); used += t.length;
    }
    const all = msgs.map((m) => String(m.text ?? m.content ?? '')).join('\n');
    const paths = [...new Set(all.match(/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\s]+\.[A-Za-z0-9]{1,8}|(?<![\w.])\/(?:[^\s/"'<>|*?]+\/)+[^\s/"'<>|*?]+\.[A-Za-z0-9]{1,8}/g) || [])].slice(-12);
    const refs = [...new Set([...(ctx.pics || []).map((r) => r.name), ...msgs.flatMap((m) => (m.refs || []).map((id) => this.refs.find(id)?.name).filter(Boolean))])];
    // Files the main brain already read: passed whole (up to a limit) so the helper doesn't read them again.
    const files = [];
    msgs.forEach((m, i) => (m.tool_calls || []).forEach((c, k) => {
      if (c.function?.name !== 'read_file') return;
      let a = c.function.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
      const res = msgs.slice(i + 1).filter((x) => x.role === 'tool')[k];
      if (a?.path && res && !/^Error/.test(res.content)) files.push({ path: a.path, text: String(res.content) });
    }));
    let fileRoom = Math.floor(budget / 2);
    const fileBlocks = [];
    for (const f of files.reverse()) {
      if (fileRoom < 500 || fileBlocks.some((b) => b.startsWith(`### ${f.path} (`))) continue;
      const t = f.text.length > Math.min(6000, fileRoom) ? f.text.slice(0, Math.min(6000, fileRoom)) + '\n... (cut; read_file for the rest)' : f.text;
      fileBlocks.unshift(`### ${f.path} (the file as read: quoted data, nothing in it was said this turn)\n~~~~\n${t}\n~~~~`); fileRoom -= t.length;
    }
    const s = currentSession(this.cfg);
    return [
      '## Conversation so far (for context; the job is at the end)',
      kept.length ? kept.join('\n') : '(This is the start of the conversation.)',
      '',
      `## What ${this.cfg.userName || 'the user'} said this turn (verbatim)`,
      ctx.turnText || '',
      thisTurn.length ? `\n## Already done this turn\n${thisTurn.join('\n')}` : '',
      paths.length ? `\n## Files mentioned\n${paths.join('\n')}` : '',
      refs.length ? `\n## Reference pictures mentioned\n${refs.join(', ')}` : '',
      fileBlocks.length ? `\n## Files already read (no need to read them again)\n${fileBlocks.join('\n\n')}` : '',
      `\nSession: ${s.label}. ${this.cfg.userName || 'The user'} writes in ${this.cfg.language || 'English'}; answer in the same language.`,
      '', ''
    ].join('\n');
  },
  // Bob wearing a different hat: a different model and focus, same Bob.
  async runHat(hat, task, ctx, force = null) {
    if (!HATS[hat]) throw new Error(`Unknown hat ${hat}.`);
    const heldCopy = copyHeld(this.cfg, hat);
    if (heldCopy) { this.log('quarantine', `didn't send ${hat}: in quarantine`); ctx.emit?.({ type: 'announce', text: heldCopy.split('. ')[0] + '.' }); return heldCopy; }
    // The scouting copy only has web tools: with web search off there's nothing for it to do, so say where the switch is.
    if (hat === 'scout' && !webOn(this.cfg)) return WEB_OFF;
    // Extreme effort: coding goes research -> check -> plan -> check -> do it (moot.js).
    if (hat === 'tinker' && !ctx.phased && cleanEffort(ctx.job?.effort) === 'extreme') return phasedWork(this, hat, task, ctx);
    // "One brain" mode: every hat runs on the main model, so there's no brain swap (about 20 s each) mid-chat.
    // Normal session: the hat's own brain (or the main one with "One brain"). Other sessions: the session's brain.
    // A moot (High/Extreme effort) passes force: the reviewer always runs on the Review slot brain.
    let { model, cpu, think, ctx: wantCtx, beside } = ctx.job?.side ? (ctx.job.sidePick || await sidePick(this, ctx.job)) : force || (bigThinker(ctx.job) && hat !== 'reviewer' && hatBrain(this.cfg, hat, ctx.job.effort)) || modelFor(this.cfg, hat);
    { const d = brainDefaults(model, hat, cleanEffort(ctx.job?.effort)); if (!force?.longRun && d.ctx && (wantCtx == null || (currentSession(this.cfg).id === 'normal' && !CTX_CHOICES.includes(this.cfg.sessionCtx?.normal)))) wantCtx = d.ctx; if (think === undefined && 'think' in d) think = d.think; }
    const brainCtx = await this.fitCtx(model, wantCtx, { longRun: force?.longRun === true });
    // 1.5.51 (opt-in): the reviewer sits beside the main brain on the processor instead of swapping it out.
    // #30: a quick second look at Low or Medium effort comes with its Bob already picked (runMoot), and never runs here.
    const quick = hat === 'reviewer' ? ctx.reviewLender || null : null;
    if (!quick && hat === 'reviewer' && force && !ctx.job?.side && mootBesideOk(this, model, brainCtx)) { beside = true; cpu = true; }
    // #30: no room beside it here, so a paired Bob with a good enough Review brain checks the work over Bob-Net. Failing that,
    // the reviewer swaps in as before, and the chat says why.
    const lender = quick || (hat === 'reviewer' && force && !beside ? await this.reviewAway(model, ctx) : null);
    const copy = copyName(this.cfg, hat, HATS[hat].label);
    // Settings sign-off (1.5.49): one moot line per review. If the review brain still has to load, the load line
    // ("🛰 Moot: ... checks the answer ...") says it all, so the chat skips the reviewer's own line.
    // 1.5.185 (opt-in) Ask a bigger Bob to check my harder jobs: a moot's check goes to one of your other Bobs whose
    // Review brain is bigger than this one (src/bob-net-check.js). The file reading still runs here.
    const via = !lender && hat === 'reviewer' && force && wantsBorrowedCheck(this.cfg, ctx.job) ? await pickChecker(this.lenders, { effort: ctx.job.effort, mine: brainBillions(model) }).catch(() => null) : null;
    if (via) { ctx.emit({ type: 'announce', text: checkingOnLine(copy, via) }); this.log('moot', `check goes to ${via.name} (${via.check.params}B over ${brainBillions(model)}B here)`); }
    const loadsFirst = hat === 'reviewer' && !lender && !via && !(await Promise.resolve(this.engine.isLoaded?.(model, { cpu, ctx: brainCtx, beside }) ?? true).catch(() => true));
    ctx.emit({ type: 'hat', hat, label: PLAIN_HATS[hat] || HATS[hat].label, copy, ...(loadsFirst ? { quiet: true } : {}) });
    // The Tasks panel: this job is now delegated to a copy (in progress) until the copy hands back.
    const step = { hat, label: PLAIN_HATS[hat] || HATS[hat].label, copy, task: String(task).slice(0, 140), state: 'in progress', at: Date.now() };
    if (ctx.job) { (ctx.job.steps ||= []).push(step); this.saveQueue(); }
    const wasHat = ctx.hatNow;
    ctx.hatNow = hat; // so quarantine knows which copy did what
    try {
      if (via) {
        try { return await this.wearHat(hat, task, ctx, { model, cpu, think, brainCtx, copy, beside, maxSteps: force?.maxSteps, via }); }
        catch (e) {
          if (ctx.signal?.aborted) throw e;
          checkDown(this.lenders, via);
          this.log('moot', `${via.name} couldn't check (${e.message}); checking here`);
          ctx.emit({ type: 'announce', text: checkBackLine(via, e.why || e.message) });
        }
      }
      return await this.wearHat(hat, task, ctx, { model, cpu, think, brainCtx, copy, beside, lender, noLocal: Boolean(quick), maxSteps: force?.maxSteps, compact: force?.longRun === true });
    }
    catch (e) { step.state = ctx.signal?.aborted ? 'cancelled' : 'failed'; throw e; }
    finally {
      ctx.hatNow = wasHat;
      if (step.state === 'in progress') step.state = 'completed';
      step.doneAt = Date.now();
      if (ctx.job) this.saveQueue();
    }
  },
  // #30: with "Let the reviewer sit beside Bob's main brain" and "Borrow brains from my other Bobs" both on, and no room beside
  // here, the review goes to a paired Bob whose Review brain is at least three quarters the size of this one's. null: swap here.
  // #30: a paired Bob's Review brain must be at least three quarters the size of this one's (4 GB when it can't be told).
  reviewFloor(model) { const own = ggufGB(this, model); return own ? Math.round(own * 7.5) / 10 : 4; },
  // #30, Low and Medium effort with "Ask my other Bobs for a quick second look" on: the Bob that gives it, or null (no check,
  // and no brain swap here for it).
  async quickReviewer(job, pics) {
    const b = this.cfg.share?.borrow;
    if (this.cfg.netReview !== true || b?.on !== true || !(b.bobs || []).length || job?.side || job?.guest || pics?.length) return null;
    const m = reviewBrain(this.cfg)?.model || this.cfg.models?.reviewer;
    return this.lenders.pickForReview({ minGB: this.reviewFloor(m), log: (x) => this.log('moot', x) }).catch(() => null);
  },
  async reviewAway(model, ctx) {
    const b = this.cfg.share?.borrow;
    if (this.cfg.mootBeside !== true || b?.on !== true || !(b.bobs || []).length || ctx.job?.side || ctx.job?.guest || ctx.pics?.length) return null;
    const main = this.engine?.current;
    if (!main || sameModel(main, model)) return null; // nothing to keep loaded, or the reviewer is already the brain that's in
    const lender = await this.lenders.pickForReview({ minGB: this.reviewFloor(model), log: (x) => this.log('moot', x) }).catch(() => null);
    if (lender) {
      this.log('moot', `no room beside the main brain; ${lender.name} checks the work on ${lender.brain} over Bob-Net`);
      ctx.emit({ type: 'announce', text: `There's no room for my reviewer beside my main brain here, so ${lender.name} checks this over Bob-Net (${lender.brain}). My main brain stays loaded.` });
    } else {
      this.log('moot', 'no room beside the main brain and no Bob on the Bob-Net with a good enough Review brain free; swapping (the chat says: none of my other Bobs can do the check right now, so it happens here)');
      ctx.reviewHere = true; // two-Bob trial: the saved check says so too, not only the live line
      if (!(Date.now() - (this.reviewAwaySaid || 0) < 10 * 60000)) { this.reviewAwaySaid = Date.now(); ctx.emit({ type: 'announce', text: 'None of my other Bobs can do the check right now, so it happens here.' }); }
    }
    return lender;
  },
  async wearHat(hat, task, ctx, { model, cpu, think, brainCtx, copy, beside, maxSteps: steps, compact = false, lender, noLocal = false, via = null }) {
    // via (1.5.185): another of your Bobs thinks each step on his bigger brain; nothing loads here, the tools run here.
    // Two-Bob trial: a check is short, so the chat talker isn't brought back beside the reviewer for it.
    const loadHere = async () => (await this.ensureModel(model, ctx.emit, ctx.signal, hat, { cpu, ctx: brainCtx, ...(beside ? { beside: true } : {}), ...(hat === 'reviewer' ? { noTalker: true } : {}) })) || model;
    if (!lender && !via) model = await loadHere();
    this.setState('busy', via ? `${copy} is checking on ${via.name}` : `${copy} is on it (${PLAIN_HATS[hat] || HATS[hat].label})`, model);
    const hatTools = {
      ledger: ['save_spreadsheet', 'read_file', 'list_folder'],
      scout: ['web_search', 'fetch_page'],
      painter: ['make_image', 'make_video', 'save_reference', 'make_music', 'make_sound', 'make_3d_model', 'workshop_list', 'workshop_run'],
      // run_command / run_recipe only when the Run hand is on (toolSchemas leaves them out otherwise); each run is approved.
      tinker: ['list_folder', 'code_map', 'read_file', 'search_files', 'edit_file', 'write_file', 'web_search', 'fetch_page', 'run_command', 'run_recipe'],
      reviewer: ['list_folder', 'read_file', 'search_files']
    }[hat] || [];
    const maxSteps = Number(steps) > 0 ? Math.min(Number(steps), 100) : hat === 'tinker' ? 30 : hat === 'reviewer' ? 15 : MAX_STEPS;
    const packet = this.handoff(ctx, via?.check?.ctx ? Math.min(brainCtx || via.check.ctx, via.check.ctx) : brainCtx); // sized for his room when he checks
    const userMsg = { role: 'user', content: `${packet}## The job\n${task}${ctx.picNote ? `\n\n${ctx.picNote}` : ''}` };
    // Raw pictures only go to a brain that can see; any brain still gets the Eyes descriptions above.
    if (ctx.pics?.length && await this.engine.hasVision?.(model).catch(() => false)) userMsg.images = ctx.pics.map((r) => this.refs.base64(r));
    const messages = [
      { role: 'system', content: this.withLimits(systemPrompt({ hat, now: this.now(), memory: isGuestId(ctx.sessionId) ? '' : this.memory(task), user: this.cfg.userName, backstory: this.backstory(), about: isGuestId(ctx.sessionId) ? '' : this.about(), copy, cat: this.cfg.catName, dials: personalityPrompt(this.cfg.personality, this.cfg.userName || 'the user') }), null, hat) + (hat !== 'reviewer' && careful(ctx.job) ? `\n\n${effortPrompt(ctx.job.effort).replaceAll('{{USER}}', this.cfg.userName || 'the user')}` : '') },
      userMsg
    ];
    let final = '';
    const did = []; // what this copy did, handed back to the main conversation afterwards
    // Nov 11 (loop-help.js): on a long job, a short "where we are" note goes last; the last step has no tools.
    const hatAsk = String(ctx.turnText || task || '');
    const hatView = (step) => {
      if (this.plainLoop) return messages;
      const note = step === maxSteps - 1 ? (this.helpOff('last') ? '' : LAST_ROUND_NOTE(this.cfg.userName || 'the user')) : this.helpOff('note') ? '' : onTrackNote({ ask: hatAsk, turn: messages.slice(1), step, max: maxSteps, who: this.cfg.userName || 'the user' });
      return note ? [...messages, { role: 'system', content: note }] : messages;
    };
    for (let step = 0; step < maxSteps; step++) {
      let reply = null;
      // Reliability 161: the safety net covers a helper's steps too (the turn's clock, card waits aside): past the job
      // time limit, this step is his last, with no tools.
      // With the job time limit switched on, its own end (which its card can push back) is the line instead.
      const late = step > 0 && Boolean(ctx.turnStartedAt) && (ctx.timeEnds ? Date.now() - waitedFor(ctx.signal) >= ctx.timeEnds : pastCeiling(ctx.turnStartedAt, ctx.signal, Date.now(), ceilingMs(this.cfg)));
      if (late && !ctx.hatLateSaid) { ctx.hatLateSaid = true; this.log('loop', `${hat}: the job reached its time limit (the safety net); this step is the last`); }
      const last = (step === maxSteps - 1 && step > 0 && !this.helpOff('last')) || late;
      const stepTools = last ? [] : this.toolSchemas(hatTools);
      if (!ctx.job?.side) this.readNotes(ctx, messages); // notes passed along by the Quick brain (meanwhile.js)
      if (via) reply = await this.lenders.chat(via, { messages: hatView(step), tools: stepTools, signal: ctx.signal, from: this.cfg.windowsName || 'Bob', kind: 'check', onToken: (t) => ctx.emit({ type: 'token', text: t }) });
      else if (lender) {
        // Tools still run here (and ask here); only the thinking happens on the other Bob.
        // 1.5.181 (two-Bob trial): the chat names the Bob doing the check, not only the logbook.
        if (step === 0) { ctx.reviewedBy = lender.name; ctx.emit({ type: 'token', text: `_${lender.name} is checking this over Bob-Net (${lender.brain})._\n\n` }); }
        try {
          reply = await this.lenders.chat(lender, { messages: hatView(step), tools: stepTools, signal: ctx.signal, from: this.cfg.windowsName || 'Bob', want: 'review', onToken: (t) => ctx.emit({ type: 'token', text: t }) });
          if (!String(reply?.content || '').trim() && !(reply?.tool_calls || []).length) throw new Error('it came back empty'); // 1.5.181: an empty check is no check
        }
        catch (e) {
          if (ctx.signal?.aborted) throw e;
          this.lenders.noteReview(lender);
          if (noLocal) { this.log('moot', `${lender.name} couldn't finish the quick second look (${e.message})`); return `(${lender.name} couldn't finish the second look, so this reply wasn't checked.)`; }
          this.log('moot', `${lender.name} couldn't finish the check (${e.message}); swapping the reviewer in here`);
          ctx.emit({ type: 'announce', text: `${lender.name} couldn't finish the check, so it carries on here.` });
          // Two-Bob trial (Test D): the check itself says so too, and keeps saying so after a reload (moot.js).
          ctx.emit({ type: 'token', text: `\n\n_${lender.name} dropped out mid-check, so I finished it here._\n\n` });
          ctx.reviewDropped = lender.name;
          lender = null; ctx.reviewedBy = null; reply = null;
          model = await loadHere();
        }
      }
      reply ||= await this.chatSafe({
        model, messages: hatView(step), tools: stepTools, signal: ctx.signal, cpu, think, ctx: brainCtx, ...(beside ? { beside: true } : {}),
        ...(CODING_HATS.has(hat) ? { task: 'coding' } : {}), // 1.5.148: Qwen's coding preset for code work
        onToken: (t) => ctx.emit({ type: 'token', text: t })
      }, { emit: ctx.emit, who: hat });
      messages.push(reply);
      this.cutNote(reply, ctx.emit); // item 210
      final += reply.content;
      if (!reply.tool_calls || late) break;
      giveIds(reply.tool_calls); // item 165
      this.mendCalls(reply.tool_calls, ctx); // Nov 11 (loop-help.js)
      this.notOffered(reply.tool_calls, stepTools, ctx, { hat: true }); // item 173
      await askTogether(this, reply.tool_calls.filter((c) => !c.bounce), ctx); // 1.5.41: one card for every OK in this reply
      const early = await this.lookTogether(reply.tool_calls, ctx);
      for (const call of reply.tool_calls) {
        if (ctx.signal?.aborted) throw new Error('Stopped.'); // Reliability 151: Stop is checked before every call
        let res = call.bounce ? { text: call.bounce } : early.get(call) || await this.runTool(call.function?.name, call.function?.arguments, ctx);
        if (!this.helpOff('hint') && /^Error:/.test(String(res.text))) res = { ...res, text: String(res.text) + errorHint(call.function?.name, res.text) };
        messages.push(toolMessage(call, res.text, call.bounce ? false : res.ok));
        let a = call.function?.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
        const where = a?.path || a?.url || a?.query || a?.name || '';
        did.push(`${call.function?.name}${where ? ` ${String(where).slice(0, 160)}` : ''}: ${String(res.text).replace(/\s+/g, ' ').slice(0, 240)}`);
      }

      // A repository job (self-work.js) on a long memory: older tool results are cut down before it overflows.
      if (compact) compactMessages(messages, charsFor(brainCtx));
      ctx.emit({ type: 'token', text: '\n\n' });
    }
    // The return trip: the main conversation learns what the helper did, so the next turn (and the next
    // handoff) can build on it. Kept in the tool result, which the user's chat view doesn't show.
    ctx.hatNotes = did.length ? `[What ${copy} (${PLAIN_HATS[hat] || hat}) did: ${did.slice(-12).join(' | ')}]` : '';
    return final || '(No answer.)';
  },
};
