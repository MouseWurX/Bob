# Bob's 3D workshop: a picture in, a textured 3D model (GLB) out, with TRELLIS.2 (Microsoft, MIT).
# Bob starts this with his private Python (Settings, Engines, 3D workshop) and sends one JSON job on stdin:
#   {"action": "download", "models": "<folder>", "sources": "<sources.json>"}   fetch the pinned weights
#   {"action": "make", "image": "<png/jpg>", "out": "<file.glb>", "models": "<folder>", "code": "<TRELLIS.2 folder>",
#    "quality": "fast" | "best", "seed": 42, "texture": 1024, "faces": 200000}
# It prints "PROGRESS <n>/<total> <words>" lines while it works and "DONE <file>" at the end.
# Nothing is uploaded. Downloads come only from huggingface.co, at the exact revisions in sources.json, and the
# big files are checked against their sha256. No account or token is needed (HF_TOKEN is passed on only if the user set one).
import hashlib
import json
import os
import sys


def say(n, total, words):
    print(f"PROGRESS {n}/{total} {words}", flush=True)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 22), b""):
            h.update(block)
    return h.hexdigest()


def local_dir(models, repo):
    return os.path.join(models, repo.split("/")[1])


def download(job):
    from huggingface_hub import hf_hub_download
    src = json.load(open(job["sources"], encoding="utf-8"))
    models = job["models"]
    files = [(w, f) for w in src["weights"] for f in w["files"]]
    total = len(files)
    for i, (w, f) in enumerate(files, 1):
        dest = os.path.join(local_dir(models, w["repo"]), f["path"])
        if os.path.exists(dest) and os.path.getsize(dest) == f["bytes"] and (not f.get("sha256") or os.path.exists(dest + ".ok")):
            say(i, total, f"have {f['path']}")
            continue
        say(i, total, f"getting {w['repo']} {f['path']} ({f['bytes'] / 1e9:.2f} GB)")
        try:
            got = hf_hub_download(w["repo"], f["path"], revision=w["revision"], local_dir=local_dir(models, w["repo"]))
        except Exception as e:  # gated, offline, ...
            msg = str(e)
            if ("401" in msg or "403" in msg or "gated" in msg.lower() or "restricted" in msg.lower()):
                print(f"GATED {w['repo']}", flush=True)
                sys.exit(3)
            raise
        if os.path.getsize(got) != f["bytes"]:
            os.remove(got)
            raise SystemExit(f"{f['path']} came down the wrong size; removed it.")
        if f.get("sha256"):
            if sha256(got) != f["sha256"]:
                os.remove(got)
                raise SystemExit(f"{f['path']} doesn't match its checksum; removed it.")
            open(got + ".ok", "w").close()
    # Bob's own pipeline file: the same as TRELLIS.2's, but every part read from this folder, and the MIT
    # BiRefNet background remover in place of RMBG-2.0 (non-commercial).
    up = json.load(open(os.path.join(local_dir(models, "microsoft/TRELLIS.2-4B"), "pipeline.json"), encoding="utf-8"))
    args = up["args"]
    for k, v in list(args["models"].items()):
        if not v.startswith("ckpts/"):  # a part kept in another repo, e.g. microsoft/TRELLIS-image-large/ckpts/...
            parts = v.split("/")
            args["models"][k] = "../" + parts[1] + "/" + "/".join(parts[2:])
    args["image_cond_model"]["args"]["model_name"] = local_dir(models, "camenduru/dinov3-vitl16-pretrain-lvd1689m")
    args["rembg_model"]["args"]["model_name"] = local_dir(models, "ZhengPeng7/BiRefNet")
    json.dump(up, open(os.path.join(local_dir(models, "microsoft/TRELLIS.2-4B"), "bob-pipeline.json"), "w", encoding="utf-8"), indent=2)
    print("DONE " + models, flush=True)


def make(job):
    os.environ.setdefault("ATTN_BACKEND", "xformers")
    os.environ.setdefault("SPARSE_ATTN_BACKEND", "xformers")
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    os.environ["HF_HUB_OFFLINE"] = "1"  # everything is already here; never reach out while making
    sys.path.insert(0, job["code"])
    total = 4
    say(0, total, "waking the 3D workshop")
    import torch
    from PIL import Image
    if not torch.cuda.is_available():
        raise SystemExit("No NVIDIA graphics card answered. Picture to 3D needs one.")
    from trellis2.pipelines import Trellis2ImageTo3DPipeline
    import o_voxel
    here = local_dir(job["models"], "microsoft/TRELLIS.2-4B")
    pipe = Trellis2ImageTo3DPipeline.from_pretrained(here, config_file="bob-pipeline.json")
    pipe.cuda()
    say(1, total, "reading the picture")
    image = Image.open(job["image"])  # a see-through background is used as is; otherwise BiRefNet cuts it out
    best = job.get("quality") == "best"
    say(2, total, "shaping the model")
    mesh = pipe.run(image, seed=int(job.get("seed", 42)), pipeline_type="1024_cascade" if best else "512")[0]
    mesh.simplify(16777216)  # nvdiffrast's limit
    say(3, total, "painting and packing the model")
    glb = o_voxel.postprocess.to_glb(
        vertices=mesh.vertices, faces=mesh.faces, attr_volume=mesh.attrs, coords=mesh.coords,
        attr_layout=mesh.layout, voxel_size=mesh.voxel_size, aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
        decimation_target=int(job.get("faces", 1000000 if best else 200000)),
        texture_size=int(job.get("texture", 2048 if best else 1024)),
        remesh=True, remesh_band=1, remesh_project=0, verbose=False)
    glb.export(job["out"])  # plain PNG textures: Bob's viewer and slicers read them (WebP needs an extension)
    peak = torch.cuda.max_memory_allocated() / 2**30
    print(f"PEAK_GB {peak:.2f}", flush=True)
    say(4, total, "done")
    print("DONE " + job["out"], flush=True)


if __name__ == "__main__":
    job = json.loads(sys.stdin.read() or "{}")
    if job.get("action") == "download":
        download(job)
    elif job.get("action") == "make":
        make(job)
    else:
        raise SystemExit("Say download or make.")
