#!/usr/bin/env python3
"""Bits by word: give the output head's common words more bits and its rare words fewer, in stock GGUF types.

The output head has one row per word of the vocabulary. Most of the time the brain picks from a few thousand common
words, so an error in a common word's row costs far more drift than the same error in a rare word's row. This splits
the head into bands by how likely each word is, and gives every band its own stock type (q8_0 for the top words,
2-bit for the long tail), inside a byte budget. Idea credited, not ours: NariQ's banded output head (Nari Labs,
Nov 2026: 16 bands by likelihood, reported 12% less drift at 3.0 bits; unproven in our lab, as we have yet to test).

  word_bands.py untie   --gguf tied-bf16.gguf --out untied-bf16.gguf
        a brain whose head is its word table (tied) gets its own output.weight, so candidates can squeeze it alone
  word_bands.py plan    --base base-bf16.gguf --cand c.q2_k.gguf --cand c.q4_k.gguf --cand c.q6_k.gguf --cand c.q8_0.gguf
                        --imatrix imatrix.gguf (--counts counts.json | --calib text.txt --llama-bin <dir>)
                        [--bands 16] [--same-as q6_k | --head-bpw 4.5] --out plan.json
        picks a type per band. Error of a band at a type = 1/2 sum over its words of (how often the word comes up) x
        sum over inputs of (imatrix importance) x (squared weight error): the drift it adds, to first order.
        --same-as q6_k: the bands together are exactly as big as a q6_k head (a fair same-size test).
  word_bands.py apply   --gguf squeezed.gguf --plan plan.json --cand ... --out banded.gguf
        writes a copy whose output.weight is replaced by output.band0.weight ... output.bandN.weight (rows cut
        straight out of the candidates' heads: GGUF rows are squeezed one by one, so nothing is squeezed again) and
        output.band_pos (where each word's row sits). Re-reads the file and checks every row against its candidate.
  word_bands.py unband  --gguf banded.gguf --cand c.q6_k.gguf --out stock.gguf
        puts one candidate's whole head back: a plain file for llama.cpp, Ollama and LM Studio.

Who can load a banded file: Lamplight with patch 0150 (Bob's engine) on CUDA, Vulkan, Metal and the processor, since
the bands are stock types and the head only uses stock steps (multiply, concat, get_rows). Plain llama.cpp, Ollama and
LM Studio refuse it (no output.weight): keep the unbanded file for them.
Rules (Bob project): word counts come from public, neutral text (the imatrix text or wikitext), never held-out jobs.
"""
import argparse, json, os, re, subprocess, sys
import numpy as np

_lc = next((sys.argv[i + 1] for i, x in enumerate(sys.argv[:-1]) if x == '--llama-cpp'), None)
if _lc: sys.path.insert(0, os.path.join(os.path.abspath(_lc), 'gguf-py'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gguf
from gguf import GGUFReader, GGUFWriter, GGMLQuantizationType as Q, GGML_QUANT_SIZES
from gguf.quants import dequantize
from bits_pick import clean_ladder, pick, split_bands

PLAIN_TYPES = (Q.F32, Q.F16)    # numpy reads these as numbers; everything else (BF16 too) goes through dequantize
NO_ROW_CUT = (Q.NVFP4,)          # a per-tensor scale: rows can't be cut out on their own
MAX_BANDS = 32


def tensors(r): return {t.name: t for t in r.tensors}


def rows_of(t):
    """Raw bytes of a 2D tensor, one row per word: (n_rows, row_bytes) uint8."""
    n_rows = int(t.shape[1]); data = np.asarray(t.data)
    return np.ascontiguousarray(data).view(np.uint8).reshape(n_rows, -1)


def as_f32(t, rows=None):
    data = np.asarray(t.data)
    n_rows, n_cols = int(t.shape[1]), int(t.shape[0])
    data = data.reshape(n_rows, -1)
    if rows is not None: data = data[rows]
    if t.tensor_type in PLAIN_TYPES: return data.astype(np.float32).reshape(-1, n_cols)
    return dequantize(data, t.tensor_type).reshape(-1, n_cols).astype(np.float32)


def band_err(t, base, rows, freq, imp, step=4096):
    """1/2 sum over the rows of freq x sum over inputs of imp x (squared error of t against base), a few rows at a time."""
    err = 0.0
    for i in range(0, len(rows), step):
        rr = rows[i:i + step]; d = as_f32(t, rr) - as_f32(base, rr)
        err += 0.5 * float(freq[rr] @ ((d * d) @ imp))
    return err


def head_of(r, path):
    ts = tensors(r)
    if 'output.band0.weight' in ts: sys.exit(f'{path}: already banded (unband it first)')
    t = ts.get('output.weight')
    if t is None: sys.exit(f'{path}: no output.weight (a tied head: run "word_bands.py untie" on the full-precision file, '
                           'then make the candidates from the untied file)')
    return t


def copy_fields(r, w, skip=()):
    arch = r.fields['general.architecture'].contents()
    for k, f in r.fields.items():
        if k.startswith('GGUF.') or k == 'general.architecture' or k in skip: continue
        t = f.types[0]; sub = f.types[-1] if t == gguf.GGUFValueType.ARRAY else None
        v = f.contents()
        if sub is not None and len(v) == 0: continue
        w.add_key_value(k, v, t, sub_type=sub)
    return arch


def put(w, t, name=None):
    # the reader gives squeezed tensors as bytes (rows, bytes a row): the writer takes that shape as it is
    w.add_tensor(name or t.name, t.data, raw_dtype=t.tensor_type)


def write(w):
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(progress=False); w.close()


def cmd_untie(a):
    r = GGUFReader(a.gguf); ts = tensors(r)
    if 'output.weight' in ts: sys.exit('already has its own output.weight')
    emb = ts['token_embd.weight']
    w = GGUFWriter(a.out, r.fields['general.architecture'].contents())
    copy_fields(r, w)
    for t in r.tensors: put(w, t)
    put(w, emb, 'output.weight')
    write(w); print(f'wrote {a.out}: output.weight = a copy of token_embd.weight ({emb.tensor_type.name})')


def word_counts(a, n_vocab):
    if a.counts:
        c = json.load(open(a.counts))
        v = np.zeros(n_vocab, np.float64)
        for k, n in (c.items() if isinstance(c, dict) else enumerate(c)): v[int(k)] += float(n)
        return v
    if not a.calib: sys.exit('give --counts or --calib (with --llama-bin, the folder holding llama-tokenize)')
    if any(x in os.path.basename(a.calib).lower() for x in ('held-out', 'heldout', 'held_out')):
        sys.exit('refusing: --calib looks like a held-out set')
    exe = os.path.join(a.llama_bin or '.', 'llama-tokenize')
    out = subprocess.run([exe, '-m', a.base, '-f', a.calib, '--ids', '--log-disable', '--no-bos'],
                         capture_output=True, text=True, check=True).stdout
    ids = [int(x) for x in re.findall(r'-?\d+', out[out.index('['):] if '[' in out else out)]
    v = np.bincount(np.asarray(ids, dtype=np.int64), minlength=n_vocab)[:n_vocab].astype(np.float64)
    print(f'word counts: {len(ids):,} tokens of {a.calib}, {int((v > 0).sum()):,} distinct words', flush=True)
    return v


def load_imatrix_head(path, n_cols):
    if not path: return np.ones(n_cols, np.float64)
    r = GGUFReader(path); ts = tensors(r)
    s2 = ts.get('output.in_sum2') or ts.get('output.weight.in_sum2')
    if s2 is None:
        print('warning: imatrix has no output entry: every input counts the same', flush=True); return np.ones(n_cols, np.float64)
    c = ts.get('output.counts') or ts.get('output.weight.counts')
    n = float(np.asarray(c.data).reshape(-1)[0]) if c is not None else 1.0
    return np.asarray(s2.data, dtype=np.float64).reshape(-1)[:n_cols] / max(n, 1.0)


def cmd_plan(a):
    base = head_of(GGUFReader(a.base), a.base)
    n_cols, n_vocab = int(base.shape[0]), int(base.shape[1])
    cands = []
    for p in a.cand:
        t = head_of(GGUFReader(p), p)
        if (int(t.shape[0]), int(t.shape[1])) != (n_cols, n_vocab): sys.exit(f'{p}: head shape differs from --base')
        if t.tensor_type in NO_ROW_CUT: sys.exit(f'{p}: {t.tensor_type.name} has a per-tensor scale, rows can not be cut out')
        cands.append((p, t))
    counts = word_counts(a, n_vocab)
    eps = a.smooth * max(counts.sum(), 1.0) / n_vocab            # every word keeps a little weight: all of them --smooth
    freq = (counts + eps) / (counts + eps).sum()
    imp = load_imatrix_head(a.imatrix, n_cols)
    bands = split_bands(freq, a.bands, a.first)
    parts = []
    for b, rows in enumerate(bands):
        opts = []
        for p, t in cands:
            err = band_err(t, base, rows, freq, imp)
            opts.append({'type': t.tensor_type.name.lower(), 'bytes': int(rows_of(t)[0].nbytes) * len(rows), 'err': err,
                         'cand': p})
        parts.append({'name': f'band{b}', 'rows': rows, 'ladder': clean_ladder(opts), 'mass': float(freq[rows].sum())})
        print(f'band {b}: {len(rows):,} words, {100 * parts[-1]["mass"]:.2f}% of the text; ' +
              ', '.join(f"{o['type']} {o['err']:.3g}" for o in parts[-1]['ladder']), flush=True)
    if a.same_as:
        ref = next((t for p, t in cands if t.tensor_type.name.lower() == a.same_as.lower()), None)
        if ref is None: sys.exit(f'--same-as {a.same_as}: no candidate of that type')
        budget = int(rows_of(ref).nbytes)
    else:
        budget = int(a.head_bpw * n_cols * n_vocab / 8)
    used = pick(parts, budget - 4 * n_vocab) + 4 * n_vocab   # output.band_pos (4 bytes a word) rides in the budget
    one = {o['type']: o['err'] for p in parts for o in p['ladder']}
    ref_err = None
    if a.same_as:   # the same-size single-type head, for the report
        ref_t = a.same_as.lower()
        ref_err = 0.0
        for p in parts:
            o = next((o for o in p['ladder'] if o['type'] == ref_t), None)
            if o is None:   # dropped from a clean ladder: recompute from that candidate
                t = next(t for _, t in cands if t.tensor_type.name.lower() == ref_t)
                ref_err += band_err(t, base, p['rows'], freq, imp)
            else: ref_err += o['err']
    est = sum(p['ladder'][p['pick']]['err'] for p in parts)
    plan = {'n_vocab': n_vocab, 'n_embd': n_cols, 'budget_bytes': budget, 'used_bytes': used,
            'head_bpw': round(8 * used / (n_cols * n_vocab), 4), 'estimated_drift': est,
            'same_size_one_type': {'type': a.same_as, 'estimated_drift': ref_err} if a.same_as else None,
            'counts_from': a.counts or a.calib, 'imatrix': a.imatrix or None,
            'bands': [{'type': p['ladder'][p['pick']]['type'], 'cand': os.path.basename(p['ladder'][p['pick']]['cand']),
                       'words': len(p['rows']), 'text_share': round(p['mass'], 6), 'rows': [int(x) for x in p['rows']]}
                      for p in parts]}
    json.dump(plan, open(a.out, 'w'))
    for i, b in enumerate(plan['bands']): print(f'band {i}: {b["words"]:,} words ({100*b["text_share"]:.2f}%) -> {b["type"]}')
    msg = f'head {plan["head_bpw"]} bits a weight, {used:,} of {budget:,} bytes, estimated drift {est:.4g}'
    if ref_err is not None: msg += f' (one {a.same_as} head: {ref_err:.4g}, {100 * (1 - est / ref_err):+.1f}% less)' if ref_err else ''
    print(msg + f'\nplan {a.out}')


def cmd_apply(a):
    plan = json.load(open(a.plan))
    r = GGUFReader(a.gguf); ts = tensors(r)
    head = head_of(r, a.gguf)
    n_cols, n_vocab = int(head.shape[0]), int(head.shape[1])
    if (n_cols, n_vocab) != (plan['n_embd'], plan['n_vocab']): sys.exit('plan was made for another head shape')
    if 'output.scale' in ts or 'output.input_scale' in ts: sys.exit('this head has its own scales: not supported')
    if not 1 <= len(plan['bands']) <= MAX_BANDS: sys.exit(f'1 to {MAX_BANDS} bands')
    by_type = {}
    for p in a.cand:
        t = head_of(GGUFReader(p), p); by_type[t.tensor_type.name.lower()] = (p, t)
    pos = np.full(n_vocab, -1, np.int64); at = 0
    pieces = []
    for i, b in enumerate(plan['bands']):
        if b['type'] not in by_type: sys.exit(f'band {i} wants {b["type"]}: give a --cand with that head type')
        rows = np.asarray(b['rows'], dtype=np.int64)
        if (pos[rows] >= 0).any(): sys.exit(f'band {i} repeats a word')
        pos[rows] = at + np.arange(len(rows)); at += len(rows)
        pieces.append((by_type[b['type']][1], rows))
    if at != n_vocab or (pos < 0).any(): sys.exit('the bands do not hold every word exactly once')
    w = GGUFWriter(a.out, r.fields['general.architecture'].contents())
    copy_fields(r, w)
    w.add_uint32('lamplight.output_bands', len(pieces))
    for t in r.tensors:
        if t.name != 'output.weight': put(w, t)
    for i, (t, rows) in enumerate(pieces):
        raw = rows_of(t)[rows]
        if t.tensor_type in PLAIN_TYPES: raw = raw.view(np.float32 if t.tensor_type == Q.F32 else np.float16)
        w.add_tensor(f'output.band{i}.weight', raw, raw_dtype=t.tensor_type)
    w.add_tensor('output.band_pos', pos.astype(np.float32))
    write(w)
    # check: every word's row in the written file is its candidate's row, byte for byte
    chk = tensors(GGUFReader(a.out)); bad = 0
    for i, (t, rows) in enumerate(pieces):
        got = rows_of(chk[f'output.band{i}.weight']); bad += int((got != rows_of(t)[rows]).any(axis=1).sum())
    back = np.asarray(chk['output.band_pos'].data).astype(np.int64)
    if bad or not np.array_equal(back, pos): sys.exit(f'written file check FAILED ({bad} rows differ): do not use it')
    old, new = int(rows_of(head).nbytes), sum(int(rows_of(t)[0].nbytes) * len(rows) for t, rows in pieces)
    print(f'wrote {a.out}: head in {len(pieces)} bands, {new:,} bytes (was {old:,}, {head.tensor_type.name}); '
          f'every row checked. Loads in Lamplight 0150 only; keep {os.path.basename(a.gguf)} for other apps.')


def cmd_unband(a):
    r = GGUFReader(a.gguf); ts = tensors(r)
    if 'output.band0.weight' not in ts: sys.exit('not banded')
    ct = head_of(GGUFReader(a.cand[0]), a.cand[0])
    w = GGUFWriter(a.out, r.fields['general.architecture'].contents())
    copy_fields(r, w, skip=('lamplight.output_bands',))
    for t in r.tensors:
        if not t.name.startswith('output.band'): put(w, t)
    put(w, ct, 'output.weight')
    write(w); print(f'wrote {a.out}: one {ct.tensor_type.name} head, loads in every app')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('untie'); s.add_argument('--gguf', required=True); s.add_argument('--out', required=True)
    s = sub.add_parser('plan'); s.add_argument('--base', required=True); s.add_argument('--cand', action='append', required=True)
    s.add_argument('--imatrix', default=''); s.add_argument('--counts', default=''); s.add_argument('--calib', default='')
    s.add_argument('--llama-bin', default=''); s.add_argument('--bands', type=int, default=16)
    s.add_argument('--first', type=int, default=64, help='words in the top band')
    s.add_argument('--smooth', type=float, default=0.02, help="share of the weight spread over every word (unseen ones too)")
    g = s.add_mutually_exclusive_group(required=True)
    g.add_argument('--same-as', default=''); g.add_argument('--head-bpw', type=float, default=0.0)
    s.add_argument('--out', required=True)
    s = sub.add_parser('apply'); s.add_argument('--gguf', required=True); s.add_argument('--plan', required=True)
    s.add_argument('--cand', action='append', required=True); s.add_argument('--out', required=True)
    s = sub.add_parser('unband'); s.add_argument('--gguf', required=True); s.add_argument('--cand', action='append', required=True)
    s.add_argument('--out', required=True)
    for p in sub.choices.values(): p.add_argument('--llama-cpp', default='', help="use this checkout's gguf-py")
    a = ap.parse_args()
    {'untie': cmd_untie, 'plan': cmd_plan, 'apply': cmd_apply, 'unband': cmd_unband}[a.cmd](a)


if __name__ == '__main__':
    main()
