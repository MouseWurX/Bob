#!/usr/bin/env python3
"""Write learned q2_0 blocks into a copy of a GGUF (26 Nov 2026, GSQ port).

  q2_0_patch.py --base made.gguf --codes codes/ --out new.gguf

made.gguf is a normal llama-quantize file whose target tensors are already q2_0 (same shapes, same sizes). Every
codes/<tensor>.q2_0 from gsq_q2.py replaces that tensor's bytes in the copy; nothing else in the file changes, so the new
file has exactly the old file's size and header, and loads wherever the old one does. Refuses a tensor that is not q2_0 or
whose size differs. Prints how many tensors were replaced. Needs gguf-py."""
import argparse, glob, os, shutil, sys

import gguf


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--base", required=True); ap.add_argument("--codes", required=True)
    ap.add_argument("--out", required=True); a = ap.parse_args()
    codes = {os.path.basename(p)[:-len(".q2_0")]: p for p in glob.glob(os.path.join(a.codes, "*.q2_0"))}
    if not codes: sys.exit(f"q2_0_patch: no .q2_0 files in {a.codes}")
    r = gguf.GGUFReader(a.base); plan = []
    for t in r.tensors:
        if t.name not in codes: continue
        if t.tensor_type.name.lower() != "q2_0": sys.exit(f"q2_0_patch: {t.name} is {t.tensor_type.name} in {a.base}, not q2_0")
        n = os.path.getsize(codes[t.name])
        if n != int(t.n_bytes): sys.exit(f"q2_0_patch: {t.name}: {n} bytes of codes, the file holds {int(t.n_bytes)}")
        plan.append((t.name, int(t.data_offset), codes[t.name]))
    missing = sorted(set(codes) - {p[0] for p in plan})
    if missing: sys.exit(f"q2_0_patch: {len(missing)} code file(s) name no tensor in {a.base}: {missing[:3]}")
    del r
    shutil.copyfile(a.base, a.out + ".part")
    with open(a.out + ".part", "r+b") as f:
        for name, off, path in plan:
            f.seek(off); f.write(open(path, "rb").read())
    os.replace(a.out + ".part", a.out)
    print(f"q2_0_patch: {len(plan)} tensors replaced -> {a.out}")


if __name__ == "__main__":
    main()
