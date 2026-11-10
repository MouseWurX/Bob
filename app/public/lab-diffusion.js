// 🧪 Playground: Diffusion brains (src/lab-diffusion.js). Pick a diffusion brain, ask, and watch the whole answer
// fill in at once over its steps, instead of one word after another.
import { esc } from './rich.js';

export function createDiffusionPage({ api }) {
  let v = null, from = '', prompt = 'Write a short poem about a cat who learns to code.', steps = 64, length = 256, msg = '', askUnload = null, loading = false;
  async function load() { loading = true; try { v = await api('/api/lab/diffusion'); msg = ''; } catch (e) { msg = e.message; } loading = false; }
  // Live frames from the runner, about once a second.
  document.addEventListener('lab-diffusion', (e) => { if (!v) return; v.now = e.detail; document.dispatchEvent(new Event('lab-page-ready')); });

  function nowHtml() {
    const n = v.now;
    if (!n) return '';
    const pct = n.of ? Math.round((100 * n.step) / n.of) : 0;
    const head = n.state === 'running' ? `Step ${n.step} of ${n.of}` : n.state === 'done' ? `Done in ${n.seconds} s, ${n.of} steps` : esc(n.error || n.state);
    return `<section class="lab-compare" aria-labelledby="df-now"><h4 id="df-now">${esc(n.brain)} <span class="muted">· ${head}</span></h4>
      ${n.state === 'running' ? `<progress max="100" value="${pct}" aria-label="Diffusion steps">${pct}%</progress> <button type="button" class="link" data-dfstop>Stop</button>` : ''}
      <p class="muted">You asked: ${esc(n.prompt)}</p>
      <pre class="lab-diffusion-text" ${n.state === 'running' ? 'aria-live="off"' : 'role="status"'}>${esc(n.text || (n.state === 'running' ? '…' : ''))}</pre>
      ${n.state === 'running' ? '<p class="muted">The gaps are words not filled in yet. Each step fills in the ones the brain is surest of.</p>' : ''}</section>`;
  }

  function html() {
    if (!v) return `<p class="muted" role="status">${loading ? 'Looking for diffusion brains…' : ''}</p>${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}`;
    const running = v.now?.state === 'running';
    return `<h3>Diffusion brains: the whole answer at once</h3>
      <p class="muted">Most brains write one word after another. A diffusion brain (Dream, LLaDA, RND1) starts from a block of blanks and fills them all in over a number of steps, surest words first, a bit like a picture coming out of noise. More steps: slower, and usually better. Bob's chat can't run these, so they live here.</p>
      ${v.tool ? '' : `<p class="muted"><strong>${esc(v.toolWhy)}</strong></p>`}
      <fieldset><legend>Which brain?</legend>${v.brains.length ? v.brains.map((b) => `<label class="lab-opt"><input type="radio" name="dffrom" value="${esc(b.id)}" ${from === b.id ? 'checked' : ''}> <span><strong>${esc(b.name)}</strong><br><span class="muted">${b.sizeGB ?? '?'} GB, ${esc(b.arch)}</span></span></label>`).join('') : '<p>No diffusion brains here yet. Get one as a GGUF (search Hugging Face for Dream or LLaDA GGUF), then add it with Add your own brain in Get models, or Bring in a full-size brain in the Forge.</p>'}</fieldset>
      <label for="df-q"><strong>Ask</strong></label><textarea id="df-q" rows="3" maxlength="2000">${esc(prompt)}</textarea>
      <div class="row"><label>Steps <select data-dfsteps>${v.steps.map((s) => `<option ${s === steps ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Length <select data-dflen>${v.lengths.map((s) => `<option value="${s}" ${s === length ? 'selected' : ''}>about ${s} words</option>`).join('')}</select></label></div>
      ${askUnload ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.join(', '))} is loaded. The diffusion brain needs the card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-dfgo data-unload>Unload it and start</button><button type="button" class="link" data-dfno>Not now</button></div></div>` : ''}
      <div class="row"><button type="button" class="get" data-dfgo ${from && v.tool && !running ? '' : 'disabled'}>${running ? 'Writing…' : 'Write it'}</button></div>
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
      ${nowHtml()}`;
  }

  async function change(el) {
    if (el.name === 'dffrom') { from = el.value; return true; }
    if ('dfsteps' in el.dataset) { steps = Number(el.value); return true; }
    if ('dflen' in el.dataset) { length = Number(el.value); return true; }
    return false;
  }
  function input(el) { if (el.id === 'df-q') { prompt = el.value; return true; } return false; }
  async function click(b) {
    const d = b.dataset;
    if ('dfno' in d) { askUnload = null; return 'draw'; }
    if ('dfstop' in d) { try { await api('/api/lab/diffusion/stop', {}); } catch (e) { msg = e.message; } return 'draw'; }
    if (!('dfgo' in d)) return false;
    msg = '';
    try {
      const r = await api('/api/lab/diffusion/try', { brain: from, prompt, steps, length, unload: 'unload' in d });
      askUnload = r.needUnload ? r.names : null;
      if (r.started) v.now = r.started;
    } catch (e) { msg = e.message; }
    return 'draw';
  }
  return { kind: 'diffusion', html, load, change, input, click, saveTable: () => null };
}
