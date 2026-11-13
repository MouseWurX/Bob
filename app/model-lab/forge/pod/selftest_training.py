#!/usr/bin/env python3
"""Dry run of the new ways to learn on a made-up tiny Qwen3.5-MoE (a few MB, CPU, about a minute). Nothing is downloaded.

  python3 selftest_training.py [--keep <dir>]   (--keep leaves the tiny models and reports there to look at)

Builds a tiny tokenizer + teacher, cuts a student with prune.py, writes made-up lessons and right-vs-wrong pairs, then
runs, each as its own process exactly as run.sh would: teacher.py, heal.py (today's heal, + orpo, + dpo, + kto,
+ on-policy), grpo.py and merge.py (linear, ties, dare, dare_ties). It checks every step finishes, writes its report,
and that the merge math is right (weight 0 = the base's own experts, weight 1 = the trained Bob).
It proves the code runs end to end, not that it helps: that is the held-out test on a real Bob.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile
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
    print(f"\n{len(FAILS)} failed" if FAILS else "\nall passed", flush=True)
    if not a.keep: shutil.rmtree(root, ignore_errors=True)
    sys.exit(1 if FAILS else 0)

if __name__ == "__main__":
    main()
