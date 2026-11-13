// Running a tool call: limits, saving what it made, checking the result, offering a fix, and handing results back.
// Methods of the Brain class. Split out of brain.js.
import { SAVING_TOOLS, saysNoSave, noSaveLine } from './no-save.js';
import { gate as qGate, after as qAfter, noteStrike } from './quarantine.js';
import { WATCH_TOOLS } from './meanwhile.js';
import { receiptBefore, cachedLook, keepLook, receiptAfter, noteNo } from './job-helps.js';
import { inTurn as inChangeTurn, afterChanges } from './turn-changes.js';
import { recordCall } from './tool-learn.js';
import { SAVE_AS, saveAs } from './save-as.js';
import path from 'node:path';
import { isGuestId, GUEST_BLOCKED, GUEST_NO_MEMORY } from './guest-chat.js';
import { GUEST_TOOLS } from './share-jobs.js';
import { WEB_TOOLS, webOn, WEB_OFF } from './web.js';
import { HANDS, handOffWhy, freeOn, todayOn, todayKey, endOfDay, handsSettings } from './hands-settings.js';
import { STRUCK_OUT, halfDone, badAddress, ToolStrikes, STRIKES, STRIKE_NOTE, causeLine, toolErrorText, fixOffer } from './retry.js';
import { applyHouseStyle, usedLine } from '../public/house-style.js';
import { KEEPS_FOR_LATER, outsideNeed, isOutside, markOutside } from './outside-text.js';
import { takeEarlier } from './together.js';
import { outputDirs } from './config.js';
import { madePaths } from './made.js';
import { limitMs, cleanResult, riskOf, NOTHING_FOUND, capFor, capResult } from './tool-kinds.js';
import { raceTimeout } from './hang-guard.js';
import { lockOn } from './lock.js';
import fs from 'node:fs';
import { afterTool, afterTurn, verifyOutput } from './verify.js';
import { groupsFor } from './toolbox.js';
import { linkKey, APPROVAL_TIMEOUT_MS, NO_ANSWER_NOTE, fileBefore, traceStep } from './brain-words.js';
import { houseGroupOfTool } from './brain.js';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const toolRunParts = {
  // Every tool call goes through here. Quarantine (quarantine.js, opt-in) watches before and after; it's a few counters.
  async runTool(name, args, ctx) {
    const tool = this.tools[name];
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
    args = args || {};
    // 1.5.207 PC check: one link ask read the page twice (opened first by the app, then fetch_page again by the brain).
    // Part 1 of a page already opened this turn is in the chat above, so it isn't fetched again.
    if (name === 'fetch_page' && ctx?.openedUrls?.has(linkKey(args.url)) && !(Number(args.part) > 1) && !args.find) {
      this.log('tool', `fetch_page: already open above, not read again: ${args.url}`);
      return { text: 'That page is already open above, from the start of this turn: use that text. For more of it, ask for part 2 or give find.' };
    }
    // 1.5.208 PC check: "do not save the file" in the ask means no tool saves one (no-save.js).
    if (SAVING_TOOLS.has(name) && saysNoSave(ctx?.turnText)) {
      this.log('tool', `${name}: not run, the ask said not to save a file`);
      return { text: noSaveLine(this.cfg.userName || 'the user') };
    }
    const held = await qGate(this, name, args, ctx, tool);
    if (held) { qAfter(this, name, args, held.text, ctx, tool); return held; }
    // Let Bob's Quick brain see the big job: the step goes in the job's record first (still going), its result after.
    const watched = ctx?.job && !WATCH_TOOLS.includes(name) ? this.watch?.for(ctx.job) : null;
    if (watched) {
      if (name === 'show_plan' && Array.isArray(args.steps)) this.watch.plan(ctx.job, args.steps.length);
      let sum = name; try { sum = tool?.summary ? tool.summary(args) : name; } catch {}
      this.watch.step(ctx.job, sum);
    }
    const before = receiptBefore(this, name, args, ctx); // Jobs (job-helps.js): what a file held, for the receipt's Undo
    // Items 237-238: every save the tool makes is tied to this turn (Undo takes the whole turn back; memory changes say
    // which turn wrote them). Not for another Bob's, Telegram's or Discord's jobs.
    const scope = ctx?.askId && !ctx.job?.guest ? { cfg: this.cfg, sessionId: ctx.sessionId, askId: ctx.askId, jobId: ctx.job?.id, tool: name } : null;
    const res = cachedLook(this, name, args, ctx) || await inChangeTurn(scope, async () => { try { return await this.runToolNow(name, args, ctx, tool); } finally { if (scope && afterChanges(scope)) { ctx.changed = true; ctx.emit?.({ type: 'turn-changed', askId: ctx.askId }); } } }); // Jobs: Reuse look-ups
    keepLook(this, name, args, res);
    receiptAfter(this, name, args, res, ctx, before);
    noteNo(this, ctx, name, args, res?.text); // Jobs: Remember a "no" for the whole chat
    if (watched) this.watch.result(ctx.job, res?.text);
    // 1.5.95: a file type named in the ask is saved before the tool's answer goes back, so Bob can say so.
    await this.savesInto(ctx, res);
    qAfter(this, name, args, res.text, ctx, tool);
    recordCall(this.cfg, name === 'use_my_tool' && args.name ? `use_my_tool:${args.name}` : name, args, res?.text, ctx); // "Let Bob learn from his tools" (tool-learn.js)
    return res;
  },
  // 1.5.95: a file type named in the ask is saved before the tool's answer goes back, so Bob can say so. Called after
  // the tool and again just before its answer goes to the brain (1.5.209: a save that started late still gets named).
  async savesInto(ctx, res) {
    if (!ctx?.saves) return res;
    while (ctx.saves.length) await Promise.allSettled(ctx.saves.splice(0));
    // 1.5.210: first, not last, so trimming a long result can never cut it off (the Mac CI run did).
    if (ctx.savedAs?.length && res) res.text = `Also saved as ${ctx.savedAs.splice(0).join(', ')}, as asked (the original is kept too). ${res.text ?? ''}`.trim();
    return res;
  },
  // 1.5.95: the user named a file type ("a song as an mp3"): keep what was just made in that type as well.
  autoSaveAs(ev, ctx) {
    const kind = ev.type, to = ctx.wantType;
    if (!SAVE_AS[kind]?.includes(to) || path.extname(ev.file).slice(1).toLowerCase() === to) return;
    ctx.saves.push(saveAs(this.cfg, { name: path.basename(ev.file), format: to }, { signal: ctx.signal, ...(this.saveAsOpts || {}) }).then(async (r) => {
      if (r.need === 'ffmpeg') { await this.offerSetup('ffmpeg', ctx).catch(() => ''); return; }
      try { this.made.add(r.file, { tool: 'save_as', chat: ctx.sessionId || '' }); } catch {}
      ctx.emit({ type: 'made', items: [{ kind: r.kind, url: r.url, name: r.name, path: r.file }] });
      ctx.savedAs.push(r.name);
    }).catch((e) => { ctx.emit({ type: 'announce', text: `Couldn't save it as ${to.toUpperCase()}: ${e.message}` }); }));
  },
  async runToolNow(name, args, ctx, tool) {
    if (!tool) return { text: `Error: there is no tool called ${name}.` };
    // 1.5.72: a job from another of your Bobs only thinks, searches and makes pictures, clips, music and sounds here.
    if (isGuestId(ctx?.sessionId) && GUEST_BLOCKED.has(name)) return { text: GUEST_NO_MEMORY }; // a guest chat keeps nothing
    if (ctx?.job?.guest && !GUEST_TOOLS.has(name)) return { text: `Not for this job: it came from ${ctx.job.guest.from}, another Bob, so here I can only think, search the web and make pictures, clips, music and sounds. Say what's left for ${ctx.job.guest.from} to do himself.` };
    // Bob on Discord (src/discord.js): only the job types the owner ticked, and never a reference picture (nothing the
    // owner made can be edited, copied or described there).
    if (ctx?.job?.guest?.public) {
      if (!GUEST_TOOLS.has(name) || (ctx.job.guest.tools && !ctx.job.guest.tools.includes(name))) return { text: `Not for this job: that's switched off for ${ctx.job.guest.from}. Say so in one line.` };
      if (args && typeof args === 'object') { args = { ...args }; delete args.reference; if (args.mode && args.mode !== 'new') delete args.mode; }
    }
    if (!this.usable(name)) {
      if (WEB_TOOLS.includes(name) && !webOn(this.cfg)) return { text: ctx?.emit ? await this.offerSetup('web', ctx) : WEB_OFF }; // 1.5.91: the card, not a dead end
      const hand = Object.entries(HANDS).find(([, h]) => h.tools.includes(name))?.[0];
      return { text: hand ? handOffWhy(this.cfg, hand) : `Error: ${name} can't be used on this replicant matrix right now.` };
    }
    // Item 200: this tool failed three times in a row in this job, so it's set aside (no card, no run).
    if (ctx && ctx.strikes?.blocked(name)) { this.log('tool', `${name} not run: it failed three times in this job`); return { text: STRUCK_OUT(name, this.cfg.userName || 'the user', ctx.strikes.lastError(name)), hinted: true, struck: true }; }
    // 1.5.34 House style: what the call left out comes from the defaults set in Settings, House style, and the chat says so.
    const house = applyHouseStyle(name, args, this.cfg.houseStyle);
    args = house.args;
    ctx.emit({ type: 'tool', name, summary: tool.summary ? tool.summary(args) : name });
    if (house.used.length) ctx.emit({ type: 'house', text: usedLine(house.used), group: houseGroupOfTool(name) });
    try {
      ctx.picked = null;
      // Item 9 (outside-text.js): after a web page or file was read this turn, anything that acts shows its card.
      const afterOutside = Boolean(ctx.outsideRead) && !this.plainLoop;
      if (tool.check || (afterOutside && KEEPS_FOR_LATER.has(name))) {
        let need = tool.check ? await tool.check(args, ctx) : null;
        if (afterOutside) { const was = need; need = outsideNeed(name, need, tool.summary ? tool.summary(args) : name); if (need && !was) this.log('approval', `asking first: ${name} right after reading outside text`); }
        // "Let Claude use Bob's hands" (claude-door.js): the card names the app that asked.
        if (need && ctx.via) need = typeof need === 'string' ? `${ctx.via} (through Bob): ${need}` : { ...need, text: `${ctx.via} (through Bob): ${need.text}` };
        const group = typeof tool.approvalGroup === 'function' ? tool.approvalGroup(args) : tool.approvalGroup;
        // "Let Bob work without asking" (Settings, Hands; off by default): no card, but the hard limits in check()
        // still apply, every action still goes in the logbook and the chat, and ✋ Hands turns it off at once.
        // Tools marked alwaysAsk (cloud helpers: they cost money) still show their card.
        if (need && !tool.alwaysAsk && !ctx.alwaysAsk && !afterOutside && freeOn(this.cfg)) { // a call from another app always shows its card
          const text = typeof need === 'string' ? need : need.text;
          this.log('approval', `done without asking: ${text}${need.command ? ` [${need.command}]` : ''}`);
          ctx.emit({ type: 'auto-approved', text, command: need.command || '', rows: Array.isArray(need.plan) ? need.plan.filter((r) => !r.blocked).length : null });
        } else if (need && need.command && !need.pack && !need.mcp && !afterOutside && todayOn(this.cfg) && (this.todayOk?.get(todayKey(need.command, need.cwd)) || 0) > Date.now()) {
          // Item 12: this exact command in this folder was allowed for today on an earlier card.
          this.log('approval', `allowed for today earlier: ${need.text} [${need.command}]`);
          ctx.emit({ type: 'allowed-earlier', text: `${need.text} (allowed here for today)` });
        } else if (need && !(group && ctx.allowAll.has(group) && !afterOutside)) {
          // 1.5.42: already answered on the card with all of this job's OKs (together.js)?
          const earlier = (ctx.preOk || ctx.preNo) ? takeEarlier(ctx, name, args, need) : null;
          if (earlier?.no) { ctx.ledger?.action(name, args, true, 'declined'); this.log('approval', `denied on the combined card: ${typeof need === 'string' ? need : need.text}`); return { text: 'The user said no to this on the card. Do not try again; say it is fine and ask what to do instead.' }; }
          if (earlier?.ok) {
            this.log('approval', `allowed on the combined card: ${typeof need === 'string' ? need : need.text}${need.command ? ` [${need.command}]` : ''}`);
            ctx.emit({ type: 'allowed-earlier', text: typeof need === 'string' ? need : need.text });
            if (Array.isArray(need.plan)) ctx.picked = earlier.rows;
          } else {
          const hand = Boolean(need && typeof need === 'object' && (need.plan || need.command || need.newTool));
          const out = {};
          // Not on the card (or changed since): its own card, saying so, so the person isn't surprised by it.
          const unlisted = ctx.preOk ? (earlier?.changed ? ' (This changed since the list you saw, so Bob is asking again.)' : ' (This wasn\'t on the list you saw.)') : '';
          const answer = await this.approve(unlisted ? (typeof need === 'string' ? need + unlisted : { ...need, text: need.text + unlisted }) : need, ctx.emit, ctx.signal, group, { hand, out });
          // Item 196: nobody answered the card in time. That isn't a no: the job is parked, waiting for the OK.
          if (!answer && out.timedOut) { ctx.ledger?.action(name, args, true, 'no answer'); if (ctx.job) ctx.job.waitingOk = true; this.log('approval', `no answer in ${Math.round(APPROVAL_TIMEOUT_MS / 60000)} minutes; the job waits for the OK`); ctx.noTools = true; return { text: NO_ANSWER_NOTE(this.cfg.userName || 'the user'), hinted: true, declined: true }; }
          if (!answer) { ctx.ledger?.action(name, args, true, 'declined'); return { text: 'The user said no. Do not try again; say it is fine and ask what to do instead.' }; }
          if (answer === 'all' && group) ctx.allowAll.add(group);
          if (answer === 'today' && need.command) (this.todayOk ||= new Map()).set(todayKey(need.command, need.cwd), endOfDay()); // item 12
          if (Array.isArray(need.plan)) ctx.picked = out.picked ?? null;
          }
        }
      }
      const startedAt = Date.now();
      ctx.currentTool = name;
      ctx.made = null;
      ctx.ledger?.begin?.(name, args); // 1.5.38: so a restart knows this step was cut off
      ctx.editBefore = name === 'edit_file' ? fileBefore(args) : null; // item 183: what the file was, to check the edit
      let text;
      ctx.toolError = null;
      ctx.offeredNow = false;
      text = await this.runLimited(name, args, ctx, tool);
      this.noteWhereWorking(ctx.sessionId, args);
      // The system checks it really happened (verify.js): a missing or broken output, or an action that didn't take,
      // gets one more go before Bob is told it failed. Approvals aren't asked twice.
      if (ctx.ledger) ctx.ledger.toolStart = startedAt;
      // 1.5.104: the tool put a Set it up card under the chat instead of doing the job. That's an answer, not a
      // failure: no second try (it made a second card) and no "didn't work" note.
      let v = ctx.offeredNow ? { ok: true } : await this.checkTool(name, args, text, ctx);
      // Item 197: before a second go, look whether it half-happened after all (the file or the output folder).
      const half = v.retry && !ctx.signal.aborted ? halfDone(name, args, startedAt, { outputDirs: (() => { try { return outputDirs(this.cfg); } catch { return []; } })() }) : null;
      if (half?.done) {
        this.log('handoff', `${name} looked unfinished, but ${half.why}; not run again`);
        ctx.ledger?.step('note', { what: `${name}: ${half.why}` }).done();
        v = { ok: true, why: half.why, retry: false, files: half.files, ...(name !== 'write_file' ? { show: half.files.map((file) => ({ file })) } : {}) };
        text = `Done: ${half.why} (checked by the app).${half.files?.length ? ` ${half.files.map((f) => path.basename(String(f))).join(', ')}` : ''}`; // 1.5.210: names, not long temp paths (macOS /var/folders pushed the rest past the cap)
      }
      if (v.retry && !ctx.signal.aborted) {
        this.log('handoff', `${name} didn't take (${v.why || 'no proof'}); checked it isn't half-done, trying it once more`);
        ctx.ledger?.step('retry', { what: name, why: v.why || '' }).done();
        ctx.ledger?.action(name, args, false, text, startedAt, v);
        if (ctx.ledger) ctx.ledger.toolStart = Date.now();
        text = await this.runLimited(name, args, ctx, tool);
        v = await this.checkTool(name, args, text, ctx);
        if (v.retry) v = { ...v, ok: false, text: v.text || `Error: ${name} was tried twice and still didn't take (${v.why || 'no proof it worked'}).` };
      }
      if (v.text) text = v.text;
      // Items 186-188: the turn's results in full (the ledger keeps 300 characters), so numbers, quotes and links in
      // the answer can be checked against them. In memory only, at most about 400,000 characters a turn.
      if (!/^Error:/.test(text)) { const seen = (ctx.seen ||= []); if (seen.reduce((n, x) => n + x.length, 0) < 4e5) seen.push(String(text).slice(0, 1e5)); if (name === 'run_in_sandbox') (ctx.sandboxOut ||= []).push(String(text).slice(0, 2e4)); }
      // Item 9: what came from outside is marked as information, and the rest of the turn asks before acting.
      if (isOutside(name) && !/^Error:/.test(text) && !this.plainLoop) { text = markOutside(name, text); ctx.outsideRead = true; }
      for (const o of v.show || []) if (o?.file) await this.deliver(ctx, o.type || 'image', o.file);
      ctx.currentTool = null;
      const ok = v.ok !== false && !/^Error:/.test(text);
      ctx.ledger?.action(name, args, ok || Boolean(v.declined), text, startedAt, v);
      // Item 207: the logbook keeps the real cause (the first error), not the last wrapper.
      this.log(ok ? 'tool' : 'error', ok ? (tool.summary ? tool.summary(args) : name) : `${name}: ${(ctx.toolError?.cause || text.replace(/^Error:\s*/, '')).slice(0, 400)}`);
      let strikeNote = '';
      if (!v.declined && !(!ok && badAddress(text))) { // 1.5.210: a made-up or missing address isn't the tool's fault
        if (!ok) this.noteToolError(name); // item 206
        // Item 200: the third failure in a row of this tool in this job: it's set aside, and offered for fixing after.
        if ((ctx.strikes ||= new ToolStrikes()).record(name, ok, text) === STRIKES) { strikeNote = STRIKE_NOTE(name, this.cfg.userName || 'the user'); this.log('tool', `${name} failed three times in this job; set aside for the rest of it`); }
      }
      const hinted = Boolean(ctx.toolError?.hinted) || Boolean(strikeNote);
      ctx.toolError = null;
      if (strikeNote) text += strikeNote;
      // Item 10: one line per step for the reply's "How I got here".
      ctx.trace?.push(traceStep({ name, summary: tool.summary ? (() => { try { return tool.summary(args); } catch { return name; } })() : name, ok, ms: Date.now() - startedAt, text, brain: (() => { try { return this.state?.model ? this.brainLabel(this.state.model) : ''; } catch { return ''; } })() }));
      // Files the tool saved or made (write_file, spreadsheets, Hands copies and zips...): on the Made by Bob
      // list, and a card with a preview in the chat that opens in the side panel.
      const paths = ok ? [...new Set([...(ctx.made || []), ...madePaths(name, text)])].slice(0, 6) : [];
      ctx.made = null;
      if (paths.length) {
        const items = paths.map((p) => { try { return this.made.add(p, { tool: name, chat: ctx.sessionId }); } catch { return null; } }).filter(Boolean);
        if (items.length) ctx.emit({ type: 'made', items });
      }
      return { text, endsTurn: tool.endsTurn, ok, ...(hinted ? { hinted: true } : {}) }; // item 167: ok or failed in a field, not only in the words
    } catch (e) {
      ctx.currentTool = null;
      if (ctx.signal.aborted) throw e;
      this.log('error', `${name}: ${causeLine(e).slice(0, 400)}`); // item 207
      this.noteToolError(name);
      const te = toolErrorText(e);
      return { text: te.text, ok: false, ...(te.hinted ? { hinted: true } : {}) };
    }
  },
  // One run of a tool, the same for every tool (Nov 12, items 168, 169, 175, 178):
  //  - it has a time limit of its own (tool-kinds.js); past it, the turn stops waiting and the step fails plainly.
  //    The tool keeps the job's own Stop signal (the graphics card's line is keyed by it), so Stop still ends it.
  //  - what it hands back is turned into plain text (a broken tool can't send junk to the brain)
  //  - a look that gives back nothing says so in one fixed form
  //  - a very long result is cut here, keeping its start and its end, before it fills memory
  async runLimited(name, args, ctx, tool) {
    const limit = this.toolLimitMs ? this.toolLimitMs(name, tool) : limitMs(name, tool, { ownMin: Number(handsSettings(this.cfg).timeoutMin) || 0 });
    let raw;
    const OVER = Symbol('over time');
    try {
      const run = Promise.resolve().then(() => tool.run(args, ctx));
      run.catch(() => {}); // after a time-out the tool may still fail later: nothing is waiting for it then
      raw = limit > 0 ? await raceTimeout(run, limit, OVER) : await run; // item 215: no bare Promise.race timers
      if (raw === OVER) throw Object.assign(new Error('time'), { overTime: true });
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      if (e?.overTime) {
        const mins = Math.round(limit / 60_000 * 10) / 10;
        this.log('error', `${name} ran past its own ${mins}-minute limit; stopped waiting for it`);
        return `Error: ${name} didn't finish within ${mins} minute${mins === 1 ? '' : 's'}, so Bob stopped waiting for it. It may still finish, or may have done part of the job.`;
      }
      // Item 198: plain words, from the error's own code (retry.js); the logbook keeps the real cause.
      const te = toolErrorText(e); te.cause = causeLine(e); ctx.toolError = te;
      return te.text;
    }
    const clean = cleanResult(raw);
    if (clean.fixed) this.log('tool', `${name} ${clean.fixed}; passed on as plain text`);
    let text = clean.text;
    if (!text.trim() && riskOf(name, tool) === 'look') text = NOTHING_FOUND(name);
    const cap = capFor(this.engine?.currentCtx || this.engine?.lc?.ctx || 0);
    if (text.length <= cap) return text;
    const saved = isGuestId(ctx?.sessionId) || ctx?.job?.guest ? '' : this.keepWholeResult(name, text);
    const capped = capResult(text, cap, { ask: ctx.turnText || '', saved });
    this.log('tool', `${name} gave back ${text.length.toLocaleString('en')} characters; kept the start, the end and ${capped.kept} matching line${capped.kept === 1 ? '' : 's'}${saved ? ', and saved the whole of it' : ''}`);
    return capped.text;
  },
  // The whole of a long result, saved in inn\bob\tool-results so Bob can read the rest. Kept 3 days, at most 30 files.
  // Not while the passcode lock keeps chats locked on disk (a plain copy would get round it), and never in a guest chat.
  keepWholeResult(name, text) {
    try {
      if (lockOn(this.cfg) || !this.cfg.dataDir) return '';
      const dir = path.join(this.cfg.dataDir, 'tool-results');
      fs.mkdirSync(dir, { recursive: true });
      const old = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      old.forEach((x, i) => { if (i >= 29 || Date.now() - x.t > 3 * 86_400_000) { try { fs.unlinkSync(path.join(dir, x.f)); } catch {} } });
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${String(name).replace(/[^\w-]/g, '_')}.txt`);
      fs.writeFileSync(file, text);
      return file;
    } catch (e) { this.log('tool', `couldn't keep the whole ${name} result (${e.message})`); return ''; }
  },
  // verify.js's check of one tool run; a check that itself breaks never breaks the turn.
  async checkTool(name, args, text, ctx) {
    try { return (await afterTool(name, args, text, ctx)) || { ok: true }; } catch (e) { this.brokenCheck(ctx, `check of ${name}`, e); return { ok: true, unchecked: true, why: 'not checked (the check broke)' }; }
  },
  // Item 200 (three strikes): the job is done; a tool it set aside gets one line under the answer offering a harder look.
  offerToolFix(ctx, reply) {
    try {
      const off = [...(ctx?.strikes?.off || [])];
      if (!off.length || ctx.fixOffered || !reply || ctx.job?.guest) return;
      ctx.fixOffered = true;
      const line = fixOffer(off);
      ctx.emit?.({ type: 'token', text: `\n\n${line}` });
      reply.content = `${String(reply.content || '')}\n\n${line}`;
      this.log('tool', `offered to look at ${off.join(', ')} after the job`);
    } catch {}
  },
  // Item 199: a check that breaks is a broken check in the logbook and the job's record, never a quiet "all fine".
  brokenCheck(ctx, what, e) {
    try {
      this.log('error', `${what} broke, so it wasn't checked: ${causeLine(e).slice(0, 300)}`);
      ctx?.ledger?.step?.('note', { what: `${what} broke: not checked` })?.done?.();
      if (ctx?.ledger) ctx.ledger.unchecked = (ctx.ledger.unchecked || 0) + 1;
      this.noteToolError('check');
    } catch {}
  },
  // The end of a turn: the user asked for something (a picture, to see one, an app action). If it didn't happen,
  // Bob gets one more go (again = true) with the tools it needs; if it still didn't, the user is told plainly.
  // Returns true when the turn should go round once more.
  checkTurn(ctx, reply, again) {
    let v = null;
    try { v = afterTurn(ctx, reply?.content || ''); } catch (e) { this.brokenCheck(ctx, 'end-of-turn check', e); }
    if (!v) return false;
    if (v.strike) { try { noteStrike(this, ctx, v.strike === 'claim' ? 'claims' : v.strike, v.note || v.nudge || ''); } catch {} }
    if (v.nudge && again && !ctx.ledger.nudged) {
      ctx.ledger.nudged++;
      // A claim with nothing behind it is corrected at once, as well as the second go.
      if (v.note) { ctx.emit({ type: 'correction', text: v.note, ...(v.strike ? { kind: 'claims' } : {}) }); if (reply) reply.correction = reply.correction ? `${reply.correction} ${v.note}` : v.note; }
      for (const g of v.groups || []) if (groupsFor(this)[g]) ctx.loaded.add(g);
      ctx.msgs.push({ role: 'system', content: v.nudge, hidden: true });
      ctx.ledger.step('retry', { what: 'turn', why: v.nudge }).done();
      this.log('handoff', `asked for ${ctx.ledger.expect?.kind || 'something'} and it didn't happen; one more go`);
      ctx.emit({ type: 'token', text: '\n\n' });
      return true;
    }
    const note = v.note || ''; // a nudge with no second go left: the caller's own note (or the hat's answer) stands
    if (note) {
      ctx.emit({ type: 'correction', text: note, ...(v.strike ? { kind: 'claims' } : {}) });
      if (reply) reply.correction = reply.correction ? `${reply.correction} ${note}` : note;
      ctx.ledger.step('note', { what: note }).done();
      ctx.ledger.noted = true;
      this.log('handoff', note);
    }
    return false;
  },
  // Shows a file Bob made, once it's checked to be real. Returns false (and says why) when it isn't.
  async deliver(ctx, type, file) {
    const v = await verifyOutput(file, type).catch((e) => ({ ok: false, why: e.message }));
    if (!v.ok) { this.log('handoff', `${path.basename(file)} wasn't shown: ${v.why}`); return false; }
    const name = path.basename(file);
    // Only files in Bob's pictures folder have a link the chat can show.
    if (!outputDirs(this.cfg).some((d) => path.resolve(d) === path.resolve(path.dirname(file)))) return false;
    ctx.emit({ type, url: `/images/${encodeURIComponent(name)}`, file });
    return true;
  },
};
