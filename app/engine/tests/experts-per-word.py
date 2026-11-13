#!/usr/bin/env python3
# Brain Engine 0013 test: experts per word changed live on a tiny made-up mixture-of-experts brain (16 experts, 2 per
# word, 4 layers, random weights; the qwen2 word list from llama.cpp's models/ folder).
#   python3 engine/tests/experts-per-word.py <llama.cpp checkout with the patches, built> [work folder]
# It needs llama-server built in <checkout>/build/bin, numpy, and the checkout's gguf-py. Checks: switching 2 -> 3 -> 2
# -> 4 live gives the same words and the same odds as starting with --override-kv at that count; one count per layer
# is used layer by layer (seen in the expert trace, mass included); the refusals (too many, wrong layer count, more
# than the expert mask keeps, a mask narrower than the count, while answering).
import json, os, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: experts-per-word.py <llama.cpp checkout with the patches, built> [work folder]')
WORK = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='epw-')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
import gguf
from gguf import GGUFReader, GGUFWriter, GGUFValueType
BIN = os.path.join(SRC, 'build', 'bin', 'llama-server')

def make_moe(out, used=2):
    vocab = GGUFReader(os.path.join(SRC, 'models', 'ggml-vocab-qwen2.gguf'))
    E, L, D, H, HKV, HD, FF = 16, 4, 64, 4, 2, 16, 32
    w = GGUFWriter(out, 'qwen3moe')
    w.add_context_length(512); w.add_embedding_length(D); w.add_block_count(L)
    w.add_feed_forward_length(FF); w.add_head_count(H); w.add_head_count_kv(HKV)
    w.add_key_length(HD); w.add_value_length(HD)
    w.add_rope_freq_base(10000.0); w.add_layer_norm_rms_eps(1e-6)
    w.add_expert_count(E); w.add_expert_used_count(used); w.add_expert_feed_forward_length(FF)
    w.add_file_type(0)
    n_vocab = 0
    for f in vocab.fields.values():
        if not f.name.startswith('tokenizer.'): continue
        t = f.types[0]
        if t == GGUFValueType.ARRAY:
            vals = f.contents(); w.add_array(f.name, vals)
            if f.name == 'tokenizer.ggml.tokens': n_vocab = len(vals)
        else:
            w.add_key_value(f.name, f.contents(), t)
    rng = np.random.default_rng(1)
    def r(*shape, s=0.08): return (rng.standard_normal(shape) * s).astype(np.float32)
    w.add_tensor('token_embd.weight', r(n_vocab, D, s=0.5))
    w.add_tensor('output_norm.weight', np.ones(D, np.float32))
    w.add_tensor('output.weight', r(n_vocab, D, s=0.5))
    for i in range(L):
        p = f'blk.{i}.'
        w.add_tensor(p+'attn_norm.weight', np.ones(D, np.float32))
        w.add_tensor(p+'attn_q.weight', r(H*HD, D)); w.add_tensor(p+'attn_k.weight', r(HKV*HD, D)); w.add_tensor(p+'attn_v.weight', r(HKV*HD, D))
        w.add_tensor(p+'attn_output.weight', r(D, H*HD))
        w.add_tensor(p+'attn_q_norm.weight', np.ones(HD, np.float32)); w.add_tensor(p+'attn_k_norm.weight', np.ones(HD, np.float32))
        w.add_tensor(p+'ffn_norm.weight', np.ones(D, np.float32))
        w.add_tensor(p+'ffn_gate_inp.weight', r(E, D, s=0.6))
        w.add_tensor(p+'ffn_gate_exps.weight', r(E, FF, D, s=0.3)); w.add_tensor(p+'ffn_up_exps.weight', r(E, FF, D, s=0.3)); w.add_tensor(p+'ffn_down_exps.weight', r(E, D, FF, s=0.3))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

MODEL = os.path.join(WORK, 'moe-k2.gguf')
if not os.path.exists(MODEL): make_moe(MODEL)
def start(model, port, extra=()):
    p = subprocess.Popen([BIN, '-m', model, '--port', str(port), '-c', '512', '-np', '1', '-t', '2', *extra],
                         stdout=subprocess.DEVNULL, stderr=open(os.path.join(WORK, f'srv-{port}.log'), 'w'))
    for _ in range(200):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); return p
        except Exception: time.sleep(0.2)
    raise SystemExit('server did not start')
def req(port, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=data, headers={'Content-Type': 'application/json'})
    try:
        return json.loads(urllib.request.urlopen(r, timeout=60).read())
    except urllib.error.HTTPError as e:
        return {'_status': e.code, **json.loads(e.read())}
PROMPT = 'The quick brown fox jumps over the lazy dog because'
def gen(port):
    r = req(port, '/completion', {'prompt': PROMPT, 'n_predict': 40, 'temperature': 0, 'n_probs': 3, 'cache_prompt': True})
    return r['tokens'] if 'tokens' in r else r['content'], [[round(t['logprob'], 4) for t in x['top_logprobs']] for x in r['completion_probabilities']]
def same(a, b):
    return a[0] == b[0] and all(abs(x - y) < 2e-3 for ra, rb in zip(a[1], b[1]) for x, y in zip(ra, rb))
ok = True
def check(name, cond):
    global ok; ok = ok and cond; print(('PASS ' if cond else 'FAIL ') + name)

refs = {}
for k in (2, 3, 4):
    p = start(MODEL, 18100 + k, ['--override-kv', f'qwen3moe.expert_used_count=int:{k}'])
    refs[k] = gen(18100 + k); p.terminate(); p.wait()
check('reference counts give different answers', refs[2] != refs[3])

live = start(MODEL, 18090)
g = req(18090, '/experts-per-word')
check('GET shows own count 2 and nothing live', g['own'] == [2]*4 and g['used'] == [2]*4 and g['live'] is False)
check('live 2 (start) matches --override-kv 2', same(gen(18090), refs[2]))
r = req(18090, '/experts-per-word', {'used': 3})
check('POST 3 accepted', r.get('used') == [3]*4 and r.get('live') is True)
check('live 3 matches --override-kv 3', same(gen(18090), refs[3]))
r = req(18090, '/experts-per-word', {'used': 2})
check('POST 2 back, live off again', r.get('used') == [2]*4 and r.get('live') is False)
check('live back to 2 matches --override-kv 2', same(gen(18090), refs[2]))
req(18090, '/experts-per-word', {'used': 4}); check('live 4 matches --override-kv 4', same(gen(18090), refs[4]))
req(18090, '/experts-per-word', {'used': None}); check('null = own count again', same(gen(18090), refs[2]))

# per layer: the expert trace shows how many experts each layer picked for every token
r = req(18090, '/experts-per-word', {'used': [3, 2, 4, None]})
check('per-layer POST accepted', r.get('used') == [3, 2, 4, 2])
t = req(18090, '/completion', {'prompt': PROMPT, 'n_predict': 8, 'temperature': 0, 'expert_trace': True, 'cache_prompt': False})
rows = t['expert_trace']['rows']
# (the last layer is only worked out where a word is written, so it is empty for the prompt's earlier tokens)
bad = [row['e'] for row in rows if any(len(l) not in (0, n) for l, n in zip(row['e'], (3, 2, 4, 2))) or not all(row['e'][:3])]
full = sum(1 for row in rows if [len(l) for l in row['e']] == [3, 2, 4, 2])
check('trace: each layer picked its own count, 3,2,4,2 (%d rows, %d with all four layers)' % (len(rows), full), not bad and full >= 8)
# per-layer mass and pick counts still come back
t = req(18090, '/completion', {'prompt': PROMPT, 'n_predict': 4, 'temperature': 0, 'expert_trace': True, 'expert_trace_mass': True, 'cache_prompt': False})
tr = t['expert_trace']
check('trace mass comes back with per-layer counts', tr.get('mass') is not None and sum(tr['layers'][1]) == 2*sum(1 for row in tr['rows'] if row['e'][1]))
req(18090, '/experts-per-word', {'used': None})

# refusals
check('17 refused (only 16 experts)', req(18090, '/experts-per-word', {'used': 17}).get('_status') == 400)
check('wrong layer count refused', req(18090, '/experts-per-word', {'used': [3, 3]}).get('_status') == 400)
check('no "used" refused', req(18090, '/experts-per-word', {}).get('_status') == 400)
# the mask keeps 3 in each layer: 4 per word is refused, 3 is fine
req(18090, '/expert-mask', {'keep': [0, 1, 2]})
check('more than the mask keeps refused', req(18090, '/experts-per-word', {'used': 4}).get('_status') == 400)
check('as many as the mask keeps accepted', req(18090, '/experts-per-word', {'used': 3}).get('used') == [3]*4)
check('mask narrower than the live count refused', req(18090, '/expert-mask', {'keep': [0, 1]}).get('_status') == 400)
req(18090, '/expert-mask', {'keep': None}); req(18090, '/experts-per-word', {'used': None})
check('after all that, still matches 2', same(gen(18090), refs[2]))
# busy refusal: start a long streaming request, then try to switch
import threading
t = threading.Thread(target=lambda: req(18090, '/completion', {'prompt': PROMPT, 'n_predict': 400, 'temperature': 0, 'ignore_eos': True}))
t.start(); time.sleep(0.3)
r = req(18090, '/experts-per-word', {'used': 3}); t.join()
check('refused while answering' + ('' if r.get('_status') == 400 else ' (request finished first: %s)' % r), r.get('_status') == 400)
live.terminate(); live.wait()
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
