// Nov 15, the owner: "we need to have the ability to sort how we want jobs in the queue to distributed" and "can we
// have a ranking order for how they are selected?". How Send jobs picks which of your other Bobs gets a whole job.
//
// Who can get the job at all comes first, and never changes: he takes jobs, can do this kind right now, isn't gaming
// (the Gaming button or a game on his card) and isn't full. Then the owner's optional limits (home network only,
// computers only, a cap on how many jobs he already has). Then the owner's rules, in the owner's order, each one only
// breaking ties left by the rules above it. Your list order (the ↑ buttons) is always the last word.
//
// Left as it was (rules: Least busy), this picks exactly as before: the least busy, then your list order.
// The rule that cable and wireless Bobs never share one brain is about Bigger Bobs (share-card.js oneKind) and
// stays as it is; a whole job only sends its words and brings files back, so it can go over any link.

export const JOB_RULES = ['leastBusy', 'fastest', 'biggest', 'closest', 'computers'];
export const JOB_KINDS = ['pictures', 'video', 'music', 'sfx', 'model3d', 'web', 'think', 'room'];
export const JOB_MAX_QUEUE = [0, 1, 2, 3, 5]; // 0: no cap
export const JOB_PICK_DEFAULT = Object.freeze({ rules: ['leastBusy'], homeOnly: false, computersOnly: false, maxQueue: 0, first: {} });

// Saved or sent: only known rules, each once, in the order given. An empty list is allowed (your list order only).
export function cleanJobPick(p, { bobs = [] } = {}) {
  const x = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  const rules = Array.isArray(x.rules) ? [...new Set(x.rules.map(String).filter((r) => JOB_RULES.includes(r)))] : [...JOB_PICK_DEFAULT.rules];
  const known = new Set(bobs.map((b) => b.address));
  const first = {};
  if (x.first && typeof x.first === 'object' && !Array.isArray(x.first)) {
    for (const k of JOB_KINDS) { const a = x.first[k]; if (typeof a === 'string' && (!bobs.length || known.has(a))) first[k] = a.slice(0, 120); }
  }
  return { rules, homeOnly: x.homeOnly === true, computersOnly: x.computersOnly === true, maxQueue: JOB_MAX_QUEUE.includes(Number(x.maxQueue)) ? Number(x.maxQueue) : 0, first };
}

// True when nothing differs from how Bob always picked (so a saved settings file stays as small as before).
export const isDefaultPick = (p) => {
  const c = cleanJobPick(p);
  return c.rules.join() === JOB_PICK_DEFAULT.rules.join() && !c.homeOnly && !c.computersOnly && !c.maxQueue && !Object.keys(c.first).length;
};

const speedOf = (s) => s?.measured?.tokPerSec || s?.speed || 0;
const isPhone = (s) => s?.device === 'phone';
// For each rule: below 0 puts a first. near(bob) is his home-network door (or ''), from Lenders.nearOf.
const COMPARE = {
  leastBusy: (a, b) => (a.s.queue || 0) - (b.s.queue || 0),
  fastest: (a, b) => speedOf(b.s) - speedOf(a.s),
  biggest: (a, b) => (b.s.room?.vramGB || 0) - (a.s.room?.vramGB || 0),
  closest: (a, b) => (Number(Boolean(b.near)) - Number(Boolean(a.near))) || ((a.s.ms > 0 ? a.s.ms : Infinity) - (b.s.ms > 0 ? b.s.ms : Infinity) || 0),
  computers: (a, b) => Number(isPhone(a.s)) - Number(isPhone(b.s))
};

// Can he get this job at all? Returns '' for yes, or why not (for the logbook and tests).
export function whyNot(c, need, { room = false, pick = JOB_PICK_DEFAULT, now = Date.now() } = {}) {
  const s = c.s || {};
  if (!s.takesJobs) return 'takes no jobs';
  if (!(s.jobs || []).includes(need)) return 'can\'t do that kind';
  if (room && !(s.jobs || []).includes('room')) return 'takes no group jobs';
  if (s.why === 'gaming' || s.jobsBusy === 'gaming') return 'gaming';
  if (s.jobsBusy) return s.jobsBusy;
  if (s.jobsDownUntil > now) return 'said no a moment ago';
  if (pick.homeOnly && !c.near) return 'not on the home network';
  if (pick.computersOnly && isPhone(s)) return 'a phone';
  if (pick.maxQueue && (s.queue || 0) >= pick.maxQueue) return `has ${s.queue} jobs already`;
  return '';
}

// cands: [{ bob, s, i, near }] (i: his place in your list). Returns the ones who can, best first.
export function rankForJob(cands, need, { room = false, pick: raw = JOB_PICK_DEFAULT, now = Date.now() } = {}) {
  const pick = cleanJobPick(raw);
  const can = cands.filter((c) => !whyNot(c, need, { room, pick, now }));
  const firstAt = pick.first[need];
  can.sort((a, b) => {
    if (firstAt) { const f = Number(b.bob.address === firstAt) - Number(a.bob.address === firstAt); if (f) return f; }
    for (const r of pick.rules) { const d = COMPARE[r](a, b); if (d) return d; }
    return a.i - b.i;
  });
  return can;
}
