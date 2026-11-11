// Where a brain would live on this replicant matrix: the answer the Brains page and the catalogue show beside every
// brain, in place of "fits / doesn't suit". Pure functions, no DOM, so the tests can run them. Nothing here loads or
// moves a brain; it only says what would happen. Five answers, from fastest to "not at home":
//   card            all of it on the graphics card
//   memory          card + memory: the rest sits in RAM (or all of it in RAM when there is no card)
//   storage         card + memory + storage: bigger than both together, so part is read from the drive as needed.
//                   Only for brains made of experts (most of the file is asleep for any one word).
//   help            fits once another Bob on the Bob-Net lends his card or memory (experimental)
//   rent            too big for home
import { gb } from './util.js';

export const PLACES = ['card', 'memory', 'storage', 'help', 'rent'];
export const PLACE_WORDS = { card: 'On your card', memory: 'Card + memory', storage: 'Card + memory + storage', help: 'With another Bob\'s help', rent: 'Too big for home' };
// With no graphics card (or one pool of memory, as on a Mac) the same answers read a little differently.
export const placeWord = (where, hw = {}) => (where === 'card' && hw.unified ? 'In memory' : where === 'memory' && !hw.vramGB ? 'In memory, on the processor' : where === 'storage' && !hw.vramGB ? 'Memory + storage' : PLACE_WORDS[where] || '');

// How hard the file is squeezed, from its file name (Q4_K_M, Q3_K_M, Q8_0, MXFP4, F16...), or '' when it doesn't say.
const QUANT_RE = /(?:^|[-_.])((?:UD-)?I?Q\d(?:_[A-Z0-9]+)*|MXFP\d|BF16|F16|F32|FP8)(?=[-_.]|$)/i;
export function quantOf(m) {
  if (m?.quant) return String(m.quant);
  const f = (m?.files || []).find((x) => x.role === 'gguf' || /\.gguf$/i.test(x.url || '')) || null;
  const name = String(f?.url || m?.ownFile || '').split(/[\\/]/).pop();
  const hit = name.match(QUANT_RE);
  return hit ? hit[1].toUpperCase().replace(/^UD-/, '') : '';
}

// A brain made of experts (only a few of them work on each word). Says so itself (experts: true / false, or
// activeParams), otherwise by the "A3B" in its file name ("35B-A3B": 3B active) or the gpt-oss family.
export function hasExperts(m) {
  if (typeof m?.experts === 'boolean') return m.experts;
  if (m?.activeParams) return true;
  const names = [m?.id, m?.name, m?.rentAs, ...(m?.files || []).map((f) => f.url)].join(' ');
  return /\d+(?:\.\d+)?B-A\d+(?:\.\d+)?B\b/i.test(names) || /gpt-oss/i.test(names);
}

// Room kept back: the card for the chat's memory and the screen, RAM for the system and everything else running.
export const ROOM = { cardKeep: 1, ramShare: 0.8, ramKeep: 4, chatGB: 2, storageTimes: 1.75 };
const ramFor = (ramGB) => Math.max(0, Math.min((ramGB || 0) * ROOM.ramShare, (ramGB || 0) - ROOM.ramKeep));
const cardFor = (vramGB) => Math.max(0, (vramGB || 0) - ROOM.cardKeep);
// What the brain needs loaded: its file plus room for the chat.
export const needGB = (m) => (m?.sizeGB || m?.vramGB || 0) + ROOM.chatGB;

// hw: { vramGB, ramGB, unified }. rooms: the other Bobs' [{ name, vramGB, ramGB }] (only when sharing is on).
// -> { where, word, cardGB, memGB, storageGB, why, helper? }: the split Auto would start from, in GB of the file.
export function placeFor(m, hw = {}, rooms = []) {
  const size = m?.sizeGB || m?.vramGB || 0;
  const need = needGB(m);
  const card = hw.unified ? 0 : cardFor(hw.vramGB);
  const ram = hw.unified ? cardFor(hw.vramGB || hw.ramGB) : ramFor(hw.ramGB);
  const out = (where, extra = {}) => ({ where, word: placeWord(where, hw), cardGB: 0, memGB: 0, storageGB: 0, why: '', ...extra });
  const r1 = (n) => Math.round(n * 10) / 10;
  // The catalogue's own figure for the card (it counts the chat's memory) decides "on the card", as before.
  if (!hw.unified && hw.vramGB && (m?.vramGB || need) <= hw.vramGB) return out('card', { cardGB: size });
  if (hw.unified && need <= ram) return out('card', { memGB: size });
  if (!hw.unified && need <= card + ram) {
    const onCard = r1(Math.min(size, Math.max(0, card - ROOM.chatGB)));
    return out('memory', { cardGB: onCard, memGB: r1(size - onCard), why: hw.vramGB ? `${gb(onCard)} on the card, the rest in memory. Slower than a brain that fits the card.` : 'No graphics card, so it runs on the processor.' });
  }
  if (hasExperts(m) && need <= (card + ram) * ROOM.storageTimes) {
    const onCard = r1(Math.min(size, Math.max(0, card - ROOM.chatGB)));
    const inMem = r1(Math.min(size - onCard, ram));
    return out('storage', { cardGB: onCard, memGB: inMem, storageGB: r1(size - onCard - inMem), why: 'Bigger than your card and memory together, so part of it is read from the drive when needed. Wants a fast drive.' });
  }
  // A helper's card counts in full, his memory by half (it is the slow end of a network link). A brain made of experts
  // may still lean on the drive as well.
  const stretch = hasExperts(m) ? ROOM.storageTimes : 1;
  const helper = (rooms || []).find((r) => need <= (card + ram + cardFor(r.vramGB) + ramFor(r.ramGB) * 0.5) * stretch);
  if (helper) return out('help', { helper: helper.name || '', why: `Fits with ${helper.name || 'another Bob'} lending a hand. Experimental.` });
  return out('rent', { why: hasExperts(m) || !size ? 'Too big for this replicant matrix. A rented card can run it.' : 'Too big for this replicant matrix: every part of this brain works on every word, so it can\'t be read from the drive.' });
}

// One short line for a row: "63 GB · MXFP4".
export const sizeLine = (m) => [m?.sizeGB != null ? gb(m.sizeGB) : '', quantOf(m)].filter(Boolean).join(' · ');
