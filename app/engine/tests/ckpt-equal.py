#!/usr/bin/env python3
# Lamplight 0160 test: with LLAMA_SERVER_CKPT_EQUAL=1, llama-server puts the save point (context checkpoint) "one
# reading step before the end of the prompt" on the last boundary of the prompt cut in equal steps, so a prompt a little
# longer than one step is no longer read as a small step plus a full one. A tiny hybrid brain (qwen35moe, which keeps
# checkpoints) made by test-llama-archs, -b/-ub 64.
#   python3 lamplight/tests/ckpt-equal.py <llama.cpp checkout with the patches, built with LLAMA_BUILD_TESTS=ON> [work folder] [bin folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: ckpt-equal.py <llama.cpp checkout, built> [work folder] [bin folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='ckpt-equal-')
BIN = os.path.abspath(sys.argv[3]) if len(sys.argv) > 3 else os.path.join(SRC, 'build', 'bin')
os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'qwen35moe.gguf')
if not os.path.exists(brain):
    subprocess.check_call([os.path.join(BIN, 'test-llama-archs'), '-a', 'qwen35moe', '-s', '5', '-o', WORK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    made = [f for f in os.listdir(WORK) if f.endswith('.gguf') and f != 'qwen35moe.gguf']
    os.rename(os.path.join(WORK, made[0]), brain)

fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok

UB = 64
def post(port, path, body):
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=300))

def serve(port, env, prompts):
    log = os.path.join(WORK, f'server-{port}.txt')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--port', str(port), '-c', '2048', '-np', '1', '-t', '2',
                          '-b', str(UB), '-ub', str(UB), '--verbose'],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, **env})
    out = []
    try:
        for _ in range(150):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1); break
            except Exception:
                time.sleep(0.3)
        for pr, cache in prompts:
            r = post(port, '/completion', {'prompt': pr, 'n_predict': 12, 'temperature': 0, 'cache_prompt': cache})
            out.append((r['content'], r['timings']['prompt_n']))
    finally:
        p.terminate(); p.wait()
    text = open(log, encoding='utf-8', errors='replace').read()
    return out, text

def ckpts(log):
    return [int(x) for x in re.findall(r'created context checkpoint \d+ of \d+ \(pos_min = -?\d+, pos_max = -?\d+, n_tokens = (\d+)', log)]

# a prompt of exactly n tokens: count with the brain's own tokenizer
p0 = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--port', '50460', '-c', '2048', '-np', '1', '-t', '2'],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(150):
        try:
            urllib.request.urlopen('http://127.0.0.1:50460/health', timeout=1); break
        except Exception:
            time.sleep(0.3)
    words = [f'w{i % 37}' for i in range(400)]
    toks = post(50460, '/tokenize', {'content': ' '.join(words)})['tokens']
finally:
    p0.terminate(); p0.wait()
N = 100
prompt = toks[:N]          # token ids are a valid prompt
longer = toks[:N + 70]     # the same chat, a little more: read from the cached part on
short = toks[:UB]          # fits one step: never touched

runs = [(prompt, False), (prompt, False), (short, False), (prompt, True), (longer, True)]
off, log_off = serve(50461, {}, runs)
on, log_on = serve(50462, {'LLAMA_SERVER_CKPT_EQUAL': '1'}, runs)

c_off, c_on = ckpts(log_off), ckpts(log_on)
print(f'info: checkpoints off {c_off}')
print(f'info: checkpoints on  {c_on}')
check('off: the checkpoint sits min(n_batch, 4 + one step) before the end (llama.cpp)', (N - min(UB, 4 + UB)) in c_off and (N - 4) in c_off, f'{c_off}')
check('off: no equal-cut line', 'equal checkpoint cut' not in log_off)
rem = N - 4
tail = rem - (rem + 1) // 2
check('on: it says so', f'equal checkpoint cut: last prompt ubatch {tail} tokens (not {UB})' in log_on, re.findall(r'equal checkpoint cut[^\n]*', log_on)[:2])
check('on: the checkpoint sits on the equal boundary (48 + 48 + 4)', (N - 4 - tail) in c_on and (N - 4) in c_on and (N - min(UB, 4 + UB)) not in c_on, f'{c_on}')
check('on: no more checkpoints than off', len(c_on) <= len(c_off), f'{len(c_on)} vs {len(c_off)}')
check('same words every time', [o[0] for o in on] == [o[0] for o in off], f'{on} vs {off}')
check('a prompt that fits one step: no cut', on[2][1] == off[2][1] == UB)
check('the longer chat reuses the cache with the equal cut too', on[4][1] < N + 70, f'read {on[4][1]} of {N + 70}')
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
