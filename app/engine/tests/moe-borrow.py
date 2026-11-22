#!/usr/bin/env python3
# Brain Engine 0048 test: borrowed reading (LLAMA_MOE_CACHE_BORROW=1). Reading steps bigger than -ub borrow the MoE
# cache's coldest slots for working memory; nothing is freed or allocated at a switch. The cache needs a card, so a
# stand-in card runs on this machine (ggml-rpc-server; build the checkout with GGML_RPC=ON). It checks that:
#   - it turns on, measures each step and picks a bigger reading step than -ub
#   - a second long read after writing moves the hot experts out of the lent slots (or drops them) and says so
#   - the words are the same as a plain run that owns that bigger step's working memory (same step, same words),
#     over two long reads with writing in between
#   - it refuses (NOT USED) next to the CPU share and the old lend switch, and the words are those of a plain run
#   python3 engine/tests/moe-borrow.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-borrow.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='borrow-')
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
RPORT = 50241
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, ub, b='2048', share='0', cache='24', port=50242, model=None):
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
try:
    on, err = serve('borrow', {'LLAMA_MOE_CACHE_BORROW': '1'}, 64)
    step = re.findall(r'borrowed reading: reading step (\d+) \(own (\d+)\)', err)
    check('borrowing turns on', 'borrowed reading on' in err, err[-400:])
    check('it measures the steps', 'borrowed reading: step    64 needs' in err)
    big = int(step[-1][0]) if step else 0
    check('it picks a reading step bigger than -ub 64', big > 64, f'{step}')
    check('a region is made with the cache behind the working memory', 'borrowed reading: region' in err)
    moved = re.findall(r'MiB lent \((\d+) slots\): (\d+) experts moved on the card, (\d+) dropped', err)
    check('the second long read empties the lent slots (moves or drops) and says so', len(moved) > 0 and any(int(m[1]) + int(m[2]) > 0 for m in moved), f'{moved}')
    check('both answers came back', len(on) == 2 and not any(w.startswith('ERROR') for w in on), f'{on}')
    plain, perr = serve('plain-big', {}, big if big else 64, cache='24')
    check('the same words as a plain run reading at that step', on == plain, f'{on} vs {plain}')
    _, err2 = serve('borrow-share', {'LLAMA_MOE_CACHE_BORROW': '1'}, 64, share='0.5')
    check('next to the CPU share it says NOT USED', 'LLAMA_MOE_CACHE_BORROW NOT USED' in err2)
    w3, err3 = serve('borrow-lend', {'LLAMA_MOE_CACHE_BORROW': '1', 'LLAMA_MOE_CACHE_LEND': '48'}, 64)
    w3p, _ = serve('plain-lend', {'LLAMA_MOE_CACHE_LEND': '48'}, 64)
    check('next to LLAMA_MOE_CACHE_LEND it says NOT USED and answers as the lend run', 'LLAMA_MOE_CACHE_BORROW NOT USED' in err3 and w3 == w3p, f'{w3} vs {w3p}')
    # 0052: banks of different types (Q4_K gates, Q8_0 downs, 144 and 34 byte blocks). The card's kernels take the
    # expert stride in blocks of each type, so the striped slot is padded to whole blocks; the words stay the same.
    mixed = os.path.join(WORK, 'moe-wide-q4k-q8down.gguf')
    if not os.path.exists(mixed):
        subprocess.run([os.path.join(BIN, 'llama-quantize'), '--tensor-type', 'ffn_down_exps=q8_0', brain, mixed, 'Q4_K_M'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    mon, merr = serve('borrow-mixed', {'LLAMA_MOE_CACHE_BORROW': '1'}, 64, cache='12', model=mixed)
    mstep = re.findall(r'borrowed reading: reading step (\d+) \(own (\d+)\)', merr)
    check('mixed block types: every bank is lent, padded to whole blocks', 'every bank, laid out slot by slot, padded to whole blocks' in merr, merr[-600:])
    mbig = int(mstep[-1][0]) if mstep else 64
    mplain, _ = serve('plain-mixed', {}, mbig, cache='12', model=mixed)
    check('mixed block types: the same words as a plain run at that step', mbig > 64 and mon == mplain and len(mon) == 2 and not any(w.startswith('ERROR') for w in mon), f'{mon} vs {mplain}')
    w4, _ = serve('plain-own', {}, 64)
    print(f'info: reading step {big}; borrowed words same as -ub 64 plain: {w4 == on}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
