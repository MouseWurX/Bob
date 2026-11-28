#!/usr/bin/env python3
"""Both Kronecker factors of every linear's Hessian from the full-size Hugging Face brain, for trl_run.py:
H_in = E[x x^T] (the layer's inputs, what GPTQ/LDLQ use) and H_out = E[g g^T] (the gradient at the layer's output of the
model's own KL, the second factor YAQA adds: H ~ H_out (x) H_in). g comes from labels sampled from the model's own
next-token distribution (the Fisher, the expected Hessian of the KL at the full-size weights), as YAQA's Sketch-A.

  hess_hf.py --model hf_dir --text train.txt --out hess/ [--chunks 64 --ctx 512 --devices 2] (--gguf-arch qwen3 | --match-gguf base.gguf)

Names: --gguf-arch maps module names with gguf-py's table; --match-gguf instead finds each weight's GGUF tensor by its
values (same block, same shape, cosine > 0.999 on a sample of rows), for brains gguf-py has no table for (Inkling 2) and
so a converter that reorders or fuses rows can't slip a wrong pairing through. A weight with no match is left out.
MoE experts stored as 3D blocks (transformers' gate_up_proj [E, 2I, H] / down_proj [E, H, I], Inkling 2, Qwen3 MoE):
the experts' forward is swapped for one that records each expert's own H_in and H_out (the rows routed to it, so the
looped layers of Inkling count every pass). Expert sums are big (Inkling 2 Mini: ~8.8 GB a layer in float32), so
--expert-gb caps them per card (default: half of the card's free memory once the brain is loaded): the layers that fit
are recorded, saved, and the text is read again for the next ones.
--devices N spreads the layers over N cards (accelerate's device_map). One file per tensor: hess/<gguf name>.pt
{H_in, H_out, n} ([E, ., .] and n [E] for experts). 28 Nov 2026 (thread "Shrink Flash-Next with GPTQ and trellis")."""
import argparse, json, os, re, time, types

import torch
import torch.nn.functional as F


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


def expert_modules(model):
    """modules holding a layer's experts as 3D blocks"""
    out = {}
    for name, mod in model.named_modules():
        gu, dn = getattr(mod, "gate_up_proj", None), getattr(mod, "down_proj", None)
        if isinstance(gu, torch.nn.Parameter) and isinstance(dn, torch.nn.Parameter) and gu.dim() == 3 and dn.dim() == 3:
            out[name] = mod
    return out


def match_names(model, base, log=print):
    """{hf module name: gguf name} for Linear weights, {hf experts module: {"gate_up": name, "down": name}} by value"""
    import numpy as np, gguf
    from gguf.quants import dequantize
    r = gguf.GGUFReader(base)
    by_blk = {}
    for t in r.tensors:
        m = re.match(r"blk\.(\d+)\.", t.name)
        if m and len(t.shape) in (2, 3): by_blk.setdefault(int(m[1]), []).append(t)
    def rows(t, n=64):  # first n rows (expert 0 for 3D) as float32, without reading the whole tensor
        ne = [int(x) for x in t.shape]; K = ne[0]
        raw = np.asarray(t.data)
        per_row = raw.size // (int(np.prod(ne[1:])))
        flat = raw.reshape(-1, per_row)[:n]
        return np.array(dequantize(flat, t.tensor_type), np.float32).reshape(-1, K)
    def lshape(t): return tuple(int(x) for x in reversed(t.shape))
    def cos(a, b): a, b = a.ravel().astype(np.float64), b.ravel().astype(np.float64); return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-30))
    lin, exp, used = {}, {}, set()
    def find(blk, shape, sample):
        best = (0.0, None)
        for t in by_blk.get(blk, []):
            if t.name in used or lshape(t) != shape: continue
            c = cos(rows(t, sample.shape[0]), sample)
            if c > best[0]: best = (c, t.name)
        return best
    for name, mod in model.named_modules():
        m = re.search(r"layers\.(\d+)\.", name + ".")
        if not m: continue
        blk = int(m[1])
        if isinstance(mod, torch.nn.Linear) and mod.weight.dim() == 2:
            w = mod.weight.detach()[:64].float().cpu().numpy()
            c, g = find(blk, tuple(mod.weight.shape), w)
            if g and c > 0.999: lin[name] = g; used.add(g)
        elif name in expert_modules_cache:
            d = {}
            for part in ("gate_up_proj", "down_proj"):
                p = getattr(mod, part).detach()
                c, g = find(blk, tuple(p.shape), p[0, :64].float().cpu().numpy())
                if g and c > 0.999: d[part] = g; used.add(g)
                else: log(f"hess_hf: {name}.{part}: no GGUF tensor matches (best cosine {c:.4f})")
            if d: exp[name] = d
    return lin, exp


expert_modules_cache = {}


def recording_forward(self, hidden_states, top_k_index, top_k_weights):
    """transformers' eager experts loop (as Inkling2LoopExperts.forward), recording each expert's factors when on"""
    rec = getattr(self, "_rec", None)
    final = torch.zeros_like(hidden_states, dtype=torch.float32)
    with torch.no_grad():
        mask = F.one_hot(top_k_index, num_classes=self.num_experts + 1).permute(2, 1, 0)
        hit = torch.greater(mask.sum(dim=(-1, -2)), 0).nonzero()
    act = self._apply_gate if hasattr(self, "_apply_gate") else (lambda gu: self.act_fn(gu.chunk(2, dim=-1)[0]) * gu.chunk(2, dim=-1)[1])
    for e in hit:
        e = int(e[0])
        if e == self.num_experts: continue
        pos, tok = torch.where(mask[e])
        x = hidden_states[tok]
        gu = F.linear(x, self.gate_up_proj[e])
        h = act(gu)
        y = F.linear(h, self.down_proj[e])
        if rec is not None:
            xf, hf = x.detach().float(), h.detach().float()
            rec["gate_up_proj"]["H_in"][e].addmm_(xf.T, xf); rec["down_proj"]["H_in"][e].addmm_(hf.T, hf)
            rec["n"][e] += x.shape[0]
            if rec["out"] and gu.requires_grad:
                def hk(part, e=e):
                    def f(g):
                        g = g.detach().reshape(-1, g.shape[-1]).float(); rec[part]["H_out"][e].addmm_(g.T, g)
                    return f
                gu.register_hook(hk("gate_up_proj")); y.register_hook(hk("down_proj"))
        y = y * top_k_weights[tok, pos, None]
        final.index_add_(0, tok, y.to(final.dtype))
    return final.to(hidden_states.dtype)


def load_model(path, kw, attn="sdpa"):
    """the brain with torch's fused attention (sdpa) where the model has it: eager attention keeps every layer's full
    tokens x tokens score matrix for the backward pass (Inkling 2 Mini, 2 x L40S, 2048 tokens: out of card memory)"""
    from transformers import AutoModelForCausalLM
    try:
        return load_model_as(AutoModelForCausalLM, path, kw, attn)
    except (ValueError, KeyError) as e:  # a picture-and-text brain (Inkling 2's own checkpoint): the whole model
        from transformers import AutoModelForImageTextToText
        print(f"hess_hf: not a plain text model ({str(e)[:120]}), loading as picture-and-text", flush=True)
        return load_model_as(AutoModelForImageTextToText, path, kw, attn)


def load_model_as(cls, path, kw, attn):
    if attn == "eager": return cls.from_pretrained(path, attn_implementation="eager", **kw)
    try:
        m = cls.from_pretrained(path, attn_implementation=attn, **kw)
    except (ValueError, ImportError, TypeError) as e:
        if "sdpa" not in str(e).lower() and "attn_implementation" not in str(e).lower(): raise
        print(f"hess_hf: no sdpa attention for this brain ({str(e)[:100]}), using eager", flush=True)
        return cls.from_pretrained(path, **kw)
    print(f"hess_hf: attention {getattr(m.config, '_attn_implementation', '?')}", flush=True)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--text", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--chunks", type=int, default=64); ap.add_argument("--ctx", type=int, default=512)
    ap.add_argument("--devices", type=int, default=1); ap.add_argument("--gguf-arch", default=None)
    ap.add_argument("--match-gguf", default=None, help="find GGUF names by value in this file (see above)")
    ap.add_argument("--expert-gb", type=float, default=0.0, help="cap on expert sums per card, GB (0: half of the free card memory)")
    ap.add_argument("--only", default=None, help="record only GGUF names matching this regex (e.g. a canary's layers)")
    ap.add_argument("--no-out", action="store_true", help="H_in only (LDLQ/GPTQ), no backward pass")
    ap.add_argument("--attn", default="sdpa", help="attention: sdpa (fused, little memory) or eager")
    ap.add_argument("--seed", type=int, default=0); a = ap.parse_args()
    if not (a.gguf_arch or a.match_gguf): raise SystemExit("hess_hf: give --gguf-arch or --match-gguf")
    from transformers import AutoTokenizer
    os.makedirs(a.out, exist_ok=True)
    cuda = torch.cuda.is_available()
    import transformers
    new_kw = tuple(int(x) for x in transformers.__version__.split(".")[:2]) >= (4, 56)  # "dtype" from 4.56, "torch_dtype" before
    kw = {("dtype" if new_kw else "torch_dtype"): torch.bfloat16 if cuda else torch.float32}
    # "balanced": the same share of the brain on every card, so the first card keeps room for the backward pass and
    # the expert sums ("auto" fills card 0 first; Inkling try 2 ran out of memory there)
    if cuda and a.devices > 1: kw["device_map"] = "balanced"; kw["max_memory"] = {i: int(torch.cuda.mem_get_info(i)[0] * 0.7) for i in range(a.devices)}
    m = load_model(a.model, kw, a.attn)
    if cuda and a.devices <= 1: m = m.to("cuda:0")
    m.eval(); [p.requires_grad_(False) for p in m.parameters()]
    tok = AutoTokenizer.from_pretrained(a.model)
    expert_modules_cache.update(expert_modules(m))
    if a.match_gguf: names, exps = match_names(m, a.match_gguf)
    else: names, exps = gguf_names(m, a.gguf_arch, m.config.num_hidden_layers), {}
    if a.only:
        names = {k: v for k, v in names.items() if re.search(a.only, v)}
        exps = {k: {p: g for p, g in d.items() if re.search(a.only, g)} for k, d in exps.items()}
        exps = {k: d for k, d in exps.items() if d}
    if not names and not exps: raise SystemExit("hess_hf: no weight maps to a GGUF tensor")
    print(f"hess_hf: {len(names)} linears and {len(exps)} expert blocks mapped to GGUF names", flush=True)
    for name in exps: expert_modules_cache[name].forward = types.MethodType(recording_forward, expert_modules_cache[name])
    acc = {}
    def fwd(name):
        def f(mod, inp, out):
            if not rec_dense[0]: return
            x = inp[0].detach().reshape(-1, inp[0].shape[-1]).float()
            d = acc.setdefault(name, {"H_in": torch.zeros(x.shape[1], x.shape[1], device=x.device), "H_out": None, "n": 0})
            d["H_in"].addmm_(x.T, x); d["n"] += x.shape[0]
        return f
    def bwd(name):
        def f(mod, gin, gout):
            if not rec_dense[0]: return
            g = gout[0].detach().reshape(-1, gout[0].shape[-1]).float()
            d = acc[name]
            if d["H_out"] is None: d["H_out"] = torch.zeros(g.shape[1], g.shape[1], device=g.device)
            d["H_out"].addmm_(g.T, g)
        return f
    rec_dense = [True]; hooks = []
    for name, mod in m.named_modules():
        if name in names:
            hooks.append(mod.register_forward_hook(fwd(name)))
            if not a.no_out: hooks.append(mod.register_full_backward_hook(bwd(name)))
    ids = torch.tensor(tok(open(a.text, encoding="utf-8").read())["input_ids"])
    n = min(a.chunks, len(ids) // a.ctx)
    if n < 1: raise SystemExit(f"hess_hf: the text has {len(ids)} tokens, less than one chunk of {a.ctx}")
    dev0 = next(m.parameters()).device; t0 = time.time()
    torch.manual_seed(a.seed)  # the sampled labels (H_out) are the same on every run
    emb = m.get_input_embeddings()

    def read_text(tag):
        for c in range(n):
            x = ids[c * a.ctx:(c + 1) * a.ctx][None].to(dev0)
            if a.no_out:
                with torch.no_grad(): m(input_ids=x)
            else:
                e = emb(x).detach().requires_grad_(True)  # a leaf that needs grad, so the backward hooks fire
                logits = m(inputs_embeds=e).logits.float()
                with torch.no_grad(): y = torch.distributions.Categorical(logits=logits).sample()
                loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y.reshape(-1), reduction="sum")
                loss.backward(); del loss, logits, e
            if c % 8 == 0 or c == n - 1: print(f"hess_hf: {tag}: chunk {c + 1}/{n} ({time.time() - t0:.0f} s)", flush=True)

    def probe(g):
        """one chunk forward and backward with nothing recorded, the first pass's expert sums already on the cards: if
        the cards run out of memory, halve the chunk (same tokens in all, down to 128) and try again. Inkling 2's
        attention is eager only (per-token sinks), so its score matrices grow with the square of the chunk."""
        nonlocal n
        keep = {name: expert_modules_cache[name]._rec for name in g}; rd = rec_dense[0]
        for name in g: expert_modules_cache[name]._rec = None
        rec_dense[0] = False; total = n * a.ctx
        while True:
            for i in range(torch.cuda.device_count() if cuda else 0): torch.cuda.reset_peak_memory_stats(i)
            try:
                x = ids[:a.ctx][None].to(dev0)
                if a.no_out:
                    with torch.no_grad(): m(input_ids=x)
                else:
                    e = emb(x).detach().requires_grad_(True); lg = m(inputs_embeds=e).logits.float()
                    lg.logsumexp(-1).sum().backward(); del lg, e
                peak = ", ".join(f"cuda:{i} {torch.cuda.max_memory_allocated(i) / 1e9:.1f} of "
                                 f"{torch.cuda.get_device_properties(i).total_memory / 1e9:.1f} GB" for i in range(torch.cuda.device_count() if cuda else 0)) or "no card"
                print(f"hess_hf: chunks of {a.ctx} fit (peak {peak})", flush=True); break
            except torch.OutOfMemoryError:
                lg = e = None
                if cuda: torch.cuda.empty_cache()
                if a.ctx <= 128: raise SystemExit("hess_hf: out of card memory even at 128 tokens a chunk (use more cards or --expert-gb)")
                a.ctx //= 2; n = min(total // a.ctx, len(ids) // a.ctx)
                print(f"hess_hf: out of card memory, chunks of {a.ctx} now ({n} of them, same tokens)", flush=True)
        for name in g: expert_modules_cache[name]._rec = keep[name]
        rec_dense[0] = rd
        if cuda: torch.cuda.empty_cache()

    # expert layers in groups that fit --expert-gb per card
    def need(mod):
        E, I2, H = mod.gate_up_proj.shape; I = mod.down_proj.shape[2]
        return 4 * E * (H * H + I * I + (0 if a.no_out else I2 * I2 + H * H)) / 1e9
    def cap(dev):  # --expert-gb, or (0) half of what the card has free once the brain is on it (the rest: the backward pass)
        if a.expert_gb > 0: return a.expert_gb
        return 0.5 * torch.cuda.mem_get_info(dev)[0] / 1e9 if dev.type == "cuda" else float("inf")
    todo = list(exps); groups = []; caps = {}
    while todo:
        used, g = {}, []
        for name in list(todo):
            dev = expert_modules_cache[name].gate_up_proj.device; gb = need(expert_modules_cache[name])
            if dev not in caps: caps[dev] = cap(dev)
            if g and used.get(dev, 0) + gb > caps[dev]: continue
            used[dev] = used.get(dev, 0) + gb; g.append(name); todo.remove(name)
        groups.append(g)
    groups = groups or [[]]
    print(f"hess_hf: experts read in {len(groups)} pass(es) of the text (room for expert sums: "
          f"{', '.join(f'{d} {c:.1f} GB' for d, c in caps.items())})", flush=True)
    for gi, g in enumerate(groups):
        for name in g:
            mod = expert_modules_cache[name]; E, I2, H = mod.gate_up_proj.shape; I = mod.down_proj.shape[2]; dv = mod.gate_up_proj.device
            z = lambda k: torch.zeros(E, k, k, device=dv)
            mod._rec = {"gate_up_proj": {"H_in": z(H), "H_out": None if a.no_out else z(I2)},
                        "down_proj": {"H_in": z(I), "H_out": None if a.no_out else z(H)},
                        "n": torch.zeros(E, dtype=torch.float64), "out": not a.no_out}
        if gi == 0: probe(g)
        read_text(f"pass {gi + 1}/{len(groups)}")
        rec_dense[0] = False  # dense linears are summed in the first read only
        for name in g:
            mod = expert_modules_cache[name]; rec = mod._rec; nn_ = rec["n"].clamp(min=1).to(torch.float32)
            for part in ("gate_up_proj", "down_proj"):
                if part not in exps[name]: continue
                # stored as bfloat16 (float32's range, half the disk: Inkling 2 Mini's expert sums are ~210 GB in float32)
                d = rec[part]; out = {"H_in": (d["H_in"].cpu() / nn_[:, None, None]).bfloat16(), "n": rec["n"].clone()}
                if d["H_out"] is not None: out["H_out"] = (d["H_out"].cpu() / nn_[:, None, None]).bfloat16()
                torch.save(out, os.path.join(a.out, exps[name][part] + ".pt"))
            mod._rec = None; del rec
        if cuda: torch.cuda.empty_cache()
    for h in hooks: h.remove()
    for name, d in acc.items():
        out = {"H_in": (d["H_in"] / d["n"]).cpu(), "n": d["n"]}
        if d["H_out"] is not None: out["H_out"] = (d["H_out"] / d["n"]).cpu()
        torch.save(out, os.path.join(a.out, names[name] + ".pt"))
    json.dump({"model": a.model, "chunks": n, "ctx": a.ctx, "tensors": len(acc), "expert_tensors": sum(len(v) for v in exps.values()),
               "passes": len(groups), "seconds": round(time.time() - t0, 1), "out_factor": not a.no_out,
               "names": {**names, **{f"{k}.{p}": v for k, d in exps.items() for p, v in d.items()}}},
              open(os.path.join(a.out, "info.json"), "w"), indent=1)
    print(f"hess_hf: {len(acc)} linears + {sum(len(v) for v in exps.values())} expert tensors, {n} chunks of {a.ctx}, "
          f"{len(groups)} pass(es), {time.time() - t0:.0f} s -> {a.out}")


if __name__ == "__main__":
    main()
