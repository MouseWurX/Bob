"""Trellis rounding of one linear into Nari's format (Lamplight 0136 TRL1..6): incoherence (random signs + blockwise
Hadamard on both sides), a tail-biting Viterbi over the 16-bit trellis on Nari's INT8 grid, and two ways to place the
rounding error: LDLQ (GPTQ's error feedback on the input Hessian H_in = X^T X / n, as QTIP / EXL3) or YAQA's two-sided
feedback on the Kronecker Hessian H_out (x) H_in of the full model's KL (Tseng, Sun, De Sa 2025, arXiv 2505.22988; their
LDLQ_2hess, GPL-3 like Bob, rewritten here for Nari's tiles and scales).

The decoder (ggml_trellis_dequantize) gives W = diag(post) T_r W^ T_c diag(pre), T = blockwise normalised Sylvester
Hadamard (symmetric, its own inverse), W^[n, k] = grid(state) x s16[k / 16]. So W^ = T_r diag(1/post) W diag(1/pre) T_c.
28 Nov 2026 (thread "Shrink Flash-Next with GPTQ and trellis").
"""
import math
import os
import numpy as np
import torch

import trl_codec as C

GRID = torch.from_numpy(C.GRID)


def rht(x, dim, block):
    """normalised blockwise Sylvester Hadamard along dim (natural order, as ggml_trellis_rht)"""
    if not block:
        return x
    x = x.movedim(dim, -1); sh = x.shape
    y = x.reshape(-1, sh[-1] // block, block).clone()
    h = 1
    while h < block:
        y = y.reshape(-1, sh[-1] // block, block // (2 * h), 2, h)
        a, b = y[..., 0, :], y[..., 1, :]
        y = torch.stack((a + b, a - b), dim=-2)
        h *= 2
    return (y.reshape(sh) / math.sqrt(block)).movedim(-1, dim)


def viterbi(X, k, grid, start=None):
    """X [B, 256] targets in grid units (ring order) -> (states [B, 256] int64, cost [B]). start: [B] int, the value the
    path's ends must share (the first window's top 16 - k bits = the last window's low 16 - k bits): tail-biting."""
    B, dev = X.shape[0], X.device
    lo = 16 - k; m = (1 << lo) - 1
    g = grid.to(dev)
    back = torch.empty(255, B, 1 << lo, dtype=torch.uint8, device=dev)
    cost = (X[:, :1] - g[None]) ** 2  # [B, 65536]
    if start is not None:
        ok = (torch.arange(1 << 16, device=dev)[None] >> k) == start[:, None]
        cost = torch.where(ok, cost, torch.full_like(cost, float('inf')))
    g2 = (g * g)[None]
    for p in range(1, 256):
        best, arg = cost.view(B, 1 << k, 1 << lo).min(dim=1)  # predecessor of s: (h << lo) | (s >> k)
        back[p - 1] = arg.to(torch.uint8)
        # cost[s] = (x - g[s])^2 + best[s >> k]; x^2 is the same for every state, so it is added once at the end
        cost = (torch.addcmul(g2, X[:, p:p + 1], g[None], value=-2.0).view(B, 1 << lo, 1 << k) + best[:, :, None]).view(B, -1)
    if start is not None:
        okf = (torch.arange(1 << 16, device=dev)[None] & m) == start[:, None]
        cost = torch.where(okf, cost, torch.full_like(cost, float('inf')))
    tot, s = cost.min(dim=1); tot = tot + (X[:, 1:] ** 2).sum(dim=1)
    st = torch.empty(B, 256, dtype=torch.int64, device=dev); st[:, 255] = s
    for p in range(255, 0, -1):
        h = back[p - 1].gather(1, (st[:, p] >> k)[:, None])[:, 0].long()
        st[:, p - 1] = (h << lo) | (st[:, p] >> k)
    return st, tot


def quantize_tiles(X, k, grid=GRID):
    """tail-biting trellis code of X [B, 256]: a free pass picks the ends, a second pass ties them (QTIP's two passes).
    On a card (k = 1..6) the CUDA kernel in trl_cuda.py does it; TRL_TORCH=1 keeps the torch version (the tests)."""
    if X.is_cuda and k >= 1 and os.environ.get("TRL_TORCH") != "1":
        import trl_cuda
        return trl_cuda.quantize_tiles(X.float(), k, grid)
    st, _ = viterbi(X, k, grid)
    c = st[:, 255] & ((1 << (16 - k)) - 1)
    st, cost = viterbi(X, k, grid, start=c)
    return st, grid.to(X.device)[st]


def to_tiles(M):
    """[N, K] -> [N/16, K/16, 256] ring order (torch)"""
    N, K = M.shape
    t = M.reshape(N // 16, 16, K // 16, 16)
    return t[:, torch.from_numpy(C.ROW), :, torch.from_numpy(C.COL)].permute(1, 2, 0)


def from_tiles(T, N, K):
    out = torch.zeros(N // 16, 16, K // 16, 16, dtype=T.dtype, device=T.device)
    out[:, torch.from_numpy(C.ROW), :, torch.from_numpy(C.COL)] = T.permute(2, 0, 1)
    return out.reshape(N, K)


def ldl_lower(H, b=16):
    """block-unit lower L - I with H = L D L^T, D block diagonal (16 x 16 blocks; L - I has zero diagonal blocks)"""
    Lc = torch.linalg.cholesky(H); n = H.shape[0]
    inv = torch.zeros_like(H)
    for i in range(0, n, b):
        inv[i:i + b, i:i + b] = torch.linalg.inv(Lc[i:i + b, i:i + b])
    return Lc @ inv - torch.eye(n, dtype=H.dtype, device=H.device)


def damp(H, rel=0.01):
    """H / mean(diag H) + rel I: scale-free (YAQA's H_out of a confident brain can be ~1e-7), then damped"""
    H = H / H.diagonal().mean().clamp_min(1e-30); d = H.diagonal(); d += rel
    return H


def side_block(n, block=128):
    return block if n % block == 0 else 0


def quantize_linear(W, k, H_in, H_out=None, seed=0, scale_mult=1.0, step=None):
    """W [N, K] float, H_in [K, K] (and H_out [N, N] for YAQA) -> dict with the file's parts and W_hat in W's basis.
    The trellis tiles are coded one 16 x 16 tile at a time in YAQA's anti-diagonal order (H_out None: one input-tile
    column at a time, LDLQ)."""
    dev = W.device; N, K = W.shape
    dt = torch.float32 if dev.type == "cuda" else torch.float64
    W = W.double()
    gen = torch.Generator().manual_seed(seed)
    sg_in = (torch.randint(0, 2, (K,), generator=gen) * 2 - 1).double().to(dev)
    sg_out = (torch.randint(0, 2, (N,), generator=gen) * 2 - 1).double().to(dev)
    bk, bn = side_block(K), side_block(N)
    Wr = rht(W * sg_in[None, :], 1, bk)  # W diag(1/pre) T_c with pre = signs
    rs = Wr.pow(2).mean(dim=1).sqrt().clamp_min(1e-12)  # row scale, so the rows mix evenly under T_r
    post = sg_out * rs
    Wt = rht(Wr / post[:, None], 0, bn)  # W^ target
    # Hessians in the coded basis
    Hi = rht(rht(damp(H_in.double().to(dev)) * sg_in[None, :] * sg_in[:, None], 0, bk), 1, bk)
    Li = ldl_lower(damp(Hi, 1e-6)).to(dt)
    if H_out is not None:
        Ho = rht(rht(damp(H_out.double().to(dev)) * post[None, :] * post[:, None], 0, bn), 1, bn)
        Lo = ldl_lower(damp(Ho, 1e-6)).to(dt)
    # one scale per input-tile column, from the target's spread
    s16 = (Wt.reshape(N, K // 16, 16).pow(2).mean(dim=(0, 2)).sqrt() / C.GRID_SD * scale_mult).half().double()
    s16 = torch.where(s16 > 0, s16, torch.full_like(s16, 1e-4))
    Wt = Wt.to(dt); s16 = s16.to(dt)
    hat = torch.zeros_like(Wt)
    states = torch.zeros(N // 16, K // 16, 256, dtype=torch.int64, device=dev)
    if H_out is None:  # LDLQ: input-tile columns from the last to the first (QTIP's order; L is lower)
        for i in range(K // 16 - 1, -1, -1):
            c0, c1 = 16 * i, 16 * i + 16
            tgt = Wt[:, c0:c1] + (Wt[:, c1:] - hat[:, c1:]) @ Li[c1:, c0:c1]
            st, v = quantize_tiles(to_tiles(tgt / s16[i]).reshape(-1, 256).float(), k)
            states[:, i] = st.reshape(N // 16, 256)
            hat[:, c0:c1] = from_tiles(v.reshape(N // 16, 1, 256).to(dt), N, 16) * s16[i]
    else:  # YAQA: anti-diagonals of tiles from the bottom-right corner, both feedbacks
        mt, nt = N // 16, K // 16
        starts = [(mt - i - 1, nt - 1) for i in range(mt)] + [(0, nt - i - 1) for i in range(1, nt)]
        for jm0, jn0 in starts:
            idx = []; jm, jn = jm0, jn0
            while 0 <= jm < mt and 0 <= jn < nt:
                idx.append((jm, jn)); jm += 1; jn -= 1
            tg = []
            E = Wt - hat  # the tiles of one anti-diagonal never feed each other, so one E serves them all
            for jm, jn in idx:
                r0, r1, c0, c1 = 16 * jm, 16 * jm + 16, 16 * jn, 16 * jn + 16
                t = Wt[r0:r1, c0:c1] + Lo[r0:, r0:r1].T @ E[r0:, c0:] @ Li[c0:, c0:c1] \
                    + Lo[r0:, r0:r1].T @ E[r0:, c0:c1] + E[r0:r1, c0:] @ Li[c0:, c0:c1]
                tg.append(to_tiles(t / s16[jn]).reshape(256))
            st, v = quantize_tiles(torch.stack(tg).float(), k)
            for j, (jm, jn) in enumerate(idx):
                states[jm, jn] = st[j]
                hat[16 * jm:16 * jm + 16, 16 * jn:16 * jn + 16] = from_tiles(v[j].reshape(1, 1, 256).to(dt), 16, 16) * s16[jn]
    hat = hat.double()
    W_hat = rht(rht(hat, 0, bn) * post[:, None], 1, bk) * sg_in[None, :]
    desc = [1 if bn else 0, bn, 1, 1 if bk else 0, bk, 1, 0]
    return dict(states=states.cpu().numpy(), s16=s16.float().cpu().numpy(), pre=sg_in.float().cpu().numpy(),
                post=post.float().cpu().numpy(), desc=desc, k=k, W_hat=W_hat)


def dequantize(words, k, K, N, s16, pre, post, desc):
    """numpy W (N x K) from a coded linear, as ggml_trellis_dequantize (no gathers; sides kind 0 or 1)"""
    Wh = torch.from_numpy(C.decode(words, k, K, N, s16)).double()
    Wh = rht(Wh, 1, desc[4] if desc[3] == 1 else 0) * torch.from_numpy(pre).double()[None, :]
    Wh = rht(Wh, 0, desc[1] if desc[0] == 1 else 0) * torch.from_numpy(post).double()[:, None]
    return Wh.numpy()
