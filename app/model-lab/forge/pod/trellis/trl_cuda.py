"""The tail-biting Viterbi of trl_quant.py as one CUDA kernel (a block per 16 x 16 tile), so trellis coding runs at card
speed: the torch version walks 256 steps of [tiles, 65536] tensors and is bound by memory traffic. Same algorithm and
cost as trl_quant.viterbi / quantize_tiles (the tests compare the two on the pod; ties may pick other states of equal
cost). Built with torch's load_inline on first use (needs nvcc, which the pods have for llama.cpp). Costs over the last
16 - k bits live in shared memory (float32), new costs in registers (so one 64 KB array fits every card from sm_80 on), the back pointers in
global scratch (256 x 2^(16-k) bytes a tile), tiles in chunks so the scratch stays under --scratch-gb. k = 1..6: at
k = 1 the 2^15 costs (128 KB) don't fit shared memory on most cards, so they sit in a global scratch row per tile (L2).
Kernel layout after exllamav3's quantize_tiles_kernel (MIT, turboderp), rewritten for Nari's INT8 grid and float costs.
28 Nov 2026 (thread "Shrink Flash-Next with GPTQ and trellis")."""
import torch

SRC = r"""
#include <torch/extension.h>
#include <cuda_runtime.h>
#include <c10/cuda/CUDAStream.h>

__device__ __forceinline__ float trl_grid(uint32_t s) {
    const uint32_t x = s * 0x83DCD12Du;
    return (float) ((int) (((x >> 2) & 63) + ((x >> 10) & 63) + ((x >> 18) & 63) + ((x >> 26) & 63)) - 126);
}

// NT threads a block, MINB blocks an SM: __launch_bounds__ holds the registers to 64 K / (NT x MINB) a thread; with no
// bound the kernel takes ~255 and a 512-thread launch fails with "too many resources requested" (first canary, 28 Nov).
// Which shape is fastest depends on the card, so trl_selftest.py times them all on the pod (tune()).
// one block per tile; X [T, 256] targets in grid units; start [T] (-1: free ends); states [T, 256] out; cost [T] out
template <int K, int NT, int MINB>
__global__ void __launch_bounds__(NT, MINB) viterbi_kernel(const float * __restrict__ X, const int * __restrict__ start, int16_t * __restrict__ states,
                               float * __restrict__ cost_out, uint8_t * __restrict__ back_all, float * __restrict__ cost_all) {
    constexpr int LO = 16 - K, NJ = 1 << LO, NH = 1 << K, PER = NJ / NT;
    extern __shared__ float c_shm[];  // one cost array (64 KB at k = 2): each step's new costs wait in registers
    float * c_old = K == 1 ? cost_all + (size_t) blockIdx.x * NJ : c_shm;  // k = 1: 128 KB, in global scratch
    __shared__ float xs[256];
    __shared__ float red_v[32]; __shared__ int red_i[32];
    const int t = blockIdx.x, tid = threadIdx.x, nt = NT;
    uint8_t * back = back_all + (size_t) t * 256 * NJ;
    for (int i = tid; i < 256; i += nt) xs[i] = X[(size_t) t * 256 + i];
    __syncthreads();
    const int c = start[t];
    // position 0: s0 = (h << LO) | j; with tied ends s0 >> K must equal c
    for (int j = tid; j < NJ; j += nt) {
        float best = INFINITY; int bh = 0;
        for (int h = 0; h < NH; ++h) {
            const uint32_t s = ((uint32_t) h << LO) | j;
            if (c >= 0 && (int) (s >> K) != c) continue;
            const float d = xs[0] - trl_grid(s), v = d * d;
            if (v < best) { best = v; bh = h; }
        }
        c_old[j] = best; back[j] = (uint8_t) bh;
    }
    __syncthreads();
    for (int p = 1; p < 256; ++p) {
        const float x = xs[p];
        float nv[PER];
        #pragma unroll
        for (int q = 0; q < PER; ++q) {
            const int j = tid + q * NT;
            float best = INFINITY; int bh = 0;
            #pragma unroll
            for (int h = 0; h < NH; ++h) {
                const uint32_t s = ((uint32_t) h << LO) | j;
                const float d = x - trl_grid(s), v = c_old[s >> K] + d * d;
                if (v < best) { best = v; bh = h; }
            }
            nv[q] = best; back[(size_t) p * NJ + j] = (uint8_t) bh;
        }
        __syncthreads();
        #pragma unroll
        for (int q = 0; q < PER; ++q) c_old[tid + q * NT] = nv[q];
        __syncthreads();
    }
    // the end: free, or the last state's low LO bits = c
    float best = INFINITY; int bj = 0;
    if (c >= 0) { if (tid == 0) { best = c_old[c]; bj = c; } }
    else for (int j = tid; j < NJ; j += nt) if (c_old[j] < best) { best = c_old[j]; bj = j; }
    for (int o = 16; o; o >>= 1) {
        const float ov = __shfl_down_sync(0xffffffff, best, o); const int oj = __shfl_down_sync(0xffffffff, bj, o);
        if (ov < best || (ov == best && oj < bj)) { best = ov; bj = oj; }
    }
    if ((tid & 31) == 0) { red_v[tid >> 5] = best; red_i[tid >> 5] = bj; }
    __syncthreads();
    if (tid == 0) {
        for (int w = 1; w < nt / 32; ++w) if (red_v[w] < best || (red_v[w] == best && red_i[w] < bj)) { best = red_v[w]; bj = red_i[w]; }
        cost_out[t] = best;
        int j = bj;
        for (int p = 255; p >= 0; --p) {
            const uint32_t s = ((uint32_t) back[(size_t) p * NJ + j] << LO) | j;
            states[(size_t) t * 256 + p] = (int16_t) s;
            j = (int) (s >> K);
        }
    }
}

template <int K, int NT, int MINB>
static void run_k(torch::Tensor X, torch::Tensor start, torch::Tensor states, torch::Tensor cost, torch::Tensor back, torch::Tensor cscr) {
    const int T = X.size(0);
    auto stream = c10::cuda::getCurrentCUDAStream();
    const size_t shm = K == 1 ? 0 : (1 << (16 - K)) * sizeof(float);
    cudaFuncSetAttribute(viterbi_kernel<K, NT, MINB>, cudaFuncAttributeMaxDynamicSharedMemorySize, (int) shm);
    viterbi_kernel<K, NT, MINB><<<T, NT, shm, stream>>>(X.data_ptr<float>(), start.data_ptr<int>(), (int16_t *) states.data_ptr<int16_t>(),
        cost.data_ptr<float>(), back.data_ptr<uint8_t>(), cscr.data_ptr<float>());
}

// variant v: 0 = 512 threads, 1 = 1024 threads, 2 = 256 threads x 2 blocks, 3 = 512 threads x 2 blocks
template <int K>
static void run_v(int v, torch::Tensor X, torch::Tensor start, torch::Tensor states, torch::Tensor cost, torch::Tensor back, torch::Tensor cscr) {
    switch (v) { case 0: run_k<K, 512, 1>(X, start, states, cost, back, cscr); break; case 1: run_k<K, 1024, 1>(X, start, states, cost, back, cscr); break;
                 case 2: run_k<K, 256, 2>(X, start, states, cost, back, cscr); break; case 3: run_k<K, 512, 2>(X, start, states, cost, back, cscr); break;
                 default: TORCH_CHECK(false, "trl_cuda: variant must be 0..3"); }
}

void viterbi(torch::Tensor X, torch::Tensor start, torch::Tensor states, torch::Tensor cost, torch::Tensor back, torch::Tensor cscr, int64_t k, int64_t v) {
    switch (k) { case 1: run_v<1>(v, X, start, states, cost, back, cscr); break; case 2: run_v<2>(v, X, start, states, cost, back, cscr); break;
                 case 3: run_v<3>(v, X, start, states, cost, back, cscr); break; case 4: run_v<4>(v, X, start, states, cost, back, cscr); break;
                 case 5: run_v<5>(v, X, start, states, cost, back, cscr); break; case 6: run_v<6>(v, X, start, states, cost, back, cscr); break;
                 default: TORCH_CHECK(false, "trl_cuda: k must be 1..6"); }
    const cudaError_t err = cudaGetLastError();
    TORCH_CHECK(err == cudaSuccess, "trl_cuda: kernel launch failed: ", cudaGetErrorString(err));
}
"""
CPP = "void viterbi(torch::Tensor X, torch::Tensor start, torch::Tensor states, torch::Tensor cost, torch::Tensor back, torch::Tensor cscr, int64_t k, int64_t v);"
VARIANTS = {0: "512 threads", 1: "1024 threads", 2: "256 threads x 2 blocks", 3: "512 threads x 2 blocks"}
_mod = None
_tune = None   # {k: variant} from trl_selftest.py (TRL_TUNE=<json>), else variant 0
_grid = {}


def variant(k):
    global _tune
    if _tune is None:
        import json, os
        p = os.environ.get("TRL_TUNE")
        _tune = {int(a): int(b) for a, b in json.load(open(p)).items()} if p and os.path.exists(p) else {}
    return _tune.get(k, 0)


def module():
    global _mod
    if _mod is None:
        from torch.utils.cpp_extension import load_inline
        _mod = load_inline("trl_viterbi", cpp_sources=CPP, cuda_sources=SRC, functions=["viterbi"],
                           extra_cuda_cflags=["-O3"], verbose=False)
    return _mod


def viterbi(X, k, start=None, scratch_gb=4.0, v=None):
    """X [B, 256] float32 on a card -> (states int64 [B, 256], cost [B]); start [B] or None as trl_quant.viterbi"""
    B = X.shape[0]; dev = X.device; lo = 16 - k
    per = 256 * (1 << lo) + (4 << lo if k == 1 else 0); chunk = max(1, min(B, int(scratch_gb * 1e9 // per)))
    st = torch.empty(B, 256, dtype=torch.int16, device=dev); cost = torch.empty(B, dtype=torch.float32, device=dev)
    sv = (start.to(torch.int32) if start is not None else torch.full((B,), -1, dtype=torch.int32, device=dev)).contiguous()
    back = torch.empty(chunk * 256 * (1 << lo), dtype=torch.uint8, device=dev)
    cscr = torch.empty(chunk * (1 << lo) if k == 1 else 1, dtype=torch.float32, device=dev)
    Xc = X.float().contiguous()
    for i in range(0, B, chunk):
        e = min(B, i + chunk)
        module().viterbi(Xc[i:e], sv[i:e], st[i:e], cost[i:e], back, cscr, k, variant(k) if v is None else v)
    return st.long() & 0xFFFF, cost


def quantize_tiles(X, k, grid, v=None):
    st, _ = viterbi(X, k, v=v)
    c = st[:, 255] & ((1 << (16 - k)) - 1)
    st, _ = viterbi(X, k, start=c, v=v)
    g = _grid.get(X.device)
    if g is None: g = _grid[X.device] = grid.to(X.device)  # once per card, not a copy per call
    return st, g[st]
