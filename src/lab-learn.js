// 1.5.151 Computer Science Lab, part 3: the Learn tab. Guided experiments on the brain Bob has loaded right now, so
// there is nothing to download and no Lab job: what is a token, how Bob picks the next word, what temperature does.
// Each one is a short call to Bob's own llama-server (/tokenize, /completion with n_probs). Nothing is saved.
// Needs Bob's built-in engine (llama.cpp): Ollama has no tokenizer or odds endpoints, so the cards say so and stop there.

export const TOKEN_START = 'Bob\'s favourite cheese is Wensleydale, obviously.';
export const WORD_START = 'The best thing about living by the sea is';
export const MAX_TEXT = 2000; // characters a card will send
export const TOP_N = 10;
export const TRIES = 3; // continuations the temperature card writes side by side
export const TRY_WORDS = 20; // tokens in each

// The cards, in the order they show. Help and the tests read this list.
export const LEARN_CARDS = [
  { id: 'tokens', title: 'What is a token?' },
  { id: 'next', title: 'How do I pick the next word?' },
  { id: 'temperature', title: 'What does temperature do?' }
];

const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const text = (v, max = MAX_TEXT) => String(typeof v === 'string' ? v : '').slice(0, max);

// What a card may ask for. Everything else in the body is dropped.
export function cleanLearn(b = {}) {
  return {
    text: text(b.text),
    temperature: num(b.temperature, 0, 2, 0.8),
    minP: num(b.minP, 0, 0.5, 0),
    topP: num(b.topP, 0.5, 1, 1),
    seed: Number.isInteger(b.seed) ? Math.abs(b.seed) % 2147483647 : -1
  };
}

// Which brain the cards can use right now, or why not. `brain` is Bob's brain (src/brain.js); only its engine is read.
export function learnBrain(brain) {
  const engine = brain?.engine;
  if (brain?.cfg?.engine !== 'llamacpp' || !engine?.url) return { ready: false, why: 'These experiments need my built-in engine (llama.cpp). Switch to it in Get models, Engines, and I can show you.' };
  const loaded = engine.current && engine.child && engine.child.exitCode === null;
  if (!loaded) return { ready: false, why: 'No brain is loaded right now. Say anything to me in the chat, and come back.', wake: true };
  let busy = false;
  try { busy = Boolean(engine.isBusy?.()); } catch {}
  if (busy) return { ready: false, why: 'I\'m answering in the chat. Try again when I\'m done.', busy: true };
  return { ready: true, url: engine.url, model: engine.current, ctx: engine.currentCtx || engine.lc?.ctx || 0 };
}

const post = async (url, body, { fetch: f = globalThis.fetch, signal } = {}) => {
  const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal || AbortSignal.timeout(120000) });
  if (!res.ok) { let why = ''; try { why = (await res.json())?.error?.message || ''; } catch {} throw new Error(why || `My engine said ${res.status}.`); }
  return res.json();
};

// A token piece as llama-server gives it: a string, or a list of bytes when the piece is only part of a character.
const pieceText = (p) => {
  if (typeof p === 'string') return { text: p, partial: false };
  if (Array.isArray(p)) return { text: Buffer.from(p).toString('utf8'), partial: true };
  return { text: '', partial: false };
};

// POST /tokenize with_pieces: the text split into the brain's tokens, each with its number and its piece of text.
export async function tokenize(url, input, opts = {}) {
  const content = text(input);
  if (!content.trim()) return { tokens: [], characters: 0 };
  const j = await post(`${url}/tokenize`, { content, with_pieces: true }, opts);
  let tokens = (j.tokens || []).map((t) => (typeof t === 'number' ? { id: t, text: '', partial: false, noPiece: true } : { id: t.id, ...pieceText(t.piece) }));
  // An older engine gives numbers only: ask it for each piece (short texts, so it is quick).
  if (tokens.some((t) => t.noPiece)) tokens = await Promise.all(tokens.map(async (t) => ({ id: t.id, text: (await post(`${url}/detokenize`, { tokens: [t.id] }, opts)).content || '', partial: false })));
  return { tokens, characters: [...content].length };
}

// One step of /completion with n_probs. Returns the token the brain picked and the top candidates with their odds (0 to 1).
// `post` = true asks for the odds after the samplers (temperature, min_p, top_p) have reshaped them, which is what the
// temperature card wants to show; false gives the brain's own raw odds, for the next-word card.
export async function nextWords(url, input, { temperature = 1, minP = 0, topP = 1, n = TOP_N, post: after = false, seed = -1, fetch: f, signal } = {}) {
  const prompt = text(input);
  const j = await post(`${url}/completion`, {
    prompt, n_predict: 1, n_probs: n, temperature, min_p: minP, top_p: topP, top_k: 0, seed, cache_prompt: true,
    post_sampling_probs: after, samplers: ['top_k', 'top_p', 'min_p', 'temperature']
  }, { fetch: f, signal });
  const step = (j.completion_probabilities || [])[0] || {};
  const odds = (x) => (typeof x.prob === 'number' ? x.prob : typeof x.logprob === 'number' ? Math.exp(x.logprob) : 0);
  const list = step.top_probs || step.top_logprobs || step.probs || [];
  const top = list.map((x) => ({ token: x.token ?? x.tok_str ?? '', odds: odds(x) })).filter((x) => x.token !== '').sort((a, b) => b.odds - a.odds).slice(0, n);
  return { picked: j.content || step.token || step.content || '', top };
}

// The temperature card: TRIES short continuations of the same start, one after another (Bob's server may have one slot),
// each with a different seed so they can differ, and the reshaped odds for the first token at that setting.
export async function tryTemperature(url, input, { temperature = 0.8, minP = 0, topP = 1, count = TRIES, words = TRY_WORDS, fetch: f, signal } = {}) {
  const prompt = text(input);
  const tries = [];
  for (let i = 0; i < count; i++) {
    const t0 = Date.now();
    const j = await post(`${url}/completion`, { prompt, n_predict: words, temperature, min_p: minP, top_p: topP, top_k: 0, seed: 1000 + i, cache_prompt: true, samplers: ['top_k', 'top_p', 'min_p', 'temperature'] }, { fetch: f, signal });
    tries.push({ text: j.content || '', seconds: Math.round((Date.now() - t0) / 100) / 10 });
  }
  const { top } = await nextWords(url, prompt, { temperature, minP, topP, post: true, fetch: f, signal });
  return { tries, top };
}

// Run a card's request against Bob's loaded brain, counting as use of the brain so Keep Bob light does not let it go
// mid-experiment. `kind` is tokens, next or try.
export async function runLearn(brain, kind, body, opts = {}) {
  const b = learnBrain(brain);
  if (!b.ready) throw new Error(b.why);
  const q = cleanLearn(body);
  const engine = brain.engine;
  engine.active = (engine.active || 0) + 1;
  try {
    if (kind === 'tokens') return await tokenize(b.url, q.text, opts);
    if (kind === 'next') return await nextWords(b.url, q.text, { ...opts, temperature: 1, post: false, seed: q.seed });
    if (kind === 'try') return await tryTemperature(b.url, q.text, { ...opts, temperature: q.temperature, minP: q.minP, topP: q.topP });
    throw new Error('I don\'t know that experiment.');
  } finally { engine.active--; try { engine.lastUse = engine.now(); } catch {} }
}

// Bob's one-line "what you just saw" for each card, from the numbers. Kept here so the page and the tests share them.
export function sawTokens({ tokens, characters }) {
  if (!tokens.length) return '';
  const per = characters / tokens.length;
  const odd = tokens.some((t) => t.partial);
  if (odd) return 'Some of those pieces are only part of a character. Emoji and other alphabets are built from several pieces each, so they cost more of my memory than the same length of English.';
  if (per >= 4.5) return 'I don\'t read letters or words. I read pieces, and ordinary English words often fit in one piece each, so this was cheap.';
  return 'I don\'t read letters or words. I read pieces, about three quarters of a word each in English and fewer in other languages, which is why they cost more of my memory.';
}
export function sawNext(top) {
  const best = top[0]?.odds || 0;
  if (best >= 0.6) return 'Here I was nearly sure: one word had most of the odds. Every word I write is a roll of weighted dice, and this roll was loaded.';
  if (best < 0.15) return 'Here it was a toss-up: no word had much of the odds. Every word I write is a roll of weighted dice, and this time the dice were fair.';
  return 'Every word I write is a roll of weighted dice. The weights come from everything I read while I was trained. Nothing is looked up.';
}
export function sawTemperature(t) {
  if (t < 0.3) return 'This low, I pick the likeliest word every time, so the three answers are the same or nearly. Good for facts and code.';
  if (t <= 1.0) return 'This is where I usually sit: mostly the likely words, with a little room to vary.';
  if (t <= 1.5) return 'Up here the odds are flattened, so I wander. Good for brainstorming, less good for getting things right.';
  return 'This high I\'m picking unlikely words on purpose. It falls apart, which is fun once.';
}
