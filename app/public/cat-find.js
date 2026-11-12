// 1.5.209 Find more models: the catalogue's search of Hugging Face and ModelScope (src/catalog-find.js does the asking).
// Pure builders. A hit is only a page: "Show its files" hands it to Add a model page, where you pick sizes and it is
// pinned and checked. Nothing is contacted until Search is pressed, and nothing downloads from here.
import { OFFICIAL, isReap, REAP_LINE, looksNaughty } from './cat-sort.js';
import { tipHtml } from './equip.js';
import { esc } from './util.js';

export const FIND_SITES = [['hf', 'Hugging Face'], ['ms', 'ModelScope']];
export const FIND_ORDER = [['newest', 'Newest first'], ['updated', 'Updated lately'], ['downloads', 'Most downloaded']];
export const FIND_MAKERS = [['all', 'Everyone'], ['labs', 'Big labs\' models'], ['community', 'Community builds']];
const lab = (repo) => OFFICIAL[String(repo || '').split('/')[0].toLowerCase()] || '';

// Who is behind a hit. official: the lab's own page. repack: a lab's model, packed smaller by someone else, unchanged
// otherwise. community: a person's or small team's build (a fine-tune, a merge, a cut, or nothing said).
export function hitMaker(h) {
  const own = lab(h?.repo), by = String(h?.repo || '').split('/')[0];
  if (own) return { kind: 'official', by: own, line: `Official release by ${own}.` };
  const baseLab = lab(h?.base), baseName = String(h?.base || '').split('/')[1] || '';
  if (baseLab && h.how === 'quantized' && !hitNaughty(h) && !isReap({ name: h.name, source: { repo: h.repo } })) return { kind: 'repack', by, lab: baseLab, line: `${baseLab}'s ${baseName}, packed smaller by ${by}. The model itself is ${baseLab}'s release.` };
  return { kind: 'community', by, lab: baseLab, line: `Community build by ${by}${baseLab ? `, made from ${baseLab}'s ${baseName}` : ''}. Not a release by a big lab.` };
}
export const hitNaughty = (h) => looksNaughty(`${h?.repo || ''} ${h?.name || ''}`);
export const hitReap = (h) => isReap({ name: h?.name, source: { repo: h?.repo } });
const pick = (list, v) => (list.some(([id]) => id === v) ? v : list[0][0]);
export const cleanFind = (f = {}) => ({ host: pick(FIND_SITES, f.host), sort: pick(FIND_ORDER, f.sort), maker: pick(FIND_MAKERS, f.maker), q: String(f.q || '').slice(0, 80) });

// What to show of the hits: the Made by choice, and the naughty ones only while that list is switched on.
export function shownHits(hits, { maker = 'all', naughtyOn = false } = {}) {
  const all = hits || [];
  const ok = all.filter((h) => naughtyOn || !hitNaughty(h));
  const shown = ok.filter((h) => { const k = hitMaker(h).kind; return maker === 'all' || (maker === 'labs' ? k !== 'community' : k === 'community'); });
  return { shown, naughtyLeftOut: all.length - ok.length, filteredOut: ok.length - shown.length };
}
const count = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

function hitHtml(h, mine) {
  const m = hitMaker(h);
  const tag = m.kind === 'official' ? `<span class="tag official-tag" tabindex="0" data-tip="${esc(m.line)}">Official · ${esc(m.by)}</span>`
    : m.kind === 'repack' ? `<span class="tag official-tag" tabindex="0" data-tip="${esc(m.line)}">${esc(m.lab)}'s model · packed by ${esc(m.by)}</span>`
      : `<span class="tag" tabindex="0" data-tip="${esc(m.line)}">Community · ${esc(m.by)}</span>`;
  const reap = hitReap(h) ? `<span class="tag reap-tag" tabindex="0" data-tip="${esc(REAP_LINE)}">✂ REAP cut</span>` : '';
  const naughty = hitNaughty(h) ? '<span class="tag warn" tabindex="0" data-tip="Its name says the refusals were cut out. It answers without refusing, so the care is yours.">Naughty list</span>' : '';
  const facts = [h.created ? `Out ${h.created}` : '', h.modified && h.modified !== h.created ? `updated ${h.modified}` : '', h.downloads ? `${count(h.downloads)} downloads` : '', h.paramsB ? `${h.paramsB}B` : '', h.sees ? 'sees pictures' : '', h.license || ''].filter(Boolean).join(' · ');
  return `<li class="cat-row model find-hit"><span class="kit-name">${esc(h.name)}</span><span class="muted">${esc(facts)}</span>${tag}${reap}${naughty}<span class="tag">Not tried yet</span>
    <a class="src-link" href="${esc(h.page)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(h.name)}'s page">↗</a>
    <span class="cat-act">${mine ? '<span class="tag good">some sizes added</span>' : ''}<button type="button" class="get" data-findpick="${esc(h.page)}">Show its files</button></span></li>`;
}

// ctx.find = { q, host, sort, maker, busy, error, hits, next, total, searched }; ctx.addedRepos = Set of "host:repo".
export function findHtml(ctx) {
  const f = { ...cleanFind(ctx.find), ...(ctx.find || {}) };
  const c = cleanFind(f);
  const sel = (key, label, list, cur) => `<label class="cat-filter"><span>${esc(label)}</span><select data-find="${key}" aria-label="${esc(label)}">${list.map(([id, name]) => `<option value="${id}"${id === cur ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;
  const { shown, naughtyLeftOut, filteredOut } = shownHits(f.hits, { maker: c.maker, naughtyOn: ctx.naughtyOn === true });
  const notes = [naughtyLeftOut ? `${naughtyLeftOut} left out because the naughty list is off.` : '', filteredOut ? `${filteredOut} hidden by Made by.` : ''].filter(Boolean).join(' ');
  const list = !f.searched ? '' : shown.length ? `<ul class="kit-list cat-list">${shown.map((h) => hitHtml(h, ctx.addedRepos?.has(`${h.host}:${h.repo}`))).join('')}</ul>` : `<p class="muted">Nothing found${f.hits?.length ? ' that matches' : ''}. Try fewer words.</p>`;
  return `<section class="cat-job find-more" id="catjob-find"><h3>🔎 Find more models ${tipHtml('I ask Hugging Face or ModelScope for pages with brain files (.gguf) and list what comes back. Nothing is contacted until you press Search, nothing is sent but your search words, and nothing downloads. Show its files opens the page\'s sizes so you can add the ones you want; they join the Added by you family. I haven\'t tried these, so I never recommend one over the brains I know until it has been benchmarked.', 'About finding models')}</h3>
    <p class="muted">More than my own list: search the two big model sites. Whether a size runs here shows when you open its files. <button type="button" class="mini help-link" data-help="faq-find-models" aria-label="Help: finding more models">? Help</button></p>
    <form class="own-form find-form" data-findform><label>Search for <input type="text" data-findq maxlength="80" placeholder="a name, like qwen coder or granite. Empty lists the newest" value="${esc(c.q)}"></label>
      <div class="cat-filters">${sel('host', 'Site', FIND_SITES, c.host)}${sel('sort', 'Order', FIND_ORDER, c.sort)}${sel('maker', 'Made by', FIND_MAKERS, c.maker)}<button type="submit" class="get" ${f.busy ? 'disabled' : ''}>${f.busy ? 'Searching…' : 'Search'}</button></div></form>
    ${f.error ? `<p class="error" role="alert">${esc(f.error)}</p>` : ''}
    ${f.searched ? `<p class="muted" role="status">${shown.length} found on ${esc(FIND_SITES.find(([id]) => id === (f.foundOn || c.host))[1])}. ${esc(notes)}</p>` : ''}
    ${list}${f.searched && f.next ? `<p><button type="button" class="mini" data-findmore ${f.busy ? 'disabled' : ''}>Show more</button></p>` : ''}</section>`;
}
