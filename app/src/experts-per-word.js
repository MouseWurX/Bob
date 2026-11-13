// Experts per word (Brain Engine 0013). A mixture-of-experts brain asks a set number of its experts for every word
// (gpt-oss 4, Qwen3 MoE 8). Brain Engine can change that number while the brain stays loaded: one count for every
// layer, or one per layer. Off unless set: nothing is sent for a brain with no count, so it runs as it was made.
// The brain file never changes; a count of null (or the brain's own) puts it back exactly.
//
// Saved per brain in settings as llamacpp.expertsPerWord[model] = N | [N per layer] | null.
// Sent to the running engine with POST /experts-per-word {"used": N | [..] | null} before the brain's next answer.

export const NO_PER_WORD = 'This engine can\'t change experts per word while a brain is loaded. Update Brain Engine under Settings, Engines, then try again.';
const MAX_EXPERTS = 1024; // the most any brain has (Brain Engine's own limit)
const MAX_LAYERS = 512;

// A count as typed or saved: a whole number, a list (one per layer, empty or 0 = the brain's own), or text such as
// "6" or "6,6,4,4". Returns null (the brain's own), a number, or an array. Throws a plain sentence when it's wrong.
export function cleanPerWord(v, { experts = MAX_EXPERTS, layers = 0 } = {}) {
  if (v === null || v === undefined || v === '' || v === 0) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    if (!/^[\d\s,]+$/.test(t)) throw new Error('Experts per word is a whole number, or one per layer with commas (for example 6,6,4,4).');
    const parts = t.split(/[\s,]+/).filter(Boolean).map(Number);
    v = parts.length === 1 ? parts[0] : parts;
  }
  const one = (n) => {
    if (n === null || n === 0) return 0;
    if (!Number.isInteger(n) || n < 0 || n > experts) throw new Error(`Experts per word goes from 1 to ${experts}${experts < MAX_EXPERTS ? ', the experts this brain has in a layer' : ''}.`);
    return n;
  };
  if (Array.isArray(v)) {
    if (!v.length || v.length > MAX_LAYERS) throw new Error('That list of experts per word is empty or too long.');
    if (layers && v.length !== layers) throw new Error(`That list has ${v.length} counts, this brain has ${layers} layers. Give one count, or one per layer.`);
    const list = v.map(one);
    if (list.every((n) => n === 0)) return null;
    return list.every((n) => n === list[0]) ? list[0] : list;
  }
  return one(v) || null;
}

// The saved count for one brain, or null. Never throws: a bad saved value counts as none.
export function perWordFor(lc, model) {
  try { return cleanPerWord(lc?.expertsPerWord?.[model] ?? null); } catch { return null; }
}

// Settings' llamacpp.expertsPerWord: brain name -> count. Names as for modelArgs; a bad count is dropped.
export function cleanPerWordMap(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (!/^[\w.:/-]{1,100}$/.test(k)) continue;
    try { out[k] = cleanPerWord(v); } catch {}
  }
  return out;
}

// In words, for Settings, the Lab and the logbook.
export function perWordWords(v, own) {
  if (v === null || v === undefined) return own ? `the brain's own ${own}` : 'the brain\'s own';
  if (Array.isArray(v)) return `${v.map((n) => n || own || 'own').join(', ')} (one per layer)`;
  return String(v);
}

// A rough guess of the speed change for writing, from the brain's shape: the share of the weights read for each word
// that are experts (about 0.7 for gpt-oss and Qwen3 MoE) scales with the count. Writing is mostly reading weights, so
// time follows the weights read. Prompt reading is hit less. It is a guess; the Lab measures the real thing.
export function speedGuess(own, n, { expertShare = 0.7 } = {}) {
  if (!own || !n) return null;
  const avg = Array.isArray(n) ? n.reduce((a, x) => a + (x || own), 0) / n.length : n;
  const time = (1 - expertShare) + expertShare * (avg / own);
  return Math.round((1 / time - 1) * 100); // + faster, - slower, in percent
}
export function speedGuessWords(own, n, opts) {
  const g = speedGuess(own, n, opts);
  if (g === null || g === 0) return '';
  return g > 0 ? `about ${g}% faster at writing (a guess)` : `about ${-g}% slower at writing (a guess)`;
}

// Send a count to a running engine. A 404 means an engine without 0013. Returns the engine's answer:
// { n_layer, n_expert, n_expert_used, own: [..], used: [..], live }.
export async function sendPerWord(url, v, { fetchFn = fetch, timeoutMs = 30000 } = {}) {
  const res = await fetchFn(url + '/experts-per-word', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ used: v ?? null }), signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 404) throw Object.assign(new Error(NO_PER_WORD), { old: true });
  if (!res.ok) {
    let why = ''; try { why = (await res.json())?.error?.message || ''; } catch {}
    throw new Error(`Brain Engine wouldn't change experts per word${why ? `: ${String(why).slice(0, 200)}` : '.'}`);
  }
  return res.json();
}
