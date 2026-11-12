// 100 The engine's memory type per brain (the Brains page, Set up). Shared by the page and the engine (src/engine-extras.js).
// The chat memory (KV cache) sits beside the brain on the card and grows with the chat. Standard is what Bob always
// used (8-bit). Sharper keeps it at full 16-bit: twice the memory, a touch more exact on long code. Smaller keeps it
// in 4-bit: about half, so a longer chat fits, a little less exact.
export const MEM_TYPES = {
  standard: { name: 'Standard', k: 'q8_0', v: 'q8_0', share: 1, about: 'What I use unless you pick.' },
  sharp: { name: 'Sharper', k: 'f16', v: 'f16', share: 2, about: 'Twice the chat memory. Best for short chats and exact code.' },
  small: { name: 'Smaller', k: 'q4_0', v: 'q4_0', share: 0.5, about: 'About half the chat memory, so long chats fit. A little less exact.' }
};
// What the page shows: the chat memory for a 32K chat with each type, from the Standard figure (null: not known).
export function memTypeTrade(standardGB) {
  const g = Number(standardGB);
  return Object.entries(MEM_TYPES).map(([id, t]) => ({ id, name: t.name, about: t.about, gb: g > 0 ? Math.round(g * t.share * 10) / 10 : null }));
}
