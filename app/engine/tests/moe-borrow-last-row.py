#!/usr/bin/env python3
# Brain Engine 0063 test: a long read's last step, whose last layer works out only the last token (one row), must not
# fill the cache's lent slots (rewarm 0056, or a miss) while that graph's working memory lives there. Borrowed reading
# (LLAMA_MOE_CACHE_BORROW=1) with a small own part (-ub 16) showed it: the first word's odds were another brain's.
# Stand-in card (ggml-rpc-server; build with GGML_RPC=ON). It checks that:
#   - borrowed reading at -ub 16 gives the first word's odds and the words of a plain run at its reading step
#   - the same with rewarm off (LLAMA_MOE_CACHE_REWARM=0)
#   - rewarm still puts the dropped experts back before writing
#   python3 engine/tests/moe-borrow-last-row.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-step-fit.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='lastrow-')
BIN = os.path.join(SRC, 'build', 'bin')
sys.path.insert(0, os.path.join(SRC, 'gguf-py'))
import numpy as np
from gguf import GGUFReader, GGUFWriter, GGUFValueType

def make_moe(out):
    # wide experts, so the cache is big next to the working memory, as on a real brain
    vocab = GGUFReader(os.path.join(SRC, 'models', 'ggml-vocab-qwen2.gguf'))
    E, L, D, H, HKV, HD, FF, used = 32, 4, 256, 4, 2, 64, 512, 4
    w = GGUFWriter(out, 'qwen3moe')
    w.add_context_length(4096); w.add_embedding_length(D); w.add_block_count(L)
    w.add_feed_forward_length(FF); w.add_head_count(H); w.add_head_count_kv(HKV)
    w.add_key_length(HD); w.add_value_length(HD)
    w.add_rope_freq_base(10000.0); w.add_layer_norm_rms_eps(1e-6)
    w.add_expert_count(E); w.add_expert_used_count(used); w.add_expert_feed_forward_length(FF)
    w.add_file_type(1)
    n_vocab = 0
    for f in vocab.fields.values():
        if not f.name.startswith('tokenizer.'): continue
        t = f.types[0]
        if t == GGUFValueType.ARRAY:
            vals = f.contents(); w.add_array(f.name, vals)
            if f.name == 'tokenizer.ggml.tokens': n_vocab = len(vals)
        else:
            w.add_key_value(f.name, f.contents(), t)
    rng = np.random.default_rng(7)
    def r(*shape, s=0.08, dt=np.float16): return (rng.standard_normal(shape) * s).astype(dt)
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
        w.add_tensor(p+'ffn_gate_inp.weight', r(E, D, s=0.6, dt=np.float32))
        w.add_tensor(p+'ffn_gate_exps.weight', r(E, FF, D, s=0.3)); w.add_tensor(p+'ffn_up_exps.weight', r(E, FF, D, s=0.3)); w.add_tensor(p+'ffn_down_exps.weight', r(E, D, FF, s=0.3))
    w.write_header_to_file(); w.write_kv_data_to_file(); w.write_tensors_to_file(); w.close()

os.makedirs(WORK, exist_ok=True)
brain = os.path.join(WORK, 'moe-wide.gguf')
if not os.path.exists(brain): make_moe(brain)
P1 = ' '.join(f'apple{i} river{i % 7}' for i in range(500))
P2 = ' '.join(f'stone{i % 13} cloud{i}' for i in range(450))
P0 = ' '.join(f'leaf{i % 5} wind{i}' for i in range(60))
PROMPTS = (P0, P1, P2)
RPORT = 50301
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
odds = []
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub, b='2048', share='0', cache='24', port=50302, model=None):
    log = os.path.join(WORK, f'{tag}.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', model or brain, '--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '--n-cpu-moe', '4',
                          '--moe-cache-mib', cache, '--moe-cache-cpu-share', share, '-c', '4096', '-np', '1', '-t', '2',
                          '-b', b, '-ub', str(ub), '--port', str(port), '-lv', '4', '--no-warmup'] + (['--no-repack'] if model else []),
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'), env={**os.environ, **env})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception:
            if p.poll() is not None: break
            time.sleep(0.3)
    words = []; odds.clear()
    try:
        for prompt in PROMPTS:
            body = json.dumps({'prompt': prompt, 'n_predict': 40, 'temperature': 0, 'cache_prompt': False, 'n_probs': 3}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
            r = json.loads(urllib.request.urlopen(req, timeout=300).read()); words.append(r['content']); odds.append([(t['token'], round(t['logprob'], 3)) for t in r['completion_probabilities'][0]['top_logprobs']])
    except Exception as e:
        words.append(f'ERROR {e}')
    p.terminate()
    try: p.wait(timeout=20)
    except Exception: p.kill()
    return words, open(log, errors='replace').read()
B = {'LLAMA_MOE_CACHE_BORROW': '1'}
PROMPTS = (P1, P2)
ok = lambda w: len(w) == 2 and not any(x.startswith('ERROR') for x in w)
step_of = lambda e: [int(m) for m in re.findall(r'borrowed reading: reading step (\d+) \(own', e)]
try:
    bw, berr = serve('borrow-16', B, 16); bo = list(odds)
    st = (step_of(berr) or [0])[-1]
    plain, _ = serve('plain-at-step', {}, st or 1024); po = list(odds)
    check('borrowed reading at -ub 16: the first word\'s odds and the words of a plain run at its step', ok(bw) and bw == plain and bo == po, f'step {st}: {bo} vs {po}')
    nr, _ = serve('borrow-16-norewarm', {**B, 'LLAMA_MOE_CACHE_REWARM': '0'}, 16); no = list(odds)
    check('the same with rewarm off', ok(nr) and nr == plain and no == po, f'{no} vs {po}')
    check('rewarm still puts the dropped experts back before writing', 'rewarm put back' in berr and 'MiB lent' in berr, berr[-400:])
    print(f'info: reading step {st}; first-word odds {bo}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
