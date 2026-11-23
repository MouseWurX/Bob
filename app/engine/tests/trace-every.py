#!/usr/bin/env python3
# Brain Engine 0018 test: the live trace sent every N written words (expert_trace_every), on the same tiny made-up
# mixture-of-experts brain as experts-per-word.py (16 experts, 2 per word, 4 layers).
#   python3 engine/tests/trace-every.py <llama.cpp checkout with the patches, built> [work folder]
import json, os, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: trace-every.py <llama.cpp checkout with the patches, built> [work folder]')
WORK = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='te-')
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
def stream(port, every):
    body = {'prompt': PROMPT, 'n_predict': 24, 'temperature': 0, 'ignore_eos': True, 'cache_prompt': False, 'stream': True, 'expert_trace': True, 'expert_trace_stream': True}
    if every: body['expert_trace_every'] = every
    rq = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=json.dumps(body).encode(), headers={'content-type': 'application/json'})
    words, parts, final = 0, [], None
    with urllib.request.urlopen(rq, timeout=120) as r:
        for line in r:
            line = line.decode().strip()
            if not line.startswith('data:'): continue
            ev = json.loads(line[5:])
            if ev.get('content'): words += 1
            if ev.get('expert_trace_part'): parts.append(ev['expert_trace_part'])
            if ev.get('expert_trace'): final = ev['expert_trace']
    return words, parts, final
ok = True
def check(name, cond):
    global ok
    print(('PASS ' if cond else 'FAIL ') + name); ok = ok and cond
srv = start(MODEL, 18091)
try:
    w1, p1, f1 = stream(18091, 0)
    w4, p4, f4 = stream(18091, 4)
    check(f'every word: a piece per word ({len(p1)} pieces, {w1} words)', len(p1) >= w1 - 1)
    check(f'every 4: about a quarter as many pieces ({len(p4)} for {w4} words)', 0 < len(p4) <= w4 // 4 + 2)
    check('the first word still gets a piece', p4 and p4[0]['from'] == p1[0]['from'])
    rows = lambda parts: [json.dumps(r['e']) for p in parts for r in p['rows']]
    check('no rows lost: the pieces together hold the same rows', rows(p1) == rows(p4))
    check('the full trace at the end is the same', f1 and f4 and f1['rows'] == f4['rows'])
finally:
    srv.terminate()
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
