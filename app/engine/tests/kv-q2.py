#!/usr/bin/env python3
# Brain Engine 0046 test: q2_kv, a 2.5-bit chat memory type (-ctk q2_kv -ctv q2_kv), off unless asked for. It is 10
# bytes for 32 values against q4_0's 18, so the chat memory is 44% smaller. (Upstream's q2_0 is another type, made for
# brain files; the engine still refuses it for the chat memory.) The test runs:
#   - test-quantize-fns' q2_kv lines and kv-q2-check.cpp (ggml, the processor): the card's unpacking against the plain
#     reference for every byte, the card's numbers bit for bit, the quantizer, the dot product, and flash attention
#     with q2_kv K and V (and mixed with f16, q8_0, q4_0 and q3_0) against attention in double;
#   - a tiny made-up brain on this machine's processor and on a stand-in card (ggml-rpc-server; build the checkout with
#     GGML_RPC=ON), where the card and the processor compute alike, so the words must match between the two;
#   - Progressive Memory (0039 / 0045) over a q2_kv main cache, the target setting being q2_kv with
#     LLAMA_KV_TIERS=q8_0:8192 (here q8_0:256, the tiny brain's context being short), and the chat memory split (0036);
#   - drift (llama-perplexity --kl-divergence against f16): q8_0 < q4_0 < q3_0 < q2_kv, and the sharp ring brings
#     q2_kv's down. The random tiny brain only shows the order, never by how much a real brain would drift: it blows
#     every rounding up (q4_0 already changes the top word half the time), so there is no bar on q2_kv's size here.
#   python3 engine/tests/kv-q2.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
# It needs llama-completion, llama-perplexity, test-quantize-fns and ggml-rpc-server in <checkout>/build/bin, and a C++
# compiler.
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: kv-q2.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='kvq2-')
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
# the brain of kv-q3.py: head size 64, so the chat memory is rotated and quantized as on a real brain, and 4,096 cells
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
PORT = 50246
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''), flush=True)
    fails += not ok
def env_for(tiers, extra):
    e = {**os.environ, **(extra or {})}
    e.pop('LLAMA_KV_TIERS', None)
    if tiers: e['LLAMA_KV_TIERS'] = tiers
    return e
def run(k, v, card, tiers=None, env=None):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, *(('--rpc', f'127.0.0.1:{PORT}', '-ngl', '99') if card else ('-ngl', '0')),
                        '-f', prompt, '-n', '48', '-c', '2048', '-b', '512', '-ub', '512', '-fa', 'on', '-ctk', k, '-ctv', v,
                        '-no-cnv', '--temp', '0', '-t', '2', '-lv', '4'],
                       capture_output=True, text=True, errors='replace', env=env_for(tiers, env), timeout=600)
    m = re.search(r'llama_kv_cache: size = +([0-9.]+) MiB', r.stderr)
    return r.returncode, r.stdout, r.stderr, (float(m.group(1)) if m else None)
def kld(kv, tiers=None):
    r = subprocess.run([os.path.join(BIN, 'llama-perplexity'), '-m', brain, '-f', text, '-c', '1024', '-b', '1024', '-fa', 'on', '-t', '2',
                        '-ctk', kv, '-ctv', kv, '--kl-divergence-base', os.path.join(WORK, 'base.kld'), '--kl-divergence'],
                       capture_output=True, text=True, errors='replace', env=env_for(tiers, None), timeout=900)
    m = re.search(r'Mean +KLD: +(-?[0-9.]+)', r.stdout + r.stderr)
    t = re.search(r'Same top p: +([0-9.]+)', r.stdout + r.stderr)
    return (float(m.group(1)) if m else None), (float(t.group(1)) if t else None)
try:
    # ggml's own check of the type: quantize error, the reference, and the processor's dot product with q8_0
    r = subprocess.run([os.path.join(BIN, 'test-quantize-fns'), '-v'], capture_output=True, text=True, errors='replace', timeout=600)
    q2 = [l for l in (r.stdout + r.stderr).splitlines() if l.strip().startswith('q2_kv')]
    check('test-quantize-fns: q2_kv quantize, reference and dot product all ok', len(q2) == 3 and all(': ok' in l or ' ok ' in l for l in q2), '; '.join(q2))
    for l in q2: print('  ' + l.strip())

    # the type on its own (ggml, the processor)
    exe = os.path.join(WORK, 'kv-q2-check')
    subprocess.check_call(['c++', '-std=c++17', '-O2', os.path.join(HERE, 'kv-q2-check.cpp'), '-o', exe,
                           '-I', os.path.join(SRC, 'ggml', 'include'), '-L', BIN, '-lggml', '-lggml-base', '-lggml-cpu', f'-Wl,-rpath,{BIN}'])
    r = subprocess.run([exe], capture_output=True, text=True, timeout=600)
    print('\n'.join('  ' + l for l in r.stdout.splitlines() if not l.startswith('PASS')))
    check('kv-q2-check: ' + (r.stdout.strip().splitlines() or ['no output'])[-1], r.returncode == 0 and 'ALL PASS' in r.stdout, r.stdout[-600:] + r.stderr[-300:])

    # the card's kernels use the unpacking checked above, and the card's quantizer rounds as the processor's
    with open(os.path.join(SRC, 'ggml/src/ggml-cuda/fattn-common.cuh'), encoding='utf8') as f: fa = f.read().replace('\r\n', '\n')
    with open(os.path.join(SRC, 'ggml/src/ggml-cuda/cpy-utils.cuh'), encoding='utf8') as f: cp = f.read().replace('\r\n', '\n')
    check('the card unpacks as checked (spread, double, less 3 a byte) in the K dot and the V unpack',
          'return __vsub4(q3_0_spread_lo(x) << 1, 0x03030303);' in fa and 'q2_kv_unpack4(K_q2_kv[ib].qs[i4])' in fa and
          'q2_kv_unpack4(x[ib].qs[iqs/4] >> (2*(iqs%4)))' in fa)
    with open(os.path.join(SRC, 'ggml/src/ggml-common.h'), encoding='utf8') as f: cm = f.read().replace('\r\n', '\n')
    check('the card\'s writer tries the scales and rounds every step as the processor\'s (as kv-q2-check emulates it)',
          '__fdiv_rn(amax, ks[s])' in cp and '__frcp_rn(d)' in cp and '__fadd_rn(__fmul_rn(x[j], id), 2.0f)' in cp and
          '__fadd_rn(err, __fmul_rn(e, e))' in cp and 'if (s == 0 || err < best_err)' in cp and
          '#define GGML_Q2_KV_DIVISORS 1.5f, 1.7f, 1.9f, 2.2f' in cm)

    # upstream's q2_0 is a brain-file type and stays refused for the chat memory; q2_kv is the chat memory's
    code, _, err, _ = run('q2_0', 'q2_0', False)
    check('-ctk q2_0 is still refused (upstream\'s brain-file type)', code != 0, err[-300:])

    code, base, err, size16 = run('f16', 'f16', False)
    check('f16 answers', code == 0, err[-300:])
    sizes = {}
    for k, v in (('q4_0', 'q4_0'), ('q2_kv', 'q2_kv'), ('q4_0', 'q2_kv'), ('q8_0', 'q2_kv'), ('q2_kv', 'q4_0')):
        code, cpu, err, size = run(k, v, False)
        check(f'{k}/{v} on the processor answers, and the log names the types',
              code == 0 and len(cpu) > len(open(prompt).read()) and f'K ({k})' in err and f'V ({v})' in err, err[-300:])
        sizes[(k, v)] = size
        code2, card, err2, _ = run(k, v, True)
        check(f'{k}/{v} on the stand-in card: the same words as on the processor', code2 == 0 and card == cpu, err2[-300:])
    s4, s2, s42 = sizes[('q4_0', 'q4_0')], sizes[('q2_kv', 'q2_kv')], sizes[('q4_0', 'q2_kv')]
    check('q2_kv chat memory is 10/18 of q4_0', None not in (s4, s2) and abs(s2/s4 - 10/18) < 0.01, f'{s2} vs {s4}')
    check('K q4_0 + V q2_kv sits halfway', None not in (s4, s42) and abs(s42/s4 - 14/18) < 0.01, f'{s42} vs {s4}')

    # Progressive Memory over a q2_kv main cache: the newest words again at q8_0
    TIERS = 'q8_0:256'
    code, a, err, _ = run('q2_kv', 'q2_kv', False, TIERS)
    check(f'q2_kv + LLAMA_KV_TIERS={TIERS} on the processor: in use, each part from its own flash attention',
          code == 0 and 'NOT USED' not in err and 'its own flash attention' in err and 'q2_kv' in err and len(a) > len(open(prompt).read()), err[-500:])
    m = re.search(r'llama_kv_cache: size = .*K \(q2_kv\).*V \(q2_kv\).*sharp rings \(q8_0\): +([0-9.]+) MiB', err)
    check('the cache size line says q2_kv and the q8_0 rings\' MiB', m is not None and float(m.group(1)) > 0, err[-800:])
    code2, b, err2, _ = run('q2_kv', 'q2_kv', True, TIERS)
    check(f'q2_kv + {TIERS} on the stand-in card: the same words as on the processor', code2 == 0 and a == b, err2[-500:])
    code3, c, err3, _ = run('q2_kv', 'q2_kv', False, TIERS, env={'LLAMA_KV_TIERS_EXPLICIT': '1'})
    check(f'q2_kv + {TIERS}: the same words with 0039\'s merge (LLAMA_KV_TIERS_EXPLICIT=1)', code3 == 0 and a == c, err3[-500:])

    # the chat memory split (0036) with q2_kv: writing past the split merges the card's and the processor's attention
    code, a, err, _ = run('q2_kv', 'q2_kv', True)
    code2, b, err2, _ = run('q2_kv', 'q2_kv', True, env={'LLAMA_KV_SPLIT': '256'})
    check('with the chat memory split: it engages and gives the same words', code2 == 0 and 'writing past cell 256' in err2 and a == b, err2[-300:])

    # drift on the random brain against f16 (a real brain's numbers come from the PC)
    subprocess.run([os.path.join(BIN, 'llama-perplexity'), '-m', brain, '-f', text, '-c', '1024', '-b', '1024', '-fa', 'on', '-t', '2',
                    '--kl-divergence-base', os.path.join(WORK, 'base.kld')], capture_output=True, timeout=900)
    res = {}
    for name, kv, tiers in (('q8_0', 'q8_0', None), ('q4_0', 'q4_0', None), ('q3_0', 'q3_0', None), ('q2_kv', 'q2_kv', None),
                            ('q2_kv + q8_0:256', 'q2_kv', 'q8_0:256'), ('q2_kv + q8_0:512', 'q2_kv', 'q8_0:512')):
        res[name] = kld(kv, tiers)
    print('  mean KLD against f16 (same top word %), tiny random brain, 1024 words a chunk:')
    for name, (k, t) in res.items(): print(f'    {name:18s} {k}  ({t}%)')
    k8, k4, k3, k2 = (res[n][0] for n in ('q8_0', 'q4_0', 'q3_0', 'q2_kv'))
    kt, kt2 = res['q2_kv + q8_0:256'][0], res['q2_kv + q8_0:512'][0]
    check('drift grows as the bits shrink (q8_0 < q4_0 < q3_0 < q2_kv)', None not in (k8, k4, k3, k2) and k8 < k4 < k3 < k2, f'{k8} {k4} {k3} {k2}')
    check('the q8_0 ring brings q2_kv\'s drift down, more with a bigger ring', None not in (k2, kt, kt2) and kt2 < kt < k2, f'{k2} {kt} {kt2}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
