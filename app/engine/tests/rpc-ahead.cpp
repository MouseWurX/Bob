// Read ahead (Brain Engine 0011): one graph on a lent card, three results read back after every compute, the way a
// brain split over two cards does it. Checks every value, also when the reads change, and times the words.
#include "ggml.h"
#include "ggml-impl.h"
#include "ggml-alloc.h"
#include "ggml-backend.h"
#include "ggml-rpc.h"
#include <cstdio>
#include <cstdlib>
#include <vector>
#include <chrono>
int main(int argc, char ** argv) {
    const char * ep = argc > 1 ? argv[1] : "127.0.0.1:50052";
    int words = argc > 2 ? atoi(argv[2]) : 200;
    const int N = 2048;
    ggml_backend_t be = ggml_backend_rpc_init(ep, 0);
    if (!be) { printf("FAIL no backend\n"); return 1; }
    ggml_init_params ip = { ggml_tensor_overhead() * 32 + ggml_graph_overhead(), nullptr, true };
    ggml_context * ctx = ggml_init(ip);
    ggml_tensor * s = ggml_new_tensor_1d(ctx, GGML_TYPE_F32, N);
    ggml_tensor * o[3] = { ggml_scale(ctx, s, 2.0f), ggml_scale(ctx, s, 3.0f), ggml_scale(ctx, s, 5.0f) };
    const float mul[3] = { 2.0f, 3.0f, 5.0f };
    ggml_backend_buffer_t buf = ggml_backend_alloc_ctx_tensors(ctx, be);
    if (!buf) { printf("FAIL alloc\n"); return 1; }
    ggml_cgraph * gf = ggml_new_graph(ctx);
    for (auto * t : o) ggml_build_forward_expand(gf, t);
    gf->uid = 0x5c07a11ull; // any id of its own: the card keeps the graph and is asked to run it again
    std::vector<float> sv(N), got(N); bool all = true; int bad = 0;
    auto word = [&](int k, int n_read, bool reversed) {
        for (int i = 0; i < N; i++) sv[i] = (float) (k * 7 + i);
        ggml_backend_tensor_set(s, sv.data(), 0, sizeof(float) * N);
        if (ggml_backend_graph_compute(be, gf) != GGML_STATUS_SUCCESS) { all = false; return; }
        for (int j = 0; j < n_read; j++) {
            const int q = reversed ? n_read - 1 - j : j;
            ggml_backend_tensor_get(o[q], got.data(), 0, sizeof(float) * N);
            for (int i = 0; i < N; i++) if (got[i] != sv[i] * mul[q]) { all = false; bad++; break; }
        }
    };
    auto t0 = std::chrono::steady_clock::now();
    for (int k = 0; k < words; k++) word(k, 3, false);
    double ws = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    printf("%s %d words, three results each: %.1f words a second\n", all ? "ok  " : "FAIL", words, words / ws);
    // the reads change: fewer, another order, part of a tensor, and a tensor written over after it was asked for ahead
    for (int k = 0; k < 6; k++) word(1000 + k, 2, false);
    for (int k = 0; k < 6; k++) word(2000 + k, 3, true);
    for (int k = 0; k < 6; k++) word(3000 + k, 3, false);
    {
        std::vector<float> mine(N, 42.0f);
        ggml_backend_tensor_set(o[1], mine.data(), 0, sizeof(float) * N); // after the compute, before the read
        ggml_backend_tensor_get(o[1], got.data(), 0, sizeof(float) * N);
        for (int i = 0; i < N; i++) if (got[i] != 42.0f) { all = false; bad++; break; }
        ggml_backend_tensor_get(o[0], got.data(), sizeof(float) * 8, sizeof(float) * 16);
        for (int i = 0; i < 16; i++) if (got[i] != sv[i + 8] * 2.0f) { all = false; bad++; break; }
    }
    for (int k = 0; k < 6; k++) word(4000 + k, 3, false);
    printf("%s changed reads, a part read, and a result written over before it was read (%d wrong)\n", all ? "ok  " : "FAIL", bad);
    ggml_backend_buffer_free(buf); ggml_free(ctx); ggml_backend_free(be);
    return all ? 0 : 1;
}
