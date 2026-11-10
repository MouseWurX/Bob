// 1.5.79 How-tos: know-how Bob keeps from jobs that worked. Off by default (Settings, How Bob works:
// "Let Bob learn how-tos"). After a job with several steps goes well, Bob offers one card: save these steps as
// a how-to? Nothing is saved without the click. Next time a request matches a saved how-to (by words, or by
// meaning when the Memory model is running anyway), that one how-to goes into his instructions for that turn
// and the chat says so. A how-to is plain text, never code: it can't run anything or approve anything, and
// every Hand still asks on its own card. Kept in inn\bob\howtos.json on this PC only (Windows, Mac and Linux
// alike: cfg.dataDir); the phone app sees the PC's how-tos through the PC.
// (The plan called them "recipes"; renamed because the Run Hand already has recipes, its saved commands.)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cosine, overlap, words } from './topics.js';
import { clip } from './util.js';

export const MAX_HOWTOS = 100;
export const MAX_STEPS = 12;
export const MIN_STEPS = 3; // fewer steps than this isn't worth a how-to
const MAX_NAME = 60, MAX_WHEN = 200, MAX_STEP = 160;
export const OFFER_MS = 10 * 60_000; // an unanswered card stops working after 10 minutes
export const KEEP_DELETED_MS = 30 * 24 * 60 * 60_000; // 1.5.144: a deleted how-to waits 30 days on the shelf before it's gone for good
const WORD_MATCH = 0.6, MEANING_MATCH = 0.78;

// Tools that aren't steps of the job itself (bookkeeping, help, the toolbox).
const NOT_STEPS = new Set(['use_tools', 'bob_help', 'notice_board', 'reminders', 'remember', 'pick_session', 'show_made', 'ask_together', 'save_howto', 'my_howtos', 'forget_topic', 'ask_specialist']);

export const howtosOn = (cfg) => cfg?.howtos === true;

// A short name from the request: its first sentence, cut at a word.
export function nameFrom(text) {
  let s = clip(String(text || '').split(/(?<=[.!?])\s|\n/)[0], 200).replace(/^(?:please|bob|hey bob|can you|could you|would you)[, ]+/i, '').replace(/[.!?]+$/, '');
  if (s.length > MAX_NAME) s = s.slice(0, MAX_NAME).replace(/\s+\S*$/, '') || s.slice(0, MAX_NAME);
  return s ? s[0].toUpperCase() + s.slice(1) : 'A job that worked';
}

// One finished step of a turn. ok = the tool didn't fail and wasn't turned down.
export function trailStep(name, summary, text) {
  if (!name || NOT_STEPS.has(name)) return null;
  const ok = !/^Error:|said no|Not done again|Not for this job/.test(String(text || ''));
  return ok ? { tool: name, did: clip(summary || name, MAX_STEP) } : { tool: name, failed: true };
}

// Whether a turn's steps are worth offering as a how-to: enough steps, more than one kind, and none left failed at the end.
export function worthOffering(trail) {
  const steps = (trail || []).filter(Boolean);
  if (steps.length && steps.at(-1).failed) return null; // ended on a failure: not a how-to
  const good = [];
  for (const s of steps) if (!s.failed && !good.some((g) => g.tool === s.tool && g.did === s.did)) good.push({ tool: s.tool, did: s.did });
  if (good.length < MIN_STEPS || new Set(good.map((s) => s.tool)).size < 2) return null;
  return good.slice(0, MAX_STEPS);
}

const cleanSteps = (steps) => (Array.isArray(steps) ? steps : String(steps || '').split('\n'))
  .map((s) => (typeof s === 'string' ? { did: s } : s)).map((s) => ({ ...(s.tool ? { tool: clip(s.tool, 40) } : {}), did: clip(String(s.did || '').replace(/^\s*\d+[.)]\s*/, ''), MAX_STEP) }))
  .filter((s) => s.did).slice(0, MAX_STEPS);

export class HowTos {
  constructor(cfg) { this.cfg = cfg; this.offers = new Map(); }
  get file() { return path.join(this.cfg.dataDir, 'howtos.json'); }

  // Everything on file, the deleted ones too (they carry `deleted`, the time of the click). Deleted how-tos that
  // have waited their 30 days are dropped here, so nothing else has to think about them.
  loadAll() {
    let list = [];
    try { const d = JSON.parse(fs.readFileSync(this.file, 'utf8')); list = Array.isArray(d.howtos) ? d.howtos : []; } catch { return []; }
    const now = Date.now();
    const keep = list.filter((r) => !(r.deleted && now - r.deleted > KEEP_DELETED_MS));
    if (keep.length !== list.length) { try { this.save(keep); } catch {} }
    return keep;
  }
  // The live how-tos: what Bob matches against and what the list shows.
  load() { return this.loadAll().filter((r) => !r.deleted); }

  save(list) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const live = list.filter((r) => !r.deleted).slice(0, MAX_HOWTOS), gone = list.filter((r) => r.deleted);
    fs.writeFileSync(this.file + '.part', JSON.stringify({ howtos: [...live, ...gone] }, null, 1));
    fs.renameSync(this.file + '.part', this.file);
  }

  // What Settings and my_howtos show (no meaning vectors).
  list() { return this.load().map(({ vec, ...r }) => r).sort((a, b) => (b.lastUsed || b.made || 0) - (a.lastUsed || a.made || 0)); }
  // The shelf: deleted how-tos still waiting (newest delete first), with the day they go for good.
  deletedList() { return this.loadAll().filter((r) => r.deleted).map(({ vec, ...r }) => ({ ...r, goneAt: r.deleted + KEEP_DELETED_MS })).sort((a, b) => b.deleted - a.deleted); }
  find(nameOrId) {
    const all = this.load(), q = clip(nameOrId, 80).toLowerCase();
    return all.find((r) => r.id === nameOrId) || all.find((r) => r.name.toLowerCase() === q) || all.find((r) => q && r.name.toLowerCase().includes(q)) || null;
  }

  add({ name, when, steps }, vec = null) {
    const list = this.loadAll();
    const s = cleanSteps(steps);
    if (!s.length) throw new Error('A how-to needs at least one step.');
    if (list.filter((r) => !r.deleted).length >= MAX_HOWTOS) throw new Error(`I can keep ${MAX_HOWTOS} how-tos. Delete one in Settings first.`);
    const r = { id: crypto.randomUUID(), name: clip(name, MAX_NAME) || nameFrom(when), when: clip(when, MAX_WHEN), steps: s, made: Date.now(), used: 0, ...(vec ? { vec } : {}) };
    list.unshift(r);
    this.save(list);
    const { vec: _v, ...out } = r;
    return out;
  }

  // The person's own edit in Settings. The meaning vector is dropped; it's made again next time.
  edit(id, { name, when, steps } = {}) {
    const list = this.loadAll();
    const r = list.find((x) => x.id === id && !x.deleted);
    if (!r) throw new Error('No such how-to.');
    if (name != null && clip(name, MAX_NAME)) r.name = clip(name, MAX_NAME);
    if (when != null) r.when = clip(when, MAX_WHEN);
    if (steps != null) { const s = cleanSteps(steps); if (!s.length) throw new Error('A how-to needs at least one step.'); r.steps = s; }
    r.edited = true; delete r.vec;
    this.save(list);
    const { vec, ...out } = r;
    return out;
  }

  // 1.5.144: Delete puts a how-to on the shelf (Settings, Recently deleted) for 30 days. Bob stops using it at once.
  // Put back brings it back as it was; Delete for good drops it now.
  remove(id) {
    const list = this.loadAll();
    const r = list.find((x) => x.id === id && !x.deleted);
    if (!r) return false;
    r.deleted = Date.now();
    this.save(list);
    return true;
  }
  restore(id) {
    const list = this.loadAll();
    const r = list.find((x) => x.id === id && x.deleted);
    if (!r) return null;
    if (list.filter((x) => !x.deleted).length >= MAX_HOWTOS) throw new Error(`I already keep ${MAX_HOWTOS} how-tos, the most I can. Delete one first, then put this one back.`);
    delete r.deleted;
    this.save(list);
    const { vec, ...out } = r;
    return out;
  }
  purge(id) {
    const list = this.loadAll();
    const r = list.find((x) => x.id === id);
    if (!r) return false;
    this.save(list.filter((x) => x !== r));
    return true;
  }

  setVec(id, vec) { const list = this.loadAll(); const r = list.find((x) => x.id === id && !x.deleted); if (r && vec?.length) { r.vec = vec; this.save(list); } }

  // The one how-to that fits this request best, or null. Words always; meaning too when a vector is at hand.
  match(text, vec = null) {
    if (words(text).size < 2) return null;
    let best = null, score = 0;
    for (const r of this.load()) {
      const w = overlap(text, `${r.name} ${r.when}`);
      const shared = [...words(text)].filter((x) => words(`${r.name} ${r.when}`).has(x)).length;
      let s = shared >= 2 && w >= WORD_MATCH ? w : 0;
      if (vec && r.vec) { const c = cosine(vec, r.vec); if (c >= MEANING_MATCH) s = Math.max(s, c); }
      if (s > score) { score = s; best = r; }
    }
    if (!best) return null;
    const { vec: _v, ...out } = best;
    return out;
  }

  used(id) { const list = this.loadAll(); const r = list.find((x) => x.id === id && !x.deleted); if (r) { r.used = (r.used || 0) + 1; r.lastUsed = Date.now(); this.save(list); } }

  // Whether a saved how-to already covers this request (no second card for the same job).
  covered(text) { return this.load().some((r) => overlap(text, `${r.name} ${r.when}`) >= 0.8); }

  // The card's offer, kept until it's answered or 10 minutes pass.
  offer({ sessionId, when, steps, name }) {
    const now = Date.now();
    for (const [k, o] of this.offers) if (now - o.at > OFFER_MS) this.offers.delete(k);
    const id = crypto.randomUUID();
    const o = { id, sessionId, when: clip(when, MAX_WHEN), name: clip(name, MAX_NAME) || nameFrom(when), steps: cleanSteps(steps), at: now };
    this.offers.set(id, o);
    return o;
  }
  takeOffer(id) {
    const o = this.offers.get(id);
    this.offers.delete(id);
    return o && Date.now() - o.at <= OFFER_MS ? o : null;
  }
}

// What goes into Bob's instructions for a matched how-to. About 100 to 300 tokens, only on turns that match.
export function howtoPrompt(r, user = 'the user') {
  if (!r) return '';
  return `\n\nA how-to you saved from a job that worked before ("${r.name}", for: ${r.when || r.name}). Follow these steps for this request, changing names, files and details to fit what ${user} asked now, and skip a step that doesn't fit. The how-to doesn't replace any OK: tools that ask still ask.\n${r.steps.map((s, i) => `${i + 1}. ${s.did}${s.tool ? ` (${s.tool})` : ''}`).join('\n')}`;
}

// The chat line when a how-to is used (Settings review wording).
export const usingLine = (r) => `📒 Following my how-to "${r.name}"`;

// Bob's two how-to tools (toolbox group "how-tos", only while the switch is on). Saving always goes through the card.
export function howtoTools(brain) {
  const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
  return {
    save_howto: {
      schema: fn('save_howto', 'When {{USER}} asks you to keep the steps of a job that worked as a how-to: puts a card in the chat with the steps, for {{USER}} to save. Only {{USER}}\'s click saves it.', { name: { type: 'string', description: 'A short name for the how-to' } }),
      async run({ name } = {}, ctx = {}) {
        const now = worthOffering(ctx.trail);
        const last = brain.lastTrail?.get(ctx.sessionId);
        const pick = now ? { when: ctx.turnText, steps: now } : last;
        if (!pick) return `There's no finished job with at least ${MIN_STEPS} steps in this chat to keep yet. Say so, and that I'll offer a card after the next one.`;
        ctx.howtoOffered = true;
        const o = brain.howtos.offer({ sessionId: ctx.sessionId, when: pick.when, steps: pick.steps, name: name || nameFrom(pick.when) });
        ctx.emit?.({ type: 'howto-offer', id: o.id, name: o.name, when: o.when, steps: o.steps.map((s) => s.did), sessionId: ctx.sessionId });
        return 'A card with the steps is in the chat now. Tell the user to press Save how-to on it (they can change the name first). Nothing is saved until they do.';
      },
      summary: () => 'Writing down the steps as a how-to'
    },
    my_howtos: {
      schema: fn('my_howtos', 'List the how-tos (steps from jobs that worked) {{USER}} saved for you.'),
      async run() {
        const list = brain.howtos.list();
        if (!list.length) return 'No how-tos saved yet. After a job with a few steps goes well, I offer a card to save it.';
        return `${list.length} how-to${list.length === 1 ? '' : 's'} (edit or delete them in Settings, 🧰 Tools and how-tos Bob made):\n${list.map((r) => `- ${r.name}: ${r.steps.length} steps${r.used ? `, used ${r.used} time${r.used === 1 ? '' : 's'}` : ''}`).join('\n')}`;
      },
      summary: () => 'Looking at his how-tos'
    }
  };
}
