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
export async function loadBob(bobDir, { howtos = '', allowOld = false, home = false, family = '' } = {}) {
  // a repository folder works as well as its app folder (Bob's files sit in app/ since Nov 9)
  if (!fs.existsSync(path.join(bobDir, 'src')) && fs.existsSync(path.join(bobDir, 'app', 'src'))) bobDir = path.join(bobDir, 'app');
  const src = (f) => pathToFileURL(path.join(bobDir, 'src', f)).href;
  if (!fs.existsSync(path.join(bobDir, 'src', 'brain.js'))) throw new Error(`No Bob source tree at ${bobDir} (src/brain.js missing). Pass --bob <folder>.`);
  const bobSrc = checkBobSource(bobDir, path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), { allowOld });
  const { Brain } = await import(src('brain.js'));
  const { systemPrompt } = await import(src('persona.js'));
  const tb = await import(src('toolbox.js'));
  let toolShapes = null; try { toolShapes = (await import(src('tool-sets.js'))).TOOL_SHAPES ?? null; } catch {} // the tool-shape version this Bob's lessons are written for
  let phrasings = [];
  try { phrasings = (await import(pathToFileURL(path.join(bobDir, 'test', 'phrasings.js')).href)).PHRASINGS; } catch {}

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-'));
  const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), painterDir = path.join(innDir, 'painter');
  for (const d of [dataDir, painterDir]) fs.mkdirSync(d, { recursive: true });
  const f = (n) => { const p = path.join(tmp, n); fs.writeFileSync(p, 'x'); return p; };
  // Every maker "set up" with stand-in files, so Bob's prompt and tools are the ones a fully equipped Bob has.
  const sdcpp = { exe: f('sd.exe'), image: { diffusionModel: f('z.gguf') }, edit: { diffusionModel: f('qie.gguf'), vae: f('vae.st'), llm: f('vl.gguf') } };
  const hands = Object.fromEntries(['files', 'run', 'schedules', 'apps', 'office', 'security', 'maker', 'mcp'].map((h) => [h, { on: true }]));
  const homeDir = home ? path.join(tmp, 'home') : '';
  if (homeDir) for (const d of ['Documents', 'Desktop', 'Downloads']) fs.mkdirSync(path.join(homeDir, d), { recursive: true });
  const cfg = {
    agentDir, innDir, dataDir, painterDir, defaultPainterDir: painterDir, settingsFile: path.join(dataDir, 'settings.json'),
    readRoots: homeDir ? [innDir, homeDir] : [innDir], readOnlyRoots: [], recycleBin: false,
    models: { bob: 'qwen3.6-35b-a3b' }, engine: 'llamacpp', ollamaUrl: 'http://127.0.0.1:1',
    painter: { engine: 'sdcpp', sdcpp }, stt: { provider: 'http' },
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
  const neutral = neutralizer({ maps: [...(homeDir ? [[homeDir, 'C:\\Users\\you']] : []), [tmp, 'C:\\Users\\you\\AppData\\Local\\Bob']] });
  // C:\Users\you\... (or ~/...) in a tool call -> the real throwaway path, so the real tool runs on the lesson's own files
  const toReal = (v) => {
    if (typeof v === 'string') {
      const m = homeDir && v.match(/^(?:[A-Za-z]:)?[\\/]+Users[\\/]+you(?=$|[\\/])|^~(?=$|[\\/])/i);
      return m ? path.join(homeDir, ...v.slice(m[0].length).split(/[\\/]+/).filter(Boolean)) : v;
    }
    if (Array.isArray(v)) return v.map(toReal);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toReal(x)]));
    return v;
  };
  const kit = {
    bobSrc, neutral, toReal, homeDir, toolShapes,
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
