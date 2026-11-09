// 1.5.167 🧪 Computer Science Lab, Professional mode for the Challenges tab. Simple mode is the screen as it was:
// tick, run, read the score. Professional adds the run settings (temperature, seed, thinking, room, repeats), your own
// challenge packs, the spread of repeated runs, the Guard rails groups, and every question's answer in a log you can
// read and save. Its own module: the Lab page places its pieces and hands over its events.
import { esc } from './rich.js';

export const MODES = [['simple', 'Simple'], ['pro', 'Professional']];
// The Simple / Professional switch, as two toggle buttons.
export function modeSwitchHtml(mode) {
  return `<div class="row lab-chips lab-mode" role="group" aria-label="How much the Lab shows">${MODES.map(([id, label]) => `<button type="button" class="lab-chip${mode === id ? ' on' : ''}" data-labmode="${id}" aria-pressed="${mode === id}">${label}</button>`).join('')}</div>`;
}

export function createPro({ api, view }) {
  const v = () => view() || {};
  const st = { gen: null, importText: '', msg: '', logs: {}, onlyMisses: {} };
  const gen = () => (st.gen ||= { ...(v().pro?.gen || { temperature: 0, seed: 42, think: false, ctx: 8192, repeats: 1 }) });
  const ranked = () => { const g = gen(); return Number(g.temperature) === 0 && !g.think && Number(g.ctx) === Number(v().pro?.gen?.ctx || 8192); };

  // The run settings, above the Run button.
  function settingsHtml() {
    const g = gen(), p = v().pro || {};
    return `<fieldset class="lab-pro"><legend>Run settings</legend>
      <p class="row"><label for="lab-pro-temp">Temperature</label> <input id="lab-pro-temp" type="number" min="0" max="2" step="0.1" value="${esc(String(g.temperature))}" data-progen="temperature" aria-describedby="lab-pro-note">
        <label for="lab-pro-seed">Seed</label> <input id="lab-pro-seed" type="number" min="0" step="1" value="${esc(String(g.seed))}" data-progen="seed" aria-describedby="lab-pro-note"></p>
      <p class="row"><label for="lab-pro-ctx">Room (tokens)</label> <select id="lab-pro-ctx" data-progen="ctx">${(p.ctxChoices || [8192]).map((n) => `<option value="${n}" ${Number(g.ctx) === n ? 'selected' : ''}>${n.toLocaleString('en')}</option>`).join('')}</select>
        <label for="lab-pro-rep">Runs</label> <select id="lab-pro-rep" data-progen="repeats">${Array.from({ length: p.maxRepeats || 5 }, (_, i) => i + 1).map((n) => `<option value="${n}" ${Number(g.repeats) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></p>
      <label class="lab-opt"><input type="checkbox" data-progen="think" ${g.think ? 'checked' : ''}> <span>Thinking on (slower; the answer is marked, not the thinking)</span></label>
      <p class="muted" id="lab-pro-note">${ranked() ? 'These are the scoreboard settings, so the scores go on the scoreboard.' : 'These aren\'t the scoreboard settings (temperature 0, thinking off, 8,192 tokens), so this run is a study: you get its report and its log, and the scoreboard stays as it is.'} With more than one run, each run moves the seed by one, and the report shows the lowest, highest and average score.</p>
    </fieldset>`;
  }

  // Your own packs: tick them like any challenge, import more, delete one.
  function myPacksHtml(ticked = []) {
    const mine = v().myPacks || [];
    return `<fieldset class="lab-pro"><legend>Your own challenges</legend>
      ${mine.length ? mine.map((p) => `<div class="row"><label class="lab-opt"><input type="checkbox" data-pack="${esc(p.id)}" ${ticked.includes(p.id) ? 'checked' : ''}> <span><strong>${esc(p.title)}</strong> <span class="muted">· ${p.count} questions · version ${esc(p.version)}</span>${p.what ? `<br><span class="muted">${esc(p.what)}</span>` : ''}</span></label> <button type="button" class="link" data-mypackdel="${esc(p.id)}" aria-label="Delete ${esc(p.title)}">Delete</button></div>`).join('') : '<p class="muted">None yet.</p>'}
      <p><label for="lab-pro-import">Paste a pack (JSON), or pick a file</label><br><textarea id="lab-pro-import" rows="4" data-proimport>${esc(st.importText)}</textarea></p>
      <div class="row"><input type="file" id="lab-pro-file" accept=".json,application/json" data-profile aria-label="Pick a pack file"> <button type="button" class="get" data-pro="import">Import</button></div>
      <p class="muted">A pack is a title and a list of items, each a question and how to mark it: ${esc(Object.keys(v().pro?.checks || {}).join(', '))}. Help has an example. Your own challenges never go on the scoreboard: everyone's are different.</p>
      ${st.msg ? `<p role="status">${esc(st.msg)}</p>` : ''}</fieldset>`;
  }

  // Extra lines under a finished run: its settings, the spread, the Guard rails groups, and the log.
  function reportExtraHtml(run) {
    const rp = run?.report; if (!rp) return '';
    const p = v().pro || {}, lines = [];
    if (rp.settings) lines.push(`<p class="muted">${esc(rp.settings)}${rp.ranked === false ? ' A study: not on the scoreboard.' : ''}</p>`);
    for (const c of rp.challenges || []) {
      if (c.spread) lines.push(`<p class="muted">${esc(c.title)}: lowest ${c.spread.low}, highest ${c.spread.high}, average ${c.spread.mean} over ${c.spread.runs} runs.</p>`);
      if (c.groups) {
        const bs = Object.entries(c.groups.bySetting || {}).map(([k, g]) => `<tr><th scope="row">${esc(p.settings?.[k] || k)}</th><td>${g.score ?? '-'}</td><td>${g.right} of ${g.of}</td></tr>`).join('');
        const sy = c.groups.styles || {};
        lines.push(`<table class="lab-report"><caption class="muted">Guard rails: didn't over-refuse, by setting</caption><tr><th scope="col">Setting</th><th scope="col">Score</th><th scope="col">Answered</th></tr>${bs}</table>
          ${Object.keys(c.groups.heldBySetting || {}).length ? `<p class="muted">Held the line, by the setting you tagged: ${Object.entries(c.groups.heldBySetting).map(([k, g]) => `${esc(p.settings?.[k] || k)} ${g.score ?? '-'} (${g.right} of ${g.of})`).join(' · ')}.</p>` : ''}
          <p class="muted">Answered without preaching: ${c.groups.preachy?.score ?? '-'} (${c.groups.preachy?.right ?? 0} of ${c.groups.preachy?.of ?? 0} answers). How the ${sy.replies || 0} replies sounded: ${Object.entries(p.styles || {}).map(([k, label]) => `${esc(label)} ${sy[k] || 0}`).join(' · ')}.</p>`);
      }
    }
    if (rp.hasLog) {
      const lg = st.logs[run.id], only = st.onlyMisses[run.id] !== false;
      lines.push(`<div class="row"><button type="button" class="link" data-prolog="${esc(run.id)}" aria-expanded="${Boolean(lg)}">${lg ? 'Hide the question log' : 'Show the question log'}</button> <button type="button" class="link" data-prologsave="jsonl" data-prologid="${esc(run.id)}">Save the log (JSONL)</button> <button type="button" class="link" data-prologsave="csv" data-prologid="${esc(run.id)}">Save the log (spreadsheet)</button></div>`);
      if (lg) {
        const rows = (lg.rows || []).filter((x) => !only || x.ok === false || (typeof x.ok === 'string' && !/^(\d+) of \1$/.test(x.ok)));
        lines.push(`<label class="lab-opt"><input type="checkbox" data-prologmiss="${esc(run.id)}" ${only ? 'checked' : ''}> <span>Only the misses</span></label>
          <div class="lab-log" tabindex="0" role="region" aria-label="Question log"><table class="lab-report"><tr><th scope="col">Challenge</th><th scope="col">Run</th><th scope="col">Question</th><th scope="col">Answer</th><th scope="col">Result</th></tr>
          ${rows.slice(0, 400).map((x) => `<tr><td>${esc(x.pack)}</td><td>${x.run}</td><td>${esc(String(x.q).slice(0, 300))}</td><td>${esc(String(x.answer).slice(0, 600))}</td><td>${x.ok === true ? 'pass' : x.ok === false ? 'miss' : esc(String(x.ok))}</td></tr>`).join('')}</table></div>
          <p class="muted">${rows.length > 400 ? `Showing 400 of ${rows.length}. Save the log for all of them.` : `${rows.length} shown of ${lg.total}.`}</p>`);
      }
      if (st.logMsg?.[run.id]) lines.push(`<p role="status">${esc(st.logMsg[run.id])}</p>`);
    }
    return lines.join('');
  }

  function input(el) {
    if (el?.dataset?.progen) { const k = el.dataset.progen, g = gen(); g[k] = k === 'think' ? el.checked : Number(el.value); return true; }
    if (el && 'proimport' in (el.dataset || {})) { st.importText = String(el.value || ''); return true; }
    return false;
  }
  async function change(el) {
    if (el?.dataset?.progen) { input(el); return 'draw'; }
    if (el?.dataset?.prologmiss) { st.onlyMisses[el.dataset.prologmiss] = el.checked; return 'draw'; }
    if (el && 'profile' in (el.dataset || {})) { const f = el.files?.[0]; if (f) { if (f.size > 2 * 1024 * 1024) st.msg = 'That file is too big for a challenge pack (2 MB at most).'; else st.importText = await f.text(); } return 'draw'; }
    return input(el);
  }
  async function click(b, reload) {
    const d = b?.dataset || {};
    if (d.pro === 'import') {
      st.msg = '';
      try { const r = await api('/api/lab/mypack/import', { text: st.importText }); if (r.ok) { st.msg = `Imported, ${r.count} questions.`; st.importText = ''; await reload?.(); } else st.msg = (r.problems || []).join(' '); } catch (e) { st.msg = e.message; }
      return 'draw';
    }
    if (d.mypackdel) { try { await api('/api/lab/mypack/delete', { id: d.mypackdel }); st.msg = 'Deleted.'; await reload?.(); } catch (e) { st.msg = e.message; } return 'draw'; }
    if (d.prolog) { if (st.logs[d.prolog]) delete st.logs[d.prolog]; else { try { st.logs[d.prolog] = await api('/api/lab/challenge/log', { id: d.prolog }); } catch (e) { (st.logMsg ||= {})[d.prolog] = e.message; } } return 'draw'; }
    if (d.prologsave) { try { const r = await api('/api/lab/challenge/log', { id: d.prologid, save: d.prologsave }); (st.logMsg ||= {})[d.prologid] = `Saved as ${r.file} in the Lab's results folder.`; } catch (e) { (st.logMsg ||= {})[d.prologid] = e.message; } return 'draw'; }
    return false;
  }
  return { settingsHtml, myPacksHtml, reportExtraHtml, input, change, click, gen };
}
