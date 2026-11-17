#!/usr/bin/env python3
# Brain Engine 0020 test: the expert tiers (warm experts pinned in RAM, cold experts read whole) on the tiny made-up
# mixture-of-experts brain from experts-per-word.py (16 experts, 2 per word, 4 layers, random weights).
#   python3 engine/tests/expert-tiers.py <llama.cpp checkout with the patches, built> [work folder]
# It needs llama-server built in <checkout>/build/bin, numpy, and the checkout's gguf-py. Checks: with both tiers off
# nothing is printed and nothing changes; with each tier on, and both, the words and odds are the same as off (the
# tiers only move bytes, never change a number); the cold tier asks for picked experts and skips recently used ones;
# the warm tier pins the busiest experts first, up to its MiB, and refuses a ranking from another brain, a broken
# ranking, or no ranking out loud. It can't show a speed-up: the tiny brain always fits in RAM.
import json, os, re, subprocess, sys, tempfile, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: expert-tiers.py <llama.cpp checkout with the patches, built> [work folder]')
WORK = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='tiers-')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
import gguf
from gguf import GGUFReader, GGUFWriter, GGUFValueType
BIN = os.path.join(SRC, 'build', 'bin', 'llama-server')
# the same tiny brain as experts-per-word.py
src = open(os.path.join(HERE, 'experts-per-word.py'), encoding='utf-8').read().replace('\r\n', '\n')
exec(src[src.index('def make_moe'):src.index("MODEL = ")])
MODEL = os.path.join(WORK, 'moe-k2.gguf')
if not os.path.exists(MODEL): make_moe(MODEL)
E, L = 16, 4
EXPERT_BYTES = 3 * 32 * 64 * 4  # gate, up and down of one expert, f32

def start(port, env=None, extra=()):
    log = os.path.join(WORK, f'srv-{port}.log')
    p = subprocess.Popen([BIN, '-m', MODEL, '--port', str(port), '-c', '512', '-np', '1', '-t', '2', '-lv', '4', *extra],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, **(env or {})})
    for _ in range(200):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); return p, log
        except Exception: time.sleep(0.2)
    raise SystemExit('server did not start, see ' + log)
def req(port, path, body):
    r = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(r, timeout=60).read())
PROMPT = 'The quick brown fox jumps over the lazy dog because'
def gen(port):
    r = req(port, '/completion', {'prompt': PROMPT, 'n_predict': 40, 'temperature': 0, 'n_probs': 3, 'cache_prompt': False})
    return r['tokens'] if 'tokens' in r else r['content'], [[round(t['logprob'], 4) for t in x['top_logprobs']] for x in r['completion_probabilities']]
def run(port, env=None, extra=()):
    p, log = start(port, env, extra)
    out = gen(port); p.terminate(); p.wait()
    return out, open(log, encoding='utf-8', errors='replace').read().replace('\r\n', '\n')
ok = True
def check(name, cond):
    global ok; ok = ok and cond; print(('PASS ' if cond else 'FAIL ') + name)

ref, log0 = run(18200)
check('off: no tier lines printed', 'read-whole' not in log0 and 'warm experts' not in log0)

# cold tier
cold, logc = run(18201, {'LLAMA_EXPERT_READ_WHOLE': '1', 'LLAMA_EXPERT_READ_LOG_EVERY': '1'})
check('cold on: same words and odds as off', cold == ref)
check('cold on: says it is on', 'expert read-whole on' in logc)
stats = [tuple(map(int, m[:2])) + (int(m[3]),) for m in re.findall(r'expert read-whole: (\d+) products, (\d+) experts asked for whole \(([\d.]+) MiB\), (\d+) skipped', logc)]
last = stats[-1] if stats else (0, 0, 0)
check('cold on: picked experts asked for, then skipped while recently used (%s)' % (last,), last[1] > 0 and last[2] > last[1])
check('cold on: never more asked than exist in the first product\'s tensor', not stats or stats[0][1] <= E)
cold2, logc2 = run(18202, {'LLAMA_EXPERT_READ_WHOLE': '1', 'LLAMA_EXPERT_READ_WINDOW': '1', 'LLAMA_EXPERT_READ_LOG_EVERY': '1'})
stats2 = [tuple(map(int, (m[0], m[1], m[3]))) for m in re.findall(r'expert read-whole: (\d+) products, (\d+) experts asked for whole \(([\d.]+) MiB\), (\d+) skipped', logc2)]
check('cold, window 1: every pick asked for, none skipped (%s)' % (stats2[-1:],), stats2 and stats2[-1][2] == 0 and cold2 == ref)
coldnm, _ = run(18203, {'LLAMA_EXPERT_READ_WHOLE': '1'}, ['--load-mode', 'none'])
check('cold on, brain loaded whole (--load-mode none): same words and odds', coldnm == ref)
p, _ = start(18205, {'LLAMA_EXPERT_READ_WHOLE': '1'})
t = req(18205, '/completion', {'prompt': PROMPT, 'n_predict': 6, 'temperature': 0, 'expert_trace': True, 'cache_prompt': False})['expert_trace']['rows']
p.terminate(); p.wait()
check('cold on: the expert trace (the cube) still comes back, %d experts per layer' % 2, len(t) >= 6 and all(len(l) == 2 for l in t[-1]['e']))
coldx, logx = run(18204, {'LLAMA_EXPERT_READ_WHOLE': 'yes'})
check('cold: only "1" turns it on', 'read-whole on' not in logx and coldx == ref)

# warm tier: first learn the brain's fingerprint from the refusal of a ranking made on "another brain"
rank = os.path.join(WORK, 'rank.txt')
def write_rank(fp, lines):
    with open(rank, 'w', newline='\n') as f:
        f.write(f'bob-moe-ranking 2 {fp} test\n' + ''.join(f'{l} {e} {c}\n' for l, e, c in lines))
rng = np.random.default_rng(7)
counts = [(l, e, int(c)) for l in range(L) for e, c in enumerate(rng.integers(1, 1000, E))]
write_rank('0123456789abcdef', counts)
_, logw = run(18210, {'LLAMA_EXPERT_WARM_MIB': '1', 'LLAMA_EXPERT_WARM_RANKING': rank})
m = re.search(r'this brain ([0-9a-f]{16})', logw)
check('warm: a ranking from another brain is refused out loud', m is not None and 'warm experts NOT PINNED' in logw and 'pinned in RAM' not in logw)
fp = m.group(1) if m else '0'
write_rank(fp, counts)
warm, logw = run(18211, {'LLAMA_EXPERT_WARM_MIB': '1', 'LLAMA_EXPERT_WARM_RANKING': rank})
m = re.search(r'warm experts: (\d+) experts pinned in RAM, ([\d.]+) MiB of the (\d+) MiB allowed', logw)
n_fit = (1024 * 1024) // EXPERT_BYTES
check('warm 1 MiB: pins as many experts as fit in 1 MiB (%s, expected %d)' % (m.groups() if m else None, n_fit), m is not None and int(m.group(1)) == n_fit)
check('warm on: same words and odds as off', warm == ref)
warm_all, logwa = run(18212, {'LLAMA_EXPERT_WARM_MIB': '64', 'LLAMA_MOE_CACHE_RANKING': rank})
m = re.search(r'warm experts: (\d+) experts pinned', logwa)
check('warm 64 MiB, ranking from LLAMA_MOE_CACHE_RANKING: all %d experts pinned (%s)' % (E * L, m.group(1) if m else None), m is not None and int(m.group(1)) == E * L)
both, logb = run(18213, {'LLAMA_EXPERT_WARM_MIB': '1', 'LLAMA_EXPERT_WARM_RANKING': rank, 'LLAMA_EXPERT_READ_WHOLE': '1'})
check('both tiers on: same words and odds as off', both == ref and 'pinned in RAM' in logb and 'read-whole on' in logb)
_, logn = run(18214, {'LLAMA_EXPERT_WARM_MIB': '1'})
check('warm with no ranking file: refused out loud', 'warm experts NOT PINNED' in logn and 'no ranking file' in logn)
write_rank(fp, counts + [(L, 0, 5)])
_, logbad = run(18215, {'LLAMA_EXPERT_WARM_MIB': '1', 'LLAMA_EXPERT_WARM_RANKING': rank})
check('warm: a ranking naming a layer this brain lacks is refused', 'warm experts NOT PINNED' in logbad and "doesn't fit this brain" in logbad)
with open(rank, 'w', newline='\n') as f: f.write(f'bob-moe-ranking 2 {fp} test\n0 1 5\nbroken line\n')
_, logbr = run(18216, {'LLAMA_EXPERT_WARM_MIB': '1', 'LLAMA_EXPERT_WARM_RANKING': rank})
check('warm: a broken line is refused', 'warm experts NOT PINNED' in logbr and "can't be read" in logbr)
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
