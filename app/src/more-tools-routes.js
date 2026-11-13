// 🧰 More tools in Bob's API (Settings, How Bob works, 🧰 More tools; public/more-tools.js draws the panel).
//   GET  /api/more-tools   the switches, the account and calendar and service details (never a password, link or
//                          key: only whether one is saved), and what's ready on this replicant matrix
//   POST /api/more-tools   { set: { key: true|false }, email: {...}, calendar: {...}, api: {...}, remove..., get... }
// Changes only from this replicant matrix itself: passwords, links and keys are typed here and go straight into
// the locked store (secret-box.js), as in Settings, Locked secrets.
import { saveSettings } from './config.js';
import { cleanMoreTools, moreTools, SWITCHES, EMAIL_KEY, calendarKey, apiKeyName, newId, MAX_CALENDARS, MAX_APIS, cleanBase } from './more-tools.js';
import { keyValue, saveKey } from './secret-box.js';
import { hasPython, getPython, pythonReady, PYODIDE } from './py-sandbox.js';
import { hasWordList, getWordList } from './spell.js';
import { findFfmpeg } from './office.js';
import { loadWatches, saveWatches } from './page-watch.js';
import { listMail } from './email-read.js';
import { loadCalendar, forgetCalendar } from './calendar-read.js';
import { sandboxOn } from './sandbox-code.js';

export function moreToolsView(cfg, extra = {}) {
  const m = moreTools(cfg);
  const has = (k) => { try { return Boolean(keyValue(k)); } catch { return false; } };
  return {
    ...m,
    switches: SWITCHES.map((s) => ({ key: s.key, label: s.label, on: m[s.key] })),
    emailPasswordSaved: has(EMAIL_KEY),
    calendars: m.calendars.map((c) => ({ ...c, linkSaved: c.kind === 'link' ? has(calendarKey(c.id)) : undefined })),
    apis: m.apis.map((a) => ({ ...a, keySaved: has(apiKeyName(a.id)) })),
    pythonHere: hasPython(cfg), pythonSize: `${(PYODIDE.bytes / 1048576).toFixed(1)} MB`, sandboxOn: sandboxOn(cfg),
    wordListHere: hasWordList(cfg),
    ffmpegHere: Boolean(findFfmpeg(cfg)),
    hearingHere: Boolean(cfg.stt?.provider === 'whispercpp' ? cfg.stt?.model : cfg.stt?.provider || cfg.ollamaUrl),
    watches: loadWatches(cfg).map((w) => ({ id: w.id, what: w.what, url: w.url, find: w.find, part: String(w.part || '').slice(0, 120), checked: w.checked || 0, problem: w.problem || '' })),
    ...extra
  };
}

const save = (cfg, patch) => saveSettings(cfg, { moreTools: cleanMoreTools({ ...moreTools(cfg), ...patch }) });
let getting = null; // one download at a time

export async function moreToolsRoute({ req, res, p, isLocal, brain, cfg, body, send }) {
  if (p !== '/api/more-tools') return false;
  if (req.method === 'GET') { send(res, 200, moreToolsView(cfg)); return true; }
  if (req.method !== 'POST') { send(res, 404, { error: 'not found' }); return true; }
  if (!isLocal) { send(res, 403, { error: 'More tools can only be changed on this replicant matrix itself.' }); return true; }
  const b = await body(req);
  const log = (t) => brain?.log?.('settings', `🧰 More tools: ${t}`);
  const out = {};
  try {
    // A switch. Python only turns on where it's here and a test sum works in the sandbox.
    if (b.set && typeof b.set === 'object') {
      for (const [k, v] of Object.entries(b.set)) {
        if (!SWITCHES.some((s) => s.key === k) || typeof v !== 'boolean') continue;
        if (k === 'python' && v) {
          const r = await pythonReady(cfg);
          if (!r.ok) { out.why = `Python stays off: ${r.why}.`; continue; }
          if (!sandboxOn(cfg)) out.note = 'On. It works once "Code sandbox" is on too.';
        }
        save(cfg, { [k]: v });
        log(`"${SWITCHES.find((s) => s.key === k).label}" switched ${v ? 'on' : 'off'}`);
      }
    }
    if (b.watchHours != null) save(cfg, { watchHours: Number(b.watchHours) });
    // Email: the account details, and the app password into the locked store (empty = keep the saved one).
    if (b.email && typeof b.email === 'object') {
      const e = b.email;
      save(cfg, { emailHost: e.host ?? moreTools(cfg).emailHost, emailPort: e.port ?? moreTools(cfg).emailPort, emailUser: e.user ?? moreTools(cfg).emailUser, emailFolder: e.folder ?? moreTools(cfg).emailFolder });
      if (typeof e.password === 'string' && e.password.trim()) { saveKey(cfg, EMAIL_KEY, e.password.trim()); log('email app password saved (locked)'); }
      if (e.forgetPassword === true) { saveKey(cfg, EMAIL_KEY, ''); log('email app password removed'); }
    }
    if (b.testEmail === true) {
      try { const r = await listMail(cfg, { days: 1, limit: 1 }); out.test = `✓ Connected, read-only. ${r.total} message${r.total === 1 ? '' : 's'} today.`; }
      catch (e) { out.test = `✗ ${e.message}`; }
    }
    // Calendars: add (a name and a link or a file), remove, test.
    if (b.addCalendar && typeof b.addCalendar === 'object') {
      const m = moreTools(cfg);
      if (m.calendars.length >= MAX_CALENDARS) throw new Error(`Up to ${MAX_CALENDARS} calendars.`);
      const c = b.addCalendar, id = newId();
      if (c.file) save(cfg, { calendars: [...m.calendars, { id, name: c.name, kind: 'file', file: String(c.file) }] });
      else {
        const link = String(c.link || '').trim().replace(/^webcals?:\/\//i, 'https://');
        if (!cleanBase(link)) throw new Error('A calendar link starts with https:// or webcal://.');
        saveKey(cfg, calendarKey(id), link);
        save(cfg, { calendars: [...m.calendars, { id, name: c.name, kind: 'link' }] });
      }
      log(`calendar "${String(c.name || 'Calendar').slice(0, 40)}" added`);
    }
    if (b.removeCalendar) {
      const m = moreTools(cfg);
      save(cfg, { calendars: m.calendars.filter((c) => c.id !== b.removeCalendar) });
      try { saveKey(cfg, calendarKey(b.removeCalendar), ''); } catch {}
      forgetCalendar(b.removeCalendar);
    }
    if (b.testCalendar) {
      const c = moreTools(cfg).calendars.find((x) => x.id === b.testCalendar);
      try { const r = await loadCalendar(c || {}); out.test = `✓ ${r.name}: ${r.events.length} event${r.events.length === 1 ? '' : 's'} read.`; }
      catch (e) { out.test = `✗ ${e.message}`; }
    }
    // Web services: add (name, address, header, prefix, key), remove.
    if (b.addApi && typeof b.addApi === 'object') {
      const m = moreTools(cfg);
      if (m.apis.length >= MAX_APIS) throw new Error(`Up to ${MAX_APIS} services.`);
      const a = b.addApi, id = newId();
      if (!cleanBase(a.base)) throw new Error('The address must start with https:// (http only for this replicant matrix itself).');
      const next = cleanMoreTools({ ...m, apis: [...m.apis, { id, name: a.name, base: a.base, header: a.header, prefix: a.prefix }] });
      if (next.apis.length === m.apis.length) throw new Error('A service needs a name (letters and digits) and an address.');
      if (next.apis.some((x, i) => i < m.apis.length && x.name.toLowerCase() === String(a.name || '').trim().toLowerCase())) throw new Error('There\'s already a service with that name.');
      if (typeof a.key === 'string' && a.key.trim()) saveKey(cfg, apiKeyName(id), a.key.trim());
      save(cfg, { apis: next.apis });
      log(`web service "${String(a.name).slice(0, 40)}" added${a.key ? ' (key locked)' : ''}`);
    }
    if (b.removeApi) {
      const m = moreTools(cfg);
      save(cfg, { apis: m.apis.filter((a) => a.id !== b.removeApi) });
      try { saveKey(cfg, apiKeyName(b.removeApi), ''); } catch {}
    }
    if (b.removeWatch) saveWatches(cfg, loadWatches(cfg).filter((w) => w.id !== b.removeWatch));
    // The two one-time downloads.
    if (b.getPython === true || b.getWordList === true) {
      if (getting) throw new Error('A download is already going. Wait for it to finish.');
      getting = (b.getPython ? getPython(cfg) : getWordList(cfg)).finally(() => { getting = null; });
      await getting;
      out.note = b.getPython ? 'Python is here. Now switch on "Let Bob use Python in the sandbox".' : 'The word list is here.';
      log(b.getPython ? `Python ${PYODIDE.version} for the sandbox fetched` : 'spelling word list fetched');
    }
  } catch (e) {
    send(res, 400, moreToolsView(cfg, { error: e.code === 'BOX_STUCK' ? e.message : String(e.message || e) }));
    return true;
  }
  send(res, 200, moreToolsView(cfg, out));
  return true;
}
