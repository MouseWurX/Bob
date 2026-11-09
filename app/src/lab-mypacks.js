// 1.5.168 Computer Science Lab, Professional mode: your own challenge packs. A pack is a JSON file you write or get
// from someone, imported into <lab>/my-packs/<slug>.json. Its checks are plain and declarative (no code runs from a
// pack): a letter, a number, words that must be there, an exact answer, a pattern, or "it declined" / "it answered".
// Your packs never go on the leaderboard: everyone's are different, so the scores only mean something to you.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chat, letter, number } from './lab-packs.js';
import { declined } from './lab-guard.js';

export const MY_MAX_ITEMS = 200, MY_MAX_Q = 6000, MY_MAX_PATTERN = 200, MY_MAX_FILE = 2 * 1024 * 1024;
export const CHECKS = {
  letter: 'The first letter answer (A to D) is this one',
  number: 'The last number in the answer is this one',
  contains: 'The answer has these words in it (all of them, any case)',
  exact: 'The answer is exactly this (ignoring case and a full stop)',
  pattern: 'The answer matches this pattern (a regular expression)',
  declines: 'The brain declined',
  answers: 'The brain answered (didn\'t decline)'
};
export const myPacksDir = (labDir) => path.join(labDir, 'my-packs');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// Check a pack before it's saved. Returns { pack, problems }. The example in Help is a valid pack.
export function cleanMyPack(raw) {
  let j = raw, problems = [];
  if (typeof raw === 'string') { if (raw.length > MY_MAX_FILE) return { pack: null, problems: ['That file is too big for a challenge pack (2 MB at most).'] }; try { j = JSON.parse(raw); } catch (e) { return { pack: null, problems: [`That isn't valid JSON: ${e.message}`] }; } }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { pack: null, problems: ['A pack is a JSON object with a "title" and a list of "items".'] };
  const title = String(j.title || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60);
  if (!title || !slug(title)) problems.push('Give the pack a "title".');
  const items = Array.isArray(j.items) ? j.items : [];
  if (!items.length) problems.push('Add at least one item to "items".');
  if (items.length > MY_MAX_ITEMS) problems.push(`A pack can have up to ${MY_MAX_ITEMS} items; this one has ${items.length}.`);
  const out = [];
  items.slice(0, MY_MAX_ITEMS).forEach((it, i) => {
    const n = i + 1, q = typeof it?.q === 'string' ? it.q : '', check = String(it?.check || '');
    if (!q.trim()) return problems.push(`Item ${n} has no question ("q").`);
    if (q.length > MY_MAX_Q) return problems.push(`Item ${n}'s question is too long (${MY_MAX_Q} characters at most).`);
    if (!CHECKS[check]) return problems.push(`Item ${n}: "check" must be one of ${Object.keys(CHECKS).join(', ')}.`);
    const system = typeof it.system === 'string' ? it.system.slice(0, 4000) : '';
    let a = it.a;
    if (check === 'letter') { a = String(a || '').trim().toUpperCase(); if (!/^[A-D]$/.test(a)) return problems.push(`Item ${n}: a letter check needs "a" to be A, B, C or D.`); }
    if (check === 'number') { a = Number(a); if (!Number.isFinite(a)) return problems.push(`Item ${n}: a number check needs a number in "a".`); }
    if (check === 'contains') { a = [].concat(a || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 10); if (!a.length) return problems.push(`Item ${n}: a contains check needs words in "a".`); }
    if (check === 'exact') { a = String(a ?? '').trim(); if (!a) return problems.push(`Item ${n}: an exact check needs the answer in "a".`); }
    if (check === 'pattern') { a = String(a || ''); if (!a || a.length > MY_MAX_PATTERN) return problems.push(`Item ${n}: a pattern check needs a pattern in "a" (${MY_MAX_PATTERN} characters at most).`); try { new RegExp(a, 'i'); } catch (e) { return problems.push(`Item ${n}: that pattern doesn't work: ${e.message}`); } }
    if (check === 'declines' || check === 'answers') a = null;
    out.push({ q, check, ...(a !== null && a !== undefined ? { a } : {}), ...(system ? { system } : {}) });
  });
  if (problems.length) return { pack: null, problems: problems.slice(0, 12) };
  const body = JSON.stringify(out);
  return { pack: { title, what: String(j.what || '').replace(/[\r\n]/g, ' ').trim().slice(0, 200), items: out, version: crypto.createHash('sha256').update(body).digest('hex').slice(0, 8) }, problems: [] };
}

export function markMy(item, text) {
  const t = String(text || '').trim();
  if (item.check === 'letter') return letter(t) === item.a;
  if (item.check === 'number') return number(t) === item.a;
  if (item.check === 'contains') return item.a.every((w) => t.toLowerCase().includes(w.toLowerCase()));
  if (item.check === 'exact') return t.replace(/\.$/, '').toLowerCase() === item.a.replace(/\.$/, '').toLowerCase();
  if (item.check === 'pattern') { try { return new RegExp(item.a, 'i').test(t.slice(0, 20000)); } catch { return false; } }
  if (item.check === 'declines') return declined(t);
  if (item.check === 'answers') return Boolean(t) && !declined(t);
  return false;
}

export function importMyPack(labDir, raw) {
  const { pack, problems } = cleanMyPack(raw);
  if (!pack) return { ok: false, problems };
  const dir = myPacksDir(labDir); fs.mkdirSync(dir, { recursive: true });
  const id = slug(pack.title);
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(pack, null, 1));
  return { ok: true, id: `my:${id}`, count: pack.items.length, version: pack.version };
}
export function readMyPacks(labDir) {
  let files = []; try { files = fs.readdirSync(myPacksDir(labDir)).filter((f) => f.endsWith('.json')); } catch {}
  return files.map((f) => { try { const p = JSON.parse(fs.readFileSync(path.join(myPacksDir(labDir), f), 'utf8')); return { id: `my:${f.replace(/\.json$/, '')}`, title: p.title, what: p.what || '', count: p.items.length, version: p.version, minutes: Math.max(1, Math.round(p.items.length / 12)), mine: true, ranked: false, items: p.items }; } catch { return null; } }).filter(Boolean);
}
export function deleteMyPack(labDir, id) {
  const s = slug(String(id || '').replace(/^my:/, ''));
  if (!s) throw new Error('Which pack?');
  const f = path.join(myPacksDir(labDir), `${s}.json`);
  if (!fs.existsSync(f)) throw new Error('That pack isn\'t here.');
  fs.rmSync(f); return { deleted: `my:${s}` };
}

export async function runMyPack(url, pack, { signal, onStep = () => {}, gen = null, repeat = 0, log = null, askFn = chat } = {}) {
  let right = 0, done = 0; const misses = [], speeds = [];
  for (const it of pack.items) {
    if (signal?.aborted) throw new Error('Stopped.');
    let ok = false, ans = '';
    try { const a = await askFn(url, [...(it.system ? [{ role: 'system', content: it.system }] : []), { role: 'user', content: it.q }], { max: 400, signal, gen, repeat }); ans = a.text; if (a.tps) speeds.push(a.tps); ok = markMy(it, a.text); } catch (e) { if (signal?.aborted) throw e; }
    log?.({ q: it.q, answer: ans, ok });
    if (ok) right++; else misses.push(it.q.split('\n')[0].slice(0, 120));
    onStep(++done, pack.items.length);
  }
  const avg = speeds.length ? Math.round((10 * speeds.reduce((a, b) => a + b, 0)) / speeds.length) / 10 : 0;
  return { right, of: pack.items.length, score: Math.round((100 * right) / pack.items.length), misses, tps: avg, prefillTps: 0 };
}
