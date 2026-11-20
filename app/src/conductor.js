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

export const conductorOn = (cfg) => cfg?.engineTuning?.mode === 'conductor';

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
export function conductorPlan({ newTok = 0, cachedTok = 0, outTok = 300, cur, chat = CHAT_STEP, speeds, switchS = SWITCH_GUESS_S }) {
  // the read steps tried: 4096 and 6144 (the switch test found 6144 reads fastest even at 32K)
  const bigs = [...new Set([READ_STEP, BIG_STEP, readStepFor(newTok + cachedTok)].filter((s) => s > chat))];
  const r = (s) => speedAt(speeds, 'read', s), w = (s) => speedAt(speeds, 'write', s);
  const time = (rs, ws) => (r(rs) > 0 && w(ws) > 0 ? newTok / r(rs) + outTok / w(ws) : Infinity);
  const stayEst = time(cur, cur);
  const stay = { plan: 'stay', step: cur, est: stayEst, stayEst };
  if (!Number.isFinite(stayEst)) return { ...stay, why: 'no speeds known yet' };
  const options = [];
  if (cur !== chat && newTok < MIN_NEW) options.push({ plan: 'back', step: chat, est: switchS + time(cur, chat) });
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

// in plain words, for the logbook
export function planLine(model, p) {
  const say = { readBig: `reading at step ${p.step}, then writing at the chat step`, big: `reading and writing at step ${p.step}`, back: `back to the chat step ${p.step}` }[p.plan];
  return say ? `${model}: Conductor: ${say} (${p.why})` : '';
}
