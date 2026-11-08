// 1.5.142 Lab templates: the cut-and-train methods used so far, as recipes with the choices already ticked
// (bob-design/cut-and-train-templates.md). One list for the Lab page and the server (src/lab.js imports this file),
// so it works offline. `lab` fills the Lab's steps 2 to 5; `forge` is the same method as Forge plan fields, printed by
// Show the recipe so a Forge run can start from the same choices. Templates that need a rented card, or a method that
// isn't built yet, are shown greyed out with the reason, never offered.
export const TEMPLATES = [
  {
    template: 'lab-local-cut', title: 'Lab local cut', where: 'here', needs: ['experts'],
    help: 'Everything the Lab can do here, for free: cut the experts your chats use, take out sight or hearing if you like, make the running files, and test it next to the brain it came from.',
    lab: { lessons: { kind: 'chats' }, smaller: { cut: { how: 'busiest' }, files: ['Q4_K_M'], measure: true }, test: { compare: true } },
    forge: null
  },
  {
    template: 'plain-cut', title: 'Plain cut', where: 'either', needs: ['experts'],
    help: 'Keep the busiest experts in every layer, counted on one lesson set, and nothing else: no teaching back. It\'s how the first Rikers and Bills were made, before the coverage cut.',
    lab: { lessons: { kind: 'chats' }, smaller: { cut: { how: 'busiest' }, files: [] }, test: { compare: true } },
    forge: { rung: { keep: 'N', from: '<teacher>', counts: '<counts file>' } }
  },
  {
    template: 'coverage-cut-heal', title: 'Coverage cut and heal', where: 'rented', needs: ['experts'],
    help: 'Keeps the experts every skill needs (95% of its routing, 99% for tools, coding and formats), cuts, then teaches it back against the teacher\'s odds: 70% odds, 30% words, one full pass. Riker was made this way.',
    lab: null,
    forge: { rung: { keep: 'cover', cover: 0.95, strong: ['tools', 'coding', 'formats'], strong_cover: 0.99 }, heal: { experts: 'lora', epochs: 1, alpha: 0.7 } }
  },
  {
    template: 'train-teacher', title: 'Train the teacher', where: 'rented', needs: [],
    help: 'No cut. The full brain learns every lesson by plain next-word training, and stays on the drive as the teacher for every cut after it. Bobert is made this way.',
    lab: null,
    forge: { train_teacher: { name: '<name>', nickname: '<nickname>', hours: 8, experts: 'all', epochs: 1 } }
  },
  {
    template: 'outside-traces', title: 'Learn from outside traces', where: 'rented', needs: [],
    help: 'Lessons written by other, bigger teachers (published trace sets), checked and matched to our own count, then taught by their words only, since there are no odds from those teachers.',
    lab: null,
    forge: { extra_lessons: ['<lessons-ext-*.jsonl>'], heal: { alpha: 0 } }
  },
  {
    template: 'merge-experts', title: 'Merge experts', where: 'rented', needs: ['experts'], later: true,
    help: 'Folds rarely used experts into the ones kept instead of dropping them (Garfield\'s method).',
    lab: null, forge: null
  },
  {
    template: 'layer-width-cut', title: 'Layer or width cut', where: 'rented', needs: [], later: true,
    help: 'Fewer layers, or a narrower brain. It hurts most and needs the longest teaching back.',
    lab: null, forge: null
  }
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.template);
export const templateById = (id) => TEMPLATES.find((t) => t.template === id) || null;

// Why a template can't be used here with this brain ('' = it can). facts = the brain's facts (experts etc.).
export function templateWhyNot(t, facts = {}, brainName = 'This brain') {
  if (!t) return 'There is no template by that name.';
  if (t.later) return 'Not built yet. It\'s on the list so you can see the whole menu.';
  if (t.where === 'rented') return 'This one needs a rented card. Renting comes in Lab 2; for now it runs as a Forge plan (Show the recipe has it).';
  if (t.needs.includes('experts') && facts.experts === 0) return `${brainName} isn't a mixture-of-experts brain, so there are no experts to cut.`;
  return '';
}

// Fill a recipe from a template: steps 2 to 5 change, the brain stays. keepDefault = the experts to keep when the
// template cuts (the Lab page passes the brain's second suggested size). Full-size-only choices drop on running files.
export function applyTemplate(recipe, t, { keepDefault = 8, fullSize = true, brainName = '' } = {}) {
  const l = t.lab || {};
  const s = l.smaller || {};
  const out = JSON.parse(JSON.stringify(recipe));
  out.template = t.template;
  out.lessons = { ...out.lessons, ...(l.lessons || {}) };
  out.smaller = {
    sight: false, hearing: false,
    cut: s.cut ? { how: s.cut.how || 'busiest', keep: keepDefault, file: '' } : null,
    files: fullSize ? [...(s.files || [])] : [],
    measure: Boolean(fullSize && s.measure && (s.files || []).length)
  };
  out.test = { compare: l.test?.compare !== false };
  if (brainName) out.name = `${brainName} ${t.title}`.slice(0, 60);
  return out;
}
