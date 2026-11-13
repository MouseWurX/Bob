// Bob's tools. Each tool has a JSON schema for the model, an optional approval check,
// and a run function. Anything risky goes through approval; the inn folder is Bob's own space.
import { appendText, readText, writeText } from './vault.js'; // 🔒 Lock my chats and memory
import { clashes, clashNote } from './memory-clash.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveFile, saveJson, oneWriter, readSaved } from './saving.js'; // items 229, 231, 233
import { isInside, insideAny, appDir, findOutput } from './config.js';
import { HATS } from './persona.js';
import { cloudHelpers, askCloud } from './cloud.js';
import { copyName } from './clan.js';
import { limitOn, readOnlyRoots, handOn } from './hands-settings.js';
import { listWorkflows, workshopDir } from './workshop.js';
import { bobHelp } from './self-help.js';
import { recallOn, tagLine } from './recall.js';
import { expiryOn, untilTag, fromTag } from './memory-more.js'; // memory items 87 and 88, off by default
import { diagramTool } from './diagram.js';
import { saveAsTool } from './save-as.js';
import { isPrivateHost } from './security-web.js';
import { selfWorkOn, hasCodeCopy, codeCopyRoot, codeCopyDir, gatherBrains, pickBigBrain, pickedMissing, selfCtx, selfWorkParts, SELF_STEPS, repoNamed, reposOf, baseOf } from './self-work.js';
import { runManaged } from './self-work-plan.js';
import { ownEntries } from './own-models.js';
import { ensureTool } from './self-work-tools.js';
import { catalogFileFor } from './llamacpp.js';
import { ctxLabel } from './model-ctx.js';
import { isDoc, docText, docTextFrom, OLD_EXT, MAX_DOC_BYTES } from './doc-text.js';
import { GIT_LOOKS, gitArgs, runGit, gitAnswer } from './git-look.js';
import { mainText, docKind, parseDdg, parseMojeek, resultLines, WEB_TIMEOUT_MS, MAX_DOC_DOWNLOAD } from './page-text.js';
import { docToolsOn } from './my-docs.js';
import { codeMap, linesAround } from './code-map.js';
import { backoffMs, engineFailKind, pause } from './retry.js'; // item 194

const MAX_READ = 20000;
// Runnable file types Bob won't write outside a project, on every platform (Windows, Mac and Linux kinds together).
const BLOCKED_EXT = new Set(['.exe', '.msi', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.js', '.mjs', '.cjs', '.jse', '.wsf', '.hta', '.scr', '.lnk', '.reg', '.dll', '.com', '.jar', '.sh', '.bash', '.zsh', '.py', '.pyw', '.command', '.desktop', '.app']);
// read_file refuses files over this many bytes: a multi-GB file would otherwise be read whole into memory.
const MAX_READ_BYTES = 20 * 1024 * 1024;
// fetch_page stops reading a page after this many bytes, and hands it over 15,000 characters at a time.
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_PAGE = 15000;
// Items 18 and 20: bytes as they are (a document), and the user's Stop together with a time limit on every look-up.
async function readBytes(res, max) {
  const parts = []; let n = 0;
  for await (const chunk of res.body || []) { parts.push(chunk); n += chunk.length; if (n >= max) break; }
  return Buffer.concat(parts).subarray(0, max);
}
export const webSignal = (signal, ms = WEB_TIMEOUT_MS) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));
// Item 194: a look-up that failed for a reason a second try can fix (the connection dropped, or the site said 429, 502,
// 503 or 504) goes once more, after a short wait with a bit of randomness (or the site's own Retry-After, up to 5 s).
// A time-out isn't tried again: it already waited long enough. Only for reading (GET), never for anything that acts.
export async function fetchRetry(url, opts = {}, signal, { fetchImpl = (...a) => fetch(...a), waitMs = () => backoffMs(0, { base: 1500 }) } = {}) {
  for (let i = 0; ; i++) {
    let r;
    try { r = await fetchImpl(url, { ...opts, signal: webSignal(signal) }); }
    catch (e) { if (signal?.aborted || i > 0 || e?.name === 'TimeoutError' || engineFailKind(e) !== 'dropped') throw e; await pause(waitMs(), signal); continue; }
    if (i === 0 && [429, 502, 503, 504].includes(r.status)) {
      const after = Number(r.headers?.get?.('retry-after'));
      try { await r.body?.cancel?.(); } catch {}
      await pause(Number.isFinite(after) && after > 0 ? Math.min(5000, after * 1000) : waitMs(), signal);
      continue;
    }
    return r;
  }
}
export async function readCapped(res, max) {
  const parts = []; let n = 0;
  for await (const chunk of res.body || []) { parts.push(chunk); n += chunk.length; if (n >= max) break; }
  return Buffer.concat(parts).subarray(0, max).toString('utf8');
}

// #48: a long page or file comes in parts, so Bob can read past the first piece instead of fetching the top again.
// part = 1, 2, 3 ...; find = a word or phrase: give the part it is in. The note says the size and the exact next call.
// Item 23 (Nov 11): search_files' text: plain words (any case), or /a pattern/ (with an i after it for any case).
// What an empty notice board read gives back: the layout to write it in.
const BOARD_EMPTY = '(The notice board is empty. No file yet.) Layout: "# Notice board, YYYY-MM-DD", "XP today: N", then sections Main quest (only one), Side quests, Daily chores, Later, Done, using "- [ ]" and "- [x]" items with time and XP estimates.';

// 1.5.223 PC check: a small brain rewrote the board as bare lines ("Apples / Pears / Plums"), losing the title,
// the ## sections, the "- [ ]" boxes and a done mark. shapeBoard puts the board's shape back, in code:
// - no "# " title: the board's title line (today's date) and its top lines (like "XP today") come back;
// - bare or plain-bullet lines become "- [ ]" items (bare lines only when nothing in it is boxed, so notes stay notes);
// - an item that was ticked off ([x]) keeps its tick when the same words come back;
// - with no ## sections, each item goes back under the section it was in, new ones under Side quests.
export function shapeBoard(oldText, content, day) {
  const itemOf = (l) => String(l).replace(/^\s*[-*+]\s*(?:\[[ x]\]\s*)?/i, '').replace(/^\s*\d+[.)]\s+/, '').replace(/\s+/g, ' ').trim();
  const isBox = (l) => /^\s*[-*+]\s*\[[ x]\]/i.test(l);
  const old = String(oldText || '').replace(/\r\n/g, '\n').split('\n');
  let lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const done = new Set(old.filter((l) => /^\s*[-*+]\s*\[x\]/i.test(l)).map((l) => itemOf(l).toLowerCase()));
  const anyBox = lines.some(isBox);
  lines = lines.map((l) => {
    if (!l.trim() || /^\s*(#|>|\||<|```|XP today)/i.test(l)) return l;
    if (isBox(l)) return done.has(itemOf(l).toLowerCase()) ? l.replace(/\[ \]/, '[x]') : l;
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l) || !anyBox) { const it = itemOf(l); return it ? `- [${done.has(it.toLowerCase()) ? 'x' : ' '}] ${it}` : l; }
    return l;
  });
  if (!lines.some((l) => /^##\s/.test(l)) && old.some((l) => /^##\s/.test(l))) {
    const home = new Map(); let sec = '';
    for (const l of old) { if (/^##\s/.test(l)) sec = l.trim(); else if (isBox(l) && sec) home.set(itemOf(l).toLowerCase(), sec); }
    const order = [...new Set(old.filter((l) => /^##\s/.test(l)).map((l) => l.trim()))];
    if (!order.some((h) => /side quests/i.test(h))) order.push('## Side quests');
    const side = order.find((h) => /side quests/i.test(h));
    const by = new Map(order.map((h) => [h, []])); const rest = [];
    for (const l of lines) { if (isBox(l)) by.get(home.get(itemOf(l).toLowerCase()) || side).push(l); else if (l.trim()) rest.push(l); }
    lines = [...rest];
    for (const h of order) if (by.get(h).length) lines.push('', h, ...by.get(h));
  }
  if (!lines.some((l) => /^#\s/.test(l))) {
    const top = []; for (const l of old) { if (/^##\s/.test(l) || isBox(l)) break; if (/^#\s/.test(l)) top.push(`# Notice board, ${day}`); else top.push(l); }
    while (top.length && !top[top.length - 1].trim()) top.pop();
    while (lines.length && !lines[0].trim()) lines.shift();
    lines = [...(top.length ? top : [`# Notice board, ${day}`]), '', ...lines];
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
}

export function searchMatcher(text) {
  const t = String(text ?? '');
  const m = t.match(/^\/(.+)\/([i]?)$/s);
  if (m) {
    let re;
    try { re = new RegExp(m[1], m[2] || 'i'); } catch (e) { throw new Error(`That pattern doesn't work: ${e.message}`); }
    return (s) => re.test(s);
  }
  const needle = t.toLowerCase();
  if (needle.length < 2) throw new Error('Give me at least 2 characters to look for.');
  return (s) => s.toLowerCase().includes(needle);
}
// "*.cs", "*.md, *.txt", "notes*" -> a test on file names; nothing -> null (the usual text files).
export function filePattern(files) {
  const parts = String(files || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 8);
  if (!parts.length) return null;
  const one = (g) => g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^(?:${parts.map(one).join('|')})$`, 'i');
}
// Item 22 (Nov 11): edit_file takes several changes to one file in one call, all or none, on one card.
export function editList({ find, replace, more } = {}) {
  const list = [{ find, replace }, ...(Array.isArray(more) ? more : [])].slice(0, 20);
  return list.map((e) => ({ find: String(e?.find ?? ''), replace: String(e?.replace ?? '') }));
}
// Each change in turn, on the text as the earlier ones left it. Throws, naming the change, when one doesn't fit.
export function applyEdits(body, edits) {
  let out = String(body);
  edits.forEach((e, i) => {
    const which = edits.length > 1 ? ` (change ${i + 1} of ${edits.length}; nothing was changed)` : '';
    const count = e.find ? out.split(e.find).length - 1 : 0;
    if (!count) throw new Error(`The find text isn't in the file${which}. Read the file again and copy the text exactly.`);
    if (count > 1) throw new Error(`The find text appears ${count} times${which}. Include more surrounding lines so it is unique.`);
    out = out.replace(e.find, () => e.replace);
  });
  return out;
}

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

export function today(cfg, at = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}

// Item 26 list_folder: folders first (by name), then files in the order asked, each with size and date; "and N more"
// when there are more than max. With "only", folders stay so the brain can look inside them.
export const LIST_MAX = 300;
export function listRows(rows, { sort = 'name', max = LIST_MAX, day = (ms) => new Date(ms).toISOString().slice(0, 10) } = {}) {
  const folders = rows.filter((r) => r.folder).sort((a, b) => a.name.localeCompare(b.name));
  const files = rows.filter((r) => !r.folder).sort(sort === 'newest' ? (a, b) => b.at - a.at : sort === 'biggest' ? (a, b) => b.size - a.size : (a, b) => a.name.localeCompare(b.name));
  const all = sort === 'name' || !sort ? [...folders, ...files] : [...files, ...folders];
  const shown = all.slice(0, max).map((r) => (r.folder ? `[folder] ${r.name}` : `${r.name} (${r.size >= 1e6 ? `${(r.size / 1e6).toFixed(1)} MB` : `${Math.round(r.size / 1024)} KB`}${r.at ? `, ${day(r.at)}` : ''})`));
  if (!shown.length) return '(empty folder)';
  return all.length > max ? `${shown.join('\n')}\n(and ${all.length - max} more not shown: ask with only or sort to narrow it)` : shown.join('\n');
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
  // Tool sets, logic arguments: ~ is the home folder; a path that isn't full says what the home folder really is.
  if (/^~(?:[\\/]|$)/.test(p)) p = path.join(os.homedir(), p.slice(1));
  if (!path.isAbsolute(p)) throw new Error(`Please give a full path. The home folder is ${os.homedir()}, so like ${path.join(os.homedir(), 'Documents', path.basename(p) || 'notes.txt')}`);
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
// Tool sets, logic arguments: a reminder's time as local YYYY-MM-DDTHH:mm from the other ways brains write it
// ("2026-11-14 09:00", seconds, a trailing Z or offset (taken as the local time they wrote), or a date and a time
// apart). '' when there is no time at all.
export function reminderTime(time, date) {
  let t = String(time ?? '').trim();
  const d = String(date ?? '').trim();
  if (!t && /^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}/.test(d)) t = d;
  else if (/^\d{1,2}:\d{2}/.test(t) && /^\d{4}-\d{2}-\d{2}$/.test(d)) t = `${d}T${t}`;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
  return m ? `${m[1]}T${m[2].padStart(2, '0')}:${m[3]}` : t;
}

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

// A reminders file that won't read is set aside (not read as empty and written over); a list is the only shape kept.
export const remindersFile = (cfg) => path.join(cfg.dataDir, 'reminders.json');
export function loadReminders(cfg, { log } = {}) {
  return readSaved(remindersFile(cfg), [], { check: Array.isArray, log: log || ((t) => console.error(`Bob: ${t}`)) });
}
export function saveReminders(cfg, list) {
  saveJson(remindersFile(cfg), list, 2);
}
// Read, change and save the list as one step (item 231): another Bob on the same folder waits its turn.
export const changeReminders = (cfg, fn) => oneWriter(remindersFile(cfg), () => { const list = loadReminders(cfg); const r = fn(list); saveReminders(cfg, list); return r; });

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
    // The board's layout comes with an empty board, not in every prompt (less context is better, 1.5.207).
    // Tool sets (tool-sets.js), logic arguments: add puts one item on the board without rewriting it (rewriting the
    // whole board was where small brains lost items).
    // Nov 13 (120B interview): "read it first" made brains read and stop. add and done need no read.
    schema: fn('notice_board', "{{USER}}'s notice board (to-do list). add = new items; done = tick one off; write = the whole board.", {
      action: str('read, add, done or write', { enum: ['read', 'add', 'done', 'write'] }),
      content: str('add: items, one per line. done: the item. write: the whole board, in Markdown.'),
      drop: { type: 'boolean', description: 'write: true to take items off.' }
    }, ['action']),
    async run({ action, content, drop }) {
      const file = cfg.noticeBoard;
      const itemOf = (l) => String(l).replace(/^\s*[-*+]\s*(?:\[[ x]\]\s*)?/i, '').replace(/^\s*\d+[.)]\s+/, '').replace(/\s+/g, ' ').trim();
      if (action === 'add') {
        // 1.5.222 PC check: several to-dos at once come as several lines, each its own item.
        const items = [...new Set(String(content || '').replace(/\r\n/g, '\n').split('\n').filter((l) => !/^\s*#/.test(l)).map(itemOf).filter(Boolean))];
        if (!items.length) throw new Error('No item given: put the to-do in content.');
        return oneWriter(file, () => {
          const old = fs.existsSync(file) ? readText(file) : `# Notice board, ${today(cfg)}\n\n## Side quests\n`;
          const lines = old.replace(/\r\n/g, '\n').split('\n');
          const added = [], had = [];
          for (const item of items) {
            if (lines.some((l) => /^\s*[-*]\s*\[[ x]\]/i.test(l) && itemOf(l).toLowerCase() === item.toLowerCase())) { had.push(item); continue; }
            // Under Side quests when there is one, else at the end.
            const at = lines.findIndex((l) => /^#+\s*side quests/i.test(l));
            let end = at < 0 ? lines.length : at + 1;
            if (at >= 0) while (end < lines.length && !/^#+\s/.test(lines[end])) end++;
            while (end > 0 && !lines[end - 1].trim()) end--;
            lines.splice(end, 0, `- [ ] ${item}`);
            added.push(item);
          }
          if (!added.length) return `Already on the notice board: ${had.join('; ')}. Nothing added.`;
          saveFile(file, lines.join('\n').replace(/\n*$/, '\n'));
          return `Added to the notice board: ${added.join('; ')}.${had.length ? ` Already there: ${had.join('; ')}.` : ''} It has ${lines.filter((l) => /^\s*-\s*\[ \]/.test(l)).length} open items now.`;
        });
      }
      if (action === 'done') {
        const item = String(content || '').replace(/\s+/g, ' ').replace(/^[-*]\s*(?:\[[ x]\]\s*)?/i, '').trim().toLowerCase();
        if (!item) throw new Error('Which item? Put its words in content.');
        return oneWriter(file, () => {
          if (!fs.existsSync(file)) return 'The notice board is empty. Nothing ticked off.';
          const lines = readText(file).replace(/\r\n/g, '\n').split('\n');
          const open = lines.map((l, i) => ({ l, i })).filter(({ l }) => /^\s*-\s*\[ \]/.test(l));
          const words = (l) => l.replace(/^\s*-\s*\[ \]\s*/, '').trim();
          const hit = open.find(({ l }) => words(l).toLowerCase() === item) || open.filter(({ l }) => words(l).toLowerCase().includes(item)).reduce((a, b, _, all) => (all.length === 1 ? b : a), null);
          if (!hit) return `No open item matches "${content}". Open items: ${open.map(({ l }) => words(l)).slice(0, 15).join('; ') || 'none'}. Nothing ticked off.`;
          lines[hit.i] = lines[hit.i].replace('[ ]', '[x]');
          saveFile(file, lines.join('\n').replace(/\n*$/, '\n'));
          return `Ticked off on the notice board: ${words(hit.l)}. ${open.length - 1} open items left.`;
        });
      }
      if (action !== 'write') return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : BOARD_EMPTY;
      if (!content) throw new Error('No board content given. To put one item on, use action add.');
      // 1.5.222 PC check: a small brain wrote a fresh board without reading it and wiped the items and headings on it.
      // write never drops an open item unless drop is true. 1.5.223: refusing made Bob stop and ask, so instead the
      // open items it left out go back on (under Side quests) and the board is saved, with a note saying so.
      content = shapeBoard(fs.existsSync(file) ? readText(file) : '', content, today(cfg));
      let kept = [];
      if (drop !== true && fs.existsSync(file)) {
        const keep = new Set(String(content).replace(/\r\n/g, '\n').split('\n').map((l) => itemOf(l).toLowerCase()).filter(Boolean));
        kept = [...new Set(readText(file).replace(/\r\n/g, '\n').split('\n').filter((l) => /^\s*[-*]\s*\[ \]/.test(l)).map(itemOf).filter((i) => i && !keep.has(i.toLowerCase())))];
        if (kept.length) {
          const lines = String(content).replace(/\r\n/g, '\n').split('\n');
          const at = lines.findIndex((l) => /^#+\s*side quests/i.test(l));
          if (at < 0) { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); lines.push('', '## Side quests'); }
          let end = at < 0 ? lines.length : at + 1;
          if (at >= 0) while (end < lines.length && !/^#+\s/.test(lines[end])) end++;
          while (end > 0 && !lines[end - 1].trim() && end - 1 > at) end--;
          lines.splice(end, 0, ...kept.map((i) => `- [ ] ${i}`));
          content = lines.join('\n').replace(/\n*$/, '\n');
        }
      }
      const keptNote = kept.length ? ` Kept ${kept.length} open item${kept.length === 1 ? '' : 's'} your board left out (${kept.slice(0, 5).join('; ')}${kept.length > 5 ? '; …' : ''}). To tick one off, use action done; to take items off for good, write again with drop true.` : '';
      return oneWriter(file, () => { // item 231: one writer at a time
      if (fs.existsSync(file)) {
        const old = fs.readFileSync(file, 'utf8');
        const m = old.match(/Notice board,?\s*(\d{4}-\d{2}-\d{2})/);
        if (m && m[1] !== today(cfg)) {
          const arch = path.join(cfg.archiveDir, `${m[1]}.md`);
          if (!fs.existsSync(arch)) saveFile(arch, old);
        }
      }
      saveFile(file, content);
      return `Notice board saved: ${String(content).split(/\r?\n/).filter((l) => /^\s*-\s*\[ \]/.test(l)).length} open items.${keptNote}`;
      });
    },
    summary: ({ action }) => `notice board: ${action}`
  };

  t.remember = {
    // 1.5.79: with "Relevant memories only" on, a fact can go to one project's memory bank (the project field
    // is only offered then, so the tool costs nothing extra while the setting is off).
    get schema() {
      const banks = recallOn(cfg) ? Object.keys(cfg.projects || {}) : [];
      return fn('remember', 'Save a lasting fact about {{USER}}, like a preference or a plan. Never secrets or passwords.', {
        fact: str('One short sentence.'),
        replaces: str('Optional: the earlier memory this corrects, word for word, once the user said which is right.'),
        ...(recallOn(cfg) ? { project: str(`Only for a fact about one project: its name${banks.length ? ` (${banks.join(', ')})` : ''}. Leave out for anything general.`) } : {}),
        // "Expiring memories" (memory-more.js): only offered while that switch is on.
        ...(expiryOn(cfg) ? { keep: str('Only when {{USER}} says how long: day, week, month, "3 days", or a date (YYYY-MM-DD). Leave out to keep it.') } : {})
      }, ['fact']);
    },
    async run({ fact, project, replaces, keep }, ctx = {}) {
      if (!fact) throw new Error('Nothing to remember.');
      const clean = String(fact).replace(/\s+/g, ' ').trim();
      let before = '';
      try { before = readText(cfg.memoryFile); } catch {}
      // Item 16 (memory-clash.js): an earlier line this corrects goes (word for word only); others that may disagree are named.
      let dropped = '';
      if (replaces && before) {
        const want = String(replaces).replace(/^\s*-\s*/, '').trim();
        const lines = before.replace(/\r\n/g, '\n').split('\n');
        const at = lines.findIndex((l) => l.replace(/^\s*-\s*/, '').trim() === want);
        if (at >= 0) { dropped = lines[at]; lines.splice(at, 1); writeText(cfg, cfg.memoryFile, lines.join('\n')); before = lines.join('\n'); }
      }
      const clash = dropped ? [] : clashes(clean, before);
      const until = untilTag(cfg, keep, today(cfg));
      const line = `- ${recallOn(cfg) ? tagLine(`${clean} (${today(cfg)})`, project) : `${clean} (${today(cfg)})`}${until}${fromTag(cfg, ctx.sessionId)}\n`;
      // The second call (with replaces) after a clash doesn't add the fact a second time.
      const already = before.replace(/\r\n/g, '\n').split('\n').some((l) => l.replace(/^\s*-\s*/, '').replace(/\s*\[[^\]]*\]\s*$/, '').replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '').trim() === clean);
      if (!already) appendText(cfg, cfg.memoryFile, line);
      const done = recallOn(cfg) && project ? `Remembered, in the ${String(project).replace(/[\][]/g, '').trim()} memory bank.` : 'Remembered.';
      const till = until ? ` I'll stop reading it after ${until.match(/\d{4}-\d{2}-\d{2}/)[0]}.` : '';
      return `${done}${till}${dropped ? ' The earlier line it corrects is gone.' : ''}${clashNote(clash, cfg.userName || 'the user')}`;
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
        id: str('cancel: the id from list.'),
        urgent: { type: 'boolean', description: 'add: true only if the user says urgent (shows in quiet hours).' }
      }, ['action']);
    },
    async run({ action, time, text, id, urgent, every, date }) {
      if (action === 'add') {
        if (!text) throw new Error('What should I remind about?');
        // Tool sets (tool-sets.js), logic arguments: no time is a to-do, not a reminder; and the usual other ways
        // to write a time are read as the local time they mean.
        time = reminderTime(time, date);
        if (!time) throw new Error('No time given. A to-do with no set time goes on the notice board (notice_board, action add). For a reminder, give time as local YYYY-MM-DDTHH:mm.');
        const at = zonedToEpoch(time, cfg.timeZone);
        if (at < Date.now() - 60000) throw new Error('That time has already passed.');
        const rep = every && cfg.moreTools?.repeatReminders === true && REPEATS.includes(every) ? every : '';
        if (every && !rep && cfg.moreTools?.repeatReminders !== true) throw new Error('Repeating reminders are off. They\'re in Settings, How Bob works, 🧰 More tools: "Let reminders repeat". Set a one-off one, and say so.');
        const r = { id: Math.random().toString(36).slice(2, 8), at, local: time, text: String(text).slice(0, 300), ...(rep ? { every: rep } : {}), ...(urgent === true || urgent === 'true' ? { urgent: true } : {}) };
        if (rep) { r.local = firstRepeat(time, rep); r.at = zonedToEpoch(r.local, cfg.timeZone); }
        changeReminders(cfg, (list) => { list.push(r); }); // item 231: one read-change-save step
        return `Reminder ${r.id} set for ${r.local}${rep ? `, then every ${rep}` : ''}${r.urgent ? ' (urgent)' : ''}: ${r.text}`;
      }
      if (action === 'cancel') {
        const gone = changeReminders(cfg, (list) => { const at = list.findIndex((r) => r.id === id); if (at < 0) return null; return list.splice(at, 1)[0]; });
        if (!gone) throw new Error('No reminder with that id. Call reminders with action list to see the ids.');
        return `Cancelled reminder ${gone.id} (${gone.local}): ${gone.text}`;
      }
      const list = loadReminders(cfg);
      return list.length ? list.map((r) => `${r.id}: ${r.local}${r.every ? ` (every ${r.every})` : ''} - ${r.text}`).join('\n') : 'No reminders set.';
    },
    summary: ({ action, time, every }) => `reminder: ${action}${time ? ' ' + time : ''}${every ? ` (every ${every})` : ''}`
  };

  t.list_folder = {
    schema: fn('list_folder', "List the files in a folder. {{USER}}'s home folder is {{HOME}}; never guess another.", {
      path: str('Full folder path.'),
      sort: str('Optional.', { enum: ['name', 'newest', 'biggest'] }),
      only: str('Optional: like *.pdf')
    }, ['path']),
    async run({ path: p, sort, only }) {
      const dir = resolveUserPath(p);
      if (!insideAny(cfg.readRoots, dir)) throw new Error(`I'm not allowed to look in ${dir}. Allowed: ${cfg.readRoots.join('; ')}`);
      if (isSensitive(cfg, dir)) throw new Error(SECRET_MSG);
      // Item 26 (Nov 11): dates, sorting and a file filter, and it says how many weren't shown instead of cutting quietly.
      const want = filePattern(only);
      const rows = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !isSensitive(cfg, path.join(dir, e.name)) && (!want || e.isDirectory() || want.test(e.name))).map((e) => {
        let st = null;
        try { st = fs.statSync(path.join(dir, e.name)); } catch {}
        return { name: e.name, folder: e.isDirectory(), size: st && !e.isDirectory() ? st.size : 0, at: st ? st.mtimeMs : 0 };
      });
      return listRows(rows, { sort, max: LIST_MAX, day: (ms) => today({ timeZone: cfg.timeZone }, ms) });
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
      // 1.5.222 PC check: "read notes.txt" made a small brain guess the home folder and get refused. A bare file name is
      // looked for in the folders Bob may read, and a refusal or a missing file says where those are (one line, only then).
      const bare = typeof p === 'string' && p.trim() && !/[\\/]/.test(p) && !/^~/.test(p.trim());
      const found = bare ? (cfg.readRoots || []).map((r) => path.join(r, p.trim())).find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }) : null;
      const where = () => ((cfg.readRoots || []).length ? ` Files I can read are in: ${cfg.readRoots.join('; ')}.` : '');
      if (bare && !found && (cfg.readRoots || []).length) throw new Error(`There's no file called ${p.trim()} in the folders I can read. Give its full path.${where()}`);
      const file = found || resolveUserPath(p);
      if (!insideAny(cfg.readRoots, file)) throw new Error(`I'm not allowed to read ${file}.${where()}`);
      if (isSensitive(cfg, file)) throw new Error(SECRET_MSG);
      const size = fs.statSync(file).size;
      // "Read and search documents" (my-docs.js): Word, Excel, PowerPoint, OpenDocument, e-books, RTF and PDF as text.
      const ext = path.extname(file).slice(1).toLowerCase();
      if (docToolsOn(cfg) && isDoc(file)) {
        if (size > MAX_DOC_BYTES) throw new Error(`That file is ${Math.round(size / 1048576)} MB. I read documents up to ${MAX_DOC_BYTES / 1048576} MB.`);
        const words = docText(file);
        return pieceOf(words || '(That document has no words in it.)', { part, find }, MAX_READ, 'read_file again with the same path and');
      }
      if (size > MAX_READ_BYTES) throw new Error(`That file is ${Math.round(size / 1048576)} MB, too big to read as text. I read files up to 20 MB.`);
      const buf = fs.readFileSync(file);
      if (buf.subarray(0, 4096).includes(0) || (isDoc(file) && ext !== 'rtf') || OLD_EXT.includes(ext)) {
        if (isDoc(file) && !docToolsOn(cfg)) return `(That's a document, not plain text. To read it, ${cfg.userName || 'the user'} can turn on "Read and search documents" in Settings, How Bob works, or the Office documents Hand; say so in one line.)`;
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
  // Item 25 (Nov 11): a question with choices on a card, instead of a question buried in a reply that ends the job.
  t.ask_user = {
    schema: fn('ask_user', 'Ask {{USER}} one question with 2 to 6 choices on a card and wait. Only when a wrong guess would waste the job.', {
      question: str('Short.'),
      choices: { type: 'array', items: { type: 'string' }, description: '2 to 6.' }
    }),
    async run({ question, choices }, ctx) { return ctx.brain.askUser({ question, choices }, ctx); },
    summary: ({ question }) => `ask: ${String(question || '').slice(0, 80)}`
  };

  // Item 24 (git-look.js): what changed in a project, read-only, no card.
  t.git_look = {
    schema: fn('git_look', 'See what changed in a project folder with git: status (changed files), changes (line by line) or history (recent commits). Read-only; never for running, building, testing or installing.', {
      what: str('status, changes or history', { enum: GIT_LOOKS }),
      project: str('Optional: project name. Leave out for the main project.', { enum: Object.keys(cfg.projects || {}) }),
      folder: str('Optional: a full folder path instead.'),
      file: str('Optional: one file, for changes or history.')
    }, ['what']),
    async run({ what, project, folder, file }, ctx = {}) {
      const all = cfg.projects || {};
      if (project && !all[project]) throw new Error(`Unknown project. I know: ${Object.keys(all).join(', ') || 'none yet'}`);
      const root = folder ? resolveUserPath(folder) : all[project] || all[cfg.defaultProject] || Object.values(all)[0];
      if (!root) throw new Error('No project is set up yet. Name a folder.');
      if (!insideAny(cfg.readRoots, root)) throw new Error(`I'm not allowed to look in ${root}.`);
      if (isSensitive(cfg, root) || (file && isSensitive(cfg, path.resolve(root, String(file))))) throw new Error(SECRET_MSG);
      return gitAnswer(what, await (ctx.runGit || runGit)(gitArgs(what, file), root));
    },
    summary: ({ what, project, folder, file }) => `git ${what}: ${folder || project || 'main project'}${file ? ` (${file})` : ''}`
  };

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
      const head = `${exists ? 'Overwrite' : 'Create'} ${file} (${Buffer.byteLength(content || '')} bytes)`;
      // Item 174 (Nov 12): overwriting shows what really changes, like an edit does, so the card shows the real change.
      if (!exists) return head;
      let was = '';
      try { if (fs.statSync(file).size <= 2_000_000) was = fs.readFileSync(file, 'utf8'); } catch { return head; }
      const d = lineChanges(was, String(content || ''));
      if (!d) return { text: `${head}: it already holds exactly this`, diff: '' };
      return { text: `${head}: ${d.summary}`, diff: d.diff };
    },
    approvalGroup: 'edit',
    async run({ path: p, content }) {
      const file = resolveUserPath(p);
      backup(file);
      saveFile(file, content ?? ''); // whole or not at all (item 229)
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
      saveFile(file, '\ufeff' + csv.trim() + '\r\n');
      const rows = csv.trim().split(/\r?\n/).length;
      return `Saved ${file} (${rows} lines including the header). Double-click it to open in Excel.`;
    },
    summary: ({ name }) => `ledger: ${name}`
  };

  // Bob knows his own settings and features (self-help.js): the same Help text as the window, plus what's set now.
  t.bob_help = {
    schema: fn('bob_help', "Look up how you (Bob) work: settings, switches, pages, features, where each is and what is set now. For a setting, feature or one of your own words (Bob-Net, the Lab, fNRI, the Forge, the moot, Hands), look here first, before searching files or the web, and name the exact place to press.", {
      topic: str('What to look up, like "web search switch".')
    }),
    async run({ topic }) { return bobHelp(cfg, String(topic || '')); },
    summary: ({ topic }) => `Help: ${topic || 'settings'}`
  };

  t.web_search = {
    schema: fn('web_search', 'Search the web. Returns titles, links and snippets. Operators work: "exact phrase", -word, site:, filetype:, intitle:, OR.', { query: str('Search words.'), when: str('Optional: only the past day, week, month or year.', { enum: ['day', 'week', 'month', 'year'] }) }, ['query']),
    async run({ query, when }, { signal }) {
      const df = { day: 'd', week: 'w', month: 'm', year: 'y' }[String(when || '').toLowerCase()];
      const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Bob/0.1' };
      // Item 20: a look-up that hangs stops on its own after WEB_TIMEOUT_MS. Item 21: when DuckDuckGo's plain page gives
      // nothing (it changed, or it turned Bob away), Mojeek is asked instead, and the answer says so.
      let list = [], why = '';
      try {
        const res = await fetchRetry('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query) + (df ? `&df=${df}` : ''), { headers: UA }, signal);
        if (res.ok) list = parseDdg(await res.text()); else why = `DuckDuckGo answered ${res.status}`;
      } catch (e) { if (signal?.aborted) throw e; why = e.name === 'TimeoutError' ? 'DuckDuckGo took too long' : `DuckDuckGo: ${e.message}`; }
      if (list.length) return resultLines(list);
      try {
        const res = await fetchRetry('https://www.mojeek.com/search?q=' + encodeURIComponent(query), { headers: UA }, signal);
        if (res.ok) list = parseMojeek(await res.text());
      } catch (e) { if (signal?.aborted) throw e; }
      if (list.length) return `(From Mojeek: ${why || 'DuckDuckGo found nothing'}${df ? '; no date filter there' : ''}.)\n${resultLines(list)}`;
      return 'No results (or the search pages changed). Try different words.';
    },
    summary: ({ query, when }) => `search: ${query}${when ? ` (past ${when})` : ''}`
  };

  t.fetch_page = {
    schema: fn('fetch_page', 'Read a web page, PDF or document online as text. A long one comes in parts; each part says how to get the next.', {
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
        res = await fetchRetry(u, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Bob/0.1' }, redirect: 'manual' }, signal);
        const next = res.status >= 300 && res.status < 400 && res.headers.get('location');
        if (!next) break;
        if (hop >= 5) throw new Error('That link redirects too many times.');
        u = new URL(next, u);
      }
      const type = res.headers.get('content-type') || '';
      // Item 18: a PDF or Office document is read like one on the drive (doc-text.js), up to MAX_DOC_DOWNLOAD.
      const doc = docKind(type, u);
      if (doc) {
        const buf = Buffer.from(await readBytes(res, MAX_DOC_DOWNLOAD));
        let words = '';
        try { words = docTextFrom(buf, doc); } catch (e) { return `That link is a .${doc} file I couldn't read: ${e.message}`; }
        if (!words.trim()) return `That link is a .${doc} file with no text in it (perhaps only pictures of pages).`;
        return pieceOf(words, { part, find }, MAX_PAGE, 'fetch_page again with the same url and');
      }
      if (!/text|html|json|xml/.test(type)) return `That link is a ${type || 'file'}, not a page or a document I read. I won't download it.`;
      const raw = await readCapped(res, MAX_PAGE_BYTES);
      const text = isPlain(type, u) ? raw : mainText(raw); // item 19: the page's own words, not its menus
      return pieceOf(text, { part, find }, MAX_PAGE, 'fetch_page again with the same url and');
    },
    summary: ({ url, part, find }) => `read page: ${url}${find ? ` (looking for ${find})` : part > 1 ? ` (part ${part})` : ''}`
  };

  t.make_image = {
    schema: fn('make_image', "Paint a picture, or change one (give a reference). Also posters, banners, logos and thumbnails.", {
      prompt: str('New picture: the full prompt. Edit: only what to change, like "Swap his hat for a tiara", or it gets repainted.'),
      width: { type: 'integer', description: 'Default 1024. Leave out for edits.' },
      height: { type: 'integer', description: 'Default 1024. Leave out for edits.' },
      reference: { type: 'array', items: { type: 'string' }, description: 'Up to 4 pictures to edit or paint from: a shelf or attached name, "last" (your newest) or a painted file.' },
      mode: str('With a reference: keep_look = edit it, same look (default); start_from = rework the picture (the look can drift); new = paint anew.', { enum: ['keep_look', 'start_from', 'new'] }),
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
      hat: str('tinker = code and bugs; ledger = data, spreadsheets; scout = web research with sources; painter = picture/video prompts; reviewer = a careful second look', { enum: Object.keys(HATS) }),
      task: str('The whole job as given, with any details or pasted text. The workbench finds files itself; don\'t ask for paths first.')
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
      const where = 'Settings, How Bob works, "Work on repositories"';
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
      let gitFile = ''; // Nov 13: helpers' own copies need Git (self-work-plan.js)
      if (runOn) {
        const need = [['git', 'Git'], ...(repo.own || fs.existsSync(path.join(codeCopyDir(cfg, repo), 'package.json')) ? [['node', 'Node.js']] : [])];
        for (const [tool, label] of need) {
          try {
            const t = await ensureTool(cfg, tool, { signal: ctx.signal, tick: () => {} });
            if (tool === 'git') gitFile = t.file || 'git';
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
      try { return await runManaged(ctx.brain, ctx, { cfg, repo, job, ...parts, runOn, git: gitFile, force: { model: pick.id, cpu: false, think: true, ctx: want, longRun: true, maxSteps: SELF_STEPS } }); }
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
    schema: fn('search_files', "Search the text in {{USER}}'s files: projects, or a folder. Returns matching lines with file and line number.", {
      project: str('Optional: project name. Leave out unless {{USER}} named one: it searches all.', { enum: Object.keys(cfg.projects || {}) }),
      folder: str('Optional: a full folder path to search instead of the projects.'),
      text: str('Text to look for. Starts and ends with / for a pattern, like /todo|fixme/.'),
      files: str('Optional: which files, like *.cs or *.md.')
    }, ['text']),
    async run({ project, folder, text, files }) {
      const all = cfg.projects || {};
      if (project && !all[project]) throw new Error(`Unknown project. I know: ${Object.keys(all).join(', ')}`);
      // Item 23 (Nov 11): any folder Bob may read, a file pattern, and /patterns/ as well as plain words.
      if (folder) {
        const dir = resolveUserPath(folder);
        if (!insideAny(cfg.readRoots, dir)) throw new Error(`I'm not allowed to look in ${dir}. Allowed: ${cfg.readRoots.join('; ')}`);
        if (isSensitive(cfg, dir)) throw new Error(SECRET_MSG);
      }
      // 1.5.34: the main project (Settings > Projects) is searched first.
      const roots = folder ? [resolveUserPath(folder)] : project ? [all[project]] : [...new Set([all[cfg.defaultProject], ...Object.values(all)].filter(Boolean))];
      const match = searchMatcher(text);
      const want = filePattern(files);
      if (!roots.length) throw new Error('No projects are set up yet, so there\'s nothing to search. I\'ll look in a folder instead: tell me which one, or I\'ll start with Documents. (For you, Bob: use list_folder and read_file. Projects live under "projects" in config.json; there is no switch for them in the app yet.)');
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
          if (!(want ? want.test(e.name) : TEXT_EXT.test(e.name)) || isSensitive(cfg, full)) continue;
          scanned++;
          let body;
          try { if (fs.statSync(full).size > 1e6) continue; body = fs.readFileSync(full, 'utf8'); } catch { continue; }
          if (!match(body)) continue;
          body.split(/\r?\n/).forEach((line, i) => {
            if (hits.length < 60 && match(line)) hits.push(`${full}:${i + 1}: ${line.trim().slice(0, 200)}`);
          });
        }
      };
      for (const root of roots) walk(root);
      return hits.length ? hits.join('\n') : `No matches in ${scanned} files.`;
    },
    summary: ({ project, folder, text, files }) => `search ${folder || project || 'all projects'}${files ? ` (${files})` : ''} for "${text}"`
  };

  t.edit_file = {
    schema: fn('edit_file', "Replace exact text in a file. find must appear exactly once (add nearby lines to make it unique); more changes to the same file go in more. {{USER}} approves each change.", {
      path: str('Full file path.'),
      find: str('The exact text, copied from the file.'),
      replace: str('The new text.'),
      more: { type: 'array', description: 'Optional: more changes, in order, all or none.', items: { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'] } }
    }, ['path', 'find', 'replace']),
    approvalGroup: 'edit',
    check({ path: p, find, replace, more }) {
      const file = resolveUserPath(p);
      if (isSensitive(cfg, file)) throw new Error(SECRET_MSG);
      if (BLOCKED_EXT.has(path.extname(file).toLowerCase()) && !projectOf(file)) throw new Error('I don\'t edit program or script files outside a project.');
      if (insideAny(readOnlyRoots(cfg), file)) throw new Error(`${file} is in a read-only project.`);
      if (!insideAny(cfg.readRoots, file)) throw new Error('I\'m not allowed to edit files there.');
      if (!fs.existsSync(file)) throw new Error('That file doesn\'t exist. Use write_file to create it.');
      const edits = editList({ find, replace, more });
      applyEdits(fs.readFileSync(file, 'utf8'), edits); // throws the plain reason when one doesn't fit
      const clip = (s) => (s.length > 700 ? s.slice(0, 700) + '\n...' : s);
      const one = (e) => `- ${clip(e.find).replace(/\n/g, '\n- ')}\n+ ${clip(e.replace).replace(/\n/g, '\n+ ')}`;
      return { text: edits.length > 1 ? `Edit ${file} (${edits.length} changes)` : `Edit ${file}`, diff: edits.map(one).join('\n\n') };
    },
    async run({ path: p, find, replace, more }) {
      const file = resolveUserPath(p);
      const edits = editList({ find, replace, more });
      const out = applyEdits(fs.readFileSync(file, 'utf8'), edits);
      backup(file);
      saveFile(file, out);
      return `Edited ${file}${edits.length > 1 ? ` (${edits.length} changes)` : ''}. (Backup kept in the inn.)`;
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
      if (!r) return 'There is no rented brain in its slot (Settings, Brains, Rented brain). Say so in one line and carry on here.';
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

// Item 174 (Nov 12): what overwriting a file really changes, for the card: the lines between the same start and the same
// end, as - and + lines (cut short), and a count. null when nothing changes.
export function lineChanges(before, after, { show = 12 } = {}) {
  const a = String(before ?? '').replace(/\r\n/g, '\n').split('\n'), b = String(after ?? '').replace(/\r\n/g, '\n').split('\n');
  if (a.join('\n') === b.join('\n')) return null;
  let top = 0; while (top < a.length && top < b.length && a[top] === b[top]) top++;
  let end = 0; while (end < a.length - top && end < b.length - top && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const gone = a.slice(top, a.length - end), added = b.slice(top, b.length - end);
  const clip = (l) => (l.length > 200 ? l.slice(0, 200) + '…' : l);
  const lines = [...gone.slice(0, show).map((l) => `- ${clip(l)}`), ...(gone.length > show ? [`- ... ${gone.length - show} more`] : []),
    ...added.slice(0, show).map((l) => `+ ${clip(l)}`), ...(added.length > show ? [`+ ... ${added.length - show} more`] : [])];
  return { summary: `${gone.length} line${gone.length === 1 ? '' : 's'} out, ${added.length} in, from line ${top + 1}`, diff: `@@ line ${top + 1}\n${lines.join('\n')}`, gone: gone.length, added: added.length, from: top + 1 };
}
