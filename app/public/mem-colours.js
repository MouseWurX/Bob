// 1.5.44: colours for the Now running bars. Each bar splits into Bob's part and everything else (blue), and Bob's
// part is green, yellow or red for how quick he should be right now, with the reason in words (never colour alone).
// Pure functions, so they can be tested; the numbers all come from readings Now running already has.

export const LEVELS = { quick: 'quick', slower: 'slower', slow: 'slow' };
// One-line fixes for yellow and red.
const SPILL_FIX = 'Pick a smaller brain or a shorter context (Settings, Brains), or close apps that use the graphics card.';
const CPU_FIX = 'Expected in the Gaming and Art sessions. Switch the session to Normal to put his brain back on the card.';
const worst = (a, b) => (['quick', 'slower', 'slow'].indexOf(b.level) > ['quick', 'slower', 'slow'].indexOf(a.level) ? b : a);

// The chat brain: where it sits. onCard share 1 = all on the graphics card.
export function brainPlace(st) {
  const m = (st?.models || []).find((x) => x.chat) || st?.models?.[0];
  if (!m) return null;
  if (m.ramGB == null) return { onCardShare: m.onCard ? 1 : 0, cpu: !m.onCard };
  const all = (m.gb || 0) + (m.ramGB || 0);
  return { onCardShare: all ? (m.gb || 0) / all : 1, cpu: !(m.gb > 0) };
}

// Graphics card bar.
export function cardLevel({ usedGB, totalGB }, place) {
  let out = { level: 'quick', why: place && !place.cpu ? 'his brain fits on the graphics card' : 'nothing slows him down here' };
  if (place && !place.cpu && place.onCardShare < 0.98) out = worst(out, place.onCardShare >= 0.85 ? { level: 'slower', why: 'part of his brain didn\'t fit on the card and sits in RAM', fix: SPILL_FIX } : { level: 'slow', why: 'much of his brain didn\'t fit on the card and sits in RAM', fix: SPILL_FIX });
  if (totalGB && usedGB / totalGB >= 0.95) out = worst(out, { level: 'slower', why: 'the card is nearly full, so a bigger brain or a picture may not fit', fix: 'Close games or other apps that use the graphics card.' });
  return out;
}

// RAM bar.
export function ramLevel({ usedGB, totalGB }, place) {
  let out = { level: 'quick', why: 'there is plenty of RAM' };
  if (place && !place.cpu && place.onCardShare < 0.98) out = worst(out, place.onCardShare >= 0.85 ? { level: 'slower', why: 'part of his brain sits in RAM', fix: SPILL_FIX } : { level: 'slow', why: 'much of his brain sits in RAM', fix: SPILL_FIX });
  const f = totalGB ? usedGB / totalGB : 0;
  if (f >= 0.95) out = worst(out, { level: 'slow', why: 'RAM is nearly full, so Windows starts using the disk', fix: 'Close apps you aren\'t using, such as browser tabs.' });
  else if (f >= 0.85) out = worst(out, { level: 'slower', why: 'RAM is getting full', fix: 'Close apps you aren\'t using, such as browser tabs.' });
  return out;
}

// Processor bar.
export function cpuLevel(loadPct, place) {
  let out = { level: 'quick', why: place?.cpu ? '' : 'his brain runs on the graphics card' };
  if (place?.cpu) out = { level: 'slower', why: 'his brain runs on the processor, which is slower than the graphics card', fix: CPU_FIX };
  if (loadPct >= 90) out = worst(out, place?.cpu ? { level: 'slow', why: 'his brain runs on the processor and the processor is very busy', fix: 'Close busy apps, or switch the session to Normal when you are done gaming.' } : { level: 'slower', why: 'the processor is very busy', fix: 'Close apps that are keeping the processor busy.' });
  if (!out.why) out.why = 'the processor has room to spare';
  return out;
}

// Bob's share of the processor: his app (measured), plus, while his brain is working on the processor, the load
// above what the PC used while he was quiet (an estimate, so it is shown as "about").
export function cpuShare({ loadPct, appPct }, { working, place, baseline }) {
  const app = appPct || 0;
  if (!(working && place?.cpu) || loadPct == null) return { bob: Math.min(loadPct ?? 0, Math.round(app)), about: false };
  const bob = Math.max(app, loadPct - (baseline ?? 5));
  return { bob: Math.round(Math.min(loadPct, bob)), about: true };
}

// The quiet-time load: the middle of the readings taken while Bob wasn't working.
export function quietBaseline(samples) {
  const q = samples.filter((s) => !s.working && s.cpu != null).map((s) => s.cpu).sort((a, b) => a - b);
  return q.length ? q[Math.floor(q.length / 2)] : null;
}
