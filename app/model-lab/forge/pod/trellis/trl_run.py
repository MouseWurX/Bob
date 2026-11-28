#!/usr/bin/env python3
"""Trellis-code the linears of a GGUF with LDLQ or YAQA (trl_quant.py), on one or several cards, into codes/ for trl_write.py.

  trl_run.py --weights src.gguf --hess hess/ --out codes/ --bits 2 --mode ldlq|yaqa [--match REGEX] [--devices 2] [--plan bits.tsv]
  trl_run.py --weights cut-q8.gguf --x x_dump/ --out codes/ --bits 2 --mode ldlq --match ffn_down_exps   (experts, H_in only)

The weights come from a BF16/F16/F32 GGUF (the converted full-size brain, same names as the file trl_write.py patches).
MoE experts (3D) take each expert's own factors from hess_hf.py (LDLQ or YAQA), or H_in from x_dump (LDLQ). --plan gives
some tensors their own width (bits by part, trl_parts.py). --devices N starts one worker per card; the tensors are dealt
out largest first to the least loaded card, so the cards finish together. A restart skips tensors whose .npz is there.
report.tsv per tensor: name, shape, mode, bits, layer loss (relative, on H_in), drift (the Kronecker estimate of the KL
per word it adds, 1/2 n tr(H_out dW H_in dW^T) / words read; nan without H_out), seconds, card, bytes in the file.
28 Nov 2026 (thread "Shrink Flash-Next with GPTQ and trellis")."""
import argparse, os, re, sys, time

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)


def load_weight(reader_path, name):
    import gguf
    from gguf.quants import dequantize
    r = gguf.GGUFReader(reader_path)
    t = next(t for t in r.tensors if t.name == name)
    ne = [int(x) for x in t.shape]  # [K, N] or [K, N, E] (experts)
    w = np.array(dequantize(t.data, t.tensor_type), dtype=np.float32)
    return torch.from_numpy(w.reshape(ne[2], ne[1], ne[0]) if len(ne) == 3 else w.reshape(ne[1], ne[0]))


def expert_hessians(a, name, K, N, E):
    """per expert (H_in, H_out or None, rows): from hess_hf.py's file, else x_dump's records (H_in only, as
    pod/gsq/gsq_q2.py). An expert with fewer than --min-rows rows takes the row-weighted mean of all experts' factors."""
    p = os.path.join(a.hess, name + ".pt") if a.hess else None
    if p and os.path.exists(p):
        h = torch.load(p); n = h["n"].double(); Hi = h["H_in"].float(); Ho = h.get("H_out")
        w = (n / n.sum().clamp(min=1)).float()
        pool_i = torch.einsum("e,eij->ij", w, Hi); few = n < a.min_rows
        Hi[few] = pool_i
        if Ho is not None:
            Ho = Ho.float(); Ho[few] = torch.einsum("e,eij->ij", w, Ho)
        if few.any(): print(f"trl_run: {name}: {int(few.sum())} of {E} experts had under {a.min_rows} rows, they take the pooled factors", flush=True)
        return Hi, Ho, n.tolist()
    sys.path.insert(0, os.path.join(HERE, "..", "gsq")); import gsq_q2
    xs = gsq_q2.load_x(os.path.join(a.x, name + ".x"), K, E)
    H, share = gsq_q2.hessians(xs, E, K, "cpu", 0.0, a.min_rows)
    return H, None, [0] * E


def work(rank, dev, jobs, a):
    import trl_quant as Q, trl_codec as C
    if dev.startswith("cuda"): torch.cuda.set_device(dev)
    torch.set_num_threads(max(1, os.cpu_count() // max(1, a.devices)))
    rep = open(os.path.join(a.out, f"report-{rank}.tsv"), "a")
    for name in jobs:
        t0 = time.time()
        W = load_weight(a.weights, name).to(dev)
        k = a.plan.get(name, a.bits)
        if W.dim() == 3:  # experts: one coded matrix each, same sides and desc, H per expert (hess_hf.py, or x_dump: H_in only)
            E, N, K = W.shape
            Hi, Ho, n_e = expert_hessians(a, name, K, N, E)
            if a.mode == "yaqa" and Ho is None: raise SystemExit(f"trl_run: {name}: YAQA needs the experts' H_out (hess_hf.py without --no-out)")
            words, s16, pre, post, lin, kron = [], [], [], [], 0.0, 0.0
            for e in range(E):
                hi = Hi[e].to(dev); ho = Ho[e].to(dev) if Ho is not None else None
                r = Q.quantize_linear(W[e], k, hi, ho if a.mode == "yaqa" else None, seed=a.seed + e)
                D = r["W_hat"] - W[e].double(); Hd = hi.double(); We = W[e].double()
                lin += float(torch.trace(D @ Hd @ D.T)) / max(float(torch.trace(We @ Hd @ We.T)), 1e-30) / E
                if ho is not None: kron += 0.5 * float(n_e[e]) * float(torch.trace(ho.double() @ D @ Hd @ D.T)) / a.tokens
                words.append(C.tiles_to_words(r["states"], k)); s16.append(r["s16"]); pre.append(r["pre"]); post.append(r["post"]); desc = r["desc"]
            np.savez(os.path.join(a.out, name + ".npz.part"), words=np.concatenate(words), k=k, K=K, N=N, E=E,
                     s16=np.stack(s16), pre=np.stack(pre), post=np.stack(post), desc=np.array(desc, np.int32))
            if Ho is None: kron = float("nan")
            shape = f"{E}x{N}x{K}"
        else:
            E = 1
            h = torch.load(os.path.join(a.hess, name + ".pt"))
            Ho = h.get("H_out")
            if a.mode == "yaqa" and Ho is None: raise SystemExit(f"trl_run: {name} has no H_out (hess_hf.py ran with --no-out)")
            r = Q.quantize_linear(W, k, h["H_in"].to(dev), Ho.to(dev) if a.mode == "yaqa" else None, seed=a.seed)
            N, K = W.shape
            D = (r["W_hat"] - W.double())
            Hi = h["H_in"].to(dev).double()
            lin = float(torch.trace(D @ Hi @ D.T))
            kron = 0.5 * float(h["n"]) * float(torch.trace(Ho.to(dev).double() @ D @ Hi @ D.T)) / a.tokens if Ho is not None else float("nan")
            np.savez(os.path.join(a.out, name + ".npz.part"), words=C.tiles_to_words(r["states"], k), k=k, K=K, N=N,
                     s16=r["s16"], pre=r["pre"], post=r["post"], desc=np.array(r["desc"], np.int32))
            shape = f"{N}x{K}"
        nbytes = E * (N * K * k // 8 + K // 16 * 2 + K * 4 + N * 4)
        os.replace(os.path.join(a.out, name + ".npz.part.npz"), os.path.join(a.out, name + ".npz"))
        rep.write(f"{name}\t{shape}\t{a.mode}\t{k}\t{lin:.6g}\t{kron:.6g}\t{time.time() - t0:.1f}\t{dev}\t{nbytes}\n"); rep.flush()
        print(f"trl_run[{dev}]: {name} {shape} {a.mode} {k} bits, layer loss {lin:.4g}, drift {kron:.4g}, {time.time() - t0:.1f} s", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", required=True); ap.add_argument("--hess", default=None); ap.add_argument("--out", required=True)
    ap.add_argument("--bits", type=int, required=True); ap.add_argument("--mode", choices=["ldlq", "yaqa"], required=True)
    ap.add_argument("--match", default=r"^blk\.\d+\.(attn_(q|k|v|output)|ffn_(gate|up|down))\.weight$")
    ap.add_argument("--devices", type=int, default=1); ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--x", default=None, help="x_dump folder: per-expert inputs for MoE expert tensors (3D)")
    ap.add_argument("--min-rows", type=int, default=128)
    ap.add_argument("--plan", default=None, help="tsv of tensor name and bits (trl_parts.py); others take --bits")
    a = ap.parse_args()
    a.plan = {l.split("\t")[0]: int(l.split("\t")[1]) for l in open(a.plan) if l.strip() and not l.startswith("#")} if a.plan else {}
    info = os.path.join(a.hess, "info.json") if a.hess else None
    a.tokens = (lambda d: d["chunks"] * d["ctx"])(__import__("json").load(open(info))) if info and os.path.exists(info) else 1
    import gguf
    os.makedirs(a.out, exist_ok=True)
    r = gguf.GGUFReader(a.weights)
    todo = [(t.name, int(np.prod([int(x) for x in t.shape]))) for t in r.tensors if re.search(a.match, t.name) and len(t.shape) in (2, 3)
            and not os.path.exists(os.path.join(a.out, t.name + ".npz"))]
    exp = {t.name for t in r.tensors if len(t.shape) == 3}
    bad = [n for n, _ in todo if (n in exp and not (a.x and os.path.exists(os.path.join(a.x, n + ".x")))
                                  and not (a.hess and os.path.exists(os.path.join(a.hess, n + ".pt"))))
           or (n not in exp and not (a.hess and os.path.exists(os.path.join(a.hess, n + ".pt"))))]
    if bad: raise SystemExit(f"trl_run: no Hessian (--hess, or --x for experts) for {len(bad)} tensor(s), e.g. {bad[:2]}")
    del r
    cards = torch.cuda.device_count() if torch.cuda.is_available() else 0
    devs = [f"cuda:{i}" for i in range(min(a.devices, cards))] or ["cpu"] * a.devices
    load = [0] * len(devs); share = [[] for _ in devs]
    for n, sz in sorted(todo, key=lambda x: -x[1]):
        i = load.index(min(load)); share[i].append(n); load[i] += sz
    print(f"trl_run: {len(todo)} tensors over {len(devs)} worker(s) {devs}", flush=True)
    if len(devs) == 1: work(0, devs[0], share[0], a)
    else:
        import torch.multiprocessing as mp
        ps = [mp.get_context("spawn").Process(target=work, args=(i, devs[i], share[i], a)) for i in range(len(devs))]
        [p.start() for p in ps]; [p.join() for p in ps]
        if any(p.exitcode for p in ps): raise SystemExit("trl_run: a worker failed")
    with open(os.path.join(a.out, "report.tsv"), "a") as f:
        for i in range(len(devs)):
            p = os.path.join(a.out, f"report-{i}.tsv")
            if os.path.exists(p): f.write(open(p).read()); os.remove(p)


if __name__ == "__main__":
    main()
