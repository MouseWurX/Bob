# The Blender end of the Lab's Blender test world (22 Nov 2026; model-lab/blender-world.mjs starts it). It runs
# Blender's own Python module (bpy, with no window), reads one JSON request per line on stdin and answers one JSON line
# on stdout. Requests: {"op": "reset"}, {"op": "run", "code": "..."} (prints are returned), {"op": "info", ...},
# {"op": "dump"} (the whole scene as data, for the score). Everything happens in memory or in the job's own folder.
import sys, json, io, contextlib, traceback

import bpy

real_out = sys.stdout


def reply(obj):
    real_out.write(json.dumps(obj) + "\n")
    real_out.flush()


def vec(v, n=3):
    return [round(float(x), 4) for x in list(v)[:n]]


def obj_data(o):
    d = {"name": o.name, "type": o.type, "location": vec(o.location), "rotation": vec(o.rotation_euler),
         "scale": vec(o.scale), "dimensions": vec(o.dimensions), "parent": o.parent.name if o.parent else None,
         "hide": bool(o.hide_viewport or o.hide_render), "collection": [c.name for c in o.users_collection],
         "modifiers": [{"type": m.type, "name": m.name, **({"levels": m.levels} if hasattr(m, "levels") else {}),
                        **({"count": m.count} if m.type == "ARRAY" else {})} for m in o.modifiers],
         "materials": [s.material.name if s.material else None for s in o.material_slots]}
    try:
        from mathutils import Vector
        oe = o.evaluated_get(bpy.context.evaluated_depsgraph_get())  # with its modifiers (an array is its whole row)
        pts = [oe.matrix_world @ Vector(c) for c in oe.bound_box]
        d["bbox"] = [vec([min(p[i] for p in pts) for i in range(3)]), vec([max(p[i] for p in pts) for i in range(3)])]
        d["world"] = vec(o.matrix_world.translation)
        d["forward"] = vec(o.matrix_world.to_quaternion() @ Vector((0, 0, -1)))
    except Exception:
        pass
    if o.type == "MESH":
        me = o.data
        d["verts"] = len(me.vertices)
        d["faces"] = len(me.polygons)
        d["smooth"] = bool(me.polygons) and all(p.use_smooth for p in me.polygons)
    if o.type == "LIGHT":
        d["light"] = {"type": o.data.type, "energy": round(float(o.data.energy), 3), "color": vec(o.data.color)}
    if o.type == "CAMERA":
        d["lens"] = round(float(o.data.lens), 3)
    return d


def mat_data(m):
    out = {"name": m.name, "users": m.users}
    try:
        if m.use_nodes and m.node_tree:
            b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if b:
                out["base_color"] = vec(b.inputs["Base Color"].default_value, 4)
                out["metallic"] = round(float(b.inputs["Metallic"].default_value), 3)
                out["roughness"] = round(float(b.inputs["Roughness"].default_value), 3)
        if "base_color" not in out:
            out["base_color"] = vec(m.diffuse_color, 4)
    except Exception:
        pass
    return out


def keys_of(o):
    a = o.animation_data.action
    curves = list(getattr(a, "fcurves", []) or [])
    if not curves:  # Blender 4.4+: layered actions keep their curves in channelbags
        for layer in getattr(a, "layers", []):
            for strip in layer.strips:
                for bag in getattr(strip, "channelbags", []):
                    curves += list(bag.fcurves)
    return sorted({round(k.co[0]) for fc in curves for k in fc.keyframe_points})


def dump():
    bpy.context.view_layer.update()  # objects made by code get their world place only after an update
    sc = bpy.context.scene
    return {"objects": [obj_data(o) for o in sc.objects], "materials": [mat_data(m) for m in bpy.data.materials],
            "collections": [c.name for c in bpy.data.collections],
            "frame": {"start": sc.frame_start, "end": sc.frame_end, "fps": sc.render.fps},
            "render": {"x": sc.render.resolution_x, "y": sc.render.resolution_y, "engine": sc.render.engine},
            "camera": sc.camera.name if sc.camera else None,
            "keyframes": {o.name: keys_of(o) for o in sc.objects if o.animation_data and o.animation_data.action},
            "file": bpy.data.filepath or None, "at_end": at_end(sc)}


def at_end(sc):
    # where each animated object is on the first and last frame (the score checks movement, not keys alone)
    moved = [o for o in sc.objects if o.animation_data and o.animation_data.action]
    if not moved:
        return {}
    keep = sc.frame_current
    out = {}
    for f in (sc.frame_start, sc.frame_end):
        sc.frame_set(f)
        for o in moved:
            out.setdefault(o.name, {})[str(f)] = vec(o.matrix_world.translation)
    sc.frame_set(keep)
    return out


def info(req):
    objs = list(bpy.context.scene.objects)
    q = str(req.get("query") or "").lower()
    if q:
        objs = [o for o in objs if q in o.name.lower()]
    lim = int(req.get("limit") or 20)
    act = bpy.context.view_layer.objects.active
    lines = [f"Scene '{bpy.context.scene.name}': {len(bpy.context.scene.objects)} objects; active {act.name if act else 'none'}; mode {bpy.context.mode}."]
    for o in objs[:lim]:
        d = obj_data(o)
        bits = [f"{d['name']} ({d['type'].lower()})", "at " + ", ".join(f"{x:g}" for x in d["location"]),
                "size " + " x ".join(f"{x:g}" for x in d["dimensions"])]
        if d["materials"]:
            bits.append("materials " + ", ".join(m or "(empty)" for m in d["materials"]))
        if d["modifiers"]:
            bits.append("modifiers " + ", ".join(m["type"].lower() for m in d["modifiers"]))
        if d["parent"]:
            bits.append(f"parent {d['parent']}")
        lines.append("- " + "; ".join(bits))
    if len(objs) > lim:
        lines.append(f"... and {len(objs) - lim} more (use query, or a higher limit).")
    return "\n".join(lines)


def run(code):
    buf = io.StringIO()
    env = {"bpy": bpy, "__name__": "__main__"}
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(code, "<blender code>", "exec"), env)
        return {"ok": True, "out": buf.getvalue()}
    except Exception:
        tb = traceback.format_exc().splitlines()
        return {"ok": False, "out": buf.getvalue(), "error": "\n".join(tb[-4:])}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=False)


reset()
reply({"ready": True, "version": bpy.app.version_string})
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        op = req.get("op")
        if op == "reset":
            reset(); reply({"ok": True})
        elif op == "run":
            reply(run(str(req.get("code") or "")))
        elif op == "info":
            reply({"ok": True, "out": info(req)})
        elif op == "dump":
            reply({"ok": True, "scene": dump()})
        else:
            reply({"ok": False, "error": f"unknown op {op}"})
    except Exception as e:
        reply({"ok": False, "error": str(e)})
