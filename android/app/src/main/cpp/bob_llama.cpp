// Bob's phone brain: a thin layer over llama.cpp for Llama.kt.
//
// Why not llama.cpp's example engine: Bob needs the model's own chat template (Jinja, from the GGUF), tool calls in
// and out (lending to another Bob), and the prompt cache kept between replies. Each reply here re-reads only the part
// of the conversation that changed since the last one, so a phone CPU isn't re-reading Bob's whole instructions.
//
// One conversation at a time, one thread at a time (Llama.kt calls everything from a single thread). Strings cross
// JNI as UTF-8 byte arrays, because Java's "modified UTF-8" mangles emoji.
#include <jni.h>
#include <android/log.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <memory>
#include <string>
#include <vector>
#include <unistd.h>

#include "llama.h"
#include "common.h"
#include "chat.h"
#include "sampling.h"
#include "json.h"

#define TAG "BobBrain"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static llama_model *   g_model = nullptr;
static llama_context * g_ctx   = nullptr;
static common_chat_templates_ptr g_tmpls;
static common_sampler *          g_smpl = nullptr;
static common_batch              g_batch;
static int  g_n_ctx   = 8192;
static int  g_n_batch = 512;

static std::vector<llama_token> g_cache; // tokens whose memory is in the context, in order
static std::vector<llama_token> g_todo;  // prompt tokens still to read
static std::unique_ptr<common_chat_session> g_session;
static std::vector<std::string> g_stops;
static std::string g_raw;   // everything generated this reply
static std::string g_sent;  // the part of the parsed content already handed out
static int  g_generated = 0;
static int  g_max_new   = 0;
static bool g_done      = true;
static std::string g_stop_reason;
static std::atomic<bool> g_abort{false};

// ---------- small helpers ----------
static std::string bytes_in(JNIEnv * env, jbyteArray a) {
    if (!a) return {};
    const jsize n = env->GetArrayLength(a);
    std::string s((size_t) n, '\0');
    if (n > 0) env->GetByteArrayRegion(a, 0, n, reinterpret_cast<jbyte *>(&s[0]));
    return s;
}

static jbyteArray bytes_out(JNIEnv * env, const std::string & s) {
    jbyteArray a = env->NewByteArray((jsize) s.size());
    if (a && !s.empty()) env->SetByteArrayRegion(a, 0, (jsize) s.size(), reinterpret_cast<const jbyte *>(s.data()));
    return a;
}

static std::string json_error(const std::string & why) {
    common_json o = common_json::object();
    o["error"] = why;
    return o.dump();
}

// How many bytes at the start of s are whole UTF-8 characters (a token can end half-way through one).
static size_t utf8_whole(const std::string & s) {
    if (s.empty()) return 0;
    // step back over at most 3 continuation bytes to the lead byte of the last character
    size_t j = s.size() - 1;
    int cont = 0;
    while (j > 0 && cont < 3 && (((unsigned char) s[j]) & 0xC0) == 0x80) { j--; cont++; }
    const unsigned char lead = (unsigned char) s[j];
    int need = 1;
    if ((lead & 0x80) == 0x00) need = 1;
    else if ((lead & 0xE0) == 0xC0) need = 2;
    else if ((lead & 0xF0) == 0xE0) need = 3;
    else if ((lead & 0xF8) == 0xF0) need = 4;
    else return s.size(); // not UTF-8 at all: hand it over as it is
    return (cont + 1 >= need) ? s.size() : j;
}

static bool on_abort(void *) { return g_abort.load(); }

static void free_sampler() {
    if (g_smpl) { common_sampler_free(g_smpl); g_smpl = nullptr; }
}

static void forget_cache() {
    if (g_ctx) llama_memory_clear(llama_get_memory(g_ctx), true);
    g_cache.clear();
}

// ---------- JNI: ca.mousewurx.bob.Llama ----------
extern "C" JNIEXPORT void JNICALL
Java_ca_mousewurx_bob_Llama_nativeInit(JNIEnv * env, jobject, jbyteArray libDir) {
    const std::string dir = bytes_in(env, libDir);
    ggml_backend_load_all_from_path(dir.c_str());
    llama_backend_init();
    LOGI("backends loaded from %s", dir.c_str());
}

// 0 ok, 1 model didn't load, 2 no room for its memory
extern "C" JNIEXPORT jint JNICALL
Java_ca_mousewurx_bob_Llama_nativeLoad(JNIEnv * env, jobject, jbyteArray path, jint nCtx, jint threads) {
    const std::string p = bytes_in(env, path);
    llama_model_params mp = llama_model_default_params();
    g_model = llama_model_load_from_file(p.c_str(), mp);
    if (!g_model) return 1;

    g_n_ctx = std::max(2048, (int) nCtx);
    llama_context_params cp = llama_context_default_params();
    cp.n_ctx           = g_n_ctx;
    cp.n_batch         = g_n_batch;
    cp.n_ubatch        = g_n_batch;
    cp.n_threads       = threads;
    cp.n_threads_batch = threads;
    cp.abort_callback  = on_abort;
    cp.abort_callback_data = nullptr;
    // Full-size sliding-window memory (Gemma), so a reply can reuse what the last one read. Too big: fall back.
    cp.swa_full = true;
    g_ctx = llama_init_from_model(g_model, cp);
    if (!g_ctx) {
        cp.swa_full = false;
        g_ctx = llama_init_from_model(g_model, cp);
    }
    if (!g_ctx) { llama_model_free(g_model); g_model = nullptr; return 2; }

    g_batch = common_batch(g_ctx);
    g_tmpls = common_chat_templates_init(g_model, "");
    g_cache.clear();
    g_todo.clear();
    g_done = true;
    LOGI("loaded, n_ctx %d, %d threads", g_n_ctx, (int) threads);
    return 0;
}

extern "C" JNIEXPORT void JNICALL
Java_ca_mousewurx_bob_Llama_nativeUnload(JNIEnv *, jobject) {
    free_sampler();
    g_session.reset();
    g_tmpls.reset();
    g_batch = common_batch();
    if (g_ctx) { llama_free(g_ctx); g_ctx = nullptr; }
    if (g_model) { llama_model_free(g_model); g_model = nullptr; }
    g_cache.clear();
    g_todo.clear();
    g_done = true;
}

extern "C" JNIEXPORT void JNICALL
Java_ca_mousewurx_bob_Llama_nativeAbort(JNIEnv *, jobject, jboolean on) {
    g_abort.store(on == JNI_TRUE);
}

// Starts a reply: renders the chat with the model's own template, works out how much of it is already read,
// and sets up sampling (with the tool-call grammar when tools are given).
// messages and tools are OpenAI-style JSON arrays. Answers JSON: {tokens, reused, todo} or {error, tokens?}.
extern "C" JNIEXPORT jbyteArray JNICALL
Java_ca_mousewurx_bob_Llama_nativeStart(JNIEnv * env, jobject, jbyteArray messages, jbyteArray tools,
                                        jint maxNew, jfloat temp, jboolean think) {
    if (!g_ctx) return bytes_out(env, json_error("not loaded"));
    g_abort.store(false);
    g_session.reset();
    free_sampler();
    g_todo.clear();
    g_raw.clear();
    g_sent.clear();
    g_generated = 0;
    g_max_new   = std::max(16, (int) maxNew);
    g_done      = false;
    g_stop_reason.clear();

    const llama_vocab * vocab = llama_model_get_vocab(g_model);
    std::vector<llama_token> toks;
    try {
        common_chat_templates_inputs in;
        in.messages = common_chat_msgs_parse_oaicompat(common_json::parse(bytes_in(env, messages)));
        const std::string t = bytes_in(env, tools);
        if (!t.empty() && t != "[]") {
            in.tools = common_chat_tools_parse_oaicompat(common_json::parse(t));
            in.tool_choice = COMMON_CHAT_TOOL_CHOICE_AUTO;
            in.parallel_tool_calls = true;
        }
        in.add_generation_prompt = true;
        in.use_jinja        = true;
        in.enable_thinking  = think == JNI_TRUE;
        in.reasoning_format = COMMON_REASONING_FORMAT_AUTO;
        g_session = std::make_unique<common_chat_session>(g_tmpls.get(), vocab, in);

        // Template text may hold special tokens; what people wrote may not (so nobody can type a fake turn).
        bool first = true;
        for (const auto & part : g_session->prompt().parts) {
            auto pt = common_tokenize(vocab, part.text, first, !part.is_input);
            toks.insert(toks.end(), pt.begin(), pt.end());
            first = false;
        }
    } catch (const std::exception & e) {
        g_done = true;
        LOGE("start: %s", e.what());
        return bytes_out(env, json_error(std::string("couldn't read the chat: ") + e.what()));
    }
    if (toks.empty()) { g_done = true; return bytes_out(env, json_error("empty chat")); }

    if ((int) toks.size() + g_max_new > g_n_ctx - 4) {
        g_done = true;
        common_json o = common_json::object();
        o["error"]  = "too long";
        o["tokens"] = (int64_t) toks.size();
        o["ctx"]    = (int64_t) g_n_ctx;
        return bytes_out(env, o.dump());
    }

    // The longest stretch at the start that's already read stays; only the rest is read again.
    size_t keep = 0;
    while (keep < g_cache.size() && keep < toks.size() && g_cache[keep] == toks[keep]) keep++;
    if (keep == toks.size()) keep--; // the last token is always read again, for fresh odds of the next word
    llama_memory_t mem = llama_get_memory(g_ctx);
    if (keep < g_cache.size()) {
        // Some memories (sliding windows, recurrent layers) can't drop their tail: then start from scratch.
        if (!llama_memory_seq_rm(mem, 0, (llama_pos) keep, -1)) { forget_cache(); keep = 0; }
        else g_cache.resize(keep);
    }
    if (keep > 0 && llama_memory_seq_pos_min(mem, 0) > 0) { forget_cache(); keep = 0; }
    g_todo.assign(toks.begin() + (long) keep, toks.end());

    common_params_sampling sp;
    sp.temp  = temp;
    sp.top_k = 40;
    sp.top_p = 0.95f;
    sp.min_p = 0.05f;
    g_session->apply_sampling(sp);
    g_smpl = common_sampler_init(g_model, sp);
    if (!g_smpl) {
        // A grammar the sampler can't build: carry on without it (the reply is still parsed for tool calls).
        common_params_sampling plain;
        plain.temp = temp; plain.top_k = 40; plain.top_p = 0.95f; plain.min_p = 0.05f;
        g_smpl = common_sampler_init(g_model, plain);
    }
    if (!g_smpl) { g_done = true; return bytes_out(env, json_error("sampler")); }
    g_stops = g_session->additional_stops();

    common_json o = common_json::object();
    o["tokens"] = (int64_t) toks.size();
    o["reused"] = (int64_t) keep;
    o["todo"]   = (int64_t) g_todo.size();
    return bytes_out(env, o.dump());
}

// Reads up to maxTokens more of the prompt. Answers how many are still to read (0: ready to write), or -1.
extern "C" JNIEXPORT jint JNICALL
Java_ca_mousewurx_bob_Llama_nativeIngest(JNIEnv *, jobject, jint maxTokens) {
    if (!g_ctx || g_done) return -1;
    int budget = std::max(1, (int) maxTokens);
    while (!g_todo.empty() && budget > 0) {
        const int n = std::min({ (int) g_todo.size(), g_n_batch, budget });
        const bool last = n == (int) g_todo.size();
        g_batch.clear();
        const llama_pos start = (llama_pos) g_cache.size();
        for (int i = 0; i < n; i++) g_batch.add(g_todo[i], start + i, 0, last && i == n - 1);
        if (llama_process(g_ctx, LLAMA_PROCESS_TYPE_DECODE, g_batch.get()) != 0) {
            // Stopped or failed half-way: the memory is unknown now, so it starts fresh next time.
            forget_cache();
            g_done = true;
            g_stop_reason = g_abort.load() ? "stopped" : "error";
            return -1;
        }
        g_cache.insert(g_cache.end(), g_todo.begin(), g_todo.begin() + n);
        g_todo.erase(g_todo.begin(), g_todo.begin() + n);
        budget -= n;
    }
    return (jint) g_todo.size();
}

// The next bit of reply text (may be empty while a tool call is being written), or null when the reply is over.
extern "C" JNIEXPORT jbyteArray JNICALL
Java_ca_mousewurx_bob_Llama_nativeNext(JNIEnv * env, jobject) {
    if (!g_ctx || g_done || !g_todo.empty() || !g_smpl) return nullptr;
    if (g_abort.load()) { g_done = true; g_stop_reason = "stopped"; return nullptr; }
    if (g_generated >= g_max_new || (int) g_cache.size() >= g_n_ctx - 2) { g_done = true; g_stop_reason = "length"; return nullptr; }

    const llama_vocab * vocab = llama_model_get_vocab(g_model);
    const llama_token t = common_sampler_sample(g_smpl, g_ctx, -1);
    common_sampler_accept(g_smpl, t, true);
    if (llama_vocab_is_eog(vocab, t)) { g_done = true; g_stop_reason = "end"; return nullptr; }

    g_batch.clear();
    g_batch.add(t, (llama_pos) g_cache.size(), 0, true);
    if (llama_process(g_ctx, LLAMA_PROCESS_TYPE_DECODE, g_batch.get()) != 0) {
        forget_cache();
        g_done = true;
        g_stop_reason = g_abort.load() ? "stopped" : "error";
        return nullptr;
    }
    g_cache.push_back(t);
    g_generated++;

    const std::string piece = common_token_to_piece(g_ctx, t, true);
    g_raw += piece;
    try {
        common_chat_input chunk;
        chunk.append(piece, t);
        const common_chat_msg & msg = g_session->feed(chunk);
        for (const auto & s : g_stops) {
            if (!s.empty() && g_raw.size() >= s.size() && g_raw.compare(g_raw.size() - s.size(), s.size(), s) == 0) {
                g_done = true; g_stop_reason = "end";
            }
        }
        // Hand out only new, whole characters of the parsed reply text (tool-call markup never shows as words).
        if (msg.content.size() > g_sent.size() && msg.content.compare(0, g_sent.size(), g_sent) == 0) {
            const std::string whole = msg.content.substr(0, utf8_whole(msg.content));
            if (whole.size() > g_sent.size()) {
                const std::string delta = whole.substr(g_sent.size());
                g_sent = whole;
                return bytes_out(env, delta);
            }
        }
    } catch (const std::exception & e) {
        LOGE("partial parse: %s", e.what());
    }
    return bytes_out(env, "");
}

// The finished reply: JSON {content, reasoning, tool_calls: [{name, arguments}], tokens, stop}.
extern "C" JNIEXPORT jbyteArray JNICALL
Java_ca_mousewurx_bob_Llama_nativeFinish(JNIEnv * env, jobject) {
    common_json o = common_json::object();
    common_json calls = common_json::array();
    std::string content = g_raw, reasoning;
    if (g_session) {
        try {
            const common_chat_msg & m = g_session->finish();
            content   = m.content;
            reasoning = m.reasoning_content;
            for (const auto & c : m.tool_calls) {
                calls.push_back({ { "name", c.name }, { "arguments", c.arguments } });
            }
        } catch (const std::exception & e) {
            LOGE("parse: %s", e.what());
        }
    }
    o["content"]    = content;
    o["reasoning"]  = reasoning;
    o["tool_calls"] = calls;
    o["tokens"]     = (int64_t) g_generated;
    o["stop"]       = g_stop_reason.empty() ? std::string("end") : g_stop_reason;
    g_session.reset();
    free_sampler();
    g_done = true;
    return bytes_out(env, o.dump_safe());
}

// Test speed: read pp tokens, then write tg, on the loaded brain. Answers JSON {pp, tg} in tokens a second.
extern "C" JNIEXPORT jbyteArray JNICALL
Java_ca_mousewurx_bob_Llama_nativeBench(JNIEnv * env, jobject, jint pp, jint tg) {
    if (!g_ctx) return bytes_out(env, json_error("not loaded"));
    g_abort.store(false);
    forget_cache();
    const llama_vocab * vocab = llama_model_get_vocab(g_model);
    const llama_token any = llama_vocab_bos(vocab) >= 0 ? llama_vocab_bos(vocab) : 0;
    using clk = std::chrono::steady_clock;

    const int n_pp = std::min((int) pp, g_n_batch);
    g_batch.clear();
    for (int i = 0; i < n_pp; i++) g_batch.add(any, i, 0, i == n_pp - 1);
    const auto t0 = clk::now();
    if (llama_process(g_ctx, LLAMA_PROCESS_TYPE_DECODE, g_batch.get()) != 0) { forget_cache(); return bytes_out(env, json_error("reading failed")); }
    const auto t1 = clk::now();
    for (int i = 0; i < tg; i++) {
        g_batch.clear();
        g_batch.add(any, n_pp + i, 0, true);
        if (llama_process(g_ctx, LLAMA_PROCESS_TYPE_DECODE, g_batch.get()) != 0) { forget_cache(); return bytes_out(env, json_error("writing failed")); }
    }
    const auto t2 = clk::now();
    forget_cache();
    const double s_pp = std::chrono::duration<double>(t1 - t0).count();
    const double s_tg = std::chrono::duration<double>(t2 - t1).count();
    common_json o = common_json::object();
    o["pp"] = s_pp > 0 ? n_pp / s_pp : 0.0;
    o["tg"] = s_tg > 0 ? tg / s_tg : 0.0;
    return bytes_out(env, o.dump());
}
