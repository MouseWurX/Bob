#!/usr/bin/env python3
# Brain Engine 0058 test: borrowed reading (0048) next to a processor share, the doorbell (0042) and the learning
# cache (0031): Avalon's way for long reads, the card and the processor at once while writing. The stand-in card
# (ggml-rpc-server) can't ring the card's doorbell, so the processor's own ring (LLAMA_MOE_DOORBELL_CPU_RING=1) stands
# in, as in moe-doorbell.py. It checks that:
#   - borrowing turns on with a share of 1 and of 0.5, lends slots on the second long read, and the zero slots stay zero
#     (the same words as a plain run reading at that step with the same share)
#   - with the doorbell on as well, it rings while writing, the processor answers, and the words are the same again
#     at share 1 (below 1 the doorbell's words follow what the cache holds, so only that it answers)
#   - with the learning cache on as well, it runs and answers (learning changes the words, so no words check)
#   - look-ahead is still refused
#   python3 engine/tests/moe-borrow-doorbell.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-borrow-doorbell.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='borrow-db-')
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
RPORT = 50261
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub, b='2048', share='0', cache='24', port=50262, model=None):
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
RING = {'LLAMA_MOE_DOORBELL': '1', 'LLAMA_MOE_DOORBELL_CPU_RING': '1'}
B = {'LLAMA_MOE_CACHE_BORROW': '1'}
def bell(err):
    m = re.findall(r'doorbell: (\d+) rings, (\d+) with processor work', err)
    return (int(m[-1][0]), int(m[-1][1])) if m else (0, 0)
ok_words = lambda w: len(w) == 2 and not any(x.startswith('ERROR') for x in w)
try:
    for share in ('1', '0.5'):
        on, err = serve(f'borrow-share{share}', B, 64, share=share)
        step = re.findall(r'borrowed reading: reading step (\d+) \(own (\d+)\)', err)
        big = int(step[-1][0]) if step else 0
        check(f'share {share}: borrowing turns on and picks a bigger step', 'borrowed reading on' in err and 'BORROW NOT USED' not in err and big > 64, err[-500:])
        lent = re.findall(r'MiB lent \((\d+) slots\): (\d+) experts moved on the card, (\d+) dropped', err)
        check(f'share {share}: the second long read lends slots', any(int(m[1]) + int(m[2]) > 0 for m in lent), f'{lent}')
        plain, _ = serve(f'plain-share{share}', {}, big or 64, share=share)
        check(f'share {share}: the same words as a plain run at that step (the zero slots stayed zero)', ok_words(on) and on == plain, f'{on} vs {plain}')
        db, derr = serve(f'borrow-doorbell-share{share}', {**B, **RING}, 64, share=share)
        rings, work = bell(derr)
        check(f'share {share}: with the doorbell, borrowing stays on and it rings while writing', 'borrowed reading on' in derr and rings > 0 and work > 0, f'{rings} {work} ' + derr[-500:])
        # share 1, learning off: the doorbell gives the old path's words. Below 1, which misses the doorbell sends up
        # depends on what the cache holds, and borrowing changes that, so the words can differ (as with any change to the
        # cache under 0042 below share 1: its drift gate applies). There it must run, ring and answer.
        if share == '1':
            check('share 1: with the doorbell, the same words as a plain run', ok_words(db) and db == plain, f'{db} vs {plain}')
        else:
            check(f'share {share}: with the doorbell, both answers', ok_words(db), f'{db}')
    ln, lerr = serve('borrow-doorbell-learn', {**B, **RING, 'LLAMA_MOE_CACHE_LEARN': '8'}, 64, share='1')
    check('with the learning cache as well: borrowing on, it rings, both answers', 'borrowed reading on' in lerr and bell(lerr)[0] > 0 and ok_words(ln), lerr[-500:])
    _, aerr = serve('borrow-lookahead', {**B, 'LLAMA_MOE_LOOKAHEAD': '4'}, 64, share='0')
    check('next to look-ahead it still says NOT USED', 'LLAMA_MOE_CACHE_BORROW NOT USED' in aerr)
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
