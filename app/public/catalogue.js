// 1.5.56: the Brain catalogue. Every model in Bob's list, sorted by the job it does (the same jobs as the slots in
// Settings, Brains), with its size, how it suits this PC and smaller machines, and where it comes from (an exact Hugging Face
// commit, or Ollama). Each model has an Active switch: active models show in the slots and menus, the rest stay here,
// so the pickers stay short. Pure HTML builders; cellar.js handles the clicks.
import { findHtml } from './cat-find.js'; // 1.5.209 Find more models
import { officialTag, reapTag, REAP_LINE, isReap, fitsHere, applyFilters, sortModels, filterBarHtml, filtersOn, cleanFilters } from './cat-sort.js'; // 1.5.208 sorting, filters, maker tags
import { placeFor, quantOf, sizeLine } from './place.js';
import { canDo, suit, pickFor, deviceFit, sourceOf, SLOT_NAMES, roomOn, tooBigEverywhere } from './fit.js';
import { allSlots, isActive, tipHtml, slotValue, equipped } from './equip.js';
import { keep } from './tips.js';
import { fitOf, byFit } from './fit-sort.js';
import { esc, gb } from './util.js';

// 1.5.132: the naughty list. Catalogue entries marked `naughty: true` are uncensored community builds (heretic or
// abliterated: the refusals cut out). They are listed nowhere until the Naughty list switch (setting naughtyList) is on.
// `community` on an entry says who remixed it and from what; it's an explicit marker, never a guess from the name.
export const isNaughty = (m) => m?.naughty === true;
export const isCommunity = (m) => Boolean(m?.community && typeof m.community === 'object');
// 1.5.135: a brain of your own (a GGUF file on this replicant matrix added under ➕ Your own brains); explicit marker.
export const isOwn = (m) => m?.own === true;
// The models the rest of the window may see: the naughty ones only while the switch is on.
export const visibleModels = (models, naughtyOn) => (naughtyOn ? models : (models || []).filter((m) => !isNaughty(m)));
// One line of credit for a community build, for the "i" tip: who made it, from whose model, who packed the files.
export function communityLine(m) {
  if (!isCommunity(m)) return '';
  const c = m.community;
  const base = c.base ? ` from ${c.baseBy ? `${c.baseBy}'s ` : ''}${c.base}` : '';
  const files = c.files && c.files !== c.by && c.files !== c.team ? `; files packed by ${c.files}` : '';
  // 1.5.133: a team gets its name, and its members are listed (the owner's rule: credit visible, members on hover or tap).
  const who = c.team ? `the ${c.team} team${c.members?.length ? ` (${c.members.join(', ')})` : ''}` : c.by || 'someone in the community';
  return `Community build: ${isNaughty(m) ? 'uncensored ' : ''}remix by ${who}${base}${files}. Not a release by ${c.baseBy || 'the original maker'}.`;
}
// The maker's name as it goes on the row's tag: the person, or the team's name (members are in the tip).
export const makerOf = (m) => (isCommunity(m) ? m.community.team || m.community.by || '' : '');
// 1.5.133: the Community / Naughty list tag carries the maker's name; hover, tap or focus shows the full credit line
// (for a team: its members). Uses the same data-tip bubble as the "i" buttons, so it works on the phone and by keyboard.
export function makerTag(m) {
  if (!isCommunity(m)) return '';
  const who = makerOf(m);
  const label = isNaughty(m) ? `${DEVIL} Naughty list` : 'Community';
  return `<span class="tag${isNaughty(m) ? ' warn' : ''} maker-tag" tabindex="0" data-tip="${esc(communityLine(m))}" aria-label="${esc(`${isNaughty(m) ? 'Naughty list' : 'Community build'}, made by ${who || 'someone in the community'}`)}">${label}${who ? ` · ${esc(who)}` : ''}</span>`;
}
// 1.5.133: the naughty list's mark is a small red devil with orange horns drawn here, not a phone emoji (the owner found
// the emoji ones purple on their screen). One picture, used for the toggle, the row tag, the warning and the quiet pick.
export const DEVIL = '<svg class="devil" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2 1.5 L5 5 L3.2 6.2 Z" fill="#f28c28"/><path d="M14 1.5 L11 5 L12.8 6.2 Z" fill="#f28c28"/><circle cx="8" cy="9" r="6" fill="#d7263d"/><path d="M4.6 7.6 L6.6 8.6 M11.4 7.6 L9.4 8.6" stroke="#2b0a0e" stroke-width="1.3" stroke-linecap="round"/><circle cx="6" cy="9.5" r=".8" fill="#2b0a0e"/><circle cx="10" cy="9.5" r=".8" fill="#2b0a0e"/><path d="M5.3 11.6 Q8 14 10.7 11.6" stroke="#2b0a0e" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';
export const devil = (label) => (label ? `<span class="devil-wrap" role="img" aria-label="${esc(label)}">${DEVIL}</span>` : DEVIL);
export const NAUGHTY_WARNING = 'The naughty list is other people\'s remixes of Qwen and Gemma brains with the refusals cut out ("heretic" or "abliterated"). They are not Alibaba\'s or Google\'s releases. A brain from here answers without refusing, so what it says is on you, and it can be a little rougher than the original. I never recommend one; you pick it yourself.';


// The jobs, in the order the catalogue shows them. Names are the job names on the Brains page.
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
  // 1.5.133: on the naughty list's own side Bob's pick is a quiet one: the red devil where ★ Recommended would be.
  const recTag = !rec ? '' : ctx.naughtyPick ? `<span class="tag rec devil-rec" tabindex="0" data-tip="Bob's quiet pick for this job among the naughty list: it does the job well on this replicant matrix. Still not a release by its maker, and it answers without refusing." aria-label="Bob's quiet pick for this job">${DEVIL}</span>` : '<span class="tag rec">★ Recommended</span>';
  const src = sourceOf(m);
  // Everything that explains (what it is, how it does on other machines, licence) goes in the tip; what you act on stays.
  const fits = fitLines(deviceFit(m));
  // 1.5.101: no line twice ("Runs on the processor" when the description already says so); the source is on the ↗ only.
  const where = m.vramGB ? `Wants ${gb(m.vramGB)} of graphics memory` : /runs on the processor/i.test(m.what || '') ? '' : 'Runs on the processor';
  const out = m.published ? `Released ${dayWords(m.published)}` : '';
  const isNew = ctx.newIds?.has(m.id) === true;
  const dated = datedLine(m, ctx.allModels || ctx.models);
  const roomy = !here && s.level !== 'ok' ? roomOn(m, ctx.bobNet) : '';
  // 1.5.205: a brain bigger than the card says how it would run here (card + memory, + storage, with another Bob's
  // help) instead of "doesn't suit". Blocked ones and squeezed files for smaller cards keep their own words.
  const place = isBrain(m) && (s.level === 'slow' || s.level === 'no') && !s.squeezed && ctx.ramGB ? placeFor(m, ctx, ctx.bobNet) : null;
  // 1.5.208: the tag says how it fits (the owner: "tagging it appropriately"): with memory, with experts on the drive, or with another Bob.
  const fit = place ? fitsHere(m, ctx, ctx.bobNet) : null;
  const placeTag = place && place.where !== 'card' && place.where !== 'rent' ? `<span class="tag warn place-tag" tabindex="0" data-tip="${esc(place.why)}">${esc(fit?.ok && fit.word ? fit.word : place.word)}</span>` : '';
  // 1.5.210 "Fits your card": a brain or model that sits wholly on this machine's card (or memory, on a Mac) says so
  // on its row, worked out the same way as the Brains page. Only when this machine has been read; never on Bob's pick
  // (★ Recommended already says it) or where a slower place or a warning is shown instead.
  const fitHere = fitOf(m, ctx, ctx.bobNet, ctx.platform);
  const fitTag = fitHere?.good && !rec ? `<span class="tag good fit-tag" tabindex="0" data-tip="${esc(fitHere.why || 'Runs well here.')}">${esc(fitHere.word)}</span>` : '';
  const quant = quantOf(m);
  const tip = [m.what, communityLine(m), distilledLine(m), m.thinks ? THINKS_LINE : '', where, out, isNew ? 'New: one of the five newest releases in its family.' : '', dated, m.trial ? `${TRIAL_LINE} ${m.trialNote || ''}`.trim() : '', m.bench || '', isReap(m) ? REAP_LINE : '', quant ? `Squeezed to ${quant} (how tightly the file is packed; a lower number is smaller and a little less sharp).` : '', place && placeTag ? place.why : s.why, roomy ? `Fits ${roomy} on your Bob-Net.` : '', fits, `Licence ${m.license}${m.commercial === false ? ' (personal use only)' : ''}`].filter(Boolean).join('\n');
  const tags = `${recTag}${makerTag(m)}${officialTag(m)}${reapTag(m)}${isOwn(m) ? (m.madeByBob ? '<span class="tag own-bob" tabindex="0" data-tip="Its brain card says it was made for Bob in his own workshop. Bob runs it from where it is and leaves the pick to you.">Bob\'s own brain</span>' : '<span class="tag" data-tip="A brain you added from a file on this replicant matrix. Bob runs it from where it is and never recommends it over the ones he knows.">Your own file</span>') : ''}${isNew ? `<span class="tag new-tag" tabindex="0" data-tip="${esc(`New: one of the five newest releases in the ${familyOf(m)} family.${out ? ` ${out}.` : ''}`)}">New</span>` : ''}${dated ? `<span class="tag dated-tag" tabindex="0" data-tip="${esc(dated)}">Dated</span>` : ''}${fitTag}${!rec && s.level !== 'ok' ? placeTag || LEVEL_TAG[s.level] || '' : ''}${here ? '<span class="tag good">On this replicant matrix</span>' : ''}`;
  const on = isActive({ entry: m, value: m.id, installed: here }, ctx.active);
  const sw = job.id === 'phone' ? '<span class="muted">In the phone app</span>'
    : `<button type="button" class="mini-switch" role="switch" aria-checked="${on}" data-active="${esc(m.id)}" aria-label="Active: ${esc(m.name)}">Active <span class="st">${on ? 'On' : 'Off'}</span></button>`;
  const slot = allSlots().find((x) => x.id === job.id);
  const value = here && slot ? slotValue(slot, m, ctx.roles) : '';
  const worn = value && equipped(slot, ctx) === value;
  const act = job.id === 'phone' ? '' : worn ? '<span class="tag good">equipped</span>'
    : value ? `<button type="button" data-catequip="${esc(job.id)}" data-catvalue="${esc(value)}">Equip</button>`
    : here ? '' : isOwn(m) ? '<span class="tag warn" data-tip="Bob can\'t find the file where it was. Put it back, or remove the brain from his list under ➕ Your own brains.">File not found</span>' : (ctx.action ? ctx.action(m) : `<button class="get" data-get="${esc(m.id)}">Get</button>`);
  // 1.5.205 Remove: takes an entry that isn't on this replicant matrix off your own list (asked first; Put back at the
  // bottom of the catalogue). One that's here is deleted first, in On this replicant matrix; your own brains have their own Remove.
  const removeBtn = job.id === 'phone' || here || isOwn(m) || m.status?.state === 'partial' ? '' : `<button type="button" class="mini cat-remove" data-catremove="${esc(m.id)}" aria-label="Remove ${esc(m.name)} from my list">Remove</button>`;
  // 1.5.133: community and naughty rows look different by more than colour: a solid stripe (community) or a dashed
  // one (naughty list) down the left, a light tint, and their tags in words.
  const kind = isNaughty(m) ? ' naughty' : isCommunity(m) ? ' community' : '';
  return `<li class="cat-row model${kind}${!here && !rec && s.level !== 'ok' ? ' dim' : ''}" id="cat-${esc(job.id)}-${esc(m.id)}">
    <span class="kit-name">${esc(m.name)}</span><span class="muted">${esc(sizeLine(m))}</span>${tags}${tipHtml(tip, `About ${m.name}`)}${src ? `<a class="src-link" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer" data-tip="Where it comes from: ${esc(src.label)}" aria-label="Where ${esc(m.name)} comes from">↗</a>` : ''}
    ${m.benchReport ? `<a class="src-link bench-link" href="${esc(m.benchReport)}" target="_blank" rel="noopener noreferrer" aria-label="Full report: how ${esc(m.name)} did in its benchmark">Full report</a>` : ''}<span class="cat-act">${sw}${act}${removeBtn}</span><div class="confirm" hidden></div></li>`;
}

// 1.5.205 Add a model page: paste a model's page, then pick which of its files (one per quantization) to add.
export function addPageHtml(ctx) {
  const a = ctx.addPage || {};
  return `<section class="cat-job add-page" id="catjob-addpage"><h3>🔗 Add a model page ${tipHtml('Paste a model\'s Hugging Face or ModelScope page and I list its .gguf files, one per quantization. Tick the ones you want and they join this replicant matrix\'s list with a Get button. Each is pinned to the page as it is today and checked after it downloads. I haven\'t tried them, so I never recommend one over the brains I know.', 'About adding a model page')}</h3>
    <p class="muted">A model I don't list? Paste its page and pick which sizes to add. Only this replicant matrix's list changes. <button type="button" class="mini help-link" data-help="faq-add-page" aria-label="Help: adding a model page">? Help</button></p>
    <form class="own-form" data-addpageform><label>Model page <input type="text" data-addpageurl maxlength="400" placeholder="https://huggingface.co/owner/name-GGUF or a modelscope.cn page" value="${esc(a.url || '')}" required></label>
      ${a.error ? `<p class="error" role="alert">${esc(a.error)}</p>` : ''}${a.done ? `<p class="muted" role="status">${esc(a.done)}</p>` : ''}
      <div class="row"><button type="submit" class="get" ${a.busy ? 'disabled' : ''}>${a.busy ? 'Reading the page…' : 'Show its files'}</button></div></form></section>`;
}
// The pop-up: every choice on the page stays listed; one that can't be added is locked and says why.
export function pagePickHtml(view, hw = {}) {
  const rows = (view.choices || []).map((c, i) => {
    const pl = placeFor({ sizeGB: c.sizeGB, name: `${view.repo} ${c.key}` }, hw, hw.bobNet);
    const lock = c.added ? 'Already on your list.' : c.can ? '' : c.why;
    return `<li class="cat-row pick-row${lock ? ' locked' : ''}"><label><input type="checkbox" data-pickkey="${esc(c.key)}" ${lock ? 'disabled' : ''} aria-describedby="pick-${i}"> <strong>${esc(c.quant || c.key.split('/').pop())}</strong></label><span class="muted">${gb(c.sizeGB)}</span>${hw.ramGB ? `<span class="tag ${pl.where === 'card' ? 'ok' : 'warn'} place-tag">${esc(pl.word)}</span>` : ''}<span class="muted pick-why" id="pick-${i}">${esc(lock || c.key.split('/').pop())}</span></li>`;
  }).join('');
  return `<h3 id="pick-title">Pick what to add</h3>
    <p class="muted"><strong>${esc(view.repo)}</strong>${view.license ? ` · licence: ${esc(view.license)}` : ''}${view.reader ? ` · comes with a picture reader (${gb(view.reader.sizeGB)})` : ''}</p>
    <ul class="kit-list cat-list pick-list">${rows}</ul>
    <p class="muted">Nothing downloads yet: each one joins your list with a Get button. Not ones I've tried, so never my pick. You can remove any of them later.</p>
    <p class="error" data-pickerr role="alert" hidden></p>
    <div class="row"><button type="button" class="get" data-pickadd>Add to my list</button><button type="button" data-pickcancel>Cancel</button></div>`;
}

// 1.5.205 What you took off your own list, with a way back. The list Bob ships with is never changed.
export function removedHtml(ctx) {
  const gone = ctx.removed || [];
  if (!gone.length) return '';
  return `<details class="cat-job cat-removed" id="cat-removed"${ctx.removedOpen ? ' open' : ''}><summary>Removed from your list (${gone.length})</summary>
    <p class="muted">Entries you took off this replicant matrix's list. Put one back any time.</p>
    <ul class="kit-list cat-list">${gone.map((m) => `<li class="cat-row model"><span class="kit-name">${esc(m.name)}</span><span class="muted">${m.sizeGB != null ? gb(m.sizeGB) : ''}</span><span class="cat-act"><button type="button" class="mini" data-catputback="${esc(m.id)}" aria-label="Put ${esc(m.name)} back on the list">Put back</button></span></li>`).join('')}</ul></details>`;
}

// 1.5.101: inside each job, models sit under one header per family (Qwen, Gemma and so on). Every family starts
// closed; pressing its header opens the list to pick from. The header says how many there are, the size range, and
// whether Bob's pick or something already here is inside, so a closed family still tells you what's in it.
// Which families are open is remembered in this browser (ctx.famOpen, keyed job:family).
export const FAMILIES = {
  Qwen: 'Made by the Qwen team at Alibaba. The biggest family here: quick little brains, big coders and thinkers, a picture reader and a picture editor.',
  Gemma: 'Made by Google. Brains that see pictures, from the phone-sized E2B to the 31B.',
  Granite: 'Made by IBM. Plain, steady brains for everyday work and office jobs, from a small 3B to a 30B.',
  Mistral: 'Made by Mistral AI in France. Ministral brains that see pictures, and Devstral for coding.',
  Nemotron: 'Made by NVIDIA. Quick brains built for tools and long jobs; some see pictures.',
  DeepSeek: 'Made by DeepSeek. Their R1 thinking taught to smaller Qwen and Llama brains: each one writes out its reasoning step by step before it answers, and you can read it under Bob\'s thinking. The big DeepSeek brains are under Rented brains.',
  GLM: 'Made by Z.ai. A coding and tools brain that thinks before it answers.',
  Laguna: 'Made by Poolside. A coder that is small for what it does.',
  'GPT-OSS': 'Made by OpenAI, open to download. A careful thinker and reviewer.',
  Whisper: 'Made by OpenAI. Turns your voice into words.',
  'Z-Image': 'Made by Alibaba\'s Tongyi lab. Quick picture making, in sizes for big and small cards.',
  FLUX: 'Made by Black Forest Labs. Picture making and picture edits.',
  LTX: 'Made by Lightricks. Short video clips.',
  Wan: 'Made by Alibaba\'s Wan team. Short video clips that fit smaller cards.',
  Piper: 'Voices from the Piper project. Small, quick and run on the processor.',
  Kokoro: 'A pack of natural English voices.',
  Nomic: 'Made by Nomic. Helps Bob find things in his memory.',
  Bob: 'Brains made for Bob in his own workshop from open Qwen brains, and benchmarked before they reach you. 28Bob Riker and 35Bob Bobert are in the list and are my picks for their jobs where they run well; others can be added from a file with its brain card, under ➕ Your own brains.',
  'Your own': 'Brains you added from files on this replicant matrix (➕ Your own brains, at the end of the Well behaved list). Bob only knows what each file says about itself.',
  'ACE-Step': 'Made by ACE Studio and StepFun. Makes songs.',
};
export const familyOf = (m) => m.family || String(m.name || m.id || '').split(/[\s-]/)[0] || 'Other';
export const famKey = (job, fam) => `${job}:${fam}`;

// 1.5.137: "New" means released lately, not "not tried yet" (the owner: "new if they are perhaps the 5 most recent
// releases in a model family"). Every brain carries a `published` date (YYYY-MM-DD, when its maker put it out); a brain
// is New when that date is one of the five newest release dates in its family among the brains shown, and no more than
// a year old (so a small family's old brains don't stay New for ever). Brains with no date are never New.
export const NEW_PER_FAMILY = 5, NEW_FOR_DAYS = 365;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function newIds(models, { now = Date.now() } = {}) {
  const dated = (models || []).filter((m) => m.jobs && DATE_RE.test(m.published || '') && now - Date.parse(m.published) <= NEW_FOR_DAYS * 864e5);
  const top = new Map();
  for (const m of dated) { const f = familyOf(m); if (!top.has(f)) top.set(f, new Set()); top.get(f).add(m.published); }
  for (const [f, s] of top) top.set(f, new Set([...s].sort().reverse().slice(0, NEW_PER_FAMILY)));
  return new Set(dated.filter((m) => top.get(familyOf(m)).has(m.published)).map((m) => m.id));
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayWords = (d) => (DATE_RE.test(d || '') ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}` : '');
// 1.5.137: "Dated": a brain newer ones do better. It stays on the list (nothing is taken away); the tag and its tip say
// which newer brains to look at. Explicit marker in catalog.json: dated: { newer: [ids], why }.
export function datedLine(m, all = []) {
  if (!m?.dated) return '';
  const names = [].concat(m.dated.newer || []).map((id) => all.find((x) => x.id === id)?.name).filter(Boolean);
  return `Dated: ${String(m.dated.why || 'newer brains do this job better').replace(/\.$/, '')}.${names.length ? ` Newer ones to try: ${names.join(', ')}.` : ''} It stays on the list; nothing is taken away.`;
}
// A brain taught by a bigger one (catalog.json distilledFrom: { teacher, base, baseBy }), and one that writes out its
// thinking before it answers (thinks: true): one line each in the i tip.
export const distilledLine = (m) => (m?.distilledFrom?.teacher ? `Taught to think by ${m.distilledFrom.teacher}, on ${m.distilledFrom.baseBy ? `${m.distilledFrom.baseBy}'s ` : ''}${m.distilledFrom.base || 'a smaller brain'}.` : '');
export const THINKS_LINE = 'Writes out its thinking before it answers; you can read it under Bob\'s thinking.';
export const TRIAL_LINE = 'Not tried on a real replicant matrix yet, so I don\'t recommend it yet.';

function familyHtml(job, fam, list, ctx) {
  const pick = job.id !== 'phone' && list.some((m) => pickFor(job.id, ctx.models, ctx)?.id === m.id);
  const hereN = list.filter((m) => m.status?.state === 'installed').length;
  const sizes = list.map((m) => m.sizeGB).filter((n) => n != null);
  const lo = Math.min(...sizes), hi = Math.max(...sizes);
  const range = !sizes.length ? '' : lo === hi ? gb(lo) : `${gb(lo)} to ${gb(hi)}`;
  const open = ctx.famOpen?.[famKey(job.id, fam)] === true;
  const about = FAMILIES[fam] ? tipHtml(FAMILIES[fam], `About the ${fam} family`) : '';
  return `<details class="cat-fam" data-fam="${esc(famKey(job.id, fam))}" id="catfam-${esc(job.id)}-${esc(fam)}"${open ? ' open' : ''}>
    <summary><span class="fam-name">${esc(fam)}</span><span class="muted">${list.length} ${list.length === 1 ? 'model' : 'models'}${range ? ` · ${range}` : ''}</span>${pick ? (ctx.naughtyPick ? `<span class="tag rec devil-rec" aria-label="Bob's quiet pick is inside">${DEVIL} inside</span>` : '<span class="tag rec">★ Recommended inside</span>') : ''}${hereN ? `<span class="tag good">${hereN} on this replicant matrix</span>` : ''}${about}</summary>
    <ul class="kit-list cat-list">${list.map((m) => rowHtml(m, job, ctx)).join('')}</ul></details>`;
}

// Bigger than the card but it still runs here: with the rest in memory, partly from the drive, or with another Bob.
const isBrain = (m) => Boolean(m?.jobs) && ['chat', 'coding', 'vision'].includes(m.category);
function runsSomehow(m, ctx) {
  const s = suit(m, ctx, ctx.platform);
  if (s.level === 'blocked' || s.squeezed || !ctx.ramGB || !ctx.vramGB || !isBrain(m)) return false;
  return placeFor(m, ctx, ctx.bobNet).where !== 'rent';
}

function jobHtml(job, ctx) {
  // 1.5.137: a brain too big for this replicant matrix and for every Bob on your Bob-Net isn't listed here at all; it's
  // under Rented brains (and the Lab), where a rented card can run it. Installed ones always stay.
  const all = modelsFor(job, ctx.models);
  const list = all.filter((m) => !tooBigEverywhere(m, ctx, ctx.bobNet, ctx.platform));
  const away = all.length - list.length;
  // Bob's pick first, then what's here, then what fits, then the rest.
  const rank = (m) => (pickFor(job.id, ctx.models, ctx)?.id === m.id ? 0 : m.status?.state === 'installed' ? 1 : suit(m, ctx, ctx.platform).level === 'ok' ? 2 : runsSomehow(m, ctx) ? 2.5 : 3);
  const sorted = [...list].sort((a, b) => rank(a) - rank(b));
  const hide = sorted.filter((m) => rank(m) === 3);
  const shown = ctx.showUnsuited ? sorted : sorted.filter((m) => !hide.includes(m));
  // Families in the order of their best model (the one with Bob's pick first), then by name.
  const fams = new Map();
  for (const m of shown) { const f = familyOf(m); if (!fams.has(f)) fams.set(f, []); fams.get(f).push(m); }
  const sortBy = cleanFilters(ctx.filters).sort;
  const flat = sortBy === 'bob' ? '' : `<ul class="kit-list cat-list cat-flat${sortBy === 'fit' ? ' fit-list' : ''}">${(sortBy === 'fit' ? byFit(shown, ctx, ctx.bobNet, ctx.platform) : sortModels(shown, sortBy)).map((m) => rowHtml(m, job, ctx)).join('')}</ul>`; // 1.5.208 a picked sort lists the job's models in one run, not by family
  const famOrder = [...fams.entries()].sort((a, b) => Math.min(...a[1].map(rank)) - Math.min(...b[1].map(rank)) || a[0].localeCompare(b[0]));
  const note = hide.length ? `<p class="muted unsuited-note">${ctx.showUnsuited ? '' : `${hide.length} more ${hide.length === 1 ? 'doesn\'t' : 'don\'t'} suit this replicant matrix. `}<button type="button" class="link" data-unsuited>${ctx.showUnsuited ? 'Hide the ones that don\'t suit' : 'Show them'}</button></p>` : '';
  const rentNote = away ? `<p class="muted too-big-note">${away} more ${away === 1 ? 'is' : 'are'} too big for this replicant matrix${ctx.bobNet?.length ? ' and every Bob on your Bob-Net' : ''}. ${away === 1 ? 'It\'s' : 'They\'re'} listed under <button type="button" class="link" data-rentsettings>Rented brains</button>, where a rented graphics card can run ${away === 1 ? 'it' : 'them'}.</p>` : '';
  const rule = job.id === 'gaming' ? '<p class="muted">Only brains timed answering quickly on a busy processor are listed here. Gemma 4 E4B isn\'t: it takes about half a minute there.</p>' : '';
  return `<section class="cat-job" id="catjob-${esc(job.id)}"><h3>${job.icon} ${esc(SLOT_NAMES[job.id] || job.name)} ${tipHtml(job.does, `About ${job.name}`)}</h3>${rule}
    ${(shown.length && flat) || famOrder.map(([f, ms]) => familyHtml(job, f, ms, ctx)).join('') || `<ul class="kit-list cat-list"><li class="muted">${filtersOn(ctx.filters) ? 'Nothing here matches the filters above.' : 'Nothing in Bob\'s list for this job yet.'}</li></ul>`}${note}${rentNote}</section>`;
}

// 1.5.135: ➕ Your own brains: GGUF files on this replicant matrix that you put on Bob's list yourself. The rows
// themselves sit in the jobs above (family "Your own"); this section is where you add one or take one off the list.
// ctx.ownForm = the Add form in progress ({ file, name, params, sizeGB, mmproj, error, busy }) or null.
export function ownHtml(ctx) {
  const own = (ctx.models || []).filter(isOwn);
  const f = ctx.ownForm;
  // 1.5.135 (review): no file picker (some Linux desktops) or one that won't open: type the file's path instead.
  const pathStep = f && !f.file ? `<form class="own-form" data-ownform data-ownpathform>
      <label>The brain file's full path (.gguf) <input type="text" data-ownpath spellcheck="false" autocomplete="off" value="${esc(f.typed || '')}" required></label>
      ${f.error ? `<p class="error">${esc(f.error)}</p>` : ''}
      <div class="row"><button type="submit" class="get" ${f.busy ? 'disabled' : ''}>Use this file</button><button type="button" data-owncancel>Cancel</button></div></form>` : '';
  const form = !f ? '' : pathStep || `<form class="own-form" data-ownform>
      <p><strong>${esc(f.name || 'Your brain')}</strong> <span class="muted">${f.sizeGB ? gb(f.sizeGB) : ''}${f.params ? ` · about ${f.params}B` : ''}</span><br><span class="muted own-path">${esc(f.file)}</span></p>
      <label>What Bob should call it <input type="text" data-ownname maxlength="60" value="${esc(f.name || '')}" required></label>
      <p class="muted">Picture reader: ${f.mmproj ? `<span class="own-path">${esc(f.mmproj)}</span> <button type="button" class="mini" data-ownmm="clear">None</button>` : `none <button type="button" class="mini" data-ownmm="pick">Pick its picture reader (optional)</button>`} ${tipHtml('If the brain can see pictures, its maker also gives a small "mmproj" file. Add it and the brain goes under Seeing pictures too. Without it the brain still works, just without sight.', 'About picture readers')}</p>
      ${f.card ? `<p class="muted own-card">${esc(`Brain card found: it files under ${f.card.jobs?.length ? f.card.jobs.map((j) => SLOT_NAMES[j] || j).join(', ') : 'the jobs Bob guesses from its size'}${f.card.family ? `, in the ${f.card.family} family` : ''}${f.card.benchmarked ? ', with its benchmark' : ''}.`)}</p>` : ''}
      ${f.error ? `<p class="error">${esc(f.error)}</p>` : ''}
      <div class="row"><button type="submit" class="get" data-owndo ${f.busy ? 'disabled' : ''}>Add to Bob's list</button><button type="button" data-owncancel>Cancel</button></div></form>`;
  return `<section class="cat-job own-brains" id="catjob-own"><h3>➕ Your own brains ${tipHtml('A brain file (.gguf) already on this replicant matrix: something you downloaded yourself, made yourself, or a model Bob\'s list doesn\'t have. It joins his list with an Active switch and shows up on the Brains page and the brain menus like any other, running on Bob\'s built-in engine from where the file is. Bob never moves, copies or deletes the file, and never recommends it over the brains he knows. Remove only takes it off his list.', 'About your own brains')}</h3>
    <p class="muted">Got a brain file Bob's list doesn't have? Add it here and it's yours to equip. <button type="button" class="mini help-link" data-help="faq-own-brain" aria-label="Help: your own brains">? Help</button></p>
    ${own.length ? `<ul class="kit-list cat-list">${own.map((m) => `<li class="cat-row model" id="own-${esc(m.id)}"><span class="kit-name">${esc(m.name)}</span><span class="muted">${m.sizeGB ? gb(m.sizeGB) : ''}</span>${m.status?.state === 'installed' ? '' : '<span class="tag warn">File not found</span>'}<span class="muted own-path">${esc(m.ownFile || '')}</span><span class="cat-act"><button type="button" class="mini" data-ownremove="${esc(m.id)}">Remove from Bob's list</button></span><div class="confirm" hidden></div></li>`).join('')}</ul>` : ''}
    ${form || '<p><button type="button" class="get" data-ownadd>➕ Add a brain from a file</button> <button type="button" class="link" data-ownpathopen>or type its path</button></p>'}</section>`;
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

export const VIEWS = ['well', 'community', 'naughty'];
// Which models each side of the toggle shows. Well behaved: everything but the naughty list (community builds included,
// since a well-behaved one can be Bob's pick once it has been tried). Community: only builds other people made that still
// behave. Naughty list: only the uncensored ones, and only once the switch is on.
export function modelsForView(models, view, naughtyOn) {
  const all = models || [];
  if (view === 'naughty' && naughtyOn === true) return all.filter(isNaughty);
  if (view === 'community') return all.filter((m) => isCommunity(m) && !isNaughty(m));
  return visibleModels(all, false);
}

export function catalogueHtml(ctx0) {
  // 1.5.132: the Well behaved / Naughty list toggle; 1.5.133 adds Community in the middle and a red devil for the list.
  const view = ctx0.naughtyOn === true && (ctx0.naughtyView === true || ctx0.catView === 'naughty') ? 'naughty' : ctx0.catView === 'community' ? 'community' : 'well';
  const viewModels = modelsForView(ctx0.models, view, ctx0.naughtyOn);
  const shownModels = applyFilters(viewModels, ctx0.filters, ctx0, ctx0.bobNet); // 1.5.208
  const bar = filterBarHtml(ctx0.filters, viewModels.filter((m) => m.jobs), shownModels.filter((m) => m.jobs).length);
  const ctx = { ...ctx0, models: shownModels, allModels: ctx0.models || [], naughtyPick: view === 'naughty', newIds: newIds(shownModels.filter((m) => !tooBigEverywhere(m, ctx0, ctx0.bobNet, ctx0.platform)), { now: ctx0.now || Date.now() }) };
  const jobs = catJobs();
  const card = ctx.vramGB ? `${ctx.vramGB} GB graphics card${ctx.ramGB ? `, ${ctx.ramGB} GB RAM` : ''}` : 'no graphics card found';
  const nNaughty = (ctx0.models || []).filter(isNaughty).length, nComm = modelsForView(ctx0.models, 'community').length;
  const radio = (id, label, extra = '') => `<button type="button" role="radio" aria-checked="${view === id}" data-catview="${id}"${extra}>${label}</button>`;
  const toggle = `<div class="cat-which" role="radiogroup" aria-label="Which models to list"><span class="ttabs">${radio('well', '😇 Well behaved')}${radio('community', `🤝 Community${nComm ? ` (${nComm})` : ''}`)}${radio('naughty', `${DEVIL} Naughty list${nNaughty ? ` (${nNaughty})` : ''}`, ctx0.naughtyOn ? '' : ' aria-disabled="true"')}</span>${ctx0.naughtyOn ? tipHtml(NAUGHTY_WARNING, 'About the naughty list') : `<span class="muted">Off unless you turn it on: <button type="button" class="link" data-naughtyon>Show the naughty list</button> ${tipHtml(NAUGHTY_WARNING, 'About the naughty list')}</span>`}</div>`;
  const nav = `<nav class="subnav cat-nav" aria-label="Jobs">${jobs.filter((j) => view === 'well' || modelsFor(j, ctx.models).length).map((j) => `<button type="button" data-catjump="${esc(j.id)}"${ctx.focus === j.id ? ' aria-current="true"' : ''}>${j.icon} ${esc(SLOT_NAMES[j.id] || j.name)}</button>`).join('')}</nav>`;
  const famBtns = '<button type="button" class="mini" data-famall="open">Open all families</button> <button type="button" class="mini" data-famall="close">Close all</button>';
  if (view === 'naughty') {
    return `<div class="cat-top">${toggle}<p class="warn-text naughty-note">${devil('Naughty list')} ${esc(NAUGHTY_WARNING)} <button type="button" class="mini help-link" data-help="faq-naughty" aria-label="Help: the naughty list">? Help</button></p>
    <p class="muted">By the job each one does. Turn <strong>Active</strong> on for the ones you want to see on the Brains page and the brain menus. ${tipHtml(`A red devil on its own, where ★ Recommended would be, is my quiet pick for that job among the naughty list: it does the job well on this replicant matrix (${card}). Brains not tried on a real replicant matrix yet aren't picked.`, 'About the quiet pick')} ${keep('Downloads always ask first, with the size.')} ${famBtns}</p>${bar}${nav}</div>
    ${jobs.filter((j) => modelsFor(j, ctx.models).length).map((j) => jobHtml(j, ctx)).join('') || '<p class="muted">Nothing on the naughty list yet.</p>'}`;
  }
  if (view === 'community') {
    return `<div class="cat-top">${toggle}<p class="muted">Builds other people made from stock brains that still behave: a fine-tune, a distillation or a repack. Not the makers' own releases; each row's <strong>i</strong> says who made it and from what. They're in the Well behaved list too. ${tipHtml(`A community build can be ★ Recommended like any other, once it has been tried on a real replicant matrix and does its job well there. Ones not tried yet are listed but not picked until then. Picked for this replicant matrix: ${card}.`, 'How community builds are picked')} ${keep('Downloads always ask first, with the size.')} <button type="button" class="mini help-link" data-help="faq-community" aria-label="Help: community builds">? Help</button> ${famBtns}</p>${bar}${nav}</div>
    ${jobs.filter((j) => modelsFor(j, ctx.models).length).map((j) => jobHtml(j, ctx)).join('') || '<p class="muted">No community builds in Bob\'s list yet.</p>'}`;
  }
  return `<div class="cat-top">${toggle}<p class="muted">Every model Bob knows, by the job it does, then by family. Press a family's name to open its list. Turn <strong>Active</strong> on for the ones you want to see on the Brains page and the brain menus. ${tipHtml(`Picked for this replicant matrix: ${card}. ★ Recommended is Bob's pick for that job here. Brains not tried on a real replicant matrix yet are listed but not recommended. New means one of the five newest releases in its family; Dated means newer brains do its job better (it stays on the list). Turning Active off only hides a model; it stays on this replicant matrix (your computer). Turning it on for a model you don't have yet shows it on the Brains page with a Get button.`, 'How the catalogue works')} ${keep('Downloads always ask first, with the size.')} ${famBtns} <button type="button" class="mini help-link" data-help="catalogue" aria-label="Help: the Brain catalogue">? Help</button></p>
    ${bar}${nav}</div>
    ${jobs.map((j) => jobHtml(j, ctx)).join('')}${ownHtml(ctx)}${findHtml(ctx)}${addPageHtml(ctx)}${othersHtml(ctx)}${removedHtml(ctx)}`;
}

// 1.5.137: the brains Rented brains offers to fill in Add a rental: the really big ones (catalog.json bigBrains, too big
// for any home computer) and the catalogue brains too big for this replicant matrix and every Bob on the Bob-Net.
// card = the card size to suggest; cards = how many it needs on one machine (Settings never picks more than 1 by itself:
// the many-cards warning comes when you change it). answerOnly = too big to rent as one machine: pay per answer only.
const CARD_SIZES = [24, 48, 80, 141];
export function rentPicks(models = [], bigBrains = [], hw = {}, rooms = [], platform = '') {
  // A squeezed (Q3) file is for small cards only, so a rented card gets the full one.
  const cat = (models || []).filter((m) => m.rentAs && !isOwn(m) && !m.maxCardGB && tooBigEverywhere(m, hw, rooms, platform)).map((m) => {
    const card = CARD_SIZES.find((c) => c >= (m.vramGB || 0) + 4) || 141;
    return { key: `cat:${m.id}`, name: m.name, group: 'too-big', model: m.rentAs, hf: m.rentAs.split('/').slice(0, 2).join('/'), card: String(card), cards: 1, naughty: isNaughty(m), published: m.published || '' };
  });
  const big = (bigBrains || []).map((b) => ({ key: `big:${b.id}`, name: b.name, group: 'big', model: b.rent?.answerOnly ? '' : b.hf, hf: b.hf, card: String(b.rent?.card || 141), cards: Number(b.rent?.cards) || 1, answerOnly: b.rent?.answerOnly === true, what: b.what || '', published: b.published || '', by: b.by || '' }));
  return [...big, ...cat];
}
