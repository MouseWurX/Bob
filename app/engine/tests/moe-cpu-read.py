#!/usr/bin/env python3
# Brain Engine 0032 test: prompts of 33 to N tokens read through the hot-experts cache with every miss on the processor
# (LLAMA_MOE_CACHE_CPU_READ=N): nothing is uploaded for them and the words are the same. The cache needs a card, so a
# stand-in card runs on this machine (ggml-rpc-server; build the checkout with GGML_RPC=ON). On the stand-in the card
# and the processor compute alike, so the words must be identical; on a real card the processor's experts can differ
# in the last bits, as with --moe-cache-cpu-share itself.
#   python3 engine/tests/moe-cpu-read.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-cpu-read.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='cpuread-')
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
PORT = 50234
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def run(env, share='1', mib='3'):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '--n-cpu-moe', '4',
                        '--moe-cache-mib', mib, '--moe-cache-cpu-share', share, '-f', prompt, '-n', '48', '-c', '2048', '-b', '512', '-ub', '512',
                        '-no-cnv', '--temp', '0', '-t', '2', '-lv', '4'],
                       capture_output=True, text=True, errors='replace', env={**os.environ, 'LLAMA_MOE_CACHE_LOG_EVERY': '1000000', **env}, timeout=300)
    m = re.findall(r'prompts read with misses on the CPU: hits = (\d+), misses = (\d+) \((\d+) on the CPU\), hit rate = [0-9.]+%, uploaded = ([0-9.]+) MiB', r.stderr)
    return r.returncode, r.stdout, r.stderr, (tuple(float(x) for x in m[-1]) if m else None)
try:
    code, base, err, rd = run({})
    check('the cache answers with it off', code == 0 and rd is None, err[-300:])
    for share in ('0', '1'):
        code, out, err, rd = run({'LLAMA_MOE_CACHE_CPU_READ': '512'}, share)
        check(f'share {share}: it says it is on', 'every miss on the processor' in err)
        check(f'share {share}: the prompt goes through the cache', rd is not None and rd[1] > 0, f'{rd}')
        check(f'share {share}: every prompt miss on the processor, nothing uploaded', rd is not None and rd[1] == rd[2] and rd[3] == 0.0, f'{rd}')
        check(f'share {share}: the same words', code == 0 and out == base)
    code, out, err, rd = run({'LLAMA_MOE_CACHE_CPU_READ': '16'})
    check('a value of 32 or less says NOT USED and answers the same', code == 0 and 'CPU_READ=16 NOT USED' in err and rd is None and out == base)
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
