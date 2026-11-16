#!/usr/bin/env python3
# Brain Engine 0015 test: the odds of the prompt itself (prompt_odds), on a tiny made-up mixture-of-experts brain
# (16 experts, 2 per word, 4 layers, random weights; the qwen2 word list from llama.cpp's models/ folder).
#   python3 engine/tests/prompt-odds.py <llama.cpp checkout with the patches, built> [work folder]
# It needs llama-server built in <checkout>/build/bin, numpy, and the checkout's gguf-py. Checks: every row matches the
# engine's own n_probs when it writes that next token by itself (the reference); the same with a tiny n_ubatch (many
# batches) and with two slots busy at once; prompt_odds_from with the cache (the start is not read again); a prompt with
# nothing to score; the limit on K; a request without prompt_odds gets nothing new; refused unless the engine was started
# with --prompt-odds-max.
import json, os, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: prompt-odds.py <llama.cpp checkout with the patches, built> [work folder]')
WORK = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='podds-')
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
def start(port, extra=()):
    p = subprocess.Popen([BIN, '-m', MODEL, '--port', str(port), '-c', '1024', '-t', '2', *extra],
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
        return json.loads(urllib.request.urlopen(r, timeout=120).read())
    except urllib.error.HTTPError as e:
        return {'_status': e.code, **json.loads(e.read())}
ok = True
def check(name, cond):
    global ok; ok = ok and cond; print(('PASS ' if cond else 'FAIL ') + name)

TEXT = ('Bob reads the lesson, then the teacher says how likely each word was. The quick brown fox jumps over the lazy dog '
        'because it wants to see what is on the other side of the fence, and the dog does not mind at all.')
K = 8
A = 18150
srv = start(A, ['-np', '1', '--prompt-odds-max', '128'])
ids = req(A, '/tokenize', {'content': TEXT})['tokens']
N = len(ids)
check('prompt is long enough to need several small batches (%d tokens)' % N, N > 40)
def score(port, frm=1, cache=False, k=K, prompt=None):
    return req(port, '/completion', {'prompt': prompt or ids, 'n_predict': 0, 'temperature': 0, 'cache_prompt': cache,
                                     'prompt_odds': k, 'prompt_odds_from': frm})

# the reference: the engine writes one word after each prefix by itself and reports its own odds (n_probs, before sampling)
def ref_row(port, p):  # odds of token p after reading ids[:p]
    r = req(port, '/completion', {'prompt': ids[:p], 'n_predict': 1, 'temperature': 0, 'cache_prompt': False, 'n_probs': 64})
    top = r['completion_probabilities'][0]['top_logprobs']
    return [(t['id'], t['logprob']) for t in top]
ref = {p: ref_row(A, p) for p in range(1, N)}

def matches(o, frm, label):
    po = o.get('prompt_odds')
    if not po:
        check(label + ': prompt_odds came back', False); print(json.dumps(o)[:400]); return None
    good = po['from'] == frm and po['n'] == N - frm and po['k'] == K and po['missing'] == 0 and po['ids'] == ids[frm:]
    worst = 0.0; order = True; own_ok = True
    for r in range(po['n']):
        p = frm + r; rf = ref[p]
        if po['top_ids'][r] != [t for t, _ in rf[:K]]:
            # ties can swap places; accept when the logprobs agree
            if any(abs(a - b) > 2e-3 for a, b in zip(po['top'][r], [l for _, l in rf[:K]])): good = False
        worst = max(worst, max(abs(a - b) for a, b in zip(po['top'][r], [l for _, l in rf[:K]])))
        order = order and all(po['top'][r][i] >= po['top'][r][i + 1] for i in range(K - 1))
        own = dict(rf).get(ids[p])
        if own is not None and abs(own - po['own'][r]) > 2e-3: own_ok = False
        if po['own'][r] > po['top'][r][0] + 1e-4: own_ok = False
    check('%s: shape right, every row matches the reference (worst gap %.2g)' % (label, worst), good and worst < 2e-3)
    check(label + ': top lists most likely first', order)
    check(label + ': own token odds match where the reference lists it', own_ok)
    return po

base = matches(score(A), 1, 'whole prompt')
plain = req(A, '/completion', {'prompt': ids, 'n_predict': 2, 'temperature': 0, 'cache_prompt': False})
check('a request without prompt_odds gets no prompt_odds', 'prompt_odds' not in plain and plain.get('content') is not None)
check('K over 128 refused', score(A, k=129).get('_status') == 400)
r = score(A, frm=N + 5)
check('nothing to score: no rows, no error', r.get('prompt_odds', {}).get('n') == 0 and r['prompt_odds']['ids'] == [])

# the cache: read the prompt once, then score only from token 30 on; only the end should be read again
req(A, '/completion', {'prompt': ids, 'n_predict': 0, 'temperature': 0, 'cache_prompt': True})
c = score(A, frm=30, cache=True)
matches(c, 30, 'from 30 with the cache')
check('the cache was used (read %s of %d tokens)' % (c.get('timings', {}).get('prompt_n'), N),
      0 < c.get('timings', {}).get('prompt_n', N) <= N - 29 + 1)
srv.terminate(); srv.wait()

# many small batches: n_ubatch 8 means a row lands in a different batch from the one before it
B = 18151
srv = start(B, ['-np', '1', '-b', '8', '-ub', '8', '--prompt-odds-max', '8'])
matches(score(B), 1, 'batches of 8')
srv.terminate(); srv.wait()

# two slots at once: one scores while the other writes, and the rows are still right
C = 18152
srv = start(C, ['-np', '2', '--prompt-odds-max', '5'])
out = {}
t = threading.Thread(target=lambda: out.setdefault('w', req(C, '/completion', {'prompt': 'Once upon a time', 'n_predict': 64, 'temperature': 0, 'ignore_eos': True, 'cache_prompt': False})))
t.start(); time.sleep(0.05)
matches(score(C), 1, 'five places a batch, next to a busy slot')
t.join()
check('the other slot wrote its words', bool(out.get('w', {}).get('content')))
srv.terminate(); srv.wait()
# off unless the engine was started with --prompt-odds-max
D = 18153
srv = start(D, ['-np', '1'])
r = score(D)
check('without --prompt-odds-max a request is refused, and plain ones still work',
      r.get('_status') in (400, 501) and 'prompt-odds-max' in json.dumps(r) and req(D, '/completion', {'prompt': ids, 'n_predict': 2}).get('content') is not None)
srv.terminate(); srv.wait()
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
