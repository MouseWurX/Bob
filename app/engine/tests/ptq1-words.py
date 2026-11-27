#!/usr/bin/env python3
# Brain Engine 0136 test: PTQ1_0 (ternary at group 128, PrismML's Ternary Bonsai files), on the processor.
# A tiny random Qwen 3.5 dense brain is made with the checkout's own test-llama-archs, so nothing is downloaded. It checks:
#   - the codec's element order matches the processor codec (test-ptq1_0-element-map) and the processor's
#     dot products match the reference (test-quantize-fns, which covers the AVX2 / AVX-512 path the build picked)
#   - llama-quantize makes a PTQ1_0 file, and it loads and answers (greedy, the same tokens on 1 and 4 threads)
#   - its perplexity is a finite number, the same on 1 and 4 threads
#   - with a second checkout (PrismML's fork, built), that fork gives the same greedy tokens on the same file
#   - with a Vulkan build in <checkout>/build-vk (0137), the card's PTQ1_0 products pass test-backend-ops, it gives the
#     processor's greedy tokens, and its perplexity is within 2e-3 of the same brain unpacked to F32 (the exact weights;
#     the processor path rounds its inputs to q8_0 first, so it sits about 1% away). GGML_VK_VISIBLE_DEVICES=0 lets a
#     software Vulkan device (lavapipe) count.
#   python3 engine/tests/ptq1-words.py <llama.cpp checkout with the patches, built> [fork checkout, built] [work folder]
# Nov 26 2026 (cloud, CPU, AVX2): greedy 128 tokens identical to PrismML-Eng/llama.cpp prism f70247610 on PTQ1_0 and Q2_0;
# perplexity differs by 1e-5 (relative) on both types, so the gap is outside PTQ1_0.
import glob, math, os, re, subprocess, sys, tempfile
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: ptq1-words.py <checkout, built> [fork, built] [work folder]')
FORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else ''
WORK = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else tempfile.mkdtemp(prefix='ptq1-')
BIN = os.path.join(SRC, 'build', 'bin')
os.makedirs(WORK, exist_ok=True)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok

def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr

rc, out, err = run([os.path.join(BIN, 'test-ptq1_0-element-map')])
check('element order matches the processor codec', rc == 0 and 'mismatches: 0' in out + err, (out + err)[-300:])
rc, out, err = run([os.path.join(BIN, 'test-quantize-fns')])
check('processor dot products match the reference', rc == 0 and 'ptq1_0' in out + err, (out + err)[-300:])

# make the brain with the fork's tool when there is one, so both engines know every tensor in it
maker = os.path.join(FORK or SRC, 'build', 'bin', 'test-llama-archs')
src = glob.glob(os.path.join(WORK, 'qwen35-dense.gguf'))
if not src:
    run([maker, '-a', '^qwen35$', '-s', '42', '-d', '0.5', '-o', WORK])
    src = glob.glob(os.path.join(WORK, 'qwen35-dense.gguf'))
check('the tiny brain was made', bool(src))
if not src:
    sys.exit(1)
ptq = os.path.join(WORK, 'ptq1_0.gguf')
rc, out, err = run([os.path.join(BIN, 'llama-quantize'), src[0], ptq, 'PTQ1_0'])
check('llama-quantize makes a PTQ1_0 file', rc == 0 and os.path.getsize(ptq) > 0, err[-300:])

def words(bin_dir, threads, extra=()):
    rc, out, _ = run([os.path.join(bin_dir, 'llama-completion'), '-m', ptq, '-p', 'the quick brown fox', '-n', '128',
                      '--temp', '0', '--seed', '1', '-no-cnv', '--no-warmup', '-t', str(threads), *extra])
    return out if rc == 0 else None

w1, w4 = words(BIN, 1), words(BIN, 4)
check('it answers', bool(w1))
check('same tokens on 1 and 4 threads', w1 == w4)

text = os.path.join(WORK, 'text.txt')
with open(text, 'w') as f:
    v = 'the quick brown fox jumps over lazy dog and cat runs far away from home'.split()
    f.write(' '.join(v[(i * 7 + i // 3) % len(v)] for i in range(6000)))
def ppl(bin_dir, threads):
    rc, out, err = run([os.path.join(bin_dir, 'llama-perplexity'), '-m', ptq, '-f', text, '-c', '128', '-b', '128',
                        '--chunks', '20', '-t', str(threads)])
    m = re.search(r'Final estimate: PPL = ([0-9.]+)', out + err)
    if m: return float(m.group(1))
    # the logger can drop its last line at exit; the 20th chunk's running value is the same number
    m = re.search(r'\[20\]([0-9.]+)', out + err)
    return float(m.group(1)) if m else float('nan')
p1, p4 = ppl(BIN, 1), ppl(BIN, 4)
check('perplexity is a finite number', math.isfinite(p1), str(p1))
check('same perplexity on 1 and 4 threads', p1 == p4, f'{p1} vs {p4}')

if FORK:
    fw = words(os.path.join(FORK, 'build', 'bin'), 4)
    check("the fork gives the same greedy tokens", fw is not None and fw == w4)
    fp = ppl(os.path.join(FORK, 'build', 'bin'), 4)
    check('the fork\'s perplexity is within 1e-4 (relative)', math.isfinite(fp) and abs(fp - p4) / fp < 1e-4, f'{fp} vs {p4}')

VK = os.path.join(SRC, 'build-vk', 'bin')
if os.path.isdir(VK):
    env = dict(os.environ, GGML_VK_VISIBLE_DEVICES=os.environ.get('GGML_VK_VISIBLE_DEVICES', '0'))
    for op in ('MUL_MAT', 'GET_ROWS'):
        r = subprocess.run([os.path.join(VK, 'test-backend-ops'), 'test', '-b', 'Vulkan0', '-o', op, '-p', 'ptq1_0'], capture_output=True, text=True, env=env)
        out = r.stdout + r.stderr
        n_ok = len(re.findall(r'type_a=ptq1_0.*OK|ptq1_0.*OK', out))
        check(f'Vulkan {op} with PTQ1_0 matches the processor', r.returncode == 0 and n_ok > 0 and 'FAIL' not in out, out[-300:])
    r = subprocess.run([os.path.join(VK, 'llama-completion'), '-m', ptq, '-p', 'the quick brown fox', '-n', '128', '--temp', '0',
                        '--seed', '1', '-no-cnv', '--no-warmup', '-t', '4', '-ngl', '99'], capture_output=True, text=True, env=env)
    check('Vulkan gives the processor\'s greedy tokens', r.returncode == 0 and r.stdout == w4)
    f32 = os.path.join(WORK, 'ptq1_0-f32.gguf')
    run([os.path.join(BIN, 'llama-quantize'), '--allow-requantize', ptq, f32, 'F32'])
    def ppl_of(bin_dir, model, extra=(), e=None):
        r = subprocess.run([os.path.join(bin_dir, 'llama-perplexity'), '-m', model, '-f', text, '-c', '128', '-b', '128',
                            '--chunks', '20', '-t', '4', *extra], capture_output=True, text=True, env=e)
        m = re.search(r'Final estimate: PPL = ([0-9.]+)', r.stdout + r.stderr) or re.search(r'\[20\]([0-9.]+)', r.stdout + r.stderr)
        return float(m.group(1)) if m else float('nan')
    ref, vk = ppl_of(BIN, f32), ppl_of(VK, ptq, ('-ngl', '99'), env)
    check('Vulkan perplexity is within 2e-3 of the exact (F32) weights', math.isfinite(vk) and abs(vk - ref) / ref < 2e-3, f'{vk} vs {ref}')

print(f'{fails} failed')
sys.exit(1 if fails else 0)
