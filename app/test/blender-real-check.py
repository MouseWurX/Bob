# Real Blender check for src/blender-job.py (not part of npm test: it needs Blender). Run it with Blender's Python:
#   blender --background --factory-startup --python test/blender-real-check.py
# or, with Blender as a Python module (pip install bpy; how the cloud checks it):
#   python test/blender-real-check.py
# Makes a scene, looks at it, catches wrong steps, renders with Cycles on the processor and exports every kind.
import importlib.util
import json
import os
import sys
import tempfile

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('bj', os.path.join(here, '..', 'src', 'blender-job.py'))
bj = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bj)
box = tempfile.mkdtemp(prefix='bob-blender-real-')
ok = bad = 0


def go(job):
    job['out'] = os.path.join(box, 'out.json')
    with open(os.path.join(box, 'job.json'), 'w') as f:
        json.dump(job, f)
    return bj.main(os.path.join(box, 'job.json'))


def check(name, cond, extra=''):
    global ok, bad
    ok, bad = (ok + 1, bad) if cond else (ok, bad + 1)
    print('%s %s%s' % ('PASS' if cond else 'FAIL', name, '' if cond else ' -> ' + str(extra)[:300]))


s = os.path.join(box, 's.blend')
r = go({'job': 'edit', 'new': True, 'save_to': s, 'changes': [
    {'op': 'add_object', 'kind': 'cube', 'name': 'Box', 'location': [0, 0, 1], 'color': 'red'},
    {'op': 'add_object', 'kind': 'cylinder', 'name': 'Hole', 'size': 0.8, 'height': 3, 'location': [0, 0, 1]},
    {'op': 'add_modifier', 'object': 'Box', 'kind': 'boolean', 'with': 'Hole', 'settings': {'operation': 'difference'}},
    {'op': 'add_modifier', 'object': 'Box', 'kind': 'bevel', 'settings': {'width': 0.05, 'segments': 3}},
    {'op': 'add_object', 'kind': 'camera', 'location': [6, -6, 5]},
    {'op': 'set_camera', 'object': 'Camera', 'look_at': [0, 0, 1]},
    {'op': 'add_object', 'kind': 'light', 'light': 'sun', 'power': 4, 'location': [2, 2, 6]},
    {'op': 'keyframe', 'object': 'Box', 'frame': 1, 'location': [0, 0, 1]},
    {'op': 'keyframe', 'object': 'Box', 'frame': 24, 'location': [0, 0, 3]},
    {'op': 'shade', 'object': 'Box', 'how': 'smooth'}]})
check('a new scene with every kind of step', r['ok'] and len(r['done']) == 10 and os.path.isfile(s), r)
look = go({'job': 'look', 'file': s})
box_o = next((o for o in look.get('objects', []) if o['name'] == 'Box'), {})
check('look sees the objects, material, modifiers and animation', look['ok'] and box_o.get('materials') == ['Box colour'] and [m['kind'] for m in box_o.get('modifiers', [])] == ['boolean', 'bevel'] and box_o.get('animated') and look['camera'] == 'Camera', look)
check('the boolean cutter is hidden in renders', next(o for o in look['objects'] if o['name'] == 'Hole').get('render_hidden') is True)
r = go({'job': 'edit', 'file': s, 'save_to': os.path.join(box, 'x.blend'), 'changes': [{'op': 'move', 'object': 'Box'}]})
check('a step missing its values: the shape to send, nothing saved', not r['ok'] and 'like {"op": "move", "object": "Box", "location": [0, 0, 1]}' in r['error'] and 'Nothing was saved' in r['error'] and not os.path.exists(os.path.join(box, 'x.blend')), r)
r = go({'job': 'edit', 'file': s, 'save_to': os.path.join(box, 'x.blend'), 'changes': [{'op': 'delete', 'object': 'Nope'}]})
check('an object that is not there: lists the ones that are', not r['ok'] and 'Objects: ' in r['error'] and 'Box' in r['error'], r)
r = go({'job': 'edit', 'file': s, 'save_to': os.path.join(box, 's3.blend'), 'changes': [
    {'op': 'set_material', 'object': 'Box', 'color': '#1f5fd6', 'metallic': 0.8},
    {'op': 'duplicate', 'object': 'Box', 'new_name': 'Box2', 'by': [3, 0, 0]},
    {'op': 'parent', 'object': 'Box2', 'to': 'Box'},
    {'op': 'add_object', 'kind': 'text', 'text': 'Hi', 'name': 'Sign'},
    {'op': 'set_text', 'object': 'Sign', 'text': 'Hello'},
    {'op': 'set_render', 'engine': 'eevee', 'width': 1280, 'height': 720},
    {'op': 'set_frames', 'start': 1, 'end': 48},
    {'op': 'rename', 'object': 'Hole', 'new_name': 'Cutter'},
    {'op': 'remove_modifier', 'object': 'Box', 'name': 'Bevel'},
    {'op': 'set_light', 'object': 'Light', 'power': 2, 'color': 'orange'},
    {'op': 'delete', 'object': 'Light'}]})
check('the rest of the steps', r['ok'] and len(r['done']) == 11, r)
png = os.path.join(box, 'r.png')
r = go({'job': 'render', 'file': s, 'png': png, 'width': 320, 'height': 180, 'engine': 'cycles', 'samples': 8})
check('render with Cycles on the processor', r['ok'] and os.path.getsize(png) > 1000, r)
for k in ['glb', 'fbx', 'obj', 'stl', 'usd', 'ply']:
    out = os.path.join(box, 's.' + k)
    r = go({'job': 'export', 'file': s, 'to': out, 'kind': k})
    check('export ' + k, r['ok'] and os.path.getsize(out) > 100, r)
print('\n%d passed, %d failed (files in %s)' % (ok, bad, box))
sys.exit(1 if bad else 0)
