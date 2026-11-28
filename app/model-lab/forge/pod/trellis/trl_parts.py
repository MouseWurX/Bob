#!/usr/bin/env python3
"""Bits by part for trellis files: a width (1..6 bits) per coded tensor, spending an exact byte budget where the drift
falls most, from trl_run.py runs of the same tensors at several widths.

  trl_parts.py --codes codes-ldlq-1 codes-ldlq-2 codes-ldlq-3 codes-ldlq-4 --same-as codes-ldlq-2 --out plan.tsv [--merge codes-part/]
  Budget: --same-as DIR (the coded bytes of another run: a fair same-size test) | --budget-bytes N
  --floor 'REGEX=BITS' (repeatable): such tensors take at least BITS (e.g. attention), --report r.json

Each run's report.tsv gives every tensor's drift (the Kronecker estimate of the KL per word it adds, from hess_hf.py's
H_in and H_out) and its bytes at that width; bits_pick.pick (the same exact-size pick as part_bits.py: hull walk, fill,
swaps) chooses one width per tensor so the summed drift is as low as the budget allows. plan.tsv (name, bits) feeds
trl_run.py --plan (to code the plan again another way, e.g. YAQA), --merge links the chosen codes into one folder for
trl_write.py. Idea credited, not ours: NariQ (Nari Labs, Nov 2026) picks per-module widths by gradient loss and knapsack.
28 Nov 2026 (thread "Shrink Flash-Next with GPTQ and trellis")."""
import argparse, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, ".."))
from bits_pick import clean_ladder, pick


def read_report(d):
    out = {}
    for line in open(os.path.join(d, "report.tsv")):
        f = line.rstrip("\r\n").split("\t")
        if len(f) < 9: raise SystemExit(f"trl_parts: {d}/report.tsv has no bytes column (made by an older trl_run.py)")
        out[f[0]] = {"bits": int(f[3]), "err": float(f[5]), "bytes": int(f[8]), "dir": d}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--codes", nargs="+", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--same-as", default=None); ap.add_argument("--budget-bytes", type=int, default=None)
    ap.add_argument("--floor", action="append", default=[]); ap.add_argument("--merge", default=None)
    ap.add_argument("--report", default=None); a = ap.parse_args()
    runs = [read_report(d) for d in a.codes]
    names = sorted(set.intersection(*[set(r) for r in runs]))
    left = sorted(set.union(*[set(r) for r in runs]) - set(names))
    if left: raise SystemExit(f"trl_parts: {len(left)} tensor(s) are not in every run, e.g. {left[:2]}")
    if a.same_as: budget = sum(v["bytes"] for v in read_report(a.same_as).values())
    elif a.budget_bytes: budget = a.budget_bytes
    else: raise SystemExit("trl_parts: give --same-as or --budget-bytes")
    floors = [(re.compile(f.split("=")[0]), int(f.split("=")[1])) for f in a.floor]
    parts = []
    for n in names:
        opts = [dict(r[n], type=f"TRL{r[n]['bits']}") for r in runs]
        bad = [o for o in opts if not math.isfinite(o["err"])]
        if bad: raise SystemExit(f"trl_parts: {n} has no drift in {bad[0]['dir']} (hess_hf.py ran with --no-out?)")
        lo = max([b for rx, b in floors if rx.search(n)], default=0)
        opts = [o for o in opts if o["bits"] >= lo] or opts
        parts.append({"name": n, "ladder": clean_ladder(opts), "fixed": None})
    used = pick(parts, budget)
    if used > budget: raise SystemExit(f"trl_parts: even the smallest widths take {used} bytes, over the budget of {budget}")
    with open(a.out, "w") as f:
        f.write(f"# trl_parts.py: {len(parts)} tensors, {used} of {budget} bytes\n")
        for p in parts: f.write(f"{p['name']}\t{p['ladder'][p['pick']]['bits']}\n")
    if a.merge:
        os.makedirs(a.merge, exist_ok=True)
        for p in parts:
            dst = os.path.join(a.merge, p["name"] + ".npz")
            if os.path.lexists(dst): os.remove(dst)
            os.symlink(os.path.abspath(os.path.join(p["ladder"][p["pick"]]["dir"], p["name"] + ".npz")), dst)
    hist = {}
    for p in parts: b = p["ladder"][p["pick"]]["bits"]; hist[b] = hist.get(b, 0) + 1
    drift = sum(p["ladder"][p["pick"]]["err"] for p in parts)
    plain = {os.path.basename(os.path.normpath(d)): sum(r[n]["err"] for n in names) for d, r in zip(a.codes, runs)}
    rep = {"budget": budget, "used": used, "tensors": len(parts), "widths": {f"TRL{k}": v for k, v in sorted(hist.items())},
           "drift_estimate": drift, "drift_estimate_each_run": plain}
    if a.report: json.dump(rep, open(a.report, "w"), indent=1)
    print(f"trl_parts: {used} of {budget} bytes, widths {rep['widths']}, drift estimate {drift:.4g} "
          f"(each run alone: {', '.join(f'{k} {v:.4g}' for k, v in plain.items())})")


if __name__ == "__main__":
    main()
