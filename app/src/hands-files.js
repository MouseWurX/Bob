// The "Files" Hand: move, copy, rename, zip, unzip, tidy a folder, and throw things away (to the Recycle Bin).
// Every job is planned first: a list of rows (one per file) that the user sees and ticks before anything moves.
// Nothing is ever overwritten, nothing is hard-deleted, and every job goes in a journal so it can be undone.
// Bob may only work inside the folders the user ticked in Settings (hands.folders), never in read-only
// folders, his own settings, or secret files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { insideAny, isInside, appDir } from './config.js';
import { isSensitive } from './tools.js';
import { recycle, forgetTrashInfo } from './recycle.js';
import { collect, writeZip, unzip, readZipList } from './zip.js';
import { handsSettings, readOnlyRoots, limitOn } from './hands-settings.js';
import { fileSize } from './util.js';

const MAX_ROWS = 500;
const ACTIONS = ['move', 'copy', 'rename', 'tidy', 'zip', 'unzip', 'recycle', 'delete'];

// Where tidy sorts things. Anything else stays where it is.
export const KINDS = {
  Pictures: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.heic', '.svg', '.ico', '.psd', '.kra', '.xcf'],
  Videos: ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.wmv', '.m4v'],
  Music: ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma'],
  Documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.rtf', '.txt', '.md', '.csv', '.epub'],
  Archives: ['.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz2', '.xz'],
  Installers: ['.exe', '.msi', '.msix', '.appx', '.apk', '.aab'],
  '3D and models': ['.blend', '.fbx', '.obj', '.glb', '.gltf', '.stl', '.gguf', '.safetensors'],
  Code: ['.js', '.ts', '.py', '.json', '.html', '.css', '.c', '.cpp', '.h', '.rs', '.java', '.kt', '.cs', '.ps1', '.bat', '.cmd', '.sh']
};
const kindOf = (file) => Object.entries(KINDS).find(([, exts]) => exts.includes(path.extname(file).toLowerCase()))?.[0] || '';
const PARTIAL = /\.(crdownload|part|partial|download|tmp|opdownload)$/i;

// The folders the Files Hand may work in: the ones the user ticked, minus anything read-only or Bob's own.
export function handsRoots(cfg) {
  const ro = [...readOnlyRoots(cfg), appDir, cfg.dataDir].filter(Boolean);
  return handsSettings(cfg).folders.filter((f) => !insideAny(ro, f));
}

const say = (p) => p; // paths are shown as they are; kept as a hook for shortening later

// Throws a plain-English reason if Bob may not touch this path with the Files Hand.
export function guardPath(cfg, p, { mustExist = true, what = 'that' } = {}) {
  if (!p || typeof p !== 'string') throw new Error('A full path is needed.');
  if (!path.isAbsolute(p) && !/^[a-zA-Z]:[\\/]/.test(p)) throw new Error(`Please give a full path, like C:\\Users\\you\\Downloads\\file.zip (got "${p}").`);
  const full = path.resolve(p);
  if (isSensitive(cfg, full)) throw new Error('That holds keys or passwords, so it stays off-limits to me.');
  if (cfg.settingsFile && path.resolve(cfg.settingsFile) === full) throw new Error("That's my own settings file, which I can't change.");
  if (insideAny([...readOnlyRoots(cfg), appDir, cfg.dataDir].filter(Boolean), full)) throw new Error(`${full} is read-only for me.`);
  const roots = handsRoots(cfg);
  if (!insideAny(roots, full)) throw new Error(roots.length ? `I can only work with files in: ${roots.join('; ')}. You can tick more folders in Settings, Hands.` : 'No folders are ticked for the Files Hand yet. Tick some in Settings, Hands.');
  if (mustExist && !fs.existsSync(full)) throw new Error(`${what === 'that' ? full : what} doesn't exist.`);
  return full;
}

// Secret files inside a folder (so a folder holding keys isn't moved or zipped by Bob). Stops after 20000 entries.
function secretsInside(cfg, dir) {
  const found = [];
  let seen = 0;
  const walk = (d) => {
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (++seen > 20000 || found.length > 3) return;
      const p = path.join(d, e.name);
      if (isSensitive(cfg, p)) found.push(p);
      else if (e.isDirectory() && !e.isSymbolicLink()) walk(p);
    }
  };
  walk(dir);
  return found;
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const sizeOf = fileSize;
const listArg = (a) => [].concat(a || []).filter((x) => typeof x === 'string' && x.trim());
const BAD_NAME = /[<>:"/\\|?*\x00-\x1f]|^\s|\s$|^\.+$|^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

// A free name next to `p` ("photo (2).jpg"), for zips and unzip folders Bob makes.
export function freeName(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let n = 2; n < 1000; n++) { const c = path.join(dir, `${name} (${n})${ext}`); if (!fs.existsSync(c)) return c; }
  throw new Error('Too many files with that name already.');
}

// ---- Planning: what would happen, row by row. Nothing changes here. ----
// Returns { action, label, rows: [{ id, op, from, to, note, blocked }] }.
export function planFiles(cfg, args = {}) {
  const action = String(args.action || '');
  if (!ACTIONS.includes(action)) throw new Error(`Unknown file action. Use one of: ${ACTIONS.join(', ')}.`);
  const rows = [];
  const row = (r) => { if (rows.length >= MAX_ROWS) throw new Error(`That is more than ${MAX_ROWS} files in one go. Please split it up.`); rows.push({ id: String(rows.length + 1), note: '', blocked: '', ...r }); };
  const taken = new Set(); // targets already used by earlier rows in this plan
  const target = (to) => {
    if (fs.existsSync(to)) return 'Something with that name is already there (nothing is overwritten).';
    if (taken.has(to.toLowerCase())) return 'Two files would get the same name.';
    taken.add(to.toLowerCase());
    return '';
  };
  const secretNote = (p) => (isDir(p) && secretsInside(cfg, p).length ? 'This folder holds files with keys or passwords, so I leave it alone.' : '');

  if (action === 'move' || action === 'copy') {
    const dest = guardPath(cfg, args.to, { mustExist: false, what: 'The destination folder' });
    if (fs.existsSync(dest) && !isDir(dest)) throw new Error(`${dest} is a file, not a folder.`);
    const from = listArg(args.paths);
    if (!from.length) throw new Error('Which files? Give their full paths.');
    for (const f of from) {
      const src = guardPath(cfg, f);
      const to = path.join(dest, path.basename(src));
      if (isInside(src, dest)) { row({ op: action, from: src, to, blocked: 'A folder can\'t go inside itself.' }); continue; }
      row({ op: action, from: src, to, note: isDir(src) ? 'folder' : '', blocked: secretNote(src) || target(to) });
    }
    return { action, label: `${action === 'move' ? 'Move' : 'Copy'} ${from.length} item${from.length === 1 ? '' : 's'} to ${say(dest)}`, rows, dest };
  }

  if (action === 'rename') {
    const from = listArg(args.paths);
    if (!from.length) throw new Error('Which files? Give their full paths.');
    const single = typeof args.newName === 'string' && args.newName.trim();
    if (single && from.length > 1) throw new Error('newName is for one file. For many files use find/replace, prefix, suffix or pattern.');
    if (!single && !args.find && !args.prefix && !args.suffix && !args.pattern) throw new Error('How should they be renamed? Give newName, find and replace, prefix, suffix, or a pattern like "Holiday {n}".');
    let n = Number.isInteger(args.start) ? args.start : 1;
    const pad = Math.min(6, Math.max(1, String(n + from.length - 1).length, Number(args.pad) || 0));
    for (const f of from) {
      const src = guardPath(cfg, f);
      const { dir, name, ext } = path.parse(src);
      const keepExt = isDir(src) ? '' : ext;
      let base = single ? String(args.newName).trim() : name;
      if (!single) {
        if (args.pattern) base = String(args.pattern).replace(/\{n\}/g, String(n++).padStart(pad, '0')).replace(/\{name\}/g, name);
        if (args.find) base = base.split(String(args.find)).join(String(args.replace ?? ''));
        base = `${args.prefix || ''}${base}${args.suffix || ''}`;
      }
      const newFile = single && path.extname(base) ? base : base + keepExt;
      const to = path.join(dir, newFile);
      if (BAD_NAME.test(newFile) || newFile.length > 200) { row({ op: 'move', from: src, to, blocked: 'That isn\'t a name Windows allows.' }); continue; }
      if (to === src) { row({ op: 'move', from: src, to, blocked: 'The name stays the same.' }); continue; }
      const sameButCase = to.toLowerCase() === src.toLowerCase();
      row({ op: 'move', from: src, to, blocked: sameButCase ? '' : target(to) });
    }
    return { action, label: `Rename ${from.length} item${from.length === 1 ? '' : 's'}`, rows };
  }

  if (action === 'tidy') {
    const dir = guardPath(cfg, args.folder || args.to || listArg(args.paths)[0], { what: 'That folder' });
    if (!isDir(dir)) throw new Error(`${dir} is not a folder.`);
    const recent = Date.now() - 2 * 60_000;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const src = path.join(dir, e.name);
      if (isSensitive(cfg, src) || PARTIAL.test(e.name) || /^desktop\.ini$|^thumbs\.db$/i.test(e.name)) continue;
      const kind = kindOf(e.name);
      if (!kind) continue;
      let mtime = 0;
      try { mtime = fs.statSync(src).mtimeMs; } catch {}
      if (mtime > recent) continue; // still downloading, or just arrived
      const to = path.join(dir, kind, e.name);
      if (isDir(path.join(dir, kind)) === false && fs.existsSync(path.join(dir, kind))) { row({ op: 'move', from: src, to, blocked: `There's a file called ${kind} in the way.` }); continue; }
      row({ op: 'move', from: src, to, note: kind, blocked: target(to) });
    }
    return { action, label: `Tidy ${say(dir)} into folders by kind (${rows.length} file${rows.length === 1 ? '' : 's'})`, rows, folder: dir };
  }

  if (action === 'zip') {
    const from = listArg(args.paths).map((f) => guardPath(cfg, f));
    if (!from.length) throw new Error('Which files or folder? Give their full paths.');
    const first = from[0];
    let to = args.to ? guardPath(cfg, args.to, { mustExist: false }) : path.join(path.dirname(first), `${from.length === 1 ? path.parse(first).name : path.basename(path.dirname(first))}.zip`);
    if (isDir(to)) to = path.join(to, `${path.parse(first).name}.zip`);
    if (path.extname(to).toLowerCase() !== '.zip') to += '.zip';
    if (!args.to) to = freeName(to);
    const base = path.dirname(first);
    if (from.some((f) => path.dirname(f) !== base)) throw new Error('Zip things from one folder at a time.');
    const entries = collect(from, base, { skip: (p) => isSensitive(cfg, p) });
    const secrets = from.reduce((n, f) => n + (isDir(f) ? secretsInside(cfg, f).length : 0), 0);
    const bytes = entries.reduce((t, e) => t + (e.size || 0), 0);
    row({ op: 'zip', from: from.length === 1 ? first : `${from.length} items in ${base}`, to, sources: from, note: `${entries.filter((e) => !e.dir).length} files, ${mb(bytes)}${secrets ? `; ${secrets} file${secrets === 1 ? '' : 's'} with keys or passwords left out` : ''}`, blocked: target(to) });
    return { action, label: `Zip ${from.length === 1 ? path.basename(first) : `${from.length} items`} into ${path.basename(to)}`, rows };
  }

  if (action === 'unzip') {
    const zipFile = guardPath(cfg, args.path || listArg(args.paths)[0], { what: 'That zip' });
    let to = args.to ? guardPath(cfg, args.to, { mustExist: false }) : freeName(path.join(path.dirname(zipFile), path.parse(zipFile).name));
    if (args.to && isDir(to)) to = freeName(path.join(to, path.parse(zipFile).name));
    const { entries, total } = readZipList(zipFile); // throws for unsafe or oversized zips
    row({ op: 'unzip', from: zipFile, to, note: `${entries.filter((e) => !e.dir).length} files, ${mb(total)} unpacked, into a new folder`, blocked: target(to) });
    return { action, label: `Unzip ${path.basename(zipFile)} into ${to}`, rows };
  }

  // delete for good: only when the user switched off the "Recycle Bin only" hard limit.
  if (action === 'delete') {
    if (limitOn(cfg, 'recycleOnly')) throw new Error('Deleting for good is off ("Recycle Bin only" is on in Settings, Hands). Use recycle instead: it goes to the Recycle Bin.');
    const from = listArg(args.paths);
    if (!from.length) throw new Error('Which files? Give their full paths.');
    for (const f of from) {
      const src = guardPath(cfg, f);
      if (handsRoots(cfg).some((r) => path.resolve(r) === src)) { row({ op: 'delete', from: src, to: 'Gone for good', blocked: 'That is one of your ticked folders itself; I only delete things inside it.' }); continue; }
      row({ op: 'delete', from: src, to: 'Gone for good', note: `${isDir(src) ? 'folder' : mb(sizeOf(src))}, can't be undone`, blocked: secretNote(src) });
    }
    return { action, label: `Delete ${from.length} item${from.length === 1 ? '' : 's'} for good (no Recycle Bin, no undo)`, rows };
  }

  // recycle
  const from = listArg(args.paths);
  if (!from.length) throw new Error('Which files? Give their full paths.');
  for (const f of from) {
    const src = guardPath(cfg, f);
    if (handsRoots(cfg).some((r) => path.resolve(r) === src)) { row({ op: 'recycle', from: src, to: 'Recycle Bin', blocked: 'That is one of your ticked folders itself; I only throw away things inside it.' }); continue; }
    row({ op: 'recycle', from: src, to: 'Recycle Bin', note: isDir(src) ? 'folder' : mb(sizeOf(src)), blocked: secretNote(src) });
  }
  return { action, label: `Put ${from.length} item${from.length === 1 ? '' : 's'} in the Recycle Bin`, rows };
}

const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

// What the approval card shows: the label and the rows (only what the user needs).
export function planCard(plan) {
  const ok = plan.rows.filter((r) => !r.blocked).length;
  return {
    text: `${plan.label}${plan.rows.length > 1 ? ` (${ok} of ${plan.rows.length} can go)` : ''}. ${plan.action === 'delete' ? 'This skips the Recycle Bin and can\'t be undone.' : 'Nothing is overwritten, and you can undo it.'}`,
    plan: plan.rows.map(({ id, op, from, to, note, blocked }) => ({ id, op, from, to, note, blocked }))
  };
}

// ---- Doing it ----
function moveOne(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.renameSync(from, to); }
  catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    fs.rmSync(from, { recursive: true, force: true }); // a move to another drive: the copy is there, so the original goes
  }
}

// Does the ticked rows of a plan. picked: row ids (all unblocked rows when null). Re-checks every row first,
// since things can change while the card waits. Returns { job, done, failed }.
export function applyFiles(cfg, plan, picked = null) {
  const want = picked ? new Set([].concat(picked).map(String)) : null;
  const job = { id: crypto.randomUUID().slice(0, 8), at: Date.now(), label: plan.label, steps: [], undone: false };
  const done = [], failed = [];
  const made = new Set();
  const mkdirs = (dir) => {
    let d = dir;
    const fresh = [];
    while (!fs.existsSync(d)) { fresh.unshift(d); d = path.dirname(d); }
    for (const x of fresh) { fs.mkdirSync(x); if (!made.has(x)) { made.add(x); job.steps.push({ op: 'mkdir', path: x }); } }
  };
  for (const r of plan.rows) {
    if (r.blocked || (want && !want.has(r.id))) continue;
    try {
      if (r.op === 'zip') {
        guardPath(cfg, r.to, { mustExist: false });
        if (fs.existsSync(r.to)) throw new Error('Something with that name is there now.');
        const srcs = (r.sources || [r.from]).map((s) => guardPath(cfg, s));
        mkdirs(path.dirname(r.to));
        writeZip(r.to, collect(srcs, path.dirname(srcs[0]), { skip: (p) => isSensitive(cfg, p) }));
        job.steps.push({ op: 'create', path: r.to });
      } else if (r.op === 'unzip') {
        guardPath(cfg, r.from); guardPath(cfg, r.to, { mustExist: false });
        mkdirs(path.dirname(r.to));
        unzip(r.from, r.to);
        job.steps.push({ op: 'create', path: r.to });
      } else if (r.op === 'delete') {
        if (limitOn(cfg, 'recycleOnly')) throw new Error('"Recycle Bin only" is on again, so nothing was deleted.');
        const src = guardPath(cfg, r.from);
        if (isDir(src) && secretsInside(cfg, src).length) throw new Error('That folder now holds secret files.');
        fs.rmSync(src, { recursive: true, force: false });
        job.steps.push({ op: 'deleted', from: src });
      } else if (r.op === 'recycle') {
        const src = guardPath(cfg, r.from);
        if (isDir(src) && secretsInside(cfg, src).length) throw new Error('That folder now holds secret files.');
        const res = recycle(cfg, [src], { roots: handsRoots(cfg) });
        if (!res.gone.length) throw new Error("Couldn't put it in the Recycle Bin.");
        job.steps.push({ op: 'recycle', from: src, trashedTo: res.trashed?.[src] || '' });
      } else {
        const src = guardPath(cfg, r.from);
        guardPath(cfg, r.to, { mustExist: false });
        const caseOnly = r.to.toLowerCase() === src.toLowerCase() && r.to !== src;
        if (fs.existsSync(r.to) && !caseOnly) throw new Error('Something with that name is there now.');
        if (isDir(src) && secretsInside(cfg, src).length) throw new Error('That folder now holds secret files.');
        mkdirs(path.dirname(r.to));
        if (r.op === 'copy') {
          fs.cpSync(src, r.to, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
          job.steps.push({ op: 'create', path: r.to });
        } else {
          if (caseOnly) { const mid = freeName(src + '.renaming'); fs.renameSync(src, mid); fs.renameSync(mid, r.to); } else moveOne(src, r.to);
          job.steps.push({ op: 'move', from: src, to: r.to });
        }
      }
      done.push(r);
    } catch (e) { failed.push({ ...r, why: e.message }); }
  }
  // Sort and rename (plan.prune): folders a move left empty are removed, up to (not including) the sorted folder.
  // Undo puts them back first. Folders holding anything at all (even hidden files) stay.
  if (plan.prune?.length && done.length) {
    const tops = plan.prune.map((r) => path.resolve(r));
    const dirs = [...new Set(done.map((r) => path.dirname(r.from)))].sort((a, b) => b.length - a.length);
    const gone = new Set();
    for (let d of dirs) {
      while (tops.some((t) => isInside(t, d) && t !== path.resolve(d)) && !gone.has(d)) {
        try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch { break; }
        gone.add(d);
        job.steps.push({ op: 'rmdir', path: d });
        d = path.dirname(d);
      }
    }
  }
  if (job.steps.length) saveJob(cfg, job);
  return { job: job.steps.length ? job : null, done, failed };
}

// ---- The journal and Undo ----
const journalFile = (cfg) => path.join(cfg.dataDir, 'hands-journal.json');
export function loadJournal(cfg) {
  try { const j = JSON.parse(fs.readFileSync(journalFile(cfg), 'utf8')); return Array.isArray(j) ? j : []; } catch { return []; }
}
function saveJournal(cfg, list) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  fs.writeFileSync(journalFile(cfg), JSON.stringify(list.slice(-50), null, 1));
}
function saveJob(cfg, job) { saveJournal(cfg, [...loadJournal(cfg), job]); }

// Undoes one job (the newest one not yet undone when id is empty), last step first.
// Moves go back, things Bob made go to the Recycle Bin, and things he threw away come back when they can
// (from inn\bob\trash; from the Windows Recycle Bin the user restores them, and Bob says which).
export function undoJob(cfg, id) {
  const list = loadJournal(cfg);
  const job = id ? list.find((j) => j.id === id) : [...list].reverse().find((j) => !j.undone);
  if (!job) throw new Error(id ? 'No file job with that id.' : 'There is nothing to undo.');
  if (job.undone) throw new Error('That job was already undone.');
  const done = [], failed = [], manual = [];
  const roots = handsRoots(cfg);
  for (const s of [...job.steps].reverse()) {
    try {
      if (s.op === 'move') {
        if (!fs.existsSync(s.to)) throw new Error(`${s.to} isn't there any more.`);
        const caseOnly = s.to.toLowerCase() === s.from.toLowerCase();
        if (fs.existsSync(s.from) && !caseOnly) throw new Error(`Something is at ${s.from} again.`);
        if (caseOnly) { const mid = freeName(s.to + '.renaming'); fs.renameSync(s.to, mid); fs.renameSync(mid, s.from); } else moveOne(s.to, s.from);
        done.push(`Moved back: ${s.from}`);
      } else if (s.op === 'create') {
        if (!fs.existsSync(s.path)) { done.push(`Already gone: ${s.path}`); continue; }
        const r = recycle(cfg, [s.path], { roots: roots.length ? roots : [path.dirname(s.path)] });
        if (!r.gone.length) throw new Error(`Couldn't put ${s.path} in the Recycle Bin.`);
        done.push(`To the Recycle Bin: ${s.path}`);
      } else if (s.op === 'rmdir') {
        fs.mkdirSync(s.path, { recursive: true });
      } else if (s.op === 'mkdir') {
        try { fs.rmdirSync(s.path); done.push(`Removed the empty folder ${s.path}`); } catch { /* not empty any more: leave it */ }
      } else if (s.op === 'recycle') {
        if (s.trashedTo && fs.existsSync(s.trashedTo) && !fs.existsSync(s.from)) { moveOne(s.trashedTo, s.from); forgetTrashInfo(s.trashedTo); done.push(`Put back: ${s.from}`); }
        else manual.push(s.from);
      } else if (s.op === 'deleted') {
        failed.push(`${s.from} was deleted for good, so it can't come back.`);
      }
    } catch (e) { failed.push(e.message); }
  }
  job.undone = true;
  job.undoneAt = Date.now();
  saveJournal(cfg, list);
  return { job, done, failed, manual };
}
