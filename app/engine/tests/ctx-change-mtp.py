#!/usr/bin/env python3
# Brain Engine 0086 test: POST /context (0035/0037, the Conductor's step switch) with an MTP draft on a card. The draft
# must be let go before the main context is: an MTP draft keeps its rows on the card in the main context and gives them
# back when it is freed, and freeing it after the main context had gone touched freed memory (on the PC it stopped the
# engine with GGML_ASSERT(backend) on the first step switch with --spec-type draft-mtp).
# A tiny qwen35moe brain from tests/test-llama-archs gets one MTP block added here, and runs on a stand-in card
# (ggml-rpc-server), which, like a real card, keeps the rows on the device. Each switch must leave the server up, give the
# same words as before the switch and still draft. Freed memory is only caught for sure on a build made with
# -DLLAMA_SANITIZE_ADDRESS=ON (the test then also fails on any AddressSanitizer report); a plain build may survive the
# old bug by luck.
# Brain Engine 0087: with CTX_FIT=1 there's no -ngl, so the fit places the brain; set LLAMA_ARG_FIT_TARGET to the stand-in
# card's free MiB minus about 7 (16080 on the cloud's) so the fit leaves most of it on the processor. Each switch must then
# reuse the kept brain: the fit runs once and no switch loads the weights again.
#   python3 engine/tests/ctx-change-mtp.py <llama.cpp checkout with the patches, built with GGML_RPC=ON and LLAMA_BUILD_TESTS=ON> [work folder] [build folder, default build]
import json, os, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: ctx-change-mtp.py <llama.cpp checkout, built> [work folder] [build folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='ctxmtp-')
BUILD = sys.argv[3] if len(sys.argv) > 3 else 'build'
# CTX_FIT=1: no -ngl, so the fit places the brain (Bob's default); 0087 then keeps that placement on a switch
FIT = os.environ.get('CTX_FIT') == '1'
BIN = os.path.join(SRC, BUILD, 'bin')
ARCHS = os.path.join(SRC, 'build', 'bin', 'test-llama-archs')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
import gguf
os.makedirs(WORK, exist_ok=True)

def add_mtp(src, dst):
    r = gguf.GGUFReader(src)
    arch = 'qwen35moe'
    n_layer = int(r.fields[f'{arch}.block_count'].contents())
    n_embd = int(r.fields[f'{arch}.embedding_length'].contents())
    w = gguf.GGUFWriter(dst, arch)
    for k, f in r.fields.items():
        if k.startswith('GGUF.') or k == 'general.architecture':
            continue
        t = f.types[0]
        if k == f'{arch}.block_count':
            w.add_uint32(k, n_layer + 1); continue
        if k == f'{arch}.nextn_predict_layers':
            w.add_uint32(k, 1); continue
        sub = f.types[-1] if t == gguf.GGUFValueType.ARRAY else None
        v = f.contents()
        if sub is not None and len(v) == 0:
            continue
        if sub is not None and k.endswith('recurrent_layers') and len(v) == n_layer:
            v = v + [0]  # the MTP block is a full attention block
        w.add_key_value(k, v, t, sub_type=sub)
    last = f'blk.{n_layer - 1}.'
    def put(name, t):
        w.add_tensor(name, np.array(t.data), raw_shape=list(reversed([int(x) for x in t.shape])), raw_dtype=t.tensor_type)
    for t in r.tensors:
        put(t.name, t)
    for t in r.tensors:  # the MTP block copies the last (full attention) block
        if t.name.startswith(last):
            put(f'blk.{n_layer}.' + t.name[len(last):], t)
    rng = np.random.default_rng(7)
    L = f'blk.{n_layer}.nextn.'
    w.add_tensor(L + 'eh_proj.weight', (rng.standard_normal((n_embd, 2 * n_embd)) * 0.05).astype(np.float32))
    w.add_tensor(L + 'enorm.weight', np.ones(n_embd, np.float32))
    w.add_tensor(L + 'hnorm.weight', np.ones(n_embd, np.float32))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

brain = os.path.join(WORK, 'qwen35moe-mtp.gguf')
if not os.path.exists(brain):
    subprocess.check_call([ARCHS, '-a', 'qwen35moe', '-s', '4', '-o', WORK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    add_mtp(os.path.join(WORK, 'qwen35moe-moe.gguf'), brain)

fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def post(port, path, body, timeout=30):
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=timeout))

RPC, PORT = 50296, 18796
env = {**os.environ, 'ASAN_OPTIONS': 'detect_leaks=0'}
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPC)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
time.sleep(1.5)
log = os.path.join(WORK, 'server.txt')
srv = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--port', str(PORT), '-c', '1024', '-np', '1', '-t', '2',
                        '--rpc', f'127.0.0.1:{RPC}'] + ([] if FIT else ['-ngl', '99']) + ['--spec-type', 'draft-mtp', '-b', '256', '-ub', '256'],
                       stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env=env)
try:
    for _ in range(100):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=1); break
        except Exception:
            time.sleep(0.3)
    ASK = {'prompt': 'hello world one two three', 'n_predict': 24, 'temperature': 0}
    first = post(PORT, '/completion', ASK)
    check('MTP drafts before any switch', (first.get('timings', {}).get('draft_n') or 0) > 0, str(first.get('timings')))
    for step in (512, 128, 256):
        try:
            sw = post(PORT, '/context', {'n_batch': step, 'n_ubatch': step})
            check(f'step switch to {step} with MTP on', sw.get('n_ubatch') == step, str(sw))
            again = post(PORT, '/completion', ASK)
            check(f'same words after the switch to {step}', again.get('content') == first.get('content'))
            check(f'MTP still drafts after the switch to {step}', (again.get('timings', {}).get('draft_n') or 0) > 0, str(again.get('timings')))
        except Exception as e:
            check(f'server up after the switch to {step}', False, repr(e))
            break
finally:
    srv.terminate(); rpc.terminate()
    try:
        srv.wait(10)
    except Exception:
        srv.kill()
text = open(log, encoding='utf-8', errors='replace').read().replace('\r\n', '\n')
check('no freed memory touched (AddressSanitizer)', 'AddressSanitizer' not in text, 'see ' + log)
check('no GGML_ASSERT', 'GGML_ASSERT' not in text, 'see ' + log)
if FIT:
    # Brain Engine 0087: every switch keeps the brain; none fits again or loads the weights again
    check('the fit placed the brain once and was kept', text.count('fit kept for later contexts') == 1, 'see ' + log)
    check('every switch kept the brain loaded', text.count('brain kept loaded: only the context is made again') == 3, 'see ' + log)
    check('no switch loaded the brain again', 'brain loaded again: its placement changed' not in text, 'see ' + log)
print(f'\n{"all passed" if fails == 0 else f"{fails} failed"}')
sys.exit(1 if fails else 0)
