#!/usr/bin/env python3
# Brain Engine 0080-0082 test: Raon-1 mini (raon1) and Raon-1 nano (raon1nano), from Krafton's fork (krafton-ai/llama.cpp,
# MIT). Tiny random brains of both are made with the checkout's own test-llama-archs, so nothing is downloaded. It checks:
#   - test-llama-archs passes for both (the card's answer is the processor's, saving and loading keeps the brain, a mixed
#     batch gives the same answer as one sequence at a time)
#   - both answer through llama-server on the stand-in card (ggml-rpc-server)
#   - the mini's experts go through Brain Engine's expert cache with the same words as without it
#   - a Raon brain refuses a context shift (its recurrent half can't forget tokens), and an ordinary hybrid brain
#     (LFM2) still allows it, so other brains are unchanged
#   python3 engine/tests/raon-words.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
# Words against Krafton's own engine were checked by hand on Nov 23 2026 (cloud, CPU): the same tiny brains gave the same
# perplexity to 4 decimals on both (mini 129.3247, nano 130.8344).
import glob, json, os, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: raon-words.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='raon-')
BIN = os.path.join(SRC, 'build', 'bin')
os.makedirs(WORK, exist_ok=True)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok

def make(arch):
    out = os.path.join(WORK, arch)
    os.makedirs(out, exist_ok=True)
    have = glob.glob(os.path.join(out, '*.gguf'))
    if not have:
        subprocess.run([os.path.join(BIN, 'test-llama-archs'), '-a', f'^{arch}$', '-s', '7', '-o', out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        have = glob.glob(os.path.join(out, '*.gguf'))
    return have[0] if have else ''

for arch in ('raon1', 'raon1nano'):
    r = subprocess.run([os.path.join(BIN, 'test-llama-archs'), '-a', f'^{arch}$', '-s', '7'], capture_output=True, text=True)
    check(f'{arch}: test-llama-archs passes', 'all 1 test(s) passed' in (r.stdout + r.stderr), (r.stdout + r.stderr)[-400:])

mini, nano, qwen = make('raon1'), make('raon1nano'), make('lfm2')
check('the tiny brains were made', bool(mini and nano and qwen))

P1 = ' '.join(f'apple{i} river{i % 7}' for i in range(30))
P2 = ' '.join(f'stone{i % 13} cloud{i}' for i in range(25))
RPORT = 50291
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
def serve(tag, model, extra=(), port=50292):
    log = os.path.join(WORK, f'{tag}.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', model, '--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '-c', '256',
                          '-np', '1', '-t', '2', '--port', str(port), '-lv', '4', '--no-warmup', '--context-shift'] + list(extra),
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'))
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception:
            if p.poll() is not None: break
            time.sleep(0.3)
    words = []
    try:
        for prompt in (P1, P2):
            body = json.dumps({'prompt': prompt, 'n_predict': 16, 'temperature': 0, 'cache_prompt': False}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
            words.append(json.loads(urllib.request.urlopen(req, timeout=300).read())['content'])
    except Exception as e:
        words.append(f'ERROR {e}')
    p.terminate()
    try: p.wait(timeout=20)
    except Exception: p.kill()
    return words, open(log, errors='replace').read()
ok = lambda w: len(w) == 2 and not any(x.startswith('ERROR') for x in w)
NO_SHIFT = 'shifting is not supported'
try:
    mw, merr = serve('mini-plain', mini)
    check('mini answers on the stand-in card', ok(mw), f'{mw} {merr[-400:]}')
    check('mini refuses a context shift', NO_SHIFT in merr)
    cw, cerr = serve('mini-cache', mini, ['--n-cpu-moe', '2', '--moe-cache-mib', '4'])
    check('mini through the expert cache: the same words', ok(cw) and cw == mw, f'{cw} vs {mw}')
    check('the expert cache was used', 'llama_moe_cache' in cerr, cerr[-400:])
    nw, nerr = serve('nano-plain', nano)
    check('nano answers on the stand-in card', ok(nw), f'{nw} {nerr[-400:]}')
    check('nano refuses a context shift', NO_SHIFT in nerr)
    qw, qerr = serve('lfm2', qwen)
    check('an ordinary hybrid brain (LFM2) still allows it', ok(qw) and NO_SHIFT not in qerr, qerr[-400:])
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
