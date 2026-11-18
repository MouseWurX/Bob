// Brain Engine 0025/0026 test driver: the attention mask made from positions (LLAMA_KQ_MASK_BUILD=1) or read as
// positions by flash attention with no table (LLAMA_KQ_MASK_POS=1) must give the same odds, bit for bit, as the stock
// table filled on the processor. Built and run by mask-made.py.
//   mask-made <brain.gguf> <flash 0|1> <unified 0|1> <chats> <step (n_ubatch)> <prompt words> [build|pos]
// One run does, for each setting: every chat reads a prompt (all chats in one batch), the chats write 24 words side
// by side, chat 0 forgets its middle (a hole in the cache, like prompt-cache reuse) and reads 9 words again, every
// chat shifts back 5 positions (context shift), chat 1 is copied into a new chat that writes 8 more words, then
// every chat writes 6 words. Every odds row is kept; the two settings must match exactly.
#include "llama.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

static int g_made = 0, g_graphs = 0;
static void log_cb(ggml_log_level, const char * text, void *) {
    if (strstr(text, "attention mask made from positions")) g_made++;
    if (strstr(text, "attention mask made in the graph"))   g_graphs++;
    if (strstr(text, "attention mask as positions:"))      g_graphs++;
    if (strstr(text, "attention mask as positions (no table)")) g_made++;
    if (getenv("MASK_MADE_VERBOSE")) fputs(text, stderr);
}

static const char * g_knob = "LLAMA_KQ_MASK_BUILD";

static bool run(llama_model * model, bool build, bool fa, bool kvu, int n_chats, int ub, int n_prompt, std::vector<float> & out) {
#ifdef _WIN32
    _putenv_s(g_knob, build ? "1" : "0");
#else
    setenv(g_knob, build ? "1" : "0", 1);
#endif
    llama_context_params cp = llama_context_default_params();
    cp.n_ctx      = 512;
    cp.n_batch    = 512;
    cp.n_ubatch   = ub;
    cp.n_seq_max  = n_chats + 1;
    cp.kv_unified = kvu;
    cp.flash_attn_type = fa ? LLAMA_FLASH_ATTN_TYPE_ENABLED : LLAMA_FLASH_ATTN_TYPE_DISABLED;
    cp.n_threads = 1; cp.n_threads_batch = 1; // one thread: the same sums in the same order every run
    llama_context * ctx = llama_init_from_model(model, cp);
    if (!ctx) { printf("FAIL no context\n"); return false; }
    const llama_vocab * vocab = llama_model_get_vocab(model);
    const int n_vocab = llama_vocab_n_tokens(vocab);
    llama_memory_t mem = llama_get_memory(ctx);

    std::vector<llama_pos> pos(n_chats + 1, 0);
    std::vector<llama_token> last(n_chats + 1, 1);
    llama_batch b = llama_batch_init(512, 0, 1);
    auto keep = [&](int n_out) {
        for (int i = 0; i < n_out; i++) {
            const float * l = llama_get_logits_ith(ctx, i);
            out.insert(out.end(), l, l + n_vocab);
        }
    };
    auto argmax = [&](int i) {
        const float * l = llama_get_logits_ith(ctx, i);
        int best = 0; for (int k = 1; k < n_vocab; k++) if (l[k] > l[best]) best = k;
        return (llama_token) best;
    };
    unsigned seed = 7;
    auto rnd = [&]() { seed = seed * 1103515245u + 12345u; return (llama_token) (100 + (seed >> 8) % (unsigned) (n_vocab - 200)); };

    // prompts, all chats in one batch, every row's odds kept
    b.n_tokens = 0;
    for (int c = 0; c < n_chats; c++) {
        for (int k = 0; k < n_prompt + c*3; k++) {
            int i = b.n_tokens++;
            b.token[i] = rnd(); b.pos[i] = pos[c]++; b.n_seq_id[i] = 1; b.seq_id[i][0] = c; b.logits[i] = 1;
        }
    }
    if (llama_decode(ctx, b) != 0) { printf("FAIL decode prompt\n"); return false; }
    keep(b.n_tokens);
    { int i = 0; for (int c = 0; c < n_chats; c++) { i += n_prompt + c*3; last[c] = argmax(i - 1); } }

    auto write = [&](const std::vector<int> & chats, int n_words) {
        for (int w = 0; w < n_words; w++) {
            b.n_tokens = 0;
            for (int c : chats) {
                int i = b.n_tokens++;
                b.token[i] = last[c]; b.pos[i] = pos[c]++; b.n_seq_id[i] = 1; b.seq_id[i][0] = c; b.logits[i] = 1;
            }
            if (llama_decode(ctx, b) != 0) { printf("FAIL decode word\n"); return false; }
            keep(b.n_tokens);
            for (int i = 0; i < (int) chats.size(); i++) last[chats[i]] = argmax(i);
        }
        return true;
    };
    std::vector<int> all; for (int c = 0; c < n_chats; c++) all.push_back(c);
    if (!write(all, 24)) return false;

    // a hole in chat 0, then read again into it
    const llama_pos p0 = pos[0];
    llama_memory_seq_rm(mem, 0, p0/3, p0/2);
    b.n_tokens = 0;
    for (int k = 0; k < 9; k++) {
        int i = b.n_tokens++;
        b.token[i] = rnd(); b.pos[i] = pos[0]++; b.n_seq_id[i] = 1; b.seq_id[i][0] = 0; b.logits[i] = 1;
    }
    if (llama_decode(ctx, b) != 0) { printf("FAIL decode refill\n"); return false; }
    keep(b.n_tokens); last[0] = argmax(b.n_tokens - 1);

    // context shift: every chat moves back 5 (shifts the cells' positions); done before the copy, because in one
    // shared cache a copied chat shares its cells, and shifting both chats would move those cells twice
    if (llama_memory_can_shift(mem)) {
        for (int c : all) {
            llama_memory_seq_rm (mem, c, 0, 5);
            llama_memory_seq_add(mem, c, 5, -1, -5);
            pos[c] -= 5;
        }
    }
    // copy a chat (in one shared cache the cells then belong to two chats) and write in the copy
    llama_memory_seq_cp(mem, n_chats > 1 ? 1 : 0, n_chats, -1, -1);
    pos[n_chats] = pos[n_chats > 1 ? 1 : 0]; last[n_chats] = last[n_chats > 1 ? 1 : 0];
    if (!write({n_chats}, 8)) return false;
    all.push_back(n_chats);

    if (!write(all, 6)) return false;

    llama_batch_free(b);
    llama_free(ctx);
    return true;
}

int main(int argc, char ** argv) {
    if (argc < 7) { printf("usage: mask-made <brain.gguf> <flash 0|1> <unified 0|1> <chats> <step> <prompt words>\n"); return 2; }
    llama_log_set(log_cb, nullptr);
    llama_backend_init();
    llama_model_params mp = llama_model_default_params();
    mp.n_gpu_layers = 0;
    llama_model * model = llama_model_load_from_file(argv[1], mp);
    if (!model) { printf("FAIL no brain\n"); return 1; }
    const bool fa = atoi(argv[2]) != 0, kvu = atoi(argv[3]) != 0;
    const int chats = atoi(argv[4]), ub = atoi(argv[5]), np = atoi(argv[6]);
    if (argc > 7 && strcmp(argv[7], "pos") == 0) g_knob = "LLAMA_KQ_MASK_POS";

    std::vector<float> a, m;
    if (!run(model, false, fa, kvu, chats, ub, np, a)) return 1;
    const int made_before = g_made;
    if (!run(model, true,  fa, kvu, chats, ub, np, m)) return 1;
    if (g_made == made_before) { printf("FAIL the made mask was not switched on\n"); return 1; }
    if (g_graphs == 0) { printf("FAIL no graph made the mask (every batch fell back to the table)\n"); return 1; }
    size_t diff = 0;
    if (a.size() != m.size()) { printf("FAIL %zu vs %zu odds\n", a.size(), m.size()); return 1; }
    for (size_t i = 0; i < a.size(); i++) if (memcmp(&a[i], &m[i], sizeof(float)) != 0) diff++;
    printf("%s %zu odds compared, %zu differ, %d masks made from positions (%s, flash %d, unified %d, chats %d, step %d)\n",
           diff == 0 ? "PASS" : "FAIL", a.size(), diff, g_graphs, g_knob, fa, kvu, chats, ub);
    llama_model_free(model);
    return diff == 0 ? 0 : 1;
}
