// Bob's real front desk, borrowed from a Bob source tree: his system prompt and his tool list, exactly as he sends
// them, with a throwaway settings folder (no chats, notes, memory or names from anyone's own Bob).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// howtos: a how-to file ({ howtos: [{ name, when, steps }] }) put in the throwaway Bob first, so the quiz can see them.
export async function loadBob(bobDir, { howtos = '' } = {}) {
  // a repository folder works as well as its app folder (Bob's files sit in app/ since Nov 9)
  if (!fs.existsSync(path.join(bobDir, 'src')) && fs.existsSync(path.join(bobDir, 'app', 'src'))) bobDir = path.join(bobDir, 'app');
  const src = (f) => pathToFileURL(path.join(bobDir, 'src', f)).href;
  if (!fs.existsSync(path.join(bobDir, 'src', 'brain.js'))) throw new Error(`No Bob source tree at ${bobDir} (src/brain.js missing). Pass --bob <folder>.`);
  const { Brain } = await import(src('brain.js'));
  const { systemPrompt } = await import(src('persona.js'));
  const tb = await import(src('toolbox.js'));
  let phrasings = [];
  try { phrasings = (await import(pathToFileURL(path.join(bobDir, 'test', 'phrasings.js')).href)).PHRASINGS; } catch {}

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-'));
  const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), painterDir = path.join(innDir, 'painter');
  for (const d of [dataDir, painterDir]) fs.mkdirSync(d, { recursive: true });
  const f = (n) => { const p = path.join(tmp, n); fs.writeFileSync(p, 'x'); return p; };
  // Every maker "set up" with stand-in files, so Bob's prompt and tools are the ones a fully equipped Bob has.
  const sdcpp = { exe: f('sd.exe'), image: { diffusionModel: f('z.gguf') }, edit: { diffusionModel: f('qie.gguf'), vae: f('vae.st'), llm: f('vl.gguf') } };
  const hands = Object.fromEntries(['files', 'run', 'schedules', 'apps', 'office', 'security', 'maker', 'mcp'].map((h) => [h, { on: true }]));
  const cfg = {
    agentDir, innDir, dataDir, painterDir, defaultPainterDir: painterDir, settingsFile: path.join(dataDir, 'settings.json'),
    readRoots: [innDir], readOnlyRoots: [], recycleBin: false,
    models: { bob: 'qwen3.6-35b-a3b' }, engine: 'llamacpp', ollamaUrl: 'http://127.0.0.1:1',
    painter: { engine: 'sdcpp', sdcpp }, stt: { provider: 'http' },
    hands: { enabled: true, ...hands, folders: [innDir] }, howtos: true, // 12 Nov: Bob reads cfg.howtos === true; { on: true } left the how-to tools out of every quiz
    // Web search on, so fresh-facts lessons teach web_search (with it off, Bob offers the switch instead).
    webSearch: true
  };
  if (howtos) {
    const list = (JSON.parse(fs.readFileSync(howtos, 'utf8')).howtos || []).map((r, i) => ({ id: 'seed-' + i, made: Date.now(), used: 0, ...r }));
    fs.writeFileSync(path.join(dataDir, 'howtos.json'), JSON.stringify({ howtos: list }, null, 1));
  }
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  for (const k of Object.keys(brain)) { const v = brain[k]; if (v && typeof v === 'object' && v.timer) try { clearInterval(v.timer); } catch {} }

  const kit = {
    brain, phrasings, tmp,
    groups: () => tb.groupsFor(brain),
    guessGroups: (text) => tb.guessGroups(brain, text),
    groupOf: (name) => tb.groupOf(brain, name),
    // The front desk's prompt and tools for a turn with these groups added (Bob's own frontDeskTools/withLimits).
    turn(loaded = new Set()) {
      const sys = brain.withLimits(systemPrompt({ now: brain.now(), memory: '', user: 'the user', backstory: brain.backstory(), about: '', cat: 'Patches' }), loaded);
      return { system: sys, tools: brain.frontDeskTools(loaded) };
    },
    allTools: () => brain.toolSchemas(Object.keys(brain.tools)),
    // Runs use_tools the way Bob does (adds the group), so a lesson can go on to the real tool.
    useTools(args, loaded) { return brain.tools.use_tools.run(args, { loaded }); },
    done() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  };
  return kit;
}
