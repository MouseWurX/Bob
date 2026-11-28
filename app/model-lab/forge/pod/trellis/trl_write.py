#!/usr/bin/env python3
"""Write trellis-coded linears into a copy of a GGUF, as a file Lamplight 0136 loads (Nari's layout, nariq/FORMAT.md).

  trl_write.py --base made.gguf --codes codes/ --out new.gguf

codes/<tensor>.npz (from trl_run.py) holds one coded linear: words (uint32), k, K, N, s16, pre, post, desc. Each one
replaces <tensor> (blk.N.attn_q.weight ...) with a TRL<k> tensor of shape [K, N] plus <base>.trellis_s16 (F16 [K/16]),
.trellis_pre (F32 [K]), .trellis_post (F32 [N]) and the key trellis.desc.<base>; the file gets trellis.version = 1.
MoE expert tensors (codes with E) become TRL [K, N, E] with sides [K/16, E], [K, E], [N, E] and one shared desc.
Every other tensor and key is copied as is. Needs the gguf-py of a tree with Lamplight 0136 (it knows the TRL types).
28 Nov 2026 (thread "Shrink Flash-Next with GPTQ and trellis")."""
import argparse, glob, os, sys

import numpy as np
import gguf


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--base", required=True); ap.add_argument("--codes", required=True)
    ap.add_argument("--out", required=True); a = ap.parse_args()
    if not hasattr(gguf.GGMLQuantizationType, "TRL2"): sys.exit("trl_write: this gguf-py has no TRL types (use the Lamplight 0136 tree's gguf-py)")
    codes = {os.path.basename(p)[:-len(".npz")]: p for p in glob.glob(os.path.join(a.codes, "*.npz"))}
    if not codes: sys.exit(f"trl_write: no .npz files in {a.codes}")
    r = gguf.GGUFReader(a.base)
    names = {t.name for t in r.tensors}
    missing = sorted(set(codes) - names)
    if missing: sys.exit(f"trl_write: {len(missing)} coded tensor(s) name no tensor in {a.base}: {missing[:3]}")
    arch = r.fields[gguf.Keys.General.ARCHITECTURE].contents()
    w = gguf.GGUFWriter(a.out + ".part", arch=arch, endianess=r.endianess)
    for f in r.fields.values():
        if f.name == gguf.Keys.General.ARCHITECTURE or f.name.startswith("GGUF.") or f.name.startswith("trellis."): continue
        vt = f.types[0]; st = f.types[-1] if vt == gguf.GGUFValueType.ARRAY else None
        if vt == gguf.GGUFValueType.ARRAY and len(f.data) == 0:  # gguf-py cannot write an empty array (no data lost)
            print(f"trl_write: key {f.name} is an empty array, left out", file=sys.stderr); continue
        w.add_key_value(f.name, f.contents(), vt, sub_type=st)
    w.add_uint32("trellis.version", 1)
    plan = []  # (name, kind, payload)
    for t in r.tensors:
        if t.name not in codes:
            plan.append((t.name, "copy", t)); continue
        z = np.load(codes[t.name]); k, K, N = int(z["k"]), int(z["K"]), int(z["N"]); E = int(z["E"]) if "E" in z else 0
        want = [K, N, E] if E else [K, N]
        if [int(x) for x in t.shape] != want:
            sys.exit(f"trl_write: {t.name} is {[int(x) for x in t.shape]} in the base, the codes are for {want}")
        words = np.ascontiguousarray(z["words"].astype("<u4"))
        if words.size * 32 != K * N * k * max(E, 1): sys.exit(f"trl_write: {t.name}: {words.size} words for {want} at {k} bits")
        base = t.name[:-len(".weight")]
        # experts (the NariQ thread's layout, Lamplight 0136 at de773f03): TRL [K, N, E], expert e from byte e K N k / 8;
        # sides [K/16, E], [K, E], [N, E] with expert e's values contiguous; one desc for all; no pin / pout
        shape = (E, N, K * k // 8) if E else (N, K * k // 8)
        plan.append((t.name, "trl", (words.view(np.uint8).reshape(shape), getattr(gguf.GGMLQuantizationType, f"TRL{k}"))))
        plan.append((base + ".trellis_s16", "arr", z["s16"].astype(np.float16)))
        plan.append((base + ".trellis_pre", "arr", z["pre"].astype(np.float32)))
        plan.append((base + ".trellis_post", "arr", z["post"].astype(np.float32)))
        w.add_array(f"trellis.desc.{base}", [int(x) for x in z["desc"]])
    for name, kind, p in plan:
        if kind == "copy": w.add_tensor_info(name, p.data.shape, p.data.dtype, p.data.nbytes, p.tensor_type)
        elif kind == "trl": w.add_tensor_info(name, p[0].shape, np.dtype(np.uint8), p[0].nbytes, p[1])
        else: w.add_tensor_info(name, p.shape, p.dtype, p.nbytes)
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_ti_data_to_file()
    for name, kind, p in plan:
        w.write_tensor_data(p.data if kind == "copy" else p[0] if kind == "trl" else p, tensor_endianess=r.endianess)
    w.close(); os.replace(a.out + ".part", a.out)
    print(f"trl_write: {len(codes)} coded linears -> {a.out} ({os.path.getsize(a.out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
