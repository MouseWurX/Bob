"""Trellis rounding of one linear into Nari's format (Lamplight 0136 TRL1..6): incoherence (random signs + blockwise
Hadamard on both sides), a tail-biting Viterbi over the 16-bit trellis on Nari's INT8 grid, and two ways to place the
rounding error: LDLQ (GPTQ's error feedback on the input Hessian H_in = X^T X / n, as QTIP / EXL3) or YAQA's two-sided
feedback on the Kronecker Hessian H_out (x) H_in of the full model's KL (Tseng, Sun, De Sa 2025, arXiv 2505.22988; their
LDLQ_2hess, GPL-3 like Bob, rewritten here for Nari's tiles and scales).

The decoder (ggml_trellis_dequantize) gives W = diag(post) T_r W^ T_c diag(pre), T = blockwise normalised Sylvester
Hadamard (symmetric, its own inverse), W^[n, k] = grid(state) x s16[k / 16]. So W^ = T_r diag(1/post) W diag(1/pre) T_c.
Built on others' work (our code, their ideas): GPTQ (Frantar et al. 2022, arXiv 2210.17323) and LDLQ with incoherence
(QuIP, Chee et al. 2023, arXiv 2307.13304); Hadamard incoherence (QuIP#, Tseng et al. 2024, arXiv 2402.04396); the
tail-biting trellis and its Viterbi search (QTIP, Tseng et al. 2024, arXiv 2406.11235); YAQA (arXiv 2505.22988).
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


_IDX = {}


def _rc(dev):
    if dev not in _IDX: _IDX[dev] = (torch.from_numpy(C.ROW).to(dev), torch.from_numpy(C.COL).to(dev))
    return _IDX[dev]


def to_tiles(M):
    """[N, K] -> [N/16, K/16, 256] ring order (torch)"""
    N, K = M.shape
    t = M.reshape(N // 16, 16, K // 16, 16); r, c = _rc(M.device)
    return t[:, r, :, c].permute(1, 2, 0)


def from_tiles(T, N, K):
    out = torch.zeros(N // 16, 16, K // 16, 16, dtype=T.dtype, device=T.device); r, c = _rc(T.device)
    out[:, r, :, c] = T.permute(2, 0, 1)
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


def _job(W, k, H_in, H_out=None, seed=0, scale_mult=1.0, damp_out=0.01):
    """one linear's coding as a generator: it yields the next batch of tiles to code (targets [n, 256] in grid units)
    and takes back (states [n, 256], values [n, 256]); it returns the result dict. quantize_many() runs many at once."""
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
    Li = ldl_lower(damp(Hi, 1e-6)).to(dt); del Hi
    if H_out is not None:
        Ho = rht(rht(damp(H_out.double().to(dev), damp_out) * post[None, :] * post[:, None], 0, bn), 1, bn)
        Lo = ldl_lower(damp(Ho, 1e-6)).to(dt); del Ho
    # one scale per input-tile column, from the target's spread
    s16 = (Wt.reshape(N, K // 16, 16).pow(2).mean(dim=(0, 2)).sqrt() / C.GRID_SD * scale_mult).half().double()
    s16 = torch.where(s16 > 0, s16, torch.full_like(s16, 1e-4))
    Wt = Wt.to(dt); s16 = s16.to(dt); del W, Wr
    hat = torch.zeros_like(Wt)
    states = torch.zeros(N // 16, K // 16, 256, dtype=torch.int64, device=dev)
    if H_out is None:  # LDLQ: input-tile columns from the last to the first (QTIP's order; L is lower)
        for i in range(K // 16 - 1, -1, -1):
            c0, c1 = 16 * i, 16 * i + 16
            tgt = Wt[:, c0:c1] + (Wt[:, c1:] - hat[:, c1:]) @ Li[c1:, c0:c1]
            st, v = yield to_tiles(tgt / s16[i]).reshape(-1, 256).float()
            states[:, i] = st.reshape(N // 16, 256)
            hat[:, c0:c1] = from_tiles(v.reshape(N // 16, 1, 256).to(dt), N, 16) * s16[i]
    else:  # YAQA: anti-diagonals of tiles from the bottom-right corner, both feedbacks
        # Each anti-diagonal in a few batched products: Lo and Li are lower with zero diagonal blocks, so
        # Lo[r0:, r0:r1]^T E[r0:, c0:] Li[c0:, c0:c1] = Lo[:, r0:r1]^T E Li[:, c0:c1] (the cut-off rows are zero), and the
        # tiles of one anti-diagonal never feed each other, so one E serves them all. (Was one tile at a time: ~12,000
        # small card calls per tensor, 497 s for Qwen3-0.6B on a 4090, 28 Nov.)
        mt, nt = N // 16, K // 16
        starts = [(mt - i - 1, nt - 1) for i in range(mt)] + [(0, nt - i - 1) for i in range(1, nt)]
        ar = torch.arange(16, device=dev); r_, c_ = _rc(dev)
        for jm0, jn0 in starts:
            n_d = min(mt - jm0, jn0 + 1)
            jm = torch.arange(jm0, jm0 + n_d, device=dev); jn = torch.arange(jn0, jn0 - n_d, -1, device=dev)
            R = 16 * jm[:, None] + ar; Cc = 16 * jn[:, None] + ar   # [t, 16] rows / columns of each tile
            E = Wt - hat
            Lo_r = Lo[:, R].permute(1, 0, 2); Li_c = Li[:, Cc].permute(1, 0, 2)  # [t, N, 16], [t, K, 16]
            EL = E @ Li_c                                                      # [t, N, 16]: E Li[:, c]
            ti = torch.arange(n_d, device=dev)
            blk = Wt[R[:, :, None], Cc[:, None, :]] + Lo_r.mT @ EL + Lo_r.mT @ E[:, Cc].permute(1, 0, 2) + EL[ti[:, None], R]
            sc = s16[jn][:, None, None]
            st, v = yield (blk / sc)[:, r_, c_].float()
            states[jm, jn] = st
            hb = torch.zeros(n_d, 16, 16, dtype=dt, device=dev); hb[:, r_, c_] = v.to(dt)
            hat[R[:, :, None], Cc[:, None, :]] = hb * sc
    hat = hat.double()
    W_hat = rht(rht(hat, 0, bn) * post[:, None], 1, bk) * sg_in[None, :]
    desc = [1 if bn else 0, bn, 1, 1 if bk else 0, bk, 1, 0]
    return dict(states=states.cpu().numpy(), s16=s16.float().cpu().numpy(), pre=sg_in.float().cpu().numpy(),
                post=post.float().cpu().numpy(), desc=desc, k=k, W_hat=W_hat)


def quantize_many(jobs, k):
    """run _job generators in lockstep: every step, the tiles all live jobs want go to the card in ONE Viterbi call,
    so a card codes thousands of tiles at once instead of one column's 64-200 (the first canary: card at ~60 W of 450 W).
    Results in the jobs' order."""
    out = [None] * len(jobs); live = {}
    for i, g in enumerate(jobs):
        try: live[i] = next(g)
        except StopIteration as e: out[i] = e.value
    while live:
        ids = list(live); X = torch.cat([live[i] for i in ids]); n = [live[i].shape[0] for i in ids]
        st, v = quantize_tiles(X, k)
        o = 0
        for i, m in zip(ids, n):
            try: live[i] = jobs[i].send((st[o:o + m], v[o:o + m]))
            except StopIteration as e: out[i] = e.value; del live[i]
            o += m
    return out


def quantize_linear(W, k, H_in, H_out=None, seed=0, scale_mult=1.0, step=None):
    """W [N, K] float, H_in [K, K] (and H_out [N, N] for YAQA) -> dict with the file's parts and W_hat in W's basis.
    The trellis tiles are coded one 16 x 16 tile at a time in YAQA's anti-diagonal order (H_out None: one input-tile
    column at a time, LDLQ)."""
    return quantize_many([_job(W, k, H_in, H_out, seed, scale_mult)], k)[0]


def dequantize(words, k, K, N, s16, pre, post, desc):
    """numpy W (N x K) from a coded linear, as ggml_trellis_dequantize (no gathers; sides kind 0 or 1)"""
    Wh = torch.from_numpy(C.decode(words, k, K, N, s16)).double()
    Wh = rht(Wh, 1, desc[4] if desc[3] == 1 else 0) * torch.from_numpy(pre).double()[None, :]
    Wh = rht(Wh, 0, desc[1] if desc[0] == 1 else 0) * torch.from_numpy(post).double()[:, None]
    return Wh.numpy()
