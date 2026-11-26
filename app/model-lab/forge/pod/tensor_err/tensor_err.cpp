// tensor_err: how much each weight tensor of a GGUF would change at each candidate quant type (26 Nov 2026).
//
// The measuring half of our RCO-style bit picker (pod/rco_pick.py). ISTA DASLab's RCO (arXiv 2605.00649) chooses a type per
// tensor so the file lands exactly on a size, with the least drift. Their paper publishes no code, so this is our own version
// of the idea: measure each tensor's error at each type, then let rco_pick.py choose under an exact byte budget.
//
// For every quantizable tensor (2D/3D, name ends in "weight", not a norm/router/conv) and every candidate type whose block
// fits the row length, a sample of rows is quantized exactly as llama-quantize does it (ggml_quantize_chunk with the same
// imatrix row), turned back into floats, and compared with the source:
//   err = sum over sampled rows of sum_j imatrix_j * (w_j - q_j)^2        (expected squared change of that row's output)
//   ref = sum over sampled rows of sum_j imatrix_j * w_j^2               (the same with the whole weight, for a relative error)
// For expert tensors each sampled expert's error is weighted by how often the router picked it (the imatrix counts), so
// an expert the chats rarely reach costs less. Sums are scaled up to the whole tensor. A tensor with no imatrix entry gets
// imatrix 1 and only the types that need no imatrix (as llama-quantize would refuse IQ2_XXS/IQ2_XS/IQ1_S there).
//
// Output (TSV, stdout): name  type  bytes  err  ref  rows_sampled  rows_total
// bytes is the tensor's full size at that type. Nothing is written to the model; measure only.
//
// usage: tensor_err -m src.gguf [--imatrix imatrix.gguf] [--types q2_0,q4_0,iq2_xxs,...] [--rows 512] [--experts 12]
//                   [--include REGEX] [--exclude REGEX] [-t threads]
// The source should be the highest-precision file at hand (the cut's own Q8_0 on the pods); it is read through mmap.
#include "ggml.h"
#include "gguf.h"
#include "imatrix-loader.h"

#include <algorithm>
#include <atomic>
#include <cinttypes>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <strings.h>
#include <fcntl.h>
#include <map>
#include <mutex>
#include <regex>
#include <string>
#include <sys/mman.h>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>
#include <vector>

struct job {
    std::string name;
    ggml_type   src_type;
    int64_t     ne[4];
    size_t      offset;
};

struct imx {
    std::vector<float> w;       // per expert: ne0 values (sums / counts)
    std::vector<double> freq;   // per expert: share of the router's picks (1 for a non-expert tensor)
    bool have = false;
};

static std::vector<std::string> split(const std::string & s, char c) {
    std::vector<std::string> out; std::string cur;
    for (char ch : s) { if (ch == c) { if (!cur.empty()) out.push_back(cur); cur.clear(); } else cur += ch; }
    if (!cur.empty()) out.push_back(cur);
    return out;
}

static bool quantizable(const std::string & n, int nd) {
    if (nd < 2) return false;
    if (n.size() < 6 || n.compare(n.size() - 6, 6, "weight") != 0) return false;
    for (const char * s : {"_norm.weight", "ffn_gate_inp.weight", "ssm_conv1d", "indexer.k_proj.weight", "indexer.q_proj.weight"}) {
        if (n.find(s) != std::string::npos) return false;
    }
    return true;
}

int main(int argc, char ** argv) {
    std::string model, imatrix_path, include = "", exclude = "";
    std::string types_s = "q2_0,q2_k,q3_k,q4_0,q4_k,q5_k,q6_k,q8_0,iq1_m,iq2_xxs,iq2_xs,iq2_s,iq3_xxs,iq3_s,iq4_xs";
    int64_t rows_max = 512; int experts_max = 12; int nthreads = (int) std::max(1u, std::thread::hardware_concurrency());
    for (int i = 1; i < argc; i++) {
        std::string a = argv[i];
        auto next = [&]() -> std::string { if (i + 1 >= argc) { fprintf(stderr, "%s needs a value\n", a.c_str()); exit(2); } return argv[++i]; };
        if (a == "-m") model = next();
        else if (a == "--imatrix") imatrix_path = next();
        else if (a == "--types") types_s = next();
        else if (a == "--rows") rows_max = std::stoll(next());
        else if (a == "--experts") experts_max = std::stoi(next());
        else if (a == "--include") include = next();
        else if (a == "--exclude") exclude = next();
        else if (a == "-t") nthreads = std::stoi(next());
        else { fprintf(stderr, "usage: %s -m src.gguf [--imatrix f] [--types a,b] [--rows N] [--experts N] [--include RE] [--exclude RE] [-t N]\n", argv[0]); return 2; }
    }
    if (model.empty()) { fprintf(stderr, "tensor_err: -m is required\n"); return 2; }

    std::vector<ggml_type> types;
    for (auto & t : split(types_s, ',')) {
        ggml_type found = GGML_TYPE_COUNT;
        for (int k = 0; k < GGML_TYPE_COUNT; k++) {
            const char * nm = ggml_type_name((ggml_type) k);
            if (nm && strcasecmp(t.c_str(), nm) == 0 && ggml_get_type_traits((ggml_type) k)->blck_size > 0) { found = (ggml_type) k; break; }
        }
        if (found == GGML_TYPE_COUNT || !ggml_get_type_traits(found)->to_float || found == GGML_TYPE_F32) { fprintf(stderr, "tensor_err: unknown or unreadable type %s\n", t.c_str()); return 2; }
        types.push_back(found);
    }

    gguf_init_params gp = { /*no_alloc*/ true, /*ctx*/ nullptr };
    gguf_context * g = gguf_init_from_file(model.c_str(), gp);
    if (!g) { fprintf(stderr, "tensor_err: can't read %s\n", model.c_str()); return 1; }
    if (gguf_find_key(g, "split.count") >= 0 && gguf_get_val_u16(g, gguf_find_key(g, "split.count")) > 1) {
        fprintf(stderr, "tensor_err: %s is one part of a split file; merge it first (llama-gguf-split --merge)\n", model.c_str()); return 1;
    }
    int fd = open(model.c_str(), O_RDONLY); struct stat st; fstat(fd, &st);
    const uint8_t * base = (const uint8_t *) mmap(nullptr, st.st_size, PROT_READ, MAP_SHARED, fd, 0);
    if (base == MAP_FAILED) { perror("mmap"); return 1; }
    const size_t data_off = gguf_get_data_offset(g);

    // tensor shapes come from a meta context
    ggml_context * meta = nullptr;
    { gguf_init_params gp2 = { true, &meta }; gguf_free(g); g = gguf_init_from_file(model.c_str(), gp2); }
    std::vector<job> jobs;
    std::regex inc(include.empty() ? ".*" : include), exc(exclude.empty() ? "$^" : exclude);
    for (int64_t i = 0; i < gguf_get_n_tensors(g); i++) {
        std::string n = gguf_get_tensor_name(g, i);
        ggml_tensor * t = ggml_get_tensor(meta, n.c_str());
        if (!quantizable(n, ggml_n_dims(t))) continue;
        if (!std::regex_search(n, inc) || std::regex_search(n, exc)) continue;
        job j; j.name = n; j.src_type = t->type; for (int k = 0; k < 4; k++) j.ne[k] = t->ne[k];
        j.offset = data_off + gguf_get_tensor_offset(g, i);
        if (j.src_type != GGML_TYPE_F32 && !ggml_get_type_traits(j.src_type)->to_float) { fprintf(stderr, "tensor_err: %s: can't read type %s, skipped\n", n.c_str(), ggml_type_name(j.src_type)); continue; }
        jobs.push_back(j);
    }

    std::map<std::string, imx> im;
    if (!imatrix_path.empty()) {
        common_imatrix L;
        if (!common_imatrix_load(imatrix_path, L)) { fprintf(stderr, "tensor_err: can't read imatrix %s\n", imatrix_path.c_str()); return 1; }
        for (auto & [name, e] : L.entries) {
            imx x; x.have = true; x.w.resize(e.sums.size());
            const int64_t nc = L.is_legacy ? 1 : std::max<int64_t>(1, (int64_t) e.counts.size());
            const int64_t ne0 = (int64_t) e.sums.size() / nc; double tot = 0;
            for (int64_t k = 0; k < nc; k++) {
                double c = L.is_legacy ? (e.counts.empty() ? 1.0 : (double) e.counts[0]) : (double) e.counts[k];
                for (int64_t r = 0; r < ne0; r++) x.w[k * ne0 + r] = c > 0 ? (float) (e.sums[k * ne0 + r] / c) : 1.0f;
                x.freq.push_back(std::max(0.0, c)); tot += std::max(0.0, c);
            }
            // share of picks, scaled so a layer's experts sum to the number of experts (1 each if all were equal)
            for (auto & f : x.freq) f = tot > 0 ? f * nc / tot : 1.0;
            im[name] = std::move(x);
        }
        fprintf(stderr, "tensor_err: %zu imatrix entries\n", im.size());
    }
    for (auto t : types) ggml_quantize_init(t);

    std::mutex out_mu; std::atomic<size_t> next{0};
    printf("# name\ttype\tbytes\terr\tref\trows_sampled\trows_total\n");
    auto work = [&]() {
        std::vector<float> src, deq; std::vector<uint8_t> q;
        for (size_t ji; (ji = next++) < jobs.size();) {
            const job & j = jobs[ji];
            const int64_t ne0 = j.ne[0], rows_e = j.ne[1] * std::max<int64_t>(1, j.ne[3]), nexp = std::max<int64_t>(1, j.ne[2]);
            const size_t src_row = ggml_row_size(j.src_type, ne0);
            auto it = im.find(j.name); const imx * w = it != im.end() ? &it->second : nullptr;
            // which experts and rows: evenly spaced, the same for every type (so types are compared on the same weights)
            std::vector<int64_t> exps; int64_t ns = std::min<int64_t>(nexp, experts_max);
            for (int64_t k = 0; k < ns; k++) exps.push_back(k * nexp / ns);
            int64_t rows_per = std::min<int64_t>(rows_e, std::max<int64_t>(1, rows_max / ns));
            std::vector<std::pair<std::string, std::string>> lines;
            std::vector<double> err(types.size(), 0), ref(types.size(), 0); std::vector<bool> ok(types.size(), true);
            int64_t sampled = 0;
            for (int64_t e : exps) {
                const float * iw = nullptr; double fr = 1.0;
                if (w && w->have) {
                    if ((int64_t) w->w.size() == ne0 * nexp) { iw = w->w.data() + e * ne0; fr = w->freq.size() == (size_t) nexp ? w->freq[e] : 1.0; }
                    else if ((int64_t) w->w.size() == ne0) iw = w->w.data();
                }
                src.resize(rows_per * ne0); deq.resize(rows_per * ne0);
                for (int64_t r = 0; r < rows_per; r++) {
                    int64_t row = r * rows_e / rows_per;   // spread over the expert's rows
                    const uint8_t * p = base + j.offset + (e * rows_e + row) * src_row;
                    if (j.src_type == GGML_TYPE_F32) memcpy(src.data() + r * ne0, p, ne0 * sizeof(float));
                    else ggml_get_type_traits(j.src_type)->to_float(p, src.data() + r * ne0, ne0);
                }
                sampled += rows_per;
                for (size_t ti = 0; ti < types.size(); ti++) {
                    ggml_type T = types[ti];
                    if (ne0 % ggml_blck_size(T) || (!iw && ggml_quantize_requires_imatrix(T))) { ok[ti] = false; continue; }
                    q.resize(ggml_row_size(T, ne0) * rows_per);
                    ggml_quantize_chunk(T, src.data(), q.data(), 0, rows_per, ne0, iw);
                    ggml_get_type_traits(T)->to_float(q.data(), deq.data(), rows_per * ne0);
                    double es = 0, rs = 0;
                    for (int64_t r = 0; r < rows_per; r++) for (int64_t c = 0; c < ne0; c++) {
                        double a = src[r * ne0 + c], d = a - deq[r * ne0 + c], wt = iw ? iw[c] : 1.0;
                        es += wt * d * d; rs += wt * a * a;
                    }
                    err[ti] += fr * es; ref[ti] += fr * rs;
                }
            }
            const double scale = (double) (rows_e * nexp) / (double) sampled;
            std::string buf;
            for (size_t ti = 0; ti < types.size(); ti++) {
                if (!ok[ti]) continue;
                std::string tn = ggml_type_name(types[ti]); for (auto & ch : tn) ch = (char) tolower(ch);
                char line[512];
                snprintf(line, sizeof line, "%s\t%s\t%zu\t%.6e\t%.6e\t%" PRId64 "\t%" PRId64 "\n", j.name.c_str(), tn.c_str(),
                         ggml_row_size(types[ti], ne0) * (size_t) (rows_e * nexp), err[ti] * scale, ref[ti] * scale, sampled, rows_e * nexp);
                buf += line;
            }
            std::lock_guard<std::mutex> lk(out_mu); fputs(buf.c_str(), stdout); fflush(stdout);
            fprintf(stderr, "tensor_err: %zu/%zu %s\n", ji + 1, jobs.size(), j.name.c_str());
        }
    };
    std::vector<std::thread> th; for (int k = 0; k < nthreads; k++) th.emplace_back(work);
    for (auto & t : th) t.join();
    munmap((void *) base, st.st_size); close(fd); gguf_free(g); ggml_free(meta);
    return 0;
}
