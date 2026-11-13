#!/usr/bin/env python3
"""On-policy distillation for the heal (GKD-style): the small Bob writes its own answer, the full teacher says
what it would have written at every one of those words, and the small Bob learns from that.

Today's heal copies the teacher's odds on the teacher's OWN text (off-policy): the small Bob never sees the spots
where its own words have already gone wrong. Here it does. Needs the teacher loaded beside the student
(heal.py --onpolicy-teacher <dir>), so it suits the smaller rungs: an H200 holds the 35B teacher (~70 GB) plus a
9-20 GB student. Used for a share of the heal's steps (--onpolicy-frac), so the run still learns from lessons too.
"""
import torch, torch.nn.functional as F

def prompt_of(r):
    """The lesson's words up to where Bob first speaks (the first answer word)."""
    j = next((i for i, m in enumerate(r["mask"]) if m == 1), None)
    return None if not j else r["ids"][:j]

@torch.no_grad()
def sample(model, prompt, max_new, temp, dev, stop_ids):
    """The student's own continuation. generate() with its cache; a plain loop if this model's cache will not work."""
    ids = torch.tensor(prompt, device=dev)[None]
    was = model.training; model.eval()
    try:
        out = model.generate(input_ids=ids, attention_mask=torch.ones_like(ids), do_sample=temp > 0, temperature=max(temp, 1e-5),
                             top_p=1.0, top_k=0, max_new_tokens=max_new, use_cache=True, eos_token_id=list(stop_ids), pad_token_id=list(stop_ids)[0])
        new = out[0, ids.shape[1]:].tolist()
    except Exception as e:  # the hand loop: slow (no cache) but always works
        print(f"generate() failed ({str(e)[:80]}), sampling by hand", flush=True)
        new = []
        for _ in range(max_new):
            logits = model(input_ids=torch.tensor(prompt + new, device=dev)[None], logits_to_keep=1, use_cache=False).logits[0, -1].float()
            nxt = int(torch.multinomial(torch.softmax(logits / temp, -1), 1)) if temp > 0 else int(logits.argmax())
            new.append(nxt)
            if nxt in stop_ids: break
    if was: model.train()
    cut = next((i + 1 for i, t in enumerate(new) if t in stop_ids), len(new))
    return new[:cut]

@torch.no_grad()
def teacher_top(teacher, ids, pos, K):
    """Teacher's top-K words and log-odds at each position in pos (pos predicts pos + 1)."""
    logits = teacher(input_ids=ids, logits_to_keep=pos, use_cache=False).logits[0].float()
    top = torch.log_softmax(logits, dim=-1).topk(K, dim=-1)
    return top.indices, top.values

def kd(student_logits, tid, tlp):
    """KL(teacher top-K || student), the same loss heal.py uses for lessons."""
    t = torch.softmax(tlp, dim=-1)
    s = torch.log_softmax(student_logits, dim=-1).gather(1, tid)
    return (t * (torch.log(t + 1e-9) - s)).sum(-1).mean()

def step_loss(model, teacher, r, dev, max_new=256, temp=1.0, K=32, stop_ids=()):
    """-> (loss, words learned) or None. The prompt is the lesson's own; the answer is the student's."""
    prompt = prompt_of(r)
    if not prompt: return None
    new = sample(model, prompt, max_new, temp, dev, set(stop_ids))
    if not new: return None
    ids = torch.tensor(prompt + new, device=dev)[None]
    pos = torch.arange(len(prompt) - 1, len(prompt) - 1 + len(new), device=dev)
    tid, tlp = teacher_top(teacher, ids, pos, K)
    logits = model(input_ids=ids, logits_to_keep=pos, use_cache=False).logits[0].float()
    return kd(logits, tid, tlp), len(new)
