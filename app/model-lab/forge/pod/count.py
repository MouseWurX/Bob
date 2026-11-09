#!/usr/bin/env python3
"""Count which experts a (healed) Bob picks on the lessons, so the next rung can be cut from it.
Writes expert-counts JSON in the same shape as the lab's count-experts.mjs: {"experts": E, "layers": [[count]...], "keep": {...}}.
  count.py --model <dir> --lessons <dir> --out counts.json [--lessons-max 600] [--jobs coding,...]
"""
import argparse, json, os, random
import torch
from transformers import AutoTokenizer, Qwen3_5MoeForConditionalGeneration
import data as D

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--lessons", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--lessons-max", type=int, default=600); ap.add_argument("--max-len", type=int, default=8192)
    ap.add_argument("--jobs", default=None); ap.add_argument("--cache", default="lessons-tok.pt"); ap.add_argument("--general", default=None); ap.add_argument("--general-tokens", type=int, default=0); ap.add_argument("--device", default="cuda")
    a = ap.parse_args()
    tok = AutoTokenizer.from_pretrained(a.model)
    data = D.build_all(tok, a.lessons, a.max_len, a.cache, a.general, a.general_tokens)
    rows = data["train"]
    if a.jobs:
        want = set(a.jobs.split(","))
        jobs = {l["idea"]: l.get("job") for l in D.load_lessons(a.lessons)[0]}
        rows = [r for r in rows if jobs.get(r["id"]) in want]
    random.seed(1); random.shuffle(rows); rows = rows[: a.lessons_max]
    model = Qwen3_5MoeForConditionalGeneration.from_pretrained(a.model, dtype=torch.bfloat16, device_map=a.device).eval()
    layers = model.model.language_model.layers
    E = model.config.text_config.num_experts
    counts = [torch.zeros(E, dtype=torch.long, device=a.device) if hasattr(l.mlp, "gate") else None for l in layers]
    hooks = []
    for i, l in enumerate(layers):
        if counts[i] is None: continue
        def hook(mod, inp, out, i=i):
            counts[i] += torch.bincount(out[2].reshape(-1), minlength=E)
        hooks.append(l.mlp.gate.register_forward_hook(hook))
    with torch.no_grad():
        for n, r in enumerate(rows):
            model(input_ids=torch.tensor(r["ids"], device=a.device)[None], logits_to_keep=1, use_cache=False)
            if n % 100 == 0: print(f"{n}/{len(rows)}", flush=True)
    rows_out = [c.tolist() if c is not None else None for c in counts]
    keep = {}
    for k in (176, 128, 80, 64, 48, 32, 24, 16, 8):
        if k < E: keep[str(k)] = [sorted(sorted(range(E), key=lambda e: (-row[e], e))[:k]) if row else None for row in rows_out]
    json.dump({"file": a.model, "experts": E, "lessons": len(rows), "layers": rows_out, "keep": keep}, open(a.out, "w"))
    cover = lambda row, k: sum(sorted(row, reverse=True)[:k]) / max(sum(row), 1)
    have = [r for r in rows_out if r]
    print("coverage (avg over layers): " + ", ".join(f"{k}: {100 * sum(cover(r, k) for r in have) / len(have):.1f}%" for k in (176, 128, 80, 48, 32, 16, 8) if k < E))
    print(f"wrote {a.out}")

if __name__ == "__main__":
    main()
