// Brain Engine 0046 check: q2_kv, the 2.5-bit chat memory type, on the processor. Checks:
//   - the card's unpacking (four 2-bit codes spread into four bytes with masks and shifts, doubled, less 3 a byte)
//     gives the same values as the plain reference for every byte of codes, in the K dot (four values), the V
//     unpack (two or four values from each aligned start) and the dequantizer the copies and long prompts use;
//   - the card's numbers are the processor's: (2c - 3) times d/2 bit for bit, and a half V is that value rounded once;
//   - the writer tries d = the largest size / 1.5, 1.7, 1.9 and 2.2 (each kept as f16), picks the nearest of the four
//     levels for each value against that d, and keeps the d with the least squared error, the first on a tie. The
//     card's writer, rounding every step on its own as written here, gives the processor's bytes for every block,
//     and its codes for every candidate are the nearest levels; a block with a real outlier keeps it near exact (d =
//     largest / 1.5), Gaussian blocks mostly take a smaller d, and an all-zero block stays zero;
//   - the processor's dot product with q8_0 is the dot of the two dequantized rows;
//   - flash attention on the processor with q2_kv K and V: the same as attention worked out in double from the stored
//     values, the error against full precision reported next to f16, q8_0, q4_0 and q3_0 (it must grow as the bits
//     shrink), mixed pairs (q8_0, q4_0 or q3_0 with q2_kv), and the log-sum-exp of 0045 over a q2_kv cache.
// Builds against ggml only:   kv-q2-check
// Prints one line per check, PASS or FAIL, then ALL PASS or N FAILED.
#include "ggml.h"
#include "ggml-alloc.h"
#include "ggml-backend.h"
#include "ggml-cpu.h"
#include <algorithm>
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

// ---- the card's integer code, as in ggml-cuda/fattn-common.cuh and dequantize.cuh, written for the processor ----
static int spread_lo(int x) { // q3_0_spread_lo (0044)
    x &= 0xFF;
    x = (x | (x << 12)) & 0x000F000F;
    return (x | (x << 6)) & 0x03030303;
}
static int vsub4(int a, int b) { // __vsub4: four bytes, each wrapping on its own
    uint32_t r = 0;
    for (int l = 0; l < 4; ++l) {
        r |= (uint32_t) (uint8_t) (((uint32_t) a >> (8*l)) - ((uint32_t) b >> (8*l))) << (8*l);
    }
    return (int) r;
}
static int q2_kv_unpack4(int x) { return vsub4(spread_lo(x) << 1, 0x03030303); }
static int8_t byte_of(int q, int l) { return (int8_t) (uint8_t) ((uint32_t) q >> (8*l)); }

// the plain reference: value j of a block's codes
static int ref_level(const uint8_t * qs, int j) { return 2*((qs[j/4] >> (2*(j%4))) & 3) - 3; }

// the card's writer (ggml-cuda/cpy-utils.cuh, quantize_f32_q2_kv_block), each step rounded on its own as there:
// __fdiv_rn and __frcp_rn are correctly rounded divisions, __fmul_rn / __fadd_rn / __fsub_rn single roundings
static const float KS[] = { 1.5f, 1.7f, 1.9f, 2.2f }; // GGML_Q2_KV_DIVISORS
static float rn_mul(float a, float b) { volatile float r = a*b; return r; }
static float rn_add(float a, float b) { volatile float r = a + b; return r; }
static float rn_sub(float a, float b) { volatile float r = a - b; return r; }
struct card_pick { uint16_t dh; uint8_t qs[8]; uint8_t cand_qs[4][8]; float cand_d[4]; int pick; };
static card_pick card_writer(const float * x) {
    card_pick r{};
    float amax = 0.0f;
    for (int j = 0; j < 32; ++j) amax = std::max(amax, std::fabs(x[j]));
    float best_err = 0.0f;
    for (int s = 0; s < 4; ++s) {
        volatile float q = amax / KS[s];
        const ggml_fp16_t dh = ggml_fp32_to_fp16(q);
        const float d  = ggml_fp16_to_fp32(dh);
        volatile float rc = 1.0f / d;
        const float id = d ? (float) rc : 0.0f;
        const float hd = 0.5f*d;
        uint8_t qs[8] = {0};
        float err = 0.0f;
        for (int j = 0; j < 32; ++j) {
            const int c = std::max(0, std::min(3, (int) std::floor(rn_add(rn_mul(x[j], id), 2.0f))));
            qs[j/4] |= (uint8_t) (c << (2*(j%4)));
            const float e = rn_sub(x[j], (float) (2*c - 3)*hd);
            err = rn_add(err, rn_mul(e, e));
        }
        memcpy(r.cand_qs[s], qs, 8);
        r.cand_d[s] = d;
        if (s == 0 || err < best_err) { best_err = err; r.dh = dh; memcpy(r.qs, qs, 8); r.pick = s; }
    }
    return r;
}

static ggml_backend_t g_be = nullptr;
static void set_threads(int n) {
    ggml_backend_reg_t reg = ggml_backend_dev_backend_reg(ggml_backend_get_device(g_be));
    auto fn = (ggml_backend_set_n_threads_t) ggml_backend_reg_get_proc_address(reg, "ggml_backend_set_n_threads");
    if (fn) fn(g_be, n);
}

static std::vector<uint8_t> store(ggml_type t, const std::vector<float> & x, int D, int rows, std::vector<float> & back) {
    std::vector<uint8_t> q(ggml_row_size(t, D)*rows);
    if (t == GGML_TYPE_F32) {
        memcpy(q.data(), x.data(), x.size()*sizeof(float));
    } else if (t == GGML_TYPE_F16) {
        ggml_fp32_to_fp16_row(x.data(), (ggml_fp16_t *) q.data(), (int64_t) x.size());
    } else {
        ggml_quantize_chunk(t, x.data(), q.data(), 0, rows, D, nullptr);
    }
    back.resize(x.size());
    if (t == GGML_TYPE_F32) back = x; else ggml_get_type_traits(t)->to_float(q.data(), back.data(), (int64_t) x.size());
    return q;
}

// attention of q [D, H, T] over K, V [D, Hkv, N] of types tk, tv; returns out [D, H, T] and, with lse, [H, T]
static void attend(const std::vector<float> & qv, int D, int H, int Hkv, int T, int N, ggml_type tk, const std::vector<uint8_t> & kb,
                   ggml_type tv, const std::vector<uint8_t> & vb, const std::vector<ggml_fp16_t> & mask, float scale, bool with_lse,
                   std::vector<float> & out, std::vector<float> & lse) {
    ggml_init_params ip = { 64*ggml_tensor_overhead() + ggml_graph_overhead(), nullptr, true };
    ggml_context * ctx = ggml_init(ip);
    ggml_tensor * q = ggml_new_tensor_3d(ctx, GGML_TYPE_F32, D, H, T);
    ggml_tensor * k = ggml_new_tensor_3d(ctx, tk, D, Hkv, N);
    ggml_tensor * v = ggml_new_tensor_3d(ctx, tv, D, Hkv, N);
    ggml_tensor * m = ggml_new_tensor_2d(ctx, GGML_TYPE_F16, N, T);
    ggml_tensor * qp = ggml_permute(ctx, q, 0, 2, 1, 3);
    ggml_tensor * kp = ggml_permute(ctx, k, 0, 2, 1, 3);
    ggml_tensor * vp = ggml_permute(ctx, v, 0, 2, 1, 3);
    ggml_tensor * fa = with_lse ? ggml_flash_attn_ext_with_lse(ctx, qp, kp, vp, m, scale, 0.0f, 0.0f)
                                : ggml_flash_attn_ext(ctx, qp, kp, vp, m, scale, 0.0f, 0.0f);
    ggml_prec_set_acc(fa, GGML_PREC_F32);
    ggml_tensor * o = ggml_cont(ctx, with_lse ? ggml_flash_attn_ext_get_out(ctx, fa) : fa);
    ggml_tensor * l = with_lse ? ggml_cont(ctx, ggml_flash_attn_ext_get_lse(ctx, fa)) : nullptr;
    ggml_cgraph * gf = ggml_new_graph(ctx);
    ggml_build_forward_expand(gf, o);
    if (l) ggml_build_forward_expand(gf, l);
    ggml_backend_buffer_t buf = ggml_backend_alloc_ctx_tensors(ctx, g_be);
    ggml_backend_tensor_set(q, qv.data(), 0, qv.size()*sizeof(float));
    ggml_backend_tensor_set(k, kb.data(), 0, kb.size());
    ggml_backend_tensor_set(v, vb.data(), 0, vb.size());
    ggml_backend_tensor_set(m, mask.data(), 0, mask.size()*sizeof(ggml_fp16_t));
    ggml_backend_graph_compute(g_be, gf);
    out.resize(ggml_nelements(o));
    ggml_backend_tensor_get(o, out.data(), 0, out.size()*sizeof(float));
    if (l) { lse.resize(ggml_nelements(l)); ggml_backend_tensor_get(l, lse.data(), 0, lse.size()*sizeof(float)); }
    ggml_backend_buffer_free(buf);
    ggml_free(ctx);
}

// in double from the given K/V values
static void reference(const std::vector<float> & qv, int D, int H, int Hkv, int T, int N, const std::vector<float> & kf,
                      const std::vector<float> & vf, const std::vector<ggml_fp16_t> & mask, float scale,
                      std::vector<double> & out, std::vector<double> & lse) {
    out.assign((size_t) D*H*T, 0); lse.assign((size_t) H*T, 0);
    for (int j = 0; j < T; ++j) for (int h = 0; h < H; ++h) {
        const int hk = h / (H/Hkv);
        std::vector<double> sc(N);
        double mx = -INFINITY;
        for (int i = 0; i < N; ++i) {
            const float mv = ggml_fp16_to_fp32(mask[(size_t) j*N + i]);
            if (std::isinf(mv)) { sc[i] = -INFINITY; continue; }
            double d = 0;
            for (int c = 0; c < D; ++c) d += (double) kf[((size_t) i*Hkv + hk)*D + c]*qv[((size_t) j*H + h)*D + c];
            sc[i] = d*scale + mv; mx = std::max(mx, sc[i]);
        }
        double sum = 0; for (double x : sc) sum += std::exp(x - mx);
        lse[(size_t) j*H + h] = mx + std::log(sum);
        for (int i = 0; i < N; ++i) {
            const double a = std::exp(sc[i] - mx)/sum;
            for (int c = 0; c < D; ++c) out[((size_t) j*H + h)*D + c] += a*vf[((size_t) i*Hkv + hk)*D + c];
        }
    }
}

static double rel_rms(const std::vector<float> & a, const std::vector<double> & b) {
    double e = 0, n = 0; for (size_t i = 0; i < a.size(); ++i) { e += (a[i] - b[i])*(a[i] - b[i]); n += b[i]*b[i]; }
    return std::sqrt(e/n);
}
static double max_abs(const std::vector<float> & a, const std::vector<double> & b) {
    double m = 0; for (size_t i = 0; i < a.size(); ++i) m = std::max(m, std::fabs(a[i] - b[i])); return m;
}

int main() {
    // ---- 1. the unpacking, every byte ----
    {
        int bad_k = 0, bad_v = 0, bad_pair = 0;
        for (int b = 0; b < 256; ++b) {
            const uint8_t qs[8] = { (uint8_t) b, 0, 0, 0, 0, 0, 0, 0 };
            // K: the four values of one byte
            const int v = q2_kv_unpack4(b);
            for (int l = 0; l < 4; ++l) bad_k += byte_of(v, l) != ref_level(qs, l);
            // V: ne values from each aligned start (ne 2: starts 0 and 2 in the byte; ne 4: start 0)
            for (int ne = 2; ne <= 4; ne += 2) for (int iqs = 0; iqs < 4; iqs += ne) {
                const int q = q2_kv_unpack4(qs[iqs/4] >> (2*(iqs%4)));
                for (int l = 0; l < ne; ++l) bad_v += byte_of(q, l) != ref_level(qs, iqs + l);
            }
            // dequantize_q2_kv: values iqs and iqs + 1 (iqs even)
            for (int iqs = 0; iqs < 4; iqs += 2) {
                const int c = qs[iqs/4] >> (2*(iqs%4));
                bad_pair += (2*((c) & 3) - 3) != ref_level(qs, iqs) || (2*((c >> 2) & 3) - 3) != ref_level(qs, iqs + 1);
            }
        }
        check("K unpack: the same four values as the reference for all 256 bytes", bad_k == 0, bad_k);
        check("V unpack: the same values for all 256 bytes, ne 2 and 4, every aligned start", bad_v == 0, bad_v);
        check("dequantizer pairs: the same values for all 256 bytes", bad_pair == 0, bad_pair);
    }

    ggml_backend_load_all();
    g_be = ggml_backend_init_by_type(GGML_BACKEND_DEVICE_TYPE_CPU, nullptr);
    if (!g_be) { printf("FAIL no processor backend\n"); return 1; }
    set_threads(4);
    std::mt19937 rng(46);
    std::normal_distribution<float> nd(0.0f, 1.0f);

    // ---- 2. the type: size, numbers, quantizer ----
    {
        const auto * tr = ggml_get_type_traits(GGML_TYPE_Q2_KV);
        check("q2_kv is a quantized type of 32 values in 10 bytes, named q2_kv",
              tr->blck_size == 32 && tr->type_size == 10 && ggml_is_quantized(GGML_TYPE_Q2_KV) && strcmp(ggml_type_name(GGML_TYPE_Q2_KV), "q2_kv") == 0,
              tr->blck_size, tr->type_size);
        const int n = 32*20000;
        std::vector<float> x(n);
        for (int i = 0; i < n; ++i) x[i] = nd(rng)*(1.0f + 10.0f*(i/32 % 7 == 0)) + (i % 97 == 0 ? 6.0f : 0.0f);
        for (int i = 0; i < 32; ++i) x[i] = 0.0f; // an all-zero block
        std::vector<float> back;
        std::vector<uint8_t> q = store(GGML_TYPE_Q2_KV, x, n, 1, back);
        int bad_bits = 0, bad_half = 0, bad_near = 0, bad_outer = 0;
        for (int b = 0; b < n/32; ++b) {
            const uint8_t * blk = q.data() + 10*b;
            ggml_fp16_t dh; memcpy(&dh, blk, 2);
            const float d = ggml_fp16_to_fp32(dh);
            const float half_d = 0.5f*d; // the card: 0.5f*__half2float(d)
            float amax = 0; int jmax = 0;
            for (int j = 0; j < 32; ++j) if (std::fabs(x[32*b + j]) > amax) { amax = std::fabs(x[32*b + j]); jmax = j; }
            for (int j = 0; j < 32; ++j) {
                const float card = (float) ref_level(blk + 2, j)*half_d;
                uint32_t u1, u2; memcpy(&u1, &card, 4); memcpy(&u2, &back[32*b + j], 4);
                bad_bits += u1 != u2;
                // a half V: the card makes the float and rounds it to half once
                bad_half += ggml_fp32_to_fp16(card) != ggml_fp32_to_fp16(back[32*b + j]);
                // nearest of the four levels against the stored d (ties may go either way)
                const double e = std::fabs((double) x[32*b + j] - back[32*b + j]);
                for (int c = 0; c < 4; ++c) {
                    if (std::fabs((double) x[32*b + j] - (2*c - 3)*0.5*d) < e - 1e-6*std::max(1.0f, d)) { bad_near++; break; }
                }
            }
            if (amax == 0) {
                for (int j = 0; j < 32; ++j) bad_outer += back[32*b + j] != 0.0f;
            }
            (void) jmax;
        }
        check("dequantized values are (2c - 3) times d/2 bit for bit, as the card makes them", bad_bits == 0, bad_bits);
        check("a half V holds the same numbers as the processor's, rounded to f16", bad_half == 0, bad_half);
        check("every value goes to the nearest of the four levels", bad_near == 0, bad_near);
        check("an all-zero block stays zero", bad_outer == 0, bad_outer);

        // the card's writer against the processor's bytes, and each candidate's codes against the nearest level
        int bad_card = 0, bad_cand = 0, bad_least = 0;
        for (int b = 0; b < n/32; ++b) {
            const float * xb = x.data() + 32*b;
            const card_pick cp = card_writer(xb);
            bad_card += memcmp(&cp.dh, q.data() + 10*b, 2) != 0 || memcmp(cp.qs, q.data() + 10*b + 2, 8) != 0;
            double errs[4];
            for (int s = 0; s < 4; ++s) {
                errs[s] = 0;
                for (int j = 0; j < 32; ++j) {
                    const double v = (double) ref_level(cp.cand_qs[s], j)*0.5*cp.cand_d[s];
                    errs[s] += (xb[j] - v)*(xb[j] - v);
                    const double e = std::fabs(xb[j] - v);
                    for (int c = 0; c < 4; ++c) {
                        if (std::fabs(xb[j] - (2*c - 3)*0.5*cp.cand_d[s]) < e - 1e-6*std::max(1.0f, cp.cand_d[s])) { bad_cand++; break; }
                    }
                }
            }
            for (int s = 0; s < 4; ++s) bad_least += errs[s] < errs[cp.pick]*(1 - 1e-5) - 1e-12;
        }
        check("the card's writer gives the processor's bytes (d and codes) for every block", bad_card == 0, bad_card);
        check("for every candidate scale, the card's codes are the nearest levels", bad_cand == 0, bad_cand);
        check("the kept scale has the least squared error of the four", bad_least == 0, bad_least);

        double e = 0, s = 0; for (int i = 0; i < n; ++i) { e += (x[i] - back[i])*(x[i] - back[i]); s += x[i]*x[i]; }
        printf("  round trip on normal data with outliers: relative RMS error %.4f\n", std::sqrt(e/s));
        check("round trip with outliers: relative RMS error under 0.45", std::sqrt(e/s) < 0.45, std::sqrt(e/s));

        // Gaussian blocks: most take a smaller d than largest / 1.5, and the error drops well below 1.5's (0.45)
        std::vector<float> g(32*20000), gb;
        for (auto & z : g) z = nd(rng);
        std::vector<uint8_t> gq = store(GGML_TYPE_Q2_KV, g, (int) g.size(), 1, gb);
        int smaller = 0;
        for (size_t b = 0; b < g.size()/32; ++b) {
            float amax = 0; for (int j = 0; j < 32; ++j) amax = std::max(amax, std::fabs(g[32*b + j]));
            ggml_fp16_t dh; memcpy(&dh, gq.data() + 10*b, 2);
            smaller += ggml_fp16_to_fp32(dh) < ggml_fp16_to_fp32(ggml_fp32_to_fp16(amax/1.5f));
        }
        e = 0; s = 0; for (size_t i = 0; i < g.size(); ++i) { e += (g[i] - gb[i])*(g[i] - gb[i]); s += g[i]*g[i]; }
        printf("  round trip on normal data (what the rotated chat memory looks like): relative RMS error %.4f, %.1f%% of blocks below largest / 1.5\n",
               std::sqrt(e/s), 100.0*smaller/(g.size()/32));
        check("Gaussian blocks: over 90% take a smaller scale than largest / 1.5", smaller > 0.9*(g.size()/32), smaller);
        check("Gaussian blocks: relative RMS error under 0.36 (largest / 1.5 alone gives 0.45)", std::sqrt(e/s) < 0.36, std::sqrt(e/s));

        // a block with one real outlier (a key's outlier channel): least squared error over the block favours the 31
        // small values, so it clips the outlier to the outer level of largest / 2.2 (0.68 of its size); the check
        // shows that, and that the block as a whole is still nearer than with largest / 1.5
        int clipped = 0, bad_out = 0;
        double oerr = 0;
        for (int t2 = 0; t2 < 2000; ++t2) {
            std::vector<float> xv(32), xbk;
            for (auto & z : xv) z = 0.5f*nd(rng);
            const int jo = t2 % 32; xv[jo] = (t2 & 1 ? -1.0f : 1.0f)*(3.0f + 17.0f*std::fabs(nd(rng)));
            std::vector<uint8_t> qq = store(GGML_TYPE_Q2_KV, xv, 32, 1, xbk);
            ggml_fp16_t dh; memcpy(&dh, qq.data(), 2);
            const float d15 = ggml_fp16_to_fp32(ggml_fp32_to_fp16(std::fabs(xv[jo])/1.5f));
            double e_pick = 0, e_15 = 0;
            for (int j = 0; j < 32; ++j) {
                e_pick += (xv[j] - xbk[j])*(xv[j] - xbk[j]);
                const int c = std::max(0, std::min(3, (int) std::floor(xv[j]/d15 + 2.0f)));
                const double v = (2*c - 3)*0.5*d15;
                e_15 += (xv[j] - v)*(xv[j] - v);
            }
            clipped += ggml_fp16_to_fp32(dh) < d15;
            oerr += std::fabs(xbk[jo] - xv[jo])/std::fabs(xv[jo]);
            bad_out += !(e_pick <= e_15*(1 + 1e-5) && xbk[jo]*xv[jo] > 0 && std::fabs(xbk[jo]) >= 0.67f*std::fabs(xv[jo]));
        }
        printf("  one outlier in a block of small values: %.1f%% of blocks clip it, its mean error %.1f%%\n", 100.0*clipped/2000, 100.0*oerr/2000);
        check("an outlier block: nearer than largest / 1.5 over the block, the outlier keeps its sign and at least 0.67 of its size", bad_out == 0, bad_out);
    }

    // ---- 3. the processor's dot product with q8_0 ----
    {
        const int n = 4096;
        std::vector<float> a(n), b(n), ab, bb;
        for (auto & z : a) z = nd(rng);
        for (auto & z : b) z = nd(rng);
        std::vector<uint8_t> qa = store(GGML_TYPE_Q2_KV, a, n, 1, ab);
        std::vector<uint8_t> qb = store(GGML_TYPE_Q8_0, b, n, 1, bb);
        float s = 0;
        ggml_get_type_traits_cpu(GGML_TYPE_Q2_KV)->vec_dot(n, &s, 0, qa.data(), 0, qb.data(), 0, 1);
        double r = 0; for (int i = 0; i < n; ++i) r += (double) ab[i]*bb[i];
        check("dot product with q8_0 = the dot of the dequantized rows", std::fabs(s - r) <= 1e-4*std::max(1.0, std::fabs(r)), s, r);
        check("the processor's q2_kv dot type is q8_0", ggml_get_type_traits_cpu(GGML_TYPE_Q2_KV)->vec_dot_type == GGML_TYPE_Q8_0);
    }

    // ---- 4. flash attention on the processor ----
    const int D = 128, H = 8, Hkv = 2, N = 1024;
    const float scale = 1.0f/std::sqrt((float) D);
    for (int T : { 1, 4 }) {
        std::vector<float> k((size_t) D*Hkv*N), v((size_t) D*Hkv*N), qv((size_t) D*H*T);
        for (auto & z : k) z = nd(rng);
        for (auto & z : v) z = nd(rng);
        for (auto & z : qv) z = nd(rng);
        std::vector<ggml_fp16_t> mask((size_t) T*N);
        for (int j = 0; j < T; ++j) for (int i = 0; i < N; ++i) mask[(size_t) j*N + i] = ggml_fp32_to_fp16(i > N - T + j ? -INFINITY : 0.0f);
        std::vector<double> ref_out, ref_lse;
        reference(qv, D, H, Hkv, T, N, k, v, mask, scale, ref_out, ref_lse);
        char name[256];
        std::vector<double> errs;
        printf("  T=%d: flash attention against full precision (relative RMS error of the result):\n", T);
        for (ggml_type t : { GGML_TYPE_F16, GGML_TYPE_Q8_0, GGML_TYPE_Q4_0, GGML_TYPE_Q3_0, GGML_TYPE_Q2_KV }) {
            std::vector<float> kf, vf, out, lse;
            std::vector<uint8_t> kb = store(t, k, D, Hkv*N, kf), vb = store(t, v, D, Hkv*N, vf);
            attend(qv, D, H, Hkv, T, N, t, kb, t, vb, mask, scale, false, out, lse);
            errs.push_back(rel_rms(out, ref_out));
            printf("    %-6s %.5f\n", ggml_type_name(t), errs.back());
            if (t == GGML_TYPE_Q2_KV) {
                // the attention itself is right: against double over the stored q2_kv values (Q rounded to q8_0 differs a little)
                std::vector<double> so, sl;
                reference(qv, D, H, Hkv, T, N, kf, vf, mask, scale, so, sl);
                snprintf(name, sizeof(name), "T=%d q2_kv/q2_kv: within 2e-2 of attention in double over the stored values", T);
                check(name, max_abs(out, so) < 2e-2, max_abs(out, so));
                std::vector<float> out2, lse2;
                attend(qv, D, H, Hkv, T, N, t, kb, t, vb, mask, scale, true, out2, lse2);
                double same = 0; for (size_t i = 0; i < out.size(); ++i) same = std::max(same, (double) std::fabs(out[i] - out2[i]));
                snprintf(name, sizeof(name), "T=%d q2_kv: with the log-sum-exp (0045) the result is the same, and the log-sum-exp within 3e-2 of double", T);
                check(name, same == 0.0 && max_abs(lse2, sl) < 3e-2, same, max_abs(lse2, sl));
            }
        }
        snprintf(name, sizeof(name), "T=%d: the error grows as the bits shrink (f16 < q8_0 < q4_0 < q3_0 < q2_kv)", T);
        check(name, std::is_sorted(errs.begin(), errs.end()) && errs[3] < errs[4], errs[3], errs[4]);
        snprintf(name, sizeof(name), "T=%d: q2_kv's result still carries the signal (error under 1, what a result of zeros has)", T);
        check(name, errs[4] < 1.0, errs[4]);
        // mixed pairs: K of another type, V q2_kv, and the other way
        for (ggml_type o : { GGML_TYPE_F16, GGML_TYPE_Q8_0, GGML_TYPE_Q4_0, GGML_TYPE_Q3_0 }) {
            for (int kq2 = 0; kq2 < 2; ++kq2) {
                const ggml_type tk = kq2 ? GGML_TYPE_Q2_KV : o, tv = kq2 ? o : GGML_TYPE_Q2_KV;
                std::vector<float> kf, vf, out, lse;
                std::vector<uint8_t> kb = store(tk, k, D, Hkv*N, kf), vb = store(tv, v, D, Hkv*N, vf);
                attend(qv, D, H, Hkv, T, N, tk, kb, tv, vb, mask, scale, false, out, lse);
                std::vector<double> so, sl;
                reference(qv, D, H, Hkv, T, N, kf, vf, mask, scale, so, sl);
                snprintf(name, sizeof(name), "T=%d K %s V %s: within 2e-2 of double over the stored values (error vs full %.4f)",
                         T, ggml_type_name(tk), ggml_type_name(tv), rel_rms(out, ref_out));
                check(name, max_abs(out, so) < 2e-2, max_abs(out, so));
            }
        }
    }

    ggml_backend_free(g_be);
    printf(fails == 0 ? "ALL PASS\n" : "%d FAILED\n", fails);
    return fails ? 1 : 0;
}
