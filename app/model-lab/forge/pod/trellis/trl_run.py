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


_READERS = {}


def load_weight(reader_path, name):
    """one tensor as float32; the GGUF is opened once per worker: opening one with a 151k-word vocabulary takes ~5 s
    (gguf-py parses every token string), which was most of the canaries' trellis time (28 Nov, card near 50 W)"""
    import gguf
    from gguf.quants import dequantize
    if reader_path not in _READERS:
        r = gguf.GGUFReader(reader_path); _READERS[reader_path] = (r, {t.name: t for t in r.tensors})
    t = _READERS[reader_path][1][name]
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


def finish(a, name, shape, k, res, Ws, His, Hos, ns, E, N, K, t0, dev, rep, sample=None):
    """measure and save one tensor from its coded parts (res: one dict per coded matrix, experts in order)"""
    import trl_codec as C
    lin, kron, n_used = 0.0, 0.0, 0.0
    for r, W, hi, ho, n in zip(res, Ws, His, Hos, ns):
        D = r["W_hat"] - W.to(r["W_hat"].device).double(); Hd = hi.to(D.device).double(); Wd = W.to(D.device).double()
        if ho is not None: ho = ho.to(D.device)
        lin += float(torch.trace(D @ Hd @ D.T)) / max(float(torch.trace(Wd @ Hd @ Wd.T)), 1e-30) / len(res)
        if ho is not None: kron += 0.5 * float(n) * float(torch.trace(ho.double() @ D @ Hd @ D.T)) / a.tokens
        n_used += float(n)
    if not any(h is not None for h in Hos): kron = float("nan")
    if sample is not None:  # experts priced from a sample: drift scaled up by the rows routed to all of them
        kron *= sample / max(n_used, 1e-30)
    else:
        words = np.concatenate([C.tiles_to_words(r["states"], k) for r in res])
        extra = dict(E=E, s16=np.stack([r["s16"] for r in res]), pre=np.stack([r["pre"] for r in res]), post=np.stack([r["post"] for r in res])) if E \
            else dict(s16=res[0]["s16"], pre=res[0]["pre"], post=res[0]["post"])
        np.savez(os.path.join(a.out, name + ".npz.part"), words=words, k=k, K=K, N=N, desc=np.array(res[0]["desc"], np.int32), **extra)
        os.replace(os.path.join(a.out, name + ".npz.part.npz"), os.path.join(a.out, name + ".npz"))
    nbytes = max(E, 1) * (N * K * k // 8 + K // 16 * 2 + K * 4 + N * 4)
    tag = a.mode + (f"-sample{len(res)}" if sample is not None else "")
    rep.write(f"{name}\t{shape}\t{tag}\t{k}\t{lin:.6g}\t{kron:.6g}\t{time.time() - t0:.1f}\t{dev}\t{nbytes}\n"); rep.flush()
    print(f"trl_run[{dev}]: {name} {shape} {tag} {k} bits, layer loss {lin:.4g}, drift {kron:.4g}, {time.time() - t0:.1f} s", flush=True)


def work(rank, dev, jobs, a):
    """codes this card's tensors; many coded matrices share each card call (trl_quant.quantize_many): every expert of a
    tensor, or several dense tensors at once, until a step holds about --tiles tiles"""
    import trl_quant as Q
    if dev.startswith("cuda"): torch.cuda.set_device(dev)
    torch.set_num_threads(max(1, os.cpu_count() // max(1, a.devices)))
    rep = open(os.path.join(a.out, f"report-{rank}.tsv"), "a")
    yq = a.mode == "yaqa"
    dense = []  # (name, k, W, H_in, H_out, n) waiting for a shared run
    tm = {"load": 0.0, "code": 0.0}; t_all = time.time()
    def flush():
        if not dense: return
        t0 = time.time()
        for k in sorted({d[1] for d in dense}):
            grp = [d for d in dense if d[1] == k]
            res = Q.quantize_many([Q._job(d[2], k, d[3], d[4] if yq else None, seed=a.seed, damp_out=a.damp_out) for d in grp], k)
            for d, r in zip(grp, res):
                N, K = d[2].shape
                finish(a, d[0], f"{N}x{K}", k, [r], [d[2]], [d[3]], [d[4]], [d[5]], 0, N, K, t0, dev, rep)
        dense.clear(); tm["code"] += time.time() - t0
        if dev.startswith("cuda"): torch.cuda.empty_cache()
    for name in jobs:
        t0 = time.time()
        W = load_weight(a.weights, name).to(dev); tm["load"] += time.time() - t0
        k = a.plan.get(name, a.bits)
        if W.dim() == 3:  # experts: one coded matrix each, same sides and desc, H per expert (hess_hf.py, or x_dump: H_in only)
            flush()
            E, N, K = W.shape
            Hi, Ho, n_e = expert_hessians(a, name, K, N, E)
            if yq and Ho is None: raise SystemExit(f"trl_run: {name}: YAQA needs the experts' H_out (hess_hf.py without --no-out)")
            tc = time.time(); pick = list(range(E))
            if a.sample and a.sample < E:  # price the width from a few experts (the busiest and an even spread)
                order = sorted(range(E), key=lambda e: -n_e[e]); pick = sorted(set(order[:a.sample // 2] + order[::max(1, E // (a.sample - a.sample // 2))]))[:a.sample]
            per = max(1, a.tiles // (N // 16)); res = []
            for i in range(0, len(pick), per):
                es = pick[i:i + per]
                res += Q.quantize_many([Q._job(W[e], k, Hi[e].to(dev), Ho[e].to(dev) if yq else None, seed=a.seed + e, damp_out=a.damp_out) for e in es], k)
            finish(a, name, f"{E}x{N}x{K}", k, res, [W[e] for e in pick], [Hi[e] for e in pick],
                   [Ho[e] if Ho is not None else None for e in pick], [n_e[e] for e in pick], E, N, K, t0, dev, rep,
                   sample=sum(n_e) if len(pick) < E else None)
            tm["code"] += time.time() - tc; del W, Hi, Ho
            if dev.startswith("cuda"): torch.cuda.empty_cache()
        else:
            tl = time.time(); h = torch.load(os.path.join(a.hess, name + ".pt")); tm["load"] += time.time() - tl
            Ho = h.get("H_out")
            if yq and Ho is None: raise SystemExit(f"trl_run: {name} has no H_out (hess_hf.py ran with --no-out)")
            dense.append((name, k, W, h["H_in"].to(dev), Ho.to(dev) if Ho is not None else None, h["n"]))
            if sum(d[2].shape[0] // 16 for d in dense) >= a.tiles: flush()
    flush()
    print(f"trl_run[{dev}]: {len(jobs)} tensors in {time.time() - t_all:.0f} s: loading {tm['load']:.0f} s, coding and saving "
          f"{tm['code']:.0f} s (the seconds column counts each tensor's whole shared batch)", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", required=True); ap.add_argument("--hess", default=None); ap.add_argument("--out", required=True)
    ap.add_argument("--bits", type=int, required=True); ap.add_argument("--mode", choices=["ldlq", "yaqa"], required=True)
    ap.add_argument("--match", default=r"^blk\.\d+\.(attn_(q|k|v|output)|ffn_(gate|up|down))\.weight$")
    ap.add_argument("--devices", type=int, default=1); ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--x", default=None, help="x_dump folder: per-expert inputs for MoE expert tensors (3D)")
    ap.add_argument("--min-rows", type=int, default=128)
    ap.add_argument("--tiles", type=int, default=8192, help="tiles a card call aims for (more matrices coded at once)")
    ap.add_argument("--sample", type=int, default=0, help="experts: code only this many per tensor to price a width (no codes saved)")
    ap.add_argument("--damp-out", type=float, default=0.01, help="YAQA: H_out + this x mean(diag) I (more = trust the output side less)")
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
