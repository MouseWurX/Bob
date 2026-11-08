// 1.5.153 The Lab page's cut recipes, estimate table and usage map (bob-design/blend-and-cut-recipes.md). Its own
// module so the Lab page (public/lab.js) only places three blocks and hands over its events. The recipes fill the
// five steps; the estimate shows what a job takes here and what the rented part would cost, before anything runs;
// the usage map counts which experts a brain uses for the things you test it on, and which it never touches.
import { esc } from './rich.js';
import { DEVICES } from './lab-recipes-list.js';

export function createRecipes({ api, recipe, view, replan, draw }) {
  let list = [], options = [], device = 'here', recipeId = '', applied = null, est = null, usage = null, usageFor = '';
  const pick = new Set(['quiz:general', 'quiz:tools', 'quiz:coding', 'quiz:following']);
  let upath = '', tryWithout = false, askUnload = null, umsg = '';
  const v = () => view() || {};
  const brain = () => v().brains?.find((b) => b.id === recipe.from);
  const busy = () => v().runs?.some((x) => x.state === 'running');

  async function loadList() { if (list.length) return; try { const j = await api('/api/lab/recipes'); list = j.recipes || []; options = j.options || []; } catch {} }
  async function loadUsage() { usageFor = recipe.from; usage = null; if (!recipe.from) return; try { usage = await api('/api/lab/usage', { brain: recipe.from }); } catch { usage = null; } }

  // Called by the Lab page after every plan: the estimate for what's ticked now, and the usage map for a new brain.
  async function afterPlan() {
    await loadList();
    if (recipe.from !== usageFor) { applied = null; recipeId = ''; await loadUsage(); }
    try { est = recipe.from ? await api('/api/lab/estimate', { recipe, id: recipeId }) : null; } catch { est = null; }
  }

  function galleryHtml() {
    if (!list.length) return '';
    const b = brain();
    const opts = DEVICES.map((d) => `<option value="${d.id}" ${device === d.id ? 'selected' : ''}>${esc(d.here && v().cardGB ? `${d.label} (${v().cardGB} GB card)` : d.label)}</option>`).join('');
    const cards = list.map((x) => `<li class="lab-recipe-card${x.later ? ' dim' : ''}"><strong id="lab-rc-${x.id}">${esc(x.title)}</strong> <span class="muted">${esc(x.for)}</span><br><span class="muted" id="lab-rch-${x.id}">${esc(x.help)}</span><br>
      ${x.later ? '<span class="lab-later">Not built yet</span>' : x.measureOnly ? `<button type="button" class="link" data-openusage aria-describedby="lab-rch-${x.id}" ${b ? '' : 'disabled'}>Open the usage map</button>` : `<button type="button" class="link" data-userecipe="${x.id}" aria-describedby="lab-rc-${x.id} lab-rch-${x.id}" ${b ? '' : 'disabled'}>${recipeId === x.id ? 'Use it again' : 'Use this recipe'}</button>`}</li>`).join('');
    const sz = applied?.size;
    return `<section class="lab-recipes" aria-labelledby="lab-recipes-h"><h3 id="lab-recipes-h">Cut recipes</h3>
      <p class="muted">Pick what the new brain is for and where it will run, and I fill in steps 2 to 5. You can still change every box, and nothing starts until you press Start.${b ? '' : ' Pick a brain in step 1 first.'}</p>
      <p><label for="lab-device">Where it will run</label> <select id="lab-device">${opts}</select></p>
      <ul class="lab-recipe-list">${cards}</ul>
      ${applied ? `<div class="lab-check" role="status"><p><strong>${esc(list.find((x) => x.id === recipeId)?.title || '')} for ${esc((sz?.device || '').replace(/^A /, 'a ').replace(/^An /, 'an ').replace(/^This /, 'this '))}:</strong> ${sz?.whole ? 'no cut needed' : `${sz?.keep} experts per layer`}, about ${sz?.gb} GB${sz?.type ? ` as a ${sz.type.slice(0, 2)} file` : ''}.</p>${applied.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>` : ''}
    </section>`;
  }

  function estimateHtml() {
    if (!est || (!est.here && !est.rented)) return '';
    const h = est.here, rr = est.rented;
    const row = (label, a, b2) => `<tr><th scope="row">${esc(label)}</th><td>${esc(a)}</td>${rr ? `<td>${esc(b2)}</td>` : ''}</tr>`;
    return `<section class="lab-estimate" aria-labelledby="lab-est-h"><h3 id="lab-est-h">What it takes</h3>
      <table class="lab-report"><caption class="muted">Before anything runs. Every number is about.</caption>
        <tr><th scope="col"></th><th scope="col">Here</th>${rr ? '<th scope="col">Rented card (teaching it back)</th>' : ''}</tr>
        ${row('Steps', h ? `${h.steps.length} steps` : '-', rr ? rr.parts.map((p) => p.what).join(', ') : '')}
        ${row('Time', h ? `${h.minutes[0]} to ${h.minutes[1]} minutes` : '-', rr ? `${rr.hours[0]} to ${rr.hours[1]} hours` : '')}
        ${row('Card', 'this replicant matrix', rr ? rr.card : '')}
        ${row('Cost', 'free', rr ? `$${rr.dollars[0]} to $${rr.dollars[1]}` : '')}
        ${rr ? row('Cap', '-', `${rr.cap.hours} hours or $${rr.cap.dollars}, whichever comes first`) : ''}
        ${row('Space needed', h ? `${h.spaceGB} GB free` : '-', rr ? `your storage drive at the service, about $${rr.drive} a month while it's kept` : '')}
      </table>
      ${est.words.map((x) => `<p class="muted">${esc(x)}</p>`).join('')}
      ${h ? `<details><summary>Each step here</summary><ul>${h.steps.map((s) => `<li>${esc(s.label)}: about ${s.minutes < 1 ? 'a minute' : `${Math.round(s.minutes)} minutes`}</li>`).join('')}</ul></details>` : ''}
    </section>`;
  }

  const ids = (l) => l.map((x) => (x.layer !== undefined ? `layer ${x.layer}: ${x.experts.join(', ')}` : '')).join('; ');
  function usageHtml() {
    const b = brain();
    const head = '<h3 id="lab-usage-h">Usage map: which experts does it use?</h3>';
    if (!b) return `<section class="lab-usage" id="lab-usage" aria-labelledby="lab-usage-h">${head}<p class="muted">Pick a brain in step 1, then tick what to test it on.</p></section>`;
    if (!b.facts?.experts) return `<section class="lab-usage" id="lab-usage" aria-labelledby="lab-usage-h">${head}<p class="muted">${esc(b.name)} isn't a mixture-of-experts brain, so there are no experts to count.</p></section>`;
    const L = usage?.have ? usage.lists : null;
    const opt = (o) => `<label class="lab-opt"><input type="checkbox" data-uthing="${esc(o.id)}" ${pick.has(o.id) ? 'checked' : ''}> <span><strong>${esc(o.label)}</strong><br><span class="muted">${esc(o.hint)}</span></span></label>`;
    return `<section class="lab-usage" id="lab-usage" aria-labelledby="lab-usage-h" tabindex="-1">${head}
      <p class="muted">${esc(b.name)} has ${b.facts.experts} experts in each layer and wakes ${b.facts.used} for every word. Tick what to test it on, and I count which experts wake up for each one, and which never do. It's free and runs here, a few minutes for each thing.</p>
      <fieldset><legend>Test it on</legend>${options.map(opt).join('')}
        ${pick.has('path') ? `<p><label>File or folder <input id="lab-usage-path" type="text" value="${esc(upath)}" autocomplete="off"></label></p>` : ''}</fieldset>
      <label class="lab-opt${v().brainEngine ? '' : ' dim'}"><input type="checkbox" data-utry ${tryWithout ? 'checked' : ''} ${v().brainEngine ? '' : 'disabled'}> <span><strong>Then try it without the cold and faint experts</strong><br><span class="muted">${v().brainEngine ? 'Brain Engine switches them off for a moment and gives the Lab test with and without them. Nothing is written to disk.' : 'Needs Brain Engine, Bob\'s Lab engine. It isn\'t on this replicant matrix yet.'}</span></span></label>
      ${askUnload ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the card</strong><span>${esc(askUnload.join(', '))} is loaded. Counting needs the card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-uunload>Unload it and count</button><button type="button" class="link" data-unounload>Not now</button></div></div>` : ''}
      <div class="row"><button type="button" class="get" data-usagestart ${busy() || !pick.size ? 'disabled' : ''}>${busy() ? 'The Lab is busy' : 'Count'}</button></div>
      ${umsg ? `<p class="error" role="alert">${esc(umsg)}</p>` : ''}
      ${L ? `<div class="lab-usage-result" role="status">
        <p><strong>Across ${usage.things.length === 1 ? 'the one thing' : `the ${usage.things.length} things`} tested</strong> (${esc(usage.things.map((t) => t.name).join(', '))}): ${L.cold} experts never woke up, ${L.coldShare}% of the brain's experts. Another ${L.faint} (${L.faintShare}%) did only the last 5% of the work. Those are the safest ones to cut.</p>
        <p class="muted">A cold expert is only cold for what you tested. Test wide before you cut: a short test leaves experts cold that a bigger one would wake. And most of my experts work on every kind of job, so a brain shaped for one job won't be much smaller than one shaped for all of them.</p>
        ${usage.tried ? `<p>Tried on Brain Engine without the ${usage.tried.off} cold and faint experts: ${usage.tried.masked} on the Lab test, against ${usage.tried.full} with all of them.</p>` : ''}
        ${L.kept.length ? `<table class="lab-report"><caption class="muted">How much of each thing's work a cut keeps: on average, and in the worst layer</caption><tr><th scope="col">Tested on</th>${L.kept.map((k) => `<th scope="col">${k.keep} experts</th>`).join('')}</tr>${usage.things.map((t, i) => `<tr><th scope="row">${esc(t.name)}</th>${L.kept.map((k) => `<td>${k.things[i].average}%, worst ${k.things[i].worst}%</td>`).join('')}</tr>`).join('')}</table>` : ''}
        ${L.onlyFor.some((o) => o.total) ? `<p><strong>Used by one thing only</strong> (at least 1% of its work in a layer, almost none of the others'):</p><ul>${L.onlyFor.filter((o) => o.total).map((o) => `<li>${esc(o.name)}: ${o.total} experts. <span class="muted">${esc(ids(o.layers).slice(0, 400))}</span></li>`).join('')}</ul>` : usage.things.length > 1 ? '<p class="muted">No expert here works for one thing only: they all share the work.</p>' : ''}
        <details><summary>Each layer</summary><table class="lab-report"><caption class="muted">Experts used, never used and faint, layer by layer</caption><tr><th scope="col">Layer</th><th scope="col">Used</th><th scope="col">Never used</th><th scope="col">Faint</th></tr>${L.perLayer.map((l) => `<tr><th scope="row">${l.layer}</th><td>${l.used} of ${L.experts}</td><td>${l.cold.length}${l.cold.length ? ` <span class="muted">(${esc(l.cold.slice(0, 24).join(', '))}${l.cold.length > 24 ? ', ...' : ''})</span>` : ''}</td><td>${l.faint.length}</td></tr>`).join('')}</table></details>
        <p class="muted">Saved as ${esc(usage.files.join(' and '))} in the Lab's usage folder${usage.when ? `, ${esc(usage.when)}` : ''}. The cut recipes use them for this brain; in step 3, Use an expert list I have takes the keep list.</p>
      </div>` : ''}
    </section>`;
  }

  async function change(el) {
    if (el.id === 'lab-device') { device = el.value; if (recipeId) await use(recipeId); return true; }
    if (el.dataset.uthing) { if (el.checked) pick.add(el.dataset.uthing); else pick.delete(el.dataset.uthing); draw(); return true; }
    if (el.id === 'lab-usage-path') { upath = el.value.trim().replace(/^"|"$/g, ''); return true; }
    if ('utry' in el.dataset) { tryWithout = el.checked; return true; }
    return false;
  }

  async function use(id) {
    try {
      const a = await api('/api/lab/recipes/apply', { recipe, id, device });
      for (const k of Object.keys(a.recipe)) recipe[k] = a.recipe[k];
      recipeId = id; applied = { notes: a.notes, size: a.size, source: a.source };
    } catch (e) { applied = { notes: [e.message], size: null }; }
    await replan();
  }

  async function startUsage(unload) {
    umsg = '';
    try {
      const res = await api('/api/lab/usage/start', { brain: recipe.from, things: [...pick], file: upath, tryWithout, unload });
      if (res.needUnload) { askUnload = res.names; return draw(); }
      askUnload = null;
    } catch (e) { umsg = e.message; }
    await replan();
  }

  async function click(b) {
    if (b.dataset.userecipe) { await use(b.dataset.userecipe); return true; }
    if ('openusage' in b.dataset) { document.getElementById('lab-usage')?.focus(); document.getElementById('lab-usage')?.scrollIntoView({ block: 'start' }); return true; }
    if ('usagestart' in b.dataset) { await startUsage(false); return true; }
    if ('uunload' in b.dataset) { await startUsage(true); return true; }
    if ('unounload' in b.dataset) { askUnload = null; draw(); return true; }
    return false;
  }

  // A usage job finished: read the new map.
  async function runUpdate(run) { if (run.kind === 'usage' && run.state !== 'running' && run.from === recipe.from) { await loadUsage(); draw(); } }

  return { afterPlan, galleryHtml, estimateHtml, usageHtml, change, click, runUpdate, get recipeId() { return recipeId; } };
}
