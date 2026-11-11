// 👀 "Let Bob watch web pages" (Settings, How Bob works, 🧰 More tools; off by default).
// Ask "tell me when the price on this page changes" and Bob keeps the page on a short watch list. Every few hours
// (1, 3, 6, 12 or 24; 6 to start) he reads the page again, finds the part you care about by the words next to it
// ("Price", "Latest release"), and pops up when that part changes, with what it said before and now, the same way a
// reminder does (and on the phone with "Show reminders on my phone"). Only the page's address goes online, the same
// as fetch_page; home-network addresses are refused. Up to 20 pages; the list is in inn\bob\page-watches.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { htmlToText, readCapped } from './tools.js';
import { isPrivateHost } from './security-web.js';
import { writeJsonAtomic, stripBom } from './util.js';

export const MAX_WATCHES = 20;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const SNIP = 300;
const fileOf = (cfg) => path.join(cfg.dataDir, 'page-watches.json');
export function loadWatches(cfg) {
  try { const j = JSON.parse(stripBom(fs.readFileSync(fileOf(cfg), 'utf8'))); return Array.isArray(j) ? j : []; } catch { return []; }
}
export const saveWatches = (cfg, list) => { fs.mkdirSync(cfg.dataDir, { recursive: true }); writeJsonAtomic(fileOf(cfg), list.slice(0, MAX_WATCHES)); };

// Reads a page as plain text, following redirects by hand so every hop gets the home-network check.
export async function readPage(url, { fetchImpl = fetch, signal } = {}) {
  let u = new URL(url), res;
  for (let hop = 0; ; hop++) {
    if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https pages.');
    if (isPrivateHost(u.hostname)) throw new Error('I don\'t watch addresses on the home network.');
    res = await fetchImpl(u, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Bob/0.1' }, redirect: 'manual', signal: signal || AbortSignal.timeout(30000) });
    const next = res.status >= 300 && res.status < 400 && res.headers.get('location');
    if (!next) break;
    if (hop >= 5) throw new Error('That page redirects too many times.');
    u = new URL(next, u);
  }
  if (!res.ok) throw new Error(`The page answered ${res.status}.`);
  const type = res.headers.get('content-type') || '';
  if (!/text|html|json|xml/.test(type)) throw new Error(`That link is a ${type || 'file'}, not a page.`);
  const raw = await readCapped(res, MAX_PAGE_BYTES);
  return /html|xml/.test(type) ? htmlToText(raw) : raw;
}

// The part of the page that matters: the words after the first place `find` appears (the label next to it), so
// "Price" gives "Price $129.99 In stock". Without `find`, the whole page (as a fingerprint).
export function partOf(text, find) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  const w = String(find || '').trim();
  if (!w) return { found: true, part: t.slice(0, SNIP), whole: crypto.createHash('sha256').update(t).digest('hex') };
  const i = t.toLowerCase().indexOf(w.toLowerCase());
  if (i < 0) return { found: false, part: '' };
  return { found: true, part: t.slice(i, i + w.length + 160).trim() };
}
const sameAs = (a, b) => (a.whole || a.part) === (b.whole || b.part);

// One check of one watch. Returns { watch (updated), changed, before, now, problem }.
export async function checkWatch(w, opts = {}) {
  const now = opts.now ?? Date.now();
  try {
    const text = await readPage(w.url, opts);
    const p = partOf(text, w.find);
    if (!p.found) return { watch: { ...w, checked: now, problem: `"${w.find}" isn't on the page now` }, changed: false, problem: `"${w.find}" isn't on the page any more.` };
    const was = { part: w.part, whole: w.whole };
    const next = { ...w, checked: now, part: p.part, whole: p.whole || '', problem: '' };
    if (!w.part && !w.whole) return { watch: next, changed: false };
    if (sameAs(was, p)) return { watch: next, changed: false };
    return { watch: { ...next, changedAt: now }, changed: true, before: w.part, now: p.part };
  } catch (e) {
    return { watch: { ...w, checked: now, problem: String(e.message || e).slice(0, 160) }, changed: false, problem: e.message };
  }
}

// The background check (brain.js, every few minutes): watches that are due are read again; changes pop up.
let running = false;
export async function checkDueWatches(cfg, say, opts = {}) {
  if (cfg.moreTools?.pageWatch !== true || running) return 0;
  const hours = cfg.moreTools?.watchHours || 6;
  const now = opts.now ?? Date.now();
  const list = loadWatches(cfg);
  const due = list.filter((w) => !w.checked || now - w.checked >= hours * 3600000);
  if (!due.length) return 0;
  running = true;
  let changed = 0;
  try {
    for (const w of due) {
      const r = await checkWatch(w, { ...opts, now });
      const all = loadWatches(cfg);
      const i = all.findIndex((x) => x.id === w.id);
      if (i < 0) continue; // removed meanwhile
      all[i] = r.watch;
      saveWatches(cfg, all);
      if (r.changed) { changed++; say?.(`👀 ${w.what || w.url} changed.\nBefore: ${r.before}\nNow: ${r.now}\n${w.url}`, w); }
    }
  } finally { running = false; }
  return changed;
}

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export function watchTool(cfg, on = () => true, opts = {}) {
  return {
    schema: fn('watch_page', 'Watch a web page and tell the user when the part they care about changes (a price, a version, "in stock"). Checked every few hours.', {
      action: { type: 'string', enum: ['add', 'list', 'remove', 'check'], description: 'add a page, list them, remove one, or check one now.' },
      url: { type: 'string', description: 'add: the page\'s http or https address.' },
      find: { type: 'string', description: 'add: the words right before the part to watch, as they appear on the page, like "Price" or "Latest release". Read the page with fetch_page first if you\'re not sure.' },
      what: { type: 'string', description: 'add: a short name, like "the Steam Deck price".' },
      id: { type: 'string', description: 'remove or check: the id from list.' }
    }, ['action']),
    async run({ action, url, find, what, id }, ctx = {}) {
      if (!on()) return 'Watching pages is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob watch web pages".';
      const list = loadWatches(cfg);
      const hours = cfg.moreTools?.watchHours || 6;
      if (action === 'add') {
        if (list.length >= MAX_WATCHES) return `I'm already watching ${MAX_WATCHES} pages, the most I keep. Remove one first.`;
        const u = new URL(String(url || ''));
        const w = { id: crypto.randomUUID().slice(0, 6), url: u.toString(), find: String(find || '').slice(0, 80), what: String(what || '').slice(0, 80) || u.hostname, added: Date.now() };
        const r = await checkWatch(w, { ...opts, signal: ctx.signal });
        if (r.problem) return `I couldn't start watching it: ${r.problem}${w.find ? ' Try other words from right before the part, as the page writes them.' : ''}`;
        saveWatches(cfg, [...list, r.watch]);
        return `Watching ${w.what} (id ${w.id}), every ${hours} hour${hours === 1 ? '' : 's'}. It says now: "${r.watch.part}". I'll pop up when that changes. The user can change how often in Settings, 🧰 More tools.`;
      }
      if (action === 'remove') {
        const left = list.filter((w) => w.id !== id);
        if (left.length === list.length) return 'No watched page has that id. Call watch_page with action list.';
        saveWatches(cfg, left);
        return 'Stopped watching it.';
      }
      if (action === 'check') {
        const w = list.find((x) => x.id === id);
        if (!w) return 'No watched page has that id.';
        const r = await checkWatch(w, { ...opts, signal: ctx.signal });
        saveWatches(cfg, loadWatches(cfg).map((x) => (x.id === w.id ? r.watch : x)));
        return r.problem ? `Couldn't check it: ${r.problem}` : r.changed ? `It changed. Before: "${r.before}". Now: "${r.now}".` : `No change. It says: "${r.watch.part}".`;
      }
      if (!list.length) return 'No pages are being watched.';
      return list.map((w) => `${w.id}: ${w.what} (${w.url})${w.find ? ` watching "${w.find}"` : ''}; last: "${String(w.part || '').slice(0, 100)}"${w.problem ? `; problem: ${w.problem}` : ''}`).join('\n');
    },
    summary: ({ action, url, id }) => `watch page: ${action}${url ? ' ' + String(url).slice(0, 80) : id ? ' ' + id : ''}`
  };
}
