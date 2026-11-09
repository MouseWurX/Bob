// 1.5.16x 🧪 Playground: Teach it, here or rented (thinking-paths.md sec 15.3). Pick a brain and a lesson set; the Lab
// says where it can be taught and why (the fit rule). Here: an adapter on this replicant matrix's own card, with the
// opt-in Trainer pack. Rented: the same choices saved as a Forge plan for the Forge tab's purchase card. Brains and
// lessons come from here, Hugging Face or another link, with the Lab's one chooser (public/lab-source.js).
import { esc } from './rich.js';
import { newSource, sourceRowHtml, sourceOut, sourceEvent } from './lab-source.js';

export function createTeachPage({ api }) {
  let v = null, msg = '', plan = null, done = '', askUnload = null, loading = false, confirmRemove = false;
  const f = { name: '', brainPick: 'mine', brainId: '', brain: newSource('hf'), lessonsPick: 'set', setId: '', lessons: newSource('hf'), epochs: 1, rented: false };
  const look = (x) => api('/api/lab/forge/hf', { ref: x.value, kind: x === f.brain ? 'model' : 'dataset' });
  async function load() { loading = true; try { v = await api('/api/lab/teach'); } catch (e) { msg = e.message; } loading = false; }
  const out = () => ({
    name: f.name, epochs: f.epochs, where: f.rented ? 'rented' : '',
    brain: f.brainPick === 'mine' ? { kind: 'lab', id: f.brainId } : sourceOut(f.brain) || {},
    lessons: f.lessonsPick === 'set' ? { kind: 'set', id: f.setId } : (() => { const s = sourceOut(f.lessons) || {}; return s.kind === 'local' ? s : s; })()
  });
  async function replan() { plan = null; done = ''; try { plan = await api('/api/lab/teach/plan', out()); } catch (e) { plan = { problems: [e.message], notes: [] }; } }

  function trainerHtml() {
    const t = v.trainer;
    if (!t.supported) return '<p class="lab-check">The Trainer pack doesn\'t run on this replicant matrix (phones and the Raspberry Pi have no room for training). Teaching goes rented.</p>';
    if (t.ok) return `<p class="muted">Trainer pack: here (${esc(t.version)}). <button type="button" class="link" data-tchremove aria-expanded="${confirmRemove}">Remove it</button></p>${confirmRemove ? '<div class="setup-offer" role="alert"><strong>Remove the Trainer pack?</strong><span>Brains you taught stay. Get it again any time.</span><div class="row"><button type="button" class="get" data-tchremovego>Remove it</button><button type="button" class="link" data-tchremoveno>Keep it</button></div></div>' : ''}`;
    return `<div class="lab-check"><p><strong>Teaching here needs the Trainer pack</strong>, about ${t.sizeGB} GB: uv ${esc(t.uv)}, Python ${esc(t.python)}, PyTorch and the training libraries, and llama.cpp ${esc(t.llamacpp)}'s converters. It goes in its own folder and Settings can remove it. Nothing in it runs when you chat.</p>
      <p class="muted">Licences: ${t.licences.map(([n, l]) => `${esc(n)} (${esc(l)})`).join(', ')}.</p>
      <div class="row"><button type="button" class="get" data-tchtrainer>Get the Trainer pack</button></div></div>`;
  }

  function planHtml() {
    if (!plan) return '';
    const w = plan.where === 'here';
    return `<div class="lab-check" role="status">
      ${plan.fit ? `<p><strong>${w ? 'Teaches here.' : 'Goes rented.'}</strong> ${esc(plan.fit.why)}</p>` : ''}
      ${w && plan.hours ? `<p>About ${plan.hours < 1 ? `${Math.max(5, Math.round(plan.hours * 60))} minutes` : `${plan.hours} hour${plan.hours === 1 ? '' : 's'}`} for ${plan.lessons.count} lessons, with a progress bar. ${plan.disk ? `It needs about ${plan.disk.work} GB of disk while it works and keeps about ${plan.disk.keep} GB.` : ''}</p>` : ''}
      ${plan.problems.length ? `<p><strong>Before it can start:</strong></p><ul>${plan.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${plan.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>
      ${askUnload ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.join(', '))} is loaded. Teaching needs the card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-tchgo="unload">Unload it and start</button><button type="button" class="link" data-tchnounload>Not now</button></div></div>` : ''}
      <div class="row">${w ? `<button type="button" class="get" data-tchgo ${plan.problems.length ? 'disabled' : ''}>Teach it here</button>` : `<button type="button" class="get" data-tchrented ${plan.problems.length ? 'disabled' : ''}>Save as a Forge plan</button>`}</div>
      ${done ? `<p role="status">${esc(done)}</p>` : ''}`;
  }

  function runsHtml() {
    return (v.runs || []).map((r) => `<section class="lab-compare"><h4>${esc(r.name)} <span class="muted">· from ${esc(r.from)} · ${esc(r.state)}</span></h4>
      ${r.report ? `<p>Quick quiz: ${r.report.from ? `${r.report.from.score} before, ` : ''}${r.report.made.score} after, out of 100. ${r.report.learned} lessons learned${r.report.skipped ? `, ${r.report.skipped} skipped (they didn't fit its chat format)` : ''}. ${r.report.sizeGB} GB.</p>
        <p class="muted">Made here. It's benchmarked, but it never becomes Bob's brain on its own: Use in Bob puts it in the list, and you pick it. Run all on the Challenges tab compares it properly.</p>
        <div class="row"><button type="button" class="get" data-tchuse="${esc(r.id)}" ${r.used ? 'disabled' : ''}>${r.used ? 'In Bob' : 'Use in Bob'}</button></div>` : r.error ? `<p class="error">${esc(r.error)}</p>` : ''}</section>`).join('');
  }

  function html() {
    if (!v) return `<p class="muted" role="status">${loading ? 'Reading your brains…' : ''}</p>${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}`;
    return `<h3>Teach it: here or rented</h3>
      <p class="muted">Teach a brain a lesson set. When the brain is small enough for this replicant matrix's card, it's taught here, for free: a small set of extra weights (an adapter) is trained and folded into a new brain file. When it isn't, the same choices go to the Forge, rented, so you fill them in once.</p>
      <table class="lab-report"><caption class="muted">What can be taught here, by graphics memory (an adapter on a 4-bit copy of the brain).</caption><tr><th scope="col">Card</th><th scope="col">A brain up to</th><th scope="col">A mixture of experts up to</th></tr>${v.fit.map((r) => `<tr><th scope="row">${r.gb} GB</th><td>about ${r.dense}B</td><td>about ${r.moe}B total</td></tr>`).join('')}</table>
      ${trainerHtml()}
      <label for="tch-name">Name for the new brain</label><input id="tch-name" data-tch="name" maxlength="40" value="${esc(f.name)}">
      <fieldset><legend>The brain to teach</legend>
        <label class="lab-opt"><input type="radio" name="tchbrainpick" value="mine" ${f.brainPick === 'mine' ? 'checked' : ''}> <span><strong>One of your brains</strong><br><span class="muted">Bob teaches its full-weight original, when its file says where that is.</span></span></label>
        ${f.brainPick === 'mine' ? `<select data-tch="brainId" aria-label="Your brain"><option value="">Pick one</option>${v.brains.map((b) => `<option value="${esc(b.id)}" ${f.brainId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
        <label class="lab-opt"><input type="radio" name="tchbrainpick" value="source" ${f.brainPick === 'source' ? 'checked' : ''}> <span><strong>Somewhere else</strong><br><span class="muted">A folder of .safetensors here, a brain on Hugging Face, or a link to an archive of one.</span></span></label>
        ${f.brainPick === 'source' ? sourceRowHtml('tch-brain', 'Where it is', f.brain, 'model') : ''}</fieldset>
      <fieldset><legend>The lessons</legend>
        <label class="lab-opt"><input type="radio" name="tchlesspick" value="set" ${f.lessonsPick === 'set' ? 'checked' : ''}> <span><strong>A lesson set from the Lab</strong></span></label>
        ${f.lessonsPick === 'set' ? (v.sets.length ? `<select data-tch="setId" aria-label="Lesson set"><option value="">Pick one</option>${v.sets.map((s) => `<option value="${esc(s.id)}" ${f.setId === s.id ? 'selected' : ''}>${esc(s.name)} (${s.count})</option>`).join('')}</select>` : '<p class="muted">No lesson sets yet. Make a brain, step 2, writes or builds one.</p>') : ''}
        <label class="lab-opt"><input type="radio" name="tchlesspick" value="source" ${f.lessonsPick === 'source' ? 'checked' : ''}> <span><strong>Somewhere else</strong><br><span class="muted">A .jsonl file here, a Hugging Face dataset file, or a link to a .jsonl file.</span></span></label>
        ${f.lessonsPick === 'source' ? sourceRowHtml('tch-lessons', 'Where they are', f.lessons, 'dataset') : ''}</fieldset>
      <div class="row"><label for="tch-epochs">Times through the lessons</label><select id="tch-epochs" data-tch="epochs">${[1, 2, 3].map((n) => `<option ${f.epochs === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <label class="lab-opt"><input type="checkbox" data-tch="rented" ${f.rented ? 'checked' : ''}> <span><strong>Teach it rented anyway</strong></span></label></div>
      <div class="row"><button type="button" class="link" data-tchcheck>Check where it goes</button></div>
      ${planHtml()}
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
      ${runsHtml()}`;
  }

  async function change(el) {
    const k = el.dataset?.tch;
    if (k === 'name') { f.name = el.value; return false; }
    if (k === 'brainId' || k === 'setId') { f[k] = el.value; await replan(); return true; }
    if (k === 'epochs') { f.epochs = Number(el.value); await replan(); return true; }
    if (k === 'rented') { f.rented = el.checked; await replan(); return true; }
    if (el.name === 'tchbrainpick') { f.brainPick = el.value; plan = null; return true; }
    if (el.name === 'tchlesspick') { f.lessonsPick = el.value; plan = null; return true; }
    if (el.dataset?.src === 'tch-brain' || el.dataset?.src === 'tch-lessons') { const x = el.dataset.src === 'tch-brain' ? f.brain : f.lessons; const draw = await sourceEvent(el, x, look); plan = null; return draw; }
    return false;
  }
  function input(el) { if (el.dataset?.tch === 'name') { f.name = el.value; return true; } return false; }
  async function click(b) {
    const d = b.dataset;
    if (d.src === 'tch-brain' || d.src === 'tch-lessons') { const x = d.src === 'tch-brain' ? f.brain : f.lessons; await sourceEvent(b, x, look); await replan(); return 'draw'; }
    if ('tchcheck' in d) { await replan(); return 'draw'; }
    if ('tchnounload' in d) { askUnload = null; return 'draw'; }
    if ('tchremove' in d) { confirmRemove = !confirmRemove; return 'draw'; }
    if ('tchremoveno' in d) { confirmRemove = false; return 'draw'; }
    if ('tchremovego' in d) { try { await api('/api/lab/teach/trainer/remove', {}); confirmRemove = false; await load(); } catch (e) { msg = e.message; } return 'draw'; }
    if ('tchtrainer' in d) { try { await api('/api/lab/teach/trainer', {}); } catch (e) { msg = e.message; } return 'load'; }
    if ('tchrented' in d) { try { done = (await api('/api/lab/teach/rented', out())).line; } catch (e) { msg = e.message; } return 'draw'; }
    if (d.tchuse) { try { await api('/api/lab/teach/use', { id: d.tchuse }); done = 'It\'s in Bob now: Equip Bob lists it, and you pick it when you want it.'; await load(); } catch (e) { msg = e.message; } return 'draw'; }
    if ('tchgo' in d) {
      msg = '';
      try { const r = await api('/api/lab/teach/start', { ...out(), unload: d.tchgo === 'unload' }); askUnload = r.needUnload ? r.names : null; } catch (e) { msg = e.message; }
      return 'load';
    }
    return false;
  }
  return { load, html, change, input, click, saveTable: () => null, kind: 'teach' };
}
