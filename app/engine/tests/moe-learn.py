#!/usr/bin/env python3
# Brain Engine 0031 test: the hot-experts cache learning while writing (LLAMA_MOE_CACHE_LEARN=N with
# --moe-cache-cpu-share 1) lets clearly busier experts in and gives the same words. The cache needs a card, so a
# stand-in card runs on this machine (ggml-rpc-server; build the checkout with GGML_RPC=ON). On the stand-in the card
# and the processor compute alike, so the words must be identical; on a real card the processor's experts can differ
# in the last bits, as with --moe-cache-cpu-share itself.
#   python3 engine/tests/moe-learn.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-learn.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='learn-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
exec(src[src.index('def make_moe'):src.index("MODEL = ")])
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-k2.gguf')
if not os.path.exists(brain): make_moe(brain)
prompt = os.path.join(WORK, 'prompt.txt')
with open(prompt, 'w') as f: f.write(' '.join(f'word{i}' for i in range(250)))
PORT = 50231
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def run(env, share='1'):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '--n-cpu-moe', '4',
                        '--moe-cache-mib', '1', '--moe-cache-cpu-share', share, '-f', prompt, '-n', '64', '-c', '2048', '-no-cnv',
                        '--temp', '0', '-t', '2', '-lv', '4'],
                       capture_output=True, text=True, errors='replace', env={**os.environ, 'LLAMA_MOE_CACHE_LOG_EVERY': '1000000', **env}, timeout=300)
    hits = re.findall(r'ubatch <= 8: hits = (\d+), misses = (\d+)', r.stderr)
    learned = re.findall(r'learned while writing: (\d+) experts', r.stderr)
    return r.returncode, r.stdout, r.stderr, (int(hits[-1][0]) if hits else -1), (int(learned[-1]) if learned else -1)
try:
    code, base, err, hits0, _ = run({})
    check('the cache answers without learning', code == 0 and hits0 >= 0, err[-300:])
    code, out, err, hits1, n1 = run({'LLAMA_MOE_CACHE_LEARN': '4'})
    check('learning says it is on', 'learns while writing' in err)
    check('learning lets experts in', n1 > 0, f'{n1}')
    check('the same words with learning on', code == 0 and out == base)
    check('no fewer hits with learning on', hits1 >= hits0, f'{hits1} vs {hits0}')
    code, out, err, _, n2 = run({'LLAMA_MOE_CACHE_LEARN': '1', 'LLAMA_MOE_CACHE_LEARN_MARGIN': '1'})
    check('an eager setting lets more in and still gives the same words', code == 0 and n2 > n1 and out == base, f'{n2} vs {n1}')
    code, out, err, _, _ = run({'LLAMA_MOE_CACHE_LEARN': '4'}, share='0')
    check('with the CPU share at 0 it says NOT USED and answers the same', code == 0 and 'LEARN NOT USED' in err and out == base)
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
