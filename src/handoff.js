// Handoffs between Bob's brains and engines (1.5.12). The system keeps track, not the model:
//  - the card lease: one job owns the graphics card at a time. Anything else that needs it waits in line
//    (shown as "Waiting for ..."), it is never dropped and never pulled out from under a running job.
//  - the gate: an action that needs a brain, the painter or an empty card asks the gate first. The gate holds it
//    until that engine really says ready (a live check, not a remembered flag), loads it if needed, checks again,
//    retries a failed load (2 s, then 5 s), and falls back to the main brain when another brain won't load.
//  - the ledger: what this job asked for, every load, tool and output, saved with the job in the queue file, so
//    the end of the turn (and a restart) can see what really happened.
// No model calls in here.
import fs from 'node:fs';
import { sameModel } from './brain-mode.js';
import { gaming } from './sessions.js';
import { describe } from './verify.js';

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (!ms) return resolve();
  const t = setTimeout(() => { signal?.removeEventListener?.('abort', stop); resolve(); }, ms);
  const stop = () => { clearTimeout(t); reject(new Error('Stopped.')); };
  signal?.addEventListener?.('abort', stop, { once: true });
});

// ---------- The card lease ----------
// Re-entrant per owner (a turn's abort signal): one turn can swap brain -> painter -> brain without queuing behind
// itself. Owners wait first come, first served.
export class CardLease {
  constructor() { this.holder = null; this.label = ''; this.line = []; }
  get waiting() { return this.line.length; }
  async acquire(owner, label = '', { signal, onWait } = {}) {
    if (!owner) throw new Error('A card lease needs an owner.');
    if (this.holder === owner) { this.label = label || this.label; return; }
    if (!this.holder && !this.line.length) { this.holder = owner; this.label = label; return; }
    onWait?.(this.label);
    await new Promise((resolve, reject) => {
      const entry = { owner, label, resolve };
      this.line.push(entry);
      signal?.addEventListener?.('abort', () => {
        const i = this.line.indexOf(entry);
        if (i >= 0) { this.line.splice(i, 1); reject(new Error('Stopped.')); }
      }, { once: true });
    });
  }
  release(owner) {
    if (this.holder !== owner) { this.line = this.line.filter((e) => e.owner !== owner); return false; }
    const next = this.line.shift();
    this.holder = next ? next.owner : null;
    this.label = next ? next.label : '';
    next?.resolve();
    return true;
  }
}

// ---------- The ledger ----------
const clip = (x, n = 200) => String(x ?? '').replace(/\s+/g, ' ').slice(0, n);
export class Ledger {
  constructor({ job = null, expect = null, save = () => {} } = {}) {
    this.job = job; this.expect = expect; this.save = save;
    this.steps = []; this.outputs = []; this.actions = []; this.nudged = 0; this.reply = '';
    this.current = null; // 1.5.38: the tool running right now, so a restart knows which step was cut off
    this.persist();
  }
  step(kind, info = {}) {
    const st = { kind, ...Object.fromEntries(Object.entries(info).map(([k, v]) => [k, typeof v === 'string' ? clip(v) : v])), state: 'running', at: Date.now() };
    this.steps.push(st);
    if (this.steps.length > 60) this.steps.splice(0, this.steps.length - 60);
    this.persist();
    const end = (state, extra) => { st.state = state; st.doneAt = Date.now(); Object.assign(st, extra); this.persist(); return st; };
    return { info: st, done: (proof) => end('done', proof ? { proof: clip(proof) } : {}), fail: (e) => end('failed', { error: clip(e?.message || e) }) };
  }
  // tool: the tool that was running when the output appeared (verify.js matches outputs to actions by it).
  output(o, tool = null) { this.outputs.push({ type: o.type, file: o.file || null, url: o.url || null, tool, at: Date.now() }); this.persist(); }
  // at: when the tool started.
  // extra: what verify.js found (why, files, info, declined), so the end-of-turn check can use it.
  begin(name, args) { this.current = { name, args: clip(typeof args === 'string' ? args : JSON.stringify(args || {}), 300), at: Date.now() }; this.persist(); }
  action(name, args, ok, text, at = Date.now(), extra = {}) {
    this.current = null;
    const keep = Object.fromEntries(Object.entries(extra || {}).filter(([k, v]) => ['why', 'files', 'info', 'declined', 'partly'].includes(k) && v != null));
    this.actions.push({ name, args: clip(typeof args === 'string' ? args : JSON.stringify(args || {}), 300), ok, text: clip(text, 300), at, ...keep });
    this.persist();
  }
  // The part that's saved with the job (queue file): small, and enough for a restart to see what was done.
  view() { return { expect: this.expect, steps: this.steps.slice(-30), outputs: this.outputs.slice(-24), actions: this.actions.slice(-40), current: this.current }; }
  persist() { if (this.job) { this.job.handoff = this.view(); try { this.save(); } catch {} } }
}

// A finished job keeps what it asked for, what it made and what it did (short), not every load step: the queue file
// holds up to 200 jobs and is written on every step of the running one.
export function slimHandoff(h) {
  if (!h) return h;
  return { expect: h.expect || null, outputs: (h.outputs || []).slice(-12).map(({ type, file, tool }) => ({ type, file, tool })), actions: (h.actions || []).slice(-12).map(({ name, ok, at }) => ({ name, ok, at })) };
}

// Tools that change something outside Bob's own chat (a restart must not redo these blindly).
export const SIDE_EFFECT = /^(app_|open_app|convert_file|strip_metadata|defender_scan|office_make|office_edit|edit_file|write_file|file_hands|undo_files|move_|copy_|rename_|delete_|recycle|zip|unzip|run_command|run_recipe|save_|schedule_|make_|mcp_use)/; // file_hands/undo_files: 1.5.38
// A job that was cut off by a restart can be picked up again on its own when nothing it did changed the PC.
export function safeToResume(job) {
  const done = job?.handoff?.actions || [];
  return !done.some((a) => a.ok && SIDE_EFFECT.test(a.name));
}
export function interruptedNote(job) {
  const done = (job?.handoff?.actions || []).filter((a) => a.ok && SIDE_EFFECT.test(a.name)).map(plainStep);
  const made = (job?.handoff?.outputs || []).length;
  const parts = [done.length && `it had started ${[...new Set(done)].slice(0, 3).join(', ')}`, made && `made ${made} file${made === 1 ? '' : 's'}`].filter(Boolean);
  const cut = job?.handoff?.current;
  if (cut && WAIT_IF_CUT.test(cut.name)) return `Bob was closed in the middle of this step: ${plainStep(cut)}. Check how far it got first (it may be half done), then press Carry on: Bob carries on from there and won't redo the finished steps.`;
  return `Bob was closed while this was running${parts.length ? ` (${parts.join('; ')})` : ''}. Carry on picks up from where it stopped.`;
}

// ---------- Carrying on after a restart (1.5.38) ----------
// Asked for: "pick up and continue from where it left off", and "if an action didn't finish, retry or restart it",
// when Bob opens again. The ledger saved with the job says which steps finished and which one was cut off.
// Finished steps are never done again. The cut-off step is done again from the start, with the same settings,
// unless it's one that can be left half done (typing into an app, moving or deleting files, running a command, an edit):
// then the job waits in Tasks so the user can look first.
export const WAIT_IF_CUT = /^(app_|office_edit|edit_file|file_hands|undo_files|move_|rename_|delete_|recycle|unzip|run_command|run_recipe|schedule_|mcp_use)/;
export const MAX_AUTO_RESUMES = 2; // a job that keeps getting cut off (or keeps crashing Bob) stops coming back on its own
const plainStep = (a) => { try { return describe(a.name, parseArgs(a.args)).replace(/^\w/, (c) => c.toLowerCase()); } catch { return a.name; } };
const parseArgs = (x) => { try { return typeof x === 'string' ? JSON.parse(x || '{}') : (x || {}); } catch { return {}; } };

// What a cut-off job did, kept across restarts (each run starts a new ledger).
export function finishedSteps(job) {
  const now = (job?.handoff?.actions || []).filter((a) => a.ok && a.text !== 'declined').map(({ name, args, text }) => ({ name, args, text }));
  return [...(job?.before || []), ...now].slice(-20);
}

// mode: 'restart' (nothing done yet: run it again as it was), 'carry' (carry on after the finished steps, redoing
// the cut-off one), or 'wait' (the cut-off step may be half done: wait for Carry on). note: what the brain is told.
export function carryOnPlan(job) {
  const done = finishedSteps(job);
  const cut = job?.handoff?.current || null;
  const outputs = (job?.handoff?.outputs || []).map((o) => o.file || o.url).filter(Boolean).slice(-6);
  if (!done.length && !cut) return { mode: 'restart', note: null, done, cut };
  const lines = ['[Bob note, not from the user: Bob was closed (an update, a restart or a crash) while working on this message, and has opened again. Carry on from where you stopped. Don\'t greet the user again or start over.'];
  if (done.length) {
    lines.push('Already finished. Do NOT do these again:');
    done.forEach((a, i) => lines.push(`${i + 1}. ${a.name} ${a.args || '{}'} -> ${String(a.text || 'done').slice(0, 160)}`));
  }
  if (outputs.length) lines.push(`Files already made: ${outputs.join(', ')}`);
  if (cut) lines.push(`Cut off before it finished: ${cut.name} ${cut.args || '{}'}. Do that step again with the same settings (it may have half happened, so check first if it changes files), then finish the rest.`);
  else lines.push('Do the next step that is still left, then answer.');
  lines.push(']');
  return { mode: cut && WAIT_IF_CUT.test(cut.name) ? 'wait' : 'carry', note: lines.join('\n'), done, cut };
}

// The plain line in the chat when a job picks up again.
export function carryOnLine(job) {
  const plan = { done: job?.before || [], cut: job?.cutStep || null };
  if (!plan.done.length && !plan.cut) return 'I was closed partway through this one, so I\'m starting it again.';
  const bits = [plan.done.length && `${plan.done.length} step${plan.done.length === 1 ? ' was' : 's were'} already done, so I won't redo ${plan.done.length === 1 ? 'it' : 'them'}`, plan.cut && `I'm doing ${plainStep(plan.cut)} again from the start`].filter(Boolean);
  return `I was closed partway through this one. Picking up where I left off: ${bits.join(', and ')}.`;
}

// ---------- The waiting line (1.5.97) ----------
// While a job waits for the graphics card, chat and Tasks show one muted ⏳ line that says who has the card and that
// nothing is needed from the user (on the Legion Go the old line read like an OK card). Never the owner's name.
export const WAIT_STILL = 'Still waiting. Stop cancels this job if you\'d rather not wait.';
export const NOTHING_TO_OK = 'There\'s nothing to OK right now. I\'m just waiting for the graphics card, and I\'ll carry on by myself.';
export function holderLine(label = '', lending = null) {
  const l = String(label || '');
  if (lending) return `I'm lending my brain to "${String(lending.for || 'another Bob').slice(0, 60)}"`;
  if (/clip engine/i.test(l)) return "I'm making a clip";
  if (/picture engine/i.test(l)) return "I'm making a picture";
  if (/workshop|program/i.test(l)) return 'another program is using it';
  if (/brain|\bBob/i.test(l)) return 'my Brain is finishing another job';
  return 'something else is using it';
}
export function waitLine(holder, mins = 0) {
  const n = Math.max(0, Math.floor(mins));
  return `⏳ The graphics card is busy: ${holder}. Nothing for you to do; I carry on by myself when it's free. (waiting ${n} min)${n >= 5 ? ` ${WAIT_STILL}` : ''}`;
}
// 1.5.104: a chat that waits in the queue behind a picture, clip, song or sound gets the same kind of ⏳ line (it used
// to get the older "I'm still on the last job" note, and "ok" after it was queued as a new job).
export const NOTHING_TO_OK_BUSY = 'There\'s nothing to OK right now. I\'m still on the last job, and I\'ll answer you as soon as it\'s done.';
// 1.5.105: the job in plain words for the ⏳ line ("making a picture, step 12 of 30"), from the status-bar detail.
export function plainDoing(detail = '') {
  const d = String(detail || '').trim();
  const steps = (n, m) => (n && m ? `, step ${n} of ${m}` : '');
  if (d === 'Loading the picture engine') return 'loading the picture engine';
  let m = d.match(/^(Painting|Filming)(?: (\d+)\/(\d+))?$/);
  if (m) return `making a ${m[1] === 'Filming' ? 'clip' : 'picture'}${steps(m[2], m[3])}`;
  m = d.match(/^Maestro is (painting|filming)$/);
  if (m) return `making a ${m[1] === 'filming' ? 'clip' : 'picture'} in Maestro`;
  m = d.match(/^Maestro: .*?(?: (\d+)\/(\d+))?(?: \d+%)?$/);
  if (m) return `working in Maestro${steps(m[1], m[2])}`;
  m = d.match(/^(Composing|Making a sound)(?: (\d+)%)?$/);
  if (m) return `making a ${m[1] === 'Composing' ? 'song' : 'sound'}${m[2] ? `, ${m[2]}% done` : ''}`;
  m = d.match(/^Workshop: (.+?)(?: \(\d+ s\))?$/);
  if (m) return `running ${m[1]} in the Workshop`;
  return d;
}
export function queuedLine(doing = '') {
  const d = String(doing || '').trim();
  return `⏳ I'm still on the last job${d ? ` (${d})` : ''}. Nothing for you to do; I'll answer this as soon as it's done. If it can't wait, stop that job in Tasks.`;
}
export const isBareOk = (text) => /^\s*(ok(ay)?|yes|yep|yeah|go( ahead)?|sure|y)\s*[.!]*\s*$/i.test(String(text || ''));

// ---------- The gate ----------
// Errors that a second try won't fix: go straight to the fallback (or the user).
const NO_RETRY = /can't find the model files|has no model file|Couldn't start llama-server|Stopped\./i;

export class Gate {
  constructor(brain, { delays = [2000, 5000], freeWaitMs = 15000 } = {}) {
    this.brain = brain;
    this.lease = new CardLease();
    this.delays = delays;      // waits before the 2nd and 3rd load attempts
    this.freeWaitMs = freeWaitMs;
    this.loading = null;       // { what, since } while something is being loaded
    this.ledgers = new WeakMap(); // turn signal -> ledger
    this.ready = {};           // last real check per engine, for the status panel
  }

  get engine() { return this.brain.engine; }
  get painter() { return this.brain.painter || null; }

  // For the status panel and /api/handoff: who has the card, what's loading, how many wait.
  flags() {
    const p = this.painter?.status?.();
    return { card: this.lease.holder ? (this.lease.label || 'busy') : 'free', loading: this.loading?.what || null, waiting: this.lease.waiting, painter: p ? p.state : null, ready: { ...this.ready } };
  }

  track(signal, ledger) { if (signal && ledger) this.ledgers.set(signal, ledger); }
  ledgerOf(signal) { return (signal && this.ledgers.get(signal)) || null; }

  // A turn ended: its card goes to the next one waiting.
  done(signal) { if (signal) this.lease.release(signal); }

  async hold(signal, label, emit) {
    if (!signal) return; // housekeeping and other ownerless callers never queue
    await this.lease.acquire(signal, label, {
      signal,
      onWait: (who) => {
        const since = Date.now();
        const id = `wait-${since}-${Math.random().toString(36).slice(2, 8)}`;
        const say = () => {
          const text = waitLine(holderLine(who, this.brain.lending), (Date.now() - since) / 60000);
          emit?.({ type: 'waiting-line', id, text });
          this.brain.setState?.('waiting', text);
          return text;
        };
        this.brain.log?.('handoff', say());
        this.waitingNow = (this.waitingNow || 0) + 1;
        const tick = setInterval(say, 60000);
        tick.unref?.();
        const stop = () => { clearInterval(tick); this.waitingNow = Math.max(0, (this.waitingNow || 1) - 1); };
        this.pendingWaits = (this.pendingWaits || new Map()); this.pendingWaits.set(signal, stop);
      }
    }).finally(() => { const stop = this.pendingWaits?.get(signal); if (stop) { stop(); this.pendingWaits.delete(signal); } });
  }

  // need({ id: 'brain', model, opts }, { signal, emit, who, announce }) -> the model that's loaded (it can be a fallback).
  // need({ id: 'painter', kind }) and need({ id: 'card' }) -> the names that were let go to make room.
  async need(dep, { signal, emit = () => {}, who = 'bob', announce } = {}) {
    // 1.5.23: Gaming keeps the card for games (1.5.32: the brain may borrow a little, see gaming-card.js). Brains run on the processor; the painter and workshop don't start.
    if (this.brain?.cfg && gaming(this.brain.cfg)) {
      if (dep.id === 'brain') dep = { ...dep, opts: { ...(dep.opts || {}), cpu: true } };
      else { const e = new Error('Gaming is on, so the graphics card is kept free for the game. Tell the user it will be made after they switch the session to Normal; don\'t try again now.'); e.code = 'gaming'; throw e; }
    }
    if (dep.id === 'brain') return this.needBrain(dep, { signal, emit, who, announce });
    if (dep.id === 'painter' || dep.id === 'card') return this.needCard(dep, { signal, emit });
    throw new Error(`Unknown dependency ${dep.id}.`);
  }

  async needBrain({ model, opts = {} }, { signal, emit, who, announce }) {
    const ledger = this.ledgerOf(signal);
    // 1.5.41: a quick reply is running beside this job on the small brain (Keep chatting while Bob is busy). Let it
    // finish before loading another brain, which would stop it mid-sentence.
    const side = this.brain.turns?.get?.('side');
    // 1.5.51: a reply on the second server (beside: true) has its own llama-server, so loading this brain doesn't touch it.
    if (side && !side.beside && !opts.beside && side.controller?.signal !== signal) {
      this.brain.setState?.('waiting', 'Finishing a quick reply first');
      await this.brain.sideIdle?.(signal);
      if (signal?.aborted) throw new Error('Stopped.');
    }
    // A brain on the processor doesn't need the card; everything else holds the lease until the turn ends.
    if (!opts.cpu) await this.hold(signal, `the ${this.label(model, who).replace(/ \(.*$/, '')}`, emit);
    const tryLoad = async (m, o) => {
      let last = null;
      // 1.5.113: the card is known to be taken by another program: don't start a load that can't work.
      if (!o.cpu && await this.brain.cardStillTaken?.({ kind: 'chat' })) throw Object.assign(new Error(this.brain.cardHeld.line), { code: 'card_held' });
      for (let attempt = 0; attempt <= this.delays.length; attempt++) {
        if (signal?.aborted) throw new Error('Stopped.');
        if (await this.isReady(m, o)) { this.ready.brain = m; return true; }
        if (attempt) {
          const st = ledger?.step('retry', { what: m, attempt: attempt + 1 });
          this.brain.log?.('handoff', `loading ${m} again (try ${attempt + 1}): ${last?.message || 'not ready after loading'}`);
          await this.engine.unload?.(m, o).catch?.(() => {});
          await sleep(this.delays[attempt - 1], signal);
          st?.done();
        }
        // The painter lets go first (it may still hold the card from the last picture), unless both fit.
        if (this.painter?.yieldFor && !o.cpu) await this.painter.yieldFor(m, { bytes: this.brainBytes(m, o) }).catch(() => {});
        const st = ledger?.step('load', { what: m, attempt: attempt + 1 });
        this.loading = { what: m, since: Date.now() };
        try {
          await announce?.(m, attempt);
          await this.engine.preload(m, signal, o);
          // Ready means a live check says so, not that preload returned.
          if (await this.isReady(m, o)) { st?.done('ready'); this.ready.brain = m; return true; }
          last = new Error(`${m} said it loaded but isn't answering.`);
          st?.fail(last);
        } catch (e) {
          st?.fail(e);
          if (signal?.aborted) throw new Error('Stopped.');
          last = e;
          if (NO_RETRY.test(e.message)) break;
          // 1.5.113: timed out because another program holds the card: one try, not three five-minute ones.
          if (!o.cpu && await this.brain.cardTaken?.(e, null).catch?.(() => false)) { last = Object.assign(new Error(this.brain.cardHeld.line), { code: 'card_held' }); break; }
        } finally { this.loading = null; }
      }
      this.ready.brain = null;
      throw last || new Error(`${m} wouldn't load.`);
    };
    try {
      await tryLoad(model, opts);
      return model;
    } catch (e) {
      if (/^Stopped\.$/.test(e.message) || signal?.aborted || e.code === 'card_held') throw e; // 1.5.113: no other brain either
      // 1.5.51: the second brain beside a job won't start. Never fall back to the main brain here: that would swap the
      // big job's brain out from under it. The message goes back in line instead (Brain.startTurn).
      if (opts.beside) { const b = new Error(e.message); b.code = 'beside'; throw b; }
      // Another brain won't load: the main brain does the job instead, and says so.
      const main = this.brain.fallbackBrain?.();
      if (!main?.model || sameModel(main.model, model)) throw e;
      const st = ledger?.step('fallback', { from: model, to: main.model, why: e.message });
      this.brain.log?.('handoff', `${model} wouldn't load (${e.message}); using ${main.model} instead`);
      emit({ type: 'announce', text: `The ${this.label(model, who)} wouldn't load, so my ${this.label(main.model, 'bob')} is taking this one.` });
      const o = { cpu: main.cpu, ctx: main.ctx };
      if (!o.cpu) await this.hold(signal, `the ${this.label(main.model, 'bob').replace(/ \(.*$/, '')}`, emit);
      await tryLoad(main.model, o).catch((e2) => { st?.fail(e2); throw e2; });
      st?.done();
      return main.model;
    }
  }

  // Roughly what a brain needs on the card (its file plus room for the chat), so the painter can stay loaded
  // beside a small one. Unknown -> undefined, and the painter lets go (the safe way).
  brainBytes(model, opts = {}) {
    try {
      const f = this.engine.resolve?.(model)?.gguf;
      if (!f) return undefined;
      const size = fs.statSync(f).size;
      return Math.round(size * 1.1 + Math.min(opts.ctx || 32768, 131072) * 60 * 1024);
    } catch { return undefined; }
  }

  // "Coding brain (Qwen3 Coder 30B)": the brain names the user knows from Equip (brain.js), never a model id.
  label(model, who) { try { return this.brain.brainLabel?.(model, who) || `${model} brain`; } catch { return `${model} brain`; } }

  async isReady(model, opts) {
    try { return Boolean(await this.engine.isLoaded(model, opts)); } catch { return false; }
  }

  // The painter (or Maestro, ComfyUI, the audio workshop) gets the card to itself. Brains are let go and the gate
  // waits until the engine really reports them gone before the painter starts.
  async needCard({ id, kind }, { signal, emit }) {
    const ledger = this.ledgerOf(signal);
    await this.hold(signal, id === 'painter' ? (/video|clip/i.test(String(kind || '')) ? 'the clip engine' : 'the picture engine') : 'the workshop', emit);
    const st = ledger?.step('load', { what: id === 'painter' ? `painter (${kind || 'image'})` : 'empty graphics card' });
    try {
      const gone = (await this.brain.clearGpu()) || [];
      await this.waitFree(signal);
      if (id === 'painter' && this.painter?.ensureReady) {
        const ps = this.painter.status?.();
        if (ps?.state !== 'unavailable') {
          this.loading = { what: 'painter', since: Date.now() };
          try { await this.painter.ensureReady(kind || 'image', { signal }); this.ready.painter = kind || 'image'; }
          catch (e) {
            // The painter's own one-shot route (sd-cli) still works: paint() falls back to it. Only a stop ends here.
            if (e.code === 'stopped' || signal?.aborted) throw e;
            this.brain.log?.('handoff', `picture engine not ready (${e.code || e.message}); painting the one-shot way`);
          } finally { this.loading = null; }
        }
      }
      this.brain.state.model = null;
      st?.done(gone.length ? `let go of ${gone.join(', ')}` : 'card was free');
      return gone;
    } catch (e) { st?.fail(e); throw e; }
  }

  // After an unload, Bob's own GPU brains must really be gone before something else takes the card.
  async waitFree(signal) {
    const until = Date.now() + this.freeWaitMs;
    while (Date.now() < until) {
      let loaded = [];
      try { loaded = await this.engine.loaded(); } catch { return; }
      const onCard = loaded.filter((m) => m.vram > 0 || m.split === undefined);
      if (!onCard.length) return;
      await sleep(250, signal);
    }
    this.brain.log?.('handoff', 'a brain was still on the graphics card after unloading; going ahead');
  }
}

// Runs fn, and once more after a short wait if it fails for a reason a retry can fix.
export async function withRetry(fn, { tries = 2, wait = 3000, signal, onRetry, retryable = () => true } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    if (signal?.aborted) throw new Error('Stopped.');
    try { return await fn(i); } catch (e) {
      last = e;
      if (signal?.aborted || e.code === 'stopped' || /^Stopped\.$/.test(e.message) || i === tries - 1 || !(await retryable(e))) throw e; // 1.5.113: retryable may be async
      onRetry?.(e, i);
      await sleep(wait, signal);
    }
  }
  throw last;
}
