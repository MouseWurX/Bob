#!/usr/bin/env python3
"""Learned 2-bit rounding for stock q2_0 tensors: our port of ISTA DASLab's GSQ to GGUF and one card (26 Nov 2026).

GSQ (Dadgarnia et al., arXiv 2604.18556, github.com/IST-DASLab/GSQ, Apache-2.0) learns, for every weight, which of four grid
levels it rounds to, and the per-group scales, so a layer's output on sample text changes as little as possible. It starts
from GPTQ and anneals a Gumbel-softmax choice (temperature high to low, logit scale low to high) with the Lion optimizer.
Its 2-bit grid is {-2, -1, 0, 1} x scale. Stock llama.cpp q2_0 stores 64 weights as codes {-1, 0, 1, 2} x one f16 scale
(ggml-quants.c dequantize_row_q2_0): the same set with the scale's sign flipped. So GSQ's result at group 64 is written
straight into a stock q2_0 tensor: q = 1 - v, d = -s. The file loads on stock llama.cpp and Lamplight, no change.

What is ours, and differs from their code:
- The loss is their per-linear-layer form, written with H = X^T X / n: ||X (Wq - W)^T||^2 / n = trace((Wq - W) H (Wq - W)^T).
  Their repo scores whole MLP blocks on stored activations; this needs only H, so it runs on one card for any model size,
  including Flash-Next, whose model code their repo lacks. X comes from pod/gsq/x_dump (llama.cpp, the GGUF itself).
- Experts are tuned one by one on their own routed tokens (an expert with too few rows uses its layer's pooled H).
- GSQ is light training on rounding only: it changes which step each weight rounds to, and the scales. Nothing else.

Modes (all write q2_0 blocks, so the three can be swapped into the same file and compared on the same text):
  stock  llama.cpp's own q2_0 rounding (scale = largest |w| in the group: the "+2" level is never used). Checks the writer.
  gptq   GPTQ with a searched scale per group (no learning)
  gsq    gptq, then GSQ's learned rounding and scales

  gsq_q2.py --model ref.gguf --x xdir --match 'ffn_down' --mode gsq --out codes/ [--steps 640] [--device cuda]
Writes codes/<tensor>.q2_0 (raw blocks, rows in file order) and codes/report.tsv (each tensor's loss, relative to its output).
Needs: torch, numpy, gguf-py (the llama.cpp tree's own)."""
import argparse, json, math, os, re, sys, time

import numpy as np
import torch

QK = 64  # q2_0 block


def load_weights(path, match):
    import gguf
    r = gguf.GGUFReader(path); out = {}
    for t in r.tensors:
        if not re.search(match, t.name) or len(t.shape) < 2: continue
        ne = [int(x) for x in t.shape]                       # ne0 = row length (inputs), ne1 = rows (outputs), ne2 = experts
        w = gguf.quants.dequantize(t.data, t.tensor_type).astype(np.float32)
        out[t.name] = w.reshape(ne[2] if len(ne) > 2 else 1, ne[1], ne[0])
    return out


def load_x(path, ne0, n_exp):
    """records of int32 expert + ne0 fp16 -> {expert: float32 [n, ne0]}"""
    rec = np.dtype([("e", "<i4"), ("x", "<f2", (ne0,))])
    a = np.fromfile(path, dtype=rec); out = {}
    for e in range(n_exp):
        sel = a["x"][a["e"] == e]
        if len(sel): out[e] = sel.astype(np.float32)
    return out


def hessians(xs, n_exp, ne0, dev, damp, min_rows):
    """per expert: H = X^T X / n + damp * mean(diag) * I, and its share of all rows. Experts under min_rows use the pooled H."""
    H, n = {}, {}; pool = torch.zeros(ne0, ne0, dtype=torch.float64, device=dev); tot = 0
    for e, x in xs.items():
        X = torch.from_numpy(x).to(dev, torch.float64); h = X.T @ X
        pool += h; tot += len(x)
        if len(x) >= min_rows: H[e] = h / len(x)
        n[e] = len(x)
    pool = pool / max(tot, 1)
    for e in range(n_exp):
        h = H.get(e, pool); d = damp * torch.diag(h).mean().clamp_min(1e-12)
        H[e] = (h + d * torch.eye(ne0, dtype=h.dtype, device=dev)).float()
    share = {e: (n.get(e, 0) / tot if tot else 1.0 / n_exp) for e in range(n_exp)}
    return H, share


def rnd(x):  # C roundf: half away from zero (torch.round is half to even)
    # 26 Nov (pilot try 2): floor(|x| + 0.5) is wrong just below a half, since 0.49999997 + 0.5 rounds up to 1.0 in float32;
    # with BF16 weights w = amax/2 exactly and 1/amax rounded down, w * (1/amax) lands there all the time. |x| - floor(|x|)
    # is exact, so compare that with 0.5 instead.
    a = x.abs(); f = torch.floor(a)
    return torch.sign(x) * (f + (a - f >= 0.5).to(x.dtype))


def stock(W):
    """quantize_row_q2_0_ref: d = amax of the group (f16), q = clamp(roundf(w / d) + 1, 0, 3). Returns (q codes, d)."""
    G = W.reshape(W.shape[0], -1, QK); d = G.abs().amax(-1)
    inv = torch.where(d > 0, 1.0 / d, torch.zeros_like(d))
    q = (rnd(G * inv[..., None]) + 1).clamp(0, 3)
    return q.reshape(W.shape).to(torch.uint8), d.half()


def levels(v, s, idx):  # GSQ grid value v in {-2..1} x the group's scale
    return v * s[:, idx]


def search_scales(W, h_diag):
    """per group: the scale (either sign) that minimizes diag(H)-weighted rounding error on {-2,-1,0,1} x s"""
    G = W.reshape(W.shape[0], -1, QK); hd = h_diag.reshape(-1, QK)[None]
    amax = G.abs().amax(-1).clamp_min(1e-12); best = None; best_err = None
    for sign in (1.0, -1.0):
        for c in torch.linspace(0.35, 1.05, 15):
            s = sign * c * amax                                          # largest |level| is 2|s|
            v = rnd(G / s[..., None]).clamp(-2, 1)
            err = (((v * s[..., None]) - G) ** 2 * hd).sum(-1)
            if best is None: best, best_err = s.clone(), err
            else:
                m = err < best_err; best = torch.where(m, s, best); best_err = torch.where(m, err, best_err)
    return best                                                          # [rows, groups]


def gptq(W, H, s, block=128):
    """GPTQ (Frantar et al.) column sweep with fixed group scales s, grid {-2,-1,0,1} x s. Returns codes v."""
    W = W.clone(); rows, cols = W.shape; idx = torch.arange(cols, device=W.device) // QK
    dead = torch.diag(H) == 0; H = H.clone(); H[dead, dead] = 1; W[:, dead] = 0
    L = torch.linalg.cholesky(H); Hinv = torch.cholesky_inverse(L); Hinv = torch.linalg.cholesky(Hinv, upper=True)
    V = torch.zeros_like(W)
    for i1 in range(0, cols, block):
        i2 = min(i1 + block, cols); W1 = W[:, i1:i2].clone(); E1 = torch.zeros_like(W1); Hi = Hinv[i1:i2, i1:i2]
        for i in range(i2 - i1):
            w = W1[:, i]; sc = s[:, idx[i1 + i]]
            v = rnd(w / sc).clamp(-2, 1); V[:, i1 + i] = v
            err = (w - v * sc) / Hi[i, i]
            W1[:, i:] -= err[:, None] @ Hi[i, i:][None, :]; E1[:, i] = err
        W[:, i2:] -= E1 @ Hinv[i1:i2, i2:]
    return V


def loss_of(Wq, W, H):
    D = Wq - W
    return float(((D @ H) * D).sum())


def gsq(W, H, V0, s0, steps, cfg, dev):
    """GSQ's 2-bit quantizer (GumbelQuantizer2Bit, same init and anneal), on the trace loss. Returns codes v, scales s."""
    vals = torch.tensor([-2.0, -1.0, 0.0, 1.0], device=dev); idx = torch.arange(W.shape[1], device=dev) // QK
    Q = V0                                                               # GPTQ's weights / their scales, as GSQ starts
    lg = -0.5 * (Q[None] - vals.view(4, 1, 1)) ** 2; lg = lg - lg.mean(0, keepdim=True)
    logits = (cfg["std"] * (torch.randn((4,) + tuple(W.shape), device=dev) + lg * cfg["strength"])).requires_grad_(True)
    scales = s0.clone().float().requires_grad_(True)
    m_l, m_s = torch.zeros_like(logits), torch.zeros_like(scales); b1, b2 = 0.9, 0.99
    norm = float(((W @ H) * W).sum()) or 1.0
    (t0, t1), (k0, k1) = cfg["temperature"], cfg["scale"]
    for st in range(steps):
        f = st / max(steps - 1, 1); temp = t0 + (t1 - t0) * f; kap = k0 + (k1 - k0) * f
        lr_f = 0.5 * (1 + math.cos(math.pi * f))                         # cosine decay (their README: Lion with a cosine LR)
        u = torch.rand_like(logits); g = -torch.log(-torch.log(u + 1e-8) + 1e-8)
        soft = torch.softmax((logits * kap + g) / temp, dim=0)
        Wq = (soft * vals.view(4, 1, 1)).sum(0) * scales[:, idx]
        D = Wq - W; loss = ((D @ H) * D).sum() / norm
        gl, gs = torch.autograd.grad(loss, (logits, scales))
        with torch.no_grad():                                            # Lion (Chen et al. 2023), decoupled weight decay
            for p, gr, m, lr, wd in ((logits, gl, m_l, cfg["masks_lr"], cfg["weight_decay"]), (scales, gs, m_s, cfg["scales_lr"], 0.0)):
                upd = torch.sign(b1 * m + (1 - b1) * gr); p.mul_(1 - lr * lr_f * wd); p.add_(upd, alpha=-lr * lr_f)
                m.mul_(b2).add_(gr, alpha=1 - b2)
    with torch.no_grad():
        v = vals[torch.argmax(logits, 0)]
    return v, scales.detach()


def pack(v, s):
    """GSQ value v in {-2..1}, scale s [rows, groups] -> q2_0 blocks: d = -s (f16), q = 1 - v, 4 codes a byte, low bits first"""
    rows, cols = v.shape; q = (1 - v).to(torch.int64).reshape(rows, cols // QK, QK // 4, 4)
    byte = (q[..., 0] | (q[..., 1] << 2) | (q[..., 2] << 4) | (q[..., 3] << 6)).to(torch.uint8).cpu().numpy()
    d = (-s).half().cpu().numpy().view(np.uint8).reshape(rows, cols // QK, 2)
    return np.concatenate([d, byte], axis=-1).tobytes()


def pack_stock(q, d):
    rows, cols = q.shape; q = q.to(torch.int64).reshape(rows, cols // QK, QK // 4, 4)
    byte = (q[..., 0] | (q[..., 1] << 2) | (q[..., 2] << 4) | (q[..., 3] << 6)).to(torch.uint8).cpu().numpy()
    return np.concatenate([d.cpu().numpy().view(np.uint8).reshape(rows, cols // QK, 2), byte], axis=-1).tobytes()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--x", required=True); ap.add_argument("--match", default="ffn_down")
    ap.add_argument("--mode", choices=["stock", "gptq", "gsq"], default="gsq"); ap.add_argument("--out", required=True)
    ap.add_argument("--share", action="append", default=["ffn_gate=ffn_up"], help="A=B: a tensor named ...A... reads ...B...'s inputs")
    ap.add_argument("--steps", type=int, default=640, help="their production run: 10 epochs x 64 batches")
    ap.add_argument("--damp", type=float, default=0.01); ap.add_argument("--min-rows", type=int, default=128)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu"); ap.add_argument("--seed", type=int, default=0)
    # GSQ's production settings (configs/qwen35/qwen35_35B_A3B.yaml at commit 03fc1648)
    ap.add_argument("--temperature", default="2,0.05"); ap.add_argument("--scale", default="100,500")
    ap.add_argument("--std", type=float, default=0.01); ap.add_argument("--strength", type=float, default=6.0)
    ap.add_argument("--masks-lr", type=float, default=2e-4); ap.add_argument("--scales-lr", type=float, default=1e-4)
    ap.add_argument("--weight-decay", type=float, default=1.0)
    a = ap.parse_args(); torch.manual_seed(a.seed); os.makedirs(a.out, exist_ok=True); dev = a.device
    cfg = dict(temperature=[float(x) for x in a.temperature.split(",")], scale=[float(x) for x in a.scale.split(",")], std=a.std,
               strength=a.strength, masks_lr=a.masks_lr, scales_lr=a.scales_lr, weight_decay=a.weight_decay)
    info = json.load(open(os.path.join(a.x, "info.json"), encoding="utf-8"))["tensors"]
    weights = load_weights(a.model, a.match)
    rep = open(os.path.join(a.out, "report.tsv"), "a", encoding="utf-8")
    if rep.tell() == 0: rep.write("# tensor\tmode\texperts\tloss_stock\tloss_mode\tseconds\n")
    for name, Wall in weights.items():
        src = name
        for pair in a.share:
            x, y = pair.split("=")
            if x in name and name.replace(x, y) in info and name not in info: src = name.replace(x, y)
        if src not in info: print(f"gsq_q2: {name}: no inputs recorded, skipped", file=sys.stderr); continue
        n_exp, rows, cols = Wall.shape
        if cols % QK: print(f"gsq_q2: {name}: {cols} wide, q2_0 needs a multiple of 64, skipped", file=sys.stderr); continue
        t0 = time.time()
        xs = load_x(os.path.join(a.x, src + ".x"), cols, n_exp)
        H, share = hessians(xs, n_exp, cols, dev, a.damp, a.min_rows); del xs
        blob, ls, lm = [], 0.0, 0.0
        for e in range(n_exp):
            W = torch.from_numpy(Wall[e]).to(dev); He = H[e]; idx = torch.arange(cols, device=dev) // QK
            q0, d0 = stock(W); Ws = (q0.float() - 1) * d0.float()[:, idx]; l0 = loss_of(Ws, W, He)
            if a.mode == "stock":
                blob.append(pack_stock(q0, d0)); l1 = l0
            else:
                s = search_scales(W, torch.diag(He)); v = gptq(W, He, s)
                if a.mode == "gsq":
                    v2, s2 = gsq(W, He, v, s, a.steps, cfg, dev)
                    # keep GSQ's result only if it beats its own GPTQ start on the same loss (with the f16 scales it is stored with)
                    if loss_of(v2 * s2.half().float()[:, idx], W, He) < loss_of(v * s.half().float()[:, idx], W, He): v, s = v2, s2
                l1 = loss_of(v * s.half().float()[:, idx], W, He); blob.append(pack(v, s))
            ref = float(((W @ He) * W).sum()) or 1.0
            ls += share[e] * l0 / ref; lm += share[e] * l1 / ref
        with open(os.path.join(a.out, name + ".q2_0"), "wb") as f:
            for b in blob: f.write(b)
        rep.write(f"{name}\t{a.mode}\t{n_exp}\t{ls:.6e}\t{lm:.6e}\t{time.time() - t0:.1f}\n"); rep.flush()
        print(f"gsq_q2: {name} ({n_exp} x {rows} x {cols}) {a.mode}: loss {ls:.4g} (stock) -> {lm:.4g}, {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
