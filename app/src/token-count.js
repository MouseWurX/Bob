// How many characters make one token, per brain, learned from the engine's own count (item 3, Nov 11).
// Bob used to guess every chat at 3 characters a token. That's close for English prose, but code, file paths and
// French or Spanish run nearer 2, so the chat overflowed the brain's memory, and plain prose runs nearer 4, so tool
// results were cut that would have fit. llama-server counts the prompt it read on every reply (its timings), so each
// reply teaches Bob the real figure for that brain. Pure functions; nothing here starts a program or reads a file.
export const DEFAULT_PER = 3;
export const MIN_PER = 1.5, MAX_PER = 6;
// Fewer prompt tokens than this teach nothing (the chat template's own words weigh too much).
export const MIN_TOKENS = 200;

// The characters Bob sends in one request, counted the way fitContext counts them.
export function promptChars(messages = [], tools = null) {
  let n = 0;
  for (const m of messages || []) {
    n += String(m?.content ?? '').length;
    if (m?.tool_calls) n += JSON.stringify(m.tool_calls).length;
  }
  if (tools && (!Array.isArray(tools) || tools.length)) n += JSON.stringify(tools).length;
  return n;
}

// The new figure after one reply: kept between MIN_PER and MAX_PER, and blended with the old one so one odd reply
// (a picture, a reply that was mostly the chat template) doesn't swing it.
export function learnPer(old, chars, tokens) {
  if (!(Number(tokens) >= MIN_TOKENS) || !(Number(chars) > 0)) return old || null;
  const r = Math.min(MAX_PER, Math.max(MIN_PER, chars / tokens));
  const prev = Number(old) > 0 ? Number(old) : null;
  return Math.round((prev ? prev * 0.7 + r * 0.3 : r) * 100) / 100;
}

// The figure to use for a brain: what was learned, else the old guess.
export const perFor = (table, model) => (table && Number(table[model]) > 0 ? Number(table[model]) : DEFAULT_PER);
