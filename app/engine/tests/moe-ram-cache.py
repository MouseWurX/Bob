#!/usr/bin/env python3
# Brain Engine 0060 test: the RAM cache (LLAMA_MOE_RAM_CACHE_MIB=N, with the drive tier, LLAMA_MOE_DRIVE=1). Bob's own block
# of RAM for experts: misses are read from the drive (or copied from the map) into it and go up from there, so the next
# time they're RAM hits; a start fill from the ranking puts the busiest experts there first. The cache needs a card, so a stand-in card runs on this
# machine (ggml-rpc-server; build with GGML_RPC=ON). The brain here is small, so it sits in RAM; LLAMA_MOE_DRIVE_ALL=1
# reads every miss from the drive. It checks that:
#   - it turns on, misses come from it the second time, and the words are a plain run's
#   - a block too small for one layer's misses (1 MiB) still gives the same words (misses pass it by to the ring)
#   - plain memory (LLAMA_MOE_RAM_CACHE_PLAIN=1) and small pieces (LLAMA_MOE_RAM_CACHE_CHUNK_MIB=1) give the same words
#   - without _ALL, misses in RAM are copied in from the map, same words
#   - a start fill from a saved hot set reads experts into it before the first word, same words
#   - without the drive tier it says NOT USED
#   python3 engine/tests/moe-ram-cache.py <llama.cpp checkout with the patches, built with GGML_RPC=ON> [work folder]
import json, os, re, subprocess, sys, tempfile, time, urllib.request
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: moe-ram-cache.py <llama.cpp checkout, built> [work folder]')
WORK = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='ramc-')
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
P1 = ' '.join(f'apple{i} river{i % 7}' for i in range(300))
P2 = ' '.join(f'stone{i % 13} cloud{i}' for i in range(400))
RPORT = 50271
rpc = subprocess.Popen([os.path.join(BIN, 'ggml-rpc-server'), '-p', str(RPORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
def serve(tag, env, extra=(), port=50272):
    log = os.path.join(WORK, f'{tag}.log')
    p = subprocess.Popen([os.path.join(BIN, 'llama-server'), '-m', brain, '--rpc', f'127.0.0.1:{RPORT}', '-ngl', '99', '--n-cpu-moe', '4',
                          '--moe-cache-mib', '24', '--moe-cache-cpu-share', '0', '-c', '4096', '-np', '1', '-t', '2',
                          '-b', '2048', '-ub', '64', '--port', str(port), '-lv', '4', '--no-warmup', *extra],
                         stdout=subprocess.DEVNULL, stderr=open(log, 'w'),
                         env={**os.environ, 'LLAMA_MOE_CACHE_LOG_EVERY': '200', **env})
    for _ in range(300):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1).read(); break
        except Exception:
            if p.poll() is not None: break
            time.sleep(0.3)
    words = []
    try:
        for prompt, n in ((P1, 40), (P2, 120)):
            body = json.dumps({'prompt': prompt, 'n_predict': n, 'temperature': 0, 'cache_prompt': False, 'ignore_eos': True}).encode()
            req = urllib.request.Request(f'http://127.0.0.1:{port}/completion', data=body, headers={'Content-Type': 'application/json'})
            words.append(json.loads(urllib.request.urlopen(req, timeout=600).read())['content'])
    except Exception as e:
        words.append(f'ERROR {e}')
    p.terminate()
    try: p.wait(timeout=20)
    except Exception: p.kill()
    return words, open(log, errors='replace').read()
def runs(err):
    r = re.findall(r'drive tier: (\d+) runs read from the drive \(([\d.]+) MiB, [\d.]+ MiB/s while reading\), (\d+) misses were in RAM, (\d+) ring waits', err)
    return [tuple(int(float(x)) for x in t) for t in r]
def rc(err):
    r = re.findall(r'RAM cache: (\d+) misses came from it \(([\d.]+) MiB not read from the drive\), (\d+) read from the drive into it, (\d+) copied in from the map, (\d+) passed by \(full\), (\d+) from the start fill', err)
    return [tuple(int(float(x)) for x in t) for t in r]
D = {'LLAMA_MOE_DRIVE': '1', 'LLAMA_MOE_DRIVE_ALL': '1'}
try:
    plain, _ = serve('plain', {})
    check('the plain run answers', len(plain) == 2 and not any(w.startswith('ERROR') for w in plain), f'{plain}')
    on, err = serve('ram-cache', {**D, 'LLAMA_MOE_RAM_CACHE_MIB': '256'})
    r = rc(err)
    check('the RAM cache turns on', 'RAM cache on:' in err, err[-600:])
    check('misses are read from the drive into it, and come from it the next time', len(r) > 0 and r[-1][2] > 0 and r[-1][0] > 0, f'{r}')
    check('the words of a plain run', on == plain, f'{on} vs {plain}')
    tiny, terr = serve('ram-tiny', {**D, 'LLAMA_MOE_RAM_CACHE_MIB': '1'})
    rt = rc(terr)
    check('a 1 MiB block: misses pass it by to the ring, same words', len(rt) > 0 and rt[-1][4] > 0 and tiny == plain, f'{rt} {tiny == plain}')
    pl, perr = serve('ram-plain', {**D, 'LLAMA_MOE_RAM_CACHE_MIB': '48', 'LLAMA_MOE_RAM_CACHE_PLAIN': '1', 'LLAMA_MOE_RAM_CACHE_CHUNK_MIB': '1'})
    rp = rc(perr)
    check('plain memory in small pieces, evicting: same words', re.search(r'RAM cache on: \d+ MiB \(0 MiB pinned', perr) is not None and len(rp) > 0 and rp[-1][0] > 0 and pl == plain, f'{rp} {pl == plain}')
    mp, merr = serve('ram-map', {'LLAMA_MOE_DRIVE': '1', 'LLAMA_MOE_RAM_CACHE_MIB': '256'})
    rm = rc(merr)
    check('without _ALL, misses in RAM are copied in from the map, same words', len(rm) > 0 and rm[-1][3] > 0 and mp == plain, f'{rm} {mp == plain}')
    hot = os.path.join(WORK, 'hot-set.txt')
    if os.path.exists(hot): os.remove(hot)
    serve('save', {'LLAMA_MOE_CACHE_SAVE': hot, 'LLAMA_MOE_CACHE_SAVE_EVERY': '50'})
    pf, ferr = serve('ram-prefill', {**D, 'LLAMA_MOE_RAM_CACHE_MIB': '256', 'LLAMA_MOE_CACHE_RANKING': hot})
    fill = re.findall(r'RAM cache start fill: (\d+) expert matrices', ferr)
    check('a start fill from the saved hot set, same words', len(fill) > 0 and int(fill[0]) > 0 and pf == plain, f'{fill} {pf == plain}')
    _, nerr = serve('ram-nodrive', {'LLAMA_MOE_RAM_CACHE_MIB': '256'})
    check('without the drive tier it says NOT USED', 'LLAMA_MOE_RAM_CACHE_MIB NOT USED' in nerr)
    print(f'info: on {r[-1:]}, tiny {rt[-1:]}, plain {rp[-1:]}, map {rm[-1:]}, fill {fill}')
finally:
    rpc.kill()
print('ALL PASS' if fails == 0 else f'{fails} FAILED')
sys.exit(1 if fails else 0)
