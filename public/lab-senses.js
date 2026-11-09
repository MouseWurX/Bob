// 🧪 Computer Science Lab: Give it eyes / Give it ears (design: bob-design/thinking-paths.md section 16). One card in the
// Forge tab, in four steps: find a reader that fits, attach and try it here for free, sharpen it on a rented card
// (a Forge plan, started only from the Forge tab's purchase card), and measure before and after. Its own module like
// the Playground: the Lab page only places it (html) and hands over its events (change, click).
import { esc } from './rich.js';
import { newSource, sourceRowHtml, sourceEvent } from './lab-source.js'; // the Lab's one chooser: here, Hugging Face or a link

export function createSenses({ api, draw = () => {} }) {
  let sv = null, smsg = '', loading = false, match = null, matching = false, checks = {}, other = { src: newSource('hf'), res: null, busy: false, file: '' };
  let tryRes = {}, tryUp = {}, ask = null, planChk = null, savedPlan = '', poll = null;
  const pick = { brain: '', sense: 'sight' };
  const form = { run: '', sense: 'sight', way: 'heal', brainRepo: '', brainDir: '', tower: '', lessons: [], ownDir: '', hours_max: 0, dollars_max: 0 };

  async function load() { loading = true; try { sv = await api('/api/lab/senses'); smsg = ''; } catch (e) { smsg = e.message; } loading = false; watch(); }
  // While a Lab job of ours runs, look again every few seconds so the steps move.
  function watch() { if (sv?.busy && !poll) poll = setInterval(async () => { await load(); if (!sv?.busy) { clearInterval(poll); poll = null; } draw(); }, 3000); }
  const brain = (id = pick.brain) => sv?.brains.find((b) => b.id === id);
  const has = (b) => [b.sight && 'sees pictures', b.hearing && 'hears sounds'].filter(Boolean).join(' and ') || 'text only';
  const repoOf = (ref) => String(ref || '').trim().replace(/^hf:/i, '').replace(/^https:\/\/huggingface\.co\//i, '').split(/[/:@]/).slice(0, 2).join('/');
  const gb = (n) => (n || n === 0 ? `${n} GB` : 'size unknown');

  const fitHtml = (f) => !f ? '' : f.error ? `<p class="error" role="alert">${esc(f.error)}</p>`
    : f.pick ? `<p role="status">${esc(f.words)}</p>${f.pick.length ? `<label for="senses-ofile">Reader file <select id="senses-ofile"><option value="">(pick one)</option>${f.pick.map((x) => `<option value="${esc(x)}" ${other.file === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>` : ''}`
    : `<p role="status" class="${f.ok ? '' : f.unsure ? 'muted' : 'error'}">${f.ok ? '✓ ' : f.unsure ? '? ' : '✗ '}${esc(f.words)}${f.sizeGB ? ` <span class="muted">(${esc(gb(f.sizeGB))})</span>` : ''}</p>`;

  function stepFind() {
    const b = brain();
    const brains = sv.brains.map((x) => `<option value="${esc(x.id)}" ${x.id === pick.brain ? 'selected' : ''}>${esc(x.name)} · ${esc(has(x))}</option>`).join('');
    let found = '';
    if (matching) found = '<p class="muted" role="status">Looking for readers that fit…</p>';
    else if (match) {
      const want = (r) => !r.senses || r.senses[pick.sense];
      const here = match.here.filter(want);
      found = `<h5>On this replicant matrix</h5>${here.length ? `<ul class="tlist">${here.map((h) => `<li><strong>${esc(h.name)}</strong> ${fitHtml(h)}<button type="button" class="get" data-senses-attach-here="${esc(h.id)}">Attach</button></li>`).join('')}</ul>` : '<p class="muted">None of the readers here fits this brain.</p>'}
        <h5>In Bob's catalogue${b?.family ? `, ${esc(b.family)} family` : ''}</h5>${match.catalog.length ? `<ul class="tlist">${match.catalog.map((c) => `<li><strong>${esc(c.name)}</strong> <span class="muted">· ${esc(gb(c.sizeGB))}${c.license ? ` · ${esc(c.license)}` : ''}</span>
          ${checks[c.id]?.busy ? '<p class="muted" role="status">Checking its first few megabytes…</p>' : fitHtml(checks[c.id])}
          ${checks[c.id]?.ok || checks[c.id]?.unsure ? `<button type="button" class="get" data-senses-attach-cat="${esc(c.id)}">Download and attach (${esc(gb(c.sizeGB))})</button>` : `<button type="button" class="link" data-senses-check-cat="${esc(c.id)}">Check it fits</button>`}</li>`).join('')}</ul>` : '<p class="muted">The catalogue has no reader from this brain\'s family.</p>'}
        <h5>From somewhere else</h5>
        ${sourceRowHtml('senses-other', 'The reader', other.src, 'model', { placeholder: other.src.kind === 'hf' ? 'unsloth/Qwen3.6-35B-A3B-GGUF' : other.src.kind === 'local' ? 'C:\\brains\\mmproj-F16.gguf' : 'https://….gguf' })}
        <button type="button" class="get" data-senses-check-other>Check it fits</button>
        ${other.busy ? '<p class="muted" role="status">Checking…</p>' : fitHtml(other.res)}
        ${other.res && (other.res.ok || other.res.unsure) ? '<button type="button" class="get" data-senses-attach-other>Attach it</button>' : ''}
        ${!here.length && !match.catalog.length ? `<p>No relative to borrow from? ${pick.sense === 'hearing' ? 'An ear' : 'An eye'} from another family needs a new translator: see Sharpen, Train a new translator.</p>` : ''}`;
    }
    return `<section aria-labelledby="senses-1-h"><h4 id="senses-1-h">1. Find a match</h4>
      <div class="row"><label for="senses-brain">Brain</label> <select id="senses-brain"><option value="">(pick one)</option>${brains}</select></div>
      <div role="radiogroup" aria-label="Which sense">${[['sight', 'Eyes', 'Look at pictures.'], ['hearing', 'Ears', 'Hear sounds, music and tone of voice, not just words.']].map(([v, l, h]) => `<label class="lab-opt"><input type="radio" name="senses-sense" value="${v}" ${pick.sense === v ? 'checked' : ''}> <span><strong>${l}</strong><br><span class="muted">${h}</span></span></label>`).join('')}</div>
      ${pick.sense === 'hearing' ? `<p class="muted">The cheap way to hear, good for most people: my own ears and voice turn speech into words and words back into speech, with any brain. ${sv.pipeline.hearing ? 'Your ears are set up.' : 'Pick a "Hearing you" model in Get models.'} ${sv.pipeline.voice ? 'Your voice is set up.' : 'A voice is in Get models too.'} Real ears, below, also hear tone, music and sounds that aren't words.</p>` : ''}
      ${b && b[pick.sense] ? `<p class="muted">${esc(b.name)} already ${pick.sense === 'sight' ? 'sees' : 'hears'}. You can still borrow a different reader to compare.</p>` : ''}
      <button type="button" class="get" data-senses-find ${pick.brain ? '' : 'disabled'}>Find a match</button>
      ${found}</section>`;
  }

  function stepTry() {
    const pairs = sv.brains.filter((b) => b.sight || b.hearing);
    const att = sv.attached;
    if (!pairs.length) return '<section aria-labelledby="senses-2-h"><h4 id="senses-2-h">2. Attach and try</h4><p class="muted">Nothing attached yet. Attach a reader in step 1, then try it here, free.</p></section>';
    const one = (b) => {
      const mine = att.find((a) => a.id === b.id), t = tryRes[b.id], up = tryUp[b.id] || {};
      const sense = b.sight ? (up.sense || 'sight') : 'hearing';
      return `<li><strong>${esc(b.name)}</strong> <span class="muted">· ${esc(has(b))}${mine ? ` · borrowed from ${esc(mine.from)}` : ''}</span>
        <details ${t ? 'open' : ''}><summary>${esc(sense === 'hearing' ? 'Listen to a sound' : 'Look at a picture')}</summary>
          ${b.sight && b.hearing ? `<label>Try <select data-senses-trysense="${esc(b.id)}"><option value="sight" ${sense === 'sight' ? 'selected' : ''}>a picture</option><option value="hearing" ${sense === 'hearing' ? 'selected' : ''}>a sound</option></select></label>` : ''}
          <label>Your own ${sense === 'hearing' ? 'sound (WAV or MP3)' : 'picture'} <input type="file" data-senses-upload="${esc(b.id)}" accept="${sense === 'hearing' ? 'audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3' : 'image/png,image/jpeg,image/webp,image/gif'}"></label>
          <span class="muted">${up.name ? `Picked ${esc(up.name)}.` : `Or leave it empty to use one of mine.`}</span>
          <label>Question <input data-senses-q="${esc(b.id)}" maxlength="500" value="${esc(up.q || '')}" placeholder="${sense === 'hearing' ? 'What do you hear?' : 'What is in this picture?'}"></label>
          <button type="button" class="get" data-senses-try="${esc(b.id)}">Ask</button>
          ${t?.busy ? '<p class="muted" role="status">Starting the brain with its reader, then asking. This can take a minute…</p>' : t?.error ? `<p class="error" role="alert">${esc(t.error)}</p>` : t ? `<p role="status"><strong>${esc(b.name)}:</strong> ${esc(t.answer)} <span class="muted">(${t.seconds} s${t.sample ? ', my sample' : ''})</span></p>` : ''}
        </details>
        <button type="button" class="link" data-senses-measure="${esc(b.id)}">Measure</button>
        <label class="lab-opt"><input type="checkbox" data-senses-noeyes="${esc(b.id)}" ${b.noEyes ? 'checked' : ''}> <span>Load without eyes and ears <span class="muted">(saves about the reader's size on the card, for more room to remember)</span></span></label>
        ${mine ? `<button type="button" class="link" data-senses-forget="${esc(b.id)}">Take it out of Bob</button>` : ''}</li>`;
    };
    return `<section aria-labelledby="senses-2-h"><h4 id="senses-2-h">2. Attach and try</h4><p class="muted">An attached pair is a brain of its own in Bob, next to its family. Borrowed eyes can see a bit blurry at first.</p><ul class="tlist">${pairs.map(one).join('')}</ul></section>`;
  }

  function stepSharpen() {
    const ways = sv.ways.map((w) => `<label class="lab-opt"><input type="radio" name="senses-way" value="${w.id}" ${form.way === w.id ? 'checked' : ''}> <span><strong>${esc(w.title)}</strong> <span class="muted">· about ${w.hours} hours on a rented card</span><br><span class="muted">${esc(w.what)}</span></span></label>`).join('');
    const lessons = form.lessons.map((l) => `<li>${esc(l.label)} <button type="button" class="link" data-senses-rmlesson="${esc(l.key)}">Remove</button></li>`).join('');
    return `<section aria-labelledby="senses-3-h"><h4 id="senses-3-h">3. Sharpen (rented)</h4>
      <p class="muted">Writes a Forge plan. It starts only from the Forge's purchase card, with the hours and dollars you type.${sv.forgeReady ? '' : ' The Forge can\'t teach a brain to see or hear yet, so a plan saved now waits for the Forge update.'}</p>
      <label>Run name <input id="senses-run" maxlength="40" value="${esc(form.run)}" placeholder="riker-eyes"></label>
      <div role="radiogroup" aria-label="Eyes or ears">${[['sight', 'Eyes'], ['hearing', 'Ears']].map(([v, l]) => `<label class="lab-opt"><input type="radio" name="senses-fsense" value="${v}" ${form.sense === v ? 'checked' : ''}> <span>${l}</span></label>`).join('')}</div>
      <fieldset><legend>How</legend>${ways}</fieldset>
      <fieldset><legend>The brain's full-size weights</legend><p class="muted">The rented card teaches full-size weights, not the running file here.</p>
        <label>On Hugging Face <input id="senses-brainrepo" maxlength="400" value="${esc(form.brainRepo)}" placeholder="owner/name"></label>
        <label>Or its folder on the Forge's disk <input id="senses-braindir" maxlength="200" value="${esc(form.brainDir)}" placeholder="/workspace/bobs/28Bob"></label></fieldset>
      <label>${form.way === 'heal' ? `Where the ${form.sense === 'hearing' ? 'ear' : 'eye'} and translator come from, full size, on Hugging Face` : `The ready-made ${form.sense === 'hearing' ? 'ear' : 'eye'} on Hugging Face`} <input id="senses-tower" maxlength="400" value="${esc(form.tower)}" placeholder="${form.sense === 'hearing' ? 'openai/whisper-large-v3' : 'Qwen/Qwen3.6-35B-A3B'}"></label>
      <fieldset><legend>Lessons</legend><ul class="tlist">${lessons || '<li class="muted">None yet.</li>'}</ul>
        <button type="button" class="link" data-senses-builtin>Add my built-in set (${sv.builtinLessons} plain ${form.sense === 'hearing' ? 'sounds' : 'pictures'} with captions)</button>
        <div class="row"><label for="senses-owndir">A folder of your own: ${form.sense === 'hearing' ? 'sounds' : 'pictures'}, each with a .txt caption of the same name</label> <input id="senses-owndir" maxlength="400" value="${esc(form.ownDir)}"> <button type="button" class="link" data-senses-owndir>Add it</button></div></fieldset>
      <label class="forge-num">Hours you'll allow <input id="senses-hours" type="number" min="0" max="200" step="1" value="${form.hours_max}"></label>
      <label class="forge-num">Dollars you'll allow <input id="senses-dollars" type="number" min="0" max="2000" step="1" value="${form.dollars_max}"></label>
      ${planChk ? `${planChk.problems.length ? `<ul class="error" role="alert">${planChk.problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<ul class="muted">${planChk.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <button type="button" class="get" data-senses-save ${planChk && !planChk.problems.length ? '' : 'disabled'}>Save the plan</button>
      ${savedPlan ? `<p role="status">Saved as ${esc(savedPlan)}. It's in the Forge's saved plans.</p>` : ''}</section>`;
  }

  function stepMeasure() {
    const m = [...(sv.measures || [])].reverse();
    return `<section aria-labelledby="senses-4-h"><h4 id="senses-4-h">4. Measure</h4>
      <p class="muted">My picture pack (14 plain pictures) or sound pack (6 sounds), then the Lab's quick quiz, so you can see the text didn't slip. Run it after you attach and again after you sharpen. Scores are out of 100, temperature 0.</p>
      ${m.length ? `<table class="lab-report"><tr><th scope="col">Brain</th><th scope="col">When</th><th scope="col">Pictures</th><th scope="col">Sounds</th><th scope="col">Quick quiz</th></tr>${m.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td>${esc(r.when)}</td><td>${r.packs.sight ? r.packs.sight.score : '-'}</td><td>${r.packs.hearing ? r.packs.hearing.score : '-'}</td><td>${r.quiz ?? '-'}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing measured yet. Press Measure next to a brain in step 2.</p>'}</section>`;
  }

  function html() {
    if (!sv) { if (!loading) load().then(draw); return '<section class="forge-senses" id="lab-senses"><h3>Give it eyes, give it ears</h3><p class="muted">Loading…</p></section>'; }
    return `<section class="forge-senses" id="lab-senses" aria-labelledby="senses-h"><h3 id="senses-h">Give it eyes, give it ears</h3>
      <p>A brain that sees is a text brain plus a small reader file: an eye, and a tiny translator that turns what the eye saw into the brain's own kind of words. Ears are the same with an ear. Taking them out is just not loading that file. Adding them is borrowing a reader from a relative, trying it here for free, and sharpening it on a rented card if it's blurry.</p>
      <details><summary>Honest limits</summary><ul><li>Eyes cost memory: about 1 GB on the card for a common eye, and a little time for every picture.</li><li>A reader only fits a brain from the same family, at the same size. One from another family needs a new translator (rented).</li><li>Handhelds can carry a small eye, not a big one.</li><li>A brain that was cut hard may need a longer sharpen to see well.</li><li>Speaking out loud is a different thing: my voice reads the words aloud.</li></ul></details>
      ${ask ? `<div class="lab-ask" role="alertdialog" aria-labelledby="senses-ask-h"><p id="senses-ask-h">${esc(ask.names.join(', '))} ${ask.names.length === 1 ? 'is' : 'are'} on the graphics card. Unload to make room?</p><button type="button" class="get" data-senses-unload>Unload and go</button> <button type="button" class="link" data-senses-nounload>Not now</button></div>` : ''}
      ${sv.busy ? '<p class="muted" role="status">The Lab is working on a job. Its steps are in Lab jobs.</p>' : ''}
      ${stepFind()}${stepTry()}${stepSharpen()}${stepMeasure()}
      ${smsg ? `<p class="error" role="alert">${esc(smsg)}</p>` : ''}</section>`;
  }

  // Send a job; if Bob's own brain is on the card, ask first, then send again with unload.
  async function job(url, body) {
    try { const r = await api(url, body); if (r?.needUnload) { ask = { url, body, names: r.names }; return null; } return r; } catch (e) { smsg = e.message; return null; }
  }
  const fileB64 = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = () => no(new Error('That file couldn\'t be read.')); r.readAsDataURL(f); });
  const formOut = () => ({ ...form, lessons: form.lessons.map((l) => (l.file ? { file: l.file } : { dir: l.dir })) });
  async function recheck() { try { planChk = await api('/api/lab/senses/plan', { form: formOut() }); } catch (e) { smsg = e.message; } savedPlan = ''; }

  async function change(el) {
    if (!el.closest?.('#lab-senses')) return false;
    smsg = '';
    if (el.id === 'senses-brain') { pick.brain = el.value; match = null; checks = {}; other.res = null; return 'draw'; }
    if (el.name === 'senses-sense') { pick.sense = el.value; return 'draw'; }
    if (el.dataset?.src === 'senses-other') { const d2 = await sourceEvent(el, other.src, lookHf); other.res = null; other.file = ''; return d2 ? 'draw' : true; }
    if (el.id === 'senses-ofile') { other.file = el.value; if (other.file) { other.busy = true; draw(); await checkOther(`hf:${repoOf(other.src.value)}:${other.file}`); } return 'draw'; }
    if (el.dataset.sensesUpload) { const id = el.dataset.sensesUpload, f = el.files?.[0]; tryUp[id] = { ...(tryUp[id] || {}) }; if (f) { if (f.size > 12 * 1024 * 1024) { smsg = 'That file is too big. Pick one under 12 MB.'; return 'draw'; } tryUp[id].b64 = await fileB64(f); tryUp[id].name = f.name; } return 'draw'; }
    if (el.dataset.sensesQ) { tryUp[el.dataset.sensesQ] = { ...(tryUp[el.dataset.sensesQ] || {}), q: el.value }; return true; }
    if (el.dataset.sensesTrysense) { tryUp[el.dataset.sensesTrysense] = { ...(tryUp[el.dataset.sensesTrysense] || {}), sense: el.value, b64: '', name: '' }; return 'draw'; }
    if (el.dataset.sensesNoeyes) { try { await api('/api/lab/senses/noeyes', { brain: el.dataset.sensesNoeyes, on: el.checked }); await load(); } catch (e) { smsg = e.message; } return 'draw'; }
    const f = { 'senses-run': 'run', 'senses-brainrepo': 'brainRepo', 'senses-braindir': 'brainDir', 'senses-tower': 'tower', 'senses-owndir': 'ownDir' }[el.id];
    if (f) form[f] = el.value;
    else if (el.name === 'senses-fsense') { form.sense = el.value; form.lessons = []; }
    else if (el.name === 'senses-way') form.way = el.value;
    else if (el.id === 'senses-hours') form.hours_max = Number(el.value) || 0;
    else if (el.id === 'senses-dollars') form.dollars_max = Number(el.value) || 0;
    else return false;
    await recheck();
    return 'draw';
  }
  const lookHf = (x) => api('/api/lab/forge/hf', { ref: x.value, kind: 'model' });
  async function checkOther(source) {
    other.busy = true;
    try { other.res = await api('/api/lab/senses/check', { brain: pick.brain, source }); } catch (e) { other.res = { error: e.message }; }
    other.busy = false;
  }

  async function click(b) {
    if (!b.closest?.('#lab-senses')) return false;
    const d = b.dataset; smsg = '';
    if ('sensesFind' in d) { matching = true; draw(); try { match = await api('/api/lab/senses/match', { brain: pick.brain }); } catch (e) { smsg = e.message; match = null; } matching = false; return 'draw'; }
    if (d.sensesCheckCat) { const id = d.sensesCheckCat; checks[id] = { busy: true }; draw(); try { checks[id] = await api('/api/lab/senses/check', { brain: pick.brain, catalog: id }); } catch (e) { checks[id] = { error: e.message }; } return 'draw'; }
    if (d.src === 'senses-other') { await sourceEvent(b, other.src, lookHf); return 'draw'; }
    if ('sensesCheckOther' in d) { const inp = document.getElementById('senses-other-value'); if (inp) other.src.value = inp.value; other.file = ''; draw(); await checkOther(other.src.value); return 'draw'; }
    const attachBody = d.sensesAttachHere ? { here: d.sensesAttachHere } : d.sensesAttachCat ? { catalog: d.sensesAttachCat } : 'sensesAttachOther' in d ? { source: other.file ? `hf:${repoOf(other.src.value)}:${other.file}` : other.src.value } : null;
    if (attachBody) { const r = await job('/api/lab/senses/attach', { brain: pick.brain, ...attachBody }); if (r) { match = null; await load(); } return 'draw'; }
    if (d.sensesTry) {
      const id = d.sensesTry, up = tryUp[id] || {};
      const bb = brain(id), sense = bb?.sight ? (up.sense || 'sight') : 'hearing';
      tryRes[id] = { busy: true }; draw();
      const r = await job('/api/lab/senses/try', { brain: id, sense, upload: up.b64 || '', question: up.q || '' });
      if (r) tryRes[id] = r; else delete tryRes[id];
      if (!r && smsg) tryRes[id] = { error: smsg };
      return 'draw';
    }
    if (d.sensesMeasure) { const r = await job('/api/lab/senses/measure', { brain: d.sensesMeasure }); if (r) await load(); return 'draw'; }
    if (d.sensesForget) { try { await api('/api/lab/senses/forget', { id: d.sensesForget }); await load(); } catch (e) { smsg = e.message; } return 'draw'; }
    if ('sensesUnload' in d && ask) { const a = ask; ask = null; const r = await job(a.url, { ...a.body, unload: true }); if (r?.answer !== undefined) tryRes[a.body.brain] = r; await load(); return 'draw'; }
    if ('sensesNounload' in d) { if (ask?.url.endsWith('/try')) delete tryRes[ask.body.brain]; ask = null; return 'draw'; }
    if ('sensesBuiltin' in d) { try { const r = await api('/api/lab/senses/lessons', { sense: form.sense }); const key = `b-${form.sense}`; if (!form.lessons.some((l) => l.key === key)) form.lessons.push({ key, file: r.file, label: `My built-in set, ${r.count} ${form.sense === 'hearing' ? 'sounds' : 'pictures'}` }); } catch (e) { smsg = e.message; } await recheck(); return 'draw'; }
    if ('sensesOwndir' in d) { try { const r = await api('/api/lab/senses/lessons', { sense: form.sense, dir: form.ownDir }); const key = `d-${r.dir}`; if (!form.lessons.some((l) => l.key === key)) form.lessons.push({ key, dir: r.dir, label: `Your folder ${r.dir}, ${r.count} with captions` }); } catch (e) { smsg = e.message; } await recheck(); return 'draw'; }
    if (d.sensesRmlesson) { form.lessons = form.lessons.filter((l) => l.key !== d.sensesRmlesson); await recheck(); return 'draw'; }
    if ('sensesSave' in d) { try { const r = await api('/api/lab/senses/save', { form: formOut() }); savedPlan = r.file; } catch (e) { smsg = e.message; } return 'draw'; }
    return false;
  }
  return { html, change, click, reload: load };
}
