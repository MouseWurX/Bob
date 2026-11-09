// 1.5.158 🧪 Computer Science Lab: the Forge tab. Every way to make a brain as a card with its best practice, the
// Forge's past runs, and a form that writes a Forge plan. Its own module, like the Playground: the Lab page only
// places it and hands over its events. Nothing here starts a rental.
import { esc } from './rich.js';

const WHERE = { here: 'Here, free', rented: 'Rented card', both: 'Here, or a rented card' };

export function createForge({ api, goMake }) {
  let fv = null, loading = false, fmsg = '', check = null, showPlan = false, saved = '';
  const form = { base: '', run: '', rungs: [{ name: '', nickname: '', how: 'number', keep: 128, keepFile: '' }], strong: [], quants: ['Q4_K_M'], heal: { experts: 'lora', epochs: 1 }, hours_max: 0, dollars_max: 0, note: '' };

  async function load() { loading = true; try { fv = await api('/api/lab/forge'); } catch (e) { fmsg = e.message; } loading = false; }
  async function recheck() { check = null; saved = ''; if (!fv?.found) return; try { check = await api('/api/lab/forge/plan', { form }); } catch (e) { fmsg = e.message; } }

  const card = (m) => `<li class="forge-card${m.ready ? '' : ' dim'}"><h4 id="forge-m-${m.id}">${esc(m.title)}</h4>
    <p class="muted"><span class="forge-where">${esc(WHERE[m.where] || m.where)}</span></p>
    <p>${esc(m.what)}</p>
    <p class="forge-tips-h"><strong>Best practice</strong></p><ul class="forge-tips">${m.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    ${m.ready && m.use === 'make' ? `<button type="button" class="link" data-forgeuse="make" aria-describedby="forge-m-${m.id}">Use this way</button>`
      : m.use === 'forge' ? `<button type="button" class="link" data-forgeuse="form" aria-describedby="forge-m-${m.id}">Write a plan for it</button><p class="muted">${esc(m.why || '')}</p>`
      : `<p class="muted">${esc(m.why || '')}</p>`}</li>`;

  function runsHtml() {
    if (!fv.found) return '<p class="muted">The Forge isn\'t next to this copy of Bob. It lives in the model-lab folder of Bob\'s source; run Bob from there and its runs show here.</p>';
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

  function formHtml() {
    if (!fv.found) return '';
    return `<section class="lab-compare" id="forge-form" aria-labelledby="forge-form-h"><h3 id="forge-form-h">New Forge run</h3>
      <p class="muted">Fill this in and Bob writes the plan the Forge reads. Saving a plan costs nothing and rents nothing.</p>
      <label>Start from <select id="forge-base"><option value="">(choose a Forge plan)</option>${fv.plans.map((p) => `<option value="${esc(p.id)}" ${form.base === p.id ? 'selected' : ''}>${esc(p.id)} · ${esc(p.rungs.join(', '))}</option>`).join('')}</select></label>
      <p class="muted">The teacher, lessons and skills come from the plan you start from. The brains, files, caps and teaching back are yours.</p>
      <label>Run name <input id="forge-run" value="${esc(form.run)}" maxlength="40" placeholder="my-first-run"></label>
      ${form.rungs.map(rungHtml).join('')}
      ${form.rungs.length < 4 ? '<button type="button" class="link" data-forgeaddrung>Add a brain made from the last one</button>' : ''}
      ${fv.skills.length ? `<fieldset><legend>Protect these skills most (whole run)</legend>${fv.skills.map((k) => `<label class="lab-opt"><input type="checkbox" data-forgestrong="${esc(k)}" ${form.strong.includes(k) ? 'checked' : ''}> <span>${esc(k)}</span></label>`).join('')}</fieldset>` : ''}
      <fieldset><legend>Running files</legend>${[['Q4_K_M', 'Q4 (recommended)'], ['Q3_K_M', 'Q3 (for 8 GB or less)'], ['Q5_K_M', 'Q5'], ['Q6_K', 'Q6']].map(([v, l]) => `<label class="lab-opt"><input type="checkbox" data-forgequant="${v}" ${form.quants.includes(v) ? 'checked' : ''}> <span>${esc(l)}</span></label>`).join('')}</fieldset>
      <fieldset><legend>Teaching back</legend>
        ${[['lora', 'Light (recommended)', 'Teaches small add-ons to every layer and the experts.'], ['full', 'Full', 'Teaches every weight. Small brains only.'], ['frozen', 'Experts left alone', 'Only the rest of the brain is taught.']].map(([v, l, h]) => `<label class="lab-opt"><input type="radio" name="forge-experts" value="${v}" ${form.heal.experts === v ? 'checked' : ''}> <span><strong>${esc(l)}</strong><br><span class="muted">${esc(h)}</span></span></label>`).join('')}
        ${num('forge-epochs', 'Passes over the lessons', form.heal.epochs, 0.25, 3, 0.25, 'One full pass is the rule. Bob sets each brain\'s time limit a third above the estimate, so a pass is never cut short.')}
      </fieldset>
      <fieldset><legend>Caps</legend>
        ${num('forge-hours', 'Hours, at most', form.hours_max, 0, 72, 0.5)} ${num('forge-dollars', 'Dollars, at most', form.dollars_max, 0, 500, 1)}
        <p class="muted">They start at 0, and Bob never suggests a number. A plan with a 0 cap can be saved and read, but never started.</p>
      </fieldset>
      ${check ? `<div class="lab-check" role="status">${check.problems.length ? `<p><strong>Before it can be saved:</strong></p><ul>${check.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : `<p><strong>Ready to save.</strong> Teaching back takes about ${check.hours} hours on the card.</p>`}${check.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>` : ''}
      <div class="row"><button type="button" class="get" data-forgesave ${check && !check.problems.length ? '' : 'disabled'}>Save the plan</button><button type="button" class="link" data-forgeshow aria-expanded="${showPlan}">Show the plan</button></div>
      ${saved ? `<p class="muted" role="status">Saved as ${esc(saved)} in the Lab's forge-plans folder.</p>` : ''}
      ${showPlan ? `<div class="lab-recipe"><pre tabindex="0">${esc(check?.text || 'Choose a Forge plan to start from first.')}</pre></div>` : ''}
      <div class="row"><button type="button" class="get" disabled aria-describedby="forge-start-h">Start on a rented card</button></div>
      <p class="muted" id="forge-start-h">Coming in the next drop: the cost and the cap on a card you press, and the run's progress here. Bob never starts a rental by himself.</p>
    </section>`;
  }

  function html() {
    if (!fv) { if (!loading) load().then(() => document.dispatchEvent(new CustomEvent('lab-forge-ready'))); return `<div id="lab-page-forge" role="tabpanel" aria-labelledby="lab-tab-forge"><p class="muted">${esc(fmsg || 'Loading…')}</p></div>`; }
    return `<div id="lab-page-forge" role="tabpanel" aria-labelledby="lab-tab-forge">
      <p class="muted">The Forge makes brains on a rented graphics card, from a plan. Here are all the ways to make a new brain, here or on a rented card, each with what works best. Then your Forge runs so far, and a form that writes a plan for the next one.</p>
      <section aria-labelledby="forge-ways-h"><h3 id="forge-ways-h">Ways to make a brain</h3><ul class="forge-cards">${fv.methods.map(card).join('')}</ul>
        <details><summary>Ideas left out, and why</summary><dl class="forge-left">${fv.leftOut.map(([t, w]) => `<dt>${esc(t)}</dt><dd>${esc(w)}</dd>`).join('')}</dl></details></section>
      <section class="lab-compare" aria-labelledby="forge-runs-h"><h3 id="forge-runs-h">Forge runs</h3>${runsHtml()}</section>
      ${formHtml()}
      ${fmsg ? `<p class="error" role="alert">${esc(fmsg)}</p>` : ''}
    </div>`;
  }

  // Events from the Lab page. 'draw' asks the page to draw again; true means handled.
  async function change(el) {
    if (!el.closest?.('#lab-page-forge')) return false;
    fmsg = '';
    if (el.id === 'forge-base') form.base = el.value;
    else if (el.id === 'forge-run') form.run = el.value;
    else if (el.dataset.rung !== undefined) { const r = form.rungs[Number(el.dataset.rung)]; if (r) r[el.dataset.f] = el.value; }
    else if (el.id?.startsWith('forge-keep-')) { const r = form.rungs[Number(el.id.slice(11))]; if (r) r.keep = Number(el.value); }
    else if (el.dataset.forgestrong) { const k = el.dataset.forgestrong; form.strong = el.checked ? [...new Set([...form.strong, k])] : form.strong.filter((x) => x !== k); }
    else if (el.dataset.forgequant) { const k = el.dataset.forgequant; form.quants = el.checked ? [...new Set([...form.quants, k])] : form.quants.filter((x) => x !== k); }
    else if (el.name === 'forge-experts') form.heal.experts = el.value;
    else if (el.id === 'forge-epochs') form.heal.epochs = Number(el.value);
    else if (el.id === 'forge-hours') form.hours_max = Number(el.value);
    else if (el.id === 'forge-dollars') form.dollars_max = Number(el.value);
    else return false;
    await recheck();
    return 'draw';
  }
  async function click(b) {
    const d = b.dataset;
    if (d.forgeuse === 'make') { goMake(); return true; }
    if (d.forgeuse === 'form') { document.getElementById('forge-form')?.scrollIntoView({ block: 'start' }); document.getElementById('forge-base')?.focus(); return true; }
    if ('forgeaddrung' in d) { const last = form.rungs.at(-1); form.rungs.push({ name: '', nickname: '', how: 'cover', keep: Math.max(8, Math.round((last.keep || 128) * 0.7)), keepFile: '' }); await recheck(); return 'draw'; }
    if (d.forgermrung) { form.rungs.splice(Number(d.forgermrung), 1); await recheck(); return 'draw'; }
    if ('forgeshow' in d) { showPlan = !showPlan; if (showPlan && !check) await recheck(); return 'draw'; }
    if ('forgesave' in d) { try { saved = (await api('/api/lab/forge/save', { form })).file; fmsg = ''; } catch (e) { fmsg = e.message; } return 'draw'; }
    return false;
  }
  return { html, change, click, reload: async () => { await load(); } };
}
