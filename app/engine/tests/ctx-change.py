#!/usr/bin/env python3
# Brain Engine 0035 test: POST /context {"n_ctx": N} makes llama-server's context again with a new size and keeps the
# brain loaded (its placement didn't change), and the words match a server started at that size.
#   python3 engine/tests/ctx-change.py <llama.cpp checkout with the patches, built with LLAMA_BUILD_TESTS=ON> [work folder]
# The tiny brain is the Qwen3.8-Flash-Next shaped one from llama.cpp's tests/test-llama-archs (as in table-window.py).
import hashlib, json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: ctx-change.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='ctx-')
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
def post(port, path, body):
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req, timeout=300))
    except urllib.error.HTTPError as e:
        return {'http_error': e.code}
def serve(port, c, log):
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--port', str(port), '-c', str(c), '-t', '2', '-np', '1'],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'))
    for _ in range(150):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1); break
        except Exception:
            time.sleep(0.3)
    return p
def ask(port, n_words):
    r = post(port, '/completion', {'prompt': ' '.join(f'word{i}' for i in range(n_words)), 'n_predict': 32, 'temperature': 0, 'cache_prompt': False})
    return hashlib.md5(r['content'].encode()).hexdigest() if 'content' in r else r

p = serve(50271, 4096, os.path.join(WORK, 'fresh.txt'))
try:
    fresh_long, fresh_short = ask(50271, 1500), ask(50271, 100)
finally:
    p.terminate(); p.wait()
log = os.path.join(WORK, 'change.txt')
p = serve(50272, 1024, log)
try:
    check('a long prompt is refused at 1024', isinstance(ask(50272, 1500), dict))
    r = post(50272, '/context', {'n_ctx': 4096})
    check('the context grows to 4096', r.get('n_ctx') == 4096 and r.get('n_ctx_old') == 1024, f'{r}')
    check('the long prompt now gives the words of a server started at 4096', ask(50272, 1500) == fresh_long)
    r = post(50272, '/context', {'n_ctx': 1024})
    check('it shrinks back to 1024', r.get('n_ctx') == 1024, f'{r}')
    check('a short prompt gives the same words after shrinking', ask(50272, 100) == fresh_short)
    check('a request with nothing to change is refused', post(50272, '/context', {}).get('http_error') == 400)
finally:
    p.terminate(); p.wait()
text = open(log, encoding='utf-8', errors='replace').read()
check('the brain stayed loaded both times', text.count('brain kept loaded') == 2 and 'brain loaded again' not in text)
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
