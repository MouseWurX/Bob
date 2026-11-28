#!/usr/bin/env python3
# Brain Engine 0045 test: Progressive Memory (0039, LLAMA_KV_TIERS) writes one word without a second pass over the
# main cache. Each part (the main cache without the ring's cells, then each sharp ring) gets its share of the word's
# attention from the log-sum-exp its own flash attention hands back, where 0039 worked it out from the scores again.
# The checks:
#   - fa-lse-check.cpp (ggml, the processor): the op itself, against plain flash attention, 0039's numbers and double,
#     and its timing at 16K to 64K words;
#   - one-word logits (llama-perplexity, batches of one word) match 0039's merge: the same build with
#     LLAMA_KV_TIERS_EXPLICIT=1, and the build before 0045 when its bin folder is given; on the processor and the
#     stand-in card (ggml-rpc);
#   - the same greedy words as 0039 on both;
#   - batches (modes 2 and 3) and plain chat memory give the very same logits and words as before 0045;
#   - the cache size line also says the rings' MiB;
#   - llama-bench writing speed at a few chat lengths, before and after (a brain with 32 heads of 128, q4_0 underneath).
#   python3 engine/tests/kv-tiers-fast.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder] [bin folder of the build before 0045]
# It needs llama-completion, llama-perplexity, llama-bench and ggml-rpc-server in <checkout>/build/bin, and a C++ compiler.
import csv, os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: kv-tiers-fast.py <llama.cpp checkout, built> [work folder] [bin before 0045]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='kvtfast-')
BEFORE = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else None
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
maker = src[src.index('def make_moe'):src.index("MODEL = ")]
# the brain of kv-tiers.py (head size 64, 4,096 cells), and one for timing: 32 heads of 128 over 4 K/V heads, 32K cells,
# so attention is most of a word's work
exec(maker.replace('HD, FF = 16, 4, 64, 4, 2, 16, 32', 'HD, FF = 16, 4, 64, 4, 2, 64, 32').replace('add_context_length(512)', 'add_context_length(4096)'))
make_small = make_moe
exec(maker.replace('HD, FF = 16, 4, 64, 4, 2, 16, 32', 'HD, FF = 16, 4, 64, 32, 4, 128, 32').replace('add_context_length(512)', 'add_context_length(32768)'))
make_wide = make_moe
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-hd64-4k.gguf')
if not os.path.exists(brain): make_small(brain)
wide = os.path.join(WORK, 'moe-h32-hd128-32k.gguf')
if not os.path.exists(wide): make_wide(wide)
prompt = os.path.join(WORK, 'prompt.txt')
with open(prompt, 'w') as f: f.write(' '.join(f'word{i % 37} x{i % 11}' for i in range(300)))
text = os.path.join(WORK, 'kld.txt')
with open(text, 'w') as f:
    rng = np.random.default_rng(1)
    f.write(' '.join(f'word{int(a)} x{int(b)}' for a, b in zip(rng.integers(0, 37, 1200), rng.integers(0, 11, 1200))))
PORT = 50245
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''), flush=True)
    fails += not ok
def env_for(tiers, extra, bindir):
    e = {**os.environ, **(extra or {})}
    e.pop('LLAMA_KV_TIERS', None)
    if tiers: e['LLAMA_KV_TIERS'] = tiers
    if bindir != BIN: e['LD_LIBRARY_PATH'] = bindir + os.pathsep + e.get('LD_LIBRARY_PATH', '')
    return e
def card_args(card): return ('--rpc', f'127.0.0.1:{PORT}', '-ngl', '99') if card else ('-ngl', '0')
def run(k, v, tiers=None, card=False, extra=(), env=None, n=48, bindir=BIN, b=512):
    r = subprocess.run([os.path.join(bindir, 'llama-completion'), '-m', brain, *card_args(card),
                        '-f', prompt, '-n', str(n), '-c', '2048', '-b', str(b), '-ub', str(b), '-fa', 'on', '-ctk', k, '-ctv', v,
                        '-no-cnv', '--temp', '0', '-t', '2', '-lv', '4', *extra],
                       capture_output=True, text=True, errors='replace', env=env_for(tiers, env, bindir), timeout=900)
    return r.returncode, r.stdout, r.stderr
def ppl(kv, base, save, tiers=None, card=False, env=None, bindir=BIN, b=1):
    # batches of one word (b = 1): every word is written the one-word way; b = 512: read as batches
    r = subprocess.run([os.path.join(bindir, 'llama-perplexity'), '-m', brain, *card_args(card), '-f', text, '-c', '1024',
                        '-b', str(b), '-ub', str(b), '-fa', 'on', '-t', '2', '-ctk', kv, '-ctv', kv, '-lv', '4',
                        '--kl-divergence-base', base, *(() if save else ('--kl-divergence',))],
                       capture_output=True, text=True, errors='replace', env=env_for(tiers, env, bindir), timeout=1800)
    out = r.stdout + r.stderr
    m = re.search(r'Mean +KLD: +(-?[0-9.]+)', out)
    t = re.search(r'Same top p: +([0-9.]+)', out)
    return r.returncode, (float(m.group(1)) if m else None), (float(t.group(1)) if t else None), out
EXPLICIT = {'LLAMA_KV_TIERS_EXPLICIT': '1'}
TIERS = 'q8_0:256'
try:
    # the op on its own, on the processor
    exe = os.path.join(WORK, 'fa-lse-check')
    subprocess.check_call(['c++', '-std=c++17', '-O2', os.path.join(HERE, 'fa-lse-check.cpp'), '-o', exe,
                           '-I', os.path.join(SRC, 'ggml', 'include'), '-L', BIN, '-lggml', '-lggml-base', f'-Wl,-rpath,{BIN}'])
    r = subprocess.run([exe, '1'], capture_output=True, text=True, timeout=1800)
    print('\n'.join('  ' + l for l in r.stdout.splitlines() if not l.startswith('PASS')))
    check('fa-lse-check: ' + (r.stdout.strip().splitlines() or ['no output'])[-1], r.returncode == 0 and 'ALL PASS' in r.stdout, r.stdout[-600:] + r.stderr[-300:])

    # the log says which way writing took, and the cache line says the rings' room
    code, a, err = run('q3_0', 'q3_0', TIERS)
    check('writing takes each part\'s share from its flash attention', code == 0 and 'its own flash attention' in err and 'one more pass' not in err, err[-500:])
    m = re.search(r'llama_kv_cache: size = .*sharp rings \(q8_0\): +([0-9.]+) MiB', err)
    check('the cache size line also says the rings\' MiB', m is not None and float(m.group(1)) > 0, err[-800:])
    code, b, err = run('q3_0', 'q3_0', TIERS, env=EXPLICIT)
    check('LLAMA_KV_TIERS_EXPLICIT=1 takes 0039\'s pass instead, and says so', code == 0 and 'one more pass over their K' in err, err[-500:])
    check('the same greedy words as 0039\'s merge (processor)', a == b and len(a) > 50, f'{a[-120:]!r} vs {b[-120:]!r}')
    code, c, err = run('q3_0', 'q3_0', TIERS, card=True)
    code2, d, err2 = run('q3_0', 'q3_0', TIERS, card=True, env=EXPLICIT)
    check('the stand-in card also takes it from flash attention', code == 0 and 'its own flash attention' in err, err[-500:])
    check('the same greedy words as 0039\'s merge (stand-in card)', code2 == 0 and c == d and c == a, f'{c[-120:]!r} vs {d[-120:]!r}')
    code, e3, err = run('q3_0', 'q3_0', 'f16:64,q8_0:256')
    code2, e4, err2 = run('q3_0', 'q3_0', 'f16:64,q8_0:256', env=EXPLICIT)
    check('three steps: the same greedy words as 0039\'s merge', code == 0 and code2 == 0 and e3 == e4, err[-300:])

    # one-word logits against 0039's merge
    for card in (False, True):
        where = 'stand-in card' if card else 'processor'
        for kv, tiers in (('q3_0', TIERS), ('q3_0', 'f16:64,q8_0:256'), ('q4_0', 'q8_0:512')):
            base = os.path.join(WORK, f'base-{kv}-{tiers.replace(":", "_").replace(",", "-")}-{int(card)}.kld')
            c0, _, _, o0 = ppl(kv, base, True, tiers, card, EXPLICIT)
            c1, kl, same, o1 = ppl(kv, base, False, tiers, card)
            check(f'{where}, {kv} + {tiers}: one-word logits match 0039\'s merge (mean KLD {kl}, same top {same}%)',
                  c0 == 0 and c1 == 0 and kl is not None and abs(kl) < 1e-5 and same == 100.0 and 'its own flash attention' in o1, o1[-400:])
            if BEFORE and not card:
                c2, kl2, same2, o2 = ppl(kv, base + '.before', True, tiers, card, bindir=BEFORE)
                c3, kl3, same3, o3 = ppl(kv, base + '.before', False, tiers, card)
                check(f'{where}, {kv} + {tiers}: one-word logits match the build before 0045 (mean KLD {kl3}, same top {same3}%)',
                      c2 == 0 and c3 == 0 and kl3 is not None and abs(kl3) < 1e-5 and same3 == 100.0, o3[-400:])
                os.path.exists(base + '.before') and os.remove(base + '.before')
            os.path.exists(base) and os.remove(base)

    if BEFORE:
        # what 0045 must not change: plain chat memory, and Progressive Memory reading batches (modes 2 and 3)
        for name, kv, tiers, env, b in (('plain q3_0, one word at a time', 'q3_0', None, None, 1),
                                         ('plain q3_0, batches', 'q3_0', None, None, 512),
                                         ('plain f16, one word at a time', 'f16', None, None, 1),
                                         ('Progressive Memory reading batches (mode 2)', 'q3_0', TIERS, None, 512),
                                         ('a batch bigger than the slack (mode 3)', 'q3_0', 'f16:256', {'LLAMA_KV_TIERS_SLACK': '256'}, 512)):
            base = os.path.join(WORK, 'same-' + re.sub(r'[^a-z0-9]+', '-', name.lower()) + '.kld')
            c0, _, _, o0 = ppl(kv, base, True, tiers, False, env, bindir=BEFORE, b=b)
            c1, _, _, o1 = ppl(kv, base + '.after', True, tiers, False, env, b=b)
            same_bytes = c0 == 0 and c1 == 0 and open(base, 'rb').read() == open(base + '.after', 'rb').read()
            for f in (base, base + '.after'): os.path.exists(f) and os.remove(f)  # each is a few hundred MB
            check(f'{name}: the very same logits as before 0045 (the saved logits are byte for byte the same)', same_bytes, o1[-400:])
        for name, k, tiers, card in (('plain q3_0', 'q3_0', None, False), ('plain q3_0, stand-in card', 'q3_0', None, True),
                                     ('plain q8_0', 'q8_0', None, False), ('Progressive Memory', 'q3_0', TIERS, False),
                                     ('Progressive Memory, stand-in card', 'q3_0', TIERS, True)):
            code, x, err = run(k, k, tiers, card)
            code2, y, err2 = run(k, k, tiers, card, bindir=BEFORE)
            check(f'{name}: the same greedy words as the build before 0045', code == 0 and code2 == 0 and x == y, err[-300:] + err2[-300:])

    # writing speed, llama-bench on the processor (4 threads): tokens a second at a few chat lengths. llama-bench
    # takes no q3_0 (-ctk), so the main cache is q4_0 here: 0039's extra pass costs the same either way
    def bench(tiers, bindir, depths='2048,8192,16384'):
        r = subprocess.run([os.path.join(bindir, 'llama-bench'), '-m', wide, '-fa', '1', '-ctk', 'q4_0', '-ctv', 'q4_0', '-ngl', '0',
                            '-t', '4', '-p', '0', '-n', '24', '-r', '2', '-d', depths, '-o', 'csv'],
                           capture_output=True, text=True, errors='replace', env=env_for(tiers, None, bindir), timeout=3600)
        # the header row is quoted in some llama-bench builds and bare in others: start at whichever line names avg_ts
        lines = r.stdout.splitlines()
        start = next((i for i, l in enumerate(lines) if 'avg_ts' in l and 'n_depth' in l), None)
        out = {}
        for d in (csv.DictReader(lines[start:]) if start is not None else []):
            if d.get('n_depth') and d.get('avg_ts'):
                out[int(d['n_depth'])] = float(d['avg_ts'])
        return out, r.stdout + r.stderr
    plain, o = bench(None, BIN)
    fast, o2 = bench('q8_0:2048', BIN)
    slow, o3 = bench('q8_0:2048', BEFORE) if BEFORE else (None, '')
    print('  writing t/s (tiny wide brain, processor, 4 threads): chat length, plain q4_0, q4_0 + q8_0:2048 before 0045, with 0045')
    for dpt in sorted(plain):
        print(f'  {dpt:6d}  {plain[dpt]:8.1f}  {slow[dpt] if slow else float("nan"):8.1f}  {fast.get(dpt, float("nan")):8.1f}')
    check('llama-bench ran', len(plain) == 3 and len(fast) == 3 and (slow is None or len(slow) == 3), o[-300:] + o2[-300:] + o3[-300:])
    if slow and len(slow) == 3 and len(fast) == 3:
        top = max(plain)
        check('at the longest chat, 0045 writes faster than before', fast[top] > slow[top], f'{fast[top]} vs {slow[top]}')
        check('at the longest chat, 0045 is within 25% of plain q4_0 (before: further off)', fast[top] > 0.75*plain[top] and fast[top]/plain[top] > slow[top]/plain[top],
              f'{fast[top]} vs plain {plain[top]}, before {slow[top]}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
