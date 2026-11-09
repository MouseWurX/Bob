// The "Office documents and converting" Hand: Bob converts files (documents, spreadsheets, presentations,
// pictures, sound, video), reads Word/Excel/PowerPoint/OpenDocument files, makes new ones and changes them.
// Off until the user turns it on. Every file Bob makes or changes is shown on a card first (one row per file,
// each with its own tick), except a new document in his own Documents folder, which needs no OK (like write_file).
// Nothing is overwritten: a converted or new file gets a free name (report-2.pdf), and a file changed in place is
// copied to Bob's backups first. Only in the folders ticked for Hands (Settings), plus Bob's own Documents folder;
// never secret files, read-only projects, or Bob's own settings. The helpers run only for the job (office.js).
import fs from 'node:fs';
import path from 'node:path';
import { insideAny, appDir } from './config.js';
import { isSensitive, today } from './tools.js';
import { handOn, handOffWhy, readOnlyRoots } from './hands-settings.js';
import { handsRoots } from './hands-files.js';
import { routeFor, extOf, kindName, docKindOf, DOC_KINDS, findOffice, findFfmpeg, officeJob, pictureJob, mediaJob, OFFICE_MISSING, FFMPEG_MISSING } from './office.js';
import { fileSize, freeName } from './util.js';

const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const list = (description) => ({ type: 'array', items: { type: 'string' }, description });

const MAX_FILES = 50;
export const officeDir = (cfg) => path.join(cfg.innDir, 'documents');
const off = (cfg) => { if (!handOn(cfg, 'office')) throw new Error(handOffWhy(cfg, 'office')); };
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const sizeOf = fileSize;

function full(p) {
  if (!p || typeof p !== 'string') throw new Error('A full file path is needed.');
  if (!path.isAbsolute(p) && !/^[a-zA-Z]:[\\/]/.test(p)) throw new Error(`Please give a full path, like C:\\Users\\you\\Documents\\report.docx (got "${p}").`);
  return path.resolve(p);
}

// Where Bob may read from: anywhere he may read files, the Hands folders, and his own Documents folder.
export function canRead(cfg, p) {
  const f = full(p);
  if (isSensitive(cfg, f)) throw new Error('That file holds keys or passwords, so it stays off-limits to me.');
  if (!insideAny([...(cfg.readRoots || []), ...handsRoots(cfg), officeDir(cfg)], f)) throw new Error(`I'm not allowed to open files in ${path.dirname(f)}. You can tick that folder in Settings, Show advanced settings, Hands.`);
  if (!fs.existsSync(f)) throw new Error(`There's no file at ${f}.`);
  if (fs.statSync(f).isDirectory()) throw new Error(`${f} is a folder. Give me a file.`);
  return f;
}

// Where Bob may save: the folders ticked for Hands, and his own Documents folder. Never read-only or his own.
export function canWrite(cfg, p) {
  const f = full(p);
  if (isSensitive(cfg, f)) throw new Error('That file holds keys or passwords, so it stays off-limits to me.');
  if (cfg.settingsFile && path.resolve(cfg.settingsFile) === f) throw new Error("That's my own settings file, which I can't change.");
  if (insideAny([...readOnlyRoots(cfg), appDir, cfg.dataDir].filter(Boolean), f)) throw new Error(`${f} is read-only for me.`);
  const roots = [...handsRoots(cfg), officeDir(cfg)];
  if (!insideAny(roots, f)) throw new Error(`I can only save in: ${roots.join('; ')}. You can tick more folders in Settings, Show advanced settings, Hands.`);
  return f;
}


// Where a converted file goes: the folder asked for, else next to the original if Bob may save there, else his
// Documents folder.
function outFor(cfg, src, to, folder, taken) {
  const name = `${path.parse(src).name}.${to}`;
  let dir = folder ? full(folder) : path.dirname(src);
  if (!folder) { try { canWrite(cfg, path.join(dir, name)); } catch { dir = officeDir(cfg); } }
  return freeName(path.join(dir, name), taken);
}

const helperFor = (r) => (r.route === 'office' ? 'LibreOffice' : r.route === 'media' ? 'FFmpeg' : 'Windows');

// The plan for a conversion: one row per file. Blocked rows say why.
export function planConvert(cfg, args, env = process.env) {
  const paths = [].concat(args.paths || args.path || []).filter(Boolean).map(String);
  if (!paths.length) throw new Error('Which files? Give their full paths.');
  if (paths.length > MAX_FILES) throw new Error(`That's ${paths.length} files; I do up to ${MAX_FILES} at a time.`);
  const to = String(args.to || '').toLowerCase().replace(/^\./, '').trim();
  const office = findOffice(cfg, env), ffmpeg = findFfmpeg(cfg, env);
  const taken = new Set();
  const rows = paths.map((p, i) => {
    const row = { id: String(i + 1), op: 'convert', from: p, to: '', note: '' };
    try {
      row.from = canRead(cfg, p);
      const from = extOf(row.from);
      const r = routeFor(from, to);
      if (r.why) throw new Error(r.why);
      if (r.route === 'office' && !office) throw new Error(OFFICE_MISSING.split('. The user')[0] + '.');
      if ((r.route === 'media' || (r.route === 'picture' && (!['win32', 'darwin'].includes(process.platform) || from === 'webp' || to === 'webp'))) && !ffmpeg) throw new Error(FFMPEG_MISSING.split('. The user')[0] + '.');
      row.to = canWrite(cfg, outFor(cfg, row.from, to, args.folder, taken));
      taken.add(row.to.toLowerCase());
      row.route = r.route;
      row.note = `${kindName(from)} to ${kindName(to)}, with ${helperFor(r)}${args.width ? `, ${Number(args.width)} px wide at most` : ''}${args.start || args.end ? `, from ${args.start || 'the start'} to ${args.end || 'the end'}` : ''}`;
    } catch (e) { row.blocked = e.message; }
    return row;
  });
  const ok = rows.filter((r) => !r.blocked);
  if (!ok.length) throw new Error(rows.length === 1 ? rows[0].blocked : `None of those can be converted: ${rows.map((r) => `${path.basename(r.from)} (${r.blocked})`).join('; ')}`);
  return { rows, to, label: `Convert ${ok.length === 1 ? path.basename(ok[0].from) : `${ok.length} files`} to ${kindName(to)}` };
}

// ---- making and changing documents ----

const KIND_WORDS = { writer: 'text document', calc: 'spreadsheet', impress: 'presentation' };
const DEFAULT_EXT = { writer: 'docx', calc: 'xlsx', impress: 'pptx' };
const OPS = { writer: ['replace', 'append'], calc: ['replace', 'set_cells', 'add_rows', 'add_sheet'], impress: ['replace', 'add_slide', 'delete_slide'] };
const clip = (s, n = 60) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

function cleanSheets(sheets) {
  return [].concat(sheets || []).slice(0, 30).map((s, i) => ({
    name: String(s?.name || `Sheet${i + 1}`).replace(/[[\]*?:/\\]/g, '').slice(0, 31) || `Sheet${i + 1}`,
    rows: [].concat(s?.rows || []).slice(0, 20000).map((r) => (Array.isArray(r) ? r.slice(0, 500) : [r])),
    header: s?.header !== false
  }));
}
function cleanSlides(slides) {
  return [].concat(slides || []).slice(0, 200).map((s) => ({ title: String(s?.title || ''), bullets: [].concat(s?.bullets || []).map(String).slice(0, 40), notes: String(s?.notes || '') }));
}

export function planMake(cfg, args) {
  const kind = String(args.kind || '').toLowerCase();
  if (!KIND_WORDS[kind]) throw new Error('kind must be writer (text document), calc (spreadsheet) or impress (presentation).');
  let out = args.path ? full(args.path) : path.join(officeDir(cfg), `${String(args.name || KIND_WORDS[kind]).replace(/[^\w .-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document'}-${today(cfg)}.${DEFAULT_EXT[kind]}`);
  if (!path.extname(out)) out += '.' + DEFAULT_EXT[kind];
  const ext = extOf(out);
  if (!DOC_KINDS[kind].out.includes(ext)) throw new Error(`A ${KIND_WORDS[kind]} can be saved as: ${DOC_KINDS[kind].out.join(', ')}.`);
  out = canWrite(cfg, freeName(out));
  const job = { op: 'make', kind, out };
  let what;
  if (kind === 'writer') {
    job.text = String(args.text || '');
    if (!job.text.trim()) throw new Error('The document is empty. Give its text (Markdown is fine: # headings, - bullets, | tables |, **bold**).');
    const lines = job.text.split(/\r?\n/);
    what = `${lines.filter((l) => /^#{1,6}\s/.test(l)).length} headings, ${lines.filter((l) => l.trim() && !/^#|^\|/.test(l.trim())).length} lines, ${lines.filter((l) => /^\s*\|/.test(l)).length ? 'tables, ' : ''}${job.text.length} characters`;
  } else if (kind === 'calc') {
    job.sheets = cleanSheets(args.sheets);
    if (!job.sheets.length || !job.sheets.some((s) => s.rows.length)) throw new Error('The spreadsheet is empty. Give sheets: [{ name, rows: [[...], ...] }].');
    what = job.sheets.map((s) => `sheet "${s.name}" ${s.rows.length} rows`).join(', ');
  } else {
    job.slides = cleanSlides(args.slides);
    if (!job.slides.length) throw new Error('The presentation has no slides. Give slides: [{ title, bullets, notes }].');
    what = `${job.slides.length} slide${job.slides.length === 1 ? '' : 's'}: ${job.slides.slice(0, 4).map((s) => `"${clip(s.title, 30)}"`).join(', ')}${job.slides.length > 4 ? '…' : ''}`;
  }
  const mine = insideAny([officeDir(cfg)], out);
  return { job, mine, label: `Make a new ${KIND_WORDS[kind]}`, row: { id: '1', op: 'create', from: '(new)', to: out, note: `${kindName(ext)}: ${what}` } };
}

function sayChange(c) {
  switch (c.op) {
    case 'replace': return `Replace "${clip(c.find, 40)}" with "${clip(c.replace, 40)}" everywhere`;
    case 'append': return `Add at the end: "${clip(String(c.text || '').replace(/\s+/g, ' '), 70)}"`;
    case 'set_cells': { const k = Object.keys(c.cells || {}); return `Set ${k.length} cell${k.length === 1 ? '' : 's'}${c.sheet ? ` on ${c.sheet}` : ''}: ${k.slice(0, 5).map((x) => `${x} = ${clip(c.cells[x], 20)}`).join(', ')}${k.length > 5 ? '…' : ''}`; }
    case 'add_rows': return `Add ${[].concat(c.rows || []).length} row(s) at the bottom${c.sheet ? ` of ${c.sheet}` : ''}`;
    case 'add_sheet': return `Add a sheet "${clip(c.name, 30)}"${c.rows?.length ? ` with ${c.rows.length} rows` : ''}`;
    case 'add_slide': return `Add a slide "${clip(c.title, 40)}"${c.at ? ` as slide ${c.at}` : ' at the end'}`;
    case 'delete_slide': return `Remove slide ${c.number}`;
    default: return c.op;
  }
}

export function planEdit(cfg, args) {
  const src = canRead(cfg, args.path);
  const kind = docKindOf(extOf(src));
  if (!OPS[kind]) throw new Error(`I can change text documents, spreadsheets and presentations, not a ${kindName(extOf(src))}.`);
  const changes = [].concat(args.changes || []).slice(0, 100).map((c) => ({ ...c, op: String(c?.op || '').toLowerCase() }));
  if (!changes.length) throw new Error('No changes given.');
  for (const c of changes) {
    if (!OPS[kind].includes(c.op)) throw new Error(`"${c.op || '(none)'}" doesn't work on a ${KIND_WORDS[kind]}. It can do: ${OPS[kind].join(', ')}.`);
    if (c.op === 'replace' && !String(c.find || '')) throw new Error('replace needs the text to find.');
    if (c.op === 'set_cells' && (!c.cells || typeof c.cells !== 'object' || !Object.keys(c.cells).length)) throw new Error('set_cells needs cells, like { "B2": 42 }.');
    if (c.op === 'set_cells') for (const k of Object.keys(c.cells)) if (!/^[A-Za-z]{1,3}\d{1,7}$/.test(k)) throw new Error(`${k} isn't a cell name like B2.`);
    if (c.op === 'delete_slide' && !(Number(c.number) >= 1)) throw new Error('delete_slide needs the slide number.');
  }
  const saveAs = args.save_as ? canWrite(cfg, freeName(full(args.save_as))) : null;
  if (!saveAs) canWrite(cfg, src);
  if (saveAs && docKindOf(extOf(saveAs)) !== kind && extOf(saveAs) !== 'pdf') throw new Error(`A ${KIND_WORDS[kind]} can be saved as: ${DOC_KINDS[kind].out.join(', ')}.`);
  if (!saveAs && /^(xlsm|docm|pptm)$/.test(extOf(src))) throw new Error('Macro files are only saved as a new copy, because changing them in place would lose the macros. (For you, Bob: give save_as a new name, like the same name ending in .xlsx.)');
  return {
    job: { op: 'edit', src, out: saveAs || '', changes },
    label: saveAs ? `Change a copy of ${path.basename(src)}` : `Change ${path.basename(src)}`,
    row: { id: '1', op: 'edit', from: src, to: saveAs || src, note: `${changes.map(sayChange).join('; ')}.${saveAs ? ' The original stays as it is.' : ' (a backup is kept)'}` }
  };
}

function backup(cfg, file) {
  const dir = path.join(cfg.dataDir, 'backups', today(cfg));
  fs.mkdirSync(dir, { recursive: true });
  const to = freeName(path.join(dir, file.replace(/[:\\/]+/g, '_').slice(-180)));
  fs.copyFileSync(file, to);
  return to;
}

const card = (label, rows, extra = '') => ({ text: `${label}${extra}`, plan: rows.map(({ id, op, from, to, note, blocked }) => ({ id, op, from, to, note, blocked })) });

// ---------------------------------------------------------------- the tools

export function officeTools(brain, { env = process.env } = {}) {
  const cfg = brain.cfg;
  const log = (k, t) => brain.log?.(k, t);
  const t = {};

  t.convert_file = {
    schema: fn('convert_file', 'Convert files to another kind: Word/Excel/PowerPoint/OpenDocument to and from each other or to PDF (with LibreOffice), pictures (png, jpg, webp, gif, bmp, tiff, or a PDF), sound (mp3, wav, ogg, flac, m4a) and video (mp4, webm, mkv, mov, gif, or just its sound). The original is never changed; the new file goes next to it (or in folder). {{USER}} sees every file on a card first.', {
      paths: list('Full paths of the files to convert.'),
      to: str('What to turn them into: the new ending, like pdf, docx, xlsx, png, mp3, mp4.'),
      folder: str('Optional: the folder to save the new files in.'),
      width: { type: 'number', description: 'Optional, pictures and video: the largest width in pixels.' },
      start: str('Optional, sound and video: start at this time, like 1:30.'),
      end: str('Optional, sound and video: stop at this time, like 2:45.')
    }, ['paths', 'to']),
    approvalGroup: 'office',
    check(args, ctx) {
      off(cfg);
      const plan = planConvert(cfg, args, env);
      if (ctx) ctx.officePlan = plan;
      return card(plan.label, plan.rows, '. The originals stay as they are, and nothing is overwritten.');
    },
    async run(args, ctx) {
      off(cfg);
      const plan = ctx?.officePlan?.to === String(args.to || '').toLowerCase().replace(/^\./, '').trim() ? ctx.officePlan : planConvert(cfg, args, env);
      if (ctx) ctx.officePlan = null;
      const want = ctx?.picked ? new Set(ctx.picked.map(String)) : null;
      const office = findOffice(cfg, env), ffmpeg = findFfmpeg(cfg, env);
      const saved = [], failed = [];
      for (const row of plan.rows) {
        if (row.blocked || (want && !want.has(row.id))) continue;
        if (ctx?.signal?.aborted) break;
        try {
          canRead(cfg, row.from);
          const out = canWrite(cfg, freeName(row.to)); // something may have taken the name while the card waited
          fs.mkdirSync(path.dirname(out), { recursive: true });
          if (row.route === 'office') await officeJob(cfg, { op: 'convert', src: row.from, out }, { signal: ctx?.signal, office });
          else if (row.route === 'picture') await pictureJob({ src: row.from, out, width: args.width }, { signal: ctx?.signal, ffmpeg });
          else await mediaJob({ src: row.from, out, width: args.width, start: args.start, end: args.end }, { signal: ctx?.signal, ffmpeg });
          if (!sizeOf(out)) throw new Error('the new file came out empty');
          saved.push(out);
        } catch (e) { failed.push(`${path.basename(row.from)} (${e.message})`); }
      }
      if (ctx) ctx.made = saved.slice(0, 6);
      log('office', `convert to ${plan.to}: ${saved.length} done${failed.length ? `, ${failed.length} failed` : ''}`);
      if (!saved.length) return `Error: nothing was converted. ${failed.join('; ') || 'Nothing was ticked.'}`;
      return [...saved.map((p) => `Saved ${p} (${kb(sizeOf(p))}).`), failed.length ? `Not done: ${failed.join('; ')}` : ''].filter(Boolean).join('\n');
    },
    summary: ({ paths, to }) => `convert ${[].concat(paths || []).length} file(s) to ${to}`
  };

  t.office_read = {
    schema: fn('office_read', 'Read what is in a Word, Excel, PowerPoint, OpenDocument, RTF or PDF file: the text with headings and tables, every sheet\'s cells, or every slide with its notes.', {
      path: str('Full path of the file.'),
      sheet: str('Optional, spreadsheets: only this sheet.'),
      formulas: { type: 'boolean', description: 'Optional, spreadsheets: show formulas instead of their results.' }
    }, ['path']),
    async run(args, ctx) {
      off(cfg);
      const src = canRead(cfg, args.path);
      const ext = extOf(src);
      if (!docKindOf(ext) && ext !== 'pdf') throw new Error(`I read documents, spreadsheets and presentations with this; a ${kindName(ext)} isn't one. Try read_file.`);
      const r = await officeJob(cfg, { op: 'read', src, max: 20000, sheet: args.sheet || '', formulas: args.formulas === true }, { signal: ctx?.signal, office: findOffice(cfg, env) });
      const about = r.kind === 'calc' ? r.info.sheets.map((s) => `${s.name} (${s.area})`).join(', ') : r.kind === 'writer' ? `${r.info.pages ? `${r.info.pages} pages, ` : ''}${r.info.paragraphs} paragraphs` : `${r.info.slides} slides`;
      return `${path.basename(src)}: ${about}.\n\n${r.text}${r.cut ? `\n\n[cut: showed the first 20000 of ${r.chars} characters]` : ''}`;
    },
    summary: ({ path: p }) => `read ${path.basename(String(p || ''))}`
  };

  t.office_make = {
    schema: fn('office_make', 'Make a new Word/Writer document, Excel/Calc spreadsheet or PowerPoint/Impress presentation (or save it straight to PDF). Leave path out to save it in your own Documents folder.', {
      kind: str('writer, calc or impress', { enum: ['writer', 'calc', 'impress'] }),
      path: str('Optional: full path of the new file, ending in .docx, .odt, .xlsx, .ods, .pptx, .odp or .pdf. Never overwrites.'),
      name: str('Optional, when there is no path: a short file name.'),
      text: str('writer: the text, in simple Markdown: # headings, - bullets, | tables |, **bold**, ---page--- for a new page.'),
      sheets: { type: 'array', description: 'calc: the sheets.', items: { type: 'object', properties: { name: { type: 'string' }, rows: { type: 'array', description: 'Rows of cells; the first row is the header. A cell starting with = is a formula, like =SUM(B2:B9).', items: { type: 'array', items: {} } } } } },
      slides: { type: 'array', description: 'impress: the slides.', items: { type: 'object', properties: { title: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } }, notes: { type: 'string', description: 'Speaker notes.' } } } }
    }, ['kind']),
    approvalGroup: 'office',
    check(args, ctx) {
      off(cfg);
      const p = planMake(cfg, args);
      if (!findOffice(cfg, env)) throw new Error(OFFICE_MISSING);
      if (ctx) ctx.officeMake = p;
      if (p.mine) return false; // a new file in Bob's own Documents folder needs no OK, like write_file in the inn
      return card(p.label, [p.row], '. Nothing is overwritten.');
    },
    async run(args, ctx) {
      off(cfg);
      const p = ctx?.officeMake || planMake(cfg, args);
      if (ctx) ctx.officeMake = null;
      const out = canWrite(cfg, freeName(p.job.out));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const r = await officeJob(cfg, { ...p.job, out }, { signal: ctx?.signal, office: findOffice(cfg, env) });
      if (ctx) ctx.made = [out];
      log('office', `made ${out}`);
      return `Saved ${out} (${kb(r.bytes || sizeOf(out))}).`;
    },
    summary: ({ kind, path: p, name }) => `new ${KIND_WORDS[kind] || 'document'}${p ? ` ${path.basename(String(p))}` : name ? ` ${name}` : ''}`
  };

  t.office_edit = {
    schema: fn('office_edit', 'Change a Word/Excel/PowerPoint/OpenDocument file. Text documents: replace, append. Spreadsheets: replace, set_cells, add_rows, add_sheet. Presentations: replace, add_slide, delete_slide. Fill a template by replacing its placeholders. Read it with office_read first. {{USER}} sees the changes on a card first; the original is backed up.', {
      path: str('Full path of the file.'),
      changes: { type: 'array', description: 'The changes, in order.', items: { type: 'object', properties: {
        op: { type: 'string', enum: ['replace', 'append', 'set_cells', 'add_rows', 'add_sheet', 'add_slide', 'delete_slide'] },
        find: { type: 'string', description: 'replace: the exact text to find (every match changes).' },
        replace: { type: 'string', description: 'replace: the new text.' },
        text: { type: 'string', description: 'append: text to add at the end, simple Markdown.' },
        sheet: { type: 'string', description: 'set_cells / add_rows: which sheet (default the first).' },
        cells: { type: 'object', description: 'set_cells: cell name to value, like { "B2": 42, "C2": "=B2*2" }.' },
        rows: { type: 'array', description: 'add_rows / add_sheet: rows of cells.', items: { type: 'array', items: {} } },
        name: { type: 'string', description: 'add_sheet: the new sheet\'s name.' },
        title: { type: 'string', description: 'add_slide: its title.' },
        bullets: { type: 'array', items: { type: 'string' }, description: 'add_slide: its points.' },
        notes: { type: 'string', description: 'add_slide: speaker notes.' },
        at: { type: 'number', description: 'add_slide: its slide number (2 or more; default the end).' },
        number: { type: 'number', description: 'delete_slide: which slide.' }
      }, required: ['op'] } },
      save_as: str('Optional: save the changed file under this new full path (any matching kind, or .pdf) and leave the original as it is.')
    }, ['path', 'changes']),
    approvalGroup: 'office',
    check(args, ctx) {
      off(cfg);
      const p = planEdit(cfg, args);
      if (!findOffice(cfg, env)) throw new Error(OFFICE_MISSING);
      if (ctx) ctx.officeEdit = p;
      return card(p.label, [p.row]);
    },
    async run(args, ctx) {
      off(cfg);
      const p = ctx?.officeEdit || planEdit(cfg, args);
      if (ctx) ctx.officeEdit = null;
      const job = { ...p.job };
      if (job.out) job.out = canWrite(cfg, freeName(job.out));
      const saved = job.out ? '' : backup(cfg, job.src);
      const r = await officeJob(cfg, job, { signal: ctx?.signal, office: findOffice(cfg, env) });
      const out = job.out || job.src;
      if (ctx) ctx.made = [out];
      log('office', `edited ${job.src}${job.out ? ` -> ${job.out}` : ''}: ${(r.done || []).join('; ')}`);
      return `Saved ${out} (${kb(sizeOf(out))}). Done: ${(r.done || []).join('; ') || 'nothing to change'}.${saved ? ' (The original is backed up in the inn.)' : ''}`;
    },
    summary: ({ path: p, changes }) => `change ${path.basename(String(p || ''))} (${[].concat(changes || []).length} change(s))`
  };

  return t;
}
