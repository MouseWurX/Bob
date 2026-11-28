#!/usr/bin/env python3
"""Have the full-size brain write its own agent sessions, for healing a squeezed copy (heal_scales.py --sessions).

  agent_sessions.py --teacher <full-precision HF dir> --out sessions.jsonl [--n 1200 --agent-share 0.7 --eval-share 0.1]
                    [--max-new 768 --max-len 2048 --think-share 0.3 --batch 16 --seed 1 --prompts my-tasks.jsonl]
                    [--never <file> ...]

Why (27 Nov 2026, the owner: "healing on agent sessions is fine"): plain-text healing (wikitext) teaches the squeezed file
to match the full-size brain on encyclopedia text. Bob's real work is tool calls, code and short answers, so this writes
sessions of that kind, all by the brain itself, and heal_scales.py scores only the tokens the brain wrote.

Tasks, all public (downloaded on the pod with the `datasets` library):
  agent (about --agent-share of rows):
    - tool calls: NousResearch/hermes-function-calling-v1 (config func_calling_singleturn, Apache-2.0): the task's own
      tool list and request; the brain writes the call.
    - answer from a tool result: the same set's multi-turn config (func_calling): the task's request, call and tool
      result are read as context; the brain writes the answer that follows.
    - code: google-research-datasets/mbpp (CC-BY-4.0): the task text and its tests; the brain writes the code.
  general (the rest): databricks/databricks-dolly-15k (CC-BY-SA-3.0) instructions, with their context when they have one.
Only the brain's own replies are scored. The task text, tool lists, tool results and every earlier turn come from the
public sets and are read but never scored. No text here is written by Claude, and Bob's held-out jobs are never used:
files named held-out are refused, and --never files (Bob's never-taught list, copied from the PC) drop any task that
matches one of their questions (the same request, or a question of 6+ words found inside it).

Each row: {"source", "kind": "agent"|"general", "split": "train"|"eval", "think", "messages" (the context, for Bob's
never-gate), "reply" (the brain's words, for reading), "ids" (context + reply tokens), "start" (first reply token),
"hit_max" (the reply was cut at --max-new)}. About --eval-share of rows (picked by a hash of the task) are held apart for
heal_scales.py's before/after check. With --prompts, tasks come from that jsonl ({"source", "kind", "messages"}) instead
of the downloads (used for the cloud dry run).

The brain samples with its own generation settings (its generation_config), so the sessions are what it would really say.
Off by default and not in Turbo: a healed file is used only after drift and Bob's real jobs show a gain.
"""
import argparse, hashlib, json, os, random, re, sys, time

HELD = ('held-out', 'heldout', 'held_out')
norm = lambda t: re.sub(r'\s+', ' ', str(t).lower()).strip()


def never_questions(paths):
    qs = set()
    for p in paths:
        if any(w in os.path.basename(p).lower() for w in HELD) and not os.path.exists(p): sys.exit(f'--never {p} not found')
        files = [os.path.join(d, f) for d, _, fs in os.walk(p) for f in fs] if os.path.isdir(p) else [p]
        for f in files:
            for line in open(f, encoding='utf-8', errors='replace'):
                line = line.strip()
                if not line: continue
                try:
                    r = json.loads(line)
                except ValueError:
                    r = line
                if isinstance(r, dict):
                    msgs = r.get('messages') or []
                    texts = [m.get('content', '') for m in msgs if isinstance(m, dict) and m.get('role') == 'user'] or \
                            [r.get(k) for k in ('q', 'question', 'prompt', 'request', 'input') if r.get(k)]
                else:
                    texts = [r]
                for t in texts:
                    if isinstance(t, str) and t.strip(): qs.add(norm(t))
    return qs


def matches_never(task_text, qs):
    t = norm(task_text)
    return any(q == t or (len(q.split()) >= 6 and q in t) for q in qs)


def hermes_messages(conv):
    role = {'system': 'system', 'human': 'user', 'gpt': 'assistant', 'tool': 'tool'}
    out = []
    for c in conv:
        r = role.get(c.get('from'))
        if r: out.append({'role': r, 'content': c.get('value', '')})
    return out


def public_tasks(seed):
    """(source, kind, messages) from the public sets. Each message list ends where the brain should write."""
    from datasets import load_dataset
    rng = random.Random(seed); tasks = {'tool_call': [], 'tool_answer': [], 'code': [], 'general': []}
    for r in load_dataset('NousResearch/hermes-function-calling-v1', 'func_calling_singleturn', split='train'):
        m = hermes_messages(r['conversations'])
        k = next((i for i, x in enumerate(m) if x['role'] == 'user'), None)
        if k is not None: tasks['tool_call'].append(('hermes-singleturn', 'agent', m[:k + 1]))
    for r in load_dataset('NousResearch/hermes-function-calling-v1', 'func_calling', split='train'):
        m = hermes_messages(r['conversations'])
        k = next((i for i, x in enumerate(m) if x['role'] == 'tool'), None)
        if k is not None and k + 1 < len(m) and m[k + 1]['role'] == 'assistant':
            # the tool result goes to the brain as a user turn holding <tool_response>, the way Qwen's template does
            ctx = [x if x['role'] != 'tool' else {'role': 'user', 'content': f"<tool_response>\n{x['content']}\n</tool_response>"}
                   for x in m[:k + 1]]
            tasks['tool_answer'].append(('hermes-multiturn', 'agent', ctx))
    for split in ('train', 'validation', 'prompt'):
        for r in load_dataset('google-research-datasets/mbpp', 'full', split=split):
            tests = '\n'.join(r['test_list'])
            tasks['code'].append(('mbpp', 'agent', [{'role': 'user', 'content': f"{r['text']}\nYour code should pass these tests:\n{tests}"}]))
    for r in load_dataset('databricks/databricks-dolly-15k', split='train'):
        q = r['instruction'] + (f"\n\n{r['context']}" if r.get('context') else '')
        tasks['general'].append(('dolly', 'general', [{'role': 'user', 'content': q}]))
    for v in tasks.values(): rng.shuffle(v)
    return tasks


def local_tasks(path):
    tasks = {'agent': [], 'general': []}
    for line in open(path, encoding='utf-8'):
        if line.strip():
            r = json.loads(line); tasks['general' if r.get('kind') == 'general' else 'agent'].append((r.get('source', 'local'), r.get('kind', 'agent'), r['messages']))
    return tasks


def pick(tasks, n, agent_share, seed):
    """n tasks, about agent_share agent; agent split evenly over its kinds."""
    rng = random.Random(seed)
    n_agent = round(n * agent_share); agent_kinds = [k for k in tasks if k != 'general' and tasks[k]]
    out = []
    for i, k in enumerate(agent_kinds):
        want = n_agent // len(agent_kinds) + (1 if i < n_agent % len(agent_kinds) else 0)
        out += tasks[k][:want]
    out += tasks.get('general', [])[:n - len(out)]
    rng.shuffle(out)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--teacher', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--n', type=int, default=1200); ap.add_argument('--agent-share', type=float, default=0.7)
    ap.add_argument('--eval-share', type=float, default=0.1)
    ap.add_argument('--max-new', type=int, default=768); ap.add_argument('--max-len', type=int, default=2048)
    ap.add_argument('--think-share', type=float, default=0.3, help='share of code and general tasks written with thinking on '
                    '(tool steps always off, as in Bob)')
    ap.add_argument('--batch', type=int, default=16); ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--prompts', default='', help='jsonl of tasks instead of the public downloads')
    ap.add_argument('--never', nargs='*', default=[], help="Bob's never-taught files or folders: matching tasks are dropped")
    ap.add_argument('--device', default=''); ap.add_argument('--dtype', default='')
    a = ap.parse_args()
    for f in [a.out, a.prompts]:
        if f and any(w in os.path.basename(f).lower() for w in HELD):
            sys.exit('refusing: that file looks like a held-out set. Held-out jobs are never used to shape a brain.')

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    random.seed(a.seed); torch.manual_seed(a.seed)
    dev = torch.device(a.device or ('cuda' if torch.cuda.is_available() else 'cpu'))
    dtype = {'bf16': torch.bfloat16, 'fp32': torch.float32}[a.dtype or ('bf16' if dev.type == 'cuda' else 'fp32')]
    tok = AutoTokenizer.from_pretrained(a.teacher); tok.padding_side = 'left'
    if tok.pad_token_id is None: tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(a.teacher, dtype=dtype).to(dev).eval()
    gen = model.generation_config
    stop = set([gen.eos_token_id] if isinstance(gen.eos_token_id, int) else (gen.eos_token_id or [])) | {tok.eos_token_id}
    stop.discard(None)

    tasks = local_tasks(a.prompts) if a.prompts else public_tasks(a.seed)
    print('tasks found: ' + ', '.join(f'{k} {len(v)}' for k, v in tasks.items()), flush=True)
    qs = never_questions(a.never)
    dropped = 0
    if qs:
        for k in tasks:
            keep = [t for t in tasks[k] if not any(m['role'] == 'user' and matches_never(m['content'], qs) for m in t[2])]
            dropped += len(tasks[k]) - len(keep); tasks[k] = keep
        print(f'never-taught list: {len(qs)} questions, {dropped} tasks dropped', flush=True)
    chosen = pick(tasks, a.n, a.agent_share, a.seed)

    def render(msgs, think):
        kw = {'tokenize': False, 'add_generation_prompt': True}
        try:
            return tok.apply_chat_template(msgs, enable_thinking=think, **kw)
        except TypeError:
            return tok.apply_chat_template(msgs, **kw)

    rows, skipped, t0 = [], 0, time.time()
    jobs = []
    for src, kind, msgs in chosen:
        think = not src.startswith('hermes') and random.random() < a.think_share
        ids = tok(render(msgs, think), add_special_tokens=False)['input_ids']
        if len(ids) + 16 > a.max_len: skipped += 1; continue
        jobs.append((src, kind, msgs, think, ids))
    jobs.sort(key=lambda j: len(j[4]))   # similar lengths batch together: less padding
    with open(a.out, 'w', encoding='utf-8') as f:
        for b in range(0, len(jobs), a.batch):
            part = jobs[b:b + a.batch]; L = max(len(j[4]) for j in part)
            x = torch.tensor([[tok.pad_token_id] * (L - len(j[4])) + j[4] for j in part], device=dev)
            att = torch.tensor([[0] * (L - len(j[4])) + [1] * len(j[4]) for j in part], device=dev)
            new = min(a.max_new, a.max_len - L)
            with torch.no_grad():
                y = model.generate(input_ids=x, attention_mask=att, max_new_tokens=new, do_sample=True,
                                   generation_config=gen, pad_token_id=tok.pad_token_id)
            for j, (src, kind, msgs, think, ids) in enumerate(part):
                reply = []
                for t in y[j, L:].tolist():
                    reply.append(t)
                    if t in stop: break
                hit = reply[-1] not in stop if reply else True
                if not reply: skipped += 1; continue
                h = int(hashlib.sha1(json.dumps(msgs, sort_keys=True).encode()).hexdigest(), 16)
                split = 'eval' if (h % 1000) < a.eval_share * 1000 else 'train'
                r = {'source': src, 'kind': kind, 'split': split, 'think': think, 'messages': msgs,
                     'reply': tok.decode(reply, skip_special_tokens=False), 'ids': ids + reply, 'start': len(ids), 'hit_max': hit}
                rows.append({k: r[k] for k in ('source', 'kind', 'split', 'hit_max')} | {'n': len(reply)})
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
            f.flush()
            done = b + len(part)
            print(f'{done}/{len(jobs)} written ({time.time() - t0:.0f}s)', flush=True)

    by = {}
    for r in rows:
        k = f"{r['source']}/{r['split']}"; v = by.setdefault(k, [0, 0, 0]); v[0] += 1; v[1] += r['n']; v[2] += r['hit_max']
    calls = sum(1 for line in open(a.out, encoding='utf-8') if '"hermes-singleturn"' in line and '<tool_call>' in line)
    rep = {'when': time.strftime('%Y-%m-%d %H:%M'), 'teacher': a.teacher, 'rows': len(rows), 'skipped_too_long_or_empty': skipped,
           'never_dropped': dropped, 'agent_rows': sum(r['kind'] == 'agent' for r in rows),
           'tool_call_rows_with_a_call': calls, 'seconds': round(time.time() - t0),
           'by_source_split': {k: {'rows': v[0], 'reply_tokens': v[1], 'cut_at_max': v[2]} for k, v in sorted(by.items())}}
    json.dump(rep, open(os.path.splitext(a.out)[0] + '-report.json', 'w'), indent=1)
    print(json.dumps(rep, indent=1))


if __name__ == '__main__':
    main()
