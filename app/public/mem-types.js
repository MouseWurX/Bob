// 100 The engine's memory type per brain (the Brains page, Set up). Shared by the page and the engine (src/engine-extras.js).
// The chat memory (KV cache) sits beside the brain on the card and grows with the chat. Standard is what Bob always
// used (8-bit). Sharper keeps it at full 16-bit: twice the memory, a touch more exact on long code. Smaller keeps it
// in 4-bit: about half, so a longer chat fits, a little less exact. Smallest (Nov 19, Brain Engine patch 0038) keeps it
// in 3-bit: about two fifths, only on a Brain Engine that has the 3-bit type (q3_0), never offered otherwise.
// Progressive (Nov 20, Brain Engine patch 0039, the owner's idea) keeps every word in 3-bit and the newest words again
// sharper (8-bit for the newest 8K, 4-bit for the newest 64K on long chats), reading each word from its sharpest copy.
// Its 32K figure counts the 8-bit copy of the newest 8K plus 4K of room for a batch. Only with an engine that has both.
export const MEM_TYPES = {
  standard: { name: 'Standard', k: 'q8_0', v: 'q8_0', share: 1, about: 'What I use unless you pick.' },
  sharp: { name: 'Sharper', k: 'f16', v: 'f16', share: 2, about: 'Twice the chat memory. Best for short chats and exact code.' },
  small: { name: 'Smaller', k: 'q4_0', v: 'q4_0', share: 0.5, about: 'About half the chat memory, so long chats fit. A little less exact.' },
  smallest: { name: 'Smallest', k: 'q3_0', v: 'q3_0', share: 14 / 34, needsQ3: true, about: 'About two fifths, for the longest chats. Less exact than Smaller; only with a Brain Engine that has it.' },
  progressive: { name: 'Progressive', k: 'q3_0', v: 'q3_0', share: 14 / 34 + 12288 / 32768, needsQ3: true, needsTiers: true, about: 'The newest words kept sharp, older ones packed tight. Smaller than Standard on long chats, nearly as exact; only with a Brain Engine that has it.' }
};
// What the page shows: the chat memory for a 32K chat with each type, from the Standard figure (null: not known).
// Smallest only when the engine has the 3-bit type (q3); Progressive only when it also has Progressive Memory (tiers).
export function memTypeTrade(standardGB, { q3 = false, tiers = false } = {}) {
  const g = Number(standardGB);
  return Object.entries(MEM_TYPES).filter(([, t]) => (q3 || !t.needsQ3) && ((q3 && tiers) || !t.needsTiers)).map(([id, t]) => ({ id, name: t.name, about: t.about, gb: g > 0 ? Math.round(g * t.share * 10) / 10 : null }));
}
