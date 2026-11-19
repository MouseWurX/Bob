#!/usr/bin/env python3
# Brain Engine 0038 test: q3_0, a 3.5-bit chat memory type (-ctk q3_0 -ctv q3_0), off unless asked for. It is 14 bytes
# for 32 values against q4_0's 18, so the chat memory is 22% smaller. The test runs a tiny made-up brain on this
# machine's processor and on a stand-in card (ggml-rpc-server; build the checkout with GGML_RPC=ON), where the card and
# the processor compute alike, so the words must match between the two. Quality on a real brain is measured on the PC
# (perplexity within 3% of q4_0); the random tiny brain only shows that q3_0 drifts more than q4_0, which drifts more
# than q8_0, never by how much a real brain would.
#   python3 engine/tests/kv-q3.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
# It needs llama-completion, llama-perplexity, test-quantize-fns and ggml-rpc-server in <checkout>/build/bin.
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: kv-q3.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='kvq3-')
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
PORT = 50241
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def run(k, v, card, extra=(), env=None):
    r = subprocess.run([os.path.join(BIN, 'llama-completion'), '-m', brain, *(('--rpc', f'127.0.0.1:{PORT}', '-ngl', '99') if card else ('-ngl', '0')),
                        '-f', prompt, '-n', '48', '-c', '2048', '-b', '512', '-ub', '512', '-fa', 'on', '-ctk', k, '-ctv', v,
                        '-no-cnv', '--temp', '0', '-t', '2', '-lv', '4', *extra],
                       capture_output=True, text=True, errors='replace', env={**os.environ, **(env or {})}, timeout=600)
    m = re.search(r'llama_kv_cache: size = +([0-9.]+) MiB', r.stderr)
    return r.returncode, r.stdout, r.stderr, (float(m.group(1)) if m else None)
def kld(kv):
    r = subprocess.run([os.path.join(BIN, 'llama-perplexity'), '-m', brain, '-f', text, '-c', '1024', '-b', '1024', '-fa', 'on', '-t', '2',
                        '-ctk', kv, '-ctv', kv, '--kl-divergence-base', os.path.join(WORK, 'base.kld'), '--kl-divergence'],
                       capture_output=True, text=True, errors='replace', timeout=900)
    m = re.search(r'Mean +KLD: +([0-9.]+)', r.stdout + r.stderr)
    return float(m.group(1)) if m else None
try:
    # ggml's own check of the type: quantize error, the reference, and the processor's dot product with q8_0
    r = subprocess.run([os.path.join(BIN, 'test-quantize-fns'), '-v'], capture_output=True, text=True, errors='replace', timeout=600)
    q3 = [l for l in (r.stdout + r.stderr).splitlines() if l.strip().startswith('q3_0')]
    check('test-quantize-fns: q3_0 quantize, reference and dot product all ok', len(q3) == 3 and all(': ok' in l or ' ok ' in l for l in q3), '; '.join(q3))
    code, base, err, size16 = run('f16', 'f16', False)
    check('f16 answers', code == 0, err[-300:])
    sizes = {}
    for k, v in (('q4_0', 'q4_0'), ('q3_0', 'q3_0'), ('q4_0', 'q3_0')):
        code, cpu, err, size = run(k, v, False)
        check(f'{k}/{v} on the processor answers', code == 0 and len(cpu) > len(open(prompt).read()), err[-300:])
        sizes[(k, v)] = size
        code2, card, err2, _ = run(k, v, True)
        check(f'{k}/{v} on the stand-in card: the same words as on the processor', code2 == 0 and card == cpu, err2[-300:])
    s4, s3, s43 = sizes[('q4_0', 'q4_0')], sizes[('q3_0', 'q3_0')], sizes[('q4_0', 'q3_0')]
    check('q3_0 chat memory is 14/18 of q4_0', None not in (s4, s3) and abs(s3/s4 - 14/18) < 0.01, f'{s3} vs {s4}')
    check('K q4_0 + V q3_0 sits halfway', None not in (s4, s43) and abs(s43/s4 - 16/18) < 0.01, f'{s43} vs {s4}')
    # the chat memory split (0036) with q3_0: writing past the split merges the card's and the processor's attention
    code, a, err, _ = run('q3_0', 'q3_0', True)
    code2, b, err2, _ = run('q3_0', 'q3_0', True, env={'LLAMA_KV_SPLIT': '256'})
    check('with the chat memory split: it engages and gives the same words', code2 == 0 and 'writing past cell 256' in err2 and a == b, err2[-300:])
    # drift order on the random brain: q8_0 < q4_0 < q3_0 (a real brain's numbers come from the PC)
    subprocess.run([os.path.join(BIN, 'llama-perplexity'), '-m', brain, '-f', text, '-c', '1024', '-b', '1024', '-fa', 'on', '-t', '2',
                    '--kl-divergence-base', os.path.join(WORK, 'base.kld')], capture_output=True, timeout=900)
    k8, k4, k3 = kld('q8_0'), kld('q4_0'), kld('q3_0')
    check('drift grows as the bits shrink (q8_0 < q4_0 < q3_0)', None not in (k8, k4, k3) and k8 < k4 < k3, f'{k8} {k4} {k3}')
    check('q3_0 still tracks f16 (KLD under 4 on the random brain)', k3 is not None and k3 < 4, f'{k3}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
