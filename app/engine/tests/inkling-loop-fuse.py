#!/usr/bin/env python3
# Brain Engine 0111 test: Inkling's fused loop controllers. With LLAMA_INKLING_FUSE unset (all on) a looped brain must give
# the same words and the same odds, bit for bit, as with LLAMA_INKLING_FUSE=0 (the graph of 0090), in fewer steps.
# A tiny made-up brain: test-llama-archs writes an 8-layer inkling2 (32 experts, 4 per word) and this script adds the loop
# (layers 2 to 5 run three times), with blocks of 1 and of 2 layers. It checks:
#   - on the processor (mapped and read in, a step of 8, 4 threads), on the stand-in card (a step of 8, the MoE cache) and
#     half on the card: same words, same top-5 odds at every word, fewer graph nodes, and the log says how much it fused
#   - the plain inkling2 (no loop: only the shared block norms apply) the same way
#   python3 engine/tests/inkling-loop-fuse.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: inkling-loop-fuse.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='loop-fuse-')
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
def make_loop(BLOCK):
  # the loop's ends must be whole blocks
  brain = os.path.join(WORK, f'loop-b{BLOCK}.gguf')
  START, END, RANK = 2, 6, 8
  r = GGUFReader(plain)
  w = GGUFWriter(brain, 'inkling2_loop')
  n_embd = None
  for f in r.fields.values():
      if f.name.startswith('GGUF.') or f.name == 'general.architecture':
          continue
      name = f.name.replace('inkling2.', 'inkling2_loop.', 1) if f.name.startswith('inkling2.') else f.name
      if name == 'inkling2_loop.attn_res.block_size':
          w.add_uint32(name, BLOCK)  # the loop's ends must be whole blocks
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
  return brain

RPORT = 50331
rpc_bin = os.path.join(BIN, 'ggml-rpc-server') if os.path.exists(os.path.join(BIN, 'ggml-rpc-server')) else os.path.join(BIN, 'rpc-server')
rpc = subprocess.Popen([rpc_bin, '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       env={**os.environ, 'GGML_RPC_TEST_OFFLOAD': '1'})
time.sleep(1.5)

def serve(tag, args, env=None, port=50332):
    global brain
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
        {'prompt': prompt, 'n_predict': 24, 'temperature': 0, 'cache_prompt': False, 'n_probs': 5}).encode(),
        headers={'Content-Type': 'application/json'})
    d = json.loads(urllib.request.urlopen(req, timeout=300).read())
    return d['content'], [(p.get('id'), p.get('logprob', 0.0), [(q.get('id'), q.get('logprob')) for q in p.get('top_logprobs', [])]) for p in d.get('completion_probabilities', [])]

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
OFF = {'LLAMA_INKLING_FUSE': '0'}

def fused_line(log):
    m = re.search(r'fused loop controllers: q, k, v together in (\d+) of (\d+) layers, gain and forget together in (\d+) of (\d+)', log)
    return m.groups() if m else None

def nodes(log):
    m = re.search(r'graph(?: \(pp bs=\d+, tg bs=\d+\))?: nodes = (\d+)', log)
    return int(m.group(1)) if m else None

# 'all': every group is side by side; 'mmap': the file's order decides (here gain and forget are, the downs are not)
SETUPS = [
    ('processor, mapped', ['--load-mode', 'mmap'], 'mmap'),
    ('processor, read in', ['--load-mode', 'none'], 'all'),
    ('processor, step of 8', ['--load-mode', 'none', '-ub', '8', '-b', '8'], 'all'),
    ('processor, 4 threads', ['--load-mode', 'none', '-t', '4'], 'all'),
    ('stand-in card', CARD, 'all'),
    ('stand-in card, step of 8', CARD + ['-ub', '8', '-b', '8'], 'all'),
    ('stand-in card, MoE cache', CARD + ['--moe-cache-mib', '3', '--moe-cache-cpu-share', '0.5'], 'all'),
    ('half on the card', ['--rpc', f'127.0.0.1:{RPORT}', '-ngl', '5', '--load-mode', 'none'], 'all'),
]
for block in (1, 2):
    brain = make_loop(block)
    for name, args, want in SETUPS:
        name = f'blocks of {block}, {name}'
        ref, rlog = run('off', args, OFF)
        out, log = run('on', args)
        check(f'{name}: loads both ways', ref is not None and out is not None, (log or '')[-300:])
        if ref is None or out is None:
            continue
        check(f'{name}: LLAMA_INKLING_FUSE=0 says off', 'fused loop controllers off' in rlog)
        fl = fused_line(log)
        check(f'{name}: says how much it fused', fl is not None, log[-300:])
        if fl and want == 'all':
            check(f'{name}: everything fused', fl[0] == fl[1] and fl[2] == fl[3], str(fl))
        if fl and want == 'mmap':
            check(f'{name}: gain and forget fused from the file', fl[2] == fl[3], str(fl))
        check(f'{name}: same words', [c for c, _ in out] == [c for c, _ in ref])
        check(f'{name}: same odds, bit for bit (top 5 at every word)', out == ref)
        n_off, n_on = nodes(rlog), nodes(log)
        check(f'{name}: fewer steps ({n_off} -> {n_on} graph nodes)', n_off and n_on and n_on < n_off)

brain = plain
for name, args in [('processor', ['--load-mode', 'none']), ('stand-in card', CARD), ('step of 8', ['-ub', '8', '-b', '8'])]:
    ref, _ = run('off', args, OFF)
    out, _ = run('on', args)
    check(f'plain inkling2, {name}: same words and odds, bit for bit', ref is not None and out == ref)

rpc.terminate()
print('all passed' if not fails else f'{fails} FAILED')
sys.exit(1 if fails else 0)
