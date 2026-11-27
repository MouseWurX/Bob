#!/usr/bin/env python3
"""Bits by part: a bit width per tensor (and per band of the output head) from an estimate of the drift it adds.

  part_bits.py --base base-bf16.gguf --cand c.iq2_xxs.gguf --cand c.q2_k.gguf --cand c.q3_k.gguf --cand c.q4_k.gguf
               --cand c.q6_k.gguf --cand c.q8_0.gguf --teacher <HF dir> --calib text.txt --target-bpw 2.6 --out types.txt
  Budget: --target-bpw 2.6 | --target-bytes N | --same-size-as other.gguf (as big as another cut, e.g. MX2_S, for a fair test)
  Options: --fisher-cache f.npz (work the Fisher sums out once, reuse them for every budget)
           --bands 16 (also cut the output head into bands by likelihood: bits by word, in the same budget)
           --llama-cpp <checkout> (the converter's layout, for brains whose converter merges or reorders tensors)
           --loss imatrix --imatrix imatrix.gguf (no teacher: mixed_bits.py's rounding measure; no bands)
           --chunks 64 --ctx 512 --fix 'regex=type' --exclude token_embd --exclude-type q6_k --report r.json

Loss estimate (--loss fisher, the default): the teacher (the full-precision HF brain) reads calibration text and answers
with words drawn from its own odds; the squared gradients give the Fisher information F of every weight, and
  drift a part adds at a type ~= 1/2 * sum over its weights of F x (squared change of that weight at that type)
which is the second-order estimate of KL (the drift llama-perplexity --kl-divergence measures), per word, in the same
units for every part. So a part whose weights the brain leans on gets more bits, wherever it sits. The pick then spends
the byte budget knapsack-style (bits_pick.py: hull walk, then fill) and writes a llama-quantize --tensor-type-file; with
--bands it also writes a band plan for word_bands.py apply.

Idea credited, not ours: NariQ (Nari Labs, Nov 2026) picks per-module widths from gradient loss estimates shared out
by knapsack; Fisher-weighted error as in SqueezeLLM. Their numbers are unproven in our lab, as we have yet to test.
Stock types only: the file loads in plain llama.cpp (banded heads need Lamplight 0150). The pick must still pass
llama-perplexity --kl-divergence, the publish gate and the real-jobs run. The teacher's weights never change: nothing
is trained. Calibration text must be public, neutral text, never held-out jobs, never Claude-written.
"""
import argparse, json, os, re, sys, time

_lc = next((sys.argv[i + 1] for i, x in enumerate(sys.argv[:-1]) if x == '--llama-cpp'), None)
if _lc: sys.path.insert(0, os.path.join(os.path.abspath(_lc), 'gguf-py'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import gguf
from gguf import GGUFReader, GGMLQuantizationType as Q
from gguf.quants import dequantize
from bits_pick import clean_ladder, pick, split_bands

FLOAT_TYPES = (Q.F32, Q.F16, Q.BF16)
PLAIN = (Q.F32, Q.F16)


def logical_shape(t): return tuple(int(x) for x in reversed(t.shape))


def as_f32(t):
    data = np.asarray(t.data)
    v = data.astype(np.float32) if t.tensor_type in PLAIN else dequantize(data, t.tensor_type).astype(np.float32)
    return v.reshape(logical_shape(t))


def field_str(r, k):
    f = r.fields.get(k)
    return None if f is None else f.contents()


def tensor_bytes(t): return int(np.asarray(t.data).nbytes)


def fisher(a, want, log=print):
    """Squared gradients (sampled labels) of the HF params in `want`, per word. Returns {hf_name: np.float32 array}."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    dev = torch.device(a.device or ('cuda' if torch.cuda.is_available() else 'cpu'))
    dtype = {'bf16': torch.bfloat16, 'fp32': torch.float32}[a.dtype or ('bf16' if dev.type == 'cuda' else 'fp32')]
    torch.manual_seed(a.seed)
    tok = AutoTokenizer.from_pretrained(a.teacher)
    model = AutoModelForCausalLM.from_pretrained(a.teacher, dtype=dtype).to(dev).eval()
    if getattr(model.config, 'tie_word_embeddings', False) and a.untie_head and hasattr(model, 'lm_head'):
        model.lm_head.weight = torch.nn.Parameter(model.lm_head.weight.detach().clone())   # the head's own Fisher
    params = dict(model.named_parameters())
    acc = {}
    for n, p in params.items():
        if n in want:
            p.requires_grad_(True)
            acc[n] = torch.zeros(p.shape, dtype=torch.float32, device='cpu' if a.fisher_on_cpu else dev)

            def hook(p, n=n):
                g = p.grad.detach().float()
                acc[n] += (g * g).to(acc[n].device)
                p.grad = None
            p.register_post_accumulate_grad_hook(hook)
        else:
            p.requires_grad_(False)
    text = open(a.calib, encoding='utf-8').read().replace('\r\n', '\n')
    ids = tok(text, add_special_tokens=False)['input_ids']
    chunks = [ids[i:i + a.ctx] for i in range(0, len(ids) - a.ctx + 1, a.ctx)][:a.chunks]
    if not chunks: sys.exit('not enough calibration text for --ctx')
    t0 = time.time(); n_tok = 0
    for i, c in enumerate(chunks):
        x = torch.tensor([c], device=dev)
        logits = model(input_ids=x).logits.float()[0]
        with torch.no_grad():
            y = torch.multinomial(torch.softmax(logits, -1), 1)[:, 0]   # the brain's own answers: the true Fisher
        loss = torch.nn.functional.cross_entropy(logits, y, reduction='sum')
        loss.backward(); n_tok += len(c)
        if i == 0 or (i + 1) % 16 == 0: log(f'fisher: chunk {i + 1}/{len(chunks)} ({time.time() - t0:.0f}s)')
    # E over chunks of (sum over words of g)^2 = sum over words of E g^2 (sampled labels): divide by words for per-word
    out = {n: (v / n_tok).cpu().numpy() for n, v in acc.items()}
    del model, acc
    return out, n_tok


def hf_sources(a, base_r, layout_needed):
    """GGUF tensor -> list of (hf_name, gguf_pos or None, hf_pos or None). Name map first, converter layout if given."""
    arch_name = field_str(base_r, 'general.architecture')
    arch = next((k for k, v in gguf.MODEL_ARCH_NAMES.items() if v == arch_name), None)
    n_layer = int(field_str(base_r, f'{arch_name}.block_count'))
    import json as _j
    cfg = _j.load(open(os.path.join(a.teacher, 'config.json')))
    from safetensors import safe_open
    names = {}
    for f in sorted(os.listdir(a.teacher)):
        if f.endswith('.safetensors'):
            with safe_open(os.path.join(a.teacher, f), 'np') as s:
                for k in s.keys(): names[k] = tuple(s.get_slice(k).get_shape())
    out = {}
    if a.llama_cpp:
        from gguf_layout import trace_layout
        for g, e in trace_layout(a.llama_cpp, a.teacher, no_mtp=not a.keep_mtp).items():
            out[g] = [(e['same'], None, None)] if 'same' in e else e['parts']
    tmap = gguf.get_tensor_name_map(arch, n_layer)
    for hn in names:
        g = tmap.get_name(hn, try_suffixes=('.weight', '.bias'))
        if g and g not in out: out[g] = [(hn, None, None)]
    if 'output.weight' not in out and cfg.get('tie_word_embeddings'):
        out['output.weight'] = [('lm_head.weight', None, None)]    # the untied copy made in fisher()
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--base', required=True); ap.add_argument('--cand', action='append', required=True)
    ap.add_argument('--loss', choices=('fisher', 'imatrix'), default='fisher')
    ap.add_argument('--teacher', default=''); ap.add_argument('--calib', default=''); ap.add_argument('--imatrix', default='')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--target-bpw', type=float); g.add_argument('--target-bytes', type=int); g.add_argument('--same-size-as')
    ap.add_argument('--bands', type=int, default=0); ap.add_argument('--first', type=int, default=64)
    ap.add_argument('--fix', action='append', default=[]); ap.add_argument('--exclude', action='append', default=['token_embd'])
    ap.add_argument('--exclude-type', default='q6_k')
    ap.add_argument('--chunks', type=int, default=64); ap.add_argument('--ctx', type=int, default=512)
    ap.add_argument('--device', default=''); ap.add_argument('--dtype', default=''); ap.add_argument('--fisher-on-cpu', action='store_true')
    ap.add_argument('--untie-head', action='store_true', default=True)
    ap.add_argument('--llama-cpp', default=''); ap.add_argument('--keep-mtp', action='store_true')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--fisher-cache', default='', help='.npz: read the Fisher sums from here if it exists, else save them (same teacher and text)')
    ap.add_argument('--out', required=True); ap.add_argument('--bands-out', default=''); ap.add_argument('--report', default='')
    a = ap.parse_args()
    if a.loss == 'fisher' and not (a.teacher and a.calib): sys.exit('--loss fisher needs --teacher and --calib')
    if a.loss == 'imatrix' and a.bands: sys.exit('--bands needs --loss fisher (KL units); for a teacher-less banded head use word_bands.py plan')
    for p in (a.calib, a.imatrix):
        if p and any(x in os.path.basename(p).lower() for x in ('held-out', 'heldout', 'held_out')):
            sys.exit('refusing: that looks like a held-out set. Held-out jobs are never used to shape a brain.')

    base_r = GGUFReader(a.base); base = {t.name: t for t in base_r.tensors}
    cands = [{t.name: t for t in GGUFReader(p).tensors} for p in a.cand]
    fixes = [(re.compile(f.split('=')[0]), f.split('=')[1].lower()) for f in a.fix]
    excl = [re.compile(e) for e in a.exclude]
    names = []
    for name, bt in base.items():
        if len(bt.shape) < 2 or not all(name in c for c in cands): continue
        if all(c[name].tensor_type in FLOAT_TYPES for c in cands): continue
        names.append(name)
    live = [n for n in names if not any(e.search(n) for e in excl)]
    if a.bands and 'output.weight' not in live: sys.exit('--bands: the base has no output.weight (tied head: word_bands.py untie first)')

    # loss weights per GGUF tensor: Fisher (mapped from HF) or imatrix importance per input
    weight_of, why_none = {}, {}
    if a.loss == 'fisher':
        src = hf_sources(a, base_r, bool(a.llama_cpp))
        want = {hn for n in live for hn, _, _ in src.get(n, [])}
        if a.fisher_cache and os.path.exists(a.fisher_cache):
            z = np.load(a.fisher_cache); F = {k: z[k] for k in z.files if k in want}; n_tok = None
            print(f'fisher: read {len(F)} tensors from {a.fisher_cache}', flush=True)
        else:
            F, n_tok = fisher(a, want)
            if a.fisher_cache: np.savez(a.fisher_cache, **F); print(f'fisher: saved to {a.fisher_cache}', flush=True)
        norm = lambda s: s.replace('language_model.', '').removeprefix('model.')
        Fn = {norm(k): v for k, v in F.items()}
        for n in live:
            parts = src.get(n)
            shape = logical_shape(base[n])
            if not parts or any(norm(hn) not in Fn for hn, _, _ in parts): why_none[n] = 'no HF tensor lined up'; continue
            w = np.zeros(int(np.prod(shape)), np.float32)
            for hn, gp, hp in parts:
                f = Fn[norm(hn)].reshape(-1)
                if gp is None:
                    if f.size != w.size: why_none[n] = f'HF size {f.size} vs {w.size}'; break
                    w[:] = f
                else: w[gp] = f[hp]
            else:
                weight_of[n] = w.reshape(shape)
    else:
        from mixed_bits import load_imatrix
        imat = load_imatrix(a.imatrix)
        for n in live:
            key = n[:-len('.weight')] if n.endswith('.weight') else n
            imp = imat.get(key)
            shape = logical_shape(base[n])
            if imp is None: imp = np.ones((1, shape[-1]), np.float32)
            rows = int(np.prod(shape[:-1])); per = rows // imp.shape[0] if imp.shape[0] > 1 else rows
            weight_of[n] = np.repeat(imp, per, axis=0)[:rows].reshape(shape) if imp.shape[0] > 1 else \
                np.broadcast_to(imp.reshape(-1), shape)

    parts, fixed_bytes, pinned = [], 0, []
    bands_plan = None
    for n in live:
        bt = base[n]
        fixed = next((t for rx, t in fixes if rx.search(n)), None)
        W = as_f32(bt)
        if n not in weight_of:
            # no estimate: kept at the biggest candidate, counted in the budget, listed in the report
            big = max((c[n] for c in cands), key=tensor_bytes)
            pinned.append({'name': n, 'type': fixed or big.tensor_type.name.lower(), 'why': why_none.get(n, 'no estimate')})
            fixed_bytes += tensor_bytes(next((c[n] for c in cands if c[n].tensor_type.name.lower() == fixed), big)); continue
        Fw = weight_of[n]
        if n == 'output.weight' and a.bands:
            imp_rows = Fw.reshape(W.shape[0], -1).sum(1)
            for b, rows in enumerate(split_bands(imp_rows, a.bands, a.first)):
                opts = []
                for c in cands:
                    ct = c[n]; d = as_f32(ct)[rows] - W[rows]
                    opts.append({'type': ct.tensor_type.name.lower(), 'err': 0.5 * float((Fw[rows] * d * d).sum()),
                                 'bytes': tensor_bytes(ct) // W.shape[0] * len(rows)})
                parts.append({'name': f'output.band{b}', 'rows': rows, 'ladder': clean_ladder(opts), 'n': int(rows.size * W.shape[1]),
                              'share': float(imp_rows[rows].sum() / imp_rows.sum())})
            continue
        opts = []
        for c in cands:
            ct = c[n]; d = as_f32(ct) - W
            opts.append({'type': ct.tensor_type.name.lower(), 'err': 0.5 * float((Fw * d * d).sum()), 'bytes': tensor_bytes(ct)})
        lad = clean_ladder(opts)
        fi = next((i for i, o in enumerate(lad) if o['type'] == fixed), None) if fixed else None
        if fixed and fi is None:
            lad = lad + [next(o for o in opts if o['type'] == fixed)]; lad.sort(key=lambda o: o['bytes']); fi = lad.index(next(o for o in lad if o['type'] == fixed))
        parts.append({'name': n, 'ladder': lad, 'fixed': fi, 'n': int(W.size)})
        print(f'{n}: ' + ', '.join(f"{o['type']} {o['err']:.3g}" for o in lad), flush=True)

    n_weights = sum(int(np.prod(logical_shape(base[n]))) for n in live)
    if a.target_bytes: budget = a.target_bytes
    elif a.same_size_as:
        other = {t.name: t for t in GGUFReader(a.same_size_as).tensors}
        miss = [n for n in live if n not in other and not (n == 'output.weight' and 'output.band0.weight' in other)]
        if miss: sys.exit(f'--same-size-as: {len(miss)} tensors missing there, e.g. {miss[0]}')
        budget = sum(tensor_bytes(other[n]) for n in live if n in other) + \
            sum(tensor_bytes(t) for k, t in other.items() if k.startswith('output.band') and k.endswith('.weight') and 'output.weight' in live)
    else: budget = int(a.target_bpw * n_weights / 8)
    pos_bytes = 4 * int(base['output.weight'].shape[1]) if a.bands else 0   # output.band_pos rides in the same budget
    used = pick(parts, budget - fixed_bytes - pos_bytes) + fixed_bytes + pos_bytes
    if used > budget: print(f'warning: the smallest candidates already need {used:,} bytes, over the budget of {budget:,}', flush=True)

    types = {}
    for p in parts:
        if not p['name'].startswith('output.band'): types[p['name']] = p['ladder'][p['pick']]['type']
    for p in pinned: types[p['name']] = p['type']
    band_parts = [p for p in parts if p['name'].startswith('output.band')]
    if band_parts:
        bt = base['output.weight']
        bands_plan = {'n_vocab': int(bt.shape[1]), 'n_embd': int(bt.shape[0]), 'made_by': 'part_bits.py (fisher)',
                      'bands': [{'type': p['ladder'][p['pick']]['type'], 'words': int(p['rows'].size),
                                 'text_share': round(p['share'], 6), 'rows': [int(x) for x in p['rows']]} for p in band_parts]}
        types['output.weight'] = max(bands_plan['bands'], key=lambda b: b['words'])['type']   # replaced by the bands
        a.bands_out = a.bands_out or os.path.splitext(a.out)[0] + '-bands.json'
        json.dump(bands_plan, open(a.bands_out, 'w'))
    lines = [f"^{re.escape(n)}$={types.get(n, a.exclude_type)}" for n in names]
    open(a.out, 'w', newline='\n').write('\n'.join(lines) + '\n')
    est = sum(p['ladder'][p['pick']]['err'] for p in parts)
    counts = {}
    for p in parts:
        t = p['ladder'][p['pick']]['type']; counts[t] = counts.get(t, 0) + p['n']
    smallest = max(counts, key=counts.get).upper() if counts else 'Q4_K'   # the main type; the file names every tensor
    summary = {'loss': a.loss, 'budget_bytes': budget, 'used_bytes': used, 'got_bpw': round(8 * used / n_weights, 4),
               'weights_counted': n_weights, 'weights_per_type': counts, 'estimated_drift': est,
               'no_estimate_kept_big': pinned, 'excluded': [n for n in names if n not in live], 'types_file': a.out,
               'bands_file': a.bands_out or None,
               'next': [f"llama-quantize --imatrix <imatrix> --tensor-type-file {a.out} {a.base} <out.gguf> {smallest}"] +
                       ([f"word_bands.py apply --gguf <out.gguf> --plan {a.bands_out} " + ' '.join(f'--cand {c}' for c in a.cand) +
                         " --out <out-banded.gguf>"] if band_parts else []) +
                       ['llama-perplexity --kl-divergence against the full-precision logits, then the publish gate and real jobs']}
    if band_parts:
        summary['bands'] = [(b['words'], b['type']) for b in bands_plan['bands']]
    print(json.dumps(summary, indent=1))
    if a.report:
        json.dump({**summary, 'per_part': [{'name': p['name'], 'pick': p['ladder'][p['pick']], 'ladder': p['ladder']} for p in parts]},
                  open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
