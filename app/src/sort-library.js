// "Sort and rename": puts a folder of music, videos or photos (a library, Downloads, an output folder) into
// the user's naming pattern for each kind of file (src/sort-names.js), reading song tags and episode numbers
// (src/media-tags.js). A rule with its own folder sends its files there, so Downloads can feed a library.
// It only plans: the rows go on the usual Files card for the user to tick, and applyFiles (hands-files.js)
// moves them, never overwriting, with a journal entry so the whole job can be undone.
import fs from 'node:fs';
import path from 'node:path';
import { isSensitive } from './tools.js';
import { guardPath } from './hands-files.js';
import { handsSettings } from './hands-settings.js';
import { fillPattern, ruleFor, SIDECARS } from './sort-names.js';
import { mediaInfo, mediaKind } from './media-tags.js';

export const MAX_SORT_ROWS = 1000;  // per card; the rest are planned next time (files already in place are skipped)
const MAX_SEEN = 50000;             // entries looked at in one go
const MAX_PATH = 250;               // Windows' old limit, kept everywhere so a library can move between computers
const PARTIAL = /\.(crdownload|part|partial|download|tmp|opdownload|!qb|aria2)$/i;
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// All files under dir (and its subfolders when deep), names sorted so a {n} count is the same every time.
function walk(cfg, dir, deep, skip) {
  const files = [];
  let seen = 0;
  const go = (d) => {
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const e of list) {
      if (++seen > MAX_SEEN) return;
      const p = path.join(d, e.name);
      if (e.name.startsWith('.') || e.isSymbolicLink() || isSensitive(cfg, p) || skip.some((s) => path.resolve(s) === path.resolve(p))) continue;
      if (e.isDirectory()) { if (deep) go(p); } else if (e.isFile()) files.push(p);
    }
  };
  go(dir);
  return { files, cut: seen > MAX_SEEN };
}

// Names a missing album or artist after the folders a song sits in (Artist/Album/song.mp3), only inside the
// folder being sorted. Returns what it guessed.
function folderGuess(root, file) {
  const rel = path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean);
  const out = {};
  if (rel.length >= 1) out.album = rel[rel.length - 1];
  if (rel.length >= 2) out.artist = rel[rel.length - 2];
  return out;
}

// Plans a sort. args: { folder, kinds?: [rule ids], subfolders?: bool (default true) }.
// Returns a plan applyFiles understands: { action: 'sort', label, rows, more, fine, prune }.
export function planSort(cfg, args = {}, { now = Date.now() } = {}) {
  const dir = guardPath(cfg, args.folder || [].concat(args.paths || [])[0], { what: 'That folder' });
  if (!isDir(dir)) throw new Error(`${dir} is not a folder.`);
  const want = [].concat(args.kinds || []).map((k) => String(k).toLowerCase()).filter(Boolean);
  let rules = handsSettings(cfg).sortRules.filter((r) => r.on && r.pattern);
  if (want.length) rules = rules.filter((r) => want.includes(r.id) || want.includes(r.label.toLowerCase()));
  if (!rules.length) throw new Error(want.length ? `No naming rule called ${want.join(', ')} is switched on. They are in Settings, Hands, under Sort and rename.` : 'No naming rules are switched on. Set them in Settings, Hands, under Sort and rename.');
  // A rule's own folder must be one Bob may use too; if not, its files are shown but blocked.
  const destWhy = {};
  for (const r of rules) if (r.dest) { try { guardPath(cfg, r.dest, { mustExist: false, what: r.dest }); } catch (e) { destWhy[r.id] = `The ${r.label} folder (${r.dest}) isn't one I may use: ${e.message}`; } }
  const exts = new Set(rules.flatMap((r) => r.exts));
  // Don't sort a rule's destination again when it sits inside the folder being sorted (Downloads/Music).
  const skip = rules.map((r) => r.dest).filter((d) => d && d !== dir);
  const { files, cut } = walk(cfg, dir, args.subfolders !== false, skip);
  const byDir = new Map();
  for (const f of files) { const d = path.dirname(f); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(path.basename(f)); }

  const rows = [], counts = {}, taken = new Set();
  let more = 0, fine = 0;
  const row = (r) => rows.push({ id: String(rows.length + 1), note: '', blocked: '', ...r });
  const clash = (to, from) => {
    const key = to.toLowerCase();
    if (taken.has(key)) return 'Two files would get the same name.';
    if (fs.existsSync(to) && to.toLowerCase() !== from.toLowerCase()) return 'Something with that name is already there (nothing is overwritten).';
    if (to.length > MAX_PATH) return 'That name would be too long for Windows.';
    taken.add(key);
    return '';
  };
  const recent = now - 2 * 60_000;
  for (const file of files) {
    const ext = path.extname(file);
    if (!exts.has(ext.toLowerCase()) || PARTIAL.test(file)) continue;
    let stat;
    try { stat = fs.statSync(file); } catch { continue; }
    if (stat.mtimeMs > recent) continue; // still downloading, or just made
    const info = mediaInfo(file, stat);
    const rule = ruleFor(rules, ext, info.isEpisode);
    if (!rule) continue;
    let guessed = false;
    if (mediaKind(ext.toLowerCase()) === 'audio' && !info.tagged) {
      const g = folderGuess(dir, file);
      for (const [k, v] of Object.entries(g)) if (!info[k]) { info[k] = v; guessed = true; }
    }
    counts[rule.id] = (counts[rule.id] || 0) + 1;
    info.n = String(counts[rule.id]);
    info.folder = path.basename(path.dirname(file));
    const parts = fillPattern(rule.pattern, info);
    if (!parts) continue;
    const to = path.join(rule.dest || dir, ...parts) + ext;
    if (to === file) { fine++; continue; }
    if (rows.length >= MAX_SORT_ROWS) { more++; continue; }
    const note = `${rule.label}${info.tagged ? '' : guessed ? ', from its name and folders' : ', from its name'}`;
    const mainWhy = destWhy[rule.id] || clash(to, file);
    row({ op: 'move', from: file, to, note, blocked: mainWhy });
    // Subtitles, lyrics and notes with the same name go with it ("Film.srt", "Film.en.srt").
    const base = path.basename(file, ext);
    for (const sib of byDir.get(path.dirname(file)) || []) {
      const sx = path.extname(sib);
      if (!SIDECARS.includes(sx.toLowerCase())) continue;
      const stem = path.basename(sib, sx);
      if (stem !== base && !stem.startsWith(`${base}.`)) continue;
      const from = path.join(path.dirname(file), sib);
      const sto = path.join(path.dirname(to), parts[parts.length - 1] + stem.slice(base.length) + sx);
      if (sto === from || rows.length >= MAX_SORT_ROWS) continue;
      row({ op: 'move', from, to: sto, note: `goes with ${path.basename(file)}`, blocked: mainWhy ? 'It stays with its main file.' : clash(sto, from) });
    }
  }
  const where = [...new Set(rules.map((r) => r.dest).filter(Boolean))];
  const label = `Sort and rename ${rows.length} file${rows.length === 1 ? '' : 's'} in ${dir}${where.length ? ` (some go to ${where.join(', ')})` : ''}`;
  return { action: 'sort', label, rows, more, fine, cut, folder: dir, prune: [dir, ...where] };
}

// What the brain is told when the plan is empty, or after it ran.
export function sortSummary(plan) {
  const bits = [];
  if (plan.fine) bits.push(`${plan.fine} already had the right name`);
  if (plan.more) bits.push(`${plan.more} more to do: ask again after this card and they come next`);
  if (plan.cut) bits.push(`the folder is very big, so only the first ${MAX_SEEN} entries were looked at`);
  return bits.join('; ');
}
