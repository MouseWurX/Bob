// Bob's tools. Each tool has a JSON schema for the model, an optional approval check,
// and a run function. Anything risky goes through approval; the inn folder is Bob's own space.
import fs from 'node:fs';
import path from 'node:path';
import { isInside, insideAny, appDir, findOutput } from './config.js';
import { HATS } from './persona.js';
import { cloudHelpers, askCloud } from './cloud.js';
import { copyName } from './clan.js';
import { limitOn, readOnlyRoots } from './hands-settings.js';
import { listWorkflows, workshopDir } from './workshop.js';
import { bobHelp } from './self-help.js';
import { recallOn, tagLine } from './recall.js';
import { diagramTool } from './diagram.js';
import { saveAsTool } from './save-as.js';
import { isPrivateHost } from './security-web.js';

const MAX_READ = 20000;
// Runnable file types Bob won't write outside a project, on every platform (Windows, Mac and Linux kinds together).
const BLOCKED_EXT = new Set(['.exe', '.msi', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.js', '.mjs', '.cjs', '.jse', '.wsf', '.hta', '.scr', '.lnk', '.reg', '.dll', '.com', '.jar', '.sh', '.bash', '.zsh', '.py', '.pyw', '.command', '.desktop', '.app']);
// read_file refuses files over this many bytes: a multi-GB file would otherwise be read whole into memory.
const MAX_READ_BYTES = 20 * 1024 * 1024;
// fetch_page stops reading a page after this many bytes (the text is cut to 15,000 characters anyway).
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
async function readCapped(res, max) {
  const parts = []; let n = 0;
  for await (const chunk of res.body || []) { parts.push(chunk); n += chunk.length; if (n >= max) break; }
  return Buffer.concat(parts).subarray(0, max).toString('utf8');
}

// Secrets Bob must never list, read, search or write: signing keys, API keys, databases, his own config.
const SECRET_NAME = /^(local\.properties|keystore\.properties|google-services\.json|credentials\.json|\.env(\..*)?|\.npmrc|\.git-credentials|id_(rsa|dsa|ecdsa|ed25519).*)$/i;
const SECRET_EXT = new Set(['.jks', '.keystore', '.p12', '.pfx', '.pem', '.key', '.db', '.sqlite', '.sqlite3', '.kdbx']);
// Bob's own config is always off-limits; the rest only while the "Keep secret files private" hard limit is on.
export function isSensitive(cfg, file) {
  const own = [path.join(appDir, 'config.json'), process.env.BOB_CONFIG].filter(Boolean);
  if (own.some((f) => isInside(f, file))) return true;
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

function htmlToText(html) {
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

export function cloudProviders(cfg) {
  return cloudHelpers(cfg);
}

export function buildTools(cfg) {
  const t = {};

  t.notice_board = {
    schema: fn('notice_board', "Read or rewrite {{USER}}'s notice board (to-do quest log). To change it, read it first, then write the whole new board.", {
      action: str('read or write', { enum: ['read', 'write'] }),
      content: str('The complete new board in Markdown (only for write).')
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
      return fn('remember', 'Save a lasting fact about {{USER}} (a preference, a plan, a detail that will matter later). Never secrets or passwords.', {
        fact: str('One short sentence.'),
        ...(recallOn(cfg) ? { project: str(`Only for a fact about one project: its name${banks.length ? ` (${banks.join(', ')})` : ''}. Leave out for anything general.`) } : {})
      }, ['fact']);
    },
    async run({ fact, project }) {
      if (!fact) throw new Error('Nothing to remember.');
      const clean = String(fact).replace(/\s+/g, ' ').trim();
      const line = `- ${recallOn(cfg) ? tagLine(`${clean} (${today(cfg)})`, project) : `${clean} (${today(cfg)})`}\n`;
      fs.appendFileSync(cfg.memoryFile, line);
      return recallOn(cfg) && project ? `Remembered, in the ${String(project).replace(/[\][]/g, '').trim()} memory bank.` : 'Remembered.';
    },
    summary: ({ fact, project }) => `remember: ${String(fact).slice(0, 80)}${project ? ` (${project})` : ''}`
  };

  t.reminders = {
    schema: fn('reminders', "Set, list or cancel reminders. Bob pops up and taps {{USER}} on the shoulder at the time (while the PC is on).", {
      action: str('add, list or cancel', { enum: ['add', 'list', 'cancel'] }),
      time: str('For add: local time as YYYY-MM-DDTHH:mm ({{USER}}\'s time zone).'),
      text: str('For add: what to remind about.'),
      id: str('For cancel: the reminder id from list.')
    }, ['action']),
    async run({ action, time, text, id }) {
      const list = loadReminders(cfg);
      if (action === 'add') {
        if (!text) throw new Error('What should I remind about?');
        const at = zonedToEpoch(time, cfg.timeZone);
        if (at < Date.now() - 60000) throw new Error('That time has already passed.');
        const r = { id: Math.random().toString(36).slice(2, 8), at, local: time, text: String(text).slice(0, 300) };
        list.push(r);
        saveReminders(cfg, list);
        return `Reminder ${r.id} set for ${time}: ${r.text}`;
      }
      if (action === 'cancel') {
        const left = list.filter((r) => r.id !== id);
        if (left.length === list.length) throw new Error('No reminder with that id.');
        saveReminders(cfg, left);
        return 'Cancelled.';
      }
      return list.length ? list.map((r) => `${r.id}: ${r.local} - ${r.text}`).join('\n') : 'No reminders set.';
    },
    summary: ({ action, time }) => `reminder: ${action}${time ? ' ' + time : ''}`
  };

  t.list_folder = {
    schema: fn('list_folder', "List the files in a folder on {{USER}}'s PC.", { path: str('Full folder path.') }),
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
    schema: fn('read_file', "Read a text file on {{USER}}'s PC.", { path: str('Full file path.') }),
    async run({ path: p }) {
      const file = resolveUserPath(p);
      if (!insideAny(cfg.readRoots, file)) throw new Error(`I'm not allowed to read ${file}.`);
      if (isSensitive(cfg, file)) throw new Error(SECRET_MSG);
      const size = fs.statSync(file).size;
      if (size > MAX_READ_BYTES) throw new Error(`That file is ${Math.round(size / 1048576)} MB, too big to read as text. I read files up to 20 MB.`);
      const buf = fs.readFileSync(file);
      if (buf.subarray(0, 4096).includes(0)) return '(That looks like a binary file, so I can\'t read it as text.)';
      const text = buf.toString('utf8');
      return text.length > MAX_READ ? text.slice(0, MAX_READ) + `\n\n[cut: file is ${text.length} characters, showed the first ${MAX_READ}]` : text;
    },
    summary: ({ path: p }) => `read ${p}`
  };

  t.write_file = {
    schema: fn('write_file', "Create or overwrite a text file on {{USER}}'s PC. New files inside the inn folder need no approval; anything else asks {{USER}} first.", {
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
      if (isInside(cfg.innDir, file) && !exists) return false;
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
    schema: fn('bob_help', "Look up how you (Bob) work: your settings, switches, pages and features, where each one is, and what is set right now. Use it whenever {{USER}} asks about setting you up, changing a setting, or what a feature does, and give the exact place to click.", {
      topic: str('What to look up, in plain words, for example "web search switch" or "gaming session".')
    }),
    async run({ topic }) { return bobHelp(cfg, String(topic || '')); },
    summary: ({ topic }) => `Help: ${topic || 'settings'}`
  };

  t.web_search = {
    schema: fn('web_search', 'Search the web (DuckDuckGo). Returns titles, links and snippets. Operators work: "exact phrase", -leaveout, site:example.com, filetype:pdf, intitle:word, OR.', { query: str('Search words, with operators if they help.'), when: str('Optional: only results from the past day, week, month or year.', { enum: ['day', 'week', 'month', 'year'] }) }, ['query']),
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
    schema: fn('fetch_page', 'Read a web page as text.', { url: str('http or https link.') }),
    async run({ url }, { signal }) {
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
      const text = htmlToText(await readCapped(res, MAX_PAGE_BYTES));
      return text.length > 15000 ? text.slice(0, 15000) + '\n[cut]' : text;
    },
    summary: ({ url }) => `read page: ${url}`
  };

  t.make_image = {
    schema: fn('make_image', "Paint a picture on {{USER}}'s PC. The chat brain steps out of the GPU while it paints.", {
      prompt: str('A new picture: the full image prompt. An edit (with a reference): a short instruction saying only what to change, like "Replace his hard hat with a silver tiara and his coveralls with a pink gown". Don\'t describe the whole picture again, or it gets repainted.'),
      width: { type: 'integer', description: 'Width in pixels, default 1024. Leave out for edits: they keep the picture\'s own shape.' },
      height: { type: 'integer', description: 'Height in pixels, default 1024. Leave out for edits.' },
      reference: { type: 'array', items: { type: 'string' }, description: 'Optional: pictures to edit or paint from. Up to 4. Names from the shelf or attached in chat, "last" for the newest picture you made, or a painted file name (like 2026-11-02-ab12cd34.png).' },
      mode: str('With a reference: keep_look = edit it or keep its look (same character or scene; needs a picture-edit model) (default); start_from = rework the reference picture itself (the look can drift). new = paint something new even though a picture is attached.', { enum: ['keep_look', 'start_from', 'new'] }),
      strength: { type: 'number', description: 'start_from only: how much may change, 0.1 (barely) to 0.95 (almost all). Default 0.6.' }
    }, ['prompt']),
    async run(args, ctx) { return ctx.brain.makeImage(args, ctx); },
    summary: ({ prompt }) => `image: ${String(prompt).slice(0, 80)}`
  };

  t.make_video = {
    schema: fn('make_video', "Make a short video clip on {{USER}}'s PC (slow: minutes). The chat brain steps out of the GPU while it films.", {
      prompt: str('The full video prompt: subject, motion, camera, style.'),
      seconds: { type: 'integer', description: 'Length in seconds, 1 to 5, default 2.' },
      width: { type: 'integer', description: 'Width in pixels, default 832.' },
      height: { type: 'integer', description: 'Height in pixels, default 480.' },
      reference: { type: 'array', items: { type: 'string' }, description: 'Optional: a reference picture name; the clip starts from that picture.' }
    }, ['prompt']),
    async run(args, ctx) { return ctx.brain.makeVideo(args, ctx); },
    summary: ({ prompt }) => `video: ${String(prompt).slice(0, 80)}`
  };

  t.make_music = {
    schema: fn('make_music', "Make a piece of music on {{USER}}'s PC with the audio workshop (a few minutes). The chat brain steps out of the GPU while it plays.", {
      prompt: str('Style tags: genre, mood, instruments, tempo. Like "chiptune, upbeat, 140 bpm, square lead". If {{USER}} gave no style, pick one that fits and say what you picked.'),
      lyrics: str('Optional lyrics with [verse] and [chorus] markers. Leave empty for instrumental.'),
      seconds: { type: 'integer', description: 'Length in seconds, 10 to 240, default 30.' },
      title: str('Optional: a short song title, 2 to 5 words, shown on its player. Make one up if {{USER}} gave none.')
    }, ['prompt']),
    async run(args, ctx) { return ctx.brain.makeSound('music', args, ctx); },
    summary: ({ prompt }) => `music: ${String(prompt).slice(0, 80)}`
  };

  t.make_sound = {
    schema: fn('make_sound', 'Make a short sound effect on {{USER}}\'s PC with the audio workshop.', {
      prompt: str('What it sounds like: "heavy wooden door creaking open in a stone hall".'),
      seconds: { type: 'integer', description: 'Length in seconds, 1 to 20, default 5.' }
    }, ['prompt']),
    async run(args, ctx) { return ctx.brain.makeSound('sfx', args, ctx); },
    summary: ({ prompt }) => `sound: ${String(prompt).slice(0, 80)}`
  };

  t.workshop_list = {
    schema: fn('workshop_list', 'List the ComfyUI workflows in the advanced workshop: what each one makes and whether it takes reference pictures.', {}),
    async run() {
      const all = listWorkflows(cfg);
      if (!all.length) return `No workflows yet. The user can put ComfyUI "Export (API)" files in ${workshopDir(cfg)}.`;
      return all.map((w) => w.ok ? `- ${w.name}: makes ${w.makes.join(', ') || 'something'}${w.pictures ? `, takes ${w.pictures} reference picture(s)` : ''}${w.prompt ? '' : ', no prompt box'}` : `- ${w.name}: can't use it (${w.why})`).join('\n');
    },
    summary: () => 'workshop: list'
  };

  t.workshop_run = {
    schema: fn('workshop_run', 'Run a ComfyUI workflow from the advanced workshop. Use only when Bob\'s own painter can\'t do the job, or when {{USER}} names a workflow.', {
      workflow: str('Workflow name from workshop_list.'),
      prompt: str('The prompt to put in its prompt box.'),
      negative: str('Optional negative prompt.'),
      reference: { type: 'array', items: { type: 'string' }, description: 'Optional reference picture names, in the order of its Load Image nodes.' }
    }, ['workflow']),
    async run(args, ctx) { return ctx.brain.runWorkshop(args, ctx); },
    summary: ({ workflow }) => `workshop: ${workflow}`
  };

  t.save_reference = {
    schema: fn('save_reference', "Put a picture on the reference shelf so it can be used again by name: one Bob painted (give its file name) or one attached in chat (give its current name).", {
      picture: str('The painted file name (like 2026-11-01-ab12cd34.png) or the attached picture\'s name.'),
      name: str('Short name to use later, like "Captain Mira" or "Harbour at dusk".'),
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
    schema: fn('ask_specialist', "Put on a different hat (and brain) for a focused job. The answer goes straight to {{USER}}.", {
      hat: str('tinker = coding, including fixing a crash, error or bug in a project, ledger = data and spreadsheets, scout = web research with sources, painter = image/video prompts, reviewer = careful second look', { enum: Object.keys(HATS) }),
      task: str('Everything the job needs: the request and any details or pasted text from the chat. Pass it on as it is; the workbench finds files itself, so don\'t ask for paths or line numbers first.')
    }),
    async run({ hat, task }, ctx) { return ctx.brain.runHat(hat, task, ctx); },
    summary: ({ hat }) => `hat: ${hat}`,
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
    schema: fn('search_files', "Search the text inside {{USER}}'s project source files. Returns matching lines with file and line number. If {{USER}} didn't name a project, leave project out: it searches all of them.", {
      project: str('Project name (optional; leave out to search every project)', { enum: Object.keys(cfg.projects || {}) }),
      text: str('Text to look for (case-insensitive).')
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
    schema: fn('edit_file', "Change part of a file: replace one exact piece of text with new text. The find text must appear exactly once (include a few surrounding lines to make it unique). {{USER}} approves each change.", {
      path: str('Full file path.'),
      find: str('The exact existing text to replace, copied from the file.'),
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
      schema: fn('ask_cloud', 'Hand one self-contained job to a paid cloud AI helper (a sub-agent). Costs money and sends the task off the PC, so {{USER}} approves each time. Only for jobs too big for the local brains, or when {{USER}} asks.', {
        provider: str('Which helper (id)'),
        task: str('The full job, self-contained. Include everything the helper needs; it cannot see files or this chat.')
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
    schema: fn('hire_brain', 'Ask {{USER}} to run this job on the rented brain (a big brain hired from an online service, in the Rented brain slot). Shows a card with the cost; nothing is hired until they press it. Only when the job is too big for the brains on this replicant matrix (a very long chat or file, a model that is not here), or when {{USER}} asks for it.', {
      why: str('One short line: why this job needs the rented brain')
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
