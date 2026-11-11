// The two openings nomic-embed-text was taught (Nov 11): "search_query: " before a question and "search_document: "
// before the text it should find. Without them its matches are noticeably worse. Other embedding models don't use
// them, so the words go in front only for nomic. Vectors made before this fix carry no `vp` mark and are made again
// while Bob is idle; until then they're matched by words, as when there's no embedding model.
export const EMBED_PREFIX_V = 1;
const nomic = (model) => /nomic/i.test(String(model || ''));
export const asDoc = (model, t) => (nomic(model) ? `search_document: ${t}` : String(t));
export const asQuery = (model, t) => (nomic(model) ? `search_query: ${t}` : String(t));
export const embedModel = (cfg) => cfg?.housekeeping?.embedModel || 'nomic-embed-text';
// Memory line vectors live in one file keyed by model: a new key makes the file start again.
export const vecKey = (model) => (nomic(model) ? `${model}#p${EMBED_PREFIX_V}` : model);
export const freshVec = (r) => Boolean(r?.vec?.length) && r.vp === EMBED_PREFIX_V;
