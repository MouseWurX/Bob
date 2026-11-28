#!/usr/bin/env python3
"""Pick a bit width per tensor: more bits where a part of the brain matters more, inside a size budget.

RETIRED for picks (27 Nov 2026 Qwen3-4B rental): this greedy pick put whole tensors at iq2_xxs and drifted 2.6x more
than stock Q4_K_M at the same size. Use part_bits.py (--loss imatrix for this same measure, or --loss fisher).

  mixed_bits.py --base model-bf16.gguf --imatrix imatrix.gguf --cand q.iq2_xxs.gguf --cand q.iq2_s.gguf --cand q.q3_k.gguf
                --cand q.q4_k.gguf --target-bpw 2.3 --out types.txt
  Options: --fix 'output=q4_k' (regex=type, repeatable, always wins)  --exclude token_embd (not counted in the budget,
           kept at --exclude-type)  --rows 0.25 (share of rows sampled per tensor, for speed on big brains)  --report r.json

Each --cand is the same brain squeezed to one stock type (llama-quantize --pure --imatrix imatrix.gguf base.gguf cand.gguf
TYPE). For every tensor and every candidate the script measures the importance-weighted rounding error
(sum over inputs of imatrix importance x squared weight error), then starts every tensor at the smallest candidate and
keeps upgrading the tensor that buys the most error drop per extra byte until the budget is spent.
Writes a llama-quantize --tensor-type-file (anchored names, so blk.1 never catches blk.10) and prints the command.

Idea credited, not ours: per-tensor bit mixes as in llamAmpere's 8 GB file (1.78 to 5.1 bits, average 2.09; JakeATX,
Nov 2026) and Unsloth's dynamic quants. Stock types only, so the result loads in plain llama.cpp on every backend.
Rounding error is only a first screen: the pick must still pass llama-perplexity --kl-divergence, the publish gate
and the real-jobs run.
"""
import argparse, json, re, sys
import numpy as np
from gguf import GGUFReader, GGMLQuantizationType as Q
from gguf.quants import dequantize

FLOAT_TYPES = (Q.F32, Q.F16, Q.BF16)


def as_f32(t, rows=None):
    data = np.asarray(t.data)
    if rows is not None: data = data.reshape(-1, data.shape[-1])[rows]
    # BF16 comes from the reader as raw bytes, so only F32/F16 are plain numbers (a BF16 base broke this, 27 Nov)
    return (data.astype(np.float32) if t.tensor_type in (Q.F32, Q.F16) else dequantize(data, t.tensor_type)).reshape(-1, int(t.shape[0]))


def load_imatrix(path):
    if not path: return {}
    r = GGUFReader(path); ts = {t.name: t for t in r.tensors}; out = {}
    for name, t in ts.items():
        if not name.endswith('.in_sum2'): continue
        base = name[:-len('.in_sum2')]; c = ts.get(base + '.counts')
        s2 = np.asarray(t.data, dtype=np.float32).reshape(-1, int(t.shape[0]))
        cnt = np.asarray(c.data, dtype=np.float32).reshape(-1) if c is not None else np.ones(s2.shape[0], np.float32)
        out[base] = s2 / np.maximum(cnt, 1)[:, None]   # (matrices, inputs)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--base', required=True); ap.add_argument('--imatrix', default='')
    ap.add_argument('--cand', action='append', required=True); ap.add_argument('--target-bpw', type=float, required=True)
    ap.add_argument('--fix', action='append', default=[]); ap.add_argument('--exclude', action='append', default=['token_embd'])
    ap.add_argument('--exclude-type', default='q4_k'); ap.add_argument('--rows', type=float, default=1.0)
    ap.add_argument('--seed', type=int, default=1); ap.add_argument('--out', required=True); ap.add_argument('--report', default='')
    a = ap.parse_args()
    print('note: mixed_bits.py is retired for picks; part_bits.py does better at the same size (see its docstring)', file=sys.stderr)
    rng = np.random.default_rng(a.seed)

    base = {t.name: t for t in GGUFReader(a.base).tensors}
    cands = [{t.name: t for t in GGUFReader(p).tensors} for p in a.cand]
    imat = load_imatrix(a.imatrix)
    fixes = [(re.compile(f.split('=')[0]), f.split('=')[1].lower()) for f in a.fix]
    excl = [re.compile(e) for e in a.exclude]

    tensors, no_imat = [], 0
    for name, bt in base.items():
        if len(bt.shape) < 2 or not all(name in c for c in cands): continue
        if all(c[name].tensor_type in FLOAT_TYPES for c in cands): continue   # never squeezed by any candidate
        if any(e.search(name) for e in excl):
            tensors.append({'name': name, 'excluded': True}); continue
        nrow = int(np.prod([int(x) for x in bt.shape[1:]]))
        rows = None
        if a.rows < 1.0:
            rows = np.sort(rng.choice(nrow, max(1, int(nrow * a.rows)), replace=False))
        w = as_f32(bt, rows)
        key = name[:-len('.weight')] if name.endswith('.weight') else name
        imp = imat.get(key) if key in imat else imat.get(name)
        if imp is None: no_imat += 1; imp = np.ones((1, w.shape[1]), np.float32)
        per_mat = nrow // imp.shape[0] if imp.shape[0] > 1 else nrow
        mat_of_row = (rows if rows is not None else np.arange(nrow)) // max(per_mat, 1)
        weights = imp[np.minimum(mat_of_row, imp.shape[0] - 1)]
        opts = {}
        for c in cands:
            ct = c[name]; tn = ct.tensor_type.name.lower()
            err = float((weights * (as_f32(ct, rows) - w) ** 2).sum()) / (a.rows if a.rows < 1 else 1.0)
            nbytes = int(np.asarray(ct.data).nbytes)
            if tn not in opts or err < opts[tn]['err']: opts[tn] = {'type': tn, 'bytes': nbytes, 'err': err}
        ladder = sorted(opts.values(), key=lambda o: o['bytes'])
        clean = [ladder[0]]   # keep only options that are bigger AND better than the one below
        for o in ladder[1:]:
            if o['err'] < clean[-1]['err'] and o['bytes'] > clean[-1]['bytes']: clean.append(o)
        fixed = next((t for rx, t in fixes if rx.search(name)), None)
        tensors.append({'name': name, 'n': int(np.prod([int(x) for x in bt.shape])), 'ladder': clean, 'pick': 0, 'fixed': fixed})
        print(f'{name}: ' + ', '.join(f"{o['type']} {o['err']:.3g}" for o in clean), flush=True)

    live = [t for t in tensors if not t.get('excluded')]
    n_weights = sum(t['n'] for t in live)
    budget = a.target_bpw * n_weights / 8
    used = lambda: sum((t['ladder'][t['pick']]['bytes'] for t in live if not t['fixed']), 0)
    fixed_bytes = 0
    for t in live:
        if t['fixed']:
            m = next((o for o in t['ladder'] if o['type'] == t['fixed']), None)
            fixed_bytes += m['bytes'] if m else t['ladder'][-1]['bytes']
    if used() + fixed_bytes > budget:
        print(f'warning: the smallest candidates already use {8*(used()+fixed_bytes)/n_weights:.3f} bpw, over the target', flush=True)
    while True:
        room = budget - used() - fixed_bytes; best, best_gain = None, 0.0
        for t in live:
            if t['fixed'] or t['pick'] + 1 >= len(t['ladder']): continue
            cur, nxt = t['ladder'][t['pick']], t['ladder'][t['pick'] + 1]
            extra = nxt['bytes'] - cur['bytes']
            if extra > room: continue
            gain = (cur['err'] - nxt['err']) / extra
            if gain > best_gain: best, best_gain = t, gain
        if best is None: break
        best['pick'] += 1

    lines = []
    for t in tensors:
        typ = a.exclude_type if t.get('excluded') else t['fixed'] or t['ladder'][t['pick']]['type']
        lines.append(f"^{re.escape(t['name'])}$={typ}")
    open(a.out, 'w', newline='\n').write('\n'.join(lines) + '\n')
    total = used() + fixed_bytes
    counts = {}
    for t in live:
        typ = t['fixed'] or t['ladder'][t['pick']]['type']; counts[typ] = counts.get(typ, 0) + t['n']
    summary = {'target_bpw': a.target_bpw, 'got_bpw': round(8 * total / n_weights, 4), 'weights_counted': n_weights,
               'weights_per_type': counts, 'tensors': len(live), 'excluded': [t['name'] for t in tensors if t.get('excluded')],
               'tensors_without_imatrix': no_imat, 'types_file': a.out,
               'next': f"llama-quantize --imatrix {a.imatrix or '<imatrix>'} --tensor-type-file {a.out} {a.base} <out.gguf> "
                       f"{min(live, key=lambda t: t['ladder'][0]['bytes'] / t['n'])['ladder'][0]['type'].upper()}"}
    print(json.dumps(summary, indent=1))
    if a.report: json.dump({**summary, 'per_tensor': live}, open(a.report, 'w'), indent=1)


if __name__ == '__main__':
    main()
