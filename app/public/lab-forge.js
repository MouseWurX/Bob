// 1.5.159 🧪 Computer Science Lab: the Forge tab. Every way to make a brain as a card with its best practice, the
// Forge's past runs, and a form that writes a Forge plan. Its own module, like the Playground: the Lab page only
// places it and hands over its events. Nothing here starts a rental.
import { esc } from './rich.js';
import { nameNow } from './lab-names.js'; // 1.5.199 proper names in Professional mode
import { PATH_GROUPS, BUNDLES, PERSONALITY, TEACH } from './lab-thinking-paths.js'; // 1.5.160
import { createHomeWays } from './lab-home-ways.js'; // 1.5.164 Mix two brains, Stack layers, Take out the refusal habit: here, free
import { newSource, sourceRowHtml, sourceOut, sourceEvent } from './lab-source.js'; // 1.5.163 one chooser for where things come from
import { createProtocol } from './lab-protocol.js'; // 13 Nov the training protocol and its free steps

const WHERE = { here: 'Here, free', rented: 'Rented card', both: 'Here, or a rented card' };

export function createForge({ api, goMake, view = () => null, runs = () => '' }) {
  const hw = createHomeWays({ api, view }); // 1.5.164
  const pr = createProtocol({ api }); // 13 Nov
  let fv = null, loading = false, fmsg = '', check = null, showPlan = false, saved = '', buy = null, stopAsk = false;
  const lib = { from: '', name: '', busy: false, msg: '', open: {} }; // the lesson library: add a set, pick its parts
  const form = { base: '', run: '', rungs: [{ name: '', nickname: '', how: 'number', keep: 128, keepFile: '' }], strong: [], quants: ['Q4_K_M'], heal: { experts: 'lora', epochs: 1, learn: 'answer', thinking_weight: 0.5, odds_cover: 'answer' }, teach: {}, thinking: { mode: 'blend', shares: {}, own: '', ownShare: 0, personality: { alignment: {}, rules: {}, mood: {} } }, hours_max: 0, dollars_max: 0, note: '', brain: { pick: '', source: newSource('hf') }, lessonSets: [], lessonParts: {}, lessons: [], ways: { pref: 'off', pairs: '', onpolicy: 0, grpo: false, grpoHours: 1.5, targets: [], surgery: '' } }; // 1.5.163 the brain to start from, and lessons from anywhere

  async function load() { loading = true; try { fv = await api('/api/lab/forge'); if (!form.base && fv?.plans?.[0]) form.base = fv.plans[0].id; } catch (e) { fmsg = e.message; } loading = false; }
  // The form's thinking state as the server reads it (paths with a share above 0 only).
  const srcOf = (id) => (id === 'forge-brainsrc' ? form.brain.source : form.lessons[Number(id.split('-').pop())] || null);
  const look = (x) => api('/api/lab/forge/hf', { ref: x.value, kind: x === form.brain.source ? 'model' : 'dataset' });
  const sendForm = () => ({ ...form, brain: { pick: form.brain.pick, source: form.brain.pick === 'source' ? sourceOut(form.brain.source) : null }, lessons: form.lessons.map(sourceOut).filter(Boolean), thinking: { mode: form.thinking.mode, paths: Object.entries(form.thinking.shares).filter(([, v]) => v > 0).map(([name, share]) => ({ name, share })), own: form.thinking.own, ownShare: form.thinking.ownShare, personality: form.thinking.personality } });
  async function recheck() { check = null; saved = ''; if (!fv?.found) return; try { check = await api('/api/lab/forge/plan', { form: sendForm() }); } catch (e) { fmsg = e.message; } }

  const card = (m) => `<li class="forge-card${m.ready ? '' : ' dim'}"><h4 id="forge-m-${m.id}">${nameNow(m.title)}</h4>
    <p class="muted"><span class="forge-where">${esc(WHERE[m.where] || m.where)}</span></p>
    <p>${esc(m.what)}</p>
    <details class="forge-tips-d"><summary>Best practice</summary><ul class="forge-tips">${m.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>
    ${m.ready && m.use === 'make' ? `<button type="button" class="link" data-forgeuse="make" data-method="${m.id}" aria-describedby="forge-m-${m.id}">Use this way</button>`
      : m.ready && m.use === 'home' ? `<button type="button" class="link" data-forgeuse="home" data-method="${m.id}" aria-describedby="forge-m-${m.id}" aria-expanded="${hw.isOpen() === m.id}">${hw.isOpen() === m.id ? 'Close it' : 'Use this way'}</button>`
      : m.use === 'forge' ? `<button type="button" class="link" data-forgeuse="form" aria-describedby="forge-m-${m.id}">Write a plan for it</button><p class="muted">${esc(m.why || '')}</p>`
      : `<p class="muted">${esc(m.why || '')}</p>`}</li>`;

  // Nov 11: Make it smaller and Cut experts are Make a brain jobs, so they're one line here that opens that page, not
  // cards repeating it.
  const makeLine = () => { const ms = fv.methods.filter((m) => m.ready && m.use === 'make'); return ms.length ? `<p class="forge-make">${ms.map((m) => `<button type="button" class="link" data-forgeuse="make" data-method="${m.id}">${nameNow(m.title)}</button>`).join(' · ')} <span class="muted">are on Make a brain.</span></p>` : ''; };

  function runsHtml() {
    if (!fv.found) return `<p class="muted">Bob can't find the Forge. It lives in the model-lab folder of Bob's source, and installs don't carry it.${fv.looked?.length ? ` Bob looked in ${esc(fv.looked.join(', '))}. Put a copy of model-lab in one of them, or write its place in Bob's config.json as "forgeDir".` : ''}</p>`;
    const runs = fv.runs.length ? `<ul class="tlist">${fv.runs.map((r) => `<li><strong>${esc(r.when)}</strong> <span class="muted">· ${r.state === 'done' ? 'finished' : r.state === 'stopped' ? 'stopped' : 'no end recorded'}${r.made.length ? ` · made ${esc(r.made.join(', '))}` : ''}</span>
      <details><summary>Last lines of its log</summary><pre tabindex="0">${esc(r.tail.join('\n'))}</pre></details></li>`).join('')}</ul>` : '<p class="muted">No Forge runs on this replicant matrix yet.</p>';
    const brains = fv.brains.length ? `<table class="lab-report"><caption class="muted">Brains the Forge brought home. Surprise on held-back lessons, lower is better; the teacher's own score is the floor.</caption>
      <tr><th scope="col">Brain</th><th scope="col">Before teaching back</th><th scope="col">After</th><th scope="col">Teacher's score (the floor)</th><th scope="col">Teaching pass</th><th scope="col">Files</th></tr>
      ${fv.brains.map((b) => `<tr><th scope="row">${esc(b.name)}</th><td>${b.before ?? '-'}</td><td>${b.after ?? '-'}</td><td>${b.floor ?? '-'}</td><td>${b.steps && b.planned ? (b.steps >= b.planned ? 'full' : `${Math.round((100 * b.steps) / b.planned)}%`) : '-'}</td><td>${esc(b.files.join(', ') || '-')}</td></tr>`).join('')}</table>` : '';
    return `${runs}${brains}`;
  }

  const num = (id, label, v, min, max, step, hint = '') => `<label class="forge-num" for="${id}">${esc(label)} <input id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(String(v))}"${hint ? ` aria-describedby="${id}-h"` : ''}></label>${hint ? `<span class="muted" id="${id}-h">${esc(hint)}</span>` : ''}`;

  function rungHtml(r, i) {
    const files = fv.keepFiles || [];
    return `<fieldset class="forge-rung"><legend>Brain ${i + 1}${i ? `, made from ${esc(form.rungs[i - 1].name || `brain ${i}`)}` : ', cut from the teacher'}</legend>
      <label>Name <input id="forge-r-${i}-name" data-rung="${i}" data-f="name" value="${esc(r.name)}" maxlength="24" placeholder="20Bob"></label>
      <label>Nickname <input id="forge-r-${i}-nick" data-rung="${i}" data-f="nickname" value="${esc(r.nickname)}" maxlength="24" placeholder="optional"></label>
      <div role="radiogroup" aria-label="How to cut brain ${i + 1}">
        ${[['number', 'Keep a number of experts in each layer'], ['cover', 'Keep every skill covered'], ['file', 'Use a keep file from the Lab']].map(([v, l]) => `<label class="lab-opt"><input type="radio" name="forge-how-${i}" data-rung="${i}" data-f="how" value="${v}" ${r.how === v ? 'checked' : ''} ${v === 'file' && !files.length ? 'disabled' : ''}> <span>${esc(l)}${v === 'file' && !files.length ? ' <span class="muted">(none yet: cut or map a brain in the Lab first)</span>' : ''}</span></label>`).join('')}
      </div>
      ${r.how === 'file' ? `<label>Keep file <select id="forge-r-${i}-file" data-rung="${i}" data-f="keepFile"><option value="">(pick one)</option>${files.map((k) => `<option value="${esc(k.id)}" ${r.keepFile === k.id ? 'selected' : ''}>${esc(k.name)} · ${k.experts} experts, ${k.layers} layers</option>`).join('')}</select></label>`
        : num(`forge-keep-${i}`, r.how === 'cover' ? 'At most this many experts' : 'Experts in each layer', r.keep, 4, 256, 1)}
      ${form.rungs.length > 1 ? `<button type="button" class="link" data-forgermrung="${i}">Remove this brain</button>` : ''}
    </fieldset>`;
  }

  // 1.5.160 What to teach, and the way of thinking. Every share is a number box (0 means off), so it works the same
  // with a keyboard, a screen reader and a phone.
  const share = (id, label, v, hint = '') => `<label class="forge-share"><input type="number" min="0" max="100" step="5" id="${id}" value="${v || 0}"> <span>${esc(label)}${hint ? `<br><span class="muted">${esc(hint)}</span>` : ''}</span></label>`;
  function thinkingHtml() {
    const t = form.thinking, picked = Object.values(t.shares).filter((v) => v > 0).length;
    const teach = `<fieldset><legend>What to teach (shares of the lessons)</legend>${TEACH.map(([id, l, h]) => share(`forge-teach-${id}`, l, form.teach[id], h)).join('')}
      <p class="muted">Thinking and Voice are each out of 100. Answers, tools, coding and writing share the lessons between them. 0 leaves it out.</p></fieldset>`;
    const learn = `<fieldset><legend>Learn from</legend>${[['answer', 'The answers', 'How it has always worked.'], ['thinking', 'The thinking', 'The steps before the answer.'], ['both', 'Both', 'The thinking counts half as much by default, so the answers aren\'t drowned out.']].map(([v, l, h]) => `<label class="lab-opt"><input type="radio" name="forge-learn" value="${v}" ${form.heal.learn === v ? 'checked' : ''}> <span><strong>${esc(l)}</strong><br><span class="muted">${esc(h)}</span></span></label>`).join('')}
      ${form.heal.learn !== 'answer' ? `<label class="forge-num" for="forge-tw">How much the thinking counts <input id="forge-tw" type="number" min="0.05" max="2" step="0.05" value="${form.heal.thinking_weight}"></label>` : ''}
      <label class="lab-opt"><input type="checkbox" id="forge-oddsboth" ${form.heal.odds_cover === 'both' ? 'checked' : ''}> <span><strong>Learn how sure the teacher was during the thinking too</strong><br><span class="muted">Teaches far more, but the teacher's scoring takes much longer and starts over.</span></span></label></fieldset>`;
    if (!(form.teach.thinking > 0)) return teach + learn;
    const groups = PATH_GROUPS.map((g, gi) => { const n = g.paths.filter((p) => t.shares[p.name] > 0).length; return `<details ${n ? 'open' : ''}><summary>${esc(g.title)}${n ? ` (${n} picked)` : ''}</summary>${g.note ? `<p class="muted">${esc(g.note)}</p>` : ''}${g.paths.map((p, i) => share(`forge-path-${gi}-${i}`, `${p.name}${p.kind === 'switch' ? ' (best as a switch)' : ''}`, t.shares[p.name], p.like ? `${p.like}. ${p.style}` : p.style)).join('')}</details>`; }).join('');
    const row = (key, legend) => `<fieldset><legend>${esc(legend)}</legend>${PERSONALITY[key].map(([id, l, h]) => share(`forge-pers-${key}-${id}`, l, t.personality[key][id], h)).join('')}</fieldset>`;
    return `${teach}<section class="forge-thinking" aria-labelledby="forge-think-h"><h4 id="forge-think-h">The way of thinking</h4>
      <label>Start from a set <select id="forge-bundle"><option value="">(none)</option>${BUNDLES.map((b, i) => `<option value="${i}">${esc(b.name)}${b.switch ? ' (as a switch)' : ''}</option>`).join('')}</select></label>
      <div role="radiogroup" aria-label="Blend or switch">${[['blend', 'Blend', 'One mixed habit, always on.'], ['switch', 'Switch', 'Each path taught on its own, picked at chat time ("Think: critical").'], ['both', 'Both', 'A blended habit, and each path on call.']].map(([v, l, h]) => `<label class="lab-opt"><input type="radio" name="forge-mode" value="${v}" ${t.mode === v ? 'checked' : ''}> <span><strong>${esc(l)}</strong><br><span class="muted">${esc(h)}</span></span></label>`).join('')}</div>
      <p class="muted">${picked} thought path${picked === 1 ? '' : 's'} picked. Give each a share; 0 leaves it out.</p>
      ${groups}
      <label class="forge-own">Your own path <input id="forge-own" maxlength="200" value="${esc(t.own)}" placeholder="One line: how should it think?"></label> ${share('forge-ownshare', 'Share', t.ownShare)}
      <h4>Personality</h4><p class="muted">Tone and character, crossed with the paths above.</p>
      ${row('alignment', 'Alignment')}${row('rules', 'Rules')}${row('mood', 'Mood (best as a switch)')}
    </section>${learn}`;
  }

  // 1.5.163 The brain to start from: one list. The brains the Forge made and brought home come first, then any brain
  // from this replicant matrix, Hugging Face or another link. The Forge plan it copies its settings from sits under it.
  function brainHtml() {
    const made = fv.brains || [];
    const opts = [`<option value="" ${form.brain.pick ? '' : 'selected'}>(choose a brain)</option>`,
      made.length ? `<optgroup label="Brains the Forge made">${made.map((b) => `<option value="forge:${esc(b.name)}" ${form.brain.pick === `forge:${b.name}` ? 'selected' : ''}>${esc(b.name)}${b.files?.length ? ` · ${esc(b.files.join(', '))}` : ''}</option>`).join('')}</optgroup>` : '',
      `<option value="source" ${form.brain.pick === 'source' ? 'selected' : ''}>Another brain: on this replicant matrix, on Hugging Face, or at a link…</option>`].join('');
    return `<fieldset><legend>The brain to start from</legend>
      <label>Brain <select id="forge-brain">${opts}</select></label>
      ${form.brain.pick === 'source' ? sourceRowHtml('forge-brainsrc', 'Where it is', form.brain.source, 'model') : ''}
      <p class="muted">A brain from Hugging Face or a link is downloaded on the rented card, never here. One from this replicant matrix is uploaded to the card first, so a small one is quicker. A brain the Forge made can only start a run when its full weights are on the Forge's drive; Start says if they aren't.</p>
      <label>Forge settings to copy <select id="forge-base">${fv.plans.map((p) => `<option value="${esc(p.id)}" ${form.base === p.id ? 'selected' : ''}>${esc(p.id)} · ${esc(p.rungs.join(', '))}</option>`).join('')}</select></label>
      <p class="muted">The skills list, the lesson mix and the card settings come from this Forge plan. Everything on this page is yours.</p>
    </fieldset>`;
  }
  // Lessons to teach: the Lab's own sets by tick, then any set from this replicant matrix, Hugging Face or a link.
  // The lesson library: each Lab set is broken into parts by category, source and thinking. Untick a part to leave it
  // out; name a thinking path to teach the set's thinking lessons under their own "Think:" tag.
  const pickOf = (id) => (form.lessonParts[id] ||= { offCategories: [], offSources: [], offThinking: [], pathName: '' });
  const AXES = [['categories', 'offCategories', 'What it teaches'], ['sources', 'offSources', 'Where it came from'], ['thinking', 'offThinking', 'Thinking']];
  function leftOf(parts, pk) {
    const oc = new Set(pk.offCategories), os = new Set(pk.offSources), ot = new Set(pk.offThinking);
    return Object.entries(parts.cells || {}).reduce((n, [k, v]) => { const [c, s, t] = k.split('\t'); return oc.has(c) || os.has(s) || ot.has(t) ? n : n + v; }, 0);
  }
  function partsHtml(x) {
    const parts = x.parts; if (!parts || !form.lessonSets.includes(x.id)) return '';
    const pk = pickOf(x.id), open = lib.open[x.id];
    const box = (axis, key, p) => `<label class="lab-opt"><input type="checkbox" data-forgepart="${esc(x.id)}" data-axis="${key}" value="${esc(p.id)}" ${pk[key].includes(p.id) ? '' : 'checked'}> <span>${esc(p.label)} <span class="muted">· ${p.count}</span></span></label>`;
    return `<div class="forge-parts"><button type="button" class="link" data-forgeparts="${esc(x.id)}" aria-expanded="${open ? 'true' : 'false'}">${open ? 'Hide its parts' : 'Pick its parts'}</button> <span class="muted">${leftOf(parts, pk)} of ${parts.total} lessons picked</span>
      ${open ? `${AXES.map(([axis, key, title]) => (parts[axis] || []).length ? `<fieldset><legend>${title}</legend>${parts[axis].map((p) => box(axis, key, p)).join('')}</fieldset>` : '').join('')}
        <label>Teach its thinking as a path called <input data-forgepathname="${esc(x.id)}" value="${esc(pk.pathName)}" maxlength="40" placeholder="(leave empty to blend it in)"></label>
        <p class="muted">With a name, the lessons that show their thinking are tagged "Think: name", so the brain thinks this way only when a chat asks for it. Lessons that answer straight away are taught with thinking off.</p>` : ''}</div>`;
  }
  function libraryHtml() {
    return `<details ${lib.msg || lib.from ? 'open' : ''}><summary>Add a lesson set to the Lab</summary>
      <p class="muted">A file on this replicant matrix (.jsonl or .json), or one file of a Hugging Face set, like owner/name:data/train.jsonl. Bob converts it to the Lab's lessons and breaks it into parts by what it teaches, where it came from, and whether it shows its thinking. Nothing is uploaded.</p>
      <label>Where it is <input id="forge-lib-from" value="${esc(lib.from)}" maxlength="400" placeholder="${/win/i.test(navigator.userAgentData?.platform || navigator.platform || '') ? 'C:\\lessons\\set.jsonl' : '~/lessons/set.jsonl'} or owner/name:file.jsonl"></label>
      <label>Name <input id="forge-lib-name" value="${esc(lib.name)}" maxlength="60" placeholder="(from the file)"></label>
      <div class="row"><button type="button" class="get" data-forgelibadd ${lib.busy ? 'disabled' : ''}>${lib.busy ? 'Adding…' : 'Add it'}</button></div>
      ${lib.msg ? `<p role="status">${esc(lib.msg)}</p>` : ''}
    </details>`;
  }
  function lessonsHtml() {
    const sets = fv.lessonSets || [];
    return `<fieldset><legend>Lessons to teach</legend>
      <p class="muted">The plan's own lessons are always taught. Add more here.</p>
      ${sets.length ? sets.map((x) => `<label class="lab-opt"><input type="checkbox" data-forgeset="${esc(x.id)}" ${form.lessonSets.includes(x.id) ? 'checked' : ''}> <span><strong>${esc(x.name)}</strong> <span class="muted">· ${x.count} lessons, ${x.added ? `added from ${esc(x.source || 'elsewhere')}${x.license ? `, licence ${esc(x.license)}` : ', no licence: keep what you make private'}` : 'written or built in the Lab'}</span></span></label>${partsHtml(x)}`).join('') : '<p class="muted">No lesson sets in the Lab yet. The Make a brain tab writes them, or add one below.</p>'}
      ${libraryHtml()}
      ${form.lessons.map((x, i) => sourceRowHtml(`forge-lesson-${i}`, `Lesson set ${i + 1}`, x, 'dataset', { removable: true })).join('')}
      ${form.lessons.length < 4 ? '<button type="button" class="link" data-forgelessonadd>Add a lesson set from somewhere else</button>' : ''}
      <p class="muted">Sets from Hugging Face or a link are downloaded here and put into the Lab's lesson format before the run. Formats read: chat messages, instruction and output, prompt and response, question and answer; files .jsonl, .json, .csv and .parquet.</p>
    </fieldset>`;
  }
  // 13 Nov New ways to teach (the training protocol's rented steps). Always shown; each is off until picked.
  function waysHtml() {
    const w = form.ways, pairs = pr.pairs();
    const tg = (t, i) => `<div class="row forge-target"><label>Target <input data-forgetgt="${i}" data-f="name" value="${esc(t.name)}" maxlength="24" placeholder="facts"></label><label>Kinds of lesson (jobs) <input data-forgetgt="${i}" data-f="jobs" value="${esc(t.jobs)}" maxlength="300" placeholder="straight-facts, knowledge"></label><label class="forge-num">Weight <input type="number" min="0" max="5" step="0.25" data-forgetgt="${i}" data-f="weight" value="${esc(String(t.weight))}"></label><button type="button" class="link" data-forgetgtrm="${i}">Remove</button></div>`;
    return `<fieldset id="forge-ways"><legend>New ways to teach</legend>
      <p class="muted">Each is off until you pick it, and each is measured on the held-out chats: a way only stays if it does better.</p>
      <label>Right-vs-wrong pairs <select id="forge-w-pref">${[['off', 'Off'], ['orpo', 'ORPO: mixed into the teaching back'], ['dpo', 'DPO: a short pass after it'], ['kto', 'KTO: from marked answers, no pairs needed']].map(([v, l]) => `<option value="${v}" ${w.pref === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label>Pairs to learn from <select id="forge-w-pairs"><option value="">${pairs.length ? '(pick)' : '(none yet: make them under The training protocol)'}</option>${pairs.map((x) => `<option value="${esc(x.id)}" ${w.pairs === x.id ? 'selected' : ''}>${esc(x.id)} · ${x.pairs} pairs, ${x.marked} marked</option>`).join('')}</select></label>
      ${num('forge-w-onpolicy', 'On-policy teaching, % of lessons', w.onpolicy, 0, 50, 5, 'The small Bob writes its own answer and the teacher scores it. 0 is off.')}
      <label class="lab-opt"><input type="checkbox" id="forge-w-grpo" ${w.grpo ? 'checked' : ''}> <span><strong>Reward pass on tool calls</strong><br><span class="muted">After the teaching back. Kept only if no target drops.</span></span></label>
      ${num('forge-w-grpoh', 'Reward pass hours per brain', w.grpoHours, 0.25, 6, 0.25)}
      <fieldset><legend>Targets</legend><p class="muted">Groups of lesson kinds, each with its own weight and its own grade. None means one target, everything.</p>${w.targets.map(tg).join('')}${w.targets.length < 8 ? '<button type="button" class="link" data-forgetgtadd>Add a target</button>' : ''}</fieldset>
      <label for="forge-w-surgery">Surgery edits to bake in <span class="muted">(optional)</span></label>
      <textarea id="forge-w-surgery" rows="3" maxlength="8000" aria-describedby="forge-w-surgery-h" placeholder='[{"layer": 12, "expert": 37, "scale": 0.8}]'>${esc(w.surgery)}</textarea>
      <p class="muted" id="forge-w-surgery-h">Turn single neurons, whole experts or attention heads up or down in every brain this run makes. Only bake what a live sweep showed helps and hurts nothing; pressing Start on the card is your go.</p>
    </fieldset>`;
  }
  // 1.5.168 Keep it simple hides the controls most runs never touch; their defaults still go in the plan. Professional shows them all.
  const pro = () => view?.()?.mode === 'pro';
  const proOnly = (html) => (pro() ? html : '');
  function formHtml() {
    if (!fv.found) return '';
    return `<section class="lab-compare" id="forge-form" aria-labelledby="forge-form-h"><h3 id="forge-form-h">New Forge run</h3>
      <p class="muted">Fill this in and Bob writes the plan the Forge reads. Saving a plan costs nothing and rents nothing.</p>
      ${brainHtml()}
      <label>Run name <input id="forge-run" value="${esc(form.run)}" maxlength="40" placeholder="my-first-run"></label>
      ${form.rungs.map(rungHtml).join('')}
      ${form.rungs.length < 4 ? '<button type="button" class="link" data-forgeaddrung>Add a brain made from the last one</button>' : ''}
      ${proOnly(`${fv.skills.length ? `<fieldset><legend>Protect these skills most (whole run)</legend>${fv.skills.map((k) => `<label class="lab-opt"><input type="checkbox" data-forgestrong="${esc(k)}" ${form.strong.includes(k) ? 'checked' : ''}> <span>${esc(k)}</span></label>`).join('')}</fieldset>` : ''}`)}
      ${proOnly(`<fieldset><legend>Running files</legend>${[['Q4_K_M', 'Q4 (recommended)'], ['Q3_K_M', 'Q3 (for 8 GB or less)'], ['Q5_K_M', 'Q5'], ['Q6_K', 'Q6']].map(([v, l]) => `<label class="lab-opt"><input type="checkbox" data-forgequant="${v}" ${form.quants.includes(v) ? 'checked' : ''}> <span>${esc(l)}</span></label>`).join('')}</fieldset>`)}
      ${lessonsHtml()}
      ${thinkingHtml()}
      ${waysHtml()}
      ${proOnly(`<fieldset><legend>Teaching back</legend>
        ${[['lora', 'Light (recommended)', 'Teaches small add-ons to every layer and the experts.'], ['full', 'Full', 'Teaches every weight. Small brains only.'], ['frozen', 'Experts left alone', 'Only the rest of the brain is taught.']].map(([v, l, h]) => `<label class="lab-opt"><input type="radio" name="forge-experts" value="${v}" ${form.heal.experts === v ? 'checked' : ''}> <span><strong>${nameNow(l)}</strong><br><span class="muted">${esc(h)}</span></span></label>`).join('')}
        ${num('forge-epochs', 'Passes over the lessons', form.heal.epochs, 0.25, 3, 0.25, 'One full pass is the rule. Bob sets each brain\'s time limit a third above the estimate, so a pass is never cut short.')}
      </fieldset>`)}
      <fieldset><legend>Caps</legend>
        ${num('forge-hours', 'Hours, at most', form.hours_max, 0, 72, 0.5)} ${num('forge-dollars', 'Dollars, at most', form.dollars_max, 0, 500, 1)}
        <p class="muted">They start at 0, and Bob never suggests a number. A plan with a 0 cap can be saved and read, but never started.</p>
      </fieldset>
      ${check ? `<div class="lab-check" role="status">${check.problems.length ? `<p><strong>Before it can be saved:</strong></p><ul>${check.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : `<p><strong>Ready to save.</strong> Teaching back takes about ${check.hours} hours on the card.</p>`}${check.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>` : ''}
      <div class="row"><button type="button" class="get" data-forgesave ${check && !check.problems.length ? '' : 'disabled'}>Save the plan</button><button type="button" class="link" data-forgeshow aria-expanded="${showPlan}">Show the plan</button></div>
      ${saved ? `<p class="muted" role="status">Saved as ${esc(saved)} in the Lab's forge-plans folder.</p>` : ''}
      ${showPlan ? `<div class="lab-recipe"><pre tabindex="0">${esc(check?.text || 'Choose a Forge plan to start from first.')}</pre></div>` : ''}
      ${startHtml()}
    </section>`;
  }

  // Slice C: start a saved plan on a rented card. The switch is off until the owner turns it on; every run needs a
  // press on the purchase card, which shows the plan's own caps and brains, read back from the saved file.
  function startHtml() {
    const live = fv.live;
    const sw = `<label class="lab-opt"><input type="checkbox" id="forge-allow" ${fv.allowed ? 'checked' : ''}> <span><strong>Let the Lab start Forge runs</strong><br><span class="muted">Each run still needs your press on its purchase card, and costs money by the hour on the rental service.</span></span></label>`;
    const runs = fv.saved?.length ? `<fieldset><legend>Your saved plans</legend>${fv.saved.map((id) => `<div class="row"><span>${esc(id)}</span> <button type="button" class="link" data-forgebuy="${esc(id)}" ${fv.allowed && !live?.running ? '' : 'disabled'}>Start on a rented card…</button></div>`).join('')}</fieldset>` : '<p class="muted">Save a plan above, and it shows here to start.</p>';
    const card = buy ? `<div class="setup-offer forge-buy" role="alertdialog" aria-labelledby="forge-buy-h"><strong id="forge-buy-h">Rent a graphics card for ${esc(buy.id)}?</strong>
      <ul>${buy.brains.map((b) => `<li>${esc(b.name)}${b.nickname ? ` (${esc(b.nickname)})` : ''}: ${esc(String(b.keep))} experts per layer, up to ${b.hours} hours of teaching back</li>`).join('')}</ul>
      <p>Running files: ${esc(String(buy.quants).split(",").map((q) => q.slice(0, 2)).join(", "))}. Cards it asks for: ${esc(buy.cards.join(', ') || 'the Forge\'s usual list')}.${buy.volume ? ` It keeps a ${buy.volume} GB drive on the service between runs, a small monthly charge until it's deleted.` : ''}</p>
      <p><strong>Caps: ${buy.hours} hours or $${buy.dollars}, whichever comes first.</strong> The card shuts itself down at the cap even if this replicant matrix is switched off. The service's bill is the real number.</p>
      ${buy.problems.length ? `<ul class="error">${buy.problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="row"><button type="button" class="get" data-forgego ${buy.problems.length ? 'disabled' : ''}>Rent it and start (up to $${buy.dollars})</button><button type="button" class="link" data-forgenobuy>Not now</button></div></div>` : '';
    const liveHtml = live ? `<div class="lab-check" role="status"><p><strong>${live.importing ? 'Bringing in the lessons from Hugging Face' : live.running ? 'Running' : 'Finished or stopped'}: ${esc(live.plan)}</strong> <span class="muted">· caps ${live.hours} hours, $${live.dollars}</span></p><pre tabindex="0">${esc(live.tail.join('\n'))}</pre>${live.failed ? `<p class="error" role="alert">${esc(live.failed)}</p>` : ''}
      <div class="row"><button type="button" class="link" data-forgerefresh>Refresh</button>${live.running ? '<button type="button" class="link" data-forgestop>Stop the run</button>' : ''}</div>
      ${stopAsk ? '<div class="setup-offer" role="alert"><strong>Stop the run and delete its rented card for good?</strong><span>Whatever has already come home stays. Anything still on the card is lost.</span><div class="row"><button type="button" class="get" data-forgestopgo>Stop and delete it</button><button type="button" class="link" data-forgestopno>Keep it running</button></div></div>' : ''}</div>` : '';
    return `<section aria-labelledby="forge-start-h2"><h3 id="forge-start-h2">Start a run</h3>${sw}${fv.hasKey ? '' : '<p class="muted">The rental service\'s key isn\'t set. Settings > Rented brains says how to add it; it stays in your environment, never in Bob\'s files.</p>'}${runs}${card}${liveHtml}</section>`;
  }

  function html(extra = '') { // extra: the Give it eyes / Give it ears card (public/lab-senses.js), placed after the ways
    if (!fv) { if (!loading) load().then(() => document.dispatchEvent(new CustomEvent('lab-forge-ready'))); return `<div id="lab-page-forge" role="tabpanel" aria-labelledby="lab-tab-forge"><p class="muted">${esc(fmsg || 'Loading…')}</p></div>`; }
    return `<div id="lab-page-forge" role="tabpanel" aria-labelledby="lab-tab-forge">
      <p class="muted">Every way to make a new brain, here or on a rented card. Below them: your Forge runs, and the form that writes the next plan.</p>
      <section aria-labelledby="forge-ways-h"><h3 id="forge-ways-h">Ways to make a brain</h3>${makeLine()}<ul class="forge-cards">${fv.methods.filter((m) => !(m.ready && m.use === 'make')).map(card).join('')}</ul>
        ${hw.isOpen() || (view()?.runs || []).some((x) => ['mix', 'stack', 'refusals', 'refusals-try'].includes(x.kind)) ? runs() : ''}${hw.html()}
        <details><summary>Ideas left out, and why</summary><dl class="forge-left">${fv.leftOut.map(([t, w]) => `<dt>${esc(t)}</dt><dd>${esc(w)}</dd>`).join('')}</dl></details></section>
      ${extra}
      ${pr.html()}
      <section class="lab-compare" aria-labelledby="forge-runs-h"><h3 id="forge-runs-h">Forge runs</h3>${runsHtml()}</section>
      ${formHtml()}
      ${fmsg ? `<p class="error" role="alert">${esc(fmsg)}</p>` : ''}
    </div>`;
  }

  // Events from the Lab page. 'draw' asks the page to draw again; true means handled.
  async function change(el) {
    if (!el.closest?.('#lab-page-forge')) return false;
    fmsg = '';
    if (await hw.change(el)) return 'draw'; // 1.5.164
    if (await pr.change(el)) return 'draw'; // 13 Nov
    if (el.id === 'forge-allow') { try { fv.allowed = (await api('/api/lab/forge/allow', { on: el.checked })).allowed; } catch (e) { fmsg = e.message; } return 'draw'; }
    if (el.id === 'forge-base') form.base = el.value;
    else if (el.id === 'forge-run') form.run = el.value;
    else if (el.id === 'forge-brain') { form.brain.pick = el.value; }
    else if (el.dataset?.src) { const x = srcOf(el.dataset.src); if (!x) return false; await sourceEvent(el, x, look); }
    else if (el.dataset?.forgepart) { const pk = pickOf(el.dataset.forgepart), key = el.dataset.axis; if (!pk[key]) return false; pk[key] = el.checked ? pk[key].filter((v) => v !== el.value) : [...new Set([...pk[key], el.value])]; }
    else if (el.dataset?.forgepathname) pickOf(el.dataset.forgepathname).pathName = el.value.slice(0, 40);
    else if (el.id === 'forge-lib-from') { lib.from = el.value; return 'draw'; }
    else if (el.id === 'forge-lib-name') { lib.name = el.value; return 'draw'; }
    else if (el.dataset?.forgeset) { const id = el.dataset.forgeset; form.lessonSets = el.checked ? [...new Set([...form.lessonSets, id])] : form.lessonSets.filter((v) => v !== id); }
    else if (el.dataset.rung !== undefined) { const r = form.rungs[Number(el.dataset.rung)]; if (r) r[el.dataset.f] = el.value; }
    else if (el.id?.startsWith('forge-keep-')) { const r = form.rungs[Number(el.id.slice(11))]; if (r) r.keep = Number(el.value); }
    else if (el.dataset.forgestrong) { const k = el.dataset.forgestrong; form.strong = el.checked ? [...new Set([...form.strong, k])] : form.strong.filter((x) => x !== k); }
    else if (el.dataset.forgequant) { const k = el.dataset.forgequant; form.quants = el.checked ? [...new Set([...form.quants, k])] : form.quants.filter((x) => x !== k); }
    else if (el.id?.startsWith('forge-teach-')) form.teach[el.id.slice(12)] = Number(el.value) || 0;
    else if (el.id?.startsWith('forge-path-')) { const [gi, i] = el.id.slice(11).split('-').map(Number); const pth = PATH_GROUPS[gi]?.paths[i]; if (pth) form.thinking.shares[pth.name] = Number(el.value) || 0; }
    else if (el.id?.startsWith('forge-pers-')) { const [, , key, id] = el.id.split('-'); if (form.thinking.personality[key]) form.thinking.personality[key][id] = Number(el.value) || 0; }
    else if (el.id === 'forge-own') form.thinking.own = el.value;
    else if (el.id === 'forge-ownshare') form.thinking.ownShare = Number(el.value) || 0;
    else if (el.name === 'forge-mode') form.thinking.mode = el.value;
    else if (el.id === 'forge-bundle') { const b = BUNDLES[Number(el.value)]; if (b) { form.thinking.shares = Object.fromEntries(b.shares); if (b.switch) form.thinking.mode = 'switch'; if (b.mood) form.thinking.personality.mood = { [b.mood.toLowerCase()]: 100 }; if (!(form.teach.thinking > 0)) form.teach.thinking = 50; } }
    else if (el.name === 'forge-learn') form.heal.learn = el.value;
    else if (el.id === 'forge-tw') form.heal.thinking_weight = Number(el.value);
    else if (el.id === 'forge-oddsboth') form.heal.odds_cover = el.checked ? 'both' : 'answer';
    else if (el.name === 'forge-experts') form.heal.experts = el.value;
    else if (el.id === 'forge-epochs') form.heal.epochs = Number(el.value);
    else if (el.id === 'forge-w-pref') form.ways.pref = el.value;
    else if (el.id === 'forge-w-pairs') form.ways.pairs = el.value;
    else if (el.id === 'forge-w-onpolicy') form.ways.onpolicy = Number(el.value) || 0;
    else if (el.id === 'forge-w-grpo') form.ways.grpo = el.checked;
    else if (el.id === 'forge-w-grpoh') form.ways.grpoHours = Number(el.value);
    else if (el.id === 'forge-w-surgery') form.ways.surgery = el.value;
    else if (el.dataset?.forgetgt !== undefined) { const t = form.ways.targets[Number(el.dataset.forgetgt)]; if (t) t[el.dataset.f] = el.dataset.f === 'weight' ? Number(el.value) : el.value; }
    else if (el.id === 'forge-hours') form.hours_max = Number(el.value);
    else if (el.id === 'forge-dollars') form.dollars_max = Number(el.value);
    else return false;
    await recheck();
    return 'draw';
  }
  async function click(b) {
    const d = b.dataset;
    if (d.forgeuse === 'make') { goMake(d.method); return true; }
    if (d.forgeuse === 'home') { await hw.open(hw.isOpen() === d.method ? '' : d.method); return 'draw'; } // 1.5.164
    { const h = await hw.click(b, load); if (h) return h === 'draw' ? 'draw' : (await load(), 'draw'); }
    { const h = await pr.click(b); if (h) return h; } // 13 Nov
    if ('forgetgtadd' in d) { if (form.ways.targets.length < 8) form.ways.targets.push({ name: '', jobs: '', weight: 1 }); await recheck(); return 'draw'; }
    if (d.forgetgtrm !== undefined) { form.ways.targets.splice(Number(d.forgetgtrm), 1); await recheck(); return 'draw'; }
    if (d.forgeuse === 'form') { document.getElementById('forge-form')?.scrollIntoView({ block: 'start' }); document.getElementById('forge-brain')?.focus(); return true; }
    if ('forgeaddrung' in d) { const last = form.rungs.at(-1); form.rungs.push({ name: '', nickname: '', how: 'cover', keep: Math.max(8, Math.round((last.keep || 128) * 0.7)), keepFile: '' }); await recheck(); return 'draw'; }
    if (d.forgermrung) { form.rungs.splice(Number(d.forgermrung), 1); await recheck(); return 'draw'; }
    if (d.src) { const x = srcOf(d.src); if (!x) return true; if (d.srcact === 'remove') { form.lessons.splice(Number(d.src.split('-').pop()), 1); } else await sourceEvent(b, x, look); await recheck(); return 'draw'; }
    if (d.forgeparts) { lib.open[d.forgeparts] = !lib.open[d.forgeparts]; return 'draw'; }
    if ('forgelibadd' in d && !lib.busy) {
      lib.busy = true; lib.msg = '';
      try { const r = await api('/api/lab/library/add', { from: lib.from, name: lib.name }); lib.msg = `Added ${r.name}: ${r.count} lessons${r.skipped ? ` (${r.skipped} rows left out: no answer, or an earlier step of a longer chat)` : ''}.${r.license ? '' : ' It came with no licence, so keep anything you make from it private.'}`; lib.from = ''; lib.name = ''; await load(); }
      catch (e) { lib.msg = e.message; }
      lib.busy = false; return 'draw';
    }
    if ('forgelessonadd' in d) { if (form.lessons.length < 4) form.lessons.push(newSource('hf')); return 'draw'; }
    if ('forgeshow' in d) { showPlan = !showPlan; if (showPlan && !check) await recheck(); return 'draw'; }
    if ('forgesave' in d) { try { saved = (await api('/api/lab/forge/save', { form: sendForm() })).file; fmsg = ''; await load(); } catch (e) { fmsg = e.message; } return 'draw'; }
    if (d.forgebuy) { try { buy = await api('/api/lab/forge/card', { id: d.forgebuy }); } catch (e) { fmsg = e.message; buy = null; } return 'draw'; }
    if ('forgenobuy' in d) { buy = null; return 'draw'; }
    if ('forgego' in d && buy) { try { await api('/api/lab/forge/start', { id: buy.id, hours: buy.hours, dollars: buy.dollars }); buy = null; } catch (e) { fmsg = e.message; } await load(); return 'draw'; }
    if ('forgerefresh' in d) { await load(); return 'draw'; }
    if ('forgestop' in d) { stopAsk = true; return 'draw'; }
    if ('forgestopno' in d) { stopAsk = false; return 'draw'; }
    if ('forgestopgo' in d) { stopAsk = false; try { await api('/api/lab/forge/stop', {}); } catch (e) { fmsg = e.message; } await load(); return 'draw'; }
    return false;
  }
  return { html, change, click, input: (el, draw) => hw.input(el, draw), openHome: hw.open, reload: async () => { await load(); } };
}
