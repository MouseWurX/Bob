// 1.5.135 🧪 Computer Science Lab (Lab 1): make your own brain from one on this replicant matrix, in five steps, with
// checkboxes and radio buttons instead of command-line flags. Show the recipe shows the exact commands. Rented cards
// and writing new lesson sets come in Lab 2 and are shown as "later", never offered.
import { esc } from './rich.js';

const $ = (id) => document.getElementById(id);
const STEPS = [['brain', '1 Pick a brain'], ['lessons', '2 Lessons'], ['smaller', '3 Make it smaller'], ['where', '4 Where it runs'], ['test', '5 Test and use']];
const TYPE_NOTE = { Q4_K_M: 'Q4 (recommended)', Q5_K_M: 'Q5', Q6_K: 'Q6', Q8_0: 'Q8', Q3_K_M: 'Q3 (only for brains meant for 8 GB or less)' };
const PARTS = { general: 'General knowledge', tools: 'Picking the right tool', coding: 'Coding', following: 'Following instructions' };

export function createLab({ api, note }) {
  const dlg = $('lab'), body = $('lab-body');
  $('lab-close').onclick = () => dlg.close();
  let view = null, step = 'brain', plan = null, showRecipe = false, msg = '', askUnload = null;
  const r = { name: '', from: '', lessons: { kind: 'none', file: '', chunks: 200 }, smaller: { sight: false, hearing: false, cut: null, files: [] }, test: { compare: true } };
  const brain = () => view?.brains.find((b) => b.id === r.from);
  const running = () => view?.runs.find((x) => x.state === 'running');

  async function load() {
    try { view = await api('/api/lab'); } catch (e) { msg = e.message; }
    await replan();
  }
  async function replan() {
    try { plan = r.from ? await api('/api/lab/plan', { recipe: r }) : null; } catch (e) { plan = { problems: [e.message], notes: [], steps: [] }; }
    draw();
  }

  const radio = (name, value, on, label, hint = '', dis = '') => `<label class="lab-opt${dis ? ' dim' : ''}"><input type="radio" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}> <span><strong>${esc(label)}</strong>${hint ? `<br><span class="muted">${esc(hint)}</span>` : ''}${dis ? `<br><span class="muted">${esc(dis)}</span>` : ''}</span></label>`;
  const box = (key, on, label, hint = '', dis = '', more = '') => `<label class="lab-opt${dis ? ' dim' : ''}"><input type="checkbox" data-k="${key}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}> <span><strong>${esc(label)}</strong>${more}${hint ? `<br><span class="muted">${esc(hint)}</span>` : ''}${dis ? `<br><span class="muted">${esc(dis)}</span>` : ''}</span></label>`;
  const later = (label, hint) => `<div class="lab-opt dim" aria-disabled="true"><span><strong>${esc(label)}</strong> <span class="lab-later">Later (Lab 2)</span><br><span class="muted">${esc(hint)}</span></span></div>`;

  function brainStep() {
    if (!view.brains.length) return '<p>There are no brains on this replicant matrix the Lab can work with yet. Get one in Get models first (any brain that runs on Bob\'s own engine).</p>';
    return `<fieldset><legend>Which brain do you want to start from?</legend>${view.brains.map((b) => {
      const f = b.facts;
      if (!f) return radio('from', b.id, false, b.name, '', b.error || 'Bob couldn\'t read its file.');
      const can = [f.experts ? `cut experts (${f.experts} per layer, ${f.used} picked per word)` : 'everything except an expert cut (it isn\'t a mixture-of-experts brain)', f.sight && 'take out sight', f.hearing && 'take out hearing', f.fullSize ? 'make running files' : `it's already a running file (${f.fileType})`].filter(Boolean).join(', ');
      return radio('from', b.id, r.from === b.id, `${b.name}${b.madeInLab ? ' (made in the Lab)' : ''}${b.community ? ' · community' : ''}`, `${f.sizeGB} GB. ${b.fit} In the Lab: ${can}.${b.license ? ` Licence: ${b.license}.` : ''}`);
    }).join('')}</fieldset>
    <p><label>Name for the new brain <input id="lab-name" type="text" maxlength="60" value="${esc(r.name)}" autocomplete="off"></label></p>`;
  }

  function lessonsStep() {
    const l = r.lessons;
    return `<fieldset><legend>Lessons</legend>
      <p class="muted">Lessons are what the new brain should be good at. In Lab 1 they're used to count which experts your kind of work uses, so an expert cut keeps those.</p>
      ${radio('lessons', 'none', l.kind === 'none', 'No lessons', 'For steps that don\'t need them: take out sight or hearing, make the running files, or cut with an expert list you have.')}
      ${radio('lessons', 'chats', l.kind === 'chats', 'My chats with Bob', 'Your past chats, as they are. They stay on this replicant matrix.')}
      ${radio('lessons', 'file', l.kind === 'file', 'A lesson set I have', 'A lessons.jsonl from the model lab, or any text file.')}
      ${l.kind === 'file' ? `<p><label>Lesson file <input id="lab-lessons-file" type="text" value="${esc(l.file)}" placeholder="C:\\...\\lessons.jsonl"></label></p>` : ''}
      ${l.kind !== 'none' ? `<p><label for="lab-chunks">How much of it to count on</label> <input id="lab-chunks" type="range" min="20" max="2000" step="20" value="${l.chunks}" aria-describedby="lab-chunks-note"> <input id="lab-chunks-n" type="number" min="20" max="2000" step="20" value="${l.chunks}" aria-label="Pieces to count on"> pieces <span id="lab-chunks-note" class="muted">(about ${Math.max(1, Math.round(l.chunks / 20))} minutes on a 16 GB card)</span></p>` : ''}
      ${later('Write a new lesson set', 'Pick skills (tools, coding, thinking, games and more) and a teacher, and Bob writes the lessons.')}
      ${later('Record the teacher\'s odds', 'Bob saves the teacher\'s top 32 guesses for every word, not only its answer. A brain learns much more from the odds than from the words alone.')}
    </fieldset>`;
  }

  function smallerStep() {
    const b = brain(), f = b?.facts || {}, s = r.smaller;
    const cut = s.cut;
    const cutSizes = b?.cuts || [];
    return `<fieldset><legend>Make it smaller (these run in this order)</legend>
      ${box('sight', s.sight, 'Take out sight', f.sight ? `The picture reader is left behind. Saves about ${f.readerGB || 1} GB on disk and on the card. The brain can't read pictures any more; everything else is the same.` : '', f.sight ? '' : 'This brain can\'t see pictures.')}
      ${box('hearing', s.hearing, 'Take out hearing', f.hearing ? 'The sound reader is left behind. The brain can\'t hear sound any more; everything else is the same.' : '', f.hearing ? '' : 'This brain can\'t hear sound.')}
      ${box('cut', Boolean(cut), 'Cut experts', 'Keeps the experts your work uses and drops the rest. Without Teach it back (Lab 2) it loses some general knowledge first, so test it.', f.experts ? '' : 'This brain isn\'t a mixture-of-experts brain.')}
      ${cut ? `<div class="lab-sub">
        ${radio('cuthow', 'busiest', cut.how === 'busiest', 'Keep the busiest experts', 'Counted on the lessons from step 2.')}
        ${radio('cuthow', 'file', cut.how === 'file', 'Use an expert list I have', 'A keep list from an earlier cut (for example a *-keep.json).')}
        ${later('Keep every skill covered (recommended)', 'Counts each skill on its own and keeps the experts every skill needs.')}
        ${cut.how === 'file' ? `<p><label>Expert list file <input id="lab-keep-file" type="text" value="${esc(cut.file)}"></label></p>` : ''}
        <fieldset><legend>How many experts to keep per layer</legend>${cutSizes.map((c) => radio('keep', String(c.keep), cut.keep === c.keep, `${c.keep} experts · about ${c.gb} GB`, c.fit)).join('')}
        <label class="lab-opt"><input type="radio" name="keep" value="custom" ${cutSizes.some((c) => c.keep === cut.keep) ? '' : 'checked'}> <span><strong>Custom</strong> <input id="lab-keep-n" type="number" min="${f.used || 1}" max="${(f.experts || 2) - 1}" value="${cut.keep}" aria-label="Experts to keep per layer"></span></label></fieldset>
      </div>` : ''}
      ${later('Layer cut (Experimental)', 'Fewer layers: the least-used ones, measured on your lessons.')}
      ${later('Width cut (Experimental)', 'A narrower brain. This one hurts most and needs the longest teach-back.')}
      ${later('Teach it back', 'Teaches the cut brain back against the original with the lessons and odds ("heal" in the forge). Light (quick; recommended) or Full.')}
      ${later('Make it one file', 'Folds the taught-back part into the brain so it\'s one file ("fold" in the forge).')}
      <fieldset><legend>Make the running files</legend>
        ${f.fullSize ? '' : `<p class="muted">${esc(b?.name || 'This brain')} is already a running file (${esc(f.fileType || '?')}), so it stays as it is. Making running files needs the full-size copy (F16 or BF16).</p>`}
        ${view.types.filter((t) => t !== 'Q3_K_M' || (f.sizeGB || 99) <= 16).map((t) => box(`file:${t}`, s.files.includes(t), TYPE_NOTE[t], f.sizeGB ? `About ${Math.round(f.sizeGB * ({ Q4_K_M: 0.3, Q5_K_M: 0.36, Q6_K: 0.41, Q8_0: 0.53, Q3_K_M: 0.25 }[t] || 0.3) * 10) / 10} GB from this brain${cut ? ' before the cut' : ''}.` : '', f.fullSize ? '' : 'Needs the full-size copy.')).join('')}
      </fieldset>
    </fieldset>`;
  }

  function whereStep() {
    return `<fieldset><legend>Where it runs</legend>
      ${radio('where', 'here', true, 'This replicant matrix', 'Free. Uses this replicant matrix\'s card and disk. Bob asks before he unloads his own brain to make room, and the Lab waits while Gaming is on.')}
      ${later('Rented card(s)', 'One card, a few cards in a row, or several at once, with limits you set. Only shows when Let Bob hire is on in Online services.')}
    </fieldset>`;
  }

  function testStep() {
    return `<fieldset><legend>Test and use</legend>
      <p>Every Lab brain takes the Lab test before it can go into Bob: ${Object.values(PARTS).join(', ').toLowerCase()}.</p>
      ${box('compare', r.test.compare, `Test ${brain()?.name || 'the brain I started from'} too, to compare`, 'Takes about as long again. Shows plainly if the new brain does worse.')}
    </fieldset>`;
  }

  function runsHtml() {
    if (!view.runs.length) return '';
    return `<section class="lab-runs"><h3>Lab jobs</h3><ul class="tlist">${view.runs.map((x) => `<li><strong>${esc(x.name)}</strong> <span class="muted">from ${esc(x.from)} · ${x.state === 'running' ? `${esc(x.stepLabel || '')}${x.progress ? `, ${x.progress}%` : ''}` : x.state === 'done' ? `done${x.sizeGB ? `, ${x.sizeGB} GB` : ''}` : esc(x.state)}</span>
      ${x.state === 'running' ? ' <button type="button" class="link" data-stop>Stop</button>' : ''}
      ${x.state === 'failed' || x.state === 'stopped' ? `<br><span class="muted">${esc(x.error || '')}</span>` : ''}
      ${x.report?.made ? `<table class="lab-report"><caption class="muted">Lab test (out of 100)</caption><tr><th scope="col"></th><th scope="col">${esc(x.name)}</th>${x.report.from ? `<th scope="col">${esc(x.from)}</th>` : ''}</tr>${Object.keys(PARTS).map((k) => `<tr><th scope="row">${esc(PARTS[k])}</th><td>${x.report.made.parts[k]?.score ?? '-'}</td>${x.report.from ? `<td>${x.report.from.parts[k]?.score ?? '-'}</td>` : ''}</tr>`).join('')}<tr><th scope="row">All</th><td>${x.report.made.score}</td>${x.report.from ? `<td>${x.report.from.score}</td>` : ''}</tr><tr><th scope="row">Size</th><td>${x.report.sizeGB} GB</td>${x.report.from ? `<td>${x.report.fromGB} GB</td>` : ''}</tr><tr><th scope="row">Words a second</th><td>${x.report.made.tps || '-'}</td>${x.report.from ? `<td>${x.report.from.tps || '-'}</td>` : ''}</tr></table>
        ${x.used ? '<span class="muted">In Bob, under Get models.</span>' : `<button type="button" class="get" data-use="${esc(x.id)}">Use in Bob</button>`}` : ''}</li>`).join('')}</ul></section>`;
  }

  function draw() {
    if (!view) { body.innerHTML = `<p class="muted">${esc(msg || 'Loading...')}</p>`; return; }
    if (!view.on) { body.innerHTML = '<p>The Lab is off. Turn on <strong>Show the Computer Science Lab</strong> in Settings, How Bob works, Brains.</p>'; return; }
    const i = STEPS.findIndex(([id]) => id === step);
    const html = { brain: brainStep, lessons: lessonsStep, smaller: smallerStep, where: whereStep, test: testStep }[step]();
    const busy = running();
    body.innerHTML = `<div class="lab">
      <p class="muted">Make your own brain from one on this replicant matrix. Each step says what it does and whether this replicant matrix can do it. Show the recipe shows the exact commands, if you want to learn them.</p>
      ${view.recipes.length ? `<p><label>Start from a saved recipe <select id="lab-recipe"><option value="">(none)</option>${view.recipes.map((x, n) => `<option value="${n}">${esc(x.name)}</option>`).join('')}</select></label></p>` : ''}
      ${runsHtml()}
      <nav class="lab-steps" aria-label="Lab steps"><ol>${STEPS.map(([id, label], n) => `<li><button type="button" class="lab-step${id === step ? ' on' : ''}" data-step="${id}" ${id === step ? 'aria-current="step"' : ''} ${n > 0 && !r.from ? 'disabled' : ''}>${esc(label)}</button></li>`).join('')}</ol></nav>
      <div class="lab-panel" id="lab-panel">${html}</div>
      ${plan ? `<div class="lab-check" role="status">${plan.problems.length ? `<p><strong>Before it can start:</strong></p><ul>${plan.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : `<p><strong>Ready.</strong> ${plan.steps.length} steps: ${plan.steps.map((s) => esc(s.label)).join(', ')}.</p>`}${plan.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>` : ''}
      ${askUnload ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the card</strong><span>${esc(askUnload.join(', '))} is loaded. The Lab needs the card, so Bob unloads it first; it loads again the next time you chat (which slows the Lab down while it runs).</span><div class="row"><button type="button" class="get" data-unload>Unload it and start</button><button type="button" class="link" data-nounload>Not now</button></div></div>` : ''}
      <div class="row lab-actions">
        ${i > 0 ? '<button type="button" class="link" data-back>Back</button>' : ''}
        ${i < STEPS.length - 1 ? `<button type="button" class="get" data-next ${r.from ? '' : 'disabled'}>Next</button>` : `<button type="button" class="get" data-start ${plan && !plan.problems.length && !busy ? '' : 'disabled'}>${busy ? 'The Lab is busy' : 'Start'}</button>`}
        <button type="button" class="link" data-recipe aria-expanded="${showRecipe}">Show the recipe</button>
        <button type="button" class="link" data-save ${r.name ? '' : 'disabled'}>Save as recipe</button>
      </div>
      ${showRecipe ? `<div class="lab-recipe"><pre tabindex="0">${esc(plan?.text || 'Pick a brain first.')}</pre><button type="button" class="link" data-copy>Copy</button></div>` : ''}
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
    </div>`;
  }

  body.addEventListener('change', async (e) => {
    const el = e.target; msg = '';
    if (el.name === 'from') { r.from = el.value; const b = brain(); if (!r.name && b) r.name = `${b.name} Lab`; r.smaller = { sight: false, hearing: false, cut: null, files: [] }; }
    else if (el.name === 'lessons') r.lessons.kind = el.value;
    else if (el.name === 'cuthow') r.smaller.cut.how = el.value;
    else if (el.name === 'keep') { if (el.value !== 'custom') r.smaller.cut.keep = Number(el.value); }
    else if (el.id === 'lab-keep-n') r.smaller.cut.keep = Number(el.value);
    else if (el.id === 'lab-chunks' || el.id === 'lab-chunks-n') r.lessons.chunks = Number(el.value);
    else if (el.id === 'lab-name') r.name = el.value;
    else if (el.id === 'lab-lessons-file') r.lessons.file = el.value.trim().replace(/^"|"$/g, '');
    else if (el.id === 'lab-keep-file') r.smaller.cut.file = el.value.trim().replace(/^"|"$/g, '');
    else if (el.id === 'lab-recipe') { const x = view.recipes[Number(el.value)]; if (x) Object.assign(r, JSON.parse(JSON.stringify(x)), { from: view.brains.some((b) => b.id === x.from) ? x.from : '' }); }
    else if (el.dataset.k) {
      const k = el.dataset.k;
      if (k === 'sight' || k === 'hearing') r.smaller[k] = el.checked;
      else if (k === 'cut') r.smaller.cut = el.checked ? { how: 'busiest', keep: brain()?.cuts?.[1]?.keep || brain()?.cuts?.[0]?.keep || 8, file: '' } : null;
      else if (k === 'compare') r.test.compare = el.checked;
      else if (k.startsWith('file:')) { const t = k.slice(5); r.smaller.files = el.checked ? [...new Set([...r.smaller.files, t])] : r.smaller.files.filter((x) => x !== t); }
    }
    await replan();
  });
  body.addEventListener('input', (e) => { // the slider and its number box move together
    if (e.target.id === 'lab-chunks') { const n = $('lab-chunks-n'); if (n) n.value = e.target.value; }
    if (e.target.id === 'lab-chunks-n') { const s = $('lab-chunks'); if (s) s.value = e.target.value; }
  });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    msg = '';
    if (b.dataset.step) { step = b.dataset.step; return draw(); }
    if ('next' in b.dataset) { step = STEPS[Math.min(STEPS.length - 1, STEPS.findIndex(([id]) => id === step) + 1)][0]; return draw(); }
    if ('back' in b.dataset) { step = STEPS[Math.max(0, STEPS.findIndex(([id]) => id === step) - 1)][0]; return draw(); }
    if ('recipe' in b.dataset) { showRecipe = !showRecipe; return draw(); }
    if ('copy' in b.dataset) { try { await navigator.clipboard.writeText(plan?.text || ''); b.textContent = 'Copied'; } catch { b.textContent = 'Couldn\'t copy'; } return; }
    if ('nounload' in b.dataset) { askUnload = null; return draw(); }
    try {
      if ('start' in b.dataset || 'unload' in b.dataset) {
        const res = await api('/api/lab/start', { recipe: r, unload: 'unload' in b.dataset });
        if (res.needUnload) { askUnload = res.names; return draw(); }
        askUnload = null;
      }
      if ('stop' in b.dataset) await api('/api/lab/stop', {});
      if ('save' in b.dataset) await api('/api/lab/recipe', { recipe: r });
      if (b.dataset.use) { const u = await api('/api/lab/use', { run: b.dataset.use }); note?.(`${u.name} is in Bob now. Pick it in Equip Bob or the brain menus.`); }
    } catch (err) { msg = err.message; }
    await load();
  });

  return {
    async open() { dlg.showModal(); draw(); await load(); },
    // Progress from the Lab job (the server's 'lab' events).
    update(run) { if (!view) return; const i = view.runs.findIndex((x) => x.id === run.id); if (i >= 0) view.runs[i] = run; else view.runs.unshift(run); if (dlg.open && !body.contains(document.activeElement)) draw(); else if (dlg.open) { const live = body.querySelector('.lab-runs'); if (live) live.outerHTML = runsHtml(); } }
  };
}
