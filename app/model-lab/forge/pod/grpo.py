#!/usr/bin/env python3
"""Reward training (GRPO) on tool calls: the healed Bob answers each chat several times, an automatic judge grades
every answer (tool_reward.py: the same rule as the Lab's tool-score), and Bob leans toward the answers that scored
above their group's average and away from the ones below.

  grpo.py --model <healed Bob dir> --lessons <dir with lessons.jsonl + toolsets.json> --save <dir>
  Options: --group 6 (answers per chat)  --chats 4 (chats per step)  --steps 200  --hours 1.5  --lr 5e-6  --kl 0.02
           --max-new 384  --temp 1.0  --think (let it think first; off by default, answers stay short)
           --experts frozen|lora (LoRA on the experts too; default frozen, only attention + router + shared expert learn)
Chats: the first turn of every lesson (the full Qwen's recorded tool calls, or rightly none, are the answer key).
Held-out ideas (data.is_holdout) are never trained on; they are graded greedily before and after.
Writes <save>/grpo-report.json, adapter.pt and the merged model (same shape as heal.py's output).
"""
import argparse, json, math, os, random, time
import torch
from transformers import AutoTokenizer, Qwen3_5MoeForConditionalGeneration
import data as D, lora as L, tool_reward as R, targets as TG

TARGETS = {}

def chats(tok, lessons_dir, max_len, think):
    """Every lesson's first turn as a prompt + its answer key."""
    lessons, sets = D.load_lessons(lessons_dir)
    train, test = [], []
    for l in lessons:
        msgs, tools = D.to_chat(l, sets)
        first = next((i for i, m in enumerate(msgs) if m["role"] == "assistant"), None)
        if first is None: continue
        try:
            ids = tok.apply_chat_template(msgs[:first], tools=tools, tokenize=True, add_generation_prompt=True, enable_thinking=think)
        except Exception:
            continue
        if hasattr(ids, "input_ids"): ids = ids["input_ids"]
        ids = list(ids)
        if len(ids) > max_len: continue
        rec = next(m for m in l["messages"] if m["role"] == "assistant")
        row = {"id": str(l["idea"]), "ids": ids, "want": R.want_from_lesson_turn(rec), "job": l.get("job", "")}
        if TARGETS and TG.weight_of(TG.target_of(row["job"], TARGETS), TARGETS) == 0: continue
        (test if D.is_holdout(l["idea"]) else train).append(row)
    return train, test

def answer_logp(model, prompt, new, dev):
    """Per-word log-odds of the answer words `new` after `prompt`."""
    ids = torch.tensor(prompt + new, device=dev)[None]
    pos = torch.arange(len(prompt) - 1, len(prompt) - 1 + len(new), device=dev)
    logits = model(input_ids=ids, logits_to_keep=pos, use_cache=False).logits[0].float()
    return torch.log_softmax(logits, dim=-1).gather(1, ids[0, pos + 1][:, None])[:, 0]

@torch.no_grad()
def write(model, prompt, n, max_new, temp, dev, stops):
    ids = torch.tensor(prompt, device=dev)[None].repeat(n, 1)
    model.eval()
    try:
        out = model.generate(input_ids=ids, attention_mask=torch.ones_like(ids), do_sample=temp > 0, temperature=max(temp, 1e-5), top_p=1.0, top_k=0,
                             max_new_tokens=max_new, use_cache=True, eos_token_id=list(stops), pad_token_id=list(stops)[0])
        rows = out[:, len(prompt):].tolist()
    except Exception as e:
        print(f"generate() failed ({str(e)[:80]}), writing by hand", flush=True)
        rows = []
        for _ in range(n):
            new = []
            for _ in range(max_new):
                lg = model(input_ids=torch.tensor(prompt + new, device=dev)[None], logits_to_keep=1, use_cache=False).logits[0, -1].float()
                t = int(torch.multinomial(torch.softmax(lg / temp, -1), 1)) if temp > 0 else int(lg.argmax()); new.append(t)
                if t in stops: break
            rows.append(new)
    return [r[:next((i + 1 for i, t in enumerate(r) if t in stops), len(r))] for r in rows]

def grade(tok, rows, chat):
    if chat.get("search"): return [R.search_reward(chat["search"], tok.decode(r, skip_special_tokens=False)) for r in rows]
    if chat.get("check"): return [R.check_reward(chat["check"], tok.decode(r, skip_special_tokens=False)) for r in rows]
    return [R.reward(chat["want"], tok.decode(r, skip_special_tokens=False)) for r in rows]

def check_chats(tok, path, think, system="You are Bob, a helpful assistant."):
    """Written-answer checks (make-checks.mjs) as chats to learn from: the taught questions only, never the fair tests."""
    out = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line: continue
        c = json.loads(line)
        if "new" in str(c.get("pack", "")): continue  # a fair test: never learned from
        ids = tok.apply_chat_template([{"role": "system", "content": system}, {"role": "user", "content": c["q"]}], tokenize=True, add_generation_prompt=True, enable_thinking=think)
        if hasattr(ids, "input_ids"): ids = ids["input_ids"]
        out.append({"id": c["id"], "ids": list(ids), "want": [], "job": "checks", "check": c})
    return out

def search_chats(tok, path, think, sets_path=None, system="You are Bob, a helpful assistant."):
    """Look it up when unsure (search-pairs.mjs search-cases.jsonl, taught rows only): Bob's tools are offered, and the
    reward is whether he searched when he should have, and didn't when he knew."""
    sys_, tools = system, None
    if sets_path and os.path.exists(sets_path):
        sets = json.load(open(sets_path, encoding="utf-8"))
        first = next(iter(sets.values()), None)
        if first: sys_, tools = first.get("system") or system, first.get("tools")
    out = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line: continue
        c = json.loads(line)
        ids = tok.apply_chat_template([{"role": "system", "content": sys_}, {"role": "user", "content": c["q"]}], tools=tools, tokenize=True, add_generation_prompt=True, enable_thinking=think)
        if hasattr(ids, "input_ids"): ids = ids["input_ids"]
        out.append({"id": c["id"], "ids": list(ids), "want": [], "job": "search", "search": c})
    return out

@torch.no_grad()
def evaluate(model, tok, test, a, dev, stops, limit=150):
    got = {"chats": 0, "right": 0, "reward": 0.0, "kinds": {}}; per = {}
    for c in test[:limit]:
        new = write(model, c["ids"], 1, a.max_new, 0.0, dev, stops)[0]
        r, why = R.reward(c["want"], tok.decode(new, skip_special_tokens=False))
        got["chats"] += 1; got["right"] += r == R.RIGHT; got["reward"] += r; got["kinds"][why] = got["kinds"].get(why, 0) + 1
        if TARGETS:
            t = per.setdefault(TG.target_of(c["job"], TARGETS), {"chats": 0, "reward": 0.0}); t["chats"] += 1; t["reward"] += r
    n = max(got["chats"], 1)
    out = {**got, "right_share": got["right"] / n, "reward": got["reward"] / n}
    if TARGETS: out["targets"] = {k: {"chats": v["chats"], "reward": v["reward"] / v["chats"]} for k, v in per.items()}
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--lessons", required=True); ap.add_argument("--save", default=None)
    ap.add_argument("--group", type=int, default=6); ap.add_argument("--chats", type=int, default=4); ap.add_argument("--steps", type=int, default=200)
    ap.add_argument("--hours", type=float, default=1.5); ap.add_argument("--lr", type=float, default=5e-6); ap.add_argument("--kl", type=float, default=0.02)
    ap.add_argument("--max-new", type=int, default=384); ap.add_argument("--temp", type=float, default=1.0); ap.add_argument("--think", action="store_true")
    ap.add_argument("--max-len", type=int, default=8192); ap.add_argument("--r", type=int, default=16); ap.add_argument("--experts", default="frozen", choices=["frozen", "lora"])
    ap.add_argument("--eval-chats", type=int, default=150); ap.add_argument("--report", default=None); ap.add_argument("--seed", type=int, default=1); ap.add_argument("--device", default="cuda")
    ap.add_argument("--targets", default=None, help="several targets (targets.py): chats sampled by weight, graded per target")
    ap.add_argument("--checks", default=None, help="written-answer checks (make-checks.mjs) learned from too, job 'checks'")
    ap.add_argument("--search", default=None, help="look-it-up cases (search-pairs.mjs search-cases.jsonl), job 'search'; Bob's tools from --search-tools")
    ap.add_argument("--search-tools", default=None, help="a toolsets.json whose first set gives the system prompt and tools for --search")
    a = ap.parse_args()
    global TARGETS; TARGETS = TG.parse(a.targets)
    random.seed(a.seed); torch.manual_seed(a.seed); dev = a.device
    tok = AutoTokenizer.from_pretrained(a.model)
    train, test = chats(tok, a.lessons, a.max_len, a.think)
    if a.checks: extra = check_chats(tok, a.checks, a.think); train += extra; print(f"grpo: + {len(extra)} written-answer checks", flush=True)
    if a.search: extra = search_chats(tok, a.search, a.think, a.search_tools); train += extra; print(f"grpo: + {len(extra)} look-it-up cases", flush=True)
    print(f"grpo: {len(train)} chats to learn from, {len(test)} held out ({sum(1 for c in train if not c['want'])} want no tool)", flush=True)
    if not train: raise SystemExit("no chats to learn from")
    model = Qwen3_5MoeForConditionalGeneration.from_pretrained(a.model, dtype=torch.bfloat16, device_map=dev); model.config.use_cache = False
    stops = {i for i in (tok.convert_tokens_to_ids("<|im_end|>"), tok.eos_token_id) if isinstance(i, int) and i >= 0}
    report = {"model": a.model, "args": vars(a), "before": evaluate(model, tok, test, a, dev, stops, a.eval_chats)}
    print("held-out before:", report["before"], flush=True)
    params = L.attach(model, r=a.r, experts=a.experts, r_experts=8)
    ref_state = L.trainable_state(model)  # the reference = Bob as he came in (LoRA at zero, router as it was)
    opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.0, betas=(0.9, 0.99))
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False}); model.enable_input_require_grads()
    deadline = time.time() + a.hours * 3600; t0 = time.time(); step = 0; learned = 0; log = []
    order = TG.weighted_order([{"id": c["id"]} for c in train], {c["id"]: c["job"] for c in train}, TARGETS, random) if TARGETS else list(range(len(train)))
    if not TARGETS: random.shuffle(order)
    if not order: order = list(range(len(train)))
    ptr = 0
    while step < a.steps and time.time() < deadline:
        batch = []
        for _ in range(a.chats):
            c = train[order[ptr % len(order)]]; ptr += 1
            outs = write(model, c["ids"], a.group, a.max_new, a.temp, dev, stops)
            rew = [r for r, _ in grade(tok, outs, c)]
            mu = sum(rew) / len(rew); sd = math.sqrt(sum((x - mu) ** 2 for x in rew) / len(rew))
            if sd < 1e-6: continue  # every answer scored the same: nothing to learn from this chat
            batch += [(c, o, (x - mu) / (sd + 1e-4)) for o, x in zip(outs, rew) if o]
            log.append(mu)
        if not batch: step += 1; continue  # every chat's answers scored alike: a step spent, nothing learned
        ref = []
        if a.kl > 0:  # the reference's word odds: swap Bob's starting weights in, score, swap back
            now = L.trainable_state(model); L.load_trainable(model, ref_state)
            with torch.no_grad(): ref = [answer_logp(model, c["ids"], o, dev) for c, o, _ in batch]
            L.load_trainable(model, now)
        model.train(); tot = 0.0
        for j, (c, o, adv) in enumerate(batch):
            lp = answer_logp(model, c["ids"], o, dev)
            loss = -(adv * lp).mean()  # one step per batch, so the policy ratio is 1 and GRPO is REINFORCE with the group's mean as baseline
            if a.kl > 0:
                d = ref[j] - lp; loss = loss + a.kl * (torch.exp(d) - d - 1).mean()  # k3: a never-negative estimate of KL to the reference
            (loss / len(batch)).backward(); tot += loss.item()
        torch.nn.utils.clip_grad_norm_(params, 1.0); opt.step(); opt.zero_grad(set_to_none=True); step += 1; learned += 1
        if step % 5 == 0 or step == 1:
            print(f"step {step}/{a.steps} mean reward {sum(log[-20:]) / len(log[-20:]):.3f} loss {tot / len(batch):.3f} {(time.time() - t0) / 60:.0f} min", flush=True)
    report["steps"] = step; report["learned_steps"] = learned; report["minutes"] = (time.time() - t0) / 60; report["reward_trend"] = log
    report["after"] = evaluate(model, tok, test, a, dev, stops, a.eval_chats)
    report["no_target_worse"] = TG.no_target_worse(report["before"].get("targets", {}), report["after"].get("targets", {}), "reward", slack=0.02)
    print("held-out after:", report["after"], flush=True)
    if a.save:
        os.makedirs(a.save, exist_ok=True)
        torch.save({"params": L.trainable_state(model), "step": step, "r": a.r, "experts": a.experts, "kind": "grpo"}, os.path.join(a.save, "adapter.pt"))
        L.merge_all(model); model.save_pretrained(a.save, safe_serialization=True, max_shard_size="4GB"); tok.save_pretrained(a.save)
        import shutil
        for fn in ("bob-keep.json", "preprocessor_config.json", "chat_template.jinja", "generation_config.json"):
            src = os.path.join(a.model, fn)
            if os.path.exists(src) and not os.path.exists(os.path.join(a.save, fn)): shutil.copy(src, os.path.join(a.save, fn))
    rp = a.report or os.path.join(a.save or ".", "grpo-report.json")
    json.dump(report, open(rp, "w"), indent=1)

if __name__ == "__main__":
    main()
