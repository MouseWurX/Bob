// 🧱 Blender tools (Settings, How Bob works; off unless the user turns it on). Nov 28 2026, the owner: the next category
// of tools is Blender and Unreal ("Yep").
//
// Bob looks at and changes .blend files with Blender itself, run with no window: blender --background
// --factory-startup --disable-autoexec --python blender-job.py -- job.json. No add-on and no server: just Blender
// installed (any 3.6 or newer; tested with 5.3). Unlike the Connected apps hand (mcp.js, "execute_blender_code"), the
// brain never writes Python here: it sends a list of set steps (add_object, move, set_material, add_modifier...) that
// blender-job.py checks one by one. A bad step stops the whole list before anything is saved, and its error shows the
// exact shape to send (the lesson of Nov 28: a missing field must say what to send, not "try another tool").
//   blender_look    a .blend's objects, materials, modifiers, camera, lights, frames and render settings (reads only)
//   blender_edit    changes in order, after a card; the original is backed up first (or save_as a copy, or new: true)
//   blender_render  a picture of the scene, shown in the chat (Workbench by default, quick; falls back to Cycles on
//                   the processor where there's no graphics driver)
//   blender_export  glb, gltf, fbx, obj, stl, usd, ply, for game engines (Unreal takes fbx, glb and usd) and printers
// Files: only where Bob may read (and for changes, save) files: the folders ticked in Settings, Hands, and his own
// Documents folder (hands-office.js canRead / canWrite). Python in a .blend never runs (--disable-autoexec, and the
// file is opened with use_scripts=False). Blender gets no keys from Bob's environment.
// Windows, Mac and Linux. Android and iPhone: no (no Blender there); they ask the PC's Bob over Bob-Net.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OS } from './platform.js';
import { canRead, canWrite } from './hands-office.js';
import { today } from './tools.js';
import { freeName } from './util.js';

export const blenderOn = (cfg) => cfg?.blenderTools === true;
export const JOB_SCRIPT = fileURLToPath(new URL('./blender-job.py', import.meta.url));
export const SECONDS = { look: 120, edit: 180, render: 600, export: 300 };
export const EXPORTS = ['glb', 'gltf', 'fbx', 'obj', 'stl', 'usd', 'usdz', 'ply'];
export const OPS = ['add_object', 'move', 'set_material', 'add_modifier', 'remove_modifier', 'delete', 'rename', 'duplicate', 'parent', 'shade', 'set_render', 'set_frames', 'set_camera', 'set_light', 'set_text', 'keyframe'];
export const MAX_CHANGES = 60;
export const BLENDER_MISSING = 'Blender isn\'t on this replicant matrix (or I can\'t find it). It\'s free from blender.org (or Steam). Once it\'s installed, ask again. If it\'s somewhere unusual, its full path can go in Settings, How Bob works, Blender tools.';

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const kids = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const verKey = (n) => (String(n).match(/\d+/g) || []).map(Number).reduce((a, x) => a * 1000 + x, 0);

// Where Blender is, or null: { exe, where: 'set' | 'pc' }. The newest version wins when several are installed.
// Tests pass os_, env, exists and list.
export function findBlender(cfg, { os_ = OS, env = process.env, exists = isFile, list = kids } = {}) {
  for (const p of [env.BOB_BLENDER, cfg?.blenderPath].filter(Boolean)) if (exists(p)) return { exe: p, where: 'set' };
  if (os_ === 'win') {
    const pf = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs')].filter(Boolean);
    for (const base of pf) {
      const found = path.join(base, 'Blender Foundation');
      const vers = list(found).filter((n) => /^Blender/i.test(n)).sort((a, b) => verKey(b) - verKey(a));
      for (const v of vers) { const p = path.join(found, v, 'blender.exe'); if (exists(p)) return { exe: p, where: 'pc' }; }
    }
    for (const base of pf) { const p = path.join(base, 'Steam', 'steamapps', 'common', 'Blender', 'blender.exe'); if (exists(p)) return { exe: p, where: 'pc' }; }
  }
  if (os_ === 'mac') {
    for (const app of ['/Applications/Blender.app', path.join(env.HOME || '', 'Applications', 'Blender.app')]) { const p = path.join(app, 'Contents', 'MacOS', 'Blender'); if (exists(p)) return { exe: p, where: 'pc' }; }
  }
  const names = os_ === 'win' ? ['blender.exe'] : ['blender'];
  const dirs = String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  if (os_ === 'linux') dirs.push('/snap/bin', '/usr/bin', '/usr/local/bin');
  for (const dir of dirs) for (const n of names) { const p = path.join(dir, n); if (exists(p)) return { exe: p, where: 'pc' }; }
  return null;
}

// Blender's own lines, cut to the ones that say what went wrong.
export function blenderProblems(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  const bad = lines.filter((l) => /error|exception|traceback|segmentation|crash|unable|couldn'?t|not found/i.test(l));
  return (bad.length ? bad : lines.slice(-4)).slice(0, 6).join('\n').slice(0, 800);
}

export function runProgram(exe, args, { cwd, signal, seconds }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Stopped.'));
    let out = '', timedOut = false;
    // No keys from Bob's environment. HOME points at the job's own folder, so Blender's user settings and add-ons
    // aren't read (--factory-startup says the same).
    const env = { PATH: process.env.PATH || '', HOME: cwd, TMP: cwd, TEMP: cwd, TMPDIR: cwd, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), USERPROFILE: cwd, ...(process.env.DISPLAY ? { DISPLAY: process.env.DISPLAY } : {}) };
    let child;
    try { child = spawn(exe, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return reject(new Error(`Blender wouldn't start: ${e.message}`)); }
    const keep = (c) => { out += c; if (out.length > 64000) out = out.slice(-32000); };
    child.stdout.on('data', keep); child.stderr.on('data', keep);
    const stop = () => { try { child.kill(); } catch {} };
    const t = setTimeout(() => { timedOut = true; stop(); }, seconds * 1000);
    const onAbort = () => stop();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    child.on('error', (e) => { clearTimeout(t); reject(new Error(`Blender wouldn't start: ${e.message}`)); });
    child.on('close', (code) => { clearTimeout(t); signal?.removeEventListener?.('abort', onAbort); if (signal?.aborted) reject(new Error('Stopped.')); else resolve({ code, out, timedOut }); });
  });
}

// One job in Blender. Returns blender-job.py's answer ({ ok, error, ... }). run (tests) replaces starting the program:
// run(exe, args, opts) -> { code, out, timedOut }, and writes the answer where args say, as Blender would.
export async function blenderJob(found, job, { signal, run = runProgram, seconds = SECONDS[job.job] || 180 } = {}) {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-blender-'));
  try {
    const jobFile = path.join(box, 'job.json'), out = path.join(box, 'answer.json');
    fs.writeFileSync(jobFile, JSON.stringify({ ...job, out }));
    const args = ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', JOB_SCRIPT, '--', jobFile];
    const r = await run(found.exe, args, { cwd: box, signal, seconds });
    if (r.timedOut) return { ok: false, error: `Blender took longer than ${seconds} seconds, so I stopped it.`, timedOut: true };
    let answer = null;
    try { answer = JSON.parse(fs.readFileSync(out, 'utf8')); } catch {}
    if (answer) return answer;
    const why = blenderProblems(r.out);
    return { ok: false, crashed: true, error: `Blender stopped without an answer${why ? `:\n${why}` : '.'}` };
  } finally { fs.rmSync(box, { recursive: true, force: true }); }
}

const isBlend = (p) => /\.blend$/i.test(String(p || ''));
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const sizeOf = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
const slug = (t) => String(t || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'scene';
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// The change list, checked in Node before Blender starts: known ops, an object named where one is needed. Throws a
// message that shows the shape to send.
const NEEDS_OBJECT = new Set(['move', 'set_material', 'add_modifier', 'remove_modifier', 'delete', 'rename', 'duplicate', 'parent', 'shade', 'set_camera', 'set_light', 'set_text', 'keyframe']);
export function checkChanges(changes) {
  const list = [].concat(changes || []);
  if (!list.length) throw new Error('blender_edit needs changes, like [{"op": "add_object", "kind": "cube", "name": "Box", "location": [0, 0, 1]}].');
  if (list.length > MAX_CHANGES) throw new Error(`Up to ${MAX_CHANGES} changes at a time; send the rest in another call.`);
  return list.map((c, i) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error(`change ${i + 1} is not an object. Each change is like {"op": "move", "object": "Cube", "location": [0, 0, 1]}.`);
    const op = String(c.op || '').toLowerCase();
    if (!OPS.includes(op)) throw new Error(`change ${i + 1}: op is one of ${OPS.join(', ')}.`);
    if (NEEDS_OBJECT.has(op) && !clip(c.object, 60)) throw new Error(`change ${i + 1} (${op}) needs object: the name of the object, as blender_look lists it, like {"op": "${op}", "object": "Cube"${op === 'move' ? ', "location": [0, 0, 1]' : ''}}.`);
    return { ...c, op };
  });
}

// What the card says for each change.
export function sayChange(c) {
  const at = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v));
  switch (c.op) {
    case 'add_object': return `Add a ${clip(c.kind, 20) || 'object'}${c.name ? ` "${clip(c.name, 40)}"` : ''}${c.location ? ` at ${at(c.location)}` : ''}`;
    case 'move': return `Move "${clip(c.object, 40)}"${c.location ? ` to ${at(c.location)}` : ''}${c.by ? ` by ${at(c.by)}` : ''}${c.rotation_deg ? `, turn to ${at(c.rotation_deg)}°` : ''}${c.scale ? `, scale ${at(c.scale)}` : ''}`;
    case 'set_material': return `Colour "${clip(c.object, 40)}"${c.color ? ` ${clip(c.color, 20)}` : ''}${c.material ? ` (material "${clip(c.material, 40)}")` : ''}`;
    case 'add_modifier': return `Add a ${clip(c.kind, 20)} modifier to "${clip(c.object, 40)}"${c.with ? ` with "${clip(c.with, 40)}"` : ''}`;
    case 'remove_modifier': return `Remove the modifier "${clip(c.name, 40)}" from "${clip(c.object, 40)}"`;
    case 'delete': return `Delete "${clip(c.object, 40)}"`;
    case 'rename': return `Rename "${clip(c.object, 40)}" to "${clip(c.new_name, 40)}"`;
    case 'duplicate': return `Copy "${clip(c.object, 40)}"${c.new_name ? ` as "${clip(c.new_name, 40)}"` : ''}`;
    case 'parent': return c.to ? `Parent "${clip(c.object, 40)}" to "${clip(c.to, 40)}"` : `Unparent "${clip(c.object, 40)}"`;
    case 'shade': return `Shade "${clip(c.object, 40)}" ${c.how === 'flat' ? 'flat' : 'smooth'}`;
    case 'set_render': return `Render settings${c.engine ? `: ${clip(c.engine, 12)}` : ''}${c.width && c.height ? `, ${c.width} x ${c.height}` : ''}`;
    case 'set_frames': return `Frames ${c.start ?? '…'} to ${c.end ?? '…'}`;
    case 'set_camera': return `Use "${clip(c.object, 40)}" as the camera`;
    case 'set_light': return `Light "${clip(c.object, 40)}"${c.power != null ? `, power ${c.power}` : ''}`;
    case 'set_text': return `Change the text of "${clip(c.object, 40)}"`;
    case 'keyframe': return `Key "${clip(c.object, 40)}" at frame ${c.frame}`;
    default: return c.op;
  }
}

function backup(cfg, file) {
  const dir = path.join(cfg.dataDir, 'backups', today(cfg));
  fs.mkdirSync(dir, { recursive: true });
  const to = freeName(path.join(dir, file.replace(/[:\\/]+/g, '_').slice(-180)));
  fs.copyFileSync(file, to);
  return to;
}

function plan(cfg, args) {
  if (args.new === true) {
    const to = canWrite(cfg, args.path);
    if (!isBlend(to)) throw new Error('A new scene is saved as a .blend file: give path ending in .blend.');
    if (fs.existsSync(to)) throw new Error(`There's already a file at ${to}. Leave out new to change it, or pick another name.`);
    return { src: null, to, changes: checkChanges(args.changes), isNew: true };
  }
  const src = canRead(cfg, args.path);
  if (!isBlend(src)) throw new Error('blender_edit works on .blend files. For a .glb, .fbx or .obj, open it in Blender and save it as a .blend first.');
  const to = args.save_as ? canWrite(cfg, freeName(path.resolve(String(args.save_as)))) : canWrite(cfg, src);
  if (args.save_as && !isBlend(to)) throw new Error('save_as is a .blend file. To make a .glb or .fbx, use blender_export.');
  return { src, to, changes: checkChanges(args.changes), isNew: false };
}

const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description) => ({ type: 'number', description });
const xyz = (description) => ({ type: 'array', items: { type: 'number' }, description });

function lookText(r) {
  const objs = (r.objects || []).map((o) => {
    const bits = [`${o.name} (${o.type})`, `at [${o.location.join(', ')}]`];
    if (o.rotation_deg?.some((x) => Math.abs(x) > 0.01)) bits.push(`turned [${o.rotation_deg.join(', ')}]°`);
    if (o.scale?.some((x) => Math.abs(x - 1) > 0.0001)) bits.push(`scale [${o.scale.join(', ')}]`);
    if (o.type === 'mesh') bits.push(`size [${o.dimensions.join(', ')}] m, ${o.faces} faces`);
    if (o.materials) bits.push(`material ${o.materials.join(', ')}`);
    if (o.modifiers) bits.push(`modifiers ${o.modifiers.map((m) => `${m.name} (${m.kind})`).join(', ')}`);
    if (o.parent) bits.push(`parent ${o.parent}`);
    if (o.light) bits.push(`${o.light.kind} light, power ${o.light.power}`);
    if (o.lens_mm) bits.push(`${o.lens_mm} mm lens`);
    if (o.text != null) bits.push(`text "${clip(o.text, 60)}"`);
    if (o.animated) bits.push('animated');
    if (o.hidden) bits.push('hidden');
    if (o.render_hidden) bits.push('not in renders');
    return `- ${bits.join(', ')}`;
  });
  const more = r.object_count > objs.length ? `\n(and ${r.object_count - objs.length} more)` : '';
  const mats = (r.materials || []).map((m) => `${m.name} [${m.color.join(', ')}]`).join('; ');
  return `${path.basename(r.file || 'scene')} (Blender ${r.blender}), scene "${r.scene}": ${r.object_count} object${r.object_count === 1 ? '' : 's'}.\n${objs.join('\n') || '(empty)'}${more}\nMaterials: ${mats || 'none'}.\nCamera: ${r.camera || 'none'}. Frames ${r.frames?.[0]} to ${r.frames?.[1]} at ${r.fps} fps. Render: ${r.render?.engine}, ${r.render?.width} x ${r.render?.height}. Units: ${r.units?.system}.\nNames above are what blender_edit's object takes. Locations and sizes are in metres; rotations in degrees.`;
}

// The four tools. find, job (tests) replace finding and running Blender.
export function blenderTools(brain, { find = findBlender, job = blenderJob } = {}) {
  const cfg = () => brain.cfg;
  const log = (k, t) => brain.log?.(k, t);
  const need = () => { const f = find(cfg()); if (!f) throw new Error(BLENDER_MISSING); return f; };
  const fail = (r, tool) => `Error: ${r.error}${/Nothing was saved|needs|is one of|There is no object/.test(r.error) ? ` Fix that and call ${tool} again.` : ''}`;
  const show = (file, ctx, tool) => {
    let item = null;
    try { item = brain.made?.add?.(file, { tool, chat: ctx?.sessionId || '' }); } catch {}
    const kind = /\.(png|jpe?g)$/i.test(file) ? 'image' : 'model';
    ctx?.emit?.({ type: 'made', items: [{ kind, url: item?.url || `/images/${encodeURIComponent(path.basename(file))}`, name: path.basename(file), path: file }], show: true });
  };
  const t = {};

  t.blender_look = {
    schema: fn('blender_look', 'Look inside a Blender .blend file: its objects (name, kind, where, size, materials, modifiers), materials, camera, lights, frames and render settings. Reads only. Call it before blender_edit, to get the object names.', { path: str('Full path of the .blend file.') }),
    async run({ path: p }, ctx) {
      const file = canRead(cfg(), p);
      if (!isBlend(file)) throw new Error('blender_look reads .blend files.');
      const r = await job(need(), { job: 'look', file }, { signal: ctx?.signal });
      if (!r.ok) return fail(r, 'blender_look');
      return lookText(r);
    },
    summary: ({ path: p }) => `Blender: looking at ${path.basename(String(p || 'a scene'))}`
  };

  t.blender_edit = {
    schema: fn('blender_edit', 'Change a .blend file with steps (blender_look first for names). One wrong step saves nothing; a backup is kept. More fields: set_material metallic, roughness; shade how (smooth or flat); set_render engine, width, height, samples; set_frames start, end; set_camera look_at, lens_mm; set_light power. Metres and degrees.', {
      path: str('Full path of the .blend file.'),
      changes: { type: 'array', description: 'The steps, in order.', items: { type: 'object', properties: {
        op: { type: 'string', enum: OPS },
        object: str('Its name from blender_look.'),
        kind: str('add_object: cube, sphere, cylinder, cone, plane, torus, monkey, camera, light, text...; add_modifier: bevel, subdivision, mirror, array, boolean...'),
        name: { type: 'string' },
        new_name: { type: 'string' },
        location: xyz('[x, y, z] metres, z up.'),
        by: xyz('move, duplicate: shift [x, y, z].'),
        rotation_deg: { type: 'array', items: { type: 'number' } },
        scale: { type: 'array', items: { type: 'number' } },
        color: str('"red" or "#d62828".'),
        with: str('boolean: the cutter object.'),
        settings: { type: 'object', description: 'add_modifier, like {"levels": 2}.' },
        to: str('parent: the parent ("" = none).'),
        frame: { type: 'number' },
        text: { type: 'string' }
      }, required: ['op'] } },
      save_as: str('Optional: save as this new .blend; the original stays.'),
      new: { type: 'boolean', description: 'true: start a new empty scene at path.' }
    }, ['path', 'changes']),
    approvalGroup: 'blender',
    check(args, ctx) {
      const c = cfg();
      const p = plan(c, args);
      need();
      if (ctx) ctx.blenderEdit = p;
      const what = p.changes.map(sayChange);
      return `${p.isNew ? `Make a new Blender scene ${path.basename(p.to)}` : `Change ${path.basename(p.src)}${p.to !== p.src ? ` (saved as ${path.basename(p.to)}; the original stays)` : ' (a backup is kept)'}`}: ${what.slice(0, 12).join('; ')}${what.length > 12 ? `; and ${what.length - 12} more` : ''}.`;
    },
    async run(args, ctx) {
      const c = cfg();
      const p = ctx?.blenderEdit || plan(c, args);
      if (ctx) ctx.blenderEdit = null;
      const found = need();
      const saved = !p.isNew && p.to === p.src ? backup(c, p.src) : '';
      fs.mkdirSync(path.dirname(p.to), { recursive: true });
      const r = await job(found, { job: 'edit', file: p.src, new: p.isNew, save_to: p.to, changes: p.changes }, { signal: ctx?.signal });
      if (!r.ok) return fail(r, 'blender_edit');
      if (ctx) ctx.made = [p.to];
      log('blender', `edited ${p.src || '(new)'} -> ${p.to}: ${(r.done || []).join('; ')}`);
      return `Saved ${p.to} (${kb(sizeOf(p.to))}, ${r.objects} objects). Done: ${(r.done || []).join('; ')}.${saved ? ' (The original is backed up in the inn.)' : ''} To check it, blender_look or blender_render it.`;
    },
    summary: ({ path: p, changes }) => `Blender: ${[].concat(changes || []).length} change${[].concat(changes || []).length === 1 ? '' : 's'} to ${path.basename(String(p || 'a scene'))}`
  };

  t.blender_render = {
    schema: fn('blender_render', 'Render a picture of a Blender .blend scene from its camera and show it in the chat. Quick by default (Workbench); engine eevee or cycles for a finished look (slower).', {
      path: str('Full path of the .blend file.'),
      camera: str('Optional: which camera object (default the scene\'s camera).'),
      frame: num('Optional: which frame.'),
      engine: str('Optional: workbench (quick, default), eevee, cycles, or scene (the file\'s own setting).', { enum: ['workbench', 'eevee', 'cycles', 'scene'] }),
      width: num('Optional: pixels across (default 960).'),
      height: num('Optional: pixels down (default 540).')
    }, ['path']),
    async run(args, ctx) {
      const c = cfg();
      const file = canRead(c, args.path);
      if (!isBlend(file)) throw new Error('blender_render renders .blend files.');
      const found = need();
      fs.mkdirSync(c.painterDir, { recursive: true });
      const png = freeName(path.join(c.painterDir, `${new Date().toISOString().slice(0, 10)}-${slug(path.basename(file, '.blend'))}-render.png`));
      const base = { job: 'render', file, png, camera: args.camera || '', frame: args.frame ?? null, width: Math.max(16, Math.min(3840, Math.round(Number(args.width) || 960))), height: Math.max(16, Math.min(2160, Math.round(Number(args.height) || 540))) };
      let engine = String(args.engine || 'workbench').toLowerCase();
      let r = await job(found, { ...base, engine }, { signal: ctx?.signal });
      // No graphics driver Blender can use (a server, a remote session): Workbench and Eevee can't draw; Cycles on the
      // processor can.
      if (!r.ok && r.crashed && engine !== 'cycles') { log('blender', `render with ${engine} stopped; trying Cycles on the processor`); engine = 'cycles'; r = await job(found, { ...base, engine, samples: 16 }, { signal: ctx?.signal }); }
      if (!r.ok) return fail(r, 'blender_render');
      show(png, ctx, 'blender_render');
      return `Rendered ${path.basename(file)} from camera "${r.camera}" (${r.size?.join(' x ')}, ${engine}). It shows in the chat. The picture is ${png}. Say in one short line what it shows; don't paste the path.`;
    },
    summary: ({ path: p }) => `Blender: rendering ${path.basename(String(p || 'a scene'))}`
  };

  t.blender_export = {
    schema: fn('blender_export', 'Export a Blender .blend scene to another 3D file: glb or gltf (web, Godot, Unreal), fbx (Unreal, Unity), usd (Unreal, Omniverse), obj, stl (3D printing), ply. The .blend stays as it is.', {
      path: str('Full path of the .blend file.'),
      to: str('The kind of file.', { enum: EXPORTS }),
      save_as: str('Optional: full path for the new file (default next to the .blend, or in Bob\'s Documents folder).')
    }, ['path', 'to']),
    approvalGroup: 'blender',
    async run(args, ctx) {
      const c = cfg();
      const file = canRead(c, args.path);
      if (!isBlend(file)) throw new Error('blender_export exports .blend files.');
      const kind = String(args.to || '').toLowerCase().replace(/^\./, '');
      if (!EXPORTS.includes(kind)) throw new Error(`to is one of ${EXPORTS.join(', ')}.`);
      let out = args.save_as ? path.resolve(String(args.save_as)) : path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.${kind}`);
      if (path.extname(out).slice(1).toLowerCase() !== kind) out = `${out}.${kind}`;
      try { out = canWrite(c, freeName(out)); } catch { out = canWrite(c, freeName(path.join(c.innDir, 'documents', path.basename(out)))); }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const r = await job(need(), { job: 'export', file, to: out, kind }, { signal: ctx?.signal });
      if (!r.ok) return fail(r, 'blender_export');
      if (!sizeOf(out)) return `Error: Blender said it exported, but there's no file at ${out}.`;
      if (ctx) ctx.made = [out];
      if (/^(glb|stl|obj)$/.test(kind)) show(out, ctx, 'blender_export');
      log('blender', `exported ${file} -> ${out}`);
      return `Exported ${path.basename(file)} as ${out} (${kb(sizeOf(out))}).${/^(glb|stl|obj)$/.test(kind) ? ' It shows in the 3D viewer in the side panel.' : ''}`;
    },
    summary: ({ path: p, to }) => `Blender: exporting ${path.basename(String(p || 'a scene'))} to ${String(to || '').toLowerCase()}`
  };
  return t;
}
