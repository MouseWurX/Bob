// 1.5.205 The Brains page: which brains Bob uses, the jobs each one does, and where each would sit on this replicant
// matrix (card, memory, read from the drive). It replaces the paper doll as the first view of "Equip Bob"; the doll
// and the plain list are one press away. Pure HTML builders, no DOM: cellar.js handles the clicks, and saving a job
// goes through the same calls the doll uses. Nothing is equipped or downloaded without the owner.
import { SLOTS, allSlots, equipped, entryOf, slotTakes, isActive, tipHtml, kitHtml, starterHtml } from './equip.js';
import { placeFor, sizeLine, placeWord, hasExperts } from './place.js';
import { esc, gb } from './util.js';
import { memTypeTrade } from './mem-types.js';

// The jobs a brain can hold (every thinking slot; the rented brain is its own thing).
export const brainJobs = () => allSlots().filter((s) => s.kind === 'llm');
// Hearing, voice, pictures and the rest: not brains, but picked on the same page.
export const senseSlots = () => SLOTS.filter((s) => s.kind !== 'llm');

// The brains in use: one row per brain, with every job it holds. [{ value, name, entry, jobs: [slot] }]
export function brainsInUse(ctx) {
  const rows = new Map();
  for (const slot of brainJobs()) {
    const value = equipped(slot, ctx);
    if (!value) continue;
    if (!rows.has(value)) {
      const entry = entryOf(ctx.models || [], value);
      const opt = (ctx.roles?.options?.llm || []).find((o) => o.value === value);
      rows.set(value, { value, entry, name: (opt && opt.label !== value ? opt.label : entry?.name) || value, jobs: [] });
    }
    rows.get(value).jobs.push(slot);
  }
  return [...rows.values()];
}
export const emptyJobs = (ctx) => brainJobs().filter((s) => !equipped(s, ctx));
// Brains on this replicant matrix that hold no job (active ones only, like every other picker).
export function spareBrains(ctx) {
  const used = new Set(brainsInUse(ctx).map((b) => b.value));
  return (ctx.roles?.options?.llm || []).filter((o) => !used.has(o.value)).map((o) => ({ value: o.value, name: o.label || o.value, entry: entryOf(ctx.models || [], o.value), caps: o.caps }))
    .filter((b) => isActive({ entry: b.entry, value: b.value, installed: true }, ctx.active));
}
// The jobs this brain could take that it doesn't hold yet.
export const jobsFor = (value, ctx) => brainJobs().filter((s) => equipped(s, ctx) !== value && slotTakes(s, value, ctx));

// ---- Setups: how many brains Bob uses. A setup is a set of job changes offered as one list; nothing is saved until
// the owner presses Apply, and every job stays on the page whichever setup is in use. ----
export const SETUPS = [
  { id: 'one', icon: '🧠', name: 'One brain', does: 'One brain does every job. No swapping, nothing else to set.', who: 'Small computers, or keeping it simple.' },
  { id: 'duo', icon: '⚡', name: 'Quick + Big', does: 'A small brain for short answers, a big one for everything else.', who: 'One computer with a graphics card.' },
  { id: 'specialists', icon: '🧰', name: 'Specialists', does: 'A brain of its own for any job you choose: coding, review, office.', who: 'People who tune each job.' },
  { id: 'bobs', icon: '🌐', name: 'Across my Bobs', does: 'Brains live on different computers on your Bob-Net and help each other. Experimental.', who: 'Two or more Bobs.' }
];
// The jobs a setup decides. Gaming and Seeing pictures keep their own brain: only some brains can do them.
const CORE = ['bob', 'deep', 'office', 'tinker', 'reviewer', 'ledger', 'scout', 'painter'];
const val = (id, ctx) => equipped(allSlots().find((s) => s.id === id), ctx);
// Which setup the jobs are in now, told from the jobs themselves (there is no separate switch to fall out of step).
export function setupOf(ctx) {
  const main = val('bob', ctx);
  if (!main) return '';
  const others = CORE.map((id) => val(id, ctx)).filter((v) => v && v !== main);
  const quick = val('small', ctx);
  if (!others.length) return !quick || quick === main ? 'one' : 'duo';
  const big = val('deep', ctx);
  if (big && quick && quick !== big && CORE.every((id) => !val(id, ctx) || val(id, ctx) === big)) return 'duo';
  return 'specialists';
}
// What picking a setup would change: [{ slot, value, name }] (value '' = take it off, so the main brain does it).
export function setupPlan(id, ctx) {
  const slots = allSlots();
  const name = (v) => (ctx.roles?.options?.llm || []).find((o) => o.value === v)?.label || entryOf(ctx.models || [], v)?.name || v;
  const out = [];
  const want = (slotId, value) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot || val(slotId, ctx) === value) return;
    if (value && !slotTakes(slot, value, ctx)) return;
    if (!value && !slot.off && slot.how !== 'brain') return; // a job that can't go empty keeps its brain
    out.push({ slot, value, name: value ? name(value) : '' });
  };
  if (id === 'one' || id === 'duo') {
    // The big brain: the Deep thinker when there is one, otherwise the main brain.
    const big = id === 'duo' ? val('deep', ctx) || val('bob', ctx) : val('bob', ctx);
    if (!big) return out;
    if (id === 'duo') want('bob', big);
    want('deep', id === 'one' ? '' : big);
    for (const j of ['office', 'tinker', 'reviewer', 'ledger', 'scout', 'painter']) want(j, ''); // empty = the main brain does it
    if (id === 'one') want('small', '');
  }
  return out;
}
// Quick + Big needs a small brain in the Quick slot that isn't the big one.
export const duoNeedsQuick = (ctx) => { const q = val('small', ctx); return !q || q === (val('deep', ctx) || val('bob', ctx)); };

function setupsHtml(ctx) {
  const now = setupOf(ctx);
  const ask = ctx.setupAsk || '';
  const btn = (s) => `<button type="button" class="setup-card${s.id === now ? ' on' : ''}${s.id === ask ? ' asking' : ''}" data-setup="${esc(s.id)}" aria-pressed="${s.id === now}"><strong>${s.icon} ${esc(s.name)}</strong>${s.id === now ? ' <span class="tag good">in use</span>' : ''}<br><span class="muted">${esc(s.does)}</span><br><span class="muted setup-who">For: ${esc(s.who)}</span></button>`;
  let box = '';
  if (ask === 'bobs') {
    box = `<div class="setup-ask"><p>${(ctx.bobNet || []).length ? `Your Bob-Net has ${ctx.bobNet.length === 1 ? 'one other Bob' : `${ctx.bobNet.length} other Bobs`} with room to help.` : 'I don\'t see another Bob on your Bob-Net with room to help yet.'} Sharing is set up in Settings, Bob-Net: lending a card, taking jobs, and spreading a big brain over several Bobs. All of it is off until you turn it on.</p><div class="row"><button type="button" class="mini" data-setupbobnet>Open Bob-Net settings</button><button type="button" class="mini" data-setup="">Close</button></div></div>`;
  } else if (ask === 'specialists') {
    box = `<div class="setup-ask"><p>Nothing to apply: give any job its own brain with <strong>+ job</strong> on a brain below, or the menu beside an empty job.</p><div class="row"><button type="button" class="mini" data-setup="">Close</button></div></div>`;
  } else if (ask) {
    const plan = setupPlan(ask, ctx);
    const s = SETUPS.find((x) => x.id === ask);
    const lines = plan.map((c) => `<li>${c.slot.icon} <strong>${esc(c.slot.name)}</strong>: ${c.value ? esc(c.name) : `no brain of its own (${esc(c.slot.empty.replace(/^Empty: |^No [a-z ]+: /, '').replace(/^Uses/, 'uses'))})`}</li>`).join('');
    const quick = ask === 'duo' && duoNeedsQuick(ctx) ? '<p class="warn-text">The Quick brain slot needs a small brain of its own for this. Pick one under Jobs with no brain of their own, or get one from the catalogue.</p>' : '';
    box = `<div class="setup-ask" role="group" aria-label="${esc(`Change to ${s.name}`)}"><p><strong>${esc(s.name)}</strong> would change ${plan.length ? 'these jobs' : 'nothing: the jobs already match'}. No brain is deleted, and you can change any job back.</p>${lines ? `<ul>${lines}</ul>` : ''}${quick}<div class="row">${plan.length ? `<button type="button" class="get" data-setupapply="${esc(ask)}">Apply</button>` : ''}<button type="button" class="mini" data-setup="">${plan.length ? 'Cancel' : 'Close'}</button></div></div>`;
  }
  return `<section class="brains-panel"><h3>How my brains are split ${tipHtml('A setup changes several jobs at once. Pressing one shows the list first; nothing changes until you press Apply. Every job stays on this page whichever setup you use.', 'About setups')}</h3>
    <div class="setup-cards">${SETUPS.map(btn).join('')}</div>${box}</section>`;
}

const hwOf = (ctx) => ({ vramGB: ctx.integrated ? 0 : ctx.vramGB || 0, ramGB: ctx.ramGB || 0, unified: Boolean(ctx.unified) });

// Where a brain would sit, as a bar with words on every part (never colour alone).
export function placeBarHtml(entry, ctx) {
  if (!entry) return '<span class="muted">Not in my list, so I can\'t say where it sits.</span>';
  if (!ctx.ramGB && !ctx.vramGB) return '<span class="muted">Waiting for this replicant matrix\'s specs.</span>';
  const p = placeFor(entry, hwOf(ctx), ctx.bobNet || []);
  if (p.where === 'rent' || p.where === 'help') return `<span class="tag warn">${esc(p.word)}</span> <span class="muted">${esc(p.why)}</span>`;
  const parts = [['card', hwOf(ctx).unified ? 0 : p.cardGB, 'Card'], ['mem', p.memGB, 'Memory'], ['drive', p.storageGB, 'Storage']].filter(([, n]) => n > 0);
  const total = parts.reduce((n, [, x]) => n + x, 0) || 1;
  const said = parts.map(([, n, w]) => `${w} ${gb(n)}`).join(', ');
  return `<div class="place-bar" role="img" aria-label="${esc(`${p.word}: ${said}`)}">${parts.map(([k, n, w]) => `<span class="pb-${k}" style="flex:${Math.max(0.24, n / total).toFixed(3)}">${esc(w)} ${esc(gb(n))}</span>`).join('')}</div>${p.why ? `<span class="muted place-why">${esc(p.why)}</span>` : ''}`;
}

// What the biggest brain in use takes from the card, memory and drive when it is loaded.
export function budget(ctx) {
  const hw = hwOf(ctx);
  let top = null;
  for (const b of brainsInUse(ctx)) {
    if (!b.entry) continue;
    const p = placeFor(b.entry, hw, ctx.bobNet || []);
    if (p.where === 'rent' || p.where === 'help') continue;
    const size = p.cardGB + p.memGB + p.storageGB;
    if (!top || size > top.size) top = { ...p, size, name: b.name };
  }
  return { hw, top };
}
function budgetHtml(ctx) {
  const { hw, top } = budget(ctx);
  if (!hw.vramGB && !hw.ramGB) return '';
  const line = (label, used, total, what) => {
    const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return `<div class="budget-row"><strong>${label}</strong><div class="meter" role="img" aria-label="${esc(`${label}: ${what}`)}"><i style="width:${pct}%"></i></div><span class="muted">${esc(what)}</span></div>`;
  };
  const rows = [];
  if (hw.vramGB && !hw.unified) rows.push(line('Card', top?.cardGB || 0, hw.vramGB, `${gb(top?.cardGB || 0) || '0 GB'} of ${gb(hw.vramGB)}`));
  if (hw.ramGB) rows.push(line('Memory', top?.memGB || 0, hw.ramGB, `${gb(top?.memGB || 0) || '0 GB'} of ${gb(hw.ramGB)}`));
  rows.push(line('Storage', top?.storageGB ? 1 : 0, 1, top?.storageGB ? `${gb(top.storageGB)} read from the drive as needed` : 'nothing read from the drive'));
  return `<section class="brains-panel"><h3>This replicant matrix ${tipHtml('What my biggest brain in use takes when it is loaded. I load one big brain at a time and swap when a job needs another (about 20 seconds), so they don\'t add up.', 'About these bars')}</h3>
    ${rows.join('')}<p class="muted">${top ? `With ${esc(top.name)} loaded, my biggest brain in use.` : 'No brain in use yet.'}</p></section>`;
}

const jobSelect = (value, jobs, label) => (jobs.length ? `<select class="job-add" data-brainjob="${esc(value)}" aria-label="${esc(label)}"><option value="">+ job</option>${jobs.map((s) => `<option value="${esc(s.id)}">${s.icon} ${esc(s.name)}</option>`).join('')}</select>` : '');

// Lab scores on the Brains page (Nov 11): what the Lab measured on this replicant matrix, when it has. ctx.labScores =
// { "<brain id>": { tools, coding, overall, tps, when, wobble } } from /api/lab/brain-scores.
export function labLine(b, ctx) {
  const s = ctx.labScores?.[b.entry?.id || b.value] || ctx.labScores?.[b.value];
  if (!s) return '';
  const bits = [s.tools != null && `tools ${s.tools}`, s.coding != null && `coding ${s.coding}`, s.tps && `${s.tps} words a second here`].filter(Boolean);
  return bits.length ? `Lab: ${bits.join(' · ')}${s.when ? ` (${s.when})` : ''}` : '';
}
// Nov 12, item 192: how often this brain's answers stood with no correction from the app's checks. ctx.honesty =
// { "<model>": { answers, corrected, score, line } } from /api/honesty.
export function honestyLineOf(b, ctx) { const s = ctx.honesty?.[b.value] || ctx.honesty?.[b.entry?.id]; return s?.line || ''; }
const honestyHtml = (b, ctx) => { const t = honestyLineOf(b, ctx); return t ? `<br><span class="muted honesty-line" title="Out of 100: the share of this brain's answers that needed no correction from the app's honesty checks on this replicant matrix">🧭 ${esc(t)}</span>` : ''; };
const labLineHtml = (b, ctx) => { const t = labLine(b, ctx); return t ? `<br><span class="muted lab-line" title="Scores out of 100 from the Lab's tests on this replicant matrix">🧪 ${esc(t)}</span>` : ''; };
function brainRowHtml(b, ctx) {
  const chips = b.jobs.map((s) => `<span class="job-chip" title="${esc(s.does)}">${s.icon} ${esc(s.name)}${s.off ? `<button type="button" class="chip-x" data-unequip="${esc(s.id)}" aria-label="Take ${esc(b.name)} off ${esc(s.name)}">✕</button>` : ''}</span>`).join('');
  const trial = b.entry?.trial ? '<span class="tag">Not tried yet</span>' : '';
  return `<li class="brain-row" id="brain-${esc(b.value)}"><div class="brain-name"><strong>${esc(b.name)}</strong> ${trial}<br><span class="muted">${esc(b.entry ? sizeLine(b.entry) : 'not in my list')}</span>${labLineHtml(b, ctx)}${honestyHtml(b, ctx)}</div>
    <div class="brain-jobs">${chips}${jobSelect(b.value, jobsFor(b.value, ctx), `Give ${b.name} another job`)}</div>
    <div class="brain-place">${placeBarHtml(b.entry, ctx)}${actHtml(b, ctx)}</div></li>`;
}

// ---- Set up: one brain's own page. Its jobs, and where it sits (Auto, or by hand for a brain made of experts). ----
// ctx.place = what the server knows (/api/brain-place): { brains: { "<model>": { layers, set: { mode, cpuMoe }, pinned } } }.
const placeOf = (value, ctx) => ctx.place?.brains?.[value] || null;
const handOn = (value, ctx) => placeOf(value, ctx)?.set?.mode === 'hand';
// Why this brain can't be set by hand, or '' when it can. The control stays on the page either way, locked, with this.
export function handLock(b, ctx) {
  const p = placeOf(b.value, ctx);
  if (!ctx.place) return 'Reading this brain\'s file…';
  if (b.entry && !hasExperts(b.entry)) return 'This brain has no experts to move. Auto already puts as much of it on the card as fits.';
  if (!p?.layers) return 'I couldn\'t read this brain\'s layers from its file, so Auto decides where it sits.';
  if (!b.entry) return 'Not in my list, so I don\'t know whether it has experts to move.';
  if (p.pinned) return 'A number in the settings file (llamacpp.nCpuMoe) is in charge of this brain. Remove it there to set it here.';
  return '';
}
// ---- Calibrate: time this brain a few ways on this replicant matrix; the result is a recommendation, never a change. ----
// Why Calibrate is locked for this brain, or ''.
export function calLock(b, ctx) {
  const hand = handLock(b, ctx);
  if (hand && !/settings file/.test(hand)) return hand;
  if (ctx.place && !ctx.place.engineHere) return 'My built-in engine isn\'t on this replicant matrix yet.';
  if (ctx.place?.busy) return 'The Lab is busy with another job. Calibrating waits for it.';
  return '';
}
export const canCalibrate = (ctx) => brainsInUse(ctx).filter((b) => !calLock(b, ctx));
const mins = (n) => `about ${Math.max(5, n * 8)} minutes`;
// The job line while calibrating, or the question before unloading a brain in use.
function calStatusHtml(ctx) {
  const j = ctx.place?.job;
  if (j && j.state === 'running') return `<div class="cal-run" role="status"><strong>Calibrating.</strong> ${esc(j.stepLabel || 'Starting…')} <span class="muted">${j.progress || 0}%</span><div class="meter"><i style="width:${j.progress || 0}%"></i></div><button type="button" class="mini" data-calstop>Stop</button></div>`;
  const a = ctx.calAsk;
  if (!a) return '';
  if (a.error) return `<div class="setup-ask"><p class="error">${esc(a.error)}</p><div class="row"><button type="button" class="mini" data-calcancel>Close</button></div></div>`;
  return `<div class="setup-ask" role="group" aria-label="Calibrate"><p>${a.needUnload ? `${esc((a.names || []).join(', '))} ${a.names?.length === 1 ? 'is' : 'are'} loaded. Calibrating unloads ${a.names?.length === 1 ? 'it' : 'them'} first, and I can't chat until it's done.` : `Calibrating ${a.models.length === 1 ? 'this brain' : `${a.models.length} brains, one after another,`} takes ${mins(a.models.length)} and keeps the graphics card busy. I can't chat while it runs.`} Nothing is changed at the end: you get a recommendation to use or ignore.</p><div class="row"><button type="button" class="get" data-calgo${a.needUnload ? ' data-unload="1"' : ''}>${a.needUnload ? 'Unload and calibrate' : 'Calibrate'}</button><button type="button" class="mini" data-calcancel>Cancel</button></div></div>`;
}
function calibrateHtml(b, ctx) {
  const p = placeOf(b.value, ctx);
  const lock = calLock(b, ctx);
  const cal = p?.cal || null;
  const running = ctx.place?.job?.state === 'running';
  const set = p?.set || { mode: 'auto' };
  const best = cal?.best || null;
  const inUse = best && (best.mode === 'hand' ? set.mode === 'hand' && set.cpuMoe === best.cpuMoe : set.mode !== 'hand');
  const rows = (cal?.rows || []).map((r) => `<tr${best && ((best.mode === 'auto' && r.id === 'auto') || (best.mode === 'hand' && r.cpuMoe === best.cpuMoe && r.id !== 'auto')) ? ' class="best"' : ''}><td>${r.id === 'auto' ? 'Auto' : `By hand, ${r.cpuMoe} in memory`}</td><td>${r.failed ? `<span class="muted">${esc(r.failed)}</span>` : `${r.tps} words a second`}</td><td>${r.failed || r.firstWordS == null ? '' : `first word ${r.firstWordS} s`}</td><td>${best && ((best.mode === 'auto' && r.id === 'auto') || (best.mode === 'hand' && r.cpuMoe === best.cpuMoe && r.id !== 'auto')) ? '★ recommended' : ''}</td></tr>`).join('');
  return `<section class="brains-panel"><h3>Calibration ${tipHtml('I start this brain in a trial engine a few ways (Auto, then by hand with more and more layers\' experts in memory), ask the same short question each time, and read the words a second. The fastest becomes the recommendation. Nothing changes until you press Use recommended.', 'About calibrating')}</h3>
      <div class="row"><button type="button" class="mini" data-calibrate="${esc(b.value)}" ${lock || running ? 'disabled' : ''}>⏱ Calibrate</button><button type="button" class="mini" data-caluse="${esc(b.value)}" ${best && !inUse && !running ? '' : 'disabled'}>Use recommended</button>${best ? `<span class="tag ${inUse ? 'good' : ''}">★ recommended: ${best.mode === 'hand' ? `By hand, ${best.cpuMoe}` : 'Auto'}${inUse ? ' (in use)' : ''}</span>` : ''}</div>
      ${calStatusHtml(ctx)}
      <p class="muted">${lock ? `🔒 ${esc(lock)}` : cal ? `Last calibrated ${esc(cal.when || '')}. ${esc(best?.why || 'No try ran.')}` : 'Not calibrated yet. Auto is in charge until you say otherwise.'}</p>
      ${rows ? `<table class="cal-rows"><caption class="sr-only">What each try measured</caption>${rows}</table>` : ''}</section>`;
}

export function setUpHtml(b, ctx) {
  const p = placeOf(b.value, ctx);
  const set = p?.set || { mode: 'auto' };
  const layers = p?.layers || 0;
  const lock = handLock(b, ctx);
  const n = Number.isInteger(set.cpuMoe) ? Math.min(set.cpuMoe, layers || set.cpuMoe) : 0;
  const hand = set.mode === 'hand';
  const chips = b.jobs.map((s) => `<span class="job-chip" title="${esc(s.does)}">${s.icon} ${esc(s.name)}${s.off ? `<button type="button" class="chip-x" data-unequip="${esc(s.id)}" aria-label="Take ${esc(b.name)} off ${esc(s.name)}">✕</button>` : ''}</span>`).join('');
  const seg = (mode, label) => `<button type="button" class="seg-btn${(mode === 'hand') === hand ? ' on' : ''}" data-placemode="${mode}" data-model="${esc(b.value)}" aria-pressed="${(mode === 'hand') === hand}" ${mode === 'hand' && lock ? 'disabled' : ''}>${label}</button>`;
  const dis = lock ? 'disabled' : '';
  return `<p><button type="button" class="link" data-brainsetup="">← All brains</button></p>
    <div class="brains-page">
    <section class="brains-panel"><h3>${esc(b.name)}</h3><p class="muted">${esc(b.entry ? sizeLine(b.entry) : 'not in my list')}${layers ? ` · ${layers} layers` : ''}${b.entry && hasExperts(b.entry) ? ' · made of experts' : ''}</p>
      <h4>Jobs</h4><div class="brain-jobs">${chips || '<span class="muted">No job yet.</span>'}${jobSelect(b.value, jobsFor(b.value, ctx), `Give ${b.name} another job`)}</div></section>
    <section class="brains-panel"><h3>Where it sits ${tipHtml('Auto: my engine looks at the free room on the card each time this brain loads and fits as much as it can. By hand: you say how many layers keep their experts in memory instead; fewer in memory is faster until the card is full, and then much slower. A change takes effect the next time this brain loads.', 'About where a brain sits')}</h3>
      <div class="seg" role="group" aria-label="Where ${esc(b.name)} sits">${seg('auto', 'Auto')}${seg('hand', 'By hand')}</div>
      <div class="brain-place wide">${placeBarHtml(b.entry, ctx)}${hand ? `<span class="muted place-why">By hand: ${n} of ${layers} layers keep their experts in memory. The bar shows what Auto would start from.</span>` : ''}</div>
      <div class="num-row"><label for="place-moe"><strong>Layers that keep their experts in memory</strong><br><span class="muted">0 puts everything on the card. More frees the card and is slower.</span></label>
        <input type="range" id="place-moe" min="0" max="${layers || 1}" step="1" value="${n}" data-placemoe="${esc(b.value)}" ${dis} aria-describedby="place-lock">
        <input type="number" min="0" max="${layers || 1}" step="1" value="${n}" data-placemoenum="${esc(b.value)}" ${dis} aria-label="Layers that keep their experts in memory, as a number" inputmode="numeric"><span class="muted">of ${layers || '?'}</span></div>
      ${p?.cal?.best ? `<p class="muted">★ Recommended by the last calibration: ${p.cal.best.mode === 'hand' ? `<strong>${p.cal.best.cpuMoe}</strong> by hand` : '<strong>Auto</strong>'}.</p>` : ''}
      <p class="muted" id="place-lock">${lock ? `🔒 ${esc(lock)}` : hand ? 'In use. Takes effect the next time this brain loads.' : 'Set the number any time; it is used once you switch to By hand.'}</p></section>
    ${memTypeHtml(b, ctx)}
    ${calibrateHtml(b, ctx)}
    </div>`;
}

// 100 The engine's chat memory type for this brain: Standard unless picked. Only Bob's own engine has the choice.
export function memTypeHtml(b, ctx) {
  const p = placeOf(b.value, ctx);
  const cur = p?.memType || 'standard';
  const off = p ? p.memEngine === false : true;
  const rows = memTypeTrade(p?.kv32);
  const seg = (r) => `<button type="button" class="seg-btn${r.id === cur ? ' on' : ''}" data-memtype="${r.id}" data-model="${esc(b.value)}" aria-pressed="${r.id === cur}" ${off ? 'disabled' : ''}>${esc(r.name)}</button>`;
  return `<section class="brains-panel"><h3>Chat memory type ${tipHtml('The chat memory (KV cache) sits beside the brain on the card and grows as a chat gets longer. Standard is what I use unless you pick. Sharper keeps it at full detail: twice the room, a touch more exact on long code. Smaller packs it tighter: about half the room, so a longer chat fits, a little less exact. A change takes effect the next time this brain loads.', 'About the chat memory type')}</h3>
      <div class="seg" role="group" aria-label="Chat memory type for ${esc(b.name)}">${rows.map(seg).join('')}</div>
      <ul class="mem-trade">${rows.map((r) => `<li${r.id === cur ? ' class="on"' : ''}><strong>${esc(r.name)}</strong>${r.gb != null ? ` · about ${r.gb} GB for a 32K chat` : ''} <span class="muted">${esc(r.about)}</span></li>`).join('')}</ul>
      <p class="muted">${off ? '🔒 Only with Brain Engine or llama.cpp. Ollama sets its chat memory for every brain at once.' : cur === 'standard' ? 'Standard. Takes effect the next time this brain loads.' : 'In use. Takes effect the next time this brain loads.'}</p></section>`;
}

function emptyJobHtml(slot, ctx) {
  const opts = (ctx.roles?.options?.llm || []).filter((o) => slotTakes(slot, o.value, ctx) && isActive({ entry: entryOf(ctx.models || [], o.value), value: o.value, installed: true }, ctx.active));
  const pick = opts.length ? `<select data-jobbrain="${esc(slot.id)}" aria-label="Brain for ${esc(slot.name)}"><option value="">Pick a brain</option>${opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label || o.value)}</option>`).join('')}</select>` : '';
  return `<li class="job-empty"><span>${slot.icon} <strong>${esc(slot.name)}</strong> <span class="muted">${esc(slot.empty)}</span></span><span class="cat-act">${pick}<button type="button" class="mini" data-catjob="${esc(slot.id)}">Get one</button></span></li>`;
}

function senseRowHtml(slot, ctx) {
  const cur = equipped(slot, ctx);
  const e = entryOf(ctx.models || [], cur);
  const opt = cur && (ctx.roles?.options?.[slot.kind] || []).find((o) => o.value === cur);
  const name = slot.how === 'rent' ? (ctx.rent?.rentals || []).find((r) => r.id === cur)?.name || cur : (opt && opt.label !== cur ? opt.label : e?.name) || cur;
  const has = cur && !(slot.off === 'windows' && cur === 'windows');
  const sel = ctx.selected === slot.id;
  return `<li class="sense-row${sel ? ' sel' : ''}"><span>${slot.icon} <strong>${esc(slot.name)}</strong> ${has ? esc(name) : `<span class="muted">${esc(slot.empty)}</span>`}</span><span class="cat-act"><button type="button" class="mini" data-slotpick="${esc(slot.id)}" aria-pressed="${sel}">${has ? 'Change' : 'Pick'}</button></span></li>`;
}

// 1.5.207 The plain list has the same tools as the Brains page (the owner's ask): the setups and Calibrate all on
// top, and on every thinking job that has a brain, where it sits, Auto or By hand, Calibrate and Set up.
const calAllHtml = (ctx) => `<button type="button" class="mini" data-calibrate="*" ${canCalibrate(ctx).length && ctx.place?.job?.state !== 'running' ? '' : 'disabled'} title="${canCalibrate(ctx).length ? 'Time every brain that can be calibrated, one after another' : 'No brain in use can be calibrated here: only brains made of experts that my built-in engine runs'}">⏱ Calibrate all</button>`;
const actHtml = (b, ctx) => `<div class="brain-act"><span class="muted">${handOn(b.value, ctx) ? 'By hand' : 'Auto'}</span><span><button type="button" class="mini" data-calibrate="${esc(b.value)}" ${calLock(b, ctx) || ctx.place?.job?.state === 'running' ? 'disabled' : ''} aria-label="Calibrate ${esc(b.name)}"${calLock(b, ctx) ? ` title="${esc(calLock(b, ctx))}"` : ''}>⏱ Calibrate</button> <button type="button" class="mini" data-brainsetup="${esc(b.value)}" aria-label="Set up ${esc(b.name)}">Set up</button></span></div>`;
// The Set up page of the brain that is open, or '' (the list shows instead).
export function listSetUpHtml(ctx) {
  const one = ctx.setUp ? brainsInUse(ctx).find((b) => b.value === ctx.setUp) : null;
  return one ? setUpHtml(one, ctx) : '';
}
export function listTopHtml(ctx) {
  return `<div class="brains-page">${setupsHtml(ctx)}<section class="brains-panel"><div class="panel-head"><h3>Calibrate</h3>${calAllHtml(ctx)}</div><p class="muted">Times each brain a few ways on this replicant matrix and recommends where it should sit. Nothing changes until you say so.</p>${calStatusHtml(ctx)}</section></div>`;
}
// One job's brain in the list: where it sits and its two buttons. '' when the job has no brain.
export function listRowHtml(value, ctx) {
  const b = value ? brainsInUse(ctx).find((x) => x.value === value) : null;
  return b ? `<div class="brain-place list-place" id="brain-${esc(b.value)}-${esc(ctx.rowId || '')}">${placeBarHtml(b.entry, ctx)}${actHtml(b, ctx)}</div>` : '';
}

export function brainsHtml(ctx) {
  const used = brainsInUse(ctx), empty = emptyJobs(ctx), spare = spareBrains(ctx);
  const one = ctx.setUp ? used.find((b) => b.value === ctx.setUp) : null;
  if (one) return setUpHtml(one, ctx);
  const sel = senseSlots().find((s) => s.id === ctx.selected) || null;
  const word = placeWord('card', hwOf(ctx));
  return `<div class="equip-top"><p class="muted">Each brain, the jobs it does, and where it sits on this replicant matrix. ${tipHtml(`One brain doing several jobs is faster: I only swap brains when a job needs a different one. "${word}" is quickest; a brain that spills into memory or the drive still runs, slower.`, 'How the Brains page works')} <button type="button" class="mini help-link" data-help="brains-page" aria-label="Help: the Brains page">? Help</button></p>
      <span>${ctx.inSettings ? '' : '<button type="button" class="link" data-eqview="doll">Paper doll</button> · '}<button type="button" class="link" data-eqview="list">Plain list</button></span></div>
    ${starterHtml(ctx)}
    <div class="brains-page">
    ${budgetHtml(ctx)}
    ${setupsHtml(ctx)}
    <section class="brains-panel"><div class="panel-head"><h3>Brains in use</h3>${calAllHtml(ctx)}</div>
      ${calStatusHtml(ctx)}
      ${used.length ? `<ul class="brain-list">${used.map((b) => brainRowHtml(b, ctx)).join('')}</ul>` : '<p class="muted">No brain yet. Pick one for a job below, or get one from the catalogue.</p>'}
      ${empty.length ? `<h4>Jobs with no brain of their own</h4><ul class="brain-list">${empty.map((s) => emptyJobHtml(s, ctx)).join('')}</ul>` : ''}</section>
    <section class="brains-panel"><h3>Add a brain</h3>
      ${spare.length ? `<ul class="brain-list">${spare.map((b) => `<li class="brain-row spare"><div class="brain-name"><strong>${esc(b.name)}</strong><br><span class="muted">${esc(b.entry ? sizeLine(b.entry) : 'not in my list')} · on this replicant matrix, no job yet</span>${labLineHtml(b, ctx)}</div><div class="brain-jobs">${jobSelect(b.value, jobsFor(b.value, ctx), `Give ${b.name} a job`)}</div><div class="brain-place">${placeBarHtml(b.entry, ctx)}</div></li>`).join('')}</ul>` : ''}
      <p class="get-more"><button type="button" class="get-more-btn" data-tab="catalogue">📚 Brain catalogue: every brain, by job and size</button></p></section>
    <section class="brains-panel"><h3>Senses and tools</h3>
      <ul class="brain-list">${senseSlots().map((s) => senseRowHtml(s, ctx)).join('')}</ul>
      ${sel ? `<section class="kit-panel" aria-live="polite">${kitHtml(sel, ctx)}</section>` : '<section class="kit-panel" aria-live="polite"></section>'}</section>
    </div>`;
}
