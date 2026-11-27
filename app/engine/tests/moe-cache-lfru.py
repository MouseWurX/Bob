#!/usr/bin/env python3
# Brain Engine 0107 test: the MoE cache in LFRU order (LLAMA_MOE_CACHE_ORDER=lfru), for the card's cache and the RAM
# cache (0060). The order only changes which experts the caches keep, never which are used, so with every miss going up
# (share 0) the words must be identical; with the CPU share 0.5 the processor computes other misses, which on this
# stand-in card (the processor too) gives the same numbers, so the words must match there too (on a real card the
# processor's misses can differ in the last bits, as with the share itself). The ten-layer brain of
# moe-lookahead-deep.py, a cache far smaller than its experts, on a stand-in card (ggml-rpc-server, GGML_RPC=ON).
#   python3 engine/tests/moe-cache-lfru.py <llama.cpp checkout, built> [work folder] [bin folder of the build before 0107]
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-cache-lfru.py <llama.cpp checkout, built> [work folder] [old bin]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='lfru-')
OLD = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else None
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
EXE = '.exe' if os.name == 'nt' else ''
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'moe-lookahead-deep.py'), encoding='utf-8').read().replace('\r\n', '\n')
exec(src[src.index('def make_deep'):src.index('os.makedirs(WORK')])
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-deep.gguf')
if not os.path.exists(brain): make_deep(brain)
prompt = os.path.join(WORK, 'prompt.txt')
with open(prompt, 'w') as f: f.write(' '.join(f'word{i}' for i in range(120)))
PORT = 50238
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server' + EXE), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def run(env, share='0', bin_dir=BIN, extra=()):
    r = subprocess.run([os.path.join(bin_dir, 'llama-completion' + EXE), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '--n-cpu-moe', '10',
                        '--moe-cache-mib', '1', '--moe-cache-cpu-share', share, '-f', prompt, '-n', '300', '-c', '2048', '-no-cnv',
                        '--temp', '0', '-t', '2', '-lv', '4', *extra],
                       capture_output=True, text=True, errors='replace', env={**os.environ, 'LLAMA_MOE_CACHE_LOG_EVERY': '1000000', **env}, timeout=600)
    hits = re.findall(r'ubatch <= 8: hits = (\d+), misses = (\d+)', r.stderr)
    lf = re.findall(r'LFRU order: card (\d+) moved to protected, (\d+) back to probation; RAM cache (\d+) protected, (\d+) back', r.stderr)
    return r.returncode, r.stdout, r.stderr, (int(hits[-1][0]) if hits else -1), (tuple(map(int, lf[-1])) if lf else None)
LF = {'LLAMA_MOE_CACHE_ORDER': 'lfru'}
try:
    for share in ('0', '0.5'):
        code, base, err, h0, _ = run({}, share)
        check(f'share {share}: the cache answers in its own order', code == 0 and h0 >= 0, err[-300:])
        if OLD:
            code, out, err, _, _ = run({}, share, bin_dir=OLD)
            check(f'share {share}: without LFRU, the words of the build before 0107', code == 0 and out == base, err[-300:])
        code, out, err, h1, lf = run(LF, share)
        check(f'share {share}: LFRU says it is on', 'MoE cache order: LFRU' in err, err[-300:])
        check(f'share {share}: LFRU gives the same words', code == 0 and out == base, err[-300:])
        check(f'share {share}: slots move to protected and back', lf is not None and lf[0] > 0 and lf[1] > 0, str(lf))
        print(f'      share {share}: hits {h0} in the old order, {h1} in LFRU order')
        code, out, err, _, _ = run({**LF, 'LLAMA_MOE_CACHE_LFRU_PROTECT': '0.3', 'LLAMA_MOE_CACHE_LFRU_WINDOW': '2'}, share)
        check(f'share {share}: a small protected part and window: the same words', code == 0 and out == base and '30% of the slots' in err, err[-300:])
        code, out, err, _, lf = run({**LF, 'LLAMA_MOE_CACHE_LFRU_PROTECT': '0'}, share)
        check(f'share {share}: nothing protected: the same words, nothing moves to protected', code == 0 and out == base and lf is not None and lf[0] == 0, str(lf))
    code, base, err, _, _ = run({'LLAMA_MOE_CACHE_LEARN': '4', 'LLAMA_MOE_CACHE_LEARN_MARGIN': '1'}, '0.5')
    code2, out, err, _, _ = run({**LF, 'LLAMA_MOE_CACHE_LEARN': '4', 'LLAMA_MOE_CACHE_LEARN_MARGIN': '1'}, '0.5')
    check('with the learning cache (0031): the same words', code == 0 and code2 == 0 and out == base and 'experts came in' in err, err[-300:])
    code, base, err, _, _ = run({'LLAMA_MOE_DOORBELL': '1', 'LLAMA_MOE_DOORBELL_CPU_RING': '1'}, '0.5')
    code2, out, err, _, _ = run({**LF, 'LLAMA_MOE_DOORBELL': '1', 'LLAMA_MOE_DOORBELL_CPU_RING': '1'}, '0.5')
    check('with the doorbell (0042, the processor\'s ring): the same words', code == 0 and code2 == 0 and out == base and 'rings a doorbell' in err, err[-300:])
    la = {'LLAMA_MOE_LOOKAHEAD': '4', 'LLAMA_MOE_LOOKAHEAD_DEPTH': '1,2,4'}
    code, base, err, _, _ = run(la)
    code2, out, err, _, _ = run({**LF, **la})
    check('with the look-ahead 1, 2 and 4 deep (0106): the same words', code == 0 and code2 == 0 and out == base, err[-300:])
    ram = {'LLAMA_MOE_DRIVE': '1', 'LLAMA_MOE_RAM_CACHE_MIB': '2'}
    code, base, err, _, _ = run(ram)
    code2, out, err, _, lf = run({**LF, **ram})
    check('with the RAM cache (0060): it is on', 'RAM cache on' in err, err[-400:])
    check('with the RAM cache: the same words', code == 0 and code2 == 0 and out == base, err[-300:])
    check('the RAM cache protects entries used twice', lf is not None and lf[2] > 0, str(lf))
    code, out, err, _, _ = run({'LLAMA_MOE_CACHE_ORDER': 'mru'})
    check('a bad order: NOT USED, the old order', 'LLAMA_MOE_CACHE_ORDER=mru NOT USED' in err and code == 0, err[-300:])
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
