// Tool packs from other people (toolpacks.js): the Hand is off until switched on; the example pack passes the
// checks; bad packs are refused with plain reasons (programs, links, hidden code, missing files, bad paths); a pack
// comes in switched off, from a folder or a .zip; it only switches on where the sandbox holds; its tools ask every
// time (even without asking on), see only the paths on the card under the hard limits, and really run in the
// sandbox; a changed file switches it off; an update switches it off; jobs are words with a "someone else's" note;
// remove; the toolbox finds it by name; Help, glossary and FAQ.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HANDS, toolsOff, cleanHands } from '../src/hands-settings.js';
import { checkPack, addPack, setPackOn, removePack, listPacks, packsOn, packsTools, planCall, pathProblem, packsWords, packsPrompt, packsView, packCode, packDir, MANIFEST } from '../src/toolpacks.js';
import { sandboxHolds } from '../src/selftools.js';
import { writeZip, collect } from '../src/zip.js';
import { groupsFor } from '../src/toolbox.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.join(here, '..', 'docs', 'tool-pack-example');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-packs-'));
const inn = path.join(tmp, 'inn');
const work = path.join(tmp, 'Work');
const other = path.join(tmp, 'Other');
for (const d of [work, other]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(work, 'story.txt'), 'one two three\nfour five\n');
fs.writeFileSync(path.join(work, '.env'), 'KEY=secret');
fs.writeFileSync(path.join(other, 'notes.txt'), 'not ticked');
const handsOn = { enabled: true, packs: { on: true }, folders: [work] };
const cfg = { innDir: inn, dataDir: path.join(inn, 'bob'), agentDir: tmp, recycleBin: false, readOnlyRoots: [], userName: 'Sam', hands: handsOn };
const copyDir = (from, to) => fs.cpSync(from, to, { recursive: true });
const pack = (name, edit) => { const d = path.join(tmp, 'src', name); fs.rmSync(d, { recursive: true, force: true }); copyDir(EXAMPLE, d); const j = JSON.parse(fs.readFileSync(path.join(d, MANIFEST), 'utf8').replace(/\r\n/g, '\n')); edit?.(j, d); fs.writeFileSync(path.join(d, MANIFEST), JSON.stringify(j)); return d; };
const problemsOf = (d) => checkPack(cfg, d).problems.join(' | ');

// ---------- the Hand ----------
check('there is a Tool packs from other people Hand with its three tools', HANDS.packs?.label === 'Tool packs from other people' && ['pack_tools', 'use_pack_tool', 'pack_job'].every((t) => HANDS.packs.tools.includes(t)));
check('it is off to start with, and its tools are hidden', cleanHands({}).packs.on === false && ['pack_tools', 'use_pack_tool', 'pack_job'].every((t) => toolsOff({}).includes(t)));

// ---------- the checks ----------
{
  const r = checkPack(cfg, EXAMPLE);
  check('the example pack in the docs passes every check', !r.problems.length && r.pack.id === 'word-tools' && r.pack.tools.length === 2 && r.pack.jobs.length === 1, r.problems.join(' | '));
  check('a path input is read access', r.pack.tools.find((t) => t.name === 'count_file_words').files === 'read' && r.pack.tools.find((t) => t.name === 'count_file_words').inputs.file.type === 'path');
  check('a folder without bob-pack.json is not a pack', /isn't a tool pack/.test(checkPack(cfg, work).problems.join(' ')));
  check('the format number is needed', /"bobPack": 1/.test(problemsOf(pack('nofmt', (j) => { delete j.bobPack; }))));
  check('a bad id is refused', /"id" must be/.test(problemsOf(pack('badid', (j) => { j.id = '../Evil'; }))));
  check('a program inside is refused', /no programs or scripts/.test(problemsOf(pack('exe', (j, d) => fs.writeFileSync(path.join(d, 'helper.exe'), 'MZ')))));
  check('a shell script inside is refused', /no programs or scripts/.test(problemsOf(pack('sh', (j, d) => fs.writeFileSync(path.join(d, 'tools', 'run.sh'), 'rm -rf /')))));
  let linked = true;
  try { fs.symlinkSync(path.join(other, 'notes.txt'), path.join(pack('link'), 'notes.txt')); } catch { linked = false; }
  check('a link to somewhere else is refused', !linked || /link to somewhere else/.test(problemsOf(path.join(tmp, 'src', 'link'))));
  check('a tool file outside the pack is refused', /must be a \.mjs file inside the pack/.test(problemsOf(pack('outside', (j) => { j.tools[0].file = '../../evil.mjs'; }))));
  check('a missing tool file is refused', /isn't in the pack/.test(problemsOf(pack('missing', (j) => { j.tools[0].file = 'tools/nope.mjs'; }))));
  check('starting programs is refused', /starts other programs/.test(problemsOf(pack('cp', (j, d) => fs.writeFileSync(path.join(d, 'tools', 'count_words.mjs'), `import cp from 'node:child_process'; export async function run(){ return cp.execSync('dir'); }`)))));
  check('eval is refused', /eval/.test(problemsOf(pack('eval', (j, d) => fs.writeFileSync(path.join(d, 'tools', 'count_words.mjs'), 'export async function run(i){ return eval(i.text); }')))));
  check('the internet without saying so is refused', /reaches the internet/.test(problemsOf(pack('net', (j, d) => fs.writeFileSync(path.join(d, 'tools', 'count_words.mjs'), 'export async function run(){ return (await fetch("https://example.com")).text(); }')))));
  check('sending out is refused while "Don\'t send anything out" is on', /sends things out/.test(problemsOf(pack('post', (j, d) => { j.tools[0].internet = true; fs.writeFileSync(path.join(d, 'tools', 'count_words.mjs'), 'export async function run(){ return fetch("https://x.example", { method: "POST", body: "hi" }); }'); }))));
  check('files "read" with no path input is refused', /no input has "type": "path"/.test(problemsOf(pack('nopath', (j) => { j.tools[0].files = 'read'; }))));
  check('a path input with files "none" is refused', /"files" must be "read" or "change"/.test(problemsOf(pack('pathnone', (j) => { j.tools[1].files = 'none'; }))));
  check('a pack with nothing in it is refused', /add nothing/.test(problemsOf(pack('empty', (j) => { j.tools = []; j.jobs = []; }))));
  check('two tools with one name are refused', /two tools have that name/.test(problemsOf(pack('dupe', (j) => { j.tools[1].name = j.tools[0].name; j.tools[1].file = j.tools[0].file; delete j.tools[1].files; j.tools[1].inputs = {}; }))));
}

// ---------- adding, switching on, removing ----------
const holds = await sandboxHolds(cfg);
console.log(`(sandbox on this test machine: ${holds.ok ? 'holds' : `doesn't hold: ${holds.why}`})`);
{
  let refused = '';
  try { addPack(cfg, pack('bad-add', (j) => { j.id = 'x!'; })); } catch (e) { refused = e.message; }
  check('a bad pack is not added, and says why', /can't be added/.test(refused) && /"id" must be/.test(refused) && !listPacks(cfg).length);
  check('a relative path is refused', (() => { try { addPack(cfg, 'word-tools'); return false; } catch (e) { return /full path/.test(e.message); } })());
  const r = addPack(cfg, pack('good'));
  check('a good pack is added, switched off', !r.updated && r.pack.id === 'word-tools' && r.pack.state === 'off' && fs.existsSync(path.join(packDir(cfg, 'word-tools'), MANIFEST)));
  check('Settings lists it with its tools and jobs', packsView(cfg).packs[0]?.tools.length === 2 && packsView(cfg).packs[0]?.jobs[0]?.steps.length === 4 && !('dir' in packsView(cfg).packs[0]));
  check('Show code shows a tool\'s code', /export async function run/.test(packCode(cfg, 'word-tools', 'count_words')));
  check('switched-off packs give Bob nothing', !packsOn(cfg).length && packsPrompt(cfg) === '');
  if (holds.ok) {
    await setPackOn(cfg, 'word-tools', true);
    check('it switches on where the sandbox holds', packsOn(cfg).length === 1 && /pack_tools/.test(packsPrompt(cfg)));
  } else {
    let why = '';
    try { await setPackOn(cfg, 'word-tools', true); } catch (e) { why = e.message; }
    check('it stays off where the sandbox doesn\'t hold, and says why', /sandbox doesn't hold/.test(why) && !packsOn(cfg).length);
  }
}

// ---------- using it ----------
{
  const brain = { cfg, log: () => {} };
  const t = packsTools(brain);
  check('use_pack_tool always asks, even when Bob works without asking', t.use_pack_tool.alwaysAsk === true);
  if (holds.ok) {
    const card = t.use_pack_tool.check({ pack: 'Word tools', tool: 'count_file_words', inputs: { file: path.join(work, 'story.txt') }, why: 'count it' });
    check('the card names the tool, the pack, who made it and the file it may read', /count_file_words/.test(card.text) && /Word tools pack/.test(card.text) && /by Bob's helpers/.test(card.text) && card.text.includes(path.join(work, 'story.txt')) && card.pack?.always === true && card.button === 'Allow');
    check('"Allow the rest of this job" only for tools that don\'t change files or use the internet', t.use_pack_tool.approvalGroup({ pack: 'word-tools', tool: 'count_words', inputs: { text: 'x' } }) === 'pack:word-tools:count_words');
    const refusedPath = (p) => { try { t.use_pack_tool.check({ pack: 'word-tools', tool: 'count_file_words', inputs: { file: p } }); return ''; } catch (e) { return e.message; } };
    check('a file outside the folders ticked for Hands is refused', /isn't in a folder ticked for Hands/.test(refusedPath(path.join(other, 'notes.txt'))));
    check('a file with keys or passwords is refused', /keys or passwords/.test(refusedPath(path.join(work, '.env'))));
    check("Bob's own folders are refused", /Bob's own folders/.test(refusedPath(path.join(cfg.dataDir, 'tool-packs.json'))));
    check('a relative path is refused', /isn't a full path/.test(refusedPath('story.txt')));
    check('missing and unknown inputs are refused', /needs: text/.test((() => { try { planCall(cfg, 'word-tools', 'count_words', {}); } catch (e) { return e.message; } })()) && /doesn't take/.test((() => { try { planCall(cfg, 'word-tools', 'count_words', { text: 'a', extra: 1 }); } catch (e) { return e.message; } })()));
    check('a read-only project can be read but not changed', pathProblem({ ...cfg, hands: { ...handsOn, readOnlyFolders: [other] } }, path.join(other, 'notes.txt'), 'read') === '' && /read-only|ticked/.test(pathProblem({ ...cfg, hands: { ...handsOn, readOnlyFolders: [other] } }, path.join(other, 'notes.txt'), 'change')));
    const out = await t.use_pack_tool.run({ pack: 'word-tools', tool: 'count_words', inputs: { text: 'one two three' } }, {});
    check('a tool runs in the sandbox and answers, marked as someone else\'s words', /"words": 3/.test(out) && /not from Sam/.test(out), out);
    const out2 = await t.use_pack_tool.run({ pack: 'word-tools', tool: 'count_file_words', inputs: { file: path.join(work, 'story.txt') } }, {});
    check('a tool reads exactly the file on its card', /"words": 5/.test(out2), out2);
    const job = await t.pack_job.run({ pack: 'word tools', job: 'Tidy a word list' });
    check('a job is its steps, marked as someone else\'s words', /1\. Read the list/.test(job) && /not from Sam/.test(job) && /can't change your settings/.test(job));
    const list = await t.pack_tools.run({});
    check('pack_tools lists the tools, inputs and jobs', /count_words/.test(list) && /full path/.test(list) && /Tidy a word list/.test(list));
    check('the toolbox finds the pack by its name and its tools', groupsFor({ cfg, usable: () => true }).packs && packsWords(cfg).test('use count_words please') && packsWords(cfg).test('the Word tools pack'));
    // A changed file switches it off.
    const toolFile = path.join(packDir(cfg, 'word-tools'), 'tools', 'count_words.mjs');
    fs.appendFileSync(toolFile, '\n// changed\n');
    check('a changed file switches the pack off', listPacks(cfg)[0].state === 'changed' && !packsOn(cfg).length);
    check('...and it can\'t be switched back on without adding it again', await setPackOn(cfg, 'word-tools', true).then(() => false, (e) => /files changed/.test(e.message)));
    check('...and Bob is told it is off', /files changed/.test((() => { try { planCall(cfg, 'word-tools', 'count_words', { text: 'a' }); } catch (e) { return e.message; } })()));
  }
  const offCfg = { ...cfg, hands: { ...handsOn, packs: { on: false } } };
  const off = packsTools({ cfg: offCfg });
  check('with the Hand off, the tools say so', await off.pack_tools.run({}).then(() => false, (e) => /off|Hand/i.test(e.message)));
}

// ---------- updates, zips, remove ----------
{
  const r = addPack(cfg, pack('good-2', (j) => { j.version = '1.1.0'; }));
  check('adding the same id again is an update, switched off', r.updated && r.pack.version === '1.1.0' && r.pack.state === 'off');
  removePack(cfg, 'word-tools');
  check('Remove takes it away', !listPacks(cfg).length && !fs.existsSync(packDir(cfg, 'word-tools')));
  const zipFile = path.join(tmp, 'word-tools.zip');
  const src = pack('zipme');
  writeZip(zipFile, collect([src], path.dirname(src)));
  const z = addPack(cfg, zipFile);
  check('a .zip of a pack folder can be added', z.pack.id === 'word-tools' && z.pack.state === 'off' && fs.existsSync(path.join(packDir(cfg, 'word-tools'), 'tools', 'count_words.mjs')));
  check('nothing is left half-unpacked', !fs.existsSync(path.join(inn, 'tool-packs', '_incoming')));
}

// ---------- Help ----------
{
  const help = (id) => HELP.find((e) => e.id === id);
  check('Help has the Hand, the settings row, the glossary word and an FAQ', help('hands-packs') && help('faq-tool-packs') && /Tool packs from other people/.test(help('settings-hands').html) && /<dt>Tool pack<\/dt>/.test(help('glossary').html));
  check('Help says to only add packs from people you trust, and where it works', /people you trust/.test(help('hands-packs').html) && /Windows, Mac and Linux/.test(help('hands-packs').html) && /Android/.test(help('hands-packs').html));
  check('the guide for pack makers exists', fs.existsSync(path.join(here, '..', 'docs', 'TOOL-PACKS.md')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
