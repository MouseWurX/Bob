#!/usr/bin/env python3
# Brain Engine 0043 test: expert stand-ins while writing (LLAMA_MOE_STANDIN=rank|near|drop, LLAMA_MOE_STANDIN_MAX=K).
# A picked expert that is not in the card's hot-experts cache is played by one that is (rank: the cached expert the
# router scored best for the word; near: the cached expert whose router column is most alike; drop: none, the other
# picks share its weight), so nothing is copied over for it. That changes the words, so:
#   - off (no key) must give the very same words as the build before the patch (pass that build's bin folder as the
#     third argument to compare against it; without it, off is compared with LLAMA_MOE_STANDIN=off and a bad value)
#   - on must run, log its stand-ins per word at -lv 4, and never more than K in a layer for a word
#   - the drift is measured, not judged: perplexity and top-1 agreement (llama-perplexity --kl-divergence, one-word
#     batches so the stand-ins play) of each way against off, and how many words a greedy reply keeps before it parts.
# The brain here is a tiny made-up MoE (random weights, 16 experts, 4 a word). Its drift numbers say nothing about a real
# brain: they only show the switch works and roughly how the ways rank. The cache needs a card, so a stand-in card runs
# on this machine (ggml-rpc-server; build the checkout with GGML_RPC=ON). The speed can only be seen on a real card.
#   python3 engine/tests/moe-standins.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder] [bin folder before 0043]
import os, re, subprocess, sys, tempfile, time
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-standins.py <llama.cpp checkout, built> [work folder] [bin folder before 0043]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='standins-')
OLD = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else None
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
exec(src[src.index('def make_moe'):src.index("MODEL = ")])
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-k4.gguf')
if not os.path.exists(brain): make_moe(brain, used=4)
prompt = os.path.join(WORK, 'prompt.txt')
with open(prompt, 'w') as f: f.write(' '.join(f'word{i}' for i in range(40)))
# a plain text for the perplexity, a few hundred tokens
text = os.path.join(WORK, 'text.txt')
with open(text, 'w') as f:
    f.write(('The little shop on the corner sold bread in the morning and soup at night. People came from the next '
             'street and the one after it, because the soup was warm and the bread was cheap, and the woman who ran it '
             'remembered every name. In the winter the windows fogged up and children drew faces in them. ') * 14)
PORT = 50243
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
CACHE = ['--rpc', f'127.0.0.1:{PORT}', '-ngl', '99', '--n-cpu-moe', '4', '--moe-cache-mib', '1', '-t', '2']
def env(way, k=None, libs=None):
    e = {k: v for k, v in os.environ.items() if not k.startswith('LLAMA_MOE_STANDIN')}
    if libs: e['LD_LIBRARY_PATH'] = libs + os.pathsep + e.get('LD_LIBRARY_PATH', '')  # the old build's own libraries
    e['LLAMA_MOE_CACHE_LOG_EVERY'] = '1000000'
    if way is not None: e['LLAMA_MOE_STANDIN'] = way
    if k is not None: e['LLAMA_MOE_STANDIN_MAX'] = str(k)
    return e
def complete(way=None, k=None, share='0', bin_dir=BIN, lv='5', n=64, extra_env=None, mib='1'):
    e = env(way, k, bin_dir if bin_dir != BIN else None)
    e.update(extra_env or {})
    cache = [mib if a == '1' and i > 0 and CACHE[i - 1] == '--moe-cache-mib' else a for i, a in enumerate(CACHE)]
    r = subprocess.run([os.path.join(bin_dir, 'llama-completion'), '-m', brain, *cache, '--moe-cache-cpu-share', share,
                        '-f', prompt, '-n', str(n), '-c', '512', '-no-cnv', '--temp', '0', '-lv', lv],
                       capture_output=True, text=True, errors='replace', env=e, timeout=300)
    lines = re.findall(r'stand-ins: word (\d+) layer (\d+): (\d+) \(', r.stderr)
    total = re.findall(r'stood in \((\w+), at most (\d+) a layer a word\): (\d+) stand-ins in (\d+) of (\d+) words, (\d+) misses copied as before while writing, most (\d+) in a layer', r.stderr)
    return r.returncode, r.stdout, r.stderr, [(int(a), int(b), int(c)) for a, b, c in lines], total[-1] if total else None
def ppl(way=None, k=None, base=None, kl=False):
    args = [os.path.join(BIN, 'llama-perplexity'), '-m', brain, *CACHE, '--moe-cache-cpu-share', '0', '-f', text,
            '-c', '128', '-b', '1', '-ub', '1']
    args += ['--kl-divergence-base', base] + (['--kl-divergence'] if kl else [])
    r = subprocess.run(args, capture_output=True, text=True, errors='replace', env=env(way, k), timeout=900)
    out = r.stdout + r.stderr
    # PPL(Q) of the scoring run; the tool's PPL(base) comes from the saved, squeezed logits and doesn't compare with it
    p = re.findall(r'Mean PPL\(Q\)\s*:\s*([\d.]+)', out) if kl else re.findall(r'Final estimate: PPL = ([\d.]+)', out)
    same = re.findall(r'Same top p:\s*([\d.]+)', out)
    kld = re.findall(r'Mean\s+KLD:\s*([-\d.]+)', out)
    return r.returncode, out, (float(p[-1]) if p else None), (float(same[-1]) if same else None), (float(kld[-1]) if kld else None)
def first_split(a, b):
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]: n += 1
    start = a.find('word39') + len('word39') if 'word39' in a else 0  # count the written words only, not the prompt
    return max(0, n - start)
try:
    code, base, err, lines, total = complete()
    check('off: the cache answers, nothing stands in', code == 0 and not lines and total is None, err[-300:])
    if OLD:
        code, old, err, _, _ = complete(bin_dir=OLD)
        check('off: the very same words as the build before 0043', code == 0 and old == base, err[-300:])
    else:
        print('SKIP off against the build before 0043 (no bin folder given)')
    code, out, err, _, total = complete('off')
    check('LLAMA_MOE_STANDIN=off: the same words, nothing stands in', code == 0 and out == base and total is None)
    code, out, err, _, total = complete('sometimes')
    check('a bad value says NOT USED and answers as off', code == 0 and out == base and 'NOT USED' in err and total is None, err[-300:])
    # every expert on the card from the start (a ranked fill of all of them): no miss, so nothing stands in, and the
    # stand-in path (its factors stay 1) must give the very same words as off
    fp = re.search(r'brain fingerprint = ([0-9a-f]+)', err)
    rank_file = os.path.join(WORK, 'all.ranking')
    with open(rank_file, 'w') as f:
        f.write(f'bob-moe-ranking 2 {fp.group(1) if fp else 0} test\n' + ''.join(f'{l} {e} 1\n' for l in range(4) for e in range(16)))
    code, full_off, err, _, _ = complete(extra_env={'LLAMA_MOE_CACHE_RANKING': rank_file}, mib='8')
    check('every expert cached: the ranked fill takes them all', code == 0 and 'ranked fill: 64 experts' in err, err[-300:])
    for way in ('rank', 'near', 'drop'):
        code, out, err, lines, total = complete(way, 2, extra_env={'LLAMA_MOE_CACHE_RANKING': rank_file}, mib='8')
        check(f'{way}, every expert cached: no stand-in and the very same words as off', code == 0 and out == full_off and not lines and total is not None and int(total[2]) == 0, err[-300:])
    replies = {}
    for way in ('rank', 'near', 'drop'):
        for k in (1, 2):
            code, out, err, lines, total = complete(way, k)
            per = {}
            for w, l, n in lines: per[(w, l)] = per.get((w, l), 0) + n
            check(f'{way} K={k}: runs and says it is on', code == 0 and 'stand-ins ON' in err, err[-300:])
            check(f'{way} K={k}: stand-ins are logged per word and layer (-lv 5)', len(lines) > 0 and total is not None and sum(n for _, _, n in lines) == int(total[2]),
                  f'{len(lines)} lines, summary {total}')
            check(f'{way} K={k}: never more than {k} in a layer for a word', all(n <= k for n in per.values()) and int(total[1]) == k and int(total[6]) <= k,
                  f'most {max(per.values()) if per else 0}')
            if total: print(f'  {way} K={k}: {total[2]} stand-ins in {total[3]} of {total[4]} words, {total[5]} misses still copied')
            if k == 2: replies[way] = out
        code, out, err, lines, _ = complete(way, 2, lv='4', n=150)
        win = re.findall(r'stand-ins, words (\d+)-(\d+): (\d+), ([\d.]+) a word, most (\d+) in a word, most (\d+) in a layer for a word', err)
        check(f'{way}: the -lv 4 log counts the stand-ins a word, every 64 words, never above K', code == 0 and len(win) >= 2 and not lines and all(int(w[5]) <= 2 for w in win), err[-300:])
        if win: print(f'  {way} K=2 -lv 4: ' + '; '.join(f'words {w[0]}-{w[1]}: {w[3]} a word, most {w[4]} in a word' for w in win))
        code, out, err, _, _ = complete(way, 2, share='1')
        check(f'{way}: also runs with the misses on the processor (--moe-cache-cpu-share 1)', code == 0 and 'stood in' in err, err[-300:])
    # the drift, measured against off
    basef = os.path.join(WORK, 'off.kld')
    code, out, p_off, _, _ = ppl(base=basef)
    check('perplexity off runs', code == 0 and p_off is not None, out[-300:])
    code, out, p, same, kld = ppl(None, None, base=basef, kl=True)
    check('off scored against off: the same top word everywhere and next to no KL (the floor)', code == 0 and p is not None and same == 100.0 and kld is not None and abs(kld) < 1e-3, f'same {same}, KL {kld}')
    p_ref = p
    n_scored = re.findall(r'computing over (\d+) chunks, n_ctx=(\d+)', out)
    rows = [('off', '-', p, same, kld, first_split(base, base))]
    for way in ('rank', 'near', 'drop'):
        for k in (1, 2):
            code, out, p, same, kld = ppl(way, k, base=basef, kl=True)
            check(f'perplexity {way} K={k} runs', code == 0 and p is not None and same is not None, out[-300:])
            rows.append((way, k, p, same, kld, first_split(base, replies.get(way, '')) if k == 2 else '-'))
    rows = [(w, k, p / p_ref if p and p_ref else None, sm, kl, keep) for w, k, p, sm, kl, keep in rows]
    nan = float('nan')
    chunks = f'{n_scored[-1][0]} pieces of {n_scored[-1][1]} tokens, about {int(n_scored[-1][0]) * (int(n_scored[-1][1]) // 2 - 1)} tokens scored' if n_scored else ''
    print(f'\n  drift on the tiny made-up brain (random weights: not a forecast for a real one), one-word batches, {chunks}:')
    print(f'  (perplexity off: {p_ref:.1f}; a made-up brain is far from sure of any word, so only the change means anything)')
    print('  way    K   perplexity vs off   top-1 same as off   mean KL    written chars before the reply parts from off')
    for way, k, p, same, kld, keep in rows:
        print(f'  {way:5}  {k}   x{p if p is not None else nan:8.3f}           {same if same is not None else nan:8.2f}%          '
              f'{kld if kld is not None else nan:8.5f}   {keep}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
