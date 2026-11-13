#!/usr/bin/env python3
"""Grades one answer's tool calls the way tool-score does (model-lab/tool-judge.mjs), as a reward for GRPO.

Right = no tool when none was wanted, or the same tool names with every wanted argument matching (extra optional
arguments are fine, long free text only needs to overlap 60%). This file must stay in step with tool-judge.mjs:
the Lab's test checks both against the same cases.

Rewards (a plain chat that calls a tool is the mistake the owner minds most, so it costs the most):
  right                         1.0
  right tool, wrong arguments   0.3
  no tool when one was needed   0.0
  wrong tool                    0.0
  a tool called for nothing    -0.5
  a broken tool call           -0.5  (a <tool_call> block that cannot be read)
No torch here: the GRPO step imports it, and the Lab's test runs it on plain Python.
"""
import json, re

RIGHT, ARGS, MISSED, WRONG, NOTHING, BROKEN = 1.0, 0.3, 0.0, 0.0, -0.5, -0.5

def parse_args(a):
    if isinstance(a, dict): return a
    try:
        v = json.loads(a or "{}")
        return v if isinstance(v, dict) else {"input": v}
    except (TypeError, ValueError):
        return {"input": str(a)}

def _js_json(v):
    # JSON.stringify's spacing, so a non-string value compares the same in both judges
    return json.dumps(v, separators=(",", ":"), ensure_ascii=False)

def _norm_js(v):
    return re.sub(r"\s+", " ", v.strip().lower()) if isinstance(v, str) else _js_json(v)

def same_args(want, got):
    for k, v in want.items():
        if k not in got: return False
        a, b = _norm_js(v), _norm_js(got[k])
        if a == b: continue
        if len(a) > 40 and len(b) > 40:
            wa = set(re.split(r"\W+", a, flags=re.A)); hit = sum(1 for w in re.split(r"\W+", b, flags=re.A) if w in wa)
            if hit / len(wa) >= 0.6: continue
        return False
    return True

def judge_turn(want, got):
    """want/got: [{"name", "args"}]. The same rule as judgeTurn in tool-judge.mjs."""
    if not want: return not got
    names = lambda xs: ",".join(sorted({c["name"] for c in xs}))
    if names(want) != names(got): return False
    return all(any(g["name"] == w["name"] and same_args(w["args"], g["args"]) for g in got) for w in want)

TOOL_BLOCK = re.compile(r"<tool_call>(.*?)(?:</tool_call>|$)", re.S)
FUNC = re.compile(r"<function=([^>\s]+)>(.*?)(?:</function>|$)", re.S)
PARAM = re.compile(r"<parameter=([^>\s]+)>\n?(.*?)\n?</parameter>", re.S)

def _value(s):
    s = s.strip()
    try: return json.loads(s)
    except ValueError: return s

def parse_calls(text):
    """Tool calls in a written answer. Reads both Qwen styles: JSON inside <tool_call> (Qwen 2.5/3) and
    <function=name><parameter=key>value</parameter></function> (Qwen3.5/3.6, qwen3_coder). The thinking is left out.
    Returns (calls, broken): broken is True when a <tool_call> block could not be read."""
    text = text.split("</think>")[-1] if "</think>" in text else text
    calls, broken = [], False
    for block in TOOL_BLOCK.findall(text):
        f = FUNC.search(block)
        if f:
            calls.append({"name": f.group(1).strip(), "args": {k.strip(): _value(v) for k, v in PARAM.findall(f.group(2))}}); continue
        try:
            j = json.loads(block.strip())
            name = j.get("name") or (j.get("function") or {}).get("name")
            if not name: raise ValueError("no name")
            calls.append({"name": name, "args": parse_args(j.get("arguments", j.get("parameters", {})))})
        except (ValueError, AttributeError):
            broken = True
    return calls, broken

def reward(want, text):
    """want: [{"name", "args"}] (the full Qwen's recorded calls, [] for a plain answer); text: the written answer."""
    got, broken = parse_calls(text)
    if broken: return BROKEN, "broken tool call"
    if judge_turn(want, got): return RIGHT, "right"
    if not want: return NOTHING, "tool called for nothing"
    if not got: return MISSED, "no tool when one was needed"
    names = lambda xs: ",".join(sorted({c["name"] for c in xs}))
    if names(want) != names(got): return WRONG, "wrong tool"
    return ARGS, "wrong arguments"

def want_from_lesson_turn(msg):
    """The recorded assistant turn (OpenAI shape) -> want list."""
    return [{"name": c["function"]["name"], "args": parse_args(c["function"].get("arguments"))} for c in (msg.get("tool_calls") or [])]

if __name__ == "__main__":  # the Lab's test hands cases on stdin: [{"want": [...], "got": [...]}] -> [true/false, ...]
    import sys
    cases = json.load(sys.stdin)
    print(json.dumps([judge_turn(c["want"], c["got"]) for c in cases]))
