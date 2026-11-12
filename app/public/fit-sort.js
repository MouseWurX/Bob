// 1.5.210 How each model fits THIS machine, as one short badge, and the Brain catalogue's "Best fit first" order.
// Pure functions, no DOM, so the tests can run them. Nothing here is about one computer or one person: every answer
// comes from the machine Bob reads at start (graphics card, memory, Mac-style shared memory, no card at all), and the
// other Bobs on the Bob-Net that said hello with their own card and memory. Nothing loads or downloads.
//
// A brain is judged the way the Brains page places it (place.js), so the catalogue and the Brains page never disagree:
//   card      all of it on the graphics card                       (the "Fits your card" badge)
//   memory    card + memory: the rest sits in RAM                  (slower)
//   storage   card + memory + storage: part read from the drive    (only brains made of experts)
//   help      fits with another Bob on the Bob-Net lending a hand   (experimental)
//   rent      too big for home
// Pictures, video, voices and the rest are judged by suit() (fit.js): fits the card, runs slowly, or doesn't suit.
import { suit } from './fit.js';
import { placeFor, placeWord } from './place.js';

export const FIT_RANK = { card: 0, memory: 1, storage: 2, help: 3, slow: 1, rent: 4, no: 4, squeezed: 5, blocked: 6 };
export const isBrainEntry = (m) => Boolean(m?.jobs) && ['chat', 'coding', 'vision'].includes(m.category);

// The badge's words for "all of it fits" on this kind of machine.
const fitsWord = (hw) => (hw.unified ? 'Fits in memory' : hw.integrated ? 'Fits your replicant matrix' : hw.vramGB ? 'Fits your card' : 'Runs on the processor');

// hw: { vramGB, ramGB, freeGB, unified, integrated, arm }. rooms: the other Bobs' [{ name, vramGB, ramGB }].
// -> { where, rank, word, why, good } or null when this machine hasn't been read yet (no badge rather than a guess).
export function fitOf(m, hw = {}, rooms = [], platform = '') {
  if (!m || (!hw.vramGB && !hw.ramGB)) return null;
  const s = suit(m, hw, platform);
  if (s.level === 'blocked') return { where: 'blocked', rank: FIT_RANK.blocked, word: 'Can\'t install here', why: s.why, good: false };
  if (s.squeezed) return { where: 'squeezed', rank: FIT_RANK.squeezed, word: 'Made for smaller cards', why: s.why, good: false };
  if (isBrainEntry(m) && hw.ramGB) {
    const p = placeFor(m, hw, rooms);
    const word = p.where === 'card' ? fitsWord(hw) : p.where === 'help' ? `With ${p.helper || 'another Bob'}'s help` : placeWord(p.where, hw);
    return { where: p.where, rank: FIT_RANK[p.where], word, why: p.why || (p.where === 'card' ? 'All of it sits on the graphics card, the quickest place.' : ''), good: p.where === 'card' };
  }
  if (s.level === 'ok') return { where: 'card', rank: FIT_RANK.card, word: fitsWord(hw), why: '', good: true };
  if (s.level === 'slow') return { where: 'slow', rank: FIT_RANK.slow, word: 'Runs, slowly', why: s.why, good: false };
  return { where: 'no', rank: FIT_RANK.no, word: 'Doesn\'t suit this replicant matrix', why: s.why, good: false };
}

// Best fit first: the quickest place first (card, then card + memory, then + storage, then with help), and inside
// each place the biggest first, since a bigger brain that still sits there is the stronger one. Ties keep the list's
// own order. Machines that haven't been read yet keep the list as it is.
export function byFit(list = [], hw = {}, rooms = [], platform = '') {
  const keyed = list.map((m, i) => ({ m, i, f: fitOf(m, hw, rooms, platform) }));
  if (keyed.every((k) => !k.f)) return [...list];
  return keyed.sort((a, b) => (a.f?.rank ?? 9) - (b.f?.rank ?? 9) || (b.m.sizeGB || 0) - (a.m.sizeGB || 0) || a.i - b.i).map((k) => k.m);
}

export const SORTS = [
  { id: 'pick', label: '★ My pick first', about: 'My pick for each job first, then what is here, then what fits, grouped by family.' },
  { id: 'fit', label: 'Best fit first', about: 'One list per job: what fits your card first, then card + memory, then + storage, then with another Bob\'s help. Biggest first inside each.' }
];
export const SORT_KEY = 'bob-cat-sort';
export const sortOf = (saved) => (saved === 'fit' ? 'fit' : 'pick');
