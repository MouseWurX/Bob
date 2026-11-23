// Brain Engine 0045 check: flash attention that also hands back each row's log-sum-exp (ggml_flash_attn_ext_with_lse),
// on the processor. Progressive Memory (0039) writes one word as one attention per part (the main cache, then each
// sharp ring) and weights the parts by the softmax of their log-sum-exps; 0039 worked those out from a second pass
// over each part's K, 0045 takes them from the flash attention itself. Checks:
//   - the attention result is the same numbers as plain flash attention, for f16, q8_0 and q3_0 K/V, one row, two
//     rows and a batch of 40 (the tiled path), with and without a sink, one thread and four;
//   - the log-sum-exp matches 0039's (the same graph: scores, scale, mask, max, exp, sum, log) and one worked out
//     here in double from the stored K;
//   - a main part and a ring merged with it give the same answer as with 0039's numbers, and as attention over every
//     word worked out in double;
//   - timing: one word over a q3_0 main cache of 16K to 64K words plus a q8_0 ring of 8K, 0039's way against 0045's.
//     The time 0039 adds on top of plain attention grows with the main cache; 0045's does not.
// Builds against ggml only:   fa-lse-check [timing: 0 or 1, default 1]
// Prints one line per check, PASS or FAIL, then ALL PASS or N FAILED.
#include "ggml.h"
#include "ggml-alloc.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include <algorithm>
#include <chrono>
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
    fflush(stdout);
    fails += !ok;
}

static ggml_backend_t g_be = nullptr;
static void set_threads(int n) {
    ggml_backend_reg_t reg = ggml_backend_dev_backend_reg(ggml_backend_get_device(g_be));
    auto fn = (ggml_backend_set_n_threads_t) ggml_backend_reg_get_proc_address(reg, "ggml_backend_set_n_threads");
    if (fn) fn(g_be, n);
}

// one part of the chat memory in the cache's own layout: K, V [D, H_kv, N] of one type, a mask row per query row
struct part {
    ggml_type type;
    int N;
    std::vector<uint8_t> k, v;      // stored bytes
    std::vector<float> kf, vf;      // the stored values turned back to floats, for the double reference
    std::vector<ggml_fp16_t> mask;  // [T, N]
};

static std::vector<uint8_t> store(ggml_type t, const std::vector<float> & x, int D, int rows, std::vector<float> & back, bool keep_back) {
    std::vector<uint8_t> q(ggml_row_size(t, D)*rows);
    if (t == GGML_TYPE_F16) {
        ggml_fp32_to_fp16_row(x.data(), (ggml_fp16_t *) q.data(), (int64_t) x.size());
    } else {
        ggml_quantize_chunk(t, x.data(), q.data(), 0, rows, D, nullptr);
    }
    if (!keep_back) {
        return q;
    }
    back.resize(x.size());
    ggml_get_type_traits(t)->to_float(q.data(), back.data(), (int64_t) x.size());
    return q;
}

static part make_part(ggml_type t, int D, int Hkv, int N, int T, std::mt19937 & rng, int hole0, int hole1, bool keep_back = true) {
    std::normal_distribution<float> nd(0.0f, 1.0f);
    part p; p.type = t; p.N = N;
    std::vector<float> k((size_t) D*Hkv*N), v((size_t) D*Hkv*N);
    for (auto & x : k) x = nd(rng);
    for (auto & x : v) x = nd(rng);
    p.k = store(t, k, D, Hkv*N, p.kf, keep_back);
    p.v = store(t, v, D, Hkv*N, p.vf, keep_back);
    p.mask.resize((size_t) T*N);
    for (int j = 0; j < T; ++j) {
        for (int i = 0; i < N; ++i) {
            // causal-ish: row j sees one more cell than row j-1; cells [hole0, hole1) are hidden (a ring holds them)
            const bool hidden = (i >= hole0 && i < hole1) || i > N - T + j;
            p.mask[(size_t) j*N + i] = ggml_fp32_to_fp16(hidden ? -INFINITY : 0.0f);
        }
    }
    return p;
}

struct result { std::vector<float> out, lse, lse_0039; double ms = 0; };

// the attention of q [D, H, T] over one part; with_lse: 0045's op, else plain flash attention plus 0039's scores pass
static result attend(const std::vector<float> & qv, int D, int H, int Hkv, int T, const part & p, float scale,
                     const float * sink, bool with_lse, bool scores_0039, int threads, int reps = 1) {
    ggml_init_params ip = { 256*ggml_tensor_overhead() + ggml_graph_overhead(), nullptr, true };
    ggml_context * ctx = ggml_init(ip);
    ggml_tensor * q = ggml_new_tensor_3d(ctx, GGML_TYPE_F32, D, H, T);
    ggml_tensor * k = ggml_new_tensor_3d(ctx, p.type, D, Hkv, p.N);
    ggml_tensor * v = ggml_new_tensor_3d(ctx, p.type, D, Hkv, p.N);
    ggml_tensor * m = ggml_new_tensor_2d(ctx, GGML_TYPE_F16, p.N, T);
    ggml_tensor * s = sink ? ggml_new_tensor_1d(ctx, GGML_TYPE_F32, H) : nullptr;
    ggml_tensor * qp = ggml_permute(ctx, q, 0, 2, 1, 3); // [D, T, H]
    ggml_tensor * kp = ggml_permute(ctx, k, 0, 2, 1, 3); // [D, N, Hkv]
    ggml_tensor * vp = ggml_permute(ctx, v, 0, 2, 1, 3);
    ggml_tensor * fa = with_lse ? ggml_flash_attn_ext_with_lse(ctx, qp, kp, vp, m, scale, 0.0f, 0.0f)
                                : ggml_flash_attn_ext(ctx, qp, kp, vp, m, scale, 0.0f, 0.0f);
    ggml_flash_attn_ext_add_sinks(fa, s);
    ggml_prec_set_acc(fa, GGML_PREC_F32);
    ggml_tensor * out = with_lse ? ggml_flash_attn_ext_get_out(ctx, fa) : fa;
    ggml_tensor * lse = with_lse ? ggml_flash_attn_ext_get_lse(ctx, fa) : nullptr;
    ggml_tensor * l39 = nullptr;
    if (scores_0039) {
        // 0039's pass, as in build_attn (one query row: T == 1)
        ggml_tensor * x = ggml_mul_mat(ctx, kp, qp); // [N, T, H]
        ggml_prec_set_acc(x, GGML_PREC_F32);
        x = ggml_scale(ctx, x, scale);
        x = ggml_add(ctx, x, ggml_cast(ctx, ggml_view_2d(ctx, m, p.N, 1, m->nb[1], 0), GGML_TYPE_F32));
        x = ggml_reshape_2d(ctx, x, p.N, x->ne[1]*x->ne[2]);
        ggml_tensor * c = ggml_clamp(ctx, ggml_pool_1d(ctx, x, GGML_OP_POOL_MAX, p.N, p.N, 0), -1e30f, 1e30f);
        ggml_tensor * e = ggml_exp(ctx, ggml_sub(ctx, x, c));
        l39 = ggml_add(ctx, ggml_log(ctx, ggml_sum_rows(ctx, e)), c); // [1, H]
    }
    ggml_tensor * out_c = ggml_cont(ctx, out);
    ggml_tensor * lse_c = lse ? ggml_cont(ctx, lse) : nullptr;
    ggml_cgraph * gf = ggml_new_graph(ctx);
    ggml_build_forward_expand(gf, out_c);
    if (lse_c) ggml_build_forward_expand(gf, lse_c);
    if (l39) ggml_build_forward_expand(gf, l39);
    ggml_backend_buffer_t buf = ggml_backend_alloc_ctx_tensors(ctx, g_be);
    ggml_backend_tensor_set(q, qv.data(), 0, qv.size()*sizeof(float));
    ggml_backend_tensor_set(k, p.k.data(), 0, p.k.size());
    ggml_backend_tensor_set(v, p.v.data(), 0, p.v.size());
    ggml_backend_tensor_set(m, p.mask.data(), 0, p.mask.size()*sizeof(ggml_fp16_t));
    if (s) ggml_backend_tensor_set(s, sink, 0, H*sizeof(float));
    set_threads(threads);
    result r;
    std::vector<double> times;
    for (int i = 0; i < reps; ++i) {
        const auto t0 = std::chrono::steady_clock::now();
        ggml_backend_graph_compute(g_be, gf);
        times.push_back(std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count());
    }
    r.ms = *std::min_element(times.begin(), times.end()); // the quickest run: the least disturbed by the rest of the machine
    r.out.resize(ggml_nelements(out_c));
    ggml_backend_tensor_get(out_c, r.out.data(), 0, r.out.size()*sizeof(float));
    if (lse_c) { r.lse.resize(ggml_nelements(lse_c)); ggml_backend_tensor_get(lse_c, r.lse.data(), 0, r.lse.size()*sizeof(float)); }
    if (l39) { r.lse_0039.resize(ggml_nelements(l39)); ggml_backend_tensor_get(l39, r.lse_0039.data(), 0, r.lse_0039.size()*sizeof(float)); }
    ggml_backend_buffer_free(buf);
    ggml_free(ctx);
    return r;
}

// in double from the stored K/V: each row's log-sum-exp (sink included) and the attention over several parts at once
static void reference(const std::vector<float> & qv, int D, int H, int Hkv, int T, const std::vector<const part *> & ps,
                      float scale, const float * sink, std::vector<double> & lse, std::vector<double> & out) {
    lse.assign((size_t) H*T, 0); out.assign((size_t) D*H*T, 0);
    for (int j = 0; j < T; ++j) for (int h = 0; h < H; ++h) {
        const int hk = h / (H/Hkv);
        std::vector<double> sc, w; std::vector<const float *> vr;
        for (const part * p : ps) for (int i = 0; i < p->N; ++i) {
            const float mv = ggml_fp16_to_fp32(p->mask[(size_t) j*p->N + i]);
            if (std::isinf(mv)) continue;
            const float * kr = p->kf.data() + ((size_t) i*Hkv + hk)*D;
            const float * qr = qv.data() + ((size_t) j*H + h)*D;
            double d = 0; for (int c = 0; c < D; ++c) d += (double) kr[c]*qr[c];
            sc.push_back(d*scale + mv);
            vr.push_back(p->vf.data() + ((size_t) i*Hkv + hk)*D);
        }
        double mx = sink ? sink[h] : -INFINITY; for (double x : sc) mx = std::max(mx, x);
        double sum = sink ? std::exp(sink[h] - mx) : 0;
        for (double x : sc) sum += std::exp(x - mx);
        lse[(size_t) j*H + h] = mx + std::log(sum);
        for (size_t i = 0; i < sc.size(); ++i) {
            const double a = std::exp(sc[i] - mx)/sum;
            for (int c = 0; c < D; ++c) out[((size_t) j*H + h)*D + c] += a*vr[i][c];
        }
    }
}

static double max_abs(const std::vector<float> & a, const std::vector<float> & b) {
    double m = 0; for (size_t i = 0; i < a.size(); ++i) m = std::max(m, (double) std::fabs(a[i] - b[i])); return m;
}
static double max_abs_d(const std::vector<float> & a, const std::vector<double> & b) {
    double m = 0; for (size_t i = 0; i < a.size(); ++i) m = std::max(m, std::fabs(a[i] - b[i])); return m;
}

int main(int argc, char ** argv) {
    const bool timing = argc < 2 || atoi(argv[1]) != 0;
    ggml_backend_load_all();
    g_be = ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_CPU, nullptr);
    if (!g_be) { printf("FAIL no processor backend\n"); return 1; }
    std::mt19937 rng(45);
    std::normal_distribution<float> nd(0.0f, 1.0f);

    // the processor says it can, through the same door the scheduler uses
    {
        ggml_init_params ip = { 16*ggml_tensor_overhead(), nullptr, true };
        ggml_context * cx = ggml_init(ip);
        ggml_tensor * q = ggml_new_tensor_3d(cx, GGML_TYPE_F32, 64, 1, 8);
        ggml_tensor * k = ggml_new_tensor_3d(cx, GGML_TYPE_Q3_0, 64, 256, 2);
        ggml_tensor * m = ggml_new_tensor_2d(cx, GGML_TYPE_F16, 256, 1);
        ggml_tensor * fa = ggml_flash_attn_ext_with_lse(cx, q, k, k, m, 0.125f, 0.0f, 0.0f);
        check("the processor takes flash attention with the log-sum-exp", ggml_backend_supports_op(g_be, fa));
        check("the result has one more slice, and the views are the usual result and [n_head, n_batch]",
              fa->ne[3] == 2 && ggml_flash_attn_ext_get_out(cx, fa)->ne[3] == 1 && ggml_flash_attn_ext_get_lse(cx, fa)->ne[0] == 8 &&
              ggml_flash_attn_ext_has_lse(fa) && !ggml_flash_attn_ext_has_lse(ggml_flash_attn_ext(cx, q, k, k, m, 0.125f, 0.0f, 0.0f)));
        ggml_free(cx);
    }

    const int D = 64, H = 8, Hkv = 2;
    const float scale = 1.0f/std::sqrt((float) D);
    for (ggml_type t : { GGML_TYPE_F16, GGML_TYPE_Q8_0, GGML_TYPE_Q3_0 }) {
        for (int T : { 1, 2, 40 }) {
            for (int N : { 256, 1024 }) {
                for (int with_sink = 0; with_sink < 2; ++with_sink) {
                    part p = make_part(t, D, Hkv, N, T, rng, N/4, N/2);
                    std::vector<float> qv((size_t) D*H*T); for (auto & x : qv) x = nd(rng);
                    std::vector<float> sink(H); for (auto & x : sink) x = nd(rng);
                    const float * sk = with_sink ? sink.data() : nullptr;
                    char name[256];
                    for (int threads : { 1, 4 }) {
                        result a = attend(qv, D, H, Hkv, T, p, scale, sk, false, T == 1, threads);
                        result b = attend(qv, D, H, Hkv, T, p, scale, sk, true, false, threads);
                        snprintf(name, sizeof(name), "%s T=%d N=%d sink=%d threads=%d: the result is plain flash attention's", ggml_type_name(t), T, N, with_sink, threads);
                        check(name, max_abs(a.out, b.out) == 0.0, max_abs(a.out, b.out));
                        std::vector<double> rl, ro;
                        reference(qv, D, H, Hkv, T, { &p }, scale, sk, rl, ro);
                        // the processor rounds Q to K's dot type (f16 or q8_0) before the scores; so does 0039's pass
                        const double tol = t == GGML_TYPE_F16 ? 2e-3 : 3e-2;
                        snprintf(name, sizeof(name), "%s T=%d N=%d sink=%d threads=%d: log-sum-exp within %g of double", ggml_type_name(t), T, N, with_sink, threads, tol);
                        check(name, max_abs_d(b.lse, rl) < tol, max_abs_d(b.lse, rl));
                        if (T == 1 && !with_sink) {
                            snprintf(name, sizeof(name), "%s N=%d threads=%d: log-sum-exp within 2e-5 of 0039's", ggml_type_name(t), N, threads);
                            check(name, max_abs(b.lse, a.lse_0039) < 2e-5, max_abs(b.lse, a.lse_0039));
                        }
                    }
                }
            }
        }
    }

    // a q3_0 main cache with the ring's cells cut out, and a q8_0 ring with the newest words: merged
    {
        const int Nm = 2048, Nr = 256;
        part pm = make_part(GGML_TYPE_Q3_0, D, Hkv, Nm, 1, rng, Nm - Nr, Nm);
        part pr = make_part(GGML_TYPE_Q8_0, D, Hkv, Nr, 1, rng, 0, 0);
        std::vector<float> qv((size_t) D*H); for (auto & x : qv) x = 2.0f*nd(rng);
        std::vector<float> floor_sink(H, -1e30f);
        result m39 = attend(qv, D, H, Hkv, 1, pm, scale, floor_sink.data(), false, true, 4);
        result r39 = attend(qv, D, H, Hkv, 1, pr, scale, floor_sink.data(), false, true, 4);
        result m45 = attend(qv, D, H, Hkv, 1, pm, scale, floor_sink.data(), true, false, 4);
        result r45 = attend(qv, D, H, Hkv, 1, pr, scale, floor_sink.data(), true, false, 4);
        auto merge = [&](const result & a, const std::vector<float> & la, const result & b, const std::vector<float> & lb) {
            std::vector<float> o((size_t) D*H);
            for (int h = 0; h < H; ++h) {
                const double mx = std::max(la[h], lb[h]);
                const double wa = std::exp(la[h] - mx), wb = std::exp(lb[h] - mx);
                for (int c = 0; c < D; ++c) o[(size_t) h*D + c] = (float) ((wa*a.out[(size_t) h*D + c] + wb*b.out[(size_t) h*D + c])/(wa + wb));
            }
            return o;
        };
        std::vector<float> o39 = merge(m39, m39.lse_0039, r39, r39.lse_0039);
        std::vector<float> o45 = merge(m45, m45.lse, r45, r45.lse);
        std::vector<double> rl, ro;
        reference(qv, D, H, Hkv, 1, { &pm, &pr }, scale, nullptr, rl, ro);
        check("merged main + ring: 0045 within 1e-5 of 0039", max_abs(o39, o45) < 1e-5, max_abs(o39, o45));
        // the processor rounds Q to q8_0 for q3_0 and q8_0 K, in 0039's pass as in 0045's, so both sit a little off
        check("merged main + ring: within 1e-2 of attention over every word in double, and no further off than 0039",
              max_abs_d(o45, ro) < 1e-2 && max_abs_d(o45, ro) <= max_abs_d(o39, ro) + 1e-5, max_abs_d(o45, ro), max_abs_d(o39, ro));
        double sh = 0; for (int h = 0; h < H; ++h) sh += 1.0/(1.0 + std::exp(m45.lse[h] - r45.lse[h]));
        printf("  (the ring's mean share of the attention: %.2f)\n", sh/H);
    }

    if (timing) {
        // one word, a brain like Qwen 3.6 35B: 32 query heads, 4 K/V heads, head size 128; 4 threads
        const int TD = 128, TH = 32, THkv = 4, Nr = 8192;
        const float ts = 1.0f/std::sqrt((float) TD);
        std::vector<float> qv((size_t) TD*TH); for (auto & x : qv) x = nd(rng);
        std::vector<float> floor_sink(TH, -1e30f);
        part pr = make_part(GGML_TYPE_Q8_0, TD, THkv, Nr, 1, rng, 0, 0, false);
        printf("  main cache   plain q3_0   0039 (main+ring, ms)   0045 (main+ring, ms)   0039 over plain   0045 over plain\n");
        double add39_first = 0, add39_last = 0, add45_first = 0, add45_last = 0, t39_last = 0, t45_last = 0;
        const int sizes[] = { 16384, 32768, 65536 };
        for (int N : sizes) {
            part pm = make_part(GGML_TYPE_Q3_0, TD, THkv, N, 1, rng, N - Nr, N, false);
            const int reps = N >= 65536 ? 7 : 15;
            attend(qv, TD, TH, THkv, 1, pm, ts, floor_sink.data(), false, false, 4, 2); // warm up
            const double plain = attend(qv, TD, TH, THkv, 1, pm, ts, nullptr, false, false, 4, reps).ms;
            const double t39 = attend(qv, TD, TH, THkv, 1, pm, ts, floor_sink.data(), false, true, 4, reps).ms +
                               attend(qv, TD, TH, THkv, 1, pr, ts, floor_sink.data(), false, true, 4, reps).ms;
            const double t45 = attend(qv, TD, TH, THkv, 1, pm, ts, floor_sink.data(), true, false, 4, reps).ms +
                               attend(qv, TD, TH, THkv, 1, pr, ts, floor_sink.data(), true, false, 4, reps).ms;
            printf("  %10d   %10.2f   %20.2f   %20.2f   %+14.2f   %+14.2f\n", N, plain, t39, t45, t39 - plain, t45 - plain);
            if (N == sizes[0]) { add39_first = t39 - plain; add45_first = t45 - plain; }
            add39_last = t39 - plain; add45_last = t45 - plain; t39_last = t39; t45_last = t45;
        }
        check("timing: at 64K words 0045's word is faster than 0039's", t45_last < t39_last, t45_last, t39_last);
        check("timing: what 0039 adds over plain grows with the main cache (16K to 64K)", add39_last > add39_first + 1.0, add39_first, add39_last);
        check("timing: at 64K words what 0045 adds over plain is under half of what 0039 adds", add45_last < add39_last/2, add45_last, add39_last);
        check("timing: what 0045 adds over plain grows by under half of 0039's growth", (add45_last - add45_first) < (add39_last - add39_first)/2,
              add45_last - add45_first, add39_last - add39_first);
    }

    ggml_backend_free(g_be);
    printf(fails == 0 ? "ALL PASS\n" : "%d FAILED\n", fails);
    return fails == 0 ? 0 : 1;
}
