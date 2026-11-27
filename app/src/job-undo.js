// Settings, Jobs, "Undo the whole coding job" (off by default; Nov 27). Before the first change a job makes in a code
// project (write_file, edit_file or run_command in it), Bob keeps a copy of the whole project folder: every file's
// contents, except dependency and build folders (SKIP_DIRS). When he answers, he compares the folder with that copy
// and a card under the answer says what the job changed, with one button that puts all of it back. Unlike the receipt's
// Undo (one file at a time) and the … menu's Undo changes (files saved by his own tools), this also catches what
// commands changed: a formatter, a code generator, a script that rewrote files.
// Undo puts back only files that still hold what the job left: anything changed since is left as it is and named.
// A file the job made goes to Bob's backups folder (backups\undone), never deleted for good. Copies go after a week.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'target', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.next', '.nuxt', '.cache', 'coverage', '.gradle', '.idea', '.vs', 'obj', 'Binaries', 'Intermediate', 'DerivedDataCache', 'Saved']);
export const MAX_FILE = 5 * 1024 * 1024;   // a bigger file is noted, not copied (Undo leaves it as it is)
export const MAX_COPY = 300 * 1024 * 1024; // the copy of one project stops growing here
export const MAX_FILES = 20000;
export const KEEP_MS = 7 * 864e5;
const MARKERS = ['.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py', 'requirements.txt', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'CMakeLists.txt', 'Makefile', 'composer.json', 'Gemfile', 'pubspec.yaml', 'deno.json'];
const CHANGERS = new Set(['write_file', 'edit_file', 'run_command']);
const dirOf = (cfg) => path.join(cfg.dataDir, 'job-undo');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const ownJob = (job) => !job?.guest;
export const jobUndoOn = (cfg) => cfg?.jobHelps?.jobUndo === true;

// The code project a folder sits in: the top of its repository (.git) if there is one within 8 folders up, otherwise
// the nearest folder with a project file. Never a drive's top or the home folder itself.
export function projectRoot(dir, { exists = fs.existsSync, home = os.homedir() } = {}) {
  if (!dir) return null;
  let d = path.resolve(String(dir)), near = null, top = null;
  for (let i = 0; i < 8; i++) {
    const has = MARKERS.filter((m) => exists(path.join(d, m)));
    if (has.includes('.git')) { top = d; break; }
    if (has.length && !near) near = d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  const root = top || near;
  if (!root || path.parse(root).root === root || path.resolve(home) === root) return null;
  return root;
}
const folderFor = (name, args) => {
  if (name === 'run_command') { const c = String(args?.cwd || ''); return c && path.isAbsolute(c) ? c : ''; }
  const p = String(args?.path || '');
  return p && path.isAbsolute(p) ? path.dirname(p) : '';
};

// Every file under root (dependency and build folders left out): rel path -> { size, mtimeMs }.
export function walk(root, { maxFiles = MAX_FILES } = {}) {
  const files = new Map(); let partial = false;
  const go = (dir, rel) => {
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (files.size >= maxFiles) { partial = true; return; }
      const r = rel ? `${rel}/${e.name}` : e.name, full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) go(full, r); continue; }
      if (!e.isFile()) continue; // links and the like are left alone
      try { const st = fs.statSync(full); files.set(r, { size: st.size, mtimeMs: st.mtimeMs }); } catch {}
    }
  };
  go(root, '');
  return { files, partial };
}
const fileHash = (full, size) => { if (size > MAX_FILE) return null; try { return hash(fs.readFileSync(full)); } catch { return null; } };

// Keep the copy. Returns the checkpoint's id.
export function takeCheckpoint(cfg, root, meta = {}, { now = Date.now } = {}) {
  const id = `${now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const dir = path.join(dirOf(cfg), id), blobs = path.join(dir, 'blobs');
  fs.mkdirSync(blobs, { recursive: true });
  const { files, partial } = walk(root);
  const man = { id, root, at: now(), ...meta, partial, files: {}, big: [] };
  let bytes = 0;
  for (const [rel, st] of files) {
    if (st.size > MAX_FILE || bytes + st.size > MAX_COPY) { man.big.push(rel); man.files[rel] = { size: st.size, mtimeMs: st.mtimeMs, h: null }; if (st.size <= MAX_FILE) man.partial = true; continue; }
    let b; try { b = fs.readFileSync(path.join(root, rel)); } catch { continue; }
    const h = hash(b);
    const to = path.join(blobs, h);
    if (!fs.existsSync(to)) { fs.writeFileSync(to, b); bytes += b.length; }
    man.files[rel] = { size: st.size, mtimeMs: st.mtimeMs, h };
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(man));
  return id;
}
const readMan = (cfg, id) => {
  if (!/^[\w-]{6,40}$/.test(String(id || ''))) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dirOf(cfg), id, 'manifest.json'), 'utf8')); } catch { return null; }
};
const saveMan = (cfg, man) => fs.writeFileSync(path.join(dirOf(cfg), man.id, 'manifest.json'), JSON.stringify(man));

// What changed since the copy: [{ rel, kind: 'changed'|'created'|'deleted', after }] (after = what it holds now).
export function changesSince(man) {
  const out = [];
  const { files } = walk(man.root);
  for (const [rel, st] of files) {
    const was = man.files[rel];
    if (!was) { out.push({ rel, kind: 'created', after: fileHash(path.join(man.root, rel), st.size) }); continue; }
    if (was.h === null) continue; // too big to keep: not compared, never put back
    if (was.size === st.size && was.mtimeMs === st.mtimeMs) continue;
    const now = fileHash(path.join(man.root, rel), st.size);
    if (now !== was.h) out.push({ rel, kind: 'changed', after: now });
  }
  for (const rel of Object.keys(man.files)) if (!files.has(rel) && man.files[rel].h !== null) out.push({ rel, kind: 'deleted', after: null });
  return out;
}

// Before a tool runs in a job: the first change in a project keeps its copy.
export function jobUndoBefore(brain, name, args, ctx) {
  if (!ctx || !jobUndoOn(brain.cfg) || !ownJob(ctx.job) || !CHANGERS.has(name)) return null;
  const root = projectRoot(folderFor(name, args));
  if (!root) return null;
  const cps = (ctx.checkpoints ||= new Map());
  if (cps.has(root)) return cps.get(root);
  try {
    const id = takeCheckpoint(brain.cfg, root, { sessionId: ctx.sessionId || '', askId: ctx.askId || '', jobId: ctx.job?.id || '' });
    cps.set(root, id);
    brain.log?.('jobs', `kept a copy of ${root} before the job's first change there (Undo the whole coding job)`);
    return id;
  } catch (e) { cps.set(root, null); brain.log?.('warn', `couldn't keep a copy of ${root} for Undo: ${e.message}`); return null; }
}

// When he answers: a card for each project the job changed. A copy with no changes is dropped.
export function jobUndoFinish(brain, ctx) {
  if (!ctx?.checkpoints?.size) return [];
  const cards = [];
  for (const [root, id] of ctx.checkpoints) {
    if (!id) continue;
    const man = readMan(brain.cfg, id);
    if (!man) continue;
    let ch = [];
    try { ch = changesSince(man); } catch {}
    if (!ch.length) { fs.rmSync(path.join(dirOf(brain.cfg), id), { recursive: true, force: true }); continue; }
    man.changes = ch; man.doneAt = Date.now();
    try { saveMan(brain.cfg, man); } catch { continue; }
    const n = (k) => ch.filter((c) => c.kind === k).length;
    const card = { type: 'job-undo', id, root, changed: n('changed'), created: n('created'), deleted: n('deleted'), files: ch.slice(0, 12).map((c) => `${c.kind === 'created' ? 'new' : c.kind === 'deleted' ? 'deleted' : 'changed'}: ${c.rel}`), partial: Boolean(man.partial) };
    ctx.emit?.(card);
    cards.push(card);
    brain.log?.('jobs', `the job changed ${ch.length} file${ch.length === 1 ? '' : 's'} in ${root}; Undo the whole job is under the answer`);
  }
  ctx.checkpoints.clear();
  return cards;
}

// The owner's click: put the project back the way it was before the job. { restored, moved, skipped: [{ rel, why }] }.
export function undoCodingJob(cfg, id, { now = Date.now } = {}) {
  const man = readMan(cfg, id);
  if (!man?.changes) throw new Error('That job is too old to undo, or it was already undone.');
  const blobs = path.join(dirOf(cfg), man.id, 'blobs');
  const restored = [], moved = [], skipped = [];
  const undone = path.join(cfg.dataDir, 'backups', 'undone', `${now()}-${path.basename(man.root)}`);
  for (const c of man.changes) {
    const full = path.join(man.root, ...c.rel.split('/'));
    let cur = null;
    try { cur = fs.statSync(full).isFile() ? fileHash(full, fs.statSync(full).size) : null; } catch {}
    const there = fs.existsSync(full);
    if (c.kind === 'deleted' ? there : cur !== c.after || !there) { skipped.push({ rel: c.rel, why: 'changed since' }); continue; }
    try {
      if (c.kind === 'created') {
        const to = path.join(undone, ...c.rel.split('/'));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        try { fs.renameSync(full, to); } catch { fs.copyFileSync(full, to); fs.rmSync(full, { force: true }); }
        moved.push(c.rel);
      } else {
        const h = man.files[c.rel]?.h;
        if (!h || !fs.existsSync(path.join(blobs, h))) { skipped.push({ rel: c.rel, why: 'no copy kept' }); continue; }
        fs.mkdirSync(path.dirname(full), { recursive: true });
        const tmp = `${full}.${process.pid}-undo.bob-tmp`;
        fs.copyFileSync(path.join(blobs, h), tmp);
        try { fs.renameSync(tmp, full); } catch { fs.copyFileSync(tmp, full); fs.rmSync(tmp, { force: true }); }
        restored.push(c.rel);
      }
    } catch (e) { skipped.push({ rel: c.rel, why: String(e.message || e).slice(0, 80) }); }
  }
  fs.rmSync(path.join(dirOf(cfg), man.id), { recursive: true, force: true });
  return { root: man.root, restored, moved, skipped };
}
export function undoCodingLine(r) {
  const n = r.restored.length + r.moved.length;
  const put = n ? `Put ${path.basename(r.root)} back the way it was before the job: ${r.restored.length} file${r.restored.length === 1 ? '' : 's'} restored${r.moved.length ? `, ${r.moved.length} new file${r.moved.length === 1 ? '' : 's'} moved to my backups` : ''}.` : 'Nothing needed putting back.';
  const left = r.skipped.length ? ` Left as ${r.skipped.length === 1 ? 'it is' : 'they are'}: ${r.skipped.slice(0, 4).map((x) => `${x.rel} (${x.why})`).join(', ')}${r.skipped.length > 4 ? '…' : ''}.` : '';
  return put + left;
}

export function pruneJobUndo(cfg, { now = Date.now(), keepMs = KEEP_MS } = {}) {
  let n = 0;
  try { for (const x of fs.readdirSync(dirOf(cfg))) { const d = path.join(dirOf(cfg), x); if (now - fs.statSync(d).mtimeMs > keepMs) { fs.rmSync(d, { recursive: true, force: true }); n++; } } } catch {}
  return n;
}
