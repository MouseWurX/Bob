"""Nari's trellis tile format (Lamplight 0136, GGML_TYPE_TRL1..6) in numpy/torch: the INT8 grid, the ring order and the
packed words, written to match ggml/src/ggml-trellis.cpp ggml_trellis_decode_rows bit for bit (test: trl_check.c).

A coded weight W^ is N x K (N outputs, K inputs) in 16 x 16 tiles. Tile (J, i) (J = output tile, i = input tile) is a
ring of 256 positions; position p's 16-bit state is the window of the tile's circular bit stream that ends at bit
(p + 1) k (k = bits per weight), so each position adds k new low bits (tail-biting). Its value is grid(state) x s16[i]:
grid(s) = sum of the top 6 bits of each byte of s x 0x83DCD12D, minus 126 (an integer in -126..126, near-Gaussian, sd ~37).
The words of tile (J, i) are 8 k uint32 at (J x K/16 + i) x 8 k; stream bit q is bit 31 - q % 32 of word q / 32.
28 Nov 2026, for the trellis + YAQA comparison (thread "Shrink Flash-Next with GPTQ and trellis").
"""
import numpy as np

GRID_SD = None  # filled below


def grid_of(states):
    x = (np.asarray(states).astype(np.uint64) & 0xFFFF) * np.uint64(0x83DCD12D) & np.uint64(0xFFFFFFFF)
    return (sum(((x >> np.uint64(s)) & np.uint64(63)) for s in (2, 10, 18, 26)).astype(np.int64) - 126)


GRID = grid_of(np.arange(1 << 16)).astype(np.float32)  # value of every 16-bit state
GRID_SD = float(GRID.std())


def ring_rc():
    """(256,) row (output) and column (input) within the tile of ring position p (exllamav3's tensor-core order)."""
    p = np.arange(256); a, jj = p >> 3, p & 7
    return (a >> 2) + 8 * ((jj >> 2) & 1), 2 * (a & 3) + (jj & 1) + 8 * ((jj >> 1) & 1)


ROW, COL = ring_rc()


def check_tail_biting(states, k):
    """every window's top 16 - k bits are the previous window's low 16 - k bits (circularly)"""
    s = np.asarray(states).astype(np.int64).reshape(-1, 256)
    prev = np.roll(s, 1, axis=1)
    return bool(((prev & ((1 << (16 - k)) - 1)) == (s >> k)).all())


def pack(states, k):
    """(..., 256) tail-biting windows -> (..., 8 k) uint32 words: the stream is each window's low k bits in order"""
    s = np.asarray(states).astype(np.uint32)
    lead = s.shape[:-1]; s = s.reshape(-1, 256)
    bits = np.zeros((s.shape[0], 256 * k), np.uint8)
    for b in range(k):  # position p's new bits are stream bits [p k, (p + 1) k), MSB first
        bits[:, np.arange(256) * k + b] = (s >> (k - 1 - b)) & 1
    w = np.packbits(bits, axis=1).reshape(s.shape[0], 8 * k, 4)
    words = (w[..., 0].astype(np.uint32) << 24) | (w[..., 1].astype(np.uint32) << 16) | (w[..., 2].astype(np.uint32) << 8) | w[..., 3]
    return words.reshape(lead + (8 * k,))


def unpack(words, k):
    """(..., 8 k) uint32 -> (..., 256) windows, as the decoder reads them"""
    w = np.asarray(words).astype(np.uint64); lead = w.shape[:-1]; w = w.reshape(-1, 8 * k)
    nw, total = 8 * k, 256 * k
    out = np.empty((w.shape[0], 256), np.uint32)
    for p in range(256):
        start = ((p + 1) * k - 16 + total) % total; i, o = start >> 5, start & 31
        pair = (w[:, i] << np.uint64(32)) | w[:, (i + 1) % nw]
        out[:, p] = (pair >> np.uint64(48 - o)) & np.uint64(0xFFFF)
    return out.reshape(lead + (256,))


def tiles_to_words(states, k):
    """states [N/16, K/16, 256] (tile (J, i), ring order) -> the tensor's uint32 words in file order"""
    return pack(states, k).reshape(-1)


def decode(words, k, K, N, s16=None):
    """W^ (N x K float32) from the file's words, as ggml_trellis_decode_rows"""
    nt, kt = N // 16, K // 16
    st = unpack(np.asarray(words, np.uint32).reshape(nt * kt, 8 * k), k).reshape(nt, kt, 256)
    v = GRID[st]  # [nt, kt, 256]
    if s16 is not None:
        v = v * np.asarray(s16, np.float32)[None, :, None]
    out = np.zeros((nt, 16, kt, 16), np.float32)
    out[:, ROW, :, COL] = v.transpose(2, 0, 1)
    return out.reshape(N, K)


def tiles_of(W):
    """N x K matrix -> [N/16, K/16, 256] in ring order (the order the Viterbi walks a tile)"""
    N, K = W.shape
    t = np.asarray(W).reshape(N // 16, 16, K // 16, 16)
    return t[:, ROW, :, COL].transpose(1, 2, 0)
