#!/usr/bin/env python3
"""Several training targets in one run (the owner, 13 Nov: "also multiple training targets").

A target is a named group of lesson jobs with its own share of the run, e.g.
  {"facts": {"jobs": ["straight-facts", "knowledge"], "weight": 2},
   "tools": {"jobs": ["precise", "missed", "twins", "restraint"], "weight": 1},
   "refusals": {"jobs": ["refusals"], "weight": 0.5}}
weight = how many times each of its lessons comes up per pass (0.5 = half of them, 2 = twice). Lessons in no target
count as "other", weight 1 (or give "other": {"weight": ...}). Every report is split by target as well as in total,
so a gain on one target cannot hide a loss on another. No torch here: the Lab's test runs it on plain Python.
"""
import json, math, os

def parse(spec):
    """JSON text, a file path or a dict -> {name: {"jobs": set, "weight": float}}; None/"" -> {}."""
    if not spec: return {}
    if isinstance(spec, str):
        spec = json.load(open(spec)) if os.path.exists(spec) else json.loads(spec)
    out = {}
    for name, t in spec.items():
        w = float(t.get("weight", 1.0))
        if w < 0: raise ValueError(f"target {name}: weight must be 0 or more")
        out[name] = {"jobs": set(t.get("jobs", [])), "weight": w}
    seen = {}
    for name, t in out.items():
        for j in t["jobs"]:
            if j in seen: raise ValueError(f"job {j} is in two targets ({seen[j]} and {name}): each job belongs to one")
            seen[j] = name
    return out

def job_map(lessons_dir):
    """idea id -> job, from the lessons file (older token caches do not carry the job)."""
    m = {}
    p = os.path.join(lessons_dir, "lessons.jsonl")
    if not os.path.exists(p): return m
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try: l = json.loads(line)
            except json.JSONDecodeError: continue
            if "idea" in l: m[str(l["idea"])] = l.get("job", "")
    return m

def target_of(job, targets):
    for name, t in targets.items():
        if job in t["jobs"]: return name
    return "other"

def weight_of(name, targets):
    return targets[name]["weight"] if name in targets else 1.0

def weighted_order(rows, jobs, targets, rng):
    """Indices for one pass: each row repeated by its target's weight (fractions by chance), shuffled."""
    order = []
    for i, r in enumerate(rows):
        if r.get("general"): order.append(i); continue
        w = weight_of(target_of(jobs.get(str(r["id"]), ""), targets), targets)
        n = int(math.floor(w)) + (1 if rng.random() < w - math.floor(w) else 0)
        order += [i] * n
    rng.shuffle(order)
    return order

def split(rows, jobs, targets):
    """Held-out rows by target (only targets that have any)."""
    out = {}
    for r in rows:
        if r.get("general"): continue
        out.setdefault(target_of(jobs.get(str(r["id"]), ""), targets), []).append(r)
    return out

def no_target_worse(before, after, key, higher_better=True, slack=0.0):
    """True when no target's `key` got worse by more than `slack` (the guard for keeping a pass)."""
    for name, b in before.items():
        a = after.get(name)
        if not a or b.get(key) is None or a.get(key) is None: continue
        if higher_better and a[key] < b[key] - slack: return False
        if not higher_better and a[key] > b[key] + slack: return False
    return True
