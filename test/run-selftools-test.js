// "Make his own tools" (1.5.48): the Hand is off until switched on; the plain checks; pinned downloads; the sandbox
// really holds (no reading outside, no starting programs); the reviewer's moot is always asked and announced; one
// card; the tool works after the OK; a changed file turns it off; turn off, remove; the toolbox finds it by name;
// it never joins an "all together" card.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HANDS, toolsOff, cleanHands } from '../src/hands-settings.js';
import { selfToolsTools, cleanSpec, codeProblems, pinProblem, sandboxHolds, runSandboxed, listTools, usableTools, setToolOn, removeTool, toolDir, makerWords, makerPrompt, selfToolsView, MAX_TOOLS } from '../src/selftools.js';
import { groupsFor, guessGroups } from '../src/toolbox.js';
import { gather } from '../src/together.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-selftools-'));
const inn = path.join(tmp, 'inn');
const work = path.join(tmp, 'Work');
const secret = path.join(tmp, 'Private');
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(secret, { recursive: true });
fs.writeFileSync(path.join(work, 'in.csv'), 'a,b\n1,2\n');
fs.writeFileSync(path.join(secret, 'diary.txt'), 'private');
const on = { enabled: true, maker: { on: true }, folders: [work] };
const cfg = { innDir: inn, dataDir: path.join(inn, 'bob'), agentDir: tmp, readOnlyRoots: [], readRoots: [work], userName: 'Sam', hands: on, models: { bob: 'gemma4:e4b', reviewer: 'gpt-oss:20b' } };

// ---------- the Hand ----------
check('there is a Make his own tools Hand with its three tools', HANDS.maker?.label === 'Make his own tools' && ['make_tool', 'use_my_tool', 'my_tools'].every((t) => HANDS.maker.tools.includes(t)));
check('it is off to start with, and its tools are hidden', cleanHands({}).maker.on === false && ['make_tool', 'use_my_tool', 'my_tools'].every((t) => toolsOff({}).includes(t)));
check('Help explains it, the settings row, the sandbox word and an FAQ', ['hands-maker', 'faq-own-tools'].every((id) => HELP.some((e) => e.id === id)) && /Tools Bob made/.test(HELP.find((e) => e.id === 'settings-hands').html) && /<dt>Sandbox<\/dt>/.test(HELP.find((e) => e.id === 'glossary').html));
check('Help is honest that cutting the internet may not be airtight', /isn't airtight/.test(HELP.find((e) => e.id === 'hands-maker').html));
check('his prompt line only while it is on', /make_tool/.test(makerPrompt(cfg)) && makerPrompt({ ...cfg, hands: {} }) === '');

// ---------- plain checks ----------
const GOOD = `import fs from 'node:fs';
import path from 'node:path';
export async function run(input) {
  const text = fs.readFileSync(input.file, 'utf8');
  const [head, ...rows] = text.trim().split(/\\r?\\n/).map((l) => l.split(','));
  return JSON.stringify(rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))));
}`;
{
  const base = { name: 'csv_to_json', what: 'Turns a CSV file into JSON rows.', inputs: { file: { type: 'string', description: 'The CSV file' } }, reads: [work], test: { file: path.join(work, 'in.csv') } };
  const { spec, problems } = cleanSpec(cfg, base);
  check('a good tool passes the card checks', !problems.length && spec.name === 'csv_to_json' && spec.reads[0] === path.resolve(work), problems.join('; '));
  check('a good tool passes the code checks', !codeProblems(cfg, GOOD, spec).length, codeProblems(cfg, GOOD, spec).join('; '));
  check('a bad name is refused', cleanSpec(cfg, { ...base, name: 'Rm -rf!' }).problems.length > 0);
  check('a folder not ticked for Hands is refused', /isn't one of the folders ticked/.test(cleanSpec(cfg, { ...base, reads: [secret] }).problems.join(' ')));
  check("Bob's own folders are refused", /Bob's own folders/.test(cleanSpec(cfg, { ...base, writes: [cfg.dataDir] }).problems.join(' ')));
  check('a test input is needed', /sample input/.test(cleanSpec(cfg, { ...base, test: undefined }).problems.join(' ')));
  const bad = (code, s = spec) => codeProblems(cfg, code, s).join(' ');
  check('starting programs is refused', /starts other programs/.test(bad(`import cp from 'node:child_process'; export async function run(){ cp.execSync('dir'); }`)));
  check('eval and new Function are refused', /eval/.test(bad('export async function run(i){ return eval(i.x); }')) && /code out of text/.test(bad('export async function run(i){ return new Function(i.x)(); }')));
  check('require and import() are refused', /require/.test(bad('export async function run(){ return require("fs"); }')) && /loads more code/.test(bad('export async function run(){ return import("fs"); }')));
  check('packages are refused', /built-in parts/.test(bad(`import _ from 'lodash'; export async function run(){ return _.x; }`)));
  check('the internet is refused unless the card says so', /reaches the internet/.test(bad('export async function run(){ return (await fetch("https://example.com")).text(); }')) && /reaches the internet/.test(bad(`import https from 'node:https'; export async function run(){}`)));
  const net = { ...spec, internet: true };
  check('with internet on the card, a fetch is fine', !bad('export async function run(){ return (await fetch("https://example.com")).text(); }', net));
  check('with "Don\'t send anything out" on, an internet tool may not post', /sends things out/.test(bad('export async function run(){ return fetch("https://x.example", { method: "POST", body: "hi" }); }', net)));
  check('the Run Hand blocklist applies to the code', /formats a disk|shuts down/.test(bad('export async function run(){ return "shutdown /s /t 0"; }')));
  check('it needs a run function', /export async function run/.test(bad('export const x = 1;')));
}

// ---------- pinned downloads ----------
{
  const ok = { url: 'https://huggingface.co/a/b/resolve/0123456789abcdef0123456789abcdef01234567/model.bin', sha256: 'a'.repeat(64), bytes: 1000, file: 'model.bin' };
  check('an exact Hugging Face commit is pinned', pinProblem(ok) === '');
  check('a Hugging Face "main" link is refused', /newest|exact commit/.test(pinProblem({ ...ok, url: 'https://huggingface.co/a/b/resolve/main/model.bin' })));
  check('a GitHub "latest" release is refused', /newest/.test(pinProblem({ ...ok, url: 'https://github.com/o/r/releases/latest/download/x.zip' })));
  check('a GitHub release file is pinned', pinProblem({ ...ok, url: 'https://github.com/o/r/releases/download/v1.2.3/x.zip' }) === '');
  check('no sha256 is refused', /sha256/.test(pinProblem({ ...ok, sha256: '' })));
  check('http is refused', /https/.test(pinProblem({ ...ok, url: 'http://example.com/x' })));
  check('a package without an exact version is refused', /exact version/.test(pinProblem({ ...ok, url: 'https://cdn.jsdelivr.net/npm/lodash/lodash.js' })));
}

// ---------- the sandbox ----------
const holds = await sandboxHolds(cfg);
check('the sandbox holds on this machine (no reading outside, no starting programs)', holds.ok, holds.why);
{
  const dir = path.join(tmp, 'sbx');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tool.mjs'), `import fs from 'node:fs';
export async function run(i, { workDir }) {
  const r = {};
  try { fs.readFileSync(${JSON.stringify(path.join(secret, 'diary.txt'))}, 'utf8'); r.secret = 'read'; } catch (e) { r.secret = e.code; }
  try { fs.writeFileSync(${JSON.stringify(path.join(work, 'x.txt'))}, 'x'); r.write = 'wrote'; } catch (e) { r.write = e.code; }
  fs.writeFileSync(workDir + '/ok.txt', 'ok'); r.work = 'ok';
  r.keys = Object.keys(process.env).filter((k) => /KEY|TOKEN|SECRET/i.test(k)).length;
  r.fetch = typeof fetch;
  return r;
}`);
  process.env.BOB_TEST_API_KEY = 'shh';
  const r = await runSandboxed({ dir, input: {}, reads: [work] });
  let o = {};
  try { o = JSON.parse(r.out); } catch {}
  check('a tool can\'t read a folder that isn\'t on its card', o.secret === 'ERR_ACCESS_DENIED', JSON.stringify(r));
  check('a tool can\'t write a folder it may only read', o.write === 'ERR_ACCESS_DENIED');
  check('a tool can write its own work folder', o.work === 'ok' && fs.existsSync(path.join(dir, 'work', 'ok.txt')));
  check('a tool gets no keys and no fetch without internet', o.keys === 0 && o.fetch === 'undefined');
  // A Mac's temp folder is reached through a link (/var -> /private/var); a tool in a linked folder must still run.
  {
    const linked = path.join(tmp, 'linked');
    try { fs.symlinkSync(path.dirname(dir), linked, 'junction'); } catch {}
    if (fs.existsSync(linked)) {
      const ld = path.join(linked, path.basename(dir));
      fs.writeFileSync(path.join(dir, 'tool.mjs'), 'export async function run(){ return "linked ok"; }');
      const lr = await runSandboxed({ dir: ld, input: {}, reads: [path.join(linked, 'nothing')] });
      check('a tool in a folder reached through a link still runs (the Mac temp folder)', lr.ok && lr.out === 'linked ok', JSON.stringify(lr));
    }
  }
  fs.writeFileSync(path.join(dir, 'tool.mjs'), 'export async function run(){ while (true) {} }');
  const slow = await runSandboxed({ dir, input: {}, timeoutSec: 5 });
  check('a tool that runs too long is stopped', !slow.ok && slow.timedOut);
}

// ---------- making one: checks, test, moot, one card, add, use ----------
const events = [];
let verdict = 'PASS\nDoes what it says; reads only the CSV.';
let reviewAsked = 0;
const brain = {
  cfg, log: () => {},
  async ensureModel(m) { return m; },
  async chatSafe(opts) { reviewAsked++; brain.lastModel = opts.model; return { content: verdict }; }
};
const t = selfToolsTools(brain);
const ctx = { emit: (e) => events.push(e), signal: new AbortController().signal };
const args = { name: 'csv_to_json', what: 'Turns a CSV file into JSON rows.', inputs: { file: { type: 'string', description: 'The CSV file' } }, code: GOOD, reads: [work], test: { file: path.join(work, 'in.csv') } };
{
  let offErr = '';
  try { await selfToolsTools({ ...brain, cfg: { ...cfg, hands: {} } }).make_tool.check(args, {}); } catch (e) { offErr = e.message; }
  check('with the Hand off, make_tool says where the switch is', /Make his own tools/.test(offErr) && /Settings/.test(offErr), offErr);
  const need = await t.make_tool.check(args, ctx);
  check('the test ran and the card says it in words', /Tried it on file = Work.in.csv: 1 item \(a = 1, b = 2\)\. Worked\./.test(need.newTool.test) && /"a":"1"/.test(need.newTool.testRaw), need.newTool.test);
  check('the reviewer was asked on the Review slot brain', reviewAsked === 1 && brain.lastModel === 'gpt-oss:20b');
  const notes = events.filter((e) => e.type === 'announce').map((e) => e.text);
  check('the chat says plainly it is a moot, and how it ended', notes.some((x) => /calls a moot/.test(x) && /csv_to_json/.test(x)) && notes.some((x) => /Moot over: .* passed csv_to_json/.test(x)), notes.join(' | '));
  check('one card: what it does, what it reads, the verdict and the code', need.button === 'Add tool' && need.newTool.reads[0] === path.resolve(work) && /PASS/.test(need.newTool.review) && need.newTool.code === GOOD && need.newTool.internet === 'No');
  check('nothing is added before the OK', listTools(cfg).length === 0);
  const added = await t.make_tool.run(args, ctx);
  check('after the OK it is added and listed as on', /Added the tool "csv_to_json"/.test(added) && usableTools(cfg).map((x) => x.name).join() === 'csv_to_json');
  check('a tool that only reads needs no card to use', (await t.use_my_tool.check({ name: 'csv_to_json', input: {} })) === false);
  const out = await t.use_my_tool.run({ name: 'csv_to_json', input: { file: path.join(work, 'in.csv') } }, ctx);
  check('it works', /"b":"2"/.test(out), out);
  check('use_my_tool lists it with its inputs', /csv_to_json: Turns a CSV file/.test(t.use_my_tool.schema.function.description) && t.use_my_tool.schema.function.parameters.properties.name.enum[0] === 'csv_to_json');
  check('the toolbox finds it by name', makerWords(cfg).test('run the csv thing') && guessGroups({ cfg, usable: () => true }, 'use the csv tool').includes('maker'));
  check('the group says what it is for and names it', /csv_to_json/.test(groupsFor({ cfg, usable: () => true }).maker.what));
}

// ---------- the reviewer says no ----------
{
  verdict = 'FAIL\nIt reads more than it says.';
  const a2 = { ...args, name: 'peek_tool', what: 'Looks at a file and says how long it is.' };
  let e1 = '', e2 = '';
  try { await t.make_tool.check(a2, ctx); } catch (e) { e1 = e.message; }
  try { await t.make_tool.check(a2, ctx); } catch (e) { e2 = e.message; }
  check('a no from the reviewer goes back to Bob to fix once', /reviewer said no/.test(e1) && /Fix the real problems once/.test(e1));
  check('a second no drops it, and Bob is told to say why', /dropped/.test(e2) && !fs.existsSync(path.join(inn, 'tools', '_drafts', 'peek_tool')));
  verdict = 'PASS';
}

// ---------- a tool that changes files asks each time ----------
{
  const a3 = { name: 'note_writer', what: 'Writes a short note file into the Work folder.', inputs: { text: { type: 'string', description: 'The note' } }, writes: [work], test: { text: 'hi' },
    code: `import fs from 'node:fs';\nimport path from 'node:path';\nexport async function run(i) { fs.writeFileSync(path.join(${JSON.stringify(work)}, 'note.txt'), String(i.text)); return 'saved'; }` };
  await t.make_tool.check(a3, ctx);
  await t.make_tool.run(a3, ctx);
  const need = await t.use_my_tool.check({ name: 'note_writer', input: { text: 'yo' } });
  check('a tool that changes files shows a card when used', need && /can change files/.test(need.text) && need.button === 'Run it');
  check('it really writes there after the OK', (await t.use_my_tool.run({ name: 'note_writer', input: { text: 'yo' } }, ctx)) === 'saved' && fs.readFileSync(path.join(work, 'note.txt'), 'utf8') === 'yo');
}

// ---------- changed files, off, remove ----------
{
  fs.appendFileSync(path.join(toolDir(cfg, 'csv_to_json'), 'tool.mjs'), '\n// sneaky');
  check('a tool whose files changed after the OK is turned off', listTools(cfg).find((x) => x.name === 'csv_to_json').state === 'changed');
  let e = '';
  try { await t.use_my_tool.run({ name: 'csv_to_json', input: {} }, ctx); } catch (x) { e = x.message; }
  check('and Bob says why instead of running it', /changed since it was OK'd/.test(e), e);
  let e2 = '';
  try { setToolOn(cfg, 'csv_to_json', true); } catch (x) { e2 = x.message; }
  check('it can\'t just be switched back on', /checked again/.test(e2));
  setToolOn(cfg, 'note_writer', false);
  check('turned off: not usable, still listed', !usableTools(cfg).some((x) => x.name === 'note_writer') && listTools(cfg).some((x) => x.name === 'note_writer' && x.state === 'off'));
  check('removing asks first', /Recycle Bin/.test(t.my_tools.check({ action: 'remove', name: 'note_writer' })));
  removeTool(cfg, 'note_writer');
  check('removed: gone from the list and its folder is gone', !listTools(cfg).some((x) => x.name === 'note_writer') && !fs.existsSync(toolDir(cfg, 'note_writer')));
  check('Settings sees the list, the limit and the sandbox', selfToolsView(cfg).max === MAX_TOOLS && selfToolsView(cfg).tools.length === 1 && selfToolsView(cfg).sandbox?.ok === true);
  check('Bob can list them, saying which are off', /csv_to_json: .*off: its files changed/.test(await t.my_tools.run({ action: 'list' })));
}

// ---------- never on an "all together" card ----------
{
  const fake = { tools: { make_tool: t.make_tool }, usable: () => true };
  const items = await gather(fake, [{ tool: 'make_tool', args }], { allowAll: new Set() });
  check('make_tool gets its own card, not one on the combined card', items.length === 0);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
