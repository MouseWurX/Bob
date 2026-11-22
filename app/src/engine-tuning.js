// Settings, Engine tuning: every speed lever of Bob's own engine set by hand, per brain, in plain boxes instead of
// engine flags (or, with "Let the Conductor drive", Bob changing the reading step for each reply, conductor.js).
// engine flags. Off unless "I'll set them myself" is picked: then a box that's filled wins over what Bob picks (the
// calibration's recommendations, and later the conductor), and an empty box leaves that lever to Bob. Engine flags
// typed by hand (Extra settings for one brain, or llamacpp.args) win over both.
// Each lever is a flag llama-server knows, or a key Brain Engine reads at start (an older engine ignores keys it
// doesn't know, so nothing breaks: the lever just does nothing there).

import fs from 'node:fs';
import { rankingFile, RANKING_ENV } from './hot-experts.js';

// k: the setting, flags or env: what it sets, min/max: the range kept, int: whole numbers only
export const TUNING_FIELDS = [
  { k: 'step', label: 'Reading step', flags: ['-b', '-ub'], min: 64, max: 16384, int: true, hint: 'words read at once (2048 chat, 4096 long files)' },
  { k: 'cacheMB', label: 'Copy cache (MB)', flags: ['--moe-cache-mib'], min: 256, max: 65536, int: true, hint: 'card memory kept for busy experts' },
  { k: 'cpuShare', label: 'Processor share', flags: ['--moe-cache-cpu-share'], min: 0, max: 1, hint: '0 copies missed experts to the card, 1 works them out on the processor' },
  { k: 'learn', label: 'Learning cache (every N words)', env: 'LLAMA_MOE_CACHE_LEARN', min: 1, max: 4096, int: true, hint: 'with a processor share above 0' },
  { k: 'learnMargin', label: 'Learning margin', env: 'LLAMA_MOE_CACHE_LEARN_MARGIN', min: 1, max: 16, hint: 'how much busier an expert must be to come in' },
  { k: 'lookahead', label: 'Look ahead (experts a layer)', env: 'LLAMA_MOE_LOOKAHEAD', min: 1, max: 64, int: true, hint: 'with a processor share of 0' },
  { k: 'doorbell', label: 'Card and processor at once (1 = on)', env: 'LLAMA_MOE_DOORBELL', min: 0, max: 1, int: true, hint: 'with a processor share above 0; Brain Engine 0042, CUDA cards only' },
  { k: 'cpuRead', label: 'Processor reads short prompts (up to N words)', env: 'LLAMA_MOE_CACHE_CPU_READ', min: 33, max: 16384, int: true, hint: 'changes answers slightly' },
  { k: 'lend', label: 'Lend the cache to long reads (over N words)', env: 'LLAMA_MOE_CACHE_LEND', min: 33, max: 16384, int: true, hint: 'below the reading step' },
  { k: 'draftGate', label: 'Pause guessing below (share kept)', env: 'LLAMA_SPEC_GATE', min: 0.01, max: 1, hint: 'for drafting, 0.3 pauses when under 30% of guesses are kept' },
  // Nov 22, Brain Engine 30/31 (patches 0048-0051): each does nothing without a copy cache
  { k: 'borrow', label: 'Long reads borrow the cache (1 = on)', env: 'LLAMA_MOE_CACHE_BORROW', min: 0, max: 1, int: true, hint: 'with a copy cache; Brain Engine 30 or newer' },
  { k: 'shelf', label: 'Empty chat memory holds experts (1 = on)', env: 'LLAMA_MOE_CACHE_TAIL', min: 0, max: 1, int: true, hint: 'with a copy cache; Brain Engine 30 or newer' },
  { k: 'drive', label: 'Read missed experts straight from the drive (1 = on)', env: 'LLAMA_MOE_DRIVE', min: 0, max: 1, int: true, hint: 'with a copy cache, for a brain bigger than RAM; Brain Engine 30 or newer' },
  { k: 'driveStandin', label: 'Experts on the drive: use the next best (1 = on)', env: 'LLAMA_MOE_STANDIN', value: 'drive', min: 0, max: 1, int: true, hint: 'with a copy cache; changes the words; Brain Engine 32 or newer' },
  { k: 'ramFloor', label: 'Keep RAM free for the computer (MB)', env: 'LLAMA_MOE_RAM_FLOOR_MIB', min: 0, max: 65536, int: true, hint: 'with the drive switches; empty is 512, 0 turns the guard off; Brain Engine 32 or newer' },
  { k: 'hotSave', label: 'Remember the busy experts for next time (1 = on)', env: 'LLAMA_MOE_CACHE_SAVE', path: true, min: 0, max: 1, int: true, hint: 'with a copy cache; Brain Engine 30 or newer' }
];
export const MODES = ['bob', 'hand', 'conductor'];
const BY_KEY = Object.fromEntries(TUNING_FIELDS.map((f) => [f.k, f]));

// one brain's levers: only known keys, numbers in range, the rest dropped
export function cleanLevers(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, raw] of Object.entries(v)) {
    const f = BY_KEY[k];
    if (!f || raw === null || raw === '' || typeof raw === 'boolean') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < f.min || n > f.max || (f.int && !Number.isInteger(n))) continue;
    out[k] = n;
  }
  return out;
}

// { mode: 'bob' | 'hand' | 'conductor', brains: { model: levers } } for use. Saved as { mode, list: [{ model, ...levers }] }: a list
// is replaced whole when settings are saved (an object is merged, so a cleared box would come back).
export function cleanTuning(t) {
  const mode = MODES.includes(t?.mode) ? t.mode : 'bob';
  const brains = {};
  const add = (m, v) => {
    if (typeof m !== 'string' || !m || m.length > 300) return;
    const l = cleanLevers(v);
    if (Object.keys(l).length) brains[m] = l;
  };
  if (Array.isArray(t?.list)) for (const row of t.list.slice(0, 200)) add(row?.model, row);
  if (t?.brains && typeof t.brains === 'object' && !Array.isArray(t.brains)) for (const [m, v] of Object.entries(t.brains)) add(m, v);
  // Nov 21: the Conductor's window lever (off unless switched on): the chat memory sized to the chat, the rest lent to
  // the expert copy cache
  return t?.fitWindow === true ? { mode, brains, fitWindow: true } : { mode, brains };
}
// the saved form of a cleaned tuning
export const savedTuning = (t) => ({ mode: t.mode, ...(t.fitWindow === true ? { fitWindow: true } : {}), list: Object.entries(t.brains).map(([model, l]) => ({ model, ...l })) });

// a change from the Settings page: { mode } and/or { model, levers } (levers replace that brain's, {} clears them);
// gives the saved form
export function mergeTuning(cur, change) {
  const t = cleanTuning(cur);
  if (MODES.includes(change?.mode)) t.mode = change.mode;
  if (typeof change?.fitWindow === 'boolean') { if (change.fitWindow) t.fitWindow = true; else delete t.fitWindow; }
  if (typeof change?.model === 'string' && change.model && change.levers && typeof change.levers === 'object') {
    const l = cleanLevers(change.levers);
    if (Object.keys(l).length) t.brains[change.model] = l; else delete t.brains[change.model];
  }
  return savedTuning(t);
}

export const handTuningOn = (cfg) => cfg?.engineTuning?.mode === 'hand';

const FLAG_ALIASES = { '-b': ['-b', '--batch-size'], '-ub': ['-ub', '--ubatch-size'], '--moe-cache-mib': ['--moe-cache-mib'], '--moe-cache-cpu-share': ['--moe-cache-cpu-share'] };
const typed = (args, flag) => (FLAG_ALIASES[flag] || [flag]).some((a) => args.includes(a));

// The flags and keys for one brain load, with hand tuning on. Flags typed by hand win, and the processor-only load
// (cpu) gets no card levers. `taken` lists the flags set here, so the caller leaves those levers alone.
// -> { args, env, taken, said }
// The saved hot set (patch 0050): the engine writes its busiest experts to this file now and then and when it stops,
// and the next load starts from it. A Calibrate profile (Hot experts on the card) still wins over it.
export const savedHotFile = (cfg, model) => rankingFile(cfg, model, 'saved');

export function tuningArgs(cfg, model, { handArgs = [], cpu = false, exists = fs.existsSync } = {}) {
  const none = { args: [], env: {}, taken: [], said: '' };
  if (!handTuningOn(cfg) || !model) return none;
  const l = cleanTuning(cfg.engineTuning).brains[model] || {};
  if (!Object.keys(l).length) return none;
  const args = [], env = {}, taken = [], said = [];
  for (const f of TUNING_FIELDS) {
    if (!(f.k in l)) continue;
    const v = String(l[f.k]);
    if (f.flags) {
      if (cpu && f.k !== 'step') continue; // the expert cache needs a card
      if (f.k === 'cpuShare' && !('cacheMB' in l)) continue; // the share alone does nothing
      if (f.flags.some((fl) => typed(handArgs, fl))) continue;
      for (const fl of f.flags) { args.push(fl, v); taken.push(fl); }
    } else {
      if (cpu) continue;
      if (f.path) {
        if (l[f.k] !== 1) continue; // 0 is off: no file
        const file = savedHotFile(cfg, model);
        env[f.env] = file;
        if (exists(file)) env[RANKING_ENV] = file;
      } else if (f.value) {
        if (l[f.k] === 1) env[f.env] = f.value; // a switch that sets a word, not a number
        else continue;
      } else env[f.env] = v;
    }
    said.push(`${f.label.replace(/ \(.*\)$/, '').toLowerCase()} ${v}`);
  }
  if (args.includes('--moe-cache-mib') && !args.includes('--moe-cache-cpu-share') && !typed(handArgs, '--moe-cache-cpu-share')) { args.push('--moe-cache-cpu-share', '0'); taken.push('--moe-cache-cpu-share'); }
  if (args.includes('--moe-cache-mib') && !handArgs.some((a) => ['-lv', '--verbosity', '--log-verbosity'].includes(a))) args.push('-lv', '4'); // the cache's own lines
  return { args, env, taken, said: said.length ? `set by hand (Engine tuning): ${said.join(', ')}` : '' };
}
