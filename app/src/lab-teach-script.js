// 1.5.16x Teach it here: the trainer the Trainer pack runs (thinking-paths.md sec 15.3). Bob ships inside an archive
// Python can't read, so this text is written into the Trainer pack's folder before each run (teach.py).
// It teaches an adapter (LoRA) on the brain's full weights held in 4-bit (QLoRA; on a Mac in 16-bit), from a lesson
// set in JSONL (Bob's own {"messages": [...]} lessons, or {"conversations"}, {"prompt","completion"},
// {"instruction","output"}). Only the last answer of each lesson is learned from; the question is read, not learned.
// It prints "progress <done> <total>", "loss <n>", "skipped <n>" and "done <n>" for the Lab to show.
// 1.5.188 for the Best answers page: --lessons is optional, --pairs <jsonl> ({"messages", "chosen", "rejected"}) adds
// a better/worse pairs pass (DPO: lean toward the better answer, measured against the brain as it was before the pass),
// and --targets <json> ({"targets": [{kind: expert|head|attn|ffn, layer, index}]}, FNRI's shape) puts the adapter only
// on those parts; everything else stays frozen. It prints "targets <modules> <fell back>" and "pairs <n>".
export const TEACH_PY = String.raw`
import argparse, json, math, os, random, sys, time

def lessons(path, limit):
    out = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                j = json.loads(line)
            except Exception:
                continue
            msgs = j.get('messages') or j.get('conversations')
            if msgs and isinstance(msgs, list):
                norm = []
                for m in msgs:
                    role = m.get('role') or {'human': 'user', 'gpt': 'assistant', 'system': 'system'}.get(m.get('from'), m.get('from'))
                    content = m.get('content') if 'content' in m else m.get('value', '')
                    x = dict(m); x['role'] = role; x['content'] = content
                    x.pop('from', None); x.pop('value', None)
                    norm.append(x)
                msgs = norm
            elif 'prompt' in j and 'completion' in j:
                msgs = [{'role': 'user', 'content': str(j['prompt'])}, {'role': 'assistant', 'content': str(j['completion'])}]
            elif 'instruction' in j and 'output' in j:
                q = str(j['instruction']) + (('\n\n' + str(j['input'])) if j.get('input') else '')
                msgs = [{'role': 'user', 'content': q}, {'role': 'assistant', 'content': str(j['output'])}]
            else:
                continue
            if not any(m.get('role') == 'assistant' for m in msgs):
                continue
            out.append({'messages': msgs, 'tools': j.get('tools'), 'think': bool(j.get('think'))})
            if limit and len(out) >= limit:
                break
    return out

def template(tok, msgs, tools, think, gen):
    kw = dict(tokenize=False, add_generation_prompt=gen)
    if tools:
        kw['tools'] = tools
    try:
        return tok.apply_chat_template(msgs, enable_thinking=think, **kw)
    except TypeError:
        return tok.apply_chat_template(msgs, **kw)

def is_linear(m):
    import torch
    return isinstance(m, torch.nn.Linear) or m.__class__.__name__ in ('Linear4bit', 'Linear8bitLt')

ATTN = ('self_attn', 'attention', 'attn', 'linear_attn')
OUT = ('o_proj', 'out_proj', 'dense')

def target_modules(model, path):
    import re
    with open(path, encoding='utf-8') as f:
        want = json.load(f).get('targets') or []
    names = [(n, m) for n, m in model.named_modules() if is_linear(m) and 'lm_head' not in n]
    by_layer = {}
    for n, _ in names:
        g = re.search(r'layers\.(\d+)\.(.+)$', n)
        if g:
            by_layer.setdefault(int(g.group(1)), []).append((n, g.group(2)))
    picked, fell = set(), 0
    for t in want:
        kind, layer, index = str(t.get('kind')), int(t.get('layer', -1)), int(t.get('index', 0) or 0)
        mods = by_layer.get(layer, [])
        attn = [n for n, rest in mods if any(a in rest for a in ATTN)]
        mlp = [n for n, rest in mods if 'mlp' in rest or 'experts' in rest or 'feed_forward' in rest]
        if kind == 'expert':
            hit = [n for n, rest in mods if re.search(r'experts\.%d\.' % index, rest)]
            if not hit:
                fell += 1
                hit = mlp
        elif kind == 'head':
            hit = [n for n in attn if n.rsplit('.', 1)[-1] in OUT] or attn
            fell += 1
        elif kind == 'attn':
            hit = attn
        else:
            hit = mlp
        picked.update(hit)
    print('targets %d %d' % (len(picked), fell), flush=True)
    if not picked:
        print('None of the parts picked are ones this brain\'s weights have.', file=sys.stderr)
        sys.exit(3)
    return sorted(picked)

def pair_rows(path, tok, max_len):
    out, skipped = [], 0
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                j = json.loads(line)
                msgs = j['messages']
                prompt = template(tok, msgs, None, False, True)
                p_ids = tok(prompt, add_special_tokens=False)['input_ids']
                both = []
                for side in ('chosen', 'rejected'):
                    full = template(tok, msgs + [{'role': 'assistant', 'content': str(j[side])}], None, False, False)
                    f_ids = tok(full, add_special_tokens=False)['input_ids']
                    if len(f_ids) <= len(p_ids) or len(f_ids) > max_len or f_ids[:len(p_ids)] != p_ids:
                        raise ValueError('format')
                    both.append(f_ids)
                out.append((len(p_ids), both[0], both[1]))
            except Exception:
                skipped += 1
    return out, skipped

def answer_logp(model, ids, start, device):
    import torch
    x = torch.tensor([ids], device=device)
    logits = model(input_ids=x).logits[0, :-1].float()
    lp = torch.log_softmax(logits, dim=-1)
    tgt = x[0, 1:]
    got = lp.gather(1, tgt.unsqueeze(1)).squeeze(1)
    return got[start - 1:].sum()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True)
    ap.add_argument('--lessons', default='')
    ap.add_argument('--pairs', default='')
    ap.add_argument('--targets', default='')
    ap.add_argument('--beta', type=float, default=0.1)
    ap.add_argument('--pairs-lr', type=float, default=5e-5)
    ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=float, default=1.0)
    ap.add_argument('--rank', type=int, default=16)
    ap.add_argument('--lr', type=float, default=2e-4)
    ap.add_argument('--max-len', type=int, default=2048)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--accum', type=int, default=8)
    a = ap.parse_args()

    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import LoraConfig, get_peft_model

    cuda = torch.cuda.is_available()
    mps = (not cuda) and getattr(torch.backends, 'mps', None) is not None and torch.backends.mps.is_available()
    tok = AutoTokenizer.from_pretrained(a.base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    rows = lessons(a.lessons, a.limit) if a.lessons else []
    examples, skipped = [], 0
    for r in rows:
        msgs = r['messages']
        last = max(i for i, m in enumerate(msgs) if m.get('role') == 'assistant')
        try:
            prompt = template(tok, msgs[:last], r['tools'], r['think'], True)
            full = template(tok, msgs[:last + 1], r['tools'], r['think'], False)
        except Exception:
            skipped += 1
            continue
        p_ids = tok(prompt, add_special_tokens=False)['input_ids']
        f_ids = tok(full, add_special_tokens=False)['input_ids']
        if len(f_ids) <= len(p_ids) or len(f_ids) > a.max_len or f_ids[:len(p_ids)] != p_ids:
            skipped += 1
            continue
        examples.append((f_ids, [-100] * len(p_ids) + f_ids[len(p_ids):]))
    pairs, pskipped = pair_rows(a.pairs, tok, a.max_len) if a.pairs else ([], 0)
    print('skipped %d' % (skipped + pskipped), flush=True)
    if not examples and not pairs:
        print('No lesson could be read with this brain\'s chat format.', file=sys.stderr)
        sys.exit(2)

    if cuda:
        from transformers import BitsAndBytesConfig
        from peft import prepare_model_for_kbit_training
        q = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.bfloat16)
        model = AutoModelForCausalLM.from_pretrained(a.base, quantization_config=q, device_map={'': 0}, dtype=torch.bfloat16)
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
        device = 'cuda'
    else:
        model = AutoModelForCausalLM.from_pretrained(a.base, dtype=torch.float16 if mps else torch.float32)
        device = 'mps' if mps else 'cpu'
        model.to(device)
        model.gradient_checkpointing_enable()
    model.config.use_cache = False
    targets = target_modules(model, a.targets) if a.targets else 'all-linear'
    lc = LoraConfig(r=a.rank, lora_alpha=a.rank * 2, lora_dropout=0.05, target_modules=targets, task_type='CAUSAL_LM')
    model = get_peft_model(model, lc)

    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.0)
    total = int(math.ceil(len(examples) * a.epochs))
    ptotal = int(math.ceil(len(pairs) * a.epochs))
    grand = max(1, total + 2 * ptotal)
    steps = max(1, total // a.accum)
    warm = max(1, steps // 20)
    order = []
    random.seed(1)
    while examples and len(order) < total:
        e = list(range(len(examples)))
        random.shuffle(e)
        order += e
    order = order[:total]
    model.train()
    step, run, t0 = 0, 0.0, time.time()
    for i, k in enumerate(order):
        ids, labels = examples[k]
        x = torch.tensor([ids], device=device)
        y = torch.tensor([labels], device=device)
        loss = model(input_ids=x, labels=y).loss / a.accum
        loss.backward()
        run += loss.item()
        if (i + 1) % a.accum == 0 or i + 1 == total:
            lr = a.lr * min(1.0, (step + 1) / warm) * (0.1 + 0.9 * max(0.0, 1 - step / steps))
            for g in opt.param_groups:
                g['lr'] = lr
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            opt.step()
            opt.zero_grad(set_to_none=True)
            step += 1
            print('loss %.4f' % run, flush=True)
            run = 0.0
        print('progress %d %d' % (i + 1, grand), flush=True)

    if pairs:
        # The pass is measured against the brain as it is now (after the best-answers pass, if there was one):
        # its odds of each answer are read once, then the adapter leans toward the better answer of each pair.
        model.eval()
        ref = []
        with torch.no_grad():
            for j, (start, c, r) in enumerate(pairs):
                ref.append((answer_logp(model, c, start, device).item(), answer_logp(model, r, start, device).item()))
                if j % 8 == 0:
                    print('progress %d %d' % (total + j + 1, grand), flush=True)
        model.train()
        popt = torch.optim.AdamW(params, lr=a.pairs_lr, weight_decay=0.0)
        porder = []
        while len(porder) < ptotal:
            e = list(range(len(pairs)))
            random.shuffle(e)
            porder += e
        porder = porder[:ptotal]
        run, won = 0.0, 0
        for i, k in enumerate(porder):
            start, c, r = pairs[k]
            pc, pr = answer_logp(model, c, start, device), answer_logp(model, r, start, device)
            margin = a.beta * ((pc - ref[k][0]) - (pr - ref[k][1]))
            loss = -torch.nn.functional.logsigmoid(margin) / a.accum
            loss.backward()
            run += loss.item()
            won += 1 if margin.item() > 0 else 0
            if (i + 1) % a.accum == 0 or i + 1 == ptotal:
                torch.nn.utils.clip_grad_norm_(params, 1.0)
                popt.step()
                popt.zero_grad(set_to_none=True)
                print('loss %.4f' % run, flush=True)
                run = 0.0
            print('progress %d %d' % (total + len(pairs) + i + 1, grand), flush=True)
        print('pairs %d %d' % (len(pairs), won), flush=True)
    model.save_pretrained(a.out)
    tok.save_pretrained(a.out)
    print('done %d' % (len(examples) + len(pairs)), flush=True)

if __name__ == '__main__':
    main()
`;

// Downloads a Hugging Face brain's weights (only the files a trainer needs) with the huggingface_hub the pack
// installs. The token, when there is one, comes from the environment (HF_TOKEN), never from Bob's files.
export const FETCH_PY = String.raw`
import sys
from huggingface_hub import snapshot_download
repo, rev, out = sys.argv[1], (sys.argv[2] or None), sys.argv[3]
snapshot_download(repo_id=repo, revision=rev, local_dir=out, allow_patterns=['*.json', '*.safetensors', '*.model', '*.txt', '*.jinja', 'tokenizer*'])
print('done', flush=True)
`;
