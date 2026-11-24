// The Conductor (Settings, Engine tuning, "Let the Conductor drive"; off unless picked): Bob changes his engine's
// reading step for each reply with the brain still loaded, through Brain Engine's POST /context (patches 0035, 0037).
// A long new read (a file, a big paste) is read at a big step, which reads faster, then the step goes back to the
// chat step, which writes faster. The engine empties its chat memory when the step changes, so the reading is saved
// to disk first and put back after (llama-server's slot save and restore); the cells don't depend on the step.
// A switch is only made when the plan beats staying put by at least max(1 s, 10%), and Bob stops switching for a
// brain when switches come out slower than he guessed three times in a row. Anything the engine refuses turns the
// Conductor off for that engine run, and the reply goes ahead as it would have. Levers set by hand always win.

export const CHAT_STEP = 2048;
export const READ_STEP = 4096;
export const BIG_STEP = 6144; // reads at 128K and up
export const BIG_FROM = 131072;
export const MIN_NEW = 4096; // shorter new reads are never worth a switch
// A switch's time grows with what the chat memory holds (saving and putting it back). Measured on a 16 GB card,
// Qwen3.6 35B (Nov 19-20, medians): about 0.9 s at 32K (save 0.31-0.36 + step 0.22-0.24 + put back 0.31-0.34) and
// 2.4 s with 122,880 tokens held (1.15 + 0.32 + 0.97). A brain's own switches then scale this guess (ratio).
export const switchGuess = (held = 0, ratio = 1) => (0.35 + 1.66e-5 * Math.max(0, Number(held) || 0)) * (ratio > 0 ? ratio : 1);
export const SWITCH_GUESS_S = switchGuess(32768);
export const SLOW_TRIES = 3;

// Until a brain's own speeds are known, read and write speeds at a step, as shares of the chat step's. Measured with
// the switch test on a 16 GB card, Qwen3.6 35B at 32K (Nov 19): the same read took 14.7 s at 2048, 10.4 s at 4096 and
// 8.5 s at 6144; writing was about 78 tokens a second at 2048 and 4096 and 75 at 6144.
const READ_SHARE = { 2048: 1, 4096: 1.41, 6144: 1.73 };
const WRITE_SHARE = { 2048: 1, 4096: 1, 6144: 0.96 };

// Nov 24 (the owner asked for it on): the Conductor drives unless another way is picked. A saved "Let Bob pick" or
// "I'll set them myself" still wins. conductorPicked: picked by hand, which also covers the places the default skips.
const TUNE_MODES = ['bob', 'hand', 'conductor'];
export const conductorPicked = (cfg) => cfg?.engineTuning?.mode === 'conductor';
export const conductorOn = (cfg) => (TUNE_MODES.includes(cfg?.engineTuning?.mode) ? cfg.engineTuning.mode : 'conductor') === 'conductor';
// The default needs Brain Engine 43 or newer (the switch without a reload) on a graphics card of its own. Built-in
// graphics (sharedGraphics) waits for its own check on the Legion Go; picking the Conductor there still works.
export const CONDUCTOR_DEFAULT_MIN_BE = 43;
export const conductorDefaultFits = ({ beNo = 0, sharedGraphics = false } = {}) => beNo >= CONDUCTOR_DEFAULT_MIN_BE && !sharedGraphics;
// Nov 24, the laptop check (3060 6 GB, qwen3-4b, 32K, no copy cache): loaded at the read step, its working room spilled
// off the card (5872 MiB peak against 5632) and a 20 s read took 347 s. The owner: GUPPI fits himself to the machine
// he is on, and corrects on the fly. So the Conductor loads at its read step only when the engine sizes the card
// around that step itself (the copy cache fill, Brain Engine 39+); otherwise it loads at the chat step, and from Brain
// Engine 44 steps up for a long read only while the card keeps SPILL_MARGIN_MIB free, stepping straight back down and
// capping that brain's step when a switch leaves less.
export const SPILL_MARGIN_MIB = 512;
export const loadAtReadStep = ({ fills = false } = {}) => fills === true;
// after a step change: the step to fall back to, or 0 when the card still has its margin (free unknown: 0)
export const stepBack = ({ from = 0, to = 0, freeMiB = null } = {}) => (to > from && Number.isFinite(freeMiB) && freeMiB < SPILL_MARGIN_MIB ? from : 0);
// Nov 24: Brain Engine 44 (0087) switches the step in about 0.2 s with the brain kept, so from 44 the Conductor
// switches inside a job again (read big, write at the chat step); before 44 it stays at the step it loaded at.
export const SWITCH_IN_JOB_FROM_BE = 44;

// the step to read a new part at, for a chat this long
export const readStepFor = (totalTokens) => (totalTokens >= BIG_FROM ? BIG_STEP : READ_STEP);

// learned speeds: { read: { step: t/s }, write: { step: t/s } }, kept as a running mean (newest 30%)
export function learnStep(sp, kind, step, tps) {
  const s = sp || { read: {}, write: {} };
  if (!(tps > 0) || !Number.isFinite(tps) || !(step > 0)) return s;
  const old = s[kind]?.[step];
  return { ...s, [kind]: { ...s[kind], [step]: old > 0 ? old * 0.7 + tps * 0.3 : tps } };
}

// a speed at a step: learned, or worked out from another step's learned speed, or 0 when nothing is known
export function speedAt(sp, kind, step) {
  const table = sp?.[kind] || {};
  if (table[step] > 0) return table[step];
  const share = kind === 'read' ? READ_SHARE : WRITE_SHARE;
  const known = Object.entries(table).find(([k, v]) => v > 0 && share[k]);
  if (!known || !share[step]) return 0;
  return (known[1] / share[known[0]]) * share[step];
}

// The plan for one reply. newTok: tokens to read that aren't in the chat memory, cachedTok: those that are, outTok:
// expected reply length, cur: the step now, chat: the brain's chat step, speeds: learned, switchS: seconds a switch
// takes. -> { plan: 'stay' | 'readBig' | 'big' | 'back', step, est, stayEst, why }
//   readBig: switch to the read step, read, switch back to the chat step, write (two switches)
//   big: switch to the read step and stay there for this reply (one switch)
//   back: the step is big and this reply reads little, so go back to the chat step (one switch)
export function conductorPlan({ newTok = 0, cachedTok = 0, outTok = 300, cur, chat = CHAT_STEP, speeds, switchS = SWITCH_GUESS_S, maxStep = 0 }) {
  // the read steps tried: 4096 and 6144 (the switch test found 6144 reads fastest even at 32K); none past maxStep, the
  // biggest step the card's budget was planned for at load (Nov 23: a step past it had no room and spilled)
  const bigs = [...new Set([READ_STEP, BIG_STEP, readStepFor(newTok + cachedTok)].filter((s) => s > chat && !(maxStep > 0 && s > maxStep)))];
  const r = (s) => speedAt(speeds, 'read', s), w = (s) => speedAt(speeds, 'write', s);
  const time = (rs, ws) => (r(rs) > 0 && w(ws) > 0 ? newTok / r(rs) + outTok / w(ws) : Infinity);
  const stayEst = time(cur, cur);
  const stay = { plan: 'stay', step: cur, est: stayEst, stayEst };
  if (!Number.isFinite(stayEst)) return { ...stay, why: 'no speeds known yet' };
  const options = [];
  if (cur !== chat && newTok < MIN_NEW) options.push({ plan: 'back', step: chat, est: switchS + time(cur, chat) });
  // Nov 23: already at a big step (the Conductor loads at one): read here, then one switch down to write
  if (cur > chat && newTok >= MIN_NEW) options.push({ plan: 'readBig', step: cur, est: switchS + newTok / r(cur) + outTok / w(chat) });
  if (newTok >= MIN_NEW) for (const big of bigs) {
    if (big === cur) continue;
    if (cur === chat) options.push({ plan: 'readBig', step: big, est: 2 * switchS + newTok / r(big) + outTok / w(chat) });
    options.push({ plan: 'big', step: big, est: switchS + time(big, big) });
  }
  const best = options.filter((o) => Number.isFinite(o.est)).sort((a, b) => a.est - b.est)[0];
  if (!best || stayEst - best.est < Math.max(1, stayEst * 0.1)) return { ...stay, why: best ? `a switch would save ${Math.max(0, stayEst - best.est).toFixed(1)} s, under the margin` : 'nothing to switch to' };
  return { ...best, stayEst, why: `about ${best.est.toFixed(1)} s instead of ${stayEst.toFixed(1)} s` };
}

// a switch's measured time against the guess: three slower than guessed in a row and Bob stops switching for it
// (ratio: this brain's switches against the size-based guess, kept as a running mean)
export function noteSwitch(st, { seconds, guess, held = 32768 }) {
  const s = st || { switchS: 0, ratio: 0, slow: 0, stopped: false };
  const slower = seconds > Math.max(guess * 1.5, guess + 0.5);
  const slow = slower ? s.slow + 1 : 0;
  const r = seconds / switchGuess(held);
  return { switchS: s.switchS > 0 ? s.switchS * 0.6 + seconds * 0.4 : seconds, ratio: s.ratio > 0 ? s.ratio * 0.6 + r * 0.4 : r, slow, stopped: s.stopped || slow >= SLOW_TRIES };
}

// Nov 20 (the owner's idea, measured on a 16 GB card, Qwen3.6 35B): reading wants the big step and a modest expert copy
// cache, writing wants a bigger cache (a big cache at the big step crowds the card: reading 32K took 16 s with 5 GB and
// 133 s with 6 GB, against 8.4 s with 4 GB). Reading with 2 GB then writing with 6 GB wrote 89.4 tokens a second against
// 82.8, the hit rate 94% against 88%; the switch paid from about 1,500 tokens written at 32K, and at 128K the gain was
// 2%, too little for the switch. So the cache grows for writing only in a chat under CACHE_FLIP_MAX tokens when the reply
// is expected to be long (thinking, coding, writing a file), and only by what the card has free (Brain Engine 0047
// reports it after each change), and shrinks back before the next long read.
export const CACHE_FLIP_MAX = 65536;
export const CACHE_FLIP_MIN_OUT = 1500;
export const CACHE_GROW_MAX = 2048; // MiB
export const CACHE_FREE_KEEP = 768; // MiB left free on the card
// the reply length to expect: thinking replies and code or file writes run long
export const expectOut = ({ think, task } = {}) => (think ? 2500 : /code|edit|write|file/i.test(String(task || '')) ? 1500 : 300);
// how much to grow the cache for writing (MiB, whole 256s), or 0. freeMiB: the card's free memory now (null: unknown)
export function cacheGrow({ total = 0, outTok = 0, cacheMiB = 0, freeMiB = null, grown = 0 }) {
  if (grown > 0 || !(cacheMiB > 0) || !(freeMiB >= 0) || total >= CACHE_FLIP_MAX || outTok < CACHE_FLIP_MIN_OUT) return 0;
  const g = Math.min(CACHE_GROW_MAX, Math.floor((freeMiB - CACHE_FREE_KEEP) / 256) * 256);
  return g >= 512 ? g : 0;
}
// the most free memory left on any card after a change (POST /context's answer with 0047), or null
export const freeFrom = (answer) => { const d = Array.isArray(answer?.devices) ? answer.devices.filter((x) => Number.isFinite(x?.free_mib)) : []; return d.length ? Math.min(...d.map((x) => x.free_mib)) : null; };

// Nov 23 (the owner: "why isn't the Conductor taking over?"): with the Conductor driving and a copy cache on, the cache
// fills the card's free memory at load (Brain Engine 0061). Only from Brain Engine 39: its 0072 measures the reading
// step's working memory first and shrinks the filled cache to leave room for it (on Brain Engine 36 the fill left
// 512 MB, a 16 GB card spilled 1 GB into shared memory on Windows and read prompts at 1,223 t/s against 2,829). The
// answers don't change. A fill set by hand (Engine tuning) wins, 0 included.
export const FILL_FROM_BE = 39;
// Nov 23 (the test PC: the Conductor's switch from the chat step to the read step spilled 308 MB and read at half speed,
// because the fill was sized at the chat step): from Brain Engine 42 the fill is sized for the biggest step the Conductor
// will use (LLAMA_MOE_CACHE_FILL_STEP, patch 0085), so every switch finds room and the cache keeps one size. Before
// that build, no fill next to borrowed reading (0072 didn't check it there).
export const FILL_STEP_FROM_BE = 42;
// Nov 23 (the test PC, BE39, 35B with MTP: the engine stopped on the Conductor's first step switch): before Brain Engine
// 43 (patch 0086) a step switch freed the main context before the MTP draft that still pointed at it. So with the MTP
// draft on an older engine, the Conductor keeps the step it loaded at and doesn't switch.
// Nov 23 (the Legion Go's measured safe range, legion-go/go-safe-range.md): on built-in graphics every byte the engine
// uses comes out of Windows' own memory. There the Conductor loads at the chat step (no big load step, no fill), reads
// at most APU_MAX_STEP, and takes a bigger step only while the free memory left after it stays at or above APU_FLOOR
// (1.5 GB, the Go's "safe" line). APU_STEP_BYTES is the extra working memory a step costs per token, a guess on the
// high side until the Go run measures it.
export const APU_MAX_STEP = 2048;
export const APU_FLOOR = 1.5 * 1024 ** 3;
export const APU_STEP_BYTES = 512 * 1024;
export function apuStepOk({ from = 0, to = 0, freeBytes = 0, perToken = APU_STEP_BYTES } = {}) {
  if (!(to > from)) return true;
  if (to > APU_MAX_STEP) return false;
  return freeBytes - (to - from) * perToken >= APU_FLOOR;
}
export const MTP_SWITCH_FROM_BE = 43;
export function mtpBlocksSwitch(args = [], beNo = 0) {
  const a = Array.isArray(args) ? args : [];
  const mtp = a.some((x, i) => (x === '--spec-type' || x === '--spec-types') && String(a[i + 1] || '').split(',').includes('draft-mtp'));
  return mtp && !(beNo >= MTP_SWITCH_FROM_BE);
}
export function fillEnv({ cacheMiB = 0, beNo = 0, env = {}, step = 0 } = {}) {
  if (!(cacheMiB > 0) || !(beNo >= FILL_FROM_BE) || (env && env.LLAMA_MOE_CACHE_FILL !== undefined && env.LLAMA_MOE_CACHE_FILL !== '')) return {};
  const borrow = env && env.LLAMA_MOE_CACHE_BORROW !== undefined && env.LLAMA_MOE_CACHE_BORROW !== '' && Number(env.LLAMA_MOE_CACHE_BORROW) !== 0;
  if (borrow && beNo < FILL_STEP_FROM_BE) return {};
  return { LLAMA_MOE_CACHE_FILL: '1', ...(step > 0 && beNo >= FILL_STEP_FROM_BE ? { LLAMA_MOE_CACHE_FILL_STEP: String(step) } : {}) };
}
// Nov 23 (the test PC's BE43 gate, 35B with MTP at 32K: 0 MiB free and 670 MB spilled): the MTP draft makes its own
// context after the fill has measured the card, so with MTP on the fill leaves the draft's room as well, sized by the
// step (about 1.2 GB at 4096 on the test PC). A spare set by hand wins.
export const MTP_SPARE_PER_TOKEN_MIB = 0.4375; // Nov 23 gate: 0.3125 (1792 at 4096) still spilled 247 MB with MTP
export function mtpSpareEnv({ env = {}, step = 0 } = {}) {
  if (!env || env.LLAMA_MOE_CACHE_FILL !== '1') return {};
  if (env.LLAMA_MOE_CACHE_FILL_SPARE_MIB !== undefined && env.LLAMA_MOE_CACHE_FILL_SPARE_MIB !== '') return {};
  return { LLAMA_MOE_CACHE_FILL_SPARE_MIB: String(512 + Math.ceil(Math.max(step, 512) * MTP_SPARE_PER_TOKEN_MIB)) };
}
// Nov 23: the Conductor loads at its biggest read step and drops to the chat step after a read (the cheap direction,
// about 1.3 s on the test PC against 15.5 s up), with -b at least that step. Returns the new args.
export function loadAtStep(args, step) {
  const a = [...args];
  const set = (flag, v, atLeast) => { const i = a.lastIndexOf(flag); if (i >= 0) a[i + 1] = String(atLeast ? Math.max(Number(a[i + 1]) || 0, v) : v); else a.push(flag, String(v)); };
  set('-ub', step, false); set('-b', step, true);
  return a;
}

// in plain words, for the logbook
export function planLine(model, p) {
  const say = { readBig: `reading at step ${p.step}, then writing at the chat step`, big: `reading and writing at step ${p.step}`, back: `back to the chat step ${p.step}` }[p.plan];
  return say ? `${model}: Conductor: ${say} (${p.why})` : '';
}

// Nov 21, the window lever (Engine tuning, Conductor, off unless switched on; Avalon's idea, github freriadoc/Avalon,
// MIT): a brain loads with chat memory for its whole context, but a chat rarely fills it. The window is cut to the chat
// plus the longest reply it may write, in steps of 16K, and the chat memory that frees goes to the expert copy cache,
// which writes faster the bigger it is. When the chat outgrows the window, the window grows back (and the cache
// shrinks) before the reply: the same context change as a step switch, the reading kept.
export const WIN_STEP = 16384;
export const WIN_MIN = 16384;
export const WIN_MARGIN = 4096; // tokens on top of the chat and the reply (chat template, tools, a guess on the low side)
export const fitWindowOn = (cfg) => conductorOn(cfg) && cfg?.engineTuning?.fitWindow === true;
// the window for a chat of `total` tokens that may write `reply` more, never over the brain's own `full` context
export function fitWindow({ full = 0, total = 0, reply = 0 }) {
  if (!(full > 0)) return 0;
  const need = Math.max(0, total) + Math.max(0, reply) + WIN_MARGIN;
  return Math.min(full, Math.max(WIN_MIN, Math.ceil(need / WIN_STEP) * WIN_STEP));
}
// the window to switch to: a bigger one whenever the chat needs it, a smaller one only when it at least halves the
// window (a new, short chat), so a chat that grows a little doesn't switch back and forth; `cur` when nothing changes
export function nextWindow({ cur = 0, want = 0 }) {
  if (!(want > 0)) return cur;
  if (!(cur > 0) || want > cur) return want;
  return want <= cur / 2 ? want : cur;
}
// what the copy cache gains from a window: the chat memory it frees, whole 256 MiB pieces
export const windowCacheMiB = (kvFullBytes, kvWinBytes) => Math.max(0, Math.floor((Number(kvFullBytes) - Number(kvWinBytes)) / 2 ** 20 / 256) * 256) || 0;
