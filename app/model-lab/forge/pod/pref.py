#!/usr/bin/env python3
"""Preference training for the heal: lean toward the right answer and away from the wrong one on the same chat.

Reads a folder made by the Lab's make-pairs.mjs:
  pairs.jsonl  {"idea", "source", "prompt": [msgs], "chosen": [msgs], "rejected": [msgs]}   (a right and a wrong answer)
  kto.jsonl    {"idea", "source", "prompt": [msgs], "answer": [msgs], "ok": true/false}       (one answer, marked)
  toolsets.json (Bob's prompt + tools, by key, as in the lessons folder)
Messages are in the lessons' own shape (data.to_chat renders them), so tool calls and thinking are trained too.

Kinds (heal.py --pref-kind):
  orpo  mixed into the normal heal from the start, needs no second model (odds-ratio loss on the pair's mean word odds)
  dpo   a short pass after the heal: the healed Bob is frozen as the reference first, then pairs move it from there
  kto   like dpo, but from single marked answers (no pairs needed): the review's ok / failed marks are enough
The same 5% of ideas held out from the lessons (data.is_holdout) are held out here, and measured before and after.
"""
import json, os, random
import torch, torch.nn.functional as F
import data as D

def _read(path):
    out = []
    if not os.path.exists(path): return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try: out.append(json.loads(line))
            except json.JSONDecodeError: pass
    return out

def _render(tok, idea, msgs, sets, max_len):
    return D.render(tok, {"idea": idea, "messages": msgs}, sets, max_len)

def _answer_only(r, start):
    """Train only the words after `start` (the shared prompt); the history's own assistant turns stay out."""
    m = [0] * min(start, len(r["mask"])) + r["mask"][start:]
    return {**r, "mask": m} if any(m[1:]) else None

def _shared(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y: break
        n += 1
    return n

def held(row):
    """Held out = the lessons' 5% by idea, or a row the Lab marked (tool-score's own held-out chats): never trained on."""
    return bool(row.get("holdout")) or D.is_holdout(row["idea"])

def build(tok, pref_dir, max_len):
    """-> {"pairs": {"train", "test"}, "kto": {"train", "test"}, "skipped": n}"""
    sets_path = os.path.join(pref_dir, "toolsets.json")
    sets = json.load(open(sets_path)) if os.path.exists(sets_path) else {}
    out = {"pairs": {"train": [], "test": []}, "kto": {"train": [], "test": []}, "skipped": 0}
    for p in _read(os.path.join(pref_dir, "pairs.jsonl")):
        prompt = p.get("prompt") or []
        c = _render(tok, p["idea"], prompt + p["chosen"], sets, max_len)
        r = _render(tok, p["idea"], prompt + p["rejected"], sets, max_len)
        base = _render(tok, p["idea"], prompt, sets, max_len) if any(m.get("role") == "assistant" for m in prompt) else None
        if c is None or r is None: out["skipped"] += 1; continue
        # where the two answers part: everything before it is the prompt (and words both answers share, which cancel anyway)
        start = _shared(c["ids"], r["ids"])
        if base is not None: start = min(start, len(base["ids"]) - 1)
        c, r = _answer_only(c, start), _answer_only(r, start)
        if c is None or r is None or c["ids"] == r["ids"]: out["skipped"] += 1; continue
        row = {"id": str(p["idea"]), "chosen": c, "rejected": r, "source": p.get("source", "")}
        out["pairs"]["test" if held(p) else "train"].append(row)
    for k in _read(os.path.join(pref_dir, "kto.jsonl")):
        if k.get("ok") is None: continue  # unsure (needs-review): no mark, no lesson
        prompt = k.get("prompt") or []
        full = _render(tok, k["idea"], prompt + k["answer"], sets, max_len)
        if full is None: out["skipped"] += 1; continue
        start = len(_render(tok, k["idea"], prompt, sets, max_len)["ids"]) - 1 if any(m.get("role") == "assistant" for m in prompt) else 0
        if start <= 0:  # no assistant turn in the prompt: the answer starts at the first assistant word
            start = next((i for i, m in enumerate(full["mask"]) if m), 0)
        row = _answer_only(full, start)
        if row is None: out["skipped"] += 1; continue
        out["kto"]["test" if held(k) else "train"].append({"id": str(k["idea"]), "answer": row, "ok": bool(k["ok"]), "source": k.get("source", "")})
    print(f"preference data: {len(out['pairs']['train'])} pairs (+{len(out['pairs']['test'])} held out), "
          f"{len(out['kto']['train'])} marked answers (+{len(out['kto']['test'])} held out), {out['skipped']} skipped", flush=True)
    return out

def seq_logp(model, r, dev):
    """Sum and count of the log-odds of the answer words (mask == 1)."""
    ids = torch.tensor(r["ids"], device=dev)[None]
    pos = (torch.tensor(r["mask"])[1:] == 1).nonzero(as_tuple=True)[0].to(dev)
    logits = model(input_ids=ids, logits_to_keep=pos, use_cache=False).logits[0].float()
    lp = torch.log_softmax(logits, dim=-1).gather(1, ids[0, pos + 1][:, None])[:, 0]
    return lp.sum(), len(pos)

# ---- the losses (pure functions of log-odds, so the self-test can check them without a model) ----
def dpo_loss(pc, pr, rc, rr, beta):
    """pc/pr: policy sum log-odds of chosen/rejected; rc/rr: the same from the frozen reference."""
    margin = beta * ((pc - rc) - (pr - rr))
    return -F.logsigmoid(margin), margin

def orpo_loss(mc, mr, lam):
    """mc/mr: MEAN log-odds per word (always < 0). log odds(p) = log p - log(1 - p)."""
    lo = lambda m: m - torch.log1p(-torch.exp(m.clamp(max=-1e-6)))
    ratio = lo(mc) - lo(mr)
    return -lam * F.logsigmoid(ratio), ratio

def kto_loss(p, r, ok, z0, beta, w_ok=1.0, w_bad=1.0):
    """p/r: policy / reference sum log-odds of one answer; z0: the reference point (mean policy-vs-reference gap, >= 0)."""
    gap = p - r
    if ok: return w_ok * (1 - torch.sigmoid(beta * (gap - z0))), gap
    return w_bad * (1 - torch.sigmoid(beta * (z0 - gap))), gap

@torch.no_grad()
def reference(model, pref, dev):
    """Freeze the model as it is now: every pair's and marked answer's log-odds, for dpo / kto."""
    model.eval(); ref = {}
    for split in ("train", "test"):
        for i, row in enumerate(pref["pairs"][split]):
            ref[("p", split, i)] = (seq_logp(model, row["chosen"], dev)[0].item(), seq_logp(model, row["rejected"], dev)[0].item())
        for i, row in enumerate(pref["kto"][split]):
            ref[("k", split, i)] = seq_logp(model, row["answer"], dev)[0].item()
    return ref

@torch.no_grad()
def evaluate(model, pref, dev, limit=200):
    """Held-out pairs: how often the right answer gets the better mean word odds, and by how much."""
    model.eval(); won = n = 0; margin = 0.0
    for row in pref["pairs"]["test"][:limit]:
        (sc, nc), (sr, nr) = seq_logp(model, row["chosen"], dev), seq_logp(model, row["rejected"], dev)
        m = (sc / nc - sr / nr).item(); margin += m; won += m > 0; n += 1
    ok, bad = [], []
    for row in pref["kto"]["test"][:limit]:
        s, k = seq_logp(model, row["answer"], dev)
        (ok if row["ok"] else bad).append((s / k).item())
    mean = lambda xs: sum(xs) / len(xs) if xs else None
    return {"pairs": n, "right_preferred": won / n if n else None, "mean_margin": margin / n if n else None,
            "marked": len(ok) + len(bad), "ok_minus_failed": (mean(ok) - mean(bad)) if ok and bad else None}

def pair_step(model, row, kind, beta, dev, ref=None):
    """One pair's loss for orpo or dpo, with the right answer's own word loss for orpo (its SFT half)."""
    (sc, nc), (sr, nr) = seq_logp(model, row["chosen"], dev), seq_logp(model, row["rejected"], dev)
    if kind == "orpo":
        loss, ratio = orpo_loss(sc / nc, sr / nr, beta)
        return loss + (-sc / nc), ratio.detach(), nc + nr
    rc, rr = ref
    loss, margin = dpo_loss(sc, sr, torch.tensor(rc, device=dev), torch.tensor(rr, device=dev), beta)
    return loss, margin.detach(), nc + nr

def stage(model, opt, params, pref, kind, beta, dev, hours, lr, steps_max=None, log=print, every=8):
    """dpo / kto after the heal: reference first, then a time-boxed pass. Returns a small report."""
    import time
    ref = reference(model, pref, dev)
    for j, g in enumerate(opt.param_groups): g["lr"] = lr if j == 0 else lr * 0.2
    model.train(); deadline = time.time() + hours * 3600; step = 0; z_hist = []; acc = []
    items = ([("p", i) for i in range(len(pref["pairs"]["train"]))] if kind == "dpo" else [("k", i) for i in range(len(pref["kto"]["train"]))])
    if not items: log(f"{kind}: nothing to train on"); return {"steps": 0}
    random.shuffle(items)
    n_ok = sum(1 for r in pref["kto"]["train"] if r["ok"]); n_bad = len(pref["kto"]["train"]) - n_ok
    # KTO's balance: failed answers are fewer than kept ones, so each counts for more (their paper's 1:1 to 4:3 rule)
    w_bad = (n_ok / max(n_bad, 1)) if kind == "kto" and n_bad else 1.0
    while time.time() < deadline and (steps_max is None or step < steps_max):
        kind_i, i = items[step % len(items)]
        if kind == "dpo":
            loss, m, _ = pair_step(model, pref["pairs"]["train"][i], "dpo", beta, dev, ref[("p", "train", i)])
        else:
            row = pref["kto"]["train"][i]; s, _ = seq_logp(model, row["answer"], dev)
            z0 = max(0.0, sum(z_hist[-64:]) / len(z_hist[-64:])) if z_hist else 0.0
            loss, m = kto_loss(s, torch.tensor(ref[("k", "train", i)], device=dev), row["ok"], z0, beta, 1.0, min(w_bad, 4.0))
            z_hist.append(m.item())
        (loss / every).backward(); acc.append(loss.item()); step += 1
        if step % every == 0:
            torch.nn.utils.clip_grad_norm_(params, 1.0); opt.step(); opt.zero_grad(set_to_none=True)
        if step % (every * 10) == 0: log(f"{kind} step {step}: loss {sum(acc[-80:]) / len(acc[-80:]):.3f}")
    if step % every: opt.step(); opt.zero_grad(set_to_none=True)
    return {"steps": step, "loss": sum(acc) / len(acc) if acc else None}
