// 100 The engine's memory type per brain (the Brains page, Set up). Shared by the page and the engine (src/engine-extras.js).
// The chat memory (KV cache) sits beside the brain on the card and grows with the chat. Standard is what Bob always
// used (8-bit). Sharper keeps it at full 16-bit: twice the memory, a touch more exact on long code. Smaller keeps it
// in 4-bit: about half, so a longer chat fits, a little less exact. Smallest (Nov 19, Lamplight patch 0038) keeps it
// in 3-bit: about two fifths, only on a Lamplight that has the 3-bit type (q3_0), never offered otherwise.
// Progressive (Nov 20, Lamplight patch 0039, the owner's idea) keeps every word in 3-bit and the newest words again
// sharper, reading each word from its sharpest copy. 3-step: 8-bit for the newest 8K, then 4-bit for the newest 64K
// (both shrink to fit a shorter chat); 2-step: 4-bit for the newest 64K. The 32K figures count each copy plus 4K of room
// for a batch (3-step at 32K: 8K + 16K windows; 2-step: 16K; 8+3 and 8+4: 2K). Only with an engine that has both.
export const MEM_TYPES = {
  standard: { name: 'Standard', k: 'q8_0', v: 'q8_0', share: 1, about: 'What I use unless you pick.' },
  sharp: { name: 'Sharper', k: 'f16', v: 'f16', share: 2, about: 'Twice the chat memory. Best for short chats and exact code.' },
  small: { name: 'Smaller', k: 'q4_0', v: 'q4_0', share: 0.5, about: 'About half the chat memory, so long chats fit. A little less exact.' },
  smallest: { name: 'Smallest', k: 'q3_0', v: 'q3_0', share: 14 / 34, needsQ3: true, about: 'About two fifths, for the longest chats. Less exact than Smaller; only with a Lamplight that has it.' },
  progressive: { name: 'Progressive 3-step', k: 'q3_0', v: 'q3_0', share: 14 / 34 + 12288 / 32768 + (20480 / 32768) * (18 / 34), needsQ3: true, needsTiers: true, about: 'The newest words at 8-bit, then 4-bit, the rest 3-bit. Much smaller than Standard on long chats, nearly as exact; only with a Lamplight that has it.' },
  progressive2: { name: 'Progressive 2-step', k: 'q3_0', v: 'q3_0', share: 14 / 34 + (20480 / 32768) * (18 / 34), needsQ3: true, needsTiers: true, about: 'The newest words at 4-bit, the rest 3-bit. About the room of Smaller on long chats; only with a Lamplight that has it.' },
  progressive83: { name: 'Progressive 8+3', k: 'q3_0', v: 'q3_0', share: 14 / 34 + 6144 / 32768, needsQ3: true, needsTiers: true, about: 'The newest 2K words at 8-bit, the rest 3-bit, no 4-bit step. The 8-bit copy is a small fixed extra, so it takes more than Smaller up to about 50K and less past it. Measured on a 16 GB card: between Smaller and Smallest in exactness, about 5% slower than Smaller at 128K; only with a Lamplight that has it.' },
  progressive84: { name: 'Progressive 8+4', k: 'q4_0', v: 'q4_0', share: 18 / 34 + 6144 / 32768, needsTiers: true, about: 'The newest 2K words at 8-bit, the rest 4-bit. Always a little more than Smaller (a fixed extra for the 8-bit copy), the 8-bit copy makes recent words more exact than flat 4-bit. Measured on a 16 GB card: more exact than Smaller, about 12% slower at 128K; only with a Lamplight that has it.' },
  progressive82: { name: 'Progressive 8+2', k: 'q2_kv', v: 'q2_kv', share: 10 / 34 + 12288 / 32768, needsQ3: true, needsTiers: true, turboOnly: true, about: 'Turbo only, a test: the newest 8K words at 8-bit, the rest 2-bit. The least room past about 50K (below that the 8-bit copy makes it bigger than Smaller), and the least exact on what was said long ago; only with a Lamplight that has it.' }
};
// What the page shows: the chat memory for a 32K chat with each type, from the Standard figure (null: not known).
// Smallest only when the engine has the 3-bit type (q3); Progressive only when it also has Progressive Memory (tiers).
// Turbo-only types (8+2) are never offered here.
export function memTypeTrade(standardGB, { q3 = false, tiers = false } = {}) {
  const g = Number(standardGB);
  return Object.entries(MEM_TYPES).filter(([, t]) => !t.turboOnly && (q3 || !t.needsQ3) && (tiers || !t.needsTiers)).map(([id, t]) => ({ id, name: t.name, about: t.about, gb: g > 0 ? Math.round(g * t.share * 10) / 10 : null }));
}
