#!/usr/bin/env python3
"""Blend a trained Bob back toward the brain it came from, so training keeps what it taught and gives back
some of the general knowledge it wore away. CPU only, one tensor at a time (no card, little memory).

  merge.py --base <the brain it was trained or cut from> --tuned <trained Bob> [--tuned <another> ...] --out <dir>
           --method linear|ties|dare|dare_ties  --weight 0.7 (the trained share)  --density 0.5 (ties/dare: share of changes kept)
  Examples: 35Bob-facts1 70/30 with stock Qwen3.6:  --base Qwen3.6-35B-A3B --tuned 35Bob-facts1 --weight 0.7
            a healed rung against its own cut:      --base <the rung above> --tuned <healed rung>   (bob-keep.json maps the experts)

Methods (all work on the change each trained Bob made, change = tuned - base):
  linear     base + weight * change. weight 1 = the trained Bob, 0 = the base.
  ties       per tensor: keep the largest `density` share of each change, let the changes vote on each number's sign,
             average the ones that agree (TIES-Merging, Yadav et al. 2023). With one trained Bob it is trim only.
  dare       drop a random (1 - density) share of each change and scale the rest up by 1/density (Yu et al. 2023).
  dare_ties  dare's drop, then ties' sign vote.
Mixture-of-experts aware: when the trained Bob is a cut (fewer experts than the base, bob-keep.json beside it),
each kept expert is blended with ITS OWN expert in the base, router rows too. Tensors the base lacks (or with
another shape) are copied from the trained Bob unchanged and listed in merge-report.json.
"""
import argparse, json, os, re, shutil
import torch
from safetensors import safe_open
from safetensors.torch import save_file

FUSED = re.compile(r"\.layers\.(\d+)\.mlp\.(experts\.(gate_up_proj|down_proj)|gate\.weight)$")
PER = re.compile(r"^(.*\.layers\.(\d+)\.mlp\.experts\.)(\d+)(\..+)$")
SHARD = 4 * 1024**3

class Weights:
    """Lazy reader over a model folder's safetensors files."""
    def __init__(self, d):
        idx = os.path.join(d, "model.safetensors.index.json")
        files = sorted(set(json.load(open(idx))["weight_map"].values())) if os.path.exists(idx) else [f for f in os.listdir(d) if f.endswith(".safetensors")]
        self.where = {}
        for f in files:
            with safe_open(os.path.join(d, f), "pt") as h:
                for k in h.keys(): self.where[k] = os.path.join(d, f)
        self.open = {}
    def names(self): return list(self.where)
    def has(self, k): return k in self.where
    def get(self, k):
        f = self.where[k]
        if f not in self.open: self.open = {f: safe_open(f, "pt")}  # one file open at a time keeps memory flat
        return self.open[f].get_tensor(k)

def experts_of(d):
    c = json.load(open(os.path.join(d, "config.json"))); return c.get("text_config", c).get("num_experts")

def keep_of(tuned_dir, keep_file=None):
    p = keep_file or os.path.join(tuned_dir, "bob-keep.json")
    return json.load(open(p))["layers"] if os.path.exists(p) else None

def base_name_and_rows(name, keep):
    """The base tensor that holds this tuned tensor, and which expert rows of it (None = all)."""
    if keep is None: return name, None
    m = PER.match(name)
    if m: return f"{m.group(1)}{keep[int(m.group(2))][int(m.group(3))]}{m.group(4)}", None
    m = FUSED.search(name)
    if m: return name, keep[int(m.group(1))]
    return name, None

def trim(d, density):
    if density >= 1: return d
    k = max(1, int(d.numel() * density))
    th = d.abs().flatten().float().kthvalue(d.numel() - k + 1).values
    return d * (d.abs() >= th)

def drop(d, density, gen):
    if density >= 1: return d
    keep = torch.rand(d.shape, generator=gen) < density
    return d * keep / density

def combine(base, tuned_list, method, weight, density, gen):
    """base: float tensor; tuned_list: float tensors of the same shape. Returns the blended float tensor."""
    deltas = [t - base for t in tuned_list]
    if method == "linear":
        return base + weight * sum(deltas) / len(deltas)
    if method in ("dare", "dare_ties"): deltas = [drop(d, density, gen) for d in deltas]
    if method == "dare": return base + weight * sum(deltas) / len(deltas)
    if method == "ties": deltas = [trim(d, density) for d in deltas]
    stack = torch.stack(deltas)
    sign = torch.sign(stack.sum(0))
    agree = (torch.sign(stack) == sign) & (stack != 0)
    n = agree.sum(0).clamp(min=1)
    return base + weight * (stack * agree).sum(0) / n

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True); ap.add_argument("--tuned", action="append", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--method", default="linear", choices=["linear", "ties", "dare", "dare_ties"])
    ap.add_argument("--weight", type=float, default=0.7); ap.add_argument("--density", type=float, default=0.5)
    ap.add_argument("--keep-file", default=None); ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    if not 0 <= a.weight <= 2: ap.error("--weight is the trained share, 0 to 1 (up to 2 to push past the trained Bob)")
    if not 0 < a.density <= 1: ap.error("--density is a share, above 0 and at most 1")
    base = Weights(a.base); tuned = [Weights(t) for t in a.tuned]
    keeps = [keep_of(t, a.keep_file) for t in a.tuned]
    bcfg = json.load(open(os.path.join(a.base, "config.json"))); bcfg = bcfg.get("text_config", bcfg)
    for t, k in zip(a.tuned, keeps):
        tcfg = json.load(open(os.path.join(t, "config.json"))); tcfg = tcfg.get("text_config", tcfg)
        if tcfg.get("num_experts") != bcfg.get("num_experts") and k is None:
            raise SystemExit(f"{t} has {tcfg.get('num_experts')} experts and the base {bcfg.get('num_experts')}: give its bob-keep.json (--keep-file)")
    keeps = [None if k is not None and experts_of(t) == bcfg.get("num_experts") else k
             for t, k in zip(a.tuned, keeps)]  # same size as the base: blend expert by expert as is
    if len({json.dumps(k) for k in keeps}) > 1: raise SystemExit("the trained Bobs keep different experts: blend them one at a time against their own base")
    gen = torch.Generator().manual_seed(a.seed)
    os.makedirs(a.out, exist_ok=True)
    report = {"method": a.method, "weight": a.weight, "density": a.density, "base": a.base, "tuned": a.tuned, "blended": 0, "copied": [], "changed_share": {}}
    buf, size, shard, wmap, total = {}, 0, 0, {}, 0
    def flush():
        nonlocal buf, size, shard
        if not buf: return
        name = f"model-{shard + 1:05d}.safetensors"; save_file(buf, os.path.join(a.out, name), metadata={"format": "pt"})
        for k in buf: wmap[k] = name
        buf, size, shard = {}, 0, shard + 1
    for name in tuned[0].names():
        t0 = tuned[0].get(name); dt = t0.dtype
        ts = [t0] + [w.get(name) for w in tuned[1:]]
        bname, rows = base_name_and_rows(name, keeps[0])
        b = base.get(bname) if base.has(bname) else None
        if b is not None and rows is not None: b = b[torch.tensor(rows)]
        if b is None or b.shape != t0.shape or not t0.is_floating_point() or any(t.shape != t0.shape for t in ts):
            out = t0; report["copied"].append(name)
        else:
            out = combine(b.float(), [t.float() for t in ts], a.method, a.weight, a.density, gen).to(dt); report["blended"] += 1
            if re.search(r"layers\.(0|1)\.", name) or "embed" in name:
                report["changed_share"][name] = float(((out != b.to(dt)).sum() / out.numel()).item())
        n = out.numel() * out.element_size()
        if size + n > SHARD and buf: flush()
        buf[name] = out.contiguous(); size += n; total += n
    flush()
    json.dump({"metadata": {"total_size": total}, "weight_map": wmap}, open(os.path.join(a.out, "model.safetensors.index.json"), "w"), indent=1)
    src = a.tuned[0]
    for fn in os.listdir(src):
        p = os.path.join(src, fn)
        if os.path.isfile(p) and not fn.endswith(".safetensors") and fn != "model.safetensors.index.json": shutil.copy(p, os.path.join(a.out, fn))
    cfg = json.load(open(os.path.join(a.out, "config.json")))
    cfg.setdefault("bob", {})["merged"] = {k: report[k] for k in ("method", "weight", "density")} | {"base": os.path.basename(os.path.normpath(a.base))}
    json.dump(cfg, open(os.path.join(a.out, "config.json"), "w"), indent=2)
    json.dump(report, open(os.path.join(a.out, "merge-report.json"), "w"), indent=1)
    print(f"merged: {report['blended']} tensors blended ({a.method}, {a.weight:.0%} trained), {len(report['copied'])} copied as they were, {total / 1e9:.1f} GB -> {a.out}")

if __name__ == "__main__":
    main()
