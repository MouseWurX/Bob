#!/usr/bin/env python3
# Brain Engine 0041 test: the hot-experts cache looking ahead while writing (LLAMA_MOE_LOOKAHEAD=M with
# --moe-cache-cpu-share 0): each layer guesses the next layer's experts with that layer's router and up to M guessed
# misses go up ahead. Only where the experts sit changes, never which are used, so the words must be identical, also
# with a guess that is wrong on purpose (LLAMA_MOE_LOOKAHEAD_SCRAMBLE). The cache needs a card, so a stand-in card runs
# on this machine (ggml-rpc-server; build the checkout with GGML_RPC=ON). The speed can only be seen on a real card.
#   python3 engine/tests/moe-lookahead.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-lookahead.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='lookahead-')
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
PORT = 50233
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def run(env, share='0'):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '--n-cpu-moe', '4',
                        '--moe-cache-mib', '1', '--moe-cache-cpu-share', share, '-f', prompt, '-n', '64', '-c', '2048', '-no-cnv',
                        '--temp', '0', '-t', '2', '-lv', '4'],
                       capture_output=True, text=True, errors='replace', env={**os.environ, 'LLAMA_MOE_CACHE_LOG_EVERY': '1000000', **env}, timeout=300)
    hits = re.findall(r'ubatch <= 8: hits = (\d+), misses = (\d+)', r.stderr)
    ahead = re.findall(r'looked ahead: (\d+) experts uploaded ahead \(([\d.]+) MiB\), (\d+) of them used', r.stderr)
    return r.returncode, r.stdout, r.stderr, (int(hits[-1][0]) if hits else -1), ((int(ahead[-1][0]), int(ahead[-1][2])) if ahead else (-1, -1))
try:
    code, base, err, hits0, _ = run({})
    check('the cache answers without looking ahead', code == 0 and hits0 >= 0, err[-300:])
    code, out, err, hits1, (up1, used1) = run({'LLAMA_MOE_LOOKAHEAD': '4', 'LLAMA_MOE_LOOKAHEAD_INLINE': '1'})
    check('looking ahead says it is on', 'looks ahead while writing' in err, err[-300:])
    check('experts go up ahead, and some of them are used', up1 > 0 and used1 > 0, f'{up1} up, {used1} used')
    check('the same words looking ahead', code == 0 and out == base)
    check('more hits looking ahead', hits1 > hits0, f'{hits1} vs {hits0}')
    code, out, err, hits2, (up2, used2) = run({'LLAMA_MOE_LOOKAHEAD': '4', 'LLAMA_MOE_LOOKAHEAD_INLINE': '1', 'LLAMA_MOE_LOOKAHEAD_SCRAMBLE': '1'})
    check('a wrong guess still gives the same words', code == 0 and out == base and up2 > 0, f'{up2} up')
    check('a wrong guess is used less than the router\'s', used2 * max(up1, 1) < used1 * max(up2, 1), f'{used2}/{up2} vs {used1}/{up1}')
    code, out, err, _, (up3, _) = run({'LLAMA_MOE_LOOKAHEAD': '4'})
    check('on a second stream: the same words (or NOT USED where the card has none)', code == 0 and out == base and (up3 > 0 or 'LOOKAHEAD NOT USED' in err), err[-300:])
    code, out, err, _, _ = run({'LLAMA_MOE_LOOKAHEAD': '4'}, share='1')
    check('with the CPU share above 0 it says NOT USED and answers the same as share 1', code == 0 and 'LOOKAHEAD NOT USED' in err)
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
