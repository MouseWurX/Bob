#!/usr/bin/env python3
"""Ask the full teacher (Qwen3.6-35B-A3B in BF16, or GPT-OSS 120B in MXFP4, loaded here with transformers) what it thinks at every answer position.

Stores the teacher's top-K words and their log-probabilities per answer token, so the heal step can distil
without keeping the teacher in memory. Output: teacher.pt = {piece id: (ids[int32 n x K], logp[f16 n x K],
own[f16 n] = teacher logprob of the real next word)} over the answer positions, in order.
Also the first real test of the model code on the GPU (same class and forward the heal uses).

With --engine URL the odds come from a running Brain Engine llama-server instead (patch 0015, prompt_odds, started with
--prompt-odds-max N, for example 128), so a GGUF
teacher can be used: --model is then only read for its tokenizer, which must match the GGUF's (checked before the pass).
A server started with --api-key takes the key from the ENGINE_KEY environment variable (never on the command line).
"""
import argparse, json, os, sys, time, urllib.error, urllib.request
import torch
from transformers import AutoTokenizer
import data as D, family as FAM

def load_model(path, dev):
    if FAM.family(path) == FAM.GPT_OSS:  # MXFP4 kept when the card can (the 120B in about 65 GB), see family.py
        m = FAM.load(path, dev, teacher=True)
        print(f"GPT-OSS teacher loaded, {torch.cuda.memory_allocated() / 1e9 if dev == 'cuda' else 0:.1f} GB on the card", flush=True)
        return m
    for impl in ("grouped_mm", None):
        try:
            kw = {"experts_implementation": impl} if impl else {}
            from transformers import Qwen3_5MoeForConditionalGeneration
            m = Qwen3_5MoeForConditionalGeneration.from_pretrained(path, dtype=torch.bfloat16, device_map=dev, **kw)
            print(f"teacher loaded (experts: {impl or 'default'}), {torch.cuda.memory_allocated() / 1e9 if dev == 'cuda' else 0:.1f} GB", flush=True)
            return m
        except TypeError as e:
            print(f"experts_implementation={impl} not accepted ({str(e)[:80]}); trying the default")
    raise RuntimeError("could not load the teacher")

@torch.no_grad()
def score(model, r, K, dev):
    dev = next(model.parameters()).device if str(dev) == "auto" else dev
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

def engine_post(url, path, body, timeout=600):
    r = urllib.request.Request(url.rstrip("/") + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json",
                                 **({"Authorization": "Bearer " + os.environ["ENGINE_KEY"]} if os.environ.get("ENGINE_KEY") else {})})
    try:
        return json.loads(urllib.request.urlopen(r, timeout=timeout).read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"engine said {e.code}: {e.read()[:300]!r}")

def engine_check(url, tok):
    """The engine must have prompt odds (Brain Engine 0015) and the same tokenizer as --model."""
    text = "Bob checks the teacher's word list: tool_call {\"name\": \"read_file\"} 123 caf\u00e9."
    theirs = engine_post(url, "/tokenize", {"content": text, "add_special": False})["tokens"]
    ours = tok.encode(text, add_special_tokens=False)
    if theirs != ours:
        sys.exit(f"the engine's tokenizer differs from --model's ({len(theirs)} vs {len(ours)} tokens): use the same teacher for both")
    try:
        r = engine_post(url, "/completion", {"prompt": ours, "n_predict": 0, "cache_prompt": False, "prompt_odds": 1})
    except RuntimeError as e:
        sys.exit(f"the engine refused prompt odds ({str(e)[:200]})")
    if "prompt_odds" not in r:
        sys.exit("this engine gives no prompt odds: it needs Brain Engine with patch 0015, started with --prompt-odds-max")

def score_engine(url, r, K):
    """The same rows as score(), from the engine: answer positions p (mask[p + 1] == 1) give the odds of ids[p + 1]."""
    ids = [int(x) for x in r["ids"]]
    m = torch.tensor(r["mask"]); pos = (m[1:] == 1).nonzero(as_tuple=True)[0]
    if len(pos) == 0: return None
    frm = int(pos[0]) + 1  # the first scored token; the prompt cache can keep everything before the one in front of it
    po = engine_post(url, "/completion", {"prompt": ids, "n_predict": 0, "temperature": 0, "cache_prompt": True,
                                          "prompt_odds": K, "prompt_odds_from": frm}).get("prompt_odds")
    if not po or po.get("missing") or po["k"] != K or po["n"] != len(ids) - frm:
        raise RuntimeError(f"the engine's prompt odds came back wrong ({ {k: po.get(k) for k in ('from', 'n', 'k', 'missing')} if po else None })")
    rows = (pos + 1 - frm).tolist()
    top_ids = torch.tensor([po["top_ids"][i] for i in rows], dtype=torch.int32)
    top = torch.tensor([po["top"][i] for i in rows], dtype=torch.float32).to(torch.float16)
    own = torch.tensor([po["own"][i] for i in rows], dtype=torch.float32).to(torch.float16)
    return top_ids, top, own

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--lessons", required=True)
    ap.add_argument("--out", default="teacher.pt"); ap.add_argument("--top", type=int, default=32)
    ap.add_argument("--max-len", type=int, default=8192); ap.add_argument("--cache", default="lessons-tok.pt")
    ap.add_argument("--general", default=None); ap.add_argument("--general-tokens", type=int, default=0)
    ap.add_argument("--device", default="cuda"); ap.add_argument("--hours", type=float, default=2.0)
    ap.add_argument("--engine", default=None, help="a Brain Engine llama-server URL (patch 0015) to ask instead of loading --model")
    a = ap.parse_args()
    tok = AutoTokenizer.from_pretrained(a.model)
    data = D.build_all(tok, a.lessons, a.max_len, a.cache, a.general, a.general_tokens)
    rows = data["train"] + data["test"]
    rows.sort(key=lambda r: (not r["id"].startswith("g:"), -len(r["ids"])))  # lessons first (the important ones), long ones first (finds memory trouble early)
    rows = [r for r in rows if not r["id"].startswith("g:")] + [r for r in rows if r["id"].startswith("g:")]
    done = torch.load(a.out) if os.path.exists(a.out) else {}
    todo = [r for r in rows if r["id"] not in done]
    print(f"teacher pass: {len(todo)} pieces to do, {len(done)} done, {sum(len(r['ids']) for r in todo) / 1e6:.1f}M tokens", flush=True)
    if a.engine:
        engine_check(a.engine, tok); model = None
        print(f"teacher odds from the engine at {a.engine}", flush=True)
    else:
        model = load_model(a.model, a.device).eval()
    t0 = time.time(); n = 0; fails = 0; toks = 0; deadline = t0 + a.hours * 3600
    for r in todo:
        try:
            res = score_engine(a.engine, r, a.top) if a.engine else score(model, r, a.top, a.device)
        except torch.OutOfMemoryError:
            fails += 1; torch.cuda.empty_cache() if a.device == "cuda" else None; print(f"out of memory on {len(r['ids'])} tokens ({r['id']}), skipped", flush=True)
            if fails >= 20 and n == 0: sys.exit("the teacher cannot score anything: giving up")
            continue
        except RuntimeError as e:
            if not a.engine: raise
            fails += 1; print(f"engine could not score {r['id']} ({len(r['ids'])} tokens): {str(e)[:200]}", flush=True)
            if fails >= 20 and n == 0: sys.exit("the engine cannot score anything: giving up")
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
