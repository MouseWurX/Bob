// Lab items 101 to 112, the page side. One module the Lab (public/lab.js) places in a few spots: the Taste test page
// under Test, a few buttons under finished jobs, the recipe file buttons on Make a brain, Clean repeats in step 2, and
// the three switches on My Lab. The server side is src/lab-plus.js. Screens are third person; Help is in Bob's voice.
import { esc } from './rich.js';
import { recipeChanges, JUDGE_MIN } from './lab-plus-core.js';
import { watchWords } from './lab-words.js';

const SWITCHES = [
  ['hoverWords', 'Show word meanings', 'Lab words like expert, quant and LoRA get a dotted line. Hover, tap or Tab to one for a one-line meaning.'],
  ['tellPhone', 'Tell my phone when a Lab job ends', 'Bob for Android, or a phone browser with Bob open, gets a notification when a Lab job finishes or fails.'],
  ['saveQuestions', 'Save to Lab in the chat', 'A Save to Lab button under your messages turns a question into a Lab challenge, with what a good answer needs.']
];
const CHECKS = [['answers', 'It answers (no refusal)'], ['contains', 'It has these words'], ['number', 'Its last number is'], ['exact', 'It is exactly'], ['declines', 'It declines']];

// `hooks`: { setRecipe(recipe, was), setChallenge(c), show(tab, sub) } so Run again can fill the Lab's own forms.
export function createPlus({ api, view, draw, note = () => {}, hooks = {}, body = null }) {
  let v = null, msg = '', tasteForm = { a: '', b: '', questions: '' }, tastePlan = null, judgeForm = { judge: '' }, judgePlan = null, askUnload = null;
  let again = null; // { was } after Run again, so Make a brain shows what changed
  let ba = {}; // before-and-after results, by run id, once opened
  let clean = { id: '', plan: null, busy: false, done: '' }, recipeMsg = '', recipePick = '';
  const brains = () => view()?.brains || [];
  const nameOf = (id) => brains().find((b) => b.id === id)?.name || id;
  async function load() { try { v = await api('/api/lab/plus'); } catch (e) { msg = e.message; } }
  if (body) watchWords(body, () => v?.extras?.hoverWords === true);
  const run = async (fn) => { msg = ''; try { return await fn(); } catch (e) { msg = e.message; return null; } };
  const unloadHtml = (what) => (askUnload?.what === what ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.names.join(', '))} is loaded. This needs the card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-plusgo="${what}" data-unload="1">Unload it and start</button><button type="button" class="link" data-plusnounload>Not now</button></div></div>` : '');
  const started = (res, what) => { if (res?.needUnload) { askUnload = { what, names: res.names }; return false; } askUnload = null; return Boolean(res); };
  const sel = (id, value, label, list, blank = '(pick one)') => `<label>${esc(label)} <select id="${id}"><option value="">${esc(blank)}</option>${list.map((b) => `<option value="${esc(b.id)}" ${value === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>`;

  // ---- 101 + 111: the Taste test page (Test tab) ----
  function tasteHtml() {
    const t = v?.taste;
    if (!t) return `<p class="muted">${esc(msg || 'Loading...')}</p>`;
    const busy = view()?.busy;
    const w = t.waiting[0];
    const pickHtml = w ? `<section class="lab-taste" aria-labelledby="taste-q"><h3 id="taste-q">Which answer is better?</h3><p class="muted">${t.waiting.length} pair${t.waiting.length === 1 ? '' : 's'} waiting. Names show after you pick.</p>
      <p><strong>${esc(w.q)}</strong></p>
      <div class="lab-taste-pair"><div class="lab-taste-side"><h4>Left</h4><div class="lab-taste-text" tabindex="0">${esc(w.left)}</div><button type="button" class="get" data-taste="left" data-id="${esc(w.id)}">Left is better</button></div>
      <div class="lab-taste-side"><h4>Right</h4><div class="lab-taste-text" tabindex="0">${esc(w.right)}</div><button type="button" class="get" data-taste="right" data-id="${esc(w.id)}">Right is better</button></div></div>
      <div class="row"><button type="button" class="link" data-taste="tie" data-id="${esc(w.id)}">About the same</button></div></section>` : '';
    const last = t.recent[0];
    const lastHtml = last ? `<p class="muted" role="status">Last pick: ${last.picked === 'tie' ? 'about the same' : esc(last.picked)}. Left was ${esc(last.left)}, right was ${esc(last.right)}.</p>` : '';
    const rank = t.ranking.length ? `<table class="lab-report"><caption class="muted">Your ranking, from ${t.picked} pick${t.picked === 1 ? '' : 's'}</caption><tr><th scope="col">Brain</th><th scope="col">Rating</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col">Same</th></tr>${t.ranking.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td>${r.rating}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.ties}</td></tr>`).join('')}</table>` : '';
    const judges = t.judges.length ? `<ul class="tlist">${t.judges.map((j) => `<li><strong>${esc(j.judge.name)}</strong>: ${esc(j.line)}${j.flips ? ` <span class="muted">It changed its pick when the answers swapped places ${j.flips} time${j.flips === 1 ? '' : 's'} of ${j.of}.</span>` : ''}</li>`).join('')}</ul>` : '';
    const speed = t.jobSpeed.length ? `<section aria-labelledby="jobspeed-h"><h3 id="jobspeed-h">Job speed</h3><p class="muted">How long a pretend five-step job takes, per brain (Challenges, Job speed). Faster words a second doesn't always mean a faster job.</p><table class="lab-report"><tr><th scope="col">Brain</th><th scope="col">Seconds a job</th><th scope="col">Came out right</th></tr>${t.jobSpeed.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td>${r.seconds}</td><td>${r.score ?? '-'}%</td></tr>`).join('')}</table></section>` : '';
    return `<div class="lab-plus-taste">
      <p class="muted">Two brains answer the same questions. You pick the better answer without seeing names, and your picks rank them by your own taste.</p>
      ${pickHtml}${lastHtml}${rank}
      <details class="lab-fold" ${t.waiting.length ? '' : 'open'}><summary>Start a taste test</summary><fieldset><legend>Two brains</legend>
        <p>${sel('plus-taste-a', tasteForm.a, 'First brain', brains())} ${sel('plus-taste-b', tasteForm.b, 'Second brain', brains())}</p>
        <p><label for="plus-taste-q">Questions, one a line <span class="muted">(empty: Bob's ${t.questions.length} everyday ones; ${t.min} to ${t.max})</span></label><br><textarea id="plus-taste-q" rows="4" placeholder="${esc(t.questions.slice(0, 2).join('\n'))}">${esc(tasteForm.questions)}</textarea></p>
        ${tastePlan ? `<div class="lab-check" role="status">${tastePlan.problems.length ? `<ul>${tastePlan.problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p><strong>Ready.</strong> ${tastePlan.count} questions.</p>`}${tastePlan.notes.map((x) => `<p class="muted">${esc(x)}</p>`).join('')}</div>` : ''}
        ${unloadHtml('taste')}
        <div class="row"><button type="button" class="get" data-plusgo="taste" ${tastePlan && !tastePlan.problems.length && !busy ? '' : 'disabled'}>${busy ? 'The Lab is busy' : 'Start'}</button></div></fieldset></details>
      <section aria-labelledby="judge-h"><h3 id="judge-h">Check the judge first</h3>
        <p class="muted">Before you trust a judging brain's scores (Teach, Best answers), it picks between your last pairs, both ways round, and you see how often it agrees with you. Needs ${JUDGE_MIN} picks; you have ${t.picked}.</p>
        <p>${sel('plus-judge', judgeForm.judge, 'Judging brain', brains())}</p>
        ${judgePlan ? `<div class="lab-check" role="status">${judgePlan.problems.length ? `<ul>${judgePlan.problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p><strong>Ready.</strong></p>'}${judgePlan.notes.map((x) => `<p class="muted">${esc(x)}</p>`).join('')}</div>` : ''}
        ${unloadHtml('judge')}
        <div class="row"><button type="button" class="get" data-plusgo="judge" ${judgePlan && !judgePlan.problems.length && !busy ? '' : 'disabled'}>Check it</button></div>
        ${judges}</section>
      ${speed}
      ${t.picked || t.waiting.length ? '<div class="row"><button type="button" class="link" data-plusforget>Forget all picks</button></div>' : ''}
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}</div>`;
  }

  // ---- Buttons under a finished job: Run again (104), Before and after (103), Safety check (107) ----
  function runExtras(x) {
    if (!v || x.state !== 'done') return '';
    const out = [];
    if ((x.kind || 'make') === 'make' || x.kind === 'challenge') out.push(`<button type="button" class="link" data-again="${esc(x.id)}">Run again with one change</button>`);
    if (x.kind === 'teach' && v.beforeAfter?.[x.id]?.can) out.push(`<button type="button" class="link" data-baopen="${esc(x.id)}" aria-expanded="${Boolean(ba[x.id])}">${v.beforeAfter[x.id].done ? (ba[x.id] ? 'Hide before and after' : 'Show before and after') : 'Before and after: 10 sample answers'}</button>`);
    if (x.id in (v.safety || {})) out.push(x.kind === 'refusals' || v.safety[x.id] ? `<button type="button" class="link" data-safety="${esc(x.id)}">${v.safety[x.id] ? 'Run the safety check again' : 'Safety check: does it still refuse?'}</button>` : '');
    const s = v.safety?.[x.id];
    const safe = s ? `<br><span class="muted">Safety check: it declined ${s.declined} of ${s.of} probes${s.missed.length ? `; it let through ${esc(s.missed.join(', '))}` : ', every kind Bob always keeps'}.</span>` : '';
    const b = ba[x.id];
    const baHtml = b ? `<table class="lab-report lab-ba"><caption class="muted">Before and after teaching${b.lessons ? `, questions from ${esc(b.lessons)}` : ''}</caption><tr><th scope="col">Question</th><th scope="col">Before</th><th scope="col">After</th></tr>${b.rows.map((r) => `<tr><th scope="row">${esc(r.q.slice(0, 300))}</th><td>${esc(r.before)}</td><td>${r.same ? '<span class="muted">(the same)</span>' : esc(r.after)}</td></tr>`).join('')}</table>` : '';
    const plain = out.filter(Boolean);
    return `${plain.length ? `<div class="row">${plain.join('')}</div>` : ''}${safe}${baHtml}${unloadHtml(`ba:${x.id}`)}${unloadHtml(`safety:${x.id}`)}`;
  }

  // ---- Make a brain: what changed after Run again (104), and recipe files (108) ----
  function againHtml(recipe) {
    if (!again) return '';
    const ch = recipeChanges(again.was, recipe, nameOf);
    return `<div class="lab-check" role="status"><p><strong>Copied from ${esc(again.was.name)}.</strong> ${ch.length ? `Changed: ${ch.map(esc).join('; ')}.` : 'Nothing changed yet. Change one thing, then Start, so you know what made the difference.'}${ch.length > 1 ? ' <span class="muted">More than one change: you won\'t know which one did it.</span>' : ''}</p><button type="button" class="link" data-againclose>Done comparing</button></div>`;
  }
  function recipeHtml() {
    const list = view()?.recipes || [];
    const shared = v?.shared?.[recipePick];
    return `<details class="lab-fold"><summary>Share a recipe as a file, or load one</summary>
      ${list.length ? `<p>${sel('plus-recipe', recipePick, 'Recipe', list.map((x) => ({ id: x.name, name: x.name })))} <button type="button" class="link" data-recipeshare ${recipePick ? '' : 'disabled'}>Save it as a file</button></p>` : '<p class="muted">Save as recipe, below, keeps one to share.</p>'}
      ${shared?.scores ? `<p class="muted">Their scores: ${shared.scores.labTest ?? '-'} on the Lab test${shared.scores.startBrain != null ? ` (the start brain: ${shared.scores.startBrain})` : ''}${shared.scores.sizeGB ? `, ${shared.scores.sizeGB} GB` : ''}${shared.scores.wordsASecond ? `, ${shared.scores.wordsASecond} words a second` : ''}. Measured on their machine.</p>` : ''}
      <p><label>Load a recipe file <input type="file" id="plus-recipe-file" accept=".json,application/json"></label></p>
      <p class="muted">A recipe holds choices, never files or paths, and the scores it got. It's a small text file you can send to anyone.</p>
      ${recipeMsg ? `<p role="status">${esc(recipeMsg)}</p>` : ''}</details>`;
  }

  // ---- 112 Clean a lesson set (step 2) ----
  function cleanHtml() {
    const sets = view()?.lessonSets || [];
    if (!sets.length) return '';
    const p = clean.plan;
    return `<details class="lab-fold"><summary>Clean a lesson set: take out repeats</summary>
      <p>${sel('plus-clean', clean.id, 'Lesson set', sets.map((x) => ({ id: x.id, name: `${x.name} (${x.count})` })))} <button type="button" class="link" data-cleanlook ${clean.id && !clean.busy ? '' : 'disabled'}>Look for repeats</button></p>
      ${clean.busy ? '<p class="muted" role="status">Reading the set...</p>' : ''}
      ${p ? `<div class="lab-check" role="status"><p><strong>${p.exact + p.near ? `${p.exact} exact repeat${p.exact === 1 ? '' : 's'} and ${p.near} near-repeat${p.near === 1 ? '' : 's'}` : 'No repeats'}</strong> in ${p.total} lessons${p.exact + p.near ? `; ${p.left} would be left` : ''}.</p>${p.examples.length ? `<ul>${p.examples.map((e) => `<li>${e.exact ? 'Same as' : 'Nearly the same as'} an earlier one: <span class="muted">${esc(e.b)}</span></li>`).join('')}</ul>` : ''}
        <div class="row">${p.exact + p.near ? `<button type="button" class="get" data-cleango>Take them out</button>` : ''}${p.backup ? '<button type="button" class="link" data-cleanundo>Put the set back as it was</button>' : ''}</div></div>` : ''}
      ${clean.done ? `<p role="status">${esc(clean.done)}</p>` : ''}
      <p class="muted">Repeats teach a brain to say the same thing too often. The first clean keeps a copy of the set, so it can go back.</p></details>`;
  }

  // ---- My Lab: the switches (109, 110, 102), all off until ticked ----
  function switchesHtml() {
    const x = v?.extras || {};
    return `<section class="lab-plus-switches" aria-labelledby="lab-switches-h"><h3 id="lab-switches-h">Lab extras</h3>${SWITCHES.map(([k, label, what]) => `<label class="lab-opt"><input type="checkbox" data-plusswitch="${k}" ${x[k] ? 'checked' : ''}> <span><strong>${esc(label)}</strong> <span class="muted">· off unless ticked</span><br><span class="muted">${esc(what)}</span></span></label>`).join('')}</section>`;
  }

  async function change(el) {
    if (el.dataset?.plusswitch) { await run(async () => { v.extras = (await api('/api/lab/plus/switch', { key: el.dataset.plusswitch, on: el.checked })).extras; }); return 'draw'; }
    if (el.id === 'plus-taste-a' || el.id === 'plus-taste-b') { tasteForm[el.id === 'plus-taste-a' ? 'a' : 'b'] = el.value; tastePlan = await run(() => api('/api/lab/plus/taste/plan', tasteForm)); return 'draw'; }
    if (el.id === 'plus-taste-q') { tasteForm.questions = el.value; tastePlan = await run(() => api('/api/lab/plus/taste/plan', tasteForm)); return 'draw'; }
    if (el.id === 'plus-judge') { judgeForm.judge = el.value; judgePlan = await run(() => api('/api/lab/plus/judge/plan', judgeForm)); return 'draw'; }
    if (el.id === 'plus-recipe') { recipePick = el.value; recipeMsg = ''; return 'draw'; }
    if (el.id === 'plus-clean') { clean = { id: el.value, plan: null, busy: false, done: '' }; return 'draw'; }
    if (el.id === 'plus-recipe-file') {
      const f = el.files?.[0]; if (!f) return true;
      if (f.size > 256 * 1024) { recipeMsg = 'That file is too big for a recipe.'; return 'draw'; }
      try { const r = await api('/api/lab/plus/recipe/load', { text: await f.text() }); recipeMsg = `Loaded ${r.name}. Pick it in "Start from a saved recipe". ${r.notes.join(' ')}`; await hooks.reload?.(); await load(); } catch (e) { recipeMsg = e.message; }
      return 'draw';
    }
    return false;
  }

  async function click(b) {
    const d = b.dataset;
    if (d.taste) { const r = await run(() => api('/api/lab/plus/pick', { id: d.id, side: d.taste })); if (r) note(r.picked === 'tie' ? 'About the same.' : `You picked ${r.picked}.`); await load(); return 'draw'; }
    if ('plusnounload' in d) { askUnload = null; return 'draw'; }
    if (d.plusgo) {
      const un = d.unload === '1', what = d.plusgo;
      let res = null;
      if (what === 'taste') res = await run(() => api('/api/lab/plus/taste/start', { ...tasteForm, unload: un }));
      else if (what === 'judge') res = await run(() => api('/api/lab/plus/judge/start', { ...judgeForm, unload: un }));
      else if (what.startsWith('ba:')) res = await run(() => api('/api/lab/plus/before-after/start', { run: what.slice(3), unload: un }));
      else if (what.startsWith('safety:')) res = await run(() => api('/api/lab/plus/safety/start', { run: what.slice(7), unload: un }));
      if (started(res, what)) await hooks.reload?.();
      return 'draw';
    }
    if ('plusforget' in d) { await run(() => api('/api/lab/plus/taste/forget', {})); await load(); return 'draw'; }
    if (d.again) {
      const r = await run(() => api('/api/lab/plus/again', { run: d.again }));
      if (r?.kind === 'make') { again = { was: r.was }; await hooks.setRecipe?.(r.recipe); }
      else if (r?.kind === 'challenge') { again = null; await hooks.setChallenge?.(r.challenge); }
      return 'draw';
    }
    if ('againclose' in d) { again = null; return 'draw'; }
    if (d.baopen) {
      if (ba[d.baopen]) { delete ba[d.baopen]; return 'draw'; }
      if (v.beforeAfter?.[d.baopen]?.done) { const r = await run(() => api('/api/lab/plus/before-after', { run: d.baopen })); if (r?.result) ba[d.baopen] = r.result; return 'draw'; }
      const res = await run(() => api('/api/lab/plus/before-after/start', { run: d.baopen }));
      if (started(res, `ba:${d.baopen}`)) await hooks.reload?.();
      return 'draw';
    }
    if (d.safety) { const res = await run(() => api('/api/lab/plus/safety/start', { run: d.safety })); if (started(res, `safety:${d.safety}`)) await hooks.reload?.(); return 'draw'; }
    if ('recipeshare' in d) {
      const r = await run(() => api('/api/lab/plus/recipe/share', { name: recipePick }));
      if (r) { try { const url = URL.createObjectURL(new Blob([JSON.stringify(r.recipe, null, 1)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = r.file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); recipeMsg = `Saved ${r.file} to your downloads.`; } catch (e) { recipeMsg = `Couldn't save the file: ${e.message}`; } }
      return 'draw';
    }
    if ('cleanlook' in d) { clean.busy = true; clean.done = ''; draw(); clean.plan = await run(() => api('/api/lab/plus/clean/plan', { id: clean.id })); clean.busy = false; return 'draw'; }
    if ('cleango' in d) { const r = await run(() => api('/api/lab/plus/clean', { id: clean.id })); if (r) clean = { id: clean.id, plan: null, busy: false, done: `Took out ${r.removed} lesson${r.removed === 1 ? '' : 's'}; ${r.left} left.` }; await hooks.reload?.(); return 'draw'; }
    if ('cleanundo' in d) { const r = await run(() => api('/api/lab/plus/clean/undo', { id: clean.id })); if (r) clean = { id: clean.id, plan: null, busy: false, done: 'The set is back as it was before the clean.' }; await hooks.reload?.(); return 'draw'; }
    return false;
  }
  // When one of this module's jobs finishes, read again.
  const KINDS = ['taste', 'judge-check', 'before-after', 'safety'];
  async function runDone(x) { if (KINDS.includes(x.kind) && x.state !== 'running') { await load(); return true; } return false; }
  return { load, tasteHtml, runExtras, againHtml, recipeHtml, cleanHtml, switchesHtml, change, click, runDone, error: () => msg, kinds: KINDS };
}
