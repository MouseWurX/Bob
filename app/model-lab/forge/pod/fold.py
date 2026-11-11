#!/usr/bin/env python3
"""Fold instead of drop (expert merging), on the card. Run after prune.py on the same rung:
  fold.py --src <uncut model dir> --cut <dir prune.py wrote> [--counts name=file,... | --counts file] [--device cuda]

prune.py keeps some experts and drops the rest. This goes back for the dropped ones and blends each into the kept expert
most like it, in place in the cut model, before the heal:
  1. Which kept expert: the one whose router row points the most alike (cosine), layer by layer.
  2. Line the neurons up: each neuron of the folded expert is matched to the most alike neuron of the kept one (greedy,
     the most alike pair first, on a sample of 128 of its in weights and 128 of its out weights).
  3. Blend: a weighted average, each expert weighing what it's used. Several count files weigh the same (their shares
     are summed, as keep.py does). The router row is blended the same way. With no counts the kept expert weighs half.
The same rule as the Lab's src/lab-fold.js, so a fold here and a fold at home agree. Needs the experts as one tensor per
layer (gate_up_proj [experts, 2*neurons, width], down_proj [experts, width, neurons], gate.weight [experts, width]).
"""
import argparse, json, os, re
import torch
from safetensors import safe_open
from safetensors.torch import load_file, save_file

SAMPLE = 128
NAME = re.compile(r"^(model\.language_model\.layers\.(\d+)\.mlp\.)(experts\.gate_up_proj|experts\.down_proj|gate\.weight)$")


def sample_idx(n):
    s = min(n, SAMPLE)
    return torch.tensor([(i * n) // s for i in range(s)])


def targets(rows, kept):
    """dropped expert -> the kept expert with the most alike router row."""
    r = torch.nn.functional.normalize(rows.float(), dim=-1)
    keptset = set(kept); kt = torch.tensor(kept)
    out = {}
    for d in range(rows.shape[0]):
        if d in keptset: continue
        out[d] = kept[int(torch.argmax(r[kt] @ r[d]))]  # argmax takes the first of equals, as the Lab does
    return out


def features(gate, down, hs):
    """One unit-length row per neuron: a sample of what it reads (gate row) and what it writes (down column)."""
    f = torch.cat([gate[:, hs], down[hs, :].t()], dim=1).float()
    return f / f.norm(dim=1, keepdim=True).clamp_min(1e-30)


def align(ft, fd):
    """perm[slot of the kept expert] = neuron of the folded one. Greedy: the most alike pair first, each used once."""
    I = ft.shape[0]
    sim = (ft @ fd.t()).clone()
    perm = torch.full((I,), -1, dtype=torch.long)
    for _ in range(I):
        flat = int(torch.argmax(sim)); a, b = flat // I, flat % I
        perm[a] = b; sim[a, :] = -float("inf"); sim[:, b] = -float("inf")
    return perm


def weights(members, use):
    if use is None:
        return [1.0] if len(members) == 1 else [0.5] + [0.5 / (len(members) - 1)] * (len(members) - 1)
    w = [max(0.0, float(use[e])) for e in members]; s = sum(w)
    return [x / s for x in w] if s > 0 else [1.0] + [0.0] * (len(members) - 1)


def use_table(spec, n_layers, E):
    """Per layer, how much each expert is used: every count file weighs the same (shares summed)."""
    if not spec: return None
    files = [p.split("=", 1)[-1] for p in spec.split(",") if p]
    out = [[0.0] * E for _ in range(n_layers)]; seen = [False] * n_layers
    for f in files:
        c = json.load(open(f))
        assert c["experts"] == E, f"{f}: counted for {c['experts']} experts, the model has {E}"
        for li, row in enumerate(c["layers"][:n_layers]):
            if not row: continue
            t = sum(row) or 1; seen[li] = True
            for e, v in enumerate(row): out[li][e] += v / t
    return [r if ok else None for r, ok in zip(out, seen)]


def fold_layer(gu, dn, rt, kept, use, device="cpu"):
    """gu [E, 2I, H], dn [E, H, I], rt [E, H] (full, uncut). Returns the folded (gu, dn, rt) for the kept experts, and how many were folded."""
    E, H = rt.shape; I = dn.shape[2]
    hs = sample_idx(H)
    tg = targets(rt, kept)
    groups = {t: [t] for t in kept}
    for d, t in tg.items(): groups[t].append(d)
    out_gu, out_dn, out_rt = [], [], []
    for t in kept:
        members = groups[t]; w = weights(members, use)
        if len(members) == 1 or all(x == 0 for x in w[1:]):
            out_gu.append(gu[t]); out_dn.append(dn[t]); out_rt.append(rt[t]); continue
        ft = features(gu[t, :I].to(device), dn[t].to(device), hs)
        a_gu = torch.zeros(gu[t].shape, dtype=torch.float32, device=device); a_dn = torch.zeros(dn[t].shape, dtype=torch.float32, device=device); a_rt = torch.zeros(H, dtype=torch.float32, device=device)
        for i, (e, x) in enumerate(zip(members, w)):
            if x == 0: continue
            g, d = gu[e].to(device).float(), dn[e].to(device).float()
            if i:
                p = align(ft, features(g[:I], d, hs)).to(device)
                g = torch.cat([g[:I][p], g[I:][p]], dim=0); d = d[:, p]
            a_gu += x * g; a_dn += x * d; a_rt += x * rt[e].to(device).float()
        out_gu.append(a_gu.to(gu.dtype).cpu()); out_dn.append(a_dn.to(dn.dtype).cpu()); out_rt.append(a_rt.to(rt.dtype).cpu())
    return torch.stack(out_gu), torch.stack(out_dn), torch.stack(out_rt), len(tg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True); ap.add_argument("--cut", required=True); ap.add_argument("--counts", default=""); ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    a = ap.parse_args()
    keep = json.load(open(os.path.join(a.cut, "bob-keep.json")))["layers"]
    cfg = json.load(open(os.path.join(a.src, "config.json"))); tc = cfg.get("text_config", cfg); E = tc["num_experts"]
    use = use_table(a.counts, len(keep), E)
    def index(d):
        p = os.path.join(d, "model.safetensors.index.json")
        if os.path.exists(p): return json.load(open(p))["weight_map"]
        with safe_open(os.path.join(d, "model.safetensors"), "pt") as f: return {k: "model.safetensors" for k in f.keys()}
    src_map, cut_map = index(a.src), index(a.cut)
    layers = sorted({int(m.group(2)) for m in map(NAME.match, src_map) if m})
    if not layers: raise SystemExit("fold: this model doesn't keep its experts as one tensor per layer, so there is nothing here to fold. Cut it without \"fold\".")
    def src_tensor(name):
        with safe_open(os.path.join(a.src, src_map[name]), "pt") as f: return f.get_tensor(name)
    by_shard = {}
    for li in layers:
        for part in ("experts.gate_up_proj", "experts.down_proj", "gate.weight"):
            n = f"model.language_model.layers.{li}.mlp.{part}"; by_shard.setdefault(cut_map[n], []).append(n)
    done, folded = {}, 0
    def layer(li):
        nonlocal folded
        if li not in done:
            pre = f"model.language_model.layers.{li}.mlp."
            kept = sorted(int(e) for e in keep[li])
            gu, dn, rt, n = fold_layer(src_tensor(pre + "experts.gate_up_proj"), src_tensor(pre + "experts.down_proj"), src_tensor(pre + "gate.weight"), kept, use[li] if use else None, a.device)
            done[li] = {pre + "experts.gate_up_proj": gu, pre + "experts.down_proj": dn, pre + "gate.weight": rt}; folded += n
            print(f"fold: layer {li}: {n} experts folded into {len(kept)}", flush=True)
        return done[li]
    for shard, names in sorted(by_shard.items()):
        p = os.path.join(a.cut, shard)
        tensors = load_file(p)
        for n in names:
            new = layer(int(NAME.match(n).group(2)))[n]
            assert tuple(new.shape) == tuple(tensors[n].shape), f"{n}: folded shape {tuple(new.shape)} is not the cut's {tuple(tensors[n].shape)}"
            tensors[n] = new
        save_file(tensors, p + ".part", metadata={"format": "pt"}); os.replace(p + ".part", p)
        for li in [k for k in done if all(x not in by_shard_left(by_shard, shard) for x in done[k])]: done.pop(li)
    c = json.load(open(os.path.join(a.cut, "config.json"))); c.setdefault("bob", {})["folded"] = {"experts": folded, "weighed_by": "use" if use else "half"}
    json.dump(c, open(os.path.join(a.cut, "config.json"), "w"), indent=2)
    print(f"fold: {folded} experts folded in over {len(layers)} layers ({'weighed by use' if use else 'no counts: the kept expert weighs half'}) -> {a.cut}")


def by_shard_left(by_shard, upto):
    """Tensor names in shards after `upto` (a layer's result is dropped from memory once none of its parts are left)."""
    return {n for s, names in by_shard.items() if s > upto for n in names}


if __name__ == "__main__":
    main()
