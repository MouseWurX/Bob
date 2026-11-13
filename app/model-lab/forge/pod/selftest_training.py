#!/usr/bin/env python3
"""Dry run of the new ways to learn on a made-up tiny Qwen3.5-MoE (a few MB, CPU, about a minute). Nothing is downloaded.

  python3 selftest_training.py [--keep <dir>]   (--keep leaves the tiny models and reports there to look at)

Builds a tiny tokenizer + teacher, cuts a student with prune.py, writes made-up lessons and right-vs-wrong pairs, then
runs, each as its own process exactly as run.sh would: teacher.py, heal.py (today's heal, + orpo, + dpo, + kto,
+ on-policy), grpo.py and merge.py (linear, ties, dare, dare_ties). It checks every step finishes, writes its report,
and that the merge math is right (weight 0 = the base's own experts, weight 1 = the trained Bob).
It proves the code runs end to end, not that it helps: that is the held-out test on a real Bob.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
FAILS = []

def check(name, ok, extra=""):
    print(f"{'PASS' if ok else 'FAIL'} {name}{(' ' + extra) if extra else ''}", flush=True)
    if not ok: FAILS.append(name)

TEMPLATE = (
    "{% if tools %}<|im_start|>system\n{% if messages[0].role == 'system' %}{{ messages[0].content }}\n{% endif %}# Tools\n"
    "{% for t in tools %}{{ t | tojson }}\n{% endfor %}<|im_end|>\n"
    "{% elif messages[0].role == 'system' %}<|im_start|>system\n{{ messages[0].content }}<|im_end|>\n{% endif %}"
    "{% for m in messages %}"
    "{% if m.role == 'user' %}<|im_start|>user\n{{ m.content }}<|im_end|>\n"
    "{% elif m.role == 'assistant' %}<|im_start|>assistant\n<think>\n{{ m.reasoning_content or '' }}\n</think>\n\n{{ m.content }}"
    "{% for c in (m.tool_calls or []) %}<tool_call>\n<function={{ c.name }}>\n"
    "{% for k, v in c.arguments.items() %}<parameter={{ k }}>\n{{ v if v is string else (v | tojson) }}\n</parameter>\n{% endfor %}"
    "</function>\n</tool_call>{% endfor %}<|im_end|>\n"
    "{% elif m.role == 'tool' %}<|im_start|>user\n<tool_response>\n{{ m.content }}\n</tool_response><|im_end|>\n{% endif %}"
    "{% endfor %}"
    "{% if add_generation_prompt %}<|im_start|>assistant\n{% if enable_thinking is defined and not enable_thinking %}<think>\n\n</think>\n\n{% endif %}{% endif %}"
)
SPECIAL = ["<|im_start|>", "<|im_end|>", "<|endoftext|>", "<think>", "</think>", "<tool_call>", "</tool_call>", "<tool_response>", "</tool_response>"]

def tiny_tokenizer(d):
    from tokenizers import Tokenizer, models, pre_tokenizers, decoders, trainers
    from transformers import PreTrainedTokenizerFast
    t = Tokenizer(models.BPE()); t.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False); t.decoder = decoders.ByteLevel()
    corpus = ["assistant user system tool function parameter", "Set a reminder for 7:30 tomorrow to call the dentist.", "What is the capital of France? Paris.",
              "zip my project folder please", "Hello! How can I help?", "<function=set_reminder>\n<parameter=when>\n7:30\n</parameter>"] * 20
    t.train_from_iterator(corpus, trainers.BpeTrainer(vocab_size=600, special_tokens=SPECIAL, initial_alphabet=pre_tokenizers.ByteLevel.alphabet()))
    tok = PreTrainedTokenizerFast(tokenizer_object=t, eos_token="<|im_end|>", pad_token="<|endoftext|>", additional_special_tokens=SPECIAL[3:])
    tok.chat_template = TEMPLATE
    tok.save_pretrained(d)
    return tok

def tiny_model(d, vocab):
    from transformers import Qwen3_5MoeConfig, Qwen3_5MoeForConditionalGeneration
    torch.manual_seed(0)
    cfg = Qwen3_5MoeConfig(text_config=dict(vocab_size=vocab, hidden_size=64, num_hidden_layers=4, num_attention_heads=4, num_key_value_heads=2, head_dim=16,
                                             linear_num_key_heads=2, linear_num_value_heads=4, linear_key_head_dim=16, linear_value_head_dim=16,
                                             moe_intermediate_size=32, shared_expert_intermediate_size=32, num_experts=8, num_experts_per_tok=2,
                                             layer_types=["linear_attention", "linear_attention", "linear_attention", "full_attention"], max_position_embeddings=4096),
                           vision_config=dict(depth=1, hidden_size=32, intermediate_size=64, num_heads=2, out_hidden_size=64))
    m = Qwen3_5MoeForConditionalGeneration(cfg).to(torch.bfloat16)
    m.save_pretrained(d, safe_serialization=True)

def lessons(d):
    os.makedirs(d, exist_ok=True)
    tools = [{"type": "function", "function": {"name": "set_reminder", "description": "Set a reminder", "parameters": {"type": "object", "properties": {"when": {"type": "string"}, "what": {"type": "string"}}}}}]
    json.dump({"s1": {"system": "You are Bob.", "tools": tools}}, open(os.path.join(d, "toolsets.json"), "w"))
    call = lambda w, x: [{"id": "c1", "type": "function", "function": {"name": "set_reminder", "arguments": json.dumps({"when": w, "what": x})}}]
    rows, rej = [], []
    for i in range(48):
        idea = f"idea-{i}"
        if i % 2:
            rows.append({"idea": idea, "job": "reminders", "think": False, "messages": [{"role": "user", "content": f"Remind me at 7:{i:02d} to call the dentist"},
                         {"role": "assistant", "set": "s1", "content": "", "tool_calls": call(f"7:{i:02d}", "call the dentist")},
                         {"role": "tool", "tool_call_id": "c1", "name": "set_reminder", "content": "Reminder set."},
                         {"role": "assistant", "set": "s1", "content": f"Done: a reminder at 7:{i:02d}."}]})
            rej.append({"idea": idea, "job": "reminders", "think": False, "why": "wrong time", "messages": [{"role": "user", "content": f"Remind me at 7:{i:02d} to call the dentist"},
                        {"role": "assistant", "set": "s1", "content": "", "tool_calls": call("8:00", "dentist")},
                        {"role": "tool", "tool_call_id": "c1", "name": "set_reminder", "content": "Reminder set."},
                        {"role": "assistant", "set": "s1", "content": "Done."}]})
        else:
            rows.append({"idea": idea, "job": "restraint", "think": False, "messages": [{"role": "user", "content": "What is the capital of France?"}, {"role": "assistant", "set": "s1", "content": "Paris."}]})
            rej.append({"idea": idea, "job": "restraint", "think": False, "why": "tool for nothing", "messages": [{"role": "user", "content": "What is the capital of France?"},
                        {"role": "assistant", "set": "s1", "content": "", "tool_calls": call("now", "France")}]})
    with open(os.path.join(d, "lessons.jsonl"), "w") as f: f.writelines(json.dumps(r) + "\n" for r in rows)
    with open(os.path.join(d, "rejected.jsonl"), "w") as f: f.writelines(json.dumps(r) + "\n" for r in rej)
    return rows, rej

def pref_dir(d, lessons_dir, rows, rej):
    """The shape make-pairs.mjs writes (the Lab's own test checks make-pairs itself)."""
    os.makedirs(d, exist_ok=True); shutil.copy(os.path.join(lessons_dir, "toolsets.json"), d)
    with open(os.path.join(d, "pairs.jsonl"), "w") as f:
        for k, r in zip(rows, rej): f.write(json.dumps({"idea": k["idea"], "source": "lessons", "prompt": k["messages"][:1], "chosen": k["messages"][1:], "rejected": r["messages"][1:]}) + "\n")
    with open(os.path.join(d, "kto.jsonl"), "w") as f:
        for k in rows: f.write(json.dumps({"idea": k["idea"], "prompt": k["messages"][:1], "answer": k["messages"][1:], "ok": True}) + "\n")
        for r in rej: f.write(json.dumps({"idea": r["idea"], "prompt": r["messages"][:1], "answer": r["messages"][1:], "ok": False}) + "\n")
        f.write(json.dumps({"idea": "unsure", "prompt": rows[0]["messages"][:1], "answer": rows[0]["messages"][1:], "ok": None}) + "\n")

def run(name, args, cwd):
    r = subprocess.run([sys.executable, *args], cwd=cwd, capture_output=True, text=True, env={**os.environ, "PYTHONPATH": HERE})
    tail = (r.stdout + r.stderr).strip().splitlines()[-6:]
    check(name, r.returncode == 0, "" if r.returncode == 0 else "\n    " + "\n    ".join(tail))
    return r

def report(path):
    try: return json.load(open(path))
    except (OSError, ValueError): return {}

def reward_cases():
    import tool_reward as R
    cases = json.load(open(os.path.join(HERE, "tool_reward_cases.json")))
    bad = [c for c in cases if R.judge_turn(c["want"], c["got"]) != c["right"]]
    check(f"tool judge agrees with the Lab's tool-score on {len(cases)} cases", not bad, json.dumps(bad[:2]))
    W = [{"name": "set_reminder", "args": {"when": "7:30", "what": "call the dentist"}}]
    xml = "<tool_call>\n<function=set_reminder>\n<parameter=when>\n7:30\n</parameter>\n<parameter=what>\ncall the dentist\n</parameter>\n</function>\n</tool_call>"
    check("a right Qwen3.6 tool call scores 1", R.reward(W, xml)[0] == 1.0)
    check("a right JSON-style tool call scores 1", R.reward(W, '<tool_call>{"name": "set_reminder", "arguments": {"when": "7:30", "what": "Call the dentist"}}</tool_call>')[0] == 1.0)
    check("wrong arguments score 0.3", R.reward(W, xml.replace("7:30", "8:00"))[0] == 0.3)
    check("a tool on a plain chat costs the most", R.reward([], xml)[0] == -0.5 and R.reward([], "Paris.")[0] == 1.0)
    check("a broken tool call costs too", R.reward(W, "<tool_call>{not json</tool_call>")[0] == -0.5)
    check("thinking is not judged", R.reward([], "<think>maybe <tool_call>{\"name\":\"x\"}</tool_call></think>Paris.")[0] == 1.0)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--keep", default=None); a = ap.parse_args()
    root = a.keep or tempfile.mkdtemp(prefix="bob-train-selftest-"); os.makedirs(root, exist_ok=True)
    reward_cases()
    T, S, L, P = (os.path.join(root, x) for x in ("teacher", "cut", "lessons", "pref"))
    tok = tiny_tokenizer(T); tiny_model(T, len(tok))
    rows, rej = lessons(L); pref_dir(P, L, rows, rej)
    json.dump({"layers": [[0, 1, 2, 3, 5, 6]] * 4}, open(os.path.join(root, "keep.json"), "w"))
    run("prune.py cuts the tiny teacher to 6 of 8 experts", [os.path.join(HERE, "prune.py"), "--src", T, "--dst", S, "--keep-file", os.path.join(root, "keep.json"), "--name", "TinyBob"], root)
    run("teacher.py scores the lessons", [os.path.join(HERE, "teacher.py"), "--model", T, "--lessons", L, "--out", os.path.join(root, "teacher.pt"), "--top", "8", "--device", "cpu", "--cache", os.path.join(root, "tok.pt")], root)
    heal = lambda save, *extra: [os.path.join(HERE, "heal.py"), "--model", S, "--lessons", L, "--teacher", os.path.join(root, "teacher.pt"), "--save", os.path.join(root, save),
                                 "--device", "cpu", "--tokens-per-step", "256", "--epochs", "1", "--hours", "0.05", "--cache", os.path.join(root, "tok.pt"), "--eval-lessons", "20", *extra]
    run("heal.py: today's heal", heal("healed"), root)
    for kind in ("orpo", "dpo", "kto"):
        run(f"heal.py + {kind}", heal(f"healed-{kind}", "--pref", P, "--pref-kind", kind, "--pref-every", "2", "--pref-hours", "0.01"), root)
        rep = report(os.path.join(root, f"healed-{kind}", "heal-report.json"))
        ok = rep.get("pref_before", {}).get("pairs") and rep.get("pref_after", {}).get("right_preferred") is not None
        if kind == "orpo": ok = ok and rep.get("pref_mixed", {}).get("pairs", 0) > 0
        else: ok = ok and rep.get("pref_stage", {}).get("steps", 0) > 0
        check(f"{kind}: held-out pairs measured before and after, and it trained", bool(ok), json.dumps({k: rep.get(k) for k in ("pref_before", "pref_after", "pref_mixed", "pref_stage")})[:300])
    tg = json.dumps({"tools": {"jobs": ["reminders"], "weight": 2}, "restraint": {"jobs": ["restraint"], "weight": 0.5}})
    run("heal.py with two targets (tools x2, restraint x0.5)", heal("healed-targets", "--targets", tg, "--pref", P, "--pref-kind", "orpo"), root)
    rep = report(os.path.join(root, "healed-targets", "heal-report.json"))
    check("each target is measured on its own, before and after", all(f"target:{k}" in rep.get("before", {}) and f"target:{k}" in rep.get("after", {}) for k in ("tools", "restraint")) and "no_target_worse" in rep,
          json.dumps({k: list(rep.get(k, {})) for k in ("before", "after")}))
    import targets as TG, random as _r
    t = TG.parse(tg); rows = [{"id": f"idea-{i}"} for i in range(400)]; jobs = {f"idea-{i}": ("reminders" if i % 2 else "restraint") for i in range(400)}
    o = TG.weighted_order(rows, jobs, t, _r.Random(3)); n_tool = sum(1 for i in o if i % 2); n_plain = len(o) - n_tool
    check("the mix follows the weights (about 400 tool lessons, 100 plain)", 380 <= n_tool <= 420 and 70 <= n_plain <= 130, f"{n_tool}/{n_plain}")
    try: TG.parse({"a": {"jobs": ["x"]}, "b": {"jobs": ["x"]}}); check("a job in two targets is refused", False)
    except ValueError: check("a job in two targets is refused", True)
    check("the keep guard spots a loss on one target", not TG.no_target_worse({"a": {"r": 0.5}, "b": {"r": 0.5}}, {"a": {"r": 0.9}, "b": {"r": 0.3}}, "r") and TG.no_target_worse({"a": {"r": 0.5}}, {"a": {"r": 0.6}}, "r"))
    run("heal.py + on-policy (student writes, teacher scores)", heal("healed-onpolicy", "--onpolicy-frac", "0.5", "--onpolicy-teacher", T, "--onpolicy-new", "12", "--onpolicy-top", "8"), root)
    rep = report(os.path.join(root, "healed-onpolicy", "heal-report.json"))
    check("on-policy steps ran and were counted", rep.get("onpolicy", {}).get("steps", 0) > 0, json.dumps(rep.get("onpolicy")))
    grpo = lambda save, *extra: [os.path.join(HERE, "grpo.py"), "--model", os.path.join(root, "healed"), "--lessons", L, "--save", os.path.join(root, save),
                                 "--device", "cpu", "--steps", "3", "--group", "3", "--chats", "2", "--max-new", "16", "--eval-chats", "4", "--hours", "0.05", *extra]
    run("grpo.py: reward pass on tool calls", grpo("grpo"), root)
    rep = report(os.path.join(root, "grpo", "grpo-report.json"))
    check("grpo graded held-out chats before and after", bool(rep) and rep["before"]["chats"] > 0 and rep["after"]["chats"] > 0 and rep["steps"] > 0, json.dumps({k: rep.get(k) for k in ("before", "after", "steps", "learned_steps")})[:300])
    # a tiny random model writes the same kind of answer every time, so nothing differs to learn from: grade at random once to drive the learning path
    shim = os.path.join(root, "grpo_shim.py")
    open(shim, "w").write("import random, sys, runpy, tool_reward as R\nR.reward = lambda want, text: (random.choice([0.0, 1.0]), 'shim')\nsys.argv = sys.argv[1:]\nrunpy.run_path(sys.argv[0], run_name='__main__')\n")
    run("grpo.py learns when answers differ (random grades)", [shim, *grpo("grpo-shim")], root)
    run("grpo.py with targets graded per target", grpo("grpo-targets", "--targets", tg), root)
    rep = report(os.path.join(root, "grpo-targets", "grpo-report.json"))
    check("grpo grades each target on its own", bool(rep.get("before", {}).get("targets")) and "no_target_worse" in rep, json.dumps(rep.get("before", {}).get("targets")))
    rep = report(os.path.join(root, "grpo-shim", "grpo-report.json"))
    check("grpo took learning steps with the KL guard on", rep.get("learned_steps", 0) > 0, json.dumps({k: rep.get(k) for k in ("steps", "learned_steps")}))
    # merge: the healed cut against the full teacher, mapped through bob-keep.json
    from safetensors.torch import load_file
    def weights(d):
        out = {}
        for f in sorted(os.listdir(d)):
            if f.endswith(".safetensors"): out.update(load_file(os.path.join(d, f)))
        return out
    healed, teach = weights(os.path.join(root, "healed")), weights(T)
    # transformers 5 saves experts one by one: the cut's expert 4 is the teacher's expert 5 (keep list 0,1,2,3,5,6)
    name = next(k for k in healed if k.endswith("layers.0.mlp.experts.4.gate_proj.weight")); tname = name.replace("experts.4.", "experts.5.")
    router = next(k for k in healed if k.endswith("layers.0.mlp.gate.weight"))
    for method in ("linear", "ties", "dare", "dare_ties"):
        for w in (0.0, 1.0, 0.5):
            out = os.path.join(root, f"merged-{method}-{w}")
            run(f"merge.py {method} at {w:.0%} trained", [os.path.join(HERE, "merge.py"), "--base", T, "--tuned", os.path.join(root, "healed"), "--out", out, "--method", method, "--weight", str(w), "--density", "1.0" if w != 0.5 else "0.5"], root)
            m = weights(out)
            if w == 0.0: check(f"{method} at 0%: each kept expert is the base's own expert, router rows too", torch.equal(m[name], teach[tname]) and torch.equal(m[router], teach[router][torch.tensor([0, 1, 2, 3, 5, 6])]))
            if w == 1.0: check(f"{method} at 100% (nothing dropped): the trained Bob", torch.equal(m[name], healed[name]))
            if w == 0.5: check(f"{method} at 50%: between the two, every tensor kept its shape", all(m[k].shape == healed[k].shape for k in healed))
    # chosen experts only: layer 0's expert 4 takes the trained change, everything else stays the base
    json.dump({"layers": {"0": [4]}, "rest": "base"}, open(os.path.join(root, "only.json"), "w"))
    out = os.path.join(root, "merged-only")
    run("merge.py --only: a change put on one chosen expert", [os.path.join(HERE, "merge.py"), "--base", T, "--tuned", os.path.join(root, "healed"), "--out", out, "--only", os.path.join(root, "only.json"), "--weight", "1.0"], root)
    m = weights(out); other = name.replace("experts.4.", "experts.3.")
    attn = next(k for k in healed if ".layers.0." in k and "mlp" not in k and k in teach and healed[k].shape == teach[k].shape and not torch.equal(healed[k], teach[k]))
    check("only the chosen expert changed; the rest is the base", torch.equal(m[name], healed[name]) and torch.equal(m[other], teach[other]) and torch.equal(m[attn], teach[attn]))
    base_rows = teach[router][torch.tensor([0, 1, 2, 3, 5, 6])]; others = torch.tensor([0, 1, 2, 3, 5])  # the cut's rows, in the base
    check("the chosen expert's router row moved, the others stayed", torch.equal(m[router][4], healed[router][4]) and torch.equal(m[router][others], base_rows[others]))
    # brain surgery, baked in: one neuron silenced, a whole expert turned down, a head turned up
    json.dump({"edits": [{"layer": 0, "expert": 2, "neuron": 5, "scale": 0}, {"layer": 1, "expert": 3, "scale": 0.5}, {"layer": 0, "expert": "shared", "neuron": 1, "scale": 2}, {"layer": 3, "head": 1, "scale": 1.5}]}, open(os.path.join(root, "edits.json"), "w"))
    out = os.path.join(root, "surgery")
    run("surgery.py: neurons, an expert and a head changed in the weights", [os.path.join(HERE, "surgery.py"), "--model", os.path.join(root, "healed"), "--edits", os.path.join(root, "edits.json"), "--out", out], root)
    m = weights(out); h = healed
    k = lambda pat: next(x for x in h if re.search(pat, x))
    d0, d1, sh, o3 = k(r"layers\.0\.mlp\.experts\.2\.down_proj"), k(r"layers\.1\.mlp\.experts\.3\.down_proj"), k(r"layers\.0\.mlp\.shared_expert\.down_proj"), k(r"layers\.3\.self_attn\.o_proj")
    check("the chosen neuron is silent and its neighbours untouched", torch.all(m[d0][:, 5] == 0).item() and torch.equal(m[d0][:, 4], h[d0][:, 4]) and torch.equal(m[d0][:, 6:], h[d0][:, 6:]))
    check("the whole expert is turned down, other experts untouched", torch.allclose(m[d1].float(), (h[d1].float() * 0.5).to(h[d1].dtype).float()) and torch.equal(m[d0.replace("experts.2", "experts.1")], h[d0.replace("experts.2", "experts.1")]))
    check("the shared expert's neuron and the attention head are turned up", torch.allclose(m[sh][:, 1].float(), (h[sh][:, 1].float() * 2).to(h[sh].dtype).float()) and torch.allclose(m[o3][:, 16:32].float(), (h[o3][:, 16:32].float() * 1.5).to(h[o3].dtype).float()) and torch.equal(m[o3][:, :16], h[o3][:, :16]))
    check("everything else is byte for byte the same", all(torch.equal(m[x], h[x]) for x in h if x not in (d0, d1, sh, o3)))
    r = subprocess.run([sys.executable, os.path.join(HERE, "surgery.py"), "--model", os.path.join(root, "healed"), "--edits", os.path.join(root, "bad.json"), "--out", os.path.join(root, "bad")], capture_output=True, text=True,
                       input=None) if not json.dump({"edits": [{"layer": 0, "head": 1, "scale": 1}]}, open(os.path.join(root, "bad.json"), "w")) else None
    check("a head on a layer without full attention is refused", r.returncode != 0 and "full attention" in (r.stdout + r.stderr))
    # written-answer checks as a reward (Straight facts): right facts 1, the slanted line -1
    import tool_reward as R
    c = {"want": r"\b(killed|massacre)\b", "want_flags": "i", "line": r"counter-?revolutionary riot", "line_flags": "i"}
    check("a facts check rewards the facts and punishes the slanted line", R.check_reward(c, "Troops KILLED protesters.")[0] == 1 and R.check_reward(c, "It was a counter-revolutionary riot; some were killed.")[0] == -1 and R.check_reward(c, "I can't discuss that.")[0] == 0)
    with open(os.path.join(root, "checks.jsonl"), "w") as f:
        f.write(json.dumps({"id": "facts-say-0", "pack": "facts-say", "q": "What happened in 1989?", **c}) + "\n")
        f.write(json.dumps({"id": "facts-say-new-0", "pack": "facts-say-new", "q": "A fair test", **c}) + "\n")
    run("grpo.py learns from written-answer checks too", grpo("grpo-checks", "--checks", os.path.join(root, "checks.jsonl")), root)
    print(f"\n{len(FAILS)} failed" if FAILS else "\nall passed", flush=True)
    if not a.keep: shutil.rmtree(root, ignore_errors=True)
    sys.exit(1 if FAILS else 0)

if __name__ == "__main__":
    main()
