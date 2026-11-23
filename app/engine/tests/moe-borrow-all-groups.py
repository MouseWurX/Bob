#!/usr/bin/env python3
# Brain Engine 0074 test: borrowed reading lends from every group of the cache (LLAMA_MOE_CACHE_BORROW_ALL_GROUPS=1,
# off unless set). A brain whose layers have two expert layouts (Q8_0 downs in layers 0-1, Q4_K in 2-3) makes two cache
# groups. Before 0072 only the first group could be lent; with it every group can, so the reading step can grow
# further. Stand-in card (ggml-rpc-server). It checks, over two long reads with writing between them, that:
#   - two groups, both lent, a bigger lendable size than the first group alone
#   - reads lend past the first group and empty slots in both; rewarm puts them back in both
#   - the same words as a plain run reading at that step, and as borrowing from the first group at the same step
#   - with a processor share (zero slots): reads run past the first group, the zero slots they ran over are set to
#     zero again, and the words are those of reading inside the first group (with a share the words follow what the
#     cache holds, so a plain run is no reference there)
#   - off unless set; a one-group brain lends as before; NOT USED next to LLAMA_MOE_CACHE_CPU_READ with a share
#   python3 engine/tests/moe-borrow-all-groups.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-borrow-all-groups.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='allgroups-')
BIN = os.path.join(SRC, 'build', 'bin')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
# the brain of moe-read-in-place.py (the same maker)
src = open(os.path.join(HERE, 'moe-read-in-place.py'), encoding='utf-8').read().replace('\r\n', '\n')
exec(src[src.index('import numpy as np'):src.index("os.makedirs(WORK") if "os.makedirs(WORK" in src else src.index('brain = os.path.join(WORK')])
os.makedirs(WORK, exist_ok=True)
wide = os.path.join(WORK, 'moe-wide.gguf')
if not os.path.exists(wide): make_moe(wide)
brain = os.path.join(WORK, 'moe-two-groups.gguf')
if not os.path.exists(brain):
    subprocess.run([os.path.join(BIN, 'llama-quantize'), '--tensor-type', r'blk\.[01]\.ffn_down_exps=q8_0', '--tensor-type', r'blk\.[23]\.ffn_down_exps=q4_K',
                    wide, brain, 'Q4_K_M'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
one = os.path.join(WORK, 'moe-one-group.gguf')
if not os.path.exists(one):
    subprocess.run([os.path.join(BIN, 'llama-quantize'), '--tensor-type', 'ffn_down_exps=q4_K', wide, one, 'Q4_K_M'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
P1 = ' '.join(f'apple{i} river{i % 7}' for i in range(500))
P2 = ' '.join(f'stone{i % 13} cloud{i}' for i in range(450))
RPORT = 50341
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub, b='2048', share='0', cache='CACHE', port=50342, model=None):
    cache = CACHE if cache == 'CACHE' else cache
    log = os.path.join(WORK, f'{tag}.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', model or brain, '--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '--n-cpu-moe', '4',
                          '--moe-cache-mib', cache, '--moe-cache-cpu-share', share, '-c', '4096', '-np', '1', '-t', '2',
                          '-b', b, '-ub', str(ub), '--port', str(port), '-lv', '4', '--no-warmup', '--no-repack'],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, **env})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception:
            if p.poll() is not None: break
            time.sleep(0.3)
    words = []
    try:
        for prompt in (P1, P2):
            body = json.dumps({'prompt': prompt, 'n_predict': 40, 'temperature': 0, 'cache_prompt': False}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
            words.append(json.loads(urllib.request.urlopen(req, timeout=300).read())['content'])
    except Exception as e:
        words.append(f'ERROR {e}')
    p.terminate()
    try: p.wait(timeout=20)
    except Exception: p.kill()
    return words, open(log, errors='replace').read()
CACHE = os.environ.get('ALLG_CACHE', '8')
SCACHE = os.environ.get('ALLG_SCACHE', '16')
B = {'LLAMA_MOE_CACHE_BORROW': '1'}
A = {**B, 'LLAMA_MOE_CACHE_BORROW_ALL_GROUPS': '1'}
ok = lambda w: len(w) == 2 and not any(x.startswith('ERROR') for x in w)
def step(err):
    m = re.findall(r'borrowed reading: reading step (\d+) \(own (\d+)\)', err)
    return int(m[-1][0]) if m else 0
def lent(err):
    m = re.findall(r'region [\d.]+ MiB = working memory [\d.]+ MiB \+ cache [\d.]+ MiB, up to ([\d.]+) MiB lent', err)
    return float(m[-1]) if m else 0.0
try:
    fw, ferr = serve('first-group', B, 64)
    aw, aerr = serve('all-groups', A, 64)
    groups = re.findall(r'(\d+) layers, (\w+): +(\d+) slots', aerr)
    check('the brain makes two cache groups', len(groups) == 2, f'{groups}')
    check('all groups: it says so', 'lends from all 2 groups of the cache' in aerr, aerr[-500:])
    lf, la = lent(ferr), lent(aerr)
    check('more can be lent than the first group alone', la > lf * 1.3, f'{la} vs {lf} MiB')
    sf, sa = step(ferr), step(aerr)
    check('so the reading step grows further', sa > sf, f'{sa} vs {sf}')
    g0 = re.findall(r'MiB lent \((\d+) slots of group (\d+)\)', aerr)
    check('reads empty slots in both groups', len({g for _, g in g0}) == 2, f'{g0}')
    rw = re.findall(r'rewarm put back (\d+) of (\d+) dropped experts', aerr)
    check('rewarm puts the dropped experts back', len(rw) >= 2 and all(a == b for a, b in rw), f'{rw}')
    pw, _ = serve('plain-at-step', {}, sa)
    check('the same words as a plain run reading at that step', ok(aw) and aw == pw, f'{aw == pw}')
    fs, _ = serve('first-group-at-step', {**B, 'LLAMA_MOE_CACHE_BORROW_UB': str(sf)}, 64)
    check('and as borrowing from the first group alone', aw == fw and ok(fw), f'{aw == fw}')
    # with a share, which experts the cache holds decides which misses the processor works out, so the words follow
    # the cache: the reference is the same switch at the first group's step, where no read runs past a group's slots
    zw, zerr = serve('all-groups-share', A, 64, share='0.5', cache=SCACHE)
    zs = step(zerr)
    zf, zferr = serve('first-group-share', B, 64, share='0.5', cache=SCACHE)
    zc, zcerr = serve('all-groups-share-capped', {**A, 'LLAMA_MOE_CACHE_BORROW_UB': str(step(zferr))}, 64, share='0.5', cache=SCACHE)
    check('with a processor share: reads run past the first group and its zero slots are zero again', 'are zero again' in zerr and 'are zero again' not in zcerr and zs > step(zferr), f'{zs} ' + zerr[-400:])
    check('with a processor share: the same words as reading inside the first group, and as the first group alone', ok(zw) and zw == zc and zw == zf, f'{zw == zc} {zw == zf}')
    zn, _ = serve('all-groups-share-nozero', {**A, 'LLAMA_MOE_CACHE_BORROW_ALL_GROUPS_TEST_NO_ZERO': '1'}, 64, share='0.5', cache=SCACHE)
    print(f'info: with the zero slots left as the read left them the words {"change" if zn != zw else "stay the same"} (the check above can see a lost zero slot: {zn != zw})')
    check('off unless set', 'lends from all' not in ferr and 'slots of group' not in ferr)
    ow, oerr = serve('one-group', A, 64, model=one)
    of, _ = serve('one-group-first', B, 64, model=one)
    check('a one-group brain lends as before', 'the cache has one group' in oerr and ow == of and ok(ow), f'{ow == of}')
    _, cerr = serve('cpu-read', {**A, 'LLAMA_MOE_CACHE_CPU_READ': '256'}, 64, share='0.5', cache='64')
    check('next to LLAMA_MOE_CACHE_CPU_READ with a share: NOT USED', 'BORROW_ALL_GROUPS NOT USED: not together with LLAMA_MOE_CACHE_CPU_READ' in cerr, cerr[-400:])
    print(f'info: lendable {lf} -> {la} MiB, reading step {sf} -> {sa}; with a share step {step(zerr)}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
