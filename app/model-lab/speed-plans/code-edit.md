Here is a JavaScript file from our app:

```js
// Engine and speed extras (list items 94 to 100). Every switch here is off until the owner turns it on, in Settings,
// Brains and speed. Each one is a small pure function, so the tests pass the computer in as a fake.
//   copyGuess    94  Guess-ahead from the chat: the engine copies words that already sit in the chat (n-gram lookup)
//   preloadNext  95  Preload the next brain: read the next brain's file into memory while the first still talks
//   speedLog     96  Speed history (speed-log.js)
//   newCardTest  97  Test a new card by itself: a one-minute speed test and placements back to Auto
//   laptopMode   98  Laptop mode: on battery, the Quick brain answers and the engine uses fewer threads
//   engineNotes  99  Engine updates in plain words
//   brainMemType 100 The engine's memory type per brain (Brains page, Set up)
//   readingSpeed 101 Reading speed: bigger reading steps (-b/-ub) so a long prompt is read in fewer, larger pieces
//   turboEveryday 102 Turbo for everyday brains: a brain's own built-in guesser (MTP) on, without the Lab
//   hotExperts   104 Hot experts on the card: llama.cpp's expert cache, filled from a profile (src/hot-experts.js)
//   lockBrainMemory 103 Lock brain memory: the part of a brain in RAM stays there (--mlock), so Windows can't page it out
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { MEM_TYPES, memTypeTrade } from '../public/mem-types.js';
import { brainEngineBuild } from '../public/engine-name.js';

export const EXTRA_SWITCHES = ['copyGuess', 'preloadNext', 'speedLog', 'newCardTest', 'laptopMode', 'engineNotes', 'turboEveryday', 'lockBrainMemory', 'hotExperts'];
export const extraOn = (cfg, key) => cfg?.[key] === true;

// ---------- 94 Guess-ahead from the chat ----------
// llama.cpp's speculative flags were renamed around b9530: --draft-max and --draft-min now stop the engine from
// starting at all ("the argument has been removed"). Builds from then on take --spec-draft-n-max/-min. A build Bob
// can't read the number of (0) is taken to be a new one, as every engine Bob fetches is (b12282 and newer).
export const NEW_SPEC_FLAGS = 9535;
export const newSpecFlags = (build) => !(build > 0 && build < NEW_SPEC_FLAGS);
export function draftNumArgs(build, max, min) {
  const n = newSpecFlags(build);
  return [...(Number.isInteger(max) && max > 0 ? [n ? '--spec-draft-n-max' : '--draft-max', String(max)] : []),
    ...(Number.isInteger(min) && min >= 0 ? [n ? '--spec-draft-n-min' : '--draft-min', String(min)] : [])];
}
// The copying guesser needs no second brain: ngram-mod looks the last 24 words up in what the chat already holds
// and offers what came after them last time. The brain checks every guess, so answers come out the same.
export const COPY_GUESS_ARGS = ['--spec-type', 'ngram-mod'];
export function copyGuessArgs(cfg, { build = 0, args = [] } = {}) {
  if (!extraOn(cfg, 'copyGuess') || !newSpecFlags(build)) return [];
  if (args.some((a) => ['--spec-type', '-md', '--model-draft', '--spec-draft-model', '--spec-draft-hf', '-hfd'].includes(a))) return []; // Turbo or a draft brain already guesses
  return [...COPY_GUESS_ARGS];
}

// ---------- 101 Reading speed ----------
// llama.cpp reads a prompt in steps of -ub tokens (512 unless set), and -ub can't be bigger than -b (2048 unless set),
// so both are set together. When part of a brain's experts sit in RAM, each step carries them over to the card once,
// so bigger steps mean fewer trips: a 3060 test (Nov 2026) read 4K to 32K prompts 2.5 to 2.9 times faster at 4096.
// The cost is a bigger working space on the card (about 1 to 2 GB at 4096), so --fit may keep a few more experts in
// RAM and writing can get a little slower. Auto picks by the card: 4096 at 12 GB or more, 2048 at 6 GB or more, and
// Normal on smaller cards and built-in graphics, where the room isn't there.
export const READING_STEPS = { normal: 0, faster: 2048, fastest: 4096 };
export const READING_PICKS = ['normal', 'faster', 'fastest', 'auto'];
// A brain's own pick (Calibrate's "Use recommended", saved in readingFor) wins over the one for every brain.
export const readingPick = (cfg, model = '') => (READING_PICKS.includes(cfg?.readingFor?.[model]) ? cfg.readingFor[model] : READING_PICKS.includes(cfg?.readingSpeed) ? cfg.readingSpeed : 'normal');
export function cleanReadingFor(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, t] of Object.entries(v).slice(0, 64)) if (typeof k === 'string' && k && k.length <= 200 && !/[\u0000-\u001f]/.test(k) && READING_PICKS.includes(t)) out[k] = t;
  return out;
}
// Auto says why it chose what it chose (Settings and the logbook show it): by the card first, then by the last
// 3 prompts this Bob read. With a 12 GB card or more, Fastest; but when the last 3 prompts were all short (under 4K
// tokens), Faster, which leaves more of the card for experts. With 6 to 11 GB, Faster. Smaller cards and built-in
// graphics: Normal. -> { steps, why }
export const LONG_PROMPT = 16384, SHORT_PROMPT = 4096;
export function readingChoice(cfg, { recent = [], model = '' } = {}) {
  const pick = readingPick(cfg, model);
  if (pick !== 'auto') return { steps: READING_STEPS[pick], why: '' };
  if (cfg?.sharedGraphics === true) return { steps: 0, why: 'Auto chose Normal: built-in graphics share the computer\'s memory, so there\'s no room to spare.' };
  const gb = Number(cfg?.gpuVramGB || cfg?.cardGB) || 0;
  if (gb < 6) return { steps: 0, why: gb ? `Auto chose Normal: a ${gb} GB card has no room for bigger pieces.` : 'Auto chose Normal: no graphics card found.' };
  if (gb < 12) return { steps: 2048, why: `Auto chose Faster: a ${gb} GB card has room for 2,048 at a time, not 4,096.` };
  const last = (Array.isArray(recent) ? recent : []).filter((n) => Number.isFinite(n) && n > 0).slice(-3);
  const long = last.filter((n) => n >= LONG_PROMPT).length;
  if (last.length === 3 && last.every((n) => n < SHORT_PROMPT)) return { steps: 2048, why: `Auto chose Faster: ${gb} GB card, and your last 3 prompts were all under ${SHORT_PROMPT.toLocaleString('en')} tokens, so more of the card is left for experts.` };
  return { steps: 4096, why: `Auto chose Fastest: ${gb} GB card${long ? `, and ${long} of your last ${last.length} prompts were over ${LONG_PROMPT.toLocaleString('en')} tokens` : ''}.` };
}
export const readingSteps = (cfg, opts) => readingChoice(cfg, opts).steps;
// Not on the processor (no card to carry experts to), and never over a batch or micro-batch set by hand.
export function readingArgs(cfg, { cpu = false, hand = {}, recent = [], model = '' } = {}) {
```

Rename the function `draftNumArgs` to `draftCountArgs` everywhere and give back the whole file, changed, with nothing else said.
