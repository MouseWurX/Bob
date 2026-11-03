// Which models suit this PC, and which jobs (Equip Bob slots) each model can do. Pure functions, no DOM,
// so the tests can run them. Three separate answers, never mixed up:
//   canDo:  can this model do that job at all? If not, it isn't listed for that job anywhere.
//   suit:   does it run well on this PC (graphics card, RAM, disk)? ok, slow, no or blocked, with a plain reason.
//   pickFor: which model is Bob's pick for that job on this PC? (scored for brains; the starter set otherwise)
const gb = (n) => (n >= 1 ? `${(+n).toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.round(n * 1000)} MB`);

export const SLOT_NAMES = { bob: 'Brain', small: 'Quick brain', deep: 'Deep thinking', tinker: 'Coding', reviewer: 'Review', eyes: 'Seeing pictures', embed: 'Memory (finding past chats)', voice: 'Hearing you', speech: 'Voice', image: 'Painter', edit: 'Picture editor', video: 'Video', music: 'Music', sfx: 'Sound effects', ledger: 'Spreadsheets', scout: 'Research', painter: 'Prompt writer' };
export const BRAIN_SLOTS = ['bob', 'small', 'deep', 'tinker', 'reviewer', 'eyes', 'ledger', 'scout', 'painter'];

// The starter set for this PC's graphics card.
export const packFor = (packs, vramGB) => packs.find((p) => (vramGB || 0) >= p.minVramGB) || packs.at(-1);

// Billions of parameters from a model name (gemma4:e4b, qwen3-coder:30b, gpt-oss:20b), or null.
export function paramsB(name) {
  const m = String(name || '').toLowerCase().match(/(?:^|[:\-_ ])e?(\d+(?:\.\d+)?)b(?![a-z0-9])/);
  return m ? Number(m[1]) : null;
}

// Can this model do this job? Models in Bob's list say so themselves (catalog "jobs"). Others are judged by what
// their engine reports (Ollama: completion, vision, tools, thinking, embedding), then by their name.
export function canDo(slotId, { entry, name, caps } = {}) {
  if (entry?.jobs) return entry.jobs.includes(slotId);
  if (entry && !['chat', 'coding', 'vision'].includes(entry.category)) return false;
  const c = caps || [];
  const known = c.length > 0;
  if (known && !c.includes('completion')) return false; // embedding-only and the like
  const label = String(name || entry?.ollama || '');
  const p = paramsB(label);
  const vision = known ? c.includes('vision') : /(?:vl|vision|llava|moondream|minicpm-v)(?![a-z])/i.test(label);
  switch (slotId) {
    case 'eyes': return vision;
    case 'small': return p == null || p <= 8; // quick means small
    case 'bob': return !known || c.includes('tools'); // the main brain uses Bob's tools
    case 'deep': case 'reviewer': return p == null || p >= 12; // careful thinking needs a bigger brain
    case 'tinker': return p == null || p >= 7 || /cod(e|er)/i.test(label);
    default: return BRAIN_SLOTS.includes(slotId); // helpers: any brain that chats
  }
}

// The jobs a catalog model can do, by name ("Brain, Coding, Review"), for the Get models cards.
export const jobNames = (entry) => (entry?.jobs || []).map((id) => SLOT_NAMES[id]).filter(Boolean);

// Which computers each of Bob's own engines runs on (src/engines.js has the builds; this is for the model cards).
// Not listed = Windows, Mac and Linux.
export const ENGINE_PLATFORMS = { 'whisper.cpp': ['win32', 'linux'], Piper: ['win32', 'linux'] };
export const engineRunsOn = (name, platform) => !platform || (ENGINE_PLATFORMS[name] || ['win32', 'darwin', 'linux']).includes(platform);

// How well a model runs on this PC. hw: { vramGB, ramGB, freeGB }. Each answer that isn't ok has a one-line reason.
export function suit(m, hw = {}, platform = '') {
  if (hw.freeGB != null && m.status?.state !== 'installed' && m.sizeGB > hw.freeGB) return { level: 'blocked', why: `Needs ${gb(m.sizeGB)} of disk space; ${hw.freeGB} GB is free.` };
  if (m.needs && platform && !engineRunsOn(m.needs, platform)) return { level: 'blocked', why: `${m.needs} doesn't run on ${platform === 'darwin' ? 'a Mac' : 'this computer'} yet.` };
  const v = hw.vramGB;
  // A brain bigger than the card keeps the rest in RAM. Too much for the RAM, and it won't run well at all.
  if (m.ollama && v && hw.ramGB && m.vramGB > v) {
    const spill = Math.ceil(m.vramGB - v);
    if (spill > hw.ramGB / 2) return { level: 'no', ram: true, why: `About ${spill} GB of it won't fit on your graphics card, and your ${hw.ramGB} GB of RAM can't spare that much.` };
  }
  if (!m.vramGB) return { level: 'ok' };
  if (!v) return m.vramGB > 8 ? { level: 'slow', why: 'No graphics card found, so a model this big is very slow on the processor.' } : { level: 'ok' };
  if (m.vramGB <= v) return { level: 'ok', fits: true };
  if (m.vramGB <= v * 1.5) return { level: 'slow', why: `Wants ${m.vramGB} GB of graphics memory; your card has ${v} GB. It runs, but slowly.` };
  return { level: 'no', why: `Wants ${m.vramGB} GB of graphics memory; your card has ${v} GB. It probably won't run well.` };
}

// ---- Bob's pick for each job on this PC ----
// Brain jobs are scored: a model scores higher the more jobs it covers, because one model doing
// several jobs means Bob stops to swap brains less; and higher the less it takes from the PC (graphics memory,
// and a heavy penalty for spilling into RAM). A quality term per job stops a tiny model winning a job it does
// badly (bigger brains think better; the Quick brain only cares about being light). Only models that run well
// here take part; if none do, there's no pick for that job. Pictures, video and voices use the starter set for the
// card, since lightness alone would always pick the most squeezed picture model.
// Small cards (8 GB or less): a brain that fills most of the card leaves no room for longer chats, so it pays
// extra. On a 6 GB laptop that makes the light Qwen3 4B the Brain and Quick brain, and Gemma 4 E4B the one that
// sees pictures and hears you.
const QUALITY = { bob: 4, deep: 5, tinker: 5, reviewer: 4, eyes: 2, ledger: 1, scout: 2, painter: 1, small: 0 };
export const W = { cover: 2, weight: 6, spill: 10, room: 12, smallCard: 8 };

export function scoreFor(m, slotId, hw = {}) {
  const jobs = (m.jobs || []).length;
  const p = paramsB(m.ollama) || 4;
  const card = hw.vramGB || 0;
  const weight = card ? (m.vramGB || 0) / card : (m.sizeGB || 0) / (hw.ramGB || 16);
  const spill = card && m.vramGB > card ? W.spill : 0;
  const room = card && card <= W.smallCard ? W.room * Math.max(0, weight - 0.7) : 0;
  return W.cover * jobs + (QUALITY[slotId] ?? 1) * Math.log2(p) - W.weight * weight - spill - room;
}

// Bob's pick for a job on this PC: { id, why } or null.
export function pickFor(slotId, models, ctx = {}) {
  const hw = { vramGB: ctx.vramGB, ramGB: ctx.ramGB, freeGB: ctx.freeGB };
  if (BRAIN_SLOTS.includes(slotId)) {
    const able = models.filter((m) => m.jobs?.includes(slotId) && !m.gated);
    const pool = able.filter((m) => suit(m, hw, ctx.platform).level === 'ok');
    if (!pool.length) return null;
    const best = pool.map((m) => ({ m, s: scoreFor(m, slotId, hw) })).sort((a, b) => b.s - a.s)[0].m;
    const n = (best.jobs || []).length;
    const load = best.vramGB ? `${gb(best.vramGB)} of graphics memory` : 'runs on the processor';
    // Won over a model that covers more jobs: it was picked for being light.
    const light = pool.some((m) => (m.jobs || []).length > n);
    return { id: best.id, why: `${light ? 'Light, so it leaves room on your card for longer chats' : n > 1 ? `Covers ${n} jobs, so fewer brain swaps` : 'Made for this job'} · ${load}` };
  }
  const pack = ctx.packs?.length ? packFor(ctx.packs, ctx.vramGB) : null;
  const id = Object.entries(pack?.slots || {}).find(([, slots]) => slots.includes(slotId))?.[0];
  const m = id && models.find((x) => x.id === id);
  if (!m) return null;
  const s = suit(m, hw, ctx.platform);
  if (s.level === 'blocked' || s.ram || (s.level !== 'ok' && !(pack.tick || []).includes(m.id))) return null;
  return { id: m.id, why: `In the starter set for your card${m.vramGB ? ` · ${gb(m.vramGB)} of graphics memory` : ''}` };
}

// Every job a model is Bob's pick for on this PC (for the Get models cards).
export function picksOf(m, models, ctx = {}) {
  return Object.keys(SLOT_NAMES).filter((id) => pickFor(id, models, ctx)?.id === m.id);
}

// Hidden unless "Show models that don't suit this PC" is on: not on this PC, not Bob's pick, and won't run well.
export const unsuited = (m, picks, s) => m.status?.state !== 'installed' && !picks.length && s.level !== 'ok';
