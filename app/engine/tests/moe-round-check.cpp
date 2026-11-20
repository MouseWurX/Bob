// Brain Engine 0040 check: an expert product marked for the card's rounding (op_params[0] = 1, the expert cache's
// processor part) must round its input in blocks of 32 (q8_0, as a CUDA card's q8_1) and not in the k-quants' blocks of
// 256 (q8_K). The reference is worked out here in double: the weights turned to floats, the input rounded to q8_0 and
// back, rounded by the loaded CPU part itself (its fast rounding can differ from the plain one in the last bit).
// Builds against ggml only:   moe-round-check
// Prints one line per check, PASS or FAIL, then ALL PASS or N FAILED.
#include "ggml.h"
#include "ggml-alloc.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <random>
#include <vector>

static int fails = 0;
static void check(const char * name, bool ok, double a = 0, double b = 0) {
    printf("%s %s", ok ? "PASS" : "FAIL", name);
    if (!ok) printf(" (%g, %g)", a, b);
    printf("\n");
    fails += !ok;
}

struct out { std::vector<float> y; };

// y[n_ff, n_used, n_tok] = mul_mat_id(w[n_embd, n_ff, n_exp], x[n_embd, n_used, n_tok], ids[n_used, n_tok])
static std::vector<float> run(ggml_type t, const std::vector<uint8_t> & wq, const std::vector<float> & x, const std::vector<int32_t> & ids,
                              int n_embd, int n_ff, int n_exp, int n_used, int n_tok, bool card, int threads) {
    ggml_init_params ip = { 64*ggml_tensor_overhead() + ggml_graph_overhead(), nullptr, true };
    ggml_context * ctx = ggml_init(ip);
    ggml_tensor * w = ggml_new_tensor_3d(ctx, t, n_embd, n_ff, n_exp);
    ggml_tensor * b = ggml_new_tensor_3d(ctx, GGML_TYPE_F32, n_embd, n_used, n_tok);
    ggml_tensor * id = ggml_new_tensor_2d(ctx, GGML_TYPE_I32, n_used, n_tok);
    ggml_tensor * y = ggml_mul_mat_id(ctx, w, b, id);
    if (card) { const int32_t one = 1; memcpy(y->op_params, &one, sizeof(one)); }
    ggml_cgraph * gf = ggml_new_graph(ctx);
    ggml_build_forward_expand(gf, y);
    // Through the backend registry, so it also runs where the CPU part is a loadable DLL (the Windows zip): there
    // ggml_backend_cpu_init is not in ggml.dll, and the best ggml-cpu variant for this processor is the one loaded.
    ggml_backend_t be = ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_CPU, nullptr);
    if (!be) { printf("FAIL no CPU backend found beside this program\n"); exit(1); }
    {
        ggml_backend_reg_t reg = ggml_backend_dev_backend_reg(ggml_backend_get_device(be));
        auto set_threads = (ggml_backend_set_n_threads_t) ggml_backend_reg_get_proc_address(reg, "ggml_backend_set_n_threads");
        if (set_threads) set_threads(be, threads);
    }
    ggml_backend_buffer_t buf = ggml_backend_alloc_ctx_tensors(ctx, be);
    ggml_backend_tensor_set(w, wq.data(), 0, wq.size());
    ggml_backend_tensor_set(b, x.data(), 0, x.size()*sizeof(float));
    ggml_backend_tensor_set(id, ids.data(), 0, ids.size()*sizeof(int32_t));
    ggml_backend_graph_compute(be, gf);
    std::vector<float> r(ggml_nelements(y));
    ggml_backend_tensor_get(y, r.data(), 0, r.size()*sizeof(float));
    ggml_backend_buffer_free(buf);
    ggml_backend_free(be);
    ggml_free(ctx);
    return r;
}

// The input rounded to q8_0 by the loaded CPU part itself (a copy step), so the reference uses the same rounding as
// the marked product: the processor's fast rounding (AVX2, AVX-512) can differ from ggml's plain one in the last bit.
static std::vector<uint8_t> cpu_q8_0(const std::vector<float> & x, int n_embd, int rows) {
    ggml_init_params ip = { 8*ggml_tensor_overhead() + ggml_graph_overhead(), nullptr, true };
    ggml_context * ctx = ggml_init(ip);
    ggml_tensor * a = ggml_new_tensor_2d(ctx, GGML_TYPE_F32, n_embd, rows);
    ggml_tensor * q = ggml_new_tensor_2d(ctx, GGML_TYPE_Q8_0, n_embd, rows);
    ggml_tensor * c = ggml_cpy(ctx, a, q);
    ggml_cgraph * gf = ggml_new_graph(ctx);
    ggml_build_forward_expand(gf, c);
    ggml_backend_t be = ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_CPU, nullptr);
    if (!be) { printf("FAIL no CPU backend found beside this program\n"); exit(1); }
    ggml_backend_buffer_t buf = ggml_backend_alloc_ctx_tensors(ctx, be);
    ggml_backend_tensor_set(a, x.data(), 0, x.size()*sizeof(float));
    ggml_backend_graph_compute(be, gf);
    std::vector<uint8_t> r(ggml_nbytes(q));
    ggml_backend_tensor_get(q, r.data(), 0, r.size());
    ggml_backend_buffer_free(buf);
    ggml_backend_free(be);
    ggml_free(ctx);
    return r;
}

int main() {
    ggml_backend_load_all();
    const int n_embd = 512, n_ff = 64, n_exp = 8, n_used = 2, n_tok = 24;
    std::mt19937 rng(7);
    std::normal_distribution<float> nd(0.0f, 1.0f);
    std::student_t_distribution<float> td(3.0f);
    std::vector<float> wf((size_t) n_embd*n_ff*n_exp);
    for (auto & v : wf) v = 0.02f*nd(rng);
    // the input: heavy tails and a few big channels, as a brain's are
    std::vector<float> x((size_t) n_embd*n_used*n_tok);
    for (size_t i = 0; i < x.size(); i++) x[i] = td(rng) * ((i % n_embd) % 97 == 5 ? 20.0f : 1.0f);
    std::vector<int32_t> ids((size_t) n_used*n_tok);
    for (int j = 0; j < n_tok; j++) for (int u = 0; u < n_used; u++) ids[j*n_used + u] = (j == 3 && u == 1) ? -1 : (int) ((j*3 + u*5) % n_exp);

    // the input rounded the card's way, and back to floats
    const std::vector<uint8_t> xq = cpu_q8_0(x, n_embd, n_used*n_tok);
    std::vector<float> x32(x.size());
    ggml_get_type_traits(GGML_TYPE_Q8_0)->to_float(xq.data(), x32.data(), (int64_t) x.size());

    for (ggml_type t : { GGML_TYPE_Q4_K, GGML_TYPE_Q5_K, GGML_TYPE_Q6_K, GGML_TYPE_Q3_K, GGML_TYPE_Q2_K }) {
        const char * tn = ggml_type_name(t);
        std::vector<uint8_t> wq(ggml_row_size(t, n_embd) * n_ff * n_exp);
        ggml_quantize_chunk(t, wf.data(), wq.data(), 0, n_ff*n_exp, n_embd, nullptr);
        std::vector<float> wd(wf.size());
        ggml_get_type_traits(t)->to_float(wq.data(), wd.data(), (int64_t) wd.size());

        // references in double: with the card's rounding (x32) and exact (x)
        std::vector<double> ref32((size_t) n_ff*n_used*n_tok, 0.0), exact(ref32.size(), 0.0);
        for (int j = 0; j < n_tok; j++) for (int u = 0; u < n_used; u++) {
            const int e = ids[j*n_used + u];
            if (e < 0) continue;
            for (int r = 0; r < n_ff; r++) {
                double s = 0, s2 = 0;
                for (int k = 0; k < n_embd; k++) {
                    const double wv = wd[((size_t) e*n_ff + r)*n_embd + k];
                    s  += wv * x32[((size_t) j*n_used + u)*n_embd + k];
                    s2 += wv * x[((size_t) j*n_used + u)*n_embd + k];
                }
                ref32[((size_t) j*n_used + u)*n_ff + r] = s;
                exact[((size_t) j*n_used + u)*n_ff + r] = s2;
            }
        }
        auto rel = [&](const std::vector<float> & a, const std::vector<double> & ref) {
            double num = 0, den = 0;
            for (size_t i = 0; i < a.size(); i++) { num += (a[i] - ref[i])*(a[i] - ref[i]); den += ref[i]*ref[i]; }
            return std::sqrt(num / (den > 0 ? den : 1));
        };
        const auto on  = run(t, wq, x, ids, n_embd, n_ff, n_exp, n_used, n_tok, true, 1);
        const auto on4 = run(t, wq, x, ids, n_embd, n_ff, n_exp, n_used, n_tok, true, 4);
        const auto off = run(t, wq, x, ids, n_embd, n_ff, n_exp, n_used, n_tok, false, 4);
        char name[160];
        snprintf(name, sizeof name, "%s: marked, rounds in blocks of 32 like the card (matches the reference)", tn);
        check(name, rel(on, ref32) < 2e-6, rel(on, ref32));
        snprintf(name, sizeof name, "%s: unmarked, the usual blocks of 256 (differs from it)", tn);
        check(name, rel(off, ref32) > 1e-4, rel(off, ref32));
        snprintf(name, sizeof name, "%s: four threads give the same numbers as one", tn);
        check(name, on == on4);
        snprintf(name, sizeof name, "%s: closer to the exact product than the usual rounding", tn);
        check(name, rel(on, exact) < rel(off, exact), rel(on, exact), rel(off, exact));
        bool zero = true;
        for (int r = 0; r < n_ff; r++) zero = zero && on[((size_t) 3*n_used + 1)*n_ff + r] == 0.0f;
        snprintf(name, sizeof name, "%s: a slot with no expert (-1) gives zeros", tn);
        check(name, zero);
        printf("     %s error against exact: card rounding %.5f, usual %.5f\n", tn, rel(on, exact), rel(off, exact));
    }
    // a type whose input is already rounded in blocks of 32 (q8_0) is left to the usual path: same numbers either way
    {
        std::vector<uint8_t> wq(ggml_row_size(GGML_TYPE_Q4_0, n_embd) * n_ff * n_exp);
        ggml_quantize_chunk(GGML_TYPE_Q4_0, wf.data(), wq.data(), 0, n_ff*n_exp, n_embd, nullptr);
        const auto on  = run(GGML_TYPE_Q4_0, wq, x, ids, n_embd, n_ff, n_exp, n_used, n_tok, true, 4);
        const auto off = run(GGML_TYPE_Q4_0, wq, x, ids, n_embd, n_ff, n_exp, n_used, n_tok, false, 4);
        check("q4_0: already blocks of 32, the mark changes nothing", on == off);
    }
    if (fails) printf("%d FAILED\n", fails); else printf("ALL PASS\n");
    return fails ? 1 : 0;
}
