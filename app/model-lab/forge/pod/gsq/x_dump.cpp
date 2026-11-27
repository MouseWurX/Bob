// x_dump: save the inputs that chosen weight tensors see, for GSQ-style learned rounding (26 Nov 2026).
//
// ISTA DASLab's GSQ (arXiv 2604.18556) learns each weight's rounding so a layer's output on sample text changes as little as
// possible: || X Wq^T - X W^T ||^2. That needs X, the rows each weight multiplies. This tool runs a brain over plain text and,
// for every matrix multiply whose weight name matches --x-match, writes the input rows it saw. For expert tensors
// (MUL_MAT_ID) each row is tagged with the expert that got it, so each expert is tuned on its own routed tokens.
// The routing-id handling is copied from llama.cpp's own tools/imatrix/imatrix.cpp (MIT), b12359.
//
// Output: <out>/<tensor name>.x, records of { int32 expert (0 for a plain tensor), ne0 x fp16 }, at most --x-rows rows per
// tensor and expert, then <out>/info.json. Read only: nothing is written to the brain.
//   x_dump -m brain.gguf --x-text train.txt --x-match 'ffn_(up|down)' --x-out dir [--x-chunks 64] [--x-rows 16384] [--x-seconds N] -c 512 [llama args]
#include "arg.h"
#include "common.h"
#include "llama.h"
#include "ggml.h"
#include "ggml-backend.h"

#include <cstdio>
#include <cstring>
#include <fstream>
#include <map>
#include <mutex>
#include <regex>
#include <sstream>
#include <string>
#include <vector>

struct xfile { FILE * fp = nullptr; int64_t ne0 = 0; std::vector<int64_t> rows; int64_t total = 0; std::vector<char> buf; };

struct xstate {
    std::regex match;
    std::string out;
    int64_t max_rows = 16384;
    std::map<std::string, xfile> files;
    std::vector<char> src1_buf, ids_buf;
    std::vector<ggml_fp16_t> half;
    std::mutex mu;
};

// same as imatrix.cpp: "blk.0.ffn_down.weight (reshaped)" and "...#..." name forms map back to the weight's own name
static std::string filter_name(const char * name) {
    std::string w(name);
    auto p = w.find('#'); if (p != std::string::npos) { p = w.find('#', p + 1); if (p != std::string::npos) w = w.substr(p + 1); }
    p = w.find(" ("); if (p != std::string::npos) w = w.substr(0, p);
    return w;
}

static void put(xstate & s, const std::string & name, int64_t ne0, int64_t n_exp, int32_t ex, const float * x) {
    auto & f = s.files[name];
    if (!f.fp) {
        std::string path = s.out + "/" + name + ".x";
        f.fp = fopen(path.c_str(), "wb"); f.ne0 = ne0; f.rows.assign(std::max<int64_t>(1, n_exp), 0);
        if (!f.fp) { fprintf(stderr, "x_dump: can't write %s\n", path.c_str()); exit(1); }
        // 27 Nov (Bill rental): stdio's 8 KB writes ran at 13 MB/s on the pod's network drive (192 of 256 chunks in an hour);
        // one 32 MB buffer a file turns them into a few big writes
        f.buf.resize(32u << 20); setvbuf(f.fp, f.buf.data(), _IOFBF, f.buf.size());   // glibc ignores the size without a buffer
    }
    if (f.ne0 != ne0) { fprintf(stderr, "x_dump: %s: row length changed (%lld vs %lld)\n", name.c_str(), (long long) f.ne0, (long long) ne0); exit(1); }
    if (f.rows[ex] >= s.max_rows) return;
    s.half.resize(ne0); ggml_fp32_to_fp16_row(x, s.half.data(), ne0);
    fwrite(&ex, sizeof ex, 1, f.fp); fwrite(s.half.data(), sizeof(ggml_fp16_t), ne0, f.fp);
    f.rows[ex]++; f.total++;
}

static bool cb_eval(struct ggml_tensor * t, bool ask, void * user_data) {
    auto & s = *(xstate *) user_data;
    if (t->op != GGML_OP_MUL_MAT && t->op != GGML_OP_MUL_MAT_ID) return ask ? false : true;
    const ggml_tensor * src0 = t->src[0], * src1 = t->src[1];
    const std::string name = filter_name(src0->name);
    if (ask) return std::regex_search(name, s.match) && src1->type == GGML_TYPE_F32;
    std::lock_guard<std::mutex> lk(s.mu);
    const bool host = ggml_backend_buffer_is_host(src1->buffer);
    if (!host) { s.src1_buf.resize(ggml_nbytes(src1)); ggml_backend_tensor_get(src1, s.src1_buf.data(), 0, ggml_nbytes(src1)); }
    const char * data = host ? (const char *) src1->data : s.src1_buf.data();
    const int64_t ne0 = src1->ne[0];
    if (t->op == GGML_OP_MUL_MAT_ID) {
        // ids -> [n_expert_used, n_tokens]; src1 -> [cols, n_expert_used or 1, n_tokens] (imatrix.cpp)
        const ggml_tensor * ids = t->src[2]; const int64_t n_as = src0->ne[2], n_ids = ids->ne[0], n_tok = src1->ne[2];
        s.ids_buf.resize(ggml_nbytes(ids)); ggml_backend_tensor_get(ids, s.ids_buf.data(), 0, ggml_nbytes(ids));
        for (int64_t idx = 0; idx < n_ids; ++idx) for (int64_t row = 0; row < n_tok; ++row) {
            const int32_t ex = *(const int32_t *) (s.ids_buf.data() + row * ids->nb[1] + idx * ids->nb[0]);
            if (ex < 0 || ex >= n_as) continue;
            const float * x = (const float *) (data + (idx % src1->ne[1]) * src1->nb[1] + row * src1->nb[2]);
            put(s, name, ne0, n_as, ex, x);
        }
    } else {
        for (int64_t i3 = 0; i3 < src1->ne[3]; ++i3) for (int64_t i2 = 0; i2 < src1->ne[2]; ++i2) for (int64_t i1 = 0; i1 < src1->ne[1]; ++i1) {
            const float * x = (const float *) (data + i1 * src1->nb[1] + i2 * src1->nb[2] + i3 * src1->nb[3]);
            put(s, name, ne0, 1, 0, x);
        }
    }
    return true;
}

int main(int argc, char ** argv) {
    std::string text_file, match = "ffn_down", out_dir; int chunks = 64; int64_t max_rows = 16384; double max_seconds = 0;
    std::vector<char *> rest = { argv[0] };
    for (int i = 1; i < argc; i++) {
        std::string a = argv[i];
        if (a == "--x-text" && i + 1 < argc) text_file = argv[++i];
        else if (a == "--x-match" && i + 1 < argc) match = argv[++i];
        else if (a == "--x-out" && i + 1 < argc) out_dir = argv[++i];
        else if (a == "--x-chunks" && i + 1 < argc) chunks = atoi(argv[++i]);
        else if (a == "--x-rows" && i + 1 < argc) max_rows = atoll(argv[++i]);
        else if (a == "--x-seconds" && i + 1 < argc) max_seconds = atof(argv[++i]);
        else rest.push_back(argv[i]);
    }
    if (text_file.empty() || out_dir.empty()) {
        fprintf(stderr, "usage: %s -m brain.gguf --x-text file --x-out dir [--x-match REGEX] [--x-chunks 64] [--x-rows 16384] [--x-seconds 0] [-c 512]\n", argv[0]);
        return 2;
    }
    common_params params; common_init();
    if (!common_params_parse((int) rest.size(), rest.data(), params, LLAMA_EXAMPLE_COMMON)) return 1;
    xstate st; st.match = std::regex(match); st.out = out_dir; st.max_rows = max_rows;
    params.cb_eval = cb_eval; params.cb_eval_user_data = &st; params.warmup = false;
    const int n_ctx = params.n_ctx > 0 ? params.n_ctx : 512; params.n_ctx = n_ctx;
    params.n_batch = std::max<int>(params.n_batch, n_ctx); params.n_ubatch = std::max<int>(params.n_ubatch, n_ctx);
    llama_backend_init();
    auto init = common_init_from_params(params);
    auto * model = init->model(); auto * ctx = init->context();
    if (!model || !ctx) { fprintf(stderr, "x_dump: could not load the brain\n"); return 1; }

    std::ifstream in(text_file); std::stringstream ss; ss << in.rdbuf();
    std::vector<llama_token> toks = common_tokenize(ctx, ss.str(), true, false);
    int done = 0;
    // every token asks for its logits, so the last layer works on every row (with only the last token's logits asked,
    // llama.cpp drops the other rows before the last layer, and that layer's tensors would see one row per chunk)
    llama_batch batch = llama_batch_init(n_ctx, 0, 1);
    const int64_t t_start = ggml_time_us();
    for (size_t at = 0; at + n_ctx <= toks.size() && done < chunks; at += n_ctx, done++) {
        // --x-seconds: stop early but still write what was recorded (info.json says how many chunks)
        if (max_seconds > 0 && (ggml_time_us() - t_start) / 1e6 > max_seconds) { fprintf(stderr, "x_dump: time limit, stopping after %d chunks\n", done); break; }
        llama_memory_clear(llama_get_memory(ctx), true);
        batch.n_tokens = n_ctx;
        for (int k = 0; k < n_ctx; k++) {
            batch.token[k] = toks[at + k]; batch.pos[k] = k; batch.n_seq_id[k] = 1; batch.seq_id[k][0] = 0; batch.logits[k] = 1;
        }
        if (llama_decode(ctx, batch)) { fprintf(stderr, "x_dump: chunk %d failed\n", done); return 1; }
        if ((done + 1) % 8 == 0) fprintf(stderr, "x_dump: %d chunks, %.0f s\n", done + 1, (ggml_time_us() - t_start) / 1e6);
    }
    llama_batch_free(batch);
    FILE * info = fopen((out_dir + "/info.json").c_str(), "wb");
    if (!info) { fprintf(stderr, "x_dump: can't write info.json\n"); return 1; }
    fprintf(info, "{\"chunks\":%d,\"ctx\":%d,\"match\":\"%s\",\"max_rows\":%lld,\"tensors\":{", done, n_ctx, match.c_str(), (long long) max_rows);
    bool first = true;
    for (auto & [n, f] : st.files) {
        fclose(f.fp);
        int64_t seen = 0; for (auto r : f.rows) seen += r > 0;
        fprintf(info, "%s\"%s\":{\"ne0\":%lld,\"rows\":%lld,\"experts\":%zu,\"experts_seen\":%lld}", first ? "" : ",", n.c_str(), (long long) f.ne0, (long long) f.total, f.rows.size(), (long long) seen);
        first = false;
    }
    fprintf(info, "}}\n"); fclose(info);
    printf("x_dump: %d chunks of %d tokens, %zu tensors -> %s\n", done, n_ctx, st.files.size(), out_dir.c_str());
    return done > 0 ? 0 : 1;
}
