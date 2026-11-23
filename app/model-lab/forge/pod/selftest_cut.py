#!/usr/bin/env python3
"""Self-test for gguf_cut_experts.py (Nov 23 2026): a tiny made-up MoE GGUF (2 layers + 1 MTP layer, 8 experts, F32 and
Q8_0 expert tensors, a router, a shared expert), cut to 6 experts. Checks every cut tensor is exactly the kept slices,
everything else is untouched, expert_count is 6, the MTP layer gets the most-kept set, and the report counts the
parameters taken out. No card, no download: python3 selftest_cut.py"""
import json, os, subprocess, sys, tempfile
import numpy as np
import gguf
from gguf.quants import quantize

HERE = os.path.dirname(os.path.abspath(__file__))
ARCH, E, K, L, D, F = "qwen4exp", 8, 6, 2, 64, 32
rng = np.random.default_rng(7)
fails = 0
def check(name, ok):
    global fails
    fails += 0 if ok else 1
    print(("PASS " if ok else "FAIL ") + name)

with tempfile.TemporaryDirectory() as t:
    src, dst, rep, kf = (os.path.join(t, n) for n in ("src.gguf", "cut.gguf", "cut.json", "keep.json"))
    w = gguf.GGUFWriter(src, ARCH)
    w.add_uint32(f"{ARCH}.expert_count", E); w.add_uint32(f"{ARCH}.block_count", L); w.add_uint32(f"{ARCH}.nextn_predict_layers", 1)
    w.add_uint32(f"{ARCH}.expert_used_count", 2); w.add_string("general.name", "tiny")
    made = {}
    for b in range(L + 1):
        made[f"blk.{b}.ffn_gate_inp.weight"] = rng.standard_normal((E, D)).astype(np.float32)
        made[f"blk.{b}.ffn_up_exps.weight"] = rng.standard_normal((E, F, D)).astype(np.float32)
        made[f"blk.{b}.ffn_down_exps.weight"] = rng.standard_normal((E, D, F)).astype(np.float32)
        made[f"blk.{b}.ffn_up_shexp.weight"] = rng.standard_normal((F, D)).astype(np.float32)
    made["token_embd.weight"] = rng.standard_normal((16, D)).astype(np.float32)
    q8 = {}
    for n, a in made.items():
        if n.endswith("ffn_down_exps.weight"):
            q = quantize(a, gguf.GGMLQuantizationType.Q8_0); q8[n] = q
            w.add_tensor(n, q, raw_dtype=gguf.GGMLQuantizationType.Q8_0)
        else:
            w.add_tensor(n, a)
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()
    keep = [[0, 1, 2, 3, 4, 5], [2, 3, 4, 5, 6, 7]]
    json.dump({"target": "all", "share": 0.75, "keep": keep}, open(kf, "w"))
    r = subprocess.run([sys.executable, os.path.join(HERE, "gguf_cut_experts.py"), "--src", src, "--keep-file", kf, "--dst", dst, "--report", rep], capture_output=True, text=True)
    check("the cutter runs", r.returncode == 0)
    if r.returncode: print(r.stdout, r.stderr); sys.exit(1)
    rd = gguf.GGUFReader(dst)
    check("expert_count is the kept count", int(rd.fields[f"{ARCH}.expert_count"].contents()) == K)
    check("other settings are copied", int(rd.fields[f"{ARCH}.expert_used_count"].contents()) == 2 and rd.fields["general.name"].contents() == "tiny")
    got = {x.name: x for x in rd.tensors}
    common = sorted([2, 3, 4, 5, 0, 1])  # most kept across layers: 2-5 twice, then the lowest ids
    ok_slices = True
    for b in range(L + 1):
        idx = keep[b] if b < L else common
        for n in (f"blk.{b}.ffn_gate_inp.weight", f"blk.{b}.ffn_up_exps.weight"):
            ok_slices &= np.array_equal(np.asarray(got[n].data), made[n][idx])
        n = f"blk.{b}.ffn_down_exps.weight"
        ok_slices &= got[n].tensor_type == gguf.GGMLQuantizationType.Q8_0 and np.array_equal(np.asarray(got[n].data), q8[n][idx])
    check("each cut tensor (F32 and Q8_0) is exactly the kept experts, the MTP layer the most-kept set", ok_slices)
    check("the shared expert and the rest are untouched", all(np.array_equal(np.asarray(got[n].data), made[n]) for n in made if "shexp" in n or n == "token_embd.weight"))
    j = json.load(open(rep))
    per_layer = (E * D + 2 * E * F * D) // E * (E - K)
    check("the report counts what was taken out, main layers and MTP apart", j["experts_kept"] == K and j["removed_main_params"] == L * per_layer and j["removed_mtp_params"] == per_layer)
    bad = os.path.join(t, "bad.json"); json.dump({"keep": [[0, 1], [0, 1, 2]]}, open(bad, "w"))
    r2 = subprocess.run([sys.executable, os.path.join(HERE, "gguf_cut_experts.py"), "--src", src, "--keep-file", bad, "--dst", os.path.join(t, "x.gguf")], capture_output=True, text=True)
    check("an uneven keep list is refused (a GGUF has one expert count)", r2.returncode != 0 and "same number" in (r2.stdout + r2.stderr))
print(f"\n{'all passed' if not fails else f'{fails} failed'}")
sys.exit(1 if fails else 0)
