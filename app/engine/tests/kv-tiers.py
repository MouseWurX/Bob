#!/usr/bin/env python3
# Brain Engine 0039 test: Progressive Memory (LLAMA_KV_TIERS), off unless set. The chat memory keeps every word at its
# own type (-ctk/-ctv, e.g. q3_0) and the newest words again at sharper types in rings; attention reads each word from
# the sharpest copy that has it: merged part by part while writing one word, laid over the main cache while reading a
# batch. The checks that can see a fault: a ring as sharp as f16 that holds the whole chat must give f16's words even
# over a q3_0 cache, and a ring of the cache's own type must give the plain cache's words. Drift on the random brain
# must sit between the ring's type and the cache's. Real numbers come from the PC.
#   python3 engine/tests/kv-tiers.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
# It needs llama-completion, llama-perplexity, test-quantize-fns and ggml-rpc-server in <checkout>/build/bin.
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: kv-q3.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='kvtiers-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
# head size 64, so the chat memory is rotated and quantized as on a real brain, and 4,096 cells
exec(src[src.index('def make_moe'):src.index("MODEL = ")].replace('HD, FF = 16, 4, 64, 4, 2, 16, 32', 'HD, FF = 16, 4, 64, 4, 2, 64, 32')
     .replace('add_context_length(512)', 'add_context_length(4096)'))
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-hd64-4k.gguf')
if not os.path.exists(brain): make_moe(brain)
prompt = os.path.join(WORK, 'prompt.txt')
with open(prompt, 'w') as f: f.write(' '.join(f'word{i % 37} x{i % 11}' for i in range(300)))
text = os.path.join(WORK, 'kld.txt')
with open(text, 'w') as f:
    rng = np.random.default_rng(1)
    f.write(' '.join(f'word{int(a)} x{int(b)}' for a, b in zip(rng.integers(0, 37, 3000), rng.integers(0, 11, 3000))))
PORT = 50242
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def run(k, v, tiers=None, card=False, extra=(), env=None, n=48):
    e = {**os.environ, **(env or {})}
    e.pop('LLAMA_KV_TIERS', None)
    if tiers: e['LLAMA_KV_TIERS'] = tiers
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, *(('--rpc', f'127.0.0.1:{PORT}', '-ngl', '99') if card else ('-ngl', '0')),
                        '-f', prompt, '-n', str(n), '-c', '2048', '-b', '512', '-ub', '512', '-fa', 'on', '-ctk', k, '-ctv', v,
                        '-no-cnv', '--temp', '0', '-t', '2', '-lv', '4', *extra],
                       capture_output=True, text=True, errors='replace', env=e, timeout=600)
    return r.returncode, r.stdout, r.stderr
def kld(kv, tiers=None):
    e = {**os.environ}
    e.pop('LLAMA_KV_TIERS', None)
    if tiers: e['LLAMA_KV_TIERS'] = tiers
    r = subprocess.run([os.path.join(BIN, 'llama-perplexity'), '-m', brain, '-f', text, '-c', '1024', '-b', '1024', '-fa', 'on', '-t', '2',
                        '-ctk', kv, '-ctv', kv, '--kl-divergence-base', os.path.join(WORK, 'base.kld'), '--kl-divergence'],
                       capture_output=True, text=True, errors='replace', env=e, timeout=900)
    m = re.search(r'Mean +KLD: +([0-9.]+)', r.stdout + r.stderr)
    return (float(m.group(1)) if m else None), r.stdout + r.stderr
# a quantized cache turns K and V (and the question) before storing them, so a ring holds turned numbers; rounded to
# f16 they differ from unturned f16 by a hair, and this random brain has near-ties that a hair flips. The exact checks
# turn that off, which changes nothing for f16.
NOROT = {'LLAMA_ATTN_ROT_DISABLE': '1'}
try:
    code, f16, err = run('f16', 'f16')
    check('f16 answers', code == 0, err[-300:])
    code, q3, err = run('q3_0', 'q3_0')
    check('q3_0 answers, and its words differ from f16 (else the checks below see nothing)', code == 0 and q3 != f16, err[-300:])
    # an f16 ring as big as the chat: every word is read sharp, so q3_0 underneath must not show
    code, a, err = run('q3_0', 'q3_0', 'f16:1792')
    code, a, _ = run('q3_0', 'q3_0', 'f16:1792', env=NOROT)
    check('Progressive Memory says what it keeps', 'Progressive Memory: every word at q3_0/q3_0, again at f16 for the newest 1792' in err, err[-400:])
    check('reading uses the overlay and writing the merge', 'laid over the cache' in err and 'merged' in err, err[-400:])
    check('an f16 ring holding the whole chat gives f16\'s words over a q3_0 cache', code == 0 and a == f16, err[-300:])
    code, b, err = run('q3_0', 'q3_0', 'f16:1792', card=True, env=NOROT)
    check('the same on the stand-in card', code == 0 and b == f16, err[-300:])
    # a ring of the cache's own type: the merge and the overlay change nothing
    code, c, err = run('q8_0', 'q8_0')
    code2, d, err2 = run('q8_0', 'q8_0', 'q8_0:256')
    check('a q8_0 ring over a q8_0 cache gives the plain words (the merge is exact)', code2 == 0 and c == d, err2[-300:])
    # a small sharp window: the words move toward f16 but the chat still runs past the window
    code, e3, err = run('q3_0', 'q3_0', 'f16:64,q8_0:256')
    check('three steps (f16, q8_0, then q3_0) answer', code == 0 and 'f16 for the newest 64, q8_0 for the newest 256' in err, err[-400:])
    code2, e4, err2 = run('q3_0', 'q3_0', 'f16:64,q8_0:256', card=True)
    check('three steps: the same words on the stand-in card', code2 == 0 and e3 == e4, err2[-300:])
    # a batch bigger than the slack reads the main cache, and the words are still written sharp
    code, g, err = run('q3_0', 'q3_0', 'f16:1792', env={'LLAMA_KV_TIERS_SLACK': '256'})
    check('a batch bigger than the slack reads the main cache, then writing is sharp again', code == 0 and 'bigger than LLAMA_KV_TIERS_SLACK' in err, err[-400:])
    # refusals
    for why, tiers, args, want in (('no flash attention', 'f16:256', ('-fa', 'off', '-ctk', 'f16', '-ctv', 'f16', '-c', '2048'), 'it needs flash attention'),
                                   ('two chats', 'f16:256', ('-fa', 'on', '-np', '2', '-c', '4096'), 'one chat at a time'),
                                   ('a window as big as the context', 'f16:4096', ('-fa', 'on', '-c', '2048'), 'not bigger than the biggest window'),
                                   ('windows out of order', 'q8_0:512,f16:64', ('-fa', 'on', '-c', '2048'), 'bigger than the one before')):
        r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, '-ngl', '0', '-f', prompt, '-n', '4', '-no-cnv', '--temp', '0', '-t', '2', *args],
                           capture_output=True, text=True, errors='replace', env={**os.environ, 'LLAMA_KV_TIERS': tiers}, timeout=600)
        check(f'NOT USED, and says why: {why}', 'LLAMA_KV_TIERS=' in r.stderr and 'NOT USED' in r.stderr and want in r.stderr and r.returncode == 0, r.stderr[-300:])
    # drift on the random brain: a q8_0 window over q3_0 sits between q8_0 and q3_0
    subprocess.run([os.path.join(BIN, 'llama-perplexity'), '-m', brain, '-f', text, '-c', '1024', '-b', '1024', '-fa', 'on', '-t', '2',
                    '--kl-divergence-base', os.path.join(WORK, 'base.kld')], capture_output=True, timeout=900)
    k8, _ = kld('q8_0'); k3, _ = kld('q3_0'); kt, out = kld('q3_0', 'q8_0:256')
    check('drift: q8_0 < q3_0 with a q8_0 window of 256 < plain q3_0', None not in (k8, k3, kt) and k8 < kt < k3, f'{k8} {kt} {k3} {out[-300:]}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
