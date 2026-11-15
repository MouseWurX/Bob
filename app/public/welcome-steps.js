// The Welcome (first-time setup) as seven short pages, each on its own (the owner, Nov 14 2026):
//   Hello · Engines · Brains · Users · Privacy · Helpers · Done
// Back sits bottom left and Next bottom right, and each names the page it goes to. Nothing here is new behaviour:
// every tick is the same setting as in Settings, and nothing downloads until Get Bob ready on the Brains page.
// Pure helpers only (no page, no fetch), so the tests can run them as they are. cellar.js draws the pages.

export const WSTEPS = [
  { id: 'hello', name: 'Hello' },
  { id: 'engines', name: 'Engines' },
  { id: 'brains', name: 'Brains' },
  { id: 'users', name: 'Users' },
  { id: 'privacy', name: 'Privacy' },
  { id: 'helpers', name: 'Helpers' },
  { id: 'done', name: 'Done' }
];
export const stepIndex = (id) => Math.max(0, WSTEPS.findIndex((s) => s.id === id));
export const clampStep = (i) => Math.min(WSTEPS.length - 1, Math.max(0, Number(i) || 0));

// The Engines page: everything that isn't a brain, grouped by the job it does. eng: program ids. cats: model categories.
// keys: the Settings switches shown under that group (3D has no download of its own here, only its switches).
export const ENGINE_GROUPS = [
  { id: 'pictures', name: 'Pictures', does: 'Make and edit pictures.', eng: ['sdcpp'], cats: ['images'] },
  { id: 'video', name: 'Video', does: 'Short clips. Runs on the pictures engine.', eng: [], cats: ['video'] },
  { id: 'voice', name: 'Voice', does: 'Read my replies aloud.', eng: ['kokoro', 'piper', 'chatterbox'], cats: ['voice'] },
  { id: 'hearing', name: 'Hearing', does: 'Turn your voice into text.', eng: ['whispercpp'], cats: ['speech'] },
  { id: 'sound', name: 'Sound and music', does: 'Music and sound effects.', eng: ['audio'], cats: ['music'] },
  { id: '3d', name: '3D', does: 'Models from pictures, and parts for a printer.', eng: ['model3d', 'openscad'], cats: [], keys: ['model3d', 'parts3d'] }
];
// Shown on the Engines page, so the Helpers page leaves them out. profilesOn has the Users page.
export const WELCOME_OWN_KEYS = ['model3d', 'parts3d', 'profilesOn'];

const engId = (r) => (r.kind === 'engine' ? r.id.replace(/^engine:/, '') : '');
const groupOf = (r) => ENGINE_GROUPS.find((g) => (r.kind === 'engine' ? g.eng.includes(engId(r)) : g.cats.includes(r.category)));

// Split the Get me ready rows (equip.js readyList) between the two pages. Brains: the brain program, every chat,
// coding and seeing brain, and memory (embeddings). Engines: the rest, by group. Nothing is dropped: a row no group
// claims stays with the brains.
export function splitWelcomeRows(rows = []) {
  const groups = ENGINE_GROUPS.map((g) => ({ ...g, rows: [] }));
  const brains = [];
  for (const r of rows) {
    const g = groupOf(r);
    if (g) groups.find((x) => x.id === g.id).rows.push(r); else brains.push(r);
  }
  return { groups, brains };
}

// The brain program, by name. The owner (Nov 14): the setup names no other brain program; Brain Engine is described
// as a fork of llama.cpp. Where it has no build yet (a Mac, an ARM board), the plain build is called what it does.
export function welcomeRowName(r) {
  if (r.id === 'engine:brainengine') return 'Brain Engine';
  if (r.id === 'engine:llamacpp') return 'Brain program';
  return r.name;
}

// The size of what is ticked among some rows, in GB (rows already here or blocked don't count).
export function tickedGB(rows, picks) {
  return Math.round(rows.filter((r) => picks?.has(r.id) && !r.here && !r.blocked).reduce((t, r) => t + (r.sizeGB || 0), 0) * 10) / 10;
}

// Step header: "Step 2 of 7 · Engines", one dot per page (each a button), and Skip setup.
export function stepHeadHtml(i, esc) {
  const s = WSTEPS[clampStep(i)];
  return `<header class="wz-head">
    <p class="wz-count">Step ${clampStep(i) + 1} of ${WSTEPS.length} · ${esc(s.name)}</p>
    <ol class="wz-dots" aria-label="Setup pages">${WSTEPS.map((x, n) => `<li><button type="button" class="wz-dot${n === clampStep(i) ? ' on' : n < clampStep(i) ? ' past' : ''}" data-wstep="${n}" aria-label="${esc(x.name)}"${n === clampStep(i) ? ' aria-current="step"' : ''} title="${esc(x.name)}"></button></li>`).join('')}</ol>
    <button type="button" class="wz-skip link" data-skip>Skip setup</button>
  </header>`;
}

// Bottom of every page: Back on the left and Next on the right, each naming where it goes. The last page's Next
// finishes the setup (data-skip saves setupDone, the same as before).
export function stepNavHtml(i, esc) {
  const n = clampStep(i), prev = WSTEPS[n - 1], next = WSTEPS[n + 1];
  const back = prev ? `<button type="button" class="wz-back" data-wstep="${n - 1}"><span class="wz-dir">← Back</span><span class="wz-to">${esc(prev.name)}</span></button>` : '<span></span>';
  const fwd = next ? `<button type="button" class="get wz-next" data-wstep="${n + 1}"><span class="wz-dir">Next →</span><span class="wz-to">${esc(next.name)}</span></button>`
    : '<button type="button" class="get wz-next" data-skip><span class="wz-dir">Finish</span><span class="wz-to">Start chatting</span></button>';
  return `<nav class="wz-nav" aria-label="Setup steps">${back}${fwd}</nav>`;
}
