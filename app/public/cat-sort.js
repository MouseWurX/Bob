// 1.5.208 The Brain catalogue's sorting, filters and maker tags (the owner's ask): release date, size, quantization,
// official release or community build, and "runs here". Pure builders, no DOM: catalogue.js draws them and cellar.js
// keeps the choices. Nothing here downloads or changes a setting.
//
// Three things stay apart on purpose:
//   official / community: WHO put the model out (a big lab, or a person or small team).
//   REAP cut: HOW it was made smaller (the least-used experts taken out). It can be quicker. Its refusals are untouched.
//   naughty list: refusals cut out (abliterated, "heretic"). Only that makes a brain naughty. A REAP cut is not naughty.
import { quantOf, placeFor, hasExperts } from './place.js';
import { esc, gb } from './util.js';

// Model-hub account -> the lab behind it. Lower case. Only labs that publish their own models.
export const OFFICIAL = {
  qwen: 'Alibaba', 'alibaba-nlp': 'Alibaba', 'tongyi-mai': 'Alibaba', 'wan-ai': 'Alibaba', 'alibaba-pai': 'Alibaba',
  google: 'Google', nvidia: 'NVIDIA', microsoft: 'Microsoft', 'ibm-granite': 'IBM', ibm: 'IBM', openai: 'OpenAI',
  mistralai: 'Mistral AI', 'meta-llama': 'Meta', facebook: 'Meta', 'deepseek-ai': 'DeepSeek', 'zai-org': 'Z.ai',
  'black-forest-labs': 'Black Forest Labs', lightricks: 'Lightricks', poolside: 'Poolside', 'nomic-ai': 'Nomic',
  apple: 'Apple', tencent: 'Tencent', baidu: 'Baidu', 'xai-org': 'xAI', cohere: 'Cohere', coherelabs: 'Cohere',
  'stabilityai': 'Stability AI', moonshotai: 'Moonshot AI', 'ace-step': 'ACE Studio', 'liquidai': 'Liquid AI',
  huggingfacetb: 'Hugging Face', '01-ai': '01.AI', 'internlm': 'Shanghai AI Lab', 'opengvlab': 'Shanghai AI Lab',
};
// Bob's own families -> the lab that made them (catalog.json entries are that lab's release unless marked community).
export const FAMILY_MAKER = {
  Qwen: 'Alibaba', Gemma: 'Google', Granite: 'IBM', Mistral: 'Mistral AI', Nemotron: 'NVIDIA', DeepSeek: 'DeepSeek', GLM: 'Z.ai',
  Laguna: 'Poolside', 'GPT-OSS': 'OpenAI', Whisper: 'OpenAI', 'Z-Image': 'Alibaba', FLUX: 'Black Forest Labs', LTX: 'Lightricks',
  Wan: 'Alibaba', Nomic: 'Nomic', 'ACE-Step': 'ACE Studio', Phi: 'Microsoft', Llama: 'Meta',
};
const orgOf = (m) => String(m?.source?.repo || '').split('/')[0].toLowerCase();

// Who put this model out. -> { kind: 'official' | 'community' | 'bob' | 'yours', by }
export function makerKind(m) {
  if (m?.madeByBob) return { kind: 'bob', by: 'Bob' };
  if (m?.own) return { kind: 'yours', by: '' };
  if (m?.community && typeof m.community === 'object') return { kind: 'community', by: m.community.team || m.community.by || '' };
  if (m?.naughty === true) return { kind: 'community', by: '' };
  if (m?.source?.repo) { const org = orgOf(m); return OFFICIAL[org] ? { kind: 'official', by: OFFICIAL[org] } : { kind: 'community', by: String(m.source.repo).split('/')[0] }; }
  const by = m?.maker || FAMILY_MAKER[m?.family] || '';
  return by ? { kind: 'official', by } : { kind: 'community', by: '' };
}
export function officialTag(m) {
  const k = makerKind(m);
  if (k.kind !== 'official') return '';
  return `<span class="tag official-tag" tabindex="0" data-tip="${esc(`Official release: this model was put out by ${k.by} itself. The file may be packed smaller by someone else; the i says where it comes from.`)}" aria-label="${esc(`Official release by ${k.by}`)}">Official · ${esc(k.by)}</span>`;
}

// A REAP cut: says so itself (reap: true, or community.kind "reap"), or by the word in its name.
export const isReap = (m) => m?.reap === true || m?.community?.kind === 'reap' || /(^|[^a-z])reap([^a-z]|$)/i.test(`${m?.name || ''} ${m?.source?.repo || ''}`);
export const REAP_LINE = 'REAP cut: the experts this brain uses least were taken out, so the file is smaller and it can run quicker. Nothing was done to its refusals, so it is not a naughty-list brain.';
export const reapTag = (m) => (isReap(m) ? `<span class="tag reap-tag" tabindex="0" data-tip="${esc(REAP_LINE)}" aria-label="REAP cut: made smaller, refusals untouched">✂ REAP cut</span>` : '');
// Words in a name that mean refusals were cut out. REAP is not one of them.
export const NAUGHTY_WORDS = /abliterat|heretic|uncensored|derestrict|decensor|no[-_ ]?refus/i;
export const looksNaughty = (name) => NAUGHTY_WORDS.test(String(name || ''));

// Can it run here, and how. Counts the card, the memory, experts read from the drive (brains made of experts) and
// another Bob lending a hand, and the drive room the file itself needs. -> { ok, how, word, why }
export function fitsHere(m, hw = {}, rooms = []) {
  const size = m?.sizeGB || 0;
  if (m?.status?.state === 'installed') return { ok: true, how: 'here', word: 'On this replicant matrix', why: '' };
  if (hw.freeGB != null && hw.freeGB > 0 && size > hw.freeGB) return { ok: false, how: 'drive', word: 'No room on the drive', why: `The file is ${gb(size)} and the drive has ${gb(hw.freeGB)} free.` };
  if (!m?.jobs || !['chat', 'coding', 'vision'].includes(m.category) || (!hw.ramGB && !hw.vramGB)) return { ok: true, how: 'card', word: '', why: '' };
  const p = placeFor(m, hw, rooms);
  if (p.where === 'rent') return { ok: false, how: 'rent', word: 'Too big to run here', why: p.why };
  const word = p.where === 'card' ? '' : p.where === 'memory' ? (p.runsWell ? '' : 'Fits with memory') : p.where === 'storage' ? 'Fits with experts on the drive' : `Fits with ${p.helper || 'another Bob'} on Bob-Net`;
  return { ok: true, how: p.where, word, why: p.why, experts: hasExperts(m) };
}

export const SORTS = [['bob', 'Bob\'s order'], ['newest', 'Newest first'], ['oldest', 'Oldest first'], ['small', 'Smallest first'], ['big', 'Biggest first']];
export const MAKERS = [['all', 'Every maker'], ['official', 'Official releases'], ['community', 'Community builds'], ['bob', 'Bob\'s own']];
export const FITS = [['all', 'Everything'], ['runs', 'Runs here'], ['card', 'Fits the card alone']];
const pick = (list, v) => (list.some(([id]) => id === v) ? v : list[0][0]);
export const cleanFilters = (f = {}) => ({ sort: pick(SORTS, f.sort), maker: pick(MAKERS, f.maker), fits: pick(FITS, f.fits), quant: /^[A-Z0-9_.-]{1,16}$/.test(f.quant || '') ? f.quant : 'all' });
export const filtersOn = (f) => { const c = cleanFilters(f); return c.sort !== 'bob' || c.maker !== 'all' || c.fits !== 'all' || c.quant !== 'all'; };

// Every quantization in the list, biggest (sharpest) first: Q8, Q6, Q5, Q4_K_M, Q3_K_M...
export function quantsOf(models) {
  const bits = (q) => { const n = q.match(/(\d+)/); return n ? Number(n[1]) : 0; };
  return [...new Set((models || []).map(quantOf).filter(Boolean))].sort((a, b) => bits(b) - bits(a) || a.localeCompare(b));
}
export function applyFilters(models, f, hw = {}, rooms = []) {
  const c = cleanFilters(f);
  return (models || []).filter((m) => {
    if (c.maker !== 'all') { const k = makerKind(m).kind; if (c.maker === 'bob' ? k !== 'bob' : k !== c.maker) return false; }
    if (c.quant !== 'all' && quantOf(m) !== c.quant) return false;
    if (c.fits !== 'all') { const fit = fitsHere(m, hw, rooms); if (!fit.ok) return false; if (c.fits === 'card' && !['card', 'here'].includes(fit.how) && !(fit.how === 'memory' && !fit.word)) return false; }
    return true;
  });
}
// Sorted copy. Models with no date go last when sorting by date; ties keep Bob's order.
export function sortModels(list, sort) {
  const s = pick(SORTS, sort);
  if (s === 'bob') return [...(list || [])];
  const day = (m) => (/^\d{4}-\d{2}-\d{2}$/.test(m.published || '') ? m.published : '');
  const cmp = { newest: (a, b) => (day(a) && day(b) ? day(b).localeCompare(day(a)) : day(a) ? -1 : day(b) ? 1 : 0), oldest: (a, b) => (day(a) && day(b) ? day(a).localeCompare(day(b)) : day(a) ? -1 : day(b) ? 1 : 0), small: (a, b) => (a.sizeGB ?? 1e9) - (b.sizeGB ?? 1e9), big: (a, b) => (b.sizeGB ?? -1) - (a.sizeGB ?? -1) }[s];
  return (list || []).map((m, i) => [m, i]).sort((a, b) => cmp(a[0], b[0]) || a[1] - b[1]).map(([m]) => m);
}

// The bar above the catalogue. Always there; every control keeps its place whatever is picked.
export function filterBarHtml(f, models, shownN = null) {
  const c = cleanFilters(f);
  const sel = (key, label, list, cur) => `<label class="cat-filter"><span>${esc(label)}</span><select data-catfilter="${key}" aria-label="${esc(label)}">${list.map(([id, name]) => `<option value="${esc(id)}"${id === cur ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;
  const quants = quantsOf(models);
  const qList = [['all', 'Every quantization'], ...quants.map((q) => [q, q])];
  if (c.quant !== 'all' && !quants.includes(c.quant)) qList.push([c.quant, c.quant]);
  return `<div class="cat-filters" role="group" aria-label="Sort and filter the catalogue">${sel('sort', 'Sort', SORTS, c.sort)}${sel('maker', 'Made by', MAKERS, c.maker)}${sel('quant', 'Quantization', qList, c.quant)}${sel('fits', 'Show', FITS, c.fits)}
    <button type="button" class="mini" data-catfilter-reset ${filtersOn(c) ? '' : 'disabled'}>Reset</button>${shownN != null && filtersOn(c) ? `<span class="muted" role="status">${shownN} ${shownN === 1 ? 'model' : 'models'} match</span>` : ''}</div>`;
}
