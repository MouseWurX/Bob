#!/usr/bin/env python3
"""Brain surgery, baked in: turn single neurons, whole experts or attention heads up or down in the weights themselves.
CPU only, one tensor at a time. The owner, 13 Nov: "put the electrodes to it and turn up or turn down the signal".

  surgery.py --model <dir> --edits <edits.json> --out <dir>

edits.json: {"edits": [
  {"layer": 12, "expert": 37, "neuron": 401, "scale": 1.3},     one neuron inside one expert
  {"layer": 12, "expert": "shared", "neuron": 88, "scale": 0},   one neuron of the shared expert (0 = silent)
  {"layer": 20, "expert": 5, "scale": 0.8},                      a whole expert (the same as the engine's expert dial, made permanent)
  {"layer": 3, "head": 7, "scale": 1.2}                          one attention head (full-attention layers)
]}
A neuron's signal is what it writes back: its column in the expert's down projection, so scaling that column scales exactly
that neuron's push, and nothing else. Try a change live first (engine dials), keep only what the per-target benchmark
says helps, then bake it here. Writes surgery-report.json (every edit, the tensor it touched) and marks config.json.
"""
import argparse, json, os, re, shutil
import torch
from safetensors import safe_open
from safetensors.torch import save_file

def load_all(d):
    idx = os.path.join(d, "model.safetensors.index.json")
    files = sorted(set(json.load(open(idx))["weight_map"].values())) if os.path.exists(idx) else [f for f in os.listdir(d) if f.endswith(".safetensors")]
    for f in files:
        with safe_open(os.path.join(d, f), "pt") as h:
            yield f, {k: h.get_tensor(k) for k in h.keys()}

def head_dim(cfg):
    t = cfg.get("text_config", cfg)
    return t.get("head_dim") or t["hidden_size"] // t["num_attention_heads"]

def plan(edits, names, cfg):
    """edit -> (tensor name, how) for every edit; refuses edits that point at nothing."""
    out = []
    for e in edits:
        L, s = int(e["layer"]), float(e["scale"])
        if not 0 <= s <= 8: raise SystemExit(f"scale {s}: 0 (silent) to 8")
        pre = next((n.split(f"layers.{L}.")[0] for n in names if f".layers.{L}." in n), None)
        if pre is None: raise SystemExit(f"layer {L} is not in this model")
        lp = f"{pre}layers.{L}."
        if "head" in e:
            n = f"{lp}self_attn.o_proj.weight"
            if n not in names: raise SystemExit(f"layer {L} has no full attention (o_proj): heads can only be scaled on full-attention layers")
            hd = head_dim(cfg); h = int(e["head"]); out.append((n, ("cols", h * hd, (h + 1) * hd, s), e)); continue
        x = e.get("expert")
        if x == "shared":
            n = f"{lp}mlp.shared_expert.down_proj.weight"
        elif x is not None:
            per = f"{lp}mlp.experts.{int(x)}.down_proj.weight"; fused = f"{lp}mlp.experts.down_proj"
            n = per if per in names else fused if fused in names else None
            if n is None: raise SystemExit(f"layer {L} expert {x}: not found")
        else: raise SystemExit(f"edit {e}: needs an expert (a number or \"shared\") or a head")
        if n not in names: raise SystemExit(f"{n} not found")
        nr = e.get("neuron")
        if n.endswith("experts.down_proj"):  # fused [experts, hidden, neurons]
            out.append((n, ("fused", int(x), None if nr is None else int(nr), s), e))
        else:
            out.append((n, ("cols", int(nr), int(nr) + 1, s) if nr is not None else ("all", s), e))
    return out

def apply(t, how):
    t = t.clone()
    if how[0] == "cols": _, a, b, s = how; t[:, a:b] = (t[:, a:b].float() * s).to(t.dtype)
    elif how[0] == "all": t = (t.float() * how[1]).to(t.dtype)
    elif how[0] == "fused":
        _, x, nr, s = how
        if nr is None: t[x] = (t[x].float() * s).to(t.dtype)
        else: t[x, :, nr] = (t[x, :, nr].float() * s).to(t.dtype)
    return t

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--model", required=True); ap.add_argument("--edits", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    import family as FAM  # 14 Nov 2026: GPT-OSS heals and cuts, but this step still knows Qwen's weight names only
    if FAM.family(a.model) != FAM.QWEN: raise SystemExit(f"surgery.py: {FAM.family(a.model)} brains are not supported yet (surgery knows Qwen weight names only)")
    edits = json.load(open(a.edits))["edits"]
    cfg = json.load(open(os.path.join(a.model, "config.json")))
    names = set()
    for f in os.listdir(a.model):
        if f.endswith(".safetensors"):
            with safe_open(os.path.join(a.model, f), "pt") as h: names |= set(h.keys())
    todo = plan(edits, names, cfg)
    by = {}
    for n, how, e in todo: by.setdefault(n, []).append(how)
    os.makedirs(a.out, exist_ok=True)
    for f, tensors in load_all(a.model):
        for n in list(tensors):
            for how in by.get(n, []):
                if how[0] == "cols" and how[2] > tensors[n].shape[1]: raise SystemExit(f"{n}: has {tensors[n].shape[1]} columns, edit asks for {how[1]}-{how[2]}")
                tensors[n] = apply(tensors[n], how)
        save_file({k: v.contiguous() for k, v in tensors.items()}, os.path.join(a.out, f), metadata={"format": "pt"})
    for fn in os.listdir(a.model):
        p = os.path.join(a.model, fn)
        if os.path.isfile(p) and not fn.endswith(".safetensors"): shutil.copy(p, os.path.join(a.out, fn))
    cfg.setdefault("bob", {})["surgery"] = edits
    json.dump(cfg, open(os.path.join(a.out, "config.json"), "w"), indent=2)
    json.dump({"edits": [{**e, "tensor": n} for n, _, e in todo]}, open(os.path.join(a.out, "surgery-report.json"), "w"), indent=1)
    print(f"surgery: {len(todo)} edits on {len(by)} tensors -> {a.out}")

if __name__ == "__main__":
    main()
