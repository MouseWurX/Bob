// Brain Engine 0104 test helper (built by tool-call-parsers.mjs): one chat template, Bob's real tool list, and a set of
// replies a brain might write. Prints the prompt, the grammar and how each reply parses, streamed token by token as the
// server does, plus whether the server's grammar lets those exact tokens through.
// A case: {"name","think":bool,"text"}. In text, a part between \x01 and \x02 is tokenized as plain text (no specials).
#include "chat.h"
#include "json.h"
#include "common.h"
#include "sampling.h"
#include "llama.h"
#include <nlohmann/json.hpp>
#include <fstream>
#include <sstream>
#include <iostream>
using json = nlohmann::ordered_json;

static std::string slurp(const std::string & p) { std::ifstream f(p); std::stringstream s; s << f.rdbuf(); std::string r = s.str(); std::string o; for (char c : r) if (c != '\r') o += c; return o; }

static common_chat_input tok_input(const llama_vocab * vocab, const std::string & text) {
    if (!vocab) return common_chat_input(text);
    common_chat_input in;
    size_t i = 0;
    while (i < text.size()) {
        bool plain = text[i] == '\x01';
        size_t start = plain ? i + 1 : i;
        size_t end = text.find(plain ? '\x02' : '\x01', start);
        if (end == std::string::npos) end = text.size();
        std::string part = text.substr(start, end - start);
        std::vector<llama_token> toks(part.size() + 16);
        int n = llama_tokenize(vocab, part.c_str(), part.size(), toks.data(), toks.size(), false, !plain);
        toks.resize(n);
        for (auto t : toks) { char buf[256]; int m = llama_token_to_piece(vocab, t, buf, sizeof buf, 0, true); in.append(std::string(buf, m), t); }
        i = plain ? end + 1 : end;
    }
    return in;
}

static json msg_json(const common_chat_msg & m) {
    json j; j["content"] = m.content; j["reasoning"] = m.reasoning_content; j["calls"] = json::array();
    for (auto & c : m.tool_calls) j["calls"].push_back({{"name", c.name}, {"args", c.arguments}});
    return j;
}

int main(int argc, char ** argv) {
    if (argc < 6) { fprintf(stderr, "usage\n"); return 1; }
    llama_log_set([](ggml_log_level, const char *, void *) {}, nullptr);
    llama_backend_init();
    llama_model * model = nullptr;
    if (std::string(argv[2]) != "-") {
        auto mp = llama_model_default_params(); mp.vocab_only = true;
        model = llama_model_load_from_file(argv[2], mp);
        if (!model) { fprintf(stderr, "no vocab\n"); return 1; }
    }
    const llama_vocab * vocab = model ? llama_model_get_vocab(model) : nullptr;
    auto tmpls = common_chat_templates_init(model, slurp(argv[1]));
    auto tools = common_chat_tools_parse_oaicompat(common_json::parse(slurp(argv[3])));
    json cases = json::parse(slurp(argv[4]));
    json out; out["cases"] = json::array();
    for (bool think : {false, true}) {
        common_chat_templates_inputs in;
        common_chat_msg sys; sys.role = "system"; sys.content = "You are Bob.";
        common_chat_msg u; u.role = "user"; u.content = "Read my notes file.";
        in.messages = {sys, u}; in.tools = tools; in.parallel_tool_calls = true;
        in.reasoning_format = COMMON_REASONING_FORMAT_DEEPSEEK; in.enable_thinking = think;
        in.now = std::chrono::system_clock::from_time_t(1700000000);
        common_chat_session s(tmpls.get(), vocab, in);
        common_params_sampling sp; s.apply_sampling(sp);
        json k; k["format"] = common_chat_format_name(s.format()); k["prompt"] = s.prompt().str();
        k["grammar"] = sp.grammar.grammar; k["lazy"] = sp.grammar_lazy; k["gen_prompt"] = s.generation_prompt();
        k["triggers"] = json::array(); for (auto & t : sp.grammar_triggers) k["triggers"].push_back({{"type", (int) t.type}, {"value", t.value}, {"token", t.token}});
        out[think ? "think_on" : "think_off"] = k;
    }
    for (auto & c : cases) {
        bool think = c.value("think", false);
        common_chat_templates_inputs in;
        common_chat_msg u; u.role = "user"; u.content = "Read my notes file.";
        in.messages = {u}; in.tools = tools; in.parallel_tool_calls = true;
        in.reasoning_format = COMMON_REASONING_FORMAT_DEEPSEEK; in.enable_thinking = think;
        in.now = std::chrono::system_clock::from_time_t(1700000000);
        json r; r["name"] = c["name"]; r["think"] = think;
        try {
            common_chat_session s(tmpls.get(), vocab, in);
            common_params_sampling sp; s.apply_sampling(sp);
            auto inp = tok_input(vocab, c["text"].get<std::string>());
            // stream token by token, like the server; note any partial tool call that the final one contradicts
            json partial_names = json::array();
            std::string err;
            for (size_t i = 0; i < inp.text.size(); ) {
                size_t j = i + 1;
                if (!vocab) { j = std::min(inp.text.size(), i + 7); }
                else { while (j < inp.text.size() && inp.tokens[j] == LLAMA_TOKEN_NULL) j++; }
                try { auto & m = s.feed(inp.substr(i, j - i)); for (auto & tc : m.tool_calls) if (!tc.name.empty()) partial_names.push_back(tc.name); }
                catch (const std::exception & e) { if (err.empty()) err = std::string("partial: ") + e.what(); }
                i = j;
            }
            try { r["final"] = msg_json(s.finish()); } catch (const std::exception & e) { r["final_error"] = e.what(); }
            if (!err.empty()) r["partial_error"] = err;
            // grammar: would the server's grammar sampler let these exact tokens through?
            if (vocab && !sp.grammar.grammar.empty()) {
                common_sampler * gs = common_sampler_init(model, sp);
                std::string gerr; size_t at = 0;
                if (!gs) gerr = "grammar did not build";
                else { for (size_t i = 0; i < inp.tokens.size(); i++) { if (inp.tokens[i] == LLAMA_TOKEN_NULL) continue; try { common_sampler_accept(gs, inp.tokens[i], true); } catch (const std::exception & e) { gerr = e.what(); at = i; break; } } common_sampler_free(gs); }
                r["grammar_ok"] = gerr.empty(); if (!gerr.empty()) { r["grammar_error"] = gerr; r["grammar_at"] = inp.substr(0, at).text.substr(at > 80 ? at - 80 : 0); r["grammar_at_tok"] = at; }
            }
        } catch (const std::exception & e) { r["error"] = e.what(); }
        out["cases"].push_back(r);
    }
    std::ofstream(argv[5]) << out.dump(1);
    if (model) llama_model_free(model);
    return 0;
}
