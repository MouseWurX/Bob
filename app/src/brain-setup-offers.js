// Set it up and rented-brain offers in the chat: what isn't set up yet, the offer cards and their answers.
// Methods of the Brain class. Split out of brain.js.
import { capabilities } from './capabilities.js';
import { SWITCH_KEYS, switchFor, NEEDS, planFor, SetupOffers, applySwitch } from './setup-offer.js';
import { saidNotDone } from './said-done.js';
import { moreSwitchesOff, checkRecord } from './honest.js';
import { noteStrike } from './quarantine.js';
import { roughTokens } from './share-brains.js';
import { estimateText } from './rental.js';

// Methods of the Brain class, put on it in its main file with the same rules as the methods written inside it.
export const setupParts = {
  // ---- Jobs that wait for a download (1.5.38) ----
  // "Make me a song" with no music models yet: the user presses Download in the chat, and the song request waits
  // in Tasks until the download is done, then runs by itself. It's in queue.json, so it survives Bob closing too.
  // ---- 1.5.91 Set it up for you ----
  // Is anything Bob could offer missing or switched off right now? (offer_setup is only listed then.)
  notSetUp(tool) {
    const need = { make_image: 'pictures', make_video: 'video', make_music: 'music', make_sound: 'sfx' }[tool];
    if (!need) return false;
    try { return !capabilities(this.cfg)[need]; } catch { return false; }
  },
  switchesOff() { return SWITCH_KEYS.map((k) => switchFor(this.cfg, k)).filter(Boolean); },
  // 1.5.207: the switches offered on a card (the last 2 hours) that are still off.
  pendingSwitches() {
    const off = new Set(this.switchesOff().map((x) => x.key));
    return new Set([...(this.offers?.map?.values() || [])].filter((o) => o.sw && off.has(o.sw) && Date.now() - o.at < 72e5).map((o) => o.sw));
  },
  // 1.5.207 (said-done.js, always on): a finished reply that says a switch is on while it's off, or that something
  // was sent or looked up when nothing did it, gets one short correction under it. Checked in code; nothing is added
  // to what the brain reads.
  checkSaid(ctx, reply) {
    if (!reply || reply.correction || ctx.saidChecked) return;
    ctx.saidChecked = true;
    let v = null;
    try { v = saidNotDone(reply.content, { actions: ctx.ledger?.actions || [], off: [...this.switchesOff(), ...moreSwitchesOff(this.cfg)], pending: this.pendingSwitches() }); } catch (e) { this.brokenCheck(ctx, 'said-but-not-done check', e); }
    if (!v) return;
    ctx.emit?.({ type: 'correction', text: v.note, kind: v.kind === 'switch' ? 'setting' : v.kind });
    reply.correction = v.note;
    this.log('honesty', `said but not done (${v.kind}): ${v.note}`);
  },
  // Nov 12 (honest.js, items 181 and 186-188, always on): the final answer against the turn's record. Each "I did X"
  // needs a step that did X; counts and sizes, quotes and web links need a result (or the chat) that holds them.
  // One short note under the answer when something is off; nothing is added to what the brain reads.
  checkRecord(ctx, reply) {
    if (!reply || reply.correction || ctx.recordChecked || ctx.job?.guest) return;
    ctx.recordChecked = true;
    let v = null;
    try {
      const actions = [...(ctx.job?.before || []).map((a) => ({ ...a, ok: true })), ...(ctx.ledger?.actions || [])];
      const chat = (ctx.msgs || []).filter((m) => m && m !== reply && (m.role === 'user' || m.role === 'tool')).slice(-40).map((m) => String(m.text ?? m.content ?? ''));
      v = checkRecord(reply.content, { actions, seen: ctx.seen || [], chat, sandbox: ctx.sandboxOut || [] });
    } catch (e) { this.log('honesty', `the record check broke: ${e.message}`); }
    if (!v) return;
    const note = v.notes.join(' ');
    ctx.emit?.({ type: 'correction', text: note, kind: v.kinds[0] });
    reply.correction = note;
    this.log('honesty', `answer checked against the record (${v.kinds.join(', ')}): ${note}`);
    if (v.strike) { try { noteStrike(this, ctx, 'claims', 'said he did something no step did'); } catch {} }
  },
  offerNeeded() {
    let can = {};
    try { can = capabilities(this.cfg); } catch {}
    return !can.hearing || !can.voice || this.switchesOff().length > 0;
  },
  // Show the Set it up card for a capability (NEEDS) or a setting (SWITCH_KEYS) and tell Bob what to say.
  // Returns Bob's instructions as the tool result, never an error. quiet: return '' when no card could be made.
  async offerSetup(what, ctx, { quiet = false } = {}) {
    const who = this.cfg.userName || 'the user';
    const jobId = ctx?.job?.id || null;
    // A job from another of your Bobs: the card would land on the wrong replicant matrix, so just say it can't here.
    if (ctx?.job?.guest?.public) return quiet ? '' : `Not here: this replicant matrix can't ${NEEDS[what]?.say || 'do that'} yet. Say so in one line.`;
    if (ctx?.job?.guest) return quiet ? '' : `Not here: this replicant matrix can't ${NEEDS[what]?.say || 'do that'} yet. Say so; ${ctx.job.guest.from} can do it or set it up there.`;
    // 1.5.104: one request, one card. A second offer for the same thing in the same turn (the tool, then Bob's own
    // offer_setup) shows nothing new.
    if (ctx && (ctx.offered ||= new Set()).has(what)) { ctx.offeredNow = true; return quiet ? '' : `The card for this is already under the chat. Don't call offer_setup again and don't repeat what you said: if you've told ${who} about the card, stop here.`; }
    if (NEEDS[what]) {
      const n = NEEDS[what];
      if (!this.shop) return quiet ? '' : `Not done: this replicant matrix can't ${n.say} yet. Say so in one line and offer to write the prompt instead.`;
      const [list, hw] = await Promise.all([this.shop.list(), this.shop.hardware().catch(() => ({}))]);
      const plan = planFor(what, { list, hw });
      if (plan.kind === 'none') return quiet ? '' : `Not done: this replicant matrix can't ${n.say}: ${plan.why} Tell ${who} that in one line and offer to write the prompt instead. Don't call the tool again now.`;
      const id = (this.offers ||= new SetupOffers()).add({ plan, jobId });
      if (ctx) { (ctx.offered ||= new Set()).add(what); ctx.offeredNow = true; }
      ctx?.emit?.({ type: 'offer-setup', id, need: what, kind: plan.kind, say: n.say, what: n.what, items: plan.items || [], size: plan.size || '', sizeGB: plan.sizeGB || 0, freeGB: plan.freeGB ?? null, short: plan.short || 0, note: plan.note || '', model: plan.model || null, carryOn: Boolean(jobId) });
      this.log('setup', `offered ${what}: ${plan.kind} ${(plan.ids || []).join(', ') || plan.model?.id || ''}`);
      const say = plan.kind === 'equip'
        ? `${plan.model.name} is already on this replicant matrix but isn't in its slot. A card with a "Use it" button is now under this chat.`
        : `This replicant matrix can't ${n.say} yet: it needs ${n.what} (${plan.items.map((i) => i.name).join(' and ')}, about ${plan.size}). A card with a "Set it up" button is now under this chat.`;
      return `Nothing made yet. ${say} Tell ${who} that in one or two short, friendly lines: what's missing, the size, and that one press sets it up and then you ${jobId ? 'carry on with this job by yourself, no need to ask again' : 'can do it'}. It isn't an error, so don't apologise for one, and don't call this tool again now.`;
    }
    const sw = switchFor(this.cfg, what);
    if (!sw) return quiet ? '' : SWITCH_KEYS.includes(what) ? 'That setting is already on. Go ahead with the job.' : `There's no setting called ${what}. Settings you can offer: ${this.switchesOff().map((x) => x.key).join(', ') || 'none (everything is on)'}.`;
    if (sw.held) return `The ${sw.name} Hand is stopped with ${sw.where}. Tell ${who} in one line: press that switch again to let Hands carry on, then ask again. Don't offer anything else.`;
    const id = (this.offers ||= new SetupOffers()).add({ sw: what, jobId });
    if (ctx) { (ctx.offered ||= new Set()).add(what); ctx.offeredNow = true; }
    ctx?.emit?.({ type: 'offer-setup', id, need: what, kind: 'switch', name: sw.name, where: sw.where, what: sw.what, privacy: sw.privacy || '', free: Boolean(sw.free), folders: Boolean(sw.folders), carryOn: Boolean(jobId) });
    this.log('setup', `offered to switch on ${what}`);
    return `Not on yet: "${sw.name}" stays off until ${who} presses Switch it on on the card under this chat${sw.folders ? ' (then they tick folders in Settings, Hands)' : ''}. Say what it does in one line; ${jobId ? 'the job carries on after the press' : 'you can do it after the press'}. Don't say it's on.`;
  },
  // 1.5.127 Rented brains: the Hire it card for the rented brain in its slot. One card per turn; nothing is spent until it's pressed.
  offerRent(ctx, { why = '', tokens = 0 } = {}) {
    const rental = this.rentals.current();
    if (!rental) return null;
    if (ctx.rentOffered) return { already: true };
    ctx.rentOffered = true;
    const n = tokens || roughTokens({ messages: ctx.msgs || [] });
    const view = this.rentals.view().rentals.find((r) => r.id === rental.id);
    const id = this.rentals.offer(rental, { jobId: ctx.job?.id || null, tokens: n, why, emit: (ev) => ctx.emit?.({ ...ev, sessionId: ctx.sessionId }) });
    const can = this.rentals.canStart(rental, 0);
    return { id, est: estimateText(rental, n), blocked: can.ok ? '' : can.why, name: rental.name, service: view?.serviceName || '' };
  },
  // The Hire it card was answered (PC window or phone). yes: the job runs again, on the rented brain this time.
  answerRent(id, yes) {
    const r = this.rentals.answer(id, yes);
    if (r.ok && r.done === 'none' && r.jobId) { // 1.5.128: Not now runs the request here instead of leaving it unanswered
      const j = this.queue.find((x) => x.id === r.jobId);
      if (j) { j.rent = false; j.rentOk = false; j.rentAgain = true; this.carryOnNow(j.id, '[Bob note, not from the user: the user pressed Not now on the rented brain card. Do what they asked here, on this computer, with the brains you have.]'); return { ...r, carryOn: true }; }
    }
    if (!r.ok || r.done !== 'hired') return r;
    const j = this.queue.find((x) => x.id === r.jobId);
    if (j) { j.rent = true; j.rentOk = true; j.rentAgain = true; this.carryOnNow(j.id, `[Bob note, not from the user: the user hired the rented brain (${r.rental.name}) for this. Do what they asked.]`); }
    this.broadcast?.({ type: 'settings-changed' });
    return { ok: true, done: 'hired', name: r.rental.name, carryOn: Boolean(j) };
  },
  // The card was answered (PC window or phone). yes: download / put in its slot / switch on, then carry on with the job.
  async answerSetup(id, yes) {
    const o = (this.offers ||= new SetupOffers()).take(id);
    if (!o) return { ok: false, why: 'That card is too old now. Ask me again.' };
    if (!yes) { this.log('setup', 'Not now'); return { ok: true, done: 'none' }; }
    if (o.sw) {
      const patch = applySwitch(this.cfg, o.sw, { saveHands: (h) => this.saveHands(h) });
      if (!patch) return { ok: false, why: 'That setting couldn\'t be switched on from here. It\'s in Settings.' };
      this.log('setup', `switched on ${o.sw} (your click)`);
      if (o.jobId) this.carryOnNow(o.jobId, `[Bob note, not from the user: the user switched on ${switchFor({}, o.sw)?.name || o.sw} for this. Do what they asked.]`);
      this.broadcast?.({ type: 'settings-changed' });
      return { ok: true, done: 'switch' };
    }
    const plan = o.plan;
    if (plan.kind === 'download') {
      const hw = await this.shop.hardware().catch(() => ({}));
      if (hw.freeGB != null && hw.freeGB < plan.sizeGB + 2) return { ok: false, why: `Not enough free disk: free up ${Math.ceil(plan.sizeGB + 2 - hw.freeGB)} GB, then ask me again.` };
    }
    this.shop.planEquip(plan.equip || {});
    if (plan.kind === 'equip') {
      await this.shop.applyEquip();
      this.log('setup', `put ${plan.model?.id} in its slot (your click)`);
      if (o.jobId) this.carryOnNow(o.jobId, `[Bob note, not from the user: ${plan.model?.name} is in its slot now. Do what they asked.]`);
      return { ok: true, done: 'equip' };
    }
    await this.shop.download(plan.ids[0], { queue: plan.ids.slice(1) });
    if (o.jobId) this.waitForDownload(o.jobId, plan.ids);
    this.log('setup', `downloading ${plan.ids.join(', ')} (your click)`);
    return { ok: true, done: 'download', names: plan.items.map((i) => i.name), size: plan.size };
  },
};
