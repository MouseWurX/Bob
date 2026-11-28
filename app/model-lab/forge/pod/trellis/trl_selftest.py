#!/usr/bin/env python3
"""On a card: the CUDA Viterbi must match the torch one (same total cost per tile within 1e-4, tail-biting codes that
decode to their values), and both are timed, so a run is priced from measured speeds. Exit 1 on any mismatch.
  trl_selftest.py [--tiles 256] [--bits 2,3]
28 Nov 2026 (thread "Shrink Flash-Next with GPTQ and trellis")."""
import argparse, json, os, sys, time

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import trl_codec as C, trl_quant as Q, trl_cuda


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--tiles", type=int, default=256); ap.add_argument("--bits", default="2,3")
    ap.add_argument("--out", default=None); a = ap.parse_args()
    if not torch.cuda.is_available(): sys.exit("trl_selftest: no card")
    dev = "cuda:0"; torch.manual_seed(0); res = {"card": torch.cuda.get_device_name(0)}; ok = True
    t = time.time(); trl_cuda.module(); res["build_s"] = round(time.time() - t, 1)
    for k in [int(x) for x in a.bits.split(",")]:
        X = (torch.randn(a.tiles, 256) * C.GRID_SD).to(dev)
        torch.cuda.synchronize(); t = time.time(); st_c, v_c = trl_cuda.quantize_tiles(X, k, Q.GRID); torch.cuda.synchronize(); tc = time.time() - t
        os.environ["TRL_TORCH"] = "1"
        torch.cuda.synchronize(); t = time.time(); st_t, v_t = Q.quantize_tiles(X, k); torch.cuda.synchronize(); tt = time.time() - t
        del os.environ["TRL_TORCH"]
        ec = ((v_c - X) ** 2).sum(1); et = ((v_t - X) ** 2).sum(1)
        same = float(((ec - et).abs() / et).max())
        tb = C.check_tail_biting(st_c.cpu().numpy(), k)
        dec = np.array_equal(C.GRID[st_c.cpu().numpy()], v_c.cpu().numpy())
        mse = float((ec / (X ** 2).sum(1)).mean())
        res[f"k{k}"] = dict(cuda_tiles_per_s=round(a.tiles / tc, 1), torch_tiles_per_s=round(a.tiles / tt, 1),
                            max_rel_cost_diff=same, tail_biting=tb, decodes=dec, rel_mse=round(mse, 5))
        print(f"trl_selftest: k={k}: cuda {a.tiles / tc:.0f} tiles/s, torch {a.tiles / tt:.0f} tiles/s, cost diff {same:.2e}, tail-biting {tb}, rel mse {mse:.4f}", flush=True)
        ok &= same < 1e-4 and tb and dec
    res["ok"] = bool(ok)
    if a.out: json.dump(res, open(a.out, "w"), indent=1)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
