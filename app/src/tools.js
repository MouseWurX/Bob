// Bob's tools. Each tool has a JSON schema for the model, an optional approval check,
// and a run function. Anything risky goes through approval; the inn folder is Bob's own space.
import { appendText } from './vault.js'; // 🔒 Lock my chats and memory
import fs from 'node:fs';
import path from 'node:path';
import { isInside, insideAny, appDir, findOutput } from './config.js';
import { HATS } from './persona.js';
import { cloudHelpers, askCloud } from './cloud.js';
import { copyName } from './clan.js';
import { limitOn, readOnlyRoots, handOn } from './hands-settings.js';
import { listWorkflows, workshopDir } from './workshop.js';
import { bobHelp } from './self-help.js';
import { recallOn, tagLine } from './recall.js';
import { diagramTool } from './diagram.js';
import { saveAsTool } from './save-as.js';
import { isPrivateHost } from './security-web.js';
import { selfWorkOn, hasCodeCopy, codeCopyRoot, codeCopyDir, gatherBrains, pickBigBrain, pickedMissing, selfCtx, selfWorkParts, SELF_STEPS, repoNamed, reposOf, baseOf } from './self-work.js';
import { runManaged } from './self-work-plan.js';
import { ownEntries } from './own-models.js';
import { ensureTool } from './self-work-tools.js';
import { catalogFileFor } from './llamacpp.js';
import { ctxLabel } from './model-ctx.js';
import { isDoc, docText, OLD_EXT, MAX_DOC_BYTES } from './doc-text.js';
import { docToolsOn } from './my-docs.js';
import { codeMap, linesAround } from './code-map.js';

const MAX_READ = 20000;
// Runnable file types Bob won't write outside a project, on every platform (Windows, Mac and Linux kinds together).
const BLOCKED_EXT = new Set(['.exe', '.msi', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.js', '.mjs', '.cjs', '.jse', '.wsf', '.hta', '.scr', '.lnk', '.reg', '.dll', '.com', '.jar', '.sh', '.bash', '.zsh', '.py', '.pyw', '.command', '.desktop', '.app']);
// read_file refuses files over this many bytes: a multi-GB file would otherwise be read whole into memory.
const MAX_READ_BYTES = 20 * 1024 * 1024;
// fetch_page stops reading a page after this many bytes, and hands it over 15,000 characters at a time.
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_PAGE = 15000;
export async function readCapped(res, max) {
  const parts = []; let n = 0;
  for await (const chunk of res.body || []) { parts.push(chunk); n += chunk.length; if (n >= max) break; }
  return Buffer.concat(parts).subarray(0, max).toString('utf8');
}

// #48: a long page or file comes in parts, so Bob can read past the first piece instead of fetching the top again.
// part = 1, 2, 3 ...; find = a word or phrase: give the part it is in. The note says the size and the exact next call.
export function pieceOf(text, { part, find } = {}, size, again) {
  const total = Math.max(1, Math.ceil(text.length / size));
  let n = Math.max(1, Math.floor(Number(part)) || 1), note = '';
  const word = String(find || '').trim();
  if (word) {
    const low = text.toLowerCase(), w = word.toLowerCase(), hits = [];
    for (let i = low.indexOf(w); i >= 0 && hits.length < 200; i = low.indexOf(w, i + w.length)) hits.push(i);
    if (!hits.length) return `"${word}" isn't anywhere in it (${text.length.toLocaleString('en')} characters, ${total} part${total > 1 ? 's' : ''}). Try a shorter or different word.`;
    n = Math.floor(hits[0] / size) + 1;
    const parts = [...new Set(hits.map((i) => Math.floor(i / size) + 1))];
    note = `[Found "${word}" ${hits.length}${hits.length >= 200 ? '+' : ''} time${hits.length > 1 ? 's' : ''}, in part${parts.length > 1 ? 's' : ''} ${parts.slice(0, 20).join(', ')}${parts.length > 20 ? ' ...' : ''}. Showing part ${n}.]\n`;
  }
  if (total === 1) return note + text;
  if (n > total) return `It only has ${total} parts (${text.length.toLocaleString('en')} characters). That was the end.`;
  const body = text.slice((n - 1) * size, n * size);
  const line = (c) => text.slice(0, c).split('\n').length;
  const where = `[Part ${n} of ${total}: characters ${((n - 1) * size + 1).toLocaleString('en')} to ${Math.min(n * size, text.length).toLocaleString('en')} of ${text.length.toLocaleString('en')}, lines ${line((n - 1) * size)} to ${line(Math.min(n * size, text.length))}.`;
  const next = n < total ? ` To read on, call ${again} part: ${n + 1}. To jump to a word, use find.]` : ' This is the last part.]';
  return `${note}${body}\n\n${where}${next}`;
}
// Code, plain text and data are read as they are: the HTML cleaner would eat everything between a < and a >.
const isPlain = (type, url) => /^(text\/(plain|markdown|csv|x-|javascript|css)|application\/(json|javascript|x-|xml|yaml|toml))/i.test(type) ||
  /^(raw\.githubusercontent\.com|gist\.githubusercontent\.com)$/i.test(url.hostname);

// Secrets Bob must never list, read, search or write: signing keys, API keys, databases, his own config.
const SECRET_NAME = /^(local\.properties|keystore\.properties|google-services\.json|credentials\.json|\.env(\..*)?|\.npmrc|\.git-credentials|id_(rsa|dsa|ecdsa|ed25519).*)$/i;
const SECRET_EXT = new Set(['.jks', '.keystore', '.p12', '.pfx', '.pem', '.key', '.db', '.sqlite', '.sqlite3', '.kdbx']);
// Bob's own config is always off-limits; the rest only while the "Keep secret files private" hard limit is on.
export function isSensitive(cfg, file) {
  // Bob-Net link keys (sealed SCUT packets, src/scut-seal.js) are always off-limits, like config.json.
  const own = [path.join(appDir, 'config.json'), process.env.BOB_CONFIG, cfg?.dataDir ? path.join(cfg.dataDir, 'bob-net-link-keys.json') : ''].filter(Boolean);
  if (own.some((f) => isInside(f, file))) return true;
  // 🔐 Bob's locked store and the box that opens it (src/secret-box.js): always off-limits, like his config.
  if (cfg.dataDir && path.resolve(path.dirname(file)) === path.resolve(cfg.dataDir) && /^(keys\.json|secret-box(\..*)?\.json|mcp-servers\.json)$/i.test(path.basename(file))) return true;
  if (!limitOn(cfg, 'secrets')) return false;
  const base = path.basename(file);
  if (SECRET_NAME.test(base) || SECRET_EXT.has(path.extname(base).toLowerCase())) return true;
  if (cfg.agentDir && isInside(path.join(cfg.agentDir, 'open-webui-data'), file)) return true;
  return false;
}
const SECRET_MSG = "That file holds keys or passwords, so it stays off-limits to me. The user can open it directly if needed.";

const fn = (name, description, properties, required = Object.keys(properties)) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
});
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

export function today(cfg) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function safeName(s) {
  return String(s || 'sheet').replace(/[^a-zA-Z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'sheet';
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 2; ; i++) {
    const c = path.join(dir, `${name}-${i}${ext}`);
    if (!fs.existsSync(c)) return c;
  }
}

function resolveUserPath(p) {
  if (!p || typeof p !== 'string') throw new Error('A full file path is needed.');
  if (!path.isAbsolute(p)) throw new Error('Please give a full path, like C:\\Users\\you\\Documents\\notes.txt');
  return path.resolve(p);
}

export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

// 'YYYY-MM-DDTHH:mm' as wall-clock time in the given zone -> epoch ms.
export function zonedToEpoch(local, timeZone) {
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!m) throw new Error('Time must look like 2026-11-01T15:30');
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offset = (ms) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return t;
}

export function loadReminders(cfg) {
  try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'reminders.json'), 'utf8')); } catch { return []; }
}
export function saveReminders(cfg, list) {
  fs.writeFileSync(path.join(cfg.dataDir, 'reminders.json'), JSON.stringify(list, null, 2));
}

// 🧰 More tools, "Let reminders repeat": how a repeating reminder moves on, in the wall-clock time it was set in
// (so 9:00 stays 9:00 across a clock change). Month ends stick to the last day (31 Jan, 28 Feb, 31 Mar).
export const REPEATS = ['day', 'weekday', 'weekend', 'week', '2 weeks', 'month', 'year'];
const pad2 = (n) => String(n).padStart(2, '0');
function partsOf(local) {
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!m) throw new Error('Time must look like 2026-11-01T15:30');
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], day: +m[3] };
}
const localOf = ({ y, mo, d, h, mi }) => `${y}-${pad2(mo)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}`;
const weekdayOf = ({ y, mo, d }) => new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0 Sunday
const daysIn = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
function addDays(p, n) { const t = new Date(Date.UTC(p.y, p.mo - 1, p.d + n)); return { ...p, y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
const fits = (p, every) => (every === 'weekday' ? ![0, 6].includes(weekdayOf(p)) : every === 'weekend' ? [0, 6].includes(weekdayOf(p)) : true);
// The first time for a weekday or weekend reminder is the first such day from the time asked.
export function firstRepeat(local, every) {
  let p = partsOf(local);
  for (let i = 0; i < 7 && !fits(p, every); i++) p = addDays(p, 1);
  return localOf(p);
}
export function nextRepeat(local, every, day) {
  const p = partsOf(local);
  const keep = day || p.d;
  if (every === 'day') return localOf(addDays(p, 1));
  if (every === 'week') return localOf(addDays(p, 7));
  if (every === '2 weeks') return localOf(addDays(p, 14));
  if (every === 'weekday' || every === 'weekend') { let q = addDays(p, 1); for (let i = 0; i < 7 && !fits(q, every); i++) q = addDays(q, 1); return localOf(q); }
  if (every === 'month') { let y = p.y, mo = p.mo + 1; if (mo > 12) { mo = 1; y++; } return localOf({ ...p, y, mo, d: Math.min(keep, daysIn(y, mo)) }); }
  if (every === 'year') { const y = p.y + 1; return localOf({ ...p, y, d: Math.min(keep, daysIn(y, p.mo)) }); }
  throw new Error(`I can't repeat "${every}".`);
}
// A repeating reminder that went off (or was missed while Bob was closed): its next time after now.
export function moveOn(r, timeZone, now = Date.now()) {
  let local = r.local, at = r.at;
  const day = r.day || partsOf(r.local).d;
  for (let i = 0; i < 2000 && at <= now; i++) { local = nextRepeat(local, r.every, day); at = zonedToEpoch(local, timeZone); }
  return { ...r, local, at, day };
}

export function cloudProviders(cfg) {
  return cloudHelpers(cfg);
}

export function buildTools(cfg) {
  const t = {};

  t.notice_board = {
    schema: fn('notice_board', "Read or rewrite {{USER}}'s notice board (their to-do list). To change it, read it first, then write the whole board.", {
      action: str('read or write', { enum: ['read', 'write'] }),
      content: str('write: the whole new board, in Markdown.')
    }, ['action']),
    async run({ action, content }) {
      const file = cfg.noticeBoard;
      if (action !== 'write') return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '(The notice board is empty. No file yet.)';
      if (!content) throw new Error('No board content given.');
      if (fs.existsSync(file)) {
        const old = fs.readFileSync(file, 'utf8');
        const m = old.match(/Notice board,?\s*(\d{4}-\d{2}-\d{2})/);
        if (m && m[1] !== today(cfg)) {
          const arch = path.join(cfg.archiveDir, `${m[1]}.md`);
          if (!fs.existsSync(arch)) fs.writeFileSync(arch, old);
        }
      }
      fs.writeFileSync(file, content);
      return 'Notice board saved.';
    },
    summary: ({ action }) => `notice board: ${action}`
  };

  t.remember = {
    // 1.5.79: with "Remember only what fits" on, a fact can go to one project's memory bank (the project field
    // is only offered then, so the tool costs nothing extra while the setting is off).
    get schema() {
      const banks = recallOn(cfg) ? Object.keys(cfg.projects || {}) : [];
      return fn('remember', 'Save a lasting fact about {{USER}}, like a preference or a plan. Never secrets or passwords.', {
        fact: str('One short sentence.'),
        ...(recallOn(cfg) ? { project: str(`Only for a fact about one project: its name${banks.length ? ` (${banks.join(', ')})` : ''}. Leave out for anything general.`) } : {})
      }, ['fact']);
    },
    async run({ fact, project }) {
      if (!fact) throw new Error('Nothing to remember.');
      const clean = String(fact).replace(/\s+/g, ' ').trim();
      const line = `- ${recallOn(cfg) ? tagLine(`${clean} (${today(cfg)})`, project) : `${clean} (${today(cfg)})`}\n`;
      appendText(cfg, cfg.memoryFile, line);
      return recallOn(cfg) && project ? `Remembered, in the ${String(project).replace(/[\][]/g, '').trim()} memory bank.` : 'Remembered.';
    },
    summary: ({ fact, project }) => `remember: ${String(fact).slice(0, 80)}${project ? ` (${project})` : ''}`
  };

  t.reminders = {
    // 🧰 More tools, "Let reminders repeat" (off by default): an `every` field, and the list shows it.
    get schema() {
      const rep = cfg.moreTools?.repeatReminders === true;
      return fn('reminders', `Set, list or cancel a reminder. Bob pops up at the time, while the PC is on.${rep ? ' A reminder can repeat.' : ''}`, {
        action: str('add, list or cancel', { enum: ['add', 'list', 'cancel'] }),
        time: str(rep ? 'add: local time, YYYY-MM-DDTHH:mm. For a repeating one, the first time.' : 'add: local time, YYYY-MM-DDTHH:mm.'),
        text: str('add: what to remind about.'),
        ...(rep ? { every: str('add, only to repeat: day, weekday, weekend, week, 2 weeks, month or year. "Every Monday at 9" = the next Monday 09:00 and week.', { enum: REPEATS }) } : {}),
        id: str('cancel: the id from list.')
      }, ['action']);
    },
    async run({ action, time, text, id, every }) {
      const list = loadReminders(cfg);
      if (action === 'add') {
        if (!text) throw new Error('What should I remind about?');
        const at = zonedToEpoch(time, cfg.timeZone);
        if (at < Date.now() - 60000) throw new Error('That time has already passed.');
        const rep = every && cfg.moreTools?.repeatReminders === true && REPEATS.includes(every) ? every : '';
        if (every && !rep && cfg.moreTools?.repeatReminders !== true) throw new Error('Repeating reminders are off. They\'re in Settings, How Bob works, 🧰 More tools: "Let reminders repeat". Set a one-off one, and say so.');
        const r = { id: Math.random().toString(36).slice(2, 8), at, local: time, text: String(text).slice(0, 300), ...(rep ? { every: rep } : {}) };
        if (rep) { r.local = firstRepeat(time, rep); r.at = zonedToEpoch(r.local, cfg.timeZone); }
        list.push(r);
        saveReminders(cfg, list);
        return `Reminder ${r.id} set for ${r.local}${rep ? `, then every ${rep}` : ''}: ${r.text}`;
      }
      if (action === 'cancel') {
        const left = list.filter((r) => r.id !== id);
        if (left.length === list.length) throw new Error('No reminder with that id.');
        saveReminders(cfg, left);
        return 'Cancelled.';
      }
      return list.length ? list.map((r) => `${r.id}: ${r.local}${r.every ? ` (every ${r.every})` : ''} - ${r.text}`).join('\n') : 'No reminders set.';
    },
    summary: ({ action, time, every }) => `reminder: ${action}${time ? ' ' + time : ''}${every ? ` (every ${every})` : ''}`
  };

  t.list_folder = {
    schema: fn('list_folder', "List the files in a folder. {{USER}}'s home folder is {{HOME}}; never guess another.", { path: str('Full folder path.') }),
    async run({ path: p }) {
      const dir = resolveUserPath(p);
      if (!insideAny(cfg.readRoots, dir)) throw new Error(`I'm not allowed to look in ${dir}. Allowed: ${cfg.readRoots.join('; ')}`);
      if (isSensitive(cfg, dir)) throw new Error(SECRET_MSG);
      const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !isSensitive(cfg, path.join(dir, e.name))).slice(0, 300);
      return entries.map((e) => {
        if (e.isDirectory()) return `[folder] ${e.name}`;
        let size = '';
        try { size = ` (${Math.round(fs.statSync(path.join(dir, e.name)).size / 1024)} KB)`; } catch {}
        return `${e.name}${size}`;
      }).join('\n') || '(empty folder)';
    },
    summary: ({ path: p }) => `list ${p}`
  };

  t.read_file = {
    schema: fn('read_file', "Read a text file. A long file comes in parts; each part says how to get the next.", {
      path: str('Full file path.'),
      part: { type: 'integer', description: 'Optional: which part, 1, 2, 3... Default 1.' },
      find: str('Optional: words to look for; you get the part they are in.'),
      line: { type: 'integer', description: 'Optional: a line number, like one from an error. You get the lines around it.' }
    }, ['path']),
    async run({ path: p, part, find, line }) {
      const file = resolveUserPath(p);
      if (!insideAny(cfg.readRoots, file)) throw new Error(`I'm not allowed to read ${file}.`);
      if (isSensitive(cfg, file)) throw new Error(SECRET_MSG);
      const size = fs.statSync(file).size;
      // "Read and search my documents" (my-docs.js): Word, Excel, PowerPoint, OpenDocument, e-books, RTF and PDF as text.
      const ext = path.extname(file).slice(1).toLowerCase();
      if (docToolsOn(cfg) && isDoc(file)) {
        if (size > MAX_DOC_BYTES) throw new Error(`That file is ${Math.round(size / 1048576)} MB. I read documents up to ${MAX_DOC_BYTES / 1048576} MB.`);
        const words = docText(file);
        return pieceOf(words || '(That document has no words in it.)', { part, find }, MAX_READ, 'read_file again with the same path and');
      }
      if (size > MAX_READ_BYTES) throw new Error(`That file is ${Math.round(size / 1048576)} MB, too big to read as text. I read files up to 20 MB.`);
      const buf = fs.readFileSync(file);
      if (buf.subarray(0, 4096).includes(0) || (isDoc(file) && ext !== 'rtf') || OLD_EXT.includes(ext)) {
        if (isDoc(file) && !docToolsOn(cfg)) return `(That's a document, not plain text. To read it, ${cfg.userName || 'the user'} can turn on "Read and search my documents" in Settings, How Bob works, or the Office documents Hand; say so in one line.)`;
        if (OLD_EXT.includes(ext)) return '(That\'s an old Office file, which needs the Office documents Hand (office_read) to read.)';
        return '(That looks like a binary file, so I can\'t read it as text.)';
      }
      const text = buf.toString('utf8');
      if (Number(line) > 0) return linesAround(text, line); // Nov 11: straight to an error's file:line (code-map.js)
      return pieceOf(text, { part, find }, MAX_READ, 'read_file again with the same path and');
    },
    summary: ({ path: p, part, find, line }) => `read ${p}${Number(line) > 0 ? ` (around line ${line})` : find ? ` (looking for ${find})` : part > 1 ? ` (part ${part})` : ''}`
  };

  // Nov 11: the code map (code-map.js): one line per source file, so a small brain finds the right file first.
  t.code_map = {
    schema: fn('code_map', 'Map a codebase: one line per source file with what it is for and the main names in it. Call it first on a big project, then read only the file you need.', {
      project: str('Optional: project name. Leave out for the main project.', { enum: Object.keys(cfg.projects || {}) }),
      folder: str('Optional: a full folder path instead, like one folder of a big project.')
    }, []),
    async run({ project, folder }) {
      const all = cfg.projects || {};
      if (project && !all[project]) throw new Error(`Unknown project. I know: ${Object.keys(all).join(', ') || 'none yet'}`);
      const root = folder ? resolveUserPath(folder) : all[project] || all[cfg.defaultProject] || Object.values(all)[0];
      if (!root) throw new Error('No projects are set up yet. Give me a full folder path to map.');
      if (!insideAny(cfg.readRoots, root) && !Object.values(all).some((r) => isInside(r, root))) throw new Error(`I'm not allowed to read ${root}.`);
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`There's no folder at ${root}.`);
      return codeMap(root, { skip: (f) => isSensitive(cfg, f) });
    },
    summary: ({ project, folder }) => `map the code in ${folder || project || 'the main project'}`
  };

  t.write_file = {
    schema: fn('write_file', "Create or overwrite a text file. New files in the inn folder need no OK; anything else asks {{USER}} first.", {
      path: str('Full file path.'),
      content: str('The full file contents.')
    }),
    check({ path: p, content }) {
      const file = resolveUserPath(p);
      if (isSensitive(cfg, file)) throw new Error(SECRET_MSG);
      if (BLOCKED_EXT.has(path.extname(file).toLowerCase()) && !projectOf(file)) throw new Error('I don\'t write program or script files that could be run.');
      if (insideAny(readOnlyRoots(cfg), file)) throw new Error(`${file} is in a read-only project.`);
      if (!insideAny(cfg.readRoots, file)) throw new Error(`I'm not allowed to write in that folder. Allowed: ${cfg.readRoots.join('; ')}`);
      const exists = fs.existsSync(file);
      // New files in the inn need no OK, except in the code copy of Bob's own code (self-work.js): every change there shows its card.
      if (isInside(cfg.innDir, file) && !exists && !isInside(codeCopyRoot(cfg), file)) return false;
      return `${exists ? 'Overwrite' : 'Create'} ${file} (${Buffer.byteLength(content || '')} bytes)`;
    },
    approvalGroup: 'edit',
    async run({ path: p, content }) {
      const file = resolveUserPath(p);
      backup(file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content ?? '');
      return `Saved ${file}.`;
    },
    summary: ({ path: p }) => `write ${p}`
  };

  t.save_spreadsheet = {
    schema: fn('save_spreadsheet', 'Save a table as a CSV file in the ledger folder (opens in Excel). Never overwrites.', {
      name: str('Short file name, like monthly-bills.'),
      csv: str('CSV text with a header row first.')
    }),
    async run({ name, csv }) {
      if (!csv || !csv.trim()) throw new Error('The CSV is empty.');
      const file = uniquePath(path.join(cfg.ledgerDir, `${safeName(name)}-${today(cfg)}.csv`));
      fs.writeFileSync(file, '\ufeff' + csv.trim() + '\r\n');
      const rows = csv.trim().split(/\r?\n/).length;
      return `Saved ${file} (${rows} lines including the header). Double-click it to open in Excel.`;
    },
    summary: ({ name }) => `ledger: ${name}`
  };

  // Bob knows his own settings and features (self-help.js): the same Help text as the window, plus what's set now.
  t.bob_help = {
    schema: fn('bob_help', "Look up how you (Bob) work: your settings, switches, pages and features, where each is and what is set now. When {{USER}} asks about a setting, a feature or one of your own words (Bob-Net, the Lab, fNRI, the Forge, the moot, sessions, Hands), look here first, before searching files or the web, and name the exact place to press.", {
      topic: str('What to look up, like "web search switch".')
    }),
    async run({ topic }) { return bobHelp(cfg, String(topic || '')); },
    summary: ({ topic }) => `Help: ${topic || 'settings'}`
  };

  t.web_search = {
    schema: fn('web_search', 'Search the web. Returns titles, links and snippets. Operators work: "exact phrase", -word, site:, filetype:, intitle:, OR.', { query: str('Search words.'), when: str('Optional: only the past day, week, month or year.', { enum: ['day', 'week', 'month', 'year'] }) }, ['query']),
    async run({ query, when }, { signal }) {
      const df = { day: 'd', week: 'w', month: 'm', year: 'y' }[String(when || '').toLowerCase()];
      const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query) + (df ? `&df=${df}` : ''), {
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Bob/0.1' }, signal
      });
      const html = await res.text();
      const out = [];
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = re.exec(html)) && out.length < 8) {
        let url = m[1].replace(/&amp;/g, '&');
        const u = url.match(/[?&]uddg=([^&]+)/);
        if (u) url = decodeURIComponent(u[1]);
        if (url.startsWith('//')) url = 'https:' + url;
        out.push(`${out.length + 1}. ${htmlToText(m[2])}\n   ${url}\n   ${htmlToText(m[3])}`);
      }
      return out.length ? out.join('\n') : 'No results (or the search page changed). Try different words.';
    },
    summary: ({ query, when }) => `search: ${query}${when ? ` (past ${when})` : ''}`
  };

  t.fetch_page = {
    schema: fn('fetch_page', 'Read a web page as text. A long page comes in parts; each part says how to get the next.', {
      url: str('http or https link.'),
      part: { type: 'integer', description: 'Optional: which part, 1, 2, 3... Default 1.' },
      find: str('Optional: words to look for; you get the part they are in.')
    }, ['url']),
    async run({ url, part, find }, { signal }) {
      // Redirects are followed by hand so every hop gets the same home-network check as the first address.
      let u = new URL(url), res;
      for (let hop = 0; ; hop++) {
        if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https links.');
        if (isPrivateHost(u.hostname)) throw new Error('I don\'t open addresses on the home network.');
        res = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Bob/0.1' }, redirect: 'manual', signal });
        const next = res.status >= 300 && res.status < 400 && res.headers.get('location');
        if (!next) break;
        if (hop >= 5) throw new Error('That link redirects too many times.');
        u = new URL(next, u);
      }
      const type = res.headers.get('content-type') || '';
      if (!/text|html|json|xml/.test(type)) return `That link is a ${type || 'file'}, not a page. I won't download it.`;
      const raw = await readCapped(res, MAX_PAGE_BYTES);
      const text = isPlain(type, u) ? raw : htmlToText(raw);
      return pieceOf(text, { part, find }, MAX_PAGE, 'fetch_page again with the same url and');
    },
    summary: ({ url, part, find }) => `read page: ${url}${find ? ` (looking for ${find})` : part > 1 ? ` (part ${part})` : ''}`
  };

  t.make_image = {
    schema: fn('make_image', "Paint a picture, or change one (give a reference).", {
      prompt: str('New picture: the full prompt. Edit: only what to change, like "Swap his hard hat for a silver tiara". Don\'t describe the whole picture again, or it gets repainted.'),
      width: { type: 'integer', description: 'Default 1024. Leave out for edits.' },
      height: { type: 'integer', description: 'Default 1024. Leave out for edits.' },
      reference: { type: 'array', items: { type: 'string' }, description: 'Optional: up to 4 pictures to edit or paint from: a shelf or attached name, "last" (your newest) or a painted file name.' },
      mode: str('With a reference: keep_look = edit it, same character or scene (default); start_from = rework the picture itself (the look can drift); new = paint something new anyway.', { enum: ['keep_look', 'start_from', 'new'] }),
      strength: { type: 'number', description: 'start_from only: how much changes, 0.1 to 0.95. Default 0.6.' }
    }, ['prompt']),
    async run(args, ctx) { return ctx.brain.makeImage(args, ctx); },
    summary: ({ prompt }) => `image: ${String(prompt).slice(0, 80)}`
  };

  t.make_video = {
    schema: fn('make_video', "Make a short video clip (takes minutes).", {
      prompt: str('Subject, motion, camera, style.'),
      seconds: { type: 'integer', description: '1 to 5, default 2.' },
      width: { type: 'integer', description: 'Default 832.' },
      height: { type: 'integer', description: 'Default 480.' },
      reference: { type: 'array', items: { type: 'string' }, description: 'Optional: a picture name to start from.' }
    }, ['prompt']),
    async run(args, ctx) { return ctx.brain.makeVideo(args, ctx); },
    summary: ({ prompt }) => `video: ${String(prompt).slice(0, 80)}`
  };

  t.make_music = {
    schema: fn('make_music', "Make a piece of music (takes a few minutes).", {
      prompt: str('Style tags: genre, mood, instruments, tempo, like "chiptune, upbeat, 140 bpm". No style given? Pick one and say which.'),
      lyrics: str('Optional, with [verse] and [chorus]. Empty = instrumental.'),
      seconds: { type: 'integer', description: '10 to 240, default 30.' },
      title: str('Optional: 2 to 5 words. Make one up if none given.')
    }, ['prompt']),
    async run(args, ctx) { return ctx.brain.makeSound('music', args, ctx); },
    summary: ({ prompt }) => `music: ${String(prompt).slice(0, 80)}`
  };

  t.make_sound = {
    schema: fn('make_sound', 'Make a short sound effect.', {
      prompt: str('What it sounds like: "heavy wooden door creaking open in a stone hall".'),
      seconds: { type: 'integer', description: '1 to 20, default 5.' }
    }, ['prompt']),
    async run(args, ctx) { return ctx.brain.makeSound('sfx', args, ctx); },
    summary: ({ prompt }) => `sound: ${String(prompt).slice(0, 80)}`
  };

  t.workshop_list = {
    schema: fn('workshop_list', 'List the ComfyUI workflows: what each makes and if it takes reference pictures.', {}),
    async run() {
      const all = listWorkflows(cfg);
      if (!all.length) return `No workflows yet. The user can put ComfyUI "Export (API)" files in ${workshopDir(cfg)}.`;
      return all.map((w) => w.ok ? `- ${w.name}: makes ${w.makes.join(', ') || 'something'}${w.pictures ? `, takes ${w.pictures} reference picture(s)` : ''}${w.prompt ? '' : ', no prompt box'}` : `- ${w.name}: can't use it (${w.why})`).join('\n');
    },
    summary: () => 'workshop: list'
  };

  t.workshop_run = {
    schema: fn('workshop_run', 'Run a ComfyUI workflow. Only when your own painter can\'t do it, or {{USER}} names one.', {
      workflow: str('Workflow name from workshop_list.'),
      prompt: str('The prompt to put in its prompt box.'),
      negative: str('Optional negative prompt.'),
      reference: { type: 'array', items: { type: 'string' }, description: 'Optional reference picture names, in the order of its Load Image nodes.' }
    }, ['workflow']),
    async run(args, ctx) { return ctx.brain.runWorkshop(args, ctx); },
    summary: ({ workflow }) => `workshop: ${workflow}`
  };

  t.save_reference = {
    schema: fn('save_reference', "Put a picture on the reference shelf to reuse by name: one you painted or one attached in chat.", {
      picture: str('The painted file name or the attached picture\'s name.'),
      name: str('Short name, like "Captain Mira".'),
      kind: str('What it is.', { enum: ['character', 'scene', 'style', 'object'] }),
      notes: str('Optional: anything to remember about it.')
    }, ['picture', 'name', 'kind']),
    async run({ picture, name, kind, notes }, ctx) {
      const shelf = ctx.brain.refs;
      const painted = findOutput(cfg, String(picture));
      if (/\.(png|jpe?g|webp)$/i.test(picture) && fs.existsSync(painted)) {
        const r = shelf.addFile(painted, { name, kind, notes });
        return `On the shelf as "${r.name}" (${r.kind}).`;
      }
      const r = shelf.find(picture);
      if (!r) throw new Error(`I can't find a picture called ${picture}.`);
      shelf.update(r.id, { name, kind, notes });
      return `On the shelf as "${name}" (${kind}).`;
    },
    summary: ({ name }) => `shelf: ${name}`
  };

  t.ask_specialist = {
    schema: fn('ask_specialist', "Hand a focused job to a specialist hat with its own brain. The answer goes straight to {{USER}}.", {
      hat: str('tinker = code, bugs and crashes; ledger = data and spreadsheets; scout = web research with sources; painter = picture and video prompts; reviewer = a careful second look', { enum: Object.keys(HATS) }),
      task: str('The whole job: the request plus any details or pasted text, as given. The workbench finds files itself; don\'t ask for paths first.')
    }),
    async run({ hat, task }, ctx) { return ctx.brain.runHat(hat, task, ctx); },
    summary: ({ hat }) => `hat: ${hat}`,
    endsTurn: true
  };

  // "Let Bob work on his own app" (self-work.js, off by default): the coding hat on the code copy (a separate copy of Bob's code),
  // on the brain picked in Settings (the biggest by default: Bobert, else stock Qwen3.6 35B) with Long memory stretched past 256K. Every edit and
  // command still asks; the running Bob (his program folder and settings) stays locked.
  t.work_on_repo = {
    schema: fn('work_on_repo', "Change code in one of {{USER}}'s listed repositories, or in your own app (repository \"Bob\") when asked. Works on a code copy, never the original, and returns a branch and patch. {{USER}} approves every change.", {
      repo: str('Repository name ("Bob" for your own app).'),
      job: str('What to change, in {{USER}}\'s words, with details from the chat.')
    }, ['job']),
    async run({ repo: which, job }, ctx) {
      const where = 'Settings, How Bob works, "Let Bob work on repositories"';
      if (!selfWorkOn(cfg)) throw new Error(`Working on repositories is off. It's in ${where}.`);
      const repo = repoNamed(cfg, which);
      if (!repo) throw new Error(`I don't have a repository called "${which}". The list: ${reposOf(cfg).map((r) => r.name).join(', ')}. Add one in ${where}.`);
      if (!hasCodeCopy(cfg, repo)) throw new Error(`There's no code copy of ${repo.name} to work on yet. Press "Make the code copy" next to it in ${where}.`);
      if (!String(job || '').trim()) throw new Error('Say what to change.');
      const brains = gatherBrains(cfg, { own: ownEntries(cfg), catalog: ctx.brain?.shop?.catalog?.models, catalogFile: (id) => catalogFileFor(cfg, id) });
      const missing = pickedMissing(cfg, brains);
      const pick = pickBigBrain(cfg, brains);
      if (missing && !pick) throw new Error(`The brain picked for these jobs, ${missing.name}, isn't downloaded yet. Get it in Get models, or pick another in ${where}.`);
      if (!pick) throw new Error(`There's no brain for this job on this replicant matrix yet. Pick one in ${where}, or get Qwen3.6 35B-A3B (the one I'd use) in Get models.`);
      const want = selfCtx(cfg);
      const got = await Promise.resolve(ctx.brain.fitCtx?.(pick.id, want, { longRun: true })).catch(() => null) || want;
      ctx.emit?.({ type: 'announce', text: `🔧 Off to the workbench: ${repo.own ? 'my own code' : repo.name}, in the copy at ${codeCopyDir(cfg, repo)}, on ${pick.name}${missing ? ` (${missing.name}, the one picked, isn't downloaded yet)` : ''} with ${ctxLabel(got)} of memory${got < want ? ` (${ctxLabel(want)} won't fit this replicant matrix's card and RAM)` : ' (Long memory)'}. Every change shows its card.` });
      // The owner's ask: Git and Node.js 20+ fetched when they're missing (his own copies, in his folder only).
      // Node only for Bob himself and repositories with a package.json.
      const runOn = handOn(cfg, 'run');
      if (runOn) {
        const need = [['git', 'Git'], ...(repo.own || fs.existsSync(path.join(codeCopyDir(cfg, repo), 'package.json')) ? [['node', 'Node.js']] : [])];
        for (const [tool, label] of need) {
          try {
            const t = await ensureTool(cfg, tool, { signal: ctx.signal, tick: () => {} });
            if (t.fetched) ctx.emit?.({ type: 'announce', text: `📦 ${label} wasn't on this replicant matrix, so I got my own copy (in my folder only, nothing installed for the rest of the computer).` });
          } catch (e) { throw new Error(`I need ${label} for this job and couldn't get it: ${e.message}`); }
        }
      }
      // The owner's ask: plan, then one task at a time with notes that get compressed, research shared with other Bobs
      // (opt-in), then the wrap-up (self-work-plan.js).
      const parts = selfWorkParts(cfg, job, { repo, base: baseOf(cfg, repo), runOn });
      // phased: Extreme effort's research-plan-do steps would start fresh hats on other brains; this job keeps its one brain.
      const was = ctx.phased;
      ctx.phased = true;
      try { return await runManaged(ctx.brain, ctx, { cfg, repo, job, ...parts, runOn, force: { model: pick.id, cpu: false, think: true, ctx: want, longRun: true, maxSteps: SELF_STEPS } }); }
      finally { ctx.phased = was; }
    },
    summary: ({ repo }) => `work on ${repo || 'Bob'}`,
    endsTurn: true
  };

  const SKIP_DIRS = new Set(['.git', 'node_modules', 'Binaries', 'Intermediate', 'Saved', 'DerivedDataCache', 'build', '.gradle', '.idea', '.vs', 'Build', 'dist', 'out']);
  const TEXT_EXT = /\.(cpp|h|hpp|c|cs|rs|kt|kts|java|xml|gradle|py|js|mjs|ts|tsx|jsx|html|css|json|md|txt|ini|toml|yaml|yml|uproject|uplugin|build\.cs|target\.cs|sh|ps1|bat|cfg)$/i;

  const projectOf = (file) => Object.entries(cfg.projects || {}).find(([, root]) => isInside(root, file));
  const backup = (file) => {
    if (!fs.existsSync(file)) return;
    const dir = path.join(cfg.dataDir, 'backups', today(cfg));
    fs.mkdirSync(dir, { recursive: true });
    const name = file.replace(/[:\\/]+/g, '_').slice(-180);
    fs.copyFileSync(file, uniquePath(path.join(dir, name)));
  };

  t.search_files = {
    // 1.5.32: project is optional. Brains kept asking "which project?" when the user didn't say; now leaving it out
    // searches every project (results say which file each hit is in).
    schema: fn('search_files', "Search the text in {{USER}}'s project source files. Returns matching lines with file and line number.", {
      project: str('Optional: project name. Leave out unless {{USER}} named one: it searches all.', { enum: Object.keys(cfg.projects || {}) }),
      text: str('Text to look for.')
    }, ['text']),
    async run({ project, text }) {
      const all = cfg.projects || {};
      if (project && !all[project]) throw new Error(`Unknown project. I know: ${Object.keys(all).join(', ')}`);
      // 1.5.34: the main project (Settings > Projects) is searched first.
      const roots = project ? [all[project]] : [...new Set([all[cfg.defaultProject], ...Object.values(all)].filter(Boolean))];
      if (!roots.length) throw new Error('No projects are set up yet, so there\'s nothing to search. I\'ll look in a folder instead: tell me which one, or I\'ll start with Documents. (For you, Bob: use list_folder and read_file. Projects live under "projects" in config.json; there is no switch for them in the app yet.)');
      const needle = String(text || '').toLowerCase();
      if (needle.length < 2) throw new Error('Give me at least 2 characters to look for.');
      const hits = [];
      let scanned = 0;
      const walk = (dir) => {
        if (hits.length >= 60 || scanned > 20000) return;
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (hits.length >= 60) return;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
          if (!TEXT_EXT.test(e.name) || isSensitive(cfg, full)) continue;
          scanned++;
          let body;
          try { if (fs.statSync(full).size > 1e6) continue; body = fs.readFileSync(full, 'utf8'); } catch { continue; }
          if (!body.toLowerCase().includes(needle)) continue;
          body.split(/\r?\n/).forEach((line, i) => {
            if (hits.length < 60 && line.toLowerCase().includes(needle)) hits.push(`${full}:${i + 1}: ${line.trim().slice(0, 200)}`);
          });
        }
      };
      for (const root of roots) walk(root);
      return hits.length ? hits.join('\n') : `No matches in ${scanned} files.`;
    },
    summary: ({ project, text }) => `search ${project || 'all projects'} for "${text}"`
  };

  t.edit_file = {
    schema: fn('edit_file', "Replace one exact piece of text in a file. find must appear exactly once (add nearby lines to make it unique). {{USER}} approves each change.", {
      path: str('Full file path.'),
      find: str('The exact text, copied from the file.'),
      replace: str('The new text.')
    }),
    approvalGroup: 'edit',
    check({ path: p, find, replace }) {
      const file = resolveUserPath(p);
      if (isSensitive(cfg, file)) throw new Error(SECRET_MSG);
      if (BLOCKED_EXT.has(path.extname(file).toLowerCase()) && !projectOf(file)) throw new Error('I don\'t edit program or script files outside a project.');
      if (insideAny(readOnlyRoots(cfg), file)) throw new Error(`${file} is in a read-only project.`);
      if (!insideAny(cfg.readRoots, file)) throw new Error('I\'m not allowed to edit files there.');
      if (!fs.existsSync(file)) throw new Error('That file doesn\'t exist. Use write_file to create it.');
      const body = fs.readFileSync(file, 'utf8');
      const count = body.split(find).length - 1;
      if (!find || count === 0) throw new Error('The find text isn\'t in the file. Read the file again and copy the text exactly.');
      if (count > 1) throw new Error(`The find text appears ${count} times. Include more surrounding lines so it is unique.`);
      const clip = (s) => (s.length > 700 ? s.slice(0, 700) + '\n...' : s);
      return { text: `Edit ${file}`, diff: `- ${clip(find).replace(/\n/g, '\n- ')}\n+ ${clip(replace).replace(/\n/g, '\n+ ')}` };
    },
    async run({ path: p, find, replace }) {
      const file = resolveUserPath(p);
      const body = fs.readFileSync(file, 'utf8');
      backup(file);
      fs.writeFileSync(file, body.replace(find, () => replace));
      return `Edited ${file}. (Backup kept in the inn.)`;
    },
    summary: ({ path: p }) => `edit ${p}`
  };

  // Always defined; Bob only sees it when a cloud helper is switched on and has a key (see brain.toolSchemas).
  {
    t.ask_cloud = {
      schema: fn('ask_cloud', 'Hand one job to a paid cloud helper. Costs money and leaves the PC, so {{USER}} approves each time. Only for jobs too big for the local brains, or when asked.', {
        provider: str('Which helper (id)'),
        task: str('The whole job. The helper can\'t see files or this chat.')
      }),
      check({ provider, task }) {
        const c = cloudProviders(cfg).find((x) => x.id === provider || x.name === provider);
        if (!c) throw new Error('That cloud helper isn\'t switched on.');
        return `Send this job to ${copyName(cfg, 'cloud:' + c.id, 'cloud helper')}, a cloud copy of Bob on ${c.name} (${c.model}). It costs money (usually cents for a job like this), and this text leaves your PC: "${String(task).slice(0, 300)}${String(task).length > 300 ? '…' : ''}"`;
      },
      async run({ provider, task }, { signal, emit }) {
        const c = cloudProviders(cfg).find((x) => x.id === provider || x.name === provider);
        const { text, usage } = await askCloud(c, String(task), signal);
        const used = usage.in != null ? ` (${usage.in} tokens in, ${usage.out} out)` : '';
        emit({ type: 'token', text: `\n\n**From ${copyName(cfg, 'cloud:' + c.id, 'cloud helper')} (${c.name}${used}):**\n\n${text}` });
        return text;
      },
      summary: ({ provider }) => `cloud helper: ${provider}`,
      alwaysAsk: true, // costs money and leaves the PC, so it asks even when Bob works without asking
      endsTurn: true
    };
  }

  // 1.5.127 Rented brains: Bob asks for the rented brain in his slot. The tool only shows the Hire it card; nothing is
  // spent until the owner presses it, and then the whole job runs again on the rented brain (brain.answerRent).
  t.hire_brain = {
    schema: fn('hire_brain', 'Offer to run this job on a rented online brain. Shows a card with the cost; nothing is hired until {{USER}} presses it. Only when the job is too big for the brains here, or when asked.', {
      why: str('One short line: why.')
    }, []),
    async run({ why }, ctx) {
      const r = ctx.brain?.offerRent?.(ctx, { why: String(why || '').slice(0, 200) });
      if (!r) return 'There is no rented brain in its slot (Equip Bob, Rented brain). Say so in one line and carry on here.';
      if (r.already) return 'The Hire it card is already under the chat. Don\'t call this again now.';
      return `A card with a "Hire it" button is now under this chat (${r.est}). Tell ${cfg.userName || 'the user'} in one line why this job needs the rented brain and that one press runs it there; stop after that and don't do the job here.`;
    },
    summary: () => 'offered the rented brain',
    endsTurn: true
  };

  t.make_diagram = diagramTool(); // 1.5.95 flowcharts and diagrams (diagram.js)
  t.save_as = saveAsTool(); // 1.5.95 keep something Bob made as another file type (save-as.js)
  return t;
}
