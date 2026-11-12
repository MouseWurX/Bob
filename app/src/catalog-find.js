// 1.5.209 Find more models (the owner's ask): search Hugging Face and ModelScope for brain files (.gguf) through
// their own search APIs, so the catalogue isn't limited to the list Bob ships with. Nothing here downloads a model
// or adds one: a hit only becomes a catalogue entry through Add a model page (catalog-added.js), which pins it to a
// commit with a size and a checksum. Nothing is contacted until the owner presses Search. No sign-in is sent.
// The answers' shapes were read from the real sites on 2026-11-11:
//   Hugging Face  GET /api/models?filter=gguf&search=&sort=&direction=-1&limit=  -> [ { id, createdAt, lastModified?,
//                 downloads, likes, tags: ["base_model:quantized:Qwen/X", "license:apache-2.0", ...], pipeline_tag? } ]
//                 and a Link header with rel="next" carrying a cursor.
//   ModelScope    GET https://www.modelscope.cn/openapi/v1/models?search=&page_size=&page_number=
//                 -> { success, data: { models: [ { id, downloads, likes, license, tasks, created_at, last_modified,
//                 params, tags: ["custom_tag:gguf", ...], private, gated } ], total_count } }
export const FIND_HOSTS = ['hf', 'ms'];
export const FIND_SORTS = ['newest', 'updated', 'downloads'];
export const FIND_LIMIT = 40;
const REPO = /^[\w.-]{1,96}\/[\w.-]{1,96}$/;
const txt = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10) : '');
const num = (n) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Math.round(Number(n)) : 0);
// Brains only: things that chat, code or read pictures. Picture, sound and video makers are left out.
const TASK_OK = new Set(['', 'text-generation', 'image-text-to-text', 'text2text-generation', 'conversational', 'any-to-any', 'image-to-text', 'visual-question-answering']);

export function cleanQuery(q = {}) {
  return { host: FIND_HOSTS.includes(q.host) ? q.host : 'hf', sort: FIND_SORTS.includes(q.sort) ? q.sort : 'newest',
    q: txt(q.q, 80).replace(/[^\w .+-]/g, ' ').replace(/\s+/g, ' ').trim(),
    cursor: /^[\w=+/-]{1,600}$/.test(String(q.cursor || '')) ? String(q.cursor) : '' };
}
export function findUrl(query) {
  const c = cleanQuery(query);
  if (c.host === 'ms') {
    const page = /^\d{1,4}$/.test(c.cursor) ? Number(c.cursor) : 1;
    return `https://www.modelscope.cn/openapi/v1/models?search=${encodeURIComponent(`${c.q} gguf`.trim())}&page_size=${FIND_LIMIT}&page_number=${page}`;
  }
  const sort = { newest: 'createdAt', updated: 'lastModified', downloads: 'downloads' }[c.sort];
  return `https://huggingface.co/api/models?filter=gguf${c.q ? `&search=${encodeURIComponent(c.q)}` : ''}&sort=${sort}&direction=-1&limit=${FIND_LIMIT}${c.cursor && !/^\d{1,4}$/.test(c.cursor) ? `&cursor=${encodeURIComponent(c.cursor)}` : ''}`;
}
// "base_model:quantized:Qwen/Qwen3.8-27B" -> { base: "Qwen/Qwen3.8-27B", how: "quantized" }
export function baseOf(tags) {
  const hits = [].concat(tags || []).map((t) => String(t).match(/^base_model:(?:(quantized|finetune|merge|adapter):)?([\w.-]+\/[\w.-]+)$/)).filter(Boolean);
  const best = hits.find((h) => h[1]) || hits[0];
  return best ? { base: best[2], how: best[1] || '' } : { base: '', how: '' };
}
export function hfHit(x) {
  const repo = String(x?.id || x?.modelId || '');
  if (!REPO.test(repo) || x?.private === true || x?.gated) return null;
  const tags = [].concat(x.tags || []).map(String);
  const task = String(x.pipeline_tag || '');
  if (!TASK_OK.has(task)) return null;
  const { base, how } = baseOf(tags);
  return { host: 'hf', repo, name: txt(repo.split('/')[1].replace(/[-_.]?GGUF$/i, ''), 80), page: `https://huggingface.co/${repo}`, created: day(x.createdAt), modified: day(x.lastModified),
    downloads: num(x.downloads), likes: num(x.likes), license: txt(tags.find((t) => /^license:/.test(t))?.slice(8) || '', 40), base, how, task, sees: task === 'image-text-to-text' };
}
export function msHit(x) {
  const repo = String(x?.id || '');
  if (!REPO.test(repo) || x?.private === true || x?.gated === true) return null;
  const tags = [].concat(x.tags || []).map(String);
  if (!tags.some((t) => /gguf/i.test(t)) && !/gguf/i.test(repo)) return null;
  const task = String([].concat(x.tasks || [])[0] || '');
  if (!TASK_OK.has(task)) return null;
  return { host: 'ms', repo, name: txt(repo.split('/')[1].replace(/[-_.]?GGUF$/i, ''), 80), page: `https://modelscope.cn/models/${repo}`, created: day(x.created_at), modified: day(x.last_modified),
    downloads: num(x.downloads), likes: num(x.likes), license: txt(x.license, 40), base: '', how: '', task, sees: task === 'image-text-to-text', paramsB: num(x.params) ? Math.round(Number(x.params) / 1e8) / 10 : 0 };
}
const nextCursor = (link) => { const m = String(link || '').match(/<[^>]*[?&]cursor=([^&>]+)[^>]*>;\s*rel="next"/); return m ? decodeURIComponent(m[1]) : ''; };
export function sortHits(hits, sort) {
  const key = { newest: (h) => h.created, updated: (h) => h.modified || h.created, downloads: null }[sort];
  return [...hits].sort((a, b) => (key ? String(key(b)).localeCompare(String(key(a))) : b.downloads - a.downloads));
}

// -> { ok, host, hits: [...], next, total? } or { ok: false, error }. fetchFn is passed in by tests.
export async function findModels(query, { fetchFn = fetch, signal } = {}) {
  const c = cleanQuery(query);
  const site = c.host === 'ms' ? 'ModelScope' : 'Hugging Face';
  let res;
  try { res = await fetchFn(findUrl(c), { signal, redirect: 'error', headers: { accept: 'application/json' } }); } catch { return { ok: false, error: `${site} couldn't be reached. Check the internet connection and try again.` }; }
  if (res.status === 429) return { ok: false, error: `${site} says I'm asking too often. Wait a minute and try again.` };
  if (!res.ok) return { ok: false, error: `${site} answered ${res.status}. Try again later.` };
  let j; try { j = await res.json(); } catch { return { ok: false, error: `${site} sent something I couldn't read.` }; }
  if (c.host === 'ms') {
    const list = j?.data?.models;
    if (j?.success !== true || !Array.isArray(list)) return { ok: false, error: 'ModelScope sent something I couldn\'t read.' };
    const page = /^\d{1,4}$/.test(c.cursor) ? Number(c.cursor) : 1;
    const more = page * FIND_LIMIT < num(j.data.total_count) && list.length === FIND_LIMIT && page < 50;
    return { ok: true, host: 'ms', hits: sortHits(list.map(msHit).filter(Boolean), c.sort), next: more ? String(page + 1) : '', total: num(j.data.total_count) };
  }
  if (!Array.isArray(j)) return { ok: false, error: 'Hugging Face sent something I couldn\'t read.' };
  return { ok: true, host: 'hf', hits: j.slice(0, FIND_LIMIT).map(hfHit).filter(Boolean), next: nextCursor(res.headers?.get?.('link')) };
}
