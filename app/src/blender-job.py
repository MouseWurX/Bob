# Bob's Blender hand (blender-tools.js): one job, run inside Blender with no window.
#   blender --background --factory-startup --disable-autoexec --python blender-job.py -- <job.json>
# The job file says what to do; the answer goes to job["out"] as JSON. Works the same when Blender is a Python
# module (import bpy), which is how the cloud tests run real Blender.
# Jobs:
#   look    {file}                                      -> the scene: objects, materials, cameras, lights, render
#   edit    {file, changes, save_to, new}               -> applies the changes in order, saves to save_to
#   render  {file, png, camera, frame, width, height, engine}  -> a picture
#   export  {file, to, kind, selected}                  -> glb, gltf, fbx, obj, stl, usd(z), ply
# Never runs Python from the .blend (--disable-autoexec, and load with use_scripts=False), never opens add-ons,
# never goes online. Only the file named in the job and the files it writes are touched.
import json
import math
import os
import sys

import bpy

KINDS = ['cube', 'sphere', 'ico_sphere', 'cylinder', 'cone', 'plane', 'torus', 'monkey', 'circle', 'camera', 'light', 'empty', 'text']
LIGHTS = ['point', 'sun', 'spot', 'area']
MODIFIERS = {'bevel': 'BEVEL', 'subdivision': 'SUBSURF', 'mirror': 'MIRROR', 'array': 'ARRAY', 'solidify': 'SOLIDIFY', 'boolean': 'BOOLEAN', 'decimate': 'DECIMATE', 'smooth': 'SMOOTH', 'wireframe': 'WIREFRAME', 'weld': 'WELD', 'triangulate': 'TRIANGULATE'}
OPS = ['add_object', 'move', 'set_material', 'add_modifier', 'remove_modifier', 'delete', 'rename', 'duplicate', 'parent', 'shade', 'set_render', 'set_frames', 'set_camera', 'set_light', 'set_text', 'keyframe']


class Problem(Exception):
    pass


def r3(v):
    return [round(float(x), 4) for x in v]


def vec(v, name, default=None):
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return (float(v),) * 3
    if isinstance(v, (list, tuple)) and len(v) == 3 and all(isinstance(x, (int, float)) for x in v):
        return tuple(float(x) for x in v)
    raise Problem('%s needs three numbers, like [0, 0, 1].' % name)


def color(c):
    if c is None:
        return None
    if isinstance(c, str):
        s = c.strip().lstrip('#')
        named = {'red': 'd62828', 'green': '2a9d4b', 'blue': '1f5fd6', 'yellow': 'f2c418', 'orange': 'f27d18', 'purple': '7d3cc8', 'pink': 'f28cb4', 'white': 'ffffff', 'black': '0a0a0a', 'grey': '808080', 'gray': '808080', 'brown': '7a4a24', 'cyan': '18c8d8'}
        s = named.get(s.lower(), s)
        if len(s) == 6 and all(ch in '0123456789abcdefABCDEF' for ch in s):
            rgb = [int(s[i:i + 2], 16) / 255 for i in (0, 2, 4)]
            # sRGB to linear, as Blender's colour fields hold linear values
            return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in rgb) + (1.0,)
        raise Problem('color is a name like "red" or a hex code like "#d62828".')
    if isinstance(c, (list, tuple)) and len(c) in (3, 4) and all(isinstance(x, (int, float)) for x in c):
        v = [float(x) for x in c]
        if max(v) > 1:
            v = [x / 255 for x in v]
        return tuple(v[:3]) + ((v[3] if len(v) == 4 else 1.0),)
    raise Problem('color is a name like "red", a hex code like "#d62828", or [r, g, b] from 0 to 1.')


def obj(name, kinds=None):
    o = bpy.data.objects.get(str(name or ''))
    if not o:
        names = [x.name for x in bpy.data.objects][:40]
        raise Problem('There is no object called "%s". Objects: %s.' % (name, ', '.join(names) or 'none'))
    if kinds and o.type not in kinds:
        raise Problem('"%s" is a %s, not a %s.' % (o.name, o.type.lower(), ' or '.join(k.lower() for k in kinds)))
    return o


def scene():
    return bpy.context.scene


def link(o):
    scene().collection.objects.link(o)
    return o


def base_color(mat):
    try:
        nt = mat.node_tree
        if nt:
            for n in nt.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    return r3(n.inputs['Base Color'].default_value[:3])
    except Exception:
        pass
    return r3(mat.diffuse_color[:3])


def deg(v):
    return [round(math.degrees(x), 2) for x in v]


def look():
    sc = scene()
    objs = []
    for o in sorted(bpy.data.objects, key=lambda x: x.name)[:300]:
        if sc.objects.get(o.name) is None:
            continue
        d = {'name': o.name, 'type': o.type.lower(), 'location': r3(o.location), 'rotation_deg': deg(o.rotation_euler), 'scale': r3(o.scale), 'dimensions': r3(o.dimensions)}
        if o.parent:
            d['parent'] = o.parent.name
        if not o.visible_get():
            d['hidden'] = True
        if o.hide_render:
            d['render_hidden'] = True
        if o.type == 'MESH':
            me = o.data
            d['vertices'] = len(me.vertices)
            d['faces'] = len(me.polygons)
        mats = [s.material.name for s in o.material_slots if s.material]
        if mats:
            d['materials'] = mats
        mods = [{'name': m.name, 'kind': m.type.lower()} for m in o.modifiers]
        if mods:
            d['modifiers'] = mods
        if o.type == 'LIGHT':
            d['light'] = {'kind': o.data.type.lower(), 'power': round(float(getattr(o.data, 'energy', 0)), 2), 'color': r3(o.data.color)}
        if o.type == 'CAMERA':
            d['lens_mm'] = round(float(o.data.lens), 2)
        if o.type == 'FONT':
            d['text'] = o.data.body[:200]
        if o.animation_data and o.animation_data.action:
            d['animated'] = True
        objs.append(d)
    mats = [{'name': m.name, 'color': base_color(m), 'users': m.users} for m in sorted(bpy.data.materials, key=lambda x: x.name)[:200]]
    r = sc.render
    return {
        'file': bpy.data.filepath, 'blender': bpy.app.version_string, 'scene': sc.name,
        'objects': objs, 'object_count': len(sc.objects), 'materials': mats,
        'camera': sc.camera.name if sc.camera else None,
        'frames': [sc.frame_start, sc.frame_end], 'frame': sc.frame_current, 'fps': sc.render.fps,
        'render': {'engine': r.engine, 'width': r.resolution_x, 'height': r.resolution_y, 'percent': r.resolution_percentage},
        'units': {'system': sc.unit_settings.system.lower(), 'scale': round(float(sc.unit_settings.scale_length), 4)},
        'collections': [c.name for c in bpy.data.collections][:60],
    }


def add_object(ch):
    kind = str(ch.get('kind') or '').lower()
    if kind not in KINDS:
        raise Problem('add_object needs kind: one of %s.' % ', '.join(KINDS))
    loc = vec(ch.get('location'), 'location', (0.0, 0.0, 0.0))
    size = float(ch.get('size') or 2.0)
    if size <= 0 or size > 100000:
        raise Problem('size is in metres, more than 0.')
    m = bpy.ops.mesh
    if kind == 'cube':
        m.primitive_cube_add(size=size, location=loc)
    elif kind == 'sphere':
        m.primitive_uv_sphere_add(radius=size / 2, location=loc)
    elif kind == 'ico_sphere':
        m.primitive_ico_sphere_add(radius=size / 2, location=loc)
    elif kind == 'cylinder':
        m.primitive_cylinder_add(radius=size / 2, depth=float(ch.get('height') or size), location=loc)
    elif kind == 'cone':
        m.primitive_cone_add(radius1=size / 2, depth=float(ch.get('height') or size), location=loc)
    elif kind == 'plane':
        m.primitive_plane_add(size=size, location=loc)
    elif kind == 'torus':
        m.primitive_torus_add(major_radius=size / 2, minor_radius=size / 8, location=loc)
    elif kind == 'monkey':
        m.primitive_monkey_add(size=size, location=loc)
    elif kind == 'circle':
        m.primitive_circle_add(radius=size / 2, location=loc)
    elif kind == 'camera':
        o = link(bpy.data.objects.new(ch.get('name') or 'Camera', bpy.data.cameras.new(ch.get('name') or 'Camera')))
        o.location = loc
        if not scene().camera:
            scene().camera = o
    elif kind == 'light':
        lk = str(ch.get('light') or 'point').lower()
        if lk not in LIGHTS:
            raise Problem('light is one of %s.' % ', '.join(LIGHTS))
        data = bpy.data.lights.new(ch.get('name') or 'Light', lk.upper())
        data.energy = float(ch.get('power') or (3 if lk == 'sun' else 1000))
        o = link(bpy.data.objects.new(ch.get('name') or 'Light', data))
        o.location = loc
    elif kind == 'empty':
        o = link(bpy.data.objects.new(ch.get('name') or 'Empty', None))
        o.location = loc
    elif kind == 'text':
        data = bpy.data.curves.new(ch.get('name') or 'Text', 'FONT')
        data.body = str(ch.get('text') or 'Text')[:2000]
        data.size = size / 2
        o = link(bpy.data.objects.new(ch.get('name') or 'Text', data))
        o.location = loc
    if kind not in ('camera', 'light', 'empty', 'text'):
        o = bpy.context.active_object
    if ch.get('name'):
        o.name = str(ch['name'])[:60]
    if ch.get('rotation_deg') is not None:
        o.rotation_euler = [math.radians(x) for x in vec(ch.get('rotation_deg'), 'rotation_deg')]
    if ch.get('scale') is not None:
        o.scale = vec(ch.get('scale'), 'scale')
    if ch.get('color') is not None or ch.get('material'):
        set_material({'object': o.name, 'material': ch.get('material') or (o.name + ' colour'), 'color': ch.get('color')})
    return 'added %s "%s"' % (kind, o.name)


def move(ch):
    o = obj(ch.get('object'))
    if all(ch.get(k) is None for k in ('location', 'rotation_deg', 'scale', 'by')):
        raise Problem('move needs location, rotation_deg, scale or by, like {"op": "move", "object": "%s", "location": [0, 0, 1]}.' % o.name)
    if ch.get('location') is not None:
        o.location = vec(ch['location'], 'location')
    if ch.get('by') is not None:
        b = vec(ch['by'], 'by')
        o.location = [o.location[i] + b[i] for i in range(3)]
    if ch.get('rotation_deg') is not None:
        o.rotation_euler = [math.radians(x) for x in vec(ch['rotation_deg'], 'rotation_deg')]
    if ch.get('scale') is not None:
        o.scale = vec(ch['scale'], 'scale')
    return 'moved "%s" (now at %s)' % (o.name, r3(o.location))


def set_material(ch):
    o = obj(ch.get('object'))
    if not hasattr(o.data, 'materials'):
        raise Problem('"%s" is a %s, which has no materials.' % (o.name, o.type.lower()))
    if ch.get('color') is None and not ch.get('material') and ch.get('metallic') is None and ch.get('roughness') is None:
        raise Problem('set_material needs color (or material, metallic, roughness), like {"op": "set_material", "object": "%s", "color": "red"}.' % o.name)
    name = str(ch.get('material') or (o.active_material.name if o.active_material else o.name + ' colour'))[:60]
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        if not mat.use_nodes:
            mat.use_nodes = True
    except Exception:
        pass
    bsdf = None
    if mat.node_tree:
        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    c = color(ch.get('color'))
    if c:
        mat.diffuse_color = c
        if bsdf:
            bsdf.inputs['Base Color'].default_value = c
    for key in ('metallic', 'roughness'):
        if ch.get(key) is not None:
            v = max(0.0, min(1.0, float(ch[key])))
            setattr(mat, key, v)
            if bsdf:
                bsdf.inputs[key.capitalize()].default_value = v
    if o.data.materials:
        o.data.materials[0] = mat
    else:
        o.data.materials.append(mat)
    return 'gave "%s" the material "%s"' % (o.name, mat.name)


def add_modifier(ch):
    o = obj(ch.get('object'))
    kind = str(ch.get('kind') or '').lower()
    if kind not in MODIFIERS:
        raise Problem('add_modifier needs kind: one of %s.' % ', '.join(MODIFIERS))
    if o.type not in ('MESH', 'CURVE', 'FONT'):
        raise Problem('"%s" is a %s; modifiers go on meshes.' % (o.name, o.type.lower()))
    m = o.modifiers.new(name=str(ch.get('name') or kind.capitalize())[:60], type=MODIFIERS[kind])
    s = ch.get('settings') or {}
    if not isinstance(s, dict):
        raise Problem('settings is an object, like {"levels": 2}.')
    if kind == 'boolean':
        if not ch.get('with'):
            o.modifiers.remove(m)
            raise Problem('a boolean needs with: the object to cut with, like {"op": "add_modifier", "object": "%s", "kind": "boolean", "with": "Cylinder", "settings": {"operation": "difference"}}.' % o.name)
        m.object = obj(ch['with'], ['MESH'])
        m.operation = str(s.get('operation', 'difference')).upper()
        if not ch.get('keep_cutter'):  # the cutter is a tool, not part of the picture
            m.object.hide_render = True
            m.object.display_type = 'WIRE'
    for k, v in s.items():
        if kind == 'boolean' and k == 'operation':
            continue
        if not hasattr(m, k):
            o.modifiers.remove(m)
            raise Problem('a %s modifier has no setting "%s".' % (kind, k))
        try:
            setattr(m, k, v.upper() if isinstance(v, str) and k in ('operation', 'offset_type', 'fit_type', 'decimate_type') else v)
        except Exception as e:
            o.modifiers.remove(m)
            raise Problem('%s: %s' % (k, str(e).split('\n')[0][:120]))
    return 'added a %s modifier to "%s"' % (kind, o.name)


def remove_modifier(ch):
    o = obj(ch.get('object'))
    m = o.modifiers.get(str(ch.get('name') or ''))
    if not m:
        raise Problem('"%s" has no modifier called "%s". It has: %s.' % (o.name, ch.get('name'), ', '.join(x.name for x in o.modifiers) or 'none'))
    o.modifiers.remove(m)
    return 'removed the modifier "%s" from "%s"' % (ch.get('name'), o.name)


def delete(ch):
    o = obj(ch.get('object'))
    n = o.name
    bpy.data.objects.remove(o, do_unlink=True)
    return 'deleted "%s"' % n


def rename(ch):
    o = obj(ch.get('object'))
    if not ch.get('new_name'):
        raise Problem('rename needs new_name, like {"op": "rename", "object": "%s", "new_name": "Table"}.' % o.name)
    old = o.name
    o.name = str(ch['new_name'])[:60]
    return 'renamed "%s" to "%s"' % (old, o.name)


def duplicate(ch):
    o = obj(ch.get('object'))
    c = o.copy()
    if o.data:
        c.data = o.data.copy()
    link(c)
    c.name = str(ch.get('new_name') or o.name)[:60]
    if ch.get('location') is not None:
        c.location = vec(ch['location'], 'location')
    if ch.get('by') is not None:
        b = vec(ch['by'], 'by')
        c.location = [c.location[i] + b[i] for i in range(3)]
    return 'copied "%s" as "%s"' % (o.name, c.name)


def parent(ch):
    o = obj(ch.get('object'))
    if ch.get('to') in (None, ''):
        o.parent = None
        return 'unparented "%s"' % o.name
    p = obj(ch.get('to'))
    mw = o.matrix_world.copy()
    o.parent = p
    o.matrix_world = mw
    return 'parented "%s" to "%s"' % (o.name, p.name)


def shade(ch):
    o = obj(ch.get('object'), ['MESH'])
    smooth = str(ch.get('how') or 'smooth').lower() != 'flat'
    for p in o.data.polygons:
        p.use_smooth = smooth
    return 'shaded "%s" %s' % (o.name, 'smooth' if smooth else 'flat')


def set_render(ch):
    r = scene().render
    eng = ch.get('engine')
    if eng:
        e = str(eng).lower()
        names = {'eevee': ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'], 'cycles': ['CYCLES'], 'workbench': ['BLENDER_WORKBENCH']}
        if e not in names:
            raise Problem('engine is eevee, cycles or workbench.')
        for n in names[e]:
            try:
                r.engine = n
                break
            except Exception:
                continue
    if ch.get('width'):
        r.resolution_x = max(16, min(16384, int(ch['width'])))
    if ch.get('height'):
        r.resolution_y = max(16, min(16384, int(ch['height'])))
    if ch.get('samples') and r.engine == 'CYCLES':
        scene().cycles.samples = max(1, min(100000, int(ch['samples'])))
    if ch.get('fps'):
        r.fps = max(1, min(240, int(ch['fps'])))
    return 'render: %s, %d x %d' % (r.engine, r.resolution_x, r.resolution_y)


def set_frames(ch):
    sc = scene()
    if ch.get('start') is None and ch.get('end') is None:
        raise Problem('set_frames needs start and/or end, like {"op": "set_frames", "start": 1, "end": 120}.')
    if ch.get('start') is not None:
        sc.frame_start = int(ch['start'])
    if ch.get('end') is not None:
        sc.frame_end = int(ch['end'])
    if sc.frame_end < sc.frame_start:
        raise Problem('end comes before start.')
    return 'frames %d to %d' % (sc.frame_start, sc.frame_end)


def set_camera(ch):
    o = obj(ch.get('object'), ['CAMERA'])
    scene().camera = o
    if ch.get('lens_mm'):
        o.data.lens = float(ch['lens_mm'])
    if ch.get('look_at') is not None:
        t = obj(ch['look_at']).location if isinstance(ch['look_at'], str) else vec(ch['look_at'], 'look_at')
        import mathutils
        d = mathutils.Vector(t) - o.location
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return 'the scene camera is "%s"' % o.name


def set_light(ch):
    o = obj(ch.get('object'), ['LIGHT'])
    if ch.get('power') is not None:
        o.data.energy = max(0.0, float(ch['power']))
    c = color(ch.get('color'))
    if c:
        o.data.color = c[:3]
    return 'light "%s": power %s' % (o.name, round(o.data.energy, 2))


def set_text(ch):
    o = obj(ch.get('object'), ['FONT'])
    if ch.get('text') is None:
        raise Problem('set_text needs text.')
    o.data.body = str(ch['text'])[:2000]
    return 'text of "%s" set' % o.name


def keyframe(ch):
    o = obj(ch.get('object'))
    if ch.get('frame') is None:
        raise Problem('keyframe needs frame, like {"op": "keyframe", "object": "%s", "frame": 24, "location": [0, 0, 2]}.' % o.name)
    f = int(ch['frame'])
    done = []
    for key, path in (('location', 'location'), ('rotation_deg', 'rotation_euler'), ('scale', 'scale')):
        if ch.get(key) is not None:
            v = vec(ch[key], key)
            setattr(o, path, [math.radians(x) for x in v] if key == 'rotation_deg' else v)
            o.keyframe_insert(data_path=path, frame=f)
            done.append(key)
    if not done:
        raise Problem('keyframe needs location, rotation_deg or scale to key.')
    return 'keyed %s of "%s" at frame %d' % (', '.join(done), o.name, f)


def open_file(path, new=False):
    if new:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        return
    if not os.path.isfile(path):
        raise Problem('There is no .blend file at %s.' % path)
    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)


def edit(job):
    open_file(job.get('file'), job.get('new'))
    done = []
    for i, ch in enumerate(job.get('changes') or []):
        op = str(ch.get('op') or '').lower()
        if op not in OPS:
            raise Problem('change %d: op is one of %s.' % (i + 1, ', '.join(OPS)))
        try:
            done.append(globals()[op](ch))
        except Problem as e:
            raise Problem('change %d (%s): %s Nothing was saved.' % (i + 1, op, e))
    bpy.ops.wm.save_as_mainfile(filepath=job['save_to'], copy=False, compress=True)
    return {'done': done, 'saved': job['save_to'], 'objects': len(scene().objects)}


def render(job):
    open_file(job.get('file'))
    sc = scene()
    if job.get('camera'):
        sc.camera = obj(job['camera'], ['CAMERA'])
    if not sc.camera:
        raise Problem('The scene has no camera. Add one first: blender_edit with {"op": "add_object", "kind": "camera", "location": [7, -7, 5]} then {"op": "set_camera", "object": "Camera", "look_at": [0, 0, 0]}.')
    if job.get('frame') is not None:
        sc.frame_set(int(job['frame']))
    r = sc.render
    eng = str(job.get('engine') or 'workbench').lower()
    if eng != 'scene':
        set_render({'engine': eng})
    if eng == 'cycles':
        sc.cycles.samples = int(job.get('samples') or 32)
    r.resolution_x = int(job.get('width') or 960)
    r.resolution_y = int(job.get('height') or 540)
    r.resolution_percentage = 100
    r.image_settings.file_format = 'PNG'
    r.filepath = job['png']
    bpy.ops.render.render(write_still=True)
    return {'png': job['png'], 'engine': r.engine, 'size': [r.resolution_x, r.resolution_y], 'camera': sc.camera.name}


def export(job):
    open_file(job.get('file'))
    out, kind, sel = job['to'], job['kind'], bool(job.get('selected'))
    if kind in ('glb', 'gltf'):
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB' if kind == 'glb' else 'GLTF_SEPARATE', use_selection=sel)
    elif kind == 'fbx':
        bpy.ops.export_scene.fbx(filepath=out, use_selection=sel)
    elif kind == 'obj':
        bpy.ops.wm.obj_export(filepath=out, export_selected_objects=sel)
    elif kind == 'stl':
        bpy.ops.wm.stl_export(filepath=out, export_selected_objects=sel)
    elif kind in ('usd', 'usdz', 'usdc', 'usda'):
        bpy.ops.wm.usd_export(filepath=out, selected_objects_only=sel)
    elif kind == 'ply':
        bpy.ops.wm.ply_export(filepath=out, export_selected_objects=sel)
    else:
        raise Problem('to is one of glb, gltf, fbx, obj, stl, usd, ply.')
    return {'exported': out, 'kind': kind}


def run(job):
    what = job.get('job')
    if what == 'look':
        open_file(job.get('file'))
        return look()
    if what == 'edit':
        return edit(job)
    if what == 'render':
        return render(job)
    if what == 'export':
        return export(job)
    raise Problem('unknown job %s' % what)


def main(path):
    with open(path, encoding='utf-8') as f:
        job = json.load(f)
    try:
        res = {'ok': True, **run(job)}
    except Problem as e:
        res = {'ok': False, 'error': str(e)}
    except Exception as e:
        res = {'ok': False, 'error': 'Blender: ' + str(e).split('\n')[0][:300]}
    with open(job['out'], 'w', encoding='utf-8') as f:
        json.dump(res, f)
    return res


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if argv:
        main(argv[0])
