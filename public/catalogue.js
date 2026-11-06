// 1.5.56: the Brain catalogue. Every model in Bob's list, sorted by the job it does (the same jobs as the slots in
// Equip Bob), with its size, how it suits this PC and smaller machines, and where it comes from (an exact Hugging Face
// commit, or Ollama). Each model has an Active switch: active models show in the slots and menus, the rest stay here,
// so the pickers stay short. Pure HTML builders; cellar.js handles the clicks.
import { canDo, suit, pickFor, deviceFit, sourceOf, SLOT_NAMES } from './fit.js';
import { allSlots, isActive, tipHtml, slotValue, equipped } from './equip.js';
import { keep } from './tips.js';
import { esc, gb } from './util.js';

// 1.5.132: the naughty list. Catalogue entries marked `naughty: true` are uncensored community builds (heretic or
// abliterated: the refusals cut out). They are listed nowhere until the Naughty list switch (setting naughtyList) is on.
// `community` on an entry says who remixed it and from what; it's an explicit marker, never a guess from the name.
export const isNaughty = (m) => m?.naughty === true;
export const isCommunity = (m) => Boolean(m?.community && typeof m.community === 'object');
// The models the rest of the window may see: the naughty ones only while the switch is on.
export const visibleModels = (models, naughtyOn) => (naughtyOn ? models : (models || []).filter((m) => !isNaughty(m)));
// One line of credit for a community build, for the "i" tip: who made it, from whose model, who packed the files.
export function communityLine(m) {
  if (!isCommunity(m)) return '';
  const c = m.community;
  const base = c.base ? ` from ${c.baseBy ? `${c.baseBy}'s ` : ''}${c.base}` : '';
  const files = c.files && c.files !== c.by ? `; files packed by ${c.files}` : '';
  return `Community build: ${isNaughty(m) ? 'uncensored ' : ''}remix by ${c.by || 'someone in the community'}${base}${files}. Not a release by ${c.baseBy || 'the original maker'}.`;
}
export const NAUGHTY_WARNING = 'The naughty list is other people\'s remixes of Qwen and Gemma brains with the refusals cut out ("heretic" or "abliterated"). They are not Alibaba\'s or Google\'s releases. A brain from here answers without refusing, so what it says is on you, and it can be a little rougher than the original. I never recommend one; you pick it yourself.';


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

// 1.5.101: how a model does on the example machines, said once per answer: "Runs well: 16 GB card, 8 GB card · Runs, slowly: 6 GB laptop card".
const SHORT = { big: '16 GB card', mid: '8 GB card', small: '6 GB laptop card', cpu: 'no graphics card' };
export function fitLines(rows) {
  const pc = rows.filter((d) => d.id !== 'phone'), phone = rows.find((d) => d.id === 'phone');
  const words = [...new Set(pc.map((d) => d.word))];
  const parts = words.length === 1 && pc.length > 1 ? [`${words[0]} on every card and with no graphics card`]
    : words.map((w) => `${w}: ${pc.filter((d) => d.word === w).map((d) => SHORT[d.id] || d.label).join(', ')}`);
  return [parts.join(' · '), phone ? `${phone.label}: ${phone.word}` : ''].filter(Boolean).join('\n');
}

const LEVEL_TAG = { slow: '<span class="tag warn">Slow on this replicant matrix</span>', no: '<span class="tag warn">Doesn\'t suit this replicant matrix</span>', blocked: '<span class="tag bad">Can\'t install here</span>' };

function rowHtml(m, job, ctx) {
  const here = m.status?.state === 'installed';
  const s = suit(m, { vramGB: ctx.vramGB, ramGB: ctx.ramGB, freeGB: ctx.freeGB }, ctx.platform);
  const rec = job.id !== 'phone' && pickFor(job.id, ctx.models, ctx)?.id === m.id;
  const src = sourceOf(m);
  // Everything that explains (what it is, how it does on other machines, licence) goes in the tip; what you act on stays.
  const fits = fitLines(deviceFit(m));
  // 1.5.101: no line twice ("Runs on the processor" when the description already says so); the source is on the ↗ only.
  const where = m.vramGB ? `Wants ${gb(m.vramGB)} of graphics memory` : /runs on the processor/i.test(m.what || '') ? '' : 'Runs on the processor';
  const tip = [m.what, communityLine(m), where, m.trial ? `New: not tried on a PC yet. ${m.trialNote || ''}`.trim() : '', s.why, fits, `Licence ${m.license}${m.commercial === false ? ' (personal use only)' : ''}`].filter(Boolean).join('\n');
  const tags = `${rec ? '<span class="tag rec">★ Recommended</span>' : ''}${isNaughty(m) ? '<span class="tag warn">😈 Naughty list</span>' : isCommunity(m) ? '<span class="tag">Community</span>' : ''}${m.trial ? '<span class="tag">New</span>' : ''}${!rec && s.level !== 'ok' ? LEVEL_TAG[s.level] || '' : ''}${here ? '<span class="tag good">On this replicant matrix</span>' : ''}`;
  const on = isActive({ entry: m, value: m.id, installed: here }, ctx.active);
  const sw = job.id === 'phone' ? '<span class="muted">In the phone app</span>'
    : `<button type="button" class="mini-switch" role="switch" aria-checked="${on}" data-active="${esc(m.id)}" aria-label="Active: ${esc(m.name)}">Active <span class="st">${on ? 'On' : 'Off'}</span></button>`;
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

// 1.5.101: inside each job, models sit under one header per family (Qwen, Gemma and so on). Every family starts
// closed; pressing its header opens the list to pick from. The header says how many there are, the size range, and
// whether Bob's pick or something already here is inside, so a closed family still tells you what's in it.
// Which families are open is remembered in this browser (ctx.famOpen, keyed job:family).
export const FAMILIES = {
  Qwen: 'Made by the Qwen team at Alibaba. The biggest family here: quick little brains, big coders and thinkers, a picture reader and a picture editor.',
  Gemma: 'Made by Google. Brains that see pictures, from the phone-sized E2B to the 26B.',
  'GPT-OSS': 'Made by OpenAI, open to download. A careful thinker and reviewer.',
  Whisper: 'Made by OpenAI. Turns your voice into words.',
  'Z-Image': 'Made by Alibaba\'s Tongyi lab. Quick picture making, in sizes for big and small cards.',
  FLUX: 'Made by Black Forest Labs. Picture making and picture edits.',
  LTX: 'Made by Lightricks. Short video clips.',
  Wan: 'Made by Alibaba\'s Wan team. Short video clips that fit smaller cards.',
  Piper: 'Voices from the Piper project. Small, quick and run on the processor.',
  Kokoro: 'A pack of natural English voices.',
  Nomic: 'Made by Nomic. Helps Bob find things in his memory.',
  'ACE-Step': 'Made by ACE Studio and StepFun. Makes songs.',
};
export const familyOf = (m) => m.family || String(m.name || m.id || '').split(/[\s-]/)[0] || 'Other';
export const famKey = (job, fam) => `${job}:${fam}`;

function familyHtml(job, fam, list, ctx) {
  const pick = job.id !== 'phone' && list.some((m) => pickFor(job.id, ctx.models, ctx)?.id === m.id);
  const hereN = list.filter((m) => m.status?.state === 'installed').length;
  const sizes = list.map((m) => m.sizeGB).filter((n) => n != null);
  const lo = Math.min(...sizes), hi = Math.max(...sizes);
  const range = !sizes.length ? '' : lo === hi ? gb(lo) : `${gb(lo)} to ${gb(hi)}`;
  const open = ctx.famOpen?.[famKey(job.id, fam)] === true;
  const about = FAMILIES[fam] ? tipHtml(FAMILIES[fam], `About the ${fam} family`) : '';
  return `<details class="cat-fam" data-fam="${esc(famKey(job.id, fam))}" id="catfam-${esc(job.id)}-${esc(fam)}"${open ? ' open' : ''}>
    <summary><span class="fam-name">${esc(fam)}</span><span class="muted">${list.length} ${list.length === 1 ? 'model' : 'models'}${range ? ` · ${range}` : ''}</span>${pick ? '<span class="tag rec">★ Recommended inside</span>' : ''}${hereN ? `<span class="tag good">${hereN} on this replicant matrix</span>` : ''}${about}</summary>
    <ul class="kit-list cat-list">${list.map((m) => rowHtml(m, job, ctx)).join('')}</ul></details>`;
}

function jobHtml(job, ctx) {
  const list = modelsFor(job, ctx.models);
  // Bob's pick first, then what's here, then what fits, then the rest.
  const rank = (m) => (pickFor(job.id, ctx.models, ctx)?.id === m.id ? 0 : m.status?.state === 'installed' ? 1 : suit(m, ctx, ctx.platform).level === 'ok' ? 2 : 3);
  const sorted = [...list].sort((a, b) => rank(a) - rank(b));
  const hide = sorted.filter((m) => rank(m) === 3);
  const shown = ctx.showUnsuited ? sorted : sorted.filter((m) => !hide.includes(m));
  // Families in the order of their best model (the one with Bob's pick first), then by name.
  const fams = new Map();
  for (const m of shown) { const f = familyOf(m); if (!fams.has(f)) fams.set(f, []); fams.get(f).push(m); }
  const famOrder = [...fams.entries()].sort((a, b) => Math.min(...a[1].map(rank)) - Math.min(...b[1].map(rank)) || a[0].localeCompare(b[0]));
  const note = hide.length ? `<p class="muted unsuited-note">${ctx.showUnsuited ? '' : `${hide.length} more ${hide.length === 1 ? 'doesn\'t' : 'don\'t'} suit this replicant matrix. `}<button type="button" class="link" data-unsuited>${ctx.showUnsuited ? 'Hide the ones that don\'t suit' : 'Show them'}</button></p>` : '';
  const rule = job.id === 'gaming' ? '<p class="muted">Only brains timed answering quickly on a busy processor are listed here. Gemma 4 E4B isn\'t: it takes about half a minute there.</p>' : '';
  return `<section class="cat-job" id="catjob-${esc(job.id)}"><h3>${job.icon} ${esc(SLOT_NAMES[job.id] || job.name)} ${tipHtml(job.does, `About ${job.name}`)}</h3>${rule}
    ${famOrder.map(([f, ms]) => familyHtml(job, f, ms, ctx)).join('') || '<ul class="kit-list cat-list"><li class="muted">Nothing in Bob\'s list for this job yet.</li></ul>'}${note}</section>`;
}

// Brains on this PC that aren't in Bob's list (pulled in Ollama by hand, say): they can be made active or not too.
function othersHtml(ctx) {
  const known = new Set(ctx.models.flatMap((m) => [m.id, m.ollama, m.ollama && `${m.ollama}:latest`].filter(Boolean)));
  const others = (ctx.roles?.options?.llm || []).filter((o) => !known.has(o.value));
  if (!others.length) return '';
  return `<section class="cat-job" id="catjob-others"><h3>🔎 Other brains on this replicant matrix ${tipHtml('Brains Bob found on this replicant matrix that aren\'t in his list. He can\'t say how well they run here.', 'About other brains')}</h3><ul class="kit-list cat-list">${others.map((o) => {
    const on = isActive({ value: o.value, installed: true }, ctx.active);
    return `<li class="cat-row"><span class="kit-name">${esc(o.label)}</span><span class="cat-act"><button type="button" class="mini-switch" role="switch" aria-checked="${on}" data-active="${esc(o.value)}" aria-label="Active: ${esc(o.label)}">Active <span class="st">${on ? 'On' : 'Off'}</span></button></span></li>`;
  }).join('')}</ul></section>`;
}

export function catalogueHtml(ctx0) {
  // 1.5.132: the Well behaved / Naughty list toggle. Well behaved (the default) lists every model but the naughty ones.
  // Naughty list, only once the switch is on, lists just those, under a warning in Bob's words.
  const naughtyView = ctx0.naughtyOn === true && ctx0.naughtyView === true;
  const ctx = { ...ctx0, models: naughtyView ? (ctx0.models || []).filter(isNaughty) : visibleModels(ctx0.models, false) };
  const jobs = catJobs();
  const card = ctx.vramGB ? `${ctx.vramGB} GB graphics card${ctx.ramGB ? `, ${ctx.ramGB} GB RAM` : ''}` : 'no graphics card found';
  const n = (ctx0.models || []).filter(isNaughty).length;
  const toggle = `<div class="cat-which" role="radiogroup" aria-label="Which models to list"><span class="ttabs"><button type="button" role="radio" aria-checked="${!naughtyView}" data-naughtyview="off">😇 Well behaved</button><button type="button" role="radio" aria-checked="${naughtyView}" data-naughtyview="on"${ctx0.naughtyOn ? '' : ' aria-disabled="true"'}>😈 Naughty list${n ? ` (${n})` : ''}</button></span>${ctx0.naughtyOn ? tipHtml(NAUGHTY_WARNING, 'About the naughty list') : `<span class="muted">Off unless you turn it on: <button type="button" class="link" data-naughtyon>Show the naughty list</button> ${tipHtml(NAUGHTY_WARNING, 'About the naughty list')}</span>`}</div>`;
  if (naughtyView) {
    return `<div class="cat-top">${toggle}<p class="warn-text naughty-note">😈 ${esc(NAUGHTY_WARNING)} <button type="button" class="mini help-link" data-help="faq-naughty" aria-label="Help: the naughty list">? Help</button></p>
    <p class="muted">By the job each one does. Turn <strong>Active</strong> on for the ones you want to see in Equip Bob and the brain menus. ${keep('Downloads always ask first, with the size.')} <button type="button" class="mini" data-famall="open">Open all</button> <button type="button" class="mini" data-famall="close">Close all</button></p>
    <nav class="subnav cat-nav" aria-label="Jobs">${jobs.filter((j) => modelsFor(j, ctx.models).length).map((j) => `<button type="button" data-catjump="${esc(j.id)}"${ctx.focus === j.id ? ' aria-current="true"' : ''}>${j.icon} ${esc(SLOT_NAMES[j.id] || j.name)}</button>`).join('')}</nav></div>
    ${jobs.filter((j) => modelsFor(j, ctx.models).length).map((j) => jobHtml(j, ctx)).join('') || '<p class="muted">Nothing on the naughty list yet.</p>'}`;
  }
  return `<div class="cat-top">${toggle}<p class="muted">Every model Bob knows, by the job it does, then by family. Press a family's name to open its list. Turn <strong>Active</strong> on for the ones you want to see in Equip Bob and the brain menus. ${tipHtml(`Picked for this replicant matrix: ${card}. ★ Recommended is Bob's pick for that job here. New ones are listed but not recommended until they've been tried on real hardware. Turning Active off only hides a model; it stays on this replicant matrix (your computer). Turning it on for a model you don't have yet shows it in Equip Bob with a Get button.`, 'How the catalogue works')} ${keep('Downloads always ask first, with the size.')} <button type="button" class="mini" data-famall="open">Open all families</button> <button type="button" class="mini" data-famall="close">Close all</button> <button type="button" class="mini help-link" data-help="catalogue" aria-label="Help: the Brain catalogue">? Help</button></p>
    <nav class="subnav cat-nav" aria-label="Jobs">${jobs.map((j) => `<button type="button" data-catjump="${esc(j.id)}"${ctx.focus === j.id ? ' aria-current="true"' : ''}>${j.icon} ${esc(SLOT_NAMES[j.id] || j.name)}</button>`).join('')}</nav></div>
    ${jobs.map((j) => jobHtml(j, ctx)).join('')}${othersHtml(ctx)}`;
}
