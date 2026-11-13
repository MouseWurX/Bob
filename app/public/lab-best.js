// 1.5.188 🧪 Playground: Best answers. A bigger brain judges; a smaller one learns from its own best answers, or from
// better-or-worse pairs of them, or both, optionally only in the parts fNRI shows a skill uses. The server side is
// src/lab-best.js. Screens are in third person; Help (lab-best) is in Bob's voice.
import { esc } from './rich.js';
import { nameNow } from './lab-names.js'; // 1.5.199 proper names in Professional mode
import { newSource, sourceRowHtml, sourceOut, sourceEvent } from './lab-source.js';

const WAYS = [
  ['best', 'Best of its own', 'It\'s taught its best answer to each question. Keeps its own voice, and mends what a cut or squeeze broke.'],
  ['pairs', 'Better and worse pairs', 'It learns to lean toward the better of two of its answers, and away from the worse (preference training).'],
  ['both', 'Both', 'The best answers first, then the pairs.']
];

export function createBestPage({ api }) {
  let v = null, msg = '', plan = null, done = '', askUnload = null, loading = false, parts = null;
  const f = { name: '', learner: '', judge: '', weightsPick: 'own', weights: newSource('hf'), qPick: 'set', setId: '', questions: newSource('hf'), answers: 4, limit: 200, way: 'best', rescue: true, key: true, tPick: 'none', tFile: '', tRec: '', tSkill: '', rented: false };
  const look = (x) => api('/api/lab/forge/hf', { ref: x.value, kind: x === f.weights ? 'model' : 'dataset' });
  async function load() { loading = true; try { v = await api('/api/lab/best'); if (!f.answers) f.answers = v.answersDefault; } catch (e) { msg = e.message; } loading = false; }
  async function loadParts() { parts = null; if (!f.learner) return; try { parts = await api('/api/lab/best/parts', { brain: f.learner }); } catch { parts = { recordings: [], lists: [] }; } }
  const targetsOut = () => (f.tPick === 'file' && f.tFile ? { kind: 'file', id: f.tFile } : f.tPick === 'skill' && f.tRec && f.tSkill ? { kind: 'skill', recording: f.tRec, skill: f.tSkill } : { kind: 'none' });
  const out = () => ({
    name: f.name, learner: f.learner, judge: f.judge, answers: f.answers, limit: f.limit, way: f.way, rescue: f.rescue, key: f.key, where: f.rented ? 'rented' : '',
    ...(f.weightsPick === 'source' ? { weights: sourceOut(f.weights) || {} } : {}),
    questions: f.qPick === 'set' ? { kind: 'set', id: f.setId } : sourceOut(f.questions) || {},
    targets: targetsOut()
  });
  async function replan() { plan = null; done = ''; if (!f.learner || !f.judge) return; try { plan = await api('/api/lab/best/plan', out()); } catch (e) { plan = { problems: [e.message], notes: [] }; } }
  const time = (m) => (m < 60 ? `${m} minute${m === 1 ? '' : 's'}` : `${Math.round(m / 6) / 10} hours`);

  function planHtml() {
    if (!plan) return '';
    const w = plan.where === 'here';
    return `<div class="lab-check" role="status">
      ${plan.fit ? `<p><strong>${w ? 'Teaches here.' : 'The answers and judging run here; the teaching goes rented.'}</strong> ${esc(plan.fit.why)}</p>` : ''}
      ${plan.minutes ? `<p>Answering and judging: about ${time(plan.minutes)} for ${plan.questions.count} questions, ${plan.answers} answers each.${w && plan.teachHours ? ` Then teaching, about ${plan.teachHours < 1 ? `${Math.max(5, Math.round(plan.teachHours * 60))} minutes` : `${plan.teachHours} hours`}.` : ''}${w && plan.disk ? ` It needs about ${plan.disk.work} GB of disk while it works.` : ''}</p>` : ''}
      ${plan.problems.length ? `<p><strong>Before it can start:</strong></p><ul>${plan.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${plan.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>
      ${askUnload ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.join(', '))} is loaded. This needs the card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-bstgo="unload">Unload it and start</button><button type="button" class="link" data-bstnounload>Not now</button></div></div>` : ''}
      <div class="row"><button type="button" class="get" data-bstgo ${plan.problems.length ? 'disabled' : ''}>${w ? 'Start' : 'Answer and judge here, then save a Forge plan'}</button></div>
      ${done ? `<p role="status">${esc(done)}</p>` : ''}`;
  }

  function partsHtml() {
    if (!f.learner) return '';
    const recs = parts?.recordings || [], lists = parts?.lists || [];
    const rec = recs.find((r) => r.id === f.tRec);
    return `<fieldset><legend>${nameNow('Teach only these parts')}</legend>
      <label class="lab-opt"><input type="radio" name="bsttpick" value="none" ${f.tPick === 'none' ? 'checked' : ''}> <span><strong>No, the whole brain</strong><br><span class="muted">The usual way: small changes spread through every layer.</span></span></label>
      <label class="lab-opt"><input type="radio" name="bsttpick" value="file" ${f.tPick === 'file' ? 'checked' : ''} ${lists.length ? '' : 'disabled'}> <span><strong>A parts list saved in fNRI</strong><br><span class="muted">${lists.length ? 'Saved with Use these for training in the fNRI viewer: a skill\'s experts, the blocks you dialled, or the blocks that moved most.' : 'None yet for this brain. In fNRI, Use these for training saves one.'}</span></span></label>
      ${f.tPick === 'file' && lists.length ? `<select data-bst="tFile" aria-label="Parts list"><option value="">Pick one</option>${lists.map((l) => `<option value="${esc(l.id)}" ${f.tFile === l.id ? 'selected' : ''}>${esc(l.label || l.id)} (${l.count} parts)</option>`).join('')}</select>` : ''}
      <label class="lab-opt"><input type="radio" name="bsttpick" value="skill" ${f.tPick === 'skill' ? 'checked' : ''} ${recs.length ? '' : 'disabled'}> <span><strong>The experts one skill uses</strong><br><span class="muted">${recs.length ? 'Read from an fNRI scan of this brain: only the experts that lean to that skill learn; everything else stays frozen.' : 'Scan this brain in fNRI first (Look inside, fNRI).'}</span></span></label>
      ${f.tPick === 'skill' && recs.length ? `<div class="row"><select data-bst="tRec" aria-label="fNRI scan"><option value="">Which scan</option>${recs.map((r) => `<option value="${esc(r.id)}" ${f.tRec === r.id ? 'selected' : ''}>${esc(r.name || r.id)}${r.when ? ` · ${esc(r.when)}` : ''}</option>`).join('')}</select>
        ${rec ? `<select data-bst="tSkill" aria-label="Skill"><option value="">Which skill</option>${rec.skills.map((s) => `<option value="${esc(s.id)}" ${f.tSkill === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>` : ''}</div>` : ''}
    </fieldset>`;
  }

  function runsHtml() {
    return (v.runs || []).map((r) => {
      const t = r.report;
      return `<section class="lab-compare"><h4>${esc(r.name)} <span class="muted">· from ${esc(r.from)} · ${esc(r.state)}</span></h4>
      ${t ? `${t.saw ? `<p class="lab-saw"><strong>What you just saw:</strong> ${esc(t.saw)}</p>` : ''}
        <table class="lab-report"><caption class="muted">Held back: never taught, asked before and after, scored by ${esc(t.judgeName || 'the judge')} (out of 100).</caption><tr><th scope="col"></th><th scope="col">Before</th><th scope="col">After</th></tr>
          <tr><th scope="row">Held-back questions (${t.held})</th><td>${t.before?.judge ?? '-'}</td><td>${t.after?.judge ?? '-'}</td></tr>
          ${t.made ? `<tr><th scope="row">Quick quiz</th><td>${t.from?.score ?? '-'}</td><td>${t.made.score}</td></tr>` : ''}</table>
        <p class="muted">${t.asked} questions; ${t.taughtBest} best answers${t.rescued ? ` (${t.rescued} written by the judge, where none of its own was good enough)` : ''} and ${t.pairs} pairs to learn from. ${t.checked ? `${t.checked} had a short exact answer, so a checker marked them instead of the judge. ` : ''}${t.unreadable ? `${t.unreadable} judgement${t.unreadable === 1 ? '' : 's'} couldn't be read and ${t.unreadable === 1 ? 'was' : 'were'} skipped. ` : ''}${t.parts ? `${t.parts.modules} parts of the brain changed${t.parts.fellBack ? `; ${t.parts.fellBack} picked parts couldn't be changed on their own, so the block around each one learned instead` : ''}. ` : ''}${t.sizeGB ? `${t.sizeGB} GB.` : ''}</p>
        ${(t.examples || []).length ? `<details><summary>Best and worst answers, side by side</summary>${t.examples.map((x) => `<div class="lab-pair"><p><strong>${esc(x.question)}</strong></p><p><span class="muted">Best (${x.bestScore} of 10):</span> ${esc(x.best)}</p><p><span class="muted">Worst (${x.worstScore} of 10):</span> ${esc(x.worst)}</p></div>`).join('')}</details>` : ''}
        ${t.line ? `<p role="status">${esc(t.line)}</p>` : ''}
        ${t.made ? `<p class="muted">Made here. It never becomes Bob's brain on its own: Use in Bob puts it in the list, and you pick it. To see which blocks moved, scan it and ${esc(r.from)} in fNRI with the same skill and open Before and after.</p>
        <div class="row"><button type="button" class="get" data-bstuse="${esc(r.id)}" ${r.used ? 'disabled' : ''}>${r.used ? 'In Bob' : 'Use in Bob'}</button></div>` : ''}` : r.error ? `<p class="error">${esc(r.error)}</p>` : ''}</section>`;
    }).join('');
  }

  function html() {
    if (!v) return `<p class="muted" role="status">${loading ? 'Reading your brains…' : ''}</p>${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}`;
    const L = v.brains.find((b) => b.id === f.learner);
    const judges = v.brains.filter((b) => b.id !== f.learner && (!L || b.paramsB > L.paramsB));
    return `<h3>${nameNow('Best answers: a bigger brain judges, a smaller one learns')}</h3>
      <p class="muted">The small brain answers each question a few times, a bigger brain scores the answers, and the small one learns from its best. Free here; if it's too big to teach on this card, it's saved as a Forge plan.</p>
      ${v.trainer.ok ? '' : `<p class="muted">Teaching here needs the Trainer pack (about ${v.trainer.sizeGB} GB); Teach it, on this tab, gets it.</p>`}
      <label for="bst-name">Name for the new brain</label><input id="bst-name" data-bst="name" maxlength="40" value="${esc(f.name)}">
      <div class="row"><label for="bst-learner">The brain that learns</label><select id="bst-learner" data-bst="learner"><option value="">Pick one</option>${v.brains.map((b) => `<option value="${esc(b.id)}" ${f.learner === b.id ? 'selected' : ''}>${esc(b.name)}${b.paramsB ? ` · ${b.paramsB}B` : ''}</option>`).join('')}</select></div>
      <div class="row"><label for="bst-judge">The brain that judges</label><select id="bst-judge" data-bst="judge" ${f.learner ? '' : 'disabled'}><option value="">${f.learner && !judges.length ? 'None here is bigger' : 'Pick one'}</option>${judges.map((b) => `<option value="${esc(b.id)}" ${f.judge === b.id ? 'selected' : ''}>${esc(b.name)}${b.paramsB ? ` · ${b.paramsB}B` : ''}${L && b.family && b.family === L.family ? ' · same family' : ''}</option>`).join('')}</select></div>
      <fieldset><legend>Its full weights, for teaching</legend>
        <label class="lab-opt"><input type="radio" name="bstwpick" value="own" ${f.weightsPick === 'own' ? 'checked' : ''}> <span><strong>The original its file names</strong><br><span class="muted">For a brain that was only squeezed (a smaller file of the same brain).</span></span></label>
        <label class="lab-opt"><input type="radio" name="bstwpick" value="source" ${f.weightsPick === 'source' ? 'checked' : ''}> <span><strong>Somewhere else</strong><br><span class="muted">For a cut brain, its own full-size folder (the original has experts it doesn't): a folder here, Hugging Face, or a link.</span></span></label>
        ${f.weightsPick === 'source' ? sourceRowHtml('bst-weights', 'Where they are', f.weights, 'model') : ''}</fieldset>
      <fieldset><legend>The questions</legend>
        <label class="lab-opt"><input type="radio" name="bstqpick" value="set" ${f.qPick === 'set' ? 'checked' : ''}> <span><strong>A lesson set from the Lab</strong><br><span class="muted">Only the questions are used; each lesson's own answer helps the judge, and checks short exact answers.</span></span></label>
        ${f.qPick === 'set' ? (v.sets.length ? `<select data-bst="setId" aria-label="Lesson set"><option value="">Pick one</option>${v.sets.map((s) => `<option value="${esc(s.id)}" ${f.setId === s.id ? 'selected' : ''}>${esc(s.name)} (${s.count})</option>`).join('')}</select>` : '<p class="muted">No lesson sets yet. Make a brain, step 2, writes or builds one.</p>') : ''}
        <label class="lab-opt"><input type="radio" name="bstqpick" value="source" ${f.qPick === 'source' ? 'checked' : ''}> <span><strong>Somewhere else</strong><br><span class="muted">A .jsonl file here, a Hugging Face dataset file, or a link to a .jsonl file.</span></span></label>
        ${f.qPick === 'source' ? sourceRowHtml('bst-questions', 'Where they are', f.questions, 'dataset') : ''}</fieldset>
      <div class="row"><label for="bst-limit">Questions</label><select id="bst-limit" data-bst="limit">${v.limits.map((n) => `<option ${f.limit === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <label for="bst-answers">Answers to each</label><select id="bst-answers" data-bst="answers">${v.answers.map((n) => `<option ${f.answers === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <fieldset><legend>How it learns</legend>${WAYS.map(([id, label, hint]) => `<label class="lab-opt"><input type="radio" name="bstway" value="${id}" ${f.way === id ? 'checked' : ''}> <span><strong>${esc(label)}</strong><br><span class="muted">${esc(hint)}</span></span></label>`).join('')}</fieldset>
      <label class="lab-opt"><input type="checkbox" data-bst="rescue" ${f.rescue ? 'checked' : ''}> <span><strong>Let the judge answer when none of its own is good enough</strong><br><span class="muted">Otherwise a question where every answer scored under ${v.good} out of 10 is skipped: a brain can only polish what it can already reach.</span></span></label>
      <label class="lab-opt"><input type="checkbox" data-bst="key" ${f.key ? 'checked' : ''}> <span><strong>Use each lesson's own answer</strong><br><span class="muted">The judge sees it as a known good answer, and short exact answers are checked against it.</span></span></label>
      ${partsHtml()}
      <label class="lab-opt"><input type="checkbox" data-bst="rented" ${f.rented ? 'checked' : ''}> <span><strong>Teach it rented anyway</strong><br><span class="muted">The answers and judging still run here; the best answers are saved as a Forge plan with the caps at 0.</span></span></label>
      <div class="row"><button type="button" class="link" data-bstcheck>Check it</button></div>
      ${planHtml()}
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
      ${runsHtml()}`;
  }

  async function change(el) {
    const k = el.dataset?.bst;
    if (k === 'name') { f.name = el.value; return false; }
    if (k === 'learner') { f.learner = el.value; f.judge = ''; f.tPick = 'none'; f.tFile = ''; f.tRec = ''; f.tSkill = ''; await loadParts(); await replan(); return true; }
    if (k === 'judge' || k === 'setId' || k === 'tFile' || k === 'tSkill') { f[k] = el.value; await replan(); return true; }
    if (k === 'tRec') { f.tRec = el.value; f.tSkill = ''; plan = null; return true; }
    if (k === 'answers' || k === 'limit') { f[k] = Number(el.value); await replan(); return true; }
    if (k === 'rescue' || k === 'key' || k === 'rented') { f[k] = el.checked; await replan(); return true; }
    if (el.name === 'bstway') { f.way = el.value; await replan(); return true; }
    if (el.name === 'bsttpick') { f.tPick = el.value; await replan(); return true; }
    if (el.name === 'bstwpick') { f.weightsPick = el.value; plan = null; return true; }
    if (el.name === 'bstqpick') { f.qPick = el.value; plan = null; return true; }
    if (el.dataset?.src === 'bst-weights' || el.dataset?.src === 'bst-questions') { const x = el.dataset.src === 'bst-weights' ? f.weights : f.questions; const draw = await sourceEvent(el, x, look); plan = null; return draw; }
    return false;
  }
  function input(el) { if (el.dataset?.bst === 'name') { f.name = el.value; return true; } return false; }
  async function click(b) {
    const d = b.dataset;
    if (d.src === 'bst-weights' || d.src === 'bst-questions') { const x = d.src === 'bst-weights' ? f.weights : f.questions; await sourceEvent(b, x, look); await replan(); return 'draw'; }
    if ('bstcheck' in d) { await replan(); return 'draw'; }
    if ('bstnounload' in d) { askUnload = null; return 'draw'; }
    if (d.bstuse) { try { await api('/api/lab/best/use', { id: d.bstuse }); done = 'It\'s in Bob now: the Brains page lists it, and you pick it when you want it.'; await load(); } catch (e) { msg = e.message; } return 'draw'; }
    if ('bstgo' in d) {
      msg = '';
      try { const r = await api('/api/lab/best/start', { ...out(), unload: d.bstgo === 'unload' }); askUnload = r.needUnload ? r.names : null; } catch (e) { msg = e.message; }
      return 'load';
    }
    return false;
  }
  return { load, html, change, input, click, saveTable: () => null, kind: 'best' };
}
