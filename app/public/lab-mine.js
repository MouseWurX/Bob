// My Lab: one list of what this Lab has made and measured, each with a button to the page it lives on. It only reads
// what the Lab page already has (brains made, lesson sets, scores, size ladders, saved recipes, recent jobs), so it
// adds no server call, and it never shows a file path.
import { esc } from './rich.js';

const STATE = { running: 'running', done: 'done', failed: 'failed', stopped: 'stopped' };
// [tab, page] each shelf opens. Kept beside the shelves so a test can check every target is a real Lab page.
export const SHELVES = [
  { id: 'brains', title: 'Brains you made', to: ['test', 'challenges'], go: 'Test one', empty: 'None yet. Make a brain makes them.', emptyTo: ['make', ''], emptyGo: 'Make a brain' },
  { id: 'scores', title: 'Scores', to: ['test', 'challenges'], go: 'Open the scoreboard', empty: 'None yet. Run some challenges.', emptyTo: ['test', 'challenges'], emptyGo: 'Open Challenges' },
  { id: 'ladders', title: 'Size ladders', to: ['test', 'smaller'], go: 'Open Smaller', empty: 'None yet. Smaller makes one brain in six sizes.', emptyTo: ['test', 'smaller'], emptyGo: 'Open Smaller' },
  { id: 'sets', title: 'Lesson sets', to: ['teach', 'teach'], go: 'Teach with one', empty: 'None yet. Make a brain, Cut experts, step 2 writes or builds one.', emptyTo: ['make', ''], emptyGo: 'Make a brain' },
  { id: 'recipes', title: 'Saved recipes', to: ['make', ''], go: 'Open Make a brain', empty: 'None yet. Save as recipe, on Make a brain, keeps one.', emptyTo: ['make', ''], emptyGo: 'Make a brain' },
  { id: 'jobs', title: 'Recent jobs', to: ['make', ''], go: '', empty: 'Nothing has run yet.', emptyTo: null, emptyGo: '' },
];

// What goes on each shelf, as [name, detail] rows. Pure, so tests can call it with a made-up view.
export function shelfRows(view = {}) {
  const gb = (n) => (typeof n === 'number' ? `${n} GB` : '');
  const join = (...parts) => parts.filter(Boolean).join(' · ');
  return {
    brains: (view.made || []).map((m) => [m.name, join(gb(m.sizeGB), m.from ? `from ${m.from}` : '')]),
    scores: (view.scores || []).map((s) => [s.name, join(typeof s.overall === 'number' ? `${s.overall} out of 100 overall` : 'no overall score yet', s.when)]),
    ladders: (view.ladders || []).map((l) => [l.brain?.name || 'A brain', join(`${(l.rows || []).length} sizes`, l.deleted ? 'files deleted, table kept' : '', l.when)]),
    sets: (view.lessonSets || []).map((x) => [x.name, join(typeof x.count === 'number' ? `${x.count} lessons` : '', x.teacher ? `taught by ${x.teacher}` : '')]),
    recipes: (view.recipes || []).map((x) => [x.name || 'A recipe', '']),
    jobs: (view.runs || []).slice(0, 8).map((x) => [x.name, STATE[x.state] || String(x.state || '')]),
  };
}

const goBtn = (to, label) => (to && label ? `<button type="button" class="link" data-minego="${to[0]}:${to[1]}">${esc(label)}</button>` : '');

export function mineHtml(view = {}) {
  const rows = shelfRows(view);
  return `<div id="lab-page-mine" role="tabpanel" aria-labelledby="lab-tab-mine">
    <p class="muted">Everything this Lab has made and measured. Each list opens the page it lives on.</p>
    <div class="lab-shelves">${SHELVES.map((s) => { const list = rows[s.id] || []; return `<section class="lab-shelf" aria-labelledby="lab-shelf-${s.id}"><h3 id="lab-shelf-${s.id}">${esc(s.title)} <span class="muted">${list.length}</span></h3>
      ${list.length ? `<ul class="tlist">${list.map(([name, detail]) => `<li><strong>${esc(name)}</strong>${detail ? ` <span class="muted">${esc(detail)}</span>` : ''}</li>`).join('')}</ul>${goBtn(s.to, s.go)}` : `<p class="muted">${esc(s.empty)}</p>${goBtn(s.emptyTo, s.emptyGo)}`}</section>`; }).join('')}</div>
  </div>`;
}
