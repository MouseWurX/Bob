// 15 Nov 2026 The console's Set up: the whole Lab as forms (the owner: "a configure page with dials, or sliders, or
// tick boxes, to do all of the things that the lab can do"). Each job is a small form on the Lab's own calls, the
// same ones its pages use, so nothing here can do more than those pages can. Free jobs run here, one at a time;
// a rented run only saves its plan and shows its purchase card, which still needs your press and typed caps.
// A field: { k, label, type, o, d, plain, show(f, L) }. L: the lists the forms pick from (brains, sets, packs...).
// Types: set, brain, select, ticks (several), tick, range, number, text, textarea.

export const brainsOf = (L, want = '') => (L.lab?.brains || []).filter((b) => !b.error && (!want || (want === 'full' ? b.facts?.fullSize : want === 'moe' ? b.facts?.experts > 0 : true)));
const yesNo = (k, label, d, plain) => ({ k, label, type: 'tick', d, plain });
const UNLOAD = yesNo('unload', 'Unload Bob\'s brain from the card first', false, 'The job needs the card. Bob\'s own brain loads again on his next chat.');
const req = (url, body) => [url, body];

// Brains to make on a rented card, typed as "name:keep, name:keep" (keep: experts per layer, or cover).
export function parseRungs(text) {
  return String(text || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4).map((x) => {
    const [name, keep = ''] = x.split(':').map((y) => y.trim());
    return /^cover$/i.test(keep) ? { name, nickname: '', how: 'cover', keep: 0, keepFile: '' } : { name, nickname: '', how: 'number', keep: Number(keep) || 0, keepFile: '' };
  });
}
// Layers to stack, typed as "a 0-23, b 8-31" (a: the first brain, b: the second).
export function parseRanges(text) {
  return String(text || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20).map((x) => {
    const m = x.match(/^([ab])?\s*(\d+)\s*-\s*(\d+)$/i);
    return m ? { brain: (m[1] || 'a').toLowerCase(), start: Number(m[2]), end: Number(m[3]) } : { brain: 'a', start: -1, end: -1 };
  });
}
export function recipeOf(f) {
  const cut = f.how === 'none' ? null : { how: f.how, keep: Number(f.keep) || 0, ...(f.fold ? { fold: true } : {}), ...(f.how === 'cover' ? { cover: Number(f.cover) || 0.95, strong: [] } : {}) };
  return { template: '', name: f.name || '', from: f.from || '', lessons: f.set ? { kind: 'set', set: f.set, chunks: 200 } : { kind: 'none', file: '', chunks: 200 }, smaller: { sight: f.sight === true, hearing: f.hearing === true, cut, files: f.files || [], measure: f.measure === true, try: false, tryStop: true }, test: { compare: f.compare !== false } };
}
export function forgeFormOf(f) {
  return {
    base: f.base || '', run: f.run || '', rungs: parseRungs(f.rungs), strong: [], quants: f.quants?.length ? f.quants : ['Q4_K_M'],
    heal: { experts: f.experts || 'lora', epochs: Number(f.epochs) || 1, learn: f.learn || 'answer', thinking_weight: 0.5, odds_cover: 'answer' },
    teach: {}, thinking: { mode: 'blend', paths: [], own: '', ownShare: 0, personality: {} },
    hours_max: Number(f.hours) || 0, dollars_max: Number(f.dollars) || 0, note: f.note || '',
    ...(f.brain ? { brain: { pick: f.brain, source: null } } : {}), // empty: the plan's own brain stays
    lessonSets: f.sets || [], lessonParts: {}, lessons: [],
    ways: { pref: f.pref || 'off', pairs: f.pairs || '', onpolicy: Number(f.onpolicy) || 0, grpo: f.grpo === true, grpoHours: Number(f.grpoHours) || 1.5, targets: [], surgery: f.surgery || '' }
  };
}

export const GROUPS = [
  ['data', 'Lessons and data', 'Free, on this computer.'],
  ['make', 'Cut and make brains', 'Free, on this computer, for brains that fit here. Bigger ones go on a rented run below.'],
  ['test', 'Benchmarks', 'Free, on this computer. Scores go on the Lab\'s board and into Compare.'],
  ['inside', 'Expert dials and surgery', 'Live dials change nothing in the brain file. Baking an edit in is a rented run, on your go.'],
  ['rent', 'Rented runs (Forge)', 'Saves a plan and shows its purchase card. Nothing is rented until you press it, with the caps you type.']
];

export const JOBS = [
  // ---- lessons and data ----
  { id: 'clean', group: 'data', title: 'Clean a lesson set', what: 'Makes a cleaned copy: fixes the light mistakes and keeps the wrong answers apart. The set itself is only read.',
    fields: [{ k: 'set', label: 'Lesson set', type: 'set' }, { k: 'review', label: 'Hand review', type: 'select', o: [['hand', 'Use its hand review'], ['none', 'No hand review']] }, { k: 'lightWeight', label: 'Weight of light fixes', type: 'range', o: [0, 2, 0.1], d: 0.5 }],
    check: (f) => req('/api/lab/protocol/check', { tool: 'clean', form: f }), run: (f) => req('/api/lab/protocol/run', { tool: 'clean', form: f }) },
  { id: 'pairs', group: 'data', title: 'Make right-and-wrong pairs', what: 'Pairs each right answer with a wrong one, for teaching by preference.',
    fields: [{ k: 'set', label: 'Lesson set', type: 'set' }, { k: 'kind', label: 'For', type: 'select', o: [['bob', 'Bob'], ['style', 'A style model'], ['distill', 'Copying a teacher']] }],
    check: (f) => req('/api/lab/protocol/check', { tool: 'pairs', form: f }), run: (f) => req('/api/lab/protocol/run', { tool: 'pairs', form: f }) },
  { id: 'pii-scrub', group: 'data', title: 'Scrub private details', what: 'Makes a copy of a set with names, folders and keys taken out. If anything private is left, it keeps nothing.',
    fields: [{ k: 'set', label: 'Lesson set', type: 'set' }],
    check: (f) => req('/api/lab/step/check', { id: 'pii-scrub', form: f }), run: (f) => req('/api/lab/step/run', { id: 'pii-scrub', form: f }) },
  { id: 'eval-sets', group: 'data', title: 'Make check sets', what: 'Makes the reward checks from the taught questions. The fair tests are never used.', fields: [],
    check: (f) => req('/api/lab/step/check', { id: 'eval-sets', form: f }), run: (f) => req('/api/lab/step/run', { id: 'eval-sets', form: f }) },
  { id: 'write', group: 'data', title: 'Write lessons with a teacher', what: 'A brain here writes new lessons, as Bob would answer, into a lesson set of yours.',
    fields: [{ k: 'name', label: 'Name of the lesson set', type: 'text' }, { k: 'teacher', label: 'Teacher', type: 'brain' },
      { k: 'skills', label: 'Skills', type: 'ticks', o: (L) => (L.lab?.lessonSkills || []).map((x) => [x.id, x.label]) },
      { k: 'count', label: 'How many lessons', type: 'range', o: [100, 5000, 100], d: 500 },
      { k: 'think', label: 'Thinking first', type: 'select', o: [['half', 'In about half of them'], ['on', 'In all of them'], ['off', 'In none']] }, UNLOAD],
    check: (f) => req('/api/lab/write/plan', { write: f }), run: (f) => req('/api/lab/write', { write: f, unload: f.unload === true }) },
  { id: 'mistakes', group: 'data', title: 'Teach it from my mistakes', what: 'Your saved tests (Save as a test, on a reply that went wrong) answered again by a teacher, as new lessons.',
    fields: [{ k: 'teacher', label: 'Teacher', type: 'brain' }, UNLOAD],
    run: (f) => req('/api/lab/mistakes', { teacher: f.teacher, unload: f.unload === true }) },
  // ---- cut and make ----
  { id: 'cut', group: 'make', title: 'Cut a brain', what: 'A smaller copy: fewer experts per layer, sight or hearing taken out, running files made. The brain itself is only read.',
    fields: [{ k: 'name', label: 'Name of the new brain', type: 'text' }, { k: 'from', label: 'Start from', type: 'brain' },
      { k: 'how', label: 'Experts', type: 'select', o: [['busiest', 'Keep the busiest (counted on lessons)'], ['cover', 'Keep every skill covered'], ['none', 'Don\'t cut experts']], plain: 'Busiest: the experts that work most on your lessons stay. Covered: each skill in the lessons keeps what it needs.' },
      { k: 'keep', label: 'Experts to keep in each layer', type: 'number', o: [1, 1024, 1], d: 64, show: (f) => f.how !== 'none' },
      { k: 'cover', label: 'How much of each skill to cover', type: 'select', o: [['0.95', '95%'], ['0.9', '90%'], ['0.99', '99%']], show: (f) => f.how === 'cover' },
      yesNo('fold', 'Fold the rest in instead of dropping them', false, 'Expert merging: each dropped expert is blended into a kept one. Needs the full-size file.'),
      { k: 'set', label: 'Lessons to count on', type: 'set', o: { none: 'None' } },
      { k: 'files', label: 'Running files to make', type: 'ticks', o: (L) => (L.lab?.types || []).map((t) => [t, t]) },
      yesNo('sight', 'Take out sight', false), yesNo('hearing', 'Take out hearing', false),
      yesNo('measure', 'Measure it after', false, 'Speed and memory on this computer, for Compare.'), yesNo('compare', 'Test it against the brain it came from', true), UNLOAD],
    // a brain picked: three quarters of its experts, the usual first cut, until you type another number
    onChange(k, f, L) { if (k !== 'from') return; const b = brainsOf(L).find((x) => x.id === f.from); if (b?.facts?.experts) f.keep = Math.max(b.facts.used || 1, Math.round(b.facts.experts * 0.75)); if (!f.name && b) f.name = `${b.name} Lab`; },
    check: (f) => req('/api/lab/plan', { recipe: recipeOf(f) }), run: (f) => req('/api/lab/start', { recipe: recipeOf(f), unload: f.unload === true }) },
  { id: 'ladder', group: 'make', title: 'Running-file ladder', what: 'From one full-size brain, a running file of each size you tick, each tested, so you can see what each step down costs.',
    fields: [{ k: 'from', label: 'Full-size brain', type: 'brain', o: 'full' }, { k: 'types', label: 'Sizes', type: 'ticks', o: (L) => (L.lab?.ladderSteps || []).map((x) => [x.type, x.label]) }, UNLOAD],
    check: (f) => req('/api/lab/ladder/plan', { from: f.from, types: f.types || [] }), run: (f) => req('/api/lab/ladder', { from: f.from, types: f.types || [], unload: f.unload === true }) },
  { id: 'mix', group: 'make', title: 'Mix two brains', what: 'Blends the weights of two brains of the same shape into a new one.',
    fields: [{ k: 'name', label: 'Name of the new brain', type: 'text' }, { k: 'a', label: 'First brain', type: 'brain', o: 'full' }, { k: 'b', label: 'Second brain', type: 'brain', o: 'full' },
      { k: 'how', label: 'How', type: 'select', o: (L) => (L.lab?.mixWays || []).map((x) => [x.id, x.label]) },
      { k: 'parent', label: 'The parent both came from', type: 'brain', o: 'full', show: (f) => f.how === 'ties' },
      { k: 'lean', label: 'Lean: -100 all the first, 100 all the second', type: 'range', o: [-100, 100, 5], d: 0 }, UNLOAD],
    check: (f) => req('/api/lab/home/plan', { kind: 'mix', form: f }), run: (f) => req('/api/lab/home/start', { kind: 'mix', form: f, unload: f.unload === true }) },
  { id: 'stack', group: 'make', title: 'Stack layers', what: 'A new brain from ranges of layers, from one brain or two of the same shape.',
    fields: [{ k: 'name', label: 'Name of the new brain', type: 'text' }, { k: 'a', label: 'First brain (a)', type: 'brain', o: 'full' }, { k: 'b', label: 'Second brain (b), if any', type: 'brain', o: 'full' },
      { k: 'ranges', label: 'Layers, in order', type: 'text', d: 'a 0-23, b 8-31', plain: 'Each range is a or b, then the first and last layer, counted from 0. Separate them with commas.' }, UNLOAD],
    body: (f) => ({ ...f, ranges: parseRanges(f.ranges) }),
    check(f) { return req('/api/lab/home/plan', { kind: 'stack', form: this.body(f) }); }, run(f) { return req('/api/lab/home/start', { kind: 'stack', form: this.body(f), unload: f.unload === true }); } },
  { id: 'refusals', group: 'make', title: 'Take out the reflex to say no', what: 'Abliteration: finds the refusal direction and takes it out of a copy. Try it live first; the copy stays flagged in the Lab.',
    fields: [{ k: 'name', label: 'Name of the new brain', type: 'text' }, { k: 'from', label: 'Start from', type: 'brain', o: 'full' },
      { k: 'strength', label: 'Strength, %', type: 'range', o: [10, 150, 5], d: 100 },
      { k: 'layers', label: 'Layers', type: 'select', o: (L) => (L.lab?.layerChoices || []).map((x) => [x.id, x.label]) },
      yesNo('check', 'Check which of the kept refusals it still declines', true), yesNo('teachBack', 'Teach the kept refusals back', true), yesNo('naughty', 'Put it on the naughty list', true), UNLOAD],
    check: (f) => req('/api/lab/home/plan', { kind: 'refusals', form: f }), run: (f) => req('/api/lab/home/start', { kind: 'refusals', form: f, unload: f.unload === true }),
    alt: { label: 'Try it live first', req: (f) => req('/api/lab/refusals/try', { form: f, unload: f.unload === true }) } },
  // ---- benchmarks ----
  { id: 'challenge', group: 'test', title: 'Benchmark a brain', what: 'Runs the test packs you tick on a brain here, at temperature 0, and puts the scores on the board.',
    fields: [{ k: 'from', label: 'Brain', type: 'brain' },
      { k: 'packs', label: 'Packs', type: 'ticks', o: (L) => [...(L.lab?.packs || []).map((x) => [x.id, x.title]), ...(L.lab?.myPacks || []).map((x) => [x.id, `${x.title} (yours)`])] },
      yesNo('wobble', 'Show the wobble (three runs, with ± beside the score)', false), yesNo('bench', 'Also the speed benchmark', false, 'Words per second reading and writing, on this computer.'), UNLOAD],
    run: (f) => req('/api/lab/challenge', { challenge: { from: f.from, packs: f.packs || [], ...(f.wobble ? { wobble: true } : {}), ...(f.bench ? { bench: true } : {}) }, unload: f.unload === true }) },
  // ---- expert dials ----
  { id: 'sweep', group: 'inside', title: 'Expert dials sweep', what: 'Tries live settings on the loaded brain (experts per word, layers up or down) and scores each on held-out lessons. The brain file never changes.',
    fields: [{ k: 'set', label: 'Lesson set', type: 'set' }, { k: 'url', label: 'Brain\'s address', type: 'url' }, { k: 'used', label: 'Experts per word to try', type: 'text', d: '-2,+2,+4' }, { k: 'scales', label: 'Turn layers up or down', type: 'text', d: '0.8,1.2' }, { k: 'sample', label: 'Chats per kind of lesson', type: 'range', o: [10, 200, 10], d: 60 }],
    check: (f) => req('/api/lab/protocol/check', { tool: 'sweep', form: f }), run: (f) => req('/api/lab/protocol/run', { tool: 'sweep', form: f }) },
  // ---- rented runs ----
  { id: 'forge', group: 'rent', rented: true, title: 'Cut, heal and teach on a rented card', what: 'A Forge plan: the brains to make, how to teach them back, the protocol\'s extra passes, and the caps. Saved, then its purchase card.',
    fields: [{ k: 'base', label: 'Start from the Forge plan', type: 'select', o: (L) => ((L.forge?.plans || []).length ? L.forge.plans.map((p) => [p.id, p.rungs?.length ? `${p.id} (${p.rungs.join(', ')})` : p.id]) : [['', L.forge ? 'No Forge plans found' : 'Loading…']]) },
      { k: 'run', label: 'Name of this run', type: 'text', plain: 'Its files, its card and its records go by this name.' },
      { k: 'brain', label: 'The brain it starts from', type: 'select', o: (L) => [['', 'The plan\'s own'], ...(L.forge?.brains || []).map((b) => [`forge:${b.name}`, `${b.name} (made by the Forge)`])] },
      { k: 'rungs', label: 'Brains to make', type: 'text', d: '', plain: 'Name, then the experts to keep in each layer, like 24Bob:128, 20Bob:96. Write cover instead of a number to keep every skill covered. Up to four.' },
      { k: 'quants', label: 'Running files', type: 'ticks', o: [['Q4_K_M', 'Q4_K_M'], ['Q3_K_M', 'Q3_K_M'], ['Q5_K_M', 'Q5_K_M'], ['Q6_K', 'Q6_K'], ['Q8_0', 'Q8_0']], d: ['Q4_K_M'] },
      { k: 'experts', label: 'Teaching it back', type: 'select', o: [['lora', 'LoRA on the experts (the usual)'], ['full', 'Every weight of the experts'], ['frozen', 'Experts frozen, the rest taught']], plain: 'Distillation: the cut brain learns to answer as the full one did.' },
      { k: 'epochs', label: 'Passes over the lessons', type: 'range', o: [0.25, 3, 0.25], d: 1 },
      { k: 'learn', label: 'It learns from', type: 'select', o: [['answer', 'The answers'], ['thinking', 'The thinking'], ['both', 'Both']] },
      { k: 'sets', label: 'Your lesson sets, sent up too', type: 'ticks', o: (L) => (L.forge?.lessonSets || []).map((s) => [s.id, `${s.name} (${s.count})`]) },
      { k: 'pref', label: 'Right-vs-wrong pairs', type: 'select', o: [['off', 'Off'], ['orpo', 'ORPO (mixed into the teaching)'], ['dpo', 'DPO (a short pass after)'], ['kto', 'KTO (from marked answers)']] },
      { k: 'pairs', label: 'Pairs to learn from', type: 'select', o: (L) => [['', 'Pick pairs'], ...(L.proto?.pairs || []).map((p) => [p.id, `${p.id} (${p.pairs} pairs)`])], show: (f) => f.pref && f.pref !== 'off' },
      { k: 'onpolicy', label: 'On-policy teaching, % of lessons', type: 'range', o: [0, 50, 5], d: 0, plain: 'The small brain writes its own answers and the teacher grades them.' },
      yesNo('grpo', 'Reward pass on tool calls (GRPO)', false, 'Kept for a brain only if its held-out grade is no worse and no target drops.'),
      { k: 'grpoHours', label: 'Reward pass hours, each brain', type: 'range', o: [0.25, 6, 0.25], d: 1.5, show: (f) => f.grpo === true },
      { k: 'surgery', label: 'Surgery edits to bake in', type: 'textarea', plain: 'From an expert dials sweep: a list like [{"layer": 12, "expert": 37, "scale": 0.8}]. Empty: none.' },
      { k: 'note', label: 'A note for the plan', type: 'text' },
      { k: 'hours', label: 'Caps: hours', type: 'number', o: [0, 72, 0.5], d: '' }, { k: 'dollars', label: 'Caps: dollars', type: 'number', o: [0, 500, 0.5], d: '' }],
    check: (f) => req('/api/lab/forge/plan', { form: forgeFormOf(f) }), run: (f) => req('/api/lab/forge/save', { form: forgeFormOf(f) }) }
];

// The more of the Lab that's a page to look at more than a form: it opens on its own tab.
export const LAB_PAGES = [['inside', 'Look inside', 'Peek at the experts as it answers, and switch them live'], ['steps', 'Steps and Runs', 'The protocol step by step, every run\'s record, and Compare'], ['teach', 'Lesson library', 'Pick parts of a lesson set, add sets from anywhere'], ['test', 'Challenges board', 'The scores, and your own packs'], ['forge', 'Forge plans', 'Every key of a Forge plan, for what isn\'t here']];

// A field's value before it's touched.
export function fieldDefault(fd, L) {
  if (fd.d !== undefined) return Array.isArray(fd.d) ? [...fd.d] : fd.d;
  if (fd.type === 'ticks') return [];
  if (fd.type === 'tick') return false;
  if (fd.type === 'range' || fd.type === 'number') return fd.o[0];
  if (fd.type === 'select') { const o = typeof fd.o === 'function' ? fd.o(L) : fd.o; return o[0]?.[0] ?? ''; }
  return '';
}
