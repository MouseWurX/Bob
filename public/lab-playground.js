// 1.5.157 🧪 Computer Science Lab, part 3: the Playground tab. The quantization ladder: one small full-size brain made
// into six running files, Q8 down to Q2, each measured the same way, so you can see it get smaller and faster and where
// it starts to get worse. Then the same question, asked of every size. Its own module so the Lab page (public/lab.js)
// only places it and hands over its events, like the cut recipes.
import { esc } from './rich.js';
import { saveHtml } from './lab-save.js';

export function createPlayground({ api, view, saveState }) {
  let confirmDel = '', from = '', plan = null, askUnload = null, pmsg = '', question = 'Explain what a black hole is to a ten-year-old, in three sentences.', open = '';
  const v = () => view() || {};
  const busy = () => v().runs?.some((x) => x.state === 'running');
  // Brains the ladder can start from: full size (F16 or BF16) and small enough for an evening.
  const starts = () => (v().brains || []).filter((b) => b.facts?.fullSize && b.facts.sizeGB <= (v().playMaxGB || 9));
  const ladders = () => v().ladders || [];

  async function replan() { plan = null; if (!from) return; try { plan = await api('/api/lab/ladder/plan', { from }); } catch (e) { pmsg = e.message; } }

  // One ladder as a table, for the page and for Save.
  const cell = (n, unit = '') => (n === null || n === undefined ? '-' : `${n}${unit}`);
  function table(l) {
    return {
      title: `Quantization ladder: ${l.brain.name}`,
      head: ['Size', 'On disk', 'Lab score', 'Words a second', 'Surprise', 'Compared with Q8', 'In words'],
      rows: l.rows.map((r) => [r.label, cell(r.sizeGB, ' GB'), cell(r.score), cell(r.tps), cell(r.ppl), r.rel === null ? '-' : `${r.rel.toFixed(2)} x`, r.verdict || '-']),
      note: 'Surprise is perplexity on a page of Bob\'s Help the brain never tuned on: lower is better. Lab score is out of 100, temperature 0.'
    };
  }
  const saveTable = (k) => { const l = ladders().find((x) => `ladder-${x.id}` === k); return l ? table(l) : null; };

  // Two bars per size: how big it is, and how surprised it is, each next to Q8. The numbers are in the table too.
  function bars(l) {
    const big = Math.max(...l.rows.map((r) => r.sizeGB || 0), 0.1);
    const worst = Math.max(...l.rows.map((r) => r.rel || 1), 1.3);
    return `<div class="play-bars" aria-hidden="true">${l.rows.map((r) => `<div class="play-bar"><span class="play-lbl">${esc(r.label)}</span>
      <span class="play-track"><span class="play-size" style="width:${Math.round(((r.sizeGB || 0) / big) * 100)}%"></span></span>
      <span class="play-track"><span class="play-surprise v-${esc((r.verdict || 'none').replace(/\s+/g, '-'))}" style="width:${r.rel ? Math.round((r.rel / worst) * 100) : 0}%"></span></span></div>`).join('')}
      <div class="play-key muted"><span><span class="play-size swatch"></span> Size on disk</span> <span><span class="play-surprise swatch"></span> Surprise (longer is worse)</span></div></div>`;
  }

  function ladderHtml(l) {
    const t = table(l), k = `ladder-${l.id}`;
    const asked = l.asked;
    return `<section class="lab-compare play-ladder" aria-labelledby="play-h-${esc(l.id)}"><h3 id="play-h-${esc(l.id)}">${esc(l.brain.name)} <span class="muted">· ${esc(l.when || '')}${l.state === 'running' ? ' · still running' : l.state && l.state !== 'done' ? ` · ${esc(l.state)}` : ''}</span></h3>
      ${l.rows.length ? `<table class="lab-report"><caption class="muted">${esc(t.note)}</caption><tr>${t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr>${t.rows.map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')}</table>
      ${bars(l)}
      ${l.saw ? `<p class="lab-saw"><strong>What you just saw:</strong> ${esc(l.saw)}</p>` : ''}` : '<p class="muted">No sizes finished yet.</p>'}
      ${(l.notes || []).map((n) => `<p class="muted">${esc(n)}</p>`).join('')}
      ${l.rows.length ? saveHtml(k, saveState(k), v().hardware) : ''}
      ${l.deleted ? '<p class="muted">The files are deleted. The table stays, so you can still look at it and save it.</p>' : `
      <div class="row"><button type="button" class="link" data-playask="${esc(l.id)}" aria-expanded="${open === l.id}">Same question, every size</button><button type="button" class="link" data-playdel="${esc(l.id)}" aria-expanded="${confirmDel === l.id}">Delete all${l.diskGB ? ` (about ${l.diskGB} GB)` : ''}</button></div>
      ${confirmDel === l.id ? `<div class="setup-offer" role="alert"><strong>Delete the six sizes for good? The table stays.</strong><div class="row"><button type="button" class="get" data-playdelgo="${esc(l.id)}">Delete them</button><button type="button" class="link" data-playdelno>Keep them</button></div></div>` : ''}
      ${open === l.id ? `<div class="lab-check"><label for="play-q">Your question</label><textarea id="play-q" rows="2" maxlength="500">${esc(question)}</textarea>
        <p class="muted">Bob asks each size in turn, at temperature 0 so the only difference is the size. It loads each one, so it takes a minute or two.</p>
        ${askUnload?.ask === l.id ? unloadHtml() : ''}
        <div class="row"><button type="button" class="get" data-playaskgo="${esc(l.id)}" ${busy() ? 'disabled' : ''}>${busy() ? 'The Lab is busy' : 'Ask every size'}</button></div></div>` : ''}`}
      ${asked ? `<div class="play-answers"><p><strong>"${esc(asked.question)}"</strong> <span class="muted">· ${esc(asked.when || '')}</span></p><ul class="tlist">${asked.answers.map((a) => `<li><strong>${esc(a.label)}</strong> <span class="muted">· ${a.seconds} s</span><br>${esc(a.text) || '<span class="muted">(no answer)</span>'}</li>`).join('')}</ul></div>` : ''}
    </section>`;
  }

  const unloadHtml = () => `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.names.join(', '))} is loaded. The ladder needs the graphics card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-playunload>Unload it and start</button><button type="button" class="link" data-playnounload>Not now</button></div></div>`;

  function html(runsHtml) {
    const list = starts();
    const steps = (v().ladderSteps || []).map((s) => s.label).join(', ');
    return `<div id="lab-page-playground" role="tabpanel" aria-labelledby="lab-tab-playground">
      <h3>How small can a brain get?</h3>
      <p class="muted">Bob takes one small brain and makes it ${steps ? `in six sizes (${esc(steps)})` : 'in six sizes'}, then measures each the same way: how big it is, how fast it writes, its Lab score, and how surprised it is by a page of Bob's Help it never tuned on. Smaller files lose detail, and this shows you where that starts to matter. It runs here, for free. It takes disk, and Bob shows how much before it starts.</p>
      ${runsHtml}
      <fieldset><legend>Which brain?</legend>${list.length ? list.map((b) => `<label class="lab-opt"><input type="radio" name="playfrom" value="${esc(b.id)}" ${from === b.id ? 'checked' : ''}> <span><strong>${esc(b.name)}</strong><br><span class="muted">${b.facts.sizeGB} GB full size.</span></span></label>`).join('')
        : `<p>There's no brain here the ladder can start from. It needs a small brain's full-size file (F16 or BF16, up to ${v().playMaxGB || 9} GB), like a 1B to 4B brain from Get models, or one you made in the Lab without step 3.</p>`}</fieldset>
      ${plan ? `<div class="lab-check" role="status">${plan.problems.length ? `<p><strong>Before it can start:</strong></p><ul>${plan.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : `<p><strong>Ready.</strong> The six sizes take about ${plan.diskGB} GB of disk. Delete all gives it back, and the results stay.</p>`}${plan.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>` : ''}
      ${askUnload?.ladder ? unloadHtml() : ''}
      <div class="row"><button type="button" class="get" data-playgo ${from && plan && !plan.problems.length && !busy() ? '' : 'disabled'}>${busy() ? 'The Lab is busy' : 'Make the ladder'}</button></div>
      ${pmsg ? `<p class="error" role="alert">${esc(pmsg)}</p>` : ''}
      ${ladders().map(ladderHtml).join('')}
    </div>`;
  }

  // The page hands over its events; true means it was ours.
  async function change(el) {
    if (el.name === 'playfrom') { from = el.value; pmsg = ''; await replan(); return true; }
    return false;
  }
  function input(el) { if (el.id === 'play-q') { question = el.value; return true; } return false; }
  async function click(b, load) {
    const d = b.dataset;
    if (!('playgo' in d || 'playunload' in d || 'playnounload' in d || d.playask || d.playaskgo || d.playdel || d.playdelgo || 'playdelno' in d)) return false;
    pmsg = '';
    if ('playnounload' in d) { askUnload = null; return 'draw'; }
    if (d.playask) { open = open === d.playask ? '' : d.playask; return 'draw'; }
    if (d.playdel) { confirmDel = confirmDel === d.playdel ? '' : d.playdel; return 'draw'; } // every delete asks first
    if ('playdelno' in d) { confirmDel = ''; return 'draw'; }
    try {
      if ('playgo' in d || (askUnload?.ladder && 'playunload' in d)) {
        const res = await api('/api/lab/ladder', { from, unload: 'playunload' in d });
        askUnload = res.needUnload ? { ladder: true, names: res.names } : null;
        if (!res.needUnload) { from = ''; plan = null; }
      } else if (d.playaskgo || (askUnload?.ask && 'playunload' in d)) {
        const id = d.playaskgo || askUnload.ask;
        const res = await api('/api/lab/ladder/ask', { id, question, unload: 'playunload' in d });
        askUnload = res.needUnload ? { ask: id, names: res.names } : null;
      } else if (d.playdelgo) {
        await api('/api/lab/ladder/delete', { id: d.playdelgo });
        open = ''; confirmDel = '';
      }
    } catch (e) { pmsg = e.message; }
    await load();
    return true;
  }

  return { html, change, input, click, saveTable };
}
