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
