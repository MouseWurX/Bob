#!/usr/bin/env python3
"""Coverage cut: a keep list that protects every skill's experts, not only the most-used ones overall.
For each layer and each skill, keep the experts that together handle `cover` of that skill's routing counts (`strong` for the
skills in --strong); union over skills; pad every layer to one size (the biggest union, or --keep N, or at most --max) with
the most-used experts overall, because the model file needs one expert count for all layers.
  keep.py --counts chat=counts-chat.json,coding=counts-coding.json,... --out keep.json --report coverage.md [--cover 0.95]
          [--strong tools,coding --strong-cover 0.99] [--keep N] [--max N] [--name 24Bob] [--check existing-keep.json]
Count files are count.py's output ({"experts": E, "layers": [[count per expert]...]}).

--by says what an expert is judged on when the list is built:
  counts  how often the router picks it (the default, and what every Bob so far was cut with).
  reap    the REAP score (arXiv 2510.13999): the average, per pick, of the router's weight times the size of what the
          expert wrote. Rarely picked but hard-pushing experts are kept; often picked, weak ones go.
  mass    the same sum without dividing by the picks, so how often and how hard both count.
reap and mass need count files made with --reap (they carry a "mass" table). The report's kept shares are always
shares of the routing counts, whatever --by is, so two keep lists can be compared on the same scale.
"""
import argparse, json, os, time

JUDGED = {'counts': 'how often it is picked', 'reap': 'its REAP score (router weight times output size, averaged per pick)', 'mass': 'router weight times output size, summed over its picks'}

def covering(row, c):
    t = sum(row)
    if not t: return []
    order = sorted(range(len(row)), key=lambda e: (-row[e], e))
    out, s = [], 0
    for e in order:
        out.append(e); s += row[e]
        if s / t >= c: break
    return out

def score_rows(c, by, f="counts"):
    """The table the keep list is built from: counts, REAP (mass per pick) or mass, per layer."""
    counts = [r or [] for r in c["layers"]]
    if by == "counts": return counts
    if not c.get("mass"): raise SystemExit(f"{f}: no REAP scores in this file; count it again with --reap, or use --by counts")
    mass = [r or [] for r in c["mass"]]
    if by == "mass": return mass
    return [[(m / n if n else 0.0) for m, n in zip(mr, cr)] for mr, cr in zip(mass, counts)]

def share(row, ids):
    t = sum(row) or 1
    return sum(row[e] for e in ids) / t

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--counts", required=True); ap.add_argument("--out"); ap.add_argument("--report")
    ap.add_argument("--cover", type=float, default=0.95); ap.add_argument("--strong", default=""); ap.add_argument("--strong-cover", type=float, default=0.99)
    ap.add_argument("--keep", type=int, default=0); ap.add_argument("--max", type=int, default=0); ap.add_argument("--name", default="Bob"); ap.add_argument("--check"); ap.add_argument("--ladder", default="")
    ap.add_argument("--by", default="counts", choices=["counts", "reap", "mass"])
    a = ap.parse_args()
    skills = []
    for part in a.counts.split(","):
        name, f = part.split("=", 1); c = json.load(open(f))
        skills.append((name, [r or [] for r in c["layers"]], c["experts"], score_rows(c, a.by, f)))
    if a.by == "reap" and a.out and not a.keep:
        raise SystemExit("--by reap ranks the experts but does not say how many to keep: give --keep N (keep_n on the rung), or use --by mass to let the coverage rule pick the size")
    E = skills[0][2]; L = len(skills[0][1])
    strong = set(x for x in a.strong.split(",") if x)
    lines = [f"# Coverage cut for {a.name}", "", f"Rule: keep the experts handling {a.cover:.0%} of each skill's routing in every layer ({a.strong_cover:.0%} for {', '.join(sorted(strong)) or 'none'}), union over skills, every layer padded to one size with the most-used experts overall.", "", f"Experts are judged by {JUDGED[a.by]}. Kept shares below are shares of the routing counts.", ""]
    # overall use: every skill weighs the same (shares, not raw counts)
    overall = []
    for li in range(L):
        r = [0.0] * E
        for _, _, _, rows in skills:
            row = rows[li] if li < len(rows) and rows[li] else []
            t = sum(row) or 1
            for e, v in enumerate(row): r[e] += v / t
        overall.append(r)
    def table(layers, title):
        out = [f"## {title}", "", "| Skill | kept share, average over layers | worst layer |", "|---|---|---|"]
        for name, rows, _, _ in skills:
            per = [share(rows[li], layers[li]) if li < len(rows) and rows[li] else 1.0 for li in range(L)]
            worst = min(range(L), key=lambda li: per[li])
            out.append(f"| {name} | {100 * sum(per) / L:.1f}% | L{worst} {100 * per[worst]:.1f}% |")
        return out + [""]
    if a.check:
        kl = json.load(open(a.check))["layers"]
        lines += [f"Existing keep list {os.path.basename(a.check)}: {len(kl[0])} experts per layer.", ""] + table(kl, "Existing keep list")
    unions = []
    for li in range(L):
        s = set()
        for name, _, _, rows in skills:
            if li < len(rows) and rows[li]:
                s.update(covering(rows[li], a.strong_cover if name in strong else a.cover))
        unions.append(s)
    sizes = [len(s) for s in unions]
    K = a.keep or max(sizes)
    if a.max and K > a.max: K = a.max
    lines += [f"Union sizes per layer: min {min(sizes)}, average {sum(sizes) / L:.1f}, max {max(sizes)}. Keeping **{K} of {E}** experts in every layer.", ""]
    def build(K):
        layers = []
        for li in range(L):
            ids = list(unions[li])
            if len(ids) > K:
                ids.sort(key=lambda e: (-overall[li][e], e)); ids = ids[:K]
            else:
                for e in sorted(range(E), key=lambda e: (-overall[li][e], e)):
                    if len(ids) >= K: break
                    if e not in unions[li]: ids.append(e)
            layers.append(sorted(ids))
        return layers
    if a.ladder:
        # the differential table: at every size, how much of each skill survives (average over layers / worst layer)
        ks = [int(x) for x in a.ladder.split(",") if x]
        lines += ["## The ladder: kept share per skill at every size (average / worst layer)", "", "| Experts | " + " | ".join(s[0] for s in skills) + " |", "|---|" + "---|" * len(skills)]
        for k in ks:
            if k >= E: continue
            lay = build(k); cells = []
            for name, rows, _, _ in skills:
                per = [share(rows[li], lay[li]) if li < len(rows) and rows[li] else 1.0 for li in range(L)]
                cells.append(f"{100 * sum(per) / L:.0f} / {100 * min(per):.0f}")
            lines.append(f"| {k} | " + " | ".join(cells) + " |")
        lines.append("")
        # which skills lose most between neighbouring sizes
        lines += ["Reading it: a skill whose worst layer drops under about 85% at a size will feel the cut there; the heal softens but cannot undo it.", ""]
    layers = build(K)
    lines += table(layers, f"New keep list ({K} experts per layer)")
    print("\n".join(lines))
    if a.out:
        json.dump({"name": a.name, "experts": K, "cover": a.cover, "strong": sorted(strong), "strong_cover": a.strong_cover, "by": a.by, "skills": [s[0] for s in skills], "layers": layers, "made": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, open(a.out, "w"))
        print(f"wrote {a.out}")
    if a.report:
        open(a.report, "w").write("\n".join(lines) + "\n")

if __name__ == "__main__":
    main()
