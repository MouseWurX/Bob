#!/usr/bin/env python3
"""Count the experts a model uses for EVERY skill in one go (the model is loaded once).
  countskills.py --model <dir> --lessons <dir> --skills '{"chat":["chat","advice"],"longtext":"general","thinking":"thinking",...}' --out-dir <dir> --prefix counts-teacher
Writes <out-dir>/<prefix>-<skill>.json in count.py's shape for each skill. "general" = general text pieces, "thinking" = lessons written with thinking on, a list = lesson jobs.
"""
import argparse, json, os, random
import torch
from transformers import AutoTokenizer, Qwen3_5MoeForConditionalGeneration
import data as D
from reap import Scorer

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--lessons", required=True); ap.add_argument("--skills", required=True); ap.add_argument("--out-dir", required=True); ap.add_argument("--prefix", default="counts")
    ap.add_argument("--pieces", type=int, default=300); ap.add_argument("--max-len", type=int, default=8192); ap.add_argument("--cache", default="lessons-tok.pt")
    ap.add_argument("--general", default=None); ap.add_argument("--general-tokens", type=int, default=0); ap.add_argument("--device", default="cuda")
    ap.add_argument("--reap", action="store_true", help="also record the REAP scores (about twice the expert work)")
    a = ap.parse_args()
    skills = json.loads(a.skills); os.makedirs(a.out_dir, exist_ok=True)
    tok = AutoTokenizer.from_pretrained(a.model)
    data = D.build_all(tok, a.lessons, a.max_len, a.cache, a.general, a.general_tokens)
    rows_all = data["train"]
    jobs = {l["idea"]: l.get("job") for l in D.load_lessons(a.lessons)[0]}
    model = Qwen3_5MoeForConditionalGeneration.from_pretrained(a.model, dtype=torch.bfloat16, device_map=a.device).eval()
    layers = model.model.language_model.layers
    E = model.config.text_config.num_experts
    scorer = Scorer(layers, E, a.device, score=a.reap)
    for name, spec in skills.items():
        out = os.path.join(a.out_dir, f"{a.prefix}-{name}.json")
        if os.path.exists(out) and (not a.reap or json.load(open(out)).get("mass")): print(f"{name}: already counted", flush=True); continue
        if spec == "general": rows = [r for r in rows_all if str(r["id"]).startswith("g:")]
        elif spec == "thinking": rows = [r for r in rows_all if r.get("think") and not str(r["id"]).startswith("g:")]
        else:
            want = set(spec if isinstance(spec, list) else str(spec).split(","))
            rows = [r for r in rows_all if jobs.get(r["id"]) in want]
        random.seed(1); random.shuffle(rows); rows = rows[: a.pieces]
        print(f"{name}: counting on {len(rows)} pieces", flush=True)
        if not rows: print(f"{name}: NO pieces, skipped", flush=True); continue
        scorer.zero()
        with torch.no_grad():
            for n, r in enumerate(rows):
                model(input_ids=torch.tensor(r["ids"], device=a.device)[None], logits_to_keep=1, use_cache=False)
        rows_out = scorer.count_rows(); mass = scorer.mass_rows()
        rec = {"file": a.model, "experts": E, "skill": name, "lessons": len(rows), "layers": rows_out}
        if mass: rec["mass"] = mass  # REAP: router weight x output size, summed over the picks (see reap.py)
        json.dump(rec, open(out, "w"))
        have = [r for r in rows_out if r]
        cover = lambda row, k: sum(sorted(row, reverse=True)[:k]) / max(sum(row), 1)
        print(f"{name}: wrote {out}; coverage at 176: {100 * sum(cover(r, 176) for r in have) / len(have):.1f}%, at 128: {100 * sum(cover(r, 128) for r in have) / len(have):.1f}%", flush=True)

if __name__ == "__main__":
    main()
