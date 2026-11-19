#!/usr/bin/env python3
# Brain Engine 0034 test: with LLAMA_SPEC_GATE=rate, llama-server pauses drafting while fewer than that share of the
# drafted words are kept, and tries again after a pause that doubles each time.
#   python3 engine/tests/spec-gate.py <llama.cpp checkout with the patches, built with LLAMA_BUILD_TESTS=ON> [work folder]
# The tiny brain is the Qwen3.8-Flash-Next shaped one from llama.cpp's tests/test-llama-archs (as in table-window.py);
# its random words make n-gram drafts that are mostly thrown away, the case the gate is for.
import hashlib, json, os, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: spec-gate.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='gate-')
BIN = os.path.join(SRC, 'build', 'bin')
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'qwen4exp-moe.gguf')
if not os.path.exists(brain):
    subprocess.check_call([os.path.join(BIN, 'test-llama-archs'), '-a', 'qwen4exp', '-o', WORK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    setmeta = os.path.join(SRC, 'gguf-py', 'gguf', 'scripts', 'gguf_set_metadata.py')
    env = {**os.environ, 'PYTHONPATH': os.path.join(SRC, 'gguf-py')}
    for k, v in (('qwen4exp.attention.indexer.top_k', '64'), ('qwen4exp.context_length', '8192')):
        subprocess.check_call([sys.executable, setmeta, '--force', brain, k, v], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
SPEC = ['--spec-type', 'ngram-simple', '--spec-ngram-simple-size-n', '1', '--spec-ngram-simple-size-m', '4']
def serve(port, env, spec):
    log = os.path.join(WORK, f'server-{port}.txt')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--port', str(port), '-c', '1024', '-np', '1', '-t', '2', *spec],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, **env})
    res = []
    try:
        for _ in range(150):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1); break
            except Exception:
                time.sleep(0.3)
        for _ in range(2):
            body = json.dumps({'prompt': ' '.join(f'word{i % 40}' for i in range(20)), 'n_predict': 400, 'temperature': 0, 'cache_prompt': False})
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body.encode(), headers={'Content-Type': 'application/json'})
            r = json.load(urllib.request.urlopen(req, timeout=300))
            t = r.get('timings', {})
            res.append((hashlib.md5(r['content'].encode()).hexdigest(), t.get('draft_n') or 0, t.get('draft_n_accepted') or 0))
    finally:
        p.terminate(); p.wait()
    return res, open(log, encoding='utf-8', errors='replace').read()

plain, _ = serve(50251, {}, ['--spec-type', 'none'])
off, _ = serve(50252, {}, SPEC)
check('drafting is on and mostly thrown away without the gate', off[0][1] > 50 and off[0][2] < 0.6*off[0][1], f'{off[0][1:]}')
on, log = serve(50253, {'LLAMA_SPEC_GATE': '0.5'}, SPEC)
check('the gate says it is on', 'drafts pause while fewer than 50%' in log)
check('the gate pauses drafting', log.count('drafts paused') >= 2, f'{log.count("drafts paused")} pauses')
check('it tries again after a pause (drafts still made, far fewer)', 0 < on[0][1] < off[0][1]/2, f'{on[0][1]} vs {off[0][1]}')
check('pauses grow (8, then 16 words)', 'drafts paused for 16 words' in log)
check('two replies in a row give the same words', on[0][0] == on[1][0])
check('the words are those of writing without drafts (on this brain)', on[0][0] == plain[0][0])
_, log = serve(50254, {'LLAMA_SPEC_GATE': '2'}, SPEC)
check('a rate of 2 says NOT USED', 'LLAMA_SPEC_GATE=2 NOT USED' in log)
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
