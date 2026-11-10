// 1.5.135: brains of your own. A GGUF file already on this replicant matrix (made by hand, downloaded elsewhere, or a
// model Bob's list doesn't have) joins Bob's model list under "Your own brains": it gets an Active switch, sits in the
// Equip Bob slots and the brain menus like any other, and runs on Bob's built-in engine (llama.cpp) from where it is. Bob
// never moves, copies or deletes the file; "Remove" only takes it off his list. Marked with an explicit `own: true`
// on the entry, never guessed from a name. Settings: cfg.ownModels = [{ id, name, gguf, mmproj }].
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { isDiffusion } from './llama-tools.js'; // diffusion brains don't chat
import { ggufInfo } from './gguf.js';

export const OWN_FAMILY = 'Your own';
const MAX = 40;

// 1.5.140: a brain card. A small JSON file beside a GGUF, named like it but ending .bob.json (28Bob.gguf ->
// 28Bob.bob.json), that says what the brain is for: Bob's own workshop writes one for every brain it makes, and anyone
// can write one by hand. With a card that matches the file (its name and exact size), the brain files under the card's
// jobs and family, takes its name, picture reader and size, and shows its benchmark; without one, or with one that
// doesn't match, Bob only knows what the file says (as before). The card is read, never trusted for more: it can't
// point outside the GGUF's folder, and a card never makes a brain Bob's recommendation.
export const CARD_JOBS = ['bob', 'small', 'deep', 'tinker', 'reviewer', 'office', 'eyes', 'ledger', 'scout', 'painter'];
export const cardPathOf = (gguf) => String(gguf || '').replace(/\.gguf$/i, '.bob.json');
const num = (x, max) => (Number.isFinite(Number(x)) && Number(x) > 0 && Number(x) <= max ? Math.round(Number(x) * 10) / 10 : null);
const txt = (s, n) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f<>{}`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const scoresOf = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).slice(0, 8).map(([k, v]) => [txt(k, 24), num(v, 100000)]).filter(([k, v]) => k && v != null));
export function cleanCard(j, gguf, size) {
  if (!j || typeof j !== 'object' || j.card !== 1) return null;
  if (String(j.file || '').toLowerCase() !== path.basename(String(gguf || '')).toLowerCase()) return null;
  if (!(Number.isInteger(j.bytes) && j.bytes === size)) return null;
  const dir = path.dirname(gguf);
  const mmName = typeof j.mmproj === 'string' && /^[\w .()+-]+\.gguf$/i.test(j.mmproj) && path.basename(j.mmproj) === j.mmproj ? j.mmproj : '';
  const b = j.benchmark && typeof j.benchmark === 'object' ? j.benchmark : null;
  const out = {
    name: cleanName(j.name), nickname: txt(j.nickname, 30), family: txt(j.family, 30), madeByBob: j.madeByBob === true,
    jobs: [...new Set([].concat(j.jobs || []).filter((x) => CARD_JOBS.includes(x)))],
    mmproj: mmName ? path.join(dir, mmName) : '',
    params: num(j.params, 5000), activeParams: num(j.activeParams, 5000), vramGB: num(j.vramGB, 4096), ctx: num(j.ctx, 1e8),
    cutFrom: j.cutFrom && typeof j.cutFrom === 'object' ? { name: txt(j.cutFrom.name, 60), by: txt(j.cutFrom.by, 40), hf: /^[\w.-]+\/[\w.-]+$/.test(j.cutFrom.hf || '') ? j.cutFrom.hf : '' } : null,
    expertsKept: txt(j.expertsKept, 40), published: /^\d{4}-\d{2}-\d{2}$/.test(j.published || '') ? j.published : '',
    license: txt(j.license, 80), what: txt(j.what, 300)
  };
  if (b) {
    const s = scoresOf(b.scores);
    if (Object.keys(s).length) out.benchmark = { date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : '', report: /^https:\/\/[^\s"<>]+$/.test(b.report || '') ? b.report.slice(0, 300) : '', scores: s, ...(b.baseline && typeof b.baseline === 'object' ? { baseline: { name: txt(b.baseline.name, 60), scores: scoresOf(b.baseline.scores) } } : {}) };
  }
  return out;
}
export function readCard(gguf, { read = fs.readFileSync, stat = fs.statSync } = {}) {
  try {
    const size = stat(gguf).size;
    const t = String(read(cardPathOf(gguf), 'utf8'));
    if (t.length > 65536) return null;
    return cleanCard(JSON.parse(t), gguf, size);
  } catch { return null; }
}
// The benchmark as one line for the tip: "Benchmarked November 8, 2026: Coding 81.2% (Qwen3.6 35B-A3B: 84%), Tools 93%."
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = (d) => (d ? ` ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}` : '');
export function benchLine(b) {
  if (!b?.scores) return '';
  const base = b.baseline?.scores || {};
  const parts = Object.entries(b.scores).map(([k, v]) => `${k} ${v}%${base[k] != null ? ` (${b.baseline.name || 'the brain it was cut from'}: ${base[k]}%)` : ''}`);
  return `Benchmarked${day(b.date)}: ${parts.join(', ')}.`; // the report is a "Full report" link on the row
}

const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>{}"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const cleanPath = (p) => { const s = String(p || '').replace(/[\u0000-\u001f]/g, '').trim(); return s && path.isAbsolute(s) && /\.gguf$/i.test(s) ? s : ''; };

// The saved list, tidied: absolute .gguf paths only, an id of the form own-<letters>, no doubles.
export function cleanOwnModels(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(), out = [];
  for (const o of list.slice(0, MAX)) {
    const gguf = cleanPath(o?.gguf);
    const id = /^own-[a-z0-9][a-z0-9-]{0,40}$/.test(String(o?.id || '')) ? o.id : '';
    if (!gguf || !id || seen.has(id) || seen.has(gguf.toLowerCase())) continue;
    seen.add(id); seen.add(gguf.toLowerCase());
    const mmproj = cleanPath(o?.mmproj);
    out.push({ id, name: cleanName(o?.name) || path.basename(gguf, path.extname(gguf)), gguf, ...(mmproj ? { mmproj } : {}) });
  }
  return out;
}
export const ownModels = (cfg) => cleanOwnModels(cfg?.ownModels);

// An id from the name: "own-my-qwen-remix". Unique against the list.
export function ownId(name, list = []) {
  const base = `own-${String(name || 'brain').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'brain'}`;
  let id = base, n = 2;
  while (list.some((o) => o.id === id)) id = `${base}-${n++}`;
  return id;
}

// How big a brain is, from its GGUF header or its file name ("Qwen3.6-35B-A3B" -> 35, "9B" -> 9). null when unknown.
export function paramsOf(info, file) {
  const label = [info?.name, path.basename(file || '')].filter(Boolean).join(' ');
  const m = label.toLowerCase().match(/(?:^|[^a-z0-9])e?(\d+(?:\.\d+)?)b(?![a-z0-9])/);
  return m ? Number(m[1]) : null;
}

// What the file says about itself, for the Add form (name, size, how big) and the catalogue tip.
export function inspectOwn(file, { stat = fs.statSync, info = ggufInfo, read = fs.readFileSync } = {}) {
  const p = cleanPath(file);
  if (!p) return { error: 'That isn\'t a .gguf file.' };
  let st;
  try { st = stat(p); } catch { return { error: 'Bob can\'t find that file.' }; }
  if (!st.isFile()) return { error: 'That isn\'t a file.' };
  const i = info(p);
  if (!i) return { error: 'That file isn\'t a GGUF brain Bob can read (it may be damaged, or not a model).' };
  const params = paramsOf(i, p);
  const card = readCard(p, { read, stat }); // 1.5.140
  const mm = card?.mmproj && (() => { try { return stat(card.mmproj).isFile(); } catch { return false; } })() ? card.mmproj : '';
  return { file: p, name: card?.name || cleanName(i.name) || path.basename(p, path.extname(p)), arch: i.arch || '', params: card?.params || params, sizeGB: Math.round((st.size / 1e9) * 10) / 10, ctxTrain: i.ctxTrain || null,
    ...(card ? { card: { family: card.family, jobs: card.jobs, madeByBob: card.madeByBob, benchmarked: card.benchmark?.date || (card.benchmark ? 'yes' : '') }, ...(mm ? { mmproj: mm } : {}) } : {}) };
}

// The jobs Bob offers it for, from its size and whether it has a picture reader. Honest and plain: a small brain is a
// Quick brain, a big one can think deeply; without a picture reader it never goes under Seeing pictures.
export function jobsFor(params, vision) {
  const jobs = ['bob', 'office', 'ledger', 'scout', 'painter'];
  if (params == null || params <= 8) jobs.push('small');
  if (params == null || params >= 12) jobs.push('deep', 'reviewer');
  if (params == null || params >= 7) jobs.push('tinker');
  if (vision) jobs.push('eyes');
  return jobs;
}

// The catalogue-shaped entry Bob's lists use (public/catalogue.js, equip.js, fit.js). `own: true` is the marker.
export function ownEntry(o, { stat = fs.statSync, info = ggufInfo, read = fs.readFileSync } = {}) {
  let size = 0, here = false, i = null;
  try { const st = stat(o.gguf); here = st.isFile(); size = st.size; } catch {}
  if (here) { try { i = info(o.gguf); } catch {} }
  const card = here ? readCard(o.gguf, { read, stat }) : null; // 1.5.140: a brain card beside the file
  const params = card?.params || paramsOf(i, o.gguf);
  const sizeGB = Math.round((size / 1e9) * 10) / 10;
  const vision = Boolean(o.mmproj);
  const where = `From your own file: ${path.basename(o.gguf)}${vision ? `, with the picture reader ${path.basename(o.mmproj)}` : ''}.`;
  const cardJobs = card?.jobs?.filter((j) => j !== 'eyes' || vision) || [];
  const cut = card?.cutFrom?.name ? `Cut from ${card.cutFrom.by ? `${card.cutFrom.by}'s ` : ''}${card.cutFrom.name}${card.expertsKept ? `, keeping ${card.expertsKept} experts` : ''}.` : '';
  const diffusionBrain = isDiffusion(i?.arch); // Dream, LLaDA and friends: only the Lab's Playground runs them
  const what = diffusionBrain ? `${where} A diffusion brain (${i.arch}): it writes a whole block at once, which Bob's chat can't run. Try it in the Lab's Playground, Diffusion brains.`
    : card
    ? [card.what, cut, `${where} Its brain card says what it's for.`].filter(Boolean).join(' ')
    : `${where} Bob only knows what the file says: ${params ? `about ${params}B` : 'size unknown'}${i?.arch ? `, ${i.arch}` : ''}${i?.ctxTrain ? `, made for up to ${Math.round(i.ctxTrain / 1024)}K` : ''}. How well it does its jobs is for you to judge.`;
  return {
    id: o.id, name: o.name, family: card?.family || OWN_FAMILY, category: 'chat', own: true, jobs: diffusionBrain ? [] : cardJobs.length ? cardJobs : jobsFor(params, vision), ...(diffusionBrain ? { diffusion: true } : {}),
    what, sizeGB, vramGB: card?.vramGB || (sizeGB ? Math.max(2, Math.ceil(sizeGB * 1.15)) : null), ...(params ? { params } : {}),
    ...(card ? { card: true, ...(card.madeByBob ? { madeByBob: true } : {}), ...(card.published ? { published: card.published } : {}), ...(card.benchmark ? { bench: benchLine(card.benchmark), ...(card.benchmark.report ? { benchReport: card.benchmark.report } : {}) } : {}) } : {}),
    license: card?.license || 'As its maker says', pick: 'optional', trial: true, trialNote: card ? 'Your own file; you pick it yourself, Bob never recommends it over the ones he knows.' : 'Your own file; Bob never recommends it over the ones he knows.',
    files: [], ownFile: o.gguf, ...(o.mmproj ? { ownMmproj: o.mmproj } : {}),
    status: here ? { state: 'installed', where: ['your file'], located: { gguf: o.gguf, ...(o.mmproj ? { mmproj: o.mmproj } : {}) }, canDownload: false }
      : { state: 'missing', where: [], located: {}, canDownload: false, gone: true }
  };
}
export const ownEntries = (cfg, deps) => ownModels(cfg).map((o) => ownEntry(o, deps));

// The engine's view of one: { gguf, mmproj } for cfg.llamacpp.models when it's equipped.
export const ownResolve = (o) => (o.mmproj ? { gguf: o.gguf, mmproj: o.mmproj } : o.gguf);

// "Pick a file" window for a .gguf (the brain) or its picture reader. Windows: PowerShell's OpenFileDialog on top of
// Bob's window. Mac: AppleScript's choose file. Linux: zenity, else kdialog. Returns the path, or '' if cancelled.
// 1.5.177: the owner window is shown (tiny, off screen) and brought to the front first, so Windows puts the picker on
// top. A never-shown owner let it open behind Bob's window, or not show at all.
export const PS_OWNER = ['Add-Type -AssemblyName System.Drawing',
  "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; StartPosition = 'Manual'; Location = New-Object System.Drawing.Point(-32000, -32000); Size = New-Object System.Drawing.Size(1, 1) }",
  '$owner.Show()', '$owner.Activate()'];
const TITLE = { gguf: 'Pick the brain file (.gguf)', mmproj: 'Pick its picture reader (mmproj .gguf), or Cancel for none', docs: 'Pick a document or chat log for the lesson builder' };
// 1.5.152: kind 'docs' (the Lab's lesson builder) shows every file, not only brains.
export function pickFileArgs(kind, platform) {
  const title = TITLE[kind] || TITLE.gguf;
  const any = kind === 'docs';
  if (platform === 'win32') return ['powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8', 'Add-Type -AssemblyName System.Windows.Forms',
    ...PS_OWNER,
    '$d = New-Object System.Windows.Forms.OpenFileDialog', `$d.Title = '${title}'`, any ? "$d.Filter = 'Documents and chat logs|*.txt;*.md;*.docx;*.doc;*.odt;*.rtf;*.pdf;*.epub;*.html;*.htm;*.json;*.jsonl|All files (*.*)|*.*'" : "$d.Filter = 'Brain files (*.gguf)|*.gguf'", '$d.Multiselect = $false',
    "if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.FileName) }", '$owner.Dispose()'].join('; ')]];
  if (platform === 'darwin') return ['/usr/bin/osascript', ['-e', `POSIX path of (choose file with prompt "${title}")`]];
  return [['zenity', ['--file-selection', '--title', title, ...(any ? [] : ['--file-filter=Brain files (*.gguf) | *.gguf *.GGUF'])]], ['kdialog', ['--getopenfilename', '.', any ? '*|All files' : '*.gguf|Brain files', '--title', title]]];
}
// 1.5.177: in Bob's own window (Bob.exe), Electron's picker, on top of his window (globalThis.bobPick, lent by
// electron/main.cjs). The helpers below are only for Bob running without his window (a browser on this replicant matrix).
export const PICK_FILTERS = { gguf: [{ name: 'Brain files', extensions: ['gguf'] }], mmproj: [{ name: 'Brain files', extensions: ['gguf'] }], docs: [{ name: 'Documents and chat logs', extensions: ['txt', 'md', 'docx', 'doc', 'odt', 'rtf', 'pdf', 'epub', 'html', 'htm', 'json', 'jsonl'] }, { name: 'All files', extensions: ['*'] }] };
export function pickFile({ kind = 'gguf', run = execFile, platform = process.platform, pick = globalThis.bobPick } = {}) {
  if (typeof pick === 'function') return Promise.resolve(pick({ title: TITLE[kind] || TITLE.gguf, filters: PICK_FILTERS[kind] || PICK_FILTERS.gguf })).then((f) => String(f || ''));
  const args = pickFileArgs(kind, platform);
  if (platform === 'linux') {
    return new Promise((resolve, reject) => {
      const next = (i) => {
        if (i >= args.length) return reject(new Error('No file picker (zenity or kdialog) on this replicant matrix. Type the file\'s path instead.'));
        run(args[i][0], args[i][1], { timeout: 10 * 60e3 }, (err, out) => { if (err && err.code === 'ENOENT') return next(i + 1); resolve(err ? '' : String(out || '').trim()); });
      };
      next(0);
    });
  }
  if (platform !== 'win32' && platform !== 'darwin') return Promise.reject(new Error('Picking a file this way only works on Windows, Mac and Linux. Type the file\'s path instead.'));
  return new Promise((resolve, reject) => {
    run(args[0], args[1], { timeout: 10 * 60e3, windowsHide: true }, (err, out, stderr) => {
      if (platform === 'darwin' && err && /-128/.test(String(stderr || err.message))) return resolve('');
      if (err && !String(out || '').trim()) return reject(new Error(`${platform === 'darwin' ? 'The Mac\'s' : 'Windows\''} file picker didn't open. Type the file's path instead.`));
      resolve(String(out || '').trim().replace(/\/$/, ''));
    });
  });
}
