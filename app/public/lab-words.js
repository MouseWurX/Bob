// Lab item 109: hover (or tap, or Tab to) a Lab word for a one-line meaning. Off unless "Show word meanings" is on
// (My Lab tab). Each word is marked the first time it shows on a page, never inside buttons, menus, boxes or code.
// The same words are in Help's glossary, longer.
export const LAB_WORDS = {
  expert: 'One of the many small sub-networks in a mixture-of-experts brain. Only a few work on each word.',
  experts: 'The small sub-networks in a mixture-of-experts brain. Only a few work on each word.',
  'mixture of experts': 'A brain split into many experts, with a router picking a few for each word. Big, but quick.',
  router: 'The part of a mixture-of-experts brain that picks which experts work on each word.',
  quant: 'Short for quantization: storing the weights with fewer bits so the brain is smaller and faster.',
  quantization: 'Storing the weights with fewer bits (Q8, Q4, Q3) so the brain is smaller and faster, and a little less sharp.',
  LoRA: 'A small add-on of extra weights that teaches a brain something new without changing the brain itself.',
  QLoRA: 'LoRA taught on a squeezed (4-bit) copy of the brain, so it fits on a smaller card.',
  GGUF: 'The file a running brain lives in: weights plus the facts the engine needs.',
  perplexity: 'How surprised a brain is by real text. Lower is better.',
  imatrix: 'An importance matrix: a note of which weights matter most, so squeezing spares them.',
  'KV cache': 'The brain\'s working memory of the chat so far. Longer chats need more of it.',
  context: 'How much text the brain can see at once: the chat, files and instructions together.',
  temperature: 'How adventurous the brain is when it picks the next word. 0 picks the likeliest every time.',
  distillation: 'Teaching a small brain from a bigger brain\'s answers or odds.',
  'fine-tuning': 'Teaching a brain more after it was made, from lessons.',
  abliteration: 'Taking out the direction in a brain that makes it refuse by reflex.',
  heal: 'A short teaching pass after a cut or squeeze, to mend what it broke.',
  harmony: 'GPT-OSS\'s chat layout: each message says who wrote it and whether it is thinking, a tool call or the answer.',
  'lesson set': 'A file of example chats a brain learns from (lessons.jsonl).',
  judge: 'A brain that scores other brains\' answers.',
  Elo: 'A rating from wins and losses, like chess. Beating a stronger brain moves you more.',
  merge: 'Making one brain from two by blending their weights.',
  weights: 'The numbers a brain is made of. Billions of them.',
  token: 'A piece of a word. Brains read and write in tokens.',
  speculative: 'Speculative decoding: a small brain guesses ahead and the big one checks the guesses in one go.'
};
const SKIP = 'button, select, option, textarea, input, code, pre, a, script, style, .lab-word, [contenteditable], .lab-tabs, h1, h2, h3, h4, legend, summary, caption, th';
const RXG = new RegExp(`\\b(${Object.keys(LAB_WORDS).sort((a, b) => b.length - a.length).map((w) => w.replace(/[-]/g, '\\-').replace(/ /g, '\\s')).join('|')})\\b`, 'gi');
const meaningOf = (w) => LAB_WORDS[Object.keys(LAB_WORDS).find((k) => k.toLowerCase() === w.toLowerCase().replace(/\s+/g, ' '))] || '';

// Mark the first time each word shows inside `root`. Returns how many were marked. Safe to call again.
export function markWords(root, doc = root?.ownerDocument || globalThis.document) {
  if (!root || !doc?.createTreeWalker) return 0;
  const done = new Set([...root.querySelectorAll('.lab-word')].map((x) => x.dataset.word));
  const walker = doc.createTreeWalker(root, 4 /* text */);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim() || n.parentElement?.closest(SKIP)) continue;
    const hits = [];
    for (const m of n.nodeValue.matchAll(RXG)) { const key = m[1].toLowerCase().replace(/\s+/g, ' '); if (done.has(key)) continue; done.add(key); hits.push({ at: m.index, word: m[1], key }); }
    if (hits.length) nodes.push([n, hits]);
  }
  let count = 0;
  for (const [n, hits] of nodes) {
    for (const h of hits.reverse()) { // from the end, so earlier places stay where they were
      const w = n.splitText(h.at); w.splitText(h.word.length);
      const s = doc.createElement('span');
      s.className = 'lab-word'; s.tabIndex = 0; s.dataset.word = h.key;
      s.dataset.mean = meaningOf(h.word); s.title = s.dataset.mean; s.setAttribute('aria-label', `${h.word}: ${s.dataset.mean}`);
      s.textContent = w.nodeValue; w.replaceWith(s); count++;
    }
  }
  return count;
}
// Keep marking as the Lab redraws. Returns a function that stops it.
export function watchWords(root, on = () => false) {
  if (!root || typeof MutationObserver === 'undefined') return () => {};
  let busy = false;
  const run = () => { if (busy || !on()) return; busy = true; try { markWords(root); } finally { busy = false; } };
  const mo = new MutationObserver(() => { if (!busy) queueMicrotask(run); });
  mo.observe(root, { childList: true, subtree: true });
  run();
  return () => mo.disconnect();
}
