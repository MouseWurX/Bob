#!/usr/bin/env python3
"""Rebuild a finished Bob from the stock teacher, his keep list and his adapter (build 18).
The adapter (LoRA + router weights, about 1 GB) and the keep list (a few KB) are what the Forge keeps of every Bob; with the
teacher already on the network drive they give back the same healed Bob without uploading a 17 GB GGUF from the owner's PC.
  python3 rebuild.py --teacher <stock model dir> --keep-file <bob-keep.json> --adapter <adapter.pt> --dst <dir> --name 28Bob
Leave out --keep-file for a Bob that was never cut (35Bob "Bobert"): his adapter goes straight onto the stock teacher.
"""
import argparse, os, shutil, subprocess, sys, time
import torch
from transformers import AutoTokenizer
import lora as L, family as FAM

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teacher", required=True); ap.add_argument("--adapter", required=True)
    ap.add_argument("--keep-file", default=None, help="the keep list of a cut Bob; leave out for a no-cut Bob (the adapter goes onto the stock teacher)")
    ap.add_argument("--dst", required=True); ap.add_argument("--name", default="Bob"); ap.add_argument("--device", default="cuda")
    a = ap.parse_args()
    cut = None; src = a.teacher
    if a.keep_file:
        cut = a.dst + "-cut"; src = cut
        if not os.path.exists(os.path.join(cut, "config.json")):
            shutil.rmtree(cut, ignore_errors=True)
            subprocess.run([sys.executable, "prune.py", "--src", a.teacher, "--dst", cut, "--keep-file", a.keep_file, "--name", a.name], check=True)
    else:
        print(f"no keep list: {a.name} is the stock teacher plus his adapter (no cut)")
    st = torch.load(a.adapter, map_location="cpu")
    t0 = time.time()
    model = FAM.load(src, a.device)
    model.config.use_cache = False
    print(f"{'cut' if cut else 'stock'} model loaded in {time.time() - t0:.0f}s")
    L.attach(model, r=st.get("r", 32), experts=st.get("experts", "lora"), r_experts=st.get("r_experts", 8))
    L.load_trainable(model, st["params"])
    L.merge_all(model)
    tok = AutoTokenizer.from_pretrained(src)
    shutil.rmtree(a.dst, ignore_errors=True); os.makedirs(a.dst)
    model.save_pretrained(a.dst, safe_serialization=True, max_shard_size="4GB"); tok.save_pretrained(a.dst); FAM.clean_saved(a.dst)
    for fn in ("bob-keep.json", "preprocessor_config.json", "chat_template.jinja", "generation_config.json"):
        s = os.path.join(src, fn)
        if os.path.exists(s) and not os.path.exists(os.path.join(a.dst, fn)): shutil.copy(s, os.path.join(a.dst, fn))
    shutil.copy(a.adapter, os.path.join(a.dst, "adapter.pt"))
    if cut: shutil.rmtree(cut, ignore_errors=True)
    print(f"rebuilt {a.name} at {a.dst} (adapter step {st.get('step', '?')}, {'cut' if cut else 'no cut'})")

if __name__ == "__main__":
    main()
