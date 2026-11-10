// 🧪 Computer Science Lab, Playground: FNRI (Functional Neural Response Imager). A scan of a mixture-of-experts
// brain at work: Bob asks it a few simple questions for each skill on Brain Engine and records which experts every
// layer picked for every word. The viewer (public/watch.html, its own window so it can sit beside the Lab or a chat)
// plays the scan as a 3D block of voxels: a floor for each layer, experts coloured by the skill they lean to around
// a grey core of the parts that are not experts, glowing as they are used. This page picks the brain and the
// skills, starts the scan (src/lab-watch.js) and lists the scans made; the Playground places it.
import { esc } from './rich.js';
import { NAME, LONG_NAME } from './lab-watch-math.js';

export function openViewer(brain = '', rec = '') {
  const q = brain && rec ? `?brain=${encodeURIComponent(brain)}&rec=${encodeURIComponent(rec)}` : '';
  const w = window.open(`/watch.html${q}`, 'bob-watch', 'popup,width=1180,height=820');
  try { w?.focus(); } catch {}
  return Boolean(w);
}

export function createWatchPage({ api }) {
  let v = null, bv = null, brain = '', picked = null, per = 0, ownName = '', ownQs = '', msg = '', askUnload = null, confirmDel = '', showQs = false, loading = false, think = false, what = '';
  async function loadBrain() { bv = null; if (!brain) return; try { bv = await api('/api/lab/watch/view', { brain }); } catch (e) { msg = e.message; } }
  async function load() {
    loading = true;
    try { v = await api('/api/lab/watch'); if (!picked) picked = new Set(v.skills.filter((s) => !s.extra).map((s) => s.id)); if (!per) per = v.per; if (!brain && v.brains.length === 1) brain = v.brains[0].id; await loadBrain(); } catch (e) { msg = e.message; }
    loading = false;
  }
  const count = () => (v ? v.skills.filter((s) => picked.has(s.id)).length * per + (ownName.trim() ? ownQs.split('\n').filter((q) => q.trim()).slice(0, v.ownMax).length : 0) : 0);

  function html() {
    if (!v) return `<p class="muted" role="status">${loading ? 'Reading your brains…' : ''}</p>${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}`;
    const n = count();
    const over = Math.max(0, v.skills.filter((s) => picked.has(s.id)).length + (ownName.trim() && ownQs.trim() ? 1 : 0) - (v.maxSkills || 16));
    return `<h3>${esc(NAME)}: watch a brain's experts light up</h3>
      <p class="muted">${esc(LONG_NAME)}, a scan of a brain at work. A mixture-of-experts brain picks a few experts in every layer for every word. Bob asks it a few simple questions for each skill and records which ones it picked. Then the viewer shows the brain as a block of voxels: one floor for each layer, every expert coloured by the skill that used it most, around a grey core of the parts that aren't experts. Press Play and the experts glow as the brain reads and writes each word. A brain with no experts is scanned too: Bob lights the busiest groups of neurons in each layer instead.</p>
      <fieldset><legend>Which brain?</legend>${v.brains.length ? `<select id="watch-brain" aria-label="Which brain"><option value="">(pick one)</option>${v.brains.map((b) => `<option value="${esc(b.id)}" ${brain === b.id ? 'selected' : ''}>${esc(b.name)} · ${b.experts ? `${b.experts} experts` : 'no experts: neuron groups'}, ${b.layers} layers</option>`).join('')}</select>` : '<p>There\'s no brain here to scan yet. Get one in Get models.</p>'}</fieldset>
      ${brain && bv ? (bv.live?.ok ? `
      <fieldset><legend>Skills to ask about</legend>${v.skills.map((s) => `<label class="lab-opt"><input type="checkbox" data-watchskill="${esc(s.id)}" ${picked.has(s.id) ? 'checked' : ''}> <span><strong>${esc(s.label)}</strong><br><span class="muted">Like: ${esc(s.questions[0])}</span></span></label>`).join('')}
        <button type="button" class="link" data-watchqs aria-expanded="${showQs}">Show every question</button>
        ${showQs ? `<div class="lab-check">${v.skills.map((s) => `<p><strong>${esc(s.label)}</strong></p><ol>${s.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>`).join('')}</div>` : ''}</fieldset>
      <label for="watch-per">Questions for each skill</label> <select id="watch-per">${v.perChoices.map((c) => `<option value="${c}" ${per === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <label class="lab-opt"><span><strong>What to light up</strong><br><select id="watch-what"><option value="" ${what ? '' : 'selected'}>The brain's own parts: its experts, or groups of neurons if it has none</option><option value="heads" ${what === 'heads' ? 'selected' : ''}>Attention heads (works on any brain)</option></select><br><span class="muted">Attention heads are the parts of each layer that decide which earlier words to look at. Every brain has them, so this is the scan for a brain without experts when you want real parts and not neuron groups. Either scan also records how hard each floor works (Floors only in the viewer), except a scan of experts. All of it runs here, on this replicant matrix.</span></span></label>
      <label class="lab-opt"><input type="checkbox" id="watch-think" ${think ? 'checked' : ''}> <span><strong>Let it think first</strong><br><span class="muted">The brain writes its thoughts before each answer, and the viewer shows them as their own part. Longer scans (about ${v.wordsThink} words each). Only brains that can think do.</span></span></label>
      <details ${ownName || ownQs ? 'open' : ''}><summary>Add a skill of your own</summary>
        <label for="watch-own-name">Its name</label> <input type="text" id="watch-own-name" maxlength="40" value="${esc(ownName)}" placeholder="Cooking">
        <label for="watch-own-qs">Its questions, one on each line (up to ${v.ownMax})</label><textarea id="watch-own-qs" rows="3" maxlength="2000">${esc(ownQs)}</textarea></details>
      <p class="muted">${n} question${n === 1 ? '' : 's'}, about ${think ? v.wordsThink : v.words} words of answer each. I load the brain once on Brain Engine and ask them one at a time, so it takes a few minutes. While it reports its experts the brain writes slower than usual. More questions give a steadier picture.</p>
      ${askUnload ? `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.join(', '))} is loaded. The scan needs the card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-watchgo="unload">Unload it and start</button><button type="button" class="link" data-watchnounload>Not now</button></div></div>` : ''}
      <div class="row"><button type="button" class="get" data-watchgo ${n && !over ? '' : 'disabled'} ${over ? 'aria-describedby="watch-over"' : ''}>Start the scan</button></div>${over ? `<p id="watch-over" class="error" role="alert">A scan holds up to ${v.maxSkills} skills, so each keeps its own colour. Untick ${over}.</p>` : ''}`
        : `<div class="lab-check" aria-disabled="true"><p><strong>Scan this brain</strong> <span class="lab-later">Not yet</span></p><p class="muted">${esc(bv.live?.why || '')}</p></div>`) : ''}
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
      ${brain && bv ? `<section class="lab-compare" aria-labelledby="watch-recs"><h4 id="watch-recs">Scans of this brain</h4>
        ${bv.recordings.length ? `<ul class="tlist">${bv.recordings.map((r) => `<li><strong>${esc(r.when)}</strong> · ${r.clips} questions, ${r.words.toLocaleString()} words · ${esc(r.skills.join(', '))}${r.saw ? `<br><span class="muted">${esc(r.saw)}</span>` : ''}
          <div class="row"><button type="button" class="get" data-watchopen="${esc(r.id)}">Open the viewer</button><button type="button" class="link" data-watchdel="${esc(r.id)}" aria-expanded="${confirmDel === r.id}">Delete</button></div>
          ${confirmDel === r.id ? `<div class="setup-offer" role="alert"><strong>Delete this scan for good?</strong><div class="row"><button type="button" class="get" data-watchdelgo="${esc(r.id)}">Delete it</button><button type="button" class="link" data-watchdelno>Keep it</button></div></div>` : ''}</li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}</section>` : ''}
      <p class="muted">The viewer opens in its own window, so you can keep it beside the Lab or a chat. It can also open a scan saved as a file, from another Bob or anything else that writes the same file: <button type="button" class="link" data-watchopen="">Open the viewer on its own</button></p>`;
  }

  async function change(el) {
    if (el.id === 'watch-brain') { brain = el.value; msg = ''; askUnload = null; await loadBrain(); return true; }
    if (el.id === 'watch-per') { per = Number(el.value); return true; }
    if (el.id === 'watch-think') { think = el.checked; return true; }
    if (el.id === 'watch-what') { what = el.value === 'heads' ? 'heads' : ''; return true; }
    if (el.dataset?.watchskill) { if (el.checked) picked.add(el.dataset.watchskill); else picked.delete(el.dataset.watchskill); return true; }
    if (el.id === 'watch-own-name' || el.id === 'watch-own-qs') return true; // typed in input(); a change redraws the count
    return false;
  }
  function input(el) {
    if (el.id === 'watch-own-name') { ownName = el.value; return true; }
    if (el.id === 'watch-own-qs') { ownQs = el.value; return true; }
    return false;
  }
  async function click(b) {
    const d = b.dataset;
    if ('watchqs' in d) { showQs = !showQs; return 'draw'; }
    if ('watchnounload' in d) { askUnload = null; return 'draw'; }
    if ('watchdelno' in d) { confirmDel = ''; return 'draw'; }
    if ('watchopen' in d) { if (!openViewer(d.watchopen ? brain : '', d.watchopen)) msg = 'The viewer window was blocked. Allow pop-ups for Bob\'s page, then press it again.'; return 'draw'; }
    if (d.watchdel) { confirmDel = confirmDel === d.watchdel ? '' : d.watchdel; return 'draw'; }
    if (d.watchdelgo) { msg = ''; try { await api('/api/lab/watch/delete', { brain, id: d.watchdelgo }); } catch (e) { msg = e.message; } confirmDel = ''; return 'load'; }
    if ('watchgo' in d) {
      msg = '';
      try { const r = await api('/api/lab/watch/start', { brain, skills: [...picked], per, think, what, own: { name: ownName, questions: ownQs }, unload: d.watchgo === 'unload' }); askUnload = r.needUnload ? r.names : null; } catch (e) { msg = e.message; }
      return 'load';
    }
    return false;
  }
  return { load, html, change, input, click, saveTable: () => null, kind: 'watch' };
}
