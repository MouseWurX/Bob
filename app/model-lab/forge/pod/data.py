"""Lessons -> token ids with an "answer" mask (Bob's own words, including tool calls).

Reads the lab's out/lessons/lessons.jsonl + toolsets.json, renders each lesson with the model's own chat
template (tools and thinking included), and marks the tokens between every "<|im_start|>assistant\n"
and its "<|im_end|>" (plus that end token) as answer tokens. GPT-OSS (harmony, 14 Nov 2026): the lesson is put in
harmony's shape first (to_harmony) and the answer is everything after "<|start|>assistant" to its <|end|>/<|call|>/<|return|>. Picture lessons are used as text only.
A fixed 5% of lessons (by id hash) is held out for testing and never trained on.
"""
import hashlib, json, os
import torch

HOLDOUT = 0.05
SKIPS = {}  # why lessons were skipped (template errors), reported once

def is_holdout(idea_id):
    return int(hashlib.md5(str(idea_id).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF < HOLDOUT

def load_lessons(d):
    sets = json.load(open(os.path.join(d, "toolsets.json")))
    out = []
    with open(os.path.join(d, "lessons.jsonl"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try: out.append(json.loads(line))
            except json.JSONDecodeError: pass
    return out, sets

def to_chat(lesson, sets):
    """OpenAI-style messages in the shape the Qwen template expects."""
    msgs, tools, system = [], None, None
    for m in lesson["messages"]:
        if m["role"] == "assistant":
            if system is None and m.get("set") in sets:
                system, tools = sets[m["set"]]["system"], sets[m["set"]]["tools"]
            a = {"role": "assistant", "content": m.get("content") or ""}
            if m.get("reasoning"): a["reasoning_content"] = m["reasoning"]
            if m.get("tool_calls"):
                calls = []
                for c in m["tool_calls"]:
                    name = c["function"]["name"]; raw = c["function"].get("arguments") or "{}"
                    try: args = json.loads(raw) if isinstance(raw, str) else raw
                    except json.JSONDecodeError: args = {"input": raw}
                    if not isinstance(args, dict): args = {"input": args}
                    # Qwen's template loops over tool_call.arguments|items, so arguments must be a mapping; name at both levels for either template style
                    calls.append({"type": "function", "name": name, "arguments": args, "function": {"name": name, "arguments": args}})
                a["tool_calls"] = calls
            msgs.append(a)
        elif m["role"] == "tool":
            msgs.append({"role": "tool", "content": str(m.get("content") or "")})
        else:
            msgs.append({"role": "user", "content": m.get("content") or ""})
    if system: msgs.insert(0, {"role": "system", "content": system})
    return msgs, tools

def is_harmony(tok):
    """GPT-OSS's harmony chat format (<|start|>role<|channel|>...<|message|>...<|end|>) instead of Qwen's <|im_start|>."""
    v = tok.get_vocab()
    return "<|im_start|>" not in v and "<|start|>" in v and "<|channel|>" in v

def to_harmony(msgs):
    """Qwen-shaped messages -> what the GPT-OSS template takes. Harmony has one tool call per assistant message and
    the tool's answer right after it (the template names each answer after the last call), so parallel calls become
    call, answer, call, answer. Thinking goes in "thinking"; a tool-call turn cannot hold words and thinking both, so
    its words join the thinking (on GPT-OSS they would be commentary before the call anyway)."""
    out, i = [], 0
    while i < len(msgs):
        m = msgs[i]
        if m["role"] != "assistant":
            out.append({k: v for k, v in m.items() if k in ("role", "content")}); i += 1; continue
        think = m.get("reasoning_content") or ""; words = m.get("content") or ""
        calls = m.get("tool_calls") or []
        if not calls:
            a = {"role": "assistant", "content": words}
            if think: a["thinking"] = think
            out.append(a); i += 1; continue
        answers = []; j = i + 1
        while j < len(msgs) and msgs[j]["role"] == "tool": answers.append(msgs[j]); j += 1
        pre = "\n\n".join(x for x in (think, words) if x)
        for n, c in enumerate(calls):
            a = {"role": "assistant", "tool_calls": [{"type": "function", "function": {"name": c["name"], "arguments": c["arguments"]}}]}
            if n == 0 and pre: a["thinking"] = pre
            out.append(a)
            if n < len(answers): out.append({"role": "tool", "content": answers[n].get("content") or ""})
        for extra in answers[len(calls):]: out.append({"role": "tool", "content": extra.get("content") or ""})
        i = j
    return out

def harmony_mask(tok, ids):
    """Answer tokens in harmony: everything the model writes after "<|start|>assistant" up to and including the
    token that ends it (<|end|>, <|call|> or <|return|>). Tool answers (<|start|>functions.x ...) are not the model's."""
    start = tok.convert_tokens_to_ids("<|start|>")
    ends = {tok.convert_tokens_to_ids(t) for t in ("<|end|>", "<|call|>", "<|return|>")}
    asst = tok.encode("assistant", add_special_tokens=False)
    mask = [0] * len(ids); i = 0
    while i < len(ids):
        if ids[i] == start and ids[i + 1: i + 1 + len(asst)] == asst:
            j = i + 1 + len(asst); k = j
            while k < len(ids) and ids[k] not in ends: k += 1
            for p in range(j, min(k + 1, len(ids))): mask[p] = 1
            i = k + 1
        else:
            i += 1
    return mask

COT_STOCK = "and not future_final_message.found"
COT_KEEP = "and ((keep_cot_from is defined and loop.index0 >= keep_cot_from) or not future_final_message.found)"

def harmony_template(tok):
    """GPT-OSS's template drops the thinking before a tool call once a final answer follows (right for old turns at
    inference). In a lesson the last turn's tool-call thinking is the brain's own words, so it is kept from the last
    user message on. If the template does not have that line, it is used as it is."""
    t = tok.chat_template if isinstance(tok.chat_template, str) else None
    return t.replace(COT_STOCK, COT_KEEP) if t and COT_STOCK in t else t

def render(tok, lesson, sets, max_len):
    msgs, tools = to_chat(lesson, sets)
    if not any(m["role"] == "assistant" for m in msgs): return None
    harmony = is_harmony(tok)
    try:
        if harmony:  # no thinking in the lesson: ask for low effort, so the brain is not taught to skip thinking at medium
            think = any(m.get("reasoning_content") for m in msgs if m["role"] == "assistant") or bool(lesson.get("think"))
            hm = to_harmony(msgs); loop = hm[1:] if hm and hm[0]["role"] in ("system", "developer") else hm
            last_user = max([n for n, m in enumerate(loop) if m["role"] == "user"] or [0])
            ids = tok.apply_chat_template(hm, tools=tools, tokenize=True, add_generation_prompt=False, chat_template=harmony_template(tok),
                                          reasoning_effort="medium" if think else "low", keep_cot_from=last_user)
        else:
            ids = tok.apply_chat_template(msgs, tools=tools, tokenize=True, add_generation_prompt=False)
    except Exception as e:
        SKIPS.setdefault(str(e)[:120], 0); SKIPS[str(e)[:120]] += 1
        return None
    if hasattr(ids, "input_ids"): ids = ids["input_ids"]
    ids = list(ids)[:max_len]
    if harmony:
        mask = harmony_mask(tok, ids)
        if not any(mask): return None
        return {"id": lesson["idea"], "ids": ids, "mask": mask, "think": bool(lesson.get("think"))}
    start = tok.convert_tokens_to_ids("<|im_start|>"); end = tok.convert_tokens_to_ids("<|im_end|>")
    asst = tok.encode("assistant", add_special_tokens=False)
    # An answer with no thinking gets the template's empty think box. With thinking off, Qwen puts that empty box in
    # the prompt itself, so it is never the brain's own words: leave it out of the answer, or the brain learns to skip
    # thinking even when thinking is on. Answers with thinking keep their whole think box (thinking on).
    empty = tok.encode("<think>\n\n</think>\n\n", add_special_tokens=False)
    mask = [0] * len(ids)
    i = 0
    while i < len(ids):
        if ids[i] == start and ids[i + 1: i + 1 + len(asst)] == asst:
            j = i + 1 + len(asst)
            # skip the newline after "assistant"
            j += 1
            k = j
            while k < len(ids) and ids[k] != end: k += 1
            for p in range(j, min(k + 1, len(ids))): mask[p] = 1
            if empty and ids[j: j + len(empty)] == empty:
                for p in range(j, min(j + len(empty), len(ids))): mask[p] = 0
            i = k + 1
        else:
            i += 1
    if not any(mask): return None
    return {"id": lesson["idea"], "ids": ids, "mask": mask, "think": bool(lesson.get("think"))}

def build(tok, lessons_dir, max_len, cache=None):
    if cache and os.path.exists(cache):
        return torch.load(cache)
    lessons, sets = load_lessons(lessons_dir)
    train, test, skipped = [], [], 0
    for l in lessons:
        r = render(tok, l, sets, max_len)
        if r is None: skipped += 1; continue
        (test if is_holdout(l["idea"]) else train).append(r)
    data = {"train": train, "test": test, "skipped": skipped}
    if SKIPS: print("skip reasons:", json.dumps(SKIPS)[:600])
    print(f"lessons: {len(train)} train, {len(test)} held out, {skipped} skipped; "
          f"{sum(len(r['ids']) for r in train) / 1e6:.1f}M tokens, {sum(sum(r['mask']) for r in train) / 1e6:.2f}M answer tokens")
    if cache: torch.save(data, cache)
    return data

# ---- general text, so the Bobs keep their general knowledge (the owner, 5 Nov) ----
# Public sets fetched by run.sh into <general_dir>: FineWeb-Edu parquet files (column "text") and
# an open chat set (column "messages", OpenAI shape). Half the token budget each. Every token counts as an
# answer token for plain text (the teacher scores all of it); chats are masked like lessons.
def build_general(tok, general_dir, max_len, budget_tokens, chat_share=0.3):
    import glob
    rows = []
    if not general_dir or not os.path.isdir(general_dir) or budget_tokens <= 0: return rows
    try: import pyarrow.parquet as pq
    except ImportError: print("pyarrow missing: no general text"); return rows
    text_files = sorted(glob.glob(os.path.join(general_dir, "**", "*.parquet"), recursive=True))
    half_chat = int(budget_tokens * chat_share); half = budget_tokens - half_chat; got_text = got_chat = 0; n = 0
    for f in text_files:
        pf = pq.ParquetFile(f); cols = pf.schema_arrow.names
        kind = "chat" if "messages" in cols else ("text" if "text" in cols else None)
        if not kind: continue
        for batch in pf.iter_batches(batch_size=256, columns=[kind if kind == "text" else "messages"]):
            for item in batch.to_pylist():
                if kind == "text":
                    if got_text >= half: break
                    ids = tok.encode(item["text"], add_special_tokens=False)[: min(max_len, 2048)]
                    if len(ids) < 64: continue
                    rows.append({"id": f"g:text:{n}", "ids": ids, "mask": [1] * len(ids), "think": False, "general": True}); got_text += len(ids)
                else:
                    if got_chat >= half_chat: break
                    msgs = item["messages"]
                    if not isinstance(msgs, list) or not any(m.get("role") == "assistant" for m in msgs): continue
                    msgs = [{"role": m["role"], "content": m.get("content") or ""} for m in msgs if m.get("role") in ("system", "user", "assistant")]
                    r = render(tok, {"idea": f"g:chat:{n}", "messages": msgs}, {}, max_len)
                    if r is None: continue
                    r["general"] = True; rows.append(r); got_chat += len(r["ids"])
                n += 1
            if (kind == "text" and got_text >= half) or (kind == "chat" and got_chat >= half_chat): break
    print(f"general text: {len(rows)} pieces, {got_text / 1e6:.1f}M tokens of text, {got_chat / 1e6:.1f}M tokens of chat")
    return rows

def build_all(tok, lessons_dir, max_len, cache, general_dir=None, general_tokens=0):
    """Lessons plus general text, in one cache. The general rows get a 5% hold-out too."""
    if cache and os.path.exists(cache): return torch.load(cache)
    data = build(tok, lessons_dir, max_len, None)
    for r in build_general(tok, general_dir, max_len, general_tokens):
        (data["test"] if is_holdout(r["id"]) else data["train"]).append(r)
    if cache: torch.save(data, cache)
    return data
