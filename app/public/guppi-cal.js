// Settings, Engine tuning, under "Let the Conductor drive": GUPPI calibrates this PC (src/guppi-calibrate.js). One
// button per brain; nothing runs until it's pressed. Shows what the last run found, the job while it runs, and Forget.
import { esc } from './util.js';

async function api(p, data) {
  const r = await fetch(`/api/guppi-cal${p}`, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

const rowLine = (r) => {
  const what = r.id === 'bob' ? `Bob's pick (step ${r.step})` : `GUPPI, step ${r.step}${r.cache ? ' with the copy cache' : ''}`;
  if (r.trip) return `${what}: stopped, ${esc(r.trip)}`;
  if (r.failed) return `${what}: ${esc(r.failed)}`;
  const heat = r.peakC != null ? `, card up to ${r.peakC} C${r.smMedMHz ? ` at ${r.smMedMHz} MHz` : ''}` : '';
  const words = r.sameWords === false ? ', different words' : r.sameWords === true ? ', same words' : '';
  return `${what}: reads ${r.readTps} and writes ${r.tps} tokens a second, first word in ${r.firstWordS} s${heat}${r.minFreeMiB != null ? `, ${(r.minFreeMiB / 1024).toFixed(1)} GB left on the card` : ''}${words}`;
};

// v: GET /api/guppi-cal. models: the brains to offer. pick: the one picked. ask/said: the page's own state.
export function guppiCalHtml(v, { models = [], pick = '', ask = null, said = null } = {}) {
  const m = models.includes(pick) ? pick : models[0] || '';
  const run = v?.run && v.run.state === 'running' ? v.run : null;
  const mine = (v?.brains || []).find((b) => b.model === m);
  const top = `<div class="row"><strong>GUPPI calibrates this PC</strong> <span class="tag">runs only when you press it</span></div>
    <p class="muted">For one brain, I time Bob's pick and then my own way at each reading step, smallest first, so I know this computer's edge. Each try starts with the card cooled down and stops at once if the card gets too hot, its memory falls under 512 MB free, it spills into shared memory, or free RAM falls under 512 MB. I keep what wins: when I don't beat Bob's pick by 5%, I keep Bob's pick for that brain. About 5 to 20 minutes, and I can't chat while it runs.</p>`;
  if (!models.length) return `${top}<p class="muted">Add a brain first.</p>`;
  const pickRow = `<div class="row"><label class="pick"><span>Brain</span><select data-gcmodel aria-label="Brain for GUPPI to calibrate">${models.map((x) => `<option ${x === m ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    ${run ? `<button type="button" class="mini" data-gcstop>Stop</button>` : `<button type="button" class="get" data-gcgo>Calibrate GUPPI for this PC</button>`}</div>`;
  const askRow = ask?.needUnload ? `<div class="setup-ask" role="group" aria-label="Calibrate GUPPI"><p>${esc((ask.names || []).join(', '))} ${ask.names?.length === 1 ? 'is' : 'are'} loaded. Calibrating unloads ${ask.names?.length === 1 ? 'it' : 'them'} first.</p><div class="row"><button type="button" class="get" data-gcgo data-unload="1">Unload and calibrate</button><button type="button" class="mini" data-gccancel>Cancel</button></div></div>` : '';
  const runRow = run ? `<p role="status">${esc(run.stepLabel || 'Starting')}${run.progress ? ` (${Math.round(run.progress)}%)` : ''}</p>` : '';
  const stale = v?.stale ? `<p class="refused">My calibration isn't used: ${esc(v.stale)}. Calibrate again.</p>` : '';
  const found = mine ? `<details class="guppi-found" open><summary>Found ${esc(mine.when)}${mine.cap ? `: reading step at most ${mine.cap}` : ''}${mine.beatsBob ? ', beats Bob\'s pick' : ', Bob\'s pick kept'}</summary><p>${esc(mine.why)}</p><ul>${mine.rows.map((r) => `<li>${rowLine(r)}</li>`).join('')}</ul></details>` : '';
  const forget = (v?.brains || []).length ? `<button type="button" class="link" data-gcforget>Forget this PC's calibration</button>` : '';
  return `${top}${pickRow}${askRow}${runRow}${said ? `<p role="status" class="${said.bad ? 'refused' : ''}">${esc(said.text)}</p>` : ''}${stale}${found}${forget}`;
}

export async function mountGuppiCal(box) {
  if (!box) return;
  let models = []; try { models = JSON.parse(box.dataset.models || '[]').filter((x) => typeof x === 'string'); } catch {}
  let v = null, pick = models[0] || '', ask = null, said = null, timer = null;
  const draw = () => { box.innerHTML = guppiCalHtml(v, { models, pick, ask, said }); };
  const load = async () => {
    try { v = await api(''); } catch (e) { said = { text: e.message, bad: true }; }
    draw();
    clearTimeout(timer);
    if (v?.run?.state === 'running' && box.isConnected) timer = setTimeout(load, 3000);
  };
  box.addEventListener('change', (e) => { if (e.target.matches('[data-gcmodel]')) { pick = e.target.value; ask = null; said = null; draw(); } });
  box.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-gcgo]');
    if (go) {
      go.disabled = true;
      try { const r = await api('/start', { model: pick, unload: go.dataset.unload === '1' }); ask = r.needUnload ? r : null; said = r.started ? { text: 'Started. The steps show here as they go.' } : null; }
      catch (err) { said = { text: err.message, bad: true }; ask = null; }
      return load();
    }
    if (e.target.closest('[data-gccancel]')) { ask = null; return draw(); }
    if (e.target.closest('[data-gcstop]')) { try { await api('/stop', {}); said = { text: 'Stopped. Nothing was saved from this run.' }; } catch (err) { said = { text: err.message, bad: true }; } return load(); }
    if (e.target.closest('[data-gcforget]')) { try { await api('/forget', {}); said = { text: 'Forgotten. I go back to fitting myself as I load, as before.' }; } catch (err) { said = { text: err.message, bad: true }; } return load(); }
  });
  await load();
}
