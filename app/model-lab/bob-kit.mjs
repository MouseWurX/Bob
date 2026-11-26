// Bob's real front desk, borrowed from a Bob source tree: his system prompt and his tool list, exactly as he sends
// them, with a throwaway settings folder (no chats, notes, memory or names from anyone's own Bob).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { checkBobSource } from './bob-source.mjs';

// howtos: a how-to file ({ howtos: [{ name, when, steps }] }) put in the throwaway Bob first, so the quiz can see them.
// allowOld: --allow-old-bob (bob-source.mjs): a Bob copy more than a few releases behind this Lab is refused otherwise.
// family: a brain family (qwen3, qwen3.5, gpt-oss...): every turn gets that family's tool set from Bob's tool-sets.js,
// as Bob's own loop does for the brain answering (its hidden tools left out, its wording). Unset = Bob's own list.
// home: a throwaway home folder (Documents, Desktop, Downloads) Bob may use, shown to him as C:\Users\you, so his real
// tools can run against a lesson's own files (write-lessons --real-tools). Off: the kit is as before.
// office: soffice.exe (or soffice) for the office tools (write-lessons --office, 15 Nov): the throwaway Bob's own
// folder never holds LibreOffice, so without it office_make and the rest answer "no LibreOffice on this PC".
// world (do-jobs and write-lessons scenes, 16 Nov; the owner: "it was supposed to have files for every job it could do and
// ask for"): any other folder a job names (C:\Temp, D:\Photos, /home/user/projects) is mirrored inside the throwaway
// folder too, shown to the brain by its own name, so a job about C:\Temp works on a real C:\Temp of its own. A mirrored
// folder is usable only once kit.allow() adds it (a scene's folders, as the user ticking them in Settings); any other
// one gets Bob's own "not allowed" answer. Needs home (switched on with it).
// hands: the Hands switched on (Bob's prompt then says only what this Bob can do); makers: false leaves the painter
// unset, so no make-a-picture stand-in files and no claim in the prompt that pictures can be made. docs: "Read and
// search documents" on (Settings, How Bob works), so Word, Excel and PDF files read without LibreOffice.
export const KIT_HANDS = ['files', 'run', 'schedules', 'apps', 'office', 'security', 'maker', 'mcp'];
export async function loadBob(bobDir, { howtos = '', allowOld = false, home = false, office = '', family = '', world = false, hands: handsOn = KIT_HANDS, makers = true, docs = false } = {}) {
  if (world) home = true;
  // a repository folder works as well as its app folder (Bob's files sit in app/ since Nov 9)
  if (!fs.existsSync(path.join(bobDir, 'src')) && fs.existsSync(path.join(bobDir, 'app', 'src'))) bobDir = path.join(bobDir, 'app');
  const src = (f) => pathToFileURL(path.join(bobDir, 'src', f)).href;
  if (!fs.existsSync(path.join(bobDir, 'src', 'brain.js'))) throw new Error(`No Bob source tree at ${bobDir} (src/brain.js missing). Pass --bob <folder>.`);
  const bobSrc = checkBobSource(bobDir, path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), { allowOld });
  const { Brain } = await import(src('brain.js'));
  const { systemPrompt } = await import(src('persona.js'));
  const tb = await import(src('toolbox.js'));
  let toolShapes = null; try { toolShapes = (await import(src('tool-sets.js'))).TOOL_SHAPES ?? null; } catch {} // the tool-shape version this Bob's lessons are written for
  // 21 Nov (Lumo's review): the exact tool list as a short hash, switches included (tool-sets.js shapeSchemas); null on an older Bob
  let shapeOf = null; try { const ts = await import(src('tool-sets.js')); if (ts.shapeSchemas && ts.toolListHash) shapeOf = (b, set) => ts.toolListHash(ts.shapeSchemas(b, set)); } catch {}
  let phrasings = [];
  try { phrasings = (await import(pathToFileURL(path.join(bobDir, 'test', 'phrasings.js')).href)).PHRASINGS; } catch {}

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-'));
  const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), painterDir = path.join(innDir, 'painter');
  for (const d of [dataDir, painterDir]) fs.mkdirSync(d, { recursive: true });
  const f = (n) => { const p = path.join(tmp, n); fs.writeFileSync(p, 'x'); return p; };
  // Every maker "set up" with stand-in files, so Bob's prompt and tools are the ones a fully equipped Bob has.
  const sdcpp = makers ? { exe: f('sd.exe'), image: { diffusionModel: f('z.gguf') }, edit: { diffusionModel: f('qie.gguf'), vae: f('vae.st'), llm: f('vl.gguf') } } : {};
  const hands = Object.fromEntries([...handsOn].map((h) => [h, { on: true }]));
  const homeDir = home ? path.join(tmp, 'home') : '';
  // 16 Nov (800-job read): a job about C:\\Users\\you\\Videos got "isn't there"; a Windows home has all six of these
  if (homeDir) for (const d of ['Documents', 'Desktop', 'Downloads', 'Pictures', 'Music', 'Videos']) fs.mkdirSync(path.join(homeDir, d), { recursive: true });
  const worldDir = world ? path.join(tmp, 'world') : '';
  if (worldDir) fs.mkdirSync(worldDir, { recursive: true });
  const cfg = {
    agentDir, innDir, dataDir, painterDir, defaultPainterDir: painterDir, settingsFile: path.join(dataDir, 'settings.json'),
    // 15 Nov (Opus read of lkt-fix2's rejects): Bob's config.js sets these, the kit didn't, so notice_board and remember
    // failed every time with 'The "path" argument must be of type string' and dozens of lessons taught a broken board
    noticeBoard: path.join(innDir, 'notice-board.md'), memoryFile: path.join(innDir, 'bob-memory.md'), logbook: path.join(innDir, 'logbook.md'),
    ledgerDir: path.join(innDir, 'ledger'), archiveDir: path.join(innDir, 'archive'),
    ...(office ? { officePath: office } : {}), ...(docs ? { docTools: true } : {}),
    readRoots: homeDir ? [innDir, homeDir] : [innDir], readOnlyRoots: [], recycleBin: false,
    models: { bob: 'qwen3.6-35b-a3b' }, engine: 'llamacpp', ollamaUrl: 'http://127.0.0.1:1',
    painter: makers ? { engine: 'sdcpp', sdcpp } : { engine: 'sdcpp' }, stt: { provider: 'http' },
    hands: { enabled: true, ...hands, folders: homeDir ? [innDir, homeDir] : [innDir] }, howtos: true, // 12 Nov: Bob reads cfg.howtos === true; { on: true } left the how-to tools out of every quiz
    // Web search on, so fresh-facts lessons teach web_search (with it off, Bob offers the switch instead).
    webSearch: true
  };
  if (howtos) {
    const list = (JSON.parse(fs.readFileSync(howtos, 'utf8')).howtos || []).map((r, i) => ({ id: 'seed-' + i, made: Date.now(), used: 0, ...r }));
    fs.writeFileSync(path.join(dataDir, 'howtos.json'), JSON.stringify({ howtos: list }, null, 1));
  }
  let toolSet = null;
  if (family) {
    try { toolSet = (await import(src('tool-sets.js'))).toolSetFor({}, '', { family: String(family) }); } catch {}
    if (!toolSet) throw new Error(`No tool set for the family "${family}" in this Bob copy (src/tool-sets.js).`);
  }
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  for (const k of Object.keys(brain)) { const v = brain[k]; if (v && typeof v === 'object' && v.timer) try { clearInterval(v.timer); } catch {} }

  // 15 Nov: the trial's lessons carried the Lab PC's real user folder (its temp folder sits inside it). Every prompt,
  // tool list and saved lesson gets a neutral home instead; neutral() is used by write-lessons on everything it saves.
  // the throwaway home reads as C:\Users\you and the rest of the throwaway folder as Bob's own folder, so every kit's
  // prompt and results look the same whatever temp folder it got
  // world: each drive's mirror reads as that drive (C:, D:...), the / mirror as / (Unix paths keep their slashes)
  const worldMaps = worldDir ? [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((d) => [path.join(worldDir, d), `${d}:`]).concat([[path.join(worldDir, '_'), '\u0001']]) : [];
  const neutralRaw = neutralizer({ maps: [...worldMaps, ...(homeDir ? [[homeDir, 'C:\\Users\\you']] : []), [tmp, 'C:\\Users\\you\\AppData\\Local\\Bob']] });
  const neutral = worldDir ? (text) => neutralRaw(text).replace(/\u0001([^\s"'<>|]*)/g, (m, rest) => rest.replace(/\\+/g, '/') || '/') : neutralRaw;
  const inTmp = (p) => { const r = path.resolve(p).toLowerCase(), t = path.resolve(tmp).toLowerCase(); return r === t || r.startsWith(t + path.sep); };
  const realHome = os.homedir();
  const underRealHome = (v) => { if (!realHome) return false; const rh = path.resolve(realHome).toLowerCase(), r = path.resolve(v).toLowerCase(); return r === rh || r.startsWith(rh + path.sep); };
  const rest = (v, m) => v.slice(m[0].length).split(/[\\/]+/).filter(Boolean);
  // C:\Users\you\... (or ~/...) in a tool call -> the real throwaway path, so the real tool runs on the lesson's own files;
  // Bob's own folder as shown (C:\Users\you\AppData\Local\Bob) -> the throwaway folder; with world on, any other
  // absolute path -> its mirror (a path under this PC's real home is left for homeIn, which moves it into the home)
  const toReal = (v) => {
    if (typeof v === 'string') {
      if (homeDir) {
        const b = v.match(/^(?:[A-Za-z]:)?[\\/]+Users[\\/]+you[\\/]+AppData[\\/]+Local[\\/]+Bob(?=$|[\\/])/i);
        if (b) return path.join(tmp, ...rest(v, b));
        const m = v.match(/^(?:[A-Za-z]:)?[\\/]+Users[\\/]+you(?=$|[\\/])|^~(?=$|[\\/])/i);
        if (m) return path.join(homeDir, ...rest(v, m));
      }
      if (worldDir && v.length < 600 && !/[\r\n]/.test(v) && !inTmp(v) && !underRealHome(v)) {
        const d = v.match(/^([A-Za-z]):(?=$|[\\/])/);
        if (d) return path.join(worldDir, d[1].toUpperCase(), ...rest(v, d));
        const u = v.match(/^[\\/]+/);
        if (u) return path.join(worldDir, '_', ...rest(v, u));
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(toReal);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toReal(x)]));
    return v;
  };
  // 15 Nov (the loop test saved a file in the Lab PC's real Documents): a tool run for real may only touch the throwaway
  // folder. A path under the PC's real home is moved into the throwaway home; any other path outside the throwaway folder
  // is refused before the tool runs, and the tool's own check (the one Bob runs before the OK card) runs first, as live.
  // 16 Nov (office coverage): compare_files' two paths are "first" and "second", and office_edit's new copy is "save_as";
  // none matched, so they stayed C:\\Users\\you\\... and compare_files failed every time ("Give the full path")
  const PATH_KEY = /path|file|folder|dir|dest|src|root|target|save_to|save_as|^to$|^from$|^out|^first$|^second$/i;
  const homeIn = (v) => {
    if (typeof v !== 'string' || !homeDir || !realHome || inTmp(v)) return v;
    const rh = path.resolve(realHome), r = path.resolve(v);
    return r.toLowerCase() === rh.toLowerCase() || r.toLowerCase().startsWith(rh.toLowerCase() + path.sep) ? path.join(homeDir, r.slice(rh.length)) : v;
  };
  const looksPath = (v) => typeof v === 'string' && v.length < 600 && !/[\r\n]/.test(v) && /^(?:[A-Za-z]:[\\/]|[\\/]|~)/.test(v.trim());
  const sandboxArgs = (args) => {
    const out = {}; let bad = '';
    for (const [k, v] of Object.entries(args || {})) {
      const fix = (x) => { if (!PATH_KEY.test(k) || !looksPath(x)) return x; const r = homeIn(toReal(x.trim())); if (!inTmp(r)) bad = bad || x; return r; };
      out[k] = Array.isArray(v) ? v.map(fix) : fix(v);
    }
    return { args: out, bad };
  };
  async function runReal(name, args, ctx = {}) {
    const tool = brain.tools[name];
    if (!tool) throw new Error(`no tool called ${name}`);
    const { args: a, bad } = sandboxArgs(args);
    if (bad) throw new Error(`${neutral(bad)} is outside the folders Bob may use here`);
    if (typeof tool.check === 'function') await tool.check(a, ctx); // Bob's own permission check (roots, secrets, read-only), as before the OK card
    return tool.run(a, ctx);
  }
  // a path as the brain writes it -> where it really is in this throwaway folder (or '' when it would be outside it)
  const place = (p) => { if (typeof p !== 'string' || !p.trim()) return ''; const r = homeIn(toReal(p.trim())); return inTmp(r) ? path.resolve(r) : ''; };
  // let Bob use one more folder (a scene's folder: as the user ticking it in Settings, Hands); it is made if missing
  const allow = (p) => {
    const r = place(p);
    if (!r || r === path.resolve(tmp)) return '';
    fs.mkdirSync(r, { recursive: true });
    for (const list of [cfg.readRoots, cfg.hands.folders]) if (!list.some((x) => path.resolve(x).toLowerCase() === r.toLowerCase())) list.push(r);
    return r;
  };
  const kit = {
    bobDir, bobSrc, neutral, toReal, homeDir, worldDir, place, allow, inTmp, cfg, toolShapes, runReal, sandboxArgs,
    brain, phrasings, tmp,
    groups: () => tb.groupsFor(brain),
    guessGroups: (text) => tb.guessGroups(brain, text),
    groupOf: (name) => tb.groupOf(brain, name),
    // The front desk's prompt and tools for a turn with these groups added (Bob's own frontDeskTools/withLimits).
    toolSet,
    turn(loaded = new Set()) {
      if (toolSet) loaded.toolSet = toolSet; // 15 Nov: the family's shape, as Bob's loop sets it (brain-run-on.js)
      const sys = brain.withLimits(systemPrompt({ now: brain.now(), memory: '', user: 'the user', backstory: brain.backstory(), about: '', cat: 'Patches' }), loaded);
      return { system: neutral(sys), tools: JSON.parse(neutral(JSON.stringify(brain.frontDeskTools(loaded)))) };
    },
    allTools: () => brain.toolSchemas(Object.keys(brain.tools), toolSet),
    // the hash of every tool this Bob can offer right now, with the switches as they are (null on an older Bob)
    toolHash: () => { try { return shapeOf ? shapeOf(brain, toolSet) : null; } catch { return null; } },
    // Runs use_tools the way Bob does (adds the group), so a lesson can go on to the real tool.
    useTools(args, loaded) { return brain.tools.use_tools.run(args, { loaded }); },
    done() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  };
  return kit;
}

// The Lab PC's home folder and user name -> C:\Users\you and "you", in either slash style, any case. Takes the
// real values in, so a test can pass fakes.
export function neutralizer({ home = os.homedir(), user = (() => { try { return os.userInfo().username; } catch { return ''; } })(), maps = [] } = {}) {
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forms = new Set();
  if (home && home.length > 3) for (const h of [home, home.replace(/\\/g, '/'), home.replace(/\//g, '\\'), home.replace(/\\/g, '\\\\')]) forms.add(h);
  const rx = forms.size ? new RegExp([...forms].sort((a, b) => b.length - a.length).map(esc).join('|'), 'gi') : null;
  const ux = user && user.length > 2 && !/^(you|user|root|admin)$/i.test(user) ? new RegExp(`(?<![\\p{L}\\p{N}])${esc(user)}(?![\\p{L}\\p{N}])`, 'giu') : null;
  // exact folders first (a throwaway home inside the temp folder, then the temp folder), in both slash styles and as JSON
  const mx = maps.filter(([a]) => a && a.length > 3).flatMap(([a, b]) => [[a, b], [a.replace(/\\/g, '/'), b.replace(/\\/g, '/')], [a.replace(/\\/g, '\\\\'), b.replace(/\\/g, '\\\\')]]);
  return (text) => {
    let t = String(text ?? '');
    for (const [a, b] of mx) t = t.split(a).join(b);
    if (mx.length) t = t.replace(/(C:\\(?:\\)?Users\\(?:\\)?you)((?:\/[^\s"'<>|/]+)+)/g, (m, p, rest) => p + rest.replace(/\//g, p.includes('\\\\') ? '\\\\' : '\\')); // a Linux test machine's slashes, Windows style
    if (rx) t = t.replace(rx, (m) => (m.includes('/') && !m.includes('\\') ? 'C:/Users/you' : m.includes('\\\\') ? 'C:\\\\Users\\\\you' : 'C:\\Users\\you'));
    if (ux) t = t.replace(ux, 'you');
    // any lab temp folder left over (another run's, or one made before this kit) -> Bob's own folder, same slash style
    t = t.replace(/C:(\\\\|\\|\/)Users\1you\1AppData\1Local\1Temp\1bob-lab-[A-Za-z0-9]+/gi, (m, s) => ['C:', 'Users', 'you', 'AppData', 'Local', 'Bob'].join(s));
    t = t.replace(/\/tmp\/bob-lab-[A-Za-z0-9]+/g, 'C:\\Users\\you\\AppData\\Local\\Bob');
    return t;
  };
}
