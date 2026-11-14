// 14 Nov 🧪 The Steps tab (docs/LAB-STEPS-PLAN.md section 4): every advanced method as a step, grouped by protocol
// stage, and the Lab's runs. Each card: the short professional name (it opens the glossary), an ⓘ with one plain
// sentence, where it runs, and what it needs. Read-only for now: steps start from their own pages (the Forge's
// training protocol, Make a brain, Look inside) until each gets its own form. Nothing here starts, rents or uploads.
import { esc } from './rich.js';
import { tip } from './tips.js';

const WHERE = { here: 'Here, free', rented: 'Rented card', both: 'Here or rented' };
const GO = { rent: 'your go to rent', upload: 'your typed go to upload', bake: 'your go to bake', delete: 'your go to delete' };
const STATE = { smoke: 'Smoke test', running: 'Running', done: 'Done', failed: 'Failed', stopped: 'Stopped', gated: 'Stopped by its smoke test' };
const when = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

export function createStepsPage({ api }) {
  let sv = null, runs = null, loading = false, msg = '';
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
    return `<li class="lab-step-card">${name} ${tip(esc(s.plain), s.name)} ${badges}${pro && s.script ? `<br><code>${esc(s.script)}</code>` : ''}${state ? `<br>${state}` : ''}</li>`;
  };
  const runsHtml = () => {
    const list = runs?.runs || [];
    if (!list.length) return '<p class="muted">No runs yet. Each step you run leaves a record here: what went in, what came out, and how it went.</p>';
    return `<table class="lab-report"><caption class="muted">Newest first</caption><thead><tr><th scope="col">Step</th><th scope="col">State</th><th scope="col">Started</th><th scope="col">Made</th></tr></thead><tbody>${list.slice(0, 30).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(STATE[r.state] || r.state)}${r.message ? ` ${tip(esc(r.message), r.name)}` : ''}</td><td>${esc(when(r.started))}</td><td>${r.outputs.length ? esc(r.outputs.map((o) => `${o.kind}${o.neverTrain ? ' (never-train)' : ''}`).join(', ')) : '-'}</td></tr>`).join('')}</tbody></table>`;
  };
  function html(pro) {
    if (!sv) { if (!loading) load(); return `<div id="lab-page-steps" role="tabpanel" aria-labelledby="lab-tab-steps"><p class="muted">${esc(msg || 'Loading...')}</p></div>`; }
    return `<div id="lab-page-steps" role="tabpanel" aria-labelledby="lab-tab-steps">
      <p class="muted">Every method the Lab has, in the order a full run uses them. Each one also works on its own. Rented steps test themselves first and stop the card if that fails.</p>
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
    return false;
  }
  return { html, click };
}
