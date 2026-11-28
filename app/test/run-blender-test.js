// Blender tools (src/blender-tools.js + src/blender-job.py), off by default. Finding Blender on each system, the change
// list checks, the cards, backups, the folder rules, the render fallback and the job sent to Blender. Nothing here
// starts Blender: a fake stands in for it and writes the answer where the real one would. (Real Blender, run as the
// bpy module, was checked by hand in the cloud: test/blender-real-check.py.)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blenderOn, findBlender, checkChanges, sayChange, blenderTools, blenderJob, blenderProblems, OPS, EXPORTS, JOB_SCRIPT, BLENDER_MISSING } from '../src/blender-tools.js';
import { guessGroups } from '../src/toolbox.js';
import { HELP } from '../public/help-content.js';
import { TOOL_KINDS } from '../src/tool-kinds.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + String(extra).slice(0, 400) : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const rejects = async (p, re) => { try { await p; return false; } catch (e) { return re ? re.test(e.message) : true; } };
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-blender-test-'));

// ---- the switch ----
check('off unless turned on', !blenderOn({}) && !blenderOn({ blenderTools: 'yes' }) && blenderOn({ blenderTools: true }));

// ---- finding Blender (fake file systems; never this computer's) ----
{
  const has = (...ps) => (p) => ps.includes(p);
  const lists = (m) => (d) => m[d] || [];
  const pf = 'C:\\Program Files';
  const win = path.join(pf, 'Blender Foundation');
  const exeOf = (v) => path.join(win, v, 'blender.exe');
  const w = findBlender({}, { os_: 'win', env: { ProgramFiles: pf, PATH: '' }, exists: has(exeOf('Blender 3.6'), exeOf('Blender 4.2'), exeOf('Blender 4.10')), list: lists({ [win]: ['Blender 3.6', 'Blender 4.2', 'Blender 4.10'] }) });
  check('Windows: the newest Blender in Program Files (4.10 beats 4.2)', w?.exe === exeOf('Blender 4.10'), JSON.stringify(w));
  const steam = path.join(pf, 'Steam', 'steamapps', 'common', 'Blender', 'blender.exe');
  check('Windows: the Steam copy', findBlender({}, { os_: 'win', env: { ProgramFiles: pf, PATH: '' }, exists: has(steam), list: () => [] })?.exe === steam);
  check('Mac: Applications', findBlender({}, { os_: 'mac', env: { HOME: '/Users/sam', PATH: '' }, exists: has('/Applications/Blender.app/Contents/MacOS/Blender'), list: () => [] })?.exe === '/Applications/Blender.app/Contents/MacOS/Blender');
  check('Linux: on the PATH, or snap', findBlender({}, { os_: 'linux', env: { PATH: '/opt/b' }, exists: has('/opt/b/blender'), list: () => [] })?.exe === '/opt/b/blender' && findBlender({}, { os_: 'linux', env: { PATH: '' }, exists: has('/snap/bin/blender'), list: () => [] })?.exe === '/snap/bin/blender');
  check('a path set in Settings comes first', findBlender({ blenderPath: '/x/blender' }, { os_: 'linux', env: { PATH: '/opt/b' }, exists: has('/x/blender', '/opt/b/blender'), list: () => [] })?.where === 'set');
  check('none: null', findBlender({}, { os_: 'linux', env: { PATH: '' }, exists: () => false, list: () => [] }) === null);
}

// ---- the change list: checked before Blender starts, errors show what to send ----
check('every op the job script knows is offered, and only those', OPS.every((op) => read('src/blender-job.py').includes(`'${op}'`)));
check('no changes: says the shape', throws(() => checkChanges([]), /needs changes, like \[\{"op": "add_object"/));
check('unknown op: lists them', throws(() => checkChanges([{ op: 'teleport' }]), /op is one of add_object, move/));
check('an op on an object with no object: says how', throws(() => checkChanges([{ op: 'move', location: [0, 0, 1] }]), /change 1 \(move\) needs object: .*\{"op": "move", "object": "Cube", "location": \[0, 0, 1\]\}/));
check('not an object: says so', throws(() => checkChanges(['move the cube']), /not an object/));
check('too many: says the limit', throws(() => checkChanges(Array.from({ length: 61 }, () => ({ op: 'delete', object: 'a' }))), /Up to 60/));
check('ops are made lower case', checkChanges([{ op: 'ADD_OBJECT', kind: 'cube' }])[0].op === 'add_object');
check('the card says each change plainly', sayChange({ op: 'add_object', kind: 'cube', name: 'Box', location: [0, 0, 1] }) === 'Add a cube "Box" at [0, 0, 1]' && sayChange({ op: 'move', object: 'Box', by: [1, 0, 0] }) === 'Move "Box" by [1, 0, 0]' && /boolean modifier to "Box" with "Hole"/.test(sayChange({ op: 'add_modifier', object: 'Box', kind: 'boolean', with: 'Hole' })));

// ---- the job sent to Blender ----
{
  const calls = [];
  const fakeRun = (answer) => async (exe, args, opts) => {
    calls.push({ exe, args, opts });
    const job = JSON.parse(fs.readFileSync(args[args.length - 1], 'utf8'));
    if (answer) fs.writeFileSync(job.out, JSON.stringify(answer(job)));
    return { code: answer ? 0 : 139, out: answer ? '' : 'Segmentation fault\nWriting: /tmp/blender.crash.txt', timedOut: false };
  };
  const r = await blenderJob({ exe: '/b/blender' }, { job: 'look', file: '/x/a.blend' }, { run: fakeRun((j) => ({ ok: true, got: j })) });
  const a = calls[0].args;
  check('Blender starts with no window, no user settings or add-ons, no scripts from the file', a.includes('--background') && a.includes('--factory-startup') && a.includes('--disable-autoexec') && a.indexOf('--python') > -1 && a[a.indexOf('--python') + 1] === JOB_SCRIPT);
  check('the job reaches the script, with where to answer', r.ok && r.got.job === 'look' && r.got.file === '/x/a.blend' && /answer\.json$/.test(r.got.out));
  check('the job folder is cleaned up', !fs.existsSync(calls[0].opts.cwd));
  const crash = await blenderJob({ exe: '/b/blender' }, { job: 'render' }, { run: fakeRun(null) });
  check('no answer (a crash): says so, with Blender\'s own line', !crash.ok && crash.crashed && /Segmentation fault/.test(crash.error));
  const slow = await blenderJob({ exe: '/b/blender' }, { job: 'render' }, { run: async () => ({ code: null, out: '', timedOut: true }), seconds: 5 });
  check('too slow: stopped, and says how long', !slow.ok && /longer than 5 seconds/.test(slow.error));
  check('Blender\'s lines cut to the useful ones', blenderProblems('Read blend\nInfo: x\nError: Python: Traceback\nfoo') === 'Error: Python: Traceback');
}

// ---- the tools: folders, cards, backups, render fallback, export ----
const agentDir = path.join(tmp, 'agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(tmp, 'data'), work = path.join(tmp, 'work'), outside = path.join(tmp, 'outside');
for (const d of [innDir, dataDir, work, outside]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir, innDir, dataDir, painterDir: path.join(innDir, 'painter'), timeZone: 'UTC', userName: 'Sam', blenderTools: true, readRoots: [innDir, work], hands: { enabled: true, folders: [work] } };
const scene = path.join(work, 'room.blend');
fs.writeFileSync(scene, 'BLENDER-v300 fake');
fs.writeFileSync(path.join(outside, 'secret.blend'), 'x');
const jobs = [];
let renderFails = 0;
const fakeJob = async (found, job) => {
  jobs.push(job);
  if (job.job === 'look') return { ok: true, file: job.file, blender: '4.2.0', scene: 'Scene', object_count: 2, objects: [{ name: 'Cube', type: 'mesh', location: [0, 0, 1], rotation_deg: [0, 0, 0], scale: [1, 1, 1], dimensions: [2, 2, 2], faces: 6, materials: ['Red'], modifiers: [{ name: 'Bevel', kind: 'bevel' }] }, { name: 'Camera', type: 'camera', location: [7, -7, 5], rotation_deg: [60, 0, 45], scale: [1, 1, 1], dimensions: [0, 0, 0], lens_mm: 50 }], materials: [{ name: 'Red', color: [0.8, 0, 0] }], camera: 'Camera', frames: [1, 250], fps: 24, render: { engine: 'BLENDER_EEVEE', width: 1920, height: 1080 }, units: { system: 'metric' } };
  if (job.job === 'edit') { if (job.changes.some((c) => c.object === 'Nope')) return { ok: false, error: 'change 1 (move): There is no object called "Nope". Objects: Cube, Camera. Nothing was saved.' }; fs.writeFileSync(job.save_to, 'BLENDER-v300 changed'); return { ok: true, done: job.changes.map((c) => c.op), saved: job.save_to, objects: 3 }; }
  if (job.job === 'render') { if (job.engine !== 'cycles' && renderFails-- > 0) return { ok: false, crashed: true, error: 'Blender stopped without an answer.' }; fs.writeFileSync(job.png, 'png'); return { ok: true, png: job.png, engine: job.engine, size: [job.width, job.height], camera: 'Camera' }; }
  if (job.job === 'export') { fs.writeFileSync(job.to, 'glb'); return { ok: true, exported: job.to, kind: job.kind }; }
  return { ok: false, error: 'unknown' };
};
const made = [];
const emitted = [];
const brain = { cfg, log: () => {}, made: { add: (f) => { made.push(f); return { url: `/images/${path.basename(f)}` }; } } };
const t = blenderTools(brain, { find: () => ({ exe: '/b/blender' }), job: fakeJob });
const ctx = { emit: (e) => emitted.push(e) };
{
  check('four tools', ['blender_look', 'blender_edit', 'blender_render', 'blender_export'].every((n) => t[n]?.schema?.function?.name === n));
  check('each has its risk in tool-kinds', ['blender_look', 'blender_edit', 'blender_render', 'blender_export'].every((n) => TOOL_KINDS[n]) && TOOL_KINDS.blender_look.risk === 'look' && TOOL_KINDS.blender_edit.risk === 'change');
  const look = await t.blender_look.run({ path: scene }, ctx);
  check('look: names, places, sizes, materials, modifiers, camera, render', /Cube \(mesh\), at \[0, 0, 1\], size \[2, 2, 2\] m, 6 faces, material Red, modifiers Bevel \(bevel\)/.test(look) && /Camera: Camera\. Frames 1 to 250 at 24 fps\. Render: BLENDER_EEVEE, 1920 x 1080/.test(look), look);
  check('look: outside the ticked folders is refused', await rejects(t.blender_look.run({ path: path.join(outside, 'secret.blend') }, ctx), /not allowed/));
  check('look: only .blend files', await rejects(t.blender_look.run({ path: (fs.writeFileSync(path.join(work, 'a.fbx'), 'x'), path.join(work, 'a.fbx')) }, ctx), /reads \.blend/));
  check('no Blender: says where to get it', await rejects(blenderTools(brain, { find: () => null, job: fakeJob }).blender_look.run({ path: scene }, ctx), /blender\.org/) && /blender\.org/.test(BLENDER_MISSING));

  const ectx = { emit: () => {} };
  const card = t.blender_edit.check({ path: scene, changes: [{ op: 'add_object', kind: 'sphere', name: 'Ball', location: [0, 0, 3] }, { op: 'set_material', object: 'Ball', color: 'blue' }] }, ectx);
  check('edit: a card first, listing each change and that a backup is kept', /^Change room\.blend \(a backup is kept\): Add a sphere "Ball" at \[0, 0, 3\]; Colour "Ball" blue\.$/.test(card), card);
  check('edit: the card is in the blender group (Allow all covers the rest of the job)', t.blender_edit.approvalGroup === 'blender');
  const done = await t.blender_edit.run({ path: scene, changes: [{ op: 'add_object', kind: 'sphere', name: 'Ball', location: [0, 0, 3] }, { op: 'set_material', object: 'Ball', color: 'blue' }] }, ectx);
  const backups = fs.readdirSync(path.join(dataDir, 'backups')).flatMap((d) => fs.readdirSync(path.join(dataDir, 'backups', d)));
  check('edit: saved, and the original is backed up first', /^Saved .*room\.blend .*Done: add_object; set_material\..*backed up/.test(done) && backups.some((b) => /room\.blend$/.test(b)), done);
  const bad = await t.blender_edit.run({ path: scene, changes: [{ op: 'move', object: 'Nope', location: [0, 0, 0] }] }, ectx);
  check('edit: a wrong step comes back as an error that says to fix it and call again', /^Error: change 1 \(move\): There is no object called "Nope"\. Objects: Cube, Camera\. Nothing was saved\. Fix that and call blender_edit again\.$/.test(bad), bad);
  const copy = path.join(work, 'room-v2.blend');
  const card2 = t.blender_edit.check({ path: scene, save_as: copy, changes: [{ op: 'delete', object: 'Cube' }] }, ectx);
  check('edit save_as: the card says the original stays', /saved as room-v2\.blend; the original stays/.test(card2));
  check('edit save_as must be a .blend', throws(() => t.blender_edit.check({ path: scene, save_as: path.join(work, 'x.fbx'), changes: [{ op: 'delete', object: 'Cube' }] }, ectx), /blender_export/));
  check('edit new: a new scene, not over an existing file', /^Make a new Blender scene new\.blend/.test(t.blender_edit.check({ path: path.join(work, 'new.blend'), new: true, changes: [{ op: 'add_object', kind: 'cube' }] }, ectx)) && throws(() => t.blender_edit.check({ path: scene, new: true, changes: [{ op: 'add_object', kind: 'cube' }] }, ectx), /already a file/));
  check('edit: never saves outside the ticked folders', throws(() => t.blender_edit.check({ path: path.join(outside, 'n.blend'), new: true, changes: [{ op: 'add_object', kind: 'cube' }] }, ectx), /can only save in/));

  renderFails = 1;
  const r = await t.blender_render.run({ path: scene }, ctx);
  const rj = jobs.filter((j) => j.job === 'render');
  check('render: quick Workbench first; no graphics driver -> Cycles on the processor', rj[0].engine === 'workbench' && rj[1].engine === 'cycles' && rj[1].samples === 16 && /cycles/.test(r), r);
  check('render: shown in the chat, saved in Bob\'s picture folder', emitted.some((e) => e.type === 'made' && e.items[0].kind === 'image') && made.some((f) => f.startsWith(cfg.painterDir) && /room-render\.png$/.test(f)));
  check('render: sizes are kept sensible', (await t.blender_render.run({ path: scene, width: 99999, height: 1 }, ctx), jobs.filter((j) => j.job === 'render').pop().width === 3840 && jobs.filter((j) => j.job === 'render').pop().height === 16));

  const ex = await t.blender_export.run({ path: scene, to: 'GLB' }, ctx);
  check('export: next to the .blend, shown in the 3D viewer', /Exported room\.blend as .*room\.glb/.test(ex) && emitted.some((e) => e.type === 'made' && e.items[0].kind === 'model'), ex);
  const ex2 = await t.blender_export.run({ path: scene, to: 'glb' }, ctx);
  check('export: never over an earlier file', /room-1\.glb|room \(1\)\.glb|room-2\.glb/.test(ex2) || !/room\.glb \(/.test(ex2) && ex2 !== ex, ex2);
  check('export: only the kinds Blender writes', await rejects(t.blender_export.run({ path: scene, to: 'max' }, ctx), /to is one of glb/) && EXPORTS.includes('fbx') && EXPORTS.includes('usd'));
}

// ---- hidden while off; found by the toolbox when on ----
check('hidden while off (offTools), shown when on', /blenderOn\(this\.cfg\) \? \[\] : \['blender_look', 'blender_edit', 'blender_render', 'blender_export'\]/.test(read('src/brain-prompting.js')));
{
  const fake = { cfg, usable: (n) => /^blender_/.test(n) };
  check('the toolbox finds the Blender group from the ask', guessGroups(fake, 'can you add a bevel to the table in my kitchen.blend').includes('blender') && guessGroups(fake, 'export the scene as fbx for unreal').includes('blender') && !guessGroups(fake, 'what is the capital of France').includes('blender'));
}

// ---- the job script: safe by design ----
{
  const py = read('src/blender-job.py');
  check('the script opens files without their scripts', /open_mainfile\(filepath=path, load_ui=False, use_scripts=False\)/.test(py));
  check('the script has no exec or eval of anything sent', !/\bexec\(|\beval\(|__import__\(|subprocess|os\.system/.test(py));
  check('a wrong step stops the list before saving', /raise Problem\('change %d \(%s\): %s Nothing was saved\.'/.test(py) && py.indexOf('save_as_mainfile') > py.indexOf("raise Problem('change %d (%s)"));
}

// ---- Help and Settings ----
const ids = new Set(HELP.map((e) => e.id));
check('Help has its page and FAQ', ids.has('blender-tools') && ids.has('faq-blender-tools'));
check('the glossary has it', /<dt>Blender tools<\/dt>/.test(HELP.find((e) => e.id === 'glossary')?.html || ''));
check('the switch is on the Settings page, off by default', /sswitch\('blenderTools', settings\.blenderTools === true, 'Blender tools'/.test(read('public/cellar-pages.js')));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
