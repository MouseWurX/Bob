// 14 Nov 🧪 The Steps tab (docs/LAB-STEPS-PLAN.md section 4): every advanced method as a step, grouped by protocol
// stage, and the Lab's runs. Each card: the short professional name (it opens the glossary), an ⓘ with one plain
// sentence, where it runs, and what it needs. A free step with a form runs from its card (one at a time); the rest
// start from their own pages (the Forge, Make a brain, Look inside). Nothing here rents or uploads.
import { esc } from './rich.js';
import { tip } from './tips.js';

const WHERE = { here: 'Here, free', rented: 'Rented card', both: 'Here or rented' };
const GO = { rent: 'your go to rent', upload: 'your typed go to upload', bake: 'your go to bake', delete: 'your go to delete' };
const STATE = { smoke: 'Smoke test', running: 'Running', done: 'Done', failed: 'Failed', stopped: 'Stopped', gated: 'Stopped by its smoke test' };
const short = (id) => (id ? String(id).replace(/^sha256:/, '').slice(0, 10) : '-');
const minutes = (r) => (r.started && r.ended ? Math.max(0, Math.round((Date.parse(r.ended) - Date.parse(r.started)) / 6e4)) : null);
const val = (v) => (v == null || v === '' ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v));
// Two or more runs side by side: one row per thing a run records, marked where they differ.
export function compareRuns(list) {
  const rows = [['Step', (r) => r.name], ['State', (r) => STATE[r.state] || r.state], ['Bob', (r) => r.bob], ['Started', (r) => when(r.started)], ['Minutes', (r) => minutes(r)],
    ['Smoke test', (r) => (r.smoke ? (r.smoke.ok ? 'passed' : r.smoke.ok === false ? 'failed' : 'not run') : 'none')], ['Cost', (r) => (r.cost?.usd != null ? `$${Number(r.cost.usd).toFixed(2)}${r.cost.card ? ` (${r.cost.card})` : ''}` : '-')],
    ['Inputs', (r) => r.inputs.map((i) => `${i.kind} ${short(i.id)}`).join(', ')], ['Outputs', (r) => r.outputs.map((o) => `${o.kind} ${short(o.id)}${o.neverTrain ? ' (never-train)' : ''}`).join(', ')]];
  const keys = (f) => [...new Set(list.flatMap((r) => Object.keys(r[f] || {})))].sort();
  for (const k of keys('settings')) rows.push([`Setting: ${k}`, (r) => r.settings?.[k]]);
  for (const k of keys('scores')) rows.push([`Score: ${k}`, (r) => r.scores?.[k]]);
  return rows.map(([label, get]) => { const vals = list.map((r) => val(get(r))); return { label, vals, differs: new Set(vals).size > 1 }; });
}
const when = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

export function createStepsPage({ api }) {
  let sv = null, runs = null, loading = false, msg = '', open = '', check = null, busy = false, picked = new Set(), comparing = false;
  const f = { set: '' };
  async function load() {
    loading = true;
    try { [sv, runs] = await Promise.all([api('/api/lab/steps'), api('/api/lab/runs')]); } catch (e) { msg = e.message; }
    loading = false;
    document.dispatchEvent(new CustomEvent('lab-steps-ready'));
  }
  const card = (s, pro) => {
    const badges = [`<span class="tag">${esc(WHERE[s.where] || s.where)}</span>`, s.neverTrain ? '<span class="tag warn" tabindex="0" data-tip="Its output is for study only. Training steps refuse it.">Never-train</span>' : '', s.needsGo.length ? `<span class="tag" tabindex="0" data-tip="${esc(`Needs ${s.needsGo.map((g) => GO[g] || g).join(' and ')}.`)}">Needs your go</span>` : ''].filter(Boolean).join(' ');
    const name = s.glossary ? `<button type="button" class="link lab-step-name" data-stepgloss aria-label="${esc(`${s.name}: open the glossary`)}">${esc(s.name)}</button>` : `<strong>${esc(s.name)}</strong>`;
    const state = s.ready ? (s.smokeReady ? '' : '<span class="muted">Runs here only, until its smoke test is built.</span>') : `<span class="muted">${esc(s.why)}</span>`;
    const canRun = s.form && s.ready && s.where === 'here';
    const running = sv.job?.state === 'running';
    const form = open === s.id ? `<div class="lab-check" role="group" aria-label="${esc(`Run ${s.name}`)}">
        ${s.form.needs.includes('set') ? `<label>Lesson set <select data-stepset>${(sv.sets || []).length ? `<option value="">(pick)</option>${sv.sets.map((x) => `<option value="${esc(x.id)}" ${f.set === x.id ? 'selected' : ''}>${esc(x.name)} · ${x.count} lessons</option>`).join('')}` : '<option value="">(no lesson sets yet)</option>'}</select></label>` : ''}
        ${check ? `${check.problems.length ? `<ul>${check.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p><strong>Ready.</strong></p>'}${check.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}` : ''}
        <div class="row"><button type="button" class="get" data-stepgo="${esc(s.id)}" ${busy || running || !check || check.problems.length ? 'disabled' : ''}>Run it</button><button type="button" class="link" data-stepclose>Close</button></div></div>` : '';
    const btn = canRun && open !== s.id ? ` <button type="button" class="link" data-stepopen="${esc(s.id)}" ${running ? 'disabled' : ''}>Run</button>` : '';
    return `<li class="lab-step-card">${name} ${tip(esc(s.plain), s.name)} ${badges}${btn}${pro && s.script ? `<br><code>${esc(s.script)}</code>` : ''}${state ? `<br>${state}` : ''}${form}</li>`;
  };
  const runsHtml = () => {
    const list = runs?.runs || [];
    if (!list.length) return '<p class="muted">No runs yet. Each step you run leaves a record here: what went in, what came out, and how it went.</p>';
    const head = `<table class="lab-report"><caption class="muted">Newest first. Tick two or more to compare.</caption><thead><tr><th scope="col"><span class="sr-only">Compare</span></th><th scope="col">Step</th><th scope="col">State</th><th scope="col">Started</th><th scope="col">Minutes</th><th scope="col">Cost</th><th scope="col">Made</th></tr></thead><tbody>`;
    const rowsHtml = list.slice(0, 30).map((r) => `<tr><td><input type="checkbox" data-stepcmp="${esc(r.id)}" ${picked.has(r.id) ? 'checked' : ''} aria-label="${esc(`Compare ${r.name}, ${when(r.started)}`)}"></td><td>${esc(r.name)}</td><td>${esc(STATE[r.state] || r.state)}${r.message ? ` ${tip(esc(r.message), r.name)}` : ''}</td><td>${esc(when(r.started))}</td><td>${minutes(r) ?? '-'}</td><td>${r.cost?.usd != null ? `$${Number(r.cost.usd).toFixed(2)}` : '-'}</td><td>${r.outputs.length ? esc(r.outputs.map((o) => `${o.kind}${o.neverTrain ? ' (never-train)' : ''}`).join(', ')) : '-'}</td></tr>`).join('');
    const sel = list.filter((r) => picked.has(r.id));
    const cmp = comparing && sel.length >= 2 ? `<table class="lab-report" aria-label="Runs side by side"><thead><tr><th scope="col">What</th>${sel.map((r) => `<th scope="col">${esc(r.name)}<br><span class="muted">${esc(when(r.started))}</span></th>`).join('')}</tr></thead><tbody>${compareRuns(sel).map((x) => `<tr${x.differs ? ' class="lab-differs"' : ''}><th scope="row">${esc(x.label)}${x.differs ? ' <span class="tag" aria-label="differs">≠</span>' : ''}</th>${x.vals.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
    return `${head}${rowsHtml}</tbody></table><div class="row"><button type="button" class="link" data-stepcompare ${sel.length >= 2 ? '' : 'disabled'} aria-expanded="${comparing && sel.length >= 2}">Compare${sel.length ? ` (${sel.length})` : ''}</button></div>${cmp}`;
  };
  function html(pro) {
    if (!sv) { if (!loading) load(); return `<div id="lab-page-steps" role="tabpanel" aria-labelledby="lab-tab-steps"><p class="muted">${esc(msg || 'Loading...')}</p></div>`; }
    return `<div id="lab-page-steps" role="tabpanel" aria-labelledby="lab-tab-steps">
      <p class="muted">Every method the Lab has, in the order a full run uses them. Each one also works on its own. Rented steps test themselves first and stop the card if that fails.</p>
      ${sv.job ? `<div class="lab-check" role="status"><p><strong>${esc(STATE[sv.job.state] || sv.job.state)}: ${esc(sv.job.name)}</strong>${sv.job.message ? ` ${esc(sv.job.message)}` : ''}</p>${sv.job.state === 'running' ? '<button type="button" class="link" data-stepstop>Stop it</button>' : ''}</div>` : ''}
      ${sv.stages.map(([id, label]) => { const list = sv.steps.filter((s) => s.stage === id); return list.length ? `<section class="lab-compare" aria-labelledby="steps-h-${id}"><h3 id="steps-h-${id}">${esc(label)}</h3><ul class="lab-step-list">${list.map((s) => card(s, pro)).join('')}</ul></section>` : ''; }).join('')}
      <section class="lab-compare" aria-labelledby="steps-runs-h"><h3 id="steps-runs-h">Runs</h3>${runsHtml()}<div class="row"><button type="button" class="link" data-stepsrefresh>Refresh</button></div></section>
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
    </div>`;
  }
  // The name opens Help's glossary, in this window or in the Bob window that opened the Lab.
  async function click(b) {
    if (!b.closest?.('#lab-page-steps')) return false;
    if ('stepgloss' in b.dataset) { const ev = () => new CustomEvent('bob-help', { detail: 'glossary' }); window.dispatchEvent(ev()); try { window.opener?.dispatchEvent(ev()); } catch {} return true; }
    if ('stepsrefresh' in b.dataset) { msg = ''; await load(); return 'draw'; }
    if ('stepcompare' in b.dataset) { comparing = !comparing; return 'draw'; }
    if ('stepopen' in b.dataset) { open = b.dataset.stepopen; check = null; await recheck(); return 'draw'; }
    if ('stepclose' in b.dataset) { open = ''; check = null; return 'draw'; }
    if ('stepgo' in b.dataset && !busy) { busy = true; msg = ''; try { await api('/api/lab/step/run', { id: b.dataset.stepgo, form: f }); open = ''; check = null; } catch (e) { msg = e.message; } busy = false; await load(); return 'draw'; }
    if ('stepstop' in b.dataset) { try { await api('/api/lab/step/stop', {}); } catch (e) { msg = e.message; } await load(); return 'draw'; }
    return false;
  }
  async function recheck() { try { check = await api('/api/lab/step/check', { id: open, form: f }); } catch (e) { msg = e.message; } }
  async function change(el) {
    if (!el.closest?.('#lab-page-steps')) return false;
    if ('stepset' in el.dataset) { f.set = el.value; await recheck(); return true; }
    if ('stepcmp' in el.dataset) { if (el.checked) picked.add(el.dataset.stepcmp); else picked.delete(el.dataset.stepcmp); return true; }
    return false;
  }
  return { html, click, change };
}
