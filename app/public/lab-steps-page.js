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
// One score chart per pipeline (an SVG line per score, a point per step that has it) with its table beside it for
// screen readers and for reading exact numbers.
const LINE = ['var(--accent)', 'var(--good)', 'var(--warn)', 'var(--bad)', 'var(--text)'];
export function scoreChart(lines, steps, title) {
  if (!lines.length) return '<p class="muted">No scores yet. Steps that score something draw a line here.</p>';
  const W = 320, H = 140, pad = 24, n = Math.max(2, steps.length), all = lines.flatMap((l) => l.points.map((p) => p.v)), top = Math.max(1, ...all), lo = Math.min(0, ...all);
  const x = (i) => pad + (i * (W - 2 * pad)) / (n - 1), y = (v) => H - pad - ((v - lo) * (H - 2 * pad)) / (top - lo || 1);
  const svg = `<svg class="lab-pipe-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${title}: score after each step`)}"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--line)"/>${lines.map((l, k) => `<polyline fill="none" stroke-width="2" stroke="${LINE[k % LINE.length]}" points="${l.points.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}"/>${l.points.map((p) => `<circle r="3" fill="${LINE[k % LINE.length]}" cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}"><title>${esc(`${l.score} after ${p.name}: ${p.v}`)}</title></circle>`).join('')}`).join('')}</svg>`;
  const legend = `<p class="muted">${lines.map((l, k) => `<span style="color:${LINE[k % LINE.length]}" aria-hidden="true">■</span> ${esc(l.score)}`).join(' · ')}</p>`;
  const used = steps.filter((st) => lines.some((l) => l.points.some((p) => p.i === st.i)));
  const table = `<table class="lab-report"><caption class="sr-only">${esc(`${title} scores by step`)}</caption><thead><tr><th scope="col">Step</th>${lines.map((l) => `<th scope="col">${esc(l.score)}</th>`).join('')}</tr></thead><tbody>${used.map((st) => `<tr><th scope="row">${st.i + 1}. ${esc(st.name)}</th>${lines.map((l) => `<td>${esc(val(l.points.find((p) => p.i === st.i)?.v))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `${svg}${legend}${table}`;
}
const PSTATE = { waiting: 'Not run', skipped: 'Skipped', ...STATE };
const when = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

export function createStepsPage({ api }) {
  let sv = null, runs = null, pipes = null, building = null, pmsg = '', loading = false, msg = '', open = '', check = null, busy = false, picked = new Set(), comparing = false;
  const f = { set: '' };
  async function load() {
    loading = true;
    try { [sv, runs, pipes] = await Promise.all([api('/api/lab/steps'), api('/api/lab/runs'), api('/api/lab/pipelines')]); } catch (e) { msg = e.message; }
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
  const pipesHtml = (pro) => {
    const list = pipes?.pipelines || [];
    const rows = list.map((p) => {
      const pr = p.progress, next = pr.next >= 0 ? pr.steps[pr.next] : null;
      const blocks = p.blocks.filter((b) => b.on === 'rented').map((b) => `<li>${esc(`Card block: step${b.steps.length > 1 ? 's' : ''} ${b.steps.map((i) => i + 1).join(', ')}`)}${pro && b.draft ? `<br><code>${esc(JSON.stringify(b.draft))}</code>` : ''}</li>`).join('');
      return `<li class="lab-step-card"><strong>${esc(p.name)}</strong> <span class="tag">${esc(pr.state)}</span> <span class="muted">${p.steps.length} steps · cost so far $${pr.cost.toFixed(2)}</span>
        <ol class="lab-pipe-steps">${pr.steps.map((x) => `<li${x.i === pr.next ? ' aria-current="step"' : ''}>${esc(x.name)} <span class="muted">${esc(x.on === 'rented' ? 'rented card' : 'here')} · ${esc(PSTATE[x.state] || x.state)}</span></li>`).join('')}</ol>
        ${blocks ? `<p class="muted">Rented steps in a row share one card, so it starts once:</p><ul>${blocks}</ul>` : ''}
        ${scoreChart(p.chart, pr.steps, p.name)}
        <div class="row">${next ? `<button type="button" class="get" data-pipego="${esc(p.slug)}" ${pr.running || sv.job?.state === 'running' ? 'disabled' : ''}>${pr.state === 'not started' ? 'Start' : 'Continue'}: ${esc(next.name)}</button> <button type="button" class="link" data-pipeskip="${esc(p.slug)}" data-pipestep="${next.i}">Skip ${esc(next.name)}</button>` : '<span class="muted">Every step is done.</span>'}</div></li>`;
    }).join('');
    const b = building;
    const builder = b ? `<div class="lab-check" role="group" aria-label="New pipeline">
        <label>Name <input type="text" data-pipename maxlength="60" value="${esc(b.name)}"></label>
        <fieldset><legend>Steps, in the protocol's order</legend><ul class="lab-step-list">${sv.steps.filter((s) => s.ready).map((s) => `<li><label><input type="checkbox" data-pipepick="${esc(s.id)}" ${b.ids.has(s.id) ? 'checked' : ''}> ${esc(s.name)}</label> ${tip(esc(s.plain), s.name)}</li>`).join('')}</ul></fieldset>
        ${sv.steps.some((s) => b.ids.has(s.id) && s.form?.needs.includes('set')) ? `<label>Lesson set for the first step that needs one <select data-pipeset>${(sv.sets || []).map((x) => `<option value="${esc(x.id)}" ${b.set === x.id ? 'selected' : ''}>${esc(x.name)} · ${x.count} lessons</option>`).join('') || '<option value="">(no lesson sets yet)</option>'}</select></label><p class="muted">Later steps take what the step before them made.</p>` : ''}
        <div class="row"><button type="button" class="get" data-pipesave ${b.name.trim() && b.ids.size ? '' : 'disabled'}>Save</button><button type="button" class="link" data-pipecancel>Close</button></div></div>`
      : `<div class="row"><button type="button" class="link" data-pipenew="protocol">New pipeline from the whole protocol</button> <button type="button" class="link" data-pipenew="empty">New empty pipeline</button></div>`;
    return `<section class="lab-compare" aria-labelledby="steps-pipes-h"><h3 id="steps-pipes-h">Pipelines</h3>
      <p class="muted">A saved list of steps. Free steps here run one after another; a rented step waits for you to start its card from the Forge, with your caps. Stopped part way, it picks up at the first step not done.</p>
      ${list.length ? `<ul class="lab-step-list">${rows}</ul>` : '<p class="muted">No pipelines yet.</p>'}${builder}${pmsg ? `<p role="status">${esc(pmsg)}</p>` : ''}</section>`;
  };
  function html(pro) {
    if (!sv) { if (!loading) load(); return `<div id="lab-page-steps" role="tabpanel" aria-labelledby="lab-tab-steps"><p class="muted">${esc(msg || 'Loading...')}</p></div>`; }
    return `<div id="lab-page-steps" role="tabpanel" aria-labelledby="lab-tab-steps">
      <p class="muted">Every method the Lab has, in the order a full run uses them. Each one also works on its own. Rented steps test themselves first and stop the card if that fails.</p>
      ${sv.job ? `<div class="lab-check" role="status"><p><strong>${esc(STATE[sv.job.state] || sv.job.state)}: ${esc(sv.job.name)}</strong>${sv.job.message ? ` ${esc(sv.job.message)}` : ''}</p>${sv.job.state === 'running' ? '<button type="button" class="link" data-stepstop>Stop it</button>' : ''}</div>` : ''}
      ${sv.stages.map(([id, label]) => { const list = sv.steps.filter((s) => s.stage === id); return list.length ? `<section class="lab-compare" aria-labelledby="steps-h-${id}"><h3 id="steps-h-${id}">${esc(label)}</h3><ul class="lab-step-list">${list.map((s) => card(s, pro)).join('')}</ul></section>` : ''; }).join('')}
      ${pipesHtml(pro)}
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
    if ('pipenew' in b.dataset) { const from = b.dataset.pipenew === 'protocol' ? pipes?.protocol?.steps || [] : []; building = { name: b.dataset.pipenew === 'protocol' ? 'The whole protocol' : '', ids: new Set(from.map((x) => x.id)), set: sv.sets?.[0]?.id || '' }; return 'draw'; }
    if ('pipecancel' in b.dataset) { building = null; return 'draw'; }
    if ('pipesave' in b.dataset && building) {
      let first = true; const steps = sv.steps.filter((s) => building.ids.has(s.id)).map((s) => { const form = {}; if (s.form?.needs.includes('set')) { form.set = first ? building.set : '@prev'; first = false; } return { id: s.id, form }; });
      try { const r = await api('/api/lab/pipeline/save', { pipeline: { name: building.name, steps } }); if (r.problems?.length) pmsg = r.problems.join(' '); else { pmsg = 'Saved.'; building = null; } } catch (e) { pmsg = e.message; }
      await load(); return 'draw';
    }
    if ('pipego' in b.dataset && !busy) { busy = true; try { const r = await api('/api/lab/pipeline/go', { slug: b.dataset.pipego }); pmsg = r.message || ''; } catch (e) { pmsg = e.message; } busy = false; await load(); return 'draw'; }
    if ('pipeskip' in b.dataset) { try { await api('/api/lab/pipeline/skip', { slug: b.dataset.pipeskip, step: Number(b.dataset.pipestep) }); pmsg = 'Skipped. It shows as skipped, not done.'; } catch (e) { pmsg = e.message; } await load(); return 'draw'; }
    if ('stepstop' in b.dataset) { try { await api('/api/lab/step/stop', {}); } catch (e) { msg = e.message; } await load(); return 'draw'; }
    return false;
  }
  async function recheck() { try { check = await api('/api/lab/step/check', { id: open, form: f }); } catch (e) { msg = e.message; } }
  async function change(el) {
    if (!el.closest?.('#lab-page-steps')) return false;
    if ('pipename' in el.dataset && building) { building.name = el.value; return true; }
    if ('pipepick' in el.dataset && building) { if (el.checked) building.ids.add(el.dataset.pipepick); else building.ids.delete(el.dataset.pipepick); return 'draw'; }
    if ('pipeset' in el.dataset && building) { building.set = el.value; return true; }
    if ('stepset' in el.dataset) { f.set = el.value; await recheck(); return true; }
    if ('stepcmp' in el.dataset) { if (el.checked) picked.add(el.dataset.stepcmp); else picked.delete(el.dataset.stepcmp); return true; }
    return false;
  }
  return { html, click, change };
}
