// Start-of-job budget (1.5.207, owner: "we don't want to be filling the context window of the agent before he can
// start his job"). What the brain reads before the user's first word, measured through Bob's real first request
// (instructions, notes and the tools handed over), from a fresh home made from config.example.json.
// Measured for 1.5.207: defaults 14,275 characters (about 4,000 tokens: instructions 8,500, 11 tools 5,750);
// everything switched on, every tool group loaded at the start: 47,700 (about 13,300 tokens, 59 tools).
// PC test (Windows): 50,101, over the cap, because the Apps Hand adds 3 Windows-only tools. Trimmed (Hands paragraph
// repeating the tool descriptions, approval sentences the cards already cover, the board layout now comes with an
// empty board): defaults 13,967; everything on 45,300 on Linux and Mac, 47,290 on Windows (62 tools).
// Measured for every system, with room: everything on must leave at least 1,500 characters under 50,000.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const DEFAULT_CAP = 15500, ALL_CAP = 48500;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-start-'));
const conf = path.join(tmp, 'config.json');
fs.copyFileSync(path.join(app, 'config.example.json'), conf);
process.env.BOB_CONFIG = conf; process.env.BOB_AGENT_DIR = tmp;
const { loadConfig } = await import('../src/config.js');
const { Brain } = await import('../src/brain.js');
const { HANDS } = await import('../src/hands-settings.js');
const { promptChars } = await import('../src/token-count.js');

async function firstAsk(edit) {
  const cfg = loadConfig(); cfg.models = { ...(cfg.models || {}), bob: 'riker' }; cfg.userName = 'Sam'; cfg.autoSession = false; cfg.timeZone = 'UTC'; cfg.readRoots = [tmp];
  edit?.(cfg);
  const brain = new Brain(cfg, () => {}); clearInterval(brain.reminderTimer);
  brain.ensureModel = async () => 'riker'; brain.fitCtx = async () => 32768; brain.recall = async () => '';
  let first = null;
  brain.engine = { chat: async (o) => { first ||= o; return { role: 'assistant', content: 'ok' }; }, unloadAll: async () => [], loaded: async () => [], unload: async () => [], isLoaded: async () => true };
  brain.enqueue('main', 'hi');
  for (let i = 0; i < 400 && !first; i++) await new Promise((r) => setTimeout(r, 25));
  return first ? { chars: promptChars(first.messages || [], first.tools || []), tools: (first.tools || []).length, toolChars: JSON.stringify(first.tools || []).length } : null;
}

const def = await firstAsk();
check('a first request was made', Boolean(def));
check(`with the defaults, the start of a job stays under ${DEFAULT_CAP.toLocaleString('en')} characters (about 4,300 tokens)`, def && def.chars < DEFAULT_CAP, JSON.stringify(def));
check('with the defaults, only a dozen or so tools are handed over', def && def.tools <= 14, JSON.stringify(def));
// Every system: Windows has the most tools (the Apps Hand is Windows-only). handsOs reads BOB_PLATFORM each call.
const was = process.env.BOB_PLATFORM;
for (const [plat, label] of [['win32', 'Windows'], ['darwin', 'Mac'], ['linux', 'Linux']]) {
  process.env.BOB_PLATFORM = plat;
  const all = await firstAsk((cfg) => {
    cfg.webSearch = true; cfg.workshop = { enabled: true }; cfg.toolsAll = true; cfg.allTools = true;
    cfg.hands = { enabled: true, ...Object.fromEntries(Object.keys(HANDS).map((h) => [h, { on: true }])) };
  });
  check(`${label}, everything on: it stays under ${ALL_CAP.toLocaleString('en')} characters (room under 50,000)`, all && all.chars < ALL_CAP, JSON.stringify(all));
  if (plat === 'win32') check('Windows, everything on: the Windows-only Apps tools are counted', all && all.tools >= 60, JSON.stringify(all));
}
if (was === undefined) delete process.env.BOB_PLATFORM; else process.env.BOB_PLATFORM = was;
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
