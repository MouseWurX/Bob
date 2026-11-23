#!/usr/bin/env python3
# Brain Engine 0090/0091 test: Inkling 2 Mini's looped layers (inkling2_loop) and the MoE cache. A looped brain runs its
# middle layers several times with one set of weights; 0091 keys the cache by the physical layer, so an expert fetched for
# the first pass is a hit for the later passes. Stand-in card (ggml-rpc-server, GGML_RPC_TEST_OFFLOAD=1).
# A tiny made-up brain: test-llama-archs writes an 8-layer inkling2 (32 experts, 4 per word; TLA_* switches, 0091), and
# this script adds the loop (layers 2 to 5 run three times, 16 layer slots). It checks that:
#   - the brain loads and writes on the processor alone, and the same words and odds on the stand-in card
#   - the same words and odds with the MoE cache, its misses on the card or half on the processor, a small step,
#     look-ahead, and in-place reads on and off, for a short prompt and one over 32 tokens
#   - the host experts are counted once (8 layers of experts, not 16) and a small cache hits (a pass reuses the
#     experts of the pass before)
#   python3 engine/tests/moe-loops.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-loops.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='loops-')
os.makedirs(WORK, exist_ok=True)
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType

fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok

# the 8-layer inkling2 from test-llama-archs, then the loop added
plain = os.path.join(WORK, 'inkling2-moe.gguf')
if os.path.exists(plain):
    os.remove(plain)
env = {**os.environ, 'TLA_FF': '64', 'TLA_LAYERS': '8', 'TLA_EXPERTS': '32', 'TLA_USED': '4'}
subprocess.run([os.path.join(BIN, 'test-llama-archs'), '-a', 'inkling2', '-o', WORK + os.sep], env=env, check=True,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
brain = os.path.join(WORK, 'loop.gguf')
START, END, RANK = 2, 6, 8
r = GGUFReader(plain)
w = GGUFWriter(brain, 'inkling2_loop')
n_embd = None
for f in r.fields.values():
    if f.name.startswith('GGUF.') or f.name == 'general.architecture':
        continue
    name = f.name.replace('inkling2.', 'inkling2_loop.', 1) if f.name.startswith('inkling2.') else f.name
    if name == 'inkling2_loop.attn_res.block_size':
        w.add_uint32(name, 1)  # the loop's ends must be whole blocks
        continue
    t = f.types[0]
    if t == GGUFValueType.ARRAY:
        w.add_array(name, f.contents())
    else:
        w.add_key_value(name, f.contents(), t)
    if f.name == 'inkling2.embedding_length':
        n_embd = int(f.contents())
w.add_uint32('inkling2_loop.loop.start', START)
w.add_uint32('inkling2_loop.loop.end', END)
w.add_uint32('inkling2_loop.loop.count', 3)
w.add_uint32('inkling2_loop.loop.gate_rank', RANK)
for t in r.tensors:
    w.add_tensor(t.name, np.array(t.data), raw_dtype=t.tensor_type)
rng = np.random.default_rng(3)
for il in range(START, END):
    w.add_tensor(f'blk.{il}.loop_msg_query.weight', (rng.standard_normal((4, n_embd)) * 0.1).astype(np.float32))
    for c in ['q', 'k', 'v', 'ffn']:
        w.add_tensor(f'blk.{il}.loop_{c}_ctrl_down.weight', (rng.standard_normal((RANK, 2 * n_embd)) * 0.1).astype(np.float32))
        w.add_tensor(f'blk.{il}.loop_{c}_ctrl_gain.weight', (rng.standard_normal((n_embd, RANK)) * 0.1).astype(np.float32))
        w.add_tensor(f'blk.{il}.loop_{c}_ctrl_forget.weight', (rng.standard_normal((n_embd, RANK)) * 0.1).astype(np.float32))
w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

RPORT = 50331
rpc_bin = os.path.join(BIN, 'ggml-rpc-server') if os.path.exists(os.path.join(BIN, 'ggml-rpc-server')) else os.path.join(BIN, 'rpc-server')
rpc = subprocess.Popen([rpc_bin, '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       env={**os.environ, 'GGML_RPC_TEST_OFFLOAD': '1'})
time.sleep(1.5)

def serve(tag, args, env=None, port=50332):
    log = os.path.join(WORK, f'{tag}.log')
    cmd = [os.path.join(BIN, 'llama-server'), '-m', brain, '-c', '1024', '-np', '1', '-t', '2', '--port', str(port), '-lv', '4'] + args
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, 'GGML_RPC_TEST_OFFLOAD': '1', **(env or {})})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception:
            if p.poll() is not None: break
            time.sleep(0.3)
    return p, log, port

def ask(port, prompt):
    req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=json.dumps(
        {'prompt': prompt, 'n_predict': 24, 'temperature': 0, 'cache_prompt': False, 'n_probs': 1}).encode(),
        headers={'Content-Type': 'application/json'})
    d = json.loads(urllib.request.urlopen(req, timeout=300).read())
    return d['content'], [(p.get('id'), round(p.get('logprob', 0.0), 4)) for p in d.get('completion_probabilities', [])]

def run(tag, args, env=None):
    p, log, port = serve(tag, args, env)
    try:
        if p.poll() is not None:
            return None, open(log).read()
        out = [ask(port, pr) for pr in PROMPTS]
    finally:
        p.terminate()  # not kill: the cache prints its hit rate on the way out
        try:
            p.wait(timeout=60)
        except subprocess.TimeoutExpired:
            p.kill(); p.wait()
    return out, open(log).read()

PROMPTS = ['hello world, this is a test',
           'hello world, this is a test of the looped model with a much longer prompt so that the reading step is bigger '
           'than thirty two tokens and the in place path runs too, one two three four five six seven eight nine ten']
CARD = ['--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '--n-cpu-moe', '99']

ref, log = run('cpu', [])
check('loads and writes on the processor', ref is not None and all(len(c) > 0 for c, _ in ref), log[-400:])
check('16 layer slots for 8 layers looped', re.search(r'n_layer\s+=\s+16\b', log) is not None)
out, _ = run('card', CARD)
check('same words and odds on the stand-in card', out == ref)
cases = [
    ('cache, misses on the card', ['--moe-cache-mib', '3', '--moe-cache-cpu-share', '0'], None),
    ('cache, half the misses on the processor', ['--moe-cache-mib', '3', '--moe-cache-cpu-share', '0.5'], None),
    ('cache, step of 8', ['--moe-cache-mib', '3', '--moe-cache-cpu-share', '0', '-ub', '8', '-b', '8'], None),
    ('cache, look-ahead', ['--moe-cache-mib', '3', '--moe-cache-cpu-share', '0'], {'LLAMA_MOE_LOOKAHEAD': '4'}),
    ('cache, in-place reads off', ['--moe-cache-mib', '3', '--moe-cache-cpu-share', '0'], {'LLAMA_MOE_CACHE_READ_IN_PLACE': '0'}),
    ('cache, big', ['--moe-cache-mib', '12', '--moe-cache-cpu-share', '0'], None),
]
for name, args, env in cases:
    out, log = run(re.sub(r'\W+', '-', name), CARD + args, env)
    check(f'same words and odds: {name}', out == ref, log[-400:] if out is None else '')
    if name == 'cache, misses on the card':
        m = re.search(r'MoE cache size =\s+[\d.]+ MiB for ([\d.]+) MiB of host experts', log)
        check('host experts counted once (8 layers)', m is not None and abs(float(m.group(1)) - 24.0) < 0.01, m.group(0) if m else 'no line')
        h = re.search(r'ubatch <= 8: hits = (\d+), misses = (\d+)', log)
        rate = int(h.group(1)) / max(1, int(h.group(1)) + int(h.group(2))) if h else 0.0
        check('a small cache hits across the passes (over 50%)', rate > 0.5, f'hit rate {rate:.0%}')

rpc.kill()
print('all passed' if fails == 0 else f'{fails} failed')
sys.exit(1 if fails else 0)
