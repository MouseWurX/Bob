// 1.5.141 🧪 Computer Science Lab (Lab 1): make your own brain from one on this replicant matrix, in five steps, with
// checkboxes and radio buttons instead of command-line flags. Show the recipe shows the exact commands. 1.5.143 (Lab 2a):
// keep every skill covered, and write a new lesson set with a teacher here. Rented cards are shown as "later", never offered.
// 1.5.151 (Lab 3): the page has tabs. Make a brain is the five steps; Learn is guided experiments (public/lab-learn.js).
// 1.5.152 (Lab 2c): build a lesson set from your own files, with a survey and sample lessons before anything big runs.
import { esc } from './rich.js';
import { TEMPLATES, templateById, templateWhyNot, applyTemplate } from './lab-templates.js';
import { createLearn } from './lab-learn.js';
import { saveHtml, saveResult } from './lab-save.js'; // 1.5.153 Save
import { createRecipes } from './lab-recipes.js'; // 1.5.154 cut recipes, the estimate table and the usage map
import { createForge } from './lab-forge.js'; // 1.5.158 the Forge tab
import { createPlayground } from './lab-playground.js'; // 1.5.157 Playground: the quantization ladder

const $ = (id) => document.getElementById(id);
const TABS = [['make', 'Make a brain'], ['forge', 'Forge'], ['learn', 'Learn'], ['challenges', 'Challenges'], ['playground', 'Playground']];
const STEPS = [['brain', '1 Pick a brain'], ['lessons', '2 Lessons'], ['smaller', '3 Make it smaller'], ['where', '4 Where it runs'], ['test', '5 Test and use']];
const TYPE_NOTE = { Q4_K_M: 'Q4 (recommended)', Q5_K_M: 'Q5', Q6_K: 'Q6', Q8_0: 'Q8', Q3_K_M: 'Q3 (only for brains meant for 8 GB or less)' };
const PARTS = { general: 'General knowledge', tools: 'Picking the right tool', coding: 'Coding', following: 'Following instructions' };

export function createLab({ api, note }) {
  const dlg = $('lab'), body = $('lab-body');
  $('lab-close').onclick = () => dlg.close();
  let view = null, step = 'brain', plan = null, showRecipe = false, msg = '', askUnload = null, tab = 'make';
  const learn = createLearn({ api, info: () => view, saves: () => saves });
  // 1.5.153 Challenges: which brain, which packs, the scoreboard's sort, and the Save panels (one per result).
  const ch = { from: '', packs: ['quiz', 'reasoning', 'sums', 'rules', 'tools', 'code'], sort: 'name', down: false, by: 'class', kind: 'all', here: false, fits: false }; // 1.5.162 the board by class of model
  const saves = {};
  const saveState = (k) => (saves[k] ||= { open: false, format: 'png', hardware: false, saved: '', error: '' });
  let measures = [], picked = [], table = null, saved = '';
  const w = { name: '', teacher: '', skills: ['tools', 'coding', 'chat'], count: 500, think: 'half' };
  let wplan = null, writing = false;
  // Lab 2c: the lesson builder. bld is the plan the page sends; bsurvey is stage A of the preview; sample cards come from the plan.
  const bld = { name: '', teacher: '', items: [], kinds: ['material'], count: 300, think: 'half', resay: true, feedback: { dropFiles: [], notKinds: {}, badIdeas: [] } };
  let bplan = null, building = false, bsurvey = null, surveying = false, openPassage = new Set(), notLike = '', viewer = null, vq = { q: '', skill: '', file: '', kind: '' }, exportInfo = null, typedPath = '';
  const r = { template: '', name: '', from: '', lessons: { kind: 'none', file: '', chunks: 200 }, smaller: { sight: false, hearing: false, cut: null, files: [], measure: false }, test: { compare: true } };
  const fg = createForge({ api, goMake: () => { tab = 'make'; draw(); $('lab-tab-make')?.focus(); } });
  document.addEventListener('lab-forge-ready', () => { if (tab === 'forge' && dlg.open) draw(); });
  const pg = createPlayground({ api, view: () => view, saveState });
  const rc = createRecipes({ api, recipe: r, view: () => view, replan: () => replan(), draw: () => draw() });
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
    if (building) { try { bplan = await api('/api/lab/build/plan', { build: bld }); } catch (e) { bplan = { problems: [e.message], notes: [], sample: [] }; } }
    await rc.afterPlan();
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
      ${view.lessonSets.length ? radio('lessons', 'set', l.kind === 'set', 'A lesson set I wrote or built here', 'One Bob wrote in the Lab with a teacher brain, or one built from your own files.') : ''}
      ${l.kind === 'set' ? `<p><label>Lesson set <select id="lab-lessons-set"><option value="">(pick one)</option>${view.lessonSets.map((x) => `<option value="${esc(x.id)}" ${l.set === x.id ? 'selected' : ''}>${esc(x.name)}: ${x.count} lessons${x.skills.length ? ` (${esc(x.skills.map(skillLabel).join(', '))})` : ''}${x.built ? ', built from your files' : ''}${x.done ? '' : ', not finished'}</option>`).join('')}</select></label></p>` : ''}
      ${radio('lessons', 'file', l.kind === 'file', 'A lesson set I have', 'A lessons.jsonl from the model lab, or any text file.')}
      ${l.kind === 'file' ? `<p><label>Lesson file <input id="lab-lessons-file" type="text" value="${esc(l.file)}" placeholder="C:\\...\\lessons.jsonl"></label></p>` : ''}
      ${l.kind !== 'none' ? `<p><label for="lab-chunks">How much of it to count on</label> <input id="lab-chunks" type="range" min="20" max="2000" step="20" value="${l.chunks}" aria-describedby="lab-chunks-note"> <input id="lab-chunks-n" type="number" min="20" max="2000" step="20" value="${l.chunks}" aria-label="Pieces to count on"> pieces <span id="lab-chunks-note" class="muted">(about ${Math.max(1, Math.round(l.chunks / 20))} minutes on a 16 GB card)</span></p>` : ''}
      ${writeHtml()}
      ${buildHtml()}
      ${setsHtml()}
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

  // Lab 2c: build a new lesson set from your own files. Stage A (survey) and stage B (sample lessons) before the build.
  const kindLabel = (id) => view?.lessonKinds.find((k) => k.id === id)?.label || id;
  function cardHtml(c, { where = 'sample', set = '' } = {}) {
    const open = openPassage.has(c.key);
    return `<li class="lab-card" data-card="${esc(c.key)}"><div class="lab-card-head"><strong>${esc(c.skill || 'my files')}</strong> <span class="muted">· ${esc(kindLabel(c.kind))}${c.think ? ' · thinking on' : ''}${c.source?.name ? ` · from ${esc(c.source.name)}${c.source.at ? `, passage ${c.source.at}` : ''}` : ''}</span></div>
      <p><span class="muted">Message:</span> ${esc(c.user)}</p>
      ${c.read ? `<p><span class="muted">Bob reads:</span> ${esc(c.source?.name || 'the passage')} <button type="button" class="link" data-passage="${esc(c.key)}" aria-expanded="${open}">${open ? 'Hide the passage' : 'Open the passage'}</button></p>${open ? `<blockquote class="lab-passage">${esc(c.read)}</blockquote>` : ''}` : ''}
      ${c.thinking ? `<p class="muted"><span class="muted">Thinking (start):</span> ${esc(c.thinking)}</p>` : ''}
      <p><span class="muted">Bob says:</span> ${esc(c.answer)}</p>
      ${where === 'sample' ? `<div class="row">${bld.feedback.badIdeas.includes(c.key) || bld.feedback.dropFiles.includes(c.source?.name) ? '<span class="muted">Noted: the full build does this one differently.</span>' : `<button type="button" class="link" data-keep="${esc(c.key)}">Keep</button><button type="button" class="link" data-notlike="${esc(c.key)}" aria-expanded="${notLike === c.key}">Not like this</button>`}</div>
        ${notLike === c.key ? `<div class="lab-check" role="group" aria-label="What was wrong"><button type="button" class="link" data-fb="file" data-key="${esc(c.key)}" data-file="${esc(c.source?.name || '')}">Leave this file out</button> <button type="button" class="link" data-fb="kind" data-key="${esc(c.key)}" data-file="${esc(c.source?.name || '')}" data-kind="${esc(c.kind)}">Not this kind of lesson for this file</button> <button type="button" class="link" data-fb="idea" data-key="${esc(c.key)}">The message is wrong for this passage</button></div>` : ''}` : `<div class="row"><button type="button" class="link" data-rmlesson="${esc(c.key)}">Remove this lesson</button>${c.source?.name ? `<button type="button" class="link" data-rmfile="${esc(c.source.name)}">Remove everything from ${esc(c.source.name)}</button>` : ''}</div>`}
    </li>`;
  }
  function surveyHtml() {
    const sv = bsurvey;
    if (surveying) return '<p class="muted" role="status">Reading your files...</p>';
    if (!sv) return '';
    const kinds = Object.entries(sv.byKind || {}).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ');
    return `<div class="lab-survey" role="status" aria-live="polite"><h4>What Bob found</h4>
      <p>${sv.files} file${sv.files === 1 ? '' : 's'}${kinds ? ` (${esc(kinds)})` : ''}${sv.over ? `, stopped at ${sv.maxFiles}` : ''}. About ${Number(sv.words).toLocaleString()} words of usable text in ${sv.passages} passage${sv.passages === 1 ? '' : 's'}${sv.exchanges ? ` and ${sv.exchanges} exchange${sv.exchanges === 1 ? '' : 's'} from chat logs` : ''}${sv.estimated ? ` (${sv.estimated} documents counted by size, read properly during the build)` : ''}.</p>
      ${sv.skipped.length ? `<details><summary>${sv.skipped.length} file${sv.skipped.length === 1 ? '' : 's'} skipped</summary><ul>${sv.skipped.slice(0, 200).map((x) => `<li>${esc(x.name)}: ${esc(x.why)}</li>`).join('')}</ul></details>` : ''}
      ${sv.dupes ? `<p class="muted">${sv.dupes} repeated passage${sv.dupes === 1 ? '' : 's'} left out.</p>` : ''}
      ${sv.held.length ? `<details><summary><strong>Held back: ${sv.held.length}</strong> passage${sv.held.length === 1 ? '' : 's'} that look like a password, key, card number, address or e-mail. They never reach the teacher.</summary><ul>${sv.held.slice(0, 200).map((x) => `<li>${esc(x.name)}${x.at ? `, passage ${x.at}` : ''}: ${esc(x.why)}. <span class="muted">${esc(x.peek)}...</span></li>`).join('')}</ul></details>` : '<p class="muted">Nothing looked like a password, key, address or e-mail. (A net, not a guarantee.)</p>'}
      ${sv.otherPeople ? '<p class="muted">These include other people\'s words. Lessons stay on this replicant matrix; if you share the set later, that\'s your call to make for them too.</p>' : ''}
      <p><strong>Lessons your files can supply:</strong> ${Object.entries(sv.supply).filter(([k]) => bld.kinds.includes(k)).map(([k, n]) => `${esc(kindLabel(k))} ${n}`).join(', ') || 'tick a kind of lesson above'}${Object.keys(sv.perSkill).length > 1 ? `; by skill: ${Object.entries(sv.perSkill).map(([k, v]) => `${esc(k)} ${v.passages + v.exchanges}`).join(', ')}` : ''}.</p>
      ${sv.samples.length ? `<details><summary>Ten passages Bob would use</summary><ul>${sv.samples.map((x) => `<li><strong>${esc(x.name)}</strong>${x.at ? `, passage ${x.at}` : ''}: <span class="muted">${esc(x.text)}${x.text.length >= 400 ? '...' : ''}</span></li>`).join('')}</ul></details>` : ''}
      <div class="lab-learn"><strong>What the brain would learn.</strong> ${esc(sv.wouldLearn)}</div>
    </div>`;
  }
  function buildHtml() {
    if (!building) return `<div class="lab-opt"><span><strong>Build a new set from my files</strong><br><span class="muted">Your own documents, notes and chat logs become lessons, here, with a teacher brain you have. Bob shows a survey and 12 sample lessons before anything big runs. Your files never leave this replicant matrix.</span><br><button type="button" class="link" data-buildopen aria-expanded="false">Build a new set from my files</button></span></div>`;
    const teachers = view.brains.filter((b) => b.facts);
    const supply = bsurvey ? bsurvey.supplyTotal : 0;
    const max = Math.max(20, Math.min(view.buildMax || 5000, supply || view.buildMax || 5000));
    const hours = Math.max(1, Math.round((Math.min(bld.count, max) * (view.secondsPerLesson || 25)) / 3600));
    const sample = bplan?.sample || [];
    const ready = bplan && !bplan.problems.length && !running();
    return `<fieldset class="lab-build"><legend>Build a new set from my files</legend>
      <p class="muted">Add files or folders, tick what I should learn from them, and pick a teacher brain you have. First the survey, then ${view.sampleCount || 12} sample lessons, then the build. Files are read in place and never copied; only the passages that become lessons are kept, in the Lab folder.</p>
      <p><label>Name for the lesson set <input id="lab-b-name" type="text" maxlength="60" value="${esc(bld.name)}" autocomplete="off"></label></p>
      <fieldset><legend>What to learn from</legend>
        ${bld.items.length ? `<ul class="lab-items">${bld.items.map((it, n) => `<li><span class="lab-item-path">${esc(it.path)}</span> <label>skill <input type="text" class="lab-item-skill" data-bskill="${n}" value="${esc(it.skill)}" maxlength="40" aria-label="Skill name for ${esc(it.path)}"></label> <button type="button" class="link" data-bremove="${n}">Remove</button></li>`).join('')}</ul>` : '<p class="muted">Nothing added yet.</p>'}
        <div class="row"><button type="button" class="link" data-baddfolder>Add a folder</button><button type="button" class="link" data-baddfile>Add a file</button> <label>or type a path <input id="lab-b-path" type="text" value="${esc(typedPath)}" placeholder="${/win/i.test(navigator.userAgentData?.platform || navigator.platform || '') ? 'C:\\Notes' : '~/Notes'}" aria-label="A file or folder path"></label><button type="button" class="link" data-baddpath>Add</button></div>
        <p class="muted">Bob reads: plain text, Markdown, web pages, Word, OpenDocument, RTF, e-books and PDFs${view.officeOk ? '' : ' (Word, PDF and the others need LibreOffice, Settings, Engines)'}; chat logs: my own sessions, a ChatGPT or Claude export (conversations.json), or a transcript with "Name: line" lines. Spreadsheets, code, pictures and sound come later.</p>
      </fieldset>
      <fieldset><legend>What the brain should learn</legend>${view.lessonKinds.map((k) => `<label class="lab-opt"><input type="checkbox" data-bkind="${esc(k.id)}" ${bld.kinds.includes(k.id) ? 'checked' : ''}> <span><strong>${esc(k.label)}</strong><br><span class="muted">${esc(k.hint)}</span></span></label>`).join('')}
        ${bld.kinds.includes('chats') ? `<label class="lab-opt lab-sub"><input type="checkbox" data-bresay ${bld.resay ? 'checked' : ''}> <span><strong>Re-say other assistants' answers in Bob's voice</strong><br><span class="muted">Untick to keep their answers word for word.</span></span></label>` : ''}
        ${later('My code', 'Explain this function, fix this from the error, from a repo of yours.')}
      </fieldset>
      <p><label for="lab-b-teacher">Teacher</label> <select id="lab-b-teacher"><option value="">(pick one)</option>${teachers.map((b) => `<option value="${esc(b.id)}" ${bld.teacher === b.id ? 'selected' : ''}>${esc(b.name)} (${b.facts.sizeGB} GB${b.license ? `, ${esc(b.license)}` : ''})</option>`).join('')}</select></p>
      <p><label for="lab-b-count">How many lessons</label> <input id="lab-b-count" type="range" min="20" max="${max}" step="10" value="${Math.min(bld.count, max)}" aria-describedby="lab-b-time"> <input id="lab-b-count-n" type="number" min="20" max="${max}" step="10" value="${Math.min(bld.count, max)}" aria-label="Lessons to build"> <span id="lab-b-time" class="muted">(roughly ${hours} hour${hours === 1 ? '' : 's'}${supply ? `; your files can supply about ${supply}` : '; the survey says how many your files can supply'})</span></p>
      <fieldset><legend>Thinking</legend>
        ${radio('bthink', 'half', bld.think === 'half', 'Half with thinking, half without (recommended)', 'Writing-in-my-voice lessons never think: the answer is yours as written.')}
        ${radio('bthink', 'on', bld.think === 'on', 'All with thinking', 'Slower, and the brain learns to think first every time.')}
        ${radio('bthink', 'off', bld.think === 'off', 'None with thinking', 'Quickest.')}
      </fieldset>
      ${later('A big rented brain as the teacher', 'A rented card runs a brain too big for this replicant matrix. Your passages would leave this replicant matrix. It will say so in red and start switched off.')}
      <div class="row"><button type="button" class="link" data-bsurvey ${bld.items.length && !surveying ? '' : 'disabled'}>${bsurvey ? 'Survey my files again' : 'Survey my files'}</button></div>
      ${surveyHtml()}
      ${bplan ? `<div class="lab-check" role="status">${bplan.problems.length ? `<p><strong>Before it can start:</strong></p><ul>${bplan.problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p><strong>Ready.</strong></p>'}${bplan.notes.map((x) => `<p class="muted">${esc(x)}</p>`).join('')}</div>` : ''}
      <div class="row"><button type="button" class="get" data-bsample ${ready && bsurvey ? '' : 'disabled'}>${running() ? 'The Lab is busy' : `Show me ${view.sampleCount || 12} sample lessons`}</button>${!bsurvey ? '<span class="muted">Survey first, so you see what goes in.</span>' : ''}</div>
      ${sample.length ? `<h4>Sample lessons</h4><p class="muted">${sample.length} lessons made from your files. Keep the ones that look right; Not like this changes the plan, nothing is trained from the clicks.</p><ul class="lab-cards">${sample.map((c) => cardHtml(c)).join('')}</ul>` : ''}
      <div class="row"><button type="button" class="get" data-bbuild ${ready && sample.length ? '' : 'disabled'}>${running() ? 'The Lab is busy' : 'Build the set'}</button><button type="button" class="link" data-buildclose>Close</button>${!sample.length ? '<span class="muted">The sample comes first, so you see what a lesson from your files looks like.</span>' : ''}</div>
      <p class="muted">No upload anywhere: not to Bob-Net, not to a rented card, not to Bob's own lesson sets. The only way a set leaves the Lab is Export as a file, below, which you press.</p>
    </fieldset>`;
  }
  // The sets built from your files: open one (the viewer), export it as a file.
  function setsHtml() {
    const built = (view.lessonSets || []).filter((x) => x.built);
    if (!built.length) return '';
    return `<div class="lab-sets"><h4>Sets built from your files</h4><ul class="tlist">${built.map((x) => `<li><strong>${esc(x.name)}</strong> <span class="muted">${x.count} lessons${x.skills.length ? `, ${esc(x.skills.join(', '))}` : ''}${x.teacher ? `, taught by ${esc(x.teacher)}` : ''}${x.done ? '' : ', not finished'}</span> <button type="button" class="link" data-openset="${esc(x.id)}" aria-expanded="${viewer?.id === x.id}">${viewer?.id === x.id ? 'Close the set' : 'Open the set'}</button> <button type="button" class="link" data-export="${esc(x.id)}">Export as a file</button></li>`).join('')}</ul>
      ${exportInfo ? `<div class="lab-check" role="status">${exportInfo.file ? `<p><strong>Saved ${esc(exportInfo.file)}</strong> (${exportInfo.lessons} lessons).</p>` : `<p><strong>Before the zip is written</strong>, Bob replaces names and addresses: ${exportInfo.changes.length ? exportInfo.changes.map((c) => `${esc(c.what)} (${c.n})`).join(', ') : 'nothing to change in this set'}. The source files themselves are never in the zip.</p><div class="row"><button type="button" class="get" data-exportgo="${esc(exportInfo.id)}">Pick a folder and save the zip</button><button type="button" class="link" data-exportclose>Not now</button></div>`}${exportInfo.changes?.length && exportInfo.file ? `<p class="muted">Changed: ${exportInfo.changes.map((c) => `${esc(c.what)} (${c.n})`).join(', ')}.</p>` : ''}</div>` : ''}
      ${viewer ? viewerHtml() : ''}</div>`;
  }
  function viewerHtml() {
    const v = viewer;
    return `<section class="lab-viewer" aria-label="Lessons in ${esc(v.name)}"><h4>${esc(v.name)}: ${v.found === v.total ? `${v.total} lessons` : `${v.found} of ${v.total} lessons`}</h4>
      <div class="row"><label>Search <input id="lab-v-q" type="search" value="${esc(vq.q)}"></label>
        ${v.skills.length > 1 ? `<label>Skill <select id="lab-v-skill"><option value="">all</option>${v.skills.map((k) => `<option value="${esc(k)}" ${vq.skill === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>` : ''}
        ${v.kinds.length > 1 ? `<label>Kind <select id="lab-v-kind"><option value="">all</option>${v.kinds.map((k) => `<option value="${esc(k)}" ${vq.kind === k ? 'selected' : ''}>${esc(kindLabel(k))}</option>`).join('')}</select></label>` : ''}
        ${v.files.length > 1 ? `<label>File <select id="lab-v-file"><option value="">all</option>${v.files.map((k) => `<option value="${esc(k)}" ${vq.file === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>` : ''}</div>
      ${v.sources?.held ? `<p class="muted">${v.sources.held} passage${v.sources.held === 1 ? '' : 's'} held back during the build, ${v.sources.dupes || 0} repeated.</p>` : ''}
      <ul class="lab-cards">${v.cards.map((c) => cardHtml(c, { where: 'set', set: v.id })).join('')}</ul>
      ${v.found > v.from + v.cards.length ? `<button type="button" class="link" data-vmore>Show more</button>` : ''}
    </section>`;
  }
  async function loadViewer(id, more = false) {
    try { const from = more && viewer ? viewer.from + viewer.cards.length : 0; const v = await api('/api/lab/set', { id, ...vq, from }); viewer = more && viewer ? { ...v, from: viewer.from, cards: [...viewer.cards, ...v.cards] } : v; } catch (e) { msg = e.message; viewer = null; }
  }
  async function pickPath(kind) {
    try {
      const res = kind === 'folder' ? await api('/api/pick-folder', { purpose: 'project' }) : await api('/api/own-models/pick', { kind: 'docs' });
      if (res.error) { msg = res.error; return ''; }
      return res.folder || res.file || '';
    } catch (e) { msg = e.message; return ''; }
  }
  const addItem = (p) => { if (!p || bld.items.some((i) => i.path === p)) return; const base = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'My files'; const skill = base.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(); bld.items.push({ path: p, skill: skill ? skill[0].toUpperCase() + skill.slice(1) : 'My files' }); if (!bld.name) bld.name = `Lessons from ${skill || 'my files'}`.slice(0, 60); bsurvey = null; };

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
        ${box('try', s.try, 'Try it first, before cutting', `Brain Engine runs ${b?.name || 'the brain'} with only the kept experts switched on and gives it the Lab test, so you see the score before any file is written. It counts as the test of ${b?.name || 'the brain'} too.`, view.brainEngine ? '' : 'Needs Brain Engine, Bob\'s Lab engine (a version of llama.cpp that can switch experts off). Get it in Get models > Engines: Brain Engine (test build).')}
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

  function runTable(id) { // a finished challenge run as a table for Save
    const x = view.runs.find((r) => r.id === id);
    if (!x?.report?.challenges) return { title: 'Lab result', head: [], rows: [] };
    return { title: `Challenges for ${x.from}`, head: ['Challenge', 'Score (out of 100)', 'Right'], rows: x.report.challenges.map((c) => [c.title, c.score ?? '-', c.skipped ? 'skipped' : `${c.right} of ${c.of}`]), note: x.report.tps ? `${x.report.tps} words a second. Temperature 0, thinking off.` : 'Temperature 0, thinking off.' };
  }

  function runsHtml() {
    if (!view.runs.length) return '';
    return `<section class="lab-runs"><h3>Lab jobs</h3><ul class="tlist">${view.runs.map((x) => `<li><strong>${esc(x.name)}</strong> <span class="muted">${x.kind === 'write' ? `lessons, taught by ${esc(x.from)}` : x.kind === 'challenge' ? 'challenges' : x.kind === 'ladder' ? 'quantization ladder' : x.kind === 'ladder-ask' ? 'same question, every size' : x.kind === 'build' || x.kind === 'sample' ? `${x.kind === 'sample' ? 'sample lessons' : 'lessons'} from your files, taught by ${esc(x.from)}` : `from ${esc(x.from)}`} · ${x.state === 'running' ? `${esc(x.stepLabel || '')}${x.progress ? `, ${x.progress}%` : ''}` : x.state === 'done' ? `done${x.sizeGB ? `, ${x.sizeGB} GB` : ''}` : esc(x.state)}</span>
      ${x.state === 'running' ? ' <button type="button" class="link" data-stop>Stop</button>' : ''}
      ${x.state === 'failed' || x.state === 'stopped' ? `<br><span class="muted">${esc(x.error || '')}</span>` : ''}
      ${(x.notes || []).map((n) => `<br><span class="muted">${esc(n)}</span>`).join('')}
      ${x.kind === 'write' && x.report ? `<br><span class="muted">${x.report.lessons} lessons written in ${x.report.minutes} minutes. Pick it in step 2, under A lesson set I wrote or built here.</span>` : ''}
      ${x.kind === 'build' && x.report ? `<br><span class="muted">${x.report.lessons} lessons built in ${x.report.minutes} minutes${x.report.held ? `, ${x.report.held} passages held back` : ''}. Pick it in step 2, under A lesson set I wrote or built here, or open it under Sets built from your files.</span>` : ''}
      ${x.kind === 'sample' && x.report ? `<br><span class="muted">${x.report.lessons} sample lessons in ${x.report.minutes} minutes${x.report.held ? `, ${x.report.held} passages held back` : ''}. They're under Build a new set from my files, in step 2.</span>` : ''}
      ${x.kind === 'challenge' && x.report ? `<table class="lab-report"><caption class="muted">Challenges (out of 100)</caption><tr><th scope="col">Challenge</th><th scope="col">Score</th><th scope="col">Right</th></tr>${x.report.challenges.map((c) => `<tr><th scope="row">${esc(c.title)}</th><td>${c.score ?? '-'}</td><td>${c.skipped ? esc(c.skipped) : `${c.right} of ${c.of}`}</td></tr>`).join('')}</table>${saveHtml(x.id, saveState(x.id), view.hardware)}` : ''}
      ${x.report?.coverage ? `<table class="lab-report"><caption class="muted">Coverage cut: kept ${x.report.coverage.experts} of ${x.report.coverage.of} experts per layer</caption><tr><th scope="col">Skill</th><th scope="col">Kept, on average</th><th scope="col">Worst layer</th></tr>${x.report.coverage.skills.map((k) => `<tr><th scope="row">${esc(k.name)}</th><td>${k.average}%</td><td>${k.worst}% (layer ${k.worstLayer})</td></tr>`).join('')}</table>` : ''}
      ${x.report?.tried ? `<br><span class="muted">Tried first on Brain Engine: ${x.report.tried.masked} with only the kept experts, ${x.report.tried.full} with all of them.</span>` : ''}
      ${x.report?.made ? `<table class="lab-report"><caption class="muted">Lab test (out of 100)</caption><tr><th scope="col"></th><th scope="col">${esc(x.name)}</th>${x.report.from ? `<th scope="col">${esc(x.from)}</th>` : ''}</tr>${Object.keys(PARTS).map((k) => `<tr><th scope="row">${esc(PARTS[k])}</th><td>${x.report.made.parts[k]?.score ?? '-'}</td>${x.report.from ? `<td>${x.report.from.parts[k]?.score ?? '-'}</td>` : ''}</tr>`).join('')}<tr><th scope="row">All</th><td>${x.report.made.score}</td>${x.report.from ? `<td>${x.report.from.score}</td>` : ''}</tr><tr><th scope="row">Size</th><td>${x.report.sizeGB} GB</td>${x.report.from ? `<td>${x.report.fromGB} GB</td>` : ''}</tr><tr><th scope="row">Words a second</th><td>${x.report.made.tps || '-'}</td>${x.report.from ? `<td>${x.report.from.tps || '-'}</td>` : ''}</tr></table>
        ${x.used ? '<span class="muted">In Bob, under Get models.</span>' : `<button type="button" class="get" data-use="${esc(x.id)}">Use in Bob</button>`}` : ''}</li>`).join('')}</ul></section>`;
  }

  const PACK_COLS = () => (view?.packs || []).map((p) => [p.id, p.title]);
  function boardTable() {
    const rows = [...(view.scores || [])];
    const key = ch.sort, val = (r) => (key === 'name' ? r.name.toLowerCase() : key === 'size' ? r.sizeGB ?? -1 : key === 'speed' ? r.tps ?? -1 : r.scores[key] ?? -1);
    rows.sort((a, b) => { const x = val(a), y = val(b); const c = x < y ? -1 : x > y ? 1 : 0; return ch.down ? -c : c; });
    const head = ['Brain', ...PACK_COLS().map(([, t]) => t), 'Size', 'Words a second'];
    return { title: 'Lab scoreboard', head, rows: rows.map((r) => [r.name, ...PACK_COLS().map(([id]) => (r.scores[id] ?? '-')), r.sizeGB ? `${r.sizeGB} GB` : '-', r.tps ?? '-']), note: 'Scores out of 100, temperature 0, thinking off. Only comparable with other scores from the same replicant matrix.' };
  }
  // 1.5.162 The local leaderboard: brains ranked inside classes of models by their total weights, not by graphics card.
  const wts = (r) => (r.paramsB ? `${r.paramsB}B${r.moe && r.activeB ? `, ${r.activeB}B at work` : ''}` : '-');
  const boardRows = () => (view.scores || []).filter((r) => (ch.kind === 'all' || (ch.kind === 'moe') === r.moe) && (!ch.here || r.madeHere) && (!ch.fits || !view.cardGB || (r.sizeGB && r.sizeGB <= view.cardGB)));
  function classTable() { // the same boards, for Save: one table with the class in its own column
    const name = Object.fromEntries((view.classes || []).map((c) => [c.id, c.label]));
    const rows = boardRows().sort((a, b) => (view.classes || []).findIndex((c) => c.id === a.cls) - (view.classes || []).findIndex((c) => c.id === b.cls) || order(a, b));
    return { title: 'Lab leaderboard by class', head: ['Class', 'Brain', 'Overall', 'Weights', 'Quant', 'Size', 'Words a second', ...PACK_COLS().map(([, t]) => t)], rows: rows.map((r) => [name[r.cls] || 'Not placed yet', r.name, r.overall ?? '-', wts(r), r.quant || '-', r.sizeGB ? `${r.sizeGB} GB` : '-', r.tps ?? '-', ...PACK_COLS().map(([id]) => (r.scores[id] == null ? '-' : r.old.includes(id) ? `${r.scores[id]} (older test)` : r.scores[id]))]), note: 'Classes by total weights. Overall = average of every challenge, run with the current version of each test; brains that haven\'t run them all sit below the ones that have. Scores out of 100, temperature 0, thinking off. Only comparable with other scores from the same replicant matrix.' };
  }
  const order = (a, b) => Number(Boolean(b.all)) - Number(Boolean(a.all)) || (b.overall ?? -1) - (a.overall ?? -1) || (b.tps ?? 0) - (a.tps ?? 0) || (a.sizeGB ?? 0) - (b.sizeGB ?? 0);
  function classTables() {
    const rows = boardRows(), classes = [...(view.classes || []), { id: '', label: 'Not placed yet', hint: 'Scored before classes. Run any challenge on it again to place it.' }];
    const cell = (r, id) => { const v = r.scores[id]; if (v == null) return '<td>-</td>'; return r.old.includes(id) ? `<td class="muted"><s>${v}</s><span class="sr-only"> (older test, not counted)</span></td>` : `<td>${v}</td>`; };
    const out = classes.map((c) => {
      const list = rows.filter((r) => r.cls === c.id).sort(order); // ran them all first, then overall, speed, smaller file
      if (!list.length) return '';
      return `<table class="lab-report lab-board lab-class"><caption><strong>${esc(c.label)}</strong> <span class="muted">· ${esc(c.hint)}</span></caption>
        <tr><th scope="col">Place</th><th scope="col">Brain</th><th scope="col">Overall</th><th scope="col">Weights</th><th scope="col">Quant</th><th scope="col">Size</th><th scope="col">Words a second</th>${PACK_COLS().map(([, t]) => `<th scope="col">${esc(t)}</th>`).join('')}</tr>
        ${list.map((r, i) => `<tr${i === 0 && r.all && c.id ? ' class="lab-best"' : ''}><td>${c.id ? i + 1 : '-'}${i === 0 && r.all && c.id ? ' <span class="lab-ribbon">Best in class</span>' : ''}</td><th scope="row">${esc(r.name)}${r.madeHere ? ' <span class="muted">(made here)</span>' : ''}</th><td>${r.overall ?? '-'}${r.ran && r.ran < PACK_COLS().length ? `<br><span class="muted">${r.ran} of ${PACK_COLS().length} run</span>` : ''}</td><td>${esc(wts(r))}</td><td>${esc(r.quant || '-')}</td><td>${r.sizeGB ? `${r.sizeGB} GB` : '-'}</td><td>${r.tps ?? '-'}</td>${PACK_COLS().map(([id]) => cell(r, id)).join('')}</tr>`).join('')}</table>`;
    }).join('');
    return out || '<p class="muted">No brains match those choices.</p>';
  }
  function challengesHtml() {
    const busy = running();
    const brains = view.brains.filter((b) => b.facts);
    const sortBtn = (key, label) => `<th scope="col" aria-sort="${ch.sort === key ? (ch.down ? 'descending' : 'ascending') : 'none'}"><button type="button" class="link lab-sort" data-sort="${key}">${esc(label)}${ch.sort === key ? (ch.down ? ' ↓' : ' ↑') : ''}</button></th>`;
    const t = boardTable();
    const chip = (attr, on, label) => `<button type="button" class="lab-chip${on ? ' on' : ''}" aria-pressed="${on}" ${attr}>${esc(label)}</button>`;
    const pick = `<div class="row lab-chips" role="group" aria-label="Scoreboard view">${chip('data-boardby="class"', ch.by === 'class', 'By class of model')}${chip('data-boardby="all"', ch.by === 'all', 'Every brain in one table')}</div>
      ${ch.by === 'class' ? `<div class="row lab-chips" role="group" aria-label="Show">${chip('data-boardkind="all"', ch.kind === 'all', 'All')}${chip('data-boardkind="moe"', ch.kind === 'moe', 'Mixture of experts')}${chip('data-boardkind="dense"', ch.kind === 'dense', 'Dense')}${chip('data-boardhere', ch.here, 'Made here')}${view.cardGB ? chip('data-boardfits', ch.fits, `Fits my ${view.cardGB} GB graphics card`) : ''}</div>
      <p class="muted">Each class is by how many weights a brain has in all. A mixture of experts sits with its total, and shows how many are at work on each word. Quantizing never moves a brain to another class; the Quant column says how it was squeezed. Overall is the average of every challenge, run with today's version of each test. A brain that hasn't run them all shows how many it ran and sits below the ones that have, so it can't win by skipping the hard one. A crossed-out score came from an older version of that test.</p>
      ${classTables()}${saveHtml('board', saveState('board'), view.hardware)}` : ''}`;
    const board = !view.scores?.length ? '<p class="muted">No scores yet. Pick a brain and run some challenges, and they show here.</p>' : ch.by === 'class' ? pick : `${pick}<table class="lab-report lab-board"><caption class="muted">Scores out of 100. Press a column's name to sort by it.</caption>
      <tr>${sortBtn('name', 'Brain')}${PACK_COLS().map(([id, title]) => sortBtn(id, title)).join('')}${sortBtn('size', 'Size')}${sortBtn('speed', 'Words a second')}</tr>
      ${t.rows.map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')}</table>
      ${saveHtml('board', saveState('board'), view.hardware)}`;
    return `<div id="lab-page-challenges" role="tabpanel" aria-labelledby="lab-tab-challenges">
      <p class="muted">Short tests, out of 100, for any brain on this replicant matrix. I ask every question at temperature 0 with thinking off, so the same brain gets the same score twice. The scores only mean something next to each other, here: they aren't the numbers you see in papers.</p>
      ${runsHtml()}
      <fieldset><legend>Which brain?</legend>${brains.length ? brains.map((b) => radio('chfrom', b.id, ch.from === b.id, `${b.name}${b.madeInLab ? ' (made in the Lab)' : ''}`, `${b.facts.sizeGB} GB. ${b.fit}`)).join('') : '<p>There are no brains here the Lab can run yet. Get one in Get models first.</p>'}</fieldset>
      <fieldset><legend>Challenges</legend>${(view.packs || []).map((p) => `<label class="lab-opt"><input type="checkbox" data-pack="${esc(p.id)}" ${ch.packs.includes(p.id) ? 'checked' : ''}> <span><strong>${esc(p.title)}</strong> <span class="muted">· ${p.count} questions · about ${p.minutes} min on a 16 GB card</span><br><span class="muted">${esc(p.what)}</span></span></label>`).join('')}</fieldset>
      ${askUnload?.challenge ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.join(', '))} is loaded. The challenges need the card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-unload>Unload it and start</button><button type="button" class="link" data-nounload>Not now</button></div></div>` : ''}
      <div class="row"><button type="button" class="get" data-chgo ${ch.from && ch.packs.length && !busy ? '' : 'disabled'}>${busy ? 'The Lab is busy' : 'Run the challenges'}</button></div>
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
      <section class="lab-compare"><h3>Scoreboard</h3>${board}</section>
    </div>`;
  }

  function draw() {
    if (!view) { body.innerHTML = `<p class="muted">${esc(msg || 'Loading...')}</p>`; return; }
    if (!view.on) { body.innerHTML = '<p>The Lab is off. Turn on <strong>Show the Computer Science Lab</strong> in Settings, How Bob works, Brains.</p>'; return; }
    const tabs = `<div class="lab-tabs" role="tablist" aria-label="Lab pages">${TABS.map(([id, label]) => `<button type="button" role="tab" id="lab-tab-${id}" class="lab-tab${tab === id ? ' on' : ''}" aria-selected="${tab === id}" aria-controls="lab-page-${id}" tabindex="${tab === id ? 0 : -1}" data-tab="${id}">${esc(label)}</button>`).join('')}</div>`;
    if (tab === 'learn') { body.innerHTML = `<div class="lab">${tabs}<div id="lab-page-learn" role="tabpanel" aria-labelledby="lab-tab-learn"></div></div>`; learn.mount($('lab-page-learn')); return; }
    if (tab === 'challenges') { body.innerHTML = `<div class="lab">${tabs}${challengesHtml()}</div>`; return; }
    if (tab === 'forge') { body.innerHTML = `<div class="lab">${tabs}${fg.html()}</div>`; return; }
    if (tab === 'playground') { body.innerHTML = `<div class="lab">${tabs}${pg.html(runsHtml())}</div>`; return; }
    const i = STEPS.findIndex(([id]) => id === step);
    const html = { brain: brainStep, lessons: lessonsStep, smaller: smallerStep, where: whereStep, test: testStep }[step]();
    const busy = running();
    body.innerHTML = `<div class="lab">${tabs}<div id="lab-page-make" role="tabpanel" aria-labelledby="lab-tab-make">
      <p class="muted">Make your own brain from one on this replicant matrix. Each step says what it does and whether this replicant matrix can do it. Show the recipe shows the exact commands, if you want to learn them.</p>
      ${view.recipes.length ? `<p><label>Start from a saved recipe <select id="lab-recipe"><option value="">(none)</option>${view.recipes.map((x, n) => `<option value="${n}">${esc(x.name)}</option>`).join('')}</select></label></p>` : ''}
      ${runsHtml()}
      ${rc.galleryHtml()}
      ${templateHtml()}
      <nav class="lab-steps" aria-label="Lab steps"><ol>${STEPS.map(([id, label], n) => `<li><button type="button" class="lab-step${id === step ? ' on' : ''}" data-step="${id}" ${id === step ? 'aria-current="step"' : ''} ${n > 0 && !r.from ? 'disabled' : ''}>${esc(label)}</button></li>`).join('')}</ol></nav>
      <div class="lab-panel" id="lab-panel">${html}</div>
      ${plan ? `<div class="lab-check" role="status">${plan.problems.length ? `<p><strong>Before it can start:</strong></p><ul>${plan.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : `<p><strong>Ready.</strong> ${plan.steps.length} steps: ${plan.steps.map((s) => esc(s.label)).join(', ')}.</p>`}${plan.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>` : ''}
      ${rc.estimateHtml()}
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
      ${rc.usageHtml()}
    </div></div>`;
  }

  body.addEventListener('change', async (e) => {
    const el = e.target; msg = '';
    if (tab === 'learn') return; // the Learn tab listens for itself
    { const f = await fg.change(el); if (f) { draw(); $(el.id)?.focus(); return; } }
    if (await pg.change(el)) return draw();
    if (el.name === 'chfrom') { ch.from = el.value; return draw(); }
    if (el.dataset.pack) { const k = el.dataset.pack; ch.packs = el.checked ? [...new Set([...ch.packs, k])] : ch.packs.filter((x) => x !== k); return draw(); }
    if (el.dataset.savefmt) { saveState(el.dataset.savefmt).format = el.value; return draw(); }
    if (el.dataset.savehw) { saveState(el.dataset.savehw).hardware = el.checked; return draw(); }
    if (await rc.change(el)) return;
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
    else if (el.id === 'lab-b-name') bld.name = el.value;
    else if (el.id === 'lab-b-path') { typedPath = el.value; return; }
    else if (el.id === 'lab-b-teacher') bld.teacher = el.value;
    else if (el.dataset.bskill) { const it = bld.items[Number(el.dataset.bskill)]; if (it) it.skill = el.value; bsurvey = null; }
    else if (el.dataset.bkind) { const k = el.dataset.bkind; bld.kinds = el.checked ? [...new Set([...bld.kinds, k])] : bld.kinds.filter((x) => x !== k); if (bsurvey) bsurvey = null; }
    else if ('bresay' in el.dataset) bld.resay = el.checked;
    else if (el.id === 'lab-b-count' || el.id === 'lab-b-count-n') bld.count = Number(el.value);
    else if (el.name === 'bthink') bld.think = el.value;
    else if (el.id === 'lab-v-q' || el.id === 'lab-v-skill' || el.id === 'lab-v-kind' || el.id === 'lab-v-file') { vq[{ 'lab-v-q': 'q', 'lab-v-skill': 'skill', 'lab-v-kind': 'kind', 'lab-v-file': 'file' }[el.id]] = el.value; if (viewer) await loadViewer(viewer.id); return draw(); }
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
  body.addEventListener('keydown', (e) => { // left and right move between the tabs, as tabs should
    if (!e.target.matches?.('[role=tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const ids = TABS.map(([id]) => id), n = ids.indexOf(tab);
    tab = e.key === 'Home' ? ids[0] : e.key === 'End' ? ids[ids.length - 1] : ids[(n + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
    e.preventDefault(); draw(); $(`lab-tab-${tab}`)?.focus();
  });
  body.addEventListener('input', (e) => { // the slider and its number box move together
    if (pg.input(e.target)) return;
    if (e.target.id === 'lab-chunks') { const n = $('lab-chunks-n'); if (n) n.value = e.target.value; }
    if (e.target.id === 'lab-chunks-n') { const s = $('lab-chunks'); if (s) s.value = e.target.value; }
    if (e.target.id === 'lab-w-count') { const n = $('lab-w-count-n'); if (n) n.value = e.target.value; }
    if (e.target.id === 'lab-w-count-n') { const s = $('lab-w-count'); if (s) s.value = e.target.value; }
    if (e.target.id === 'lab-b-count') { const n = $('lab-b-count-n'); if (n) n.value = e.target.value; }
    if (e.target.id === 'lab-b-count-n') { const s = $('lab-b-count'); if (s) s.value = e.target.value; }
  });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    msg = '';
    if (b.dataset.tab) { tab = b.dataset.tab; draw(); $(`lab-tab-${tab}`)?.focus(); return; }
    if (tab === 'learn' && !b.dataset.tab) return;
    if (b.dataset.boardby) { ch.by = b.dataset.boardby; draw(); body.querySelector(`[data-boardby="${ch.by}"]`)?.focus(); return; }
    if (b.dataset.boardkind) { ch.kind = b.dataset.boardkind; draw(); body.querySelector(`[data-boardkind="${ch.kind}"]`)?.focus(); return; }
    if ('boardhere' in b.dataset) { ch.here = !ch.here; draw(); body.querySelector('[data-boardhere]')?.focus(); return; }
    if ('boardfits' in b.dataset) { ch.fits = !ch.fits; draw(); body.querySelector('[data-boardfits]')?.focus(); return; }
    if (b.dataset.sort) { ch.down = ch.sort === b.dataset.sort ? !ch.down : b.dataset.sort !== 'name'; ch.sort = b.dataset.sort; draw(); body.querySelector(`[data-sort="${ch.sort}"]`)?.focus(); return; }
    if (b.dataset.saveopen) { Object.assign(saveState(b.dataset.saveopen), { open: true, saved: '', error: '' }); return draw(); }
    if (b.dataset.saveclose) { saveState(b.dataset.saveclose).open = false; return draw(); }
    if (b.dataset.savego) {
      const k = b.dataset.savego, st = saveState(k);
      const table = k === 'board' ? (ch.by === 'class' ? classTable() : boardTable()) : pg.saveTable(k) || runTable(k);
      try { st.saved = await saveResult(api, table, { format: st.format, hardware: st.hardware, version: view.version, hw: view.hardware }); st.error = ''; } catch (err) { st.error = err.message; st.saved = ''; }
      return draw();
    }
    if ('chgo' in b.dataset || (askUnload?.challenge && 'unload' in b.dataset)) {
      try {
        const res = await api('/api/lab/challenge', { challenge: { from: ch.from, packs: ch.packs }, unload: 'unload' in b.dataset });
        if (res.needUnload) { askUnload = Object.assign(res.names, { challenge: true }); return draw(); }
        askUnload = null;
      } catch (err) { msg = err.message; }
      return load();
    }
    { const f = await fg.click(b); if (f === 'draw') return draw(); if (f) return; }
    { const p = await pg.click(b, load); if (p === 'draw') return draw(); if (p) return; }
    if (await rc.click(b)) return;
    if (b.dataset.step) { step = b.dataset.step; return draw(); }
    if ('next' in b.dataset) { step = STEPS[Math.min(STEPS.length - 1, STEPS.findIndex(([id]) => id === step) + 1)][0]; return draw(); }
    if ('back' in b.dataset) { step = STEPS[Math.max(0, STEPS.findIndex(([id]) => id === step) - 1)][0]; return draw(); }
    if ('recipe' in b.dataset) { showRecipe = !showRecipe; return draw(); }
    if ('copy' in b.dataset) { try { await navigator.clipboard.writeText(plan?.text || ''); b.textContent = 'Copied'; } catch { b.textContent = 'Couldn\'t copy'; } return; }
    if ('nounload' in b.dataset) { askUnload = null; return draw(); }
    if ('writeopen' in b.dataset) { writing = true; await replan(); $('lab-w-name')?.focus(); return; }
    if ('writeclose' in b.dataset) { writing = false; wplan = null; return draw(); }
    // Lab 2c: the lesson builder
    if ('buildopen' in b.dataset) { building = true; await replan(); $('lab-b-name')?.focus(); return; }
    if ('buildclose' in b.dataset) { building = false; bplan = null; return draw(); }
    if ('baddfolder' in b.dataset || 'baddfile' in b.dataset) { const p = await pickPath('baddfolder' in b.dataset ? 'folder' : 'file'); if (p) addItem(p); return replan(); }
    if ('baddpath' in b.dataset) { addItem(typedPath.trim().replace(/^"|"$/g, '')); typedPath = ''; return replan(); }
    if (b.dataset.bremove) { bld.items.splice(Number(b.dataset.bremove), 1); bsurvey = null; return replan(); }
    if ('bsurvey' in b.dataset) { surveying = true; draw(); try { bsurvey = await api('/api/lab/build/survey', { build: bld }); } catch (err) { msg = err.message; bsurvey = null; } surveying = false; return replan(); }
    if (b.dataset.passage) { const k = b.dataset.passage; openPassage.has(k) ? openPassage.delete(k) : openPassage.add(k); return draw(); }
    if (b.dataset.keep) { notLike = ''; b.textContent = 'Kept'; b.disabled = true; return; }
    if (b.dataset.notlike) { notLike = notLike === b.dataset.notlike ? '' : b.dataset.notlike; return draw(); }
    if (b.dataset.fb) {
      const f = bld.feedback;
      if (b.dataset.fb === 'file' && b.dataset.file) f.dropFiles = [...new Set([...f.dropFiles, b.dataset.file])];
      else if (b.dataset.fb === 'kind' && b.dataset.file) f.notKinds[b.dataset.file] = [...new Set([...(f.notKinds[b.dataset.file] || []), b.dataset.kind])];
      else if (b.dataset.fb === 'idea') f.badIdeas = [...new Set([...f.badIdeas, b.dataset.key])];
      notLike = ''; bsurvey = null; return replan();
    }
    if (b.dataset.openset) { if (viewer?.id === b.dataset.openset) viewer = null; else { vq = { q: '', skill: '', file: '', kind: '' }; await loadViewer(b.dataset.openset); } return draw(); }
    if ('vmore' in b.dataset && viewer) { await loadViewer(viewer.id, true); return draw(); }
    if (b.dataset.rmlesson && viewer) { try { await api('/api/lab/set/remove', { id: viewer.id, keys: [b.dataset.rmlesson] }); } catch (err) { msg = err.message; } await loadViewer(viewer.id); await load(); return; }
    if (b.dataset.rmfile && viewer) { try { await api('/api/lab/set/remove', { id: viewer.id, file: b.dataset.rmfile }); } catch (err) { msg = err.message; } await loadViewer(viewer.id); await load(); return; }
    if (b.dataset.export) { try { exportInfo = { id: b.dataset.export, ...(await api('/api/lab/set/export', { id: b.dataset.export, check: true })) }; } catch (err) { msg = err.message; exportInfo = null; } return draw(); }
    if ('exportclose' in b.dataset) { exportInfo = null; return draw(); }
    if (b.dataset.exportgo) { const folder = await pickPath('folder'); if (!folder) return draw(); try { exportInfo = { id: b.dataset.exportgo, ...(await api('/api/lab/set/export', { id: b.dataset.exportgo, folder })) }; } catch (err) { msg = err.message; } return draw(); }
    if ('csv' in b.dataset || 'json' in b.dataset) { try { saved = (await api('/api/lab/compare', { ids: picked, save: 'csv' in b.dataset ? 'csv' : 'json' })).file; } catch (err) { msg = err.message; } return draw(); }
    try {
      if ('write' in b.dataset || (askUnload?.write && 'unload' in b.dataset)) {
        const res = await api('/api/lab/write', { write: w, unload: 'unload' in b.dataset });
        if (res.needUnload) { askUnload = Object.assign(res.names, { write: true }); return draw(); }
        askUnload = null; writing = false; wplan = null;
      } else if ('bsample' in b.dataset || 'bbuild' in b.dataset || (askUnload?.build && 'unload' in b.dataset)) {
        const sample = 'bsample' in b.dataset || askUnload?.build === 'sample';
        const res = await api(sample ? '/api/lab/build/sample' : '/api/lab/build', { build: bld, unload: 'unload' in b.dataset });
        if (res.needUnload) { askUnload = Object.assign(res.names, { build: sample ? 'sample' : 'build' }); return draw(); }
        askUnload = null; if (!sample) { building = false; bplan = null; }
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
    update(run) { if (!view) return; rc.runUpdate(run); const i = view.runs.findIndex((x) => x.id === run.id); if (i >= 0) view.runs[i] = run; else view.runs.unshift(run); if ((run.kind === 'challenge' || run.kind?.startsWith('ladder')) && run.state !== 'running') { load(); return; } if (tab === 'learn') return; if (dlg.open && !body.contains(document.activeElement)) draw(); else if (dlg.open) { const live = body.querySelector('.lab-runs'); if (live) live.outerHTML = runsHtml(); } }
  };
}
