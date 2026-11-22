// Blender jobs (22 Nov 2026; the owner: Bob should be good at "3D/games in Unreal + Blender (Python)", and said yes to
// Blender jobs written once and never used for tuning). Real requests a person makes of Blender, each on its own
// starting scene, done through Bob's "Connected apps (MCP)" Hand against the Lab's test Blender (blender-world.mjs:
// Blender's own Python module, no window). Each job is scored by code from the scene Bob left (positions, sizes,
// names, materials, modifiers, lights, camera, animation), and by Opus for what only reading shows.
//
// ALL of these are HELD-OUT: never tune Bob's words, tools or lessons on them and never make lessons from them.
//
//   node blender-jobs.mjs [--out <jobs.jsonl>] [--check --python <a Python with bpy>]
//   --check proves each job sound in a real Blender: the scene as set up fails its checks, and a plain right answer passes.
//   scores: node blender-score.mjs --runs <runs.jsonl>[,...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { opts, locate } from './common.mjs';

const CLEAR = `import bpy, math
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
def box(name, size, at, mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat: o.data.materials.append(mat)
    return o
def material(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value = (*rgb, 1)
    return m
`;
// helpers the checks share
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const size = (o) => o.bbox ? o.bbox[1].map((v, i) => v - o.bbox[0][i]) : o.dimensions;
const named = (s, re) => s.objects.filter((o) => re.test(o.name));
const meshes = (s) => s.objects.filter((o) => o.type === 'MESH');
const sameXY = (d, w, h, tol) => (near(d[0], w, tol) && near(d[1], h, tol)) || (near(d[0], h, tol) && near(d[1], w, tol));
const unchanged = (before, after, names) => names.every((n) => { const a = before.objects.find((o) => o.name === n), b = after.objects.find((o) => o.name === n); return a && b && JSON.stringify([a.bbox, a.materials, a.modifiers]) === JSON.stringify([b.bbox, b.materials, b.modifiers]); });
const angle = (p) => Math.atan2(p[1], p[0]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// setup: Python that builds the starting scene. check(after, before) -> problems ([] = done right).
// answer: a plain right way to do it (only for --check; never shown to Bob). said: what the answer must say.
export const BLENDER_JOBS = [
  { key: 'b-table', type: 'model', text: 'In Blender, make a simple table: a top 1.2 m by 0.8 m and 4 cm thick, with its top surface 75 cm off the floor, on four legs that reach the floor.',
    setup: CLEAR,
    check: (s) => {
      const p = [], m = meshes(s);
      const top = m.find((o) => sameXY(size(o), 1.2, 0.8, 0.06) && near(size(o)[2], 0.04, 0.015));
      if (!top) return ['no table top 1.2 x 0.8 m and 4 cm thick'];
      if (!near(top.bbox[1][2], 0.75, 0.03)) p.push(`the top surface is at ${top.bbox[1][2]} m, not 0.75`);
      const legs = m.filter((o) => o !== top && near(o.bbox[0][2], 0, 0.02) && o.bbox[1][2] >= top.bbox[0][2] - 0.03 && size(o)[0] < 0.3 && size(o)[1] < 0.3);
      if (legs.length !== 4) p.push(`${legs.length} legs reach from the floor to the top, not 4`);
      if (legs.some((l) => l.bbox[0][0] < top.bbox[0][0] - 0.02 || l.bbox[1][0] > top.bbox[1][0] + 0.02 || l.bbox[0][1] < top.bbox[0][1] - 0.02 || l.bbox[1][1] > top.bbox[1][1] + 0.02)) p.push('a leg sticks out past the top');
      return p;
    },
    answer: `${CLEAR}
box('Top', (1.2, 0.8, 0.04), (0, 0, 0.73))
for i, (x, y) in enumerate([(0.55, 0.35), (-0.55, 0.35), (0.55, -0.35), (-0.55, -0.35)]):
    box(f'Leg{i+1}', (0.05, 0.05, 0.71), (x, y, 0.355))
`, opus: 'Is it a sensible table (legs under the corners, nothing floating), and does Bob say what he made and its sizes?' },

  { key: 'b-rename', type: 'organize', text: 'The objects in my Blender scene have useless names. Rename them so they say what they are: the tall thin cylinder is Lamp_Post, the big flat box is Ground, and the small box is Crate.',
    setup: `${CLEAR}
bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=4, location=(3, 2, 2))
box('Cube', (20, 20, 0.2), (0, 0, -0.1))
box('Cube.001', (0.6, 0.6, 0.6), (-2, 1, 0.3))
bpy.context.view_layer.objects.active = None
`,
    check: (s) => {
      const p = [], by = (n) => s.objects.find((o) => o.name === n);
      if (!by('Lamp_Post') || !near(size(by('Lamp_Post'))[2], 4, 0.05)) p.push('the tall cylinder is not called Lamp_Post');
      if (!by('Ground') || !near(size(by('Ground'))[0], 20, 0.1)) p.push('the big flat box is not called Ground');
      if (!by('Crate') || !near(size(by('Crate'))[0], 0.6, 0.05)) p.push('the small box is not called Crate');
      if (s.objects.length !== 3) p.push(`${s.objects.length} objects, not the 3 there were`);
      return p;
    },
    answer: `import bpy
for o in bpy.context.scene.objects:
    d = o.dimensions
    o.name = 'Lamp_Post' if d.z > 3 else 'Ground' if d.x > 10 else 'Crate'
`, opus: 'Did Bob look at the objects (sizes) before naming, rather than guessing from the old names?' },

  { key: 'b-material', type: 'material', text: 'Give the crate in my Blender scene a new red material called Crate_Red, fairly rough (about 0.8). Leave the other objects as they are.',
    setup: `${CLEAR}
grey = material('Grey', (0.5, 0.5, 0.5))
box('Ground', (20, 20, 0.2), (0, 0, -0.1), grey)
box('Crate', (0.6, 0.6, 0.6), (-2, 1, 0.3), grey)
box('Barrel_Stand', (0.8, 0.8, 0.1), (2, 0, 0.05), grey)
`,
    check: (s, before) => {
      const p = [], c = s.objects.find((o) => o.name === 'Crate'), m = s.materials.find((x) => x.name === 'Crate_Red');
      if (!m) return ['no material called Crate_Red'];
      if (!c || c.materials[0] !== 'Crate_Red') p.push('the crate does not use Crate_Red');
      const [r, g, b] = m.base_color || [0, 0, 0];
      if (!(r > 0.4 && g < 0.25 && b < 0.25)) p.push(`Crate_Red is not red (${(m.base_color || []).join(', ')})`);
      if (!(m.roughness >= 0.65 && m.roughness <= 0.95)) p.push(`roughness ${m.roughness}, not about 0.8`);
      if (!unchanged(before, s, ['Ground', 'Barrel_Stand'])) p.push('another object was changed');
      const grey = s.materials.find((x) => x.name === 'Grey');
      if (!grey || !near(grey.base_color[0], 0.5, 0.01) || !near(grey.base_color[1], 0.5, 0.01)) p.push('the Grey material the others share was changed');
      return p;
    },
    answer: `import bpy
m = bpy.data.materials.new('Crate_Red'); m.use_nodes = True
b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.7, 0.05, 0.04, 1); b.inputs['Roughness'].default_value = 0.8
c = bpy.data.objects['Crate']; c.data.materials.clear(); c.data.materials.append(m)
`, opus: 'The crate shared the Grey material with the others: changing Grey itself would turn everything red. Did Bob make a new one?' },

  { key: 'b-array', type: 'modifier', text: 'In Blender, make a fence from the post that\'s there: 10 posts in a row along X, 1 m apart, with an Array modifier on the post (not 10 copies).',
    setup: `${CLEAR}
box('Fence_Post', (0.1, 0.1, 1.2), (0, 0, 0.6))
`,
    check: (s) => {
      const p = [], post = s.objects.find((o) => o.name === 'Fence_Post');
      if (!post) return ['the post is gone'];
      const a = post.modifiers.find((m) => m.type === 'ARRAY');
      if (!a) p.push('no Array modifier on the post'); else if (a.count !== 10) p.push(`the array makes ${a.count}, not 10`);
      if (!near(size(post)[0], 9.1, 0.06)) p.push(`the row is ${size(post)[0].toFixed(2)} m long, not 9.1 m (10 posts 1 m apart)`);
      if (meshes(s).length !== 1) p.push('extra objects were made');
      return p;
    },
    answer: `import bpy
o = bpy.data.objects['Fence_Post']; a = o.modifiers.new('Array', 'ARRAY')
a.count = 10; a.use_relative_offset = False; a.use_constant_offset = True; a.constant_offset_displace = (1, 0, 0)
`, opus: 'A relative offset of 1 gives posts touching, not 1 m apart: did Bob get the spacing right and check it?' },

  { key: 'b-cleanup', type: 'cleanup', text: 'My Blender scene is full of leftover objects whose names start with temp_. Delete those, and nothing else.',
    setup: `${CLEAR}
for i in range(8): box(f'Rock_{i}', (0.5, 0.5, 0.4), (i, 3, 0.2))
for i in range(12):
    o = box(f'temp_{i}', (0.2, 0.2, 0.2), (i, -3, 0.1))
    if i % 3 == 0: o.hide_set(True)
box('temple_gate', (2, 0.5, 3), (0, 6, 1.5))
box('Temp_Note_KEEP', (0.1, 0.1, 0.1), (5, 5, 0))
`,
    check: (s, before) => {
      const p = [], left = named(s, /^temp_/);
      if (left.length) p.push(`${left.length} temp_ objects are still there${left.some((o) => o.hide) ? ' (the hidden ones too)' : ''}`);
      const keep = before.objects.filter((o) => !/^temp_/.test(o.name)).map((o) => o.name);
      const gone = keep.filter((n) => !s.objects.some((o) => o.name === n));
      if (gone.length) p.push(`deleted ${gone.join(', ')}, which do not start with temp_`);
      return p;
    },
    answer: `import bpy
for o in [o for o in bpy.data.objects if o.name.startswith('temp_')]: bpy.data.objects.remove(o, do_unlink=True)
`, opus: 'Four of the temp_ objects are hidden, and temple_gate and Temp_Note_KEEP must stay (case matters). Did Bob say how many he deleted?' },

  { key: 'b-lights', type: 'lighting', text: 'Set up three-point lighting around the statue in my Blender scene: a key light, a fill light and a rim light, named Key, Fill and Rim. The key should be the brightest.',
    setup: `${CLEAR}
bpy.ops.mesh.primitive_monkey_add(location=(0, 0, 1)); bpy.context.active_object.name = 'Statue'
box('Floor', (10, 10, 0.1), (0, 0, -0.05))
`,
    check: (s) => {
      const p = [], L = (re) => s.objects.find((o) => o.type === 'LIGHT' && re.test(o.name));
      const k = L(/^key/i), f = L(/^fill/i), r = L(/^rim|^back/i);
      if (!k || !f || !r) return [`missing ${[!k && 'Key', !f && 'Fill', !r && 'Rim'].filter(Boolean).join(', ')} light`];
      if (!(k.light.energy > f.light.energy && k.light.energy >= r.light.energy * 0.9)) p.push('the key is not the brightest');
      const st = s.objects.find((o) => o.name === 'Statue')?.world || [0, 0, 1];
      const ang = [k, f, r].map((o) => angle([o.world[0] - st[0], o.world[1] - st[1]]));
      const apart = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };
      if (apart(ang[0], ang[1]) < Math.PI / 4) p.push('the key and fill are on the same side');
      if (Math.min(apart(ang[2], ang[0]), apart(ang[2], ang[1])) < Math.PI / 2.5) p.push('the rim is not behind the statue');
      if ([k, f, r].some((o) => dist(o.world, st) < 1)) p.push('a light is inside the statue');
      return p;
    },
    answer: `import bpy, math
for name, ang, e in [('Key', -45, 1000), ('Fill', 45, 400), ('Rim', 180, 700)]:
    d = bpy.data.lights.new(name, 'AREA'); d.energy = e
    o = bpy.data.objects.new(name, d); bpy.context.scene.collection.objects.link(o)
    a = math.radians(ang - 90); o.location = (4 * math.cos(a), 4 * math.sin(a), 3)
`, opus: 'Do the lights point at the statue? Are key and fill on either side of the front and the rim behind? (The camera\'s side is the front: none here, so any consistent front.)' },

  { key: 'b-camera', type: 'camera', text: 'Add a camera in my Blender scene about 6 m from the statue, looking straight at it, with a 50 mm lens, and make it the scene\'s camera.',
    setup: `${CLEAR}
bpy.ops.mesh.primitive_monkey_add(location=(1, 2, 1)); bpy.context.active_object.name = 'Statue'
`,
    check: (s) => {
      const p = [], c = s.objects.find((o) => o.name === s.camera && o.type === 'CAMERA');
      if (!c) return ['the scene has no camera set'];
      const st = s.objects.find((o) => o.name === 'Statue').world;
      const d = dist(c.world, st);
      if (!near(d, 6, 0.6)) p.push(`the camera is ${d.toFixed(2)} m away, not about 6`);
      if (!near(c.lens, 50, 0.5)) p.push(`the lens is ${c.lens} mm`);
      const to = st.map((v, i) => (v - c.world[i]) / (d || 1));
      const cos = to.reduce((a, v, i) => a + v * c.forward[i], 0);
      if (cos < 0.97) p.push(`it does not look at the statue (${Math.round(Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI)} degrees off)`);
      return p;
    },
    answer: `import bpy
from mathutils import Vector
d = bpy.data.cameras.new('Camera'); d.lens = 50
c = bpy.data.objects.new('Camera', d); bpy.context.scene.collection.objects.link(c)
st = bpy.data.objects['Statue'].location
c.location = st + Vector((0, -6, 0))
c.rotation_euler = (st - c.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = c
`, opus: 'Did Bob aim the camera with maths or a Track To and check it, rather than leave the default rotation?' },

  { key: 'b-animate', type: 'animation', text: 'Animate the crate in my Blender scene sliding from x = 0 to x = 5 over frames 1 to 48, and make the scene end at frame 48.',
    setup: `${CLEAR}
box('Crate', (0.6, 0.6, 0.6), (0, 0, 0.3))
bpy.context.scene.frame_end = 250
`,
    check: (s) => {
      const p = [], at = s.at_end?.Crate;
      if (s.frame.end !== 48) p.push(`the scene ends at frame ${s.frame.end}, not 48`);
      if (!at) return [...p, 'the crate is not animated'];
      if (!near(at[String(s.frame.start)][0], 0, 0.05)) p.push(`on the first frame the crate is at x = ${at[String(s.frame.start)][0]}`);
      if (!near(at[String(s.frame.end)][0], 5, 0.05)) p.push(`on the last frame the crate is at x = ${at[String(s.frame.end)][0]}`);
      if (s.frame.start !== 1) p.push(`the scene starts at frame ${s.frame.start}`);
      return p;
    },
    answer: `import bpy
c = bpy.data.objects['Crate']; sc = bpy.context.scene
c.location.x = 0; c.keyframe_insert('location', frame=1)
c.location.x = 5; c.keyframe_insert('location', frame=48)
sc.frame_start = 1; sc.frame_end = 48
`, opus: 'Is the crate on the floor the whole way (z unchanged)?' },

  { key: 'b-rescale', type: 'fix', text: 'I imported a chair into Blender and it came in 100 times too big. Scale it down to its real size and apply the scale so it shows 1, 1, 1.',
    setup: `${CLEAR}
box('Chair', (45, 50, 90), (0, 0, 45))
`,
    check: (s) => {
      const p = [], c = s.objects.find((o) => /chair/i.test(o.name));
      if (!c) return ['the chair is gone'];
      const d = size(c);
      if (!(near(d[0], 0.45, 0.02) && near(d[1], 0.5, 0.02) && near(d[2], 0.9, 0.03))) p.push(`the chair is ${d.map((x) => x.toFixed(2)).join(' x ')} m, not 0.45 x 0.5 x 0.9`);
      if (!c.scale.every((x) => near(x, 1, 0.001))) p.push(`its scale reads ${c.scale.join(', ')}, not applied`);
      return p;
    },
    answer: `import bpy
c = bpy.data.objects['Chair']; c.scale = (0.01, 0.01, 0.01); c.location = (0, 0, 0.45)
bpy.ops.object.select_all(action='DESELECT'); c.select_set(True); bpy.context.view_layer.objects.active = c
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
`, opus: 'Does the chair still stand on the floor (not sunk or floating) after scaling? A plus if Bob notices and fixes that.' },

  { key: 'b-parent', type: 'organize', text: 'Put the table top and its four legs in my Blender scene under one empty called Table, so I can move the table as one thing. Don\'t move anything.',
    setup: `${CLEAR}
box('Top', (1.2, 0.8, 0.04), (2, 1, 0.73))
for i, (x, y) in enumerate([(0.55, 0.35), (-0.55, 0.35), (0.55, -0.35), (-0.55, -0.35)]):
    box(f'Leg{i+1}', (0.05, 0.05, 0.71), (2 + x, 1 + y, 0.355))
box('Rug', (2, 1.5, 0.01), (2, 1, 0.005))
`,
    check: (s, before) => {
      const p = [], t = s.objects.find((o) => o.name === 'Table');
      if (!t || t.type !== 'EMPTY') return ['no empty called Table'];
      const parts = ['Top', 'Leg1', 'Leg2', 'Leg3', 'Leg4'];
      const loose = parts.filter((n) => s.objects.find((o) => o.name === n)?.parent !== 'Table');
      if (loose.length) p.push(`${loose.join(', ')} not under Table`);
      if (s.objects.find((o) => o.name === 'Rug')?.parent) p.push('the rug was put under Table too');
      const moved = parts.filter((n) => { const a = before.objects.find((o) => o.name === n), b = s.objects.find((o) => o.name === n); return !a || !b || dist(a.bbox[0], b.bbox[0]) > 0.001; });
      if (moved.length) p.push(`${moved.join(', ')} moved`);
      return p;
    },
    answer: `import bpy
t = bpy.data.objects.new('Table', None); bpy.context.scene.collection.objects.link(t); t.location = (2, 1, 0)
bpy.context.view_layer.update()
for n in ['Top', 'Leg1', 'Leg2', 'Leg3', 'Leg4']:
    o = bpy.data.objects[n]; w = o.matrix_world.copy(); o.parent = t; o.matrix_world = w
`, opus: 'Parenting without keeping the world position makes pieces jump: did Bob keep them in place and check it?' },

  { key: 'b-count', type: 'question', text: 'How many objects in my Blender scene use the Brass material? Don\'t change anything.',
    setup: `${CLEAR}
brass = material('Brass', (0.8, 0.6, 0.2)); wood = material('Wood', (0.4, 0.25, 0.1))
for i in range(7): box(f'Knob_{i}', (0.05, 0.05, 0.05), (i * 0.2, 0, 1), brass)
for i in range(5): box(f'Door_{i}', (0.9, 0.05, 2), (i * 1.2, 1, 1), wood)
o = box('Hinge_Mixed', (0.05, 0.05, 0.1), (0, 2, 1), wood); o.data.materials.append(brass)
box('Brass_Plate_NoMat', (0.3, 0.02, 0.1), (1, 2, 1))
`,
    check: (s, before) => (JSON.stringify(s.objects) === JSON.stringify(before.objects) ? [] : ['the scene was changed']),
    said: [/\b8\b|\beight\b/i], answer: 'pass',
    opus: '7 knobs plus the hinge (its second slot) = 8; Brass_Plate_NoMat has no material despite its name. Does Bob say which?' },

  { key: 'b-smooth', type: 'modifier', text: 'Make the sphere in my Blender scene look smooth: a Subdivision Surface at level 2 and smooth shading. Only the sphere.',
    setup: `${CLEAR}
bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, location=(0, 0, 1)); bpy.context.active_object.name = 'Ball'
box('Pedestal', (1, 1, 0.5), (0, 0, 0.25))
`,
    check: (s, before) => {
      const p = [], b = s.objects.find((o) => o.name === 'Ball');
      if (!b) return ['the sphere is gone'];
      const m = b.modifiers.find((x) => x.type === 'SUBSURF');
      if (!m) p.push('no Subdivision Surface on the sphere'); else if (m.levels !== 2) p.push(`subdivision level ${m.levels}, not 2`);
      if (!b.smooth) p.push('not shaded smooth');
      if (!unchanged(before, s, ['Pedestal'])) p.push('the pedestal was changed');
      const ped = s.objects.find((o) => o.name === 'Pedestal');
      if (ped?.smooth) p.push('the pedestal was shaded smooth too');
      return p;
    },
    answer: `import bpy
b = bpy.data.objects['Ball']; m = b.modifiers.new('Subdivision', 'SUBSURF'); m.levels = 2
for f in b.data.polygons: f.use_smooth = True
`, opus: 'Only the ball changed?' }
];

export const jobByKey = (k) => BLENDER_JOBS.find((j) => j.key === k);

// The row do-jobs reads: the job's setup goes to the test Blender; the checks stay here (blender-score.mjs).
export function blenderJobs() {
  return BLENDER_JOBS.map((j) => ({ id: `blender-${j.key}`, job: 'blender', type: j.type, key: j.key, held: true, text: j.text, blender: { setup: j.setup } }));
}

// Proves each job sound in a real Blender: as set up it fails its checks (a question: it passes, nothing to do), and
// done the plain way it passes. Returns the problems found ([] when all is well).
export async function checkJobs(python, { Bridge } = {}) {
  Bridge ??= (await import('./blender-world.mjs')).Bridge;
  const bad = [];
  for (const j of BLENDER_JOBS) {
    const b = new Bridge(python);
    try {
      const s = await b.run(j.setup); if (!s.ok) { bad.push(`${j.key}: setup fails: ${s.error}`); continue; }
      const before = await b.dump();
      const lazy = j.check(before, before);
      if (j.type !== 'question' && !lazy.length) bad.push(`${j.key}: the scene as set up already passes`);
      if (j.answer !== 'pass') { const r = await b.run(j.answer); if (!r.ok) { bad.push(`${j.key}: the plain answer fails to run: ${r.error}`); continue; } }
      const after = await b.dump();
      const got = j.check(after, before);
      if (got.length) bad.push(`${j.key}: the plain answer fails: ${got.join('; ')}`);
    } catch (e) { bad.push(`${j.key}: ${e.message}`); } finally { b.stop(); }
  }
  return bad;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = opts();
  if (o.check) {
    if (!o.python || o.python === true) { console.log('--check needs --python <a Python with bpy>'); process.exit(1); }
    const bad = await checkJobs(String(o.python));
    if (bad.length) { console.log(`NOT SOUND:\n${bad.join('\n')}`); process.exit(1); }
    console.log(`every Blender job is sound (${BLENDER_JOBS.length} checked in a real Blender)`);
  }
  const rows = blenderJobs();
  const out = o.out && /\.jsonl$/i.test(String(o.out)) ? String(o.out) : path.join(locate({}).out, 'blender-jobs', 'jobs.jsonl');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`${rows.length} Blender jobs written to ${out} (all held-out: never tune on them); do-jobs needs --blender-python <a Python with bpy> for them`);
}
