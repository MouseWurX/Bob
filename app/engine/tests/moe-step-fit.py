#!/usr/bin/env python3
# Brain Engine 0064 test: the fitted reading step (LLAMA_MOE_STEP_FIT=1, with borrowed reading) and equal parts
# (LLAMA_EQUAL_PARTS=1). The step's working memory is fitted to a line (a + b x tokens) and the biggest step on a
# 256-token grid that the cache can lend is picked, not just a power of two; a read is cut into equal parts on that
# grid instead of full steps and a small rest. Stand-in card (ggml-rpc-server; build the checkout with GGML_RPC=ON).
# It checks that:
#   - the fitted step is on the 256 grid, at least the doubling's step, measured, and says so
#   - its words are those of a plain run reading at that step (same step, same words)
#   - equal parts cut a 1,536-token batch at step 1,024 into two of 768, with the words of a plain run at step 768
#   - both are off unless set (the same words and steps as without them)
#   python3 engine/tests/moe-step-fit.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-step-fit.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='stepfit-')
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
RPORT = 50281
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub, b='2048', share='0', cache='24', port=50282, model=None):
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
    words = []
    try:
        for prompt in (P1, P2):
            body = json.dumps({'prompt': prompt, 'n_predict': 40, 'temperature': 0, 'cache_prompt': False}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
            words.append(json.loads(urllib.request.urlopen(req, timeout=300).read())['content'])
    except Exception as e:
        words.append(f'ERROR {e}')
    p.terminate()
    try: p.wait(timeout=20)
    except Exception: p.kill()
    return words, open(log, errors='replace').read()
B = {'LLAMA_MOE_CACHE_BORROW': '1'}
ok = lambda w: len(w) == 2 and not any(x.startswith('ERROR') for x in w)
step_of = lambda e: [int(m) for m in re.findall(r'borrowed reading: reading step (\d+) \(own', e)]
try:
    dbl, derr = serve('borrow-doubling', B, 64)
    fit, ferr = serve('borrow-fit', {**B, 'LLAMA_MOE_STEP_FIT': '1'}, 64)
    d, f = (step_of(derr) or [0])[-1], (step_of(ferr) or [0])[-1]
    check('the fitted step is on the 256 grid, at least the doubling\'s, and logged', f % 256 == 0 and f >= d > 64 and 'fitted step: need =' in ferr, f'{d} {f} ' + ferr[-400:])
    plain, _ = serve('plain-at-fit', {}, f or 64)
    check('the fitted step\'s words are a plain run\'s at that step', ok(fit) and fit == plain, f'{fit} vs {plain}')
    check('off unless set: the doubling picks a power of two', d & (d - 1) == 0 and 'fitted step' not in derr)
    eq, eerr = serve('equal-parts', {'LLAMA_EQUAL_PARTS': '1'}, 1024, b='1536')
    parts = re.findall(r'equal parts: (\d+) tokens in (\d+) parts of up to (\d+) \(step (\d+)\)', eerr)
    check('equal parts cut a 1,536-token batch at step 1,024 into two of 768', ('1536', '2', '768', '1024') in parts, f'{parts[:4]}')
    p768, _ = serve('plain-768', {}, 768, b='1536')
    check('equal parts: the words of a plain run at step 768', ok(eq) and eq == p768, f'{eq} vs {p768}')
    noeq, nerr = serve('no-equal-parts', {}, 1024, b='1536')
    check('off unless set: no equal parts line', 'equal parts:' not in nerr and ok(noeq))
    print(f'info: doubling step {d}, fitted step {f}; equal parts {parts[:2]}; equal-parts words same as step 1024 plain: {eq == noeq}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
