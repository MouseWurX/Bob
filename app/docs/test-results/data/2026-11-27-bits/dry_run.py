#!/usr/bin/env python3
# Dry run of bits by part (part_bits.py) and bits by word (word_bands.py) on the tiny trained Llama, CPU only.
# Every pick is held to the same byte budget; drift = llama-perplexity --kl-divergence on held-apart licence text.
import json, os, re, subprocess, sys
LC, HF, WORK, POD = sys.argv[1:5]
BIN = os.path.join(LC, 'build', 'bin'); PY = sys.executable
sys.path.insert(0, os.path.join(LC, 'gguf-py')); os.environ['PYTHONPATH'] = os.path.join(LC, 'gguf-py')
os.makedirs(WORK, exist_ok=True)
train, evalt = os.path.join(WORK, 'train.txt'), os.path.join(WORK, 'eval.txt')
def run(*a, **k):
    r = subprocess.run([str(x) for x in a], capture_output=True, text=True, errors='replace', **k)
    if r.returncode: print(r.stdout[-2000:], r.stderr[-3000:]); sys.exit(f'failed: {a[:3]}')
    return r
base = os.path.join(WORK, 'tiny-f32.gguf')
if not os.path.exists(base): run(PY, os.path.join(LC, 'convert_hf_to_gguf.py'), HF, '--outtype', 'f32', '--outfile', base)
imat = os.path.join(WORK, 'imatrix.gguf')
if not os.path.exists(imat): run(os.path.join(BIN, 'llama-imatrix'), '-m', base, '-f', train, '-o', imat, '-c', '128', '-t', '4', '--chunks', '200')
TYPES = ['q2_k', 'q3_k', 'q4_k', 'q5_k', 'q6_k', 'q8_0']
cand = {}
for t in TYPES:
    cand[t] = os.path.join(WORK, f'tiny-{t}.gguf')
    if not os.path.exists(cand[t]): run(os.path.join(BIN, 'llama-quantize'), '--pure', '--imatrix', imat, base, cand[t], t.upper())
CA = [x for t in TYPES for x in ('--cand', cand[t])]
kbase = os.path.join(WORK, 'base.kld')
PPL = [os.path.join(BIN, 'llama-perplexity'), '-f', evalt, '-c', '128', '-b', '128', '-t', '4']
if not os.path.exists(kbase): run(*PPL, '-m', base, '--kl-divergence-base', kbase)
def kld(m):
    out = run(*PPL, '-m', m, '--kl-divergence-base', kbase, '--kl-divergence'); s = out.stdout + out.stderr
    k = re.search(r'Mean\s+KLD:\s+([-0-9.]+)', s); t = re.search(r'Same top p:\s+([0-9.]+)', s)
    if not k: print(s[-3000:]); sys.exit('no KLD in output: ' + m)
    return {'kld': float(k.group(1)), 'same_top': float(t.group(1)), 'bytes': os.path.getsize(m)}
def quant(types_file, out):
    if not os.path.exists(out):
        run(os.path.join(BIN, 'llama-quantize'), '--imatrix', imat, '--tensor-type-file', types_file, base, out, 'Q4_K')
    return out
res = {}
for t in ('q3_k', 'q4_k'): res[f'plain {t}'] = kld(cand[t])
# budget: a q3_k file's counted tensors (token_embd kept q6_k by the pickers: excluded from the count)
target = sum(1 for _ in [0])
from gguf import GGUFReader
q3 = {t.name: t for t in GGUFReader(cand['q3_k']).tensors}
live = [n for n, t in q3.items() if len(t.shape) >= 2 and n != 'token_embd.weight']
import numpy as np
budget = sum(int(np.asarray(q3[n].data).nbytes) for n in live)
print('budget bytes', budget)
picks = {
  'mixed_bits (imatrix rounding, old greedy)': None,
  'part_bits imatrix (same measure, hull pick)': ['--loss', 'imatrix', '--imatrix', imat],
  'part_bits fisher (bits by part)': ['--teacher', HF, '--calib', train, '--chunks', '48', '--ctx', '128'],
  'part_bits fisher + 8 bands (part + word)': ['--teacher', HF, '--calib', train, '--chunks', '48', '--ctx', '128', '--bands', '8'],
}
for name, args in picks.items():
    tag = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:40]
    tf = os.path.join(WORK, tag + '.types.txt')
    if args is None:
        n_w = sum(int(np.prod([int(x) for x in q3[n].shape])) for n in live)
        run(PY, os.path.join(POD, 'mixed_bits.py'), '--base', base, '--imatrix', imat, *CA, '--target-bpw', str(8 * budget / n_w),
            '--exclude-type', 'q6_k', '--out', tf)
    else:
        rep = run(PY, os.path.join(POD, 'part_bits.py'), '--base', base, *CA, *args, '--target-bytes', str(budget),
                  '--exclude-type', 'q6_k', '--out', tf, '--report', os.path.join(WORK, tag + '.report.json'), '--llama-cpp', LC)
    out = quant(tf, os.path.join(WORK, tag + '.gguf'))
    bands = os.path.splitext(tf)[0] + '-bands.json'
    if args and '--bands' in args:
        bo = os.path.join(WORK, tag + '.banded.gguf')
        run(PY, os.path.join(POD, 'word_bands.py'), 'apply', '--gguf', out, '--plan', bands, *CA, '--out', bo, '--llama-cpp', LC)
        out = bo
    res[name] = kld(out); res[name]['est'] = json.load(open(os.path.join(WORK, tag + '.report.json')))['estimated_drift'] if args else None
    print(name, res[name], flush=True)
# bits by word alone: the plain q3_k file with its head re-banded at the same head size (no teacher: word counts)
counts = os.path.join(WORK, 'counts.json')
tok = run(os.path.join(BIN, 'llama-tokenize'), '-m', base, '-f', train, '--ids', '--log-disable', '--no-bos')
ids = [int(x) for x in re.findall(r'\d+', tok.stdout)]
u, c = np.unique(ids, return_counts=True); json.dump({str(int(a)): int(b) for a, b in zip(u, c)}, open(counts, 'w'))
plan = os.path.join(WORK, 'q3-head-plan.json')
run(PY, os.path.join(POD, 'word_bands.py'), 'plan', '--base', base, *CA, '--imatrix', imat, '--counts', counts, '--bands', '8',
    '--same-as', 'q3_k', '--out', plan, '--llama-cpp', LC)
bo = os.path.join(WORK, 'q3-head-banded.gguf')
run(PY, os.path.join(POD, 'word_bands.py'), 'apply', '--gguf', cand['q3_k'], '--plan', plan, *CA, '--out', bo, '--llama-cpp', LC)
res['plain q3_k, head in 8 bands same size (word counts)'] = kld(bo)
res['plain q3_k, head in 8 bands same size (word counts)']['bands'] = [(b['words'], b['type']) for b in json.load(open(plan))['bands']]
json.dump(res, open(os.path.join(WORK, 'results.json'), 'w'), indent=1)
for k, v in res.items(): print(f'{k:55s} KLD {v["kld"]:.5f}  same top {v["same_top"]:.2f}%  {v["bytes"]:,} bytes')
