// 1.5.137: Bob's newest brain list. With "Let Bob fetch his newest brain list" on (setting catalogUpdates, off unless
// you turn it on), Bob reads catalog.json from his own GitHub repository once a day (and when you press Check now), so
// brains that came out between releases show up without waiting for a new Bob. Only a list that passes every check
// is used: newer than the one he has, every file pinned to an exact Hugging Face commit with its size and sha256 (the
// same rule as the list that ships), no brain claiming to be Bob's own or yours. A newer list adds brains and updates
// the ones it names; it never removes one. Starter sets stay the shipped ones (those are tried on real hardware).
// Kept in dataDir/catalog-latest.json; nothing else is sent or kept. The phone app keeps its own list.
import fs from 'node:fs';
import path from 'node:path';

export const LIST_URL = 'https://raw.githubusercontent.com/MouseWurX/Bob/main/catalog.json';
export const CHECK_EVERY_MS = 24 * 3600_000;
const MAX_BYTES = 4 * 1024 * 1024;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PINNED = /^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/resolve\/[0-9a-f]{40}\/[^?#\s]+$/;
const SHA = /^[0-9a-f]{64}$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;

export const onFor = (cfg) => cfg?.catalogUpdates === true;

// Why one brain in a fetched list can't be used, or ''.
export function badModel(m, shipped = null) {
  if (!m || typeof m !== 'object') return 'not a brain';
  if (!ID.test(String(m.id || ''))) return 'no proper id';
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 80) return 'no name';
  if (typeof m.family !== 'string' || !m.family.trim()) return 'no family';
  if (!m.category || typeof m.category !== 'string') return 'no category';
  if (m.own === true || m.madeByBob === true) return 'claims to be yours or Bob\'s own';
  // An entry exactly as it ships (same files, same folder) is fine as it is: the shipped list has its own checks, and a
  // few voices are pinned by size only there.
  const same = shipped && JSON.stringify(shipped.files || []) === JSON.stringify(m.files || []) && (shipped.into || '') === (m.into || '');
  if (m.into && !same) return 'wants its own folder';
  if (m.published != null && !DATE.test(m.published)) return 'bad release date';
  const files = same ? [] : m.files || [];
  if (!same && !files.length && !m.ollama) return 'no files';
  for (const f of files) {
    if (!PINNED.test(String(f?.url || ''))) return 'a file isn\'t pinned to an exact commit';
    if (!(Number.isInteger(f.bytes) && f.bytes > 0)) return 'a file has no size';
    if (!SHA.test(String(f.sha256 || ''))) return 'a file has no sha256';
    if (f.saveAs != null && !/^[\w.-]+\.gguf$/i.test(String(f.saveAs))) return 'a file has a strange name';
  }
  return '';
}
const badBig = (b) => (!b || !ID.test(String(b.id || '')) || typeof b.name !== 'string' || !REPO.test(String(b.hf || '')) ? 'bad big brain' : '');

// Checks a fetched list against the one Bob has. { ok, why } or { ok: true, list }.
export function checkList(j, { have = '', shipped = null } = {}) {
  const known = new Map((shipped?.models || []).map((m) => [m.id, m]));
  if (!j || typeof j !== 'object' || !Array.isArray(j.models)) return { ok: false, why: 'That isn\'t a brain list.' };
  if (!DATE.test(String(j.updated || ''))) return { ok: false, why: 'The list has no date.' };
  if (have && String(j.updated) <= String(have)) return { ok: false, why: 'Nothing newer than what I have.', same: true };
  for (const m of j.models) { const why = badModel(m, known.get(m?.id)); if (why) return { ok: false, why: `One brain (${String(m?.id || '?').slice(0, 40)}) didn't pass: ${why}. I kept the list I have.` }; }
  for (const b of j.bigBrains || []) if (badBig(b)) return { ok: false, why: 'One of the really big brains didn\'t pass. I kept the list I have.' };
  return { ok: true, list: { updated: j.updated, models: j.models, bigBrains: j.bigBrains || [] } };
}

// The shipped list with a newer one laid over it: by id, add or update, never remove.
export function overlay(shipped, latest) {
  if (!latest || !(String(latest.updated || '') > String(shipped.updated || ''))) return shipped;
  const byId = (arr, add) => { const out = [...(arr || [])]; for (const x of add || []) { const i = out.findIndex((y) => y.id === x.id); if (i >= 0) out[i] = { ...x, fromLatest: true }; else out.push({ ...x, fromLatest: true }); } return out; };
  return { ...shipped, updated: latest.updated, models: byId(shipped.models, latest.models), bigBrains: byId(shipped.bigBrains, latest.bigBrains) };
}

export class CatalogUpdates {
  constructor(cfg, { fetch: f = globalThis.fetch, now = Date.now, log = () => {} } = {}) {
    this.cfg = cfg; this.fetch = f; this.now = now; this.log = log;
    this.file = path.join(cfg.dataDir, 'catalog-latest.json');
    this.last = { at: 0, ok: null, why: '' };
  }
  saved(shipped = this.shippedList) { try { const j = JSON.parse(fs.readFileSync(this.file, 'utf8')); return checkList(j, { shipped }).ok ? j : null; } catch { return null; } }
  // The list to use: the shipped one, or the saved newer one over it while the switch is on.
  merge(shipped) { this.shippedList = shipped; return onFor(this.cfg) ? overlay(shipped, this.saved(shipped)) : shipped; }
  status(shipped) {
    const s = this.saved();
    return { on: onFor(this.cfg), shipped: shipped?.updated || '', latest: s?.updated || '', checkedAt: this.last.at || 0, ok: this.last.ok, why: this.last.why };
  }
  async check(shipped) {
    if (!onFor(this.cfg)) return { ok: false, why: 'off' };
    this.last.at = this.now();
    try {
      const res = await this.fetch(LIST_URL, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new Error('The list was far too big, so I left it.');
      const have = [shipped?.updated, this.saved(shipped)?.updated].filter(Boolean).sort().pop() || '';
      const r = checkList(JSON.parse(text), { have, shipped });
      if (!r.ok) { this.last.ok = r.same ? true : false; this.last.why = r.why; return { ok: r.same === true, why: r.why, same: r.same === true }; }
      fs.writeFileSync(this.file, JSON.stringify(r.list));
      const known = new Set((shipped?.models || []).map((m) => m.id));
      const added = r.list.models.filter((m) => !known.has(m.id)).length;
      this.last.ok = true; this.last.why = `Got the list from ${r.list.updated}: ${added} new ${added === 1 ? 'brain' : 'brains'}.`;
      this.log('models', `newest brain list: ${r.list.updated}, ${r.list.models.length} brains (${added} new)`);
      return { ok: true, updated: r.list.updated, added, why: this.last.why };
    } catch (e) {
      this.last.ok = false; this.last.why = /abort|timeout/i.test(e.message) ? 'GitHub didn\'t answer in time.' : e.message;
      return { ok: false, why: this.last.why };
    }
  }
  due() { return onFor(this.cfg) && this.now() - (this.last.at || 0) > CHECK_EVERY_MS; }
}
