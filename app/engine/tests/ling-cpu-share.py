#!/usr/bin/env python3
# Ling 3 (bailingmoe3) through the MoE cache with the misses on the processor (--moe-cache-cpu-share), on a stand-in card
# (ggml-rpc-server), with a tiny made-up Ling from test-llama-archs (16 experts, 4 used, KDA + MLA). On the stand-in the
# card and the processor compute alike, so every share must give the same words as no cache at all; on a real card the
# processor's experts can differ in the last bits (engine/ENGINE-MAP.md 0040). Ling 3.2 Air clamps its expert SwiGLU in
# its last layers (expert_swiglu_limit_list), so the tiny brain's clamps are set low enough to bite, and a run with them
# off shows they change the words: a processor part that skipped the clamp would then show up here.
#   python3 engine/tests/ling-cpu-share.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: ling-cpu-share.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='lingshare-')
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
from gguf import GGUFReader
os.makedirs(WORK, exist_ok=True)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok

def make(limit):
    out = os.path.join(WORK, f'clamp-{limit}')
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'bailingmoe3-moe.gguf')
    if not os.path.exists(path):
        subprocess.run([os.path.join(BIN, 'test-llama-archs'), '-a', '^bailingmoe3$', '-s', '7', '-d', '0.3', '-o', out], check=True,
                       capture_output=True, env={**os.environ, 'TLA_EXPERTS': '16', 'TLA_USED': '4'})
        r = GGUFReader(path, 'r+')
        for key in ('bailingmoe3.swiglu_clamp_exp', 'bailingmoe3.swiglu_clamp_shexp'):
            f = r.fields[key]
            for i in f.data[1:]:  # layer 0 is dense; the MoE layers get the limit
                f.parts[i][0] = limit
        for t in r.tensors:  # the made-up router bias is a ramp (0, 2, ... 30) that always picks the last 4 experts
            if t.name.endswith('exp_probs_b.bias'):
                t.data[:] = 0
        assert r.fields['bailingmoe3.expert_count'].contents() == 16, r.fields['bailingmoe3.expert_count'].contents()
    return path

PORT = 50271
PROMPT = ' '.join(chr(97 + (i * 7919) % 26) * (1 + i % 3) for i in range(60))
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
def run(brain, *extra, n='96'):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, '--rpc', f'127.0.0.1:{PORT}', '-ngl', '99',
                        '-p', PROMPT, '-n', n, '-c', '1024', '-no-cnv', '--temp', '0', '-t', '2',
                        '--ignore-eos', '-lv', '4', *extra], capture_output=True, text=True, errors='replace', timeout=600,
                       env={**os.environ, 'LLAMA_MOE_CACHE_LOG_EVERY': '1000000'})
    return r.returncode, r.stdout, r.stderr
try:
    clamped, loose = make(0.05), make(0.0)
    code, base, err = run(clamped)
    check('the tiny Ling answers on the stand-in card', code == 0 and len(base) > 40, err[-400:])
    _, off, _ = run(loose)
    check('the low clamps change the words (so a missing clamp would show)', off != base)
    for share in ('0', '0.5', '1'):
        code, out, err = run(clamped, '--n-cpu-moe', '99', '--moe-cache-mib', '3', '--moe-cache-cpu-share', share)
        check(f'MoE cache, {share} of the misses on the processor: same words as no cache', code == 0 and out == base,
              err[-400:] if code else 'words differ')
        on_cpu = sum(int(x) for x in re.findall(r'misses = \d+ \((\d+) on the CPU\)', err))
        print(f'    misses on the processor: {on_cpu}')
        if share != '0':
            check(f'MoE cache, share {share}: some misses really ran on the processor', on_cpu > 0)
    code, out, err = run(clamped, '--n-cpu-moe', '99', '--moe-cache-mib', '3', '--moe-cache-cpu-share', '0.5', '-b', '8', '-ub', '8')
    check('the same with an 8-token reading step (prompt read through the cache in pieces)', code == 0 and out == base, err[-400:] if code else 'words differ')
finally:
    rpc.kill()
print('all passed' if fails == 0 else f'{fails} failed')
sys.exit(1 if fails else 0)
