// 13 Nov 🧪 The training protocol on the Forge tab: the order every run follows, and its free steps here (clean a
// lesson set into a new version, make right-vs-wrong pairs, sweep a running brain's live switches per target).
// The rented steps are the "New ways to teach" part of the Forge form. Nothing here rents or changes a brain file.
import { esc } from './rich.js';

const WHERE = { here: 'Here, free', rented: 'Rented card', both: 'Here, or a rented card' };

export function createProtocol({ api }) {
  let pv = null, loading = false, msg = '', check = null, busy = false;
  const f = { tool: 'clean', set: '', review: 'v4', lightWeight: 0.5, kind: 'bob', url: 'http://127.0.0.1:8090', used: '-2,+2,+4', scales: '0.8,1.2', sample: 60 };

  async function load() { loading = true; try { pv = await api('/api/lab/protocol'); if (!f.set && pv?.sets?.[0]) f.set = pv.sets[0].id; } catch (e) { msg = e.message; } loading = false; }
  async function recheck() { check = null; try { check = await api('/api/lab/protocol/check', { tool: f.tool, form: f }); } catch (e) { msg = e.message; } }

  const field = (id, label, v, hint, attrs = '') => `<label for="${id}">${esc(label)} <input id="${id}" value="${esc(String(v))}" ${attrs}${hint ? ` aria-describedby="${id}-h"` : ''}></label>${hint ? `<span class="muted" id="${id}-h">${esc(hint)}</span>` : ''}`;
  function toolHtml() {
    const sets = pv.sets || [];
    const tools = [['clean', 'Clean a lesson set', 'A new version without made-up tool calls or repeated questions; lessons the hand review marked wrong go to the wrong side.'], ['pairs', 'Make right-vs-wrong pairs', 'From a set\'s kept and wrong answers, for preference training on the Forge.'], ['sweep', 'Sweep a running brain', 'Try fewer or more experts per word and layers turned up or down, live, and score every kind of lesson on its own.']];
    return `<fieldset><legend>Free steps, on this computer</legend>
      <div role="radiogroup" aria-label="Which step">${tools.map(([v, l, h]) => `<label class="lab-opt"><input type="radio" name="proto-tool" value="${v}" ${f.tool === v ? 'checked' : ''} ${pv.tools?.[v] ? '' : 'disabled'}> <span><strong>${esc(l)}</strong>${pv.tools?.[v] ? '' : ' <span class="muted">(not in this copy\'s model-lab folder)</span>'}<br><span class="muted">${esc(h)}</span></span></label>`).join('')}</div>
      <label>Lesson set <select id="proto-set">${sets.length ? sets.map((x) => `<option value="${esc(x.id)}" ${f.set === x.id ? 'selected' : ''}>${esc(x.name)} · ${x.count} lessons${x.cleaned ? ' · cleaned' : ''}</option>`).join('') : '<option value="">(no lesson sets yet)</option>'}</select></label>
      ${f.tool === 'clean' ? `<label class="lab-opt"><input type="checkbox" id="proto-review" ${f.review !== 'none' ? 'checked' : ''}> <span>Use the hand review (lessons a person read and marked wrong)</span></label>
        ${field('proto-light', 'Weight of chat, languages and formats when training the full brain', f.lightWeight, 'The stock brain already does these well. 1 is the same as the rest; teaching back after a cut always uses 1.', 'type="number" min="0" max="2" step="0.1"')}` : ''}
      ${f.tool === 'pairs' ? `<label>Kind of set <select id="proto-kind">${[['bob', 'Bob\'s own lessons'], ['style', 'A style set (its own model)'], ['distill', 'Another model\'s answers (distillation)']].map(([v, l]) => `<option value="${v}" ${f.kind === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
      ${f.tool === 'sweep' ? `${field('proto-url', 'Brain Engine address', f.url, 'The engine running the brain to test, on this computer.', 'maxlength="40"')}
        ${field('proto-used', 'Experts per word to try', f.used, 'Changes from the brain\'s own count, like -2,+2,+4. Leave empty to skip.', 'maxlength="60"')}
        ${field('proto-scales', 'Turn layers up or down', f.scales, 'Each quarter of the layers, feed-forward and attention apart, like 0.8,1.2. Leave empty to skip.', 'maxlength="60"')}
        ${field('proto-sample', 'Held-out chats per kind of lesson', f.sample, 'More is steadier and slower.', 'type="number" min="10" max="200" step="10"')}` : ''}
      ${check ? `<div class="lab-check" role="status">${check.problems.length ? `<ul>${check.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p><strong>Ready.</strong></p>'}${check.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>` : ''}
      <div class="row"><button type="button" class="get" data-protogo ${busy || pv.job?.state === 'running' || (check && check.problems.length) || !sets.length ? 'disabled' : ''}>Run it</button>${pv.job?.state === 'running' ? '<button type="button" class="link" data-protostop>Stop it</button>' : ''}<button type="button" class="link" data-protorefresh>Refresh</button></div>
    </fieldset>`;
  }
  function jobHtml() {
    const j = pv.job; if (!j) return '';
    const word = { running: 'Running', done: 'Finished', failed: 'Stopped with a problem', stopped: 'Stopped' }[j.state] || j.state;
    return `<div class="lab-check" role="status"><p><strong>${esc(word)}: ${esc({ clean: 'Clean a lesson set', pairs: 'Make right-vs-wrong pairs', sweep: 'Sweep a running brain' }[j.tool] || j.tool)}</strong></p>${j.message ? `<p>${esc(j.message)}</p>` : ''}${j.tail?.length ? `<details ${j.state === 'failed' ? 'open' : ''}><summary>Last lines of its log</summary><pre tabindex="0">${esc(j.tail.join('\n'))}</pre></details>` : ''}</div>`;
  }
  function resultsHtml() {
    const cleaned = (pv.sets || []).filter((x) => x.changes);
    const pairs = pv.pairs || [];
    return `${cleaned.length ? `<details><summary>Change lists of cleaned sets (${cleaned.length})</summary>${cleaned.map((x) => `<h5>${esc(x.name)}</h5><pre tabindex="0">${esc(x.changes)}</pre>`).join('')}</details>` : ''}
      ${pairs.length ? `<details><summary>Pairs ready for the Forge (${pairs.length})</summary><ul>${pairs.map((x) => `<li>${esc(x.id)}: ${x.pairs} pairs, ${x.marked} marked answers (${esc(x.kind)})</li>`).join('')}</ul></details>` : ''}
      ${(pv.sweeps || []).length ? `<details><summary>Sweep reports (${pv.sweeps.length})</summary>${pv.sweeps.map((x) => `<h5>${esc(x.name)}</h5><pre tabindex="0">${esc(x.text)}</pre>`).join('')}</details>` : ''}`;
  }
  function html() {
    if (!pv) { if (!loading) load().then(() => document.dispatchEvent(new CustomEvent('lab-forge-ready'))); return '<section class="lab-compare" aria-labelledby="proto-h"><h3 id="proto-h">The training protocol</h3><p class="muted">Loading…</p></section>'; }
    return `<section class="lab-compare" id="lab-protocol" aria-labelledby="proto-h"><h3 id="proto-h">The training protocol</h3>
      <p class="muted">The order every run follows, with a benchmark after each step. Any step can be skipped. Nothing is cut, trained or rented without your go, and a change to a brain is tried live before it's baked in.</p>
      <ol class="proto-steps">${pv.steps.map((s) => `<li><strong>${esc(s.title)}</strong> <span class="muted">· ${esc(WHERE[s.where] || s.where)}</span><br><span>${esc(s.what)}</span></li>`).join('')}</ol>
      ${pv.found ? toolHtml() + jobHtml() + resultsHtml() : '<p class="muted">The Forge\'s tools aren\'t next to this copy of Bob. They live in the model-lab folder of Bob\'s source.</p>'}
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
    </section>`;
  }
  async function change(el) {
    if (!el.closest?.('#lab-protocol')) return false;
    msg = '';
    if (el.name === 'proto-tool') f.tool = el.value;
    else if (el.id === 'proto-set') f.set = el.value;
    else if (el.id === 'proto-review') f.review = el.checked ? 'v4' : 'none';
    else if (el.id === 'proto-light') f.lightWeight = Number(el.value);
    else if (el.id === 'proto-kind') f.kind = el.value;
    else if (el.id === 'proto-url') f.url = el.value;
    else if (el.id === 'proto-used') f.used = el.value;
    else if (el.id === 'proto-scales') f.scales = el.value;
    else if (el.id === 'proto-sample') f.sample = Number(el.value);
    else return false;
    await recheck(); return 'draw';
  }
  async function click(b) {
    const d = b.dataset;
    if ('protogo' in d && !busy) { busy = true; try { await api('/api/lab/protocol/run', { tool: f.tool, form: f }); } catch (e) { msg = e.message; } busy = false; await load(); return 'draw'; }
    if ('protostop' in d) { try { await api('/api/lab/protocol/stop', {}); } catch (e) { msg = e.message; } await load(); return 'draw'; }
    if ('protorefresh' in d) { await load(); return 'draw'; }
    return false;
  }
  return { html, change, click, reload: load, pairs: () => pv?.pairs || [] };
}
