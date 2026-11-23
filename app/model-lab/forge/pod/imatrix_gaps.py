#!/usr/bin/env python3
"""Which weight tensors a llama-imatrix file doesn't fully cover (Nov 23 2026, Bobert IQ2 fix).

imatrix_gaps.py --model cut.gguf --imatrix imatrix.gguf
Prints one llama-quantize option per line, `--tensor-type ^<name>$=<fallback>`, for every 2D/3D weight that the very-low-bit
types (IQ1/IQ2) would refuse: no entry in the imatrix, or (for expert tensors) an expert with no data. Those tensors get
--fallback (default q2_k, which needs no imatrix); everything else keeps the asked type. The count goes to stderr."""
import argparse, sys
import numpy as np
import gguf

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True); ap.add_argument("--imatrix", required=True); ap.add_argument("--fallback", default="q2_k")
a = ap.parse_args()
im = gguf.GGUFReader(a.imatrix)
have = {}
for t in im.tensors:
    if t.name.endswith(".counts"): have.setdefault(t.name[:-7], {})["counts"] = np.asarray(t.data).reshape(-1)
    elif t.name.endswith(".in_sum2"): have.setdefault(t.name[:-8], {})["sum"] = True
legacy = not have
if legacy: sys.exit("imatrix is not in the GGUF format (no .in_sum2/.counts tensors); can't check it")
md = gguf.GGUFReader(a.model)
gaps = []
for t in md.tensors:
    # token_embd and output.weight get their own higher types from llama-quantize; everything else 2D/3D is checked
    # (23 Nov: the first Bobert run failed on output_hc_down.weight, which an earlier version of this skipped)
    if not t.name.endswith(".weight") or len(t.shape) < 2 or t.name in ("token_embd.weight", "output.weight") or "norm" in t.name: continue
    h = have.get(t.name)
    if not h or "sum" not in h: gaps.append((t.name, "no entry")); continue
    c = h.get("counts")
    if c is not None and c.size > 1 and (c <= 0).any(): gaps.append((t.name, f"{int((c <= 0).sum())} of {c.size} experts never seen"))
for n, why in gaps:
    # an expert tensor is most of the file: the cheap fallback; any other tensor is small: q8_0 keeps it at full quality
    print(f"--tensor-type\n^{n.replace('.', chr(92) + '.')}$={a.fallback if '_exps' in n else 'q8_0'}")
print(f"{len(gaps)} tensor(s) not fully covered: " + "; ".join(f"{n} ({w})" for n, w in gaps[:20]) + (" ..." if len(gaps) > 20 else ""), file=sys.stderr)
