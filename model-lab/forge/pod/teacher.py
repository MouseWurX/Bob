#!/usr/bin/env python3
"""Ask the full teacher (Qwen3.6-35B-A3B, BF16, loaded here with transformers) what it thinks at every answer position.

Stores the teacher's top-K words and their log-probabilities per answer token, so the heal step can distil
without keeping the teacher in memory. Output: teacher.pt = {piece id: (ids[int32 n x K], logp[f16 n x K],
own[f16 n] = teacher logprob of the real next word)} over the answer positions, in order.
Also the first real test of the model code on the GPU (same class and forward the heal uses).
"""
import argparse, json, os, sys, time
import torch
from transformers import AutoTokenizer, Qwen3_5MoeForConditionalGeneration
import data as D

def load_model(path, dev):
    for impl in ("grouped_mm", None):
        try:
            kw = {"experts_implementation": impl} if impl else {}
            m = Qwen3_5MoeForConditionalGeneration.from_pretrained(path, dtype=torch.bfloat16, device_map=dev, **kw)
            print(f"teacher loaded (experts: {impl or 'default'}), {torch.cuda.memory_allocated() / 1e9 if dev == 'cuda' else 0:.1f} GB", flush=True)
            return m
        except TypeError as e:
            print(f"experts_implementation={impl} not accepted ({str(e)[:80]}); trying the default")
    raise RuntimeError("could not load the teacher")

@torch.no_grad()
def score(model, r, K, dev):
    ids = torch.tensor(r["ids"], device=dev)[None]
    m = torch.tensor(r["mask"]); pos = (m[1:] == 1).nonzero(as_tuple=True)[0].to(dev)
    if len(pos) == 0: return None
    out = []
    for i in range(0, len(pos), 512):  # vocab is 248k: keep the log-softmax chunks small
        p = pos[i:i + 512]
        logits = model(input_ids=ids, logits_to_keep=p, use_cache=False).logits[0].float()
        lp = torch.log_softmax(logits, dim=-1)
        top = lp.topk(K, dim=-1)
        own = lp.gather(1, ids[0, p + 1][:, None])[:, 0]
        out.append((top.indices.to(torch.int32).cpu(), top.values.to(torch.float16).cpu(), own.to(torch.float16).cpu()))
        del logits, lp
    return tuple(torch.cat([o[j] for o in out]) for j in range(3))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--lessons", required=True)
    ap.add_argument("--out", default="teacher.pt"); ap.add_argument("--top", type=int, default=32)
    ap.add_argument("--max-len", type=int, default=8192); ap.add_argument("--cache", default="lessons-tok.pt")
    ap.add_argument("--general", default=None); ap.add_argument("--general-tokens", type=int, default=0)
    ap.add_argument("--device", default="cuda"); ap.add_argument("--hours", type=float, default=2.0)
    a = ap.parse_args()
    tok = AutoTokenizer.from_pretrained(a.model)
    data = D.build_all(tok, a.lessons, a.max_len, a.cache, a.general, a.general_tokens)
    rows = data["train"] + data["test"]
    rows.sort(key=lambda r: (not r["id"].startswith("g:"), -len(r["ids"])))  # lessons first (the important ones), long ones first (finds memory trouble early)
    rows = [r for r in rows if not r["id"].startswith("g:")] + [r for r in rows if r["id"].startswith("g:")]
    done = torch.load(a.out) if os.path.exists(a.out) else {}
    todo = [r for r in rows if r["id"] not in done]
    print(f"teacher pass: {len(todo)} pieces to do, {len(done)} done, {sum(len(r['ids']) for r in todo) / 1e6:.1f}M tokens", flush=True)
    model = load_model(a.model, a.device).eval()
    t0 = time.time(); n = 0; fails = 0; toks = 0; deadline = t0 + a.hours * 3600
    for r in todo:
        try:
            res = score(model, r, a.top, a.device)
        except torch.OutOfMemoryError:
            fails += 1; torch.cuda.empty_cache() if a.device == "cuda" else None; print(f"out of memory on {len(r['ids'])} tokens ({r['id']}), skipped", flush=True)
            if fails >= 20 and n == 0: sys.exit("the teacher cannot score anything: giving up")
            continue
        if res is None: continue
        done[r["id"]] = res; n += 1; toks += len(r["ids"])
        if n % 100 == 0:
            el = time.time() - t0
            print(f"{n}/{len(todo)} pieces, {toks / el:.0f} tok/s, {el / 60:.0f} min, {torch.cuda.max_memory_allocated() / 1e9 if a.device == 'cuda' else 0:.0f} GB peak", flush=True)
        if n % 2000 == 0: torch.save(done, a.out)
        if time.time() > deadline: print("teacher pass time is up; using what is scored so far"); break
    torch.save(done, a.out)
    print(f"teacher done: {len(done)} pieces ({fails} skipped) in {(time.time() - t0) / 60:.0f} min -> {a.out}", flush=True)

if __name__ == "__main__":
    main()
