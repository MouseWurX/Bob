#!/usr/bin/env python3
"""Pick a quant type for every tensor so a file lands on an exact size with the least measured error (26 Nov 2026).

Our own version of the idea in ISTA DASLab's RCO paper (Helcig and Alistarh, arXiv 2605.00649: "model compression with
exact budget constraints"). Their paper publishes no code, and their optimizer learns the choice end to end on the model's
loss. This is the cheaper form the paper compares against: each tensor's error at each type is measured first
(tensor_err, from the cut's own Q8_0 and its imatrix), the errors are treated as adding up, and the choice is made under a
byte budget (a multiple-choice knapsack, solved on each tensor's lower convex hull, then filled greedily). Whether the
adding-up holds is what the KLD run decides: every file it makes is scored against the Q8_0 next to the stock file of the
same size, on the same text and positions (pod/kld_check.sh).

  rco_pick.py --err err.tsv --cut bill --target-ftype IQ2_XXS --name RC2_A               dry run on the built-in layout
  rco_pick.py --err err.tsv --model cut.gguf --target-ftype IQ2_XXS --name RC2_A \\
      --fixed gaps.txt --recipe pod/recipes/flashnext-mixed.json --write                   adds recipe RC2_A to the file

Budget: --target-file F = the same tensor bytes as a made file F; --target-ftype X = the same tensor bytes as the stock X file (as quant_recipe.py predicts it, which matched every
real Bill file to 0.002 GB); --target-recipe NAME = the same bytes as that recipe; --target-gb = file size in GB.
Objective: --objective abs (default) adds each tensor's expected squared output change, imatrix-weighted and, for experts,
weighted by how often the router picks them; rel adds each tensor's error relative to its own output (every tensor equal).
Tensors that are not in err.tsv, or that a --fixed rule names, keep the type the stock mixture gives them.
Python standard library only (plus gguf-py when --model reads a file)."""
import argparse, heapq, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import quant_recipe as qr  # noqa: E402


def read_err(path):
    """{name: {type: (bytes, err, ref)}}"""
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\r\n")
            if not line or line.startswith("#"): continue
            p = line.split("\t")
            out.setdefault(p[0], {})[p[1]] = (int(p[2]), float(p[3]), float(p[4]))
    return out


def read_fixed(path):
    """--tensor-type lines (as imatrix_gaps.py prints them: '--tensor-type' then 'regex=type') -> [(regex, type)]"""
    rules = []
    if not path: return rules
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line == "--tensor-type" or "=" not in line: continue
            p, t = line.rsplit("=", 1); rules.append((p, t))
    return rules


def weight_of(name, weights):
    return next((w for p, w in weights if re.search(p, name)), 1.0)


def hull(opts):
    """opts [(bytes, cost, type)] -> lower convex hull, cheapest first (dominated and above-hull options dropped)"""
    opts = sorted(opts, key=lambda o: (o[0], o[1])); pts = []
    for o in opts:
        if pts and o[1] >= pts[-1][1]: continue      # bigger and no better
        while len(pts) >= 2:
            (b1, c1, _), (b2, c2, _) = pts[-2], pts[-1]
            # drop the middle point if it lies on or above the line from pts[-2] to o
            if (c2 - c1) * (o[0] - b1) >= (o[1] - c1) * (b2 - b1): pts.pop()
            else: break
        pts.append(o)
    return pts


def pick(cands, budget):
    """cands {name: [(bytes, cost, type)]}; budget in bytes for these tensors. Returns ({name: type}, bytes, cost)."""
    hulls = {n: hull(o) for n, o in cands.items()}
    at = {n: 0 for n in hulls}; used = sum(h[0][0] for h in hulls.values())
    if used > budget:
        raise SystemExit(f"rco_pick: even the smallest type for every tensor needs {used:,} bytes, over the budget {budget:,}")
    heap = []
    def push(n):
        i = at[n]; h = hulls[n]
        if i + 1 < len(h):
            db, dc = h[i + 1][0] - h[i][0], h[i][1] - h[i + 1][1]
            heapq.heappush(heap, (-dc / db, n))
    for n in hulls: push(n)
    while heap:
        _, n = heapq.heappop(heap); i = at[n]; h = hulls[n]
        db = h[i + 1][0] - h[i][0]
        if used + db > budget: continue           # this tensor stops here; its later steps are steeper still
        at[n] = i + 1; used += db; push(n)
    choice = {n: hulls[n][at[n]] for n in hulls}
    # fill what is left: any single change (on the hull or not) that fits, best gain per byte first, until nothing fits
    while True:
        best = None
        for n, opts in cands.items():
            cur = choice[n]
            for o in opts:
                db, dc = o[0] - cur[0], cur[1] - o[1]
                if dc <= 0 or used + db > budget: continue
                g = dc / db if db > 0 else float("inf")
                if best is None or g > best[0]: best = (g, n, o)
        if not best: break
        _, n, o = best; used += o[0] - choice[n][0]; choice[n] = o
    return {n: o[2] for n, o in choice.items()}, used, sum(o[1] for o in choice.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--err", required=True); ap.add_argument("--model"); ap.add_argument("--cut", default="bill")
    ap.add_argument("--name", required=True); ap.add_argument("--target-ftype"); ap.add_argument("--target-recipe")
    ap.add_argument("--target-gb", type=float); ap.add_argument("--target-file", help="a made GGUF: the same tensor bytes as it")
    ap.add_argument("--objective", choices=["abs", "rel"], default="abs")
    ap.add_argument("--weight", action="append", default=[], help="REGEX=MULT: scale the error of matching tensors")
    ap.add_argument("--fixed", help="tensor-type rules that must stay (imatrix_gaps.py output)")
    ap.add_argument("--recipe", help="recipe JSON (for --target-recipe, and --write)"); ap.add_argument("--write", action="store_true")
    ap.add_argument("--ftype", default="IQ2_XXS", help="base type given to llama-quantize (every tensor gets a rule anyway)")
    ap.add_argument("--header-bytes", type=int, default=8_000_000)
    a = ap.parse_args()
    tensors = qr.tensors_from(argparse.Namespace(model=a.model, cut=a.cut))
    shape = {n: s for n, s, _ in tensors}
    err = read_err(a.err); fixed = read_fixed(a.fixed)
    weights = [(p, float(w)) for p, w in (x.rsplit("=", 1) for x in a.weight)]
    recipe = json.load(open(a.recipe, encoding="utf-8")) if a.recipe else None

    # the budget: the same tensor bytes as the stock file (or recipe) it is set against
    if a.target_ftype:
        tgt = qr.summary(qr.choose(tensors, a.target_ftype, fixed))[0]; tdesc = f"stock {a.target_ftype}"
    elif a.target_recipe:
        rc = next(r for r in recipe["recipes"] if r["name"] == a.target_recipe)
        tgt = qr.summary(qr.choose(tensors, rc["ftype"], fixed + qr.recipe_rules(recipe, rc, a.cut)))[0]; tdesc = f"recipe {a.target_recipe}"
    elif a.target_file:
        import gguf
        tgt = sum(int(t.n_bytes) for t in gguf.GGUFReader(a.target_file).tensors); tdesc = os.path.basename(a.target_file)
    elif a.target_gb:
        tgt = int(a.target_gb * 1e9) - a.header_bytes; tdesc = f"{a.target_gb} GB"
    else: sys.exit("rco_pick: give --target-ftype, --target-recipe, --target-file or --target-gb")

    # tensors the picker may change: measured, quantizable, not named by a fixed rule
    fx = [re.compile(p) for p, _ in fixed]; base = qr.choose(tensors, a.ftype, fixed)
    free, cands = set(), {}
    for name, shp, src, typ, _ in base:
        if name not in err or any(p.search(name) for p in fx): continue
        w = weight_of(name, weights); opts = []
        for t, (b, e, r) in err[name].items():
            if t not in qr.QS or shp[0] % qr.QS[t][0]: continue
            if qr.nbytes(shp, t) != b: sys.exit(f"rco_pick: {name} {t}: err.tsv says {b} bytes, the layout says {qr.nbytes(shp, t)}: wrong model?")
            opts.append((b, w * (e if a.objective == "abs" else (e / r if r > 0 else 0.0)), t))
        if opts: cands[name] = opts; free.add(name)
    fixed_bytes = sum(qr.nbytes(s, t) for n, s, _, t, _ in base if n not in free)
    choice, used, cost = pick(cands, tgt - fixed_bytes)

    rules = [(rf"^{re.escape(n)}$", t) for n, t in sorted(choice.items(), key=lambda kv: [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", kv[0])])]
    picked = qr.choose(tensors, a.ftype, fixed + rules); tot = qr.summary(picked)[0]
    if tot > tgt: sys.exit(f"rco_pick: internal: {tot:,} bytes over the budget {tgt:,}")
    counts = {}
    for n, t in choice.items(): g = qr.group(n); counts.setdefault(g, {}); counts[g][t] = counts[g].get(t, 0) + 1
    print(f"{a.name}: {len(choice)} tensors picked, {len(tensors) - len(choice)} kept; budget {tdesc} = {tgt:,} tensor bytes")
    print(f"   picked {tot:,} bytes ({(tgt - tot) / 1e6:.1f} MB under), file ~{(tot + a.header_bytes) / 1e9:.2f} GB; objective {a.objective}, total {cost:.4g}")
    for g, c in sorted(counts.items()): print(f"   {g:42s} {', '.join(f'{n} {t}' for t, n in sorted(c.items(), key=lambda kv: -kv[1]))}")
    if a.write:
        if not recipe: sys.exit("rco_pick: --write needs --recipe")
        entry = {"name": a.name, "ftype": a.ftype, "no_common": True, "cuts": [a.cut],
                 "why": f"rco_pick.py ({a.objective} error, budget = {tdesc}): measured per-tensor error, exact-size pick",
                 "rules": [{"match": p, "type": t} for p, t in rules]}
        recipe["recipes"] = [r for r in recipe["recipes"] if r["name"] != a.name] + [entry]
        with open(a.recipe, "w", encoding="utf-8") as f: json.dump(recipe, f, indent=1); f.write("\n")
        print(f"   written to {a.recipe} as recipe {a.name} ({len(rules)} rules)")


if __name__ == "__main__":
    main()
