#!/usr/bin/env python3
# Brain Engine 0021 test: the expert trace read from kept copies (no eval callback, no ggml_set_output), on the tiny
# made-up mixture-of-experts brain from experts-per-word.py (16 experts, 2 per word, 4 layers, random weights).
#   python3 engine/tests/trace-kept.py <llama.cpp checkout with the patches, built> [work folder]
# Checks: the words and odds with the trace on are the same as off; the picks match the old way of reading them (the
# eval callback, still used when the mass is asked for) token for token and layer for layer; a prompt read in many
# small micro-batches is traced once per token, in order; turning the trace off and on again changes nothing.
# It runs on the processor, so it can't show the speed or the fused card kernel: that needs a card (see the cube check).
import json, os, subprocess, sys, tempfile, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: trace-kept.py <llama.cpp checkout with the patches, built> [work folder]')
WORK = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='kept-')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
import gguf
from gguf import GGUFReader, GGUFWriter, GGUFValueType
BIN = os.path.join(SRC, 'build', 'bin', 'llama-server')
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
exec(src[src.index('def make_moe'):src.index("MODEL = ")])
MODEL = os.path.join(WORK, 'moe-k2.gguf')
if not os.path.exists(MODEL): make_moe(MODEL)
L = 4

def start(port, extra=()):
    log = os.path.join(WORK, f'srv-{port}.log')
    p = subprocess.Popen([BIN, '-m', MODEL, '--port', str(port), '-c', '512', '-np', '1', '-t', '2', *extra],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'))
    for _ in range(200):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); return p
        except Exception: time.sleep(0.2)
    raise SystemExit('server did not start, see ' + log)
def req(port, body):
    r = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(r, timeout=120).read())
SHORT = 'The quick brown fox jumps over the lazy dog because'
LONG = ' '.join(['Once upon a time a small mouse kept a lantern in the old mill, and every night it counted the stars.'] * 6)
def gen(port, prompt, **extra):
    r = req(port, {'prompt': prompt, 'n_predict': 30, 'temperature': 0, 'n_probs': 3, 'cache_prompt': False, **extra})
    words = (r['tokens'] if 'tokens' in r else r['content'], [[round(t['logprob'], 4) for t in x['top_logprobs']] for x in r['completion_probabilities']])
    return words, r.get('expert_trace')
def picks(tr): return [row['e'] for row in tr['rows']] if tr and 'rows' in tr else None
ok = True
def check(name, cond):
    global ok; ok = ok and cond; print(('PASS ' if cond else 'FAIL ') + name)

for label, extra, port in (('one micro-batch', (), 18400), ('micro-batches of 16', ('-b', '512', '-ub', '16'), 18410)):
    p = start(port, extra)
    for pname, prompt in (('short', SHORT), ('long', LONG)):
        off, _ = gen(port, prompt)
        on, tr = gen(port, prompt, expert_trace=True)
        _, trm = gen(port, prompt, expert_trace=True, expert_trace_mass=True)  # the old way: the eval callback
        again, tr2 = gen(port, prompt, expert_trace=True)
        off2, _ = gen(port, prompt)
        rows = picks(tr)
        check(f'{label}, {pname}: trace on writes the same words and odds as off', on == off)
        check(f'{label}, {pname}: the picks match the eval-callback way, token by token and layer by layer ({len(rows or [])} rows)',
              rows is not None and rows == picks(trm))
        n_prompt = tr['n_prompt'] if tr else -1
        full = rows is not None and all(len(r[il]) == 2 for r in rows for il in range(L - 1))
        check(f'{label}, {pname}: every token traced once, in order, with 2 picks in each layer before the last ({n_prompt} prompt rows)',
              full and n_prompt > 0 and len(rows) - n_prompt in (len(on[1]) - 1, len(on[1])))
        check(f'{label}, {pname}: a second traced answer is the same, and off again is still the same', tr2 == tr and again == on and off2 == off)
    p.terminate(); p.wait()
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
