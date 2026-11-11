// 1.5.16x Teach it here: the trainer the Trainer pack runs (thinking-paths.md sec 15.3). Bob ships inside an archive
// Python can't read, so this text is written into the Trainer pack's folder before each run (teach.py).
// It teaches an adapter (LoRA) on the brain's full weights held in 4-bit (QLoRA; on a Mac in 16-bit), from a lesson
// set in JSONL (Bob's own {"messages": [...]} lessons, or {"conversations"}, {"prompt","completion"},
// {"instruction","output"}). Only the last answer of each lesson is learned from; the question is read, not learned.
// It prints "progress <done> <total>", "loss <n>", "skipped <n>" and "done <n>" for the Lab to show.
// 1.5.188 for the Best answers page: --lessons is optional, --pairs <jsonl> ({"messages", "chosen", "rejected"}) adds
// a better/worse pairs pass (DPO: lean toward the better answer, measured against the brain as it was before the pass),
// and --targets <json> ({"targets": [{kind: expert|head|attn|ffn, layer, index}]}, fNRI's shape) puts the adapter only
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

# ---- Direct mode (1.5.188): the brain's own weights at 16-bit, a small low-rank change added straight onto the
# chosen weights (every expert of a fused block can be picked one by one), and, for squeeze-aware teaching, every
# weight rounded the way the running file will round it while it learns. Saves the whole brain, not an adapter.
ATTN = ('self_attn', 'attention', 'attn', 'linear_attn')
OUT = ('o_proj', 'out_proj', 'dense')
# Block size, bits, and whether the block has its own minimum (the K quants keep one for 4 and 5 bits).
SQUEEZE = {'Q8_0': (32, 8, False), 'Q6_K': (16, 6, False), 'Q5_K_M': (32, 5, True), 'Q4_K_M': (32, 4, True), 'Q3_K_M': (16, 3, False), 'Q2_K': (16, 2, True)}

def fake_quant(w, kind):
    import torch
    block, bits, asym = SQUEEZE[kind]
    if w.dim() < 2 or w.shape[-1] % block:
        return w
    x = w.float().reshape(*w.shape[:-1], w.shape[-1] // block, block)
    if asym:
        lo, hi = x.amin(-1, keepdim=True), x.amax(-1, keepdim=True)
        sc = ((hi - lo) / (2 ** bits - 1)).clamp(min=1e-8)
        q = ((x - lo) / sc).round().clamp(0, 2 ** bits - 1) * sc + lo
    else:
        top = 2 ** (bits - 1)
        sc = (x.abs().amax(-1, keepdim=True) / top).clamp(min=1e-8)
        q = (x / sc).round().clamp(-top, top - 1) * sc
    q = q.reshape(w.shape).to(w.dtype)
    return w + (q - w).detach()   # rounds on the way forward, learns as if it didn't (straight-through)

def top_kl(tp, lp_top):
    # KL from the full-size odds to the squeezed brain's, over the top words plus one bin for "every other word", so
    # it can't be cheated by piling everything onto the top words. tp: teacher probs, lp_top: student log-probs there.
    import torch
    rest_t = (1 - tp.sum(-1)).clamp(min=1e-8)
    rest_s = (1 - lp_top.exp().sum(-1)).clamp(min=1e-8)
    kl = (tp * (tp.clamp(min=1e-12).log() - lp_top)).sum(-1) + rest_t * (rest_t.log() - rest_s.log())
    return kl.mean()

def make_delta(shape, rank, experts, squeeze):
    import torch
    class Delta(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.squeeze = squeeze
            if len(shape) == 2:
                out_f, in_f = shape
                self.A = torch.nn.Parameter(torch.randn(rank, in_f) / math.sqrt(in_f))
                self.B = torch.nn.Parameter(torch.zeros(out_f, rank))
                self.idx = None
            else:
                e, out_f, in_f = shape
                self.idx = list(range(e)) if experts is None else sorted(set(experts))
                k = len(self.idx)
                self.A = torch.nn.Parameter(torch.randn(k, rank, in_f) / math.sqrt(in_f))
                self.B = torch.nn.Parameter(torch.zeros(k, out_f, rank))
        def delta(self, w):
            if self.idx is None:
                return (self.B @ self.A).to(w.dtype) * 2.0
            d = torch.zeros_like(w)
            d[self.idx] = (self.B @ self.A).to(w.dtype) * 2.0
            return d
        def forward(self, w):
            w = w + self.delta(w)
            return fake_quant(w, self.squeeze) if self.squeeze else w
    return Delta()

def pick_weights(model, targets_path):
    """[(module, param name, expert ids or None)] to change. No targets file: every weight a running file squeezes."""
    import re
    mods = dict(model.named_modules())
    plain = []      # (layer, rest, module name, param name, is 3D)
    for n, m in model.named_modules():
        if 'lm_head' in n or 'embed' in n:
            continue
        for pn, p in m.named_parameters(recurse=False):
            if pn.endswith('bias') or p.dim() < 2 or p.dim() > 3:
                continue
            if p.dim() == 2 and not is_linear(m):
                continue
            if n.endswith('.gate') or n.endswith('.router'):   # the router: tiny, and left as it is
                continue
            g = re.search(r'layers\.(\d+)\.(.+)$', n)
            plain.append((int(g.group(1)) if g else -1, g.group(2) if g else n, n, pn, p.dim() == 3))
    if not targets_path:
        return [(mods[n], pn, None) for _, _, n, pn, _ in plain], 0
    with open(targets_path, encoding='utf-8') as f:
        want = json.load(f).get('targets') or []
    picked, fell = {}, 0
    def add(n, pn, ex=None):
        k = (n, pn)
        if ex is None:
            picked[k] = None
        elif k not in picked or picked[k] is not None:
            picked[k] = sorted(set((picked.get(k) or []) + ex))
    for t in want:
        kind, layer, index = str(t.get('kind')), int(t.get('layer', -1)), int(t.get('index', 0) or 0)
        here = [x for x in plain if x[0] == layer]
        attn = [x for x in here if any(a in x[1] for a in ATTN)]
        mlp = [x for x in here if 'mlp' in x[1] or 'experts' in x[1] or 'feed_forward' in x[1]]
        if kind == 'expert':
            one = [x for x in mlp if re.search(r'experts\.%d(\.|$)' % index, x[1]) and not x[4]]
            fused = [x for x in mlp if x[4] and x[1].endswith('experts')]
            if one:
                for x in one: add(x[2], x[3])
            elif fused:
                for x in fused: add(x[2], x[3], [index])
            else:
                fell += 1
                for x in mlp: add(x[2], x[3])
        elif kind == 'head':
            fell += 1
            for x in ([y for y in attn if y[1].rsplit('.', 1)[-1] in OUT] or attn): add(x[2], x[3])
        elif kind == 'attn':
            for x in attn: add(x[2], x[3])
        else:
            for x in mlp: add(x[2], x[3])
    return [(mods[n], pn, ex) for (n, pn), ex in picked.items()], fell

def direct(a):
    import torch
    from torch.nn.utils import parametrize
    from transformers import AutoTokenizer, AutoModelForCausalLM
    cuda = torch.cuda.is_available()
    mps = (not cuda) and getattr(torch.backends, 'mps', None) is not None and torch.backends.mps.is_available()
    device = 'cuda' if cuda else 'mps' if mps else 'cpu'
    dtype = torch.bfloat16 if cuda else torch.float16 if mps else torch.float32
    if a.squeeze and a.squeeze not in SQUEEZE:
        print('Bob doesn\'t know the squeeze %s.' % a.squeeze, file=sys.stderr)
        sys.exit(2)
    tok = AutoTokenizer.from_pretrained(a.base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(a.base, dtype=dtype)
    model.to(device)
    model.config.use_cache = False
    for p in model.parameters():
        p.requires_grad_(False)

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

    # Squeeze-aware: the brain's own odds at full size, read once before anything changes (the top few words at
    # every place), so the squeezed brain learns to say what its full-size self says.
    teacher = []
    if a.squeeze:
        model.eval()
        with torch.no_grad():
            for j, (ids, _) in enumerate(examples):
                lp = torch.log_softmax(model(input_ids=torch.tensor([ids], device=device)).logits[0, :-1].float(), dim=-1)
                v, i = lp.topk(a.top, dim=-1)
                teacher.append((i.cpu(), v.exp().cpu()))
                if j % 8 == 0:
                    print('progress %d %d' % (j + 1, len(examples) * 2), flush=True)

    chosen, fell = pick_weights(model, a.targets)
    print('targets %d %d' % (len(chosen), fell), flush=True)
    if not chosen:
        print('None of the parts picked are ones this brain\'s weights have.', file=sys.stderr)
        sys.exit(3)
    deltas = []
    for m, pn, ex in chosen:
        w = getattr(m, pn)
        d = make_delta(tuple(w.shape), a.rank, ex, a.squeeze or None).to(device)
        parametrize.register_parametrization(m, pn, d)
        deltas.append(d)
    params = [p for d in deltas for p in (d.A, d.B)]
    def drift():
        # How far the squeezed brain is from its full-size self, on these lessons (KL over the top words; lower is closer).
        model.eval()
        tot = 0.0
        with torch.no_grad():
            for (ids, _), (ti, tp) in zip(examples, teacher):
                lp = torch.log_softmax(model(input_ids=torch.tensor([ids], device=device)).logits[0, :-1].float(), dim=-1)
                tot += top_kl(tp.to(device), lp.gather(1, ti.to(device))).item()
        model.train()
        return tot / max(1, len(examples))
    before = drift() if a.squeeze else None
    for p in params:
        p.requires_grad_(True)
    model.gradient_checkpointing_enable()
    model.enable_input_require_grads()
    model.train()
    random.seed(1)
    total = int(math.ceil(len(examples) * a.epochs))
    ptotal = int(math.ceil(len(pairs) * a.epochs))
    base_done = len(examples) if a.squeeze else 0
    grand = max(1, base_done + total + 2 * ptotal)
    opt = torch.optim.AdamW(params, lr=a.lr, weight_decay=0.0)
    order = []
    while examples and len(order) < total:
        e = list(range(len(examples))); random.shuffle(e); order += e
    order = order[:total]
    run = 0.0
    for i, k in enumerate(order):
        ids, labels = examples[k]
        x = torch.tensor([ids], device=device)
        if a.squeeze:
            ti, tp = teacher[k]
            lp = torch.log_softmax(model(input_ids=x).logits[0, :-1].float(), dim=-1)
            loss = top_kl(tp.to(device), lp.gather(1, ti.to(device))) / a.accum
        else:
            loss = model(input_ids=x, labels=torch.tensor([labels], device=device)).loss / a.accum
        loss.backward()
        run += loss.item()
        if (i + 1) % a.accum == 0 or i + 1 == total:
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            opt.step(); opt.zero_grad(set_to_none=True)
            print('loss %.4f' % run, flush=True)
            run = 0.0
        print('progress %d %d' % (base_done + i + 1, grand), flush=True)
    if pairs:
        model.eval()
        ref = []
        with torch.no_grad():
            for j, (start, c, r) in enumerate(pairs):
                ref.append((answer_logp(model, c, start, device).item(), answer_logp(model, r, start, device).item()))
        model.train()
        popt = torch.optim.AdamW(params, lr=a.pairs_lr, weight_decay=0.0)
        porder = []
        while len(porder) < ptotal:
            e = list(range(len(pairs))); random.shuffle(e); porder += e
        porder = porder[:ptotal]
        run, won = 0.0, 0
        for i, k in enumerate(porder):
            start, c, r = pairs[k]
            margin = a.beta * ((answer_logp(model, c, start, device) - ref[k][0]) - (answer_logp(model, r, start, device) - ref[k][1]))
            loss = -torch.nn.functional.logsigmoid(margin) / a.accum
            loss.backward()
            run += loss.item()
            if i >= ptotal - len(pairs):
                won += 1 if margin.item() > 0 else 0
            if (i + 1) % a.accum == 0 or i + 1 == ptotal:
                torch.nn.utils.clip_grad_norm_(params, 1.0)
                popt.step(); popt.zero_grad(set_to_none=True)
                print('loss %.4f' % run, flush=True)
                run = 0.0
            print('progress %d %d' % (base_done + total + len(pairs) + i + 1, grand), flush=True)
        print('pairs %d %d' % (len(pairs), won), flush=True)
    if a.squeeze:
        print('drift %.6f %.6f' % (before, drift()), flush=True)
    # Keep the change, not the rounding: the running file rounds it again when it's made.
    model.eval()
    with torch.no_grad():
        for (m, pn, _), d in zip(chosen, deltas):
            d.squeeze = None
            parametrize.remove_parametrizations(m, pn, leave_parametrized=True)
    model.config.use_cache = True
    model.save_pretrained(a.out)
    tok.save_pretrained(a.out)
    print('done %d' % (len(examples) + len(pairs)), flush=True)

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
    ap.add_argument('--direct', action='store_true')
    ap.add_argument('--squeeze', default='')
    ap.add_argument('--top', type=int, default=16)
    a = ap.parse_args()
    if a.direct:
        return direct(a)

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
    names = sorted({n.rsplit('.', 1)[-1] for n, m in model.named_modules() if is_linear(m) and 'lm_head' not in n and '.gate' != n[-5:]})
    lc = LoraConfig(r=a.rank, lora_alpha=a.rank * 2, lora_dropout=0.05, target_modules=names, task_type='CAUSAL_LM')
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
            if i >= ptotal - len(pairs):
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
