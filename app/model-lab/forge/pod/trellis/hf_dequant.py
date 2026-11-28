#!/usr/bin/env python3
"""A pre-quantized Hugging Face checkpoint (NVIDIA ModelOpt: NVFP4 and FP8 weights) as a plain BF16 checkpoint, so
transformers can run it for hess_hf.py. transformers 5.24.1 has no loader for pre-quantized ModelOpt files ("Unknown
quantization type, got modelopt"), and the Inkling 2 Mini Hessian pass got NaN logits from it (try 3, 28 Nov).

  hf_dequant.py --src hf/ --out hf-bf16/

Same rules as llama.cpp's converter (conversion/base.py, _nvfp4_pack and dequant_fp8) and ggml's NVFP4:
  NVFP4: weight uint8 [out, in/2], two E2M1 values a byte (low nibble first); weight_scale E4M3 [out, in/16], sign bit
         dropped and 0x7F read as 0 (as ggml); weight_scale_2 one float for the tensor. w = e2m1 x scale x scale_2.
  FP8:   weight float8 with weight_scale (one, per row, or per block by the shapes) or weight_scale_inv: w = w x scale.
  input_scale, k_scale, v_scale and activation scales are dropped. Every other tensor is copied as it is.
Writes the same shard names and index, and config.json without quantization_config. One tensor at a time in memory.
28 Nov 2026 (thread "Shrink Flash-Next with GPTQ and trellis")."""
import argparse, json, os, shutil

import torch

E2M1 = torch.tensor([0, 0.5, 1, 1.5, 2, 3, 4, 6, -0.0, -0.5, -1, -1.5, -2, -3, -4, -6], dtype=torch.float32)
DROP = (".input_scale", ".activation_scale", "_activation_scale", ".k_scale", ".v_scale")


def ue4m3(scale):
    """E4M3 scale bytes as floats, sign bit dropped and 0x7F as 0 (ggml_ue4m3_to_fp32)"""
    b = scale.view(torch.uint8) & 0x7F
    f = b.view(torch.float8_e4m3fn).float()
    return torch.where(b == 0x7F, torch.zeros_like(f), f)


def nvfp4(w, scale, scale2):
    out, half = w.shape
    if scale.shape != (out, half // 8): raise SystemExit(f"hf_dequant: NVFP4 shapes don't fit: weight {list(w.shape)}, scale {list(scale.shape)}")
    v = torch.stack([w & 0x0F, w >> 4], dim=-1).reshape(out, half * 2).long()
    s = ue4m3(scale).repeat_interleave(16, dim=1)
    return E2M1[v] * s * scale2.float().reshape(())


def fp8(w, s):
    s = s.float()
    if s.numel() == 1: return w.float() * s.reshape(())
    if s.ndim == 2 * w.ndim and all(n == 1 for n in s.shape[1::2]): s = s.reshape(tuple(s.shape[0::2]))  # [o/b, 1, i/b, 1]
    if s.ndim == w.ndim and all(a % b == 0 for a, b in zip(w.shape, s.shape)):
        for d, (a, b) in enumerate(zip(w.shape, s.shape)): s = s.repeat_interleave(a // b, dim=d)
    while s.ndim < w.ndim: s = s.unsqueeze(-1)
    return w.float() * s


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--src", required=True); ap.add_argument("--out", required=True); a = ap.parse_args()
    from safetensors import safe_open
    from safetensors.torch import save_file
    os.makedirs(a.out, exist_ok=True)
    idx_p = os.path.join(a.src, "model.safetensors.index.json")
    shards = sorted({v for v in json.load(open(idx_p))["weight_map"].values()}) if os.path.exists(idx_p) else ["model.safetensors"]
    where, fs = {}, {}
    for sh in shards:
        fs[sh] = safe_open(os.path.join(a.src, sh), framework="pt")
        for k in fs[sh].keys(): where[k] = sh
    get = lambda k: fs[where[k]].get_tensor(k)
    used = {k for k in where if (k.endswith((".weight_scale", ".weight_scale_2", ".weight_scale_inv")) and k.rsplit(".", 1)[0] + ".weight" in where)
            or k.endswith(DROP)}
    counts = {"nvfp4": 0, "fp8": 0, "copied": 0, "dropped": 0}; wmap = {}
    for sh in shards:
        out = {}
        for k in fs[sh].keys():
            if k in used: continue
            t = get(k)
            if k.endswith(".weight") and t.dtype == torch.uint8 and k[:-7] + ".weight_scale" in where:
                s2 = k[:-7] + ".weight_scale_2"
                if s2 not in where: raise SystemExit(f"hf_dequant: {k} is NVFP4 but has no weight_scale_2")
                t = nvfp4(t, get(k[:-7] + ".weight_scale"), get(s2)); counts["nvfp4"] += 1
            elif k.endswith(".weight") and t.dtype in (torch.float8_e4m3fn, torch.float8_e5m2):
                sk = next((k[:-7] + x for x in (".weight_scale", ".weight_scale_inv") if k[:-7] + x in where), None)
                t = fp8(t, get(sk)) if sk else t.float(); counts["fp8"] += 1
            else: counts["copied"] += 1
            if t.is_floating_point():
                if not torch.isfinite(t).all(): raise SystemExit(f"hf_dequant: {k} has non-finite values after unpacking")
                t = t.to(torch.bfloat16)
            out[k] = t.contiguous(); wmap[k] = sh
        save_file(out, os.path.join(a.out, sh), metadata={"format": "pt"})
        print(f"hf_dequant: {sh}: {len(out)} tensors", flush=True)
    counts["dropped"] = len(used)
    if os.path.exists(idx_p):
        idx = json.load(open(idx_p)); idx["weight_map"] = wmap; idx.get("metadata", {}).pop("total_size", None)
        json.dump(idx, open(os.path.join(a.out, "model.safetensors.index.json"), "w"), indent=1)
    for f in os.listdir(a.src):
        p = os.path.join(a.src, f)
        if f.endswith(".safetensors") or f in ("model.safetensors.index.json", "hf_quant_config.json") or not os.path.isfile(p): continue
        if f == "config.json":
            c = json.load(open(p)); c.pop("quantization_config", None)
            for sub in c.values():
                if isinstance(sub, dict): sub.pop("quantization_config", None)
            json.dump(c, open(os.path.join(a.out, f), "w"), indent=1)
        else: shutil.copy2(p, os.path.join(a.out, f))
    print(f"hf_dequant: {counts['nvfp4']} NVFP4 and {counts['fp8']} FP8 weights unpacked to BF16, {counts['copied']} copied, "
          f"{counts['dropped']} scales dropped -> {a.out}", flush=True)


if __name__ == "__main__":
    main()
