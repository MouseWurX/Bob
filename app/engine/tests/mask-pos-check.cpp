// Brain Engine 0026 card check: flash attention with a position mask (no table) must give exactly the same numbers as
// flash attention with the F16 table those positions stand for, on every device ggml finds (the card and the
// processor). Random Q/K/V; the positions have holes, cells of no chat, unsorted cells, several streams, a sliding
// window and the shared-cell lists (kv_rows). Builds against ggml only:
//   mask-pos-check            (every device)        mask-pos-check CUDA0   (one device by name)
// Prints one line per case and device, PASS or FAIL with how many numbers differ, then ALL PASS or N FAILED.
#include "ggml.h"
#include "ggml-alloc.h"
#include "ggml-backend.h"
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <random>
#include <string>
#include <vector>

struct fa_case {
    const char * name;
    int D, n_head, n_head_kv, n_q, n_kv, n_stream, n_swa;
    bool rows;   // shared K/V read through kv_rows (one K/V for all streams)
    ggml_type kv_type;
};

static uint16_t f2h(float f) { return ggml_fp32_to_fp16(f); }

// one case on one backend: returns the number of differing floats, -1 if the backend can't run it
static long run_case(ggml_backend_t be, const fa_case & c, unsigned seed) {
    std::mt19937 rng(seed);
    std::normal_distribution<float> nd(0.0f, 1.0f);
    const int ns = c.n_stream;
    const int n_rows_kv = c.n_kv;                 // K/V rows per stream (or shared rows when c.rows)
    const int kv3 = c.rows ? 1 : ns;

    // positions: query rows of stream s at base_s .. base_s + n_q - 1; cells mostly earlier, some later, some empty
    std::vector<int32_t> qpos(ns*c.n_q), kpos(ns*c.n_kv), rows(ns*c.n_kv);
    for (int s = 0; s < ns; s++) {
        const int base = 200 + 37*s + (int) (rng() % 300);
        for (int j = 0; j < c.n_q; j++) qpos[s*c.n_q + j] = base + j;
        for (int i = 0; i < c.n_kv; i++) {
            const unsigned r = rng() % 100;
            int32_t p;
            if (r < 8)       p = INT32_MAX;                          // empty / another chat / padding
            else if (r < 80) p = (int) (rng() % (unsigned) base);      // earlier
            else             p = base + (int) (rng() % (unsigned) (c.n_q + 40)); // inside or after the batch
            kpos[s*c.n_kv + i] = p;
            rows[s*c.n_kv + i] = p == INT32_MAX && (rng() % 2) ? -1 : (int) (rng() % (unsigned) n_rows_kv);
        }
    }

    const size_t mem = ggml_tensor_overhead()*64 + ggml_graph_overhead()*2;
    ggml_init_params ip = { mem, nullptr, true };
    ggml_context * ctx = ggml_init(ip);

    ggml_tensor * q = ggml_new_tensor_4d(ctx, GGML_TYPE_F32, c.D, c.n_q, c.n_head, ns);
    ggml_tensor * k = ggml_new_tensor_4d(ctx, c.kv_type, c.D, n_rows_kv, c.n_head_kv, kv3);
    ggml_tensor * v = ggml_new_tensor_4d(ctx, c.kv_type, c.D, n_rows_kv, c.n_head_kv, kv3);
    ggml_tensor * tab = ggml_new_tensor_4d(ctx, GGML_TYPE_F16, c.n_kv, c.n_q, 1, ns);
    ggml_tensor * pm  = ggml_new_tensor_4d(ctx, GGML_TYPE_I32, c.n_q + c.n_kv, 1, 1, ns);
    ggml_tensor * kr  = c.rows ? ggml_new_tensor_2d(ctx, GGML_TYPE_I32, c.n_kv, ns) : nullptr;
    ggml_flash_attn_ext_pos_mask_init(pm, c.n_kv, c.n_q, c.n_swa);

    // flash attention takes q [D, n_q, n_head, ns] and k, v [D, n_kv, n_head_kv, ns]
    ggml_tensor * qp = q;
    ggml_tensor * kp = k;
    ggml_tensor * vp = v;
    const float scale = 1.0f/sqrtf((float) c.D);
    ggml_tensor * a = c.rows ? ggml_flash_attn_ext_rows(ctx, qp, kp, vp, tab, kr, scale, 0.0f, 0.0f)
                             : ggml_flash_attn_ext(ctx, qp, kp, vp, tab, scale, 0.0f, 0.0f);
    ggml_tensor * b = c.rows ? ggml_flash_attn_ext_rows(ctx, qp, kp, vp, pm, kr, scale, 0.0f, 0.0f)
                             : ggml_flash_attn_ext(ctx, qp, kp, vp, pm, scale, 0.0f, 0.0f);
    ggml_prec_set_acc(a, GGML_PREC_F32);
    ggml_prec_set_acc(b, GGML_PREC_F32);

    ggml_cgraph * ga = ggml_new_graph(ctx); ggml_build_forward_expand(ga, a);
    ggml_cgraph * gb = ggml_new_graph(ctx); ggml_build_forward_expand(gb, b);
    if (!ggml_backend_supports_op(be, a) || !ggml_backend_supports_op(be, b)) { ggml_free(ctx); return -1; }

    ggml_backend_buffer_t buf = ggml_backend_alloc_ctx_tensors(ctx, be);
    if (!buf) { ggml_free(ctx); return -1; }

    std::vector<float> qv(ggml_nelements(q));
    for (auto & x : qv) x = nd(rng);
    ggml_backend_tensor_set(q, qv.data(), 0, ggml_nbytes(q));
    for (ggml_tensor * t : {k, v}) {
        std::vector<float> f(ggml_nelements(t));
        for (auto & x : f) x = nd(rng);
        if (t->type == GGML_TYPE_F16) {
            std::vector<uint16_t> h(f.size());
            for (size_t i = 0; i < f.size(); i++) h[i] = f2h(f[i]);
            ggml_backend_tensor_set(t, h.data(), 0, ggml_nbytes(t));
        } else {
            std::vector<uint8_t> qd(ggml_nbytes(t));
            ggml_quantize_chunk(t->type, f.data(), qd.data(), 0, ggml_nrows(t), t->ne[0], nullptr);
            ggml_backend_tensor_set(t, qd.data(), 0, ggml_nbytes(t));
        }
    }
    // the table the positions stand for
    std::vector<uint16_t> tv(ggml_nelements(tab));
    const uint16_t keep = f2h(0.0f), drop = f2h(-INFINITY);
    for (int s = 0; s < ns; s++)
        for (int j = 0; j < c.n_q; j++)
            for (int i = 0; i < c.n_kv; i++) {
                const int32_t p0 = kpos[s*c.n_kv + i], p1 = qpos[s*c.n_q + j];
                const bool vis = p0 <= p1 && (c.n_swa == 0 || p1 - p0 < c.n_swa) && (!c.rows || rows[s*c.n_kv + i] >= 0);
                tv[((size_t) s*c.n_q + j)*c.n_kv + i] = vis ? keep : drop;
            }
    ggml_backend_tensor_set(tab, tv.data(), 0, ggml_nbytes(tab));
    std::vector<int32_t> pv(ggml_nelements(pm));
    for (int s = 0; s < ns; s++) {
        for (int j = 0; j < c.n_q; j++) pv[s*(c.n_q + c.n_kv) + j] = qpos[s*c.n_q + j];
        for (int i = 0; i < c.n_kv; i++) {
            const bool pad = c.rows && rows[s*c.n_kv + i] < 0;
            pv[s*(c.n_q + c.n_kv) + c.n_q + i] = pad ? INT32_MAX : kpos[s*c.n_kv + i];
        }
    }
    ggml_backend_tensor_set(pm, pv.data(), 0, ggml_nbytes(pm));
    if (kr) ggml_backend_tensor_set(kr, rows.data(), 0, ggml_nbytes(kr));

    long diff = -1;
    if (ggml_backend_graph_compute(be, ga) == GGML_STATUS_SUCCESS) {
        std::vector<float> ra(ggml_nelements(a)), rb(ggml_nelements(b));
        ggml_backend_tensor_get(a, ra.data(), 0, ggml_nbytes(a));
        if (ggml_backend_graph_compute(be, gb) == GGML_STATUS_SUCCESS) {
            ggml_backend_tensor_get(b, rb.data(), 0, ggml_nbytes(b));
            diff = 0;
            for (size_t i = 0; i < ra.size(); i++) if (memcmp(&ra[i], &rb[i], sizeof(float)) != 0) diff++;
        }
    }
    ggml_backend_buffer_free(buf);
    ggml_free(ctx);
    return diff;
}

int main(int argc, char ** argv) {
    ggml_backend_load_all();
    const fa_case cases[] = {
        // name                       D  heads kv   n_q   n_kv   streams swa  rows   K/V type
        { "write one word, 128",    128,  16,  2,    1,  8192,  1,    0, false, GGML_TYPE_F16  },
        { "write, 3 chats",         128,  16,  2,    1,  4096,  3,    0, false, GGML_TYPE_F16  },
        { "read 7 words",           128,  16,  2,    7,  4096,  1,    0, false, GGML_TYPE_F16  },
        { "read 512 words",         128,  16,  2,  512,  4096,  1,    0, false, GGML_TYPE_F16  },
        { "read 1024 (tile skip)",  128,  16,  2, 1024,  8192,  1,    0, false, GGML_TYPE_F16  },
        { "read 2 chats x 300",     128,  16,  2,  300,  2048,  2,    0, false, GGML_TYPE_F16  },
        { "q8 cache, read 512",     128,  16,  2,  512,  4096,  1,    0, false, GGML_TYPE_Q8_0 },
        { "q4 cache, write",        128,  16,  2,    1,  4096,  1,    0, false, GGML_TYPE_Q4_0 },
        { "window 128, read 512",    64,  64,  8,  512,  1024,  1,  128, false, GGML_TYPE_F16  },
        { "window 128, write",       64,  64,  8,    1,   512,  1,  128, false, GGML_TYPE_F16  },
        { "shared rows, 2 chats",   128,  16,  2,  256,  2048,  2,    0, true,  GGML_TYPE_F16  },
        { "shared rows, write x4",  128,  16,  2,    1,  1024,  4,    0, true,  GGML_TYPE_F16  },
        { "head 256, read 1024",    256,  16,  2, 1024,  4096,  1,    0, false, GGML_TYPE_F16  },
    };
    int fails = 0, runs = 0;
    for (size_t d = 0; d < ggml_backend_dev_count(); d++) {
        ggml_backend_dev_t dev = ggml_backend_dev_get(d);
        if (argc > 1 && strcmp(argv[1], ggml_backend_dev_name(dev)) != 0) continue;
        if (ggml_backend_dev_type(dev) == GGML_BACKEND_DEVICE_TYPE_ACCEL) continue;
        ggml_backend_t be = ggml_backend_dev_init(dev, nullptr);
        if (!be) continue;
        unsigned seed = 1;
        for (const auto & c : cases) {
            const long r = run_case(be, c, seed++);
            if (r < 0) { printf("SKIP %-8s %s (not supported here)\n", ggml_backend_dev_name(dev), c.name); continue; }
            runs++;
            printf("%s %-8s %s: %ld numbers differ\n", r == 0 ? "PASS" : "FAIL", ggml_backend_dev_name(dev), c.name, r);
            fails += r != 0;
        }
        ggml_backend_free(be);
    }
    printf(runs == 0 ? "FAIL nothing ran\n" : fails == 0 ? "ALL PASS\n" : "%d FAILED\n", fails);
    return runs > 0 && fails == 0 ? 0 : 1;
}
