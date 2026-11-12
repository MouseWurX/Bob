// 1.5.205 Add a model page. Paste a model's page from a hosting site and pick which of its files (one per
// quantization) join this replicant matrix's own list. Each one is pinned to the page's commit, with its size and
// sha256 from the site's file list, so the download is checked like any catalogue file. They count as not tried:
// never Bob's pick. Only this replicant matrix's list changes; the list Bob ships with is never written.
// Settings: cfg.catalogAdded = [entry], cfg.catalogAddedGot = [ids that were downloaded once].
// Hugging Face and ModelScope (modelscope.cn) pages are read. Other sites are told apart and answered plainly.
import { quantOf } from '../public/place.js';

export const ADDED_FAMILY = 'Added by you';
export const ADDED_MAX = 60;
const SHA = /^[0-9a-f]{64}$/, COMMIT = /^[0-9a-f]{40}$/;
const FILE = /^(?!.*\.\.)[\w][\w.+/-]{0,180}\.gguf$/i;
const PART = /-(\d{5})-of-(\d{5})\.gguf$/i;
const r1 = (n) => Math.round(n * 10) / 10;
const slug = (s) => String(s).toLowerCase().replace(/\.gguf$/, '').replace(/[^a-z0-9.]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
const txt = (s, n) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>{}`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, n) : '');

// A pasted page -> { host: 'hf' | 'ms', repo, revision } | { host: 'other' } | null (not a link or name).
export function parsePage(input) {
  let s = String(input || '').trim();
  if (!s || s.length > 400) return null;
  // ModelScope: modelscope.cn/models/<owner>/<name>, with or without a tab or file after it.
  const ms = s.match(/^https?:\/\/(?:www\.)?modelscope\.cn\/models\/([A-Za-z0-9][\w.-]{0,95}\/[A-Za-z0-9][\w.-]{0,95})(?:[/?#].*)?$/i);
  if (ms) return { host: 'ms', repo: ms[1], revision: '' };
  s = s.replace(/^https?:\/\/hf\.co\//i, 'https://huggingface.co/').replace(/^http:\/\/huggingface\.co\//i, 'https://huggingface.co/');
  // A link to one file on the page still means the page.
  s = s.replace(/[?#].*$/, '').replace(/^(https:\/\/huggingface\.co\/[^/]+\/[^/]+)\/(?:blob|resolve)\/([^/]+)\/.*$/i, '$1/tree/$2');
  s = s.replace(/\/+$/, '');
  const NAME = /^[A-Za-z0-9][\w.-]{0,95}\/[A-Za-z0-9][\w.-]{0,95}$/;
  if (/^https?:\/\//i.test(s)) {
    const m = s.match(/^https:\/\/huggingface\.co\/([^/]+\/[^/]+)(?:\/tree\/([\w.-]{1,64}))?$/i);
    if (!m || /^(datasets|spaces|models|docs|blog|collections)\//i.test(m[1]) || !NAME.test(m[1])) return { host: 'other' };
    return { host: 'hf', repo: m[1], revision: m[2] && m[2] !== 'main' ? m[2] : '' };
  }
  return NAME.test(s) ? { host: 'hf', repo: s, revision: '' } : null;
}

// The page's .gguf files, one choice per quantization. A brain split into parts is one choice (and can't be added yet);
// picture readers (mmproj) are kept apart. files: [{ name, bytes, sha256 }].
export function groupQuants(files = []) {
  const ggufs = files.filter((f) => FILE.test(f?.name || ''));
  const isMm = (f) => /mmproj/i.test(f.name.split('/').pop());
  const groups = new Map();
  for (const f of ggufs.filter((x) => !isMm(x))) {
    const key = f.name.replace(PART, '.gguf');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const choices = [...groups.entries()].map(([key, parts]) => {
    const bytes = parts.reduce((t, f) => t + (Number(f.bytes) || 0), 0);
    const pinned = parts.every((f) => Number.isInteger(f.bytes) && f.bytes > 0 && SHA.test(f.sha256 || '') && (f.rev === undefined || COMMIT.test(f.rev)));
    const why = parts.length > 1 ? `In ${parts.length} parts. I can't join those yet.` : !pinned ? 'The site gave no checksum for it, so I can\'t check the download.' : '';
    return { key, quant: quantOf({ files: [{ name: key }] }), bytes, sizeGB: r1(bytes / 1e9), parts: parts.length, can: !why, why, files: parts.map((f) => ({ name: f.name, bytes: f.bytes, sha256: f.sha256, ...(f.rev ? { rev: f.rev } : {}) })) };
  }).sort((a, b) => a.bytes - b.bytes).slice(0, 80);
  const readers = ggufs.filter((f) => isMm(f) && Number.isInteger(f.bytes) && SHA.test(f.sha256 || '') && (f.rev === undefined || COMMIT.test(f.rev))).sort((a, b) => a.bytes - b.bytes);
  return { choices, reader: readers[0] || null };
}

// Reads the page's file list from the hosting site. fetchFn is passed in by tests. Nothing is downloaded.
export async function readPage(input, { fetchFn = fetch, signal } = {}) {
  const ref = typeof input === 'string' ? parsePage(input) : input;
  if (!ref) return { ok: false, error: 'That isn\'t a model page. Paste the page\'s link, or its name like owner/name.' };
  if (ref.host === 'ms') return readModelScope(ref, { fetchFn, signal });
  if (ref.host !== 'hf') return { ok: false, error: 'I can read Hugging Face and ModelScope (modelscope.cn) pages. Paste the model\'s page from one of those.' };
  let res;
  try { res = await fetchFn(`https://huggingface.co/api/models/${ref.repo}${ref.revision ? `/revision/${encodeURIComponent(ref.revision)}` : ''}?blobs=true`, { signal, redirect: 'error' }); } catch { return { ok: false, error: 'Hugging Face couldn\'t be reached from this replicant matrix.' }; }
  if (res.status === 401 || res.status === 403) return { ok: false, error: 'That page is private, or needs you to sign in and accept its terms. I can only add pages anyone can open.' };
  if (res.status === 404) return { ok: false, error: `Hugging Face has no model called ${ref.repo}.` };
  if (!res.ok) return { ok: false, error: `Hugging Face answered ${res.status}. Try again later.` };
  let j; try { j = await res.json(); } catch { return { ok: false, error: 'Hugging Face sent something I couldn\'t read.' }; }
  const commit = String(j.sha || '');
  if (!COMMIT.test(commit)) return { ok: false, error: 'Hugging Face didn\'t say which version of the page this is, so I can\'t pin it.' };
  if (j.gated) return { ok: false, error: 'That page needs you to sign in and accept its terms. I can only add pages anyone can open.' };
  const files = (j.siblings || []).map((x) => ({ name: String(x.rfilename || ''), bytes: Number(x.lfs?.size ?? x.size) || 0, sha256: String(x.lfs?.sha256 || x.lfs?.oid || '').replace(/^sha256:/, '') }));
  const { choices, reader } = groupQuants(files);
  if (!choices.length) return { ok: false, error: 'That page has no .gguf files. Bob\'s engine runs .gguf; look for the model\'s "GGUF" page.' };
  const card = j.cardData || {};
  const license = txt(String(Array.isArray(card.license) ? card.license[0] : card.license || (j.tags || []).find((t) => /^license:/.test(t))?.slice(8) || ''), 60);
  return { ok: true, host: 'hf', repo: ref.repo, commit, license, choices, reader };
}

// ModelScope's file list: every file with its size, checksum and the commit it was last changed in (its pin).
async function readModelScope(ref, { fetchFn, signal }) {
  let res;
  try { res = await fetchFn(`https://modelscope.cn/api/v1/models/${ref.repo}/repo/files?Revision=master&Recursive=true`, { signal, redirect: 'error' }); } catch { return { ok: false, error: 'ModelScope couldn\'t be reached from this replicant matrix.' }; }
  if (res.status === 401 || res.status === 403) return { ok: false, error: 'That page is private, or needs you to sign in. I can only add pages anyone can open.' };
  if (res.status === 404) return { ok: false, error: `ModelScope has no model called ${ref.repo}.` };
  if (!res.ok) return { ok: false, error: `ModelScope answered ${res.status}. Try again later.` };
  let j; try { j = await res.json(); } catch { return { ok: false, error: 'ModelScope sent something I couldn\'t read.' }; }
  const list = j?.Data?.Files;
  if (!Array.isArray(list)) return { ok: false, error: j?.Code === 404 || /not exist|not found/i.test(String(j?.Message || '')) ? `ModelScope has no model called ${ref.repo}.` : 'ModelScope sent something I couldn\'t read.' };
  const files = list.filter((x) => x && x.Type !== 'tree').map((x) => ({ name: String(x.Path || x.Name || ''), bytes: Number(x.Size) || 0, sha256: String(x.Sha256 || '').toLowerCase(), rev: String(x.Revision || '') }));
  const { choices, reader } = groupQuants(files);
  if (!choices.length) return { ok: false, error: 'That page has no .gguf files. Bob\'s engine runs .gguf; look for the model\'s "GGUF" page.' };
  return { ok: true, host: 'ms', repo: ref.repo, commit: choices.find((c) => c.can)?.files[0].rev || '', license: '', choices, reader };
}

// A small file can also be the Quick brain.
const jobsOf = (sizeGB) => [...(sizeGB <= 6 ? ['small'] : []), 'bob', 'deep', 'tinker', 'reviewer', 'office'];
const SITES = { hf: 'Hugging Face', ms: 'ModelScope' };
const fileUrl = (host, repo, commit, name) => `${host === 'ms' ? 'https://modelscope.cn/models' : 'https://huggingface.co'}/${repo}/resolve/${commit}/${name.split('/').map(encodeURIComponent).join('/')}`;
const whatOf = (host, repo) => `Added by you from ${repo} on ${SITES[host]}. Not one I've tried, so I don't recommend it over the brains I know.`;
export const addedId = (repo, key, host = 'hf') => `added-${host === 'ms' ? 'ms-' : ''}${slug(repo.split('/')[1])}-${slug(key.split('/').pop())}`.slice(0, 110);

// One list entry from a page and one of its choices, shaped like a catalogue entry.
export function makeEntry(page, choice) {
  const f = choice.files[0];
  const base = page.repo.split('/')[1].replace(/[-_.]?GGUF$/i, '');
  const sizeGB = r1(f.bytes / 1e9);
  const host = page.host === 'ms' ? 'ms' : 'hf';
  const commit = f.rev || page.commit;
  const files = [{ url: fileUrl(host, page.repo, commit, f.name), role: 'gguf', verify: true, bytes: f.bytes, sha256: f.sha256 }];
  const id = addedId(page.repo, choice.key, host);
  if (page.reader) files.push({ url: fileUrl(host, page.repo, page.reader.rev || page.commit, page.reader.name), role: 'mmproj', verify: true, bytes: page.reader.bytes, sha256: page.reader.sha256, saveAs: `${id}-mmproj.gguf` });
  return {
    id, family: ADDED_FAMILY, category: 'chat', jobs: jobsOf(sizeGB),
    name: `${base}${choice.quant ? ` ${choice.quant}` : ''}`.slice(0, 80), quant: choice.quant || '',
    what: whatOf(host, page.repo),
    sizeGB, vramGB: Math.ceil(sizeGB + 1), license: page.license || '', trial: true, added: true,
    source: { host, repo: page.repo, commit }, files,
  };
}

// Only what this file would have made is kept: Hugging Face or ModelScope links pinned to a commit, with a size and a checksum.
const URL_OK = /^https:\/\/(?:huggingface\.co|modelscope\.cn\/models)\/[\w.-]+\/[\w.-]+\/resolve\/[0-9a-f]{40}\/[\w.%+/-]+\.gguf$/i;
export function cleanAdded(list) {
  const out = [], seen = new Set();
  for (const e of [].concat(list || [])) {
    if (!e || typeof e !== 'object' || !/^added-[a-z0-9.-]{3,104}$/.test(e.id || '') || seen.has(e.id) || out.length >= ADDED_MAX) continue;
    const files = [].concat(e.files || []).slice(0, 2).filter((f) => f && URL_OK.test(f.url || '') && !/\.\./.test(f.url) && ['gguf', 'mmproj'].includes(f.role) && Number.isInteger(f.bytes) && f.bytes > 0 && SHA.test(f.sha256 || ''))
      .map((f) => ({ url: f.url, role: f.role, verify: true, bytes: f.bytes, sha256: f.sha256, ...(f.role === 'mmproj' ? { saveAs: `${e.id}-mmproj.gguf` } : {}) }));
    if (!files.length || files[0].role !== 'gguf' || !txt(e.name, 80)) continue;
    const src = e.source || {};
    if (!/^[\w.-]+\/[\w.-]+$/.test(src.repo || '') || !COMMIT.test(src.commit || '')) continue;
    const host = /^https:\/\/modelscope\.cn\//i.test(files[0].url) ? 'ms' : 'hf';
    const sizeGB = r1(files[0].bytes / 1e9);
    seen.add(e.id);
    out.push({ id: e.id, family: ADDED_FAMILY, category: 'chat', jobs: jobsOf(sizeGB), name: txt(e.name, 80), quant: txt(e.quant, 20),
      what: whatOf(host, src.repo),
      sizeGB, vramGB: Math.ceil(sizeGB + 1), license: txt(e.license, 60), trial: true, added: true, source: { host, repo: src.repo, commit: src.commit }, files });
  }
  return out;
}

// Lays the added entries into a catalogue list (the shop's), replacing any it laid before. An id the list already has
// is never replaced.
export function mergeAdded(catalog, cfg) {
  if (!catalog?.models) return catalog;
  for (let i = catalog.models.length - 1; i >= 0; i--) if (catalog.models[i].added === true) catalog.models.splice(i, 1);
  const have = new Set(catalog.models.map((m) => m.id));
  for (const e of cleanAdded(cfg.catalogAdded)) if (!have.has(e.id)) catalog.models.push(e);
  return catalog;
}

// An added brain that was downloaded once and whose file is gone now (deleted by hand) leaves the list by itself.
// models: the list with statuses. -> { got, removed, changed }: the new "downloaded once" and "removed" id lists.
export function sweepAdded(models = [], got = [], removed = []) {
  const g = new Set(got), r = new Set(removed);
  let changed = false;
  for (const m of models) {
    if (m.added !== true) continue;
    const here = m.status?.state === 'installed';
    if (here && !g.has(m.id)) { g.add(m.id); changed = true; }
    if (m.status?.state === 'missing' && g.has(m.id)) { g.delete(m.id); r.add(m.id); changed = true; }
  }
  const ids = new Set(models.filter((m) => m.added === true).map((m) => m.id));
  for (const id of g) if (!ids.has(id)) { g.delete(id); changed = true; }
  return { got: [...g], removed: [...r], changed };
}
