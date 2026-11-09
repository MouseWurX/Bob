// 1.5.16x The long-context lab's sums (thinking-paths.md sec 15.2), shared by the page (so the memory meter moves as
// the slider moves, with no round trip) and the server (so "Use this in Bob" and the tests use the same numbers).
// The chat memory (the key-value cache) grows with every token: per token it costs the brain's own shape (read from
// its file, src/gguf.js) times the number size the cache is kept in. Same formula as src/model-ctx.js kvBytes.

export const GiB = 1024 ** 3;
// Cache squeeze: how small the numbers in the chat memory are kept. Bob itself uses half (q8_0).
export const SQUEEZE = [
  { id: 'full', label: 'Full', type: 'f16', bytes: 2, hint: 'Every number kept whole. The most memory, the sharpest recall.' },
  { id: 'half', label: 'Half', type: 'q8_0', bytes: 34 / 32, hint: 'What Bob uses. About half the memory, and in practice no worse.' },
  { id: 'quarter', label: 'Quarter', type: 'q4_0', bytes: 18 / 32, hint: 'About a quarter of the memory. Long chats fit, but recall of small details can slip.' }
];
export const squeezeOf = (id) => SQUEEZE.find((s) => s.id === id) || SQUEEZE[1];
// Working room a brain needs on top of its file and chat memory (src/model-ctx.js WORK_BYTES).
export const WORK = 1.5 * GiB;
// The slider's stops, and the speed-and-needle ladder's sizes.
export const STOPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];
export const LENGTHS = [1024, 4096, 16384, 32768, 65536, 131072];
export const STRETCH = [1, 2, 4]; // YaRN factors; the guide's own example stops at 4x
export const kLabel = (v) => (v >= 1048576 && v % 1048576 === 0 ? `${v / 1048576}M` : v >= 1024 ? `${Math.round(v / 1024)}K` : String(v));
const gb = (b) => Math.round((b / GiB) * 10) / 10;

// Room the system keeps for itself (src/model-ctx.js roomBytes): 3 GB on a 16 GB machine or less, else 6 GB.
export const ramRoom = (ram) => Math.max(0, ram - (ram <= 16 * GiB ? 3 : 6) * GiB);

// The meter at one size: what the brain, its chat memory and working room take, and where that leaves it.
// where: 'card' (all on the graphics card), 'spill' (some in RAM: it runs, slower), 'no' (doesn't fit at all).
export function meter({ fileBytes, perToken, ctx, squeeze = 'half', cardBytes = 0, ramBytes = 0 }) {
  const kv = perToken > 0 ? perToken * ctx * squeezeOf(squeeze).bytes : 0;
  const total = fileBytes + kv + WORK;
  const where = cardBytes && total <= cardBytes ? 'card' : total <= cardBytes + ramRoom(ramBytes) ? 'spill' : 'no';
  return { ctx, kvGB: gb(kv), brainGB: gb(fileBytes), workGB: gb(WORK), totalGB: gb(total), cardGB: gb(cardBytes), leftGB: gb(Math.max(0, cardBytes - total)), where };
}

// The biggest stop that keeps everything on the card, and the biggest that fits at all (0: not even the smallest).
export function fitLines({ fileBytes, perToken, max, squeeze, cardBytes, ramBytes }) {
  const stops = STOPS.filter((s) => !max || s <= max);
  let card = 0, all = 0;
  for (const s of stops) { const m = meter({ fileBytes, perToken, ctx: s, squeeze, cardBytes, ramBytes }); if (m.where === 'card') card = s; if (m.where !== 'no') all = s; }
  return { card, all };
}

// "With this brain, how long a chat can I have before it spills?" in one line. A token is about three quarters of a
// word; a page is about 500 words.
export const wordsFor = (tokens) => Math.round((tokens * 0.75) / 100) * 100;
export function fitsAnswer({ name, fileBytes, perToken, max, squeeze = 'half', cardBytes, ramBytes }) {
  if (!(perToken > 0)) return { card: 0, all: 0, line: `Bob couldn't read ${name}'s shape from its file, so he can't work this out for it.` };
  const f = fitLines({ fileBytes, perToken, max, squeeze, cardBytes, ramBytes });
  const pages = (t) => Math.max(1, Math.round(wordsFor(t) / 500));
  let line;
  if (!f.all) line = `${name} doesn't fit on this replicant matrix even with a short chat.`;
  else if (!cardBytes) line = `${name} can hold about ${kLabel(f.all)} tokens here (about ${wordsFor(f.all).toLocaleString('en')} words, ${pages(f.all)} pages) before it runs out of memory.`;
  else if (!f.card) line = `${name} is bigger than the graphics card, so part of it always runs from RAM. It can still hold about ${kLabel(f.all)} tokens (about ${wordsFor(f.all).toLocaleString('en')} words) before it runs out of memory.`;
  else line = `${name} keeps a chat of about ${kLabel(f.card)} tokens (about ${wordsFor(f.card).toLocaleString('en')} words, ${pages(f.card)} pages) on the graphics card.${f.all > f.card ? ` Past that it spills into RAM and slows down; it can go to about ${kLabel(f.all)} before it runs out.` : ''}`;
  return { ...f, line };
}

// Sizes for the speed-and-needle ladder: up to what the brain was made for, times the stretch. Past that, greyed.
export function ladderSizes(max, stretch = 1) {
  const top = (Number(max) || 32768) * (STRETCH.includes(stretch) ? stretch : 1);
  return LENGTHS.map((n) => ({ n, label: kLabel(n), ok: n <= top, past: Boolean(max) && n > max }));
}

// What gets forgotten: given each turn's size in tokens (oldest first), the window, and room kept for the answer,
// the first turn that still fits when the newest are kept.
export function keptFrom(turnTokens, windowTokens, reserve = 300) {
  let used = reserve;
  for (let i = turnTokens.length - 1; i >= 0; i--) { used += turnTokens[i]; if (used > windowTokens) return i + 1; }
  return 0;
}
