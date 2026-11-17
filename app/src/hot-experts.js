// Hot experts on the card (Nov 16 2026, the owner: "build it all, with an automatic calibration for performance, as
// well as configurable, manual switches or dials"). Off until turned on (Settings, Speed & memory).
//
// A brain made of experts that doesn't fit the card keeps part of its experts in RAM, and every word that picks one of
// those waits on the processor. llama.cpp 1.0 has its own expert cache on the card (--moe-cache-mib): it keeps the
// experts it has seen most, and with --moe-cache-cpu-share 1 a missed expert is worked out on the processor instead
// of copied over, so the cache doesn't churn. (1.5.193 used the cache with the share at 0, which copies every miss to
// the card; that made writing 2.5 to 3 times slower, and 1.5.198 took it out.) Brain Engine patch 0016 fills the cache
// at load from a ranking of the experts (the environment key LLAMA_MOE_CACHE_RANKING holds the PATH of a ranking file),
// so the busiest sit on the card from the first word.
//
// What it can't do: only words written one or a few at a time (batches up to 32) go through the cache. Prompt reading
// goes in big batches that skip it, so hot experts never make prompt reading or the first word of a long prompt
// faster; Reading speed is the setting for that. With Turbo, the guesses are checked in small batches, which do use
// the cache, and can move a few experts (the engine counts them as "uploaded").
//
// Wrong rankings are refused out loud, never used quietly: the engine prints the brain's fingerprint at load, the
// ranking carries the fingerprint of the brain it was counted on, and the engine refuses (and warns) a ranking that
// is missing, malformed, from another brain, or names an expert the brain doesn't have, then fills the stock way.
// Bob checks first too: a profile whose brain file changed since (size or date) isn't passed at all.
//
// The ranking is a profile: how often each expert was picked while the brain read a fixed, labelled mix of Bob's
// kinds of work (src/hot-experts-mix.js, the same for everyone; nobody's chats go into it). Calibrate makes one per
// kind (coding, office, research, chat) plus a mixed one; the brain's job picks which loads, and mixed is the
// fallback. Each profile is stamped with the mix's fingerprint, the brain file's size and date, and the engine build,
// so a speed result can say exactly which placement made it.
//
// Profiles in <data>/hot-experts/<brain>-<kind>.json; the file the engine reads beside it, <brain>-<kind>.ranking.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HOT_MIX } from './hot-experts-mix.js';

export const HOT_KINDS = ['mixed', 'coding', 'office', 'research', 'chat'];
export const hotOn = (cfg) => cfg?.hotExperts === true;
export const hotDir = (cfg) => path.join(cfg.dataDir, 'hot-experts');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'brain';
export const profileFile = (cfg, model, kind) => path.join(hotDir(cfg), `${slug(model)}-${kind}.json`);
export const rankingFile = (cfg, model, kind) => path.join(hotDir(cfg), `${slug(model)}-${kind}.ranking`);
export const RANKING_ENV = 'LLAMA_MOE_CACHE_RANKING'; // holds a file path, not a number

// The mix for one kind (mixed = all of them), and its fingerprint (sha256 of the mix as text).
export const mixFor = (kind) => (kind === 'mixed' ? HOT_KINDS.slice(1).flatMap((k) => HOT_MIX[k] || []) : HOT_MIX[kind] || []);
export const mixHash = (kind = 'mixed') => crypto.createHash('sha256').update(JSON.stringify(mixFor(kind))).digest('hex');

// Room for the cache on the card, in MB: set by hand (hotExpertsGB, 1 to 12 GB), or a quarter of the card, at most 4 GB.
export function hotCacheMB(cfg) {
  const hand = Number(cfg?.hotExpertsGB);
  if (Number.isFinite(hand) && hand >= 1 && hand <= 12) return Math.round(hand * 1024);
  const card = Number(cfg?.gpuVramGB || cfg?.cardGB) || 0;
  return card ? Math.round(Math.min(4, card / 4) * 1024) : 0;
}
export const hotCopyFor = (cfg, model) => cfg?.hotExpertsCopy?.[model] === true;
export const cleanHotGB = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 1 && n <= 12 ? Math.round(n * 2) / 2 : null; };

// Which profile a brain loads: the kind of its job (from the jobs it holds), else mixed.
const JOB_KIND = { coder: 'coding', coding: 'coding', code: 'coding', office: 'office', research: 'research', deep: 'research', thinker: 'research', bob: 'chat', quick: 'chat', chat: 'chat' };
export function kindFor(cfg, model) {
  const jobs = Object.entries(cfg?.models || {}).filter(([, m]) => m === model).map(([k]) => JOB_KIND[k]).filter(Boolean);
  const kinds = [...new Set(jobs)];
  return kinds.length === 1 ? kinds[0] : 'mixed'; // a brain doing several kinds of job gets the mixed profile
}

// Pick counts from one Brain Engine trace with the mass on (patch 0009): trace.layers[il] = picks per expert.
// Added into acc (acc[il][e]). Rows that aren't lists of numbers are skipped.
export function addMass(acc, trace) {
  const rows = trace?.layers;
  if (!Array.isArray(rows)) return acc;
  rows.forEach((row, il) => {
    if (!Array.isArray(row)) return;
    acc[il] = acc[il] || [];
    row.forEach((v, e) => { const n = Number(v); if (Number.isFinite(n) && n > 0) acc[il][e] = (acc[il][e] || 0) + n; });
  });
  return acc;
}
// The engine's ranking file: "bob-moe-ranking 2 <fingerprint> <stamp>", then "<layer> <expert> <count>", busiest first.
// The fingerprint (16 hex digits) is the one the engine printed for the brain the counts came from.
export const FINGERPRINT_RE = /MoE cache brain fingerprint = ([0-9a-f]{16})/;
export function rankingText(counts, fingerprint, stampId) {
  if (!/^[0-9a-f]{16}$/.test(String(fingerprint || ''))) throw new Error('A ranking needs the brain\'s fingerprint from the engine.');
  const lines = [];
  (counts || []).forEach((row, il) => (row || []).forEach((n, e) => { if (n > 0) lines.push([il, e, n]); }));
  lines.sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);
  return [`bob-moe-ranking 2 ${fingerprint} ${String(stampId || 'unstamped').replace(/\s+/g, '_')}`, ...lines.map(([il, e, n]) => `${il} ${e} ${n}`)].join('\n') + '\n';
}
// The stamp: what made this profile, so any number measured with it can name the whole system.
export const brainId = (gguf, statImpl = fs.statSync) => { try { const st = statImpl(gguf); return `${path.basename(gguf)}:${st.size}:${Math.round(st.mtimeMs)}`; } catch { return ''; } };
export function profileStamp({ kind, gguf, engine = '', patches = [], fingerprint = '', statImpl = fs.statSync } = {}) {
  return { kind, mix: mixHash(kind).slice(0, 16), brain: brainId(gguf, statImpl) || path.basename(String(gguf || '')), fingerprint, engine, patches: [...patches] };
}
export const stampId = (s) => `${s.kind}.mix-${s.mix}.${String(s.engine || 'engine').replace(/[^\w.-]/g, '')}`;

export function saveProfile(cfg, model, counts, stamp, { write = fs.writeFileSync, mkdir = fs.mkdirSync } = {}) {
  mkdir(hotDir(cfg), { recursive: true });
  const picks = (counts || []).reduce((a, row) => a + (row || []).reduce((x, n) => x + (n || 0), 0), 0);
  write(profileFile(cfg, model, stamp.kind), JSON.stringify({ model, stamp, picks, layers: counts }));
  write(rankingFile(cfg, model, stamp.kind), rankingText(counts, stamp.fingerprint, stampId(stamp)));
  return { kind: stamp.kind, picks };
}
export function loadProfile(cfg, model, kind, { read = fs.readFileSync } = {}) {
  try { const p = JSON.parse(read(profileFile(cfg, model, kind), 'utf8')); return p?.stamp?.kind === kind ? p : null; } catch { return null; }
}
export const profilesFor = (cfg, model, opts) => HOT_KINDS.filter((k) => loadProfile(cfg, model, k, opts));

export const VERBOSITY_FLAGS = ['-lv', '--verbosity', '--log-verbosity', '-v', '--verbose', '--log-verbose'];

// The engine flags and environment for one brain load. Only with the switch on, a brain on the card with part of its
// experts in RAM, an engine new enough for --moe-cache-cpu-share (llama.cpp b12359), and room for the cache.
// Without a usable profile, the cache still runs (it fills as words come), and `stale` says why the profile wasn't
// used, for the logbook. Calibrate makes profiles.
// -> { args, env, kind, seeded, stale }
export function hotArgs(cfg, model, { args = [], cpu = false, build = 0, gguf = '', exists = fs.existsSync, read, statImpl = fs.statSync } = {}) {
  const none = { args: [], env: {}, kind: '', seeded: false, stale: '' };
  if (!hotOn(cfg) || cpu || !(build >= 12359)) return none;
  if (args.includes('--moe-cache-mib')) return none; // set by hand
  if (!args.some((a) => ['--fit', '--n-cpu-moe', '-ncmoe', '--cpu-moe', '-ot', '--override-tensor'].includes(a))) return none;
  const mb = hotCacheMB(cfg);
  if (!mb) return none;
  // llama-server hides the engine's own info lines below -lv 4 (they sit one level under its default of 3), and the
  // fingerprint and "ranked fill" lines are info lines. Found on the PC Nov 16. Warnings (a refused ranking) show anyway.
  // Nov 17: the copy kind (share 0) for a brain Calibrate found faster that way (hotExpertsCopy[model], set by "Use
  // recommended"); otherwise the processor kind (share 1), which never churns.
  const cache = ['--moe-cache-mib', String(mb), '--moe-cache-cpu-share', hotCopyFor(cfg, model) ? '0' : '1', ...(args.some((a) => VERBOSITY_FLAGS.includes(a)) ? [] : ['-lv', '4'])];
  let kind = kindFor(cfg, model);
  if (!exists(rankingFile(cfg, model, kind))) kind = 'mixed';
  if (!exists(rankingFile(cfg, model, kind))) return { ...none, args: cache };
  const prof = loadProfile(cfg, model, kind, read ? { read } : {});
  const now = gguf ? brainId(gguf, statImpl) : '';
  const stale = !prof ? `the ${kind} profile can't be read` : !prof.stamp?.fingerprint ? `the ${kind} profile has no brain fingerprint (made before Nov 16)` : now && prof.stamp.brain !== now ? `the brain file changed since the ${kind} profile was made (Calibrate again)` : '';
  if (stale) return { ...none, args: cache, stale };
  return { args: cache, env: { [RANKING_ENV]: rankingFile(cfg, model, kind) }, kind, seeded: true, stale: '' };
}

// The engine's own words about the cache (Bob reads its output):
// "MoE cache brain fingerprint = F" and "ranked fill: N experts (X MiB) from ..." at load, or
// "!!! MoE cache ranking NOT USED: why (path)" when it refused one; and when it stops,
// "llama_moe_cache: ubatch <= 8: hits = H, misses = M (C on the CPU), hit rate = R%, uploaded = U MiB".
// -> { fingerprint, filled, filledMiB, refused, small: {hits, misses, cpu, rate, uploadedMiB}, large }
export function parseCacheLog(text) {
  const t = String(text || '');
  const out = { fingerprint: '', filled: null, filledMiB: null, refused: '', small: null, large: null };
  const f = FINGERPRINT_RE.exec(t); if (f) out.fingerprint = f[1];
  const s = /ranked fill: (\d+) experts \(([\d.]+) MiB\)/.exec(t);
  if (s) { out.filled = Number(s[1]); out.filledMiB = Number(s[2]); }
  const r = /!!! MoE cache ranking NOT USED: (.*?) \(([^()]*)\)\. The cache fills the stock way/.exec(t);
  if (r) out.refused = r[1];
  for (const m of t.matchAll(/llama_moe_cache: ubatch\s+(<=|>) 8: hits = (\d+), misses = (\d+) \((\d+) on the CPU\), hit rate = ([\d.]+)%, uploaded = ([\d.]+) MiB/g)) {
    out[m[1] === '<=' ? 'small' : 'large'] = { hits: Number(m[2]), misses: Number(m[3]), cpu: Number(m[4]), rate: Number(m[5]), uploadedMiB: Number(m[6]) };
  }
  // the share the processor worked out (the tail): misses it computed, of all picks in small batches
  if (out.small) out.small.cpuShare = out.small.hits + out.small.misses ? Math.round((1000 * out.small.cpu) / (out.small.hits + out.small.misses)) / 10 : 0;
  return out;
}
