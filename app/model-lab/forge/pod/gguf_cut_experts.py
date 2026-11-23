#!/usr/bin/env python3
"""Cut experts out of a MoE GGUF (any quant, one file or split parts) and write a smaller GGUF.

Nov 23 2026: made for Qwen3.8-Flash-Next (arch qwen4exp, 512 experts, 48 layers plus one MTP layer), to cut it to the
REAP keep list (80% kept, keep-*.json from the Lab) before quantizing it down for a 16 GB card with 32 GB of RAM.

How it works: every expert tensor in a GGUF has the expert as its outermost dimension, so in the reader's numpy view
(dimensions reversed) the expert is axis 0, for quantized blocks too. Keeping experts means copying whole slices.
Tensors cut per layer:
  blk.N.ffn_gate_inp.weight          [n_embd, n_expert]      the router (one row per expert)
  blk.N.ffn_{gate,up,down}_exps.weight, blk.N.ffn_gate_up_exps.weight   [.., .., n_expert]
  blk.N.ffn_exp_probs_b.bias          [n_expert]             if present
  blk.N.ffn_{gate,up,down}_exps.{scale,bias} and similar      anything else whose outermost size is n_expert
The shared expert and everything else are copied as they are. <arch>.expert_count becomes the kept count; every layer
must keep the same number. A layer the keep list doesn't cover (the MTP layer) keeps the experts kept most often across
the listed layers.

Usage:
  gguf_cut_experts.py --src <first .gguf or part 00001> --keep-file keep.json --dst out.gguf [--dry-run] [--report cut.json]
  keep.json: {"keep": [[expert ids per layer]...]} or {"layers": [...]} (the Lab's keep-*.json and bob-keep.json)
"""
import argparse, json, os, re, sys
from collections import Counter

import numpy as np
import gguf

EXP_TENSOR_RE = re.compile(r"^blk\.(\d+)\.(ffn_gate_inp|ffn_gate_exps|ffn_up_exps|ffn_down_exps|ffn_gate_up_exps|ffn_exp_probs_b)\.")


def shard_paths(src):
    m = re.match(r"^(.*)-(\d{5})-of-(\d{5})\.gguf$", src)
    if not m:
        return [src]
    base, n = m.group(1), int(m.group(3))
    paths = [f"{base}-{i:05d}-of-{n:05d}.gguf" for i in range(1, n + 1)]
    missing = [p for p in paths if not os.path.exists(p)]
    if missing:
        sys.exit(f"missing parts: {missing}")
    return paths


def load_keep(path, n_layer_all, n_expert, n_layer_listed_hint):
    kf = json.load(open(path))
    rows = kf.get("layers") if isinstance(kf.get("layers"), list) else kf.get("keep")
    if not isinstance(rows, list) or not rows:
        sys.exit(f"{path}: no keep list (need \"keep\" or \"layers\")")
    rows = [sorted(set(int(e) for e in r)) if r else None for r in rows]
    sizes = {len(r) for r in rows if r}
    if len(sizes) != 1:
        sys.exit(f"{path}: every layer must keep the same number of experts, got {sorted(sizes)}")
    k = sizes.pop()
    for li, r in enumerate(rows):
        if r and (r[0] < 0 or r[-1] >= n_expert):
            sys.exit(f"{path}: layer {li} has an expert id outside 0..{n_expert - 1}")
    freq = Counter(e for r in rows if r for e in r)
    common = sorted(sorted(range(n_expert), key=lambda e: (-freq[e], e))[:k])
    out = []
    filled = []
    for li in range(n_layer_all):
        r = rows[li] if li < len(rows) else None
        if not r:
            r = common
            filled.append(li)
        out.append(r)
    return out, k, filled


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--dst", required=True)
    ap.add_argument("--keep-file", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--report", help="write a JSON report here: experts kept, and the parameters taken out of the main layers")
    args = ap.parse_args()

    readers = [gguf.GGUFReader(p) for p in shard_paths(args.src)]
    r0 = readers[0]
    arch = r0.fields["general.architecture"].contents()
    n_expert = int(r0.fields[f"{arch}.expert_count"].contents())
    n_layer = int(r0.fields[f"{arch}.block_count"].contents())
    nextn_key = f"{arch}.nextn_predict_layers"
    n_mtp = int(r0.fields[nextn_key].contents()) if nextn_key in r0.fields else 0
    tensors = [t for r in readers for t in r.tensors]
    blocks = sorted({int(m.group(1)) for t in tensors if (m := EXP_TENSOR_RE.match(t.name))})
    n_layer_all = max(blocks) + 1 if blocks else n_layer
    keep, k, filled = load_keep(args.keep_file, n_layer_all, n_expert, n_layer)
    print(f"{arch}: {n_expert} experts, {n_layer} layers (+{n_mtp} MTP), expert tensors in {len(blocks)} blocks; "
          f"keeping {k} ({100 * k / n_expert:.1f}%)" + (f"; blocks {filled} not in the keep list use the most-kept set" if filled else ""))

    writer = gguf.GGUFWriter(args.dst, arch, endianess=r0.endianess, dry_run=args.dry_run)
    skip_prefix = ("GGUF.", "split.")
    for field in r0.fields.values():
        if field.name == gguf.Keys.General.ARCHITECTURE or field.name.startswith(skip_prefix):
            continue
        vt = field.types[0]
        st = field.types[-1] if vt == gguf.GGUFValueType.ARRAY else None
        val = field.contents()
        if vt == gguf.GGUFValueType.ARRAY and len(val) == 0:
            print(f"  note: {field.name} is an empty list; the writer can't store one, so it is left out")
            continue
        if field.name == f"{arch}.expert_count":
            val = k
        writer.add_key_value(field.name, val, vt, sub_type=st)
    writer.add_key_value("bob.cut.keep_file", os.path.basename(args.keep_file), gguf.GGUFValueType.STRING)
    writer.add_key_value("bob.cut.experts_from", n_expert, gguf.GGUFValueType.UINT32)

    plan = []
    before = after = 0
    removed_main = removed_mtp = 0  # parameters (elements), main layers vs the MTP layer(s) past block_count
    for t in tensors:
        data = t.data
        m = EXP_TENSOR_RE.match(t.name)
        cut = False
        if m and data.shape[0] == n_expert:
            idx = np.asarray(keep[int(m.group(1))], dtype=np.int64)
            cut = True
        elif m:
            sys.exit(f"{t.name}: expected {n_expert} experts on the outer axis, numpy shape {data.shape}")
        new_shape = (k,) + tuple(data.shape[1:]) if cut else tuple(data.shape)
        nbytes = data.nbytes // data.shape[0] * new_shape[0] if cut else data.nbytes
        if cut:
            gone = int(t.n_elements) // n_expert * (n_expert - k)
            if int(m.group(1)) < n_layer: removed_main += gone
            else: removed_mtp += gone
        before += data.nbytes
        after += nbytes
        writer.add_tensor_info(t.name, new_shape, data.dtype, nbytes, t.tensor_type)
        plan.append((t, idx if cut else None))
    print(f"tensors {len(plan)}, cut {sum(1 for _, i in plan if i is not None)}; {before / 1e9:.2f} GB -> {after / 1e9:.2f} GB; "
          f"parameters taken out: {removed_main / 1e9:.2f} B in the main layers, {removed_mtp / 1e9:.2f} B in the MTP layer")
    if args.report:
        json.dump({"arch": arch, "experts_from": n_expert, "experts_kept": k, "layers": n_layer, "mtp_layers": n_mtp,
                   "removed_main_params": removed_main, "removed_mtp_params": removed_mtp, "bytes_before": before, "bytes_after": after,
                   "keep_file": os.path.basename(args.keep_file)}, open(args.report, "w"), indent=1)
    if args.dry_run:
        return

    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_ti_data_to_file()
    for n, (t, idx) in enumerate(plan):
        data = t.data if idx is None else np.ascontiguousarray(t.data[idx])
        writer.write_tensor_data(data, tensor_endianess=r0.endianess)
        if n % 50 == 0:
            print(f"  {n}/{len(plan)} {t.name}", flush=True)
    writer.close()
    print(f"wrote {args.dst} ({os.path.getsize(args.dst) / 1e9:.2f} GB)")


if __name__ == "__main__":
    main()
