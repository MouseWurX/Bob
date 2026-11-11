// Tool wording (Nov 11): Bob's tool descriptions are short and plain, and say what the tool does. "Less is more":
// every word here is read by the brain on every turn it has the tool. This keeps them from growing back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { CORE } from '../src/toolbox.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-wording-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], userName: 'Sam', models: { bob: 'x' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);

const all = Object.values(brain.tools).map((t) => t.schema.function);
const size = (list) => list.reduce((n, f) => n + JSON.stringify(f).length, 0);
const long = all.filter((f) => f.description.length > 420).map((f) => `${f.name} ${f.description.length}`);
check('every tool says what it does in at most 420 characters', !long.length, long.join(', '));
const params = all.flatMap((f) => Object.entries(f.parameters?.properties || {}).map(([k, v]) => [`${f.name}.${k}`, String(v.description || '')]));
const longP = params.filter(([, d]) => d.length > 240).map(([n, d]) => `${n} ${d.length}`);
check('every input is described in at most 240 characters', !longP.length, longP.join(', '));
check('every tool has a description', all.every((f) => f.description.trim().length > 10), all.filter((f) => f.description.trim().length <= 10).map((f) => f.name).join(', '));
// Before the wording pass: all tools ~47,500 characters, the starting core ~8,800.
check('all tools together stay under 42,000 characters', size(all) < 42000, String(size(all)));
const core = all.filter((f) => CORE.includes(f.name));
check('the tools every chat starts with stay under 8,000 characters', size(core) < 8000, String(size(core)));
check('no tool talks about GPU plumbing the brain can\'t act on', !all.some((f) => /steps out of the GPU/.test(f.description)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
