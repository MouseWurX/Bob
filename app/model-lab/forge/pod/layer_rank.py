#!/usr/bin/env python3
"""Rank a cut's layers by how much their experts matter, from its imatrix (24 Nov 2026, mixed-bit recipes).

layer_rank.py --imatrix imatrix.gguf --cut bill [--recipe pod/recipes/flashnext-mixed.json --write]
  prints layers most sensitive first; --write stores the order as layer_rank[<cut>] in the recipe file.
layer_rank.py --kld kld-sweep.tsv --cut bill [--recipe ... --write]
  the same from a block sweep (kld_check.sh rows: name, mean KLD): a block whose upgrade lowers KLD most ranks first.

The imatrix rank is a PROXY: the mean squared input of each layer's expert matmuls (gate/up read the layer's hidden state,
down reads the experts' inner activations), per expert actually used, z-scored across layers, then summed. Larger inputs make
rounding errors larger. It says nothing about how the error moves the next-word odds; the KLD sweep does, and replaces it
when it exists. A file's SIZE doesn't depend on this order (every layer's experts are the same shape), only its quality.
Needs gguf-py (the pods and npc have it). Reads the imatrix only."""
import argparse, json, re, statistics, sys


def from_imatrix(path):
    import numpy as np, gguf
    r = gguf.GGUFReader(path); s2, cn = {}, {}
    for t in r.tensors:
        if t.name.endswith(".in_sum2"): s2[t.name[:-8]] = np.asarray(t.data, dtype=np.float64)
        elif t.name.endswith(".counts"): cn[t.name[:-7]] = np.asarray(t.data, dtype=np.float64).reshape(-1)
    per = {}
    for name, v in s2.items():
        m = re.match(r"blk\.(\d+)\.ffn_(gate|up|down)_exps\.weight$", name)
        if not m: continue
        c = cn.get(name); il = int(m.group(1)); kind = "down" if m.group(2) == "down" else "in"
        rows = v.reshape(len(c), -1) if c is not None and c.size > 1 else v.reshape(1, -1)
        cc = c if c is not None else np.ones(rows.shape[0])
        used = cc > 0
        if not used.any(): continue
        e = (rows[used].mean(axis=1) / cc[used]).mean()   # mean squared input per value, per use, over used experts
        per.setdefault(il, {})[kind] = max(per.get(il, {}).get(kind, 0.0), float(e))
    if not per: sys.exit("no ffn_*_exps entries in this imatrix")
    score = {il: 0.0 for il in per}
    for kind in ("in", "down"):
        vals = [per[il].get(kind) for il in per if kind in per[il]]
        if len(vals) < 2: continue
        mu, sd = statistics.mean(vals), statistics.pstdev(vals) or 1.0
        for il in per:
            if kind in per[il]: score[il] += (per[il][kind] - mu) / sd
    return sorted(score, key=lambda il: -score[il]), score


def from_kld(path):
    rows = [l.rstrip("\n").split("\t") for l in open(path, encoding="utf-8") if l.strip() and not l.startswith("#")]
    base = next((float(k) for n, k, *_ in rows if n == "base"), None)
    if base is None: sys.exit("the sweep has no 'base' row (the file every block is compared with)")
    gain = {}
    for n, k, *_ in rows:
        m = re.match(r"block(\d+)-(\d+)$", n)
        if m:
            for il in range(int(m.group(1)), int(m.group(2)) + 1): gain[il] = base - float(k)
    return sorted(gain, key=lambda il: -gain[il]), gain


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--imatrix"); ap.add_argument("--kld"); ap.add_argument("--cut", required=True)
    ap.add_argument("--recipe"); ap.add_argument("--write", action="store_true"); a = ap.parse_args()
    if bool(a.imatrix) == bool(a.kld): sys.exit("give --imatrix or --kld")
    order, score = from_imatrix(a.imatrix) if a.imatrix else from_kld(a.kld)
    print(f"{a.cut}: layers most sensitive first ({'imatrix proxy' if a.imatrix else 'KLD block sweep'}):")
    print(" ".join(f"{il}({score[il]:+.2f})" for il in order))
    if a.write:
        if not a.recipe: sys.exit("--write needs --recipe")
        j = json.load(open(a.recipe, encoding="utf-8")); j.setdefault("layer_rank", {})[a.cut] = order
        j.setdefault("layer_rank_source", {})[a.cut] = "kld" if a.kld else "imatrix"
        tmp = a.recipe + ".part"; open(tmp, "w", encoding="utf-8").write(json.dumps(j, indent=1) + "\n")
        import os; os.replace(tmp, a.recipe); print(f"written to {a.recipe} as layer_rank.{a.cut}")


if __name__ == "__main__":
    main()
