#!/usr/bin/env python3
"""Dry run of the GPT-OSS Forge on a made-up tiny GPT-OSS (a few MB, CPU, a minute or two). Nothing is downloaded.

  python3 selftest_gptoss.py [--keep <dir>]   (--keep leaves the tiny models and reports there to look at)

Uses Bob's own GPT-OSS chat template (src/templates/gpt-oss.jinja, the harmony format) with a tiny tokenizer, then checks,
each script run as its own process the way run.sh runs it:
  data.py     harmony answer mask: the brain's own words (thinking, tool calls, final answer) are trained, the user's words and
              the tool's answers are not; parallel tool calls become call, answer, call, answer; tool-call thinking is kept.
  prune.py    the 38B-style cut by keep list: plain BF16 files and MXFP4-packed files (blocks + scales) both slice right.
  lora.py     the LoRA'd GPT-OSS gives the stock answer before training (both the fast and the slow expert path), and
              folding the LoRA in gives the same answer as the LoRA'd model.
  teacher.py, heal.py, count.py, rebuild.py, export.py's brain card  run end to end on the tiny cut, like the 38B heal would.
It proves the code runs and the maths is right, not that it helps: that is the held-out test on the real 38B.
"""
import argparse, json, os, shutil, struct, subprocess, sys, tempfile
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "..", "..", "..", "src", "templates", "gpt-oss.jinja")
SPECIAL = ["<|startoftext|>", "<|endoftext|>", "<|start|>", "<|end|>", "<|message|>", "<|channel|>", "<|constrain|>", "<|return|>", "<|call|>"]
FAILS = []

def check(name, ok, extra=""):
    print(f"{'PASS' if ok else 'FAIL'} {name}{(' ' + extra) if extra else ''}", flush=True)
    if not ok: FAILS.append(name)

def tiny_tokenizer(d):
    from tokenizers import Tokenizer, models, pre_tokenizers, decoders, trainers
    from transformers import PreTrainedTokenizerFast
    t = Tokenizer(models.BPE()); t.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False); t.decoder = decoders.ByteLevel()
    corpus = ["assistant user system developer functions analysis final commentary json Reasoning: low medium high",
              "You are ChatGPT, a large language model trained by OpenAI. Knowledge cutoff: 2024-06 Current date:",
              "Remind me at 7:30 to call the dentist. Done: a reminder at 7:30. set_reminder when what",
              "What is the capital of France? Paris. The user wants a reminder; call set_reminder.", "namespace functions type"] * 20
    t.train_from_iterator(corpus, trainers.BpeTrainer(vocab_size=700, special_tokens=SPECIAL, initial_alphabet=pre_tokenizers.ByteLevel.alphabet()))
    tok = PreTrainedTokenizerFast(tokenizer_object=t, bos_token="<|startoftext|>", eos_token="<|return|>", pad_token="<|endoftext|>")
    tok.chat_template = open(TEMPLATE, encoding="utf-8").read()
    tok.save_pretrained(d)
    return tok

def tiny_model(d, vocab, experts=8):
    from transformers import GptOssConfig, GptOssForCausalLM
    torch.manual_seed(0)
    cfg = GptOssConfig(vocab_size=vocab, hidden_size=64, intermediate_size=32, num_hidden_layers=4, num_attention_heads=4, num_key_value_heads=2,
                       head_dim=16, num_local_experts=experts, num_experts_per_tok=2, sliding_window=8, max_position_embeddings=4096)
    m = GptOssForCausalLM(cfg)
    with torch.no_grad():  # random biases and router rows, so a wrong slice or a dropped bias shows in the answers
        for n, p in m.named_parameters():
            if p.dim() and ("bias" in n or "router" in n or "experts" in n): p.normal_(0, 0.05)
    m.to(torch.bfloat16).save_pretrained(d, safe_serialization=True)
    return m

def lessons(d):
    os.makedirs(d, exist_ok=True)
    tools = [{"type": "function", "function": {"name": "set_reminder", "description": "Set a reminder", "parameters": {"type": "object", "properties": {"when": {"type": "string"}, "what": {"type": "string"}}}}}]
    json.dump({"s1": {"system": "You are Bob.", "tools": tools}}, open(os.path.join(d, "toolsets.json"), "w"))
    call = lambda i, w, x: {"id": f"c{i}", "type": "function", "function": {"name": "set_reminder", "arguments": json.dumps({"when": w, "what": x})}}
    rows = []
    for i in range(40):
        if i % 2:
            rows.append({"idea": f"idea-{i}", "job": "reminders", "think": True, "messages": [{"role": "user", "content": f"Remind me at 7:{i:02d} to call the dentist"},
                         {"role": "assistant", "set": "s1", "content": "", "reasoning": "The user wants a reminder; call set_reminder.", "tool_calls": [call(1, f"7:{i:02d}", "call the dentist"), call(2, "8:00", "dentist again")]},
                         {"role": "tool", "tool_call_id": "c1", "content": "SET-ONE"}, {"role": "tool", "tool_call_id": "c2", "content": "SET-TWO"},
                         {"role": "assistant", "set": "s1", "content": f"Done: a reminder at 7:{i:02d}."}]})
        else:
            rows.append({"idea": f"idea-{i}", "job": "restraint", "think": False, "messages": [{"role": "user", "content": "What is the capital of France?"}, {"role": "assistant", "set": "s1", "content": "Paris."}]})
    with open(os.path.join(d, "lessons.jsonl"), "w") as f: f.writelines(json.dumps(r) + "\n" for r in rows)
    return rows

def run(name, args, cwd):
    r = subprocess.run([sys.executable, *args], cwd=cwd, capture_output=True, text=True, env={**os.environ, "PYTHONPATH": HERE})
    tail = (r.stdout + r.stderr).strip().splitlines()[-8:]
    check(name, r.returncode == 0, "" if r.returncode == 0 else "\n    " + "\n    ".join(tail))
    return r

def check_mask(tok, les):
    import data as D
    sets = json.load(open(os.path.join(les, "toolsets.json")))
    rows = [json.loads(l) for l in open(os.path.join(les, "lessons.jsonl"))]
    tool_row = D.render(tok, rows[1], sets, 4096); chat_row = D.render(tok, rows[0], sets, 4096)
    check("harmony lessons render", tool_row is not None and chat_row is not None)
    if tool_row is None or chat_row is None: return
    text = tok.decode(tool_row["ids"], skip_special_tokens=False)
    ans = tok.decode([t for t, m in zip(tool_row["ids"], tool_row["mask"]) if m], skip_special_tokens=False)
    rest = tok.decode([t for t, m in zip(tool_row["ids"], tool_row["mask"]) if not m], skip_special_tokens=False)
    check("parallel calls become call, answer, call, answer", text.index("SET-ONE") < text.index('"dentist again"') < text.index("SET-TWO"), "")
    check("tool-call thinking is kept and trained", "call set_reminder." in ans)
    check("both tool calls and the final answer are trained", ans.count("<|call|>") == 2 and "Done: a reminder" in ans and ans.rstrip().endswith("<|return|>"))
    check("the user's words and the tool's answers are not trained", "Remind me" not in ans and "SET-ONE" not in ans and "Remind me" in rest and "SET-ONE" in rest)
    check("the system part (tools, Reasoning line) is not trained", "set_reminder" in rest and "Reasoning:" not in ans)
    ctext = tok.decode(chat_row["ids"], skip_special_tokens=False)
    check("a lesson with no thinking asks for low effort", "Reasoning: low" in ctext and "Reasoning: medium" in text)

def fake_mxfp4(src_dir, dst_dir, keep):
    """A tiny file in the MXFP4 shape of the official checkpoints (U8 blocks [E, out, in/32, 16] + U8 scales [E, out, in/32]):
    prune.py must slice those bytes per expert like any other expert-first tensor."""
    from safetensors.torch import save_file, load_file
    E, O, G = 8, 6, 2
    t = {}
    for li in range(2):
        t[f"model.layers.{li}.mlp.experts.gate_up_proj_blocks"] = torch.arange(E * O * G * 16, dtype=torch.int64).reshape(E, O, G, 16).remainder(251).to(torch.uint8)
        t[f"model.layers.{li}.mlp.experts.gate_up_proj_scales"] = (torch.arange(E * O * G).reshape(E, O, G) + li).remainder(251).to(torch.uint8)
        t[f"model.layers.{li}.mlp.experts.gate_up_proj_bias"] = torch.randn(E, O).to(torch.bfloat16)
        t[f"model.layers.{li}.mlp.router.weight"] = torch.randn(E, 4).to(torch.bfloat16)
        t[f"model.layers.{li}.mlp.router.bias"] = torch.randn(E).to(torch.bfloat16)
        t[f"model.layers.{li}.self_attn.q_proj.weight"] = torch.randn(4, 4).to(torch.bfloat16)
    os.makedirs(src_dir, exist_ok=True); save_file(t, os.path.join(src_dir, "model.safetensors"))
    json.dump({"model_type": "gpt_oss", "architectures": ["GptOssForCausalLM"], "num_hidden_layers": 2, "num_local_experts": E, "num_experts_per_tok": 2,
               "experts_per_token": 2, "quantization_config": {"quant_method": "mxfp4"}}, open(os.path.join(src_dir, "config.json"), "w"))
    kf = os.path.join(src_dir, "keep.json"); json.dump({"share": 0.5, "by": "reap", "keep": keep}, open(kf, "w"))  # the Lab's keep-32-v2.json shape
    r = run("prune.py cuts an MXFP4-packed GPT-OSS by keep list", ["prune.py", "--src", src_dir, "--dst", dst_dir, "--keep-file", kf, "--name", "packed"], HERE)
    if r.returncode: return
    got = load_file(os.path.join(dst_dir, "model-00001.safetensors")); cfg = json.load(open(os.path.join(dst_dir, "config.json")))
    ok = cfg["num_local_experts"] == len(keep[0]) and cfg["quantization_config"]["quant_method"] == "mxfp4"
    for li in range(2):
        for part in ("experts.gate_up_proj_blocks", "experts.gate_up_proj_scales", "experts.gate_up_proj_bias", "router.weight", "router.bias"):
            n = f"model.layers.{li}.mlp.{part}"; ok = ok and torch.equal(got[n], t[n][keep[li]])
        n = f"model.layers.{li}.self_attn.q_proj.weight"; ok = ok and torch.equal(got[n], t[n])
    check("packed blocks, scales, biases and router rows are the kept experts, the rest untouched", ok)

def check_lora(cut_dir):
    import family as FAM, lora as L
    from transformers import AutoModelForCausalLM
    ids = torch.tensor([[5, 17, 33, 2, 99, 120, 7, 64, 3, 11, 250, 400]])
    stock = AutoModelForCausalLM.from_pretrained(cut_dir, dtype=torch.float32).eval()
    with torch.no_grad(): want = stock(input_ids=ids).logits
    for gmm in (False, True):
        m = AutoModelForCausalLM.from_pretrained(cut_dir, dtype=torch.float32).eval()
        L._gmm_ok = (lambda dev="cpu", g=gmm: g and hasattr(torch, "_grouped_mm"))
        L.attach(m, r=8, r_experts=8)  # rank 8: rows 16-byte aligned for the grouped matmul, as on the card
        if gmm and not hasattr(torch, "_grouped_mm"): print("(no torch._grouped_mm here: the fast path is checked on the card)"); continue
        with torch.no_grad(): got = m(input_ids=ids).logits
        if gmm: check("the fast expert path stayed on", all(l.mlp.experts.lora.use_gmm for l in FAM.layers(m)))
        check(f"LoRA'd GPT-OSS answers like the stock one before training ({'fast' if gmm else 'slow'} expert path)", torch.allclose(got, want, atol=2e-3), f"max diff {(got - want).abs().max():.2e}")
    with torch.no_grad():
        for n, p in m.named_parameters():
            if p.requires_grad and (".B" in n or "B_" in n): p.normal_(0, 0.02)
            if p.requires_grad and n.endswith("router.bias"): p.add_(0.01)
        lo = m(input_ids=ids).logits
    check("trained LoRA changes the answer", (lo - want).abs().max() > 1e-3)
    loss = m(input_ids=ids, labels=ids).loss; loss.backward()
    grads = [n for n, p in m.named_parameters() if p.requires_grad and p.grad is not None and p.grad.abs().sum() > 0]
    check("gradients reach attention LoRA, expert LoRA and the router", any("A_gu" in n for n in grads) and any("q_proj.A" in n for n in grads) and any("router.weight" in n for n in grads) and any("router.bias" in n for n in grads))
    L.merge_all(m)
    with torch.no_grad(): mg = m(input_ids=ids).logits
    check("folding the LoRA in gives the LoRA'd model's answer", torch.allclose(mg, lo, atol=2e-3), f"max diff {(mg - lo).abs().max():.2e}")
    check("after folding, the MLP is the stock one again", all("forward" not in l.mlp.__dict__ for l in FAM.layers(m)))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--keep", default=None); a = ap.parse_args()
    sys.path.insert(0, HERE)
    root = a.keep or tempfile.mkdtemp(prefix="bob-gptoss-selftest-"); os.makedirs(root, exist_ok=True)
    teacher, cut, les, healed, out = (os.path.join(root, x) for x in ("teacher", "cut", "lessons", "healed", "out"))
    tok = tiny_tokenizer(teacher); tiny_model(teacher, len(tok))
    import family as FAM
    check("family.py knows GPT-OSS", FAM.family(teacher) == FAM.GPT_OSS and FAM.num_experts(FAM.read_config(teacher)) == 8)
    check("harmony stops are <|return|> <|call|> <|end|>", FAM.stop_ids(tok) >= {tok.convert_tokens_to_ids(x) for x in ("<|return|>", "<|call|>", "<|end|>")})
    lessons(les); check_mask(tok, les)
    keep = [[0, 2, 5, 7], [1, 2, 3, 6], [0, 1, 4, 5], [2, 3, 6, 7]]
    json.dump({"layers": keep}, open(os.path.join(root, "keep.json"), "w"))
    r = run("prune.py cuts the tiny GPT-OSS by keep list (8 -> 4 experts)", ["prune.py", "--src", teacher, "--dst", cut, "--keep-file", os.path.join(root, "keep.json"), "--name", "tinyBob"], HERE)
    if r.returncode == 0:
        from safetensors.torch import load_file
        t = load_file(os.path.join(teacher, "model.safetensors")); c = {}
        for f in os.listdir(cut):
            if f.endswith(".safetensors"): c.update(load_file(os.path.join(cut, f)))
        ok = all(torch.equal(c[f"model.layers.{li}.mlp.{p}"], t[f"model.layers.{li}.mlp.{p}"][keep[li]])
                 for li in range(4) for p in ("experts.gate_up_proj", "experts.down_proj", "experts.gate_up_proj_bias", "experts.down_proj_bias", "router.weight", "router.bias"))
        check("cut weights are exactly the kept experts", ok and json.load(open(os.path.join(cut, "config.json")))["num_local_experts"] == 4)
        check_lora(cut)
    fake_mxfp4(os.path.join(root, "packed-src"), os.path.join(root, "packed-cut"), [[1, 3, 4, 6], [0, 2, 5, 7]])
    tpt = os.path.join(root, "teacher.pt"); cache = os.path.join(root, "tok.pt")
    run("teacher.py scores the lessons with the GPT-OSS teacher", ["teacher.py", "--model", teacher, "--lessons", les, "--out", tpt, "--top", "8", "--cache", cache, "--device", "cpu", "--max-len", "1024"], HERE)
    r = run("heal.py heals the cut against the teacher (LoRA)", ["heal.py", "--model", cut, "--lessons", les, "--teacher", tpt, "--save", healed, "--cache", cache, "--device", "cpu",
                                                                   "--r", "4", "--r-experts", "2", "--tokens-per-step", "256", "--epochs", "1", "--max-len", "1024", "--eval-lessons", "10", "--lr", "1e-3"], HERE)
    if r.returncode == 0:
        rep = json.load(open(os.path.join(healed, "heal-report.json")))
        check("heal report has before and after, trained steps", rep.get("steps", 0) > 0 and "lessons" in rep.get("before", {}) and "lessons" in rep.get("after", {}))
        cfg = json.load(open(os.path.join(healed, "config.json")))
        check("healed GPT-OSS is saved as plain BF16 with 4 experts", "quantization_config" not in cfg and cfg["num_local_experts"] == 4 and os.path.exists(os.path.join(healed, "adapter.pt")))
        run("count.py counts the healed GPT-OSS's experts", ["count.py", "--model", healed, "--lessons", les, "--out", os.path.join(root, "counts.json"), "--cache", cache, "--device", "cpu", "--lessons-max", "10"], HERE)
        cj = json.load(open(os.path.join(root, "counts.json"))) if os.path.exists(os.path.join(root, "counts.json")) else {}
        check("counts have one row of 4 per layer", cj.get("experts") == 4 and len(cj.get("layers", [])) == 4 and all(len(x) == 4 and sum(x) > 0 for x in cj["layers"]))
        rb = os.path.join(root, "rebuilt")
        r2 = run("rebuild.py makes the same healed Bob from teacher + keep list + adapter", ["rebuild.py", "--teacher", teacher, "--keep-file", os.path.join(cut, "bob-keep.json"), "--adapter", os.path.join(healed, "adapter.pt"), "--dst", rb, "--name", "tinyBob", "--device", "cpu"], HERE)
        if r2.returncode == 0:
            from safetensors.torch import load_file
            h, b = {}, {}
            for d_, acc in ((healed, h), (rb, b)):
                for f in os.listdir(d_):
                    if f.endswith(".safetensors"): acc.update(load_file(os.path.join(d_, f)))
            check("the rebuilt Bob's weights equal the healed Bob's", h.keys() == b.keys() and all(torch.allclose(h[k].float(), b[k].float(), atol=1e-2) for k in h))
        if hasattr(torch, "_grouped_mm"):  # the card's path: rank 8, grouped matmul, under gradient checkpointing
            r3 = run("heal.py with the fast expert path (rank 8)", ["heal.py", "--model", cut, "--lessons", les, "--teacher", tpt, "--save", healed + "-r8", "--cache", cache, "--device", "cpu",
                                                                  "--r", "8", "--r-experts", "8", "--tokens-per-step", "256", "--max-len", "1024", "--eval-lessons", "10", "--lr", "1e-3"], HERE)
            check("the fast expert path stays on through training (checkpoint recompute included)", r3.returncode == 0 and "grouped_mm=True" in r3.stdout and "slow expert loop" not in r3.stdout)
        import export
        cfg = json.load(open(os.path.join(healed, "config.json")))
        ns = argparse.Namespace(model=healed, out=out, name="tinyBob", nickname="", teacher="openai/gpt-oss-120b", jobs="bob", what="")
        os.makedirs(out, exist_ok=True); export.write_card(ns, {"file": "tinyBob-MXFP4_MOE.gguf", "bytes": 1, "sha256": "0"})
        card = json.load(open(os.path.join(out, "tinyBob-MXFP4_MOE.bob.json")))
        check("brain card says cut from GPT-OSS by OpenAI, 4 of 8 experts", card.get("cutFrom", {}).get("by") == "OpenAI" and card.get("expertsKept") == "4 of 8")
        conv = os.path.join(root, "conv.py"); open(conv, "w").write("# has --no-mtp\n")
        check("a GPT-OSS export never asks the converter for --no-mtp (b12282 stops on it)", export.no_ghost_guesser(healed) and not export.mtp_off(healed) and "--no-mtp" not in export.convert_args(conv, export.mtp_off(healed)))
    print(f"\n{'ALL PASS' if not FAILS else f'{len(FAILS)} FAILED: ' + ', '.join(FAILS)} ({root})")
    if not a.keep: shutil.rmtree(root, ignore_errors=True)
    sys.exit(1 if FAILS else 0)

if __name__ == "__main__":
    main()
