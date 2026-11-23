#!/usr/bin/env python3
# Brain Engine 0033 test: the overlap log (GGML_SCHED_OVERLAP_LOG=N) says how often the processor's expert pieces run
# while the card works, and changes nothing: the same words with it on and off; NOT USED with GGML_SCHED_TIMING. The cache needs a card, so a
# stand-in card runs on this machine (ggml-rpc-server; build the checkout with GGML_RPC=ON). On the stand-in the card
# and the processor compute alike, so the words must be identical; on a real card the processor's experts can differ
# in the last bits, as with --moe-cache-cpu-share itself.
#   python3 engine/tests/sched-overlap.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: sched-overlap.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='overlap-')
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
PORT = 50236
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def run(env):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '--n-cpu-moe', '4',
                        '--moe-cache-mib', '3', '--moe-cache-cpu-share', '1', '-f', prompt, '-n', '48', '-c', '2048', '-no-cnv', '--temp', '0', '-t', '2'],
                       capture_output=True, text=True, errors='replace', env={**os.environ, **env}, timeout=300)
    m = re.findall(r'overlap, writing \(1 token\): (\d+) graphs.*?: ([0-9.]+) processor pieces \(([0-9.]+) with', r.stderr)
    return r.returncode, r.stdout, r.stderr, m
try:
    code, base, err, m = run({})
    check('it answers with the log off, and says nothing', code == 0 and not m, err[-300:])
    code, out, err, m = run({'GGML_SCHED_OVERLAP_LOG': '20'})
    check('the log prints for writing', len(m) >= 1, err[-300:])
    check('processor pieces are counted, some fetched ahead', bool(m) and float(m[-1][1]) > 0 and float(m[-1][2]) > 0, f'{m[-1:]}')
    check('the same words with the log on', code == 0 and out == base)
    code, out, err, m = run({'GGML_SCHED_OVERLAP_LOG': '20', 'GGML_SCHED_TIMING': '20'})
    check('with the timing log it says NOT USED and answers the same', code == 0 and 'OVERLAP_LOG NOT USED' in err and not m and out == base)
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
