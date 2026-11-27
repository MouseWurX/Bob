#!/usr/bin/env python3
# Brain Engine 0142 test: with LLAMA_SPEC_GATE_TIME=1, llama-server times the rounds that ask the drafter and the rounds
# that don't (words per millisecond) and pauses drafting while it writes slower, trying again after pauses that double.
# The drafter is made slow by a test key (LLAMA_SPEC_GATE_TIME_TEST_DRAFT_MS, a sleep in each round that drafts), so the
# choice does not hang on this machine's speed. Same tiny brain as spec-gate.py.
#   python3 engine/tests/spec-gate-time.py <llama.cpp checkout with the patches, built with LLAMA_BUILD_TESTS=ON> [work folder]
import hashlib, json, os, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: spec-gate-time.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='gate-time-')
BIN = os.path.join(SRC, 'build', 'bin')
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'qwen4exp-moe.gguf')
if not os.path.exists(brain):
    subprocess.check_call([os.path.join(BIN, 'test-llama-archs'), '-a', 'qwen4exp', '-s', os.environ.get('SPEC_GATE_SEED', '4'), '-o', WORK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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

plain, _ = serve(50351, {}, ['--spec-type', 'none'])
off, _ = serve(50352, {}, SPEC)
check('drafting is on without the gate', off[0][1] > 50, f'{off[0][1:]}')
on, log = serve(50353, {'LLAMA_SPEC_GATE_TIME': '1', 'LLAMA_SPEC_GATE_TIME_TEST_DRAFT_MS': '40'}, SPEC)
check('the time gate says it is on', 'drafts go on only while they write faster' in log)
check('a slow drafter is paused', log.count('time pause') >= 2, f'{log.count("time pause")} pauses')
check('pauses grow (8, then 16 words)', 'drafts paused for 16 words' in log)
check('far fewer drafts, but it still tries again', 0 < on[0][1] < off[0][1]/2, f'{on[0][1]} vs {off[0][1]}')
check('the words are those of writing without drafts', on[0][0] == plain[0][0] and on[1][0] == plain[0][0])
fast, flog = serve(50354, {'LLAMA_SPEC_GATE_TIME': '1'}, SPEC)
check('without the slow drafter: the same words, and it still drafts', fast[0][0] == plain[0][0] and fast[0][1] > 0, f'{fast[0][1:]}')
print(f'info: drafts made off {off[0][1]}, slow drafter {on[0][1]}, this machine {fast[0][1]} ({flog.count("time pause")} pauses)')
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
