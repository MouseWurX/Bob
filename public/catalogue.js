// 1.5.56: the Brain catalogue. Every model in Bob's list, sorted by the job it does (the same jobs as the slots in
// Equip Bob), with its size, how it suits this PC and smaller machines, and where it comes from (an exact Hugging Face
// commit, or Ollama). Each model has an Active switch: active models show in the slots and menus, the rest stay here,
// so the pickers stay short. Pure HTML builders; cellar.js handles the clicks.
import { canDo, suit, pickFor, deviceFit, sourceOf, SLOT_NAMES } from './fit.js';
import { allSlots, isActive, tipHtml, slotValue, equipped } from './equip.js';
import { keep } from './tips.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gb = (n) => (n == null ? '' : n >= 1 ? `${(+n).toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.round(n * 1000)} MB`);

// The jobs, in the order the catalogue shows them. Names are the slot names on the paper doll.
const BRAIN_JOBS = ['small', 'gaming', 'bob', 'deep', 'reviewer', 'tinker', 'office', 'eyes'];
const MEDIA_JOBS = ['voice', 'speech', 'image', 'edit', 'video', 'music', 'embed'];
export const PHONE = { id: 'phone', name: 'Phone', icon: '📱', does: 'Brains the Bob phone app can run on the phone itself. The phone app gets its own copy; you pick it there.' };
export const catJobs = () => {
  const slots = allSlots();
  return [...BRAIN_JOBS.map((id) => slots.find((s) => s.id === id)), PHONE, ...MEDIA_JOBS.map((id) => slots.find((s) => s.id === id))].filter(Boolean);
};

// The catalog models for a job. Brains say which jobs they do; pictures, voices and the rest go by their category.
export function modelsFor(job, models) {
  if (job.id === 'phone') return models.filter((m) => m.jobs?.includes('phone'));
  if (job.kind === 'llm') return models.filter((m) => m.jobs && canDo(job.id, { entry: m }));
  return models.filter((m) => (job.cats || []).includes(m.category) && Boolean(m.use?.painter?.sdcpp?.edit) === Boolean(job.editOnly));
}

const LEVEL_TAG = { slow: '<span class="tag warn">Slow on this PC</span>', no: '<span class="tag warn">Doesn\'t suit this PC</span>', blocked: '<span class="tag bad">Can\'t install here</span>' };

function rowHtml(m, job, ctx) {
  const here = m.status?.state === 'installed';
  const s = suit(m, { vramGB: ctx.vramGB, ramGB: ctx.ramGB, freeGB: ctx.freeGB }, ctx.platform);
  const rec = job.id !== 'phone' && pickFor(job.id, ctx.models, ctx)?.id === m.id;
  const src = sourceOf(m);
  // Everything that explains (what it is, how it does on other machines, licence) goes in the tip; what you act on stays.
  const fits = deviceFit(m).map((d) => `${d.label}: ${d.word}`).join(' · ');
  const tip = [m.what, m.vramGB ? `Wants ${gb(m.vramGB)} of graphics memory` : 'Runs on the processor', m.trial ? `New: not tried on a PC yet. ${m.trialNote || ''}`.trim() : '', s.why, fits, `Licence ${m.license}${m.commercial === false ? ' (personal use only)' : ''}`, src ? `From ${src.label}` : ''].filter(Boolean).join('\n');
  const tags = `${rec ? '<span class="tag rec">★ Recommended</span>' : ''}${m.trial ? '<span class="tag">New</span>' : ''}${!rec && s.level !== 'ok' ? LEVEL_TAG[s.level] || '' : ''}${here ? '<span class="tag good">On this PC</span>' : ''}`;
  const on = isActive({ entry: m, value: m.id, installed: here }, ctx.active);
  const sw = job.id === 'phone' ? '<span class="muted">In the phone app</span>'
    : `<button type="button" class="mini-switch" role="switch" aria-checked="${on}" data-active="${esc(m.id)}" data-tip="${here ? 'Active: shows in Equip Bob and the brain menus. Off: hidden there. Nothing is deleted.' : 'Active: shows in Equip Bob and the brain menus as not downloaded, with a Get button. Off: only listed here.'}" aria-label="Active: ${esc(m.name)}">Active <span class="st">${on ? 'On' : 'Off'}</span></button>`;
  const slot = allSlots().find((x) => x.id === job.id);
  const value = here && slot ? slotValue(slot, m, ctx.roles) : '';
  const worn = value && equipped(slot, ctx) === value;
  const act = job.id === 'phone' ? '' : worn ? '<span class="tag good">equipped</span>'
    : value ? `<button type="button" data-catequip="${esc(job.id)}" data-catvalue="${esc(value)}">Equip</button>`
    : here ? '' : (ctx.action ? ctx.action(m) : `<button class="get" data-get="${esc(m.id)}">Get</button>`);
  return `<li class="cat-row model${!here && !rec && s.level !== 'ok' ? ' dim' : ''}" id="cat-${esc(job.id)}-${esc(m.id)}">
    <span class="kit-name">${esc(m.name)}</span><span class="muted">${gb(m.sizeGB)}</span>${tags}${tipHtml(tip, `About ${m.name}`)}${src ? `<a class="src-link" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer" data-tip="Where it comes from: ${esc(src.label)}" aria-label="Where ${esc(m.name)} comes from">↗</a>` : ''}
    <span class="cat-act">${sw}${act}</span><div class="confirm" hidden></div></li>`;
}

function jobHtml(job, ctx) {
  const list = modelsFor(job, ctx.models);
  // Bob's pick first, then what's here, then what fits, then the rest.
  const rank = (m) => (pickFor(job.id, ctx.models, ctx)?.id === m.id ? 0 : m.status?.state === 'installed' ? 1 : suit(m, ctx, ctx.platform).level === 'ok' ? 2 : 3);
  const sorted = [...list].sort((a, b) => rank(a) - rank(b));
  const hide = sorted.filter((m) => rank(m) === 3);
  const shown = ctx.showUnsuited ? sorted : sorted.filter((m) => !hide.includes(m));
  const note = hide.length ? `<p class="muted unsuited-note">${ctx.showUnsuited ? '' : `${hide.length} more ${hide.length === 1 ? 'doesn\'t' : 'don\'t'} suit this PC. `}<button type="button" class="link" data-unsuited>${ctx.showUnsuited ? 'Hide the ones that don\'t suit' : 'Show them'}</button></p>` : '';
  const rule = job.id === 'gaming' ? '<p class="muted">Only brains timed answering quickly on a busy processor are listed here. Gemma 4 E4B isn\'t: it takes about half a minute there.</p>' : '';
  return `<section class="cat-job" id="catjob-${esc(job.id)}"><h3>${job.icon} ${esc(SLOT_NAMES[job.id] || job.name)} ${tipHtml(job.does, `About ${job.name}`)}</h3>${rule}
    <ul class="kit-list cat-list">${shown.map((m) => rowHtml(m, job, ctx)).join('') || '<li class="muted">Nothing in Bob\'s list for this job yet.</li>'}</ul>${note}</section>`;
}

// Brains on this PC that aren't in Bob's list (pulled in Ollama by hand, say): they can be made active or not too.
function othersHtml(ctx) {
  const known = new Set(ctx.models.flatMap((m) => [m.id, m.ollama, m.ollama && `${m.ollama}:latest`].filter(Boolean)));
  const others = (ctx.roles?.options?.llm || []).filter((o) => !known.has(o.value));
  if (!others.length) return '';
  return `<section class="cat-job" id="catjob-others"><h3>🔎 Other brains on this PC ${tipHtml('Brains Bob found on this PC that aren\'t in his list. He can\'t say how well they run here.', 'About other brains')}</h3><ul class="kit-list cat-list">${others.map((o) => {
    const on = isActive({ value: o.value, installed: true }, ctx.active);
    return `<li class="cat-row"><span class="kit-name">${esc(o.label)}</span><span class="cat-act"><button type="button" class="mini-switch" role="switch" aria-checked="${on}" data-active="${esc(o.value)}" aria-label="Active: ${esc(o.label)}">Active <span class="st">${on ? 'On' : 'Off'}</span></button></span></li>`;
  }).join('')}</ul></section>`;
}

export function catalogueHtml(ctx) {
  const jobs = catJobs();
  const card = ctx.vramGB ? `${ctx.vramGB} GB graphics card${ctx.ramGB ? `, ${ctx.ramGB} GB RAM` : ''}` : 'no graphics card found';
  return `<div class="cat-top"><p class="muted">Every model Bob knows, by the job it does. Turn <strong>Active</strong> on for the ones you want to see in Equip Bob and the brain menus. ${tipHtml(`Picked for this PC: ${card}. ★ Recommended is Bob's pick for that job here. New ones are listed but not recommended until they've been tried on a PC. Turning Active off only hides a model; it stays on the PC.`, 'How the catalogue works')} ${keep('Downloads always ask first, with the size.')} <button type="button" class="mini help-link" data-help="catalogue" aria-label="Help: the Brain catalogue">? Help</button></p>
    <nav class="subnav cat-nav" aria-label="Jobs">${jobs.map((j) => `<button type="button" data-catjump="${esc(j.id)}"${ctx.focus === j.id ? ' aria-current="true"' : ''}>${j.icon} ${esc(SLOT_NAMES[j.id] || j.name)}</button>`).join('')}</nav></div>
    ${jobs.map((j) => jobHtml(j, ctx)).join('')}${othersHtml(ctx)}`;
}
