#!/usr/bin/env python3
"""Find what turns a brain's next-word odds non-finite during the Hessian pass, step by step (Inkling 2 Mini tries 7
and 8, 28 Nov: the first chunks read finitely, then every later chunk was NaN from layer 12, even with nothing
recording). Each stage reads the same few chunks forward and backward with one more piece of hess_hf.py switched on,
then reads them again with no gradients and checks every weight and buffer for non-finite values:

  0 forward only, nothing changed           3 + hess_hf's expert forward on the coded blocks (not recording)
  1 forward and backward, nothing changed   4 + recording the first coded block (H_in and H_out)
  2 + the expert backward without weight    5 + recording the second coded block instead (and so on)
    gradients (no_expert_weight_grads)

  hess_probe.py --model hf-bf16/ --text train.txt --match-gguf ref.gguf --only '^blk\\.(0|6)\\.' --devices 2 --ctx 256

Prints one line per stage: "stage N ...: chunks finite [T, T, F], weights not finite: [...]". 28 Nov 2026."""
import argparse, os, re, sys, types

import torch
import torch.nn.functional as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hess_hf as H  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--text", required=True); ap.add_argument("--match-gguf", required=True)
    ap.add_argument("--only", default=None); ap.add_argument("--devices", type=int, default=1); ap.add_argument("--ctx", type=int, default=256)
    ap.add_argument("--chunks", type=int, default=3); ap.add_argument("--attn", default="sdpa"); a = ap.parse_args()
    from transformers import AutoTokenizer
    cuda = torch.cuda.is_available()
    kw = {"dtype": torch.bfloat16 if cuda else torch.float32}
    if cuda and a.devices > 1: kw["device_map"] = "balanced"; kw["max_memory"] = {i: int(torch.cuda.mem_get_info(i)[0] * 0.7) for i in range(a.devices)}
    m = H.load_model(a.model, kw, a.attn)
    if cuda and a.devices <= 1: m = m.to("cuda:0")
    m.eval(); [p.requires_grad_(False) for p in m.parameters()]
    if hasattr(m, "hf_device_map"): print(f"probe: device map {sorted(set(m.hf_device_map.values()), key=str)}, layer 12 on "
                                         f"{next((v for k, v in m.hf_device_map.items() if 'layers.12' in k), '?')}", flush=True)
    H.expert_modules_cache.update(H.expert_modules(m))
    names, exps = H.match_names(m, a.match_gguf)
    if a.only: exps = {k: d for k, d in exps.items() if any(re.search(a.only, g) for g in d.values())}
    blocks = list(exps); print(f"probe: coded expert blocks {blocks}", flush=True)
    tok = AutoTokenizer.from_pretrained(a.model)
    ids = torch.tensor(tok(open(a.text, encoding="utf-8").read()[:2_000_000])["input_ids"])
    dev0 = next(m.parameters()).device; emb = m.get_input_embeddings(); torch.manual_seed(0)
    chunks = [ids[c * a.ctx:(c + 1) * a.ctx][None].to(dev0) for c in range(a.chunks)]

    def bad_weights():
        out = [n for n, p in list(m.named_parameters()) + list(m.named_buffers()) if p.is_floating_point() and not torch.isfinite(p).all()]
        return out[:5] + ([f"... {len(out)} in all"] if len(out) > 5 else [])

    def look():
        with torch.no_grad(): return [bool(torch.isfinite(m(input_ids=x).logits).all()) for x in chunks]

    def fwd_bwd():
        ok = []
        for x in chunks:
            e = emb(x).detach().requires_grad_(True); lg = m(inputs_embeds=e).logits.float()
            ok.append(bool(torch.isfinite(lg).all()))
            if ok[-1]:
                with torch.no_grad(): y = torch.distributions.Categorical(logits=lg).sample()
                F.cross_entropy(lg.reshape(-1, lg.shape[-1]), y.reshape(-1), reduction="sum").backward()
            del lg, e
        return ok

    def rec_for(name):
        mod = H.expert_modules_cache[name]; E, I2, Hd = mod.gate_up_proj.shape; I = mod.down_proj.shape[2]; dv = mod.gate_up_proj.device
        z = lambda k: torch.zeros(E, k, k, device=dv)
        return {"gate_up_proj": {"H_in": z(Hd), "H_out": z(I2)}, "down_proj": {"H_in": z(I), "H_out": z(Hd)},
                "n": torch.zeros(E, dtype=torch.float64), "n_out": torch.zeros(E, dtype=torch.float64), "out": True}

    def report(stage, what, ok=None):
        after = look(); bw = bad_weights()
        print(f"probe: stage {stage} ({what}): {'forward+backward finite ' + str(ok) + ', ' if ok is not None else ''}"
              f"then forward only finite {after}, weights not finite: {bw or 'none'}", flush=True)
        if cuda: torch.cuda.empty_cache()

    report(0, "forward only, nothing changed")
    report(1, "forward and backward, nothing changed", fwd_bwd())
    print(f"probe: expert backward patched: {H.no_expert_weight_grads()}", flush=True)
    report(2, "+ expert backward without weight gradients", fwd_bwd())
    for name in blocks: H.expert_modules_cache[name].forward = types.MethodType(H.recording_forward, H.expert_modules_cache[name])
    report(3, "+ hess_hf's expert forward, not recording", fwd_bwd())
    for i, name in enumerate(blocks):  # one block at a time (both at once ran out of memory on 2 x 48 GB, probe 1)
        for other in blocks: H.expert_modules_cache[other]._rec = None
        if cuda: torch.cuda.empty_cache()
        H.expert_modules_cache[name]._rec = rec_for(name)
        try: report(4 + i, f"+ recording {name} only", fwd_bwd())
        except torch.OutOfMemoryError as ex: print(f"probe: stage {4 + i} out of card memory ({str(ex)[:120]})", flush=True)
    for other in blocks: H.expert_modules_cache[other]._rec = None
    print("probe: done", flush=True)


if __name__ == "__main__":
    main()
