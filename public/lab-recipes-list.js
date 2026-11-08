// 1.5.153 Cut recipes (bob-design/blend-and-cut-recipes.md section 3): pick a goal and the device it's for, and the
// Lab's five steps are filled in for you: how small, which skills to protect most, which running file, and what the
// rented part (teaching it back) would cost. One list for the Lab page and the server (src/lab-recipes.js), so it
// works offline. A recipe never runs on its own: it fills the steps, and the owner presses Start.

// Skills a recipe protects at 99%. Both naming styles are listed: the Lab's lesson skills (src/lab-skills.js) and the
// Forge's skill sets, plus the Lab quiz's parts for brains measured with the usage map. Only the ones the lessons or
// the usage map actually have are used.
export const RECIPES = [
  {
    id: 'everything', title: 'Everything, smaller', for: 'The next size down for the device you pick, with every skill kept as evenly as it can be.',
    protect: ['tools', 'coding', 'codefix', 'formats', 'Picking the right tool', 'Coding', 'Following instructions'], cover: 0.95,
    heal: 'Bob\'s whole lesson set, 70% the teacher\'s odds and 30% the words.',
    help: 'Every skill keeps 95% of the work it does, and tools, coding and exact formats keep 99%. It\'s how Bob\'s own brains are cut.'
  },
  {
    id: 'coding', title: 'Coding helper', for: 'A brain for writing, fixing and explaining code.',
    protect: ['coding', 'codefix', 'tools', 'formats', 'thinking', 'Coding', 'Picking the right tool', 'Following instructions'], cover: 0.95,
    heal: 'Leans on the coding and run-and-fix lessons, with thinking on.',
    help: 'Protects coding, fixing code from an error, tools, exact formats and thinking it through at 99%.'
  },
  {
    id: 'chat', title: 'Everyday chat', for: 'Talk, writing help, advice and help about Bob.',
    protect: ['chat', 'writing', 'help', 'refuse', 'refusals', 'memory', 'languages', 'General knowledge'], cover: 0.95,
    heal: 'Leans on the chat, writing and help lessons.',
    help: 'Protects chat, writing, remembering notes, other languages and saying no politely at 99%.'
  },
  {
    id: 'game', title: 'Game master', for: 'Adventure mode, games and stories.',
    protect: ['game', 'gamemaster', 'chat', 'writing'], cover: 0.95,
    heal: 'Leans on the game master lessons, thinking off.',
    help: 'Protects running a game and chat at 99%.'
  },
  {
    id: 'tiny', title: 'Tiny and fast', for: 'Phones, a Raspberry Pi and small cards.', tiny: true,
    protect: ['tools', 'chat', 'Picking the right tool'], cover: 0.9,
    heal: 'Bob\'s whole lesson set. Small brains need the teaching back most.',
    help: 'Keeps 90% of each skill\'s work and 99% for tools and chat, takes out sight and hearing, and makes a Q3 file for devices with 8 GB or less. General knowledge goes first at this size.'
  },
  {
    id: 'garfield', title: 'Fold instead of drop (Garfield)', for: 'Small sizes that lose too much when experts are dropped.', later: true,
    protect: [], cover: 0.95, heal: '', help: 'Folds each rarely used expert into the kept expert most like it, instead of dropping it, then teaches it back. Needs a rented card. Not built yet.'
  },
  {
    id: 'measure', title: 'Just measure', for: 'No cut: see which experts this brain uses for what.', measureOnly: true,
    protect: [], cover: 0.95, heal: '', help: 'Opens the usage map below. Nothing is cut and nothing is made.'
  }
];
export const recipeById = (id) => RECIPES.find((r) => r.id === id) || null;

// Devices a recipe can aim at. gb = the most a brain file should take there (memory left for the conversation and
// the rest of the computer). q3: Q3 is allowed (8 GB or less, the Q4-or-better rule).
export const DEVICES = [
  { id: 'here', label: 'This replicant matrix', here: true },
  { id: 'card24', label: 'A 24 GB card', gb: 22 },
  { id: 'card16', label: 'A 16 GB card', gb: 14.5 },
  { id: 'handheld16', label: 'A 16 GB handheld (memory shared with the screen)', gb: 10 },
  { id: 'card12', label: 'A 12 GB card', gb: 10.5 },
  { id: 'card8', label: 'An 8 GB card', gb: 6.5, q3: true },
  { id: 'card6', label: 'A 6 GB card', gb: 4.8, q3: true },
  { id: 'phone12', label: 'A phone with 12 GB', gb: 5, q3: true },
  { id: 'phone8', label: 'A phone with 8 GB', gb: 3.4, q3: true }
];
export const deviceById = (id) => DEVICES.find((d) => d.id === id) || DEVICES[0];
// This replicant matrix: its card, less room for the conversation; no card known, assume 16 GB.
export function deviceBudget(d, cardGB = 0) {
  if (!d.here) return { gb: d.gb, q3: Boolean(d.q3) };
  const c = Number(cardGB) || 16;
  return { gb: Math.max(2, c - 1.5), q3: c <= 8 };
}

// Size of a running file from a full-size (F16/BF16) brain, as a share of the full-size file.
export const TYPE_SHARE = { Q4_K_M: 0.3, Q3_K_M: 0.25 };
const EXPERT_SHARE = 0.9; // how much of a mixture-of-experts file the experts are (the Lab's cutSizes uses the same)

// How many experts per layer fit the device. facts = the brain's facts (experts, used, sizeGB, fullSize, fileType).
// Returns { keep, gb, type, whole, tooBig } : keep 0 = no cut needed (it fits whole), tooBig = even the smallest cut
// doesn't fit.
export function sizeFor(facts = {}, budget = { gb: 14.5, q3: false }, { tiny = false } = {}) {
  const type = facts.fullSize ? (budget.q3 && (tiny || budget.gb < 8) ? 'Q3_K_M' : 'Q4_K_M') : '';
  const share = type ? TYPE_SHARE[type] : 1;
  const S = Number(facts.sizeGB) || 0, E = Number(facts.experts) || 0, used = Number(facts.used) || 1;
  const at = (n) => Math.round(S * share * (1 - EXPERT_SHARE + (EXPERT_SHARE * n) / (E || 1)) * 10) / 10;
  if (!E) { const gb = Math.round(S * share * 10) / 10; return { keep: 0, gb, type, whole: gb <= budget.gb, tooBig: gb > budget.gb }; }
  if (at(E) <= budget.gb) return { keep: 0, gb: at(E), type, whole: true, tooBig: false };
  const raw = ((budget.gb / (S * share || 1) - (1 - EXPERT_SHARE)) / EXPERT_SHARE) * E;
  let n = Math.floor(raw / 8) * 8;
  if (n >= E) n = E - 8;
  if (n < used) return { keep: used, gb: at(used), type, whole: false, tooBig: true };
  return { keep: n, gb: at(n), type, whole: false, tooBig: false };
}
