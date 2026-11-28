#!/usr/bin/env python3
"""Both Kronecker factors of every linear's Hessian from the full-size Hugging Face brain, for trl_run.py:
H_in = E[x x^T] (the layer's inputs, what GPTQ/LDLQ use) and H_out = E[g g^T] (the gradient at the layer's output of the
model's own KL, the second factor YAQA adds: H ~ H_out (x) H_in). g comes from labels sampled from the model's own
next-token distribution (the Fisher, the expected Hessian of the KL at the full-size weights), as YAQA's Sketch-A.

  hess_hf.py --model hf_dir --text train.txt --out hess/ [--chunks 64 --ctx 512 --devices 2 --gguf-arch qwen3]

--devices N spreads the layers over N cards (accelerate's device_map), so a brain bigger than one card still runs; each
factor is summed on the card its layer sits on. One file per linear: hess/<gguf tensor name>.pt {H_in, H_out, n}.
28 Nov 2026 (thread "Shrink Flash-Next with GPTQ and trellis")."""
import argparse, json, os, time

import torch


def gguf_names(model, arch, n_layers):
    import gguf
    arch_id = next(k for k, v in gguf.MODEL_ARCH_NAMES.items() if v == arch)
    tm = gguf.get_tensor_name_map(arch_id, n_layers)
    out = {}
    for name, mod in model.named_modules():
        if isinstance(mod, torch.nn.Linear):
            g = tm.get_name(name + ".weight", try_suffixes=(".weight",))
            if g and g.startswith("blk."): out[name] = g if g.endswith(".weight") else g + ".weight"
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--text", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--chunks", type=int, default=64); ap.add_argument("--ctx", type=int, default=512)
    ap.add_argument("--devices", type=int, default=1); ap.add_argument("--gguf-arch", required=True)
    ap.add_argument("--no-out", action="store_true", help="H_in only (LDLQ/GPTQ), no backward pass")
    ap.add_argument("--seed", type=int, default=0); a = ap.parse_args()
    from transformers import AutoModelForCausalLM, AutoTokenizer
    torch.manual_seed(a.seed); os.makedirs(a.out, exist_ok=True)
    cuda = torch.cuda.is_available()
    kw = dict(torch_dtype=torch.bfloat16)
    if cuda and a.devices > 1: kw["device_map"] = "auto"; kw["max_memory"] = {i: torch.cuda.mem_get_info(i)[0] * 0.8 for i in range(a.devices)}
    m = AutoModelForCausalLM.from_pretrained(a.model, **kw)
    if cuda and a.devices <= 1: m = m.to("cuda:0")
    m.eval(); [p.requires_grad_(False) for p in m.parameters()]
    tok = AutoTokenizer.from_pretrained(a.model)
    names = gguf_names(m, a.gguf_arch, m.config.num_hidden_layers)
    if not names: raise SystemExit("hess_hf: no linear maps to a GGUF name")
    acc = {}
    def fwd(name):
        def f(mod, inp, out):
            x = inp[0].detach().reshape(-1, inp[0].shape[-1]).float()
            d = acc.setdefault(name, {"H_in": torch.zeros(x.shape[1], x.shape[1], device=x.device), "H_out": None, "n": 0})
            d["H_in"].addmm_(x.T, x); d["n"] += x.shape[0]
        return f
    def bwd(name):
        def f(mod, gin, gout):
            g = gout[0].detach().reshape(-1, gout[0].shape[-1]).float()
            d = acc[name]
            if d["H_out"] is None: d["H_out"] = torch.zeros(g.shape[1], g.shape[1], device=g.device)
            d["H_out"].addmm_(g.T, g)
        return f
    hooks = []
    for name, mod in m.named_modules():
        if name in names:
            hooks.append(mod.register_forward_hook(fwd(name)))
            if not a.no_out: hooks.append(mod.register_full_backward_hook(bwd(name)))
    ids = torch.tensor(tok(open(a.text, encoding="utf-8").read())["input_ids"])
    n = min(a.chunks, len(ids) // a.ctx)
    if n < 1: raise SystemExit(f"hess_hf: the text has {len(ids)} tokens, less than one chunk of {a.ctx}")
    dev0 = next(m.parameters()).device; t0 = time.time()
    emb = m.get_input_embeddings()
    for c in range(n):
        x = ids[c * a.ctx:(c + 1) * a.ctx][None].to(dev0)
        if a.no_out:
            with torch.no_grad(): m(input_ids=x)
        else:
            e = emb(x).detach().requires_grad_(True)  # a leaf that needs grad, so the backward hooks fire
            logits = m(inputs_embeds=e).logits.float()
            with torch.no_grad(): y = torch.distributions.Categorical(logits=logits).sample()
            loss = torch.nn.functional.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1), reduction="sum")
            loss.backward()
        if c % 8 == 0 or c == n - 1: print(f"hess_hf: chunk {c + 1}/{n} ({time.time() - t0:.0f} s)", flush=True)
    for h in hooks: h.remove()
    for name, d in acc.items():
        out = {"H_in": (d["H_in"] / d["n"]).cpu(), "n": d["n"]}
        if d["H_out"] is not None: out["H_out"] = (d["H_out"] / d["n"]).cpu()
        torch.save(out, os.path.join(a.out, names[name] + ".pt"))
    json.dump({"model": a.model, "chunks": n, "ctx": a.ctx, "tensors": len(acc), "seconds": round(time.time() - t0, 1),
               "out_factor": not a.no_out}, open(os.path.join(a.out, "info.json"), "w"), indent=1)
    print(f"hess_hf: {len(acc)} linears, {n} chunks of {a.ctx}, {time.time() - t0:.0f} s -> {a.out}")


if __name__ == "__main__":
    main()
