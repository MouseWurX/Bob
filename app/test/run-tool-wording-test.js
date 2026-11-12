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
// 1.5.204: seven new tools (3D model and part, tool packs x3, look_at_job, pass_note), all off until switched on,
// took the total from 39,000 to about 42,800. Each one is still under the per-tool limits above.
// Nov 11 (the 50 improvements): git_look and ask_user are new, and edit_file, search_files, list_folder and remember
// each gained an optional input, so the cap moved from 43,000 to 45,000. Sort and rename (sort_files, off until
// switched on) adds about 430 more, and the Everyday helpers' spending_sheet (off until switched on, and hidden
// while off) about 640.
check('all tools together stay under 46,200 characters', size(all) < 46200, String(size(all)));
const core = all.filter((f) => CORE.includes(f.name));
// 1.5.207: reminders gained urgent (quiet hours) and offer_setup's list grew with the new opt-in switches; the
// descriptions were trimmed to make room, and the cap moved from 8,000 to 8,100.
check('the tools every chat starts with stay under 8,100 characters', size(core) < 8100, String(size(core)));
check('no tool talks about GPU plumbing the brain can\'t act on', !all.some((f) => /steps out of the GPU/.test(f.description)));

// "Let Bob learn from his tools": the line he kept is on the tool he is handed, and runTool keeps it.
cfg.toolLearning = true;
const job = { emit: () => {}, signal: new AbortController().signal };
await brain.runTool('read_file', { path: 'notes.txt' }, job);
fs.writeFileSync(path.join(innDir, 'notes.txt'), 'hi');
await brain.runTool('read_file', { path: path.join(innDir, 'notes.txt') }, job);
const rf = brain.toolSchemas(['read_file'])[0].function.description;
check('with the switch on, read_file carries what fixed it last time', /Last time: .* was fixed by: path/.test(rf), rf);
cfg.toolLearning = false;
check('with it off, the description is the plain one', !/Last time/.test(brain.toolSchemas(['read_file'])[0].function.description));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
