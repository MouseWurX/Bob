#!/usr/bin/env python3
# Brain Engine 0120 test: with LLAMA_SPEC_MB=1, llama-server keeps a rejected draft token when the brain rates it at
# least as likely as its replacement (llamAmpere's mb-MTP). Off unless set; Turbo only in Bob.
#   python3 engine/tests/spec-mb.py <llama.cpp checkout with the patches, built with LLAMA_BUILD_TESTS=ON> [work folder]
# Two tiny brains of the same shape (llama.cpp's tests/test-llama-archs, as in spec-gate.py) from different seeds: one
# writes, the other drafts for it, so many drafts are thrown away, the case the mode-biased accept is for.
import hashlib, json, os, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: spec-mb.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='mb-')
BIN = os.path.join(SRC, 'build', 'bin')
os.makedirs(WORK, exist_ok=True)

def brain(seed):
    out = os.path.join(WORK, f'seed{seed}')
    f = os.path.join(out, 'qwen4exp-moe.gguf')
    if not os.path.exists(f):
        os.makedirs(out, exist_ok=True)
        subprocess.check_call([os.path.join(BIN, 'test-llama-archs'), '-a', 'qwen4exp', '-s', str(seed), '-o', out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        setmeta = os.path.join(SRC, 'gguf-py', 'gguf', 'scripts', 'gguf_set_metadata.py')
        env = {**os.environ, 'PYTHONPATH': os.path.join(SRC, 'gguf-py')}
        for k, v in (('qwen4exp.attention.indexer.top_k', '64'), ('qwen4exp.context_length', '8192')):
            subprocess.check_call([sys.executable, setmeta, '--force', f, k, v], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return f
TGT, DFT = brain(4), brain(5)

fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok

DRAFT = ['--spec-type', 'draft-simple', '-md', DFT, '--spec-draft-n-max', '4', '--spec-draft-n-min', '0', '-ngld', '0']
PROB = [*DRAFT, '--spec-draft-sampling', 'probabilistic']
PROMPT = ' '.join(f'word{i % 40}' for i in range(20))
port = [50300]
def serve(env, spec, bodies):
    port[0] += 1
    log = os.path.join(WORK, f'server-{port[0]}.txt')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', TGT, '--port', str(port[0]), '-c', '2048', '-np', '1', '-t', '2', *spec],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={k: v for k, v in {**os.environ, **env}.items() if v is not None})
    res = []
    try:
        for _ in range(200):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port[0]}/health', timeout=1); break
            except Exception:
                time.sleep(0.3)
        for extra in bodies:
            body = json.dumps({'prompt': PROMPT, 'n_predict': 300, 'cache_prompt': False, 'top_k': 40, 'top_p': 1, 'min_p': 0, **extra})
            req = urllib.request.Request(f'http://127.0.0.1:{port[0]}/completion', data=body.encode(), headers={'Content-Type': 'application/json'})
            r = json.load(urllib.request.urlopen(req, timeout=600))
            res.append({'md5': hashlib.md5(r['content'].encode()).hexdigest(), **r.get('timings', {})})
    finally:
        p.terminate(); p.wait()
    return res, open(log, encoding='utf-8', errors='replace').read()

HOT = {'temperature': 0.8, 'seed': 7}
COLD = {'temperature': 0}
GRAMMAR = {**HOT, 'grammar': 'root ::= [a-z0-9 ]+'}

off, log_off = serve({'LLAMA_SPEC_MB': None}, PROB, [HOT, HOT, COLD])
check('exact checking: drafts made and many thrown away', off[0].get('draft_n', 0) > 40 and off[0].get('draft_n_accepted', 0) < 0.8*off[0]['draft_n'], f"{off[0].get('draft_n')}/{off[0].get('draft_n_accepted')}")
check('off: no rescue count in the timings, nothing said', 'draft_n_rescued' not in off[0] and 'mode-biased' not in log_off)
check('off: same seed, same words', off[0]['md5'] == off[1]['md5'])

on, log_on = serve({'LLAMA_SPEC_MB': '1'}, PROB, [HOT, HOT, COLD, GRAMMAR])
check('on: the engine says so', 'mode-biased accept on (LLAMA_SPEC_MB)' in log_on)
check('on: rescues happen', on[0].get('draft_n_rescued', 0) > 0, f"{on[0].get('draft_n_rescued')}")
r_on = on[0].get('draft_n_accepted', 0) / max(1, on[0].get('draft_n', 1))
r_off = off[0].get('draft_n_accepted', 0) / max(1, off[0].get('draft_n', 1))
check('on: a bigger share of drafted tokens kept than exact', r_on > r_off, f'{r_on:.3f} vs {r_off:.3f}')
check('on: it changes words (Turbo only)', on[0]['md5'] != off[0]['md5'])
check('on: same seed, same words', on[0]['md5'] == on[1]['md5'])
check('on: temperature 0 writes the same words as off', on[2]['md5'] == off[2]['md5'] and on[2].get('draft_n_rescued', 0) == 0)
check('on: no rescue while a grammar shapes the output', on[3].get('draft_n_rescued', -1) == 0, f"{on[3].get('draft_n_rescued')}")
check('on: the reply log counts the rescues', 'kept past the exact rule' in log_on)

audit, log_a = serve({'LLAMA_SPEC_MB': '1', 'LLAMA_SPEC_MB_KL': '64'}, PROB, [HOT])
check('drift audit: positions audited, KL logged', audit[0].get('mb_kl_n', 0) > 0 and 'mode-biased drift (LLAMA_SPEC_MB_KL)' in log_a, f"{audit[0].get('mb_kl_n')}")
check('drift audit: at most the 64 asked for', 0 < audit[0].get('mb_kl_n', 0) <= 64)
check('drift audit: the KL is a number at or above 0', audit[0].get('mb_kl_sum', -1) >= 0)
check('drift audit changes no words', audit[0]['md5'] == on[0]['md5'])

kl_only, _ = serve({'LLAMA_SPEC_MB_KL': '64'}, PROB, [HOT])
check('the audit key alone does nothing', kl_only[0]['md5'] == off[0]['md5'] and 'mb_kl_n' not in kl_only[0])

_, log = serve({'LLAMA_SPEC_MB': '2'}, PROB, [COLD])
check('NOT USED for 2', 'LLAMA_SPEC_MB=2 NOT USED' in log)
greedy, log = serve({'LLAMA_SPEC_MB': '1'}, DRAFT, [HOT])
check('NOT USED with a drafter that takes its top pick', 'LLAMA_SPEC_MB=1 NOT USED: it needs --spec-draft-sampling probabilistic' in log and greedy[0].get('draft_n_rescued', 0) == 0)

print('ALL PASS' if not fails else f'{fails} FAILED')
sys.exit(1 if fails else 0)
