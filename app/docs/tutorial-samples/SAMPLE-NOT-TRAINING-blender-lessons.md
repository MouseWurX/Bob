# SAMPLE – NOT TRAINING DATA

Three mock-ups of what a Blender tutorial lesson would look like. Written by Claude for viewing only, 15 Nov 2026.
They are not in any lesson folder, are not JSONL, and must never be trained on, converted or published.
Real lessons are written by Bob's Qwen teacher on a rental and read by Opus 5.5.

Tool names and arguments are Bob's locked Qwen shape v2 (`write_file` path/content, `run_command` cmd/args/cwd).
Each **Tool result** box marked ⚙ is where the real headless Blender output goes. The text shown there is only an
example of what Blender prints. In a real lesson, Blender actually runs in the lesson's throwaway home and its real
output is saved there. Paths show as `C:\Users\you\...` after the scrub.

---

## Sample 1: a fence from one post (source: `bpy.types.ArrayModifier`, Blender 4.5 API, facts only)

**System:** Bob's app prompt (unchanged, not shown here)

**Person:** Make me a simple wooden fence in Blender: one thin post repeated 12 times, half a metre apart. Save it as fence.blend in my Documents.

**Bob:** I'll make one post, repeat it with an Array modifier set to a fixed 0.5 m gap, then save the file. First I'll write the script.

```
write_file
  path: "~/Documents/fence.py"
  content: |
    import bpy, os
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5))
    post = bpy.context.active_object
    post.name = "FencePost"
    post.scale = (0.08, 0.08, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    row = post.modifiers.new("Row", 'ARRAY')
    row.count = 12
    row.use_relative_offset = False
    row.use_constant_offset = True
    row.constant_offset_displace = (0.5, 0.0, 0.0)
    out = os.path.expanduser("~/Documents/fence.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("SAVED", out, "posts:", row.count)
```

> **Tool result:** Wrote C:\Users\you\Documents\fence.py

**Bob:** The script is saved. Now I'll run it in Blender with no window.

```
run_command
  cmd: "blender"
  args: ["--background", "--factory-startup", "--python-exit-code", "1", "--python", "C:\\Users\\you\\Documents\\fence.py"]
  cwd: "C:\\Users\\you\\Documents"
  why: "Build the fence and save fence.blend"
```

> ⚙ **Tool result (REAL BLENDER OUTPUT GOES HERE; example):**
> Exit code 0
> Blender 4.5.x
> Info: Saved "fence.blend"
> SAVED C:\Users\you\Documents\fence.blend posts: 12

**Bob (final):** Done. fence.blend is in your Documents. It has one post, 8 cm thick and 1 m tall, repeated 12 times at a 0.5 m gap, so the fence is about 5.5 m long. The Array modifier is still live, so you can change the count or the gap in Blender later.

---

## Sample 2: a low-poly rock, with a fix (source: `bmesh.ops`, Blender 4.5 API, facts only)

**Person:** Write a Blender script that makes a random low-poly rock about 1 m across and saves it as rock.blend in Documents.

**Bob:** I'll build a rough sphere with bmesh, push the points in and out at random, then save it.

```
write_file
  path: "~/Documents/rock.py"
  content: |
    import bpy, bmesh, random, os
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(7)
    me = bpy.data.meshes.new("Rock")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, diameter=0.5)
    for v in bm.verts:
        v.co *= random.uniform(0.8, 1.15)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("Rock", me)
    bpy.context.scene.collection.objects.link(ob)
    out = os.path.expanduser("~/Documents/rock.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("SAVED", out, "verts:", len(me.vertices))
```

> **Tool result:** Wrote C:\Users\you\Documents\rock.py

```
run_command
  cmd: "blender"
  args: ["--background", "--factory-startup", "--python-exit-code", "1", "--python", "C:\\Users\\you\\Documents\\rock.py"]
  cwd: "C:\\Users\\you\\Documents"
  why: "Make the rock"
```

> ⚙ **Tool result (REAL BLENDER OUTPUT GOES HERE; example):**
> Exit code 1
> Traceback (most recent call last):
>   File "C:\Users\you\Documents\rock.py", line 6, in &lt;module&gt;
> TypeError: bmesh.ops.create_icosphere: keyword "diameter" is invalid for this operator

**Bob:** Blender says `create_icosphere` has no `diameter` setting. In this version it takes `radius`. A 1 m rock needs a radius of 0.5, so I'll change that one word and run it again.

```
write_file
  path: "~/Documents/rock.py"
  content: |   (same script, line 6 now reads)
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.5)
```

> **Tool result:** Wrote C:\Users\you\Documents\rock.py

```
run_command   (same as before)
```

> ⚙ **Tool result (REAL BLENDER OUTPUT GOES HERE; example):**
> Exit code 0
> Info: Saved "rock.blend"
> SAVED C:\Users\you\Documents\rock.blend verts: 162

**Bob (final):** rock.blend is saved in your Documents. It's a 162-point rock about 1 m across, with each point pushed out or in by up to 15–20%. My first try used an old setting name (`diameter`), which Blender rejected, so I switched it to `radius`. The random seed is fixed at 7, so change it to get a different rock.

---

## Sample 3: export for Unreal (source: `bpy.ops.export_scene`, Blender 4.5 API, facts only)

**Person:** I have crate.blend in Documents. Export just the object called Crate as an FBX that Unreal will import at the right size.

**Bob:** I'll open crate.blend, select only Crate, and export it as FBX with the unit scale set the way Unreal expects. Then I'll check that the file was made.

```
write_file
  path: "~/Documents/export_crate.py"
  content: |
    import bpy, os
    src = os.path.expanduser("~/Documents/crate.blend")
    bpy.ops.wm.open_mainfile(filepath=src)
    ob = bpy.data.objects.get("Crate")
    if ob is None:
        raise SystemExit("No object called Crate in crate.blend")
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    out = os.path.expanduser("~/Documents/crate.fbx")
    bpy.ops.export_scene.fbx(filepath=out, use_selection=True,
        apply_scale_options='FBX_SCALE_UNITS', axis_forward='-Z', axis_up='Y',
        apply_unit_scale=True, use_mesh_modifiers=True)
    print("EXPORTED", out, os.path.getsize(out), "bytes")
```

> **Tool result:** Wrote C:\Users\you\Documents\export_crate.py

```
run_command
  cmd: "blender"
  args: ["--background", "--factory-startup", "--python-exit-code", "1", "--python", "C:\\Users\\you\\Documents\\export_crate.py"]
  cwd: "C:\\Users\\you\\Documents"
  why: "Export Crate to FBX for Unreal"
```

> ⚙ **Tool result (REAL BLENDER OUTPUT GOES HERE; example):**
> Exit code 0
> FBX export starting... 'C:\Users\you\Documents\crate.fbx'
> export finished in 0.0123 sec.
> EXPORTED C:\Users\you\Documents\crate.fbx 28764 bytes

**Bob (final):** Exported. crate.fbx (about 28 KB) is next to crate.blend in your Documents, and it holds only the Crate object with its modifiers applied. The scale is set so 1 Blender metre comes in as 100 Unreal units (1 m), so you can drag it into Unreal's Content Browser as it is.

*(In the real set, crate.blend is a seed file the pipeline makes first in the throwaway home, so the run is real.)*

---

## What is checked

- The script really ran (the ⚙ output is Blender's, not made up) and the final answer matches that output.
- Bob's tool names, with no shell instead of `run_command` and no invented tools.
- Short plain-words steps between calls, with no personality chatter.
- No source wording copied, and the source and licence kept on the lesson.
- No names, paths or devices left after the scrub.
