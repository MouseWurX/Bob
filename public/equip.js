// "Equip Bob": a paper-doll screen. Bob stands in the middle with a slot for every job; the models on this PC
// are his kit. Pick a slot, then click a model in the kit (or drag it onto the slot) to equip it. Only kit that
// fits a slot goes in it. Empty slots say what Bob can't do yet, with a Get button for a recommended model.
// Nothing is ever equipped by itself. Pure HTML builders; cellar.js handles the clicks.
import { packFor, canDo, suit, pickFor } from './fit.js';
import { houseStyleHtml, houseGroupOf } from './house-style.js';
import { tip } from './tips.js';
export { packFor };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gb = (n) => (n == null ? '' : n >= 1 ? `${(+n).toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.round(n * 1000)} MB`);

// side: which column around Bob. how: where the choice is saved (job = Model roles, brain = a session brain,
// embed = housekeeping's topic matcher). cats: catalog categories that fit. off: can it be emptied, and what then.
export const SLOTS = [
  { id: 'bob', name: 'Brain', icon: '🧠', side: 'L', how: 'job', kind: 'llm', cats: ['chat', 'coding'], does: 'Thinks, chats and plans. Everything else hangs off this.', empty: "No brain: Bob can't think or chat" },
  { id: 'small', name: 'Quick brain', icon: '⚡', side: 'L', how: 'brain', kind: 'llm', cats: ['chat'], does: 'A small, fast brain for quick answers and the Art session, so the painter keeps the card.', empty: 'No quick brain: the Art session has nothing small to run' },
  // 1.5.56: the session brains are slots too, so every brain is equipped in one place.
  { id: 'gaming', name: 'Gaming', icon: '🎮', side: 'L', how: 'brain', kind: 'llm', cats: ['chat'], does: 'Chats on the processor while you play, so your game keeps the graphics card. Only brains timed for that go here.', empty: 'No gaming brain: chat waits while Gaming is on' },
  { id: 'deep', name: 'Deep thinking', icon: '🔭', side: 'L', how: 'brain', kind: 'llm', cats: ['chat', 'coding'], does: 'The strongest thinker, for Medium, High and Extreme effort.', empty: 'Uses the Review or main brain' },
  { id: 'tinker', name: 'Coding', icon: '🔨', side: 'L', how: 'job', kind: 'llm', cats: ['coding', 'chat'], does: 'Writes and fixes code.', empty: 'No coding brain: the main brain codes', off: true },
  { id: 'reviewer', name: 'Review', icon: '🧐', side: 'L', how: 'job', kind: 'llm', cats: ['chat', 'coding'], does: 'Checks code and plans carefully before you rely on them.', empty: 'Empty: the main brain checks its own work', off: true },
  { id: 'office', name: 'Office', icon: '📊', side: 'L', how: 'brain', kind: 'llm', cats: ['chat', 'coding'], does: 'One all-rounder that does everything in the Office session: writing, spreadsheets, research and planning.', empty: 'Uses the Spreadsheets helper or the main brain' },
  { id: 'eyes', name: 'Seeing pictures', icon: '👁', side: 'L', how: 'job', kind: 'llm', cats: ['vision'], does: 'Looks at pictures and screenshots you attach.', empty: "Empty: the main brain must see pictures itself, or Bob can't", off: true },
  { id: 'voice', name: 'Hearing you', icon: '👂', side: 'R', how: 'job', kind: 'voice', cats: ['voice'], does: 'Turns your voice into text (🎙 and "Hey Bob").', empty: "Empty: Bob can't hear you" },
  { id: 'speech', name: 'Voice', icon: '🔊', side: 'R', how: 'job', kind: 'speech', cats: ['speech'], does: 'Reads his replies aloud.', empty: 'Uses the Windows voice', off: 'windows' },
  { id: 'image', name: 'Painter', icon: '🎨', side: 'R', how: 'job', kind: 'images', cats: ['images'], does: 'Paints new pictures.', empty: "Empty: Bob can't make pictures" },
  { id: 'edit', name: 'Picture editor', icon: '✂', side: 'R', how: 'job', kind: 'edit', cats: ['images'], editOnly: true, does: 'Edits a picture, or keeps a character looking the same.', empty: "Empty: Bob can paint new pictures but can't edit them" },
  { id: 'video', name: 'Video', icon: '🎞', side: 'R', how: 'job', kind: 'video', cats: ['video'], does: 'Films short clips.', empty: "Empty: Bob can't make clips" },
  { id: 'music', name: 'Music', icon: '🎵', side: 'R', how: 'job', kind: 'music', cats: [], engine: 'audio', does: 'Composes songs and background music.', empty: "Empty: Bob can't compose" },
  { id: 'sfx', name: 'Sound effects', icon: '💥', side: 'R', how: 'job', kind: 'sfx', cats: [], engine: 'audio', does: 'Makes short sounds for games and videos.', empty: "Empty: Bob can't make sound effects" },
  { id: 'embed', name: 'Memory (finding past chats)', icon: '🗂', side: 'R', how: 'embed', kind: 'embed', cats: ['embed'], does: 'Matches what you say to past Topics by meaning, not just words.', empty: 'Topics are matched by words (works, a bit less clever)' }
];
export const HELPERS = [
  { id: 'ledger', name: 'Spreadsheets', icon: '📊', how: 'job', kind: 'llm', cats: ['chat'], does: 'Data entry and spreadsheets.', empty: 'Uses the main brain', off: true },
  { id: 'scout', name: 'Research', icon: '🧭', how: 'job', kind: 'llm', cats: ['chat'], does: 'Web research with sources.', empty: 'Uses the main brain', off: true },
  { id: 'painter', name: 'Prompt writer', icon: '🖋', how: 'job', kind: 'llm', cats: ['chat'], does: 'Writes the picture and video prompts.', empty: 'Uses the main brain', off: true }
];
export const allSlots = () => [...SLOTS, ...HELPERS];

// The catalog entry behind a choice (by id or Ollama name), for its weight, size and licence.
export function entryOf(models, value) {
  if (!value) return null;
  return models.find((m) => m.id === value || m.ollama === value) || null;
}

// What's in each slot now.
export function equipped(slot, { roles, brains, embed }) {
  if (slot.how === 'brain') return brains?.[slot.id] || '';
  if (slot.how === 'embed') return embed || '';
  return roles?.current?.[slot.id] || '';
}

// Kit for a slot: what's on this PC (from Model roles), and catalog models not downloaded yet. Only models that
// can do the slot's job are listed: a brain that can't see never shows under Seeing pictures, a big brain never under Quick brain.
export function kitFor(slot, { roles, models }) {
  const able = (entry, o) => slot.kind !== 'llm' || canDo(slot.id, { entry, name: o?.value, caps: o?.caps });
  const have = (roles?.options?.[slot.kind] || []).map((o) => ({ ...o, entry: entryOf(models, o.value), installed: true })).filter((k) => able(k.entry, k));
  const haveIds = new Set(have.map((h) => h.entry?.id).filter(Boolean));
  const shop = models.filter((m) => slot.cats.includes(m.category) && Boolean(m.use?.painter?.sdcpp?.edit) === Boolean(slot.editOnly) && m.status?.state !== 'installed' && !m.gated && !haveIds.has(m.id) && able(m))
    .map((m) => ({ value: m.id, label: m.name, entry: m, installed: false }));
  return [...have, ...shop];
}

// Can this slot take this value (a model on this PC)? For dragging and "Also use it for".
export function slotTakes(slot, value, { roles, models }) {
  if (!slot || slot.kind !== 'llm') return true;
  const o = (roles?.options?.llm || []).find((x) => x.value === value);
  return canDo(slot.id, { entry: entryOf(models, value), name: value, caps: o?.caps });
}

// How each kit item stands for this slot on this PC: Bob's pick for the job, fits the card, or doesn't suit (with why).
export function kitFit(k, slot, ctx) {
  const e = k.entry;
  if (!e) return { rec: false, level: 'unknown' };
  const s = suit(e, { vramGB: ctx.vramGB, ramGB: ctx.ramGB, freeGB: ctx.freeGB }, ctx.platform);
  const pick = pickFor(slot.id, ctx.models || [], ctx);
  return { ...s, rec: pick?.id === e.id, recWhy: pick?.id === e.id ? pick.why : '' };
}

const stats = (e, fallback = '') => {
  if (!e) return fallback;
  return [e.sizeGB != null && `Size ${gb(e.sizeGB)}`, e.vramGB ? `uses ${gb(e.vramGB)} of graphics memory` : 'runs on the processor', e.license && `licence ${e.license}${e.commercial === false ? ' (personal use)' : ''}`].filter(Boolean).join(' · ');
};

function slotHtml(slot, ctx) {
  const cur = equipped(slot, ctx);
  const opt = cur && [...(ctx.roles?.options?.[slot.kind] || [])].find((o) => o.value === cur);
  const e = entryOf(ctx.models, cur);
  const name = (opt && opt.label !== cur ? opt.label : e?.name) || cur;
  const sel = ctx.selected === slot.id;
  const canOff = cur && slot.off && !(slot.off === 'windows' && cur === 'windows');
  const covers = cur && slot.kind === 'llm' ? allSlots().filter((s) => s.kind === 'llm' && equipped(s, ctx) === cur).length : 0;
  return `<div class="slot${cur && cur !== 'windows' ? ' on' : ''}${sel ? ' sel' : ''}" data-slot="${esc(slot.id)}" data-kind="${esc(slot.kind)}">
    <button type="button" class="slot-pick" data-slotpick="${esc(slot.id)}" aria-pressed="${sel}" title="${esc(slot.does)}">
      <span class="slot-icon" aria-hidden="true">${slot.icon}</span>
      <span class="slot-text"><strong>${esc(slot.name)}</strong><br>${cur && !(slot.off === 'windows' && cur === 'windows') ? `<span>${esc(name)}</span>${e?.vramGB ? ` <span class="weight">${gb(e.vramGB)}</span>` : ''}${covers > 1 ? ` <span class="tag good" title="One model doing several jobs loads once">covers ${covers} slots</span>` : ''}` : `<span class="muted">${esc(slot.empty)}</span>`}</span>
    </button>${canOff ? `<button type="button" class="mini unequip" data-unequip="${esc(slot.id)}" title="Take it off" aria-label="Take ${esc(name)} off ${esc(slot.name)}">✕</button>` : ''}</div>`;
}

const REC_TAG = '<span class="tag rec">★ Recommended for this job on your PC</span>';
const FIT_TAG = '<span class="tag">Fits your card</span>';
function fitTags(f, ctx = {}) {
  if (f.level === 'unknown') return '<span class="muted fit-why">Not in Bob\'s list, so he can\'t say how well it runs here.</span>';
  const tags = `${f.rec ? `${REC_TAG}<span class="muted fit-why">${esc(f.recWhy)}</span>` : ''}${f.fits && !f.rec ? (ctx?.integrated ? FIT_TAG.replace('your card', 'your PC') : ctx?.unified ? FIT_TAG.replace('your card', 'your Mac') : FIT_TAG) : ''}${f.level !== 'ok' && !f.rec ? `<span class="tag warn">${f.level === 'blocked' ? 'Can\'t install on this PC' : 'Doesn\'t suit this PC'}</span>` : ''}`;
  return `${tags}${f.why ? `<span class="muted fit-why">${esc(f.why)}</span>` : ''}`;
}

// 1.5.56: Active models. The Brain catalogue has an Active switch on each model; only active ones show in the slots and
// menus, so the pickers stay short. Not set yet: a model on this PC is active, one that isn't downloaded isn't.
// What's equipped always shows. Keys are catalog ids, or the engine's name for models that aren't in Bob's list.
export const activeKey = (k) => k.entry?.id || k.value;
export function isActive(k, active = {}) {
  const v = active?.[activeKey(k)];
  return typeof v === 'boolean' ? v : Boolean(k.installed);
}

// A little "i" with the detail: the shared tip bubble (public/tips.js) opens it on hover, keyboard focus and tap.
// Plain text in; each new line becomes a line in the bubble.
export const tipHtml = (text, about = '') => text ? tip(esc(text).replace(/\n/g, '<br>'), String(about).replace(/^About /, '')) : '';

// Which kit shows for a slot: active models that can do the job, what's equipped, and Bob's pick while the slot is empty.
export function shownKit(slot, ctx) {
  const cur = equipped(slot, ctx);
  const rank = (f) => (f.rec ? 0 : f.level === 'ok' ? 1 : f.level === 'unknown' ? 2 : 3);
  const all = kitFor(slot, ctx).map((k) => ({ k, f: kitFit(k, slot, ctx) })).sort((a, b) => rank(a.f) - rank(b.f));
  const shown = all.filter(({ k, f }) => k.value === cur || isActive(k, ctx.active) || (!cur && f.rec));
  return { shown, hidden: all.length - shown.length };
}

function kitHtml(slot, ctx) {
  if (!slot) return '<p class="muted">Pick a slot around Bob to see what fits it.</p>';
  const cur = equipped(slot, ctx);
  // Bob's pick first, then what fits, then the rest. What's equipped stays where it is in that order.
  const { shown: all, hidden } = shownKit(slot, ctx);
  // Downloads that won't run well here wait behind "Show models that don't suit this PC" (off unless you turn it on).
  const hiddenOnes = all.filter(({ k, f }) => !k.installed && !f.rec && f.level !== 'ok');
  const kit = ctx.showUnsuited ? all : all.filter((x) => !hiddenOnes.includes(x));
  const items = kit.map(({ k, f }) => {
    const e = k.entry;
    // 1.5.56: one short line per model; the size, licence and Bob's reasons sit behind ⓘ (and in the hover tip).
    const tip = [stats(e, k.installed ? 'On this PC' : ''), f.rec ? f.recWhy : '', f.why, f.level === 'unknown' ? 'Not in Bob\'s list, so he can\'t say how well it runs here' : '', e?.trial ? 'New: not tried on a PC yet' : ''].filter(Boolean).join(' · ');
    const tag = f.rec ? '<span class="tag rec">★ Recommended</span>' : f.level === 'unknown' ? '' : f.level !== 'ok' ? `<span class="tag warn">${f.level === 'blocked' ? 'Can\'t install here' : 'Doesn\'t suit this PC'}</span>` : '';
    const weight = e?.vramGB ? `<span class="weight muted">${gb(e.vramGB)}</span>` : '';
    if (!k.installed) {
      return `<li class="kit shop model${f.level !== 'ok' && !f.rec ? ' dim' : ''}" title="${esc(tip)}"><span class="kit-name">${esc(k.label)}</span>${weight}${tag}${tipHtml(tip, `About ${k.label}`)}
        <button type="button" class="get" data-get="${esc(k.value)}">Get</button><div class="confirm" hidden></div></li>`;
    }
    const heavy = f.level === 'slow' || f.level === 'no';
    return `<li class="kit${k.value === cur ? ' worn' : ''}${heavy ? ' heavy' : ''}" draggable="true" data-equip="${esc(k.value)}" data-kind="${esc(slot.kind)}" title="${esc(tip)}">
      <button type="button" class="kit-btn" data-equip="${esc(k.value)}" ${k.value === cur ? 'aria-current="true"' : ''}><span class="kit-name">${esc(k.label)}</span>${weight}${tag}${k.value === cur ? '<span class="tag good">equipped</span>' : ''}</button>${tipHtml(tip, `About ${k.label}`)}</li>`;
  }).join('');
  const more = hiddenOnes.length
    ? `<p class="muted unsuited-note">${ctx.showUnsuited ? 'Showing models that don\'t suit this PC.' : `${hiddenOnes.length} more for this job ${hiddenOnes.length === 1 ? 'doesn\'t' : 'don\'t'} suit this PC.`} <button type="button" class="link" data-unsuited>${ctx.showUnsuited ? 'Hide them' : 'Show them'}</button></p>` : '';
  // 1.5.56: everything else for this job is in the Brain catalogue, one press away.
  const getMore = slot.how === 'embed' && !all.length ? '' : `<p class="get-more"><button type="button" class="get-more-btn" data-catjob="${esc(slot.id)}">📚 Get more${hidden ? ` (${hidden} in the catalogue)` : ''}</button></p>`;
  const engine = slot.engine && !(ctx.roles?.options?.[slot.kind] || []).length
    ? `<div class="model engine-step"><p>${esc(slot.name)} comes with the audio tools.</p><button class="get" data-engine="${esc(slot.engine)}">Get the audio tools</button><div class="confirm" hidden></div></div>` : '';
  const embedTip = slot.how === 'embed' && !all.length ? '<p class="muted">Nothing here yet. Nomic Embed Text (in the catalogue, about 0.3 GB) shows up here once it is downloaded.</p>' : '';
  const house = houseGroupOf(slot.id) ? houseStyleHtml(houseGroupOf(slot.id), ctx.houseStyle) : ''; // 1.5.34 House style
  return `<h3>${slot.icon} ${esc(slot.name)} ${tipHtml(slot.does, `About ${slot.name}`)}</h3>${house}${engine}${embedTip}<ol class="kit-list">${items || (engine || embedTip ? '' : '<li class="muted">Nothing active for this job yet.</li>')}</ol>${more}${getMore}`;
}

// Everything equipped against the card: they don't all have to be loaded at once (Bob swaps), but it shows what fits together.
function weightHtml(ctx) {
  const seen = new Map();
  for (const s of SLOTS) { const e = entryOf(ctx.models, equipped(s, ctx)); if (e?.vramGB) seen.set(e.id, e); }
  const total = [...seen.values()].reduce((n, e) => n + e.vramGB, 0);
  const card = ctx.vramGB;
  if (!card) return `<p class="muted">Equipped: about ${gb(total)} of graphics memory in all.</p>`;
  const pct = Math.min(100, Math.round((total / card) * 100));
  // Over the card in total is normal (Bob swaps); red only when one equipped model can't fit on the card at all.
  const tooBig = [...seen.values()].find((e) => e.vramGB > card);
  return `<div class="weight-bar" title="Everything equipped, if it were all loaded at once"><div class="meter${tooBig ? ' over' : ''}"><i style="width:${pct}%"></i></div>
    <span>${tooBig ? `${esc(tooBig.name)} alone needs more than your ${gb(card)} card, so it runs slowly.` : total > card ? `${gb(total)} equipped in total. Your card holds ${gb(card)}, so Bob loads what each job needs (about 20 seconds a swap).` : `${gb(total)} equipped in total. Your card holds ${gb(card)}, so all of it fits at once.`}</span></div>`;
}

// ---- Starter sets: a few models picked for the graphics card, as one button. Every download is still confirmed. ----

// What a slot should hold for a catalog entry, once it's on this PC (the Ollama name, the catalog id, or
// "ollama:<name>" for ears). '' while it isn't there yet.
export function slotValue(slot, entry, roles) {
  if (!entry) return '';
  const opts = roles?.options?.[slot.kind] || [];
  const bare = (v) => String(v).replace(/:latest$/, '');
  const hit = opts.find((o) => o.value === entry.id || (entry.ollama && [bare(entry.ollama), `ollama:${bare(entry.ollama)}`].includes(bare(o.value))));
  return hit?.value || '';
}

// Ticked by default: what fits the card, plus what the set says to tick anyway.
export function starterTicks(pack, models, vramGB) {
  vramGB = vramGB || pack.cardGB || 0; // no card detected: judge by the card the set is for
  return new Set(pack.models.filter((id) => {
    const m = models.find((x) => x.id === id);
    return m && (m.status?.state === 'installed' || (pack.tick || []).includes(id) || !vramGB || !m.vramGB || m.vramGB <= vramGB);
  }));
}

// The downloads (models, then the engines they need) and the slots to fill when each is in.
export function starterPlan(pack, models, engines, picked) {
  const ids = [], plan = {};
  for (const id of pack.models) {
    if (!picked.has(id)) continue;
    const m = models.find((x) => x.id === id);
    if (!m) continue;
    plan[id] = pack.slots?.[id] || [];
    if (m.status?.state !== 'installed') ids.push(id);
    for (const e of enginesFor([m], engines)) if (!ids.includes(e)) ids.push(e);
  }
  return { ids, plan };
}

// 1.5.72: the engines picked models run on that aren't here yet, as download ids ("engine:llamacpp"): a model's own
// `needs`, and llama.cpp for brain files (GGUF). They download with the models, so first-time setup is one button.
export function enginesFor(list, engines) {
  const out = [];
  const add = (e) => { if (e && !e.installed && e.available !== false && !out.includes('engine:' + e.id)) out.push('engine:' + e.id); };
  for (const m of list) {
    if (!m) continue;
    add(m.needs && engines.find((e) => e.name === m.needs));
    if ((m.files || []).some((f) => f.role === 'gguf')) add(engines.find((e) => e.id === 'llamacpp'));
  }
  return out;
}

export function starterHtml(ctx) {
  const packs = ctx.packs || [];
  if (!packs.length) return '';
  const pack = packs.find((p) => p.id === ctx.packId) || packFor(packs, ctx.vramGB, ctx.integrated);
  const picked = ctx.picks || starterTicks(pack, ctx.models, ctx.vramGB);
  const { ids } = starterPlan(pack, ctx.models, ctx.engines || [], picked);
  const total = ids.reduce((n, id) => n + (ctx.models.find((m) => m.id === id)?.sizeGB || 0), 0);
  const slotName = (id) => allSlots().find((s) => s.id === id);
  const rows = pack.models.map((id) => {
    const m = ctx.models.find((x) => x.id === id);
    if (!m) return '';
    const here = m.status?.state === 'installed';
    const slots = (pack.slots?.[id] || []).map(slotName).filter(Boolean);
    const card = ctx.vramGB || pack.cardGB;
    const big = card && m.vramGB > card;
    return `<li><label><input type="checkbox" data-starterpick="${esc(id)}" ${picked.has(id) ? 'checked' : ''}>
      <span>${slots.map((s) => s.icon).join('')} <strong>${esc(m.name)}</strong> <span class="muted">for ${esc(slots.map((s) => s.name).join(', '))} · ${here ? 'already here' : gb(m.sizeGB)}${m.license ? ` · ${esc(m.license)}` : ''}</span>
      ${pack.notes?.[id] ? `<br><span class="${big ? 'warn-text' : 'muted'}">${esc(pack.notes[id])}</span>` : big ? '<br><span class="warn-text">more than your card: slow</span>' : ''}</span></label></li>`;
  }).join('');
  const open = ctx.starterOpen ?? !equipped(SLOTS[0], ctx);
  return `<details class="starter"${open ? ' open' : ''}><summary>⭐ Starter set for your PC</summary>
    <p class="muted">A small set that lets Bob chat, plan, research, code, see pictures, speak${pack.id === 'cpu' ? '' : ', paint and film'}. All free for commercial use. Pick the set, untick what you don't want, then press the button: you see the full list before anything downloads.</p>
    <label class="pick"><strong>Set</strong> <select data-starterpack aria-label="Starter set">${packs.map((p) => `<option value="${esc(p.id)}" ${p.id === pack.id ? 'selected' : ''}>${esc(p.label)}${p.id === packFor(packs, ctx.vramGB).id ? ' (this PC)' : ''}</option>`).join('')}</select></label>
    <ul class="packlist">${rows}</ul>
    ${pack.times ? `<p class="muted">⏱ ${esc(pack.times)}</p>` : ''}
    <div class="row"><button type="button" class="get" data-starter="${esc(pack.id)}" ${picked.size ? '' : 'disabled'}>Equip starter set${ids.length ? ` (${gb(total)} to download)` : ''}</button></div>
    <div class="confirm starter-confirm" hidden></div></details>`;
}

export function equipHtml(ctx) {
  const sel = allSlots().find((s) => s.id === ctx.selected);
  const col = (side) => SLOTS.filter((s) => s.side === side).map((s) => slotHtml(s, ctx)).join('');
  return `<div class="equip-top"><p class="muted">Pick a slot, then a model for it. ${tipHtml('Click a model in the kit, or drag it onto the slot. Each slot only lists active models that can do its job; Get more opens the Brain catalogue. Nothing is equipped without you.', 'How Equip Bob works')} <button type="button" class="mini help-link" data-help="recommended" aria-label="Help: how Bob picks models">? How Bob picks</button></p>
      <button type="button" class="link" data-eqview="list">Plain list instead</button></div>
    ${starterHtml(ctx)}
    ${weightHtml(ctx)}
    <div class="equip-page">
      ${ctx.attributes || ''}
      <div class="equip-mid">
        <div class="doll"><div class="doll-col">${col('L')}</div><div class="doll-mid"><canvas class="doll-bob" width="160" height="160" aria-label="Bob"></canvas><div class="muted">Bob</div></div><div class="doll-col">${col('R')}</div></div>
        <details class="helpers"${HELPERS.some((h) => h.id === ctx.selected) ? ' open' : ''}><summary>Helpers (optional: each uses the main brain unless you pick one)</summary><div class="helper-row">${HELPERS.map((s) => slotHtml(s, ctx)).join('')}</div></details>
        ${houseStyleHtml('times', ctx.houseStyle)}
      </div>
      <section class="kit-panel" aria-live="polite"><div class="kit-head muted">Inventory</div>${kitHtml(sel, ctx)}</section>
    </div>`;
}

// 1.5.74 "engines first": what first start gets before anything else, so Bob can talk and help with the rest.
// The three core engines (where this computer has a build of them) and one small starter brain for this device:
// Gemma 4 E4B with room for it (a card of 8 GB or more, or 16 GB of shared memory on a Mac or built-in graphics),
// otherwise Gemma 4 E2B.
export const CORE_ENGINES = ['llamacpp', 'sdcpp', 'whispercpp'];
export function starterBrain({ vramGB, ramGB, unified, integrated } = {}) {
  if (unified || integrated) return (ramGB || 0) >= 16 ? 'gemma4-e4b' : 'gemma4-e2b';
  return (vramGB || 0) >= 8 ? 'gemma4-e4b' : 'gemma4-e2b';
}
export function readyPlan(hwCtx, models, engines) {
  const eng = CORE_ENGINES.map((id) => engines.find((e) => e.id === id)).filter((e) => e && e.available !== false);
  // 1.5.76: the llama.cpp that came with Bob is the basic build; with an NVIDIA card the faster CUDA build replaces it.
  const ids = eng.filter((e) => !e.installed || (e.bundled && hwCtx.nvidia)).map((e) => 'engine:' + e.id);
  const brain = models.find((m) => m.id === starterBrain(hwCtx)) || null;
  if (brain && brain.status?.state !== 'installed') ids.push(brain.id);
  return { ids, engines: eng, brain };
}
