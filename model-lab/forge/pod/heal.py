#!/usr/bin/env python3
"""Heal a cut Bob: teach it to answer like the full teacher again, on Bob's lessons.

  heal.py --model <cut Bob dir> --lessons <dir with lessons.jsonl + toolsets.json> --teacher teacher.pt --save <healed dir>
  Options: --experts lora|full|frozen  --r 32  --lr 1e-4  --epochs 1  --tokens-per-step 65536  --max-len 8192
           --hours 3 (stop and save in time)  --eval-only (just measure)  --alpha 0.7 (share of the loss from the teacher)
Loss = alpha * KL(teacher top-K || student) + (1 - alpha) * cross-entropy on the real next word, over answer tokens only.
Writes <save>/heal-report.json with held-out numbers before and after. Resumable (lora-state.pt every 100 steps).
"""
import argparse, json, math, os, random, time
import torch, torch.nn.functional as F
from transformers import AutoTokenizer, Qwen3_5MoeForConditionalGeneration
import data as D, lora as L

def positions(r):
    m = torch.tensor(r["mask"]); return (m[1:] == 1).nonzero(as_tuple=True)[0]   # pos predicts pos+1

def losses(model, r, teach, alpha, dev):
    ids = torch.tensor(r["ids"], device=dev)[None]
    pos = positions(r).to(dev)
    if len(pos) == 0: return None
    logits = model(input_ids=ids, logits_to_keep=pos, use_cache=False).logits[0].float()
    target = ids[0, pos + 1]
    ce = F.cross_entropy(logits, target)
    kd = torch.zeros((), device=dev)
    if teach is not None and len(teach[0]) == len(pos):
        tid = teach[0].to(dev).long(); tlp = teach[1].to(dev).float()
        t = torch.softmax(tlp, dim=-1)
        s = torch.log_softmax(logits, dim=-1).gather(1, tid)
        kd = (t * (torch.log(t + 1e-9) - s)).sum(-1).mean()
        loss = alpha * kd + (1 - alpha) * ce
    else:
        loss = ce
    return loss, ce.detach(), kd.detach(), len(pos)

@torch.no_grad()
def evaluate(model, rows, teacher, alpha, dev, limit=None):
    model.eval(); tot = {"ce": 0.0, "kd": 0.0, "n": 0, "teacher_ce": 0.0, "teacher_n": 0}
    for r in (rows[:limit] if limit else rows):
        out = losses(model, r, teacher.get(r["id"]), alpha, dev)
        if out is None: continue
        _, ce, kd, n = out
        tot["ce"] += ce.item() * n; tot["kd"] += kd.item() * n; tot["n"] += n
        t = teacher.get(r["id"])
        if t is not None and len(t) > 2 and len(t[2]) == n:
            tot["teacher_ce"] += -t[2].float().sum().item(); tot["teacher_n"] += n
    n = max(tot["n"], 1)
    return {"ce": tot["ce"] / n, "kd": tot["kd"] / n, "answer_tokens": tot["n"],
            "teacher_ce": tot["teacher_ce"] / max(tot["teacher_n"], 1) if tot["teacher_n"] else None}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--lessons", required=True); ap.add_argument("--teacher", default=None)
    ap.add_argument("--save", default=None); ap.add_argument("--experts", default="lora", choices=["lora", "full", "frozen"])
    ap.add_argument("--r", type=int, default=32); ap.add_argument("--r-experts", type=int, default=8); ap.add_argument("--lr", type=float, default=1e-4); ap.add_argument("--router-lr", type=float, default=2e-5)
    ap.add_argument("--epochs", type=float, default=1.0); ap.add_argument("--tokens-per-step", type=int, default=65536)
    ap.add_argument("--max-len", type=int, default=8192); ap.add_argument("--hours", type=float, default=3.0)
    ap.add_argument("--alpha", type=float, default=0.7); ap.add_argument("--eval-only", action="store_true")
    ap.add_argument("--eval-lessons", type=int, default=150); ap.add_argument("--cache", default="lessons-tok.pt"); ap.add_argument("--general", default=None); ap.add_argument("--general-tokens", type=int, default=0)
    ap.add_argument("--report", default=None); ap.add_argument("--seed", type=int, default=1); ap.add_argument("--device", default="cuda")
    a = ap.parse_args()
    random.seed(a.seed); torch.manual_seed(a.seed)
    dev = a.device
    tok = AutoTokenizer.from_pretrained(a.model)
    data = D.build_all(tok, a.lessons, a.max_len, a.cache, a.general, a.general_tokens)
    teacher = torch.load(a.teacher) if a.teacher and os.path.exists(a.teacher) else {}
    print(f"teacher data for {len(teacher)} lessons")
    t0 = time.time()
    model = Qwen3_5MoeForConditionalGeneration.from_pretrained(a.model, dtype=torch.bfloat16, device_map=dev)
    model.config.use_cache = False
    print(f"model loaded in {time.time() - t0:.0f}s, {(torch.cuda.memory_allocated() / 1e9) if dev == "cuda" else 0:.1f} GB")
    report = {"model": a.model, "experts": a.experts, "args": vars(a)}
    tests = {"lessons": [r for r in data["test"] if not r.get("general")], "general": [r for r in data["test"] if r.get("general")]}
    score = lambda: {k: evaluate(model, v, teacher, a.alpha, dev, a.eval_lessons) for k, v in tests.items() if v}
    report["before"] = score()
    print("held-out before:", report["before"], flush=True)
    rp = a.report or os.path.join(a.save or ".", "heal-report.json")
    if a.eval_only:
        os.makedirs(os.path.dirname(rp) or ".", exist_ok=True); json.dump(report, open(rp, "w"), indent=1); return

    params = L.attach(model, r=a.r, experts=a.experts, r_experts=a.r_experts)
    router = [p for n, p in model.named_parameters() if p.requires_grad and n.endswith("mlp.gate.weight")]
    rest = [p for p in params if not any(p is q for q in router)]
    groups = [{"params": rest, "lr": a.lr}, {"params": router, "lr": a.router_lr}]
    opt = None
    if a.experts == "full":
        try:
            import bitsandbytes as bnb; opt = bnb.optim.AdamW8bit(groups, weight_decay=0.0); print("8-bit AdamW")
        except Exception as e: print(f"bitsandbytes not usable ({str(e)[:60]}), plain AdamW")
    if opt is None: opt = torch.optim.AdamW(groups, weight_decay=0.0, betas=(0.9, 0.95))
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.enable_input_require_grads()
    model.train()

    rows = data["train"]; tokens_total = sum(len(r["ids"]) for r in rows)
    steps_total = max(1, int(a.epochs * tokens_total / a.tokens_per_step))
    warm = max(5, steps_total // 20)
    sched = lambda s: min(1.0, (s + 1) / warm) * (0.5 * (1 + math.cos(math.pi * min(1.0, s / steps_total))) * 0.9 + 0.1)
    state_path = os.path.join(a.save or ".", "lora-state.pt"); step = 0; ptr = 0
    if os.path.exists(state_path):
        st = torch.load(state_path); L.load_trainable(model, st["params"]); opt.load_state_dict(st["opt"]); step = st["step"]; ptr = st.get("ptr", 0)
        print(f"resumed at step {step}")
    os.makedirs(a.save or ".", exist_ok=True)
    print(f"training: {steps_total} steps of ~{a.tokens_per_step} tokens, {len(rows)} lessons/epoch, stop after {a.hours} h", flush=True)
    deadline = time.time() + a.hours * 3600; t0 = time.time(); seen = 0
    order = list(range(len(rows))); random.shuffle(order)
    acc_tok = 0; acc = {"loss": 0.0, "ce": 0.0, "kd": 0.0, "n": 0}
    skipped_oom = 0; cap = a.max_len
    while step < steps_total and time.time() < deadline:
        r = rows[order[ptr % len(order)]]; ptr += 1
        if len(r["ids"]) > cap:  # after an out-of-memory, long lessons are shortened instead of skipped forever
            t = teacher.get(r["id"]); keep = sum(r["mask"][1:cap])
            r = {**r, "ids": r["ids"][:cap], "mask": r["mask"][:cap]}
            if t is not None: teacher = {**teacher, r["id"]: tuple(x[:keep] for x in t)}
        try:
            out = losses(model, r, teacher.get(r["id"]), a.alpha, dev)
            if out is None: continue
            loss, ce, kd, n = out
            (loss * len(r["ids"]) / a.tokens_per_step).backward()
        except torch.OutOfMemoryError:
            skipped_oom += 1; opt.zero_grad(set_to_none=True); torch.cuda.empty_cache() if dev == "cuda" else None
            if skipped_oom >= 3 and cap > 1024: cap //= 2; print(f"out of memory 3 times: lessons now cut to {cap} tokens")
            print(f"out of memory on a {len(r['ids'])}-token lesson, skipped"); continue
        acc_tok += len(r["ids"]); seen += len(r["ids"])
        acc["loss"] += loss.item() * n; acc["ce"] += ce.item() * n; acc["kd"] += kd.item() * n; acc["n"] += n
        if acc_tok >= a.tokens_per_step:
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            for g, base in zip(opt.param_groups, (a.lr, a.router_lr)): g["lr"] = base * sched(step)
            opt.step(); opt.zero_grad(set_to_none=True); step += 1; acc_tok = 0
            if step % 10 == 0 or step == 1:
                n = max(acc["n"], 1); el = time.time() - t0
                print(f"step {step}/{steps_total} loss {acc['loss'] / n:.3f} ce {acc['ce'] / n:.3f} kd {acc['kd'] / n:.3f} "
                      f"{seen / el:.0f} tok/s, {el / 60:.0f} min, {(torch.cuda.max_memory_allocated() / 1e9) if dev == "cuda" else 0:.0f} GB", flush=True)
                acc = {"loss": 0.0, "ce": 0.0, "kd": 0.0, "n": 0}
            if step % 100 == 0:
                torch.save({"params": L.trainable_state(model), "opt": opt.state_dict(), "step": step, "ptr": ptr}, state_path)
    report["steps"] = step; report["planned_steps"] = steps_total; report["tokens_seen"] = seen; report["minutes"] = (time.time() - t0) / 60; report["oom_skipped"] = skipped_oom
    report["after"] = score()
    print("held-out after:", report["after"], flush=True)
    if a.save:  # the small adapter alone (LoRA + router): with the keep list it rebuilds this healed Bob from the teacher, no volume needed
        torch.save({"params": L.trainable_state(model), "step": step, "r": a.r, "r_experts": a.r_experts, "experts": a.experts}, os.path.join(a.save, "adapter.pt"))
    L.merge_all(model)
    if a.save:
        model.save_pretrained(a.save, safe_serialization=True, max_shard_size="4GB"); tok.save_pretrained(a.save)
        for fn in ("bob-keep.json", "preprocessor_config.json", "chat_template.jinja", "generation_config.json"):
            src = os.path.join(a.model, fn)
            if os.path.exists(src) and not os.path.exists(os.path.join(a.save, fn)):
                import shutil; shutil.copy(src, os.path.join(a.save, fn))
        if os.path.exists(state_path): os.remove(state_path)
        print(f"saved healed model to {a.save}")
    json.dump(report, open(rp, "w"), indent=1)

if __name__ == "__main__":
    main()
