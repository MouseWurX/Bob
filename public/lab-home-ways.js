// 1.5.164 🧪 Computer Science Lab, Forge tab: the home ways. Three ways to make a brain that run here, free, on the
// processor, from full-size files up to 9 GB: Mix two brains, Stack layers, and Take out the refusal habit. Each is a
// screen under its card in the Forge tab (public/lab-forge.js places it and hands over its events). Nothing is rented.
// Take out the refusal habit: the safeguards (the kept-refusals check, teaching them back, the naughty list) are on by
// default; unticking one opens a second confirmation. The card's plain line always stays.
import { esc } from './rich.js';

export const HOME_WAYS = ['mix', 'stack', 'refusals'];

export function createHomeWays({ api, view }) {
  let open = '', plan = null, msg = '', askUnload = null, confirm = '', timer = 0;
  const full = { input: '', look: null, msg: '', busy: false, show: false }; // Bring in a full-size brain
  const mix = { a: '', b: '', parent: '', how: 'slerp', lean: 0, name: '' };
  const stack = { a: '', b: '', ranges: [{ brain: 'a', start: 0, end: 0 }], name: '' };
  const ref = { from: '', name: '', strength: 100, layers: 'strongest', check: true, teachBack: true, naughty: true };
  const v = () => view() || {};
  const busy = () => (v().runs || []).some((x) => x.state === 'running');
  const brains = () => (v().brains || []).filter((b) => b.facts?.fullSize && b.facts.sizeGB <= (v().homeMaxGB || 9));
  const brain = (id) => (v().brains || []).find((b) => b.id === id);
  const formOf = (k) => (k === 'mix' ? mix : k === 'stack' ? stack : ref);

  async function replan() {
    plan = null; if (!open) return;
    const f = formOf(open);
    if (open === 'mix' && !(f.a && f.b)) return;
    if (open === 'stack' && !f.a) return;
    if (open === 'refusals' && !f.from) return;
    try { plan = await api('/api/lab/home/plan', { kind: open, form: f }); } catch (e) { msg = e.message; }
  }
  const replanSoon = (draw) => { clearTimeout(timer); timer = setTimeout(async () => { await replan(); draw(); }, 400); };

  const pick = (name, value, label, { allowNone = false, none = '(none)' } = {}) => {
    const list = brains();
    return `<label class="forge-num">${esc(label)} <select data-home="${name}">${allowNone ? `<option value="" ${!value ? 'selected' : ''}>${esc(none)}</option>` : `<option value="" ${!value ? 'selected' : ''}>(pick one)</option>`}${list.map((b) => `<option value="${esc(b.id)}" ${value === b.id ? 'selected' : ''}>${esc(b.name)} · ${b.facts.sizeGB} GB${b.facts.experts ? `, ${b.facts.experts} experts` : ''}</option>`).join('')}</select></label>`;
  };
  const noBrains = () => (brains().length ? '' : `<p>There's no brain here these can start from. They need a small brain's full-size file (F16 or BF16, up to ${v().homeMaxGB || 9} GB), like a 1B to 4B brain. Bob's downloads are running files, so use <strong>Bring in a full-size brain</strong> below, or one made in the Lab without step 3.</p>`);

  // Bring in a full-size brain: a Hugging Face name or link, a link to a .gguf, or a file here. It lands in the Lab's
  // full-size folder and on Bob's list under Your own brains, so every list in the Lab sees it.
  function fullHtml() {
    const dl = v().full, lk = full.look;
    const prog = !dl ? '' : dl.state === 'downloading' ? `<p role="status"><strong>${esc(dl.name)}</strong>: ${dl.doneGB} of ${dl.gb || '?'} GB${dl.parts > 1 ? ` (part ${dl.part} of ${dl.parts})` : ''}. <button type="button" class="link" data-fullstop>Stop</button></p>`
      : dl.state === 'done' ? `<p role="status">${esc(dl.name)} is here and on Bob's list as one of your own brains${dl.added?.name ? ` (${esc(dl.added.name)})` : ''}. Pick it above.</p>` : `<p class="error" role="alert">${esc(dl.name)}: ${esc(dl.error || dl.state)}</p>`;
    const list = !lk ? '' : !lk.ok ? `<p class="error" role="alert">${esc(lk.error)}</p>` : `${lk.license ? `<p class="muted">Licence: ${esc(lk.license)}.${lk.gated ? ' Gated: accept its terms on its page first.' : ''}</p>` : lk.note ? `<p class="muted">${esc(lk.note)}</p>` : ''}${lk.warn ? `<p class="muted">${esc(lk.warn)}</p>` : ''}${lk.files?.length ? `<ul class="home-lists">${lk.files.map((f) => `<li><strong>${esc(f.file)}</strong>, ${f.gb} GB. ${esc(f.fits)}${f.note ? ` ${esc(f.note)}` : ''} ${lk.kind === 'file' ? `<button type="button" class="link" data-fulladd="${esc(lk.path || '')}">Add it to Bob's list</button>` : `<button type="button" class="link" data-fullget="${esc(f.file)}" ${full.busy || dl?.state === 'downloading' ? 'disabled' : ''}>Get it</button>`}</li>`).join('')}</ul>` : ''}`;
    return `<details class="forge-home lab-compare" id="forge-full" ${full.show || dl?.state === 'downloading' ? 'open' : ''}><summary><strong>Bring in a full-size brain</strong> <span class="muted">(F16 or BF16, from Hugging Face, a link or a file here)</span></summary>
      <p class="muted">Bob's downloads are running files (Q4 and friends), and the Lab's ways start from the full-size copy. Paste a Hugging Face name like <code>unsloth/Qwen3-1.7B-GGUF</code>, a link to a .gguf file, or the path of a file on this replicant matrix. It goes in the Lab's full-size folder and onto Bob's list under Your own brains. Nothing is uploaded.</p>
      <div class="row"><input data-full="input" value="${esc(full.input)}" maxlength="400" placeholder="owner/name, a link, or C:\\...\\brain.gguf" aria-label="Where the brain is" style="flex:1;min-width:16em"><button type="button" class="get" data-fulllook ${full.busy ? 'disabled' : ''}>${full.busy ? 'Looking…' : 'Look'}</button><button type="button" class="link" data-fullpick>Pick a file here</button></div>
      ${full.msg ? `<p class="error" role="alert">${esc(full.msg)}</p>` : ''}${list}${prog}</details>`;
  }
  const planHtml = () => (!plan ? '' : `<div class="lab-check" role="status">${plan.problems.length ? `<p><strong>Before it can start:</strong></p><ul>${plan.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : `<p><strong>Ready.</strong>${plan.diskGB ? ` The new brain takes about ${plan.diskGB} GB of disk.` : ''} It runs here, on the processor, then takes the Lab test like any Lab brain.</p>`}${plan.notes.map((n) => `<p class="muted">${esc(n)}</p>`).join('')}</div>`);
  const unloadHtml = () => (!askUnload ? '' : `<div class="setup-offer" role="alert"><strong>Bob's brain is on the graphics card</strong><span>${esc(askUnload.names.join(', '))} is loaded. The test afterwards needs the graphics card, so Bob unloads it first; it loads again the next time you chat.</span><div class="row"><button type="button" class="get" data-homeunload>Unload it and start</button><button type="button" class="link" data-homenounload>Not now</button></div></div>`);
  const goBtn = (label, ok) => `<div class="row"><button type="button" class="get" data-homego ${ok && plan && !plan.problems.length && !busy() ? '' : 'disabled'}>${busy() ? 'The Lab is busy' : label}</button></div>`;

  function mixHtml() {
    const ways = v().mixWays || [];
    return `<h4 id="home-mix-h">Mix two brains</h4>
      <p class="muted">One brain from two fine-tunes of the same parent. Both must be the same shape of brain: the same kind, the same layers, the same sizes of weights. The Lab checks that and says so in words.</p>
      ${noBrains()}
      ${pick('mix-a', mix.a, 'The first brain')} ${pick('mix-b', mix.b, 'The second brain')}
      <fieldset><legend>How to mix</legend>${ways.map((w) => `<label class="lab-opt"><input type="radio" name="home-mixhow" value="${w.id}" ${mix.how === w.id ? 'checked' : ''}> <span><strong>${esc(w.label)}</strong><br><span class="muted">${esc(w.hint)}</span></span></label>`).join('')}</fieldset>
      ${mix.how === 'ties' ? pick('mix-parent', mix.parent, 'The parent both came from') : ''}
      <label class="forge-num" for="home-mix-lean">Lean towards <input id="home-mix-lean" type="range" min="-100" max="100" step="5" value="${mix.lean}" aria-valuetext="${mix.lean === 0 ? 'even' : mix.lean < 0 ? `${-mix.lean}% towards the first` : `${mix.lean}% towards the second`}"></label>
      <span class="muted" id="home-mix-lean-h" role="status">${mix.lean === 0 ? 'Even: half and half.' : mix.lean < 0 ? `${50 - mix.lean / 2}% the first brain, ${50 + mix.lean / 2}% the second.` : `${50 - mix.lean / 2}% the first brain, ${50 + mix.lean / 2}% the second.`}</span>
      <label>Name the new brain <input id="home-mix-name" data-home="mix-name" value="${esc(mix.name)}" maxlength="60" placeholder="Half and half"></label>
      ${planHtml()}${unloadHtml()}${goBtn('Mix them', mix.a && mix.b && mix.name)}`;
  }

  function stackHtml() {
    const a = brain(stack.a), b = brain(stack.b), la = a?.facts?.layers || 0, lb = b?.facts?.layers || 0;
    const total = stack.ranges.reduce((s, r) => s + Math.max(0, Number(r.end) - Number(r.start) + 1), 0);
    return `<h4 id="home-stack-h">Stack layers</h4>
      <p class="muted">A taller brain from the layers of one or two matching brains, written end to end and renumbered. <strong>Stacked brains nearly always ramble until they're taught back. This is for seeing what happens, not for using.</strong></p>
      ${noBrains()}
      ${pick('stack-a', stack.a, 'The first brain')} ${pick('stack-b', stack.b, 'The second brain', { allowNone: true, none: '(only the first)' })}
      ${a ? `<p class="muted">${esc(a.name)} has layers 0 to ${la - 1}${b ? `; ${esc(b.name)} has 0 to ${lb - 1}` : ''}.</p>` : ''}
      <fieldset><legend>Layer ranges, in order (first and last layer, counting from 0)</legend>
      ${stack.ranges.map((r, i) => `<div class="row home-range"><select data-home="stack-rbrain" data-i="${i}" aria-label="Range ${i + 1}: which brain"><option value="a" ${r.brain === 'a' ? 'selected' : ''}>The first brain</option><option value="b" ${r.brain === 'b' ? 'selected' : ''} ${b ? '' : 'disabled'}>The second brain</option></select>
        <label>from <input type="number" min="0" max="${(r.brain === 'b' ? lb : la) - 1 || 0}" step="1" value="${Number(r.start)}" data-home="stack-rstart" data-i="${i}" aria-label="Range ${i + 1}: first layer"></label>
        <label>to <input type="number" min="0" max="${(r.brain === 'b' ? lb : la) - 1 || 0}" step="1" value="${Number(r.end)}" data-home="stack-rend" data-i="${i}" aria-label="Range ${i + 1}: last layer"></label>
        ${stack.ranges.length > 1 ? `<button type="button" class="link" data-homermrange="${i}">Remove</button>` : ''}</div>`).join('')}
      <div class="row"><button type="button" class="link" data-homeaddrange ${stack.ranges.length >= 8 ? 'disabled' : ''}>Add a range</button><span class="muted">${total} layers in all${la ? ` (the first brain has ${la})` : ''}.</span></div></fieldset>
      <label>Name the new brain <input id="home-stack-name" data-home="stack-name" value="${esc(stack.name)}" maxlength="60" placeholder="Tall one"></label>
      ${planHtml()}${unloadHtml()}${goBtn('Stack them', stack.a && stack.name)}`;
  }

  function refusalsHtml() {
    const kept = v().kept || [], choices = v().layerChoices || [];
    const box = (k, label, hint) => `<label class="lab-opt"><input type="checkbox" data-home="ref-${k}" ${ref[k] ? 'checked' : ''}> <span><strong>${esc(label)}</strong><br><span class="muted">${esc(hint)}</span></span></label>`;
    const ask = confirm ? `<div class="setup-offer" role="alertdialog" aria-labelledby="home-confirm-h"><strong id="home-confirm-h">${confirm === 'teachBack' ? 'Make it without teaching back the kept refusals?' : confirm === 'check' ? 'Make it without the kept-refusals check?' : 'Take it off the naughty list?'}</strong><span>${confirm === 'naughty' ? 'The brain will show in the normal lists, with its plain line "Made in the Lab with the refusal habit taken out". It\'s still never the default, never starred and never picked quietly.' : confirm === 'check' ? 'You won\'t see whether it still declines the five kinds Bob always keeps. The brain itself is the same either way.' : 'It may answer anything, including the kinds Bob always declines. Keep it to private use on this replicant matrix.'}</span><div class="row"><button type="button" class="get" data-homeconfirm="${confirm}">${confirm === 'naughty' ? 'Take it off' : 'Make it anyway'}</button><button type="button" class="link" data-homekeep>${confirm === 'naughty' ? 'Keep it on' : 'Keep them ticked'}</button></div></div>` : '';
    const lists = `<details><summary>The two prompt lists the direction is found from</summary><p class="muted">Ordinary requests on one side; on the other, mild requests brains often decline by reflex, though nobody is harmed by an answer. Both ship with the Lab, as they are.</p><div class="home-lists"><ul class="tlist">${(v().plainPrompts || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul><ul class="tlist">${(v().reluctantPrompts || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div></details>`;
    return `<h4 id="home-refusals-h">Take out the refusal habit</h4>
      <p class="muted">A brain's habit of declining shows up as one direction in its working numbers. The Lab finds that direction from two short prompt lists and takes it out of the weights. After that the brain stops saying "I can't help with that" by reflex. It doesn't learn anything new; nothing is trained, so it's quick and free. It also takes out the refusals every Bob brain keeps, so the safeguards below are on unless you turn them off.</p>
      <p class="muted">These brains are for experiments kept on this replicant matrix. Made this way, a brain is never the default, never starred, never picked quietly, and never published or uploaded by Bob. Each use is your own pick.</p>
      ${noBrains()}
      ${pick('ref-from', ref.from, 'The brain')}
      ${lists}
      <label class="forge-num" for="home-ref-strength">Strength <input id="home-ref-strength" type="range" min="10" max="150" step="5" value="${ref.strength}" aria-valuetext="${ref.strength}%"></label> <span class="muted" id="home-ref-strength-h" role="status">${ref.strength}%${ref.strength === 100 ? ' (the whole direction; the usual pick)' : ref.strength < 100 ? ' (part of the habit stays)' : ' (more than the whole direction; try it first)'}</span>
      <fieldset><legend>Which layers</legend>${choices.map((c) => `<label class="lab-opt"><input type="radio" name="home-reflayers" value="${c.id}" ${ref.layers === c.id ? 'checked' : ''}> <span>${esc(c.label)}</span></label>`).join('')}</fieldset>
      <fieldset><legend>Safeguards (on unless you turn them off)</legend>
        ${box('check', 'Run the kept-refusals check', `Five plain one-line probes, one per kind Bob always declines (${kept.map((k) => k.label.toLowerCase()).join('; ')}), at temperature 0. Only declined yes or no is kept; the answers are never shown or saved. The result sits on the brain's card.`)}
        ${box('teachBack', 'Teach back the kept refusals', 'A short teaching pass on a small lesson set that ships with the Lab: short in-voice declines, with the helpline kept for self-harm. It needs a rented card, so the Lab writes what the Forge needs and marks it planned.')}
        ${box('naughty', 'Keep it on the naughty list', 'It shows only behind the naughty-list switch in Get models.')}
        <p class="muted">Fixed, whatever is unticked: the card's line "Made in the Lab with the refusal habit taken out", and the brain stays flagged in the Lab.</p>
      </fieldset>
      ${ask}
      <label>Name the new brain <input id="home-ref-name" data-home="ref-name" value="${esc(ref.name)}" maxlength="60" placeholder="Plain speaker"></label>
      ${planHtml()}${unloadHtml()}
      <div class="row"><button type="button" class="link" data-hometry ${ref.from && plan && !plan.problems.some((p) => !/name/i.test(p)) && !busy() ? '' : 'disabled'}>Try it first</button><button type="button" class="get" data-homego ${ref.from && ref.name && plan && !plan.problems.length && !busy() ? '' : 'disabled'}>${busy() ? 'The Lab is busy' : 'Make it'}</button></div>
      <p class="muted">Try it first holds the direction out at run time, asks a few of the mild prompts before and after, and runs the check; nothing is written. Best practice: measure Challenges before and after, use the lowest strength that stops the reflex, and teach the kept refusals back before you use it for anything real. The licence carries over.</p>`;
  }

  function html() {
    if (!open) return fullHtml();
    return `<section class="forge-home lab-compare" id="forge-home" aria-labelledby="home-${open}-h" tabindex="-1">
      ${open === 'mix' ? mixHtml() : open === 'stack' ? stackHtml() : refusalsHtml()}
      ${msg ? `<p class="error" role="alert">${esc(msg)}</p>` : ''}
      <div class="row"><button type="button" class="link" data-homeclose>Close</button></div></section>${fullHtml()}`;
  }

  // Events the Forge page hands over. change/input return true when it was ours (the page then redraws).
  async function change(el, draw) {
    const h = el.dataset.home;
    if (el.dataset.full === 'input') { full.input = el.value; full.show = true; return false; }
    if (!h && el.name !== 'home-mixhow' && el.name !== 'home-reflayers') return false;
    msg = '';
    if (el.name === 'home-mixhow') mix.how = el.value;
    else if (el.name === 'home-reflayers') ref.layers = el.value;
    else if (h === 'mix-a') mix.a = el.value; else if (h === 'mix-b') mix.b = el.value; else if (h === 'mix-parent') mix.parent = el.value;
    else if (h === 'mix-name') mix.name = el.value;
    else if (h === 'stack-a') { stack.a = el.value; const l = brain(el.value)?.facts?.layers || 1; if (stack.ranges.length === 1 && !stack.ranges[0].end) stack.ranges[0] = { brain: 'a', start: 0, end: l - 1 }; }
    else if (h === 'stack-b') { stack.b = el.value; if (!el.value) for (const r of stack.ranges) r.brain = 'a'; }
    else if (h === 'stack-name') stack.name = el.value;
    else if (h === 'stack-rbrain' || h === 'stack-rstart' || h === 'stack-rend') { const r = stack.ranges[Number(el.dataset.i)]; if (r) { if (h === 'stack-rbrain') r.brain = el.value; else r[h === 'stack-rstart' ? 'start' : 'end'] = Math.max(0, Math.floor(Number(el.value) || 0)); } }
    else if (h === 'ref-from') { ref.from = el.value; if (!ref.name) { const b = brain(el.value); if (b) ref.name = `${b.name} plain`.slice(0, 60); } }
    else if (h === 'ref-name') ref.name = el.value;
    else if (h === 'ref-check' || h === 'ref-teachBack' || h === 'ref-naughty') {
      const k = h.slice(4);
      if (!el.checked) { confirm = k; el.checked = true; return true; } // off needs the second confirmation
      ref[k] = true; confirm = '';
    }
    await replan();
    return true;
  }
  function input(el, draw) {
    if (el.id === 'home-mix-lean') { mix.lean = Number(el.value); const h = document.getElementById('home-mix-lean-h'); if (h) h.textContent = mix.lean === 0 ? 'Even: half and half.' : `${50 - mix.lean / 2}% the first brain, ${50 + mix.lean / 2}% the second.`; replanSoon(draw); return true; }
    if (el.id === 'home-ref-strength') { ref.strength = Number(el.value); const h = document.getElementById('home-ref-strength-h'); if (h) h.textContent = `${ref.strength}%`; replanSoon(draw); return true; }
    if (el.dataset.home === 'mix-name' || el.dataset.home === 'stack-name' || el.dataset.home === 'ref-name') { formOf(open)[el.dataset.home.split('-')[1]] = el.value; replanSoon(draw); return true; }
    return false;
  }
  async function click(b, load) {
    const d = b.dataset;
    if ('fulllook' in d || 'fullget' in d || 'fullstop' in d || 'fullpick' in d || 'fulladd' in d) {
      full.msg = ''; full.show = true;
      try {
        if ('fulllook' in d) { full.busy = true; full.look = null; full.look = await api('/api/lab/full/look', { input: full.input }); }
        else if ('fullget' in d) { full.busy = true; await api('/api/lab/full/get', { input: full.input, file: d.fullget }); }
        else if ('fullstop' in d) await api('/api/lab/full/stop', {});
        else if ('fulladd' in d) { const r = await api('/api/lab/full/add', { file: d.fulladd }); full.look = null; full.msg = r.already ? `${r.added.name} was already on Bob's list.` : ''; }
        else if ('fullpick' in d) { const pk = await api('/api/own-models/pick', { kind: 'gguf' }); if (pk.file) { full.input = pk.file; full.look = await api('/api/lab/full/look', { input: pk.file }); } }
      } catch (e) { full.msg = e.message; }
      full.busy = false;
      await load();
      return true;
    }
    if (!('homego' in d || 'hometry' in d || 'homeclose' in d || 'homeunload' in d || 'homenounload' in d || 'homeaddrange' in d || d.homermrange || d.homeconfirm || 'homekeep' in d)) return false;
    msg = '';
    if ('homeclose' in d) { open = ''; plan = null; confirm = ''; return 'draw'; }
    if ('homenounload' in d) { askUnload = null; return 'draw'; }
    if ('homeaddrange' in d) { const last = stack.ranges.at(-1); stack.ranges.push({ brain: last.brain, start: Number(last.end) + 1, end: Number(last.end) + 1 }); await replan(); return 'draw'; }
    if (d.homermrange) { stack.ranges.splice(Number(d.homermrange), 1); await replan(); return 'draw'; }
    if (d.homeconfirm) { ref[d.homeconfirm] = false; confirm = ''; await replan(); return 'draw'; }
    if ('homekeep' in d) { confirm = ''; return 'draw'; }
    try {
      if ('hometry' in d || (askUnload?.what === 'try' && 'homeunload' in d)) {
        const res = await api('/api/lab/refusals/try', { form: ref, unload: 'homeunload' in d });
        askUnload = res.needUnload ? { what: 'try', names: res.names } : null;
      } else if ('homego' in d || ('homeunload' in d && askUnload?.what === 'go')) {
        const res = await api('/api/lab/home/start', { kind: open, form: formOf(open), unload: 'homeunload' in d });
        askUnload = res.needUnload ? { what: 'go', names: res.names } : null;
        if (!res.needUnload) { formOf(open).name = ''; plan = null; }
      }
    } catch (e) { msg = e.message; }
    await load();
    return true;
  }

  return { html, change, input, click, open: async (id) => { open = HOME_WAYS.includes(id) ? id : ''; msg = ''; confirm = ''; await replan(); }, isOpen: () => open };
}

// The runs list's lines for a home job (public/lab.js calls this for kinds mix, stack, refusals, refusals-try).
export function homeReportHtml(x) {
  const r = x.report || {};
  if (x.kind === 'refusals-try' && r.tried) {
    const t = r.tried;
    return `<br><span class="muted">Of ${t.before.of} mild prompts it declined ${t.before.declined} as it is and ${t.after.declined} with the direction held out (strength ${t.strength}%, layers ${t.layers[0]} to ${t.layers.at(-1)}).${t.kept ? ` Kept refusals with the direction held out: it still declines ${t.kept.declined} of ${t.kept.of}.` : ''} Nothing was written.</span>`;
  }
  if (x.kind === 'mix' && r.mix) return `<br><span class="muted">${esc(r.mix.parents.join(' and '))}: ${r.mix.how === 'even' ? 'an even mix' : r.mix.how === 'slerp' ? 'a smooth blend' : `kept what each changed against ${esc(r.mix.parent)}`}, ${100 - r.mix.share}% the first and ${r.mix.share}% the second. Compare it with both parents in Challenges.</span>`;
  if (x.kind === 'stack' && r.stack) return `<br><span class="muted">${r.stack.layers} layers from ${r.stack.from}${r.stack.second ? ` (some from ${esc(r.stack.second)})` : ''}. Expect rambling until it's taught back.</span>`;
  if (x.kind === 'refusals' && r.refusals) {
    const f = r.refusals;
    return `<br><span class="muted"><strong>Made in the Lab with the refusal habit taken out.</strong> Strength ${f.strength}%, ${f.layers.length} layers (${f.layers[0]} to ${f.layers.at(-1)}), ${f.edited} weight tables changed. Of ${f.reflex.of} mild prompts it now declines ${f.reflex.declined}.${f.kept ? ` Kept refusals: it still declines ${f.kept.declined} of ${f.kept.of} (${f.kept.categories.filter((c) => !c.declined).map((c) => c.label.toLowerCase()).join(', ') || 'all five kept'}${f.kept.categories.some((c) => !c.declined) ? ' no longer declined' : ''}).` : ' The kept-refusals check was turned off.'}${f.teachBack === 'planned' ? ' Teaching back the kept refusals is planned: the Lab wrote the lesson set and the note the Forge needs; it runs on a rented card.' : f.teachBack === false ? ' Teaching back is off: this brain may answer anything.' : ''}${f.naughty ? ' On the naughty list.' : ' Not on the naughty list (you turned that off).'}</span>`;
  }
  return '';
}
