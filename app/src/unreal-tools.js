// 🎮 Unreal tools (Settings, How Bob works; off unless the user turns it on). Nov 28 2026, the owner: the next category
// of tools is Blender and Unreal ("Yep"). UNPROVEN in our lab: written to Unreal's documented Python remote execution
// and checked against a stand-in editor, as we have yet to test it with a real Unreal Editor.
//
// Bob talks to an open Unreal Editor through Unreal's own Python link (the "Python Editor Script Plugin" with
// Project Settings, Plugins, Python, "Enable Remote Execution" ticked). No third-party plugin. The link works like
// Unreal's own remote_execution.py: a "ping" to the multicast group 239.0.0.1:6766 on this computer only (TTL 0, the
// loopback interface), the editor answers "pong", Bob opens a TCP port on 127.0.0.1 and asks the editor to connect to
// it, then sends one command and reads its result.
// The brain never writes Python here. Bob sends one of his own fixed scripts with the brain's steps as JSON data, and
// the script checks every step before it changes anything, all inside one editor transaction (Ctrl+Z undoes it).
//   unreal_look   the open level: actors (label, class, where, rotation, scale, mesh, materials), selected actors
//   unreal_edit   spawn, move, delete, rename, set_material, import (fbx, glb, gltf, obj, usd into /Game/Bob), save_level
// Windows, Mac and Linux (wherever the Unreal Editor runs). Android and iPhone: no.
import dgram from 'node:dgram';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canRead } from './hands-office.js';

export const unrealOn = (cfg) => cfg?.unrealTools === true;
export const GROUP = '239.0.0.1';
export const PORT = 6766;
export const PROTOCOL = { version: 1, magic: 'ue_py' };
export const OPS = ['spawn', 'move', 'delete', 'rename', 'set_material', 'import', 'save_level'];
export const SHAPES = ['cube', 'sphere', 'cylinder', 'cone', 'plane', 'point_light', 'spot_light', 'directional_light', 'rect_light', 'camera', 'player_start'];
export const IMPORTS = ['fbx', 'glb', 'gltf', 'obj', 'usd', 'usda', 'usdc', 'usdz', 'png', 'jpg', 'tga', 'wav'];
export const MAX_STEPS = 40;
export const NO_EDITOR = 'No Unreal Editor answered on this computer. Open the project in the Unreal Editor, then check Edit, Plugins: "Python Editor Script Plugin" is on, and Edit, Project Settings, Plugins, Python: "Enable Remote Execution" is ticked (restart the editor after). Then ask again.';
const MARK = 'BOBJSON:';

// ---------------------------------------------------------------- the link (Unreal's Python remote execution)

const msg = (type, source, dest, data) => JSON.stringify({ ...PROTOCOL, type, source, ...(dest ? { dest } : {}), ...(data ? { data } : {}) });

// The real UDP side: joined to the group on the loopback interface, TTL 0 (never leaves this computer).
export function openUdp({ group = GROUP, port = PORT, iface = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const handlers = [];
    s.on('message', (b) => { let m = null; try { m = JSON.parse(String(b)); } catch {} if (m) for (const h of handlers) h(m); });
    s.once('error', reject);
    s.bind(port, () => {
      try { s.addMembership(group, iface); s.setMulticastTTL(0); s.setMulticastInterface(iface); s.setMulticastLoopback(true); } catch (e) { try { s.close(); } catch {} return reject(e); }
      resolve({ send: (text) => s.send(Buffer.from(text), port, group), onMessage: (h) => handlers.push(h), close: () => { try { s.close(); } catch {} } });
    });
  });
}

// One command in the editor. code is one of Bob's own scripts. Returns { ok, output, result, node }.
// openUdp (tests) replaces the UDP side; the TCP side is real (127.0.0.1 only).
export async function remoteExec(code, { open = openUdp, timeoutMs = 4000, commandMs = 120000, signal } = {}) {
  const me = crypto.randomUUID();
  const udp = await open();
  let server = null, sock = null, node = null;
  try {
    node = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), timeoutMs);
      udp.onMessage((m) => { if (m.magic === PROTOCOL.magic && m.type === 'pong' && (!m.dest || m.dest === me) && !node) { clearTimeout(t); resolve({ id: m.source, ...(m.data || {}) }); } });
      udp.send(msg('ping', me));
    });
    if (!node) return { ok: false, error: NO_EDITOR };
    server = net.createServer();
    await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
    const port = server.address().port;
    const conn = new Promise((resolve) => { const t = setTimeout(() => resolve(null), timeoutMs); server.once('connection', (s) => { clearTimeout(t); resolve(s); }); });
    udp.send(msg('open_connection', me, node.id, { command_ip: '127.0.0.1', command_port: port }));
    sock = await conn;
    if (!sock) return { ok: false, error: `Unreal (${node.project_name || 'the editor'}) answered but didn't connect back. Another remote link may be open; close it and try again.` };
    const reply = await new Promise((resolve) => {
      let buf = '';
      const t = setTimeout(() => resolve({ timedOut: true }), commandMs);
      const onAbort = () => { clearTimeout(t); resolve({ stopped: true }); };
      signal?.addEventListener?.('abort', onAbort, { once: true });
      sock.on('data', (c) => { buf += c; try { const m = JSON.parse(buf); if (m.type === 'command_result') { clearTimeout(t); resolve(m); } else buf = ''; } catch {} });
      sock.on('close', () => { clearTimeout(t); resolve({ closed: true }); });
      sock.write(msg('command', me, node.id, { command: code, unattended: true, exec_mode: 'ExecuteFile' }));
    });
    if (reply.timedOut) return { ok: false, error: `Unreal took longer than ${Math.round(commandMs / 1000)} seconds, so I stopped waiting.`, node };
    if (reply.stopped) return { ok: false, error: 'Stopped.', node };
    if (reply.closed) return { ok: false, error: 'Unreal closed the link before it answered.', node };
    const d = reply.data || {};
    const output = [].concat(d.output || []).map((o) => String(o?.output ?? o)).join('\n');
    return { ok: d.success !== false, output, result: d.result, node };
  } finally {
    try { if (node) udp.send(msg('close_connection', me, node.id)); } catch {}
    try { sock?.destroy(); } catch {}
    try { server?.close(); } catch {}
    udp.close();
  }
}

// Bob's answer line from the editor's output: the script prints MARK + JSON.
export function readAnswer(r) {
  const line = String(r?.output || '').split('\n').reverse().find((l) => l.includes(MARK));
  if (!line) return null;
  try { return JSON.parse(line.slice(line.indexOf(MARK) + MARK.length)); } catch { return null; }
}

// ---------------------------------------------------------------- Bob's two scripts (data in, JSON out)

// A JSON string is also a valid Python string literal (the same escapes), so the steps go in as data.
const pyString = (v) => JSON.stringify(JSON.stringify(v));

export const LOOK_SCRIPT = `import unreal, json
def v3(v): return [round(v.x, 2), round(v.y, 2), round(v.z, 2)]
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
sel = set(a.get_actor_label() for a in actors.get_selected_level_actors())
out = []
every = actors.get_all_level_actors()
for a in every[:300]:
    r = a.get_actor_rotation()
    d = {'label': a.get_actor_label(), 'class': a.get_class().get_name(), 'location': v3(a.get_actor_location()), 'rotation_deg': [round(r.roll, 1), round(r.pitch, 1), round(r.yaw, 1)], 'scale': v3(a.get_actor_scale3d())}
    c = a.get_component_by_class(unreal.StaticMeshComponent)
    if c and c.static_mesh:
        d['mesh'] = c.static_mesh.get_path_name().split('.')[0]
        d['materials'] = [m.get_path_name().split('.')[0] for m in c.get_materials() if m]
    if d['label'] in sel: d['selected'] = True
    out.append(d)
print('${MARK}' + json.dumps({'level': world.get_name() if world else '', 'count': len(every), 'actors': out}))
`;

export const EDIT_SCRIPT = (steps) => `import unreal, json
steps = json.loads(${pyString(steps)})
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
SHAPES = {'cube': '/Engine/BasicShapes/Cube', 'sphere': '/Engine/BasicShapes/Sphere', 'cylinder': '/Engine/BasicShapes/Cylinder', 'cone': '/Engine/BasicShapes/Cone', 'plane': '/Engine/BasicShapes/Plane'}
CLASSES = {'point_light': unreal.PointLight, 'spot_light': unreal.SpotLight, 'directional_light': unreal.DirectionalLight, 'rect_light': unreal.RectLight, 'camera': unreal.CameraActor, 'player_start': unreal.PlayerStart}
class Problem(Exception): pass
def vec(v, name):
    if not (isinstance(v, list) and len(v) == 3 and all(isinstance(x, (int, float)) for x in v)): raise Problem(name + ' needs three numbers, like [0, 0, 100] (centimetres).')
    return unreal.Vector(*[float(x) for x in v])
def rot(v): v = vec(v, 'rotation_deg'); return unreal.Rotator(v.x, v.y, v.z)
labels = {a.get_actor_label(): a for a in actors.get_all_level_actors()}
def actor(name, i, op):
    a = labels.get(str(name or ''))
    if not a: raise Problem('step %d (%s): there is no actor labelled "%s". Some actors: %s.' % (i, op, name, ', '.join(list(labels)[:30])))
    return a
def asset(p, i, op, kind):
    p = str(p or '')
    if not p.startswith('/'): raise Problem('step %d (%s): %s is an asset path like /Game/Materials/M_Red.' % (i, op, kind))
    x = unreal.EditorAssetLibrary.load_asset(p)
    if not x: raise Problem('step %d (%s): there is no asset at %s.' % (i, op, p))
    return x
# First every step is checked, so a wrong one changes nothing. Labels that earlier steps make count.
known = set(labels)
def need(name, i, op):
    if str(name or '') not in known: raise Problem('step %d (%s): there is no actor labelled "%s". Some actors: %s.' % (i, op, name, ', '.join(sorted(known)[:30])))
for i, s in enumerate(steps, 1):
    op = s.get('op')
    if op == 'spawn':
        k = str(s.get('kind') or '')
        if not s.get('asset') and k not in SHAPES and k not in CLASSES: raise Problem('step %d (spawn): kind is one of %s, or give asset.' % (i, ', '.join(list(SHAPES) + list(CLASSES))))
        if s.get('asset'): asset(s['asset'], i, op, 'asset')
        if s.get('location') is not None: vec(s['location'], 'location')
        if s.get('label'): known.add(str(s['label'])[:60])
    elif op in ('move', 'delete', 'rename', 'set_material'):
        need(s.get('actor'), i, op)
        if op == 'delete': known.discard(str(s.get('actor')))
        if op == 'move' and all(s.get(k) is None for k in ('location', 'by', 'rotation_deg', 'scale')): raise Problem('step %d (move) needs location, by, rotation_deg or scale, like {"op": "move", "actor": "%s", "location": [0, 0, 100]}.' % (i, s.get('actor')))
        if op == 'rename' and not s.get('new_label'): raise Problem('step %d (rename) needs new_label.' % i)
        if op == 'rename': known.discard(str(s.get('actor'))); known.add(str(s['new_label'])[:60])
        if op == 'set_material': asset(s.get('material'), i, op, 'material')
    elif op == 'import':
        pass
    elif op == 'save_level':
        pass
    else:
        raise Problem('step %d: op is one of spawn, move, delete, rename, set_material, import, save_level.' % i)
done = []
with unreal.ScopedEditorTransaction('Bob: ' + ', '.join(str(s.get('op')) for s in steps)[:80]):
    for i, s in enumerate(steps, 1):
        op = s['op']
        if op == 'spawn':
            loc = vec(s['location'], 'location') if s.get('location') is not None else unreal.Vector(0, 0, 0)
            r = rot(s['rotation_deg']) if s.get('rotation_deg') is not None else unreal.Rotator(0, 0, 0)
            k = str(s.get('kind') or '')
            if s.get('asset'): a = actors.spawn_actor_from_object(asset(s['asset'], i, op, 'asset'), loc, r)
            elif k in SHAPES: a = actors.spawn_actor_from_object(unreal.EditorAssetLibrary.load_asset(SHAPES[k]), loc, r)
            else: a = actors.spawn_actor_from_class(CLASSES[k], loc, r)
            if s.get('scale') is not None: a.set_actor_scale3d(vec(s['scale'], 'scale'))
            if s.get('label'): a.set_actor_label(str(s['label'])[:60])
            labels[a.get_actor_label()] = a
            done.append('spawned %s "%s"' % (s.get('asset') or k, a.get_actor_label()))
        elif op == 'move':
            a = actor(s['actor'], i, op)
            if s.get('location') is not None: a.set_actor_location(vec(s['location'], 'location'), False, False)
            if s.get('by') is not None: a.set_actor_location(a.get_actor_location() + vec(s['by'], 'by'), False, False)
            if s.get('rotation_deg') is not None: a.set_actor_rotation(rot(s['rotation_deg']), False)
            if s.get('scale') is not None: a.set_actor_scale3d(vec(s['scale'], 'scale'))
            done.append('moved "%s"' % s['actor'])
        elif op == 'delete':
            actors.destroy_actor(actor(s['actor'], i, op)); labels.pop(s['actor'], None)
            done.append('deleted "%s"' % s['actor'])
        elif op == 'rename':
            a = actor(s['actor'], i, op); a.set_actor_label(str(s['new_label'])[:60]); labels[a.get_actor_label()] = a
            done.append('renamed "%s" to "%s"' % (s['actor'], s['new_label']))
        elif op == 'set_material':
            a = actor(s['actor'], i, op); c = a.get_component_by_class(unreal.StaticMeshComponent)
            if not c: raise Problem('step %d (set_material): "%s" has no mesh to colour.' % (i, s['actor']))
            c.set_material(int(s.get('slot') or 0), asset(s['material'], i, op, 'material'))
            done.append('gave "%s" %s' % (s['actor'], s['material']))
        elif op == 'import':
            t = unreal.AssetImportTask()
            t.set_editor_property('filename', s['file']); t.set_editor_property('destination_path', s.get('folder') or '/Game/Bob')
            t.set_editor_property('automated', True); t.set_editor_property('save', True); t.set_editor_property('replace_existing', False)
            unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([t])
            done.append('imported %s: %s' % (s['file'], ', '.join(str(p) for p in t.get_editor_property('imported_object_paths')) or 'nothing came in'))
        elif op == 'save_level':
            unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
            done.append('saved the level')
print('${MARK}' + json.dumps({'ok': True, 'done': done}))
`;

// The wrapper: a Problem comes back as Bob's answer line, not a Python error.
const wrap = (body) => `import json\ntry:\n${body.split('\n').map((l) => `    ${l}`).join('\n')}\nexcept Exception as e:\n    print('${MARK}' + json.dumps({'ok': False, 'error': str(e).split('\\n')[0][:400]}))\n`;

// ---------------------------------------------------------------- checks before anything is sent

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const xyzOk = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
export function checkSteps(steps, cfg) {
  const list = [].concat(steps || []);
  if (!list.length) throw new Error('unreal_edit needs steps, like [{"op": "spawn", "kind": "cube", "label": "Crate", "location": [0, 0, 50]}].');
  if (list.length > MAX_STEPS) throw new Error(`Up to ${MAX_STEPS} steps at a time.`);
  return list.map((s, i) => {
    const n = i + 1;
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error(`step ${n} is not an object. Each step is like {"op": "move", "actor": "Crate", "location": [0, 0, 100]}.`);
    const op = String(s.op || '').toLowerCase();
    if (!OPS.includes(op)) throw new Error(`step ${n}: op is one of ${OPS.join(', ')}.`);
    for (const k of ['location', 'by', 'rotation_deg', 'scale']) if (s[k] != null && !xyzOk(s[k])) throw new Error(`step ${n} (${op}): ${k} needs three numbers, like [0, 0, 100] (centimetres; z is up).`);
    if (['move', 'delete', 'rename', 'set_material'].includes(op) && !clip(s.actor, 80)) throw new Error(`step ${n} (${op}) needs actor: its label from unreal_look, like {"op": "${op}", "actor": "Crate"${op === 'move' ? ', "location": [0, 0, 100]' : ''}}.`);
    if (op === 'spawn' && !s.asset && !SHAPES.includes(String(s.kind || '').toLowerCase())) throw new Error(`step ${n} (spawn) needs kind (one of ${SHAPES.join(', ')}) or asset (a /Game/... path), like {"op": "spawn", "kind": "cube", "location": [0, 0, 50]}.`);
    if (op === 'set_material' && !/^\/(Game|Engine)\//.test(String(s.material || ''))) throw new Error(`step ${n} (set_material) needs material: an asset path like /Game/Materials/M_Red.`);
    const out = { ...s, op, ...(s.kind ? { kind: String(s.kind).toLowerCase() } : {}) };
    if (op === 'import') {
      const f = canRead(cfg, s.file);
      const ext = path.extname(f).slice(1).toLowerCase();
      if (!IMPORTS.includes(ext)) throw new Error(`step ${n} (import): Unreal takes ${IMPORTS.join(', ')} files.`);
      const folder = String(s.folder || '/Game/Bob');
      if (!/^\/Game(\/[\w-]+)*$/.test(folder)) throw new Error(`step ${n} (import): folder is a content folder like /Game/Bob.`);
      out.file = f; out.folder = folder;
    }
    return out;
  });
}

export function sayStep(s) {
  const at = (v) => `[${v.join(', ')}]`;
  switch (s.op) {
    case 'spawn': return `Add a ${s.asset ? path.posix.basename(String(s.asset)) : s.kind}${s.label ? ` "${clip(s.label, 40)}"` : ''}${s.location ? ` at ${at(s.location)}` : ''}`;
    case 'move': return `Move "${clip(s.actor, 40)}"${s.location ? ` to ${at(s.location)}` : ''}${s.by ? ` by ${at(s.by)}` : ''}${s.rotation_deg ? `, turn to ${at(s.rotation_deg)}°` : ''}${s.scale ? `, scale ${at(s.scale)}` : ''}`;
    case 'delete': return `Delete "${clip(s.actor, 40)}"`;
    case 'rename': return `Rename "${clip(s.actor, 40)}" to "${clip(s.new_label, 40)}"`;
    case 'set_material': return `Give "${clip(s.actor, 40)}" ${clip(s.material, 60)}`;
    case 'import': return `Bring ${path.basename(s.file)} into ${s.folder}`;
    case 'save_level': return 'Save the level';
    default: return s.op;
  }
}

const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const xyz = (description) => ({ type: 'array', items: { type: 'number' }, description });

// The two tools. exec (tests) replaces the link.
export function unrealTools(brain, { exec = remoteExec } = {}) {
  const cfg = () => brain.cfg;
  const t = {};
  const ask = async (code, ctx) => {
    const r = await exec(wrap(code), { signal: ctx?.signal });
    if (!r.ok && !r.output) return { ok: false, error: r.error || 'Unreal didn\'t run it.' };
    const a = readAnswer(r);
    if (!a) return { ok: false, error: `Unreal ran it but gave no answer${r.output ? `: ${clip(r.output, 300)}` : '.'}` };
    return { ...a, ok: a.ok !== false, node: r.node };
  };

  t.unreal_look = {
    schema: fn('unreal_look', 'Look at the level open in the Unreal Editor: its actors (label, class, where, rotation, scale, mesh, materials) and which are selected. Reads only. Call it before unreal_edit, for the labels.', {}, []),
    async run(args, ctx) {
      const r = await ask(LOOK_SCRIPT, ctx);
      if (!r.ok) return `Error: ${r.error}`;
      const lines = (r.actors || []).map((a) => `- ${a.label} (${a.class}) at [${a.location.join(', ')}]${a.rotation_deg.some((x) => x) ? `, turned [${a.rotation_deg.join(', ')}]°` : ''}${a.scale.some((x) => x !== 1) ? `, scale [${a.scale.join(', ')}]` : ''}${a.mesh ? `, mesh ${a.mesh}` : ''}${a.materials?.length ? `, materials ${a.materials.join(', ')}` : ''}${a.selected ? ' (selected)' : ''}`);
      const proj = r.node?.project_name ? ` in ${r.node.project_name}` : '';
      return `Level "${r.level}"${proj}: ${r.count} actor${r.count === 1 ? '' : 's'}.\n${lines.join('\n') || '(empty)'}${r.count > lines.length ? `\n(and ${r.count - lines.length} more)` : ''}\nLabels above are what unreal_edit's actor takes. Units are centimetres; z is up.`;
    },
    summary: () => 'Unreal: looking at the level'
  };

  t.unreal_edit = {
    schema: fn('unreal_edit', 'Change the level open in the Unreal Editor with steps, in order (unreal_look first for labels). All steps are checked first; one wrong step changes nothing, and Ctrl+Z undoes them all. Ops: spawn {kind or asset, label, location}, move {actor, location | by | rotation_deg | scale}, delete, rename {new_label}, set_material {material, slot}, import {file, folder}, save_level. Centimetres, degrees; z is up.', {
      steps: { type: 'array', description: 'The steps, in order.', items: { type: 'object', properties: {
        op: { type: 'string', enum: OPS },
        actor: str('The actor to change, by its label from unreal_look.'),
        kind: str('spawn: cube, sphere, cylinder, cone, plane, point_light, spot_light, directional_light, rect_light, camera or player_start.'),
        asset: str('spawn: a mesh asset path, like /Game/Props/SM_Crate.'),
        label: str('spawn: its label.'),
        new_label: str('rename: the new label.'),
        location: xyz('Where, [x, y, z] in centimetres.'),
        by: xyz('move: how far, [x, y, z].'),
        rotation_deg: xyz('[roll, pitch, yaw] in degrees.'),
        scale: xyz('[x, y, z] (1 = as it is).'),
        material: str('set_material: a material asset path.'),
        file: str('import: the full path of the file (fbx, glb, gltf, obj, usd, png or wav).'),
        folder: str('import: the content folder (default /Game/Bob).')
      }, required: ['op'] } }
    }, ['steps']),
    approvalGroup: 'unreal',
    check(args, ctx) {
      const steps = checkSteps(args.steps, cfg());
      if (ctx) ctx.unrealSteps = steps;
      const what = steps.map(sayStep);
      return `In the Unreal Editor: ${what.slice(0, 12).join('; ')}${what.length > 12 ? `; and ${what.length - 12} more` : ''}. (Ctrl+Z in the editor undoes it.)`;
    },
    async run(args, ctx) {
      const steps = ctx?.unrealSteps || checkSteps(args.steps, cfg());
      if (ctx) ctx.unrealSteps = null;
      const r = await ask(EDIT_SCRIPT(steps), ctx);
      if (!r.ok) return `Error: ${r.error}${/needs|is one of|there is no|is an asset path/.test(r.error || '') ? ' Nothing was changed. Fix that and call unreal_edit again.' : ''}`;
      brain.log?.('unreal', `edited the level: ${(r.done || []).join('; ')}`);
      return `Done in the Unreal Editor: ${(r.done || []).join('; ')}.${steps.some((s) => s.op === 'save_level') ? '' : ' The level isn\'t saved yet (add a save_level step to save it).'} Ctrl+Z in the editor undoes it.`;
    },
    summary: ({ steps }) => `Unreal: ${[].concat(steps || []).length} step${[].concat(steps || []).length === 1 ? '' : 's'} in the level`
  };
  return t;
}
