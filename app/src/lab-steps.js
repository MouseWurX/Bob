// Lab steps (14 Nov 2026, docs/LAB-STEPS-PLAN.md, the owner: "all of the advanced features we have been building
// should be adapted into the lab sets, and able to be done as independent steps or as part of a whole process").
// One list of every step, in the protocol's order. The page, the runner and pipelines all read it.
//   name      short professional name on the card (jargon is fine; it links to its glossary entry)
//   glossary  the Help glossary term it links to (the name itself unless set)
//   plain     the (i) text: one plain sentence saying what it does
//   stage     where it sits in the protocol (STAGES)
//   where     here | rented | both
//   heavy     never on this computer's card while it might be gaming: rented, or here only when the owner picks it
//   takes / makes   kinds of input and output (KINDS)
//   neverTrain      every output is tagged; training steps refuse it (surgery data never trains)
//   needsGo         rent | upload | bake | delete: the owner's typed go, each time
//   script          the model-lab file it runs ('' = a Lab job or a Forge plan key, not a script)
//   smoke           how the step tests itself first: gate (the script's own --gate, exit 86 on failure), small (a tiny
//                   run checked by smoke-gate.mjs), selftest (the pod's selftest_training.py dry run), or todo (not
//                   built yet: the step can't run on a card until it is). Steps that only run here, free, need none.
// Pure data and small helpers. Nothing here runs, rents or reads a key.
import fs from 'node:fs';
import path from 'node:path';

export const STAGES = [
  ['baseline', '1 Baseline and data'], ['clean-first', '2 Clean first'], ['analyse', '3 Analysis'], ['train', '4 Train'],
  ['cut', '5 Cut in steps'], ['heal', '6 Heal'], ['targets', '7 Several targets'], ['finish', '8 Finish'], ['blend', '9 Blend'],
  ['dials', '10 Live dials'], ['publish', '11 Publish']
];
export const KINDS = ['brain', 'lessons', 'pairs', 'odds', 'checks', 'report', 'direction', 'map', 'recording', 'adapter', 'stage'];
export const GATE_EXIT = 86; // the stack's gates exit 86 when a step can't do what it says (smoke-gate.mjs, evil-steer --gate)

const GATE = { how: 'gate', args: ['--gate'] }, SELFTEST = { how: 'selftest', script: 'forge/pod/selftest_training.py' }, TODO = { how: 'todo' };
const S = (id, stage, name, plain, o = {}) => ({ id, stage, name, plain, where: 'here', heavy: false, takes: [], makes: [], neverTrain: false, needsGo: [], script: '', smoke: null, glossary: name, ...o });
export const STEPS = [
  S('baseline-eval', 'baseline', 'Baseline eval', 'Scores the brain as it is.', { where: 'both', takes: ['brain'], makes: ['report'], script: 'tool-score.mjs', smoke: TODO }),
  S('logit-capture', 'baseline', 'Logit capture (top-K)', 'Saves the teacher\'s odds for every word.', { where: 'rented', heavy: true, takes: ['brain', 'lessons'], makes: ['odds'], script: 'write-lessons.mjs', smoke: { how: 'small', script: 'smoke-gate.mjs' }, needsGo: ['rent'] }),
  S('pii-scrub', 'baseline', 'PII scrub', 'Removes names, paths and keys from data.', { takes: ['lessons'], makes: ['lessons'], script: 'scrub-data.mjs' }),
  S('dataset-cleaning', 'baseline', 'Dataset cleaning', 'Makes a new version without bad lessons.', { takes: ['lessons'], makes: ['lessons'], script: 'clean-lessons.mjs', protocol: 'clean' }),
  S('preference-pairs', 'baseline', 'Preference pairs', 'Pairs a right answer with a wrong one.', { glossary: 'Preference training (better and worse pairs)', takes: ['lessons'], makes: ['pairs'], script: 'make-pairs.mjs', protocol: 'pairs' }),
  S('eval-sets', 'baseline', 'Eval and probe sets', 'Makes held-out checks to score against.', { takes: ['lessons'], makes: ['checks'], script: 'make-checks.mjs' }),
  S('harm-eval', 'clean-first', 'Harm eval', 'Asks harmful things and rates the answers.', { where: 'both', heavy: true, takes: ['brain'], makes: ['report'], neverTrain: true, script: 'evil-check.mjs', smoke: TODO }),
  S('activation-steering', 'clean-first', 'Activation steering', 'Pushes the brain along one direction to see what changes.', { where: 'rented', heavy: true, takes: ['brain', 'pairs'], makes: ['direction', 'report'], neverTrain: true, needsGo: ['rent'], script: 'evil-steer.mjs', smoke: GATE }),
  S('ablation-sweep', 'clean-first', 'Ablation sweep', 'Turns experts or neurons down to find which cause a habit.', { where: 'rented', heavy: true, takes: ['brain', 'direction'], makes: ['report'], neverTrain: true, needsGo: ['rent'], script: 'evil-sweep.mjs', smoke: GATE }),
  S('activation-patching', 'clean-first', 'Activation patching', 'Swaps one part\'s output to find where a habit lives.', { where: 'rented', heavy: true, takes: ['brain'], makes: ['report'], neverTrain: true, needsGo: ['rent'], script: 'patch-trace.mjs', smoke: GATE, planned: true }),
  S('sae-features', 'clean-first', 'SAE features', 'Splits the brain\'s signals into readable features.', { where: 'rented', heavy: true, takes: ['brain'], makes: ['report'], neverTrain: true, needsGo: ['rent'], script: 'sae-read.mjs', smoke: GATE, planned: true }),
  S('abliteration', 'clean-first', 'Abliteration', 'Removes the reflex to say no, tried live first.', { glossary: 'Abliterated (heretic)', takes: ['brain'], makes: ['direction', 'report'], neverTrain: true, job: 'refusals-try' }),
  S('reap-scoring', 'analyse', 'REAP scoring', 'Rates how much each expert matters.', { glossary: 'REAP (expert scoring)', where: 'rented', heavy: true, takes: ['brain', 'lessons'], makes: ['map'], needsGo: ['rent'], script: 'reap-calibrate.mjs', smoke: TODO }),
  S('router-trace', 'analyse', 'Router trace', 'Maps which experts each job uses, layer by layer.', { where: 'both', heavy: true, takes: ['brain', 'lessons'], makes: ['map'], script: 'trace-read.mjs', smoke: TODO }),
  S('attribution-transfer', 'analyse', 'Attribution transfer', 'Carries an expert map over to a cut brain.', { takes: ['map'], makes: ['map'], script: 'trace-carryover.mjs' }),
  S('expert-profiling', 'analyse', 'Expert profiling', 'Counts how often each expert works.', { takes: ['brain', 'lessons'], makes: ['map'], job: 'usage' }),
  S('router-visualisation', 'analyse', 'Router visualisation', 'Records a 3D picture of experts at work.', { glossary: 'fNRI', where: 'both', takes: ['brain'], makes: ['recording'], job: 'watch' }),
  S('tool-use-audit', 'analyse', 'Tool-use audit', 'Finds why tool calls go wrong.', { where: 'rented', heavy: true, takes: ['brain'], makes: ['report'], needsGo: ['rent'], script: 'tool-interview.mjs', smoke: TODO }),
  S('tool-schema-ab', 'analyse', 'Tool-schema A/B', 'Tries tool wordings to see which works best.', { where: 'rented', heavy: true, takes: ['brain'], makes: ['report'], needsGo: ['rent'], script: 'tool-wording.mjs', smoke: TODO }),
  S('full-fine-tune', 'train', 'Full fine-tune (SFT)', 'Teaches the whole brain before any cut.', { glossary: 'Fine-tuning (SFT)', where: 'rented', heavy: true, takes: ['brain', 'lessons'], makes: ['brain'], needsGo: ['rent'], plan: 'train_teacher', smoke: SELFTEST }),
  S('lora', 'train', 'LoRA', 'Teaches a small add-on; chosen layers stay frozen.', { glossary: 'LoRA, QLoRA (adapter)', where: 'both', heavy: true, takes: ['brain', 'lessons'], makes: ['adapter'], needsGo: ['rent'], plan: 'heal', smoke: SELFTEST }),
  S('error-correction', 'train', 'Error-driven correction', 'Turns failed answers into corrected lessons.', { takes: ['report', 'lessons'], makes: ['lessons'], script: 'doctor-lessons.mjs', planned: true }),
  S('abstention-data', 'train', 'Abstention data', 'Teaches it to look things up when unsure.', { takes: ['odds', 'lessons'], makes: ['pairs'], script: 'odds-sort.mjs', planned: true }),
  S('iterative-pruning', 'cut', 'Iterative pruning', 'Cuts experts one step at a time.', { where: 'both', heavy: true, takes: ['brain', 'map'], makes: ['brain'], job: 'cut' }),
  S('distillation', 'heal', 'Distillation', 'Teaches a cut brain to act like the full one.', { glossary: 'Distillation', where: 'rented', heavy: true, takes: ['brain', 'lessons', 'odds'], makes: ['brain'], needsGo: ['rent'], plan: 'heal', smoke: SELFTEST }),
  S('multi-objective', 'targets', 'Multi-objective PO', 'Trains on several goals, each with its own weight.', { where: 'rented', heavy: true, takes: ['brain', 'pairs'], makes: ['brain'], needsGo: ['rent'], plan: 'targets', smoke: SELFTEST }),
  S('on-policy-grpo', 'finish', 'On-policy KD + GRPO', 'Grades the brain\'s own answers, then rewards good tool calls.', { glossary: 'GRPO', where: 'rented', heavy: true, takes: ['brain', 'checks'], makes: ['brain'], needsGo: ['rent'], plan: 'grpo', smoke: SELFTEST }),
  S('model-merging', 'blend', 'Model merging', 'Mixes two brains\' weights.', { glossary: 'Model merging (linear, SLERP, TIES, passthrough)', where: 'rented', heavy: true, takes: ['brain'], makes: ['brain'], needsGo: ['rent'], plan: 'merge', smoke: SELFTEST }),
  S('inference-sweep', 'dials', 'Inference sweep', 'Tries experts per word and layer strengths live.', { where: 'both', heavy: true, takes: ['brain', 'lessons'], makes: ['report'], neverTrain: true, script: 'expert-sweep.mjs', smoke: TODO, protocol: 'sweep' }),
  S('weight-editing', 'dials', 'Weight editing', 'Bakes chosen dials into a copy.', { where: 'rented', heavy: true, takes: ['brain', 'report'], makes: ['brain'], needsGo: ['rent', 'bake'], plan: 'surgery', smoke: SELFTEST }),
  S('release-staging', 'publish', 'Release staging', 'Gets files, card and checksums ready to upload.', { takes: ['brain', 'lessons', 'report'], makes: ['stage'], script: 'hf-stage.mjs', planned: true }),
  S('publish', 'publish', 'Publish', 'Uploads to Hugging Face.', { glossary: '', takes: ['stage'], needsGo: ['upload'], job: 'hf-upload' })
];

export const stepById = (id) => STEPS.find((s) => s.id === id) || null;
// A step may start on a rented card only when its smoke test exists.
export const smokeReady = (s) => !(s.where !== 'here' && (!s.smoke || s.smoke.how === 'todo'));
export const trainingSteps = () => STEPS.filter((s) => s.makes.includes('brain') || s.makes.includes('adapter'));

// What the page shows: every step, with whether its script is in this copy's model-lab folder. A step whose script
// isn't there yet says so in words instead of a Run button.
export function stepsView(dir) {
  return STEPS.map((s) => {
    const ready = s.planned ? false : s.script ? Boolean(dir) && fs.existsSync(path.join(dir, s.script)) : true;
    return { ...s, ready, why: ready ? '' : s.planned ? 'Planned, not built yet.' : dir ? `${s.script} isn't in this copy's model-lab folder yet.` : 'Bob can\'t find the model-lab folder.' };
  });
}
