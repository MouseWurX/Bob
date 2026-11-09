// 1.5.16x Teach it here: the trainer the Trainer pack runs (thinking-paths.md sec 15.3). Bob ships inside an archive
// Python can't read, so this text is written into the Trainer pack's folder before each run (teach.py).
// It teaches an adapter (LoRA) on the brain's full weights held in 4-bit (QLoRA; on a Mac in 16-bit), from a lesson
// set in JSONL (Bob's own {"messages": [...]} lessons, or {"conversations"}, {"prompt","completion"},
// {"instruction","output"}). Only the last answer of each lesson is learned from; the question is read, not learned.
// It prints "progress <done> <total>", "loss <n>", "skipped <n>" and "done <n>" for the Lab to show.
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

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True)
    ap.add_argument('--lessons', required=True)
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

    rows = lessons(a.lessons, a.limit)
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
    print('skipped %d' % skipped, flush=True)
    if not examples:
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
    lc = LoraConfig(r=a.rank, lora_alpha=a.rank * 2, lora_dropout=0.05, target_modules='all-linear', task_type='CAUSAL_LM')
    model = get_peft_model(model, lc)

    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.0)
    total = max(1, int(math.ceil(len(examples) * a.epochs)))
    steps = max(1, total // a.accum)
    warm = max(1, steps // 20)
    order = []
    random.seed(1)
    while len(order) < total:
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
        print('progress %d %d' % (i + 1, total), flush=True)
    model.save_pretrained(a.out)
    tok.save_pretrained(a.out)
    print('done %d' % len(examples), flush=True)

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
