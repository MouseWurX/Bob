#!/usr/bin/env python3
"""Cut experts out of a Qwen3.6-35B-A3B style checkpoint (safetensors) to make a smaller Bob.

Works on the raw bytes, so it needs no torch and copes with any dtype: every expert tensor is
[num_experts, ...] with the expert first, so keeping experts means copying whole contiguous slices.

Usage:
  prune.py --src <hf model dir> --dst <out dir> --counts <expert-counts.json> --keep 176 [--name 24Bob]
  --counts: JSON from the lab's count-experts.mjs or pod/count.py: {"experts": 256, "layers": [[count per expert]...]}
            Any layer with no counts keeps its busiest experts by the average of the other layers (falls back to the first K).
  --keep-file: instead of --counts/--keep, a JSON {"layers": [[expert ids to keep]...]}
"""
import argparse, json, os, re, shutil, struct, sys, hashlib

EXPERT_RE = re.compile(r"^model\.language_model\.layers\.(\d+)\.mlp\.(experts\.(gate_up_proj|down_proj)|gate\.weight)$")
# transformers 5 saves experts one by one instead: ...mlp.experts.<n>.(gate|up|down)_proj.weight
PER_EXPERT_RE = re.compile(r"^(model\.language_model\.layers\.(\d+)\.mlp\.experts\.)(\d+)(\..+)$")
SHARD_BYTES = 4 * 1024**3

def read_header(path):
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        return json.loads(f.read(n)), 8 + n

def dtype_size(dt):
    return {"F64": 8, "I64": 8, "F32": 4, "I32": 4, "BF16": 2, "F16": 2, "I16": 2, "U8": 1, "I8": 1, "BOOL": 1, "F8_E4M3": 1, "F8_E5M2": 1}[dt]

def keep_lists(args, n_layers, n_experts):
    if args.keep_file:
        kl = json.load(open(args.keep_file))["layers"]
        return [sorted(int(e) for e in row) if row else None for row in kl]
    c = json.load(open(args.counts))
    assert c["experts"] == n_experts, f"counts are for {c['experts']} experts, model has {n_experts}"
    rows = c["layers"]
    if args.by != "counts":  # judge by the REAP score (mass per pick) or by mass; see reap.py and keep.py
        assert c.get("mass"), f"{args.counts} has no REAP scores; count it again with --reap, or cut --by counts"
        rows = [None if not m else (m if args.by == "mass" else [(x / n if n else 0.0) for x, n in zip(m, r)]) for m, r in zip(c["mass"], rows)]
    have = [r for r in rows if r]
    avg = [sum(r[e] for r in have) / len(have) for e in range(n_experts)] if have else [0.0] * n_experts
    out = []
    for li in range(n_layers):
        row = rows[li] if li < len(rows) and rows[li] else avg
        order = sorted(range(n_experts), key=lambda e: (-row[e], e))
        out.append(sorted(order[: args.keep]))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True); ap.add_argument("--dst", required=True)
    ap.add_argument("--counts"); ap.add_argument("--keep", type=int); ap.add_argument("--keep-file"); ap.add_argument("--by", default="counts", choices=["counts", "reap", "mass"])
    ap.add_argument("--name", default="Bob")
    args = ap.parse_args()
    if not args.keep_file and not (args.counts and args.keep): sys.exit("need --counts and --keep, or --keep-file")
    cfg = json.load(open(os.path.join(args.src, "config.json")))
    tc = cfg.get("text_config", cfg)
    n_layers, n_experts, top_k = tc["num_hidden_layers"], tc["num_experts"], tc["num_experts_per_tok"]
    keep = keep_lists(args, n_layers, n_experts)
    ks = {len(k) for k in keep if k}
    assert len(ks) == 1, f"every layer must keep the same number of experts, got {ks}"
    K = ks.pop()
    assert K >= top_k, f"keeping {K} experts but the model picks {top_k} per word"
    for li, k in enumerate(keep):
        assert k and len(set(k)) == K and 0 <= min(k) and max(k) < n_experts, f"bad keep list for layer {li}"
    os.makedirs(args.dst, exist_ok=True)

    idx_path = os.path.join(args.src, "model.safetensors.index.json")
    shards = sorted(set(json.load(open(idx_path))["weight_map"].values())) if os.path.exists(idx_path) else ["model.safetensors"]
    out_shard, out_tensors, out_buf, out_size, weight_map, total = 0, {}, [], 0, {}, 0
    out_files = []

    def flush():
        nonlocal out_shard, out_tensors, out_buf, out_size
        if not out_tensors: return
        name = f"model-{out_shard + 1:05d}.safetensors"
        header = {"__metadata__": {"format": "pt"}}
        off = 0
        for tname, (dt, shape, data_parts) in out_tensors.items():
            size = sum(len(p) if isinstance(p, (bytes, bytearray, memoryview)) else p[2] for p in data_parts)
            header[tname] = {"dtype": dt, "shape": shape, "data_offsets": [off, off + size]}
            off += size
        hb = json.dumps(header, separators=(",", ":")).encode()
        pad = (8 - len(hb) % 8) % 8
        with open(os.path.join(args.dst, name), "wb") as f:
            f.write(struct.pack("<Q", len(hb) + pad)); f.write(hb); f.write(b" " * pad)
            for tname, (dt, shape, data_parts) in out_tensors.items():
                for p in data_parts:
                    if isinstance(p, (bytes, bytearray, memoryview)): f.write(p)
                    else:
                        src, start, size = p
                        with open(src, "rb") as g:
                            g.seek(start)
                            left = size
                            while left:
                                chunk = g.read(min(left, 64 * 1024**2)); f.write(chunk); left -= len(chunk)
                weight_map[tname] = name
        out_files.append(name)
        out_shard += 1; out_tensors = {}; out_size = 0

    def add(tname, dt, shape, parts, size):
        nonlocal out_size, total
        if out_size + size > SHARD_BYTES and out_tensors: flush()
        out_tensors[tname] = (dt, shape, parts); out_size += size; total += size

    cut = 0
    for shard in shards:
        sp = os.path.join(args.src, shard)
        header, base = read_header(sp)
        for tname, info in header.items():
            if tname == "__metadata__": continue
            dt, shape, (a, b) = info["dtype"], info["shape"], info["data_offsets"]
            m = EXPERT_RE.match(tname)
            if not m:
                pm = PER_EXPERT_RE.match(tname)
                if pm:
                    li, e = int(pm.group(2)), int(pm.group(3))
                    if e not in keep[li]: cut += 1; continue
                    tname = f"{pm.group(1)}{keep[li].index(e)}{pm.group(4)}"
                add(tname, dt, shape, [(sp, base + a, b - a)], b - a); continue
            li = int(m.group(1))
            assert shape[0] == n_experts, f"{tname}: expected {n_experts} experts first, got {shape}"
            per = (b - a) // n_experts
            parts = [(sp, base + a + e * per, per) for e in keep[li]]
            add(tname, dt, [K] + shape[1:], parts, per * K)
            cut += 1
    flush()
    with open(os.path.join(args.dst, "model.safetensors.index.json"), "w") as f:
        json.dump({"metadata": {"total_size": total}, "weight_map": weight_map}, f, indent=1)

    for fn in os.listdir(args.src):
        if fn.endswith(".safetensors") or fn == "model.safetensors.index.json" or fn == "config.json": continue
        p = os.path.join(args.src, fn)
        if os.path.isfile(p): shutil.copy(p, os.path.join(args.dst, fn))
    tc["num_experts"] = K
    cfg["bob"] = {"name": args.name, "experts_kept": K, "experts_before": n_experts, "keep": keep}
    json.dump(cfg, open(os.path.join(args.dst, "config.json"), "w"), indent=2)
    json.dump({"name": args.name, "experts": K, "layers": keep}, open(os.path.join(args.dst, "bob-keep.json"), "w"))
    print(f"{args.name}: kept {K}/{n_experts} experts in {n_layers} layers ({cut} expert tensors cut or dropped), {total / 1e9:.1f} GB in {len(out_files)} files -> {args.dst}")

if __name__ == "__main__":
    main()
