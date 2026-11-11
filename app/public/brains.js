// 1.5.205 The Brains page: which brains Bob uses, the jobs each one does, and where each would sit on this replicant
// matrix (card, memory, read from the drive). It replaces the paper doll as the first view of "Equip Bob"; the doll
// and the plain list are one press away. Pure HTML builders, no DOM: cellar.js handles the clicks, and saving a job
// goes through the same calls the doll uses. Nothing is equipped or downloaded without the owner.
import { SLOTS, allSlots, equipped, entryOf, slotTakes, isActive, tipHtml, kitHtml, starterHtml } from './equip.js';
import { placeFor, sizeLine, placeWord } from './place.js';
import { esc, gb } from './util.js';

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

function brainRowHtml(b, ctx) {
  const chips = b.jobs.map((s) => `<span class="job-chip" title="${esc(s.does)}">${s.icon} ${esc(s.name)}${s.off ? `<button type="button" class="chip-x" data-unequip="${esc(s.id)}" aria-label="Take ${esc(b.name)} off ${esc(s.name)}">✕</button>` : ''}</span>`).join('');
  const trial = b.entry?.trial ? '<span class="tag">Not tried yet</span>' : '';
  return `<li class="brain-row" id="brain-${esc(b.value)}"><div class="brain-name"><strong>${esc(b.name)}</strong> ${trial}<br><span class="muted">${esc(b.entry ? sizeLine(b.entry) : 'not in my list')}</span></div>
    <div class="brain-jobs">${chips}${jobSelect(b.value, jobsFor(b.value, ctx), `Give ${b.name} another job`)}</div>
    <div class="brain-place">${placeBarHtml(b.entry, ctx)}</div></li>`;
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

export function brainsHtml(ctx) {
  const used = brainsInUse(ctx), empty = emptyJobs(ctx), spare = spareBrains(ctx);
  const sel = senseSlots().find((s) => s.id === ctx.selected) || null;
  const word = placeWord('card', hwOf(ctx));
  return `<div class="equip-top"><p class="muted">Each brain, the jobs it does, and where it sits on this replicant matrix. ${tipHtml(`One brain doing several jobs is faster: I only swap brains when a job needs a different one. "${word}" is quickest; a brain that spills into memory or the drive still runs, slower.`, 'How the Brains page works')} <button type="button" class="mini help-link" data-help="brains-page" aria-label="Help: the Brains page">? Help</button></p>
      <span><button type="button" class="link" data-eqview="doll">Paper doll</button> · <button type="button" class="link" data-eqview="list">Plain list</button></span></div>
    ${starterHtml(ctx)}
    <div class="brains-page">
    ${budgetHtml(ctx)}
    ${setupsHtml(ctx)}
    <section class="brains-panel"><h3>Brains in use</h3>
      ${used.length ? `<ul class="brain-list">${used.map((b) => brainRowHtml(b, ctx)).join('')}</ul>` : '<p class="muted">No brain yet. Pick one for a job below, or get one from the catalogue.</p>'}
      ${empty.length ? `<h4>Jobs with no brain of their own</h4><ul class="brain-list">${empty.map((s) => emptyJobHtml(s, ctx)).join('')}</ul>` : ''}</section>
    <section class="brains-panel"><h3>Add a brain</h3>
      ${spare.length ? `<ul class="brain-list">${spare.map((b) => `<li class="brain-row spare"><div class="brain-name"><strong>${esc(b.name)}</strong><br><span class="muted">${esc(b.entry ? sizeLine(b.entry) : 'not in my list')} · on this replicant matrix, no job yet</span></div><div class="brain-jobs">${jobSelect(b.value, jobsFor(b.value, ctx), `Give ${b.name} a job`)}</div><div class="brain-place">${placeBarHtml(b.entry, ctx)}</div></li>`).join('')}</ul>` : ''}
      <p class="get-more"><button type="button" class="get-more-btn" data-tab="catalogue">📚 Brain catalogue: every brain, by job and size</button></p></section>
    <section class="brains-panel"><h3>Senses and tools</h3>
      <ul class="brain-list">${senseSlots().map((s) => senseRowHtml(s, ctx)).join('')}</ul>
      ${sel ? `<section class="kit-panel" aria-live="polite">${kitHtml(sel, ctx)}</section>` : '<section class="kit-panel" aria-live="polite"></section>'}</section>
    </div>`;
}
