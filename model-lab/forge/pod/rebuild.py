#!/usr/bin/env python3
"""Rebuild a healed Bob from the stock teacher, his keep list and his adapter (build 18).
The adapter (LoRA + router weights, about 1 GB) and the keep list (a few KB) are what the Forge keeps of every Bob; with the
teacher already on the network drive they give back the same healed Bob without uploading a 17 GB GGUF from the owner's PC.
  python3 rebuild.py --teacher <stock model dir> --keep-file <bob-keep.json> --adapter <adapter.pt> --dst <dir> --name 28Bob
"""
import argparse, os, shutil, subprocess, sys, time
import torch
from transformers import AutoTokenizer, Qwen3_5MoeForConditionalGeneration
import lora as L

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teacher", required=True); ap.add_argument("--keep-file", required=True); ap.add_argument("--adapter", required=True)
    ap.add_argument("--dst", required=True); ap.add_argument("--name", default="Bob"); ap.add_argument("--device", default="cuda")
    a = ap.parse_args()
    cut = a.dst + "-cut"
    if not os.path.exists(os.path.join(cut, "config.json")):
        shutil.rmtree(cut, ignore_errors=True)
        subprocess.run([sys.executable, "prune.py", "--src", a.teacher, "--dst", cut, "--keep-file", a.keep_file, "--name", a.name], check=True)
    st = torch.load(a.adapter, map_location="cpu")
    t0 = time.time()
    model = Qwen3_5MoeForConditionalGeneration.from_pretrained(cut, dtype=torch.bfloat16, device_map=a.device)
    model.config.use_cache = False
    print(f"cut model loaded in {time.time() - t0:.0f}s")
    L.attach(model, r=st.get("r", 32), experts=st.get("experts", "lora"), r_experts=st.get("r_experts", 8))
    L.load_trainable(model, st["params"])
    L.merge_all(model)
    tok = AutoTokenizer.from_pretrained(cut)
    shutil.rmtree(a.dst, ignore_errors=True); os.makedirs(a.dst)
    model.save_pretrained(a.dst, safe_serialization=True, max_shard_size="4GB"); tok.save_pretrained(a.dst)
    for fn in ("bob-keep.json", "preprocessor_config.json", "chat_template.jinja", "generation_config.json"):
        src = os.path.join(cut, fn)
        if os.path.exists(src) and not os.path.exists(os.path.join(a.dst, fn)): shutil.copy(src, os.path.join(a.dst, fn))
    shutil.copy(a.adapter, os.path.join(a.dst, "adapter.pt"))
    shutil.rmtree(cut, ignore_errors=True)
    print(f"rebuilt {a.name} at {a.dst} (adapter step {st.get('step', '?')})")

if __name__ == "__main__":
    main()
