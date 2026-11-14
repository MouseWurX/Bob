#!/usr/bin/env python3
"""Count which experts a (healed) Bob picks on the lessons, so the next rung can be cut from it.
Writes expert-counts JSON in the same shape as the lab's count-experts.mjs: {"experts": E, "layers": [[count]...], "keep": {...}}.
  count.py --model <dir> --lessons <dir> --out counts.json [--lessons-max 600] [--jobs coding,...]
"""
import argparse, json, os, random
import torch
from transformers import AutoTokenizer
import data as D, family as FAM
from reap import Scorer

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--lessons", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--lessons-max", type=int, default=600); ap.add_argument("--max-len", type=int, default=8192)
    ap.add_argument("--jobs", default=None); ap.add_argument("--general-only", action="store_true"); ap.add_argument("--think", action="store_true"); ap.add_argument("--cache", default="lessons-tok.pt"); ap.add_argument("--general", default=None); ap.add_argument("--general-tokens", type=int, default=0); ap.add_argument("--device", default="cuda")
    ap.add_argument("--reap", action="store_true", help="also record the REAP scores (about twice the expert work)")
    a = ap.parse_args()
    tok = AutoTokenizer.from_pretrained(a.model)
    data = D.build_all(tok, a.lessons, a.max_len, a.cache, a.general, a.general_tokens)
    rows = data["train"]
    if a.general_only:
        rows = [r for r in rows if str(r["id"]).startswith("g:")]
    elif a.jobs:
        want = set(a.jobs.split(","))
        jobs = {l["idea"]: l.get("job") for l in D.load_lessons(a.lessons)[0]}
        rows = [r for r in rows if jobs.get(r["id"]) in want]
    if a.think:
        rows = [r for r in rows if r.get("think")]
    print(f"counting on {len(rows)} pieces" + (f" (jobs {a.jobs})" if a.jobs else "") + (" general text" if a.general_only else "") + (" thinking only" if a.think else ""), flush=True)
    random.seed(1); random.shuffle(rows); rows = rows[: a.lessons_max]
    model = FAM.load(a.model, a.device).eval()
    layers = FAM.layers(model)
    E = FAM.num_experts(model.config)
    scorer = Scorer(layers, E, a.device, score=a.reap)
    with torch.no_grad():
        for n, r in enumerate(rows):
            model(input_ids=torch.tensor(r["ids"], device=a.device)[None], logits_to_keep=1, use_cache=False)
            if n % 100 == 0: print(f"{n}/{len(rows)}", flush=True)
    rows_out = scorer.count_rows(); mass = scorer.mass_rows()
    keep = {}
    for k in (176, 128, 80, 64, 48, 32, 24, 16, 8):
        if k < E: keep[str(k)] = [sorted(sorted(range(E), key=lambda e: (-row[e], e))[:k]) if row else None for row in rows_out]
    out = {"file": a.model, "experts": E, "lessons": len(rows), "layers": rows_out, "keep": keep}
    if mass: out["mass"] = mass  # REAP: router weight x output size, summed over the picks (see reap.py)
    json.dump(out, open(a.out, "w"))
    cover = lambda row, k: sum(sorted(row, reverse=True)[:k]) / max(sum(row), 1)
    have = [r for r in rows_out if r]
    print("coverage (avg over layers): " + ", ".join(f"{k}: {100 * sum(cover(r, k) for r in have) / len(have):.1f}%" for k in (176, 128, 80, 48, 32, 16, 8) if k < E))
    print(f"wrote {a.out}")

if __name__ == "__main__":
    main()
