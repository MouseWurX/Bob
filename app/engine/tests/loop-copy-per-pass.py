#!/usr/bin/env python3
# Brain Engine 0151 test: GGML_SCHED_WEIGHT_COPY_PER_SPLIT, the fixed working memory of a looped brain with its experts
# in RAM. A long read (a step over 32 tokens) copies each layer's weights in RAM to the card (op offload). A looped brain's
# passes share their weights, so the scheduler's one copy per weight stayed in the working memory from the first pass to
# the last: Inkling 2 Mini's whole looped core (12 layers of experts, about 4 GB) at any step. With the switch each split
# gets its own copy, freed when the split is done, and each pass copies only the experts it picked.
# The same tiny made-up looped brain as moe-loops.py (8 layers, layers 2 to 5 run three times), on the stand-in card
# (ggml-rpc-server, GGML_RPC_TEST_OFFLOAD=1). It checks that:
#   - the same words and odds as the processor alone, with the switch off and on: experts in RAM, every layer in RAM,
#     with the MoE cache, at a step of 8 and of 64
#   - the stand-in card's working memory is smaller with the switch on (experts in RAM, and every layer in RAM)
#   - a brain without a loop (plain inkling2) gets the same words and the same working memory either way
#   - the log says it is on
#   python3 engine/tests/loop-copy-per-pass.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-loops.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='copy-per-pass-')
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

RPORT = 50341
rpc_bin = os.path.join(BIN, 'ggml-rpc-server') if os.path.exists(os.path.join(BIN, 'ggml-rpc-server')) else os.path.join(BIN, 'rpc-server')
rpc = subprocess.Popen([rpc_bin, '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       env={**os.environ, 'GGML_RPC_TEST_OFFLOAD': '1'})
time.sleep(1.5)

def serve(tag, args, env=None, port=50342):
    log = os.path.join(WORK, f'{tag}.log')
    cmd = [os.path.join(BIN, 'llama-server'), '-m', BRAIN.get(tag, brain), '-c', '1024', '-np', '1', '-t', '2', '--port', str(port), '-lv', '4'] + args
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

BRAIN = {}
PROMPTS = ['hello world, this is a test',
           'hello world, this is a test of the looped model with a much longer prompt so that the reading step is bigger '
           'than thirty two tokens and the copies to the card run, one two three four five six seven eight nine ten '
           'eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty and some more words']
CARD = ['--rpc', f'127.0.0.1:{RPORT}', '-fit', 'off']
ON = {'GGML_SCHED_WEIGHT_COPY_PER_SPLIT': '1'}

def card_compute(log):
    sizes = [float(m.group(1)) for m in re.finditer(r'RPC0\S* compute buffer size\s*=\s*([\d.]+) MiB', log)]
    return sizes[-1] if sizes else None

ref, log = run('cpu', ['-fit', 'off'])
check('loads and writes on the processor', ref is not None and all(len(c) > 0 for c, _ in ref), log[-400:])
setups = [
    ('experts in RAM', ['-ngl', '99', '--n-cpu-moe', '99']),
    ('every layer in RAM', ['-ngl', '0']),
    ('experts in RAM, step of 8', ['-ngl', '99', '--n-cpu-moe', '99', '-ub', '8', '-b', '8']),
    ('experts in RAM, step of 64', ['-ngl', '99', '--n-cpu-moe', '99', '-ub', '64', '-b', '64']),
    ('experts in RAM, MoE cache', ['-ngl', '99', '--n-cpu-moe', '99', '--moe-cache-mib', '3', '--moe-cache-cpu-share', '0']),
]
for name, args in setups:
    tag = re.sub(r'\W+', '-', name)
    off, log_off = run(tag + '-off', CARD + args)
    on, log_on = run(tag + '-on', CARD + args, ON)
    check(f'same words and odds, switch off: {name}', off == ref, log_off[-400:] if off is None else '')
    check(f'same words and odds, switch on: {name}', on == ref, log_on[-400:] if on is None else '')
    check(f'says it is on: {name}', 'copy per split' in log_on and 'NOT USED' not in log_on)
    a, b = card_compute(log_off), card_compute(log_on)
    print(f'  {name}: card working memory {a} MiB off, {b} MiB on')
    if name in ('experts in RAM', 'every layer in RAM'):
        check(f'smaller working memory on the card: {name}', a is not None and b is not None and b < a - 1, f'{a} -> {b}')

# a brain without a loop: nothing changes
BRAIN.update({k: plain for k in ['plain-cpu', 'plain-off', 'plain-on']})
pref, _ = run('plain-cpu', ['-fit', 'off'])
poff, plog_off = run('plain-off', CARD + ['-ngl', '99', '--n-cpu-moe', '99'])
pon, plog_on = run('plain-on', CARD + ['-ngl', '99', '--n-cpu-moe', '99'], ON)
check('no loop: same words and odds', pref is not None and poff == pref and pon == pref)
check('no loop: same working memory', card_compute(plog_off) == card_compute(plog_on), f'{card_compute(plog_off)} vs {card_compute(plog_on)}')

rpc.kill()
print('all passed' if fails == 0 else f'{fails} failed')
sys.exit(1 if fails else 0)
