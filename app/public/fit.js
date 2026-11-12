// Which models suit this PC, and which jobs (Brains page jobs) each model can do. Pure functions, no DOM,
// so the tests can run them. Three separate answers, never mixed up:
//   canDo:  can this model do that job at all? If not, it isn't listed for that job anywhere.
//   suit:   does it run well on this PC (graphics card, RAM, disk)? ok, slow, no or blocked, with a plain reason.
//   pickFor: which model is Bob's pick for that job on this PC? (scored for brains; the starter set otherwise)
import { placeFor } from './place.js';
import { gb } from './util.js';

export const SLOT_NAMES = { bob: 'Brain', small: 'Quick brain', gaming: 'Gaming', deep: 'Deep thinking', tinker: 'Coding', reviewer: 'Review', eyes: 'Seeing pictures', embed: 'Memory (finding past chats)', voice: 'Hearing you', speech: 'Voice', image: 'Painter', edit: 'Picture editor', video: 'Video', music: 'Music', sfx: 'Sound effects', ledger: 'Spreadsheets', scout: 'Research', painter: 'Prompt writer', office: 'Office', phone: 'Phone' };
export const BRAIN_SLOTS = ['bob', 'small', 'gaming', 'deep', 'tinker', 'reviewer', 'office', 'eyes', 'ledger', 'scout', 'painter'];
// 1.5.56: the owner's rule: the Gaming brain is only ever Qwen3 4B Instruct 2507 (catalog id qwen3-4b), timed on a
// busy processor. Gemma 4 E4B never runs during a game. Only catalog entries with the "gaming" job go in that slot.
const isE4b = (...names) => names.some((n) => /e4b/i.test(String(n || '')));

// The starter set for this PC's graphics card.
// 1.5.71: graphics built into the processor (shared memory) get the set made for them; cards are picked by size.
// ARM boards (a Raspberry Pi 5 and the like) get the sets made for them, picked by how much memory the board has;
// those sets never show up for a PC or a Mac.
export const packsFor = (packs = [], arm = false) => packs.filter((p) => Boolean(p.arm) === Boolean(arm));
export const packFor = (packs, vramGB, integrated = false, { arm = false, ramGB = 0 } = {}) => {
  if (arm) { const a = packsFor(packs, true); if (a.length) return a.find((p) => (ramGB || 0) >= p.minRamGB) || a.at(-1); }
  const pc = packsFor(packs, false);
  return (integrated && pc.find((p) => p.integrated)) || pc.filter((p) => !p.integrated).find((p) => (vramGB || 0) >= p.minVramGB) || pc.filter((p) => !p.integrated).at(-1);
};

// Billions of parameters from a model name (gemma4:e4b, qwen3-coder:30b, gpt-oss:20b), or null.
export function paramsB(name) {
  const m = String(name || '').toLowerCase().match(/(?:^|[:\-_ ])e?(\d+(?:\.\d+)?)b(?![a-z0-9])/);
  return m ? Number(m[1]) : null;
}

// Can this model do this job? Models in Bob's list say so themselves (catalog "jobs"). Others are judged by what
// their engine reports (Ollama: completion, vision, tools, thinking, embedding), then by their name.
export function canDo(slotId, { entry, name, caps } = {}) {
  if (slotId === 'gaming') return Boolean(entry?.jobs?.includes('gaming')) && !isE4b(name, entry?.id, entry?.ollama);
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
    case 'office': return !known || c.includes('tools'); // Office does everything with Bob's tools
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
  if (m.needs && platform && !engineRunsOn(m.needs, platform)) return { level: 'blocked', why: `${m.needs} doesn't run on ${platform === 'darwin' ? 'a Mac' : 'this replicant matrix'} yet.` };
  const v = hw.vramGB;
  // 1.5.64: a squeezed (Q3) brain is only for small cards. On a bigger card the full (Q4 or better) version runs.
  if (m.maxCardGB && v > m.maxCardGB) return { level: 'no', squeezed: true, why: `Made for cards of ${m.maxCardGB} GB or less. Your card runs the full version, which is sharper.` };
  // A brain bigger than the card keeps the rest in RAM. Too much for the RAM, and it won't run well at all.
  if (m.ollama && v && hw.ramGB && m.vramGB > v) {
    const spill = Math.ceil(m.vramGB - v);
    if (spill > hw.ramGB / 2) return { level: 'no', ram: true, why: `About ${spill} GB of it won't fit on your graphics card, and your ${hw.ramGB} GB of RAM can't spare that much.` };
  }
  if (!m.vramGB) return { level: 'ok' };
  // An ARM board (Raspberry Pi 5) has no card and little memory: a brain needs room in it beside the system.
  if (!v && hw.arm && hw.ramGB && m.vramGB > hw.ramGB * 0.6) return { level: 'no', why: `Wants about ${m.vramGB} GB of memory; this replicant matrix has ${hw.ramGB} GB. It probably won't run well.` };
  if (!v) return m.vramGB > 8 ? { level: 'slow', why: 'No graphics card found, so a model this big is very slow on the processor.' } : { level: 'ok' };
  if (m.vramGB <= v) return { level: 'ok', fits: true };
  if (m.vramGB <= v * 1.5) return { level: 'slow', why: `Wants ${m.vramGB} GB of graphics memory; your card has ${v} GB. It runs, but slowly.` };
  return { level: 'no', why: `Wants ${m.vramGB} GB of graphics memory; your card has ${v} GB. It probably won't run well.` };
}

// 1.5.137: the rooms of your other Bobs: each one's graphics card and memory, as he said in his Bob-Net hello
// ([{ name, vramGB, ramGB }]). roomOn = the first of them a brain runs well on, or ''.
export function roomOn(m, rooms = []) {
  return (rooms || []).find((r) => suit(m, r).level === 'ok')?.name || '';
}
// A brain too big for this replicant matrix and for every Bob on the Bob-Net: the catalogue leaves it out of the job
// lists and Rented brains lists it instead (the owner: "if there isn't a pc big enough to handle it in the bob-net it
// should only be listed in the brain rentals section"). Only "won't run well" counts (not slow, not a squeezed file
// meant for smaller cards), and never for a brain already here, half downloaded, or one of your own.
export function tooBigEverywhere(m, hw = {}, rooms = [], platform = '') {
  if (!m?.jobs || !m.vramGB || m.own || m.status?.state === 'installed' || m.status?.state === 'partial') return false;
  const here = suit(m, { vramGB: hw.vramGB, ramGB: hw.ramGB, arm: hw.arm }, platform);
  if (here.level !== 'no' || here.squeezed) return false;
  // 1.5.205: the card alone no longer decides. A brain that runs with the rest in memory, or (made of experts) partly
  // read from the drive, or with another Bob lending a hand, stays in the list and says how it runs (place.js).
  if (hw.ramGB && placeFor(m, hw, rooms).where !== 'rent') return false;
  return !(rooms || []).some((r) => { const s = suit(m, r); return s.level !== 'no' || s.squeezed; });
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
const QUALITY = { bob: 4, deep: 5, tinker: 5, reviewer: 4, office: 3, eyes: 2, ledger: 1, scout: 2, painter: 1, small: 0, gaming: 0 };
export const W = { cover: 2, weight: 6, spill: 10, room: 12, smallCard: 8 };

// 1.5.56: jobs that save swaps in everyday use. The session brains (Gaming, Office) and the phone don't count, so
// listing a small brain for them doesn't push it ahead of brains that do more on the PC.
const NOT_COVER = new Set(['gaming', 'office', 'phone']);
export const coverJobs = (m) => (m.jobs || []).filter((j) => !NOT_COVER.has(j));
export function scoreFor(m, slotId, hw = {}) {
  const jobs = coverJobs(m).length;
  const p = m.params || paramsB(m.ollama) || 4;
  const card = hw.vramGB || 0;
  const weight = card ? (m.vramGB || 0) / card : (m.sizeGB || 0) / (hw.ramGB || 16);
  const spill = card && m.vramGB > card ? W.spill : 0;
  const room = card && card <= W.smallCard ? W.room * Math.max(0, weight - 0.7) : 0;
  return W.cover * jobs + (QUALITY[slotId] ?? 1) * Math.log2(p) - W.weight * weight - spill - room;
}

// 1.5.64, the owner's rule: never below Q4, except on small cards. A squeezed (Q3) version only takes part when
// its full version wouldn't run well on this PC.
export function fullRunsHere(m, models, hw = {}, platform = '') {
  const full = m.squeezedOf && models.find((x) => x.id === m.squeezedOf);
  return Boolean(full) && suit(full, hw, platform).level === 'ok';
}

// Bob's pick for a job on this PC: { id, why } or null.
export function pickFor(slotId, models, ctx = {}) {
  const hw = { vramGB: ctx.vramGB, ramGB: ctx.ramGB, freeGB: ctx.freeGB, arm: ctx.arm };
  // On an ARM board the picks are the board's starter set (Qwen3.5 2B or Gemma 4 E2B), not the scored brains.
  if (BRAIN_SLOTS.includes(slotId) && !ctx.arm) {
    // 1.5.56: new brains (trial: true) are listed but not recommended until they've been tried on a real PC.
    // 1.5.133: a naughty (uncensored) brain is never the pick among the well-behaved ones; on the naughty list's own side
    // (ctx.naughtyPick) the pick is made among naughty brains only, and shown as Bob's quiet pick (a red devil).
    const able = models.filter((m) => canDo(slotId, { entry: m }) && !m.gated && !m.trial && (m.naughty === true) === (ctx.naughtyPick === true) && !fullRunsHere(m, models, hw, ctx.platform));
    const pool = able.filter((m) => suit(m, hw, ctx.platform).level === 'ok');
    if (!pool.length) return null;
    // 1.5.169: Bob's own default brains (Riker, Bobert): catalog bobPick lists the jobs each is the default for. Where
    // one suits this replicant matrix well, it's the pick for those jobs ahead of the scored brains.
    const own = pool.filter((m) => Array.isArray(m.bobPick) && m.bobPick.includes(slotId));
    const best = (own.length ? own : pool).map((m) => ({ m, s: scoreFor(m, slotId, hw) })).sort((a, b) => b.s - a.s)[0].m;
    const n = coverJobs(best).length;
    const load = best.vramGB ? `${gb(best.vramGB)} of graphics memory` : 'runs on the processor';
    if (own.length) return { id: best.id, why: `Bob's own brain, made and benchmarked for this job · ${load}` };
    // Won over a model that covers more jobs: it was picked for being light.
    const light = pool.some((m) => coverJobs(m).length > n);
    return { id: best.id, why: `${light ? 'Light, so it leaves room on your card for longer chats' : n > 1 ? `Covers ${n} jobs, so fewer brain swaps` : 'Made for this job'} · ${load}` };
  }
  const pack = ctx.packs?.length ? packFor(ctx.packs, ctx.vramGB, ctx.integrated, { arm: ctx.arm, ramGB: ctx.ramGB }) : null;
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

// ---- 1.5.56: how a model would do on other machines, for the Brain catalogue ----
// Fixed example machines, so the catalogue can say "fits an 8 GB card" without that machine being here.
export const DEVICES = [
  { id: 'big', label: '16 GB graphics card', vramGB: 16, ramGB: 32 },
  { id: 'mid', label: '8 GB graphics card', vramGB: 8, ramGB: 16 },
  { id: 'small', label: '6 GB laptop card', vramGB: 6, ramGB: 16 },
  { id: 'cpu', label: 'No graphics card', vramGB: 0, ramGB: 16 }
];
const WORD = { ok: 'Runs well', slow: 'Runs, slowly', no: "Won't run well", blocked: "Can't install" };
export function deviceFit(m) {
  const rows = DEVICES.map((d) => { const s = suit({ ...m, status: { state: 'installed' } }, d); return { id: d.id, label: d.label, level: s.level, word: s.squeezed ? 'Uses the full version' : WORD[s.level] || s.level }; });
  if (m.jobs?.includes('phone') || m.phoneFit) rows.push({ id: 'phone', label: 'Phone (8 GB)', level: 'ok', word: m.phoneFit || 'Fits the phone app' });
  else if ((m.jobs || []).length) rows.push({ id: 'phone', label: 'Phone (8 GB)', level: 'no', word: 'Too big for a phone' });
  return rows;
}

// Where a catalog model comes from, as a page a person can open: the exact Hugging Face commit, or Ollama's page.
export function sourceOf(m) {
  const f = (m.files || []).find((x) => /^https:\/\/huggingface\.co\//.test(x.url || ''));
  const hit = f && f.url.match(/^https:\/\/huggingface\.co\/([\w.-]+\/[\w.-]+)\/resolve\/([0-9a-f]{40})\//);
  if (hit) return { url: `https://huggingface.co/${hit[1]}/tree/${hit[2]}`, label: `${hit[1]} @ ${hit[2].slice(0, 7)}` };
  const ms = (m.files || []).map((x) => String(x.url || '').match(/^https:\/\/modelscope\.cn\/models\/([\w.-]+\/[\w.-]+)\/resolve\/([0-9a-f]{40})\//)).find(Boolean);
  if (ms) return { url: `https://modelscope.cn/models/${ms[1]}`, label: `ModelScope: ${ms[1]} @ ${ms[2].slice(0, 7)}` };
  if (m.ollama) { const name = m.ollama.split(':')[0]; return { url: `https://ollama.com/library/${encodeURIComponent(name)}`, label: `Ollama: ${m.ollama}` }; }
  return null;
}
