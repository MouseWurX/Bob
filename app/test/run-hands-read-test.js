// Hands folders are readable (1.5.239, a reliability fix found on the PC check): with the Files Hand on, a folder ticked
// for Hands works for list_folder, read_file and search_files even when it isn't one of the read folders. Before, Bob
// could move and rename files there but list_folder said "I'm not allowed to look in ...\work".
// Everything is in a temp folder; no real home folder is read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTools, readableRoots } from '../src/tools.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tries = async (f) => { try { return { ok: true, out: await f() }; } catch (e) { return { ok: false, err: e.message }; } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-handsread-'));
const inn = path.join(root, 'inn'), docs = path.join(root, 'docs'), work = path.join(root, 'work'), other = path.join(root, 'other');
for (const d of [inn, docs, work, other, path.join(root, 'data')]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(work, 'plan.txt'), 'the plan is in the work folder\n');
fs.writeFileSync(path.join(other, 'secret-ish.txt'), 'not ticked anywhere\n');
const base = { innDir: inn, dataDir: path.join(root, 'data'), readRoots: [inn, docs] };
const on = { ...base, hands: { enabled: true, files: { on: true }, folders: [work] } };
const off = { ...base, hands: { enabled: true, files: { on: false }, folders: [work] } };

check('with the Files Hand on, a ticked Hands folder is readable', readableRoots(on).includes(work) && readableRoots(on).includes(docs));
check('with the Files Hand off, it is not', !readableRoots(off).includes(work));
check('with the master switch off, it is not', !readableRoots({ ...on, hands: { ...on.hands, enabled: false } }).includes(work));
check('readableRoots never changes cfg.readRoots', on.readRoots.length === 2 && !on.readRoots.includes(work));

const tOn = buildTools(on), tOff = buildTools(off);
const lf = await tries(() => tOn.list_folder.run({ path: work }));
check('list_folder lists a Hands folder', lf.ok && /plan\.txt/.test(String(lf.out)), lf.err || '');
const lfOff = await tries(() => tOff.list_folder.run({ path: work }));
check('list_folder still refuses it with the Files Hand off', !lfOff.ok && /not allowed/.test(lfOff.err));
const lfOther = await tries(() => tOn.list_folder.run({ path: other }));
check('a folder that is neither read nor Hands is still refused', !lfOther.ok && /not allowed/.test(lfOther.err));

const rf = await tries(() => tOn.read_file.run({ path: path.join(work, 'plan.txt') }));
check('read_file reads a file in a Hands folder', rf.ok && /work folder/.test(String(rf.out)), rf.err || '');
const rfBare = await tries(() => tOn.read_file.run({ path: 'plan.txt' }));
check('read_file finds a bare name in a Hands folder', rfBare.ok && /work folder/.test(String(rfBare.out)), rfBare.err || '');
const rfOther = await tries(() => tOn.read_file.run({ path: path.join(other, 'secret-ish.txt') }));
check('read_file still refuses a folder that was never ticked', !rfOther.ok && /not allowed/.test(rfOther.err));

// 17 Nov after1: a name search found the ask itself in Bob's own queue (queue.json) and read it as the user's file
{
  const data = path.join(root, 'data'); fs.writeFileSync(path.join(data, 'queue.json'), '{"text": "Read Minutes_September.docx"}\n');
  fs.writeFileSync(path.join(docs, 'notes.txt'), 'Minutes_September is not here\n');
  const own = { ...base, dataDir: path.join(docs, 'Bob'), readRoots: [inn, docs] }; fs.mkdirSync(own.dataDir, { recursive: true }); fs.writeFileSync(path.join(own.dataDir, 'queue.json'), '{"text": "Read Minutes_September.docx"}\n');
  const sf = await tries(() => buildTools(own).search_files.run({ text: 'Minutes_September' }));
  check('search_files leaves Bob\'s own data folder out', sf.ok && /notes\.txt/.test(String(sf.out)) && !/queue\.json/.test(String(sf.out)), sf.err || String(sf.out));
  const sfAsked = await tries(() => buildTools(own).search_files.run({ text: 'Minutes_September', folder: own.dataDir }));
  check('...unless that folder is the one asked for', sfAsked.ok && /queue\.json/.test(String(sfAsked.out)), sfAsked.err || String(sfAsked.out));
}
fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
