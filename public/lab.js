// 1.5.141 🧪 Computer Science Lab (Lab 1): make your own brain from one on this replicant matrix, in five steps, with
// checkboxes and radio buttons instead of command-line flags. Show the recipe shows the exact commands. 1.5.143 (Lab 2a):
// keep every skill covered, and write a new lesson set with a teacher here. Rented cards are shown as "later", never offered.
import { esc } from './rich.js';
import { TEMPLATES, templateById, templateWhyNot, applyTemplate } from './lab-templates.js';

const $ = (id) => document.getElementById(id);
const STEPS = [['brain', '1 Pick a brain'], ['lessons', '2 Lessons'], ['smaller', '3 Make it smaller'], ['where', '4 Where it runs'], ['test', '5 Test and use']];
const TYPE_NOTE = { Q4_K_M: 'Q4 (recommended)', Q5_K_M: 'Q5', Q6_K: 'Q6', Q8_0: 'Q8', Q3_K_M: 'Q3 (only for brains meant for 8 GB or less)' };
const PARTS = { general: 'General knowledge', tools: 'Picking the right tool', coding: 'Coding', following: 'Following instructions' };

export function createLab({ api, note }) {
  const dlg = $('lab'), body = $('lab-body');
  $('lab-close').onclick = () => dlg.close();
  let view = null, step = 'brain', plan = null, showRecipe = false, msg = '', askUnload = null;
  let measures = [], picked = [], table = null, saved = '';
  const w = { name: '', teacher: '', skills: ['tools', 'coding', 'chat'], count: 500, think: 'half' };
  let wplan = null, writing = false;
  const r = { template: '', name: '', from: '', lessons: { kind: 'none', file: '', chunks: 200 }, smaller: { sight: false, hearing: false, cut: null, files: [], measure: false }, test: { compare: true } };
  const brain = () => view?.brains.find((b) => b.id === r.from);
  const running = () => view?.runs.find((x) => x.state === 'running');

  async function load() {
    try { view = await api('/api/lab'); } catch (e) { msg = e.message; }
    try { measures = (await api('/api/lab/measures')).measures || []; picked = picked.filter((id) => measures.some((m) => m.id === id)); } catch { measures = []; }
    await replan();
  }
  async function replan() {
    try { plan = r.from ? await api('/api/lab/plan', { recipe: r }) : null; } catch (e) { plan = { problems: [e.message], notes: [], steps: [] }; }
    if (writing) { try { wplan = await api('/api/lab/write/plan', { write: w }); } catch (e) { wplan = { problems: [e.message], notes: [] }; } }
    draw();
  }

  const radio = (name, value, on, label, hint = '', dis = '') => `<label class="lab-opt${dis ? ' dim' : ''}"><input type="radio" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}> <span><strong>${esc(label)}</strong>${hint ? `<br><span class="muted">${esc(hint)}</span>` : ''}${dis ? `<br><span class="muted">${esc(dis)}</span>` : ''}</span></label>`;
  const box = (key, on, label, hint = '', dis = '', more = '') => `<label class="lab-opt${dis ? ' dim' : ''}"><input type="checkbox" data-k="${key}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}> <span><strong>${esc(label)}</strong>${more}${hint ? `<br><span class="muted">${esc(hint)}</span>` : ''}${dis ? `<br><span class="muted">${esc(dis)}</span>` : ''}</span></label>`;
  const later = (label, hint) => `<div class="lab-opt dim" aria-disabled="true"><span><strong>${esc(label)}</strong> <span class="lab-later">Later (Lab 2)</span><br><span class="muted">${esc(hint)}</span></span></div>`;

  function templateHtml() {
    const b = brain(), f = b?.facts || {}, t = templateById(r.template);
    const opts = TEMPLATES.map((x) => { const why = templateWhyNot(x, f, b?.name); return `<option value="${esc(x.template)}" ${r.template === x.template ? 'selected' : ''} ${why ? 'disabled' : ''}>${esc(x.title)}${why ? (x.later ? ' (not built yet)' : x.where === 'rented' ? ' (rented card, Lab 2)' : ' (not for this brain)') : ''}</option>`; }).join('');
    const why = t ? templateWhyNot(t, f, b?.name) : '';
    return `<div class="lab-template"><p><label for="lab-template">Start from a template</label> <select id="lab-template" aria-describedby="lab-template-help" ${r.from ? '' : 'disabled'}><option value="">(none: tick it all yourself)</option>${opts}</select></p>
      <p id="lab-template-help" class="muted">${!r.from ? 'Pick a brain first, then a template fills steps 2 to 5 for it.' : t ? `${esc(t.help)}${why ? ` ${esc(why)}` : ' You can still change every box.'}` : 'A template is a recipe I\'ve used before, with the choices already ticked. Greyed ones need a rented card or aren\'t built yet.'}</p></div>`;
  }

  function compareHtml() {
    if (measures.length < 2) return '';
    const head = table ? `<tr><th scope="col">What</th>${table.names.map((n) => `<th scope="col">${esc(n)}</th>`).join('')}${table.names.length === 2 ? '<th scope="col">Difference</th>' : ''}</tr>` : '';
    const rows = table ? table.rows.map((x) => `<tr><th scope="row">${esc(x.label)}</th>${x.values.map((v) => `<td>${v === null ? '-' : esc(String(v))}</td>`).join('')}${table.names.length === 2 ? `<td>${esc(x.diffText || '')}</td>` : ''}</tr>`).join('') : '';
    return `<section class="lab-compare"><h3>Compare</h3>
      <p class="muted">Pick two or more tested brains to put side by side. The difference column says plus or minus: the second one minus the first.</p>
      <fieldset><legend>Brains to compare</legend>${measures.map((m) => `<label class="lab-opt"><input type="checkbox" data-measure="${esc(m.id)}" ${picked.includes(m.id) ? 'checked' : ''}> <span><strong>${esc(m.name)}</strong> <span class="muted">${esc([m.parentOf ? 'the brain a Lab job started from' : 'made in the Lab', m.where === 'home' ? 'tested here' : m.where, m.when].filter(Boolean).join(' · '))}</span></span></label>`).join('')}</fieldset>
      ${table ? `<table class="lab-report"><caption class="muted">Lab test and measurements</caption>${head}${rows}</table>
        <div class="row"><button type="button" class="link" data-csv>Save as CSV</button><button type="button" class="link" data-json>Save as JSON</button></div>${saved ? `<p class="muted" role="status">Saved ${esc(saved)} in the Lab's compare folder.</p>` : ''}` : ''}
    </section>`;
  }

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
      <p class="muted">Lessons are what the new brain should be good at. Here they're used to count which experts your kind of work uses, so an expert cut keeps those.</p>
      ${radio('lessons', 'none', l.kind === 'none', 'No lessons', 'For steps that don\'t need them: take out sight or hearing, make the running files, or cut with an expert list you have.')}
      ${radio('lessons', 'chats', l.kind === 'chats', 'My chats with Bob', 'Your past chats, as they are. They stay on this replicant matrix.')}
      ${view.lessonSets.length ? radio('lessons', 'set', l.kind === 'set', 'A lesson set I wrote here', 'One Bob wrote in the Lab with a teacher brain.') : ''}
      ${l.kind === 'set' ? `<p><label>Lesson set <select id="lab-lessons-set"><option value="">(pick one)</option>${view.lessonSets.map((x) => `<option value="${esc(x.id)}" ${l.set === x.id ? 'selected' : ''}>${esc(x.name)}: ${x.count} lessons${x.skills.length ? ` (${esc(x.skills.map(skillLabel).join(', '))})` : ''}${x.done ? '' : ', not finished'}</option>`).join('')}</select></label></p>` : ''}
      ${radio('lessons', 'file', l.kind === 'file', 'A lesson set I have', 'A lessons.jsonl from the model lab, or any text file.')}
      ${l.kind === 'file' ? `<p><label>Lesson file <input id="lab-lessons-file" type="text" value="${esc(l.file)}" placeholder="C:\\...\\lessons.jsonl"></label></p>` : ''}
      ${l.kind !== 'none' ? `<p><label for="lab-chunks">How much of it to count on</label> <input id="lab-chunks" type="range" min="20" max="2000" step="20" value="${l.chunks}" aria-describedby="lab-chunks-note"> <input id="lab-chunks-n" type="number" min="20" max="2000" step="20" value="${l.chunks}" aria-label="Pieces to count on"> pieces <span id="lab-chunks-note" class="muted">(about ${Math.max(1, Math.round(l.chunks / 20))} minutes on a 16 GB card)</span></p>` : ''}
      ${writeHtml()}
      ${later('Record the teacher\'s odds', 'Bob saves the teacher\'s top 32 guesses for every word, not only its answer. A brain learns much more from the odds than from the words alone.')}
    </fieldset>`;
  }

  const skillLabel = (id) => view?.lessonSkills.find((k) => k.id === id)?.label || id;
  // Write a new lesson set: its own Lab job (it takes hours). When it's done, it shows under A lesson set I wrote here.
  function writeHtml() {
    if (!writing) return `<div class="lab-opt"><span><strong>Write a new lesson set</strong><br><span class="muted">Pick skills (tools, coding, thinking, games and more) and a teacher brain on this replicant matrix, and Bob writes the lessons. It's a Lab job of its own and takes hours, so start it before bed.</span><br><button type="button" class="link" data-writeopen aria-expanded="false">Write a lesson set</button></span></div>`;
    const teachers = view.brains.filter((b) => b.facts);
    const hours = Math.max(1, Math.round((w.count * (view.secondsPerLesson || 25)) / 3600));
    return `<fieldset class="lab-write"><legend>Write a new lesson set</legend>
      <p class="muted">Bob makes up messages for each skill, then the teacher answers each one as me, with my real tools and instructions. Tool results are played by the teacher too: nothing is really run. Everything stays on this replicant matrix.</p>
      <p><label>Name for the lesson set <input id="lab-w-name" type="text" maxlength="60" value="${esc(w.name)}" autocomplete="off"></label></p>
      <p><label for="lab-w-teacher">Teacher</label> <select id="lab-w-teacher"><option value="">(pick one)</option>${teachers.map((b) => `<option value="${esc(b.id)}" ${w.teacher === b.id ? 'selected' : ''}>${esc(b.name)} (${b.facts.sizeGB} GB${b.license ? `, ${esc(b.license)}` : ''})</option>`).join('')}</select></p>
      <fieldset><legend>Skills to write lessons for</legend>${view.lessonSkills.map((k) => `<label class="lab-opt"><input type="checkbox" data-wskill="${esc(k.id)}" ${w.skills.includes(k.id) ? 'checked' : ''}> <span><strong>${esc(k.label)}</strong><br><span class="muted">${esc(k.hint)}</span></span></label>`).join('')}</fieldset>
      <p><label for="lab-w-count">How many lessons</label> <input id="lab-w-count" type="range" min="100" max="20000" step="100" value="${w.count}" aria-describedby="lab-w-time"> <input id="lab-w-count-n" type="number" min="100" max="20000" step="100" value="${w.count}" aria-label="Lessons to write"> <span id="lab-w-time" class="muted">(roughly ${hours} hour${hours === 1 ? '' : 's'}; the job shows the real pace)</span></p>
      <fieldset><legend>Thinking</legend>
        ${radio('wthink', 'half', w.think === 'half', 'Half with thinking, half without (recommended)', 'So the new brain learns both ways. Maths and logic lessons always think.')}
        ${radio('wthink', 'on', w.think === 'on', 'All with thinking', 'Slower to write, and the brain learns to think first every time.')}
        ${radio('wthink', 'off', w.think === 'off', 'None with thinking', 'Quickest. Maths and logic lessons still think.')}
      </fieldset>
      ${later('Pay-per-answer teachers', 'A big brain from a pay-per-answer service as the teacher. Your key, your bill, shown before it starts.')}
      ${later('A big rented brain as the teacher', 'A rented card runs a brain too big for this replicant matrix.')}
      ${wplan ? `<div class="lab-check" role="status">${wplan.problems.length ? `<p><strong>Before it can start:</strong></p><ul>${wplan.problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p><strong>Ready to write.</strong></p>'}${wplan.notes.map((x) => `<p class="muted">${esc(x)}</p>`).join('')}</div>` : ''}
      <div class="row"><button type="button" class="get" data-write ${wplan && !wplan.problems.length && !running() ? '' : 'disabled'}>${running() ? 'The Lab is busy' : 'Write the lessons'}</button><button type="button" class="link" data-writeclose>Close</button></div>
      <p class="muted">The teacher writes as a stand-in Bob with his instructions and tools, and none of your chats, notes or names. Nothing it asks for is really run.</p>
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
        ${radio('cuthow', 'cover', cut.how === 'cover', 'Keep every skill covered (recommended)', 'Counts each skill in your lessons on its own and keeps the experts every skill needs, not only the busiest overall. It\'s how Bob\'s own brains are cut.')}
        ${cut.how === 'cover' ? `<div class="lab-sub"><fieldset><legend>How much of each skill to keep</legend>
          ${[[0.95, '95% (recommended)', 'Each skill keeps the experts that do 95% of its work, in every layer.'], [0.9, '90%', 'Smaller, but every skill loses a little more.'], [0.99, '99%', 'Bigger. Almost nothing is lost.']].map(([v, l, h]) => radio('cover', String(v), cut.cover === v, l, h)).join('')}
        </fieldset>
        ${plan?.skills?.length > 1 ? `<fieldset><legend>Protect these skills more (99%)</legend>${plan.skills.map((k) => `<label class="lab-opt"><input type="checkbox" data-strong="${esc(k)}" ${cut.strong?.includes(k) ? 'checked' : ''}> <span>${esc(k)}</span></label>`).join('')}</fieldset>` : ''}</div>` : ''}
        ${radio('cuthow', 'busiest', cut.how === 'busiest', 'Keep the busiest experts', 'Counted on all the lessons from step 2 together.')}
        ${radio('cuthow', 'file', cut.how === 'file', 'Use an expert list I have', 'A keep list from an earlier cut (for example a *-keep.json).')}
        ${cut.how === 'file' ? `<p><label>Expert list file <input id="lab-keep-file" type="text" value="${esc(cut.file)}"></label></p>` : ''}
        <fieldset><legend>How many experts to keep per layer</legend>${cut.how === 'cover' ? radio('keep', 'auto', !cut.keep, 'As many as the skills need (recommended)', 'Bob works it out after counting. The report says how many, and how much of each skill stayed.') : ''}${cutSizes.map((c) => radio('keep', String(c.keep), cut.keep === c.keep, `${c.keep} experts · about ${c.gb} GB`, c.fit)).join('')}
        <label class="lab-opt"><input type="radio" name="keep" value="custom" ${!cut.keep || cutSizes.some((c) => c.keep === cut.keep) ? '' : 'checked'}> <span><strong>Custom</strong> <input id="lab-keep-n" type="number" min="${f.used || 1}" max="${(f.experts || 2) - 1}" value="${cut.keep || ''}" aria-label="Experts to keep per layer"></span></label></fieldset>
        ${box('try', s.try, 'Try it first, before cutting', `Brain Engine runs ${b?.name || 'the brain'} with only the kept experts switched on and gives it the Lab test, so you see the score before any file is written. It counts as the test of ${b?.name || 'the brain'} too.`, view.brainEngine ? '' : 'Needs Brain Engine, Bob\'s Lab engine (a version of llama.cpp that can switch experts off). It isn\'t ready to download yet; it comes in a later update.')}
        ${s.try ? `<div class="lab-sub">${box('tryStop', s.tryStop, 'Stop if it scores more than 10 points lower on the Lab test', 'Then nothing is cut, and you can keep more experts or protect more skills.')}</div>` : ''}
      </div>` : ''}
      ${later('Layer cut (Experimental)', 'Fewer layers: the least-used ones, measured on your lessons.')}
      ${later('Width cut (Experimental)', 'A narrower brain. This one hurts most and needs the longest teach-back.')}
      ${later('Teach it back', 'Teaches the cut brain back against the original with the lessons and odds ("heal" in the forge). Light (quick; recommended) or Full.')}
      ${later('Make it one file', 'Folds the taught-back part into the brain so it\'s one file ("fold" in the forge).')}
      <fieldset><legend>Make the running files</legend>
        ${f.fullSize ? '' : `<p class="muted">${esc(b?.name || 'This brain')} is already a running file (${esc(f.fileType || '?')}), so it stays as it is. Making running files needs the full-size copy (F16 or BF16).</p>`}
        ${view.types.filter((t) => t !== 'Q3_K_M' || (f.sizeGB || 99) <= 16).map((t) => box(`file:${t}`, s.files.includes(t), TYPE_NOTE[t], f.sizeGB ? `About ${Math.round(f.sizeGB * ({ Q4_K_M: 0.3, Q5_K_M: 0.36, Q6_K: 0.41, Q8_0: 0.53, Q3_K_M: 0.25 }[t] || 0.3) * 10) / 10} GB from this brain${cut ? ' before the cut' : ''}.` : '', f.fullSize ? '' : 'Needs the full-size copy.')).join('')}
        ${s.files.length ? box('measure', s.measure, 'Measure before making the running files (recommended)', 'Before the running files, Bob measures which weights matter most on your lessons, on the cut brain itself. The running files lose less that way, most of all at Q4 and Q3. Adds a few minutes on the graphics card.', r.lessons.kind === 'none' ? 'Needs lessons to measure on: pick a lesson set in step 2.' : '') : ''}
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
    return `<section class="lab-runs"><h3>Lab jobs</h3><ul class="tlist">${view.runs.map((x) => `<li><strong>${esc(x.name)}</strong> <span class="muted">${x.kind === 'write' ? `lessons, taught by ${esc(x.from)}` : `from ${esc(x.from)}`} · ${x.state === 'running' ? `${esc(x.stepLabel || '')}${x.progress ? `, ${x.progress}%` : ''}` : x.state === 'done' ? `done${x.sizeGB ? `, ${x.sizeGB} GB` : ''}` : esc(x.state)}</span>
      ${x.state === 'running' ? ' <button type="button" class="link" data-stop>Stop</button>' : ''}
      ${x.state === 'failed' || x.state === 'stopped' ? `<br><span class="muted">${esc(x.error || '')}</span>` : ''}
      ${(x.notes || []).map((n) => `<br><span class="muted">${esc(n)}</span>`).join('')}
      ${x.kind === 'write' && x.report ? `<br><span class="muted">${x.report.lessons} lessons written in ${x.report.minutes} minutes. Pick it in step 2, under A lesson set I wrote here.</span>` : ''}
      ${x.report?.coverage ? `<table class="lab-report"><caption class="muted">Coverage cut: kept ${x.report.coverage.experts} of ${x.report.coverage.of} experts per layer</caption><tr><th scope="col">Skill</th><th scope="col">Kept, on average</th><th scope="col">Worst layer</th></tr>${x.report.coverage.skills.map((k) => `<tr><th scope="row">${esc(k.name)}</th><td>${k.average}%</td><td>${k.worst}% (layer ${k.worstLayer})</td></tr>`).join('')}</table>` : ''}
      ${x.report?.tried ? `<br><span class="muted">Tried first on Brain Engine: ${x.report.tried.masked} with only the kept experts, ${x.report.tried.full} with all of them.</span>` : ''}
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
      ${templateHtml()}
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
      ${compareHtml()}
    </div>`;
  }

  body.addEventListener('change', async (e) => {
    const el = e.target; msg = '';
    if (el.name === 'from') { r.from = el.value; const b = brain(); if (!r.name && b) r.name = `${b.name} Lab`; r.smaller = { sight: false, hearing: false, cut: null, files: [], measure: false, try: false, tryStop: true }; r.template = ''; }
    else if (el.id === 'lab-template') {
      const t = templateById(el.value), b = brain();
      if (!t) r.template = '';
      else if (!templateWhyNot(t, b?.facts || {}, b?.name)) Object.assign(r, applyTemplate(r, t, { keepDefault: b?.cuts?.[1]?.keep || b?.cuts?.[0]?.keep || 8, fullSize: Boolean(b?.facts?.fullSize), brainName: b?.name || '' }));
    }
    else if (el.dataset.measure) { picked = el.checked ? [...new Set([...picked, el.dataset.measure])] : picked.filter((x) => x !== el.dataset.measure); saved = ''; try { table = picked.length >= 2 ? (await api('/api/lab/compare', { ids: picked })).table : null; } catch (err) { msg = err.message; table = null; } return draw(); }
    else if (el.name === 'lessons') r.lessons.kind = el.value;
    else if (el.id === 'lab-lessons-set') r.lessons.set = el.value;
    else if (el.id === 'lab-w-name') w.name = el.value;
    else if (el.id === 'lab-w-teacher') { w.teacher = el.value; if (!w.name) { const t = view.brains.find((b) => b.id === el.value); if (t) w.name = `Lessons from ${t.name}`.slice(0, 60); } }
    else if (el.dataset.wskill) { const k = el.dataset.wskill; w.skills = el.checked ? [...new Set([...w.skills, k])] : w.skills.filter((x) => x !== k); }
    else if (el.id === 'lab-w-count' || el.id === 'lab-w-count-n') w.count = Number(el.value);
    else if (el.name === 'wthink') w.think = el.value;
    else if (el.name === 'cuthow') { r.smaller.cut.how = el.value; if (el.value === 'cover') { r.smaller.cut.cover = r.smaller.cut.cover || 0.95; r.smaller.cut.strong = r.smaller.cut.strong || []; r.smaller.cut.keep = 0; } else if (!r.smaller.cut.keep) r.smaller.cut.keep = brain()?.cuts?.[1]?.keep || brain()?.cuts?.[0]?.keep || 8; }
    else if (el.name === 'cover') r.smaller.cut.cover = Number(el.value);
    else if (el.dataset.strong) { const k = el.dataset.strong; r.smaller.cut.strong = el.checked ? [...new Set([...(r.smaller.cut.strong || []), k])] : (r.smaller.cut.strong || []).filter((x) => x !== k); }
    else if (el.name === 'keep') { if (el.value === 'auto') r.smaller.cut.keep = 0; else if (el.value !== 'custom') r.smaller.cut.keep = Number(el.value); }
    else if (el.id === 'lab-keep-n') r.smaller.cut.keep = Number(el.value);
    else if (el.id === 'lab-chunks' || el.id === 'lab-chunks-n') r.lessons.chunks = Number(el.value);
    else if (el.id === 'lab-name') r.name = el.value;
    else if (el.id === 'lab-lessons-file') r.lessons.file = el.value.trim().replace(/^"|"$/g, '');
    else if (el.id === 'lab-keep-file') r.smaller.cut.file = el.value.trim().replace(/^"|"$/g, '');
    else if (el.id === 'lab-recipe') { const x = view.recipes[Number(el.value)]; if (x) Object.assign(r, JSON.parse(JSON.stringify(x)), { from: view.brains.some((b) => b.id === x.from) ? x.from : '' }); }
    else if (el.dataset.k) {
      const k = el.dataset.k;
      if (k === 'sight' || k === 'hearing') r.smaller[k] = el.checked;
      else if (k === 'cut') r.smaller.cut = el.checked ? { how: 'cover', keep: 0, cover: 0.95, strong: [], file: '' } : null;
      else if (k === 'compare') r.test.compare = el.checked;
      else if (k === 'measure') r.smaller.measure = el.checked;
      else if (k === 'try') { r.smaller.try = el.checked; r.smaller.tryStop = el.checked; }
      else if (k === 'tryStop') r.smaller.tryStop = el.checked;
      else if (k.startsWith('file:')) { const t = k.slice(5); const first = !r.smaller.files.length; r.smaller.files = el.checked ? [...new Set([...r.smaller.files, t])] : r.smaller.files.filter((x) => x !== t); if (first && el.checked && r.lessons.kind !== 'none') r.smaller.measure = true; if (!r.smaller.files.length) r.smaller.measure = false; }
    }
    await replan();
  });
  body.addEventListener('input', (e) => { // the slider and its number box move together
    if (e.target.id === 'lab-chunks') { const n = $('lab-chunks-n'); if (n) n.value = e.target.value; }
    if (e.target.id === 'lab-chunks-n') { const s = $('lab-chunks'); if (s) s.value = e.target.value; }
    if (e.target.id === 'lab-w-count') { const n = $('lab-w-count-n'); if (n) n.value = e.target.value; }
    if (e.target.id === 'lab-w-count-n') { const s = $('lab-w-count'); if (s) s.value = e.target.value; }
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
    if ('writeopen' in b.dataset) { writing = true; await replan(); $('lab-w-name')?.focus(); return; }
    if ('writeclose' in b.dataset) { writing = false; wplan = null; return draw(); }
    if ('csv' in b.dataset || 'json' in b.dataset) { try { saved = (await api('/api/lab/compare', { ids: picked, save: 'csv' in b.dataset ? 'csv' : 'json' })).file; } catch (err) { msg = err.message; } return draw(); }
    try {
      if ('write' in b.dataset || (askUnload?.write && 'unload' in b.dataset)) {
        const res = await api('/api/lab/write', { write: w, unload: 'unload' in b.dataset });
        if (res.needUnload) { askUnload = Object.assign(res.names, { write: true }); return draw(); }
        askUnload = null; writing = false; wplan = null;
      } else if ('start' in b.dataset || 'unload' in b.dataset) {
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
